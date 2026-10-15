import { describe, it, expect } from 'vitest';
import {
  PREP_ITEMS, RIBBON_COLORS, checklistFor, prepItems, beautyData, allureOf, notePrep, freshness, isFresh, itemDone,
  weatherWear, clearPrep, checklist, isReady, beautyScore, presentationSteps, ringWindow, gaugeQuality, trotPar,
  fidgetChance, judgeMarks, rivalBeautyPoints, nowHours,
} from '../src/sim/beauty.js';
import { competitionsAt, rivals, ranking, placementAward, practiceAward, eligibility, COMPETITION_TYPES } from '../src/sim/activities.js';
import { createAnimal } from '../src/sim/animal.js';
import { OBJECTIVES } from '../src/sim/objectives.js';
import { QUEST_GUIDE, QUEST_STEPS } from '../src/sim/tutorial.js';

const make = (species = 'horse') => {
  const a = createAnimal({ species, ageDays: 2000, rng: () => 0.5 });
  a.needs.hygiene = 50;
  a.needs.grooming = 50;
  a.needs.energy = 90;
  return a;
};

describe('préparation pour le concours', () => {
  it('chaque espèce a une liste avec des gestes connus', () => {
    for (const sp of ['horse', 'dog', 'cat', 'rabbit', 'sheep', 'goat', 'cow']) {
      const c = checklistFor(sp);
      expect(c.required.length).toBeGreaterThanOrEqual(3);
      for (const item of [...c.required, ...c.bonus]) expect(PREP_ITEMS[item], item).toBeTruthy();
    }
    expect(prepItems(make('horse'))).toContain('braid');
    expect(prepItems(make('dog'))).toContain('bow');
    expect(prepItems(make('rabbit'))).toContain('fluff');
  });

  it("l'allure est stable pour un même animal, entre 60 et 100", () => {
    const a = make();
    const v = allureOf(a);
    expect(v).toBeGreaterThanOrEqual(60);
    expect(v).toBeLessThanOrEqual(100);
    expect(allureOf(a)).toBe(v);
    expect(beautyData(a).allure).toBe(v);
  });

  it('un geste tient un certain temps puis se défraîchit', () => {
    const a = make();
    expect(isFresh(a, 'wash', 10)).toBe(false);
    notePrep(a, 'wash', 10, 1);
    expect(isFresh(a, 'wash', 20)).toBe(true);
    expect(freshness(a, 'wash', 20)).toBeGreaterThan(10);
    expect(isFresh(a, 'wash', 10 + 24 * 1.2)).toBe(false);
    // Les tresses tiennent 2 jours
    notePrep(a, 'braid', 10, 0.5, { color: 'pink' });
    expect(a.beauty.prep.braid.color).toBe('pink');
    expect(isFresh(a, 'braid', 10 + 47)).toBe(true);
    expect(isFresh(a, 'braid', 10 + 49)).toBe(false);
    // Couleur inconnue : rouge par défaut
    notePrep(a, 'bow', 0, 1, { color: 'rainbow' });
    expect(a.beauty.prep.bow.color).toBe('red');
    expect(notePrep(a, 'unknown', 0)).toBeNull();
  });

  it('un soin bien fait tient un peu plus longtemps', () => {
    const a = make();
    const b = make();
    notePrep(a, 'shine', 0, 1);
    notePrep(b, 'shine', 0, 0.4);
    expect(freshness(a, 'shine', 0)).toBeGreaterThan(freshness(b, 'shine', 0));
  });

  it('la pluie abîme la toilette et le lustrage', () => {
    const a = make();
    notePrep(a, 'wash', 0, 1);
    notePrep(a, 'shine', 0, 1);
    notePrep(a, 'braid', 0, 1);
    const before = freshness(a, 'wash', 5);
    expect(weatherWear(a, 'clear', 2)).toBe(false);
    expect(weatherWear(a, 'rain', 2)).toBe(true);
    expect(freshness(a, 'wash', 5)).toBeLessThan(before);
    expect(freshness(a, 'braid', 5)).toBeGreaterThan(freshness(a, 'wash', 5)); // les tresses résistent mieux
    clearPrep(a);
    expect(a.beauty.prep).toEqual({});
    expect(a.beauty.allure).toBeDefined();
  });

  it("la liste à cocher accepte aussi un animal déjà tout propre", () => {
    const a = make('dog');
    expect(itemDone(a, 'wash', 0)).toBe(false);
    a.needs.hygiene = 95;
    expect(itemDone(a, 'wash', 0)).toBe(true);
    const list = checklist(a, 0);
    expect(list.find((l) => l.item === 'wash').done).toBe(true);
    expect(list.find((l) => l.item === 'nails').required).toBe(false);
    expect(isReady(a, 0)).toBe(false);
    for (const item of checklistFor('dog').required) notePrep(a, item, 0, 1, { color: 'blue' });
    expect(isReady(a, 0)).toBe(true);
    expect(isReady(a, 60)).toBe(false); // le lendemain soir, le bain et le lustrage sont vieux
  });
});

describe('note de beauté', () => {
  it('monte avec la préparation, la robe, le poids et le lien', () => {
    const a = make('horse');
    const base = beautyScore(a, 0);
    expect(base.score).toBeGreaterThanOrEqual(0);
    expect(base.score).toBeLessThanOrEqual(100);
    for (const item of prepItems(a)) notePrep(a, item, 0, 1, { color: 'red' });
    const prepped = beautyScore(a, 0);
    expect(prepped.score).toBeGreaterThan(base.score);
    expect(prepped.parts.presentation).toBe(1);
    a.needs.hygiene = 100;
    a.needs.grooming = 100;
    a.bond = 100;
    a.skills.obedience = 100;
    const shiny = beautyScore(a, 0);
    expect(shiny.score).toBeGreaterThan(prepped.score);
    a.weight = 90;
    expect(beautyScore(a, 0).score).toBeLessThan(shiny.score);
    a.weight = 50;
    a.sick = 'cold';
    expect(beautyScore(a, 0).score).toBeLessThan(shiny.score);
  });

  it("l'horloge du profil donne l'heure absolue", () => {
    expect(nowHours({ clock: 8 * 60 })).toBe(8);
    expect(nowHours(null)).toBe(0);
  });
});

describe('présentation au juge', () => {
  it('les chevaux et les chiens trottent, les petits animaux posent sur la table', () => {
    expect(presentationSteps('horse')).toEqual(['walk', 'halt', 'stand', 'turn', 'trot']);
    expect(presentationSteps('cat').at(-1)).toBe('pose');
  });

  it('jauges : zone verte au milieu, qualité qui baisse en s\'éloignant', () => {
    expect(gaugeQuality(0.5, 0.2)).toBe(1);
    expect(gaugeQuality(0.58, 0.2)).toBeGreaterThan(0.6);
    expect(gaugeQuality(0.9, 0.2)).toBe(0);
    const a = make('dog');
    const w0 = ringWindow(a);
    a.bond = 100;
    a.skills.obedience = 100;
    expect(ringWindow(a)).toBeGreaterThan(w0);
    expect(fidgetChance(a)).toBeLessThan(fidgetChance(make('dog')));
    expect(trotPar(20)).toBe(8);
  });

  it('le juge note sur 100 et commente ce qui manque', () => {
    const a = make('horse');
    const bad = judgeMarks(a, 0, { walk: 0.2, halt: 0, stand: 0, turn: 0, trot: 0.2 });
    expect(bad.points).toBeLessThan(55);
    expect(bad.stars).toBe(1);
    expect(['prep', 'presentation', 'movement', 'behaviour', 'condition', 'weight']).toContain(bad.comment);
    for (const item of prepItems(a)) notePrep(a, item, 0, 1);
    a.needs.hygiene = 100;
    a.needs.grooming = 100;
    a.bond = 90;
    a.skills.obedience = 80;
    const good = judgeMarks(a, 0, { walk: 1, halt: 1, stand: 1, turn: 1, trot: 1 });
    expect(good.points).toBeGreaterThanOrEqual(80);
    expect(good.points).toBeLessThanOrEqual(100);
    expect(good.stars).toBe(3);
    expect(good.comment).toBe('perfect');
    expect(good.presentation + good.condition + good.movement + good.behaviour).toBeCloseTo(good.points, 0);
    // Un animal trop gros : le juge le dit
    a.weight = 95;
    expect(judgeMarks(a, 0, { walk: 1, halt: 1, stand: 1, turn: 1, trot: 1 }).comment).toBe('weight');
  });
});

describe('concours de beauté dans le calendrier', () => {
  it('fait partie de la rotation et a des concurrents avec des points', () => {
    expect(COMPETITION_TYPES).toContain('beauty');
    const comps = competitionsAt('maison', true, 1, 15);
    const c = comps.find((x) => x.type === 'beauty');
    expect(c).toBeTruthy();
    const rv = rivals(c);
    expect(rv.length).toBe(5);
    for (const r of rv) {
      expect(r.points).toBeGreaterThanOrEqual(40);
      expect(r.points).toBeLessThanOrEqual(95);
      expect(['horse', 'dog', 'cat', 'rabbit', 'sheep']).toContain(r.species);
    }
    expect(rivals(c)).toEqual(rv);
    expect(ranking(c, { points: 100 }, rv).rank).toBe(1);
    expect(ranking(c, { points: 1 }, rv).rank).toBe(6);
    expect(placementAward(c, 1).kind).toBe('trophy');
    expect(practiceAward('beauty', 3)).toEqual({ kind: 'ribbon', tier: 'red', money: 0 });
    expect(practiceAward('beauty', 2)).toBeNull();
  });

  it('tous les animaux adultes en forme peuvent participer', () => {
    for (const sp of ['horse', 'cat', 'sheep']) expect(eligibility(make(sp), 'beauty')).toBeNull();
    const baby = createAnimal({ species: 'dog', ageDays: 0 });
    expect(eligibility(baby, 'beauty')).toBe('baby');
  });

  it('les points des concurrents montent avec leur niveau', () => {
    expect(rivalBeautyPoints(1, () => 0)).toBe(85);
    expect(rivalBeautyPoints(0, () => 0)).toBe(40);
    expect(Object.keys(RIBBON_COLORS).length).toBeGreaterThanOrEqual(5);
  });

  it('les quêtes de beauté ont un guide et des étapes', () => {
    for (const id of ['beautyPrep1', 'beautyBraid1', 'beauty1']) {
      expect(OBJECTIVES.find((o) => o.id === id)).toBeTruthy();
      expect(QUEST_GUIDE[id]).toBeTruthy();
      expect(QUEST_STEPS[id]).toBeTruthy();
    }
  });
});
