// ⭐ Ses étoiles : ce que ton cheval a appris grâce à toi, de 0 à 5 étoiles par compétence (vitesse, endurance, saut,
// dressage, obéissance). Une étoile de plus : fêtée une fois (⭐ au-dessus de lui, un petit mot), avec ce qu'elle
// ouvre (1re étoile de saut : il ne pile plus devant les troncs ; 2e et 3e : les parcours du club et le grand) ou
// ce qu'elle change en selle (💪 il galope plus longtemps, 🎠 plus à l'écoute, 🏃 plus vite : STAR_FX).
// Logique pure (tests/horseStars.test.js) ; le jeu : src/game/Game.js (starsTick), sa fiche : src/ui/panels.js.
//
// Dans l'animal (sauvegardé) : a.stars = { speed, endurance, jump, dressage, obedience }, les étoiles déjà fêtées.

import { keepsMemories } from './memories.js'; // (tes chevaux : pas ceux qu'on te confie)
import { canRide } from './animal.js';

/** Les paliers (compétence de 0 à 100) : les 3 premiers sont ceux des parcours de saut (src/sim/activities.js JUMP_STAGES). */
export const STAR_STEPS = [20, 40, 65, 85, 100];
export const STAR_SKILLS = [
  { id: 'speed', icon: '🏃' },
  { id: 'endurance', icon: '💪' },
  { id: 'jump', icon: '⤴️' },
  { id: 'dressage', icon: '🎠' }, // (comme les boutons de dressage)
  { id: 'obedience', icon: '🎓' }, // (pas 👂 : la ligne de ses oreilles est juste au-dessus)
];
/** Ce qu'une étoile de saut ouvre (texte st_unlock_<clé>). */
const UNLOCKS = { jump: [null, 'noRefuse', 'club', 'grand'] };

/** Nombre d'étoiles (0 à 5) pour une compétence v. (sans tableau : appelé à chaque image en selle) */
export const starsOf = (v) => {
  const x = Number(v) || 0;
  let n = 0;
  while (n < STAR_STEPS.length && x >= STAR_STEPS[n]) n++;
  return n;
};

// (un ancien cheval sans dressage : 10, comme à sa naissance)
const skillOf = (a, id) => a.skills?.[id] ?? 10;

/** Pour la fiche : [{ id, icon, stars, toNext (points avant l'étoile suivante, 0 au maximum) }]. */
export function starsView(a) {
  return STAR_SKILLS.map(({ id, icon }) => {
    const v = skillOf(a, id);
    const stars = starsOf(v);
    return { id, icon, stars, toNext: stars < STAR_STEPS.length ? STAR_STEPS[stars] - v : 0 };
  });
}

/**
 * Le conseil pour l'étoile suivante (une clé de texte) : un poulain trop jeune pour être monté n'a pas de conseil
 * d'équitation (r_tooYoung), sauf l'obéissance, qui se travaille à pied (en liberté, tout en douceur).
 */
export function starHowKey(a, id) {
  if (canRide(a).reason !== 'tooYoung') return `st_how_${id}`;
  return id === 'obedience' ? 'st_how_obedience_young' : 'r_tooYoung';
}

/**
 * Les étoiles gagnées depuis la dernière fois : [{ id, stars }], et notées (a.stars). La première fois (vieille
 * partie, cheval qui arrive) : notées sans rien dire. Jamais pour un cheval qu'on te confie. max : au plus tant
 * d'étoiles notées ; les autres restent à fêter la fois suivante (même après avoir quitté la partie).
 */
export function newStars(a, max = Infinity) {
  if (!keepsMemories(a)) return [];
  const first = !a.stars;
  const was = a.stars ?? {};
  const out = [];
  const now = {};
  for (const { id } of STAR_SKILLS) {
    const n = starsOf(skillOf(a, id));
    const before = was[id] ?? 0;
    const fresh = !first && n > before;
    if (fresh && out.length >= max) {
      now[id] = before; // (fêtée à la prochaine fois)
      continue;
    }
    if (fresh) out.push({ id, stars: n });
    now[id] = Math.max(n, before); // (une étoile fêtée ne l'est jamais deux fois)
  }
  a.stars = now;
  return out;
}

/** Ce que la stars-ième étoile de id ouvre : 'noRefuse', 'club', 'grand' (saut), sinon null. */
export const starUnlock = (id, stars) => UNLOCKS[id]?.[stars] ?? null;

// Ses étoiles se sentent en selle (src/sim/riding.js, src/sim/trip.js, src/game/Player.js), par étoile :
// endurance : l'effort coûte 8 % de moins (0,6 à 5 étoiles), il récupère 10 % plus vite au pas ; dressage : il prend
// l'allure demandée 12 % plus vite ; vitesse : chaque étoile au-delà de 2 lève de 0,05 le plafond de son grand galop.
// (l'obéissance, elle, espace déjà ses écarts et ses arrêts pour brouter : riding.js nextSpookIn, nextGrazeIn)
export const STAR_FX = { fit: 0.08, recover: 0.1, aids: 0.12, fast: 0.05 };
/** Ce qu'une étoile change en selle (texte st_perk_<clé>). */
const PERKS = { endurance: 'fit', dressage: 'aids', speed: 'fast', obedience: 'calm' };

/** Ce que coûte un effort (×) : 1 sans étoile d'endurance, 0,6 à 5 étoiles. */
export const fitness = (a) => 1 - STAR_FX.fit * starsOf(skillOf(a, 'endurance'));
/** Ce qu'il récupère au pas et à l'arrêt (×) : 1 sans étoile d'endurance, 1,5 à 5 étoiles. */
export const recovery = (a) => 1 + STAR_FX.recover * starsOf(skillOf(a, 'endurance'));
/** À quelle vitesse il prend l'allure demandée (×) : 1 sans étoile de dressage, 1,6 à 5 étoiles. */
export const responsiveness = (a) => 1 + STAR_FX.aids * starsOf(skillOf(a, 'dressage'));
/** Le plafond du bonus de vitesse au grand galop (compétence de vitesse 0-100) : 1,3, jusqu'à 1,45 à 5 étoiles. */
export const gallopCap = (speedSkill) => 1.3 + STAR_FX.fast * Math.max(0, starsOf(speedSkill) - 2);

/** Ce que son étoile de id change en selle (clé st_perk_<…>), sinon null ; rien pour un poulain qui ne se monte pas encore. */
export const starPerk = (id, a) => (a && canRide(a).reason === 'tooYoung' ? null : PERKS[id] ?? null);
