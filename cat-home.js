(function () {
  'use strict';

  function createCatHome({ T, home, box, ball, cylinder, makeDoor, makeTree,
    floorTarget, restTargets, playTargets }) {
    const walls = [];
    const furniture = [];
    const spawn = { x: -10, z: 6 };
    const doorApproach = { x: -5.2, z: -12.15 };

    function wall(x, z, width, depth, height = 2.4, color = '#56645d') {
      box(home, color, width, height, depth, x, height / 2, z);
      box(home, '#a99171', width, 0.09, depth + 0.04, x, height + 0.04, z);
      walls.push([x, z, width, depth]);
    }
    function obstacle(x, z, width, depth) {
      furniture.push([x, z, width, depth]);
    }
    function playable(object, spot) {
      object.userData.playSpot = spot;
      playTargets.push(object);
      return object;
    }
    function partition(z, doors) {
      let left = -18;
      for (const center of doors) {
        const edge = center - 1.3;
        wall((left + edge) / 2, z, edge - left, 0.22);
        box(home, '#b49b78', 2.88, 0.18, 0.36, center, 2.35, z);
        for (const side of [-1, 1]) {
          box(home, '#b49b78', 0.13, 2.3, 0.34,
            center + side * 1.34, 1.15, z);
        }
        left = center + 1.3;
      }
      wall((left + 18) / 2, z, 18 - left, 0.22);
    }
    function label(name, x, z) {
      const canvas = document.createElement('canvas');
      canvas.width = 384;
      canvas.height = 112;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ecdfc5';
      context.font = 'bold 66px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(name, 192, 59);
      const texture = new T.CanvasTexture(canvas);
      texture.encoding = T.sRGBEncoding;
      const plaque = new T.Mesh(new T.PlaneGeometry(3.3, 0.92),
        new T.MeshBasicMaterial({ map: texture, transparent: true,
          side: T.DoubleSide, depthWrite: false }));
      plaque.rotation.x = -Math.PI / 2;
      plaque.position.set(x, 0.085, z);
      home.add(plaque);
    }
    function bed(x, z, color) {
      box(home, '#67564c', 3.3, 0.46, 3.9, x, 0.25, z);
      box(home, color, 3.08, 0.2, 3.25, x, 0.57, z + 0.2);
      box(home, '#e5dacb', 2.9, 0.08, 1.85, x, 0.71, z + 0.82);
      for (const side of [-1, 1]) {
        box(home, '#f2ebe0', 1.18, 0.14, 0.8,
          x + side * 0.78, 0.77, z - 1.25);
      }
      box(home, '#62514b', 3.5, 0.95, 0.24, x, 0.52, z - 2);
      obstacle(x, z, 3.5, 4.3);
    }

    box(home, '#273b37', 36, 0.32, 28, 0, -0.19, 0);
    for (const [x, z, width, depth, color] of [
      [-13, -7.4, 9.7, 12.8, '#53494d'], [-4, -7.4, 7.7, 12.8, '#495c58'],
      [4.5, -7.4, 8.7, 12.8, '#444d58'], [13.5, -7.4, 8.7, 12.8, '#514b47'],
      [-9, 8, 17.7, 11.7, '#3f5750'], [3, 8, 5.7, 11.7, '#52676b'],
      [12, 8, 11.7, 11.7, '#515a4c'], [0, 0.5, 35.7, 2.8, '#645d50']
    ]) box(home, color, width, 0.045, depth, x, 0.015, z);
    for (let x = -17; x < 18; x += 1.35) {
      box(home, '#89735d', 0.025, 0.02, 27.6, x, 0.05, 0);
    }

    wall(0, -13.87, 36, 0.3, 4.25, '#3b534d');
    wall(-17.87, 0, 0.26, 28, 4.25, '#42544c');
    wall(17.87, 0, 0.26, 28, 4.25, '#42544c');
    wall(0, 13.87, 36, 0.3, 0.82, '#3b534d');
    box(home, '#455c54', 36, 0.67, 0.3, 0, 3.9, 13.87);
    box(home, '#b49b78', 36.3, 0.16, 0.38, 0, 4.3, 13.87);
    for (const x of [-17.9, -12, -6, 0, 6, 12, 17.9]) {
      box(home, '#a99478', 0.22, 3.08, 0.36, x, 2.35, 13.75);
    }
    for (const [x, width] of [[-15, 5.75], [-9, 5.75], [-3, 5.75],
      [3, 5.75], [9, 5.75], [15, 5.75]]) {
      const glass = box(home, x === 3 ? '#b9ccca' : '#94b7ae',
        width, 2.7, 0.055, x, 2.35, 13.72);
      glass.material.transparent = true;
      glass.material.opacity = x === 3 ? 0.53 : 0.24;
      glass.material.depthWrite = false;
      glass.castShadow = false;
      box(home, '#a99478', width, 0.075, 0.2, x, 2.4, 13.68);
    }
    for (const z of [-13.62, 13.62]) {
      box(home, '#a99171', 35.6, 0.16, 0.14, 0, 0.46, z);
    }
    for (const x of [-17.62, 17.62]) {
      box(home, '#a99171', 0.14, 0.16, 27.5, x, 0.46, 0);
    }
    for (const x of [-17.7, -8, 0, 9, 17.7]) {
      box(home, '#6a8175', 0.28, 3.7, 0.37, x, 1.85, -13.6);
      box(home, '#b49b78', 0.34, 0.12, 0.42, x, 3.75, -13.6);
    }
    box(home, '#a99171', 36.3, 0.19, 0.44, 0, 4.39, -13.87);
    for (const side of [-1, 1]) for (const z of [-8, 0, 8]) {
      const x = side * 17.68;
      box(home, '#82a9a8', 0.06, 1.55, 2.55, x, 2.35, z);
      box(home, '#c6b294', 0.16, 0.1, 2.75, x - side * 0.04, 3.17, z);
      box(home, '#c6b294', 0.16, 0.1, 2.75, x - side * 0.04, 1.52, z);
      box(home, '#c6b294', 0.16, 1.65, 0.09, x - side * 0.04, 2.35, z);
    }
    partition(-1, [-12.5, -5.2, 4.5, 13.5]);
    partition(2, [-10, 3, 11.5]);
    for (const x of [-8, 0, 9]) wall(x, -7.45, 0.22, 12.9);
    for (const x of [0, 6]) wall(x, 8, 0.22, 12);
    for (const x of [-13, 4.5, 13]) {
      box(home, '#8db6b4', 3.2, 1.35, 0.07, x, 2.35, -13.65);
      box(home, '#c6b294', 3.38, 0.09, 0.18, x, 3.08, -13.56);
      box(home, '#c6b294', 3.38, 0.09, 0.18, x, 1.62, -13.56);
      for (const offset of [-1.66, 0, 1.66]) {
        box(home, '#c6b294', 0.08, 1.45, 0.18,
          x + offset, 2.35, -13.55);
      }
      box(home, '#c6b294', 3.2, 0.07, 0.18, x, 2.35, -13.54);
    }
    makeDoor(home, -5.2, -13.7, 'park', '#4d8b84');
    for (const [name, x, z] of [
      ['主卧', -12.5, -2.5], ['客卧', -5.2, -2.5], ['书房', 4.5, -2.5],
      ['杂物间', 13.5, -2.5], ['客厅', -10, 3.4], ['卫生间', 3, 3.4],
      ['厨房·餐厅', 11.5, 3.4]
    ]) label(name, x, z);
    for (const [x, z] of [[-13, -7], [-4, -7], [4.5, -7], [13.5, -7],
      [-10, 7.5], [3, 8], [12, 8]]) {
      cylinder(home, '#a78d6d', 0.16, 0.58, 0.33, x, 3.1, z);
      const glow = ball(home, '#f5d5a0', 0.3, 0.14, 0.3, x, 2.9, z);
      glow.material.emissive.set('#e9ad72');
      glow.material.emissiveIntensity = 0.6;
    }
    for (const [x, z] of [[-10, 7.5], [12, 8]]) {
      const light = new T.PointLight('#f4d0a1', 0.9, 15);
      light.position.set(x, 3, z);
      home.add(light);
    }

    bed(-13, -8.1, '#a47982');
    bed(-2.7, -8.1, '#73938c');
    for (const x of [-16.2, -9.7, -6.7]) {
      box(home, '#736553', 0.75, 0.65, 0.82, x, 0.35, -11.6);
      ball(home, '#e7c889', 0.19, 0.2, 0.19, x, 0.88, -11.6);
      obstacle(x, -11.6, 0.75, 0.82);
    }

    box(home, '#8e765c', 3.5, 0.18, 1.4, 4, 0.88, -10);
    for (const x of [2.5, 5.5]) box(home, '#665949', 0.18, 0.78, 1.2, x, 0.42, -10);
    box(home, '#687b6e', 1.2, 1.3, 1.15, 4, 0.68, -7.1);
    obstacle(4, -10, 3.5, 1.4);
    obstacle(4, -7.1, 1.2, 1.15);
    for (const x of [7.5, 11.2, 15.2]) {
      box(home, '#50483f', 0.75, 2.35, 2.5, x, 1.18, -11.5);
      for (const y of [0.58, 1.2, 1.82]) {
        box(home, '#a08a69', 0.82, 0.09, 2.5, x, y, -11.5);
      }
      obstacle(x, -11.5, 0.82, 2.5);
    }
    for (const [x, z] of [[11.6, -7], [15.5, -7.5], [13, -4]]) {
      box(home, '#7d715c', 1.25, 0.95, 1.1, x, 0.5, z);
      box(home, '#ad9776', 1.27, 0.06, 1.13, x, 1, z);
      obstacle(x, z, 1.27, 1.13);
    }

    const rug = cylinder(home, '#9a6769', 4.1, 4.1, 0.06, -10, 0.085, 8.1, 48);
    rug.scale.z = 0.63;
    cylinder(home, '#c18a7d', 3.45, 3.45, 0.025, -10, 0.13, 8.1, 48).scale.z = 0.54;
    for (const part of [
      box(home, '#426e69', 4.4, 0.67, 1.65, -12, 0.43, 10.5),
      box(home, '#345852', 4.5, 1.1, 0.38, -12, 0.96, 11.23),
      box(home, '#345852', 0.34, 0.92, 1.73, -14.25, 0.77, 10.5),
      box(home, '#345852', 0.34, 0.92, 1.73, -9.75, 0.77, 10.5)
    ]) {
      part.userData.restSpot = 'sofa';
      restTargets.push(part);
    }
    for (const x of [-13, -11]) box(home, '#d7ab8a', 0.76, 0.27, 0.38, x, 0.86, 10.5);
    obstacle(-12, 10.5, 4.8, 1.85);
    const tableTop = box(home, '#ad8c67', 2.2, 0.17, 1.25, -7.2, 0.83, 6.6);
    tableTop.userData.restSpot = 'table';
    restTargets.push(tableTop);
    for (const x of [-8.03, -6.37]) for (const z of [6.2, 7]) {
      const leg = cylinder(home, '#78634c', 0.08, 0.08, 0.75, x, 0.4, z);
      leg.userData.restSpot = 'table';
      restTargets.push(leg);
    }
    obstacle(-7.2, 6.6, 2.3, 1.35);
    box(home, '#78644f', 2.5, 0.65, 0.68, -15.5, 0.36, 5.1);
    box(home, '#263c3a', 1.9, 1.13, 0.09, -15.5, 1.34, 5.1);
    obstacle(-15.5, 5.1, 2.5, 0.68);
    makeTree(home, -16, 11.7, 0.45, '#5d936d');
    obstacle(-16, 11.7, 0.5, 0.5);

    const bedX = -2.7;
    const bedZ = 5.3;
    const bedBase = cylinder(home, '#74566a', 1.4, 1.48, 0.2,
      bedX, 0.12, bedZ, 40);
    const bedCushion = cylinder(home, '#c49d9b', 1.19, 1.19, 0.16,
      bedX, 0.17, bedZ, 40);
    const bedRim = new T.Mesh(new T.TorusGeometry(1.3, 0.18, 10, 40),
      new T.MeshStandardMaterial({ color: '#946e82', roughness: 0.95 }));
    bedRim.rotation.x = -Math.PI / 2;
    bedRim.position.set(bedX, 0.3, bedZ);
    bedRim.castShadow = true;
    home.add(bedRim);
    for (const part of [bedBase, bedCushion, bedRim]) {
      part.userData.restSpot = 'bed';
      restTargets.push(part);
    }
    obstacle(bedX, bedZ, 2.96, 2.96);

    const treeX = -2.8;
    const treeZ = 10.3;
    playable(box(home, '#60574a', 2.3, 0.18, 2.4,
      treeX, 0.12, treeZ), 'catTree');
    for (const [x, z, height] of [
      [treeX - 0.67, treeZ - 0.54, 1.28],
      [treeX + 0.68, treeZ - 0.52, 2.27],
      [treeX, treeZ + 0.58, 2.25]
    ]) {
      playable(cylinder(home, '#b99b70', 0.17, 0.19, height,
        x, height / 2 + 0.2, z), 'catTree');
      for (let y = 0.45; y < height; y += 0.25) {
        cylinder(home, '#d4b487', 0.185, 0.185, 0.045, x, y, z, 12);
      }
    }
    playable(box(home, '#657c6a', 1.55, 0.18, 1.5,
      treeX - 0.48, 1.38, treeZ - 0.4), 'catTree');
    playable(box(home, '#637b70', 2.05, 0.2, 1.78,
      treeX, 2.32, treeZ + 0.12), 'catTree');
    for (const x of [treeX - 0.93, treeX + 0.93]) {
      box(home, '#b49376', 0.13, 0.18, 1.84, x, 2.43, treeZ + 0.12);
    }
    cylinder(home, '#b49376', 0.025, 0.025, 0.53,
      treeX - 0.2, 1.94, treeZ + 0.25);
    ball(home, '#c8797b', 0.17, 0.17, 0.17,
      treeX - 0.2, 1.65, treeZ + 0.25);
    obstacle(treeX, treeZ, 2.3, 2.4);

    const boardX = -6.5;
    const boardZ = 11.2;
    playable(box(home, '#5b5448', 1.9, 0.15, 2.8,
      boardX, 0.1, boardZ), 'scratchBoard');
    const ramp = new T.Group();
    ramp.position.set(boardX, 0.68, boardZ);
    ramp.rotation.x = -0.44;
    home.add(ramp);
    playable(box(ramp, '#c6a778', 1.55, 0.13, 2.5, 0, 0, 0), 'scratchBoard');
    for (const x of [-0.77, 0.77]) {
      box(ramp, '#6d5946', 0.1, 0.19, 2.55, x, 0.1, 0);
    }
    for (let z = -1.05; z <= 1.05; z += 0.3) {
      box(ramp, '#ad875c', 1.38, 0.035, 0.075, 0, 0.09, z);
    }
    playable(box(home, '#657d70', 1.8, 0.17, 0.82,
      boardX, 1.31, boardZ + 1.2), 'scratchBoard');
    obstacle(boardX, boardZ, 1.9, 2.8);

    cylinder(home, '#e2e6df', 0.45, 0.52, 0.55, 1.5, 0.3, 10.7, 20);
    box(home, '#d7e0dc', 1.25, 0.18, 0.75, 1.5, 0.9, 10.9);
    box(home, '#c2d6d4', 1.4, 0.16, 0.9, 4.5, 0.62, 10.9);
    box(home, '#71969c', 1.48, 0.06, 0.98, 4.5, 0.77, 10.9);
    box(home, '#879d9c', 2.3, 0.8, 0.62, 3, 0.42, 13.05);
    obstacle(1.5, 10.7, 1.25, 0.95);
    obstacle(4.5, 10.9, 1.48, 0.98);
    obstacle(3, 13.05, 2.3, 0.62);

    for (const [x, z, width, depth] of [
      [16.45, 7.2, 1.6, 6.5], [12.5, 12.65, 6.2, 1.4]
    ]) {
      box(home, '#465a55', width, 0.83, depth, x, 0.43, z);
      box(home, '#b4b5a5', width + 0.08, 0.11, depth + 0.08, x, 0.89, z);
      obstacle(x, z, width + 0.08, depth + 0.08);
    }
    box(home, '#303e3e', 1.2, 0.04, 0.85, 13, 0.96, 12.5);
    for (const x of [12.7, 13.3]) cylinder(home, '#454b49', 0.19, 0.19, 0.03, x, 1, 12.3, 18);
    box(home, '#a98265', 3.25, 0.18, 2.05, 10.1, 0.86, 8.1);
    for (const x of [8.8, 11.4]) for (const z of [7.35, 8.85]) {
      box(home, '#665543', 0.13, 0.78, 0.13, x, 0.4, z);
    }
    for (const x of [7.5, 12.7]) {
      box(home, '#607a6d', 0.75, 0.48, 0.8, x, 0.28, 8.1);
      obstacle(x, 8.1, 0.75, 0.8);
    }
    obstacle(10.1, 8.1, 3.25, 2.05);

    return { ground: floorTarget(home, 35.7, 27.7), walls, furniture,
      bounds: { minX: -18, maxX: 18, minZ: -14, maxZ: 14 },
      spawn, doorApproach,
      restPlaces: {
        bed: { approach: [bedX, 3.1], top: [bedX, 0.25, bedZ] },
        sofa: { approach: [-12, 8.9], top: [-12, 0.79, 10.5] },
        table: { approach: [-7.2, 5.1], rearApproach: [-7.2, 7.9],
          top: [-7.2, 0.93, 6.6] }
      },
      playPlaces: {
        catTree: { approach: [treeX, 8.25], top: [treeX, 2.42, treeZ + 0.12] },
        scratchBoard: { approach: [boardX, 9.05],
          top: [boardX, 1.4, boardZ + 1.2] }
      } };
  }

  window.createCatHome = createCatHome;
})();
