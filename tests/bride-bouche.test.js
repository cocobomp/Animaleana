// Brider en 3D (chantier « bride ») : le cheval OUVRE LA BOUCHE quand le mors arrive, pour toutes les races et tous
// les âges (Shetland, Falabella, poulain…) ; la jonction têtière / montant / sous-gorge, sous l'oreille, est couverte
// d'une pièce de cuir (avant : les bouts des lanières s'y croisaient en un petit paquet sombre) ; les VRAIS bouts des
// oreilles ne touchent jamais le haut de l'image, en portrait comme en paysage.
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
let adoption;
let frameMod;
let games;
let headFrame;
let mouthMod;
beforeAll(async () => {
  fakeDocument();
  ({ t } = await import('../src/i18n.js'));
  gltf = await loadRealHorseGltf();
  horseReal = await import('../src/game/models/horseReal.js');
  horseReal.realHorseBase(gltf);
  stageMod = await import('../src/game/care/stage.js');
  stallMod = await import('../src/game/care/stall.js');
  animalMod = await import('../src/sim/animal.js');
  adoption = await import('../src/sim/adoption.js');
  frameMod = await import('../src/ui/minigames/frame.js');
  games = (await import('../src/ui/minigames/horsePlus3d.js')).HORSE_PLUS_GAMES;
  headFrame = await import('../src/ui/minigames/headFrame.js');
  mouthMod = await import('../src/game/models/horseMouth.js');
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

function makeStage(breed, stage, W, H) {
  const a = animalMod.createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: adoption.stageAgeDays('horse', stage), seed: 77 });
  a.name = 'Honey';
  a.gear = { halter: { item: 'halter', color: 'red' } };
  for (const k in a.needs) a.needs[k] = 30;
  const model = horseReal.buildRealHorseModel(animalMod.stageLook(a), a.breed, gltf);
  const sc = new stageMod.CareStage({ a, renderer: stageMod.headlessRenderer(), model, set: stallMod.stallSet });
  sc.resize(W, H, frameMod.fitView(W, H, 400, 360));
  sc.ready = true;
  return { a, sc };
}
function run(ctx, game, sc, s, dt = 1 / 30, each = null) {
  for (let k = 0; k < s / dt; k++) {
    ctx.time += dt;
    game.update(dt);
    sc.update(dt);
    each?.();
  }
}

describe('brider : il ouvre la bouche quand le mors arrive', () => {
  for (const [breed, stage] of [['selle_francais', 'adult'], ['shetland', 'adult'], ['falabella', 'adult'], ['appaloosa', 'adult'], ['selle_francais', 'young'], ['shetland', 'young']]) {
    it(`${breed} (${stage}) : la lèvre du bas descend, puis il mâchonne et referme`, () => {
      const { a, sc } = makeStage(breed, stage, 390, 600);
      // (la forme « bouche ouverte » : la lèvre du bas et le menton, jamais le reste de la tête)
      const data = mouthMod.mouthMorphData(sc.model);
      expect(data?.moved, 'des sommets de la lèvre du bas bougent').toBeGreaterThan(100);
      const ctx = fakeCtxOf(a, t, { scene: sc, view: frameMod.fitView(390, 600, 400, 360) });
      const game = games.bridle(ctx);
      run(ctx, game, sc, 2.6);
      let s = game.peek();
      expect(s.mouth, 'fermée avant le mors').toBe(0);
      const mesh = sc.model.coatMesh;
      expect(mesh.geometry.morphAttributes.position?.length, 'la forme est posée sur ce cheval').toBe(1);
      game.down(s.bar);
      let most = 0;
      run(ctx, game, sc, 0.5, 1 / 30, () => {
        most = Math.max(most, game.peek().mouth);
      });
      expect(most, 'grande ouverte quand le mors arrive').toBeGreaterThan(0.85);
      // (le bout de la lèvre du bas descend vraiment : quelques centimètres)
      const k0 = mesh.morphTargetInfluences[0];
      const v0 = new THREE.Vector3();
      const v1 = new THREE.Vector3();
      let drop = 0;
      for (let i = 0; i < data.count; i++) {
        if (!data.pos[i * 3 + 1] && !data.pos[i * 3 + 2]) continue;
        mesh.morphTargetInfluences[0] = 0;
        mesh.getVertexPosition(i, v0);
        mesh.morphTargetInfluences[0] = 1;
        mesh.getVertexPosition(i, v1);
        drop = Math.max(drop, v0.distanceTo(v1));
      }
      mesh.morphTargetInfluences[0] = k0;
      expect(drop, 'la lèvre du bas descend de 3 cm au moins').toBeGreaterThan(0.03);
      run(ctx, game, sc, 3.5);
      s = game.peek();
      expect(s.step).toBe('ears');
      expect(s.mouth, 'refermée une fois le mors mâchonné').toBeLessThan(0.05);
      // (la géométrie partagée de la race n'est jamais touchée : seul ce cheval a sa copie)
      const shared = mesh.geometry;
      game.destroy();
      expect(mesh.geometry, 'la géométrie d\'origine est remise').not.toBe(shared);
      expect(mesh.geometry.morphAttributes.position?.length ?? 0, 'sans forme').toBe(0);
      sc.dispose();
    }, 90000);
  }
});

describe('brider : la jonction sous l\'oreille est une pièce de cuir', () => {
  it('deux pièces, sur le bout commun de la têtière, de la sous-gorge et du montant, à plat sur la peau', () => {
    const { a, sc } = makeStage('appaloosa', 'adult', 390, 600);
    const ctx = fakeCtxOf(a, t, { scene: sc, view: frameMod.fitView(390, 600, 400, 360) });
    const game = games.bridle(ctx);
    run(ctx, game, sc, 2.6);
    game.down(game.peek().bar);
    run(ctx, game, sc, 3);
    game.down(game.peek().ears[0]);
    run(ctx, game, sc, 1);
    game.down(game.peek().ears[1]);
    run(ctx, game, sc, 2.6);
    expect(game.peek().step).toBe('throat');
    const root = sc.model.head.getObjectByName('bridle3d');
    const knots = root.children.filter((o) => o.name === 'bridle-junction');
    expect(knots.length).toBe(2);
    const P = game.paths();
    const st = game.straps();
    for (const [k, end] of [[knots[0], 0], [knots[1], P.back.p.length - 1]]) {
      expect(k.visible).toBe(true);
      // sur le bout commun (à 1 cm près), là où arrivent la têtière, la sous-gorge et le montant
      const tl = st.throat.userData.line;
      const throatEnd = end === 0 ? tl[0] : tl[tl.length - 1];
      expect(k.position.distanceTo(P.back.p[end]), 'sur la jonction de la têtière').toBeLessThan(0.012);
      expect(k.position.distanceTo(throatEnd), 'et sur le bout de la sous-gorge').toBeLessThan(0.015);
      // à plat sur la peau : son z suit la normale de la peau
      const z = new THREE.Vector3(0, 0, 1).applyQuaternion(k.quaternion);
      expect(z.dot(P.back.n[end]), 'à plat sur la peau').toBeGreaterThan(0.95);
    }
    game.destroy();
    sc.dispose();
  }, 90000);
});

describe('brider : les vrais bouts des oreilles ne touchent jamais le haut de l\'image', () => {
  const SIZES = { portrait: [390, 600], paysage: [844, 360] };
  for (const [breed, stage] of [['appaloosa', 'adult'], ['shetland', 'adult'], ['falabella', 'adult'], ['frison', 'adult'], ['selle_francais', 'young']]) {
    for (const [nm, [W, H]] of Object.entries(SIZES)) {
      it(`${breed} (${stage}), ${nm} : à chaque étape, de la place au-dessus des oreilles`, () => {
        const { a, sc } = makeStage(breed, stage, W, H);
        const v = frameMod.fitView(W, H, 400, 360);
        const ctx = fakeCtxOf(a, t, { scene: sc, view: v });
        const game = games.bridle(ctx);
        const tips = headFrame.earTipsOf(sc);
        expect(tips, 'les bouts des oreilles mesurés sur le pelage').toBeTruthy();
        const ears = sc.model.ears;
        // (marge : 4 % de la hauteur de l'image au moins, au-dessus du plus haut des deux bouts)
        const room = () => Math.min(...ears.map((e, k) => sc.project(e.localToWorld(tips[k].clone())).y)) - v.y0;
        const worst = {};
        const watch = (st) => () => {
          worst[st] = Math.min(worst[st] ?? Infinity, room() / v.h);
        };
        run(ctx, game, sc, 2.6, 1 / 30, watch('mors'));
        // (le cadrage se pose : on ne compte pas le premier fondu)
        for (const k in worst) delete worst[k];
        run(ctx, game, sc, 0.6, 1 / 30, watch('mors'));
        game.down(game.peek().bar);
        run(ctx, game, sc, 3.4, 1 / 30, watch('oreilles'));
        game.down(game.peek().ears[0]);
        run(ctx, game, sc, 1, 1 / 30, watch('oreilles'));
        game.down(game.peek().ears[1]);
        run(ctx, game, sc, 3, 1 / 30, watch('sous-gorge'));
        const hold = ctx.buttons.find((b) => /🪢/.test(b.text));
        hold.opts.onDown();
        while (game.peek().throat < 0.67) run(ctx, game, sc, 0.05, 1 / 30, watch('sous-gorge'));
        hold.opts.onUp();
        run(ctx, game, sc, 2, 1 / 30, watch('sous-gorge'));
        for (const [st, m] of Object.entries(worst)) expect(m, `${st} : ${(m * 100).toFixed(1)} % de la hauteur au-dessus des oreilles`).toBeGreaterThan(0.04);
        game.destroy();
        sc.dispose();
      }, 90000);
    }
  }
});
