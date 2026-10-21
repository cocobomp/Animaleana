import { describe, it, expect } from 'vitest';
import { createAnimal, tickAnimal } from '../src/sim/animal.js';
import { createProfile } from '../src/sim/profile.js';
import {
  buyEquipment, wantedEquipment, useEquipment, hireHelper, helperTask, doHelperTask, payHelpers,
  tickProduce, collectProduct, passiveEquipment,
} from '../src/sim/farm.js';
import { mulberry32 } from '../src/sim/rng.js';
import { isOffered } from '../src/sim/species.js';
import { DAYS_PER_YEAR, dayOf } from '../src/sim/time.js';

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
    // (chats pas encore proposés : la litière ne se vend qu'à une partie qui a déjà un chat, src/sim/species.js)
    if (!isOffered('cat')) expect(buyEquipment(p, 'autoLitter', 'maison').reason).toBe('soon');
    const cat = adult('cat');
    p.animals.push(cat);
    expect(buyEquipment(p, 'autoLitter', 'maison').ok).toBe(true);
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

import { missingTool, buyTool } from '../src/sim/tools.js';
describe('matériel', () => {
  it('il faut une tondeuse pour tondre, la brosse est offerte', () => {
    const p = createProfile('A', 'manage');
    expect(missingTool(p, 'brush')).toBeNull();
    expect(missingTool(p, 'shear')).toBe('shears');
    // (moutons pas encore proposés : la tondeuse ne se vend qu'à une partie qui a déjà un mouton)
    if (!isOffered('sheep')) expect(buyTool(p, 'shears').reason).toBe('soon');
    p.animals.push(adult('sheep'));
    expect(buyTool(p, 'shears').ok).toBe(true);
    expect(missingTool(p, 'shear')).toBeNull();
    expect(p.money).toBe(420);
  });
});

describe('aides et animaux malades', () => {
  it("le pet-sitter ne s'acharne pas à jouer avec un chien malade : il nourrit le chat", () => {
    const p = createProfile('A');
    hireHelper(p, 'petsitter', 'maison', rng());
    const helper = p.helpers.find((h) => h.type === 'petsitter');
    const dog = adult('dog');
    dog.sick = 'flu';
    dog.needs.exercise = 20; // le besoin le plus bas, mais « jouer » est impossible avec un malade
    const cat = adult('cat');
    cat.needs.hunger = 40;
    const task = helperTask(p, helper, [dog, cat]);
    expect(task).toMatchObject({ kind: 'care', animalId: cat.id, action: 'feed' });
    expect(doHelperTask(p, task, [dog, cat], helper).ok).toBe(true);
  });

  it('le vétérinaire embauché compte comme une visite chez le vétérinaire', () => {
    const p = createProfile('A');
    p.clock = 24 * 60 * 4 + 600; // 5e jour, 10 h
    hireHelper(p, 'vet', 'maison', rng());
    const helper = p.helpers.find((h) => h.type === 'vet');
    const cow = adult('cow');
    cow.sick = 'flu';
    const task = helperTask(p, helper, [cow]);
    expect(task).toMatchObject({ kind: 'cure', animalId: cow.id });
    doHelperTask(p, task, [cow], helper);
    expect(cow.sick).toBeNull();
    expect(cow.lastVet).toBe(dayOf(p.clock));
    expect(dayOf(p.clock)).toBeGreaterThan(1);
  });
});
