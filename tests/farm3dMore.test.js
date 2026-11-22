// Les derniers soins de la ferme en 3D (sans navigateur, vrais modèles) : parer les onglons de la chèvre, jouer à la
// balle avec elle, nettoyer l'étable de la vache. Chaque jeu est joué jusqu'au bout, avec la note du jeu dessiné.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as THREE from 'three';
import { loadFarm, farmStage, run, inView } from './fixtures/farmStage.js';

let hoofTrim;
let goatPlay;
let barnClean;
let farmTreat;
let farmPet;
let farmBrush;
beforeAll(async () => {
  await loadFarm();
  farmPet = await import('../src/ui/minigames/farmPet3d.js');
  farmBrush = await import('../src/ui/minigames/farmBrush3d.js');
  farmTreat = await import('../src/ui/minigames/farmTreat3d.js');
  barnClean = await import('../src/ui/minigames/barnClean3d.js');
  hoofTrim = await import('../src/ui/minigames/hoofTrim3d.js');
  goatPlay = await import('../src/ui/minigames/goatPlay3d.js');
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

describe('jouer à la balle avec la chèvre, dans le pré', () => {
  for (const c of [{ breed: 'alpine' }, { breed: 'saanen', young: true }]) {
    it(`${c.breed}${c.young ? ' (chevreau)' : ''} : le pré à la place de la chèvrerie, elle court chercher la balle et la ramène, juste le bon nombre de fois`, () => {
      const { sc, ctx } = farmStage({ species: 'goat', ...c });
      const barn = sc.decor;
      const game = goatPlay.goatPlay3dGame(ctx);
      // le pré est posé, la chèvrerie cachée
      expect(sc.decor).not.toBe(barn);
      expect(sc.decor.kind).toBe('pre');
      expect(barn.group.parent).toBe(null);
      run(ctx, game, sc, 0.5);
      let s = game.peek();
      expect(inView(sc.project(s.goat), ctx.view)).toBe(true);
      expect(inView(sc.project(s.ball3d), ctx.view)).toBe(true);
      for (let r = 0; r < s.n; r++) {
        // on lance tout près d'elle
        const g = sc.holder.position;
        const tap = sc.project(new THREE.Vector3(g.x + 0.25 * sc.marks.u, 0, g.z + 0.2 * sc.marks.u));
        const x0 = sc.holder.position.clone();
        game.down(tap);
        expect(game.peek().fly).toBe(true);
        let moved = 0;
        let pushT = 0;
        for (let k = 0; k < 400 && game.peek().ball !== 'hand'; k++) {
          run(ctx, game, sc, 1 / 15);
          moved = Math.max(moved, sc.holder.position.distanceTo(x0));
          // la balle ramenée : devant son nez, au ras de l'herbe (après le coup de tête qui l'arrête)
          pushT = game.peek().ball === 'mouth' ? pushT + 1 / 15 : 0;
          if (pushT > 0.6) {
            const b = game.peek().ball3d;
            expect(b.y).toBeLessThan(0.2);
            expect(b.distanceTo(sc.live('nose'))).toBeLessThan(0.45 * Math.max(0.6, sc.marks.u));
          }
        }
        expect(game.peek().ball).toBe('hand');
        expect(moved).toBeGreaterThan(0.2);
        run(ctx, game, sc, 0.5);
      }
      s = game.peek();
      expect(s.rounds).toBe(s.n);
      ctx.pressStop();
      expect(ctx.done).toBe(true);
      expect(ctx.finished.why).toBe('just');
      run(ctx, game, sc, 2);
      game.destroy();
      // la chèvrerie revient
      expect(sc.decor).toBe(barn);
      expect(barn.group.parent).toBe(sc.scene);
      expect(sc.mood.drive).toBe(null);
      sc.dispose();
    }, 60000);
  }
});

describe('nettoyer l\'étable de la vache', () => {
  for (const c of [{ breed: 'holstein' }, { breed: 'highland' }, { breed: 'normande', young: true }]) {
    it(`${c.breed}${c.young ? ' (veau)' : ''} : les bouses à la brouette, puis une couche de paille fraîche partout`, () => {
      const { sc, ctx } = farmStage({ species: 'cow', name: 'Marguerite', ...c });
      const game = barnClean.barnClean3dGame(ctx);
      run(ctx, game, sc, 0.5);
      let s = game.peek();
      expect(s.phase).toBe('pick');
      // les bouses, la brouette et elle dans l'image
      expect(s.pats3d.length).toBe(s.nDirt);
      for (const q of s.pats3d) expect(inView(q, ctx.view, 4)).toBe(true);
      expect(inView(s.barrow3d, ctx.view, 4)).toBe(true);
      expect(inView(sc.project(sc.marks.withers), ctx.view)).toBe(true);
      // une bouse glissée jusqu'à la brouette, les autres touchées
      const q0 = s.pats3d[0];
      game.down(q0);
      for (let k = 1; k <= 10; k++) game.move({ x: q0.x + (s.barrow3d.x - q0.x) * (k / 10), y: q0.y + (s.barrow3d.y - q0.y) * (k / 10) }, true);
      game.up(s.barrow3d);
      run(ctx, game, sc, 0.6);
      expect(game.peek().inBin).toBe(1);
      for (let i = 0; i < 12 && game.peek().phase === 'pick'; i++) {
        const q = game.peek().pats3d[0];
        game.down(q);
        game.up(q);
        run(ctx, game, sc, 0.5);
      }
      s = game.peek();
      expect(s.phase).toBe('spread');
      expect(s.dirtInBin).toBe(s.nDirt);
      // la paille : un passage par rangée, d'un bord à l'autre du terrain (points du jeu dessiné projetés)
      const rows = [];
      for (let y = 112; y < 342; y += 34) rows.push(y);
      for (const y of rows) {
        const a = game.toScreen(16, y);
        const b = game.toScreen(324, y);
        game.down(a);
        for (let k = 1; k <= 24; k++) game.move({ x: a.x + (b.x - a.x) * (k / 24), y: a.y + (b.y - a.y) * (k / 24) }, true);
        game.up(b);
        run(ctx, game, sc, 0.1);
      }
      run(ctx, game, sc, 1);
      s = game.peek();
      expect(s.covered).toBeGreaterThan(0.95);
      // la paille posée en 3D est celle du jeu dessiné, case par case
      expect(game.strawCells()).toBeCloseTo(s.covered, 5);
      ctx.pressStop();
      expect(ctx.done).toBe(true);
      expect(ctx.finished.why).toBe('just');
      run(ctx, game, sc, 1);
      game.destroy();
      sc.dispose();
    }, 60000);
  }
});

describe('les petits (agneau, chevreau) : à leur taille', () => {
  it('agneau d\'Ouessant, friandise : vu d\'en haut, un morceau à la taille de sa bouche, une main d\'enfant', () => {
    const sizes = {};
    for (const young of [false, true]) {
      const { sc, ctx } = farmStage({ species: 'sheep', breed: 'ouessant', young, name: 'Flocon' });
      const before = new Set(sc.scene.children);
      const game = farmTreat.farmTreat3dGame(ctx);
      run(ctx, game, sc, 0.3);
      const hand = sc.scene.children.find((o) => !before.has(o) && o.isGroup);
      const box = new THREE.Box3().setFromObject(hand.children[hand.children.length - 1]);
      const head = sc.marks.poll.distanceTo(sc.marks.muzzle);
      // (la caméra : son angle au-dessus de l'horizontale)
      const d = sc.camTarget.clone().sub(sc.camera.position);
      const pitch = Math.atan2(-d.y, Math.hypot(d.x, d.z));
      sizes[young ? 'petit' : 'adulte'] = { treat: box.getSize(new THREE.Vector3()).length(), head, hand: hand.scale.x, pitch };
      game.destroy();
      sc.dispose();
    }
    // la friandise plus petite que sa tête ; la main plus petite que pour un adulte ; on le regarde d'en haut
    expect(sizes.petit.treat).toBeLessThan(sizes.petit.head);
    expect(sizes.petit.hand).toBeLessThan(sizes.adulte.hand);
    // (l'Ouessant adulte est déjà petit : on le regarde aussi un peu d'en haut ; l'agneau davantage)
    expect(sizes.petit.pitch).toBeGreaterThan(sizes.adulte.pitch + 0.05);
    expect(sizes.petit.pitch).toBeGreaterThan(0.45);
  }, 60000);
  it('la paille posée sur la litière (pas de brins en l\'air)', async () => {
    const { litterHeight } = await import('../src/game/care/farmBarn.js');
    const { sc } = farmStage({ species: 'sheep', breed: 'ouessant', young: true });
    let strands = null;
    sc.decor.group.traverse((o) => {
      if (o.isInstancedMesh && o.geometry.parameters?.width === 1 && o.geometry.parameters?.height === 0.004) strands = o;
    });
    expect(strands).toBeTruthy();
    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let worst = 0;
    for (let i = 0; i < strands.count; i++) {
      strands.getMatrixAt(i, m4);
      p.setFromMatrixPosition(m4);
      worst = Math.max(worst, p.y - litterHeight(sc.decor.dims, p.x, p.z));
    }
    expect(worst).toBeLessThan(0.015);
    sc.dispose();
  }, 60000);
});

describe('la plaque à son nom se lit en entier', () => {
  for (const c of [{ species: 'goat', breed: 'alpine', name: 'Biquette' }, { species: 'cow', breed: 'holstein', name: 'Marguerite' }, { species: 'sheep', breed: 'merinos', name: 'Flocon' }]) {
    it(`${c.species} : friandise, caresses, brosse — ni coupée, ni cachée par un poteau, ni sous une réglette`, () => {
      for (const make of [() => farmTreat.farmTreat3dGame, () => farmPet.farmPet3dGame, () => farmBrush.farmBrush3dGame]) {
        const { sc, ctx } = farmStage(c);
        const game = make()(ctx);
        run(ctx, game, sc, 1.5);
        // (ses quatre coins dans l'image ; rien du décor devant le nom — au plus un bout de la plaque frôlé par un
        // poteau — : le nom se lit. L'animal, lui, bouge : il peut passer un moment devant, comme dans une vraie étable)
        const why = [];
        sc.decor.plateBad(sc, why);
        const still = why.filter((w) => !/l'animal/.test(w));
        const text = still.filter((w) => /hors de l'image/.test(w) || /^(-0\.09|0|0\.09),/.test(w));
        expect(text, `${make().name} : ${why.join(' ; ')}`).toEqual([]);
        expect(still.length, `${make().name} : ${why.join(' ; ')}`).toBeLessThanOrEqual(1);
        game.destroy();
        sc.dispose();
      }
    }, 60000);
  }
});
