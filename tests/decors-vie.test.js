// Un peu de vie dans les gros plans : quand le sol n'est presque pas dans l'image (la friandise du cheval, la bride, le
// maréchal, le chat à la maison, le lapin, le mouton à l'étable), le décor ajoute des choses accrochées là où on voit
// le mur (un fer, un licol, une cloche, deux tableaux, une botte de carottes), un rouge-gorge, une souris, un
// escargot, un vol d'oiseaux loin derrière, une hirondelle sous le toit (setting.js : pickLife ; extras.js :
// placeExtras). Quand le jeu recadre, ce qui n'a plus sa place s'en va et revient ailleurs. Jamais devant l'animal, sa
// tête, sa bouche, ni ce qu'on lui tend, à aucun moment, en portrait comme en paysage.
//
// Les parties sont jouées en entier, avec ce que le jeu a posé lui-même (rien n'est reposé après coup), et chaque
// image est vérifiée par des rayons, la copie figée de l'animal refaite à chaque fois.
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import * as THREE from 'three';
import { pickLife, lifeOff, LIFE_OF, EXTRAS, careAmbience, pickExtras, extrasPlace } from '../src/game/care/setting.js';
import { extraModel, extraSize, extraRange } from '../src/game/care/extras.js';
import { bag } from '../src/game/care/barnProps.js';
import { fakeCtx as fakeCtxOf, fakeDocument } from './fixtures/careCtx.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

const random = Math.random;
afterAll(() => {
  Math.random = random;
});

/** Le même hasard à chaque fois : la vie de l'animal, donc la caméra, ne dépend pas des tests d'avant. */
function sameLuck(seed0) {
  let seed = seed0;
  Math.random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const AMB = {
  jour: { hour: 10, weather: 'clear', season: 'summer' },
  nuit: { hour: 23, weather: 'clear', season: 'summer' },
  pluie: { hour: 15, weather: 'rain', season: 'autumn' },
  neige: { hour: 11, weather: 'snow', season: 'winter' },
};
const FLY = new Set(['vol', 'papillons', 'hirondelle']);
const SPECIES_OF = { box: ['horse'], etable: ['cow', 'sheep', 'goat'], pre: ['horse', 'cow'], ailleurs: ['horse', 'dog'], maison: ['dog', 'cat'], jardin: ['dog', 'cat'], clapier: ['rabbit'], enclos: ['rabbit'] };

describe('le petit plus de chaque lieu (pur)', () => {
  it('le même jour, la même liste ; tous connus ; les deux tableaux de la maison restent deux', () => {
    for (const place of Object.keys(LIFE_OF)) {
      for (let day = 1; day <= 10; day++) {
        const a = pickLife({ day, id: 'h1', place, species: 'horse' });
        expect(a).toEqual(pickLife({ day, id: 'h1', place, species: 'horse' }));
        for (const k of a) expect(EXTRAS[k], k).toBeTruthy();
        // (pas de doublon, sauf ceux que le lieu veut : la maison a deux tableaux, de part et d'autre de la porte-fenêtre)
        for (const k of new Set(a)) expect(a.filter((x) => x === k).length, `${place} ${k}`).toBe(LIFE_OF[place].filter((x) => x === k).length);
      }
    }
    expect(pickLife({ place: 'maison', species: 'cat' }).filter((k) => k === 'cadre').length).toBe(2);
    expect(pickLife({ place: 'pre', taken: ['vol'] })).not.toContain('vol');
    // (le licol : seulement pour un cheval)
    expect(pickLife({ place: 'box', species: 'horse' })).toContain('licol');
    expect(pickLife({ place: 'box', species: 'goat' })).not.toContain('licol');
    // (en voyage : la liste d'« ailleurs », quelle que soit la famille du lieu)
    expect(pickLife({ place: 'ailleurs-plage' }).sort()).toEqual(pickLife({ place: 'ailleurs' }).sort());
  });

  it('la nuit, sous la pluie, sous la neige : rien ne vole, mais partout il reste quelque chose, même au clapier', () => {
    const night = careAmbience(AMB.nuit);
    expect([...lifeOff(night)].sort()).toEqual(['hirondelle', 'papillons', 'poulailler', 'rougegorge', 'vol']);
    for (const [place, list] of Object.entries(SPECIES_OF)) {
      for (const species of list) {
        for (const key of ['nuit', 'pluie', 'neige']) {
          const amb = careAmbience(AMB[key]);
          const life = pickLife({ place, amb, species, day: 3, id: 'x' });
          expect(life.length, `${place} ${species} ${key}`).toBeGreaterThan(0);
          if (key === 'nuit') for (const k of life) expect(['vol', 'poulailler', 'hirondelle', 'papillons', 'rougegorge']).not.toContain(k);
          if (key !== 'nuit') expect(life).not.toContain('vol');
          // (il en reste une qui ne vole pas, qu'on peut voir en gros plan : accrochée, ou toute petite par terre)
          expect(life.some((k) => !FLY.has(k)), `${place} ${species} ${key}`).toBe(true);
        }
      }
    }
    // (le lapin la nuit : la botte de carottes, l'escargot, le nichoir)
    for (const place of ['clapier', 'enclos']) expect(pickLife({ place, amb: night, species: 'rabbit' }).sort()).toEqual(['carottes', 'escargot', 'nichoir']);
  });

  it("les hirondelles sont parties à l'automne et l'hiver ; l'escargot dort l'hiver", () => {
    for (const place of ['box', 'etable']) {
      expect(pickLife({ place, species: 'horse', amb: careAmbience({ hour: 11, season: 'summer' }) })).toContain('hirondelle');
      expect(pickLife({ place, species: 'horse', amb: careAmbience({ hour: 11, season: 'spring' }) })).toContain('hirondelle');
      for (const season of ['autumn', 'winter']) {
        const life = pickLife({ place, species: 'horse', amb: careAmbience({ hour: 11, weather: 'clear', season }) });
        expect(life, `${place} ${season}`).not.toContain('hirondelle');
        expect(life.length).toBeGreaterThan(0);
      }
      expect(pickLife({ place, species: 'horse', amb: careAmbience(AMB.neige) })).not.toContain('hirondelle');
    }
    expect(pickLife({ place: 'clapier', amb: careAmbience({ hour: 11, season: 'winter' }) })).not.toContain('escargot');
  });
});

describe('ce qui bouge tient toute sa course dans la place vérifiée', () => {
  it('la poule, le papillon, la souris, l\'escargot, le crabe : jamais plus loin de leur place que leur taille', () => {
    const keep = bag();
    const b = new THREE.Box3();
    for (const kind of ['poule', 'papillon', 'souris', 'escargot', 'crabe']) {
      const m = extraModel(kind, keep, 3);
      // (la course que le jeu lui donne)
      if (extraRange(kind)) m.userData.range = extraRange(kind);
      const [rad, h] = extraSize(kind);
      let far = 0;
      let top = 0;
      let low = 0;
      for (let t = 0; t < 25; t += 0.05) {
        m.userData.step(0.05);
        m.updateMatrixWorld(true);
        m.traverse((o) => {
          if (!o.isMesh) return;
          o.geometry.computeBoundingBox();
          b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
          for (const x of [b.min.x, b.max.x]) for (const z of [b.min.z, b.max.z]) far = Math.max(far, Math.hypot(x, z));
          top = Math.max(top, b.max.y);
          low = Math.min(low, b.min.y);
        });
      }
      expect(far, `${kind} : sa course`).toBeLessThanOrEqual(rad + 0.01);
      expect(top, `${kind} : sa hauteur`).toBeLessThanOrEqual(h + 0.01);
      expect(low, `${kind} : sous sa place`).toBeGreaterThan(-0.01);
    }
    keep.dispose();
  });
});

// ---------------------------------------------------------------- les parties jouées en entier

const rc = new THREE.Raycaster();
const shown = (o) => {
  for (let q = o; q; q = q.parent) if (q.visible === false) return false;
  return true;
};

/** Les objets du jour posés et visibles en ce moment. */
const liveItems = (X) => (X?.items ?? []).filter((it) => it.at && it.m.visible && it.m.parent);

/** Les objets du jour entre la caméra et ce point (repère monde). */
function blockers(sc, X, P) {
  const cam = sc.camera.position;
  const dir = P.clone().sub(cam);
  const d = dir.length();
  rc.set(cam.clone(), dir.normalize());
  rc.near = 0.01;
  rc.far = d - 0.01;
  const out = [];
  for (const it of liveItems(X)) if (rc.intersectObject(it.m, true).some((h) => h.object.isMesh && shown(h.object))) out.push(it.kind);
  return out;
}

/** Des points d'un objet : le milieu de sa boîte et ses coins, un peu rentrés (rien s'il n'a rien à montrer). */
function boxPoints(o) {
  o.updateWorldMatrix(true, true);
  const b = new THREE.Box3();
  o.traverseVisible((m) => {
    if (!m.isMesh || !m.geometry) return;
    // (les croquettes qui tombent, les brins : leurs copies, là où elles sont)
    if (m.isInstancedMesh) {
      m.computeBoundingBox();
      b.union(m.boundingBox.clone().applyMatrix4(m.matrixWorld));
      return;
    }
    m.geometry.computeBoundingBox();
    b.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
  });
  if (b.isEmpty() || b.getSize(new THREE.Vector3()).length() < 0.005) return [];
  const c = b.getCenter(new THREE.Vector3());
  const out = [c];
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) out.push(new THREE.Vector3(x, y, z).lerp(c, 0.25));
  return out;
}

/** Des points de la peau d'un objet du jour qui ont la peau de l'animal derrière eux (l'objet le cache). */
function overCoat(sc, it) {
  const cam = sc.camera.position;
  let n = 0;
  it.m.traverse((o) => {
    if (!o.isMesh || !shown(o)) return;
    const pos = o.geometry.attributes.position;
    const stride = Math.max(1, Math.floor(pos.count / 6));
    for (let i = 0; i < pos.count; i += stride) {
      const B = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const dir = B.clone().sub(cam);
      const d = dir.length();
      sc.proxy.ray.ray.set(cam, dir.normalize());
      const h = sc.proxy.ray.intersectObject(sc.proxy.mesh, false)[0];
      if (h && h.distance > d + 0.01) n++;
    }
  });
  return n;
}

/**
 * Joue la partie en entier (steps : [secondes, étape, ce qu'on fait à la fin]) puis la carte de fin, et vérifie chaque
 * image. head() : les points de sa tête et de sa bouche ; offered() : ce qu'on lui tend. Renvoie le bilan.
 */
function playAll(sc, ctx, game, steps, { head, offered, headRect = null }) {
  const X = sc.decor.extras;
  const rep = { bad: [], phases: {}, kinds: new Set(), first: null, frames: 0, fixed: 0 };
  // (la vue du moment : le téléphone peut tourner en pleine partie)
  const inImage = (q) => {
    const v = sc.view;
    return !q.behind && q.x > v.x0 && q.x < v.x1 && q.y > v.y0 && q.y < v.y1;
  };
  let k = 0;
  const check = (phase) => {
    k++;
    if (!X) return;
    const live = liveItems(X);
    for (const it of live) rep.kinds.add(it.kind);
    if (rep.first === null && live.length) rep.first = phase;
    if (rep.first === null) return;
    // (de quoi voir : une chose qui ne vole pas, posée, dans l'image)
    const fixed = live.some((it) => !it.path && it.grow > 0.3 && inImage(sc.project(new THREE.Box3().setFromObject(it.m).getCenter(new THREE.Vector3()))));
    const P = (rep.phases[phase] ??= { n: 0, fixed: 0 });
    P.n++;
    rep.frames++;
    if (fixed) {
      P.fixed++;
      rep.fixed++;
    }
    // (une image sur quatre, un cinquième de seconde : ce qui est posé bouge à peine entre deux)
    if (k % 4) return;
    sc.scene.updateMatrixWorld(true);
    sc.proxy.bake();
    sc.proxy.at = sc.time;
    for (const p of head()) for (const b of blockers(sc, X, p)) rep.bad.push(`${b} devant sa tête (${phase})`);
    for (const [name, o] of offered()) for (const p of boxPoints(o)) for (const b of blockers(sc, X, p)) rep.bad.push(`${b} devant ${name} (${phase})`);
    for (const it of live) {
      if (it.path) {
        // (ce qui vole : derrière lui, jamais en travers de son visage)
        const cam = sc.camera.position;
        for (const bd of it.m.children) {
          const B = bd.getWorldPosition(new THREE.Vector3());
          const dir = B.clone().sub(cam);
          const d = dir.length();
          sc.proxy.ray.ray.set(cam, dir.normalize());
          const h = sc.proxy.ray.intersectObject(sc.proxy.mesh, false)[0];
          if (h && h.distance > d) rep.bad.push(`${it.kind} devant lui (${phase})`);
        }
        const r = headRect?.();
        const q = sc.project(it.m.position);
        if (r && q.x > r.x0 && q.x < r.x1 && q.y > r.y0 && q.y < r.y1) rep.bad.push(`${it.kind} en travers de son visage (${phase})`);
      } else if (k % 16 === 0 && overCoat(sc, it)) rep.bad.push(`${it.kind} sur lui (${phase})`);
    }
  };
  const dt = 1 / 20;
  for (const [s, phase, fn] of steps) {
    for (let i = 0; i < s / dt; i++) {
      ctx.time += dt;
      game.update(dt);
      sc.update(dt);
      check(phase);
    }
    fn?.();
  }
  return rep;
}

/** Les étapes d'une partie, comme un enfant la joue. */
function stepsOf(which, ctx, game, sc) {
  const press = () => ctx.buttons.find((b) => b.opts.cls?.includes('stop'))?.opts.onTap();
  // (la carte de fin : elle couvre le bas, la scène se recadre au-dessus)
  const card = [[3, 'carte', null]];
  const toCard = () => sc.setFocus(0, sc.size.h * 0.5);
  if (which === 'feed-horse') return [[4, 'foin', () => game.down()], [3.2, 'foin', () => game.up()], [0.1, 'foin', press], [1, 'granulés', () => game.down()], [0.9, 'granulés', () => game.up()], [0.1, 'granulés', press], [8, 'mange', toCard], ...card];
  if (which === 'feed') return [[4, 'attend', () => game.down?.({ x: 200, y: 180 })], [2.5, 'verse', () => game.up?.({ x: 200, y: 180 })], [0.2, 'verse', press], [8, 'mange', toCard], ...card];
  if (which === 'treat') {
    const out = [[4, 'attend', null]];
    for (let i = 0; i < 6; i++) out.push([3, 'donne', () => {
      if (game.peek?.().state === 'calm') ctx.buttons.filter((b) => !b.opts.cls?.includes('stop'))[i % 2]?.opts.onTap();
    }]);
    out.push([0.1, 'donne', () => { press(); toCard(); }], ...card);
    return out;
  }
  return [[12, 'soin', toCard], ...card];
}

describe('les gros plans du cheval : de la vie tout au long du jeu, jamais devant lui', () => {
  let H;
  beforeAll(async () => {
    fakeDocument();
    const gltf = await loadRealHorseGltf();
    const horseReal = await import('../src/game/models/horseReal.js');
    horseReal.realHorseBase(gltf);
    H = {
      gltf, horseReal,
      t: (await import('../src/i18n.js')).t,
      stage: await import('../src/game/care/stage.js'),
      animal: await import('../src/sim/animal.js'),
      frame: await import('../src/ui/minigames/frame.js'),
      care3d: await import('../src/ui/minigames/care3d.js'),
      headFrame: await import('../src/ui/minigames/headFrame.js'),
    };
  }, 180000);
  afterEach(() => new Promise((resolve) => setImmediate(resolve)));

  function horsePlay({ game: which, place, w, h, amb: ambKey, day, look = null, turn = null }) {
    sameLuck(4242 + day);
    const amb = careAmbience(AMB[ambKey]);
    const a = H.animal.createAnimal({ species: 'horse', breed: 'selle_francais', colorIndex: 0, ageDays: 900, seed: 77 });
    a.name = 'Honey';
    a.id = 'h-vie';
    for (const k in a.needs) a.needs[k] = 25;
    const kinds = pickExtras({ day, id: a.id, place: extrasPlace(place, look), species: 'horse', amb, n: 3 });
    const life = pickLife({ day, id: a.id, place, amb, species: 'horse', taken: kinds });
    const model = H.horseReal.buildRealHorseModel(H.animal.stageLook(a), a.breed, H.gltf);
    const sc = new H.stage.CareStage({ a, renderer: H.stage.headlessRenderer(), model, set: H.care3d.decorFor('horse', place, { amb, kinds, life, seed: 11 + day, look }) });
    const view = H.frame.fitView(w, h, 400, 360);
    sc.resize(w, h, view);
    sc.ready = true;
    for (const act of Object.values(model.anim?.actions ?? {})) act.time = 0;
    const ctx = fakeCtxOf(a, H.t, { scene: sc, view });
    const before = new Set(sc.scene.children);
    const game = H.care3d.CARE3D_GAMES.horse[which](ctx);
    const own = sc.scene.children.filter((c) => !before.has(c) && !c.isLight);
    const shape = H.headFrame.headShape(sc);
    const head = () => [...shape.points(0.12), sc.live('muzzle'), sc.live('nose')].filter(Boolean);
    const offered = () => {
      const out = Object.entries(sc.decor.props ?? {}).filter(([, p]) => p?.group?.visible && p.group.parent).map(([k, p]) => [k, p.group]);
      for (const o of own) if (o.visible && o.parent) out.push([o.name || o.type, o]);
      return out;
    };
    const headRect = () => {
      const q = shape.points(0).map((p) => sc.project(p));
      return { x0: Math.min(...q.map((p) => p.x)), x1: Math.max(...q.map((p) => p.x)), y0: Math.min(...q.map((p) => p.y)), y1: Math.max(...q.map((p) => p.y)) };
    };
    const steps = stepsOf(which === 'feed' ? 'feed-horse' : which, ctx, game, sc);
    // (le téléphone tourné en pleine partie : la scène se recadre dans l'autre sens)
    if (turn) {
      const [tw, th] = turn;
      steps[0] = [steps[0][0], steps[0][1], () => {
        const v2 = H.frame.fitView(tw, th, 400, 360);
        ctx.view = v2;
        sc.resize(tw, th, v2);
      }];
    }
    const rep = playAll(sc, ctx, game, steps, { head, offered, headRect });
    if (process.env.DBG) console.log(which, place, w, ambKey, day, JSON.stringify(rep.phases), [...rep.kinds], rep.bad.slice(0, 5));
    game.destroy();
    sc.dispose();
    return rep;
  }

  const share = (r, phase = null) => (phase ? r.phases[phase].fixed / r.phases[phase].n : r.fixed / Math.max(1, r.frames));

  // [jeu, lieu, largeur, hauteur, ambiance, jour, famille du voyage, part du temps avec une chose posée à voir, étape,
  // le téléphone tourné après la première étape]
  const CASES = [
    // (nourrir au box en portrait : le fer sortait de l'image dès que la caméra se rapprochait de la mangeoire)
    ['feed', 'box', 390, 600, 'jour', 6, null, 0.6, 'mange'],
    // (la friandise au box, la nuit : rien de toute la partie)
    ['treat', 'box', 390, 600, 'nuit', 1, null, 0.6, null],
    // (le même jour, l'hirondelle filait derrière son visage pendant qu'on tendait la carotte)
    ['treat', 'box', 390, 600, 'jour', 4, null, 0.6, null],
    ['bridle', 'box', 390, 600, 'jour', 3, null, 0.5, null],
    ['shoe', 'box', 390, 600, 'jour', 1, null, 0.5, null],
    ['feed', 'box', 844, 390, 'nuit', 8, null, 0.8, 'mange'],
    ['feed', 'pre', 390, 600, 'jour', 3, null, 0.6, null],
    ['treat', 'ailleurs', 390, 600, 'jour', 2, 'plage', 0.5, null],
    ['feed', 'box', 390, 600, 'neige', 3, null, 0.5, null],
    ['water', 'pre', 844, 390, 'pluie', 5, null, 0.5, null],
    ['treat', 'box', 390, 600, 'jour', 2, null, 0.6, null, [844, 390]],
    ['feed', 'box', 844, 390, 'jour', 4, null, 0.6, null, [390, 600]],
  ];
  for (const [game, place, w, h, amb, day, look, min, phase, turn] of CASES) {
    it(`${game} ${place}${look ? ` (${look})` : ''} ${w} × ${h}${turn ? ` puis ${turn[0]} × ${turn[1]}` : ''}, ${amb}, jour ${day} : une chose posée à voir, jamais devant lui`, () => {
      const r = horsePlay({ game, place, w, h, amb, day, look, turn });
      expect(r.bad, r.bad.slice(0, 6).join(' ; ')).toEqual([]);
      expect(r.first, 'rien de posé de toute la partie').not.toBeNull();
      expect(share(r), JSON.stringify(r.phases)).toBeGreaterThanOrEqual(min);
      if (phase) expect(share(r, phase), `${phase} : ${JSON.stringify(r.phases)}`).toBeGreaterThanOrEqual(min);
      if (amb === 'neige') for (const k of ['hirondelle', 'papillons', 'papillon', 'vol']) expect([...r.kinds]).not.toContain(k);
      if (amb === 'nuit') for (const k of ['hirondelle', 'papillons', 'vol', 'rougegorge', 'poulailler']) expect([...r.kinds]).not.toContain(k);
    }, 120000);
  }
});

describe('les gros plans du chat, du chien, du lapin, du mouton et de la vache', () => {
  let P;
  let F;
  let care3d;
  beforeAll(async () => {
    P = await import('./fixtures/petStage.js');
    await P.loadPets();
    F = await import('./fixtures/farmStage.js');
    await F.loadFarm();
    care3d = await import('../src/ui/minigames/care3d.js');
  }, 240000);
  afterEach(() => new Promise((resolve) => setImmediate(resolve)));

  function play({ species, breed, place, game: which, w, h, amb: ambKey, day }) {
    sameLuck(4242 + day);
    const amb = careAmbience(AMB[ambKey]);
    const id = `${species}-vie`;
    const kinds = pickExtras({ day, id, place, species, amb, n: 3 });
    const life = pickLife({ day, id, place, amb, species, taken: kinds });
    const set = care3d.decorFor(species, place, { amb, kinds, life, seed: 5 + day });
    let a;
    let sc;
    let ctx;
    if (['dog', 'cat', 'rabbit'].includes(species)) {
      ({ a, sc } = P.makePetStage({ species, breed, set, w, h }));
      ctx = P.ctxFor(a, sc, w, h);
    } else ({ a, sc, ctx } = F.farmStage({ species, set, w, h }));
    const before = new Set(sc.scene.children);
    const game = care3d.CARE3D_GAMES[species][which](ctx);
    const own = () => sc.scene.children.filter((c) => !before.has(c) && !c.isLight && c.visible);
    const head = () => [sc.live('muzzle'), sc.live('head'), sc.live('nose'), sc.live('poll'), ...(sc.marks.ears ?? [])].filter(Boolean);
    const offered = () => {
      const out = Object.entries(sc.decor.props ?? {}).filter(([, p]) => p?.group?.visible && p.group.parent).map(([k, p]) => [k, p.group]);
      for (const o of own()) out.push([o.name || o.type, o]);
      return out;
    };
    const rep = playAll(sc, ctx, game, stepsOf(which, ctx, game, sc), { head, offered });
    if (process.env.DBG) console.log(species, place, which, w, ambKey, day, JSON.stringify(rep.phases), [...rep.kinds], rep.bad.slice(0, 5));
    rep.decor = sc.decor;
    game.destroy();
    sc.dispose();
    return rep;
  }

  const CASES = [
    // (le chat à la maison en portrait : rien, six jours sur six)
    ['cat', 'europeen', 'maison', 'feed', 390, 600, 'jour', 2, 0.6],
    ['cat', 'europeen', 'maison', 'treat', 390, 600, 'nuit', 1, 0.6],
    ['dog', 'labrador', 'maison', 'treat', 390, 600, 'jour', 3, 0.6],
    // (le lapin la nuit : plus rien ne pouvait vivre)
    ['rabbit', 'nain', 'clapier', 'treat', 390, 600, 'nuit', 3, 0.5],
    ['rabbit', 'nain', 'enclos', 'treat', 390, 600, 'pluie', 2, 0.5],
    // (le mouton à l'étable en portrait : rien, six jours sur six)
    ['sheep', null, 'etable', 'treat', 390, 600, 'jour', 1, 0.5],
    // (la vache à l'étable : une poule passait devant le râtelier)
    ['cow', null, 'etable', 'feed', 844, 390, 'jour', 1, 0.5],
  ];
  for (const [species, breed, place, game, w, h, amb, day, min] of CASES) {
    it(`${species} (${place}) ${game} ${w} × ${h}, ${amb}, jour ${day} : une chose posée à voir, jamais devant lui`, () => {
      const r = play({ species, breed, place, game, w, h, amb, day });
      expect(r.bad, r.bad.slice(0, 6).join(' ; ')).toEqual([]);
      expect(r.first, 'rien de posé de toute la partie').not.toBeNull();
      expect(r.fixed / Math.max(1, r.frames), JSON.stringify(r.phases)).toBeGreaterThanOrEqual(min);
      if (species === 'cow') {
        // (la poule et sa promenade : jamais dans la boîte du râtelier)
        const hen = r.decor.extras?.items.find((i) => i.kind === 'poule');
        const rack = r.decor.props?.rack?.group;
        if (hen?.at && rack) {
          const rb = new THREE.Box3().setFromObject(rack);
          const [rad] = extraSize('poule');
          expect(rb.intersectsBox(new THREE.Box3(hen.at.clone().addScalar(-rad), hen.at.clone().addScalar(rad)))).toBe(false);
        }
      }
    }, 120000);
  }
});

describe('tout est libéré à la fermeture', () => {
  it('les objets du jour, leurs géométries et leurs matières', async () => {
    fakeDocument();
    const P = await import('./fixtures/petStage.js');
    await P.loadPets();
    const care3d = await import('../src/ui/minigames/care3d.js');
    const amb = careAmbience(AMB.nuit);
    const life = pickLife({ place: 'clapier', amb, species: 'rabbit', day: 3, id: 'r' });
    const { a, sc } = P.makePetStage({ species: 'rabbit', breed: 'nain', set: care3d.decorFor('rabbit', 'clapier', { amb, kinds: ['seau'], life, seed: 3 }) });
    const ctx = P.ctxFor(a, sc);
    const game = care3d.CARE3D_GAMES.rabbit.treat(ctx);
    P.run(ctx, game, sc, 6, 1 / 20);
    const X = sc.decor.extras;
    const geos = new Set();
    X.group.traverse((o) => o.geometry && geos.add(o.geometry));
    expect(geos.size).toBeGreaterThan(0);
    let freed = 0;
    for (const g of geos) g.addEventListener('dispose', () => freed++);
    game.destroy();
    sc.dispose();
    expect(X.group.parent).toBeNull();
    expect(freed).toBe(geos.size);
  }, 120000);
});
