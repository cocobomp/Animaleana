// 🔍 Ce que tu sais de lui : chaque cheval a son coin à gratouilles (le garrot, l'encolure, le poitrail ou le front :
// gratté juste là, il tend la lèvre du haut), sa friandise préférée (la carotte ou la pomme) et sa peur en balade (les
// oiseaux, les sacs plastique, son ombre, les lapins). On les découvre en jouant : en le caressant, en lui donnant une
// friandise, en balade (la deuxième fois qu'il a peur de la même chose). Dans sa fiche : « 🔍 Ce que tu sais de lui ».
// Logique pure (tests/horseQuirks.test.js) ; le jeu : src/game/Game.js (care, quirkFound, l'écart en balade), les
// mini-jeux : src/ui/minigames/fun.js (caresser), src/ui/minigames/food.js (friandise).
//
// Ses goûts viennent de son id (toujours les mêmes, rien n'est sauvegardé) ; ce que tu sais (sauvegardé) :
// a.known = { spot, treat, fear } et a.fearSeen (combien de fois il a eu peur de sa peur, avant de la connaître).
// 💪 Rassuré après un écart de sa peur (src/sim/praise.js) : a.fearCalm (combien de fois) ; à FEAR_CALM, a.fearGone.

import { seeded, pickWeighted } from './rng.js';
import { keepsMemories } from './memories.js';

/** Son coin préféré : le garrot le plus souvent (les chevaux s'y grattent l'un l'autre, au pré). */
export const QUIRK_SPOTS = { withers: 40, neck: 25, chest: 20, forehead: 15 };
export const QUIRK_TREATS = ['carrot', 'apple'];
/** Ses peurs possibles (ride_spookWhat0 à 3, qk_fear0 à 3). */
export const QUIRK_FEARS = 4;
/** Tu as compris un de ses goûts : le lien grandit (src/game/Game.js quirkFound). */
export const QUIRK_BOND = 2;

/** Ses goûts : { spot, treat, fear } (fear : 0 à 3). Le même cheval a toujours les mêmes. */
export function quirksOf(a) {
  const rng = seeded(`quirk:${a.id}`);
  const spot = pickWeighted(QUIRK_SPOTS, rng);
  const treat = rng() < 0.5 ? 'carrot' : 'apple';
  const fear = Math.floor(rng() * QUIRK_FEARS);
  return { spot, treat, fear };
}

/** Le sais-tu déjà ? key : 'spot' | 'treat' | 'fear'. */
export const knows = (a, key) => !!a?.known?.[key];

/** Tu viens de le découvrir : true la première fois seulement (tes chevaux : pas ceux qu'on te confie). */
export function discoverQuirk(a, key) {
  if (!keepsMemories(a) || knows(a, key)) return false;
  a.known = { ...(a.known ?? {}), [key]: true };
  return true;
}

/** De quoi il a peur, cette fois (0 à 3) : ton cheval, le plus souvent de sa peur à lui ; un autre, de n'importe quoi. */
export function spookCause(a, rng = Math.random) {
  if (a?.fearGone) {
    // (💪 il n'a plus peur de sa peur : de tout le reste)
    const fear = quirksOf(a).fear;
    const r = Math.floor(rng() * (QUIRK_FEARS - 1));
    return r >= fear ? r + 1 : r;
  }
  if (keepsMemories(a) && rng() < 0.6) return quirksOf(a).fear;
  return Math.floor(rng() * QUIRK_FEARS);
}

/**
 * Il vient d'avoir peur de cause : null (pas sa peur à lui), 'again' (tu la connais déjà) ou 'discovered' (la deuxième
 * fois : tu as compris).
 */
export function noteFear(a, cause) {
  if (!keepsMemories(a) || cause !== quirksOf(a).fear) return null;
  if (knows(a, 'fear')) return 'again';
  a.fearSeen = (a.fearSeen ?? 0) + 1;
  return a.fearSeen >= 2 && discoverQuirk(a, 'fear') ? 'discovered' : null;
}

/** 💪 Rassuré cinq fois après un écart de sa peur : elle s'en va. */
export const FEAR_CALM = 5;

/**
 * Tu l'as rassuré juste après un écart de cause : null (pas sa peur, pas encore connue, déjà partie, ou un cheval
 * confié), 'progress' (il en a un peu moins peur) ou 'gone' (la cinquième fois : il n'en a plus peur).
 */
export function calmFear(a, cause) {
  if (!keepsMemories(a) || !knows(a, 'fear') || a.fearGone || cause !== quirksOf(a).fear) return null;
  a.fearCalm = (a.fearCalm ?? 0) + 1;
  if (a.fearCalm < FEAR_CALM) return 'progress';
  a.fearGone = true;
  return 'gone';
}

/** Il n'a plus peur de sa peur : un peu moins d'écarts (multiplie le temps avant le prochain, src/sim/riding.js nextSpookIn). */
export const spookFactor = (a) => (a?.fearGone ? 1.25 : 1);
