// Matériel : certains soins ne sont possibles qu'avec le bon outil.
// Le matériel de base est offert ; le reste s'achète et débloque de nouveaux soins.

import { spend } from './profile.js';
import { SPECIES, SPECIES_IDS, anyAvailable } from './species.js';

export const TOOLS = {
  brush: { emoji: '🪮', price: 10, actions: ['brush'] },
  pitchfork: { emoji: '🧹', price: 15, actions: ['clean'] },
  ball: { emoji: '⚽', price: 5, actions: ['play'] },
  shampoo: { emoji: '🧴', price: 15, actions: ['wash'] },
  nailClipper: { emoji: '✂️', price: 20, actions: ['nails'] },
  hoofKit: { emoji: '🔨', price: 60, actions: ['shoe'] },
  lungeLine: { emoji: '🌀', price: 40, actions: ['lunge', 'liberty'] },
  shears: { emoji: '🧶', price: 80, actions: ['shear'] },
  milkPail: { emoji: '🪣', price: 30, actions: ['milk'] },
  agilitySet: { emoji: '🚧', price: 60, training: ['agility'] },
  treats: { emoji: '🍪', price: 10, actions: ['treat'] },
  firstAid: { emoji: '🧰', price: 40, special: 'vet' }, // trousse de soins : soigner soi-même
};

export const STARTER_TOOLS = ['brush', 'pitchfork', 'ball', 'treats'];

// En voyage, seul le matériel emporté dans le coffre de transport est là (profile.luggage, src/sim/cargo.js).
const away = (p) => !!(p.luggage && p.place !== p.home && p.luggage.place === p.place);

export const hasTool = (profile, tool) => (away(profile) ? profile.luggage.tools ?? [] : profile.tools ?? STARTER_TOOLS).includes(tool);

/** Cet outil est-il resté à la maison ? (on l'a, mais pas dans le coffre du voyage) */
export const toolAtHome = (profile, tool) => away(profile) && (profile.tools ?? STARTER_TOOLS).includes(tool) && !hasTool(profile, tool);

/** Outil nécessaire pour une action (soin) ou un entraînement, ou null. */
export function toolFor(actionOrTraining) {
  for (const [id, def] of Object.entries(TOOLS)) {
    if (def.actions?.includes(actionOrTraining) || def.training?.includes(actionOrTraining)) return id;
  }
  return null;
}

/** Renvoie l'outil qui manque, ou null si on peut le faire. */
export function missingTool(profile, actionOrTraining) {
  const tool = toolFor(actionOrTraining);
  return tool && !hasTool(profile, tool) ? tool : null;
}

/** Les espèces qui ont besoin de cet outil (ses soins ou ses entraînements) ; [] = utile à tous (trousse…). */
export function toolSpecies(tool) {
  const def = TOOLS[tool];
  if (!def) return [];
  return SPECIES_IDS.filter((sid) => (def.actions ?? []).some((a) => SPECIES[sid].actions.includes(a))
    || (def.training ?? []).some((tr) => SPECIES[sid].training.includes(tr)));
}

/**
 * L'outil est-il en vente ? Non s'il ne sert qu'à des espèces pas encore proposées (OFFERED_SPECIES,
 * src/sim/species.js) qu'on n'a pas : la tondeuse et le seau à traire sans moutons, chèvres ni vaches.
 * Un outil qu'on a déjà reste dans la liste.
 */
export function toolShown(profile, tool) {
  if (!TOOLS[tool]) return false;
  return anyAvailable(profile, toolSpecies(tool)) || (profile.tools ?? STARTER_TOOLS).includes(tool);
}

export function buyTool(profile, tool) {
  if (hasTool(profile, tool)) return { ok: false, reason: 'owned' };
  if (!toolShown(profile, tool)) return { ok: false, reason: 'soon' }; // espèce pas encore proposée
  if (!spend(profile, TOOLS[tool].price)) return { ok: false, reason: 'money' };
  const all = profile.tools ?? STARTER_TOOLS;
  if (!all.includes(tool)) profile.tools = [...all, tool];
  if (away(profile)) profile.luggage.tools = [...(profile.luggage.tools ?? []), tool]; // acheté ici : il est là
  return { ok: true };
}
