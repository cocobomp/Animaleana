// 🫧 « Il te demande… » (src/sim/horseWish.js) : une seule chose à la fois, dans l'ordre de sa journée.
import { describe, it, expect } from 'vitest';
import { createAnimal } from '../src/sim/animal.js';
import { seeded } from '../src/sim/rng.js';
import { markHorseDay, horseDayView } from '../src/sim/horseDay.js';
import { wishOf, wishDone, wishFirst, ICONS, WISH_ACTION } from '../src/sim/horseWish.js';
import { SPECIES } from '../src/sim/species.js';
import { restDay } from '../src/ui/minigames/ration.js';

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

  it('le foin : le matin jusqu\'à 14 h, le soir dès 14 h (comme dans sa journée), après le travail ; affamé, toujours', () => {
    const a = horse();
    expect(at(a, 13.9)).toMatchObject({ id: 'hay', task: 'feedAm' });
    expect(at(a, 14).id).toBe('water'); // (foin du matin raté : celui du soir viendra après le travail)
    for (const k of ['water', 'brush']) markHorseDay(a, k, 14, DAY);
    expect(at(a, 14.5).id).toBe('work');
    expect(at(a, 19)).toMatchObject({ id: 'hay', task: 'feedPm' }); // (19 h : plus de travail)
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

  it('de 14 h à 16 h, tout le reste fait : sa bulle demande le foin du soir que sa journée attend', () => {
    const a = horse();
    for (const [k, h] of [['feed', 8], ['water', 9], ['brush', 10], ['ride', 11], ['pet', 12]]) markHorseDay(a, k, h, DAY);
    expect(at(a, 13.5)).toBe(null);
    const pm = horseDayView(a, DAY, 14.7).find((x) => x.id === 'feedPm');
    expect(pm).toMatchObject({ done: false, later: false });
    expect(at(a, 14.7)).toMatchObject({ id: 'hay', task: 'feedPm' });
    expect(markHorseDay(a, 'feed', 14.7, DAY)).toEqual({ added: ['feedPm'], perfect: true });
    expect(at(a, 15)).toBe(null);
  });

  it('de 14 h à 19 h : la balade d\'abord, puis le foin du soir, avec la ration d\'un jour de travail', () => {
    const a = horse();
    for (const [k, h] of [['feed', 8], ['water', 9], ['brush', 10]]) markHorseDay(a, k, h, DAY);
    expect(at(a, 14.5)).toMatchObject({ id: 'work', icon: '🏇' });
    expect(restDay(a, DAY, 14.5)).toBe(true); // (nourri maintenant : « un jour de repos »)
    markHorseDay(a, 'ride', 14.5, DAY);
    expect(at(a, 15)).toMatchObject({ id: 'hay', task: 'feedPm' });
    expect(restDay(a, DAY, 15)).toBe(false);
  });

  it('un poulain (pas de travail à cocher) : sa bulle s\'en va quand sa journée est parfaite', () => {
    const a = createAnimal({ species: 'horse', sex: 'm', ageDays: 18, rng: seeded('poulain') }); // (1 an et demi)
    Object.assign(a.needs, { hunger: 80, thirst: 80, energy: 80, affection: 60 });
    const follow = (hour) => {
      const seen = [];
      for (let w = at(a, hour); w && seen.length < 6; w = at(a, hour)) {
        seen.push(w.task);
        markHorseDay(a, { hay: 'feed', water: 'water', brush: 'brush', pet: 'pet' }[w.id], hour, DAY);
      }
      return seen;
    };
    expect(follow(10)).toEqual(['feedAm', 'water', 'brush', 'pet']); // (pas de 🏇 : trop jeune pour être monté)
    expect(follow(15)).toEqual(['feedPm']);
    expect(a.today.perfect).toBe(true);
    expect(horseDayView(a, DAY, 15).every((x) => x.done)).toBe(true);
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

  it('descendu, encore sellé : 🧰 d\'abord, même affamé ; dessellé et débridé : exaucé', () => {
    const a = horse();
    a.gear = { saddle: { item: 'x' } };
    expect(at(a, 10).id).not.toBe('untack'); // (sellé pour plus tard : pas encore travaillé)
    markHorseDay(a, 'ride', 10, DAY);
    a.needs.hunger = 30;
    const w = at(a, 11);
    expect(w).toMatchObject({ id: 'untack', icon: '🧰', task: 'untack' });
    a.gear.bridle = { item: 'y' };
    delete a.gear.saddle;
    expect(wishDone(a, w, DAY)).toBe(false); // (le filet encore)
    expect(at(a, 11).id).toBe('untack');
    delete a.gear.bridle;
    expect(wishDone(a, w, DAY)).toBe(true);
    expect(at(a, 11)).toMatchObject({ id: 'hay', task: 'hunger' });
    a.gear.halter = { item: 'halter' };
    expect(at(a, 11).id).toBe('hay'); // (son licol, il le garde au pré)
  });

  it('chaque bulle a son geste : un soin du cheval, monter ou desseller', () => {
    for (const id of Object.keys(ICONS)) {
      const act = WISH_ACTION[id];
      expect(SPECIES.horse.actions.includes(act) || ['ride', 'unsaddle'].includes(act), id).toBe(true);
    }
  });

  it('son menu : ce qu\'il demande en premier, cerclé d\'or ; les autres dans le même ordre', () => {
    const items = [{ act: 'feed' }, { act: 'water' }, { icon: '📣' }, { act: 'ride', cls: 'x' }, { act: 'unsaddle' }];
    const out = wishFirst(items, 'ride');
    expect(out.map((it) => it.act ?? it.icon)).toEqual(['ride', 'feed', 'water', '📣', 'unsaddle']);
    expect(out[0].cls).toBe('x wish');
    expect(wishFirst(items, 'water')[0]).toMatchObject({ act: 'water', cls: 'wish' });
    expect(items[1].cls).toBeUndefined(); // (le menu d'origine n'est pas touché)
    expect(wishFirst(items, null)).toBe(items);
    expect(wishFirst(items, 'pet')).toBe(items); // (pas de bouton pour ça)
  });
});
