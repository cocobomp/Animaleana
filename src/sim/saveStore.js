// Où vivent les parties. Aujourd'hui : cet appareil (localStorage, src/sim/profile.js). Plus tard, aussi un
// compte (cloud) : il suffira d'un autre « stockage » avec la même interface { list, load, save, remove },
// et de la fusion par profil de src/sim/saveFile.js (mergeProfiles, updatedAt).
// Ici : restaurer une partie sans jamais rien perdre en silence (copie de secours avant tout remplacement).

import { listProfiles, loadProfile, saveProfile, deleteProfile, dropBackupMark } from './profile.js';
import { uid } from './rng.js';
import { uniqueName, sameContent } from './saveFile.js';

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
      if (touch) dropBackupMark(p); // comme saveProfile : une copie de secours sur laquelle on joue redevient une partie
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
 * opts.backupName(ancien) : nom de la copie (« Léana · secours 17/10 », « Léana · secours 17/10 (2) » si ce nom
 * est déjà pris) ; opts.now : date de la copie.
 * opts.afterBackup() : appelé une fois la copie écrite, juste avant d'écrire par-dessus l'ancien (arrêter la
 * partie en cours : elle réécrirait sinon l'ancienne version en se fermant).
 * Renvoie { ok: true, profile, backup } ou { ok: false, error: 'missing' | 'storage', backup? }.
 */
export function restoreReplace(store, targetId, incoming, { backupName = (p) => `${p.name} (secours)`, now = Date.now(), afterBackup = null } = {}) {
  const old = store.load(targetId);
  if (!old) return { ok: false, error: 'missing' };
  const backup = keepBackup(store, old, { backupName, now });
  if (!backup) return { ok: false, error: 'storage' };
  afterBackup?.();
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

/**
 * Garde une copie de secours d'une partie (nouvel id, marquée backupOf : jamais synchronisée), sans toucher à
 * l'original. Prénom « Léana · secours 17/10 » (opts.backupName), rendu unique. Garde la date de la partie.
 * Renvoie la copie, ou null si l'appareil est plein (et rien n'est resté d'une copie écrite à moitié).
 */
export function keepBackup(store, p, { backupName = (x) => `${x.name} (secours)`, now = Date.now() } = {}) {
  const name = uniqueName(backupName(p), store.list().map((e) => e.name));
  const backup = { ...clone(p), id: uid(), name, backupOf: p.id, backupAt: now };
  if (!store.save(backup, { touch: false })) {
    store.remove(backup.id);
    return null;
  }
  return backup;
}

/**
 * Sauvegarde de la partie en cours (src/game/Game.js), qui ne peut rien écraser en silence : si la version
 * écrite sur l'appareil n'est plus celle que la partie a chargée ou écrite en dernier (lastAt : autre onglet,
 * synchro), elle est d'abord gardée en copie de secours (si cette copie est impossible, rien n'est écrit).
 * Rien à écrire si rien n'a changé depuis la dernière fois (lastKey : contenu déjà écrit).
 * Renvoie { ok, at (date écrite), key (contenu écrit), backup (copie faite, s'il y en a une) }.
 */
export function saveGuarded(store, p, { lastAt, lastKey = null, backupName, now = Date.now() } = {}) {
  const stored = store.list().find((e) => e.id === p.id);
  const storedAt = stored ? stored.updatedAt ?? stored.savedAt : undefined;
  const changedElsewhere = stored && lastAt !== undefined && storedAt !== lastAt;
  const key = JSON.stringify({ ...p, updatedAt: 0 });
  if (!changedElsewhere && stored && key === lastKey) return { ok: true, at: storedAt, key, backup: null };
  let backup = null;
  if (changedElsewhere) {
    const other = store.load(p.id);
    if (other && !sameContent(other, p)) {
      backup = keepBackup(store, other, { ...(backupName ? { backupName } : {}), now });
      if (!backup) return { ok: false, at: lastAt, key: lastKey, backup: null };
    }
  }
  if (!store.save(p)) return { ok: false, at: lastAt, key: lastKey, backup };
  return { ok: true, at: p.updatedAt, key, backup };
}
