// Espèces proposées (OFFERED_SPECIES, src/sim/species.js) : seules les espèces dont le modèle réaliste est en
// ligne sont proposées comme NOUVEL animal (animalerie, refuge, voyages, animal perdu, clients, concurrents,
// constructions, objets, quêtes) ; les animaux déjà là d'une autre espèce (anciennes parties) gardent tout.
// Tests déterministes : seulement du hasard avec graine (seeded, mulberry32).

import { describe, it, expect, afterEach } from 'vitest';
import {
  SPECIES, SPECIES_IDS, OFFERED_SPECIES, isOffered, offeredSpeciesIds, allOffered, speciesAvailable, anyAvailable, offeredOr,
} from '../src/sim/species.js';
import { breedsFor, shopBreeds, adoptionCandidates } from '../src/sim/adoption.js';
import { PLACE_IDS } from '../src/sim/places.js';
import { createProfile, migrate } from '../src/sim/profile.js';
import { createAnimal, mate, breed } from '../src/sim/animal.js';
import { startEvent, maybeStartEvent } from '../src/sim/events.js';
import { createVisit, acceptVisit, completeClient } from '../src/sim/clients.js';
import { startCareer, rankNewSpecies } from '../src/sim/careers.js';
import { newClient, acceptClient, ensureGroomer, REQUESTS, requestsFor } from '../src/sim/groomer.js';
import { rivals, competitionsAt } from '../src/sim/activities.js';
import { competitionRivals, calendar } from '../src/sim/competitions.js';
import { visibleClasses, classOf, classRivals } from '../src/sim/beauty.js';
import { buildingActions } from '../src/sim/buildings.js';
import { OBJECTIVES, objectiveShown, objectiveParams, checkObjectives } from '../src/sim/objectives.js';
import { suggestedQuest } from '../src/sim/tutorial.js';
import { STRUCTURES, structureShown, canBuild, build, canAssign } from '../src/sim/construction.js';
import {
  EQUIPMENT, HELPERS, equipmentShown, helperShown, buyEquipment, hireHelper, tickProduce, collectProduct, passiveEquipment,
} from '../src/sim/farm.js';
import { TOOLS, toolShown, toolSpecies, buyTool } from '../src/sim/tools.js';
import { serializeSave, parseSave } from '../src/sim/saveFile.js';
import { seeded, mulberry32 } from '../src/sim/rng.js';
import { DAYS_PER_YEAR } from '../src/sim/time.js';

// Une copie de la liste du jeu : chaque test qui la change la remet comme avant (interrupteur).
const START = new Set(OFFERED_SPECIES);
afterEach(() => {
  OFFERED_SPECIES.clear();
  for (const s of START) OFFERED_SPECIES.add(s);
});

const HIDDEN = () => SPECIES_IDS.filter((s) => !isOffered(s));
const adult = (species, sex = 'f', seed = species + sex) => createAnimal({ species, sex, ageDays: 80, rng: seeded(seed) });

/** Une ancienne partie : vaches, moutons, chèvres, chats et lapins (et un cheval, un chien). */
function oldSave() {
  const p = createProfile('Ancienne', 'manage');
  p.money = 100000;
  p.xp = 5000; // (tout est débloqué)
  for (const sp of ['cow', 'sheep', 'goat', 'cat', 'rabbit', 'horse', 'dog']) {
    p.animals.push(adult(sp, 'f'), adult(sp, 'm'));
  }
  for (const a of p.animals) a.location = 'maison';
  return p;
}

describe('espèces proposées : la liste', () => {
  it('une seule liste, facile à changer : aujourd\'hui le cheval et le chien', () => {
    expect([...OFFERED_SPECIES].sort()).toEqual(['dog', 'horse']);
    expect(offeredSpeciesIds()).toEqual(['horse', 'dog']); // (dans l'ordre de SPECIES)
    expect(isOffered('cat')).toBe(false);
    expect(allOffered()).toBe(false);
    // Rien n'est retiré du jeu : toutes les espèces restent dans SPECIES.
    expect(SPECIES_IDS).toEqual(['horse', 'dog', 'cat', 'rabbit', 'sheep', 'goat', 'cow']);
    expect(offeredOr('cat')).toBe('dog');
    expect(offeredOr('horse')).toBe('horse');
  });

  it('une espèce compte pour la partie si elle est proposée ou déjà à la ferme', () => {
    const p = createProfile('A');
    expect(speciesAvailable(p, 'horse')).toBe(true);
    expect(speciesAvailable(p, 'rabbit')).toBe(false);
    expect(anyAvailable(p, [])).toBe(true);
    expect(anyAvailable(p, null)).toBe(true);
    expect(anyAvailable(p, ['cat', 'rabbit'])).toBe(false);
    p.animals.push(adult('rabbit'));
    expect(anyAvailable(p, ['cat', 'rabbit'])).toBe(true);
  });
});

describe('aucun nouvel animal d\'une espèce pas encore proposée', () => {
  it('refuge et animalerie de la maison, élevages des voyages : 300 jours, tous les lieux', () => {
    for (const place of ['maison', ...PLACE_IDS]) {
      for (const isHome of [true, false]) {
        const pool = shopBreeds(place, isHome);
        expect(pool.length).toBeGreaterThan(0); // (chaque lieu a au moins une race de cheval ou de chien)
        expect(pool.every((x) => isOffered(x.species))).toBe(true);
        for (let day = 1; day <= 300; day += 7) {
          const list = adoptionCandidates(place, day, [], isHome);
          expect(list.length).toBeGreaterThan(0);
          for (const a of list) expect(isOffered(a.species), `${place} jour ${day} : ${a.species}`).toBe(true);
        }
      }
    }
  });

  it('au refuge de la maison : chevaux et chiens à tour de rôle, la liste du jour ne change pas', () => {
    const list = adoptionCandidates('maison', 12, [], true);
    expect(list.map((a) => a.species)).toEqual(['horse', 'dog', 'horse', 'dog', 'horse', 'dog', 'horse', 'dog', 'horse']);
    expect(adoptionCandidates('maison', 12, [], true).map((a) => a.id === undefined || a.adoptKey)).toEqual(list.map((a) => a.adoptKey));
  });

  it('chaque lieu de voyage a des races locales proposées (cheval ou chien)', () => {
    for (const place of PLACE_IDS) {
      if (place === 'maison') continue;
      const local = breedsFor(place, false).filter((x) => x.breed.origin === place);
      expect(local.length, place).toBeGreaterThan(0);
    }
  });

  it('le catalogue complet garde toutes les races (pour vérifier les chats, par exemple)', () => {
    const all = breedsFor('maison', true, { all: true });
    expect(new Set(all.map((x) => x.species))).toEqual(new Set(SPECIES_IDS));
  });

  it('le petit animal perdu : 400 graines, toujours une espèce proposée', () => {
    const species = new Set();
    for (let i = 0; i < 400; i++) {
      const p = createProfile('A');
      const ctx = { clock: 14 * 60, hour: 14, season: 'summer', place: 'maison', isHome: true, weather: 'clear', temperature: 20, day: 3, animals: [], whereOf: () => 'out' };
      const ev = startEvent(p, 'lostPet', ctx, seeded(`perdu-${i}`), true);
      species.add(ev.data.stray.species);
    }
    expect([...species].every(isOffered)).toBe(true);
    expect(species.has('dog')).toBe(true);
  });

  it('clients de la pension, du véto et du handler : tous les rangs, 300 graines chacun', () => {
    const allSpecies = { species: SPECIES_IDS, day: 5, clock: 600, place: 'maison' };
    for (const career of ['vet', 'pension', 'handler']) {
      for (const xp of [0, 200, 1000]) {
        const p = createProfile('A', 'manage');
        p.xp = 5000;
        startCareer(p, career, 1, { level: 10 });
        p.careers.xp[career] = xp;
        const seen = new Set();
        for (let i = 0; i < 300; i++) {
          const v = createVisit(p, allSpecies, mulberry32(i + 1), career);
          seen.add(v.animal.species);
        }
        expect([...seen].filter((s) => !isOffered(s)), `${career} xp ${xp}`).toEqual([]);
      }
    }
    // Visites automatiques (le village s'en occupe) : pareil.
    const p = createProfile('A');
    for (let i = 0; i < 100; i++) expect(isOffered(createVisit(p, allSpecies, mulberry32(i + 9), i % 2 ? 'autoVet' : 'autoPension').animal.species)).toBe(true);
  });

  it('clients du salon de toilettage : tous les rangs, pas de concours des moutons', () => {
    for (const xp of [0, 300, 900]) {
      const p = createProfile('A', 'manage');
      ensureGroomer(p);
      p.careers.xp.groomer = xp;
      const requests = new Set();
      for (let i = 0; i < 300; i++) {
        const c = newClient(p, { rng: mulberry32(1000 + i), day: 4 });
        expect(isOffered(c.animal.species), `rang xp ${xp} : ${c.animal.species}`).toBe(true);
        requests.add(c.request);
      }
      expect(requests.has('sheepShow')).toBe(false);
    }
    // (pour tester, on peut toujours forcer une demande et une espèce : src/game/Groomer.js, force)
    const p = createProfile('A');
    expect(newClient(p, { requestId: 'sheepShow', rng: mulberry32(3) }).animal.species).toBe('sheep');
    expect(newClient(p, { requestId: 'bathCut', species: 'cat', rng: mulberry32(3) }).animal.species).toBe('cat');
  });

  it('concurrents des activités et des concours : seulement des espèces proposées', () => {
    for (let day = 1; day < 120; day++) {
      for (const comp of competitionsAt('maison', true, day, 1)) {
        for (const r of rivals(comp, 6)) expect(isOffered(r.species), `${comp.type} ${r.species}`).toBe(true);
      }
    }
    for (const comp of calendar(1, 120)) {
      for (const r of competitionRivals(comp)) expect(isOffered(r.species)).toBe(true);
    }
  });

  it('simulation : 150 jours de partie, 5 graines (événements, visiteurs, salon, refuge)', () => {
    let strays = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const rng = mulberry32(seed * 7919);
      const p = createProfile(`S${seed}`, 'manage');
      p.xp = 5000;
      for (const career of ['vet', 'pension', 'handler']) startCareer(p, career, 1, { level: 10 });
      ensureGroomer(p);
      p.animals.push(adult('horse', 'f', `h${seed}`), adult('dog', 'm', `d${seed}`));
      const before = new Set(p.animals.map((a) => a.id));
      const arrivals = [];
      for (let day = 1; day <= 150; day++) {
        // Les métiers montent de rang au fil des jours.
        for (const career of ['vet', 'pension', 'handler']) p.careers.xp[career] = day * 4;
        p.careers.xp.groomer = day * 7;
        for (let hour = 0; hour < 24; hour++) {
          const clock = (day - 1) * 1440 + hour * 60;
          const ctx = { clock, hour, season: 'summer', place: 'maison', isHome: true, weather: 'clear', temperature: 20, day, animals: p.animals, whereOf: () => 'out' };
          const ev = maybeStartEvent(p, ctx, rng);
          if (ev?.data?.stray) {
            arrivals.push(ev.data.stray.species);
            strays++;
          }
          if (p.events.active) p.events.active = null; // (événement suivant possible)
        }
        arrivals.push(createVisit(p, { species: SPECIES_IDS, day, clock: day * 1440, place: 'maison' }, rng).animal.species);
        arrivals.push(newClient(p, { rng, day }).animal.species);
        for (const a of adoptionCandidates('maison', day, [], true)) arrivals.push(a.species);
      }
      expect(arrivals.length).toBeGreaterThan(150 * 11);
      expect(arrivals.filter((s) => !isOffered(s)), `graine ${seed}`).toEqual([]);
      expect(p.animals.filter((a) => !before.has(a.id))).toEqual([]); // (aucun animal ajouté en douce)
    }
    expect(strays).toBeGreaterThan(5); // (le petit animal perdu est bien venu plusieurs fois)
  });

  it('les textes des rangs ne promettent que des espèces proposées', () => {
    expect(rankNewSpecies('vet', 0)).toEqual(['dog']);
    expect(rankNewSpecies('vet', 1)).toEqual(['horse']);
    expect(rankNewSpecies('vet', 2)).toEqual([]); // (la vache : pas encore)
    expect(rankNewSpecies('groomer', 2)).toEqual([]); // (le mouton : pas encore)
  });
});

describe('ce qu\'on ne propose plus dans une nouvelle partie', () => {
  it('concours de beauté : seulement les classes des chevaux et des chiens', () => {
    const p = createProfile('A');
    expect(visibleClasses(p)).toEqual(['horses', 'dogs']);
  });

  it('lapin-hop : le bouton disparaît du terrain de concours sans lapin', () => {
    const ctx = { hour: 10, season: 'summer', home: true, count: { horse: 1, rabbit: 0, livestock: 0, pets: 0 } };
    expect(buildingActions('showground', ctx).some((a) => a.id === 'actvHop')).toBe(false);
    expect(buildingActions('showground', { ...ctx, count: { ...ctx.count, rabbit: 1 } }).find((a) => a.id === 'actvHop').enabled).toBe(true);
  });

  it('construction : pas de clapier, mais tout le reste (chevaux, chiens, salon, décor)', () => {
    const p = createProfile('A', 'manage');
    p.xp = 5000;
    p.money = 100000;
    expect(structureShown(p, 'hutch')).toBe(false);
    expect(canBuild(p, 'hutch').reason).toBe('soon');
    expect(build(p, 'hutch', 'maison', 0, 0).ok).toBe(false);
    for (const type of Object.keys(STRUCTURES).filter((k) => k !== 'hutch')) expect(structureShown(p, type), type).toBe(true);
  });

  it('équipements, aides et outils : rien qui ne sert qu\'à une espèce pas encore proposée', () => {
    const p = createProfile('A', 'manage');
    p.money = 100000;
    const eq = Object.keys(EQUIPMENT).filter((k) => equipmentShown(p, k));
    expect(eq).toEqual(['petFeeder', 'petFountain', 'hayrack', 'paddockTrough', 'cowBrush']);
    for (const k of Object.keys(EQUIPMENT)) {
      if (!eq.includes(k)) expect(buyEquipment(p, k, 'maison').reason, k).toBe('soon');
    }
    expect(Object.keys(HELPERS).filter((k) => helperShown(p, k))).toEqual(['groom', 'petsitter', 'farmhand', 'vet']);
    expect(hireHelper(p, 'shepherd', 'maison', mulberry32(1)).reason).toBe('soon');
    const tools = Object.keys(TOOLS).filter((k) => toolShown(p, k));
    expect(tools).not.toContain('shears');
    expect(tools).not.toContain('milkPail');
    expect(tools).toContain('agilitySet'); // (le chien fait de l'agility)
    expect(toolSpecies('shears')).toEqual(['sheep']);
    expect(buyTool(p, 'milkPail').reason).toBe('soon');
  });

  it('quêtes : « espèces différentes » faisable avec 2 espèces, pas de quête de lapin', () => {
    const p = createProfile('A');
    const species4 = OBJECTIVES.find((o) => o.id === 'species4');
    expect(species4.progress(p)).toEqual([0, 2]);
    expect(objectiveParams(p, species4)).toEqual({ n: 2 });
    p.animals.push(adult('horse'), adult('dog'));
    expect(checkObjectives(p).map((o) => o.id)).toContain('species4');
    for (const id of ['actvHop1', 'actvHutch5']) expect(objectiveShown(p, OBJECTIVES.find((o) => o.id === id))).toBe(false);
    // Les animaux des clients ne comptent pas (ce ne sont pas les nôtres).
    const q = createProfile('B');
    const client = adult('dog');
    client.client = { id: 'x' };
    q.animals.push(adult('horse'), client);
    expect(species4.progress(q)).toEqual([1, 2]);
  });

  it('la quête conseillée n\'est jamais une quête cachée, même en dernier recours (simulation de 60 parties)', () => {
    for (let n = 0; n < 60; n++) {
      const rng = mulberry32(500 + n);
      const p = createProfile('A');
      p.animals.push(adult('horse'), adult('dog'));
      // Une partie plus ou moins avancée : une partie des quêtes est déjà finie.
      for (const o of OBJECTIVES) if (o.kind === 'quest' && rng() < 0.85) p.completed.push(o.id);
      const q = suggestedQuest(p, OBJECTIVES);
      if (q) expect(objectiveShown(p, q), q.id).toBe(true);
    }
    // Il ne reste que les quêtes du lapin : rien à conseiller.
    const p = createProfile('A');
    for (const o of OBJECTIVES) if (o.kind === 'quest' && !o.needs) p.completed.push(o.id);
    expect(suggestedQuest(p, OBJECTIVES)).toBeNull();
  });
});

describe('une ancienne partie avec vaches, moutons, chèvres, chats et lapins continue de marcher', () => {
  it('la sauvegarde se relit, rien n\'est retiré', () => {
    const p = oldSave();
    const text = serializeSave([p], { now: 1 });
    const back = parseSave(text);
    expect(back.ok).toBe(true);
    const q = migrate(back.profiles[0]);
    expect(q.animals.map((a) => a.species).sort()).toEqual(p.animals.map((a) => a.species).sort());
  });

  it('leurs bâtiments, objets, aides, outils et classes de concours restent là', () => {
    const p = oldSave();
    expect(structureShown(p, 'hutch')).toBe(true);
    expect(canBuild(p, 'hutch').ok).toBe(true);
    for (const k of Object.keys(EQUIPMENT)) expect(equipmentShown(p, k), k).toBe(true);
    for (const k of Object.keys(HELPERS)) expect(helperShown(p, k), k).toBe(true);
    for (const k of Object.keys(TOOLS)) expect(toolShown(p, k), k).toBe(true);
    expect(visibleClasses(p)).toEqual(['horses', 'dogs', 'cats', 'small', 'farm']);
    expect(classOf('cow')).toBe('farm');
    expect(classRivals({ id: 'c1', level: 1 }, 'farm', 3).every((r) => ['sheep', 'goat', 'cow'].includes(r.species))).toBe(true);
    for (const id of ['actvHop1', 'actvHutch5']) expect(objectiveShown(p, OBJECTIVES.find((o) => o.id === id))).toBe(true);
    expect(OBJECTIVES.find((o) => o.id === 'species4').progress(p)).toEqual([4, 4]);
  });

  it('un clapier déjà construit (sans lapin) reste au catalogue, et accueille les lapins', () => {
    const p = createProfile('A', 'manage');
    p.structures = [{ id: 's1', type: 'hutch', place: 'maison', x: 0, z: 0, rot: 0 }];
    expect(structureShown(p, 'hutch')).toBe(true);
    const r = adult('rabbit');
    r.location = 'maison';
    p.animals.push(r);
    expect(canAssign(p, r, p.structures[0]).ok).toBe(true);
  });

  it('laine, lait, litière : les produits et les objets marchent', () => {
    const p = oldSave();
    expect(buyTool(p, 'shears').ok).toBe(true);
    expect(buyTool(p, 'milkPail').ok).toBe(true);
    expect(buyEquipment(p, 'autoLitter', 'maison').ok).toBe(true);
    expect(buyEquipment(p, 'penFeeder', 'maison').ok).toBe(true);
    expect(hireHelper(p, 'shepherd', 'maison', mulberry32(2)).ok).toBe(true);
    const ewe = p.animals.find((a) => a.species === 'sheep' && a.sex === 'f');
    const cow = p.animals.find((a) => a.species === 'cow' && a.sex === 'f');
    for (const a of [ewe, cow]) {
      a.ageDays = 6 * DAYS_PER_YEAR;
      tickProduce(a, 200);
      expect(collectProduct(p, a).ok, a.species).toBe(true);
    }
    const cat = p.animals.find((a) => a.species === 'cat');
    cat.needs.hygiene = 10;
    passiveEquipment(p, [cat], 'maison', 4);
    expect(cat.needs.hygiene).toBeGreaterThan(10);
  });

  it('leurs petits naissent toujours (vache, chèvre, mouton, chat, lapin)', () => {
    const p = oldSave();
    for (const sp of ['cow', 'goat', 'sheep', 'cat', 'rabbit']) {
      const f = p.animals.find((a) => a.species === sp && a.sex === 'f');
      const m = p.animals.find((a) => a.species === sp && a.sex === 'm');
      for (const a of [f, m]) {
        a.ageDays = SPECIES[sp].adultYears * DAYS_PER_YEAR * 2;
        a.health = 100;
        a.bond = 5;
        for (const k of Object.keys(a.needs)) a.needs[k] = 100;
      }
      const mother = mate(f, m, 10);
      expect(mother.pregnant, sp).toBeTruthy();
      const babies = breed(mother, m, mother.pregnant.due, mulberry32(7), []);
      expect(babies.length, sp).toBeGreaterThan(0);
      expect(babies.every((b) => b.species === sp)).toBe(true);
    }
  });

  it('un client déjà là (chat en pension, mouton qui attend au salon) est toujours accepté et rendu', () => {
    const p = oldSave();
    startCareer(p, 'pension', 1, { level: 10 });
    const visit = createVisit(p, { species: ['dog'], day: 2, clock: 600, place: 'maison' }, mulberry32(4), 'pension');
    // L'ancienne sauvegarde avait un chat à la place du chien.
    visit.animal = adult('cat', 'f', 'client-chat');
    const r = acceptVisit(p, visit, 2);
    expect(r.ok).toBe(true);
    expect(r.animal.client.kind).toBe('pension');
    const done = completeClient(p, r.animal, visit.animal.client.until, mulberry32(8));
    expect(done.species).toBe('cat');
    expect(done.stars).toBeGreaterThan(0);
    expect(p.animals.some((a) => a.id === r.animal.id)).toBe(false); // (rendu à sa propriétaire)
    // Salon : un mouton qui attendait (rang expert).
    const q = oldSave();
    ensureGroomer(q);
    q.careers.xp.groomer = 900;
    const sheepClient = newClient(q, { requestId: 'sheepShow', rng: mulberry32(5) });
    q.groomer.clients.push(sheepClient);
    expect(acceptClient(q, sheepClient).ok).toBe(true);
    expect(requestsFor(q)).toContain('sheepShow'); // (la liste des demandes n'est pas touchée)
    expect(REQUESTS.sheepShow.species).toEqual(['sheep']);
  });
});

describe('interrupteur : ajouter une espèce à OFFERED_SPECIES la fait réapparaître partout', () => {
  it('les chats et les lapins reviennent (refuge, animalerie, perdu, clients, salon, construction, objets, quêtes)', () => {
    OFFERED_SPECIES.add('cat');
    OFFERED_SPECIES.add('rabbit');
    expect(offeredSpeciesIds()).toEqual(['horse', 'dog', 'cat', 'rabbit']);
    // Refuge : à tour de rôle cheval, chien, chat, lapin.
    expect(adoptionCandidates('maison', 12, [], true).map((a) => a.species).slice(0, 4)).toEqual(['horse', 'dog', 'cat', 'rabbit']);
    const shop = new Set(shopBreeds('maison', true).map((x) => x.species));
    expect(shop).toEqual(new Set(['horse', 'dog', 'cat', 'rabbit']));
    // Animal perdu : des chats aussi.
    const strays = new Set();
    for (let i = 0; i < 100; i++) {
      const ctx = { clock: 14 * 60, hour: 14, season: 'summer', place: 'maison', isHome: true, weather: 'clear', temperature: 20, day: 3, animals: [], whereOf: () => 'out' };
      strays.add(startEvent(createProfile('A'), 'lostPet', ctx, seeded(`perdu-${i}`), true).data.stray.species);
    }
    expect(strays.has('cat')).toBe(true);
    // Clients : des chats et des lapins.
    const p = createProfile('A');
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(createVisit(p, { species: SPECIES_IDS, day: 5 }, mulberry32(i + 1), 'autoVet').animal.species);
    expect(seen.has('cat') && seen.has('rabbit')).toBe(true);
    const groom = new Set();
    for (let i = 0; i < 200; i++) groom.add(newClient(p, { rng: mulberry32(2000 + i), day: 4 }).animal.species);
    expect(groom.has('cat')).toBe(true);
    // Construction, objets, quêtes, concours.
    expect(structureShown(p, 'hutch')).toBe(true);
    expect(equipmentShown(p, 'autoLitter')).toBe(true);
    expect(objectiveShown(p, OBJECTIVES.find((o) => o.id === 'actvHop1'))).toBe(true);
    expect(visibleClasses(p)).toEqual(['horses', 'dogs', 'cats', 'small']);
    expect(OBJECTIVES.find((o) => o.id === 'species4').progress(p)).toEqual([0, 4]);
    expect(rankNewSpecies('vet', 0)).toEqual(['dog', 'cat', 'rabbit']);
    // Les moutons ne sont pas encore là : pas de berger, pas de tondeuse.
    expect(helperShown(p, 'shepherd')).toBe(false);
    expect(toolShown(p, 'shears')).toBe(false);
  });

  it('les moutons, les chèvres et les vaches reviennent aussi : tout est proposé', () => {
    for (const s of SPECIES_IDS) OFFERED_SPECIES.add(s);
    expect(allOffered()).toBe(true);
    const p = createProfile('A');
    expect(helperShown(p, 'shepherd')).toBe(true);
    expect(toolShown(p, 'shears')).toBe(true);
    expect(visibleClasses(p)).toEqual(['horses', 'dogs', 'cats', 'small', 'farm']);
    expect(new Set(adoptionCandidates('maison', 3, [], true).map((a) => a.species))).toEqual(new Set(SPECIES_IDS));
    expect(HIDDEN()).toEqual([]);
  });
});
