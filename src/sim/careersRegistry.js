// Registre des métiers (« Métiers ») : chaque métier s'enregistre avec une définition
// { id, emoji, level, ranks: [{ id, xp }], actions: [{ id, rank?, tutorial }] }.
// Petit module indépendant : le registre central des métiers (src/sim/careers.js) peut
// l'adopter tel quel ou y lire les métiers déjà enregistrés (listCareers()).
// L'XP de métier est rangée dans profile.careers.xp[id] ; le métier en cours dans profile.careers.active.

const REGISTRY = new Map();

export function registerCareer(def) {
  REGISTRY.set(def.id, def);
  return def;
}

export const getCareer = (id) => REGISTRY.get(id) ?? null;
export const listCareers = () => [...REGISTRY.values()];

/** profile.careers existe toujours (anciennes sauvegardes comprises). */
export function careersOf(profile) {
  if (!profile.careers) profile.careers = { xp: {}, active: null };
  if (!profile.careers.xp) profile.careers.xp = {};
  return profile.careers;
}

export const careerXp = (profile, id) => careersOf(profile).xp[id] ?? 0;

/** Rang atteint (indice dans def.ranks) pour une XP donnée. */
export function rankIndex(def, xp) {
  let r = 0;
  def.ranks.forEach((rk, i) => { if (xp >= rk.xp) r = i; });
  return r;
}

export const careerRank = (profile, def) => rankIndex(def, careerXp(profile, def.id));

/** Progression (0 à 1) vers le rang suivant. */
export function rankProgress(def, xp) {
  const i = rankIndex(def, xp);
  if (i >= def.ranks.length - 1) return 1;
  const a = def.ranks[i].xp;
  const b = def.ranks[i + 1].xp;
  return Math.min(1, Math.max(0, (xp - a) / (b - a)));
}

/** Ajoute de l'XP de métier. Renvoie { xp, rank, rankUp }. */
export function addCareerXp(profile, def, n) {
  const c = careersOf(profile);
  const before = rankIndex(def, c.xp[def.id] ?? 0);
  c.xp[def.id] = (c.xp[def.id] ?? 0) + n;
  const rank = rankIndex(def, c.xp[def.id]);
  return { xp: c.xp[def.id], rank, rankUp: rank > before };
}

/** Le métier est-il débloqué (niveau du joueur) ? */
export const careerUnlocked = (def, level) => level >= (def.level ?? 1);

/** Une action du métier est-elle disponible à ce rang ? */
export const actionAvailable = (def, actionId, rank) => {
  const act = def.actions.find((a) => a.id === actionId);
  return !!act && rank >= (act.rank ?? 0);
};
