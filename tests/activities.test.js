import { describe, it, expect } from 'vitest';
import {
  JUMP_COURSE, AGILITY_COURSE, TRAIL, SHOWGROUND, approach, alignment, takeoffQuality, jumpChance, jumpingResult, timeFaults,
  parTime, courseLength, trailCollectibles, trailResult, agilityResult, agilityChance, commandQuality, showResult, trickPoints,
  trickWindow, knownTricks, competitionsAt, entryBlock, eligibility, rivals, ranking, placementAward, practiceAward,
  activityData, addAward, awardCounts, recordBest, showgroundFlat, inShowground, activitySkillGain, showAudience,
} from '../src/sim/activities.js';
import { createAnimal } from '../src/sim/animal.js';
import { createProfile } from '../src/sim/profile.js';

const horse = () => {
  const a = createAnimal({ species: 'horse', ageDays: 80, rng: () => 0.5 });
  a.needs.energy = 90;
  a.gear = { bridle: { item: 'bridle' } };
  return a;
};

describe('terrain de concours', () => {
  it('est plat dans la carrière et redevient normal plus loin', () => {
    expect(showgroundFlat(SHOWGROUND.x, SHOWGROUND.z)).toBe(1);
    expect(showgroundFlat(SHOWGROUND.x + SHOWGROUND.hw + 6, SHOWGROUND.z)).toBe(1);
    expect(showgroundFlat(SHOWGROUND.x, SHOWGROUND.z + 60)).toBe(0);
    expect(inShowground(SHOWGROUND.x + 3, SHOWGROUND.z - 2)).toBe(true);
    expect(inShowground(0, 0)).toBe(false);
  });

  it('les obstacles tiennent dans la carrière et sont bien espacés', () => {
    for (const course of [JUMP_COURSE, AGILITY_COURSE]) {
      const obs = course.obstacles;
      expect(obs.length).toBeGreaterThanOrEqual(6);
      for (const o of obs) {
        expect(Math.abs(o.x)).toBeLessThan(SHOWGROUND.hw - 1.5);
        expect(Math.abs(o.z)).toBeLessThan(SHOWGROUND.hd - 1.5);
      }
      for (let i = 1; i < obs.length; i++) {
        expect(Math.hypot(obs[i].x - obs[i - 1].x, obs[i].z - obs[i - 1].z)).toBeGreaterThan(5.5);
      }
    }
    expect(courseLength(JUMP_COURSE)).toBeGreaterThan(70);
    expect(parTime(JUMP_COURSE)).toBeGreaterThan(15);
  });
});

describe('saut d\'obstacles', () => {
  const o = JUMP_COURSE.obstacles[0]; // vers l'ouest
  it('repère d\'approche et alignement', () => {
    const a = approach(o, o.x + 2, o.z); // 2 m avant (on arrive de l'est)
    expect(a.u).toBeCloseTo(-2);
    expect(Math.abs(a.v)).toBeLessThan(1e-9);
    expect(alignment(o, o.heading)).toBe(1);
    expect(alignment(o, o.heading + Math.PI / 2)).toBe(0);
    expect(takeoffQuality(-1.8)).toBe(1);
    expect(takeoffQuality(-5)).toBe(0);
  });

  it('un bon sauteur bien aligné réussit plus souvent', () => {
    const weak = jumpChance({ skill: 10, height: 1, align: 0.5, timing: 0.3 });
    const strong = jumpChance({ skill: 80, height: 1, align: 1, timing: 1 });
    expect(strong).toBeGreaterThan(weak + 0.3);
    expect(jumpChance({ skill: 50, boots: true })).toBeGreaterThan(jumpChance({ skill: 50, boots: false }));
    expect(jumpChance({ skill: 0, height: 2, align: 0, timing: 0, energy: 5 })).toBeGreaterThanOrEqual(0.12);
  });

  it('compte les pénalités', () => {
    expect(timeFaults(40, 40)).toBe(0);
    expect(timeFaults(41, 40)).toBe(1);
    expect(timeFaults(49, 40)).toBe(3);
    const clear = jumpingResult({ rails: 0, refusals: 0, time: 30, par: 40 });
    expect(clear).toMatchObject({ clear: true, total: 0, stars: 3 });
    const bad = jumpingResult({ rails: 2, refusals: 1, time: 45, par: 40 });
    expect(bad.total).toBe(12 + 2);
    expect(bad.stars).toBe(1);
  });
});

describe('balade', () => {
  it('objets le long du chemin, toujours les mêmes', () => {
    const pts = [TRAIL.start, ...TRAIL.checkpoints];
    const a = trailCollectibles(pts, 'x');
    expect(a.length).toBe((pts.length - 2) * 2);
    expect(trailCollectibles(pts, 'x')).toEqual(a);
  });
  it('les points dépendent des balises, objets et photos', () => {
    const full = trailResult({ checkpoints: 9, totalCheckpoints: 9, collected: 16, totalCollectibles: 16, photos: 4, time: 200 });
    expect(full.stars).toBe(3);
    const little = trailResult({ checkpoints: 9, totalCheckpoints: 9, collected: 0, totalCollectibles: 16, photos: 0, time: 200 });
    expect(little.points).toBeLessThan(full.points);
  });
});

describe('agility', () => {
  it('le bon moment pour commander', () => {
    expect(commandQuality(0.75)).toBe(1);
    expect(commandQuality(0.1)).toBeLessThan(0.3);
  });
  it('résultat et chances', () => {
    const dog = createAnimal({ species: 'dog', ageDays: 40 });
    expect(agilityChance(dog, 'tunnel', 0)).toBeGreaterThan(0.9);
    dog.skills.jump = 90;
    expect(agilityChance(dog, 'hurdle', 1)).toBeGreaterThan(agilityChance({ ...dog, skills: { ...dog.skills, jump: 5 } }, 'hurdle', 1));
    expect(agilityResult({ faults: 1, refusals: 1, time: 30, par: 28 }).total).toBe(12);
    expect(agilityResult({ time: 20, par: 28 }).clear).toBe(true);
  });
});

describe('spectacles', () => {
  it('les tours appris et la fenêtre de timing', () => {
    const dog = createAnimal({ species: 'dog', ageDays: 40 });
    dog.tricks = { sit: 100, paw: 60 };
    expect(knownTricks(dog)).toEqual(['sit']);
    const w1 = trickWindow(dog);
    dog.skills.obedience = 90;
    expect(trickWindow(dog)).toBeGreaterThan(w1);
  });
  it('la variété et la qualité font les étoiles', () => {
    expect(trickPoints(1)).toBe(10);
    expect(trickPoints(0)).toBe(0);
    const perfect = showResult([
      { animalId: 'a', trick: 'sit', points: 10 }, { animalId: 'b', trick: 'bow', points: 10 }, { animalId: 'c', trick: 'roll', points: 10 },
    ]);
    expect(perfect.stars).toBe(5);
    const solo = showResult([{ animalId: 'a', trick: 'sit', points: 10 }]);
    expect(solo.stars).toBeLessThanOrEqual(3);
    const poor = showResult([{ animalId: 'a', trick: 'sit', points: 2 }, { animalId: 'a', trick: 'sit', points: 3 }, { animalId: 'a', trick: 'sit', points: 2 }]);
    expect(poor.stars).toBeLessThan(perfect.stars);
    expect(showAudience(5, 3).earnings).toBeGreaterThan(showAudience(1, 3).earnings);
  });
});

describe('concours', () => {
  it('un calendrier régulier à la maison et en voyage', () => {
    const home = competitionsAt('maison', true, 1, 12);
    expect(home.length).toBe(4);
    expect(new Set(home.map((c) => c.type)).size).toBeGreaterThan(2);
    const away = competitionsAt('alpes', false, 1, 12);
    expect(away.length).toBe(6);
    expect(competitionsAt('maison', true, 1, 12)).toEqual(home);
  });

  it('inscription seulement le jour du concours, pendant les heures d\'ouverture, une fois', () => {
    const c = competitionsAt('maison', true, 1, 6)[0];
    expect(entryBlock(c, { day: c.day, hour: 10 })).toBeNull();
    expect(entryBlock(c, { day: c.day, hour: 7 })).toBe('notYet');
    expect(entryBlock(c, { day: c.day + 1, hour: 10 })).toBe('over');
    expect(entryBlock(c, { day: c.day, hour: 10, entered: [c.id] })).toBe('entered');
  });

  it('qui peut participer', () => {
    const h = horse();
    expect(eligibility(h, 'jumping')).toBeNull();
    h.gear = {};
    expect(eligibility(h, 'jumping')).toBe('needBridle');
    const cat = createAnimal({ species: 'cat', ageDays: 40 });
    cat.needs.energy = 90;
    expect(eligibility(cat, 'show')).toBe('noTricks');
    cat.tricks.sit = 100;
    expect(eligibility(cat, 'show')).toBeNull();
    expect(eligibility(cat, 'jumping')).toBe('notRideable');
    expect(eligibility(cat, 'agility')).toBeNull();
  });

  it('classement contre des concurrents', () => {
    const c = competitionsAt('maison', true, 1, 12).find((x) => x.type === 'jumping');
    const rv = rivals(c);
    expect(rv.length).toBe(5);
    expect(rivals(c)).toEqual(rv);
    const best = ranking(c, jumpingResult({ time: 1, par: 40 }), rv);
    expect(best.rank).toBe(1);
    const worst = ranking(c, jumpingResult({ rails: 9, time: 200, par: 40 }), rv);
    expect(worst.rank).toBe(6);
    expect(placementAward(c, 1)).toMatchObject({ kind: 'trophy', tier: 'gold' });
    expect(placementAward(c, 5).kind).toBe('ribbon');
    const show = { ...c, type: 'show', id: 'x-show' };
    expect(ranking(show, { points: 999 }).rank).toBe(1);
  });

  it('récompenses rangées dans le profil', () => {
    const p = createProfile('A');
    expect(practiceAward('jumping', 2)).toBeNull();
    addAward(p, practiceAward('jumping', 3), { type: 'jumping', day: 1 });
    addAward(p, placementAward({ prizes: [1, 2, 3] }, 1), { type: 'show', day: 2 });
    expect(awardCounts(p)).toMatchObject({ gold: 1, ribbons: 1, trophies: 1 });
    expect(activityData(p).awards[1].money).toBeUndefined();
    expect(recordBest(p, 'jumping', 'h', { total: 4, time: 40 })).toBe(true);
    expect(recordBest(p, 'jumping', 'h', { total: 8, time: 30 })).toBe(false);
    expect(recordBest(p, 'jumping', 'h', { total: 0, time: 50 })).toBe(true);
  });

  it('les activités entraînent et fatiguent', () => {
    const h = horse();
    const before = h.skills.jump;
    activitySkillGain(h, 'jumping', 1);
    expect(h.skills.jump).toBeGreaterThan(before);
    expect(h.needs.energy).toBeLessThan(90);
  });
});
