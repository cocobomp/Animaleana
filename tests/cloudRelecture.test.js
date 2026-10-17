// Les constats de la relecture de la synchro v2, rejoués (moteur : runSync, stockages en mémoire ou vrai stockage
// de l'appareil, faux compte en ligne aux mêmes règles que Firestore). Chaque test affirme le BON comportement :
// aucune session jouée n'est perdue (elle existe encore quelque part : appareil, copie de secours, ou en ligne).
// Les gestes du compte (effacer une partie, compte supprimé) sont dans tests/cloudAccount.test.js, la partie
// ouverte dans deux onglets dans tests/gameCloud.test.js, la vraie base (émulateur) dans tests/cloudEmulator.test.js.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { runSync, memoryRemote, surelyNotWritten } from '../src/cloud/sync.js';
import { memoryStore, deviceStore, restoreReplace, saveGuarded } from '../src/sim/saveStore.js';
import { createProfile } from '../src/sim/profile.js';
import { claimParties, linkParty, noteDeleted, unlinkAccount } from '../src/sim/cloudSync.js';
import * as v1 from './fixtures/syncV1/sync.js';

const LEA = 'uid-lea';
const H = 3600e3;
const prof = (id, name, updatedAt, extra = {}) => ({ ...createProfile(name, 'sandbox'), id, updatedAt, ...extra });
const backupName = (p) => `${p.name} (secours)`;
const remoteMoney = (remote, id) => (remote.data.get(id)?.data ? JSON.parse(remote.data.get(id).data).money : undefined);
const backups = (store) => store.list().filter((e) => e.backup);

/** Un appareil : son stockage, sa mémoire de synchro, son décalage d'horloge. */
function device(remote, { uid = LEA, profiles = [], skew = 0, meta = {}, store = null } = {}) {
  const d = {
    store: store ?? memoryStore(profiles),
    meta,
    uid,
    remote,
    skew,
    open: [],
    at(real) {
      vi.setSystemTime(real + d.skew);
    },
    async sync(real, opts = {}) {
      if (real !== undefined) d.at(real);
      const r = await runSync({ store: d.store, remote: opts.remote ?? d.remote, uid: d.uid, meta: d.meta, busy: () => d.open, backupName, ...opts });
      d.meta = r.meta;
      return r.report;
    },
    play(id, money, real) {
      d.at(real);
      const p = d.store.load(id);
      p.money = money;
      expect(d.store.save(p)).toBe(true);
      return p;
    },
    claim(ids, checked = ids) {
      d.meta = claimParties(d.meta, d.uid, ids, checked);
    },
  };
  return d;
}

/** Toutes les valeurs de money présentes quelque part (appareils + en ligne), copies de secours comprises. */
function everywhere(devices, remotes) {
  const out = [];
  for (const d of devices) for (const e of d.store.list()) out.push(d.store.load(e.id).money);
  for (const r of remotes) for (const doc of r.data.values()) if (doc.data) out.push(JSON.parse(doc.data).money);
  return out;
}

/**
 * Le compte en ligne vu à travers un réseau lent : l'écriture ABOUTIT sur le serveur, mais la réponse n'arrive
 * qu'après le délai de 20 s de src/cloud/firebase.js (ou la connexion tombe juste après l'envoi) : put échoue.
 */
function lostAnswers(remote, times = 1) {
  let n = times;
  return {
    ...remote,
    put: async (p, o) => {
      const w = await remote.put(p, o);
      if (n-- > 0) throw Object.assign(new Error('timeout'), { code: 'unavailable' });
      return w;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('1. écriture qui aboutit sur le serveur mais dont la réponse se perd', () => {
  async function twoDevices() {
    vi.useFakeTimers();
    const remote = memoryRemote();
    const tablet = device(remote, { profiles: [prof('L', 'Léa', 8 * H, { money: 100 })] });
    const phone = device(remote);
    tablet.claim(['L']);
    await tablet.sync(8 * H);
    await phone.sync(8 * H);
    tablet.play('L', 111, 14 * H); // la tablette joue et envoie (rev 2)
    await tablet.sync(14 * H);
    phone.play('L', 222, 15 * H); // le téléphone joue sans réseau (plus récent)
    return { remote, tablet, phone };
  }

  it('conflit où la version d\'ici gagne : la copie de la version en ligne remplacée est GARDÉE (au pire un doublon)', async () => {
    const { remote, tablet, phone } = await twoDevices();
    const r = await phone.sync(16 * H, { remote: lostAnswers(remote) }); // réseau très lent
    expect(r.errors.map((e) => e.code)).toEqual(['unavailable']);
    expect(remoteMoney(remote, 'L')).toBe(222); // l'écriture a bien eu lieu
    expect(r.backups).toEqual(['Léa (secours)']); // la session de la tablette (111) est gardée sur le téléphone
    await tablet.sync(17 * H); // pas changée depuis son envoi : elle prend 222
    await phone.sync(18 * H);
    await tablet.sync(19 * H);
    const all = everywhere([tablet, phone], [remote]);
    expect(all).toContain(111);
    expect(all).toContain(222);
    expect(backups(phone.store).length).toBe(1);
  });

  it('écriture qui n\'a PAS eu lieu (réponse perdue avant le serveur) : copie gardée, puis réutilisée (pas de doublon qui s\'empile)', async () => {
    const { remote, tablet, phone } = await twoDevices();
    const neverArrives = { ...remote, put: async () => { throw Object.assign(new Error('timeout'), { code: 'unavailable' }); } };
    for (let i = 0; i < 3; i++) await phone.sync(16 * H + i, { remote: neverArrives });
    expect(remoteMoney(remote, 'L')).toBe(111);
    expect(backups(phone.store).length).toBe(1); // une seule copie de 111, malgré trois essais
    const r = await phone.sync(17 * H); // le réseau revient
    expect(r.uploaded).toBe(1);
    expect(r.backups).toEqual([]); // copie déjà faite (et déjà annoncée)
    expect(backups(phone.store).length).toBe(1);
    await tablet.sync(18 * H);
    const all = everywhere([tablet, phone], [remote]);
    expect(all).toContain(111);
    expect(all).toContain(222);
  });

  it('écriture refusée à coup sûr (un autre appareil a écrit entre-temps) : la copie faite pour rien est retirée', async () => {
    const { remote, phone } = await twoDevices();
    const refused = { ...remote, put: async () => { throw Object.assign(new Error('conflict'), { code: 'conflict' }); } };
    const r = await phone.sync(16 * H, { remote: refused });
    expect(r.errors.map((e) => e.code)).toEqual(['conflict']);
    expect(r.backups).toEqual([]);
    expect(backups(phone.store).length).toBe(0);
  });

  it('partie ouverte dont l\'envoi a abouti sans réponse : la synchro suivante reconnaît sa propre version (pas de fausse alerte)', async () => {
    vi.useFakeTimers();
    const remote = memoryRemote();
    const tablet = device(remote, { profiles: [prof('L', 'Léa', H, { money: 1 })] });
    tablet.claim(['L']);
    await tablet.sync(H);
    tablet.open = ['L']; // on joue
    tablet.play('L', 2, 2 * H);
    const r1 = await tablet.sync(2 * H, { remote: lostAnswers(remote) });
    expect(r1.errors.map((e) => e.code)).toEqual(['unavailable']);
    expect(remoteMoney(remote, 'L')).toBe(2);
    const r2 = await tablet.sync(3 * H); // minuterie, partie toujours ouverte et pas resauvegardée
    expect(r2.heldIds).toEqual([]);
    expect(tablet.meta.base.L.rev).toBe(remote.data.get('L').rev);
    // Et la vraie alerte reste : jouée ailleurs pendant qu'on joue ici.
    const phone = device(remote);
    await phone.sync(4 * H);
    phone.play('L', 3, 5 * H);
    await phone.sync(5 * H);
    expect((await tablet.sync(6 * H)).heldIds).toEqual(['L']);
  });

  it('surelyNotWritten : seules les erreurs où rien n\'a pu être écrit', () => {
    for (const code of ['conflict', 'too-big', 'permission-denied', 'invalid-argument', 'unauthenticated']) expect(surelyNotWritten({ code })).toBe(true);
    for (const code of ['unavailable', 'deadline-exceeded', 'internal', 'unknown', 'cancelled', undefined]) expect(surelyNotWritten({ code })).toBe(false);
  });
});

describe('2. la même partie ouverte dans deux onglets (deux fenêtres côte à côte)', () => {
  /** Faux localStorage avec un quota, comme les navigateurs (remplacer une clé ne coûte que la différence). */
  function quotaStorage() {
    const m = new Map();
    const size = () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0);
    const s = {
      quota: Infinity,
      used: size,
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => {
        const before = m.has(k) ? k.length + m.get(k).length : 0;
        if (size() - before + k.length + String(v).length > s.quota) throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' });
        m.set(k, String(v));
      },
      removeItem: (k) => m.delete(k),
      key: (i) => [...m.keys()][i] ?? null,
      get length() { return m.size; },
    };
    return s;
  }

  it('80 sauvegardes en alternance (10 minutes) : au plus une copie par onglet, et aucune sauvegarde refusée', () => {
    vi.useFakeTimers();
    const ls = quotaStorage();
    vi.stubGlobal('localStorage', ls);
    const store = deviceStore();
    const base = prof('L', 'Léa', 1000, { money: 100, stats: { pad: 'x'.repeat(20000) } }); // partie d'environ 25 ko
    store.save(base, { touch: false });
    ls.quota = ls.used() + 30 * JSON.stringify(base).length; // encore la place d'une trentaine de parties
    // Deux onglets jouent la même partie et sauvegardent tour à tour, chacun comme Game.save (reuse : sa copie).
    const tabs = [0, 1].map(() => ({ p: store.load('L'), lastAt: 1000, lastKey: null, copy: null }));
    let failed = 0;
    let t = 2000;
    for (let i = 0; i < 80; i++) {
      const tab = tabs[i % 2];
      vi.setSystemTime((t += 7500));
      tab.p.clock = (tab.p.clock ?? 0) + 1;
      const r = saveGuarded(store, tab.p, { lastAt: tab.lastAt, lastKey: tab.lastKey, backupName, reuse: tab.copy });
      if (!r.ok) failed++;
      else Object.assign(tab, { lastAt: r.at, lastKey: r.key });
      if (r.backup) tab.copy = r.backup.id;
    }
    expect(failed).toBe(0);
    expect(backups(store).length).toBeLessThanOrEqual(2);
    // Rien n'est perdu : la dernière version de chaque onglet est sur l'appareil (partie ou copie).
    const clocks = store.list().map((e) => store.load(e.id).clock);
    expect(clocks).toContain(tabs[0].p.clock);
    expect(clocks).toContain(tabs[1].p.clock);
  });
});

describe('3. restauration d\'un fichier exporté au moment du dernier accord', () => {
  it('la version restaurée n\'est pas défaite par la synchro suivante (l\'autre version est gardée aussi)', async () => {
    vi.useFakeTimers();
    const remote = memoryRemote();
    const tablet = device(remote, { profiles: [prof('L', 'Léa', 10 * H, { money: 500 })] });
    tablet.claim(['L']);
    await tablet.sync(10 * H);
    const file = tablet.store.load('L'); // 💾 export fait sur la tablette (même version que l'accord)
    const phone = device(remote);
    await phone.sync(11 * H);
    phone.play('L', 0, 12 * H); // sur le téléphone, le frère vend tous les animaux
    await phone.sync(12 * H);
    vi.setSystemTime(13 * H);
    expect(restoreReplace(tablet.store, 'L', file, { backupName }).ok).toBe(true); // un parent restaure
    const r = await tablet.sync(13 * H);
    expect(tablet.store.load('L').money).toBe(500);
    expect(r.downloaded).toBe(0);
    expect(remoteMoney(remote, 'L')).toBe(500); // la restauration voulue est envoyée
    await phone.sync(14 * H);
    expect(phone.store.load('L').money).toBe(500);
    expect(everywhere([tablet, phone], [remote])).toContain(0); // et la version du téléphone existe encore
  });

  it('même horloge que le fichier (appareil en retard) : la restauration a quand même une date différente de l\'accord', () => {
    vi.useFakeTimers();
    vi.setSystemTime(5);
    const store = memoryStore([prof('L', 'Léa', 100, { money: 1 })]);
    const r = restoreReplace(store, 'L', prof('L', 'Léa', 100, { money: 2 }), { backupName });
    expect(r.profile.updatedAt).toBeGreaterThan(100);
  });
});

describe('4. pendant la mise à jour : un appareil resté sur la v1', () => {
  it('une pierre tombale v2 ne fait rien effacer à la v1 (sa partie jouée, que les règles l\'empêchent d\'envoyer, reste)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10);
    const remote = memoryRemote(); // mêmes règles que firestore.rules v2 : rev et gen vérifiés
    const tablet = memoryStore([prof('L', 'Léa', 10, { money: 100 })]);
    remote.data.set('L', { id: 'L', data: JSON.stringify(tablet.load('L')), updatedAt: 10, name: 'Léa' }); // document v1
    let mTab = { owners: { L: LEA }, synced: { L: 10 }, deleted: {} }; // mémoire v1
    // Le téléphone passe en v2 : la question, L dans le compte, accord noté.
    const phone = memoryStore();
    let mPh = (await runSync({ store: phone, remote, uid: LEA, meta: claimParties({}, LEA, [], []) })).meta;
    expect(phone.load('L').money).toBe(100);
    // La tablette reste en v1 (appli de l'écran d'accueil pas rechargée) : l'enfant joue ; l'envoi v1 est refusé.
    vi.setSystemTime(1000);
    const p = tablet.load('L');
    p.money = 5000;
    tablet.save(p);
    const r1 = await v1.runSync({ store: tablet, remote, uid: LEA, meta: mTab });
    mTab = r1.meta;
    expect(r1.report.errors.length).toBe(1);
    // Sur le téléphone (v2), un parent efface la partie.
    vi.setSystemTime(2000);
    phone.remove('L');
    mPh = noteDeleted(mPh, LEA, 'L');
    await runSync({ store: phone, remote, uid: LEA, meta: mPh });
    expect(remote.data.get('L')).toMatchObject({ gone: true, data: '' });
    expect(remote.data.get('L').deleted).toBeUndefined(); // le champ que la v1 lit comme « effacée »
    // La tablette v1 se synchronise (minuterie) : elle n'efface rien.
    vi.setSystemTime(3000);
    const r2 = await v1.runSync({ store: tablet, remote, uid: LEA, meta: mTab });
    expect(r2.report.removed).toBe(0);
    expect(tablet.load('L')?.money).toBe(5000);
    // Une fois passée en v2 (mémoire v1 remise à zéro, question reposée) : jouée ici, elle revient en ligne.
    const r3 = await runSync({ store: tablet, remote, uid: LEA, meta: claimParties({}, LEA, ['L'], ['L']) });
    expect(r3.report.uploaded).toBe(1);
    expect(remoteMoney(remote, 'L')).toBe(5000);
  });

  it('les documents v2 ordinaires ne font rien perdre non plus à la v1 (version d\'ici gardée en copie avant un remplacement)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10);
    const remote = memoryRemote();
    const tablet = memoryStore([prof('L', 'Léa', 10, { money: 100 })]);
    const phone = memoryStore([prof('L', 'Léa', 10, { money: 100 })]);
    const mPh = (await runSync({ store: phone, remote, uid: LEA, meta: claimParties({}, LEA, ['L'], ['L']) })).meta;
    const mTab = { owners: { L: LEA }, synced: { L: 10 }, deleted: {} };
    vi.setSystemTime(500);
    const t = tablet.load('L');
    t.money = 300; // jouée sur la tablette v1
    tablet.save(t);
    vi.setSystemTime(800);
    const q = phone.load('L');
    q.money = 700; // et sur le téléphone v2 (plus tard)
    phone.save(q);
    await runSync({ store: phone, remote, uid: LEA, meta: mPh });
    expect(remoteMoney(remote, 'L')).toBe(700);
    vi.setSystemTime(900);
    await v1.runSync({ store: tablet, remote, uid: LEA, meta: mTab });
    const all = tablet.list().map((e) => tablet.load(e.id).money);
    expect(all).toContain(300);
    expect(all).toContain(700);
  });
});

describe('5. « Effacer mes parties en ligne » puis remise dans le compte (la rev repart à 1)', () => {
  it('l\'autre appareil (base en rev 1) voit que le document a changé : aucune version écrasée, les deux gardées', async () => {
    const remote = memoryRemote();
    const p0 = { ...createProfile('Léa', 'manage'), id: 'L1', updatedAt: 1000, money: 0 };
    // Tablette T : la partie part dans le compte (rev 1) ; téléphone P : la récupère.
    const T = memoryStore([p0]);
    let mT = (await runSync({ store: T, remote, uid: LEA, meta: claimParties({}, LEA, ['L1'], ['L1']) })).meta;
    const P = memoryStore();
    let mP = (await runSync({ store: P, remote, uid: LEA, meta: {} })).meta;
    expect([mT.base.L1.rev, mP.base.L1.rev]).toEqual([1, 1]);
    // P : « Effacer mes parties en ligne » (eraseCloud : removeAll + unlinkAccount), joue (50), puis « Mettre dans mon compte ».
    await remote.removeAll();
    mP = unlinkAccount(mP, LEA);
    const p = P.load('L1');
    p.money = 50;
    P.save(p);
    mP = linkParty(mP, LEA, 'L1');
    const rP = await runSync({ store: P, remote, uid: LEA, meta: mP, backupName });
    mP = rP.meta;
    expect(rP.report.uploaded).toBe(1);
    expect(remote.data.get('L1').rev).toBe(1); // même numéro que la base de T…
    expect(remote.data.get('L1').gen).not.toBe(mT.base.L1.gen); // … mais pas le même document
    // T, restée hors ligne, a joué aussi (70), puis se synchronise ; P aussi.
    const t = T.load('L1');
    t.money = 70;
    T.save(t);
    const rT = await runSync({ store: T, remote, uid: LEA, meta: mT, backupName });
    mT = rT.meta;
    expect(rT.report.backups.length).toBe(1); // conflit : les deux versions gardées
    await runSync({ store: P, remote, uid: LEA, meta: mP, backupName });
    const all = [...T.list().map((e) => T.load(e.id).money), ...P.list().map((e) => P.load(e.id).money), remoteMoney(remote, 'L1')];
    expect(all).toContain(50);
    expect(all).toContain(70);
  });

  it('même chose quand T n\'a pas joué : elle récupère simplement la nouvelle version (rien d\'écrasé en ligne)', async () => {
    const remote = memoryRemote();
    const T = memoryStore([{ ...createProfile('Léa', 'manage'), id: 'L1', updatedAt: 1000, money: 0 }]);
    const mT = (await runSync({ store: T, remote, uid: LEA, meta: claimParties({}, LEA, ['L1'], ['L1']) })).meta;
    await remote.removeAll();
    const P = memoryStore([{ ...createProfile('Léa', 'manage'), id: 'L1', updatedAt: 2000, money: 50 }]);
    await runSync({ store: P, remote, uid: LEA, meta: linkParty({}, LEA, 'L1') });
    const r = await runSync({ store: T, remote, uid: LEA, meta: mT });
    expect(r.report).toMatchObject({ uploaded: 0, downloaded: 1 });
    expect(T.load('L1').money).toBe(50);
    expect(remoteMoney(remote, 'L1')).toBe(50);
  });
});
