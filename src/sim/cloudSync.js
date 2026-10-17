// Synchro des parties avec un compte (cloud), version 2 : décider, partie par partie, quoi envoyer, quoi
// récupérer, quoi effacer. Module pur (ni réseau, ni stockage, ni DOM) : src/cloud/sync.js l'applique à cet
// appareil (src/sim/saveStore.js) et à la base en ligne (Firestore, src/cloud/firebase.js).
//
// Règle d'or : aucune partie n'est jamais perdue ni écrasée en silence. Les horloges des appareils ne décident
// de rien : on regarde seulement CE QUI A CHANGÉ depuis le dernier accord entre cet appareil et le compte
// (comparaisons d'égalité). La date de modification (updatedAt) ne sert qu'à choisir, quand les deux côtés ont
// changé, laquelle des deux versions reste la partie (l'autre est gardée en copie de secours, rien n'est jeté).
//
// En ligne : users/{uid}/saves/{id} = { data (profil JSON), updatedAt (informatif), rev (1, 2, 3… : +1 à chaque
// écriture, vérifié par firestore.rules et par une transaction), name, saveVersion, appVersion, deleted? }.
// Une partie effacée par son propriétaire reste une petite « pierre tombale » { deleted: true, rev } : les autres
// appareils l'effacent aussi (s'ils n'y ont pas joué depuis) au lieu de la renvoyer.
//
// Mémoire de l'appareil (localStorage 'animaleana.cloud') :
//   { v: 2,
//     owners:  { id: uid | 'device' }   à quel compte une partie de l'appareil est liée ; 'device' = gardée
//                                       seulement sur cet appareil (jamais envoyée). Sans entrée : partie sans
//                                       compte, la synchro n'y touche JAMAIS d'elle-même (on demande d'abord) ;
//     base:    { id: { rev, localAt } } rev en ligne et updatedAt LOCAL au dernier accord (même version des deux côtés) ;
//     deleted: { id: { rev, uid } }     effacée sur cet appareil par son propriétaire connecté : à effacer en ligne. }

export const META_VERSION = 2;
/** Le propriétaire « gardée seulement sur cet appareil ». */
export const DEVICE = 'device';
/** Les ids acceptés en ligne (même règle que firestore.rules). */
export const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const at = (v) => (isNum(v) ? v : 0);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
/** Rev d'un document en ligne (les documents de la v1 n'en ont pas : 0). */
export const revOf = (d) => (isNum(d?.rev) && d.rev >= 0 ? Math.floor(d.rev) : 0);

/**
 * Mémoire propre (v2). Une mémoire abîmée, absente ou de la v1 ({ owners, synced, deleted } sans v) est remise
 * à zéro : rien n'est perdu (les parties sont sur l'appareil et en ligne ; la première synchro les compare, garde
 * les deux versions si elles diffèrent, et demande à nouveau lesquelles mettre dans le compte).
 */
export function cleanMeta(meta) {
  const m = obj(meta);
  const out = { v: META_VERSION, owners: {}, base: {}, deleted: {} };
  if (m.v !== META_VERSION) return out;
  for (const [id, o] of Object.entries(obj(m.owners))) if (typeof o === 'string' && o) out.owners[id] = o;
  for (const [id, b] of Object.entries(obj(m.base))) {
    if (isNum(b?.rev) && isNum(b?.localAt)) out.base[id] = { rev: b.rev, localAt: b.localAt };
  }
  for (const [id, d] of Object.entries(obj(m.deleted))) {
    if (isNum(d?.rev) && typeof d?.uid === 'string') out.deleted[id] = { rev: d.rev, uid: d.uid };
  }
  return out;
}

/**
 * Le plan de synchro pour le compte uid.
 * local : parties de l'appareil, copies de secours exclues [{ id, updatedAt }] ;
 * remote : documents en ligne [{ id, updatedAt, rev, deleted }] (liste lue sur le serveur, jamais le cache) ;
 * opts.open : ids des parties ouvertes en ce moment (cet onglet ou un autre) : jamais remplacées ni effacées,
 * envoyées seulement si la version en ligne n'a pas changé.
 * Renvoie {
 *   upload:      [{ id, expect }]  envoyer la version de l'appareil ; expect = rev en ligne attendue (null : absente),
 *   download:    [{ id, rev, revive? }]  remplacer (ou ajouter) ici par la version en ligne (revive : effacée ici,
 *                                  mais rejouée ailleurs depuis : elle revient),
 *   conflict:    [{ id, rev }]     changée des deux côtés (ou jamais comparée) : même contenu → noter l'accord ;
 *                                  sinon garder les deux (la plus récente reste la partie, l'autre en copie de secours),
 *   tombstone:   [{ id, expect }]  écrire la pierre tombale en ligne (effacée ici par son propriétaire),
 *   removeLocal: [{ id, rev }]     effacer ici (effacée ailleurs par son propriétaire, pas changée ici),
 *   unlink:      [id]              plus en ligne alors qu'elle l'a été (« effacer mes parties en ligne ») : gardée ici,
 *                                  déliée (owners = 'device'), pas renvoyée,
 *   forget:      [id]              oublier la mémoire de ces parties (effacement terminé, plus rien nulle part),
 *   held:        [id]              ouverte ici et changée ailleurs : rien n'est envoyé (prévenir ; au retour au
 *                                  menu, le conflit garde les deux),
 *   unowned:     [id]              parties sans compte : la synchro n'y touche pas (il faut demander),
 * }
 */
export function planSync(local, remote, meta, uid, { open = [] } = {}) {
  const m = cleanMeta(meta);
  const openSet = new Set(open);
  const plan = { upload: [], download: [], conflict: [], tombstone: [], removeLocal: [], unlink: [], forget: [], held: [], unowned: [] };
  const here = new Map();
  for (const p of local ?? []) if (p?.id) here.set(p.id, at(p.updatedAt));
  const online = new Map();
  for (const d of remote ?? []) if (d?.id) online.set(d.id, { rev: revOf(d), deleted: d.deleted === true });

  // 1. Les parties de cet appareil liées à ce compte.
  for (const [id, localAt] of here) {
    const owner = m.owners[id];
    if (!owner) {
      plan.unowned.push(id);
      continue;
    }
    if (owner !== uid || !validId(id)) continue; // gardée sur l'appareil, ou à un autre compte : on n'y touche pas
    const r = online.get(id);
    const b = m.base[id];
    const localChanged = !b || localAt !== b.localAt;
    if (!r) {
      if (b) plan.unlink.push(id); // elle était en ligne et n'y est plus : effacée exprès, on la garde ici
      else plan.upload.push({ id, expect: null });
      continue;
    }
    const remoteChanged = !b || r.rev !== b.rev;
    const isOpen = openSet.has(id);
    if (r.deleted) {
      if (isOpen) continue; // on joue avec : on en reparlera au retour au menu
      if (localChanged) plan.upload.push({ id, expect: r.rev }); // jouée ici depuis : elle revient
      else plan.removeLocal.push({ id, rev: r.rev });
      continue;
    }
    if (!localChanged && !remoteChanged) continue;
    if (isOpen && remoteChanged) plan.held.push(id);
    else if (!remoteChanged) plan.upload.push({ id, expect: r.rev });
    else if (!localChanged) plan.download.push({ id, rev: r.rev });
    else plan.conflict.push({ id, rev: r.rev });
  }

  // 2. Effacées ici par leur propriétaire connecté : pierre tombale, sauf si quelqu'un y a joué ailleurs depuis.
  for (const [id, d] of Object.entries(m.deleted)) {
    if (d.uid !== uid || here.has(id)) continue;
    const r = online.get(id);
    if (!r || r.deleted) plan.forget.push(id);
    else if (r.rev === d.rev) plan.tombstone.push({ id, expect: r.rev });
    else plan.download.push({ id, rev: r.rev, revive: true }); // changée ailleurs après l'effacement : elle revient
  }

  // 3. Seulement en ligne : récupérer (nouvel appareil, ou effacée ici sans être connecté : elle revient).
  for (const [id, r] of online) {
    if (here.has(id) || m.deleted[id]?.uid === uid) continue;
    if (r.deleted) {
      if (m.owners[id] || m.base[id]) plan.forget.push(id);
      continue;
    }
    if (validId(id)) plan.download.push({ id, rev: r.rev });
  }

  // 4. Mémoire de parties qui ne sont plus ni ici ni en ligne : oubliée.
  for (const id of new Set([...Object.keys(m.owners), ...Object.keys(m.base)])) {
    if (!here.has(id) && !online.has(id) && !m.deleted[id] && !plan.forget.includes(id)) plan.forget.push(id);
  }
  return plan;
}

/** Rien à faire en ligne ni ici ? */
export const planIsEmpty = (plan) => ['upload', 'download', 'conflict', 'tombstone', 'removeLocal', 'unlink'].every((k) => !plan[k].length);

/**
 * La mémoire après une synchro. done = ce qui a vraiment été fait :
 * { synced: [{ id, rev, localAt, revive? }] (envoyée, récupérée — revive : revenue après un effacement fait ici —,
 * ou même version notée), removed: [id] (effacée ici,
 * pierre tombale écrite, ou oubliée), unlinked: [id] }.
 * À appliquer sur la mémoire RELUE à la fin de la synchro (des changements ont pu être faits pendant : partie
 * effacée, liée au compte…) : une partie effacée pendant la synchro reste à effacer, par-dessus ce qu'on vient d'envoyer.
 */
export function applyDone(meta, uid, done) {
  const m = cleanMeta(meta);
  for (const { id, rev, localAt, revive } of done.synced ?? []) {
    if (revive) delete m.deleted[id]; // effacée ici, mais rejouée ailleurs depuis : elle est revenue
    if (m.deleted[id]) {
      if (m.deleted[id].uid === uid) m.deleted[id].rev = rev;
      continue;
    }
    if (m.owners[id] && m.owners[id] !== uid) continue; // déliée ou donnée à un autre compte pendant la synchro
    m.owners[id] = uid;
    m.base[id] = { rev: at(rev), localAt: at(localAt) };
  }
  for (const id of done.removed ?? []) {
    delete m.owners[id];
    delete m.base[id];
    delete m.deleted[id];
  }
  for (const id of done.unlinked ?? []) {
    m.owners[id] = DEVICE;
    delete m.base[id];
    delete m.deleted[id];
  }
  return m;
}

// ---------------------------------------------------------------- gestes du joueur (mémoire seulement)

/** Ces parties sans compte vont dans le compte uid (cochées) ; les autres restent sur l'appareil ('device'). */
export function claimParties(meta, uid, ids, checked) {
  const m = cleanMeta(meta);
  const yes = new Set(checked);
  for (const id of ids) {
    if (m.owners[id]) continue;
    m.owners[id] = yes.has(id) ? uid : DEVICE;
    delete m.base[id];
    delete m.deleted[id];
  }
  return m;
}

/** « ☁️ Mettre dans mon compte » (ou partie créée pendant qu'on est connecté) : liée à uid, jamais encore comparée. */
export function linkParty(meta, uid, id) {
  const m = cleanMeta(meta);
  m.owners[id] = uid;
  delete m.base[id];
  delete m.deleted[id];
  return m;
}

/**
 * Ce que veut dire « effacer cette partie » pour le compte connecté (uid, ou null sans compte) :
 * 'everywhere' (liée à ce compte : effacée sur tous ses appareils), 'kept' (dans un compte, mais pas celui qui est
 * connecté : effacée ici seulement, elle reviendra à la connexion), 'here' (seulement sur cet appareil).
 */
export function deleteKind(meta, uid, id) {
  const m = cleanMeta(meta);
  const owner = m.owners[id];
  if (uid && owner === uid) return 'everywhere';
  if (owner && owner !== DEVICE && m.base[id]) return 'kept';
  return 'here';
}

/** La partie vient d'être effacée de l'appareil (voir deleteKind) : pierre tombale à écrire, ou simple oubli. */
export function noteDeleted(meta, uid, id) {
  const m = cleanMeta(meta);
  if (deleteKind(m, uid, id) === 'everywhere') m.deleted[id] = { rev: m.base[id]?.rev ?? 0, uid };
  delete m.owners[id];
  delete m.base[id];
  return m;
}

/** « Effacer mes parties en ligne » : les parties de ce compte restent sur l'appareil, déliées. */
export function unlinkAccount(meta, uid) {
  const m = cleanMeta(meta);
  for (const [id, o] of Object.entries(m.owners)) {
    if (o !== uid) continue;
    m.owners[id] = DEVICE;
    delete m.base[id];
  }
  for (const [id, d] of Object.entries(m.deleted)) if (d.uid === uid) delete m.deleted[id];
  return m;
}
