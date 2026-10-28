// Monter à cheval en balade libre : allures, fatigue, écarts (src/sim/riding.js).
import { describe, it, expect } from 'vitest';
import { createAnimal } from '../src/sim/animal.js';
import { seeded, mulberry32 } from '../src/sim/rng.js';
import {
  FREE_GAITS, GAIT_SPEED, rideSpeed, allowedGait, rideEffort, nextSpookIn, nextGrazeIn, shiftGait, CANTER_MIN, TIRED_WALK, SPOOKY,
} from '../src/sim/riding.js';

const horse = (extra = {}) => {
  const a = createAnimal({ species: 'horse', sex: 'f', ageDays: 2000, rng: seeded('cheval') });
  for (const n of Object.keys(a.needs)) a.needs[n] = 90;
  return Object.assign(a, extra);
};

// Seuils de l'animation (cheval réaliste : pickGait de src/game/models/horseReal.js ; cheval simple :
// gaitFromSpeed de src/game/models/avatarMotion.js avec walkSpeed 1,6 et runSpeed 5).
const REAL = { walkUp: 2.15, trotDown: 1.85, trotUp: 3.9, canterDown: 3.55, canterUp: 6.3, gallopDown: 5.8 };
const SIMPLE = { trot: 1.6 * 1.45, canter: 5 * 0.65 };

describe('les allures', () => {
  it('chaque vitesse est bien dans son allure, pour le cheval réaliste comme pour le cheval simple', () => {
    for (const scale of [0.7, 1, 1.15]) {
      for (const skill of [0, 50, 100]) {
        for (const tack of [0.9, 1, 1.15]) {
          const u = (g) => rideSpeed(g, { scale, speedSkill: skill, tack }) / scale;
          expect(u('walk')).toBeLessThan(Math.min(REAL.walkUp, SIMPLE.trot));
          expect(u('trot')).toBeGreaterThan(Math.max(REAL.walkUp, SIMPLE.trot));
          expect(u('trot')).toBeLessThan(Math.min(REAL.canterDown, SIMPLE.canter));
          expect(u('canter')).toBeGreaterThan(Math.max(REAL.trotUp, SIMPLE.canter));
          expect(u('canter')).toBeLessThan(REAL.gallopDown);
          expect(u('gallop')).toBeGreaterThan(REAL.canterUp);
        }
      }
    }
  });

  it('à l\'arrêt, on ne bouge pas ; un poney va moins vite ; à cru, on galope un peu moins vite', () => {
    expect(rideSpeed('halt')).toBe(0);
    expect(rideSpeed('trot', { scale: 0.7 })).toBeLessThan(rideSpeed('trot'));
    expect(rideSpeed('canter', { bareback: true })).toBeLessThan(rideSpeed('canter'));
    expect(rideSpeed('canter', { speedSkill: 90 })).toBeGreaterThan(rideSpeed('canter'));
  });

  it('une allure de plus ou de moins, sans sortir de la liste', () => {
    expect(shiftGait('walk', 1)).toBe('trot');
    expect(shiftGait('canter', 1)).toBe('canter');
    expect(shiftGait('halt', -1)).toBe('halt');
    expect(shiftGait('trot', -1)).toBe('walk');
    expect(FREE_GAITS).toEqual(['halt', 'walk', 'trot', 'canter']);
  });
});

describe('la fatigue', () => {
  it(`fatigué (moins de ${CANTER_MIN}), il ne galope plus ; épuisé (moins de ${TIRED_WALK}), il ne trotte plus`, () => {
    expect(allowedGait('canter', horse())).toEqual({ gait: 'canter', reason: null });
    const tired = horse();
    tired.needs.energy = CANTER_MIN - 1;
    expect(allowedGait('canter', tired)).toEqual({ gait: 'trot', reason: 'tired' });
    expect(allowedGait('gallop', tired)).toEqual({ gait: 'trot', reason: 'tired' });
    expect(allowedGait('trot', tired)).toEqual({ gait: 'trot', reason: null });
    tired.needs.energy = TIRED_WALK - 1;
    expect(allowedGait('trot', tired)).toEqual({ gait: 'walk', reason: 'exhausted' });
    expect(allowedGait('halt', tired)).toEqual({ gait: 'halt', reason: null });
  });

  it('le galop fatigue, fait transpirer et donne soif ; le pas et l\'arrêt reposent', () => {
    const run = (g, s) => {
      const a = horse();
      a.needs.energy = 60;
      rideEffort(a, g, s);
      return a.needs;
    };
    expect(run('gallop', 60).energy).toBeLessThan(run('canter', 60).energy);
    expect(run('canter', 60).energy).toBeLessThan(run('trot', 60).energy);
    expect(run('walk', 60).energy).toBeGreaterThan(60);
    expect(run('halt', 60).energy).toBeGreaterThan(60);
    expect(run('canter', 60).grooming).toBeLessThan(90);
    expect(run('canter', 60).thirst).toBeLessThan(90);
    expect(run('trot', 60).grooming).toBe(90);
    // Une minute de galop ne vide pas le cheval : on peut galoper un bon moment.
    expect(run('canter', 60).energy).toBeGreaterThan(50);
  });
});

describe('les écarts', () => {
  it('un cheval timide fait plus d\'écarts qu\'un calme ; l\'obéissance en fait faire moins', () => {
    const avg = (a) => {
      const rng = mulberry32(5);
      let s = 0;
      for (let i = 0; i < 200; i++) s += nextSpookIn(a, rng);
      return s / 200;
    };
    expect(avg(horse({ personality: 'shy' }))).toBeLessThan(avg(horse({ personality: 'calm' })));
    const green = horse({ personality: 'curious' });
    green.skills.obedience = 5;
    const schooled = horse({ personality: 'curious' });
    schooled.skills.obedience = 90;
    expect(avg(green)).toBeLessThan(avg(schooled));
    // jamais plus d'un écart toutes les demi-minutes
    const rng = mulberry32(9);
    for (let i = 0; i < 500; i++) expect(nextSpookIn(horse({ personality: 'shy' }), rng)).toBeGreaterThan(30);
  });

  it('pas d\'écart à l\'arrêt ni au pas', () => {
    expect(SPOOKY.has('halt')).toBe(false);
    expect(SPOOKY.has('walk')).toBe(false);
    expect(SPOOKY.has('canter')).toBe(true);
    expect(GAIT_SPEED.walk).toBeGreaterThan(0);
  });
});

describe('le cheval gourmand', () => {
  const avg = (a) => {
    const rng = mulberry32(8);
    let s = 0;
    for (let i = 0; i < 200; i++) s += nextGrazeIn(a, rng);
    return s / 200;
  };
  it('il s\'arrête pour brouter plus vite s\'il a faim ou s\'il est têtu ; moins s\'il est calme et bien dressé', () => {
    const fed = horse({ personality: 'curious' });
    const hungry = horse({ personality: 'curious' });
    hungry.needs.hunger = 30;
    expect(avg(hungry)).toBeLessThan(avg(fed) * 0.6);
    expect(avg(horse({ personality: 'stubborn' }))).toBeLessThan(avg(horse({ personality: 'calm' })));
    const schooled = horse({ personality: 'curious' });
    schooled.skills.obedience = 90;
    expect(avg(schooled)).toBeGreaterThan(avg(fed) * 1.5);
    // jamais tout de suite : au moins un quart de minute
    const rng = mulberry32(2);
    for (let i = 0; i < 300; i++) expect(nextGrazeIn(hungry, rng)).toBeGreaterThan(14);
  });
});
