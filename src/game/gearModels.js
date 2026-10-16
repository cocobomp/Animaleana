// Équipement visible sur l'animal en 3D : couverture, selle, filet, guêtres, bonnet, collier.
// Tout est construit à partir des mesures de l'animal (look) et posé sur les pivots du modèle.

import * as THREE from 'three';
import { BLANKET_COLORS } from '../sim/gear.js';
import { loft } from './models/shapes.js';

const mat = (color, roughness = 0.7, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const METAL = { metalness: 0.85 };

/** Ajoute l'équipement de l'animal sur son modèle. Renvoie le groupe créé (à retirer pour changer). */
export function buildGear(model, look, gear = {}) {
  const group = new THREE.Group();
  const holders = [];
  const L = look.bodyLen;
  const R = look.bodyR * (look.fluff ?? 1);
  const y0 = model.y0;
  const add = (parent, geo, material, pos, rot, scale) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    if (scale) m.scale.set(...scale);
    m.castShadow = true;
    parent.add(m);
    holders.push(m);
    return m;
  };
  const back = model.saddleY ?? y0 + R;

  const blanket = gear.blanket;
  if (blanket) {
    const color = BLANKET_COLORS[blanket.color] ?? BLANKET_COLORS.red;
    const geo = new THREE.CylinderGeometry(R * 1.12, R * 1.12, L * 0.82, 24, 1, true, -Math.PI * 0.62, Math.PI * 1.24);
    geo.rotateX(Math.PI / 2);
    add(model.body, geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide }), [0, y0 + R * 0.05, -L * 0.03]);
    // Bordure claire et sangles sous le ventre.
    const edge = new THREE.TorusGeometry(R * 1.12, R * 0.04, 6, 24, Math.PI * 1.24);
    edge.rotateZ(-Math.PI * 0.12);
    add(model.body, edge, mat(0xf2ede4), [0, y0 + R * 0.05, L * 0.38]);
    const strap = mat(0x2a2a2a, 0.6);
    for (const z of [-L * 0.2, L * 0.15]) add(model.body, new THREE.TorusGeometry(R * 1.1, R * 0.025, 6, 20, Math.PI * 0.8), strap, [0, y0 + R * 0.05, z], [0, 0, Math.PI + Math.PI * 0.1]);
  }
  if (gear.saddle) {
    const leather = mat(0x8a5a2e, 0.5);
    const dark = mat(0x2a1a10, 0.6);
    const sz = L * 0.08; // centre de la selle
    // Siège : profil creusé, troussequin relevé derrière, pommeau devant.
    const seat = loft([[-0.3, 0.3, 0.1], [-0.22, 0.42, 0.22], [-0.1, 0.4, 0.1], [0.05, 0.38, 0.07], [0.18, 0.38, 0.12], [0.26, 0.32, 0.2], [0.3, 0.2, 0.08]]
      .map(([z, w, h]) => ({ p: [0, back + R * 0.06 + h * R, sz + z * L * 0.75], rx: w * R, ry: R * 0.09, ryb: R * 0.12 })), { radial: 14, sub: 3, round: [0.5, 0.5] });
    add(model.body, seat, leather, [0, 0, 0]);
    // Quartiers de chaque côté et tapis de selle à liseré.
    for (const s of [1, -1]) {
      add(model.body, new THREE.BoxGeometry(0.02, R * 0.75, R * 0.9), leather, [s * R * 0.9, back - R * 0.35, sz + R * 0.1], [0, 0, s * 0.3]);
      // Étrivière et étrier.
      add(model.body, new THREE.BoxGeometry(0.02, R * 1.2, 0.03), dark, [s * R * 1.0, back - R * 0.75, sz + R * 0.05]);
      add(model.body, new THREE.TorusGeometry(0.05, 0.012, 6, 12), mat(0xc0c4c8, 0.3, METAL), [s * R * 1.02, back - R * 1.35, sz + R * 0.05], [0, Math.PI / 2, 0]);
      add(model.body, new THREE.BoxGeometry(0.02, 0.012, 0.06), mat(0xc0c4c8, 0.3, METAL), [s * R * 1.02, back - R * 1.4, sz + R * 0.05]);
    }
    add(model.body, new THREE.BoxGeometry(R * 1.95, R * 0.05, R * 1.25), mat(0xe9e2d4, 0.9), [0, back - R * 0.04, sz + R * 0.02]);
    add(model.body, new THREE.BoxGeometry(R * 2.05, R * 0.045, R * 1.35), mat(0x2f5f9e, 0.9), [0, back - R * 0.06, sz + R * 0.02]);
    // Sangle sous le ventre.
    add(model.body, new THREE.TorusGeometry(R * 1.05, R * 0.03, 6, 22, Math.PI * 0.9), dark, [0, y0 + R * 0.05, sz + R * 0.15], [0, 0, Math.PI + Math.PI * 0.05]);
  }
  if (gear.bridle && model.head) {
    const hr = look.headR;
    const strap = mat(0x2a1a10, 0.5);
    const buckle = mat(0xc0c0c0, 0.3, METAL);
    add(model.head, new THREE.TorusGeometry(hr * 0.95, hr * 0.06, 6, 20), strap, [0, -hr * 0.1, look.headLen * 0.75]);
    add(model.head, new THREE.TorusGeometry(hr * 1.15, hr * 0.06, 6, 20), strap, [0, hr * 0.1, hr * 0.1], [0, 0, 0]);
    add(model.head, new THREE.TorusGeometry(hr * 1.0, hr * 0.05, 6, 20), strap, [0, hr * 0.2, -hr * 0.4], [0.3, 0, 0]); // frontal / têtière
    for (const s of [1, -1]) {
      add(model.head, new THREE.BoxGeometry(hr * 0.1, hr * 0.06, look.headLen * 0.62), strap, [s * hr * 0.95, -hr * 0.05, look.headLen * 0.4], [0.1, 0, 0]); // montant
      add(model.head, new THREE.TorusGeometry(hr * 0.12, hr * 0.03, 6, 12), buckle, [s * hr * 0.8, -hr * 0.2, look.headLen * 0.85], [0, Math.PI / 2, 0]); // anneau du mors
    }
  }
  if (gear.halter && !gear.bridle && model.head) {
    const hr = look.headR;
    const color = BLANKET_COLORS[gear.halter.color] ?? BLANKET_COLORS.red;
    const strap = mat(color, 0.6);
    const nz = look.headLen * 0.7;
    add(model.head, new THREE.TorusGeometry(hr * 0.9, hr * 0.08, 6, 20), strap, [0, -hr * 0.1, nz]); // muserolle
    add(model.head, new THREE.TorusGeometry(hr * 1.12, hr * 0.08, 6, 20), strap, [0, hr * 0.05, hr * 0.15]); // têtière
    for (const s of [1, -1]) add(model.head, new THREE.BoxGeometry(hr * 0.12, hr * 0.08, nz - hr * 0.15), strap, [s * hr * 0.95, -hr * 0.04, (nz + hr * 0.15) / 2], [0.08, 0, 0]); // montants
    add(model.head, new THREE.TorusGeometry(hr * 0.14, hr * 0.03, 6, 12), mat(0xc9c9c9, 0.3, METAL), [0, -hr * 0.95, nz - hr * 0.1], [0.4, 0, 0]); // anneau sous le menton
  }
  if (gear.head && model.head) {
    const hr = look.headR;
    add(model.head, new THREE.SphereGeometry(hr * 1.25, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: 0xd8e4ea, roughness: 0.9, transparent: true, opacity: 0.75 }), [0, hr * 0.15, hr * 0.3]);
  }
  if (gear.legs) {
    for (const leg of model.legs) {
      const len = y0 - R * 0.3;
      const boot = mat(0x22324a, 0.8);
      if (leg.knee) {
        // Guêtre sur le canon (sous le genou), avec ses deux bandes de fermeture.
        const kneeY = leg.knee.position.y;
        const lower = -len - kneeY; // du genou jusqu'au sol (négatif)
        const bl = -lower * 0.55;
        add(leg.knee, new THREE.CylinderGeometry(look.legR * 1.45, look.legR * 1.6, bl, 10), boot, [0, lower * 0.58, leg.knee.position.z * 0.2]);
        for (const k of [0.35, 0.75]) add(leg.knee, new THREE.TorusGeometry(look.legR * 1.55, look.legR * 0.18, 6, 12), mat(0xd0d6dc, 0.6), [0, lower * 0.58 + (k - 0.55) * bl, leg.knee.position.z * 0.2], [Math.PI / 2, 0, 0]);
      } else {
        add(leg.pivot, new THREE.CylinderGeometry(look.legR * 1.5, look.legR * 1.6, len * 0.28, 10), boot, [0, -len * 0.78, 0]);
      }
    }
  }
  if (gear.neck && model.neck) {
    const color = BLANKET_COLORS[gear.neck.color] ?? BLANKET_COLORS.red;
    const r = R * 0.6;
    const ny = look.neckLen * 0.6;
    add(model.neck, new THREE.TorusGeometry(r, R * 0.08, 6, 18), mat(color, 0.5), [0, ny, 0], [Math.PI / 2, 0, 0]);
    // Boucle et médaille.
    add(model.neck, new THREE.TorusGeometry(R * 0.07, R * 0.02, 6, 10), mat(0xd2ab4e, 0.3, METAL), [0, ny - R * 0.05, r * 0.95], [0.4, 0, 0]);
    add(model.neck, new THREE.CylinderGeometry(R * 0.08, R * 0.08, R * 0.02, 12), mat(0xd2ab4e, 0.3, METAL), [0, ny - R * 0.18, r * 0.95], [Math.PI / 2 + 0.4, 0, 0]);
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
