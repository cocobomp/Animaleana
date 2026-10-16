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

// En voyage, seul le matériel emporté dans le coffre de transport est là (profile.luggage, src/sim/cargo.js).
// Sans coffre (anciennes sauvegardes) ou à la maison : tout le matériel acheté est disponible.
const away = (p) => !!(p.luggage && p.place !== p.home && p.luggage.place === p.place);

export const owned = (profile, item) => (away(profile) ? profile.luggage.items?.[item] ?? 0 : profile.items?.[item] ?? 0);

/** Combien de cet objet sont déjà portés par des animaux (en voyage : par les animaux qui sont là). */
export const inUse = (profile, item) => profile.animals.filter((a) => (!away(profile) || a.location === profile.place)
  && Object.values(a.gear ?? {}).some((g) => g.item === item)).length;

/** Cet objet est-il resté à la maison ? (on en a, mais pas dans le coffre du voyage) */
export const leftAtHome = (profile, item) => away(profile) && (profile.items?.[item] ?? 0) > 0;

export function buyGear(profile, item) {
  if (!spend(profile, GEAR[item].price)) return { ok: false, reason: 'money' };
  profile.items = profile.items ?? {};
  profile.items[item] = (profile.items[item] ?? 0) + 1;
  if (away(profile)) profile.luggage.items[item] = (profile.luggage.items[item] ?? 0) + 1; // acheté ici : il est là
  return { ok: true };
}

/** Met un objet sur l'animal. color : clé de BLANKET_COLORS pour les couvertures et colliers. */
export function equip(profile, a, item, color = 'red') {
  const def = GEAR[item];
  if (!def.species.includes(a.species)) return { ok: false, reason: 'wrongSpecies' };
  const already = a.gear?.[def.slot]?.item === item;
  if (!already && inUse(profile, item) >= owned(profile, item)) return { ok: false, reason: leftAtHome(profile, item) ? 'leftAtHome' : 'notOwned' };
  a.gear = a.gear ?? {};
  a.gear[def.slot] = { item, color: def.colors ? color : undefined };
  return { ok: true };
}

export function unequip(a, slot) {
  if (a.gear) delete a.gear[slot];
}

export const wears = (a, item) => Object.values(a.gear ?? {}).some((g) => g.item === item);

/**
 * Pour monter il faut au moins un filet ou un licol (avec les rênes).
 * Sans selle, ou si on le choisit, on monte « à cru » : un peu moins vite.
 */
export function rideGear(a, wantBareback = false) {
  if (!wears(a, 'bridle') && !wears(a, 'halter')) return { ok: false, reason: 'needBridle' };
  return { ok: true, bareback: wantBareback || !wears(a, 'saddle') };
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
