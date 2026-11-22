// La scène de soin des moutons, des chèvres et des vaches, construite pour de vrai sans navigateur (faux rendu :
// stage.headlessRenderer) : le vrai modèle réaliste (GLB chargé dans node), la bergerie, la chèvrerie ou l'étable, la
// caméra, le doigt et la projection. On y vérifie les repères (toutes les races, les petits), le décor placé d'après
// l'animal, et les jeux 3D joués de bout en bout (même note que les jeux dessinés), puis la libération.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as THREE from 'three';
import { fakeCtx as fakeCtxOf, fakeDocument } from './fixtures/careCtx.js';
import { loadRealSheepGltf } from './fixtures/realSheepGltf.js';
import { loadRealGoatGltf } from './fixtures/realGoatGltf.js';
import { loadRealCowGltf } from './fixtures/realCowGltf.js';

let t;
let gltf = {};
let stageMod;
let barnMod;
let ruminant;
let animalMod;
let frameMod;
let farm3d;
beforeAll(async () => {
  fakeDocument();
  ({ t } = await import('../src/i18n.js'));
  gltf = { sheep: await loadRealSheepGltf(), goat: await loadRealGoatGltf(), cow: await loadRealCowGltf() };
  stageMod = await import('../src/game/care/stage.js');
  barnMod = await import('../src/game/care/barn.js');
  ruminant = await import('../src/game/care/ruminant.js');
  animalMod = await import('../src/sim/animal.js');
  frameMod = await import('../src/ui/minigames/frame.js');
  farm3d = await import('../src/ui/minigames/farm3d.js');
}, 60000);

const random = Math.random;
let seed = 1;
beforeEach(() => {
  seed = 12345;
  Math.random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
});
afterAll(() => {
  Math.random = random;
});

/** Une scène headless : l'animal (espèce, race, âge, sexe) dans son bâtiment, toile de téléphone en portrait. */
export function makeStage({ species = 'sheep', breed = null, young = false, sex = 'f', w = 390, h = 600, name = 'Flocon', needs = 25 } = {}) {
  const a = animalMod.createAnimal({ species, breed, colorIndex: 0, ageDays: young ? 5 : 900, seed: 77, sex });
  a.name = name;
  a.sex = sex;
  for (const k in a.needs) a.needs[k] = needs;
  const g = species === 'cow' ? gltf.cow : gltf[species];
  const model = ruminant.buildRuminantModel(a, g);
  const sc = new stageMod.CareStage({ a, renderer: stageMod.headlessRenderer(), model, set: barnMod.barnSet, fit: ruminant.RUMINANT_FIT });
  sc.resize(w, h, frameMod.fitView(w, h, 400, 360));
  sc.ready = true;
  for (const act of Object.values(model.anim?.actions ?? {})) act.time = 0;
  return { a, sc };
}

const ctxFor = (a, sc, w = 390, h = 600) => fakeCtxOf(a, t, { scene: sc, view: frameMod.fitView(w, h, 400, 360) });

/** dt secondes de jeu : le jeu, puis la scène (comme la boucle du cadre). */
export function run(ctx, game, sc, s, dt = 1 / 30) {
  for (let k = 0; k < s / dt; k++) {
    ctx.time += dt;
    game.update(dt);
    sc.update(dt);
  }
}

const inView = (q, v) => q.x > v.x0 && q.x < v.x1 && q.y > v.y0 && q.y < v.y1;

const CASES = [
  { species: 'sheep', breed: 'merinos' }, { species: 'sheep', breed: 'islandais_mouton', sex: 'm' }, { species: 'sheep', breed: 'ouessant', young: true },
  { species: 'goat', breed: 'alpine' }, { species: 'goat', breed: 'saanen', young: true },
  { species: 'cow', breed: 'holstein' }, { species: 'cow', breed: 'highland' }, { species: 'cow', breed: 'normande', young: true },
];

describe('quand ouvrir la scène 3D', () => {
  it('moutons, chèvres et vaches ont leur scène si leur modèle réaliste est chargé (le taureau a le sien)', async () => {
    const which = await import('../src/game/care/which.js');
    for (const sp of ['sheep', 'goat', 'cow']) {
      expect(which.care3dPossible({ species: sp, look: {} }, { has: () => true })).toBe(true);
      expect(which.care3dPossible({ species: sp, look: {} }, { has: () => false })).toBe(false);
      expect(which.care3dPossible({ species: sp, look: {} }, { setting: 'off', has: () => true })).toBe(false);
    }
    const bull = animalMod.createAnimal({ species: 'cow', breed: 'holstein', sex: 'm', ageDays: 900, seed: 3 });
    bull.sex = 'm';
    expect(which.care3dPossible(bull, { has: (k) => k === 'bull_real' })).toBe(true);
    expect(which.care3dPossible(bull, { has: (k) => k === 'cow_real' })).toBe(false);
  });
});

describe('la bergerie, la chèvrerie, l\'étable', () => {
  for (const c of CASES) {
    it(`${c.species} ${c.breed}${c.young ? ' (petit)' : ''} : repères, décor, râtelier à sa bouche`, () => {
      const { sc } = makeStage(c);
      const L = sc.marks;
      // repères dans l'ordre attendu (tête devant, croupe derrière, garrot au-dessus du ventre)
      expect(L.muzzle.x).toBeGreaterThan(L.withers.x);
      expect(L.withers.x).toBeGreaterThan(L.croup.x);
      expect(L.withers.y).toBeGreaterThan(L.belly.y);
      expect(L.hooves.length).toBe(4);
      expect(L.u).toBeGreaterThan(0.2);
      const D = sc.decor.dims;
      // l'animal tient dans sa case, le nez ne touche pas le mur
      expect(L.muzzle.x).toBeLessThan(D.halfW - 0.05);
      expect(L.tailTip.x).toBeGreaterThan(-D.halfW + 0.1);
      expect(L.croup.z - 0.4 * L.u).toBeGreaterThan(D.back);
      // tête baissée pour manger, la bouche arrive dans l'auge du râtelier (sous le rebord, au-dessus du fond)
      const eat = sc.decor.anchors.eat;
      const rack = sc.decor.props.rack;
      const bite = rack.bite(new THREE.Vector3());
      expect(Math.abs(eat.x - bite.x)).toBeLessThan(0.06 * Math.max(1, L.u));
      const rim = rack.group.getWorldPosition(new THREE.Vector3()).y;
      expect(eat.y).toBeLessThan(rim);
      expect(eat.y).toBeGreaterThan(rim - rack.trough);
      // tête haute, le nez ne touche ni le mur ni les barreaux (plan des barreaux : du mur en bas à -d en haut)
      const f = Math.min(1, Math.max(0, (L.muzzle.y - rim) / rack.h));
      expect(L.muzzle.x).toBeLessThan(rack.group.getWorldPosition(new THREE.Vector3()).x - rack.d * f - 0.02);
      sc.dispose();
    });
  }
});

describe('nourrir et abreuver en 3D', () => {
  for (const species of ['sheep', 'goat', 'cow']) {
    it(`${species} : nourrir jusqu'à la ligne, il mange au râtelier`, () => {
      const { a, sc } = makeStage({ species });
      const ctx = ctxFor(a, sc);
      const game = farm3d.farmFeed3dGame(ctx);
      const pour = ctx.buttons[0].opts;
      const s0 = game.peek();
      pour.onDown();
      for (let i = 0; i < 400 && game.peek().value < s0.target; i++) run(ctx, game, sc, 1 / 30);
      pour.onUp();
      run(ctx, game, sc, 1);
      ctx.pressStop();
      run(ctx, game, sc, 2);
      expect(ctx.done).toBe(true);
      expect(ctx.finished.why).toBe('just');
      expect(sc.decor.props.rack.fill).toBeGreaterThan(s0.lo - 0.05);
      // il mange : la bouche descend au râtelier
      run(ctx, game, sc, 3);
      const mouth = sc.live('muzzle');
      const bite = sc.decor.props.rack.bite(new THREE.Vector3());
      expect(mouth.distanceTo(bite)).toBeLessThan(0.3 * Math.max(1, sc.marks.u));
      // le râtelier et sa tête sont dans l'image
      for (const p of [sc.marks.poll, sc.decor.props.rack.barsAt(0.5)]) expect(inView(sc.project(p), ctx.view)).toBe(true);
      game.destroy();
      sc.dispose();
    }, 30000);
    it(`${species} : abreuver jusqu'à la ligne, il boit`, () => {
      const { a, sc } = makeStage({ species });
      const ctx = ctxFor(a, sc);
      const game = farm3d.farmWater3dGame(ctx);
      const tap = ctx.buttons[0].opts;
      const s0 = game.peek();
      tap.onDown();
      for (let i = 0; i < 400 && game.peek().value < s0.target; i++) run(ctx, game, sc, 1 / 30);
      tap.onUp();
      run(ctx, game, sc, 1);
      ctx.pressStop();
      run(ctx, game, sc, 2);
      expect(ctx.finished?.why).toBe('just');
      run(ctx, game, sc, 3);
      const tr = sc.decor.props.trough;
      const surf = tr.group.localToWorld(new THREE.Vector3(0, tr.surfaceY(), 0));
      expect(Math.abs(sc.live('muzzle').y - surf.y)).toBeLessThan(0.12 * Math.max(1, sc.marks.u));
      game.destroy();
      sc.dispose();
    }, 30000);
  }
});
