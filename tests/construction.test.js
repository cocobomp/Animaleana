import { describe, it, expect } from 'vitest';
import {
  STRUCTURES, footprint, validatePlacement, build, moveStructure, demolish, canBuild, canAssign, assign, residents,
  homeZone, gateOf, enclosureOf, comfortBonus, applyComfort, spaceSummary, structureAtPoint, homeOf, frontSide, toWorld, refundOf,
} from '../src/sim/construction.js';
import { createProfile } from '../src/sim/profile.js';
import { createAnimal } from '../src/sim/animal.js';
import { UNLOCKS, xpForLevel } from '../src/sim/progress.js';
import { buildingActions } from '../src/sim/buildings.js';

const manage = (money = 5000) => {
  const p = createProfile('A', 'manage');
  p.money = money;
  p.xp = xpForLevel(12);
  return p;
};
const flat = { heightAt: () => 0, isWater: () => false };

describe('construction : catalogue', () => {
  it('chaque construction de la progression est au catalogue, avec un prix et un genre', () => {
    for (const k of ['kennel', 'hutch', 'paddockSmall', 'shelter', 'paddockLarge', 'pasture', 'barn', 'arena', 'newStable', 'ranch']) {
      expect(STRUCTURES[k]).toBeTruthy();
      expect(UNLOCKS[k]).toBeGreaterThan(1);
    }
    for (const def of Object.values(STRUCTURES)) {
      expect(def.price).toBeGreaterThan(0);
      expect(['f', 'm']).toContain(def.g);
    }
  });

  it('la rotation échange largeur et profondeur et tourne l\'entrée', () => {
    expect(footprint('newStable', 0, 0, 0)).toMatchObject({ hw: 8, hd: 3.5 });
    expect(footprint('newStable', 0, 0, 1)).toMatchObject({ hw: 3.5, hd: 8 });
    expect([0, 1, 2, 3].map(frontSide)).toEqual(['+z', '+x', '-z', '-x']);
    const s = { x: 10, z: 10, rot: 1 };
    expect(toWorld(s, 0, 2)).toEqual({ x: 12, z: 10 });
  });
});

describe('construction : placement', () => {
  it('on ne construit pas sur le cœur de la ferme ni hors de la carte', () => {
    expect(validatePlacement('kennel', 0, -5, 0, flat)).toMatchObject({ ok: false, reason: 'core' });
    expect(validatePlacement('kennel', 14, 35, 0, flat).reason).toBe('core');
    expect(validatePlacement('kennel', 95, 0, 0, flat).reason).toBe('bounds');
    expect(validatePlacement('kennel', 40, 0, 0, flat).ok).toBe(true);
  });

  it('pas de chevauchement avec un bâtiment, une autre structure ou devant une barrière', () => {
    const colliders = [{ x: 40, z: 0, hw: 3, hd: 3 }];
    expect(validatePlacement('kennel', 41, 1, 0, { ...flat, colliders }).reason).toBe('overlap');
    const structures = [{ id: 'a', type: 'paddockSmall', x: 50, z: -30, rot: 0 }];
    expect(validatePlacement('kennel', 52, -28, 0, { ...flat, structures }).reason).toBe('overlap');
    // Juste devant l'ouverture du paddock (côté +z) : interdit, il faut pouvoir passer.
    expect(validatePlacement('kennel', 50, -23.5, 0, { ...flat, structures }).reason).toBe('overlap');
    // Un peu plus loin sur le côté : d'accord.
    expect(validatePlacement('kennel', 60, -30, 0, { ...flat, structures }).ok).toBe(true);
    // On peut reposer une structure qu'on déplace à sa propre place.
    expect(validatePlacement('paddockSmall', 50, -30, 0, { ...flat, structures, ignore: 'a' }).ok).toBe(true);
  });

  it('ni dans l\'eau ni sur une pente trop raide', () => {
    expect(validatePlacement('barn', 50, 50, 0, { isWater: (x) => x > 52, heightAt: () => 0 }).reason).toBe('water');
    expect(validatePlacement('barn', 50, 50, 0, { heightAt: (x) => x * 0.5 }).reason).toBe('slope');
    // Un enclos supporte un peu plus de pente qu'un bâtiment.
    expect(validatePlacement('paddockSmall', 50, 50, 0, { heightAt: (x) => x * 0.2 }).ok).toBe(true);
  });
});

describe('construction : achats', () => {
  it('niveau requis, prix, déplacement gratuit et démolition remboursée à moitié', () => {
    const p = createProfile('B', 'manage');
    expect(canBuild(p, 'ranch')).toMatchObject({ ok: false, reason: 'locked', level: 10 });
    p.xp = xpForLevel(12);
    p.money = 100;
    expect(canBuild(p, 'barn').reason).toBe('money');
    p.money = 1000;
    const r = build(p, 'barn', 'maison', 40.4, 20.6, 5);
    expect(r.ok).toBe(true);
    expect(r.structure).toMatchObject({ x: 40, z: 21, rot: 1 });
    expect(p.money).toBe(100);
    moveStructure(p, r.structure.id, 60, 20, 2);
    expect(p.money).toBe(100);
    expect(structureAtPoint(p, 'maison', 62, 21)?.id).toBe(r.structure.id);
    const d = demolish(p, r.structure.id);
    expect(d.refund).toBe(refundOf('barn'));
    expect(p.money).toBe(100 + 450);
    expect(p.structures).toHaveLength(0);
  });

  it('en bac à sable tout est gratuit, mais le niveau compte quand même', () => {
    const p = createProfile('C', 'sandbox');
    expect(canBuild(p, 'kennel').reason).toBe('locked');
    expect(canBuild(p, 'bench').ok).toBe(true);
    p.xp = xpForLevel(2);
    expect(build(p, 'kennel', 'maison', 40, 0).ok).toBe(true);
    expect(p.money).toBe(500);
  });
});

describe('construction : habitants', () => {
  it('une niche pour les chiens, avec une capacité limitée', () => {
    const p = manage();
    const s = build(p, 'kennel', 'maison', 40, 0).structure;
    const dogs = [1, 2, 3].map(() => createAnimal({ species: 'dog' }));
    const cat = createAnimal({ species: 'cat' });
    for (const a of [...dogs, cat]) {
      a.location = 'maison';
      p.animals.push(a);
    }
    expect(canAssign(p, cat, s).reason).toBe('species');
    expect(assign(p, dogs[0], s).ok).toBe(true);
    expect(canAssign(p, dogs[0], s).reason).toBe('already');
    expect(assign(p, dogs[1], s).ok).toBe(true);
    expect(assign(p, dogs[2], s).reason).toBe('full');
    expect(residents(p, s.id)).toHaveLength(2);
    expect(homeOf(p, dogs[0])).toBe(s);
    dogs[1].location = 'alpes';
    expect(homeOf(p, dogs[1])).toBeNull();
    demolish(p, s.id);
    expect(dogs[0].homeId).toBeUndefined();
  });

  it('le ranch compte pour les chevaux et le bétail', () => {
    const p = manage();
    build(p, 'ranch', 'maison', 50, -40);
    build(p, 'kennel', 'maison', 40, 0);
    const sum = spaceSummary(p, 'maison');
    expect(sum.horse.cap).toBe(12);
    expect(sum.livestock.cap).toBe(12);
    expect(sum.dog.cap).toBe(2);
    expect(sum.rabbit.cap).toBe(0);
    const horse = createAnimal({ species: 'horse' });
    horse.location = 'maison';
    p.animals.push(horse);
    const ranch = p.structures[0];
    expect(assign(p, horse, ranch).ok).toBe(true);
    expect(spaceSummary(p, 'maison').horse.used).toBe(1);
  });

  it('dormir à la maison redonne plus d\'énergie', () => {
    const p = manage();
    const s = build(p, 'newStable', 'maison', 50, -40).structure;
    const a = createAnimal({ species: 'horse' });
    a.location = 'maison';
    p.animals.push(a);
    assign(p, a, s);
    a.needs.energy = 30;
    expect(comfortBonus('newStable', 2).energy).toBe(24);
    expect(applyComfort(p, [a], 2, () => true)).toBe(1);
    expect(a.needs.energy).toBe(54);
    expect(applyComfort(p, [a], 2, () => false)).toBe(0);
  });

  it('zones de vie et ouvertures des enclos', () => {
    const pad = { id: 'p', type: 'paddockLarge', x: 50, z: -40, rot: 1 };
    expect(gateOf(pad)).toEqual({ side: '+x', at: -40, width: 4 });
    expect(enclosureOf(pad)).toMatchObject({ id: 'p', hw: 8, hd: 10 });
    const z = homeZone(pad);
    expect(z).toMatchObject({ x: 50, z: -40 });
    expect(z.r).toBeGreaterThan(4);
    // La zone d'une niche est devant son entrée.
    const k = homeZone({ type: 'kennel', x: 40, z: 0, rot: 0 });
    expect(k.z).toBeGreaterThan(1);
    expect(enclosureOf({ type: 'kennel', x: 0, z: 0, rot: 0 })).toBeNull();
  });
});

describe('construction : feuilles d\'actions', () => {
  const find = (list, id) => list.find((a) => a.id === id);
  it('sans habitant on ne peut pas nourrir, mais on peut toujours déplacer ou démolir', () => {
    const list = buildingActions('con_home', { hour: 10, count: { residents: 0, droppings: 0, horse: 0 } });
    expect(find(list, 'conFeed')).toMatchObject({ enabled: false, reason: 'noResidents' });
    expect(find(list, 'conMove').enabled).toBe(true);
    expect(find(list, 'conDemolish').enabled).toBe(true);
  });
  it('la carrière : entraînement le jour seulement', () => {
    const c = { residents: 0, droppings: 0, horse: 2 };
    expect(find(buildingActions('con_arena', { hour: 10, count: c }), 'conTrain').enabled).toBe(true);
    expect(find(buildingActions('con_arena', { hour: 22, count: c }), 'conTrain').reason).toBe('night');
    expect(buildingActions('con_decor', { hour: 10, count: c }).map((a) => a.id)).toEqual(['conMove', 'conDemolish']);
  });
});
