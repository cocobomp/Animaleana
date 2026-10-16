// Petit pont vers le registre des métiers (src/sim/careers.js) : un module peut inscrire son métier
// sans modifier careers.js. registerCareer(def) l'ajoute à CAREERS (et donc au panneau 💼 Métiers).
// def au format de CAREERS : { id, emoji, level, building, ranks: [xp…], actions: [{ id, emoji, where }] }.

import { CAREERS, CAREER_IDS } from './careers.js';

/** Inscrit (ou remplace) un métier. Renvoie la définition. */
export function registerCareer(def) {
  if (!def?.id) throw new Error('registerCareer : id manquant');
  CAREERS[def.id] = def;
  if (!CAREER_IDS.includes(def.id)) CAREER_IDS.push(def.id);
  return def;
}

/** Tous les métiers inscrits, dans l'ordre. */
export function listCareers() {
  return CAREER_IDS.map((id) => CAREERS[id]);
}

export function getCareer(id) {
  return CAREERS[id] ?? null;
}
