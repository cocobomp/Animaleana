// COPIE FIGÉE de la synchro v1 (main 6906348), seulement pour tests/cloudRelecture.test.js : un appareil resté
// sur l'ancienne version du jeu pendant la mise à jour ne doit rien effacer à cause des documents de la v2.
// Ne pas modifier (seuls les chemins des import ont été adaptés).
//
// Applique le plan de synchro (src/sim/cloudSync.js) : entre les parties de cet appareil (un « stockage »
// comme src/sim/saveStore.js) et celles du compte en ligne (src/cloud/firebase.js → remoteStore).
// Testable sans réseau : remote peut être un faux stockage en mémoire.

import { planSync, applyDone, cleanMeta } from './cloudSync.js';
import { restoreReplace } from '../../../src/sim/saveStore.js';
import { migrate, SAVE_VERSION } from '../../../src/sim/profile.js';
import { profileProblem } from '../../../src/sim/saveFile.js';

const META_KEY = 'animaleana.cloud';

export function loadMeta(storage = globalThis.localStorage) {
  try {
    return cleanMeta(JSON.parse(storage?.getItem(META_KEY) ?? '{}'));
  } catch {
    return cleanMeta({});
  }
}

export function saveMeta(meta, storage = globalThis.localStorage) {
  try {
    storage?.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* stockage plein : la prochaine synchro refera le travail, sans rien perdre */
  }
}

/**
 * Une synchro complète pour le compte uid.
 * opts : { store, remote, uid, meta, busy (ids des parties ouvertes en ce moment : jamais remplacées ni
 * effacées pendant qu'on joue), appVersion, backupName(ancien) }.
 * Renvoie { meta, report: { uploaded, downloaded, removed, backups: [noms], errors: [{ id, code }] } }.
 */
export async function runSync({ store, remote, uid, meta, busy = new Set(), appVersion = 'dev', backupName }) {
  const docs = await remote.list();
  const byId = new Map(docs.map((d) => [d.id, d]));
  // Les copies de secours restent sur l'appareil où elles ont été faites.
  const local = store.list().filter((e) => !e.backup).map((e) => ({ id: e.id, updatedAt: e.updatedAt ?? e.savedAt }));
  const plan = planSync(local, docs, meta, uid);
  const done = { uploaded: [], downloaded: [], removedRemote: [], removedLocal: [], claimed: plan.claim, forgotten: plan.forget };
  const report = { uploaded: 0, downloaded: 0, removed: 0, backups: [], errors: [] };
  const fail = (id, err) => report.errors.push({ id, code: err?.code ?? 'network' });

  for (const id of plan.upload) {
    const p = store.load(id);
    if (!p) continue;
    try {
      await remote.put(p, { appVersion, saveVersion: SAVE_VERSION });
      done.uploaded.push({ id, updatedAt: p.updatedAt });
      report.uploaded++;
    } catch (err) {
      fail(id, err);
    }
  }

  for (const { id, conflict } of plan.download) {
    if (busy.has(id)) continue;
    const d = byId.get(id);
    let p;
    try {
      p = migrate(JSON.parse(d.data));
    } catch {
      fail(id, { code: 'bad-data' });
      continue;
    }
    if (profileProblem(p)) {
      fail(id, { code: 'bad-data' });
      continue;
    }
    p.id = id;
    p.updatedAt = d.updatedAt;
    const here = store.list().some((e) => e.id === id);
    if (here && conflict) {
      // Modifiée ici aussi : la version de l'appareil est gardée en copie de secours avant d'être remplacée.
      const r = restoreReplace(store, id, p, backupName ? { backupName } : {});
      if (!r.ok) {
        fail(id, { code: r.error });
        continue;
      }
      report.backups.push(r.backup.name);
    } else if (!store.save(p, { touch: false })) {
      fail(id, { code: 'storage' });
      continue;
    }
    done.downloaded.push({ id, updatedAt: d.updatedAt });
    report.downloaded++;
  }

  for (const id of plan.removeLocal) {
    if (busy.has(id)) continue;
    store.remove(id);
    done.removedLocal.push(id);
    report.removed++;
  }

  for (const { id, at } of plan.removeRemote) {
    try {
      await remote.tombstone(id, at);
      done.removedRemote.push(id);
    } catch (err) {
      fail(id, err);
    }
  }

  return { meta: applyDone(meta, uid, done), report };
}

/** Faux compte en ligne, en mémoire (tests). */
export function memoryRemote(docs = []) {
  const data = new Map(docs.map((d) => [d.id, { ...d }]));
  return {
    data,
    list: async () => [...data.values()].map((d) => ({ ...d })),
    put: async (p, { appVersion = 'dev', saveVersion = 1 } = {}) => {
      data.set(p.id, { id: p.id, data: JSON.stringify(p), updatedAt: p.updatedAt, name: p.name, appVersion, saveVersion });
    },
    tombstone: async (id, at) => {
      data.set(id, { id, data: '', updatedAt: at, deleted: true });
    },
  };
}
