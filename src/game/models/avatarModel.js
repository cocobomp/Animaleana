// Modèle 3D du personnage du joueur (regarde vers +Z, environ 1,6 m).
// Corps en « lofts » (formes lisses), tête sculptée (champ de distance), mains, chaussures,
// yeux avec iris et cils, vêtements avec plis légers (relief peint).

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

/** Tube vertical (membre) : sections [y, rayon x, rayon z, décalage z]. */
const limbGeo = (secs, radial) => loft(secs.map(([y, rx, rz, oz = 0]) => ({ p: [0, y, oz], rx, ry: rz })), { radial, sub: 3, side: [1, 0, 0] });

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

  // --- Jambes (pivot à la hanche)
  const legs = [];
  for (const s of [1, -1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.095, 0.82, 0);
    root.add(hip);
    const leg = shared(`leg${R}`, () => limbGeo([[0.06, 0.08, 0.08], [0, 0.082, 0.085], [-0.18, 0.07, 0.075], [-0.38, 0.055, 0.058, 0.005], [-0.45, 0.058, 0.062], [-0.6, 0.052, 0.055, -0.005], [-0.72, 0.042, 0.045], [-0.76, 0.044, 0.046]], R));
    add(hip, leg, bottom);
    // Chaussure : bout arrondi, semelle claire.
    const shoe = shared(`shoe${R}`, () => loft([[-0.07, 0.04, 0.035], [-0.03, 0.05, 0.05], [0.04, 0.052, 0.045], [0.1, 0.046, 0.035], [0.13, 0.03, 0.025]].map(([z, w, h]) => ({ p: [0, 0, z], rx: w, ry: h, ryb: 0.012 })), { radial: R, sub: 3, round: [0.4, 0.6] }));
    add(hip, shoe, shoes, [0, -0.775, 0.02]);
    add(hip, new THREE.BoxGeometry(0.1, 0.018, 0.22), sole, [0, -0.8, 0.035]);
    legs.push(hip);
  }

  // --- Torse (bassin + buste, avec épaules)
  const torso = new THREE.Group();
  root.add(torso);
  const pelvis = shared(`pelvis${R}`, () => limbGeo([[0.74, 0.12, 0.09], [0.8, 0.165, 0.11], [0.9, 0.16, 0.105], [0.96, 0.15, 0.1]], R + 4));
  add(torso, pelvis, bottom);
  const chest = shared(`chest${R}`, () => limbGeo([[0.9, 0.152, 0.1], [1.02, 0.145, 0.095], [1.15, 0.16, 0.105, 0.005], [1.27, 0.18, 0.105], [1.35, 0.185, 0.095], [1.4, 0.14, 0.08], [1.43, 0.07, 0.06]], R + 4));
  add(torso, chest, top);
  // Col.
  add(torso, new THREE.TorusGeometry(0.058, 0.014, 6, R), top, [0, 1.43, 0.005], [Math.PI / 2 - 0.15, 0, 0]);

  // --- Bras (pivot à l'épaule)
  const arms = [];
  for (const s of [1, -1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.2, 1.33, 0);
    shoulder.rotation.z = s * 0.08;
    root.add(shoulder);
    const arm = shared(`arm${R}`, () => limbGeo([[0.04, 0.05, 0.05], [0, 0.056, 0.056], [-0.14, 0.047, 0.05], [-0.27, 0.04, 0.042], [-0.3, 0.042, 0.042], [-0.45, 0.034, 0.036], [-0.5, 0.033, 0.034]], R - 2));
    add(shoulder, arm, top);
    // Main : paume, doigts serrés, pouce.
    const hand = new THREE.Group();
    hand.position.set(0, -0.53, 0.005);
    shoulder.add(hand);
    add(hand, new THREE.SphereGeometry(0.036, 12, 10), skin, [0, 0, 0], null, [0.62, 1.05, 1], false);
    add(hand, new THREE.CapsuleGeometry(0.02, 0.03, 4, 8), skin, [0, -0.045, 0.004], null, [0.95, 1, 1.2], false);
    add(hand, new THREE.CapsuleGeometry(0.01, 0.025, 4, 6), skin, [-s * 0.012, -0.012, 0.03], [0.5, 0, s * 0.3], null, false);
    arms.push(shoulder);
  }

  // --- Tête
  const head = new THREE.Group();
  head.position.set(0, 1.5, 0);
  root.add(head);
  add(head, new THREE.CylinderGeometry(0.048, 0.056, 0.12, R), skin, [0, -0.07, 0]);
  const headGeo = shared(`head${high}`, () => sdfMesh(headSdf, [[-0.16, -0.12, -0.16], [0.16, 0.24, 0.17]], high ? 0.008 : 0.013));
  add(head, headGeo, skin, [0, 0.0, 0]);
  // Yeux : globe, iris, paupière, sourcils.
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTexture(0x5a3a22, 'round'), roughness: 0.05, clearcoat: high ? 1 : 0 });
  const lidMat = mat(look.skin, 0.6);
  const brow = mat(look.hair, 0.7);
  for (const s of [1, -1]) {
    const hit = rayHit(headSdf, [s * 0.04, 0.068, 0], [s * 0.15, 0, 1], 0.3);
    const n = sdfNormal(headSdf, hit, 0.003);
    const eye = new THREE.Group();
    eye.position.copy(hit).addScaledVector(n, -0.009);
    eye.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(s * 0.05, 0, 1).normalize());
    head.add(eye);
    add(eye, new THREE.SphereGeometry(0.0145, 16, 12), eyeMat, null, null, null, false);
    add(eye, new THREE.SphereGeometry(0.0155, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.32), lidMat, null, [0.3, 0, 0], null, false);
    add(eye, new THREE.TorusGeometry(0.013, 0.0022, 6, 16, Math.PI), mat(0x2a1a14, 0.6), [0, 0.001, 0.006], [0.3, 0, 0], null, false);
    add(head, new THREE.CapsuleGeometry(0.004, 0.026, 4, 6), brow, [s * 0.044, 0.103, 0.118], [0, 0, Math.PI / 2 + s * 0.12], null, false);
  }
  // Bouche (sourire) et lèvres.
  const lips = mat(new THREE.Color(look.skin).lerp(new THREE.Color(0xb05a55), 0.45).getHex(), 0.5);
  add(head, new THREE.TorusGeometry(0.02, 0.0045, 6, 14, Math.PI * 0.9), lips, [0, -0.028, 0.118], [0.2, 0, Math.PI * 1.05], null, false);

  // --- Cheveux
  const style = look.hairStyle;
  const capR = style === 'bald' ? 0.133 : 0.141;
  const cap = new THREE.SphereGeometry(capR, R + 6, 12, 0, Math.PI * 2, 0, style === 'bald' ? Math.PI * 0.42 : Math.PI * 0.55);
  add(head, cap, hair, [0, 0.075, -0.012], [-0.32, 0, 0], [0.96, 1.04, 1.02]);
  if (style !== 'bald') {
    // Frange et mèches sur les tempes.
    add(head, new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, [0.03, 0.155, 0.075], [0.6, 0, -0.3], [1.6, 0.6, 1]);
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
    add(head, new THREE.SphereGeometry(0.148, R + 6, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), capMat, [0, 0.09, -0.005], [-0.15, 0, 0]);
    add(head, new THREE.CylinderGeometry(0.1, 0.1, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), capMat, [0, 0.135, 0.1], [0.12, 0, 0], [1, 1, 1.15]);
    add(head, new THREE.SphereGeometry(0.012, 8, 6), capMat, [0, 0.235, 0.0]);
  }

  return { root, legs, arms, head, torso };
}
