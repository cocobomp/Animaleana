// 🧦 Les chaussettes de boue (src/sim/legMud.js) : au pré boueux (automne et hiver dans un pays de pluie, ou partout
// sous la pluie), la boue monte sur ses jambes en deux heures ; mouillée sous la pluie, elle sèche ensuite ; dans son
// box, rien ; la brosse l'enlève, et le pansage n'est jamais « inutile » tant qu'il en a.
import { describe, it, expect } from 'vitest';
import { LEG_MUD, muddyGround, legMudTick, cleanLegs } from '../src/sim/legMud.js';
import { createAnimal, tickAnimal, applyCare, careFull } from '../src/sim/animal.js';
import { PLACE_IDS } from '../src/sim/places.js';
import { seeded } from '../src/sim/rng.js';

const horse = () => {
  const a = createAnimal({ species: 'horse', sex: 'm', ageDays: 2000, rng: seeded('boue') });
  for (const n of Object.keys(a.needs)) a.needs[n] = 80;
  return a;
};
/** Des heures, pas à pas (comme le jeu, deux fois par seconde : ici par quarts d'heure). */
const hours = (a, n, ctx) => {
  for (let i = 0; i < n * 4; i++) legMudTick(a, 0.25, ctx);
};

describe('le sol du pré', () => {
  it('boueux en Normandie à l\'automne, sec en Andalousie l\'été ; boueux partout sous la pluie', () => {
    expect(muddyGround({ placeId: 'maison', season: 'autumn', weather: 'clear' })).toBe(true);
    expect(muddyGround({ placeId: 'maison', season: 'summer', weather: 'clear' })).toBe(false);
    expect(muddyGround({ placeId: 'andalousie', season: 'summer', weather: 'clear' })).toBe(false);
    for (const placeId of PLACE_IDS) {
      expect(muddyGround({ placeId, season: 'summer', weather: 'rain' })).toBe(true);
      expect(muddyGround({ placeId, season: 'summer', weather: 'storm' })).toBe(true);
    }
  });
});

describe('ses chaussettes de boue', () => {
  it('3 h au pré boueux : de la boue jusqu\'aux genoux ; pas dehors, ou l\'été en Andalousie : rien', () => {
    const a = horse();
    hours(a, 3, { outdoors: true, muddy: true, weather: 'cloudy' });
    expect(a.legMud).toBeGreaterThanOrEqual(0.9);
    expect(a.legMud).toBeLessThanOrEqual(1);
    const box = horse();
    hours(box, 3, { outdoors: false, muddy: false, weather: 'rain' });
    expect(box.legMud ?? 0).toBe(0);
    const dry = horse();
    const muddy = muddyGround({ placeId: 'andalousie', season: 'summer', weather: 'clear' });
    hours(dry, 3, { outdoors: true, muddy, weather: 'clear' });
    expect(dry.legMud ?? 0).toBe(0);
    // (un chien ne s'en soucie pas ; un ancien appel sans outdoors non plus)
    const dog = createAnimal({ species: 'dog', sex: 'm', ageDays: 300, rng: seeded('chien') });
    hours(dog, 3, { outdoors: true, muddy: true });
    expect(dog.legMud).toBeUndefined();
    const old = horse();
    hours(old, 3, { weather: 'rain' });
    expect(old.legMud).toBeUndefined();
  });

  it('mouillée sous la pluie (foncée), puis elle sèche ; au sec, elle tombe peu à peu', () => {
    const a = horse();
    hours(a, 2, { outdoors: true, muddy: true, weather: 'rain' });
    expect(a.legMudWet).toBeGreaterThan(0.9);
    // (pluie avec une couverture : le ciel compte, ses jambes ne sont pas couvertes)
    const rug = horse();
    hours(rug, 2, { outdoors: true, muddy: true, weather: 'clear', sky: 'rain' });
    expect(rug.legMudWet).toBeGreaterThan(0.9);
    // dans son box : elle sèche
    hours(a, 2, { outdoors: false, muddy: false, weather: 'clear' });
    expect(a.legMudWet).toBeLessThan(0.05);
    expect(a.legMud).toBeGreaterThan(0.7);
    expect(a.legMud).toBeLessThan(1);
    // au pré boueux sans pluie : humide
    hours(a, 1, { outdoors: true, muddy: true, weather: 'cloudy' });
    expect(a.legMudWet).toBeCloseTo(0.5, 1);
    // toute une journée au box : partie
    hours(a, 12, { outdoors: false });
    expect(a.legMud).toBeUndefined();
    expect(a.legMudWet).toBeUndefined();
  });

  it('cleanLegs : des jambes propres', () => {
    const a = horse();
    a.legMud = 0.8;
    a.legMudWet = 0.6;
    cleanLegs(a);
    expect(a.legMud).toBeUndefined();
    expect(a.legMudWet).toBeUndefined();
  });

  it('tickAnimal la fait monter au pré boueux ; la brosse (ou le bain) l\'enlève', () => {
    const a = horse();
    tickAnimal(a, 1, { outdoors: true, muddy: true, weather: 'cloudy', rng: () => 0.99 });
    expect(a.legMud).toBeCloseTo(LEG_MUD.perHour, 5);
    tickAnimal(a, 1, { outdoors: true, muddy: true, weather: 'cloudy', rng: () => 0.99 });
    expect(a.legMud).toBe(1);
    a.needs.grooming = 50;
    expect(applyCare(a, 'brush', 1).ok).toBe(true);
    expect(a.legMud).toBeUndefined();
    expect(a.legMudWet).toBeUndefined();
    a.legMud = 0.6;
    a.needs.hygiene = 40;
    expect(applyCare(a, 'wash', 1).ok).toBe(true);
    expect(a.legMud).toBeUndefined();
  });

  it('bien pansé mais les jambes boueuses : le pansage n\'est pas inutile', () => {
    const a = horse();
    a.needs.grooming = 98;
    a.hoofDirt = 0;
    expect(careFull(a, 'brush')).toBe(true);
    a.legMud = 0.5;
    expect(careFull(a, 'brush')).toBe(false);
    a.legMud = LEG_MUD.brushAt - 0.05;
    expect(careFull(a, 'brush')).toBe(true);
  });
});
