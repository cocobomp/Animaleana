// Brider en 3D, trois retouches (chantier « bride ») : le vrai cheval (GLB chargé dans node), la vraie scène (faux rendu).
//   1. la jonction têtière / montant / sous-gorge sous l'oreille : une boucle de cuir couvre les bouts des lanières
//      (avant : quatre bouts carrés qui se croisaient au même point, une petite tache sombre) ;
//   2. il ouvre la bouche quand le mors entre (forme ajoutée au pelage, horseMouth.js), puis la referme et mâchonne ;
//   3. les vraies pointes des oreilles restent dans l'image à chaque image du soin, au téléphone debout et couché.
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
let mouthMod;
let adoption;
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
  mouthMod = await import('../src/game/models/horseMouth.js');
  adoption = await import('../src/sim/adoption.js');
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

/** Un cheval : race, âge (adult, baby : poulain). */
function horse(breed, stage = 'adult') {
  const a = animalMod.createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: adoption.stageAgeDays('horse', stage), seed: 77 });
  a.name = 'Honey';
  a.gear = { halter: { item: 'halter', color: 'red' } };
  for (const k in a.needs) a.needs[k] = 30;
  return a;
}
function makeStage(breed, stage = 'adult', w = 390, h = 600) {
  const a = horse(breed, stage);
  const model = horseReal.buildRealHorseModel(animalMod.stageLook(a), a.breed, gltf);
  const sc = new stageMod.CareStage({ a, renderer: stageMod.headlessRenderer(), model, set: stallMod.stallSet });
  const view = frameMod.fitView(w, h, 400, 360);
  sc.resize(w, h, view);
  sc.ready = true;
  return { a, sc, view };
}
function run(ctx, game, sc, s, dt = 1 / 30, each = null) {
  for (let k = 0; k < s / dt; k++) {
    ctx.time += dt;
    game.update(dt);
    sc.update(dt);
    each?.();
  }
}

/** La peau (pelage) d'un sommet, pose de l'image et forme de la bouche comprises (repère de la tête). */
function skinAt(md, i) {
  const v = new THREE.Vector3();
  md.coatMesh.getVertexPosition(i, v);
  md.coatMesh.updateMatrixWorld(true);
  return md.head.worldToLocal(v.applyMatrix4(md.coatMesh.matrixWorld));
}

describe('la bouche du cheval réaliste qui s\'ouvre (horseMouth.js)', () => {
  for (const [breed, stage] of [['selle_francais', 'adult'], ['shetland', 'adult'], ['falabella', 'adult'], ['appaloosa', 'adult'], ['selle_francais', 'baby']]) {
    it(`${breed} ${stage} : le bas s'ouvre, le haut ne bouge pas, rien de partagé n'est touché`, () => {
      const a = horse(breed, stage);
      const md = horseReal.buildRealHorseModel(animalMod.stageLook(a), a.breed, gltf);
      const other = horseReal.buildRealHorseModel(animalMod.stageLook(a), a.breed, gltf);
      md.root.updateMatrixWorld(true);
      const src = md.coatMesh.geometry;
      expect(other.coatMesh.geometry, 'même race : géométrie partagée').toBe(src);
      const mo = mouthMod.mouthOpener(md);
      expect(mo, 'une bouche qui s\'ouvre').toBeTruthy();
      const data = mouthMod.mouthMorphData(md);
      expect(data.moved, 'des sommets du bas de la bouche bougent').toBeGreaterThan(40);
      // (la géométrie partagée par la race n'a pas de forme : les autres chevaux ne paient rien)
      expect(Object.keys(src.morphAttributes)).toHaveLength(0);
      expect(other.coatMesh.geometry.morphAttributes.position).toBeUndefined();
      const s = md.dims.snoutZ;
      // le sommet qui bouge le plus : la lèvre du bas, devant ; il descend de 3 à 8 % de la longueur de la tête
      let best = -1;
      let most = 0;
      for (let i = 0; i < data.count; i++) {
        const d = Math.hypot(data.pos[i * 3], data.pos[i * 3 + 1], data.pos[i * 3 + 2]);
        if (d > most) {
          most = d;
          best = i;
        }
      }
      const closed = skinAt(md, best);
      mo.set(1);
      const open = skinAt(md, best);
      expect(closed.z / s, 'devant, à la bouche').toBeGreaterThan(0.8);
      expect(closed.y / s, 'sous la fente de la bouche').toBeLessThan(mouthMod.mouthLineY(closed.z / s));
      expect((closed.y - open.y) / s, 'la lèvre du bas descend').toBeGreaterThan(0.03);
      expect((closed.y - open.y) / s, 'mais pas trop').toBeLessThan(0.08);
      // rien ne bouge au-dessus de la fente (naseaux, chanfrein) ni derrière le coin des lèvres (joue, ganache)
      const P = src.attributes.position;
      let still = 0;
      for (let i = 0; i < P.count; i++) {
        const c = skinAt(md, i);
        const above = c.y / s > mouthMod.mouthLineY(c.z / s) + 0.012;
        const behind = c.z / s < mouthMod.MOUTH_RAMP[0] - 0.01;
        if (!above && !behind) continue;
        still++;
        expect(Math.hypot(data.pos[i * 3], data.pos[i * 3 + 1], data.pos[i * 3 + 2]), `sommet ${i} immobile`).toBe(0);
      }
      expect(still, 'la plupart des sommets').toBeGreaterThan(P.count * 0.6);
      // le dedans de la bouche (sombre) se voit ouverte, pas fermée
      expect(mo.inside.visible).toBe(true);
      mo.set(0);
      expect(mo.inside.visible).toBe(false);
      mo.dispose();
      expect(md.coatMesh.geometry, 'la géométrie d\'origine revient').toBe(src);
      expect(md.coatMesh.morphTargetInfluences).toBeUndefined();
      expect(md.head.children.some((o) => o.name === 'mouth-inside')).toBe(false);
      md.dispose();
      other.dispose();
    }, 60000);
  }
});

describe('brider en 3D : il ouvre la bouche pour prendre le mors', () => {
  for (const [breed, stage] of [['selle_francais', 'adult'], ['shetland', 'adult'], ['selle_francais', 'baby']]) {
    it(`${breed} ${stage} : la bouche s'ouvre quand le mors entre, se referme, il mâchonne`, () => {
      const { a, sc, view } = makeStage(breed, stage);
      const src = sc.model.coatMesh.geometry;
      const ctx = fakeCtxOf(a, t, { scene: sc, view });
      const game = games.bridle(ctx);
      run(ctx, game, sc, 2.6);
      let s = game.peek();
      expect(s.mouth, 'fermée avant le mors').toBe(0);
      const bar = s.bar;
      game.down(bar);
      let most = 0;
      let mostBit = 0;
      run(ctx, game, sc, 0.8, 1 / 30, () => {
        const q = game.peek();
        if (q.mouth > most) {
          most = q.mouth;
          mostBit = q.bitK;
        }
      });
      expect(most, 'grande ouverte pendant que le mors entre').toBeGreaterThan(0.9);
      expect(mostBit, 'pendant, pas après').toBeLessThan(0.75);
      s = game.peek();
      expect(s.bitK, 'le mors en place').toBeGreaterThan(0.999);
      // il mâchonne : la bouche s'entrouvre un peu, jamais grande ouverte
      let chew = 0;
      run(ctx, game, sc, 0.6, 1 / 30, () => { chew = Math.max(chew, game.peek().mouth); });
      expect(chew, 'il mâchonne').toBeGreaterThan(0.05);
      expect(chew, 'un peu').toBeLessThan(0.3);
      run(ctx, game, sc, 3);
      expect(game.peek().mouth, 'puis la bouche fermée').toBeLessThan(0.02);
      game.destroy();
      expect(sc.model.coatMesh.geometry, 'à la fermeture : la géométrie de la race revient').toBe(src);
      sc.dispose();
    }, 90000);
  }
});

describe('brider en 3D : la jonction têtière / sous-gorge sous l\'oreille', () => {
  for (const breed of ['selle_francais', 'appaloosa', 'shetland']) {
    it(`${breed} : une boucle couvre la jonction, sans ombre portée sur le cuir`, () => {
      const { a, sc, view } = makeStage(breed);
      const ctx = fakeCtxOf(a, t, { scene: sc, view });
      const game = games.bridle(ctx);
      run(ctx, game, sc, 2.6);
      game.down(game.peek().bar);
      run(ctx, game, sc, 1.4);
      for (const i of [0, 1]) {
        game.down(game.peek().ears[i]);
        run(ctx, game, sc, 1.3);
      }
      run(ctx, game, sc, 1.5);
      expect(game.peek().step).toBe('throat');
      const st = game.straps();
      const keepers = st.keepers;
      expect(keepers?.length, 'une boucle de chaque côté').toBe(2);
      for (const [k, end] of [[0, 0], [1, null]]) {
        const kp = keepers[k];
        expect(kp.visible).toBe(true);
        const line = st.crown.userData.line;
        const j = line[end ?? line.length - 1];
        // (sur la jonction, à moins d'un demi-centimètre)
        expect(kp.position.distanceTo(j), 'la boucle est sur la jonction').toBeLessThan(0.005);
        // (assez grande pour couvrir les bouts des lanières, larges de 22 mm : repère de la tête, comme elles)
        const pad = kp.children[0].geometry.parameters;
        expect(pad.width, 'la boucle couvre la largeur des lanières').toBeGreaterThan(0.022 * 1.3);
        expect(pad.height, 'et leurs bouts').toBeGreaterThan(0.022 * 1.5);
      }
      // le cuir ne reçoit pas les ombres des autres lanières (avant : l'ombre de quatre bouts superposés)
      for (const m of [st.crown, st.throat, ...st.cheeks]) expect(m.receiveShadow, `${m.name} : pas d'ombre de cuir sur le cuir`).toBe(false);
      game.destroy();
      sc.dispose();
    }, 90000);
  }
});

describe('brider en 3D : les oreilles toujours dans l\'image', () => {
  // (la toile du soin au téléphone : 358 × 580 debout, 780 × 250 couché ; dt 0,1 s : un téléphone lent, la caméra
  // et la tête bougent par grands pas)
  const cases = [
    ['appaloosa', 'adult', 358, 580, 1 / 30], ['appaloosa', 'adult', 358, 580, 0.1], ['appaloosa', 'adult', 780, 250, 0.1],
    ['shetland', 'adult', 358, 580, 0.1], ['selle_francais', 'baby', 358, 580, 1 / 30], ['selle_francais', 'baby', 780, 250, 0.1],
    ['frison', 'adult', 780, 250, 1 / 30], ['falabella', 'adult', 358, 580, 0.1], ['arabe', 'adult', 390, 600, 0.1],
  ];
  for (const [breed, stage, w, h, dt] of cases) {
    it(`${breed} ${stage} ${w}×${h} (dt ${dt.toFixed(2)}) : la vraie pointe des oreilles ne touche jamais le haut du cadre`, () => {
      const { a, sc, view } = makeStage(breed, stage, w, h);
      const ctx = fakeCtxOf(a, t, { scene: sc, view });
      const game = games.bridle(ctx);
      const tops = kit.earTops(sc.model);
      expect(tops, 'les pointes des oreilles, mesurées sur la peau').toBeTruthy();
      let worst = Infinity;
      let when = '';
      const check = () => {
        for (const i of [0, 1]) {
          const q = sc.project(tops(i));
          const y = q.y - view.y0;
          if (y < worst) {
            worst = y;
            when = `${game.peek().step} t=${ctx.time.toFixed(2)}`;
          }
        }
      };
      run(ctx, game, sc, 2.6, dt, check);
      game.down(game.peek().bar);
      run(ctx, game, sc, 1.6, dt, check);
      // (il relève la tête, tape des dents ? non : on suit le soin normal, oreille après oreille)
      for (const i of [0, 1]) {
        game.down(game.peek().ears[i]);
        run(ctx, game, sc, 1.3, dt, check);
      }
      run(ctx, game, sc, 2, dt, check);
      const hold = ctx.buttons.find((b) => /🪢/.test(b.text));
      hold.opts.onDown();
      while (game.peek().throat < 0.99) run(ctx, game, sc, dt, dt, check);
      hold.opts.onUp();
      run(ctx, game, sc, 2, dt, check);
      expect(worst, `pointe d'oreille la plus haute : ${worst.toFixed(1)} sous le haut du cadre (${when})`).toBeGreaterThan(6);
      game.destroy();
      sc.dispose();
    }, 120000);
  }
});
