// Équipement des animaux : selles, filets, tapis, guêtres, couvertures, licols, bombe du cavalier,
// et pour les chiens et les chats : manteau, collier, laisse.
// On achète des objets à la sellerie (inventaire du profil), puis on les met sur un animal.
//
// Chaque objet du catalogue est une « variante » d'un type (une selle d'obstacle est une selle) :
//   type : 'saddle' | 'bridle' | 'pad' | 'boots' | 'bells' | 'blanket' | 'halter' | 'flyMask' | 'helmet' | …
//   slot : emplacement sur l'animal (une seule selle à la fois…)
//   sizes : tailles qui existent (poney / cheval / trait) ; on choisit la taille en l'achetant
//   colors : couleurs possibles (clés de COLORS) ; on choisit la couleur quand on le met
//   fx : petit effet de jeu (saut, figures, fatigue en balade, vitesse, confort)
// Les anciens objets (saddle, bridle, blanket, boots, halter…) sont devenus les modèles « de base »
// de leur type : les anciennes sauvegardes restent valables (voir ensureTack).

import { spend } from './profile.js';
import { getBreed } from './species.js';

/** Couleurs des couvertures, licols et colliers (les anciennes sauvegardes utilisent ces clés). */
export const BLANKET_COLORS = { red: 0xb7322c, navy: 0x23395d, green: 0x2f6b45, purple: 0x6b3fa0, pink: 0xe07aa5 };

/** Toutes les couleurs possibles : tissus, cuirs et métaux. */
export const COLORS = {
  ...BLANKET_COLORS,
  sky: 0x5f9fd6,
  turquoise: 0x2a9d9a,
  white: 0xeeeae2,
  grey: 0x8b9097,
  black: 0x1e1b19,
  brown: 0x5a3418, // cuir marron
  havana: 0x8a4a1f, // cuir havane (plus clair)
  tan: 0x8e5627, // cuir fauve (western)
  gold: 0xc9a227,
  silver: 0xbfc5cc,
};

export const SIZES = ['pony', 'horse', 'draft'];
const ALL = SIZES;
const HORSE_UP = ['horse', 'draft'];
const LEATHER = ['brown', 'black', 'havana'];
const CLOTH = ['red', 'navy', 'green', 'purple', 'pink', 'sky'];

/**
 * Catalogue. emoji : icône dans les listes ; discipline : à quoi ça sert ;
 * fx : jump (+ chance au saut), tricks (+ fenêtre des figures au spectacle), trailFatigue (× fatigue en balade),
 * longRide (pas de pénalité pour une longue balade), speed (× vitesse à cheval), comfort (+ câlins après l'effort),
 * minObedience : réservé aux chevaux assez dressés ; weather : protection des couvertures.
 */
export const GEAR = {
  // --- Selles
  saddle: { emoji: '🏇', price: 150, species: ['horse'], slot: 'saddle', type: 'saddle', discipline: 'mixed', sizes: ALL, colors: LEATHER, fx: {} },
  saddleDressage: { emoji: '🎩', price: 260, species: ['horse'], slot: 'saddle', type: 'saddle', discipline: 'dressage', sizes: ALL, colors: ['black', 'brown'], fx: { tricks: 0.04 } },
  saddleJump: { emoji: '🚧', price: 240, species: ['horse'], slot: 'saddle', type: 'saddle', discipline: 'jumping', sizes: ['pony', 'horse'], colors: ['brown', 'havana', 'black'], fx: { jump: 0.05 } },
  saddleTrail: { emoji: '🧭', price: 220, species: ['horse'], slot: 'saddle', type: 'saddle', discipline: 'trail', sizes: ALL, colors: ['havana', 'brown', 'black'], fx: { trailFatigue: 0.6, longRide: true } },
  saddleWestern: { emoji: '🤠', price: 280, species: ['horse'], slot: 'saddle', type: 'saddle', discipline: 'western', sizes: ALL, colors: ['tan', 'brown', 'black'], fx: { trailFatigue: 0.8, longRide: true, comfort: 2 } },
  saddlePony: { emoji: '🐴', price: 110, species: ['horse'], slot: 'saddle', type: 'saddle', discipline: 'ponyclub', sizes: ['pony'], colors: ['brown', 'black', 'pink', 'sky'], fx: { trailFatigue: 0.85, comfort: 1 } },
  saddleRace: { emoji: '🏁', price: 200, species: ['horse'], slot: 'saddle', type: 'saddle', discipline: 'racing', sizes: ['horse'], colors: ['black', 'brown', 'white'], fx: { speed: 1.12, trailFatigue: 1.3 } },
  // --- Filets et embouchures
  bridle: { emoji: '🪢', price: 60, species: ['horse'], slot: 'bridle', type: 'bridle', discipline: 'everyday', sizes: ALL, colors: ['brown', 'black'], fx: {} },
  bridleOlive: { emoji: '🫒', price: 75, species: ['horse'], slot: 'bridle', type: 'bridle', discipline: 'jumping', sizes: ALL, colors: ['brown', 'black', 'havana'], fx: { jump: 0.02, tricks: 0.01 } },
  hackamore: { emoji: '🌀', price: 70, species: ['horse'], slot: 'bridle', type: 'bridle', discipline: 'gentle', sizes: ALL, colors: ['brown', 'black'], fx: { jump: -0.03, tricks: -0.02, comfort: 3 } },
  doubleBridle: { emoji: '👑', price: 140, species: ['horse'], slot: 'bridle', type: 'bridle', discipline: 'dressage', sizes: HORSE_UP, colors: ['black', 'brown'], fx: { tricks: 0.05 }, minObedience: 50 },
  // --- Tapis et amortisseurs (sous la selle)
  saddlePad: { emoji: '🟦', price: 30, species: ['horse'], slot: 'pad', type: 'pad', discipline: 'comfort', sizes: ALL, colors: ['white', ...CLOTH, 'black'], fx: { comfort: 3 } },
  gelPad: { emoji: '🧽', price: 55, species: ['horse'], slot: 'pad', type: 'pad', discipline: 'comfort', sizes: ALL, colors: ['white', 'black', 'grey'], fx: { comfort: 5, trailFatigue: 0.9 } },
  // --- Guêtres et cloches
  boots: { emoji: '🧦', price: 50, species: ['horse'], slot: 'legs', type: 'boots', discipline: 'protection', sizes: ALL, colors: ['navy', 'black', 'white', 'red', 'pink', 'sky'], fx: {} }, // +6 % au saut : voir activities.js (guêtres)
  bellBoots: { emoji: '🔔', price: 30, species: ['horse'], slot: 'bells', type: 'bells', discipline: 'protection', sizes: ALL, colors: ['black', 'navy', 'purple', 'pink'], fx: { jump: 0.03 } },
  // --- Couvertures
  blanketSummer: { emoji: '🦟', price: 45, species: ['horse'], slot: 'blanket', type: 'blanket', discipline: 'weather', sizes: ALL, colors: ['white', 'sky', 'pink', 'green'], fx: {}, weather: { flies: true, hotAt: 99 } },
  blanketRain: { emoji: '☔', price: 60, species: ['horse'], slot: 'blanket', type: 'blanket', discipline: 'weather', sizes: ALL, colors: ['green', 'navy', 'grey', 'purple'], fx: {}, weather: { rain: true, hotAt: 24 } },
  blanket: { emoji: '🧣', price: 70, species: ['horse'], slot: 'blanket', type: 'blanket', discipline: 'weather', sizes: ALL, colors: ['red', 'navy', 'green', 'purple', 'pink'], fx: {}, weather: { rain: true, snow: true, hotAt: 18 } },
  // --- Licols et longes
  halter: { emoji: '🔗', price: 25, species: ['horse', 'cow', 'goat'], slot: 'halter', type: 'halter', discipline: 'everyday', sizes: ALL, colors: ['red', 'navy', 'green', 'purple', 'pink', 'sky', 'black'], fx: {} },
  halterLeather: { emoji: '🟫', price: 45, species: ['horse', 'cow', 'goat'], slot: 'halter', type: 'halter', discipline: 'show', sizes: ALL, colors: ['brown', 'havana', 'black'], fx: { tricks: 0.01, comfort: 1 } },
  halterRope: { emoji: '🪢', price: 35, species: ['horse', 'cow', 'goat'], slot: 'halter', type: 'halter', discipline: 'groundwork', sizes: ALL, colors: ['turquoise', 'black', 'red', 'purple', 'white'], fx: { tricks: 0.02 } },
  // --- Bonnet anti-mouches
  flyMask: { emoji: '🕸️', price: 35, species: ['horse', 'cow'], slot: 'head', type: 'flyMask', discipline: 'weather', sizes: ALL, colors: ['white', 'sky', 'pink'], fx: {} },
  // --- Bombe du cavalier (portée par le joueur quand il monte)
  helmet: { emoji: '⛑️', price: 60, species: ['rider'], slot: 'helmet', type: 'helmet', discipline: 'rider', colors: ['black', 'navy', 'brown', 'white'], fx: {} },
  helmetSparkle: { emoji: '✨', price: 90, species: ['rider'], slot: 'helmet', type: 'helmet', discipline: 'rider', colors: ['pink', 'purple', 'sky', 'silver', 'gold'], fx: {} },
  // --- Chiens et chats
  dogCoat: { emoji: '🧥', price: 40, species: ['dog'], slot: 'blanket', type: 'dogCoat', discipline: 'pets', colors: ['red', 'navy', 'green', 'purple', 'pink'], fx: {}, weather: { rain: true, snow: true, hotAt: 18 } },
  collar: { emoji: '📿', price: 15, species: ['dog', 'cat'], slot: 'neck', type: 'collar', discipline: 'pets', colors: ['red', 'navy', 'green', 'purple', 'pink'], fx: {} },
  leash: { emoji: '🦮', price: 15, species: ['dog'], slot: 'leash', type: 'leash', discipline: 'pets', fx: {} },
};

/** Rayons de la sellerie (ordre d'affichage). */
export const TACK_CATEGORIES = [
  { id: 'saddle', emoji: '🏇', items: ['saddle', 'saddleDressage', 'saddleJump', 'saddleTrail', 'saddleWestern', 'saddlePony', 'saddleRace'] },
  { id: 'bridle', emoji: '🪢', items: ['bridle', 'bridleOlive', 'hackamore', 'doubleBridle'] },
  { id: 'pad', emoji: '🟦', items: ['saddlePad', 'gelPad'] },
  { id: 'legs', emoji: '🧦', items: ['boots', 'bellBoots'] },
  { id: 'blanket', emoji: '🧣', items: ['blanketSummer', 'blanketRain', 'blanket', 'flyMask'] },
  { id: 'halter', emoji: '🔗', items: ['halter', 'halterLeather', 'halterRope'] },
  { id: 'helmet', emoji: '⛑️', items: ['helmet', 'helmetSparkle'] },
  { id: 'pets', emoji: '🐶', items: ['collar', 'leash', 'dogCoat'] },
];

const TYPES = new Set(Object.values(GEAR).map((d) => d.type));

/** Tout nouveau profil reçoit un licol, un filet, une selle et une bombe (et de quoi promener un chien). */
export const STARTER_ITEMS = { halter: 1, bridle: 1, saddle: 1, collar: 1, leash: 1, helmet: 1 };

// ---------------------------------------------------------------- tailles

/** Gabarit d'un cheval : 'pony', 'horse' ou 'draft' (trait). null pour les autres animaux. */
export function sizeOf(a) {
  if (a?.species !== 'horse') return null;
  const b = getBreed('horse', a.breed);
  if (b?.size) return b.size;
  if (b?.type === 'mini' || b?.type === 'pony') return 'pony';
  if (b?.type === 'draft') return 'draft';
  const s = b?.scale ?? 1;
  if (s <= 0.86) return 'pony';
  if (s >= 1.06 && (b?.fluff ?? 1) >= 1.12) return 'draft';
  return 'horse';
}

/** Taille par défaut d'un objet (celle des anciennes sauvegardes) : cheval s'il existe en cheval. */
export function defaultSize(id) {
  const s = GEAR[id]?.sizes;
  if (!s) return null;
  return s.includes('horse') ? 'horse' : s[0];
}

/** Clé d'inventaire : l'objet seul pour la taille par défaut, sinon « objet@taille ». */
export const stockKey = (id, size) => (!size || size === defaultSize(id) ? id : `${id}@${size}`);

export function parseKey(key) {
  const [id, size] = key.split('@');
  return { id, size: size ?? defaultSize(id) };
}

/** Prix selon la taille : un peu moins cher en poney, un peu plus en trait. */
export function gearPrice(id, size = defaultSize(id)) {
  const base = GEAR[id]?.price ?? 0;
  const k = size === 'pony' ? 0.85 : size === 'draft' ? 1.15 : 1;
  return Math.round((base * k) / 5) * 5;
}

/** L'objet est-il fait pour cet animal (espèce et taille) ? Renvoie null ou la raison. */
export function fitReason(id, a) {
  const def = GEAR[id];
  if (!def || !def.species.includes(a.species)) return 'wrongSpecies';
  const s = sizeOf(a);
  if (def.sizes && s && !def.sizes.includes(s)) return 'noSize';
  return null;
}

/** Taille à mettre sur cet animal (null si l'objet n'a pas de tailles). */
export const sizeFor = (id, a) => (GEAR[id]?.sizes ? (sizeOf(a) ?? defaultSize(id)) : null);

// ---------------------------------------------------------------- inventaire

/**
 * Met à jour une ancienne sauvegarde (une seule fois) : chaque objet porté prend la taille de son
 * animal (on « échange » l'unité de taille cheval), et le cavalier reçoit une bombe.
 */
export function ensureTack(p) {
  if (!p || p.tackVersion >= 2) return p;
  p.items = p.items ?? {};
  for (const a of p.animals ?? []) {
    for (const g of Object.values(a.gear ?? {})) {
      const def = GEAR[g.item];
      if (!def?.sizes || g.size) continue;
      const s = sizeOf(a);
      if (!s || s === defaultSize(g.item) || !def.sizes.includes(s)) continue;
      const from = g.item;
      const to = stockKey(g.item, s);
      if ((p.items[from] ?? 0) > 0) {
        p.items[from] -= 1;
        if (!p.items[from]) delete p.items[from];
      }
      p.items[to] = (p.items[to] ?? 0) + 1;
      // En voyage : l'objet porté est aussi dans le coffre (sauvegarde d'avant les tailles).
      const l = p.luggage?.items;
      if (l && a.location === p.luggage.place && (l[from] ?? 0) > 0) {
        l[from] -= 1;
        if (!l[from]) delete l[from];
        l[to] = (l[to] ?? 0) + 1;
      }
      g.size = s;
    }
  }
  if (!p.items.helmet && !p.items.helmetSparkle) p.items.helmet = 1;
  p.rider = p.rider ?? {};
  if (p.rider.helmet === undefined) p.rider.helmet = { item: p.items.helmet ? 'helmet' : 'helmetSparkle', color: 'black' };
  p.tackVersion = 2;
  return p;
}

// ---------------------------------------------------------------- en voyage (coffre de transport)
// En voyage, seul le matériel emporté dans le coffre de transport est là (profile.luggage, src/sim/cargo.js),
// rangé par taille avec les mêmes clés que la sellerie (stockKey : 'saddle', 'saddle@pony'…).
// profile.items reste TOUT ce qu'on possède (la maison + le coffre) ; profile.luggage.items en est une partie.
// Sans coffre (anciennes sauvegardes) ou à la maison : tout le matériel acheté est disponible, comme avant.

/** Est-on en voyage avec un coffre ? */
export const isAway = (p) => !!(p?.luggage && p.place !== p.home && p.luggage.place === p.place);

/** Le stock d'ici : le coffre du voyage, ou tout le matériel (à la maison). */
const stockHere = (p) => (isAway(p) ? p.luggage.items ?? {} : p.items ?? {});

/** Les animaux d'ici : en voyage, ceux qui sont là ; à la maison, tous (comme avant). */
const animalsHere = (p) => (isAway(p) ? (p.animals ?? []).filter((a) => a.location === p.place) : p.animals ?? []);

/** Un objet (variante) correspond-il à cette clé ? La clé peut être un type : 'bridle' = tous les filets. */
const matches = (id, key) => id === key || (TYPES.has(key) && GEAR[id]?.type === key);

/** Combien de ces objets dans un stock (toutes tailles, ou une taille précise). */
function countIn(items, key, size = null) {
  let n = 0;
  for (const [k, c] of Object.entries(items ?? {})) {
    const pk = parseKey(k);
    if (matches(pk.id, key) && (!size || pk.size === size)) n += c;
  }
  return n;
}

/** Combien on en a ici. key : une variante ('saddleJump') ou un type ('saddle' = toutes les selles). */
export function owned(profile, key) {
  ensureTack(profile);
  return countIn(stockHere(profile), key);
}

/** Combien de ces objets sont déjà portés par des animaux d'ici (même règle de clé que owned). */
export function inUse(profile, key) {
  ensureTack(profile);
  let n = 0;
  for (const a of animalsHere(profile)) for (const g of Object.values(a.gear ?? {})) if (matches(g.item, key)) n++;
  return n;
}

/**
 * Cet objet est-il resté à la maison ? (en voyage : on en a plus à la maison que dans le coffre)
 * size : une taille précise (sinon toutes les tailles).
 */
export function leftAtHome(profile, key, size = null) {
  if (!isAway(profile)) return false;
  ensureTack(profile);
  return countIn(profile.items, key, size) > countIn(profile.luggage.items, key, size);
}

/**
 * Combien d'exemplaires de cette variante (à cette taille, ou toutes tailles si size est null) sont à la maison
 * et pas dans le coffre du voyage. 0 quand on n'est pas en voyage.
 */
export function atHomeCount(profile, id, size = null) {
  if (!isAway(profile)) return 0;
  const left = (sz) => {
    const k = stockKey(id, sz);
    return Math.max(0, (profile.items?.[k] ?? 0) - (profile.luggage.items?.[k] ?? 0));
  };
  return size !== null ? left(size) : (GEAR[id]?.sizes ?? [null]).reduce((n, sz) => n + left(sz), 0);
}

const atHome = (profile, id, size = null) => atHomeCount(profile, id, size) > 0;

/** Nombre d'exemplaires d'une variante précise (toutes tailles) : ownedVariant(p, 'saddle') = les selles mixtes. */
export function ownedVariant(profile, id) {
  ensureTack(profile);
  let n = 0;
  for (const [k, c] of Object.entries(stockHere(profile))) if (parseKey(k).id === id) n += c;
  return n;
}

/** Nombre d'exemplaires d'une variante dans une taille précise (ici : à la maison, ou dans le coffre en voyage). */
export const ownedStock = (profile, id, size = defaultSize(id)) => stockHere(profile)[stockKey(id, size)] ?? 0;

/** Animaux d'ici qui portent cette variante dans cette taille. */
export function wornBy(profile, id, size = defaultSize(id)) {
  return animalsHere(profile).filter((a) => Object.values(a.gear ?? {}).some((g) => g.item === id && (g.size ?? defaultSize(id)) === size));
}

/** Exemplaires libres (rangés à la sellerie) d'une variante dans une taille. */
export const freeStock = (profile, id, size = defaultSize(id)) => ownedStock(profile, id, size) - wornBy(profile, id, size).length;

/** Toutes les tailles possédées d'une variante : [{ size, owned, free }]. */
export function stockOf(profile, id) {
  ensureTack(profile);
  const sizes = GEAR[id]?.sizes ?? [null];
  return sizes.map((s) => {
    const size = s ?? null;
    const own = stockHere(profile)[stockKey(id, size)] ?? 0;
    const used = wornBy(profile, id, size ?? defaultSize(id)).length;
    return { size, owned: own, free: own - used };
  }).filter((x) => x.owned > 0);
}

/** Acheter un objet (dans une taille). Gratuit en bac à sable. En voyage, il va dans le coffre : il est là. */
export function buyGear(profile, item, size = defaultSize(item)) {
  ensureTack(profile);
  const def = GEAR[item];
  if (!def) return { ok: false, reason: 'unknown' };
  if (def.sizes && !def.sizes.includes(size)) return { ok: false, reason: 'noSize' };
  if (!spend(profile, gearPrice(item, size))) return { ok: false, reason: 'money' };
  profile.items = profile.items ?? {};
  const key = stockKey(item, def.sizes ? size : null);
  profile.items[key] = (profile.items[key] ?? 0) + 1;
  if (isAway(profile)) {
    const l = (profile.luggage.items = profile.luggage.items ?? {});
    l[key] = (l[key] ?? 0) + 1; // acheté ici : on le rapportera à la maison
  }
  return { ok: true, size };
}

/**
 * Met un objet sur l'animal. color : clé de COLORS (sinon la première couleur du modèle).
 * item peut être un type ('bridle') : on prend alors un filet libre qui lui va.
 * exact : on veut CE modèle-là (bouton d'une fiche) — jamais un autre modèle du même type, même si
 * le modèle de base a le nom de son type ('saddle' = la selle mixte) ; sans exemplaire libre, on
 * échange la taille (autoSwap) ou on répond notOwned / wrongSize.
 * autoSwap : à la maison, la sellière échange gratuitement un exemplaire rangé d'une autre taille
 * (le licol taille cheval offert au début devient un licol poney pour un Shetland).
 * En voyage, seul ce qui est dans le coffre compte (à la bonne taille) : sinon leftAtHome (resté à la
 * maison) ou wrongSizeAway (celui du coffre n'est pas à sa taille, et la sellière est loin).
 * Renvoie { ok, item } : item est le modèle vraiment mis (à nommer dans le message).
 */
export function equip(profile, a, item, color, { autoSwap = false, exact = false } = {}) {
  ensureTack(profile);
  let id = item;
  const def0 = GEAR[id];
  if (!def0) return { ok: false, reason: 'wrongSpecies' };
  const size = () => sizeFor(id, a);
  const freeFor = (v) => freeStock(profile, v, sizeFor(v, a)) > 0 && !fitReason(v, a);
  const swappable = (v) => !fitReason(v, a) && (GEAR[v].sizes ?? []).some((sz) => freeStock(profile, v, sz) > 0);
  const wearing = (v) => a.gear?.[GEAR[v].slot]?.item === v && (a.gear[GEAR[v].slot].size ?? defaultSize(v)) === sizeFor(v, a);
  const typeAsked = !exact && TYPES.has(item);
  const types = typeAsked ? Object.keys(GEAR).filter((v) => GEAR[v].type === item) : [];
  // Un type demandé : si le modèle de base n'est pas libre, un autre modèle du même type fera l'affaire.
  if (typeAsked && !wearing(id) && !freeFor(id)) {
    const other = types.find(freeFor) ?? (autoSwap && !swappable(id) ? types.find(swappable) : null);
    if (other) id = other;
  }
  const def = GEAR[id];
  const fit = fitReason(id, a);
  if (fit) return { ok: false, reason: fit };
  if (def.minObedience && (a.skills?.obedience ?? 0) < def.minObedience) return { ok: false, reason: 'tooAdvanced', need: def.minObedience };
  let swapped = null;
  if (!wearing(id) && freeStock(profile, id, size()) <= 0) {
    const away = isAway(profile);
    // En voyage : celui qui lui va (à sa taille) est resté à la maison, pas dans le coffre.
    if (away && (atHome(profile, id, size()) || types.some((v) => !fitReason(v, a) && atHome(profile, v, sizeFor(v, a))))) {
      return { ok: false, reason: 'leftAtHome', item: id, need: size() };
    }
    // On en a un, mais pas à la bonne taille : échange gratuit à la sellerie.
    const other = (def.sizes ?? []).find((s) => s !== size() && freeStock(profile, id, s) > 0);
    if (!other) return { ok: false, reason: away && atHome(profile, id) ? 'leftAtHome' : 'notOwned', item: id, need: size() };
    // (en voyage, la sellière est loin : pas d'échange de taille)
    if (away) return { ok: false, reason: 'wrongSizeAway', have: other, need: size() };
    if (!autoSwap) return { ok: false, reason: 'wrongSize', have: other, need: size() };
    swapSize(profile, id, other, size());
    swapped = size();
  }
  a.gear = a.gear ?? {};
  const colors = def.colors ?? [];
  const c = colors.includes(color) ? color : colors.includes(a.gear[def.slot]?.color) && a.gear[def.slot]?.item === id ? a.gear[def.slot].color : colors[0];
  const entry = { item: id, color: c };
  const s = size();
  if (s && s !== defaultSize(id)) entry.size = s;
  a.gear[def.slot] = entry;
  return { ok: true, item: id, swapped };
}

/**
 * Échange gratuit à la sellerie : un exemplaire rangé change de taille (le bon gabarit pour un autre cheval).
 */
export function swapSize(profile, id, from, to) {
  ensureTack(profile);
  if (isAway(profile)) return { ok: false, reason: 'away' }; // en voyage : la sellière est restée à la maison
  const def = GEAR[id];
  if (!def?.sizes?.includes(to) || from === to) return { ok: false, reason: 'noSize' };
  if (freeStock(profile, id, from) <= 0) return { ok: false, reason: 'notOwned' };
  const kf = stockKey(id, from);
  profile.items[kf] -= 1;
  if (!profile.items[kf]) delete profile.items[kf];
  const kt = stockKey(id, to);
  profile.items[kt] = (profile.items[kt] ?? 0) + 1;
  return { ok: true };
}

export function unequip(a, slot) {
  if (a.gear) delete a.gear[slot];
}

/** L'animal porte-t-il cet objet ? key : une variante, ou un type ('saddle' = n'importe quelle selle). */
export const wears = (a, key) => Object.values(a.gear ?? {}).some((g) => matches(g.item, key));

/** L'objet porté à cet emplacement (sa définition), ou null. */
export const wornDef = (a, slot) => GEAR[a.gear?.[slot]?.item] ?? null;

/** Bien au chaud par grand froid : une couverture (ou un manteau) qui protège de la neige et du froid. */
export const keepsWarm = (a) => !!wornDef(a, 'blanket')?.weather?.snow;

// ---------------------------------------------------------------- bombe du cavalier

/** La bombe que le cavalier met pour monter : { item, color } ou null. */
export function riderHelmet(profile) {
  ensureTack(profile);
  const h = profile.rider?.helmet;
  return h && owned(profile, h.item) > 0 ? h : null;
}

/** Choisir sa bombe (et sa couleur). */
export function equipHelmet(profile, item, color) {
  ensureTack(profile);
  const def = GEAR[item];
  if (def?.type !== 'helmet') return { ok: false, reason: 'wrongSpecies' };
  if (owned(profile, item) <= 0) return { ok: false, reason: atHome(profile, item) ? 'leftAtHome' : 'notOwned' };
  profile.rider.helmet = { item, color: def.colors.includes(color) ? color : def.colors[0] };
  return { ok: true };
}

// ---------------------------------------------------------------- effets en jeu

/**
 * Effets de tout ce que porte l'animal, additionnés :
 * jump (+ chance au saut), tricks (+ fenêtre de réussite des figures), trailFatigue (× fatigue en balade),
 * longRide (pas de pénalité si la balade est longue), speed (× vitesse à cheval), comfort (+ câlins après l'effort).
 */
export function tackEffects(a) {
  const fx = { jump: 0, tricks: 0, trailFatigue: 1, longRide: false, speed: 1, comfort: 0 };
  for (const g of Object.values(a?.gear ?? {})) {
    const f = GEAR[g.item]?.fx;
    if (!f) continue;
    fx.jump += f.jump ?? 0;
    fx.tricks += f.tricks ?? 0;
    fx.trailFatigue *= f.trailFatigue ?? 1;
    fx.longRide = fx.longRide || !!f.longRide;
    fx.speed *= f.speed ?? 1;
    fx.comfort += f.comfort ?? 0;
  }
  return fx;
}

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
 * Couverture d'hiver : protège de la pluie, de la neige et du froid, mais donne chaud dès 18 °C.
 * Imperméable : protège de la pluie, chaude seulement au-dessus de 24 °C.
 * Chemise d'été : contre les mouches, ne tient jamais chaud. Le bonnet protège aussi des mouches.
 */
export function feltWeather(a, weather, temperature, season) {
  const cover = wornDef(a, 'blanket')?.weather;
  if (cover) {
    if (temperature >= cover.hotAt) return 'heat';
    if (cover.rain && ['rain', 'storm'].includes(weather)) return 'clear';
    if (cover.snow && (weather === 'snow' || temperature < 8)) return 'clear';
  }
  if (season === 'summer' && weather === 'clear' && ['horse', 'cow'].includes(a.species) && !wears(a, 'flyMask') && !cover?.flies) return 'flies';
  return weather;
}
