// La journée de ton cheval (src/sim/horseDay.js) : foin du matin et du soir, eau, pansage, travail, câlin.
import { describe, it, expect } from 'vitest';
import { createAnimal } from '../src/sim/animal.js';
import { seeded } from '../src/sim/rng.js';
import { DAY_TASKS, markHorseDay, horseDayView } from '../src/sim/horseDay.js';

const horse = () => {
  const a = createAnimal({ species: 'horse', sex: 'f', ageDays: 2000, rng: seeded('journee') });
  a.bond = 20;
  return a;
};

describe('la journée de ton cheval', () => {
  it('tout coché dans la journée : parfaite (une seule fois), le lien monte', () => {
    const a = horse();
    expect(markHorseDay(a, 'feed', 8, 3).added).toEqual(['feedAm']);
    expect(markHorseDay(a, 'water', 9, 3).added).toEqual(['water']);
    expect(markHorseDay(a, 'brush', 10, 3).added).toEqual(['brush']);
    expect(markHorseDay(a, 'ride', 11, 3).added).toEqual(['work']);
    expect(markHorseDay(a, 'pet', 12, 3).perfect).toBe(false);
    const r = markHorseDay(a, 'feed', 18, 3);
    expect(r).toEqual({ added: ['feedPm'], perfect: true });
    expect(a.bond).toBe(23);
    expect(markHorseDay(a, 'pet', 19, 3).perfect).toBe(false); // (déjà parfaite)
    expect(horseDayView(a, 3, 20).every((x) => x.done)).toBe(true);
  });

  it('deux repas pour deux créneaux : le matin ne compte pas pour le soir', () => {
    const a = horse();
    markHorseDay(a, 'feed', 8, 1);
    expect(markHorseDay(a, 'feed', 9, 1).added).toEqual([]); // (déjà fait ce matin)
    expect(markHorseDay(a, 'feed', 15, 1).added).toEqual(['feedPm']);
    const v = horseDayView(a, 1, 15);
    expect(v.find((x) => x.id === 'feedAm').done).toBe(true);
  });

  it('un nouveau jour : tout recommence ; le foin du matin raté après 14 h, le soir pas encore le matin', () => {
    const a = horse();
    for (const k of ['feed', 'water', 'brush', 'lunge', 'pet']) markHorseDay(a, k, 10, 1);
    const v = horseDayView(a, 2, 15);
    expect(v.filter((x) => x.done)).toEqual([]);
    expect(v.find((x) => x.id === 'feedAm').missed).toBe(true);
    expect(horseDayView(a, 3, 9).find((x) => x.id === 'feedPm').later).toBe(true);
    expect(DAY_TASKS.map((x) => x.id)).toEqual(['feedAm', 'feedPm', 'water', 'brush', 'work', 'pet']);
  });

  it('le travail : monter, la longe, la liberté ou une activité ; un chien n\'a pas de journée de cheval', () => {
    for (const kind of ['ride', 'lunge', 'liberty', 'activity']) expect(markHorseDay(horse(), kind, 10, 1).added).toEqual(['work']);
    const dog = createAnimal({ species: 'dog', sex: 'f', ageDays: 300, rng: seeded('chien') });
    expect(markHorseDay(dog, 'feed', 8, 1).added).toEqual([]);
  });
});
