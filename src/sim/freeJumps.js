// ⤴️ Sauter en balade : des troncs d'arbre couchés le long du chemin de balade (src/sim/activities.js TRAIL), à la
// ferme. Au galop, bien droit, on touche « ⤴️ Sauter » (ou Espace) au bon moment, à environ 1,8 m du tronc : un beau
// saut ; sinon, lancé au galop, le cheval saute tout seul au dernier moment (moins bien). Au trot, il l'enjambe d'un
// petit bond. Logique pure (tests/freeJumps.test.js) ; le jeu : src/game/FreeJumps.js.

import { TRAIL, approach, alignment, takeoffQuality, refusalChance } from './activities.js';

export const LOG = {
  height: 0.45, // (un petit tronc : ça passe pour tous les chevaux)
  width: 2.8, // (sa longueur : le couloir où l'on saute)
  minSpeed: 3, // (au galop seulement)
  minAlign: 0.5, // (assez droit)
  near: 12, // (à moins de 12 m devant : le bouton apparaît)
  early: -3.6, // (on peut appeler entre 3,6 m…)
  late: -0.4, // (… et 0,4 m avant le tronc)
  auto: -0.6, // (rien touché : il saute tout seul ici)
  autoTiming: 0.35,
  stepSpeed: 0.9, // (au trot, ou au pas allongé : il l'enjambe d'un petit bond)
};

/** Les troncs : au milieu d'un tronçon de balade sur deux, couchés en travers du chemin. */
export function logSpots(trail = TRAIL) {
  const pts = [trail.start, ...trail.checkpoints];
  const out = [];
  for (let i = 1; i + 1 < pts.length; i += 2) {
    const a = pts[i];
    const b = pts[i + 1];
    const k = 0.45 + 0.1 * (i % 3); // (pas toujours au milieu)
    out.push({ id: `log${i}`, x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, heading: Math.atan2(b.x - a.x, b.z - a.z), height: LOG.height, width: LOG.width });
  }
  return out;
}

/** Le tronc vu par le cavalier : dans quel sens on le prend (il se saute dans les deux sens), où l'on en est. */
export function logView(o, x, z, heading) {
  const back = { ...o, heading: o.heading + Math.PI };
  const fwd = alignment(o, heading) >= alignment(back, heading) ? o : back;
  const a = approach(fwd, x, z);
  return { o: fwd, u: a.u, v: a.v, align: alignment(fwd, heading), inLane: Math.abs(a.v) < o.width / 2 + 0.3 };
}

/** On galope droit vers lui, assez près : le bouton « Sauter » est là. */
export const jumpAhead = (view, speed) => view.inLane && view.align >= LOG.minAlign && speed >= LOG.minSpeed && view.u < 0 && view.u > -LOG.near;

/**
 * Ce qui se passe cette image : 'jump' (appel demandé, au bon endroit), 'auto' (rien demandé, il saute tout seul au
 * dernier moment), 'step' (au trot : il l'enjambe d'un petit bond) ou null. prevU : u de l'image d'avant ; wanted :
 * le cavalier a demandé de sauter (il y a peu).
 * Renvoie { what, timing } (timing : 0 à 1, la qualité de l'appel).
 */
export function jumpNow(view, prevU, speed, wanted) {
  if (!view.inLane) return null;
  const crossing = prevU !== null && prevU < LOG.auto && view.u >= LOG.auto;
  if (view.align < LOG.minAlign || speed < LOG.minSpeed) {
    // (pas assez vite pour sauter : au trot, il l'enjambe ; au pas, il passe tranquillement)
    return crossing && speed >= LOG.stepSpeed && view.align >= 0.3 ? { what: 'step', timing: 0.2 } : null;
  }
  if (wanted && view.u > LOG.early && view.u < LOG.late) return { what: 'jump', timing: takeoffQuality(view.u) };
  if (crossing) return { what: 'auto', timing: LOG.autoTiming };
  return null;
}

/**
 * Un cheval qui n'a pas encore l'habitude de sauter (compétence de saut faible) pile parfois devant le tronc : la
 * même chance que devant une barre trop haute (src/sim/activities.js refusalChance), deux fois moins s'il est bien
 * appelé (timing > 0,7). Les leçons et les sauts l'habituent. Renvoie true s'il refuse.
 */
export function logRefusal(skill, timing, rng = Math.random, height = LOG.height) {
  return rng() < refusalChance(skill, height) * (timing > 0.7 ? 0.5 : 1);
}

/**
 * ⏱️ Le cross : sauter le premier tronc (au galop) lance le chrono ; on saute les autres dans l'ordre du chemin de
 * balade ; le dernier sauté, c'est fini (le meilleur temps est gardé). Trop long (CROSS.maxTime s) : abandonné.
 * cross : { next (le tronc à sauter), t (secondes) } ou null.
 */
export const CROSS = { maxTime: 300 };

/** Un tronc sauté (index dans l'ordre) : { cross (le nouvel état), what: 'start' | 'next' | 'done' | 'wrong' | null }. */
export function crossJump(cross, index, total) {
  if (!cross) return index === 0 ? { cross: { next: 1, t: 0 }, what: 'start' } : { cross: null, what: null };
  if (index !== cross.next) return { cross, what: 'wrong' };
  const next = cross.next + 1;
  if (next >= total) return { cross: null, what: 'done', time: cross.t };
  return { cross: { ...cross, next }, what: 'next' };
}

/** Le temps passe ; trop long : abandonné (null). */
export function crossTick(cross, dt) {
  if (!cross) return null;
  const t = cross.t + dt;
  return t > CROSS.maxTime ? null : { ...cross, t };
}

/** 1:05 */
export const fmtCross = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
