import { describe, it, expect } from 'vitest';
import { checkTravel, rollWeather } from '../src/sim/places.js';
import { adoptionCandidates } from '../src/sim/adoption.js';

describe('voyages', () => {
  it('on peut aller dans les Alpes à cheval, mais pas au Japon', () => {
    expect(checkTravel('maison', 'alpes', 'horse', [], true).ok).toBe(true);
    expect(checkTravel('maison', 'japon', 'horse', [], true).reason).toBe('sea');
    expect(checkTravel('maison', 'japon', 'plane', []).ok).toBe(true);
  });

  it('un cheval ne rentre pas dans une voiture', () => {
    expect(checkTravel('maison', 'bretagne', 'car', [{ species: 'horse' }]).reason).toBe('horseNeedsVan');
    expect(checkTravel('maison', 'bretagne', 'van', [{ species: 'horse' }]).ok).toBe(true);
  });

  it('la météo est stable pour une même période', () => {
    expect(rollWeather('alpes', 'winter', 3)).toBe(rollWeather('alpes', 'winter', 3));
  });
});

describe('adoption', () => {
  it('propose des races locales en voyage', () => {
    const list = adoptionCandidates('japon', 1);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((a) => ['shiba', 'akita', 'bobtail', 'kiso'].includes(a.breed))).toBe(true);
  });

  it('retire les animaux déjà adoptés', () => {
    const list = adoptionCandidates('maison', 2);
    const again = adoptionCandidates('maison', 2, [list[0].adoptKey]);
    expect(again.length).toBe(list.length - 1);
  });
});
