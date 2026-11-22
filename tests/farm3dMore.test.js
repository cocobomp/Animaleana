// Les derniers soins de la ferme en 3D (sans navigateur, vrais modèles) : parer les onglons de la chèvre, jouer à la
// balle avec elle, nettoyer l'étable de la vache. Chaque jeu est joué jusqu'au bout, avec la note du jeu dessiné.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as THREE from 'three';
import { loadFarm, farmStage, run, inView } from './fixtures/farmStage.js';

let hoofTrim;
beforeAll(async () => {
  await loadFarm();
  hoofTrim = await import('../src/ui/minigames/hoofTrim3d.js');
}, 60000);

const random = Math.random;
beforeEach(() => {
  let seed = 4242;
  Math.random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
});
afterAll(() => {
  Math.random = random;
});

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Attend que la lame soit dans [lo, hi] (en descendant), puis coupe. */
function cutWhen(ctx, game, sc, lo, hi) {
  for (let k = 0; k < 600; k++) {
    const s = game.peek();
    if (s.ready && s.u >= lo && s.u <= hi) break;
    run(ctx, game, sc, 1 / 30);
  }
  ctx.buttons.find((b) => /Couper|Cut/.test(b.text)).opts.onTap();
  run(ctx, game, sc, 0.2);
}

describe('parer les onglons de la chèvre en 3D', () => {
  for (const c of [{ breed: 'alpine' }, { breed: 'saanen', young: true }, { breed: 'col_noir', sex: 'm' }]) {
    it(`${c.breed}${c.young ? ' (chevreau)' : ''} : le pied levé, la sole et les onglons dans l'image, quatre coupes justes`, () => {
      const { sc, ctx } = farmStage({ species: 'goat', ...c });
      const game = hoofTrim.hoofTrim3dGame(ctx);
      // (pas de coupe tant que le pied n'est pas levé et tenu)
      ctx.buttons.find((b) => /Couper|Cut/.test(b.text)).opts.onTap();
      expect(game.peek().cuts.every((x) => x === null)).toBe(true);
      run(ctx, game, sc, 2.5);
      let s = game.peek();
      expect(s.ready).toBe(true);
      expect(s.foot).toBe(0);
      // le pied de devant est levé, la sole vers le haut, du côté de la caméra
      const leg = sc.model.legs[sc.liftLeg];
      expect(leg.front).toBe(true);
      expect(leg.paw.getWorldPosition(v3()).y).toBeGreaterThan(0.12 * sc.marks.u);
      // les deux onglons et leur bout dans l'image
      expect(inView(s.clawTip, ctx.view, 10), JSON.stringify({ tip: s.clawTip, pts: sc.lastFrame.points.map((p) => sc.project(new THREE.Vector3(...p))).map((q) => [Math.round(q.x), Math.round(q.y)]) })).toBe(true);
      for (let i = 0; i < 2; i++) cutWhen(ctx, game, sc, 0.5, 0.6);
      // le second pied : derrière
      run(ctx, game, sc, 3);
      s = game.peek();
      expect(s.foot).toBe(1);
      expect(s.ready).toBe(true);
      expect(sc.model.legs[sc.liftLeg].front).toBe(false);
      expect(inView(s.clawTip, ctx.view, 10)).toBe(true);
      for (let i = 0; i < 2; i++) cutWhen(ctx, game, sc, 0.5, 0.6);
      expect(ctx.done).toBe(true);
      expect(ctx.finished.why).toBe('just');
      // il repose le pied, la chèvre de profil
      run(ctx, game, sc, 3);
      expect(sc.liftK).toBeLessThan(0.1);
      game.destroy();
      sc.dispose();
    }, 60000);
  }
  it('dans le vif : la coupe est rose, elle retire le pied, oreilles couchées ; la note le dit', () => {
    const { sc, ctx } = farmStage({ species: 'goat', breed: 'alpine' });
    const game = hoofTrim.hoofTrim3dGame(ctx);
    run(ctx, game, sc, 2.5);
    cutWhen(ctx, game, sc, 0.2, 0.3);
    expect(sc.mood.annoyed).toBeGreaterThan(0.5);
    expect(game.peek().cuts[0]).toBeGreaterThan(0.6);
    for (let i = 0; i < 3; i++) {
      run(ctx, game, sc, 3);
      cutWhen(ctx, game, sc, 0.5, 0.6);
    }
    expect(ctx.done).toBe(true);
    expect(ctx.finished.why).toBe('high');
    game.destroy();
    sc.dispose();
  }, 60000);
});
