// Les objets du jour autour de l'animal : tirés au sort de façon stable pour la journée (setting.js : pickExtras),
// posés dans l'image sans jamais cacher l'animal ni ce qu'on lui tend (extras.js : placeExtras).
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as THREE from 'three';
import { pickExtras, EXTRAS, EXTRAS_OF, careAmbience } from '../src/game/care/setting.js';
import { loadFarm, farmStage, run } from './fixtures/farmStage.js';

describe('les objets du jour (pur)', () => {
  it('le même jour, les mêmes objets ; le lendemain, pas tout à fait les mêmes', () => {
    for (const place of Object.keys(EXTRAS_OF)) {
      for (const id of ['a1', 'b2', 'horse-77', 'zz']) {
        let prev = null;
        for (let day = 1; day <= 30; day++) {
          const a = pickExtras({ day, id, place });
          const b = pickExtras({ day, id, place });
          expect(a).toEqual(b);
          expect(a.length).toBe(Math.min(3, EXTRAS_OF[place].length));
          expect(new Set(a).size).toBe(a.length);
          for (const k of a) {
            expect(EXTRAS_OF[place]).toContain(k);
            expect(EXTRAS[k]).toBeTruthy();
          }
          if (prev) expect([...a].sort(), `${place} ${id} jour ${day}`).not.toEqual([...prev].sort());
          prev = a;
        }
      }
    }
  });

  it('sur un mois, plusieurs objets différents passent ; pas de chat sur le muret pour un chat', () => {
    const seen = new Set();
    for (let day = 1; day <= 30; day++) for (const k of pickExtras({ day, id: 'x', place: 'pre' })) seen.add(k);
    expect(seen.size).toBeGreaterThanOrEqual(6);
    for (let day = 1; day <= 30; day++) expect(pickExtras({ day, id: 'c', place: 'jardin', species: 'cat' })).not.toContain('chat');
  });

  it('ni fleurs ni papillon sous la neige ; la nuit, ni oiseau ni poule ; toujours trois objets', () => {
    const snow = careAmbience({ hour: 12, weather: 'snow', season: 'winter' });
    const night = careAmbience({ hour: 23 });
    for (let day = 1; day <= 20; day++) {
      const a = pickExtras({ day, id: 'q', place: 'pre', amb: snow });
      expect(a).not.toContain('fleurs');
      expect(a).not.toContain('papillon');
      expect(a.length).toBe(3);
      const b = pickExtras({ day, id: 'q', place: 'pre', amb: night });
      for (const k of ['oiseau', 'poule', 'papillon']) expect(b).not.toContain(k);
    }
  });

  it('ce que le décor ne peut pas tenir (without : la brouette au petit pré de la balle) n\'est jamais tiré ; un autre objet à sa place', () => {
    let had = 0;
    for (let day = 1; day <= 40; day++) {
      const a = pickExtras({ day, id: 'g2', place: 'pre', species: 'goat' });
      const b = pickExtras({ day, id: 'g2', place: 'pre', species: 'goat', without: ['brouette'] });
      if (a.includes('brouette')) had++;
      expect(b).not.toContain('brouette');
      expect(b.length).toBe(3);
      // (sans rien à retirer, les mêmes objets qu'avant)
      expect(pickExtras({ day, id: 'g2', place: 'pre', species: 'goat', without: [] })).toEqual(a);
    }
    expect(had).toBeGreaterThan(3);
  });

  it('deux animaux le même jour n\'ont pas forcément les mêmes objets', () => {
    const lists = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => pickExtras({ day: 5, id, place: 'pre' }).join(',')));
    expect(lists.size).toBeGreaterThan(1);
  });
});

describe('les objets du jour dans la scène', () => {
  let decorFor;
  let farmBrush;
  beforeAll(async () => {
    await loadFarm();
    ({ decorFor } = await import('../src/ui/minigames/care3d.js'));
    ({ farmBrush3dGame: farmBrush } = await import('../src/ui/minigames/farmBrush3d.js'));
  }, 120000);
  afterEach(() => new Promise((resolve) => setImmediate(resolve)));

  const amb = careAmbience({ hour: 11, weather: 'clear' });

  for (const place of ['pre', 'etable']) {
    it(`${place} : dans l'image, jamais devant l'animal ni sur le râtelier ou l'abreuvoir`, () => {
      const kinds = EXTRAS_OF[place].slice(0, 6);
      const { sc, ctx } = farmStage({ species: 'cow', set: decorFor('cow', place, { amb, kinds, seed: 3 }) });
      const game = farmBrush(ctx);
      run(ctx, game, sc, 2);
      const X = sc.decor.extras;
      const placed = X.items.filter((i) => i.at);
      expect(placed.length).toBeGreaterThan(0);
      const v = sc.view;
      const cam = sc.camera.position;
      for (const it of placed) {
        it.m.updateWorldMatrix(true, true);
        const b = new THREE.Box3().setFromObject(it.m);
        const c = b.getCenter(new THREE.Vector3());
        const q = sc.project(c);
        expect(q.x > v.x0 && q.x < v.x1 && q.y > v.y0 && q.y < v.y1, `${it.kind} dans l'image`).toBe(true);
        // (entre la caméra et l'objet, on ne traverse pas l'animal après l'objet : l'objet ne le cache pas)
        for (const p of [c, new THREE.Vector3(c.x, b.max.y, c.z)]) {
          const dir = p.clone().sub(cam);
          const d = dir.length();
          const h = sc.proxy.hit(new THREE.Ray(cam.clone(), dir.normalize()), -9, 1e9);
          if (h) expect(h.point.distanceTo(cam), `${it.kind} devant l'animal`).toBeLessThan(d + 0.05);
        }
        for (const pr of [sc.decor.props.rack, sc.decor.props.trough]) {
          const w = pr.group.getWorldPosition(new THREE.Vector3());
          expect(w.distanceTo(it.at), `${it.kind} sur un accessoire`).toBeGreaterThan(0.3);
        }
        // (ils apparaissent en douceur, puis restent à leur taille)
        expect(it.m.scale.x).toBeCloseTo(1, 2);
      }
      // (deux objets ne sont jamais à la même place)
      for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) expect(placed[i].at.distanceTo(placed[j].at)).toBeGreaterThan(0.2);
      game.destroy();
      sc.dispose();
    });
  }

  it('les objets bougent un peu (la poule, l\'oiseau, le chat) et tout est libéré à la fermeture', () => {
    const { sc, ctx } = farmStage({ species: 'goat', set: decorFor('goat', 'pre', { amb, kinds: ['poule', 'oiseau', 'chat', 'fleurs'], seed: 9 }) });
    const game = farmBrush(ctx);
    run(ctx, game, sc, 1.5);
    const X = sc.decor.extras;
    const geos = [];
    X.group.traverse((o) => o.geometry && geos.push(o.geometry));
    expect(geos.length).toBeGreaterThan(0);
    let freed = 0;
    for (const g of new Set(geos)) g.addEventListener('dispose', () => freed++);
    game.destroy();
    sc.dispose();
    expect(X.group.parent).toBeNull();
    expect(freed).toBe(new Set(geos).size);
  });

  it('le même jour, les mêmes places', () => {
    const at = [];
    for (let k = 0; k < 2; k++) {
      const { sc, ctx } = farmStage({ species: 'sheep', set: decorFor('sheep', 'pre', { amb, kinds: ['botte', 'fleurs', 'seau'], seed: 4 }) });
      const game = farmBrush(ctx);
      run(ctx, game, sc, 1.5);
      at.push(sc.decor.extras.items.map((i) => i.at?.toArray().map((x) => x.toFixed(1)).join(',') ?? '-').join('|'));
      game.destroy();
      sc.dispose();
    }
    expect(at[0]).toBe(at[1]);
  });
});
