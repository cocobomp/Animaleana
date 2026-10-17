// Où vivent les parties. Aujourd'hui : cet appareil (localStorage, src/sim/profile.js). Plus tard, aussi un
// compte (cloud) : il suffira d'un autre « stockage » avec la même interface { list, load, save, remove },
// et de la fusion par profil de src/sim/saveFile.js (mergeProfiles, updatedAt).
// Ici : restaurer une partie sans jamais rien perdre en silence (copie de secours avant tout remplacement).

import { listProfiles, loadProfile, saveProfile, deleteProfile } from './profile.js';
import { uid } from './rng.js';
import { uniqueName } from './saveFile.js';

/** Les parties de cet appareil (index des profils + un profil par clé « animaleana.profile.<id> »). */
export function deviceStore() {
  return {
    kind: 'device',
    list: () => listProfiles(),
    load: (id) => loadProfile(id),
    save: (p, opts) => saveProfile(p, opts),
    remove: (id) => deleteProfile(id),
  };
}

const clone = (p) => JSON.parse(JSON.stringify(p));

/**
 * Stockage en mémoire, même interface (tests, et brouillon d'un futur stockage « compte »).
 * opts.failOn(p) : simule un stockage plein pour ce profil (save renvoie false, rien n'est écrit).
 */
export function memoryStore(profiles = [], { failOn = null } = {}) {
  const data = new Map();
  let index = [];
  const store = {
    kind: 'memory',
    list: () => index.map((e) => ({ ...e })),
    load: (id) => (data.has(id) ? clone(data.get(id)) : null),
    save: (p, { touch = true } = {}) => {
      if (failOn?.(p)) return false;
      if (touch || typeof p.updatedAt !== 'number') p.updatedAt = Date.now();
      data.set(p.id, clone(p));
      index = index.filter((e) => e.id !== p.id);
      const entry = { id: p.id, name: p.name, mode: p.mode, animals: p.animals.length, savedAt: Date.now(), updatedAt: p.updatedAt };
      if (p.backupOf) entry.backup = true;
      index.unshift(entry);
      return true;
    },
    remove: (id) => {
      data.delete(id);
      index = index.filter((e) => e.id !== id);
    },
  };
  for (const p of [...profiles].reverse()) store.save(clone(p), { touch: false });
  return store;
}

/** Les profils à mettre dans un fichier, dans l'ordre demandé (ceux qui existent encore). */
export function collectProfiles(store, ids) {
  return ids.map((id) => store.load(id)).filter(Boolean);
}

/** Une partie restaurée redevient une partie normale (même si le fichier contenait une copie de secours). */
function fresh(incoming) {
  const p = clone(incoming);
  delete p.backupOf;
  delete p.backupAt;
  return p;
}

/**
 * Ajoute une partie restaurée comme nouveau profil. Elle garde son id s'il est libre (la même partie reste
 * reconnaissable d'un appareil à l'autre, pour une future synchro), sinon en reçoit un nouveau ;
 * prénom « Léana (2) » s'il est déjà pris. Garde sa date de modification.
 * Renvoie { ok: true, profile } ou { ok: false, error: 'storage' } (rien n'a été ajouté).
 */
export function restoreAsNew(store, incoming) {
  const list = store.list();
  const p = fresh(incoming);
  if (!p.id || list.some((e) => e.id === p.id)) p.id = uid();
  p.name = uniqueName(p.name, list.map((e) => e.name));
  if (!store.save(p, { touch: false })) {
    store.remove(p.id);
    return { ok: false, error: 'storage' };
  }
  return { ok: true, profile: p };
}

/**
 * Remplace un profil de l'appareil par une partie restaurée. D'abord, l'ancien est copié en « copie de secours »
 * (un profil de plus dans la liste, marqué backupOf) ; si cette copie ne peut pas être écrite, rien ne change.
 * opts.backupName(ancien) : nom de la copie (« Léana · secours 17/10 ») ; opts.now : date de la copie.
 * Renvoie { ok: true, profile, backup } ou { ok: false, error: 'missing' | 'storage', backup? }.
 */
export function restoreReplace(store, targetId, incoming, { backupName = (p) => `${p.name} (secours)`, now = Date.now() } = {}) {
  const old = store.load(targetId);
  if (!old) return { ok: false, error: 'missing' };
  const backup = { ...clone(old), id: uid(), name: backupName(old), backupOf: old.id, backupAt: now };
  if (!store.save(backup, { touch: false })) {
    store.remove(backup.id);
    return { ok: false, error: 'storage' };
  }
  const list = store.list().filter((e) => e.id !== targetId && e.id !== backup.id);
  const p = fresh(incoming);
  // L'id du fichier (même partie d'un appareil à l'autre) s'il est libre ; sinon celui du profil remplacé.
  if (!p.id || (p.id !== targetId && list.some((e) => e.id === p.id))) p.id = targetId;
  p.name = uniqueName(p.name, list.map((e) => e.name));
  if (!store.save(p, { touch: false })) {
    // La copie de secours reste (rien n'est perdu, même si l'écriture s'est arrêtée au milieu).
    if (p.id !== targetId) store.remove(p.id);
    return { ok: false, error: 'storage', backup };
  }
  if (p.id !== targetId) store.remove(targetId);
  return { ok: true, profile: p, backup };
}
