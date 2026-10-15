// Équipement des animaux : selle, filet, couvertures, guêtres, bonnet anti-mouches, manteau, collier.
// On achète des objets (inventaire du profil), puis on les met sur un animal.

import { spend } from './profile.js';

export const BLANKET_COLORS = { red: 0xb7322c, navy: 0x23395d, green: 0x2f6b45, purple: 0x6b3fa0, pink: 0xe07aa5 };

export const GEAR = {
  halter: { emoji: '🔗', price: 25, species: ['horse', 'cow', 'goat'], slot: 'halter', colors: true },
  bridle: { emoji: '🪢', price: 60, species: ['horse'], slot: 'bridle' },
  saddle: { emoji: '🏇', price: 150, species: ['horse'], slot: 'saddle' },
  blanket: { emoji: '🧣', price: 70, species: ['horse'], slot: 'blanket', colors: true },
  boots: { emoji: '🧦', price: 50, species: ['horse'], slot: 'legs' },
  flyMask: { emoji: '🕸️', price: 35, species: ['horse', 'cow'], slot: 'head' },
  dogCoat: { emoji: '🧥', price: 40, species: ['dog'], slot: 'blanket', colors: true },
  collar: { emoji: '📿', price: 15, species: ['dog', 'cat'], slot: 'neck', colors: true },
  leash: { emoji: '🦮', price: 15, species: ['dog'], slot: 'leash' },
};

/** Tout nouveau profil reçoit un licol, un filet et une selle. */
export const STARTER_ITEMS = { halter: 1, bridle: 1, saddle: 1, collar: 1, leash: 1 };

export const owned = (profile, item) => profile.items?.[item] ?? 0;

/** Combien de cet objet sont déjà portés par des animaux. */
export const inUse = (profile, item) => profile.animals.filter((a) => Object.values(a.gear ?? {}).some((g) => g.item === item)).length;

export function buyGear(profile, item) {
  if (!spend(profile, GEAR[item].price)) return { ok: false, reason: 'money' };
  profile.items = profile.items ?? {};
  profile.items[item] = owned(profile, item) + 1;
  return { ok: true };
}

/** Met un objet sur l'animal. color : clé de BLANKET_COLORS pour les couvertures et colliers. */
export function equip(profile, a, item, color = 'red') {
  const def = GEAR[item];
  if (!def.species.includes(a.species)) return { ok: false, reason: 'wrongSpecies' };
  const already = a.gear?.[def.slot]?.item === item;
  if (!already && inUse(profile, item) >= owned(profile, item)) return { ok: false, reason: 'notOwned' };
  a.gear = a.gear ?? {};
  a.gear[def.slot] = { item, color: def.colors ? color : undefined };
  return { ok: true };
}

export function unequip(a, slot) {
  if (a.gear) delete a.gear[slot];
}

export const wears = (a, item) => Object.values(a.gear ?? {}).some((g) => g.item === item);

/** Il faut un filet pour monter ; sans selle on monte « à cru », moins vite. */
export function rideGear(a) {
  if (!wears(a, 'bridle')) return { ok: false, reason: 'needBridle' };
  return { ok: true, bareback: !wears(a, 'saddle') };
}

/** Promener un chien en laisse : il faut le collier et la laisse. */
export const canLeash = (a) => a.species === 'dog' && wears(a, 'collar') && wears(a, 'leash');

/**
 * À quel point le chien marche sagement (0 = tire partout, 1 = parfaitement au pied).
 * Dépend de l'obéissance et du tour « Au pied ».
 */
export function heelSkill(a) {
  return Math.min(1, (a.skills?.obedience ?? 10) / 100 * 0.5 + (a.tricks?.heel ?? 0) / 100 * 0.5);
}

/** Pour mener un cheval à la main, il faut un licol (ou le filet). */
export function canLead(a) {
  if (a.species !== 'horse') return { ok: true };
  return wears(a, 'halter') || wears(a, 'bridle') ? { ok: true } : { ok: false, reason: 'needHalter' };
}

/**
 * Météo ressentie par un animal selon son équipement.
 * Une couverture protège de la pluie et du froid, mais donne chaud quand il fait doux.
 */
export function feltWeather(a, weather, temperature, season) {
  const covered = wears(a, 'blanket') || wears(a, 'dogCoat');
  if (covered) {
    if (temperature >= 18) return 'heat';
    if (['rain', 'storm', 'snow'].includes(weather) || temperature < 8) return 'clear';
  }
  if (season === 'summer' && weather === 'clear' && ['horse', 'cow'].includes(a.species) && !wears(a, 'flyMask')) return 'flies';
  return weather;
}
