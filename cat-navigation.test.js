const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
for (const file of [
  'vendor/cannon.min.js',
  'vendor/pathfinding-browser.min.js',
  'cat-navigation.js'
]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context);
}
const createNavigation = context.window.createCatNavigation;

function walk(navigation, id, destination, area = 'park') {
  const target = navigation.setDestination(id, destination.x, destination.z);
  assert.ok(target, 'destination should be reachable');
  const positions = [];
  for (let frame = 0; frame < 1200 && navigation.moving(id); frame++) {
    navigation.step(area, 1 / 60, { [id]: 7.2 });
    positions.push(navigation.position(id));
  }
  assert.equal(navigation.moving(id), false, 'actor should reach the destination');
  return { target, positions, final: navigation.position(id) };
}

test('walks around a wall without crossing its collision body', () => {
  const navigation = createNavigation({ park: {
    minX: -15, maxX: 15, minZ: -15, maxZ: 15
  } });
  navigation.addBox('park', 0, 0, 4, 14);
  navigation.addActor('walker', 'park', 0.44, -8, 0);
  const { positions, final } = walk(navigation, 'walker', { x: 8, z: 0 });
  assert.ok(positions.length > 80, 'actor should travel, not teleport');
  assert.ok(positions.some(point => Math.abs(point.z) > 7.3), 'route should pass the wall end');
  for (const point of positions) {
    assert.ok(Math.abs(point.x) >= 2.36 || Math.abs(point.z) >= 7.36,
      `wall overlap at ${point.x}, ${point.z}`);
  }
  assert.ok(Math.hypot(final.x - 8, final.z) < 0.3);
});

test('moves an obstructed click to a reachable point outside water', () => {
  const navigation = createNavigation({ park: {
    minX: -15, maxX: 15, minZ: -15, maxZ: 15
  } });
  navigation.addCircle('park', 0, 0, 4);
  navigation.addActor('cat', 'park', 0.4, -8, 0);
  const { target, positions, final } = walk(navigation, 'cat', { x: 0, z: 0 });
  assert.ok(Math.hypot(target.x, target.z) >= 4.4);
  for (const point of positions) {
    assert.ok(Math.hypot(point.x, point.z) >= 4.35,
      `water overlap at ${point.x}, ${point.z}`);
  }
  assert.ok(Math.hypot(final.x - target.x, final.z - target.z) < 0.3);
});

test('keeps actors within the larger park bounds', () => {
  const navigation = createNavigation({ park: {
    minX: -52, maxX: 52, minZ: -40, maxZ: 40
  } });
  navigation.addActor('walker', 'park', 0.44, 0, 0);
  const { target, positions } = walk(navigation, 'walker', { x: 80, z: 60 });
  assert.ok(target.x <= 51.56 && target.z <= 39.56);
  for (const point of positions) {
    assert.ok(point.x <= 51.56 && point.z <= 39.56);
  }
});
