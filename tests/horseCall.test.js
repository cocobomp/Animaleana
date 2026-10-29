// 📣 Appeler ton cheval (src/sim/horseCall.js) : plus votre lien est fort, plus il vient (faim : un peu plus) ; il ne
// vient pas s'il dort, s'il a mal ou s'il est au box ; venu, le lien grandit un peu, trois fois par jour au plus.
import { describe, it, expect, beforeAll } from 'vitest';
import { CALL, callChance, answerCall, cameWhenCalled } from '../src/sim/horseCall.js';
import { createAnimal } from '../src/sim/animal.js';
import { seeded } from '../src/sim/rng.js';

let i18n;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
});

const horse = (bond = 5) => {
  const a = createAnimal({ species: 'horse', sex: 'm', ageDays: 2000, rng: seeded('appel') });
  for (const n of Object.keys(a.needs)) a.needs[n] = 80;
  a.name = 'Tonnerre';
  a.bond = bond;
  return a;
};

describe('appeler ton cheval', () => {
  it('plus votre lien est fort, plus il vient ; à 51 et plus, toujours ; il a faim : un peu plus', () => {
    expect(callChance(horse(0))).toBeCloseTo(CALL.base, 5);
    expect(callChance(horse(30))).toBeCloseTo(0.65, 5);
    expect(callChance(horse(51))).toBe(1);
    const h = horse(0);
    h.needs.hunger = 20;
    expect(callChance(h)).toBeCloseTo(CALL.base + CALL.hungry, 5);
  });

  it('ses réponses : il vient, il regarde, il dort, il a mal, il est au box, il est déjà là', () => {
    expect(answerCall(horse(60), { dist: 20, rng: () => 0.99 })).toBe('come');
    expect(answerCall(horse(0), { dist: 20, rng: () => 0.5 })).toBe('look');
    expect(answerCall(horse(0), { dist: 20, rng: () => 0.1 })).toBe('come');
    expect(answerCall(horse(60), { dist: 3 })).toBe('near');
    expect(answerCall(horse(60), { dist: 20, sleeping: true })).toBe('sleep');
    const lame = horse(60);
    lame.lame = { cause: 'stone', foot: 0, hours: 0 };
    expect(answerCall(lame, { dist: 20 })).toBe('pain');
    const boxed = horse(60);
    boxed.stalled = true;
    expect(answerCall(boxed, { dist: 20 })).toBe('box');
  });

  it('il est venu : le lien grandit un peu, trois fois par jour au plus', () => {
    const a = horse(10);
    for (let k = 0; k < CALL.bondPerDay; k++) expect(cameWhenCalled(a, 4)).toBe(true);
    expect(cameWhenCalled(a, 4)).toBe(false);
    expect(a.bond).toBe(10 + CALL.bondPerDay * CALL.bondGain);
    expect(cameWhenCalled(a, 5)).toBe(true);
  });

  it('chaque réponse a son texte (français et anglais)', () => {
    const { t, setLang } = i18n;
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of ['come', 'comeBond', 'look', 'near', 'sleep', 'pain', 'box']) {
        expect(t(`call_${k}`, { name: 'Tonnerre', g: 'f' }), `${lang} ${k}`).toContain('Tonnerre');
      }
      expect(t('act_call', { name: 'Tonnerre' })).toContain('Tonnerre');
    }
    setLang('fr');
  });
});
