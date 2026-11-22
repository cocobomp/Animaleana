// La scène de soin en 3D, construite pour de vrai sans navigateur (faux rendu : stage.headlessRenderer) : le vrai
// cheval réaliste (GLB chargé dans node), son box, la caméra, le doigt et la projection. On y vérifie ce qui ne se
// voit qu'avec le modèle : chaque pied levé reste dans l'image au cure-pied, le pansage complet (les gestes sur les
// taches, les pieds, les nœuds), le décor d'un poulain, le retour du contexte WebGL, la libération.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as THREE from 'three';
import { fakeCtx as fakeCtxOf, fakeDocument } from './fixtures/careCtx.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

let t;
let gltf;
let stageMod;
let stallMod;
let pansage;
let feed3d;
let horseReal;
let animalMod;
let frameMod;
beforeAll(async () => {
  fakeDocument();
  ({ t } = await import('../src/i18n.js'));
  gltf = await loadRealHorseGltf();
  horseReal = await import('../src/game/models/horseReal.js');
  horseReal.realHorseBase(gltf);
  stageMod = await import('../src/game/care/stage.js');
  stallMod = await import('../src/game/care/stall.js');
  pansage = await import('../src/ui/minigames/pansage3d.js');
  feed3d = await import('../src/ui/minigames/feed3d.js');
  animalMod = await import('../src/sim/animal.js');
  frameMod = await import('../src/ui/minigames/frame.js');
}, 60000);

// (le hasard des jeux et de l'animation, fixé : chaque test rejoue la même partie)
const random = Math.random;
let seed = 1;
beforeEach(() => {
  seed = 12345;
  Math.random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
});
afterAll(() => {
  Math.random = random;
});

/** Une scène de soin headless : le cheval (race, âge) dans son box, toile de téléphone en portrait. */
export function makeStage({ breed = 'selle_francais', foal = false, w = 390, h = 600, name = 'Honey', needs = 25 } = {}) {
  const a = animalMod.createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: foal ? 7 : 900, seed: 77 });
  a.name = name;
  for (const k in a.needs) a.needs[k] = needs;
  const model = horseReal.buildRealHorseModel(animalMod.stageLook(a), a.breed, gltf);
  const sc = new stageMod.CareStage({ a, renderer: stageMod.headlessRenderer(), model, set: stallMod.stallSet });
  sc.resize(w, h, frameMod.fitView(w, h, 400, 360));
  sc.ready = true;
  // (instants des clips fixés : animation reproductible)
  for (const act of Object.values(model.anim?.actions ?? {})) act.time = 0;
  return { a, sc };
}

/** Le cadre autour de la scène (la vue de la toile). */
const ctxFor = (a, sc, w = 390, h = 600) => fakeCtxOf(a, t, { scene: sc, view: frameMod.fitView(w, h, 400, 360) });

/** dt secondes de jeu : le jeu, puis la scène (comme la boucle du cadre). */
function run(ctx, game, sc, s, dt = 1 / 30) {
  for (let k = 0; k < s / dt; k++) {
    ctx.time += dt;
    game.update(dt);
    sc.update(dt);
  }
}

const inView = (q, v) => q.x > v.x0 && q.x < v.x1 && q.y > v.y0 && q.y < v.y1;

describe('pansage en 3D : le cure-pied', () => {
  it('chaque pied levé est dans l\'image, même si le cheval se reposait sur un postérieur', () => {
    const { a, sc } = makeStage();
    const ctx = ctxFor(a, sc);
    const game = pansage.pansage3dGame(ctx);
    ctx.pressStop();
    run(ctx, game, sc, 1.2);
    ctx.pressStop();
    run(ctx, game, sc, 1.2);
    expect(game.peek().stage).toBe('hoof');
    const anim = sc.model.anim;
    for (const foot of ['fl', 'hl', 'fr', 'hr']) {
      anim.resting = false;
      anim.w.rest = 0;
      anim.restTimer = 30;
      run(ctx, game, sc, 1.4);
      // Le cheval se mettait au repos sur un postérieur pendant qu'on tenait un pied : l'arrière-main bougeait de
      // 35 cm, après que la caméra s'était posée (le postérieur droit sortait de l'image).
      anim.resting = true;
      anim.restTimer = 30;
      run(ctx, game, sc, 2);
      const s = game.peek();
      expect(s.foot).toBe(foot);
      expect(s.footReady, foot).toBe(true);
      expect(s.blobs.length).toBeGreaterThan(0);
      for (const q of s.blobs) expect(inView(q, ctx.view), `${foot} motte (${q.x.toFixed(0)}, ${q.y.toFixed(0)})`).toBe(true);
      // tout curer, du talon vers la pince
      for (let pass = 0; pass < 6 && game.peek().blobs.length && game.peek().foot === foot; pass++) {
        for (const q of game.peek().blobs) {
          const r = Math.max(10, q.r) * 1.3;
          game.down({ x: q.x - s.toe.x * r, y: q.y - s.toe.y * r });
          for (let k = 1; k <= 6; k++) game.move({ x: q.x + s.toe.x * r * (k / 3 - 1), y: q.y + s.toe.y * r * (k / 3 - 1) }, true);
          game.up();
        }
      }
      run(ctx, game, sc, 1);
    }
    run(ctx, game, sc, 1.5);
    expect(game.peek().stage).toBe('comb');
    const hoofRes = game.peek().results.find((r) => r.stage === 'hoof');
    expect(hoofRes.verdict).toBe('just');
    game.destroy();
    sc.dispose();
  }, 60000);
});

describe('le contexte WebGL perdu, puis rendu', () => {
  it('perdu : la scène attend ; rendu : les écouteurs de l\'ancien contexte sont retirés, le décor refait son image, la scène reprend', async () => {
    const { sc } = makeStage();
    const r = sc.renderer;
    // (un écouteur posé par le rendu sur une ressource du jeu, du temps de l'ancien contexte)
    const shared = new THREE.BufferGeometry();
    let stale = 0;
    sc.track(() => shared.addEventListener('dispose', () => stale++));
    let restoredDecor = 0;
    const decorRestore = sc.decor.restore;
    sc.decor.restore = (st) => { restoredDecor++; decorRestore(st); };
    r.domElement.dispatch('webglcontextlost');
    expect(sc.lost).toBe(true);
    const before = r.calls.render;
    sc.render();
    expect(r.calls.render).toBe(before); // (rien à peindre sans contexte)
    r.domElement.dispatch('webglcontextrestored');
    expect(sc.lost).toBe(false);
    expect(sc.ready).toBe(false); // (elle se prépare à nouveau, le cadre montre l'emoji)
    expect(restoredDecor).toBe(1);
    await new Promise((ok) => setTimeout(ok, 200));
    expect(sc.ready).toBe(true);
    shared.dispose();
    expect(stale).toBe(0); // (l'écouteur de l'ancien contexte n'est plus là)
    sc.render();
    expect(r.calls.render).toBe(before + 2); // (l'image d'un pixel de la préparation, puis une vraie image)
    sc.dispose();
    expect(r.calls.dispose).toBe(1);
    // (après la fermeture, la toile n'écoute plus rien)
    r.domElement.dispatch('webglcontextlost');
    expect(sc.lost).toBe(false);
  });
});

describe('le décor suit le gabarit (poulain, poney, grand cheval)', () => {
  /** Plus courte distance (m) d'un sommet de obj au segment [a, b] (la tête : de la nuque au bout du nez). */
  function minDistToSegment(obj, a, b) {
    const seg = new THREE.Line3(a, b);
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    let best = Infinity;
    obj.updateWorldMatrix(true, true);
    obj.traverse((m) => {
      if (!m.isMesh || !m.visible || m.material?.transparent) return;
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 3) {
        p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        seg.closestPointToPoint(p, true, q);
        best = Math.min(best, p.distanceTo(q));
      }
    });
    return best;
  }

  const GABARITS = [['haflinger', true], ['selle_francais', true], ['shetland', false], ['selle_francais', false], ['frison', false]];
  for (const [breed, foal] of GABARITS) {
    it(`son nez reste dans le box, et sa bouche arrive dans la mangeoire et dans le seau (${breed}${foal ? ', poulain' : ''})`, () => {
      const { sc } = makeStage({ breed, foal });
      const P = sc.decor.props;
      const eat = sc.decor.anchors.eat;
      // debout, le bout du nez n'est pas dans le mur (un poulain de 7 jours l'y avait : 1,87 m pour un mur à 1,85 m)
      expect(sc.marks.muzzle.x).toBeLessThan(stallMod.STALL.halfW - 0.12);
      for (const which of ['feed', 'water']) {
        sc.decor.layout(which);
        const c = (which === 'feed' ? P.feeder : P.bucket).group;
        c.updateWorldMatrix(true, false);
        const local = c.worldToLocal(eat.clone());
        const r = which === 'feed' ? 0.27 : 0.17;
        expect(Math.hypot(local.x, local.z), `${which} : la bouche au-dessus du récipient`).toBeLessThan(r * 0.8);
        expect(local.y, `${which} : la bouche dans le récipient`).toBeLessThan(0.08);
        expect(local.y).toBeGreaterThan(-0.3);
      }
      sc.dispose();
    });

    it(`abreuver : le robinet et le tuyau ne passent jamais dans la tête (${breed}${foal ? ', poulain' : ''})`, () => {
      const { a, sc } = makeStage({ breed, foal });
      const ctx = ctxFor(a, sc);
      const game = feed3d.water3dGame(ctx);
      const tap = sc.decor.props.tap.group;
      // (une tête de cheval : une vingtaine de centimètres de large aux joues, une douzaine au bout du nez)
      const S = sc.double.scale;
      const check = () => {
        const poll = sc.model.head.getWorldPosition(new THREE.Vector3());
        const d = minDistToSegment(tap, poll, sc.live('nose'));
        expect(d, `${breed} : robinet ou tuyau à ${d.toFixed(3)} m de l'axe de la tête`).toBeGreaterThan(0.1 * S);
      };
      // il regarde le seau pendant qu'on le remplit, puis il boit (la tête dans le seau)
      for (let k = 0; k < 4; k++) {
        run(ctx, game, sc, 0.5);
        check();
      }
      game.down();
      run(ctx, game, sc, 2);
      game.up();
      ctx.pressStop();
      for (let k = 0; k < 6; k++) {
        run(ctx, game, sc, 0.5);
        check();
      }
      game.destroy();
      sc.dispose();
    }, 30000);
  }
});
