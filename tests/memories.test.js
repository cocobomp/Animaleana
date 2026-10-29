// 📸 Les souvenirs de ton cheval (src/sim/memories.js) : les premières fois, une seule fois, datées.
import { describe, it, expect, beforeAll } from 'vitest';
import { MEMORIES, remember, memoriesOf, keepsMemories, MEMORY_MAX } from '../src/sim/memories.js';
import { createAnimal } from '../src/sim/animal.js';
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
});
