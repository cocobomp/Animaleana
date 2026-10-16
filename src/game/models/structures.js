// Modèles 3D des constructions du joueur : niche, clapier, paddocks, pré, abri, grange, carrière,
// nouvelle écurie, ranch et décorations. Tout est généré par le code.
// Repère local : la façade (ou l'ouverture) regarde vers +z, comme les autres bâtiments.
// ground(lx, lz) donne la hauteur du sol par rapport au centre (pour que les clôtures suivent le terrain).
// Les pièces fixes sont fusionnées par matériau (un appel de rendu par matériau).

import * as THREE from 'three';
import { signTexture, planksTexture, roofTexture, stoneTexture, strawTexture, buildingNormal } from '../textures.js';
import { MeshBatch } from './shapes.js';
import { STRUCTURES } from '../../sim/construction.js';

const mat = (color, roughness = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const FLAT = () => 0;

/** Copie d'une texture partagée avec sa propre répétition. */
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

/** Couleur + relief (relief seulement en qualité « high »). */
function surface(kind, colorTex, rx = 1, ry = 1, rot = 0, scale = 0.7) {
  const out = { map: tiled(colorTex, rx, ry, rot) };
  const n = buildingNormal(kind);
  if (n) {
    out.normalMap = tiled(n, rx, ry, rot);
    out.normalScale = new THREE.Vector2(scale, scale);
  }
  return out;
}

const planks = (color, rx = 1, ry = 1, rough = 0.85) => mat(color, rough, surface('planks', planksTexture(), rx, ry, 0, 0.7));
const roofing = (color, kind = 'shingle') => mat(color, 0.8, surface(`roof-${kind}`, roofTexture(kind), 0.5, 0.5, Math.PI / 2, 0.8));
const stone = (color = 0xd0cac0) => mat(color, 0.95, surface('stone', stoneTexture(), 1, 1, 0, 0.9));

/** Les pièces d'un groupe s'accumulent dans un lot, construit par flush(). */
function batchOf(parent) {
  if (!parent.userData.batch) parent.userData.batch = new MeshBatch();
  return parent.userData.batch;
}

function add(parent, geo, material, pos, rot, scale) {
  batchOf(parent).add(geo, material, pos, rot, scale);
}

function flush(parent) {
  parent.userData.batch?.build(parent);
  delete parent.userData.batch;
  return parent;
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

/** Toit à deux pans (faîte le long de x), avec son épaisseur. */
function gableGeo(w, d, h, overhang = 0.3) {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2 - overhang, -0.1);
  shape.lineTo(d / 2 + overhang, -0.1);
  shape.lineTo(d / 2 + overhang, 0);
  shape.lineTo(0, h);
  shape.lineTo(-d / 2 - overhang, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w + overhang * 2, bevelEnabled: false });
  geo.translate(0, 0, -(w + overhang * 2) / 2);
  geo.rotateY(Math.PI / 2);
  return geo;
}

/** Toit complet : pans, faîtage et pignons (triangles de mur). */
function roof(parent, w, d, h, y, material, wallMat, overhang = 0.3, tile = 1.6) {
  add(parent, gableGeo(w, d, h, overhang), material, [0, y, 0]);
  add(parent, new THREE.BoxGeometry(w + overhang * 2 + 0.1, 0.14, 0.3), mat(new THREE.Color(material.color).multiplyScalar(0.8).getHex(), 0.7), [0, y + h + 0.02, 0]);
  if (wallMat) {
    const gable = new THREE.Shape();
    gable.moveTo(-d / 2, 0);
    gable.lineTo(d / 2, 0);
    gable.lineTo(0, h * (d / 2) / (d / 2 + overhang));
    gable.closePath();
    for (const s of [-1, 1]) {
      const g = new THREE.ShapeGeometry(gable);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
      add(parent, g, wallMat, [s * w / 2, y, 0], [0, s * Math.PI / 2, 0]);
    }
  }
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
  add(parent, box(w + 0.3, 1.4, d + 0.3, 1.6), stone(0x9c948a), [0, -0.55, 0]);
}

/**
 * Clôture rectangulaire avec une ouverture au milieu du côté avant (+z).
 * Les poteaux suivent le sol (instances), les lisses relient les poteaux (un seul maillage).
 */
function fenceRect(parent, w, d, gate, ground, style = 'white') {
  const wood = style === 'white' ? planks(0xeee6d8, 0.15, 0.6, 0.75) : planks(0x8a6440, 0.15, 0.6, 0.9);
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
  posts.receiveShadow = true;
  parent.add(posts);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const ya = ground(ax, az);
    const yb = ground(bx, bz);
    const len = Math.hypot(bx - ax, bz - az, yb - ya);
    const rot = new THREE.Euler(0, -Math.atan2(bz - az, bx - ax), Math.atan2(yb - ya, Math.hypot(bx - ax, bz - az)), 'YZX');
    for (const y of rails) {
      add(parent, new THREE.BoxGeometry(len, 0.1, 0.06), wood, [(ax + bx) / 2, (ya + yb) / 2 + y, (az + bz) / 2], rot);
    }
  }
  // Poteaux de l'ouverture un peu plus hauts, avec un chapeau.
  for (const sx of [-1, 1]) {
    add(parent, new THREE.BoxGeometry(0.2, postH + 0.3, 0.2), wood, [sx * gate / 2, ground(sx * gate / 2, d / 2) + (postH + 0.3) / 2 - 0.05, d / 2]);
    add(parent, new THREE.BoxGeometry(0.28, 0.06, 0.28), wood, [sx * gate / 2, ground(sx * gate / 2, d / 2) + postH + 0.27, d / 2]);
  }
}

function trough(parent, x, z, y = 0) {
  add(parent, new THREE.BoxGeometry(1.8, 0.55, 0.7), mat(0x7d8a92, 0.4, { metalness: 0.4 }), [x, y + 0.27, z]);
  add(parent, new THREE.BoxGeometry(1.86, 0.06, 0.76), mat(0x7d8a92, 0.4, { metalness: 0.4 }), [x, y + 0.55, z]);
  add(parent, new THREE.BoxGeometry(1.6, 0.05, 0.5), mat(0x4a8fb5, 0.1, { metalness: 0.3 }), [x, y + 0.52, z]);
}

function hayBale(parent, x, z, y = 0, ry = 0) {
  add(parent, new THREE.CylinderGeometry(0.6, 0.6, 1.1, 14), mat(0xffffff, 1, { map: tiled(strawTexture(), 3, 1) }), [x, y + 0.6, z], [0, ry, Math.PI / 2]);
}

// ---------------------------------------------------------------- abris pour animaux

function kennel(label) {
  const g = new THREE.Group();
  const wood = planks(0xb5793f, 0.6, 0.6);
  add(g, box(1.3, 0.9, 1.5, 1), wood, [0, 0.45, -0.1]);
  add(g, gableGeo(1.5, 1.3, 0.55, 0.15), roofing(0xa83a2c), [0, 0.9, -0.1], [0, Math.PI / 2, 0]);
  // Entrée arrondie et encadrement clair.
  const dark = mat(0x2a1d12, 1);
  const trim = mat(0xf2ede4, 0.7);
  add(g, new THREE.CircleGeometry(0.36, 18), trim, [0, 0.42, 0.655]);
  add(g, new THREE.PlaneGeometry(0.72, 0.42), trim, [0, 0.2, 0.655]);
  add(g, new THREE.CircleGeometry(0.3, 18), dark, [0, 0.42, 0.66]);
  add(g, new THREE.PlaneGeometry(0.6, 0.38), dark, [0, 0.2, 0.66]);
  add(g, new THREE.CylinderGeometry(0.2, 0.22, 0.08, 16), mat(0x3f7cc4, 0.4), [0.55, 0.04, 0.75]);
  flush(g);
  sign(g, label, '🐶', [0, 1.22, 0.36], 0.9);
  return g;
}

function hutch(label) {
  const g = new THREE.Group();
  const wood = planks(0xc69a62, 0.6, 0.6);
  for (const [x, z] of [[-0.85, -0.35], [0.85, -0.35], [-0.85, 0.35], [0.85, 0.35]]) add(g, new THREE.BoxGeometry(0.1, 0.5, 0.1), wood, [x, 0.25, z]);
  add(g, box(1.8, 0.75, 0.8, 1), wood, [0, 0.88, 0]);
  // Grillage devant et petite porte pleine.
  add(g, new THREE.PlaneGeometry(1.0, 0.55), mat(0xd8dde0, 0.4, { transparent: true, opacity: 0.55, metalness: 0.5 }), [-0.3, 0.88, 0.41]);
  add(g, new THREE.BoxGeometry(0.55, 0.55, 0.04), planks(0x8d6a40, 0.3, 0.3), [0.55, 0.88, 0.41]);
  add(g, new THREE.BoxGeometry(2, 0.08, 1.05), roofing(0x5a6b4a), [0, 1.3, 0], [0.12, 0, 0]);
  add(g, new THREE.BoxGeometry(0.6, 0.06, 0.9), mat(0xffffff, 1, { map: tiled(strawTexture(), 1, 1) }), [-0.3, 0.52, 0.3]);
  flush(g);
  sign(g, label, '🐰', [0, 1.55, 0.2], 1.0);
  return g;
}

function paddockModel(def, label, ground) {
  const g = new THREE.Group();
  fenceRect(g, def.w, def.d, def.gate, ground, 'white');
  trough(g, def.w / 2 - 1.6, -def.d / 2 + 1, ground(def.w / 2 - 1.6, -def.d / 2 + 1));
  flush(g);
  sign(g, label, '🐴', [def.gate / 2 + 1.4, ground(def.gate / 2 + 1.4, def.d / 2) + 1.45, def.d / 2 + 0.05], 1.8);
  return g;
}

function pastureModel(def, label, ground) {
  const g = new THREE.Group();
  fenceRect(g, def.w, def.d, def.gate, ground, 'wood');
  trough(g, -def.w / 2 + 1.6, -def.d / 2 + 1, ground(-def.w / 2 + 1.6, -def.d / 2 + 1));
  hayBale(g, def.w / 2 - 2, -def.d / 2 + 1.5, ground(def.w / 2 - 2, -def.d / 2 + 1.5));
  flush(g);
  sign(g, label, '🐑', [def.gate / 2 + 1.4, ground(def.gate / 2 + 1.4, def.d / 2) + 1.45, def.d / 2 + 0.05], 1.8);
  return g;
}

/** Abri de prairie : ouvert devant, un toit en pente sur des poteaux. */
function shelterModel(def, label) {
  const g = new THREE.Group();
  const { w, d } = def;
  const wood = planks(0x7a5236, 0.3, 0.3);
  const plank = planks(0x8b6a4a, 1, 1);
  for (const x of [-w / 2, 0, w / 2]) {
    add(g, new THREE.BoxGeometry(0.2, 2.8, 0.2), wood, [x, 1.4, d / 2 - 0.1]);
    add(g, new THREE.BoxGeometry(0.2, 2.3, 0.2), wood, [x, 1.15, -d / 2 + 0.1]);
  }
  add(g, box(w, 2.2, 0.12, 1.6), plank, [0, 1.1, -d / 2 + 0.06]);
  add(g, box(0.12, 2.2, d - 0.3, 1.6), plank, [-w / 2 + 0.06, 1.1, 0]);
  add(g, box(0.12, 2.2, d - 0.3, 1.6), plank, [w / 2 - 0.06, 1.1, 0]);
  add(g, new THREE.BoxGeometry(w + 0.8, 0.12, d + 0.8), roofing(0x4f5a46), [0, 2.6, 0], [-0.12, 0, 0]);
  add(g, new THREE.BoxGeometry(w - 0.4, 0.06, d - 0.4), mat(0xffffff, 1, { map: tiled(strawTexture(), 3, 2) }), [0, 0.03, 0]);
  flush(g);
  sign(g, label, '🛖', [0, 2.35, d / 2 + 0.02], 1.8);
  return g;
}

/** Grange rouge avec une grande porte double, trappe de fenil et finitions blanches. */
function barnModel(def, label, scale = 1) {
  const g = new THREE.Group();
  const w = def.w * scale;
  const d = def.d * scale;
  const h = 4.2 * Math.min(1, scale + 0.15);
  foundation(g, w, d);
  const wall = planks(0xa63a2c, 1, 1);
  add(g, box(w, h, d, 1.6), wall, [0, h / 2, 0]);
  const rh = 2.8 * scale + 0.4;
  roof(g, w, d, rh, h, roofing(0x4a4744, 'shingle'), wall, 0.4);
  const white = mat(0xf2ede4, 0.6);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, new THREE.BoxGeometry(0.2, h, 0.2), white, [sx * (w / 2 + 0.01), h / 2, sz * (d / 2 + 0.01)]);
  const doorW = Math.min(4, w * 0.35);
  add(g, new THREE.BoxGeometry(doorW, 3, 0.1), planks(0x7a2a20, 0.5, 0.5, 0.7), [0, 1.5, d / 2 + 0.04]);
  add(g, new THREE.BoxGeometry(doorW + 0.2, 0.14, 0.14), white, [0, 3.05, d / 2 + 0.07]);
  for (const s of [-1, 1]) {
    add(g, new THREE.BoxGeometry(0.12, 3.1, 0.14), white, [s * (doorW / 2 + 0.05), 1.55, d / 2 + 0.07]);
    add(g, new THREE.BoxGeometry(0.1, 3.4, 0.12), white, [s * doorW / 4, 1.5, d / 2 + 0.09], [0, 0, s * 0.72]);
  }
  add(g, new THREE.BoxGeometry(0.08, 3.0, 0.14), white, [0, 1.5, d / 2 + 0.09]);
  // Trappe du fenil dans le pignon avant.
  add(g, new THREE.BoxGeometry(1.2, 1, 0.1), white, [0, h + 0.9 * scale, d / 2 + 0.2]);
  add(g, new THREE.BoxGeometry(1.0, 0.8, 0.1), mat(0x2a1a14, 0.9), [0, h + 0.9 * scale, d / 2 + 0.22]);
  hayBale(g, -w / 2 + 0.9, d / 2 + 1);
  flush(g);
  sign(g, label, '🌾', [0, h - 0.5, d / 2 + 0.06], Math.min(3, w * 0.3), '#6b241b');
  return g;
}

/** Nouvelle écurie : quatre box avec portes de box. */
function stableModel(def, label) {
  const g = new THREE.Group();
  const { w, d } = def;
  const h = 3.3;
  foundation(g, w, d);
  const wall = planks(0xc9a77a, 1, 1);
  add(g, box(w, h, d, 1.6), wall, [0, h / 2, 0]);
  roof(g, w, d, 1.8, h, roofing(0x3e4a52, 'slate'), wall, 1);
  const doorMat = planks(0x3f6b55, 0.5, 0.5, 0.7);
  const trim = mat(0xf2ede4, 0.7);
  const dark = mat(0x1d2420, 1);
  for (let i = 0; i < 4; i++) {
    const x = -w / 2 + 2 + i * 4;
    add(g, new THREE.BoxGeometry(1.6, 1.3, 0.1), doorMat, [x, 0.65, d / 2 + 0.05]);
    add(g, new THREE.BoxGeometry(1.6, 0.9, 0.06), dark, [x, 1.8, d / 2 + 0.02]);
    add(g, new THREE.BoxGeometry(1.7, 0.08, 0.14), trim, [x, 1.32, d / 2 + 0.06]);
    add(g, new THREE.BoxGeometry(1.7, 0.08, 0.14), trim, [x, 2.28, d / 2 + 0.06]);
    for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.08, 2.3, 0.14), trim, [x + s * 0.82, 1.15, d / 2 + 0.06]);
    add(g, new THREE.BoxGeometry(0.08, 1.3, 0.14), trim, [x, 0.65, d / 2 + 0.07], [0, 0, 0.9]);
  }
  flush(g);
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
  flush(g);
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
  const wood = planks(0x6d4a2c, 0.3, 0.3);
  // Arche d'entrée avec le panneau du ranch
  const gy = ground(0, d / 2);
  for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.3, 4, 0.3), wood, [s * (def.gate / 2 + 0.2), gy + 2, d / 2]);
  add(g, new THREE.BoxGeometry(def.gate + 1.2, 0.3, 0.3), wood, [0, gy + 3.9, d / 2]);
  trough(g, 9, 2, ground(9, 2));
  hayBale(g, -2, -4, ground(-2, -4), 0.5);
  hayBale(g, 13, 6, ground(13, 6), 1.2);
  flush(g);
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
  return g;
}

/** Position locale de la grange du ranch (pour sa collision). */
export const RANCH_BARN = { x: -8, z: -7, hw: (12 * 0.85) / 2 + 0.2, hd: (8 * 0.85) / 2 + 0.2 };

// ---------------------------------------------------------------- décorations

const FLOWER_COLORS = [0xe8556d, 0xf5d547, 0xffffff, 0x9d7de0, 0xff8c42];

function flowerBed() {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(2, 0.22, 1), planks(0x8a6a4a, 1, 0.3), [0, 0.11, 0]);
  add(g, new THREE.BoxGeometry(1.8, 0.06, 0.8), mat(0x4a3424, 1), [0, 0.22, 0]);
  const stem = mat(0x4f8a32, 0.9);
  const petals = FLOWER_COLORS.map((c) => mat(c, 0.6));
  for (let i = 0; i < 18; i++) {
    const x = -0.8 + (i % 6) * 0.32;
    const z = -0.28 + Math.floor(i / 6) * 0.28;
    add(g, new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4), stem, [x, 0.38, z]);
    add(g, new THREE.IcosahedronGeometry(0.09, 1), petals[i % petals.length], [x, 0.55, z]);
  }
  return flush(g);
}

function tree() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.16, 0.26, 2.4, 8), mat(0x5b3f2b, 0.95), [0, 1.2, 0]);
  const leaf = mat(0x4f8a32, 0.9);
  for (const [x, y, z, r] of [[0, 3, 0, 1.3], [0.7, 2.6, 0.3, 0.9], [-0.6, 2.7, -0.3, 0.9], [0.1, 3.7, -0.2, 0.8]]) {
    add(g, new THREE.IcosahedronGeometry(r, 1), leaf, [x, y, z]);
  }
  return flush(g);
}

function bench() {
  const g = new THREE.Group();
  const wood = planks(0x9a6a3e, 1, 0.3, 0.8);
  const iron = mat(0x2b2b2b, 0.5, { metalness: 0.5 });
  add(g, new THREE.BoxGeometry(1.8, 0.08, 0.45), wood, [0, 0.45, 0]);
  add(g, new THREE.BoxGeometry(1.8, 0.4, 0.06), wood, [0, 0.75, -0.2], [-0.15, 0, 0]);
  for (const x of [-0.8, 0.8]) add(g, new THREE.BoxGeometry(0.08, 0.45, 0.45), iron, [x, 0.22, 0]);
  return flush(g);
}

function fenceSegment(ground) {
  const g = new THREE.Group();
  const wood = planks(0x8a6440, 0.15, 0.6, 0.9);
  for (const x of [-2, 0, 2]) add(g, new THREE.BoxGeometry(0.14, 1.2, 0.14), wood, [x, ground(x, 0) + 0.55, 0]);
  for (const y of [0.45, 0.95]) {
    for (const [a, b] of [[-2, 0], [0, 2]]) {
      const ya = ground(a, 0);
      const yb = ground(b, 0);
      add(g, new THREE.BoxGeometry(2, 0.1, 0.06), wood, [(a + b) / 2, (ya + yb) / 2 + y, 0], [0, 0, Math.atan2(yb - ya, 2)]);
    }
  }
  return flush(g);
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
    case 'ranch': return ranchModel(def, label, ground);
    case 'flowerBed': return flowerBed();
    case 'tree': return tree();
    case 'bench': return bench();
    case 'fence': return fenceSegment(ground);
    default: return new THREE.Group();
  }
}
