// COPIE FIGÉE de la synchro v1 (main 6906348), seulement pour tests/cloudRelecture.test.js : un appareil resté
// sur l'ancienne version du jeu pendant la mise à jour ne doit rien effacer à cause des documents de la v2.
// Ne pas modifier (seuls les chemins des import ont été adaptés).
//
// Synchro des parties avec un compte (cloud) : décider, partie par partie, quoi envoyer, quoi
// récupérer et quoi effacer. Module pur (ni réseau, ni stockage, ni DOM) : src/cloud/sync.js
// l'applique à cet appareil (src/sim/saveStore.js) et à la base en ligne (Firestore).
//
// Mémoire de la synchro (gardée sur l'appareil) :
//   meta = { owners: { id: uid }, synced: { id: updatedAt }, deleted: { id: date } }
//   - owners : à quel compte appartient une partie de l'appareil (sur une tablette partagée, chaque
//     enfant peut avoir son compte : une partie déjà liée à un autre compte n'est jamais envoyée ici) ;
//   - synced : la date de la version qui était la même des deux côtés au dernier passage
//     (pour reconnaître une partie modifiée des deux côtés depuis : on garde alors une copie de secours) ;
//   - deleted : parties effacées sur l'appareil, à effacer aussi en ligne.
//
// En ligne, une partie effacée reste une petite « pierre tombale » { deleted: true, updatedAt },
// pour que les autres appareils l'effacent aussi au lieu de la renvoyer.

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const at = (v) => (isNum(v) ? v : 0);

/** Mémoire vide (ou abîmée) → mémoire propre. */
export function cleanMeta(meta) {
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const m = obj(meta);
  return { owners: { ...obj(m.owners) }, synced: { ...obj(m.synced) }, deleted: { ...obj(m.deleted) } };
}

/**
 * Le plan de synchro pour le compte uid.
 * local : parties de l'appareil [{ id, updatedAt }] ; remote : documents en ligne [{ id, updatedAt, deleted }].
 * Renvoie {
 *   upload: [id]          envoyer la version de l'appareil,
 *   download: [{ id, conflict }]  prendre la version en ligne (conflict : l'appareil avait aussi changé
 *                         depuis le dernier passage → garder la version de l'appareil en copie de secours),
 *   removeRemote: [{ id, at }]    écrire la pierre tombale en ligne,
 *   removeLocal: [id]     effacer de l'appareil (effacée sur un autre appareil),
 *   claim: [id]           parties sans compte qui deviennent celles de uid,
 *   forget: [id]          oublier la mémoire de ces parties (traité, ou disparu des deux côtés),
 * }
 */
export function planSync(local, remote, meta, uid) {
  const m = cleanMeta(meta);
  const plan = { upload: [], download: [], removeRemote: [], removeLocal: [], claim: [], forget: [] };
  const mineHere = new Map();
  for (const p of local ?? []) {
    if (!p?.id) continue;
    const owner = m.owners[p.id];
    if (owner && owner !== uid) continue; // la partie d'un autre compte : on n'y touche pas
    if (!owner) plan.claim.push(p.id);
    mineHere.set(p.id, at(p.updatedAt));
  }
  const online = new Map();
  for (const d of remote ?? []) if (d?.id) online.set(d.id, { updatedAt: at(d.updatedAt), deleted: d.deleted === true });

  for (const [id, localAt] of mineHere) {
    const r = online.get(id);
    if (!r) {
      plan.upload.push(id);
      continue;
    }
    if (r.deleted) {
      // Effacée ailleurs : on l'efface ici, sauf si on a joué avec depuis (alors elle revient en ligne).
      if (localAt > r.updatedAt) plan.upload.push(id);
      else plan.removeLocal.push(id);
      continue;
    }
    if (localAt > r.updatedAt) plan.upload.push(id);
    else if (r.updatedAt > localAt) {
      const base = m.synced[id];
      // Modifiée des deux côtés depuis le dernier passage (ou jamais synchronisée) : la plus récente gagne,
      // l'autre est gardée en copie de secours.
      const conflict = !isNum(base) ? localAt > 0 : localAt > base;
      plan.download.push({ id, conflict });
    }
  }

  // Effacements : ceux notés (noteDeleted), et les parties déjà synchronisées qui ont disparu de l'appareil
  // (effacées depuis un écran qui ne prévient pas la synchro) : effacées « à la date du dernier passage »,
  // donc seulement si personne ne les a modifiées ailleurs depuis (sinon elles reviennent).
  const gone = { ...m.deleted };
  for (const [id, owner] of Object.entries(m.owners)) {
    if (owner === uid && !mineHere.has(id) && !(id in gone) && isNum(m.synced[id])) gone[id] = m.synced[id];
  }
  for (const [id, deletedAt] of Object.entries(gone)) {
    if (mineHere.has(id)) continue; // revenue sur l'appareil (fichier restauré…) : traitée plus haut
    const owner = m.owners[id];
    if (owner && owner !== uid) continue;
    const r = online.get(id);
    if (!r || r.deleted) plan.forget.push(id);
    else if (at(deletedAt) >= r.updatedAt) plan.removeRemote.push({ id, at: Math.max(at(deletedAt), r.updatedAt + 1) });
    else plan.download.push({ id, conflict: false }); // modifiée ailleurs après l'effacement : elle revient
  }

  for (const [id, r] of online) {
    if (mineHere.has(id) || id in gone) continue;
    const owner = m.owners[id];
    if (owner && owner !== uid) continue; // même id qu'une partie d'un autre compte : très improbable, on évite
    if (!r.deleted) plan.download.push({ id, conflict: false });
  }
  return plan;
}

/**
 * Après une synchro réussie, la mémoire à jour. done = ce qui a vraiment marché :
 * { uploaded: [{ id, updatedAt }], downloaded: [{ id, updatedAt }], removedRemote: [id], removedLocal: [id], claimed: [id], forgotten: [id] }.
 */
export function applyDone(meta, uid, done) {
  const m = cleanMeta(meta);
  for (const id of done.claimed ?? []) m.owners[id] = uid;
  for (const { id, updatedAt } of [...(done.uploaded ?? []), ...(done.downloaded ?? [])]) {
    m.owners[id] = uid;
    m.synced[id] = at(updatedAt);
    delete m.deleted[id];
  }
  for (const id of [...(done.removedRemote ?? []), ...(done.removedLocal ?? []), ...(done.forgotten ?? [])]) {
    delete m.owners[id];
    delete m.synced[id];
    delete m.deleted[id];
  }
  return m;
}

/** Une partie vient d'être effacée sur l'appareil : à effacer aussi en ligne (si elle était à un compte). */
export function noteDeleted(meta, id, now = Date.now()) {
  const m = cleanMeta(meta);
  if (m.owners[id]) m.deleted[id] = now;
  delete m.synced[id];
  return m;
}

/** Rien à faire ? (pour ne pas réveiller le réseau pour rien) */
export const planIsEmpty = (plan) =>
  !plan.upload.length && !plan.download.length && !plan.removeRemote.length && !plan.removeLocal.length;
