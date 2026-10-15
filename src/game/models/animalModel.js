// Modèles 3D des animaux, fabriqués à partir de formes simples.
// L'animal regarde vers +Z. Les pivots (pattes, cou, tête, queue, oreilles) servent aux animations.

import * as THREE from 'three';
import { furTexture, plainFur } from '../textures.js';

const HEAD_TILT = { horse: 1.05, dog: 0.2, cat: 0.12, rabbit: 0.25 };

function mat(color, map = null, roughness = 0.85) {
  return new THREE.MeshStandardMaterial({ color: map ? 0xffffff : color, map, roughness, metalness: 0 });
}

function mesh(geo, material, parent, pos = [0, 0, 0], rot = null, scale = null) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const capsule = (r, len) => new THREE.CapsuleGeometry(r, Math.max(0.001, len), 6, 14);
const sphere = (r) => new THREE.SphereGeometry(r, 18, 14);

/** Capsule qui part de l'origine et descend de `len` (pour les pattes). */
function hangingCapsule(r, len) {
  const g = capsule(r, len - 2 * r);
  g.translate(0, -len / 2, 0);
  return g;
}

/** Capsule qui part de l'origine et monte de `len` (cou, queue, oreilles). */
function risingCapsule(r, len) {
  const g = capsule(r, len - 2 * r);
  g.translate(0, len / 2, 0);
  return g;
}

function makeMaterials(look) {
  const coatMap = furTexture(look);
  return {
    coat: mat(0xffffff, coatMap),
    secondary: mat(0xffffff, plainFur(look.secondary)),
    third: mat(0xffffff, plainFur(look.third)),
    mane: mat(0xffffff, plainFur(look.mane), 0.7),
    dark: mat(0x1c1714, null, 0.5),
    hoof: mat(0x3a302a, null, 0.6),
    eye: mat(look.eye, null, 0.15),
    pupil: mat(0x050505, null, 0.1),
    pink: mat(0xd99a9a, null, 0.8),
    white: mat(0xf8f6f2, plainFur(0xf8f6f2)),
  };
}

export function buildAnimalModel(speciesId, look) {
  const m = look;
  const M = makeMaterials(look);
  const pattern = look.pattern;
  const fluff = m.fluff ?? 1;
  const L = m.bodyLen;
  const R = m.bodyR * fluff;
  const legLen = m.legLen * (m.legs ?? 1);
  const legR = m.legR * (1 + (fluff - 1) * 0.6);
  const y0 = legLen + R * 0.85;

  const usesSecondary = (part) => {
    switch (part) {
      case 'legs': return ['bicolor', 'tan', 'points', 'tricolor'].includes(pattern);
      case 'snout': return ['bicolor', 'tan', 'points', 'tricolor'].includes(pattern);
      case 'ears': return pattern === 'points';
      case 'tail': return pattern === 'points';
      case 'chest': return ['bicolor', 'tricolor', 'tan'].includes(pattern);
      default: return false;
    }
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const parts = { root, body, legs: [], y0 };

  // --- Corps
  if (speciesId === 'rabbit') {
    mesh(sphere(R * 1.2), M.coat, body, [0, y0, -L * 0.12], null, [1, 0.92, 1.25]);
    mesh(sphere(R * 0.85), M.coat, body, [0, y0 + R * 0.05, L * 0.22]);
  } else {
    mesh(capsule(R, L - 2 * R), M.coat, body, [0, y0, 0], [Math.PI / 2, 0, 0]);
    mesh(sphere(R * 1.08), M.coat, body, [0, y0 + R * 0.05, L / 2 - R * 0.9]);
    mesh(sphere(R * 1.04), M.coat, body, [0, y0 + R * 0.02, -L / 2 + R * 0.9]);
  }
  if (usesSecondary('chest')) {
    const chestMat = pattern === 'tan' ? M.secondary : M.secondary;
    mesh(sphere(R * 0.82), chestMat, body, [0, y0 - R * 0.25, L / 2 - R * 0.55]);
    mesh(capsule(R * 0.72, Math.max(0.01, L - 2.6 * R)), chestMat, body, [0, y0 - R * 0.38, 0], [Math.PI / 2, 0, 0], [1, 1, 0.6]);
  }
  if (fluff > 1.15 && speciesId !== 'rabbit') {
    // Collerette des races à poil long.
    mesh(sphere(R * 0.95), usesSecondary('chest') ? M.secondary : M.coat, body, [0, y0 + R * 0.2, L / 2 - R * 0.35]);
  }

  // --- Pattes
  const legX = R * (speciesId === 'horse' ? 0.5 : 0.55);
  const legTop = y0 - R * 0.3;
  const corners = [
    [legX, L / 2 - R * 0.75, true], [-legX, L / 2 - R * 0.75, true],
    [legX, -L / 2 + R * 0.75, false], [-legX, -L / 2 + R * 0.75, false],
  ];
  // Chaussettes blanches des chevaux : nombre de pattes selon la graine.
  const socks = pattern === 'socks' ? (look.seed % 5) : 0;
  corners.forEach(([x, z, front], i) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, legTop, speciesId === 'rabbit' ? (front ? L * 0.25 : -L * 0.15) : z);
    body.add(pivot);
    const total = legTop;
    if (speciesId === 'rabbit') {
      if (front) {
        mesh(hangingCapsule(legR, total), M.coat, pivot);
      } else {
        mesh(sphere(R * 0.62), M.coat, pivot, [0, -total * 0.1, 0], null, [0.7, 1, 1.2]);
        mesh(capsule(legR * 1.3, R * 0.7), usesSecondary('legs') ? M.secondary : M.coat, pivot,
          [0, -total + legR * 1.3, R * 0.3], [Math.PI / 2, 0, 0]);
      }
    } else {
      const upperLen = total * 0.48;
      const thigh = speciesId === 'horse' ? (front ? 1.9 : 2.4) : (front ? 1.35 : 1.7);
      const upper = new THREE.CylinderGeometry(legR * thigh, legR * 1.05, upperLen, 10);
      upper.translate(0, -upperLen / 2, 0);
      mesh(upper, M.coat, pivot);
      const lowerMat = (usesSecondary('legs') || i < socks) ? (pattern === 'socks' ? M.white : M.secondary) : M.coat;
      mesh(hangingCapsule(legR, total - upperLen + legR), lowerMat, pivot, [0, -upperLen + legR, 0]);
      if (speciesId === 'horse') {
        const hoof = new THREE.CylinderGeometry(legR * 1.15, legR * 1.4, legR * 2, 10);
        mesh(hoof, M.hoof, pivot, [0, -total + legR, 0]);
      } else {
        mesh(sphere(legR * 1.35), lowerMat, pivot, [0, -total + legR * 1.1, legR * 0.6], null, [1, 0.7, 1.4]);
      }
    }
    parts.legs.push({ pivot, front, side: x > 0 ? 1 : -1 });
  });

  // --- Cou et tête
  const neck = new THREE.Group();
  const neckBaseZ = speciesId === 'rabbit' ? L * 0.32 : L / 2 - R * 0.45;
  neck.position.set(0, y0 + R * 0.35, neckBaseZ);
  neck.rotation.x = m.neckAngle;
  body.add(neck);
  const neckR = R * (speciesId === 'horse' ? 0.45 : 0.55);
  if (speciesId === 'horse') {
    const g = new THREE.CylinderGeometry(neckR * 0.8, neckR * 1.35, m.neckLen, 14);
    g.translate(0, m.neckLen / 2, 0);
    mesh(g, M.coat, neck);
    mesh(sphere(neckR * 0.85), M.coat, neck, [0, m.neckLen, 0]);
    // Crinière
    const maneGeo = new THREE.BoxGeometry(0.06 * fluff, m.neckLen * 1.05, 0.1 * fluff);
    maneGeo.translate(0, m.neckLen / 2, 0);
    mesh(maneGeo, M.mane, neck, [0.03, 0, -neckR * 0.95], [0.08, 0, 0.12]);
  } else {
    mesh(risingCapsule(neckR, m.neckLen + neckR), M.coat, neck);
  }

  const head = new THREE.Group();
  head.position.set(0, m.neckLen, 0);
  head.rotation.x = HEAD_TILT[speciesId] - m.neckAngle;
  neck.add(head);
  const hr = m.headR * (1 + (fluff - 1) * 0.5);
  const snoutMat = usesSecondary('snout') ? M.secondary : M.coat;
  let snoutTip;
  if (speciesId === 'horse') {
    mesh(sphere(hr * 1.15), M.coat, head, [0, 0, 0]);
    const g = new THREE.CylinderGeometry(hr * 0.75, hr * 1.05, m.headLen, 14);
    g.rotateX(Math.PI / 2);
    mesh(g, snoutMat, head, [0, -hr * 0.1, m.headLen / 2]);
    mesh(sphere(hr * 0.8), snoutMat, head, [0, -hr * 0.15, m.headLen]);
    if (pattern === 'socks') {
      mesh(new THREE.BoxGeometry(hr * 0.35, 0.01, m.headLen * 0.9), M.white, head,
        [0, hr * 0.62, m.headLen * 0.45], [-0.12, 0, 0]);
    }
    snoutTip = [0, -hr * 0.2, m.headLen + hr * 0.7];
    mesh(sphere(hr * 0.12), M.dark, head, [hr * 0.35, -hr * 0.05, m.headLen + hr * 0.62]);
    mesh(sphere(hr * 0.12), M.dark, head, [-hr * 0.35, -hr * 0.05, m.headLen + hr * 0.62]);
    // Toupet
    mesh(new THREE.BoxGeometry(hr * 0.5, hr * 0.7, hr * 0.15), M.mane, head, [0, hr * 0.85, hr * 0.5], [0.5, 0, 0]);
  } else {
    const skullScale = speciesId === 'cat' ? [1.05, 0.92, 1] : speciesId === 'rabbit' ? [0.95, 0.95, 1.15] : [1, 0.95, 1.1];
    mesh(sphere(hr), M.coat, head, [0, 0, 0], null, skullScale);
    const sl = m.headLen * (m.snout ?? 1) * (speciesId === 'dog' ? 0.42 : 0.6);
    const sr = hr * (speciesId === 'dog' ? 0.58 : 0.55);
    if (sl > 0.01) {
      const g = new THREE.CylinderGeometry(sr * 0.78, sr, sl, 14);
      g.rotateX(Math.PI / 2);
      mesh(g, snoutMat, head, [0, -hr * 0.32, hr * 0.62 + sl / 2], null, [1, 0.85, 1]);
      mesh(sphere(sr * 0.8), snoutMat, head, [0, -hr * 0.32, hr * 0.62 + sl], null, [1, 0.8, 0.8]);
    } else {
      mesh(sphere(sr), snoutMat, head, [0, -hr * 0.3, hr * 0.75]);
    }
    snoutTip = [0, -hr * 0.18, hr * 0.7 + sl + sr * 0.6];
    const noseMat = speciesId === 'dog' ? M.dark : M.pink;
    mesh(sphere(hr * (speciesId === 'dog' ? 0.18 : 0.11)), noseMat, head, snoutTip);
  }

  // Yeux
  const eyeR = hr * (speciesId === 'horse' ? 0.16 : speciesId === 'cat' ? 0.24 : 0.2);
  const eyePos = speciesId === 'horse'
    ? [hr * 1.02, hr * 0.3, hr * 0.4]
    : speciesId === 'rabbit' ? [hr * 0.7, hr * 0.25, hr * 0.5] : [hr * 0.48, hr * 0.28, hr * 0.78];
  for (const s of [1, -1]) {
    mesh(sphere(eyeR), M.eye, head, [eyePos[0] * s, eyePos[1], eyePos[2]]);
    const out = speciesId === 'horse' || speciesId === 'rabbit' ? [s * eyeR * 0.55, 0, eyeR * 0.35] : [s * eyeR * 0.15, 0, eyeR * 0.6];
    mesh(sphere(eyeR * 0.55), M.pupil, head, [eyePos[0] * s + out[0], eyePos[1], eyePos[2] + out[2]],
      null, speciesId === 'cat' ? [0.45, 1, 1] : null);
  }

  // Oreilles
  const earMat = usesSecondary('ears') ? M.secondary : M.coat;
  parts.ears = [];
  for (const s of [1, -1]) {
    const ear = new THREE.Group();
    head.add(ear);
    let g;
    switch (m.earType) {
      case 'horse':
        ear.position.set(s * hr * 0.45, hr * 0.95, -hr * 0.1);
        ear.rotation.set(-0.2, 0, -s * 0.15);
        g = new THREE.ConeGeometry(hr * 0.24, hr * 1.1, 10);
        g.translate(0, hr * 0.5, 0);
        mesh(g, M.coat, ear, [0, 0, 0], null, [1, 1, 0.6]);
        break;
      case 'pointed':
      case 'bat':
      case 'cat': {
        const big = m.earType === 'bat' ? 1.35 : m.earType === 'cat' ? 0.9 : 1;
        ear.position.set(s * hr * 0.52, hr * 0.78, -hr * 0.1);
        ear.rotation.set(-0.1, 0, -s * 0.25);
        g = new THREE.ConeGeometry(hr * 0.36 * big, hr * 0.85 * big, m.earType === 'cat' ? 4 : 10);
        g.translate(0, hr * 0.4 * big, 0);
        mesh(g, earMat, ear, [0, 0, 0], null, [1, 1, 0.45]);
        g = new THREE.ConeGeometry(hr * 0.22 * big, hr * 0.6 * big, m.earType === 'cat' ? 4 : 10);
        g.translate(0, hr * 0.32 * big, 0);
        mesh(g, M.pink, ear, [0, 0, hr * 0.06], null, [1, 1, 0.3]);
        break;
      }
      case 'semi':
        ear.position.set(s * hr * 0.55, hr * 0.75, -hr * 0.05);
        ear.rotation.set(0.9, 0, -s * 0.3);
        g = new THREE.ConeGeometry(hr * 0.34, hr * 0.7, 10);
        g.translate(0, hr * 0.33, 0);
        mesh(g, earMat, ear, [0, 0, 0], null, [1, 1, 0.4]);
        break;
      case 'rabbit':
      case 'lop': {
        const lop = m.earType === 'lop';
        ear.position.set(s * hr * 0.35, hr * 0.75, -hr * 0.25);
        ear.rotation.set(lop ? 0 : -0.25, 0, lop ? -s * 2.4 : -s * 0.12);
        mesh(risingCapsule(hr * 0.24, hr * 2.2), earMat, ear, [0, 0, 0], null, [1, 1, 0.45]);
        mesh(risingCapsule(hr * 0.13, hr * 1.8), M.pink, ear, [0, hr * 0.15, hr * 0.06], null, [1, 1, 0.3]);
        break;
      }
      default: // tombantes (floppy)
        ear.position.set(s * hr * 0.82, hr * 0.45, -hr * 0.1);
        ear.rotation.set(0, 0, s * 0.25);
        mesh(sphere(hr * 0.55), earMat, ear, [0, -hr * 0.45, 0], null, [0.28, 1, 0.65]);
    }
    parts.ears.push(ear);
  }

  // --- Queue
  const tail = new THREE.Group();
  const tailZ = speciesId === 'rabbit' ? -L * 0.12 - R * 1.2 : -L / 2 + R * 0.15;
  tail.position.set(0, y0 + R * (speciesId === 'rabbit' ? 0.1 : 0.4), tailZ);
  body.add(tail);
  const tailMat = usesSecondary('tail') ? M.secondary : M.coat;
  switch (m.tailType) {
    case 'horse': {
      tail.rotation.x = -2.75;
      mesh(risingCapsule(R * 0.16, R * 0.9), M.coat, tail);
      const g = new THREE.CylinderGeometry(R * 0.12 * fluff, R * 0.32 * fluff, legLen * 0.95, 10);
      g.translate(0, legLen * 0.95 / 2 + R * 0.3, 0);
      mesh(g, M.mane, tail);
      break;
    }
    case 'cat': {
      tail.rotation.x = -0.45;
      const len = L * 0.8;
      mesh(risingCapsule(R * 0.17 * fluff, len * 0.6), tailMat, tail);
      const tip = new THREE.Group();
      tip.position.y = len * 0.55;
      tip.rotation.x = -0.7;
      tail.add(tip);
      mesh(risingCapsule(R * 0.16 * fluff, len * 0.45), pattern === 'bicolor' ? M.secondary : tailMat, tip);
      break;
    }
    case 'curl': {
      const g = new THREE.TorusGeometry(R * 0.38, R * 0.17 * fluff, 8, 16, Math.PI * 1.5);
      mesh(g, tailMat, tail, [0, R * 0.42, R * 0.25], [0, Math.PI / 2, Math.PI * 0.75]);
      break;
    }
    case 'stub':
      mesh(sphere(R * 0.22), tailMat, tail);
      break;
    case 'pompom':
      mesh(sphere(R * 0.38 * fluff), M.white, tail);
      break;
    default: // chien
      tail.rotation.x = -0.9;
      mesh(risingCapsule(R * 0.16 * fluff, L * 0.5), tailMat, tail);
      if (pattern === 'bicolor' || pattern === 'tricolor') {
        mesh(sphere(R * 0.17 * fluff), M.secondary, tail, [0, L * 0.47, 0]);
      }
  }

  Object.assign(parts, { neck, head, tail, snoutTip, headHeight: y0 + R * 0.35 + m.neckLen * Math.cos(m.neckAngle) });
  parts.saddleY = y0 + R;
  return parts;
}

/** Libère la mémoire graphique d'un modèle retiré de la scène. */
export function disposeModel(object) {
  object.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose?.();
    }
  });
}
