import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fixture } from './helpers.mjs';

const source = readFileSync(new URL('../cloud-game.js', import.meta.url), 'utf8');
function bridge(f, cookie, protocol = 'http:') {
  const storage = new Map(), nodes = new Map(), classes = new Set(), timers = new Map();
  let timerId = 0, state = null;
  function element(id) {
    if (!nodes.has(id)) nodes.set(id, { hidden: false, classList: { toggle() {} },
      querySelectorAll: () => [], textContent: '', click() {} });
    return nodes.get(id);
  }
  const screen = { inert: false };
  const context = vm.createContext({ window: {}, document: { getElementById: element,
    querySelectorAll: selector => selector === '.screen' ? [screen] : [],
    body: { classList: { add: value => classes.add(value), remove: value => classes.delete(value) } } },
    location: { protocol, search: '', pathname: '/', reload() {} }, URLSearchParams,
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id), confirm: () => true,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key) },
    fetch: async (path, options) => {
      const result = await f.call(path, { cookie, method: options.method,
        body: options.body === undefined ? undefined : JSON.parse(options.body) });
      return Response.json(result.data, { status: result.status });
    }
  });
  vm.runInContext(source, context);
  const api = context.window.CloudGame;
  return { api, storage, element, screen, classes,
    async bootstrap() {
      const result = await api.bootstrap({ getState: () => state, showError() {} });
      if (result) state = result.state;
      return result;
    }, get state() { return state; }, context };
}

test('bridge locks unauthenticated screens and supports offline without network calls', async t => {
  const f = fixture(); t.after(f.close);
  const loggedOut = bridge(f);
  assert.equal(await loggedOut.bootstrap(), false);
  assert.equal(loggedOut.classes.has('auth-locked'), true);
  assert.equal(loggedOut.element('auth-local').hidden, false);
  const offline = bridge({ call() { throw new Error('network must not be called'); } }, undefined, 'file:');
  assert.equal(await offline.bootstrap(), null);
  assert.equal(offline.element('save-status').textContent, '保存在此浏览器');
});

test('bridge saves metadata, exposes owner privileges and blocks conflicting overwrites', async t => {
  const f = fixture(); t.after(f.close);
  const cookie = await f.login('owner'), client = bridge(f, cookie);
  const initial = await client.bootstrap(); assert.equal(initial.user.unlimitedFish, true);
  assert.equal(client.element('save-import').hidden, false);
  client.state.worldArea = 'park'; client.api.save(client.state); await client.api.flush();
  const cloud = (await f.call('/api/save', { cookie })).data;
  assert.equal(cloud.state.worldArea, 'park'); assert.equal(cloud.revision, 1);
  await f.call('/api/save', { cookie, method: 'PUT', body: cloud });
  client.state.worldArea = 'home'; client.api.save(client.state);
  await assert.rejects(client.api.flush(), error => error.code === 'save_conflict');
  assert.equal(client.element('save-reload').hidden, false);
  const cached = JSON.parse(client.storage.get(`cat-cloud-v1:${initial.user.id}`));
  assert.equal(cached.pending, true); assert.equal(cached.state.worldArea, 'home');
  await assert.rejects(client.api.flush());
  assert.equal((await f.call('/api/save', { cookie })).data.state.worldArea, 'park');
});

test('bridge preserves an ambiguous purchase and requires reload before another purchase', async t => {
  const f = fixture(); t.after(f.close);
  const cookie = await f.login('owner'), client = bridge(f, cookie);
  await client.bootstrap();
  const fetch = client.context.fetch;
  let requests = 0;
  client.context.fetch = async (path, options) => {
    if (path === '/api/adopt') { requests++; await fetch(path, options); throw new Error('lost response'); }
    return fetch(path, options);
  };
  const { breeds } = await import('../server/state.mjs');
  await assert.rejects(client.api.action('adopt', { breed: breeds[0], requestId: crypto.randomUUID() }));
  await assert.rejects(client.api.action('adopt', { breed: breeds[1], requestId: crypto.randomUUID() }));
  assert.equal(requests, 1); assert.equal(client.screen.inert, false);
  assert.equal((await f.call('/api/save', { cookie })).data.state.cats.length, 1);
  assert.equal(client.element('save-reload').hidden, false);
});
