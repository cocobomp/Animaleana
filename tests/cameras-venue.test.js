// 🏆 Cérémonie des concours à l'extérieur (src/game/CompetitionVenue.js) : comme en vrai, le cheval ne monte jamais
// sur la marche du podium (ses jambes s'y enfonçaient) ; à cheval, au pied de sa marche ; à pied, la cavalière sur la
// marche et son cheval à côté ; la caméra les montre de trois quarts avant, entiers.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';

let C;
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
  C = await import('../src/game/CompetitionVenue.js');
  ({ CameraRig } = await import('../src/game/Player.js'));
}, 60000);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// Le podium de models/venue.js : trois marches de 1,6 m le long de z (1 au milieu, 0,75 m ; 2 à −1,7 m, 0,5 m ; 3 à +1,7 m, 0,3 m).
const POD = { x: 40, z: -9, steps: [{ x: 40, z: -9, y: 0.75 }, { x: 40, z: -10.7, y: 0.5 }, { x: 40, z: -7.3, y: 0.3 }] };

/** Le cheval (centre, cap, taille) touche-t-il une marche ? Emprise : 1,05 m devant et derrière, 0,35 m de côté (× taille). */
function onAStep(h, sc) {
  const f = V(Math.sin(h.heading), 0, Math.cos(h.heading));
  const l = V(Math.cos(h.heading), 0, -Math.sin(h.heading));
  for (let i = -10; i <= 10; i++) {
    for (const j of [-1, 0, 1]) {
      const q = V(h.x, 0, h.z).addScaledVector(f, (i / 10) * 1.05 * sc).addScaledVector(l, j * 0.35 * sc);
      if (POD.steps.some((s) => Math.abs(q.x - s.x) < 0.8 && Math.abs(q.z - s.z) < 0.8)) return true;
    }
  }
  return false;
}

describe('🏆 places de la cérémonie', () => {
  for (const sc of [1.06, 0.58, 0.5]) {
    it(`taille ${sc} : à cheval, au pied de sa marche, face à la carrière ; jamais sur une marche`, () => {
      for (const rank of [1, 2, 3, 6]) {
        const s = C.ceremonySpot(POD, rank, { mounted: true, scale: sc });
        expect(s.player.y).toBe(0);
        expect(s.horse.x).toBe(s.player.x);
        expect(onAStep(s.horse, sc), `rang ${rank}`).toBe(false);
        if (rank <= 3) {
          // devant sa marche (même z), à moins de 0,6 m de la marche
          const step = POD.steps[rank - 1];
          expect(s.horse.z).toBe(step.z);
          const rump = s.horse.x + 1.0 * sc;
          expect(rump).toBeLessThan(step.x - 0.8);
          expect(rump).toBeGreaterThan(step.x - 0.8 - 0.6);
          expect(s.horse.heading).toBeCloseTo(-Math.PI / 2, 5);
        }
      }
    });

    it(`taille ${sc} : à pied, la cavalière sur sa marche, son cheval au sol à côté d'elle`, () => {
      for (const rank of [1, 2, 3]) {
        const s = C.ceremonySpot(POD, rank, { mounted: false, scale: sc });
        const step = POD.steps[rank - 1];
        expect(s.player.y).toBe(step.y);
        expect(Math.hypot(s.player.x - step.x, s.player.z - step.z)).toBeLessThan(0.01);
        expect(onAStep(s.horse, sc), `rang ${rank}`).toBe(false);
        expect(Math.hypot(s.horse.x - s.player.x, s.horse.z - s.player.z)).toBeLessThan(2.2);
      }
    });
  }
});

describe('📸 la caméra de la cérémonie', () => {
  it('à cheval : de trois quarts avant, le cheval et sa cavalière entiers, le podium derrière ; aussi dans la bande de la photo', () => {
    const s = C.ceremonySpot(POD, 1, { mounted: true, scale: 1 });
    const e = { position: V(s.horse.x, 0, s.horse.z), heading: s.horse.heading, scale: 1 };
    const rider = { position: e.position, eyeHeight: 1.5 + 1.15, heading: e.heading, speed: 0, auto: false, mount: e, avatar: { root: { visible: true } } };
    for (const aspect of [390 / 844, 844 / 390]) {
      const cam = new THREE.PerspectiveCamera(60, aspect, 0.1, 500);
      const rig = new CameraRig(cam);
      rig.yaw = e.heading;
      const at = new THREE.Vector3();
      for (let i = 0; i < 400; i++) {
        rig.focus = { shot: C.ceremonyShot(e, rider, at) };
        rig.update(1 / 30, { look: { dx: 0, dy: 0 }, zoom: 0 }, rider, { insideBuilding: () => false, heightAt: () => 0 });
      }
      // devant le cheval, du côté de la carrière
      expect(cam.position.x).toBeLessThan(e.position.x - 2);
      const band = aspect < 1 ? (390 / 1.6) / 844 : 1;
      if (band < 0.9) cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(20)) / band));
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      const f = V(Math.sin(e.heading), 0, Math.cos(e.heading));
      const pts = [V(0, 0, 0).addScaledVector(f, 0.75), V(0, 0, 0).addScaledVector(f, -0.6), V(0, 2.05, 0).addScaledVector(f, 1.3), V(0, 0.5, 0).addScaledVector(f, -1.35), V(0, 2.56, 0)];
      for (const q of pts) {
        const p = q.add(e.position).project(cam);
        expect(Math.abs(p.y)).toBeLessThan(band * 0.98);
        expect(Math.abs(p.x)).toBeLessThan(0.98);
      }
    }
  });
});
