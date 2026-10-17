// Cheval réaliste sculpté par le code (vague 3).
// Tout le pelage est UN maillage à os (SkinnedMesh) : tronc + encolure (champ de distance fin, une seule
// surface lisse du poitrail à la nuque), tête (champ plus fin : chanfrein, ganaches, naseaux creusés,
// arcades), membres articulés (avant-bras, genou, canon, boulet, paturon, sabot ; grasset, jambe,
// jarret pointu), oreilles en cornet, couard. Les os suivent les groupes que l'animation fait tourner
// (pattes, genoux, encolure, tête, oreilles, queue) : l'épaule et la cuisse se déforment avec la jambe,
// l'encolure se plie en douceur pour brouter. Les crins (crinière drapée sur l'encolure, toupet, queue,
// fanons) forment un second maillage à os. Le gabarit vient de la race (src/sim/horseLook.js) ; la
// géométrie est partagée entre chevaux de même gabarit, la robe est peinte par shader (horseCoat.js).
// Repère : l'animal regarde vers +Z, y vers le haut, origine au sol sous le milieu du corps.

import * as THREE from 'three';
import { ellipsoid, roundCone, smin, sdfMesh, rayHit, sdfNormal } from './sdf.js';
import { loft } from './shapes.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { gfx } from '../gfx.js';
import { horseBuild, horseBreedOf } from '../../sim/horseLook.js';
import { coatMaterial, maneMaterial, eyeMaterial, PART } from './horseCoat.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ champs de distance

/** Ellipsoïde avec sa boîte (pour sauter les formes trop loin du point évalué). */
function E3(c, r, k = 0) {
  return { f: ellipsoid(c, r), k, mn: [c[0] - r[0], c[1] - r[1], c[2] - r[2]], mx: [c[0] + r[0], c[1] + r[1], c[2] + r[2]] };
}

/** Cône arrondi a → b (rayons ra, rb ; sx aplatit en largeur) avec sa boîte. */
function RC(a, b, ra, rb, sx = 1, k = 0) {
  const r = Math.max(ra, rb);
  return {
    f: roundCone(a, b, ra, rb, sx), k,
    mn: [Math.min(a[0], b[0]) - r * sx, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r],
    mx: [Math.max(a[0], b[0]) + r * sx, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r],
  };
}

/** Les deux côtés (x et -x) d'une forme. */
const both = (make) => [make(1), make(-1)];

/**
 * Union douce d'une liste de formes, puis creusements (cuts : [forme, k]). Les formes dont la boîte est
 * trop loin pour changer le résultat ne sont pas évaluées (rapide, même avec beaucoup de formes).
 */
function field(prims, cuts = []) {
  const n = prims.length;
  const F = prims.map((p) => p.f);
  const K = Float32Array.from(prims.map((p) => p.k));
  const B = Float32Array.from(prims.flatMap((p) => [...p.mn, ...p.mx]));
  return (x, y, z) => {
    let d = 1e9;
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      const dx = Math.max(B[o] - x, 0, x - B[o + 3]);
      const dy = Math.max(B[o + 1] - y, 0, y - B[o + 4]);
      const dz = Math.max(B[o + 2] - z, 0, z - B[o + 5]);
      if (dx * dx + dy * dy + dz * dz > (d + K[i] + 0.03) ** 2) continue;
      const v = F[i](x, y, z);
      d = K[i] > 0 ? smin(d, v, K[i]) : Math.min(d, v);
    }
    for (const [c, k] of cuts) d = -smin(-d, c.f(x, y, z), k);
    return d;
  };
}

function boundsOf(prims, pad) {
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) {
    for (let i = 0; i < 3; i++) {
      mn[i] = Math.min(mn[i], p.mn[i] - pad);
      mx[i] = Math.max(mx[i], p.mx[i] + pad);
    }
  }
  return [mn, mx];
}

// ------------------------------------------------------------------ anatomie

/**
 * Repères du squelette pour un gabarit (mètres, cheval de taille 1). E : sol → passage de sangle,
 * D : profondeur de poitrine, W : demi-largeur du tronc.
 */
function anatomy(B, neckAngle) {
  const g = B.girth;
  const lg = B.legs;
  const bk = B.back;
  const nk = B.neck;
  const E = 0.93 * lg;
  const D = 0.66 * g ** 0.6;
  const W = 0.28 * g;
  const yB = E;
  const yW = E + D;
  const yC = E + D * 0.5;
  const xF = 0.15 * g ** 0.55;
  const xH = 0.15 * g ** 0.55;
  const zF = 0.44 * bk;
  const zH = -0.66 * bk;
  const neckBase = V(0, yC + 0.1, 0.5 * bk);
  const poll = V(0, yW + 0.33 * nk, 0.44 * bk + 0.66 * nk);
  return {
    g, lg, bk, nk, E, D, W, yB, yW, yC, xF, xH, zF, zH, neckBase, poll,
    na: neckAngle, headRot: 0.92, Hl: 0.63 * B.head,
    frontPivot: (s) => V(s * xF, yB + 0.2, zF + 0.03),
    hindPivot: (s) => V(s * xH, yC - 0.02, -0.5 * bk),
    frontKnee: (s) => V(s * xF, 0.565 * E, zF + 0.005),
    hindKnee: (s) => V(s * xH, 0.62 * E, zH),
  };
}

/** Interpolation lisse (Catmull-Rom) d'une table [[z, v]…], précalculée en n échantillons. */
function profile(points, z0, z1, n = 160) {
  const vals = new Float32Array(n + 1);
  const at = (z) => {
    let i = 0;
    while (i < points.length - 2 && points[i + 1][0] < z) i++;
    const p1 = points[i];
    const p2 = points[i + 1];
    const p0 = points[Math.max(0, i - 1)];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const t = Math.min(1, Math.max(0, (z - p1[0]) / (p2[0] - p1[0])));
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
  };
  for (let i = 0; i <= n; i++) vals[i] = at(z0 + ((z1 - z0) * i) / n);
  return (z) => {
    const f = Math.min(n, Math.max(0, ((z - z0) / (z1 - z0)) * n));
    const i = Math.min(n - 1, Math.floor(f));
    return vals[i] + (vals[i + 1] - vals[i]) * (f - i);
  };
}

/**
 * Tronc défini par sa silhouette, comme un sculpteur : ligne du dessus (garrot, dos, rein, croupe),
 * ligne du dessous (passage de sangle, ventre, flanc remonté), largeur. Chaque tranche est une
 * super-ellipse (dos plus plat, ventre plus rond). Renvoie une forme { f, k, mn, mx }.
 */
function trunkShape(top, bot, wid, z0, z1) {
  const T = profile(top, z0, z1);
  const Bo = profile(bot, z0, z1);
  const Wd = profile(wid, z0, z1);
  let mxw = 0;
  let mny = Infinity;
  let mxy = -Infinity;
  for (let z = z0; z <= z1; z += 0.01) {
    mxw = Math.max(mxw, Wd(z));
    mny = Math.min(mny, Bo(z));
    mxy = Math.max(mxy, T(z));
  }
  const f = (x, y, z) => {
    const zc = Math.min(z1, Math.max(z0, z));
    const out = Math.abs(z - zc);
    const t = T(zc);
    const b = Bo(zc);
    const w = Math.max(0.004, Wd(zc));
    const cy = b + (t - b) * 0.56;
    const dy = y - cy;
    const hy = Math.max(0.004, dy > 0 ? t - cy : cy - b);
    const n = dy > 0 ? 2.7 : 2.15;
    const r = ((Math.abs(x) / w) ** n + (Math.abs(dy) / hy) ** n) ** (1 / n);
    const d = (r - 1) * Math.min(w, hy) * 0.92;
    return out > 0 ? Math.max(d, 0) + out : d;
  };
  return { f, k: 0, mn: [-mxw, mny, z0], mx: [mxw, mxy, z1] };
}

/** Tronc et encolure : une seule surface, du poitrail à la nuque. */
function torsoPrims(A, B) {
  const { W, yB, yW, yC, bk, xF, xH, zF, zH, poll, g } = A;
  const cr = B.croup;
  const P = [];
  const z = (v) => v * bk;
  // Silhouette du tronc (ligne du dessus, ligne du dessous, demi-largeur).
  const top = [[-0.86, -0.36], [-0.8, -0.28], [-0.72, -0.15], [-0.6, -0.06], [-0.48, -0.025], [-0.36, -0.035], [-0.22, -0.055],
    [-0.05, -0.075], [0.12, -0.065], [0.28, -0.025], [0.38, 0], [0.48, -0.04], [0.6, -0.16], [0.7, -0.27], [0.76, -0.36], [0.8, -0.42]]
    .map(([zz, v]) => [z(zz), yW + v * (zz < -0.6 ? cr : 1)]);
  const bot = [[-0.86, 0.27], [-0.8, 0.2], [-0.66, 0.08], [-0.5, 0.05], [-0.36, 0.065], [-0.22, 0.025], [-0.05, -0.025],
    [0.15, -0.035], [0.35, -0.022], [0.52, 0.02], [0.64, 0.08], [0.72, 0.15], [0.77, 0.2], [0.8, 0.22]]
    .map(([zz, v]) => [z(zz), yB + v]);
  const wid = [[-0.86, 0.02], [-0.8, 0.11], [-0.72, 0.19], [-0.6, 0.25], [-0.45, 0.272], [-0.25, 0.283], [-0.05, 0.293],
    [0.15, 0.285], [0.32, 0.258], [0.48, 0.232], [0.6, 0.205], [0.7, 0.165], [0.76, 0.11], [0.8, 0.03]]
    .map(([zz, v]) => [z(zz), v * (W / 0.28) * (zz < -0.3 ? cr ** 0.5 : 1)]);
  P.push(trunkShape(top, bot, wid, z(-0.86), z(0.8)));

  // Muscles, fondus en douceur (petits congés : on garde le dessin des muscles).
  // Épaule : omoplate inclinée qui descend du garrot vers la pointe de l'épaule.
  P.push(...both((s) => RC([s * W * 0.66, yW - 0.16, z(0.3)], [s * W * 0.64, yB + 0.33, z(0.55)], 0.1, 0.09, 0.42, 0.07)));
  P.push(...both((s) => E3([s * W * 0.62, yB + 0.27, z(0.6)], [0.05, 0.06, 0.05], 0.08))); // pointe de l'épaule (discrète)
  // Bras et triceps au-dessus du coude, puis coude.
  P.push(...both((s) => RC([s * W * 0.7, yB + 0.26, z(0.6)], [s * (xF + 0.01), yB + 0.06, zF - 0.04], 0.09, 0.07, 0.7, 0.07)));
  P.push(...both((s) => E3([s * (xF + 0.005), yB + 0.02, zF - 0.07], [0.035, 0.045, 0.04], 0.05)));
  // (l'avant-bras et la jambe ne sont pas dans ce champ : le membre (loft, plus fin et plus juste) sort
  // du corps par un congé lisse calculé dans sculpt())
  // Poitrail (pectoraux entre les antérieurs).
  P.push(...both((s) => E3([s * 0.075, yB + 0.17, z(0.68)], [0.085, 0.1, 0.08], 0.06)));
  // Arrière-main : cuisse ronde, grasset, muscles de l'arrière de la cuisse jusqu'au jarret.
  P.push(...both((s) => E3([s * W * 0.6, yC - 0.1, z(-0.56)], [W * 0.5 * cr, 0.33 * cr, 0.25 * cr], 0.07)));
  P.push(...both((s) => E3([s * W * 0.74, yB + 0.1, z(-0.34)], [0.05, 0.1, 0.07], 0.07))); // grasset
  // (arrêtés au-dessus du jarret, dans le membre : plus de bourrelet au bout)
  P.push(...both((s) => RC([s * 0.11, yC - 0.02, z(-0.74)], [s * (xH + 0.01), 0.92 * A.E, zH + 0.03], 0.08, 0.045, 0.85, 0.07)));
  P.push(RC([0, yW - 0.1, z(-0.64)], [0, yW - 0.16, z(-0.8)], 0.06, 0.05, 1, 0.05)); // attache de la queue

  // Encolure : longue, part sous le garrot (qui reste marqué) et du poitrail ; gorge fine sous la nuque.
  const nw = B.neckW;
  const base = V(0, yC + 0.04, z(0.55));
  const topN = V(0, poll.y - 0.07, poll.z - 0.08);
  const ctrl = V(0, yW + 0.0, z(0.78));
  const at = (t) => {
    const a = base.clone().lerp(ctrl, t);
    return a.lerp(ctrl.clone().lerp(topN, t), t);
  };
  // [t, demi-épaisseur côté crinière, côté gorge, demi-largeur]
  const secs = [[0, 0.23, 0.26, 0.2], [0.3, 0.18, 0.16, 0.15], [0.6, 0.145, 0.115, 0.118], [0.85, 0.125, 0.095, 0.098], [1, 0.115, 0.09, 0.088]];
  for (let i = 0; i < secs.length - 1; i++) {
    const s0 = secs[i];
    const s1 = secs[i + 1];
    const pa = at(s0[0]);
    const pb = at(s1[0]);
    const dir = pb.clone().sub(pa).normalize();
    const upN = V(0, dir.z, -dir.y); // perpendiculaire à l'encolure, vers le dessus
    const ca = pa.clone().addScaledVector(upN, (s0[1] - s0[2]) / 2 * nw);
    const cb = pb.clone().addScaledVector(upN, (s1[1] - s1[2]) / 2 * nw);
    const ra = (s0[1] + s0[2]) / 2 * nw;
    const rb = (s1[1] + s1[2]) / 2 * nw;
    P.push(RC(ca.toArray(), cb.toArray(), ra, rb, (s0[3] / ((s0[1] + s0[2]) / 2) + s1[3] / ((s1[1] + s1[2]) / 2)) / 2, i === 0 ? 0.18 : 0.09));
  }
  // Crête de l'encolure (bombée chez les baroques et les traits).
  const crest = B.crest;
  const cr0 = V(0, yW - 0.1, z(0.5));
  const crTop = topN.clone().add(V(0, 0.06, -0.03));
  const mid = at(0.5);
  const dirM = at(0.55).sub(at(0.45)).normalize();
  const crMid = mid.clone().addScaledVector(V(0, dirM.z, -dirM.y), (0.115 + 0.03 * (crest - 1)) * nw);
  P.push(RC(cr0.toArray(), crMid.toArray(), 0.06 * nw, 0.05 * nw * crest ** 0.5, 0.75, 0.09));
  P.push(RC(crMid.toArray(), crTop.toArray(), 0.05 * nw * crest ** 0.5, 0.04 * nw, 0.75, 0.08));
  void g;
  return P;
}

/** Tête (repère de la tête : origine à la nuque, +z vers le bout du nez, +y vers le front). */
function headPrims(A, B) {
  const u = A.Hl;
  const s = (v) => v.map((x) => x * u);
  const P = [];
  const cuts = [];
  P.push(E3(s([0, 0.03, 0.07]), s([0.14, 0.13, 0.15]))); // crâne et nuque
  P.push(E3(s([0, 0.07, 0.24]), s([0.16, 0.075, 0.16]), 0.06 * u)); // front large et plat
  P.push(...both((k) => E3(s([k * 0.07, -0.13, 0.2]), s([0.075, 0.165, 0.155]), 0.08 * u))); // ganaches (larges et plates)
  P.push(E3(s([0, -0.12, 0.1]), s([0.1, 0.12, 0.12]), 0.07 * u)); // gorge entre les ganaches
  P.push(RC(s([0, 0.02, 0.3]), s([0, -0.035, 0.8]), 0.13 * u, 0.082 * u, 0.88, 0.06 * u)); // chanfrein
  P.push(E3(s([0, -0.075, 0.86]), s([0.1, 0.112, 0.118]), 0.06 * u)); // bout du nez
  P.push(RC(s([0, -0.16, 0.42]), s([0, -0.175, 0.84]), 0.07 * u, 0.06 * u, 1.15, 0.05 * u)); // mâchoire et bouche
  P.push(E3(s([0, -0.205, 0.85]), s([0.065, 0.045, 0.07]), 0.04 * u)); // menton, lèvre inférieure
  P.push(...both((k) => E3(s([k * 0.135, 0.065, 0.25]), s([0.05, 0.045, 0.065]), 0.04 * u))); // arcades
  P.push(...both((k) => RC(s([k * 0.12, -0.03, 0.3]), s([k * 0.095, -0.06, 0.5]), 0.035 * u, 0.025 * u, 1, 0.05 * u))); // crête zygomatique
  P.push(...both((k) => E3(s([k * 0.07, -0.045, 0.925]), s([0.045, 0.065, 0.05]), 0.03 * u))); // ailes du nez
  if (B.profile === 'convex') P.push(E3(s([0, 0.06, 0.52]), s([0.1, 0.06, 0.22]), 0.08 * u)); // tête busquée
  if (B.profile === 'dish') {
    cuts.push([E3(s([0, 0.13, 0.55]), s([0.12, 0.05, 0.2])), 0.06 * u]); // chanfrein concave
    P.push(E3(s([0, 0.09, 0.22]), s([0.15, 0.08, 0.12]), 0.06 * u)); // front bombé (jibbah)
  }
  // Naseaux : à peine creusés (le dessin en virgule est peint par le shader du pelage).
  const nostril = both((k) => E3(s([k * 0.066, -0.045, 0.985]), s([0.012, 0.03, 0.022])));
  for (const n of nostril) cuts.push([n, 0.02 * u]);
  return { prims: P, cuts, nostril };
}

// ------------------------------------------------------------------ membres

// [y (÷E), z (m, relatif à la colonne), demi-largeur, profondeur avant, profondeur arrière] ; les
// largeurs sont multipliées par l'os de la race.
// (le haut, caché dans le corps, est plus étroit : le membre sort du dessous du poitrail, pas du flanc)
const FRONT_LEG = [
  [1.2, -0.02, 0.05, 0.065, 0.08], [1.1, -0.017, 0.06, 0.072, 0.09], [1.03, -0.014, 0.072, 0.076, 0.094], [0.96, -0.01, 0.072, 0.07, 0.085],
  [0.89, -0.005, 0.066, 0.065, 0.075], [0.82, 0, 0.061, 0.06, 0.066],
  [0.73, 0.001, 0.052, 0.054, 0.052], [0.66, 0.002, 0.045, 0.048, 0.042], [0.6, 0.004, 0.043, 0.046, 0.04], [0.565, 0.005, 0.049, 0.05, 0.048], [0.53, 0.005, 0.045, 0.045, 0.056],
  [0.49, 0.006, 0.034, 0.034, 0.043], [0.38, 0.007, 0.03, 0.03, 0.046], [0.27, 0.008, 0.031, 0.031, 0.047], [0.215, 0.008, 0.04, 0.04, 0.058],
  [0.17, 0.02, 0.036, 0.034, 0.05], [0.125, 0.04, 0.034, 0.03, 0.036], [0.09, 0.052, 0.041, 0.039, 0.038], [0.065, 0.058, 0.035, 0.033, 0.032],
];
const HIND_LEG = [
  [1.2, 0.2, 0.085, 0.09, 0.115], [1.08, 0.168, 0.095, 0.092, 0.122], [1.02, 0.15, 0.1, 0.09, 0.125], [0.95, 0.126, 0.093, 0.083, 0.12],
  [0.88, 0.1, 0.085, 0.075, 0.115], [0.82, 0.072, 0.075, 0.068, 0.108], [0.76, 0.045, 0.066, 0.062, 0.1],
  [0.68, 0.006, 0.048, 0.048, 0.07], [0.625, 0, 0.05, 0.05, 0.084], [0.575, 0.004, 0.046, 0.048, 0.062], [0.52, 0.008, 0.036, 0.036, 0.046],
  [0.4, 0.01, 0.032, 0.032, 0.048], [0.28, 0.012, 0.032, 0.032, 0.048], [0.215, 0.015, 0.04, 0.04, 0.058], [0.17, 0.027, 0.036, 0.034, 0.05],
  [0.125, 0.045, 0.034, 0.03, 0.036], [0.09, 0.056, 0.04, 0.038, 0.037], [0.065, 0.062, 0.034, 0.032, 0.031],
];
// Sabot : [y (÷E), z, demi-largeur, avant (pince), arrière (talons)].
const HOOF = [[0.095, 0.05, 0.04, 0.037, 0.037], [0.075, 0.057, 0.045, 0.045, 0.04], [0.04, 0.069, 0.05, 0.056, 0.044], [0.008, 0.079, 0.054, 0.065, 0.046], [0, 0.08, 0.054, 0.065, 0.046]];

/** Sections du loft d'un membre (repère du corps, au repos). */
function legSections(A, B, front, s) {
  const prof = front ? FRONT_LEG : HIND_LEG;
  const zc = front ? A.zF : A.zH;
  const xc = s * (front ? A.xF : A.xH);
  const bone = (y) => (y < 0.62 ? B.bone : 1 + (B.bone - 1) * 0.6);
  return prof.map(([y, z, hw, df, db]) => {
    // Haut du membre : il rentre dans le corps (la hanche est plus haut et plus en arrière).
    const top = !front && y > 0.7 ? (y - 0.7) / 0.5 : 0;
    return { p: [xc + s * top * 0.025, y * A.E, zc + z], rx: hw * bone(y) * (y > 0.7 ? B.girth ** 0.4 : 1), ry: df * bone(y), ryb: db * bone(y) };
  });
}

/**
 * Le même membre en champ de distance (cônes arrondis qui suivent les sections, épaisseur avant/arrière
 * comprise) : sert à fondre la jonction avec le tronc (mêmes normales, même occlusion des deux côtés).
 */
function legPrims(secs) {
  const c = (q) => [q.p[0], q.p[1], q.p[2] + (q.ry - q.ryb) / 2];
  const r = (q) => (q.ry + q.ryb) / 2;
  const out = [];
  for (let k = 0; k < secs.length - 1; k++) {
    const a = secs[k];
    const b = secs[k + 1];
    out.push(RC(c(a), c(b), r(a), r(b), (a.rx / r(a) + b.rx / r(b)) / 2));
  }
  return out;
}

// ------------------------------------------------------------------ géométrie partagée

/** Accumulateur de pièces (positions dans le repère du corps, au repos) avec os et attributs du pelage. */
class Build {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.part = [];
    this.info = [];
    this.ao = [];
    this.si = [];
    this.sw = [];
    this.idx = [];
  }

  /**
   * geo : géométrie (repère local) ; m : matrice local → corps ; attr(p, n) → { part, info, ao, w: [[os, poids]…] }.
   * flip : retourne les faces et les normales (les tubes de loft() sont tournés vers l'intérieur : sans
   * ça, on verrait la paroi du fond d'un membre, éclairée à l'envers).
   */
  add(geo, m, attr, flip = false) {
    const base = this.pos.length / 3;
    const p = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const v = V();
    const n = V();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      n.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize();
      if (flip) n.negate();
      const a = attr(v, n, i);
      const nn = a.n ?? n; // normale imposée (jonction tronc / membre fondue)
      this.pos.push(v.x, v.y, v.z);
      this.nrm.push(nn.x, nn.y, nn.z);
      this.part.push(a.part);
      this.info.push(...(a.info ?? [0, 0, 0]));
      this.ao.push(a.ao ?? 1);
      const w = (a.w ?? [[0, 1]]).filter(([, x]) => x > 0.001).sort((x, y) => y[1] - x[1]).slice(0, 4);
      const tot = w.reduce((s0, [, x]) => s0 + x, 0) || 1;
      for (let k = 0; k < 4; k++) {
        this.si.push(w[k]?.[0] ?? 0);
        this.sw.push(w[k] ? w[k][1] / tot : 0);
      }
    }
    const idx = geo.index;
    const at = (i) => base + (idx ? idx.getX(i) : i);
    const count = idx ? idx.count : p.count;
    for (let i = 0; i < count; i += 3) {
      if (flip) this.idx.push(at(i), at(i + 2), at(i + 1));
      else this.idx.push(at(i), at(i + 1), at(i + 2));
    }
    geo.dispose();
  }

  /** Nombre de triangles ajoutés depuis la dernière marque (mesure du budget). */
  mark(name) {
    this.stats = this.stats ?? {};
    this.stats[name] = (this.idx.length - (this.lastMark ?? 0)) / 3;
    this.lastMark = this.idx.length;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('hPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('hInfo', new THREE.Float32BufferAttribute(this.info, 3));
    g.setAttribute('hAO', new THREE.Float32BufferAttribute(this.ao, 1));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// Ordre des os (commun à tous les chevaux : la géométrie partagée s'y réfère).
const BONE = { body: 0, neck: 1, head: 2, ear0: 3, ear1: 4, tail: 5, tailTip: 6, pivot: (i) => 7 + i * 2, knee: (i) => 8 + i * 2 };
const LEG_SIDES = [[true, 1], [true, -1], [false, 1], [false, -1]];

/**
 * Groupes animés (mêmes noms que le modèle générique) et os accrochés à chacun, au repos.
 * Sert à la fois au calcul de la géométrie partagée et à chaque cheval.
 */
function makeRig(A, R) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const neck = new THREE.Group();
  neck.position.copy(A.neckBase);
  neck.rotation.x = A.na;
  body.add(neck);
  const head = new THREE.Group();
  neck.updateMatrix();
  head.position.copy(A.poll).applyMatrix4(neck.matrix.clone().invert());
  head.rotation.x = A.headRot - A.na;
  neck.add(head);
  const ears = [0, 1].map((i) => {
    const e = new THREE.Group();
    e.position.copy(R.ears[i].pos);
    e.quaternion.copy(R.ears[i].quat);
    e.userData.side = i === 0 ? 1 : -1;
    head.add(e);
    e.userData.base = e.rotation.clone();
    e.userData.rest = e.rotation.clone();
    return e;
  });
  const tail = new THREE.Group();
  tail.position.copy(R.tailRoot);
  tail.rotation.x = R.tailRaise;
  tail.userData.baseX = tail.rotation.x;
  body.add(tail);
  const tailTip = new THREE.Group();
  tailTip.position.set(0, -0.3, -0.07);
  tail.add(tailTip);
  const legs = LEG_SIDES.map(([front, side]) => {
    const pivot = new THREE.Group();
    pivot.position.copy(front ? A.frontPivot(side) : A.hindPivot(side));
    body.add(pivot);
    const knee = new THREE.Group();
    knee.position.copy(front ? A.frontKnee(side) : A.hindKnee(side)).sub(pivot.position);
    pivot.add(knee);
    return { pivot, knee, front, side };
  });
  const groups = [body, neck, head, ears[0], ears[1], tail, tailTip, ...legs.flatMap((l) => [l.pivot, l.knee])];
  const bones = groups.map((g) => {
    const b = new THREE.Bone();
    g.add(b);
    return b;
  });
  root.updateMatrixWorld(true);
  return { root, body, neck, head, ears, tail, tailTip, legs, bones, groups };
}

/** Matrice repère du groupe → repère du corps (au repos, root à l'identité). */
const restMatrix = (g) => g.matrixWorld.clone();

/** Sculpte et assemble la géométrie partagée d'un gabarit. */
function sculpt(B, high) {
  const A = anatomy(B, 0.85);
  const { E, yB, yW, yC, bk } = A;
  const torsoP = torsoPrims(A, B);
  const torso = field(torsoP);
  const headDef = headPrims(A, B);
  const headF = field(headDef.prims, headDef.cuts);
  const u = A.Hl;

  // Oreilles (sur la tête), attache de la queue : repères nécessaires au rig.
  const ears = [1, -1].map((k) => {
    const p = rayHit(headF, [k * 0.04 * u, 0.05 * u, 0.07 * u], [k * 0.45, 1, -0.25], u);
    const n = sdfNormal(headF, p, 0.004);
    p.addScaledVector(n, -0.012);
    const yAx = V(k * 0.2, 0.74, -0.64).normalize();
    const fwd = V(k * 0.25, 0.81, 0.58);
    const zAx = fwd.addScaledVector(yAx, -fwd.dot(yAx)).normalize();
    const xAx = V().crossVectors(yAx, zAx).normalize();
    const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAx, yAx, zAx));
    return { pos: p, quat };
  });
  const tailRoot = rayHit(torso, [0, yW - 0.14, -0.55 * bk], [0, 0.15, -1], 1).add(V(0, 0, 0.04));
  const R = { ears, tailRoot, tailRaise: 0.35 * B.tailSet }; // rotation positive = queue relevée
  const rig = makeRig(A, R);
  const M = {
    head: restMatrix(rig.head),
    ear: rig.ears.map(restMatrix),
    tail: restMatrix(rig.tail),
  };
  const headInv = M.head.clone().invert();

  // --- Os : poids selon la position au repos (repère du corps).
  const nb = A.neckBase;
  const withers = V(0, yW - 0.02, 0.36 * bk);
  const chest = V(0, yB + 0.28, 0.8 * bk);
  const wl = chest.clone().sub(withers).normalize();
  const neckN = V(0, -wl.z, wl.y); // normale du plan garrot–poitrail, vers l'encolure
  if (neckN.z < 0) neckN.negate();
  const neckDir = A.poll.clone().sub(nb).normalize();
  const throat = A.poll.clone().addScaledVector(neckDir, -0.07);
  const segDist = (p, a, b) => {
    const ab = b.clone().sub(a);
    const t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq()));
    return p.distanceTo(a.clone().addScaledVector(ab, t));
  };
  const bodyWeights = (p) => {
    const w = [];
    const sN = p.clone().sub(withers).dot(neckN);
    const wNeck = smooth(-0.03, 0.3, sN);
    const wHead = wNeck * smooth(-0.03, 0.04, p.clone().sub(throat).dot(neckDir));
    const s = p.x >= 0 ? 1 : -1;
    const li = (front) => LEG_SIDES.findIndex(([f, sd]) => f === front && sd === s);
    // Avant : coude et triceps suivent la jambe.
    const fp = A.frontPivot(s);
    const wF = smooth(yB + 0.2, yB - 0.03, p.y) * (1 - smooth(0.08, 0.2, segDist(p, fp, A.frontKnee(s)))) * smooth(0.02, 0.07, Math.abs(p.x));
    // Arrière : bas de la cuisse, grasset et arrière de la cuisse suivent la jambe.
    const hp = A.hindPivot(s);
    const wH = smooth(yC + 0.05, yB - 0.08, p.y) * (1 - smooth(0.1, 0.28, segDist(p, hp, A.hindKnee(s)))) * smooth(0.02, 0.08, Math.abs(p.x));
    if (wHead > 0) w.push([BONE.head, wHead]);
    if (wNeck - wHead > 0) w.push([BONE.neck, wNeck - wHead]);
    if (wF > 0) w.push([BONE.pivot(li(true)), wF]);
    if (wH > 0) w.push([BONE.pivot(li(false)), wH * 0.9]);
    const rest = Math.max(0, 1 - w.reduce((a, [, x]) => a + x, 0));
    w.push([BONE.body, rest]);
    return w;
  };

  // Occlusion ambiante (plis entre les muscles, sous le ventre, entre les membres). Le tronc et les
  // membres lisent le MÊME champ : pas de bande sombre là où le membre sort du corps.
  const legSecs = LEG_SIDES.map(([front, s]) => legSections(A, B, front, s));
  const legF = legSecs.map((secs) => field(legPrims(secs)));
  const occ = field([...torsoP, ...legSecs.flatMap(legPrims)]);
  // Jonction tronc / membre : le haut du membre (loft) est posé sur l'union douce U du tronc et du membre,
  // un congé lisse qui part du corps (l'avant-bras et la jambe sortent du poitrail et de la cuisse sans
  // arête, sans pointe ni bourrelet). Plus haut, il se glisse sous la peau du tronc. Le tronc prend la
  // normale de U près du membre : même ombrage des deux côtés.
  const zMid = (A.zF + A.zH) / 2;
  const legAt = (p) => (p.z > zMid ? 0 : 2) + (p.x >= 0 ? 0 : 1);
  const KF = 0.06; // taille du congé
  const unionOf = legF.map((lf) => (x, y, z) => smin(torso(x, y, z), lf(x, y, z), KF));
  const seamN = (p, n) => {
    const i = legAt(p);
    const w = 1 - smooth(0.004, 0.045, legF[i](p.x, p.y, p.z));
    if (w <= 0 || p.y > yC) return n;
    return n.clone().lerp(sdfNormal(unionOf[i], p, 0.004), w).normalize();
  };
  /** Pose un sommet du membre sur le congé (ou juste sous la peau du tronc) ; renvoie le poids du tronc. */
  const fillet = (p, n, i) => {
    const tc = torso(p.x, p.y, p.z);
    // Près de la peau du tronc seulement : plus haut (bien dedans), le membre reste caché tel quel.
    const wp = smooth(KF, KF * 0.5, tc) * smooth(-0.035, -0.012, tc);
    if (wp <= 0) return 0;
    const U = unionOf[i];
    // Le long de la normale du membre (pas de saut de côté) : premier point où l'on sort de U.
    let a = -0.01;
    let b = -1;
    for (let t = a; t <= 0.07; t += 0.004) {
      if (U(p.x + n.x * t, p.y + n.y * t, p.z + n.z * t) > 0) { b = t; break; }
      a = t;
    }
    if (b < 0) return 0; // (bien à l'intérieur du corps : caché tel quel)
    for (let k = 0; k < 8; k++) {
      const m = (a + b) / 2;
      if (U(p.x + n.x * m, p.y + n.y * m, p.z + n.z * m) > 0) b = m;
      else a = m;
    }
    const q = p.clone().addScaledVector(n, b);
    const g = sdfNormal(U, q, 0.003);
    // Là où U n'est plus que le tronc, le membre passe juste sous sa peau (caché, sans marche).
    const pure = smooth(KF * 0.45, KF, legF[i](q.x, q.y, q.z) - torso(q.x, q.y, q.z));
    q.addScaledVector(g, -0.009 * pure);
    p.lerp(q, wp);
    n.lerp(g, wp).normalize();
    return wp;
  };
  /** Mélange deux listes de poids d'os. */
  const mixW = (a, b, t) => {
    const m = new Map();
    for (const [k, x] of a) m.set(k, (m.get(k) ?? 0) + x * (1 - t));
    for (const [k, x] of b) m.set(k, (m.get(k) ?? 0) + x * t);
    return [...m];
  };
  const aoAt = (f, p, n) => {
    let o = 0;
    for (const [d, w] of [[0.025, 0.4], [0.06, 0.3], [0.11, 0.2], [0.18, 0.1]]) {
      const v = f(p.x + n.x * d, p.y + n.y * d, p.z + n.z * d);
      o += Math.max(0, d - v) / d * w;
    }
    return Math.max(0, Math.min(1, 1 - o * 1.1));
  };

  const out = new Build();

  // --- Tronc + encolure.
  const tb = boundsOf(torsoP, 0.06);
  const torsoGeo = sdfMesh(torso, tb, high ? 0.04 : 0.06);
  out.add(torsoGeo, new THREE.Matrix4(), (p, n) => {
    const nn = p.y < yB + 0.25 ? seamN(p, n) : n;
    return { part: PART.body, n: nn, ao: aoAt(occ, p, nn), w: bodyWeights(p) };
  });
  out.mark('torso');

  // --- Tête : plus fine, rigide sur l'os de la tête. Peau des naseaux (creux) en peau nue.
  const hb = boundsOf(headDef.prims, 0.03 * u);
  const headGeo = sdfMesh(headF, hb, (high ? 0.03 : 0.05) * u);
  const tmp = V();
  out.add(headGeo, M.head, (p, n) => {
    tmp.copy(p).applyMatrix4(headInv);
    const inNostril = headDef.nostril.some((c) => c.f(tmp.x, tmp.y, tmp.z) < 0.006 * u);
    const nl = n.clone().transformDirection(headInv);
    return { part: inNostril ? PART.skin : PART.head, info: [tmp.x / u, tmp.y / u, tmp.z / u], ao: aoAt(headF, tmp, nl), w: [[BONE.head, 1]] };
  });

  out.mark('head');
  // --- Yeux en amande : grand globe sombre (maillage à part), paupières supérieure et inférieure
  // couvertes de poil, bordées de peau nue sombre.
  const eyeR = 0.026 * Math.sqrt(B.head);
  const eyes = [1, -1].map((k) => {
    const hit = rayHit(headF, [k * 0.05 * u, 0.045 * u, 0.27 * u], [k, 0.12, 0.12], u);
    const n = sdfNormal(headF, hit, 0.003);
    const dir = n.clone().multiplyScalar(0.85).add(V(0, 0.04, 0.16)).normalize();
    const center = hit.clone().addScaledVector(n, -eyeR * 0.36);
    return { center, dir };
  });
  for (const e of eyes) {
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), e.dir);
    for (const [theta, flip, sc] of [[0.33, false, 1.1], [0.26, true, 1.07]]) {
      const lid = new THREE.SphereGeometry(eyeR * sc, high ? 14 : 10, 3, 0, Math.PI * 2, 0, Math.PI * theta);
      const ly = lid.attributes.position;
      const edge = eyeR * sc * Math.cos(Math.PI * theta * 0.8);
      const isEdge = Array.from({ length: ly.count }, (_, j) => ly.getY(j) < edge);
      if (flip) lid.rotateX(Math.PI);
      out.add(lid, M.head.clone().multiply(new THREE.Matrix4().compose(e.center, q, V(1.24, 1, 0.95))), (p, nn, j) => {
        tmp.copy(p).applyMatrix4(headInv);
        return { part: isEdge[j] ? PART.skin : PART.head, info: [tmp.x / u, tmp.y / u, tmp.z / u], ao: 0.8, w: [[BONE.head, 1]] };
      });
    }
  }

  out.mark('eyelids');
  // --- Oreilles en cornet : dos couvert de poil, intérieur en peau sombre bordée de poils.
  const earLen = 0.155 * Math.sqrt(B.head);
  const earProf = [0.55, 1, 0.98, 0.82, 0.55, 0.22, 0.02];
  for (let i = 0; i < 2; i++) {
    const outer = loft(earProf.map((w, j) => {
      const t = j / (earProf.length - 1);
      // ry : côté dos de l'oreille (-z), ryb : côté du cornet (+z, devant).
      return { p: [0, t * earLen, -0.006 * Math.sin(t * Math.PI)], rx: Math.max(0.001, w * 0.043), ry: Math.max(0.001, w * 0.022), ryb: Math.max(0.001, w * 0.008) };
    }), { radial: high ? 12 : 8, sub: high ? 2 : 1 });
    const earInv = M.ear[i].clone().invert();
    out.add(outer, M.ear[i], (p) => {
      const pl = tmp.copy(p).applyMatrix4(earInv);
      return { part: PART.ear, info: [pl.y / earLen, 0, 0], ao: 0.95, w: [[BONE.ear0 + i, 1]] };
    }, true);
    const inner = loft(earProf.slice(0, -1).map((w, j) => {
      const t = j / (earProf.length - 1);
      return { p: [0, t * earLen * 0.94 + 0.006, 0.006], rx: Math.max(0.001, w * 0.032), ry: 0.003, ryb: 0.003 };
    }), { radial: high ? 10 : 6, sub: 1 });
    out.add(inner, M.ear[i], () => ({ part: PART.skin, info: [0, 0, 0], ao: 0.6, w: [[BONE.ear0 + i, 1]] }), true);
  }

  // --- Couard (base charnue de la queue).
  const dock = loft([[0, 0, 0, 0.055], [0, -0.06, -0.055, 0.05], [0, -0.16, -0.085, 0.042], [0, -0.28, -0.09, 0.034]]
    .map(([x, y, z, r]) => ({ p: [x, y, z], rx: r * Math.sqrt(B.girth), ry: r })), { radial: high ? 10 : 8, sub: 2, round: [0, 0.8] });
  out.add(dock, M.tail, () => ({ part: PART.body, ao: 0.9, w: [[BONE.tail, 1]] }), true);

  out.mark('ears+dock');
  // --- Membres et sabots.
  const radial = high ? 10 : 8;
  LEG_SIDES.forEach(([front, s], i) => {
    const zc = front ? A.zF : A.zH;
    const xc = s * (front ? A.xF : A.xH);
    const knee = front ? A.frontKnee(s) : A.hindKnee(s);
    const legGeo = loft(legSecs[i], { radial, sub: high ? 2 : 1, side: [1, 0, 0], capEnd: false });
    const band = 0.035;
    out.add(legGeo, new THREE.Matrix4(), (p, n) => {
      const wk = smooth(knee.y + band, knee.y - band, p.y);
      let w = [[BONE.pivot(i), 1 - wk], [BONE.knee(i), wk]];
      const nn = n.clone();
      // Haut du membre : sur le congé ; sous la peau du tronc, il suit les os du tronc (pas de pointe qui
      // ressort quand la jambe bouge).
      const wt = p.y > 0.75 * E ? fillet(p, nn, i) : 0;
      if (wt > 0) w = mixW(w, bodyWeights(p), wt);
      return { part: PART.leg0 + i, n: nn, info: [p.y / E, i, 0], ao: aoAt(occ, p, nn) * Math.min(1, 0.8 + p.y * 0.3), w };
    }, true);
    const hoofGeo = loft(HOOF.map(([y, z, hw, df, db]) => ({ p: [xc, y * E, zc + z + (front ? 0 : 0.004)], rx: hw * B.bone ** 0.8, ry: df * B.bone ** 0.8, ryb: db * B.bone ** 0.8 })),
      { radial, sub: 1, exp: 2.3, side: [1, 0, 0], capStart: false });
    out.add(hoofGeo, new THREE.Matrix4(), (p) => ({ part: PART.hoof, info: [p.y / E, i, 0], ao: 1, w: [[BONE.knee(i), 1]] }), true);
  });

  out.mark('legs');
  const geometry = out.geometry();
  geometry.userData.shared = true;
  geometry.userData.stats = out.stats;
  const hl = headF;
  const snout = rayHit(hl, [0, -0.07 * u, 0.6 * u], [0, 0, 1], u);
  const L = 1.5 * bk;
  return {
    A, R, geometry, torso, head: hl, headDef, eyes, eyeR,
    dims: { L, R: A.D / 2, hr: 0.105 * Math.sqrt(B.head), legR: 0.036 * B.bone, snoutZ: snout.z, headBack: hb[0][2], earZ: ears[0].pos.z, earY: ears[0].pos.y },
    snoutTip: snout.toArray(),
    bounds: new THREE.Sphere(V(0, yC * 0.8, 0.2), 2.1),
  };
}

const shapeCache = new Map();

/** Géométrie partagée d'un gabarit (sans matière ni os) : pour les tests de la surface. */
export function horseShape(build, high = false) {
  return sculpt(build, high);
}

/**
 * Mesures du cheval au repos (mètres, cheval de taille 1), lues sur la surface sculptée : sert aux
 * tests des proportions (tête ≈ 1/2,5 du corps, garrot ≈ croupe, membres longs, gabarits par race).
 */
export function horseMeasures(build) {
  const A = anatomy(build, 0.85);
  const torso = field(torsoPrims(A, build));
  const hd = headPrims(A, build);
  const head = field(hd.prims, hd.cuts);
  const up = (z) => rayHit(torso, [0, A.yC, z], [0, 1, 0], 1.5).y;
  const down = (z) => rayHit(torso, [0, A.yC, z], [0, -1, 0], 1.5).y;
  const front = rayHit(torso, [0, A.yB + 0.2, 0], [0, 0, 1], 2).z;
  const rear = rayHit(torso, [0, A.yC + 0.04, 0], [0, 0, -1], 2).z;
  const u = A.Hl;
  const muzzle = rayHit(head, [0, -0.07 * u, 0.6 * u], [0, 0, 1], u).z;
  const nape = rayHit(head, [0, 0.03 * u, 0.1 * u], [0, 0, -1], u).z;
  return {
    withers: up(0.38 * A.bk),
    back: up(0),
    croup: up(-0.48 * A.bk),
    belly: down(-0.05 * A.bk),
    chestDepth: up(0.38 * A.bk) - down(0.3 * A.bk),
    length: front - rear,
    width: 2 * rayHit(torso, [0, A.yC, -0.05], [1, 0, 0], 1).x,
    head: muzzle - nape,
    cannon: build.bone * 0.03 * 2,
  };
}

// ------------------------------------------------------------------ crins

/** Rubans de crins colorés et pondérés (os), drapés hors d'un champ de distance. */
class HairBuild {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.col = [];
    this.si = [];
    this.sw = [];
    this.idx = [];
  }

  /**
   * pts : points (repère du corps) ; side : direction de la largeur ; weights(p) → [[os, poids]…] ;
   * out : normale « de volume » (vers l'extérieur de la crinière ou de la queue) pour un éclairage doux.
   */
  strand(pts, w0, w1, side, color, weights, u0 = 0, u1 = 1, out = null) {
    const base = this.pos.length / 3;
    const n = pts.length;
    const tan = V();
    const nrm = V();
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const w = (w0 + (w1 - w0) * t) / 2;
      const p = pts[i];
      tan.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
      nrm.crossVectors(side, tan).normalize();
      if (out) nrm.copy(out);
      const ww = weights(p);
      for (const k of [-1, 1]) {
        this.pos.push(p.x + side.x * w * k, p.y + side.y * w * k, p.z + side.z * w * k);
        this.nrm.push(nrm.x, nrm.y, nrm.z);
        this.uv.push(k < 0 ? u0 : u1, 1 - t);
        this.col.push(color.r, color.g, color.b);
        for (let q = 0; q < 4; q++) {
          this.si.push(ww[q]?.[0] ?? 0);
          this.sw.push(ww[q]?.[1] ?? 0);
        }
      }
      if (i < n - 1) {
        const a = base + i * 2;
        this.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Pousse un point hors d'une surface (champ f) jusqu'à la distance off. */
function pushOut(f, p, off) {
  for (let it = 0; it < 3; it++) {
    const d = f(p.x, p.y, p.z);
    if (d >= off) return p;
    const n = sdfNormal(f, p, 0.004);
    p.addScaledVector(n, off - d + 0.001);
  }
  return p;
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

/** Crinière, toupet, queue et fanons d'un cheval (graine propre : chaque cheval est coiffé à sa façon). */
function buildHair(S, B, look, rig, high) {
  const { A, torso, head: headF } = S;
  const rng = mulberry((look.seed ?? 1) + 5);
  const hair = new HairBuild();
  const maneC = new THREE.Color(look.mane ?? 0x1b1410);
  const l = 0.2126 * maneC.r + 0.7152 * maneC.g + 0.0722 * maneC.b;
  if (l < 0.03) maneC.lerp(new THREE.Color(0x5a5250), 0.12); // crins noirs : on distingue encore les mèches
  const coreC = new THREE.Color(look.maneCore ?? look.mane ?? 0x1b1410);
  const tint = (c, amt = 0.12) => c.clone().multiplyScalar(1 - amt + rng() * amt * 2);
  const side = (look.seed ?? 0) % 2 === 0 ? -1 : 1;
  const style = B.maneStyle;
  const nb = A.neckBase;
  const neckDir = A.poll.clone().sub(nb).normalize();
  const upN = V(0, neckDir.z, -neckDir.y);
  const down = V(0, -1, 0);
  // Poids des mèches de crinière : comme la peau de l'encolure sous elles.
  const withers = V(0, A.yW - 0.02, 0.36 * A.bk);
  const chest = V(0, A.yB + 0.28, 0.8 * A.bk);
  const wl = chest.clone().sub(withers).normalize();
  const neckN = V(0, -wl.z, wl.y);
  if (neckN.z < 0) neckN.negate();
  const throat = A.poll.clone().addScaledVector(neckDir, -0.07);
  const neckW = (p) => {
    const wn = smooth(-0.03, 0.3, p.clone().sub(withers).dot(neckN));
    const wh = wn * smooth(-0.03, 0.04, p.clone().sub(throat).dot(neckDir));
    return [[BONE.neck, wn - wh], [BONE.head, wh], [BONE.body, 1 - wn]].filter(([, x]) => x > 0.001);
  };
  const K = high ? 7 : 5;

  // --- Crinière : mèches qui partent de la crête et retombent d'un côté, drapées sur l'encolure.
  const crestAt = (t) => {
    const c = nb.clone().lerp(A.poll, 0.18 + t * 0.78);
    return rayHit(torso, c.toArray(), upN.toArray(), 0.6);
  };
  const crestDir = (t) => crestAt(Math.min(1, t + 0.02)).sub(crestAt(Math.max(0, t - 0.02))).normalize();
  if (style === 'brush') {
    // Fjord : crinière taillée en brosse, droite, bicolore (cœur foncé, bords crème). Rubans croisés
    // (le long de la crête et en travers) pour qu'elle ait du volume sous tous les angles.
    const n = high ? 64 : 36;
    for (let i = 0; i < n; i++) {
      const t = 0.04 + (i / n) * 0.9;
      const c = crestAt(t);
      const dir = crestDir(t);
      const nrm = sdfNormal(torso, c, 0.005);
      for (const lane of [-2, -1, 0, 1, 2]) {
        const h = (0.075 + 0.03 * Math.sin(t * Math.PI)) * (lane === 0 ? 1.04 : 1 - Math.abs(lane) * 0.06) + rng() * 0.012;
        const lat = V(lane * 0.011, 0, 0);
        const p0 = c.clone().add(lat).addScaledVector(nrm, -0.012);
        const tip = p0.clone().addScaledVector(nrm, h).addScaledVector(lat, 0.5 + rng() * 0.3);
        const pts = [p0, p0.clone().lerp(tip, 0.5), tip];
        const color = lane === 0 ? tint(coreC, 0.08) : tint(maneC, 0.06);
        const side = (i + lane) % 2 === 0 ? dir : V(1, 0, 0);
        hair.strand(pts, 0.028, 0.024, side, color, neckW, rng() * 0.5, 0.5 + rng() * 0.5, nrm.clone().add(V(lane * 0.3, 0, 0)).normalize());
      }
    }
  } else {
    const lenBase = { normal: 0.27, long: 0.42, thick: 0.32, short: 0.12 }[style] ?? 0.27;
    const len = lenBase * B.mane;
    const n = Math.round((high ? 96 : 66) * B.maneN * (style === 'short' ? 0.7 : 1));
    const layers = style === 'thick' || style === 'long' ? 3 : 2;
    for (let L = 0; L < layers; L++) {
      const count = Math.round(n * (L === 0 ? 0.5 : 0.5 / (layers - 1)));
      for (let i = 0; i < count; i++) {
        const t = (i + rng() * 0.8) / count;
        const c = crestAt(t);
        const dir = crestDir(t);
        // Quelques mèches tombent de l'autre côté (surtout près du garrot et chez les baroques).
        const sd = rng() < (style === 'long' ? 0.25 : 0.12) ? -side : side;
        const ll = len * (0.75 + rng() * 0.45) * (0.65 + 0.35 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.85 + 0.35)) * (L === 0 ? 1 : 0.85);
        const pts = [];
        let p = c.clone().addScaledVector(upN, -0.006);
        let d = V(sd * 0.85, 0.35, 0).add(upN.clone().multiplyScalar(0.3)).normalize();
        const step = ll / K;
        const wave = rng() * 6;
        pts.push(p.clone());
        for (let k = 1; k <= K; k++) {
          const f = k / K;
          d = d.clone().lerp(down, Math.min(1, 0.32 + f * 0.5)).normalize();
          p = p.clone().addScaledVector(d, step);
          if (style === 'long' || style === 'thick') p.x += Math.sin(f * 7 + wave) * 0.006 * f;
          pushOut(torso, p, 0.008 + L * 0.006 + f * 0.012);
          pts.push(p);
        }
        const out = sdfNormal(torso, c, 0.006).add(V(sd * 0.9, 0, 0)).normalize();
        const hw = high ? 1 : 1.35; // téléphone : pas d'anticrénelage, mèches un peu plus larges (moins de trous)
        hair.strand(pts, 0.036 * hw, (0.046 + rng() * 0.016) * hw, dir, tint(maneC), neckW, rng() * 0.5, 0.5 + rng() * 0.5, out);
      }
    }
    // Racines sur la crête : la ligne du dessus de l'encolure reste fournie, des deux côtés.
    const nr = high ? 40 : 24;
    for (let i = 0; i < nr; i++) {
      const t = 0.02 + (i / nr) * 0.95;
      const c = crestAt(t);
      const dir = crestDir(t);
      const nrm = sdfNormal(torso, c, 0.005);
      const sd = i % 3 === 0 ? -side : side;
      const h = 0.05 + rng() * 0.03;
      const p0 = c.clone().addScaledVector(nrm, -0.01);
      const p1 = p0.clone().addScaledVector(nrm, h * 0.7).add(V(sd * h * 0.4, 0, 0));
      const p2 = p1.clone().add(V(sd * h * 0.7, -h * 0.5, 0));
      hair.strand([p0, p1, p2], 0.05, 0.045, dir, tint(maneC), neckW, rng() * 0.5, 0.5 + rng() * 0.5, nrm.clone().add(V(sd * 0.6, 0, 0)).normalize());
    }
  }

  // --- Toupet : retombe entre les yeux, le long du chanfrein.
  const u = A.Hl;
  const headM = rig.head.matrixWorld;
  const toBody = (p) => p.clone().applyMatrix4(headM);
  if (style !== 'brush' || true) {
    const n = high ? 16 : 9;
    const flen = (style === 'brush' ? 0.06 : 0.17 * Math.max(0.8, B.mane ** 0.6)) * (style === 'short' ? 0.6 : 1);
    const downL = V(0, -Math.cos(A.headRot), Math.sin(A.headRot)); // le bas du monde, dans le repère de la tête
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1) - 0.5) * 0.11 * u;
      const top = rayHit(headF, [x, 0.03 * u, 0.04 * u], [0, 1, -0.15], u);
      let p = top.clone().add(V(0, -0.004, 0));
      let d = V(x * 2, 0.6, 1).normalize();
      const pts = [toBody(p)];
      const ll = flen * (0.8 + rng() * 0.4);
      for (let k = 1; k <= 4; k++) {
        const f = k / 4;
        d = d.clone().lerp(downL, 0.25 + f * 0.3).normalize();
        p = p.clone().addScaledVector(d, ll / 4);
        p.x += x * 0.25 * f;
        pushOut(headF, p, 0.005 + f * 0.006);
        pts.push(toBody(p));
      }
      const sideV = V(1, 0, 0);
      const out = sdfNormal(headF, top, 0.004).transformDirection(headM);
      hair.strand(pts, 0.026, 0.022, sideV.clone().transformDirection(headM), style === 'brush' ? tint(coreC, 0.05) : tint(maneC), () => [[BONE.head, 1]], rng() * 0.5, 0.5 + rng() * 0.5, out);
    }
  }

  // --- Queue : un faisceau de crins en volume (plus large à mi-hauteur), qui suit le couard puis
  // tombe droit jusqu'aux jarrets. Les rubans tournent autour de l'axe : épaisse sous tous les angles.
  const tailM = rig.tail.matrixWorld;
  const tailInv = tailM.clone().invert();
  const tlen = (A.yW - 0.12) * 0.74 * B.tail;
  const nt = Math.round((high ? 64 : 34) * Math.max(0.8, B.maneN));
  const raise = B.tailSet;
  // Axe de la queue (repère de la queue) : le long du couard, puis vers le bas (un peu en arrière si relevée).
  const axis = (f) => {
    const dockF = Math.min(1, f / 0.22);
    const p = V(0, -0.02 - dockF * 0.26, -0.055 - dockF * 0.04);
    if (f > 0.22) {
      const g = (f - 0.22) / 0.78;
      p.add(V(0, -g * tlen * (1 - raise * 0.25), -0.03 * Math.sin(g * Math.PI * 0.5) - raise * 0.25 * Math.sin(g * Math.PI * 0.6)));
    }
    return p;
  };
  const radius = (f) => (0.03 + 0.07 * Math.sin(Math.min(1, f / 0.55) * Math.PI * 0.5) - 0.025 * Math.max(0, f - 0.7) / 0.3) * Math.sqrt(B.girth) * (0.8 + B.maneN * 0.2);
  for (let i = 0; i < nt; i++) {
    const az = (i / nt) * Math.PI * 2 + rng() * 0.5;
    const f0 = rng() * 0.18; // départ le long du couard
    const fEnd = 0.86 + rng() * 0.14;
    const rr = 0.55 + rng() * 0.5;
    const twist = (rng() - 0.5) * 0.6;
    const pts = [];
    for (let k = 0; k <= K; k++) {
      const f = f0 + (fEnd - f0) * (k / K);
      const a2 = az + twist * f;
      const r = radius(f) * rr;
      const q = axis(f).add(V(Math.cos(a2) * r, 0, Math.sin(a2) * r * 0.75)).applyMatrix4(tailM);
      pushOut(torso, q, 0.015);
      pts.push(q);
    }
    const out = V(Math.cos(az), 0.15, Math.sin(az) * 0.75).normalize();
    const sideV = V(-Math.sin(az), 0, Math.cos(az)).normalize();
    const tw = high ? 1 : 1.3;
    hair.strand(pts, 0.04 * tw, (0.05 + rng() * 0.02) * tw, sideV, tint(maneC, 0.14), (q) => {
      const lp = q.clone().applyMatrix4(tailInv);
      const wt = smooth(-0.12, -0.45, lp.y);
      return [[BONE.tail, 1 - wt], [BONE.tailTip, wt]].filter(([, x]) => x > 0.001);
    }, rng() * 0.4, 0.6 + rng() * 0.4, out);
  }

  // --- Fanons : longs poils sur l'arrière des canons qui couvrent les sabots (traits, Frison, Irish Cob).
  if (B.feathers > 0) {
    const legC = new THREE.Color(look.points || (look.mane && (look.mane & 0xffffff) < 0x303030) ? look.mane : look.coat);
    rig.legs.forEach((leg, i) => {
      const [front, s] = LEG_SIDES[i];
      const kn = front ? A.frontKnee(s) : A.hindKnee(s);
      const zc = front ? A.zF : A.zH;
      const n = Math.round((high ? 14 : 8) * (0.5 + B.feathers * 0.5));
      for (let j = 0; j < n; j++) {
        const a = -Math.PI * 0.95 + (j / (n - 1)) * Math.PI * 1.9; // surtout derrière et sur les côtés
        const dirA = V(Math.sin(a) * 0.9, 0, -Math.cos(a));
        const y0 = (0.2 + B.feathers * 0.14 * (0.6 + 0.4 * Math.cos(a))) * A.E;
        const p0 = V(kn.x, y0, zc + (front ? 0.01 : 0.015)).addScaledVector(dirA, 0.035 * B.bone);
        const pts = [p0];
        const ll = y0 + 0.02;
        for (let k = 1; k <= 4; k++) {
          const f = k / 4;
          pts.push(p0.clone().addScaledVector(dirA, 0.02 * f + 0.03 * f * f).add(V(0, -ll * f, 0)));
        }
        hair.strand(pts, 0.04, 0.055, V(-dirA.z, 0, dirA.x), tint(legC, 0.1), () => [[BONE.knee(i), 1]], rng() * 0.5, 0.5 + rng() * 0.5, dirA);
      }
    });
  }
  return hair.geometry();
}

// ------------------------------------------------------------------ assemblage

/** Ombre de contact douce, partagée. */
let contactTex = null;
function contactShadow(R, L) {
  if (!contactTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,0.75)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    contactTex = new THREE.CanvasTexture(c);
    contactTex.userData.shared = true;
  }
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: contactTex, transparent: true, depthWrite: false, opacity: gfx.quality === 'high' ? 0.5 : 0.65, toneMapped: false,
  }));
  m.scale.set(R * 3.0, 1, L * 1.45);
  m.position.y = 0.015;
  m.renderOrder = -1;
  return m;
}

/**
 * Construit le cheval. look : la robe de l'animal ; breedId : sa race (facultatif : sinon look.breed
 * ou une race devinée d'après la robe). Renvoie la même forme que buildAnimalModel().
 */
export function buildHorseModel(look, breedId = null) {
  const breed = horseBreedOf(look, breedId);
  const B = horseBuild(breed, look);
  const high = gfx.quality === 'high';
  const key = JSON.stringify([B, high]);
  let S = shapeCache.get(key);
  if (!S) {
    S = sculpt(B, high);
    shapeCache.set(key, S);
  }
  const A = { ...S.A, na: look.neckAngle ?? 0.85 };
  const rig = makeRig(A, S.R);
  // Si l'encolure de la robe n'a pas l'angle de référence, la géométrie reste juste : les os sont
  // liés dans la pose de référence, puis l'encolure prend l'angle de la robe.
  const bindRig = A.na === S.A.na ? rig : makeRig(S.A, S.R);
  const skeleton = new THREE.Skeleton(bindRig.bones);
  if (bindRig !== rig) skeleton.bones = rig.bones;

  const coat = new THREE.SkinnedMesh(S.geometry, coatMaterial(look, B, breed));
  coat.bind(skeleton, new THREE.Matrix4());
  coat.castShadow = true;
  coat.receiveShadow = true;
  coat.boundingSphere = S.bounds.clone();
  rig.root.add(coat);

  const hairSway = { value: 0 };
  const hairGeo = buildHair(S, B, look, bindRig, high);
  const hairMesh = new THREE.SkinnedMesh(hairGeo, maneMaterial(hairSway));
  hairMesh.bind(skeleton, new THREE.Matrix4());
  hairMesh.castShadow = true;
  hairMesh.receiveShadow = true;
  hairMesh.boundingSphere = S.bounds.clone();
  rig.root.add(hairMesh);

  // Yeux : globes brillants dans la tête (rigides), un peu enfoncés dans l'orbite, en amande. Les deux
  // yeux forment un seul maillage partagé par les chevaux de même gabarit (un seul appel de rendu) ;
  // le reflet du ciel sur le globe verni donne le regard vif.
  if (!S.eyeGeo) {
    const parts = S.eyes.map((e) => {
      const g = new THREE.SphereGeometry(S.eyeR, high ? 16 : 10, high ? 10 : 7);
      g.applyMatrix4(new THREE.Matrix4().compose(e.center, new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), e.dir), V(1.2, 0.86, 0.9)));
      return g;
    });
    S.eyeGeo = mergeGeometries(parts);
    parts.forEach((g) => g.dispose());
    S.eyeGeo.userData.shared = true;
  }
  const eyes = new THREE.Mesh(S.eyeGeo, eyeMaterial(look.eye ?? 0x2a1a10));
  eyes.castShadow = false;
  rig.head.add(eyes);

  const { L, R } = S.dims;
  rig.root.add(contactShadow(A.W + 0.05, L));
  const backTop = (z) => rayHit(S.torso, [0, A.yC, z], [0, 1, 0], 1.5).y;
  return {
    root: rig.root,
    body: rig.body,
    neck: rig.neck,
    head: rig.head,
    tail: rig.tail,
    tailTip: rig.tailTip,
    ears: rig.ears,
    legs: rig.legs.map((l) => ({ pivot: l.pivot, knee: l.knee, front: l.front, side: l.side })),
    skeleton,
    hairSway,
    y0: A.yC,
    legTop: A.yB + 0.2,
    saddleY: backTop(-L * 0.05),
    headHeight: A.poll.y,
    headTilt: A.headRot - A.na,
    snoutTip: S.snoutTip,
    sdf: { torso: S.torso, head: S.head },
    dims: S.dims,
    backTop,
    build: B,
    horseV3: true,
  };
}
