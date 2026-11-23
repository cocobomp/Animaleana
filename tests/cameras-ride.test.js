// 🐴 À cheval, on voit la tête de son cheval (src/game/Player.js, CameraRig et RIDE_CAM) : caméra de trois quarts
// arrière à droite du cheval, la tête et l'encolure sortent à côté de la cavalière, pour un grand cheval comme pour un
// petit poney, au pas comme au galop (tête basse), en hauteur comme en largeur, même dans un virage ; vue de la selle
// tournée vers les oreilles ; photo souvenir de trois quarts avant.
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

// Mesurés dans le jeu (horseReal.js, monté, repère du cheval : x à sa gauche, y en haut, z devant ; selle = seat) :
// pointes des oreilles et bout du nez au pas et au galop (tête basse), bout de la queue, sabots.
const HORSES = {
  selleFrancais: {
    sc: 1, seat: 1.51, knee: 0.34,
    walk: [[0.21, 2.0, 1.3], [-0.13, 2.0, 1.3], [0.05, 1.55, 1.61]],
    gallop: [[0.21, 1.55, 1.5], [-0.13, 1.55, 1.5], [0.05, 1.05, 1.66]],
    body: [[0, 0.5, -1.35], [0, 1.55, -0.75], [0.15, 0, -0.6], [-0.15, 0, -0.6], [0.15, 0, 0.75], [0, 1.2, 0.9]],
  },
  shetland: {
    sc: 0.58, seat: 0.8, knee: 0.3,
    walk: [[0.08, 1.02, 0.67], [-0.1, 1.02, 0.67], [-0.02, 0.75, 0.88]],
    gallop: [[0.08, 0.75, 0.78], [-0.1, 0.75, 0.78], [-0.02, 0.42, 0.86]],
    body: [[0, 0.25, -0.8], [0, 0.82, -0.42], [0.1, 0, -0.35], [0.1, 0, 0.42], [0, 0.65, 0.5]],
  },
  falabella: {
    sc: 0.5, seat: 0.75, knee: 0.28,
    walk: [[0.07, 0.93, 0.58], [-0.08, 0.93, 0.58], [0, 0.69, 0.76]],
    gallop: [[0.07, 0.8, 0.64], [-0.08, 0.8, 0.64], [0, 0.5, 0.77]],
    body: [[0, 0.25, -0.7], [0, 0.77, -0.38], [0.1, 0, -0.3], [0.1, 0, 0.38], [0, 0.6, 0.45]],
  },
};

/** La cavalière en selle (avatarModel.js, mesurée en selle) : tête et casque, buste, bras, cuisses, jambes. */
function riderCapsules(S, knee) {
  return [
    [V(0, S + 0.85, -0.03), V(0, S + 0.85, -0.03), 0.17],
    [V(0, S + 0.15, -0.05), V(0, S + 0.6, 0), 0.19],
    [V(0.18, S + 0.55, 0), V(0.08, S + 0.3, 0.25), 0.065], [V(-0.18, S + 0.55, 0), V(-0.08, S + 0.3, 0.25), 0.065],
    [V(0.12, S + 0.05, -0.05), V(knee, S - 0.07, 0.13), 0.085], [V(-0.12, S + 0.05, -0.05), V(-knee, S - 0.07, 0.13), 0.085],
    [V(knee, S - 0.07, 0.13), V(knee, S - 0.5, 0.05), 0.065], [V(-knee, S - 0.07, 0.13), V(-knee, S - 0.5, 0.05), 0.065],
  ];
}

/** Distance (m) entre le rayon caméra → p et la capsule la plus proche (négatif : le rayon la traverse). */
function clearance(cam, p, caps) {
  const d = p.clone().sub(cam);
  const L = d.length() - 0.05;
  d.normalize();
  let best = Infinity;
  for (const [a, b, r] of caps) {
    for (let i = 0; i <= 24; i++) {
      const q = a.clone().lerp(b, i / 24);
      const t = THREE.MathUtils.clamp(q.clone().sub(cam).dot(d), 0, L);
      best = Math.min(best, q.distanceTo(cam.clone().addScaledVector(d, t)) - r);
    }
  }
  return best;
}

/** Le cavalier monté (cap 0 : le cheval regarde +z) et sa caméra posée après quelques secondes. */
function settle(h, aspect, { heading = 0, yawLag = 0, frames = 600 } = {}) {
  const cam = new THREE.PerspectiveCamera(60, aspect, 0.1, 500);
  const rig = new P.CameraRig(cam);
  const p = { position: V(0, 0, 0), eyeHeight: h.seat + P.RIDER_EYE, heading, speed: 4, auto: false, mount: { scale: h.sc, position: V(0, 0, 0) }, avatar: { root: { visible: true } } };
  rig.yaw = heading + yawLag;
  // (pendant un virage, le lacet reste en retard : on ne le laisse pas rattraper le cheval)
  if (yawLag) p.speed = 0;
  for (let i = 0; i < frames; i++) rig.update(1 / 30, still(), p, world);
  cam.updateMatrixWorld(true);
  return { cam, rig, p };
}

describe('🐴 à cheval, la tête de son cheval à côté de la cavalière', () => {
  for (const [name, h] of Object.entries(HORSES)) {
    for (const [label, aspect] of [['en hauteur', PORTRAIT], ['en largeur', LANDSCAPE]]) {
      it(`${name}, ${label} : oreilles, œil et bout du nez dégagés au pas et au galop ; le cheval entier hors des boutons`, () => {
        const { cam } = settle(h, aspect);
        const caps = riderCapsules(h.seat, h.knee);
        for (const gait of ['walk', 'gallop']) {
          const [earL, earR, nose] = h[gait].map((q) => V(...q));
          const eye = V(-0.1 * h.sc, (earL.y + nose.y) / 2, earL.z * 0.55 + nose.z * 0.45);
          for (const [k, q] of Object.entries({ earL, earR, nose, eye })) {
            expect(clearance(cam.position, q, caps), `${gait} ${k}`).toBeGreaterThan(0.08);
            const s = q.clone().project(cam);
            expect(Math.abs(s.x), `${gait} ${k} x`).toBeLessThan(0.9);
            expect(s.z).toBeLessThan(1);
          }
          // la tête à droite de la cavalière à l'écran
          const helmet = V(0, h.seat + 1.05, 0).project(cam);
          expect(nose.clone().project(cam).x).toBeGreaterThan(helmet.x);
          // au pas (au trot, la tête est un peu plus haute) : oreilles et œil hors du bouton « ⬆️ Debout » du trot
          // enlevé (src/style.css #post-btn : au milieu à droite, de 84 px en hauteur, de 64 px en largeur)
          if (gait === 'walk') {
            for (const q of [earL, earR, eye]) {
              const s = q.clone().project(cam);
              const inBtn = aspect < 1 ? s.x > 0.08 && s.x < 0.56 && s.y < -0.06 && s.y > -0.29 : s.x > 0.28 && s.x < 0.47 && s.y < 0.2 && s.y > -0.17;
              expect(inBtn, `${gait} bouton`).toBe(false);
            }
          }
        }
        // queue, croupe, sabots, poitrail, casque : à l'écran, au-dessus du joystick et sous le bandeau du haut
        for (const q of [...h.body, [0, h.seat + 1.05, 0]]) {
          const s = V(...q).project(cam);
          expect(Math.abs(s.x), JSON.stringify(q)).toBeLessThan(0.92);
          expect(s.y, JSON.stringify(q)).toBeGreaterThan(-0.62);
          expect(s.y, JSON.stringify(q)).toBeLessThan(0.62);
        }
      });
    }
  }

  it('un petit poney : la caméra se met plus de côté (sa tête basse, devant la jambe de la cavalière)', () => {
    expect(P.rideAzimuth(0.5)).toBeGreaterThan(P.rideAzimuth(1) + 0.3);
    expect(P.rideAzimuth(1.1)).toBeCloseTo(P.rideAzimuth(1), 5);
    expect(P.rideDistance(0.5, PORTRAIT)).toBeLessThan(P.rideDistance(1, PORTRAIT));
    expect(P.rideDistance(1, LANDSCAPE)).toBeLessThan(P.rideDistance(1, PORTRAIT));
  });

  it('dans un virage (le lacet en retard sur le cheval, d\'un côté ou de l\'autre) : la tête reste dégagée', () => {
    const h = HORSES.selleFrancais;
    const caps = riderCapsules(h.seat, h.knee);
    for (const lag of [-0.9, -0.4, 0.4, 0.9]) {
      const { cam, rig } = settle(h, PORTRAIT, { yawLag: lag });
      // (le lacet du joystick n'a pas bougé : seule la caméra tourne autour du cheval)
      expect(rig.yaw).toBeCloseTo(lag, 5);
      // (sans le glissement à droite de l'écran en hauteur, RIDE_CAM.shift : la caméra a glissé avec sa visée)
      cam.updateMatrixWorld(true);
      const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
      const c0 = cam.position.clone().sub(V(0, 0, P.RIDE_CAM.ahead));
      const c = c0.addScaledVector(right, -P.RIDE_CAM.shift * c0.length()).setY(0);
      const rel = Math.atan2(-c.x, -c.z);
      expect(rel, `retard ${lag}`).toBeGreaterThan(P.rideAzimuth(1) - P.RIDE_CAM.slack - 0.02);
      expect(rel, `retard ${lag}`).toBeLessThan(P.rideAzimuth(1) + P.RIDE_CAM.slackOut + 0.02);
      for (const q of HORSES.selleFrancais.walk) expect(clearance(cam.position, V(...q), caps)).toBeGreaterThan(0.08);
    }
  });

  it('on tourne la vue soi-même (glisser) : la caméra suit le doigt, sans être ramenée', () => {
    const h = HORSES.selleFrancais;
    const { cam, rig, p } = settle(h, PORTRAIT);
    const before = cam.position.clone();
    for (let i = 0; i < 30; i++) rig.update(1 / 30, { look: { dx: -20, dy: 0 }, zoom: 0 }, p, world);
    expect(rig.yaw).toBeGreaterThan(1);
    expect(cam.position.distanceTo(before)).toBeGreaterThan(2);
  });

  it('en descendant de cheval, la caméra revient derrière la joueuse (plus de décalage)', () => {
    const h = HORSES.selleFrancais;
    const { cam, rig, p } = settle(h, PORTRAIT);
    p.mount = null;
    p.eyeHeight = 1.5;
    for (let i = 0; i < 600; i++) rig.update(1 / 30, still(), p, world);
    expect(Math.abs(cam.position.x)).toBeLessThan(0.05);
    expect(cam.position.z).toBeLessThan(-5);
  });
});

describe('👀 vue de la selle (1re personne)', () => {
  it('à cheval : l\'œil assis au-dessus de la selle, le regard baissé vers les oreilles, champ plus large en hauteur', () => {
    const h = HORSES.selleFrancais;
    const { cam, rig, p } = settle(h, PORTRAIT);
    rig.mode = 'first';
    rig.update(1 / 30, still(), p, world);
    expect(cam.position.y).toBeCloseTo(h.seat + P.RIDE_FP.eye, 5);
    expect(cam.position.y).toBeLessThan(p.eyeHeight - 0.2);
    expect(cam.fov).toBe(P.RIDE_FP.fovTall);
    cam.updateMatrixWorld(true);
    const dir = cam.getWorldDirection(new THREE.Vector3());
    expect(Math.asin(dir.y)).toBeCloseTo(P.rideLookDown(1), 2);
    expect(P.rideLookDown(1)).toBeLessThanOrEqual(-0.3);
    // les deux oreilles, au pas et au galop, dans l'image (pas au bord)
    for (const gait of ['walk', 'gallop']) {
      for (const q of h[gait].slice(0, 2)) {
        const s = V(...q).project(cam);
        expect(Math.abs(s.x), gait).toBeLessThan(0.8);
        expect(s.y, gait).toBeGreaterThan(-0.85);
        expect(s.y, gait).toBeLessThan(0.3);
      }
    }
    // l'avatar est caché (sa tête cacherait tout) ; en revenant en 3e personne, le champ redevient 60°
    expect(p.avatar.root.visible).toBe(false);
    rig.mode = 'third';
    rig.update(1 / 30, still(), p, world);
    expect(cam.fov).toBe(60);
    expect(p.avatar.root.visible).toBe(true);
  });

  it('un petit poney : le regard plus baissé (sa tête est bien plus bas), les oreilles au-dessus des boutons du bas', () => {
    const h = HORSES.shetland;
    const { cam, rig, p } = settle(h, PORTRAIT);
    rig.mode = 'first';
    rig.update(1 / 30, still(), p, world);
    expect(P.rideLookDown(h.sc)).toBeLessThan(P.rideLookDown(1));
    cam.updateMatrixWorld(true);
    for (const q of h.walk.slice(0, 2)) {
      const s = V(...q).project(cam);
      expect(Math.abs(s.x)).toBeLessThan(0.8);
      // (« Descendre » et le joystick occupent le quart du bas de l'écran : y < −0,45)
      expect(s.y).toBeGreaterThan(-0.4);
    }
  });

  it('à pied et en largeur : comme avant (œil à 1,5 m, 60°)', () => {
    const cam = new THREE.PerspectiveCamera(60, PORTRAIT, 0.1, 500);
    const rig = new P.CameraRig(cam);
    rig.mode = 'first';
    const p = { position: V(0, 0, 0), eyeHeight: 1.5, heading: 0, speed: 0, mount: null, avatar: { root: { visible: true } } };
    rig.update(1 / 30, still(), p, world);
    expect(cam.position.y).toBeCloseTo(1.5, 5);
    expect(cam.fov).toBe(60);
    const camL = new THREE.PerspectiveCamera(60, LANDSCAPE, 0.1, 500);
    const rigL = new P.CameraRig(camL);
    rigL.mode = 'first';
    rigL.update(1 / 30, still(), { ...p, eyeHeight: 2.66, mount: { scale: 1 } }, world);
    expect(camL.fov).toBe(60);
  });
});

describe('📸 photo souvenir à cheval (placeRidePhotoCamera)', () => {
  const band = (780 / 1.6) / 1688; // (bande 16:10 gardée sur un téléphone en hauteur)
  const mountedPlayer = (h, heading = 0.7) => ({ position: V(3, 0, -2), eyeHeight: h.seat + P.RIDER_EYE, heading, mount: { scale: h.sc, position: V(3, 0, -2) } });

  for (const [name, h] of Object.entries(HORSES)) {
    it(`${name} : de trois quarts avant, le cheval et sa cavalière dans la bande gardée ; la caméra remise après`, () => {
      const cam = new THREE.PerspectiveCamera(60, PORTRAIT, 0.1, 500);
      cam.position.set(1, 4, -9);
      cam.lookAt(3, 1, -2);
      const before = { p: cam.position.clone(), q: cam.quaternion.clone() };
      const pl = mountedPlayer(h);
      const saved = P.placeRidePhotoCamera(cam, pl, world, { band });
      // devant le cheval, de côté (≈ 43° depuis le devant)
      const fwd = V(Math.sin(pl.heading), 0, Math.cos(pl.heading));
      const to = cam.position.clone().sub(pl.position).setY(0).normalize();
      const ang = Math.acos(to.dot(fwd));
      expect(ang).toBeGreaterThan(0.5);
      expect(ang).toBeLessThan(1.0);
      // sabots, casque, bout du nez, queue : dans la bande (|y| < band), à l'écran
      const toWorld = (q) => V(q[0], q[1], q[2]).applyAxisAngle(V(0, 1, 0), pl.heading).add(pl.position);
      cam.updateMatrixWorld(true);
      for (const q of [...h.body, h.walk[2], [0, h.seat + 1.05, 0]]) {
        const s = toWorld(q).project(cam);
        expect(Math.abs(s.y), `${name} ${q}`).toBeLessThan(band * 0.98);
        expect(Math.abs(s.x), `${name} ${q}`).toBeLessThan(0.98);
        expect(s.z).toBeLessThan(1);
      }
      // les sabots et le casque prennent au moins 60 % de la hauteur de la bande
      const top = toWorld([0, h.seat + 1.05, 0]).project(cam).y;
      const bot = toWorld(h.body.find((q) => q[1] === 0)).project(cam).y;
      expect((top - bot) / (2 * band)).toBeGreaterThan(0.6);
      P.restorePhotoCamera(cam, saved);
      expect(cam.position.distanceTo(before.p)).toBeLessThan(1e-9);
      expect(cam.quaternion.angleTo(before.q)).toBeLessThan(1e-6);
      expect(cam.fov).toBe(60);
    });
  }

  it('du côté éclairé par le soleil ; pas dans un bâtiment (l\'autre côté)', () => {
    const h = HORSES.selleFrancais;
    const cam = new THREE.PerspectiveCamera(60, PORTRAIT, 0.1, 500);
    const pl = mountedPlayer(h, 0);
    const left = V(1, 0, 0); // (gauche du cheval au cap 0)
    P.placeRidePhotoCamera(cam, pl, world, { band, sun: V(5, 8, 1) });
    expect(cam.position.clone().sub(pl.position).dot(left)).toBeGreaterThan(1);
    P.placeRidePhotoCamera(cam, pl, world, { band, sun: V(-5, 8, 1) });
    expect(cam.position.clone().sub(pl.position).dot(left)).toBeLessThan(-1);
    // un bâtiment à gauche : la photo se prend à droite, même au soleil de gauche
    const walled = { insideBuilding: (x) => x > 4.5, heightAt: () => 0 };
    P.placeRidePhotoCamera(cam, pl, walled, { band, sun: V(5, 8, 1) });
    expect(walled.insideBuilding(cam.position.x, cam.position.y, cam.position.z)).toBe(false);
    expect(cam.position.clone().sub(pl.position).dot(left)).toBeLessThan(-1);
  });

  it('une barrière le long du chemin, du côté du soleil : la photo se prend de l\'autre côté (le poney n\'est pas derrière)', () => {
    const h = HORSES.shetland;
    const cam = new THREE.PerspectiveCamera(60, PORTRAIT, 0.1, 500);
    const pl = mountedPlayer(h, 0);
    // barrière de 1,2 m de haut, 20 m de long, à 1,5 m à gauche du poney (gauche : +x au cap 0)
    const fence = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 20));
    fence.position.set(pl.position.x + 1.5, 0.6, pl.position.z);
    fence.updateMatrixWorld(true);
    P.placeRidePhotoCamera(cam, pl, world, { band, sun: V(5, 8, 1), occluders: [fence] });
    expect(cam.position.x).toBeLessThan(pl.position.x - 1);
    // sans la barrière : du côté du soleil
    P.placeRidePhotoCamera(cam, pl, world, { band, sun: V(5, 8, 1), occluders: [] });
    expect(cam.position.x).toBeGreaterThan(pl.position.x + 1);
  });

  it('pas monté : rien', () => {
    const cam = new THREE.PerspectiveCamera(60, PORTRAIT, 0.1, 500);
    expect(P.placeRidePhotoCamera(cam, { mount: null, position: V() }, world)).toBeNull();
  });
});

describe('👀 vue de la selle : petits poneys et écran en largeur', () => {
  it('sur un très petit poney, l\'œil recule (la crinière, tout près, couvrait l\'écran) ; en largeur, le regard baisse un peu plus', () => {
    expect(P.rideEyeAhead(0.5)).toBeLessThan(P.rideEyeAhead(1) - 0.2);
    expect(P.rideEyeAhead(1)).toBeCloseTo(P.RIDE_FP.ahead, 5);
    expect(P.rideLookDown(1, 844 / 390)).toBeLessThan(P.rideLookDown(1, 390 / 844) - 0.05);
  });
});
