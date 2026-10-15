// Équipement visible sur l'animal en 3D : couverture, selle, filet, guêtres, bonnet, collier.

import * as THREE from 'three';
import { BLANKET_COLORS } from '../sim/gear.js';

const mat = (color, roughness = 0.7) => new THREE.MeshStandardMaterial({ color, roughness });

/** Ajoute l'équipement de l'animal sur son modèle. Renvoie le groupe créé (à retirer pour changer). */
export function buildGear(model, look, gear = {}) {
  const group = new THREE.Group();
  const holders = [];
  const L = look.bodyLen;
  const R = look.bodyR * (look.fluff ?? 1);
  const y0 = model.y0;
  const add = (parent, geo, material, pos, rot) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    m.castShadow = true;
    parent.add(m);
    holders.push(m);
    return m;
  };

  const blanket = gear.blanket;
  if (blanket) {
    const color = BLANKET_COLORS[blanket.color] ?? BLANKET_COLORS.red;
    const geo = new THREE.CylinderGeometry(R * 1.12, R * 1.12, L * 0.82, 24, 1, true, -Math.PI * 0.62, Math.PI * 1.24);
    geo.rotateX(Math.PI / 2);
    add(model.body, geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide }), [0, y0 + R * 0.05, -L * 0.03]);
    // Bordure claire
    const edge = new THREE.TorusGeometry(R * 1.12, R * 0.04, 6, 24, Math.PI * 1.24);
    edge.rotateZ(-Math.PI * 0.12);
    add(model.body, edge, mat(0xf2ede4), [0, y0 + R * 0.05, L * 0.38]);
  }
  if (gear.saddle) {
    add(model.body, new THREE.CapsuleGeometry(R * 0.55, R * 0.5, 4, 12), mat(0x5a3418, 0.5), [0, y0 + R * 1.02, L * 0.08], [Math.PI / 2, 0, 0]).scale.set(1, 1, 0.35);
    add(model.body, new THREE.BoxGeometry(R * 1.9, R * 0.06, R * 1.1), mat(0xe9e2d4, 0.9), [0, y0 + R * 0.93, L * 0.08]);
    for (const s of [1, -1]) {
      add(model.body, new THREE.BoxGeometry(0.02, R * 1.3, 0.03), mat(0x2a1a10), [s * R * 1.0, y0 + R * 0.35, L * 0.1]);
      add(model.body, new THREE.TorusGeometry(0.05, 0.012, 6, 12), mat(0xb8b8b8, 0.3), [s * R * 1.02, y0 - R * 0.35, L * 0.1], [0, Math.PI / 2, 0]);
    }
  }
  if (gear.bridle && model.head) {
    const hr = look.headR;
    const strap = mat(0x2a1a10, 0.5);
    add(model.head, new THREE.TorusGeometry(hr * 0.95, hr * 0.06, 6, 20), strap, [0, -hr * 0.1, look.headLen * 0.75]);
    add(model.head, new THREE.TorusGeometry(hr * 1.15, hr * 0.06, 6, 20), strap, [0, hr * 0.1, hr * 0.1], [0, 0, 0]);
    for (const s of [1, -1]) add(model.head, new THREE.SphereGeometry(hr * 0.12, 8, 8), mat(0xc0c0c0, 0.3), [s * hr * 0.8, -hr * 0.2, look.headLen * 0.85]);
  }
  if (gear.halter && !gear.bridle && model.head) {
    const hr = look.headR;
    const color = BLANKET_COLORS[gear.halter.color] ?? BLANKET_COLORS.red;
    const strap = mat(color, 0.6);
    add(model.head, new THREE.TorusGeometry(hr * 0.9, hr * 0.08, 6, 20), strap, [0, -hr * 0.1, look.headLen * 0.7]);
    add(model.head, new THREE.TorusGeometry(hr * 1.12, hr * 0.08, 6, 20), strap, [0, hr * 0.05, hr * 0.15]);
  }
  if (gear.head && model.head) {
    const hr = look.headR;
    add(model.head, new THREE.SphereGeometry(hr * 1.25, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: 0xd8e4ea, roughness: 0.9, transparent: true, opacity: 0.75 }), [0, hr * 0.15, hr * 0.3]);
  }
  if (gear.legs) {
    for (const leg of model.legs) {
      const len = y0 - R * 0.3;
      add(leg.pivot, new THREE.CylinderGeometry(look.legR * 1.5, look.legR * 1.6, len * 0.28, 10), mat(0x22324a, 0.8), [0, -len * 0.78, 0]);
    }
  }
  if (gear.neck && model.neck) {
    const color = BLANKET_COLORS[gear.neck.color] ?? BLANKET_COLORS.red;
    add(model.neck, new THREE.TorusGeometry(R * 0.6, R * 0.08, 6, 18), mat(color, 0.5), [0, look.neckLen * 0.6, 0], [Math.PI / 2, 0, 0]);
  }
  group.userData.meshes = holders;
  return group;
}

export function removeGear(group) {
  for (const m of group.userData.meshes ?? []) {
    m.parent?.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  }
}
