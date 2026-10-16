// Bâtiments et décor : maison, écurie, refuge, clinique, gîte, clôtures…
// Chaque bâtiment regarde vers +Z (la porte est devant).
// Les matériaux (enduit, planches, tuiles, ardoises, pierres) sont des textures dessinées par le code,
// avec un relief léger (cartes de normales) en qualité « high ».
// Toutes les pièces fixes d'un bâtiment sont fusionnées par matériau (MeshBatch) :
// une dizaine d'appels de rendu par bâtiment au lieu d'une centaine.

import * as THREE from 'three';
import { signTexture, plasterTexture, planksTexture, roofTexture, stoneTexture, strawTexture, buildingNormal } from '../textures.js';
import { MeshBatch } from './shapes.js';

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

/** Couleur + relief d'une surface de bâtiment (le relief n'existe qu'en qualité « high »). */
function surface(kind, colorTex, rx = 1, ry = 1, rot = 0, scale = 0.7) {
  const out = { map: tiled(colorTex, rx, ry, rot) };
  const n = buildingNormal(kind);
  if (n) {
    out.normalMap = tiled(n, rx, ry, rot);
    out.normalScale = new THREE.Vector2(scale, scale);
  }
  return out;
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

/** Géométrie d'un toit à deux pans (faîte le long de x), épaisseur 0,12 m. */
function gableRoofGeo(w, d, h, overhang = 0.5) {
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
  return geo;
}

/** Triangle de pignon (UV en mètres / tile). */
function gableGeo(d, h, tile) {
  const gable = new THREE.Shape();
  gable.moveTo(-d / 2, 0);
  gable.lineTo(d / 2, 0);
  gable.lineTo(0, h);
  gable.closePath();
  const g = new THREE.ShapeGeometry(gable);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
  return g;
}

/** Cylindre entre deux points (gouttières, descentes). */
function tube(b, material, a, c, r, seg = 8) {
  const A = new THREE.Vector3(...a);
  const C = new THREE.Vector3(...c);
  const len = A.distanceTo(C);
  const mid = A.clone().add(C).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), C.clone().sub(A).normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  b.add(new THREE.CylinderGeometry(r, r, len, seg), material, mid.toArray(), [e.x, e.y, e.z]);
}

/** Fenêtres et lanternes qui s'allument la nuit : le monde garde la liste de leurs matériaux. */
export const windowMaterials = [];

function windowMat() {
  // Vitre : un peu métallique et très lisse, elle reflète le ciel (éclairage par l'environnement).
  const m = mat(0x8fa6b8, 0.08, { emissive: 0xffc66b, emissiveIntensity: 0, metalness: 0.7, envMapIntensity: 1.3 });
  windowMaterials.push(m);
  return m;
}

function lampMat() {
  const m = mat(0xfff0c8, 0.3, { emissive: 0xffc66b, emissiveIntensity: 0 });
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

/** Matériaux d'un bâtiment (partagés par toutes ses pièces). */
function materials({ wall, roof, wallTex, roofTex, doorColor, shutters, trimColor }) {
  const wallSurf = wallTex === 'planks' ? surface('planks', planksTexture(), 1, 1, 0, 0.8) : surface('plaster', plasterTexture(), 1, 1, 0, 0.55);
  const M = {
    wall: mat(wall, 0.9, wallSurf),
    stone: mat(0xd8d2c8, 0.95, surface('stone', stoneTexture(), 1, 1, 0, 0.9)),
    trim: mat(trimColor, 0.7),
    roof: mat(roof, 0.8, surface(`roof-${roofTex}`, roofTexture(roofTex), 0.5, 0.5, Math.PI / 2, 0.8)),
    ridge: mat(new THREE.Color(roof).multiplyScalar(0.8).getHex(), 0.7),
    zinc: mat(0x8e969c, 0.45, { metalness: 0.55 }),
    door: mat(doorColor, 0.6, surface('planks', planksTexture(), 0.5, 0.5, 0, 0.6)),
    brass: mat(0xd2ab4e, 0.3, { metalness: 0.85 }),
    iron: mat(0x2c2c30, 0.6, { metalness: 0.4 }),
    glass: windowMat(),
    lamp: lampMat(),
    dark: mat(0x1c1612, 0.95),
  };
  if (shutters) M.shutter = mat(shutters, 0.75, surface('planks', planksTexture(), 0.3, 0.5, 0, 0.5));
  return M;
}

/** Fenêtre : encadrement, vitre, croisillons, linteau, appui et volets éventuels. rotY oriente la façade. */
function windowAt(b, M, x, y, z, rotY, { w = 0.92, h = 1.02 } = {}) {
  b.local([x, y, z], rotY, () => {
    const fw = w + 0.18;
    const fh = h + 0.18;
    b.add(new THREE.BoxGeometry(fw, fh, 0.1), M.trim, [0, 0, 0]);
    b.add(new THREE.BoxGeometry(w, h, 0.08), M.glass, [0, 0, 0.02]);
    b.add(new THREE.BoxGeometry(0.05, h, 0.12), M.trim, [0, 0, 0.03]);
    b.add(new THREE.BoxGeometry(w, 0.05, 0.12), M.trim, [0, h * 0.1, 0.03]);
    // Appui saillant et linteau.
    b.add(new THREE.BoxGeometry(fw + 0.16, 0.08, 0.22), M.trim, [0, -fh / 2 - 0.02, 0.07]);
    b.add(new THREE.BoxGeometry(fw + 0.1, 0.1, 0.14), M.trim, [0, fh / 2 + 0.03, 0.03]);
    if (M.shutter) {
      for (const s of [-1, 1]) {
        const sw = w * 0.6;
        b.add(new THREE.BoxGeometry(sw, fh, 0.05), M.shutter, [s * (fw / 2 + sw / 2 + 0.02), 0, 0.04]);
        // Barres et écharpe (Z) des volets.
        for (const k of [-0.36, 0.36]) b.add(new THREE.BoxGeometry(sw - 0.06, 0.05, 0.02), M.shutter, [s * (fw / 2 + sw / 2 + 0.02), k * fh, 0.075]);
        b.add(new THREE.BoxGeometry(0.05, fh * 0.68, 0.02), M.shutter, [s * (fw / 2 + sw / 2 + 0.02), 0, 0.075], [0, 0, s * 0.62]);
      }
    }
  });
}

/** Porte à panneaux avec encadrement, poignée, seuil en pierre et lanterne. */
function door(b, M, w, z) {
  b.add(new THREE.BoxGeometry(w + 0.24, 2.3, 0.1), M.trim, [0, 1.13, z]);
  b.add(new THREE.BoxGeometry(w, 2.1, 0.1), M.door, [0, 1.05, z + 0.03]);
  for (const y of [0.55, 1.5]) {
    for (const x of [-w / 4, w / 4]) b.add(new THREE.BoxGeometry(w * 0.36, 0.7, 0.04), M.door, [x, y, z + 0.09]);
  }
  b.add(new THREE.SphereGeometry(0.045, 10, 8), M.brass, [w * 0.38, 1.05, z + 0.13]);
  b.add(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8), M.brass, [w * 0.38, 1.05, z + 0.1], [Math.PI / 2, 0, 0]);
  // Seuil en pierre et linteau.
  b.add(new THREE.BoxGeometry(w + 0.5, 0.12, 0.5), M.stone, [0, 0.06, z + 0.2]);
  b.add(new THREE.BoxGeometry(w + 0.4, 0.14, 0.16), M.trim, [0, 2.34, z + 0.03]);
  // Lanterne à côté de la porte (elle s'allume la nuit).
  const lx = w / 2 + 0.42;
  b.add(new THREE.BoxGeometry(0.05, 0.05, 0.22), M.iron, [lx, 2.2, z + 0.1]);
  b.add(new THREE.BoxGeometry(0.16, 0.22, 0.16), M.lamp, [lx, 2.05, z + 0.2]);
  b.add(new THREE.BoxGeometry(0.2, 0.04, 0.2), M.iron, [lx, 2.18, z + 0.2]);
  b.add(new THREE.BoxGeometry(0.2, 0.03, 0.2), M.iron, [lx, 1.93, z + 0.2]);
}

/**
 * Bâtiment générique : murs, soubassement, chaînages d'angle, toit à deux pans avec rives,
 * gouttières et descentes, pignons, porte, fenêtres, cheminée éventuelle.
 * Renvoie le chantier { g, b, M, w, d, h, roofH, ov } : les pièces en plus s'ajoutent à b avant finish().
 */
function building({
  w, d, h, wall, roof, roofH = 2.2, doorColor = 0x6a4126, windows = 2, doorW = 1.2, wallTex = 'plaster', roofTex = 'slate',
  shutters = null, chimney = null, overhang = 0.5, trimColor = 0xf1ebe0,
}) {
  const g = new THREE.Group();
  const b = new MeshBatch();
  const M = materials({ wall, roof, wallTex, roofTex, doorColor, shutters, trimColor });
  const tile = wallTex === 'planks' ? 1.6 : 3;
  const ov = overhang;

  b.add(box(w, h, d, tile), M.wall, [0, h / 2, 0]);
  // Soubassement en pierre.
  b.add(box(w + 0.16, 0.55, d + 0.16, 1.6), M.stone, [0, 0.27, 0]);
  // Chaînages d'angle.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(new THREE.BoxGeometry(0.24, h - 0.5, 0.24), M.trim, [sx * (w / 2 + 0.01), h / 2 + 0.25, sz * (d / 2 + 0.01)]);
  // Toit, faîtage, planches de rive, gouttières.
  b.add(gableRoofGeo(w, d, roofH, ov), M.roof, [0, h, 0]);
  b.add(new THREE.BoxGeometry(w + ov * 2 + 0.1, 0.16, 0.34), M.ridge, [0, h + roofH + 0.02, 0]);
  for (const sz of [-1, 1]) {
    b.add(new THREE.BoxGeometry(w + ov * 2 + 0.06, 0.2, 0.06), M.trim, [0, h - 0.04, sz * (d / 2 + ov)]);
    tube(b, M.zinc, [-(w / 2 + ov), h - 0.14, sz * (d / 2 + ov + 0.05)], [w / 2 + ov, h - 0.14, sz * (d / 2 + ov + 0.05)], 0.065, 8);
  }
  // Descentes de gouttière aux deux coins arrière-droit et avant-gauche : un coude sous le débord
  // (de la gouttière vers le mur), puis un tuyau vertical collé au chaînage d'angle.
  for (const [sx, sz] of [[1, 1], [-1, -1]]) {
    const px = sx * (w / 2 + 0.19);
    const pz = sz * (d / 2 + 0.19);
    tube(b, M.zinc, [px, h - 0.16, sz * (d / 2 + ov + 0.05)], [px, h - 0.32, pz], 0.04);
    tube(b, M.zinc, [px, h - 0.32, pz], [px, 0.12, pz], 0.04);
  }
  // Pignons (triangles de mur sous le toit) et planches de rive.
  const slope = Math.atan2(roofH, d / 2 + ov);
  const slopeLen = Math.hypot(roofH, d / 2 + ov);
  const gg = gableGeo(d, roofH * (d / 2) / (d / 2 + ov), tile);
  for (const s of [-1, 1]) {
    b.add(s > 0 ? gg : gg.clone(), M.wall, [s * w / 2, h, 0], [0, s * Math.PI / 2, 0]);
    for (const sz of [-1, 1]) {
      b.add(new THREE.BoxGeometry(0.06, 0.2, slopeLen + 0.1), M.trim, [s * (w / 2 + ov + 0.02), h + roofH / 2 - 0.08, sz * (d / 2 + ov) / 2], [sz * slope, 0, 0]);
    }
  }
  door(b, M, doorW, d / 2 + 0.02);
  for (let i = 0; i < windows; i++) {
    const x = (i % 2 === 0 ? -1 : 1) * (w * 0.3 + Math.floor(i / 2) * 0.6);
    windowAt(b, M, x, h * 0.55, d / 2 + 0.03, 0);
    windowAt(b, M, w / 2 + 0.03, h * 0.55, (i % 2 === 0 ? -1 : 1) * d / 4, Math.PI / 2);
  }
  if (chimney) {
    const [cx, cz] = chimney;
    const top = h + roofH + 0.6;
    const base = h + roofH * Math.max(0, 1 - Math.abs(cz) / (d / 2 + ov)) - 0.6;
    b.add(box(0.8, top - base, 0.8, 1.2), M.stone, [cx, (top + base) / 2, cz]);
    b.add(new THREE.BoxGeometry(0.96, 0.12, 0.96), M.iron, [cx, top + 0.06, cz]);
    b.add(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 10), M.iron, [cx, top + 0.25, cz]);
  }
  return { g, b, M, w, d, h, roofH, ov };
}

function finish(site, size) {
  site.b.build(site.g);
  return { group: site.g, size };
}

export function house(label) {
  const s = building({ w: 10, d: 7, h: 4, wall: 0xf1e6d2, roof: 0x55606a, windows: 2, roofTex: 'slate', shutters: 0x5b7f8f, chimney: [2.5, -1] });
  // Petit perron.
  s.b.add(box(2.4, 0.25, 1.2, 1.2), s.M.stone, [0, 0.12, 4.1]);
  sign(s.g, label, [0, 3.3, 3.56], '#5b4636', '🏠', 2.4);
  return finish(s, [10, 7]);
}

export function stable(label) {
  const g = new THREE.Group();
  const b = new MeshBatch();
  const w = 16;
  const d = 7;
  const h = 3.4;
  const M = materials({ wall: 0x9a6640, roof: 0x6b5446, wallTex: 'planks', roofTex: 'shingle', doorColor: 0x5e3b22, shutters: null, trimColor: 0xe8dfcf });
  b.add(box(w, h, d, 1.6), M.wall, [0, h / 2, 0]);
  b.add(box(w + 0.16, 0.4, d + 0.16, 1.6), M.stone, [0, 0.2, 0]);
  b.add(gableRoofGeo(w, d, 1.8, 1.2), M.roof, [0, h, 0]);
  b.add(new THREE.BoxGeometry(w + 2.5, 0.16, 0.34), M.ridge, [0, h + 1.82, 0]);
  for (let i = 0; i < 4; i++) {
    const x = -w / 2 + 2 + i * 4;
    // Portes de box en deux parties, avec croix de Saint-André.
    b.add(new THREE.BoxGeometry(1.7, 1.4, 0.1), M.door, [x, 0.7, d / 2 + 0.05]);
    b.add(new THREE.BoxGeometry(1.8, 0.09, 0.14), M.trim, [x, 1.42, d / 2 + 0.06]);
    b.add(new THREE.BoxGeometry(1.8, 0.09, 0.14), M.trim, [x, 0.04, d / 2 + 0.06]);
    for (const s of [-1, 1]) {
      b.add(new THREE.BoxGeometry(0.09, 1.4, 0.14), M.trim, [x + s * 0.86, 0.7, d / 2 + 0.06]);
      b.add(new THREE.BoxGeometry(0.08, 1.75, 0.13), M.trim, [x, 0.72, d / 2 + 0.07], [0, 0, s * 0.68]);
    }
    // Ouverture sombre au-dessus de la demi-porte.
    b.add(new THREE.BoxGeometry(1.6, 0.9, 0.06), M.dark, [x, 1.95, d / 2 + 0.02]);
    b.add(new THREE.BoxGeometry(1.8, 0.09, 0.14), M.trim, [x, 2.45, d / 2 + 0.06]);
  }
  b.build(g);
  sign(g, label, [0, 3.0, d / 2 + 0.08], '#3f2a1c', '🐴', 3);
  return { group: g, size: [w, d] };
}

export function refuge(label, local = false) {
  const s = building({
    w: 9, d: 7, h: 3.6, wall: local ? 0xe2cda6 : 0xc8dcc8, roof: local ? 0x9a4a32 : 0x4b6e5c, windows: 2,
    doorColor: 0x2f5a46, roofTex: local ? 'tiles' : 'slate', shutters: local ? 0x7a3b2a : null, chimney: local ? [-2.8, -1.2] : null,
  });
  sign(s.g, label, [0, 3.05, 3.6], local ? '#7a3b2a' : '#2f5a46', local ? '🏡' : '🐾', 3);
  return finish(s, [9, 7]);
}

export function vetClinic(label) {
  const s = building({ w: 9, d: 7, h: 3.6, wall: 0xf6f6f3, roof: 0x5b6d7a, windows: 2, doorColor: 0x2e7d5b });
  const green = mat(0x2fae62, 0.5, { emissive: 0x2fae62, emissiveIntensity: 0.3 });
  s.b.add(new THREE.BoxGeometry(0.32, 1.0, 0.12), green, [3.75, 3.0, 3.6]);
  s.b.add(new THREE.BoxGeometry(1.0, 0.32, 0.12), green, [3.75, 3.0, 3.6]);
  sign(s.g, label, [0, 3.05, 3.6], '#2e7d5b', '🩺', 2.6);
  return finish(s, [9, 7]);
}

export function lodge(label, biome) {
  const japan = biome === 'garden';
  const s = building({
    w: 9, d: 7, h: 3.2,
    wall: japan ? 0xeee6d2 : 0xa8784e,
    roof: japan ? 0x3c4248 : biome === 'beach' ? 0x46596e : 0x5e4030,
    roofH: japan ? 1.6 : 3, windows: 2,
    wallTex: japan ? 'plaster' : 'planks', roofTex: japan ? 'tiles' : biome === 'beach' ? 'slate' : 'shingle',
    shutters: japan ? null : 0x6b2e22, chimney: japan ? null : [-2.6, -1.4], overhang: japan ? 0.9 : 0.5,
  });
  sign(s.g, label, [0, 2.8, 3.6], '#5b4636', '🛏️', 2.6);
  return finish(s, [9, 7]);
}

export function jobBoard(label) {
  const g = new THREE.Group();
  const b = new MeshBatch();
  const wood = mat(0x8a6040, 0.85, surface('planks', planksTexture(), 0.3, 1));
  const board = mat(0xc49a6a, 0.9, surface('planks', planksTexture(), 0.8, 0.5));
  b.add(new THREE.BoxGeometry(0.15, 2, 0.15), wood, [-0.9, 1, 0]);
  b.add(new THREE.BoxGeometry(0.15, 2, 0.15), wood, [0.9, 1, 0]);
  b.add(new THREE.BoxGeometry(2, 1.1, 0.08), board, [0, 1.4, 0]);
  b.add(new THREE.BoxGeometry(2.2, 0.08, 0.3), wood, [0, 2.0, 0.05]);
  // Petit toit en bardeaux au-dessus du panneau.
  b.add(new THREE.BoxGeometry(2.3, 0.05, 0.2), wood, [0, 2.1, -0.08], [0.5, 0, 0]);
  const paper = mat(0xfaf4e4, 0.9);
  [[-0.5, 1.55], [0.1, 1.35], [0.6, 1.6], [-0.2, 1.15]].forEach(([x, y], i) => b.add(new THREE.BoxGeometry(0.4, 0.3, 0.02), paper, [x, y, 0.05], [0, 0, (i - 1.5) * 0.06]));
  const pin = mat(0xd94f4f, 0.4);
  [[-0.5, 1.68], [0.1, 1.48], [0.6, 1.73], [-0.2, 1.28]].forEach(([x, y]) => b.add(new THREE.SphereGeometry(0.02, 8, 6), pin, [x, y, 0.07]));
  b.build(g);
  sign(g, label, [0, 2.25, 0.08], '#7a5236', '📋', 2);
  return { group: g, size: [2, 0.5] };
}

/**
 * Où est l'obstacle de saut du paddock : décalé du milieu (de la profondeur w du modèle), pour ne pas être
 * sur le chemin entre l'ouverture et le fond (les chevaux qui sortaient s'y cognaient).
 */
export const jumpOffset = (w) => Math.min(5, w / 4);

/**
 * Clôture rectangulaire avec une ouverture au milieu du côté avant (+z), sable et obstacle de saut (paddock).
 * w × d : taille en mètres (le paddock s'agrandit dans la vue construction).
 * ground(lx, lz) : hauteur du sol par rapport au centre, pour que poteaux, lisses et sable suivent le terrain.
 * L'obstacle de saut est en (jumpOffset(w), 0).
 */
export function paddock(w, d, ground = () => 0) {
  const g = new THREE.Group();
  const b = new MeshBatch();
  const wood = mat(0xe9dfcf, 0.75, surface('planks', planksTexture(), 0.15, 0.6));
  const gap = 3;
  // Poteaux tous les 2,5 m environ, toujours aux coins et de chaque côté de l'ouverture.
  const path = [[gap / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2], [-w / 2, d / 2], [-gap / 2, d / 2]];
  const posts = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i];
    const [bx, bz] = path[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 2.5));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) posts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  const postGeo = new THREE.CylinderGeometry(0.08, 0.09, 1.35, 8);
  const im = new THREE.InstancedMesh(postGeo, wood, posts.length);
  const m4 = new THREE.Matrix4();
  posts.forEach(([x, z], i) => im.setMatrixAt(i, m4.makeTranslation(x, ground(x, z) + 0.67, z)));
  im.castShadow = true;
  im.receiveShadow = true;
  g.add(im);
  // Lisses d'un poteau à l'autre (penchées si le sol penche).
  for (let i = 0; i < posts.length - 1; i++) {
    const [ax, az] = posts[i];
    const [bx, bz] = posts[i + 1];
    const ya = ground(ax, az);
    const yb = ground(bx, bz);
    const flat = Math.hypot(bx - ax, bz - az);
    const rot = new THREE.Euler(0, -Math.atan2(bz - az, bx - ax), Math.atan2(yb - ya, flat), 'YZX');
    for (const y of [0.55, 1.1]) {
      b.add(new THREE.BoxGeometry(Math.hypot(flat, yb - ya), 0.12, 0.05), wood, [(ax + bx) / 2, (ya + yb) / 2 + y, (az + bz) / 2], rot);
    }
  }
  // Sable de carrière, piétiné (il épouse le terrain).
  const sandGeo = new THREE.PlaneGeometry(w - 0.3, d - 0.3, Math.ceil(w / 3), Math.ceil(d / 3)).rotateX(-Math.PI / 2);
  const sp = sandGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) sp.setY(i, ground(sp.getX(i), sp.getZ(i)) + 0.03);
  sandGeo.computeVertexNormals();
  const sand = new THREE.Mesh(sandGeo, mat(0xc4ae86, 1));
  sand.receiveShadow = true;
  g.add(sand);
  // Obstacle de saut (chandeliers et barres rayées), à côté du chemin de l'ouverture.
  const red = mat(0xc8463c, 0.5);
  const white = mat(0xf2f2f2, 0.5);
  const jx = jumpOffset(w);
  const y0 = ground(jx, 0);
  for (const s of [-1, 1]) {
    b.add(new THREE.BoxGeometry(0.15, 1.3, 0.15), white, [jx + s * 1.6, y0 + 0.65, 0]);
    b.add(new THREE.BoxGeometry(0.5, 0.06, 0.5), white, [jx + s * 1.6, y0 + 0.03, 0]);
  }
  for (let k = 0; k < 6; k++) {
    b.add(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), k % 2 ? white : red, [jx - 1.25 + k * 0.5, y0 + 0.85, 0], [0, 0, Math.PI / 2]);
  }
  b.add(new THREE.CylinderGeometry(0.05, 0.05, 3, 8), white, [jx, y0 + 0.45, 0], [0, 0, Math.PI / 2]);
  b.build(g);
  return g;
}

export function hayBale() {
  const g = new THREE.Group();
  const b = new MeshBatch();
  const straw = mat(0xffffff, 1, { map: tiled(strawTexture(), 3, 1) });
  b.add(new THREE.CylinderGeometry(0.6, 0.6, 1.1, 24), straw, [0, 0.6, 0], [0, 0, Math.PI / 2]);
  // Ficelles.
  const string = mat(0xd8cfb0, 0.8);
  for (const x of [-0.3, 0.3]) b.add(new THREE.TorusGeometry(0.605, 0.012, 4, 32), string, [x, 0.6, 0], [0, Math.PI / 2, 0]);
  b.build(g);
  return g;
}

export function trough() {
  const g = new THREE.Group();
  const b = new MeshBatch();
  const metal = mat(0x8a969e, 0.35, { metalness: 0.6 });
  b.add(new THREE.BoxGeometry(1.8, 0.6, 0.7), metal, [0, 0.3, 0]);
  b.add(new THREE.BoxGeometry(1.86, 0.06, 0.76), metal, [0, 0.6, 0]);
  b.build(g);
  add(g, new THREE.BoxGeometry(1.6, 0.05, 0.5), mat(0x2f5e70, 0.05, { transparent: true, opacity: 0.85, metalness: 0.3 }), [0, 0.55, 0]);
  return g;
}

export function torii() {
  const g = new THREE.Group();
  const b = new MeshBatch();
  const red = mat(0xc63c2b, 0.55);
  const black = mat(0x1d1d1d, 0.6);
  b.add(new THREE.CylinderGeometry(0.22, 0.25, 5, 16), red, [-2.2, 2.5, 0]);
  b.add(new THREE.CylinderGeometry(0.22, 0.25, 5, 16), red, [2.2, 2.5, 0]);
  b.add(new THREE.BoxGeometry(6.4, 0.35, 0.5), black, [0, 5.1, 0]);
  b.add(new THREE.BoxGeometry(5.6, 0.3, 0.4), red, [0, 4.3, 0]);
  for (const s of [-1, 1]) b.add(new THREE.CylinderGeometry(0.3, 0.32, 0.3, 16), black, [s * 2.2, 0.15, 0]);
  b.build(g);
  return g;
}

export function lighthouse() {
  const g = new THREE.Group();
  const b = new MeshBatch();
  const dark = mat(0x2b2b2b);
  const red = mat(0xc0392b);
  b.add(new THREE.CylinderGeometry(1.2, 1.8, 12, 24), mat(0xf4f2ee, 0.8, surface('plaster', plasterTexture(), 2, 3)), [0, 6, 0]);
  b.add(new THREE.CylinderGeometry(1.25, 1.25, 1.5, 24), red, [0, 4, 0]);
  b.add(new THREE.CylinderGeometry(1.25, 1.25, 1.5, 24), red, [0, 8.5, 0]);
  b.add(new THREE.CylinderGeometry(1.6, 1.6, 0.15, 24), dark, [0, 12, 0]);
  b.add(new THREE.CylinderGeometry(1, 1, 1.2, 16), mat(0xfff2b0, 0.2, { emissive: 0xffe28a, emissiveIntensity: 0.6 }), [0, 12.6, 0]);
  b.add(new THREE.ConeGeometry(1.4, 1.2, 16), dark, [0, 13.8, 0]);
  b.build(g);
  return g;
}

/** Sellerie : petit bâtiment en bois où l'on range selles, filets et licols. */
export function tackRoom(label) {
  const s = building({ w: 7, d: 5, h: 3, wall: 0x8a5a36, roof: 0x5a4636, roofH: 1.6, windows: 1, doorColor: 0x4a2c18, doorW: 1.4, wallTex: 'planks', roofTex: 'shingle' });
  const { b } = s;
  const wood = mat(0x6e4a2c, 0.8, surface('planks', planksTexture(), 0.3, 0.3));
  const leather = mat(0x7a3f1c, 0.45);
  const dark = mat(0x2a1a10, 0.6);
  // Porte-selles devant la façade, avec une selle posée dessus et un tapis.
  for (const x of [1.9, 3.1]) b.add(new THREE.BoxGeometry(0.1, 1, 0.1), wood, [x, 0.5, 2.9]);
  b.add(new THREE.BoxGeometry(1.4, 0.1, 0.12), wood, [2.5, 1.0, 2.9]);
  b.add(new THREE.CylinderGeometry(0.32, 0.32, 0.55, 14, 1, false, 0, Math.PI), leather, [2.5, 1.05, 2.9], [Math.PI / 2, 0, Math.PI / 2]);
  b.add(new THREE.BoxGeometry(0.05, 0.4, 0.04), dark, [2.18, 0.82, 2.9]); // étrivière
  b.add(new THREE.BoxGeometry(0.16, 0.05, 0.1), mat(0xb8b8b8, 0.3, { metalness: 0.8 }), [2.18, 0.6, 2.9]); // étrier
  b.add(new THREE.BoxGeometry(0.75, 0.04, 0.6), mat(0x2f5f9e, 0.9), [2.5, 1.02, 2.9]); // tapis de selle
  // Licols accrochés au mur.
  [-3.05, -2.65].forEach((x, i) => b.add(new THREE.TorusGeometry(0.16, 0.035, 6, 14), mat(i ? 0xc0392b : 0x2e86c1, 0.5), [x, 1.5, 2.56]));
  sign(s.g, label, [0, 2.7, 2.6], '#4a2c18', '🏇', 2.0);
  return finish(s, [7, 5]);
}

/** Maison des animaux : chaque chien, chat ou lapin y a son coin, son panier et sa gamelle. */
export function petHouse(label) {
  const s = building({ w: 8, d: 5, h: 2.8, wall: 0xf3d9a4, roof: 0xb4553a, roofH: 1.5, windows: 2, doorColor: 0x3d7a8c, wallTex: 'plaster', roofTex: 'tiles', shutters: 0x3d7a8c });
  const { b, M } = s;
  // Petites chatières et trappes pour chiens, de chaque côté de la porte.
  for (const [x, r] of [[-2.4, 0.32], [-1.5, 0.22], [1.5, 0.22], [2.4, 0.42]]) {
    b.add(new THREE.CircleGeometry(r + 0.06, 18, 0, Math.PI), M.trim, [x, 0.55, 2.52]);
    b.add(new THREE.CircleGeometry(r, 18, 0, Math.PI), M.dark, [x, 0.56, 2.53]);
    b.add(new THREE.PlaneGeometry(r * 2 + 0.12, 0.55), M.trim, [x, 0.28, 2.52]);
    b.add(new THREE.PlaneGeometry(r * 2, 0.55), M.dark, [x, 0.29, 2.53]);
  }
  // Gamelles devant la porte.
  for (const [x, c] of [[-0.9, 0xd94f4f], [0.9, 0x3f8fd9]]) b.add(new THREE.CylinderGeometry(0.17, 0.13, 0.09, 14), mat(c, 0.4), [x, 0.05, 3.1]);
  sign(s.g, label, [0, 2.52, 2.7], '#3d7a8c', '🐾', 2.0);
  return finish(s, [8, 5]);
}
