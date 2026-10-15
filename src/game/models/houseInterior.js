// Maison où l'on entre : un salon (panier et gamelles des animaux), une cuisine et une chambre.
// Repère local : 10 m (x) × 7 m (z), la porte d'entrée regarde vers +Z.
//
//   z = -3.5 ┌─────────┬──────────────────┐
//            │         │  cuisine         │
//   z = -0.5 │ chambre ├──────▭───────────┤
//            │         ▭  salon           │
//   z = 3.5  └─────────┴───⇧──────────────┘
//          x = -5    -1.5   0             5

import * as THREE from 'three';
import { mat, add, WallKit, gableRoof, gables, plankTexture, tileTexture, texturedMat, plateTexture } from './interiorKit.js';
import { windowMaterials } from './buildings.js';

export const HOUSE_W = 10;
export const HOUSE_D = 7;
const H = 2.8;
const CUT = 1.3;

export function houseRooms() {
  return [
    { id: 'bedroom', x0: -5, x1: -1.5, z0: -3.5, z1: 3.5, door: { axis: 'x', wall: -1.5, at: 1.25, gap: 1.3 } },
    { id: 'kitchen', x0: -1.5, x1: 5, z0: -3.5, z1: -0.5, door: { axis: 'z', wall: -0.5, at: 2.65, gap: 1.3 } },
  ];
}

export const HOUSE_HALL = { x0: -1.5, x1: 5, z0: -0.5, z1: 3.5 }; // le salon

export function houseModel(label) {
  const g = new THREE.Group();
  const lower = new THREE.Group();
  const upper = new THREE.Group();
  g.add(lower, upper);
  const kit = new WallKit(lower, upper, { h: H, cut: CUT });
  const W = HOUSE_W;
  const D = HOUSE_D;

  // Sols : parquet dans le salon et la chambre, carrelage dans la cuisine.
  add(g, new THREE.BoxGeometry(W + 0.3, 0.12, D + 0.3), mat(0x8a8178), [0, 0.06, 0], null, false);
  add(g, new THREE.BoxGeometry(3.5, 0.02, 7), texturedMat(plankTexture('#b98b5a', false, 'parquet'), 2, 4), [-3.25, 0.13, 0], null, false);
  add(g, new THREE.BoxGeometry(6.5, 0.02, 4), texturedMat(plankTexture('#c39663', false, 'parquet2'), 3.5, 2), [1.75, 0.13, 1.5], null, false);
  add(g, new THREE.BoxGeometry(6.5, 0.02, 3), texturedMat(tileTexture('#e8e3d6', '#c8d4dc', 4), 3, 1.5), [1.75, 0.13, -2], null, false);

  const wallMat = mat(0xefe4cf, 0.9);
  const innerMat = mat(0xf6efe0, 0.9);
  kit.segment('x', -D / 2, -W / 2, W / 2, wallMat);
  kit.segment('z', -W / 2, -D / 2, D / 2, wallMat);
  kit.segment('z', W / 2, -D / 2, D / 2, wallMat);
  kit.withGaps('x', D / 2, -W / 2, W / 2, [[0, 1.6, 2.2]], wallMat);
  kit.withGaps('z', -1.5, -D / 2, D / 2, [[1.25, 1.3, 2.1]], innerMat, { thick: 0.14 });
  kit.withGaps('x', -0.5, -1.5, W / 2, [[2.65, 1.3, 2.1]], innerMat, { thick: 0.14 });
  // Bande de pierre en bas des murs.
  const stone = mat(0x9a948c, 0.95);
  for (const [w, d, x, z] of [[W + 0.24, 0.24, 0, -D / 2], [0.24, D, -W / 2, 0], [0.24, D, W / 2, 0], [W / 2 - 0.8, 0.24, -(W / 4 + 0.4), D / 2], [W / 2 - 0.8, 0.24, W / 4 + 0.4, D / 2]]) {
    add(lower, new THREE.BoxGeometry(w, 0.4, d), stone, [x, 0.2, z]);
  }

  // Porte d'entrée (pivote), perron, panneau.
  const doorHinge = new THREE.Group();
  doorHinge.position.set(-0.8, 0, D / 2);
  g.add(doorHinge);
  add(doorHinge, new THREE.BoxGeometry(1.56, 2.1, 0.07), mat(0x6a4126, 0.6), [0.78, 1.18, 0]);
  add(doorHinge, new THREE.SphereGeometry(0.05, 8, 6), mat(0xd9b44a, 0.3, { metalness: 0.8 }), [1.4, 1.15, 0.06]);
  add(g, new THREE.BoxGeometry(2.4, 0.25, 1.2), mat(0x9a948c), [0, 0.12, D / 2 + 0.6]);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshStandardMaterial({ map: plateTexture(`🏠 ${label}`, '#5b4636', '#fff8e8'), roughness: 0.7 }));
  sign.position.set(0, 2.55, D / 2 + 0.12);
  upper.add(sign);

  // Fenêtres (s'allument la nuit comme les autres bâtiments).
  const glass = mat(0x9fc4d8, 0.2, { emissive: 0xffc66b, emissiveIntensity: 0 });
  windowMaterials.push(glass);
  const frame = mat(0xf2ede4, 0.6);
  const win = (x, z, alongX) => {
    add(upper, new THREE.BoxGeometry(alongX ? 1.1 : 0.26, 1.0, alongX ? 0.26 : 1.1), frame, [x, 1.85, z]);
    add(upper, new THREE.BoxGeometry(alongX ? 0.9 : 0.28, 0.8, alongX ? 0.28 : 0.9), glass, [x, 1.85, z]);
  };
  win(-3.25, D / 2, true);
  win(3, D / 2, true);
  win(2, -D / 2, true);
  win(-3.25, -D / 2, true);
  win(W / 2, 1.5, false);
  win(-W / 2, -1, false);

  // Toit et cheminée.
  const roof = new THREE.Group();
  roof.add(gableRoof(W, D, 2.2, mat(0x5a5f66, 0.7), 0.5));
  roof.add(gables(W, D, 2.2, wallMat));
  add(roof, new THREE.BoxGeometry(0.8, 2, 0.8), mat(0x8c6f5a), [2.5, 1.6, -1]);
  roof.position.y = H;
  upper.add(roof);

  // ------------------------------------------------ salon
  const living = new THREE.Group();
  g.add(living);
  add(living, new THREE.BoxGeometry(2.4, 0.02, 1.8), mat(0x9b4a3a, 1), [2.6, 0.15, 1.5], null, false); // tapis
  const sofaMat = mat(0x4a6f8f, 0.9);
  add(living, new THREE.BoxGeometry(0.9, 0.45, 2.2), sofaMat, [4.45, 0.36, 1.5]);
  add(living, new THREE.BoxGeometry(0.25, 0.85, 2.2), sofaMat, [4.85, 0.55, 1.5]);
  for (const s of [-1, 1]) add(living, new THREE.BoxGeometry(0.9, 0.6, 0.2), sofaMat, [4.45, 0.45, 1.5 + s * 1.05]);
  add(living, new THREE.BoxGeometry(1.0, 0.08, 0.6), mat(0x7a5532, 0.6), [2.7, 0.48, 1.5]);
  for (const [x, z] of [[2.3, 1.3], [3.1, 1.3], [2.3, 1.7], [3.1, 1.7]]) add(living, new THREE.BoxGeometry(0.05, 0.36, 0.05), mat(0x5a3d22), [x, 0.3, z]);
  // Bibliothèque contre le mur de la cuisine.
  add(living, new THREE.BoxGeometry(1.3, 1.8, 0.35), mat(0x8a6240, 0.8), [0.4, 1.02, -0.25]);
  const bookColors = [0xc23b2b, 0x2f6f9a, 0xe0b040, 0x3f8a4a, 0x7a3f8a];
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 6; k++) add(living, new THREE.BoxGeometry(0.14, 0.38, 0.22), mat(bookColors[(k + r) % 5], 0.8), [-0.05 + k * 0.18, 0.45 + r * 0.55, -0.15], null, false);
  }
  // Lampadaire.
  add(living, new THREE.CylinderGeometry(0.03, 0.03, 1.5, 8), mat(0x333333, 0.4, { metalness: 0.6 }), [4.5, 0.88, 3.1]);
  const lampMat = mat(0xfff3d0, 0.4, { emissive: 0xffd27a, emissiveIntensity: 0 });
  add(living, new THREE.CylinderGeometry(0.15, 0.25, 0.3, 14, 1, true), lampMat, [4.5, 1.7, 3.1], null, false);
  // Coin des animaux : panier et gamelles.
  const basket = new THREE.Group();
  living.add(basket);
  add(basket, new THREE.TorusGeometry(0.34, 0.1, 8, 20), mat(0xa5763f, 0.9), [-0.95, 0.24, 0.05], [Math.PI / 2, 0, 0]);
  const cushion = add(basket, new THREE.CylinderGeometry(0.32, 0.32, 0.1, 18), mat(0x8fb3cf, 1), [-0.95, 0.2, 0.05]);
  const bowls = new THREE.Group();
  living.add(bowls);
  for (const [x, c] of [[-0.05, 0xd94a3a], [0.35, 0x3a78d9]]) {
    add(bowls, new THREE.CylinderGeometry(0.16, 0.12, 0.09, 14), mat(c, 0.5), [x, 0.18, -0.12]);
  }
  add(bowls, new THREE.CylinderGeometry(0.11, 0.11, 0.02, 12), mat(0x7a5532, 1), [-0.05, 0.22, -0.12], null, false);
  add(bowls, new THREE.CylinderGeometry(0.11, 0.11, 0.02, 12), mat(0x7ab8e0, 0.1), [0.35, 0.22, -0.12], null, false);
  // Saleté du salon : poils et jouets qui traînent.
  const livingDirt = new THREE.Group();
  g.add(livingDirt);
  const furMat = mat(0xb8a088, 1);
  const toyMats = [mat(0xe0c040, 0.6), mat(0xd94a3a, 0.6), mat(0x4ab07a, 0.6)];
  for (let k = 0; k < 12; k++) {
    const x = -1.1 + ((k * 0.73) % 5.4);
    const z = 0.0 + ((k * 1.37) % 3.2);
    const toy = k % 4 === 0;
    const m = toy
      ? add(livingDirt, new THREE.SphereGeometry(0.09, 10, 8), toyMats[k % 3], [x, 0.23, z])
      : add(livingDirt, new THREE.SphereGeometry(0.1, 6, 4), furMat, [x, 0.16, z], null, false);
    if (!toy) m.scale.set(1.4, 0.3, 1);
    m.userData.threshold = 20 + ((k * 37) % 70);
  }

  // ------------------------------------------------ cuisine
  const kitchen = new THREE.Group();
  g.add(kitchen);
  add(kitchen, new THREE.BoxGeometry(4.5, 0.9, 0.62), mat(0xe9e4da, 0.6), [2.45, 0.58, -3.12]);
  add(kitchen, new THREE.BoxGeometry(4.6, 0.06, 0.68), mat(0x6e5a48, 0.5), [2.45, 1.05, -3.12]);
  add(kitchen, new THREE.BoxGeometry(0.7, 0.05, 0.45), mat(0xb8c0c6, 0.2, { metalness: 0.8 }), [1.6, 1.07, -3.1], null, false); // évier
  add(kitchen, new THREE.CylinderGeometry(0.02, 0.02, 0.35, 8), mat(0xb8c0c6, 0.2, { metalness: 0.8 }), [1.6, 1.25, -3.35]);
  add(kitchen, new THREE.BoxGeometry(0.75, 0.04, 0.55), mat(0x222222, 0.4), [3.6, 1.09, -3.1], null, false); // plaques
  for (const x of [3.42, 3.78]) add(kitchen, new THREE.CylinderGeometry(0.12, 0.12, 0.01, 14), mat(0x444444, 0.5), [x, 1.12, -3.1], null, false);
  add(kitchen, new THREE.BoxGeometry(0.8, 1.9, 0.7), mat(0xf4f4f1, 0.4), [-0.95, 1.08, -3.05]); // frigo
  add(kitchen, new THREE.BoxGeometry(1.1, 0.06, 0.8), mat(0xa57a4f, 0.6), [0.6, 0.8, -1.8]); // table
  for (const [x, z] of [[0.15, -1.5], [1.05, -1.5], [0.15, -2.1], [1.05, -2.1]]) add(kitchen, new THREE.BoxGeometry(0.06, 0.66, 0.06), mat(0x7a5532), [x, 0.46, z]);
  for (const z of [-1.15, -2.45]) {
    add(kitchen, new THREE.BoxGeometry(0.42, 0.05, 0.42), mat(0x8a5a3a), [0.6, 0.55, z]);
    add(kitchen, new THREE.BoxGeometry(0.42, 0.5, 0.05), mat(0x8a5a3a), [0.6, 0.8, z + (z < -1.8 ? -0.2 : 0.2)]);
  }
  const kitchenDirt = new THREE.Group();
  g.add(kitchenDirt);
  const plateMat = mat(0xf5f5f0, 0.3);
  const crumbs = mat(0x9a6a3a, 1);
  for (let k = 0; k < 5; k++) {
    const m = add(kitchenDirt, new THREE.CylinderGeometry(0.16, 0.12, 0.03, 14), plateMat, [1.15 - (k % 2) * 0.05, 1.11 + k * 0.035, -2.85]);
    m.userData.threshold = 25 + k * 14;
  }
  for (let k = 0; k < 2; k++) {
    const m = add(kitchenDirt, new THREE.CylinderGeometry(0.16, 0.12, 0.03, 14), plateMat, [0.35 + k * 0.5, 0.85, -1.8]);
    m.userData.threshold = 50 + k * 20;
    const c = add(kitchenDirt, new THREE.SphereGeometry(0.06, 6, 4), crumbs, [0.35 + k * 0.5, 0.88, -1.8], null, false);
    c.userData.threshold = 50 + k * 20;
  }

  // ------------------------------------------------ chambre
  const bedroom = new THREE.Group();
  g.add(bedroom);
  add(bedroom, new THREE.BoxGeometry(1.6, 0.4, 2.2), mat(0x7a5532, 0.7), [-3.4, 0.33, -2.3]);
  add(bedroom, new THREE.BoxGeometry(1.6, 0.9, 0.1), mat(0x6a4426, 0.7), [-3.4, 0.6, -3.38]);
  add(bedroom, new THREE.BoxGeometry(1.5, 0.16, 2.05), mat(0xf4f1ea, 1), [-3.4, 0.6, -2.28]);
  add(bedroom, new THREE.BoxGeometry(0.6, 0.12, 0.35), mat(0xffffff, 1), [-3.75, 0.72, -3.05]);
  add(bedroom, new THREE.BoxGeometry(0.6, 0.12, 0.35), mat(0xffffff, 1), [-3.05, 0.72, -3.05]);
  const blanket = add(bedroom, new THREE.BoxGeometry(1.56, 0.06, 1.4), mat(0x3f7cc4, 0.95), [-3.4, 0.71, -1.95]);
  add(bedroom, new THREE.BoxGeometry(0.5, 0.5, 0.45), mat(0x8a6240), [-4.55, 0.38, -3.1]);
  const bedLamp = add(bedroom, new THREE.ConeGeometry(0.14, 0.22, 12, 1, true), lampMat, [-4.55, 0.82, -3.1], null, false);
  bedLamp.userData.lamp = true;
  const wardrobe = new THREE.Group();
  bedroom.add(wardrobe);
  add(wardrobe, new THREE.BoxGeometry(0.62, 2.0, 1.3), mat(0x9a6e48, 0.7), [-4.6, 1.12, 2.4]);
  add(wardrobe, new THREE.BoxGeometry(0.02, 1.9, 0.02), mat(0x5a3d22), [-4.28, 1.12, 2.4], null, false);
  add(bedroom, new THREE.BoxGeometry(1.6, 0.02, 1.2), mat(0x6a8f5a, 1), [-3.3, 0.15, 0.2], null, false); // tapis
  const bedroomDirt = new THREE.Group();
  g.add(bedroomDirt);
  const clothes = [mat(0xc23b2b, 1), mat(0x2d3a4f, 1), mat(0xe0b040, 1)];
  for (let k = 0; k < 4; k++) {
    const m = add(bedroomDirt, new THREE.BoxGeometry(0.45, 0.04, 0.3), clothes[k % 3], [-4.2 + k * 0.6, 0.17, -0.4 + (k % 2) * 1.1], [0, k * 0.7, 0], false);
    m.userData.threshold = 25 + k * 15;
  }

  // Radiateurs (amélioration « chauffage ») et robot aspirateur.
  const heaters = new THREE.Group();
  g.add(heaters);
  for (const [x, z, ry] of [[3, 3.3, 0], [-3.25, 3.3, 0], [2, -3.32, 0]]) {
    add(heaters, new THREE.BoxGeometry(0.9, 0.5, 0.1), mat(0xf2f2f2, 0.4), [x, 0.5, z], [0, ry, 0]);
  }
  heaters.visible = false;
  const robot = add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.08, 18), mat(0x2b2b30, 0.3, { metalness: 0.4 }), [2.6, 0.2, 2.2]);
  add(robot, new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), mat(0x4ad07a, 0.3, { emissive: 0x4ad07a, emissiveIntensity: 0.8 }), [0.1, 0.05, 0], null, false);
  robot.visible = false;

  // Le mobilier gêne le passage.
  kit.rects.push(
    { lx: 4.6, lz: 1.5, hx: 0.5, hz: 1.15 },
    { lx: 2.45, lz: -3.12, hx: 2.3, hz: 0.35 },
    { lx: -0.95, lz: -3.05, hx: 0.42, hz: 0.38 },
    { lx: 0.6, lz: -1.8, hx: 0.6, hz: 0.45 },
    { lx: -3.4, lz: -2.3, hx: 0.82, hz: 1.12 },
    { lx: -4.6, lz: 2.4, hx: 0.33, hz: 0.67 },
    { lx: 0.4, lz: -0.25, hx: 0.67, hz: 0.2 },
  );

  return {
    group: g,
    upper,
    lampMat,
    doorHinge,
    cushion,
    basket,
    blanket,
    heaters,
    robot,
    dirt: { living: livingDirt, kitchen: kitchenDirt, bedroom: bedroomDirt },
    spots: {
      living: { obj: living, lx: 2.6, lz: 2.6 },
      bowls: { obj: bowls, lx: 0.15, lz: 0.5 },
      basket: { obj: basket, lx: -0.6, lz: 0.7 },
      kitchen: { obj: kitchen, lx: 1.6, lz: -2.4 },
      bed: { obj: bedroom, lx: -2.6, lz: -0.8 },
      wardrobe: { obj: wardrobe, lx: -3.8, lz: 2.4 },
    },
    rects: kit.rects,
  };
}
