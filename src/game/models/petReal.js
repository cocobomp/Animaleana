// Outils communs aux petits animaux réalistes (chats, et plus tard lapins) : repris des chiens réalistes
// (dogReal.js, dogCoat.js), que d'autres équipes retouchent — copiés ici plutôt qu'importés.
//
// - restPrims : géométrie de repos d'un GLB animé (flottants, repère de l'animal), squelette et peau ramenés aux os
//   du squelette maître ;
// - weldGroups / weldedNormals : sommets confondus et normales lissées sans couture ;
// - furLow : grain du poil peint (sans les grandes taches de la robe d'origine), pour le shader de la robe ;
// - emptyBoneBoxes / growBoneBoxes / PetMesh : boîte englobante qui suit la pose (élimination hors champ juste) ;
// - contactShadow : ombre douce sous l'animal ; raiseAngle : relever un os au-dessus du sol ; fbm : bruit lisse.

import * as THREE from 'three';
import { gfx } from '../gfx.js';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const _v = V();
const _w = V();
const _m = new THREE.Matrix4();

/**
 * Géométrie de repos d'un GLB animé, dans le repère de l'animal (scène du GLB) : positions et normales en flottants
 * (les positions du fichier sont quantifiées, c'est le squelette qui les remet à l'échelle), peau ramenée aux os du
 * squelette maître (celui de la primitive 'coat'), UV, index ; os : noms, parents, têtes et rotations de repos.
 * roleOf(mesh) : rôle de la primitive ('coat', 'eye'…) ; isLod(mesh) : version réduite (index seul, voir lod.mjs).
 */
export function restPrims(gltf, roleOf, isLod) {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const toPet = scene.matrixWorld.clone().invert();
  const meshes = [];
  const lods = [];
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    (isLod(o) ? lods : meshes).push(o);
  });
  const master = meshes.find((m) => roleOf(m) === 'coat') ?? meshes[0];
  const bones = master.skeleton.bones;
  const names = bones.map((b) => b.name);
  const index = new Map(names.map((n, i) => [n, i]));
  const restW = bones.map((b) => new THREE.Matrix4().multiplyMatrices(toPet, b.matrixWorld));
  const heads = restW.map((m) => V().setFromMatrixPosition(m));
  const rotW = restW.map((m) => new THREE.Quaternion().setFromRotationMatrix(m));
  const parent = bones.map((b) => (b.parent?.isBone && index.has(b.parent.name) ? index.get(b.parent.name) : -1));
  const prims = {};
  const bm = new THREE.Matrix4();
  const acc = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  for (const mesh of meshes) {
    const role = roleOf(mesh);
    const g = mesh.geometry;
    const n = g.attributes.position.count;
    const pos = new Float32Array(n * 3);
    const nrm = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const uv = new Float32Array(n * 2);
    const sk = mesh.skeleton;
    const remap = sk.bones.map((b) => index.get(b.name) ?? 0);
    const sIdx = g.attributes.skinIndex;
    const sWgt = g.attributes.skinWeight;
    const toM = new THREE.Matrix4().multiplyMatrices(toPet, mesh.matrixWorld);
    for (let i = 0; i < n; i++) {
      acc.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      let tot = 0;
      for (let k = 0; k < 4; k++) {
        const w = sWgt.getComponent(i, k);
        const bi = sIdx.getComponent(i, k);
        si[i * 4 + k] = remap[bi];
        sw[i * 4 + k] = w;
        tot += w;
        if (w <= 0) continue;
        bm.multiplyMatrices(sk.bones[bi].matrixWorld, sk.boneInverses[bi]);
        for (let e = 0; e < 16; e++) acc.elements[e] += bm.elements[e] * w;
      }
      for (let k = 0; k < 4; k++) sw[i * 4 + k] /= tot || 1;
      _m.multiplyMatrices(toM, mesh.bindMatrixInverse).multiply(acc).multiply(mesh.bindMatrix);
      _v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(_m);
      pos.set([_v.x, _v.y, _v.z], i * 3);
      nm.getNormalMatrix(_m);
      _w.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm).normalize();
      nrm.set([_w.x, _w.y, _w.z], i * 3);
      if (g.attributes.uv) uv.set([g.attributes.uv.getX(i), g.attributes.uv.getY(i)], i * 2);
    }
    const p = { pos, nrm, si, sw, uv, index: Uint32Array.from(g.index.array), count: n, material: mesh.material, parts: [] };
    // (plusieurs primitives d'un même rôle — les deux yeux de Claire, vairons — : réunies en une seule)
    if (prims[role]) prims[role] = joinPrims(prims[role], p);
    else prims[role] = p;
  }
  for (const mesh of lods) {
    const p = prims[roleOf(mesh)];
    if (!p || !mesh.geometry.index) continue;
    // (version réduite : même attributs que la primitive d'origine ; plusieurs primitives d'un rôle : décalées)
    const n = mesh.geometry.attributes.position.count;
    const part = p.partOf?.get(n) ?? (p.count === n ? 0 : null);
    if (part === null) continue;
    const add = Uint32Array.from(mesh.geometry.index.array, (x) => x + part);
    p.lodIndex = p.lodIndex ? concatU32(p.lodIndex, add) : add;
  }
  return { names, index, parent, heads, rotW, restW, prims, toPet };
}

const concatU32 = (a, b) => {
  const o = new Uint32Array(a.length + b.length);
  o.set(a);
  o.set(b, a.length);
  return o;
};

function joinPrims(a, b) {
  const cat = (x, y) => {
    const o = new x.constructor(x.length + y.length);
    o.set(x);
    o.set(y, x.length);
    return o;
  };
  const partOf = a.partOf ?? new Map([[a.count, 0]]);
  partOf.set(b.count, a.count);
  return {
    pos: cat(a.pos, b.pos), nrm: cat(a.nrm, b.nrm), si: cat(a.si, b.si), sw: cat(a.sw, b.sw), uv: cat(a.uv, b.uv),
    index: concatU32(a.index, Uint32Array.from(b.index, (x) => x + a.count)), count: a.count + b.count,
    material: a.material, materials: [...(a.materials ?? [a.material]), b.material], partOf,
    // (part de chaque primitive d'origine : premier sommet de la seconde)
    split: a.count,
  };
}

/** Sommets confondus (au dixième de millimètre) : un numéro de groupe par sommet. */
export function weldGroups(pos, n) {
  const key = new Map();
  const grp = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
    let id = key.get(k);
    if (id === undefined) {
      id = key.size;
      key.set(k, id);
    }
    grp[i] = id;
  }
  return grp;
}

/** Normales lissées (somme des normales des faces, par groupe de sommets confondus : pas d'arête aux coutures). */
export function weldedNormals(pos, index, grp, n) {
  let G = 0;
  for (let i = 0; i < n; i++) G = Math.max(G, grp[i] + 1);
  const acc = new Float32Array(G * 3);
  const a = V();
  const b = V();
  const c = V();
  for (let t = 0; t < index.length; t += 3) {
    const i0 = index[t];
    const i1 = index[t + 1];
    const i2 = index[t + 2];
    a.fromArray(pos, i0 * 3);
    b.fromArray(pos, i1 * 3).sub(a);
    c.fromArray(pos, i2 * 3).sub(a);
    b.cross(c);
    for (const i of [i0, i1, i2]) {
      const g = grp[i] * 3;
      acc[g] += b.x;
      acc[g + 1] += b.y;
      acc[g + 2] += b.z;
    }
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const g = grp[i] * 3;
    a.set(acc[g], acc[g + 1], acc[g + 2]).normalize();
    out.set([a.x, a.y, a.z], i * 3);
  }
  return out;
}

/**
 * Grain du poil peint dans la texture, sans les taches de la robe d'origine (une fois par modèle, au chargement).
 * La luminance (log) est rapportée à la moyenne de sa « classe » (poil sombre ou clair : k-moyennes à une dimension,
 * les rayures du tigré disparaissent) ; ce qui reste de grandes variations est mesuré sur la surface même de
 * l'animal (valeur par sommet, lissée de proche en proche, sommets soudés par position) et retiré par le shader.
 * Renvoie { low, lo, hi } (none : pas d'image, en node).
 */
export function furLow(img, uv, rest, index, count, opts = {}) {
  const low = new Float32Array(count);
  if (!img || typeof document === 'undefined') return { low, lo: -3, hi: -1, none: true };
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  try {
    ctx.drawImage(img, 0, 0, S, S);
  } catch {
    return { low, lo: -3, hi: -1, none: true };
  }
  const px = ctx.getImageData(0, 0, S, S).data;
  const c = new THREE.Color();
  const ll = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = uv[i * 2];
    const v = uv[i * 2 + 1];
    const x = Math.min(S - 1, Math.max(0, Math.floor((u - Math.floor(u)) * S)));
    const y = Math.min(S - 1, Math.max(0, Math.floor((v - Math.floor(v)) * S))); // (flipY = false dans glTF)
    const o = (y * S + x) * 4;
    c.setRGB(px[o] / 255, px[o + 1] / 255, px[o + 2] / 255, THREE.SRGBColorSpace);
    ll[i] = Math.log(Math.max(1e-3, c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722));
  }
  const vals = Array.from(ll).sort((a, b) => a - b);
  let lo = vals[Math.floor(count * 0.2)];
  let hi = vals[Math.floor(count * 0.8)];
  for (let it = 0; it < 12; it++) {
    let s0 = 0;
    let n0 = 0;
    let s1 = 0;
    let n1 = 0;
    const mid = (lo + hi) / 2;
    for (const x of vals) {
      if (x < mid) {
        s0 += x;
        n0++;
      } else {
        s1 += x;
        n1++;
      }
    }
    if (n0) lo = s0 / n0;
    if (n1) hi = s1 / n1;
  }
  const grp = weldGroups(rest, count);
  let G = 0;
  for (let i = 0; i < count; i++) G = Math.max(G, grp[i] + 1);
  const val = new Float32Array(G);
  const cnt = new Float32Array(G);
  for (let i = 0; i < count; i++) {
    const w = smooth(lo + 0.15 * (hi - lo), lo + 0.85 * (hi - lo), ll[i]);
    val[grp[i]] += ll[i] - (lo + (hi - lo) * w);
    cnt[grp[i]]++;
  }
  for (let k = 0; k < G; k++) val[k] /= cnt[k] || 1;
  const tri = index.length / 3;
  const sum = new Float32Array(G);
  const deg = new Float32Array(G);
  for (let it = 0; it < (opts.iterations ?? 40); it++) {
    sum.fill(0);
    deg.fill(0);
    for (let t = 0; t < tri; t++) {
      for (let e = 0; e < 3; e++) {
        const a = grp[index[t * 3 + e]];
        const b = grp[index[t * 3 + ((e + 1) % 3)]];
        sum[a] += val[b];
        deg[a]++;
        sum[b] += val[a];
        deg[b]++;
      }
    }
    for (let k = 0; k < G; k++) if (deg[k]) val[k] = 0.5 * val[k] + 0.5 * (sum[k] / deg[k]);
  }
  for (let i = 0; i < count; i++) low[i] = val[grp[i]];
  return { low, lo, hi };
}

/** Bruit lisse simple (déterministe), valeurs de 0 à 1. */
export function fbm(x, y, z) {
  const h = (a, b, c) => {
    const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
}

export const emptyBoneBoxes = (nb) => {
  const b = new Float32Array(nb * 6);
  for (let k = 0; k < nb; k++) b.set([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], k * 6);
  return b;
};

/** Boîtes englobantes de repos par os (sommets que l'os porte). */
export function growBoneBoxes(box, pos, si, sw, count) {
  for (let i = 0; i < count; i++) {
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    for (let k = 0; k < 4; k++) {
      if (!(sw[i * 4 + k] > 0)) continue;
      const o = si[i * 4 + k] * 6;
      if (x < box[o]) box[o] = x;
      if (y < box[o + 1]) box[o + 1] = y;
      if (z < box[o + 2]) box[o + 2] = z;
      if (x > box[o + 3]) box[o + 3] = x;
      if (y > box[o + 4]) box[o + 4] = y;
      if (z > box[o + 5]) box[o + 5] = z;
    }
  }
  return box;
}

const _bm = new THREE.Matrix4();

/** Boîte englobante de l'animal d'après la pose (boîte de repos de chaque os emmenée par sa matrice de peau). */
function petBounds(hb, mesh) {
  const box = hb.box.makeEmpty();
  const bones = hb.skeleton.bones;
  const inv = hb.skeleton.boneInverses;
  const bb = hb.boneBox;
  const mn = box.min;
  const mx = box.max;
  for (let k = 0; k < bones.length; k++) {
    const o = k * 6;
    if (!(bb[o] <= bb[o + 3])) continue;
    const e = _bm.multiplyMatrices(mesh.bindMatrixInverse, bones[k].matrixWorld).multiply(inv[k]).elements;
    const cx = (bb[o] + bb[o + 3]) * 0.5;
    const cy = (bb[o + 1] + bb[o + 4]) * 0.5;
    const cz = (bb[o + 2] + bb[o + 5]) * 0.5;
    const ex = (bb[o + 3] - bb[o]) * 0.5;
    const ey = (bb[o + 4] - bb[o + 1]) * 0.5;
    const ez = (bb[o + 5] - bb[o + 2]) * 0.5;
    const X = e[0] * cx + e[4] * cy + e[8] * cz + e[12];
    const Y = e[1] * cx + e[5] * cy + e[9] * cz + e[13];
    const Z = e[2] * cx + e[6] * cy + e[10] * cz + e[14];
    const EX = Math.abs(e[0]) * ex + Math.abs(e[4]) * ey + Math.abs(e[8]) * ez;
    const EY = Math.abs(e[1]) * ex + Math.abs(e[5]) * ey + Math.abs(e[9]) * ez;
    const EZ = Math.abs(e[2]) * ex + Math.abs(e[6]) * ey + Math.abs(e[10]) * ez;
    if (X - EX < mn.x) mn.x = X - EX;
    if (Y - EY < mn.y) mn.y = Y - EY;
    if (Z - EZ < mn.z) mn.z = Z - EZ;
    if (X + EX > mx.x) mx.x = X + EX;
    if (Y + EY > mx.y) mx.y = Y + EY;
    if (Z + EZ > mx.z) mx.z = Z + EZ;
  }
  if (box.isEmpty()) box.set(V(-0.2, 0, -0.3), V(0.2, 0.4, 0.3));
  box.expandByScalar(hb.margin ?? 0.03);
  box.getBoundingSphere(hb.sphere);
  for (const m of hb.meshes) {
    m.boundingBox = box;
    m.boundingSphere = hb.sphere;
  }
}

/**
 * Maillage à os d'un animal réaliste : sa boîte englobante suit la pose (élimination hors champ juste, voir
 * horseReal.js HorseMesh) ; dessiné (ou son ombre) : noté pour l'animation (anim.seen).
 * hb : { box, sphere, boneBox, skeleton, meshes, anim, margin }.
 */
export class PetMesh extends THREE.SkinnedMesh {
  constructor(geometry, material, hb) {
    super(geometry, material);
    this.pet = hb;
  }

  updateMatrixWorld(force) {
    super.updateMatrixWorld(force);
    this.boundingBox = null;
    this.boundingSphere = null;
  }

  computeBoundingBox() {
    if (this.pet) petBounds(this.pet, this);
    else super.computeBoundingBox();
  }

  computeBoundingSphere() {
    if (this.pet) petBounds(this.pet, this);
    else super.computeBoundingSphere();
  }

  onBeforeRender() {
    if (this.pet?.anim) this.pet.anim.seen = true;
  }

  onBeforeShadow() {
    if (this.pet?.anim) this.pet.anim.seen = true;
  }
}

let contactTex = null;
/** Ombre de contact douce (enfant direct de la racine du modèle : les vignettes la cachent). */
export function contactShadow(R, L) {
  if (!contactTex && typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,0.75)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    contactTex = new THREE.CanvasTexture(c);
    contactTex.userData.shared = true;
  }
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: contactTex, transparent: true, depthWrite: false, opacity: gfx.quality === 'high' ? 0.5 : 0.65, toneMapped: false,
  }));
  m.scale.set(R * 3.0, 1, L * 1.45);
  m.position.y = 0.006;
  m.renderOrder = -1;
  m.userData.contactShadow = true;
  return m;
}

/**
 * Angle (autour de l'axe x de l'animal) dont tourner un os de tête c pour amener le point q à la hauteur y (repère de
 * l'animal) : le plus petit en valeur absolue, borné à max (voir dogReal.js).
 */
export function raiseAngle(c, q, y, max) {
  const dy = q.y - c.y;
  const dz = q.z - c.z;
  const R = Math.hypot(dy, dz);
  if (R < 1e-4) return 0;
  const phi = Math.atan2(dz, dy);
  const t = clamp((y - c.y) / R, -1, 1);
  const a = Math.acos(t);
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  const t1 = wrap(a - phi);
  const t2 = wrap(-a - phi);
  const th = Math.abs(t1) < Math.abs(t2) ? t1 : t2;
  return clamp(th, -max, max);
}

/**
 * Minimum glissant sur une durée (s) : la plus basse des valeurs reçues pendant la dernière foulée (allures des chats
 * et des lapins réalistes : hauteur des appuis d'une paire de pattes, point le plus bas de la course). Sans dérive :
 * les valeurs plus vieilles que la durée sont oubliées.
 */
export class WindowMin {
  constructor() {
    this.t = [];
    this.v = [];
    this.now = 0;
  }

  push(v, dt, span) {
    this.now += dt;
    this.t.push(this.now);
    this.v.push(v);
    while (this.t.length > 1 && this.t[0] < this.now - span) {
      this.t.shift();
      this.v.shift();
    }
    let m = Infinity;
    for (const x of this.v) if (x < m) m = x;
    return m;
  }

  reset() {
    this.t.length = 0;
    this.v.length = 0;
  }
}
