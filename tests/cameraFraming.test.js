// Bien montrer le cheval (étape 5) : à cheval sur un écran en hauteur, la caméra se met un peu de côté (on voit
// l'encolure et la tête, pas seulement la croupe) ; au concours de beauté, elle cadre l'animal mené avec l'enfant.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';

let CameraRig;
let MOUNT_SIDE;
beforeAll(async () => {
  const mem = new Map();
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
  globalThis.matchMedia = globalThis.matchMedia ?? (() => ({ matches: true }));
  ({ CameraRig, MOUNT_SIDE } = await import('../src/game/Player.js'));
}, 60000);

const world = { insideBuilding: () => false, heightAt: () => 0 };
const still = () => ({ look: { dx: 0, dy: 0 }, zoom: 0 });
const rider = (mount) => ({
  position: new THREE.Vector3(0, 0, 0), eyeHeight: 2.6, heading: 0.4, speed: 6, auto: false, mount,
  avatar: { root: { visible: true } },
});
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

describe('caméra du jeu', () => {
  it('à cheval sur un téléphone en hauteur : décalée sur le côté (côté montoir), plus près, la tête du cheval dans le cadre', () => {
    const cam = new THREE.PerspectiveCamera(60, 390 / 844, 0.1, 500);
    const rig = new CameraRig(cam);
    rig.yaw = 0.4;
    const p = rider({ scale: 1, position: new THREE.Vector3() });
    for (let i = 0; i < 900; i++) rig.update(1 / 30, still(), p, world);
    // (le lacet, qui oriente le joystick, reste derrière le cheval : sinon il tournerait en rond)
    expect(Math.abs(wrap(rig.yaw - p.heading))).toBeLessThan(0.03);
    // caméra à gauche de la ligne du cheval (repère : avant = cap, gauche = (cos, -sin))
    const fwd = new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
    const left = new THREE.Vector3(Math.cos(p.heading), 0, -Math.sin(p.heading));
    const c = cam.position.clone().setY(0);
    // (caméra décalée de 0,85 × MOUNT_SIDE ; sa cible reste sur le cheval : il est au milieu de l'écran)
    expect(c.dot(left)).toBeGreaterThan(MOUNT_SIDE * 0.8);
    expect(c.dot(fwd)).toBeLessThan(-4);
    // plus près qu'avant (dist + 2 = 9 m) : vers 6,5 m
    const d = cam.position.distanceTo(new THREE.Vector3(0, p.eyeHeight, 0));
    expect(d).toBeLessThan(rig.dist + 0.5);
    expect(d).toBeGreaterThan(rig.dist - 1.5);
  });

  it('écran en largeur, ou à pied : la caméra revient derrière, comme avant', () => {
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
    const rig = new CameraRig(cam);
    rig.yaw = 0;
    const p = rider({ scale: 1, position: new THREE.Vector3() });
    for (let i = 0; i < 900; i++) rig.update(1 / 30, still(), p, world);
    expect(Math.abs(wrap(rig.yaw - p.heading))).toBeLessThan(0.03);
    const cam2 = new THREE.PerspectiveCamera(60, 390 / 844, 0.1, 500);
    const rig2 = new CameraRig(cam2);
    const walker = rider(null);
    for (let i = 0; i < 900; i++) rig2.update(1 / 30, still(), walker, world);
    expect(Math.abs(wrap(rig2.yaw - walker.heading))).toBeLessThan(0.03);
  });

  it('concours de beauté : la caméra vise entre l\'enfant et l\'animal mené, et recule', () => {
    const cam = new THREE.PerspectiveCamera(60, 390 / 844, 0.1, 500);
    const rig = new CameraRig(cam);
    const p = { ...rider(null), speed: 0, heading: 0 };
    rig.yaw = 0;
    for (let i = 0; i < 120; i++) rig.update(1 / 30, still(), p, world);
    const alone = cam.position.clone();
    const horse = { position: new THREE.Vector3(1.6, 0, -0.5), scale: 1 };
    rig.frameWith = horse;
    for (let i = 0; i < 300; i++) rig.update(1 / 30, still(), p, world);
    // la caméra regarde vers le milieu (x > 0) et s'est éloignée
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const aim = cam.position.clone().addScaledVector(dir, cam.position.distanceTo(p.position));
    expect(aim.x).toBeGreaterThan(0.5);
    expect(cam.position.distanceTo(p.position)).toBeGreaterThan(alone.distanceTo(p.position) + 1);
    // fini : elle revient
    rig.frameWith = null;
    for (let i = 0; i < 300; i++) rig.update(1 / 30, still(), p, world);
    expect(cam.position.distanceTo(alone)).toBeLessThan(0.05);
  });

  it('à cheval en portrait : le cheval entier au milieu de l\'écran (croupe et queue loin des boutons du bas à droite)', () => {
    const cam = new THREE.PerspectiveCamera(60, 390 / 844, 0.1, 500);
    const rig = new CameraRig(cam);
    rig.yaw = 0.4;
    const p = rider({ scale: 1, position: new THREE.Vector3() });
    for (let i = 0; i < 900; i++) rig.update(1 / 30, still(), p, world);
    cam.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
    const at = (back, y) => new THREE.Vector3(0, y, 0).addScaledVector(fwd, -back).project(cam);
    // croupe (1 m derrière le cavalier), bout de la queue, sabots arrière, tête (1,6 m devant)
    const rump = at(1.0, 1.5);
    const tail = at(1.3, 0.9);
    const hoof = at(1.0, 0);
    const head = at(-1.6, 1.9);
    for (const q of [rump, tail, head]) expect(Math.abs(q.x)).toBeLessThan(0.6);
    // (rangée des boutons ronds et de « Descendre » : le bas de l'écran, ndc y < −0,72 environ)
    expect(hoof.y).toBeGreaterThan(-0.72);
    expect(tail.x).toBeLessThan(0.45);
  });

  it('à cheval en portrait le long d\'un mur côté montoir : le décalage de côté ne fait pas entrer la caméra dans le bâtiment', () => {
    const cam = new THREE.PerspectiveCamera(60, 390 / 844, 0.1, 500);
    const rig = new CameraRig(cam);
    rig.yaw = 0;
    const p = { ...rider({ scale: 1, position: new THREE.Vector3() }), heading: 0 };
    // mur à 1,2 m à gauche du cheval (gauche = +x pour un cap 0) : un bâtiment au-delà
    const walled = { insideBuilding: (x) => x > 1.2, heightAt: () => 0 };
    for (let i = 0; i < 900; i++) rig.update(1 / 30, still(), p, walled);
    expect(walled.insideBuilding(cam.position.x, cam.position.y, cam.position.z)).toBe(false);
    // et sans mur, il est bien là (au-delà de 1,2 m)
    const rig2 = new CameraRig(new THREE.PerspectiveCamera(60, 390 / 844, 0.1, 500));
    rig2.yaw = 0;
    for (let i = 0; i < 900; i++) rig2.update(1 / 30, still(), p, world);
    expect(rig2.camera.position.x).toBeGreaterThan(1.2);
  });

  it('concours de beauté : un grand décor entre la caméra et l\'enfant (arche, panneau) la fait passer devant, pas derrière', () => {
    const cam = new THREE.PerspectiveCamera(60, 390 / 844, 0.1, 500);
    const rig = new CameraRig(cam);
    const p = { ...rider(null), speed: 0, heading: 0 };
    rig.yaw = 0;
    rig.frameWith = { position: new THREE.Vector3(1.6, 0, -0.5), scale: 1 };
    for (let i = 0; i < 300; i++) rig.update(1 / 30, still(), p, world);
    const free = cam.position.clone();
    // panneau de 4 × 3 m, à mi-chemin entre l'enfant et la caméra
    const mid = free.clone().lerp(p.position, 0.5);
    const board = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.2));
    board.position.copy(mid);
    board.lookAt(free);
    const scene = new THREE.Scene();
    scene.add(board);
    scene.updateMatrixWorld(true);
    rig.occluders = [board];
    for (let i = 0; i < 300; i++) rig.update(1 / 30, still(), p, world);
    const dCam = cam.position.distanceTo(p.position);
    expect(dCam).toBeLessThan(mid.distanceTo(p.position));
    // un fanion (petite pièce) ne compte pas
    board.scale.setScalar(0.1);
    scene.updateMatrixWorld(true);
    for (let i = 0; i < 300; i++) rig.update(1 / 30, still(), p, world);
    expect(cam.position.distanceTo(free)).toBeLessThan(0.1);
  });
});
