// 🎀 Concours de beauté d'un cheval (src/game/Beauty.js) : devant le juge, la caméra le montre de trois quarts avant
// avec l'enfant (plus sa croupe de dos) ; la photo du podium montre sa tête, son corps et l'enfant (plus seulement ses
// pattes) ; les drapeaux du retour sont en travers du chemin, hors du passage du cheval mené.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';

let B;
let CameraRig;
let PlayerMod;
beforeAll(async () => {
  const mem = new Map();
  globalThis.localStorage = globalThis.localStorage ?? {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k),
    key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
  };
  globalThis.window = globalThis.window ?? { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 };
  globalThis.document = globalThis.document ?? {
    addEventListener() {}, hidden: false, documentElement: { lang: 'fr' }, body: { classList: { add() {}, remove() {} } }, getElementById: () => null, createElement: () => ({ getContext: () => null, style: {} }),
  };
  globalThis.matchMedia = globalThis.matchMedia ?? (() => ({ matches: true }));
  B = await import('../src/game/Beauty.js');
  PlayerMod = await import('../src/game/Player.js');
  ({ CameraRig } = PlayerMod);
}, 60000);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PORTRAIT = 390 / 844;
const LANDSCAPE = 844 / 390;
const world = { insideBuilding: () => false, heightAt: () => 0 };
const still = () => ({ look: { dx: 0, dy: 0 }, zoom: 0 });
// Cheval de taille 1 debout (repère du cheval : x à sa gauche, y en haut, z devant) : sabots, croupe, queue, poitrail,
// oreilles, bout du nez.
const HORSE = [[0.15, 0, 0.75], [-0.15, 0, -0.6], [0, 1.6, -0.8], [0, 0.5, -1.35], [0, 1.25, 0.9], [0.2, 2.05, 1.3], [-0.15, 2.05, 1.3], [0, 1.55, 1.65]];
const toWorld = (e, q) => V(q[0] * e.scale, q[1] * e.scale, q[2] * e.scale).applyAxisAngle(V(0, 1, 0), e.heading).add(e.position);

function shotCamera(e, kind, aspect, frames = 400) {
  const cam = new THREE.PerspectiveCamera(60, aspect, 0.1, 500);
  const rig = new CameraRig(cam);
  // (l'enfant à la gauche du cheval, devant son épaule : Beauty.animalGoal le met 1,1 m à droite de l'enfant, 0,5 m derrière)
  const left = V(Math.cos(e.heading), 0, -Math.sin(e.heading));
  const fwd = V(Math.sin(e.heading), 0, Math.cos(e.heading));
  const child = e.position.clone().addScaledVector(left, 1.1).addScaledVector(fwd, 0.5);
  const p = { position: child, eyeHeight: 1.5, heading: e.heading, speed: 0, auto: false, mount: null, avatar: { root: { visible: true } } };
  rig.yaw = e.heading;
  const at = new THREE.Vector3();
  for (let i = 0; i < frames; i++) {
    rig.focus = { shot: B.beautyShot(e, kind, at, aspect) };
    rig.update(1 / 30, still(), p, world);
  }
  cam.updateMatrixWorld(true);
  return { cam, child };
}

describe('🎀 devant le juge : le cheval de trois quarts avant, avec l\'enfant', () => {
  for (const sc of [1.05, 0.58]) {
    for (const [label, aspect] of [['en hauteur', PORTRAIT], ['en largeur', LANDSCAPE]]) {
      it(`taille ${sc}, ${label}`, () => {
        const e = { position: V(-12.5, 0, -5), heading: 1.2, scale: sc, data: { species: 'horse' } };
        const { cam, child } = shotCamera(e, 'judge', aspect);
        // devant le cheval (plus sa croupe)
        const fwd = V(Math.sin(e.heading), 0, Math.cos(e.heading));
        expect(cam.position.clone().sub(e.position).setY(0).normalize().dot(fwd)).toBeGreaterThan(0.6);
        for (const q of HORSE) {
          const s = toWorld(e, q).project(cam);
          expect(Math.abs(s.x), `${q}`).toBeLessThan(0.95);
          expect(s.y, `${q}`).toBeLessThan(0.75);
          expect(s.y, `${q}`).toBeGreaterThan(-0.92);
        }
        // l'enfant (pieds et tête) aussi
        for (const y of [0, 1.45]) {
          const s = child.clone().setY(y).project(cam);
          expect(Math.abs(s.x)).toBeLessThan(0.95);
          expect(Math.abs(s.y)).toBeLessThan(0.92);
        }
      });
    }
  }
});

describe('🏆 le podium avec un cheval (beautyPodiumSpot, beautyPodiumShot)', () => {
  // le podium de Beauty.js tourné de 180° : marches de 1 m, au milieu 0,7 m, puis 0,5 m (+1,1 m en x) et 0,35 m (−1,1 m)
  const POD_X = 10;
  const POD_Z = 3.6;
  const STEPS = [{ x: POD_X, z: POD_Z, h: 0.7 }, { x: POD_X + 1.1, z: POD_Z, h: 0.5 }, { x: POD_X - 1.1, z: POD_Z, h: 0.35 }];
  const onAStep = (e) => {
    const f = V(Math.sin(e.heading), 0, Math.cos(e.heading));
    const l = V(Math.cos(e.heading), 0, -Math.sin(e.heading));
    for (let i = -10; i <= 10; i++) {
      for (const j of [-1, 0, 1]) {
        const q = e.position.clone().addScaledVector(f, (i / 10) * 1.1 * e.scale).addScaledVector(l, j * 0.33 * e.scale);
        if (STEPS.some((s) => Math.abs(q.x - s.x) < 0.5 && Math.abs(q.z - s.z) < 0.5)) return true;
      }
    }
    return false;
  };
  for (const sc of [1.06, 0.58]) {
    for (const [label, aspect] of [['en hauteur', PORTRAIT], ['en largeur', LANDSCAPE]]) {
      it(`taille ${sc}, ${label} : le cheval au sol, l'enfant sur sa marche, tous les deux entiers sur l'écran et la photo`, () => {
        for (const step of STEPS) {
          const spot = B.beautyPodiumSpot(step, POD_X, sc);
          const e = { position: V(spot.horse.x, 0, spot.horse.z), heading: spot.horse.heading, scale: sc, data: { species: 'horse' } };
          expect(onAStep(e)).toBe(false);
          // le bout du nez près de l'enfant (à moins de 0,9 m de sa marche)
          const nose = toWorld(e, [0, 1.55, 1.65]);
          expect(Math.abs(nose.x - step.x)).toBeLessThan(0.5 + 0.9);
          const child = { position: V(step.x, step.h, step.z), eyeHeight: 1.5, heading: Math.PI, speed: 0, auto: false, mount: null, avatar: { root: { visible: true } } };
          const cam = new THREE.PerspectiveCamera(60, aspect, 0.1, 500);
          const rig = new CameraRig(cam);
          rig.yaw = Math.PI;
          const at = new THREE.Vector3();
          for (let i = 0; i < 300; i++) {
            rig.focus = { shot: B.beautyPodiumShot(e, child, at, aspect) };
            rig.update(1 / 30, still(), child, world);
          }
          cam.updateMatrixWorld(true);
          // la photo (Beauty.takePhoto) : la caméra à la place exacte du plan, bande 16:10, 40° de haut dans la bande
          const photo = cam.clone();
          const { shotPose } = PlayerMod;
          const shot = B.beautyPodiumShot(e, child, new THREE.Vector3(), aspect);
          shotPose(shot, photo.position);
          photo.lookAt(shot.at);
          const band = Math.min(1, (aspect / 1.6));
          if (band < 0.9) photo.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(20)) / band));
          photo.updateProjectionMatrix();
          photo.updateMatrixWorld(true);
          expect(photo.position.distanceTo(cam.position)).toBeLessThan(0.1);
          const pts = [...HORSE.map((q) => toWorld(e, q)), V(step.x, step.h, step.z), V(step.x, step.h + 1.55, step.z)];
          for (const [c, lim] of [[cam, 0.92], [photo, band < 0.9 ? band * 0.95 : 0.92]]) {
            for (const w of pts) {
              const s = w.clone().project(c);
              expect(Math.abs(s.x), `${w.toArray()}`).toBeLessThan(0.95);
              expect(Math.abs(s.y), `${w.toArray()}`).toBeLessThan(lim);
            }
          }
          // pas cachée par le cheval : de la caméra, sa tête (1,3 m au-dessus de la marche) passe au-dessus de son dos
          const head = V(step.x, step.h + 1.3, step.z);
          const ray = new THREE.Ray(photo.position, head.clone().sub(photo.position).normalize());
          const back = new THREE.Box3().setFromPoints([toWorld(e, [0.3, 0, -0.9]), toWorld(e, [-0.3, 1.45, 0.6])]);
          expect(ray.intersectsBox(back)).toBe(false);
        }
      });
    }
  }
});

describe('🏁 les drapeaux du retour', () => {
  it('en travers du chemin et larges : le cheval mené à 1,1 m de l\'enfant passe entre les poteaux, loin d\'eux', () => {
    expect(B.FLAG_WIDTH).toBeGreaterThanOrEqual(6);
    const { start, judge, back } = B.RING;
    // poteaux : à ± largeur / 2 en travers (le long de z, dans le repère de la piste), au point du retour
    const posts = [V(back.x, 0, back.z - B.FLAG_WIDTH / 2), V(back.x, 0, back.z + B.FLAG_WIDTH / 2)];
    let min = Infinity;
    for (let i = 0; i <= 200; i++) {
      const u = i / 200;
      const kid = V(start.x + (judge.x - start.x) * u, 0, start.z + (judge.z - start.z) * u);
      const dir = V(judge.x - start.x, 0, judge.z - start.z).normalize();
      const right = V(dir.z, 0, -dir.x);
      const horse = kid.clone().addScaledVector(right, 1.1).addScaledVector(dir, -0.5);
      for (const p of posts) min = Math.min(min, horse.distanceTo(p), kid.distanceTo(p));
    }
    expect(min).toBeGreaterThan(1.2);
  });
});

describe('🎀 cheval mené au pas vers le juge (rig.focus.pair de côté, posé par Beauty.update)', () => {
  for (const [label, aspect] of [['téléphone en hauteur', PORTRAIT], ['en largeur', LANDSCAPE]]) {
    it(`${label} : en marchant et en tournant vers le juge, la caméra reste loin de lui et le montre entier`, () => {
      const cam = new THREE.PerspectiveCamera(60, aspect, 0.1, 500);
      const rig = new CameraRig(cam);
      const child = V(0, 0, 0);
      const p = { position: child, eyeHeight: 1.5, heading: 0, speed: 1.2, auto: true, mount: null, avatar: { root: { visible: true } } };
      const e = { position: V(0, 0, 0), heading: 0, scale: 1 };
      rig.yaw = 0;
      let worst = 99;
      for (let i = 0; i < 300; i++) {
        // (à mi-chemin, l'enfant tourne d'un quart de tour vers la gauche, vers le juge)
        if (i === 120) p.heading = Math.PI / 2;
        p.yaw = p.heading;
        child.x += Math.sin(p.heading) * 1.2 / 30;
        child.z += Math.cos(p.heading) * 1.2 / 30;
        // (le cheval 1,1 m à droite de l'enfant, 0,5 m derrière : Beauty.animalGoal)
        const right = V(-Math.cos(p.heading), 0, Math.sin(p.heading));
        const fwd = V(Math.sin(p.heading), 0, Math.cos(p.heading));
        e.position.copy(child).addScaledVector(right, 1.1).addScaledVector(fwd, -0.5);
        e.heading = p.heading;
        rig.yaw += (p.heading - rig.yaw) * Math.min(1, 3 / 30);
        rig.focus = { pair: e.position, side: true, scale: 1 };
        rig.update(1 / 30, still(), p, world);
        if (i < 60) continue;
        cam.updateMatrixWorld(true);
        worst = Math.min(worst, ...HORSE.map((q) => toWorld(e, q).distanceTo(cam.position)));
        if (i > 200) {
          for (const q of HORSE) {
            const s = toWorld(e, q).project(cam);
            expect(Math.abs(s.x), `${i} ${q}`).toBeLessThan(1);
            expect(Math.abs(s.y), `${i} ${q}`).toBeLessThan(1);
          }
        }
      }
      // (jamais tout près de lui, même pendant le virage)
      expect(worst).toBeGreaterThan(2.2);
    });
  }
});
