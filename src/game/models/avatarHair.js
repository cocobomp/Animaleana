// Cheveux des personnages, sculptés en champ de distance (SDF) comme la tête : une vraie masse
// qui épouse la forme du crâne (épaisseur plus forte sur le dessus), une ligne d'implantation
// (front, tempes, au-dessus des oreilles, nuque), des mèches (frange, pointes dans la nuque),
// des sillons de mèches qui partent de l'épi, et des reflets doux peints dans les couleurs des
// sommets (racines plus sombres, dessous dans l'ombre, « anneau » de lumière sur le dessus).
//
// Les formes sont partagées par coiffure (et par qualité, avec ou sans chapeau) : chaque
// personnage n'a que sa propre couleur. Repère : celui de la tête (avant +Z, haut +Y), avant
// l'échelle de la tête.
//
// Coiffures : short (courts), long (longs), ponytail (queue de cheval), curly (bouclés),
// bald (rasés : tondus très court), bun (chignon), braid (tresse).

import * as THREE from 'three';
import { ellipsoid, roundCone, smin, sdfMesh } from './sdf.js';

export const HAIR_STYLES = ['short', 'long', 'ponytail', 'curly', 'bald', 'bun', 'braid'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const smax = (a, b, k) => -smin(-a, -b, k);
const TAU = Math.PI * 2;

// Crâne de la tête (doit rester cohérent avec HEAD_SHAPES dans avatarModel.js).
const SKULL_C = [0, 0.075, -0.005];

// Chapeau : calotte (sphère tronquée) penchée un peu vers l'arrière.
const HAT = { c: [0, 0.09, -0.005], r: 0.15, tilt: -0.15, open: 0.45 };
const HAT_SCALE = { short: 1.06, long: 1.06, ponytail: 1.03, curly: 1.26, bald: 0.98, bun: 1.03, braid: 1.03 };

/** Échelle du chapeau pour qu'il couvre le volume de la coiffure. */
export const hatScale = (style) => HAT_SCALE[style] ?? 1.05;

/** Ligne d'implantation : table [azimut |α|, hauteur] (α = 0 devant, π derrière), interpolée en douceur. */
function hairline(table) {
  return (a) => {
    if (a <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i++) {
      if (a <= table[i][0]) {
        const [a0, y0] = table[i - 1];
        const [a1, y1] = table[i];
        const t = (a - a0) / (a1 - a0);
        return y0 + (y1 - y0) * t * t * (3 - 2 * t);
      }
    }
    return table[table.length - 1][1];
  };
}

/** Pointes de mèches : creux ronds, pointes fines (n pointes sur un tour). */
const tips = (a, n) => 1 - Math.abs(Math.sin(a * n * 0.5));

// ------------------------------------------------------------------ réglages des coiffures

/**
 * line : implantation ; jag : pointes { n, amp, from (azimut à partir duquel elles apparaissent), to } ;
 * t0(y) : épaisseur ; tMin : épaisseur au bord ; whorl : épi (centre des sillons) ;
 * grooves : nombre de sillons sur un tour ; groove : profondeur.
 */
const STYLE = {
  short: {
    line: [[0, 0.15], [0.45, 0.142], [0.85, 0.118], [1.08, 0.075], [1.22, 0.052], [1.34, 0.056], [1.46, 0.093], [1.82, 0.088], [2.1, 0.03], [2.6, -0.015], [Math.PI, -0.03]],
    jag: { n: 15, amp: 0.012, from: 1.95, to: 4 },
    t0: (y) => 0.011 + 0.018 * sstep(0.04, 0.19, y),
    tMin: 0.004,
    whorl: [0.03, 0.2, -0.06],
    grooves: 15,
    groove: 0.0028,
  },
  long: {
    line: [[0, 0.121], [0.6, 0.123], [0.82, 0.116], [1.0, 0.075], [1.25, 0.04], [1.6, 0.02], [2.2, -0.02], [Math.PI, -0.04]],
    jag: { n: 26, amp: 0.008, from: 0, to: 0.72 },
    t0: (y) => 0.012 + 0.014 * sstep(0.04, 0.19, y),
    tMin: 0.005,
    whorl: [0, 0.205, -0.04],
    grooves: 20,
    groove: 0.0024,
  },
  ponytail: {
    line: [[0, 0.152], [0.5, 0.146], [0.85, 0.126], [1.08, 0.078], [1.3, 0.07], [1.46, 0.096], [1.82, 0.088], [2.2, 0.015], [Math.PI, -0.02]],
    jag: null,
    t0: (y) => 0.0085 + 0.006 * sstep(0.08, 0.2, y),
    tMin: 0.003,
    tie: true,
    grooves: 22,
    groove: 0.0017,
  },
  curly: {
    line: [[0, 0.152], [0.5, 0.144], [0.85, 0.12], [1.1, 0.065], [1.35, 0.06], [1.5, 0.072], [1.85, 0.06], [2.3, 0.0], [Math.PI, -0.025]],
    jag: null,
    t0: (y) => 0.028 + 0.02 * sstep(0.0, 0.2, y),
    tMin: 0.008,
    curls: true,
  },
  bald: {
    line: [[0, 0.155], [0.45, 0.146], [0.85, 0.122], [1.1, 0.085], [1.3, 0.072], [1.46, 0.088], [1.82, 0.084], [2.1, 0.03], [2.6, -0.012], [Math.PI, -0.025]],
    jag: null,
    t0: () => 0.0034,
    tMin: 0.0028,
  },
  bun: {
    line: [[0, 0.152], [0.5, 0.146], [0.85, 0.126], [1.08, 0.078], [1.3, 0.07], [1.46, 0.096], [1.82, 0.088], [2.2, 0.02], [Math.PI, -0.015]],
    jag: null,
    t0: (y) => 0.0085 + 0.006 * sstep(0.08, 0.2, y),
    tMin: 0.003,
    tie: true,
    grooves: 22,
    groove: 0.0017,
  },
  braid: {
    line: [[0, 0.152], [0.5, 0.146], [0.85, 0.125], [1.08, 0.078], [1.3, 0.07], [1.46, 0.096], [1.82, 0.088], [2.2, 0.015], [Math.PI, -0.03]],
    jag: null,
    t0: (y) => 0.009 + 0.006 * sstep(0.08, 0.2, y),
    tMin: 0.003,
    tie: true,
    grooves: 22,
    groove: 0.0017,
  },
};

/** Point d'attache (élastique) de la queue de cheval, du chignon ou de la tresse. */
function tiePoint(style, hat) {
  if (style === 'bun') return hat ? [0, 0.06, -0.142] : [0, 0.19, -0.105];
  if (style === 'braid') return [0, 0.02, -0.128];
  return hat ? [0, 0.07, -0.14] : [0, 0.142, -0.128];
}

/** Profondeur z de la peau devant la tête, à (x, y) (recherche sur la SDF de la tête). */
function skinZ(head, x, y) {
  let a = -0.05;
  let b = 0.25;
  for (let i = 0; i < 30; i++) {
    const m = (a + b) / 2;
    if (head(x, y, m) < 0) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

/** Mèche courbe : chaîne de cônes arrondis (points [x, y, z], rayons). */
function lock(points, radii, sx = 1) {
  const parts = [];
  for (let i = 0; i < points.length - 1; i++) parts.push(roundCone(points[i], points[i + 1], radii[i], radii[i + 1], sx));
  return (x, y, z) => {
    let d = parts[0](x, y, z);
    for (let i = 1; i < parts.length; i++) d = smin(d, parts[i](x, y, z), 0.008);
    return d;
  };
}

/** Repère orthonormé (u, v) perpendiculaire à l'axe a (pour mesurer un angle autour de a). */
function basisAround(a) {
  const up = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = [a[1] * up[2] - a[2] * up[1], a[2] * up[0] - a[0] * up[2], a[0] * up[1] - a[1] * up[0]];
  const ul = Math.hypot(...u);
  u[0] /= ul;
  u[1] /= ul;
  u[2] /= ul;
  const v = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
  return { u, v };
}

// ------------------------------------------------------------------ champs de distance

/**
 * SDF de la masse principale d'une coiffure (calotte + frange + pièces propres au style).
 * Renvoie aussi groove(x, y, z) → -1..1 (sillon), utilisé pour les reflets.
 */
function hairField(style, head, hat) {
  const S = STYLE[style] ?? STYLE.short;
  const line = hairline(S.line);
  const jag = S.jag;
  const tie = S.tie ? tiePoint(style, hat) : null;

  // Sillons : autour de l'épi (vertical), ou convergeant vers l'élastique (queue, chignon, tresse).
  let groove = () => 0;
  if (S.grooves && S.whorl) {
    const [wx, , wz] = S.whorl;
    const n = S.grooves;
    groove = (x, y, z) => {
      const r = Math.hypot(x - wx, z - wz);
      const th = Math.atan2(x - wx, z - wz);
      return Math.sin(th * n + 0.7 * Math.sin(th * 3)) * sstep(0.012, 0.06, r);
    };
  } else if (S.grooves && tie) {
    const ax = [tie[0] - SKULL_C[0], tie[1] - SKULL_C[1], tie[2] - SKULL_C[2]];
    const al = Math.hypot(...ax);
    const a = [ax[0] / al, ax[1] / al, ax[2] / al];
    const { u, v } = basisAround(a);
    const n = S.grooves;
    groove = (x, y, z) => {
      const qx = x - SKULL_C[0];
      const qy = y - SKULL_C[1];
      const qz = z - SKULL_C[2];
      const along = qx * a[0] + qy * a[1] + qz * a[2];
      const pu = qx * u[0] + qy * u[1] + qz * u[2];
      const pv = qx * v[0] + qy * v[1] + qz * v[2];
      const rad = Math.hypot(pu, pv);
      // S'efface près de l'élastique (les sillons s'y rejoignent).
      const fade = sstep(0.015, 0.06, rad) * sstep(-0.2, 0.0, along + 0.1);
      return Math.sin(Math.atan2(pv, pu) * n) * fade;
    };
  }
  const gAmp = S.groove ?? 0;

  // Bord : ligne d'implantation + pointes.
  const edge = (x, y, z) => {
    const a = Math.abs(Math.atan2(x, z));
    let l = line(a);
    if (jag && a >= jag.from && a <= jag.to) {
      const fadeIn = jag.from > 0 ? sstep(jag.from, jag.from + 0.25, a) : 1;
      const fadeOut = jag.to < Math.PI ? sstep(jag.to, jag.to - 0.15, a) : 1;
      l -= jag.amp * tips(Math.atan2(x, z) + 0.13, jag.n) * fadeIn * fadeOut;
    }
    return l;
  };

  // Calotte : la peau gonflée d'une épaisseur qui s'amincit vers le bord.
  const cap = (x, y, z, h) => {
    const l = edge(x, y, z);
    const t = S.tMin + (S.t0(y) - S.tMin) * sstep(-0.004, 0.035, y - l);
    const d = h - t + gAmp * groove(x, y, z);
    return smax(d, l - y, 0.006);
  };

  const extra = [];
  // Frange balayée sur le côté (courts).
  if (style === 'short') {
    const P = (x, y, off) => [x, y, skinZ(head, x, y) + off];
    extra.push(lock([[0.06, 0.2, 0.03], P(0.04, 0.168, 0.02), P(-0.028, 0.133, 0.009)], [0.022, 0.017, 0.0075]));
    extra.push(lock([[0.08, 0.195, 0.02], P(0.075, 0.16, 0.018), P(0.024, 0.13, 0.008)], [0.02, 0.016, 0.007]));
    extra.push(lock([[0.02, 0.205, 0.03], P(-0.008, 0.172, 0.018), P(-0.074, 0.136, 0.008)], [0.02, 0.016, 0.007]));
  }
  // Mèche sur le front et petites mèches aux tempes (queue de cheval, chignon, tresse).
  if (style === 'ponytail' || style === 'bun' || style === 'braid') {
    const P = (x, y, off) => [x, y, skinZ(head, x, y) + off];
    extra.push(lock([[0.07, 0.2, 0.03], P(0.05, 0.172, 0.014), P(-0.02, 0.142, 0.009)], [0.02, 0.017, 0.009]));
    for (const s of [1, -1]) extra.push(lock([P(s * 0.098, 0.128, 0.005), P(s * 0.104, 0.095, 0.006), P(s * 0.1, 0.066, 0.005)], [0.0065, 0.0055, 0.003]));
  }
  // Longs : rideau dans le dos et longues mèches de chaque côté du visage.
  let curtain = null;
  if (style === 'long') {
    const back = lock([[0, 0.06, -0.075], [0, -0.06, -0.112], [0, -0.17, -0.125], [0, -0.265, -0.122]], [0.07, 0.052, 0.036, 0.024], 2.05);
    const sides = [1, -1].map((s) => lock([[s * 0.108, 0.1, 0.03], [s * 0.118, -0.03, 0.036], [s * 0.112, -0.15, 0.012]], [0.028, 0.025, 0.012], 0.62));
    curtain = (x, y, z) => {
      let d = back(x, y, z);
      d = smin(d, sides[0](x, y, z), 0.02);
      d = smin(d, sides[1](x, y, z), 0.02);
      // Pas de rideau devant les oreilles ; pointes en bas.
      d = smax(d, z - 0.06, 0.01);
      const bottom = -0.29 + 0.022 * tips(x * 55, 1) + 0.03 * sstep(0.04, 0.13, Math.abs(x));
      d = smax(d, bottom - y, 0.006);
      // Sillons verticaux.
      return d + 0.0022 * Math.sin(x * 120 + Math.sin(y * 18) * 0.8) * sstep(0.08, -0.02, y);
    };
  }
  // Bouclés : des boucles (boules) posées sur la surface, fondues entre elles.
  let curls = null;
  if (S.curls) {
    const blobs = [];
    const N = 120;
    const rnd = (i) => {
      const s = Math.sin(i * 91.7 + 13.1) * 43758.5453;
      return s - Math.floor(s);
    };
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N;
      const r = Math.sqrt(1 - y * y);
      const phi = i * 2.399963;
      const dir = [Math.cos(phi) * r, y, Math.sin(phi) * r];
      // On part du centre du crâne vers l'extérieur jusqu'à la surface de la calotte.
      let t = 0.1;
      for (let k = 0; k < 40; k++) {
        const p = [SKULL_C[0] + dir[0] * t, SKULL_C[1] + dir[1] * t, SKULL_C[2] + dir[2] * t];
        if (head(...p) - S.t0(p[1]) > 0) break;
        t += 0.004;
      }
      const p = [SKULL_C[0] + dir[0] * (t - 0.006), SKULL_C[1] + dir[1] * (t - 0.006), SKULL_C[2] + dir[2] * (t - 0.006)];
      if (edge(...p) - p[1] > -0.014) continue; // hors de la zone des cheveux
      blobs.push([...p, 0.021 + rnd(i) * 0.01]);
    }
    curls = (x, y, z, base) => {
      if (base > 0.05 || base < -0.05) return base;
      let d = 1;
      for (const [bx, by, bz, br] of blobs) {
        // Rejet rapide : seules les boucles voisines comptent.
        const dx = x - bx;
        if (dx > 0.06 || dx < -0.06) continue;
        const dy = y - by;
        if (dy > 0.06 || dy < -0.06) continue;
        const q = Math.hypot(dx, dy, z - bz) - br;
        if (q < d) d = q;
      }
      return smin(base, d, 0.016) + 0.0024 * Math.sin(x * 150) * Math.sin(y * 150 + 1.3) * Math.sin(z * 150 + 2.1);
    };
  }
  // Chignon : une grosse boule enroulée sur l'élastique.
  let bun = null;
  if (style === 'bun') {
    const c = [tie[0], tie[1] + (hat ? -0.005 : 0.014), tie[2] - (hat ? 0.026 : 0.014)];
    const e = ellipsoid(c, [0.062, 0.054, 0.056]);
    bun = (x, y, z) => {
      const th = Math.atan2(y - c[1], x - c[0]);
      const r = Math.hypot(x - c[0], y - c[1]);
      return e(x, y, z) + 0.003 * Math.sin(th * 3 + r * 140);
    };
  }

  // Sous le chapeau : on retire tout ce qui dépasserait au-dessus du bord de la calotte.
  let hatCut = null;
  if (hat) {
    const hs = hatScale(style);
    const n = [0, Math.cos(HAT.tilt), Math.sin(HAT.tilt)];
    const h0 = HAT.r * hs * Math.cos(HAT.open * Math.PI) - 0.006;
    hatCut = (x, y, z) => n[1] * (y - HAT.c[1]) + n[2] * (z - HAT.c[2]) - h0;
  }

  // Bande utile : loin de la peau (au-delà de l'épaisseur maximale) ou au fond de la tête, inutile
  // de tout calculer (le maillage ne garde que la surface). Les pièces qui s'éloignent de la tête
  // (rideau des longs, chignon) ont leur boîte.
  const reach = S.curls ? 0.085 : 0.05;
  let box = null;
  if (curtain) box = [-0.21, 0.21, -0.34, 0.12, -0.25, 0.08];
  else if (bun) box = [-0.09, 0.09, tie[1] - 0.08, tie[1] + 0.11, tie[2] - 0.12, tie[2] + 0.05];
  const inBox = (x, y, z) => box && x > box[0] && x < box[1] && y > box[2] && y < box[3] && z > box[4] && z < box[5];

  const field = (x, y, z) => {
    const h = head(x, y, z);
    // Au fond de la tête : on coupe la masse à 3 cm sous la peau (valeur continue, pour que le
    // maillage reste propre ; ces triangles cachés sont ensuite retirés).
    if (h < -0.045) return -h - 0.03;
    if (h > reach && !inBox(x, y, z)) return h - reach + 0.01;
    let d = cap(x, y, z, h);
    for (const f of extra) d = smin(d, f(x, y, z), 0.01);
    if (curtain) d = smin(d, curtain(x, y, z), 0.025);
    if (bun) d = smin(d, bun(x, y, z), 0.012);
    if (curls) d = curls(x, y, z, d);
    if (hatCut) d = smax(d, hatCut(x, y, z), 0.004);
    d = Math.max(d, -h - 0.03);
    return d;
  };
  const grooveAll = curtain
    ? (x, y, z) => (y < -0.02 && z < -0.03 ? Math.sin(x * 120) : groove(x, y, z))
    : groove;
  return { field, groove: grooveAll, tie };
}

/** Queue de cheval ou tresse, dans le repère de son pivot (l'élastique), pour qu'elle se balance. */
function tailField(style) {
  if (style === 'braid') {
    // Tresse : des « grains » en biais, un coup dans un sens, un coup dans l'autre (chevrons),
    // qui descendent dans le dos en s'affinant.
    const lobes = [];
    for (let i = 0; i < 9; i++) {
      const s = i % 2 ? 1 : -1;
      const y = -0.03 - i * 0.026;
      const r = 0.0185 - i * 0.001;
      const z = -0.014 - i * 0.0015;
      lobes.push(roundCone([-s * 0.017, y + 0.011, z], [s * 0.017, y - 0.011, z], r, r * 0.88));
    }
    const tuft = lock([[0, -0.255, -0.026], [0, -0.3, -0.02]], [0.012, 0.004]);
    return (x, y, z) => {
      let d = lobes[0](x, y, z);
      for (let i = 1; i < lobes.length; i++) d = smin(d, lobes[i](x, y, z), 0.006);
      d = smin(d, tuft(x, y, z), 0.008);
      return d;
    };
  }
  const tail = lock([[0, 0, 0.004], [0, -0.012, -0.045], [0, -0.075, -0.074], [0, -0.165, -0.078], [0, -0.25, -0.058], [0, -0.305, -0.044]], [0.028, 0.042, 0.045, 0.039, 0.026, 0.007]);
  return (x, y, z) => tail(x, y, z) + 0.0018 * Math.sin(Math.atan2(x, z + 0.07) * 14 + y * 10);
}

// ------------------------------------------------------------------ maillage

/** Retire les triangles cachés dans la tête, les petits morceaux isolés, puis les sommets inutilisés. */
function trimInside(geo, inside, minPart = 40) {
  const pos = geo.attributes.position.array;
  const nrm = geo.attributes.normal.array;
  const idx = geo.index.array;
  const n = pos.length / 3;
  const hidden = new Uint8Array(n);
  for (let v = 0; v < n; v++) hidden[v] = inside(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) ? 1 : 0;
  let keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    if (hidden[idx[t]] && hidden[idx[t + 1]] && hidden[idx[t + 2]]) continue;
    keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  // Petits morceaux isolés (au bord des sourcils, d'une pointe…) : on les enlève.
  const parent = new Int32Array(n);
  for (let v = 0; v < n; v++) parent[v] = v;
  const find = (v) => {
    while (parent[v] !== v) {
      parent[v] = parent[parent[v]];
      v = parent[v];
    }
    return v;
  };
  for (let t = 0; t < keep.length; t += 3) {
    const r0 = find(keep[t]);
    const r1 = find(keep[t + 1]);
    const r2 = find(keep[t + 2]);
    parent[r1] = r0;
    parent[find(r2)] = r0;
  }
  const size = new Int32Array(n);
  for (let t = 0; t < keep.length; t += 3) size[find(keep[t])]++;
  keep = keep.filter((v, i) => size[find(keep[i - (i % 3)])] >= minPart);
  const remap = new Int32Array(n).fill(-1);
  const p2 = [];
  const n2 = [];
  for (let i = 0; i < keep.length; i++) {
    const v = keep[i];
    if (remap[v] < 0) {
      remap[v] = p2.length / 3;
      p2.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
      n2.push(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]);
    }
    keep[i] = remap[v];
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(n2, 3));
  out.setIndex(keep);
  out.computeBoundingSphere();
  geo.dispose();
  return out;
}

/**
 * Dans le cou ou le haut du buste (repère de la tête, échelle comprise) : les cheveux qui y
 * passent (rideau des longs) sont cachés, on ne garde pas ces triangles.
 */
function insideBody(x, y, z) {
  if (y < -0.012 && y > -0.14 && x * x + (z + 0.002) * (z + 0.002) < 0.046 * 0.046) return true;
  if (y < -0.075) {
    const ex = x / 0.185;
    const ez = (z + 0.004) / 0.086;
    return ex * ex + ez * ez < 1;
  }
  return false;
}

/** Valeur « de mèche » 0..1 par sommet, gardée pour les reflets (sillon, hauteur). */
function strandData(geo, groove) {
  const pos = geo.attributes.position.array;
  const n = pos.length / 3;
  const g = new Float32Array(n);
  for (let v = 0; v < n; v++) g[v] = groove(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
  geo.userData.groove = g;
}

const cache = new Map();

/**
 * Formes partagées d'une coiffure : { main, tail?, tie? } (BufferGeometry sans couleur).
 * main : la masse sur la tête ; tail : queue de cheval / tresse (repère du pivot) ; tie : position de
 * l'élastique. high : qualité haute (cases plus fines).
 */
export function hairGeometry(style, hat, high, head) {
  const key = `${style}|${hat ? 1 : 0}|${high ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const cell = high ? 0.0112 : 0.0158;
  const { field, groove, tie } = hairField(style, head, hat);
  const lowY = style === 'long' ? -0.33 : style === 'braid' || style === 'ponytail' ? -0.1 : -0.08;
  const wide = style === 'curly' ? 0.235 : 0.2;
  const bounds = [[-wide, lowY, -0.25], [wide, style === 'curly' ? 0.33 : style === 'bun' ? 0.3 : 0.29, 0.21]];
  let main = sdfMesh(field, bounds, cell);
  main = trimInside(main, (x, y, z) => head(x, y, z) < -0.0025 || insideBody(x, y, z));
  strandData(main, groove);
  main.userData.shared = true;

  const out = { main, tail: null, tie };
  if (style === 'ponytail' || style === 'braid') {
    const f = tailField(style);
    let tail = sdfMesh(f, [[-0.07, -0.33, -0.14], [0.07, 0.05, 0.05]], cell * 0.85);
    tail = trimInside(tail, () => false);
    strandData(tail, (x, y, z) => Math.sin(Math.atan2(x, z + 0.07) * 14 + y * 10));
    tail.userData.shared = true;
    out.tail = tail;
  }
  cache.set(key, out);
  return out;
}

/**
 * Couleurs des sommets pour une couleur de cheveux : racines et dessous plus sombres, mèches
 * légèrement contrastées, reflet doux sur le dessus. Renvoie une géométrie propre au personnage
 * qui partage positions, normales et indices avec la forme commune.
 */
export function tintHair(shared, hairHex, { buzz = false, center = SKULL_C } = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', shared.attributes.position);
  geo.setAttribute('normal', shared.attributes.normal);
  geo.setIndex(shared.index);
  geo.boundingSphere = shared.boundingSphere;
  const base = new THREE.Color(hairHex);
  const lum = 0.2126 * base.r + 0.7152 * base.g + 0.0722 * base.b;
  // Le reflet : discret sur les cheveux sombres, plus doré sur les clairs.
  const sheen = new THREE.Color(1, 0.96, 0.9).multiplyScalar(0.035 + lum * 0.35);
  const pos = shared.attributes.position.array;
  const nrm = shared.attributes.normal.array;
  const groove = shared.userData.groove;
  const n = pos.length / 3;
  const col = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    const nx = nrm[v * 3];
    const ny = nrm[v * 3 + 1];
    const nz = nrm[v * 3 + 2];
    const qx = x - center[0];
    const qy = y - center[1];
    const qz = z - center[2];
    const ql = Math.hypot(qx, qy, qz) || 1;
    // Face tournée vers l'extérieur (1) ou vers la tête (creux, dessous des mèches : plus sombre).
    const facing = (nx * qx + ny * qy + nz * qz) / ql;
    const ao = 0.62 + 0.38 * sstep(-0.35, 0.7, facing);
    const under = 1 - 0.2 * Math.max(0, -ny);
    const g = groove ? groove[v] : 0;
    let k = ao * under * (1 + 0.07 * g);
    if (buzz) {
      // Tondus : petit grain irrégulier.
      const h = Math.sin(x * 1712.3 + y * 931.7 + z * 517.1) * 43758.5453;
      k *= 0.86 + 0.14 * (h - Math.floor(h));
    }
    // Anneau de lumière sur le dessus, cassé par les mèches.
    const band = buzz ? 0 : Math.exp(-(((ny - 0.58) / 0.16) ** 2)) * (0.65 + 0.35 * g) * sstep(-0.2, 0.3, nz + 0.2);
    col[v * 3] = base.r * k + sheen.r * band;
    col[v * 3 + 1] = base.g * k + sheen.g * band;
    col[v * 3 + 2] = base.b * k + sheen.b * band;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Calotte et visière du chapeau (formes de buildAvatar), à l'échelle de la coiffure. */
export const HAT_SHAPE = HAT;
export { TAU };
