// La longe et la liberté en 3D (src/ui/minigames/lunge3d.js, src/game/care/roundPen.js), jouées pour de vrai sans
// navigateur : la vraie scène de soin (faux rendu headlessRenderer), le vrai cheval réaliste (GLB chargé dans node) de
// chaque gabarit. On y vérifie que le jeu 3D est choisi, que pour les mêmes gestes la note est celle du jeu dessiné,
// que le cheval tourne sur la piste à l'allure de la jauge sans que ses sabots posés glissent, qu'il reste dans l'image
// (tête comprise) en portrait et en paysage, que le doigt sur le sable mène l'enfant au bon point du plan dessiné, et
// que le box revient et que tout est rendu à la fermeture.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as THREE from 'three';
import { fakeCtx as fakeCtxOf, fakeDocument } from './fixtures/careCtx.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

let t;
let gltf;
let stageMod;
let stallMod;
let horseReal;
let animalMod;
let frameMod;
let lunge3d;
let horse2d;
let care3d;
let which;
beforeAll(async () => {
  fakeDocument();
  ({ t } = await import('../src/i18n.js'));
  gltf = await loadRealHorseGltf();
  horseReal = await import('../src/game/models/horseReal.js');
  horseReal.realHorseBase(gltf);
  stageMod = await import('../src/game/care/stage.js');
  stallMod = await import('../src/game/care/stall.js');
  animalMod = await import('../src/sim/animal.js');
  frameMod = await import('../src/ui/minigames/frame.js');
  lunge3d = await import('../src/ui/minigames/lunge3d.js');
  horse2d = await import('../src/ui/minigames/horse.js');
  care3d = await import('../src/ui/minigames/care3d.js');
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

const BREEDS = ['selle_francais', 'frison', 'shetland', 'falabella', 'percheron', 'appaloosa'];
const PORTRAIT = [358, 520];
const LANDSCAPE = [520, 300];

function makeStage({ breed = 'selle_francais', foal = false, size = PORTRAIT, gear = { halter: { item: 'halter', color: 'red' } } } = {}) {
  const a = animalMod.createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: foal ? 7 : 900, seed: 77 });
  a.name = 'Honey';
  a.personality = 'calm';
  a.gear = gear;
  const model = horseReal.buildRealHorseModel(animalMod.stageLook(a), a.breed, gltf);
  const sc = new stageMod.CareStage({ a, renderer: stageMod.headlessRenderer(), model, set: stallMod.stallSet });
  const view = frameMod.fitView(size[0], size[1], 400, 360);
  return { a, sc, view, size };
}
const ctxFor = (a, sc, view, seed2 = 3) => {
  const c = fakeCtxOf(a, t, { scene: sc, view });
  c.rng = makeRngSeed(seed2);
  return c;
};
function makeRngSeed(s) {
  let x = (s >>> 0) || 1;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}
/** Ouvre le jeu 3D sur la scène (comme le cadre : le jeu, puis la taille de la toile), scène prête. */
function open3d(make, st) {
  const ctx = ctxFor(st.a, st.sc, st.view);
  const game = make(ctx);
  st.sc.resize(st.size[0], st.size[1], st.view);
  st.sc.ready = true;
  return { ctx, game };
}
function step(ctx, game, sc, dt = 1 / 30) {
  ctx.time += dt;
  game.update(dt);
  sc?.update(dt);
}
const btn = (ctx, ch) => ctx.buttons.find((b) => b.text.includes(ch));
const inView = (p, v, m = 0) => p.x >= v.x0 - m && p.x <= v.x1 + m && p.y >= v.y0 - m && p.y <= v.y1 + m;

describe('la longe et la liberté du cheval s\'ouvrent en 3D', () => {
  it('le soin a son jeu 3D (et les autres espèces gardent leur jeu dessiné)', () => {
    for (const act of ['lunge', 'liberty']) {
      expect(which.care3dWanted({ species: 'horse' }, act)).toBe(true);
      expect(care3d.care3dGameFor({ species: 'horse' }, act)).toBe(act === 'lunge' ? lunge3d.lunge3dGame : lunge3d.liberty3dGame);
      expect(which.care3dWanted({ species: 'goat' }, act)).toBe(false);
    }
    // (les soins de la branche « chevalplus » et les autres restent là)
    for (const act of ['feed', 'saddle', 'clean']) expect(which.care3dWanted({ species: 'horse' }, act)).toBe(true);
  });
});

describe('logique pure : vitesse, allure, plan du dessin posé sur le sable', () => {
  it('chaque bande de la jauge des allures tombe sur l\'allure du même nom (en montant comme en descendant)', () => {
    const order = [];
    for (let v = 0; v <= 100; v += 0.5) order.push(v);
    for (const seq of [order, [...order].reverse()]) {
      let g = 'idle';
      for (const v of seq) {
        g = horseReal.pickGait(g, lunge3d.lungeSpeed(v));
        const band = lunge3d.bandOf(v);
        if (band === 'walk') expect(g).toBe('walk');
        if (band === 'trot') expect(g).toBe('trot');
        if (band === 'canter') expect(g).toBe('canter');
        if (v < 3) expect(g).toBe('idle');
      }
    }
    // (jamais le grand galop à la longe ; toujours au-dessus de l'animation la plus lente du pas)
    expect(lunge3d.lungeSpeed(100)).toBeLessThan(6.3);
    expect(lunge3d.lungeSpeed(3.5)).toBeGreaterThan(0.3 * 1.6);
  });

  it('le plan dessiné posé sur le sable : aller et retour, la piste du dessin sur la piste du rond', () => {
    const plan = lunge3d.penPlan(3.4);
    for (const [x, y] of [[200, 158], [302, 158], [120, 80], [260, 230]]) {
      const P = plan.toWorld(x, y);
      expect(P.y).toBe(0);
      const q = plan.toLogic(P);
      expect(q.x).toBeCloseTo(x, 9);
      expect(q.y).toBeCloseTo(y, 9);
    }
    expect(plan.toWorld(200 + horse2d.ARENA_PLAN.path, 158).length()).toBeCloseTo(3.4, 9);
  });
});

describe('longe en 3D : même note que le jeu dessiné, à ses vraies allures', () => {
  /** Une séance : à chaque instant, ✨ ou 🐢 selon la vitesse lue (même règle dans les deux jeux), C'est bon à stopAt. */
  function session(ctx, game, sc, stopAt, onStep = null) {
    for (let k = 0; k < 30 * 40 && !ctx.done; k++) {
      const s = game.peek();
      const [lo, hi] = s.gaits[s.gait];
      if (k % 9 === 0) {
        if (s.v < (lo + hi) / 2 - 5) btn(ctx, '✨').opts.onTap();
        else if (s.v > (lo + hi) / 2 + 5) btn(ctx, '🐢').opts.onTap();
      }
      step(ctx, game, sc);
      onStep?.(k);
      if (s.value >= stopAt) ctx.pressStop();
    }
    return ctx.finished;
  }
  for (const [stopAt, why] of [[14, 'just'], [6, 'low'], [17.5, 'high']]) {
    it(`arrêt à ${stopAt} s de travail : « ${why} », la même note`, () => {
      const st = makeStage();
      const { ctx, game } = open3d(lunge3d.lunge3dGame, st);
      const f3 = session(ctx, game, st.sc, stopAt);
      const c2 = ctxFor(st.a, null, st.view);
      const g2 = horse2d.lungeGame(c2);
      const f2 = session(c2, g2, null, stopAt);
      expect(f3.why).toBe(why);
      expect(f2.why).toBe(why);
      expect(f3.q).toBeCloseTo(f2.q, 9);
      game.destroy();
      st.sc.dispose();
    }, 60000);
  }

  for (const breed of BREEDS) {
    it(`${breed} : sur la piste, à l'allure de la jauge, les sabots posés ne glissent pas, cheval et tête dans l'image`, () => {
      const st = makeStage({ breed });
      const { ctx, game } = open3d(lunge3d.lunge3dGame, st);
      const { sc } = st;
      const md = sc.model;
      const p = new THREE.Vector3();
      const flat = md.legs.map(() => null);
      const zPrev = [];
      const flats = [];
      const seen = { walk: 0, trot: 0, canter: 0 };
      let out = 0;
      for (const target of [24, 52, 80, 52]) {
        for (let k = 0; k < 30 * 5; k++) {
          const s = game.peek();
          if (k % 6 === 0) {
            if (s.v < target - 6) btn(ctx, '✨').opts.onTap();
            else if (s.v > target + 6) btn(ctx, '🐢').opts.onTap();
          }
          step(ctx, game, sc);
          const q = game.peek();
          // sur le cercle, tourné le long de la piste (à main gauche)
          expect(Math.hypot(q.horse3d.x, q.horse3d.z)).toBeCloseTo(q.R, 6);
          const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), sc.holder.rotation.y);
          expect(Math.abs(fwd.dot(q.horse3d.clone().normalize()))).toBeLessThan(1e-6);
          // le chemin parcouru = la vitesse jouée par l'animation
          expect(q.slid).toBeLessThan(1e-9);
          if (k > 60) {
            const band = lunge3d.bandOf(q.v);
            if (band && Math.abs(q.v - (horse2d.GAITS[band][0] + horse2d.GAITS[band][1]) / 2) < 10) {
              expect(q.gait3d).toBe(band);
              seen[band]++;
            }
          }
          if (k % 15 === 0) {
            sc.holder.updateMatrixWorld(true);
            for (const P of [sc.live('muzzle'), sc.live('forehead'), md.tail.getWorldPosition(new THREE.Vector3()), ...md.ears.map((e) => e.localToWorld(new THREE.Vector3(0, 0.12, 0)))]) {
              if (!inView(sc.project(P), st.view)) out++;
            }
          }
          if (k < 45) {
            // (pendant le changement d'allure, on ne mesure pas : les appuis repartent à zéro)
            flat.fill(null);
            zPrev.length = 0;
            continue;
          }
          sc.holder.updateMatrixWorld(true);
          md.legs.forEach((l, i) => {
            let lo = Infinity;
            let x = 0;
            let z = 0;
            for (const s0 of l.solePts) {
              p.copy(s0).applyMatrix4(l.fetlock.matrixWorld);
              lo = Math.min(lo, p.y);
              x += p.x / l.solePts.length;
              z += p.z / l.solePts.length;
            }
            // (un appui : le sabot au sol, qui recule sous le corps ; levé, il avance)
            const zl = sc.holder.worldToLocal(new THREE.Vector3(x, 0, z)).z;
            const back = zPrev[i] !== undefined && zl < zPrev[i];
            zPrev[i] = zl;
            if (lo < 0.015 * sc.double.scale && back) {
              flat[i] ??= { x0: x, z0: z, n: 0 };
              flat[i].x1 = x;
              flat[i].z1 = z;
              flat[i].n++;
            } else if (flat[i]) {
              if (flat[i].n > 2) flats.push(Math.hypot(flat[i].x1 - flat[i].x0, flat[i].z1 - flat[i].z0) / sc.double.scale);
              if (process.env.SLIP_LOG && flats.at(-1) > 0.05) console.log('  appui long', breed, 'membre', i, 'images', flat[i].n, 'k', k, 'cible', target, JSON.stringify(game.peek()).slice(0, 200));
              flat[i] = null;
            }
          });
        }
      }
      expect(seen.walk).toBeGreaterThan(10);
      expect(seen.trot).toBeGreaterThan(10);
      expect(seen.canter).toBeGreaterThan(10);
      expect(out).toBe(0);
      expect(flats.length).toBeGreaterThan(30);
      if (process.env.SLIP_LOG) console.log(breed, 'appuis', flats.length, 'moyenne', flats.reduce((a, b) => a + b, 0) / flats.length, 'max', Math.max(...flats), 'lâchés', game.peek().pinDrops, JSON.stringify(flats.map((f) => +(f * 100).toFixed(1))));
      const mean = flats.reduce((a, b) => a + b, 0) / flats.length;
      // (sans les sabots épinglés : 6 à 7 cm par appui en moyenne sur ce petit cercle, 10 cm au plus)
      expect(mean).toBeLessThan(0.006);
      expect(Math.max(...flats)).toBeLessThan(0.025);
      game.destroy();
      sc.dispose();
    }, 90000);
  }

  it('en paysage aussi, le cheval entier et sa tête restent dans l\'image tout le tour', () => {
    for (const breed of ['selle_francais', 'falabella', 'percheron']) {
      const st = makeStage({ breed, size: LANDSCAPE });
      const { ctx, game } = open3d(lunge3d.lunge3dGame, st);
      const { sc } = st;
      let out = 0;
      for (let k = 0; k < 30 * 12; k++) {
        if (k % 8 === 0 && game.peek().v < 50) btn(ctx, '✨').opts.onTap();
        step(ctx, game, sc);
        if (k % 10) continue;
        sc.holder.updateMatrixWorld(true);
        for (const P of [sc.live('muzzle'), sc.live('forehead'), sc.model.tail.getWorldPosition(new THREE.Vector3())]) if (!inView(sc.project(P), st.view)) out++;
      }
      expect(out).toBe(0);
      game.destroy();
      sc.dispose();
    }
  }, 90000);

  it('la caméra le suit de près : au téléphone, le cheval et sa tête sont grands dans l\'image tout le tour', () => {
    // (avant cette reprise, la caméra fixe montrait tout le rond : 60 à 100 px CSS du nez à la queue, sur 358)
    for (const breed of BREEDS) {
      const st = makeStage({ breed });
      const { ctx, game } = open3d(lunge3d.lunge3dGame, st);
      const { sc } = st;
      let minLen = Infinity;
      let minHead = Infinity;
      const tour = [];
      for (let k = 0; k < 30 * 14; k++) {
        if (k % 8 === 0 && game.peek().v < 50) btn(ctx, '✨').opts.onTap();
        step(ctx, game, sc);
        if (k < 30 || k % 10) continue;
        sc.holder.updateMatrixWorld(true);
        const px = (P, Q) => {
          const a = sc.project(P);
          const b = sc.project(Q);
          return Math.hypot(a.x - b.x, a.y - b.y) * st.view.scale;
        };
        const muz = sc.live('muzzle');
        minLen = Math.min(minLen, px(muz, sc.model.tail.getWorldPosition(new THREE.Vector3())));
        minHead = Math.min(minHead, px(muz, sc.model.ears[0].localToWorld(new THREE.Vector3(0, 0.12, 0))));
        tour.push(game.peek().phi);
      }
      // (il a fait plus d'un demi-tour pendant la mesure)
      expect(Math.max(...tour) - Math.min(...tour)).toBeGreaterThan(Math.PI);
      if (process.env.SLIP_LOG) console.log(breed, 'longueur min', minLen.toFixed(0), 'tête min', minHead.toFixed(0));
      expect(minLen).toBeGreaterThan(120);
      expect(minHead).toBeGreaterThan(40);
      game.destroy();
      sc.dispose();
    }
  }, 120000);

  it('sans licol ni filet, il porte un licol le temps de la longe ; la longe va de la main de l\'enfant à l\'anneau', () => {
    const st = makeStage({ gear: {} });
    const g0 = st.sc.double.gear;
    const { ctx, game } = open3d(lunge3d.lunge3dGame, st);
    const { sc } = st;
    expect(sc.double.gear).not.toBe(g0);
    expect(sc.double.gear.userData.meshes.some((m) => m.geometry?.type === 'TorusGeometry')).toBe(true);
    for (let k = 0; k < 60; k++) step(ctx, game, sc);
    const s = game.peek();
    // (l'enfant au milieu, petit cercle)
    expect(Math.hypot(s.kid3d.x, s.kid3d.z)).toBeLessThan(0.7);
    game.destroy();
    // le box revient, le licol prêté est retiré
    expect(sc.decor.kind).not.toBe('roundPen');
    expect(sc.double.gear).toBe(g0);
    sc.dispose();
  }, 60000);
});

describe('un poulain à la longe', () => {
  it('on ne lui demande que le pas et le trot, et il ne part jamais au galop (dessin et 3D : la même logique)', () => {
    const a = animalMod.createAnimal({ species: 'horse', breed: 'selle_francais', colorIndex: 0, ageDays: 7, seed: 77 });
    a.name = 'Bambi';
    const ctx = fakeCtxOf(a, t, {});
    ctx.rng = makeRngSeed(5);
    const game = horse2d.lungeGame(ctx);
    let maxV = 0;
    const asked = new Set();
    for (let k = 0; k < 30 * 40; k++) {
      if (k % 5 === 0) btn(ctx, '✨').opts.onTap();
      ctx.time += 1 / 30;
      game.update(1 / 30);
      const s = game.peek();
      maxV = Math.max(maxV, s.v);
      asked.add(s.gait);
    }
    expect(asked.has('canter')).toBe(false);
    expect(maxV).toBeLessThan(horse2d.GAITS.canter[0]);
    expect(lunge3d.bandOf(maxV)).not.toBe('canter');
  });
});

describe('liberté en 3D : le doigt sur le sable, la même note que le jeu dessiné', () => {
  /** Logique (x, y) → point du cadre où toucher (3D : le sable sous ce point du plan). */
  const screenOf = (sc, game, x, y) => (sc ? sc.project(sc.pen.toWorld(x, y)) : { x, y });
  function session(ctx, game, sc, callAt) {
    let first = true;
    for (let k = 0; k < 30 * 40 && !ctx.done; k++) {
      const s = game.peek();
      if (s.phase === 'drive') {
        const a = s.theta - 0.7 * s.dirSign;
        const p = screenOf(sc, game, 200 + Math.cos(a) * 64, 158 + Math.sin(a) * 64);
        const e = { ...p, type: 'touch' };
        if (first) game.down(e);
        else game.move(e, true);
        first = false;
        if (s.value >= callAt) ctx.pressStop();
      }
      step(ctx, game, sc);
    }
    return ctx.finished;
  }
  for (const [callAt, why] of [[9.5, 'just'], [4, 'low']]) {
    it(`appelé à ${callAt} s de pression : « ${why} », la même note`, () => {
      const st = makeStage();
      const { ctx, game } = open3d(lunge3d.liberty3dGame, st);
      const f3 = session(ctx, game, st.sc, callAt);
      const c2 = ctxFor(st.a, null, st.view);
      const g2 = horse2d.libertyGame(c2);
      const f2 = session(c2, g2, null, callAt);
      expect(f2.why).toBe(why);
      expect(f3.why).toBe(why);
      expect(f3.q).toBeCloseTo(f2.q, 6);
      game.destroy();
      st.sc.dispose();
    }, 60000);
  }

  for (const breed of BREEDS) {
    it(`${breed} : le doigt sur le sable mène l'enfant au bon point ; le cheval sur sa place du dessin, sans glisser, dans l'image`, () => {
      const st = makeStage({ breed });
      const { ctx, game } = open3d(lunge3d.liberty3dGame, st);
      const { sc } = st;
      step(ctx, game, sc);
      // toucher le sable en (250, 120) du plan : l'enfant y va
      const tap = sc.project(sc.pen.toWorld(250, 120));
      game.down({ ...tap, type: 'touch' });
      expect(game.peek().me.x).toBeCloseTo(250, 3);
      expect(game.peek().me.y).toBeCloseTo(120, 3);
      let out = 0;
      for (let k = 0; k < 30 * 3; k++) {
        step(ctx, game, sc);
        const s = game.peek();
        const P = sc.pen.toWorld(s.horse.x, s.horse.y);
        expect(s.horse3d.distanceTo(P)).toBeLessThan(1e-9);
        if (k % 10 === 0) {
          sc.holder.updateMatrixWorld(true);
          for (const Q of [sc.live('muzzle'), sc.live('forehead'), sc.model.tail.getWorldPosition(new THREE.Vector3())]) if (!inView(sc.project(Q), st.view)) out++;
        }
      }
      expect(game.peek().kid3d.distanceTo(sc.pen.toWorld(250, 120))).toBeLessThan(0.25);
      // on le pousse : il galope (petit galop), puis, serré de trop près, il s'emballe
      let maxGait = 'idle';
      const rank = { idle: 0, walk: 1, trot: 2, canter: 3, gallop: 4 };
      for (let k = 0; k < 30 * 4; k++) {
        const s = game.peek();
        const a = s.theta - 0.7 * s.dirSign;
        game.move({ ...sc.project(sc.pen.toWorld(200 + Math.cos(a) * 64, 158 + Math.sin(a) * 64)), type: 'touch' }, true);
        step(ctx, game, sc);
        if (rank[game.peek().gait3d] > rank[maxGait]) maxGait = game.peek().gait3d;
      }
      expect(maxGait).toBe('canter');
      expect(game.peek().maxSlide).toBeLessThan(0.15 * sc.double.scale);
      expect(out).toBe(0);
      // on l'appelle : il vient devant l'enfant et s'arrête, tourné vers elle
      ctx.pressStop();
      for (let k = 0; k < 30 * 4 && !ctx.done; k++) step(ctx, game, sc);
      for (let k = 0; k < 30; k++) step(ctx, game, sc);
      const s = game.peek();
      expect(ctx.done).toBe(true);
      const toKid = s.kid3d.clone().sub(s.horse3d).setY(0);
      const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.heading3d);
      expect(fwd.dot(toKid.normalize())).toBeGreaterThan(0.8);
      expect(s.moving).toBe(false);
      game.destroy();
      sc.dispose();
    }, 90000);
  }
});

describe('le rond de longe : à la place du box, et rendu à la fin', () => {
  it('le box est caché le temps de la séance, revient ensuite ; rien ne reste dans la scène', () => {
    const st = makeStage();
    const { sc } = st;
    const stall = sc.decor;
    const kids0 = sc.scene.children.length;
    const bg0 = sc.scene.background;
    for (const make of [lunge3d.lunge3dGame, lunge3d.liberty3dGame]) {
      const { ctx, game } = open3d(make, st);
      expect(sc.decor).not.toBe(stall);
      expect(sc.decor.kind).toBe('roundPen');
      expect(stall.group.parent).toBe(null);
      // la clôture est plus loin que la piste, la piste à la taille du cheval
      expect(sc.decor.dims.F).toBeGreaterThan(sc.decor.dims.R + 0.5);
      for (let k = 0; k < 30; k++) step(ctx, game, sc);
      game.destroy();
      expect(sc.decor).toBe(stall);
      expect(stall.group.parent).toBe(sc.scene);
      expect(sc.scene.children.length).toBe(kids0);
      expect(sc.scene.background).toBe(bg0);
      expect(sc.afterLife ?? []).toHaveLength(0);
      expect(sc.pen).toBeUndefined();
    }
    sc.dispose();
  }, 60000);
});
