// Équipement en 3D « posé » (hors du cheval) : selles sur leur porte-selle, filets et licols
// suspendus, tapis pliés, guêtres et cloches, couvertures sur leur barre, bombes.
// Sert aux murs de la sellerie (src/game/models/tackRoomInterior.js) et aux images des fiches
// (src/game/thumbScenes.js). Les géométries sont partagées (cache), les matériaux aussi (par couleur).
//
// Repères (en mètres) :
//   selle : posée sur un porte-selle en (0, 0, 0), le pommeau vers +Z, les quartiers vers ±X ;
//   filet, licol : accrochés à un crochet en (0, 0, 0), ils pendent vers -Y, face vers +Z ;
//   couverture : posée sur une barre le long de X en (0, 0, 0), elle retombe vers ±Z ;
//   tapis, guêtres, cloches, bombe : posés sur une étagère (y = 0).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loft } from './shapes.js';
import { GEAR, COLORS } from '../../sim/gear.js';

// ---------------------------------------------------------------- textures et matériaux

const texCache = new Map();
function canvasTex(key, size, draw, repeat = 1) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.userData.shared = true;
  texCache.set(key, tex);
  return tex;
}

let seed = 11;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

/** Grain du cuir (relief). */
const grainTex = () => canvasTex('grain', 128, (ctx, n) => {
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, n, n);
  for (let i = 0; i < 900; i++) {
    const v = 110 + rnd() * 50;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.arc(rnd() * n, rnd() * n, 0.6 + rnd() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}, 3);

/** Trame du tissu (couvertures, tapis, sangles en nylon). */
const weaveTex = () => canvasTex('weave', 64, (ctx, n) => {
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y += 2) {
    ctx.fillStyle = y % 4 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.16)';
    ctx.fillRect(0, y, n, 1);
  }
  for (let x = 0; x < n; x += 2) {
    ctx.fillStyle = x % 4 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    ctx.fillRect(x, 0, 1, n);
  }
}, 6);

/** Surpiqûres en losanges (tapis matelassé, couverture d'hiver). Blanc = surface, gris = couture. */
const quiltTex = () => canvasTex('quilt', 128, (ctx, n) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, n, n);
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 2.5;
  for (let k = -n; k < n * 2; k += 32) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + n, n);
    ctx.moveTo(k, n);
    ctx.lineTo(k + n, 0);
    ctx.stroke();
  }
  // Petits creux autour des coutures (ombre douce).
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 7;
  for (let k = -n; k < n * 2; k += 32) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + n, n);
    ctx.moveTo(k, n);
    ctx.lineTo(k + n, 0);
    ctx.stroke();
  }
}, 2);

/** Filet anti-mouches : petits trous (carte de transparence). */
const meshAlphaTex = () => canvasTex('mesh', 64, (ctx, n) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, n, n);
  ctx.fillStyle = '#000000';
  for (let y = 0; y < n; y += 8) for (let x = 0; x < n; x += 8) ctx.fillRect(x + 2, y + 2, 5, 5);
}, 5);

/** Paillettes (bombe à paillettes). */
const sparkleTex = () => canvasTex('sparkle', 128, (ctx, n) => {
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, n, n);
  for (let i = 0; i < 700; i++) {
    const v = rnd() > 0.5 ? 255 : 150 + rnd() * 60;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(rnd() * n, rnd() * n, 1.5, 1.5);
  }
}, 3);

/** Cuir repoussé (selle western) : volutes et liseré. */
const toolingTex = () => canvasTex('tooling', 256, (ctx, n) => {
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, n, n);
  ctx.strokeStyle = '#5a5a5a';
  ctx.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    const x = rnd() * n;
    const y = rnd() * n;
    const r = 10 + rnd() * 16;
    ctx.beginPath();
    ctx.arc(x, y, r, rnd() * 3, rnd() * 3 + 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x + r, y, 6, 3, rnd() * 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = '#a8a8a8';
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.arc(rnd() * n, rnd() * n, 6 + rnd() * 10, 0, 4);
    ctx.stroke();
  }
}, 1);

const matCache = new Map();
function cached(key, make) {
  if (!matCache.has(key)) {
    const m = make();
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return matCache.get(key);
}

export const hexOf = (key, fallback = 0x5a3418) => (typeof key === 'number' ? key : COLORS[key] ?? fallback);

/** Cuir (selles, filets) : un peu brillant, grain léger. */
export const leatherMat = (c) => cached(`leather:${hexOf(c)}`, () => new THREE.MeshStandardMaterial({
  color: hexOf(c), roughness: 0.42, bumpMap: grainTex(), bumpScale: 0.35,
}));
/** Le même cuir, visible des deux côtés (quartiers, jupes : de fines plaques). */
const leatherDS = (c) => cached(`leatherDS:${hexOf(c)}`, () => new THREE.MeshStandardMaterial({
  color: hexOf(c), roughness: 0.42, bumpMap: grainTex(), bumpScale: 0.35, side: THREE.DoubleSide,
}));
/** Bordure / surpiqûre : le même cuir, plus foncé. */
export const edgeMat = (c) => cached(`edge:${hexOf(c)}`, () => new THREE.MeshStandardMaterial({
  color: new THREE.Color(hexOf(c)).multiplyScalar(0.62), roughness: 0.5,
}));
/** Siège en daim (un peu plus mat). */
export const suedeMat = (c) => cached(`suede:${hexOf(c)}`, () => new THREE.MeshStandardMaterial({
  color: new THREE.Color(hexOf(c)).multiplyScalar(0.85), roughness: 0.85, bumpMap: grainTex(), bumpScale: 0.5,
}));
export const clothMat = (c, side = THREE.DoubleSide) => cached(`cloth:${hexOf(c)}:${side}`, () => new THREE.MeshStandardMaterial({
  color: hexOf(c), roughness: 0.92, bumpMap: weaveTex(), bumpScale: 0.6, side,
}));
const quiltMat = (c) => cached(`quilt:${hexOf(c)}`, () => new THREE.MeshStandardMaterial({
  color: hexOf(c), roughness: 0.9, map: quiltTex(), bumpMap: quiltTex(), bumpScale: 1.2, side: THREE.DoubleSide,
}));
const nylonMat = (c) => cached(`nylon:${hexOf(c)}`, () => new THREE.MeshStandardMaterial({
  color: hexOf(c), roughness: 0.55, bumpMap: weaveTex(), bumpScale: 0.4,
}));
const rubberMat = (c) => cached(`rubber:${hexOf(c)}`, () => new THREE.MeshStandardMaterial({ color: hexOf(c), roughness: 0.6, side: THREE.DoubleSide }));
const steelMat = () => cached('steel', () => new THREE.MeshStandardMaterial({ color: 0xd2d5da, roughness: 0.22, metalness: 0.9 }));
const brassMat = () => cached('brass', () => new THREE.MeshStandardMaterial({ color: 0xd8b24a, roughness: 0.28, metalness: 0.85 }));
const fleeceMat = (c) => cached(`fleece:${hexOf(c)}`, () => new THREE.MeshStandardMaterial({ color: hexOf(c), roughness: 1, bumpMap: grainTex(), bumpScale: 1.4 }));
const woodMat = () => cached('stirrupWood', () => new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.6 }));
const velvetMat = (c) => cached(`velvet:${hexOf(c)}`, () => new THREE.MeshStandardMaterial({ color: hexOf(c), roughness: 0.95, bumpMap: weaveTex(), bumpScale: 0.25 }));
const glitterMat = (c) => cached(`glitter:${hexOf(c)}`, () => new THREE.MeshStandardMaterial({
  color: hexOf(c), roughness: 0.28, metalness: 0.55, map: sparkleTex(), bumpMap: sparkleTex(), bumpScale: 0.6,
}));
const netMat = (c) => cached(`net:${hexOf(c)}`, () => new THREE.MeshStandardMaterial({
  color: hexOf(c), roughness: 0.85, alphaMap: meshAlphaTex(), alphaTest: 0.5, side: THREE.DoubleSide, bumpMap: meshAlphaTex(), bumpScale: 0.8,
}));
const rainMat = (c) => cached(`rain:${hexOf(c)}`, () => new THREE.MeshStandardMaterial({
  color: hexOf(c), roughness: 0.32, metalness: 0.05, bumpMap: weaveTex(), bumpScale: 0.2, side: THREE.DoubleSide,
}));

// ---------------------------------------------------------------- géométries

// Version allégée (objets exposés aux murs de la sellerie) : mêmes formes, moins de facettes.
// Les géométries allégées ont leur propre entrée dans le cache.
let LITE = false;
const q = (full, lite) => (LITE ? lite : full);

/** Construit des modèles allégés pendant fn() (murs de la sellerie : budget de triangles du téléphone). */
export function withLite(fn) {
  const was = LITE;
  LITE = true;
  try {
    return fn();
  } finally {
    LITE = was;
  }
}

const geoCache = new Map();
function shared(key, make) {
  const k = LITE ? `${key}|lite` : key;
  if (!geoCache.has(k)) {
    const g = make();
    g.userData.shared = true;
    geoCache.set(k, g);
  }
  return geoCache.get(k);
}

function mesh(parent, geo, material, pos = null, rot = null, scale = null) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/**
 * Plaque souple (quartier, jupe, fender) : grille (u, v) posée par map(s, t) → [x, y, z].
 * outline(v) → [sGauche, sDroite] pour v de 0 (haut) à 1 (bas), t = v × len.
 */
function plate(outline, len, map, nu = 7, nv = 9) {
  if (LITE) {
    nu = Math.max(3, Math.ceil(nu / 2));
    nv = Math.max(3, Math.ceil(nv / 2));
  }
  const pos = [];
  const uv = [];
  const idx = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    const [a, b] = outline(v);
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const p = map(a + (b - a) * u, v * len);
      pos.push(p[0], p[1], p[2]);
      uv.push(u, 1 - v);
    }
  }
  const W = nu + 1;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const k = j * W + i;
      idx.push(k, k + W, k + 1, k + 1, k + W, k + W + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Points du bord d'une plaque (pour la surpiqûre / la bordure). */
function plateEdge(outline, len, map, n = 10) {
  if (LITE) n = Math.max(4, Math.ceil(n / 2));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(map(outline(0)[0] + (outline(0)[1] - outline(0)[0]) * (i / n), 0));
  for (let i = 1; i <= n; i++) {
    const v = i / n;
    pts.push(map(outline(v)[1], v * len));
  }
  for (let i = n - 1; i >= 0; i--) pts.push(map(outline(1)[0] + (outline(1)[1] - outline(1)[0]) * (i / n), len));
  for (let i = n - 1; i >= 1; i--) {
    const v = i / n;
    pts.push(map(outline(v)[0], v * len));
  }
  return pts;
}

/** Fine tresse le long de points (bordure, surpiqûre, corde). */
function tube(pts, r, closed = false, radial = 5) {
  const list = closed ? [...pts, pts[0], pts[1]] : pts;
  return loft(list.map((p) => ({ p, rx: r, ry: r })), { radial: q(radial, 4), sub: q(2, 1), capStart: !closed, capEnd: !closed });
}

/** Sangle plate dans le plan x-y (filets, licols suspendus) : largeur dans le plan, épaisseur vers Z. */
function flatStrap(pts, halfW, thick = 0.0025) {
  return loft(pts.map((p) => ({ p, rx: thick, ry: halfW })), { radial: q(6, 4), sub: q(3, 1), side: [0, 0, 1], exp: 4 });
}

// ---------------------------------------------------------------- selles

/**
 * Silhouette de chaque selle. len : longueur du siège ; seatW : demi-largeur ; dip : creux ;
 * pommel / cantle : hauteur du pommeau et du troussequin ; flap : [longueur, largeur, avancée (rad)] ;
 * knee : boudins de genou ; blocks : taquets de cuisse ; bags : sacoches ; western : selle western.
 */
export const SADDLE_STYLES = {
  saddle: { len: 0.46, seatW: 0.13, dip: 0.035, pommel: 0.07, cantle: 0.085, flap: [0.42, 0.3, 0.3], knee: 0.5 },
  saddleDressage: { len: 0.48, seatW: 0.13, dip: 0.055, pommel: 0.08, cantle: 0.12, flap: [0.52, 0.27, 0.06], blocks: true, knee: 0.3 },
  saddleJump: { len: 0.45, seatW: 0.13, dip: 0.02, pommel: 0.065, cantle: 0.06, flap: [0.4, 0.34, 0.5], knee: 1 },
  saddleTrail: { len: 0.5, seatW: 0.155, dip: 0.04, pommel: 0.075, cantle: 0.1, flap: [0.42, 0.32, 0.22], bags: true, quilted: true, knee: 0.4 },
  saddleWestern: { len: 0.52, seatW: 0.16, dip: 0.05, pommel: 0.1, cantle: 0.13, western: true },
  saddlePony: { len: 0.38, seatW: 0.11, dip: 0.03, pommel: 0.06, cantle: 0.07, flap: [0.33, 0.25, 0.28], knee: 0.6 },
  saddleRace: { len: 0.3, seatW: 0.1, dip: 0.012, pommel: 0.04, cantle: 0.03, flap: [0.2, 0.2, 0.55], race: true },
};

/** Profil du siège : sections le long de z (du troussequin au pommeau). */
function seatSections(st, y0) {
  const z0 = -st.len * 0.55;
  const z1 = st.len * 0.45;
  const prof = [[0, st.cantle, 0.7, 0.03], [0.08, st.cantle * 0.82, 0.88, 0.035], [0.2, st.cantle * 0.3, 0.98, 0.04], [0.36, st.dip * 0.05, 1, 0.045],
    [0.52, 0, 0.95, 0.05], [0.68, st.pommel * 0.25, 0.8, 0.055], [0.86, st.pommel * 0.7, 0.58, 0.06], [1, st.pommel, 0.42, 0.06]];
  return prof.map(([f, h, w, b]) => ({ p: [0, y0 + st.dip + h, z0 + (z1 - z0) * f], rx: st.seatW * w, ry: 0.022, ryb: b + st.dip * (1 - Math.abs(f - 0.45) * 1.6) }));
}

/**
 * Pose d'une plaque sur un « tonneau » : s le long de z, t vers le bas, side ±1.
 * R : rayon du dos (plus grand = quartiers plus droits), top : y du haut, x0 : écart au centre.
 */
function barrel(side, R, top, x0, zc, out = 0, phMax = 1.3) {
  const th0 = Math.asin(Math.min(0.95, x0 / R));
  const cy = top - R * Math.cos(th0);
  const bx = R * Math.sin(phMax);
  const by = cy + R * Math.cos(phMax);
  return (s, t) => {
    const ph = th0 + t / R;
    if (ph <= phMax) {
      const r = R + out;
      return [side * r * Math.sin(ph), cy + r * Math.cos(ph), zc + s];
    }
    // Plus bas que le « ventre » : la plaque pend presque droit.
    const e = (ph - phMax) * R;
    return [side * (bx + Math.cos(phMax) * e + Math.sin(phMax) * out), by - Math.sin(phMax) * e + Math.cos(phMax) * out, zc + s];
  };
}

/** Selle anglaise (mixte, dressage, obstacle, randonnée, poney, course). */
function englishSaddle(g, st, color) {
  const leather = leatherMat(color);
  const edge = edgeMat(color);
  const y0 = 0.05; // dessous des panneaux : posés sur le porte-selle
  const key = `seat:${st.len}:${st.seatW}:${st.dip}:${st.pommel}:${st.cantle}`;
  const seatGeo = shared(key, () => loft(seatSections(st, y0), { radial: q(18, 10), sub: q(3, 1), exp: 2.6, round: [0.5, 0.5] }));
  mesh(g, seatGeo, leather);
  // Siège en daim plus foncé (une couche juste au-dessus du creux) et cuir piqué sur la randonnée.
  const inner = shared(`${key}:inner`, () => {
    const secs = seatSections(st, y0).slice(1, 7).map((s) => ({ ...s, p: [0, s.p[1] + 0.012, s.p[2]], rx: s.rx * 0.8, ry: 0.012, ryb: 0.012 }));
    return loft(secs, { radial: q(14, 8), sub: q(3, 1), exp: 2.4, round: [0.3, 0.3] });
  });
  mesh(g, inner, st.quilted ? quiltMat(0x2b2522) : suedeMat(color));
  // Panneaux (coussins sous le siège) et gouttière.
  const panel = shared(`${key}:panel`, () => loft([0.08, 0.3, 0.55, 0.82].map((f, i) => ({
    p: [0, y0 + 0.025 + (i === 3 ? 0.02 : 0), -st.len * 0.55 + st.len * f], rx: 0.05, ry: 0.03, ryb: 0.025,
  })), { radial: q(10, 6), sub: q(2, 1), round: [0.6, 0.6] }));
  for (const s of [1, -1]) mesh(g, panel, leather, [s * st.seatW * 0.55, 0, 0]);
  // Clous du pommeau.
  const zP = st.len * 0.45;
  for (const s of [1, -1]) mesh(g, shared('nail', () => new THREE.SphereGeometry(0.007, 8, 6)), steelMat(), [s * 0.025, y0 + st.dip + st.pommel + 0.012, zP - 0.015]);

  if (!st.flap) return;
  const [L, W, fwd] = st.flap;
  const zc = st.len * 0.1; // les quartiers sont un peu vers l'avant
  const outline = (v) => {
    const lean = Math.tan(fwd) * v * L;
    const round = v > 0.72 ? Math.sqrt(Math.max(0.02, 1 - ((v - 0.72) / 0.28) ** 2)) : 1;
    const half = (W / 2) * (0.92 + 0.08 * (1 - v));
    const c = lean - W * 0.08;
    return [c - half * round, c + half * round];
  };
  const top = y0 + st.dip + 0.01;
  for (const side of [1, -1]) {
    const map = barrel(side, 0.3, top, st.seatW * 0.9, zc);
    const geo = shared(`flap:${L}:${W}:${fwd}:${st.seatW}:${side}`, () => plate(outline, L, map));
    mesh(g, geo, leatherDS(color));
    const rim = shared(`flapRim:${L}:${W}:${fwd}:${st.seatW}:${side}`, () => tube(plateEdge(outline, L, map), 0.0035, true, 4));
    mesh(g, rim, edge);
    const mapOut = barrel(side, 0.3, top, st.seatW * 0.9, zc, 0.012);
    // Boudin de genou devant, taquet de cuisse derrière (dressage).
    if (st.knee) {
      const kGeo = shared(`knee:${L}:${W}:${fwd}:${st.knee}:${side}`, () => {
        const pts = [];
        for (let i = 0; i <= 4; i++) {
          const v = 0.06 + i * 0.13 * (0.6 + st.knee * 0.4);
          pts.push(mapOut(outline(v)[1] - 0.04, v * L));
        }
        return loft(pts.map((p, i) => ({ p, rx: 0.018 + st.knee * 0.008, ry: 0.012 + st.knee * 0.006 * Math.sin((i / 4) * Math.PI) })), { radial: q(8, 5), sub: q(2, 1), round: [0.8, 0.8] });
      });
      mesh(g, kGeo, leather);
    }
    if (st.blocks) {
      const bGeo = shared(`block:${L}:${W}:${side}`, () => {
        const pts = [0.05, 0.15, 0.25, 0.32].map((v) => mapOut(outline(v)[0] + 0.045, v * L));
        return loft(pts.map((p) => ({ p, rx: 0.022, ry: 0.016 })), { radial: q(8, 5), sub: q(2, 1), round: [0.8, 0.8] });
      });
      mesh(g, bGeo, leather);
    }
    // Petit quartier (jupe) sur l'attache de l'étrivière.
    const skirtOut = barrel(side, 0.3, top + 0.006, st.seatW * 0.85, zc, 0.006);
    const skirt = shared(`skirt:${st.seatW}:${side}:${L}`, () => plate((v) => [-0.05 - v * 0.01, 0.07 - v * 0.02], 0.08, skirtOut, 4, 4));
    mesh(g, skirt, leatherDS(color));
    // Étrivière (sur le quartier) et étrier.
    const strapOut = barrel(side, 0.3, top, st.seatW * 0.9, zc, 0.016);
    const sl = st.race ? 0.6 : 0.82;
    const sGeo = shared(`leather:${L}:${W}:${fwd}:${side}`, () => {
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const v = 0.04 + (i / 6) * (sl - 0.04);
        pts.push(strapOut(outline(v)[0] * 0.3 + outline(v)[1] * 0.7 - 0.02, v * L));
      }
      return loft(pts.map((p) => ({ p, rx: 0.013, ry: 0.0025 })), { radial: q(6, 4), sub: q(2, 1), side: [0, 0, 1], exp: 4 });
    });
    mesh(g, sGeo, edge);
    const end = strapOut(outline(sl)[0] * 0.3 + outline(sl)[1] * 0.7 - 0.02, sl * L);
    const iron = stirrupIron(st.race ? 0.75 : 1);
    iron.position.set(end[0] + side * 0.012, end[1] - 0.05 * (st.race ? 0.75 : 1), end[2]);
    iron.rotation.z = side * 0.25;
    g.add(iron);
  }
  // Sacoches et paquetage (randonnée).
  if (st.bags) {
    const z0 = -st.len * 0.55;
    for (const s of [1, -1]) {
      const bag = mesh(g, shared('bag', () => new RoundedBoxGeometry(0.07, 0.15, 0.17, q(3, 1), 0.025)), leather, [s * 0.17, y0 - 0.02, z0 + 0.02], [0, 0, s * 0.18]);
      mesh(bag, shared('bagLid', () => new RoundedBoxGeometry(0.075, 0.05, 0.175, q(2, 1), 0.015)), edge, [0, 0.06, 0]);
      mesh(bag, shared('bagBuckle', () => new THREE.BoxGeometry(0.01, 0.02, 0.025)), brassMat(), [s * 0.04, 0.035, 0]);
    }
    const roll = mesh(g, shared('roll', () => new THREE.CylinderGeometry(0.05, 0.05, 0.36, 14)), clothMat(0x4f6b3a), [0, y0 + st.cantle + 0.06, z0 - 0.04], [0, 0, Math.PI / 2]);
    for (const x of [-0.1, 0.1]) mesh(roll, shared('rollStrap', () => new THREE.TorusGeometry(0.052, 0.005, 5, q(18, 10))), edge, [0, x, 0], [Math.PI / 2, 0, 0]);
  }
}

/** Étrier anglais en acier, avec sa semelle en caoutchouc. */
function stirrupIron(k = 1) {
  const g = new THREE.Group();
  const steel = steelMat();
  mesh(g, shared(`ironArch:${k}`, () => new THREE.TorusGeometry(0.052 * k, 0.0065 * k, q(6, 4), q(18, 8), Math.PI)), steel, [0, 0.015 * k, 0], [0, Math.PI / 2, 0]);
  for (const s of [1, -1]) mesh(g, shared(`ironLeg:${k}`, () => new THREE.CylinderGeometry(0.0065 * k, 0.0065 * k, 0.03 * k, 6)), steel, [0, 0, s * 0.052 * k]);
  mesh(g, shared(`ironTread:${k}`, () => new THREE.BoxGeometry(0.04 * k, 0.008 * k, 0.11 * k)), steel, [0, -0.016 * k, 0]);
  mesh(g, shared(`ironPad:${k}`, () => new THREE.BoxGeometry(0.036 * k, 0.006 * k, 0.1 * k)), rubberMat(0x1c1c1c), [0, -0.01 * k, 0]);
  mesh(g, shared(`ironEye:${k}`, () => new THREE.BoxGeometry(0.012 * k, 0.014 * k, 0.03 * k)), steel, [0, 0.07 * k, 0]);
  return g;
}

/** Selle western : pommeau (corne), troussequin haut, grandes jupes, fenders et étriers en bois. */
function westernSaddle(g, st, color) {
  const leather = leatherMat(color);
  const edge = edgeMat(color);
  const tooled = cached(`tooled:${hexOf(color)}`, () => new THREE.MeshStandardMaterial({
    color: hexOf(color), roughness: 0.5, bumpMap: toolingTex(), bumpScale: 1.6, side: THREE.DoubleSide,
  }));
  const y0 = 0.05;
  const key = `wseat:${st.len}`;
  const seatGeo = shared(key, () => {
    const secs = seatSections(st, y0);
    secs[0].rx = st.seatW * 0.95; // troussequin large et arrondi
    secs[7].rx = st.seatW * 0.62; // fourche bombée
    secs[6].rx = st.seatW * 0.8;
    return loft(secs, { radial: q(18, 10), sub: q(3, 1), exp: 2.4, round: [0.7, 0.4] });
  });
  mesh(g, seatGeo, leather);
  mesh(g, shared(`${key}:inner`, () => {
    const secs = seatSections(st, y0).slice(1, 6).map((s) => ({ ...s, p: [0, s.p[1] + 0.012, s.p[2]], rx: s.rx * 0.82, ry: 0.012, ryb: 0.012 }));
    return loft(secs, { radial: q(14, 8), sub: q(3, 1), round: [0.3, 0.3] });
  }), suedeMat(color));
  // Corne (pommeau) : col et chapeau.
  const zH = st.len * 0.45 - 0.02;
  const yH = y0 + st.dip + st.pommel;
  mesh(g, shared('hornNeck', () => new THREE.CylinderGeometry(0.018, 0.026, 0.07, 12)), leather, [0, yH + 0.03, zH], [0.25, 0, 0]);
  mesh(g, shared('hornCap', () => new THREE.CylinderGeometry(0.042, 0.036, 0.016, 18)), edge, [0, yH + 0.068, zH + 0.01], [0.25, 0, 0]);
  // Jupes (grands pans carrés aux coins arrondis), fenders et étriers.
  const sk = [0.32, 0.62];
  const outline = (v) => {
    const r = v > 0.75 ? Math.sqrt(Math.max(0.05, 1 - ((v - 0.75) / 0.25) ** 2)) : 1;
    return [-sk[1] * 0.52 * r, sk[1] * 0.48 * r];
  };
  const top = y0 + st.dip - 0.005;
  for (const side of [1, -1]) {
    const map = barrel(side, 0.32, top, st.seatW * 0.85, -0.02);
    mesh(g, shared(`wskirt:${side}`, () => plate(outline, sk[0], map, 8, 7)), tooled);
    mesh(g, shared(`wskirtRim:${side}`, () => tube(plateEdge(outline, sk[0], map), 0.004, true, 4)), edge);
    // Fender : large étrivière en cuir.
    const fOut = barrel(side, 0.32, top, st.seatW * 0.85, -0.02, 0.014);
    const fOutline = (v) => [0.02 - 0.065 + v * 0.01, 0.02 + 0.065 - v * 0.012];
    const flen = 0.5;
    mesh(g, shared(`fender:${side}`, () => plate(fOutline, flen, fOut, 4, 8)), tooled);
    mesh(g, shared(`fenderRim:${side}`, () => tube(plateEdge(fOutline, flen, fOut, 6), 0.003, true, 4)), edge);
    // Étrier en bois (oxbow) au bout du fender.
    const end = fOut(0.02, flen);
    const st2 = new THREE.Group();
    st2.position.set(end[0] + side * 0.01, end[1] - 0.06, end[2]);
    st2.rotation.z = side * 0.35;
    g.add(st2);
    mesh(st2, shared('oxbow', () => new THREE.TorusGeometry(0.06, 0.016, q(6, 4), q(16, 8), Math.PI)), woodMat(), [0, 0, 0], [0, Math.PI / 2, Math.PI]);
    mesh(st2, shared('oxbowTop', () => new THREE.BoxGeometry(0.03, 0.03, 0.05)), edge, [0, 0.01, 0]);
    // Conchos (rosaces argentées) et lacets aux coins de la jupe.
    for (const [s, t] of [[-0.28, 0.05], [0.26, 0.05], [-0.28, 0.27], [0.26, 0.27]]) {
      const p = barrel(side, 0.32, top, st.seatW * 0.85, -0.02, 0.009)(s, t);
      const c = mesh(g, shared('concho', () => new THREE.CylinderGeometry(0.018, 0.018, 0.005, 14)), steelMat(), p);
      c.rotation.z = side * (Math.PI / 2 - 0.4 - t * 1.2);
      for (const k of [-1, 1]) mesh(g, shared('string', () => new THREE.BoxGeometry(0.006, 0.12, 0.003)), edge, [p[0] + side * 0.004, p[1] - 0.06, p[2] + k * 0.008], [0, 0, side * 0.3]);
    }
  }
  // Concho au dos du troussequin.
  mesh(g, shared('concho', () => new THREE.CylinderGeometry(0.018, 0.018, 0.005, 14)), steelMat(), [0, y0 + st.dip + st.cantle * 0.7, -st.len * 0.55 - 0.012], [Math.PI / 2, 0, 0]);
}

/** Une selle complète posée (pas de porte-selle). */
export function saddleModel(id, color) {
  const g = new THREE.Group();
  const st = SADDLE_STYLES[id] ?? SADDLE_STYLES.saddle;
  const c = color ?? GEAR[id]?.colors?.[0] ?? 'brown';
  if (st.western) westernSaddle(g, st, c);
  else englishSaddle(g, st, c);
  return g;
}

// ---------------------------------------------------------------- filets et licols suspendus

/** Courbe lisse de points [x, y, z]. */
const curve = (pts, n = 16) => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))).getPoints(q(n, Math.max(6, Math.ceil(n / 2)))).map((v) => [v.x, v.y, v.z]);

function bitRing(parent, x, y, r, olive = false) {
  mesh(parent, shared(`ring:${r}`, () => new THREE.TorusGeometry(r, 0.0045, 6, 18)), steelMat(), [x, y, 0.004]);
  if (olive) mesh(parent, shared('olive', () => new THREE.CylinderGeometry(0.009, 0.009, 0.03, 10)), steelMat(), [x - Math.sign(x) * r, y, 0.004]);
}

/** Filet suspendu : têtière sur le crochet, frontal, muserolle, mors et rênes remontées. */
export function bridleModel(id, color) {
  const g = new THREE.Group();
  const c = color ?? GEAR[id]?.colors?.[0] ?? 'brown';
  const leather = leatherMat(c);
  const W = 0.065; // demi-écart des montants
  const D = id === 'doubleBridle' ? 0.42 : 0.4; // longueur des montants
  // Têtière par-dessus le crochet.
  mesh(g, shared('crown', () => flatStrap(curve([[-W, -0.05, 0], [-W * 0.8, 0.01, 0], [0, 0.035, 0], [W * 0.8, 0.01, 0], [W, -0.05, 0]]), 0.011)), leather);
  // Montants (deux de chaque côté pour la bride).
  for (const s of [1, -1]) {
    mesh(g, shared(`cheek:${D}`, () => flatStrap([[0, -0.05, 0], [0, -D * 0.5, 0.004], [0, -D, 0.002]], 0.009)), leather, [s * W, 0, 0]);
    mesh(g, shared('buckle', () => new THREE.BoxGeometry(0.022, 0.016, 0.006)), steelMat(), [s * W, -0.14, 0.006]);
    if (id === 'doubleBridle') mesh(g, shared(`cheek2:${D}`, () => flatStrap([[0, -0.05, 0], [0, -D * 0.6, 0.01], [0, -D * 1.07, 0.008]], 0.007)), leather, [s * (W + 0.012), 0, 0.006]);
  }
  // Frontal (avec des strass pour la bride de dressage).
  mesh(g, shared('brow', () => flatStrap(curve([[-W, -0.055, 0.004], [0, -0.07, 0.04], [W, -0.055, 0.004]], 10), 0.008)), leather);
  if (id === 'doubleBridle' || id === 'bridleOlive') {
    const gem = cached('gem', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0.4, emissive: 0x334455 }));
    for (let i = -3; i <= 3; i++) mesh(g, shared('stone', () => new THREE.SphereGeometry(0.0045, 6, 5)), gem, [i * 0.016, -0.067 + Math.abs(i) * 0.002, 0.045 - Math.abs(i) * 0.004]);
  }
  // Sous-gorge qui pend en boucle.
  mesh(g, shared('throat', () => flatStrap(curve([[-W, -0.03, -0.004], [-0.03, -0.2, -0.01], [0.03, -0.2, -0.01], [W, -0.03, -0.004]], 12), 0.006)), leather);
  // Muserolle : boucle horizontale autour des montants.
  const yN = -D * 0.68;
  if (id === 'hackamore') {
    // Muserolle doublée de mouton et branches en métal.
    mesh(g, shared('hackNose', () => new THREE.TorusGeometry(0.075, 0.016, q(8, 5), q(24, 12))), fleeceMat(0xf2eee6), [0, yN, 0.03], [Math.PI / 2 - 0.25, 0, 0], [1, 0.75, 1]);
    for (const s of [1, -1]) {
      mesh(g, shared('shank', () => tube(curve([[0, 0.03, 0], [0.008, -0.04, 0.01], [0, -0.11, 0.02]], 10), 0.005)), steelMat(), [s * 0.075, yN, 0.03]);
      mesh(g, shared('shankRing', () => new THREE.TorusGeometry(0.014, 0.004, 6, 12)), steelMat(), [s * 0.075, yN - 0.115, 0.05]);
    }
    mesh(g, shared('curbChain', () => tube(curve([[-0.075, -0.035, 0.03], [0, -0.06, -0.01], [0.075, -0.035, 0.03]], 10), 0.003)), steelMat(), [0, yN, 0]);
  } else {
    mesh(g, shared('nose', () => new THREE.TorusGeometry(0.07, 0.007, q(6, 4), q(24, 12))), leather, [0, yN, 0.025], [Math.PI / 2 - 0.2, 0, 0], [1, 0.72, 1]);
    // Mors.
    const yB = -D;
    const r = id === 'doubleBridle' ? 0.024 : 0.03;
    for (const s of [1, -1]) bitRing(g, s * (W + 0.006), yB, r, id === 'bridleOlive');
    mesh(g, shared('mouth', () => tube(curve([[-W + 0.02, -0.004, 0.01], [0, -0.012, 0.03], [W - 0.02, -0.004, 0.01]], 8), 0.005)), steelMat(), [0, yB, 0]);
    if (id === 'doubleBridle') {
      // Mors de bride : branches droites et gourmette.
      for (const s of [1, -1]) {
        mesh(g, shared('curbShank', () => new THREE.CylinderGeometry(0.004, 0.004, 0.1, 6)), steelMat(), [s * (W + 0.018), -D * 1.07 - 0.03, 0.012]);
        mesh(g, shared('curbRing', () => new THREE.TorusGeometry(0.012, 0.0035, 6, 12)), steelMat(), [s * (W + 0.018), -D * 1.07 - 0.085, 0.012]);
      }
      mesh(g, shared('curbChain2', () => tube(curve([[-W - 0.018, -D * 1.07, 0.012], [0, -D * 1.07 - 0.02, -0.02], [W + 0.018, -D * 1.07, 0.012]], 10), 0.0028)), steelMat());
    }
  }
  // Rênes remontées sur le crochet (deux paires pour la bride).
  const yR = id === 'hackamore' ? yN - 0.115 : -D;
  const xR = id === 'hackamore' ? 0.075 : W + 0.006 + 0.03;
  const reins = (dz, off = 0) => flatStrap(curve([[xR, yR - off, 0.02 + dz], [xR + 0.04, yR * 0.55, 0.05 + dz], [0.02, 0.005, 0.03 + dz], [-0.02, 0.005, 0.03 + dz], [-xR - 0.04, yR * 0.55, 0.05 + dz], [-xR, yR - off, 0.02 + dz]], 24), 0.007);
  mesh(g, shared(`reins:${id}`, () => reins(0, id === 'hackamore' ? 0 : 0.03)), leather);
  if (id === 'doubleBridle') mesh(g, shared('reins2', () => flatStrap(curve([[W + 0.018, -D * 1.07 - 0.085, 0.03], [W + 0.07, -D * 0.6, 0.06], [0.02, 0.015, 0.045], [-0.02, 0.015, 0.045], [-W - 0.07, -D * 0.6, 0.06], [-W - 0.018, -D * 1.07 - 0.085, 0.03]], 24), 0.006)), leather);
  return g;
}

/** Licol suspendu avec sa longe enroulée. */
export function halterModel(id, color) {
  const g = new THREE.Group();
  const c = color ?? GEAR[id]?.colors?.[0] ?? 'red';
  const rope = id === 'halterRope';
  const strapMat = id === 'halterLeather' ? leatherMat(c) : rope ? nylonMat(c) : nylonMat(c);
  const metal = id === 'halterLeather' ? brassMat() : steelMat();
  const W = 0.07;
  const strap = (pts, hw) => (rope ? tube(pts, 0.0045) : flatStrap(pts, hw, 0.003));
  mesh(g, shared(`hcrown:${id}`, () => strap(curve([[-W, -0.06, 0], [-W * 0.8, 0.008, 0], [0, 0.035, 0], [W * 0.8, 0.008, 0], [W, -0.06, 0]]), 0.013)), strapMat);
  for (const s of [1, -1]) {
    mesh(g, shared(`hcheek:${id}`, () => strap([[0, -0.06, 0], [0, -0.16, 0.004], [0, -0.26, 0.01]], 0.012)), strapMat, [s * W, 0, 0]);
    if (rope) mesh(g, shared('knot', () => new THREE.SphereGeometry(0.011, 8, 6)), strapMat, [s * W, -0.26, 0.012]);
    else mesh(g, shared('hring', () => new THREE.TorusGeometry(0.014, 0.004, 6, 12)), metal, [s * W, -0.26, 0.012]);
    if (!rope) mesh(g, shared('hbuckle', () => new THREE.BoxGeometry(0.026, 0.02, 0.006)), metal, [s * W, -0.08, 0.006]);
  }
  // Muserolle (boucle) et sous-gorge.
  mesh(g, shared(`hnose:${id}`, () => (rope ? new THREE.TorusGeometry(0.08, 0.0045, q(6, 4), q(26, 12)) : new THREE.TorusGeometry(0.08, 0.008, q(6, 4), q(26, 12)))), strapMat, [0, -0.3, 0.035], [Math.PI / 2 - 0.25, 0, 0], [1, 0.75, rope ? 1 : 1]);
  mesh(g, shared(`hthroat:${id}`, () => strap(curve([[-W, -0.26, 0.004], [-0.02, -0.33, -0.03], [0.02, -0.33, -0.03], [W, -0.26, 0.004]], 10), 0.01)), strapMat);
  // Anneau sous le menton, puis la longe enroulée qui pend.
  const yC = -0.36;
  if (rope) mesh(g, shared('knot', () => new THREE.SphereGeometry(0.011, 8, 6)), strapMat, [0, yC, -0.02]);
  else mesh(g, shared('chinRing', () => new THREE.TorusGeometry(0.016, 0.0045, 6, 12)), metal, [0, yC, -0.02]);
  const leadColor = id === 'halterLeather' ? 0x8a6a48 : rope ? hexOf(c) : 0xe8e0cf;
  const lead = cached(`lead:${leadColor}`, () => new THREE.MeshStandardMaterial({ color: leadColor, roughness: 0.8, bumpMap: weaveTex(), bumpScale: 0.8 }));
  mesh(g, shared('snap', () => new THREE.CylinderGeometry(0.006, 0.006, 0.04, 8)), steelMat(), [0, yC - 0.03, -0.02]);
  mesh(g, shared('leadCoil', () => {
    const pts = [];
    const N = q(60, 28);
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2 * 2.6;
      pts.push([Math.sin(a) * 0.07, -0.05 - (1 - Math.cos(a)) * 0.07 - (i / N) * 0.072, Math.cos(a) * 0.015 - 0.02]);
    }
    return tube([[0, 0, -0.02], ...pts], 0.0065, false, 6);
  }), lead, [0, yC - 0.04, 0]);
  return g;
}

// ---------------------------------------------------------------- tapis, guêtres, cloches

/** Tapis de selle plié (posé à plat). */
export function padModel(id, color) {
  const g = new THREE.Group();
  const c = color ?? GEAR[id]?.colors?.[0] ?? 'white';
  if (id === 'gelPad') {
    // Amortisseur : mousse épaisse, bords arrondis, dessus lisse et passepoil.
    mesh(g, shared('gel', () => new RoundedBoxGeometry(0.34, 0.05, 0.46, q(4, 1), 0.022)), cached(`gel:${hexOf(c)}`, () => new THREE.MeshStandardMaterial({ color: hexOf(c), roughness: 0.55 })), [0, 0.025, 0]);
    mesh(g, shared('gelTop', () => new RoundedBoxGeometry(0.28, 0.012, 0.4, q(2, 1), 0.005)), cached(`gelTop:${hexOf(c)}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(hexOf(c)).lerp(new THREE.Color(0x888888), 0.25), roughness: 0.35 })), [0, 0.052, 0]);
    return g;
  }
  // Tapis matelassé plié en deux, avec son galon de couleur.
  mesh(g, shared('padFold', () => new RoundedBoxGeometry(0.34, 0.035, 0.5, q(3, 1), 0.015)), quiltMat(c), [0, 0.018, 0]);
  const trim = c === 'white' ? 0x23395d : 0xf1ede4;
  mesh(g, shared('padTrim', () => new RoundedBoxGeometry(0.352, 0.012, 0.512, q(2, 1), 0.005)), clothMat(trim), [0, 0.012, 0]);
  mesh(g, shared('padLogo', () => new THREE.CircleGeometry(0.03, 14)), clothMat(trim), [0.09, 0.0365, 0.15], [-Math.PI / 2, 0, 0]);
  return g;
}

/** Paire de guêtres debout. */
export function bootsModel(color) {
  const g = new THREE.Group();
  const c = clothMat(color ?? 'navy');
  const strapM = nylonMat(0x2a2a2a);
  for (const s of [1, -1]) {
    const b = new THREE.Group();
    b.position.set(s * 0.065, 0, 0);
    b.rotation.y = s * 0.4;
    g.add(b);
    mesh(b, shared('bootShell', () => new THREE.CylinderGeometry(0.045, 0.05, 0.22, 16, 1, true, 0.5, Math.PI * 1.75)), c, [0, 0.11, 0]);
    mesh(b, shared('bootStrike', () => new THREE.CylinderGeometry(0.052, 0.056, 0.13, 16, 1, true, 2.4, 1.5)), clothMat(0x1a1a1a), [0, 0.1, 0]);
    for (const y of [0.05, 0.11, 0.17]) mesh(b, shared('bootStrap', () => new THREE.TorusGeometry(0.051, 0.006, 4, 16, Math.PI * 0.9)), strapM, [0, y, 0], [Math.PI / 2, 0, 0.6]);
  }
  return g;
}

/** Paire de cloches (caoutchouc côtelé). */
export function bellsModel(color) {
  const g = new THREE.Group();
  const m = rubberMat(hexOf(color ?? 'black'));
  for (const s of [1, -1]) {
    const b = new THREE.Group();
    b.position.set(s * 0.075, 0, 0);
    g.add(b);
    mesh(b, shared('bell', () => new THREE.CylinderGeometry(0.048, 0.07, 0.09, 18, 1, true)), m, [0, 0.045, 0]);
    for (const y of [0.02, 0.045, 0.07]) mesh(b, shared(`bellRib:${y}`, () => new THREE.TorusGeometry(0.07 - y * 0.24, 0.004, 4, 20)), m, [0, y, 0], [Math.PI / 2, 0, 0]);
    mesh(b, shared('bellTab', () => new THREE.BoxGeometry(0.03, 0.03, 0.01)), nylonMat(0x2a2a2a), [0, 0.085, 0.05]);
  }
  return g;
}

// ---------------------------------------------------------------- couvertures

/**
 * Couverture posée sur une barre (le long de X) : elle retombe des deux côtés avec des plis,
 * un galon en bas et une sangle de poitrail.
 */
export function blanketModel(id, color) {
  const g = new THREE.Group();
  const c = color ?? GEAR[id]?.colors?.[0] ?? 'navy';
  const material = id === 'blanketSummer' ? netMat(c) : id === 'blanketRain' ? rainMat(c) : quiltMat(c);
  const len = 0.95;
  // Bas de la couverture : plus long au milieu (le ventre), plus court aux bouts (encolure, queue).
  const drop = (u) => 0.4 + 0.2 * Math.sin(Math.PI * Math.min(1, u * 1.15));
  const pleat = (u, a) => Math.sin(u * Math.PI * 9 + a * 0.5) * 0.02 * Math.sin(Math.PI * u);
  const geo = shared(`drape2:${id}`, () => {
    const nu = q(30, 16);
    const nv = q(18, 10);
    const pos = [];
    const uv = [];
    const idx = [];
    for (let j = 0; j <= nv; j++) {
      const v = j / nv; // 0 = bas devant, 1 = bas derrière
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        const x = (u - 0.5) * len;
        const a = (v - 0.5) * Math.PI; // -90° devant … +90° derrière
        const hang = Math.max(0, Math.abs(Math.sin(a)) - 0.35) / 0.65; // partie qui pend
        const r = 0.03;
        const y = Math.cos(a) * r - hang * drop(u);
        const z = Math.sign(a) * (Math.abs(Math.sin(a)) * r + hang * 0.05 + pleat(u, a) * Math.min(1, hang * 3));
        pos.push(x, y, z);
        uv.push(u * 2.2, v * 2);
      }
    }
    const W = nu + 1;
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const k = j * W + i;
        idx.push(k, k + 1, k + W, k + 1, k + W + 1, k + W);
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geom.setIndex(idx);
    geom.computeVertexNormals();
    return geom;
  });
  mesh(g, geo, material);
  // Galon qui suit le bas (devant et derrière), sangles croisées, boucles de poitrail.
  const trim = id === 'blanketSummer' ? 0x3a3a3a : 0xf1ede4;
  for (const sd of [1, -1]) {
    mesh(g, shared(`hem2:${sd}`, () => {
      const pts = [];
      const N = q(30, 16);
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        pts.push([(u - 0.5) * len, -drop(u) - 0.004, sd * (0.03 + 0.05 + pleat(u, sd * Math.PI / 2) + 0.004)]);
      }
      return tube(pts, 0.011, false, 6);
    }), clothMat(trim));
    if (id !== 'blanketSummer') {
      for (const u of [0.38, 0.62]) {
        const x = (u - 0.5) * len;
        mesh(g, shared('surcingle', () => new THREE.BoxGeometry(0.03, 0.32, 0.006)), nylonMat(0x2a2a2a), [x, -drop(u) * 0.62, sd * (0.088 + pleat(u, sd) * 0.5)], [0, 0, u > 0.5 ? 0.45 : -0.45]);
      }
    }
  }
  mesh(g, shared('chestBuckle', () => new THREE.BoxGeometry(0.04, 0.03, 0.012)), steelMat(), [len * 0.44, -0.22, 0.09]);
  mesh(g, shared('chestStrap', () => new THREE.BoxGeometry(0.1, 0.025, 0.006)), nylonMat(0x2a2a2a), [len * 0.4, -0.22, 0.087]);
  if (id === 'blanket') mesh(g, shared('fleeceCollar', () => new THREE.CylinderGeometry(0.05, 0.05, 0.18, 14)), fleeceMat(0xe8e0d2), [len * 0.5 - 0.07, 0.0, 0], [0, 0, Math.PI / 2]);
  return g;
}

/** Bonnet anti-mouches posé (voile et oreilles). */
export function flyMaskModel(color) {
  const g = new THREE.Group();
  const net = netMat(color ?? 'white');
  mesh(g, shared('maskHood', () => new THREE.SphereGeometry(0.11, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)), net, [0, 0.0, 0], null, [1, 0.8, 1.4]);
  for (const s of [1, -1]) mesh(g, shared('maskEar', () => new THREE.ConeGeometry(0.03, 0.1, 10, 1, true)), net, [s * 0.05, 0.1, -0.06], [-0.3, 0, s * 0.25]);
  mesh(g, shared('maskRim', () => new THREE.TorusGeometry(0.11, 0.006, 5, 24)), nylonMat(0x6a7f8a), [0, 0.003, 0], [Math.PI / 2, 0, 0], [1, 1.4, 1]);
  return g;
}

// ---------------------------------------------------------------- bombe du cavalier

/** Bombe d'équitation : coque, visière, harnais. Sert aussi sur la tête de l'avatar (scale). */
export function helmetModel(id, color) {
  const g = new THREE.Group();
  const c = color ?? GEAR[id]?.colors?.[0] ?? 'black';
  const shell = id === 'helmetSparkle' ? glitterMat(c) : velvetMat(c);
  mesh(g, shared('helmShell', () => new THREE.SphereGeometry(0.115, q(24, 14), q(14, 7), 0, Math.PI * 2, 0, Math.PI * 0.52)), shell, [0, 0, 0], null, [1, 0.95, 1.12]);
  // Visière.
  mesh(g, shared('helmPeak', () => {
    const geo = new THREE.CylinderGeometry(0.118, 0.13, 0.012, 24, 1, false, -0.85, 1.7);
    return geo;
  }), shell, [0, -0.004, 0.012], [0.12, 0, 0], [1, 1, 1.12]);
  // Liseré, aérations et harnais.
  mesh(g, shared('helmRim', () => new THREE.TorusGeometry(0.115, 0.006, 6, 30)), velvetMat(0x1a1a1a), [0, -0.003, 0], [Math.PI / 2, 0, 0], [1, 1.12, 1]);
  if (id === 'helmetSparkle') {
    // Aérations posées sur la coque : chaque barrette suit la pente du dessus (corde entre ses deux bouts,
    // un peu enfoncée), sinon les côtés flottent au-dessus de la coque arrondie.
    const surf = (x, z) => 0.95 * Math.sqrt(Math.max(0, 0.115 ** 2 - x * x - (z / 1.12) ** 2)); // dessus de la coque
    const len = 0.04;
    const zc = -0.01;
    for (const s of [-1, 0, 1]) {
      const x = s * 0.035;
      const y0 = surf(x, zc - len / 2);
      const y1 = surf(x, zc + len / 2);
      const slopeX = (surf(x + 0.001, zc) - surf(x - 0.001, zc)) / 0.002;
      mesh(g, shared('vent2', () => new THREE.BoxGeometry(0.012, 0.004, len)), cached('ventMat', () => new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.3, metalness: 0.8 })),
        [x, (y0 + y1) / 2 + 0.0012, zc], [-Math.atan2(y1 - y0, len), 0, Math.atan(slopeX)]);
    }
  } else mesh(g, shared('button', () => new THREE.SphereGeometry(0.012, 8, 6)), velvetMat(c), [0, 0.108, 0]);
  for (const s of [1, -1]) mesh(g, shared('harness', () => new THREE.TorusGeometry(0.06, 0.004, 4, 14, Math.PI * 0.8)), nylonMat(0x1a1a1a), [s * 0.1, -0.05, 0.0], [0, Math.PI / 2, Math.PI * 1.1]);
  return g;
}

// ---------------------------------------------------------------- chiens et chats

export function collarModel(color) {
  const g = new THREE.Group();
  mesh(g, shared('collarRing', () => new THREE.TorusGeometry(0.07, 0.012, 6, 22)), nylonMat(color ?? 'red'), [0, 0.012, 0], [Math.PI / 2, 0, 0], [1, 1, 0.5]);
  mesh(g, shared('tag', () => new THREE.CylinderGeometry(0.016, 0.016, 0.004, 14)), brassMat(), [0, 0.016, 0.085], [0, 0, 0]);
  return g;
}

export function leashModel() {
  const g = new THREE.Group();
  mesh(g, shared('leashCoil', () => {
    const pts = [];
    const N = q(50, 24);
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2 * 2.2;
      const k = (i / N) * 50;
      pts.push([Math.cos(a) * (0.08 - k * 0.0004), 0.012 + k * 0.0006, Math.sin(a) * (0.08 - k * 0.0004)]);
    }
    return tube(pts, 0.007, false, 6);
  }), nylonMat(0x2e6fb0));
  mesh(g, shared('leashSnap', () => new THREE.CylinderGeometry(0.007, 0.007, 0.04, 8)), steelMat(), [0.08, 0.02, 0], [0, 0, Math.PI / 2]);
  return g;
}

export function dogCoatModel(color) {
  const g = new THREE.Group();
  const m = quiltMat(color ?? 'red');
  mesh(g, shared('coatBody', () => new THREE.CylinderGeometry(0.11, 0.11, 0.32, 18, 1, true, -Math.PI * 0.6, Math.PI * 1.2)), m, [0, 0.0, 0], [Math.PI / 2, 0, 0]);
  mesh(g, shared('coatTrim', () => new THREE.TorusGeometry(0.11, 0.008, 5, 20, Math.PI * 1.2)), clothMat(0xf1ede4), [0, 0, 0.16], [0, 0, -Math.PI * 0.1 + Math.PI * 0.5 - Math.PI * 0.6]);
  return g;
}

// ---------------------------------------------------------------- point d'entrée

/**
 * Le modèle 3D posé d'un objet du catalogue, dans la couleur demandée.
 * opts.lite : version allégée (exposée au mur) ; la fiche garde le modèle détaillé.
 */
export function tackModel(id, color, opts = {}) {
  if (opts.lite && !LITE) return withLite(() => tackModel(id, color));
  const def = GEAR[id];
  const c = def?.colors?.includes(color) ? color : def?.colors?.[0];
  switch (def?.type) {
    case 'saddle': return saddleModel(id, c);
    case 'bridle': return bridleModel(id, c);
    case 'halter': return halterModel(id, c);
    case 'pad': return padModel(id, c);
    case 'boots': return bootsModel(c);
    case 'bells': return bellsModel(c);
    case 'blanket': return blanketModel(id, c);
    case 'flyMask': return flyMaskModel(c);
    case 'helmet': return helmetModel(id, c);
    case 'collar': return collarModel(c);
    case 'leash': return leashModel();
    case 'dogCoat': return dogCoatModel(c);
    default: return new THREE.Group();
  }
}

/** Où se pose l'objet : 'rack' (porte-selle), 'hook' (crochet), 'bar' (barre), 'shelf' (étagère). */
export function tackMount(id) {
  const t = GEAR[id]?.type;
  if (t === 'saddle') return 'rack';
  if (t === 'bridle' || t === 'halter') return 'hook';
  if (t === 'blanket') return 'bar';
  return 'shelf';
}

// ---------------------------------------------------------------- fusion (moins d'appels de rendu)

const KEEP = new Set(['position', 'normal', 'uv']);

/**
 * Fusionne tous les maillages sous root en un seul maillage par matériau (dans le repère de root).
 * Les géométries partagées ne sont pas touchées (on travaille sur des copies) ; les autres sont libérées.
 * keep(o) → vrai pour garder un maillage tel quel (ex. une étiquette, un personnage animé).
 * occluder : les maillages fusionnés peuvent devenir transparents quand ils cachent le joueur (murs).
 */
export function bakeMeshes(root, keep = null, { occluder = false } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byMat = new Map();
  const done = [];
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || (keep && keep(o))) return;
    let ok = true;
    for (let p = o; p && p !== root; p = p.parent) if (!p.visible) ok = false;
    done.push(o);
    if (!ok) return;
    const src = o.geometry;
    const g = src.index ? src.toNonIndexed() : src.clone();
    for (const name of Object.keys(g.attributes)) if (!KEEP.has(name)) g.deleteAttribute(name);
    g.morphAttributes = {};
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    g.applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
    const list = byMat.get(o.material) ?? [];
    list.push(g);
    byMat.set(o.material, list);
  });
  for (const o of done) {
    o.parent?.remove(o);
    if (!o.geometry.userData.shared) o.geometry.dispose();
  }
  const out = [];
  for (const [material, list] of byMat) {
    const merged = list.length === 1 ? list[0] : mergeGeometries(list);
    if (list.length > 1) list.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.noOccluder = !occluder; // murs et toit : ils s'effacent quand ils cachent le joueur
    mesh.userData.baked = true;
    root.add(mesh);
    out.push(mesh);
  }
  return out;
}

// ---------------------------------------------------------------- pièces pour l'équipement porté (gearModels.js)

/** Cuir repoussé de la selle western (jupes, fenders). */
const tooledMat = (c) => cached(`tooled:${hexOf(c)}`, () => new THREE.MeshStandardMaterial({
  color: hexOf(c), roughness: 0.5, bumpMap: toolingTex(), bumpScale: 1.6, side: THREE.DoubleSide,
}));

/** Contour d'un quartier de selle anglaise (v de 0 en haut à 1 en bas) → [s gauche, s droite]. */
export function flapOutline(st, k = 1) {
  const [L, W, fwd] = st.flap;
  return (v) => {
    const lean = Math.tan(fwd) * v * L * k;
    const round = v > 0.72 ? Math.sqrt(Math.max(0.02, 1 - ((v - 0.72) / 0.28) ** 2)) : 1;
    const half = (W / 2) * k * (0.92 + 0.08 * (1 - v));
    const c = lean - W * k * 0.08;
    return [c - half * round, c + half * round];
  };
}

/** Matériaux et formes partagés avec l'équipement porté par les animaux. */
export const TACK_PARTS = {
  plate, plateEdge, tube, flatStrap, stirrupIron, seatSections,
  leatherMat, leatherDS, edgeMat, suedeMat, clothMat, quiltMat, nylonMat, rubberMat, steelMat, brassMat,
  fleeceMat, woodMat, netMat, rainMat, tooledMat, shared,
};
