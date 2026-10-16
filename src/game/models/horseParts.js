// Pièces propres au cheval : pattes articulées (genou, jarret, boulet, sabot), crinière en
// nappes superposées, toupet, queue fournie avec son couard, fanons des chevaux de trait.
// Les crins ondulent doucement grâce à un petit shader (vent + allure de l'animal).
// Repères : l'animal regarde vers +Z ; les pattes pendent sous un pivot (y vers le bas).

import * as THREE from 'three';
import { loft, strands } from './shapes.js';
import { maneTexture } from '../textures.js';
import { gfx } from '../gfx.js';

function mesh(parent, geo, material, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/**
 * Matière des crins : mèches semi-transparentes qui ondulent. sway = { value } partagé par le
 * modèle (l'entité le monte quand le cheval court) ; le vent de la scène s'y ajoute.
 */
export function hairMaterial(color, sway, roughness = 0.55) {
  // Les crins très sombres sont légèrement éclaircis : on distingue encore les mèches.
  const c = new THREE.Color(color);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (l < 0.08) c.lerp(new THREE.Color(0x6a6260), 0.22);
  const m = new THREE.MeshStandardMaterial({
    color: c, map: maneTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.hairTime = gfx.time;
    sh.uniforms.hairWind = gfx.wind;
    sh.uniforms.hairSway = sway;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float hairTime;
uniform float hairWind;
uniform float hairSway;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  // uv.y = 1 à la racine, 0 à la pointe : seules les pointes bougent.
  float hw = 1.0 - uv.y;
  hw = hw * hw * (0.35 + hairWind * 0.4 + hairSway);
  float ph = hairTime * 2.3 + position.y * 7.0 + position.z * 4.0 + position.x * 3.0;
  transformed.x += sin(ph) * 0.016 * hw;
  transformed.z += cos(ph * 0.7 + 1.3) * 0.011 * hw;
  transformed.y += sin(ph * 1.3 + 0.6) * 0.006 * hw;
}`);
  };
  m.customProgramCacheKey = () => 'horsehair';
  return m;
}

// ------------------------------------------------------------------ pattes

// Chemins : [z/T, y/T, largeur/r, profondeur avant/r, profondeur arrière/r (facultatif)].
// T = hauteur du pivot au sol, r = rayon de référence de la patte.
// Antérieur : avant-bras, genou (articulation), canon, boulet, paturon incliné, couronne.
const FRONT_UP = [[0, 0.2, 1.4, 2.3], [0, 0, 1.45, 2.1], [0.01, -0.2, 1.2, 1.55], [0.015, -0.36, 0.95, 1.15], [0.02, -0.46, 0.8, 0.96]];
const FRONT_LOW = [[0.02, -0.5, 0.78, 0.96], [0.02, -0.57, 0.68, 0.88], [0.02, -0.68, 0.6, 0.8], [0.02, -0.8, 0.58, 0.76],
  [0.025, -0.86, 0.74, 0.86], [0.05, -0.91, 0.6, 0.64], [0.075, -0.935, 0.66, 0.68]];
// Postérieur : cuisse, grasset (en avant), jambe, jarret (pointe vers l'arrière), canon vertical.
const HIND_UP = [[0, 0.2, 1.55, 3.0], [0.03, 0, 1.65, 2.8], [0.08, -0.2, 1.45, 2.1], [0.05, -0.36, 1.1, 1.5], [-0.04, -0.5, 0.86, 1.15], [-0.08, -0.56, 0.78, 1.0]];
const HIND_LOW = [[-0.085, -0.6, 0.76, 0.9, 1.35], [-0.09, -0.67, 0.66, 0.84, 0.98], [-0.085, -0.76, 0.6, 0.8], [-0.08, -0.85, 0.58, 0.76],
  [-0.075, -0.885, 0.74, 0.86], [-0.05, -0.92, 0.6, 0.64], [-0.025, -0.935, 0.66, 0.68]];

/** Coordonnée de texture v (0 = haut de la patte, 1 = sol) recalculée sur toute la patte. */
function legUv(geo, T, offsetY) {
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setY(i, Math.min(1, Math.max(0, (0.2 - (p.getY(i) + offsetY) / T) / 1.2)));
}

/**
 * Patte de cheval en deux segments : le haut pend du pivot (épaule / hanche), le bas d'un
 * second pivot « knee » (genou ou jarret) que l'animation replie. Renvoie le pivot du genou.
 */
export function buildHorseLeg(pivot, o) {
  const { front, T, r, high, legMat, hoofMat, hairMat, feathers } = o;
  const up = front ? FRONT_UP : HIND_UP;
  const low = front ? FRONT_LOW : HIND_LOW;
  const [jz, jy] = low[0];
  const sec = (p, oz = 0, oy = 0) => ({ p: [0, (p[1] - oy) * T, (p[0] - oz) * T], rx: p[2] * r, ry: p[3] * r, ryb: (p[4] ?? p[3]) * r });
  const radial = high ? 10 : 8;
  const sub = high ? 2 : 1;
  const upGeo = loft(up.map((p) => sec(p)), { radial, sub, round: [0, 1] });
  legUv(upGeo, T, 0);
  mesh(pivot, upGeo, legMat);

  const knee = new THREE.Group();
  knee.position.set(0, jy * T, jz * T);
  pivot.add(knee);
  const lowGeo = loft(low.map((p) => sec(p, jz, jy)), { radial, sub, round: [1, 0] });
  legUv(lowGeo, T, jy * T);
  mesh(knee, lowGeo, legMat);

  // Sabot : plus large et plus long vers la pince (avant), talons plus étroits, bord évasé.
  const last = low[low.length - 1];
  const zc = (last[0] - jz) * T;
  const yc = (last[1] - jy) * T;
  const bottom = (-1 - jy) * T;
  const hoof = loft([
    { p: [0, yc + r * 0.1, zc], rx: r * 0.66, ry: r * 0.7, ryb: r * 0.62 },
    { p: [0, yc, zc + r * 0.02], rx: r * 0.72, ry: r * 0.82, ryb: r * 0.66 },
    { p: [0, (yc + bottom) / 2, zc + r * 0.1], rx: r * 0.82, ry: r * 1.02, ryb: r * 0.74 },
    { p: [0, bottom + r * 0.04, zc + r * 0.17], rx: r * 0.88, ry: r * 1.14, ryb: r * 0.78 },
    { p: [0, bottom, zc + r * 0.17], rx: r * 0.88, ry: r * 1.14, ryb: r * 0.78 },
  ], { radial: high ? 12 : 9, sub: 1, exp: 2.6, capStart: false });
  mesh(knee, hoof, hoofMat);

  // Fanons (Frison, traits) : longs poils qui retombent du boulet sur le sabot.
  if (feathers) {
    const list = [];
    const fy = (low[4][1] - jy) * T; // boulet
    const fz = (low[4][0] - jz) * T;
    const n = high ? 10 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const o0 = new THREE.Vector3(0, fy + r * 0.6, fz).addScaledVector(dir, r * 0.55);
      const len = (fy - bottom) * (0.95 + (i % 3) * 0.12);
      const pts = [];
      for (let k = 0; k <= 3; k++) {
        const f = k / 3;
        pts.push(o0.clone().addScaledVector(dir, r * (0.25 * f + 0.45 * f * f)).add(new THREE.Vector3(0, -len * f, 0)));
      }
      list.push({ pts, w0: r * 0.9, w1: r * 1.1, side: new THREE.Vector3(-dir.z, 0, dir.x), u0: (i % 2) * 0.5, u1: (i % 2) * 0.5 + 0.5 });
    }
    mesh(knee, strands(list), hairMat, false);
  }
  return knee;
}

// ------------------------------------------------------------------ crinière

/**
 * Crinière en nappes : plusieurs couches de mèches larges qui se recouvrent, retombant d'un
 * côté de l'encolure (choisi d'après la graine), plus une brosse de crins sur le dessus.
 * o : { ns, nl, R, na, neckAt, rng, high, fluff, hairMat, side }.
 */
export function buildHorseMane(neck, o) {
  const { ns, nl, R, na, neckAt, rng, high, fluff, hairMat } = o;
  const s = o.side;
  const down = new THREE.Vector3(0, -Math.cos(na), Math.sin(na));
  const maneLen = nl * (0.5 + (fluff - 1) * 2.2);
  const list = [];
  const crest = (t) => {
    const q = neckAt(ns, t);
    return { c: new THREE.Vector3(0, t * nl, q.zo * R - q.dc * R * 0.97), w: q.w * R };
  };
  const t0 = -0.08;
  const t1 = ns[ns.length - 1][0] - 0.02;
  const layer = (n, lenMul, leanMul, w0, w1, dx, sideSign) => {
    for (let i = 0; i < n; i++) {
      const t = t0 + ((i + rng() * 0.6) / n) * (t1 - t0);
      const { c, w } = crest(t);
      const len = maneLen * lenMul * (0.7 + rng() * 0.6) * (t > 1 ? 0.6 : 1) * (t < 0.05 ? 0.7 : 1);
      const lean = leanMul * (0.85 + rng() * 0.3);
      const wave = rng() * 6;
      const pts = [];
      const K = 6;
      for (let k = 0; k <= K; k++) {
        const f = k / K;
        const lat = sideSign * (dx + w * Math.min(1, f * 2.4) * lean + Math.sin(f * 3.5 + wave) * 0.014 * f);
        pts.push(c.clone().add(new THREE.Vector3(lat, 0, -0.008 * Math.sin(f * Math.PI) + 0.004))
          .addScaledVector(down, len * (f * 0.12 + f * f * 0.88)));
      }
      list.push({ pts, w0, w1, side: new THREE.Vector3(0, 1, 0), u0: rng() * 0.5, u1: 0.5 + rng() * 0.5 });
    }
  };
  const n = high ? 26 : 14;
  layer(n, 1, 1.12, 0.13, 0.08, 0.014, s); // nappe extérieure, longue
  layer(Math.round(n * 0.7), 0.8, 0.98, 0.14, 0.09, 0.005, s); // nappe intérieure, plus courte
  layer(Math.round(n * 0.4), 0.35, 0.95, 0.12, 0.07, 0.006, -s); // quelques mèches de l'autre côté
  // Brosse de crins sur la ligne du dessus (épaisseur de la crinière).
  const nb = high ? 16 : 9;
  for (let i = 0; i < nb; i++) {
    const t = 0.02 + (i / (nb - 1)) * (t1 - 0.06);
    const { c } = crest(t);
    const h = 0.03 + maneLen * 0.08;
    list.push({
      pts: [c.clone(), c.clone().add(new THREE.Vector3(s * 0.01, 0, -h * 0.8)), c.clone().add(new THREE.Vector3(s * h * 0.9, 0, -h * 1.0)), c.clone().add(new THREE.Vector3(s * h * 1.6, 0, -h * 0.75))],
      w0: 0.11, w1: 0.08, side: new THREE.Vector3(0, 1, 0), u0: rng() * 0.5, u1: 0.5 + rng() * 0.5,
    });
  }
  return mesh(neck, strands(list), hairMat, false);
}

/**
 * Toupet : mèches qui partent d'entre les oreilles et retombent sur le front, le long du
 * chanfrein (repère de la tête : +z vers le museau, +y vers le front).
 */
export function buildHorseForelock(head, o) {
  const { hr, top, rng, high, fluff, hairMat } = o;
  const list = [];
  const n = high ? 9 : 6;
  const dir = new THREE.Vector3(0, -0.22, 1).normalize();
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * hr * 0.55;
    const len = hr * (1.9 + (fluff - 1) * 3.5) * (0.82 + rng() * 0.36);
    const o0 = top.clone().add(new THREE.Vector3(x, 0, 0));
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const f = k / 4;
      pts.push(o0.clone().addScaledVector(dir, len * f).add(new THREE.Vector3(x * f * 1.1, hr * 0.06 * Math.sin(f * Math.PI) - hr * 0.02 * f, 0)));
    }
    list.push({ pts, w0: hr * 0.42, w1: hr * 0.3, side: new THREE.Vector3(1, 0, 0), u0: rng() * 0.5, u1: 0.5 + rng() * 0.5 });
  }
  return mesh(head, strands(list), hairMat, false);
}

// ------------------------------------------------------------------ queue

/**
 * Queue : un couard (court tube charnu) d'où partent de nombreuses mèches qui descendent
 * jusqu'aux jarrets, un peu écartées pour donner du volume.
 * o : { R, drop (hauteur du point d'attache au-dessus du sol), rng, high, fluff, hairMat, tailMat, raised }.
 */
export function buildHorseTail(tail, o) {
  const { R, rng, high, fluff, hairMat, tailMat } = o;
  const raised = o.raised ?? 0;
  const dockPts = [[0, 0, 0], [0, -0.01 + raised * 0.06, -0.09], [0, -0.09 + raised * 0.05, -0.15], [0, -0.2, -0.18], [0, -0.31, -0.18]];
  const dock = loft(dockPts.map((p, i) => ({ p, rx: R * (0.17 - i * 0.02), ry: R * (0.17 - i * 0.02) })), { radial: high ? 10 : 8, sub: 2, round: [0, 1] });
  mesh(tail, dock, tailMat);
  const list = [];
  const len = o.drop * 0.66 * (0.9 + (fluff - 1) * 1.2);
  const n = high ? 34 : 18;
  const at = (t) => {
    // Point du couard à la fraction t (interpolation linéaire des segments).
    const k = Math.min(dockPts.length - 2, Math.floor(t * (dockPts.length - 1)));
    const f = t * (dockPts.length - 1) - k;
    const a = dockPts[k];
    const b = dockPts[k + 1];
    return new THREE.Vector3(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
  };
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + rng() * 0.3;
    const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az) * 0.7 - 0.35).normalize();
    const t0 = 0.08 + rng() * 0.9;
    const o0 = at(t0).addScaledVector(dir, R * 0.13);
    const l = len * (0.72 + rng() * 0.36) * (1 - t0 * 0.25);
    const spread = 0.5 + rng() * 0.8;
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const f = k / 6;
      pts.push(o0.clone().addScaledVector(dir, Math.sin(f * Math.PI * 0.55) * 0.07 * spread + f * 0.05)
        .add(new THREE.Vector3(0, -l * f, -0.03 * Math.sin(f * Math.PI) - raised * 0.12 * f * (1 - f))));
    }
    list.push({ pts, w0: 0.08, w1: 0.13, side: new THREE.Vector3(-dir.z, 0, dir.x).normalize(), u0: rng() * 0.4, u1: 0.6 + rng() * 0.4 });
  }
  return mesh(tail, strands(list), hairMat, false);
}
