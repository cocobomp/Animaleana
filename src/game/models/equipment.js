// Modèles 3D des équipements de la ferme (mangeoires, abreuvoirs, brosse…) et de la bergerie.

import * as THREE from 'three';

const mat = (color, roughness = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

function add(parent, geo, material, pos, rot) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const WOOD = 0x8a6040;
const METAL = 0x8d979e;
const WATER = 0x4a8fb5;
const HAY = 0xd6b65e;

function petFeeder() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.28, 0.32, 0.12, 20), mat(0xd9534a, 0.4), [0, 0.06, 0]);
  add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20), mat(0x8a5a32, 0.9), [0, 0.12, 0]);
  add(g, new THREE.BoxGeometry(0.3, 0.55, 0.25), mat(0xf2f2f2, 0.3, { transparent: true, opacity: 0.85 }), [0, 0.42, -0.15]);
  add(g, new THREE.BoxGeometry(0.26, 0.35, 0.21), mat(0x8a5a32, 0.9), [0, 0.34, -0.15]);
  return g;
}

function petFountain() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.3, 0.34, 0.16, 24), mat(0x5aa0c8, 0.3), [0, 0.08, 0]);
  add(g, new THREE.CylinderGeometry(0.26, 0.26, 0.02, 24), mat(WATER, 0.05, { metalness: 0.2 }), [0, 0.15, 0]);
  add(g, new THREE.CylinderGeometry(0.05, 0.07, 0.25, 12), mat(0xf2f2f2, 0.3), [0, 0.25, 0]);
  return g;
}

function autoLitter() {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(0.7, 0.5, 0.55), mat(0xe8e4dc, 0.4), [0, 0.25, 0]);
  add(g, new THREE.SphereGeometry(0.33, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x9ab7c9, 0.3), [0, 0.5, 0]);
  add(g, new THREE.CircleGeometry(0.16, 16), mat(0x222222), [0, 0.3, 0.28]);
  return g;
}

function hayrack() {
  const g = new THREE.Group();
  const wood = mat(WOOD);
  for (const x of [-0.9, 0.9]) add(g, new THREE.BoxGeometry(0.12, 1.4, 0.12), wood, [x, 0.7, 0]);
  add(g, new THREE.BoxGeometry(1.9, 0.1, 0.7), wood, [0, 0.5, 0]);
  for (let i = -4; i <= 4; i++) add(g, new THREE.BoxGeometry(0.04, 0.7, 0.04), wood, [i * 0.2, 1.0, 0.25], [0.3, 0, 0]);
  add(g, new THREE.BoxGeometry(1.8, 0.55, 0.55), mat(HAY, 1), [0, 0.85, 0]);
  add(g, new THREE.BoxGeometry(2.1, 0.08, 0.9), mat(0x5a3b28), [0, 1.45, 0], [0.1, 0, 0]);
  return g;
}

function trough() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.45, 0.45, 2, 20, 1, false, 0, Math.PI), mat(METAL, 0.35, { metalness: 0.6, side: THREE.DoubleSide }), [0, 0.6, 0], [0, 0, Math.PI / 2]);
  add(g, new THREE.BoxGeometry(1.95, 0.02, 0.8), mat(WATER, 0.05, { metalness: 0.2 }), [0, 0.5, 0]);
  for (const x of [-0.8, 0.8]) add(g, new THREE.BoxGeometry(0.08, 0.45, 0.8), mat(0x5d666c, 0.5), [x, 0.22, 0]);
  return g;
}

function penFeeder() {
  const g = new THREE.Group();
  const wood = mat(WOOD);
  add(g, new THREE.BoxGeometry(2.4, 0.4, 0.8), wood, [0, 0.45, 0]);
  add(g, new THREE.BoxGeometry(2.2, 0.15, 0.6), mat(HAY, 1), [0, 0.65, 0]);
  for (const x of [-1.1, 1.1]) add(g, new THREE.BoxGeometry(0.1, 0.5, 0.8), wood, [x, 0.2, 0]);
  return g;
}

function cowBrush() {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(0.15, 2.2, 0.15), mat(0x5d666c, 0.5, { metalness: 0.4 }), [0, 1.1, -0.3]);
  add(g, new THREE.BoxGeometry(0.15, 0.1, 0.5), mat(0x5d666c, 0.5, { metalness: 0.4 }), [0, 2.1, -0.1]);
  const brush = add(g, new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16), mat(0xe2b33c, 1), [0, 1.5, 0.15]);
  g.userData.spin = brush;
  return g;
}

export const EQUIPMENT_MODELS = {
  petFeeder, petFountain, autoLitter, hayrack, paddockTrough: trough, penFeeder, penTrough: trough, cowBrush,
};

/** Abri ouvert de la bergerie : un toit sur des poteaux. */
export function sheepfold() {
  const g = new THREE.Group();
  const wood = mat(0x7a5236);
  const w = 8;
  const d = 4;
  for (const x of [-w / 2, 0, w / 2]) {
    add(g, new THREE.BoxGeometry(0.2, 2.6, 0.2), wood, [x, 1.3, d / 2]);
    add(g, new THREE.BoxGeometry(0.2, 2.2, 0.2), wood, [x, 1.1, -d / 2]);
  }
  add(g, new THREE.BoxGeometry(w + 0.2, 2.2, 0.1), mat(0x8b6a4a), [0, 1.1, -d / 2]);
  add(g, new THREE.BoxGeometry(w + 1, 0.12, d + 1), mat(0x5b4a3a), [0, 2.5, 0], [-0.1, 0, 0]);
  add(g, new THREE.BoxGeometry(w - 0.4, 0.06, d - 0.4), mat(HAY, 1), [0, 0.04, 0]);
  return g;
}

/** Niche pour les chiens. */
export function kennel() {
  const g = new THREE.Group();
  const wood = mat(0xa0683c);
  add(g, new THREE.BoxGeometry(1.4, 1, 1.6), wood, [0, 0.5, 0]);
  const roofMat = mat(0xb5432f, 0.7);
  for (const s of [1, -1]) add(g, new THREE.BoxGeometry(0.95, 0.08, 1.8), roofMat, [s * 0.38, 1.22, 0], [0, 0, s * 0.62]);
  add(g, new THREE.BoxGeometry(0.6, 0.65, 0.05), mat(0x2a1a10), [0, 0.38, 0.81]);
  add(g, new THREE.CylinderGeometry(0.2, 0.22, 0.08, 16), mat(0x3f7cc4, 0.4), [0.9, 0.04, 0.6]);
  return g;
}

/** Clapier : petite maison surélevée pour les lapins. */
export function hutch() {
  const g = new THREE.Group();
  const wood = mat(0xc49a6c);
  for (const x of [-0.8, 0.8]) for (const z of [-0.35, 0.35]) add(g, new THREE.BoxGeometry(0.08, 0.5, 0.08), wood, [x, 0.25, z]);
  add(g, new THREE.BoxGeometry(1.8, 0.7, 0.9), wood, [0, 0.85, 0]);
  add(g, new THREE.BoxGeometry(0.8, 0.5, 0.02), mat(0xbfc7cc, 0.3, { transparent: true, opacity: 0.5 }), [-0.4, 0.85, 0.46]);
  add(g, new THREE.BoxGeometry(2, 0.08, 1.1), mat(0x5b4a3a), [0, 1.24, 0], [0.12, 0, 0]);
  add(g, new THREE.BoxGeometry(0.5, 0.06, 0.6), wood, [0.6, 0.3, 0.6], [-0.5, 0, 0]);
  return g;
}

/** Grillage bas (enclos des lapins). */
export function wireFence(len, alongX) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.5, metalness: 0.5, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
  mesh.position.y = 0.3;
  if (!alongX) mesh.rotation.y = Math.PI / 2;
  g.add(mesh);
  const post = mat(0x7a5a3a);
  const n = Math.max(2, Math.round(len / 1.2) + 1);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5;
    add(g, new THREE.BoxGeometry(0.06, 0.7, 0.06), post, alongX ? [t * len, 0.35, 0] : [0, 0.35, t * len]);
  }
  return g;
}
