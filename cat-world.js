(function () {
  'use strict';

  function createCatWorld(options) {
    const T = window.THREE;
    const host = options.host;
    const viewport = host.querySelector('.world-canvas');
    const scene = new T.Scene();
    scene.background = new T.Color('#779ea3');

    const renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    viewport.appendChild(renderer.domElement);

    const camera = new T.PerspectiveCamera(45, 1, 0.1, 200);
    const raycaster = new T.Raycaster();
    const pointer = new T.Vector2();
    const clock = new T.Clock();
    const home = new T.Group();
    const park = new T.Group();
    const catRoot = new T.Group();
    const walker = new T.Group();
    const doorTargets = [];
    const adoptionTargets = [];
    const restTargets = [];
    const playTargets = [];
    scene.add(home, park, catRoot, walker);
    scene.add(new T.HemisphereLight('#e5ede4', '#344d3f', 1.15));
    const sun = new T.DirectionalLight('#fff1cc', 2.6);
    sun.position.set(-7, 13, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.normalBias = 0.025;
    scene.add(sun, sun.target);

    const material = (color, roughness = 0.82) => new T.MeshStandardMaterial({ color, roughness });
    function mesh(parent, geometry, color, x, y, z, shadow = true) {
      const object = new T.Mesh(geometry, material(color));
      object.position.set(x, y, z);
      object.castShadow = shadow;
      object.receiveShadow = true;
      parent.add(object);
      return object;
    }
    function box(parent, color, sx, sy, sz, x, y, z) {
      return mesh(parent, new T.BoxGeometry(sx, sy, sz), color, x, y, z);
    }
    function ball(parent, color, sx, sy, sz, x, y, z) {
      const object = mesh(parent, new T.SphereGeometry(1, 24, 16), color, x, y, z);
      object.scale.set(sx, sy, sz);
      return object;
    }
    function cylinder(parent, color, top, bottom, height, x, y, z, sides = 14) {
      return mesh(parent, new T.CylinderGeometry(top, bottom, height, sides), color, x, y, z);
    }
    function floorTarget(parent, width, depth) {
      const target = new T.Mesh(new T.PlaneGeometry(width, depth),
        new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide }));
      target.rotation.x = -Math.PI / 2;
      target.position.y = 0.055;
      parent.add(target);
      return target;
    }
    function makeDoor(parent, x, z, destination, color) {
      const door = box(parent, color, 2.3, 3.15, 0.16, x, 1.57, z);
      box(parent, '#f6e6c6', 0.18, 3.6, 0.28, x - 1.25, 1.8, z + 0.06);
      box(parent, '#f6e6c6', 0.18, 3.6, 0.28, x + 1.25, 1.8, z + 0.06);
      box(parent, '#f6e6c6', 2.68, 0.2, 0.28, x, 3.58, z + 0.06);
      ball(parent, '#f4c86b', 0.09, 0.09, 0.09, x + 0.82, 1.63, z + 0.15);
      door.userData.destination = destination;
      doorTargets.push(door);
    }
    function makeTree(parent, x, z, scale, leaf) {
      const tree = new T.Group();
      tree.position.set(x, 0, z);
      tree.scale.setScalar(scale);
      parent.add(tree);
      cylinder(tree, '#745d46', 0.24, 0.36, 2.6, 0, 1.3, 0);
      cylinder(tree, '#90704f', 0.08, 0.12, 1.4, 0.25, 1.65, 0.06);
      ball(tree, leaf, 1.15, 1.02, 1.1, 0, 3.1, 0);
      ball(tree, leaf, 0.84, 0.83, 0.82, -0.65, 2.7, 0.15);
      ball(tree, leaf, 0.82, 0.8, 0.82, 0.66, 2.78, -0.12);
      for (let i = 0; i < 5; i++) {
        const angle = i * 2.4;
        ball(tree, i % 2 ? '#e98598' : '#e9bc75', 0.09, 0.09, 0.09,
          Math.cos(angle) * 0.8, 3.1 + Math.sin(i) * 0.45, Math.sin(angle) * 0.67);
      }
    }

    const homeLayout = window.createCatHome({ T, home, box, ball, cylinder,
      makeDoor, makeTree, floorTarget, restTargets, playTargets });
    const homeGround = homeLayout.ground;

    box(park, '#35634a', 104, 0.34, 80, 0, -0.2, 0);
    for (const [x, z, width, depth] of [
      [0, 5, 4.4, 61], [-18, -8, 36, 3.1], [20, -7, 40, 3.1],
      [17, 18, 35, 3], [-31, 19, 25, 2.8]
    ]) {
      box(park, '#756c59', width + 0.34, 0.08, depth + 0.34, x, 0.02, z);
      box(park, '#bba98a', width, 0.055, depth, x, 0.07, z);
    }
    box(park, '#b8c4ab', 10.8, 5.5, 5.8, 0, 2.75, -13.7);
    const roof = mesh(park, new T.ConeGeometry(8.1, 3.2, 4), '#92584e', 0, 6.65, -13.7);
    roof.rotation.y = Math.PI / 4;
    makeDoor(park, 0, -10.7, 'home', '#588c84');
    for (const x of [-3.4, 3.4]) {
      box(park, '#9cc6cf', 1.5, 1.6, 0.09, x, 3.25, -10.69);
      box(park, '#f8f4e7', 1.7, 0.14, 0.2, x, 4.12, -10.57);
      box(park, '#f8f4e7', 1.7, 0.14, 0.2, x, 2.38, -10.57);
      box(park, '#f8f4e7', 0.13, 1.72, 0.2, x - 0.85, 3.25, -10.57);
      box(park, '#f8f4e7', 0.13, 1.72, 0.2, x + 0.85, 3.25, -10.57);
    }
    const parkTrees = [
      [-45, -31, 1.35, '#285943'], [-36, -20, 1.18, '#3b704b'],
      [-28, -30, 1.36, '#2e6247'], [-19, -27, 1.1, '#4c8053'],
      [-10, -29, 1.25, '#315f42'], [9, -27, 1.3, '#36704b'],
      [27, -29, 1.4, '#2a5d43'], [42, -31, 1.2, '#467b50'],
      [-43, -8, 1.18, '#3b704b'], [-32, -2, 1.3, '#2d6246'],
      [-12, 3, 0.96, '#4e8454'], [10, 4, 0.92, '#356d4e'],
      [34, -4, 1.25, '#2d6448'], [45, 3, 1.38, '#427953'],
      [-44, 13, 1.28, '#316447'], [-23, 10, 1.1, '#3d7850'],
      [-11, 17, 1.2, '#336d4a'], [7, 25, 1.14, '#417751'],
      [43, 19, 1.3, '#2c6048'], [-43, 32, 1.3, '#386e4c'],
      [-29, 31, 1.18, '#4b8054'], [-15, 30, 1.37, '#315d43'],
      [25, 33, 1.28, '#3b7350'], [43, 33, 1.15, '#285a44']
    ];
    for (const [x, z, scale, leaf] of parkTrees) makeTree(park, x, z, scale, leaf);

    const adoptionBody = box(park, '#cfb598', 8, 4.7, 6, -17, 2.35, -17);
    const adoptionRoof = mesh(park, new T.ConeGeometry(6.2, 2.5, 4), '#ae5f61', -17, 5.85, -17);
    adoptionRoof.rotation.y = Math.PI / 4;
    box(park, '#3c6861', 2.1, 2.8, 0.18, -17, 1.4, -13.91);
    for (const x of [-19.8, -14.2]) {
      box(park, '#74a8a9', 1.45, 1.65, 0.1, x, 2.3, -13.91);
      box(park, '#f1dac1', 1.65, 0.14, 0.17, x, 3.2, -13.78);
    }
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const signContext = signCanvas.getContext('2d');
    signContext.fillStyle = '#efe2c8';
    signContext.fillRect(0, 0, 512, 128);
    signContext.strokeStyle = '#9c5c5f';
    signContext.lineWidth = 12;
    signContext.strokeRect(6, 6, 500, 116);
    signContext.fillStyle = '#345f56';
    signContext.font = 'bold 62px sans-serif';
    signContext.textAlign = 'center';
    signContext.textBaseline = 'middle';
    signContext.fillText('猫咪领养处', 256, 67);
    const signTexture = new T.CanvasTexture(signCanvas);
    signTexture.encoding = T.sRGBEncoding;
    const adoptionSign = new T.Mesh(new T.PlaneGeometry(5.8, 1.45),
      new T.MeshBasicMaterial({ map: signTexture, side: T.DoubleSide }));
    adoptionSign.position.set(-17, 4.1, -13.82);
    park.add(adoptionSign);
    adoptionTargets.push(adoptionBody, adoptionRoof, adoptionSign);

    const fountainCenter = { x: 17, z: -8 };
    cylinder(park, '#697a77', 3.55, 3.75, 0.65, fountainCenter.x, 0.32, fountainCenter.z, 48);
    const fountainWater = cylinder(park, '#397f8d', 3.18, 3.18, 0.08,
      fountainCenter.x, 0.68, fountainCenter.z, 48);
    fountainWater.material.roughness = 0.2;
    fountainWater.material.metalness = 0.16;
    cylinder(park, '#b0b4a2', 0.55, 0.82, 1.25, fountainCenter.x, 1.05, fountainCenter.z, 24);
    const waterJets = [];
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7;
      const arc = new T.CatmullRomCurve3([
        new T.Vector3(fountainCenter.x + Math.cos(angle) * 0.4, 1.65,
          fountainCenter.z + Math.sin(angle) * 0.4),
        new T.Vector3(fountainCenter.x + Math.cos(angle) * 1.6, 2.15,
          fountainCenter.z + Math.sin(angle) * 1.6),
        new T.Vector3(fountainCenter.x + Math.cos(angle) * 2.7, 0.77,
          fountainCenter.z + Math.sin(angle) * 2.7)
      ]);
      const stream = mesh(park, new T.TubeGeometry(arc, 18, 0.055, 7, false),
        '#8bcbd4', 0, 0, 0, false);
      stream.material.transparent = true;
      stream.material.opacity = 0.68;
      const jet = cylinder(park, '#83c6cf', 0.04, 0.075, 1,
        fountainCenter.x + Math.cos(angle) * 0.65, 1.8,
        fountainCenter.z + Math.sin(angle) * 0.65, 10);
      jet.material.transparent = true;
      jet.material.opacity = 0.72;
      waterJets.push(jet);
    }
    const fountainFish = [];
    for (let i = 0; i < 6; i++) {
      const fish = new T.Group();
      const color = ['#f0a55e', '#e9d27e', '#d8766d', '#93bfc3', '#e6a66b', '#f0c77c'][i];
      ball(fish, color, 0.33, 0.12, 0.19, 0, 0, 0);
      const tail = mesh(fish, new T.ConeGeometry(0.15, 0.28, 3), color, -0.38, 0, 0);
      tail.rotation.z = -Math.PI / 2;
      ball(fish, '#243a42', 0.025, 0.025, 0.02, 0.22, 0.05, 0.14);
      park.add(fish);
      fountainFish.push({ fish, angle: i * Math.PI / 3, radius: 1.45 + i % 2 * 0.7 });
    }

    const pondCenter = { x: 28, z: 19 };
    const pond = cylinder(park, '#276c7a', 5.1, 5.1, 0.08, pondCenter.x, 0.04, pondCenter.z, 56);
    pond.scale.z = 0.74;
    pond.material.roughness = 0.24;
    pond.material.metalness = 0.12;
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI * 2 / 24;
      ball(park, i % 3 ? '#75837a' : '#a6a997', 0.48, 0.2, 0.38,
        pondCenter.x + Math.cos(angle) * 5.2, 0.1,
        pondCenter.z + Math.sin(angle) * 3.95);
    }
    const pondRipples = [];
    for (let i = 0; i < 3; i++) {
      const ripple = new T.Mesh(new T.RingGeometry(0.55, 0.63, 32),
        new T.MeshBasicMaterial({ color: '#91c9c8', transparent: true, opacity: 0.46,
          side: T.DoubleSide, depthWrite: false }));
      ripple.rotation.x = -Math.PI / 2;
      ripple.position.set(pondCenter.x - 1.3 + i * 1.4, 0.095, pondCenter.z);
      park.add(ripple);
      pondRipples.push(ripple);
    }

    const benches = [[-7, 1], [5, 8], [-25, 12], [37, 10], [-34, 24], [40, -15]];
    for (const [x, z] of benches) {
      box(park, '#694f41', 3.1, 0.2, 0.9, x, 0.7, z);
      box(park, '#80614b', 3.1, 0.95, 0.17, x, 1.2, z - 0.41);
      for (const offset of [-1.2, 1.2]) {
        cylinder(park, '#465b52', 0.095, 0.095, 0.72, x + offset, 0.36, z);
        box(park, '#465b52', 0.18, 0.12, 0.93, x + offset, 0.93, z);
      }
    }

    const lawnLights = [[-3, -3], [3, -3], [-3, 9], [3, 9], [-13, -10],
      [-25, -10], [12, -9], [28, -9], [14, 16], [30, 16], [-25, 21]];
    for (const [x, z] of lawnLights) {
      cylinder(park, '#344e48', 0.09, 0.14, 0.8, x, 0.4, z);
      const bulb = ball(park, '#ffd598', 0.2, 0.19, 0.2, x, 0.87, z);
      bulb.material.emissive.set('#f1a95f');
      bulb.material.emissiveIntensity = 0.7;
      cylinder(park, '#344e48', 0.23, 0.23, 0.09, x, 1.09, z);
    }
    const tallLights = [[-8, -8], [7, -7], [-27, 6], [33, 4], [-7, 24], [39, 25]];
    for (const [x, z] of tallLights) {
      cylinder(park, '#304b46', 0.09, 0.16, 4.2, x, 2.1, z);
      box(park, '#304b46', 1.05, 0.13, 0.13, x + 0.45, 4.12, z);
      const lamp = ball(park, '#ffe1a5', 0.29, 0.2, 0.29, x + 0.92, 3.92, z);
      lamp.material.emissive.set('#f5b967');
      lamp.material.emissiveIntensity = 0.9;
      if (Math.abs(x) < 10) {
        const glow = new T.PointLight('#f3bd79', 0.65, 10);
        glow.position.set(x + 0.92, 3.9, z);
        park.add(glow);
      }
    }
    for (let i = 0; i < 120; i++) {
      const x = Math.sin(i * 6.73) * 48;
      const z = Math.cos(i * 3.91) * 35;
      if (Math.abs(x) < 3 || Math.abs(z + 8) < 2.2 && Math.abs(x) < 35 ||
          Math.hypot(x - fountainCenter.x, z - fountainCenter.z) < 4.5 ||
          Math.hypot(x - pondCenter.x, z - pondCenter.z) < 6) continue;
      cylinder(park, '#416a48', 0.025, 0.025, 0.32, x, 0.16, z, 6);
      ball(park, i % 3 ? '#d78793' : '#e2bb75', 0.12, 0.08, 0.12, x, 0.35, z);
    }
    const parkGround = floorTarget(park, 103, 79);
    for (const z of [-39.7, 39.7]) box(park, '#2d5546', 104, 0.65, 0.55, 0, 0.32, z);
    for (const x of [-51.7, 51.7]) box(park, '#2d5546', 0.55, 0.65, 80, x, 0.32, 0);

    const navigation = window.createCatNavigation({
      home: homeLayout.bounds,
      park: { minX: -52, maxX: 52, minZ: -40, maxZ: 40 }
    });
    for (const [x, z, width, depth] of [...homeLayout.walls, ...homeLayout.furniture]) {
      navigation.addBox('home', x, z, width, depth);
    }
    for (const [x, z, width, depth] of [
      [0, -39.7, 104, 0.6], [0, 39.7, 104, 0.6],
      [-51.7, 0, 0.6, 80], [51.7, 0, 0.6, 80],
      [0, -13.7, 10.8, 5.8], [-17, -17, 8, 6]
    ]) navigation.addBox('park', x, z, width, depth, 6);
    navigation.addCircle('park', fountainCenter.x, fountainCenter.z, 3.7);
    navigation.addCircle('park', pondCenter.x - 1.2, pondCenter.z, 4);
    navigation.addCircle('park', pondCenter.x + 1.2, pondCenter.z, 4);
    for (const [x, z, scale] of parkTrees) {
      navigation.addCircle('park', x, z, 0.38 * scale);
    }
    for (const [x, z] of benches) navigation.addBox('park', x, z, 3.1, 0.95);
    for (const [x, z] of [...lawnLights, ...tallLights]) {
      navigation.addCircle('park', x, z, 0.15);
    }
    navigation.addActor('homeCat', 'home', 0.4, homeLayout.spawn.x, homeLayout.spawn.z);
    navigation.addActor('parkWalker', 'park', 0.44, 0, 4);
    navigation.addActor('parkCat', 'park', 0.4, 1.1, -4.2);

    const walkerLegs = [];
    function makeWalker() {
      const skin = '#e3ad8d';
      for (const x of [-0.2, 0.2]) {
        const leg = new T.Group();
        leg.position.set(x, 0.68, 0);
        walker.add(leg);
        cylinder(leg, '#49636b', 0.12, 0.13, 0.7, 0, -0.34, 0);
        ball(leg, '#39494a', 0.19, 0.08, 0.27, 0, -0.61, 0.12);
        walkerLegs.push(leg);
      }
      cylinder(walker, '#e5866e', 0.38, 0.29, 0.82, 0, 1.07, 0);
      ball(walker, '#eaa080', 0.37, 0.24, 0.31, 0, 1.38, 0);
      box(walker, '#f2d0ac', 0.2, 0.08, 0.05, 0, 1.44, 0.32);
      box(walker, '#e3c7a6', 0.18, 0.15, 0.045, -0.18, 1.05, 0.31);
      ball(walker, skin, 0.27, 0.29, 0.26, 0, 1.76, 0.02);
      ball(walker, '#3d3937', 0.3, 0.18, 0.27, 0, 1.96, -0.035);
      for (const side of [-1, 1]) {
        ball(walker, '#3d3937', 0.085, 0.16, 0.11, side * 0.23, 1.83, -0.02);
      }
      for (const side of [-1, 1]) {
        ball(walker, skin, 0.075, 0.105, 0.08, side * 0.27, 1.72, 0.02);
        ball(walker, '#fff9ee', 0.077, 0.081, 0.038, side * 0.105, 1.8, 0.28);
        ball(walker, '#304b51', 0.037, 0.05, 0.021, side * 0.105, 1.79, 0.314);
        ball(walker, '#ffffff', 0.012, 0.015, 0.01, side * 0.105 - 0.01, 1.82, 0.334);
        ball(walker, '#d8947d', 0.075, 0.04, 0.018, side * 0.18, 1.65, 0.245);
        box(walker, '#564946', 0.12, 0.023, 0.025, side * 0.105, 1.92, 0.26);
      }
      ball(walker, '#c98570', 0.05, 0.055, 0.048, 0, 1.68, 0.3);
      const smile = mesh(walker, new T.TorusGeometry(0.078, 0.015, 6, 14, Math.PI),
        '#8f5550', 0, 1.56, 0.25);
      smile.rotation.z = Math.PI;
      for (const x of [-0.43, 0.43]) {
        const arm = cylinder(walker, '#e5866e', 0.12, 0.1, 0.57, x, 1.15, 0);
        arm.rotation.z = x > 0 ? -0.3 : 0.3;
        ball(walker, '#f1c5a6', 0.135, 0.12, 0.13, x, 1.39, 0);
        ball(walker, skin, 0.11, 0.12, 0.11, x * 1.28, 0.88, 0.06);
      }
    }
    makeWalker();
    mesh(walker, new T.TorusGeometry(0.18, 0.05, 8, 20), '#de6f83', 0.52, 0.9, 0.08);
    const leash = new T.Group();
    const leashGeometry = new T.CylinderGeometry(0.055, 0.055, 1, 8);
    const leashBands = Array.from({ length: 30 }, (_, i) => {
      const color = new T.Color().setHSL((0.98 + i / 30 * 0.87) % 1, 0.82, 0.59);
      const band = new T.Mesh(leashGeometry, new T.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.18, roughness: 0.52
      }));
      leash.add(band);
      return band;
    });
    scene.add(leash);

    let legs = [];
    let openEyes = [];
    let closedEyes = [];
    let catKey = '';
    let catScale = 1;
    let restSpot = null;
    function syncCat(cat, breed) {
      const key = `${cat.breed}:${cat.stage}:${cat.sex || ''}`;
      if (key === catKey) return;
      catKey = key;
      for (const child of [...catRoot.children]) {
        child.traverse(object => {
          if (object.geometry) object.geometry.dispose();
          if (object.material) object.material.dispose();
        });
        catRoot.remove(child);
      }
      legs = [];
      openEyes = [];
      closedEyes = [];
      const fur = breed.base;
      const point = breed.pattern === 'points' ? breed.stripe : fur;
      const cream = breed.belly;
      const eye = breed.eye === 'hetero' ? '#64a4d6' : breed.eye;
      ball(catRoot, fur, 0.58, 0.42, 0.83, 0, 0.75, -0.12);
      ball(catRoot, fur, 0.48, 0.4, 0.45, 0, 0.98, 0.58);
      ball(catRoot, cream, 0.33, 0.27, 0.24, 0, 0.67, 0.84);
      ball(catRoot, fur, 0.43, 0.33, 0.39, 0, 0.75, -0.62);
      mesh(catRoot, new T.TorusGeometry(0.35, 0.055, 8, 24), '#2799b0', 0, 0.92, 0.44);
      for (const side of [-1, 1]) {
        const ear = mesh(catRoot, new T.ConeGeometry(0.2, 0.43, 3), point,
          side * 0.28, 1.35, 0.64);
        ear.rotation.y = side * 0.18;
        const inner = mesh(catRoot, new T.ConeGeometry(0.1, 0.25, 3), '#e9a7a8',
          side * 0.28, 1.37, 0.74);
        inner.rotation.y = side * 0.18;
        openEyes.push(
          ball(catRoot, '#f8f4e8', 0.12, 0.13, 0.048, side * 0.18, 1.04, 0.982),
          ball(catRoot, side < 0 ? eye : (breed.eye === 'hetero' ? '#d99b58' : eye),
            0.087, 0.107, 0.045, side * 0.18, 1.04, 1.017),
          ball(catRoot, '#252b2a', 0.036, 0.073, 0.024, side * 0.18, 1.04, 1.056),
          ball(catRoot, '#ffffff', 0.023, 0.026, 0.012, side * 0.18 - 0.025, 1.09, 1.072)
        );
        const eyelid = mesh(catRoot, new T.TorusGeometry(0.09, 0.015, 6, 14, Math.PI),
          '#594b45', side * 0.18, 1.04, 1.014);
        eyelid.rotation.z = Math.PI;
        eyelid.visible = false;
        closedEyes.push(eyelid);
        ball(catRoot, cream, 0.22, 0.15, 0.16, side * 0.16, 0.8, 0.985);
        for (const z of [-0.54, 0.46]) {
          const leg = new T.Group();
          leg.position.set(side * 0.38, 0.57, z);
          catRoot.add(leg);
          cylinder(leg, point, 0.13, 0.15, 0.49, 0, -0.25, 0);
          ball(leg, point, 0.19, 0.1, 0.22, 0, -0.48, 0.1);
          for (const toe of [-0.09, 0.09]) {
            ball(leg, cream, 0.075, 0.05, 0.09, toe, -0.53, 0.24);
          }
          legs.push(leg);
        }
      }
      const nose = mesh(catRoot, new T.ConeGeometry(0.075, 0.1, 3),
        '#d98893', 0, 0.87, 1.125);
      nose.rotation.x = Math.PI / 2;
      for (const side of [-1, 1]) {
        const smile = mesh(catRoot, new T.TorusGeometry(0.077, 0.012, 6, 12, Math.PI),
          '#785e57', side * 0.07, 0.765, 1.11);
        smile.rotation.z = Math.PI;
      }
      const whiskerColor = fur === '#3b3b46' ? '#e9e9e6' : '#725a50';
      const whiskers = [];
      for (const side of [-1, 1]) for (const height of [0.78, 0.86]) {
        whiskers.push(side * 0.15, height, 1.09, side * 0.55, height + (height < 0.82 ? -0.06 : 0.04), 1.1);
      }
      const whiskerGeo = new T.BufferGeometry();
      whiskerGeo.setAttribute('position', new T.Float32BufferAttribute(whiskers, 3));
      catRoot.add(new T.LineSegments(whiskerGeo, new T.LineBasicMaterial({ color: whiskerColor })));
      const tailCurve = new T.CatmullRomCurve3([
        new T.Vector3(0, 0.75, -0.82), new T.Vector3(0.2, 0.9, -1.15),
        new T.Vector3(0.5, 1.25, -1.25), new T.Vector3(0.57, 1.5, -1.05)
      ]);
      mesh(catRoot, new T.TubeGeometry(tailCurve, 20, 0.12, 8, false), point, 0, 0, 0);
      ball(catRoot, point, 0.14, 0.15, 0.14, 0.57, 1.5, -1.05);
      if (breed.pattern === 'stripes' || breed.pattern === 'spots') {
        for (const side of [-1, 1]) for (const z of [-0.44, 0, 0.36]) {
          ball(catRoot, breed.stripe, breed.pattern === 'spots' ? 0.14 : 0.09,
            0.16, breed.pattern === 'spots' ? 0.1 : 0.25, side * 0.52, 0.86, z);
        }
      } else if (breed.pattern === 'cow' || breed.pattern === 'calico') {
        ball(catRoot, breed.stripe, 0.22, 0.18, 0.26, -0.47, 0.85, -0.26);
        ball(catRoot, breed.pattern === 'calico' ? '#dc9855' : breed.stripe,
          0.21, 0.16, 0.22, 0.45, 0.88, 0.3);
      }
      catScale = 0.72 + 0.28 * (0.42 + cat.stage * 0.145);
      catRoot.scale.set(catScale, catScale * (restSpot ? 0.72 : 1), catScale);
    }

    const hand = new T.Vector3();
    const collar = new T.Vector3();
    const ropeControl = new T.Vector3();
    const ropeStart = new T.Vector3();
    const ropeEnd = new T.Vector3();
    const ropeCurve = new T.QuadraticBezierCurve3(hand, ropeControl, collar);
    const ropeDirection = new T.Vector3();
    const up = new T.Vector3(0, 1, 0);
    function placeRope(segment, start, end) {
      ropeDirection.subVectors(end, start);
      segment.position.copy(start).add(end).multiplyScalar(0.5);
      segment.quaternion.setFromUnitVectors(up, ropeDirection.clone().normalize());
      segment.scale.y = ropeDirection.length();
    }
    const destinationMarker = new T.Group();
    const arrow = new T.Group();
    const arrowMaterial = new T.MeshStandardMaterial({
      color: '#168dda', emissive: '#096aaa', emissiveIntensity: 0.55, metalness: 0.2
    });
    const shaft = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.52, 12), arrowMaterial);
    shaft.position.y = 2.95;
    const tip = new T.Mesh(new T.ConeGeometry(0.32, 0.48, 16), arrowMaterial);
    tip.rotation.z = Math.PI;
    tip.position.y = 2.45;
    arrow.add(shaft, tip);
    const markerRing = new T.Mesh(new T.RingGeometry(0.37, 0.52, 32),
      new T.MeshBasicMaterial({ color: '#33b8f4', transparent: true, opacity: 0.86,
        side: T.DoubleSide, depthWrite: false }));
    markerRing.rotation.x = -Math.PI / 2;
    markerRing.position.y = 0.12;
    destinationMarker.add(arrow, markerRing);
    destinationMarker.visible = false;
    scene.add(destinationMarker);

    const focus = new T.Vector3();
    const homeTarget = new T.Vector3(homeLayout.spawn.x, 0, homeLayout.spawn.z);
    const walkerTarget = new T.Vector3(0, 0, 4);
    const playSpots = new Set(Object.keys(homeLayout.playPlaces));
    const restPlaces = Object.fromEntries(Object.entries({
      ...homeLayout.restPlaces, ...homeLayout.playPlaces
    })
      .map(([name, places]) => [name, Object.fromEntries(Object.entries(places)
        .map(([key, point]) => [key, point.length === 2
          ? new T.Vector3(point[0], 0, point[1]) : new T.Vector3(...point)]))]));
    let area = 'home';
    let pendingDoor = null;
    let desiredRestSpot = null;
    let scratchPhase = null;
    let hop = null;
    let cameraAngle = 0.69;
    let cameraElevation = 0.61;
    let cameraDistance = 31;
    let gait = 0;
    let walkerGait = 0;
    let markerAge = 0;
    function markDestination(position) {
      destinationMarker.position.set(position.x, 0, position.z);
      destinationMarker.visible = true;
      markerAge = 0;
    }
    function clampDestination(point) {
      const xLimit = area === 'home' ? 16.8 : 49;
      const zMin = area === 'home' ? -12.8 : -36;
      const zMax = area === 'home' ? 12.8 : 36;
      return new T.Vector3(Math.max(-xLimit, Math.min(xLimit, point.x)), 0,
        Math.max(zMin, Math.min(zMax, point.z)));
    }
    function catFollowPosition() {
      const heading = walker.rotation.y;
      return new T.Vector3(walker.position.x - Math.sin(heading) * 8.2 + Math.cos(heading) * 1.1,
        0, walker.position.z - Math.cos(heading) * 8.2 - Math.sin(heading) * 1.1);
    }
    function startHop(to, landingSpot, duration) {
      const from = catRoot.position.clone();
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      hop = {
        from, to, landingSpot, duration, elapsed: 0,
        fromScale: catRoot.scale.y / catScale,
        toScale: landingSpot === 'bed' ? 0.62
          : landingSpot && !playSpots.has(landingSpot) ? 0.72 : 1,
        arcHeight: landingSpot === 'bed' || restSpot === 'bed' ? 0.04 : 0.55,
        fromRotation: catRoot.rotation.y,
        toRotation: landingSpot && !playSpots.has(landingSpot)
          ? Math.PI / 2 : Math.atan2(dx, dz)
      };
      restSpot = null;
    }
    function startDismount() {
      if (!restSpot) return;
      const exit = restSpot === 'table' && homeTarget.z > 6.6
        ? restPlaces.table.rearApproach : restPlaces[restSpot].approach;
      startHop(exit, null, 0.48);
    }
    function moveTo(point) {
      const destination = clampDestination(point);
      pendingDoor = null;
      if (area === 'home') {
        desiredRestSpot = null;
        scratchPhase = null;
        const reachable = navigation.setDestination('homeCat', destination.x, destination.z);
        if (!reachable) return;
        homeTarget.set(reachable.x, 0, reachable.z);
        startDismount();
      } else {
        const reachable = navigation.setDestination('parkWalker', destination.x, destination.z);
        if (!reachable) return;
        walkerTarget.set(reachable.x, 0, reachable.z);
      }
      markDestination(area === 'home' ? homeTarget : walkerTarget);
    }
    function goThroughDoor() {
      const destination = area === 'home' ? 'park' : 'home';
      const position = area === 'home' ? new T.Vector3(
        homeLayout.doorApproach.x, 0, homeLayout.doorApproach.z)
        : new T.Vector3(0, 0, -8.3);
      moveTo(position);
      pendingDoor = { destination, position };
    }
    function walkToRest(spot) {
      if (restSpot === spot && !hop) {
        if (spot === 'bed') moveTo(restPlaces.bed.approach);
        return;
      }
      pendingDoor = null;
      scratchPhase = null;
      desiredRestSpot = spot;
      const approach = spot === 'table' && catRoot.position.z > 6.6
        ? restPlaces.table.rearApproach : restPlaces[spot].approach;
      const reachable = navigation.setDestination('homeCat', approach.x, approach.z);
      if (!reachable) return;
      homeTarget.set(reachable.x, 0, reachable.z);
      startDismount();
      markDestination(homeTarget);
    }
    function updateControls() {
      host.dataset.area = area;
      for (const mode of host.querySelectorAll('.world-mode')) {
        const selected = mode.dataset.mode === area;
        mode.classList.toggle('selected', selected);
        mode.setAttribute('aria-pressed', String(selected));
      }
      const action = host.querySelector('.world-action');
      action.textContent = area === 'home' ? '🌳 去公园' : '🏠 回家';
      action.setAttribute('aria-label', area === 'home' ? '牵猫去公园' : '带猫回家');
    }
    function setArea(next) {
      if (next !== 'home' && next !== 'park') return;
      area = next;
      pendingDoor = null;
      restSpot = null;
      desiredRestSpot = null;
      scratchPhase = null;
      hop = null;
      catRoot.scale.setScalar(catScale);
      destinationMarker.visible = false;
      home.visible = next === 'home';
      park.visible = next === 'park';
      walker.visible = next === 'park';
      leash.visible = next === 'park';
      scene.background.set(next === 'home' ? '#526a64' : '#779ea3');
      scene.fog = next === 'home' ? null : new T.Fog('#779ea3', 56, 145);
      cameraDistance = next === 'home' ? 31 : 25;
      if (next === 'home') {
        catRoot.position.set(homeLayout.spawn.x, 0, homeLayout.spawn.z);
        homeTarget.copy(catRoot.position);
        navigation.teleport('homeCat', homeLayout.spawn.x, homeLayout.spawn.z);
      } else {
        walker.position.set(0, 0, 4);
        walker.rotation.y = 0;
        walkerTarget.copy(walker.position);
        catRoot.position.copy(catFollowPosition());
        navigation.teleport('parkWalker', walker.position.x, walker.position.z);
        navigation.teleport('parkCat', catRoot.position.x, catRoot.position.z);
      }
      updateControls();
      if (options.onAreaChange) options.onAreaChange(area);
    }
    function faceMovement(object, oldX, oldZ, dt) {
      const dx = object.position.x - oldX;
      const dz = object.position.z - oldZ;
      if (Math.hypot(dx, dz) < 0.002) return false;
      const heading = Math.atan2(dx, dz);
      object.rotation.y += Math.atan2(Math.sin(heading - object.rotation.y),
        Math.cos(heading - object.rotation.y)) * Math.min(1, dt * 10);
      return true;
    }
    let worldTime = 0;
    function update(dt) {
      worldTime += dt;
      let movingWalker = false;
      let movingCat = false;
      if (area === 'park') {
        const followTarget = catFollowPosition();
        navigation.follow('parkCat', followTarget.x, followTarget.z);
        const oldWalkerX = walker.position.x;
        const oldWalkerZ = walker.position.z;
        const oldCatX = catRoot.position.x;
        const oldCatZ = catRoot.position.z;
        const catDistance = Math.hypot(oldCatX - followTarget.x, oldCatZ - followTarget.z);
        navigation.step('park', dt, {
          parkWalker: 7.2,
          parkCat: Math.min(11, 5.5 + catDistance * 0.35)
        });
        const walkerPosition = navigation.position('parkWalker');
        const catPosition = navigation.position('parkCat');
        walker.position.x = walkerPosition.x;
        walker.position.z = walkerPosition.z;
        catRoot.position.x = catPosition.x;
        catRoot.position.z = catPosition.z;
        movingWalker = faceMovement(walker, oldWalkerX, oldWalkerZ, dt);
        movingCat = faceMovement(catRoot, oldCatX, oldCatZ, dt);
      } else {
        const oldCatX = catRoot.position.x;
        const oldCatZ = catRoot.position.z;
        navigation.step('home', dt, { homeCat: !restSpot && !hop && !scratchPhase ? 4.8 : 0 });
        if (!restSpot && !hop && !scratchPhase) {
          const catPosition = navigation.position('homeCat');
          catRoot.position.x = catPosition.x;
          catRoot.position.z = catPosition.z;
          movingCat = faceMovement(catRoot, oldCatX, oldCatZ, dt);
        }
      }
      if (movingWalker) walkerGait += dt * 10;
      for (let i = 0; i < walkerLegs.length; i++) {
        const desired = movingWalker ? Math.sin(walkerGait + i * Math.PI) * 0.38 : 0;
        walkerLegs[i].rotation.x += (desired - walkerLegs[i].rotation.x) * Math.min(1, dt * 12);
      }
      walker.position.y = movingWalker ? Math.abs(Math.sin(walkerGait)) * 0.025 : 0;
      if (area === 'home') {
        if (hop) {
          hop.elapsed = Math.min(hop.duration, hop.elapsed + dt);
          const t = hop.elapsed / hop.duration;
          catRoot.position.lerpVectors(hop.from, hop.to, t);
          catRoot.position.y += Math.sin(Math.PI * t) * hop.arcHeight;
          catRoot.scale.y = catScale * (hop.fromScale + (hop.toScale - hop.fromScale) * t);
          const turn = Math.atan2(Math.sin(hop.toRotation - hop.fromRotation),
            Math.cos(hop.toRotation - hop.fromRotation));
          catRoot.rotation.y = hop.fromRotation + turn * t;
          if (t >= 1) {
            restSpot = hop.landingSpot;
            if (!restSpot) {
              navigation.teleport('homeCat', catRoot.position.x, catRoot.position.z);
              navigation.setDestination('homeCat', homeTarget.x, homeTarget.z);
            }
            hop = null;
          }
        } else if (scratchPhase) {
          scratchPhase.elapsed += dt;
          if (scratchPhase.elapsed >= 1.15) {
            const spot = scratchPhase.spot;
            scratchPhase = null;
            startHop(restPlaces[spot].top, spot, spot === 'catTree' ? 1.15 : 0.82);
          }
        } else if (restSpot && desiredRestSpot !== restSpot) {
          startDismount();
        } else if (!restSpot && !navigation.moving('homeCat') && desiredRestSpot) {
          if (playSpots.has(desiredRestSpot)) {
            const top = restPlaces[desiredRestSpot].top;
            catRoot.rotation.y = Math.atan2(top.x - catRoot.position.x,
              top.z - catRoot.position.z);
            scratchPhase = { spot: desiredRestSpot, elapsed: 0 };
          } else {
            startHop(restPlaces[desiredRestSpot].top, desiredRestSpot,
              desiredRestSpot === 'bed' ? 0.75 : 0.55);
          }
        }
      }
      if (movingCat) gait += dt * 13;
      for (let i = 0; i < legs.length; i++) {
        const desired = hop ? (i % 2 === 0 ? 0.65 : -0.65)
          : scratchPhase ? (i % 2 ? 0.72 + Math.sin(scratchPhase.elapsed * 30 + i) * 0.38 : -0.12)
          : restSpot && playSpots.has(restSpot) ? (i % 2 ? -0.22 : 0.24)
          : restSpot ? (i % 2 === 0 ? 1.05 : -1.05)
          : movingCat ? Math.sin(gait + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.28 : 0;
        legs[i].rotation.x += (desired - legs[i].rotation.x) * Math.min(1, dt * 12);
      }
      if (!hop) catRoot.position.y = restSpot ? restPlaces[restSpot].top.y
        : movingCat ? Math.abs(Math.sin(gait)) * 0.025 : 0;
      const sleepingInBed = area === 'home' && restSpot === 'bed' && !hop;
      for (const eye of openEyes) eye.visible = !sleepingInBed;
      for (const eyelid of closedEyes) eyelid.visible = sleepingInBed;
      if (sleepingInBed) {
        catRoot.scale.y = catScale * (0.62 + Math.sin(worldTime * 2) * 0.012);
      }
      if (pendingDoor) {
        const traveler = area === 'home' ? catRoot : walker;
        if (traveler.position.distanceTo(pendingDoor.position) < 0.25) {
          setArea(pendingDoor.destination);
        }
      }
      if (area === 'park') {
        walker.updateMatrixWorld(true);
        catRoot.updateMatrixWorld(true);
        hand.set(0.52, 0.9, 0.08);
        walker.localToWorld(hand);
        collar.set(0, 0.9, 0.37);
        catRoot.localToWorld(collar);
        ropeControl.copy(hand).add(collar).multiplyScalar(0.5);
        ropeControl.y = Math.max(0.08, Math.min(hand.y, collar.y) - 0.95);
        for (let i = 0; i < leashBands.length; i++) {
          ropeCurve.getPoint(i / leashBands.length, ropeStart);
          ropeCurve.getPoint((i + 1) / leashBands.length, ropeEnd);
          placeRope(leashBands[i], ropeStart, ropeEnd);
        }
      }
      for (let i = 0; i < fountainFish.length; i++) {
        const { fish, radius } = fountainFish[i];
        const angle = worldTime * (0.55 + i * 0.035) + i * Math.PI / 3;
        fish.position.set(fountainCenter.x + Math.cos(angle) * radius,
          0.78 + Math.sin(worldTime * 2.5 + i) * 0.045,
          fountainCenter.z + Math.sin(angle) * radius);
        fish.rotation.y = -angle - Math.PI / 2;
      }
      for (let i = 0; i < waterJets.length; i++) {
        const height = 0.9 + Math.sin(worldTime * 3.2 + i * 0.7) * 0.14;
        waterJets[i].scale.y = height;
        waterJets[i].position.y = 1.68 + height * 0.5;
      }
      for (let i = 0; i < pondRipples.length; i++) {
        const phase = (worldTime * 0.22 + i / pondRipples.length) % 1;
        pondRipples[i].scale.setScalar(0.8 + phase * 1.8);
        pondRipples[i].material.opacity = (1 - phase) * 0.45;
      }
      if (destinationMarker.visible) {
        markerAge += dt;
        arrow.position.y = Math.sin(markerAge * 7) * 0.09;
        markerRing.scale.setScalar(1 + Math.sin(markerAge * 8) * 0.12);
        const stillWalking = area === 'home'
          ? !restSpot && (hop || catRoot.position.distanceTo(homeTarget) > 0.1)
          : walker.position.distanceTo(walkerTarget) > 0.1;
        if (markerAge > 2.6 && !stillWalking) destinationMarker.visible = false;
      }
      const center = area === 'home' ? new T.Vector3(catRoot.position.x * 0.5, 0,
        catRoot.position.z * 0.4)
        : new T.Vector3((walker.position.x + catRoot.position.x) / 2, 0,
          (walker.position.z + catRoot.position.z) / 2);
      focus.lerp(center, Math.min(1, dt * 8));
      sun.position.set(focus.x - 7, 13, focus.z + 10);
      sun.target.position.set(focus.x, 0, focus.z);
      const desiredCamera = new T.Vector3(focus.x + Math.sin(cameraAngle) * cameraDistance,
        cameraDistance * cameraElevation, focus.z + Math.cos(cameraAngle) * cameraDistance);
      camera.position.lerp(desiredCamera, Math.min(1, dt * 8));
      camera.lookAt(focus.x, 0.95, focus.z);
    }
    function resize() {
      const width = Math.max(1, viewport.clientWidth || window.innerWidth);
      const height = Math.max(1, viewport.clientHeight || 600);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }
    function pick(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const doorHit = raycaster.intersectObjects(doorTargets, false)
        .find(hit => hit.object.userData.destination && hit.object.parent.visible);
      if (doorHit) {
        goThroughDoor();
        return;
      }
      if (area === 'park' && raycaster.intersectObjects(adoptionTargets, false).length) {
        if (options.onOpenGallery) options.onOpenGallery();
        return;
      }
      if (area === 'home') {
        const playHit = raycaster.intersectObjects(playTargets, false)[0];
        if (playHit) {
          walkToRest(playHit.object.userData.playSpot);
          return;
        }
        const furnitureHit = raycaster.intersectObjects(restTargets, false)[0];
        if (furnitureHit) {
          walkToRest(furnitureHit.object.userData.restSpot);
          return;
        }
      }
      const ground = area === 'home' ? homeGround : parkGround;
      const hit = raycaster.intersectObject(ground, false)[0];
      const point = hit && hit.point || raycaster.ray.intersectPlane(
        new T.Plane(new T.Vector3(0, 1, 0), 0), new T.Vector3());
      if (point) moveTo(point);
    }

    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let dragged = false;
    let pointerDown = false;
    renderer.domElement.addEventListener('pointerdown', event => {
      startX = lastX = event.clientX;
      startY = lastY = event.clientY;
      dragged = false;
      pointerDown = true;
      renderer.domElement.setPointerCapture(event.pointerId);
      host.focus({ preventScroll: true });
    });
    renderer.domElement.addEventListener('pointermove', event => {
      if (!pointerDown) return;
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 7) dragged = true;
      if (dragged) {
        cameraAngle -= (event.clientX - lastX) * 0.006;
        cameraElevation = Math.max(0.3, Math.min(1.05,
          cameraElevation + (event.clientY - lastY) * 0.004));
      }
      lastX = event.clientX;
      lastY = event.clientY;
    });
    renderer.domElement.addEventListener('pointerup', event => {
      if (!pointerDown) return;
      pointerDown = false;
      if (!dragged) pick(event);
    });
    renderer.domElement.addEventListener('pointercancel', () => { pointerDown = false; });
    renderer.domElement.addEventListener('wheel', event => {
      event.preventDefault();
      const min = area === 'home' ? 16 : 16;
      const max = area === 'home' ? 46 : 48;
      cameraDistance = Math.max(min, Math.min(max, cameraDistance + Math.sign(event.deltaY) * 1.2));
    }, { passive: false });
    host.addEventListener('keydown', event => {
      const move = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] }[event.key];
      if (!move) return;
      event.preventDefault();
      const source = area === 'home' ? catRoot.position : walker.position;
      moveTo(new T.Vector3(source.x + move[0], 0, source.z + move[1]));
    });
    for (const mode of host.querySelectorAll('.world-mode')) {
      mode.addEventListener('click', () => {
        if (mode.dataset.mode !== area) goThroughDoor();
      });
    }
    host.querySelector('.world-action').addEventListener('click', goThroughDoor);
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(viewport);

    resize();
    setArea(options.initialArea === 'park' ? 'park' : 'home');
    focus.set(area === 'home' ? homeLayout.spawn.x * 0.5 : 0, 0,
      area === 'home' ? homeLayout.spawn.z * 0.4 : 0);
    camera.position.set(Math.sin(cameraAngle) * cameraDistance,
      cameraDistance * cameraElevation, focus.z + Math.cos(cameraAngle) * cameraDistance);
    camera.lookAt(focus.x, 0.95, focus.z);
    function frame() {
      requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05);
      if (!host.closest('.screen.active')) return;
      const rect = host.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      update(dt);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
    return { setArea, syncCat, resize };
  }

  window.createCatWorld = createCatWorld;
})();
