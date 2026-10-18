// Cheval réaliste dans le jeu (GLB chargé dans node, sans textures) : embonpoint (sabots au sol, dos à
// la hauteur de la selle), révérence du spectacle (rien sous la scène), tresses du concours de beauté
// (posées sur les crins, hors du corps) et robe lustrée qui garde son modelé peint.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealHorseModel, realLegPose, realHorseBase } from '../src/game/models/horseReal.js';
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

describe('saut d\'obstacle du cheval réaliste', () => {
  it('le cheval bascule autour de son centre et le cavalier reste en selle (il bascule avec lui)', async () => {
    const { pitchAbout } = await import('../src/game/Activities.js');
    const md = horse(animal('selle_francais'));
    const root = new THREE.Group();
    const sg = new THREE.Group();
    root.add(sg);
    sg.add(md.root);
    const sc = 1.1;
    sg.scale.setScalar(sc);
    md.anim.update(1 / 30, still(), {});
    const rider = new THREE.Group();
    root.add(rider);
    const seat = new THREE.Vector3(0, md.saddleY * sc, -0.075 * sc);
    const saddle = () => {
      root.updateMatrixWorld(true);
      return md.body.localToWorld(new THREE.Vector3(0, md.saddleY, -0.075));
    };
    const rest = saddle();
    for (const pitch of [-0.16, 0.16]) {
      rider.position.copy(seat);
      pitchAbout({ scaleGroup: sg }, pitch, md.y0 * sc, -0.075 * sc, rider);
      const s = saddle();
      // (autour du sol sous le ventre, la selle reculait ou avançait de ≈ 25 cm)
      expect(Math.abs(s.z - rest.z)).toBeLessThan(0.06);
      expect(rider.position.distanceTo(s)).toBeLessThan(0.002 + seat.distanceTo(rest));
      expect(rider.rotation.x).toBe(pitch);
    }
    md.dispose();
  });

  it('membres selon la phase du saut, fondus avec l\'allure au début et à la fin (pas d\'à-coup)', () => {
    const md = horse(animal('selle_francais'));
    const gallop = { v: 8.5, moving: true, graze: 0, feeder: 0, turn: 0, fat: 1 };
    const pose = () => md.legs.map((l) => [l.top, l.pivot, l.knee, l.fetlock].map((g) => g.rotation.x));
    for (let f = 0; f < 30; f++) md.anim.update(1 / 60, gallop, {});
    const clip = pose();
    for (const t of [0, 1]) {
      expect(realLegPose(md, 'jump', 0, null, t)).toBe(true);
      expect(pose()).toEqual(clip);
    }
    realLegPose(md, 'jump', 1, null, 0.45);
    // (au-dessus de la barre : antérieurs repliés haut, postérieurs repliés sous le ventre)
    for (const l of md.legs) expect(l.knee.rotation.x, l.front ? 'antérieur' : 'postérieur').toBeGreaterThan(l.front ? 1.5 : 0.9);
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

  it.each(['selle_francais', 'percheron', 'shetland'])('%s : premier bouton sur les crins (pas sur le garrot nu), devant le bord d\'une couverture', (breed) => {
    const a = animal(breed);
    const md = horse(a);
    md.root.updateMatrixWorld(true);
    const hair = md.root.children.filter((m) => m.isSkinnedMesh && m !== md.coatMesh && m.material?.alphaTest > 0);
    const rc = new THREE.Raycaster();
    // Rayon vers le bas sous chaque bouton (repère du cheval : root = monde, au repos) : il touche des crins.
    const onHair = (spots) => spots.map(([p, up]) => {
      const w = md.neck.localToWorld(p.clone());
      const u = up.clone().transformDirection(md.neck.matrixWorld);
      rc.set(w.clone().addScaledVector(u, 0.3), u.clone().negate());
      rc.far = 0.4;
      return rc.intersectObjects(hair, false).length > 0;
    });
    expect(onHair(md.braidSpots.crest), breed).toEqual(new Array(7).fill(true));
    // Sous une couverture, les boutons commencent devant son bord avant (dims.blanket[1] + 4 cm : celle d'été).
    const front = md.dims.blanket[1] + 0.04;
    const first = md.neck.localToWorld(md.braidSpots.crestCovered[0][0].clone());
    expect(first.z).toBeGreaterThan(front);
    expect(onHair(md.braidSpots.crestCovered)).toEqual(new Array(7).fill(true));
    // Le décor suit la couverture (autre clé : refait quand on la met ou l'enlève).
    notePrep(a, 'braid', 10, 1, { color: 'blue' });
    const e = { data: a, model: md };
    Beauty.applyBeautyDecor(e, 10);
    const bare = e.beautyDecor.key;
    a.gear = { blanket: { item: 'blanket', color: 'red' } };
    Beauty.applyBeautyDecor(e, 10);
    expect(e.beautyDecor.key).not.toBe(bare);
    const knob = e.beautyDecor.groups.find((g) => g.parent === md.neck).children[0];
    expect(knob.getWorldPosition(new THREE.Vector3()).z).toBeGreaterThan(front);
    Beauty.removeBeautyDecor(e);
    md.dispose();
  });

  it('tresse de queue : la dernière perle prolonge la tresse (pas seule, loin derrière les crins)', () => {
    const md = horse(animal('selle_francais'));
    md.root.updateMatrixWorld(true);
    const z = md.braidSpots.tail.map(([g, p]) => g.localToWorld(p.clone()).z);
    const n = z.length - 1;
    // (pas plus en arrière que le prolongement des deux perles d'avant)
    expect(z[n]).toBeGreaterThanOrEqual(2 * z[n - 1] - z[n - 2] - 1e-6);
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

describe('yeux du cheval réaliste', () => {
  it('paupières ouvertes (le modèle source avait l\'œil à demi fermé), pareil des deux côtés', () => {
    const base = realHorseBase(gltf);
    const coat = base.prims.coat;
    const ch = base.snout.clone().sub(base.rest[3]); // (os de la tête : RIG[3])
    const f = new THREE.Vector3(0, ch.y, ch.z).normalize();
    const u = new THREE.Vector3().crossVectors(f, new THREE.Vector3(1, 0, 0)).normalize();
    expect(base.eyes).toHaveLength(2);
    const open = [];
    for (const { side, c, r } of base.eyes) {
      const l = new THREE.Vector3(side, 0, 0);
      let up = Infinity;
      let low = -Infinity;
      const v = new THREE.Vector3();
      for (let i = 0; i < coat.count; i++) {
        v.fromArray(coat.pos, i * 3).sub(c);
        const d = v.length() / r;
        const pl = v.dot(l) / r;
        if (d < 0.9 || d > 1.15 || pl < 0.5 || Math.abs(v.dot(f) / r - 0.2) > 0.35) continue;
        // bord des paupières au milieu de la fente : hauteur sur le globe depuis l'axe du regard
        const phi = Math.atan2(v.dot(u) / r, pl);
        if (phi > 0.05) up = Math.min(up, phi);
        else low = Math.max(low, phi);
      }
      open.push(up - low);
    }
    // (0,09 rad au départ : une fente ; ≈ 0,63 rad ouvert)
    for (const o of open) expect(o).toBeGreaterThan(0.45);
    // (aucun triangle de la paupière retourné : il ferait un trou noir dans le pelage)
    expect(base.eyes.flips).toBe(0);
    expect(Math.abs(open[0] - open[1])).toBeLessThan(0.05);
  });

  it('œil vivant : iris centré sur l\'ouverture des paupières, axe du regard vers l\'extérieur, reflet dans le shader', () => {
    const base = realHorseBase(gltf);
    for (const { side, axis, cap } of base.eyes) {
      // (la partie visible regarde de côté : le reflet du soleil y est ramené)
      expect(axis.x * side).toBeGreaterThan(0.6);
      expect(cap).toBeGreaterThan(0.3);
      expect(cap).toBeLessThan(0.95);
    }
    const md = horse(animal('arabe'));
    const eyes = md.root.children.find((m) => m.isSkinnedMesh && m.geometry.attributes.eyeAxis);
    expect(eyes).toBeTruthy();
    const uv = eyes.geometry.attributes.uv;
    const ax = eyes.geometry.attributes.eyeAxis;
    let center = 0;
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(i)).toBeLessThanOrEqual(1);
      expect(Math.abs(ax.getX(i))).toBeGreaterThan(0.6);
      if (Math.hypot(uv.getX(i) - 0.5, uv.getY(i) - 0.5) < 0.15) center++;
    }
    // (des sommets au centre de l'iris : la pupille est bien sur le globe, pas derrière)
    expect(center).toBeGreaterThan(10);
    expect(eyes.material.map).toBeTruthy();
    const sh = { vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} };
    eyes.material.onBeforeCompile(sh);
    expect(sh.vertexShader).toContain('vEyeAxis');
    expect(sh.fragmentShader).toContain('eyeGlint');
    md.dispose();
  });
});
