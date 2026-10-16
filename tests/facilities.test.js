import { describe, it, expect } from 'vitest';
import {
  defaultFacilities, ensureFacilities, boxCount, BASE_BOXES, MAX_BOXES, cleanliness, condition, tickFacilities,
  canChore, doChore, repair, repairCost, canBuyUpgrade, buyUpgrade, assignBox, boxOccupants, releaseBox, stallDirt,
  applyStallEffects, hasUpgrade, STRAW_COST,
} from '../src/sim/facilities.js';
import { createProfile } from '../src/sim/profile.js';
import { xpForLevel } from '../src/sim/progress.js';

const horse = (id, extra = {}) => ({ id, species: 'horse', needs: { hunger: 80, thirst: 50, hygiene: 80, energy: 50, exercise: 80, affection: 80, grooming: 80 }, ...extra });

describe('bâtiments à entretenir', () => {
  it('un nouveau profil a des bâtiments propres et en bon état', () => {
    const p = createProfile('Léa');
    expect(p.facilities.boxes).toHaveLength(MAX_BOXES);
    expect(cleanliness(p.facilities, 'stable')).toBe(100);
    expect(condition(p.facilities, 'house')).toBe(100);
    expect(boxCount(p.facilities)).toBe(BASE_BOXES);
  });

  it('les vieilles sauvegardes sont complétées', () => {
    const p = { facilities: { stable: { wear: 40, rooms: {}, upgrades: ['lights'] }, boxes: [{ clean: 10 }] } };
    const f = ensureFacilities(p);
    expect(f.stable.wear).toBe(40);
    expect(f.stable.rooms.aisle).toBe(100);
    expect(f.house.rooms.kitchen).toBe(100);
    expect(f.boxes[0]).toEqual({ clean: 10, straw: 100 });
    expect(f.boxes).toHaveLength(MAX_BOXES);
    expect(ensureFacilities({}).pen.rooms.fold).toBe(100);
  });

  it('un box occupé se salit, un box vide reste propre', () => {
    const f = defaultFacilities();
    tickFacilities(f, 10, { stalled: [0], horses: 1 });
    expect(f.boxes[0].clean).toBe(50);
    expect(f.boxes[1].clean).toBe(100);
    expect(f.boxes[0].straw).toBeLessThan(f.boxes[1].straw);
    expect(cleanliness(f, 'stable')).toBeLessThan(100);
    expect(f.stable.wear).toBeLessThan(100);
  });

  it('les tapis ralentissent la saleté, les animaux salissent la maison', () => {
    const a = defaultFacilities();
    const b = defaultFacilities();
    b.stable.upgrades.push('mats');
    tickFacilities(a, 5, { stalled: [0], pets: 0 });
    tickFacilities(b, 5, { stalled: [0], pets: 3 });
    expect(b.boxes[0].clean).toBeGreaterThan(a.boxes[0].clean);
    expect(b.house.rooms.living).toBeLessThan(a.house.rooms.living);
  });

  it('un palefrenier garde les box à peu près propres', () => {
    const f = defaultFacilities();
    f.boxes[0].clean = 20;
    tickFacilities(f, 10, { stalled: [0], helpers: { stable: true } });
    expect(f.boxes[0].clean).toBeGreaterThanOrEqual(75);
  });

  it('curer et changer la paille', () => {
    const p = createProfile('Tom', 'manage');
    p.facilities.boxes[1].clean = 30;
    p.facilities.boxes[1].straw = 20;
    expect(doChore(p, 'muck', 1)).toMatchObject({ ok: true, gain: 70 });
    expect(doChore(p, 'muck', 1)).toMatchObject({ ok: false, reason: 'alreadyClean' });
    const money = p.money;
    expect(doChore(p, 'straw', 1).ok).toBe(true);
    expect(p.money).toBe(money - STRAW_COST);
    expect(doChore(p, 'muck', 7)).toMatchObject({ ok: false, reason: 'locked' });
    p.facilities.house.rooms.kitchen = 10;
    expect(doChore(p, 'kitchen').ok).toBe(true);
    expect(p.facilities.house.rooms.kitchen).toBe(100);
  });

  it('canChore prévient avant le mini-jeu, sans rien changer ni dépenser', () => {
    const p = createProfile('Tom', 'manage');
    p.facilities.boxes[0].clean = 40;
    p.facilities.boxes[0].straw = 40;
    p.facilities.house.rooms.living = 50;
    const money = p.money;
    expect(canChore(p, 'muck', 0)).toEqual({ ok: true });
    expect(canChore(p, 'straw', 0)).toEqual({ ok: true });
    expect(canChore(p, 'living')).toEqual({ ok: true });
    expect(canChore(p, 'kitchen')).toMatchObject({ ok: false, reason: 'alreadyClean' });
    expect(canChore(p, 'muck', 7)).toMatchObject({ ok: false, reason: 'locked' });
    expect(canChore(p, 'fold')).toMatchObject({ ok: false, reason: 'alreadyClean' });
    expect(canChore(p, 'nope')).toMatchObject({ ok: false, reason: 'unknown' });
    p.money = 0;
    expect(canChore(p, 'straw', 0)).toMatchObject({ ok: false, reason: 'money' });
    expect(canChore(p, 'muck', 0)).toEqual({ ok: true }); // curer est gratuit
    expect(p.money).toBe(0);
    expect(p.facilities.boxes[0].clean).toBe(40);
    expect(p.facilities.house.rooms.living).toBe(50);
    expect(money).toBeGreaterThan(0);
  });

  it('réparer coûte selon l\'usure, gratuit en bac à sable', () => {
    const p = createProfile('Tom', 'manage');
    p.facilities.stable.wear = 60;
    expect(repairCost(p.facilities, 'stable')).toBe(80);
    p.money = 50;
    expect(repair(p, 'stable')).toMatchObject({ ok: false, reason: 'money' });
    p.money = 100;
    expect(repair(p, 'stable').ok).toBe(true);
    expect(p.money).toBe(20);
    const s = createProfile('Zoé');
    s.facilities.house.wear = 10;
    expect(repair(s, 'house').ok).toBe(true);
    expect(repair(s, 'house')).toMatchObject({ ok: false, reason: 'notNeeded' });
  });

  it('les améliorations suivent le niveau et l\'argent', () => {
    const p = createProfile('Tom', 'manage');
    p.money = 1000;
    expect(canBuyUpgrade(p, 'stable', 'boxes1')).toMatchObject({ ok: false, reason: 'level', level: 3 });
    p.xp = xpForLevel(6);
    expect(canBuyUpgrade(p, 'stable', 'boxes2')).toMatchObject({ ok: false, reason: 'requires' });
    expect(buyUpgrade(p, 'stable', 'boxes1').ok).toBe(true);
    expect(p.money).toBe(700);
    expect(boxCount(p.facilities)).toBe(6);
    expect(canBuyUpgrade(p, 'stable', 'boxes1').reason).toBe('owned');
    p.money = 10;
    expect(canBuyUpgrade(p, 'stable', 'boxes2').reason).toBe('money');
    const s = createProfile('Zoé');
    s.xp = xpForLevel(6);
    expect(buyUpgrade(s, 'stable', 'boxes1').ok).toBe(true);
    expect(buyUpgrade(s, 'stable', 'boxes2').ok).toBe(true);
    expect(boxCount(s.facilities)).toBe(MAX_BOXES);
  });
});

describe('box des chevaux', () => {
  it('chaque cheval reçoit son propre box et le garde', () => {
    const f = defaultFacilities();
    const hs = [horse('a'), horse('b', { box: 0 }), horse('c')];
    expect(assignBox(f, hs, hs[0])).toBe(1);
    expect(assignBox(f, hs, hs[0])).toBe(1);
    expect(assignBox(f, hs, hs[2])).toBe(2);
    expect(boxOccupants(f, hs).map((x) => x?.id ?? null)).toEqual(['b', 'a', 'c', null]);
    expect(assignBox(f, hs, hs[2], 3)).toBe(3);
    expect(assignBox(f, hs, hs[2], 0)).toBe(3); // déjà pris : il garde le sien
  });

  it('quand l\'écurie est pleine, il n\'y a plus de box', () => {
    const f = defaultFacilities();
    const hs = Array.from({ length: 5 }, (_, i) => horse(`h${i}`));
    hs.slice(0, 4).forEach((h) => assignBox(f, hs, h));
    expect(assignBox(f, hs, hs[4])).toBeNull();
    releaseBox(hs[0]);
    expect(assignBox(f, hs, hs[4])).toBe(0);
  });

  it('un box sale rend le cheval moins content, l\'abreuvoir le fait boire', () => {
    const f = defaultFacilities();
    const a = horse('a', { box: 0, stalled: true });
    expect(stallDirt(f, a)).toBe(0);
    f.boxes[0].clean = 0;
    f.boxes[0].straw = 0;
    expect(stallDirt(f, a)).toBe(5);
    expect(stallDirt(f, { ...a, stalled: false })).toBe(0);
    applyStallEffects(f, a, 2);
    expect(a.needs.affection).toBe(77);
    expect(a.needs.thirst).toBe(50);
    f.stable.upgrades.push('waterers', 'heater');
    expect(hasUpgrade(f, 'stable', 'waterers')).toBe(true);
    applyStallEffects(f, a, 1, { cold: true });
    expect(a.needs.thirst).toBe(70);
    expect(a.needs.energy).toBe(51.5);
  });
});
