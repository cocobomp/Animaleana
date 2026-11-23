// Chantier « soinsbeaute », point 2 : caresser, boire, nourrir, pansage, laver en 3D. Sur le vrai cheval (GLB chargé
// dans node, faux rendu), on joue chaque soin du début à la carte de fin et on vérifie à chaque image que le bout du
// nez et les oreilles restent dans l'image avec au moins 5 % de marge ; pour le Falabella et le Shetland, que la tête
// fait au moins un cinquième de la largeur de l'image à boire et au foin ; quand il en a assez des caresses, qu'il
// détourne à peine la tête.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { loadStageMods, makeStage, ctxFor, run, endCard, HORSES } from './fixtures/soinsbeauteStage.js';

let headFrame;
let feed3d;
let pet3d;
let pansage3d;
let wash3d;
beforeAll(async () => {
  await loadStageMods();
  headFrame = await import('../src/ui/minigames/headFrame.js');
  feed3d = await import('../src/ui/minigames/feed3d.js');
  pet3d = await import('../src/ui/minigames/pet3d.js');
  pansage3d = await import('../src/ui/minigames/pansage3d.js');
  wash3d = await import('../src/ui/minigames/wash3d.js');
}, 60000);

const random = Math.random;
let seed = 1;
beforeEach(() => {
  seed = 777;
  Math.random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
});
afterAll(() => {
  Math.random = random;
});

/** Suivi de la tête : pire marge, et largeur de la tête dans les phases demandées. */
function watcher(sc) {
  const shape = headFrame.headShape(sc);
  const w = { min: 9, at: '', width: {} };
  w.check = (phase) => {
    const m = headFrame.headMargins(sc, shape.points(0));
    if (m.min < w.min) {
      w.min = m.min;
      w.at = phase;
      w.m = m;
    }
    w.width[phase] = Math.min(w.width[phase] ?? 9, m.width);
  };
  return w;
}

/** Fin du jeu : la carte de fin couvre le bas, la scène se recadre au-dessus ; on mesure une fois posée. */
function finish(ctx, game, sc, w) {
  run(ctx, game, sc, 1.9);
  endCard(sc, 0.5);
  run(ctx, game, sc, 3.5);
  run(ctx, game, sc, 1.5, 1 / 30, () => w.check('fin'));
}

const PLAY = {
  water(sc, a) {
    const ctx = ctxFor(a, sc);
    const game = feed3d.water3dGame(ctx);
    const w = watcher(sc);
    run(ctx, game, sc, 1, 1 / 30, () => w.check('début'));
    game.down();
    for (let i = 0; i < 600 && game.peek().value < (game.peek().lo + game.peek().hi) / 2; i++) run(ctx, game, sc, 1 / 30, 1 / 30, () => w.check('remplit'));
    game.up();
    run(ctx, game, sc, 0.5, 1 / 30, () => w.check('remplit'));
    ctx.pressStop();
    // (il boit : la tête descend dans le seau)
    run(ctx, game, sc, 4, 1 / 30, () => w.check('boit'));
    finish(ctx, game, sc, w);
    return { w, ctx, game };
  },
  feed(sc, a) {
    const ctx = ctxFor(a, sc);
    const game = feed3d.ration3dGame(ctx);
    const w = watcher(sc);
    run(ctx, game, sc, 1, 1 / 30, () => w.check('foin'));
    game.down();
    for (let i = 0; i < 600 && game.peek().hay < 0.85; i++) run(ctx, game, sc, 1 / 30, 1 / 30, () => w.check('foin'));
    game.up();
    run(ctx, game, sc, 0.5, 1 / 30, () => w.check('foin'));
    ctx.pressStop();
    run(ctx, game, sc, 1.5, 1 / 30, () => w.check('granulés'));
    game.down();
    for (let i = 0; i < 600 && game.peek().grain < (game.peek().grainLo + game.peek().grainHi) / 2; i++) run(ctx, game, sc, 1 / 30, 1 / 30, () => w.check('granulés'));
    game.up();
    ctx.pressStop();
    run(ctx, game, sc, 4, 1 / 30, () => w.check('mange'));
    finish(ctx, game, sc, w);
    return { w, ctx, game };
  },
  pet(sc, a) {
    const ctx = ctxFor(a, sc);
    const game = pet3d.pet3dGame(ctx);
    const w = watcher(sc);
    run(ctx, game, sc, 1, 1 / 30, () => w.check('début'));
    // caresses douces sur l'encolure, aller-retour, jusqu'à « il en a assez »
    let k = 0;
    const stroke = () => {
      const sp = pet3d.petSpots(sc);
      const c = sc.project(sp.neck);
      const x = c.x + Math.sin(k++ * 0.25) * 30;
      return { x, y: c.y };
    };
    game.down(stroke());
    ctx.pointer.down = true;
    for (let i = 0; i < 900 && game.peek().prog <= game.peek().hi + 0.02; i++) {
      game.move(stroke(), true);
      run(ctx, game, sc, 1 / 30, 1 / 30, () => w.check('caresse'));
    }
    // il en a assez : il détourne la tête (trois secondes)
    for (let i = 0; i < 90; i++) {
      game.move(stroke(), true);
      run(ctx, game, sc, 1 / 30, 1 / 30, () => w.check('assez'));
    }
    ctx.pointer.down = false;
    game.up();
    ctx.pressStop();
    finish(ctx, game, sc, w);
    return { w, ctx, game };
  },
  brush(sc, a) {
    const ctx = ctxFor(a, sc);
    const game = pansage3d.pansage3dGame(ctx);
    const w = watcher(sc);
    // (étrille et brosse : le cheval entier ; le cure-pied et le peigne sont des gros plans, pas mesurés ici)
    run(ctx, game, sc, 2, 1 / 30, () => w.check('étrille'));
    game.key('Enter', true);
    run(ctx, game, sc, 3, 1 / 30, (i) => { if (game.peek().stage === 'brush') w.check('brosse'); });
    for (let i = 0; i < 12 && !ctx.done; i++) {
      game.key('Enter', true);
      run(ctx, game, sc, 2.5);
    }
    expect(ctx.done).toBe(true);
    run(ctx, game, sc, 1.5, 1 / 30, () => w.check('ébroue'));
    finish(ctx, game, sc, w);
    return { w, ctx, game };
  },
  wash(sc, a) {
    const ctx = ctxFor(a, sc);
    const game = wash3d.wash3dGame(ctx);
    const w = watcher(sc);
    run(ctx, game, sc, 2, 1 / 30, () => w.check('éponge'));
    game.key('Enter', true);
    game.key('Space', true);
    for (let i = 0; i < 900 && !ctx.done; i++) run(ctx, game, sc, 1 / 30, 1 / 30, () => w.check('douche'));
    game.key('Space', false);
    run(ctx, game, sc, 1.5, 1 / 30, () => w.check('ébroue'));
    finish(ctx, game, sc, w);
    return { w, ctx, game };
  },
};

describe('soins 3D : le nez et les oreilles toujours dans l\'image', () => {
  for (const act of Object.keys(PLAY)) {
    it(`${act} : les 8 chevaux, du début à la carte de fin, marge de 5 % au moins`, () => {
      const bad = [];
      for (const h of HORSES) {
        const { a, sc } = makeStage({ ...h, personality: 'calm' });
        const { w, ctx, game } = PLAY[act](sc, a);
        if (process.env.SB_LOG) console.log(act, h.key, w.min.toFixed(3), w.at, JSON.stringify(w.m, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)), JSON.stringify(Object.fromEntries(Object.entries(w.width).map(([k, v]) => [k, +v.toFixed(3)]))));
        if (w.min < 0.05) bad.push(`${h.key} ${w.at} ${JSON.stringify(w.m)}`);
        expect(ctx.done, `${act} ${h.key} fini`).toBe(true);
        game.destroy();
        sc.dispose();
      }
      expect(bad).toEqual([]);
    }, 120000);
  }
});

describe('soins 3D : les petits poneys bien visibles', () => {
  for (const key of ['falabella', 'shetland']) {
    it(`${key} : la tête fait au moins un cinquième de la largeur de l'image, à boire et au foin`, () => {
      const h = HORSES.find((x) => x.key === key);
      let r = PLAY.water(...Object.values(makeStage(h)).reverse());
      expect(r.w.width['début'], 'début (seau)').toBeGreaterThanOrEqual(0.2);
      expect(r.w.width.boit, 'boit').toBeGreaterThanOrEqual(0.2);
      r.game.destroy();
      r = PLAY.feed(...Object.values(makeStage(h)).reverse());
      expect(r.w.width.foin, 'foin').toBeGreaterThanOrEqual(0.2);
      r.game.destroy();
    }, 60000);
  }
});

describe('caresser en 3D : il en a assez', () => {
  it('il détourne à peine la tête (regard proche, lookAmt 0,4 au plus)', () => {
    expect(pet3d.PET3D.fedUpLook).toBeLessThanOrEqual(0.4);
    const { a, sc } = makeStage({ breed: 'selle_francais', personality: 'calm' });
    const { ctx, game } = PLAY.pet(sc, a);
    expect(ctx.finished.why).toBe('high');
    game.destroy();
    sc.dispose();
  }, 30000);
});
