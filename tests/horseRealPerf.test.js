// Performance du cheval réaliste (GLB chargé dans node, sans textures) : boîte englobante qui suit la pose
// (élimination hors du champ juste, sans disparition), version réduite au loin, animation ralentie hors du
// champ, cheval réaliste arrivé en cours de partie (bascule des chevaux du modèle de repli), vignettes refaites.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import {
  buildRealHorseModel, realHorseBase, realLegPose, animateRealHorse, horseView, LOD_DIST, OFFSCREEN_STEP,
} from '../src/game/models/horseReal.js';
import { createAnimal } from '../src/sim/animal.js';
import { Thumbs } from '../src/game/thumbs.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

let gltf;
beforeAll(async () => {
  gltf = await loadRealHorseGltf();
}, 60000);

const animal = (breed, extra = {}) => createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: 900, seed: 31, ...extra });
const horse = (breed, extra) => {
  const a = animal(breed, extra);
  return buildRealHorseModel(a.look, a.breed, gltf);
};
const skinned = (md) => {
  const out = [];
  md.root.traverse((o) => { if (o.isSkinnedMesh) out.push(o); });
  return out;
};

/** Boîte exacte du maillage déformé (chaque sommet passé par la peau, sur le processeur), repère du maillage. */
function exactBox(meshes) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const m of meshes) {
    m.skeleton.update();
    const n = m.geometry.attributes.position.count;
    for (let i = 0; i < n; i++) box.expandByPoint(m.getVertexPosition(i, v));
  }
  return box;
}

describe('version réduite du cheval réaliste (LOD)', () => {
  it('le GLB a un index simplifié par matière, sur les mêmes sommets', () => {
    const base = realHorseBase(gltf);
    for (const [name, keep] of [['coat', 0.5], ['eye', 0.3], ['mane', 0.6]]) {
      const p = base.prims[name];
      expect(p.lodIndex, name).toBeTruthy();
      expect(p.lodIndex.length % 3).toBe(0);
      expect(p.lodIndex.length).toBeLessThan(p.index.length * keep);
      expect(Math.max(...p.lodIndex)).toBeLessThan(p.count);
    }
    const tris = (k) => Object.values(base.prims).reduce((s, p) => s + p[k].length / 3, 0);
    expect(tris('index')).toBeGreaterThan(14000);
    expect(tris('lodIndex')).toBeGreaterThan(5000);
    expect(tris('lodIndex')).toBeLessThan(8000);
  });

  it('setLod change l\'index, garde les attributs (déformation de la race) ; au loin, version réduite', () => {
    const md = horse('selle_francais');
    const coat = md.coatMesh;
    const full = coat.geometry;
    md.setLod(1);
    expect(coat.geometry).not.toBe(full);
    expect(coat.geometry.attributes.position).toBe(full.attributes.position);
    expect(coat.geometry.attributes.hPart).toBe(full.attributes.hPart);
    expect(coat.geometry.index.count).toBeLessThan(full.index.count * 0.5);
    md.setLod(0);
    expect(coat.geometry).toBe(full);
    // Entité au loin, puis de près (hystérésis : pas de va-et-vient à la limite).
    const e = fakeEntity(md);
    horseView.on = true;
    const far = LOD_DIST.high; // (gfx.quality vaut 'high' par défaut)
    const at = (d) => {
      horseView.eye.set(0, 1.5, d);
      md.anim.seen = true;
      animateRealHorse(e, 1 / 60, false);
      return md.lodLevel;
    };
    expect(at(far * 1.2)).toBe(1);
    expect(at(far * 0.95)).toBe(1); // (encore dans la marge)
    expect(at(far * 0.8)).toBe(0);
    expect(at(far * 1.02)).toBe(1);
    horseView.on = false;
    md.dispose();
  });
});

/** Entité minimale pour animateRealHorse. */
function fakeEntity(md, extra = {}) {
  md.root.updateMatrixWorld(true);
  return { model: md, root: md.root, speed: 0, scale: 1, time: 1, heading: 0, state: 'walk', data: { weight: 50 }, ...extra };
}

describe('boîte englobante du cheval réaliste (élimination hors du champ)', () => {
  const st = (v, extra) => ({ v, moving: v > 0, graze: 0, feeder: 0, turn: 0, fat: 1, ...extra });
  const poses = {
    repos: (md) => md.anim.update(1 / 60, st(0), {}),
    galop: (md) => { for (let f = 0; f < 90; f++) md.anim.update(1 / 60, st(9), {}); },
    broute: (md) => { for (let f = 0; f < 120; f++) md.anim.update(1 / 60, st(0, { graze: 1 }), {}); },
    saut: (md) => { md.anim.update(1 / 60, st(4), {}); realLegPose(md, 'jump', 1); },
    gros: (md) => { for (let f = 0; f < 30; f++) md.anim.update(1 / 60, st(1.4, { fat: 1.18 }), {}); },
  };

  it.each(['selle_francais', 'shetland', 'frison', 'fjord', 'percheron'])('%s : contient le maillage déformé dans chaque pose, sans être trop large', (breed) => {
    const md = horse(breed);
    const meshes = skinned(md);
    // (frison, percheron : fanons ; fjord : brosse — des cartes de crins en plus)
    expect(meshes.length).toBeGreaterThanOrEqual(3);
    expect(meshes.every((m) => m.frustumCulled)).toBe(true);
    for (const [name, pose] of Object.entries(poses)) {
      pose(md);
      md.root.updateMatrixWorld(true);
      for (const m of meshes) expect(m.boundingBox, name).toBeNull(); // (oubliée à chaque mise à jour des matrices)
      meshes[0].computeBoundingBox();
      const box = meshes[0].boundingBox;
      // une seule boîte pour tout le cheval
      for (const m of meshes) {
        expect(m.boundingBox).toBe(box);
        expect(m.boundingSphere.center.distanceTo(box.max)).toBeLessThanOrEqual(m.boundingSphere.radius + 1e-5);
      }
      const exact = exactBox(meshes);
      const eps = 1e-4;
      expect(box.min.x, name).toBeLessThanOrEqual(exact.min.x + eps);
      expect(box.min.y, name).toBeLessThanOrEqual(exact.min.y + eps);
      expect(box.min.z, name).toBeLessThanOrEqual(exact.min.z + eps);
      expect(box.max.x, name).toBeGreaterThanOrEqual(exact.max.x - eps);
      expect(box.max.y, name).toBeGreaterThanOrEqual(exact.max.y - eps);
      expect(box.max.z, name).toBeGreaterThanOrEqual(exact.max.z - eps);
      // juste : au plus quelques dizaines de cm de plus que le maillage de chaque côté (marge des crins comprise)
      const a = exact.getSize(new THREE.Vector3());
      const b = box.getSize(new THREE.Vector3());
      expect(b.x - a.x, name).toBeLessThan(0.6);
      expect(b.y - a.y, name).toBeLessThan(0.6);
      expect(b.z - a.z, name).toBeLessThan(0.6);
      // la sphère de culling n'est pas une sphère fixe de 2,2 m : elle suit la taille de la race
      expect(meshes[0].boundingSphere.radius).toBeLessThan(b.length() / 2 + 1e-6);
    }
    md.dispose();
  });

  it('la couverture liée au squelette est dans la boîte du cheval', async () => {
    const { buildGear } = await import('../src/game/gearModels.js');
    const a = animal('percheron');
    const md = buildRealHorseModel(a.look, a.breed, gltf);
    buildGear(md, a.look, { blanket: { item: 'blanketRain', color: 'navy' } }); // (imperméable : sans texture peinte, rien à dessiner dans node)
    const meshes = skinned(md);
    expect(meshes.length).toBeGreaterThan(3); // (pelage, yeux, crins, fanons… et la couverture)
    expect(md.bounds.meshes.length).toBe(meshes.length);
    poses.galop(md);
    md.root.updateMatrixWorld(true);
    meshes[0].computeBoundingBox();
    const box = meshes[0].boundingBox.clone().expandByScalar(1e-4);
    const exact = exactBox(meshes);
    expect(box.containsBox(exact)).toBe(true);
    md.dispose();
  });

  it('hors du champ de la caméra : éliminé ; devant elle : gardé (pas de disparition au bord)', () => {
    const md = horse('selle_francais');
    const scene = new THREE.Scene();
    const holder = new THREE.Group();
    holder.position.set(5, 0, -12);
    holder.rotation.y = 0.7;
    holder.add(md.root);
    scene.add(holder);
    poses.galop(md);
    const cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 200);
    const frustum = new THREE.Frustum();
    const test = (lookAt) => {
      cam.position.set(0, 1.6, 0);
      cam.lookAt(lookAt);
      cam.updateMatrixWorld(true);
      scene.updateMatrixWorld(true);
      frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      return skinned(md).map((m) => frustum.intersectsObject(m));
    };
    expect(test(new THREE.Vector3(5, 1, -12))).toEqual([true, true, true]);
    expect(test(new THREE.Vector3(-5, 1, 12))).toEqual([false, false, false]); // demi-tour
    // Juste au bord : le bout du nez (tête tendue au galop) dépasse dans le champ ; la boîte le voit.
    const nose = new THREE.Vector3(0, -0.12 * md.dims.snoutZ, md.dims.snoutZ).applyMatrix4(md.head.matrixWorld);
    const dir = nose.clone().sub(new THREE.Vector3(0, 1.6, 0)).normalize();
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    // caméra tournée pour que le nez soit à 2° du bord gauche (champ horizontal : demi-angle ≈ 37°)
    const half = Math.atan(Math.tan((50 * Math.PI) / 360) * 1.6);
    const look = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -(half - 0.035));
    expect(side.length()).toBeGreaterThan(0.5);
    expect(test(new THREE.Vector3(0, 1.6, 0).add(look))[0]).toBe(true);
    md.dispose();
  });
});

describe('animation hors du champ', () => {
  it(`un cheval qu'on ne voit pas n'est animé qu'une image sur ${OFFSCREEN_STEP}, avec le temps cumulé`, () => {
    const md = horse('arabe');
    const e = fakeEntity(md, { speed: 1.5 });
    const spy = vi.spyOn(md.anim, 'update');
    const t0 = md.anim.t;
    for (let f = 0; f < 3 * OFFSCREEN_STEP; f++) animateRealHorse(e, 0.02, false);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(md.anim.t - t0).toBeCloseTo(3 * OFFSCREEN_STEP * 0.02, 6);
    // Vu (dessiné à l'image d'avant) : chaque image.
    spy.mockClear();
    for (let f = 0; f < 4; f++) {
      md.anim.seen = true;
      animateRealHorse(e, 0.02, false);
    }
    expect(spy).toHaveBeenCalledTimes(4);
    // Monté, en séance, mené en main : chaque image même hors du champ (sa pose sert au cavalier, à l'activité).
    for (const k of [{ ridden: true }, { scripted: true }]) {
      spy.mockClear();
      const e2 = fakeEntity(md, { speed: 1.5, ...k });
      for (let f = 0; f < 4; f++) animateRealHorse(e2, 0.02, false);
      expect(spy, JSON.stringify(k)).toHaveBeenCalledTimes(4);
    }
    spy.mockClear();
    const led = fakeEntity(md, { speed: 1.5, data: { weight: 50, following: true } });
    for (let f = 0; f < 4; f++) animateRealHorse(led, 0.02, false);
    expect(spy).toHaveBeenCalledTimes(4);
    md.dispose();
  });

  it('avance rapide (⏩, 3 pas par image) : un cheval à l\'écran reçoit tout le temps simulé', () => {
    const md = horse('selle_francais');
    const e = fakeEntity(md, { speed: 1.5 });
    const spy = vi.spyOn(md.anim, 'update');
    const t0 = md.anim.t;
    const frame0 = horseView.frame;
    // Game.frame : une image = horseView.frame + 1, 3 pas de simulation, puis le rendu (seen = vrai une fois).
    for (let f = 0; f < 10; f++) {
      horseView.frame++;
      for (let s = 0; s < 3; s++) animateRealHorse(e, 0.02, false);
      md.coatMesh.onBeforeRender();
    }
    // (la première image : pas encore dessiné, ses pas sont mis de côté puis rendus à l'image suivante)
    expect(md.anim.t - t0).toBeCloseTo(30 * 0.02, 6);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(28);
    // Caché quelques images, puis de nouveau à l'écran : le temps mis de côté n'est pas perdu.
    const t1 = md.anim.t;
    for (let f = 0; f < 4; f++) {
      horseView.frame++;
      for (let s = 0; s < 3; s++) animateRealHorse(e, 0.02, false);
      if (f === 3) md.coatMesh.onBeforeRender();
    }
    horseView.frame++;
    for (let s = 0; s < 3; s++) animateRealHorse(e, 0.02, false);
    expect(md.anim.t - t1).toBeCloseTo(15 * 0.02, 6);
    horseView.frame = frame0;
    md.dispose();
  });

  it('dessiné (caméra ou ombre) : noté pour l\'animation', () => {
    const md = horse('quarter');
    md.anim.seen = false;
    md.coatMesh.onBeforeRender();
    expect(md.anim.seen).toBe(true);
    md.anim.seen = false;
    md.coatMesh.onBeforeShadow();
    expect(md.anim.seen).toBe(true);
    md.dispose();
  });
});

describe('cheval réaliste arrivé en cours de partie', () => {
  it('les chevaux au modèle de repli le prennent un par image, pas pendant qu\'on les monte', async () => {
    const { Game } = await import('../src/game/Game.js');
    const mk = (id, extra = {}) => ({
      data: { id, species: 'horse' }, root: { parent: {} }, model: { real: false },
      rebuildModel: vi.fn(function () { this.model = { real: true }; }), ...extra,
    });
    const a = mk('a');
    const b = mk('b', { ridden: true });
    const c = mk('c');
    const gone = mk('d', { disposed: true });
    const g = { horseSwap: [gone, a, b, c], player: { mount: b } };
    const swap = () => Game.prototype.swapRealHorses.call(g);
    swap();
    expect(a.rebuildModel).toHaveBeenCalledTimes(1);
    expect(c.rebuildModel).not.toHaveBeenCalled();
    swap();
    expect(c.rebuildModel).toHaveBeenCalledTimes(1);
    expect(b.rebuildModel).not.toHaveBeenCalled(); // monté : il attend
    expect(g.horseSwap).toEqual([b]);
    b.ridden = false;
    g.player.mount = null;
    swap();
    expect(b.rebuildModel).toHaveBeenCalledTimes(1);
    expect(g.horseSwap).toEqual([]);
    expect(gone.rebuildModel).not.toHaveBeenCalled();
  }, 60000);

  it('le cheval d\'un client (vétérinaire, pension), qui attend ou repart, est compté parmi les animaux de la scène', async () => {
    const { Game } = await import('../src/game/Game.js');
    const mine = { data: { id: 'a' } };
    const client = { data: { id: 'c' } };
    const leaving = { data: { id: 'l' } };
    const groomed = { data: { id: 'g' } };
    const g = {
      entities: new Map([['a', mine]]),
      groomer: { visitors: new Map([['x', { e: groomed }]]), leaving: [] },
      clients: { visitor: { e: client }, leaving: [{ e: leaving }, { e: null }] },
      dogTrainer: { visitor: null },
    };
    expect(Game.prototype.allEntities.call(g)).toEqual([mine, groomed, client, leaving]);
  }, 60000);

  it('les vignettes d\'animaux et d\'équipement prennent une autre clé (refaites), pas les autres', () => {
    const th = new Thumbs(null);
    const released = [];
    th.onRelease(() => released.push(1));
    const animalSpec = { kind: 'animal', species: 'horse', breed: 'frison' };
    const structSpec = { kind: 'structure', id: 'paddock' };
    expect(th.vary(animalSpec)).toBe(animalSpec);
    th.modelsChanged();
    expect(released).toHaveLength(1);
    expect(th.vary(animalSpec).mv).toBe(1);
    expect(th.vary({ kind: 'gear', id: 'saddle' }).mv).toBe(1);
    expect(th.vary(structSpec)).toBe(structSpec);
  });

  it('les vignettes « À cheval » des véhicules et des paddocks (cheval mannequin) sont refaites aussi', async () => {
    const { registerThumbKinds } = await import('../src/game/thumbScenes.js');
    const th = registerThumbKinds(new Thumbs(null));
    const ride = { kind: 'vehicle', id: 'horse' };
    const car = { kind: 'vehicle', id: 'car' };
    const paddock = { kind: 'structure', type: 'paddockSmall' };
    const pasture = { kind: 'structure', type: 'pasture' };
    expect(th.vary(ride)).toBe(ride);
    th.modelsChanged();
    expect(th.vary(ride).mv).toBe(1);
    expect(th.vary(paddock).mv).toBe(1);
    expect(th.vary({ kind: 'structure', type: 'paddockLarge' }).mv).toBe(1);
    expect(th.vary(car)).toBe(car);
    expect(th.vary(pasture)).toBe(pasture);
  }, 60000);
});
