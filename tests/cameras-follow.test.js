// 🐴 « Me suivre » (src/game/Player.js CameraRig, rig.focus.pair avec side posé par Game.frame) : un cheval qui suit la
// joueuse marche derrière elle, entre elle et la caméra (on ne voyait que sa tête géante, coupée en bas). La caméra se
// met de côté et recule : la joueuse et son cheval entiers, en marchant et à l'arrêt.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';

let P;
beforeAll(async () => {
  globalThis.window = globalThis.window ?? { addEventListener() {}, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 };
  globalThis.document = globalThis.document ?? {
    addEventListener() {}, hidden: false, documentElement: { lang: 'fr' }, body: { classList: { add() {}, remove() {} } }, getElementById: () => null, createElement: () => ({ getContext: () => null, style: {} }),
  };
  globalThis.matchMedia = globalThis.matchMedia ?? (() => ({ matches: true }));
  P = await import('../src/game/Player.js');
}, 60000);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const world = { insideBuilding: () => false, heightAt: () => 0 };
const still = () => ({ look: { dx: 0, dy: 0 }, zoom: 0 });
// Cheval de taille sc (repère du cheval : x à sa gauche, y en haut, z devant) : sabots, croupe, queue, oreilles, nez.
const HORSE = [[0.15, 0, 0.75], [-0.15, 0, -0.6], [0, 1.6, -0.8], [0, 0.5, -1.35], [0.2, 2.05, 1.3], [0, 1.55, 1.65]];

function settle(aspect, horsePos, sc, { speed = 1.5, frames = 600 } = {}) {
  const cam = new THREE.PerspectiveCamera(60, aspect, 0.1, 500);
  const rig = new P.CameraRig(cam);
  const p = { position: V(0, 0, 0), eyeHeight: 1.5, heading: 0, speed, auto: false, mount: null, avatar: { root: { visible: true } } };
  rig.yaw = 0;
  for (let i = 0; i < frames; i++) {
    rig.focus = { pair: horsePos, side: true, scale: sc };
    rig.update(1 / 30, still(), p, world);
  }
  cam.updateMatrixWorld(true);
  return { cam, rig, p };
}

describe('🐴 un cheval qui suit : la joueuse et lui, entiers, de côté', () => {
  for (const sc of [1.05, 0.58]) {
    for (const [label, aspect] of [['en hauteur', 390 / 844], ['en largeur', 844 / 390]]) {
      for (const [what, back, side] of [['en marchant (2,5 m derrière elle)', 2.5, 0], ['à l\'arrêt (tout près, un peu à côté)', 1.4, -0.5]]) {
        it(`taille ${sc}, ${label}, ${what}`, () => {
          const horse = V(side, 0, -back * Math.max(0.7, sc));
          const { cam } = settle(aspect, horse, sc, { speed: what.startsWith('en marchant') ? 1.5 : 0 });
          // la caméra est de côté (pas dans l'axe de la marche, derrière eux) et pas collée au cheval
          const mid = horse.clone().multiplyScalar(0.5);
          expect(Math.atan2(Math.abs(cam.position.x - mid.x), mid.z - cam.position.z)).toBeGreaterThan(0.35);
          expect(cam.position.distanceTo(horse)).toBeGreaterThan(4);
          const pts = [V(0, 0, 0), V(0, 1.45, 0), ...HORSE.map((q) => V(q[0] * sc, q[1] * sc, q[2] * sc).add(horse))];
          for (const q of pts) {
            const s = q.clone().project(cam);
            expect(s.z).toBeLessThan(1);
            expect(Math.abs(s.x), `${q.toArray()}`).toBeLessThan(0.92);
            expect(s.y, `${q.toArray()}`).toBeLessThan(0.5);
            expect(s.y, `${q.toArray()}`).toBeGreaterThan(-0.62);
          }
          // le cheval ne cache pas la joueuse : le rayon vers sa poitrine et sa tête ne traverse pas son corps
          // (boîte : ± 0,3 m de large, ± 1,3 m de long, de 0,6 à 1,7 m de haut, × sa taille ; tête : jusqu'à 1,7 m devant)
          for (const y of [1.0, 1.4]) {
            const to = V(0, y, 0);
            for (let i = 1; i < 60; i++) {
              const q = cam.position.clone().lerp(to, i / 60);
              const inBody = Math.abs(q.x - horse.x) < 0.3 * sc && Math.abs(q.z - horse.z) < 1.3 * sc && q.y > 0.6 * sc && q.y < 1.7 * sc;
              expect(inBody, `rayon vers la joueuse (y ${y}) dans le cheval`).toBe(false);
            }
          }
          // assez grands : la joueuse fait au moins 12 % de la hauteur de l'écran
          const h = V(0, 1.45, 0).project(cam).y - V(0, 0, 0).project(cam).y;
          expect(h / 2).toBeGreaterThan(0.12);
        });
      }
    }
  }

  it('il ne suit plus : la caméra revient derrière la joueuse', () => {
    const { cam, rig, p } = settle(390 / 844, V(0, 0, -2.5), 1);
    for (let i = 0; i < 600; i++) rig.update(1 / 30, still(), p, world);
    expect(Math.abs(cam.position.x)).toBeLessThan(0.05);
    expect(cam.position.z).toBeLessThan(-5);
  });

  it('un chien en laisse garde son cadrage (pas de côté)', () => {
    const cam = new THREE.PerspectiveCamera(60, 390 / 844, 0.1, 500);
    const rig = new P.CameraRig(cam);
    const p = { position: V(0, 0, 0), eyeHeight: 1.5, heading: 0, speed: 1.5, auto: false, mount: null, avatar: { root: { visible: true } } };
    rig.yaw = 0;
    for (let i = 0; i < 600; i++) {
      rig.focus = { pair: V(0.8, 0, -0.5) };
      rig.update(1 / 30, still(), p, world);
    }
    expect(Math.abs(cam.position.x)).toBeLessThan(1);
  });
});
