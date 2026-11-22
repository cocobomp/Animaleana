// Seller, brider, vermifuge, maréchal, curer le box, et les corvées (curer, pailler, balayer) en 3D, joués pour de vrai
// sans navigateur : la vraie scène (faux rendu headlessRenderer), le vrai cheval réaliste (GLB chargé dans node) pour
// chaque gabarit (poulain, Shetland, selle français, Frison), la scène SANS animal pour les corvées. On y vérifie que
// la règle et la note sont celles des jeux dessinés (bien fait : « juste »), que ce qu'on touche est dans l'image, que
// l'équipement du joueur est posé puis retiré, et que tout est rendu à la fermeture.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as THREE from 'three';
import { fakeCtx as fakeCtxOf, fakeDocument } from './fixtures/careCtx.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

let t;
let gltf;
let stageMod;
let stallMod;
let barnMod;
let horseReal;
let animalMod;
let frameMod;
let games;
let chores3d;
let floor3d;
let which;
beforeAll(async () => {
  fakeDocument();
  ({ t } = await import('../src/i18n.js'));
  gltf = await loadRealHorseGltf();
  horseReal = await import('../src/game/models/horseReal.js');
  horseReal.realHorseBase(gltf);
  stageMod = await import('../src/game/care/stage.js');
  stallMod = await import('../src/game/care/stall.js');
  barnMod = await import('../src/game/care/barn.js');
  animalMod = await import('../src/sim/animal.js');
  frameMod = await import('../src/ui/minigames/frame.js');
  games = (await import('../src/ui/minigames/horsePlus3d.js')).HORSE_PLUS_GAMES;
  chores3d = await import('../src/ui/minigames/chores3d.js');
  floor3d = await import('../src/ui/minigames/floor3d.js');
  which = await import('../src/game/care/which.js');
}, 60000);

const random = Math.random;
let seed = 1;
beforeEach(() => {
  seed = 4242;
  Math.random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
});
afterAll(() => {
  Math.random = random;
});

const W = 390;
const H = 600;
function makeStage({ breed = 'selle_francais', foal = false, name = 'Honey' } = {}) {
  const a = animalMod.createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: foal ? 7 : 900, seed: 77 });
  a.name = name;
  a.gear = { halter: { item: 'halter', color: 'red' } };
  for (const k in a.needs) a.needs[k] = 30;
  const model = horseReal.buildRealHorseModel(animalMod.stageLook(a), a.breed, gltf);
  const sc = new stageMod.CareStage({ a, renderer: stageMod.headlessRenderer(), model, set: stallMod.stallSet });
  sc.resize(W, H, frameMod.fitView(W, H, 400, 360));
  sc.ready = true;
  for (const act of Object.values(model.anim?.actions ?? {})) act.time = 0;
  return { a, sc };
}
function makeEmpty(set) {
  const sc = new stageMod.CareStage({ a: null, noAnimal: true, renderer: stageMod.headlessRenderer(), set });
  sc.resize(W, H, frameMod.fitView(W, H, 400, 360));
  sc.ready = true;
  return sc;
}
const ctxFor = (a, sc) => fakeCtxOf(a ?? { name: '' }, t, { scene: sc, view: frameMod.fitView(W, H, 400, 360) });
function run(ctx, game, sc, s, dt = 1 / 30) {
  for (let k = 0; k < s / dt; k++) {
    ctx.time += dt;
    game.update(dt);
    sc.update(dt);
  }
}
const inView = (q, v) => q && !q.behind && q.x > v.x0 && q.x < v.x1 && q.y > v.y0 && q.y < v.y1;
const btn = (ctx, re) => ctx.buttons.find((b) => re.test(b.text));

const GABARITS = [['haflinger', true], ['shetland', false], ['selle_francais', false], ['frison', false]];

describe('les soins du cheval branchés en 3D', () => {
  it('seller, brider, vermifuge, ferrer, curer : un jeu 3D chacun, et la liste de which.js le dit', () => {
    for (const act of ['saddle', 'bridle', 'deworm', 'shoe', 'clean']) {
      expect(typeof games[act], act).toBe('function');
      expect(which.care3dWanted({ species: 'horse' }, act), act).toBe(true);
    }
    expect([...which.CHORE3D_KINDS].sort()).toEqual(['muck', 'straw', 'sweep']);
    for (const k of which.CHORE3D_KINDS) expect(typeof chores3d.chore3dGameFor(k), k).toBe('function');
    expect(which.chore3dWanted('muck', 'off')).toBe(false);
    expect(which.chore3dWanted('living', '')).toBe(false);
  });
});

describe('seller en 3D, chaque gabarit', () => {
  for (const [breed, foal] of GABARITS) {
    it(`tapis et selle derrière le garrot, sangle serrée en deux fois : juste (${breed}${foal ? ', poulain' : ''})`, () => {
      const { a, sc } = makeStage({ breed, foal });
      const ctx = ctxFor(a, sc);
      const body = sc.model.body;
      const before = body.children.length;
      const game = games.saddle(ctx);
      run(ctx, game, sc, 0.3);
      let s = game.peek();
      expect(inView(s.tray, ctx.view), 'le tapis sur le porte-selle est dans l\'image').toBe(true);
      expect(inView(s.spot, ctx.view), 'la place de la selle est dans l\'image').toBe(true);
      // le tapis : du porte-selle au dos, à la bonne place
      for (const key of ['pad', 'saddle']) {
        s = game.peek();
        game.down(s.tray);
        for (let k = 1; k <= 6; k++) game.move({ x: s.tray.x + ((s.spot.x - s.tray.x) * k) / 6, y: s.tray.y + ((s.spot.y - s.tray.y) * k) / 6 }, true);
        game.up(s.spot);
        run(ctx, game, sc, 0.5);
        expect(game.peek().items[key].placed, key).toBe(true);
        ctx.pressStop();
        run(ctx, game, sc, 1.2);
      }
      expect(game.peek().stage).toBe('girth');
      // la sangle : on serre, il gonfle le ventre, on resserre dans le vert
      const hold = btn(ctx, /🪢/);
      hold.opts.onDown();
      while (game.peek().tension < 0.6) run(ctx, game, sc, 0.1);
      hold.opts.onUp();
      run(ctx, game, sc, 2);
      expect(game.peek().bloated).toBe(true);
      hold.opts.onDown();
      while (game.peek().tension < 0.75) run(ctx, game, sc, 0.05);
      hold.opts.onUp();
      ctx.pressStop();
      expect(ctx.finished?.why).toBe('just');
      expect(ctx.finished.q).toBe(1);
      game.destroy();
      expect(body.children.length, 'les pièces posées sont retirées').toBe(before);
      sc.dispose();
    }, 60000);
  }

  it('la selle à côté du tapis : « pose-la sur le tapis », et la note le dit', () => {
    const { a, sc } = makeStage();
    const ctx = ctxFor(a, sc);
    const game = games.saddle(ctx);
    run(ctx, game, sc, 0.3);
    let s = game.peek();
    game.down(s.tray);
    game.move(s.spot, true);
    game.up(s.spot);
    run(ctx, game, sc, 0.5);
    ctx.pressStop();
    run(ctx, game, sc, 1.2);
    s = game.peek();
    // la selle posée bien en arrière (sur les reins)
    game.down(s.tray);
    game.move(s.back, true);
    game.up(s.back);
    run(ctx, game, sc, 0.5);
    expect(game.peek().items.saddle.placed).toBe(true);
    expect(ctx.hints.at(-1).text).toBe(t('mg_seller_onPad'));
    game.destroy();
    sc.dispose();
  }, 60000);
});

describe('brider en 3D, chaque gabarit', () => {
  for (const [breed, foal] of GABARITS) {
    it(`le mors au coin des lèvres, les deux oreilles, la sous-gorge juste : trois étoiles (${breed}${foal ? ', poulain' : ''})`, () => {
      const { a, sc } = makeStage({ breed, foal });
      const ctx = ctxFor(a, sc);
      const game = games.bridle(ctx);
      run(ctx, game, sc, 0.3);
      let s = game.peek();
      expect(inView(s.bar, ctx.view), 'le coin des lèvres est dans l\'image').toBe(true);
      expect(s.halterHidden).toBe(false);
      game.down(s.bar);
      expect(game.peek().bitIn).toBe(true);
      expect(game.peek().halterHidden, 'le licol s\'en va quand le mors entre').toBe(true);
      run(ctx, game, sc, 1.2);
      expect(game.peek().step).toBe('ears');
      for (let i = 0; i < 2; i++) {
        s = game.peek();
        const e = s.ears[s.earDone[0] ? 1 : 0];
        expect(inView(e, ctx.view), `oreille ${i}`).toBe(true);
        game.down(e);
        run(ctx, game, sc, 0.3);
      }
      run(ctx, game, sc, 1.2);
      expect(game.peek().step).toBe('throat');
      const hold = btn(ctx, /🪢/);
      hold.opts.onDown();
      while (game.peek().throat < 0.66) run(ctx, game, sc, 0.05);
      hold.opts.onUp();
      expect(game.peek().sag).toBeGreaterThanOrEqual(0);
      ctx.pressStop();
      expect(ctx.finished?.why).toBe('just');
      game.destroy();
      expect(sc.model.head.children.filter((c) => c.isGroup && c.children.length > 3).length, 'le filet est retiré').toBe(0);
      sc.dispose();
    }, 60000);
  }

  it('devant ses dents : il relève la tête, 💢, et le mors compte moins', () => {
    const { a, sc } = makeStage();
    const ctx = ctxFor(a, sc);
    const game = games.bridle(ctx);
    run(ctx, game, sc, 0.3);
    game.down(game.peek().teeth);
    expect(game.peek().teethTaps).toBe(1);
    expect(game.peek().annoyed).toBeGreaterThan(0);
    expect(ctx.hints.at(-1).kind).toBe('warn');
    run(ctx, game, sc, 1.5);
    game.down(game.peek().bar);
    expect(game.peek().results[0]).toMatchObject({ step: 'bit', verdict: 'low' });
    game.destroy();
    sc.dispose();
  }, 60000);
});

describe('vermifuge en 3D', () => {
  for (const [breed, foal] of GABARITS) {
    it(`la bague sur son poids, la seringue au coin de la bouche, toute la pâte : juste (${breed}${foal ? ', poulain' : ''})`, () => {
      const { a, sc } = makeStage({ breed, foal });
      const ctx = ctxFor(a, sc);
      ctx.opts = {};
      const game = games.deworm(ctx);
      run(ctx, game, sc, 0.3);
      let s = game.peek();
      expect(inView(s.ringX, ctx.view), 'la bague est dans l\'image').toBe(true);
      // glisser la bague jusqu'à son poids (+ 20 kg)
      const k = (s.kg + 20 - 100) / 800;
      const [e0, e1] = s.ends;
      game.down(s.ringX);
      game.move({ x: e0.x + (e1.x - e0.x) * k, y: e0.y + (e1.y - e0.y) * k }, true);
      game.up();
      expect(Math.abs(game.peek().ring - (s.kg + 20))).toBeLessThanOrEqual(10);
      ctx.pressStop();
      expect(ctx.opts.out.dose).toBe('just');
      run(ctx, game, sc, 1.5);
      s = game.peek();
      expect(s.stage).toBe('give');
      expect(inView(s.bar, ctx.view), 'le coin de la bouche est dans l\'image').toBe(true);
      expect(inView(s.syringe, ctx.view), 'la seringue est dans l\'image').toBe(true);
      game.down(s.syringe);
      for (let i = 1; i <= 5; i++) game.move({ x: s.syringe.x + ((s.bar.x - s.syringe.x) * i) / 5, y: s.syringe.y + ((s.bar.y - s.syringe.y) * i) / 5 }, true);
      game.move(game.peek().bar, true);
      game.up();
      expect(game.peek().syr.placed).toBe(true);
      game.down(game.peek().bar);
      while (game.peek().syr.left > 0) run(ctx, game, sc, 0.1);
      game.up();
      ctx.pressStop();
      expect(ctx.finished?.why).toBe('just');
      game.destroy();
      sc.dispose();
    }, 60000);
  }
});

describe('vermifuge en 3D : la seringue et la langue restent à la bouche', () => {
  for (const [breed, foal] of [['selle_francais', false], ['frison', false]]) {
    it(`il mâchonne et secoue la tête : l'embout reste au coin des lèvres, puis sort ; la langue sort au coin des lèvres (${breed})`, () => {
      const { a, sc } = makeStage({ breed, foal });
      const ctx = ctxFor(a, sc);
      ctx.opts = {};
      const game = games.deworm(ctx);
      run(ctx, game, sc, 0.3);
      // la dose : au clavier, jusqu'à son poids (+ 10 à 20 kg)
      for (let i = 0; i < 90 && game.peek().ring < game.peek().kg + 10; i++) game.key('ArrowRight', true);
      for (let i = 0; i < 90 && game.peek().ring > game.peek().kg + 20; i++) game.key('ArrowLeft', true);
      ctx.pressStop();
      run(ctx, game, sc, 1.5);
      let s = game.peek();
      game.down(s.syringe);
      game.move(s.bar, true);
      game.move(game.peek().bar, true);
      game.up();
      expect(game.peek().syr.placed).toBe(true);
      game.down(game.peek().bar);
      const hr = sc.model.dims.hr;
      let maxOff = 0;
      while (game.peek().syr.left > 0) {
        run(ctx, game, sc, 0.1);
        s = game.peek();
        if (!s.out) maxOff = Math.max(maxOff, s.tipInHead.distanceTo(s.barLocal));
      }
      // (pendant qu'il mâchonne et secoue la tête, l'embout ne quitte pas le coin des lèvres)
      expect(maxOff, 'embout au coin des lèvres').toBeLessThan(hr * 0.25);
      game.up();
      expect(game.peek().out, 'la seringue vide sort de la bouche').toBe(true);
      let shown = false;
      for (let i = 0; i < 20; i++) {
        run(ctx, game, sc, 0.1);
        s = game.peek();
        if (s.tongueShown) {
          shown = true;
          expect(s.tongueBase.distanceTo(s.barLocal), 'la langue sort au coin des lèvres').toBeLessThan(hr * 0.4);
        }
      }
      expect(shown, 'il tire la langue').toBe(true);
      // (sortie, la seringue est revenue dans notre main, loin de sa bouche)
      expect(game.peek().tipInHead.distanceTo(game.peek().barLocal)).toBeGreaterThan(hr);
      ctx.pressStop();
      expect(ctx.finished?.why).toBe('just');
      game.destroy();
      expect(sc.model.head.children.includes(sc.model.head.children.find((c) => c.isMesh && c.geometry?.type === 'CapsuleGeometry')), 'la langue est retirée').toBe(false);
      sc.dispose();
    }, 60000);
  }
});

describe('maréchal-ferrant en 3D', () => {
  for (const [breed, foal] of GABARITS) {
    it(`il lève le pied ; trois coups par clou : juste ; les clous restent dans l'image (${breed}${foal ? ', poulain' : ''})`, () => {
      const { a, sc } = makeStage({ breed, foal });
      const ctx = ctxFor(a, sc);
      const game = games.shoe(ctx);
      run(ctx, game, sc, 2.5);
      const s = game.peek();
      expect(s.lifted).toBeGreaterThan(0.9);
      for (const q of s.nails) expect(inView(q, ctx.view), `clou (${q.x.toFixed(0)}, ${q.y.toFixed(0)})`).toBe(true);
      for (let i = 0; i < 4; i++) {
        for (let k = 0; k < 3; k++) {
          game.down(game.peek().nails[i]);
          run(ctx, game, sc, 0.15);
        }
      }
      expect(game.peek().hits).toEqual([3, 3, 3, 3]);
      ctx.pressStop();
      expect(ctx.finished?.why).toBe('just');
      run(ctx, game, sc, 1);
      expect(sc.mood.lift, 'il repose son pied').toBe(null);
      game.destroy();
      sc.dispose();
    }, 60000);
  }

  it('un coup de trop : le clou plie, il tire sur son pied, la note le dit', () => {
    const { a, sc } = makeStage();
    const ctx = ctxFor(a, sc);
    const game = games.shoe(ctx);
    run(ctx, game, sc, 2.5);
    for (let i = 0; i < 4; i++) game.down(game.peek().nails[0]);
    expect(game.peek().hits[0]).toBe(4);
    expect(sc.mood.annoyed).toBeGreaterThan(0);
    game.destroy();
    sc.dispose();
  }, 60000);
});

/** Curer : chaque crottin (pas les touffes propres) vers la brouette, d'une tape. */
function pickAll(ctx, game, sc) {
  for (let i = 0; i < 30; i++) {
    const s = game.peek();
    const d = s.itemsScreen.filter((x) => !x.good);
    if (!d.length || ctx.done || s.phase === 'spread') break;
    game.down(d[0]);
    game.up(d[0]);
    run(ctx, game, sc, 0.5);
  }
}
/** Étaler : des passes sur tout le sol (de la logique), projetées à l'écran. */
function spreadAll(ctx, game, sc, F, rows = 7, from = null) {
  for (let r = 0; r < rows; r++) {
    const y = F.y + 18 + ((F.h - 36) * r) / (rows - 1);
    const s = game.peek();
    if (s.value >= s.lo) break;
    if (from) game.down(from);
    else game.down(s.screen(F.x + 10, y));
    for (let k = 0; k <= 10; k++) game.move(s.screen(F.x + 10 + ((F.w - 20) * k) / 10, y), true);
    game.up(s.screen(F.x + F.w - 10, y));
    run(ctx, game, sc, 0.05);
  }
}

describe('curer le box du cheval en 3D (soin « clean »)', () => {
  for (const [breed, foal] of GABARITS) {
    it(`il mange au fond ; le crottin dans la brouette, puis la paille étalée : juste (${breed}${foal ? ', poulain' : ''})`, () => {
      const { a, sc } = makeStage({ breed, foal });
      const ctx = ctxFor(a, sc);
      const game = games.clean(ctx);
      run(ctx, game, sc, 0.3);
      const s = game.peek();
      for (const q of s.itemsScreen) expect(inView(q, ctx.view), 'crottin dans l\'image').toBe(true);
      expect(inView(s.binScreen, ctx.view), 'la brouette est dans l\'image').toBe(true);
      pickAll(ctx, game, sc);
      run(ctx, game, sc, 1);
      expect(game.peek().phase).toBe('spread');
      spreadAll(ctx, game, sc, game.peek().floor);
      ctx.pressStop();
      expect(ctx.finished?.why).toBe('just');
      game.destroy();
      sc.dispose();
    }, 60000);
  }
});

/** Glisser un crottin du sol jusqu'à la brouette 3D (là où on la voit), et le lâcher dessus. */
function dragToBarrow(ctx, game, sc) {
  const s = game.peek();
  const it = s.itemsScreen.find((x) => !x.good);
  const to = { x: s.binScreen.x, y: s.binScreen.y + 12 };
  game.down(it);
  for (let k = 1; k <= 8; k++) game.move({ x: it.x + ((to.x - it.x) * k) / 8, y: it.y + ((to.y - it.y) * k) / 8 }, true);
  game.up(to);
  run(ctx, game, sc, 0.8);
  return s.itemsScreen.length;
}

describe('glisser le crottin jusqu\'à la brouette 3D', () => {
  for (const [breed, foal] of [['selle_francais', false], ['shetland', false]]) {
    it(`soin « clean » (le cheval au fond) : lâché sur la brouette, il y est (${breed})`, () => {
      const { a, sc } = makeStage({ breed, foal });
      const ctx = ctxFor(a, sc);
      const game = games.clean(ctx);
      run(ctx, game, sc, 0.3);
      const n = dragToBarrow(ctx, game, sc);
      const s = game.peek();
      expect(s.dirtInBin, 'compté dans la brouette').toBe(1);
      expect(s.itemsScreen.length, 'un de moins par terre').toBe(n - 1);
      game.destroy();
      sc.dispose();
    }, 60000);
  }
  it('corvée « curer » (box vide) : lâché sur la brouette, il y est', () => {
    const sc = makeEmpty(barnMod.boxFloorSet);
    const ctx = ctxFor(null, sc);
    const game = floor3d.muck3dGame(ctx);
    run(ctx, game, sc, 0.3);
    dragToBarrow(ctx, game, sc);
    expect(game.peek().dirtInBin).toBe(1);
    game.destroy();
    sc.dispose();
  }, 60000);
  it('lâché loin de la brouette : il retombe par terre, à la vue, et se reprend', () => {
    const { a, sc } = makeStage();
    const ctx = ctxFor(a, sc);
    const game = games.clean(ctx);
    run(ctx, game, sc, 0.3);
    const s = game.peek();
    const it = s.itemsScreen.find((x) => !x.good);
    const to = { x: it.x + 40, y: it.y + 10 };
    game.down(it);
    for (let k = 1; k <= 4; k++) game.move({ x: it.x + (40 * k) / 4, y: it.y + (10 * k) / 4 }, true);
    game.up(to);
    run(ctx, game, sc, 0.5);
    const after = game.peek();
    expect(after.dirtInBin).toBe(0);
    expect(after.itemsScreen.length).toBe(s.itemsScreen.length);
    expect(after.itemsScreen.some((q) => Math.hypot(q.x - to.x, q.y - to.y) < 30), 'retombé sous le doigt').toBe(true);
    game.destroy();
    sc.dispose();
  }, 60000);
});

describe('les corvées en 3D, sans animal (le box vide, l\'allée)', () => {
  it('la scène s\'ouvre sans animal : pas de double, le doigt ne touche aucun animal, tout est rendu à la fermeture', () => {
    const sc = makeEmpty(barnMod.boxFloorSet);
    expect(sc.noAnimal).toBe(true);
    expect(sc.model.noAnimal).toBe(true);
    expect(sc.pickAnimal(200, 200)).toBe(null);
    sc.update(0.1);
    expect(() => sc.update(0.1)).not.toThrow();
    const r = sc.renderer;
    sc.dispose();
    expect(r.calls.dispose).toBe(1);
  });

  it('curer : tout le crottin, pas les touffes propres : juste ; une touffe jetée : trop', () => {
    let sc = makeEmpty(barnMod.boxFloorSet);
    let ctx = ctxFor(null, sc);
    let game = floor3d.muck3dGame(ctx);
    run(ctx, game, sc, 0.3);
    const p0 = game.peek();
    expect(p0.itemsScreen.filter((x) => x.good).length).toBeGreaterThan(0);
    for (const q of p0.itemsScreen) expect(inView(q, ctx.view)).toBe(true);
    pickAll(ctx, game, sc);
    run(ctx, game, sc, 1);
    expect(ctx.finished?.why).toBe('just');
    game.destroy();
    sc.dispose();
    // une touffe propre d'abord
    sc = makeEmpty(barnMod.boxFloorSet);
    ctx = ctxFor(null, sc);
    game = floor3d.muck3dGame(ctx);
    run(ctx, game, sc, 0.3);
    const tuft = game.peek().itemsScreen.find((x) => x.good);
    game.down(tuft);
    game.up(tuft);
    run(ctx, game, sc, 0.6);
    pickAll(ctx, game, sc);
    run(ctx, game, sc, 1);
    expect(ctx.finished?.why).toBe('high');
    game.destroy();
    sc.dispose();
  }, 60000);

  it('pailler : une brassée sur la botte, la paille partout : juste ; la paille posée se voit (cases de la logique)', () => {
    const sc = makeEmpty(barnMod.boxFloorSet);
    const ctx = ctxFor(null, sc);
    const game = floor3d.straw3dGame(ctx);
    run(ctx, game, sc, 0.3);
    const s = game.peek();
    expect(inView(s.baleScreen, ctx.view), 'la botte est dans l\'image').toBe(true);
    const bale = s.screen(s.bale.x + s.bale.w / 2, s.bale.y + s.bale.h / 2);
    // (une brassée par rangée, sur le milieu des cases : une couche partout, sans tas — le trajet depuis la botte passe
    // hors du sol)
    const F = s.floor;
    for (let r = 0; r < 8; r++) {
      const y = F.y + 15 + 30 * r;
      game.down(bale);
      game.move(s.screen(F.x + F.w + 20, y), true);
      for (let x = F.x + F.w + 20; x >= F.x + 4; x -= 15) game.move(s.screen(x, y), true);
      game.up(s.screen(F.x + 4, y));
      run(ctx, game, sc, 0.05);
    }
    expect(game.peek().cells.some((c) => c.n > 0)).toBe(true);
    ctx.pressStop();
    expect(ctx.finished?.why).toBe('just');
    game.destroy();
    sc.dispose();
  }, 60000);

  it('balayer l\'allée : tout vers la pelle, pas de passe à vide : juste', () => {
    const sc = makeEmpty(barnMod.aisleSet);
    const ctx = ctxFor(null, sc);
    const game = chores3d.sweep3dGame(ctx);
    run(ctx, game, sc, 0.3);
    for (const q of game.peek().bitsScreen) expect(inView(q, ctx.view), 'brin dans l\'image').toBe(true);
    for (let pass = 0; pass < 3 && game.peek().value < game.peek().lo; pass++) {
      for (let row = 0; row < 9; row++) {
        const s = game.peek();
        const y = 116 + row * 28;
        game.down(s.screen(10, y));
        for (let k = 0; k <= 16; k++) game.move(s.screen(10 + 20 * k, y), true);
        game.up(s.screen(330, y));
        run(ctx, game, sc, 0.05);
      }
    }
    expect(game.peek().collected).toBe(game.peek().total);
    ctx.pressStop();
    expect(ctx.finished?.why).toBe('just');
    game.destroy();
    sc.dispose();
  }, 60000);

  it('sans WebGL, la scène d\'une corvée ne s\'ouvre pas (le jeu dessiné prend la main)', () => {
    const ui = { game: null };
    const host = { insertBefore() {} };
    expect(chores3d.openChoreScene(ui, { kind: 'muck', target: 0 }, host, null)).toBe(null);
    expect(chores3d.openChoreScene(ui, { kind: 'living' }, host, null)).toBe(null);
    expect(ui.vxCover ?? 0).toBe(0);
  });
});

void THREE;
