// Cheveux des personnages, sculptés en champ de distance (SDF) comme la tête : une vraie masse
// qui épouse la forme du crâne (épaisseur plus forte sur le dessus), une ligne d'implantation
// (front, tempes, au-dessus des oreilles, nuque), des mèches (frange, pointes dans la nuque),
// des sillons de mèches qui partent de l'épi, et des reflets doux peints dans les couleurs des
// sommets (racines plus sombres, dessous dans l'ombre, « anneau » de lumière sur le dessus).
//
// Les formes sont partagées par coiffure (et par qualité, avec ou sans chapeau) : chaque
// personnage n'a que sa propre couleur. Repère : celui de la tête (avant +Z, haut +Y), avant
// l'échelle de la tête. Le maillage d'une coiffure coûte de 60 ms à plus d'une seconde : elles sont
// préparées dans un worker (hairWorker.js) dès le premier personnage, pour qu'un visiteur ou une aide
// qui arrive ne fasse pas d'à-coup ; à défaut, chacune est calculée à sa première apparition.
//
// Coiffures : short (courts), long (longs), ponytail (queue de cheval), curly (bouclés),
// bald (rasés : tondus très court), bun (chignon), braid (tresse).

import * as THREE from 'three';
import { ellipsoid, roundCone, smin, sdfMesh } from './sdf.js';
import { headSdf } from './avatarHead.js';

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

/**
 * Bombe du cavalier (tackModels.helmetModel) posée sur la tête, repère de la tête : { y, z, tilt, scale }.
 * Portée un peu en arrière (la visière s'arrête au-dessus des sourcils) ; un peu plus grande sur une
 * coiffure volumineuse (bouclés), comme les casquettes, et les mèches sont rentrées dessous (variante
 * « chapeau » de la coiffure, voir buildAvatar look.helmet).
 */
export function helmetFit(style) {
  const fit = 1 + Math.max(0, hatScale(style) / hatScale('short') - 1) * 0.65;
  return { y: 0.112 + (fit - 1) * 0.05, z: -0.012 - (fit - 1) * 0.03, tilt: -0.24, scale: 1.36 * fit };
}

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

/**
 * Pointes de mèches : creux ronds, pointes arrondies (n pointes sur un tour). Des pointes trop
 * fines (plus petites qu'une case du maillage) sortaient en dents irrégulières.
 */
const tips = (a, n) => {
  const q = Math.sin(a * n * 0.5);
  return (1.02 - Math.sqrt(q * q + 0.0404)) / 0.819;
};

/**
 * Intersection arrondie de deux champs de distance (congé de rayon r, d'Inigo Quilez) : un bord
 * de cheveux bien rond, que le maillage suit sans dents.
 */
function roundMax(a, b, r) {
  const ua = Math.max(r + a, 0);
  const ub = Math.max(r + b, 0);
  return Math.min(-r, Math.max(a, b)) + Math.sqrt(ua * ua + ub * ub);
}

// ------------------------------------------------------------------ réglages des coiffures

/**
 * line : implantation ; jag : pointes { n, amp, from (azimut à partir duquel elles apparaissent), to } ;
 * t0(y) : épaisseur ; tMin : épaisseur au bord (au moins 0,6 case du maillage, voir hairField) ;
 * whorl : épi (centre des sillons) ; grooves : nombre de sillons sur un tour ; groove : profondeur.
 * Les sillons restent larges (au moins 4 cases par sillon derrière la tête) : plus serrés, le
 * maillage ne pouvait pas les suivre et dessinait un quadrillage.
 */
const STYLE = {
  short: {
    line: [[0, 0.15], [0.45, 0.142], [0.85, 0.118], [1.08, 0.075], [1.22, 0.052], [1.34, 0.056], [1.46, 0.093], [1.82, 0.088], [2.1, 0.03], [2.6, -0.015], [Math.PI, -0.03]],
    jag: { n: 15, amp: 0.012, from: 1.95, to: 4 },
    t0: (y) => 0.011 + 0.018 * sstep(0.04, 0.19, y),
    tMin: 0.004,
    whorl: [0.03, 0.2, -0.06],
    grooves: 9,
    groove: 0.003,
  },
  // Longs : raie au milieu, front dégagé (deux mèches partent de la raie et encadrent le visage, voir
  // hairField). Avant, une frange droite faisait tout le tour à hauteur des sourcils : un casque.
  long: {
    line: [[0, 0.15], [0.35, 0.146], [0.7, 0.13], [0.95, 0.104], [1.15, 0.07], [1.35, 0.042], [1.6, 0.02], [2.2, -0.02], [Math.PI, -0.04]],
    jag: null,
    t0: (y) => 0.01 + 0.012 * sstep(0.04, 0.19, y),
    tMin: 0.005,
    part: true,
    whorl: [0, 0.205, -0.04],
    grooves: 12,
    groove: 0.002,
  },
  ponytail: {
    line: [[0, 0.152], [0.5, 0.146], [0.85, 0.126], [1.08, 0.078], [1.3, 0.07], [1.46, 0.096], [1.82, 0.088], [2.2, 0.015], [Math.PI, -0.02]],
    jag: null,
    t0: (y) => 0.0085 + 0.006 * sstep(0.08, 0.2, y),
    tMin: 0.003,
    tie: true,
    grooves: 10,
    groove: 0.0022,
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
    t0: () => 0.0042,
    tMin: 0.0034,
  },
  bun: {
    line: [[0, 0.152], [0.5, 0.146], [0.85, 0.126], [1.08, 0.078], [1.3, 0.07], [1.46, 0.096], [1.82, 0.088], [2.2, 0.02], [Math.PI, -0.015]],
    jag: null,
    t0: (y) => 0.0085 + 0.006 * sstep(0.08, 0.2, y),
    tMin: 0.003,
    tie: true,
    grooves: 10,
    groove: 0.0022,
  },
  braid: {
    line: [[0, 0.152], [0.5, 0.146], [0.85, 0.125], [1.08, 0.078], [1.3, 0.07], [1.46, 0.096], [1.82, 0.088], [2.2, 0.015], [Math.PI, -0.03]],
    jag: null,
    t0: (y) => 0.009 + 0.006 * sstep(0.08, 0.2, y),
    tMin: 0.003,
    tie: true,
    grooves: 10,
    groove: 0.0022,
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

// Cou, haut du buste et épaules dans le repère de la tête (échelle de la tête comprise), d'après
// les formes de buildAvatar : [hauteur, demi-largeur, demi-profondeur] du buste.
const CHEST = [[-0.055, 0.05, 0.048], [-0.073, 0.077, 0.059], [-0.105, 0.155, 0.077], [-0.145, 0.195, 0.091], [-0.21, 0.175, 0.098]];

/** Distance (approchée) au cou, au haut du buste et aux épaules. */
function bodyField(x, y, z) {
  // Cou : cylindre vertical.
  const neck = Math.max(Math.hypot(x, z + 0.002) - 0.046, -0.16 - y, y + 0.01);
  // Buste : section elliptique qui s'élargit vers les épaules.
  let a = CHEST[CHEST.length - 1][1];
  let b = CHEST[CHEST.length - 1][2];
  if (y > CHEST[0][0]) {
    a = CHEST[0][1];
    b = CHEST[0][2];
  } else {
    for (let i = 1; i < CHEST.length; i++) {
      if (y >= CHEST[i][0]) {
        const [y0, a0, b0] = CHEST[i - 1];
        const [y1, a1, b1] = CHEST[i];
        const t = (y - y0) / (y1 - y0);
        a = a0 + (a1 - a0) * t;
        b = b0 + (b1 - b0) * t;
        break;
      }
    }
  }
  const ex = x / a;
  const ez = (z + 0.004) / b;
  const chest = Math.max((Math.sqrt(ex * ex + ez * ez) - 1) * Math.min(a, b), y - CHEST[0][0]);
  // Épaules (haut des bras).
  const sh = Math.hypot(Math.abs(x) - 0.168, y + 0.165, z) - 0.056;
  return Math.min(neck, smin(chest, sh, 0.03));
}

/**
 * SDF de la masse principale d'une coiffure (calotte + frange + pièces propres au style).
 * Renvoie aussi groove(x, y, z) → -1..1 (sillon), utilisé pour les reflets.
 * cell : taille de case du maillage (les bords et les sillons s'y adaptent).
 */
function hairField(style, head, hat, cell = 0.0158) {
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
      return Math.sin(th * n + 0.7 * Math.sin(th * 3)) * sstep(0.03, 0.1, r);
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
  const edgeAt = (x, z) => {
    const a = Math.abs(Math.atan2(x, z));
    let l = line(a);
    if (jag && a >= jag.from && a <= jag.to) {
      const fadeIn = jag.from > 0 ? sstep(jag.from, jag.from + 0.25, a) : 1;
      const fadeOut = jag.to < Math.PI ? sstep(jag.to, jag.to - 0.15, a) : 1;
      l -= jag.amp * tips(Math.atan2(x, z) + 0.13, jag.n) * fadeIn * fadeOut;
    }
    return l;
  };
  const edge = (x, y, z) => edgeAt(x, z);
  // Distance (approchée) au-dessus de la ligne d'implantation : y - l divisé par la pente de l
  // autour de la tête (tempes comprises), seulement près de la ligne : loin d'elle (dessus de la
  // tête, où l'azimut n'a plus de sens près de l'axe vertical), y - l suffit.
  const A = { l: 0, d: 0 };
  const above = (x, y, z) => {
    const l = edgeAt(x, z);
    const near = 1 - sstep(0.02, 0.045, y - l);
    let n = 1;
    if (near > 0) {
      const e = 0.004;
      const gx = (edgeAt(x + e, z) - edgeAt(x - e, z)) / (2 * e);
      const gz = (edgeAt(x, z + e) - edgeAt(x, z - e)) / (2 * e);
      n = Math.sqrt(1 + Math.min(16, gx * gx + gz * gz) * near);
    }
    A.l = l;
    A.d = (y - l) / n;
    return A;
  };

  // Calotte : la peau gonflée d'une épaisseur qui s'amincit vers le bord. Pas de « marche » au bord :
  // sous la ligne d'implantation, la masse s'affine et plonge doucement sous la peau (sur environ
  // une case du maillage), puis elle est coupée bien en dessous, là où on ne la voit pas. Un bord en
  // marche, plus fin qu'une case, sortait du maillage en dents irrégulières (escalier à la frange,
  // aux tempes et sur la nuque).
  const w = Math.max(0.008, cell); // largeur du fondu sous la ligne
  const edgeR = Math.max(0.006, cell * 0.8); // congé de la coupe (cachée sous la peau)
  // Raie au milieu (longs) : un creux le long du dessus de la tête, du front jusqu'à l'épi.
  const part = S.part
    ? (x, y, z) => 0.0045 * Math.exp(-(x * x) / (0.013 * 0.013)) * sstep(-0.05, -0.01, z) * sstep(0.13, 0.165, y)
    : () => 0;
  const cap = (x, y, z, h) => {
    const A = above(x, y, z);
    const full = S.tMin + (S.t0(y) - S.tMin) * sstep(-0.004, 0.035, A.d);
    const k = sstep(-w, w * 0.7, A.d);
    const t = -0.006 + (full + 0.006) * k;
    const d = h - t + (gAmp * groove(x, y, z) + part(x, y, z)) * k;
    return roundMax(d, -(A.d + 2.4 * w), edgeR);
  };

  const extra = [];
  // Les pointes des mèches gardent au moins ~une demi-case de rayon (sinon elles s'effilochent).
  const rr = (r) => Math.max(r, cell * 0.45);
  // Frange balayée sur le côté (courts).
  if (style === 'short') {
    const P = (x, y, off) => [x, y, skinZ(head, x, y) + off];
    extra.push(lock([[0.06, 0.2, 0.03], P(0.04, 0.168, 0.02), P(-0.028, 0.133, 0.009)], [0.022, 0.017, 0.0075].map(rr)));
    extra.push(lock([[0.08, 0.195, 0.02], P(0.075, 0.16, 0.018), P(0.024, 0.13, 0.008)], [0.02, 0.016, 0.007].map(rr)));
    extra.push(lock([[0.02, 0.205, 0.03], P(-0.008, 0.172, 0.018), P(-0.074, 0.136, 0.008)], [0.02, 0.016, 0.007].map(rr)));
  }
  // Mèche sur le front et petites mèches aux tempes (queue de cheval, chignon, tresse).
  if (style === 'ponytail' || style === 'bun' || style === 'braid') {
    const P = (x, y, off) => [x, y, skinZ(head, x, y) + off];
    extra.push(lock([[0.07, 0.2, 0.03], P(0.05, 0.172, 0.014), P(-0.02, 0.142, 0.009)], [0.02, 0.017, 0.009].map(rr)));
    for (const s of [1, -1]) extra.push(lock([P(s * 0.098, 0.128, 0.005), P(s * 0.104, 0.095, 0.006), P(s * 0.1, 0.066, 0.005)], [0.0065, 0.0055, 0.003].map(rr)));
  }
  // Longs : deux mèches partent de la raie, dégagent le front en s'écartant vers les tempes, puis
  // rejoignent les longues mèches qui encadrent le visage ; rideau dans le dos.
  let curtain = null;
  if (style === 'long') {
    const P = (x, y, off) => [x, y, skinZ(head, x, y) + off];
    for (const s of [1, -1]) {
      extra.push(lock([P(s * 0.009, 0.192, 0.012), P(s * 0.04, 0.166, 0.013), P(s * 0.075, 0.136, 0.013), P(s * 0.1, 0.096, 0.012), P(s * 0.111, 0.05, 0.01)], [0.012, 0.016, 0.017, 0.017, 0.016].map(rr)));
    }
    const back = lock([[0, 0.06, -0.075], [0, -0.06, -0.112], [0, -0.17, -0.125], [0, -0.265, -0.122]], [0.07, 0.052, 0.036, 0.024], 2.05);
    // Mèches du visage : elles s'écartent un peu en descendant, pointes arrondies sur les épaules.
    const sides = [1, -1].map((s) => lock([[s * 0.108, 0.1, 0.03], [s * 0.118, -0.03, 0.036], [s * 0.121, -0.1, 0.026], [s * 0.118, -0.16, 0.012]], [0.028, 0.025, 0.019, 0.011], 0.62));
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
    // Les longs : le rideau s'arrête contre le cou et les épaules (forme fermée : quand la tête
    // tourne, on voit une surface de cheveux, pas un trou).
    if (curtain && y < 0.04) d = smax(d, 0.006 - bodyField(x, y, z), 0.014); // sans effet au-dessus de y = 0,04
    d = Math.max(d, -h - 0.03);
    return d;
  };
  const grooveAll = curtain
    ? (x, y, z) => (y < -0.02 && z < -0.03 ? Math.sin(x * 120) : groove(x, y, z))
    : groove;
  return { field, groove: grooveAll, tie };
}

// Tresse : des grains en biais, un coup venant de la gauche, un coup de la droite, qui passent par
// dessus le milieu (ils ressortent vers l'arrière en descendant) : de dos, une colonne de chevrons
// bien séparés par des creux, aux bords festonnés. Le premier grain part de l'élastique (y = 0).
const BRAID_N = 11;
const BRAID_STEP = 0.0225;
const braidLobe = (i) => {
  const s = i % 2 ? 1 : -1;
  const f = i / (BRAID_N - 1);
  const y = -0.006 - i * BRAID_STEP;
  const wd = 0.021 * (1 - 0.3 * f); // demi-largeur de la tresse (elle s'affine en bas)
  const r = 0.0125 * (1 - 0.28 * f) * (i === 0 ? 0.85 : 1);
  const z = -0.012 - i * 0.0018;
  return roundCone([s * wd, y + 0.012, z + 0.007], [-s * wd * 0.15, y - 0.014, z - 0.008], r, r * 0.85);
};
/** Queue de cheval ou tresse, dans le repère de son pivot (l'élastique), pour qu'elle se balance. */
function tailField(style) {
  if (style === 'braid') {
    const lobes = [];
    for (let i = 0; i < BRAID_N; i++) lobes.push(braidLobe(i));
    const yEnd = -0.006 - BRAID_N * BRAID_STEP;
    const tuft = lock([[0, yEnd + 0.01, -0.034], [0, yEnd - 0.025, -0.03], [0, yEnd - 0.05, -0.028]], [0.009, 0.011, 0.004]);
    const field = (x, y, z) => {
      // Petit fondu : les grains se touchent mais gardent un creux entre eux.
      let d = lobes[0](x, y, z);
      for (let i = 1; i < lobes.length; i++) d = smin(d, lobes[i](x, y, z), 0.003);
      return smin(d, tuft(x, y, z), 0.006);
    };
    // Creux entre deux grains (-1) ou milieu d'un grain (+1) : pour les ombres des couleurs.
    field.groove = (x, y, z) => {
      let d1 = 1;
      let d2 = 1;
      for (const f of lobes) {
        const d = f(x, y, z);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
      return clamp((d2 - d1) / 0.006, 0, 1) * 2 - 1;
    };
    return field;
  }
  const tail = lock([[0, 0, 0.004], [0, -0.012, -0.045], [0, -0.075, -0.074], [0, -0.165, -0.078], [0, -0.25, -0.058], [0, -0.305, -0.044]], [0.028, 0.042, 0.045, 0.039, 0.026, 0.007]);
  const field = (x, y, z) => tail(x, y, z) + 0.002 * Math.sin(Math.atan2(x, z + 0.07) * 7 + y * 8);
  field.groove = (x, y, z) => Math.sin(Math.atan2(x, z + 0.07) * 7 + y * 8);
  return field;
}

/** Hauteur (repère du pivot) de l'élastique du bas de la tresse. */
export const BRAID_END = -0.006 - BRAID_N * BRAID_STEP + 0.006;

// ------------------------------------------------------------------ maillage

/**
 * Retire les triangles cachés dans la tête, les petits morceaux isolés, puis les sommets inutilisés.
 * Renvoie des tableaux { position, normal, index } (transférables depuis le worker).
 */
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
  geo.dispose();
  const count = p2.length / 3;
  return {
    position: new Float32Array(p2),
    normal: new Float32Array(n2),
    index: count > 65535 ? new Uint32Array(keep) : new Uint16Array(keep),
  };
}

/** Valeur « de mèche » -1..1 par sommet, gardée pour les reflets (sillon, hauteur). */
function strandData(arrays, groove) {
  const pos = arrays.position;
  const n = pos.length / 3;
  const g = new Float32Array(n);
  for (let v = 0; v < n; v++) g[v] = groove(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
  arrays.groove = g;
  return arrays;
}

/** Clé du cache des formes. */
export const hairKey = (style, hat, high) => `${style}|${hat ? 1 : 0}|${high ? 1 : 0}`;

/**
 * Calcule les formes d'une coiffure, en tableaux simples (utilisable dans un worker) :
 * { key, main: { position, normal, index, groove }, tail (queue / tresse, repère du pivot) | null, tie }.
 */
export function hairArrays(style, hat, high, head = headSdf) {
  const cell = high ? 0.0112 : 0.0158;
  const { field, groove, tie } = hairField(style, head, hat, cell);
  const lowY = style === 'long' ? -0.33 : style === 'braid' || style === 'ponytail' ? -0.1 : -0.08;
  const wide = style === 'curly' ? 0.235 : 0.2;
  const bounds = [[-wide, lowY, -0.25], [wide, style === 'curly' ? 0.33 : style === 'bun' ? 0.3 : 0.29, 0.21]];
  // Seuls les triangles cachés dans la tête sont retirés (elle bouge avec les cheveux) ; le cou et
  // les épaules sont découpés dans la SDF (bodyField), pour garder une forme fermée.
  const main = strandData(trimInside(sdfMesh(field, bounds, cell), (x, y, z) => head(x, y, z) < -0.0025), groove);
  let tail = null;
  if (style === 'ponytail' || style === 'braid') {
    const f = tailField(style);
    // La tresse a des grains fins : cases plus petites (elle est petite, ça reste peu de triangles).
    tail = strandData(trimInside(sdfMesh(f, [[-0.07, -0.34, -0.14], [0.07, 0.05, 0.05]], cell * (style === 'braid' ? 0.55 : 0.85)), () => false), f.groove);
    if (style === 'braid') tail.grooveAmp = 0.22; // creux bien marqués entre les grains
  }
  return { key: hairKey(style, hat, high), main, tail, tie };
}

const cache = new Map();

/** BufferGeometry partagée à partir des tableaux de hairArrays. */
function toGeometry(arr) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(arr.normal, 3));
  geo.setIndex(new THREE.BufferAttribute(arr.index, 1));
  geo.computeBoundingSphere();
  geo.userData.groove = arr.groove;
  if (arr.grooveAmp) geo.userData.grooveAmp = arr.grooveAmp;
  geo.userData.shared = true;
  return geo;
}

/** Range dans le cache des formes calculées ailleurs (worker) ; ignorées si déjà là. */
export function adoptHair(data) {
  if (!data?.key || cache.has(data.key)) return;
  cache.set(data.key, { main: toGeometry(data.main), tail: data.tail ? toGeometry(data.tail) : null, tie: data.tie });
}

/** Vrai si la coiffure est déjà prête (pas de calcul au prochain buildAvatar). */
export const hairReady = (style, hat, high) => cache.has(hairKey(style, hat, high));

/**
 * Formes partagées d'une coiffure : { main, tail?, tie? } (BufferGeometry sans couleur).
 * main : la masse sur la tête ; tail : queue de cheval / tresse (repère du pivot) ; tie : position de
 * l'élastique. high : qualité haute (cases plus fines). Calculée ici si le worker ne l'a pas déjà faite.
 */
export function hairGeometry(style, hat, high, head = headSdf) {
  const key = hairKey(style, hat, high);
  if (!cache.has(key)) adoptHair(hairArrays(style, hat, high, head));
  return cache.get(key);
}

let prepared = null;

/**
 * Prépare toutes les coiffures (avec et sans chapeau) d'une qualité dans un worker, une seule fois.
 * Sans worker possible (version à emporter ouverte depuis le disque, tests), on ne fait rien : chaque
 * coiffure sera calculée à sa première apparition, comme avant.
 */
export function prepareHair(high) {
  if (prepared === high || typeof Worker === 'undefined' || typeof window === 'undefined') return;
  prepared = high;
  const keys = [];
  for (const hat of [false, true]) for (const style of HAIR_STYLES) if (!hairReady(style, hat, high)) keys.push([style, hat]);
  if (!keys.length) return;
  try {
    const w = new Worker(new URL('./hairWorker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      if (e.data?.done) w.terminate();
      else adoptHair(e.data);
    };
    w.onerror = (e) => {
      e.preventDefault?.();
      w.terminate();
    };
    w.postMessage({ high, keys });
  } catch {
    /* pas de worker : calcul à la demande */
  }
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
  // Libérer ce personnage (disposeModel) ne doit libérer que SA couleur : three supprime les tampons
  // GPU de tous les attributs de la géométrie libérée, y compris ceux partagés avec les autres
  // personnages qui ont la même coiffure (ils devaient alors tout renvoyer au GPU).
  geo.dispose = disposeOwnColor;
  const base = new THREE.Color(hairHex);
  const lum = 0.2126 * base.r + 0.7152 * base.g + 0.0722 * base.b;
  // Le reflet : discret sur les cheveux sombres, plus doré sur les clairs.
  const sheen = new THREE.Color(1, 0.96, 0.9).multiplyScalar(0.035 + lum * 0.35);
  const pos = shared.attributes.position.array;
  const nrm = shared.attributes.normal.array;
  const groove = shared.userData.groove;
  const gAmp = shared.userData.grooveAmp ?? 0.07;
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
    let k = ao * under * (1 + gAmp * g);
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

/** dispose() d'une géométrie de tintHair : on détache d'abord les attributs partagés. */
function disposeOwnColor() {
  this.deleteAttribute('position');
  this.deleteAttribute('normal');
  this.setIndex(null);
  THREE.BufferGeometry.prototype.dispose.call(this);
}

/** Calotte et visière du chapeau (formes de buildAvatar), à l'échelle de la coiffure. */
export const HAT_SHAPE = HAT;
export { TAU };

/** Pour les tests et la mise au point : le champ d'une coiffure. */
export const __hairFieldForTest = hairField;

// ------------------------------------------------------------------ sangles de la bombe

/** Rayon des sangles de la bombe et leur écart à la peau (ou aux cheveux), repère de la tête (m). */
export const STRAP_R = 0.0026;
export const STRAP_GAP = STRAP_R + 0.0012;

/** Cou (cylindre de buildAvatar, sous la tête) : la jugulaire passe devant, pas dedans. */
const neckSdf = (x, y, z) => (y > -0.004 ? 1 : Math.hypot(x, z) - (0.048 + 0.008 * Math.min(1, (-0.01 - y) / 0.12)));

/** Bord de la coque de la bombe (helmetModel) à l'azimut φ, dans le repère de la tête (fit : helmetFit). */
export function helmetRim(fit, phi) {
  // Coque : sphère r 0,115 étirée [1 ; 0,95 ; 1,12], ouverte jusqu'à 0,52 π depuis le haut.
  const r = 0.115 * Math.sin(Math.PI * 0.52) * fit.scale;
  const x = r * Math.cos(phi);
  const y = 0.115 * Math.cos(Math.PI * 0.52) * 0.95 * fit.scale;
  const z = r * 1.12 * Math.sin(phi);
  const c = Math.cos(fit.tilt);
  const s = Math.sin(fit.tilt);
  return [x, fit.y + y * c - z * s, fit.z + y * s + z * c];
}

/**
 * Sangles de la bombe collées à la tête (repère de la tête) : de chaque côté, une sangle devant l'oreille
 * et une derrière, qui partent de dessous la coque et se rejoignent sous le lobe (boucle), puis la jugulaire
 * qui suit la mâchoire et passe sous le menton, devant le cou. Chaque point est posé sur ce qui est le plus
 * à l'extérieur (peau, cou, ou cheveux rentrés sous la bombe), à STRAP_GAP : les sangles ne flottent plus
 * à côté des joues (l'ancien harnais était deux anneaux fixes de la coque, à 1 à 2 cm du visage).
 * Renvoie { paths: [[x, y, z], …][], buckles: [{ p, n }] } (n : normale de la peau à la boucle).
 */
export function helmetStraps(style, fit = helmetFit(style)) {
  const hair = style === 'bald' ? () => 1 : hairField(style, headSdf, true).field;
  const outer = (x, y, z) => Math.min(headSdf(x, y, z), hair(x, y, z), neckSdf(x, y, z));
  const e = 0.0015;
  const normal = (p) => {
    const n = [
      outer(p[0] + e, p[1], p[2]) - outer(p[0] - e, p[1], p[2]),
      outer(p[0], p[1] + e, p[2]) - outer(p[0], p[1] - e, p[2]),
      outer(p[0], p[1], p[2] + e) - outer(p[0], p[1], p[2] - e),
    ];
    const l = Math.hypot(...n) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  // Pose le point à STRAP_GAP de la surface (quelques pas de Newton le long de la normale).
  const settle = (p) => {
    const q = [...p];
    for (let i = 0; i < 6; i++) {
      const d = outer(...q) - STRAP_GAP;
      if (Math.abs(d) < 0.0002) break;
      const n = normal(q);
      for (let k = 0; k < 3; k++) q[k] -= n[k] * d;
    }
    return q;
  };
  // Suite de points guides → courbe douce, échantillonnée puis posée sur la tête.
  const along = (guide, n) => {
    const curve = new THREE.CatmullRomCurve3(guide.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    const pts = curve.getPoints(n).map((v) => settle([v.x, v.y, v.z]));
    // Un lissage léger (les cheveux font de petites bosses), puis de nouveau à la bonne distance.
    for (let it = 0; it < 2; it++) {
      for (let i = 1; i < pts.length - 1; i++) {
        for (let k = 0; k < 3; k++) pts[i][k] = pts[i][k] * 0.5 + (pts[i - 1][k] + pts[i + 1][k]) * 0.25;
      }
      for (let i = 1; i < pts.length - 1; i++) pts[i] = settle(pts[i]);
    }
    return pts;
  };
  // Point du bord de la coque le plus proche de la profondeur z voulue (côté s), un peu au-dessus et vers
  // l'intérieur : la sangle part de sous la coque.
  const rimAt = (s, z) => {
    let best = null;
    for (let i = 0; i <= 180; i++) {
      const p = helmetRim(fit, (i / 180) * Math.PI - Math.PI / 2); // côté +X
      if (!best || Math.abs(p[2] - z) < Math.abs(best[2] - z)) best = p;
    }
    return [s * best[0] * 0.8, best[1] + 0.01, best[2]];
  };
  const paths = [];
  const buckles = [];
  const chin = [];
  for (const s of [1, -1]) {
    const B = settle([s * 0.104, -0.012, 0.004]); // boucle, sous le lobe de l'oreille
    const front = rimAt(s, 0.045);
    const rear = rimAt(s, -0.07);
    paths.push(along([front, [s * 0.118, 0.07, 0.044], [s * 0.114, 0.035, 0.036], [s * 0.108, 0.008, 0.018], B], 20));
    paths.push(along([rear, [s * 0.124, 0.06, -0.058], [s * 0.12, 0.025, -0.04], [s * 0.11, 0.0, -0.016], B], 20));
    buckles.push({ p: B, n: normal(B) });
    chin.push([B, [s * 0.09, -0.045, 0.022], [s * 0.066, -0.075, 0.04], [s * 0.034, -0.09, 0.056]]);
  }
  // Jugulaire : d'une boucle à l'autre, sous le menton.
  paths.push(along([...chin[0], [0, -0.094, 0.062], ...[...chin[1]].reverse()], 36));
  return { paths, buckles, outer };
}
