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

describe('la fermeture rend tout', () => {
  it('le rendu est libéré, et les écouteurs qu\'il a posés sur les ressources du jeu sont retirés', () => {
    const { sc } = makeStage();
    const r = sc.renderer;
    const shared = new THREE.BufferGeometry(); // (une géométrie de la race, partagée avec le jeu)
    let called = 0;
    sc.track(() => shared.addEventListener('dispose', () => called++));
    const decorDispose = sc.decor.dispose;
    let decor = 0;
    sc.decor.dispose = () => { decor++; decorDispose(); };
    sc.dispose();
    expect(r.calls.dispose).toBe(1);
    expect(decor).toBe(1);
    shared.dispose();
    expect(called).toBe(0); // (sinon le rendu fermé restait accroché aux ressources du jeu, donc en mémoire)
    sc.dispose(); // (deux fois : rien)
    expect(r.calls.dispose).toBe(1);
  });
});

describe('pansage en 3D : les gestes sur le vrai cheval (même règle que le jeu dessiné)', () => {
  /** Un geste du doigt : de point en point (espace du cadre), par petits pas. */
  function stroke(game, pts, step = 5) {
    game.down(pts[0]);
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
      for (let k = 1; k <= n; k++) game.move({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }, true);
    }
    game.up();
  }
  const circle = (q, r, turns = 2) => Array.from({ length: turns * 14 + 1 }, (_, i) => ({ x: q.x + r * Math.cos((i / 14) * Math.PI * 2), y: q.y + r * Math.sin((i / 14) * Math.PI * 2) }));
  const waitStage = (ctx, game, sc, st) => {
    for (let i = 0; i < 60 && !(game.peek().stage === st && game.peek().pause <= 0); i++) run(ctx, game, sc, 0.1);
    expect(game.peek().stage).toBe(st);
  };
  /** Cure les quatre pieds (comme au test du cure-pied). */
  function pickFeet(ctx, game, sc) {
    for (let f = 0; f < 4; f++) {
      run(ctx, game, sc, 2.5);
      const s = game.peek();
      for (let pass = 0; pass < 6 && game.peek().blobs.length && game.peek().foot === s.foot; pass++) {
        for (const q of game.peek().blobs) {
          const r = Math.max(10, q.r) * 1.3;
          stroke(game, [{ x: q.x - s.toe.x * r, y: q.y - s.toe.y * r }, { x: q.x + s.toe.x * r, y: q.y + s.toe.y * r }], 4);
        }
      }
      run(ctx, game, sc, 1);
    }
  }

  it('bien fait d\'un bout à l\'autre (ronds à l\'étrille, brosse vers la queue, pieds, peigne vers le bas) : trois étoiles', () => {
    const { a, sc } = makeStage();
    const ctx = ctxFor(a, sc);
    const game = pansage.pansage3dGame(ctx);
    run(ctx, game, sc, 0.5);
    // 1. l'étrille : des petits ronds sur chaque plaque de boue (toutes à l'écran, sur le flanc)
    let s = game.peek();
    expect(s.mud.length).toBeGreaterThanOrEqual(3);
    for (const q of s.mud) expect(inView(q, ctx.view), 'plaque dans l\'image').toBe(true);
    for (let pass = 0; pass < 6 && game.peek().mud.length && game.peek().value < game.peek().lo; pass++) {
      for (const q of game.peek().mud) stroke(game, circle(q, Math.max(6, q.r * 0.45)), 4);
    }
    s = game.peek();
    expect(s.value).toBeGreaterThanOrEqual(s.lo);
    expect(ctx.hints.some((h) => h.text === t('mg_pansage_curry_round'))).toBe(false); // (des ronds : pas de reproche)
    ctx.pressStop();
    waitStage(ctx, game, sc, 'brush');
    expect(game.peek().results[0].verdict).toBe('just');
    // 2. la brosse : dans le sens du poil (la tête est à droite de l'écran : vers la gauche)
    for (let pass = 0; pass < 8 && game.peek().dust.length && game.peek().value < game.peek().lo; pass++) {
      for (const q of game.peek().dust) stroke(game, [{ x: q.x + 26, y: q.y }, { x: q.x - 26, y: q.y }], 4);
    }
    s = game.peek();
    expect(s.value).toBeGreaterThanOrEqual(s.lo);
    ctx.pressStop();
    waitStage(ctx, game, sc, 'hoof');
    expect(game.peek().results[1].verdict).toBe('just');
    // 3. les pieds
    pickFeet(ctx, game, sc);
    waitStage(ctx, game, sc, 'comb');
    expect(game.peek().results[2].verdict).toBe('just');
    // 4. le peigne : de haut en bas à travers chaque nœud
    for (let pass = 0; pass < 10 && game.peek().knots.length; pass++) {
      const q = game.peek().knots[0];
      stroke(game, [{ x: q.x, y: q.y - 30 }, { x: q.x, y: q.y + 30 }], 4);
      run(ctx, game, sc, 0.3);
    }
    expect(game.peek().knots.length).toBe(0);
    ctx.pressStop();
    expect(ctx.finished.why).toBe('just');
    expect(ctx.finished.q).toBe(1);
    expect(ctx.finished.msg).toBe(t('mg_pansage_just', { name: 'Honey' }));
    expect(ctx.opts.out.hooves.cleaned).toBeGreaterThan(0.9);
    game.destroy();
    sc.dispose();
  }, 60000);

  it('la brosse à rebrousse-poil : ça avance moins vite, et la consigne le dit', () => {
    const { a, sc } = makeStage();
    const ctx = ctxFor(a, sc);
    const game = pansage.pansage3dGame(ctx);
    run(ctx, game, sc, 0.5);
    ctx.pressStop(); // (étrille sautée : la brosse)
    waitStage(ctx, game, sc, 'brush');
    const dust0 = game.peek().dust.map((q) => q.dust);
    for (let pass = 0; pass < 3; pass++) for (const q of game.peek().dust) stroke(game, [{ x: q.x - 26, y: q.y }, { x: q.x + 26, y: q.y }], 4);
    expect(ctx.hints.some((h) => h.text === t('mg_brush_dir') && h.kind === 'warn')).toBe(true);
    // (dans le bon sens, la même longueur de geste enlève plus de poussière)
    const { sc: sc2, a: a2 } = makeStage();
    const ctx2 = ctxFor(a2, sc2);
    const game2 = pansage.pansage3dGame(ctx2);
    run(ctx2, game2, sc2, 0.5);
    ctx2.pressStop();
    waitStage(ctx2, game2, sc2, 'brush');
    for (let pass = 0; pass < 3; pass++) for (const q of game2.peek().dust) stroke(game2, [{ x: q.x + 26, y: q.y }, { x: q.x - 26, y: q.y }], 4);
    expect(game2.peek().value).toBeGreaterThan(game.peek().value);
    expect(dust0.length).toBeGreaterThan(0);
    game.destroy();
    game2.destroy();
    sc.dispose();
    sc2.dispose();
  }, 60000);

  it('l\'étrille sur la tête : 💢, il couche les oreilles, et la consigne le dit', () => {
    const { a, sc } = makeStage();
    const ctx = ctxFor(a, sc);
    const game = pansage.pansage3dGame(ctx);
    run(ctx, game, sc, 0.5);
    // la tête, à l'écran (le bas du front)
    const h = sc.project(sc.live('head'));
    stroke(game, circle(h, 10, 3), 4);
    expect(ctx.hints.some((x) => x.text === t('mg_pansage_curry_bony') && x.kind === 'warn')).toBe(true);
    expect(sc.mood.annoyed).toBeGreaterThan(0);
    expect(game.peek().over).toBeGreaterThan(0);
    game.destroy();
    sc.dispose();
  });
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
    expect(r.calls.render).toBe(before + 4); // (les trois images d'un pixel de la préparation, puis une vraie image)
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

describe('l\'ouverture coûte moins cher', () => {
  it('décor et accessoires partagent leurs programmes (image blanche) ; l\'animal et son équipement ne sont pas touchés', async () => {
    const { sc } = makeStage();
    const horseMats = [];
    sc.holder.traverse((o) => { if (o.material) horseMats.push(...[].concat(o.material).map((m) => [m, m.map])); });
    await sc.warm();
    const mapless = [];
    sc.decor.group.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) if ((m.isMeshStandardMaterial || m.isMeshBasicMaterial) && !m.transparent && !m.map) mapless.push(o.name || m.type);
      if (o.isInstancedMesh) expect(o.instanceColor).toBeTruthy();
    });
    expect(mapless).toEqual([]);
    for (const [m, map] of horseMats) expect(m.map).toBe(map);
    // (les ombres des sabots peintes : cachées, la scène a de vraies ombres)
    expect(sc.model.root.getObjectByName('soleShadows')?.visible ?? false).toBe(false);
    sc.dispose();
  });

  it('les toiles peintes sont gardées d\'une ouverture à l\'autre (les textures, elles, sont neuves)', () => {
    const a = makeStage().sc;
    const b = makeStage().sc;
    const img = (sc) => sc.decor.props.net.net.material.map;
    expect(img(a)).not.toBe(img(b));
    expect(img(a).image).toBe(img(b).image);
    a.dispose();
    b.dispose();
  });
});

describe('la carte de fin laisse voir l\'animal', () => {
  it('setFocus : la scène se recadre dans la partie que la carte laisse voir (le doigt suit)', () => {
    const { sc } = makeStage({ h: 560 });
    const L = sc.marks;
    const fd = sc.decor.props.feeder.group.getWorldPosition(new THREE.Vector3());
    const pts = [L.muzzle, L.poll, ...L.ears, fd, L.withers];
    sc.frame(pts, { dir: [-0.4, 0.42, 1], pad: 1.1, now: true });
    const toPx = (p) => {
      const q = sc.project(p);
      return { x: q.x * sc.view.scale + sc.view.ox, y: q.y * sc.view.scale + sc.view.oy };
    };
    for (let i = 0; i < 90; i++) sc.update(1 / 30);
    // (toute la toile : la scène en occupe le milieu, plus bas que la moitié)
    expect(Math.max(...pts.map((p) => toPx(p).y))).toBeGreaterThan(560 * 0.5);
    sc.setFocus(0, 250);
    for (let i = 0; i < 120; i++) sc.update(1 / 30);
    const ys = pts.map((p) => toPx(p).y);
    expect(Math.max(...ys)).toBeLessThan(250);
    expect(Math.min(...ys)).toBeGreaterThan(0);
    // le doigt : un rayon sous le point projeté du garrot passe par le garrot
    const w = toPx(L.withers);
    const ray = sc.rayAt((w.x - sc.view.ox) / sc.view.scale, (w.y - sc.view.oy) / sc.view.scale);
    expect(ray.distanceToPoint(L.withers)).toBeLessThan(1e-3);
    sc.setFocus(null);
    for (let i = 0; i < 120; i++) sc.update(1 / 30);
    expect(sc.camera.view?.enabled ?? false).toBe(false);
    sc.dispose();
  });
});
