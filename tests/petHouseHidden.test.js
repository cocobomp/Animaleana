// Maison des animaux : un chat ou un lapin rangé pour la nuit reste caché quand son modèle est refait (modèle réaliste
// arrivé après le rechargement, chaton ou lapereau qui grandit dedans : AnimalEntity.rebuildModel). Sans cela, il
// apparaissait dehors devant la porte. Math.random est remplacé par une suite fixe : le test ne dépend d'aucun tirage.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';

let AnimalEntity;
let createAnimal;
const realRandom = Math.random;

beforeAll(async () => {
  let s = 4242;
  Math.random = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  // (étiquette du nom : un faux canvas 2D suffit dans node)
  const ctx2d = new Proxy({}, {
    get: (_, k) => {
      if (k === 'measureText') return () => ({ width: 40 });
      if (k === 'getImageData' || k === 'createImageData') return (x, y, w = 1, h = 1) => ({ data: new Uint8ClampedArray((w | 0 || 1) * (h | 0 || 1) * 4), width: w, height: h });
      return () => ctx2d;
    },
  });
  globalThis.document = globalThis.document ?? {
    addEventListener() {}, hidden: false, documentElement: { lang: 'fr' }, body: { classList: { add() {}, remove() {} } },
    getElementById: () => null, createElement: () => ({ getContext: () => ctx2d, style: {}, width: 0, height: 0 }),
  };
  globalThis.window = globalThis.window ?? { addEventListener() {}, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 };
  ({ AnimalEntity } = await import('../src/game/AnimalEntity.js'));
  ({ createAnimal } = await import('../src/sim/animal.js'));
}, 60000);

afterAll(() => {
  Math.random = realRandom;
});

const world = { stallOf: () => null, heightAt: () => 0, isWater: () => false, resolveCollisions() {} };

describe('maison des animaux : modèle refait pendant la nuit', () => {
  it.each([['cat', 'europeen'], ['rabbit', 'nain']])('%s rangé dedans : le nouveau modèle reste caché ; dehors : visible', (species, breed) => {
    const a = createAnimal({ species, breed, colorIndex: 0, ageDays: 80, seed: 9 });
    const scene = new THREE.Group();
    const e = new AnimalEntity(a, world, scene);
    // rangé pour la nuit (Game : e.inside, racine cachée)
    e.inside = true;
    e.root.visible = false;
    const old = e.root;
    e.rebuildModel();
    expect(e.root).not.toBe(old);
    expect(e.root.visible).toBe(false);
    expect(scene.children).toContain(e.root);
    // sorti le matin : un modèle refait se voit
    e.inside = false;
    e.root.visible = true;
    e.rebuildModel();
    expect(e.root.visible).toBe(true);
  });
});
