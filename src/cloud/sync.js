// Applique le plan de synchro (src/sim/cloudSync.js) : entre les parties de cet appareil (un « stockage »
// comme src/sim/saveStore.js) et celles du compte en ligne (src/cloud/firebase.js → remoteStore).
// Testable sans réseau : remote peut être un faux compte en mémoire (memoryRemote, plus bas).
//
// Le compte en ligne (remote) : {
//   list()                                   [{ id, data, updatedAt, rev, deleted, name }] lus sur le serveur
//                                            (jamais le cache : hors ligne, list échoue et rien n'est décidé) ;
//   put(profile, { expect, appVersion, saveVersion })  écrit la partie si sa rev en ligne vaut encore expect
//                                            (null : absente) ; renvoie la nouvelle rev ; sinon échoue { code: 'conflict' } ;
//   tombstone(id, { expect, at })            pareil pour la pierre tombale ;
//   removeAll()                              efface tous les documents du compte (« effacer mes parties en ligne »).
// }

import { planSync, applyDone, cleanMeta, META_VERSION } from '../sim/cloudSync.js';
import { keepBackup } from '../sim/saveStore.js';
import { migrate, SAVE_VERSION } from '../sim/profile.js';
import { profileProblem, sameContent } from '../sim/saveFile.js';

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
    storage?.setItem(META_KEY, JSON.stringify({ ...cleanMeta(meta), v: META_VERSION }));
    return true;
  } catch {
    return false; /* stockage plein : la prochaine synchro refera le travail, sans rien perdre */
  }
}

/** Le profil contenu dans un document en ligne (ou null s'il est abîmé). */
function profileOf(d) {
  let p;
  try {
    p = migrate(JSON.parse(d.data));
  } catch {
    return null;
  }
  if (profileProblem(p)) return null;
  p.id = d.id;
  p.updatedAt = typeof d.updatedAt === 'number' ? d.updatedAt : p.updatedAt;
  delete p.backupOf;
  delete p.backupAt;
  return p;
}

const entryAt = (e) => e?.updatedAt ?? e?.savedAt;

/**
 * Une synchro complète pour le compte uid.
 * opts : { store, remote, uid, meta (mémoire lue au départ), busy() (ids des parties ouvertes en ce moment, dans cet
 * onglet ou un autre : relu au moment de décider, puis juste avant chaque écriture sur l'appareil), skip(id) (vrai
 * pour ne plus toucher à cette partie ici : effacée pendant la synchro…), appVersion, backupName(ancien), now() }.
 * Renvoie { done (à appliquer avec applyDone sur la mémoire relue), meta (= applyDone(meta)), report } ;
 * report = { uploaded, downloaded, removed, removedNames, backups: [noms], held: [noms], heldIds, unlinked: [noms],
 *            unowned: [ids], storageFull, errors: [{ id, code }] }.
 * Si la liste en ligne ne peut pas être lue, runSync échoue sans rien avoir décidé ni écrit.
 */
export async function runSync({ store, remote, uid, meta, busy = () => [], skip = () => false, appVersion = 'dev', backupName, now = Date.now }) {
  const docs = await remote.list();
  const byId = new Map(docs.map((d) => [d.id, d]));
  const isBusy = (id) => new Set(typeof busy === 'function' ? busy() : busy).has(id);
  const blocked = (id) => isBusy(id) || skip(id);
  // Les copies de secours restent sur l'appareil où elles ont été faites.
  const localList = () => store.list().filter((e) => !e.backup);
  const local = localList().map((e) => ({ id: e.id, updatedAt: entryAt(e) }));
  const planned = new Map(local.map((e) => [e.id, e.updatedAt]));
  // Changée ici depuis la décision (sauvegarde, fichier restauré…) : on n'y touche pas, la synchro suivante décidera.
  const movedHere = (id) => entryAt(localList().find((e) => e.id === id)) !== planned.get(id);
  const plan = planSync(local, docs, meta, uid, { open: typeof busy === 'function' ? busy() : [...busy] });
  const done = { synced: [], removed: [...plan.forget], unlinked: [] };
  const report = { uploaded: 0, downloaded: 0, removed: 0, removedNames: [], backups: [], held: [], heldIds: [], unlinked: [], unowned: plan.unowned, storageFull: false, errors: [] };
  const fail = (id, err) => report.errors.push({ id, code: err?.code ?? 'network' });
  const nameOf = (id) => store.list().find((e) => e.id === id)?.name ?? byId.get(id)?.name ?? id;
  const putOpts = (expect) => ({ expect, appVersion, saveVersion: SAVE_VERSION });
  const backupOpts = { ...(backupName ? { backupName } : {}), now: now() };

  // Envoyer la version de l'appareil (seulement si la version en ligne est encore celle attendue).
  for (const { id, expect } of plan.upload) {
    const p = store.load(id);
    if (!p) continue;
    try {
      const rev = await remote.put(p, putOpts(expect));
      done.synced.push({ id, rev, localAt: p.updatedAt });
      report.uploaded++;
    } catch (err) {
      fail(id, err);
    }
  }

  // Changée des deux côtés : même contenu → accord noté ; sinon on garde les deux versions.
  for (const { id, rev } of plan.conflict) {
    if (blocked(id)) continue;
    const d = byId.get(id);
    const theirs = profileOf(d);
    const mine = store.load(id);
    if (!theirs) {
      fail(id, { code: 'bad-data' });
      continue;
    }
    if (!mine) continue;
    if (sameContent(mine, theirs)) {
      done.synced.push({ id, rev, localAt: entryAt(localList().find((e) => e.id === id)) ?? mine.updatedAt });
      continue;
    }
    if ((theirs.updatedAt ?? 0) > (mine.updatedAt ?? 0)) {
      // La version en ligne reste la partie : celle de l'appareil devient une copie de secours.
      const backup = keepBackup(store, mine, backupOpts);
      if (!backup) {
        report.storageFull = true;
        fail(id, { code: 'storage' });
        continue;
      }
      if (blocked(id) || !store.save(theirs, { touch: false })) {
        // Rien n'a été remplacé (l'original est intact) : la copie ne sert à rien, on la retire.
        if (store.load(id)?.updatedAt === mine.updatedAt) store.remove(backup.id);
        if (!blocked(id)) {
          report.storageFull = true;
          fail(id, { code: 'storage' });
        }
        continue;
      }
      done.synced.push({ id, rev, localAt: theirs.updatedAt });
      report.downloaded++;
      report.backups.push(backup.name);
    } else {
      // La version de l'appareil reste la partie : celle en ligne est gardée ici en copie de secours, puis on envoie.
      const backup = keepBackup(store, theirs, backupOpts);
      if (!backup) {
        report.storageFull = true;
        fail(id, { code: 'storage' });
        continue;
      }
      try {
        const newRev = await remote.put(mine, putOpts(rev));
        done.synced.push({ id, rev: newRev, localAt: mine.updatedAt });
        report.uploaded++;
        report.backups.push(backup.name);
      } catch (err) {
        store.remove(backup.id); // pas envoyée : la version en ligne y est toujours, la copie ne sert à rien
        fail(id, err);
      }
    }
  }

  // Seulement changée en ligne (ou seulement en ligne) : récupérée ici.
  for (const { id, rev, revive } of plan.download) {
    if (blocked(id) || movedHere(id)) continue;
    const p = profileOf(byId.get(id));
    if (!p) {
      fail(id, { code: 'bad-data' });
      continue;
    }
    if (!store.save(p, { touch: false })) {
      report.storageFull = true;
      fail(id, { code: 'storage' });
      continue;
    }
    done.synced.push({ id, rev, localAt: p.updatedAt, ...(revive ? { revive } : {}) });
    report.downloaded++;
  }

  // Effacée ailleurs par son propriétaire, pas changée ici : effacée ici aussi.
  for (const { id } of plan.removeLocal) {
    if (blocked(id) || movedHere(id)) continue;
    const name = nameOf(id);
    store.remove(id);
    done.removed.push(id);
    report.removed++;
    report.removedNames.push(name);
  }

  // Effacée ici par son propriétaire : pierre tombale en ligne.
  for (const { id, expect } of plan.tombstone) {
    try {
      await remote.tombstone(id, { expect, at: now() });
      done.removed.push(id);
    } catch (err) {
      fail(id, err);
    }
  }

  // Plus en ligne (« effacer mes parties en ligne ») : gardée ici, déliée.
  for (const id of plan.unlink) {
    done.unlinked.push(id);
    report.unlinked.push(nameOf(id));
  }

  // Ouvertes ici et changées ailleurs : rien n'est envoyé, on prévient.
  for (const id of plan.held) {
    report.held.push(nameOf(id));
    report.heldIds.push(id);
  }

  return { done, meta: applyDone(meta, uid, done), report };
}

/** Faux compte en ligne, en mémoire (tests) : mêmes règles que Firestore (rev + 1 à chaque écriture, vérifiée). */
export function memoryRemote(docs = []) {
  const data = new Map(docs.map((d) => [d.id, { ...d }]));
  const check = (id, expect) => {
    const cur = data.get(id);
    const curRev = cur ? (typeof cur.rev === 'number' ? cur.rev : 0) : null;
    if (curRev !== (expect ?? null)) throw Object.assign(new Error('conflict'), { code: 'conflict' });
    return (curRev ?? 0) + 1;
  };
  const remote = {
    data,
    list: async () => [...data.values()].map((d) => ({ ...d })),
    put: async (p, { expect = null, appVersion = 'dev', saveVersion = 1 } = {}) => {
      const rev = check(p.id, expect);
      data.set(p.id, { id: p.id, data: JSON.stringify(p), updatedAt: p.updatedAt, rev, name: p.name, appVersion, saveVersion });
      return rev;
    },
    tombstone: async (id, { expect = null, at = Date.now() } = {}) => {
      const rev = check(id, expect);
      data.set(id, { id, data: '', updatedAt: at, rev, deleted: true });
      return rev;
    },
    removeAll: async () => {
      data.clear();
    },
  };
  return remote;
}
