// « Rentrer au box » : le cheval va jusqu'à son box même quand l'enfant marche à côté de lui ; une fois chez lui,
// il s'arrête pour regarder l'enfant qui s'approche (AnimalEntity.update, bloc « attending »).
// Math.random est remplacé par une suite fixe : le test ne dépend d'aucun tirage.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as THREE from 'three';

let AnimalEntity;
let inStall;
let createAnimal;
const realRandom = Math.random;

beforeAll(async () => {
  let s = 12345;
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
  ({ AnimalEntity, inStall } = await import('../src/game/AnimalEntity.js'));
  ({ createAnimal } = await import('../src/sim/animal.js'));
}, 60000);

afterAll(() => {
  Math.random = realRandom;
});

const BOX = { x: -15, z: -6, r: 0.5 };

function setup() {
  const a = createAnimal({ species: 'horse', breed: 'selle_francais', colorIndex: 0, ageDays: 80, seed: 7 });
  a.needs.energy = 100;
  a.needs.hunger = 100;
  a.stalled = true;
  a.box = 0;
  const world = {
    stallOf: (d) => (d.stalled ? BOX : null),
    heightAt: () => 0,
    isWater: () => false,
    resolveCollisions() {},
  };
  const scene = new THREE.Group();
  const e = new AnimalEntity(a, world, scene);
  e.root.position.set(-14, 0, 16); // au paddock
  // Comme Interiors.stall : en route vers le box, avec 90 s pour y arriver.
  e.state = 'walk';
  e.target.set(BOX.x, 0, BOX.z);
  e.timer = 90;
  const game = { wantedEquipment: () => null, socialMoment() {}, animalsHere: () => [a] };
  return { a, e, game };
}

const distBox = (e) => Math.hypot(e.position.x - BOX.x, e.position.z - BOX.z);

describe('Rentrer au box avec l’enfant à côté', () => {
  it('inStall : arrivé à 1,2 m du centre du box au plus, jamais sans box', () => {
    expect(inStall(BOX, { x: BOX.x + 1, z: BOX.z })).toBe(true);
    expect(inStall(BOX, { x: BOX.x + 3, z: BOX.z })).toBe(false);
    expect(inStall(null, { x: BOX.x, z: BOX.z })).toBe(false);
  });

  it('l’enfant reste à 2,4 m de son point de départ : le cheval rentre quand même au box en moins de 60 s', () => {
    const { e, game } = setup();
    const playerPos = new THREE.Vector3(-14 + 2.4, 0, 16);
    const ctx = { playerPos, entities: [e], game, night: false };
    let t = 0;
    while (t < 60 && distBox(e) > 1.2) {
      e.update(0.1, ctx);
      t += 0.1;
    }
    expect(distBox(e)).toBeLessThanOrEqual(1.2);
  });

  it('l’enfant marche à côté du cheval tout le trajet : il ne s’arrête pas pour le regarder avant le box', () => {
    const { e, game } = setup();
    const playerPos = new THREE.Vector3();
    const ctx = { playerPos, entities: [e], game, night: false };
    let t = 0;
    let stoppedOnTheWay = 0;
    while (t < 60 && distBox(e) > 1.2) {
      playerPos.set(e.position.x + 2, 0, e.position.z + 0.5);
      e.update(0.1, ctx);
      if (e.attending && distBox(e) > 1.2) stoppedOnTheWay++;
      t += 0.1;
    }
    expect(stoppedOnTheWay).toBe(0);
    expect(distBox(e)).toBeLessThanOrEqual(1.2);
  });

  it('une fois dans son box, il se tourne vers l’enfant qui s’approche', () => {
    const { e, game } = setup();
    e.root.position.set(BOX.x, 0, BOX.z);
    e.state = 'idle';
    e.timer = 5;
    e.heading = Math.PI; // de dos à l'allée
    const playerPos = new THREE.Vector3(BOX.x, 0, BOX.z + 3); // l'enfant devant la porte
    const ctx = { playerPos, entities: [e], game, night: false };
    for (let i = 0; i < 40; i++) e.update(0.1, ctx);
    expect(e.attending).toBe(true);
    const want = Math.atan2(playerPos.x - e.position.x, playerPos.z - e.position.z);
    const diff = Math.abs(Math.atan2(Math.sin(want - e.heading), Math.cos(want - e.heading)));
    expect(diff).toBeLessThan(0.3);
    expect(distBox(e)).toBeLessThanOrEqual(1.2);
  });
});
