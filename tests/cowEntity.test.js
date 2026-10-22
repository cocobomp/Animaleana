// Vache réaliste dans l'entité du jeu (AnimalEntity) : le veau qui suit sa mère finit par téter (il trottait autour
// d'elle à 1,5 m sans jamais s'arrêter, et la poussait), et la traite fait faire le geste à la joueuse (la main aux
// trayons). Les GLB de la vache et du taureau sont chargés dans node (sans textures) et rendus par getModel ;
// Math.random est remplacé par une suite fixe : rien ne dépend d'un tirage.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as THREE from 'three';
import { loadRealCowGltf } from './fixtures/realCowGltf.js';
import { calfTeatPoint, calfMotherBox } from '../src/game/models/cowReal.js';

let G = null;
vi.mock('../src/game/assets.js', async (orig) => {
  const m = await orig();
  return { ...m, getModel: (k) => (k === 'cow_real' ? G?.cow ?? null : k === 'bull_real' ? G?.bull ?? null : m.getModel(k)) };
});

let AnimalEntity;
let PEN;
let createAnimal;
const realRandom = Math.random;
/** Suite fixe à la place de Math.random, reprise au début de chaque cas (l'ordre des cas ne change rien). */
function seed(s0) {
  let s = s0;
  Math.random = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

beforeAll(async () => {
  seed(4242);
  const ctx2d = new Proxy({}, {
    get: (_, k) => {
      if (k === 'measureText') return () => ({ width: 40 });
      if (k === 'getImageData' || k === 'createImageData') return (x, y, w = 1, h = 1) => ({ data: new Uint8ClampedArray((w | 0 || 1) * (h | 0 || 1) * 4), width: w, height: h });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      return () => ctx2d;
    },
  });
  globalThis.document = {
    addEventListener() {}, hidden: false, documentElement: { lang: 'fr' }, body: { classList: { add() {}, remove() {} } },
    getElementById: () => null, createElement: () => ({ getContext: () => ctx2d, style: {}, width: 0, height: 0 }),
  };
  globalThis.window = globalThis.window ?? { addEventListener() {}, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 };
  G = await loadRealCowGltf();
  ({ AnimalEntity, PEN } = await import('../src/game/AnimalEntity.js'));
  ({ createAnimal } = await import('../src/sim/animal.js'));
}, 120000);

afterAll(() => {
  Math.random = realRandom;
});

const world = { heightAt: () => 0, isWater: () => false, resolveCollisions() {}, stallOf: () => null };
const game = { wantedEquipment: () => null, socialMoment() {}, animalsHere: () => [], animalUsedEquipment() {} };

/** Une vache adulte et son veau (même race), au pré, comme après une naissance. */
function family(breed, { calfAt = [2.2, 1.4], calfDays = 3 } = {}) {
  seed(4242);
  const mom = createAnimal({ species: 'cow', breed, sex: 'f', colorIndex: 0, ageDays: 80, seed: 11 });
  const kid = createAnimal({ species: 'cow', breed, sex: 'f', colorIndex: 0, ageDays: calfDays, seed: 12 });
  // (identifiants fixes : ils donnent la graine des gestes et le côté de la tétée)
  mom.id = `mo-${breed}`;
  kid.id = `ca-${breed}`;
  kid.parents = [mom.id];
  for (const a of [mom, kid]) {
    a.needs.hunger = 80;
    a.needs.energy = 100;
    a.zone = 'pen';
  }
  mom.produce = 60;
  const scene = new THREE.Group();
  const em = new AnimalEntity(mom, world, scene);
  const ek = new AnimalEntity(kid, world, scene);
  em.root.position.set(PEN.x, 0, PEN.z);
  em.heading = 0.4;
  em.state = 'idle';
  em.timer = 4;
  ek.root.position.set(PEN.x + calfAt[0], 0, PEN.z + calfAt[1]);
  ek.state = 'idle';
  ek.timer = 0.1;
  return { mom, kid, em, ek };
}

describe('veau qui tète en jeu (AnimalEntity)', () => {
  // (départs : à côté, devant, derrière et de l'autre côté de sa mère)
  const CASES = [['holstein', [2.2, 1.4]], ['highland', [2.2, 1.4]], ['holstein', [0.4, 3.2]], ['normande', [-0.8, -3.0]], ['hereford', [-2.4, 0.2]]];
  for (const [breed, at] of CASES) {
    it(`${breed} (veau parti de ${at.join(', ')}) : 60 s après, il tète plus de la moitié du temps, la bouche au trayon, sans traverser ni pousser sa mère`, () => {
      const { em, ek } = family(breed, { calfAt: at });
      expect(ek.model.realCow && ek.model.calf).toBe(true);
      expect(em.model.realCow && !em.model.calf).toBe(true);
      const ctx = { playerPos: new THREE.Vector3(30, 0, 30), entities: [em, ek], game, night: false };
      const dt = 1 / 30;
      let nurse = 0;
      let frames = 0;
      let momMoved = 0;
      let inside = 0;
      const gap = [];
      const teat = new THREE.Vector3();
      let prev = em.position.clone();
      for (let f = 0; f < 60 * 30; f++) {
        em.update(dt, ctx);
        ek.update(dt, ctx);
        em.root.updateMatrixWorld(true);
        ek.root.updateMatrixWorld(true);
        // (le veau ne passe jamais au travers du tronc de sa mère : son milieu reste hors de la boîte du corps)
        const box = calfMotherBox(em);
        const h = em.heading;
        const rx = ek.position.x - em.position.x;
        const rz = ek.position.z - em.position.z;
        const lz = rx * Math.sin(h) + rz * Math.cos(h);
        const lx = rx * Math.cos(h) - rz * Math.sin(h);
        if (Math.abs(lx) < box.halfW * 0.8 && lz < box.front - 0.35 && lz > box.rear + 0.3) inside++;
        if (f > 15 * 30) {
          frames++;
          if (ek.nursing === em) {
            nurse++;
            if (ek.model.anim.mouthW && calfTeatPoint(ek, em, teat)) gap.push(ek.model.anim.mouthW.distanceTo(teat));
          }
          // (la mère, à l'arrêt, ne doit pas glisser sous la poussée de son veau)
          if ((em.speed ?? 0) < 0.06) momMoved += Math.hypot(em.position.x - prev.x, em.position.z - prev.z);
        }
        prev = em.position.clone();
      }
      gap.sort((a, b) => a - b);
      expect(nurse / frames).toBeGreaterThan(0.5);
      expect(gap[Math.floor(gap.length / 2)]).toBeLessThan(0.1);
      expect(momMoved).toBeLessThan(0.3);
      expect(inside).toBe(0);
      em.model.dispose?.();
      ek.model.dispose?.();
    }, 120000);
  }

  it("la mère part marcher : le veau la suit à son côté sans la traverser, puis retète quand elle s'arrête", () => {
    const { em, ek } = family('normande', { calfAt: [1.6, -0.6] });
    const ctx = { playerPos: new THREE.Vector3(30, 0, 30), entities: [em, ek], game, night: false };
    const dt = 1 / 30;
    let inside = 0;
    let follow = 0;
    let after = 0;
    let afterN = 0;
    let went = false;
    // (elle ne se couche pas d'elle-même pendant le test : sin(0,04 t + graine) reste sous le seuil)
    em.restSeed = 3.5;
    for (let f = 0; f < 55 * 30; f++) {
      // (à 12 s, elle part à l'abreuvoir, 8 m plus loin ; revenue au repos, elle y reste : seul le veau décide)
      if (f === 12 * 30) {
        em.state = 'goTo';
        em.goal = null;
        em.target.set(PEN.x - 6, 0, PEN.z + 5);
        em.timer = 20;
        went = true;
      } else if (f < 12 * 30 || (went && em.state === 'idle')) em.timer = 99;
      em.update(dt, ctx);
      ek.update(dt, ctx);
      em.root.updateMatrixWorld(true);
      ek.root.updateMatrixWorld(true);
      const box = calfMotherBox(em);
      const h = em.heading;
      const rx = ek.position.x - em.position.x;
      const rz = ek.position.z - em.position.z;
      const lz = rx * Math.sin(h) + rz * Math.cos(h);
      const lx = rx * Math.cos(h) - rz * Math.sin(h);
      if (Math.abs(lx) < box.halfW * 0.8 && lz < box.front - 0.35 && lz > box.rear + 0.3) inside++;
      if (em.speed > 0.3 && ek.state === 'mother') follow = Math.max(follow, Math.hypot(rx, rz));
      // (après, quand sa mère se tient tranquille, debout, il retète)
      if (f > 40 * 30) {
        afterN++;
        if (ek.nursing === em) after++;
      }
    }
    expect(inside).toBe(0);
    expect(follow).toBeLessThan(4.5);
    expect(Math.hypot(em.position.x - PEN.x + 6, em.position.z - PEN.z - 5)).toBeLessThan(2);
    expect(after / afterN).toBeGreaterThan(0.7);
    em.model.dispose?.();
    ek.model.dispose?.();
  }, 120000);
});

describe('traite : la joueuse fait le geste, la main aux trayons', () => {
  it('Game.collect (bouton Traire, mini-jeu réussi) fait faire le geste « milk » à la joueuse, vers la vache', async () => {
    const { Game } = await import('../src/game/Game.js');
    const { em } = family('holstein');
    const a = em.data;
    a.produce = 100;
    a.produceReady = true;
    const calls = [];
    const g = {
      profile: { money: 0, xp: 0, stats: {} },
      entities: new Map([[a.id, em]]),
      ui: { toast() {}, refresh() {} },
      xp() {},
      player: { careGesture: (action, e) => calls.push([action, e]) },
    };
    const r = Game.prototype.collect.call(g, a);
    expect(r.ok).toBe(true);
    expect(calls).toEqual([['milk', em]]);
    // (pas prête : pas de geste)
    calls.length = 0;
    Game.prototype.collect.call(g, a);
    expect(calls).toEqual([]);
    em.model.dispose?.();
  }, 60000);

  it('Player.careGesture(« milk ») : la main va aux trayons de la vache réaliste, à leur hauteur, tournée vers la mamelle', async () => {
    const { Player } = await import('../src/game/Player.js');
    const { em } = family('normande');
    em.update(1 / 30, { playerPos: new THREE.Vector3(30, 0, 30), entities: [em], game, night: false });
    em.root.updateMatrixWorld(true);
    const up = em.model.udderPoint.getWorldPosition(new THREE.Vector3());
    const pl = Object.create(Player.prototype);
    const h = em.heading;
    Object.assign(pl, {
      scene: new THREE.Group(), world, root: new THREE.Group(), heading: 0, speed: 0, auto: null, mount: null,
      avatar: { life: { act: { kind: null, t: 0, dur: 0, target: new THREE.Vector3() } } },
    });
    // (la joueuse à côté du flanc gauche, à hauteur de la mamelle)
    pl.root.position.set(up.x + Math.cos(h) * 0.7, 0, up.z - Math.sin(h) * 0.7);
    pl.careGesture('milk', em);
    expect(pl.faceUdder).toBe(true);
    expect(pl.faceTo).toBe(em);
    const act = pl.avatar.life.act;
    expect(act.kind).toBe('milk');
    expect(Math.abs(act.target.y - (up.y + 0.05))).toBeLessThan(0.06);
    em.model.dispose?.();
  }, 60000);
});

describe('van : le bovin tient entre ses barres', () => {
  it('taureau charolais, taureau de Highland, Prim\'Holstein : la croupe devant la barre arrière, le poitrail derrière la barre de poitrail', async () => {
    const { TripVehicle: Vehicle } = await import('../src/game/Vehicle.js');
    const { growthScale } = await import('../src/sim/animal.js');
    // (place du van à deux chevaux : barre de poitrail à z = 1,06, barre arrière 1,95 m derrière — vehicles.js)
    const stall = { x: 0.44, zFront: 1.06, zRear: 1.06 - 1.95, y: 0.4 };
    for (const [breed, sex] of [['charolaise', 'm'], ['highland', 'm'], ['holstein', 'f']]) {
      seed(4242);
      const a = createAnimal({ species: 'cow', breed, sex, colorIndex: 0, ageDays: 80, seed: 3 });
      const v = Object.create(Vehicle.prototype);
      Object.assign(v, { trailer: { stalls: [stall] }, stallUse: [[a.id]], game: { entities: new Map() } });
      const scale = a.look.scale * growthScale(a);
      const k = v.stallShrink(0, a, scale);
      const pos = v.stallPose(0, a, scale);
      const fit = v.cowFit(a, scale * k);
      const rump = pos.z - fit.rump + 0.05;
      const chest = pos.z + fit.chest;
      // (réduite de 15 % au plus ; la Prim'Holstein tient sans être réduite)
      expect(k, breed).toBeGreaterThanOrEqual(0.85);
      if (breed === 'holstein') expect(k).toBe(1);
      expect(rump, `${breed} croupe`).toBeGreaterThan(stall.zRear - 0.005);
      expect(chest, `${breed} poitrail`).toBeLessThan(stall.zFront + 0.005);
    }
  }, 60000);
});
