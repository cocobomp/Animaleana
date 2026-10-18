// Navigation simple autour des enclos : pour entrer ou sortir, on passe par la barrière ouverte.
// Sert au joueur (toucher pour aller quelque part) et aux grands animaux.

import * as THREE from 'three';

// side : côté de l'ouverture ('+x', '-x', '+z', '-z'), at : position de l'ouverture le long de ce côté.
export const ENCLOSURES = [
  // (place et taille par défaut ; coreLayout.js applique celles choisies par le joueur)
  { id: 'pen', x: 14, z: 35, hw: 12, hd: 8, gate: { side: '+z', at: 14, width: 4 } },
  { id: 'paddock', x: -16, z: 20, hw: 11, hd: 13, gate: { side: '+x', at: 20, width: 3 } },
  // Enclos grillagé des lapins : même les petits animaux passent par la porte.
  { id: 'hutch', x: 9, z: 4.5, hw: 3, hd: 2.5, gate: { side: '+z', at: 9, width: 1.2 }, mesh: true },
];

export const enclosure = (id) => ENCLOSURES.find((e) => e.id === id);

// Enclos construits par le joueur (src/game/Structures.js) : ajoutés après les enclos de base.
let BASE_ENCLOSURES = ENCLOSURES.length;
/**
 * Enclos de base présent dans tous les lieux mais déclaré ailleurs (ex. le terrain de concours,
 * src/game/showground.js). Il survit à setBuiltEnclosures(), contrairement à un simple push.
 */
export function addBaseEnclosure(e) {
  if (ENCLOSURES.some((x) => x.id === e.id)) return;
  ENCLOSURES.splice(BASE_ENCLOSURES, 0, e);
  BASE_ENCLOSURES += 1;
}
// obstacles : bâtiments construits (grange, niche…) dont on fait aussi le tour.
const OBSTACLES = [];
// Bâtiments fixes du lieu (sellerie, maison des animaux, refuge…), donnés par World.build : on ne les
// contourne pas, mais detour() n'y choisit jamais un coin (on ne fait pas le tour d'un enclos par un mur).
const BLOCKERS = [];
export function setNavBlockers(list) {
  BLOCKERS.length = 0;
  BLOCKERS.push(...list);
}
export function setBuiltEnclosures(list, obstacles = []) {
  // Les bâtiments où l'on entre (src/game/Interiors.js) restent connus : seuls les enclos construits sont remplacés.
  const interiors = ENCLOSURES.slice(BASE_ENCLOSURES).filter((e) => e.interior);
  ENCLOSURES.length = BASE_ENCLOSURES;
  ENCLOSURES.push(...interiors, ...list);
  OBSTACLES.length = 0;
  OBSTACLES.push(...obstacles);
}

export function inside(e, x, z, margin = 0) {
  return Math.abs(x - e.x) < e.hw - margin && Math.abs(z - e.z) < e.hd - margin;
}

/** Repères d'un enclos dans son propre repère : n = vers l'ouverture, t = le long de ce côté. */
function frame(e) {
  const alongX = e.gate.side.endsWith('x');
  const sign = e.gate.side[0] === '+' ? 1 : -1;
  const n = alongX ? new THREE.Vector3(sign, 0, 0) : new THREE.Vector3(0, 0, sign);
  const t = alongX ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const extN = alongX ? e.hw : e.hd;
  const extT = alongX ? e.hd : e.hw;
  const centerT = alongX ? e.z : e.x;
  const gateLat = e.gate.at - centerT;
  return { n, t, extN, extT, gateLat };
}

const out = new THREE.Vector3();

/**
 * Navigation à l'intérieur des bâtiments (src/game/Interiors.js) : chaque fonction renvoie
 * un point de passage, ou null si elle n'a rien à dire. Elles passent avant les enclos.
 */
export const NAV_HOOKS = [];

/** Prochain point de passage pour aller de pos à goal sans traverser de clôture. */
export function navTarget(pos, goal, small = false) {
  for (const hook of NAV_HOOKS) {
    const w = hook(pos, goal);
    if (w) return w;
  }
  // Les petits animaux passent sous les barrières en bois (pas sous le grillage, ni à travers les murs).
  const list = small ? ENCLOSURES.filter((e) => e.mesh || e.interior) : ENCLOSURES;
  return detour(pos, gateStep(pos, goal, list), 0, small ? list : [...list, ...OBSTACLES]);
}

// Avec plusieurs enclos (constructions du joueur) : si le chemin vers le point de passage
// traverse un autre enclos, on passe d'abord par le coin le plus pratique de cet enclos.
const out2 = new THREE.Vector3();

/** Le segment a→b coupe-t-il le rectangle r (agrandi de m) ? */
function crosses(a, b, r, m) {
  let t0 = 0;
  let t1 = 1;
  const d = [b.x - a.x, b.z - a.z];
  const p = [a.x - r.x, a.z - r.z];
  const ext = [r.hw + m, r.hd + m];
  for (let i = 0; i < 2; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (Math.abs(p[i]) > ext[i]) return false;
    } else {
      let ta = (-ext[i] - p[i]) / d[i];
      let tb = (ext[i] - p[i]) / d[i];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/**
 * Le chemin tout droit de a à b traverse-t-il une barrière (enclos, sauf les bâtiments où l'on entre)
 * ou un bâtiment construit ? margin : marge autour (rayon de l'animal et un peu d'air).
 */
export function pathBlocked(a, b, margin = 0.8) {
  for (const e of ENCLOSURES) if (!e.interior && crosses(a, b, e, margin)) return true;
  for (const o of OBSTACLES) if (crosses(a, b, o, margin)) return true;
  return false;
}

/** Écart (m) entre deux rectangles : 0 s'ils se touchent ou se chevauchent. */
const gapBetween = (a, b) => Math.max(Math.abs(a.x - b.x) - a.hw - b.hw, Math.abs(a.z - b.z) - a.hd - b.hd, 0);

/** La bande entre deux rectangles proches (la fente qui les sépare). */
function between(a, b) {
  const iv = (a0, a1, b0, b1) => {
    const lo = Math.max(a0, b0);
    const hi = Math.min(a1, b1);
    return lo <= hi ? [lo, hi] : [hi, lo];
  };
  const [x0, x1] = iv(a.x - a.hw, a.x + a.hw, b.x - b.hw, b.x + b.hw);
  const [z0, z1] = iv(a.z - a.hd, a.z + a.hd, b.z - b.hd, b.z + b.hd);
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2 };
}

/**
 * Ce coin de contournement de best est-il pris (depuis pos) ? Dans un bâtiment (où l'on entre, construit
 * ou fixe), avec la place d'un cheval autour, ou dans un autre enclos. Ou derrière un obstacle presque
 * collé à best : les deux font un seul mur, on ne passe pas par la fente entre eux (un paddock réduit ou
 * déplacé contre l'écurie : le cheval restait coincé dans la fente).
 */
function cornerBlocked(c, best, list, pos) {
  const R = 0.9;
  const walled = (e, m) => {
    if (Math.abs(c.x - e.x) < e.hw + m && Math.abs(c.z - e.z) < e.hd + m) return true;
    if (gapBetween(e, best) >= 2 || inside(e, pos.x, pos.z)) return false;
    const slit = between(e, best);
    return crosses(pos, c, e, 0.3) || (!inside(slit, pos.x, pos.z, -0.6) && crosses(pos, c, slit, 0.6));
  };
  for (const e of list) {
    if (e !== best && walled(e, e.gate && !e.interior ? 0 : R)) return true; // (enclos : seulement dedans)
  }
  return BLOCKERS.some((b) => walled(b, 0.3)); // (bâtiments fixes : seulement dedans ou contre le mur)
}

// Coins d'un rectangle dans l'ordre du tour : deux coins qui se suivent partagent un côté.
const CYCLE = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

function detour(pos, wp, depth, list) {
  let best = null;
  let bestD = Infinity;
  for (const e of list) {
    if (inside(e, pos.x, pos.z) || inside(e, wp.x, wp.z) || !crosses(pos, wp, e, 0.8)) continue;
    const d = Math.hypot(e.x - pos.x, e.z - pos.z);
    if (d >= bestD) continue;
    bestD = d;
    best = e;
  }
  if (!best) return wp;
  // Le coin (un peu à l'extérieur) qui fait le moins de détour. Coins dans l'ordre du tour (deux voisins
  // se suivent) : pour un coin d'où l'on ne voit pas encore le but, on compte le vrai chemin, de coin en coin
  // le long du rectangle jusqu'à un coin d'où on le voit. Avant, on prenait « le coin le plus proche du but » :
  // contre l'écurie, côté terrain de concours, c'était un cul-de-sac (le coin suivant est dans le paddock) ;
  // arrivé à moins d'1 m, on visait l'autre coin, on s'en éloignait, et le cul-de-sac redevenait le meilleur :
  // l'avatar tournait en rond au coin de l'écurie, sans fin.
  const pts = CYCLE.map(([sx, sz]) => ({ x: best.x + sx * (best.hw + 2.2), z: best.z + sz * (best.hd + 2.2) }));
  const blocked = pts.map((c) => cornerBlocked(c, best, list, pos)); // (pas dans un mur, ni par une fente)
  const sees = pts.map((c) => !crosses(c, wp, best, -0.3));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const around = (i) => {
    if (sees[i]) return dist(pts[i], wp);
    let length = Infinity;
    for (const dir of [1, 3]) {
      let acc = 0;
      for (let j = i, n = 0; n < 3; n++) {
        const k = (j + dir) % 4;
        if (blocked[k]) break;
        acc += dist(pts[j], pts[k]);
        j = k;
        if (sees[j]) {
          length = Math.min(length, acc + dist(pts[j], wp));
          break;
        }
      }
    }
    return length;
  };
  let corner = null;
  let cost = Infinity;
  pts.forEach((c, i) => {
    const toC = dist(c, pos);
    if (toC < 1 || blocked[i] || crosses(pos, c, best, -0.3)) return;
    // Un coin d'où l'on voit déjà le but vaut mieux qu'un coin d'où il faudra encore tourner. Sans chemin
    // connu (tous les coins suivants pris), le coin le plus proche du but (pour ne pas hésiter entre deux coins).
    const rest = around(i);
    const k = rest < Infinity ? toC + rest : 1e6 + dist(wp, c) + toC * 0.1;
    if (k < cost) {
      cost = k;
      corner = c;
    }
  });
  if (!corner) return wp;
  // Le chemin vers ce coin peut lui-même passer par un autre enclos.
  if (depth < 2) {
    const next = detour(pos, corner, depth + 1, list);
    if (next !== corner) return next;
  }
  return out2.set(corner.x, 0, corner.z);
}

function gateStep(pos, goal, list) {
  // D'abord sortir de l'enclos où l'on est (par l'ouverture), puis entrer dans celui du but.
  const from = list.find((e) => inside(e, pos.x, pos.z) && !inside(e, goal.x, goal.z));
  const to = from ? null : list.find((e) => !inside(e, pos.x, pos.z) && inside(e, goal.x, goal.z));
  const e = from ?? to;
  if (!e) return goal;
  const { n, t, extN, gateLat } = frame(e);
  const rel = new THREE.Vector3(pos.x - e.x, 0, pos.z - e.z);
  const dN = rel.dot(n);
  const dT = rel.dot(t);
  const center = new THREE.Vector3(e.x, 0, e.z);
  const gateIn = center.clone().addScaledVector(n, extN - 2.5).addScaledVector(t, gateLat);
  const gateOut = center.clone().addScaledVector(n, extN + 2.5).addScaledVector(t, gateLat);
  const corridor = Math.abs(dT - gateLat) < e.gate.width / 2 + 0.6 && dN > extN - 3 && dN < extN + 3;
  if (from) return out.copy(corridor ? gateOut : gateIn);
  // Pour entrer : devant l'ouverture, puis dedans (detour() fait le tour de l'enclos si besoin).
  return out.copy(corridor ? gateIn : gateOut);
}

/** Barrières de l'enclos sous forme de murs fins (avec l'ouverture). */
export function fenceColliders(e) {
  const { n, t, extN, extT, gateLat } = frame(e);
  const walls = [];
  const center = new THREE.Vector3(e.x, 0, e.z);
  const seg = (a, b) => {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    walls.push({ x: mid.x, z: mid.z, hw: Math.max(0.12, Math.abs(a.x - b.x) / 2), hd: Math.max(0.12, Math.abs(a.z - b.z) / 2), fence: !e.mesh, wire: !!e.mesh });
  };
  const corner = (sn, st) => center.clone().addScaledVector(n, sn * extN).addScaledVector(t, st * extT);
  seg(corner(-1, -1), corner(-1, 1)); // fond
  seg(corner(-1, -1), corner(1, -1)); // côtés
  seg(corner(-1, 1), corner(1, 1));
  const g1 = center.clone().addScaledVector(n, extN).addScaledVector(t, gateLat - e.gate.width / 2);
  const g2 = center.clone().addScaledVector(n, extN).addScaledVector(t, gateLat + e.gate.width / 2);
  seg(corner(1, -1), g1);
  seg(g2, corner(1, 1));
  return walls;
}
