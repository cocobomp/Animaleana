// Synchro v2, l'application du plan (src/cloud/sync.js) entre un stockage d'appareil et un faux compte en ligne
// qui applique les mêmes règles que Firestore (rev + 1 à chaque écriture, refusée si la rev a changé).
import { describe, it, expect } from 'vitest';
import { runSync, memoryRemote } from '../src/cloud/sync.js';
import { memoryStore, keepBackup, findBackup, saveGuarded } from '../src/sim/saveStore.js';
import { createProfile } from '../src/sim/profile.js';
import { DEVICE } from '../src/sim/cloudSync.js';

const U = 'uid-lea';
const prof = (id, name, updatedAt, extra = {}) => ({ ...createProfile(name, 'sandbox'), id, updatedAt, ...extra });
const doc = (p, rev = 1, gen = 'g1') => ({ id: p.id, data: JSON.stringify(p), updatedAt: p.updatedAt, rev, gen, name: p.name });
const G = expect.any(String); // identité tirée au hasard à la création du document
const mine = (...ids) => ({ v: 2, owners: Object.fromEntries(ids.map((id) => [id, U])), base: {}, deleted: {} });
const based = (ids, base) => ({ ...mine(...ids), base });
const backupName = (p) => `${p.name} (secours)`;
const money = (store) => store.list().map((e) => store.load(e.id).money).sort((a, b) => a - b);

describe('runSync v2', () => {
  it('parties liées au compte : envoyées (rev 1), puis plus rien à faire', async () => {
    const store = memoryStore([prof('a', 'Léa', 10), prof('b', 'Tom', 20)]);
    const remote = memoryRemote();
    const r1 = await runSync({ store, remote, uid: U, meta: mine('a', 'b') });
    expect(r1.report.uploaded).toBe(2);
    expect(remote.data.get('a').rev).toBe(1);
    expect(r1.meta.base.a).toEqual({ rev: 1, gen: G, localAt: 10 });
    expect(r1.meta.base.a.gen).toBe(remote.data.get('a').gen);
    const r2 = await runSync({ store, remote, uid: U, meta: r1.meta });
    expect(r2.report).toMatchObject({ uploaded: 0, downloaded: 0, removed: 0 });
  });

  it('parties sans compte : jamais envoyées d\'elles-mêmes (signalées pour la question)', async () => {
    const store = memoryStore([prof('a', 'Léa', 10)]);
    const remote = memoryRemote();
    const r = await runSync({ store, remote, uid: U, meta: {} });
    expect(remote.data.size).toBe(0);
    expect(r.report.unowned).toEqual(['a']);
  });

  it('autre appareil : récupère les parties en gardant leur date', async () => {
    const remote = memoryRemote([doc(prof('a', 'Léa', 10), 3)]);
    const store = memoryStore();
    const { report, meta } = await runSync({ store, remote, uid: U, meta: {} });
    expect(report.downloaded).toBe(1);
    expect(store.load('a').updatedAt).toBe(10);
    expect(meta.base.a).toEqual({ rev: 3, gen: 'g1', localAt: 10 });
    expect(meta.owners.a).toBe(U);
  });

  it('jamais comparées mais même contenu (fichier, autre adresse du jeu) : accord noté, aucune copie', async () => {
    const p = prof('a', 'Léa', 10, { money: 7 });
    const store = memoryStore([{ ...p, updatedAt: 99 }]);
    const remote = memoryRemote([doc(p, 2)]);
    const r = await runSync({ store, remote, uid: U, meta: mine('a') });
    expect(r.report.backups).toEqual([]);
    expect(r.meta.base.a).toEqual({ rev: 2, gen: 'g1', localAt: 99 });
    expect(store.list().length).toBe(1);
  });

  it('conflit, la version en ligne est la plus récente : elle devient la partie, celle d\'ici est gardée en copie', async () => {
    const store = memoryStore([prof('a', 'Léa', 20, { money: 111 })]);
    const remote = memoryRemote([doc(prof('a', 'Léa', 30, { money: 999 }), 2)]);
    const meta = based(['a'], { a: { rev: 1, gen: 'g1', localAt: 10 } });
    const { report, meta: m } = await runSync({ store, remote, uid: U, meta, backupName });
    expect(report.backups).toEqual(['Léa (secours)']);
    expect(store.load('a').money).toBe(999);
    expect(money(store)).toEqual([111, 999]);
    expect(m.base.a).toEqual({ rev: 2, gen: 'g1', localAt: 30 });
    // La copie de secours ne part jamais en ligne.
    const again = await runSync({ store, remote, uid: U, meta: m });
    expect(again.report.uploaded).toBe(0);
    expect(remote.data.size).toBe(1);
  });

  it('conflit, la version d\'ici est la plus récente : celle en ligne est gardée ici en copie, puis on envoie', async () => {
    const store = memoryStore([prof('a', 'Léa', 40, { money: 111 })]);
    const remote = memoryRemote([doc(prof('a', 'Léa', 30, { money: 999 }), 2)]);
    const meta = based(['a'], { a: { rev: 1, gen: 'g1', localAt: 10 } });
    const { report, meta: m } = await runSync({ store, remote, uid: U, meta, backupName });
    expect(report.uploaded).toBe(1);
    expect(report.backups).toEqual(['Léa (secours)']);
    expect(JSON.parse(remote.data.get('a').data).money).toBe(111);
    expect(remote.data.get('a').rev).toBe(3);
    expect(money(store)).toEqual([111, 999]);
    expect(remote.data.get('a').gen).toBe('g1'); // même document : son identité ne change pas
    expect(m.base.a).toEqual({ rev: 3, gen: 'g1', localAt: 40 });
  });

  it('partie ouverte : jamais remplacée ; changée ailleurs → rien n\'est envoyé, on prévient', async () => {
    const store = memoryStore([prof('a', 'Léa', 50, { money: 1 })]);
    const remote = memoryRemote([doc(prof('a', 'Léa', 30, { money: 5 }), 2)]);
    const meta = based(['a'], { a: { rev: 1, gen: 'g1', localAt: 10 } });
    const { report } = await runSync({ store, remote, uid: U, meta, busy: () => ['a'] });
    expect(report).toMatchObject({ uploaded: 0, downloaded: 0, held: ['Léa'], heldIds: ['a'] });
    expect(store.load('a').money).toBe(1);
    expect(JSON.parse(remote.data.get('a').data).money).toBe(5);
  });

  it('busy relu juste avant d\'écrire : partie ouverte PENDANT la lecture de la liste → pas remplacée', async () => {
    const store = memoryStore([prof('a', 'Léa', 10, { money: 100 })]);
    const remote = memoryRemote([doc(prof('a', 'Léa', 20, { money: 999 }), 2)]);
    const list = remote.list;
    let open = [];
    remote.list = async () => {
      open = ['a']; // l'enfant touche sa partie pendant que la liste arrive
      return list();
    };
    const meta = based(['a'], { a: { rev: 1, gen: 'g1', localAt: 10 } });
    const { report } = await runSync({ store, remote, uid: U, meta, busy: () => open });
    expect(report.downloaded).toBe(0);
    expect(report.heldIds).toEqual(['a']);
    expect(store.load('a').money).toBe(100);
  });

  it('effacée sur un appareil par son propriétaire : effacée sur l\'autre (pas jouée depuis)', async () => {
    const remote = memoryRemote();
    const phone = memoryStore([prof('a', 'Léa', 10)]);
    const tablet = memoryStore();
    let mPhone = (await runSync({ store: phone, remote, uid: U, meta: mine('a') })).meta;
    const mTablet = (await runSync({ store: tablet, remote, uid: U, meta: {} })).meta;
    expect(tablet.load('a')).toBeTruthy();
    phone.remove('a');
    mPhone = { ...mPhone, deleted: { a: { rev: mPhone.base.a.rev, gen: mPhone.base.a.gen, uid: U } }, owners: {}, base: {} };
    mPhone = (await runSync({ store: phone, remote, uid: U, meta: mPhone })).meta;
    // Pierre tombale « gone » (pas « deleted », que les appareils restés en v1 effaçaient sans regarder).
    expect(remote.data.get('a')).toMatchObject({ gone: true, rev: 2, data: '' });
    expect(remote.data.get('a').deleted).toBeUndefined();
    expect(mPhone.deleted).toEqual({});
    const r = await runSync({ store: tablet, remote, uid: U, meta: mTablet });
    expect(r.report.removed).toBe(1);
    expect(r.report.removedNames).toEqual(['Léa']);
    expect(tablet.load('a')).toBeNull();
  });

  it('effacée en ligne (« effacer mes parties en ligne » ailleurs) : gardée ici, déliée, pas renvoyée', async () => {
    const store = memoryStore([prof('a', 'Léa', 10)]);
    const remote = memoryRemote();
    const r1 = await runSync({ store, remote, uid: U, meta: mine('a') });
    await remote.removeAll();
    const r2 = await runSync({ store, remote, uid: U, meta: r1.meta });
    expect(r2.report.unlinked).toEqual(['Léa']);
    expect(r2.meta.owners.a).toBe(DEVICE);
    expect(store.load('a')).toBeTruthy();
    const r3 = await runSync({ store, remote, uid: U, meta: r2.meta });
    expect(r3.report.uploaded).toBe(0);
    expect(remote.data.size).toBe(0);
  });

  it('une erreur réseau à l\'envoi n\'efface rien et sera réessayée', async () => {
    const store = memoryStore([prof('a', 'Léa', 10)]);
    const remote = memoryRemote();
    remote.put = async () => { throw Object.assign(new Error('offline'), { code: 'unavailable' }); };
    const { report, meta } = await runSync({ store, remote, uid: U, meta: mine('a') });
    expect(report.errors).toEqual([{ id: 'a', code: 'unavailable' }]);
    expect(meta.base.a).toBeUndefined();
    expect(store.load('a')).toBeTruthy();
  });

  it('liste en ligne illisible (hors ligne) : la synchro s\'arrête sans rien décider', async () => {
    const store = memoryStore([prof('a', 'Léa', 10)]);
    const remote = memoryRemote();
    remote.list = async () => { throw Object.assign(new Error('offline'), { code: 'unavailable' }); };
    await expect(runSync({ store, remote, uid: U, meta: mine('a') })).rejects.toMatchObject({ code: 'unavailable' });
    expect(store.load('a')).toBeTruthy();
  });

  it('données en ligne abîmées : ignorées, sans casser l\'appareil', async () => {
    const store = memoryStore();
    const remote = memoryRemote([{ id: 'x', data: '{pas du json', updatedAt: 5, rev: 1 }]);
    const { report } = await runSync({ store, remote, uid: U, meta: {} });
    expect(report.errors).toEqual([{ id: 'x', code: 'bad-data' }]);
    expect(store.list()).toEqual([]);
  });

  it('document de la v1 (sans rev) : compté comme rev 0, mis à jour en rev 1', async () => {
    const p = prof('a', 'Léa', 10, { money: 3 });
    const remote = memoryRemote([{ id: 'a', data: JSON.stringify(p), updatedAt: 10, name: 'Léa' }]);
    const store = memoryStore([{ ...p }]);
    const r1 = await runSync({ store, remote, uid: U, meta: mine('a') });
    expect(r1.meta.base.a).toEqual({ rev: 0, gen: null, localAt: 10 }); // même contenu : accord noté
    const q = store.load('a');
    q.money = 4;
    store.save(q);
    const r2 = await runSync({ store, remote, uid: U, meta: r1.meta });
    expect(r2.report.uploaded).toBe(1);
    expect(remote.data.get('a').rev).toBe(1);
    expect(remote.data.get('a').gen).toEqual(G); // il reçoit son identité
    expect(r2.meta.base.a.gen).toBe(remote.data.get('a').gen);
  });
});

describe('copies de secours et sauvegarde protégée', () => {
  it('keepBackup : copie marquée, original intact ; appareil plein → rien ne reste', () => {
    const store = memoryStore([prof('a', 'Léa', 10)]);
    const b = keepBackup(store, store.load('a'), { backupName });
    expect(b.backupOf).toBe('a');
    expect(store.list().find((e) => e.id === b.id).backup).toBe(true);
    const full = memoryStore([prof('a', 'Léa', 10)], { failOn: (p) => Boolean(p.backupOf) });
    expect(keepBackup(full, full.load('a'), { backupName })).toBeNull();
    expect(full.list().length).toBe(1);
  });

  it('saveGuarded : rien de changé → rien d\'écrit ; changée ailleurs → l\'autre version gardée en copie avant d\'écrire', () => {
    const store = memoryStore([prof('a', 'Léa', 10, { money: 1 })]);
    const game = store.load('a');
    const r1 = saveGuarded(store, game, { lastAt: 10 });
    expect(r1.ok).toBe(true);
    const at1 = r1.at;
    const r2 = saveGuarded(store, game, { lastAt: at1, lastKey: r1.key });
    expect(r2.at).toBe(at1); // rien n'a changé : pas réécrite
    // Une synchro (ou un autre onglet) a mis une autre version sur l'appareil.
    store.save({ ...store.load('a'), money: 999, updatedAt: 5 }, { touch: false });
    game.money = 2;
    const r3 = saveGuarded(store, game, { lastAt: at1, lastKey: r2.key, backupName });
    expect(r3.ok).toBe(true);
    expect(r3.backup.name).toBe('Léa (secours)');
    expect(money(store)).toEqual([2, 999]);
  });

  it('keepBackup avec reuse : la copie de cette partie est mise à jour (même id, même nom), pas ajoutée', () => {
    const store = memoryStore([prof('a', 'Léa', 10, { money: 1 })]);
    const b1 = keepBackup(store, store.load('a'), { backupName });
    const b2 = keepBackup(store, { ...store.load('a'), money: 2 }, { backupName, reuse: b1.id });
    expect(b2).toMatchObject({ id: b1.id, name: b1.name, backupOf: 'a' });
    expect(store.list().filter((e) => e.backup).length).toBe(1);
    expect(store.load(b1.id).money).toBe(2);
    // reuse d'une copie qui n'est plus celle de cette partie (jouée depuis, ou effacée) : nouvelle copie.
    expect(keepBackup(store, store.load('a'), { backupName, reuse: 'disparue' }).id).not.toBe(b1.id);
  });

  it('findBackup : retrouve une copie de secours qui a déjà ce contenu (nom et id mis à part)', () => {
    const store = memoryStore([prof('a', 'Léa', 10, { money: 1 })]);
    const other = { ...store.load('a'), money: 5 };
    expect(findBackup(store, other)).toBeNull();
    const b = keepBackup(store, other, { backupName });
    expect(findBackup(store, other)?.id).toBe(b.id);
    expect(findBackup(store, { ...other, money: 6 })).toBeNull();
    expect(findBackup(store, { ...other, id: 'z' })).toBeNull(); // copie d'une autre partie
  });

  it('saveGuarded : copie impossible (appareil plein) → rien n\'est écrasé', () => {
    const store = memoryStore([prof('a', 'Léa', 10, { money: 1 })], { failOn: (p) => Boolean(p.backupOf) });
    const game = store.load('a');
    store.save({ ...store.load('a'), money: 999, updatedAt: 5 }, { touch: false });
    game.money = 2;
    const r = saveGuarded(store, game, { lastAt: 10, backupName });
    expect(r.ok).toBe(false);
    expect(store.load('a').money).toBe(999);
  });
});
