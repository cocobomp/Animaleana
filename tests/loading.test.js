import { describe, it, expect } from 'vitest';
import { createAnimal } from '../src/sim/animal.js';
import { mulberry32 } from '../src/sim/rng.js';
import { DAYS_PER_YEAR } from '../src/sim/time.js';
import {
  CONFIDENCE_OK, loadConfidence, startLoad, willLoad, encourage, stallSteps, newStall, enterStall, canStep, doStep,
  nextStep, secured, secureAll, safetyMap,
} from '../src/sim/loading.js';
import { planTrip, tickTrip, doStopAction, currentStop } from '../src/sim/trip.js';

const horse = (personality, extra = {}) => {
  const a = createAnimal({ species: 'horse', ageDays: 6 * DAYS_PER_YEAR, rng: mulberry32(9), personality });
  for (const n of Object.keys(a.needs)) a.needs[n] = 80;
  a.needs.affection = 50;
  return Object.assign(a, extra);
};

describe('devant le pont', () => {
  it('un cheval calme monte tout de suite, un cheval peureux hésite', () => {
    expect(willLoad(startLoad(horse('calm')))).toBe(true);
    expect(willLoad(startLoad(horse('shy')))).toBe(false);
    expect(loadConfidence(horse('shy'))).toBeLessThan(CONFIDENCE_OK);
  });

  it('le rassurer ou lui donner une friandise l\'aide à monter', () => {
    const s = startLoad(horse('shy'));
    expect(encourage(s, 'reassure')).toBe(false);
    expect(encourage(s, 'reassure')).toBe(true);
    const t = startLoad(horse('shy'));
    expect(encourage(t, 'treat')).toBe(true);
    // Patienter aide aussi, mais lentement.
    const w = startLoad(horse('stubborn'));
    const before = w.conf;
    encourage(w, 'wait');
    expect(w.conf).toBeGreaterThan(before);
    expect(w.tries).toBe(1);
  });

  it('un cheval stressé a moins confiance, un cheval qui a l\'habitude des voyages monte mieux', () => {
    expect(loadConfidence(horse('calm', { stress: 70 }))).toBeLessThan(loadConfidence(horse('calm')));
    expect(loadConfidence(horse('shy', { trips: 3 }))).toBeGreaterThan(loadConfidence(horse('shy')));
  });

  it('le bétail suit sans trop hésiter', () => {
    const sheep = createAnimal({ species: 'sheep', ageDays: 3 * DAYS_PER_YEAR, rng: mulberry32(2), personality: 'shy' });
    expect(loadConfidence(sheep)).toBeGreaterThan(loadConfidence(horse('shy')));
  });
});

describe('dans la remorque', () => {
  it('barre de poitrail, barre arrière, puis on attache au filet à foin', () => {
    const a = horse('calm');
    const st = newStall();
    expect(stallSteps(a)).toEqual(['breastBar', 'rearBar', 'tie']);
    expect(doStep(st, a, 'breastBar').ok).toBe(true);
    // Rien à fermer derrière tant que le cheval n'est pas monté.
    expect(canStep(st, a, 'rearBar').reason).toBe('empty');
    expect(enterStall(st)).toBe(null);
    // On n'attache pas avant d'avoir fermé derrière lui.
    expect(canStep(st, a, 'tie').reason).toBe('rearFirst');
    expect(nextStep(st, a)).toBe('rearBar');
    expect(doStep(st, a, 'rearBar').ok).toBe(true);
    expect(secured(st, a)).toBe(false);
    expect(doStep(st, a, 'tie').ok).toBe(true);
    expect(secured(st, a)).toBe(true);
    expect(doStep(st, a, 'tie').reason).toBe('done');
    expect(nextStep(st, a)).toBe(null);
  });

  it('monter avec la barre de poitrail ouverte, ça se remarque', () => {
    const st = newStall();
    expect(enterStall(st)).toBe('breastOpen');
  });

  it('les moutons ne s\'attachent pas', () => {
    const sheep = createAnimal({ species: 'sheep', ageDays: 3 * DAYS_PER_YEAR, rng: mulberry32(2) });
    expect(stallSteps(sheep)).toEqual(['breastBar', 'rearBar']);
    expect(canStep(newStall(), sheep, 'tie').reason).toBe('noStep');
  });

  it('un cheval mal attaché est plus stressé ; on le remarque et on le rattache pendant la pause', () => {
    const tied = horse('calm');
    const loose = horse('calm');
    const stalls = new Map([[tied.id, newStall()], [loose.id, newStall()]]);
    secureAll(stalls.get(tied.id), tied);
    enterStall(stalls.get(loose.id));
    const safety = safetyMap(stalls, [tied, loose]);
    expect(safety).toEqual({ [tied.id]: true, [loose.id]: false });
    const trip = planTrip({ mode: 'van', hours: 5, animals: [tied, loose], safety, cargo: { water: 1, hay: 1 } });
    while (trip.status === 'moving') tickTrip(trip, [tied, loose], 0.25, { rng: mulberry32(1) });
    expect(currentStop(trip).kind).toBe('rest');
    expect(loose.stress).toBeGreaterThan(tied.stress + 3);
    const r = doStopAction(trip, loose, 'check');
    expect(r.finding).toBe('loose');
    expect(trip.safety[loose.id]).toBe(true);
  });
});
