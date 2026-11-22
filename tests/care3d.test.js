// Scène de soin en 3D (src/game/care/, src/ui/minigames/care3d.js et les jeux *3d.js) : ce qui se vérifie sans
// navigateur ni WebGL — quand on ouvre la 3D, quand on retombe sur le jeu dessiné, la projection du doigt, la sole
// du cure-pied, et la règle de score des jeux 3D (la même que celle des jeux dessinés : même logique).
import { describe, it, expect, beforeAll } from 'vitest';
import { fakeCtx as fakeCtxOf, fakeDocument } from './fixtures/careCtx.js';
import * as THREE from 'three';

let t;
let stage;
let care3d;
let feed3d;
let treat3d;
let pet3d;
let hoof;
let ration;
beforeAll(async () => {
  // (les textures peintes des accessoires : une toile qui ne dessine rien, il n'y a pas d'écran ici)
  fakeDocument();
  ({ t } = await import('../src/i18n.js'));
  stage = await import('../src/game/care/stage.js');
  care3d = await import('../src/ui/minigames/care3d.js');
  feed3d = await import('../src/ui/minigames/feed3d.js');
  treat3d = await import('../src/ui/minigames/treat3d.js');
  pet3d = await import('../src/ui/minigames/pet3d.js');
  hoof = await import('../src/game/care/hoof.js');
  ration = await import('../src/ui/minigames/ration.js');
});

describe('quand ouvrir la scène 3D', () => {
  it('le cheval : seulement si son modèle réaliste est chargé, et jamais avec ?care3d=off', () => {
    const horse = { species: 'horse' };
    expect(stage.care3dPossible(horse, { has: () => true })).toBe(true);
    expect(stage.care3dPossible(horse, { has: () => false })).toBe(false); // (pas de cheval sculpté : le jeu dessiné)
    expect(stage.care3dPossible(horse, { has: () => true, setting: 'off' })).toBe(false);
    expect(stage.care3dPossible(null, { has: () => true })).toBe(false);
  });

  it('les autres espèces gardent leur jeu dessiné (pour l\'instant)', () => {
    for (const sp of ['dog', 'cat', 'rabbit', 'sheep', 'goat', 'cow']) expect(stage.care3dPossible({ species: sp }, { has: () => true })).toBe(false);
  });

  it('le réglage se lit dans l\'adresse, puis dans le stockage local', () => {
    expect(stage.care3dSetting('?care3d=off', { getItem: () => '' })).toBe('off');
    expect(stage.care3dSetting('', { getItem: (k) => (k === 'care3d' ? 'off' : null) })).toBe('off');
    expect(stage.care3dSetting('', { getItem: () => null })).toBe('');
  });

  it('la liste des soins 3D (which.js, sans le code de la scène) et les jeux 3D disent les mêmes soins', async () => {
    const which = await import('../src/game/care/which.js');
    for (const [sp, acts] of Object.entries(which.CARE3D_ACTIONS)) {
      expect(Object.keys(care3d.CARE3D_GAMES[sp]).sort()).toEqual([...acts].sort());
      for (const act of acts) expect(which.care3dWanted({ species: sp }, act)).toBe(true);
    }
    expect(which.care3dWanted({ species: 'horse' }, 'wash')).toBe(false);
    expect(which.care3dWanted({ species: 'dog' }, 'feed')).toBe(false);
  });

  it('les soins du cheval refaits en 3D : nourrir, abreuver, friandise, caresser, pansage', () => {
    const h = { species: 'horse' };
    for (const act of ['feed', 'water', 'treat', 'pet', 'brush']) expect(typeof care3d.care3dGameFor(h, act), act).toBe('function');
    expect(care3d.care3dGameFor(h, 'wash')).toBe(null);
    expect(care3d.care3dGameFor({ species: 'dog' }, 'feed')).toBe(null);
    expect(care3d.care3dGameFor(null, 'feed')).toBe(null);
  });
});

// (le repli sur le jeu dessiné et ce qui est rendu à la fermeture : vérifiés en vrai, avec le cadre, dans
// tests/care3dFrame.test.js ; la libération de la scène elle-même : tests/care3dStage.test.js)

describe('projection : le doigt et la scène tombent au même endroit', () => {
  it('espace du cadre ↔ coordonnées normalisées, aller-retour exact', () => {
    const view = { scale: 0.9, ox: 12, oy: 80 };
    for (const [x, y] of [[0, 0], [200, 180], [400, 360], [-20, 410]]) {
      const n = stage.virtualToNdc(x, y, view, 384, 560);
      const back = stage.ndcToVirtual(n.x, n.y, view, 384, 560);
      expect(back.x).toBeCloseTo(x, 6);
      expect(back.y).toBeCloseTo(y, 6);
    }
    // le centre de la toile est (0, 0)
    const c = stage.ndcToVirtual(0, 0, view, 384, 560);
    expect(c.x * view.scale + view.ox).toBeCloseTo(192, 6);
    expect(c.y * view.scale + view.oy).toBeCloseTo(280, 6);
  });

  it('lissage indépendant de l\'image, angle borné', () => {
    expect(stage.ease(0.25, 0.25)).toBeCloseTo(0.5, 6);
    expect(stage.approachAngle(0, 5, 10, 0.1, 0.7)).toBeCloseTo(0.7, 3);
  });

  it('régions du corps d\'après les os du cheval réaliste', () => {
    expect(stage.regionOf('Head')).toBe('head');
    expect(stage.regionOf('EarL')).toBe('head');
    expect(stage.regionOf('Neck')).toBe('neck');
    expect(stage.regionOf('FL3')).toBe('leg');
    expect(stage.regionOf('HR4')).toBe('leg');
    expect(stage.regionOf('Ribs')).toBe('body');
    expect(stage.regionOf('FL1')).toBe('shoulder');
    expect(stage.regionOf('HL2')).toBe('hip');
    expect(stage.regionOf('Tail2')).toBe('tail');
  });
});

describe('la sole du cure-pied', () => {
  it('la fourchette : un triangle (pointe vers la pince)', () => {
    const [a, b, c] = hoof.FROG.map(([x, y]) => ({ x, y }));
    expect(hoof.inTriangle(-0.4, 0, a, b, c)).toBe(true);
    expect(hoof.inTriangle(0.6, 0, a, b, c)).toBe(false);
    expect(hoof.inTriangle(-0.4, 0.5, a, b, c)).toBe(false);
  });

  it('le contour du sabot : la pince plus loin que les talons', () => {
    const o = hoof.hoofOutline(32);
    const xs = o.map((p) => p.x);
    expect(Math.max(...xs)).toBeGreaterThan(1);
    expect(Math.min(...xs)).toBeGreaterThan(-0.95);
  });
});

// ---------------------------------------------------------------- la règle de score des jeux 3D

/** Le cadre, en faux (tests/fixtures/careCtx.js). */
const fakeCtx = (a, extra = {}) => fakeCtxOf(a, t, extra);

/** Une fausse scène : accessoires qui notent ce qu'on leur demande, projection simple (pas de WebGL). */
function fakeScene() {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const rec = [];
  const prop = (name) => {
    const group = new THREE.Group();
    return new Proxy({}, {
      get(_, k) {
        if (k === 'group') return group;
        if (k === 'level') return 0;
        if (k === 'surfaceY') return () => 0;
        if (k === 'bite') return (out = V()) => out.set(1, 1.2, 0.5);
        if (k === 'tipWorld') return (out = V()) => out.set(1.7, 0.6, 0);
        return (...args) => rec.push([name, k, ...args]);
      },
    });
  };
  const props = { net: prop('net'), feeder: prop('feeder'), bucket: prop('bucket'), tap: prop('tap') };
  const camera = new THREE.PerspectiveCamera(38, 0.7, 0.05, 60);
  camera.position.set(0, 1.5, 3);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  return {
    rec,
    ready: true,
    a: { species: 'horse' },
    marks: { muzzle: V(1.2, 1.1, 0), poll: V(0.9, 1.6, 0), ears: [V(0.9, 1.7, 0.05), V(0.9, 1.7, -0.05)], withers: V(0.2, 1.5, 0), chest: V(0.6, 1.0, 0), neck: V(0.5, 1.4, 0), belly: V(0, 0.8, 0) },
    mood: { look: null, lookAmt: 0, feeder: 0, chew: 0, nod: 0, nuzzle: 0, ears: null, annoyed: 0, lift: null },
    decor: { props, layout: (w) => rec.push(['layout', w]) },
    camera,
    scene: { add() {}, remove() {} },
    double: { scale: 1 },
    model: { dims: { R: 0.35 } },
    game: { profile: { avatar: {} } },
    frame: () => {},
    project: (p) => ({ x: p.x * 100, y: p.y * 100 }),
    projectRadius: () => 20,
    live: (k) => (k === 'forehead' ? V(1.0, 1.55, 0) : V(1.1, 1.3, 0)),
    puff: () => {},
  };
}

describe('les jeux 3D gardent la règle « juste ce qu\'il faut » des jeux dessinés', () => {
  it('nourrir en 3D : la ration du jeu dessiné (foin plein, petite mesure : trois étoiles), le filet suit', () => {
    const a = { species: 'horse', name: 'Étoile', sex: 'f' };
    const ctx = fakeCtx(a, { scene: fakeScene() });
    const game = feed3d.ration3dGame(ctx);
    const tick = (s) => { for (let k = 0; k < s / 0.05; k++) { ctx.time += 0.05; game.update(0.05); } };
    const press = () => ctx.buttons.find((b) => b.opts.cls?.includes('stop')).opts.onTap();
    game.down(); tick(3.2); game.up();
    press(); tick(0.6);
    expect(game.peek().stage).toBe('grain');
    // (la consigne parle de la mangeoire et de la jauge, pas du seau du jeu dessiné)
    expect(ctx.hints.at(-1).text).toBe(t('mg_ration_grain_hint3d', { name: 'Étoile', g: 'f' }));
    expect(ctx.hints.some((h) => h.text === t('mg_ration_grain_hint', { name: 'Étoile', g: 'f' }))).toBe(false);
    game.down(); tick(1); game.up();
    press();
    expect(ctx.finished.q).toBe(1);
    expect(ctx.finished.why).toBe('just');
    expect(ctx.opts.out.colic).toBe(false);
    expect(ctx.finished.msg).toBe(t('mg_ration_just', { name: 'Étoile', g: 'f' }));
    // (le filet a reçu le foin, la mangeoire les granulés)
    expect(ctx.scene.rec.some(([p, k, v]) => p === 'net' && k === 'setFill' && v >= ration.RATION.hayLo)).toBe(true);
    expect(ctx.scene.rec.some(([p, k, v]) => p === 'feeder' && k === 'setLevel' && v > 0)).toBe(true);
  });

  it('abreuver en 3D : le seau du jeu dessiné ; trop plein, c\'est trop', () => {
    const a = { species: 'horse', name: 'Étoile', sex: 'f' };
    const ctx = fakeCtx(a, { scene: fakeScene() });
    const game = feed3d.water3dGame(ctx);
    const tick = (s) => { for (let k = 0; k < s / 0.05; k++) { ctx.time += 0.05; game.update(0.05); } };
    game.down(); tick(20); game.up(); tick(1);
    expect(ctx.done).toBe(true);
    expect(ctx.finished.why).toBe('high');
    expect(ctx.finished.q).toBeLessThan(1);
  });

  it('la friandise en 3D : trois pour un cheval, données quand il est sage', () => {
    const a = { species: 'horse', name: 'Étoile', sex: 'f', weight: 50 };
    const ctx = fakeCtx(a, { scene: fakeScene() });
    const game = treat3d.treat3dGame(ctx);
    const tick = (s) => { for (let k = 0; k < s / 0.05; k++) { ctx.time += 0.05; game.update(0.05); } };
    for (let i = 0; i < 400 && game.peek().given < 3; i++) {
      if (game.peek().state === 'calm') game.down();
      tick(0.05);
    }
    tick(1.5);
    ctx.buttons.find((b) => b.opts.cls?.includes('stop')).opts.onTap();
    expect(ctx.finished.why).toBe('just');
    expect(ctx.finished.q).toBe(1);
  });
});

describe('caresser en 3D', () => {
  /** Fausse scène : le cheval occupe x 100 à 300 et y 60 à 260 de l'écran (1 m = 100 unités du cadre). */
  function petScene() {
    const sc = fakeScene();
    sc.pickAnimal = (x, y) => (x >= 100 && x <= 300 && y >= 60 && y <= 260 ? { point: new THREE.Vector3(x / 100, y / 100, 0), normal: new THREE.Vector3(0, 0, 1), region: 'neck' } : null);
    return sc;
  }

  it('doucement à son coin préféré : le cœur se remplit, et on peut s\'arrêter dans la zone verte', () => {
    const a = { species: 'horse', name: 'Étoile', sex: 'f', personality: 'calm' };
    const ctx = fakeCtx(a, { scene: petScene() });
    const game = pet3d.pet3dGame(ctx);
    const fav = game.peek().fav;
    expect(['withers', 'neck', 'chest', 'forehead']).toContain(fav);
    let x = 200;
    game.down({ x, y: 150 });
    ctx.pointer.down = true;
    for (let i = 0; i < 400 && game.peek().prog < game.peek().lo; i++) {
      ctx.time += 0.03;
      x += (Math.floor(i / 8) % 2 ? -6 : 6); // aller-retour, 200 unités / s : doux
      game.move({ x, y: 150 }, true);
      game.update(0.03);
    }
    const s = game.peek();
    expect(s.prog).toBeGreaterThanOrEqual(s.lo);
    expect(s.fast).toBe(0);
    ctx.buttons.find((b) => b.opts.cls?.includes('stop')).opts.onTap();
    expect(ctx.finished.why).toBe('just');
  });

  it('trop vite : il sursaute (et le cœur ne monte pas)', () => {
    const a = { species: 'horse', name: 'Étoile', sex: 'f', personality: 'shy' };
    const ctx = fakeCtx(a, { scene: petScene() });
    const game = pet3d.pet3dGame(ctx);
    game.down({ x: 110, y: 150 });
    for (let i = 0; i < 6; i++) {
      ctx.time += 0.02;
      game.move({ x: 110 + (i + 1) * 30, y: 150 }, true); // 1 500 unités / s
    }
    expect(game.peek().fast).toBeGreaterThan(0);
    expect(game.peek().prog).toBeLessThan(0.05);
  });

  it('hors du cheval : rien ne compte', () => {
    const a = { species: 'horse', name: 'Étoile', sex: 'f', personality: 'calm' };
    const ctx = fakeCtx(a, { scene: petScene() });
    const game = pet3d.pet3dGame(ctx);
    game.down({ x: 20, y: 20 });
    for (let i = 0; i < 50; i++) {
      ctx.time += 0.03;
      game.move({ x: 20 + (i % 10) * 6, y: 20 }, true);
    }
    expect(game.peek().prog).toBe(0);
  });
});
