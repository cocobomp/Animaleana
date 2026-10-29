// « 💡 Le savais-tu ? » : des faits vrais sur les chevaux, un à la fin de chaque mini-jeu fait avec un cheval
// (src/ui/minigames.js). Les textes : fact_<n> (src/i18n.js). On les fait défiler sans répéter.

export const HORSE_FACTS = 22;

let next = Math.floor(Math.random() * HORSE_FACTS);

/** Le prochain fait (1 à HORSE_FACTS), l'un après l'autre. rng : pour les tests. */
export function nextHorseFact() {
  next = (next % HORSE_FACTS) + 1;
  return next;
}
