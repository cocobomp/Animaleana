// Animaux proposés à l'adoption : ils changent chaque jour de jeu et selon le lieu.

import { SPECIES, SPECIES_IDS } from './species.js';
import { createAnimal } from './animal.js';
import { DAYS_PER_YEAR } from './time.js';
import { seeded, pick } from './rng.js';

/** Races proposées : à la maison, les races courantes + celles de la région ; en voyage, les races locales. */
export function breedsFor(placeId, isHome = false) {
  const list = [];
  for (const sid of SPECIES_IDS) {
    for (const b of SPECIES[sid].breeds) {
      // homeShop : race d'ailleurs, mais si courante en France qu'on la trouve aussi à la maison.
      if (b.origin === placeId || (isHome && (b.origin === null || b.homeShop))) list.push({ species: sid, breed: b });
    }
  }
  if (!list.length) return breedsFor(placeId, true);
  return list;
}

/** Au refuge, on recueille les animaux gratuitement. */
export function adoptionPrice() {
  return 0;
}

export const AGE_STAGES = ['baby', 'young', 'adult'];

/** Âge (en jours de jeu) pour chaque choix d'âge à l'animalerie. */
export function stageAgeDays(speciesId, stage) {
  const sp = SPECIES[speciesId];
  const adult = sp.adultYears * DAYS_PER_YEAR;
  if (stage === 'baby') return adult * 0.15;
  if (stage === 'young') return adult * 0.6;
  return adult * 1.6;
}

/**
 * Prix à l'animalerie / à l'élevage : prix de base de l'espèce, plus cher pour une race
 * rare et prisée. Un cheval adulte (déjà débourré) coûte plus cher qu'un poulain ;
 * pour les petits animaux, c'est le bébé qui est le plus demandé.
 */
export function shopPrice(speciesId, breedId, stage = 'young') {
  const sp = SPECIES[speciesId];
  const breed = sp.breeds.find((b) => b.id === breedId);
  const rarity = breed?.rarity ?? 1;
  const breedFactor = (0.7 + 0.45 * rarity ** 1.4) * (breed?.priceMul ?? 1); // priceMul : race très recherchée
  const big = ['horse', 'cow'].includes(speciesId);
  const ageFactor = { baby: big ? 0.75 : 1.2, young: 1, adult: big ? 1.3 : 0.85 }[stage];
  // Une race peut avoir son propre prix de base (chats : catBreeds.js).
  return Math.round(((breed?.price ?? sp.price * breedFactor) * ageFactor) / 5) * 5;
}

/** Races vendues : à l'animalerie de la maison, les races courantes et locales ; en voyage, celles de l'élevage local. */
export function shopBreeds(placeId, isHome) {
  return breedsFor(placeId, isHome);
}

/** Liste du jour, identique tant que le jour ne change pas (graine fixe). */
export function adoptionCandidates(placeId, day, adoptedKeys = [], isHome = false) {
  const rng = seeded(`adopt-${placeId}-${day}`);
  const pool = breedsFor(placeId, isHome);
  const count = isHome ? 9 : 5;
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
