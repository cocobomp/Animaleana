// Dans chaque lieu (le box et le pré, l'étable et le pré, la maison et le jardin, le clapier et l'enclos), la
// nourriture et l'eau sont dans le bon récipient et à portée de sa bouche : scènes construites pour de vrai sans
// navigateur (faux rendu, vrais modèles), avec le décor du lieu (decorFor, src/ui/minigames/care3d.js).
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import * as THREE from 'three';
import { fakeCtx as fakeCtxOf, fakeDocument } from './fixtures/careCtx.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';
import { loadFarm, farmStage } from './fixtures/farmStage.js';
import { loadPets, makePetStage } from './fixtures/petStage.js';

let H;
let decorFor;
let careAmbience;
let pet3d;
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
  };
  await loadFarm();
  await loadPets();
  ({ decorFor } = await import('../src/ui/minigames/care3d.js'));
  ({ careAmbience } = await import('../src/game/care/setting.js'));
  pet3d = await import('../src/ui/minigames/pet3d.js');
}, 180000);

const random = Math.random;
beforeEach(() => {
  let seed = 9876;
  Math.random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
});
afterAll(() => {
  Math.random = random;
});
// (rend la main à la boucle d'événements entre deux tests : voir tests/pets3dStage.test.js)
afterEach(() => new Promise((resolve) => setImmediate(resolve)));

const amb = () => careAmbience({ hour: 11, weather: 'clear', season: 'summer' });

function horseStage({ breed = 'selle_francais', foal = false, place = 'box' } = {}) {
  const a = H.animal.createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: foal ? 7 : 900, seed: 77 });
  a.name = 'Honey';
  const model = H.horseReal.buildRealHorseModel(H.animal.stageLook(a), a.breed, H.gltf);
  const sc = new H.stage.CareStage({ a, renderer: H.stage.headlessRenderer(), model, set: decorFor('horse', place, { amb: amb(), kinds: ['seau', 'chat'] }) });
  sc.resize(390, 600, H.frame.fitView(390, 600, 400, 360));
  sc.ready = true;
  return { a, sc };
}

/** La bouche (p, repère monde) dans le récipient c : au-dessus de son ouverture, sous le bord, au-dessus du fond. */
function inContainer(c, p, { r, len = null, depth }) {
  c.updateWorldMatrix(true, false);
  const q = c.worldToLocal(p.clone());
  const over = len ? Math.abs(q.x) < r * 0.85 && Math.abs(q.z) < len / 2 : Math.hypot(q.x, q.z) < r * 0.8;
  return { ok: over && q.y < 0.08 && q.y > -depth, q };
}

describe('le cheval : au box le seau et la mangeoire au mur, au pré l\'abreuvoir et la mangeoire à la clôture', () => {
  for (const [breed, foal] of [['selle_francais', false], ['shetland', false], ['selle_francais', true]]) {
    for (const place of ['box', 'pre']) {
      it(`${breed}${foal ? ' (poulain)' : ''}, ${place} : sa bouche arrive dans la mangeoire et dans l'eau`, () => {
        const { sc } = horseStage({ breed, foal, place });
        const D = sc.decor;
        expect(D.place).toBe(place);
        expect(D.outdoor).toBe(place === 'pre');
        const P = D.props;
        const eat = D.anchors.eat;
        D.layout('feed');
        const f = inContainer(P.feeder.group, eat, { r: 0.27, depth: 0.3 });
        expect(f.ok, `mangeoire ${f.q.toArray().map((k) => k.toFixed(2))}`).toBe(true);
        D.layout('water');
        // (au box le seau, au pré l'abreuvoir galvanisé : la même façon de se remplir et de se boire)
        const isTrough = place === 'pre';
        const ps = P.bucket.group.scale.x;
        const tr = isTrough ? { r: 0.2 * Math.min(1, Math.max(0.72, 0.35 + 0.65 * sc.double.scale)), len: 0.8 * Math.min(1, Math.max(0.72, 0.35 + 0.65 * sc.double.scale)) } : { r: 0.17 * ps };
        const w = inContainer(P.bucket.group, eat, { r: tr.r, len: tr.len ?? null, depth: isTrough ? tr.r + 0.05 : 0.3 });
        expect(w.ok, `eau ${w.q.toArray().map((k) => k.toFixed(2))}`).toBe(true);
        expect(typeof P.bucket.setMark).toBe('function');
        // (au pré, la clôture de droite à la place du mur : le nez debout ne la touche pas)
        expect(sc.marks.muzzle.x).toBeLessThan(D.dims.halfW - 0.1);
        sc.dispose();
      });
    }
  }

  it('au pré, caresser : le même cadrage qu\'au box, la tête et les oreilles dans l\'image', () => {
    const cams = {};
    for (const place of ['box', 'pre']) {
      const { a, sc } = horseStage({ place });
      const ctx = fakeCtxOf(a, H.t, { scene: sc, view: H.frame.fitView(390, 600, 400, 360) });
      const game = pet3d.pet3dGame(ctx);
      for (let k = 0; k < 60; k++) {
        ctx.time += 1 / 30;
        game.update(1 / 30);
        sc.update(1 / 30);
      }
      const v = sc.view;
      const L = sc.marks;
      for (const p of [...L.ears, L.muzzle, L.withers]) {
        const q = sc.project(p);
        expect(q.x > v.x0 && q.x < v.x1 && q.y > v.y0 && q.y < v.y1, `${place} ${p.toArray().map((k) => k.toFixed(2))}`).toBe(true);
      }
      cams[place] = sc.camera.position.clone();
      game.destroy();
      sc.dispose();
    }
    expect(cams.pre.distanceTo(cams.box)).toBeLessThan(0.05);
  });
});

describe('mouton, chèvre, vache : à l\'étable et au pré, le râtelier et l\'abreuvoir à sa bouche', () => {
  for (const species of ['sheep', 'goat', 'cow']) {
    for (const place of ['etable', 'pre']) {
      it(`${species}, ${place}`, () => {
        const { sc } = farmStage({ species, set: decorFor(species, place, { amb: amb(), kinds: ['botte'] }) });
        const D = sc.decor;
        expect(D.place).toBe(place);
        expect(D.outdoor).toBe(place === 'pre');
        D.layout('feed');
        const eat = D.anchors.eat;
        const rack = D.props.rack;
        const bite = rack.bite(new THREE.Vector3());
        expect(Math.abs(eat.x - bite.x)).toBeLessThan(0.06 * Math.max(1, sc.marks.u));
        const rim = rack.group.getWorldPosition(new THREE.Vector3()).y;
        expect(eat.y).toBeLessThan(rim);
        expect(eat.y).toBeGreaterThan(rim - rack.trough);
        D.layout('water');
        const mouth = sc.eatMuzzle();
        const tr = D.props.trough;
        tr.group.updateWorldMatrix(true, false);
        const q = tr.group.worldToLocal(mouth.clone());
        // (la bouche au-dessus de l'abreuvoir, juste sous son bord)
        const r = tr.group.children[0].geometry.parameters.radiusTop;
        const len = tr.group.children[0].geometry.parameters.height;
        expect(Math.abs(q.x), 'en travers').toBeLessThan(r);
        expect(Math.abs(q.z), 'le long').toBeLessThan(len / 2);
        expect(q.y).toBeLessThan(0.08);
        expect(q.y).toBeGreaterThan(-r);
        sc.dispose();
      });
    }
  }
});

describe('chien, chat, lapin : la gamelle sous sa bouche, dedans comme dehors', () => {
  const CASES = [
    { species: 'dog', breed: 'labrador', places: ['maison', 'jardin'] },
    { species: 'dog', breed: 'chihuahua', places: ['jardin'] },
    { species: 'cat', breed: 'europeen', places: ['maison', 'jardin'] },
    { species: 'rabbit', breed: 'nain', places: ['clapier', 'enclos'] },
  ];
  for (const c of CASES) {
    for (const place of c.places) {
      it(`${c.species} ${c.breed}, ${place}`, () => {
        const { sc } = makePetStage({ species: c.species, breed: c.breed, set: decorFor(c.species, place, { amb: amb(), kinds: ['fleurs'] }) });
        const D = sc.decor;
        expect(D.place).toBe(place);
        expect(D.room?.back).toBeLessThan(0);
        for (const which of ['feed', 'water']) {
          D.layout(which);
          const bowl = (which === 'feed' ? D.props.food : D.props.water).group;
          const m = (which === 'water' ? D.anchors.drink : null) ?? D.anchors.eat;
          const b = bowl.getWorldPosition(new THREE.Vector3());
          const r = (which === 'feed' ? D.props.food : D.props.water).dims.r;
          // (la gamelle sous sa bouche — un chat la touche du bout du nez, au bord)
          expect(Math.hypot(b.x - m.x, b.z - m.z), `${which} : la gamelle sous sa bouche`).toBeLessThan(r * 1.5);
          expect(b.y).toBeLessThan(0.2);
        }
        sc.dispose();
      });
    }
  }
});
