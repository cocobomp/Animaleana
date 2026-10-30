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
  { id: 'quirkSpot', icon: '🤚' }, // 🔍 ce que tu sais de lui (src/sim/horseQuirks.js)
  { id: 'quirkTreat', icon: '🍎' },
  { id: 'quirkFear', icon: '😲' },
  { id: 'fearGone', icon: '💪' }, // (rassuré cinq fois après un écart de sa peur : src/sim/praise.js)
  { id: 'firstMatchy', icon: '🎨' },
  { id: 'luckyShoes', icon: '🍀' }, // (les 7 fers porte-bonheur : src/sim/luckyShoes.js)
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
  const d = Math.max(1, Math.round(day ?? 1));
  const i = a.memories.findIndex((m) => m.day > d); // (un souvenir d'un jour passé, ex. 🎂 fêté en retard : à sa place)
  a.memories.splice(i < 0 ? a.memories.length : i, 0, { id, day: d });
  return true;
}

/** Pour la fiche : [{ id, icon, day }] dans l'ordre. */
export function memoriesOf(a) {
  if (!Array.isArray(a?.memories)) return [];
  return a.memories.filter((m) => BY_ID.has(m.id)).map((m) => ({ ...m, icon: BY_ID.get(m.id).icon }));
}

/** Depuis quel jour vous êtes ensemble : son souvenir 'arrived' (sinon a.arrivedDay). */
export function togetherSince(a) {
  return (Array.isArray(a?.memories) ? a.memories : []).find((m) => m.id === 'arrived')?.day ?? a?.arrivedDay;
}

/**
 * 🎂 Un an de plus ensemble aujourd'hui ? Renvoie le nombre d'années (1, 2…) une seule fois par année, sinon 0.
 * Compté depuis son souvenir 'arrived' (sinon a.arrivedDay, noté au premier appel).
 */
export function anniversaryDue(a, day) {
  if (!keepsMemories(a)) return 0;
  const from = togetherSince(a);
  if (from == null) {
    a.arrivedDay = day; // (vieille partie, poulain né à la ferme : on compte à partir d'aujourd'hui)
    return 0;
  }
  const k = Math.floor((day - from) / DAYS_PER_YEAR);
  if (k < 1 || k <= (a.anniv ?? 0)) return 0;
  a.anniv = k;
  return k;
}

/**
 * 📸 Les souvenirs en selle qui ont leur vraie photo (src/game/Game.js memoryPhoto) : prise un peu après, en secondes
 * (la pluie et la neige plus tard que la première balade : deux photos différentes). Les autres gardent leur icône.
 */
export const PHOTO_MEMORIES = { firstRide: 1.5, firstCanter: 0.2, firstLog: 0.15, firstCross: 0.3, firstCall: 1.2, firstCool: 0.8, firstRain: 4, firstSnow: 4, halloween: 0.4 };
/**
 * La photo : 192 × 120, en JPEG ; au plus 6 par cheval et 18 dans la partie. saveMax : la sauvegarde garde 25 % de
 * marge sous la limite en ligne (src/cloud/firebase.js MAX_SAVE_BYTES, 900 000).
 */
export const PHOTO = { w: 192, h: 120, q: 0.55, perHorse: 6, total: 18, bytes: 14000, saveMax: 675000 };

const photosOf = (a) => (Array.isArray(a?.memories) ? a.memories.filter((m) => m.ph).length : 0);

/** Garde la photo data (image JPEG en data URL) dans son souvenir id (m.ph, sauvegardé). Renvoie true si elle est gardée. */
export function attachPhoto(profile, a, id, data) {
  if (!keepsMemories(a) || !(PHOTO_MEMORIES[id] > 0)) return false;
  const m = Array.isArray(a.memories) ? a.memories.find((x) => x.id === id) : null;
  if (!m || m.ph) return false;
  if (typeof data !== 'string' || !data.startsWith('data:image/jpeg') || data.length > PHOTO.bytes) return false;
  if (photosOf(a) >= PHOTO.perHorse) return false;
  if ((profile?.animals ?? []).filter(keepsMemories).reduce((n, x) => n + photosOf(x), 0) >= PHOTO.total) return false;
  m.ph = data;
  // (jamais une sauvegarde trop grosse pour être envoyée à cause d'une photo : sans elle, le souvenir garde son icône)
  if (profile && new TextEncoder().encode(JSON.stringify(profile)).length > PHOTO.saveMax) {
    delete m.ph;
    return false;
  }
  return true;
}
