// Végétation et rochers, dessinés en « instances » pour rester fluides sur téléphone.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const sphereAt = (r, x, y, z, sx = 1, sy = 1, sz = 1) => {
  const g = new THREE.IcosahedronGeometry(r, 2);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
};

const coneAt = (r, h, y) => {
  const g = new THREE.ConeGeometry(r, h, 9);
  g.translate(0, y, 0);
  return g;
};

// Couleurs du feuillage selon la saison (null = arbre sans feuilles).
const FOLIAGE = {
  deciduous: { spring: 0x6fa13d, summer: 0x4f8a32, autumn: 0xc77a2a, winter: null },
  maple: { spring: 0x76a845, summer: 0x4d8a34, autumn: 0xc8422a, winter: null },
  cherry: { spring: 0xf2b6c8, summer: 0x5a8f38, autumn: 0xd0702e, winter: null },
  birch: { spring: 0x9cc25a, summer: 0x77a845, autumn: 0xe0b33a, winter: null },
  pine: { spring: 0x2f5e34, summer: 0x2c5a31, autumn: 0x2c5631, winter: 0x2f5536 },
};

function treeGeometries(type) {
  if (type === 'pine') {
    const trunk = new THREE.CylinderGeometry(0.18, 0.28, 2.4, 7);
    trunk.translate(0, 1.2, 0);
    const leaves = mergeGeometries([coneAt(2.1, 3.4, 2.8), coneAt(1.65, 2.9, 4.4), coneAt(1.1, 2.4, 5.9)]);
    return { trunk, leaves };
  }
  const tall = type === 'birch' ? 1.4 : 1;
  const trunk = new THREE.CylinderGeometry(0.2, 0.35, 3.2 * tall, 7);
  trunk.translate(0, 1.6 * tall, 0);
  const top = 3.6 * tall;
  const leaves = mergeGeometries([
    sphereAt(1.9, 0, top, 0, 1, 0.85, 1),
    sphereAt(1.4, 1.1, top - 0.5, 0.4),
    sphereAt(1.3, -0.9, top - 0.3, -0.5),
    sphereAt(1.2, 0.2, top + 0.9, -0.3),
  ]);
  return { trunk, leaves };
}

/**
 * Forêt en instances. spots : liste de { x, y, z, s, r }.
 * Renvoie un groupe à ajouter à la scène.
 */
export function forest(type, spots, season, snowy) {
  const g = new THREE.Group();
  if (!spots.length) return g;
  const { trunk, leaves } = treeGeometries(type);
  const trunkColor = type === 'birch' ? 0xe8e4dc : 0x5b3f2b;
  const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: trunkColor, roughness: 0.95 }), spots.length);
  const foliageColor = FOLIAGE[type][season];
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const crowns = foliageColor !== null ? new THREE.InstancedMesh(leaves, leafMat, spots.length) : null;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  const snow = new THREE.Color(0xf2f5f8);
  spots.forEach((p, i) => {
    q.setFromAxisAngle(up, p.r);
    m4.compose(new THREE.Vector3(p.x, p.y - 0.2, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
    trunks.setMatrixAt(i, m4);
    if (crowns) {
      crowns.setMatrixAt(i, m4);
      color.setHex(foliageColor).offsetHSL((p.r % 0.1) - 0.05, 0, ((p.s * 7) % 0.12) - 0.06);
      if (snowy) color.lerp(snow, 0.55);
      crowns.setColorAt(i, color);
    }
  });
  trunks.castShadow = true;
  trunks.receiveShadow = true;
  g.add(trunks);
  if (crowns) {
    crowns.castShadow = true;
    crowns.receiveShadow = true;
    g.add(crowns);
  }
  return g;
}

export function rocks(spots, color = 0x8c8a86) {
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }), spots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spots.forEach((p, i) => {
    q.setFromEuler(new THREE.Euler(p.r, p.r * 2, 0));
    m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s, p.s * 0.6, p.s * 0.9));
    im.setMatrixAt(i, m4);
  });
  im.castShadow = true;
  im.receiveShadow = true;
  return im;
}

/** Touffes d'herbe et fleurs (petites, nombreuses). */
export function groundCover(spots, grassColor, flowerColors) {
  const g = new THREE.Group();
  const blade = new THREE.ConeGeometry(0.045, 0.32, 3);
  blade.translate(0, 0.16, 0);
  const tuft = mergeGeometries([0, 1, 2, 3].map((i) => {
    const b = blade.clone();
    b.rotateZ((i - 1.5) * 0.25);
    b.rotateY(i * 1.3);
    b.translate((i - 1.5) * 0.06, 0, (i % 2) * 0.05);
    return b;
  }));
  const grass = new THREE.InstancedMesh(tuft, new THREE.MeshStandardMaterial({ color: grassColor, roughness: 1 }), spots.length);
  const flowerGeo = new THREE.IcosahedronGeometry(0.07, 0);
  flowerGeo.translate(0, 0.24, 0);
  const flowers = flowerColors.length ? new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), spots.length) : null;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  spots.forEach((p, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.r * 6);
    m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
    grass.setMatrixAt(i, m4);
    if (flowers) {
      const show = (p.r * 100) % 1 < 0.3;
      m4.compose(new THREE.Vector3(p.x + 0.1, p.y, p.z), q, new THREE.Vector3(show ? 1 : 0, show ? 1 : 0, show ? 1 : 0));
      flowers.setMatrixAt(i, m4);
      flowers.setColorAt(i, c.setHex(flowerColors[i % flowerColors.length]));
    }
  });
  grass.receiveShadow = true;
  g.add(grass);
  if (flowers) g.add(flowers);
  return g;
}

export function mountainRing(count, radius, snowLine, color = 0x6f6a66, rng = Math.random) {
  const g = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
  const snow = new THREE.MeshStandardMaterial({ color: 0xf6f8fb, roughness: 0.9, flatShading: true });
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng() * 0.2;
    const h = 60 + rng() * 70;
    const r = 40 + rng() * 40;
    const d = radius + rng() * 60;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7, 1), rock);
    cone.position.set(Math.cos(a) * d, h / 2 - 8, Math.sin(a) * d);
    cone.rotation.y = rng() * 3;
    g.add(cone);
    if (snowLine) {
      const capH = h * 0.35;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.35 * 1.02, capH, 7, 1), snow);
      cap.position.set(cone.position.x, h - 8 - capH / 2 + 0.5, cone.position.z);
      cap.rotation.y = cone.rotation.y;
      g.add(cap);
    }
  }
  return g;
}
