// Modèles 3D des animaux, sculptés par le code.
// Le tronc (avec la base de l'encolure) et la tête sont des formes fondues entre elles
// (champs de distance → maillage lisse) ; pattes, haut du cou, queues, oreilles et cornes
// sont des « lofts » (tubes lisses à section variable).
// L'animal regarde vers +Z. Les pivots (pattes, cou, tête, queue, oreilles) servent aux animations.
// En qualité « high », une fourrure en couches (shells) recouvre le pelage de près.

import * as THREE from 'three';
import { loft, strands, noise3 } from './shapes.js';
import { ellipsoid, roundCone, blend, sdfMesh, rayHit, sdfNormal } from './sdf.js';
import { coatTextures, woolTextures, hairTexture, eyeTexture, lum } from '../textures.js';
import { gfx } from '../gfx.js';
import { SPECIES } from '../../sim/species.js';

// ------------------------------------------------------------------ anatomie par espèce
// torso : formes du tronc. ['e', miroir, centre (x/R, y/R, z/L), rayons (x/R, y/R, z/L), k (fondu, /R)]
// neck.s : [t (0 = base, 1 = tête), largeur/R, profondeur côté crinière/R, décalage/R, profondeur côté gorge/R]
// head : formes de la tête en unités de hr (F = longueur du museau / hr).
const SPEC = {
  horse: {
    tilt: 1.0, rough: 0.5, legs: 'hoof', legX: 0.42,
    fur: { len: 0.005, head: 0.5 },
    torso: [
      ['e', 0, [0, 0.05, 0.1], [0.92, 1.0, 0.3]],
      ['e', 0, [0, -0.18, -0.05], [0.88, 0.82, 0.3], 0.3],
      ['e', 0, [0, 0.08, -0.32], [0.86, 0.93, 0.22], 0.3],
      ['e', 0, [0, -0.05, -0.42], [0.72, 0.86, 0.12], 0.25],
      ['e', 0, [0, -0.08, 0.36], [0.66, 0.88, 0.15], 0.3],
      ['e', 1, [0.42, 0.05, 0.32], [0.36, 0.85, 0.14], 0.3],
      ['e', 1, [0.4, -0.22, -0.33], [0.46, 0.85, 0.16], 0.3],
      ['e', 0, [0, 0.72, 0.28], [0.32, 0.32, 0.12], 0.35],
    ],
    neck: { base: [0.32, 0.28], s: [[-0.3, 0.55, 0.75, 0, 1.05], [0, 0.5, 0.68, 0, 0.92], [0.3, 0.38, 0.52, 0, 0.62], [0.6, 0.29, 0.4, 0, 0.42], [0.85, 0.25, 0.34, 0, 0.32], [1.0, 0.23, 0.31, 0, 0.28], [1.12, 0.2, 0.26, 0, 0.24]] },
    muzzleLen: (hl, hr, s) => hl * 0.85 * s - 0.69 * hr,
    head: (F) => {
      const t = 0.69 + F;
      return [
        ['e', 0, [0, 0.2, -0.75], [0.9, 0.8, 0.75]],
        ['e', 1, [0.42, -0.5, -0.3], [0.5, 0.75, 0.7], 0.35],
        ['c', 0, [0, 0.05, -0.3], [0, -0.22, t - 0.55], 0.8, 0.48, 0.95, 0.3],
        ['e', 0, [0, -0.3, t - 0.5], [0.55, 0.55, 0.5], 0.2],
        ['e', 0, [0, -0.62, t - 0.55], [0.42, 0.28, 0.45], 0.15],
        ['e', 1, [0.32, -0.12, t - 0.35], [0.22, 0.28, 0.3], 0.12],
        ['e', 1, [0.5, 0.42, 0.05], [0.28, 0.16, 0.35], 0.2],
      ];
    },
    eye: { o: [0, 0.25, 0.1], d: [1, 0.3, 0.15], r: 0.21, fwd: 0.2, pupil: 'oval' },
    ear: { o: [0, 0.3, -0.8], d: [0.42, 1, -0.1], len: 1.15, w: 0.3 },
    nose: { y: -0.15 },
    tail: [-0.5, 0.55],
  },
  dog: {
    tilt: 0.15, rough: 0.8, legs: 'paw', legX: 0.45,
    fur: { len: 0.0072, head: 0.4 },
    torso: [
      ['e', 0, [0, 0, 0.12], [0.88, 1.0, 0.28]],
      ['e', 0, [0, 0.12, -0.13], [0.72, 0.72, 0.24], 0.3],
      ['e', 0, [0, 0.08, -0.35], [0.78, 0.82, 0.18], 0.3],
      ['e', 0, [0, -0.1, 0.34], [0.7, 0.9, 0.16], 0.3],
      ['e', 1, [0.42, 0.05, 0.3], [0.34, 0.8, 0.14], 0.3],
      ['e', 1, [0.42, -0.15, -0.34], [0.42, 0.8, 0.16], 0.3],
    ],
    neck: { base: [0.36, 0.3], s: [[-0.45, 0.62, 0.7, 0, 0.78], [0, 0.56, 0.62, 0, 0.7], [0.5, 0.5, 0.54, 0, 0.58], [1, 0.46, 0.5, 0, 0.52], [1.15, 0.42, 0.45, 0, 0.45]] },
    muzzleLen: (hl, hr, s) => hl * 0.45 * s,
    head: (F) => [
      ['e', 0, [0, 0.1, -0.25], [0.92, 0.88, 1.0]],
      ['e', 1, [0.42, -0.25, 0.15], [0.45, 0.5, 0.55], 0.3],
      ['e', 1, [0.32, 0.35, 0.4], [0.28, 0.2, 0.25], 0.2],
      ['c', 0, [0, -0.2, 0.45], [0, -0.3, 0.45 + F], 0.5, 0.36, 1.05, 0.25],
      ['e', 0, [0, -0.52, 0.45 + F * 0.45], [0.36, 0.2, F * 0.55 + 0.1], 0.2],
      ['e', 1, [0.22, -0.42, 0.45 + F * 0.7], [0.22, 0.25, F * 0.35 + 0.05], 0.1],
    ],
    eye: { o: [0, 0.16, 0.4], d: [0.7, 0.18, 0.7], r: 0.16, fwd: 0.5, pupil: 'round' },
    ear: { o: [0, 0.45, -0.35], d: [0.85, 0.75, 0], len: 1.0, w: 0.5 },
    nose: { y: -0.22 },
    tail: [-0.5, 0.45],
  },
  cat: {
    tilt: 0.1, rough: 0.85, legs: 'paw', legX: 0.45,
    fur: { len: 0.009, head: 0.4 },
    torso: [
      ['e', 0, [0, 0, 0.1], [0.85, 0.9, 0.3]],
      ['e', 0, [0, -0.1, -0.1], [0.82, 0.82, 0.3], 0.3],
      ['e', 0, [0, 0.05, -0.35], [0.85, 0.88, 0.18], 0.3],
      ['e', 0, [0, -0.05, 0.33], [0.7, 0.82, 0.16], 0.3],
      ['e', 1, [0.4, 0.1, 0.3], [0.34, 0.75, 0.13], 0.3],
      ['e', 1, [0.45, -0.1, -0.34], [0.45, 0.85, 0.17], 0.3],
    ],
    neck: { base: [0.36, 0.28], s: [[-0.6, 0.62, 0.68, 0, 0.74], [0, 0.56, 0.6, 0, 0.66], [1, 0.5, 0.52, 0, 0.56], [1.2, 0.44, 0.46, 0, 0.48]] },
    muzzleLen: (hl, hr, s) => hl * 0.6 * s,
    head: (F) => [
      ['e', 0, [0, 0.08, -0.25], [1.0, 0.88, 0.95]],
      ['e', 1, [0.48, -0.3, 0.1], [0.5, 0.48, 0.5], 0.3],
      ['e', 1, [0.2, -0.32, 0.6 + F], [0.28, 0.24, 0.26], 0.15],
      ['e', 0, [0, -0.52, 0.45 + F * 0.5], [0.28, 0.18, 0.3], 0.15],
      ['c', 0, [0, 0.1, 0.3], [0, -0.12, 0.68 + F], 0.38, 0.18, 1, 0.2],
    ],
    eye: { o: [0, 0.14, 0.3], d: [0.62, 0.15, 0.78], r: 0.2, fwd: 0.55, pupil: 'slit' },
    ear: { o: [0, 0.5, -0.3], d: [0.7, 1, 0], len: 0.95, w: 0.62 },
    nose: { y: -0.15 },
    tail: [-0.52, 0.35],
  },
  rabbit: {
    tilt: 0.2, rough: 0.9, legs: 'rabbit', legX: 0.55,
    fur: { len: 0.009, head: 0.5 },
    torso: [
      ['e', 0, [0, 0, -0.35], [1.12, 1.08, 0.3]],
      ['e', 0, [0, 0.05, -0.05], [1.0, 0.95, 0.28], 0.35],
      ['e', 0, [0, 0.2, 0.25], [0.72, 0.75, 0.2], 0.35],
      ['e', 1, [0.6, -0.15, -0.32], [0.5, 0.75, 0.22], 0.3],
    ],
    neck: { base: [0.3, 0.42], s: [[-0.8, 0.62, 0.62, 0, 0.62], [0, 0.56, 0.56, 0, 0.56], [1.4, 0.5, 0.5, 0, 0.5]] },
    muzzleLen: (hl, hr, s) => hl * 0.6 * s,
    head: (F) => [
      ['e', 0, [0, 0.08, -0.25], [0.9, 0.85, 1.05]],
      ['e', 1, [0.45, -0.25, 0.25], [0.48, 0.52, 0.6], 0.3],
      ['e', 0, [0, -0.12, 0.7 + F], [0.52, 0.48, 0.45], 0.25],
      ['e', 1, [0.18, -0.25, 0.92 + F], [0.24, 0.24, 0.24], 0.12],
    ],
    eye: { o: [0, 0.22, 0.15], d: [1, 0.3, 0.1], r: 0.23, fwd: 0.1, pupil: 'round' },
    ear: { o: [0, 0.5, -0.45], d: [0.3, 1, -0.2], len: 2.3, w: 0.42 },
    nose: { y: -0.1 },
    tail: [-0.62, 0.25],
  },
  sheep: {
    tilt: 0.6, rough: 0.9, legs: 'cloven', legX: 0.45,
    fur: { len: 0.004, head: 1 },
    torso: [
      ['e', 0, [0, 0, 0], [1, 1, 0.42]],
      ['e', 0, [0, 0.02, -0.34], [0.95, 0.98, 0.2], 0.3],
      ['e', 0, [0, 0.04, 0.34], [0.88, 0.92, 0.19], 0.3],
    ],
    neck: { base: [0.38, 0.32], s: [[-0.45, 0.6, 0.72, 0, 0.78], [0, 0.55, 0.62, 0, 0.66], [0.5, 0.4, 0.44, 0, 0.48], [0.9, 0.25, 0.28, 0, 0.3], [1.05, 0.2, 0.22, 0, 0.24]] },
    muzzleLen: (hl, hr, s) => hl * 0.6 * s,
    head: (F) => [
      ['e', 0, [0, 0.1, -0.3], [0.88, 0.88, 0.85]],
      ['e', 1, [0.35, -0.3, 0.05], [0.45, 0.55, 0.65], 0.3],
      ['e', 0, [0, 0.1, 0.35 + F * 0.4], [0.5, 0.42, 0.55 + F * 0.5], 0.3],
      ['c', 0, [0, 0, 0.1], [0, -0.2, 0.55 + F], 0.68, 0.42, 1, 0.3],
      ['e', 0, [0, -0.25, 0.55 + F], [0.45, 0.45, 0.38], 0.2],
    ],
    eye: { o: [0, 0.25, 0.15], d: [1, 0.3, 0.2], r: 0.2, fwd: 0.2, pupil: 'bar' },
    ear: { o: [0, 0.2, -0.3], d: [1, 0.25, 0], len: 0.95, w: 0.38 },
    nose: { y: -0.2 },
    tail: [-0.54, 0.45],
  },
  goat: {
    tilt: 0.5, rough: 0.7, legs: 'cloven', legX: 0.47,
    fur: { len: 0.007, head: 0.5 },
    torso: [
      ['e', 0, [0, -0.08, 0], [0.88, 1.05, 0.32]],
      ['e', 0, [0, 0.12, -0.36], [0.7, 0.85, 0.17], 0.3],
      ['e', 1, [0.42, 0.55, -0.32], [0.2, 0.2, 0.08], 0.2],
      ['e', 0, [0, 0, 0.34], [0.65, 0.9, 0.16], 0.3],
      ['e', 1, [0.38, 0.05, 0.3], [0.3, 0.8, 0.13], 0.3],
      ['e', 1, [0.38, -0.2, -0.35], [0.38, 0.8, 0.15], 0.3],
      ['e', 0, [0, 0.7, 0.26], [0.3, 0.3, 0.12], 0.3],
    ],
    neck: { base: [0.36, 0.42], s: [[-0.4, 0.55, 0.75, 0, 0.78], [0, 0.48, 0.66, 0, 0.7], [0.5, 0.36, 0.48, 0, 0.5], [1, 0.33, 0.44, 0, 0.45], [1.12, 0.3, 0.4, 0, 0.4]] },
    muzzleLen: (hl, hr, s) => hl * 0.6 * s,
    head: (F) => [
      ['e', 0, [0, 0.12, -0.3], [0.82, 0.82, 0.82]],
      ['e', 1, [0.32, -0.28, 0.05], [0.42, 0.52, 0.6], 0.3],
      ['c', 0, [0, 0.05, 0.1], [0, -0.2, 0.5 + F], 0.62, 0.36, 1, 0.3],
      ['e', 0, [0, -0.25, 0.5 + F], [0.4, 0.42, 0.38], 0.2],
      ['e', 0, [0, -0.48, 0.3 + F * 0.7], [0.28, 0.2, 0.4], 0.15],
    ],
    eye: { o: [0, 0.28, 0.12], d: [1, 0.35, 0.2], r: 0.21, fwd: 0.2, pupil: 'bar' },
    ear: { o: [0, 0.25, -0.4], d: [1, 0.35, -0.1], len: 1.4, w: 0.42 },
    nose: { y: -0.2 },
    tail: [-0.53, 0.75],
  },
  cow: {
    tilt: 0.8, rough: 0.7, legs: 'cloven', legX: 0.5,
    fur: { len: 0.007, head: 0.5 },
    torso: [
      ['e', 0, [0, -0.08, 0], [1.0, 1.08, 0.36]],
      ['e', 0, [0, 0.05, -0.36], [0.92, 0.95, 0.17], 0.3],
      ['e', 1, [0.68, 0.68, -0.3], [0.26, 0.24, 0.08], 0.25],
      ['e', 1, [0.32, 0.6, -0.49], [0.18, 0.2, 0.06], 0.2],
      ['e', 0, [0, -0.05, 0.36], [0.75, 0.95, 0.16], 0.3],
      ['e', 0, [0, -0.72, 0.42], [0.36, 0.32, 0.1], 0.3],
      ['e', 1, [0.48, 0, 0.32], [0.4, 0.85, 0.13], 0.3],
      ['e', 1, [0.5, -0.2, -0.36], [0.45, 0.8, 0.16], 0.3],
    ],
    neck: { base: [0.38, 0.32], s: [[-0.4, 0.5, 0.6, 0, 0.95], [0, 0.46, 0.55, 0, 0.88], [0.5, 0.36, 0.42, 0, 0.68], [1, 0.3, 0.36, 0, 0.46], [1.12, 0.27, 0.3, 0, 0.36]] },
    muzzleLen: (hl, hr, s) => hl * 0.6 * s,
    head: (F) => [
      ['e', 0, [0, 0.3, -0.45], [0.95, 0.5, 0.45]],
      ['e', 0, [0, 0.1, -0.2], [0.98, 0.78, 0.8], 0.3],
      ['c', 0, [0, 0, 0.2], [0, -0.15, 0.45 + F], 0.72, 0.52, 1.1, 0.3],
      ['e', 0, [0, -0.18, 0.4 + F], [0.68, 0.55, 0.48], 0.2],
      ['e', 1, [0.42, -0.45, -0.05], [0.45, 0.6, 0.7], 0.3],
      ['e', 0, [0, -0.6, 0.3 + F * 0.6], [0.35, 0.25, 0.5], 0.2],
    ],
    eye: { o: [0, 0.25, 0], d: [1, 0.35, 0.15], r: 0.18, fwd: 0.2, pupil: 'oval' },
    ear: { o: [0, 0.1, -0.35], d: [1, 0.05, -0.1], len: 1.0, w: 0.5 },
    nose: { y: -0.18 },
    tail: [-0.55, 0.85],
  },
};

const HORN_COLORS = { goat: [0x6b5f50, 0x9a8d78], ram: [0x8a7b66, 0xd8ccb2], cow: [0xe8dcc0, 0x3a3029], long: [0xe6d9bb, 0x4a3a2e] };

// ------------------------------------------------------------------ utilitaires

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
}

function add(parent, geo, material, pos = null, rot = null, scale = null, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const sphere = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);

/**
 * Formes SDF à partir d'une liste ['e', miroir, centre, rayons, k] ou ['c', miroir, a, b, ra, rb, sx, k].
 * sc = [échelle x, y, z] des coordonnées, sr = échelle des rayons, off = décalage.
 * Renvoie la fonction de distance et sa boîte englobante.
 */
function buildShapes(list, sc, sr, off = [0, 0, 0], extra = []) {
  const prims = [];
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  const grow = (c, r) => {
    for (let i = 0; i < 3; i++) {
      mn[i] = Math.min(mn[i], c[i] - r[i]);
      mx[i] = Math.max(mx[i], c[i] + r[i]);
    }
  };
  for (const item of list) {
    const sides = item[1] ? [1, -1] : [1];
    for (const s of sides) {
      if (item[0] === 'e') {
        const [, , c, r, k = 0] = item;
        const cc = [s * c[0] * sc[0] + off[0], c[1] * sc[1] + off[1], c[2] * sc[2] + off[2]];
        const rr = [r[0] * sr[0], r[1] * sr[1], r[2] * sr[2]];
        prims.push([ellipsoid(cc, rr), k * sr[0]]);
        grow(cc, rr);
      } else {
        const [, , a, b, ra, rb, sx = 1, k = 0] = item;
        const aa = [s * a[0] * sc[0] + off[0], a[1] * sc[1] + off[1], a[2] * sc[2] + off[2]];
        const bb = [s * b[0] * sc[0] + off[0], b[1] * sc[1] + off[1], b[2] * sc[2] + off[2]];
        prims.push([roundCone(aa, bb, ra * sr[0], rb * sr[0], sx), k * sr[0]]);
        grow(aa, [ra * sr[0] * sx, ra * sr[0], ra * sr[0]]);
        grow(bb, [rb * sr[0] * sx, rb * sr[0], rb * sr[0]]);
      }
    }
  }
  for (const [f, k, c, r] of extra) {
    prims.push([f, k]);
    grow(c, r);
  }
  return { sdf: blend(prims), bounds: [mn, mx] };
}

/** Coordonnées de texture « cylindriques » autour de l'axe z (u = 0 sous le ventre). */
const cylUv = (yc, z0, z1) => (x, y, z) => {
  let u = (Math.atan2(y - yc, x) + Math.PI / 2) / (Math.PI * 2);
  if (u < 0) u += 1;
  if (u >= 1) u -= 1;
  return [u, (z - z0) / (z1 - z0)];
};

/** Projection « boîte » en mètres (laine) : pas de pincement aux bouts du corps. */
const boxUv = (sdf, tile) => (x, y, z) => {
  const e = 0.004;
  const gx = Math.abs(sdf(x + e, y, z) - sdf(x - e, y, z));
  const gy = Math.abs(sdf(x, y + e, z) - sdf(x, y - e, z));
  const gz = Math.abs(sdf(x, y, z + e) - sdf(x, y, z - e));
  if (gx >= gy && gx >= gz) return [z / tile, y / tile];
  if (gy >= gz) return [x / tile, z / tile];
  return [x / tile, y / tile];
};

/**
 * Fourrure en couches : la même forme répétée et gonflée ; chaque poil est une petite
 * cellule d'un réseau 3D. Elle s'efface avec la distance (coût nul au loin).
 */
const SHELLS = 6;
const FUR_CELL = 420; // cellules par mètre (≈ 2,4 mm)
function addShells(mesh, len) {
  if (gfx.quality !== 'high' || len < 0.002) return;
  const base = mesh.material;
  const m = base.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.furLen = { value: len };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float furLen;
varying vec3 vFurPos;
varying float vFurH;
varying float vFurFade;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vFurH = (float(gl_InstanceID) + 1.0) / ${SHELLS}.0;
vFurPos = position * ${FUR_CELL}.0;
transformed += objectNormal * furLen * vFurH;
transformed.y -= furLen * vFurH * vFurH * 0.4;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
vFurFade = 1.0 - smoothstep(1.5, 4.5, -mvPosition.z);
if (vFurFade <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vFurPos;
varying float vFurH;
varying float vFurFade;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec3 furCell = floor(vFurPos);
vec3 furF = fract(vFurPos) - 0.5;
float furRnd = fract(sin(dot(furCell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
float furRad = 0.62 * (1.0 - vFurH * 0.6);
if (dot(furF, furF) > furRad * furRad || vFurH > (0.3 + 0.7 * furRnd) * vFurFade) discard;
diffuseColor.rgb *= mix(0.86, 1.03, vFurH);`);
  };
  m.customProgramCacheKey = () => `fur${SHELLS}`;
  const shells = new THREE.InstancedMesh(mesh.geometry, m, SHELLS);
  shells.castShadow = false;
  shells.receiveShadow = true;
  shells.userData.shells = true;
  mesh.add(shells);
}

/** Les formes sculptées (tronc, tête) sont partagées entre animaux de même gabarit. */
const geoCache = new Map();
function cachedGeo(key, make) {
  if (!geoCache.has(key)) {
    const g = make();
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return geoCache.get(key);
}

/** Retrouve la race à partir de la robe (look ne garde pas l'id de la race). */
function breedOf(speciesId, look) {
  const sp = SPECIES[speciesId];
  if (!sp) return null;
  return sp.breeds.find((b) => b.colors.some((c) => c.coat === look.coat && c.secondary === look.secondary
    && (!look.colorName || c.name?.fr === look.colorName.fr))) ?? null;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Section du cou interpolée en t : centre (repère du cou), largeur, profondeurs. */
function neckAt(ns, t) {
  let i = 0;
  while (i < ns.length - 2 && ns[i + 1][0] < t) i++;
  const a = ns[i];
  const b = ns[i + 1];
  const f = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
  const l = (k) => a[k] + (b[k] - a[k]) * f;
  return { w: l(1), dc: l(2), zo: l(3), dt: l(4) };
}

// ------------------------------------------------------------------ construction

export function buildAnimalModel(speciesId, look) {
  const S = SPEC[speciesId] ?? SPEC.dog;
  const high = gfx.quality === 'high';
  const m = look;
  const breed = breedOf(speciesId, look);
  const opt = (key) => breed?.[key] ?? look[key];
  const pattern = look.pattern;
  const fluff = m.fluff ?? 1;
  const L = m.bodyLen;
  const R = m.bodyR * fluff;
  const legLen = m.legLen * (m.legs ?? 1);
  const legR = m.legR * (1 + (fluff - 1) * 0.4);
  const y0 = legLen + R * 0.85;
  const wool = !!opt('wool');
  const horns = opt('horns') && opt('horns') !== 'none' ? opt('horns') : null;
  const shaggy = speciesId === 'cow' && fluff > 1.2;

  const tex = coatTextures(look, speciesId);
  const rough = S.rough;
  const coatMat = (map) => mat(0xffffff, { map, roughness: rough });
  const M = {
    body: coatMat(tex.body),
    neck: coatMat(tex.neck),
    head: coatMat(tex.head),
    tail: coatMat(tex.tail),
    ear: coatMat(tex.ear),
    legs: tex.legs.map((t, i) => (i > 0 && t === tex.legs[i - 1] ? null : coatMat(t))),
    dark: mat(0x1d1816, { roughness: 0.4 }),
    rim: mat(0x15100e, { roughness: 0.5 }),
    hoof: mat(0x2f2924, { roughness: 0.55, side: THREE.DoubleSide }),
    pink: mat(0xc98d8a, { roughness: 0.6 }),
    innerEar: mat(speciesId === 'horse' || speciesId === 'cow' ? 0x3a302a : 0xc99a94, { roughness: 0.8 }),
    mane: new THREE.MeshStandardMaterial({
      color: look.mane, map: hairTexture(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.55,
    }),
  };
  for (let i = 1; i < 4; i++) if (!M.legs[i]) M.legs[i] = M.legs[i - 1];
  const faceColor = wool || pattern === 'points' ? look.secondary
    : speciesId === 'cow' && pattern === 'patches' ? (lum(look.coat) < lum(look.secondary) ? look.coat : look.secondary) : look.coat;
  let woolMat = null;
  if (wool) {
    const w = woolTextures(look.coat);
    woolMat = mat(0xffffff, { map: w.map, bumpMap: high ? w.bump : null, bumpScale: 2.5, roughness: 0.95 });
    woolMat.map.repeat.set(1, 1);
  }

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const parts = { root, body, legs: [], y0 };
  const fur = S.fur;
  const rawFur = speciesId === 'dog' ? fur.len * fluff ** 3 : speciesId === 'cat' || speciesId === 'rabbit' ? fur.len * fluff ** 4 : fur.len * fluff ** 2;
  // Pelage ras (chevaux, vaches, chèvres) : pas de couches de poils, le reflet satiné suffit.
  const furLen = rawFur >= 0.008 ? rawFur : 0;

  // --- Ombre de contact douce sous l'animal (aussi sur téléphone, où il n'y a pas d'ombres portées).
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  shadowGeo.rotateX(-Math.PI / 2);
  const contact = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({
    map: contactShadowTexture(), transparent: true, depthWrite: false, opacity: high ? 0.55 : 0.7, toneMapped: false,
  }));
  contact.scale.set(R * 3.2, 1, L * 1.5);
  contact.position.y = 0.015;
  contact.renderOrder = -1;
  root.add(contact);

  // --- Tronc et base de l'encolure, fondus en une seule surface.
  const [nbz, nby] = S.neck.base;
  const nl = m.neckLen;
  const na = m.neckAngle;
  const neckBase = new THREE.Vector3(0, y0 + R * nby, L * nbz);
  const neckDir = new THREE.Vector3(0, Math.cos(na), Math.sin(na));
  const crestDir = new THREE.Vector3(0, Math.sin(na), -Math.cos(na));
  const ns = S.neck.s;
  const neckChain = [];
  const chainT = ns.map((s) => s[0]).filter((t) => t < 0.48);
  chainT.push(0.5);
  for (let i = 0; i < chainT.length - 1; i++) {
    const pt = (t) => {
      const q = neckAt(ns, t);
      const r = ((q.dc + q.dt) / 2) * R;
      const c = neckBase.clone().addScaledVector(neckDir, t * nl).addScaledVector(crestDir, ((q.dc - q.dt) / 2) * R);
      return { c, r, sx: q.w / ((q.dc + q.dt) / 2) };
    };
    const a = pt(chainT[i]);
    const b = pt(chainT[i + 1]);
    const f = roundCone(a.c.toArray(), b.c.toArray(), a.r, b.r, (a.sx + b.sx) / 2);
    neckChain.push([f, 0.3 * R, a.c.toArray(), [a.r, a.r, a.r]], [() => 1e9, 0, b.c.toArray(), [b.r, b.r, b.r]]);
  }
  const { sdf: torsoSdf, bounds: tb } = buildShapes(S.torso, [R, R, L], [R, R, L], [0, y0, 0], neckChain);
  const pad = R * 0.25;
  const torsoBounds = [[tb[0][0] - pad, tb[0][1] - pad, tb[0][2] - pad], [tb[1][0] + pad, tb[1][1] + pad, tb[1][2] + pad]];
  const lump = (x, y, z) => {
    const a = noise3(x * 12 + 3, y * 12, z * 12);
    const b = noise3(x * 30, y * 30 + 7, z * 30);
    return (a * a - 0.3) * R * 0.3 + (b * b - 0.3) * R * 0.1;
  };
  const shag = (x, y, z, nx, ny) => (noise3(x * 30, y * 6, z * 30) - 0.4) * R * 0.08 * Math.min(1, 1.2 - ny);
  const shapeKey = [speciesId, L, R, y0, nl, na, m.headR, m.headLen, m.snout, fluff, wool, shaggy, gfx.quality].join('|');
  const torsoGeo = cachedGeo(`torso|${shapeKey}`, () => sdfMesh(torsoSdf, torsoBounds, L / (high ? 50 : 26), {
    uv: wool ? boxUv(torsoSdf, 0.5) : cylUv(y0, -0.6 * L, 0.62 * L),
    displace: wool ? (x, y, z) => lump(x, y, z) + R * 0.06 : shaggy ? shag : null,
  }));
  const torsoMesh = add(body, torsoGeo, wool ? woolMat : M.body);
  if (!wool) addShells(torsoMesh, furLen * (shaggy ? 2.5 : 1));
  const backTop = (z) => rayHit(torsoSdf, [0, y0, z], [0, 1, 0], R * 3).y;

  // Collerette des races à poil long (chiens, chats).
  if (fluff > 1.15 && (speciesId === 'dog' || speciesId === 'cat')) {
    const g = new THREE.IcosahedronGeometry(R * 0.8, high ? 4 : 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const f = 1 + (noise3(x * 30, y * 30, z * 30) - 0.5) * 0.35;
      p.setXYZ(i, x * f, y * f, z * f);
    }
    g.computeVertexNormals();
    const ruffMat = ['bicolor', 'tricolor', 'tan'].includes(pattern) && speciesId === 'dog' ? mat(look.secondary, { roughness: 0.9 }) : mat(look.coat, { roughness: 0.9 });
    const rm = add(body, g, ruffMat, [0, y0 + R * 0.05, L / 2 - R * 0.3], null, [1.05, 1, 0.85]);
    addShells(rm, furLen * 1.5);
  }

  // --- Pattes
  const legX = R * S.legX;
  const legTop = y0 - R * 0.3;
  const T = legTop;
  const corners = speciesId === 'rabbit'
    ? [[legX * 0.8, L * 0.25, true], [-legX * 0.8, L * 0.25, true], [legX, -L * 0.18, false], [-legX, -L * 0.18, false]]
    : [[legX, L / 2 - R * 0.75, true], [-legX, L / 2 - R * 0.75, true], [legX, -L / 2 + R * 0.75, false], [-legX, -L / 2 + R * 0.75, false]];
  corners.forEach(([x, z, front], i) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, legTop, z);
    body.add(pivot);
    buildLeg(pivot, { kind: S.legs, front, T, r: legR, R, mat: M.legs[i], M, high, wool, woolMat, speciesId, furLen });
    parts.legs.push({ pivot, front, side: x > 0 ? 1 : -1 });
  });

  // Mamelle des vaches (dessinée petite, pour toutes).
  if (opt('udder')) {
    const udderMat = mat(lum(look.coat) > 0.25 || lum(look.secondary) > 0.5 ? 0xe0ada2 : 0x5a4741, { roughness: 0.55 });
    const uz = -L * 0.36;
    const uy = y0 - R * 0.95;
    add(body, sphere(R * 0.2, 16, 12), udderMat, [0, uy, uz], null, [1.1, 0.8, 1.2]);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        add(body, new THREE.CylinderGeometry(R * 0.025, R * 0.03, R * 0.12, 8), udderMat, [sx * R * 0.08, uy - R * 0.17, uz + sz * R * 0.08]);
      }
    }
  }

  // --- Cou (partie mobile, au-dessus de la base fondue dans le tronc)
  const neck = new THREE.Group();
  neck.position.copy(neckBase);
  neck.rotation.x = na;
  body.add(neck);
  const neckSecs = [];
  for (let t = 0.3; t <= ns[ns.length - 1][0] + 1e-6; t += 0.1) {
    const q = neckAt(ns, t);
    neckSecs.push({ p: [0, t * nl, q.zo * R], rx: q.w * R, ry: q.dc * R, ryb: q.dt * R });
  }
  const neckGeo = loft(neckSecs, {
    radial: high ? 24 : 14, sub: high ? 3 : 2, capStart: false,
    displace: wool ? (x, y, z) => (lump(x, y + 1, z) + R * 0.05) * Math.max(0, 1 - y / (nl * 1.05)) : null,
  });
  const neckMesh = add(neck, neckGeo, wool ? woolMat : M.neck);
  if (!wool) addShells(neckMesh, furLen);

  // Crinière du cheval : des mèches qui partent du haut de l'encolure et retombent sur le côté.
  if (speciesId === 'horse') {
    const down = new THREE.Vector3(0, -Math.cos(na), Math.sin(na));
    const side = new THREE.Vector3(1, 0, 0);
    const maneLen = 0.16 + (fluff - 1) * 1.3;
    const list = [];
    const rng = mulberry(look.seed + 5);
    const n = high ? 36 : 18;
    const t0 = -0.02;
    const t1 = ns[ns.length - 1][0] - 0.02;
    for (let i = 0; i < n; i++) {
      const t = t0 + (i / (n - 1)) * (t1 - t0);
      const q = neckAt(ns, t);
      const c = new THREE.Vector3(0, t * nl, q.zo * R - q.dc * R * 0.96);
      const len = maneLen * (0.75 + rng() * 0.5) * (t > 0.95 ? 0.6 : 1) * (t < 0.1 ? 0.7 : 1);
      const lean = 0.3 + rng() * 0.4;
      const pts = [];
      for (let k = 0; k <= 5; k++) {
        const f = k / 5;
        pts.push(c.clone()
          .add(new THREE.Vector3(0, 0, -(0.02 * Math.sin(f * Math.PI) + 0.012)))
          .addScaledVector(side, (0.02 + lean * len * 0.35) * Math.sin(f * Math.PI * 0.5) + 0.008)
          .addScaledVector(down, len * f * f * 0.9));
      }
      list.push({ pts, w0: 0.07, w1: 0.05, side: new THREE.Vector3(0, 1, 0), u0: rng() * 0.5, u1: 0.5 + rng() * 0.5 });
    }
    // Brosse de crins dressés le long de l'encolure (épaisseur de la crinière).
    for (let i = 0; i < n / 2; i++) {
      const t = 0.05 + (i / (n / 2 - 1)) * (t1 - 0.1);
      const q = neckAt(ns, t);
      const c = new THREE.Vector3(0, t * nl, q.zo * R - q.dc * R * 0.95);
      list.push({ pts: [c, c.clone().add(new THREE.Vector3(-0.012, 0.01, -0.045)), c.clone().add(new THREE.Vector3(-0.03, -0.02, -0.065))], w0: 0.08, w1: 0.06, side: new THREE.Vector3(0, 1, 0) });
    }
    add(neck, strands(list), M.mane);
  }

  // --- Tête
  const head = new THREE.Group();
  head.position.set(0, nl, 0);
  head.rotation.x = S.tilt - na;
  neck.add(head);
  const hr = m.headR * (1 + (fluff - 1) * 0.5);
  const ml = S.muzzleLen(m.headLen, hr, m.snout ?? 1);
  const F = Math.max(0.12, ml / hr);
  const { sdf: headSdf, bounds: hb } = buildShapes(S.head(F), [hr, hr, hr], [hr, hr, hr]);
  const hpad = hr * 0.3;
  const headGeo = cachedGeo(`head|${shapeKey}`, () => sdfMesh(headSdf, [[hb[0][0] - hpad, hb[0][1] - hpad, hb[0][2] - hpad], [hb[1][0] + hpad, hb[1][1] + hpad, hb[1][2] + hpad]],
    hr / (high ? 8 : 4.5), { uv: cylUv(0, hb[0][2], hb[1][2]) }));
  const headMesh = add(head, headGeo, M.head);
  addShells(headMesh, furLen * fur.head);
  const H = (v) => v.map((x) => x * hr);
  const tip = rayHit(headSdf, H([0, S.nose.y, 0]), [0, 0, 1], hr * 8);
  const snoutTip = tip.toArray();

  // Yeux : globe brillant (iris, pupille), enfoncé dans l'orbite, cerclé de sombre.
  const E = S.eye;
  const eyeR = hr * E.r;
  const eyeMat = new THREE.MeshPhysicalMaterial({
    map: eyeTexture(look.eye, E.pupil), roughness: 0.04, clearcoat: high ? 1 : 0, clearcoatRoughness: 0.03,
  });
  for (const s of [1, -1]) {
    const hit = rayHit(headSdf, H(E.o), [s * E.d[0], E.d[1], E.d[2]], hr * 3);
    const n = sdfNormal(headSdf, hit, hr * 0.02);
    const dir = n.clone().multiplyScalar(1 - E.fwd).add(new THREE.Vector3(0, 0, E.fwd)).normalize();
    const eye = new THREE.Group();
    eye.position.copy(hit).addScaledVector(n, -eyeR * 0.6);
    eye.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    head.add(eye);
    add(eye, sphere(eyeR, 20, 14), eyeMat, null, null, null, false);
    // Paupières : anneau sombre (bord de l'œil) et léger repli de peau au-dessus.
    add(eye, new THREE.TorusGeometry(eyeR * 0.8, eyeR * 0.1, 8, 24), M.rim, [0, 0, eyeR * 0.58], null, [1.1, 0.78, 1], false);
    const lid = new THREE.SphereGeometry(eyeR * 1.05, 18, 6, 0, Math.PI * 2, 0, Math.PI * 0.24);
    add(eye, lid, mat(faceColor, { roughness: 0.8 }), null, [0.2, 0, 0], null, false);
  }

  // Nez, naseaux, mufle.
  if (speciesId === 'horse' || speciesId === 'sheep' || speciesId === 'goat') {
    for (const s of [1, -1]) {
      const o = [0, S.nose.y * hr + hr * 0.08, tip.z - hr * (speciesId === 'horse' ? 0.45 : 0.25)];
      const p = rayHit(headSdf, o, [s, 0.2, 0.7], hr * 2);
      const nn = sdfNormal(headSdf, p, hr * 0.02);
      const nr = hr * (speciesId === 'horse' ? 0.15 : 0.08);
      const g = new THREE.Group();
      g.position.copy(p).addScaledVector(nn, -nr * 0.35);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nn);
      head.add(g);
      add(g, sphere(nr, 12, 8), M.dark, null, [0, 0, s * 0.5], [0.55, 1, 0.5], false);
    }
  } else if (speciesId === 'cow') {
    const muffle = lum(faceColor) > 0.3 ? 0xd9a49a : 0x2e2826;
    add(head, sphere(hr * 0.55, 18, 12), mat(muffle, { roughness: 0.3 }), [0, tip.y + hr * 0.02, tip.z - hr * 0.28], null, [1.2, 0.75, 0.55], false);
    for (const s of [1, -1]) add(head, sphere(hr * 0.1, 8, 6), M.dark, [s * hr * 0.3, tip.y + hr * 0.08, tip.z - hr * 0.02], null, [1, 0.6, 0.5], false);
  } else {
    const dog = speciesId === 'dog';
    const nr = hr * (dog ? 0.21 : 0.1);
    const noseMat = dog ? M.dark : M.pink;
    add(head, sphere(nr, 14, 10), noseMat, [0, tip.y + nr * 0.25, tip.z - nr * 0.35], null, [1.25, 0.85, 0.8], false);
    if (speciesId === 'cat' || speciesId === 'rabbit') {
      const whiskers = [];
      for (const s of [1, -1]) {
        for (let k = 0; k < 3; k++) {
          const o = new THREE.Vector3(s * hr * 0.3, tip.y - hr * 0.12 - k * hr * 0.06, tip.z - hr * 0.2);
          whiskers.push(o, o.clone().add(new THREE.Vector3(s * hr * 1.4, -hr * 0.15 + k * hr * 0.12, -hr * 0.3)));
        }
      }
      const wg = new THREE.BufferGeometry().setFromPoints(whiskers);
      head.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0xf2efe8, transparent: true, opacity: 0.6 })));
    }
  }

  // Toupet du cheval, frange des Highland.
  if (speciesId === 'horse' || shaggy) {
    const list = [];
    const rng = mulberry(look.seed + 9);
    const top = rayHit(headSdf, H([0, 0.2, -0.45]), [0, 1, 0.25], hr * 3).addScaledVector(new THREE.Vector3(0, 1, 0), -hr * 0.05);
    const n = shaggy ? 14 : 9;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1) - 0.5) * hr * (shaggy ? 1.4 : 0.7);
      const len = hr * (shaggy ? 2.2 : 1.8) * (0.8 + rng() * 0.4);
      const o = top.clone().add(new THREE.Vector3(x, 0, 0));
      const pts = [o, o.clone().add(new THREE.Vector3(x * 0.2, hr * 0.12, len * 0.35)), o.clone().add(new THREE.Vector3(x * 0.4, hr * 0.02, len * 0.75)), o.clone().add(new THREE.Vector3(x * 0.5, -hr * 0.12, len))];
      list.push({ pts, w0: hr * 0.35, w1: hr * 0.25, side: new THREE.Vector3(1, 0, 0), u0: rng() * 0.5, u1: 0.5 + rng() * 0.5 });
    }
    add(head, strands(list), shaggy ? new THREE.MeshStandardMaterial({ color: look.coat, map: hairTexture(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.7 }) : M.mane);
  }

  // Laine sur le haut de la tête (moutons).
  if (wool) {
    const p = rayHit(headSdf, H([0, 0.1, -0.35]), [0, 1, 0.1], hr * 3);
    const g = new THREE.IcosahedronGeometry(hr * 0.75, high ? 3 : 2);
    const pp = g.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const f = 1 + (noise3(pp.getX(i) * 60, pp.getY(i) * 60, pp.getZ(i) * 60) - 0.5) * 0.3;
      pp.setXYZ(i, pp.getX(i) * f, pp.getY(i) * f, pp.getZ(i) * f);
    }
    g.computeVertexNormals();
    add(head, g, woolMat, [p.x, p.y - hr * 0.1, p.z - hr * 0.1], null, [1.1, 0.7, 1.15]);
  }

  // Barbiche des chèvres.
  if (opt('beard')) {
    const chin = rayHit(headSdf, H([0, -0.3, 0.3 + F * 0.6]), [0, -1, 0], hr * 2);
    const g = new THREE.Group();
    g.position.copy(chin);
    g.rotation.x = -S.tilt;
    head.add(g);
    const list = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI;
      const len = hr * (1.2 + (i % 3) * 0.25);
      const sx = Math.cos(a) * hr * 0.12;
      list.push({ pts: [new THREE.Vector3(sx, hr * 0.05, 0), new THREE.Vector3(sx * 0.8, -len * 0.5, -hr * 0.05), new THREE.Vector3(sx * 0.3, -len, -hr * 0.12)], w0: hr * 0.3, w1: hr * 0.1, side: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)) });
    }
    const beardColor = pattern === 'points' || pattern === 'tan' ? look.secondary : look.coat;
    add(g, strands(list), new THREE.MeshStandardMaterial({ color: beardColor, map: hairTexture(), alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.7 }), null, null, null, false);
  }

  // Cornes.
  if (horns) {
    const attach = (s) => rayHit(headSdf, H([0, 0.2, S.ear.o[2] + 0.3]), [s * 0.6, 1, 0.1], hr * 3).add(new THREE.Vector3(-s * hr * 0.05, -hr * 0.05, 0));
    buildHorns(head, horns, attach, hr, S, high);
  }

  // --- Oreilles
  parts.ears = [];
  for (const s of [1, -1]) {
    const ear = new THREE.Group();
    head.add(ear);
    const p = rayHit(headSdf, H(S.ear.o), [s * S.ear.d[0], S.ear.d[1], S.ear.d[2]], hr * 3);
    ear.position.copy(p).addScaledVector(sdfNormal(headSdf, p, hr * 0.02), -hr * 0.06);
    buildEar(ear, m.earType, s, hr, S, M, speciesId, high);
    parts.ears.push(ear);
  }

  // --- Queue
  const tail = new THREE.Group();
  const [tz, ty] = S.tail;
  const tailRoot = rayHit(torsoSdf, [0, y0 + R * ty, -L * 0.2], [0, 0, -1], L);
  tail.position.set(0, tailRoot.y, tailRoot.z + R * 0.06);
  void tz;
  body.add(tail);
  buildTail(tail, m.tailType, { R, L, legLen, y0, ty, fluff, M, look, high, wool, woolMat, furLen, pattern, speciesId });

  Object.assign(parts, {
    neck, head, tail, snoutTip,
    headHeight: neckBase.y + nl * Math.cos(na),
    saddleY: backTop(-L * 0.05),
  });
  return parts;
}

/** Tache d'ombre douce (dégradé radial), partagée. */
let _contact = null;
function contactShadowTexture() {
  if (_contact) return _contact;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.4)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  _contact = new THREE.CanvasTexture(c);
  _contact.userData.shared = true;
  return _contact;
}

// ------------------------------------------------------------------ pattes

// [z/T, y/T, largeur/r, profondeur/r]
const LEG_PATHS = {
  hoofFront: [[0, 0.16, 1.15, 2.0], [0, 0, 1.25, 2.05], [0, -0.18, 1.3, 1.65], [0.015, -0.38, 1.0, 1.15], [0.02, -0.5, 0.9, 0.98], [0.015, -0.56, 0.66, 0.74],
    [0.01, -0.78, 0.6, 0.7], [0.015, -0.87, 0.76, 0.85], [0.04, -0.925, 0.6, 0.64], [0.055, -0.945, 0.64, 0.68]],
  hoofHind: [[0, 0.18, 1.3, 2.6], [0, 0, 1.45, 2.7], [0.05, -0.2, 1.5, 2.2], [0, -0.38, 1.15, 1.5], [-0.08, -0.52, 0.85, 1.25], [-0.1, -0.6, 0.66, 1.0],
    [-0.09, -0.78, 0.6, 0.7], [-0.08, -0.87, 0.76, 0.85], [-0.05, -0.925, 0.6, 0.64], [-0.035, -0.945, 0.64, 0.68]],
  pawFront: [[0, 0.16, 1.15, 1.7], [0, 0, 1.25, 1.75], [0, -0.2, 1.2, 1.45], [0.01, -0.45, 0.95, 1.05], [0, -0.72, 0.8, 0.85], [0.02, -0.84, 0.85, 0.9], [0.06, -0.9, 0.85, 0.9]],
  pawHind: [[0, 0.18, 1.3, 2.3], [0, 0, 1.45, 2.4], [0.07, -0.22, 1.5, 2.0], [-0.02, -0.42, 1.1, 1.4], [-0.12, -0.6, 0.8, 1.0], [-0.1, -0.8, 0.75, 0.8], [-0.06, -0.9, 0.8, 0.85]],
};

function buildLeg(pivot, o) {
  const { kind, front, T, r, R, M, high } = o;
  if (kind === 'rabbit') {
    if (front) {
      const g = loft([[0, 0.3, 1.6, 1.8], [0, 0, 1.4, 1.6], [0.02, -0.6, 1.0, 1.1], [0.05, -0.85, 1.0, 1.1], [0.08, -0.9, 0.8, 0.8]]
        .map(([z, y, w, d]) => ({ p: [0, y * T, z * T], rx: w * r, ry: d * r })), { radial: high ? 12 : 8, sub: 3, side: [1, 0, 0] });
      add(pivot, g, o.mat);
      add(pivot, sphere(r * 1.1), o.mat, [0, -T + r * 0.75, 0.12 * T], null, [1, 0.7, 1.5]);
    } else {
      // Grosse cuisse et long pied posé à plat.
      const haunch = loft([[-0.55, 0.1, 0.2, 0.2], [-0.4, 0.05, 0.55, 0.6], [0, -0.05, 0.62, 0.75], [0.35, -0.1, 0.5, 0.6], [0.5, -0.15, 0.2, 0.2]]
        .map(([z, y, w, d]) => ({ p: [0, y * R, z * R], rx: w * R * 0.75, ry: d * R })), { radial: high ? 16 : 10, sub: 3 });
      add(pivot, haunch, o.mat, [0, -T * 0.15, 0]);
      const fr = r * 1.3;
      const foot = loft([[-0.25, 0.5, 0.9], [0, 1, 1], [0.5, 1, 1], [0.7, 0.8, 0.8], [0.78, 0.3, 0.3]]
        .map(([z, w, h]) => ({ p: [0, -T + fr * h, z * R], rx: fr * w, ry: fr * h * 0.9 })), { radial: high ? 12 : 8, sub: 3 });
      add(pivot, foot, o.mat);
    }
    return;
  }
  const path = kind === 'hoof' || kind === 'cloven'
    ? (front ? LEG_PATHS.hoofFront : LEG_PATHS.hoofHind)
    : (front ? LEG_PATHS.pawFront : LEG_PATHS.pawHind);
  // Les moutons ont des pattes fines, les vaches des canons plus épais.
  const thin = o.wool ? 0.85 : o.speciesId === 'cow' ? 1.12 : 1;
  const g = loft(path.map(([z, y, w, d], i) => {
    const k = i < 3 ? 1 : thin;
    return { p: [0, y * T, z * T], rx: w * r * k, ry: d * r * k };
  }), { radial: high ? 14 : 9, sub: high ? 4 : 2 });
  const legMesh = add(pivot, g, o.mat);
  addShells(legMesh, o.furLen * 0.6);
  const end = path[path.length - 1];
  const ez = end[0] * T;
  const ey = end[1] * T;
  if (o.wool) {
    // Laine qui couvre le haut des pattes.
    const wg = loft([[0, 0.15, 2.6], [0, 0, 2.8], [0, -0.22, 2.4], [0.0, -0.3, 1.2]].map(([z, y, w]) => ({ p: [0, y * T, z * T], rx: w * r * 1.2, ry: w * r * 1.4 })), { radial: 12, sub: 3 });
    add(pivot, wg, o.woolMat);
  }
  if (kind === 'hoof') {
    const h = T + ey;
    const hoof = new THREE.CylinderGeometry(r * 0.62, r * 0.95, h + r * 0.1, high ? 16 : 10);
    add(pivot, hoof, M.hoof, [0, -T + (h + r * 0.1) / 2, ez + r * 0.06], [0.12, 0, 0], [1, 1, 1.12]);
  } else if (kind === 'cloven') {
    const h = T + ey;
    for (const s of [1, -1]) {
      const half = new THREE.CylinderGeometry(r * 0.5, r * 0.78, h + r * 0.1, 10, 1, false, 0, Math.PI);
      add(pivot, half, M.hoof, [s * r * 0.08, -T + (h + r * 0.1) / 2, ez + r * 0.1], [0.15, s > 0 ? 0 : Math.PI, 0], [1, 1, 1.25]);
    }
  } else {
    // Patte : coussinet arrondi et doigts.
    const pr = r * 1.25;
    const pz = ez + (front ? 0.04 : 0.06) * T;
    add(pivot, sphere(pr, 14, 10), o.mat, [0, -T + pr * 0.62, pz], null, [1.05, 0.68, 1.35]);
    for (const k of [-1, 0, 1]) {
      add(pivot, sphere(pr * 0.42, 10, 8), o.mat, [k * pr * 0.42, -T + pr * 0.32, pz + pr * 0.95 - Math.abs(k) * pr * 0.12], null, [1, 0.8, 1.1], false);
    }
  }
}

// ------------------------------------------------------------------ oreilles

function earLoft(len, w, profile, curve = null, depth = 0.32, high = true) {
  const n = profile.length;
  return loft(profile.map((pw, i) => {
    const t = i / (n - 1);
    const c = curve ? curve(t) : [0, 0];
    return { p: [0, t * len + c[0], c[1]], rx: Math.max(0.0008, pw * w), ry: Math.max(0.0006, pw * w * depth) };
  }), { radial: high ? 12 : 8, sub: 3 });
}

function buildEar(ear, type, s, hr, S, M, speciesId, high) {
  const tilt = S.tilt;
  const outer = M.ear;
  const inner = M.innerEar;
  const upright = (len, w, prof, rotX, rotZ, cup = 0.7, curve = null) => {
    const g = earLoft(len, w, prof, curve, 0.32, high);
    add(ear, g, outer);
    const gi = earLoft(len * 0.82, w * cup, prof, curve, 0.12, high);
    add(ear, gi, inner, [0, len * 0.06, w * 0.18], null, null, false);
    ear.rotation.set(rotX, 0, rotZ);
  };
  switch (type) {
    case 'horse':
      upright(hr * S.ear.len, hr * S.ear.w, [0.75, 1, 0.95, 0.7, 0.35, 0.02], -tilt + 0.2, -s * 0.18);
      break;
    case 'pointed':
    case 'bat':
    case 'cat': {
      const big = type === 'bat' ? 1.3 : 1;
      const w = hr * (type === 'cat' ? 0.5 : 0.45) * big;
      upright(hr * (type === 'cat' ? 0.85 : 1.0) * big, w, [1, 0.95, 0.75, 0.45, 0.02], -tilt - 0.05, -s * (type === 'cat' ? 0.3 : 0.22));
      break;
    }
    case 'semi':
      upright(hr * 0.85, hr * 0.42, [1, 0.95, 0.7, 0.4, 0.05], -tilt - 0.1, -s * 0.3, 0.6, (t) => [-(t ** 2) * hr * 0.25, (t ** 2.5) * hr * 0.55]);
      break;
    case 'rabbit':
    case 'lop': {
      const lop = type === 'lop';
      upright(hr * S.ear.len, hr * S.ear.w, [0.55, 0.9, 1, 0.95, 0.8, 0.5, 0.05], lop ? 0 : -0.25, lop ? -s * 2.3 : -s * 0.12, 0.62);
      break;
    }
    case 'sheep':
      upright(hr * 0.95, hr * 0.36, [0.5, 1, 0.9, 0.6, 0.05], -tilt * 0.3, -s * (Math.PI / 2 + 0.25), 0.6);
      break;
    case 'goat':
      upright(hr * 1.45, hr * 0.42, [0.5, 1, 0.95, 0.65, 0.3, 0.02], -tilt * 0.4 + 0.2, -s * (Math.PI / 2 - 0.35), 0.6);
      break;
    case 'cow':
      upright(hr * 1.0, hr * 0.5, [0.45, 0.95, 1, 0.85, 0.45, 0.05], -tilt * 0.5 + 0.2, -s * (Math.PI / 2 + 0.1), 0.65);
      break;
    default: { // tombantes (floppy) : un rabat qui pend sur le côté de la tête
      const len = hr * 1.05;
      const g = loft([0.55, 0.95, 1, 0.9, 0.6, 0.15].map((pw, i, arr) => {
        const t = i / (arr.length - 1);
        return { p: [s * hr * 0.06 * Math.sin(t * Math.PI), -t * len, -hr * 0.05 * t], rx: hr * 0.07 * (1 - t * 0.5), ry: pw * hr * 0.5 };
      }), { radial: high ? 12 : 8, sub: 3 });
      add(ear, g, outer);
      ear.rotation.set(-tilt + 0.1, 0, s * 0.22);
    }
  }
}

// ------------------------------------------------------------------ cornes

function buildHorns(head, kind, attach, hr, S, high) {
  const [base, tip] = HORN_COLORS[kind] ?? HORN_COLORS.cow;
  const cb = new THREE.Color(base);
  const ct = new THREE.Color(tip);
  const hornMat = mat(0xffffff, { vertexColors: true, roughness: 0.45 });
  for (const s of [1, -1]) {
    const g = new THREE.Group();
    g.position.copy(attach(s));
    g.rotation.x = -S.tilt; // repère « monde » : y vers le haut, z vers l'avant
    head.add(g);
    const secs = [];
    const N = 12;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      let pt;
      let r;
      if (kind === 'goat') {
        const ang = t * 1.5;
        const Rr = hr * 1.5;
        pt = [s * t * hr * 0.25, Math.sin(ang) * Rr, -(1 - Math.cos(ang)) * Rr];
        r = hr * (0.2 - 0.17 * t);
      } else if (kind === 'ram') {
        const ang = t * Math.PI * 2.1;
        const Rr = hr * 0.9 * (1 - 0.4 * t);
        pt = [s * (hr * 0.1 + t * hr * 0.75), Math.cos(ang) * Rr - hr * 0.9, -Math.sin(ang) * Rr];
        r = hr * (0.3 - 0.22 * t);
      } else if (kind === 'long') {
        const Lh = hr * 4.2;
        pt = [s * t * Lh, (-0.08 * t + 0.6 * t ** 3) * Lh, 0.18 * t * t * Lh];
        r = hr * (0.24 - 0.2 * t);
      } else {
        const Lh = hr * 1.1;
        pt = [s * t * Lh * 0.9, t * t * Lh * 0.75, t * t * Lh * 0.18];
        r = hr * (0.2 - 0.16 * t);
      }
      secs.push({ p: pt, rx: r, ry: r });
    }
    const geo = loft(secs, {
      radial: high ? 12 : 8, sub: 2, side: [0, 0, 1],
      color: (u, v) => {
        const ridge = kind === 'ram' || kind === 'goat' ? 0.88 + 0.12 * Math.sin(v * 70) : 1;
        const c = cb.clone().lerp(ct, Math.min(1, v * 1.1));
        return [c.r * ridge, c.g * ridge, c.b * ridge];
      },
      displace: kind === 'ram' || kind === 'goat' ? (x, y, z, u, v) => Math.sin(v * 70) * hr * 0.012 : null,
    });
    add(g, geo, hornMat);
  }
}

// ------------------------------------------------------------------ queues

function buildTail(tail, type, o) {
  const { R, L, M, high, fluff } = o;
  const tube = (pts, r0, r1, material, shells = true) => {
    const n = pts.length;
    const g = loft(pts.map((p, i) => {
      const t = i / (n - 1);
      const r = r0 + (r1 - r0) * t;
      return { p, rx: r, ry: r };
    }), { radial: high ? 12 : 8, sub: 3 });
    const mm = add(tail, g, material);
    if (shells) addShells(mm, o.furLen * 1.2);
    return g;
  };
  switch (type) {
    case 'horse': {
      const dock = [[0, 0, 0], [0, -0.04, -0.07], [0, -0.14, -0.11], [0, -0.26, -0.12]];
      tube(dock, R * 0.17, R * 0.1, M.tail);
      const rng = mulberry((o.look.seed ?? 1) + 77);
      const list = [];
      const len = (o.y0 + R * o.ty) * 0.72 * (0.85 + (fluff - 1) * 1.2);
      const n = high ? 22 : 12;
      for (let i = 0; i < n; i++) {
        const az = (i / n) * Math.PI * 2;
        const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az) * 0.6 - 0.4);
        const t0 = 0.15 + rng() * 0.8;
        const o0 = new THREE.Vector3(0, -0.04 - t0 * 0.22, -0.07 - t0 * 0.05);
        const l = len * (0.75 + rng() * 0.3);
        const pts = [];
        for (let k = 0; k <= 6; k++) {
          const f = k / 6;
          pts.push(o0.clone().addScaledVector(dir, 0.03 + Math.sin(f * Math.PI * 0.6) * 0.06 * (0.6 + rng() * 0.4) + f * 0.04)
            .add(new THREE.Vector3(0, -l * f, -0.05 * Math.sin(f * Math.PI))));
        }
        const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
        list.push({ pts, w0: 0.06, w1: 0.09, side, u0: rng() * 0.4, u1: 0.6 + rng() * 0.4 });
      }
      add(tail, strands(list), M.mane);
      break;
    }
    case 'cat': {
      const l = L * 0.95;
      tube([[0, 0, 0], [0, -0.05 * l, -0.12 * l], [0, -0.25 * l, -0.22 * l], [0, -0.5 * l, -0.22 * l], [0, -0.68 * l, -0.32 * l], [0, -0.74 * l, -0.48 * l], [0, -0.7 * l, -0.58 * l]],
        R * 0.2 * fluff, R * 0.14 * fluff, M.tail);
      break;
    }
    case 'curl': {
      const r = R;
      tube([[0, 0, 0], [0, 0.18 * r, -0.12 * r], [0, 0.45 * r, -0.1 * r], [0, 0.62 * r, 0.1 * r], [0, 0.55 * r, 0.32 * r], [0.05 * r, 0.38 * r, 0.42 * r]],
        R * 0.2 * fluff, R * 0.12 * fluff, M.tail);
      break;
    }
    case 'stub':
      if (o.wool) add(tail, sphere(R * 0.2, 12, 10), o.woolMat, [0, -R * 0.08, -R * 0.06], null, [1, 1.3, 0.9]);
      else tube([[0, 0, 0], [0, -0.02, -R * 0.12], [0, -R * 0.08, -R * 0.2]], R * 0.14, R * 0.1, M.tail);
      break;
    case 'pompom': {
      const g = new THREE.IcosahedronGeometry(R * 0.36 * fluff, high ? 3 : 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const f = 1 + (noise3(p.getX(i) * 90, p.getY(i) * 90, p.getZ(i) * 90) - 0.5) * 0.3;
        p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f);
      }
      g.computeVertexNormals();
      const mm = add(tail, g, mat(0xf2eee8, { roughness: 0.95 }), [0, R * 0.05, -R * 0.1]);
      addShells(mm, o.furLen * 1.5);
      break;
    }
    case 'goat':
      tail.rotation.x = -0.5;
      tube([[0, 0, 0], [0, R * 0.25, -R * 0.08], [0, R * 0.45, -R * 0.02], [0, R * 0.5, 0]], R * 0.14, R * 0.03, M.tail);
      break;
    case 'cow': {
      const drop = o.legLen * 0.95 + R * 0.4;
      tube([[0, 0, 0], [0, 0.02, -R * 0.12], [0, -R * 0.3, -R * 0.22], [0, -drop * 0.55, -R * 0.24], [0, -drop * 0.85, -R * 0.2]], R * 0.08, R * 0.04, M.tail, false);
      const list = [];
      const rng = mulberry((o.look.seed ?? 1) + 3);
      for (let i = 0; i < 8; i++) {
        const az = (i / 8) * Math.PI * 2;
        const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
        const o0 = new THREE.Vector3(0, -drop * 0.8, -R * 0.2);
        const l = R * (0.45 + rng() * 0.2);
        list.push({ pts: [o0, o0.clone().addScaledVector(dir, R * 0.05).add(new THREE.Vector3(0, -l * 0.5, 0)), o0.clone().addScaledVector(dir, R * 0.03).add(new THREE.Vector3(0, -l, 0))], w0: R * 0.12, w1: R * 0.16, side: new THREE.Vector3(-dir.z, 0, dir.x) });
      }
      add(tail, strands(list), M.mane);
      break;
    }
    default: { // chien
      const l = L * 0.55;
      tube([[0, 0, 0], [0, 0.06 * l, -0.12 * l], [0, 0.05 * l, -0.35 * l], [0, -0.08 * l, -0.6 * l], [0, -0.25 * l, -0.78 * l], [0, -0.38 * l, -0.86 * l]],
        R * 0.17 * fluff, R * 0.08 * fluff, M.tail);
    }
  }
}

/** Libère la mémoire graphique d'un modèle retiré de la scène. */
export function disposeModel(object) {
  const done = new Set();
  object.traverse((o) => {
    if (!o.isMesh && !o.isLineSegments) return;
    if (!done.has(o.geometry) && !o.geometry.userData.shared) {
      o.geometry.dispose();
      done.add(o.geometry);
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mm of mats) {
      if (done.has(mm)) continue;
      done.add(mm);
      for (const key of ['map', 'bumpMap', 'normalMap']) {
        const t = mm[key];
        if (t && !t.userData?.shared && !done.has(t)) {
          t.dispose();
          done.add(t);
        }
      }
      mm.dispose?.();
    }
  });
}
