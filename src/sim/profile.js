// Profils de joueurs, argent et sauvegarde sur l'appareil (localStorage, sans réseau).

import { uid } from './rng.js';
import { STARTER_ITEMS } from './gear.js';
import { STARTER_TOOLS } from './tools.js';
import { defaultFacilities } from './facilities.js'; // bâtiments à entretenir (écurie, maison, bergerie)
import { createTutorial } from './tutorial.js';
import { defaultClients } from './clients.js'; // clients (pension, soins)
import { defaultCareers } from './careers.js'; // métiers
import { migrateCoreSizes, CORE_VERSION } from './resize.js'; // tailles des enclos (vue construction)
import { defaultVetSchool } from './vetSchool.js'; // école vétérinaire (leçons)
import { SPECIES, getBreed } from './species.js'; // anciens chats : look complété depuis la race
import { upgradeCatLook } from './catBreeds.js';

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
    // Date de la dernière modification (mise à jour à chaque sauvegarde) : pour savoir, entre deux copies
    // d'une même partie (téléphone, ordinateur, fichier, plus tard un compte), laquelle est la plus récente.
    updatedAt: Date.now(),
    money: 500,
    xp: 0,
    items: { ...STARTER_ITEMS },
    tools: [...STARTER_TOOLS], // matériel possédé (brosse, tondeuse…) // objets achetés (selles, couvertures…)
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
    facilities: defaultFacilities(), // propreté, usure, améliorations et box (src/sim/facilities.js)
    structures: [], // constructions du joueur { id, type, place, x, z, rot, w?, d? } (src/sim/construction.js)
    // Place et taille des installations de base, par lieu : { [lieu]: { paddock: { x, z, w, d }, … } }
    // (absentes = par défaut ; src/sim/construction.js et src/sim/resize.js).
    coreLayout: {},
    coreVersion: CORE_VERSION,
    tips: {}, // petites bulles d'aide déjà vues (vue construction…)
    petHouse: { dirt: 0 }, // saleté des paniers de la maison des animaux
    // Événements spéciaux (orage, animal blessé…) : voir src/sim/events.js.
    events: { active: null, cooldowns: {}, nextAt: 0, lastRoll: -1, weather: null, done: {} },
    settings: { camera: 'third', timeSpeed: 'normal', sound: { on: true, volume: 0.7 } }, // sound : src/game/audio.js
    tutorial: createTutorial(), // tutoriel guidé (src/sim/tutorial.js)
    clients: defaultClients(), // visiteurs et animaux confiés (src/sim/clients.js)
    careers: defaultCareers(), // métiers appris (src/sim/careers.js)
    vetSchool: defaultVetSchool(), // leçons de l'école vétérinaire (src/sim/vetSchool.js)
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
    // Ancienne sauvegarde sans updatedAt : la date de la dernière sauvegarde (dans la liste des profils) la remplace.
    return raw ? migrate(JSON.parse(raw), { savedAt: listProfiles().find((e) => e.id === id)?.savedAt }) : null;
  } catch {
    return null;
  }
}

/**
 * Complète une sauvegarde ancienne (champs ajoutés depuis) sans rien perdre.
 * hint.savedAt : date connue de la dernière sauvegarde, pour un profil d'avant updatedAt.
 */
export function migrate(p, hint = {}) {
  const fresh = createProfile(p.name, p.mode, p.home ?? 'maison');
  const known = (v) => typeof v === 'number' && Number.isFinite(v);
  const out = {
    ...fresh,
    ...p,
    // Anciennes sauvegardes : pas de date de modification (la dernière sauvegarde connue, sinon la création).
    updatedAt: known(p.updatedAt) ? p.updatedAt : known(hint.savedAt) ? hint.savedAt : known(p.createdAt) ? p.createdAt : 0,
    // Anciennes sauvegardes : enclos de l'ancienne taille (on les agrandit en douceur, voir plus bas).
    coreVersion: p.coreVersion ?? 1,
    coreLayout: p.coreLayout ?? {},
    tips: p.tips ?? {},
    stats: p.stats ?? {},
    // Anciennes sauvegardes : réglage des sons absent (ou incomplet).
    settings: { ...fresh.settings, ...p.settings, sound: { ...fresh.settings.sound, ...(p.settings?.sound ?? {}) } },
    // Anciennes sauvegardes : pas de tutoriel (on peut le revoir dans les réglages).
    tutorial: p.tutorial ?? createTutorial(true),
    // Clients et métiers (ajoutés plus tard) : champs manquants complétés.
    clients: { ...defaultClients(), ...(p.clients ?? {}) },
    careers: { ...defaultCareers(), ...(p.careers ?? {}) },
    vetSchool: { ...defaultVetSchool(), ...(p.vetSchool ?? {}) }, // école vétérinaire (ajoutée plus tard)
  };
  // Chats d'avant les races détaillées : poil, tête, oreilles, gants et yeux repris de leur race.
  for (const a of out.animals ?? []) {
    if (a?.species === 'cat') upgradeCatLook(a.look, getBreed('cat', a.breed), SPECIES.cat.model);
  }
  // Paddock, bergerie et enclos des lapins plus grands : on agrandit sans casser les déplacements enregistrés.
  return migrateCoreSizes(out);
}

/**
 * Une copie de secours (gardée avant qu'une partie restaurée la remplace) sur laquelle on joue redevient une
 * partie comme les autres : plus de pastille « copie de secours », cochée dans « 💾 Sauvegarder mes parties »
 * et synchronisée avec le compte (les copies restent sinon sur l'appareil où elles ont été faites).
 */
export function dropBackupMark(p) {
  delete p.backupOf;
  delete p.backupAt;
}

/**
 * Écrit le profil sur l'appareil. opts.touch (oui par défaut) : c'est une modification, updatedAt prend
 * la date du jour ; non pour une partie restaurée ou une copie de secours (elles gardent leur date).
 */
export function saveProfile(p, { touch = true } = {}) {
  const s = storage();
  if (!s) return false;
  try {
    if (touch || typeof p.updatedAt !== 'number') p.updatedAt = Date.now();
    if (touch) dropBackupMark(p);
    s.setItem(PROFILE_KEY(p.id), JSON.stringify(p));
    const index = listProfiles().filter((e) => e.id !== p.id);
    const entry = { id: p.id, name: p.name, mode: p.mode, animals: p.animals.length, savedAt: Date.now(), updatedAt: p.updatedAt };
    if (p.backupOf) entry.backup = true; // copie de secours (gardée avant un remplacement) : signalée dans la liste
    index.unshift(entry);
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
