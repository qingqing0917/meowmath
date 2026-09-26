(function () {
  'use strict';

  function createCatNavigation(bounds) {
    const C = window.CANNON;
    const PF = window.PF;
    const cellSize = 0.8;
    const areas = {};
    const actors = {};

    for (const [name, limits] of Object.entries(bounds)) {
      const world = new C.World();
      world.gravity.set(0, -9.82, 0);
      world.defaultContactMaterial.friction = 0;
      world.defaultContactMaterial.restitution = 0;
      world.broadphase = new C.SAPBroadphase(world);
      world.solver.iterations = 12;
      const floor = new C.Body({ mass: 0 });
      floor.addShape(new C.Plane());
      floor.quaternion.setFromAxisAngle(new C.Vec3(1, 0, 0), -Math.PI / 2);
      world.addBody(floor);
      areas[name] = { limits, world, obstacles: [], grids: {} };
    }

    function addBox(areaName, x, z, width, depth, height = 2) {
      const area = areas[areaName];
      const body = new C.Body({ mass: 0 });
      body.addShape(new C.Box(new C.Vec3(width / 2, height / 2, depth / 2)));
      body.position.set(x, height / 2, z);
      area.world.addBody(body);
      area.obstacles.push({ type: 'box', x, z, width, depth });
      area.grids = {};
    }

    function addCircle(areaName, x, z, radius) {
      const area = areas[areaName];
      const body = new C.Body({ mass: 0 });
      body.addShape(new C.Sphere(radius));
      body.position.set(x, 0.5, z);
      area.world.addBody(body);
      area.obstacles.push({ type: 'circle', x, z, radius });
      area.grids = {};
    }

    function addActor(id, areaName, radius, x, z) {
      const area = areas[areaName];
      const body = new C.Body({ mass: 1, linearDamping: 0.12 });
      body.addShape(new C.Sphere(radius));
      body.position.set(x, radius, z);
      body.fixedRotation = true;
      body.updateMassProperties();
      area.world.addBody(body);
      actors[id] = { areaName, body, radius, route: [], target: null, requestedTarget: null };
    }

    function blocked(area, x, z, radius) {
      const { limits } = area;
      if (x < limits.minX + radius || x > limits.maxX - radius ||
          z < limits.minZ + radius || z > limits.maxZ - radius) return true;
      return area.obstacles.some(obstacle => {
        if (obstacle.type === 'circle') {
          return Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius + radius;
        }
        return Math.abs(x - obstacle.x) < obstacle.width / 2 + radius &&
          Math.abs(z - obstacle.z) < obstacle.depth / 2 + radius;
      });
    }

    function navigationGrid(areaName, radius) {
      const area = areas[areaName];
      const key = radius.toFixed(2);
      if (area.grids[key]) return area.grids[key];
      const { minX, maxX, minZ, maxZ } = area.limits;
      const columns = Math.floor((maxX - minX) / cellSize) + 1;
      const rows = Math.floor((maxZ - minZ) / cellSize) + 1;
      const matrix = Array.from({ length: rows }, (_, row) =>
        Array.from({ length: columns }, (_, column) =>
          blocked(area, minX + column * cellSize, minZ + row * cellSize, radius) ? 1 : 0));
      const result = { grid: new PF.Grid(columns, rows, matrix), columns, rows, minX, minZ };
      area.grids[key] = result;
      return result;
    }

    function nearestCell(nav, x, z) {
      const column = Math.max(0, Math.min(nav.columns - 1, Math.round((x - nav.minX) / cellSize)));
      const row = Math.max(0, Math.min(nav.rows - 1, Math.round((z - nav.minZ) / cellSize)));
      if (nav.grid.isWalkableAt(column, row)) return [column, row];
      for (let distance = 1; distance < Math.max(nav.columns, nav.rows); distance++) {
        let nearest = null;
        let nearestDistance = Infinity;
        for (let dz = -distance; dz <= distance; dz++) {
          for (let dx = -distance; dx <= distance; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== distance) continue;
            const cx = column + dx;
            const cz = row + dz;
            if (!nav.grid.isWalkableAt(cx, cz)) continue;
            const score = (cx - (x - nav.minX) / cellSize) ** 2 +
              (cz - (z - nav.minZ) / cellSize) ** 2;
            if (score < nearestDistance) {
              nearest = [cx, cz];
              nearestDistance = score;
            }
          }
        }
        if (nearest) return nearest;
      }
      return null;
    }

    function setDestination(id, x, z) {
      const actor = actors[id];
      actor.requestedTarget = { x, z };
      const nav = navigationGrid(actor.areaName, actor.radius + 0.18);
      const start = nearestCell(nav, actor.body.position.x, actor.body.position.z);
      const end = nearestCell(nav, x, z);
      if (!start || !end) {
        actor.route = [];
        return null;
      }
      const finder = new PF.AStarFinder({ allowDiagonal: true, dontCrossCorners: true });
      const path = finder.findPath(start[0], start[1], end[0], end[1], nav.grid.clone());
      if (!path.length) {
        actor.route = [];
        return null;
      }
      const smooth = PF.Util.smoothenPath(nav.grid, path);
      actor.route = smooth.slice(1).map(([column, row]) => ({
        x: nav.minX + column * cellSize, z: nav.minZ + row * cellSize
      }));
      const actual = {
        x: nav.minX + end[0] * cellSize,
        z: nav.minZ + end[1] * cellSize
      };
      if (!blocked(areas[actor.areaName], x, z, actor.radius + 0.18)) {
        actual.x = x;
        actual.z = z;
      }
      actor.route.push(actual);
      actor.target = actual;
      return actual;
    }

    function follow(id, x, z) {
      const actor = actors[id];
      if (!actor.requestedTarget ||
          Math.hypot(actor.requestedTarget.x - x, actor.requestedTarget.z - z) > 1.25 ||
          !actor.route.length && actor.target &&
          Math.hypot(actor.body.position.x - actor.target.x,
            actor.body.position.z - actor.target.z) > 0.5) setDestination(id, x, z);
    }

    function teleport(id, x, z) {
      const actor = actors[id];
      actor.body.position.set(x, actor.radius, z);
      actor.body.velocity.set(0, 0, 0);
      actor.body.angularVelocity.set(0, 0, 0);
      actor.body.aabbNeedsUpdate = true;
      actor.route = [];
      actor.target = { x, z };
      actor.requestedTarget = { x, z };
    }

    function step(areaName, dt, speeds) {
      const area = areas[areaName];
      for (const [id, actor] of Object.entries(actors)) {
        if (actor.areaName !== areaName) continue;
        while (actor.route.length && Math.hypot(actor.route[0].x - actor.body.position.x,
          actor.route[0].z - actor.body.position.z) < 0.22) actor.route.shift();
        const next = actor.route[0];
        if (!next || !speeds[id]) {
          actor.body.velocity.x = 0;
          actor.body.velocity.z = 0;
          continue;
        }
        const dx = next.x - actor.body.position.x;
        const dz = next.z - actor.body.position.z;
        const distance = Math.hypot(dx, dz);
        const speed = Math.min(speeds[id], distance / Math.max(dt, 0.001));
        actor.body.velocity.x = dx / distance * speed;
        actor.body.velocity.z = dz / distance * speed;
      }
      area.world.step(1 / 60, Math.min(dt, 0.05), 4);
    }

    function position(id) {
      const point = actors[id].body.position;
      return { x: point.x, z: point.z };
    }

    function moving(id) {
      return actors[id].route.length > 0;
    }

    return { addBox, addCircle, addActor, setDestination, follow, teleport, step,
      position, moving };
  }

  window.createCatNavigation = createCatNavigation;
})();
