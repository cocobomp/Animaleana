// Le cheval vivant (src/game/AnimalEntity.js) : il accueille la joueuse qui revient (hennissement, il vient vers
// elle s'il l'aime bien, sans sortir de chez lui), et il se roule au pré (couché, deux roulades, debout, il
// s'ébroue ; un peu moins propre après). Math.random est remplacé par une suite fixe.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as THREE from 'three';

vi.setConfig({ testTimeout: 60000 });

let AnimalEntity;
let ROLL;
let rollTilt;
let rollLie;
let createAnimal;
const realRandom = Math.random;

beforeAll(async () => {
  let s = 777;
  Math.random = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
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
  ({ AnimalEntity, ROLL, rollTilt, rollLie } = await import('../src/game/AnimalEntity.js'));
  ({ createAnimal } = await import('../src/sim/animal.js'));
}, 60000);

afterAll(() => {
  Math.random = realRandom;
});

const world = { stallOf: () => null, heightAt: () => 0, isWater: () => false, resolveCollisions() {} };
/** Un cheval adulte au pré (zone de vie rectangulaire de 10 × 8 m centrée en (0, 0)). */
function horse() {
  const a = createAnimal({ species: 'horse', breed: 'selle_francais', colorIndex: 0, sex: 'f', ageDays: 2000, seed: 3 });
  for (const n of Object.keys(a.needs)) a.needs[n] = 80;
  const e = new AnimalEntity(a, world, new THREE.Group());
  Object.defineProperty(e, 'home', { get: () => ({ x: 0, z: 0, hw: 5, hd: 4 }) });
  e.root.position.set(0, 0, 0);
  return e;
}
const ctxAt = (x, z) => ({ playerPos: new THREE.Vector3(x, 0, z), game: { player: { mount: null } } });

describe('la roulade', () => {
  it('couché, deux roulades sur le flanc, debout : dans l\'ordre', () => {
    expect(rollLie(0)).toBe(0);
    expect(rollLie(ROLL.down)).toBeCloseTo(1, 5);
    expect(rollTilt(ROLL.down - 0.1)).toBe(0); // (il ne bascule qu'une fois couché)
    const q = (ROLL.up - ROLL.down) / 4;
    expect(rollTilt(ROLL.down + q)).toBeCloseTo(1, 5); // première roulade
    expect(rollTilt(ROLL.down + 2 * q)).toBeCloseTo(0, 5); // revenu sur le ventre
    expect(rollTilt(ROLL.down + 3 * q)).toBeCloseTo(1, 5); // deuxième roulade
    expect(rollTilt(ROLL.up)).toBe(0);
    expect(rollLie(ROLL.stand)).toBeCloseTo(0, 5); // debout avant de s'ébrouer
    expect(ROLL.end).toBeGreaterThan(ROLL.stand);
  });

  it('au pré, après le galop, il se roule ; ensuite il est un peu moins propre et la pose est remise droite', () => {
    const e = horse();
    e.rollCool = 0;
    e.rollSoon = true;
    expect(e.wantsRoll()).toBe(true);
    e.startRoll();
    expect(e.state).toBe('roll');
    const before = e.data.needs.grooming;
    const ctx = ctxAt(20, 20);
    let maxTilt = 0;
    for (let t = 0; t < ROLL.end + 0.5; t += 0.1) {
      e.horseLife(0.1, ctx, 28);
      if (e.state !== 'roll') break;
      e.rollPose();
      maxTilt = Math.max(maxTilt, Math.abs(e.scaleGroup.rotation.z));
      // le ventre ne rentre pas dans le sol : la racine du modèle ne descend jamais sous -1,5 m
      expect(e.scaleGroup.position.y).toBeGreaterThan(-1.5);
    }
    // (sur le flanc : le cheval réaliste bascule de 75° ; le modèle simple, sans membres repliés, penche moins)
    expect(maxTilt).toBeGreaterThan(e.model.real ? 1 : 0.4);
    expect(e.state).toBe('idle');
    expect(e.data.needs.grooming).toBe(before - 6);
    expect(e.scaleGroup.rotation.z).toBe(0);
    expect(e.scaleGroup.position.y).toBe(0);
    expect(e.rollCool).toBeGreaterThan(200); // (pas deux roulades de suite)
  });

  it('pas au box, pas sellé, pas hors de chez lui, et on le monte : il se relève tout de suite', () => {
    const e = horse();
    e.rollCool = 0;
    e.rollSoon = true;
    e.data.stalled = true;
    expect(e.wantsRoll()).toBe(false);
    e.data.stalled = false;
    e.data.gear = { saddle: { item: 'saddle' } }; // sellé : on dessangle d'abord
    expect(e.wantsRoll()).toBe(false);
    e.data.gear = {};
    e.root.position.set(30, 0, 0); // hors du pré
    expect(e.wantsRoll()).toBe(false);
    e.root.position.set(0, 0, 0);
    e.startRoll();
    e.horseLife(2, ctxAt(20, 20), 28);
    e.rollPose();
    e.ridden = true;
    e.horseLife(0.1, ctxAt(20, 20), 28);
    expect(e.state).toBe('idle');
    expect(e.scaleGroup.rotation.z).toBe(0);
  });
});

describe('l\'accueil', () => {
  it('tu reviens après une absence : il hennit, et s\'il t\'aime bien il vient vers toi sans sortir du pré', () => {
    const e = horse();
    e.data.bond = 60;
    e.state = 'idle';
    e.horseLife(41, ctxAt(30, 0), 30); // loin pendant 41 s
    expect(e.greetT ?? 0).toBe(0);
    e.horseLife(0.1, ctxAt(10, 0), 10); // on revient, de l'autre côté de la barrière (10 m)
    expect(e.greetT).toBeGreaterThan(5);
    expect(e.state).toBe('walk');
    expect(e.target.x).toBeLessThanOrEqual(5 - 0.7); // (il s'arrête au bord de son pré)
    expect(e.target.x).toBeGreaterThan(3);
    // une seule fois : rester près ne le refait pas
    e.greetT = 0;
    e.horseLife(5, ctxAt(10, 0), 10);
    expect(e.greetT).toBe(0);
  });

  it('un cheval qui te connaît peu te regarde, mais ne vient pas', () => {
    const e = horse();
    e.data.bond = 5;
    e.state = 'idle';
    e.horseLife(50, ctxAt(30, 0), 30);
    e.horseLife(0.1, ctxAt(6, 0), 6);
    expect(e.greetT).toBeGreaterThan(5);
    expect(e.state).toBe('idle');
  });
});

describe('affamé, roulé', () => {
  it('il a faim : il t\'appelle en te voyant (🌾), et après une roulade il est plein de terre', () => {
    const toasts = [];
    const e = horse();
    e.data.needs.hunger = 30;
    e.state = 'idle';
    const ctx = { ...ctxAt(30, 0), game: { player: { mount: null }, ui: { toast: (s) => toasts.push(s) } } };
    e.horseLife(50, ctx, 30);
    e.horseLife(0.1, { ...ctx, playerPos: new THREE.Vector3(9, 0, 0) }, 9);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toContain('🌾');
    // la roulade
    e.greetT = 0;
    e.rollCool = 0;
    e.rollSoon = true;
    e.startRoll();
    for (let k = 0; k < 90 && e.state === 'roll'; k++) e.horseLife(0.1, ctxAt(30, 30), 40);
    expect(e.data.muddy).toBe(true);
  });
});
