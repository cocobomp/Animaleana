// 🎯 Les défis du jour de la ferme, pour tous (sur le modèle du défi du cheval, src/sim/horseChallenge.js) : chaque jour
// de jeu, après l'histoire du début, 2 petits défis tirés parmi ce que tu sais déjà faire, là où tu es (abreuver,
// nourrir, brosser, caresser, 5 soins, 2 soins ★★★, une corvée à la maison, 2 boulots tirés avant 14 h…). Chacun
// rapporte +10 🪙 ; les 2 faits, un 🎁 coffre surprise s'ouvre tout de suite (10 à 20 🪙 selon le jour, et un jour sur 7
// le coffre doré : 30 🪙).
// - Jamais sur la même chose que le défi du cheval du jour (caresser et caresser ton cheval comptent ensemble).
// - Le défi du cheval reste à part (+30 🪙, inchangé) et ne compte pas pour le coffre : un cheval boiteux ne bloque rien.
// - Rien ne se perd : un défi pas fait ne coûte rien, le lendemain en apporte deux autres.
// - Ce qui compte : ce qui est fait après le tirage (la statistique moins sa valeur au tirage, comme le défi du cheval).
// Logique pure (tests/defis-du-jour.test.js) ; le jeu : Game.dailyTick (juste après challengeTick) ; l'écran : la
// carte « 🎯 Défis du jour » des petits boulots (src/ui/panels.js), en lecture seule.
//
// Dans le profil (sauvegardé ; créé au premier usage, absent d'une ancienne partie, lu de façon tolérante) :
//   daily : { day, ids (les défis du jour), base ({ id: la statistique au tirage }), done (les défis déjà fêtés),
//             chest (les pièces du coffre une fois ouvert, sinon null) }

import { seeded } from './rng.js';

/**
 * stat : la statistique du profil qui compte ; n : combien de plus aujourd'hui ; ready : tu sais déjà le faire (tes
 * statistiques) ; when : possible aujourd'hui, là où tu es. ctx : { hour, home (à la maison), mine (tes animaux ici),
 * can (Set des soins possibles sur eux, l'outil compris), jobsLeft (petits boulots encore possibles aujourd'hui) } ; un
 * champ absent ne bloque rien, sauf can (sans lui, aucun soin n'est sûr d'être possible).
 */
export const FARM_CHALLENGES = [
  { id: 'water3', icon: '💧', stat: 'water', n: 3, ready: (s) => (s.water ?? 0) >= 1, when: (c) => !!c.can?.has('water') },
  { id: 'feed2', icon: '🍽️', stat: 'feed', n: 2, ready: (s) => (s.feed ?? 0) >= 1, when: (c) => !!c.can?.has('feed') },
  { id: 'brush2', icon: '🪮', stat: 'brush', n: 2, ready: (s) => (s.brush ?? 0) >= 1, when: (c) => !!c.can?.has('brush') },
  { id: 'pet3', icon: '❤️', stat: 'pet', n: 3, ready: (s) => (s.pet ?? 0) >= 1, when: (c) => !!c.can?.has('pet') },
  // (5 soins : au moins 2 de tes animaux ici, pour ne pas tout faire au même)
  { id: 'care5', icon: '🧺', stat: 'cares', n: 5, ready: () => true, when: (c) => (c.mine ?? 0) >= 2 && !!c.can?.size },
  // (★★★ : seulement si tu en as déjà eu une ; soins ou corvées, src/sim/wellDone.js)
  { id: 'stars2', icon: '⭐', stat: 'wellDone3', n: 2, ready: (s) => (s.wellDone3 ?? 0) >= 1, when: (c) => !!c.can?.size || c.home !== false },
  { id: 'chore1', icon: '🧹', stat: 'chores', n: 1, ready: (s) => (s.chores ?? 0) >= 1, when: (c) => c.home !== false },
  // (les voisins sont à la maison ; tiré avant 14 h, avec 2 boulots encore possibles : il reste le temps de les faire)
  { id: 'job2', icon: '📋', stat: 'jobs', n: 2, ready: (s) => (s.jobs ?? 0) >= 1, when: (c) => c.home !== false && !(c.hour >= 14) && (c.jobsLeft ?? 2) >= 2 },
];

/** count : les défis par jour ; coins : chacun ; chest : le coffre selon le jour (le plus gros : le coffre doré). */
export const DAILY = { count: 2, coins: 10, chest: [10, 15, 20, 15, 10, 20, 30] };

export const dailyDef = (id) => FARM_CHALLENGES.find((c) => c.id === id) ?? null;

/** Le même défi que celui du cheval ? (horseStat : 'horse_pet' et 'pet' comptent ensemble) */
const sameAsHorse = (def, horseStat) => !!horseStat && (horseStat === def.stat || horseStat === `horse_${def.stat}`);

/** Les défis possibles pour toi aujourd'hui, ici (ctx : voir FARM_CHALLENGES), sauf celui du cheval (horseStat). */
export const readyDaily = (profile, ctx = {}, horseStat = null) =>
  FARM_CHALLENGES.filter((c) => c.ready(profile?.stats ?? {}) && (!c.when || c.when(ctx)) && !sameAsHorse(c, horseStat));

/**
 * Les défis du jour day (au plus DAILY.count) : tirés au hasard, mais toujours les mêmes pour cette partie et ce jour ;
 * ceux du dernier tirage passent après les autres (jamais la même paire qu'hier quand il y a le choix).
 */
export function pickDaily(profile, day, ctx = {}, horseStat = null) {
  const list = readyDaily(profile, ctx, horseStat);
  const rng = seeded(`${profile?.id ?? profile?.name ?? ''}:daily:${day}`);
  const order = list.map((c) => ({ c, r: rng() })).sort((a, b) => a.r - b.r).map((x) => x.c);
  const d = profile?.daily;
  const prev = d && d.day !== day && Array.isArray(d.ids) ? d.ids : [];
  return [...order.filter((c) => !prev.includes(c.id)), ...order.filter((c) => prev.includes(c.id))].slice(0, DAILY.count);
}

/** Les pièces du coffre du jour day. */
export const chestCoins = (day) => DAILY.chest[((Math.floor(day) % DAILY.chest.length) + DAILY.chest.length) % DAILY.chest.length];
/** Le coffre doré ? (le plus gros) */
export const chestGolden = (coins) => coins >= Math.max(...DAILY.chest);

/**
 * Où en sont les défis du jour, sans rien tirer ni changer : null (pas encore tirés aujourd'hui, ou abîmés) ou
 * { list: [{ def, have, done }], chest (les pièces du coffre ouvert, sinon null) }. Pour l'écran (lecture seule).
 */
export function dailyState(profile, day) {
  const d = profile?.daily;
  if (!d || typeof d !== 'object' || d.day !== day || !Array.isArray(d.ids) || !d.ids.length || !d.ids.every(dailyDef)) return null;
  const done = Array.isArray(d.done) ? d.done : [];
  const stats = profile.stats ?? {};
  const list = d.ids.map((id) => {
    const def = dailyDef(id);
    const base = Number.isFinite(d.base?.[id]) ? d.base[id] : stats[def.stat] ?? 0;
    return { def, have: Math.max(0, Math.min(def.n, (stats[def.stat] ?? 0) - base)), done: done.includes(id) };
  });
  return { list, chest: Number.isFinite(d.chest) ? d.chest : null };
}

/**
 * Les défis d'aujourd'hui, tirés le premier passage du jour (ctx, horseStat : voir readyDaily). Renvoie null (rien de
 * possible pour l'instant : on réessaiera) ou { list, chest, fresh (ils viennent d'arriver) }. Un défi inconnu (retiré
 * du jeu) : un nouveau tirage.
 */
export function todayDaily(profile, day, ctx = {}, horseStat = null) {
  let fresh = false;
  if (!dailyState(profile, day)) {
    const list = pickDaily(profile, day, ctx, horseStat);
    if (!list.length) return null;
    const stats = profile.stats ?? {};
    profile.daily = { day, ids: list.map((c) => c.id), base: Object.fromEntries(list.map((c) => [c.id, stats[c.stat] ?? 0])), done: [], chest: null };
    fresh = true;
  }
  return { ...dailyState(profile, day), fresh };
}

/**
 * Ce qui vient d'être réussi (une fois : c'est noté) : { ids (les défis réussis à l'instant), chest (les pièces du
 * coffre qui vient de s'ouvrir : tous les défis du jour faits ; sinon null) }. Ne tire rien.
 */
export function dailyJustDone(profile, day) {
  const st = dailyState(profile, day);
  if (!st) return { ids: [], chest: null };
  const d = profile.daily;
  const ids = st.list.filter((x) => !x.done && x.have >= x.def.n).map((x) => x.def.id);
  if (ids.length) d.done = [...(Array.isArray(d.done) ? d.done : []), ...ids];
  let chest = null;
  if (st.chest === null && st.list.every((x) => x.done || ids.includes(x.def.id))) {
    chest = chestCoins(day);
    d.chest = chest;
  }
  return { ids, chest };
}
