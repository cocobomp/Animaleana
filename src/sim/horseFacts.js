// « 💡 Le savais-tu ? » : des faits vrais sur les chevaux, un à la fin de chaque mini-jeu fait avec un cheval
// (src/ui/minigames.js). Les textes : fact_<n> (src/i18n.js). On les fait défiler sans répéter.
//
// 🃏 Mes cartes : chaque fait est une carte à collectionner. Chaque soin cache les siennes (FACT_CARDS.from) : le
// mini-jeu montre d'abord une carte pas encore trouvée de ce soin, puis une carte « de tous les soins » (from vide).
// Dans le profil (sauvegardé) : profile.factCards = [ids, dans l'ordre trouvé] ; profile.stats.factCards (carnet).

export const HORSE_FACTS = 27;

let next = Math.floor(Math.random() * HORSE_FACTS);

/** Le prochain fait (1 à HORSE_FACTS), l'un après l'autre. rng : pour les tests. */
export function nextHorseFact() {
  next = (next % HORSE_FACTS) + 1;
  return next;
}

/** Les cartes : { id (le fait), icon, from (les soins qui la cachent ; vide : n'importe quel mini-jeu du cheval) }. */
export const FACT_CARDS = [
  { id: 1, icon: '💧', from: ['water'] },
  { id: 2, icon: '😴', from: ['liberty'] },
  { id: 3, icon: '🛌', from: ['liberty', 'clean'] },
  { id: 4, icon: '⬅️', from: ['saddle'] },
  { id: 5, icon: '🦶', from: ['brush', 'shoe'] },
  { id: 6, icon: '💅', from: ['brush', 'shoe'] },
  { id: 7, icon: '👀', from: ['treat'] },
  { id: 8, icon: '🙈', from: ['treat', 'pet'] },
  { id: 9, icon: '👂', from: ['pet'] },
  { id: 10, icon: '🌾', from: ['feed'] },
  { id: 11, icon: '🤢', from: ['feed'] },
  { id: 12, icon: '🦷', from: ['deworm'] },
  { id: 13, icon: '📏', from: ['saddle'] },
  { id: 14, icon: '🐴', from: ['shoe'] },
  { id: 15, icon: '🤸', from: ['wash', 'brush'] },
  { id: 16, icon: '🐎', from: ['pet', 'liberty'] },
  { id: 17, icon: '🎂', from: [] },
  { id: 18, icon: '🎵', from: ['lunge'] },
  { id: 19, icon: '🍼', from: [] },
  { id: 20, icon: '🦵', from: [] },
  { id: 21, icon: '🗨️', from: ['pet', 'treat'] },
  { id: 22, icon: '🤝', from: ['brush', 'pet'] },
  { id: 23, icon: '🔥', from: ['lunge'] },
  { id: 24, icon: '😌', from: ['lunge'] },
  { id: 25, icon: '🪱', from: ['deworm'] },
  { id: 26, icon: '🎀', from: ['bridle'] }, // (le flot accroché au filet : trouvé en bridant)
  { id: 27, icon: '🩺', from: ['feed'] },
];

/** Où chercher une carte manquante (l'icône du soin ; any : n'importe quel soin). */
export const FACT_WHERE = {
  water: '💧', feed: '🌾', brush: '🪮', wash: '🫧', shoe: '🔨', clean: '🧹', pet: '🤚', treat: '🍎', lunge: '🌀',
  liberty: '💛', saddle: '🏇', bridle: '🪢', deworm: '🪱', any: '⭐',
};

/** Pièces gagnées à la 9e et à la 18e carte (en gestion). */
export const CARD_COINS = { 9: 30, 18: 30 };

const found = (profile) => (Array.isArray(profile?.factCards) ? profile.factCards : []);

/** L'icône d'une carte. */
export const factIcon = (id) => FACT_CARDS.find((c) => c.id === id)?.icon ?? '💡';

/**
 * La carte à montrer à la fin du mini-jeu action : la première pas encore trouvée de ce soin, sinon la première pas
 * encore trouvée « de tous les soins », sinon (tout trouvé) les faits défilent comme avant.
 */
export function drawFact(profile, action) {
  if (!profile) return nextHorseFact();
  const have = found(profile);
  const fresh = FACT_CARDS.filter((c) => !have.includes(c.id));
  return (fresh.find((c) => c.from.includes(action)) ?? fresh.find((c) => !c.from.length))?.id ?? nextHorseFact();
}

/**
 * La carte id est lue (fin du mini-jeu). Renvoie { isNew, n (trouvées), total, coins (CARD_COINS, une nouvelle
 * seulement), all (la dernière vient d'être trouvée) }. Un id hors de 1…HORSE_FACTS ne compte pas.
 */
export function collectFact(profile, id) {
  const have = found(profile);
  const ok = Number.isInteger(id) && id >= 1 && id <= HORSE_FACTS;
  const isNew = ok && !!profile && !have.includes(id);
  if (isNew) profile.factCards = [...have, id];
  const n = found(profile).length;
  return { isNew, n, total: HORSE_FACTS, coins: isNew ? CARD_COINS[n] ?? 0 : 0, all: isNew && n === HORSE_FACTS };
}

/** L'album : { n, total, cards: [{ id, icon, from, found }] }. */
export function albumView(profile) {
  const have = found(profile);
  return { n: have.length, total: HORSE_FACTS, cards: FACT_CARDS.map((c) => ({ ...c, found: have.includes(c.id) })) };
}
