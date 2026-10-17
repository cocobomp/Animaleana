// Personnages, phase 2 (corrections) : jambes du cavalier (genou plié, pied fixe dans l'étrier au
// trot enlevé), allure d'un cheval GLB, gestes d'attente autour du chapeau, liste de tâches qui
// attend la fin du geste de soin, et libération d'une coiffure sans toucher aux formes partagées.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stirrupFor, clipGait, gaitFromSpeed, LEG, riderPose, IDLE_GESTURES } from '../src/game/models/avatarMotion.js';
import { animateAvatarRide, legReach, initLife, updateAvatarLife } from '../src/game/models/avatarRig.js';
import { tintHair, __hairFieldForTest } from '../src/game/models/avatarHair.js';
import { headSdf } from '../src/game/models/avatarHead.js';
import { TaskQueue } from '../src/game/TaskQueue.js';

/** Squelette de buildAvatar (mêmes articulations et mêmes longueurs), sans les formes. */
function mockAvatar({ hat = null, hairBulk = 0.03 } = {}) {
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
    arms.push(sh);
    elbows.push(el);
    hands.push(hand);
  }
  const head = new THREE.Group();
  head.position.set(0, 1.5 - 0.82, 0);
  head.scale.setScalar(1.1);
  torso.add(head);
  const a = { root, legs, knees, ankles, arms, elbows, hands, head, torso, chest: new THREE.Group(), eyeBalls: null, lids: [], hairTail: null, carry: null, hat, hairBulk };
  initLife(a, 3);
  return a;
}

const horse = new THREE.Group(); // repère du cheval (le joueur est à la même place)
const world = new THREE.Vector3();

describe('à cheval : jambes', () => {
  it("les pieds vont dans l'étrier, contre le flanc, genou plié de 60 à 85° avec une selle", () => {
    for (const R of [0.28, 0.32, 0.36, 0.42]) {
      const f = stirrupFor(R, true);
      const dx = f.x - 0.095;
      const dy = f.y - 0.82;
      const d = Math.hypot(dx, dy, f.z);
      expect(d).toBeLessThan(LEG.thigh + LEG.shin - 0.05); // atteignable : jambe pas tendue
      const cosK = (LEG.thigh ** 2 + LEG.shin ** 2 - d * d) / (2 * LEG.thigh * LEG.shin);
      const knee = (Math.PI - Math.acos(cosK)) * 57.3;
      expect(knee).toBeGreaterThan(60);
      expect(knee).toBeLessThan(85);
      expect(f.x).toBeGreaterThanOrEqual(R + 0.02); // le pied longe le flanc, dehors
      expect(f.x).toBeLessThan(R + 0.06);
      expect(f.z).toBeGreaterThan(0); // un peu en avant de la hanche
    }
    // Sans selle : les jambes pendent plus bas, genou moins plié.
    expect(stirrupFor(0.36, false).y).toBeLessThan(stirrupFor(0.36, true).y);
  });

  it('legReach met la cheville sur la cible, genou du côté demandé', () => {
    const a = mockAvatar();
    const target = new THREE.Vector3(0.3, 0.3, 0.18);
    legReach(a, 0, target, new THREE.Vector3(0.6, -0.1, 0.8));
    a.root.updateMatrixWorld(true);
    a.ankles[0].getWorldPosition(world);
    expect(world.distanceTo(target)).toBeLessThan(0.002);
    const knee = a.knees[0].getWorldPosition(new THREE.Vector3());
    expect(knee.z).toBeGreaterThan(0.1); // genou vers l'avant
    expect(knee.x).toBeGreaterThan(0.2); // et vers l'extérieur
    expect(a.knees[0].rotation.x).toBeGreaterThan(0.9);
  });

  for (const [name, saddleY] of [['GLB', 1.48], ['procédural', 1.6]]) {
    it(`cheval ${name} (R = 0,36, selle à ${saddleY} m) : genou plié et cheville immobile au trot enlevé`, () => {
      const a = mockAvatar();
      horse.add(a.root);
      const f = stirrupFor(0.36, true);
      const st = {
        gait: 1, phase: 0, posting: true, bob: 0, seatY: saddleY - 0.78, seatZ: -0.075,
        reinsY: 1.0, reinsZ: 0.36, footX: f.x, footY: f.y, footZ: f.z, kneeOut: f.out,
      };
      let min = [9, 9, 9];
      let max = [-9, -9, -9];
      let kneeMin = 9;
      let kneeMax = 0;
      let liftMax = 0;
      for (let i = 0; i < 48; i++) {
        st.phase = (i / 48) * Math.PI * 2;
        liftMax = Math.max(liftMax, riderPose(1, st.phase, true).lift);
        animateAvatarRide(a, st);
        horse.updateMatrixWorld(true);
        for (let k = 0; k < 2; k++) {
          kneeMin = Math.min(kneeMin, a.knees[k].rotation.x);
          kneeMax = Math.max(kneeMax, a.knees[k].rotation.x);
        }
        a.ankles[0].getWorldPosition(world);
        min = [Math.min(min[0], world.x), Math.min(min[1], world.y), Math.min(min[2], world.z)];
        max = [Math.max(max[0], world.x), Math.max(max[1], world.y), Math.max(max[2], world.z)];
      }
      horse.remove(a.root);
      expect(liftMax).toBeGreaterThan(0.05); // le bassin se lève bien
      for (let c = 0; c < 3; c++) expect(max[c] - min[c]).toBeLessThan(0.005); // le pied reste dans l'étrier
      expect(kneeMin * 57.3).toBeGreaterThan(35); // jamais la jambe tendue
      expect(kneeMax * 57.3).toBeGreaterThan(60);
      // Pied près de l'étrier des selles (à 1,4 R sous le dos ; cheville 5 cm au-dessus de la semelle).
      expect(Math.abs(min[1] - (saddleY - 1.4 * 0.36 + 0.05))).toBeLessThan(0.05);
    });
  }
});

describe('à cheval : allure du cheval GLB', () => {
  it("pas de trot enlevé quand le GLB joue « walk » : seulement pas ou galop, aux seuils d'animateGltf", () => {
    const run = 5;
    // Entre walk × 1,45 et run × 0,65, l'ancien calcul disait « trot » alors que le GLB marchait.
    expect(gaitFromSpeed(3.17, 1.6, run)).toBe(1);
    expect(clipGait(3.17, run)).toBe(0);
    expect(clipGait(run * 0.65 + 0.01, run)).toBe(2);
    expect(clipGait(1, run)).toBe(0);
  });
});

describe("gestes d'attente et coiffure", () => {
  // Pose debout remise à chaque image, comme animateAvatarWalk(a, 0, 0).
  const rest = (a) => {
    for (let i = 0; i < 2; i++) {
      const sd = i === 0 ? 1 : -1;
      a.legs[i].rotation.set(0, 0, 0);
      a.knees[i].rotation.set(0, 0, 0);
      a.ankles[i].rotation.set(0, 0, 0);
      a.arms[i].rotation.set(0, 0, sd * 0.08);
      a.elbows[i].rotation.set(-0.2, 0, 0);
      a.hands[i].rotation.set(0, 0, 0);
    }
    a.torso.rotation.set(0, 0, 0);
    a.head.rotation.set(0, 0, 0);
    a.root.position.y = 0;
  };
  const handWhile = (a, kind, t) => {
    for (let i = 0; i < 40; i++) {
      rest(a);
      updateAvatarLife(a, 0.05, { noGestures: true });
    }
    rest(a);
    const g = a.life.gesture;
    g.kind = kind;
    g.t = t;
    g.dur = IDLE_GESTURES[kind];
    g.k = 1;
    a.life.gestureIn = 1e9;
    updateAvatarLife(a, 0.0001);
    a.root.updateMatrixWorld(true);
    return a.hands[1].getWorldPosition(new THREE.Vector3());
  };

  it('se gratter la tête avec un chapeau : la main se pose sur le chapeau, pas dedans', () => {
    const hat = { r: 0.15 * 1.26, c: [0, 0.09, -0.005] }; // bouclés : chapeau agrandi
    const a = mockAvatar({ hat, hairBulk: 0.075 });
    const hand = handWhile(a, 'scratch', 1.2);
    const c = a.head.localToWorld(new THREE.Vector3(...hat.c));
    const r = hat.r * a.head.scale.x;
    expect(hand.distanceTo(c)).toBeGreaterThan(r);
    expect(hand.distanceTo(c)).toBeLessThan(r + 0.08);
  });

  it("s'étirer : les mains s'écartent davantage autour d'une coiffure volumineuse", () => {
    const thin = handWhile(mockAvatar({ hairBulk: 0.006 }), 'stretch', 1.3);
    const curly = handWhile(mockAvatar({ hairBulk: 0.075 }), 'stretch', 1.3);
    expect(Math.abs(curly.x)).toBeGreaterThan(Math.abs(thin.x) + 0.05);
  });
});

describe('cheveux longs : le rideau contre le cou et les épaules', () => {
  it('est découpé dans la forme (aucun cheveu dans le cou ni les épaules) au lieu de trous dans le maillage', () => {
    const { field } = __hairFieldForTest('long', headSdf, false, 0.0158);
    // Dans le cou, le haut du dos et les épaules (repère de la tête) : hors des cheveux.
    for (const p of [[0, -0.06, -0.035], [0, -0.12, -0.04], [0.15, -0.16, 0], [-0.15, -0.16, 0.01], [0.05, -0.2, -0.08]]) {
      expect(field(...p)).toBeGreaterThan(0);
    }
    // Juste derrière le dos et à côté du visage : les cheveux sont bien là.
    expect(field(0, -0.17, -0.128)).toBeLessThan(0);
    expect(field(0.118, -0.03, 0.036)).toBeLessThan(0);
  });
});

describe('coiffures : libérer un personnage', () => {
  it('ne libère que sa couleur, pas les formes partagées avec les autres', () => {
    const shared = new THREE.BufferGeometry();
    shared.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0.2, 0, 0.1, 0.2, 0, 0, 0.3, 0]), 3));
    shared.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
    shared.setIndex([0, 1, 2]);
    shared.userData.groove = new Float32Array(3);
    const a = tintHair(shared, 0x4a2f1d);
    const b = tintHair(shared, 0xd2a557);
    // Ce que fait three (WebGLGeometries) à la libération : supprimer les tampons de chaque attribut.
    const removed = [];
    a.addEventListener('dispose', (e) => {
      const g = e.target;
      if (g.index) removed.push(g.index);
      for (const k in g.attributes) removed.push(g.attributes[k]);
    });
    const color = a.attributes.color;
    a.dispose();
    expect(removed).toEqual([color]);
    expect(b.attributes.position).toBe(shared.attributes.position);
    expect(b.index).toBe(shared.index);
  });
});

describe('liste de tâches : le geste de soin se joue', () => {
  const fakeGame = () => {
    const calls = [];
    const g = {
      paused: false,
      ui: { renderTasks() {}, toast() {}, t: (k) => k, refresh() {} },
      busy: false,
      player: { auto: null, cancelGoTo() {}, careBusy: () => g.busy },
      walkTo: (target, r, arrive) => calls.push(arrive),
      planAutoTasks: () => [],
    };
    return { g, calls };
  };

  it("attend la fin du geste (et du petit pas) avant de partir vers la tâche suivante, 4 s au plus", () => {
    const { g, calls } = fakeGame();
    const q = new TaskQueue(g);
    const done = [];
    for (const n of [1, 2]) q.add({ label: `t${n}`, target: () => new THREE.Vector3(n, 0, 0), auto: () => done.push(n) });
    q.start();
    q.update();
    expect(calls.length).toBe(1);
    // Arrivée : la tâche se fait, le soin lance le geste (le joueur est occupé).
    g.busy = true;
    calls[0]();
    expect(done).toEqual([1]);
    for (let i = 0; i < 60; i++) q.update(); // 1 s : on attend
    expect(calls.length).toBe(1);
    g.busy = false;
    q.update();
    expect(calls.length).toBe(2);
    // Un geste qui ne finirait jamais ne bloque pas la liste.
    q.add({ label: 't3', target: () => new THREE.Vector3(3, 0, 0), auto: () => {} });
    g.busy = true;
    calls[1]();
    for (let i = 0; i < 4 * 60 - 5; i++) q.update();
    expect(calls.length).toBe(2);
    for (let i = 0; i < 10; i++) q.update();
    expect(calls.length).toBe(3);
  });
});
