// Le compte du joueur, côté jeu : se connecter avec Google (facultatif), se déconnecter, et synchroniser
// les parties de l'appareil avec le compte au bon moment. Sans compte (invité), rien ne change :
// les parties restent sur l'appareil. Firebase n'est chargé que si on se connecte (ou si on l'était).

import { cloudSupported, wasSignedIn, signInWithGoogle, signOutCloud, watchUser, remoteStore } from './firebase.js';
import { runSync, loadMeta, saveMeta } from './sync.js';
import { deviceStore } from '../sim/saveStore.js';

/** Toutes les 5 minutes de jeu, et à chaque retour au menu ou mise en arrière-plan. */
const PERIOD_MS = 5 * 60 * 1000;

const state = {
  status: 'off', // 'off' (invité) | 'loading' | 'in' (connecté)
  user: null, // { uid, name, email, photo }
  syncing: false,
  lastSync: 0, // date de la dernière synchro réussie
  report: null, // résultat de la dernière synchro (src/cloud/sync.js)
  error: null, // code de la dernière erreur (connexion ou synchro)
};
const listeners = new Set();
let opts = { busy: () => [], beforeSync: () => {}, appVersion: 'dev', backupName: undefined };
let watching = null;
let running = null;
let again = false;
let timer = null;

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

function watch() {
  if (!watching) {
    watching = watchUser((user) => {
      state.user = user ? { uid: user.uid, name: user.displayName ?? '', email: user.email ?? '', photo: user.photoURL ?? '' } : null;
      state.status = user ? 'in' : 'off';
      emit();
      if (user) syncNow();
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
 * Au démarrage du jeu. o : { busy() → ids des parties ouvertes, beforeSync() (sauvegarder la partie en
 * cours), appVersion, backupName(ancien) }. Si ce navigateur était connecté, on se reconnecte tout seul.
 */
export function startCloud(o = {}) {
  opts = { ...opts, ...o };
  if (!cloudSupported()) return;
  addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) syncNow();
  });
  timer ??= setInterval(() => syncNow(), PERIOD_MS);
  if (wasSignedIn()) {
    state.status = 'loading';
    emit();
    watch().catch(() => {});
  }
}

/** Bouton « Se connecter avec Google ». Renvoie vrai si connecté. */
export async function signIn() {
  state.error = null;
  state.status = 'loading';
  emit();
  try {
    await watch();
    const user = await signInWithGoogle();
    return Boolean(user);
  } catch (err) {
    state.status = state.user ? 'in' : 'off';
    // Fenêtre fermée par le joueur : pas une erreur à afficher.
    state.error = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(err?.code) ? null : err?.code ?? 'network';
    emit();
    return false;
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

/** Synchronise maintenant (si connecté et en ligne). Plusieurs demandes en même temps n'en font qu'une de plus. */
export function syncNow() {
  if (!state.user || globalThis.navigator?.onLine === false) return Promise.resolve(null);
  if (running) {
    again = true;
    return running;
  }
  const uid = state.user.uid;
  state.syncing = true;
  emit();
  running = (async () => {
    try {
      opts.beforeSync?.();
      const remote = await remoteStore(uid);
      const { meta, report } = await runSync({
        store: deviceStore(),
        remote,
        uid,
        meta: loadMeta(),
        busy: new Set(opts.busy?.() ?? []),
        appVersion: opts.appVersion,
        backupName: opts.backupName,
      });
      saveMeta(meta);
      state.report = report;
      state.error = report.errors.length ? report.errors[0].code : null;
      state.lastSync = Date.now();
      return report;
    } catch (err) {
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
