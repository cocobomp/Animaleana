// Le compte (connexion avec Google) et la base des sauvegardes en ligne (Firestore, à Zurich).
// Le code de Firebase n'est chargé qu'au moment où on en a besoin (bouton « Se connecter », ou au
// démarrage si on est déjà connecté) : le jeu reste léger et marche toujours sans Internet.
// Où est quoi : docs/HEBERGEMENT.md.

import { revOf, docGen, newGen } from '../sim/cloudSync.js';

/** Réglages publics du projet Firebase (ce ne sont pas des secrets : les règles protègent les données). */
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAuk-KkIbCPbNc-XuuIKcGx6Oxy68UrYpY',
  authDomain: 'lafermeamadichelle.firebaseapp.com',
  projectId: 'lafermeamadichelle',
  storageBucket: 'lafermeamadichelle.firebasestorage.app',
  messagingSenderId: '612724115048',
  appId: '1:612724115048:web:618649b4b349de0caddddd',
};

/** Au-delà, une partie ne rentre pas dans un document (1 Mo au plus, voir firestore.rules). */
export const MAX_SAVE_BYTES = 900000;
/** Lecture de la liste et écritures : au-delà, on abandonne (réseau muet) et la synchro suivante réessaiera. */
const LIST_TIMEOUT_MS = 30000;
const WRITE_TIMEOUT_MS = 20000;

const SIGNED_IN_KEY = 'animaleana.cloud.signedIn';
const REDIRECT_KEY = 'animaleana.cloud.redirect'; // une connexion par redirection est en cours (sessionStorage)
const PENDING_DELETE_KEY = 'animaleana.cloud.pendingDelete'; // suppression du compte à finir après reconnexion
const REAUTH_KEY = 'animaleana.cloud.reauth'; // la reconnexion pour supprimer le compte part de CETTE session (sessionStorage)

/**
 * La connexion n'est possible que depuis une vraie adresse Internet (pas la version « à emporter »
 * ouverte comme fichier).
 */
export function cloudSupported(loc = globalThis.location) {
  return Boolean(loc && /^https?:$/.test(loc.protocol));
}

/** Le jeu tourne-t-il comme une appli ajoutée à l'écran d'accueil (iPhone, iPad, Android) ? */
export function isStandalone(nav = globalThis.navigator, mm = globalThis.matchMedia) {
  try {
    return nav?.standalone === true || Boolean(mm?.('(display-mode: standalone)')?.matches);
  } catch {
    return false;
  }
}

const GAME_HOST = 'lafermeamadichelle.web.app';

/**
 * L'adresse de la page de connexion Firebase (authDomain). Partout : lafermeamadichelle.firebaseapp.com, dans une
 * fenêtre (popup). Seule exception : l'appli ajoutée à l'écran d'accueil, ouverte sur lafermeamadichelle.web.app,
 * où une fenêtre ne peut pas revenir : on passe par une redirection servie par le jeu lui-même (même adresse).
 * Il faut pour cela que https://lafermeamadichelle.web.app/__/auth/handler soit dans les URI de redirection du
 * client OAuth (docs/HEBERGEMENT.md).
 */
export function authDomainFor(hostname, { standalone = false } = {}) {
  return standalone && hostname === GAME_HOST ? GAME_HOST : FIREBASE_CONFIG.authDomain;
}

/** Connexion par redirection (et non par fenêtre) ? Seulement quand la page de connexion est à la même adresse. */
export function useRedirect(hostname, { standalone = false } = {}) {
  return standalone && authDomainFor(hostname, { standalone }) === hostname;
}

const here = () => ({ host: globalThis.location?.hostname, standalone: isStandalone() });

/** Vrai si ce navigateur s'est déjà connecté (pour charger Firebase au démarrage seulement dans ce cas). */
export function wasSignedIn() {
  try {
    return globalThis.localStorage?.getItem(SIGNED_IN_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberSignedIn(on) {
  try {
    if (on) globalThis.localStorage?.setItem(SIGNED_IN_KEY, '1');
    else globalThis.localStorage?.removeItem(SIGNED_IN_KEY);
  } catch {
    /* stockage indisponible : on se reconnectera à la main */
  }
}

function flag(store, key, value) {
  try {
    const s = globalThis[store];
    if (value === undefined) return s?.getItem(key) ?? null;
    if (value === null) s?.removeItem(key);
    else s?.setItem(key, value);
  } catch {
    /* rien */
  }
  return null;
}

/**
 * Émulateurs Firebase (tests sur cet ordinateur, mode développement seulement) : localStorage
 * 'animaleana.cloud.emulator' = « hôte » (auth 9099, Firestore 8089) ou « hôte:portAuth:portFirestore ».
 */
export function emulatorConfig(value) {
  if (!value) return null;
  const [host, auth, fs] = String(value).trim().split(':');
  if (!host) return null;
  const port = (v, d) => (/^\d{2,5}$/.test(v ?? '') ? Number(v) : d);
  return { host, auth: port(auth, 9099), firestore: port(fs, 8089) };
}

let ready = null;

/** Charge Firebase (une seule fois). Renvoie { app, auth, db, fb } où fb rassemble les fonctions utilisées. */
export function loadFirebase() {
  if (!ready) {
    ready = Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')])
      .then(([appMod, authMod, fsMod]) => {
        const { host, standalone } = here();
        const app = appMod.initializeApp({ ...FIREBASE_CONFIG, authDomain: authDomainFor(host, { standalone }) });
        const auth = authMod.getAuth(app);
        auth.languageCode = globalThis.document?.documentElement?.lang || 'fr';
        const db = fsMod.getFirestore(app);
        const emu = import.meta.env?.DEV ? emulatorConfig(flag('localStorage', 'animaleana.cloud.emulator')) : null;
        if (emu) {
          authMod.connectAuthEmulator(auth, `http://${emu.host}:${emu.auth}`, { disableWarnings: true });
          fsMod.connectFirestoreEmulator(db, emu.host, emu.firestore);
        }
        return { app, auth, db, fb: { ...authMod, ...fsMod } };
      })
      .catch((err) => {
        ready = null; // réessayer plus tard (pas d'Internet au premier essai…)
        throw err;
      });
  }
  return ready;
}

const googleProvider = (fb) => {
  const provider = new fb.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
};

/**
 * « Se connecter avec Google » : une fenêtre (popup), ou une redirection dans l'appli de l'écran d'accueil.
 * Renvoie l'utilisateur, ou null si la page part (redirection : le jeu se rouvre connecté).
 */
export async function signInWithGoogle() {
  const { auth, fb } = await loadFirebase();
  const provider = googleProvider(fb);
  const { host, standalone } = here();
  if (useRedirect(host, { standalone })) {
    rememberSignedIn(true);
    flag('sessionStorage', REDIRECT_KEY, '1');
    await fb.signInWithRedirect(auth, provider);
    return null;
  }
  const cred = await fb.signInWithPopup(auth, provider);
  rememberSignedIn(true);
  return cred.user;
}

export async function signOutCloud() {
  rememberSignedIn(false);
  const { auth, fb } = await loadFirebase();
  await fb.signOut(auth);
}

/**
 * Prévient à chaque changement de compte : cb(user | null). onError(err) : le retour d'une connexion par
 * redirection a échoué (code de Firebase, ou 'redirect-failed' si on revient sans compte). Renvoie de quoi arrêter.
 */
export async function watchUser(cb, onError = () => {}) {
  const { auth, fb } = await loadFirebase();
  const pending = redirectPending();
  // La marque de redirection n'est retirée qu'une fois le résultat connu : avant, Firebase annonce souvent
  // « personne » (null), et il ne faut pas oublier pour autant qu'une connexion est en cours.
  fb.getRedirectResult(auth)
    .then((res) => {
      if (pending && !res?.user && !auth.currentUser) onError({ code: 'redirect-failed' });
    })
    .catch((err) => onError(err))
    .finally(() => {
      if (!pending) return;
      flag('sessionStorage', REDIRECT_KEY, null);
      if (!auth.currentUser) rememberSignedIn(false);
    });
  return fb.onAuthStateChanged(auth, (user) => {
    if (user) rememberSignedIn(true);
    else if (!redirectPending()) rememberSignedIn(false);
    cb(user);
  });
}

/** Une connexion par redirection est partie de cet onglet et n'est pas encore revenue. */
export const redirectPending = () => flag('sessionStorage', REDIRECT_KEY) === '1';

/** La suppression du compte attend une reconnexion par redirection (appli de l'écran d'accueil) : uid, ou null. */
export const pendingDelete = () => flag('localStorage', PENDING_DELETE_KEY);
/** La reconnexion de suppression vient de cette session (retour de Google) : on peut finir sans redemander. */
export const reauthReturned = () => flag('sessionStorage', REAUTH_KEY) === '1';
export const clearPendingDelete = () => {
  flag('localStorage', PENDING_DELETE_KEY, null);
  flag('sessionStorage', REAUTH_KEY, null);
};

/**
 * Supprime le compte Google du jeu (Firebase Authentication). Si Google demande une connexion récente
 * (auth/requires-recent-login) : on se reconnecte (fenêtre, ou redirection dans l'appli de l'écran d'accueil),
 * puis on réessaie. Renvoie 'deleted', ou 'redirect' (la page part ; la suppression se finira au retour).
 */
export async function deleteCloudUser() {
  const { auth, fb } = await loadFirebase();
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error('not signed in'), { code: 'auth/no-current-user' });
  try {
    await fb.deleteUser(user);
  } catch (err) {
    if (err?.code !== 'auth/requires-recent-login') throw err;
    const provider = googleProvider(fb);
    const { host, standalone } = here();
    if (useRedirect(host, { standalone })) {
      flag('localStorage', PENDING_DELETE_KEY, user.uid);
      flag('sessionStorage', REAUTH_KEY, '1');
      await fb.reauthenticateWithRedirect(user, provider);
      return 'redirect';
    }
    await fb.reauthenticateWithPopup(user, provider);
    await fb.deleteUser(user);
  }
  clearPendingDelete();
  rememberSignedIn(false);
  return 'deleted';
}

const timeout = (p, ms) => {
  let id;
  return Promise.race([
    p,
    new Promise((_, reject) => {
      id = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'unavailable' })), ms);
    }),
  ]).finally(() => clearTimeout(id));
};

/** La base en ligne d'un compte (voir src/cloud/sync.js pour la forme attendue). opts.writeTimeoutMs : tests seulement. */
export async function remoteStore(uid, { writeTimeoutMs = WRITE_TIMEOUT_MS } = {}) {
  const { db, fb } = await loadFirebase();
  const saves = fb.collection(db, 'users', uid, 'saves');

  /**
   * Écrit le document seulement s'il est encore celui attendu : rev = expect (null : absent) et même gen (identité
   * du document, null pour un document de la v1). Écrit rev + 1, en gardant gen (nouveau gen à la création).
   * Dans une transaction : refusée hors ligne (jamais mise en file pour plus tard), relue sur le serveur juste avant.
   * Renvoie { rev, gen } écrits. Attention : un délai dépassé ou un réseau coupé ne veut pas dire « pas écrit »
   * (la transaction a pu aboutir quand même, src/cloud/sync.js en tient compte).
   */
  const write = (id, fields, expect, gen) => timeout(fb.runTransaction(db, async (tx) => {
    const ref = fb.doc(saves, id);
    const snap = await tx.get(ref);
    const cur = snap.exists() ? snap.data() : null;
    const curRev = cur ? revOf(cur) : null;
    const curGen = cur ? docGen(cur) : null;
    if (curRev !== (expect ?? null) || (cur && curGen !== (gen ?? null))) throw Object.assign(new Error('conflict'), { code: 'conflict' });
    const w = { rev: (curRev ?? 0) + 1, gen: curGen ?? newGen() };
    tx.set(ref, { ...fields, ...w });
    return w;
  }, { maxAttempts: 1 }), writeTimeoutMs).catch((err) => {
    // Document changé entre la lecture et l'écriture : c'est aussi un conflit (nouvelle synchro bientôt).
    if (['aborted', 'failed-precondition'].includes(err?.code)) throw Object.assign(new Error('conflict'), { code: 'conflict' });
    throw err;
  });

  return {
    /** [{ id, data, updatedAt, rev, gen, gone, name }], lus sur le serveur (hors ligne : erreur, jamais le cache). */
    async list() {
      const snap = await timeout(fb.getDocsFromServer(saves), LIST_TIMEOUT_MS);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async put(profile, { expect = null, gen = null, appVersion = 'dev', saveVersion = 1 } = {}) {
      const data = JSON.stringify(profile);
      if (new TextEncoder().encode(data).length > MAX_SAVE_BYTES) throw Object.assign(new Error('save too big'), { code: 'too-big' });
      return write(profile.id, {
        data,
        updatedAt: Math.round(profile.updatedAt ?? 0),
        name: String(profile.name ?? '').slice(0, 60),
        saveVersion: Math.round(saveVersion),
        appVersion: String(appVersion).slice(0, 40),
      }, expect, gen);
    },
    /** Pierre tombale : gone (et non deleted, que la v1 effaçait sans regarder : voir src/sim/cloudSync.js). */
    async tombstone(id, { expect = null, gen = null, at = Date.now() } = {}) {
      return write(id, { data: '', updatedAt: Math.round(at), gone: true }, expect, gen);
    },
    /** « Effacer mes parties en ligne » : tous les documents du compte, pierres tombales comprises. */
    async removeAll() {
      const snap = await timeout(fb.getDocsFromServer(saves), LIST_TIMEOUT_MS);
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = fb.writeBatch(db);
        for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
        await timeout(batch.commit(), writeTimeoutMs);
      }
      return snap.docs.length;
    },
  };
}
