// Modèle 3D du personnage du joueur (regarde vers +Z, environ 1,6 m).
// Corps en « lofts » (formes lisses), tête sculptée (champ de distance), mains, chaussures,
// yeux avec iris et cils, vêtements avec plis légers (relief peint).
// Squelette : hanches → genoux (jambes) ; torse (pivot aux hanches) → épaules → coudes (bras), tête.
// Les proportions sont un peu enfantines (grosse tête, membres ronds).

import * as THREE from 'three';
import { loft } from './shapes.js';
import { ellipsoid, blend, sdfMesh, rayHit, sdfNormal } from './sdf.js';
import { eyeTexture } from '../textures.js';
import { gfx } from '../gfx.js';

const mat = (color, roughness = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

function add(parent, geo, material, pos, rot, scale, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const cache = new Map();
function shared(key, make) {
  if (!cache.has(key)) {
    const g = make();
    g.userData.shared = true;
    cache.set(key, g);
  }
  return cache.get(key);
}

/** Relief de tissu (plis et trame), partagé. */
let _cloth = null;
function clothBump() {
  if (_cloth) return _cloth;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) {
    ctx.fillStyle = y % 4 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, y, 128, 1);
  }
  // Plis doux.
  for (let i = 0; i < 9; i++) {
    const g = ctx.createLinearGradient(0, i * 14, 0, i * 14 + 14);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, i * 14 + Math.sin(i) * 3, 128, 14);
  }
  _cloth = new THREE.CanvasTexture(c);
  _cloth.wrapS = THREE.RepeatWrapping;
  _cloth.wrapT = THREE.RepeatWrapping;
  _cloth.repeat.set(3, 3);
  _cloth.userData.shared = true;
  return _cloth;
}

/** Tube vertical (membre) : sections [y, rayon x, rayon z, décalage z]. round = bouts arrondis. */
const limbGeo = (secs, radial, round = null) => loft(secs.map(([y, rx, rz, oz = 0]) => ({ p: [0, y, oz], rx, ry: rz })), { radial, sub: 3, side: [1, 0, 0], round });

/** Tête : crâne, mâchoire, joues, nez et oreilles fondus. */
const HEAD_SHAPES = [
  [ellipsoid([0, 0.075, -0.005], [0.122, 0.135, 0.13]), 0],
  [ellipsoid([0, -0.015, 0.03], [0.1, 0.095, 0.1]), 0.05],
  [ellipsoid([0, -0.06, 0.05], [0.055, 0.04, 0.06]), 0.04],
  [ellipsoid([0.06, 0.0, 0.07], [0.04, 0.035, 0.035]), 0.03],
  [ellipsoid([-0.06, 0.0, 0.07], [0.04, 0.035, 0.035]), 0.03],
  [ellipsoid([0, 0.035, 0.122], [0.016, 0.03, 0.022]), 0.02],
  [ellipsoid([0, 0.012, 0.13], [0.02, 0.014, 0.016]), 0.012],
  [ellipsoid([0.122, 0.05, -0.005], [0.014, 0.032, 0.022]), 0.012],
  [ellipsoid([-0.122, 0.05, -0.005], [0.014, 0.032, 0.022]), 0.012],
  [ellipsoid([0.045, 0.1, 0.105], [0.035, 0.012, 0.02]), 0.02],
  [ellipsoid([-0.045, 0.1, 0.105], [0.035, 0.012, 0.02]), 0.02],
];
const headSdf = blend(HEAD_SHAPES);

/** Hauteur de la hanche, du genou (sous la hanche), de l'épaule et du coude (sous l'épaule). */
const HIP_Y = 0.82;
const KNEE = 0.4;
const SHOULDER_Y = 1.33;
const ELBOW = 0.27;

export function buildAvatar(look) {
  const high = gfx.quality === 'high';
  const R = high ? 18 : 12;
  const root = new THREE.Group();
  const bump = high ? clothBump() : null;
  const cloth = (c) => mat(c, 0.85, bump ? { bumpMap: bump, bumpScale: 0.6 } : {});
  const skin = mat(look.skin, 0.55);
  const hair = mat(look.hair, 0.5);
  const top = cloth(look.top);
  const bottom = cloth(look.bottom);
  const shoes = mat(look.shoes, 0.45);
  const sole = mat(0xe8e2d8, 0.7);

  // --- Jambes (pivot à la hanche, genou articulé)
  const legs = [];
  const knees = [];
  for (const s of [1, -1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.095, HIP_Y, 0);
    root.add(hip);
    const thigh = shared(`thigh${R}`, () => limbGeo([[0.06, 0.082, 0.082], [0, 0.085, 0.088], [-0.18, 0.072, 0.077], [-0.36, 0.058, 0.062, 0.004], [-KNEE, 0.056, 0.06, 0.004]], R, [0, 0.9]));
    add(hip, thigh, bottom);
    const knee = new THREE.Group();
    knee.position.set(0, -KNEE, 0);
    hip.add(knee);
    const shin = shared(`shin${R}`, () => limbGeo([[0, 0.056, 0.06, 0.004], [-0.05, 0.06, 0.064], [-0.2, 0.053, 0.056, -0.004], [-0.32, 0.043, 0.046], [-0.36, 0.045, 0.047]], R, [0.9, 0]));
    add(knee, shin, bottom);
    // Chaussure : bout arrondi, semelle claire.
    const shoe = shared(`shoe${R}`, () => loft([[-0.07, 0.042, 0.036], [-0.03, 0.052, 0.052], [0.04, 0.054, 0.046], [0.1, 0.048, 0.036], [0.135, 0.032, 0.026]].map(([z, w, h]) => ({ p: [0, 0, z], rx: w, ry: h, ryb: 0.012 })), { radial: R, sub: 3, round: [0.4, 0.6] }));
    add(knee, shoe, shoes, [0, -0.775 + KNEE, 0.02]);
    add(knee, new THREE.BoxGeometry(0.104, 0.018, 0.23), sole, [0, -0.8 + KNEE, 0.035]);
    legs.push(hip);
    knees.push(knee);
  }

  // --- Torse (bassin + buste, avec épaules). Le pivot est aux hanches : quand le buste se penche
  // (course, travail), les bras et la tête suivent. Les formes restent décrites en hauteur absolue.
  const torso = new THREE.Group();
  torso.position.y = HIP_Y;
  root.add(torso);
  const body = new THREE.Group();
  body.position.y = -HIP_Y;
  torso.add(body);
  const pelvis = shared(`pelvis${R}`, () => limbGeo([[0.74, 0.12, 0.09], [0.8, 0.165, 0.11], [0.9, 0.16, 0.105], [0.96, 0.15, 0.1]], R + 4));
  add(body, pelvis, bottom);
  const chest = shared(`chest${R}`, () => limbGeo([[0.9, 0.158, 0.105], [1.02, 0.15, 0.1], [1.15, 0.162, 0.108, 0.005], [1.27, 0.19, 0.108], [1.34, 0.215, 0.1], [1.385, 0.17, 0.085], [1.42, 0.085, 0.065], [1.44, 0.06, 0.055]], R + 4));
  add(body, chest, top);
  // Ourlet du tee-shirt et col.
  // (le tore est couché par la rotation : pour l'aplatir dans la profondeur du corps, c'est son axe Y local qu'on réduit)
  add(body, new THREE.TorusGeometry(0.15, 0.008, 6, R + 4), top, [0, 0.925, 0.002], [Math.PI / 2, 0, 0], [1, 0.64, 1]);
  add(body, new THREE.TorusGeometry(0.058, 0.014, 6, R), top, [0, 1.43, 0.005], [Math.PI / 2 - 0.15, 0, 0]);

  // --- Bras (pivot à l'épaule, coude articulé, manches courtes)
  const arms = [];
  const elbows = [];
  for (const s of [1, -1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.19, SHOULDER_Y - 0.03 - HIP_Y, 0);
    shoulder.rotation.z = s * 0.08;
    torso.add(shoulder);
    const upper = shared(`upperArm${R}`, () => limbGeo([[0.04, 0.052, 0.052], [0, 0.058, 0.058], [-0.14, 0.048, 0.051], [-ELBOW, 0.041, 0.043]], R - 2, [0, 0.9]));
    add(shoulder, upper, top);
    // Manche courte un peu évasée.
    const sleeve = shared(`sleeve${R}`, () => limbGeo([[0.025, 0.06, 0.06], [-0.02, 0.065, 0.065], [-0.1, 0.063, 0.065], [-0.13, 0.066, 0.068]], R - 2, [0.3, 0.3]));
    add(shoulder, sleeve, top);
    const elbow = new THREE.Group();
    elbow.position.set(0, -ELBOW, 0);
    shoulder.add(elbow);
    const fore = shared(`foreArm${R}`, () => limbGeo([[0, 0.041, 0.043], [-0.04, 0.042, 0.043], [-0.18, 0.035, 0.037], [-0.23, 0.034, 0.035]], R - 2, [0.9, 0]));
    add(elbow, fore, skin);
    // Main : paume, doigts serrés, pouce.
    const hand = new THREE.Group();
    hand.position.set(0, -0.26, 0.005);
    elbow.add(hand);
    add(hand, new THREE.SphereGeometry(0.038, 12, 10), skin, [0, 0, 0], null, [0.64, 1.05, 1], false);
    add(hand, new THREE.CapsuleGeometry(0.021, 0.03, 4, 8), skin, [0, -0.046, 0.004], null, [0.95, 1, 1.2], false);
    add(hand, new THREE.CapsuleGeometry(0.011, 0.025, 4, 6), skin, [-s * 0.012, -0.012, 0.03], [0.5, 0, s * 0.3], null, false);
    arms.push(shoulder);
    elbows.push(elbow);
  }

  // --- Tête (un peu grosse : proportions d'enfant)
  const head = new THREE.Group();
  head.position.set(0, 1.5 - HIP_Y, 0);
  head.scale.setScalar(1.1);
  torso.add(head);
  add(head, new THREE.CylinderGeometry(0.048, 0.056, 0.12, R), skin, [0, -0.07, 0]);
  const headGeo = shared(`head${high}`, () => sdfMesh(headSdf, [[-0.16, -0.12, -0.16], [0.16, 0.24, 0.17]], high ? 0.008 : 0.013));
  add(head, headGeo, skin, [0, 0.0, 0]);
  // Yeux : globe avec blanc, iris, paupière, cils, sourcils.
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTexture(look.eyes ?? 0x4a6b8a, 'human'), roughness: 0.08, clearcoat: high ? 1 : 0 });
  const lidMat = mat(look.skin, 0.6);
  const brow = mat(look.hair, 0.7);
  for (const s of [1, -1]) {
    const hit = rayHit(headSdf, [s * 0.042, 0.066, 0], [s * 0.15, 0, 1], 0.3);
    const n = sdfNormal(headSdf, hit, 0.003);
    const eye = new THREE.Group();
    eye.position.copy(hit).addScaledVector(n, -0.01);
    eye.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(s * 0.05, 0, 1).normalize());
    head.add(eye);
    add(eye, new THREE.SphereGeometry(0.0165, 16, 12), eyeMat, null, null, null, false);
    add(eye, new THREE.SphereGeometry(0.0175, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.3), lidMat, null, [0.3, 0, 0], null, false);
    add(eye, new THREE.TorusGeometry(0.0148, 0.0022, 6, 16, Math.PI), mat(0x2a1a14, 0.6), [0, 0.001, 0.007], [0.3, 0, 0], null, false);
    add(head, new THREE.CapsuleGeometry(0.004, 0.026, 4, 6), brow, [s * 0.046, 0.104, 0.118], [0, 0, Math.PI / 2 + s * 0.12], null, false);
  }
  // Bouche (sourire), lèvres et joues roses.
  const lips = mat(new THREE.Color(look.skin).lerp(new THREE.Color(0xb05a55), 0.45).getHex(), 0.5);
  add(head, new THREE.TorusGeometry(0.02, 0.0045, 6, 14, Math.PI * 0.9), lips, [0, -0.028, 0.118], [0.2, 0, Math.PI * 1.05], null, false);
  const blush = mat(new THREE.Color(look.skin).lerp(new THREE.Color(0xe08a80), 0.35).getHex(), 0.7);
  for (const s of [1, -1]) add(head, new THREE.SphereGeometry(0.018, 10, 8), blush, [s * 0.072, 0.0, 0.082], null, [1.3, 0.8, 0.35], false);

  // --- Cheveux
  const style = look.hairStyle;
  const capR = style === 'bald' ? 0.133 : 0.143;
  const cap = new THREE.SphereGeometry(capR, R + 6, 12, 0, Math.PI * 2, 0, style === 'bald' ? Math.PI * 0.42 : Math.PI * 0.56);
  add(head, cap, hair, [0, 0.075, -0.012], [-0.32, 0, 0], [0.96, 1.04, 1.02]);
  if (style !== 'bald') {
    // Frange et mèches sur les tempes.
    add(head, new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, [0.03, 0.155, 0.075], [0.6, 0, -0.3], [1.6, 0.6, 1]);
    add(head, new THREE.SphereGeometry(0.05, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, [-0.045, 0.15, 0.08], [0.65, 0, 0.35], [1.3, 0.55, 0.9]);
    for (const s of [1, -1]) add(head, new THREE.CapsuleGeometry(0.02, 0.06, 4, 8), hair, [s * 0.118, 0.06, 0.03], [0.15, 0, s * 0.08], null, false);
  }
  if (style === 'long') {
    const back = shared(`hairLong${R}`, () => loft([[0.12, 0.13, 0.06], [0.0, 0.135, 0.07], [-0.12, 0.13, 0.055], [-0.22, 0.11, 0.035]].map(([y, w, d]) => ({ p: [0, y, -0.06], rx: w, ry: d })), { radial: R, sub: 3, side: [1, 0, 0] }));
    add(head, back, hair, [0, 0, -0.01]);
    for (const s of [1, -1]) add(head, new THREE.CapsuleGeometry(0.03, 0.2, 4, 8), hair, [s * 0.115, -0.04, 0.0], [0.1, 0, s * 0.06], [1, 1, 1.4]);
  } else if (style === 'ponytail') {
    add(head, new THREE.SphereGeometry(0.035, 10, 8), hair, [0, 0.12, -0.14]);
    const tail = shared(`pony${R}`, () => loft([[0, 0.03], [-0.06, 0.04], [-0.15, 0.035], [-0.24, 0.015]].map(([y, r], i) => ({ p: [0, y, -i * 0.012], rx: r, ry: r })), { radial: 10, sub: 3 }));
    add(head, tail, hair, [0, 0.11, -0.16], [0.25, 0, 0]);
  } else if (style === 'curly') {
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const ring = i % 2;
      add(head, new THREE.SphereGeometry(0.045, 10, 8), hair,
        [Math.cos(a) * (0.115 - ring * 0.03), 0.13 + ring * 0.05 + Math.sin(i * 1.7) * 0.015, Math.sin(a) * (0.105 - ring * 0.03) - 0.02], null, null, false);
    }
  }
  if (look.hat) {
    const capMat = mat(look.top, 0.6);
    add(head, new THREE.SphereGeometry(0.15, R + 6, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), capMat, [0, 0.09, -0.005], [-0.15, 0, 0]);
    add(head, new THREE.CylinderGeometry(0.1, 0.1, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), capMat, [0, 0.135, 0.1], [0.12, 0, 0], [1, 1, 1.15]);
    add(head, new THREE.SphereGeometry(0.012, 8, 6), capMat, [0, 0.237, 0.0]);
  }

  return { root, legs, knees, arms, elbows, head, torso };
}

/**
 * Cycle de marche / course articulé. phase avance avec la distance parcourue ; speed en m/s.
 * Marche : petits pas, bras ballants. Course : foulée plus ample mais pas en grand écart, genoux
 * hauts, coudes à 90°, buste penché en avant depuis les hanches, tête qui reste droite.
 * À l'arrêt : jambes droites et respiration lente.
 */
export function animateAvatarWalk(a, phase, speed) {
  const go = Math.min(1, speed / 1.2); // 0 à l'arrêt, 1 dès qu'on avance franchement
  const run = Math.min(1, Math.max(0, (speed - 3.6) / 2.6));
  const amp = Math.min(0.52, speed * 0.13); // demi-amplitude des hanches (rad)
  const t = performance.now() / 1000;
  for (let i = 0; i < 2; i++) {
    const ph = phase + i * Math.PI;
    const swing = Math.sin(ph); // > 0 : jambe en arrière
    // La hanche fléchit plus vers l'avant qu'elle ne s'étend vers l'arrière.
    a.legs[i].rotation.set(swing * amp - amp * 0.25, 0, 0);
    // Le genou se plie pendant le retour de la jambe (haut en courant), presque droit à la pose du pied.
    const lift = Math.max(0, -Math.cos(ph));
    if (a.knees) a.knees[i].rotation.x = 0.06 * go + run * 0.22 + lift * lift * (amp * 1.7 + run * 0.7);
    // Bras opposé à la jambe ; coudes de plus en plus pliés quand on court.
    const arm = -swing * amp * 0.8;
    a.arms[i].rotation.set(arm, 0, (i === 0 ? 1 : -1) * (0.08 + run * 0.06));
    if (a.elbows) a.elbows[i].rotation.x = -(0.2 + run * 1.1) - Math.max(0, -arm) * 0.5;
  }
  // Buste penché depuis les hanches quand on court, léger roulis des épaules ; la tête compense.
  const breath = Math.sin(t * 1.6) * 0.012 * (1 - go);
  a.torso.rotation.set(0.03 * go + run * 0.26 + breath, Math.sin(phase) * 0.06 * amp, Math.sin(phase) * 0.015 * go);
  a.head.rotation.set(-(0.02 * go + run * 0.2) - breath * 0.6, 0, 0);
  // Rebond : deux appuis par cycle, plus marqué en courant (petite phase de vol).
  a.root.position.y = Math.abs(Math.sin(phase)) * (0.025 + run * 0.045) * go;
}

/** Pose assise (à cheval) ou debout. */
/**
 * Pose du personnage. 'ride' : à cheval ; fit (facultatif, calculé par Player.seat d'après le flanc du
 * cheval) : { lift : cuisse vers l'avant, spread : jambes écartées autour du ventre, knee : pli du genou,
 * kneeZ : le bas de la jambe revient le long du flanc }.
 */
export function poseAvatar(a, pose, fit = null) {
  if (pose === 'ride') {
    // Les cuisses s'écartent vers l'extérieur (jambe gauche x > 0 : rotation z positive) et entourent
    // le cheval ; le bas de la jambe descend le long du flanc jusqu'à l'étrier.
    const { lift = -1.0, spread = 0.6, knee = 1.2, kneeZ = -0.45 } = fit ?? {};
    a.legs.forEach((l, i) => l.rotation.set(lift, 0, (i === 0 ? 1 : -1) * spread));
    a.knees?.forEach((k, i) => k.rotation.set(knee, 0, (i === 0 ? 1 : -1) * kneeZ));
    a.arms.forEach((arm) => arm.rotation.set(-0.45, 0, 0));
    a.elbows?.forEach((e) => e.rotation.set(-0.8, 0, 0));
  } else {
    a.legs.forEach((l) => l.rotation.set(0, 0, 0));
    a.knees?.forEach((k) => k.rotation.set(0, 0, 0));
    a.arms.forEach((arm, i) => arm.rotation.set(0, 0, (i === 0 ? 1 : -1) * 0.08));
    a.elbows?.forEach((e) => e.rotation.set(-0.2, 0, 0));
  }
  a.torso.rotation.set(0, 0, 0);
  a.head.rotation.set(0, 0, 0);
}
