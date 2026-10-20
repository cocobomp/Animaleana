// Cheval réaliste dans le jeu (GLB chargé dans node, sans textures) : embonpoint (sabots au sol, dos à
// la hauteur de la selle), révérence du spectacle (rien sous la scène), tresses du concours de beauté
// (posées sur les crins, hors du corps) et robe lustrée qui garde son modelé peint.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealHorseModel, realLegPose, realHorseBase } from '../src/game/models/horseReal.js';
import { createAnimal } from '../src/sim/animal.js';
import { notePrep } from '../src/sim/beauty.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';
import { LEG } from '../src/game/models/avatarMotion.js';
import { initLife } from '../src/game/models/avatarRig.js';

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

/** Avatar au squelette de buildAvatar (mêmes articulations, mêmes longueurs), avec des mains en volume. */
function riderMock() {
  const root = new THREE.Group();
  const legs = [];
  const knees = [];
  const ankles = [];
  for (const s of [1, -1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.095, 0.82, 0);
    root.add(hip);
    const knee = new THREE.Group();
    knee.position.set(0, -LEG.thigh, 0);
    hip.add(knee);
    const ankle = new THREE.Group();
    ankle.position.set(0, -LEG.shin, 0);
    knee.add(ankle);
    legs.push(hip);
    knees.push(knee);
    ankles.push(ankle);
  }
  const torso = new THREE.Group();
  torso.position.y = 0.82;
  root.add(torso);
  const arms = [];
  const elbows = [];
  const hands = [];
  const skin = new THREE.MeshBasicMaterial();
  for (const s of [1, -1]) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.19, 1.33 - 0.03 - 0.82, 0);
    sh.rotation.z = s * 0.08;
    torso.add(sh);
    const el = new THREE.Group();
    el.position.set(0, -0.27, 0);
    sh.add(el);
    const hand = new THREE.Group();
    hand.position.set(0, -0.26, 0.005);
    el.add(hand);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 10), skin);
    palm.scale.set(0.64, 1.05, 1);
    const fingers = new THREE.Mesh(new THREE.CapsuleGeometry(0.021, 0.03, 4, 8), skin);
    fingers.position.set(0, -0.046, 0.004);
    fingers.scale.set(0.95, 1, 1.2);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.025, 4, 6), skin);
    thumb.position.set(-s * 0.012, -0.012, 0.03);
    thumb.rotation.set(0.5, 0, s * 0.3);
    hand.add(palm, fingers, thumb);
    arms.push(sh);
    elbows.push(el);
    hands.push(hand);
  }
  const head = new THREE.Group();
  head.position.set(0, 1.5 - 0.82, 0);
  head.scale.setScalar(1.1);
  torso.add(head);
  const a = { root, legs, knees, ankles, arms, elbows, hands, head, torso, chest: new THREE.Group(), eyeBalls: null, lids: [], hairTail: null, carry: null, hat: null, hairBulk: 0.03 };
  initLife(a, 3);
  return a;
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

describe('couverture du cheval réaliste', () => {
  it('Shetland au galop : la peau de la croupe et des hanches ne passe pas par-dessus la couverture', async () => {
    const { buildGear } = await import('../src/game/gearModels.js');
    const a = animal('shetland', { seed: 1234 });
    const md = horse(a);
    const own = new Set(md.bounds.meshes);
    buildGear(md, a.look, { blanket: { item: 'blanketRain', color: 'navy' } });
    // (la nappe : la plus grande des pièces ajoutées, liées au squelette)
    const shell = md.bounds.meshes.filter((m) => !own.has(m))
      .sort((x, y) => y.geometry.attributes.position.count - x.geometry.attributes.position.count)[0];
    const coat = md.coatMesh;
    const g = coat.geometry;
    // Peau de la moitié arrière du tronc (hanches, dos, côtes) : rayon vers l'intérieur, le long de la normale
    // déformée ; s'il touche la couverture à moins de 5 cm, la peau est passée par-dessus le tissu.
    const rear = [];
    for (let i = 0; i < g.attributes.position.count; i++) if (g.attributes.position.getZ(i) < -0.2 && g.attributes.position.getY(i) > md.legTop) rear.push(i);
    const gallop = { v: 8.5 * md.speedScale, moving: true, graze: 0, feeder: 0, turn: 0, fat: 1 };
    for (let f = 0; f < 60; f++) md.anim.update(1 / 60, gallop, {});
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    const n = new THREE.Vector3();
    const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const ray = new THREE.Ray();
    const hit = new THREE.Vector3();
    let through = 0;
    for (let f = 0; f < 6; f++) {
      md.anim.update(0.075, gallop, {});
      md.root.updateMatrixWorld(true);
      const sp = shell.geometry.attributes.position;
      const S = new Float32Array(sp.count * 3);
      for (let i = 0; i < sp.count; i++) shell.getVertexPosition(i, p).applyMatrix4(shell.matrixWorld).toArray(S, i * 3);
      const idx = shell.geometry.index.array;
      for (const i of rear) {
        coat.getVertexPosition(i, p);
        q.fromBufferAttribute(g.attributes.position, i).addScaledVector(n.fromBufferAttribute(g.attributes.normal, i), 0.01);
        coat.applyBoneTransform(i, q);
        n.subVectors(q, p).normalize();
        p.applyMatrix4(coat.matrixWorld);
        ray.set(p, n.negate());
        for (let t = 0; t < idx.length; t += 3) {
          for (let k = 0; k < 3; k++) tri[k].fromArray(S, idx[t + k] * 3);
          if (ray.intersectTriangle(tri[0], tri[1], tri[2], false, hit) && hit.distanceTo(p) < 0.05) {
            through++;
            break;
          }
        }
      }
    }
    // (avant : un ou deux points à chaque image, au bord arrière, sur la hanche droite et la gauche)
    expect(through).toBe(0);
    md.dispose();
  }, 30000);

  // Queue portée haut (arabe, saddlebred), attache de la queue (pur-sang, trotteur), pointe de la cuisse
  // (akhal-teke) : la peau passait par-dessus la couverture, jusqu'à 5 cm chez l'arabe, même à l'arrêt. Le
  // mixeur tire au hasard l'instant de départ des clips (Math.random) : instants FIXÉS.
  it.each([
    ['arabe', 'blanketRain'], ['saddlebred', 'blanketRain'], ['akhal_teke', 'blanketRain'], ['pur_sang', 'blanketRain'],
    ['trotteur_francais', 'blanketRain'], ['arabe', 'blanket'], ['saddlebred', 'blanketSummer'],
  ])('%s (%s) : la peau de la croupe, de l\'attache de la queue et des hanches reste sous la couverture', async (breed, item) => {
    const { buildGear } = await import('../src/game/gearModels.js');
    const random = Math.random;
    let n = 0;
    Math.random = () => (0.37 + 0.618 * n++) % 1;
    try {
      const a = animal(breed, { seed: 1234 });
      const md = horse(a);
      const own = new Set(md.bounds.meshes);
      buildGear(md, a.look, { blanket: { item, color: 'navy' } });
      const shell = md.bounds.meshes.filter((m) => !own.has(m))
        .sort((x, y) => y.geometry.attributes.position.count - x.geometry.attributes.position.count)[0];
      const coat = md.coatMesh;
      const g = coat.geometry;
      const rear = [];
      for (let i = 0; i < g.attributes.position.count; i++) if (g.attributes.position.getZ(i) < -0.2 && g.attributes.position.getY(i) > md.legTop) rear.push(i);
      const p = new THREE.Vector3();
      const q = new THREE.Vector3();
      const nr = new THREE.Vector3();
      const ray = new THREE.Ray();
      const hit = new THREE.Vector3();
      const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      const res = {};
      for (const [gait, u] of [['arrêt', 0], ['pas', 1.6], ['galop', 8.5]]) {
        const st = { v: u * md.speedScale, moving: u > 0, graze: 0, feeder: 0, turn: 0, fat: 1 };
        for (let f = 0; f < 60; f++) md.anim.update(1 / 60, st, {});
        let through = 0;
        for (let f = 0; f < 4; f++) {
          md.anim.update(0.13, st, {});
          md.root.updateMatrixWorld(true);
          const sp = shell.geometry.attributes.position;
          const S = new Float32Array(sp.count * 3);
          for (let i = 0; i < sp.count; i++) shell.getVertexPosition(i, p).applyMatrix4(shell.matrixWorld).toArray(S, i * 3);
          const idx = shell.geometry.index.array;
          for (const i of rear) {
            coat.getVertexPosition(i, p);
            q.fromBufferAttribute(g.attributes.position, i).addScaledVector(nr.fromBufferAttribute(g.attributes.normal, i), 0.01);
            coat.applyBoneTransform(i, q);
            nr.subVectors(q, p).normalize();
            p.applyMatrix4(coat.matrixWorld);
            ray.set(p, nr.negate());
            for (let t = 0; t < idx.length; t += 3) {
              for (let k = 0; k < 3; k++) tri[k].fromArray(S, idx[t + k] * 3);
              if (ray.intersectTriangle(tri[0], tri[1], tri[2], false, hit) && hit.distanceTo(p) < 0.05) {
                through++;
                break;
              }
            }
          }
        }
        res[gait] = through;
      }
      // (avant : à chaque image, une dizaine de sommets de l'attache de la queue chez l'arabe, jusqu'à 5 cm)
      expect(res).toEqual({ arrêt: 0, pas: 0, galop: 0 });
      md.dispose();
    } finally {
      Math.random = random;
    }
  }, 60000);

  it.each(['shetland', 'falabella'])('%s : la sous-ventrière reste sous le ventre, à toutes les allures (cycle entier)', async (breed) => {
    const { buildGear } = await import('../src/game/gearModels.js');
    const a = animal(breed, { seed: 1234 });
    const md = horse(a);
    const own = new Set(md.bounds.meshes);
    buildGear(md, a.look, { blanket: { item: 'blanketRain', color: 'navy' } });
    // (la sangle : la dernière pièce ajoutée)
    const added = md.bounds.meshes.filter((m) => !own.has(m));
    const girth = added[added.length - 1];
    const coat = md.coatMesh;
    const I = coat.geometry.index.array;
    const C = new Float32Array(coat.geometry.attributes.position.count * 3);
    const gp = girth.geometry.attributes.position;
    const p = new THREE.Vector3();
    const res = {};
    for (const [gait, u] of [['pas', 1.6], ['trot', 3], ['petit galop', 4.6], ['galop', 8.5]]) {
      const st = { v: u * md.speedScale, moving: true, graze: 0, feeder: 0, turn: 0, fat: 1 };
      for (let f = 0; f < 90; f++) md.anim.update(1 / 60, st, {});
      let inside = 0;
      for (let f = 0; f < 16; f++) {
        md.anim.update(1 / 16, st, {});
        md.root.updateMatrixWorld(true);
        for (let i = 0; i < C.length / 3; i++) coat.getVertexPosition(i, p).applyMatrix4(coat.matrixWorld).toArray(C, i * 3);
        const G = [];
        for (let i = 0; i < gp.count; i++) G.push(girth.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(girth.matrixWorld));
        const z0 = Math.min(...G.map((g) => g.z)) - 0.02;
        const z1 = Math.max(...G.map((g) => g.z)) + 0.02;
        // Dans le ventre : verticale qui traverse le pelage un nombre impair de fois au-dessus et au-dessous.
        const up = new Uint16Array(G.length);
        const dn = new Uint16Array(G.length);
        for (let t = 0; t < I.length; t += 3) {
          const [a0, b0, c0] = [I[t] * 3, I[t + 1] * 3, I[t + 2] * 3];
          const [ax, az, bx, bz, cx, cz] = [C[a0], C[a0 + 2], C[b0], C[b0 + 2], C[c0], C[c0 + 2]];
          if (Math.max(az, bz, cz) < z0 || Math.min(az, bz, cz) > z1) continue;
          const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
          if (Math.abs(det) < 1e-12) continue;
          G.forEach((g, k) => {
            const l1 = ((bz - cz) * (g.x - cx) + (cx - bx) * (g.z - cz)) / det;
            const l2 = ((cz - az) * (g.x - cx) + (ax - cx) * (g.z - cz)) / det;
            if (l1 < 0 || l2 < 0 || l1 + l2 > 1) return;
            if (l1 * C[a0 + 1] + l2 * C[b0 + 1] + (1 - l1 - l2) * C[c0 + 1] > g.y) up[k]++;
            else dn[k]++;
          });
        }
        for (let k = 0; k < G.length; k++) if (up[k] % 2 === 1 && dn[k] % 2 === 1) inside++;
      }
      res[gait] = inside;
    }
    // (avant : le bas du ventre, 15 cm sous le coude d'un petit poney, n'était pas compté dans la peau du
    // tronc ; la sangle suivait l'avant-bras et le ventre la traversait de 1 à 3,5 cm, surtout au pas)
    expect(res).toEqual({ pas: 0, trot: 0, 'petit galop': 0, galop: 0 });
    md.dispose();
  }, 60000);
});

describe('« donner le sabot » (tour du spectacle)', () => {
  // Le geste part d'un instant tiré au hasard dans l'allure de repos (Math.random dans RealHorseAnim) : on essaie
  // plusieurs instants FIXÉS pour que le test ne dépende pas du hasard. Tolérance 2 mm : sur quelques instants de
  // la pose au repos, la sole frôle le sol de 1 à 1,4 mm (invisible dans l'herbe).
  it.each(['selle_francais', 'shetland', 'percheron', 'pur_sang', 'falabella'])('%s : le sabot levé ne passe jamais sous le sol et ne saute pas d\'une image à l\'autre', (breed) => {
    const random = Math.random;
    try {
    for (const phase of [0.05, 0.3, 0.45, 0.7, 0.95])
    for (const resting of [false, true]) {
      let i = 0;
      Math.random = () => (phase + 0.137 * i++) % 1;
      const md = horse(animal(breed));
      const l = md.legs[0];
      const p = new THREE.Vector3();
      md.anim.restTimer = 1e9;
      md.anim.resting = resting;
      for (let f = 0; f < 60; f++) md.anim.update(1 / 60, still(), {});
      let low = Infinity;
      let start = null;
      let step = 0;
      let prev = null;
      // (tour de 2,6 s à 60 images/s, amplitude min(1, 1,8 sin(πk)) : Activities, animateTrick)
      const N = 156;
      for (let f = 0; f <= N; f++) {
        const s = Math.min(1, Math.sin((Math.PI * f) / N) * 1.8);
        md.anim.update(1 / 60, still(), {});
        realLegPose(md, 'hoof', s);
        md.root.updateMatrixWorld(true);
        // (points de la sole, 3 mm au-dessus de la vraie sole : celle-ci au sol ou au-dessus)
        const c = new THREE.Vector3();
        let y = Infinity;
        for (const q of l.solePts) {
          p.copy(q).applyMatrix4(l.fetlock.matrixWorld);
          y = Math.min(y, p.y - 0.003);
          c.addScaledVector(p, 1 / l.solePts.length);
        }
        start ??= y;
        low = Math.min(low, y);
        if (prev) step = Math.max(step, c.distanceTo(prev));
        prev = c;
      }
      // (avant : la pince ou les talons piquaient de 1,2 à 1,5 cm au début du geste ; puis, corrigé par un
      // saut dans le geste, le sabot se téléportait de 10 à 20 cm en une image au début et à la fin)
      expect(low, `${breed} ${resting ? 'au repos' : 'debout'} (instant ${phase})`).toBeGreaterThan(Math.min(0, start) - 0.002);
      expect(step, `${breed} ${resting ? 'au repos' : 'debout'} (instant ${phase}) : pas d'une image`).toBeLessThan(0.03);
      md.dispose();
    }
    } finally {
      Math.random = random;
    }
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
      // (autour du sol sous le ventre, la selle reculait ou avançait de ≈ 25 cm ; autour du centre du tronc, de son
      // demi-rayon × sin 0,16 — un peu plus avec la poitrine plus profonde de l'étape 7 : 6 cm)
      expect(Math.abs(s.z - rest.z)).toBeLessThan(0.065);
      expect(rider.position.distanceTo(s)).toBeLessThan(0.002 + seat.distanceTo(rest));
      expect(rider.rotation.x).toBe(pitch);
    }
    md.dispose();
  });

  it.each(['shetland', 'percheron', 'selle_francais'])('%s : les mains du cavalier restent au-dessus de l\'encolure, au galop et pendant tout le saut', async (breed) => {
    const { poseJump } = await import('../src/game/Activities.js');
    const { Player } = await import('../src/game/Player.js');
    const { growthScale } = await import('../src/sim/animal.js');
    const { SPECIES } = await import('../src/sim/species.js');
    const a = animal(breed);
    a.gear = { saddle: { item: 'saddle', color: 'brown' } };
    const md = horse(a);
    const sc = a.look.scale * growthScale(a);
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    const sg = new THREE.Group();
    scene.add(root);
    root.add(sg);
    sg.add(md.root);
    sg.scale.setScalar(sc);
    const e = { model: md, root, scaleGroup: sg, scale: sc, data: a, position: root.position, heading: 0, sp: SPECIES.horse };
    // Cavalier : le joueur sans son constructeur (pas de rendu), un avatar au squelette de buildAvatar avec
    // ses mains (paume, doigts, pouce : mêmes formes, avatarModel.js).
    const pl = Object.create(Player.prototype);
    Object.assign(pl, { scene, root: new THREE.Group(), heading: 0, speed: 0, phase: 0, mount: null, lifeOpts: { speed: 0, riding: false, carry: false } });
    scene.add(pl.root);
    pl.avatar = riderMock();
    pl.root.add(pl.avatar.root);
    pl.ride(e);
    const gallop = { v: 6.5 / sc, moving: true, graze: 0, feeder: 0, turn: 0, fat: 1 };
    // Mains dans le pelage déformé : test de parité vertical (nombre impair de traversées au-dessus et
    // au-dessous), profondeur = plus courte traversée.
    const coat = md.coatMesh;
    const C = new Float32Array(coat.geometry.attributes.position.count * 3);
    const I = coat.geometry.index.array;
    const depth = () => {
      scene.updateMatrixWorld(true);
      const v = new THREE.Vector3();
      for (let i = 0; i < C.length / 3; i++) coat.getVertexPosition(i, v).applyMatrix4(coat.matrixWorld).toArray(C, i * 3);
      const P = [];
      for (const h of pl.avatar.hands) {
        h.traverse((o) => {
          if (!o.isMesh) return;
          const pos = o.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) P.push(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).clone());
        });
      }
      const up = P.map(() => []);
      const dn = P.map(() => []);
      for (let t = 0; t < I.length; t += 3) {
        const [a0, b0, c0] = [I[t] * 3, I[t + 1] * 3, I[t + 2] * 3];
        const [ax, az, bx, bz, cx, cz] = [C[a0], C[a0 + 2], C[b0], C[b0 + 2], C[c0], C[c0 + 2]];
        const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(det) < 1e-12) continue;
        P.forEach((p, k) => {
          const l1 = ((bz - cz) * (p.x - cx) + (cx - bx) * (p.z - cz)) / det;
          const l2 = ((cz - az) * (p.x - cx) + (ax - cx) * (p.z - cz)) / det;
          if (l1 < 0 || l2 < 0 || l1 + l2 > 1) return;
          const y = l1 * C[a0 + 1] + l2 * C[b0 + 1] + (1 - l1 - l2) * C[c0 + 1];
          (y > p.y ? up : dn)[k].push(Math.abs(y - p.y));
        });
      }
      let worst = 0;
      P.forEach((p, k) => {
        if (up[k].length % 2 === 1 && dn[k].length % 2 === 1) worst = Math.max(worst, Math.min(...up[k], ...dn[k]));
      });
      return worst;
    };
    let gal = 0;
    let jump = 0;
    pl.speed = 6.5;
    for (let f = 0; f < 40; f++) {
      md.anim.update(1 / 60, gallop, {});
      pl.lateUpdate(1 / 60);
      pl.afterSessions();
      if (f >= 20 && f % 4 === 0) gal = Math.max(gal, depth());
    }
    // (saut de 0,7 m : 0,77 s ; une image sur deux mesurée)
    const N = 46;
    for (let f = 0; f <= N; f++) {
      md.anim.update(1 / 60, gallop, {});
      pl.lateUpdate(1 / 60);
      poseJump(e, pl, f / N);
      pl.afterSessions();
      if (f % 2 === 0) jump = Math.max(jump, depth());
    }
    // (avant : jusqu'à 6 cm au galop, et 7 à 11 cm à la réception ; 2 mm de marge pour le maillage)
    expect(gal, `${breed} au galop`).toBeLessThan(0.002);
    expect(jump, `${breed} au saut`).toBeLessThan(0.002);
    md.dispose();
  }, 60000);

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
    // Crinière tressée : les mèches des cartes de crins rentrent dans les boutons, et ressortent sans les tresses.
    expect(md.hairMesh.material.userData.hairBraid.value).toBe(1);
    Beauty.removeBeautyDecor(e);
    expect(md.hairMesh.material.userData.hairBraid.value).toBe(0);
    md.dispose();
  });

  it.each(['selle_francais', 'arabe'])('%s : la tresse de queue suit les crins pendant un coup de queue', (breed) => {
    const { md, e } = dressed(breed);
    // (instants des allures fixés : le mixeur part sinon d'un instant tiré au sort)
    md.anim.t = 10;
    for (const act of Object.values(md.anim.actions)) act.time = act.getClip().duration * 0.3;
    md.anim.mixer.update(0);
    // (coup de queue le plus fort de tailSwish : 0,35 rad, Tail1 à 0,6 × comme dans overlay)
    md.tail.rotateZ(0.35 * 0.6);
    md.tailTip.rotateZ(0.35);
    md.root.updateMatrixWorld(true);
    md.hairMesh.skeleton.update();
    const g = md.hairMesh.geometry.attributes;
    const pts = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < g.position.count; i++) if (g.hairRoot.getW(i) === 2) pts.push(md.hairMesh.getVertexPosition(i, v).clone());
    const beads = [];
    for (const grp of e.beautyDecor.groups) if ((grp.parent === md.tail || grp.parent === md.tailTip) && grp.isMesh) beads.push(grp.getWorldPosition(new THREE.Vector3()));
    expect(beads.length).toBeGreaterThan(5);
    for (const b of beads) {
      // crins de la queue à la hauteur de la perle : la perle est dans leur largeur (sans les 10 % des bords)
      const near = pts.filter((p) => Math.abs(p.y - b.y) < 0.025);
      expect(near.length, `${breed} y ${b.y.toFixed(2)}`).toBeGreaterThan(4);
      const xs = near.map((p) => p.x).sort((x, y) => x - y);
      const lo = xs[Math.floor(xs.length * 0.1)];
      const hi = xs[Math.floor(xs.length * 0.9)];
      expect(b.x, `${breed} y ${b.y.toFixed(2)} : perle sur la queue`).toBeGreaterThan(lo - 0.01);
      expect(b.x, `${breed} y ${b.y.toFixed(2)} : perle sur la queue`).toBeLessThan(hi + 0.01);
    }
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
