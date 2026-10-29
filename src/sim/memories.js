// 📸 Les souvenirs de ton cheval : les premières fois de votre histoire (son arrivée, la première balade, le premier
// galop, le premier tronc sauté, le jour où il est venu à ton appel, les Galops, le premier concours…), notés une
// seule fois, avec le jour. Dans sa fiche : « 📸 Ses souvenirs ». Logique pure (tests/memories.test.js) ; notés par
// le jeu (src/game/Game.js remember) ; les textes : mem_<id> (src/i18n.js).
// 🎂 Et chaque année ensemble (12 jours de jeu après son arrivée) : son anniversaire avec toi (anniversaryDue).
//
// Dans l'animal (sauvegardé) : a.memories = [{ id, day }], dans l'ordre où ils sont arrivés ; a.anniv, la dernière
// année fêtée ; a.arrivedDay, le jour d'arrivée d'un cheval sans souvenir 'arrived' (vieille partie, poulain né ici).

import { DAYS_PER_YEAR } from './time.js'; // (1 an = 12 jours de jeu)

/** Les souvenirs possibles, dans l'ordre de l'histoire (pour les textes et les tests). */
export const MEMORIES = [
  { id: 'arrived', icon: '🏠' },
  { id: 'firstRide', icon: '🏇' },
  { id: 'firstCanter', icon: '🐎' },
  { id: 'firstCall', icon: '📣' },
  { id: 'firstPerfect', icon: '🌟' },
  { id: 'firstLog', icon: '⤴️' },
  { id: 'firstCool', icon: '😌' },
  { id: 'galop1', icon: '🥉' },
  { id: 'galop2', icon: '🥈' },
  { id: 'galop3', icon: '🥇' },
  { id: 'firstShow', icon: '🏆' },
  { id: 'firstPodium', icon: '🎖️' },
  { id: 'firstCross', icon: '🏁' },
  { id: 'halloween', icon: '🎃' },
  { id: 'bondTrust', icon: '🤝' },
  { id: 'bondLove', icon: '💖' },
  { id: 'bondBest', icon: '🦮' },
  { id: 'firstRain', icon: '🌧️' },
  { id: 'firstSnow', icon: '❄️' },
  { id: 'firstVet', icon: '🩺' },
  { id: 'firstDeworm', icon: '🪱' },
  { id: 'firstTrip', icon: '🚐' },
  { id: 'year1', icon: '🎂' },
];
/** Une étape du lien (src/sim/animal.js BOND_STAGES) : son souvenir. */
export const BOND_MEMORIES = { trust: 'bondTrust', love: 'bondLove', best: 'bondBest' };
const BY_ID = new Map(MEMORIES.map((m) => [m.id, m]));
/** Au plus, dans la fiche (les plus anciens d'abord, puis « … »). */
export const MEMORY_MAX = 40;

/** Seulement pour tes chevaux (pas ceux qu'on te confie). */
export const keepsMemories = (a) => a?.species === 'horse' && !a.client && !a.guest;

/** Note un souvenir (une seule fois). Renvoie true s'il est nouveau. */
export function remember(a, id, day) {
  if (!keepsMemories(a) || !BY_ID.has(id)) return false;
  if (!Array.isArray(a.memories)) a.memories = [];
  if (a.memories.some((m) => m.id === id)) return false;
  if (a.memories.length >= MEMORY_MAX) return false;
  a.memories.push({ id, day: Math.max(1, Math.round(day ?? 1)) });
  return true;
}

/** Pour la fiche : [{ id, icon, day }] dans l'ordre. */
export function memoriesOf(a) {
  if (!Array.isArray(a?.memories)) return [];
  return a.memories.filter((m) => BY_ID.has(m.id)).map((m) => ({ ...m, icon: BY_ID.get(m.id).icon }));
}

/**
 * 🎂 Un an de plus ensemble aujourd'hui ? Renvoie le nombre d'années (1, 2…) une seule fois par année, sinon 0.
 * Compté depuis son souvenir 'arrived' (sinon a.arrivedDay, noté au premier appel).
 */
export function anniversaryDue(a, day) {
  if (!keepsMemories(a)) return 0;
  const from = (Array.isArray(a.memories) ? a.memories : []).find((m) => m.id === 'arrived')?.day ?? a.arrivedDay;
  if (from == null) {
    a.arrivedDay = day; // (vieille partie, poulain né à la ferme : on compte à partir d'aujourd'hui)
    return 0;
  }
  const k = Math.floor((day - from) / DAYS_PER_YEAR);
  if (k < 1 || k <= (a.anniv ?? 0)) return 0;
  a.anniv = k;
  return k;
}
