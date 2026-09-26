import rules from './generated/rules.json' with { type: 'json' };

export const { breeds, foods, stages } = rules;
export class ApiError extends Error {
  constructor(status, message, code = 'invalid_request') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function initialState() {
  return { fish: 0, fishClearedOnce: true, customNamesClearedOnce: true,
    cats: [], activeCat: 0, sleeping: false, stats: {}, review: {}, daily: {},
    best: 0, worldArea: 'home', schemaVersion: 1 };
}
const integer = (value, max = 1000000) => Number.isInteger(value) && value >= 0 && value <= max;
function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
export function validateState(input) {
  if (!record(input) || !Array.isArray(input.cats) || input.cats.length > breeds.length) {
    throw new ApiError(400, '存档格式不正确');
  }
  const seen = new Set();
  const cats = input.cats.map(cat => {
    if (!record(cat) || !breeds.includes(cat.breed) || seen.has(cat.breed) ||
      !integer(cat.xp, 100000) || !integer(cat.stage, 4)) throw new ApiError(400, '猫咪数据不正确');
    seen.add(cat.breed);
    const result = { breed: cat.breed, xp: cat.xp, stage: cat.stage };
    if (cat.name !== undefined) {
      if (typeof cat.name !== 'string' || cat.name.length > 8) throw new ApiError(400, '名字不能超过八个字');
      if (cat.name.trim()) result.name = cat.name.trim();
    }
    if (cat.sex !== undefined) {
      if (!['boy', 'girl'].includes(cat.sex)) throw new ApiError(400, '猫咪性别不正确');
      result.sex = cat.sex;
    }
    return result;
  });
  const state = initialState();
  state.cats = cats;
  state.activeCat = integer(input.activeCat, Math.max(0, cats.length - 1)) ? input.activeCat : 0;
  state.sleeping = input.sleeping === true;
  state.best = integer(input.best) ? input.best : 0;
  state.worldArea = input.worldArea === 'park' ? 'park' : 'home';
  for (const field of ['stats', 'review', 'daily']) {
    const source = input[field] || {};
    if (!record(source) || Object.keys(source).length > (field === 'daily' ? 10000 : 36)) {
      throw new ApiError(400, '学习记录过多或格式不正确');
    }
    for (const [key, value] of Object.entries(source)) {
      if (!record(value)) throw new ApiError(400, '学习记录格式不正确');
      if (field === 'daily') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new ApiError(400, '日期格式不正确');
        const day = {};
        for (const name of ['n', 'c', 'timeSum', 'timeN']) {
          if (!integer(value[name], 10000000000)) throw new ApiError(400, '每日记录不正确');
          day[name] = value[name];
        }
        state.daily[key] = day;
      } else {
        if (!/^[2-9]x[2-9]$/.test(key) || Number(key[0]) > Number(key[2])) {
          throw new ApiError(400, '口诀记录不正确');
        }
        if (field === 'review') {
          if (!integer(value.left, 3)) throw new ApiError(400, '错题记录不正确');
          state.review[key] = { left: value.left };
        } else {
          const stat = {};
          for (const name of ['n', 'c', 'streak', 'wrongN']) {
            if (!integer(value[name])) throw new ApiError(400, '答题记录不正确');
            stat[name] = value[name];
          }
          if (!Array.isArray(value.times) || value.times.length > 10 ||
            !value.times.every(time => integer(time, 15000))) throw new ApiError(400, '答题时间不正确');
          stat.times = [...value.times];
          state.stats[key] = stat;
        }
      }
    }
  }
  return state;
}
export function editableState(input, existing) {
  const next = validateState(input);
  if (next.cats.length !== existing.cats.length || next.cats.some((cat, index) => {
    const old = existing.cats[index];
    return cat.breed !== old.breed || cat.xp !== old.xp || cat.stage !== old.stage;
  })) throw new ApiError(400, '领养和成长需要通过游戏操作保存', 'protected_progress');
  return next;
}
export function isOwner(user, env) {
  return user.email_verified === 1 && user.email.toLowerCase() === env.OWNER_EMAIL?.toLowerCase();
}
export function isLocal(request, env) {
  const url = new URL(request.url);
  return env.APP_ENV === 'local' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}
