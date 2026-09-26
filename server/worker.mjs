import { ApiError, initialState, validateState, editableState, breeds, foods, stages,
  isOwner, isLocal } from './state.mjs';
import { authenticate, publicUser, authRoute, now } from './auth.mjs';

async function jsonInput(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) {
    throw new ApiError(415, '请使用 JSON 请求');
  }
  const text = await request.text();
  if (text.length > 1000000) throw new ApiError(413, '存档文件太大');
  try {
    const input = JSON.parse(text);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid object');
    return input;
  } catch { throw new ApiError(400, '请求格式不正确'); }
}
function requireOrigin(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) {
    throw new ApiError(403, '请求来源不正确', 'invalid_origin');
  }
}
async function getSave(env, user) {
  const row = await env.DB.prepare('SELECT * FROM saves WHERE user_id = ?').bind(user.id).first();
  if (!row) throw new ApiError(500, '存档尚未创建');
  return row;
}
function saveResponse(row) {
  return { state: { ...JSON.parse(row.state_json), fish: row.fish },
    revision: row.revision, updatedAt: row.updated_at };
}
function checkRevision(input, row) {
  if (!Number.isInteger(input.revision) || input.revision !== row.revision) {
    throw new ApiError(409, '另一个页面已更新进度，请重新加载最新存档', 'save_conflict');
  }
}
function requestId(input) {
  if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9-]{20,80}$/.test(input.requestId)) {
    throw new ApiError(400, '操作编号不正确');
  }
  return input.requestId;
}
async function previousOperation(env, user, id, kind) {
  const op = await env.DB.prepare('SELECT * FROM operations WHERE user_id=? AND request_id=?')
    .bind(user.id, id).first();
  if (op && op.kind !== kind) throw new ApiError(400, '操作编号已使用');
  return op;
}
async function writeSave(env, user, row, state, fish = row.fish, operation) {
  const statements = [env.DB.prepare(`UPDATE saves SET state_json=?, fish=?,
    revision=revision+1, updated_at=? WHERE user_id=? AND revision=?`)
    .bind(JSON.stringify(state), fish, now(), user.id, row.revision)];
  if (operation) statements.push(env.DB.prepare(`INSERT INTO operations
    (user_id, request_id, kind, created_at) SELECT ?, ?, ?, ? WHERE changes()=1`)
    .bind(user.id, operation.id, operation.kind, now()));
  const result = await env.DB.batch(statements);
  if (result[0].meta.changes !== 1) throw new ApiError(409, '存档已更新，请重新加载', 'save_conflict');
  return saveResponse(await getSave(env, user));
}
async function api(request, env, path) {
  if (path === '/api/session' && request.method === 'GET') {
    return { user: publicUser(await authenticate(request, env, false), env),
      localMode: isLocal(request, env),
      googleConfigured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET?.length >= 32 &&
        (isLocal(request, env) || env.PUBLIC_ORIGIN)) };
  }
  const user = await authenticate(request, env);
  if (path === '/api/save' && request.method === 'GET') return saveResponse(await getSave(env, user));
  const input = await jsonInput(request);
  if (path === '/api/save' && request.method === 'PUT') {
    const row = await getSave(env, user);
    checkRevision(input, row);
    return writeSave(env, user, row, editableState(input.state, JSON.parse(row.state_json)));
  }
  if (path === '/api/reset' && request.method === 'POST') {
    const row = await getSave(env, user);
    checkRevision(input, row);
    return writeSave(env, user, row, initialState(), 0);
  }
  if (path === '/api/import' && request.method === 'POST') {
    if (!isOwner(user, env)) throw new ApiError(403, '旧版存档导入仅供你的专属账号使用');
    const row = await getSave(env, user);
    checkRevision(input, row);
    const state = validateState(input.state);
    const fish = Number.isInteger(input.state.fish) ? Math.max(0, Math.min(1000000, input.state.fish)) : 0;
    return writeSave(env, user, row, state, fish);
  }
  if (['/api/adopt', '/api/feed'].includes(path) && request.method === 'POST') {
    const id = requestId(input);
    const old = await previousOperation(env, user, id, path);
    if (old) return saveResponse(await getSave(env, user));
    const row = await getSave(env, user);
    checkRevision(input, row);
    const state = JSON.parse(row.state_json);
    let fish = row.fish;
    if (path === '/api/adopt') {
      if (!breeds.includes(input.breed) || state.cats.some(cat => cat.breed === input.breed)) {
        throw new ApiError(400, '这个品种不能再次领养');
      }
      if (state.cats.length >= 1 + state.cats.filter(cat => cat.stage >= 4).length) {
        throw new ApiError(400, '先把一只猫咪养成闪光猫，再领养新伙伴');
      }
      state.cats.push({ breed: input.breed, xp: 0, stage: 0 });
      state.activeCat = state.cats.length - 1;
    } else {
      const food = Object.hasOwn(foods, input.foodId) ? foods[input.foodId] : null;
      const cat = Number.isInteger(input.catIndex) ? state.cats[input.catIndex] : null;
      if (!food || !cat || cat.stage >= 4 || state.sleeping) throw new ApiError(400, '现在不能喂这只猫咪');
      if (!isOwner(user, env)) {
        if (fish < food.cost) throw new ApiError(400, '小鱼干不够啦，去答题赚一些吧！', 'insufficient_fish');
        fish -= food.cost;
      }
      cat.xp += food.xp;
      if (cat.xp >= stages[cat.stage + 1]) cat.stage++;
    }
    return writeSave(env, user, row, state, fish, { id, kind: path });
  }
  if (path === '/api/rounds' && request.method === 'POST') {
    if (!['train', 'review', 'challenge'].includes(input.mode)) throw new ApiError(400, '答题模式不正确');
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM rounds WHERE user_id=? AND created_at>?')
      .bind(user.id, now() - 60).first();
    if (count.n >= 20) throw new ApiError(429, '休息一下，稍后再开始新一轮');
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO rounds (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind(id, user.id, now(), now() + (input.mode === 'challenge' ? 65 : 3600)).run();
    return { id };
  }
  const roundPath = path.match(/^\/api\/rounds\/([a-f0-9-]+)\/(question|answer)$/);
  if (roundPath && request.method === 'POST') {
    const round = await env.DB.prepare('SELECT * FROM rounds WHERE id=? AND user_id=?')
      .bind(roundPath[1], user.id).first();
    if (!round || round.expires_at <= now()) throw new ApiError(400, '这一轮已结束，请重新开始', 'round_expired');
    if (roundPath[2] === 'question') {
      if (![input.a, input.b].every(value => Number.isInteger(value) && value >= 2 && value <= 9)) {
        throw new ApiError(400, '题目不正确');
      }
      if (round.current_question_id) {
        const current = await env.DB.prepare('SELECT * FROM questions WHERE id=?').bind(round.current_question_id).first();
        if (current && !current.solved && current.attempts < 2) {
          if (current.a !== input.a || current.b !== input.b) throw new ApiError(409, '请先完成当前题目');
          return { id: current.id };
        }
      }
      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM questions WHERE round_id=?').bind(round.id).first();
      if (count.n >= 500) throw new ApiError(429, '这一轮题目太多，请重新开始');
      const id = crypto.randomUUID();
      const results = await env.DB.batch([
        env.DB.prepare(`INSERT INTO questions (id, round_id, a, b) SELECT ?, ?, ?, ?
          WHERE EXISTS(SELECT 1 FROM rounds WHERE id=? AND current_question_id IS ?)`)
          .bind(id, round.id, input.a, input.b, round.id, round.current_question_id),
        env.DB.prepare('UPDATE rounds SET current_question_id=? WHERE id=? AND changes()=1').bind(id, round.id)
      ]);
      if (results[0].meta.changes !== 1) throw new ApiError(409, '题目已更新，请重试');
      return { id };
    }
    const id = requestId(input);
    const old = await previousOperation(env, user, id, 'answer');
    if (old) return { ...JSON.parse(old.response_json), ...saveResponse(await getSave(env, user)) };
    const row = await getSave(env, user);
    checkRevision(input, row);
    const question = await env.DB.prepare('SELECT * FROM questions WHERE id=? AND round_id=?')
      .bind(input.questionId, round.id).first();
    if (!question || question.id !== round.current_question_id || question.solved || question.attempts >= 2 ||
      !Number.isInteger(input.answer) || input.answer < 0 || input.answer > 1000) {
      throw new ApiError(400, '这道题已提交或答案格式不正确');
    }
    const right = input.answer === question.a * question.b;
    const firstTry = question.attempts === 0;
    const combo = right && firstTry ? round.combo + 1 : right ? round.combo : 0;
    const gain = right ? 1 + (firstTry && combo % 5 === 0 ? 3 : 0) : 0;
    const answerResult = { right, firstTry, gain };
    const results = await env.DB.batch([
      env.DB.prepare(`UPDATE questions SET attempts=attempts+1, solved=?, reward=?
        WHERE id=? AND attempts=? AND solved=0 AND EXISTS
        (SELECT 1 FROM saves WHERE user_id=? AND revision=?)`)
        .bind(right ? 1 : 0, gain, question.id, question.attempts, user.id, row.revision),
      env.DB.prepare('UPDATE rounds SET combo=? WHERE id=? AND changes()=1').bind(combo, round.id),
      env.DB.prepare('UPDATE saves SET fish=fish+?, revision=revision+1, updated_at=? WHERE user_id=? AND changes()=1')
        .bind(gain, now(), user.id),
      env.DB.prepare(`INSERT INTO operations (user_id, request_id, kind, response_json, created_at)
        SELECT ?, ?, 'answer', ?, ? WHERE changes()=1`)
        .bind(user.id, id, JSON.stringify(answerResult), now())
    ]);
    if (results[0].meta.changes !== 1) throw new ApiError(409, '存档或答案已更新，请重新加载', 'save_conflict');
    return { ...answerResult, ...saveResponse(await getSave(env, user)) };
  }
  throw new ApiError(404, '接口不存在');
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/api/') && !path.startsWith('/auth/')) return env.ASSETS.fetch(request);
    let response;
    try {
      if (!['GET', 'HEAD'].includes(request.method)) requireOrigin(request);
      if (path.startsWith('/auth/')) {
        if (request.method === 'POST' && path === '/auth/local') {
          // Enforce body size and JSON format before the authentication handler consumes it.
          await jsonInput(request.clone());
        }
        response = await authRoute(request, env, path);
      } else response = Response.json(await api(request, env, path));
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('API failure:', error.name);
      response = Response.json({ error: error instanceof ApiError ? error.message : '服务暂时不可用，请稍后重试',
        code: error instanceof ApiError ? error.code : 'server_error' },
      { status: error instanceof ApiError ? error.status : 500 });
    }
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'same-origin');
    headers.set('X-Frame-Options', 'DENY');
    return new Response(response.body, { status: response.status, headers });
  }
};
