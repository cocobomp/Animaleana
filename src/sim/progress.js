// Progression : on gagne de l'expérience en s'occupant des animaux.
// Les niveaux débloquent peu à peu les automatismes (équipements, aides) et les constructions.

export const XP = {
  care: 8, // chaque soin fait soi-même (mini-jeu)
  trick: 10,
  trickLearned: 40,
  adopt: 30,
  vet: 25,
  ride: 15,
  travel: 40,
  herd: 20,
  collect: 10,
  birth: 50,
  quest: 60,
  achievement: 120,
  helperTraining: 0,
  build: 30,
};

/** XP totale nécessaire pour atteindre le niveau n (niveau 1 = 0 XP). */
export const xpForLevel = (n) => 25 * n * (n - 1);

export function levelOf(xp) {
  let n = 1;
  while (xp >= xpForLevel(n + 1)) n++;
  return n;
}

/** Niveau requis pour chaque équipement, aide ou construction. */
export const UNLOCKS = {
  // équipements
  petFountain: 2,
  petFeeder: 3,
  paddockTrough: 3,
  penTrough: 4,
  hayrack: 4,
  penFeeder: 5,
  autoLitter: 6,
  cowBrush: 8,
  // aides
  petsitter: 5,
  groom: 6,
  shepherd: 7,
  farmhand: 9,
  vet: 11,
  // constructions
  kennel: 2,
  hutch: 2,
  paddockSmall: 3,
  shelter: 4,
  paddockLarge: 5,
  pasture: 5,
  barn: 6,
  arena: 7,
  newStable: 8,
  ranch: 10,
};

export const isUnlocked = (profile, key) => levelOf(profile.xp ?? 0) >= (UNLOCKS[key] ?? 1);

/** Ajoute de l'XP. Renvoie la liste des nouveautés débloquées si on change de niveau, sinon null. */
export function addXp(profile, kind, times = 1) {
  const before = levelOf(profile.xp ?? 0);
  profile.xp = (profile.xp ?? 0) + (XP[kind] ?? 0) * times;
  const after = levelOf(profile.xp);
  if (after === before) return null;
  return {
    level: after,
    unlocked: Object.entries(UNLOCKS).filter(([, lvl]) => lvl > before && lvl <= after).map(([k]) => k),
  };
}
