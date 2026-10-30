// 🫧 La bulle au-dessus de ton cheval (src/game/AnimalEntity.js, src/game/wishBubble.js) : à 10 m, une icône ; le
// soin fait, elle éclate en ✨ et la suivante vient une seconde après. Math.random est remplacé par une suite fixe.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as THREE from 'three';

vi.setConfig({ testTimeout: 60000 });

let AnimalEntity;
let createAnimal;
let markHorseDay;
let bubbleTexture;
let bubbleScale;
const realRandom = Math.random;

beforeAll(async () => {
  let s = 4242;
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
  ({ AnimalEntity } = await import('../src/game/AnimalEntity.js'));
  ({ createAnimal } = await import('../src/sim/animal.js'));
  ({ markHorseDay } = await import('../src/sim/horseDay.js'));
  ({ bubbleTexture, bubbleScale } = await import('../src/game/wishBubble.js'));
}, 60000);

afterAll(() => {
  Math.random = realRandom;
});

const world = { stallOf: () => null, heightAt: () => 0, isWater: () => false, resolveCollisions() {} };
const DAY = 3;

function setup({ tutorial = true } = {}) {
  const a = createAnimal({ species: 'horse', breed: 'selle_francais', colorIndex: 0, sex: 'f', ageDays: 2000, seed: 5 });
  for (const n of Object.keys(a.needs)) a.needs[n] = 80;
  const e = new AnimalEntity(a, world, new THREE.Group());
  Object.defineProperty(e, 'home', { get: () => ({ x: 0, z: 0, hw: 5, hd: 4 }) });
  e.root.position.set(0, 0, 0);
  const game = {
    profile: { tutorial: { done: tutorial } }, day: DAY, hour: 8, player: { mount: null }, camera: { fov: 60 },
    wantedEquipment: () => null, socialMoment() {}, animalsHere: () => [a], entities: new Map([[a.id, e]]),
  };
  const ctx = { playerPos: new THREE.Vector3(), entities: [e], game, night: false };
  // (la joueuse reste à « dist » mètres du cheval, qui se promène)
  const run = (seconds, dist = 5) => {
    for (let t = 0; t < seconds; t += 0.05) {
      ctx.playerPos.set(e.position.x + dist, 0, e.position.z);
      e.update(0.05, ctx);
    }
  };
  return { a, e, game, run };
}

describe('la bulle de ce qu\'il te demande', () => {
  it('à 5 m, le matin : 🌾 dans une bulle ; le foin donné, ✨ puis 💧 une seconde après', () => {
    const { a, e, run } = setup();
    run(1.5);
    expect(e.wish).toMatchObject({ id: 'hay', task: 'feedAm' });
    run(0.05);
    expect(e.statusEmoji).toBe('🌾');
    expect(e.status.visible).toBe(true);
    expect(e.status.material.map).toBe(bubbleTexture('🌾'));
    expect(e.status.scale.x).toBeCloseTo(bubbleScale(60, window.innerHeight)); // (même taille à l'écran, sous l'étiquette du nom)
    expect(e.statusKey).toBe('hay'); // (l'id du vœu : pas de chaîne refaite à chaque image)
    expect(e.status.material.sizeAttenuation).toBe(false);
    expect(e.status.position.y).toBe(e.label.position.y);
    expect(e.status.center.y).toBeGreaterThan(0.95);
    const n = e.particles.length;
    markHorseDay(a, 'feed', 8, DAY);
    run(0.05);
    expect(e.wish).toBe(null);
    expect(e.particles.length).toBe(n + 3); // (✨)
    run(0.5);
    expect(e.statusEmoji).not.toBe('🌾');
    run(0.7);
    expect(e.wish).toMatchObject({ id: 'water' });
    run(0.05);
    expect(e.statusEmoji).toBe('💧');
  });

  it('loin, sur son dos, ou pendant le tutoriel : pas de bulle ; l\'emoji d\'humeur reprend sa taille', () => {
    const { e, game, run } = setup();
    run(1.5);
    expect(e.wish?.id).toBe('hay');
    run(1.2, 14);
    expect(e.wish).toBe(null);
    run(0.05, 14);
    expect(e.status.visible).toBe(false);
    run(1.2);
    expect(e.wish?.id).toBe('hay');
    game.player.mount = e;
    run(1.2, 0.5);
    expect(e.wish).toBe(null);
    game.player.mount = null;
    e.data.sick = 'cold';
    run(1.2);
    expect(e.wish).toBe(null);
    expect(e.statusEmoji).toBe('🤒');
    expect(e.status.scale.x).toBeCloseTo(e.statusS);
    expect(e.status.material.sizeAttenuation).toBe(true);
    expect(e.status.center.y).toBe(0.5);
    expect(e.status.position.y).toBe(e.statusY);
    const t = setup({ tutorial: false });
    t.run(1.5);
    expect(t.e.wish).toBe(null);
  });

  it('pas de bulle pour le cheval d\'un visiteur (hors de game.entities) ni en vue d\'ensemble', () => {
    const { a, e, game, run } = setup();
    run(1.5);
    expect(e.wish?.id).toBe('hay');
    game.mgmt = { active: true };
    run(1.2);
    expect(e.wish).toBe(null);
    run(0.05);
    expect(e.status.visible).toBe(false);
    game.mgmt.active = false;
    run(1.2);
    expect(e.wish?.id).toBe('hay');
    game.entities.delete(a.id); // (comme le cheval qu'un client amène, src/game/Clients.js)
    run(1.2);
    expect(e.wish).toBe(null);
  });

  it('son nom écarté par un voisin (src/ui/UI.js updateLabels) : sa bulle se cache, puis revient', () => {
    const { e, run } = setup();
    run(1.6);
    expect(e.wish?.id).toBe('hay');
    expect(e.status.visible).toBe(true);
    e.labelMoved = true;
    run(0.05);
    expect(e.status.visible).toBe(false);
    e.labelMoved = false;
    run(0.05);
    expect(e.status.visible).toBe(true);
  });

  it('descendu de son dos, encore sellé : 🧰 ; dessellé, ✨ puis la suite de sa journée', () => {
    const { a, e, game, run } = setup();
    a.gear = { ...a.gear, saddle: { item: 'saddle' } };
    game.player.mount = e;
    markHorseDay(a, 'ride', 8, DAY);
    run(1.2, 0.5);
    expect(e.wish).toBe(null); // (sur son dos : rien)
    game.player.mount = null;
    run(1.2);
    expect(e.wish).toMatchObject({ id: 'untack', icon: '🧰' });
    run(0.05);
    expect(e.status.material.map).toBe(bubbleTexture('🧰'));
    const n = e.particles.length;
    delete a.gear.saddle;
    run(0.05);
    expect(e.wish).toBe(null);
    expect(e.particles.length).toBe(n + 3); // (✨)
    run(1.2);
    expect(e.wish?.id).toBe('hay');
  });

  it('en voyage à cheval (src/game/TrailView.js) : plus de bulle figée au-dessus de lui', () => {
    const { e, run } = setup();
    run(1.6);
    expect(e.status.material.map).toBe(bubbleTexture('🌾'));
    e.wish = null; // (comme TrailView.attachCarrier)
    e.updateStatus();
    expect(e.statusKey).not.toBe('hay');
    // (content : rien au-dessus de lui ; sinon l'emoji de son humeur, à sa place)
    expect(e.status.visible ? e.status.material.map : null).not.toBe(bubbleTexture('🌾'));
  });
});
