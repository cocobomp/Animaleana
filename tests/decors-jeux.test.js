// Les deux jeux qui changent eux-mêmes de décor suivent l'heure, la météo et la saison du soin, et reçoivent les
// objets du jour : la balle de la chèvre dans le pré (goatPlay3d.js, paddock.js) et la longe au rond (lunge3d.js,
// roundPen.js). Le décor du soin leur passe de quoi s'habiller (decor.dress : care3d.js careDecor) ; à la fin, le décor
// du soin revient et tout ce qui a été ajouté est libéré.
//
// Ce qu'on regarde dans chaque cas : le ciel, le fond et la brume aux couleurs de l'heure ; le soleil (sa force, sa
// teinte, d'où il vient) ; le sol de la saison, mouillé, blanc ou sombre, et ce qui est posé dessus (piste, liseré,
// terre battue) avec lui ; l'animal jamais noyé dans la brume, même vu de loin au téléphone en portrait ; la nuit, la
// lumière du réverbère sur lui partout où il court, et rien de posé dans le réverbère ; les arbres et les fleurs de la
// saison ; et tout libéré, le décor du soin rendu tel quel.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as THREE from 'three';
import { careAmbience, hashSeed } from '../src/game/care/setting.js';
import { GRASS_TINT } from '../src/game/care/outdoor.js';
import { fakeCtx as fakeCtxOf } from './fixtures/careCtx.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';
import { loadFarm, farmStage, run } from './fixtures/farmStage.js';

let care3d;
let goatPlay;
let lunge3d;
let H;
beforeAll(async () => {
  await loadFarm();
  care3d = await import('../src/ui/minigames/care3d.js');
  goatPlay = await import('../src/ui/minigames/goatPlay3d.js');
  lunge3d = await import('../src/ui/minigames/lunge3d.js');
  const gltf = await loadRealHorseGltf();
  const horseReal = await import('../src/game/models/horseReal.js');
  horseReal.realHorseBase(gltf);
  H = {
    gltf, horseReal,
    t: (await import('../src/i18n.js')).t,
    stage: await import('../src/game/care/stage.js'),
    animal: await import('../src/sim/animal.js'),
    frame: await import('../src/ui/minigames/frame.js'),
  };
}, 180000);
afterEach(() => new Promise((resolve) => setImmediate(resolve)));

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const C = (c) => new THREE.Color(c);
/** Ce que careDecor donne au décor du soin (un jour, un animal, une ambiance). */
const dressOf = (amb, id = 'x1', species = 'goat', day = 4) => ({ amb, day, id, species, seed: hashSeed(`${day}|${id}`) % 100000, look: null });
/** Le décor habituel du soin, habillé comme dans le jeu (careDecor). */
const setOf = (species, place, amb, id, day = 4) => care3d.decorFor(species, place, { amb, kinds: [], seed: 1, dress: dressOf(amb, id, species, day) });

/** Deux couleurs presque égales. */
function sameColor(c, want, what) {
  expect(Math.abs(c.r - want.r) + Math.abs(c.g - want.g) + Math.abs(c.b - want.b), what).toBeLessThan(0.012);
}
/** Le milieu de l'animal. */
const mid = (sc) => new THREE.Box3().setFromObject(sc.model.coatMesh).getCenter(V());
/** La part de brume sur un point vu par la caméra (0 : net ; 1 : noyé). */
function fogOn(sc, p) {
  const f = sc.scene.fog;
  return (sc.camera.position.distanceTo(p) - f.near) / (f.far - f.near);
}
/** La lumière d'une lampe reçue en p (comme three.js : la baisse avec la distance, puis la coupure au loin). */
function lampAt(L, p) {
  const d = L.getWorldPosition(V()).distanceTo(p);
  let k = 1 / Math.max(d ** L.decay, 0.01);
  if (L.distance > 0) k *= Math.max(0, 1 - (d / L.distance) ** 4) ** 2;
  return L.userData.base * k;
}
/** Tout ce que le groupe a créé (géométries, matières, textures) ; la fonction rendue dit ce qui n'est pas libéré. */
function watchFreed(group) {
  const all = new Set();
  group.traverse((o) => {
    if (o.geometry && !o.isSprite) all.add(o.geometry);
    for (const m of [o.material].flat()) {
      if (!m) continue;
      all.add(m);
      for (const v of Object.values(m)) if (v?.isTexture) all.add(v);
    }
  });
  const freed = new Set();
  for (const x of all) x.addEventListener('dispose', () => freed.add(x));
  return () => [...all].filter((x) => !freed.has(x)).map((x) => x.type ?? x.constructor?.name);
}
/** Les rayons au sol des objets du jour (extras.js, SIZE) : rien ne se pose dans le réverbère. */
const RAD = { brouette: 0.75, botte: 0.5, poule: 0.35, sapin: 0.33, rocher: 0.3, papillon: 0.25, seau: 0.2, fourche: 0.2, arrosoir: 0.2, crabe: 0.18, amphore: 0.17, cadre: 0.16, lanterne: 0.15, fleurs: 0.14, pot: 0.13 };
function clearOfPost(items, post) {
  for (const it of items) {
    if (!it.at || it.path) continue;
    const d = Math.hypot(it.at.x - post.position.x, it.at.z - post.position.z);
    expect(d, `${it.kind} dans le réverbère`).toBeGreaterThan((RAD[it.kind] ?? 0.12) + 0.1);
  }
}
/** Le soleil du décor (la lumière qui fait les ombres). */
function sunOf(d) {
  let sun = null;
  d.group.traverse((o) => {
    if (o.isDirectionalLight && o.castShadow) sun = o;
  });
  return sun;
}
/** Les collines de la saison (avant pluie, neige ou nuit). */
const HILLS = { spring: 0x7c9f5c, summer: 0x7c9f5c, autumn: 0x9a9a5c, winter: 0x8c9a80 };

/**
 * Ce que l'ambiance a fait au décor d (le pré ou le rond) : ciel, fond, brume, soleil, sol, marques au sol, herbe sous
 * la neige, fleurs de la saison. sunBase : la force du soleil du décor ; nD : le nombre de pâquerettes d'un été.
 */
function checkLook(sc, d, amb, { sunBase, nD }) {
  // le ciel, le fond, la couleur de la brume : ceux de l'heure et du temps
  const pos = d.skyMesh.geometry.attributes.position;
  const col = d.skyMesh.geometry.attributes.color;
  let top = 0;
  let low = 0;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > pos.getY(top)) top = i;
    if (pos.getY(i) < pos.getY(low)) low = i;
  }
  sameColor(C().fromBufferAttribute(col, top), C(amb.skyTop), 'le haut du ciel');
  sameColor(C().fromBufferAttribute(col, low), C(amb.skyLow), 'le bas du ciel');
  sameColor(sc.scene.background, C(amb.skyLow), 'le fond');
  sameColor(sc.scene.fog.color, C(amb.skyLow).lerp(C(amb.skyTop), 0.3), 'la brume');
  // le soleil : sa force et sa teinte ; bas à gauche le matin, bas à droite le soir, haut à midi, la lune haute
  const sun = sunOf(d);
  expect(sun.intensity).toBeCloseTo(sunBase * Math.max(0.12, amb.sun), 3);
  sameColor(sun.color, C(0xfff0d2).lerp(C(amb.tint), 0.75), 'la teinte du soleil');
  const v = sun.position.clone().sub(sun.target.position);
  expect(Math.asin(v.y / v.length())).toBeCloseTo({ matin: 0.42, jour: 1, soir: 0.3, nuit: 0.95 }[amb.time], 2);
  if (amb.time === 'matin') expect(v.x).toBeLessThan(0);
  if (amb.time === 'soir') expect(v.x).toBeGreaterThan(0);
  // le sol de la saison, mouillé, blanc de neige, plus sombre la nuit ; les collines de même
  const k = (amb.wet ? 0.72 : 1) * (amb.time === 'nuit' ? 0.6 : 1);
  const snow = C(0xe6ecf2);
  sameColor(d.ground[0].color, (amb.snowy ? snow.clone() : C(GRASS_TINT[amb.season])).multiplyScalar(k), "l'herbe");
  sameColor(d.ground[d.ground.length - 1].color, (amb.snowy ? snow.clone() : C(HILLS[amb.season])).multiplyScalar(k), 'les collines');
  // ce qui est posé sur le sol (piste, liseré, terre battue) : assombri comme lui, la nuit et sous la pluie
  expect(d.groundMarks.length).toBeGreaterThan(0);
  for (const m of d.groundMarks) sameColor(m.color, C(0xffffff).multiplyScalar(k), 'une marque au sol');
  // l'herbe, les fleurs, la terre battue, le liseré : cachés sous la neige, visibles sinon
  d.group.traverse((o) => {
    if (o.userData?.grass) expect(o.visible).toBe(!amb.snowy);
  });
  // les pâquerettes de la saison : plus au printemps ; l'automne, des feuilles mortes rousses ; rien l'hiver
  const flowers = [];
  d.group.traverse((o) => {
    if (o.isInstancedMesh && o.userData.grass && o.geometry.type === 'CircleGeometry') flowers.push(o);
  });
  if (amb.season === 'winter') expect(flowers.length).toBe(0);
  else if (amb.season === 'autumn') {
    expect(flowers.length).toBe(1);
    expect(flowers[0].count).toBe(Math.round(nD * 0.6));
    expect(flowers[0].instanceColor).toBeTruthy();
    sameColor(C().fromBufferAttribute(flowers[0].instanceColor, 0), C(0xc8642c), 'une feuille morte');
  } else {
    expect(flowers.length).toBe(2);
    expect(flowers[0].count).toBe(Math.round(nD * (amb.season === 'spring' ? 1.4 : 1)));
  }
}

describe('la balle de la chèvre, dans le pré', () => {
  for (const [label, amb, o] of [
    ['la pluie, en automne', careAmbience({ hour: 13, weather: 'rain', season: 'autumn' })],
    ['la nuit, en été', careAmbience({ hour: 22.5, weather: 'clear', season: 'summer' })],
    ['la neige, en hiver', careAmbience({ hour: 12, weather: 'snow', season: 'winter' })],
    ['le brouillard, en portrait haut', careAmbience({ hour: 12, weather: 'fog', season: 'autumn' }), { w: 360, h: 740 }],
    ['le matin au printemps, depuis le pré, en paysage', careAmbience({ hour: 8, weather: 'clear', season: 'spring' }), { place: 'pre', w: 800, h: 400 }],
    ['le soir clair, chevreau', careAmbience({ hour: 19, weather: 'clear', season: 'summer' }), { young: true }],
  ]) {
    it(`${label} : le pré prend l'heure, le temps et la saison du soin, les objets du jour se posent hors du terrain ; la chèvrerie revient`, () => {
      const { sc, ctx } = farmStage({ species: 'goat', set: setOf('goat', o?.place ?? 'etable', amb, 'g1'), young: !!o?.young, w: o?.w, h: o?.h });
      const barn = sc.decor;
      const before = { fog: sc.scene.fog, bg: sc.scene.background, env: sc.scene.environmentIntensity };
      const game = goatPlay.goatPlay3dGame(ctx);
      const pre = sc.decor;
      expect(pre.kind).toBe('pre');
      expect(pre.ambience?.weather).toBe(amb.weather);
      expect(pre.ambience?.time).toBe(amb.time);
      expect(pre.ambience?.season).toBe(amb.season);
      const A = pre.ambienceParts;
      if (amb.wet) expect(A.rain).toBeTruthy();
      if (amb.snowy) expect(A.snow).toBeTruthy();
      run(ctx, game, sc, 1.5);
      checkLook(sc, pre, amb, { sunBase: 2.6, nD: 70 });
      // (la caméra voit tout le terrain de loin : la chèvre n'est pas plus dans la brume que dans un soin ordinaire)
      expect(fogOn(sc, mid(sc)), 'la chèvre dans la brume').toBeLessThan(0.2);
      const d = pre.dims;
      if (amb.lamp) {
        // le réverbère : contre la clôture du fond, hors du terrain où la balle roule
        expect(A.lampPost.position.z).toBeLessThan(d.z0 + 0.2);
        // sa lumière, partout où la chèvre court : bien plus que le ciel de nuit
        const y = mid(sc).y;
        for (const x of [d.x0 + 0.9, (d.x0 + d.x1) / 2, d.x1 - 0.9]) {
          for (const z of [d.back, (d.back + d.front) / 2, d.front]) expect(lampAt(A.lamp, V(x, y, z)), `lampe en ${x.toFixed(1)}, ${z.toFixed(1)}`).toBeGreaterThan(1.2);
        }
      }
      const X = pre.extras;
      expect(X).toBeTruthy();
      const placed = X.items.filter((i) => i.at && !i.path);
      expect(placed.length).toBeGreaterThan(0);
      // (hors du terrain de la balle : derrière ou à côté, jamais sur l'herbe où elle roule ; ni dans le réverbère)
      for (const it of placed) {
        const inYard = Math.abs(it.at.x - (d.x0 + d.x1) / 2) < d.halfW && it.at.z > d.back && it.at.z < d.front;
        expect(inYard, `${it.kind} sur le terrain`).toBe(false);
      }
      if (A.lampPost) clearOfPost(placed, A.lampPost);
      const left = watchFreed(pre.group);
      game.destroy();
      expect(sc.decor).toBe(barn);
      expect(barn.group.parent).toBe(sc.scene);
      expect(pre.group.parent).toBe(null);
      expect(sc.scene.fog).toBe(before.fog);
      expect(sc.scene.background).toBe(before.bg);
      expect(sc.scene.environmentIntensity).toBe(before.env);
      expect(left()).toEqual([]);
      sc.dispose();
    }, 60000);
  }

  it('la nuit, jour après jour : rien ne se pose dans le réverbère (son poteau, sa lanterne)', () => {
    const amb = careAmbience({ hour: 23, weather: 'clear', season: 'summer' });
    let n = 0;
    for (let day = 1; day <= 8; day++) {
      const { sc, ctx } = farmStage({ species: 'goat', set: setOf('goat', 'etable', amb, 'g1', day) });
      const game = goatPlay.goatPlay3dGame(ctx);
      run(ctx, game, sc, 1.5);
      const pre = sc.decor;
      const placed = pre.extras.items.filter((i) => i.at && !i.path);
      n += placed.length;
      clearOfPost(placed, pre.ambienceParts.lampPost);
      game.destroy();
      // (le pied du réverbère n'est noté que le temps de l'ambiance)
      expect(pre.avoid ?? []).toEqual([]);
      sc.dispose();
    }
    expect(n).toBeGreaterThan(8);
  }, 120000);

  it('sans ambiance (jeu ouvert sans le jeu complet) : le pré d\'avant, rien d\'ajouté', () => {
    const { sc, ctx } = farmStage({ species: 'goat' });
    const game = goatPlay.goatPlay3dGame(ctx);
    expect(sc.decor.kind).toBe('pre');
    expect(sc.decor.ambience).toBe(undefined);
    expect(sc.decor.extras).toBe(undefined);
    // (la brume du pré lui-même, l'herbe d'été, pas de lampe)
    expect(sc.scene.fog.near).toBe(14);
    sameColor(sc.decor.ground[0].color, C(GRASS_TINT.summer), "l'herbe");
    game.destroy();
    sc.dispose();
  });
});

describe('la longe et la liberté, au rond', () => {
  function horseStage(amb, { w = 358, h = 520, day = 4 } = {}) {
    const a = H.animal.createAnimal({ species: 'horse', breed: 'selle_francais', colorIndex: 0, ageDays: 900, seed: 77 });
    a.name = 'Honey';
    a.personality = 'calm';
    a.gear = { halter: { item: 'halter', color: 'red' } };
    const model = H.horseReal.buildRealHorseModel(H.animal.stageLook(a), a.breed, H.gltf);
    const set = amb ? setOf('horse', 'box', amb, 'h1', day) : care3d.decorFor('horse', 'box');
    const sc = new H.stage.CareStage({ a, renderer: H.stage.headlessRenderer(), model, set });
    const view = H.frame.fitView(w, h, 400, 360);
    return { a, sc, view, w, h };
  }
  /** Ouvre le jeu (la longe, ou la liberté) dans la scène, comme le cadre. */
  function open(make, st) {
    const ctx = fakeCtxOf(st.a, H.t, { scene: st.sc, view: st.view });
    const game = make(ctx);
    st.sc.resize(st.w, st.h, st.view);
    st.sc.ready = true;
    return { ctx, game };
  }
  function step(st, ctx, game, n, each = null) {
    for (let k = 0; k < n; k++) {
      ctx.time += 1 / 30;
      game.update(1 / 30);
      st.sc.update(1 / 30);
      each?.(k);
    }
  }

  for (const [label, amb, o] of [
    ['le soir sous la pluie, en automne', careAmbience({ hour: 20, weather: 'rain', season: 'autumn' })],
    ['la nuit, en été', careAmbience({ hour: 23, weather: 'clear', season: 'summer' })],
    ['le brouillard, en portrait haut', careAmbience({ hour: 9, weather: 'fog', season: 'autumn' }), { w: 360, h: 740 }],
    ['la neige, en hiver', careAmbience({ hour: 12, weather: 'snow', season: 'winter' })],
    ['le matin au printemps, en paysage', careAmbience({ hour: 8, weather: 'clear', season: 'spring' }), { w: 800, h: 400 }],
    ['le soir clair, en été', careAmbience({ hour: 19, weather: 'clear', season: 'summer' })],
    ['la liberté, la nuit sous la neige', careAmbience({ hour: 22, weather: 'snow', season: 'winter' }), { liberty: true }],
  ]) {
    it(`${label} : le rond prend l'heure, le temps et la saison du soin, la pluie tombe sur tout le rond, les objets dehors autour`, () => {
      const st = horseStage(amb, o);
      const { sc } = st;
      const stall = sc.decor;
      const before = { fog: sc.scene.fog, bg: sc.scene.background, env: sc.scene.environmentIntensity };
      const { ctx, game } = open(o?.liberty ? lunge3d.liberty3dGame : lunge3d.lunge3dGame, st);
      const pen = sc.decor;
      expect(pen.kind).toBe('roundPen');
      expect(pen.ambience?.weather).toBe(amb.weather);
      expect(pen.ambience?.season).toBe(amb.season);
      const A = pen.ambienceParts;
      const { F, R } = pen.dims;
      if (amb.wet) {
        // (les gouttes : sur tout le rond, la caméra en fait le tour)
        const p = A.rain.geometry.attributes.position;
        let x0 = Infinity;
        let x1 = -Infinity;
        for (let i = 0; i < p.count; i++) {
          x0 = Math.min(x0, p.getX(i));
          x1 = Math.max(x1, p.getX(i));
        }
        expect(x0).toBeLessThan(-F);
        expect(x1).toBeGreaterThan(F);
      }
      if (amb.snowy) expect(A.snow).toBeTruthy();
      // (la brume plus loin que dans un petit décor : on voit encore la clôture d'en face)
      expect(sc.scene.fog.far).toBeGreaterThan(2 * F);
      // le cheval tourne : jamais dans la brume ; la nuit, toujours dans la lumière du réverbère
      let fogMax = -Infinity;
      let lampMin = Infinity;
      step(st, ctx, game, 45, (k) => {
        if (k < 15 || k % 5) return;
        const c = mid(sc);
        fogMax = Math.max(fogMax, fogOn(sc, c));
        if (A.lamp) lampMin = Math.min(lampMin, lampAt(A.lamp, c));
      });
      expect(fogMax, 'le cheval dans la brume').toBeLessThan(0.2);
      checkLook(sc, pen, amb, { sunBase: 2.5, nD: 90 });
      // les arbres de la saison : l'hiver, nus ou des sapins, plus une couronne ronde ; sinon feuillus
      const trees = { crowns: 0, firs: 0, branches: 0 };
      pen.group.traverse((x) => {
        if (!x.isInstancedMesh) return;
        if (x.geometry.type === 'IcosahedronGeometry') trees.crowns += x.count;
        if (x.geometry.type === 'ConeGeometry') trees.firs += x.count;
        if (x.geometry.parameters?.radiusTop === 0.03) trees.branches += x.count;
      });
      if (amb.season === 'winter') {
        expect(trees.crowns).toBe(0);
        expect(trees.firs).toBeGreaterThan(5);
        expect(trees.branches).toBeGreaterThan(20);
      } else {
        expect(trees.crowns).toBeGreaterThan(40);
        expect(trees.firs + trees.branches).toBe(0);
      }
      if (amb.lamp) {
        // le réverbère dehors ; sa lumière tout le tour de la piste, et sur le cheval qui tourne ; l'enfant au milieu
        // pas éblouie
        expect(Math.hypot(A.lampPost.position.x, A.lampPost.position.z)).toBeGreaterThan(F);
        const y = mid(sc).y;
        let ring = Infinity;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          ring = Math.min(ring, lampAt(A.lamp, V(Math.cos(a) * R, y, Math.sin(a) * R)));
        }
        expect(ring, 'la lampe sur la piste').toBeGreaterThan(1.2);
        expect(lampMin, 'la lampe sur le cheval').toBeGreaterThan(1.2);
        expect(lampAt(A.lamp, V(0, 1.3, 0))).toBeLessThan(ring * 1.3);
      }
      const placed = pen.extras.items.filter((i) => i.at);
      expect(placed.length).toBeGreaterThan(0);
      for (const it of placed) {
        // (dehors, au pied de la clôture, ou dessus : jamais sur la piste)
        expect(Math.hypot(it.at.x, it.at.z), it.kind).toBeGreaterThan(F - 0.2);
      }
      if (A.lampPost) clearOfPost(placed, A.lampPost);
      const left = watchFreed(pen.group);
      game.destroy();
      expect(sc.decor).toBe(stall);
      expect(pen.group.parent).toBe(null);
      expect(sc.scene.fog).toBe(before.fog);
      expect(sc.scene.background).toBe(before.bg);
      expect(sc.scene.environmentIntensity).toBe(before.env);
      expect(left()).toEqual([]);
      sc.dispose();
    }, 90000);
  }

  it('la nuit, jour après jour : rien ne se pose dans le réverbère du rond', () => {
    const amb = careAmbience({ hour: 23, weather: 'clear', season: 'summer' });
    for (let day = 1; day <= 6; day++) {
      const st = horseStage(amb, { day });
      const { ctx, game } = open(lunge3d.lunge3dGame, st);
      step(st, ctx, game, 3);
      const pen = st.sc.decor;
      clearOfPost(pen.extras.items.filter((i) => i.at), pen.ambienceParts.lampPost);
      game.destroy();
      st.sc.dispose();
    }
  }, 120000);

  it("sans ambiance (jeu ouvert sans le jeu complet) : le rond d'avant, rien d'ajouté", () => {
    const st = horseStage(null);
    const { ctx, game } = open(lunge3d.lunge3dGame, st);
    const pen = st.sc.decor;
    expect(pen.kind).toBe('roundPen');
    expect(pen.ambience).toBe(undefined);
    expect(pen.extras).toBe(undefined);
    step(st, ctx, game, 10);
    // (la brume du rond lui-même ; ni pluie, ni lampe ; l'herbe d'été)
    expect(st.sc.scene.fog.near).toBeCloseTo(pen.dims.F * 2.4 + 10, 5);
    let lamp = false;
    pen.group.traverse((o) => {
      if (o.isPointLight) lamp = true;
    });
    expect(lamp).toBe(false);
    sameColor(pen.ground[0].color, C(GRASS_TINT.summer), "l'herbe");
    game.destroy();
    st.sc.dispose();
  }, 60000);
});

describe('les objets du jour au rond et au pré : à leur place (sans caméra fixe pour la longe)', () => {
  it('au rond, les places sont toutes dehors ou sur la clôture, tournées vers le milieu', async () => {
    const { roundPenSet } = await import('../src/game/care/roundPen.js');
    const pen = roundPenSet({ high: false }, { R: 3.4, F: 4.6, u: 1, L: 2.4 });
    expect(pen.spots.length).toBeGreaterThan(20);
    for (const s of pen.spots) {
      const r = Math.hypot(s.p[0], s.p[2]);
      expect(r).toBeGreaterThan(4.6 - 0.2);
      // (face : son devant regarde vers le milieu du rond, ou le long de la clôture pour les perchés)
      const f = new THREE.Vector3(Math.sin(s.face), 0, Math.cos(s.face));
      const toC = new THREE.Vector3(-s.p[0], 0, -s.p[2]).normalize();
      if (s.kind === 'floor' || s.kind === 'hang') expect(f.dot(toC)).toBeGreaterThan(0.9);
    }
    pen.dispose();
  });
});
