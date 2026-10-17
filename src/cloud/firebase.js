// Le compte (connexion avec Google) et la base des sauvegardes en ligne (Firestore, à Zurich).
// Le code de Firebase n'est chargé qu'au moment où on en a besoin (bouton « Se connecter », ou au
// démarrage si on est déjà connecté) : le jeu reste léger et marche toujours sans Internet.
// Où est quoi : docs/HEBERGEMENT.md.

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

const SIGNED_IN_KEY = 'animaleana.cloud.signedIn';

/**
 * La connexion n'est possible que depuis une vraie adresse Internet (pas la version « à emporter »
 * ouverte comme fichier).
 */
export function cloudSupported(loc = globalThis.location) {
  return Boolean(loc && /^https?:$/.test(loc.protocol));
}

export function authDomainFor() {
  // Le client OAuth de Google n'autorise le retour de connexion que sur lafermeamadichelle.firebaseapp.com :
  // avec l'adresse du jeu (web.app), Google refuse (redirect_uri_mismatch). La fenêtre de connexion
  // marche ainsi partout (y compris Safari, qui bloque les cookies d'autres sites).
  return FIREBASE_CONFIG.authDomain;
}

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

let ready = null;

function emulatorHost() {
  try {
    return globalThis.localStorage?.getItem('animaleana.cloud.emulator') || null;
  } catch {
    return null;
  }
}

/** Charge Firebase (une seule fois). Renvoie { app, auth, db, fb } où fb rassemble les fonctions utilisées. */
export function loadFirebase() {
  if (!ready) {
    ready = Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')])
      .then(([appMod, authMod, fsMod]) => {
        const app = appMod.initializeApp({ ...FIREBASE_CONFIG, authDomain: authDomainFor() });
        const auth = authMod.getAuth(app);
        auth.languageCode = document.documentElement.lang || 'fr';
        const db = fsMod.getFirestore(app);
        // Tests en local (mode développement seulement) : faux serveurs Firebase sur cet ordinateur.
        const emu = import.meta.env?.DEV ? emulatorHost() : null;
        if (emu) {
          authMod.connectAuthEmulator(auth, `http://${emu}:9099`, { disableWarnings: true });
          fsMod.connectFirestoreEmulator(db, emu, 8089);
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

/** Ouvre la fenêtre « Se connecter avec Google ». Renvoie l'utilisateur, ou null si la page part (redirection). */
export async function signInWithGoogle() {
  const { auth, fb } = await loadFirebase();
  const provider = new fb.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await fb.signInWithPopup(auth, provider);
    rememberSignedIn(true);
    return cred.user;
  } catch (err) {
    // Fenêtre bloquée (ou impossible, comme dans une appli ajoutée à l'écran d'accueil) : on passe par
    // une redirection, le jeu se rouvre connecté.
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-environment', 'auth/web-storage-unsupported'].includes(err?.code)) {
      rememberSignedIn(true);
      await fb.signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
}

export async function signOutCloud() {
  rememberSignedIn(false);
  const { auth, fb } = await loadFirebase();
  await fb.signOut(auth);
}

/** Prévient à chaque changement de compte : cb(user | null). Renvoie la fonction pour arrêter. */
export async function watchUser(cb) {
  const { auth, fb } = await loadFirebase();
  // Retour d'une connexion par redirection : on attend son résultat (erreur éventuelle comprise).
  fb.getRedirectResult(auth).catch((err) => console.warn('Connexion Google :', err?.code ?? err));
  return fb.onAuthStateChanged(auth, (user) => {
    rememberSignedIn(Boolean(user));
    cb(user);
  });
}

/** La base en ligne d'un compte, avec la même forme que src/sim/cloudSync.js attend. */
export async function remoteStore(uid) {
  const { db, fb } = await loadFirebase();
  const saves = fb.collection(db, 'users', uid, 'saves');
  return {
    /** [{ id, updatedAt, deleted, data }] */
    async list() {
      const snap = await fb.getDocs(saves);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async put(profile, { appVersion = 'dev', saveVersion = 1 } = {}) {
      const data = JSON.stringify(profile);
      if (new TextEncoder().encode(data).length > MAX_SAVE_BYTES) throw Object.assign(new Error('save too big'), { code: 'too-big' });
      await fb.setDoc(fb.doc(saves, profile.id), {
        data,
        updatedAt: Math.round(profile.updatedAt),
        name: String(profile.name ?? '').slice(0, 60),
        saveVersion: Math.round(saveVersion),
        appVersion: String(appVersion).slice(0, 40),
      });
    },
    async tombstone(id, at) {
      await fb.setDoc(fb.doc(saves, id), { data: '', updatedAt: Math.round(at), deleted: true });
    },
  };
}
