const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const T = require('./vendor/three.min.js');

test('the furnished home and park initialize together', () => {
  const domElement = { addEventListener() {} };
  let scene, frame;
  T.WebGLRenderer = class {
    constructor() { this.domElement = domElement; this.shadowMap = {}; }
    setPixelRatio() {}
    setSize() {}
    render(current) { scene = current; }
  };
  T.Clock.prototype.getDelta = () => 1 / 60;
  const viewport = { clientWidth: 1000, clientHeight: 650, appendChild() {} };
  const action = { addEventListener() {}, setAttribute() {} };
  const host = {
    dataset: {},
    querySelector(selector) { return selector === '.world-canvas' ? viewport : action; },
    querySelectorAll() { return []; },
    addEventListener() {}, closest() { return {}; },
    getBoundingClientRect() { return { top: 0, bottom: 650 }; }
  };
  const context = vm.createContext({
    window: { THREE: T, devicePixelRatio: 1, innerWidth: 1000, innerHeight: 650,
      addEventListener() {} },
    document: { createElement: () => ({ width: 0, height: 0,
      getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) }) },
    requestAnimationFrame(callback) { frame = callback; }
  });
  for (const file of [
    'vendor/cannon.min.js', 'vendor/pathfinding-browser.min.js',
    'cat-navigation.js', 'cat-home.js', 'cat-world.js'
  ]) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context);

  const world = context.window.createCatWorld({ host, initialArea: 'home' });
  assert.equal(host.dataset.area, 'home');
  world.syncCat({ breed: 'tabby', stage: 2, sex: 'female' }, {
    base: '#c69063', belly: '#f3e3cf', stripe: '#8a5a34',
    pattern: 'stripes', eye: '#4a9e5f'
  });
  world.setArea('park');
  assert.equal(host.dataset.area, 'park');
  frame();
  const park = scene.children[1];
  const roads = park.children.filter(object => object.geometry?.type === 'BoxGeometry' &&
    ['756c59', 'bba98a'].includes(object.material.color.getHexString()));
  for (const road of roads) {
    const { width, depth } = road.geometry.parameters;
    const dx = Math.max(0, Math.abs(28 - road.position.x) - width / 2);
    const dz = Math.max(0, Math.abs(19 - road.position.z) - depth / 2);
    assert.ok((dx / 5.1) ** 2 + (dz / (5.1 * 0.74)) ** 2 > 1,
      'paths must stay outside the pond');
  }
  const fish = park.children.filter(object => object.type === 'Group' &&
    object.children.length === 3 && object.children[1].geometry?.type === 'ConeGeometry' &&
    object.position.x > 22 && object.position.z > 14);
  assert.equal(fish.length, 6);
  const initial = fish.map(object => object.position.clone());
  for (let i = 0; i < 600; i++) {
    frame();
    for (const object of fish) {
      assert.ok(((object.position.x - 28) / 4.4) ** 2 +
        ((object.position.z - 19) / 3.1) ** 2 < 1, 'fish must remain inside the pond');
    }
  }
  for (let i = 0; i < fish.length; i++) assert.ok(fish[i].position.distanceTo(initial[i]) > 0.1);
  world.setArea('home');
  assert.equal(host.dataset.area, 'home');
});
