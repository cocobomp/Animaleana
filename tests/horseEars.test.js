// 👂 Les oreilles du cheval (src/sim/horseEars.js) : en avant quand tout va bien, sur le côté quand il somnole ou
// qu'il est fatigué, couchées en arrière quand il a mal, faim, soif ou qu'il est grognon ; chaque cas a son texte.
import { describe, it, expect, beforeAll } from 'vitest';
import { earsOf, EARS } from '../src/sim/horseEars.js';
import { createAnimal } from '../src/sim/animal.js';
import { seeded } from '../src/sim/rng.js';

let i18n;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
});

const horse = () => {
  const a = createAnimal({ species: 'horse', sex: 'f', ageDays: 2000, rng: seeded('oreilles') });
  for (const n of Object.keys(a.needs)) a.needs[n] = 80;
  a.name = 'Étoile';
  return a;
};

describe('les oreilles du cheval', () => {
  it('tout va bien : en avant ; il dort : sur le côté', () => {
    const a = horse();
    expect(earsOf(a)).toEqual({ pose: 'forward', why: 'curious' });
    expect(earsOf(a, { sleeping: true })).toEqual({ pose: 'side', why: 'sleepy' });
    a.needs.energy = EARS.tired - 1;
    expect(earsOf(a)).toEqual({ pose: 'side', why: 'tired' });
  });

  it('couchées en arrière : il a mal, faim, soif, ou il est grognon (le mal d\'abord)', () => {
    const a = horse();
    a.needs.hunger = 5;
    expect(earsOf(a)).toEqual({ pose: 'back', why: 'hunger' });
    a.lame = { cause: 'stone', foot: 1, hours: 0 };
    expect(earsOf(a).why).toBe('pain');
    a.lame = null;
    a.needs.hunger = 80;
    a.needs.thirst = 5;
    expect(earsOf(a).why).toBe('thirst');
    a.needs.thirst = 80;
    expect(earsOf(a, { happy: EARS.grumpy - 1 })).toEqual({ pose: 'back', why: 'grumpy' });
    a.sick = 'flu';
    expect(earsOf(a).why).toBe('pain');
  });

  it('seulement pour les chevaux', () => {
    const d = createAnimal({ species: 'dog', sex: 'm', ageDays: 300, rng: seeded('chien') });
    expect(earsOf(d)).toBeNull();
  });

  it('chaque cas a son texte, en français (au féminin aussi) et en anglais', () => {
    const { t, setLang } = i18n;
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const pose of ['forward', 'side', 'back']) expect(t(`ears_${pose}`)).not.toBe(`ears_${pose}`);
      for (const why of ['curious', 'sleepy', 'tired', 'pain', 'hunger', 'thirst', 'grumpy']) {
        for (const g of ['m', 'f']) expect(t(`ears_why_${why}`, { name: 'Étoile', g }), `${lang} ${why}`).toContain('Étoile');
      }
    }
    setLang('fr');
    expect(t('ears_why_hunger', { name: 'Étoile', g: 'f' })).toBe('Étoile a faim, et ça la rend grognonne !');
  });
});
