import { describe, it, expect } from 'vitest';
import { createAnimal, tickAnimal } from '../src/sim/animal.js';
import { createProfile } from '../src/sim/profile.js';
import {
  buyEquipment, wantedEquipment, useEquipment, hireHelper, helperTask, doHelperTask, payHelpers,
  tickProduce, collectProduct, passiveEquipment,
} from '../src/sim/farm.js';
import { mulberry32 } from '../src/sim/rng.js';
import { DAYS_PER_YEAR } from '../src/sim/time.js';

const rng = () => mulberry32(7);
const adult = (species, sex = 'f') => createAnimal({ species, sex, ageDays: 4 * DAYS_PER_YEAR, rng: rng() });

describe('équipements', () => {
  it('un chien affamé va à la gamelle automatique, qui se vide en mode gestion', () => {
    const p = createProfile('A', 'manage');
    expect(buyEquipment(p, 'petFeeder', 'maison').ok).toBe(true);
    expect(p.money).toBe(420);
    expect(buyEquipment(p, 'petFeeder', 'maison').reason).toBe('owned');
    const dog = adult('dog');
    dog.needs.hunger = 20;
    const eq = wantedEquipment(p, dog, 'maison');
    expect(eq?.type).toBe('petFeeder');
    useEquipment(p, dog, eq);
    expect(dog.needs.hunger).toBe(65);
    expect(eq.stock).toBe(29);
    expect(wantedEquipment(p, adult('horse'), 'maison')).toBeNull();
  });

  it('la litière autonettoyante garde les chats propres', () => {
    const p = createProfile('A');
    buyEquipment(p, 'autoLitter', 'maison');
    const cat = adult('cat');
    cat.needs.hygiene = 10;
    passiveEquipment(p, [cat], 'maison', 4);
    expect(cat.needs.hygiene).toBe(20);
  });
});

describe('aides', () => {
  it('le palefrenier s\'occupe du cheval qui a le plus faim', () => {
    const p = createProfile('A');
    const h = hireHelper(p, 'groom', 'maison', rng()).helper;
    const horse = adult('horse');
    horse.needs.hunger = 10;
    const dog = adult('dog');
    dog.needs.hunger = 0;
    const task = helperTask(p, h, [horse, dog]);
    expect(task).toEqual({ kind: 'care', animalId: horse.id, action: 'feed' });
    doHelperTask(p, task, [horse, dog]);
    expect(horse.needs.hunger).toBe(55);
  });

  it('le vétérinaire attitré soigne les malades', () => {
    const p = createProfile('A');
    const h = hireHelper(p, 'vet', 'maison', rng()).helper;
    const cow = adult('cow');
    cow.sick = 'flu';
    doHelperTask(p, helperTask(p, h, [cow]), [cow]);
    expect(cow.sick).toBeNull();
  });

  it('une aide part si on ne peut plus la payer', () => {
    const p = createProfile('A', 'manage');
    hireHelper(p, 'vet', 'maison', rng());
    p.money = 70;
    expect(payHelpers(p, 1)).toHaveLength(0);
    expect(payHelpers(p, 1)).toHaveLength(1);
    expect(p.helpers).toHaveLength(0);
  });
});

describe('produits', () => {
  it('on tond un mouton quand sa laine a poussé', () => {
    const p = createProfile('A', 'manage');
    const sheep = adult('sheep', 'm');
    expect(collectProduct(p, sheep).reason).toBe('notReady');
    tickProduce(sheep, 200);
    expect(collectProduct(p, sheep)).toMatchObject({ ok: true, product: 'wool' });
    expect(p.money).toBe(540);
  });

  it('seules les femelles donnent du lait', () => {
    const bull = adult('cow', 'm');
    tickProduce(bull, 100);
    expect(bull.produceReady).toBeFalsy();
  });
});

describe('vie de groupe', () => {
  it('un cheval seul perd son affection plus vite qu\'avec des copains', () => {
    const alone = adult('horse');
    const friends = adult('horse');
    tickAnimal(alone, 5, { alone: true, rng: rng() });
    tickAnimal(friends, 5, { companions: 2, rng: rng() });
    expect(friends.needs.affection).toBeGreaterThan(alone.needs.affection);
  });
});
