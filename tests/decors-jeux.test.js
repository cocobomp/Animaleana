// Les deux jeux qui changent eux-mêmes de décor suivent l'heure, la météo et la saison du soin, et reçoivent les
// objets du jour : la balle de la chèvre dans le pré (goatPlay3d.js, paddock.js) et la longe au rond (lunge3d.js,
// roundPen.js). Le décor du soin leur passe de quoi s'habiller (decor.dress : care3d.js careDecor) ; à la fin, le décor
// du soin revient et tout ce qui a été ajouté est libéré.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as THREE from 'three';
import { careAmbience, hashSeed } from '../src/game/care/setting.js';
import { fakeCtx as fakeCtxOf } from './fixtures/careCtx.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';
import { loadFarm, farmStage, run } from './fixtures/farmStage.js';

let care3d;
let goatPlay;
let lunge3d;
let H;
beforeAll(async () => {
  await loadFarm();
  care3d = await import('../src/ui/minigames/care3d.js');
  goatPlay = await import('../src/ui/minigames/goatPlay3d.js');
  lunge3d = await import('../src/ui/minigames/lunge3d.js');
  const gltf = await loadRealHorseGltf();
  const horseReal = await import('../src/game/models/horseReal.js');
  horseReal.realHorseBase(gltf);
  H = {
    gltf, horseReal,
    t: (await import('../src/i18n.js')).t,
    stage: await import('../src/game/care/stage.js'),
    animal: await import('../src/sim/animal.js'),
    frame: await import('../src/ui/minigames/frame.js'),
  };
}, 180000);
afterEach(() => new Promise((resolve) => setImmediate(resolve)));

/** Ce que careDecor donne au décor du soin (un jour, un animal, une ambiance). */
const dressOf = (amb, id = 'x1', species = 'goat') => ({ amb, day: 4, id, species, seed: hashSeed(`4|${id}`) % 100000, look: null });
/** Le décor habituel du soin, habillé comme dans le jeu (careDecor). */
const setOf = (species, place, amb, id) => care3d.decorFor(species, place, { amb, kinds: [], seed: 1, dress: dressOf(amb, id, species) });

describe('la balle de la chèvre, dans le pré', () => {
  for (const [label, amb] of [
    ['la pluie', careAmbience({ hour: 13, weather: 'rain', season: 'autumn' })],
    ['la nuit', careAmbience({ hour: 22.5, weather: 'clear', season: 'summer' })],
    ['la neige', careAmbience({ hour: 12, weather: 'snow', season: 'winter' })],
  ]) {
    it(`${label} : le pré prend l'heure et le temps du soin, les objets du jour se posent hors du terrain ; la chèvrerie revient`, () => {
      const { sc, ctx } = farmStage({ species: 'goat', set: setOf('goat', 'etable', amb, 'g1') });
      const barn = sc.decor;
      const fog0 = sc.scene.fog;
      const game = goatPlay.goatPlay3dGame(ctx);
      const pre = sc.decor;
      expect(pre.kind).toBe('pre');
      expect(pre.ambience?.weather).toBe(amb.weather);
      expect(pre.ambience?.time).toBe(amb.time);
      const A = pre.ambienceParts;
      if (amb.wet) expect(A.rain).toBeTruthy();
      if (amb.snowy) {
        expect(A.snow).toBeTruthy();
        // (l'herbe cachée sous la neige, pas de pâquerettes l'hiver)
        pre.group.traverse((o) => {
          if (o.userData?.grass) expect(o.visible).toBe(false);
        });
      }
      if (amb.lamp) {
        // (le réverbère : contre la clôture, hors du terrain où la balle roule)
        expect(A.lamp).toBeTruthy();
        const d = pre.dims;
        expect(A.lamp.position.z).toBeLessThan(d.z0 + 0.2);
      }
      // la lumière du soleil suit l'heure
      let sun = null;
      pre.group.traverse((o) => {
        if (o.isDirectionalLight && o.castShadow) sun = o;
      });
      expect(sun.intensity).toBeLessThan(2.6 * (amb.time === 'nuit' ? 0.3 : 0.9));
      run(ctx, game, sc, 1.5);
      const X = pre.extras;
      expect(X).toBeTruthy();
      const placed = X.items.filter((i) => i.at && !i.path);
      expect(placed.length).toBeGreaterThan(0);
      // (hors du terrain de la balle : derrière ou à côté, jamais sur l'herbe où elle roule)
      const d = pre.dims;
      for (const it of placed) {
        const inYard = Math.abs(it.at.x - (d.x0 + d.x1) / 2) < d.halfW && it.at.z > d.back && it.at.z < d.front;
        expect(inYard, `${it.kind} sur le terrain`).toBe(false);
      }
      const geos = new Set();
      pre.group.traverse((o) => o.geometry && !o.isSprite && geos.add(o.geometry));
      let freed = 0;
      for (const g of geos) g.addEventListener('dispose', () => freed++);
      game.destroy();
      expect(sc.decor).toBe(barn);
      expect(barn.group.parent).toBe(sc.scene);
      expect(pre.group.parent).toBe(null);
      expect(sc.scene.fog).toBe(fog0);
      expect(freed).toBe(geos.size);
      sc.dispose();
    }, 60000);
  }

  it('sans ambiance (jeu ouvert sans le jeu complet) : le pré d\'avant, rien d\'ajouté', () => {
    const { sc, ctx } = farmStage({ species: 'goat' });
    const game = goatPlay.goatPlay3dGame(ctx);
    expect(sc.decor.kind).toBe('pre');
    expect(sc.decor.ambience).toBe(undefined);
    expect(sc.decor.extras).toBe(undefined);
    game.destroy();
    sc.dispose();
  });
});

describe('la longe, au rond', () => {
  function horseStage(amb) {
    const a = H.animal.createAnimal({ species: 'horse', breed: 'selle_francais', colorIndex: 0, ageDays: 900, seed: 77 });
    a.name = 'Honey';
    a.personality = 'calm';
    a.gear = { halter: { item: 'halter', color: 'red' } };
    const model = H.horseReal.buildRealHorseModel(H.animal.stageLook(a), a.breed, H.gltf);
    const sc = new H.stage.CareStage({ a, renderer: H.stage.headlessRenderer(), model, set: setOf('horse', 'box', amb, 'h1') });
    const view = H.frame.fitView(358, 520, 400, 360);
    return { a, sc, view };
  }

  for (const [label, amb] of [
    ['le soir sous la pluie', careAmbience({ hour: 20, weather: 'rain', season: 'autumn' })],
    ['la nuit', careAmbience({ hour: 23, weather: 'clear', season: 'summer' })],
    ['le brouillard', careAmbience({ hour: 9, weather: 'fog', season: 'autumn' })],
  ]) {
    it(`${label} : le rond prend l'heure et le temps du soin, la pluie tombe sur tout le rond, les objets dehors autour`, () => {
      const { a, sc, view } = horseStage(amb);
      const stall = sc.decor;
      const ctx = fakeCtxOf(a, H.t, { scene: sc, view });
      const game = lunge3d.lunge3dGame(ctx);
      sc.resize(358, 520, view);
      sc.ready = true;
      const pen = sc.decor;
      expect(pen.kind).toBe('roundPen');
      expect(pen.ambience?.weather).toBe(amb.weather);
      const A = pen.ambienceParts;
      const F = pen.dims.F;
      if (amb.wet) {
        // (les gouttes : sur tout le rond, la caméra en fait le tour)
        const p = A.rain.geometry.attributes.position;
        let x0 = Infinity;
        let x1 = -Infinity;
        for (let i = 0; i < p.count; i++) {
          x0 = Math.min(x0, p.getX(i));
          x1 = Math.max(x1, p.getX(i));
        }
        expect(x0).toBeLessThan(-F);
        expect(x1).toBeGreaterThan(F);
      }
      if (amb.lamp) {
        expect(A.lamp).toBeTruthy();
        expect(Math.hypot(A.lamp.position.x, A.lamp.position.z)).toBeGreaterThan(F);
      }
      // (la brume plus loin que dans un petit décor : on voit encore la clôture d'en face)
      expect(sc.scene.fog.far).toBeGreaterThan(2 * F);
      for (let k = 0; k < 45; k++) {
        ctx.time += 1 / 30;
        game.update(1 / 30);
        sc.update(1 / 30);
      }
      const X = pen.extras;
      const placed = X.items.filter((i) => i.at);
      expect(placed.length).toBeGreaterThan(0);
      for (const it of placed) {
        // (dehors, au pied de la clôture, ou dessus : jamais sur la piste)
        const r = Math.hypot(it.at.x, it.at.z);
        expect(r, it.kind).toBeGreaterThan(F - 0.2);
      }
      const geos = new Set();
      pen.group.traverse((o) => o.geometry && !o.isSprite && geos.add(o.geometry));
      let freed = 0;
      for (const g of geos) g.addEventListener('dispose', () => freed++);
      game.destroy();
      expect(sc.decor).toBe(stall);
      expect(pen.group.parent).toBe(null);
      expect(freed).toBe(geos.size);
      sc.dispose();
    }, 90000);
  }
});

describe('les objets du jour au rond et au pré : à leur place (sans caméra fixe pour la longe)', () => {
  it('au rond, les places sont toutes dehors ou sur la clôture, tournées vers le milieu', async () => {
    const { roundPenSet } = await import('../src/game/care/roundPen.js');
    const pen = roundPenSet({ high: false }, { R: 3.4, F: 4.6, u: 1, L: 2.4 });
    expect(pen.spots.length).toBeGreaterThan(20);
    for (const s of pen.spots) {
      const r = Math.hypot(s.p[0], s.p[2]);
      expect(r).toBeGreaterThan(4.6 - 0.2);
      // (face : son devant regarde vers le milieu du rond, ou le long de la clôture pour les perchés)
      const f = new THREE.Vector3(Math.sin(s.face), 0, Math.cos(s.face));
      const toC = new THREE.Vector3(-s.p[0], 0, -s.p[2]).normalize();
      if (s.kind === 'floor' || s.kind === 'hang') expect(f.dot(toC)).toBeGreaterThan(0.9);
    }
    pen.dispose();
  });
});
