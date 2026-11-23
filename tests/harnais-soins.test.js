// Vermifuge, seller (sangle) et curer le box en 3D, la tête du cheval toujours belle (chantier « harnais ») : le vrai
// cheval (GLB chargé dans node), la vraie scène (faux rendu). Le poids selon la race et l'âge ; la seringue posée au
// coin des lèvres, devant la peau, son corps en travers de l'image, hors de la tête ; la langue et la pâte au coin des
// lèvres, au moins 1,5 s ; la sangle cadrée avec le nez (et de la marge) et toute la croupe, et il se retourne vers la
// sangle quand c'est trop serré ; curer le box : le nez dans l'image, le compteur hors de sa tête.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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
let games;
let kit;
let dw;
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
  games = (await import('../src/ui/minigames/horsePlus3d.js')).HORSE_PLUS_GAMES;
  kit = await import('../src/ui/minigames/horse3dKit.js');
  dw = await import('../src/ui/minigames/deworm.js');
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
function makeStage(breed, foal = false) {
  const a = animalMod.createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: foal ? 7 : 1500, seed: 77 });
  a.name = 'Honey';
  a.gear = { halter: { item: 'halter', color: 'red' } };
  for (const k in a.needs) a.needs[k] = 30;
  const model = horseReal.buildRealHorseModel(animalMod.stageLook(a), a.breed, gltf);
  const sc = new stageMod.CareStage({ a, renderer: stageMod.headlessRenderer(), model, set: stallMod.stallSet });
  sc.resize(W, H, frameMod.fitView(W, H, 400, 360));
  sc.ready = true;
  const ctx = fakeCtxOf(a, t, { scene: sc, view: frameMod.fitView(W, H, 400, 360) });
  return { a, sc, ctx };
}
function run(ctx, game, sc, s, dt = 1 / 30) {
  for (let k = 0; k < s / dt; k++) {
    ctx.time += dt;
    game.update(dt);
    sc.update(dt);
  }
}
const inView = (q, v, pad = 0) => q && !q.behind && q.x > v.x0 + pad && q.x < v.x1 - pad && q.y > v.y0 + pad && q.y < v.y1 - pad;
/** Distance signée à la peau (négative dans le cheval) : le triangle le plus proche et le côté de sa face. */
function skinDistance(sc) {
  kit.bakeSkin(sc);
  const pos = sc.proxy.pos;
  const idx = sc.proxy.geo.index;
  const tris = [];
  for (let i = 0; i < idx.count; i += 3) tris.push(new THREE.Triangle(...[0, 1, 2].map((k) => new THREE.Vector3().fromArray(pos, idx.getX(i + k) * 3))));
  const cp = new THREE.Vector3();
  const nn = new THREE.Vector3();
  return (p) => {
    let best = Infinity;
    let sg = 1;
    for (const tri of tris) {
      tri.closestPointToPoint(p, cp);
      const d = cp.distanceToSquared(p);
      if (d < best) {
        best = d;
        tri.getNormal(nn);
        sg = Math.sign(nn.dot(p.clone().sub(cp))) || 1;
      }
    }
    return sg * Math.sqrt(best);
  };
}

describe('le poids du cheval selon sa race et son âge (vermifuge)', () => {
  const kg = (breed, ageDays = 2000) => {
    const a = animalMod.createAnimal({ species: 'horse', breed, ageDays, seed: 3 });
    a.weight = 50;
    return dw.horseKg(a);
  };
  it('Falabella ≈ 70 à 110 kg, Shetland ≈ 150 à 200 kg, cheval de selle ≈ 450 à 550 kg, trait ≈ 700 à 900 kg', () => {
    expect(kg('falabella')).toBeGreaterThanOrEqual(dw.DOSE.min);
    expect(kg('falabella')).toBeLessThanOrEqual(110);
    expect(kg('shetland')).toBeGreaterThanOrEqual(150);
    expect(kg('shetland')).toBeLessThanOrEqual(200);
    expect(kg('selle_francais')).toBeGreaterThanOrEqual(450);
    expect(kg('selle_francais')).toBeLessThanOrEqual(550);
    expect(kg('percheron')).toBeGreaterThanOrEqual(700);
    expect(kg('percheron')).toBeLessThanOrEqual(900);
    expect(kg('arabe')).toBeLessThan(kg('selle_francais'));
  });
  it('un poulain d\'une semaine pèse bien moins, jamais moins que la plus petite dose', () => {
    for (const b of ['selle_francais', 'shetland', 'falabella']) {
      expect(kg(b, 7)).toBeLessThanOrEqual(kg(b));
      expect(kg(b, 7)).toBeGreaterThanOrEqual(dw.DOSE.min);
    }
    expect(kg('shetland', 7)).toBeLessThan(kg('shetland'));
    expect(kg('selle_francais', 7)).toBeLessThanOrEqual(150);
  });
});

describe('vermifuge en 3D : la seringue au coin des lèvres, la grimace', () => {
  for (const [breed, foal] of [['selle_francais', false], ['falabella', false], ['percheron', false], ['haflinger', true]]) {
    it(`${breed}${foal ? ' (poulain)' : ''} : l'embout devant la peau, le corps en travers de l'image et hors de la tête ; la langue et la pâte au moins 1,5 s`, () => {
      const { sc, ctx } = makeStage(breed, foal);
      ctx.opts = {};
      const game = games.deworm(ctx);
      run(ctx, game, sc, 0.3);
      ctx.pressStop();
      run(ctx, game, sc, 1.5);
      let s = game.peek();
      game.down(s.syringe);
      game.move(s.bar, true);
      game.up();
      expect(game.peek().syr.placed).toBe(true);
      run(ctx, game, sc, 0.3);
      s = game.peek();
      const dist = skinDistance(sc);
      const [tip, mid, back] = s.bodyWorld;
      expect(dist(tip), 'l\'embout devant la peau').toBeGreaterThan(0);
      expect(dist(tip), 'l\'embout au coin des lèvres').toBeLessThan(0.02);
      expect(dist(mid), 'le corps hors de la tête').toBeGreaterThan(0.01);
      expect(dist(back), 'le bout hors de la tête').toBeGreaterThan(0.02);
      // en travers de l'image : le corps (20 cm) fait au moins 60 % de la longueur qu'il aurait de face
      const fwd = sc.camera.getWorldDirection(new THREE.Vector3());
      const axis = back.clone().sub(tip).normalize();
      expect(Math.abs(axis.dot(fwd)), 'le corps n\'est pas vu de bout').toBeLessThan(0.55);
      for (const q of s.bodyScreen) expect(inView(q, ctx.view), 'toute la seringue dans l\'image').toBe(true);
      // la pâte, puis la grimace
      game.down(s.bar);
      let pasteSeen = false;
      while (game.peek().syr.left > 0) {
        run(ctx, game, sc, 0.1);
        pasteSeen ||= game.peek().pasteShown;
      }
      game.up();
      expect(pasteSeen, 'la pâte blanche au coin des lèvres').toBe(true);
      let tongue = 0;
      for (let i = 0; i < 60; i++) {
        run(ctx, game, sc, 0.1);
        const p = game.peek();
        if (p.tongueShown) {
          tongue += 0.1;
          expect(inView(p.tongueTip, ctx.view), 'la langue dans l\'image').toBe(true);
        }
      }
      expect(tongue, 'la langue sort au moins 1,5 s').toBeGreaterThanOrEqual(1.5);
      // la base de la langue au coin des lèvres (à moins de 3 cm de l'embout posé)
      expect(game.peek().tongueBase.distanceTo(game.peek().barLocal)).toBeLessThan(0.05);
      game.destroy();
      sc.dispose();
    }, 90000);
  }
});

describe('seller : la sangle, cadrée avec le nez et la croupe', () => {
  for (const breed of ['selle_francais', 'shetland', 'percheron']) {
    it(`${breed} : le nez (avec de la marge) et la croupe dans l'image ; trop serrée, il tourne la tête vers la sangle et reste dans l'image`, () => {
      const { sc, ctx } = makeStage(breed);
      const game = games.saddle(ctx);
      run(ctx, game, sc, 0.3);
      for (const key of ['pad', 'saddle']) {
        const s = game.peek();
        game.down(s.tray);
        for (let k = 1; k <= 6; k++) game.move({ x: s.tray.x + ((s.spot.x - s.tray.x) * k) / 6, y: s.tray.y + ((s.spot.y - s.tray.y) * k) / 6 }, true);
        game.up(s.spot);
        run(ctx, game, sc, 0.5);
        ctx.pressStop();
        run(ctx, game, sc, 1.6);
      }
      expect(game.peek().stage).toBe('girth');
      run(ctx, game, sc, 1.5);
      const v = ctx.view;
      const P = (w) => sc.project(w);
      const nose = sc.live('nose');
      expect(inView(P(nose), v, 10), 'le bout du nez, avec de la marge').toBe(true);
      expect(inView(P(sc.marks.croup), v, 4), 'la croupe').toBe(true);
      expect(inView(P(sc.marks.tail), v, 0), 'la queue').toBe(true);
      expect(sc.decor.props.bucket.group.visible, 'pas de seau dans le champ').toBe(false);
      const yaw0 = Math.abs(sc.yaw);
      const flat = (p) => p.clone().setY(0);
      const look0 = flat(sc.live('muzzle')).sub(flat(sc.model.neck.getWorldPosition(new THREE.Vector3()))).normalize();
      const hold = ctx.buttons.find((b) => /🪢/.test(b.text));
      hold.opts.onDown();
      for (let i = 0; i < 200 && game.peek().tension <= 1.0; i++) run(ctx, game, sc, 0.05);
      run(ctx, game, sc, 2.5);
      // (il s'est retourné : l'encolure tournée vers le flanc, la tête toujours dans l'image)
      const look1 = flat(sc.live('muzzle')).sub(flat(sc.model.neck.getWorldPosition(new THREE.Vector3()))).normalize();
      const turn = Math.acos(Math.min(1, look0.dot(look1)));
      expect(Math.abs(sc.yaw), 'il regarde la sangle').toBeGreaterThan(yaw0);
      expect(turn, 'la tête tournée vers le flanc').toBeGreaterThan(0.35);
      // (vers nous : le bout du nez s'est rapproché de la caméra)
      const camL = sc.holder.worldToLocal(sc.camera.position.clone());
      const noseL = sc.holder.worldToLocal(sc.live('muzzle'));
      expect(Math.sign(noseL.x - sc.holder.worldToLocal(sc.model.neck.getWorldPosition(new THREE.Vector3())).x), 'tournée de notre côté').toBe(Math.sign(camL.x));
      expect(inView(P(sc.live('nose')), v, 0), 'le nez reste dans l\'image').toBe(true);
      hold.opts.onUp();
      game.destroy();
      expect(sc.decor.props.bucket.group.visible === false, 'le seau revient').toBe(false);
      sc.dispose();
    }, 90000);
  }
});

describe('curer le box : le cheval mange au fond, son nez dans l\'image, le compteur hors de sa tête', () => {
  for (const breed of ['selle_francais', 'shetland', 'frison']) {
    it(`${breed}`, () => {
      const { a, sc, ctx } = makeStage(breed);
      a.needs.hygiene = 10;
      const game = games.clean(ctx);
      run(ctx, game, sc, 2.5);
      const s = game.peek();
      const v = ctx.view;
      expect(s.headPts.length).toBeGreaterThan(2);
      for (const q of s.headPts.slice(0, 2)) expect(inView(q, v, 2), 'le museau et la nuque dans l\'image').toBe(true);
      const c = s.counter;
      expect(c.x >= v.x0 && c.x + c.w <= v.x1 && c.y >= v.y0 && c.y + c.h <= v.y1, 'le compteur dans l\'image').toBe(true);
      // (le compteur ne touche pas la tête : 12 px de marge autour)
      const xs = s.headPts.map((q) => q.x);
      const ys = s.headPts.map((q) => q.y);
      const hb = { x0: Math.min(...xs) - 12, x1: Math.max(...xs) + 12, y0: Math.min(...ys) - 12, y1: Math.max(...ys) + 12 };
      const overlap = c.x < hb.x1 && c.x + c.w > hb.x0 && c.y < hb.y1 && c.y + c.h > hb.y0;
      expect(overlap, `le compteur hors de la tête ${JSON.stringify({ c, hb })}`).toBe(false);
      game.destroy();
      sc.dispose();
    }, 90000);
  }
});
