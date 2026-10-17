// Fichier de sauvegarde d'une ou plusieurs parties (profils), à emporter ailleurs :
// autre appareil (téléphone → ordinateur), nouvelle adresse du jeu (chaque adresse a ses propres
// sauvegardes), ou simple copie de côté. Module pur (ni DOM ni stockage) : écrire, lire, vérifier,
// comparer et fusionner des profils. Plus tard, une synchro avec un compte (cloud) réutilisera
// serializeSave / parseSave / mergeProfiles telles quelles.

import { createProfile, migrate, SAVE_VERSION } from './profile.js';
import { SPECIES } from './species.js';
import { PLACES } from './places.js';
import { levelOf } from './progress.js';

/** Marque du fichier : on reconnaît une sauvegarde du jeu à coup sûr. */
export const SAVE_KIND = 'animadichelle-save';
/** Format de l'enveloppe du fichier (pas des profils : eux ont SAVE_VERSION et passent par migrate). */
export const FILE_FORMAT = 1;
/** Au-delà, ce n'est pas une partie (le stockage de l'appareil ne garde de toute façon que ~5 Mo). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_PROFILES = 30;
export const FILE_EXT = '.json';
export const FILE_MIME = 'application/json';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
// Clés qui pourraient toucher aux prototypes des objets : jamais gardées d'un fichier venu d'ailleurs.
const UNSAFE = new Set(['__proto__', 'prototype', 'constructor']);

/** Date de dernière modification d'un profil (0 si inconnue : toute date connue est plus récente). */
export const updatedAtOf = (p) => (isNum(p?.updatedAt) ? p.updatedAt : isNum(p?.createdAt) ? p.createdAt : 0);

// ---------------------------------------------------------------- écrire

/**
 * Le fichier (texte JSON) qui contient les profils, avec la version du jeu et la date.
 * opts : { appVersion, now } (now = date de l'export, en ms).
 */
export function serializeSave(profiles, { appVersion = 'dev', now = Date.now() } = {}) {
  const list = (Array.isArray(profiles) ? profiles : [profiles]).filter(Boolean);
  return JSON.stringify({
    kind: SAVE_KIND,
    format: FILE_FORMAT,
    game: 'Animadichelle',
    appVersion: String(appVersion),
    saveVersion: SAVE_VERSION,
    exportedAt: new Date(now).toISOString(),
    profiles: list.map((p) => ({ ...p, updatedAt: updatedAtOf(p) })),
  });
}

/** « 2026-10-17 » (date de l'appareil, pas UTC : celle que l'enfant voit sur son téléphone). */
export function localDay(now = Date.now()) {
  const d = new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Prénom utilisable dans un nom de fichier : / \ : deviennent « - » (« secours 17-10 ») ; * ? " < > | et invisibles disparaissent. */
export function safeFilePart(s) {
  const out = String(s ?? '').replace(/[\\/:]/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[*?"<>|\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return out.slice(0, 40).trim() || 'Partie';
}

/**
 * Nom de fichier lisible : « Animadichelle - Léana - 2026-10-17.json » ;
 * plusieurs : « Animadichelle - Léana, Tom - … », au-delà de 3 : « Animadichelle - 4 parties - … ».
 * manyLabel(n) : « 4 parties » / « 4 games » (langue de l'interface).
 */
export function saveFileName(profiles, { now = Date.now(), manyLabel = (n) => `${n} parties` } = {}) {
  const list = (Array.isArray(profiles) ? profiles : [profiles]).filter(Boolean);
  const who = list.length > 3 ? manyLabel(list.length) : list.map((p) => safeFilePart(p.name)).join(', ') || 'Partie';
  return `Animadichelle - ${who} - ${localDay(now)}${FILE_EXT}`;
}

// ---------------------------------------------------------------- lire et vérifier

/**
 * Forme d'un profil : chaque champ connu (ceux de createProfile) a le bon type quand il est présent.
 * Renvoie le nom du premier champ abîmé, ou null si tout va bien.
 */
export function profileProblem(p) {
  if (!isObj(p)) return 'profile';
  if (typeof p.name !== 'string' || !p.name.trim()) return 'name';
  const fresh = createProfile('x');
  for (const [k, ref] of Object.entries(fresh)) {
    const v = p[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(ref) ? !Array.isArray(v) : isObj(ref) ? !isObj(v) : typeof v !== typeof ref) return k;
    if (typeof ref === 'number' && !Number.isFinite(v)) return k;
  }
  if (p.mode !== undefined && p.mode !== 'sandbox' && p.mode !== 'manage') return 'mode';
  for (const k of ['home', 'place']) if (p[k] !== undefined && !PLACES[p[k]]) return k;
  if (p.updatedAt !== undefined && !isNum(p.updatedAt)) return 'updatedAt';
  for (const a of p.animals ?? []) {
    if (!isObj(a) || typeof a.id !== 'string' || !SPECIES[a.species]) return 'animals';
  }
  if (isNum(p.version) && p.version > SAVE_VERSION) return 'tooNew';
  return null;
}

/** Erreurs possibles de parseSave (une clé de texte « sv_err_<code> » chacune). */
export const SAVE_ERRORS = ['empty', 'tooBig', 'notJson', 'notSave', 'tooNew', 'noProfiles', 'tooMany', 'badProfile'];

/**
 * Lit le texte d'un fichier de sauvegarde. Ne lève jamais d'erreur :
 * { ok: true, profiles, meta: { format, appVersion, exportedAt, legacy } } (profils passés par migrate)
 * ou { ok: false, error, detail? } (error ∈ SAVE_ERRORS).
 * Accepte aussi un profil seul (format 0 : copie brute de l'ancienne sauvegarde de l'appareil).
 */
export function parseSave(text, { maxBytes = MAX_FILE_BYTES } = {}) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'empty' };
  if (text.length > maxBytes) return { ok: false, error: 'tooBig' };
  let data;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''), (k, v) => (UNSAFE.has(k) ? undefined : v));
  } catch {
    return { ok: false, error: 'notJson' };
  }
  if (!isObj(data)) return { ok: false, error: 'notSave' };

  let raw;
  let meta;
  if (data.kind === SAVE_KIND) {
    if (!Number.isInteger(data.format) || data.format < 1) return { ok: false, error: 'notSave' };
    if (data.format > FILE_FORMAT || (isNum(data.saveVersion) && data.saveVersion > SAVE_VERSION)) return { ok: false, error: 'tooNew' };
    if (!Array.isArray(data.profiles)) return { ok: false, error: 'notSave' };
    raw = data.profiles;
    const at = Date.parse(data.exportedAt);
    meta = { format: data.format, appVersion: typeof data.appVersion === 'string' ? data.appVersion : '', exportedAt: Number.isFinite(at) ? at : null, legacy: false };
  } else if (typeof data.name === 'string' && Array.isArray(data.animals)) {
    raw = [data]; // un profil tout seul (sans enveloppe)
    meta = { format: 0, appVersion: '', exportedAt: null, legacy: true };
  } else {
    return { ok: false, error: 'notSave' };
  }

  if (!raw.length) return { ok: false, error: 'noProfiles' };
  if (raw.length > MAX_PROFILES) return { ok: false, error: 'tooMany' };
  const profiles = [];
  for (const p of raw) {
    const problem = profileProblem(p);
    if (problem === 'tooNew') return { ok: false, error: 'tooNew' };
    if (problem) return { ok: false, error: 'badProfile', detail: problem };
    try {
      const m = migrate({ ...p, name: p.name.trim().slice(0, 40) });
      if (typeof m.id !== 'string' || !m.id) m.id = createProfile('x').id;
      profiles.push(m);
    } catch {
      return { ok: false, error: 'badProfile', detail: 'migrate' };
    }
  }
  return { ok: true, profiles, meta };
}

// ---------------------------------------------------------------- aperçu

/** Ce qu'on montre avant de restaurer : nom, niveau, animaux (par espèce), date. */
export function profileSummary(p) {
  const bySpecies = {};
  for (const a of p.animals ?? []) bySpecies[a.species] = (bySpecies[a.species] ?? 0) + 1;
  return {
    id: p.id,
    name: p.name,
    mode: p.mode,
    level: levelOf(isNum(p.xp) ? p.xp : 0),
    animals: (p.animals ?? []).length,
    species: Object.entries(bySpecies).map(([id, n]) => ({ id, n, emoji: SPECIES[id]?.emoji ?? '🐾' })),
    updatedAt: updatedAtOf(p),
    backup: Boolean(p.backupOf),
  };
}

// ---------------------------------------------------------------- comparer, fusionner

/** Le profil a est-il plus récent que b ? 'newer' | 'older' | 'same' (même date de modification). */
export function compareProfiles(a, b) {
  const da = updatedAtOf(a);
  const db = updatedAtOf(b);
  return da > db ? 'newer' : da < db ? 'older' : 'same';
}

/**
 * Fusionne deux listes de profils (cet appareil et un fichier, plus tard un compte) profil par profil :
 * même id → le plus récent (updatedAt) gagne ; id inconnu → ajouté. Rien n'est jeté en silence :
 * chaque version écartée est rendue dans `replaced` (à garder en copie de secours).
 * Renvoie { profiles, changes: [{ id, name, action }], replaced } ;
 * action : 'added' (nouveau), 'updated' (remplacé par le plus récent), 'kept' (le local est plus récent), 'same'.
 */
export function mergeProfiles(local, incoming) {
  const out = (local ?? []).slice();
  const byId = new Map(out.map((p, i) => [p.id, i]));
  const changes = [];
  const replaced = [];
  for (const p of incoming ?? []) {
    const i = byId.get(p.id);
    if (i === undefined) {
      byId.set(p.id, out.length);
      out.push(p);
      changes.push({ id: p.id, name: p.name, action: 'added' });
      continue;
    }
    const cmp = compareProfiles(p, out[i]);
    if (cmp === 'newer') {
      replaced.push(out[i]);
      out[i] = p;
      changes.push({ id: p.id, name: p.name, action: 'updated' });
    } else {
      // L'autre version (plus ancienne, ou la même date) n'est pas prise : on la rend aussi, au cas où.
      if (cmp === 'older') replaced.push(p);
      changes.push({ id: p.id, name: out[i].name, action: cmp === 'older' ? 'kept' : 'same' });
    }
  }
  return { profiles: out, changes, replaced };
}

/** « Léana », ou « Léana (2) » si ce prénom est déjà pris sur l'appareil. */
export function uniqueName(name, taken) {
  const used = new Set([...(taken ?? [])].map((n) => String(n).toLowerCase()));
  if (!used.has(String(name).toLowerCase())) return name;
  for (let i = 2; ; i++) {
    const n = `${name} (${i})`;
    if (!used.has(n.toLowerCase())) return n;
  }
}
