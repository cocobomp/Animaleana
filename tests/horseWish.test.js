// 🫧 « Il te demande… » (src/sim/horseWish.js) : une seule chose à la fois, dans l'ordre de sa journée.
import { describe, it, expect } from 'vitest';
import { createAnimal } from '../src/sim/animal.js';
import { seeded } from '../src/sim/rng.js';
import { markHorseDay } from '../src/sim/horseDay.js';
import { wishOf, wishDone, ICONS } from '../src/sim/horseWish.js';

const horse = (sex = 'f') => {
  const a = createAnimal({ species: 'horse', sex, ageDays: 2000, rng: seeded('voeu') });
  Object.assign(a.needs, { hunger: 80, thirst: 80, energy: 80 });
  return a;
};
const DAY = 4;
const at = (a, hour, opts = {}) => wishOf(a, { day: DAY, hour, ...opts });

describe('ce que ton cheval te demande', () => {
  it('dans l\'ordre : le foin du matin, l\'eau, le pansage, le travail, un câlin ; tout fait : plus rien', () => {
    const a = horse();
    expect(at(a, 8)).toMatchObject({ id: 'hay', icon: '🌾', task: 'feedAm' });
    markHorseDay(a, 'feed', 8, DAY);
    expect(at(a, 8)).toMatchObject({ id: 'water', icon: ICONS.water, task: 'water' });
    markHorseDay(a, 'water', 8, DAY);
    expect(at(a, 8).id).toBe('brush');
    markHorseDay(a, 'brush', 8, DAY);
    expect(at(a, 8)).toMatchObject({ id: 'work', icon: '🏇' });
    expect(at(a, 20)).toMatchObject({ id: 'hay', task: 'feedPm' }); // (à 20 h : le foin du soir d'abord)
  });

  it('le soir, plus de travail : un câlin ; les six faits : rien à 17 h', () => {
    const a = horse();
    for (const [k, h] of [['feed', 8], ['water', 9], ['brush', 10], ['feed', 17]]) markHorseDay(a, k, h, DAY);
    expect(at(a, 20)).toMatchObject({ id: 'pet', icon: '❤️', task: 'pet' });
    markHorseDay(a, 'ride', 17, DAY);
    markHorseDay(a, 'pet', 17, DAY);
    expect(at(a, 17)).toBe(null);
  });

  it('le foin : raté le matin, il ne le réclame pas à 15 h ; le soir à partir de 16 h ; affamé, toujours', () => {
    const a = horse();
    expect(at(a, 15).id).not.toBe('hay'); // (foin du matin raté, pas faim)
    expect(at(a, 15).id).toBe('water');
    expect(at(a, 17)).toMatchObject({ id: 'hay', task: 'feedPm' });
    const b = horse();
    markHorseDay(b, 'feed', 8, DAY);
    b.needs.hunger = 30;
    expect(at(b, 11)).toMatchObject({ id: 'hay', task: 'hunger' });
    b.needs.thirst = 20;
    b.needs.hunger = 80;
    expect(at(b, 11)).toMatchObject({ id: 'water', task: 'thirst' });
  });

  it('rien s\'il boite, est malade, dort, la nuit, ou s\'il t\'est confié', () => {
    const a = horse();
    expect(at(a, 10)).not.toBe(null);
    expect(at(a, 10, { sleeping: true })).toBe(null);
    expect(at(a, 23)).toBe(null);
    expect(at(a, 5)).toBe(null);
    expect(at({ ...a, lame: { cause: 'stone' } }, 10)).toBe(null);
    expect(at({ ...a, sick: 'cold' }, 10)).toBe(null);
    expect(at({ ...a, client: { id: 'c1' } }, 10)).toBe(null);
    expect(at({ ...a, guest: true }, 10)).toBe(null);
    expect(at(createAnimal({ species: 'dog', sex: 'f', ageDays: 900, rng: seeded('chien') }), 10)).toBe(null);
  });

  it('pas un soin que le jeu refuserait (« il n\'en a pas besoin ») : la bulle passe au suivant, puis revient', () => {
    const a = horse();
    a.needs.hunger = 98;
    expect(at(a, 8).id).toBe('water'); // (le foin du matin : rassasié, refusé)
    a.needs.thirst = 99; // (il a bu seul à l'abreuvoir du paddock)
    expect(at(a, 8).id).toBe('brush');
    a.needs.thirst = 90;
    expect(at(a, 8).id).toBe('water');
    for (const k of ['feed', 'water', 'brush', 'ride']) markHorseDay(a, k, 9, DAY);
    a.needs.affection = 100; // (deux friandises avant le câlin)
    expect(at(a, 10)).toBe(null);
    a.needs.affection = 70;
    expect(at(a, 10)).toMatchObject({ id: 'pet' });
  });

  it('une jument pleine ne se monte pas : pas de travail, un câlin', () => {
    const a = horse('f');
    a.pregnant = { due: 40 };
    for (const k of ['feed', 'water', 'brush']) markHorseDay(a, k, 9, DAY);
    expect(at(a, 10)).toMatchObject({ id: 'pet' });
    delete a.pregnant;
    expect(at(a, 10)).toMatchObject({ id: 'work' });
  });

  it('exaucé : la tâche cochée ce jour-là, ou rassasié', () => {
    const a = horse();
    const w = at(a, 8);
    expect(wishDone(a, w, DAY)).toBe(false);
    markHorseDay(a, 'feed', 8, DAY);
    expect(wishDone(a, w, DAY)).toBe(true);
    expect(wishDone(a, w, DAY + 1)).toBe(false); // (un nouveau jour)
    a.needs.hunger = 30;
    const h = at(a, 11);
    expect(wishDone(a, h, DAY)).toBe(false);
    a.needs.hunger = 75;
    expect(wishDone(a, h, DAY)).toBe(true);
    expect(wishDone(a, null, DAY)).toBe(false);
  });

  it('il ne coche rien en lisant sa journée', () => {
    const a = horse();
    at(a, 8);
    expect(a.today).toBeUndefined();
    markHorseDay(a, 'feed', 8, DAY);
    const before = JSON.stringify(a.today);
    expect(wishOf(a, { day: DAY + 1, hour: 8 }).task).toBe('feedAm');
    expect(JSON.stringify(a.today)).toBe(before);
  });
});
