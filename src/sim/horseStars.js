// ⭐ Ses étoiles : ce que ton cheval a appris grâce à toi, de 0 à 5 étoiles par compétence (vitesse, endurance, saut,
// dressage, obéissance). Une étoile de plus : fêtée une fois (⭐ au-dessus de lui, un petit mot), avec ce qu'elle
// ouvre (1re étoile de saut : il ne pile plus devant les troncs ; 2e et 3e : les parcours du club et le grand).
// Logique pure (tests/horseStars.test.js) ; le jeu : src/game/Game.js (starsTick), sa fiche : src/ui/panels.js.
//
// Dans l'animal (sauvegardé) : a.stars = { speed, endurance, jump, dressage, obedience }, les étoiles déjà fêtées.

import { keepsMemories } from './memories.js'; // (tes chevaux : pas ceux qu'on te confie)

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

/** Nombre d'étoiles (0 à 5) pour une compétence v. */
export const starsOf = (v) => STAR_STEPS.filter((s) => (Number(v) || 0) >= s).length;

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
