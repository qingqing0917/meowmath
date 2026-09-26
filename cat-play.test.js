const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const T = require('./vendor/three.min.js');

test('clicking either play object makes the cat walk, scratch, and climb', () => {
  const listeners = {};
  const domElement = {
    addEventListener(type, handler) { listeners[type] = handler; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 650 }; },
    setPointerCapture() {}
  };
  let scene;
  T.WebGLRenderer = class {
    constructor() { this.domElement = domElement; this.shadowMap = {}; }
    setPixelRatio() {}
    setSize() {}
    render(current) { scene = current; }
  };
  T.Clock.prototype.getDelta = () => 1 / 60;
  let selectedSpot = null;
  T.Raycaster.prototype.intersectObjects = function (objects) {
    const object = objects.find(item => item.userData.playSpot === selectedSpot ||
      item.userData.restSpot === selectedSpot);
    return object ? [{ object }] : [];
  };
  let frame;
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
    window: { THREE: T, devicePixelRatio: 1, innerWidth: 1000,
      innerHeight: 650, addEventListener() {} },
    document: { createElement: () => ({ width: 0, height: 0,
      getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) }) },
    requestAnimationFrame(callback) { frame = callback; }
  });
  for (const file of [
    'vendor/cannon.min.js', 'vendor/pathfinding-browser.min.js',
    'cat-navigation.js', 'cat-home.js', 'cat-world.js'
  ]) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context);

  const world = context.window.createCatWorld({ host, initialArea: 'home' });
  world.syncCat({ breed: 'tabby', stage: 2 }, {
    base: '#c69063', belly: '#f3e3cf', stripe: '#8a5a34',
    pattern: 'stripes', eye: '#4a9e5f'
  });
  function advance(count, afterFrame) {
    for (let i = 0; i < count; i++) {
      frame();
      if (afterFrame) afterFrame();
    }
  }
  function click(spot) {
    selectedSpot = spot;
    const event = { clientX: 500, clientY: 325, pointerId: 1 };
    listeners.pointerdown(event);
    listeners.pointerup(event);
  }
  advance(1);
  const cat = scene.children[2];
  click('catTree');
  advance(1);
  assert.ok(cat.position.y < 0.1, 'climbing should not begin immediately');
  const paws = cat.children.filter(child => child.type === 'Group');
  let treeScratchFrames = 0;
  let treePawAngle = 0;
  const recordTree = () => {
    if (cat.position.y < 0.1 && Math.hypot(cat.position.x + 2.8,
      cat.position.z - 8.25) < 0.6) {
      treeScratchFrames++;
      treePawAngle = Math.max(treePawAngle,
        ...paws.map(paw => Math.abs(paw.rotation.x)));
    }
  };
  advance(120, recordTree);
  assert.ok(cat.position.x > -10, 'the cat should walk toward the tree');
  advance(400, recordTree);
  assert.ok(treeScratchFrames > 35, 'the cat should pause to scratch the tree');
  assert.ok(treePawAngle > 0.6, 'the front paws should make a scratching motion');
  assert.ok(Math.abs(cat.position.y - 2.42) < 0.08, 'the cat should reach the tree perch');

  click('scratchBoard');
  advance(1);
  assert.ok(cat.position.y > 1, 'the cat should descend rather than teleport');
  let boardScratchFrames = 0;
  advance(500, () => {
    if (cat.position.y < 0.1 && Math.hypot(cat.position.x + 6.5,
      cat.position.z - 9.05) < 0.6) boardScratchFrames++;
  });
  assert.ok(boardScratchFrames > 35, 'the cat should pause to scratch the board');
  assert.ok(Math.abs(cat.position.y - 1.4) < 0.08,
    'the cat should reach the scratch-board perch');

  click('sofa');
  advance(500);
  assert.ok(cat.position.distanceTo(new T.Vector3(-12, 0.79, 10.5)) < 0.1,
    'the cat should still be able to rest on the sofa');
  click('table');
  advance(500);
  assert.ok(cat.position.distanceTo(new T.Vector3(-7.2, 0.93, 6.6)) < 0.1,
    'the cat should still be able to rest on the table');

  click('bed');
  advance(1);
  assert.ok(cat.position.distanceTo(new T.Vector3(-2.7, 0.25, 5.3)) > 1,
    'the cat should walk to the bed instead of teleporting');
  advance(500);
  assert.ok(cat.position.distanceTo(new T.Vector3(-2.7, 0.25, 5.3)) < 0.1,
    'the cat should settle on the cushion');
  const eyelids = cat.children.filter(child => child.geometry &&
    child.geometry.type === 'TorusGeometry' && child.geometry.parameters.radius === 0.09);
  assert.equal(eyelids.length, 2);
  assert.ok(eyelids.every(eyelid => eyelid.visible), 'the sleeping cat should close its eyes');
  const breathingScale = cat.scale.y;
  advance(15);
  assert.notEqual(cat.scale.y, breathingScale, 'the sleeping cat should breathe gently');
  click('bed');
  advance(90);
  assert.ok(cat.position.distanceTo(new T.Vector3(-2.7, 0, 3.1)) < 0.35,
    'clicking the bed again should wake the cat and let it walk out');
  assert.ok(eyelids.every(eyelid => !eyelid.visible), 'the awake cat should reopen its eyes');
});
