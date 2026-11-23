// ⏳ Plus jamais l'ancien cheval sculpté (yeux-boutons, oreilles en cornes) pendant le chargement du vrai cheval
// (src/game/Game.js, src/game/AnimalEntity.js) : la partie attend le cheval réaliste plus longtemps ; s'il n'est
// toujours pas là, les chevaux restent cachés jusqu'à son arrivée ; le cheval monté change dès qu'il s'arrête ; l'ancien
// modèle ne sert que si le chargement échoue.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';

vi.setConfig({ testTimeout: 60000 });

let AnimalEntity;
let setRealHorsePending;
let Game;
let HORSE_GRACE_MS;
let createAnimal;

beforeAll(async () => {
  const ctx2d = new Proxy({}, {
    get: (_, k) => {
      if (k === 'measureText') return () => ({ width: 40 });
      if (k === 'getImageData' || k === 'createImageData') return (x, y, w = 1, h = 1) => ({ data: new Uint8ClampedArray((w | 0 || 1) * (h | 0 || 1) * 4), width: w, height: h });
      return () => ctx2d;
    },
  });
  const mem = new Map();
  globalThis.localStorage = globalThis.localStorage ?? {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k),
    key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
  };
  globalThis.document = globalThis.document ?? {
    addEventListener() {}, hidden: false, documentElement: { lang: 'fr' }, body: { classList: { add() {}, remove() {} } },
    getElementById: () => null, createElement: () => ({ getContext: () => ctx2d, style: {}, width: 0, height: 0 }),
  };
  globalThis.window = globalThis.window ?? { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 };
  globalThis.matchMedia = globalThis.matchMedia ?? (() => ({ matches: true }));
  ({ AnimalEntity, setRealHorsePending } = await import('../src/game/AnimalEntity.js'));
  ({ Game, HORSE_GRACE_MS } = await import('../src/game/Game.js'));
  ({ createAnimal } = await import('../src/sim/animal.js'));
}, 60000);

const world = { stallOf: () => null, heightAt: () => 0, isWater: () => false, resolveCollisions() {} };
const horse = (breed = 'shetland') => new AnimalEntity(createAnimal({ species: 'horse', breed, colorIndex: 0, sex: 'f', ageDays: 2000, seed: 5 }), world, new THREE.Group());

describe('⏳ le cheval réaliste attendu', () => {
  it('la partie attend le vrai cheval bien plus longtemps qu\'avant (1,5 s)', () => {
    expect(HORSE_GRACE_MS).toBeGreaterThanOrEqual(6000);
  });

  it('en l\'attendant, un cheval construit avec l\'ancien modèle est caché ; sinon il est montré', () => {
    setRealHorsePending(true);
    try {
      const e = horse();
      // (ici, sans fichier GLB : l'ancien modèle sculpté)
      expect(e.model.real).toBeFalsy();
      expect(e.waitingReal).toBe(true);
      expect(e.model.root.visible).toBe(false);
      // (un chien n'est pas concerné)
      const d = new AnimalEntity(createAnimal({ species: 'dog', sex: 'f', ageDays: 900, seed: 2 }), world, new THREE.Group());
      expect(d.model.root.visible).toBe(true);
    } finally {
      setRealHorsePending(false);
    }
    const e2 = horse('selle_francais');
    expect(e2.waitingReal).toBe(false);
    expect(e2.model.root.visible).toBe(true);
  });

  it('chargement impossible (réseau coupé) : les chevaux cachés reprennent l\'ancien modèle', () => {
    setRealHorsePending(true);
    const list = [horse(), horse('frison')];
    const g = { allEntities: () => list };
    Game.prototype.showFallbackHorses.call(g);
    for (const e of list) {
      expect(e.waitingReal).toBe(false);
      expect(e.model.root.visible).toBe(true);
    }
    // (et les suivants sont montrés tout de suite)
    expect(horse().model.root.visible).toBe(true);
  });

  it('le cheval monté prend le vrai modèle dès qu\'il s\'arrête (pas pendant qu\'il avance, ni pendant une activité)', () => {
    const e = { root: { parent: {} }, disposed: false, model: { real: false }, ridden: true, rebuilt: 0, rebuildModel() { this.rebuilt++; this.model = { real: true }; } };
    let seated = 0;
    const player = { mount: e, speed: 3, seat() { seated++; } };
    const g = { horseSwap: [e], player, activities: { active: false } };
    Game.prototype.swapRealHorses.call(g);
    expect(e.rebuilt).toBe(0);
    g.activities.active = true;
    player.speed = 0;
    Game.prototype.swapRealHorses.call(g);
    expect(e.rebuilt).toBe(0);
    g.activities.active = false;
    Game.prototype.swapRealHorses.call(g);
    expect(e.rebuilt).toBe(1);
    expect(seated).toBe(1);
    expect(g.horseSwap.length).toBe(0);
    // un cheval guidé par une activité (pas monté) attend toujours la fin
    const s = { root: { parent: {} }, disposed: false, model: { real: false }, scripted: true, rebuilt: 0, rebuildModel() { this.rebuilt++; } };
    const g2 = { horseSwap: [s], player: { mount: null, speed: 0 }, activities: { active: true } };
    Game.prototype.swapRealHorses.call(g2);
    expect(s.rebuilt).toBe(0);
  });
});

describe('📸 ce qui peut cacher le cheval sur une photo souvenir (Game.photoOccluders)', () => {
  it('toute la scène (aussi les lices hors du groupe du lieu, et ce qui est construit ensuite), sans les animaux ni la joueuse', () => {
    const scene = new THREE.Scene();
    const place = new THREE.Group();
    scene.add(place);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(20, 0.1, 0.1));
    const arena = new THREE.Group();
    arena.add(rail);
    scene.add(arena); // (pas dans le groupe du lieu)
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    const pebble = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    place.add(flag, pebble);
    const horseRoot = new THREE.Group();
    horseRoot.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)));
    const avatar = new THREE.Group();
    avatar.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1)));
    scene.add(horseRoot, avatar);
    const g = { scene, world: { group: place }, entities: new Map([[1, { root: horseRoot }]]), player: { avatar: { root: avatar }, root: new THREE.Group() } };
    let list = Game.prototype.photoOccluders.call(g);
    expect(list).toContain(rail);
    expect(list).not.toContain(flag);
    expect(list).not.toContain(pebble);
    expect(list.some((o) => o.parent === horseRoot || o.parent === avatar)).toBe(false);
    // un bâtiment construit après la première photo
    const shed = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3));
    place.add(shed);
    list = Game.prototype.photoOccluders.call(g);
    expect(list).toContain(shed);
  });
});
