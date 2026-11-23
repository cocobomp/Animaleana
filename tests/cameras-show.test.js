// 🎪 Spectacle de tours d'un cheval (src/game/Activities.js) : la caméra montre le cheval entier, tête comprise, en
// hauteur comme en largeur, pour un grand cheval comme pour un poney ; l'étoile part au-dessus de sa tête ; « recule »
// joue le pas à l'envers ; « sourire » relève la tête sans la faire rouler.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';

let A;
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
  A = await import('../src/game/Activities.js');
  ({ CameraRig } = await import('../src/game/Player.js'));
}, 60000);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PORTRAIT = 390 / 844;
const LANDSCAPE = 844 / 390;
const world = { insideBuilding: () => false, heightAt: () => 0 };
const still = () => ({ look: { dx: 0, dy: 0 }, zoom: 0 });

// Cheval réaliste de taille 1 (Selle Français), repère du cheval (x à sa gauche, y en haut, z devant) : sabots, croupe,
// bout de la queue, poitrail, oreilles et bout du nez debout ; révérence (tête basse, nez en avant) ; « reculer »
// (1,2 m en arrière).
const POSES = {
  debout: [[0.15, 0, 0.75], [-0.15, 0, -0.6], [0, 1.6, -0.8], [0, 0.5, -1.35], [0, 1.25, 0.9], [0.2, 2.05, 1.3], [-0.15, 2.05, 1.3], [0, 1.55, 1.65]],
  reverence: [[0.15, 0, 1.2], [-0.15, 0, -0.6], [0, 1.6, -0.8], [0, 0.5, -1.35], [0.2, 1.2, 1.7], [0, 0.55, 1.9]],
  recule: [[0.15, 0, -0.45], [-0.15, 0, -1.8], [0, 1.6, -2], [0, 0.5, -2.55], [0.2, 2.05, 0.1], [0, 1.55, 0.45]],
  sourire: [[0.15, 0, 0.75], [-0.15, 0, -0.6], [0, 0.5, -1.35], [0.2, 2.35, 1.2], [0, 2.15, 1.7]],
};

/** La caméra du jeu, posée sur le plan du spectacle (rig.focus.shot) après quelques secondes. */
function shotCamera(e, aspect, head = null) {
  const cam = new THREE.PerspectiveCamera(60, aspect, 0.1, 500);
  const rig = new CameraRig(cam);
  const p = { position: V(0, 0, 8), eyeHeight: 1.5, heading: Math.PI, speed: 0, auto: false, mount: null, avatar: { root: { visible: true } } };
  rig.yaw = Math.PI;
  const at = new THREE.Vector3();
  for (let i = 0; i < 400; i++) {
    rig.focus = { shot: A.showShot(e, aspect, at, head) };
    rig.update(1 / 30, still(), p, world);
  }
  cam.updateMatrixWorld(true);
  return cam;
}

const horseAt = (sc, heading = 0.3) => ({ position: V(2, 0.4, -1), heading, scale: sc, data: { species: 'horse' } });
const toWorld = (e, q) => V(q[0] * e.scale, q[1] * e.scale, q[2] * e.scale).applyAxisAngle(V(0, 1, 0), e.heading).add(e.position);

describe('🎪 spectacle : le cheval entier à l\'écran', () => {
  for (const sc of [1.05, 0.58, 0.5]) {
    for (const [label, aspect] of [['en hauteur', PORTRAIT], ['en largeur', LANDSCAPE]]) {
      it(`taille ${sc}, ${label} : sabots, croupe, queue, oreilles et nez dans l'image, pour chaque tour`, () => {
        const e = horseAt(sc);
        const cam = shotCamera(e, aspect);
        for (const [pose, pts] of Object.entries(POSES)) {
          if (pose === 'sourire') continue;
          for (const q of pts) {
            const s = toWorld(e, q).project(cam);
            expect(Math.abs(s.x), `${pose} ${q}`).toBeLessThan(0.95);
            // (bandeau « Spectacle » en haut : ndc y > 0,75 ; bouton de vue en bas à droite)
            expect(s.y, `${pose} ${q}`).toBeLessThan(0.72);
            expect(s.y, `${pose} ${q}`).toBeGreaterThan(-0.9);
          }
        }
        // assez grand : du sabot aux oreilles, au moins 30 % de la hauteur de l'écran
        const h = toWorld(e, [0.2, 2.05, 1.3]).project(cam).y - toWorld(e, [0.15, 0, 0.75]).project(cam).y;
        expect(h / 2).toBeGreaterThan(0.3);
      });
    }
  }

  it('« sourire » : visé entre le garrot et la tête, la tête relevée et le cheval entier restent dans l\'image', () => {
    const e = horseAt(1);
    const head = new THREE.Object3D();
    head.position.copy(toWorld(e, [0, 1.9, 1.35]));
    const cam = shotCamera(e, PORTRAIT, head);
    for (const q of POSES.sourire) {
      const s = toWorld(e, q).project(cam);
      expect(Math.abs(s.x)).toBeLessThan(0.95);
      expect(s.y).toBeLessThan(0.72);
      expect(s.y).toBeGreaterThan(-0.9);
    }
    const shot = A.showShot(e, PORTRAIT, new THREE.Vector3(), head);
    expect(shot.at.y).toBeGreaterThan(e.position.y + A.SHOW_SHOT.y);
    expect(shot.pitch).toBeLessThan(0.2);
  });

  it('les autres espèces gardent leur plan (showShot n\'est que pour le cheval) ; l\'étoile part au-dessus de la tête du cheval', () => {
    expect(A.cheerHeight({ data: { species: 'horse' }, scale: 1 })).toBeGreaterThan(2.4);
    expect(A.cheerHeight({ data: { species: 'horse' }, scale: 0.5 })).toBeGreaterThan(1.2); // (oreilles d'un Falabella : 1 m)
    expect(A.cheerHeight({ data: { species: 'dog' }, scale: 1 })).toBe(1.8);
  });
});

describe('🎪 tours du cheval réaliste', () => {
  const realHorse = () => {
    const root = new THREE.Group();
    const neck = new THREE.Object3D();
    const head = new THREE.Object3D();
    root.add(neck);
    neck.add(head);
    const sg = new THREE.Group();
    return {
      scaleGroup: sg, speed: 0, scale: 1, data: { species: 'horse', look: { neckAngle: 0.5 } },
      model: { real: true, neck, head, legs: [], anim: { mixer: { timeScale: 1 } } },
    };
  };

  it('« reculer » : il glisse en arrière avec le pas joué à l\'envers, puis revient au pas à l\'endroit', () => {
    const e = realHorse();
    A.animateTrick(e, 'back', 0.25, 1 / 60);
    expect(e.scaleGroup.position.z).toBeLessThan(-0.5);
    expect(e.model.anim.mixer.timeScale).toBe(-1);
    expect(e.speed).toBeGreaterThan(0.4);
    A.animateTrick(e, 'back', 0.75, 1 / 60);
    expect(e.model.anim.mixer.timeScale).toBe(1);
    // (un modèle sans clips : comme avant)
    const old = { ...realHorse(), model: { legs: [] } };
    A.animateTrick(old, 'back', 0.25, 1 / 60);
    expect(old.speed).toBe(1);
  });

  it('« sourire » : encolure un peu relevée, tête tendue, petit hochement, jamais de roulis ; oreilles en avant', () => {
    const e = realHorse();
    let maxNod = 0;
    let minNod = 0;
    for (let i = 0; i <= 40; i++) {
      const k = i / 40;
      e.model.neck.rotation.set(0, 0, 0);
      e.model.head.rotation.set(0, 0, 0);
      A.animateTrick(e, 'smile', k, 1 / 60);
      expect(Math.abs(e.model.head.rotation.z)).toBeLessThan(1e-9);
      expect(Math.abs(e.model.head.rotation.y)).toBeLessThan(1e-9);
      expect(e.model.neck.rotation.x).toBeLessThanOrEqual(0);
      expect(e.model.neck.rotation.x).toBeGreaterThan(-0.3);
      maxNod = Math.max(maxNod, e.model.head.rotation.x);
      minNod = Math.min(minNod, e.model.head.rotation.x);
    }
    expect(minNod).toBeGreaterThan(-0.25);
    expect(maxNod - minNod).toBeGreaterThan(0.05); // (il hoche la tête)
    expect(e.earsPose).toBe('forward');
  });
});

describe('😄 « sourire » sans dérive', () => {
  it('le geste s\'ajoute à la pose du clip ; si le clip est en pause, il ne s\'additionne pas d\'une image à l\'autre', () => {
    const b = new THREE.Object3D();
    const e = {};
    // clip actif : il remet la pose à chaque image, le geste s'y ajoute une fois
    for (let i = 0; i < 5; i++) {
      b.rotation.set(0.1, 0, 0);
      A.smileTurn(e, 'neck', b, -0.2);
    }
    expect(b.rotation.x).toBeCloseTo(-0.1, 5);
    // clip en pause : la pose n'est plus reprise, la tête ne tourne pas plus
    for (let i = 0; i < 30; i++) A.smileTurn(e, 'neck', b, -0.2);
    expect(b.rotation.x).toBeCloseTo(-0.1, 5);
  });
});
