// Crottins et pipi : les animaux font leurs besoins, il faut ramasser.
// Les chats et les lapins font dans leur litière / clapier (géré par le soin « Nettoyer »).

import { uid } from './rng.js';

// Nombre de crottins par jour de jeu.
export const POOPS_PER_DAY = { horse: 8, cow: 6, sheep: 4, goat: 4, dog: 2 };
const MAX_DROPPINGS = 80;
const PEE_HOURS = 3; // une flaque sèche en 3 h de jeu

/** Fait avancer la digestion ; renvoie 'poop', 'pee' ou null quand l'animal doit faire ses besoins. */
export function digest(a, hours) {
  const rate = POOPS_PER_DAY[a.species];
  if (!rate) return null;
  a.digest = (a.digest ?? Math.random()) + (rate / 24) * hours;
  if (a.digest < 1) return null;
  a.digest -= 1;
  return Math.random() < 0.6 ? 'poop' : 'pee';
}

export function addDropping(profile, place, x, z, kind, clock, species = 'horse') {
  profile.droppings = profile.droppings ?? [];
  const d = { id: uid(), place, x, z, kind, clock, species };
  profile.droppings.push(d);
  if (profile.droppings.length > MAX_DROPPINGS) profile.droppings.shift();
  return d;
}

/** Enlève les flaques sèches. Renvoie les ids retirés. */
export function dryPuddles(profile, clock) {
  const gone = [];
  profile.droppings = (profile.droppings ?? []).filter((d) => {
    const dry = d.kind === 'pee' && clock - d.clock > PEE_HOURS * 60;
    if (dry) gone.push(d.id);
    return !dry;
  });
  return gone;
}

export const droppingsAt = (profile, place) => (profile.droppings ?? []).filter((d) => d.place === place && d.kind === 'poop');

/** Crottins à moins de r mètres de (x, z). */
export function dirtNear(profile, place, x, z, r = 6) {
  return droppingsAt(profile, place).filter((d) => Math.hypot(d.x - x, d.z - z) < r).length;
}

export function removeDroppings(profile, ids) {
  const set = new Set(ids);
  profile.droppings = (profile.droppings ?? []).filter((d) => !set.has(d.id));
}

/** Ramasse tous les crottins d'une zone (rectangle). Renvoie les ids. */
export function scoopZone(profile, place, zone) {
  const ids = droppingsAt(profile, place)
    .filter((d) => Math.abs(d.x - zone.x) < zone.hw + 1 && Math.abs(d.z - zone.z) < zone.hd + 1)
    .map((d) => d.id);
  removeDroppings(profile, ids);
  return ids;
}
