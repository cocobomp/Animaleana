// Registre des métiers (« Métiers ») : chaque métier s'inscrit ici au chargement de son module.
// Petit module partagé : registerCareer(def) / listCareers() / getCareer(id).
// Un métier = { id, emoji, name, desc, level, ranks: [{ id, xp }], actions: [{ id, emoji, rank }] }.

const CAREERS = new Map();

/** Inscrit (ou remplace) un métier. Renvoie la définition. */
export function registerCareer(def) {
  if (!def?.id) throw new Error('registerCareer : id manquant');
  CAREERS.set(def.id, def);
  return def;
}

/** Tous les métiers inscrits, dans l'ordre d'inscription. */
export function listCareers() {
  return [...CAREERS.values()];
}

export function getCareer(id) {
  return CAREERS.get(id) ?? null;
}
