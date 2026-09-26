const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '乘法猫猫乐园.html'), 'utf8');
const code = html.slice(html.indexOf('const VILLAGE_SLOTS ='), html.indexOf('function openSnackShop()'));

function descendants(element) {
  return element.children.flatMap(child => [child, ...descendants(child)]);
}
class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.parent = null;
    this.dataset = {};
    this.classes = new Set();
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.attributes = {};
    this.classList = {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      remove: (...names) => names.forEach(name => this.classes.delete(name)),
      contains: name => this.classes.has(name),
      toggle: (name, value) => value ? this.classes.add(name) : this.classes.delete(name)
    };
  }
  set className(value) { this.classes = new Set(value.split(' ')); }
  set innerHTML(value) {
    this.markup = value;
    this.replaceChildren();
    if (value.includes('<svg')) this.appendChild(new Element('svg'));
    if (value.includes('class="v-house-runner"')) {
      const runner = new Element('span');
      runner.className = 'v-house-runner';
      this.appendChild(runner);
    }
  }
  get innerHTML() { return this.markup || ''; }
  appendChild(child) {
    child.remove();
    child.parent = this;
    this.children.push(child);
  }
  replaceChildren(...children) {
    for (const child of [...this.children]) child.remove();
    for (const child of children) this.appendChild(child);
  }
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  querySelector(selector) {
    return descendants(this).find(child => selector === 'svg' ? child.tag === 'svg'
      : child.classes.has(selector.slice(1))) || null;
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener() {}
  getBoundingClientRect() {
    const index = this.dataset.house ?? this.dataset.catIndex ?? 0;
    return { left: Number(index) * 50, top: 0, width: 50, height: 80 };
  }
}

function village(count = 1) {
  const ids = new Map(), timers = [], messages = [];
  const element = id => {
    if (!ids.has(id)) ids.set(id, new Element());
    return ids.get(id);
  };
  const plaza = Array.from({ length: 5 }, (_, index) => {
    const house = new Element('button');
    house.className = 'v-house'; house.dataset.house = index;
    return house;
  });
  const houses = () => [...plaza, ...element('village-house-grid').children];
  const wrap = element('village-cats');
  const context = vm.createContext({
    document: {
      getElementById: element, createElement: tag => new Element(tag),
      querySelectorAll(selector) {
        if (selector === '.v-house') return houses();
        if (selector === '#village-cats .v-cat') return descendants(wrap).filter(el => el.classes.has('v-cat'));
        throw new Error(`Unexpected selector: ${selector}`);
      },
      querySelector(selector) {
        const match = selector.match(/^\.v-house\[data-house="(\d+)"\]$/);
        return match ? houses().find(house => Number(house.dataset.house) === Number(match[1])) : null;
      }
    },
    state: { cats: Array.from({ length: count }, (_, i) => ({ breed: `cat-${i}`, stage: 0, xp: 0 })) },
    BREED_ORDER: Array.from({ length: 100 }),
    catSVG: (breed, stage) => `<svg data-breed="${breed}" data-stage="${stage}"></svg>`,
    catName: cat => cat.breed, toast: text => messages.push(text),
    sMeow() {}, purr() {}, floatEmo() {},
    setTimeout: callback => timers.push(callback)
  });
  vm.runInContext(code, context);
  const run = source => vm.runInContext(source, context);
  run('renderVillage()');
  return { context, run, wrap, houses, messages,
    house: index => houses().find(house => Number(house.dataset.house) === index),
    cats: () => [...descendants(wrap), ...descendants(element('village-house-grid'))]
      .filter(el => el.classes.has('v-cat')),
    occupants: () => Array.from(run('villageHouseOccupants.entries()')),
    finish() { while (timers.length) timers.shift()(); }
  };
}

test('entering and leaving many houses never duplicates the village cat', () => {
  const v = village();
  const original = JSON.stringify(v.context.state.cats);
  for (const houseIndex of [5, 6, 7, 5, 10, 30]) {
    const cat = v.cats()[0];
    v.run(`visitVillageHouse(${houseIndex})`);
    const runner = v.house(houseIndex).querySelector('.v-house-runner');
    assert.equal(runner.children[0], cat, 'the animation must use the original cat element');
    assert.equal(v.cats().length, 1);
    assert.equal(v.wrap.children.length, 0, 'no second cat stays on the grass during the animation');
    v.finish();
    assert.equal(runner.children.length, 0);
    assert.equal(v.cats().length, 1);
    assert.equal(v.cats()[0].classList.contains('in-house'), true);
    v.run(`visitVillageHouse(${houseIndex})`);
    assert.equal(v.cats().length, 1);
    v.finish();
    assert.equal(runner.children.length, 0, 'the exit animation must leave no cat image behind');
    assert.equal(runner.classList.contains('leaving'), false);
    assert.equal(v.cats().length, 1);
    assert.equal(v.cats()[0].classList.contains('in-house'), false);
    assert.equal(v.occupants().length, 0);
  }
  assert.equal(JSON.stringify(v.context.state.cats), original);
});

test('each house has one cat and an already housed cat cannot enter another house', () => {
  const v = village(2);
  v.run('visitVillageHouse(5)');
  v.run('visitVillageHouse(6)');
  assert.equal(v.occupants().length, 1, 'repeated clicks during movement must not duplicate residents');
  v.finish();
  v.run('visitVillageHouse(6)'); v.finish();
  const occupants = v.occupants();
  assert.equal(occupants.length, 2);
  assert.equal(new Set(occupants.map(([, cat]) => cat)).size, 2);
  v.run('visitVillageHouse(7)');
  assert.deepEqual(v.occupants(), occupants);
  assert.equal(v.cats().length, 2);
  assert.equal(v.house(7).classList.contains('occupied'), false);
  v.run('visitVillageHouse(5)'); v.finish();
  v.run('visitVillageHouse(7)'); v.finish();
  assert.equal(v.house(5).classList.contains('occupied'), false);
  assert.equal(v.house(7).classList.contains('occupied'), true);
  assert.equal(new Set(v.occupants().map(([, cat]) => cat)).size, 2);
  assert.equal(v.context.state.cats.length, 2);
});

test('rendering during movement keeps the one moving cat and refreshes after it arrives', () => {
  const v = village();
  const cat = v.cats()[0];
  v.run('visitVillageHouse(5)');
  v.context.state.cats[0].stage = 1;
  v.run('renderVillage()');
  assert.equal(v.cats()[0], cat);
  assert.equal(v.cats().length, 1);
  v.finish();
  assert.equal(v.cats().length, 1);
  assert.ok(v.cats()[0].innerHTML.includes('data-stage="1"'));
  assert.equal(v.house(5).querySelector('.v-house-runner').children.length, 0);
});

test('plaza houses and page changes preserve unique residents', () => {
  const v = village(9);
  v.run('visitVillageHouse(0)'); v.finish();
  assert.equal(v.occupants().length, 1);
  v.run('visitVillageHouse(0)'); v.finish();
  assert.equal(v.occupants().length, 0);
  for (let house = 5; house < 14; house++) {
    v.run(`visitVillageHouse(${house})`); v.finish();
    assert.equal(v.house(house).querySelector('.v-house-runner').children.length, 0);
  }
  assert.equal(v.occupants().length, 9);
  assert.equal(new Set(v.occupants().map(([, cat]) => cat)).size, 9);
  v.run('visitVillageHouse(20)'); v.finish();
  assert.equal(v.occupants().length, 9);
  assert.equal(v.context.state.cats.length, 9);
});
