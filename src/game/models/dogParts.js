// Pièces modelées par le code pour les chiens réalistes (dogReal.js) : ce que les deux modèles d'artistes n'ont pas.
//
// - Oreilles pendantes (labrador, golden, chiens courants, épagneuls, caniche, lévriers aux oreilles en rose…) : les
//   oreilles d'origine (droites du shiba, en bouton du jack) sont rentrées sous la peau du crâne et une vraie oreille
//   prend leur place : une feuille de cuir épaisse aux bords arrondis (section en lentille), attachée au niveau de
//   l'œil, qui retombe contre la joue comme un rideau (elle suit la surface de la tête sans y entrer, puis pend
//   droit sous la mâchoire), frangée (setter, golden, épagneuls) ou frisée (caniche). Liée aux os de la tête et des
//   oreilles : elle bouge avec l'oreille (frémissements, oreilles basses).
//
// Les pièces sont ajoutées à la géométrie du pelage de la race (même matière, même dessin : pas d'appel de dessin en
// plus). Pures fonctions des données de repos, de la géométrie de la race et du gabarit : utilisées par les tests.

import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Port d'oreille remplacé par une oreille modelée (pendante ou en rose). */
export function pendantEars(B) {
  return B.ears === 'floppy' || B.ears === 'long' || B.ears === 'rose' || B.ears === 'drop';
}

/**
 * Oreilles d'origine effacées du crâne (une fois par GLB) : oreilles droites du shiba pour les races aux oreilles
 * modelées, lambeau replié du jack (flap : sa part, repérée par realDogBase) pour les oreilles droites ou modelées.
 * Autour de la racine de chaque oreille, la peau est ramenée sur une surface de crâne interpolée depuis le crâne
 * alentour (rayon depuis le centre de la tête, moyenne pondérée des sommets du crâne loin de la racine, dans un cône
 * autour de la direction du sommet) ; l'oreille elle-même passe quelques millimètres dessous. Seulement abaissés,
 * jamais relevés ; part c (0 → 1) qui s'efface vers le bord de la zone, part e de l'oreille elle-même (sans poil, rendue
 * à la tête). (Rentrer seulement les sommets de l'oreille laissait sa base bombée et des lames de peau tendues entre les
 * deux : cornes sur le crâne du shiba, lambeaux et échardes à la tempe des petits chiens.)
 */
export function earSkullHide(base, flap = null) {
  const coat = base.prims.coat;
  const n = coat.count;
  const W = base.W;
  const L = base.land;
  const I = (nm) => base.index.get(nm) ?? -1;
  const jack = base.kind === 'jack';
  // (tête du jack plus petite que celle du shiba : zone et crâne de référence plus serrés)
  const excl = jack ? 0.03 : 0.042;
  // (jack : tout ce qui dépasse du crâne jusqu'au bout du lambeau replié, qui retombe sur la joue à 8 cm de la racine)
  const z0 = jack ? 0.08 : 0.03;
  const z1 = jack ? 0.105 : 0.05;
  const eyes = ['eyeL', 'eyeR'].map((nm) => base.heads[I(nm)]);
  const headP = base.heads[I('head')];
  const hc = headP.clone().lerp(V(L.midX, L.eyeY, L.eyeZ), 0.35);
  const roots = ['ear1L', 'ear1R'].map((nm) => base.heads[I(nm)]);
  const flapC = [new Map(), new Map()];
  if (flap) flap.forEach((F, s) => { if (F) for (let k = 0; k < F.ids.length; k++) flapC[s].set(F.ids[k], F.c[k]); });
  const p = V();
  // crâne de référence (tête, hors oreilles et lambeaux, loin des racines)
  const skull = [];
  for (let i = 0; i < n; i++) {
    if (W.head[i] < 0.5 || W.ear[i * 2] + W.ear[i * 2 + 1] > 0.01 || flapC[0].has(i) || flapC[1].has(i)) continue;
    p.fromArray(coat.pos, i * 3);
    if (Math.min(p.distanceTo(roots[0]), p.distanceTo(roots[1])) < excl) continue;
    p.sub(hc);
    const r = p.length();
    skull.push([p.x / r, p.y / r, p.z / r, r]);
  }
  // (cône élargi tant qu'il ne contient aucun sommet du crâne : le bout de l'oreille pointe loin de tout crâne)
  const skullR = (d) => {
    for (const lim of [0.8, 0.65, 0.45, 0.2]) {
      let sw = 0;
      let sr = 0;
      for (const q of skull) {
        const c = d.x * q[0] + d.y * q[1] + d.z * q[2];
        if (c < lim) continue;
        const w = (c - lim) ** 2 + 1e-6;
        sw += w;
        sr += w * q[3];
      }
      if (sw > 1e-4) return sr / sw;
    }
    return null;
  };
  return [0, 1].map((s) => {
    const ids = [];
    const cs = [];
    const es = [];
    const hide = [];
    const side = s === 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      p.fromArray(coat.pos, i * 3);
      if (Math.sign(p.x - L.midX) !== side) continue;
      const we = W.ear[i * 2 + s];
      // (part du lambeau franche : à moitié rentré, le bout du lambeau faisait des ailerons à la tempe)
      const fc = smooth(0.05, 0.2, flapC[s].get(i) ?? 0);
      const dr = p.distanceTo(roots[s]);
      // (toute la peau que les os de l'oreille portent un peu : chez le shiba, une bosse de poil derrière l'oreille)
      // (pas les paupières : le tour de l'œil reste)
      // (le lambeau du jack retombe vers l'avant : rien derrière la racine — la nuque n'est pas un lambeau)
      const ne = jack ? smooth(0.018, 0.03, Math.min(p.distanceTo(eyes[0]), p.distanceTo(eyes[1]))) * smooth(roots[s].z - 0.02, roots[s].z - 0.004, p.z) : 1;
      const c = Math.max((1 - smooth(z0, z1, dr)) * ne, smooth(0.0, 0.08, we), fc);
      if (!(c > 0.001) || W.head[i] + W.neck[i] < 0.3) continue;
      p.sub(hc);
      const r = p.length();
      p.multiplyScalar(1 / r);
      const rs = skullR(p);
      if (rs === null) continue;
      // (part de l'oreille : ses os, le lambeau repéré, et pour le jack ce qui dépasse franchement du crâne)
      const e = Math.max(smooth(0.01, 0.25, we), fc, jack ? smooth(0.0015, 0.005, r - rs) * (1 - smooth(z0, z1, dr)) * ne : 0);
      const rt = Math.min(r, rs - 0.0015 - (jack ? 0.003 : 0.0045) * smooth(0.02, 0.5, e));
      if (rt >= r - 1e-5) continue;
      ids.push(i);
      cs.push(c);
      es.push(e);
      hide.push(hc.x + p.x * rt, hc.y + p.y * rt, hc.z + p.z * rt);
    }
    return { ids: Uint32Array.from(ids), c: Float32Array.from(cs), e: Float32Array.from(es), hide: Float32Array.from(hide) };
  });
}

/** Bruit lisse 2D déterministe (franges, frisure). */
function noise2(x, y) {
  const h = (a, b) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * u;
  const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * u;
  return a + (b - a) * v;
}

/**
 * Forme de l'oreille d'une race (repère « taille de tête 1 ») : longueur, largeur, attache (au-dessus et en arrière
 * de l'œil), direction de chute (vers l'avant : boxer ; vers l'arrière : rose), épaisseur, frange, frisure.
 */
export function earShape(B) {
  const kind = B.model;
  const long = B.ears === 'long';
  const rose = B.ears === 'rose';
  // (épaisseur : un cuir doublé de poil, 6 à 8 mm — à 3 à 5 mm, l'oreille vue de face n'était qu'un fil sombre, une anse
  // de seau de chaque côté du crâne ; pli de l'attache bas : relevé de 13 mm, le haut de l'oreille s'écartait du crâne
  // en arceau)
  const S = {
    len: 0.115, width: 0.08, up: 0.058, back: 0.074, fwd: 0.14, thick: 0.0066, fringe: 0, curl: 0, round: 2.2, fold: 0.007,
    rose, set: 0,
  };
  if (long) Object.assign(S, { len: 0.15, width: 0.074, up: 0.05, back: 0.07, fwd: 0.1, round: 4, fold: 0.005, thick: 0.008 });
  if (rose) Object.assign(S, { len: 0.06, width: 0.036, up: 0.05, back: 0.07, fwd: -1, thick: 0.004, round: 1.6, fold: 0.005 });
  if (kind === 'jack') {
    // (jack : tête plus petite que celle du shiba dans le repère du chien, œil plus bas sur le crâne)
    Object.assign(S, { len: S.len * 0.95, width: S.width * 0.92, back: S.back * 0.85 });
  }
  if (B.ears === 'drop') Object.assign(S, { len: 0.072, width: 0.06, up: 0.052, back: 0.058, fwd: 0.55, thick: 0.005, round: 2, fold: 0.007 });
  S.len *= B.earLen ?? 1;
  S.width *= B.earW ?? 1;
  S.up += B.earSet ?? 0;
  S.fringe = clamp((B.feather - 0.6) / 0.5, 0, 1) * (B.earFringe ?? 1);
  // (frangée : oreille plus épaisse, plus large, ondulée — pas une lame raide)
  if (S.fringe > 0) Object.assign(S, { thick: S.thick * (1 + 0.5 * S.fringe), width: S.width * (1 + 0.15 * S.fringe), fold: S.fold * 0.6 });
  // (bouclettes serrées : les boucles sont dans le shader, le relief modelé de l'oreille plus doux — sinon des marches)
  S.curl = B.curly ? (B.ringlets ? 0.5 : 1) : 0;
  // (frisée : oreille épaisse et touffue, sans pli raide à l'attache)
  if (S.curl) Object.assign(S, { thick: S.thick * 1.6, fold: 0.003, width: S.width * 1.1 });
  // (bouclettes serrées — lagotto — : triangle aux bouts arrondis, section bombée en lentille, pas une planche aux faces
  // plates et aux bords en marches)
  if (B.ringlets) Object.assign(S, { round: 2, se: 0.95, lumpy: 1 });
  if (B.puppy) {
    // (oreilles de chiot : plus courtes, mais larges et épaisses, molles — pas une lame fine de chaque côté)
    S.len *= 0.92;
    S.width *= 1.1;
    S.thick *= 1.25;
    S.fringe *= 0.4;
  }
  return S;
}

/** Grille des oreilles modelées : points autour de la section, rangées de l'attache au bout (sommets par oreille :
 * (NV + 1) × NU, plus le bout). */
export const EAR_GRID = { NU: 18, NV: 13 };

/**
 * Oreilles modelées d'une race (voir en tête) dans le repère du chien, après la déformation de la race (D : sortie de
 * deformDog). Place aussi les os des oreilles (base à l'attache, bout au milieu de l'oreille) dans D.heads. Renvoie les
 * attributs à ajouter au pelage ({ pos, nrm, uv, si, sw, rest, part, low, index }) ou null.
 */
export function buildPendantEars(base, D, B) {
  if (!pendantEars(B)) return null;
  const I = (nm) => base.index.get(nm) ?? -1;
  const coat = base.prims.coat;
  const n = coat.count;
  const W = base.W;
  const P = D.pos;
  const L = base.land;
  const headI = I('head');
  const hs = B.head;
  const S = earShape(B);
  const mid = L.midX;
  // Surface de la tête (crâne, joues, encolure ; sans les oreilles cachées) par côté : grille en (y, z).
  const cell = 0.006 * hs;
  const surf = [new Map(), new Map()];
  // (clé numérique de la case : les clés en texte coûtaient le tiers de la fabrication des oreilles)
  const key = (y, z) => Math.round(y / cell) * 4096 + Math.round(z / cell);
  // (tous les sommets du tronc et de la tête : la collerette des joues du shiba est portée par l'encolure et le
  // poitrail — prise seulement sur la tête, l'oreille entrait dans la joue)
  for (let i = 0; i < n; i++) {
    if (W.tail[i] > 0.3 || W.leg[i * 4] + W.leg[i * 4 + 1] + W.leg[i * 4 + 2] + W.leg[i * 4 + 3] > 0.5) continue;
    if (D.hidden ? D.hidden[i] > 0.3 : W.ear[i * 2] + W.ear[i * 2 + 1] > 0.3) continue;
    const x = P[i * 3] - mid;
    const s = x >= 0 ? 0 : 1;
    const k = key(P[i * 3 + 1], P[i * 3 + 2]);
    const m = surf[s];
    const ax = Math.abs(x);
    if (!(m.get(k) >= ax)) m.set(k, ax);
  }
  const surfX = (s, y, z, r = 2) => {
    const m = surf[s];
    const yi = Math.round(y / cell);
    const zi = Math.round(z / cell);
    let best = -1;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      const v = m.get((yi + a) * 4096 + zi + b);
      if (v > best) best = v;
    }
    return best;
  };
  // Grain : un coin de poil du dessus du crâne dans la texture.
  let uv0 = [0.5, 0.5];
  let low0 = 0;
  {
    let by = -Infinity;
    for (let i = 0; i < n; i++) {
      if (W.head[i] < 0.95 || W.ear[i * 2] + W.ear[i * 2 + 1] > 0.01 || Math.abs(coat.pos[i * 3] - mid) > 0.012) continue;
      if (coat.pos[i * 3 + 2] > L.eyeZ - 0.02) continue;
      if (coat.pos[i * 3 + 1] > by) {
        by = coat.pos[i * 3 + 1];
        uv0 = [coat.uv[i * 2], coat.uv[i * 2 + 1]];
        low0 = base.attrs?.cmpLow?.array[i] ?? 0;
      }
    }
  }
  const eyeD = D.heads[I('eyeL')].clone().add(D.heads[I('eyeR')]).multiplyScalar(0.5);
  // (oreille de référence, au repos du modèle d'origine : voir plus bas)
  const eye0 = base.heads[I('eyeL')].clone().add(base.heads[I('eyeR')]).multiplyScalar(0.5);
  const dir0 = V(0, -1, 0.14).normalize();
  const across0 = V(0, -dir0.z, dir0.y);
  const NU = EAR_GRID.NU; // points autour de la section (plaque aux bords roulés)
  // Section : super-ellipse (faces presque plates, bords arrondis et épais comme un cuir roulé — en lentille, le bord
  // s'amincissait en lame et l'oreille se lisait comme une plaque de carton)
  const SE = S.se ?? 2 / 3.2;
  const secU = (k) => {
    const c = Math.cos((k / NU) * Math.PI * 2);
    return 0.5 - 0.5 * Math.sign(c) * Math.abs(c) ** SE;
  };
  const secT = (k) => {
    const sn = Math.sin((k / NU) * Math.PI * 2);
    return Math.sign(sn) * Math.abs(sn) ** SE;
  };
  const NV = EAR_GRID.NV; // rangées de l'attache au bout
  const pos = [];
  const rest = [];
  const uv = [];
  const si = [];
  const sw = [];
  const part = [];
  const index = [];
  const rowV = []; // (par sommet : rangée et côté — pour les normales, plus bas)
  const sideOf = [];
  const starts = [];
  const seed = (B.key.length % 7) * 1.7;
  for (let s = 0; s < 2; s++) {
    const side = s === 0 ? 1 : -1;
    const e1 = I(s === 0 ? 'ear1L' : 'ear1R');
    const e2 = I(s === 0 ? 'ear2L' : 'ear2R');
    if (e1 < 0) continue;
    // Attache (centre du haut de l'oreille), dans le plan du côté de la tête.
    const Ay = eyeD.y + S.up * hs;
    const Az = eyeD.z - S.back * hs;
    const len = S.len * hs;
    const wid = S.width * hs;
    // Direction de chute dans le plan (y, z) : vers le bas, un peu vers l'avant (rose : vers l'arrière et le bas).
    const dir = S.rose ? V(0, -0.45, -1).normalize() : V(0, -1, S.fwd).normalize();
    const across = V(0, -dir.z, dir.y); // (vers l'avant pour une oreille pendante)
    if (across.z < 0) across.negate();
    const start = pos.length / 3;
    starts.push(start);
    // 1. Grille de l'oreille dans le plan du côté de la tête, et surface sur laquelle elle tombe (enveloppe lissée de la
    //    tête : elle ne recopie pas les petites bosses du crâne).
    const Q = [];
    const SX = [];
    for (let r = 0; r <= NV; r++) {
      const v = r / NV;
      const w = wid * 0.5 * Math.pow(Math.max(0, 1 - Math.pow(v, S.round)), 0.5) * (1 - 0.18 * v) + 0.0012;
      const rowQ = [];
      const rowX = [];
      for (let k = 0; k < NU; k++) {
        const u = secU(k); // 0 : bord avant, 1 : bord arrière
        // frange : bord bas ondulé et plus long
        let lv = v;
        if (S.fringe > 0) lv = v * (1 + S.fringe * (0.18 + 0.08 * Math.sin(u * 9 + seed)) * smooth(0.5, 1, v));
        const q = V(0, Ay, Az).addScaledVector(dir, lv * len).addScaledVector(across, (0.5 - u) * 2 * w);
        if (S.rose) q.y += 0.012 * hs * Math.sin(Math.PI * v);
        rowQ.push(q);
        let sx = surfX(s, q.y, q.z, 3);
        if (sx < 0 && r > 0) sx = SX[r - 1][k];
        if (sx < 0) sx = surfX(s, q.y, q.z, 8);
        if (sx < 0) sx = 0.04 * hs;
        rowX.push(sx);
      }
      Q.push(rowQ);
      SX.push(rowX);
    }
    // lissage (voisins sur la section et entre rangées), puis rideau : sous la mâchoire, l'oreille pend droit
    for (let it = 0; it < 3; it++) {
      const prev = SX.map((row) => row.slice());
      for (let r = 0; r <= NV; r++) {
        for (let k = 0; k < NU; k++) {
          const a = prev[r][(k + 1) % NU];
          const b = prev[r][(k + NU - 1) % NU];
          const c = prev[Math.max(0, r - 1)][k];
          const d = prev[Math.min(NV, r + 1)][k];
          SX[r][k] = Math.max(prev[r][k] * 0.4 + (a + b + c + d) * 0.15, prev[r][k] - 0.002 * hs);
        }
      }
    }
    // (bouclettes serrées : la tête sous l'oreille est bosselée de touffes ; suivie rangée par rangée, l'oreille en
    // gardait des marches horizontales — des planches empilées. Lissée le long de l'oreille, un peu écartée.)
    if (S.lumpy) {
      for (let it = 0; it < 8; it++) {
        const prev = SX.map((row) => row.slice());
        for (let r = 0; r <= NV; r++) {
          for (let k = 0; k < NU; k++) SX[r][k] = 0.25 * prev[Math.max(0, r - 1)][k] + 0.5 * prev[r][k] + 0.25 * prev[Math.min(NV, r + 1)][k] + 0.0004 * hs;
        }
      }
    }
    for (let r = 1; r <= NV; r++) for (let k = 0; k < NU; k++) SX[r][k] = Math.max(SX[r][k], SX[r - 1][k] - 0.0035 * hs);
    // 2. Sommets : section en lentille (bords arrondis) posée sur la surface, pli de l'attache, frisure.
    const ring = SX;
    for (let r = 0; r <= NV; r++) {
      const v = r / NV;
      const T = (S.thick + S.fringe * 0.01 * v + S.curl * 0.004) * hs;
      for (let k = 0; k < NU; k++) {
        const u = secU(k);
        const t = secT(k); // + : face externe
        const q = Q[r][k];
        const sx = SX[r][k];
        const lift = S.fold * hs * (1 - smooth(0, 0.4, v)) * (S.rose ? 1 : 1.2);
        // (le haut de l'oreille part de sous la peau : l'attache n'a pas de bord ouvert)
        const tuck = 0.026 * hs * (1 - smooth(0, 0.16, v));
        // (bouclettes serrées : bosses plus larges le long de l'oreille — un bruit tiré rangée par rangée, 13 cases pour
        // 13 rangées, décalait chaque rangée de la suivante : des planches empilées ; les petites boucles sont dans le
        // shader)
        const bump = S.curl && S.lumpy ? ((noise2(u * 2.5 + seed, v * 2.5) - 0.5) * 0.005 + (noise2(u * 5 + seed + 5, v * 4) - 0.5) * 0.002) * hs * (0.5 + 0.5 * Math.abs(t))
          : S.curl ? ((noise2(u * 5 + seed, v * 7) - 0.5) * 0.01 + (noise2(u * 11 + seed, v * 13) - 0.5) * 0.005) * hs * (0.5 + 0.5 * Math.abs(t))
          : S.fringe ? Math.sin(v * 11 + u * 2 + seed) * 0.0022 * hs * S.fringe * smooth(0.25, 0.7, v) : 0;
        const xc = sx + 0.0015 * hs + T + lift - tuck + bump;
        const pX = mid + side * (xc + t * T);
        pos.push(pX, q.y, q.z);
        rowV.push(v);
        sideOf.push(side);
        // repos (modèle d'origine) : une oreille de référence, la même pour toutes les races (ces coordonnées, où la robe
        // est peinte, sont partagées par les races aux oreilles modelées : voir dogReal.js mergedCoatGeo) ; la même
        // pour les deux faces (milieu de l'épaisseur) — sinon la robe peinte d'après le repos (taches du dalmatien)
        // donnait une face noire et l'autre blanche, et un liseré noir tout autour
        const rq = V(0, eye0.y + 0.058, eye0.z - 0.074).addScaledVector(dir0, v * 0.115).addScaledVector(across0, (0.5 - u) * 0.08 * (1 - 0.4 * v));
        rest.push(mid + side * (L.eyeX + 0.035), rq.y, rq.z);
        uv.push(uv0[0] + (u - 0.5) * 0.02, uv0[1] + (v - 0.5) * 0.03);
        // os : tête à l'attache, puis oreille (base), puis bout
        const wh = 1 - smooth(0.0, 0.22, v);
        const w2 = smooth(0.35, 0.85, v) * (1 - wh);
        const w1 = 1 - wh - w2;
        si.push(headI, e1, e2 >= 0 ? e2 : e1, 0);
        sw.push(wh, w1, e2 >= 0 ? w2 : 0, 0);
        if (e2 < 0) sw[sw.length - 3] += w2;
        part.push(1, 0, 1, 0);
      }
    }
    // faces : bandes entre rangées, bout fermé par un éventail
    for (let r = 0; r < NV; r++) {
      for (let k = 0; k < NU; k++) {
        const a = start + r * NU + k;
        const b = start + r * NU + ((k + 1) % NU);
        const c = a + NU;
        const d = b + NU;
        if (side > 0) index.push(a, c, b, b, c, d);
        else index.push(a, b, c, b, d, c);
      }
    }
    // (le haut est dans le crâne ; le bout est fermé)
    const last = start + NV * NU;
    const tipC = pos.length / 3;
    {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let k = 0; k < NU; k++) {
        cx += pos[(last + k) * 3];
        cy += pos[(last + k) * 3 + 1];
        cz += pos[(last + k) * 3 + 2];
      }
      pos.push(cx / NU, cy / NU, cz / NU);
      rowV.push(1);
      sideOf.push(side);
      for (let c = 0; c < 3; c++) rest.push(rest[(last) * 3 + c]);
      uv.push(uv0[0], uv0[1] + 0.015);
      si.push(headI, e1, e2 >= 0 ? e2 : e1, 0);
      sw.push(0, e2 >= 0 ? 0 : 1, e2 >= 0 ? 1 : 0, 0);
      part.push(1, 0, 1, 0);
      for (let k = 0; k < NU; k++) {
        const a = last + k;
        const b = last + ((k + 1) % NU);
        if (side > 0) index.push(a, tipC, b);
        else index.push(a, b, tipC);
      }
    }
    // Os de l'oreille : base à l'attache (contre le crâne), bout au milieu de l'oreille.
    const baseX = ring[0][0];
    D.heads[e1].set(mid + side * baseX, Ay, Az);
    if (e2 >= 0) {
      const m = Math.round(NV * 0.55);
      const q = V(0, Ay, Az).addScaledVector(dir, (m / NV) * len);
      D.heads[e2].set(mid + side * (ring[m][Math.floor(NU / 4)] + 0.006 * hs), q.y, q.z);
    }
  }
  if (!pos.length) return null;
  const count = pos.length / 3;
  // normales lissées
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  const nrm = g.attributes.normal.array;
  g.dispose();
  // Face intérieure éclairée comme la face externe en face d'elle (lambeau mince) : tournée vers la joue et le sol, elle
  // prenait la teinte sombre et verdâtre de la lumière du sol — un liseré sombre au bord et sous le pli de l'attache de
  // l'oreille plate (dogue argentin) ; à l'attache, normale ramenée vers celle du crâne (le pli y faisait un trait
  // sombre).
  for (const st of starts) {
    for (let r = 0; r <= NV; r++) {
      for (let k = 1; k < NU; k++) {
        const t = secT(k);
        if (t >= 0) continue;
        const w = smooth(0, 0.6, -t);
        const a = (st + r * NU + k) * 3;
        const b = (st + r * NU + (NU - k)) * 3;
        for (let c = 0; c < 3; c++) nrm[a + c] += (nrm[b + c] - nrm[a + c]) * w;
      }
    }
  }
  for (let i = 0; i < count; i++) {
    const sd = sideOf[i];
    let nx = nrm[i * 3];
    const wA = 0.5 * (1 - smooth(0, 0.25, rowV[i]));
    nx += (sd - nx) * wA;
    const ny = nrm[i * 3 + 1] * (1 - wA);
    const nz = nrm[i * 3 + 2] * (1 - wA);
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm[i * 3] = nx / l;
    nrm[i * 3 + 1] = ny / l;
    nrm[i * 3 + 2] = nz / l;
  }
  return {
    count,
    pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), uv: Float32Array.from(uv), rest: Float32Array.from(rest),
    si: Uint16Array.from(si), sw: Float32Array.from(sw), part: Float32Array.from(part), low: new Float32Array(count).fill(low0),
    index: Uint32Array.from(index),
  };
}

/**
 * Visage d'une race sur le modèle du shiba (avant les oreilles) : la tête de spitz du modèle — joues en collerette,
 * yeux en amande plissés, commissure relevée en sourire, museau pointu de renard — devient celle d'un chien à
 * oreilles tombantes, d'un lévrier ou d'un chiot. Champs du gabarit (0 → 1) : cheek (joues amincies : la collerette
 * des joues rentrée vers le crâne), mouth (bouche neutre : commissure abaissée), flews (babines : la lèvre du haut
 * retombe par-dessus celle du bas), jowl (bajoues du saint-bernard), skullFlat (crâne plat et large), stop (front
 * marqué au-dessus des yeux), square (museau haut et carré), eyeOpen (paupières ouvertes : œil rond, regard droit).
 * Les zones sont repérées sur la position de repos du modèle d'origine (base.prims.coat.pos, repère du shiba) ; les
 * déplacements sont à l'échelle de la tête de la race. Modifie P (sommets du pelage) ; les os ne bougent pas.
 */
export function faceShape(base, B, P) {
  if (base.kind !== 'shiba') return;
  // (dents et langue rentrées pour toutes les races du shiba, même sans autre retouche du visage : la pointe claire de
  // la langue, prise pour une incisive, dépassait sous la truffe du shiba, de l'akita, du samoyède)
  const cheek = B.cheek ?? 0;
  const mouth = B.mouth ?? 0;
  const flews = B.flews ?? 0;
  const jowl = B.jowl ?? 0;
  const flat = B.skullFlat ?? 0;
  const stop = B.stop ?? 0;
  const square = B.square ?? 0;
  const open = B.eyeOpen ?? 0;
  const coat = base.prims.coat;
  const n = coat.count;
  const R = coat.pos;
  const W = base.W;
  const L = base.land;
  const I = (nm) => base.index.get(nm) ?? -1;
  const jawI = I('jaw');
  const eyes = new Set([I('eyeL'), I('eyeR')]);
  const tongue = new Set([1, 2, 3, 4, 5, 6].map((k) => I('tongue' + k)));
  const hs = B.head;
  const mid = L.midX;
  // dents (bande du haut de la texture) : rentrées derrière la lèvre (une incisive pointait sous la truffe)
  const teeth = (i) => coat.uv[i * 2 + 1] < 0.1 && coat.uv[i * 2] > 0.42 && coat.uv[i * 2] < 0.9;
  const g = (d, r) => Math.exp(-(d * d) / (r * r));
  for (let i = 0; i < n; i++) {
    const wh = W.head[i];
    const x0 = R[i * 3] - mid;
    const y0 = R[i * 3 + 1];
    const z0 = R[i * 3 + 2];
    const ax = Math.abs(x0);
    const sx = x0 >= 0 ? 1 : -1;
    let wj = 0;
    let we = 0;
    for (let k = 0; k < 4; k++) {
      const b = coat.si[i * 4 + k];
      if (b === jawI) wj += coat.sw[i * 4 + k];
      if (eyes.has(b)) we += coat.sw[i * 4 + k];
    }
    let dx = 0;
    let dy = 0;
    let dz = 0;
    // joues : la collerette rentrée vers un crâne de 7 cm de demi-largeur (devant, la face reste)
    if (cheek > 0 && ax > 0.07 && W.ear[i * 2] + W.ear[i * 2 + 1] < 0.05) {
      const zone = smooth(0.2, 0.27, z0) * (1 - smooth(0.36, 0.4, z0)) * smooth(0.44, 0.5, y0) * (1 - smooth(0.64, 0.69, y0));
      dx -= sx * cheek * 0.7 * (ax - 0.07) * zone;
    }
    // crâne plat (et un peu plus large)
    if (flat > 0 && wh > 0.5) {
      const zone = smooth(0.22, 0.27, z0) * (1 - smooth(0.37, 0.4, z0)) * smooth(0.62, 0.66, y0);
      dy -= flat * 0.35 * Math.max(0, y0 - 0.63) * zone;
      dx += sx * flat * 0.08 * ax * zone;
    }
    // front marqué au-dessus des yeux (stop)
    if (stop > 0 && wh > 0.5 && we < 0.05) {
      const d = Math.hypot((ax - 0.022) * 1.2, y0 - 0.612, z0 - 0.383);
      dy += stop * 0.006 * g(d, 0.018);
      dz += stop * 0.004 * g(d, 0.018);
    }
    // paupières ouvertes : le tour de l'œil s'écarte verticalement du centre de l'œil (pas le globe) ; plissées
    // (eyeOpen < 0 : petits yeux enfoncés de l'akita) : il s'en rapproche
    if (open !== 0 && we < 0.3 && wh > 0.5) {
      const dyE = y0 - L.eyeY;
      const d = Math.hypot(ax - L.eyeX, dyE * 0.9, z0 - L.eyeZ);
      if (d < 0.035) {
        const f = g(Math.max(0, d - 0.012), 0.012) * (1 - we / 0.3);
        dy += open * 0.0032 * Math.sign(dyE) * Math.min(1, Math.abs(dyE) / 0.006) * f;
      }
    }
    // bouche neutre : la commissure (au bout du sourire, sous l'œil) abaissée et un peu avancée
    if (mouth > 0 && wh > 0.5) {
      const d = Math.hypot((ax - 0.042) * 1.4, y0 - 0.532, (z0 - 0.398) * 0.9);
      const f = g(d, 0.018);
      dy -= mouth * 0.009 * f;
      dz += mouth * 0.003 * f;
    }
    // babines : la lèvre du haut (pas la mâchoire) descend et s'écarte au-dessus de la lèvre du bas ; bajoues
    if ((flews > 0 || jowl > 0) && wh > 0.5 && wj < 0.5 && ax > 0.012 && we < 0.05) {
      const zf = smooth(0.375, 0.4, z0) * (1 - smooth(0.455, 0.475, z0));
      const yf = smooth(0.505, 0.52, y0) * (1 - smooth(0.545, 0.575, y0));
      const f = zf * yf * smooth(0.012, 0.025, ax) * (1 - wj * 2);
      dy -= (flews * 0.011 + jowl * 0.008) * f;
      dx += sx * (flews * 0.004 + jowl * 0.007) * f;
    }
    // museau haut et carré : les côtés du bas du museau élargis, l'arête un peu relevée
    // (fondus longs et saturation douce : la fenêtre de 3 cm et le plafond net à 4 cm faisaient un cran dans la
    // silhouette de face de l'akita, à la jonction de la joue et du museau)
    if (square > 0 && wh > 0.5 && we < 0.05) {
      const zf = smooth(0.35, 0.43, z0) * (1 - smooth(0.465, 0.495, z0));
      const yf = 1 - smooth(0.535, 0.58, y0);
      dx += sx * square * 0.18 * 0.04 * Math.tanh(ax / 0.04) * zf * yf * (1 - 0.6 * smooth(0.045, 0.08, ax));
      dy += square * 0.003 * zf * smooth(0.55, 0.58, y0) * (1 - smooth(0.015, 0.03, ax));
    }
    if (teeth(i)) {
      dy += 0.0015;
      dz -= 0.004;
    }
    // langue rentrée : toujours un peu (sa pointe claire, couleur du museau, dépassait sous la truffe comme une
    // incisive — shiba, akita, husky, samoyède…), davantage dans un museau court (boxer : la pointe passait dessous)
    {
      let wt = 0;
      for (let k = 0; k < 4; k++) if (tongue.has(coat.si[i * 4 + k])) wt += coat.sw[i * 4 + k];
      if (wt > 0) {
        dz -= wt * (0.012 + 0.035 * Math.max(0, 0.8 - B.snout));
        dy += wt * 0.004;
      }
    }
    if (B.underbite && wj > 0.5 && z0 > 0.43 && y0 < 0.53) dz += B.underbite * 0.005 * smooth(0.43, 0.46, z0);
    if (dx || dy || dz) {
      P[i * 3] += dx * hs;
      P[i * 3 + 1] += dy * hs;
      P[i * 3 + 2] += dz * hs;
    }
  }
}

/**
 * Pompons du caniche (B.pompons) : toupet sur le crâne, bracelets au bas des quatre pattes, pompon au bout de la
 * queue — des boules de poil frisé (sphères bosselées), chacune liée à un seul os (tête, métacarpe, métatarse, bout de
 * la queue). Attribut pom : rayon de la boule ; le shader la ramène à son centre quand la coupe n'est pas « caniche »
 * (cPom, voir setCut). Renvoie les attributs à ajouter au pelage, ou null.
 */
export function buildPompons(base, D, B) {
  // (topknot seul : le toupet du yorkshire, toujours montré — pas d'attribut pom)
  if (!B.pompons && !B.topknot) return null;
  const only = !B.pompons;
  const I = (nm) => base.index.get(nm) ?? -1;
  const coat = base.prims.coat;
  const n = coat.count;
  const W = base.W;
  const P = D.pos;
  const L = base.land;
  const mid = L.midX;
  const hs = B.head;
  // grain : un coin de poil du flanc
  let uv0 = [0.5, 0.5];
  let low0 = 0;
  {
    let best = Infinity;
    const zc = (L.hipZ + L.shZ) / 2;
    const yc = L.topY - 0.05;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(coat.pos[i * 3 + 2] - zc) + Math.abs(coat.pos[i * 3 + 1] - yc) + Math.abs(Math.abs(coat.pos[i * 3] - mid) - L.halfW * 0.8);
      if (d < best) {
        best = d;
        uv0 = [coat.uv[i * 2], coat.uv[i * 2 + 1]];
        low0 = base.attrs?.cmpLow?.array[i] ?? 0;
      }
    }
  }
  const balls = [];
  // toupet : au-dessus du crâne, entre les oreilles, un peu vers l'avant
  {
    const HJ = D.heads[I('head')];
    let top = HJ.clone();
    const eyeZ = (D.heads[I('eyeL')].z + D.heads[I('eyeR')].z) / 2;
    for (let i = 0; i < n; i++) {
      if (W.head[i] < 0.8 || (D.hidden && D.hidden[i] > 0.3) || Math.abs(P[i * 3] - mid) > 0.02) continue;
      if (P[i * 3 + 2] > eyeZ || P[i * 3 + 2] < HJ.z) continue;
      if (P[i * 3 + 1] > top.y) top = V(mid, P[i * 3 + 1], P[i * 3 + 2]);
    }
    const r = (only ? 0.034 * B.topknot : 0.046) * hs;
    // (yorkshire : une petite mèche nouée sur le crâne — plus basse et plus large qu'avant : haute et étroite, elle se
    // dressait comme une corne —, pas une boule posée sur le crâne)
    balls.push({ c: top.clone().add(V(0, r * (only ? 0.55 : 0.35), r * (only ? 0.25 : 0.15))), r, sc: only ? V(0.68, 1.05, 0.78) : V(1.05, 0.85, 1.1), bone: I('head'), part: [0, 0, 1, 0], tuft: only });
  }
  // bracelets : au bas des pattes, au-dessus du pied
  if (!only) for (const [up, low, front] of [['metacarpusL', 'toesL', 1], ['metacarpusR', 'toesR', 1], ['metatarsusL', 'htoesL', 0], ['metatarsusR', 'htoesR', 0]]) {
    const a = D.heads[I(up)];
    const b = D.heads[I(low)];
    if (!a || !b) continue;
    const c = a.clone().lerp(b, front ? 0.45 : 0.55);
    c.y = Math.max(c.y, 0.045);
    const r = 0.034 * Math.sqrt(B.legW || 1);
    balls.push({ c: c.add(V(0, 0.01, 0)), r, sc: V(1, 1.25, 1), bone: I(up), part: [0, 0, 0, 1] });
  }
  // pompon de la queue : au bout
  if (!only) {
    const tb = base.tailBones;
    if (tb.length) {
      const t0 = D.heads[tb[0]];
      let tip = D.heads[tb[tb.length - 1]].clone();
      let bd = -1;
      for (let i = 0; i < n; i++) {
        if (W.tail[i] < 0.6) continue;
        const d = V(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).distanceTo(t0);
        if (d > bd) {
          bd = d;
          tip = V(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
        }
      }
      const last = tb[tb.length - 1];
      balls.push({ c: tip.lerp(D.heads[last], 0.25), r: 0.042, sc: V(1, 1, 1.05), bone: last, part: [0, 1, 0, 0] });
    }
  }
  const NA = 12;
  const NB = 9;
  const pos = [];
  const rest = [];
  const uv = [];
  const si = [];
  const sw = [];
  const part = [];
  const pom = [];
  const index = [];
  const HJ = D.heads[I('head')];
  balls.forEach((bl, j) => {
    const start = pos.length / 3;
    for (let a = 0; a <= NB; a++) {
      const th = (a / NB) * Math.PI;
      for (let k = 0; k < NA; k++) {
        const ph = (k / NA) * Math.PI * 2;
        const d = V(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
        // bosses de frisure (bruit sur la direction), plus douces aux pôles
        const bump = bl.tuft
          // (mèche : effilée vers le haut, en pointes de poil)
          ? (1 - 0.45 * Math.max(0, d.y) ** 1.5) * (1 + 0.22 * (noise2(ph * 3.7 + j, th * 6.1) - 0.5))
          : 1 + 0.13 * (noise2(ph * 1.9 + j * 3.1, th * 2.3 + j) - 0.5) + 0.07 * (noise2(ph * 4.3 + j, th * 5.1) - 0.5);
        const r = bl.r * bump;
        const p = bl.c.clone().add(V(d.x * bl.sc.x, d.y * bl.sc.y, d.z * bl.sc.z).multiplyScalar(r));
        pos.push(p.x, p.y, p.z);
        // repos : autour de la tête d'origine pour le toupet, tel quel ailleurs (robe unie du caniche)
        const rp = bl.part[2] ? p.clone().sub(HJ).multiplyScalar(1 / hs).add(base.heads[I('head')]) : p;
        rest.push(rp.x, rp.y, rp.z);
        uv.push(uv0[0] + (k / NA - 0.5) * 0.03, uv0[1] + (a / NB - 0.5) * 0.03);
        si.push(bl.bone, 0, 0, 0);
        sw.push(1, 0, 0, 0);
        part.push(...bl.part);
        // (distance au centre : le shader y ramène le sommet le long de sa normale, radiale)
        pom.push(p.distanceTo(bl.c));
      }
    }
    for (let a = 0; a < NB; a++) {
      for (let k = 0; k < NA; k++) {
        const p0 = start + a * NA + k;
        const p1 = start + a * NA + ((k + 1) % NA);
        const q0 = p0 + NA;
        const q1 = p1 + NA;
        index.push(p0, p1, q0, p1, q1, q0);
      }
    }
  });
  // (mèches : hauteur jusqu'à leur accroche, négative dans cmpPom — le shader les fait pendre, voir dogCoat.js)
  const hang = only ? new Array(pos.length / 3).fill(0) : null;
  if (only) silkyStrands(base, D, B, { pos, rest, uv, si, sw, part, index, hang });
  const count = pos.length / 3;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  // (pôles : normales vers l'extérieur de la boule, quel que soit le maillage)
  // (normales radiales : boule lisse à l'éclairage, et ramenée exactement à son centre hors de la coupe)
  const nrm = g.attributes.normal.array;
  let o = 0;
  for (const bl of balls) {
    for (let a = 0; a <= NB; a++) {
      for (let k = 0; k < NA; k++, o++) {
        const v = V(pos[o * 3], pos[o * 3 + 1], pos[o * 3 + 2]).sub(bl.c).normalize();
        nrm[o * 3] = v.x;
        nrm[o * 3 + 1] = v.y;
        nrm[o * 3 + 2] = v.z;
      }
    }
  }
  g.dispose();
  return {
    count,
    pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), uv: Float32Array.from(uv), rest: Float32Array.from(rest),
    si: Uint16Array.from(si), sw: Float32Array.from(sw), part: Float32Array.from(part), low: new Float32Array(count).fill(low0),
    pom: only ? (hang.some((h) => h < 0) ? Float32Array.from(hang) : null) : Float32Array.from(pom), index: Uint32Array.from(index),
  };
}

/** Nombre de mèches de la robe soyeuse (voir silkyStrands) : par côté du tronc, et de la barbe. */
export const SILK_SIDE = 34;
export const SILK_BEARD = 20;
const SILK_ROWS = 6;

/**
 * Robe soyeuse du yorkshire (pièces du modèle du jack, avec son toupet) : une jupe de longues mèches qui tombent de
 * chaque flanc presque jusqu'au sol (la raie du dos au-dessus), et une barbe de mèches sous le museau. Chaque mèche est
 * un ruban en toit (trois sommets de large, bord au vent vers l'extérieur) accroché à un sommet de la peau : elle en
 * prend les poids (elle suit le tronc, les épaules et les hanches), sa couleur (repos et grain : celle du flanc, qui
 * glisse vers celle du ventre au bout des mèches). Les sommets d'accroche sont choisis sur le modèle d'origine (même
 * disposition pour toutes les races du modèle, voir partLayout), les mèches posées sur la peau de la race (D).
 * (Sans elles, un poil ras, une silhouette de terrier australien.)
 */
function silkyStrands(base, D, B, out) {
  const coat = base.prims.coat;
  const n = coat.count;
  const R = coat.pos;
  const P = D.pos;
  const part = base.part;
  const L = base.land;
  const mid = L.midX;
  const hs = B.head ?? 1;
  // Sommet d'accroche le plus proche d'une cible sur le modèle d'origine, parmi ceux qui conviennent.
  const nearest = (ok, tx, ty, tz) => {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      if (!ok(i)) continue;
      const d = (R[i * 3] - tx) ** 2 + (R[i * 3 + 1] - ty) ** 2 + (R[i * 3 + 2] - tz) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return Math.max(0, best);
  };
  const trunk = (i) => part[i * 4] < 0.05 && part[i * 4 + 1] < 0.1 && part[i * 4 + 2] < 0.1 && part[i * 4 + 3] < 0.3;
  const headOk = (i) => part[i * 4] < 0.05 && base.W.head[i] > 0.8;
  const noise = (k) => {
    const s = Math.sin(k * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  // (poids d'une mèche du flanc : ceux du sommet d'accroche sans les membres — liée aussi aux épaules et aux cuisses,
  // elle se cassait au pas avec la patte)
  const spine = base.index.get('spine2') ?? base.index.get('root') ?? 0;
  const weights = (ai, trunkOnly) => {
    let list = [];
    for (let q = 0; q < 4; q++) {
      const b = coat.si[ai * 4 + q];
      const w = coat.sw[ai * 4 + q];
      if (w > 0 && !(trunkOnly && base.boneW[b].leg >= 0)) list.push([b, w]);
    }
    if (!list.length) list = [[spine, 1]];
    const tot = list.reduce((a, x) => a + x[1], 0);
    return [0, 1, 2, 3].map((q) => (list[q] ? [list[q][0], list[q][1] / tot] : [0, 0]));
  };
  // (mèche : de la peau P0 jusqu'au point bas, un ruban de largeur w qui s'effile en pointe, écarté vers l'extérieur ox
  // du côté s, qui glisse de oz le long du corps ; faces tournées vers l'extérieur ; couleur du repos rTop au repos
  // rLow vers le bout)
  const strand = (ai, P0, bottom, w, ox, oz, s, rTop, rLow, trunkOnly) => {
    const start = out.pos.length / 3;
    const wts = weights(ai, trunkOnly);
    // (bout en pointe douce : les bords remontent au dernier rang et la mèche se resserre de moitié — coupée au carré,
    // la jupe faisait des lanières plates ; effilée à rien, des piques sombres entre lesquelles on voyait les pattes)
    const rise = (P0.y - bottom) / (SILK_ROWS - 1) * (0.25 + 0.4 * ((ai * 0.618) % 1));
    for (let r = 0; r < SILK_ROWS; r++) {
      const t = r / (SILK_ROWS - 1);
      const flare = ox * (0.35 * t + 0.65 * t * t);
      for (let c = -1; c <= 1; c++) {
        const y = P0.y + (bottom - P0.y) * t + (c === 0 ? 0 : rise * t * t * t);
        const wz = (w / 2) * (1 - 0.5 * t * t) * c;
        out.pos.push(P0.x + s * (flare + (c === 0 ? 0.003 * hs : 0)), y, P0.z + oz * t + wz);
        out.hang.push(-(P0.y - y) - 1e-4);
        const rp = rTop.clone().lerp(rLow, smooth(0.6, 1, t) * 0.45);
        out.rest.push(rp.x, rp.y, rp.z);
        out.uv.push(coat.uv[ai * 2] + c * 0.004, coat.uv[ai * 2 + 1] + t * 0.01);
        for (const [b, wq] of wts) {
          out.si.push(b);
          out.sw.push(wq);
        }
        out.part.push(0, 0, 0, 0);
      }
    }
    for (let r = 0; r < SILK_ROWS - 1; r++) {
      for (let c = 0; c < 2; c++) {
        const a = start + r * 3 + c;
        const b = a + 1;
        const d = a + 3;
        const e = d + 1;
        if (s > 0) out.index.push(a, b, d, b, e, d);
        else out.index.push(a, d, b, b, d, e);
      }
    }
  };
  // Jupe : de derrière le coude à la hanche, accrochée au haut du flanc (sous la raie du dos), en deux rangs qui se
  // chevauchent (un sur deux un peu plus haut et plus écarté).
  const z0 = L.shZ - 0.015;
  const z1 = L.hipZ + 0.005;
  const H0 = L.topY - L.bellyY;
  const yBlue = L.bellyY + 0.82 * H0;
  const yLow = L.bellyY + 0.05 * H0;
  const fur = Math.max(0.006, B.fur ?? 0);
  for (const s of [1, -1]) {
    for (let j = 0; j < SILK_SIDE; j++) {
      const u = j / (SILK_SIDE - 1);
      const tz = z0 + (z1 - z0) * u;
      const odd = j % 2;
      const ai = nearest((i) => trunk(i) && s * (R[i * 3] - mid) > L.halfW * 0.5, mid + s * L.halfW, L.bellyY + (odd ? 0.8 : 0.68) * H0, tz);
      // (le haut de la mèche rentré d'un centimètre dans le poil : pas de bord net à l'accroche)
      const P0 = V(P[ai * 3] - s * 0.01 * hs, P[ai * 3 + 1], P[ai * 3 + 2]);
      const k = (s > 0 ? 0 : 100) + j;
      // (bout des mèches : de 1 à 4 cm du sol, inégal ; jamais plus haut que la mi-hauteur de la mèche)
      const bottom = Math.min(P0.y * 0.5, (0.012 + 0.028 * noise(k)) * hs);
      const w = ((z0 - z1) / (SILK_SIDE - 1)) * 3.4;
      const ox = (0.006 + fur * 0.25) * (odd ? 1.25 : 0.9) * (0.85 + 0.3 * noise(k + 50));
      const rx = R[ai * 3];
      const rz = R[ai * 3 + 2];
      strand(ai, P0, bottom, w, ox, -0.006 * u + 0.004 * (noise(k + 70) - 0.5), s, V(rx, yBlue, rz), V(rx, yLow, rz), true);
    }
  }
  // Barbe et moustache : le long de la lèvre, de la truffe à la joue, des mèches qui tombent sous le menton.
  {
    const nose = L.nose;
    const half = SILK_BEARD / 2;
    for (let j = 0; j < SILK_BEARD; j++) {
      const s = j % 2 ? -1 : 1;
      const q = Math.floor(j / 2) / Math.max(1, half - 1);
      const tx = mid + s * (0.01 + 0.02 * q);
      const ty = nose.y - 0.022 - 0.012 * q;
      const tz = nose.z - 0.012 - 0.045 * q;
      const ai = nearest((i) => headOk(i) && s * (R[i * 3] - mid) > 0.003 && R[i * 3 + 2] < nose.z - 0.004, tx, ty, tz);
      const P0 = V(P[ai * 3], P[ai * 3 + 1], P[ai * 3 + 2]);
      const k = 300 + j;
      // (mèches de 3 cm de longueurs inégales : larges de 5 cm, elles faisaient deux planchettes sous le museau)
      const len = (0.028 + 0.026 * noise(k)) * hs;
      const r0 = V(R[ai * 3], R[ai * 3 + 1], R[ai * 3 + 2]);
      strand(ai, P0, P0.y - len, (0.026 + 0.01 * noise(k + 9)) * hs, 0.012 * hs, -0.01 * hs * q, s, r0, r0.clone().add(V(0, -0.02, 0)), false);
    }
  }
}

/** Pièces modelées mises bout à bout (mêmes attributs ; pom à 0 pour celles qui n'en ont pas). */
export function joinParts(parts) {
  const list = parts.filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1 && !list[0].pom) return list[0];
  const count = list.reduce((s, p) => s + p.count, 0);
  const cat = (key, k, T) => {
    const out = new T(count * k);
    let o = 0;
    for (const p of list) {
      if (p[key]) out.set(p[key], o * k);
      o += p.count;
    }
    return out;
  };
  const index = [];
  let o = 0;
  for (const p of list) {
    for (const i of p.index) index.push(i + o);
    o += p.count;
  }
  return {
    count, pos: cat('pos', 3, Float32Array), nrm: cat('nrm', 3, Float32Array), uv: cat('uv', 2, Float32Array),
    rest: cat('rest', 3, Float32Array), si: cat('si', 4, Uint16Array), sw: cat('sw', 4, Float32Array),
    part: cat('part', 4, Float32Array), low: cat('low', 1, Float32Array),
    pom: list.some((p) => p.pom) ? cat('pom', 1, Float32Array) : null, index: Uint32Array.from(index),
  };
}

/**
 * Gueule du jack fermée au repos (modèle sans os de mâchoire, sculpté la gueule entrouverte : une fente aux lèvres
 * rouges et une rangée de dents sur les dix petites races) : la mâchoire du bas — ce qui est sous la ligne des lèvres,
 * devant la commissure — est tournée vers le haut autour d'une charnière derrière la commissure, avant toute
 * déformation de la race (P : positions de repos). Repères mesurés sur le maillage d'origine.
 */
export function jackMouthClose(base, P) {
  if (base.kind !== 'jack') return;
  const coat = base.prims.coat;
  const W = base.W;
  const mid = base.land.midX;
  const hy = 0.482;
  const hz = 0.335;
  const ang = 0.17;
  const cs = Math.cos(ang);
  const sn = Math.sin(ang);
  for (let i = 0; i < coat.count; i++) {
    if (W.head[i] < 0.5) continue;
    const x = P[i * 3] - mid;
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    if (z < hz - 0.01 || Math.abs(x) > 0.065 || y > 0.5) continue;
    // ligne des lèvres (montant un peu vers l'avant), commissure à z ≈ 0,345
    const yM = 0.479 + (z - 0.37) * 0.25;
    const w = (1 - smooth(yM - 0.006, yM + 0.002, y)) * smooth(hz - 0.005, hz + 0.02, z) * (1 - smooth(0.05, 0.065, Math.abs(x)));
    if (!(w > 0)) continue;
    const dy = y - hy;
    const dz = z - hz;
    const ny = hy + dy * cs + dz * sn;
    const nz = hz + dz * cs - dy * sn;
    P[i * 3 + 1] = y + (ny - y) * w;
    P[i * 3 + 2] = z + (nz - z) * w;
  }
}
