// Le compte du joueur, côté jeu : se connecter avec Google (facultatif), se déconnecter, et synchroniser
// les parties de l'appareil avec le compte au bon moment. Sans compte (invité), rien ne change :
// les parties restent sur l'appareil. Firebase n'est chargé que si on se connecte (ou si on l'était).
//
// Quand synchroniser : au démarrage (si connecté), à la connexion, au retour au menu (partie vraiment arrêtée),
// quand le jeu passe en arrière-plan, au retour du réseau, au bouton « Synchroniser », et toutes les 5 minutes
// seulement pendant une partie, onglet visible. Rien n'est envoyé si rien n'a changé.

import {
  cloudSupported, wasSignedIn, signInWithGoogle, signOutCloud, watchUser, remoteStore, deleteCloudUser, pendingDelete, clearPendingDelete,
} from './firebase.js';
import { runSync, loadMeta, saveMeta } from './sync.js';
import { applyDone, claimParties, linkParty, deleteKind as kindOf, noteDeleted, noteAccount, unlinkAccount, DEVICE } from '../sim/cloudSync.js';
import { deviceStore } from '../sim/saveStore.js';
import { deleteProfile } from '../sim/profile.js';

const PERIOD_MS = 5 * 60 * 1000;
/** « Connexion… » ne reste jamais affiché plus longtemps (fenêtre perdue, appli gelée…). */
export const SIGN_IN_TIMEOUT_MS = 2 * 60 * 1000;
/** Écriture refusée parce qu'un autre appareil vient d'écrire : on recommence bientôt. */
const RETRY_MS = 4000;

const state = {
  status: 'off', // 'off' (invité) | 'loading' | 'in' (connecté)
  user: null, // { uid, name, email, photo }
  syncing: false,
  erasing: false, // « Effacer mes parties en ligne » / « Supprimer mon compte » en cours
  lastSync: 0, // date de la dernière synchro réussie
  report: null, // résultat de la dernière synchro (src/cloud/sync.js)
  error: null, // code de la dernière erreur (connexion ou synchro)
};
const listeners = new Set();
let opts = {
  busy: () => [], // ids des parties ouvertes (cet onglet et les autres)
  playing: () => false, // une partie est-elle ouverte dans cet onglet ?
  beforeSync: () => {}, // sauvegarder la partie en cours
  canAsk: () => true, // peut-on poser la question « quelles parties mettre dans ton compte ? » maintenant
  chooseClaims: null, // async (parties) → ids cochées, ou null (plus tard)
  appVersion: 'dev',
  backupName: undefined,
};
let watching = null;
let running = null;
let again = false;
let timer = null;
let retry = null;
let signingIn = false;
let asking = false;
const declined = new Set(); // comptes qui ont répondu « plus tard » à la question (pendant cette visite)

export const cloudState = () => state;
export const cloudAvailable = () => cloudSupported();

/** Prévient à chaque changement (connexion, synchro…). Renvoie la fonction pour arrêter. */
export function onCloudChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  for (const cb of listeners) {
    try {
      cb(state);
    } catch (err) {
      console.warn(err);
    }
  }
}

const online = () => globalThis.navigator?.onLine !== false;

function watch() {
  if (!watching) {
    watching = watchUser((user) => {
      state.user = user ? { uid: user.uid, name: user.displayName ?? '', email: user.email ?? '', photo: user.photoURL ?? '' } : null;
      state.status = user ? 'in' : signingIn ? 'loading' : 'off';
      // Le même compte Google revenu avec un autre uid (l'ancien compte du jeu a été supprimé, par exemple depuis
      // un autre appareil) : ses parties de cet appareil redeviennent sans compte, la question est reposée.
      if (user) saveMeta(noteAccount(loadMeta(), user.uid, user.email).meta);
      emit();
      if (!user) return;
      // Suppression du compte commencée avant une reconnexion par redirection : on la finit.
      if (pendingDelete() === user.uid) deleteAccount();
      else syncNow();
    }, (err) => {
      state.error = err?.code ?? 'network';
      emit();
    }).catch((err) => {
      watching = null;
      state.status = 'off';
      state.error = err?.code ?? 'network';
      emit();
      throw err;
    });
  }
  return watching;
}

/**
 * Au démarrage du jeu. o : { busy() → ids des parties ouvertes, playing() → partie ouverte dans cet onglet,
 * beforeSync() (sauvegarder la partie en cours), canAsk(), chooseClaims(parties), appVersion, backupName(ancien) }.
 * Si ce navigateur était connecté, on se reconnecte tout seul.
 */
export function startCloud(o = {}) {
  opts = { ...opts, ...o };
  if (!cloudSupported()) return;
  addEventListener('online', () => {
    emit(); // l'encart se redessine (bouton de connexion de nouveau actif…)
    // Firebase n'avait pas pu se charger (réseau absent au démarrage) : on réessaie.
    if (wasSignedIn() && !state.user && !watching) {
      state.status = 'loading';
      emit();
      watch().catch(() => {});
    }
    syncNow();
  });
  addEventListener('offline', () => emit());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) syncNow();
  });
  timer ??= setInterval(() => {
    if (!document.hidden && opts.playing?.()) syncNow();
  }, PERIOD_MS);
  if (wasSignedIn()) {
    state.status = 'loading';
    emit();
    watch().catch(() => {});
  }
}

const quietError = (code) => ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'].includes(code);

/** Bouton « Se connecter avec Google ». Renvoie vrai si connecté. */
export async function signIn() {
  state.error = null;
  state.status = 'loading';
  signingIn = true;
  emit();
  // Filet de sécurité : jamais bloqué sur « Connexion… » (fenêtre perdue, page de Google laissée ouverte…).
  const safety = setTimeout(() => {
    signingIn = false;
    if (state.status === 'loading') {
      state.status = state.user ? 'in' : 'off';
      emit();
    }
  }, SIGN_IN_TIMEOUT_MS);
  let ok = false;
  try {
    await watch();
    ok = Boolean(await signInWithGoogle());
    return ok;
  } catch (err) {
    state.status = state.user ? 'in' : 'off';
    // Fenêtre fermée par le joueur : pas une erreur à afficher.
    state.error = quietError(err?.code) ? null : err?.code ?? 'network';
    emit();
    return false;
  } finally {
    signingIn = false;
    clearTimeout(safety);
    if (!ok && state.status === 'loading' && !state.user) {
      state.status = 'off';
      emit();
    }
  }
}

/** Se déconnecter : les parties restent sur l'appareil (jouables en invité). */
export async function signOut() {
  try {
    await signOutCloud();
  } catch (err) {
    state.error = err?.code ?? 'network';
  }
  state.user = null;
  state.status = 'off';
  state.report = null;
  emit();
}

/** Les synchros de plusieurs onglets passent l'une après l'autre (sinon la dernière écriture de la mémoire gagne). */
const withLock = (fn) => (globalThis.navigator?.locks?.request ? globalThis.navigator.locks.request('animaleana-sync', fn) : fn());

/** Parties de l'appareil sans compte (copies de secours exclues). */
function unownedParties() {
  const m = loadMeta();
  return deviceStore().list().filter((e) => !e.backup && !m.owners[e.id]);
}

/**
 * Tablette partagée : la synchro ne prend jamais une partie sans compte toute seule. S'il y en a, on demande
 * lesquelles mettre dans ce compte (les autres restent sur l'appareil). La synchro n'attend pas la réponse.
 */
function maybeAsk(uid) {
  if (asking || !opts.chooseClaims || declined.has(uid) || opts.canAsk?.() === false) return;
  const parties = unownedParties();
  if (!parties.length) return;
  asking = true;
  Promise.resolve(opts.chooseClaims(parties.map((e) => ({ id: e.id, name: e.name, mode: e.mode, animals: e.animals }))))
    .then((ids) => {
      if (!Array.isArray(ids)) {
        declined.add(uid);
        return;
      }
      if (state.user?.uid !== uid) return;
      saveMeta(claimParties(loadMeta(), uid, parties.map((e) => e.id), ids));
      emit();
      syncNow();
    })
    .catch((err) => console.warn(err))
    .finally(() => {
      asking = false;
    });
}

/** Synchronise maintenant (si connecté et en ligne). Plusieurs demandes en même temps n'en font qu'une de plus. */
export function syncNow() {
  if (!state.user || !online() || state.erasing) return Promise.resolve(null);
  if (running) {
    again = true;
    return running;
  }
  const uid = state.user.uid;
  maybeAsk(uid);
  state.syncing = true;
  emit();
  running = (async () => {
    try {
      opts.beforeSync?.();
      const remote = await remoteStore(uid);
      const result = await withLock(async () => {
        const meta = loadMeta(); // relue dans le verrou (un autre onglet a pu synchroniser juste avant)
        const deletedBefore = new Set(Object.keys(meta.deleted));
        const { done, report } = await runSync({
          store: deviceStore(),
          remote,
          uid,
          meta,
          busy: () => opts.busy?.() ?? [],
          // Effacée par le joueur pendant la synchro : on n'y touche plus ici.
          skip: (id) => !deletedBefore.has(id) && Boolean(loadMeta().deleted[id]),
          appVersion: opts.appVersion,
          backupName: opts.backupName,
        });
        // Appliqué à la mémoire relue : ce qui a changé pendant la synchro (partie effacée, liée…) est gardé.
        saveMeta(applyDone(loadMeta(), uid, done));
        return report;
      });
      state.report = result;
      state.error = result.errors.length ? result.errors[0].code : null;
      // « Sauvegardé à… » seulement quand tout est passé (sinon l'encart dirait en même temps l'inverse).
      if (!result.errors.length) state.lastSync = Date.now();
      // Un autre appareil a écrit entre notre lecture et notre écriture : on recommence bientôt.
      if (result.errors.some((e) => e.code === 'conflict') && !retry) {
        retry = setTimeout(() => {
          retry = null;
          syncNow();
        }, RETRY_MS);
      }
      return result;
    } catch (err) {
      // Liste en ligne illisible (hors ligne, serveur muet…) : rien n'a été décidé ni écrit.
      state.error = err?.code ?? 'network';
      return null;
    } finally {
      state.syncing = false;
      running = null;
      emit();
      if (again) {
        again = false;
        syncNow();
      }
    }
  })();
  return running;
}

// ---------------------------------------------------------------- gestes du joueur

/** À quel compte cette partie est liée : 'mine' (compte connecté), 'device' (pas liée), 'other' (autre compte). */
export function partyLink(id) {
  const owner = loadMeta().owners[id];
  if (state.user && owner === state.user.uid) return 'mine';
  if (!owner || owner === DEVICE) return 'device';
  return 'other';
}

/** Nouvelle partie créée pendant qu'on est connecté : elle est liée au compte connecté. */
export function linkNewParty(id) {
  if (!state.user) return;
  saveMeta(linkParty(loadMeta(), state.user.uid, id));
}

/**
 * « ☁️ Mettre dans mon compte » : partie gardée sur l'appareil, ou liée à un autre compte (l'écran des profils
 * demande d'abord confirmation : ce compte a pu être supprimé, et sans ce bouton la partie resterait bloquée).
 */
export function linkToAccount(id) {
  if (!state.user) return;
  saveMeta(linkParty(loadMeta(), state.user.uid, id));
  emit();
  syncNow();
}

/**
 * Ce qu'effacer cette partie veut dire (pour le texte de la confirmation) : 'everywhere' | 'kept' | 'keptOld' |
 * 'here' (src/sim/cloudSync.js deleteKind : « reviendra » seulement si elle n'a pas changé depuis la dernière synchro).
 */
export const deleteKind = (id) => {
  const e = deviceStore().list().find((x) => x.id === id);
  return kindOf(loadMeta(), state.user?.uid ?? null, id, e?.updatedAt ?? e?.savedAt);
};

/**
 * Efface la partie de l'appareil. Liée au compte connecté : effacée aussi en ligne et sur ses autres appareils.
 * Sinon : seulement ici (la dernière version envoyée reste dans son compte Google, s'il y en a une).
 */
export function deleteParty(id) {
  const kind = deleteKind(id);
  deleteProfile(id);
  saveMeta(noteDeleted(loadMeta(), state.user?.uid ?? null, id));
  if (kind === 'everywhere') syncNow();
  return kind;
}

/**
 * « Effacer mes parties en ligne » (account = false) ou « Supprimer mon compte » (account = true) : tous les
 * documents du compte sont supprimés, tout reste sur l'appareil (parties déliées), puis on se déconnecte.
 * Renvoie true si c'est fait, 'redirect' si la page part pour une reconnexion (la suppression se finira au retour).
 */
export async function eraseCloud({ account = false } = {}) {
  if (!state.user) return false;
  const uid = state.user.uid;
  state.erasing = true;
  state.error = null;
  emit();
  try {
    if (running) await running.catch(() => {}); // laisser finir la synchro en cours (plus aucune ne démarre)
    const remote = await remoteStore(uid);
    await remote.removeAll();
    saveMeta(unlinkAccount(loadMeta(), uid));
    if (account) {
      const r = await deleteCloudUser();
      if (r === 'redirect') return 'redirect';
      // Le jeu oublie ce compte sur cet appareil (son e-mail, retenu pour reconnaître le même Google plus tard :
      // ici, ses parties sont déjà déliées, il ne sert plus à rien).
      const m = loadMeta();
      delete m.accounts[uid];
      saveMeta(m);
    }
    state.erasing = false;
    await signOut();
    state.report = { erased: account ? 'account' : 'saves' };
    emit();
    return true;
  } catch (err) {
    state.error = err?.code ?? 'network';
    return false;
  } finally {
    state.erasing = false;
    emit();
  }
}

/** Suppression du compte (et de ses parties en ligne). */
export function deleteAccount() {
  clearPendingDelete();
  return eraseCloud({ account: true });
}
