// Modèles 3D du dressage et des concours à l'extérieur : rectangle de dressage avec ses lettres,
// pastilles au sol qui dessinent la figure à suivre, et le site d'un concours (tribunes, public,
// paddock d'échauffement, boxes, podium, fanions). Construits seulement pendant un événement.

import * as THREE from 'three';
import { mergeStatic, grandstand, jumpObstacle, bunting, numberTexture } from './course.js';
import { signTexture } from '../textures.js';
import { ARENA, LETTERS, RAIL_LETTERS } from '../../sim/dressage.js';

const mat = (color, roughness = 0.75, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

function add(parent, geo, material, pos, rot) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------- rectangle de dressage

/**
 * Le rectangle de dressage (repère de la carrière) : lice basse blanche avec l'entrée à A,
 * pancartes des lettres, et une petite croix au sol à X.
 */
export function dressageArena() {
  const g = new THREE.Group();
  const white = mat(0xf6f4ee, 0.6);
  const { hl, hw } = ARENA;
  const gap = 1.6; // entrée à A
  const rail = (len, x, z, alongX) => add(g, new THREE.BoxGeometry(alongX ? len : 0.1, 0.22, alongX ? 0.1 : len), white, [x, 0.14, z]);
  rail(hl * 2, 0, -hw, true);
  rail(hl * 2, 0, hw, true);
  rail(hw * 2, -hl, 0, false);
  rail(hw - gap, hl, -(hw + gap) / 2, false);
  rail(hw - gap, hl, (hw + gap) / 2, false);
  // Petits plots tous les 3 m
  const plots = [];
  for (let x = -hl; x <= hl + 0.01; x += 3) plots.push([x, -hw], [x, hw]);
  for (let z = -hw + 3; z < hw; z += 3) {
    plots.push([-hl, z]);
    if (Math.abs(z) > gap) plots.push([hl, z]);
  }
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.3, 0.16), white, plots.length);
  const m4 = new THREE.Matrix4();
  plots.forEach(([x, z], i) => im.setMatrixAt(i, m4.makeTranslation(x, 0.15, z)));
  g.add(im);
  // Pancartes des lettres, 1 m à l'extérieur, tournées vers l'intérieur
  const post = mat(0x23302a, 0.7);
  for (const l of RAIL_LETTERS) {
    const p = LETTERS[l];
    const out = { x: Math.abs(p.x) >= hl ? Math.sign(p.x) : 0, z: Math.abs(p.z) >= hw ? Math.sign(p.z) : 0 };
    const x = p.x + out.x * 1.1;
    const z = p.z + out.z * 1.1;
    add(g, new THREE.BoxGeometry(0.08, 1.0, 0.08), post, [x, 0.5, z]);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.06), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
    board.position.set(x, 1.2, z);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshStandardMaterial({ map: numberTexture(l), roughness: 0.5 }));
    face.position.set(0, 0, 0.035);
    board.add(face);
    board.rotation.y = Math.atan2(-out.x, -out.z);
    g.add(board);
  }
  // Croix au sol à X
  const sandLine = mat(0xf0e6cc, 0.9);
  add(g, new THREE.BoxGeometry(1.4, 0.02, 0.12), sandLine, [0, 0.05, 0], [0, Math.PI / 4, 0]);
  add(g, new THREE.BoxGeometry(1.4, 0.02, 0.12), sandLine, [0, 0.05, 0], [0, -Math.PI / 4, 0]);
  mergeStatic(g);
  return g;
}

/**
 * Pastilles lumineuses posées au sol le long de la figure à suivre.
 * Renvoie l'InstancedMesh avec userData.set(points, heightAt) et userData.hide().
 */
export function pathDiscs(n = 48, color = 0xb070ff) {
  const im = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.32, 14).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.5, transparent: true, opacity: 0.85, depthWrite: false }),
    n,
  );
  im.frustumCulled = false;
  const m4 = new THREE.Matrix4();
  const hide = () => {
    for (let i = 0; i < n; i++) im.setMatrixAt(i, m4.makeScale(0, 0, 0));
    im.instanceMatrix.needsUpdate = true;
  };
  /** Répartit les pastilles à intervalles réguliers le long d'un tracé (coordonnées monde). */
  const set = (pts, heightAt) => {
    hide();
    if (!pts || pts.length < 2) return;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const total = cum[cum.length - 1];
    const count = Math.min(n, Math.max(2, Math.round(total / 1.4)));
    let seg = 1;
    for (let i = 0; i < count; i++) {
      const s = (i / (count - 1)) * total;
      while (seg < pts.length - 1 && cum[seg] < s) seg++;
      const a = pts[seg - 1];
      const b = pts[seg];
      const u = cum[seg] - cum[seg - 1] > 0 ? (s - cum[seg - 1]) / (cum[seg] - cum[seg - 1]) : 0;
      const x = a.x + (b.x - a.x) * u;
      const z = a.z + (b.z - a.z) * u;
      const k = i === count - 1 ? 1.6 : 1;
      im.setMatrixAt(i, m4.makeTranslation(x, heightAt(x, z) + 0.06, z).multiply(new THREE.Matrix4().makeScale(k, 1, k)));
    }
    im.instanceMatrix.needsUpdate = true;
  };
  im.userData.set = set;
  im.userData.hide = hide;
  hide();
  return im;
}

/** Anneau au sol (point d'arrêt). */
export function haltRing(color = 0xb070ff) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 28).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  m.position.y = 0.06;
  return m;
}

// ---------------------------------------------------------------- site d'un concours

function tent(color) {
  const g = new THREE.Group();
  add(g, new THREE.ConeGeometry(2.2, 1.6, 8), mat(color, 0.7), [0, 3.0, 0]);
  add(g, new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8), mat(0xf4f4f0), [0, 1.2, 0]);
  for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) add(g, new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), mat(0xf4f4f0), [x, 1.1, z]);
  add(g, new THREE.BoxGeometry(2.0, 0.8, 0.8), mat(0x9a7650, 0.85), [0, 0.4, 0.6]);
  return g;
}

function stallBox(color) {
  const g = new THREE.Group();
  const wood = mat(0xd9c3a0, 0.85);
  add(g, new THREE.BoxGeometry(2.4, 2.2, 0.08), wood, [0, 1.1, -1.2]);
  add(g, new THREE.BoxGeometry(0.08, 2.2, 2.4), wood, [-1.2, 1.1, 0]);
  add(g, new THREE.BoxGeometry(0.08, 2.2, 2.4), wood, [1.2, 1.1, 0]);
  add(g, new THREE.BoxGeometry(2.4, 1.1, 0.06), wood, [0, 0.55, 1.2]); // demi-porte
  add(g, new THREE.BoxGeometry(2.7, 0.1, 2.8), mat(color, 0.6), [0, 2.3, 0]);
  add(g, new THREE.BoxGeometry(1.2, 0.5, 0.5), mat(0xd8b24a, 0.9), [0, 0.25, -0.6]); // paille
  return g;
}

/**
 * Le site d'un concours autour de la carrière (repère de la carrière : centre en 0, entrée vers +x).
 * hw, hd : demi-dimensions de la carrière ; name : nom de l'événement ; label : texte du paddock.
 * Renvoie { group, stands, colliders (repère local), podium: { x, z, steps: [{ x, z, y }] } }.
 */
export function competitionVenueModel(hw, hd, name, label = 'Warm-up') {
  const g = new THREE.Group();
  const white = mat(0xf6f4ee, 0.6);
  const flagCols = [0xe0473a, 0xffcf2e, 0x2f9a4a, 0x2f6fd8, 0xb070ff, 0xff8a1f];
  const colliders = [];
  const stands = [];

  // Deux tribunes de plus : au nord (−z) et à l'ouest (−x), face à la carrière.
  const north = grandstand(hw * 1.3);
  north.position.set(0, 0, -hd - 1.4);
  north.rotation.y = Math.PI;
  g.add(north);
  stands.push(north);
  colliders.push({ x: 0, z: -hd - 2.6, hw: hw * 0.65 + 0.2, hd: 1.4 });
  const west = grandstand(hd * 1.3);
  west.position.set(-hw - 1.4, 0, 6);
  west.rotation.y = -Math.PI / 2;
  g.add(west);
  stands.push(west);
  colliders.push({ x: -hw - 2.6, z: 6, hw: 1.4, hd: hd * 0.65 + 0.2 });

  // Grande banderole au-dessus de l'entrée
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.5), new THREE.MeshStandardMaterial({ map: signTexture(name, '#b7322c', '#fff8e8', '🏆'), roughness: 0.6, side: THREE.DoubleSide }));
  banner.position.set(hw + 0.5, 5.3, 0);
  banner.rotation.y = Math.PI / 2;
  g.add(banner);
  for (const s of [-1, 1]) add(g, new THREE.CylinderGeometry(0.08, 0.1, 6.2, 8), white, [hw + 0.5, 3.1, s * 4.8]);

  // Mâts avec drapeaux le long de l'entrée, et guirlandes
  for (let i = 0; i < 6; i++) {
    const z = -10 + i * 4;
    const x = hw + 4;
    add(g, new THREE.CylinderGeometry(0.06, 0.08, 5, 8), white, [x, 2.5, z]);
    add(g, new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshStandardMaterial({ color: flagCols[i % flagCols.length], side: THREE.DoubleSide }), [x + 0.56, 4.6, z]);
  }
  bunting(g, [hw + 4, 4.4, -10], [hw + 4, 4.4, 10], flagCols);
  bunting(g, [-hw, 4.8, -hd - 4.5], [hw, 4.8, -hd - 4.5], flagCols);

  // Paddock d'échauffement au nord, derrière la tribune : lices blanches, deux cavaletti, une pancarte.
  const px = -2;
  const pz = -21.5;
  const phw = 10;
  const phd = 4.5;
  const posts = [];
  for (let x = -phw; x <= phw + 0.01; x += 2.5) posts.push([px + x, pz - phd], [px + x, pz + phd]);
  for (let z = -phd + 2.5; z < phd; z += 2.5) {
    posts.push([px - phw, pz + z]);
    posts.push([px + phw, pz + z]);
  }
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), white, posts.length);
  const m4 = new THREE.Matrix4();
  posts.forEach(([x, z], i) => im.setMatrixAt(i, m4.makeTranslation(x, 0.55, z)));
  g.add(im);
  const rail = (len, x, z, alongX) => {
    for (const y of [0.5, 1.0]) add(g, new THREE.BoxGeometry(alongX ? len : 0.07, 0.1, alongX ? 0.07 : len), white, [x, y, z]);
  };
  rail(phw * 2, px, pz - phd, true);
  rail(phw * 2 - 3, px - 1.5, pz + phd, true); // ouverture côté carrière, à droite
  rail(phd * 2, px - phw, pz, false);
  rail(phd * 2, px + phw, pz, false);
  colliders.push({ x: px, z: pz - phd, hw: phw, hd: 0.15, fence: true }, { x: px - 1.5, z: pz + phd, hw: phw - 1.5, hd: 0.15, fence: true },
    { x: px - phw, z: pz, hw: 0.15, hd: phd, fence: true }, { x: px + phw, z: pz, hw: 0.15, hd: phd, fence: true });
  for (const [x, h] of [[-4, 0.3], [4, 0.45]]) {
    const cav = jumpObstacle({ type: 'cavaletti', width: 3, colors: [0xffcf2e, 0xffffff] }, h);
    cav.group.position.set(px + x, 0, pz);
    cav.group.rotation.y = Math.PI / 2;
    g.add(cav.group);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), new THREE.MeshStandardMaterial({ map: signTexture(label, '#2f6fd8', '#ffffff', '🔥'), roughness: 0.6, side: THREE.DoubleSide }));
  sign.position.set(px + phw - 2, 1.9, pz + phd);
  g.add(sign);

  // Boxes temporaires à l'est du paddock
  const boxCols = [0x2f6fd8, 0xe0473a, 0x2f9a4a, 0xff8a1f];
  for (let i = 0; i < 4; i++) {
    const b = stallBox(boxCols[i]);
    b.position.set(12 + i * 2.7, 0, -20);
    g.add(b);
    colliders.push({ x: 12 + i * 2.7, z: -20.4, hw: 1.3, hd: 0.9 });
  }

  // Podium près de l'entrée (1 au milieu, 2 à gauche, 3 à droite, vus depuis la carrière)
  const podX = hw + 7;
  const podZ = -9;
  const stepH = [0.75, 0.5, 0.3];
  const stepCol = [0xffcf2e, 0xd9d9d9, 0xcd7f32];
  const order = [[0, 0], [-1.7, 1], [1.7, 2]]; // décalage z, indice de marche
  const steps = [];
  for (const [dz, k] of order) {
    const h = stepH[k];
    const m = add(g, new THREE.BoxGeometry(1.6, h, 1.6), mat(stepCol[k], 0.5), [podX, h / 2, podZ + dz]);
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshStandardMaterial({ map: numberTexture(String(k + 1)), roughness: 0.5 }));
    num.position.set(-0.81, 0, 0);
    num.rotation.y = -Math.PI / 2;
    m.add(num);
    steps[k] = { x: podX, z: podZ + dz, y: h };
  }
  add(g, new THREE.BoxGeometry(2.6, 0.1, 6.2), mat(0xb7322c, 0.7), [podX, 0.05, podZ]); // tapis rouge
  // Deux tentes (buvette, secrétariat) de l'autre côté de l'entrée
  for (const [z, c] of [[8, 0xe0473a], [13, 0x2f6fd8]]) {
    const te = tent(c);
    te.position.set(hw + 8, 0, z);
    g.add(te);
    colliders.push({ x: hw + 8, z, hw: 1.8, hd: 1.8 });
  }

  for (const s of stands) mergeStatic(s);
  mergeStatic(g, stands);
  return { group: g, stands, colliders, podium: { x: podX, z: podZ, steps } };
}
