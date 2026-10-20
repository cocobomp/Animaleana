// Proportions du cheval réaliste par race (plan « cheval beau », étape 7) : chevaux de selle presque carrés à la
// poitrine profonde, garrot marqué, traits massifs, poneys ronds aux membres courts, poulain aux longues jambes et
// à la grosse tête. Mesures sur la géométrie de repos de chaque race (tests/helpers/horseProportions.js). Avant
// l'étape 7 : selle français poitrine 0,47 du garrot et corps 1,15 ; pur-sang 0,43 et vide sous la poitrine 0,57.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealHorseModel, realHorseBase } from '../src/game/models/horseReal.js';
import { createAnimal } from '../src/sim/animal.js';
import { SPECIES } from '../src/sim/species.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';
import { horseProportions } from './helpers/horseProportions.js';

let gltf;
beforeAll(async () => {
  gltf = await loadRealHorseGltf();
  realHorseBase(gltf);
}, 60000);

const cache = new Map();
/** Proportions (et quelques repères) d'une race, adulte ou poulain. */
function measure(breed, foal = false) {
  const key = `${breed}${foal ? '*' : ''}`;
  if (cache.has(key)) return cache.get(key);
  const a = createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: foal ? 60 : 900, seed: 3 });
  const md = buildRealHorseModel(foal ? { ...a.look, foal: true } : a.look, a.breed, gltf);
  const p = horseProportions(md);
  md.root.updateMatrixWorld(true);
  const wp = (g) => g.getWorldPosition(new THREE.Vector3());
  p.neckLen = wp(md.neck).distanceTo(wp(md.head));
  // (taille de l'oreille : de son attache à la pointe de sa peau, rapportée à la longueur de la tête)
  const g = md.coatMesh.geometry;
  const ear = wp(md.ears[0]);
  let tip = 0;
  const si = g.attributes.skinIndex;
  const v = new THREE.Vector3();
  const earBone = md.skeleton.bones.findIndex((b) => b.name === 'EarL');
  for (let i = 0; i < g.attributes.position.count; i++) {
    if (si.getX(i) !== earBone) continue;
    tip = Math.max(tip, v.fromBufferAttribute(g.attributes.position, i).distanceTo(ear));
  }
  p.ear = tip / md.dims.snoutZ;
  md.dispose();
  cache.set(key, p);
  return p;
}

const SADDLE = ['selle_francais', 'pur_sang', 'arabe', 'saddlebred', 'knabstrupper'];

describe('chevaux de selle : presque carrés, poitrine profonde, garrot marqué', () => {
  it.each(SADDLE)('%s : poitrine 0,48 à 0,52 du garrot, corps 1,00 à 1,07, vide sous la poitrine 0,48 à 0,53', (breed) => {
    const p = measure(breed);
    expect(p.depth).toBeGreaterThanOrEqual(0.48);
    expect(p.depth).toBeLessThanOrEqual(0.52);
    expect(p.long).toBeGreaterThanOrEqual(1.0);
    expect(p.long).toBeLessThanOrEqual(1.07);
    expect(p.gap).toBeGreaterThanOrEqual(0.48);
    expect(p.gap).toBeLessThanOrEqual(0.53);
  });

  it.each(SADDLE)('%s : garrot au moins aussi haut que la croupe, dos peu creusé (moins de 4,5 % du garrot)', (breed) => {
    const p = measure(breed);
    expect(p.withers).toBeGreaterThanOrEqual(p.croup);
    expect(p.sway / p.withers).toBeLessThan(0.045);
  });

  it('le pur-sang reste le plus élancé des chevaux de selle (vide sous la poitrine le plus grand après l\'Akhal-Teké)', () => {
    const ps = measure('pur_sang');
    expect(ps.gap).toBeGreaterThan(measure('selle_francais').gap);
    expect(ps.gap).toBeGreaterThan(measure('quarter').gap);
    expect(measure('akhal_teke').gap).toBeGreaterThanOrEqual(ps.gap);
  });
});

describe('races : silhouettes qu\'on reconnaît', () => {
  it('traits massifs : poitrine plus profonde que les chevaux de selle, corps plus long', () => {
    for (const breed of ['percheron', 'trait_breton', 'boulonnais', 'comtois']) {
      const p = measure(breed);
      expect(p.depth, breed).toBeGreaterThan(0.53);
      expect(p.depth, breed).toBeGreaterThan(measure('selle_francais').depth + 0.03);
    }
  });

  it('poneys ronds : poitrine profonde, membres courts (Shetland le plus court), petites oreilles', () => {
    for (const breed of ['shetland', 'welsh', 'islandais', 'kiso']) {
      const p = measure(breed);
      expect(p.depth, breed).toBeGreaterThan(0.55);
      expect(p.gap, breed).toBeLessThan(0.45);
      expect(p.ear, breed).toBeLessThan(measure('selle_francais').ear * 0.92);
    }
    expect(measure('shetland').gap).toBeLessThan(measure('welsh').gap);
    expect(measure('shetland').ear).toBeLessThan(measure('welsh').ear);
  });

  it('Haflinger trapu : encolure plus courte, poitrine plus profonde qu\'un cheval de selle', () => {
    const h = measure('haflinger');
    const sf = measure('selle_francais');
    expect(h.neckLen).toBeLessThan(sf.neckLen * 0.95);
    expect(h.depth).toBeGreaterThan(sf.depth + 0.03);
    expect(h.long).toBeLessThan(1.07);
  });
});

describe('poulain', () => {
  it.each(['selle_francais', 'arabe', 'shetland', 'percheron'])('%s : longues jambes, corps court et peu profond, grosse tête', (breed) => {
    const f = measure(breed, true);
    const a = measure(breed);
    expect(f.gap).toBeGreaterThan(a.gap + 0.08);
    expect(f.depth).toBeLessThan(a.depth - 0.08);
    expect(f.long).toBeLessThan(a.long - 0.08);
    expect(f.head).toBeGreaterThan(a.head * 1.05); // (tête plus grosse par rapport au corps)
  });

  it('cheval de selle : vide sous la poitrine plus de 0,6 du garrot, corps moins long que haut', () => {
    const f = measure('selle_francais', true);
    expect(f.gap).toBeGreaterThan(0.6);
    expect(f.long).toBeLessThan(0.95);
  });
});

describe('toutes les races', () => {
  it.each(SPECIES.horse.breeds.map((b) => b.id))('%s : proportions de cheval (ni girafe ni saucisse)', (breed) => {
    const p = measure(breed);
    expect(p.depth).toBeGreaterThan(0.44);
    expect(p.depth).toBeLessThan(0.6);
    expect(p.long).toBeGreaterThan(0.95);
    expect(p.long).toBeLessThan(1.15);
    expect(p.withers).toBeGreaterThanOrEqual(p.croup - 0.01);
  });
});
