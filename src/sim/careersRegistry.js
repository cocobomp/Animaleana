// Registre minimal des métiers : chaque métier (guide de randonnée, éducateur canin, toiletteur…)
// s'y inscrit au chargement de son module. Le système des métiers (src/sim/careers.js) peut
// lire ce registre pour afficher tous les métiers au même endroit.

const registry = new Map();

/** Inscrit un métier { id, emoji, level, ranks, actions, … }. Renvoie la définition. */
export function registerCareer(def) {
  if (!def?.id) throw new Error('registerCareer : id manquant');
  registry.set(def.id, def);
  return def;
}

/** Tous les métiers inscrits, dans l'ordre d'inscription. */
export const listCareers = () => [...registry.values()];

/** Un métier par identifiant (ou null). */
export const getCareer = (id) => registry.get(id) ?? null;
