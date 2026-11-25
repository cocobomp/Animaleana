// 💌 Les avis des joueurs (src/cloud/feedback.js, src/ui/feedbackWindow.js) avec un faux SDK Firebase : le message
// (exactement les champs prévus, rien de personnel, texte nettoyé et borné), la file d'attente sur l'appareil (lecture
// tolérante, 20 au plus, renvoi au démarrage et au retour du réseau, jamais perdu, même stockage plein), les limites
// (30 s, 5 par jour), la fenêtre « Ton avis » (faux DOM), seulement dans le jeu en ligne, et ses textes FR / EN. Les
// règles elles-mêmes : tests/firestoreRules.test.js.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { installFakeDom } from './helpers/fakeDom.js';

const sdk = vi.hoisted(() => ({ docs: [], calls: [], apps: [], fail: null, hang: false, authLoaded: false }));

vi.mock('firebase/app', () => ({
  getApps: () => sdk.apps,
  initializeApp: (config, name) => {
    const app = { config, name };
    sdk.apps.push(app);
    sdk.calls.push(`init ${name}`);
    return app;
  },
  deleteApp: async (app) => {
    sdk.apps = sdk.apps.filter((a) => a !== app);
    sdk.calls.push('deleteApp');
  },
}));
// La connexion Google ne doit jamais être chargée pour un avis.
vi.mock('firebase/auth', () => {
  sdk.authLoaded = true;
  return {};
});
vi.mock('firebase/firestore', () => ({
  getFirestore: (app) => ({ app }),
  connectFirestoreEmulator: () => {},
  collection: (db, path) => ({ db, path }),
  serverTimestamp: () => ({ serverTimestamp: true }),
  addDoc: async (col, data) => {
    sdk.calls.push(`addDoc ${col.path}`);
    if (sdk.hang) return new Promise(() => {});
    if (sdk.fail) throw Object.assign(new Error(sdk.fail), { code: sdk.fail });
    sdk.docs.push({ path: col.path, app: col.db.app.name, data });
    return { id: `d${sdk.docs.length}` };
  },
}));

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

const NOW = new Date(2026, 10, 25, 10, 0, 0).getTime();
const MIN = 60000;
const CTX = { lang: 'fr', version: '0.5.0+abc1234', device: 'phone', orientation: 'portrait', mode: 'manage', level: 4, day: 12, place: 'maison', screen: 'panel:animal' };
const QUEUE = 'animaleana.feedback.queue';
const SENT = 'animaleana.feedback.sent';

let F; // src/cloud/feedback.js (rechargé à chaque test : file, envoi en cours et appli Firebase repartent de zéro)
let store;
let handlers;

async function load({ protocol = 'https:', onLine = true, init = {} } = {}) {
  vi.resetModules();
  Object.assign(sdk, { docs: [], calls: [], apps: [], fail: null, hang: false, authLoaded: false });
  store = fakeStorage(init);
  handlers = {};
  vi.stubGlobal('location', { protocol, hostname: 'lafermeamadichelle.web.app' });
  vi.stubGlobal('navigator', { onLine });
  vi.stubGlobal('localStorage', store);
  vi.stubGlobal('addEventListener', (type, fn) => { handlers[type] = fn; });
  F = await import('../src/cloud/feedback.js');
  return F;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------- le message

describe('💌 le message : exactement les champs prévus, rien de personnel', () => {
  beforeEach(() => load());

  it('les champs du message, et rien de ce que le contexte aurait en plus (prénom, partie, compte, e-mail, IP)', () => {
    const ctx = { ...CTX, name: 'Léa', profileId: 'p_lea_42', uid: 'uid-123', email: 'maman@exemple.ch', ip: '81.2.3.4' };
    const m = F.buildMessage({ mood: 'love', kind: 'idea', text: 'Plus de chevaux !' }, ctx);
    expect(Object.keys(m).sort()).toEqual([...F.FIELDS].sort());
    expect(m).toEqual({ text: 'Plus de chevaux !', mood: 'love', kind: 'idea', ...CTX });
    const json = JSON.stringify(m);
    for (const secret of ['Léa', 'p_lea_42', 'uid-123', 'maman@exemple.ch', '81.2.3.4']) expect(json).not.toContain(secret);
    expect(F.validMessage(m)).toBe(true);
  });

  it('dans le texte : adresses e-mail, numéros de téléphone et prénoms des profils masqués', () => {
    const text = 'Je m\'appelle Léa et ma sœur LUCIE. Écris à lea.dupont@exemple.ch ou au +41 79 123 45 67 ou 0612345678 ! Mon cheval Léandre a 12 ans, niveau 7.';
    const m = F.buildMessage({ mood: 'happy', text }, CTX, { names: ['Léa', 'Lucie', ' ', 'x', null] });
    expect(m.text).toBe('Je m\'appelle [prénom] et ma sœur [prénom]. Écris à [e-mail] ou au [téléphone] ou [téléphone] ! Mon cheval Léandre a 12 ans, niveau 7.');
  });

  it('prénoms des profils : le nom entier et chacun de ses mots, quelle que soit leur forme (NFD, tiret, majuscules)', () => {
    // (prénom et nom de famille dans le profil : « Léa » et « Dupont » seuls sont masqués aussi)
    expect(F.cleanText('Je suis Léa, Léa Dupont, et Dupont', { names: ['Léa Dupont'] })).toBe('Je suis [prénom], [prénom], et [prénom]');
    expect(F.cleanText('Moi c\'est marie lou, MARIE-LOU ou Marie', { names: ['Marie-Lou'] })).toBe('Moi c\'est [prénom] [prénom], [prénom] ou [prénom]');
    // Nom de profil décomposé (NFD : une partie restaurée depuis un Mac) ou texte décomposé : reconnu quand même.
    const nfd = 'Chloe\u0301';
    expect(nfd).not.toBe('Chloé');
    expect(F.cleanText('Je suis Chloé', { names: [nfd] })).toBe('Je suis [prénom]');
    expect(F.cleanText(`Je suis ${nfd} !`, { names: ['Chloé'] })).toBe('Je suis [prénom] !');
    expect(F.cleanText('Léa', { names: ['Le\u0301a Dupont'] })).toBe('[prénom]');
    // Les petits mots d'un nom ne sont pas des prénoms ; un mot plus long qui commence pareil reste.
    expect(F.cleanText('La maison de la Tour, Lou et Louise', { names: ['Lou de la Tour'] })).toBe('La maison de la [prénom], [prénom] et Louise');
    expect(F.cleanText('Ma ferme a un âne, ma sœur aussi', { names: ['Ma ferme'] })).toBe('[prénom] a un âne, ma sœur aussi');
    expect(F.nameParts(['Léa Dupont', ' Jo ', 'D\'Artagnan', 'x', null])).toEqual(['Léa Dupont', 'D\'Artagnan', 'Artagnan', 'Dupont', 'Léa', 'Jo']);
  });

  it('texte nettoyé : caractères invisibles et de contrôle retirés, espaces et lignes vides resserrés, emojis composés gardés', () => {
    const m = F.buildMessage({ text: '  Bon\u0000jour\u202E  le\tjeu\u200B !\r\n\r\n\r\n\r\nFamille 👨‍👩‍👧 \u2028fin  ' }, CTX);
    expect(m.text).toBe('Bonjour le jeu !\n\nFamille 👨‍👩‍👧\nfin');
    expect(m.mood).toBe('none');
    expect(m.kind).toBe('other');
  });

  it('bornes : 500 caractères au plus (sans couper un emoji), nombres entiers bornés, textes courts', () => {
    expect(F.MAX_TEXT).toBe(500);
    expect(F.buildMessage({ text: 'a'.repeat(700) }, CTX).text).toHaveLength(500);
    const cut = F.buildMessage({ text: `${'a'.repeat(499)}😍😍` }, CTX).text;
    expect(cut).toBe('a'.repeat(499)); // (pas de moitié d'emoji)
    expect(F.buildMessage({ text: '😍'.repeat(300) }, CTX).text).toHaveLength(500);
    const m = F.buildMessage({ mood: 'sad', kind: 'nope', text: 'x' }, {
      lang: 'de', version: '<script>1.0</script>'.repeat(5), device: 'fridge', orientation: 'up', mode: 'admin',
      level: 3.7, day: Number.NaN, place: 'maison/house"; DROP'.repeat(3), screen: 'panel:animal ride '.repeat(5),
    });
    expect(m).toMatchObject({ kind: 'other', lang: 'fr', device: 'phone', orientation: 'portrait', mode: 'none', level: 4, day: 0 });
    expect(m.version.length).toBeLessThanOrEqual(40);
    expect(m.version).not.toMatch(/[<>/]/);
    expect(m.place.length).toBeLessThanOrEqual(30);
    expect(m.screen.length).toBeLessThanOrEqual(40);
    expect(F.buildMessage({ mood: 'love' }, { level: -5, day: 1e9 })).toMatchObject({ level: 0, day: 1000000, version: 'dev' });
    expect(F.buildMessage({ mood: 'love' }, { level: 5000 }).level).toBe(1000);
    expect(F.validMessage(m)).toBe(true);
  });

  it('il faut un smiley ou un texte : rien (ou des espaces seulement) → pas de message', () => {
    expect(F.buildMessage({}, CTX)).toBeNull();
    expect(F.buildMessage({ text: '   \n\t ' }, CTX)).toBeNull();
    expect(F.buildMessage({ mood: 'pas-une-humeur', text: '' }, CTX)).toBeNull();
    expect(F.buildMessage({ mood: 'meh' }, CTX)).toMatchObject({ text: '', mood: 'meh' });
    expect(F.buildMessage({ text: 'coucou' }, CTX)).toMatchObject({ text: 'coucou', mood: 'none' });
  });

  it('validMessage : mêmes contrôles que les règles (un champ de trop, de moins ou du mauvais type : non)', () => {
    const m = F.buildMessage({ mood: 'love', text: 'super' }, CTX);
    expect(F.validMessage(m)).toBe(true);
    expect(F.validMessage({ ...m, name: 'Léa' })).toBe(false);
    const { day, ...noDay } = m;
    expect(day).toBe(12);
    expect(F.validMessage(noDay)).toBe(false);
    for (const bad of [{ level: 1.5 }, { level: -1 }, { text: 'x'.repeat(501) }, { mood: 'angry' }, { kind: 'spam' }, { lang: 'de' }, { version: '' }, { text: '', mood: 'none' }, { place: 3 }]) {
      expect(F.validMessage({ ...m, ...bad }), JSON.stringify(bad)).toBe(false);
    }
    for (const bad of [null, 'texte', [], 42]) expect(F.validMessage(bad)).toBe(false);
  });

  it('les mêmes champs et les mêmes listes que firestore.rules', () => {
    const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
    const fn = rules.slice(rules.indexOf('function validFeedback()'), rules.indexOf('match /feedback/{id}'));
    const list = (re) => JSON.parse(fn.match(re)[1].replace(/'/g, '"'));
    expect(list(/let fields = (\[[^\]]*\])/)).toEqual([...F.FIELDS, 'createdAt']);
    expect(list(/d\.mood in (\[[^\]]*\])/)).toEqual([...F.MOODS, 'none']);
    expect(list(/d\.kind in (\[[^\]]*\])/)).toEqual(F.KINDS);
    expect(fn).toMatch(/d\.text\.size\(\) <= 500/);
    expect(fn).toMatch(/d\.createdAt == request\.time/);
    expect(rules).toMatch(/match \/feedback\/\{id\} \{\s*allow create: if validFeedback\(\);\s*allow read, update, delete: if false;\s*\}/);
  });

  it('contexte du jeu : mode, niveau, jour, lieu (et bâtiment), ce qui est ouvert ; sans prénom ni partie', () => {
    expect(F.gameContext({ game: { running: false } })).toEqual({ mode: 'none', level: 0, day: 0, place: '', screen: 'profiles' });
    expect(F.gameContext(null).mode).toBe('none');
    const game = {
      running: true, profile: { id: 'p_lea_42', name: 'Léa', mode: 'sandbox', place: 'maison' }, level: 7, day: 12,
      interiors: { inside: 'stable' }, player: { mount: { id: 'h1' } }, activities: { active: null }, mgmt: { active: false, construct: { active: false } },
    };
    const ctx = F.gameContext({ game, panel: { kind: 'animal' } });
    expect(ctx).toEqual({ mode: 'sandbox', level: 7, day: 12, place: 'maison/stable', screen: 'panel:animal ride' });
    expect(JSON.stringify(ctx)).not.toMatch(/Léa|p_lea_42/);
    game.activities.active = { type: 'trail' };
    game.mgmt.construct.active = true;
    game.interiors.inside = null;
    game.profile.mode = 'manage';
    expect(F.gameContext({ game, panel: { kind: '' }, minigameOpen: true })).toMatchObject({ mode: 'manage', place: 'maison', screen: 'minigame activity:trail build ride' });
    game.player.mount = null;
    expect(F.gameContext({ game, panel: { kind: '' } }).screen).toBe('activity:trail build panel:other');
    game.player.mount = { id: 'h1' };
    // (40 caractères au plus, coupé entre deux mots)
    const long = F.gameContext({ game, panel: { kind: 'dogTrainerChat' }, minigameOpen: true, vxOpen: 1 }).screen;
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long).toBe('minigame vet activity:trail build ride');
    // Un accesseur qui casse ne casse pas l'avis.
    const broken = { running: true, profile: { mode: 'manage', place: 'japon' }, get level() { throw new Error('x'); }, get day() { throw new Error('y'); } };
    expect(F.gameContext({ game: broken })).toEqual({ mode: 'manage', level: 0, day: 0, place: 'japon', screen: '' });
  });

  it('téléphone, tablette ou ordinateur ; portrait ou paysage ; la version du jeu', () => {
    expect(F.deviceKind({ desk: true, coarse: true, width: 390, height: 844 })).toBe('computer');
    expect(F.deviceKind({ coarse: true, width: 390, height: 844 })).toBe('phone');
    expect(F.deviceKind({ coarse: true, width: 844, height: 390 })).toBe('phone');
    expect(F.deviceKind({ coarse: true, width: 820, height: 1180 })).toBe('tablet');
    expect(F.deviceKind({ coarse: false, width: 1440, height: 900 })).toBe('computer');
    expect(F.orientationOf(390, 844)).toBe('portrait');
    expect(F.orientationOf(844, 390)).toBe('landscape');
    expect(F.appVersion()).toMatch(/^(\d+\.\d+\.\d+|dev)(\+\w+)?$/);
  });
});

// ---------------------------------------------------------------- envoi et file d'attente

const valid = (text = 'coucou') => F.buildMessage({ mood: 'happy', text }, CTX);

describe('📮 envoi, et file d\'attente sur l\'appareil', () => {
  it('parti : dans « feedback », createdAt = l\'heure du serveur, appli « avis » sans connexion Google', async () => {
    await load();
    expect(await F.submitFeedback({ mood: 'love', kind: 'bug', text: 'Le cheval vole' }, CTX, { now: NOW })).toBe('sent');
    expect(sdk.docs).toHaveLength(1);
    const { path, app, data } = sdk.docs[0];
    expect(path).toBe('feedback');
    expect(app).toBe('avis');
    expect(data.createdAt).toEqual({ serverTimestamp: true });
    expect(Object.keys(data).sort()).toEqual([...F.FIELDS, 'createdAt'].sort());
    expect(data).toMatchObject({ text: 'Le cheval vole', mood: 'love', kind: 'bug' });
    expect(sdk.apps[0].config.projectId).toBe('lafermeamadichelle');
    expect(sdk.authLoaded).toBe(false);
    expect(F.readQueue()).toEqual([]);
  });

  it('lecture tolérante : une file abîmée (ancienne version, texte cassé) est oubliée sans erreur', async () => {
    for (const raw of ['{abîmé', '42', '{"a":1}', 'null', '""']) {
      await load({ init: { [QUEUE]: raw } });
      expect(F.readQueue(), raw).toEqual([]);
    }
    await load();
    const ok = valid();
    store.setItem(QUEUE, JSON.stringify([null, 3, 'x', { id: 5, msg: ok }, { id: 'a', msg: { ...ok, name: 'Léa' } }, { id: 'b', msg: { text: 'vieux' } }, { id: 'c', at: 'hier', msg: ok }]));
    expect(F.readQueue()).toEqual([{ id: 'c', at: 0, msg: ok }]);
    expect(F.pendingFeedback()).toBe(1);
  });

  it('au plus 20 messages en attente : les plus récents restent', async () => {
    await load({ onLine: false });
    const ids = [];
    for (let i = 0; i < 25; i++) ids.push(F.enqueue(valid(`message ${i}`), NOW + i));
    const q = F.readQueue();
    expect(F.MAX_QUEUE).toBe(20);
    expect(q).toHaveLength(20);
    expect(q.map((x) => x.id)).toEqual(ids.slice(5));
    expect(q[0].msg.text).toBe('message 5');
  });

  it('hors ligne : gardé sans rien charger ; renvoyé au prochain démarrage', async () => {
    await load({ onLine: false });
    expect(await F.submitFeedback({ mood: 'meh', text: 'trop dur' }, CTX, { now: NOW })).toBe('kept');
    expect(sdk.calls).toEqual([]); // (Firebase pas même chargé)
    const saved = store.m.get(QUEUE);
    expect(JSON.parse(saved)).toHaveLength(1);
    // Le lendemain, le jeu redémarre avec Internet : le message part tout seul.
    await load({ init: { [QUEUE]: saved } });
    F.startFeedback({ delayMs: 0 });
    await vi.waitFor(() => expect(sdk.docs).toHaveLength(1));
    expect(sdk.docs[0].data.text).toBe('trop dur');
    await vi.waitFor(() => expect(F.readQueue()).toEqual([]));
    // (rien en attente : au démarrage suivant, Firebase n'est pas chargé)
    await load();
    F.startFeedback({ delayMs: 0 });
    await new Promise((r) => setTimeout(r, 5));
    expect(sdk.calls).toEqual([]);
  });

  it('version « à emporter » (fichier) : pas proposé ; rien n\'est gardé ni compté (il ne pourrait jamais partir d\'ici)', async () => {
    await load({ protocol: 'file:' });
    expect(F.feedbackAvailable()).toBe(false);
    expect(await F.submitFeedback({ mood: 'love', text: 'coucou' }, CTX, { now: NOW })).toBe('offsite');
    expect(F.pendingFeedback()).toBe(0);
    expect(store.m.size).toBe(0); // (ni file d'attente, ni limites)
    expect(await F.flushFeedback()).toBe(0);
    expect(sdk.calls).toEqual([]);
    await load();
    expect(F.feedbackAvailable()).toBe(true);
  });

  it('règles pas encore publiées (refus) : gardé, puis parti quand le réseau revient', async () => {
    await load();
    F.startFeedback({ delayMs: 60000 });
    sdk.fail = 'permission-denied';
    expect(await F.submitFeedback({ mood: 'love', text: 'premier' }, CTX, { now: NOW })).toBe('kept');
    expect(await F.submitFeedback({ mood: 'love', text: 'second' }, CTX, { now: NOW + MIN })).toBe('kept');
    expect(F.readQueue().map((x) => x.msg.text)).toEqual(['premier', 'second']);
    // (s'arrête au premier refus : un essai par tentative, pas vingt)
    expect(sdk.calls.filter((c) => c.startsWith('addDoc'))).toHaveLength(2);
    sdk.fail = null;
    handlers.online();
    await vi.waitFor(() => expect(sdk.docs.map((d) => d.data.text)).toEqual(['premier', 'second'])); // (le plus ancien d'abord)
    expect(F.readQueue()).toEqual([]);
  });

  it('pas de réponse : gardé, l\'appli Firebase est fermée (pas de double envoi caché), et il repart ensuite une seule fois', async () => {
    await load();
    sdk.hang = true;
    expect(await F.submitFeedback({ text: 'lent' }, CTX, { now: NOW, timeoutMs: 20 })).toBe('kept');
    await vi.waitFor(() => expect(sdk.calls).toContain('deleteApp'));
    sdk.hang = false;
    expect(await F.flushFeedback({ timeoutMs: 1000 })).toBe(1);
    expect(sdk.docs).toHaveLength(1);
    expect(sdk.calls.filter((c) => c === 'init avis')).toHaveLength(2);
    expect(await F.flushFeedback()).toBe(0);
    expect(sdk.docs).toHaveLength(1);
  });

  it('deux envois en même temps : chaque message part une seule fois', async () => {
    await load({ onLine: false });
    for (const text of ['un', 'deux', 'trois']) F.enqueue(valid(text), NOW);
    navigator.onLine = true;
    const [a, b] = await Promise.all([F.flushFeedback(), F.flushFeedback()]);
    expect(a + b).toBe(3);
    expect(sdk.docs.map((d) => d.data.text)).toEqual(['un', 'deux', 'trois']);
  });

  it('stockage plein ou bloqué : gardé en mémoire pour de vrai (pas perdu), renvoyé au retour du réseau ; les limites tiennent', async () => {
    await load();
    F.startFeedback({ delayMs: 60000 });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => {} });
    expect(await F.submitFeedback({ text: 'un' }, CTX, { now: NOW })).toBe('sent');
    // (30 s entre deux envois, même sans stockage)
    expect(await F.submitFeedback({ text: 'trop tôt' }, CTX, { now: NOW + 1000 })).toBe('wait');
    // Règles pas encore publiées (refus), puis hors ligne : gardés en mémoire.
    sdk.fail = 'permission-denied';
    expect(await F.submitFeedback({ text: 'n2' }, CTX, { now: NOW + 2 * MIN })).toBe('kept');
    navigator.onLine = false;
    for (let i = 3; i <= 5; i++) expect(await F.submitFeedback({ text: `n${i}` }, CTX, { now: NOW + i * MIN })).toBe('kept');
    expect(F.pendingFeedback()).toBe(4);
    // (5 par jour, même sans stockage)
    expect(await F.submitFeedback({ text: 'n6' }, CTX, { now: NOW + 10 * MIN })).toBe('day');
    expect(F.pendingFeedback()).toBe(4);
    // Le réseau revient, règles publiées : ils partent, du plus ancien au plus récent, une seule fois.
    sdk.fail = null;
    navigator.onLine = true;
    handlers.online();
    await vi.waitFor(() => expect(sdk.docs.map((d) => d.data.text)).toEqual(['un', 'n2', 'n3', 'n4', 'n5']));
    expect(F.pendingFeedback()).toBe(0);
    expect(await F.flushFeedback()).toBe(0);
    expect(sdk.docs).toHaveLength(5);
  });

  it('le stockage accepte de nouveau : ce qui attendait en mémoire y passe, et survit à un redémarrage', async () => {
    await load({ onLine: false });
    let full = true;
    const m = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k) => m.get(k) ?? null, removeItem: (k) => m.delete(k),
      setItem: (k, v) => { if (full) throw new Error('QuotaExceeded'); m.set(k, String(v)); },
    });
    expect(await F.submitFeedback({ text: 'plein' }, CTX, { now: NOW })).toBe('kept');
    expect(m.has(QUEUE)).toBe(false);
    expect(F.pendingFeedback()).toBe(1);
    full = false;
    expect(await F.submitFeedback({ text: 'libre' }, CTX, { now: NOW + MIN })).toBe('kept');
    expect(JSON.parse(m.get(QUEUE)).map((it) => it.msg.text)).toEqual(['plein', 'libre']);
    expect(F.pendingFeedback()).toBe(2);
    // Le lendemain, le jeu redémarre avec Internet : les deux partent.
    await load({ init: { [QUEUE]: m.get(QUEUE) } });
    F.startFeedback({ delayMs: 0 });
    await vi.waitFor(() => expect(sdk.docs.map((d) => d.data.text)).toEqual(['plein', 'libre']));
  });

  it('stockage qui accepte mais ne rend rien : jamais « parti » à tort ; gardé en mémoire, puis parti', async () => {
    await load({ onLine: false });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    expect(await F.submitFeedback({ text: 'perdu ?' }, CTX, { now: NOW })).toBe('kept');
    expect(F.pendingFeedback()).toBe(1);
    navigator.onLine = true;
    expect(await F.flushFeedback()).toBe(1);
    expect(sdk.docs.map((d) => d.data.text)).toEqual(['perdu ?']);
    expect(F.pendingFeedback()).toBe(0);
  });
});

// ---------------------------------------------------------------- limites

describe('⏱️ limites sur l\'appareil : 30 s entre deux envois, 5 par jour', () => {
  it('30 s entre deux envois', async () => {
    await load();
    expect(F.MIN_GAP_MS).toBe(30000);
    expect(await F.submitFeedback({ text: 'un' }, CTX, { now: NOW })).toBe('sent');
    expect(await F.submitFeedback({ text: 'deux' }, CTX, { now: NOW + 10000 })).toBe('wait');
    expect(await F.submitFeedback({ text: 'deux' }, CTX, { now: NOW + 31000 })).toBe('sent');
    expect(sdk.docs).toHaveLength(2);
  });

  it('5 par jour (envoyés ou gardés) ; le lendemain, ça repart', async () => {
    await load();
    expect(F.MAX_PER_DAY).toBe(5);
    sdk.fail = 'permission-denied'; // (les gardés comptent aussi)
    for (let i = 0; i < 5; i++) expect(await F.submitFeedback({ text: `n${i}` }, CTX, { now: NOW + i * MIN })).toBe('kept');
    expect(await F.submitFeedback({ text: 'n5' }, CTX, { now: NOW + 10 * MIN })).toBe('day');
    expect(F.pendingFeedback()).toBe(5); // (refusé par la limite : ni gardé, ni compté)
    sdk.fail = null;
    const tomorrow = new Date(2026, 10, 26, 8).getTime();
    expect(await F.submitFeedback({ text: 'demain' }, CTX, { now: tomorrow })).toBe('sent');
    expect(sdk.docs.map((d) => d.data.text)).toEqual(['n0', 'n1', 'n2', 'n3', 'n4', 'demain']);
  });

  it('rien à envoyer : rien n\'est compté', async () => {
    await load();
    expect(await F.submitFeedback({ text: '  ' }, CTX, { now: NOW })).toBe('empty');
    expect(F.limitReason(NOW + 1)).toBeNull();
    expect(store.m.has(SENT)).toBe(false);
  });

  it('lecture tolérante des limites ; l\'heure de l\'appareil remise en arrière ne bloque pas', async () => {
    for (const raw of ['{abîmé', '[]', '{"n":"beaucoup","last":"hier"}']) {
      await load({ init: { [SENT]: raw } });
      expect(F.limitReason(NOW), raw).toBeNull();
    }
    await load({ init: { [SENT]: JSON.stringify({ day: F.dayKey(NOW + 3600000), n: 1, last: NOW + 3600000 }) } });
    expect(F.limitReason(NOW)).toBeNull();
    expect(F.dayKey(NOW)).toBe('2026-11-25');
  });
});

// ---------------------------------------------------------------- la fenêtre

describe('🪟 la fenêtre « Ton avis » (faux DOM)', () => {
  let W; // src/ui/feedbackWindow.js
  let i18n;
  let UI;
  let panels;
  let screens;
  let FB; // src/cloud/feedback.js, celui que la fenêtre, le menu, les réglages et l'écran des profils lisent (l'interrupteur)

  beforeAll(async () => {
    installFakeDom({ width: 360, height: 740 });
    vi.resetModules();
    i18n = await import('../src/i18n.js');
    i18n.setLang('fr');
    W = await import('../src/ui/feedbackWindow.js');
    ({ UI } = await import('../src/ui/UI.js'));
    panels = await import('../src/ui/panels.js');
    screens = await import('../src/ui/screens.js');
    FB = await import('../src/cloud/feedback.js');
  }, 120000);
  afterEach(() => {
    FB.FEEDBACK.on = true; // (allumé, comme dans le jeu)
  });
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage({ 'animaleana.profiles': JSON.stringify([{ id: 'p1', name: 'Léa' }]) }));
    vi.stubGlobal('location', { protocol: 'https:', hostname: 'lafermeamadichelle.web.app' });
  });

  /** Une fausse interface : la fenêtre est posée dans la page (isConnected), hideModal l'enlève. */
  function fakeUi(game = { running: false }) {
    return {
      game, panel: null, shown: [],
      showModal(c) { this.box = c; this.shown.push(c); document.body.append(c); },
      hideModal() { this.closed = (this.closed ?? 0) + 1; this.box?.remove(); },
    };
  }
  const all = (root, cls) => root.findAll(cls);
  const one = (root, cls) => root.findAll(cls)[0];
  const tagged = (root, tag) => {
    const out = [];
    const walk = (n) => { for (const c of n.children ?? []) { if (c.tagName === tag) out.push(c); walk(c); } };
    walk(root);
    return out;
  };
  const click = (el) => el.listeners.click.forEach((fn) => fn({ currentTarget: el }));
  const type = (ta, s) => { ta.value = s; ta.listeners.input.forEach((fn) => fn({})); };
  const button = (root, text) => tagged(root, 'BUTTON').find((b) => b.textContent.includes(text));
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('4 gros smileys, 4 sortes, une zone de texte avec compteur, la phrase de prudence, Envoyer et Annuler (Échap)', () => {
    const ui = fakeUi();
    W.openFeedback(ui);
    const root = ui.box;
    expect(one(root, 'fb-sheet')).toBeUndefined(); // (la racine elle-même)
    expect(root.classList.contains('fb-sheet')).toBe(true);
    expect(tagged(root, 'H3')[0].textContent).toBe('💌 Ton avis');
    const moods = all(root, 'fb-mood');
    expect(moods.map((b) => one(b, 'fb-emoji').textContent)).toEqual(['😍', '🙂', '😐', '😕']);
    expect(moods.map((b) => tagged(b, 'SMALL')[0].textContent)).toEqual(['J\'adore', 'Bien', 'Bof', 'Pas trop']);
    expect(moods.every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(moods[0].getAttribute('data-default')).toBe(''); // (le focus commence par les smileys)
    expect(all(root, 'fb-kind').map((b) => b.textContent)).toEqual(['💡 Une idée', '🐞 Un bug', '❤️ J\'aime', '💬 Autre']);
    const ta = tagged(root, 'TEXTAREA')[0];
    expect(ta.getAttribute('maxlength')).toBe('500');
    expect(ta.getAttribute('id')).toBe('fb-text');
    expect(tagged(root, 'LABEL')[0].getAttribute('for')).toBe('fb-text');
    expect(ta.getAttribute('aria-describedby')).toBe('fb-safety fb-count');
    expect(one(root, 'fb-count').textContent).toBe('0/500');
    expect(one(root, 'fb-safety').textContent).toBe('N\'écris pas ton nom, ton adresse ni ton téléphone 🙂');
    // Les groupes ont un nom (le texte au-dessus).
    for (const g of [one(root, 'fb-moods'), one(root, 'fb-kinds')]) {
      expect(g.getAttribute('role')).toBe('group');
      const id = g.getAttribute('aria-labelledby');
      expect(all(root, 'fb-label').some((l) => l.getAttribute('id') === id)).toBe(true);
    }
    const cancel = button(root, 'Annuler');
    expect(cancel.getAttribute('data-escape')).toBe('');
    expect(button(root, 'Envoyer').classList.contains('primary')).toBe(true);
    click(cancel);
    expect(ui.closed).toBe(1);
  });

  it('choisir un smiley et une sorte (et changer d\'avis) ; le compteur suit le texte', () => {
    const ui = fakeUi();
    W.openFeedback(ui);
    const root = ui.box;
    const [love, happy] = all(root, 'fb-mood');
    click(love);
    expect(love.getAttribute('aria-pressed')).toBe('true');
    expect(love.classList.contains('on')).toBe(true);
    click(happy);
    expect(love.getAttribute('aria-pressed')).toBe('false');
    expect(happy.getAttribute('aria-pressed')).toBe('true');
    click(happy);
    expect(happy.getAttribute('aria-pressed')).toBe('false');
    const bug = all(root, 'fb-kind')[1];
    click(bug);
    expect(bug.getAttribute('aria-pressed')).toBe('true');
    type(tagged(root, 'TEXTAREA')[0], 'Super jeu');
    expect(one(root, 'fb-count').textContent).toBe('9/500');
    click(button(root, 'Annuler'));
  });

  it('envoyé : ce qui part (humeur, sorte, texte, contexte sans prénom), puis « Merci ! 💌 »', async () => {
    const calls = [];
    const game = { running: true, profile: { id: 'p_lea_42', name: 'Léa', mode: 'manage', place: 'maison' }, level: 3, day: 5 };
    const ui = fakeUi(game);
    W.openFeedback(ui, { submit: async (...args) => { calls.push(args); return 'sent'; } });
    const root = ui.box;
    click(all(root, 'fb-mood')[0]);
    click(all(root, 'fb-kind')[0]);
    type(tagged(root, 'TEXTAREA')[0], 'Des licornes !');
    click(button(root, 'Envoyer'));
    await tick();
    const [input, ctx, opts] = calls[0];
    expect(input).toEqual({ mood: 'love', kind: 'idea', text: 'Des licornes !' });
    expect(Object.keys(ctx).sort()).toEqual(['day', 'device', 'lang', 'level', 'mode', 'orientation', 'place', 'screen', 'version']);
    expect(ctx).toMatchObject({ lang: 'fr', mode: 'manage', level: 3, day: 5, place: 'maison', orientation: 'portrait' });
    expect(JSON.stringify(ctx)).not.toMatch(/Léa|p_lea_42/);
    expect(opts.names).toContain('Léa'); // (pour masquer le prénom s'il est écrit)
    expect(one(root, 'fb-thanks').textContent).toMatch(/Merci\s! 💌/);
    expect(button(root, 'OK').getAttribute('data-escape')).toBe('');
    expect(button(root, 'Envoyer')).toBeUndefined();
  });

  it('gardé (hors ligne, refus, erreur ou réseau trop lent) : « Merci ! Il partira dès que possible 💌 », jamais d\'erreur technique', async () => {
    for (const submit of [async () => 'kept', async () => { throw new Error('FirebaseError: permission-denied'); }, () => new Promise(() => {})]) {
      const ui = fakeUi();
      W.openFeedback(ui, { submit, waitMs: 10 });
      type(tagged(ui.box, 'TEXTAREA')[0], 'coucou');
      click(button(ui.box, 'Envoyer'));
      await new Promise((r) => setTimeout(r, 30));
      const text = ui.box.textContent;
      expect(text).toMatch(/Merci\s! Il partira dès que possible 💌/);
      expect(text).not.toMatch(/Firebase|permission|error|erreur/i);
    }
  });

  it('rien à dire, trop tôt, trop de messages : un petit mot, la fenêtre reste ouverte', async () => {
    for (const [result, said] of [['empty', 'Choisis un smiley ou écris un petit mot 🙂'], ['wait', 'Attends un petit moment avant d\'en envoyer un autre 🙂'], ['day', 'Tu as déjà envoyé beaucoup de messages aujourd\'hui. Reviens demain 🙂'], ['offsite', 'Ton avis ne peut partir que depuis le jeu en ligne 🙂']]) {
      const ui = fakeUi();
      W.openFeedback(ui, { submit: async () => result });
      click(button(ui.box, 'Envoyer'));
      await tick();
      const status = one(ui.box, 'fb-status');
      expect(status.hidden).toBe(false);
      expect(status.getAttribute('role')).toBe('status');
      expect(status.textContent).toBe(said);
      expect(button(ui.box, 'Envoyer').disabled).toBe(false);
      click(button(ui.box, 'Annuler'));
    }
  });

  it('le petit mot s\'écrit dans la rangée collée en bas, au-dessus des boutons (jamais caché sous elle) ; un smiley ou une sorte l\'efface', async () => {
    const ui = fakeUi();
    W.openFeedback(ui, { submit: async () => 'empty' });
    const status = one(ui.box, 'fb-status');
    const foot = ui.box.children.at(-1);
    expect(['row', 'end', 'fb-foot'].every((c) => foot.classList.contains(c))).toBe(true);
    expect(foot.children[0]).toBe(status);
    expect(foot.children.slice(1).map((b) => b.textContent)).toEqual(['Annuler', '💌 Envoyer']);
    click(button(ui.box, 'Envoyer'));
    await tick();
    expect(status.hidden).toBe(false);
    click(all(ui.box, 'fb-mood')[0]);
    expect(status.hidden).toBe(true);
    click(button(ui.box, 'Envoyer'));
    await tick();
    expect(status.hidden).toBe(false);
    click(all(ui.box, 'fb-kind')[2]);
    expect(status.hidden).toBe(true);
    click(button(ui.box, 'Annuler'));
    // La rangée (le dernier enfant de la fenêtre) est collée en bas, le petit mot y prend toute une ligne ; le champ
    // reste au-dessus d'elle quand le clavier s'ouvre (src/ui/viewport.js : revealField compte sa hauteur).
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.modal-box > \.fb-sheet > \.row\.end:last-child \{ position: sticky;/);
    expect(css).toMatch(/\.fb-sheet > \.fb-foot \{ flex-wrap: wrap; \}/);
    expect(css).toMatch(/\.fb-sheet \.fb-status \{ flex: 1 0 100%;/);
    const viewport = readFileSync(new URL('../src/ui/viewport.js', import.meta.url), 'utf8');
    expect(viewport).toContain("querySelectorAll('.row.end:last-child')");
  });

  it('fermée par erreur : elle se rouvre avec ce qui était choisi et écrit ; vidée une fois envoyé', async () => {
    const ui = fakeUi();
    W.openFeedback(ui);
    click(all(ui.box, 'fb-mood')[2]);
    type(tagged(ui.box, 'TEXTAREA')[0], 'Mon brouillon');
    click(button(ui.box, 'Annuler'));
    W.openFeedback(ui, { submit: async () => 'sent' });
    expect(tagged(ui.box, 'TEXTAREA')[0].value).toBe('Mon brouillon');
    expect(all(ui.box, 'fb-mood')[2].getAttribute('aria-pressed')).toBe('true');
    expect(one(ui.box, 'fb-count').textContent).toBe('13/500');
    click(button(ui.box, 'Envoyer'));
    await tick();
    W.openFeedback(ui);
    expect(tagged(ui.box, 'TEXTAREA')[0].value).toBe('');
    expect(all(ui.box, 'fb-mood').every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
  });

  it('pour de vrai (sans réseau) : le message est gardé sur l\'appareil, sans prénom', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const game = { running: true, profile: { id: 'p1', name: 'Léa Dupont', mode: 'sandbox', place: 'alpes' }, level: 2, day: 3 };
    const ui = fakeUi(game);
    W.openFeedback(ui);
    click(all(ui.box, 'fb-mood')[1]);
    type(tagged(ui.box, 'TEXTAREA')[0], 'Moi c\'est Léa, Léa Dupont, j\'adore Caramel');
    click(button(ui.box, 'Envoyer'));
    await vi.waitFor(() => expect(one(ui.box, 'fb-thanks')).toBeDefined());
    expect(ui.box.textContent).toMatch(/dès que possible/);
    const [item] = JSON.parse(localStorage.getItem(QUEUE));
    expect(item.msg).toMatchObject({ text: 'Moi c\'est [prénom], [prénom], j\'adore Caramel', mood: 'happy', mode: 'sandbox', place: 'alpes', level: 2, day: 3 });
    expect(JSON.stringify(item)).not.toMatch(/Léa|Dupont|"p1"/);
  });

  it('éteint (on: false) : pas de 💌 dans ⋯ Plus, ⚙️ Réglages, l\'écran des profils ni l\'Aide, même en ligne', async () => {
    expect(FB.FEEDBACK.on, 'le bouton est allumé dans le jeu').toBe(true);
    FB.FEEDBACK.on = false;
    expect(FB.feedbackShown({ protocol: 'https:' })).toBe(false);
    const flat = (x) => [x].flat(Infinity).filter(Boolean).flatMap((n) => [n, ...(n.children ? flat(n.children) : [])]);
    const shown = [];
    UI.prototype.openMore.call({ game: { paused: false, profile: {} }, showModal: (c) => shown.push(c), hideModal: () => {} });
    expect(flat(shown[0]).some((n) => /Ton avis|💌/.test(n.textContent ?? ''))).toBe(false);
    let spec = null;
    const ui = fakeUi({ running: true, profile: { settings: {}, mode: 'manage', place: 'maison' }, rig: { mode: 'third' }, quality: 'high' });
    Object.assign(ui, { openPanel: (s2) => { spec = s2; }, onScreenControls: () => true, tutorial: null });
    panels.openSettings(ui);
    expect(flat(spec.render()).some((n) => n.tagName === 'BUTTON' && n.textContent.includes('Ton avis'))).toBe(false);
    const pui = fakeUi();
    pui.screen = document.createElement('div');
    pui.toast = () => {};
    screens.showProfiles(pui);
    expect(pui.screen.findAll('fb-open')).toEqual([]);
    globalThis.document = globalThis.document ?? { documentElement: {} };
    const { searchHelp } = await import('../src/ui/help.js');
    expect(searchHelp('donner mon avis').map((x) => x.id)).not.toContain('feedback');
  });

  it('allumé (on: true) : ouverte depuis « ⋯ Plus », ⚙️ Réglages et l\'écran des profils', async () => {
    FB.FEEDBACK.on = true;
    // ⋯ Plus
    const shown = [];
    const self = { game: { paused: false, profile: {} }, showModal: (c) => shown.push(c), hideModal: () => {} };
    UI.prototype.openMore.call(self);
    const sheet = [shown[0]].flat(Infinity).filter(Boolean).flatMap((n) => [n, ...n.findAll('big-action')]);
    const item = sheet.find((b) => b.classList?.contains('big-action') && b.textContent.includes('Ton avis'));
    expect(item.textContent).toContain('💌');
    click(item);
    expect(shown.at(-1).classList.contains('fb-sheet')).toBe(true);
    // ⚙️ Réglages (kind « settings » : l'avis dit « panel:settings »)
    let spec = null;
    const ui = fakeUi({ running: true, profile: { settings: {}, mode: 'manage', place: 'maison' }, rig: { mode: 'third' }, quality: 'high' });
    Object.assign(ui, { openPanel: (s) => { spec = s; }, onScreenControls: () => true, tutorial: null });
    panels.openSettings(ui);
    expect(spec.kind).toBe('settings');
    const settingsBtn = [spec.render()].flat(Infinity).filter(Boolean).find((n) => n.tagName === 'BUTTON' && n.textContent === '💌 Ton avis');
    click(settingsBtn);
    expect(ui.box.classList.contains('fb-sheet')).toBe(true);
    ui.hideModal();
    // L'écran des profils
    const pui = fakeUi();
    pui.screen = document.createElement('div');
    pui.toast = () => {};
    screens.showProfiles(pui);
    const open = pui.screen.findAll('fb-open')[0];
    expect(open.textContent).toBe('💌 Ton avis');
    click(open);
    expect(pui.box.classList.contains('fb-sheet')).toBe(true);
  });

  it('version « à emporter » (fichier) : pas de 💌 dans ⋯ Plus, ⚙️ Réglages ni l\'écran des profils ; ouverte quand même, une phrase vraie et rien de gardé', async () => {
    FB.FEEDBACK.on = true; // (allumé : c'est la version fichier qui le cache)
    vi.stubGlobal('location', { protocol: 'file:' });
    const flat = (x) => [x].flat(Infinity).filter(Boolean).flatMap((n) => [n, ...(n.children ? flat(n.children) : [])]);
    // ⋯ Plus
    const shown = [];
    UI.prototype.openMore.call({ game: { paused: false, profile: {} }, showModal: (c) => shown.push(c), hideModal: () => {} });
    expect(flat(shown[0]).some((n) => /Ton avis|💌/.test(n.textContent ?? ''))).toBe(false);
    expect(flat(shown[0]).some((n) => (n.textContent ?? '').includes('⚙️'))).toBe(true); // (le reste est bien là)
    // ⚙️ Réglages
    let spec = null;
    const ui = fakeUi({ running: true, profile: { settings: {}, mode: 'manage', place: 'maison' }, rig: { mode: 'third' }, quality: 'high' });
    Object.assign(ui, { openPanel: (s) => { spec = s; }, onScreenControls: () => true, tutorial: null });
    panels.openSettings(ui);
    expect(flat(spec.render()).some((n) => n.tagName === 'BUTTON' && n.textContent.includes('Ton avis'))).toBe(false);
    // L'écran des profils
    const pui = fakeUi();
    pui.screen = document.createElement('div');
    pui.toast = () => {};
    screens.showProfiles(pui);
    expect(pui.screen.findAll('fb-open')).toEqual([]);
    // Ouverte quand même : la phrase vraie, un seul bouton OK (Échap), rien à écrire, rien de gardé.
    let called = false;
    const wui = fakeUi();
    W.openFeedback(wui, { submit: async () => { called = true; return 'kept'; } });
    expect(wui.box.textContent).toContain('Ton avis ne peut partir que depuis le jeu en ligne 🙂');
    expect(all(wui.box, 'fb-mood')).toEqual([]);
    expect(tagged(wui.box, 'TEXTAREA')).toEqual([]);
    expect(button(wui.box, 'Envoyer')).toBeUndefined();
    const ok = button(wui.box, 'OK');
    expect(ok.getAttribute('data-escape')).toBe('');
    click(ok);
    expect(wui.closed).toBe(1);
    expect(called).toBe(false);
    expect(localStorage.getItem(QUEUE)).toBeNull();
  });
});

// ---------------------------------------------------------------- aide

describe('❓ l\'aide en parle', () => {
  it('« donner une idée », « signaler un bug » : la fiche 💌 (seulement dans le jeu en ligne)', async () => {
    globalThis.document = globalThis.document ?? { documentElement: {} };
    const { searchHelp } = await import('../src/ui/help.js');
    const FB = await import('../src/cloud/feedback.js'); // (celui que l'Aide lit)
    FB.FEEDBACK.on = true; // (allumé : la fiche n'est là que quand le bouton y est)
    vi.stubGlobal('location', { protocol: 'https:', hostname: 'lafermeamadichelle.web.app' });
    for (const q of ['donner mon avis', 'j\'ai une idée pour le jeu', 'signaler un bug', 'report a bug', 'I have an idea']) {
      expect(searchHelp(q)[0].id, q).toBe('feedback');
    }
    // (et nourrir reste nourrir : « feed » ne mène pas à « feedback »)
    for (const q of ['feed', 'give water', 'nourrir']) expect(searchHelp(q)[0].id, q).toBe('feed');
    // Version « à emporter » (fichier) : le bouton n'y est pas, la fiche non plus.
    vi.stubGlobal('location', { protocol: 'file:' });
    expect(searchHelp('donner mon avis').map((x) => x.id)).not.toContain('feedback');
    expect(searchHelp('').map((x) => x.id)).not.toContain('feedback');
    // Éteint : la fiche n'y est pas non plus, même en ligne.
    vi.stubGlobal('location', { protocol: 'https:', hostname: 'lafermeamadichelle.web.app' });
    FB.FEEDBACK.on = false;
    expect(searchHelp('donner mon avis').map((x) => x.id)).not.toContain('feedback');
    FB.FEEDBACK.on = true;
  });
});

// ---------------------------------------------------------------- textes

describe('🔤 textes FR / EN', () => {
  const KEYS = ['fb_btn', 'fb_intro', 'fb_moodLabel', 'fb_mood_love', 'fb_mood_happy', 'fb_mood_meh', 'fb_mood_sad', 'fb_kindLabel',
    'fb_kind_idea', 'fb_kind_bug', 'fb_kind_like', 'fb_kind_other', 'fb_textLabel', 'fb_placeholder', 'fb_safety', 'fb_send',
    'fb_sending', 'fb_sent', 'fb_kept', 'fb_empty', 'fb_wait', 'fb_day', 'fb_offsite'];
  let i18n;
  beforeAll(async () => {
    globalThis.document = globalThis.document ?? { documentElement: {} };
    i18n = await import('../src/i18n.js');
  });
  afterEach(() => i18n.setLang('fr'));

  it('chaque texte existe en français et en anglais, court, sans {trou}', () => {
    const seen = {};
    for (const lang of ['fr', 'en']) {
      i18n.setLang(lang);
      for (const k of KEYS) {
        const s = i18n.t(k);
        expect(s, `${lang} ${k}`).not.toBe(k);
        expect(s, `${lang} ${k}`).not.toMatch(/\{\w+\}/);
        expect(s.length, `${lang} ${k}`).toBeLessThanOrEqual(80);
        (seen[k] ??= []).push(s);
      }
    }
    // (l'anglais est bien de l'anglais : pas le texte français, pas d'accents)
    for (const k of KEYS.filter((x) => !['fb_mood_meh'].includes(x))) expect(seen[k][1], k).not.toBe(seen[k][0]);
    i18n.setLang('en');
    for (const k of KEYS) expect(i18n.t(k), k).not.toMatch(/[àâçéèêëîïôûù]/i);
  });

  it('typographie française : une espace avant « ! ? : » ; les phrases demandées', () => {
    i18n.setLang('fr');
    for (const k of KEYS) expect(i18n.t(k), k).not.toMatch(/\S[!?:;]/);
    expect(i18n.t('fb_sent')).toBe('Merci ! 💌');
    expect(i18n.t('fb_kept')).toBe('Merci ! Il partira dès que possible 💌');
    expect(i18n.t('fb_safety')).toBe('N\'écris pas ton nom, ton adresse ni ton téléphone 🙂');
    expect(i18n.t('fb_btn')).toBe('Ton avis');
  });
});
