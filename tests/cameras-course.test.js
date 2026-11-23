// 🏇 Caméra à cheval pendant une séance (saut d'obstacles, leçon, dressage, balade : rig.course, src/game/Player.js
// COURSE_CAM) : on voit l'obstacle qui arrive devant (la caméra de balade, de trois quarts sur le côté, le cachait : il
// n'apparaissait que sous le cheval, sous « Sauter » et le joystick), et toujours le cheval entier et sa tête.
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
const PORTRAIT = 390 / 844;
const LANDSCAPE = 844 / 390;
// (repère du cheval, cap 0 : x à sa gauche, z devant ; taille 1 : oreilles, bout du nez, queue, sabots ; × sc)
const HORSE = [[0.2, 2.0, 1.3], [-0.15, 2.0, 1.3], [0, 1.55, 1.61], [0, 1.55, -0.75], [0.15, 0, -0.6], [0.15, 0, 0.75]];

function settle(sc, aspect, course) {
  const cam = new THREE.PerspectiveCamera(60, aspect, 0.1, 500);
  const rig = new P.CameraRig(cam);
  const seat = 1.51 * sc;
  const p = { position: V(0, 0, 0), eyeHeight: seat + P.RIDER_EYE, heading: 0, speed: 4, auto: false, mount: { scale: sc, position: V(0, 0, 0) }, avatar: { root: { visible: true } } };
  rig.yaw = 0;
  for (let i = 0; i < 600; i++) {
    rig.course = course;
    rig.update(1 / 30, still(), p, world);
  }
  cam.updateMatrixWorld(true);
  return { cam, rig };
}

describe('🏇 pendant une séance à cheval, la caméra montre ce qui arrive devant', () => {
  for (const sc of [1, 0.58, 0.5]) {
    for (const [label, aspect] of [['en hauteur', PORTRAIT], ['en largeur', LANDSCAPE]]) {
      it(`taille ${sc}, ${label} : l'obstacle à 6 à 14 m devant (et un peu de côté), au-dessus des boutons ; le cheval entier`, () => {
        const { cam } = settle(sc, aspect, true);
        for (const d of [6, 10, 14]) {
          for (const side of [-0.12, 0, 0.12]) {
            // (le haut de la barre, à 1 m × sa taille)
            const s = V(Math.sin(side) * d, 1 * sc, Math.cos(side) * d).project(cam);
            expect(s.z).toBeLessThan(1);
            expect(Math.abs(s.x), `${d} m, ${side}`).toBeLessThan(0.95);
            // (pas sous « Sauter » ni le joystick : dans les deux tiers du haut de l'écran)
            expect(s.y, `${d} m, ${side}`).toBeGreaterThan(-0.35);
          }
        }
        for (const q of HORSE) {
          const s = V(q[0] * sc, q[1] * sc, q[2] * sc).project(cam);
          expect(Math.abs(s.x), `${q}`).toBeLessThan(0.95);
          expect(Math.abs(s.y), `${q}`).toBeLessThan(0.95);
        }
      });
    }
  }

  it('la caméra est presque derrière le cheval (plus de trois quarts sur le côté), et revient de côté après la séance', () => {
    const { cam, rig } = settle(1, PORTRAIT, true);
    const rel = Math.atan2(-cam.position.x, -cam.position.z);
    expect(Math.abs(rel)).toBeLessThan(0.55);
    expect(cam.position.z).toBeLessThan(-4);
    // (après la séance : rig.course n'est plus posé, la caméra de balade revient)
    for (let i = 0; i < 300; i++) rig.update(1 / 30, still(), { position: V(0, 0, 0), eyeHeight: 1.51 + P.RIDER_EYE, heading: 0, speed: 4, auto: false, mount: { scale: 1, position: V(0, 0, 0) }, avatar: { root: { visible: true } } }, world);
    const rel2 = Math.atan2(-cam.position.x, -cam.position.z);
    expect(rel2).toBeGreaterThan(0.5);
  });

  it('la caméra à droite du cheval, du même angle pour toutes les tailles (un très petit poney ne sort pas de l\'écran)', () => {
    const lat = (sc) => {
      const out = V(0, 0, 0);
      P.coursePose(V(0, 0, 0), 0, sc, 1.5 * sc, PORTRAIT, out, V(0, 0, 0));
      return -out.x / -out.z;
    };
    expect(lat(1)).toBeGreaterThan(0.2);
    expect(lat(0.5)).toBeCloseTo(lat(1), 5);
  });
});
