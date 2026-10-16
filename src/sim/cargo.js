// Coffre de transport : le matériel qu'on emporte en voyage (selles, filets, licols, couvertures,
// outils de soin, trousse de secours, foin, eau, gamelles), avec une place limitée.
// À l'arrivée, ce qui a été emporté est utilisable sur place ; le reste attend à la maison.
// Ce fichier ne dépend pas de la 3D, il est testé dans tests/cargo.test.js.
//
// Sauvegarde :
//   profile.luggage  = { place, items: { halter: 1, … }, tools: ['brush', …], supplies: { hay: 1, … } }
//                      (seulement quand on est loin de la maison : le matériel qui est là-bas avec nous)
//   profile.lastCargo = { brush: 1, hay: 1, … } (le coffre du dernier voyage, proposé la fois suivante)
// Sans profile.luggage (anciennes sauvegardes), tout le matériel est disponible partout, comme avant.

import { GEAR, owned, inUse } from './gear.js';
import { TOOLS, hasTool } from './tools.js';

/** Provisions : on en trouve partout (on n'a pas besoin de les acheter). */
export const SUPPLIES = {
  hay: { emoji: '🌾', size: 2 }, // filets de foin garnis
  water: { emoji: '💧', size: 1 }, // bidons d'eau et seau
  bowls: { emoji: '🥣', size: 1 }, // gamelles et croquettes
};

// Place prise dans le coffre (en « cases ») : une selle prend 2 cases, le matériel d'agility 3.
const TOOL_SIZE = { agilitySet: 3, milkPail: 2 };
const gearSize = (def) => (def.slot === 'saddle' ? 2 : 1);

/**
 * Place dans le coffre selon le véhicule : la sellerie avant de la remorque (ou du camion),
 * le coffre de la voiture, ou les sacoches quand on part à cheval.
 */
export const CAPACITY = { trailer: 14, truck: 18, car: 8, none: 3 };
export const capacityFor = (vehicle) => CAPACITY[vehicle] ?? CAPACITY.car;

/** Les familles d'objets, dans l'ordre d'affichage du coffre. */
export const CARGO_KINDS = ['supply', 'gear', 'tool'];

/** Tous les objets qu'on peut ranger dans le coffre : [{ id, kind, emoji, size, species? }]. */
export function cargoItems() {
  const out = [];
  for (const [id, d] of Object.entries(SUPPLIES)) out.push({ id, kind: 'supply', emoji: d.emoji, size: d.size });
  for (const [id, d] of Object.entries(GEAR)) out.push({ id, kind: 'gear', emoji: d.emoji, size: gearSize(d), species: d.species });
  for (const [id, d] of Object.entries(TOOLS)) {
    if (out.some((x) => x.id === id)) continue;
    out.push({ id, kind: 'tool', emoji: d.emoji, size: TOOL_SIZE[id] ?? 1 });
  }
  return out;
}

export const cargoItem = (id) => cargoItems().find((x) => x.id === id) ?? null;

/** Est-on en voyage avec un coffre ? (sinon tout le matériel est disponible) */
export const isAway = (p) => !!(p.luggage && p.place !== p.home && p.luggage.place === p.place);

/** Un coffre vide. */
export const createCargo = () => ({ items: {} });

/** Combien de cet objet sont dans le coffre. */
export const inCargo = (cargo, id) => cargo?.items?.[id] ?? 0;

/** Cases utilisées dans le coffre. */
export function cargoUsed(cargo) {
  let n = 0;
  for (const [id, count] of Object.entries(cargo?.items ?? {})) n += (cargoItem(id)?.size ?? 1) * count;
  return n;
}

/**
 * Combien de cet objet sont ici et libres (pas déjà portés par un animal) : ce qu'on peut ranger dans le coffre.
 * Les provisions : une de chaque (un filet de foin, des bidons d'eau, des gamelles).
 */
export function available(profile, id) {
  const it = cargoItem(id);
  if (!it) return 0;
  if (it.kind === 'supply') return 1;
  if (it.kind === 'tool') return hasTool(profile, id) ? 1 : 0;
  return Math.max(0, owned(profile, id) - inUse(profile, id));
}

/** Peut-on ranger cet objet ? Renvoie { ok, reason } : 'none' (pas ici), 'max' (tous déjà rangés) ou 'full'. */
export function canPack(profile, cargo, id, capacity) {
  const it = cargoItem(id);
  if (!it) return { ok: false, reason: 'none' };
  const free = available(profile, id);
  if (free <= 0) return { ok: false, reason: 'none' };
  if (inCargo(cargo, id) >= free) return { ok: false, reason: 'max' };
  if (cargoUsed(cargo) + it.size > capacity) return { ok: false, reason: 'full' };
  return { ok: true };
}

/** Range un objet dans le coffre. */
export function pack(profile, cargo, id, capacity) {
  const can = canPack(profile, cargo, id, capacity);
  if (!can.ok) return can;
  cargo.items[id] = inCargo(cargo, id) + 1;
  return { ok: true };
}

/** Sort un objet du coffre. */
export function unpack(cargo, id) {
  const n = inCargo(cargo, id);
  if (n <= 0) return { ok: false, reason: 'none' };
  if (n === 1) delete cargo.items[id];
  else cargo.items[id] = n - 1;
  return { ok: true };
}

const HERBIVORES = ['horse', 'cow', 'sheep', 'goat'];
const PETS = ['dog', 'cat', 'rabbit'];

/**
 * Ce qu'il faut emporter pour ces voyageurs, du plus important au moins important.
 * (les objets que les animaux portent déjà, comme le licol, voyagent avec eux)
 */
export function wishList(travellers = []) {
  const sp = new Set(travellers.map((a) => a.species));
  const has = (...list) => list.some((s) => sp.has(s));
  const wears = (a, item) => Object.values(a.gear ?? {}).some((g) => g?.item === item);
  const list = [];
  if (travellers.length) list.push('water');
  if (has(...HERBIVORES)) list.push('hay');
  if (has(...PETS)) list.push('bowls');
  list.push('firstAid');
  // De quoi monter à cheval sur place, et promener le chien.
  for (const a of travellers) {
    if (a.species === 'horse') {
      if (!wears(a, 'halter')) list.push('halter');
      if (!wears(a, 'bridle')) list.push('bridle');
      if (!wears(a, 'saddle')) list.push('saddle');
    }
    if (a.species === 'dog') {
      if (!wears(a, 'collar')) list.push('collar');
      if (!wears(a, 'leash')) list.push('leash');
    }
  }
  // Les soins de tous les jours.
  list.push('brush', 'treats');
  if (has(...HERBIVORES, 'rabbit') || !travellers.length) list.push('pitchfork');
  if (has('horse')) list.push('hoofKit');
  if (has('dog', 'cat', 'rabbit')) list.push('nailClipper');
  if (has('dog', 'cat')) list.push('ball');
  if (has('sheep')) list.push('shears');
  if (has('cow', 'goat')) list.push('milkPail');
  if (has('horse')) list.push('blanket', 'lungeLine');
  if (has('dog', 'horse')) list.push('shampoo');
  return [...new Set(list)];
}

/**
 * Prépare le coffre : d'abord ce qui était dans le coffre au dernier voyage (s'il y en a un),
 * sinon le nécessaire pour ces voyageurs, tant qu'il y a de la place.
 */
export function suggestCargo(profile, travellers, capacity, { last = profile.lastCargo } = {}) {
  const cargo = createCargo();
  if (last && Object.keys(last).length) {
    for (const [id, n] of Object.entries(last)) for (let i = 0; i < n; i++) pack(profile, cargo, id, capacity);
    // Les provisions indispensables pour ces voyageurs, si on les avait oubliées la dernière fois.
    for (const id of wishList(travellers).filter((x) => SUPPLIES[x])) if (!inCargo(cargo, id)) pack(profile, cargo, id, capacity);
    return cargo;
  }
  for (const id of wishList(travellers)) pack(profile, cargo, id, capacity);
  return cargo;
}

/** Le coffre est-il bien préparé pour ces voyageurs ? Renvoie les provisions qui manquent (['hay', 'water'…]). */
export function missingSupplies(cargo, travellers) {
  return wishList(travellers).filter((id) => SUPPLIES[id] && !inCargo(cargo, id));
}

/**
 * Ce qui est avec nous à l'arrivée : le contenu du coffre, plus ce que portent les animaux qui voyagent.
 * Renvoie null quand on rentre à la maison (tout le matériel y est rangé).
 */
export function luggageOnArrival(profile, cargo, travellers, destId) {
  if (destId === profile.home) return null;
  const items = {};
  const add = (id, n = 1) => { items[id] = (items[id] ?? 0) + n; };
  for (const [id, n] of Object.entries(cargo?.items ?? {})) if (GEAR[id]) add(id, n);
  for (const a of travellers) for (const g of Object.values(a.gear ?? {})) if (g?.item && GEAR[g.item]) add(g.item);
  const tools = Object.keys(cargo?.items ?? {}).filter((id) => TOOLS[id] && !SUPPLIES[id] && !GEAR[id]);
  const supplies = {};
  for (const id of Object.keys(SUPPLIES)) if (inCargo(cargo, id)) supplies[id] = inCargo(cargo, id);
  return { place: destId, items, tools, supplies };
}

/** Arrivée : le matériel emporté est là, le reste attend à la maison. Retient aussi le coffre pour la prochaine fois. */
export function arriveWithCargo(profile, cargo, travellers, destId) {
  const l = luggageOnArrival(profile, cargo, travellers, destId);
  if (l) profile.luggage = l;
  else delete profile.luggage;
  if (cargo) profile.lastCargo = { ...cargo.items };
  return l;
}

/** Ce qu'on a avec soi ici (pour l'afficher) : [{ id, n }] ; null si on est à la maison (ou sans coffre). */
export function luggageHere(profile) {
  if (!isAway(profile)) return null;
  const l = profile.luggage;
  const out = [];
  for (const [id, n] of Object.entries(l.supplies ?? {})) if (n) out.push({ id, n });
  for (const [id, n] of Object.entries(l.items ?? {})) if (n) out.push({ id, n });
  for (const id of l.tools ?? []) out.push({ id, n: 1 });
  return out;
}
