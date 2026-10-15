// Bâtiments et décor : maison, écurie, refuge, clinique, gîte, clôtures…
// Chaque bâtiment regarde vers +Z (la porte est devant).

import * as THREE from 'three';
import { signTexture } from '../textures.js';

const mat = (color, roughness = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

function add(parent, geo, material, pos, rot) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function gableRoof(w, d, h, material, overhang = 0.5) {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2 - overhang, 0);
  shape.lineTo(d / 2 + overhang, 0);
  shape.lineTo(0, h);
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
  const m = mat(0x9fc4d8, 0.2, { emissive: 0xffc66b, emissiveIntensity: 0 });
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

function building({ w, d, h, wall, roof, roofH = 2.2, door = 0x6a4126, windows = 2, doorW = 1.2 }) {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(w, h, d), mat(wall), [0, h / 2, 0]);
  add(g, new THREE.BoxGeometry(w + 0.3, 0.3, d + 0.3), mat(0x8a8178), [0, 0.15, 0]);
  const r = gableRoof(w, d, roofH, mat(roof, 0.7));
  r.position.y = h;
  g.add(r);
  add(g, new THREE.BoxGeometry(doorW, 2.1, 0.1), mat(door, 0.6), [0, 1.05, d / 2 + 0.03]);
  const wm = windowMat();
  const frame = mat(0xf2ede4, 0.6);
  for (let i = 0; i < windows; i++) {
    const x = (i % 2 === 0 ? -1 : 1) * (w / 4 + Math.floor(i / 2) * 0.6);
    add(g, new THREE.BoxGeometry(1.1, 1.1, 0.12), frame, [x, h * 0.55, d / 2 + 0.02]);
    add(g, new THREE.BoxGeometry(0.9, 0.9, 0.14), wm, [x, h * 0.55, d / 2 + 0.03]);
    add(g, new THREE.BoxGeometry(0.12, 1.1, 1.1), frame, [w / 2 + 0.02, h * 0.55, (i % 2 === 0 ? -1 : 1) * d / 4]);
    add(g, new THREE.BoxGeometry(0.14, 0.9, 0.9), wm, [w / 2 + 0.03, h * 0.55, (i % 2 === 0 ? -1 : 1) * d / 4]);
  }
  return g;
}

export function house(label) {
  const g = building({ w: 10, d: 7, h: 4, wall: 0xefe4cf, roof: 0x5a5f66, windows: 2 });
  add(g, new THREE.BoxGeometry(0.8, 2, 0.8), mat(0x8c6f5a), [2.5, 6, -1]);
  // Petit perron
  add(g, new THREE.BoxGeometry(2.4, 0.25, 1.2), mat(0x9a948c), [0, 0.12, 4.1]);
  sign(g, label, [0, 3.2, 3.56], '#5b4636', '🏠', 2.4);
  return { group: g, size: [10, 7] };
}

export function stable(label) {
  const g = new THREE.Group();
  const w = 16;
  const d = 7;
  const h = 3.4;
  add(g, new THREE.BoxGeometry(w, h, d), mat(0x8b5a35), [0, h / 2, 0]);
  const r = gableRoof(w, d, 1.8, mat(0x4b3a30, 0.8), 1.2);
  r.position.y = h;
  g.add(r);
  const doorMat = mat(0x5e3b22, 0.7);
  const trim = mat(0xe8dfcf, 0.7);
  for (let i = 0; i < 4; i++) {
    const x = -w / 2 + 2 + i * 4;
    add(g, new THREE.BoxGeometry(1.6, 1.3, 0.1), doorMat, [x, 0.65, d / 2 + 0.05]);
    add(g, new THREE.BoxGeometry(1.7, 0.08, 0.14), trim, [x, 1.32, d / 2 + 0.06]);
    add(g, new THREE.BoxGeometry(0.08, 1.3, 0.14), trim, [x, 0.65, d / 2 + 0.07], [0, 0, 0.9]);
  }
  sign(g, label, [0, 3.0, d / 2 + 0.06], '#3f2a1c', '🐴', 3);
  return { group: g, size: [w, d] };
}

export function refuge(label, local = false) {
  const g = building({ w: 9, d: 7, h: 3.6, wall: local ? 0xdcc7a1 : 0xbfd8c2, roof: local ? 0x7a3b2a : 0x3f6b55, windows: 2, door: 0x2f5a46 });
  sign(g, label, [0, 4.4, 3.56], local ? '#7a3b2a' : '#2f5a46', local ? '🏡' : '🐾');
  return { group: g, size: [9, 7] };
}

export function vetClinic(label) {
  const g = building({ w: 9, d: 7, h: 3.6, wall: 0xf4f4f1, roof: 0x5b6d7a, windows: 2, door: 0x2e7d5b });
  const green = mat(0x2fae62, 0.5, { emissive: 0x2fae62, emissiveIntensity: 0.3 });
  add(g, new THREE.BoxGeometry(0.5, 1.5, 0.12), green, [3.2, 2.6, 3.58]);
  add(g, new THREE.BoxGeometry(1.5, 0.5, 0.12), green, [3.2, 2.6, 3.58]);
  sign(g, label, [-0.6, 4.4, 3.56], '#2e7d5b', '🩺');
  return { group: g, size: [9, 7] };
}

export function lodge(label, biome) {
  const japan = biome === 'garden';
  const g = building({
    w: 9, d: 7, h: 3.2,
    wall: japan ? 0xe9e0cc : 0x9b6a42,
    roof: japan ? 0x34393f : biome === 'beach' ? 0x40546a : 0x5a3b28,
    roofH: japan ? 1.6 : 3, windows: 2,
  });
  sign(g, label, [0, 3.9, 3.56], '#5b4636', '🛏️', 2.6);
  return { group: g, size: [9, 7] };
}

export function jobBoard(label) {
  const g = new THREE.Group();
  const wood = mat(0x7a5236);
  add(g, new THREE.BoxGeometry(0.15, 2, 0.15), wood, [-0.9, 1, 0]);
  add(g, new THREE.BoxGeometry(0.15, 2, 0.15), wood, [0.9, 1, 0]);
  add(g, new THREE.BoxGeometry(2, 1.1, 0.08), mat(0xb98a5a), [0, 1.4, 0]);
  const paper = mat(0xfaf4e4, 0.9);
  [[-0.5, 1.55], [0.1, 1.35], [0.6, 1.6], [-0.2, 1.15]].forEach(([x, y]) => add(g, new THREE.BoxGeometry(0.4, 0.3, 0.02), paper, [x, y, 0.05]));
  sign(g, label, [0, 2.2, 0.06], '#7a5236', '📋', 2);
  return { group: g, size: [2, 0.5] };
}

/** Clôture rectangulaire avec une ouverture devant (paddock, carrière). */
export function paddock(w, d) {
  const g = new THREE.Group();
  const wood = mat(0xe7dccb, 0.8);
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
  const postGeo = new THREE.BoxGeometry(0.14, 1.3, 0.14);
  const im = new THREE.InstancedMesh(postGeo, wood, posts.length);
  const m4 = new THREE.Matrix4();
  posts.forEach(([x, z], i) => im.setMatrixAt(i, m4.makeTranslation(x, 0.65, z)));
  im.castShadow = true;
  g.add(im);
  const side = (len, x, z, rotY) => rails.push({ len, x, z, rotY });
  side(w, 0, -d / 2, 0);
  side(d, -w / 2, 0, Math.PI / 2);
  side(d, w / 2, 0, Math.PI / 2);
  side(w / 2 - gap / 2, -(w / 4 + gap / 4), d / 2, 0);
  side(w / 2 - gap / 2, w / 4 + gap / 4, d / 2, 0);
  for (const r of rails) {
    for (const y of [0.55, 1.1]) {
      add(g, new THREE.BoxGeometry(r.len, 0.1, 0.06), wood, [r.x, y, r.z], [0, r.rotY, 0]);
    }
  }
  // Sable de carrière
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, d - 0.3), mat(0xc9b38a, 1));
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = 0.03;
  sand.receiveShadow = true;
  g.add(sand);
  // Obstacle de saut au milieu
  const red = mat(0xc8463c, 0.6);
  const white = mat(0xf2f2f2, 0.6);
  add(g, new THREE.BoxGeometry(0.15, 1.2, 0.15), white, [-1.5, 0.6, 0]);
  add(g, new THREE.BoxGeometry(0.15, 1.2, 0.15), white, [1.5, 0.6, 0]);
  add(g, new THREE.CylinderGeometry(0.05, 0.05, 3, 8), red, [0, 0.8, 0], [0, 0, Math.PI / 2]);
  return g;
}

export function hayBale() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.6, 0.6, 1.1, 16), mat(0xd9b860, 1), [0, 0.6, 0], [0, 0, Math.PI / 2]);
  return g;
}

export function trough() {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(1.8, 0.6, 0.7), mat(0x7d8a92, 0.4, { metalness: 0.4 }), [0, 0.3, 0]);
  add(g, new THREE.BoxGeometry(1.6, 0.05, 0.5), mat(0x4a8fb5, 0.1), [0, 0.56, 0]);
  return g;
}

export function torii() {
  const g = new THREE.Group();
  const red = mat(0xc63c2b, 0.6);
  const black = mat(0x1d1d1d, 0.6);
  add(g, new THREE.CylinderGeometry(0.22, 0.25, 5, 12), red, [-2.2, 2.5, 0]);
  add(g, new THREE.CylinderGeometry(0.22, 0.25, 5, 12), red, [2.2, 2.5, 0]);
  add(g, new THREE.BoxGeometry(6.4, 0.35, 0.5), black, [0, 5.1, 0]);
  add(g, new THREE.BoxGeometry(5.6, 0.3, 0.4), red, [0, 4.3, 0]);
  return g;
}

export function lighthouse() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(1.2, 1.8, 12, 16), mat(0xf4f2ee), [0, 6, 0]);
  add(g, new THREE.CylinderGeometry(1.25, 1.25, 1.5, 16), mat(0xc0392b), [0, 4, 0]);
  add(g, new THREE.CylinderGeometry(1.25, 1.25, 1.5, 16), mat(0xc0392b), [0, 8.5, 0]);
  add(g, new THREE.CylinderGeometry(1, 1, 1.2, 16), mat(0xfff2b0, 0.2, { emissive: 0xffe28a, emissiveIntensity: 0.6 }), [0, 12.6, 0]);
  add(g, new THREE.ConeGeometry(1.4, 1.2, 16), mat(0x2b2b2b), [0, 13.8, 0]);
  return g;
}
