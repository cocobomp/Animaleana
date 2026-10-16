// Bâtiments qu'on entretient : propreté des pièces et des box, usure (à réparer),
// améliorations achetées, et attribution d'un box à chaque cheval.
// Logique pure (sans 3D), testée dans tests/facilities.test.js.

import { spend, canAfford } from './profile.js';
import { levelOf } from './progress.js';

/**
 * Box de l'écurie. Elle en a 8 au début (4 utilisables, les autres débloqués par des améliorations) ;
 * on peut la rallonger deux fois (vue construction) : 12 puis 16 box, 4 de plus utilisables à chaque fois.
 */
export const STABLE_SIZES = [8, 12, 16];
export const MAX_BOXES = STABLE_SIZES[STABLE_SIZES.length - 1];
export const BASE_BOXES = 4;
/** Rallonger l'écurie : prix (mode gestion) et niveau requis, pour passer à la taille suivante. */
export const STABLE_EXTENSIONS = [{ price: 900, level: 3 }, { price: 1600, level: 5 }];
export const EXTENSION_BOXES = 4;
/** Prix de la paille fraîche pour un box (mode gestion). */
export const STRAW_COST = 4;

/** Pièces de chaque bâtiment (en plus des box de l'écurie). */
export const ROOMS = {
  stable: ['aisle'],
  house: ['living', 'kitchen', 'bedroom'],
  pen: ['fold'],
};
export const FACILITY_KINDS = Object.keys(ROOMS);

/**
 * Améliorations par bâtiment. price : prix en mode gestion ; level : niveau requis ;
 * boxes : box en plus ; requires : amélioration à acheter avant.
 */
export const UPGRADES = {
  stable: [
    { id: 'lights', icon: '💡', price: 120, level: 2 },
    { id: 'boxes1', icon: '🐴', price: 300, level: 3, boxes: 2 },
    { id: 'waterers', icon: '🚰', price: 250, level: 4 },
    { id: 'mats', icon: '🟫', price: 180, level: 5 },
    { id: 'heater', icon: '♨️', price: 200, level: 5 },
    { id: 'boxes2', icon: '🐴', price: 500, level: 6, boxes: 2, requires: 'boxes1' },
  ],
  house: [
    { id: 'basket', icon: '🧺', price: 60, level: 1 },
    { id: 'heater', icon: '♨️', price: 200, level: 4 },
    { id: 'vacuum', icon: '🤖', price: 350, level: 6 },
  ],
  pen: [
    { id: 'lights', icon: '💡', price: 100, level: 3 },
    { id: 'heater', icon: '♨️', price: 200, level: 6 },
  ],
};

/** Corvées : quelle pièce elles nettoient. */
export const CHORES = {
  muck: { icon: '🧹' }, // curer un box (enlever le crottin)
  straw: { icon: '🌾', cost: STRAW_COST }, // changer la paille d'un box
  sweep: { icon: '🧹', room: ['stable', 'aisle'] }, // balayer l'allée
  living: { icon: '🧽', room: ['house', 'living'] }, // ranger et passer l'aspirateur au salon
  kitchen: { icon: '🍽️', room: ['house', 'kitchen'] }, // faire la vaisselle
  bedroom: { icon: '🛏️', room: ['house', 'bedroom'] }, // faire le lit, ranger la chambre
  fold: { icon: '🧹', room: ['pen', 'fold'] }, // nettoyer l'abri du troupeau
};

const clamp = (v) => Math.max(0, Math.min(100, v));

function freshBuilding(kind) {
  return { wear: 100, rooms: Object.fromEntries(ROOMS[kind].map((r) => [r, 100])), upgrades: [] };
}

export function defaultFacilities() {
  return {
    stable: freshBuilding('stable'),
    house: freshBuilding('house'),
    pen: freshBuilding('pen'),
    boxes: Array.from({ length: MAX_BOXES }, () => ({ clean: 100, straw: 100 })),
  };
}

/** Complète une sauvegarde ancienne ou partielle. Renvoie l'objet facilities du profil. */
export function ensureFacilities(profile) {
  const fresh = defaultFacilities();
  const f = profile.facilities ?? {};
  for (const kind of FACILITY_KINDS) {
    const b = f[kind] ?? {};
    f[kind] = { ...fresh[kind], ...b, rooms: { ...fresh[kind].rooms, ...b.rooms }, upgrades: [...(b.upgrades ?? [])] };
  }
  const boxes = Array.isArray(f.boxes) ? f.boxes : [];
  f.boxes = fresh.boxes.map((d, i) => ({ ...d, ...boxes[i] }));
  profile.facilities = f;
  return f;
}

export const hasUpgrade = (f, kind, id) => !!f[kind]?.upgrades.includes(id);

/** Taille de l'écurie : 0 (8 box), 1 (12 box) ou 2 (16 box). */
export const stableExt = (f) => Math.max(0, Math.min(STABLE_SIZES.length - 1, Math.floor(f.stable?.ext ?? 0)));
/** Box construits (utilisables ou non). */
export const stableSlots = (f) => STABLE_SIZES[stableExt(f)];

/** Nombre de box utilisables. */
export function boxCount(f) {
  const upgrades = UPGRADES.stable.filter((u) => u.boxes && hasUpgrade(f, 'stable', u.id)).reduce((s, u) => s + u.boxes, 0);
  return Math.min(stableSlots(f), BASE_BOXES + upgrades + stableExt(f) * EXTENSION_BOXES);
}

/** Peut-on rallonger l'écurie ? reason : 'max' | 'level' | 'money'. */
export function canExtendStable(profile) {
  const f = ensureFacilities(profile);
  const ext = stableExt(f);
  const next = STABLE_EXTENSIONS[ext];
  if (!next) return { ok: false, reason: 'max' };
  if (levelOf(profile.xp ?? 0) < next.level) return { ok: false, reason: 'level', level: next.level };
  if (!canAfford(profile, next.price)) return { ok: false, reason: 'money', price: next.price };
  return { ok: true, price: next.price, boxes: STABLE_SIZES[ext + 1] };
}

/** Rallonge l'écurie (le bâtiment, l'allée et les box suivent : src/game/models/stableInterior.js). */
export function extendStable(profile) {
  const check = canExtendStable(profile);
  if (!check.ok) return check;
  spend(profile, check.price);
  profile.facilities.stable.ext = stableExt(profile.facilities) + 1;
  return { ok: true, ext: profile.facilities.stable.ext, boxes: check.boxes };
}

// Emprise de l'écurie à la maison (repère du monde). Elle est tournée d'un quart de tour : sa longueur
// suit l'axe z, sa porte regarde vers +x (la cour). Le bout nord reste contre le paddock ;
// on la rallonge vers le sud, et la sellerie recule d'autant.
export const STABLE_PLAN = { x: -22, north: 6, depth: 10, length: 16, column: 3.2 };

/** Longueur de l'écurie (m) pour une taille donnée : deux rangées de box de plus à chaque fois. */
export const stableLength = (ext) => STABLE_PLAN.length + ext * 2 * STABLE_PLAN.column;

/** Rectangle au sol de l'écurie { x, z, hw, hd }. */
export function stableRect(ext) {
  const len = stableLength(ext);
  return { x: STABLE_PLAN.x, z: STABLE_PLAN.north - len / 2, hw: STABLE_PLAN.depth / 2, hd: len / 2 };
}

/** Sellerie (à côté de l'écurie, au sud) : position de son centre. */
export const tackRoomPos = (ext) => ({ x: -24, z: STABLE_PLAN.north - stableLength(ext) - 7 });
export const TACKROOM_SIZE = { hw: 3.0, hd: 4.0 }; // la sellerie où l'on entre : 8 m × 6 m (src/game/models/tackRoomInterior.js)

/**
 * Maison des animaux : en face de la sellerie, de l'autre côté de l'allée. Elle recule avec elle quand
 * on rallonge l'écurie (sinon l'écurie rallongée la touchait presque : plus de passage le long de la façade).
 * door : où l'on se tient pour y entrer (côté cour, +z).
 */
export function petHousePos(ext) {
  const z = tackRoomPos(ext).z;
  return { x: -12, z, door: { x: -12, z: z + 3.6 } };
}
export const PETHOUSE_SIZE = { hw: 4.3, hd: 2.8 };

/** Confort d'un box (0–100) : moyenne de la propreté et de la fraîcheur de la paille. */
export const boxComfort = (box) => (box.clean + box.straw) / 2;

/** Propreté d'un bâtiment (0–100). Pour l'écurie, l'allée compte autant que la moyenne des box. */
export function cleanliness(f, kind) {
  const b = f[kind];
  const rooms = Object.values(b.rooms);
  const roomAvg = rooms.reduce((s, v) => s + v, 0) / rooms.length;
  if (kind !== 'stable') return Math.round(roomAvg);
  const n = boxCount(f);
  const boxAvg = f.boxes.slice(0, n).reduce((s, x) => s + boxComfort(x), 0) / n;
  return Math.round((roomAvg + boxAvg) / 2);
}

export const condition = (f, kind) => Math.round(f[kind].wear);

/**
 * Le temps passe pour les bâtiments.
 * ctx : { stalled: [index des box occupés], horses, pets, livestock, helpers: { stable, house, pen } }
 */
export function tickFacilities(f, hours, ctx = {}) {
  const stalled = new Set(ctx.stalled ?? []);
  const mats = hasUpgrade(f, 'stable', 'mats') ? 0.6 : 1;
  const n = boxCount(f);
  const helped = ctx.helpers ?? {};
  f.boxes.forEach((box, i) => {
    if (i >= n) return;
    if (stalled.has(i)) {
      box.clean = clamp(box.clean - 5 * mats * hours);
      box.straw = clamp(box.straw - 2.5 * hours);
    } else {
      box.straw = clamp(box.straw - 0.2 * hours);
    }
    // Un palefrenier entretient les box tout seul (un peu moins bien qu'à la main).
    if (helped.stable) {
      box.clean = clamp(Math.min(Math.max(box.clean, 75), box.clean + 15 * hours));
      box.straw = clamp(Math.min(Math.max(box.straw, 75), box.straw + 8 * hours));
    }
  });
  const r = (kind, room, rate, help) => {
    const b = f[kind];
    b.rooms[room] = clamp(b.rooms[room] - rate * hours);
    if (help) b.rooms[room] = clamp(Math.min(Math.max(b.rooms[room], 75), b.rooms[room] + 6 * hours));
  };
  r('stable', 'aisle', 0.6 + 0.3 * (ctx.horses ?? 0), helped.stable);
  r('house', 'living', 0.8 + 0.6 * (ctx.pets ?? 0), helped.house || hasUpgrade(f, 'house', 'vacuum'));
  r('house', 'kitchen', 1, helped.house);
  r('house', 'bedroom', 0.6, false);
  r('pen', 'fold', 0.5 + 0.5 * (ctx.livestock ?? 0), helped.pen);

  // Usure : un bâtiment sale ou très occupé s'abîme plus vite.
  const wear = (kind, rate) => {
    const dirty = cleanliness(f, kind) < 30 ? 1.5 : 1;
    f[kind].wear = clamp(f[kind].wear - rate * dirty * hours);
  };
  wear('stable', 0.04 + 0.01 * (ctx.horses ?? 0));
  wear('house', 0.03);
  wear('pen', 0.03 + 0.005 * (ctx.livestock ?? 0));
}

/**
 * La corvée est-elle possible ? Mêmes règles que doChore, sans rien changer ni dépenser :
 * on le vérifie avant de lancer le mini-jeu, pour ne pas jouer pour rien.
 */
export function canChore(profile, kind, target = null) {
  const f = ensureFacilities(profile);
  const c = CHORES[kind];
  if (!c) return { ok: false, reason: 'unknown' };
  if (kind === 'muck' || kind === 'straw') {
    if (target === null || target < 0 || target >= boxCount(f)) return { ok: false, reason: 'locked' };
    const field = kind === 'muck' ? 'clean' : 'straw';
    if (f.boxes[target][field] >= 97) return { ok: false, reason: 'alreadyClean' };
    if (c.cost && !canAfford(profile, c.cost)) return { ok: false, reason: 'money' };
    return { ok: true };
  }
  const [b, room] = c.room;
  if (f[b].rooms[room] >= 97) return { ok: false, reason: 'alreadyClean' };
  return { ok: true };
}

/** Fait une corvée. target : index du box pour 'muck' et 'straw'. */
export function doChore(profile, kind, target = null) {
  const check = canChore(profile, kind, target);
  if (!check.ok) return check;
  const f = ensureFacilities(profile);
  const c = CHORES[kind];
  if (kind === 'muck' || kind === 'straw') {
    const box = f.boxes[target];
    const field = kind === 'muck' ? 'clean' : 'straw';
    if (c.cost && !spend(profile, c.cost)) return { ok: false, reason: 'money' };
    const gain = 100 - box[field];
    box[field] = 100;
    return { ok: true, gain };
  }
  const [b, room] = c.room;
  const before = f[b].rooms[room];
  f[b].rooms[room] = 100;
  return { ok: true, gain: 100 - before };
}

/** Prix de la réparation (gratuit en bac à sable). */
export const repairCost = (f, kind) => Math.ceil((100 - f[kind].wear) * 2);

export function repair(profile, kind) {
  const f = ensureFacilities(profile);
  if (f[kind].wear >= 99) return { ok: false, reason: 'notNeeded' };
  if (!spend(profile, repairCost(f, kind))) return { ok: false, reason: 'money' };
  f[kind].wear = 100;
  return { ok: true };
}

/** Peut-on acheter cette amélioration ? */
export function canBuyUpgrade(profile, kind, id) {
  const f = ensureFacilities(profile);
  const u = UPGRADES[kind]?.find((x) => x.id === id);
  if (!u) return { ok: false, reason: 'unknown' };
  if (hasUpgrade(f, kind, id)) return { ok: false, reason: 'owned' };
  if (levelOf(profile.xp ?? 0) < u.level) return { ok: false, reason: 'level', level: u.level };
  if (u.requires && !hasUpgrade(f, kind, u.requires)) return { ok: false, reason: 'requires', requires: u.requires };
  if (!canAfford(profile, u.price)) return { ok: false, reason: 'money' };
  return { ok: true, upgrade: u };
}

export function buyUpgrade(profile, kind, id) {
  const check = canBuyUpgrade(profile, kind, id);
  if (!check.ok) return check;
  spend(profile, check.upgrade.price);
  profile.facilities[kind].upgrades.push(id);
  return { ok: true, upgrade: check.upgrade };
}

// ---------------------------------------------------------------- box des chevaux

/** Qui occupe chaque box : tableau de longueur boxCount, avec le cheval ou null. */
export function boxOccupants(f, horses) {
  const out = Array.from({ length: boxCount(f) }, () => null);
  for (const a of horses) {
    if (Number.isInteger(a.box) && a.box < out.length && !out[a.box]) out[a.box] = a;
  }
  return out;
}

/**
 * Donne un box au cheval (il garde le sien s'il en a déjà un, sinon le premier libre).
 * horses : les chevaux de la maison. Renvoie l'index, ou null si l'écurie est pleine.
 */
export function assignBox(f, horses, a, wanted = null) {
  const occ = boxOccupants(f, horses.filter((x) => x.id !== a.id));
  if (wanted !== null && wanted < occ.length && !occ[wanted]) {
    a.box = wanted;
    return wanted;
  }
  if (Number.isInteger(a.box) && a.box < occ.length && !occ[a.box]) return a.box;
  const free = occ.findIndex((x) => !x);
  if (free < 0) {
    delete a.box;
    return null;
  }
  a.box = free;
  return free;
}

export function releaseBox(a) {
  delete a.box;
  a.stalled = false;
}

/** Saleté ressentie par un cheval au box (même échelle que les crottins autour de lui). */
export function stallDirt(f, a) {
  if (!a.stalled || !Number.isInteger(a.box)) return 0;
  const box = f.boxes[a.box];
  return box ? (100 - boxComfort(box)) / 20 : 0;
}

/**
 * Effets du box sur un cheval rentré, pendant `hours` heures :
 * box sale → il est moins content ; abreuvoir automatique → il boit tout seul ;
 * chauffage → il se repose mieux quand il fait froid.
 */
export function applyStallEffects(f, a, hours, { cold = false } = {}) {
  if (!a.stalled || !Number.isInteger(a.box) || !f.boxes[a.box]) return;
  const comfort = boxComfort(f.boxes[a.box]);
  if (comfort < 35) a.needs.affection = clamp(a.needs.affection - 1.5 * hours);
  if (hasUpgrade(f, 'stable', 'waterers') && a.needs.thirst < 90) a.needs.thirst = clamp(a.needs.thirst + 20 * hours);
  if (cold && hasUpgrade(f, 'stable', 'heater')) a.needs.energy = clamp(a.needs.energy + 1.5 * hours);
}

/** Saleté de la maison ressentie par les chiens et les chats. */
export const houseDirt = (f) => (100 - f.house.rooms.living) / 30;

/** Saleté de l'abri ressentie par le troupeau. */
export const penDirt = (f) => (100 - f.pen.rooms.fold) / 30;
