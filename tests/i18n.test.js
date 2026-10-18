import { describe, it, expect, beforeAll } from 'vitest';

let i18n;
beforeAll(async () => {
  // setLang écrit document.documentElement.lang : un minimum de DOM suffit ici.
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
});

describe('traductions', () => {
  it('en anglais, le singulier « _one » français ne fuit pas', () => {
    const { t, setLang } = i18n;
    setLang('fr');
    expect(t('actv_ready', { n: 1 })).toBe(t('actv_ready_one', { n: 1 }));
    setLang('en');
    expect(t('actv_ready', { n: 1 })).not.toMatch(/prêt/);
    setLang('fr');
  });

  it('toutes les raisons des activités ont un texte', () => {
    const { t } = i18n;
    for (const why of ['sick', 'baby', 'tired', 'notRideable', 'tooYoung', 'needBridle', 'noAgility', 'noTricks', 'notHere', 'pregnant', 'notRabbit']) {
      expect(t(`actv_why_${why}`, { name: 'X' })).not.toBe(`actv_why_${why}`);
    }
  });

  it('les heures suivent la langue (« 9 h » en français, « 9 am » en anglais)', async () => {
    const { t, setLang, fmtHour, hourParams } = i18n;
    const { buildingActions } = await import('../src/sim/buildings.js');
    const ctx = { hour: 8, season: 'summer', home: true, count: { horse: 0, livestock: 0, pets: 0, sick: 0, milkable: 0, shearable: 0 } };
    const adopt = buildingActions('refuge', ctx).find((a) => a.id === 'adopt');
    const sleep = buildingActions('house', ctx).find((a) => a.id === 'sleep');
    setLang('fr');
    expect(fmtHour(9)).toBe('9 h');
    expect(fmtHour(18)).toBe('18 h');
    expect(t(`why_${adopt.reason}`, hourParams(adopt.params))).toBe('Fermé. Ouvert de 9 h à 18 h.');
    setLang('en');
    expect([fmtHour(0), fmtHour(9), fmtHour(12), fmtHour(18), fmtHour(21)]).toEqual(['12 am', '9 am', '12 pm', '6 pm', '9 pm']);
    expect(t(`why_${adopt.reason}`, hourParams(adopt.params))).toBe('Closed. Open 9 am – 6 pm.');
    expect(t(`why_${sleep.reason}`, hourParams(sleep.params))).not.toMatch(/\d h\b/);
    expect(t('skippedTo', { h: fmtHour(21) })).toBe('⏭ It is now 9 pm.');
    setLang('fr');
  });

  it('la robe s\'accorde au sexe : « Bouc · Saanen · Blanc », « Chèvre · Saanen · Blanche »', async () => {
    const { setLang } = i18n;
    const { createAnimal } = await import('../src/sim/animal.js');
    const { coatName, speciesName } = await import('../src/ui/names.js');
    const { SPECIES } = await import('../src/sim/species.js');
    setLang('fr');
    const bouc = createAnimal({ species: 'goat', breed: 'saanen', sex: 'm', ageDays: 400, name: 'Paprika' });
    const chevre = createAnimal({ species: 'goat', breed: 'saanen', sex: 'f', ageDays: 400, name: 'Praline' });
    expect(`${speciesName(bouc)} · ${coatName(bouc)}`).toBe('Bouc · Blanc');
    expect(`${speciesName(chevre)} · ${coatName(chevre)}`).toBe('Chèvre · Blanche');
    expect(coatName(createAnimal({ species: 'cow', breed: 'highland', sex: 'm', ageDays: 900, name: 'T' }))).toBe('Roux');
    // Croisé (race « mix ») : la forme masculine est retrouvée dans les autres races.
    expect(coatName({ ...bouc, breed: 'mix' })).toBe('Blanc');
    // Le nom gardé dans la sauvegarde ne change pas (il sert à retrouver la robe).
    expect(bouc.look.colorName.fr).toBe('Blanche');
    // Aucune robe de mâle (chèvre, vache) ne reste au féminin.
    for (const sp of ['goat', 'cow']) {
      for (const b of SPECIES[sp].breeds) for (const c of b.colors) {
        // (« Rouge face blanche » : « blanche » va avec la face, pas avec l'animal)
        expect((c.m ?? c.name.fr).replace(/face \S+/, ''), `${sp} ${b.id}`).not.toMatch(/(ée|che|ne|sse|ire)\b/);
      }
    }
    setLang('en');
    expect(coatName(bouc)).toBe('White');
    setLang('fr');
  });
});
