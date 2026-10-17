// Les scénarios de perte confirmés par la relecture de la synchro v1, rejoués sur la v2 : à chaque fois,
// aucune partie n'est perdue ni écrasée en silence (chaque session jouée existe encore quelque part : sur un
// appareil, en copie de secours, ou en ligne). Appareils = stockages en mémoire avec leur propre horloge ;
// compte en ligne = memoryRemote (mêmes règles de rev que firestore.rules).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { runSync, memoryRemote } from '../src/cloud/sync.js';
import { memoryStore, restoreAsNew, restoreReplace, saveGuarded } from '../src/sim/saveStore.js';
import { createProfile } from '../src/sim/profile.js';
import { claimParties, linkParty, noteDeleted, DEVICE } from '../src/sim/cloudSync.js';

const LEA = 'uid-lea';
const TOM = 'uid-tom';
const H = 3600e3;
const prof = (id, name, updatedAt, extra = {}) => ({ ...createProfile(name, 'sandbox'), id, updatedAt, ...extra });
const backupName = (p) => `${p.name} (secours)`;
const remoteMoney = (remote, id) => (remote.data.get(id)?.data ? JSON.parse(remote.data.get(id).data).money : undefined);

/** Un appareil : son stockage, sa mémoire de synchro, son décalage d'horloge. */
function device(remote, { uid = LEA, profiles = [], skew = 0, meta = {} } = {}) {
  const d = {
    store: memoryStore(profiles),
    meta,
    uid,
    remote,
    skew,
    open: [],
    /** Heure de cet appareil (vraie heure + décalage). */
    at(real) {
      vi.setSystemTime(real + d.skew);
    },
    async sync(real, opts = {}) {
      if (real !== undefined) d.at(real);
      const r = await runSync({ store: d.store, remote: opts.remote ?? d.remote, uid: opts.uid ?? d.uid, meta: d.meta, busy: () => d.open, backupName, ...opts });
      d.meta = r.meta;
      return r.report;
    },
    /** Jouer : changer la partie et la sauvegarder (touch : updatedAt = heure de l'appareil, comme Game.save). */
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
  const out = new Set();
  for (const d of devices) for (const e of d.store.list()) out.add(d.store.load(e.id).money);
  for (const r of remotes) for (const doc of r.data.values()) if (doc.data) out.add(JSON.parse(doc.data).money);
  return out;
}

afterEach(() => vi.useRealTimers());

describe('1. tablette puis téléphone hors ligne', () => {
  it('la session de la tablette (14 h) et celle du téléphone (15 h, hors ligne) sont gardées toutes les deux', async () => {
    vi.useFakeTimers();
    const remote = memoryRemote();
    const tablet = device(remote, { profiles: [prof('L', 'Léa', 8 * H, { money: 100 })] });
    const phone = device(remote);
    tablet.claim(['L']);
    await tablet.sync(8 * H);
    await phone.sync(8 * H);
    expect(phone.store.load('L').money).toBe(100);

    tablet.play('L', 111, 14 * H);
    await tablet.sync(14 * H);
    expect(remoteMoney(remote, 'L')).toBe(111);

    phone.play('L', 222, 15 * H); // dans la voiture, sans réseau
    const r = await phone.sync(16 * H); // le réseau revient
    expect(r.backups).toEqual(['Léa (secours)']); // la version de 14 h est gardée sur le téléphone
    expect(remoteMoney(remote, 'L')).toBe(222);

    const r2 = await tablet.sync(17 * H);
    expect(r2.downloaded).toBe(1);
    expect(tablet.store.load('L').money).toBe(222);
    const all = everywhere([tablet, phone], [remote]);
    expect(all.has(111)).toBe(true);
    expect(all.has(222)).toBe(true);
  });
});

describe('2. horloges décalées (dans les deux sens)', () => {
  const T = 100 * H;

  it('appareil en retard : la session jouée ici est envoyée, jamais écrasée', async () => {
    vi.useFakeTimers();
    const remote = memoryRemote();
    const pc = device(remote, { profiles: [prof('L', 'Léa', T + H, { money: 100 })], skew: H }); // 1 h d'avance
    pc.claim(['L']);
    await pc.sync(T);
    const tab = device(remote); // à l'heure
    await tab.sync(T);
    tab.play('L', 555, T + 10 * 60e3); // updatedAt = T + 10 min < T + 1 h (date reçue)
    const r = await tab.sync(T + 11 * 60e3); // retour au menu
    expect(r).toMatchObject({ uploaded: 1, downloaded: 0, backups: [] });
    expect(tab.store.load('L').money).toBe(555);
    await pc.sync(T + 20 * 60e3);
    expect(pc.store.load('L').money).toBe(555);
  });

  it('batterie vide (horloge revenue en 2000) : pareil', async () => {
    vi.useFakeTimers();
    const remote = memoryRemote();
    const pc = device(remote, { profiles: [prof('L', 'Léa', T, { money: 100 })] });
    pc.claim(['L']);
    await pc.sync(T);
    const tab = device(remote, { skew: Date.UTC(2000, 0, 1) - T });
    await tab.sync(T);
    tab.play('L', 600, T + 60e3);
    const r = await tab.sync(T + 2 * 60e3);
    expect(r.uploaded).toBe(1);
    expect(remoteMoney(remote, 'L')).toBe(600);
  });

  it('appareil en avance : la partie jouée sur l\'appareil à l\'heure n\'est pas remplacée', async () => {
    vi.useFakeTimers();
    const remote = memoryRemote();
    const tab = device(remote, { profiles: [prof('L', 'Léa', T + 10 * 60e3, { money: 100 })], skew: 10 * 60e3 });
    tab.claim(['L']);
    await tab.sync(T);
    const phone = device(remote);
    await phone.sync(T + 60e3);
    phone.play('L', 700, T + 8 * 60e3);
    const r = await phone.sync(T + 9 * 60e3);
    expect(r).toMatchObject({ uploaded: 1, downloaded: 0 });
    expect(remoteMoney(remote, 'L')).toBe(700);
  });

  it('vrai conflit avec une horloge en avance : les deux versions sont gardées', async () => {
    vi.useFakeTimers();
    const remote = memoryRemote();
    const tab = device(remote, { profiles: [prof('L', 'Léa', T, { money: 100 })], skew: 10 * 60e3 });
    tab.claim(['L']);
    await tab.sync(T);
    const phone = device(remote);
    await phone.sync(T);
    tab.play('L', 300, T + 60e3);
    await tab.sync(T + 2 * 60e3);
    phone.play('L', 900, T + 5 * 60e3);
    await phone.sync(T + 6 * 60e3);
    await tab.sync(T + 7 * 60e3);
    const all = everywhere([tab, phone], [remote]);
    expect(all.has(300)).toBe(true);
    expect(all.has(900)).toBe(true);
  });

  it('effacée ailleurs, mais jouée ici après (horloge en retard) : elle revient au lieu d\'être effacée', async () => {
    vi.useFakeTimers();
    const remote = memoryRemote();
    const pc = device(remote, { profiles: [prof('L', 'Léa', T + H, { money: 100 })], skew: H });
    pc.claim(['L']);
    await pc.sync(T);
    const tab = device(remote);
    await tab.sync(T);
    // L'ordinateur efface la partie (son propriétaire est connecté) : pierre tombale.
    pc.store.remove('L');
    pc.meta = noteDeleted(pc.meta, LEA, 'L');
    await pc.sync(T + 2 * 60e3);
    expect(remote.data.get('L').deleted).toBe(true);
    tab.play('L', 777, T + 30 * 60e3);
    const r = await tab.sync(T + 31 * 60e3);
    expect(r.removed).toBe(0);
    expect(tab.store.load('L').money).toBe(777);
    expect(remoteMoney(remote, 'L')).toBe(777);
    // Et l'ordinateur la récupère : rien n'est perdu.
    await pc.sync(T + 40 * 60e3);
    expect(pc.store.load('L').money).toBe(777);
  });
});

describe('3. partie ouverte (même appareil : un autre onglet)', () => {
  it('l\'onglet du menu ne remplace pas la partie ouverte dans l\'autre onglet ; au retour au menu, les deux sont gardées', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const remote = memoryRemote([{ id: 'L', data: JSON.stringify(prof('L', 'Léa', 20, { money: 999 })), updatedAt: 20, rev: 2, name: 'Léa' }]);
    const shared = device(remote, { profiles: [prof('L', 'Léa', 10, { money: 100 })], meta: { v: 2, owners: { L: LEA }, base: { L: { rev: 1, localAt: 10 } }, deleted: {} } });
    const tab1 = { game: shared.store.load('L'), at: 10, key: null }; // onglet 1 : partie ouverte
    shared.open = ['L']; // registre partagé : ouverte dans l'onglet 1
    const r1 = await shared.sync(2000); // onglet 2 (écran des profils)
    expect(r1.downloaded).toBe(0);
    expect(r1.heldIds).toEqual(['L']);
    vi.setSystemTime(20000);
    tab1.game.money = 101;
    const s = saveGuarded(shared.store, tab1.game, { lastAt: tab1.at, lastKey: tab1.key, backupName });
    expect(s.ok).toBe(true);
    expect(remoteMoney(remote, 'L')).toBe(999); // rien n'est envoyé par-dessus
    shared.open = []; // onglet 1 revient au menu
    const r2 = await shared.sync(30000);
    expect(r2.backups.length).toBe(1);
    const all = everywhere([shared], [remote]);
    expect(all.has(999)).toBe(true);
    expect(all.has(101)).toBe(true);
  });

  it('onglet gelé (battement trop vieux) : remplacée dans l\'autre onglet, mais la sauvegarde de l\'onglet gelé garde la version reçue en copie', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const remote = memoryRemote([{ id: 'L', data: JSON.stringify(prof('L', 'Léa', 20, { money: 999 })), updatedAt: 20, rev: 2, name: 'Léa' }]);
    const shared = device(remote, { profiles: [prof('L', 'Léa', 10, { money: 100 })], meta: { v: 2, owners: { L: LEA }, base: { L: { rev: 1, localAt: 10 } }, deleted: {} } });
    const game = shared.store.load('L');
    const r1 = await shared.sync(2000); // l'onglet 1 est gelé : pas compté comme ouvert
    expect(r1.downloaded).toBe(1);
    game.money = 105; // il se réveille et sauvegarde sa version en mémoire
    const s = saveGuarded(shared.store, game, { lastAt: 10, backupName });
    expect(s.backup).toBeTruthy();
    await shared.sync(30000);
    const all = everywhere([shared], [remote]);
    expect(all.has(999)).toBe(true);
    expect(all.has(105)).toBe(true);
  });
});

describe('4. la même partie jouée en même temps sur deux appareils', () => {
  it('chacun garde sa session : rien n\'est envoyé par-dessus l\'autre, et au retour au menu les deux sont gardées', async () => {
    vi.useFakeTimers();
    const remote = memoryRemote();
    const a = device(remote, { profiles: [prof('L', 'Léa', 1000, { money: 0 })] });
    a.claim(['L']);
    await a.sync(1000);
    const b = device(remote);
    await b.sync(1000);
    a.open = ['L'];
    b.open = ['L'];
    a.play('L', 1000, 2000);
    b.play('L', 2000, 2100);
    expect((await a.sync(5 * 60e3)).uploaded).toBe(1); // minuterie de A
    const rb = await b.sync(5 * 60e3 + 1); // minuterie de B
    expect(rb.uploaded).toBe(0);
    expect(rb.heldIds).toEqual(['L']); // « jouée sur un autre appareil »
    a.play('L', 1500, 6 * 60e3);
    await a.sync(10 * 60e3);
    b.play('L', 2500, 9 * 60e3);
    b.open = [];
    await b.sync(11 * 60e3); // B revient au menu : conflit, les deux gardées
    a.open = [];
    await a.sync(12 * 60e3);
    const all = everywhere([a, b], [remote]);
    expect(all.has(1500)).toBe(true);
    expect(all.has(2500)).toBe(true);
  });

  it('iPad laissé ouvert : sa vieille partie n\'écrase pas l\'heure de jeu faite sur l\'ordinateur', async () => {
    vi.useFakeTimers();
    const remote = memoryRemote();
    const ipad = device(remote, { profiles: [prof('L', 'Léa', 8 * H, { money: 100 })] });
    ipad.claim(['L']);
    await ipad.sync(8 * H);
    ipad.open = ['L']; // jamais « Quitter »
    const pc = device(remote);
    await pc.sync(14 * H);
    pc.play('L', 900, 15 * H);
    await pc.sync(15 * H);
    ipad.play('L', 120, 19 * H); // réveil : sauvegarde automatique de l'état du matin
    const r = await ipad.sync(19 * H + 5 * 60e3);
    expect(r.uploaded).toBe(0);
    expect(remoteMoney(remote, 'L')).toBe(900);
    ipad.open = [];
    await ipad.sync(20 * H);
    await pc.sync(21 * H);
    const all = everywhere([ipad, pc], [remote]);
    expect(all.has(900)).toBe(true);
    expect(all.has(120)).toBe(true);
  });
});

describe('5. course entre deux appareils (transaction refusée)', () => {
  it('deux envois à partir de la même version : le second est refusé, puis les deux versions sont gardées', async () => {
    vi.useFakeTimers();
    const remote = memoryRemote();
    const a = device(remote, { profiles: [prof('L', 'Léa', 1000, { money: 0 })] });
    a.claim(['L']);
    await a.sync(1000);
    const b = device(remote);
    await b.sync(1000);
    a.play('L', 10, 2000);
    b.play('L', 20, 2100);
    // B lit la liste (rev 1), puis A écrit (rev 2) avant que B n'écrive à son tour.
    let release;
    const gate = new Promise((r) => { release = r; });
    const slowB = { ...remote, put: async (...args) => { await gate; return remote.put(...args); } };
    const rb = runSync({ store: b.store, remote: slowB, uid: LEA, meta: b.meta, backupName });
    await a.sync(2200);
    release();
    const { report, meta } = await rb;
    b.meta = meta;
    expect(report.errors).toEqual([{ id: 'L', code: 'conflict' }]);
    expect(remoteMoney(remote, 'L')).toBe(10); // la version de A n'est pas écrasée
    await b.sync(3000); // nouvelle synchro : conflit, les deux gardées
    const all = everywhere([a, b], [remote]);
    expect(all.has(10)).toBe(true);
    expect(all.has(20)).toBe(true);
  });
});

describe('6. restauration d\'un fichier', () => {
  it('partie effacée en ligne puis restaurée depuis un fichier : elle revient (jamais réeffacée)', async () => {
    vi.useFakeTimers();
    const remote = memoryRemote();
    const tablet = device(remote, { profiles: [prof('L', 'Léa', 10, { money: 321 })] });
    const file = tablet.store.load('L');
    tablet.claim(['L']);
    await tablet.sync(1000);
    tablet.store.remove('L');
    tablet.meta = noteDeleted(tablet.meta, LEA, 'L');
    await tablet.sync(2000);
    expect(remote.data.get('L').deleted).toBe(true);
    expect(restoreAsNew(tablet.store, file).ok).toBe(true);
    tablet.claim(['L']); // « Quelles parties mettre dans ton compte ? »
    const r = await tablet.sync(3000);
    expect(r.removed).toBe(0);
    expect(tablet.store.load('L').money).toBe(321);
    expect(remoteMoney(remote, 'L')).toBe(321);
  });

  it('restaurer une version plus ancienne (annuler une erreur) : la restauration est envoyée, pas défaite', async () => {
    vi.useFakeTimers();
    const remote = memoryRemote();
    const tablet = device(remote, { profiles: [prof('L', 'Léa', 10, { money: 50 })] });
    const file = tablet.store.load('L');
    tablet.claim(['L']);
    await tablet.sync(1000);
    tablet.play('L', 0, 20000); // animal vendu par erreur
    await tablet.sync(21000);
    expect(restoreReplace(tablet.store, 'L', file, { backupName }).ok).toBe(true);
    const r = await tablet.sync(22000);
    expect(r.uploaded).toBe(1);
    expect(tablet.store.load('L').money).toBe(50);
    expect(remoteMoney(remote, 'L')).toBe(50);
  });
});

describe('7. appareil plein', () => {
  it('version en ligne trop grosse pour l\'appareil : rien n\'est remplacé, pas de copie qui s\'empile', async () => {
    const store = memoryStore([prof('L', 'Léa', 20, { money: 111 })], { failOn: (p) => p.money === 999 && !p.backupOf });
    const remote = memoryRemote([{ id: 'L', data: JSON.stringify(prof('L', 'Léa', 30, { money: 999 })), updatedAt: 30, rev: 2, name: 'Léa' }]);
    let meta = { v: 2, owners: { L: LEA }, base: { L: { rev: 1, localAt: 10 } }, deleted: {} };
    for (let i = 0; i < 4; i++) {
      const r = await runSync({ store, remote, uid: LEA, meta, backupName });
      expect(r.report.storageFull).toBe(true);
      meta = r.meta;
    }
    expect(store.list().filter((e) => e.backup).length).toBe(0);
    expect(store.load('L').money).toBe(111);
    expect(remoteMoney(remote, 'L')).toBe(999);
  });

  it('la copie de la version en ligne ne rentre pas : rien n\'est envoyé par-dessus', async () => {
    const store = memoryStore([prof('L', 'Léa', 40, { money: 111 })], { failOn: (p) => Boolean(p.backupOf) });
    const remote = memoryRemote([{ id: 'L', data: JSON.stringify(prof('L', 'Léa', 30, { money: 999 })), updatedAt: 30, rev: 2, name: 'Léa' }]);
    const r = await runSync({ store, remote, uid: LEA, meta: { v: 2, owners: { L: LEA }, base: { L: { rev: 1, localAt: 10 } }, deleted: {} }, backupName });
    expect(r.report).toMatchObject({ uploaded: 0, storageFull: true });
    expect(remoteMoney(remote, 'L')).toBe(999);
    expect(store.load('L').money).toBe(111);
  });
});

describe('8. Firestore injoignable (réseau présent, serveur muet)', () => {
  it('la liste ne peut pas être lue : rien n\'est décidé, l\'effacement noté n\'est pas oublié, rien n\'est envoyé à l\'aveugle', async () => {
    const remote = memoryRemote([{ id: 'X', data: JSON.stringify(prof('X', 'Léa', 20, { money: 999 })), updatedAt: 20, rev: 2, name: 'Léa' }]);
    const tablet = device(remote, {
      profiles: [prof('X', 'Léa', 10, { money: 100 })],
      meta: { v: 2, owners: { X: LEA }, base: { X: { rev: 1, localAt: 10 } }, deleted: { Y: { rev: 3, uid: LEA } } },
    });
    const before = JSON.stringify(tablet.meta);
    const dead = { ...remote, list: async () => { throw Object.assign(new Error('offline'), { code: 'unavailable' }); } };
    await expect(tablet.sync(undefined, { remote: dead })).rejects.toMatchObject({ code: 'unavailable' });
    expect(JSON.stringify(tablet.meta)).toBe(before);
    expect(remoteMoney(remote, 'X')).toBe(999);
    // Le réseau revient : la version récente est récupérée.
    const r = await tablet.sync();
    expect(r.downloaded).toBe(1);
    expect(tablet.store.load('X').money).toBe(999);
  });

  it('écriture qui n\'aboutit pas (délai dépassé) : rien n\'est noté, la synchro suivante recommence sans perte', async () => {
    const remote = memoryRemote();
    const tablet = device(remote, { profiles: [prof('L', 'Léa', 10, { money: 5 })] });
    tablet.claim(['L']);
    const put = remote.put;
    remote.put = async () => { throw Object.assign(new Error('timeout'), { code: 'unavailable' }); };
    const r1 = await tablet.sync();
    expect(r1.errors[0].code).toBe('unavailable');
    expect(tablet.meta.base.L).toBeUndefined();
    remote.put = put;
    const r2 = await tablet.sync();
    expect(r2.uploaded).toBe(1);
  });
});

describe('9. tablette partagée', () => {
  it('seules les parties cochées vont dans le compte ; la ferme du frère reste sur la tablette, même si sa sœur efface ailleurs', async () => {
    vi.useFakeTimers();
    const leaCloud = memoryRemote();
    const tomCloud = memoryRemote();
    const tablet = device(leaCloud, { profiles: [prof('L', 'Léa', 10), prof('T', 'Tom', 10, { money: 4242 })] });
    let r = await tablet.sync(1000);
    expect(r.unowned.sort()).toEqual(['L', 'T']);
    expect(leaCloud.data.size).toBe(0); // rien n'est pris sans demander
    tablet.claim(['L', 'T'], ['L']); // « Décoche celles de tes frères et sœurs »
    await tablet.sync(2000);
    expect([...leaCloud.data.keys()]).toEqual(['L']);
    expect(tablet.meta.owners.T).toBe(DEVICE);
    const phone = device(leaCloud);
    await phone.sync(3000);
    expect(phone.store.load('T')).toBeNull();
    // Tom se connecte avec son propre compte et met sa ferme dans son compte.
    tablet.uid = TOM;
    r = await tablet.sync(4000, { remote: tomCloud, uid: TOM });
    expect(tomCloud.data.size).toBe(0);
    tablet.meta = linkParty(tablet.meta, TOM, 'T'); // « ☁️ Mettre dans mon compte »
    await tablet.sync(5000, { remote: tomCloud, uid: TOM });
    expect(remoteMoney(tomCloud, 'T')).toBe(4242);
    expect(tablet.store.load('T').money).toBe(4242);
  });

  it('une partie créée pendant qu\'on est connecté va dans ce compte', async () => {
    const cloud = memoryRemote();
    const tablet = device(cloud);
    tablet.store.save(prof('N', 'Nouveau', 5), { touch: false });
    tablet.meta = linkParty(tablet.meta, LEA, 'N');
    await tablet.sync();
    expect(cloud.data.has('N')).toBe(true);
  });
});

describe('10. effacement fait sans être connecté', () => {
  it('le frère efface la ferme de Léa pendant qu\'elle est déconnectée : seulement sur la tablette, elle revient à sa connexion', async () => {
    vi.useFakeTimers();
    const remote = memoryRemote();
    const tablet = device(remote, { profiles: [prof('L', 'Léa', 10, { money: 33 })] });
    tablet.claim(['L']);
    await tablet.sync(1000);
    const phone = device(remote);
    await phone.sync(1000);
    // Léa se déconnecte ; en invité, son frère efface « sa » ferme.
    tablet.store.remove('L');
    tablet.meta = noteDeleted(tablet.meta, null, 'L');
    // Léa se reconnecte : rien n'est effacé en ligne ni sur son téléphone, la ferme revient sur la tablette.
    const r = await tablet.sync(5000);
    expect(r.downloaded).toBe(1);
    expect(tablet.store.load('L').money).toBe(33);
    expect(remote.data.get('L').deleted).toBeUndefined();
    const rp = await phone.sync(6000);
    expect(rp.removed).toBe(0);
    expect(phone.store.load('L').money).toBe(33);
  });

  it('… ou par un autre compte connecté : pareil', async () => {
    vi.useFakeTimers();
    const remote = memoryRemote();
    const tablet = device(remote, { profiles: [prof('L', 'Léa', 10, { money: 33 })] });
    tablet.claim(['L']);
    await tablet.sync(1000);
    tablet.store.remove('L');
    tablet.meta = noteDeleted(tablet.meta, TOM, 'L'); // Tom connecté efface la ferme de Léa
    await tablet.sync(2000, { remote: memoryRemote(), uid: TOM });
    expect(remote.data.get('L').deleted).toBeUndefined();
    await tablet.sync(3000);
    expect(tablet.store.load('L').money).toBe(33);
  });

  it('effacée par Léa connectée : effacée partout (son téléphone l\'efface aussi, s\'il n\'y a pas rejoué)', async () => {
    vi.useFakeTimers();
    const remote = memoryRemote();
    const tablet = device(remote, { profiles: [prof('L', 'Léa', 10)] });
    tablet.claim(['L']);
    await tablet.sync(1000);
    const phone = device(remote);
    await phone.sync(1000);
    tablet.store.remove('L');
    tablet.meta = noteDeleted(tablet.meta, LEA, 'L');
    await tablet.sync(2000);
    expect(remote.data.get('L').deleted).toBe(true);
    const r = await phone.sync(3000);
    expect(r.removedNames).toEqual(['Léa']);
    expect(phone.store.load('L')).toBeNull();
  });
});

describe('11. mémoire de la v1', () => {
  it('convertie (remise à zéro) sans rien perdre : la question est reposée, les parties identiques sont reconnues', async () => {
    const p = prof('L', 'Léa', 10, { money: 8 });
    const remote = memoryRemote([{ id: 'L', data: JSON.stringify(p), updatedAt: 10, name: 'Léa' }]); // document v1, sans rev
    const tablet = device(remote, { profiles: [p], meta: { owners: { L: LEA }, synced: { L: 10 }, deleted: {} } });
    let r = await tablet.sync();
    expect(r.unowned).toEqual(['L']);
    tablet.claim(['L']);
    r = await tablet.sync();
    expect(r.backups).toEqual([]);
    expect(tablet.meta.base.L).toEqual({ rev: 0, localAt: 10 });
  });
});
