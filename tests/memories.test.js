// 📸 Les souvenirs de ton cheval (src/sim/memories.js) : les premières fois, une seule fois, datées.
import { describe, it, expect, beforeAll } from 'vitest';
import { MEMORIES, remember, memoriesOf, keepsMemories, MEMORY_MAX, BOND_MEMORIES, anniversaryDue } from '../src/sim/memories.js';
import { createAnimal, BOND_STAGES } from '../src/sim/animal.js';
import { seeded } from '../src/sim/rng.js';

let i18n;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
});

const horse = () => createAnimal({ species: 'horse', breed: 'selle_francais', sex: 'f', ageDays: 2000, rng: seeded('mem') });

describe('les souvenirs de ton cheval', () => {
  it('une première fois se note une seule fois, avec son jour, dans l\'ordre', () => {
    const a = horse();
    expect(memoriesOf(a)).toEqual([]);
    expect(remember(a, 'firstRide', 3)).toBe(true);
    expect(remember(a, 'firstRide', 5)).toBe(false);
    expect(remember(a, 'firstCanter', 4)).toBe(true);
    expect(memoriesOf(a).map((m) => [m.id, m.day])).toEqual([['firstRide', 3], ['firstCanter', 4]]);
    expect(memoriesOf(a)[0].icon).toBe('🏇');
    expect(remember(a, 'nimporte', 4)).toBe(false);
  });

  it('seulement tes chevaux (pas ceux qu\'on te confie, ni les autres animaux)', () => {
    const a = horse();
    a.client = true;
    expect(keepsMemories(a)).toBe(false);
    expect(remember(a, 'firstRide', 1)).toBe(false);
    const d = createAnimal({ species: 'dog', sex: 'm', ageDays: 400, rng: seeded('chien') });
    expect(remember(d, 'firstRide', 1)).toBe(false);
  });

  it('jamais plus de MEMORY_MAX', () => {
    const a = horse();
    a.memories = Array.from({ length: MEMORY_MAX }, (_, i) => ({ id: 'arrived', day: i }));
    expect(remember(a, 'firstLog', 9)).toBe(false);
  });

  it('chaque souvenir a son texte (français, au féminin aussi, et anglais)', () => {
    const { t, setLang } = i18n;
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of ['mem_title', 'mem_none', 'mem_day', 'memTip']) expect(t(k, { name: 'Étoile', n: 2 }), `${lang} ${k}`).not.toBe(k);
      for (const m of MEMORIES) for (const g of ['m', 'f']) expect(t(`mem_${m.id}`, { name: 'Étoile', g }), `${lang} ${m.id}`).not.toBe(`mem_${m.id}`);
    }
    setLang('fr');
    expect(t('mem_firstCall', { name: 'Étoile', g: 'f' })).toBe('Étoile est venue à ton appel');
  });

  it('chaque étape du lien a son souvenir ; pas deux souvenirs du même nom', () => {
    const ids = MEMORIES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeLessThanOrEqual(MEMORY_MAX);
    for (const [stage] of BOND_STAGES.filter(([s]) => s !== 'new')) expect(ids, stage).toContain(BOND_MEMORIES[stage]);
  });
});

describe('🎂 un an ensemble', () => {
  it('tous les 12 jours après son arrivée, une seule fois par année', () => {
    const a = horse();
    remember(a, 'arrived', 3);
    expect(anniversaryDue(a, 14)).toBe(0);
    expect(anniversaryDue(a, 15)).toBe(1);
    expect(anniversaryDue(a, 15)).toBe(0);
    expect(anniversaryDue(a, 26)).toBe(0);
    expect(anniversaryDue(a, 27)).toBe(2);
  });

  it('pas pour un cheval qu\'on te confie', () => {
    const a = horse();
    remember(a, 'arrived', 3);
    a.client = true;
    expect(anniversaryDue(a, 15)).toBe(0);
  });

  it('sans souvenir d\'arrivée (vieille partie, poulain né ici) : on compte à partir d\'aujourd\'hui', () => {
    const a = horse();
    expect(anniversaryDue(a, 40)).toBe(0);
    expect(a.arrivedDay).toBe(40);
    expect(anniversaryDue(a, 51)).toBe(0);
    expect(anniversaryDue(a, 52)).toBe(1);
  });

  it('ses textes : un an (et le conseil de la carotte), puis n ans', () => {
    const { t, setLang } = i18n;
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      expect(t('anniv', { name: 'Étoile', g: 'f', n: 1 })).toMatch(/^🎂 .*Étoile.*(carotte|carrot)/);
      expect(t('anniv', { name: 'Étoile', g: 'f', n: 2 })).toMatch(/^🎂 2 .*Étoile/);
    }
    setLang('fr');
  });
});
