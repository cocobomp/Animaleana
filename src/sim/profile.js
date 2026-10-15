// Profils de joueurs, argent et sauvegarde sur l'appareil (localStorage, sans réseau).

import { uid } from './rng.js';
import { STARTER_ITEMS } from './gear.js';

const INDEX_KEY = 'animaleana.profiles';
const PROFILE_KEY = (id) => `animaleana.profile.${id}`;
export const SAVE_VERSION = 1;

export const DEFAULT_AVATAR = {
  skin: 0xe8b796,
  hair: 0x4a2f1d,
  hairStyle: 'short',
  top: 0x3f7cc4,
  bottom: 0x2d3a4f,
  shoes: 0x2b2b2b,
  hat: false,
};

export function createProfile(name, mode = 'sandbox', home = 'maison') {
  return {
    version: SAVE_VERSION,
    id: uid(),
    name,
    mode, // 'sandbox' (argent illimité) ou 'manage' (gestion)
    createdAt: Date.now(),
    money: 500,
    xp: 0,
    items: { ...STARTER_ITEMS }, // objets achetés (selles, couvertures…)
    avatar: { ...DEFAULT_AVATAR },
    animals: [],
    memorial: [],
    home, // le lieu où l'on habite (choisi au début)
    place: home,
    visited: [home],
    clock: 8 * 60, // minutes de jeu depuis le début (jour 1, 8 h)
    stats: {},
    completed: [],
    adoptedKeys: [],
    equipment: [], // mangeoires, abreuvoirs… { id, type, place, stock }
    helpers: [], // aides embauchées { id, type, name, place }
    farm: { autoHerd: true },
    // Événements spéciaux (orage, animal blessé…) : voir src/sim/events.js.
    events: { active: null, cooldowns: {}, nextAt: 0, lastRoll: -1, weather: null, done: {} },
    settings: { camera: 'third', timeSpeed: 'normal' },
  };
}

export const isSandbox = (p) => p.mode === 'sandbox';
export const canAfford = (p, cost) => isSandbox(p) || p.money >= cost;

export function spend(p, cost) {
  if (!canAfford(p, cost)) return false;
  if (!isSandbox(p)) p.money -= cost;
  return true;
}

export function earn(p, amount) {
  if (!isSandbox(p)) p.money += amount;
}

export const addStat = (p, key, n = 1) => {
  p.stats[key] = (p.stats[key] ?? 0) + n;
};

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function listProfiles() {
  try {
    return JSON.parse(storage()?.getItem(INDEX_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function loadProfile(id) {
  try {
    const raw = storage()?.getItem(PROFILE_KEY(id));
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function migrate(p) {
  const fresh = createProfile(p.name, p.mode, p.home ?? 'maison');
  return { ...fresh, ...p, stats: p.stats ?? {}, settings: { ...fresh.settings, ...p.settings } };
}

export function saveProfile(p) {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(PROFILE_KEY(p.id), JSON.stringify(p));
    const index = listProfiles().filter((e) => e.id !== p.id);
    index.unshift({ id: p.id, name: p.name, mode: p.mode, animals: p.animals.length, savedAt: Date.now() });
    s.setItem(INDEX_KEY, JSON.stringify(index));
    return true;
  } catch {
    return false;
  }
}

export function deleteProfile(id) {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(PROFILE_KEY(id));
    s.setItem(INDEX_KEY, JSON.stringify(listProfiles().filter((e) => e.id !== id)));
  } catch {
    /* rien à faire */
  }
}
