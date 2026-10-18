// Cheval réaliste dans le jeu (GLB chargé dans node, sans textures) : embonpoint (sabots au sol, dos à
// la hauteur de la selle), révérence du spectacle (rien sous la scène), tresses du concours de beauté
// (posées sur les crins, hors du corps) et robe lustrée qui garde son modelé peint.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealHorseModel, realLegPose } from '../src/game/models/horseReal.js';
import { createAnimal } from '../src/sim/animal.js';
import { notePrep } from '../src/sim/beauty.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

const mem = new Map();
let gltf;
let Beauty;
beforeAll(async () => {
  gltf = await loadRealHorseGltf();
  // (Beauty.js charge l'interface : de quoi la faire tourner dans node)
  globalThis.localStorage = globalThis.localStorage ?? {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    key: (i) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
  globalThis.window = globalThis.window ?? { addEventListener() {}, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 };
  globalThis.document = globalThis.document ?? {
    addEventListener() {}, hidden: false, documentElement: { lang: 'fr' }, body: { classList: { add() {}, remove() {} } }, getElementById: () => null, createElement: () => ({ getContext: () => null, style: {} }),
  };
  Beauty = await import('../src/game/Beauty.js');
}, 60000);

const animal = (breed, extra = {}) => createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: 900, seed: 77, ...extra });
const horse = (a) => buildRealHorseModel(a.look, a.breed, gltf);
const still = (fat = 1) => ({ v: 0, moving: false, graze: 0, feeder: 0, turn: 0, fat });

/** Semelle la plus basse de ces membres dans le repère de `frame` (matrices à jour). */
function lowest(legs, frame) {
  const inv = frame.matrixWorld.clone().invert();
  const v = new THREE.Vector3();
  let low = Infinity;
  for (const l of legs) for (const p of l.solePts) low = Math.min(low, v.copy(p).applyMatrix4(l.fetlock.matrixWorld).applyMatrix4(inv).y);
  return low;
}

/** Dans le corps ? Rayons dans 6 directions contre le pelage (faces doubles) : nombre impair de touches. */
function insideCoat(md, p) {
  const coat = md.coatMesh;
  const side = coat.material.side;
  coat.material.side = THREE.DoubleSide;
  coat.boundingSphere = null;
  const rc = new THREE.Raycaster();
  let odd = 0;
  for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    rc.set(p, new THREE.Vector3(...d));
    if (rc.intersectObject(coat, false).length % 2 === 1) odd++;
  }
  coat.material.side = side;
  return odd >= 4;
}

describe('embonpoint du cheval réaliste', () => {
  it.each([[100, 1.18], [0, 0.82]])('poids %s : les sabots restent au sol et le dos à la hauteur de la selle', (w, fat) => {
    const ref = horse(animal('selle_francais'));
    const md = horse(animal('selle_francais'));
    for (let f = 0; f < 30; f++) {
      ref.anim.update(1 / 30, still(1), {});
      md.anim.update(1 / 30, still(fat), {});
    }
    ref.root.updateMatrixWorld(true);
    md.root.updateMatrixWorld(true);
    expect(md.body.scale.x).toBeCloseTo(fat, 3);
    expect(md.body.scale.y).toBe(1);
    expect(md.fat).toBeCloseTo(fat, 3);
    const low = lowest(md.legs, md.root);
    expect(low, `poids ${w}`).toBeGreaterThan(-0.004);
    expect(low, `poids ${w}`).toBeLessThan(0.008);
    // Dessus du dos à la place de la selle : comme à poids normal (le cavalier ne s'y enfonce pas).
    const seat = (m) => m.body.localToWorld(new THREE.Vector3(0, m.backTop(-0.075), -0.075)).y;
    expect(Math.abs(seat(md) - seat(ref))).toBeLessThan(0.01);
    ref.dispose();
    md.dispose();
  });
});

describe('révérence du cheval réaliste (spectacle)', () => {
  const stage = (md) => {
    const root = new THREE.Group();
    const sg = new THREE.Group();
    root.add(sg);
    sg.add(md.root);
    return { root, sg };
  };

  it.each(['selle_francais', 'shetland', 'percheron'])('%s : antérieurs et postérieurs posés sur la scène, rien dessous', (breed) => {
    const md = horse(animal(breed));
    const { root, sg } = stage(md);
    for (const s of [0.3, 0.6, 1]) {
      md.anim.update(1 / 30, still(), {});
      expect(realLegPose(md, 'bow', s, sg)).toBe(true);
      root.updateMatrixWorld(true);
      const front = lowest(md.legs.filter((l) => l.front), root);
      const hind = lowest(md.legs.filter((l) => !l.front), root);
      expect(Math.min(front, hind), `${breed} ${s}`).toBeGreaterThan(-0.004);
      expect(front, `${breed} ${s}`).toBeLessThan(0.02);
      expect(hind, `${breed} ${s}`).toBeLessThan(0.02);
      expect(sg.rotation.x).toBeGreaterThan(0.18 * s); // (l'avant-main descend vraiment)
    }
    md.dispose();
  });

  it('le bout du nez reste au-dessus de la scène, même s\'il broutait encore', () => {
    const md = horse(animal('selle_francais'));
    const { root, sg } = stage(md);
    for (let f = 0; f < 120; f++) md.anim.update(1 / 30, { ...still(), graze: 1 }, {});
    realLegPose(md, 'bow', 1, sg);
    root.updateMatrixWorld(true);
    const nose = md.head.localToWorld(md.mouth.clone());
    expect(root.worldToLocal(nose).y).toBeGreaterThan(0.05);
    md.dispose();
  });
});

describe('concours de beauté sur le cheval réaliste', () => {
  const dressed = (breed) => {
    const a = animal(breed);
    const md = horse(a);
    md.anim.update(1 / 30, still(), {});
    md.root.updateMatrixWorld(true);
    notePrep(a, 'braid', 10, 1, { color: 'blue' });
    notePrep(a, 'shine', 10, 1);
    const e = { data: a, model: md };
    const coat = md.coatMesh.material;
    Beauty.applyBeautyDecor(e, 10);
    md.root.updateMatrixWorld(true);
    return { a, md, e, coat };
  };

  it.each(['selle_francais', 'shetland', 'frison'])('%s : tresses sur la crête et sur la queue, aucune pièce dans le corps', (breed) => {
    const { md, e } = dressed(breed);
    const groups = e.beautyDecor.groups;
    expect(groups.some((g) => g.parent === md.neck)).toBe(true);
    expect(groups.some((g) => g.parent === md.tail || g.parent === md.tailTip)).toBe(true);
    const crest = md.neck.localToWorld(md.braidSpots.crest[3][0].clone());
    let inside = 0;
    let n = 0;
    const p = new THREE.Vector3();
    for (const g of groups) {
      g.traverse((o) => {
        if (!o.isMesh) return;
        n++;
        if (insideCoat(md, o.getWorldPosition(p))) inside++;
      });
    }
    expect(n).toBeGreaterThan(20);
    expect(inside, breed).toBe(0);
    // Les tresses de la crête sont sur l'encolure, pas loin au-dessus (rayons arrêtés par les cartes de crins).
    const top = md.coatMesh.geometry.boundingBox ?? (md.coatMesh.geometry.computeBoundingBox(), md.coatMesh.geometry.boundingBox);
    expect(crest.y).toBeLessThan(top.max.y + 0.1);
    Beauty.removeBeautyDecor(e);
    md.dispose();
  });

  it('robe lustrée : brillante mais satinée, et le shader garde le modelé peint (H_REAL)', () => {
    const { md, e, coat } = dressed('selle_francais');
    const shiny = md.coatMesh.material;
    expect(shiny).not.toBe(coat);
    expect(shiny.roughness).toBeLessThan(coat.roughness);
    expect(shiny.roughness).toBeGreaterThanOrEqual(0.3);
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    shiny.onBeforeCompile(sh, null);
    expect(sh.vertexShader).toContain('#define H_REAL');
    expect(sh.fragmentShader).toContain('#define H_REAL');
    expect(sh.fragmentShader).toContain('hDetTex.r * 2.0');
    Beauty.removeBeautyDecor(e);
    expect(md.coatMesh.material).toBe(coat);
    md.dispose();
  });
});
