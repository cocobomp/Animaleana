// Chantier « soinsbeaute », point 1 : la friandise en 3D. Sur le vrai cheval (GLB chargé dans node, faux rendu), on
// joue tout le jeu (il s'agite, carotte, pomme, carte de fin) et on vérifie à chaque image que les deux oreilles et le
// bout du nez restent dans l'image avec au moins 5 % de marge, que le regard reste proche quand il s'agite, que la
// main arrive à sa bouche, que la manche est fermée et que le bras entre par le bas à droite sans traverser l'image.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as THREE from 'three';
import { loadStageMods, makeStage, ctxFor, run, endCard, HORSES } from './fixtures/soinsbeauteStage.js';

let treat3d;
let headFrame;
let props;
beforeAll(async () => {
  await loadStageMods();
  treat3d = await import('../src/ui/minigames/treat3d.js');
  headFrame = await import('../src/ui/minigames/headFrame.js');
  props = await import('../src/game/care/props.js');
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

/**
 * Joue la friandise : donne carotte puis pomme dès qu'il est sage (n friandises), puis « C'est bon », puis la carte de
 * fin. Renvoie la pire marge de la tête (fraction de l'image) et ce qu'on a vu au moment où il croque.
 */
function playTreat(sc, a) {
  const ctx = ctxFor(a, sc);
  const game = treat3d.treat3dGame(ctx);
  const shape = headFrame.headShape(sc);
  let worst = { min: 9 };
  let bites = 0;
  let handAtMouth = Infinity;
  const look = { maxSide: 0, maxUp: -9, maxAmt: 0 };
  const L = sc.marks;
  const rest = L.muzzle.clone().add(new THREE.Vector3(0.1, -0.16, 0.32).multiplyScalar(Math.max(0.75, sc.double.scale)));
  const check = (phase) => {
    const m = headFrame.headMargins(sc, shape.points(0));
    if (m.min < worst.min) worst = { ...m, phase };
    const s = game.peek();
    if (s.state === 'wiggle' && s.look && !ctx.done) {
      const p = new THREE.Vector3(...s.look);
      look.maxSide = Math.max(look.maxSide, Math.abs(p.x - rest.x), Math.abs(p.z - rest.z));
      look.maxUp = Math.max(look.maxUp, p.y - rest.y);
      look.maxAmt = Math.max(look.maxAmt, s.lookAmt);
    }
    if (s.bite) {
      bites++;
      const hand = sc.scene.children.find((c) => c.userData.hand);
      handAtMouth = Math.min(handAtMouth, hand.position.distanceTo(sc.live('muzzle')));
    }
  };
  // (la caméra part du premier cadrage ; on mesure dès la première image)
  run(ctx, game, sc, 0.1, 1 / 30, () => check('début'));
  let kind = 0;
  for (let i = 0; i < 1500 && game.peek().given < game.peek().n; i++) {
    const s = game.peek();
    if (s.state === 'calm') {
      ctx.buttons.filter((b) => !b.opts.cls?.includes('stop'))[kind].opts.onTap();
      kind = 1 - kind;
    }
    run(ctx, game, sc, 1 / 30, 1 / 30, () => check(s.state));
  }
  run(ctx, game, sc, 1.6, 1 / 30, () => check('croque'));
  ctx.pressStop();
  run(ctx, game, sc, 1.9, 1 / 30);
  endCard(sc, 0.5);
  run(ctx, game, sc, 3.5);
  run(ctx, game, sc, 1, 1 / 30, () => check('fin'));
  const out = { worst, bites, handAtMouth, look, game, ctx };
  game.destroy();
  return out;
}

describe('friandise 3D : la tête toujours dans l\'image', () => {
  for (const h of HORSES) {
    it(`${h.key} : oreilles et bout du nez à 5 % du bord au moins, du début à la carte de fin`, () => {
      const { a, sc } = makeStage({ ...h, personality: 'playful' });
      const r = playTreat(sc, a);
      if (process.env.SB_LOG) console.log(h.key, JSON.stringify(r.worst), r.bites, r.handAtMouth.toFixed(3));
      expect(r.ctx.done).toBe(true);
      expect(r.worst.min, JSON.stringify(r.worst)).toBeGreaterThanOrEqual(0.05);
      // (il a croqué, la main était contre sa bouche)
      expect(r.bites).toBeGreaterThan(0);
      expect(r.handAtMouth).toBeLessThan(0.15 * Math.max(1, sc.double.scale));
      sc.dispose();
    }, 30000);
  }

  it('en paysage aussi (Frison, Falabella)', () => {
    for (const key of ['frison', 'falabella']) {
      const h = HORSES.find((x) => x.key === key);
      const { a, sc } = makeStage({ ...h, w: 844, h: 300, personality: 'playful' });
      const r = playTreat(sc, a);
      if (process.env.SB_LOG) console.log('paysage', key, JSON.stringify(r.worst));
      expect(r.worst.min, `${key} ${JSON.stringify(r.worst)}`).toBeGreaterThanOrEqual(0.05);
      sc.dispose();
    }
  }, 60000);
});

describe('friandise 3D : il s\'agite sans regarder loin', () => {
  it('le point regardé reste proche de la main (± 0,25 m), jamais en l\'air, et il tourne la tête à moitié', () => {
    const { a, sc } = makeStage({ breed: 'arabe', personality: 'playful' });
    const r = playTreat(sc, a);
    expect(r.look.maxSide).toBeLessThanOrEqual(treat3d.TREAT3D.wander + 1e-6);
    expect(r.look.maxUp).toBeLessThanOrEqual(treat3d.TREAT3D.wanderUp + 1e-6);
    expect(r.look.maxAmt).toBeLessThanOrEqual(0.6);
    expect(r.look.maxAmt).toBeGreaterThan(0);
    sc.dispose();
  }, 30000);
});

describe('friandise 3D : notre bras', () => {
  it('la manche de la main des soins est fermée aux deux bouts (pas de tube creux)', () => {
    const keep = [];
    const hand = props.handModel((x) => (keep.push(x), x));
    const tubes = [];
    hand.traverse((o) => {
      if (o.isMesh && o.geometry.type === 'CylinderGeometry') tubes.push(o.geometry.parameters);
    });
    expect(tubes.length).toBeGreaterThan(0);
    for (const p of tubes) expect(p.openEnded).toBe(false);
    for (const x of keep) x.dispose?.();
  });

  it('le bras entre par le bas à droite et sort de l\'image (le bout de la manche n\'est jamais dans le cadre)', () => {
    for (const [w, hh] of [[390, 600], [844, 300]]) {
      const { a, sc } = makeStage({ breed: 'frison', w, h: hh });
      const ctx = ctxFor(a, sc);
      const game = treat3d.treat3dGame(ctx);
      run(ctx, game, sc, 0.5);
      const hand = sc.scene.children.find((c) => c.userData.hand);
      hand.updateMatrixWorld(true);
      // le bout de la manche : le point le plus loin de la paume, le long du bras
      let far = null;
      hand.traverse((o) => {
        if (o.isMesh && o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.height > 0.3) {
          far = o.localToWorld(new THREE.Vector3(0, o.geometry.parameters.height / 2, 0));
          const other = o.localToWorld(new THREE.Vector3(0, -o.geometry.parameters.height / 2, 0));
          if (other.distanceTo(hand.position) > far.distanceTo(hand.position)) far = other;
        }
      });
      const palm = hand.position.clone().project(sc.camera);
      const end = far.clone().project(sc.camera);
      // (la paume dans l'image ; le bout de la manche dehors, en bas ou à droite)
      expect(Math.abs(palm.x)).toBeLessThan(1);
      expect(Math.abs(palm.y)).toBeLessThan(1);
      const outside = end.x > 1 || end.y < -1 || end.z > 1;
      expect(outside, `${w}×${hh} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`).toBe(true);
      expect(end.x).toBeGreaterThan(palm.x);
      expect(end.y).toBeLessThan(palm.y);
      game.destroy();
      sc.dispose();
    }
  }, 30000);
});

describe('friandise 3D : la carotte entre ses lèvres quand il croque', () => {
  it('le milieu de la carotte passe contre ses lèvres (model.mouth), pas sous le menton (4 chevaux, et en paysage)', () => {
    for (const h of [{ breed: 'appaloosa', w: 844 - 320, h: 390 }, { breed: 'appaloosa' }, { breed: 'selle_francais' }, { breed: 'frison' }, { breed: 'falabella' }]) {
      const { a, sc } = makeStage({ ...h, personality: 'calm' });
      const ctx = ctxFor(a, sc);
      const game = treat3d.treat3dGame(ctx);
      let d = null;
      for (let i = 0; i < 1500 && d === null; i++) {
        const s = game.peek();
        if (s.state === 'calm' && s.given === 0) ctx.buttons.filter((b) => !b.opts.cls?.includes('stop'))[0].opts.onTap();
        run(ctx, game, sc, 1 / 30, 1 / 30, () => {
          if (d !== null || !game.peek().bite) return;
          // (la carotte croquée : le corps conique de treatModel, 0,17 m de long, couché le long de son axe x)
          const tm = sc.scene.children.find((o) => o.visible && o.children[0]?.geometry?.type === 'CylinderGeometry' && o.children[0].geometry.parameters.height === 0.17);
          if (!tm) return;
          const mouth = sc.model.head.localToWorld(sc.model.mouth.clone());
          const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(tm.getWorldQuaternion(new THREE.Quaternion())).multiplyScalar(0.085 * tm.scale.x);
          const c = tm.getWorldPosition(new THREE.Vector3());
          const q = new THREE.Line3(c.clone().sub(ax), c.clone().add(ax)).closestPointToPoint(mouth, true, new THREE.Vector3());
          d = q.distanceTo(mouth);
        });
      }
      expect(d, h.breed).not.toBeNull();
      // (le rayon de la carotte est 1,7 cm : ses lèvres sont contre elle)
      expect(d, h.breed).toBeLessThan(0.022 * Math.max(0.75, sc.double.scale));
      game.destroy();
      sc.dispose();
    }
  }, 120000);
});
