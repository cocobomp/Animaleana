// Prénoms libres : un animal de client (pension, soins, concours, éducation, toilettage) ou un petit
// animal perdu ne porte jamais le prénom d'un de nos animaux (vu : chien de client « Tornade »).
import { describe, it, expect } from 'vitest';
import { createProfile } from '../src/sim/profile.js';
import { createAnimal, freeName, namesInUse, breed } from '../src/sim/animal.js';
import { NAMES } from '../src/sim/species.js';
import { seeded } from '../src/sim/rng.js';
import { createVisit, setVisitor } from '../src/sim/clients.js';
import { makeClientRequest } from '../src/sim/dogTrainer.js';
import { newClient, ensureGroomer } from '../src/sim/groomer.js';
import { startEvent } from '../src/sim/events.js';
import { startCareer } from '../src/sim/careers.js';

const LAST = 'Kiwi';
/** Un profil dont les animaux portent tous les prénoms de la liste, sauf « Kiwi ». */
function crowded() {
  const p = createProfile('Lou');
  p.level = 10;
  p.animals = NAMES.filter((n) => n !== LAST).map((name, i) => createAnimal({ species: i % 2 ? 'dog' : 'cat', name, rng: seeded(name) }));
  return p;
}

describe('prénoms libres', () => {
  it('freeName : un prénom que personne ne porte, sans tenir compte des majuscules', () => {
    const taken = NAMES.filter((n) => n !== 'Olive').map((n) => n.toUpperCase());
    expect(freeName(taken, seeded('a'))).toBe('Olive');
    // Tous pris : un numéro est ajouté.
    const name = freeName([...NAMES, 'Caramel 2'], () => 0);
    expect(name).toBe('Caramel 3');
  });

  it('sans prénom pris, le tirage ne change pas (mêmes animaux qu’avant pour une même graine)', () => {
    expect(createAnimal({ species: 'dog', rng: seeded('x') }).name).toBe(createAnimal({ species: 'dog', rng: seeded('x'), avoidNames: [] }).name);
  });

  it('namesInUse : nos animaux, le visiteur qui attend, les clients du salon et le maître qui attend', () => {
    const p = createProfile('Lou');
    p.animals = [createAnimal({ species: 'dog', name: 'Tornade' })];
    setVisitor(p, { animal: { name: 'Biscuit' } });
    ensureGroomer(p).clients.push({ animal: { name: 'Moka' } });
    p.dogTrainer = { clients: [], history: [], pending: { req: { dog: { name: 'Pixel' } }, day: 1 } };
    expect(namesInUse(p).sort()).toEqual(['Biscuit', 'Moka', 'Pixel', 'Tornade']);
  });

  it('l’animal d’un client (pension, soins, concours de beauté) prend le seul prénom libre', () => {
    for (const kind of ['pension', 'vet', 'handler']) {
      for (const seed of ['a', 'b', 'c']) {
        const p = crowded();
        startCareer(p, kind, 1, { level: 10 });
        const v = createVisit(p, { day: 2, clock: 2 * 1440 + 600, place: 'maison' }, seeded(kind + seed), kind);
        expect(v.animal.name, kind).toBe(LAST);
      }
    }
  });

  it('le chien d’un client de l’éducateur canin, l’animal du salon de toilettage et l’animal perdu aussi', () => {
    let p = crowded();
    expect(makeClientRequest(p, { day: 2, rng: seeded('dt') }).dog.name).toBe(LAST);
    p = crowded();
    startCareer(p, 'groomer', 1, { level: 10 });
    expect(newClient(p, { rng: seeded('grm'), day: 2 }).animal.name).toBe(LAST);
    p = crowded();
    const ctx = {
      clock: 14 * 60, hour: 14, season: 'summer', place: 'maison', isHome: true, weather: 'clear', temperature: 22, day: 1,
      animals: p.animals, whereOf: () => 'house', ridingId: null,
    };
    expect(startEvent(p, 'lostPet', ctx, seeded('lost'), true).data.stray.name).toBe(LAST);
  });

  it('les bébés d’une portée : ni le prénom d’un animal de la ferme (ni des parents), ni deux fois le même', () => {
    // (vu : « Bienvenue Mistral, Orion, Félix ! » alors que le père s’appelait déjà Mistral)
    const first = freeName([], () => 0); // le prénom que tire un hasard « toujours 0 »
    const dad = createAnimal({ species: 'rabbit', sex: 'm', name: first, ageDays: 80, rng: seeded('d') });
    const mum = createAnimal({ species: 'rabbit', sex: 'f', name: 'Neige', ageDays: 80, rng: seeded('m') });
    const p = createProfile('Lou');
    const other = createAnimal({ species: 'dog', name: freeName([first, 'Neige'], () => 0), rng: seeded('o') });
    p.animals = [dad, mum, other];
    mum.pregnant = { due: 1, father: dad.id };
    let n = 0;
    const rng = () => ((n++ % 7) === 0 ? 0.99 : 0); // (la portée la plus grande, puis « toujours 0 »)
    const babies = breed(mum, dad, 1, rng, namesInUse(p));
    expect(babies.length).toBeGreaterThanOrEqual(2);
    const names = babies.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
    for (const nm of names) expect([first, 'Neige', other.name]).not.toContain(nm);
  });
});
