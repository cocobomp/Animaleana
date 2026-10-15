// Modèles 3D des constructions du joueur : niche, clapier, paddocks, pré, abri, grange, carrière,
// nouvelle écurie, ranch et décorations. Tout est généré par le code.
// Repère local : la façade (ou l'ouverture) regarde vers +z, comme les autres bâtiments.
// ground(lx, lz) donne la hauteur du sol par rapport au centre (pour que les clôtures suivent le terrain).

import * as THREE from 'three';
import { signTexture } from '../textures.js';
import { STRUCTURES } from '../../sim/construction.js';
import { salonModel } from './salon.js'; // salon de toilettage (métier Toiletteur)

const mat = (color, roughness = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const FLAT = () => 0;

function add(parent, geo, material, pos, rot) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Toit à deux pans (faîte le long de x). */
function gable(w, d, h, material, overhang = 0.3) {
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

/** Panneau avec un texte (nom de la construction). */
function sign(parent, text, emoji, pos, width = 2.4, bg = '#5b4636') {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshStandardMaterial({ map: signTexture(text, bg, '#fff8e8', emoji), roughness: 0.7 }));
  m.position.set(...pos);
  parent.add(m);
  return m;
}

/** Socle en pierre sous un bâtiment, pour qu'il ne flotte pas sur une petite pente. */
function foundation(parent, w, d) {
  add(parent, new THREE.BoxGeometry(w + 0.3, 1.4, d + 0.3), mat(0x8a8178), [0, -0.55, 0]);
}

/**
 * Clôture rectangulaire avec une ouverture au milieu du côté avant (+z).
 * Les poteaux suivent le sol, les lisses relient les poteaux.
 */
function fenceRect(parent, w, d, gate, ground, style = 'white') {
  const wood = style === 'white' ? mat(0xeee6d8, 0.75) : mat(0x8a6440, 0.9);
  const rails = style === 'ranch' ? [0.35, 0.75, 1.15] : [0.5, 1.05];
  const postH = style === 'ranch' ? 1.45 : 1.3;
  const postGeo = new THREE.BoxGeometry(style === 'ranch' ? 0.2 : 0.14, postH, style === 'ranch' ? 0.2 : 0.14);
  const corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  // Chemin : avant-droite de l'ouverture → coins → avant-gauche de l'ouverture.
  const path = [[gate / 2, d / 2], corners[2], corners[1], corners[0], corners[3], [-gate / 2, d / 2]];
  const pts = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i];
    const [bx, bz] = path[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 2.5));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  const posts = new THREE.InstancedMesh(postGeo, wood, pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach(([x, z], i) => posts.setMatrixAt(i, m4.makeTranslation(x, ground(x, z) + postH / 2 - 0.05, z)));
  posts.castShadow = true;
  parent.add(posts);
  const railGeo = new THREE.BoxGeometry(1, 0.1, 0.06);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const ya = ground(ax, az);
    const yb = ground(bx, bz);
    const len = Math.hypot(bx - ax, bz - az, yb - ya);
    for (const y of rails) {
      const r = new THREE.Mesh(railGeo, wood);
      r.position.set((ax + bx) / 2, (ya + yb) / 2 + y, (az + bz) / 2);
      r.scale.x = len;
      r.rotation.order = 'YZX';
      r.rotation.y = -Math.atan2(bz - az, bx - ax);
      r.rotation.z = Math.atan2(yb - ya, Math.hypot(bx - ax, bz - az));
      r.castShadow = true;
      parent.add(r);
    }
  }
  // Poteaux de l'ouverture un peu plus hauts.
  for (const sx of [-1, 1]) add(parent, new THREE.BoxGeometry(0.2, postH + 0.3, 0.2), wood, [sx * gate / 2, ground(sx * gate / 2, d / 2) + (postH + 0.3) / 2 - 0.05, d / 2]);
}

function trough(parent, x, z, y = 0) {
  add(parent, new THREE.BoxGeometry(1.8, 0.55, 0.7), mat(0x7d8a92, 0.4, { metalness: 0.4 }), [x, y + 0.27, z]);
  add(parent, new THREE.BoxGeometry(1.6, 0.05, 0.5), mat(0x4a8fb5, 0.1), [x, y + 0.52, z]);
}

function hayBale(parent, x, z, y = 0, ry = 0) {
  add(parent, new THREE.CylinderGeometry(0.6, 0.6, 1.1, 14), mat(0xd9b860, 1), [x, y + 0.6, z], [0, ry, Math.PI / 2]);
}

// ---------------------------------------------------------------- abris pour animaux

function kennel(label) {
  const g = new THREE.Group();
  const wood = mat(0xb5793f, 0.8);
  add(g, new THREE.BoxGeometry(1.3, 0.9, 1.5), wood, [0, 0.45, -0.1]);
  const roof = gable(1.5, 1.3, 0.55, mat(0xa83a2c, 0.7), 0.15);
  roof.rotation.y = Math.PI / 2;
  roof.position.set(0, 0.9, -0.1);
  g.add(roof);
  // Entrée arrondie
  add(g, new THREE.CircleGeometry(0.3, 18), mat(0x2a1d12, 1), [0, 0.42, 0.66]);
  add(g, new THREE.PlaneGeometry(0.6, 0.38), mat(0x2a1d12, 1), [0, 0.2, 0.66]);
  add(g, new THREE.CylinderGeometry(0.2, 0.22, 0.08, 16), mat(0x3f7cc4, 0.4), [0.55, 0.04, 0.75]);
  sign(g, label, '🐶', [0, 1.22, 0.36], 0.9);
  return g;
}

function hutch(label) {
  const g = new THREE.Group();
  const wood = mat(0xc69a62, 0.8);
  for (const [x, z] of [[-0.85, -0.35], [0.85, -0.35], [-0.85, 0.35], [0.85, 0.35]]) add(g, new THREE.BoxGeometry(0.1, 0.5, 0.1), wood, [x, 0.25, z]);
  add(g, new THREE.BoxGeometry(1.8, 0.75, 0.8), wood, [0, 0.88, 0]);
  // Grillage devant
  add(g, new THREE.PlaneGeometry(1.0, 0.55), mat(0xd8dde0, 0.4, { transparent: true, opacity: 0.55, metalness: 0.5 }), [-0.3, 0.88, 0.41]);
  add(g, new THREE.BoxGeometry(0.55, 0.55, 0.04), mat(0x8d6a40), [0.55, 0.88, 0.41]);
  add(g, new THREE.BoxGeometry(2, 0.08, 1.05), mat(0x5a6b4a, 0.8), [0, 1.3, 0], [0.12, 0, 0]);
  add(g, new THREE.BoxGeometry(0.6, 0.06, 0.9), mat(0xd9b860, 1), [-0.3, 0.52, 0.3]);
  sign(g, label, '🐰', [0, 1.55, 0.2], 1.0);
  return g;
}

function paddockModel(def, label, ground) {
  const g = new THREE.Group();
  fenceRect(g, def.w, def.d, def.gate, ground, 'white');
  trough(g, def.w / 2 - 1.6, -def.d / 2 + 1, ground(def.w / 2 - 1.6, -def.d / 2 + 1));
  sign(g, label, '🐴', [def.gate / 2 + 1.4, ground(def.gate / 2 + 1.4, def.d / 2) + 1.45, def.d / 2 + 0.05], 1.8);
  return g;
}

function pastureModel(def, label, ground) {
  const g = new THREE.Group();
  fenceRect(g, def.w, def.d, def.gate, ground, 'wood');
  trough(g, -def.w / 2 + 1.6, -def.d / 2 + 1, ground(-def.w / 2 + 1.6, -def.d / 2 + 1));
  hayBale(g, def.w / 2 - 2, -def.d / 2 + 1.5, ground(def.w / 2 - 2, -def.d / 2 + 1.5));
  sign(g, label, '🐑', [def.gate / 2 + 1.4, ground(def.gate / 2 + 1.4, def.d / 2) + 1.45, def.d / 2 + 0.05], 1.8);
  return g;
}

/** Abri de prairie : ouvert devant, un toit en pente sur des poteaux. */
function shelterModel(def, label) {
  const g = new THREE.Group();
  const { w, d } = def;
  const wood = mat(0x7a5236, 0.85);
  const plank = mat(0x8b6a4a, 0.9);
  for (const x of [-w / 2, 0, w / 2]) {
    add(g, new THREE.BoxGeometry(0.2, 2.8, 0.2), wood, [x, 1.4, d / 2 - 0.1]);
    add(g, new THREE.BoxGeometry(0.2, 2.3, 0.2), wood, [x, 1.15, -d / 2 + 0.1]);
  }
  add(g, new THREE.BoxGeometry(w, 2.2, 0.12), plank, [0, 1.1, -d / 2 + 0.06]);
  add(g, new THREE.BoxGeometry(0.12, 2.2, d - 0.3), plank, [-w / 2 + 0.06, 1.1, 0]);
  add(g, new THREE.BoxGeometry(0.12, 2.2, d - 0.3), plank, [w / 2 - 0.06, 1.1, 0]);
  add(g, new THREE.BoxGeometry(w + 0.8, 0.12, d + 0.8), mat(0x4f5a46, 0.8), [0, 2.6, 0], [-0.12, 0, 0]);
  add(g, new THREE.BoxGeometry(w - 0.4, 0.06, d - 0.4), mat(0xd6b65e, 1), [0, 0.03, 0]);
  sign(g, label, '🛖', [0, 2.35, d / 2 + 0.02], 1.8);
  return g;
}

/** Grange rouge avec une grande porte double. */
function barnModel(def, label, scale = 1) {
  const g = new THREE.Group();
  const w = def.w * scale;
  const d = def.d * scale;
  const h = 4.2 * Math.min(1, scale + 0.15);
  foundation(g, w, d);
  add(g, new THREE.BoxGeometry(w, h, d), mat(0xa63a2c, 0.85), [0, h / 2, 0]);
  const roof = gable(w, d, 2.8 * scale + 0.4, mat(0x4a4744, 0.7), 0.4);
  roof.position.y = h;
  g.add(roof);
  const white = mat(0xf2ede4, 0.6);
  const doorW = Math.min(4, w * 0.35);
  add(g, new THREE.BoxGeometry(doorW, 3, 0.1), mat(0x7a2a20, 0.7), [0, 1.5, d / 2 + 0.04]);
  add(g, new THREE.BoxGeometry(doorW + 0.2, 0.14, 0.14), white, [0, 3.05, d / 2 + 0.07]);
  for (const s of [-1, 1]) {
    add(g, new THREE.BoxGeometry(0.12, 3.1, 0.14), white, [s * (doorW / 2 + 0.05), 1.55, d / 2 + 0.07]);
    add(g, new THREE.BoxGeometry(0.1, 3.4, 0.12), white, [s * doorW / 4, 1.5, d / 2 + 0.09], [0, 0, s * 0.72]);
  }
  add(g, new THREE.BoxGeometry(1.2, 1, 0.1), white, [0, h + 0.9 * scale, d / 2 + 0.2]);
  sign(g, label, '🌾', [0, h - 0.5, d / 2 + 0.06], Math.min(3, w * 0.3), '#6b241b');
  hayBale(g, -w / 2 + 0.9, d / 2 + 1);
  return g;
}

/** Nouvelle écurie : quatre box avec portes de box. */
function stableModel(def, label) {
  const g = new THREE.Group();
  const { w, d } = def;
  const h = 3.3;
  foundation(g, w, d);
  add(g, new THREE.BoxGeometry(w, h, d), mat(0xc9a77a, 0.85), [0, h / 2, 0]);
  const roof = gable(w, d, 1.8, mat(0x3e4a52, 0.7), 1);
  roof.position.y = h;
  g.add(roof);
  const doorMat = mat(0x3f6b55, 0.7);
  const trim = mat(0xf2ede4, 0.7);
  for (let i = 0; i < 4; i++) {
    const x = -w / 2 + 2 + i * 4;
    add(g, new THREE.BoxGeometry(1.6, 1.3, 0.1), doorMat, [x, 0.65, d / 2 + 0.05]);
    add(g, new THREE.BoxGeometry(1.6, 0.9, 0.06), mat(0x1d2420, 1), [x, 1.8, d / 2 + 0.02]);
    add(g, new THREE.BoxGeometry(1.7, 0.08, 0.14), trim, [x, 1.32, d / 2 + 0.06]);
    add(g, new THREE.BoxGeometry(0.08, 1.3, 0.14), trim, [x, 0.65, d / 2 + 0.07], [0, 0, 0.9]);
  }
  sign(g, label, '🐴', [0, 2.75, d / 2 + 0.06], 3, '#2f4a3c');
  return g;
}

/** Carrière : sable, lettres de dressage et deux obstacles. */
function arenaModel(def, label, ground) {
  const g = new THREE.Group();
  const { w, d } = def;
  fenceRect(g, w, d, def.gate, ground, 'white');
  const sandGeo = new THREE.PlaneGeometry(w - 0.3, d - 0.3, Math.ceil(w / 2), Math.ceil(d / 2));
  sandGeo.rotateX(-Math.PI / 2);
  const pos = sandGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, ground(pos.getX(i), pos.getZ(i)) + 0.05);
  sandGeo.computeVertexNormals();
  const sand = new THREE.Mesh(sandGeo, mat(0xd2bb8e, 1));
  sand.receiveShadow = true;
  g.add(sand);
  const red = mat(0xc8463c, 0.6);
  const white = mat(0xf2f2f2, 0.6);
  for (const z of [-d / 4, d / 6]) {
    const y = ground(0, z);
    add(g, new THREE.BoxGeometry(0.15, 1.3, 0.15), white, [-1.6, y + 0.65, z]);
    add(g, new THREE.BoxGeometry(0.15, 1.3, 0.15), white, [1.6, y + 0.65, z]);
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 3.2, 8), red, [0, y + 0.85, z], [0, 0, Math.PI / 2]);
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 3.2, 8), white, [0, y + 0.45, z], [0, 0, Math.PI / 2]);
  }
  // Lettres de dressage
  const letters = [['A', 0, d / 2 - 0.6], ['C', 0, -d / 2 + 0.6], ['E', -w / 2 + 0.6, 0], ['B', w / 2 - 0.6, 0]];
  for (const [txt, x, z] of letters) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshStandardMaterial({ map: signTexture(txt, '#ffffff', '#2b2b2b'), roughness: 0.7, side: THREE.DoubleSide }));
    m.position.set(x, ground(x, z) + 0.7, z);
    m.lookAt(new THREE.Vector3(0, m.position.y, 0));
    g.add(m);
  }
  sign(g, label, '🏇', [def.gate / 2 + 1.5, ground(def.gate / 2 + 1.5, d / 2) + 1.45, d / 2 + 0.05], 2);
  return g;
}

/** Ranch : grande clôture rustique, arche d'entrée, grange au fond, abri et abreuvoir. */
function ranchModel(def, label, ground) {
  const g = new THREE.Group();
  const { w, d } = def;
  fenceRect(g, w, d, def.gate, ground, 'ranch');
  const wood = mat(0x6d4a2c, 0.9);
  // Arche d'entrée avec le panneau du ranch
  const gy = ground(0, d / 2);
  for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.3, 4, 0.3), wood, [s * (def.gate / 2 + 0.2), gy + 2, d / 2]);
  add(g, new THREE.BoxGeometry(def.gate + 1.2, 0.3, 0.3), wood, [0, gy + 3.9, d / 2]);
  const s1 = sign(g, label, '🤠', [0, gy + 3.25, d / 2 + 0.17], 3.4, '#5a3a22');
  const s2 = s1.clone();
  s2.rotation.y = Math.PI;
  s2.position.z = d / 2 - 0.17;
  g.add(s2);
  // Grange au fond à gauche, abri au fond à droite
  const barn = barnModel(STRUCTURES.barn, label, 0.85);
  const bx = RANCH_BARN.x;
  const bz = RANCH_BARN.z;
  barn.position.set(bx, ground(bx, bz), bz);
  g.add(barn);
  const shelter = shelterModel(STRUCTURES.shelter, label);
  shelter.position.set(9, ground(9, -d / 2 + 2.6), -d / 2 + 2.6);
  g.add(shelter);
  trough(g, 9, 2, ground(9, 2));
  hayBale(g, -2, -4, ground(-2, -4), 0.5);
  hayBale(g, 13, 6, ground(13, 6), 1.2);
  return g;
}

/** Position locale de la grange du ranch (pour sa collision). */
export const RANCH_BARN = { x: -8, z: -7, hw: (12 * 0.85) / 2 + 0.2, hd: (8 * 0.85) / 2 + 0.2 };

// ---------------------------------------------------------------- décorations

const FLOWER_COLORS = [0xe8556d, 0xf5d547, 0xffffff, 0x9d7de0, 0xff8c42];

function flowerBed() {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(2, 0.22, 1), mat(0x8a6a4a, 0.9), [0, 0.11, 0]);
  add(g, new THREE.BoxGeometry(1.8, 0.06, 0.8), mat(0x4a3424, 1), [0, 0.22, 0]);
  const stem = mat(0x4f8a32, 0.9);
  const geo = new THREE.IcosahedronGeometry(0.09, 1);
  for (let i = 0; i < 18; i++) {
    const x = -0.8 + (i % 6) * 0.32;
    const z = -0.28 + Math.floor(i / 6) * 0.28;
    add(g, new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4), stem, [x, 0.38, z]);
    add(g, geo, mat(FLOWER_COLORS[i % FLOWER_COLORS.length], 0.6), [x, 0.55, z]);
  }
  return g;
}

function tree() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.16, 0.26, 2.4, 8), mat(0x5b3f2b, 0.95), [0, 1.2, 0]);
  const leaf = mat(0x4f8a32, 0.9);
  for (const [x, y, z, r] of [[0, 3, 0, 1.3], [0.7, 2.6, 0.3, 0.9], [-0.6, 2.7, -0.3, 0.9], [0.1, 3.7, -0.2, 0.8]]) {
    add(g, new THREE.IcosahedronGeometry(r, 1), leaf, [x, y, z]);
  }
  return g;
}

function bench() {
  const g = new THREE.Group();
  const wood = mat(0x9a6a3e, 0.8);
  const iron = mat(0x2b2b2b, 0.5, { metalness: 0.5 });
  add(g, new THREE.BoxGeometry(1.8, 0.08, 0.45), wood, [0, 0.45, 0]);
  add(g, new THREE.BoxGeometry(1.8, 0.4, 0.06), wood, [0, 0.75, -0.2], [-0.15, 0, 0]);
  for (const x of [-0.8, 0.8]) add(g, new THREE.BoxGeometry(0.08, 0.45, 0.45), iron, [x, 0.22, 0]);
  return g;
}

function fenceSegment(ground) {
  const g = new THREE.Group();
  const wood = mat(0x8a6440, 0.9);
  for (const x of [-2, 0, 2]) add(g, new THREE.BoxGeometry(0.14, 1.2, 0.14), wood, [x, ground(x, 0) + 0.55, 0]);
  for (const y of [0.45, 0.95]) {
    for (const [a, b] of [[-2, 0], [0, 2]]) {
      const ya = ground(a, 0);
      const yb = ground(b, 0);
      const r = add(g, new THREE.BoxGeometry(2, 0.1, 0.06), wood, [(a + b) / 2, (ya + yb) / 2 + y, 0]);
      r.rotation.z = Math.atan2(yb - ya, 2);
    }
  }
  return g;
}

// ---------------------------------------------------------------- point d'entrée

/** Construit le modèle d'une structure. label : nom affiché sur le panneau. */
export function buildStructureModel(type, label = '', ground = FLAT) {
  const def = STRUCTURES[type];
  switch (type) {
    case 'kennel': return kennel(label);
    case 'hutch': return hutch(label);
    case 'paddockSmall':
    case 'paddockLarge': return paddockModel(def, label, ground);
    case 'pasture': return pastureModel(def, label, ground);
    case 'shelter': return shelterModel(def, label);
    case 'barn': return barnModel(def, label);
    case 'arena': return arenaModel(def, label, ground);
    case 'newStable': return stableModel(def, label);
    case 'salon': return salonModel(def, label);
    case 'ranch': return ranchModel(def, label, ground);
    case 'flowerBed': return flowerBed();
    case 'tree': return tree();
    case 'bench': return bench();
    case 'fence': return fenceSegment(ground);
    default: return new THREE.Group();
  }
}
