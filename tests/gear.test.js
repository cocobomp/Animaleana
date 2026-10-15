import { describe, it, expect } from 'vitest';
import { createProfile } from '../src/sim/profile.js';
import { createAnimal } from '../src/sim/animal.js';
import { buyGear, equip, rideGear, feltWeather, owned, canLead, canLeash, heelSkill } from '../src/sim/gear.js';
import { applyCare, weightClass } from '../src/sim/animal.js';

describe('équipement', () => {
  it('il faut un filet pour monter, la selle évite de monter à cru', () => {
    const p = createProfile('A');
    const horse = createAnimal({ species: 'horse', ageDays: 80 });
    p.animals.push(horse);
    expect(rideGear(horse).reason).toBe('needBridle');
    expect(equip(p, horse, 'bridle').ok).toBe(true);
    expect(rideGear(horse)).toEqual({ ok: true, bareback: true });
    equip(p, horse, 'saddle');
    expect(rideGear(horse).bareback).toBe(false);
  });

  it('on ne peut pas mettre un objet qu\'on n\'a pas', () => {
    const p = createProfile('A', 'manage');
    const horse = createAnimal({ species: 'horse', ageDays: 80 });
    p.animals.push(horse);
    expect(equip(p, horse, 'blanket').reason).toBe('notOwned');
    buyGear(p, 'blanket');
    expect(owned(p, 'blanket')).toBe(1);
    expect(equip(p, horse, 'blanket', 'navy').ok).toBe(true);
    expect(horse.gear.blanket).toEqual({ item: 'blanket', color: 'navy' });
  });

  it('la couverture protège de la pluie mais donne chaud', () => {
    const horse = { species: 'horse', gear: { blanket: { item: 'blanket' } } };
    expect(feltWeather(horse, 'rain', 10, 'autumn')).toBe('clear');
    expect(feltWeather(horse, 'clear', 24, 'summer')).toBe('heat');
    expect(feltWeather({ species: 'horse' }, 'clear', 22, 'summer')).toBe('flies');
  });
});

describe('licol et poids', () => {
  it('il faut un licol pour mener un cheval', () => {
    const p = createProfile('A');
    const horse = createAnimal({ species: 'horse', ageDays: 80 });
    p.animals.push(horse);
    expect(canLead(horse).reason).toBe('needHalter');
    equip(p, horse, 'halter', 'green');
    expect(canLead(horse).ok).toBe(true);
  });

  it('trop de friandises font grossir', () => {
    const dog = createAnimal({ species: 'dog', ageDays: 40 });
    for (let i = 0; i < 8; i++) applyCare(dog, 'treat');
    expect(weightClass(dog)).toBe('fat');
  });
});

describe('laisse', () => {
  it('il faut un collier et une laisse ; un chien dressé marche au pied', () => {
    const p = createProfile('A');
    const dog = createAnimal({ species: 'dog', ageDays: 40 });
    p.animals.push(dog);
    expect(canLeash(dog)).toBe(false);
    equip(p, dog, 'collar', 'red');
    equip(p, dog, 'leash');
    expect(canLeash(dog)).toBe(true);
    const puppy = heelSkill(dog);
    dog.skills.obedience = 90;
    dog.tricks.heel = 100;
    expect(heelSkill(dog)).toBeGreaterThan(puppy);
    expect(heelSkill(dog)).toBeGreaterThan(0.9);
  });
});
