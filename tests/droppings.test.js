import { describe, it, expect } from 'vitest';
import { createProfile } from '../src/sim/profile.js';
import { createAnimal, tickAnimal } from '../src/sim/animal.js';
import { digest, addDropping, dirtNear, scoopZone, dryPuddles } from '../src/sim/droppings.js';

describe('crottins', () => {
  it('un cheval fait ses besoins plusieurs fois par jour, un chat non', () => {
    const horse = createAnimal({ species: 'horse', ageDays: 80 });
    horse.digest = 0;
    let n = 0;
    for (let h = 0; h < 24; h++) if (digest(horse, 1)) n++;
    expect(n).toBe(8);
    expect(digest(createAnimal({ species: 'cat' }), 24)).toBeNull();
  });

  it('les crottins salissent les animaux autour, et on les ramasse', () => {
    const p = createProfile('A');
    for (let i = 0; i < 5; i++) addDropping(p, 'maison', -16 + i, 16, 'poop', 0);
    expect(dirtNear(p, 'maison', -15, 16)).toBe(5);
    const clean = createAnimal({ species: 'horse', ageDays: 80 });
    const dirty = createAnimal({ species: 'horse', ageDays: 80 });
    clean.needs.hygiene = dirty.needs.hygiene = 80;
    tickAnimal(clean, 4, { dirt: 0 });
    tickAnimal(dirty, 4, { dirt: 5 });
    expect(dirty.needs.hygiene).toBeLessThan(clean.needs.hygiene);
    expect(scoopZone(p, 'maison', { x: -16, z: 16, hw: 7, hd: 9 })).toHaveLength(5);
    expect(dirtNear(p, 'maison', -15, 16)).toBe(0);
  });

  it('le pipi sèche tout seul', () => {
    const p = createProfile('A');
    addDropping(p, 'maison', 0, 0, 'pee', 0);
    expect(dryPuddles(p, 60)).toHaveLength(0);
    expect(dryPuddles(p, 200)).toHaveLength(1);
  });
});
