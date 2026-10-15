// Animaux proposés à l'adoption : ils changent chaque jour de jeu et selon le lieu.

import { SPECIES, SPECIES_IDS } from './species.js';
import { createAnimal } from './animal.js';
import { DAYS_PER_YEAR } from './time.js';
import { seeded, pick } from './rng.js';
import { PLACES } from './places.js';

export function breedsFor(placeId) {
  const home = PLACES[placeId].home;
  const list = [];
  for (const sid of SPECIES_IDS) {
    for (const b of SPECIES[sid].breeds) {
      if (home ? b.origin === null : b.origin === placeId) list.push({ species: sid, breed: b });
    }
  }
  return list;
}

export function adoptionPrice(a) {
  const sp = SPECIES[a.species];
  const breed = sp.breeds.find((b) => b.id === a.breed);
  return Math.round(sp.price * (breed?.rarity ?? 1) * (a.ageDays < sp.adultYears * DAYS_PER_YEAR ? 1.2 : 1));
}

/** Liste du jour, identique tant que le jour ne change pas (graine fixe). */
export function adoptionCandidates(placeId, day, adoptedKeys = []) {
  const rng = seeded(`adopt-${placeId}-${day}`);
  const pool = breedsFor(placeId);
  const count = PLACES[placeId].home ? 8 : 5;
  const out = [];
  for (let i = 0; i < count; i++) {
    const key = `${placeId}-${day}-${i}`;
    // Les espèces sont tirées à tour de rôle pour qu'il y ait toujours de tout.
    const sid = SPECIES_IDS[i % SPECIES_IDS.length];
    const choices = pool.filter((p) => p.species === sid);
    const { breed } = choices.length ? pick(choices, rng) : pick(pool, rng);
    const species = choices.length ? sid : pool.find((p) => p.breed === breed).species;
    const sp = SPECIES[species];
    const young = rng() < 0.35;
    const ageDays = young
      ? sp.adultYears * DAYS_PER_YEAR * (0.2 + rng() * 0.6)
      : sp.adultYears * DAYS_PER_YEAR + rng() * sp.lifespanYears * 0.45 * DAYS_PER_YEAR;
    const animal = createAnimal({ species, breed: breed.id, ageDays, rng, location: placeId, day });
    animal.adoptKey = key;
    if (!adoptedKeys.includes(key)) out.push(animal);
  }
  return out;
}
