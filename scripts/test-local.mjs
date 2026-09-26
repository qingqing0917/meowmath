import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const origin = process.env.CAT_TEST_ORIGIN || 'http://127.0.0.1:8787';
async function call(path, cookie, body, method) {
  const response = await fetch(origin + path, { method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return { data, cookie: response.headers.get('Set-Cookie')?.split(';')[0] };
}
assert.equal((await call('/api/session')).data.localMode, true, 'Run against the local server only');
const page = await fetch(origin + '/');
assert.equal(page.status, 200);
assert.ok((await page.text()).includes('cloud-game.js'));
for (const file of ['cloud-game.js', 'cloud-game.css', 'cat-world.js', 'vendor/three.min.js']) {
  const response = await fetch(origin + '/' + file); assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
}
const rules = JSON.parse(readFileSync(new URL('../server/generated/rules.json', import.meta.url)));
const cookies = [];
try {
  for (const account of ['owner', 'player']) {
    const { cookie } = await call('/auth/local', undefined, { account }); cookies.push(cookie);
    const before = (await call('/api/save', cookie)).data;
    // Preserve existing local progress; only exercise purchases on a fresh test account.
    if (before.state.cats.length !== 0 || before.state.fish !== 0) {
      console.log(`${account}: existing progress preserved; login/save read checked`); continue;
    }
    const adopted = (await call('/api/adopt', cookie, {
      breed: rules.breeds[0], requestId: crypto.randomUUID(), revision: before.revision
    })).data;
    assert.equal(adopted.state.cats.length, 1);
    const round = (await call('/api/rounds', cookie, { mode: 'train' })).data;
    const q = (await call(`/api/rounds/${round.id}/question`, cookie, { a: 2, b: 3 })).data;
    const requestId = crypto.randomUUID();
    const answered = (await call(`/api/rounds/${round.id}/answer`, cookie, {
      questionId: q.id, answer: 6, revision: adopted.revision, requestId
    })).data;
    assert.equal(answered.state.fish, 1);
    assert.equal((await call(`/api/rounds/${round.id}/answer`, cookie, {
      questionId: q.id, answer: 6, revision: adopted.revision, requestId
    })).data.state.fish, 1);
    if (account === 'owner') {
      const fed = (await call('/api/feed', cookie, { catIndex: 0, foodId: 'fish',
        revision: answered.revision, requestId: crypto.randomUUID() })).data;
      assert.equal(fed.state.cats[0].xp, 10); assert.equal(fed.state.fish, 1);
    }
    const current = (await call('/api/save', cookie)).data;
    const reset = (await call('/api/reset', cookie, { revision: current.revision })).data;
    assert.equal(reset.state.cats.length, 0); assert.equal(reset.state.fish, 0);
    console.log(`${account}: login, adoption, answer, replay and reset passed`);
  }
} finally {
  for (const cookie of cookies) await call('/auth/logout', cookie, {});
}
console.log('Local Wrangler/D1 HTTP checks passed.');
