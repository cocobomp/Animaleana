// Brider en 3D, la tête toujours belle (chantier « harnais ») : le vrai cheval (GLB chargé dans node), la vraie scène
// (faux rendu). On vérifie sur plusieurs gabarits que les lanières du filet sont SUR la peau (jamais dedans), que la
// sous-gorge passe sous la gorge à 6–8 mm de la peau quand elle est serrée et pend quand elle est lâche, que le licol
// est enlevé dès le début, que les oreilles se plient sans basculer, et que le nez et les oreilles restent dans l'image.
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
function makeStage(breed) {
  const a = animalMod.createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: 1500, seed: 77 });
  a.name = 'Honey';
  a.gear = { halter: { item: 'halter', color: 'red' } };
  for (const k in a.needs) a.needs[k] = 30;
  const model = horseReal.buildRealHorseModel(animalMod.stageLook(a), a.breed, gltf);
  const sc = new stageMod.CareStage({ a, renderer: stageMod.headlessRenderer(), model, set: stallMod.stallSet });
  sc.resize(W, H, frameMod.fitView(W, H, 400, 360));
  sc.ready = true;
  return { a, sc };
}
function run(ctx, game, sc, s, dt = 1 / 30) {
  for (let k = 0; k < s / dt; k++) {
    ctx.time += dt;
    game.update(dt);
    sc.update(dt);
  }
}
const inView = (q, v, pad = 0) => q && !q.behind && q.x > v.x0 + pad && q.x < v.x1 - pad && q.y > v.y0 + pad && q.y < v.y1 - pad;
/**
 * Distance signée à la peau (copie figée de la pose du moment) : négative dans le cheval. Le triangle le plus proche
 * (parmi ceux près de la tête) et le côté de sa face.
 */
function skinDistance(sc) {
  kit.bakeSkin(sc);
  const pos = sc.proxy.pos;
  const idx = sc.proxy.geo.index;
  const c = sc.model.head.getWorldPosition(new THREE.Vector3());
  const tris = [];
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  for (let i = 0; i < idx.count; i += 3) {
    A.fromArray(pos, idx.getX(i) * 3);
    B.fromArray(pos, idx.getX(i + 1) * 3);
    C.fromArray(pos, idx.getX(i + 2) * 3);
    if (Math.min(A.distanceTo(c), B.distanceTo(c), C.distanceTo(c)) < 1.0) tris.push(new THREE.Triangle(A.clone(), B.clone(), C.clone()));
  }
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
        sg = Math.sign(nn.dot(cp.sub(p).negate())) || 1;
      }
    }
    return sg * Math.sqrt(best);
  };
}
/** Combien de sommets de nos lanières sont dans la peau (un coin plus de 5 mm dedans : la lanière fait 4,5 mm d'épaisseur et 22 mm de large, posée à 7 mm). */
function strapsInside(sc, game) {
  const dist = skinDistance(sc);
  const s = game.straps();
  const meshes = [s.crown, s.throat, s.brow, s.nose, ...s.cheeks].filter((m) => m?.visible);
  let bad = 0;
  let all = 0;
  let worst = 0;
  const where = {};
  const v = new THREE.Vector3();
  for (const m of meshes) {
    m.updateWorldMatrix(true, false);
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 2) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      all++;
      const d = dist(v);
      worst = Math.min(worst, d);
      if (d < -0.005) {
        bad++;
        const np = (pos.count - 8) / 8 || pos.count / 8;
        const k = `${m.name}`;
        where[k] = (where[k] ?? '') + `${Math.floor((i % (2 * np)) / 2)}:${(d * 1000).toFixed(0)} `;
      }
    }
  }
  return { bad, all, meshes: meshes.length, worst, where: JSON.stringify(where) };
}

const BREEDS = ['selle_francais', 'shetland', 'frison', 'percheron', 'falabella', 'arabe'];

describe('brider en 3D : le filet posé sur la peau, la tête toujours belle', () => {
  for (const breed of BREEDS) {
    it(`${breed} : licol enlevé, lanières jamais dans la tête, oreilles pliées, sous-gorge sous la gorge`, () => {
      const { a, sc } = makeStage(breed);
      const ctx = fakeCtxOf(a, t, { scene: sc, view: frameMod.fitView(W, H, 400, 360) });
      const game = games.bridle(ctx);
      const v = ctx.view;
      run(ctx, game, sc, 2.6);
      let s = game.peek();
      expect(s.halterHidden, 'le licol est enlevé dès le début').toBe(true);
      expect(s.measured).toBe(true);
      // étape 1 : la têtière devant les oreilles, les montants un peu bas, le mors sous les lèvres
      let c = strapsInside(sc, game);
      expect(c.meshes, 'têtière, muserolle, deux montants').toBeGreaterThanOrEqual(4);
      expect(c.bad / c.all, `étape 1 : ${c.bad}/${c.all} ${c.where} points de lanière dans la tête (pire ${c.worst})`).toBeLessThan(0.03);
      for (const k of ['bar', 'teeth', 'nose']) expect(inView(s[k], v, 4), `${k} dans l'image`).toBe(true);
      game.down(s.bar);
      run(ctx, game, sc, 1.4);
      s = game.peek();
      expect(s.step).toBe('ears');
      c = strapsInside(sc, game);
      expect(c.bad / c.all, `mors en place : ${c.bad}/${c.all} ${c.where}`).toBeLessThan(0.03);
      for (const e of s.ears) expect(inView(e, v, 24), 'les oreilles, avec de la place au-dessus').toBe(true);
      // une oreille : elle se plie (vers l'avant, un peu aplatie), ne bascule pas
      const ear = sc.model.ears[1];
      game.down(s.ears[0]);
      run(ctx, game, sc, 0.4);
      expect(ear.scale.y, 'l\'oreille aplatie pendant le pli').toBeLessThan(0.95);
      c = strapsInside(sc, game);
      expect(c.bad / c.all, `têtière qui passe derrière l'oreille : ${c.bad}/${c.all} ${c.where}`).toBeLessThan(0.04);
      run(ctx, game, sc, 0.6);
      expect(ear.scale.y, 'l\'oreille reprend sa forme').toBeGreaterThan(0.99);
      s = game.peek();
      game.down(s.ears[1]);
      run(ctx, game, sc, 2.6);
      s = game.peek();
      expect(s.step).toBe('throat');
      expect(game.straps().crown.visible && game.straps().brow.visible && game.straps().throat.visible).toBe(true);
      // la sous-gorge lâche pend sous la gorge (plus bas que la peau)
      expect(s.sag, 'lâche : elle pend').toBeGreaterThan(0.02);
      c = strapsInside(sc, game);
      expect(c.bad / c.all, `sous-gorge lâche : ${c.bad}/${c.all} ${c.where}`).toBeLessThan(0.03);
      expect(inView(s.nose, v, 4) && inView(s.throatSpot, v, 4), `le nez et la gorge dans l'image ${JSON.stringify([s.nose, s.throatSpot, v])}`).toBe(true);
      // trop serrée : sur la peau, 6 à 8 mm de marge, jamais dedans
      const hold = ctx.buttons.find((b) => /🪢/.test(b.text));
      hold.opts.onDown();
      while (game.peek().throat < 0.99) run(ctx, game, sc, 0.05);
      hold.opts.onUp();
      // (il secoue la tête un moment, puis se calme : on mesure la lanière posée)
      run(ctx, game, sc, 1.5);
      expect(game.peek().sag, 'serrée : presque plus de mou').toBeLessThan(0.01);
      const dist = skinDistance(sc);
      const P = game.paths().throat;
      const head = sc.model.head;
      // (le long de sa normale : 6 à 8 mm de la peau ; et jamais dedans, même dans le creux de la gorge)
      const along = [];
      for (let i = 2; i < P.p.length - 2; i++) {
        const p = head.localToWorld(P.p[i].clone());
        const n = P.n[i].clone().transformDirection(head.matrixWorld);
        const hits = sc.proxy.hitAll(new THREE.Ray(p.clone().addScaledVector(n, 0.002), n.clone().negate()));
        if (hits.length) along.push(hits[0].distance - 0.002);
        expect(dist(p), 'la sous-gorge n\'est jamais dans la peau').toBeGreaterThan(0.0008);
      }
      expect(along.length).toBeGreaterThan(P.p.length - 6);
      for (const g of along) {
        expect(g, `marge de la sous-gorge à la peau (${along.map((x) => (x * 1000).toFixed(1)).join(' ')} mm)`).toBeGreaterThan(0.0059);
        expect(g, `marge de la sous-gorge à la peau (${along.map((x) => (x * 1000).toFixed(1)).join(' ')} mm)`).toBeLessThan(0.0081);
      }
      c = strapsInside(sc, game);
      expect(c.bad / c.all, `trop serrée : ${c.bad}/${c.all} ${c.where}`).toBeLessThan(0.03);
      // la sous-gorge passe SOUS la gorge : son milieu est plus bas que le coin des lèvres... et derrière la ganache
      const mid = P.p[Math.floor(P.p.length / 2)];
      expect(mid.y, 'sous la gorge').toBeLessThan(-sc.model.dims.hr * 2);
      expect(mid.z, 'derrière la mâchoire, pas sous les joues').toBeLessThan(sc.model.dims.snoutZ * 0.45);
      game.destroy();
      expect(sc.model.head.children.some((o) => o.name === 'bridle3d'), 'tout est retiré').toBe(false);
      sc.dispose();
    }, 90000);
  }
});
