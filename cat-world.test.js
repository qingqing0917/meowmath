const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const T = require('./vendor/three.min.js');

test('the furnished home and park initialize together', () => {
  const domElement = { addEventListener() {} };
  T.WebGLRenderer = class {
    constructor() { this.domElement = domElement; this.shadowMap = {}; }
    setPixelRatio() {}
    setSize() {}
    render() {}
  };
  const viewport = { clientWidth: 1000, clientHeight: 650, appendChild() {} };
  const action = { addEventListener() {}, setAttribute() {} };
  const host = {
    dataset: {},
    querySelector(selector) { return selector === '.world-canvas' ? viewport : action; },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  const context = vm.createContext({
    window: { THREE: T, devicePixelRatio: 1, innerWidth: 1000,
      addEventListener() {} },
    document: { createElement: () => ({ width: 0, height: 0,
      getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) }) },
    requestAnimationFrame() {}
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
  world.setArea('home');
  assert.equal(host.dataset.area, 'home');
});
