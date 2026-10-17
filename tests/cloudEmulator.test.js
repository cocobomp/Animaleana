// La synchro v2 de bout en bout avec le VRAI code (src/cloud/firebase.js → remoteStore, src/cloud/sync.js),
// le vrai SDK Firestore et l'émulateur (vraies règles de firestore.rules) : rev + 1, course entre deux
// appareils refusée par la transaction puis résolue en gardant les deux versions, effacements.
// Sauté sans émulateur (voir tests/firestoreRules.test.js pour le lancer).
import { describe, it, expect, vi, beforeAll } from 'vitest';

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const UID = `emu-${Date.now().toString(36)}`;

vi.mock('firebase/firestore', async (orig) => {
  const m = await orig();
  // Seul changement : le jeton d'émulateur (request.auth.uid = UID), pour passer les vraies règles.
  return { ...m, connectFirestoreEmulator: (db, host, port) => m.connectFirestoreEmulator(db, host, port, { mockUserToken: { sub: UID, user_id: UID } }) };
});

describe.skipIf(!HOST)('synchro v2 avec Firestore (émulateur)', () => {
  let remoteStore;
  let runSync;
  let memoryStore;
  let createProfile;
  let claimParties;
  let noteDeleted;
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
    ({ claimParties, noteDeleted } = await import('../src/sim/cloudSync.js'));
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
    expect((await remote.list()).find((d) => d.id === 'D1')).toMatchObject({ deleted: true, rev: 2, data: '' });
    expect(await remote.removeAll()).toBeGreaterThan(0);
    expect(await remote.list()).toEqual([]);
  });
});
