const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const T = require('./vendor/three.min.js');

test('the furnished home and park initialize together', () => {
  const listeners = {};
  const domElement = { addEventListener(name, listener) { listeners[name] = listener; },
    setPointerCapture() {} };
  let scene, frame, camera;
  T.WebGLRenderer = class {
    constructor() { this.domElement = domElement; this.shadowMap = {}; }
    setPixelRatio() {}
    setSize() {}
    render(current, view) { scene = current; camera = view; }
  };
  T.Clock.prototype.getDelta = () => 1 / 60;
  const viewport = { clientWidth: 1000, clientHeight: 650, appendChild() {} };
  const action = { addEventListener() {}, setAttribute() {} };
  const host = {
    dataset: {},
    querySelector(selector) { return selector === '.world-canvas' ? viewport : action; },
    querySelectorAll() { return []; },
    addEventListener() {}, focus() {}, closest() { return {}; },
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
  for (let i = 0; i < 40; i++) listeners.wheel({ deltaY: 1, preventDefault() {} });
  function assertOverview(group) {
    for (let i = 0; i < 180; i++) frame();
    camera.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(group);
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const projected = new T.Vector3(x, y, z).project(camera);
          assert.ok(Math.abs(projected.x) < 0.95 && Math.abs(projected.y) < 0.95,
            'zooming all the way out must show every map corner');
          assert.ok(projected.z > -1 && projected.z < 1, 'the map must remain within camera clipping planes');
        }
      }
    }
  }
  for (const [width, height, dragY] of [[1600, 600, 0], [390, 600, -200], [1800, 400, 200]]) {
    viewport.clientWidth = width; viewport.clientHeight = height;
    world.resize();
    listeners.pointerdown({ clientX: 0, clientY: 0, pointerId: 1 });
    listeners.pointermove({ clientX: 200, clientY: dragY });
    listeners.pointerup({});
    assertOverview(park);
  }
  world.setArea('home');
  assert.equal(host.dataset.area, 'home');
  for (let i = 0; i < 40; i++) listeners.wheel({ deltaY: 1, preventDefault() {} });
  assertOverview(scene.children[0]);
});
