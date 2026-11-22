// La scène de soin des moutons, des chèvres et des vaches, construite pour de vrai sans navigateur (faux rendu :
// stage.headlessRenderer) : le vrai modèle réaliste (GLB chargé dans node), la bergerie, la chèvrerie ou l'étable, la
// caméra, le doigt et la projection. On y vérifie les repères (toutes les races, les petits), le décor placé d'après
// l'animal, et les jeux 3D joués de bout en bout (même note que les jeux dessinés), puis la libération.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as THREE from 'three';
import { fakeCtx as fakeCtxOf, fakeDocument } from './fixtures/careCtx.js';
import { loadRealSheepGltf } from './fixtures/realSheepGltf.js';
import { loadRealGoatGltf } from './fixtures/realGoatGltf.js';
import { loadRealCowGltf } from './fixtures/realCowGltf.js';

let t;
let gltf = {};
let stageMod;
let barnMod;
let ruminant;
let animalMod;
let frameMod;
let farm3d;
let treat3d;
let pet3d;
let brush3d;
let shear3d;
let milk3d;
let cowWash3d;
let fleeceMod;
beforeAll(async () => {
  fakeDocument();
  ({ t } = await import('../src/i18n.js'));
  gltf = { sheep: await loadRealSheepGltf(), goat: await loadRealGoatGltf(), cow: await loadRealCowGltf() };
  stageMod = await import('../src/game/care/stage.js');
  barnMod = await import('../src/game/care/farmBarn.js');
  ruminant = await import('../src/game/care/ruminant.js');
  animalMod = await import('../src/sim/animal.js');
  frameMod = await import('../src/ui/minigames/frame.js');
  farm3d = await import('../src/ui/minigames/farm3d.js');
  treat3d = await import('../src/ui/minigames/farmTreat3d.js');
  pet3d = await import('../src/ui/minigames/farmPet3d.js');
  brush3d = await import('../src/ui/minigames/farmBrush3d.js');
  shear3d = await import('../src/ui/minigames/shear3d.js');
  milk3d = await import('../src/ui/minigames/milk3d.js');
  cowWash3d = await import('../src/ui/minigames/cowWash3d.js');
  fleeceMod = await import('../src/game/care/fleece.js');
}, 60000);

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

/** Une scène headless : l'animal (espèce, race, âge, sexe) dans son bâtiment, toile de téléphone en portrait. */
export function makeStage({ species = 'sheep', breed = null, young = false, sex = 'f', w = 390, h = 600, name = 'Flocon', needs = 25 } = {}) {
  const a = animalMod.createAnimal({ species, breed, colorIndex: 0, ageDays: young ? 5 : 900, seed: 77, sex });
  a.name = name;
  a.sex = sex;
  for (const k in a.needs) a.needs[k] = needs;
  const g = species === 'cow' ? gltf.cow : gltf[species];
  const model = ruminant.buildRuminantModel(a, g);
  const sc = new stageMod.CareStage({ a, renderer: stageMod.headlessRenderer(), model, set: barnMod.barnSet, fit: ruminant.RUMINANT_FIT });
  sc.resize(w, h, frameMod.fitView(w, h, 400, 360));
  sc.ready = true;
  for (const act of Object.values(model.anim?.actions ?? {})) act.time = 0;
  return { a, sc };
}

const ctxFor = (a, sc, w = 390, h = 600) => fakeCtxOf(a, t, { scene: sc, view: frameMod.fitView(w, h, 400, 360) });

/** dt secondes de jeu : le jeu, puis la scène (comme la boucle du cadre). */
export function run(ctx, game, sc, s, dt = 1 / 30) {
  for (let k = 0; k < s / dt; k++) {
    ctx.time += dt;
    game.update(dt);
    sc.update(dt);
  }
}

const inView = (q, v) => q.x > v.x0 && q.x < v.x1 && q.y > v.y0 && q.y < v.y1;

const CASES = [
  { species: 'sheep', breed: 'merinos' }, { species: 'sheep', breed: 'islandais_mouton', sex: 'm' }, { species: 'sheep', breed: 'ouessant', young: true },
  { species: 'goat', breed: 'alpine' }, { species: 'goat', breed: 'saanen', young: true },
  { species: 'cow', breed: 'holstein' }, { species: 'cow', breed: 'highland' }, { species: 'cow', breed: 'normande', young: true },
];

describe('quand ouvrir la scène 3D', () => {
  it('moutons, chèvres et vaches ont leur scène si leur modèle réaliste est chargé (le taureau a le sien)', async () => {
    const which = await import('../src/game/care/which.js');
    for (const sp of ['sheep', 'goat', 'cow']) {
      expect(which.care3dPossible({ species: sp, look: {} }, { has: () => true })).toBe(true);
      expect(which.care3dPossible({ species: sp, look: {} }, { has: () => false })).toBe(false);
      expect(which.care3dPossible({ species: sp, look: {} }, { setting: 'off', has: () => true })).toBe(false);
    }
    const bull = animalMod.createAnimal({ species: 'cow', breed: 'holstein', sex: 'm', ageDays: 900, seed: 3 });
    bull.sex = 'm';
    expect(which.care3dPossible(bull, { has: (k) => k === 'bull_real' })).toBe(true);
    expect(which.care3dPossible(bull, { has: (k) => k === 'cow_real' })).toBe(false);
  });
});

describe('la bergerie, la chèvrerie, l\'étable', () => {
  for (const c of CASES) {
    it(`${c.species} ${c.breed}${c.young ? ' (petit)' : ''} : repères, décor, râtelier à sa bouche`, () => {
      const { sc } = makeStage(c);
      const L = sc.marks;
      // repères dans l'ordre attendu (tête devant, croupe derrière, garrot au-dessus du ventre)
      expect(L.muzzle.x).toBeGreaterThan(L.withers.x);
      expect(L.withers.x).toBeGreaterThan(L.croup.x);
      expect(L.withers.y).toBeGreaterThan(L.belly.y);
      expect(L.hooves.length).toBe(4);
      expect(L.u).toBeGreaterThan(0.2);
      const D = sc.decor.dims;
      // l'animal tient dans sa case, le nez ne touche pas le mur
      expect(L.muzzle.x).toBeLessThan(D.halfW - 0.05);
      expect(L.tailTip.x).toBeGreaterThan(-D.halfW + 0.1);
      expect(L.croup.z - 0.4 * L.u).toBeGreaterThan(D.back);
      // tête baissée pour manger, la bouche arrive dans l'auge du râtelier (sous le rebord, au-dessus du fond)
      const eat = sc.decor.anchors.eat;
      const rack = sc.decor.props.rack;
      const bite = rack.bite(new THREE.Vector3());
      expect(Math.abs(eat.x - bite.x)).toBeLessThan(0.06 * Math.max(1, L.u));
      const rim = rack.group.getWorldPosition(new THREE.Vector3()).y;
      expect(eat.y).toBeLessThan(rim);
      expect(eat.y).toBeGreaterThan(rim - rack.trough);
      // tête haute, le nez ne touche ni le mur ni les barreaux (plan des barreaux : du mur en bas à -d en haut)
      const f = Math.min(1, Math.max(0, (L.muzzle.y - rim) / rack.h));
      expect(L.muzzle.x).toBeLessThan(rack.group.getWorldPosition(new THREE.Vector3()).x - rack.d * f - 0.02);
      sc.dispose();
    });
  }
});

describe('il bêle ou meugle doucement', () => {
  for (const species of ['sheep', 'goat', 'cow']) {
    it(`${species} : le son, la tête à peine levée, les lèvres entrouvertes (pas le clip du jeu, gueule béante vers le plafond)`, () => {
      const { a, sc } = makeStage({ species });
      const ctx = ctxFor(a, sc);
      const game = pet3d.farmPet3dGame(ctx);
      run(ctx, game, sc, 1);
      const u = sc.marks.u;
      const jaw = sc.model.bone('jaw');
      const angle = (b) => new THREE.Quaternion().copy(b.quaternion);
      const m0 = sc.live('muzzle');
      const p0 = sc.live('poll');
      const j0 = angle(jaw);
      sc.mood.call = 1;
      let lift = 0;
      let open = 0;
      for (let k = 0; k < 30; k++) {
        run(ctx, game, sc, 1 / 30);
        expect(sc.model.anim.bleatOn).toBe(false);
        expect(sc.model.anim.mooOn ?? false).toBe(false);
        lift = Math.max(lift, sc.live('muzzle').y - m0.y);
        open = Math.max(open, angle(jaw).angleTo(j0));
      }
      // (la tête : quelques centimètres au plus — le clip levait le nez vers le plafond)
      expect(lift).toBeLessThan(0.06 * u);
      expect(sc.live('muzzle').y - sc.live('poll').y).toBeLessThan(m0.y - p0.y + 0.05 * u);
      // (la bouche s'entrouvre, un peu)
      expect(open).toBeGreaterThan(0.04);
      expect(open).toBeLessThan(0.3);
      game.destroy();
      sc.dispose();
    }, 30000);
  }
});

describe('les mèches de la laine et du poil longs, de près', () => {
  it('islandais, col noir, Highland : mèches lisses et rondes, à la scène seulement ; le poil de la chèvre ne pend pas sous le ventre', async () => {
    const locks = await import('../src/game/care/locks.js');
    for (const [species, breed, name] of [['sheep', 'islandais_mouton', 'sheep_locks'], ['goat', 'col_noir', 'goat_hair'], ['cow', 'highland', 'cow_hair']]) {
      const { sc } = makeStage({ species, breed, sex: species === 'goat' ? 'm' : 'f' });
      let mesh = null;
      sc.model.root.traverse((o) => {
        if (o.name === name) mesh = o;
      });
      expect(mesh, `${breed} : ses mèches`).toBeTruthy();
      const geo = mesh.geometry;
      // (une géométrie à la scène, pas celle du gabarit partagé avec les animaux du jeu)
      expect(geo.userData.shared).toBeFalsy();
      expect(mesh.userData.careLocks).toBe(true);
      // (des rangées lisses : 9 par carte ; carte en croix pour le mouton et la chèvre)
      expect(geo.attributes.position.count).toBe(geo.userData.cards * 18);
      // (la recette du dessin : l'ombrage rond des mèches, sous une autre clé que celle du jeu)
      const sh = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {}, defines: {} };
      mesh.material.onBeforeCompile(sh, sc.renderer);
      expect(sh.fragmentShader).toContain('float cyl = sqrt(max(0.0, 1.0 - lx * lx));');
      expect(sh.vertexShader).toContain('vCareLock = fract(');
      expect(mesh.material.customProgramCacheKey()).toMatch(/-care$/);
      if (species === 'goat') {
        const floor = sc.model.legTop / sc.model.root.scale.x + 0.035;
        const p = geo.attributes.position.array;
        let low = Infinity;
        for (let i = 1; i < p.length; i += 3) low = Math.min(low, p[i]);
        // (aucune pointe sous la ligne du ventre, à part les mèches qui y prennent racine, gardées très courtes)
        expect(low).toBeGreaterThan(floor - 0.06);
      }
      sc.dispose();
    }
    expect(typeof locks.refineLockGeometry).toBe('function');
  }, 60000);
});

describe('nourrir et abreuver en 3D', () => {
  for (const species of ['sheep', 'goat', 'cow']) {
    it(`${species} : nourrir jusqu'à la ligne, il mange au râtelier`, () => {
      const { a, sc } = makeStage({ species });
      const ctx = ctxFor(a, sc);
      const game = farm3d.farmFeed3dGame(ctx);
      const pour = ctx.buttons[0].opts;
      {
        // (la ligne 🎯 ne passe pas devant sa bouche : elle commence à côté de sa tête, vers l'allée)
        let ln = null;
        sc.decor.props.rack.group.traverse((o) => {
          if (o.isMesh && o.renderOrder === 3) ln = o;
        });
        const box = new THREE.Box3().setFromObject(ln);
        expect(box.min.z).toBeGreaterThan(sc.marks.muzzle.z + 0.05 * sc.marks.u);
      }
      const s0 = game.peek();
      pour.onDown();
      for (let i = 0; i < 400 && game.peek().value < s0.target; i++) run(ctx, game, sc, 1 / 30);
      pour.onUp();
      run(ctx, game, sc, 1);
      ctx.pressStop();
      run(ctx, game, sc, 2);
      expect(ctx.done).toBe(true);
      expect(ctx.finished.why).toBe('just');
      expect(sc.decor.props.rack.fill).toBeGreaterThan(s0.lo - 0.05);
      // il mange : la bouche descend au râtelier, et elle y reste (il ne lève pas la tête pour bêler en plein repas)
      const bite = sc.decor.props.rack.bite(new THREE.Vector3());
      for (let k = 0; k < 16; k++) {
        run(ctx, game, sc, 0.5);
        if (k >= 5) expect(sc.live('muzzle').distanceTo(bite)).toBeLessThan(0.3 * Math.max(1, sc.marks.u));
      }
      // le râtelier et sa tête sont dans l'image
      for (const p of [sc.marks.poll, sc.decor.props.rack.barsAt(0.5)]) expect(inView(sc.project(p), ctx.view)).toBe(true);
      // la ligne 🎯 : à côté de sa tête, pas derrière son nez ; et effacée pendant qu'il mange
      let line = null;
      sc.decor.props.rack.group.traverse((o) => {
        if (o.isMesh && o.material?.color?.getHex() === 0xffffff && o.renderOrder === 3) line = o;
      });
      expect(line).toBeTruthy();
      expect(line.visible && line.parent.visible).toBe(false);
      game.destroy();
      sc.dispose();
    }, 30000);
    it(`${species} : abreuver jusqu'à la ligne, il boit`, () => {
      const { a, sc } = makeStage({ species });
      const ctx = ctxFor(a, sc);
      const game = farm3d.farmWater3dGame(ctx);
      const tap = ctx.buttons[0].opts;
      const s0 = game.peek();
      tap.onDown();
      for (let i = 0; i < 400 && game.peek().value < s0.target; i++) run(ctx, game, sc, 1 / 30);
      tap.onUp();
      run(ctx, game, sc, 1);
      ctx.pressStop();
      run(ctx, game, sc, 2);
      expect(ctx.finished?.why).toBe('just');
      run(ctx, game, sc, 3);
      const tr = sc.decor.props.trough;
      const surf = tr.group.localToWorld(new THREE.Vector3(0, tr.surfaceY(), 0));
      expect(Math.abs(sc.live('muzzle').y - surf.y)).toBeLessThan(0.12 * Math.max(1, sc.marks.u));
      game.destroy();
      sc.dispose();
    }, 30000);
  }
});

describe('friandise, caresses, brosse en 3D', () => {
  for (const species of ['sheep', 'goat', 'cow']) {
    it(`${species} : la friandise quand il est calme, juste le bon nombre`, () => {
      const { a, sc } = makeStage({ species });
      const ctx = ctxFor(a, sc);
      const game = treat3d.farmTreat3dGame(ctx);
      const give = ctx.buttons.find((b) => !b.opts.cls?.includes('stop')).opts;
      for (let i = 0; i < 600 && game.peek().given < game.peek().n; i++) {
        if (game.peek().state === 'calm') give.onTap();
        run(ctx, game, sc, 1 / 15, 1 / 15);
      }
      run(ctx, game, sc, 1.5);
      ctx.pressStop();
      expect(ctx.finished.why).toBe('just');
      expect(game.peek().penalties).toBe(0);
      game.destroy();
      sc.dispose();
    }, 30000);

    it(`${species} : caresser doucement l'encolure jusqu'à la zone verte`, () => {
      const { a, sc } = makeStage({ species });
      sc.updateCamera(0);
      const ctx = ctxFor(a, sc);
      const game = pet3d.farmPet3dGame(ctx);
      run(ctx, game, sc, 0.5);
      const spots = pet3d.farmSpots(sc);
      const c = sc.project(spots.neck);
      const r = Math.max(12, sc.projectRadius(spots.neck, 0.12 * sc.marks.u));
      let regions = new Set();
      for (let k = 0; k < 400 && game.peek().value < game.peek().lo + 0.02; k++) {
        const p = { x: c.x + Math.cos(k * 0.35) * r, y: c.y + Math.sin(k * 0.35) * r * 0.5 };
        if (k === 0) game.down(p);
        ctx.pointer.down = true;
        game.move(p, true);
        if (game.peek().region) regions.add(game.peek().region);
        run(ctx, game, sc, 1 / 30);
      }
      game.up();
      expect([...regions].some((x) => ['neck', 'head', 'body', 'shoulder'].includes(x))).toBe(true);
      ctx.pressStop();
      expect(ctx.finished.why).toBe('just');
      game.destroy();
      sc.dispose();
    }, 30000);

    it(`${species} : brosser les sept taches dans le sens du poil`, () => {
      const { a, sc } = makeStage({ species });
      sc.updateCamera(0);
      const ctx = ctxFor(a, sc);
      const game = brush3d.farmBrush3dGame(ctx);
      run(ctx, game, sc, 0.3);
      expect(game.peek().n).toBe(7);
      for (const q of game.peek().patches) expect(inView(q, ctx.view), `tache (${q.x.toFixed(0)}, ${q.y.toFixed(0)})`).toBe(true);
      for (let pass = 0; pass < 12 && game.peek().patches.length; pass++) {
        for (const q of game.peek().patches) {
          // vers la gauche (vers la queue) : dans le sens du poil
          game.down({ x: q.x + q.r * 1.5, y: q.y });
          for (let k = 1; k <= 8; k++) game.move({ x: q.x + q.r * 1.5 - (k / 8) * q.r * 3, y: q.y }, true);
          game.up();
        }
        run(ctx, game, sc, 0.1);
      }
      expect(game.peek().patches.length).toBe(0);
      ctx.pressStop();
      expect(ctx.finished.why).toBe('just');
      game.destroy();
      sc.dispose();
    }, 30000);
  }
});

describe('la tonte en 3D', () => {
  for (const c of [{ breed: 'merinos' }, { breed: 'islandais_mouton' }, { breed: 'ouessant' }]) {
    it(`${c.breed} : une passe partout, la toison se coupe vraiment, les flocons tombent, sans toucher au gabarit du jeu`, () => {
      const { a, sc } = makeStage({ species: 'sheep', ...c });
      sc.updateCamera(0);
      const src = sc.model.mesh.geometry;
      const ctx = ctxFor(a, sc);
      const game = shear3d.shear3dGame(ctx);
      run(ctx, game, sc, 0.3);
      const geo = sc.model.mesh.geometry;
      expect(geo).not.toBe(src);
      expect(src.attributes.careCut).toBeUndefined(); // (le gabarit partagé avec les moutons du jeu reste tel quel)
      expect(game.peek().total).toBeGreaterThan(30);
      // une passe par rangée de touffes, de la tête vers la queue
      const rows = new Map();
      for (const q of game.peek().longAt) {
        const k = Math.round(q.y / 6);
        (rows.get(k) ?? rows.set(k, []).get(k)).push(q);
      }
      for (const [, row] of rows) {
        row.sort((p, q) => q.x - p.x);
        game.down({ x: row[0].x + 4, y: row[0].y });
        for (let k = 1; k <= 20; k++) game.move({ x: row[0].x + 4 - (k / 20) * (row[0].x - row[row.length - 1].x + 8), y: row[0].y }, true);
        game.up();
        run(ctx, game, sc, 0.05);
      }
      // ce qui reste long : une petite passe dessus, chacun
      for (const q of game.peek().longAt) {
        game.down({ x: q.x + 3, y: q.y });
        game.move({ x: q.x - 3, y: q.y }, true);
        game.up();
      }
      run(ctx, game, sc, 1);
      const s = game.peek();
      expect(s.long).toBe(0);
      expect(s.value).toBeGreaterThan(0.85);
      expect(s.fallen).toBeGreaterThan(10);
      // la laine coupée : la plupart des sommets de laine ont leur coupe
      const cut = geo.attributes.careCut.array;
      const nCut = [...cut].filter((x) => x > 0.4).length;
      expect(nCut).toBeGreaterThan(cut.length * 0.3);
      // pas de voile : AUCUN sommet que la toison déplace (masque de laine, volume lissé au-delà du masque — la lisière
      // du garrot et de l'encolure) ne garde sa laine pleine
      const mask = geo.attributes.sheepMask;
      const puffW = geo.attributes.sheepPuffW;
      const seen = new Set(sc.proxy.parts.flatMap((p) => p.list));
      let left = 0;
      let border = 0;
      for (let v = 0; v < cut.length; v++) {
        if (!seen.has(v)) continue;
        const moved = mask.getX(v) > 0.01 || puffW.getX(v) > 0.002;
        if (!moved) continue;
        if (mask.getX(v) < 0.3) border++;
        if (cut[v] < 0.4) left++;
      }
      expect(border).toBeGreaterThan(0);
      expect(left).toBe(0);
      // le dessin de la laine reçoit bien la coupe (les textes visés de sheepCoat.js existent : sinon la tonte ne se
      // verrait pas, sans erreur)
      const sh = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {}, defines: {} };
      sc.model.mesh.material.onBeforeCompile(sh, sc.renderer);
      expect(sh.vertexShader).toContain('attribute float careCut;');
      expect(sh.vertexShader).toContain('float pm = sheepPuffW * (1.0 - careCutS);');
      expect(sh.vertexShader).toContain('getMorph( gl_VertexID, 0, 0 ).xyz * careCutS');
      if (c.breed === 'islandais_mouton') expect(sh.vertexShader).toContain('(1.0 - max(sState.x, careCutS))');
      expect(sh.fragmentShader).toContain('float sh = max(sState.x, min(1.0, vCareCut * 2.0)) * wool;');
      expect(sh.fragmentShader).toContain('float cutL = smoothstep(0.05, 0.45, vCareCut) * wool;');
      expect(sh.fragmentShader).toContain('(1.0 - max(sState.x, min(1.0, vCareCut * 2.0))) * sFade(vSRest)');
      const dsh = { vertexShader: THREE.ShaderLib.depth.vertexShader, fragmentShader: THREE.ShaderLib.depth.fragmentShader, uniforms: {}, defines: {} };
      sc.model.mesh.customDepthMaterial.onBeforeCompile(dsh, sc.renderer);
      expect(dsh.vertexShader).toContain('float pm = sheepPuffW * (1.0 - careCutS);');
      expect(fleeceMod.patchVertex({ vertexShader: 'rien' })).toHaveLength(5);
      ctx.pressStop();
      // une passe partout, sans raser : juste ce qu'il faut
      expect(ctx.finished.why).toBe('just');
      game.destroy();
      expect(sc.model.mesh.geometry).toBe(src);
      sc.dispose();
    }, 60000);
  }
});

describe('la traite en 3D', () => {
  for (const c of [{ species: 'goat', breed: 'saanen' }, { species: 'goat', breed: 'alpine' }, { species: 'cow', breed: 'holstein' }, { species: 'cow', breed: 'highland' }]) {
    it(`${c.species} ${c.breed} : ses trayons trouvés, gauche-droite en rythme, le lait monte, la mamelle se vide`, () => {
      const { a, sc } = makeStage(c);
      sc.updateCamera(0);
      const udder0 = sc.model.uniforms?.gUdder?.value.clone();
      const ctx = ctxFor(a, sc);
      const game = milk3d.milk3dGame(ctx);
      run(ctx, game, sc, 0.3);
      const s0 = game.peek();
      for (const k of ['L', 'R']) expect(inView(s0.teats[k], ctx.view), k).toBe(true);
      expect(s0.teats.L.x).toBeLessThan(s0.teats.R.x);
      if (c.species === 'goat') {
        // (vue de derrière : les deux trayons bien l'un à côté de l'autre, pas l'un derrière l'autre)
        expect(s0.teats.R.x - s0.teats.L.x).toBeGreaterThan(40);
        // (la mamelle sombre de l'alpine éclaircie le temps de la traite)
        if (c.breed === 'alpine') expect(sc.model.uniforms.gUdder.value.getHSL({}).l).toBeGreaterThan(udder0.getHSL({}).l + 0.08);
      }
      const full = sc.model.udderFill;
      const left = ctx.buttons.find((b) => b.text.includes('👈')).opts;
      const right = ctx.buttons.find((b) => b.text.includes('👉')).opts;
      for (let i = 0; i < 400; i++) {
        const s = game.peek();
        if (s.value >= (s.lo + s.hi) / 2) break;
        if (s.phase < 0.06) (s.expect === 'L' ? left : right).onTap();
        run(ctx, game, sc, 1 / 30);
      }
      ctx.pressStop();
      expect(ctx.finished.why).toBe('just');
      expect(sc.model.udderFill).toBeLessThan(full);
      game.destroy();
      if (udder0) expect(sc.model.uniforms.gUdder.value.equals(udder0)).toBe(true);
      sc.dispose();
    }, 60000);
  }
});

describe('laver la vache en 3D', () => {
  for (const breed of ['holstein', 'highland']) {
    it(`${breed} : savonner tout le flanc (une passe), puis rincer à la douche : trois étoiles`, () => {
      const { a, sc } = makeStage({ species: 'cow', breed });
      sc.updateCamera(0);
      const ctx = ctxFor(a, sc);
      const game = cowWash3d.cowWash3dGame(ctx);
      run(ctx, game, sc, 0.5);
      expect(game.peek().cells).toBeGreaterThan(20);
      for (let y = 40; y <= 340 && game.peek().soaped < 0.9; y += 14) {
        game.down({ x: 0, y });
        for (let x = 6; x <= 400; x += 6) game.move({ x, y }, true);
        game.up();
      }
      const s = game.peek();
      expect(s.value).toBeGreaterThanOrEqual(s.lo);
      expect(s.value).toBeLessThanOrEqual(s.hi);
      ctx.pressStop();
      expect(game.peek().phase).toBe('rinse');
      game.key('Space', true);
      for (let i = 0; i < 300 && !ctx.done; i++) run(ctx, game, sc, 0.1);
      game.key('Space', false);
      expect(ctx.finished.why).toBe('just');
      game.destroy();
      sc.dispose();
    }, 60000);
  }
});

describe('la fermeture rend tout', () => {
  it('le décor, ses accessoires et le rendu sont libérés', () => {
    const { sc } = makeStage({ species: 'cow' });
    const r = sc.renderer;
    let decor = 0;
    const d0 = sc.decor.dispose;
    sc.decor.dispose = () => {
      decor++;
      d0();
    };
    sc.dispose();
    expect(decor).toBe(1);
    expect(r.calls.dispose).toBe(1);
  });
});
