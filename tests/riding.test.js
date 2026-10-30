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

  it('⭐ ses étoiles de vitesse : son grand galop va plus vite (au galop, toujours sous le seuil du grand galop)', () => {
    expect(rideSpeed('gallop', { speedSkill: 100 })).toBeGreaterThan(rideSpeed('gallop', { speedSkill: 40 }));
    expect(rideSpeed('gallop', { speedSkill: 85 })).toBeGreaterThan(rideSpeed('gallop', { speedSkill: 65 }));
    expect(rideSpeed('canter', { speedSkill: 100 })).toBe(rideSpeed('canter', { speedSkill: 40 }));
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

  it('⭐ ses étoiles d\'endurance : le galop le fatigue moins, il récupère plus vite au pas', () => {
    const run = (g, s, endurance) => {
      const a = horse();
      a.needs.energy = 60;
      a.skills.endurance = endurance;
      rideEffort(a, g, s);
      return a.needs.energy;
    };
    expect(run('canter', 60, 90)).toBeGreaterThan(run('canter', 60, 10));
    expect(60 - run('canter', 60, 100)).toBeCloseTo((60 - run('canter', 60, 10)) * 0.6, 5); // (40 % plus longtemps)
    expect(run('walk', 60, 90) - 60).toBeGreaterThan(run('walk', 60, 10) - 60);
    expect(run('trot', 60, 90)).toBeGreaterThan(run('trot', 60, 10));
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

describe('le lien', () => {
  it('les étapes du lien ; un cheval qui te fait confiance fait moins d\'écarts', async () => {
    const { bondStage } = await import('../src/sim/animal.js');
    expect([0, 24, 25, 49, 50, 74, 75, 100].map((b) => bondStage({ bond: b }))).toEqual(['new', 'new', 'trust', 'trust', 'love', 'love', 'best', 'best']);
    const avg = (a) => {
      const rng = mulberry32(6);
      let s = 0;
      for (let i = 0; i < 200; i++) s += nextSpookIn(a, rng);
      return s / 200;
    };
    expect(avg(horse({ personality: 'curious', bond: 80 }))).toBeGreaterThan(avg(horse({ personality: 'curious', bond: 5 })) * 1.5);
  });
});

describe('la sueur', () => {
  it('au galop il transpire (plus qu\'au trot), au pas non ; elle sèche au repos ; le pansage l\'enlève', async () => {
    const { rideEffort } = await import('../src/sim/riding.js');
    const { createAnimal, tickAnimal, applyCare } = await import('../src/sim/animal.js');
    const { seeded } = await import('../src/sim/rng.js');
    const a = createAnimal({ species: 'horse', sex: 'f', ageDays: 2000, rng: seeded('sueur') });
    for (const n of Object.keys(a.needs)) a.needs[n] = 90;
    rideEffort(a, 'walk', 30);
    expect(a.sweat ?? 0).toBe(0);
    rideEffort(a, 'trot', 30);
    const trot = a.sweat;
    rideEffort(a, 'gallop', 30);
    expect(a.sweat - trot).toBeGreaterThan(trot);
    tickAnimal(a, 0.5, { rng: () => 0.99 });
    expect(a.sweat).toBeLessThan(0.7);
    a.sweat = 0.8;
    applyCare(a, 'brush', 1);
    expect(a.sweat).toBeUndefined();
  });

  it('en selle, au rythme du jeu : 30 s de galop (💨) le font fumer dans le froid, encore un peu après le retour au calme', async () => {
    const { rideEffort, GAIT_SWEAT } = await import('../src/sim/riding.js');
    const { createAnimal, tickAnimal } = await import('../src/sim/animal.js');
    const { seeded } = await import('../src/sim/rng.js');
    const { minutesPerSecond } = await import('../src/sim/time.js');
    const { steamOf } = await import('../src/sim/breath.js');
    const { WARMUP } = await import('../src/sim/warmup.js');
    // (comme le jeu : rideEffort à chaque image, tickAnimal toutes les 0,5 s ; à pied après la descente)
    const ride = (a, gait, secs, speed, ridden = true) => {
      let acc = 0;
      for (let k = 0; k < secs * 30; k++) {
        if (ridden) rideEffort(a, gait, 1 / 30);
        acc += 1 / 30;
        if (acc >= 0.5) {
          tickAnimal(a, (acc * minutesPerSecond(speed)) / 60, { ridden, freeRide: ridden, rng: () => 0.99 });
          acc = 0;
        }
      }
    };
    for (const speed of ['slow', 'normal', 'fast']) {
      const a = createAnimal({ species: 'horse', sex: 'f', ageDays: 2000, rng: seeded('vapeur') });
      for (const n of Object.keys(a.needs)) a.needs[n] = 95;
      ride(a, 'canter', 30, speed);
      expect(a.sweat, speed).toBeCloseTo(30 * GAIT_SWEAT.canter, 5); // (la vitesse du temps n'y change rien)
      expect(steamOf(a.sweat, 3), speed).toBeGreaterThan(0);
      ride(a, 'walk', WARMUP.cool, speed); // (le retour au calme : elle sèche un peu)
      expect(a.sweat, speed).toBeLessThan(0.3);
      expect(steamOf(a.sweat, 3), speed).toBeGreaterThan(0);
      ride(a, 'halt', 2, speed, false); // (pied à terre : il fume encore un instant)
      expect(steamOf(a.sweat, 3), speed).toBeGreaterThan(0);
      ride(a, 'halt', 120, speed, false); // (puis il sèche au repos)
      expect(steamOf(a.sweat, 3), speed).toBe(0);
    }
    // Au pas, la sueur ne fait que baisser ; trotter longtemps finit par le faire transpirer un peu.
    const b = { needs: { energy: 90, grooming: 90, thirst: 90 } };
    rideEffort(b, 'walk', 10);
    expect(b.sweat).toBeUndefined();
    rideEffort(b, 'trot', 60);
    expect(b.sweat).toBeCloseTo(0.18, 5);
    rideEffort(b, 'halt', 1000);
    expect(b.sweat).toBe(0);
  });

  it('monté hors balade libre (voyage à cheval, activité, vue d\'ensemble) : elle sèche au rythme du jeu', async () => {
    const { createAnimal, tickAnimal } = await import('../src/sim/animal.js');
    const { planTrip, tickTrip } = await import('../src/sim/trip.js');
    const { seeded } = await import('../src/sim/rng.js');
    const a = createAnimal({ species: 'horse', sex: 'f', ageDays: 2000, rng: seeded('voyage') });
    for (const n of Object.keys(a.needs)) a.needs[n] = 95;
    a.sweat = 0.6;
    tickAnimal(a, 0.5, { ridden: true, freeRide: true, rng: () => 0.99 });
    expect(a.sweat).toBe(0.6); // (en balade libre, c'est rideEffort, en secondes)
    tickAnimal(a, 0.5, { ridden: true, rng: () => 0.99 });
    expect(a.sweat).toBeCloseTo(0.2, 5);
    a.sweat = 0.6; // (30 s de galop, puis des heures de voyage : il arrive sec)
    const trip = planTrip({ mode: 'horse', hours: 3, animals: [a], riderId: a.id });
    tickTrip(trip, [a], 1, { rng: () => 0.99 });
    expect(a.sweat).toBe(0);
  });
});
