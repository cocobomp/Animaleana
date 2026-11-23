// 🎀 Concours de beauté d'un cheval (src/game/Beauty.js) : devant le juge, la caméra le montre de trois quarts avant
// avec l'enfant (plus sa croupe de dos) ; la photo du podium montre sa tête, son corps et l'enfant (plus seulement ses
// pattes) ; les drapeaux du retour sont en travers du chemin, hors du passage du cheval mené.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';

let B;
let CameraRig;
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
  ({ CameraRig } = await import('../src/game/Player.js'));
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

describe('📸 la photo du podium (beautyShot « podium » et la bande gardée)', () => {
  it('sa tête, son corps et ses sabots dans la bande 16:10 du milieu, champ élargi le temps de la photo', () => {
    const e = { position: V(9.2, 0.45, 3.6), heading: Math.PI, scale: 1, data: { species: 'horse' } };
    const { cam } = shotCamera(e, 'podium', PORTRAIT);
    // (Beauty.takePhoto : bande de 16:10 sur toute la largeur ; champ vertical de 40° dans cette bande)
    const band = (390 / 1.6) / 844;
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(20)) / band));
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    for (const q of HORSE) {
      const s = toWorld(e, q).project(cam);
      expect(Math.abs(s.y), `${q}`).toBeLessThan(band);
      expect(Math.abs(s.x), `${q}`).toBeLessThan(0.98);
    }
    // de trois quarts (pas de face) : la caméra n'est pas dans l'axe du cheval
    const fwd = V(Math.sin(e.heading), 0, Math.cos(e.heading));
    const to = cam.position.clone().sub(e.position).setY(0).normalize();
    expect(Math.acos(to.dot(fwd))).toBeGreaterThan(0.4);
  });
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
