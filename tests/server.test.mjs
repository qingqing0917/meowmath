import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './helpers.mjs';
import { breeds, initialState } from '../server/state.mjs';
import { SignJWT, jwtVerify, generateKeyPair, exportJWK } from 'jose';

const id = () => crypto.randomUUID();
async function adopt(f, cookie) {
  const save = (await f.call('/api/save', { cookie })).data;
  const result = await f.call('/api/adopt', { cookie,
    body: { breed: breeds[0], revision: save.revision, requestId: id() } });
  assert.equal(result.status, 200);
  return result.data;
}
async function round(f, cookie) {
  const result = await f.call('/api/rounds', { cookie, body: { mode: 'train' } });
  assert.equal(result.status, 200);
  return result.data.id;
}
async function question(f, cookie, roundId, a = 2, b = 3) {
  const result = await f.call(`/api/rounds/${roundId}/question`, { cookie, body: { a, b } });
  assert.equal(result.status, 200);
  return result.data.id;
}
async function answer(f, cookie, roundId, questionId, value, requestId = id(), revision) {
  revision ??= (await f.call('/api/save', { cookie })).data.revision;
  return f.call(`/api/rounds/${roundId}/answer`, { cookie,
    body: { questionId, answer: value, requestId, revision } });
}

test('authentication, CSRF, and local bypass restrictions', async t => {
  const f = fixture(); t.after(f.close);
  assert.equal((await f.call('/api/save')).status, 401);
  assert.equal((await f.call('/auth/local', { body: { account: 'owner' }, origin: 'https://evil.test',
    host: 'http://127.0.0.1:8787' })).status, 403);
  assert.equal((await f.call('/auth/local', { body: { account: 'someone', email: f.env.OWNER_EMAIL } })).status, 400);
  assert.equal((await f.call('/auth/local', { body: null })).status, 400);
  assert.equal((await f.call('/auth/local', { body: { account: 'owner' },
    host: 'https://game.test', origin: 'https://game.test' })).status, 404);
  f.env.APP_ENV = 'production';
  assert.equal((await f.call('/auth/local', { body: { account: 'owner' } })).status, 404);
  const session = await f.call('/api/session');
  assert.equal(session.data.localMode, false);
  assert.equal(session.headers.get('Cache-Control'), 'no-store');
});

test('accounts have isolated saves and only the verified owner gets unlimited fish', async t => {
  const f = fixture(); t.after(f.close);
  const owner = await f.login('owner'), player = await f.login();
  assert.equal((await f.call('/api/session', { cookie: owner })).data.user.unlimitedFish, true);
  assert.equal((await f.call('/api/session', { cookie: player })).data.user.unlimitedFish, false);
  const owned = await adopt(f, owner);
  assert.equal(owned.state.cats.length, 1);
  assert.equal((await f.call('/api/save', { cookie: player })).data.state.cats.length, 0);
  assert.equal((await f.call('/api/import', { cookie: player,
    body: { state: owned.state, revision: 0 } })).status, 403);
  f.sqlite.prepare('UPDATE users SET email_verified=0 WHERE email=?').run(f.env.OWNER_EMAIL);
  assert.equal((await f.call('/api/session', { cookie: owner })).data.user.unlimitedFish, false);
});

test('ordinary saves cannot mint currency or growth; optimistic revisions protect other tabs', async t => {
  const f = fixture(); t.after(f.close);
  const cookie = await f.login();
  const data = await adopt(f, cookie);
  data.state.fish = 999999; data.state.unlimitedFish = true;
  data.state.cats[0].name = '小猫';
  const saved = await f.call('/api/save', { cookie, method: 'PUT', body: data });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.state.fish, 0);
  assert.equal(saved.data.state.unlimitedFish, undefined);
  assert.equal(saved.data.state.cats[0].name, '小猫');
  assert.equal((await f.call('/api/save', { cookie, method: 'PUT', body: data })).status, 409);
  saved.data.state.cats[0].xp = 1000;
  const fake = await f.call('/api/save', { cookie, method: 'PUT', body: saved.data });
  assert.equal(fake.data.code, 'protected_progress');
  assert.equal((await f.call('/api/feed', { cookie,
    body: { catIndex: 0, foodId: 'fish', revision: saved.data.revision, requestId: id() } })).data.code, 'insufficient_fish');
});

test('answer rewards, retry correctness, combo rewards and replay protection', async t => {
  const f = fixture(); t.after(f.close);
  const cookie = await f.login(), roundId = await round(f, cookie);
  let qid = await question(f, cookie, roundId);
  assert.equal(await question(f, cookie, roundId), qid);
  const requestId = id();
  const first = await answer(f, cookie, roundId, qid, 6, requestId);
  assert.equal(first.status, 200); assert.equal(first.data.gain, 1);
  const repeat = await answer(f, cookie, roundId, qid, 6, requestId, 0);
  assert.equal(repeat.status, 200); assert.equal(repeat.data.state.fish, 1);
  assert.equal((await answer(f, cookie, roundId, qid, 6)).status, 400);
  for (let i = 0; i < 4; i++) {
    qid = await question(f, cookie, roundId);
    const result = await answer(f, cookie, roundId, qid, 6);
    assert.equal(result.data.gain, i === 3 ? 4 : 1);
  }
  assert.equal((await f.call('/api/save', { cookie })).data.state.fish, 8);
  qid = await question(f, cookie, roundId);
  assert.equal((await answer(f, cookie, roundId, qid, 5)).data.gain, 0);
  const retried = await answer(f, cookie, roundId, qid, 6);
  assert.equal(retried.data.firstTry, false); assert.equal(retried.data.gain, 1);
  qid = await question(f, cookie, roundId);
  await answer(f, cookie, roundId, qid, 5);
  assert.equal((await answer(f, cookie, roundId, qid, 4)).data.right, false);
  assert.equal((await answer(f, cookie, roundId, qid, 6)).status, 400);
  await question(f, cookie, roundId);
  const other = await f.login('owner');
  assert.equal((await answer(f, other, roundId, qid, 6)).status, 400);
});

test('feeding is authoritative, charges a player once, and is free for the owner', async t => {
  const f = fixture(); t.after(f.close);
  const player = await f.login(); await adopt(f, player);
  const roundId = await round(f, player);
  for (let i = 0; i < 3; i++) await answer(f, player, roundId, await question(f, player, roundId), 6);
  const revision = (await f.call('/api/save', { cookie: player })).data.revision;
  const body = { catIndex: 0, foodId: 'fish', revision, requestId: id() };
  const result = await f.call('/api/feed', { cookie: player, body });
  assert.equal(result.status, 200); assert.equal(result.data.state.fish, 0);
  assert.equal(result.data.state.cats[0].xp, 10);
  assert.equal((await f.call('/api/feed', { cookie: player, body })).data.state.cats[0].xp, 10);
  const owner = await f.login('owner'); let owned = await adopt(f, owner);
  for (let i = 0; i < 3; i++) {
    const fed = await f.call('/api/feed', { cookie: owner,
      body: { catIndex: 0, foodId: 'fish', revision: owned.revision, requestId: id() } });
    assert.equal(fed.status, 200); owned = fed.data;
  }
  assert.equal(owned.state.fish, 0); assert.equal(owned.state.cats[0].stage, 1);
  assert.equal(owned.state.cats[0].xp, 30);
});

test('owner import and reset are isolated; logout revokes the session', async t => {
  const f = fixture(); t.after(f.close);
  const owner = await f.login('owner'), player = await f.login();
  const state = initialState(); state.cats = [{ breed: breeds[0], xp: 42, stage: 1 }]; state.fish = 12;
  const imported = await f.call('/api/import', { cookie: owner, body: { state, revision: 0 } });
  assert.equal(imported.status, 200); assert.equal(imported.data.state.cats[0].xp, 42);
  assert.equal((await f.call('/api/save', { cookie: player })).data.state.fish, 0);
  const reset = await f.call('/api/reset', { cookie: owner, body: { revision: imported.data.revision } });
  assert.equal(reset.data.state.cats.length, 0); assert.equal(reset.data.state.fish, 0);
  await f.call('/auth/logout', { cookie: owner, body: {} });
  assert.equal((await f.call('/api/save', { cookie: owner })).status, 401);
});

test('Google authorization uses signed state, PKCE, and nonce; invalid callbacks cannot log in', async t => {
  const f = fixture(); t.after(f.close);
  assert.equal((await f.call('/auth/google')).status, 503);
  Object.assign(f.env, { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret',
    SESSION_SECRET: 'test-session-secret-with-at-least-32-chars' });
  const start = await f.call('/auth/google'); assert.equal(start.status, 302);
  const url = new URL(start.headers.get('Location'));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const oauthCookie = start.headers.get('Set-Cookie').split(';')[0];
  const { payload } = await jwtVerify(oauthCookie.slice('cat_oauth='.length), new TextEncoder().encode(f.env.SESSION_SECRET));
  assert.equal(url.searchParams.get('state'), payload.state);
  assert.equal(url.searchParams.get('nonce'), payload.nonce);
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:8787/auth/google/callback');
  const bad = await f.call('/auth/google/callback?state=bad&code=bad', { cookie: oauthCookie });
  assert.equal(bad.headers.get('Location'), 'http://127.0.0.1:8787/?login_error=1');
  assert.equal(bad.headers.get('Set-Cookie').includes('cat_session='), false);
  const forged = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' })
    .sign(new TextEncoder().encode('a-different-key-with-at-least-32-characters'));
  assert.equal((await f.call('/auth/google/callback?state=bad&code=bad', {
    cookie: 'cat_oauth=' + forged })).headers.get('Location').endsWith('login_error=1'), true);
});

test('Google callback verifies signed identity and refuses forged or unverified tokens', async t => {
  const f = fixture(); t.after(f.close);
  Object.assign(f.env, { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret',
    SESSION_SECRET: 'test-session-secret-with-at-least-32-chars' });
  const key = await generateKeyPair('RS256', { extractable: true });
  const forgedKey = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(key.publicKey), kid: 'google-test', alg: 'RS256', use: 'sig' };
  let nonce, verifier, signingKey = key.privateKey, verified = true, email = f.env.OWNER_EMAIL;
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    if (String(url) === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] });
    assert.equal(String(url), 'https://oauth2.googleapis.com/token');
    const form = new URLSearchParams(options.body);
    assert.equal(form.get('client_secret'), 'test-secret');
    assert.equal(form.get('code_verifier'), verifier);
    const token = await new SignJWT({ nonce, email, email_verified: verified, name: '测试账号' })
      .setProtectedHeader({ alg: 'RS256', kid: 'google-test' }).setIssuer('https://accounts.google.com')
      .setAudience('test-client').setSubject('google-subject').setIssuedAt().setExpirationTime('5m').sign(signingKey);
    return Response.json({ access_token: 'test-access-token', token_type: 'Bearer', expires_in: 3600, id_token: token });
  };
  async function callback() {
    const start = await f.call('/auth/google');
    const cookie = start.headers.get('Set-Cookie').split(';')[0];
    const { payload } = await jwtVerify(cookie.slice('cat_oauth='.length), new TextEncoder().encode(f.env.SESSION_SECRET));
    nonce = payload.nonce; verifier = payload.verifier;
    return f.call(`/auth/google/callback?state=${payload.state}&code=test-code`, { cookie });
  }
  const success = await callback();
  assert.equal(success.headers.get('Location'), 'http://127.0.0.1:8787/');
  const sessionCookie = success.headers.get('Set-Cookie').match(/cat_session=[^;,]+/)[0];
  assert.equal((await f.call('/api/session', { cookie: sessionCookie })).data.user.unlimitedFish, true);
  signingKey = forgedKey.privateKey;
  assert.equal((await callback()).headers.get('Location').endsWith('login_error=1'), true);
  signingKey = key.privateKey; verified = false;
  assert.equal((await callback()).headers.get('Location').endsWith('login_error=1'), true);
  verified = true; email = 'someone@gmail.com';
  const regular = await callback();
  const regularCookie = regular.headers.get('Set-Cookie').match(/cat_session=[^;,]+/)[0];
  assert.equal((await f.call('/api/session', { cookie: regularCookie })).data.user.unlimitedFish, false);
});
