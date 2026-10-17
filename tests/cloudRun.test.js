import { describe, it, expect } from 'vitest';
import { runSync, memoryRemote } from '../src/cloud/sync.js';
import { memoryStore } from '../src/sim/saveStore.js';
import { createProfile } from '../src/sim/profile.js';

const U = 'uid-lea';
const prof = (id, name, updatedAt, extra = {}) => ({ ...createProfile(name, 'sandbox'), id, updatedAt, ...extra });
const doc = (p) => ({ id: p.id, data: JSON.stringify(p), updatedAt: p.updatedAt, name: p.name });

describe('runSync', () => {
  it('première connexion : tout part en ligne, puis plus rien à faire', async () => {
    const store = memoryStore([prof('a', 'Léa', 10), prof('b', 'Tom', 20)]);
    const remote = memoryRemote();
    const r1 = await runSync({ store, remote, uid: U, meta: {} });
    expect(r1.report.uploaded).toBe(2);
    expect([...remote.data.keys()].sort()).toEqual(['a', 'b']);
    expect(JSON.parse(remote.data.get('a').data).name).toBe('Léa');
    const r2 = await runSync({ store, remote, uid: U, meta: r1.meta });
    expect(r2.report).toMatchObject({ uploaded: 0, downloaded: 0, removed: 0 });
  });

  it('autre appareil : récupère les parties en gardant leur date', async () => {
    const remote = memoryRemote([doc(prof('a', 'Léa', 10))]);
    const store = memoryStore();
    const { report, meta } = await runSync({ store, remote, uid: U, meta: {} });
    expect(report.downloaded).toBe(1);
    expect(store.load('a').name).toBe('Léa');
    expect(store.load('a').updatedAt).toBe(10);
    expect(meta.synced.a).toBe(10);
  });

  it('modifiée des deux côtés : la plus récente gagne, l\'autre devient une copie de secours locale', async () => {
    const store = memoryStore([prof('a', 'Léa', 20, { money: 111 })]);
    const remote = memoryRemote([doc(prof('a', 'Léa', 30, { money: 999 }))]);
    const { report } = await runSync({ store, remote, uid: U, meta: { owners: { a: U }, synced: { a: 10 } }, backupName: (p) => `${p.name} (secours)` });
    expect(report.backups).toEqual(['Léa (secours)']);
    expect(store.load('a').money).toBe(999);
    const backup = store.list().find((e) => e.backup);
    expect(store.load(backup.id).money).toBe(111);
    // La copie de secours ne part pas en ligne.
    const again = await runSync({ store, remote, uid: U, meta: { owners: { a: U }, synced: { a: 30 } } });
    expect(again.report.uploaded).toBe(0);
    expect(remote.data.has(backup.id)).toBe(false);
  });

  it('ne remplace jamais la partie ouverte en ce moment', async () => {
    const store = memoryStore([prof('a', 'Léa', 10)]);
    const remote = memoryRemote([doc(prof('a', 'Léa', 30, { money: 5 }))]);
    const { report } = await runSync({ store, remote, uid: U, meta: { owners: { a: U }, synced: { a: 10 } }, busy: new Set(['a']) });
    expect(report.downloaded).toBe(0);
    expect(store.load('a').updatedAt).toBe(10);
  });

  it('effacée sur un appareil : effacée sur l\'autre', async () => {
    const remote = memoryRemote();
    const phone = memoryStore([prof('a', 'Léa', 10)]);
    const tablet = memoryStore();
    let mPhone = (await runSync({ store: phone, remote, uid: U, meta: {} })).meta;
    let mTablet = (await runSync({ store: tablet, remote, uid: U, meta: {} })).meta;
    expect(tablet.load('a')).toBeTruthy();
    phone.remove('a');
    mPhone = (await runSync({ store: phone, remote, uid: U, meta: mPhone })).meta;
    expect(remote.data.get('a').deleted).toBe(true);
    const r = await runSync({ store: tablet, remote, uid: U, meta: mTablet });
    expect(r.report.removed).toBe(1);
    expect(tablet.load('a')).toBeNull();
    expect(mPhone.owners.a).toBeUndefined();
  });

  it('une erreur réseau n\'efface rien et sera réessayée', async () => {
    const store = memoryStore([prof('a', 'Léa', 10)]);
    const remote = memoryRemote();
    remote.put = async () => { throw Object.assign(new Error('offline'), { code: 'unavailable' }); };
    const { report, meta } = await runSync({ store, remote, uid: U, meta: {} });
    expect(report.errors).toEqual([{ id: 'a', code: 'unavailable' }]);
    expect(meta.synced.a).toBeUndefined();
    expect(store.load('a')).toBeTruthy();
  });

  it('données en ligne abîmées : ignorées, sans casser l\'appareil', async () => {
    const store = memoryStore();
    const remote = memoryRemote([{ id: 'x', data: '{pas du json', updatedAt: 5 }]);
    const { report } = await runSync({ store, remote, uid: U, meta: {} });
    expect(report.errors).toEqual([{ id: 'x', code: 'bad-data' }]);
    expect(store.list()).toEqual([]);
  });
});
