import { describe, it, expect, afterEach } from 'vitest';
import { createProfile, migrate, saveProfile, loadProfile, listProfiles } from '../src/sim/profile.js';
import { createAnimal } from '../src/sim/animal.js';
import { xpForLevel } from '../src/sim/progress.js';
import {
  serializeSave, parseSave, saveFileName, safeFilePart, profileSummary, mergeProfiles, compareProfiles,
  uniqueName, updatedAtOf, sameContent, profileProblem, SAVE_KIND, FILE_FORMAT, MAX_FILE_BYTES, GAME_NAME,
} from '../src/sim/saveFile.js';
import { memoryStore, deviceStore, restoreAsNew, restoreReplace, collectProfiles } from '../src/sim/saveStore.js';

const OCT17 = new Date(2026, 9, 17, 14, 5).getTime(); // 17 octobre 2026, 14 h 05 (heure de l'appareil)

/** Une partie avec des animaux, un peu d'expérience et quelques choses faites. */
function léana() {
  const p = createProfile('Léana', 'manage', 'maison');
  p.xp = xpForLevel(3) + 5;
  p.money = 1234;
  p.animals.push(createAnimal({ species: 'horse', name: 'Caramel' }), createAnimal({ species: 'dog', name: 'Pilou' }), createAnimal({ species: 'horse', name: 'Étoile' }));
  p.stats.care = 12;
  p.updatedAt = OCT17;
  return p;
}

const fakeStorage = () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  return store;
};
afterEach(() => { delete globalThis.localStorage; });

describe('fichier de sauvegarde : aller-retour', () => {
  it('écrire puis relire rend exactement la même partie (animaux compris), avec la version du jeu et la date', () => {
    const p = léana();
    const text = serializeSave([p], { appVersion: '0.4.0', now: OCT17 });
    const file = JSON.parse(text);
    expect(file).toMatchObject({ kind: SAVE_KIND, format: FILE_FORMAT, appVersion: '0.4.0', exportedAt: new Date(OCT17).toISOString() });
    const back = parseSave(text);
    expect(back.ok).toBe(true);
    expect(back.meta).toMatchObject({ format: 1, appVersion: '0.4.0', exportedAt: OCT17, legacy: false });
    expect(back.profiles).toHaveLength(1);
    expect(back.profiles[0]).toEqual(JSON.parse(JSON.stringify(p)));
    expect(back.profiles[0].animals.map((a) => a.name)).toEqual(['Caramel', 'Pilou', 'Étoile']);
  });

  it('plusieurs profils dans un même fichier', () => {
    const a = léana();
    const b = createProfile('Tom');
    const back = parseSave(serializeSave([a, b]));
    expect(back.ok).toBe(true);
    expect(back.profiles.map((p) => p.name)).toEqual(['Léana', 'Tom']);
  });

  it('nom de fichier lisible, sans caractères interdits', () => {
    // Le nouveau nom du jeu (La ferme à Madichelle) ; la marque du fichier garde l'ancien, pour les fichiers déjà faits.
    expect(saveFileName([léana()], { now: OCT17 })).toBe('La ferme à Madichelle - Léana - 2026-10-17.json');
    expect(saveFileName([createProfile('Léa'), createProfile('Tom')], { now: OCT17 })).toBe('La ferme à Madichelle - Léa, Tom - 2026-10-17.json');
    const four = ['A', 'B', 'C', 'D'].map((n) => createProfile(n));
    expect(saveFileName(four, { now: OCT17, manyLabel: (n) => `${n} games` })).toBe('La ferme à Madichelle - 4 games - 2026-10-17.json');
    expect(JSON.parse(serializeSave([léana()])).game).toBe(GAME_NAME);
    expect(SAVE_KIND).toBe('animadichelle-save');
    expect(safeFilePart('Lé*a?"<>|\n')).toBe('Léa');
    expect(safeFilePart('Léana · secours 17/10')).toBe('Léana · secours 17-10');
    expect(safeFilePart('a\\b:c')).toBe('a-b-c');
    expect(safeFilePart('   ')).toBe('Partie');
  });

  it('aperçu : nom, niveau, animaux par espèce, date', () => {
    const s = profileSummary(léana());
    expect(s).toMatchObject({ name: 'Léana', level: 3, animals: 3, updatedAt: OCT17, backup: false });
    expect(s.species).toEqual([{ id: 'horse', n: 2, emoji: expect.any(String) }, { id: 'dog', n: 1, emoji: expect.any(String) }]);
  });
});

describe('fichier abîmé ou étranger : message clair, jamais d\'erreur levée', () => {
  const good = () => serializeSave([léana()]);
  it.each([
    ['vide', '', 'empty'],
    ['coupé au milieu', () => good().slice(0, 200), 'notJson'],
    ['pas du JSON', 'bonjour', 'notJson'],
    ['un autre JSON', '{"hello":"world"}', 'notSave'],
    ['un tableau', '[1,2,3]', 'notSave'],
    ['sans profils', JSON.stringify({ kind: SAVE_KIND, format: 1, profiles: [] }), 'noProfiles'],
    ['profils pas en liste', JSON.stringify({ kind: SAVE_KIND, format: 1, profiles: {} }), 'notSave'],
    ['format inconnu', JSON.stringify({ kind: SAVE_KIND, format: 'x', profiles: [] }), 'notSave'],
    ['trop gros', () => ' '.repeat(MAX_FILE_BYTES + 1) + good(), 'tooBig'],
  ])('%s', (_, text, error) => {
    const r = parseSave(typeof text === 'function' ? text() : text);
    expect(r).toMatchObject({ ok: false, error });
  });

  it('un profil abîmé (animaux pas en liste, espèce inconnue, lieu inconnu, argent qui n\'est pas un nombre)', () => {
    const broken = (patch) => {
      const f = JSON.parse(good());
      patch(f.profiles[0]);
      return parseSave(JSON.stringify(f));
    };
    expect(broken((p) => { p.animals = 'trois'; })).toMatchObject({ ok: false, error: 'badProfile', detail: 'animals' });
    expect(broken((p) => { p.animals[0].species = 'dragon'; })).toMatchObject({ ok: false, error: 'badProfile', detail: 'animals' });
    expect(broken((p) => { p.place = 'lune'; })).toMatchObject({ ok: false, error: 'badProfile', detail: 'place' });
    expect(broken((p) => { p.money = 'beaucoup'; })).toMatchObject({ ok: false, error: 'badProfile', detail: 'money' });
    expect(broken((p) => { p.name = ''; })).toMatchObject({ ok: false, error: 'badProfile', detail: 'name' });
    expect(broken((p) => { p.mode = 'triche'; })).toMatchObject({ ok: false, error: 'badProfile', detail: 'mode' });
  });

  it('les clés dangereuses (__proto__) sont ignorées', () => {
    const text = good().replace('"name":"Léana"', '"name":"Léana","__proto__":{"pollué":true}');
    const r = parseSave(text);
    expect(r.ok).toBe(true);
    expect({}.pollué).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(r.profiles[0], '__proto__')).toBe(false);
  });

  it('fichier d\'une version plus récente du jeu : on demande de mettre le jeu à jour', () => {
    const f = JSON.parse(good());
    expect(parseSave(JSON.stringify({ ...f, format: FILE_FORMAT + 1 }))).toMatchObject({ ok: false, error: 'tooNew' });
    expect(parseSave(JSON.stringify({ ...f, saveVersion: 99 }))).toMatchObject({ ok: false, error: 'tooNew' });
    f.profiles[0].version = 99;
    expect(parseSave(JSON.stringify(f))).toMatchObject({ ok: false, error: 'tooNew' });
  });

  it('version plus récente dont un champ a changé de forme : « mets le jeu à jour », pas « partie abîmée »', () => {
    const f = JSON.parse(good());
    delete f.saveVersion;
    f.profiles[0].version = 99;
    f.profiles[0].stats = 'nouvelle-forme';
    expect(profileProblem(f.profiles[0])).toBe('tooNew');
    expect(parseSave(JSON.stringify(f))).toMatchObject({ ok: false, error: 'tooNew' });
  });

  it('fichier fait avant le nouveau nom du jeu (« game: Animadichelle ») : toujours lisible', () => {
    const f = JSON.parse(good());
    f.game = 'Animadichelle';
    expect(parseSave(JSON.stringify(f)).ok).toBe(true);
  });
});

describe('ancienne version', () => {
  /** Un profil d'avant : ni école véto, ni clients, ni métiers, ni tutoriel, ni sons, ni updatedAt. */
  function oldProfile() {
    const p = JSON.parse(JSON.stringify(léana()));
    for (const k of ['vetSchool', 'clients', 'careers', 'tutorial', 'updatedAt', 'tips', 'coreLayout', 'coreVersion']) delete p[k];
    delete p.settings.sound;
    return p;
  }

  it('un vieux profil dans un fichier est complété par migrate (rien de perdu)', () => {
    const old = oldProfile();
    const text = JSON.stringify({ kind: SAVE_KIND, format: 1, appVersion: '0.1.0', exportedAt: '2026-01-02T10:00:00Z', profiles: [old] });
    const r = parseSave(text);
    expect(r.ok).toBe(true);
    const p = r.profiles[0];
    expect(p.animals.map((a) => a.name)).toEqual(['Caramel', 'Pilou', 'Étoile']);
    expect(p.money).toBe(1234);
    expect(p.vetSchool).toEqual({ done: {}, diploma: null, master: null });
    expect(p.settings.sound).toEqual({ on: true, volume: 0.7 });
    expect(p.tutorial.done).toBe(true); // ancienne partie : pas de tutoriel imposé
    expect(p.updatedAt).toBe(old.createdAt);
  });

  it('un profil seul, sans enveloppe (copie brute de l\'appareil), est accepté aussi', () => {
    const r = parseSave(JSON.stringify(oldProfile()));
    expect(r.ok).toBe(true);
    expect(r.meta.legacy).toBe(true);
    expect(r.profiles[0].name).toBe('Léana');
  });
});

describe('profil sans updatedAt', () => {
  it('migrate : la dernière sauvegarde connue, sinon la date de création', () => {
    const p = createProfile('Zoé');
    delete p.updatedAt;
    p.createdAt = 1000;
    expect(migrate(p).updatedAt).toBe(1000);
    expect(migrate(p, { savedAt: 5000 }).updatedAt).toBe(5000);
    expect(migrate({ ...p, updatedAt: 7000 }, { savedAt: 5000 }).updatedAt).toBe(7000);
    expect(updatedAtOf({})).toBe(0);
  });

  it('sur l\'appareil : une vieille sauvegarde prend la date de la liste des profils ; chaque sauvegarde la met à jour', () => {
    const ls = fakeStorage();
    const p = createProfile('Zoé');
    expect(typeof p.updatedAt).toBe('number');
    saveProfile(p);
    // On fait comme si c'était une sauvegarde d'avant (pas d'updatedAt dans le profil écrit).
    const raw = JSON.parse(ls.get(`animaleana.profile.${p.id}`));
    delete raw.updatedAt;
    ls.set(`animaleana.profile.${p.id}`, JSON.stringify(raw));
    const savedAt = listProfiles()[0].savedAt;
    expect(loadProfile(p.id).updatedAt).toBe(savedAt);
    // touch: false (partie restaurée) garde sa date ; une sauvegarde normale la met à jour.
    const q = { ...loadProfile(p.id), updatedAt: 42 };
    saveProfile(q, { touch: false });
    expect(loadProfile(p.id).updatedAt).toBe(42);
    saveProfile(q);
    expect(loadProfile(p.id).updatedAt).toBeGreaterThan(42);
  });

  it('fusion : celui qui a une date gagne contre celui qui n\'en a pas', () => {
    const p = createProfile('Zoé');
    const noDate = { ...p };
    delete noDate.updatedAt;
    delete noDate.createdAt;
    expect(compareProfiles(p, noDate)).toBe('newer');
    const r = mergeProfiles([noDate], [p]);
    expect(r.changes).toEqual([{ id: p.id, name: 'Zoé', action: 'updated' }]);
    expect(r.profiles[0].updatedAt).toBe(p.updatedAt);
    expect(r.replaced).toEqual([noDate]);
  });
});

describe('fusion par profil (pour la future synchro avec un compte)', () => {
  it('ajoute les nouveaux, prend le plus récent, garde le local plus récent, rend tout ce qui est écarté', () => {
    const a = { ...createProfile('A'), updatedAt: 100 };
    const b = { ...createProfile('B'), updatedAt: 100 };
    const c = { ...createProfile('C'), updatedAt: 100 };
    const d = createProfile('D');
    const r = mergeProfiles([a, b, c], [{ ...a, updatedAt: 200, xp: 99 }, { ...b, updatedAt: 50 }, { ...c }, d]);
    expect(r.changes.map((x) => x.action)).toEqual(['updated', 'kept', 'same', 'added']);
    expect(r.profiles.map((p) => p.name)).toEqual(['A', 'B', 'C', 'D']);
    expect(r.profiles[0].xp).toBe(99);
    expect(r.profiles[1].updatedAt).toBe(100);
    expect(r.replaced.map((p) => [p.name, p.updatedAt])).toEqual([['A', 100], ['B', 50]]);
  });

  it('même date mais pas le même contenu : le local est gardé et l\'autre version est rendue (rien de perdu)', () => {
    const a = { ...createProfile('Léana'), updatedAt: 1000, xp: 10 };
    const incoming = { ...a, xp: 999, animals: [createAnimal({ species: 'horse', name: 'Caramel' })] };
    const r = mergeProfiles([a], [incoming]);
    expect(r.changes).toEqual([{ id: a.id, name: 'Léana', action: 'conflict' }]);
    expect(r.profiles[0].xp).toBe(10);
    expect(r.replaced).toEqual([incoming]);
  });

  it('même contenu : l\'ordre des champs, la date et les marques de copie de secours ne comptent pas', () => {
    const a = léana();
    const reordered = Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(a))).reverse());
    expect(sameContent(a, { ...reordered, updatedAt: 1, backupOf: 'x', backupAt: 2 })).toBe(true);
    expect(sameContent(a, { ...a, money: a.money + 1 })).toBe(false);
    // Aller-retour par un fichier (migrate compris) : la même partie.
    expect(sameContent(a, parseSave(serializeSave([a])).profiles[0])).toBe(true);
  });

  it('prénom déjà pris : « Léana (2) »', () => {
    expect(uniqueName('Léana', ['Tom'])).toBe('Léana');
    expect(uniqueName('Léana', ['léana', 'Léana (2)'])).toBe('Léana (3)');
  });
});

describe('restaurer sur l\'appareil', () => {
  const backupName = (p) => `${p.name} · secours`;

  it('remplacer : l\'ancien profil est d\'abord gardé en copie de secours, puis remplacé', () => {
    const local = léana();
    local.animals.push(createAnimal({ species: 'cat', name: 'Minou' })); // 4 animaux sur cet appareil
    const store = memoryStore([local, createProfile('Tom')]);
    const incoming = { ...léana(), id: 'autre-id', updatedAt: OCT17 + 1000 };
    incoming.animals = incoming.animals.slice(0, 1);
    const r = restoreReplace(store, local.id, incoming, { backupName, now: OCT17 });
    expect(r.ok).toBe(true);
    const list = store.list();
    expect(list.map((e) => e.name)).toEqual(['Léana', 'Léana · secours', 'Tom']);
    // La partie restaurée garde l'id du fichier (libre ici) ; c'est une modification voulue, elle reçoit une
    // nouvelle date (plus récente que le fichier : la synchro ne la prendra pas pour « pas changée ») ; l'ancienne
    // a disparu de la liste…
    expect(r.profile.id).toBe('autre-id');
    expect(store.load(local.id)).toBeNull();
    expect(store.load('autre-id').animals).toHaveLength(1);
    expect(store.load('autre-id').updatedAt).toBeGreaterThan(OCT17 + 1000);
    expect(store.load('autre-id').updatedAt).toBeGreaterThan(local.updatedAt);
    // … mais rien n'est perdu : la copie de secours a tout (4 animaux) et dit d'où elle vient.
    const backup = store.load(r.backup.id);
    expect(backup.animals.map((a) => a.name)).toEqual(['Caramel', 'Pilou', 'Étoile', 'Minou']);
    expect(backup).toMatchObject({ backupOf: local.id, backupAt: OCT17, updatedAt: local.updatedAt });
    expect(list.find((e) => e.id === r.backup.id).backup).toBe(true);
  });

  it('remplacer la même partie (même id) : elle garde son id', () => {
    const local = léana();
    const store = memoryStore([local]);
    const r = restoreReplace(store, local.id, { ...local, xp: 0 }, { backupName });
    expect(r.ok).toBe(true);
    expect(store.list().map((e) => e.id)).toEqual([local.id, r.backup.id]);
    expect(store.load(local.id).xp).toBe(0);
    expect(store.load(r.backup.id).xp).toBe(local.xp);
  });

  it('stockage plein pour la copie de secours : rien ne change', () => {
    const local = léana();
    const store = memoryStore([local], { failOn: (p) => Boolean(p.backupOf) });
    const before = store.load(local.id);
    const r = restoreReplace(store, local.id, createProfile('Autre'), { backupName });
    expect(r).toMatchObject({ ok: false, error: 'storage' });
    expect(store.list()).toHaveLength(1);
    expect(store.load(local.id)).toEqual(before);
  });

  it('stockage plein pour la partie restaurée : l\'ancienne reste, et la copie aussi', () => {
    const local = léana();
    const store = memoryStore([local], { failOn: (p) => p.name === 'Autre' });
    const r = restoreReplace(store, local.id, createProfile('Autre'), { backupName });
    expect(r).toMatchObject({ ok: false, error: 'storage' });
    expect(store.load(local.id).animals).toHaveLength(3);
    expect(store.load(r.backup.id).backupOf).toBe(local.id);
  });

  it('deux remplacements le même jour : deux copies de secours aux noms différents', () => {
    const p = léana();
    const store = memoryStore([p]);
    const name = (old) => `${old.name} · secours 17/10`;
    const r1 = restoreReplace(store, p.id, { ...p, xp: 1 }, { backupName: name });
    const r2 = restoreReplace(store, p.id, { ...p, xp: 2 }, { backupName: name });
    expect([r1.backup.name, r2.backup.name]).toEqual(['Léana · secours 17/10', 'Léana · secours 17/10 (2)']);
    expect(store.list().map((e) => e.name).sort()).toEqual(['Léana', 'Léana · secours 17/10', 'Léana · secours 17/10 (2)']);
  });

  it('afterBackup (arrêter la partie en cours) : appelé une fois la copie écrite, avant d\'écrire par-dessus', () => {
    const p = léana();
    const store = memoryStore([p]);
    const seen = [];
    const r = restoreReplace(store, p.id, { ...p, xp: 0 }, {
      backupName,
      afterBackup: () => seen.push([store.list().length, store.load(p.id).xp]),
    });
    expect(r.ok).toBe(true);
    expect(seen).toEqual([[2, p.xp]]); // copie là, ancienne version pas encore remplacée
    // Copie impossible : afterBackup n'est pas appelé (la partie en cours continue).
    const full = memoryStore([p], { failOn: (x) => Boolean(x.backupOf) });
    let called = false;
    expect(restoreReplace(full, p.id, { ...p, xp: 0 }, { backupName, afterBackup: () => { called = true; } }).ok).toBe(false);
    expect(called).toBe(false);
  });

  it('une copie de secours sur laquelle on joue redevient une partie normale (sauvegarde avec touch)', () => {
    fakeStorage();
    const p = léana();
    saveProfile(p);
    const r = restoreReplace(deviceStore(), p.id, { ...p, xp: 0 }, { backupName });
    expect(listProfiles().find((e) => e.id === r.backup.id).backup).toBe(true);
    // Une restauration (touch: false) garde la marque…
    const copy = loadProfile(r.backup.id);
    expect(copy.backupOf).toBe(p.id);
    saveProfile(copy, { touch: false });
    expect(listProfiles().find((e) => e.id === copy.id).backup).toBe(true);
    // … mais dès qu'on joue dessus (Game.save), c'est une partie comme les autres.
    saveProfile(copy);
    expect(copy.backupOf).toBeUndefined();
    expect(listProfiles().find((e) => e.id === copy.id).backup).toBeUndefined();
    expect(loadProfile(copy.id).backupOf).toBeUndefined();
    // Pareil pour le stockage en mémoire.
    const mem = memoryStore([{ ...createProfile('Ana'), backupOf: 'x', backupAt: 1 }]);
    const id = mem.list()[0].id;
    expect(mem.list()[0].backup).toBe(true);
    mem.save(mem.load(id));
    expect(mem.list()[0].backup).toBeUndefined();
  });

  it('profil à remplacer introuvable', () => {
    expect(restoreReplace(memoryStore([]), 'nope', createProfile('A'))).toMatchObject({ ok: false, error: 'missing' });
  });

  it('ajouter comme nouveau profil : id gardé s\'il est libre, sinon un nouveau ; prénom unique', () => {
    const local = léana();
    const store = memoryStore([local]);
    const same = restoreAsNew(store, local); // la même partie, déjà là
    expect(same.ok).toBe(true);
    expect(same.profile.id).not.toBe(local.id);
    expect(same.profile.name).toBe('Léana (2)');
    expect(store.load(local.id).name).toBe('Léana'); // l'existante n'est pas touchée
    const other = createProfile('Tom');
    expect(restoreAsNew(store, other).profile.id).toBe(other.id);
    // Une copie de secours restaurée redevient une partie normale.
    const r = restoreAsNew(store, { ...createProfile('Ana'), backupOf: 'x', backupAt: 1 });
    expect(r.profile.backupOf).toBeUndefined();
    expect(store.list()).toHaveLength(4);
  });

  it('sur l\'appareil (localStorage) : exporter puis restaurer dans un « autre navigateur »', () => {
    fakeStorage();
    const p = léana();
    saveProfile(p);
    const text = serializeSave(collectProfiles(deviceStore(), [p.id]), { appVersion: '0.4.0' });
    // Autre navigateur (nouvelle adresse du jeu) : stockage vide.
    fakeStorage();
    expect(listProfiles()).toEqual([]);
    const parsed = parseSave(text);
    const r = restoreAsNew(deviceStore(), parsed.profiles[0]);
    expect(r.ok).toBe(true);
    expect(r.profile.id).toBe(p.id);
    const back = loadProfile(p.id);
    expect(back.animals.map((a) => a.name)).toEqual(['Caramel', 'Pilou', 'Étoile']);
    expect(back.money).toBe(1234);
    expect(listProfiles()[0]).toMatchObject({ id: p.id, name: 'Léana', animals: 3 });
  });
});
