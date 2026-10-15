// Ferme : équipements automatiques (mangeoires, abreuvoirs…), aides embauchées,
// produits (laine, lait) et vie de groupe entre animaux.
// Ce fichier ne dépend pas de la 3D, il est testé dans tests/farm.test.js.

import { SPECIES } from './species.js';
import { applyCare, cure, lifeStage, NEEDS } from './animal.js';
import { isSandbox, spend, earn } from './profile.js';
import { pick, uid } from './rng.js';

const PETS = ['dog', 'cat', 'rabbit'];
const LIVESTOCK = ['sheep', 'goat', 'cow'];

const clamp = (v) => Math.max(0, Math.min(100, v));

// slot : emplacement dans chaque lieu (x, z). stock null = illimité (l'eau est gratuite).
export const EQUIPMENT = {
  petFeeder: { emoji: '🥣', price: 80, serves: PETS, need: 'hunger', amount: 45, stock: 30, refill: 25, slot: [3.5, -9.5] },
  petFountain: { emoji: '⛲', price: 50, serves: PETS, need: 'thirst', amount: 55, stock: null, slot: [-1.5, -9.5] },
  autoLitter: { emoji: '🧻', price: 120, serves: ['cat', 'rabbit'], need: 'hygiene', amount: 0, passive: 2.5, stock: null, slot: [-5.5, -10] },
  hayrack: { emoji: '🌾', price: 150, serves: ['horse'], need: 'hunger', amount: 45, stock: 30, refill: 30, slot: [-12, 22] },
  paddockTrough: { emoji: '💧', price: 90, serves: ['horse'], need: 'thirst', amount: 55, stock: null, slot: [-20, 17] },
  penFeeder: { emoji: '🌾', price: 150, serves: LIVESTOCK, need: 'hunger', amount: 45, stock: 40, refill: 35, slot: [20, 41] },
  penTrough: { emoji: '💧', price: 90, serves: LIVESTOCK, need: 'thirst', amount: 55, stock: null, slot: [8, 41] },
  cowBrush: { emoji: '🪮', price: 200, serves: ['cow', 'horse', 'goat', 'sheep'], need: 'grooming', amount: 35, stock: null, slot: [9, 31] },
};

// Ce que fait chaque aide, son salaire par jour de jeu, et son point de départ.
export const HELPERS = {
  groom: { emoji: '🧑‍🌾', salary: 40, species: ['horse'], actions: ['feed', 'water', 'brush', 'clean', 'shoe', 'pet'], base: [-12, 4], color: 0x5a7d3a },
  petsitter: { emoji: '🧑', salary: 30, species: PETS, actions: ['feed', 'water', 'brush', 'clean', 'pet', 'play'], base: [2, -6], color: 0xd9734a },
  shepherd: { emoji: '🧑‍🌾', salary: 35, species: LIVESTOCK, actions: ['feed', 'water', 'brush', 'clean', 'pet', 'shear', 'milk'], base: [12, 28], color: 0x8a6a3a, herds: true },
  farmhand: { emoji: '👷', salary: 25, species: [], refills: true, base: [6, -3], color: 0x3f6fa8 },
  vet: { emoji: '🧑‍⚕️', salary: 60, species: null, cures: true, base: [16, 12], color: 0xf2f2f2 },
};

const HELPER_NAMES = ['Lucie', 'Hugo', 'Inès', 'Jules', 'Chloé', 'Nathan', 'Manon', 'Théo', 'Sarah', 'Louis', 'Emma', 'Yanis'];
const FEMALE_NAMES = ['Lucie', 'Inès', 'Chloé', 'Manon', 'Sarah', 'Emma'];

// Quel besoin remplit chaque soin (pour que l'aide choisisse le plus urgent).
const ACTION_FOR_NEED = {
  hunger: 'feed', thirst: 'water', grooming: 'brush', hygiene: 'clean', affection: 'pet', exercise: 'play',
};

// Les espèces qui vivent en troupeau ont besoin de compagnie.
export const HERD_SPECIES = ['horse', 'sheep', 'goat', 'cow'];

// ---------------------------------------------------------------- équipements

export function equipmentAt(profile, placeId) {
  return profile.equipment.filter((e) => e.place === placeId);
}

export function buyEquipment(profile, type, placeId) {
  const def = EQUIPMENT[type];
  if (equipmentAt(profile, placeId).some((e) => e.type === type)) return { ok: false, reason: 'owned' };
  if (!spend(profile, def.price)) return { ok: false, reason: 'money' };
  const eq = { id: uid(), type, place: placeId, stock: def.stock };
  profile.equipment.push(eq);
  return { ok: true, equipment: eq };
}

export function refillEquipment(profile, eq) {
  const def = EQUIPMENT[eq.type];
  if (def.stock === null || eq.stock >= def.stock) return { ok: false, reason: 'full' };
  if (!spend(profile, def.refill)) return { ok: false, reason: 'money' };
  eq.stock = def.stock;
  return { ok: true };
}

export const hasStock = (profile, eq) => EQUIPMENT[eq.type].stock === null || isSandbox(profile) || eq.stock > 0;

/** L'équipement vers lequel l'animal devrait aller, ou null. */
export function wantedEquipment(profile, a, placeId) {
  const list = equipmentAt(profile, placeId).filter((e) => {
    const def = EQUIPMENT[e.type];
    return !def.passive && def.serves.includes(a.species) && hasStock(profile, e);
  });
  // Le besoin le plus bas d'abord.
  let best = null;
  for (const e of list) {
    const need = EQUIPMENT[e.type].need;
    if (a.needs[need] < 45 && (!best || a.needs[need] < a.needs[EQUIPMENT[best.type].need])) best = e;
  }
  return best;
}

/** L'animal est arrivé à la mangeoire / l'abreuvoir. */
export function useEquipment(profile, a, eq) {
  const def = EQUIPMENT[eq.type];
  if (!hasStock(profile, eq)) return { ok: false, reason: 'empty' };
  a.needs[def.need] = clamp(a.needs[def.need] + def.amount);
  if (def.stock !== null && !isSandbox(profile)) eq.stock -= 1;
  return { ok: true, need: def.need };
}

/** Effets qui n'ont pas besoin de déplacement (litière autonettoyante). */
export function passiveEquipment(profile, animals, placeId, hours) {
  for (const e of equipmentAt(profile, placeId)) {
    const def = EQUIPMENT[e.type];
    if (!def.passive) continue;
    for (const a of animals) {
      if (def.serves.includes(a.species)) a.needs[def.need] = clamp(a.needs[def.need] + def.passive * hours);
    }
  }
}

// ---------------------------------------------------------------- aides

export function hireHelper(profile, type, placeId, rng = Math.random) {
  if (profile.helpers.some((h) => h.type === type && h.place === placeId)) return { ok: false, reason: 'owned' };
  const used = profile.helpers.map((h) => h.name);
  const name = pick(HELPER_NAMES.filter((n) => !used.includes(n)), rng) ?? pick(HELPER_NAMES, rng);
  const helper = { id: uid(), type, name, sex: FEMALE_NAMES.includes(name) ? 'f' : 'm', place: placeId };
  profile.helpers.push(helper);
  return { ok: true, helper };
}

export function fireHelper(profile, helperId) {
  profile.helpers = profile.helpers.filter((h) => h.id !== helperId);
}

/** Paie les aides pour `days` jours. Renvoie ceux qui partent faute d'argent. */
export function payHelpers(profile, days = 1) {
  const left = [];
  if (isSandbox(profile)) return left;
  for (const h of [...profile.helpers]) {
    const cost = HELPERS[h.type].salary * days;
    if (profile.money >= cost) profile.money -= cost;
    else {
      left.push(h);
      fireHelper(profile, h.id);
    }
  }
  return left;
}

const careable = (a, action) => SPECIES[a.species].actions.includes(action);

/**
 * Choisit la prochaine tâche d'une aide parmi les animaux du lieu.
 * Renvoie { kind: 'care' | 'cure' | 'refill' | 'product', animalId?, equipmentId?, action? } ou null.
 */
export function helperTask(profile, helper, animals) {
  const def = HELPERS[helper.type];
  if (def.cures) {
    const sick = animals.find((a) => a.sick);
    return sick ? { kind: 'cure', animalId: sick.id } : null;
  }
  if (def.refills) {
    const low = equipmentAt(profile, helper.place).find((e) => {
      const d = EQUIPMENT[e.type];
      return d.stock !== null && e.stock < d.stock * 0.3;
    });
    return low ? { kind: 'refill', equipmentId: low.id } : null;
  }
  let best = null;
  for (const a of animals) {
    if (!def.species.includes(a.species)) continue;
    if (a.produceReady) {
      const action = SPECIES[a.species].product.action;
      if (def.actions.includes(action)) return { kind: 'product', animalId: a.id, action };
    }
    for (const n of NEEDS) {
      const action = n === 'grooming' && a.species === 'horse' && a.needs.grooming < 25 ? 'shoe' : ACTION_FOR_NEED[n];
      if (!action || !def.actions.includes(action) || !careable(a, action)) continue;
      if (a.needs[n] < 55 && (!best || a.needs[n] < best.value)) best = { kind: 'care', animalId: a.id, action, value: a.needs[n] };
    }
  }
  if (best) delete best.value;
  return best;
}

/** L'aide est arrivée : elle fait la tâche. Renvoie { ok, earned? }. */
export function doHelperTask(profile, task, animals) {
  if (task.kind === 'refill') {
    const eq = profile.equipment.find((e) => e.id === task.equipmentId);
    if (!eq) return { ok: false };
    return refillEquipment(profile, eq);
  }
  const a = animals.find((x) => x.id === task.animalId);
  if (!a) return { ok: false };
  if (task.kind === 'cure') {
    if (!a.sick) return { ok: false };
    cure(a);
    return { ok: true };
  }
  if (task.kind === 'product') return collectProduct(profile, a);
  return applyCare(a, task.action);
}

// ---------------------------------------------------------------- produits

export function canProduce(a) {
  const p = SPECIES[a.species].product;
  if (!p) return false;
  if (p.females && a.sex !== 'f') return false;
  return lifeStage(a) === 'adult' || lifeStage(a) === 'senior';
}

/** Fait pousser la laine / monter le lait. */
export function tickProduce(a, hours) {
  if (!canProduce(a)) return;
  const p = SPECIES[a.species].product;
  a.produce = Math.min(100, (a.produce ?? 0) + (100 / p.hours) * hours);
  a.produceReady = a.produce >= 100;
}

export function collectProduct(profile, a) {
  if (!canProduce(a)) return { ok: false, reason: 'cantProduce' };
  if (!a.produceReady) return { ok: false, reason: 'notReady' };
  const p = SPECIES[a.species].product;
  a.produce = 0;
  a.produceReady = false;
  a.needs.grooming = clamp(a.needs.grooming + (p.id === 'wool' ? 30 : 0));
  earn(profile, p.value);
  profile.stats[p.id] = (profile.stats[p.id] ?? 0) + 1;
  return { ok: true, product: p.id, earned: p.value };
}

// ---------------------------------------------------------------- vie de groupe

/** Effets d'un moment passé ensemble (jeu, toilettage mutuel). */
export function socialMoment(a, kind) {
  if (kind === 'play') {
    a.needs.exercise = clamp(a.needs.exercise + 12);
    a.needs.affection = clamp(a.needs.affection + 8);
    a.needs.energy = clamp(a.needs.energy - 5);
  } else if (kind === 'groom') {
    a.needs.grooming = clamp(a.needs.grooming + 12);
    a.needs.affection = clamp(a.needs.affection + 10);
  } else if (kind === 'nurse') {
    a.needs.hunger = clamp(a.needs.hunger + 20);
    a.needs.affection = clamp(a.needs.affection + 10);
  }
}

/** Les herbivores au pré mangent de l'herbe (sauf sous la neige). */
export function graze(a, hours, snowy) {
  if (!SPECIES[a.species].grazes && a.species !== 'horse') return;
  if (snowy) return;
  a.needs.hunger = clamp(a.needs.hunger + 3.5 * hours);
}

/** Compagnons de la même espèce dans le même lieu. */
export function companionsOf(a, animals) {
  return animals.filter((b) => b.id !== a.id && b.species === a.species).length;
}
