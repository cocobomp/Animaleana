// src/cloud/firebase.js avec un faux SDK Firebase : adresse de la page de connexion (authDomain), fenêtre ou
// redirection, liste lue sur le serveur (jamais le cache), écritures en transaction avec rev + 1, délais,
// « effacer mes parties en ligne », suppression du compte (avec reconnexion si Google la demande).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sdk = vi.hoisted(() => ({
  docs: new Map(), // chemin → données
  calls: [],
  appConfig: null,
  popup: null,
  deleteUser: null,
  redirectResult: null,
  hangTx: false,
  currentUser: { uid: 'u1' },
}));

vi.mock('firebase/app', () => ({ initializeApp: (c) => { sdk.appConfig = c; return { c }; } }));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({ get currentUser() { return sdk.currentUser; } }),
  connectAuthEmulator: (_a, url) => sdk.calls.push(`authEmu ${url}`),
  GoogleAuthProvider: class { setCustomParameters() {} },
  signInWithPopup: async () => { sdk.calls.push('popup'); if (sdk.popup) return sdk.popup(); return { user: { uid: 'u1' } }; },
  signInWithRedirect: async () => { sdk.calls.push('redirect'); return new Promise(() => {}); },
  getRedirectResult: async () => (typeof sdk.redirectResult === 'function' ? sdk.redirectResult() : sdk.redirectResult),
  onAuthStateChanged: (_a, cb) => { setTimeout(() => cb(sdk.currentUser), 0); return () => {}; },
  signOut: async () => sdk.calls.push('signOut'),
  deleteUser: async () => { sdk.calls.push('deleteUser'); if (sdk.deleteUser) return sdk.deleteUser(); return undefined; },
  reauthenticateWithPopup: async () => sdk.calls.push('reauthPopup'),
  reauthenticateWithRedirect: async () => { sdk.calls.push('reauthRedirect'); return new Promise(() => {}); },
}));
vi.mock('firebase/firestore', () => {
  const ref = (path) => ({ path, id: path.split('/').pop() });
  return {
    getFirestore: () => ({}),
    connectFirestoreEmulator: (_db, host, port) => sdk.calls.push(`fsEmu ${host}:${port}`),
    collection: (_db, ...path) => ({ path: path.join('/') }),
    doc: (col, id) => ref(`${col.path}/${id}`),
    getDocs: async () => { throw new Error('getDocs (cache possible) ne doit jamais servir'); },
    getDocsFromServer: async (col) => {
      sdk.calls.push('getDocsFromServer');
      if (sdk.offline) throw Object.assign(new Error('offline'), { code: 'unavailable' });
      const docs = [...sdk.docs].filter(([p]) => p.startsWith(`${col.path}/`)).map(([p, d]) => ({ id: p.split('/').pop(), ref: ref(p), data: () => ({ ...d }) }));
      return { docs };
    },
    runTransaction: async (_db, fn) => {
      if (sdk.hangTx) return new Promise(() => {});
      const writes = [];
      const tx = {
        get: async (r) => ({ exists: () => sdk.docs.has(r.path), data: () => ({ ...sdk.docs.get(r.path) }) }),
        set: (r, d) => writes.push([r.path, d]),
      };
      const out = await fn(tx);
      for (const [p, d] of writes) sdk.docs.set(p, d);
      return out;
    },
    writeBatch: () => {
      const dels = [];
      return { delete: (r) => dels.push(r.path), commit: async () => { for (const p of dels) sdk.docs.delete(p); sdk.calls.push(`batch ${dels.length}`); } };
    },
  };
});

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

async function load({ host = 'lafermeamadichelle.web.app', standalone = false, emulator = null } = {}) {
  vi.resetModules();
  vi.stubGlobal('location', { protocol: 'https:', hostname: host });
  vi.stubGlobal('navigator', { standalone, onLine: true });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('localStorage', fakeStorage(emulator ? { 'animaleana.cloud.emulator': emulator } : {}));
  vi.stubGlobal('sessionStorage', fakeStorage());
  vi.stubGlobal('document', { documentElement: { lang: 'fr' } });
  return import('../src/cloud/firebase.js');
}

beforeEach(() => {
  sdk.docs = new Map();
  sdk.calls = [];
  sdk.popup = null;
  sdk.deleteUser = null;
  sdk.redirectResult = null;
  sdk.hangTx = false;
  sdk.offline = false;
  sdk.currentUser = { uid: 'u1' };
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('page de connexion (authDomain) et fenêtre ou redirection', () => {
  it('firebaseapp.com partout ; l\'adresse du jeu seulement dans l\'appli de l\'écran d\'accueil sur web.app', async () => {
    const f = await load();
    expect(f.authDomainFor('lafermeamadichelle.web.app')).toBe('lafermeamadichelle.firebaseapp.com');
    expect(f.authDomainFor('cocobomp.github.io')).toBe('lafermeamadichelle.firebaseapp.com');
    expect(f.authDomainFor('localhost')).toBe('lafermeamadichelle.firebaseapp.com');
    expect(f.authDomainFor('lafermeamadichelle.web.app', { standalone: true })).toBe('lafermeamadichelle.web.app');
    expect(f.authDomainFor('cocobomp.github.io', { standalone: true })).toBe('lafermeamadichelle.firebaseapp.com');
    expect(f.useRedirect('lafermeamadichelle.web.app', { standalone: true })).toBe(true);
    expect(f.useRedirect('lafermeamadichelle.web.app')).toBe(false);
    expect(f.useRedirect('cocobomp.github.io', { standalone: true })).toBe(false); // github.io : fenêtre seulement
  });

  it('appli de l\'écran d\'accueil reconnue (iPhone : navigator.standalone ; ailleurs : display-mode)', async () => {
    const f = await load();
    expect(f.isStandalone({ standalone: true }, () => ({ matches: false }))).toBe(true);
    expect(f.isStandalone({}, (q) => ({ matches: q === '(display-mode: standalone)' }))).toBe(true);
    expect(f.isStandalone({}, () => ({ matches: false }))).toBe(false);
  });

  it('navigateur ordinaire sur web.app : fenêtre, avec firebaseapp.com', async () => {
    const f = await load();
    const u = await f.signInWithGoogle();
    expect(u.uid).toBe('u1');
    expect(sdk.calls).toEqual(['popup']);
    expect(sdk.appConfig.authDomain).toBe('lafermeamadichelle.firebaseapp.com');
  });

  it('appli de l\'écran d\'accueil sur web.app : redirection servie par le jeu lui-même', async () => {
    const f = await load({ standalone: true });
    f.signInWithGoogle();
    await vi.waitFor(() => expect(sdk.calls).toEqual(['redirect']));
    expect(sdk.appConfig.authDomain).toBe('lafermeamadichelle.web.app');
    expect(sessionStorage.getItem('animaleana.cloud.redirect')).toBe('1');
  });

  it('github.io (même en appli) : fenêtre seulement ; fenêtre bloquée → erreur, pas de redirection', async () => {
    const f = await load({ host: 'cocobomp.github.io', standalone: true });
    sdk.popup = async () => { throw Object.assign(new Error('blocked'), { code: 'auth/popup-blocked' }); };
    await expect(f.signInWithGoogle()).rejects.toMatchObject({ code: 'auth/popup-blocked' });
    expect(sdk.calls).toEqual(['popup']);
  });

  it('retour de redirection sans compte : erreur « redirect-failed » ; erreur de Firebase : transmise', async () => {
    let f = await load({ standalone: true });
    sessionStorage.setItem('animaleana.cloud.redirect', '1');
    sdk.currentUser = null;
    const errors = [];
    await f.watchUser(() => {}, (e) => errors.push(e.code));
    await vi.waitFor(() => expect(errors).toEqual(['redirect-failed']));
    f = await load({ standalone: true });
    sdk.redirectResult = () => Promise.reject(Object.assign(new Error('x'), { code: 'auth/network-request-failed' }));
    const errors2 = [];
    await f.watchUser(() => {}, (e) => errors2.push(e.code));
    await vi.waitFor(() => expect(errors2).toEqual(['auth/network-request-failed']));
  });
});

describe('émulateurs (développement)', () => {
  it('« hôte » seul : 9099 / 8089 ; « hôte:portAuth:portFirestore » : ces ports', async () => {
    const f = await load();
    expect(f.emulatorConfig('127.0.0.1')).toEqual({ host: '127.0.0.1', auth: 9099, firestore: 8089 });
    expect(f.emulatorConfig('127.0.0.1:9110:8110')).toEqual({ host: '127.0.0.1', auth: 9110, firestore: 8110 });
    expect(f.emulatorConfig('')).toBeNull();
  });

  it('branchés avec les ports demandés', async () => {
    const f = await load({ emulator: 'localhost:9110:8110' });
    await f.loadFirebase();
    expect(sdk.calls).toContain('authEmu http://localhost:9110');
    expect(sdk.calls).toContain('fsEmu localhost:8110');
  });
});

describe('base en ligne', () => {
  it('liste lue sur le serveur ; hors ligne : erreur (jamais une liste vide du cache)', async () => {
    const f = await load();
    const r = await f.remoteStore('u1');
    sdk.docs.set('users/u1/saves/a', { data: '{}', updatedAt: 1, rev: 2 });
    expect(await r.list()).toEqual([{ id: 'a', data: '{}', updatedAt: 1, rev: 2 }]);
    sdk.offline = true;
    await expect(r.list()).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('écriture : rev 1 à la création, +1 ensuite ; rev en ligne différente de celle attendue → conflit, rien d\'écrit', async () => {
    const f = await load();
    const r = await f.remoteStore('u1');
    const p = { id: 'a', name: 'Léa', updatedAt: 10.4, money: 1 };
    expect(await r.put(p, { expect: null })).toBe(1);
    expect(sdk.docs.get('users/u1/saves/a')).toMatchObject({ rev: 1, updatedAt: 10, name: 'Léa' });
    expect(await r.put({ ...p, money: 2 }, { expect: 1 })).toBe(2);
    await expect(r.put({ ...p, money: 3 }, { expect: 1 })).rejects.toMatchObject({ code: 'conflict' });
    await expect(r.put({ ...p, money: 3 }, { expect: null })).rejects.toMatchObject({ code: 'conflict' });
    expect(JSON.parse(sdk.docs.get('users/u1/saves/a').data).money).toBe(2);
    expect(await r.tombstone('a', { expect: 2, at: 99 })).toBe(3);
    expect(sdk.docs.get('users/u1/saves/a')).toEqual({ data: '', updatedAt: 99, deleted: true, rev: 3 });
  });

  it('document de la v1 (sans rev) : compté comme rev 0', async () => {
    const f = await load();
    const r = await f.remoteStore('u1');
    sdk.docs.set('users/u1/saves/a', { data: '{}', updatedAt: 1 });
    expect(await r.put({ id: 'a', name: 'L', updatedAt: 2 }, { expect: 0 })).toBe(1);
  });

  it('partie trop grande : refusée avant d\'écrire', async () => {
    const f = await load();
    const r = await f.remoteStore('u1');
    await expect(r.put({ id: 'a', name: 'L', updatedAt: 1, junk: 'x'.repeat(f.MAX_SAVE_BYTES) })).rejects.toMatchObject({ code: 'too-big' });
  });

  it('réseau muet : l\'écriture abandonne après un délai (la synchro n\'est jamais bloquée)', async () => {
    vi.useFakeTimers();
    const f = await load();
    const r = await f.remoteStore('u1');
    sdk.hangTx = true;
    const p = r.put({ id: 'a', name: 'L', updatedAt: 1 }, { expect: null });
    const check = expect(p).rejects.toMatchObject({ code: 'unavailable' });
    await vi.advanceTimersByTimeAsync(21000);
    await check;
  });

  it('« effacer mes parties en ligne » : tous les documents du compte (pierres tombales comprises), pas ceux des autres', async () => {
    const f = await load();
    const r = await f.remoteStore('u1');
    sdk.docs.set('users/u1/saves/a', { data: '{}', updatedAt: 1, rev: 1 });
    sdk.docs.set('users/u1/saves/b', { data: '', updatedAt: 1, rev: 2, deleted: true });
    sdk.docs.set('users/u2/saves/c', { data: '{}', updatedAt: 1, rev: 1 });
    expect(await r.removeAll()).toBe(2);
    expect([...sdk.docs.keys()]).toEqual(['users/u2/saves/c']);
  });
});

describe('supprimer le compte', () => {
  it('directement si Google le permet', async () => {
    const f = await load();
    await f.loadFirebase();
    expect(await f.deleteCloudUser()).toBe('deleted');
    expect(sdk.calls).toEqual(['deleteUser']);
  });

  it('auth/requires-recent-login : reconnexion (fenêtre) puis nouvel essai', async () => {
    const f = await load();
    let n = 0;
    sdk.deleteUser = async () => { if (n++ === 0) throw Object.assign(new Error('old'), { code: 'auth/requires-recent-login' }); };
    expect(await f.deleteCloudUser()).toBe('deleted');
    expect(sdk.calls).toEqual(['deleteUser', 'reauthPopup', 'deleteUser']);
  });

  it('appli de l\'écran d\'accueil : reconnexion par redirection, la suppression se finit au retour', async () => {
    const f = await load({ standalone: true });
    sdk.deleteUser = async () => { throw Object.assign(new Error('old'), { code: 'auth/requires-recent-login' }); };
    const p = f.deleteCloudUser();
    await vi.waitFor(() => expect(sdk.calls).toEqual(['deleteUser', 'reauthRedirect']));
    expect(f.pendingDelete()).toBe('u1');
    void p;
  });
});
