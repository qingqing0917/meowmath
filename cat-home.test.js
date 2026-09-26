const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const T = require('./vendor/three.min.js');

const context = vm.createContext({
  window: {},
  document: { createElement: () => ({ getContext: () => ({ fillText() {} }) }) }
});
for (const file of [
  'vendor/cannon.min.js', 'vendor/pathfinding-browser.min.js',
  'cat-navigation.js', 'cat-home.js'
]) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context);

function createHome() {
  const boxes = [];
  const playTargets = [];
  const object = () => ({ userData: {}, scale: {},
    material: { emissive: { set() {} } } });
  const box = (_parent, color, width, height, depth, x, y, z) => {
    boxes.push({ color, width, height, depth, x, y, z });
    return object();
  };
  const layout = context.window.createCatHome({
    T, home: new T.Group(), box, ball: object, cylinder: object,
    makeDoor() {}, makeTree() {}, floorTarget: object,
    restTargets: [], playTargets
  });
  const navigation = context.window.createCatNavigation({ home: layout.bounds });
  for (const [x, z, width, depth] of [...layout.walls, ...layout.furniture]) {
    navigation.addBox('home', x, z, width, depth);
  }
  navigation.addActor('cat', 'home', 0.4, layout.spawn.x, layout.spawn.z);
  return { layout, navigation, boxes, playTargets };
}

test('both living-room climbing spots are clickable and reachable', () => {
  const { layout, navigation, playTargets } = createHome();
  for (const spot of ['catTree', 'scratchBoard']) {
    assert.ok(playTargets.some(target => target.userData.playSpot === spot),
      `${spot} needs a click target`);
    const place = layout.playPlaces[spot];
    assert.ok(place.top[1] > 1, `${spot} needs an elevated landing`);
    const target = navigation.setDestination('cat', ...place.approach);
    assert.ok(target, `${spot} should be reachable`);
    assert.ok(Math.hypot(target.x - place.approach[0],
      target.z - place.approach[1]) < 0.3);
    for (let frame = 0; frame < 1200 && navigation.moving('cat'); frame++) {
      navigation.step('home', 1 / 60, { cat: 4.8 });
    }
    assert.equal(navigation.moving('cat'), false, `${spot} walk should finish`);
    const position = navigation.position('cat');
    assert.ok(Math.hypot(position.x - place.approach[0],
      position.z - place.approach[1]) < 0.35,
    `${spot} should stop beside the object`);
  }
});

test('the home has a continuous rear wall and a full-height front facade', () => {
  const { boxes } = createHome();
  assert.ok(boxes.some(part => part.width === 36 && part.height >= 4 &&
    part.z < -13.7), 'rear wall should span the full house');
  assert.ok(boxes.some(part => part.width === 36 && part.height > 0.6 &&
    part.y > 3 && part.z > 13.7), 'front facade should have an upper wall');
  assert.equal(boxes.filter(part => part.depth < 0.1 && part.height > 2 &&
    part.z > 13.6 && part.z < 13.8).length, 6,
  'front windows should fill the wall between structural posts');
});

test('the cat can walk into every room and reach the park door', () => {
  const { layout, navigation } = createHome();
  const destinations = [
    ['主卧', -12.5, -5], ['客卧', -5.2, -5], ['书房', 4.5, -5],
    ['杂物间', 13.5, -5], ['卫生间', 3, 6],
    ['厨房和餐厅', 11.5, 5.5], ['客厅', -10, 6],
    ['沙发', -12, 8.9], ['桌子', -7.2, 5.1],
    ['猫窝', layout.restPlaces.bed.approach[0], layout.restPlaces.bed.approach[1]],
    ['公园门', layout.doorApproach.x, layout.doorApproach.z]
  ];
  for (const [name, x, z] of destinations) {
    const target = navigation.setDestination('cat', x, z);
    assert.ok(target, `${name} should be reachable`);
    assert.ok(Math.hypot(target.x - x, target.z - z) < 0.4,
      `${name} should not be moved behind furniture`);
    for (let frame = 0; frame < 1800 && navigation.moving('cat'); frame++) {
      navigation.step('home', 1 / 60, { cat: 4.8 });
    }
    assert.equal(navigation.moving('cat'), false, `${name} walk should finish`);
    const position = navigation.position('cat');
    assert.ok(Math.hypot(position.x - x, position.z - z) <
      (name === '公园门' ? 0.25 : 0.36),
      `${name} stopped at ${position.x}, ${position.z}`);
  }
});
