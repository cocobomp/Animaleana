// Décor de la voltige (src/game/Vaulting.js) : le cercle tracé dans le sable par les sabots, le tonneau de voltige
// (un cheval de bois pour apprendre : tonneau en douelles cerclées de fer, sur quatre pieds écartés, avec son tapis,
// son surfaix et ses deux poignées), la chambrière du longeur, et la table des
// juges. Matériaux à soi (sauf ceux de la sellerie, partagés : listés dans userData.sharedMats, jamais libérés).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TACK_PARTS } from './tackModels.js';
import { COLORS } from '../../sim/gear.js';

const mat = (color, roughness = 0.75, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

function add(parent, geo, material, pos = null, rot = null, scale = null) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Texture du bois (veines claires et foncées), faite une fois. */
let woodTex = null;
function woodTexture() {
  if (woodTex) return woodTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8c5a32';
  ctx.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 64;
    ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? '60,34,16' : '182,128,80'},${0.25 + Math.random() * 0.3})`;
    ctx.lineWidth = 0.6 + Math.random() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y <= 256; y += 16) ctx.lineTo(x + Math.sin(y * 0.05 + i) * 2.5, y);
    ctx.stroke();
  }
  woodTex = new THREE.CanvasTexture(c);
  woodTex.wrapS = THREE.RepeatWrapping;
  woodTex.wrapT = THREE.RepeatWrapping;
  woodTex.colorSpace = THREE.SRGBColorSpace;
  woodTex.userData.shared = true;
  return woodTex;
}

// ---------------------------------------------------------------- le cercle dans le sable

/**
 * La piste du cercle : un anneau de sable foulé, plus foncé, aux bords qui s'effacent (texture radiale), posé sur le
 * sable de la carrière. r : rayon du milieu de la piste ; w : sa largeur.
 */
export function circleTrack(r, w = 1.5) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 8;
  const ctx = c.getContext('2d');
  const grd = ctx.createLinearGradient(0, 0, 256, 0);
  grd.addColorStop(0, 'rgba(120,92,52,0)');
  grd.addColorStop(0.3, 'rgba(120,92,52,0.5)');
  grd.addColorStop(0.5, 'rgba(110,84,46,0.62)');
  grd.addColorStop(0.7, 'rgba(120,92,52,0.5)');
  grd.addColorStop(1, 'rgba(120,92,52,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 256, 8);
  // traces de sabots : petites taches
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(80,60,30,${0.15 + Math.random() * 0.2})`;
    ctx.fillRect(70 + Math.random() * 116, Math.random() * 8, 2, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.RingGeometry(r - w / 2, r + w / 2, 96, 1);
  // u : de l'intérieur (0) à l'extérieur (1)
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (d - (r - w / 2)) / w, 0.5);
  }
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- le tonneau de voltige

/**
 * Le tonneau de voltige (repère : posé au sol, l'avant vers +Z). Renvoie le groupe, avec userData :
 * seat (point d'assise, dessus du tapis), grips (milieu des deux poignées), width (demi-largeur sous le dessus),
 * top (hauteur du dessus), padColor.
 */
export function vaultBarrel(padKey = 'navy') {
  const g = new THREE.Group();
  const P = TACK_PARTS;
  const shared = [];
  const keep = (m) => {
    shared.push(m);
    return m;
  };
  const wood = mat(0xffffff, 0.62, { map: woodTexture() });
  const darkWood = mat(0x6b4224, 0.7);
  const iron = mat(0x3b3d42, 0.45, { metalness: 0.6 });
  const R = 0.31; // rayon au milieu
  const LEN = 1.05;
  const Y = 0.88; // hauteur de l'axe du tonneau (le dessus à 1,2 m : à la taille d'une enfant)
  // Tonneau : profil bombé (tour), couché le long de z, en douelles (bandes de bois).
  const prof = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    prof.push(new THREE.Vector2(R * (0.86 + 0.14 * Math.sin(Math.PI * t)), (t - 0.5) * LEN));
  }
  const body = new THREE.LatheGeometry(prof, 28);
  body.rotateX(Math.PI / 2);
  add(g, body, wood, [0, Y, 0]);
  // Fonds du tonneau
  for (const s of [1, -1]) add(g, new THREE.CircleGeometry(R * 0.86, 28), darkWood, [0, Y, s * LEN / 2], [0, s > 0 ? 0 : Math.PI, 0]);
  // Cercles de fer
  for (const z of [-0.42, -0.3, 0.3, 0.42]) {
    const t = z / LEN + 0.5;
    const r = R * (0.86 + 0.14 * Math.sin(Math.PI * t)) + 0.004;
    add(g, new THREE.TorusGeometry(r, 0.012, 6, 32), iron, [0, Y, z]);
  }
  // Pieds : quatre poteaux écartés, entretoises.
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const leg = add(g, new THREE.BoxGeometry(0.08, Y + 0.12, 0.08), darkWood, [sx * 0.33, (Y - 0.1) / 2, sz * 0.36], [sz * -0.08, 0, sx * 0.2]);
      leg.position.y = (Y - 0.12) / 2;
    }
    add(g, new THREE.BoxGeometry(0.06, 0.07, 0.86), darkWood, [sx * 0.38, 0.32, 0]);
  }
  for (const sz of [1, -1]) add(g, new THREE.BoxGeometry(0.86, 0.06, 0.06), darkWood, [0, 0.62, sz * 0.4], [0, 0, 0]);
  // Tapis de voltige sur le dessus (une nappe épaisse), son bord, et le surfaix avec ses poignées.
  const padMat = keep(P.quiltMat(COLORS[padKey] ?? COLORS.navy));
  const top = Y + R; // dessus du bois
  const T = 0.035;
  const padGeo = new THREE.CylinderGeometry(R + T, R + T, 0.78, 32, 1, true, -1.1, 2.2);
  padGeo.rotateX(-Math.PI / 2); // (l'axe le long de z, le milieu de la nappe en haut)
  add(g, padGeo, padMat, [0, Y, -0.04]);
  const trim = keep(P.clothMat(new THREE.Color(COLORS[padKey] ?? COLORS.navy).multiplyScalar(0.45).getHex()));
  for (const z of [-0.43, 0.35]) add(g, new THREE.TorusGeometry(R + T / 2, T / 2 + 0.004, 6, 24, 2.2), trim, [0, Y, z], [0, 0, Math.PI / 2 - 1.1]);
  const leather = keep(P.leatherMat('black'));
  const zS = 0.2; // surfaix, devant le siège
  add(g, new THREE.TorusGeometry(R + T + 0.01, 0.012, 6, 32, 2.6), leather, [0, Y, zS], [0, 0, Math.PI / 2 - 1.3], [1, 1, 5.5]);
  const grips = [];
  for (const s of [1, -1]) {
    const a = Math.PI / 2 - s * 0.27;
    const base = new THREE.Vector3(Math.cos(a) * (R + T + 0.02), Y + Math.sin(a) * (R + T + 0.02), zS);
    const up = new THREE.Vector3(s * 0.25, 1, 0).normalize();
    const path = [];
    for (let i = 0; i <= 12; i++) {
      const t = Math.PI * (i / 12);
      const sz = Math.sign(Math.cos(t)) * Math.abs(Math.cos(t)) ** 0.6;
      const h = Math.abs(Math.sin(t)) ** 0.45;
      path.push(base.clone().addScaledVector(up, 0.14 * h).add(new THREE.Vector3(0, 0, 0.055 * sz)).toArray());
    }
    add(g, P.tube(path, 0.016, false, 10), leather);
    add(g, P.tube(path.slice(3, 10), 0.0185, false, 10), keep(P.suedeMat(0x7a4a26)));
    grips.push(base.clone().addScaledVector(up, 0.135));
  }
  g.userData = {
    seat: new THREE.Vector3(0, top + T, -0.12),
    grips,
    width: R + T + 0.02,
    top: top + T,
    sharedMats: shared,
  };
  return g;
}

// ---------------------------------------------------------------- la chambrière

/** La chambrière du longeur : un manche effilé (1,8 m), dans le repère du groupe le long de +y depuis la main. */
export function lungeWhip() {
  const g = new THREE.Group();
  const stick = new THREE.CylinderGeometry(0.006, 0.015, 1.8, 6);
  stick.translate(0, 0.9, 0);
  add(g, stick, mat(0x1e1b19, 0.4));
  const grip = new THREE.CylinderGeometry(0.014, 0.014, 0.22, 8);
  grip.translate(0, 0.08, 0);
  add(g, grip, mat(0x6b3a1e, 0.6));
  return g;
}

// ---------------------------------------------------------------- ruban (longe, enrênements, mèche)

/**
 * Ruban dynamique (deux bandes croisées, visibles sous tous les angles) le long de N points, refait à chaque image
 * par setPoints(points[]) : la longe, les enrênements, la mèche de la chambrière.
 */
export function ribbon(color, width = 0.01, N = 14, roughness = 0.7) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 4 * 3), 3));
  const idx = [];
  for (let k = 0; k < 2; k++) {
    const b = k * N * 2;
    for (let i = 0; i < N - 1; i++) {
      const a0 = b + i * 2;
      idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
  }
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness, side: THREE.DoubleSide }));
  m.frustumCulled = false;
  m.castShadow = false;
  const pos = geo.attributes.position;
  m.userData.setPoints = (pts) => {
    for (let i = 0; i < N; i++) {
      const p = pts[Math.min(i, pts.length - 1)];
      pos.setXYZ(i * 2, p.x, p.y + width, p.z);
      pos.setXYZ(i * 2 + 1, p.x, p.y - width, p.z);
      pos.setXYZ((N + i) * 2, p.x + width, p.y, p.z);
      pos.setXYZ((N + i) * 2 + 1, p.x - width, p.y, p.z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  };
  m.userData.N = N;
  return m;
}

/** Points d'une corde détendue de a à b (courbe de Bézier, le milieu descend de sag). out : N vecteurs. */
export function sagPoints(a, b, sag, out) {
  const N = out.length;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2 - sag;
  const mz = (a.z + b.z) / 2;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const u = 1 - t;
    out[i].set(u * u * a.x + 2 * u * t * mx + t * t * b.x, u * u * a.y + 2 * u * t * my + t * t * b.y, u * u * a.z + 2 * u * t * mz + t * t * b.z);
  }
  return out;
}

// ---------------------------------------------------------------- la table des juges

/** Table des juges (nappe blanche, trois chaises), l'avant vers +Z (vers le cercle). */
export function judgesTable() {
  const g = new THREE.Group();
  const white = mat(0xf6f4ee, 0.8);
  const navy = mat(0x23395d, 0.7);
  const metal = mat(0x8c8f96, 0.4, { metalness: 0.6 });
  add(g, new RoundedBoxGeometry(2.4, 0.05, 0.8, 2, 0.02), white, [0, 0.75, 0]);
  add(g, new THREE.BoxGeometry(2.4, 0.6, 0.02), white, [0, 0.45, 0.39]);
  add(g, new THREE.BoxGeometry(2.4, 0.14, 0.022), navy, [0, 0.62, 0.395]);
  for (const x of [-1.1, 1.1]) for (const z of [-0.35, 0.35]) add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.75, 8), metal, [x, 0.375, z]);
  for (const x of [-0.75, 0, 0.75]) {
    add(g, new THREE.BoxGeometry(0.44, 0.05, 0.42), navy, [x, 0.46, -0.62]);
    add(g, new THREE.BoxGeometry(0.44, 0.5, 0.05), navy, [x, 0.72, -0.84]);
    for (const dx of [-0.19, 0.19]) for (const dz of [-0.8, -0.44]) add(g, new THREE.CylinderGeometry(0.018, 0.018, 0.46, 6), metal, [x + dx, 0.23, dz]);
    // feuilles de notes et stylo
    add(g, new THREE.BoxGeometry(0.21, 0.004, 0.29), mat(0xffffff, 0.9), [x, 0.778, -0.05], [0, 0.1, 0]);
  }
  return g;
}
