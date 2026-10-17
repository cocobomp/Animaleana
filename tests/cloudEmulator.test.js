// La synchro v2 de bout en bout avec le VRAI code (src/cloud/firebase.js → remoteStore, src/cloud/sync.js),
// le vrai SDK Firestore et l'émulateur (vraies règles de firestore.rules) : rev + 1, course entre deux
// appareils refusée par la transaction puis résolue en gardant les deux versions, effacements, document effacé
// puis recréé (gen), réponse d'une écriture validée qui arrive trop tard.
// Sauté sans émulateur (voir tests/firestoreRules.test.js pour le lancer).
import { describe, it, expect, vi, beforeAll } from 'vitest';

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const UID = `emu-${Date.now().toString(36)}`;
/** Réseau lent simulé : la réponse d'une transaction (déjà validée par le serveur) arrive ms plus tard. */
const sdkDelay = vi.hoisted(() => ({ ms: 0 }));

vi.mock('firebase/firestore', async (orig) => {
  const m = await orig();
  return {
    ...m,
    // Le jeton d'émulateur (request.auth.uid = UID), pour passer les vraies règles.
    connectFirestoreEmulator: (db, host, port) => m.connectFirestoreEmulator(db, host, port, { mockUserToken: { sub: UID, user_id: UID } }),
    runTransaction: (...a) => m.runTransaction(...a).then((v) => new Promise((r) => setTimeout(() => r(v), sdkDelay.ms))),
  };
});

describe.skipIf(!HOST)('synchro v2 avec Firestore (émulateur)', () => {
  let remoteStore;
  let runSync;
  let memoryStore;
  let createProfile;
  let claimParties;
  let noteDeleted;
  let linkParty;
  let unlinkAccount;
  const backupName = (p) => `${p.name} (secours)`;
  const prof = (id, name, updatedAt, extra = {}) => ({ ...createProfile(name, 'sandbox'), id, updatedAt, ...extra });

  beforeAll(async () => {
    const [host, port] = HOST.split(':');
    const m = new Map([['animaleana.cloud.emulator', `${host}:9099:${port}`]]);
    globalThis.localStorage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
    globalThis.document = { documentElement: { lang: 'fr' } };
    ({ remoteStore } = await import('../src/cloud/firebase.js'));
    ({ runSync } = await import('../src/cloud/sync.js'));
    ({ memoryStore } = await import('../src/sim/saveStore.js'));
    ({ createProfile } = await import('../src/sim/profile.js'));
    ({ claimParties, noteDeleted, linkParty, unlinkAccount } = await import('../src/sim/cloudSync.js'));
  });

  it('envoi (rev 1), récupération sur un autre appareil, puis mise à jour (rev 2)', async () => {
    const remote = await remoteStore(UID);
    const tablet = memoryStore([prof('L1', 'Léa', 1000, { money: 5 })]);
    let mT = claimParties({}, UID, ['L1'], ['L1']);
    let r = await runSync({ store: tablet, remote, uid: UID, meta: mT });
    expect(r.report.uploaded).toBe(1);
    mT = r.meta;
    const docs = await remote.list();
    expect(docs.find((d) => d.id === 'L1')).toMatchObject({ rev: 1, name: 'Léa' });
    const phone = memoryStore();
    r = await runSync({ store: phone, remote, uid: UID, meta: {} });
    expect(phone.load('L1').money).toBe(5);
    const q = phone.load('L1');
    q.money = 6;
    phone.save(q);
    r = await runSync({ store: phone, remote, uid: UID, meta: r.meta });
    expect(r.report.uploaded).toBe(1);
    expect((await remote.list()).find((d) => d.id === 'L1').rev).toBe(2);
    r = await runSync({ store: tablet, remote, uid: UID, meta: mT });
    expect(tablet.load('L1').money).toBe(6);
  });

  it('course : deux appareils écrivent à partir de la même version → la transaction refuse la seconde ; ensuite les deux sont gardées', async () => {
    const remote = await remoteStore(UID);
    const a = memoryStore([prof('R1', 'Tom', 1000, { money: 0 })]);
    let mA = (await runSync({ store: a, remote, uid: UID, meta: claimParties({}, UID, ['R1'], ['R1']) })).meta;
    const b = memoryStore();
    let mB = (await runSync({ store: b, remote, uid: UID, meta: {} })).meta;
    const pa = a.load('R1');
    pa.money = 10;
    a.save(pa);
    const pb = b.load('R1');
    pb.money = 20;
    b.save(pb);
    // B a lu la liste (rev 1) ; A écrit avant que B n'écrive.
    const stale = await remote.list();
    mA = (await runSync({ store: a, remote, uid: UID, meta: mA })).meta;
    const rb = await runSync({ store: b, remote: { ...remote, list: async () => stale }, uid: UID, meta: mB });
    expect(rb.report.errors).toEqual([{ id: 'R1', code: 'conflict' }]);
    expect(JSON.parse((await remote.list()).find((d) => d.id === 'R1').data).money).toBe(10);
    mB = rb.meta;
    const r2 = await runSync({ store: b, remote, uid: UID, meta: mB, backupName });
    expect(r2.report.backups.length).toBe(1);
    const values = b.list().map((e) => b.load(e.id)).filter((x) => x.id === 'R1' || x.backupOf === 'R1').map((x) => x.money).sort((x, y) => x - y);
    expect(values).toEqual([10, 20]);
  });

  it('effacée par son propriétaire : pierre tombale (rev + 1) ; « effacer mes parties en ligne » : plus rien', async () => {
    const remote = await remoteStore(UID);
    const s = memoryStore([prof('D1', 'Zoé', 1000)]);
    let m = (await runSync({ store: s, remote, uid: UID, meta: claimParties({}, UID, ['D1'], ['D1']) })).meta;
    s.remove('D1');
    m = noteDeleted(m, UID, 'D1');
    await runSync({ store: s, remote, uid: UID, meta: m });
    const tomb = (await remote.list()).find((d) => d.id === 'D1');
    expect(tomb).toMatchObject({ gone: true, rev: 2, data: '' });
    expect(tomb.deleted).toBeUndefined(); // jamais le champ que la v1 lisait comme « effacée »
    expect(await remote.removeAll()).toBeGreaterThan(0);
    expect(await remote.list()).toEqual([]);
  });

  it('« Effacer mes parties en ligne » puis remise dans le compte (rev 1 de nouveau, autre gen) : rien n\'est écrasé, les deux versions gardées', async () => {
    const remote = await remoteStore(UID);
    const T = memoryStore([prof('A1', 'Léa', 1000, { money: 0 })]);
    let mT = (await runSync({ store: T, remote, uid: UID, meta: claimParties({}, UID, ['A1'], ['A1']) })).meta;
    const P = memoryStore();
    let mP = (await runSync({ store: P, remote, uid: UID, meta: {} })).meta;
    expect([mT.base.A1.rev, mP.base.A1.rev]).toEqual([1, 1]);
    await remote.removeAll();
    mP = unlinkAccount(mP, UID);
    const p = P.load('A1');
    p.money = 50;
    P.save(p);
    mP = linkParty(mP, UID, 'A1');
    mP = (await runSync({ store: P, remote, uid: UID, meta: mP, backupName })).meta;
    const again = (await remote.list()).find((d) => d.id === 'A1');
    expect(again.rev).toBe(1);
    expect(again.gen).not.toBe(mT.base.A1.gen);
    // T a joué hors ligne (70). Même un envoi « à l'aveugle » (rev 1 attendue, ancien gen) serait refusé par la transaction.
    const t = T.load('A1');
    t.money = 70;
    T.save(t);
    await expect(remote.put(t, { expect: 1, gen: mT.base.A1.gen })).rejects.toMatchObject({ code: 'conflict' });
    const rT = await runSync({ store: T, remote, uid: UID, meta: mT, backupName });
    mT = rT.meta;
    expect(rT.report.backups.length).toBe(1);
    await runSync({ store: P, remote, uid: UID, meta: mP, backupName });
    const all = [...T.list().map((e) => T.load(e.id).money), ...P.list().map((e) => P.load(e.id).money)];
    expect(all).toContain(50);
    expect(all).toContain(70);
  });

  it('écriture validée sur le serveur mais réponse trop tardive (délai dépassé) : la copie de la version remplacée est gardée', async () => {
    const remote = await remoteStore(UID);
    const tab = memoryStore([prof('S1', 'Léa', 1000, { money: 100 })]);
    let mTab = (await runSync({ store: tab, remote, uid: UID, meta: claimParties({}, UID, ['S1'], ['S1']) })).meta;
    const phone = memoryStore();
    const mPh = (await runSync({ store: phone, remote, uid: UID, meta: {} })).meta;
    const t = tab.load('S1');
    t.money = 111;
    tab.save(t);
    mTab = (await runSync({ store: tab, remote, uid: UID, meta: mTab })).meta;
    const q = phone.load('S1');
    q.money = 222;
    q.updatedAt = Date.now() + 60000; // jouée hors ligne, plus récente : la version d'ici gagne le conflit
    phone.save(q, { touch: false });
    // Réseau lent : la transaction est validée par le serveur, mais sa réponse arrive après le délai du jeu.
    const slowRemote = await remoteStore(UID, { writeTimeoutMs: 150 });
    sdkDelay.ms = 1500;
    let r;
    try {
      r = await runSync({ store: phone, remote: slowRemote, uid: UID, meta: mPh, backupName });
    } finally {
      sdkDelay.ms = 0;
    }
    expect(r.report.errors.map((e) => e.code)).toEqual(['unavailable']);
    await vi.waitFor(async () => expect(JSON.parse((await remote.list()).find((d) => d.id === 'S1').data).money).toBe(222), { timeout: 10000 });
    expect(phone.list().filter((e) => e.backup).map((e) => phone.load(e.id).money)).toEqual([111]);
    // La tablette prend 222 (pas changée depuis son envoi) : la session de la tablette (111) existe encore sur le téléphone.
    await runSync({ store: tab, remote, uid: UID, meta: mTab });
    expect(tab.load('S1').money).toBe(222);
  });
});
