// Brider et débrider (src/sim/gear.js) : le filet ne reste jamais au box ni au pré. On se souvient duquel il
// portait (et de sa couleur) pour le remettre pareil ; « Monter » met le filet libre, même par-dessus le licol.
import { describe, it, expect } from 'vitest';
import { createProfile } from '../src/sim/profile.js';
import { createAnimal } from '../src/sim/animal.js';
import { seeded } from '../src/sim/rng.js';
import { starterTack, unbridle, bridleUp, freeBridle, tackUpForRide, equip, unequip, wears, rideGear, inUse } from '../src/sim/gear.js';

const horse = (seed = 'filet') => {
  const a = createAnimal({ species: 'horse', breed: 'selle_francais', sex: 'f', ageDays: 2000, rng: seeded(seed) });
  a.name = 'Étoile';
  return a;
};

describe('débrider', () => {
  it('le filet retourne à la sellerie, on se souvient de lui (modèle et couleur), il garde son licol', () => {
    const p = createProfile('Lou');
    const a = horse();
    p.animals.push(a);
    starterTack(p, a);
    equip(p, a, 'bridle', 'black');
    expect(a.gear.bridle).toMatchObject({ item: 'bridle', color: 'black' });
    expect(unbridle(p, a)).toBe(true);
    expect(a.gear.bridle).toBeUndefined();
    expect(a.lastBridle).toMatchObject({ item: 'bridle', color: 'black' });
    expect(wears(a, 'halter')).toBe(true);
    expect(inUse(p, 'bridle')).toBe(0);
  });

  it('sans licol sur la tête : il retrouve le licol libre de la sellerie', () => {
    const p = createProfile('Lou');
    const a = horse();
    p.animals.push(a);
    starterTack(p, a);
    unequip(a, 'halter');
    expect(unbridle(p, a)).toBe(true);
    expect(a.gear.halter?.item).toBe('halter');
    expect(rideGear(a).ok).toBe(true); // (on peut encore le mener, et le monter au licol)
  });

  it('pas de filet : rien à faire', () => {
    const p = createProfile('Lou');
    const a = horse();
    p.animals.push(a);
    expect(unbridle(p, a)).toBe(false);
    expect(a.lastBridle).toBeUndefined();
  });
});

describe('brider', () => {
  it('le même filet, dans la même couleur ; freeBridle préfère celui d\'avant', () => {
    const p = createProfile('Lou');
    p.items.bridleOlive = 1;
    const a = horse();
    p.animals.push(a);
    starterTack(p, a);
    expect(equip(p, a, 'bridleOlive', 'havana', { exact: true }).ok).toBe(true);
    unbridle(p, a);
    expect(freeBridle(p, a)).toBe('bridleOlive'); // (le filet simple est libre aussi, mais il portait celui-là)
    expect(bridleUp(p, a).ok).toBe(true);
    expect(a.gear.bridle).toMatchObject({ item: 'bridleOlive', color: 'havana' });
  });

  it('plus aucun filet libre : on ne peut pas brider', () => {
    const p = createProfile('Lou');
    p.items = { ...p.items, bridle: 0 };
    const a = horse();
    p.animals.push(a);
    expect(freeBridle(p, a)).toBeNull();
    expect(bridleUp(p, a).ok).toBe(false);
  });
});

describe('avant de monter', () => {
  it('le filet libre, même par-dessus le licol', () => {
    const p = createProfile('Lou');
    const a = horse();
    p.animals.push(a);
    starterTack(p, a);
    unbridle(p, a);
    expect(rideGear(a).ok).toBe(true); // (le licol suffirait)
    const r = tackUpForRide(p, a);
    expect(r).toMatchObject({ ok: true, item: 'bridle' });
    expect(wears(a, 'bridle')).toBe(true);
    expect(tackUpForRide(p, a)).toMatchObject({ ok: true, item: null }); // (déjà bridé)
  });

  it('sans filet libre, mais avec son licol : on monte au licol', () => {
    const p = createProfile('Lou');
    const a = horse();
    const b = horse('autre');
    p.animals.push(a, b);
    starterTack(p, a); // (le seul filet est sur Étoile)
    expect(equip(p, b, 'halter').ok).toBe(false); // (et le seul licol aussi)
    p.items.halter = 2;
    expect(equip(p, b, 'halter').ok).toBe(true);
    expect(tackUpForRide(p, b)).toMatchObject({ ok: true, item: null });
    expect(wears(b, 'bridle')).toBe(false);
    expect(rideGear(b).ok).toBe(true);
  });
});
