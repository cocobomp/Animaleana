// Un peu de vie dans les gros plans : quand le sol n'est pas dans l'image (nourrir le cheval de près), le décor ajoute
// des choses accrochées (un fer à cheval au poteau, un licol au mur), un vol d'oiseaux loin derrière, des poules au
// loin, une hirondelle sous le toit (setting.js : pickLife ; extras.js : placeExtras). Jamais devant l'animal, ni sur
// sa tête, ni sur ce qu'on lui tend ; la nuit, rien ne vole.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as THREE from 'three';
import { pickLife, lifeOff, LIFE_OF, EXTRAS, careAmbience, pickExtras } from '../src/game/care/setting.js';
import { fakeCtx as fakeCtxOf, fakeDocument } from './fixtures/careCtx.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

describe('le petit plus de chaque lieu (pur)', () => {
  it('le même jour, la même liste ; tous connus ; pas ce qui est déjà dans les objets du jour', () => {
    for (const place of Object.keys(LIFE_OF)) {
      for (let day = 1; day <= 10; day++) {
        const a = pickLife({ day, id: 'h1', place, species: 'horse' });
        expect(a).toEqual(pickLife({ day, id: 'h1', place, species: 'horse' }));
        for (const k of a) expect(EXTRAS[k], k).toBeTruthy();
        expect(new Set(a).size).toBe(a.length);
      }
    }
    expect(pickLife({ place: 'pre', taken: ['vol'] })).not.toContain('vol');
    // (le licol : seulement pour un cheval)
    expect(pickLife({ place: 'box', species: 'horse' })).toContain('licol');
    expect(pickLife({ place: 'box', species: 'goat' })).not.toContain('licol');
    // (en voyage : la liste d'« ailleurs », quelle que soit la famille du lieu)
    expect(pickLife({ place: 'ailleurs-plage' }).sort()).toEqual(pickLife({ place: 'ailleurs' }).sort());
  });

  it('la nuit, rien ne vole ni ne se promène ; sous la pluie, pas de vol d\'oiseaux', () => {
    const night = careAmbience({ hour: 23 });
    const rain = careAmbience({ hour: 12, weather: 'rain' });
    expect([...lifeOff(night)].sort()).toEqual(['hirondelle', 'papillons', 'poulailler', 'vol']);
    for (const place of Object.keys(LIFE_OF)) {
      for (const k of pickLife({ place, amb: night, species: 'horse' })) expect(['vol', 'poulailler', 'hirondelle', 'papillons']).not.toContain(k);
      expect(pickLife({ place, amb: rain })).not.toContain('vol');
    }
    // (il reste toujours quelque chose d'accroché, dedans comme dehors)
    for (const place of ['box', 'etable', 'pre', 'maison', 'jardin']) expect(pickLife({ place, amb: night, species: 'horse' }).length).toBeGreaterThan(0);
  });
});

describe('les gros plans du cheval : toujours un peu de vie à l\'image', () => {
  let H;
  beforeAll(async () => {
    fakeDocument();
    const gltf = await loadRealHorseGltf();
    const horseReal = await import('../src/game/models/horseReal.js');
    horseReal.realHorseBase(gltf);
    H = {
      gltf, horseReal,
      t: (await import('../src/i18n.js')).t,
      stage: await import('../src/game/care/stage.js'),
      animal: await import('../src/sim/animal.js'),
      frame: await import('../src/ui/minigames/frame.js'),
      care3d: await import('../src/ui/minigames/care3d.js'),
      feed3d: await import('../src/ui/minigames/feed3d.js'),
    };
  }, 180000);
  afterEach(() => new Promise((resolve) => setImmediate(resolve)));

  function feedScene(place, amb, { day = 3, w = 390, h = 600 } = {}) {
    const a = H.animal.createAnimal({ species: 'horse', breed: 'selle_francais', colorIndex: 0, ageDays: 900, seed: 77 });
    a.name = 'Honey';
    a.id = 'h-vie';
    const kinds = pickExtras({ day, id: a.id, place, species: 'horse', amb });
    const life = pickLife({ day, id: a.id, place, amb, species: 'horse', taken: kinds });
    const model = H.horseReal.buildRealHorseModel(H.animal.stageLook(a), a.breed, H.gltf);
    const sc = new H.stage.CareStage({ a, renderer: H.stage.headlessRenderer(), model, set: H.care3d.decorFor('horse', place, { amb, kinds, life, seed: 11 }) });
    const view = H.frame.fitView(w, h, 400, 360);
    sc.resize(w, h, view);
    sc.ready = true;
    const ctx = fakeCtxOf(a, H.t, { scene: sc, view });
    const game = H.feed3d.ration3dGame(ctx);
    for (let k = 0; k < 60; k++) {
      ctx.time += 1 / 30;
      game.update(1 / 30);
      sc.update(1 / 30);
    }
    sc.decor.extras.placeNow(sc);
    return { sc, ctx, game, kinds, life };
  }

  /** Les choses posées et qu'on voit (dans l'image), un vol compté une fois. */
  function shown(sc) {
    return sc.decor.extras.items.filter((i) => i.at);
  }

  for (const [place, w, h] of [['pre', 390, 600], ['box', 390, 600], ['pre', 640, 300]]) {
    it(`${place} (${w} × ${h}), nourrir : au moins trois choses à voir, aucune devant lui, sur sa tête ou sur la mangeoire`, () => {
      const amb = careAmbience({ hour: 10, weather: 'clear', season: 'summer' });
      const { sc, game } = feedScene(place, amb, { w, h });
      const list = shown(sc);
      if (process.env.DBG) console.log(place, w, sc.decor.extras.items.map((i) => `${i.kind}${i.at ? "@" + i.at.toArray().map((k) => k.toFixed(2)) : JSON.stringify(i.why)}`).join(" "));
      expect(list.length, list.map((i) => i.kind).join(',')).toBeGreaterThanOrEqual(3);
      const cam = sc.camera.position;
      const v = sc.view;
      const head = sc.live('head');
      const hc = sc.project(head);
      const box = new THREE.Box3().setFromObject(sc.model.coatMesh);
      for (const it of list) {
        if (it.path) {
          // (le vol : loin derrière lui, d'un bord de l'image à l'autre)
          expect(it.path.a.z, it.kind).toBeLessThan(box.min.z);
          expect(it.path.b.z, it.kind).toBeLessThan(box.min.z);
          const qa = sc.project(it.path.a);
          const qb = sc.project(it.path.b);
          expect(Math.min(qa.x, qb.x)).toBeLessThan(v.x0);
          expect(Math.max(qa.x, qb.x)).toBeGreaterThan(v.x1);
          continue;
        }
        it.m.updateWorldMatrix(true, true);
        const b = new THREE.Box3().setFromObject(it.m);
        const c = b.getCenter(new THREE.Vector3());
        const q = sc.project(c);
        expect(q.x > v.x0 - 10 && q.x < v.x1 + 10 && q.y > v.y0 && q.y < v.y1, `${it.kind} dans l'image`).toBe(true);
        // (pas sur sa tête)
        expect(Math.hypot(q.x - hc.x, q.y - hc.y), `${it.kind} sur sa tête`).toBeGreaterThan(sc.projectRadius(head, 0.2));
        // (il ne le cache pas : entre la caméra et l'objet, pas de peau plus loin que l'objet)
        for (const p of [c, new THREE.Vector3(c.x, b.max.y, c.z)]) {
          const dir = p.clone().sub(cam);
          const d = dir.length();
          const hit = sc.proxy.hit(new THREE.Ray(cam.clone(), dir.normalize()), -9, 1e9);
          if (hit) expect(hit.point.distanceTo(cam), `${it.kind} devant lui`).toBeLessThan(d + 0.05);
        }
        for (const pr of Object.values(sc.decor.props)) {
          if (!pr?.group?.visible || !pr.group.parent) continue;
          const wp = pr.group.getWorldPosition(new THREE.Vector3());
          expect(wp.distanceTo(it.at), `${it.kind} sur un accessoire`).toBeGreaterThan(0.3);
        }
      }
      game.destroy();
      sc.dispose();
    }, 60000);
  }

  it('la nuit au pré : rien ne vole ni ne picore, il reste quelque chose d\'accroché ou de posé', () => {
    const amb = careAmbience({ hour: 23, weather: 'clear', season: 'summer' });
    const { sc, game, life } = feedScene('pre', amb);
    for (const k of ['vol', 'poulailler', 'hirondelle']) expect(life).not.toContain(k);
    expect(shown(sc).length).toBeGreaterThan(0);
    game.destroy();
    sc.dispose();
  }, 60000);

  it('les oiseaux traversent puis disparaissent, et tout est libéré à la fermeture', () => {
    const amb = careAmbience({ hour: 10, weather: 'clear', season: 'summer' });
    const { sc, ctx, game } = feedScene('pre', amb);
    const X = sc.decor.extras;
    const fly = X.items.find((i) => i.path);
    if (fly) {
      const seen = new Set();
      for (let k = 0; k < 15 * 30; k++) {
        ctx.time += 1 / 30;
        game.update(1 / 30);
        sc.update(1 / 30);
        seen.add(fly.m.visible);
      }
      expect([...seen].sort()).toEqual([false, true]);
    }
    const geos = new Set();
    X.group.traverse((o) => o.geometry && geos.add(o.geometry));
    let freed = 0;
    for (const g of geos) g.addEventListener('dispose', () => freed++);
    game.destroy();
    sc.dispose();
    expect(X.group.parent).toBeNull();
    expect(freed).toBe(geos.size);
  }, 60000);
});
