import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../乘法猫猫乐园.html', import.meta.url), 'utf8');

function harness(bridge = {}) {
  const elements = new Map(), timers = [], messages = [], saved = [];
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, { value: '', style: {}, attributes: {}, listeners: {}, classList: {
        add(name) { classes.add(name); }, remove(name) { classes.delete(name); },
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
        contains(name) { return classes.has(name); }
      }, setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, listener) { this.listeners[name] = listener; },
      focus() {}, textContent: '', innerHTML: '' });
    }
    return elements.get(id);
  };
  const context = vm.createContext({
    document: { getElementById: element }, Date, Math, crypto, console,
    CloudGame: { enabled: true, action: async () => ({ id: 'round-id' }),
      question: async () => ({ id: 'question-id' }), ...bridge },
    state: { fish: 0, stats: {}, daily: {}, review: {}, best: 0 },
    setTimeout: callback => timers.push(callback), clearTimeout() {},
    setInterval: callback => timers.push(callback), clearInterval() {},
    toast: message => messages.push(message), save() { saved.push(JSON.stringify(context.state)); },
    weightedPick: () => [2, 3], factKey: (a, b) => `${Math.min(a,b)}x${Math.max(a,b)}`,
    todayKey: () => '2026-09-26', activeCat: () => null, catSVG() {},
    sDing() {}, sCombo() {}, sWrong() {}, sFanfare() {}, speak() {},
    showScreen() {}, renderHome() {}, confetti() {}, floatEmo() {},
    catName: () => '小猫', esc: value => value, kouJue: () => '二三得六'
  });
  const statCode = html.slice(html.indexOf('function statOf('), html.indexOf('function weightedPick('));
  const roundCode = html.slice(html.indexOf('const TRAIN_N ='), html.indexOf('// 全局键盘'));
  vm.runInContext(statCode + roundCode, context);
  return { context, timers, messages, saved, element,
    run: code => vm.runInContext(code, context),
    session: () => vm.runInContext('session', context) };
}

test('cloud rewards are credited once and duplicate clicks do not submit twice', async () => {
  let release, calls = 0;
  const h = harness({ answer: async () => {
    calls++;
    await new Promise(resolve => { release = resolve; });
    h.context.state.fish++;
    return { right: true, firstTry: true, gain: 1 };
  } });
  await h.run("startRound('train')"); h.element('answerInput').value = '6';
  const pending = h.run('submitAnswer()');
  assert.equal(h.element('answer-submit').disabled, true);
  assert.equal(h.element('answer-submit').classList.contains('loading'), true);
  assert.equal(h.element('answer-submit').attributes['aria-busy'], 'true');
  assert.equal(h.element('answerInput').readOnly, true);
  await h.run('submitAnswer()'); assert.equal(calls, 1);
  let prevented = false;
  h.element('answerInput').listeners.keydown({ key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(calls, 1);
  release(); await pending;
  assert.equal(h.element('answer-submit').classList.contains('loading'), false);
  assert.equal(h.element('answer-submit').attributes['aria-busy'], 'false');
  assert.equal(h.element('answer-submit').disabled, true);
  await h.run('submitAnswer()'); assert.equal(calls, 1);
  assert.equal(h.session().fish, 1);
  h.run('endRound()'); assert.equal(h.context.state.fish, 1);
  for (const timer of h.timers) timer();
  assert.equal(h.session(), null);
});

test('a lost answer response retries the same operation and preserves first-attempt stats', async () => {
  const payloads = [];
  const h = harness({ answer: async (_round, payload) => {
    payloads.push(JSON.parse(JSON.stringify(payload)));
    if (payloads.length === 1) throw new Error('连接中断');
    return { right: false, firstTry: true, gain: 0 };
  } });
  await h.run("startRound('train')"); h.element('answerInput').value = '5';
  await h.run('submitAnswer()'); assert.equal(h.context.state.stats['2x3'], undefined);
  assert.equal(h.element('answer-submit').disabled, false);
  assert.equal(h.element('answer-submit').classList.contains('loading'), false);
  assert.equal(h.element('answerInput').readOnly, false);
  h.element('answerInput').value = '6';
  await h.run('submitAnswer()');
  assert.deepEqual(payloads[0], payloads[1]);
  assert.equal(h.context.state.stats['2x3'].n, 1);
  assert.equal(h.context.state.stats['2x3'].wrongN, 1);
  assert.equal(h.context.state.review['2x3'].left, 3);
  assert.equal(h.element('answer-submit').disabled, false);
});

test('question loading disables submission and recovers after a failed request', async () => {
  let release, fail = false;
  const h = harness({ question: async () => {
    await new Promise(resolve => { release = resolve; });
    if (fail) throw new Error('网络错误');
    return { id: 'question-id' };
  } });
  const starting = h.run("startRound('train')");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.element('answer-submit').disabled, true);
  assert.equal(h.element('answer-submit').attributes['aria-label'], '出题中');
  release(); await starting;
  assert.equal(h.element('answer-submit').disabled, false);
  fail = true;
  const next = h.run('nextQuestion()');
  assert.equal(h.element('answer-submit').classList.contains('loading'), true);
  release(); await next;
  assert.equal(h.element('answer-submit').disabled, false);
  assert.equal(h.element('answer-submit').classList.contains('loading'), false);
  fail = false;
  const retry = h.run('submitAnswer()');
  assert.equal(h.element('answer-submit').disabled, true);
  release(); await retry;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.element('answer-submit').disabled, false);
});

test('a failed final question can be retried and old timers cannot advance a new round', async () => {
  let calls = 0;
  const h = harness({ question: async () => {
    calls++; if (calls === 2) throw new Error('网络错误');
    return { id: `question-${calls}` };
  }, answer: async () => ({ right: true, firstTry: true, gain: 1 }) });
  await h.run("startRound('train')");
  h.run('session.queue = [[3,4]]');
  await h.run('nextQuestion()'); assert.deepEqual(Array.from(h.session().retryQuestion), [3,4]);
  await h.run('nextQuestion()'); assert.deepEqual(Array.from(h.session().current), [3,4]);
  h.element('answerInput').value = '12'; await h.run('submitAnswer()');
  h.run('endRound()'); await h.run("startRound('train')");
  const count = calls;
  for (const timer of h.timers) timer();
  assert.equal(calls, count);
});

test('challenge expiry waits for the in-flight answer before showing results', async () => {
  let release;
  const h = harness({ answer: async () => {
    await new Promise(resolve => { release = resolve; });
    h.context.state.fish++;
    return { right: true, firstTry: true, gain: 1 };
  } });
  await h.run("startRound('challenge')");
  h.element('answerInput').value = '6';
  const pending = h.run('submitAnswer()');
  h.run('session.endAt = 0'); h.timers[0]();
  assert.equal(h.session().pending, true);
  release(); await pending;
  assert.equal(h.session(), null); assert.equal(h.context.state.fish, 1);
});

test('legacy offline rounds still credit their rewards locally', async () => {
  const h = harness({ enabled: false });
  await h.run("startRound('train')"); h.element('answerInput').value = '6';
  await h.run('submitAnswer()'); h.run('endRound()');
  assert.equal(h.context.state.fish, 1);
});

test('game scripts parse and account controls referenced by the bridge exist', () => {
  const inline = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new vm.Script(inline));
  const bridge = readFileSync(new URL('../cloud-game.js', import.meta.url), 'utf8');
  for (const match of bridge.matchAll(/element\('([^']+)'\)/g)) {
    assert.ok(html.includes(`id="${match[1]}"`), `missing ${match[1]}`);
  }
});
