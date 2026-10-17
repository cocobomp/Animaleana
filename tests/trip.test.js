import { describe, it, expect } from 'vitest';
import { createAnimal, tickAnimal, happiness } from '../src/sim/animal.js';
import { checkTravel } from '../src/sim/places.js';
import { mulberry32 } from '../src/sim/rng.js';
import { DAYS_PER_YEAR } from '../src/sim/time.js';
import {
  planTrip, tickTrip, doStopAction, canStopAction, continueTrip, skipStop, sleepAtStop, canContinue,
  runToEnd, finishTrip, vehicleFor, placeFor, tipsFor, currentStop, remainingHours, stressLevel,
  MAX_DRIVE_HORSES, SICK_STRESS,
} from '../src/sim/trip.js';

const rng = () => mulberry32(7);
const adult = (species, extra = {}) => {
  const a = createAnimal({ species, ageDays: 5 * DAYS_PER_YEAR, rng: rng(), personality: 'stubborn' });
  for (const n of Object.keys(a.needs)) a.needs[n] = 90;
  return Object.assign(a, extra);
};
const drive = (trip, animals) => {
  while (trip.status === 'moving') tickTrip(trip, animals, 0.25, { rng: rng() });
};

describe('véhicule', () => {
  it('van et remorque pour les chevaux, voiture et caisses pour les petits', () => {
    const horse = adult('horse');
    const cat = adult('cat');
    expect(vehicleFor('van', [horse, cat])).toBe('trailer');
    expect(vehicleFor('car', [cat])).toBe('car');
    expect(vehicleFor('horse', [horse])).toBe('none');
    // Pour l'avion : le van emmène les chevaux jusqu'à l'aéroport.
    expect(vehicleFor('plane', [horse])).toBe('trailer');
    expect(vehicleFor('plane', [cat])).toBe('car');
    expect(placeFor('trailer', horse)).toBe('trailer');
    expect(placeFor('trailer', cat)).toBe('crate');
  });
});

describe('plan du voyage', () => {
  it('aires de repos régulières, jamais plus de 4 h 30 de route avec des chevaux', () => {
    const horse = adult('horse');
    const trip = planTrip({ mode: 'van', hours: 8, animals: [horse] });
    const rests = trip.stops.filter((s) => s.kind === 'rest');
    expect(rests.length).toBe(2);
    let last = 0;
    for (const s of trip.stops) {
      expect(s.at - last).toBeLessThanOrEqual(MAX_DRIVE_HORSES);
      last = s.at;
    }
    expect(trip.totalHours).toBeCloseTo(8);
  });

  it('un très long trajet en voiture a une étape pour la nuit', () => {
    const dog = adult('dog');
    const trip = planTrip({ mode: 'car', hours: 20, animals: [dog] });
    expect(trip.stops.some((s) => s.kind === 'night')).toBe(true);
    expect(trip.totalHours).toBeGreaterThan(20);
  });

  it('en avion : embarquement, soute, puis on récupère les animaux', () => {
    const cat = adult('cat');
    const check = checkTravel('maison', 'japon', 'plane', [cat]);
    const trip = planTrip({ mode: 'plane', hours: check.hours, animals: [cat] });
    expect(trip.phases.map((p) => p.kind)).toEqual(['road', 'hold', 'road']);
    expect(trip.stops.map((s) => s.kind)).toEqual(['boarding', 'landing']);
  });

  it('un court trajet n\'a pas d\'arrêt', () => {
    const trip = planTrip({ mode: 'car', hours: 2, animals: [adult('dog')] });
    expect(trip.stops.length).toBe(0);
  });
});

describe('sur la route', () => {
  it('les animaux ont soif et sont stressés ; s\'arrêter et les soigner fait du bien', () => {
    const horse = adult('horse');
    const trip = planTrip({ mode: 'van', hours: 6, animals: [horse] });
    drive(trip, [horse]);
    expect(trip.status).toBe('stop');
    expect(horse.stress).toBeGreaterThan(5);
    expect(horse.needs.thirst).toBeLessThan(90);
    const thirst = horse.needs.thirst;
    const stress = horse.stress;
    expect(doStopAction(trip, horse, 'water').ok).toBe(true);
    expect(horse.needs.thirst).toBeGreaterThan(thirst);
    expect(doStopAction(trip, horse, 'water').reason).toBe('done');
    expect(doStopAction(trip, horse, 'calm').ok).toBe(true);
    expect(horse.stress).toBeLessThan(stress);
    // Pas de promenade pour un cheval sur une aire d'autoroute.
    expect(canStopAction(trip, horse, 'walk').reason).toBe('walkTrailer');
    expect(continueTrip(trip, [horse])).toBe(true);
    drive(trip, [horse]);
    expect(trip.status).toBe('arrived');
  });

  it('le chat reste dans sa caisse, le chien se dégourdit les pattes', () => {
    const cat = adult('cat');
    const dog = adult('dog');
    const trip = planTrip({ mode: 'car', hours: 5, animals: [cat, dog] });
    drive(trip, [cat, dog]);
    expect(canStopAction(trip, cat, 'walk').reason).toBe('walkCrate');
    expect(doStopAction(trip, dog, 'walk').ok).toBe(true);
  });

  it('ne pas s\'arrêter augmente le stress et la soif', () => {
    const make = () => [adult('dog')];
    const a = make();
    const b = make();
    const t1 = planTrip({ mode: 'car', hours: 5, animals: a });
    const t2 = planTrip({ mode: 'car', hours: 5, animals: b });
    drive(t1, a);
    drive(t2, b);
    for (const x of a) doStopAction(t1, x, 'water');
    continueTrip(t1, a);
    skipStop(t2, b);
    expect(b[0].stress).toBeGreaterThan(a[0].stress);
    expect(b[0].needs.thirst).toBeLessThan(a[0].needs.thirst);
    expect(t2.skipped).toBe(1);
  });

  it('à l\'étape du soir il faut dormir avant de repartir', () => {
    const dog = adult('dog');
    const trip = planTrip({ mode: 'car', hours: 12, animals: [dog] });
    while (!(trip.status === 'stop' && currentStop(trip).kind === 'night')) {
      if (trip.status === 'stop') continueTrip(trip, [dog]);
      else tickTrip(trip, [dog], 0.5, { rng: rng() });
    }
    expect(canContinue(trip)).toBe(false);
    dog.stress = 60;
    expect(sleepAtStop(trip, [dog], { rng: rng() }).ok).toBe(true);
    expect(dog.stress).toBeLessThan(30);
    expect(dog.needs.energy).toBeGreaterThanOrEqual(90);
    expect(canContinue(trip)).toBe(true);
  });

  it('en soute, impossible de les soigner et le stress monte vite', () => {
    const cat = adult('cat');
    const trip = planTrip({ mode: 'plane', hours: 14, animals: [cat] });
    drive(trip, [cat]); // jusqu'à l'embarquement
    continueTrip(trip, [cat]);
    const before = cat.stress;
    drive(trip, [cat]); // le vol
    expect(currentStop(trip).kind).toBe('landing');
    expect(cat.stress - before).toBeGreaterThan(40);
  });
});

describe('arrivée', () => {
  it('passer le trajet : arrive, mais plus stressé qu\'avec de bons soins', () => {
    const lazy = [adult('horse')];
    const caring = [adult('horse')];
    const t1 = planTrip({ mode: 'van', hours: 9, animals: lazy });
    const t2 = planTrip({ mode: 'van', hours: 9, animals: caring });
    // runToEnd renvoie les événements survenus, sous la forme attendue par TripFlow.handleEvents : [{ a, events }].
    const happened = runToEnd(t1, lazy, { rng: rng() });
    expect(Array.isArray(happened)).toBe(true);
    for (const h of happened) {
      expect(h.a).toBe(lazy[0]);
      expect(Array.isArray(h.events)).toBe(true);
    }
    while (t2.status !== 'arrived') {
      if (t2.status === 'moving') tickTrip(t2, caring, 0.5, { rng: rng() });
      else {
        for (const act of ['water', 'feed', 'calm', 'clean', 'check']) doStopAction(t2, caring[0], act);
        continueTrip(t2, caring);
      }
    }
    expect(t1.status).toBe('arrived');
    expect(caring[0].stress).toBeLessThan(lazy[0].stress);
    expect(remainingHours(t1)).toBe(0);
  });

  it('un stress extrême rend malade', () => {
    const cat = adult('cat', { stress: 98 });
    const trip = planTrip({ mode: 'plane', hours: 14, animals: [cat] });
    const report = finishTrip(trip, [cat], { rng: rng() });
    expect(report.animals[0].sick).toBe(true);
    expect(cat.sick).toBe('belly');
    expect(stressLevel(SICK_STRESS)).toBe('panic');
  });

  it('le stress baisse le bonheur puis redescend à la maison', () => {
    const dog = adult('dog');
    const calm = happiness(dog);
    dog.stress = 70;
    expect(happiness(dog)).toBeLessThan(calm);
    tickAnimal(dog, 6, { rng: rng() });
    expect(dog.stress).toBeLessThan(40);
    tickAnimal(dog, 10, { rng: rng() });
    expect(dog.stress).toBe(0);
  });

  it('les conseils parlent des longs trajets et du voisin', () => {
    const horse = adult('horse');
    const trip = planTrip({ mode: 'van', hours: 8, animals: [horse] });
    const tips = tipsFor(trip, [horse]);
    expect(tips[0]).toBe('long');
    expect(tips).toContain('neighbour');
    expect(tips).toContain('horseRule');
  });
});

describe('le coffre pendant le trajet', () => {
  it('sans bidon d\'eau ni foin, on ne peut pas les faire boire ou manger sur l\'aire de repos', () => {
    const horse = adult('horse');
    const trip = planTrip({ mode: 'van', hours: 6, animals: [horse], cargo: {} });
    drive(trip, [horse]);
    expect(currentStop(trip).kind).toBe('rest');
    expect(canStopAction(trip, horse, 'water').reason).toBe('noWater');
    expect(canStopAction(trip, horse, 'feed').reason).toBe('noHay');
    const other = adult('horse');
    const ok = planTrip({ mode: 'van', hours: 6, animals: [other], cargo: { water: 1, hay: 1 } });
    drive(ok, [other]);
    expect(canStopAction(ok, other, 'water').ok).toBe(true);
  });

  it('les gamelles pour le chien et le chat', () => {
    const dog = adult('dog');
    dog.needs.hunger = 50;
    const trip = planTrip({ mode: 'car', hours: 5, animals: [dog], cargo: { water: 1 } });
    drive(trip, [dog]);
    expect(canStopAction(trip, dog, 'feed').reason).toBe('noBowls');
  });

  it('le filet à foin occupe les chevaux : moins de stress et moins faim', () => {
    const a = adult('horse');
    const b = adult('horse');
    const withHay = planTrip({ mode: 'van', hours: 4, animals: [a], cargo: { hay: 1, water: 1 } });
    const without = planTrip({ mode: 'van', hours: 4, animals: [b], cargo: { water: 1 } });
    drive(withHay, [a]);
    drive(without, [b]);
    expect(a.stress).toBeLessThan(b.stress);
    expect(a.needs.hunger).toBeGreaterThan(b.needs.hunger);
  });

  it('l\'étape du soir fournit l\'eau même sans bidon', () => {
    const dog = adult('dog');
    const trip = planTrip({ mode: 'car', hours: 12, animals: [dog], cargo: {} });
    while (!(trip.status === 'stop' && currentStop(trip).kind === 'night')) {
      if (trip.status === 'stop') continueTrip(trip, [dog]);
      else tickTrip(trip, [dog], 0.5, { rng: rng() });
    }
    dog.needs.thirst = 50;
    expect(canStopAction(trip, dog, 'water').ok).toBe(true);
  });

  it('passer le trajet marche aussi avec un coffre vide', () => {
    const horse = adult('horse');
    const trip = planTrip({ mode: 'van', hours: 9, animals: [horse], cargo: {} });
    runToEnd(trip, [horse], { rng: rng() });
    expect(trip.status).toBe('arrived');
  });

  it('chaque voyage donne l\'habitude du van', () => {
    const horse = adult('horse');
    const trip = planTrip({ mode: 'van', hours: 2, animals: [horse] });
    finishTrip(trip, [horse], { rng: rng() });
    expect(horse.trips).toBe(1);
  });
});
