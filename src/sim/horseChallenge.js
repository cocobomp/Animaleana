// 🎯 Le défi du jour avec ton cheval : chaque jour de jeu, un petit défi tiré parmi ceux que tu sais déjà faire (sauter
// des troncs seulement si tu as déjà galopé, le trot enlevé si tu as déjà sellé…). Réussi : des pièces et un peu de
// lien avec ton cheval. Logique pure (tests/horseChallenge.test.js) ; le jeu : src/game/Game.js (challengeTick), la
// fiche : src/ui/panels.js.
//
// Dans le profil (sauvegardé) : profile.challenge = { day, id, base (la statistique au début du jour), done }.

/** stat : la statistique du profil qui compte ; n : combien de plus aujourd'hui ; ready : déjà possible pour toi. */
export const CHALLENGES = [
  { id: 'pet3', icon: '❤️', stat: 'horse_pet', n: 3, ready: () => true },
  { id: 'brush1', icon: '🪮', stat: 'horse_brush', n: 1, ready: () => true },
  { id: 'treat2', icon: '🍎', stat: 'horse_treat', n: 2, ready: () => true },
  { id: 'ride2', icon: '🏇', stat: 'rides', n: 2, ready: (s) => (s.rides ?? 0) >= 1 },
  { id: 'canter1', icon: '🐎', stat: 'rideCanter', n: 1, ready: (s) => (s.rides ?? 0) >= 1 },
  { id: 'call1', icon: '📣', stat: 'horse_came', n: 1, ready: (s) => (s.horse_pet ?? 0) >= 3 },
  { id: 'post1', icon: '⬆️', stat: 'risingTrot', n: 1, ready: (s) => (s.horse_saddle ?? 0) >= 1 },
  { id: 'logs2', icon: '⤴️', stat: 'freeJumps', n: 2, ready: (s) => (s.rideCanter ?? 0) >= 1 },
  { id: 'perfect1', icon: '⭐', stat: 'perfectDays', n: 1, ready: (s) => (s.horse_feed ?? 0) >= 2 },
];
export const CHALLENGE_REWARD = { coins: 30, bond: 2 };

export const challengeDef = (id) => CHALLENGES.find((c) => c.id === id) ?? null;

/** Les défis possibles pour toi (d'après ce que tu as déjà fait). */
export const readyChallenges = (profile) => CHALLENGES.filter((c) => c.ready(profile.stats ?? {}));

/** Le défi du jour day (tiré au hasard, mais toujours le même pour ce jour ; jamais celui d'hier si possible). */
export function pickChallenge(profile, day) {
  const list = readyChallenges(profile);
  if (!list.length) return null;
  const seed = (Math.imul(day + 7, 2654435761) >>> 0) + (profile.name?.length ?? 0) * 97;
  let c = list[seed % list.length];
  const prev = profile.challenge?.id;
  if (c.id === prev && list.length > 1) c = list[(seed + 1) % list.length];
  return c;
}

/**
 * Le défi d'aujourd'hui (un nouveau chaque jour). Renvoie { def, have, done, fresh (il vient d'arriver) } ou null
 * (pas de cheval : pas de défi).
 */
export function todayChallenge(profile, day, hasHorse = true) {
  if (!hasHorse) return null;
  let fresh = false;
  if (!profile.challenge || profile.challenge.day !== day || !challengeDef(profile.challenge.id)) {
    const c = pickChallenge(profile, day);
    if (!c) return null;
    profile.challenge = { day, id: c.id, base: profile.stats?.[c.stat] ?? 0, done: false };
    fresh = true;
  }
  const def = challengeDef(profile.challenge.id);
  const have = Math.max(0, Math.min(def.n, (profile.stats?.[def.stat] ?? 0) - profile.challenge.base));
  return { def, have, done: profile.challenge.done, fresh };
}

/** Le défi vient-il d'être réussi ? (une fois : le marque fait) */
export function challengeJustDone(profile, day) {
  const c = todayChallenge(profile, day);
  if (!c || c.done || c.have < c.def.n) return false;
  profile.challenge.done = true;
  return true;
}
