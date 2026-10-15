import { describe, it, expect } from 'vitest';
import {
  createAnimal, tickAnimal, applyCare, happiness, mood, lifeStage, canBreed, breed,
  trainTrick, canRide, cure, NEGLECT_LIMIT, breedingChecklist, mate, checkup,
} from '../src/sim/animal.js';
import { mulberry32 } from '../src/sim/rng.js';
import { DAYS_PER_YEAR } from '../src/sim/time.js';

const rng = () => mulberry32(42);
const adult = (species, sex) => createAnimal({ species, breed: undefined, sex, ageDays: 5 * DAYS_PER_YEAR, rng: rng() });

describe('besoins', () => {
  it('baissent avec le temps', () => {
    const a = adult('dog', 'f');
    const before = a.needs.hunger;
    tickAnimal(a, 5, { rng: rng() });
    expect(a.needs.hunger).toBeLessThan(before);
  });

  it('nourrir remplit la faim, sauf si l\'animal n\'a pas faim', () => {
    const a = adult('cat', 'f');
    a.needs.hunger = 20;
    expect(applyCare(a, 'feed').ok).toBe(true);
    expect(a.needs.hunger).toBe(65);
    a.needs.hunger = 100;
    expect(applyCare(a, 'feed')).toEqual({ ok: false, reason: 'full' });
  });

  it('un animal fatigué refuse de jouer', () => {
    const a = adult('dog', 'm');
    a.needs.energy = 5;
    expect(applyCare(a, 'play').reason).toBe('tired');
  });
});

describe('négligence', () => {
  it('un animal négligé devient triste puis malade, mais ne meurt pas', () => {
    const a = adult('rabbit', 'f');
    for (const n of Object.keys(a.needs)) a.needs[n] = 0;
    expect(mood(a)).toBe('sad');
    const events = tickAnimal(a, NEGLECT_LIMIT + 1, { rng: rng() });
    expect(events).toContain('sick');
    expect(mood(a)).toBe('sick');
    for (let i = 0; i < 50; i++) tickAnimal(a, 2, { rng: rng() });
    expect(a.health).toBeGreaterThanOrEqual(15);
    cure(a);
    expect(a.sick).toBeNull();
  });
});

describe('âge', () => {
  it('passe de bébé à adulte et meurt de vieillesse', () => {
    const a = createAnimal({ species: 'rabbit', ageDays: 0, rng: rng() });
    expect(lifeStage(a)).toBe('baby');
    a.ageDays = 2 * DAYS_PER_YEAR;
    expect(lifeStage(a)).toBe('adult');
    a.ageDays = a.lifespanYears * DAYS_PER_YEAR - 0.01;
    expect(tickAnimal(a, 1, { rng: rng() })).toContain('died');
  });

  it('un poulain ne peut pas être monté', () => {
    const foal = createAnimal({ species: 'horse', ageDays: 6, rng: rng() });
    expect(canRide(foal).reason).toBe('tooYoung');
    expect(canRide(adult('horse', 'm')).ok).toBe(true);
  });
});

describe('reproduction', () => {
  const ready = (a) => {
    for (const n of Object.keys(a.needs)) a.needs[n] = 95;
    checkup(a, 9);
    return a;
  };

  it('il faut remplir toutes les conditions (santé, bonheur, vétérinaire, niveau…)', () => {
    const m = adult('dog', 'm');
    const f = adult('dog', 'f');
    const list = breedingChecklist(m, f, { day: 10, level: 1 });
    expect(list.find((c) => c.id === 'level').ok).toBe(false);
    expect(list.some((c) => c.id === 'vet' && !c.ok)).toBe(true);
    ready(m);
    ready(f);
    expect(canBreed(m, f, 10, 4).ok).toBe(true);
    expect(canBreed(m, f, 10, 1).reason).toBe('level');
  });

  it('la femelle attend des petits, qui naissent à la fin de la gestation', () => {
    const m = ready(adult('dog', 'm'));
    const f = ready(adult('dog', 'f'));
    const mother = mate(m, f, 10);
    expect(mother).toBe(f);
    expect(f.pregnant.due).toBe(12);
    expect(canBreed(m, f, 11, 4).reason).toBe('cooldown');
    const babies = breed(m, f, 12, rng());
    expect(babies.length).toBeGreaterThanOrEqual(1);
    expect(lifeStage(babies[0])).toBe('baby');
    expect(f.pregnant).toBeUndefined();
  });

  it('refuse deux animaux du même sexe ou d\'espèces différentes', () => {
    expect(canBreed(adult('cat', 'f'), adult('cat', 'f'), 10).reason).toBe('sex');
    expect(canBreed(adult('cat', 'f'), adult('dog', 'm'), 10).reason).toBe('species');
  });
});

describe('dressage', () => {
  it('il faut d\'abord créer un lien en jouant avec l\'animal', () => {
    const a = adult('dog', 'f');
    a.bond = 0;
    expect(trainTrick(a, 'sit').reason).toBe('bond');
    for (let i = 0; i < 6; i++) { a.needs.exercise = 10; a.needs.energy = 100; applyCare(a, 'play'); }
    expect(a.bond).toBeGreaterThanOrEqual(20);
    expect(trainTrick(a, 'sit').ok).toBe(true);
  });

  it('finit par apprendre un tour', () => {
    const a = adult('dog', 'f');
    a.bond = 50;
    const r = rng();
    let learned = false;
    for (let i = 0; i < 40 && !learned; i++) {
      a.needs.energy = 100;
      learned = trainTrick(a, 'sit', r).learned;
    }
    expect(learned).toBe(true);
    expect(happiness(a)).toBeGreaterThan(0);
  });
});
