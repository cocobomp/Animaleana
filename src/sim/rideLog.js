// 🏇 « Ta balade » : en descendant d'une balade libre d'au moins 40 secondes, une petite carte dit ce qu'on a fait
// ensemble : le temps et la distance, la part de pas, de trot et de galop, ce qui s'est passé (troncs, cross, fer
// porte-bonheur, citrouilles, trot enlevé), les tampons de la détente et du retour au calme, l'étoile qui approche, sa
// plus longue balade et ce qui manque à sa journée. Logique pure (tests/rideLog.test.js) ; le jeu : src/game/Game.js
// (ride, frame, dismount), la carte : src/ui/rideCard.js.
//
// Le carnet de balade (dans le jeu, pas sauvegardé) : { t (s en mouvement), dist (m), gaits { walk, trot, canter } (s),
// skills, stats (au départ), preWarm (déjà chaud en montant), skip (une activité ou un voyage l'a mené), x, z (où il
// était à l'image d'avant) }.
// Dans le cheval (sauvegardé) : a.rideBest, sa plus longue balade (en mètres).

import { keepsMemories } from './memories.js'; // (tes chevaux : pas ceux qu'on te confie)
import { STAR_STEPS, STAR_SKILLS, starsOf } from './horseStars.js';
import { horseDayView } from './horseDay.js';
import { POST } from './posting.js';

export const RIDE_LOG = {
  minTime: 40, // (secondes en mouvement : en dessous, pas de carte, les petits mots d'avant)
  maxSpeed: 15, // (m/s : plus vite que le grand galop, c'est un saut de place, pas de la route)
  minSpeed: 0.3, // (m/s vraiment faits : en dessous, il est à l'arrêt, ou il galope sur place contre une barrière)
  maxLines: 3,
  bestMin: 200, // (m : un record pour une vraie balade seulement)
  starGain: 0.05, // (points gagnés pendant la balade : l'étoile dont on parle)
};
// (ce que la balade a fait : la stat du carnet du cavalier, la clé de texte rc_<clé>)
const EVENTS = [['freeJumps', 'jumps'], ['crossDone', 'cross'], ['luckyShoes', 'shoe'], ['pumpkins', 'pumpkins']];
const GAITS = ['walk', 'trot', 'canter'];

/** Un carnet neuf en montant (null pour un cheval qu'on te confie) ; session : la détente (src/sim/warmup.js). */
export function newRideLog(a, stats = {}, session = null) {
  if (!keepsMemories(a)) return null;
  const s = {};
  for (const [k] of EVENTS) s[k] = stats?.[k] ?? 0;
  return { t: 0, dist: 0, gaits: { walk: 0, trot: 0, canter: 0 }, skills: { ...a.skills }, stats: s, preWarm: !!session?.warm, skip: false, x: null, z: null };
}

/**
 * Une image de balade : l'allure ('gallop' compte avec le galop ; l'arrêt, pour rien ; null : il va tout seul où on a
 * touché, l'allure d'après sa vitesse, comme l'animation), la vitesse (m/s), dt (s), p : où il est ({ x, z }). Seul le
 * chemin vraiment fait compte (contre une barrière, il galope sur place : rien).
 */
export function tickRideLog(log, gait, speed, dt, p) {
  if (!log || !p) return;
  const moved = log.x === null || !(dt > 0) ? 0 : Math.min(Math.hypot(p.x - log.x, p.z - log.z), RIDE_LOG.maxSpeed * dt);
  log.x = p.x;
  log.z = p.z;
  if (!(moved > RIDE_LOG.minSpeed * dt)) return;
  log.t += dt;
  log.dist += moved;
  // (seuils de l'animation du cheval réaliste, src/sim/riding.js GAIT_SPEED : pas < 2,15 < trot < 3,9 < galop)
  const k = gait === 'gallop' ? 'canter' : gait ?? (speed > 3.9 ? 'canter' : speed > 2.15 ? 'trot' : 'walk');
  if (GAITS.includes(k)) log.gaits[k] += dt;
}

/** Ce qui manque à sa journée parfaite (les icônes), ou null si elle n'est plus possible (le foin du matin oublié). */
export function dayLeft(a, day, hour) {
  const view = horseDayView(a, day, hour);
  if (view.some((x) => x.missed)) return null;
  return view.filter((x) => !x.done).map((x) => x.icon);
}

/**
 * La carte, en descendant : { show } (false : une balade trop courte, ou menée par une activité), puis min, dist,
 * share { walk, trot, canter } (parts du temps), lines [{ key, n }] (3 au plus), stamps { warm, cool (le verdict de
 * dismountVerdict), pro }, star ({ id, icon, toNext, next, fill } ou null), best (et a.rideBest noté), left (icônes ou
 * null), perfect, unsaddle. Le premier record est noté sans rien dire (rien à battre).
 */
export function rideReport(log, { a, stats = {}, session = null, postBest = 0, verdict = null, left = null, worked = false, saddled = false } = {}) {
  if (!log || log.skip || log.t < RIDE_LOG.minTime || !a) return { show: false };
  const total = GAITS.reduce((s, k) => s + log.gaits[k], 0);
  const share = {};
  for (const k of GAITS) share[k] = total > 0 ? log.gaits[k] / total : 0;
  const lines = [];
  for (const [k, key] of EVENTS) {
    const n = (stats?.[k] ?? 0) - (log.stats[k] ?? 0);
    if (n > 0) lines.push({ key: `rc_${key}`, n });
  }
  if ((postBest ?? 0) >= POST.statAt) lines.push({ key: 'rc_post', n: postBest });
  const warm = !log.preWarm && !!session?.warm && !!session?.started;
  // ⭐ la compétence qui a le plus grandi pendant la balade (un ancien cheval sans dressage : 10, comme horseStars)
  let star = null;
  let up = null;
  for (const { id, icon } of STAR_SKILLS) {
    const gain = (a.skills?.[id] ?? 10) - (log.skills[id] ?? 10);
    if (gain >= RIDE_LOG.starGain && (!up || gain > up.gain)) up = { id, icon, gain };
  }
  if (up) {
    const v = a.skills?.[up.id] ?? 10;
    const stars = starsOf(v);
    if (stars < STAR_STEPS.length) {
      const from = STAR_STEPS[stars - 1] ?? 0;
      const to = STAR_STEPS[stars];
      star = { id: up.id, icon: up.icon, toNext: Math.max(1, Math.ceil(to - v - 1e-6)), next: stars + 1, fill: Math.max(0, Math.min(1, (v - from) / (to - from))) };
    }
  }
  const d = Math.round(log.dist);
  const prev = a.rideBest ?? null;
  const best = prev !== null && d > prev && d >= RIDE_LOG.bestMin;
  if (d > (prev ?? -1)) a.rideBest = d;
  return {
    show: true,
    min: Math.max(1, Math.round(log.t / 60)),
    dist: log.dist,
    share,
    lines: lines.slice(0, RIDE_LOG.maxLines),
    stamps: { warm, cool: verdict ?? null, pro: warm && verdict === 'cooled' },
    star,
    best,
    left: left?.length ? left : null,
    perfect: Array.isArray(left) && left.length === 0,
    unsaddle: !!(worked && saddled),
  };
}

/** Une distance pour la carte : « 350 m », « 1,4 km » (virgule en français). */
export function fmtDist(m, lang = 'fr') {
  const r = Math.round((Number(m) || 0) / 10) * 10;
  if (r < 1000) return `${r} m`;
  const km = String(Math.round(r / 100) / 10);
  return `${lang === 'fr' ? km.replace('.', ',') : km} km`;
}
