// Bâtiments et décor : maison, écurie, refuge, clinique, gîte, clôtures…
// Chaque bâtiment regarde vers +Z (la porte est devant).
// Les matériaux (enduit, planches, tuiles, ardoises, pierres) sont des textures dessinées par le code.

import * as THREE from 'three';
import { signTexture, plasterTexture, planksTexture, roofTexture, stoneTexture, strawTexture } from '../textures.js';

const mat = (color, roughness = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

/** Copie d'une texture partagée avec sa propre répétition (l'image n'est pas dupliquée). */
function tiled(tex, rx = 1, ry = 1, rot = 0) {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  if (rot) {
    t.center.set(0.5, 0.5);
    t.rotation = rot;
  }
  t.userData = {};
  return t;
}

function add(parent, geo, material, pos, rot) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Boîte dont les UV suivent les mètres (une tuile de texture = `tile` mètres). */
function box(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * faces[f][0] / tile, uv.getY(i) * faces[f][1] / tile);
    }
  }
  return g;
}

function gableRoof(w, d, h, material, overhang = 0.5) {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2 - overhang, -0.12);
  shape.lineTo(d / 2 + overhang, -0.12);
  shape.lineTo(d / 2 + overhang, 0);
  shape.lineTo(0, h);
  shape.lineTo(-d / 2 - overhang, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w + overhang * 2, bevelEnabled: false });
  geo.translate(0, 0, -(w + overhang * 2) / 2);
  geo.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Fenêtres qui s'allument la nuit : le monde garde la liste de leurs matériaux. */
export const windowMaterials = [];

function windowMat() {
  const m = mat(0x2c3b45, 0.06, { emissive: 0xffc66b, emissiveIntensity: 0, metalness: 0.1 });
  windowMaterials.push(m);
  return m;
}

function sign(parent, text, pos, bg, emoji, width = 3.2) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshStandardMaterial({ map: signTexture(text, bg, '#fff8e8', emoji), roughness: 0.7 }),
  );
  m.position.set(...pos);
  parent.add(m);
  return m;
}

/** Fenêtre : cadre, vitre, croisillons, appui et volets éventuels. rotY oriente la façade. */
function windowAt(g, x, y, z, rotY, wm, frame, shutterMat = null) {
  const w = new THREE.Group();
  w.position.set(x, y, z);
  w.rotation.y = rotY;
  g.add(w);
  add(w, new THREE.BoxGeometry(1.1, 1.2, 0.1), frame, [0, 0, 0.0]);
  add(w, new THREE.BoxGeometry(0.92, 1.02, 0.1), wm, [0, 0, 0.02]);
  add(w, new THREE.BoxGeometry(0.05, 1.02, 0.12), frame, [0, 0, 0.03]);
  add(w, new THREE.BoxGeometry(0.92, 0.05, 0.12), frame, [0, 0.1, 0.03]);
  add(w, new THREE.BoxGeometry(1.25, 0.07, 0.22), frame, [0, -0.63, 0.08]);
  if (shutterMat) {
    for (const s of [-1, 1]) {
      const sh = add(w, new THREE.BoxGeometry(0.55, 1.2, 0.05), shutterMat, [s * 0.86, 0, 0.04]);
      for (let k = -2; k <= 2; k++) add(sh, new THREE.BoxGeometry(0.5, 0.04, 0.02), shutterMat, [0, k * 0.22, 0.03]);
    }
  }
}

/** Porte à panneaux avec encadrement et poignée. */
function door(g, w, z, color) {
  const dm = mat(color, 0.55);
  const fr = mat(0xf2ede4, 0.6);
  add(g, new THREE.BoxGeometry(w + 0.2, 2.25, 0.08), fr, [0, 1.12, z]);
  add(g, new THREE.BoxGeometry(w, 2.1, 0.1), dm, [0, 1.05, z + 0.02]);
  for (const y of [0.55, 1.5]) {
    for (const x of [-w / 4, w / 4]) add(g, new THREE.BoxGeometry(w * 0.36, 0.7, 0.04), dm, [x, y, z + 0.08]);
  }
  add(g, new THREE.SphereGeometry(0.045, 10, 8), mat(0xc9a64a, 0.3, { metalness: 0.8 }), [w * 0.38, 1.05, z + 0.12]);
}

function building({ w, d, h, wall, roof, roofH = 2.2, doorColor = 0x6a4126, windows = 2, doorW = 1.2, wallTex = 'plaster', roofTex = 'slate', shutters = null }) {
  const g = new THREE.Group();
  const wallMap = wallTex === 'planks' ? tiled(planksTexture(), 1, 1) : tiled(plasterTexture(), 1, 1);
  add(g, box(w, h, d, wallTex === 'planks' ? 2.4 : 3), mat(wall, 0.9, { map: wallMap }), [0, h / 2, 0]);
  // Soubassement en pierre.
  add(g, box(w + 0.16, 0.55, d + 0.16, 1.6), mat(0xd8d2c8, 0.95, { map: tiled(stoneTexture()) }), [0, 0.27, 0]);
  // Chaînages d'angle.
  const trim = mat(0xf1ebe0, 0.8);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, new THREE.BoxGeometry(0.22, h, 0.22), trim, [sx * (w / 2 + 0.01), h / 2, sz * (d / 2 + 0.01)]);
  const roofMap = tiled(roofTexture(roofTex), 0.5, 0.5, Math.PI / 2);
  const r = gableRoof(w, d, roofH, mat(roof, 0.75, { map: roofMap }));
  r.position.y = h;
  g.add(r);
  // Faîtage et planches de rive.
  add(g, new THREE.BoxGeometry(w + 1.1, 0.16, 0.26), mat(roof, 0.7).clone(), [0, h + roofH + 0.02, 0]);
  // Pignon (triangle de mur sous le toit).
  const gable = new THREE.Shape();
  gable.moveTo(-d / 2, 0);
  gable.lineTo(d / 2, 0);
  gable.lineTo(0, roofH * (d / 2) / (d / 2 + 0.5));
  gable.closePath();
  const gg = new THREE.ShapeGeometry(gable);
  for (const s of [-1, 1]) {
    const m = add(g, gg, mat(wall, 0.9, { map: wallMap, side: THREE.DoubleSide }), [s * w / 2, h, 0], [0, s * Math.PI / 2, 0]);
    m.castShadow = false;
  }
  door(g, doorW, d / 2 + 0.02, doorColor);
  const wm = windowMat();
  const frame = mat(0xf2ede4, 0.6);
  const sm = shutters ? mat(shutters, 0.7) : null;
  for (let i = 0; i < windows; i++) {
    const x = (i % 2 === 0 ? -1 : 1) * (w / 4 + Math.floor(i / 2) * 0.6);
    windowAt(g, x, h * 0.55, d / 2 + 0.03, 0, wm, frame, sm);
    windowAt(g, w / 2 + 0.03, h * 0.55, (i % 2 === 0 ? -1 : 1) * d / 4, Math.PI / 2, wm, frame, sm);
  }
  return g;
}

export function house(label) {
  const g = building({ w: 10, d: 7, h: 4, wall: 0xf1e6d2, roof: 0x55606a, windows: 2, roofTex: 'slate', shutters: 0x5b7f8f });
  // Cheminée en pierre.
  add(g, box(0.8, 2.4, 0.8, 1.2), mat(0xcfc8bc, 0.95, { map: tiled(stoneTexture()) }), [2.5, 5.9, -1]);
  add(g, new THREE.BoxGeometry(0.95, 0.12, 0.95), mat(0x6b6560), [2.5, 7.1, -1]);
  // Petit perron.
  add(g, box(2.4, 0.25, 1.2, 1.2), mat(0xc9c2b8, 0.9, { map: tiled(stoneTexture()) }), [0, 0.12, 4.1]);
  sign(g, label, [0, 3.2, 3.56], '#5b4636', '🏠', 2.4);
  return { group: g, size: [10, 7] };
}

export function stable(label) {
  const g = new THREE.Group();
  const w = 16;
  const d = 7;
  const h = 3.4;
  add(g, box(w, h, d, 2.4), mat(0x9a6640, 0.9, { map: tiled(planksTexture()) }), [0, h / 2, 0]);
  add(g, box(w + 0.16, 0.4, d + 0.16, 1.6), mat(0xd0cac0, 0.95, { map: tiled(stoneTexture()) }), [0, 0.2, 0]);
  const r = gableRoof(w, d, 1.8, mat(0x6b5446, 0.8, { map: tiled(roofTexture('shingle'), 0.5, 0.5, Math.PI / 2) }), 1.2);
  r.position.y = h;
  g.add(r);
  const doorMat = mat(0x5e3b22, 0.7, { map: tiled(planksTexture(), 0.6, 0.6) });
  const trimM = mat(0xe8dfcf, 0.7);
  for (let i = 0; i < 4; i++) {
    const x = -w / 2 + 2 + i * 4;
    // Portes de box en deux parties, avec croix de Saint-André.
    add(g, new THREE.BoxGeometry(1.7, 1.4, 0.1), doorMat, [x, 0.7, d / 2 + 0.05]);
    add(g, new THREE.BoxGeometry(1.8, 0.09, 0.14), trimM, [x, 1.42, d / 2 + 0.06]);
    add(g, new THREE.BoxGeometry(1.8, 0.09, 0.14), trimM, [x, 0.04, d / 2 + 0.06]);
    for (const s of [-1, 1]) {
      add(g, new THREE.BoxGeometry(0.09, 1.4, 0.14), trimM, [x + s * 0.86, 0.7, d / 2 + 0.06]);
      add(g, new THREE.BoxGeometry(0.08, 1.75, 0.13), trimM, [x, 0.72, d / 2 + 0.07], [0, 0, s * 0.68]);
    }
    // Ouverture sombre au-dessus de la demi-porte.
    add(g, new THREE.BoxGeometry(1.6, 0.9, 0.06), mat(0x1c1612, 0.95), [x, 1.95, d / 2 + 0.02]);
    add(g, new THREE.BoxGeometry(1.8, 0.09, 0.14), trimM, [x, 2.45, d / 2 + 0.06]);
  }
  sign(g, label, [0, 3.0, d / 2 + 0.08], '#3f2a1c', '🐴', 3);
  return { group: g, size: [w, d] };
}

export function refuge(label, local = false) {
  const g = building({
    w: 9, d: 7, h: 3.6, wall: local ? 0xe2cda6 : 0xc8dcc8, roof: local ? 0x9a4a32 : 0x4b6e5c, windows: 2,
    doorColor: 0x2f5a46, roofTex: local ? 'tiles' : 'slate', shutters: local ? 0x7a3b2a : null,
  });
  sign(g, label, [0, 4.35, 3.6], local ? '#7a3b2a' : '#2f5a46', local ? '🏡' : '🐾');
  return { group: g, size: [9, 7] };
}

export function vetClinic(label) {
  const g = building({ w: 9, d: 7, h: 3.6, wall: 0xf6f6f3, roof: 0x5b6d7a, windows: 2, doorColor: 0x2e7d5b });
  const green = mat(0x2fae62, 0.5, { emissive: 0x2fae62, emissiveIntensity: 0.3 });
  add(g, new THREE.BoxGeometry(0.5, 1.5, 0.12), green, [3.2, 2.6, 3.6]);
  add(g, new THREE.BoxGeometry(1.5, 0.5, 0.12), green, [3.2, 2.6, 3.6]);
  sign(g, label, [-0.6, 4.35, 3.6], '#2e7d5b', '🩺');
  return { group: g, size: [9, 7] };
}

export function lodge(label, biome) {
  const japan = biome === 'garden';
  const g = building({
    w: 9, d: 7, h: 3.2,
    wall: japan ? 0xeee6d2 : 0xa8784e,
    roof: japan ? 0x3c4248 : biome === 'beach' ? 0x46596e : 0x5e4030,
    roofH: japan ? 1.6 : 3, windows: 2,
    wallTex: japan ? 'plaster' : 'planks', roofTex: japan ? 'tiles' : biome === 'beach' ? 'slate' : 'shingle',
    shutters: japan ? null : 0x6b2e22,
  });
  sign(g, label, [0, 3.9, 3.6], '#5b4636', '🛏️', 2.6);
  return { group: g, size: [9, 7] };
}

export function jobBoard(label) {
  const g = new THREE.Group();
  const wood = mat(0x8a6040, 0.85, { map: tiled(planksTexture(), 0.3, 1) });
  add(g, new THREE.BoxGeometry(0.15, 2, 0.15), wood, [-0.9, 1, 0]);
  add(g, new THREE.BoxGeometry(0.15, 2, 0.15), wood, [0.9, 1, 0]);
  add(g, new THREE.BoxGeometry(2, 1.1, 0.08), mat(0xc49a6a, 0.9, { map: tiled(planksTexture(), 0.8, 0.5) }), [0, 1.4, 0]);
  add(g, new THREE.BoxGeometry(2.2, 0.08, 0.3), wood, [0, 2.0, 0.05]);
  const paper = mat(0xfaf4e4, 0.9);
  [[-0.5, 1.55], [0.1, 1.35], [0.6, 1.6], [-0.2, 1.15]].forEach(([x, y], i) => add(g, new THREE.BoxGeometry(0.4, 0.3, 0.02), paper, [x, y, 0.05], [0, 0, (i - 1.5) * 0.06]));
  sign(g, label, [0, 2.25, 0.08], '#7a5236', '📋', 2);
  return { group: g, size: [2, 0.5] };
}

/** Clôture rectangulaire avec une ouverture devant (paddock, carrière). */
export function paddock(w, d) {
  const g = new THREE.Group();
  const wood = mat(0xe9dfcf, 0.75, { map: tiled(planksTexture(), 0.15, 0.6) });
  const posts = [];
  const rails = [];
  const gap = 3;
  const push = (x, z) => posts.push([x, z]);
  for (let x = -w / 2; x <= w / 2 + 0.01; x += 2.5) {
    push(x, -d / 2);
    if (Math.abs(x) > gap / 2) push(x, d / 2);
  }
  for (let z = -d / 2 + 2.5; z < d / 2; z += 2.5) {
    push(-w / 2, z);
    push(w / 2, z);
  }
  const postGeo = new THREE.CylinderGeometry(0.08, 0.09, 1.35, 8);
  const im = new THREE.InstancedMesh(postGeo, wood, posts.length);
  const m4 = new THREE.Matrix4();
  posts.forEach(([x, z], i) => im.setMatrixAt(i, m4.makeTranslation(x, 0.67, z)));
  im.castShadow = true;
  im.receiveShadow = true;
  g.add(im);
  const side = (len, x, z, rotY) => rails.push({ len, x, z, rotY });
  side(w, 0, -d / 2, 0);
  side(d, -w / 2, 0, Math.PI / 2);
  side(d, w / 2, 0, Math.PI / 2);
  side(w / 2 - gap / 2, -(w / 4 + gap / 4), d / 2, 0);
  side(w / 2 - gap / 2, w / 4 + gap / 4, d / 2, 0);
  for (const r of rails) {
    for (const y of [0.55, 1.1]) {
      add(g, new THREE.BoxGeometry(r.len, 0.12, 0.05), wood, [r.x, y, r.z], [0, r.rotY, 0]);
    }
  }
  // Sable de carrière, piétiné.
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, d - 0.3), mat(0xc4ae86, 1));
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = 0.03;
  sand.receiveShadow = true;
  g.add(sand);
  // Obstacle de saut au milieu (chandeliers et barres rayées).
  const red = mat(0xc8463c, 0.5);
  const white = mat(0xf2f2f2, 0.5);
  for (const s of [-1, 1]) {
    add(g, new THREE.BoxGeometry(0.15, 1.3, 0.15), white, [s * 1.6, 0.65, 0]);
    add(g, new THREE.BoxGeometry(0.5, 0.06, 0.5), white, [s * 1.6, 0.03, 0]);
  }
  for (let k = 0; k < 6; k++) {
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), k % 2 ? white : red, [-1.25 + k * 0.5, 0.85, 0], [0, 0, Math.PI / 2]);
  }
  add(g, new THREE.CylinderGeometry(0.05, 0.05, 3, 8), white, [0, 0.45, 0], [0, 0, Math.PI / 2]);
  return g;
}

export function hayBale() {
  const g = new THREE.Group();
  const straw = mat(0xffffff, 1, { map: tiled(strawTexture(), 3, 1) });
  add(g, new THREE.CylinderGeometry(0.6, 0.6, 1.1, 24), straw, [0, 0.6, 0], [0, 0, Math.PI / 2]);
  // Ficelles.
  for (const x of [-0.3, 0.3]) add(g, new THREE.TorusGeometry(0.605, 0.012, 4, 32), mat(0xd8cfb0, 0.8), [x, 0.6, 0], [0, Math.PI / 2, 0]);
  return g;
}

export function trough() {
  const g = new THREE.Group();
  const metal = mat(0x8a969e, 0.35, { metalness: 0.6 });
  add(g, new THREE.BoxGeometry(1.8, 0.6, 0.7), metal, [0, 0.3, 0]);
  add(g, new THREE.BoxGeometry(1.86, 0.06, 0.76), metal, [0, 0.6, 0]);
  add(g, new THREE.BoxGeometry(1.6, 0.05, 0.5), mat(0x2f5e70, 0.05, { transparent: true, opacity: 0.85 }), [0, 0.55, 0]);
  return g;
}

export function torii() {
  const g = new THREE.Group();
  const red = mat(0xc63c2b, 0.55);
  const black = mat(0x1d1d1d, 0.6);
  add(g, new THREE.CylinderGeometry(0.22, 0.25, 5, 16), red, [-2.2, 2.5, 0]);
  add(g, new THREE.CylinderGeometry(0.22, 0.25, 5, 16), red, [2.2, 2.5, 0]);
  add(g, new THREE.BoxGeometry(6.4, 0.35, 0.5), black, [0, 5.1, 0]);
  add(g, new THREE.BoxGeometry(5.6, 0.3, 0.4), red, [0, 4.3, 0]);
  for (const s of [-1, 1]) add(g, new THREE.CylinderGeometry(0.3, 0.32, 0.3, 16), black, [s * 2.2, 0.15, 0]);
  return g;
}

export function lighthouse() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(1.2, 1.8, 12, 24), mat(0xf4f2ee, 0.8, { map: tiled(plasterTexture(), 2, 3) }), [0, 6, 0]);
  add(g, new THREE.CylinderGeometry(1.25, 1.25, 1.5, 24), mat(0xc0392b), [0, 4, 0]);
  add(g, new THREE.CylinderGeometry(1.25, 1.25, 1.5, 24), mat(0xc0392b), [0, 8.5, 0]);
  add(g, new THREE.CylinderGeometry(1.6, 1.6, 0.15, 24), mat(0x2b2b2b), [0, 12, 0]);
  add(g, new THREE.CylinderGeometry(1, 1, 1.2, 16), mat(0xfff2b0, 0.2, { emissive: 0xffe28a, emissiveIntensity: 0.6 }), [0, 12.6, 0]);
  add(g, new THREE.ConeGeometry(1.4, 1.2, 16), mat(0x2b2b2b), [0, 13.8, 0]);
  return g;
}
