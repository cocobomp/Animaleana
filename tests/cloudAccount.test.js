// Le compte côté jeu (src/cloud/account.js), avec un faux Firebase (src/cloud/firebase.js simulé) et le vrai
// stockage de l'appareil (profile.js sur un faux localStorage) : réseau qui va et vient, connexion qui ne reste
// jamais bloquée, question « quelles parties mettre dans ton compte ? », effacements, vie privée, minuterie.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { memoryRemote } from '../src/cloud/sync.js';

const fb = {
  signedIn: false,
  watchImpl: null,
  watchCalls: 0,
  remotes: new Map(),
  calls: [],
  signInImpl: null,
  deleteImpl: null,
  pending: null,
};
const remoteOf = (uid) => {
  if (!fb.remotes.has(uid)) fb.remotes.set(uid, memoryRemote());
  return fb.remotes.get(uid);
};

vi.mock('../src/cloud/firebase.js', () => ({
  cloudSupported: () => true,
  wasSignedIn: () => fb.signedIn,
  signInWithGoogle: async () => (fb.signInImpl ? fb.signInImpl() : null),
  signOutCloud: async () => { fb.calls.push('signOut'); fb.signedIn = false; },
  watchUser: (cb, onError) => { fb.watchCalls++; fb.cb = cb; fb.onError = onError; return fb.watchImpl(cb, onError); },
  remoteStore: async (uid) => remoteOf(uid),
  deleteCloudUser: async () => { fb.calls.push('deleteUser'); return fb.deleteImpl ? fb.deleteImpl() : 'deleted'; },
  pendingDelete: () => fb.pending,
  clearPendingDelete: () => { fb.pending = null; },
}));

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
const user = (uid = 'u1', name = 'Léa') => ({ uid, displayName: name, email: `${uid}@x.ch`, photoURL: '' });

let win;
beforeEach(() => {
  vi.resetModules();
  win = new EventTarget();
  vi.stubGlobal('addEventListener', win.addEventListener.bind(win));
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false, documentElement: { lang: 'fr' } }));
  vi.stubGlobal('location', { protocol: 'https:', hostname: 'lafermeamadichelle.web.app' });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('localStorage', fakeStorage());
  Object.assign(fb, { signedIn: false, watchCalls: 0, signInImpl: null, deleteImpl: null, pending: null, calls: [] });
  fb.remotes = new Map();
  // Par défaut : Firebase chargé, personne de connecté (comme onAuthStateChanged au démarrage).
  fb.watchImpl = async (cb) => { setTimeout(() => cb(null), 0); return () => {}; };
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function boot(o = {}) {
  const acc = await import('../src/cloud/account.js');
  const profile = await import('../src/sim/profile.js');
  const sync = await import('../src/cloud/sync.js');
  let renders = 0;
  acc.onCloudChange(() => { renders++; });
  return { acc, profile, sync, get renders() { return renders; }, start: (x = {}) => acc.startCloud({ ...o, ...x }) };
}

/** Démarre le jeu (déjà connecté sur ce navigateur), puis Firebase annonce le compte. */
async function login(s, opts = {}, uid = 'u1') {
  fb.signedIn = true;
  s.start(opts);
  await flush();
  fb.cb(user(uid));
  await flush(10);
}

async function signedIn(s, uid = 'u1', name = 'Léa') {
  fb.signedIn = true;
  fb.watchImpl = async (cb) => { setTimeout(() => cb(user(uid, name)), 0); return () => {}; };
  s.start();
  await flush();
}

describe('réseau qui va et vient', () => {
  it('invité démarré hors ligne : le retour du réseau redessine l\'encart', async () => {
    navigator.onLine = false;
    const s = await boot();
    s.start();
    const r0 = s.renders;
    navigator.onLine = true;
    win.dispatchEvent(new Event('online'));
    await flush();
    expect(s.renders).toBeGreaterThan(r0);
  });

  it('connecté, le réseau tombe : l\'encart se redessine (« pas d\'Internet »)', async () => {
    const s = await boot();
    await signedIn(s);
    expect(s.acc.cloudState().status).toBe('in');
    const r0 = s.renders;
    navigator.onLine = false;
    win.dispatchEvent(new Event('offline'));
    expect(s.renders).toBe(r0 + 1);
  });

  it('Firebase n\'a pas pu se charger au démarrage : le retour du réseau relance la reconnexion', async () => {
    fb.signedIn = true;
    fb.watchImpl = async () => { throw new Error('import failed'); };
    const s = await boot();
    s.start();
    await flush();
    expect(s.acc.cloudState().status).toBe('off');
    fb.watchImpl = async (cb) => { setTimeout(() => cb(user()), 0); return () => {}; };
    win.dispatchEvent(new Event('online'));
    await flush();
    expect(fb.watchCalls).toBe(2);
    expect(s.acc.cloudState().status).toBe('in');
  });
});

describe('connexion', () => {
  it('« Connexion… » ne reste jamais bloqué : délai de sécurité', async () => {
    vi.useFakeTimers();
    fb.signInImpl = () => new Promise(() => {}); // fenêtre perdue (appli de l'écran d'accueil…)
    const s = await boot();
    s.start();
    s.acc.signIn();
    await vi.advanceTimersByTimeAsync(10);
    expect(s.acc.cloudState().status).toBe('loading');
    await vi.advanceTimersByTimeAsync(s.acc.SIGN_IN_TIMEOUT_MS + 10);
    expect(s.acc.cloudState().status).toBe('off');
    expect(s.acc.cloudState().error).toBeNull();
  });

  it('fenêtre fermée par le joueur : pas d\'erreur affichée', async () => {
    fb.signInImpl = async () => { throw Object.assign(new Error('closed'), { code: 'auth/popup-closed-by-user' }); };
    const s = await boot();
    s.start();
    expect(await s.acc.signIn()).toBe(false);
    expect(s.acc.cloudState()).toMatchObject({ status: 'off', error: null });
  });

  it('fenêtre bloquée : erreur affichée (pas de redirection qui ne reviendrait pas)', async () => {
    fb.signInImpl = async () => { throw Object.assign(new Error('blocked'), { code: 'auth/popup-blocked' }); };
    const s = await boot();
    s.start();
    await s.acc.signIn();
    expect(s.acc.cloudState().error).toBe('auth/popup-blocked');
  });

  it('retour de redirection raté : l\'erreur est montrée dans l\'encart', async () => {
    fb.signedIn = true;
    fb.watchImpl = async (cb, onError) => { setTimeout(() => { cb(null); onError({ code: 'redirect-failed' }); }, 0); return () => {}; };
    const s = await boot();
    s.start();
    await flush();
    expect(s.acc.cloudState()).toMatchObject({ status: 'off', error: 'redirect-failed' });
  });
});

describe('tablette partagée : la question', () => {
  it('à la connexion, demande quelles parties mettre dans le compte ; non cochées → gardées sur l\'appareil', async () => {
    const s = await boot();
    const a = s.profile.createProfile('Léa');
    const b = s.profile.createProfile('Tom');
    s.profile.saveProfile(a);
    s.profile.saveProfile(b);
    const asked = [];
    await login(s, { chooseClaims: async (parties) => { asked.push(parties.map((p) => p.name).sort()); return [a.id]; } });
    expect(asked).toEqual([['Léa', 'Tom']]);
    const remote = remoteOf('u1');
    expect([...remote.data.keys()]).toEqual([a.id]);
    expect(s.sync.loadMeta().owners[b.id]).toBe('device');
    expect(s.acc.partyLink(a.id)).toBe('mine');
    expect(s.acc.partyLink(b.id)).toBe('device');
  });

  it('« Plus tard » : rien n\'est pris, et la question n\'est pas reposée pendant cette visite', async () => {
    const s = await boot();
    s.profile.saveProfile(s.profile.createProfile('Léa'));
    let n = 0;
    await login(s, { chooseClaims: async () => { n++; return null; } });
    await s.acc.syncNow();
    await flush();
    expect(n).toBe(1);
    expect(remoteOf('u1').data.size).toBe(0);
  });

  it('pas sur la partie en cours : la question attend l\'écran des profils', async () => {
    const s = await boot();
    s.profile.saveProfile(s.profile.createProfile('Léa'));
    let canAsk = false;
    let n = 0;
    await login(s, { canAsk: () => canAsk, chooseClaims: async () => { n++; return []; } });
    expect(n).toBe(0);
    canAsk = true;
    await s.acc.syncNow();
    await flush();
    expect(n).toBe(1);
  });

  it('partie créée connectée : liée au compte ; « Mettre dans mon compte » : liée puis envoyée', async () => {
    const s = await boot();
    await login(s, { chooseClaims: async () => [] });
    const p = s.profile.createProfile('Zoé');
    s.profile.saveProfile(p);
    s.acc.linkNewParty(p.id);
    await s.acc.syncNow();
    expect(remoteOf('u1').data.has(p.id)).toBe(true);
    const q = s.profile.createProfile('Copain');
    s.profile.saveProfile(q);
    s.sync.saveMeta({ ...s.sync.loadMeta(), owners: { ...s.sync.loadMeta().owners, [q.id]: 'device' } });
    s.acc.linkToAccount(q.id);
    await flush(10);
    expect(remoteOf('u1').data.has(q.id)).toBe(true);
  });
});

describe('effacer une partie', () => {
  it('liée au compte connecté : effacée partout (pierre tombale)', async () => {
    const s = await boot();
    const p = s.profile.createProfile('Léa');
    s.profile.saveProfile(p);
    await login(s, { chooseClaims: async (parties) => parties.map((x) => x.id) });
    expect(remoteOf('u1').data.get(p.id).rev).toBe(1);
    expect(s.acc.deleteKind(p.id)).toBe('everywhere');
    s.acc.deleteParty(p.id);
    await flush(10);
    expect(remoteOf('u1').data.get(p.id)).toMatchObject({ gone: true, rev: 2 });
    expect(s.profile.loadProfile(p.id)).toBeNull();
  });

  it('déconnecté : effacée seulement ici (elle reste dans le compte et reviendra)', async () => {
    const s = await boot();
    const p = s.profile.createProfile('Léa');
    s.profile.saveProfile(p);
    await login(s, { chooseClaims: async (parties) => parties.map((x) => x.id) });
    await s.acc.signOut();
    expect(s.acc.deleteKind(p.id)).toBe('kept');
    s.acc.deleteParty(p.id);
    await flush();
    expect(remoteOf('u1').data.get(p.id).gone).toBeUndefined();
    fb.cb(user()); // reconnexion
    await flush(10);
    expect(s.profile.loadProfile(p.id)?.name).toBe('Léa');
  });
});

describe('vie privée', () => {
  it('« Se déconnecter » ne touche à rien en ligne', async () => {
    const s = await boot();
    const p = s.profile.createProfile('Léa');
    s.profile.saveProfile(p);
    await login(s, { chooseClaims: async (parties) => parties.map((x) => x.id) });
    const before = JSON.stringify([...remoteOf('u1').data]);
    await s.acc.signOut();
    expect(JSON.stringify([...remoteOf('u1').data])).toBe(before);
  });

  it('« Effacer mes parties en ligne » : documents supprimés, tout reste sur l\'appareil, délié, déconnecté', async () => {
    const s = await boot();
    const p = s.profile.createProfile('Léa');
    s.profile.saveProfile(p);
    await login(s, { chooseClaims: async (parties) => parties.map((x) => x.id) });
    expect(remoteOf('u1').data.size).toBe(1);
    expect(await s.acc.eraseCloud()).toBe(true);
    expect(remoteOf('u1').data.size).toBe(0);
    expect(s.profile.loadProfile(p.id)?.name).toBe('Léa');
    expect(s.sync.loadMeta().owners[p.id]).toBe('device');
    expect(s.acc.cloudState().status).toBe('off');
    expect(fb.calls).toEqual(['signOut']);
    // Reconnexion : la partie n'est pas renvoyée d'elle-même.
    fb.cb(user());
    await flush(10);
    expect(remoteOf('u1').data.size).toBe(0);
  });

  it('« Supprimer mon compte » : pareil + suppression du compte Google du jeu', async () => {
    const s = await boot();
    const p = s.profile.createProfile('Léa');
    s.profile.saveProfile(p);
    await login(s, { chooseClaims: async (parties) => parties.map((x) => x.id) });
    expect(await s.acc.eraseCloud({ account: true })).toBe(true);
    expect(fb.calls).toEqual(['deleteUser', 'signOut']);
    expect(remoteOf('u1').data.size).toBe(0);
    expect(s.profile.loadProfile(p.id)).toBeTruthy();
  });

  it('suppression qui échoue (réseau) : erreur montrée, on reste connecté pour réessayer', async () => {
    const s = await boot();
    await login(s, { chooseClaims: async () => [] });
    fb.deleteImpl = async () => { throw Object.assign(new Error('x'), { code: 'auth/network-request-failed' }); };
    expect(await s.acc.eraseCloud({ account: true })).toBe(false);
    expect(s.acc.cloudState()).toMatchObject({ status: 'in', error: 'auth/network-request-failed', erasing: false });
  });
});

describe('quand synchroniser', () => {
  it('minuterie : seulement pendant une partie, onglet visible ; rien n\'est envoyé si rien n\'a changé', async () => {
    vi.useFakeTimers();
    const s = await boot();
    const p = s.profile.createProfile('Léa');
    s.profile.saveProfile(p);
    let playing = false;
    fb.signedIn = true;
    s.start({ playing: () => playing, chooseClaims: async (parties) => parties.map((x) => x.id) });
    await vi.advanceTimersByTimeAsync(50);
    fb.cb(user());
    await vi.advanceTimersByTimeAsync(50);
    const remote = remoteOf('u1');
    let lists = 0;
    const list = remote.list;
    remote.list = async () => { lists++; return list(); };
    await vi.advanceTimersByTimeAsync(5 * 60e3 + 10);
    expect(lists).toBe(0); // sur le menu : rien
    playing = true;
    document.hidden = true;
    await vi.advanceTimersByTimeAsync(5 * 60e3 + 10);
    expect(lists).toBe(0); // onglet caché : rien (la synchro « en arrière-plan » se fait au passage)
    document.hidden = false;
    await vi.advanceTimersByTimeAsync(5 * 60e3 + 10);
    expect(lists).toBe(1);
    expect(remote.data.get(p.id).rev).toBe(1); // rien de changé : rien d'envoyé
  });

  it('passage en arrière-plan : synchro', async () => {
    const s = await boot();
    await login(s, { chooseClaims: async () => [] });
    const remote = remoteOf('u1');
    let lists = 0;
    const list = remote.list;
    remote.list = async () => { lists++; return list(); };
    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(lists).toBe(1);
  });

  it('écriture refusée (un autre appareil vient d\'écrire) : nouvel essai bientôt', async () => {
    vi.useFakeTimers();
    const s = await boot();
    const p = s.profile.createProfile('Léa');
    s.profile.saveProfile(p);
    const remote = remoteOf('u1');
    const put = remote.put;
    let failing = true;
    remote.put = async (...a) => { if (failing) throw Object.assign(new Error('c'), { code: 'conflict' }); return put(...a); };
    fb.signedIn = true;
    s.start({ chooseClaims: async (parties) => parties.map((x) => x.id) });
    await vi.advanceTimersByTimeAsync(50);
    fb.cb(user());
    await vi.advanceTimersByTimeAsync(50);
    expect(s.acc.cloudState().error).toBe('conflict');
    expect(remote.data.has(p.id)).toBe(false);
    failing = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(remote.data.has(p.id)).toBe(true);
    expect(s.acc.cloudState().error).toBeNull();
  });

  it('liste illisible : rien n\'est décidé, l\'erreur réseau est montrée', async () => {
    const s = await boot();
    const p = s.profile.createProfile('Léa');
    s.profile.saveProfile(p);
    const remote = remoteOf('u1');
    remote.list = async () => { throw Object.assign(new Error('x'), { code: 'unavailable' }); };
    await login(s, { chooseClaims: async (parties) => parties.map((x) => x.id) });
    expect(s.acc.cloudState().error).toBe('unavailable');
    expect(s.sync.loadMeta().base[p.id]).toBeUndefined();
  });
});

describe('relecture de la v2 : effacer sans être connecté, compte supprimé, synchro incomplète', () => {
  const choose = { chooseClaims: async (parties) => parties.map((x) => x.id) };
  const google = (uid, email = 'lea@x.ch') => ({ uid, displayName: 'Léa', email, photoURL: '' });

  it('jouée pendant la déconnexion puis effacée : la confirmation dit que ces progrès seront perdus (pas « elle reviendra »)', async () => {
    const { CLOUD_FR } = await import('../src/ui/cloudTexts.js');
    const s = await boot();
    const p = s.profile.createProfile('Léa');
    p.money = 100;
    s.profile.saveProfile(p);
    await login(s, choose);
    await s.acc.signOut();
    expect(s.acc.deleteKind(p.id)).toBe('kept'); // pas jouée depuis la synchro : la version en ligne reviendra
    await new Promise((r) => setTimeout(r, 2));
    const q = s.profile.loadProfile(p.id);
    q.money = 9999; // une heure de jeu sans compte connecté (rien n'est envoyé)
    s.profile.saveProfile(q);
    expect(s.acc.deleteKind(p.id)).toBe('keptOld');
    expect(CLOUD_FR.cloud_deleteKeptOld).toMatch(/progrès seront perdus/);
    s.acc.deleteParty(p.id);
    fb.cb(user()); // reconnexion : c'est bien la version envoyée qui revient (le texte l'a dit)
    await flush(10);
    expect(s.profile.loadProfile(p.id)?.money).toBe(100);
  });

  it('compte vidé ailleurs (« Effacer mes parties en ligne » sur le téléphone) : le texte ne promet rien qu\'il ne sait pas', async () => {
    const { CLOUD_FR, CLOUD_EN } = await import('../src/ui/cloudTexts.js');
    expect(CLOUD_FR.cloud_deleteKept).toMatch(/sauf si elle en a été effacée/);
    expect(CLOUD_EN.cloud_deleteKept).toMatch(/unless it was erased/);
    expect(CLOUD_FR.cloud_deleteKeptOld).toMatch(/sauf si elle en a été effacée/);
  });

  it('« Supprimer mon compte » sur le téléphone, puis le même Google sur la tablette (nouvel uid) : la question est reposée, la partie revient dans le compte', async () => {
    const s = await boot();
    const p = s.profile.createProfile('Léa');
    p.money = 777;
    s.profile.saveProfile(p);
    const asked = [];
    fb.signedIn = true;
    s.start({ chooseClaims: async (parties) => { asked.push(parties.map((x) => x.name)); return parties.map((x) => x.id); } });
    await flush();
    fb.cb(google('U1'));
    await flush(20);
    expect(remoteOf('U1').data.has(p.id)).toBe(true);
    // Sur le téléphone : compte supprimé (documents effacés). La tablette, fermée ce jour-là, est déconnectée au réveil.
    remoteOf('U1').data.clear();
    fb.cb(null);
    await flush();
    expect(s.acc.deleteKind(p.id)).toBe('kept'); // le texte de cette confirmation dit « sauf si elle en a été effacée »
    // Léa se reconnecte avec le même compte Google : Firebase lui donne un NOUVEL uid.
    fb.cb(google('U2'));
    await flush(30);
    expect(asked).toEqual([['Léa'], ['Léa']]);
    expect(s.acc.partyLink(p.id)).toBe('mine');
    expect(JSON.parse(remoteOf('U2').data.get(p.id).data).money).toBe(777);
    expect(s.acc.deleteKind(p.id)).toBe('everywhere');
  });

  it('partie liée à un autre compte Google (pas le même e-mail) : « Mettre dans mon compte » la débloque', async () => {
    const s = await boot();
    const p = s.profile.createProfile('Léa');
    s.profile.saveProfile(p);
    fb.signedIn = true;
    s.start(choose);
    await flush();
    fb.cb(google('U1', 'lea@x.ch'));
    await flush(20);
    fb.cb(null);
    fb.cb(google('T1', 'tom@x.ch'));
    await flush(20);
    expect(s.acc.partyLink(p.id)).toBe('other'); // l'écran des profils propose le bouton, avec une confirmation
    s.acc.linkToAccount(p.id);
    await flush(20);
    expect(s.acc.partyLink(p.id)).toBe('mine');
    expect(remoteOf('T1').data.has(p.id)).toBe(true);
    expect(remoteOf('U1').data.has(p.id)).toBe(true); // rien n'est retiré de l'autre compte
  });

  it('synchro pas entièrement passée (réponse perdue) : pas de « Sauvegardé à… », l\'erreur est montrée', async () => {
    const s = await boot();
    const p = s.profile.createProfile('Léa');
    s.profile.saveProfile(p);
    await login(s, choose);
    const ok = s.acc.cloudState().lastSync;
    expect(ok).toBeGreaterThan(0);
    const remote = remoteOf('u1');
    const put = remote.put;
    // L'écriture arrive sur le serveur, mais la réponse se perd.
    remote.put = async (...a) => { await put(...a); throw Object.assign(new Error('timeout'), { code: 'unavailable' }); };
    await new Promise((r) => setTimeout(r, 2));
    const q = s.profile.loadProfile(p.id);
    q.money = 42;
    s.profile.saveProfile(q);
    await s.acc.syncNow();
    expect(s.acc.cloudState().error).toBe('unavailable');
    expect(s.acc.cloudState().lastSync).toBe(ok); // l'encart dit « dernière synchronisation complète à… », pas « Sauvegardé »
    // La synchro suivante voit que la version en ligne est la même : accord noté, plus d'erreur.
    remote.put = put;
    await new Promise((r) => setTimeout(r, 2));
    await s.acc.syncNow();
    expect(s.acc.cloudState().error).toBeNull();
    expect(s.acc.cloudState().lastSync).toBeGreaterThan(ok);
    expect(s.sync.loadMeta().base[p.id].localAt).toBe(q.updatedAt);
  });
});
