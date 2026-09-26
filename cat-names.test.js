const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '乘法猫猫乐园.html'), 'utf8');
const saveCode = html.slice(html.indexOf("const SAVE_KEY = 'multCatGame_v1';"),
  html.indexOf('function todayKey()'));

test('clears only custom cat names once and keeps the original breed data', () => {
  let stored = JSON.stringify({
    fish: 23, fishClearedOnce: true, activeCat: 1,
    cats: [
      { breed: 'tabby', name: '团团', xp: 42, stage: 2, sex: 'girl' },
      { breed: 'orange', name: '小橘', xp: 8, stage: 0 }
    ],
    stats: { '2x3': { n: 4, c: 3 } }
  });
  const context = vm.createContext({ localStorage: {
    getItem() { return stored; },
    setItem(_key, value) { stored = value; }
  } });
  vm.runInContext(saveCode, context);
  vm.runInContext('load()', context);
  const migrated = JSON.parse(stored);
  assert.equal(migrated.cats[0].name, undefined);
  assert.equal(migrated.cats[1].name, undefined);
  assert.equal(migrated.cats[0].breed, 'tabby');
  assert.equal(migrated.cats[0].xp, 42);
  assert.equal(migrated.cats[0].stage, 2);
  assert.equal(migrated.cats[0].sex, 'girl');
  assert.equal(migrated.fish, 23);
  assert.equal(migrated.stats['2x3'].n, 4);
  assert.equal(migrated.customNamesClearedOnce, true);

  migrated.cats[0].name = '新名字';
  stored = JSON.stringify(migrated);
  vm.runInContext('load()', context);
  assert.equal(JSON.parse(stored).cats[0].name, '新名字');
});
