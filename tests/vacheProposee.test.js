// La vache est proposée comme nouvel animal (src/sim/species.js : OFFERED_SPECIES, 'cow' ajoutée en dernier quand la
// vache de Lyndon Daniels et le taureau Rocketbox sont arrivés) : avec la liste du JEU (pas un scénario), tout revient
// pour elle — animalerie, refuge, voyages en van, clients des métiers, concours de beauté, quêtes, étable et pré,
// brosse à vaches et seau à lait, traite des femelles (jamais des taureaux), école vétérinaire, berger, éducateur canin.
// Tests déterministes : graines fixes (seeded, mulberry32), aucun Math.random.

import { describe, it, expect } from 'vitest';
import { SPECIES, SPECIES_IDS, OFFERED_SPECIES, isOffered, offeredSpeciesIds, allOffered } from '../src/sim/species.js';
import { shopBreeds, adoptionCandidates, breedsFor } from '../src/sim/adoption.js';
import { createProfile } from '../src/sim/profile.js';
import { createAnimal } from '../src/sim/animal.js';
import { createVisit } from '../src/sim/clients.js';
import { startCareer, rankNewSpecies, CAREERS } from '../src/sim/careers.js';
import { visibleClasses, classOf, classRivals } from '../src/sim/beauty.js';
import { OBJECTIVES, objectiveShown } from '../src/sim/objectives.js';
import { structureShown, accepts } from '../src/sim/construction.js';
import { equipmentShown, helperShown, buyEquipment, tickProduce, collectProduct, canProduce, EQUIPMENT } from '../src/sim/farm.js';
import { toolShown } from '../src/sim/tools.js';
import { wishList } from '../src/sim/cargo.js';
import { needsTrailer, planTrip } from '../src/sim/trip.js';
import { heartSortFor, vsTextKey } from '../src/sim/vetSchool.js';
import { seeded, mulberry32 } from '../src/sim/rng.js';
import { PLACE_IDS } from '../src/sim/places.js';

const cow = (sex = 'f', seed = `vache-${sex}`, ageDays = 80) => createAnimal({ species: 'cow', breed: 'normande', sex, ageDays, rng: seeded(seed) });

describe('la vache est proposée (liste du jeu)', () => {
  it('OFFERED_SPECIES : la vache en dernier ; toutes les espèces du jeu sont proposées', () => {
    expect(isOffered('cow')).toBe(true);
    expect([...OFFERED_SPECIES].at(-1)).toBe('cow');
    expect(allOffered()).toBe(true);
    expect(offeredSpeciesIds()).toEqual(SPECIES_IDS);
  });

  it('animalerie : des vaches à la maison, les 11 races chez les éleveurs du monde ; refuge : des vaches à adopter', () => {
    expect(shopBreeds('maison', true).some((x) => x.species === 'cow')).toBe(true);
    const all = new Set();
    for (const place of PLACE_IDS) for (const x of shopBreeds(place, place === 'maison')) if (x.species === 'cow') all.add(x.breed.id);
    expect([...all].sort()).toEqual(SPECIES.cow.breeds.map((b) => b.id).sort());
    expect(breedsFor('maison', true).some((x) => x.species === 'cow')).toBe(true);
    const seen = new Set();
    for (let day = 1; day <= 12; day++) for (const a of adoptionCandidates('maison', day, [], true)) seen.add(a.species);
    expect(seen.has('cow')).toBe(true);
  });

  it('voyages : la vache monte dans le van, avec son foin et son seau à lait', () => {
    const a = cow();
    expect(needsTrailer(a)).toBe(true);
    const wish = wishList([a], 'van');
    expect(wish).toContain('milkPail');
    const trip = planTrip({ mode: 'van', km: 120, animals: [a] });
    expect(trip.vehicle).toBe('trailer');
  });

  it('clients : le vétérinaire et la pension reçoivent des vaches au rang qui les apporte', () => {
    const p = createProfile('Lou');
    p.level = 99;
    for (const id of ['vet', 'pension']) {
      expect(startCareer(p, id, 1).ok, id).not.toBe(false);
      const rank = CAREERS[id].perks.findIndex((k) => k.species?.includes('cow'));
      expect(rank, id).toBeGreaterThan(0);
      expect(rankNewSpecies(id, rank), id).toContain('cow');
      p.careers.xp[id] = CAREERS[id].ranks[rank];
      const seen = new Set();
      for (let i = 0; i < 300; i++) seen.add(createVisit(p, { species: SPECIES_IDS, day: 5 }, mulberry32(i + 1), id === 'vet' ? 'autoVet' : 'autoPension').animal.species);
      expect(seen.has('cow'), id).toBe(true);
    }
  });

  it('concours de beauté : la classe de la ferme (vaches, moutons, chèvres) ; concurrentes vaches', () => {
    const p = createProfile('Lou');
    expect(visibleClasses(p)).toContain('farm');
    expect(classOf('cow')).toBe('farm');
    const comp = { id: 'beaute-test', level: 2 };
    const sp = new Set(classRivals(comp, 'farm', 30).map((r) => r.species));
    expect(sp.has('cow')).toBe(true);
  });

  it('quêtes, étable et pré, brosse à vaches, seau à lait, berger : affichés et achetables', () => {
    const p = createProfile('Lou');
    p.money = 100000;
    p.xp = 5000;
    for (const o of OBJECTIVES.filter((x) => x.needs?.includes('cow'))) expect(objectiveShown(p, o), o.id).toBe(true);
    for (const s of ['barn', 'pasture', 'shelter', 'ranch']) {
      expect(accepts(s, 'cow'), s).toBe(true);
      expect(structureShown(p, s), s).toBe(true);
    }
    expect(EQUIPMENT.cowBrush.serves).toContain('cow');
    expect(equipmentShown(p, 'cowBrush')).toBe(true);
    expect(buyEquipment(p, 'cowBrush', 'maison').ok).toBe(true);
    expect(toolShown(p, 'milkPail')).toBe(true);
    expect(helperShown(p, 'shepherd')).toBe(true);
  });

  it('traite : la vache adulte donne son lait ; le taureau et le veau jamais', () => {
    const p = createProfile('Lou', 'manage');
    const f = cow('f');
    expect(canProduce(f)).toBe(true);
    tickProduce(f, 24);
    expect(f.produceReady).toBe(true);
    const before = p.money;
    expect(collectProduct(p, f).ok).toBe(true);
    expect(p.money).toBeGreaterThan(before);
    const m = cow('m');
    tickProduce(m, 48);
    expect(canProduce(m)).toBe(false);
    expect(collectProduct(p, m).ok).toBe(false);
    const calf = cow('f', 'veau', 2);
    expect(canProduce(calf)).toBe(false);
  });

  it('école vétérinaire : la vache dans le tri des cœurs et dans les textes (pas leur variante sans elle)', () => {
    const p = createProfile('Lou');
    expect(heartSortFor(p)).toContain('cow');
    expect(vsTextKey(p, 'vs_vitals_q2_a3')).toBe('vs_vitals_q2_a3');
  });
});
