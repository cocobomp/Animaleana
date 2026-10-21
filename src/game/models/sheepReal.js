// Moutons réalistes : un modèle d'artiste pour les 7 races et les agneaux — « Sheep_White_01 » de la Microsoft Rocketbox
// Avatar Library (MIT, © 2020 Microsoft), préparé et animé pour le jeu (public/models/sheep.glb, tools/mouton/).
//
// Comme le chien réaliste (dogReal.js), le GLB n'est qu'une source : à son arrivée on en tire une fois pour toutes la
// géométrie de repos (flottants, repère du mouton), le squelette, les clips, la cible de forme « shorn » (toison) et
// les masques de la robe. Chaque gabarit (race et stade : agneau, jeune, adulte) a sa géométrie, partagée par les
// moutons qui l'ont : les membres sont allongés ou raccourcis par leurs os (la peau les suit, le corps monte ou
// descend d'autant : les sabots restent au sol). Chaque mouton a son squelette (tête et oreilles à la taille de sa
// race), sa matière (robe peinte par le shader de sheepCoat.js), ses cornes et son mixeur d'animations.
// La toison suit l'état du jeu à chaque image (sheepFleece : pleine, tondue, qui repousse), sans rien reconstruire.
//
// Interface : la même que le mouton procédural (animalModel.js), qui reste le modèle de repli tant que le GLB n'est
// pas là (et dans les tests sans GLB). Repère : regard vers +Z, y vers le haut, origine au sol sous le milieu du
// corps ; mouton « de taille 1 » (garrot 0,70 m) ; l'échelle de la race est appliquée par AnimalEntity (la taille en
// plus de certaines races, Ouessant, est dans model.size).

import * as THREE from 'three';
import { getModel } from '../assets.js';
import { gfx } from '../gfx.js';
import { horseView } from './horseReal.js';
import { sheepBuild, sheepFleece, shornWeight } from '../../sim/sheepLook.js';
import { makeSheepUniforms, setSheepCoat, sheepMaterial, hornMaterial } from './sheepCoat.js';

/** Clé du GLB (assets.js) : jamais « sheep » (gltfAnimal.js le prendrait pour un animal GLB générique). */
export const REAL_SHEEP_KEY = 'sheep_real';
/** Version réduite au-delà de cette distance à la caméra (m, divisée par la taille du mouton) ; hystérésis 10 %. */
export const SHEEP_LOD_DIST = { low: 7, high: 18 };
/** Mouton hors du champ : animé une image sur OFFSCREEN_STEP, avec le temps cumulé (comme le chien). */
export const OFFSCREEN_STEP = 3;
/** Au loin (version réduite), animé une image sur FAR_STEP. */
export const FAR_STEP = 2;
/** Vitesses « naturelles » des allures (m/s, mouton de taille 1) si le GLB ne les donne pas. */
export const NATURAL_SPEED = { walk: 0.77, trot: 2.12, run: 5.0 };

const MOVING = ['walk', 'trot', 'run'];
const ONCE = ['bleat', 'lie_down', 'get_up', 'jump'];
const LEG_KEYS = [['FL', 'L', true], ['FR', 'R', true], ['HL', 'L', false], ['HR', 'R', false]];
const LEG_BONES = { front: ['humerus', 'radius', 'metacarpus', 'toes'], hind: ['femur', 'tibia', 'metatarsus', 'htoes'] };
const TRUNK = new Set(['root', 'pelvis', 'spine1', 'spine2', 'chest']);

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const _v = V();
const _w = V();
const _u = V();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const AX = V(1, 0, 0);
const AY = V(0, 1, 0);
const AZ = V(0, 0, 1);

// ------------------------------------------------------------------ données de repos (une fois par GLB)

/** Luminance moyenne (linéaire) de la texture par région : laine, tête, pattes (grain du shader). */
const DEFAULT_MEANS = [0.42, 0.5, 0.16];

function textureMeans(map, uv, mask, n) {
  const img = map?.image;
  if (!img || typeof document === 'undefined' || !(img.width > 0)) return DEFAULT_MEANS;
  try {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, S, S);
    const px = ctx.getImageData(0, 0, S, S).data;
    if (!px || !px.length) return DEFAULT_MEANS;
    const lin = (x) => {
      const v = x / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const acc = [0, 0, 0];
    const cnt = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const u = uv[i * 2];
      const v = map.flipY ? 1 - uv[i * 2 + 1] : uv[i * 2 + 1];
      const x = clamp(Math.floor(u * S), 0, S - 1);
      const y = clamp(Math.floor(v * S), 0, S - 1);
      const o = (y * S + x) * 4;
      const l = 0.2126 * lin(px[o]) + 0.7152 * lin(px[o + 1]) + 0.0722 * lin(px[o + 2]);
      const w = mask[i * 4];
      const h = mask[i * 4 + 1];
      const g = mask[i * 4 + 2];
      const k = w > 0.7 ? 0 : h > 0.7 ? 1 : g > 0.7 ? 2 : -1;
      if (k < 0 || l < 0.02) continue;
      acc[k] += l;
      cnt[k]++;
    }
    return acc.map((a, k) => (cnt[k] > 4 ? a / cnt[k] : DEFAULT_MEANS[k]));
  } catch {
    return DEFAULT_MEANS;
  }
}

/** Clips du GLB, sans translation d'os hors de la racine ni échelle (un os qui se déplace s'étire). */
function cleanClips(animations) {
  const out = {};
  for (const clip of animations ?? []) {
    const tracks = clip.tracks.filter((t) => {
      const [node, prop] = t.name.split('.');
      if (prop === 'scale' || prop === 'morphTargetInfluences') return false;
      return prop !== 'position' || node === 'root';
    });
    out[clip.name] = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }
  return out;
}

/**
 * Géométrie, squelette, clips, toison et repères de repos tirés du GLB du mouton, dans le repère du mouton (flottants :
 * les positions du fichier sont quantifiées). Gardé dans gltf.userData.
 */
export function realSheepBase(gltf) {
  if (gltf.userData.sheepBase) return gltf.userData.sheepBase;
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const toSheep = scene.matrixWorld.clone().invert();
  let master = null;
  let lodMesh = null;
  let hornMesh = null;
  scene.traverse((o) => {
    if (o.isSkinnedMesh) {
      if (/lod/.test(o.name) || o.userData?.lod || /lod/.test(o.parent?.name ?? '')) lodMesh = o;
      else if (!master) master = o;
    } else if (o.isMesh && /horn/.test(`${o.name} ${o.material?.name ?? ''}`)) hornMesh = o;
  });
  if (!master) throw new Error('Mouton réaliste : maillage introuvable');
  const bones = master.skeleton.bones;
  const names = bones.map((b) => b.name);
  const index = new Map(names.map((nm, i) => [nm, i]));
  const nb = bones.length;
  const restW = bones.map((b) => new THREE.Matrix4().multiplyMatrices(toSheep, b.matrixWorld));
  const heads = restW.map((m) => V().setFromMatrixPosition(m));
  const rotW = restW.map((m) => new THREE.Quaternion().setFromRotationMatrix(_m.extractRotation(m)));
  const parent = bones.map((b) => (b.parent?.isBone && index.has(b.parent.name) ? index.get(b.parent.name) : -1));

  // Sommets : position, normale et forme tondue de repos (repère du mouton), peau, UV, masques de la robe.
  const g = master.geometry;
  const n = g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const dPos = new Float32Array(n * 3);
  const dNrm = new Float32Array(n * 3);
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const uv = new Float32Array(n * 2);
  const mask = new Float32Array(n * 4);
  const sk = master.skeleton;
  const sIdx = g.attributes.skinIndex;
  const sWgt = g.attributes.skinWeight;
  const mp = g.morphAttributes?.position?.[0] ?? null;
  const mn = g.morphAttributes?.normal?.[0] ?? null;
  const masks = ['_wool', '_head', '_leg', '_hoof'].map((k) => g.attributes[k] ?? null);
  const toM = new THREE.Matrix4().multiplyMatrices(toSheep, master.matrixWorld);
  const acc = new THREE.Matrix4();
  const bm = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const lin = new THREE.Matrix3();
  for (let i = 0; i < n; i++) {
    acc.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    let tot = 0;
    for (let k = 0; k < 4; k++) {
      const w = sWgt.getComponent(i, k);
      const bi = sIdx.getComponent(i, k);
      si[i * 4 + k] = bi;
      sw[i * 4 + k] = w;
      tot += w;
      if (w <= 0) continue;
      bm.multiplyMatrices(sk.bones[bi].matrixWorld, sk.boneInverses[bi]);
      for (let e = 0; e < 16; e++) acc.elements[e] += bm.elements[e] * w;
    }
    for (let k = 0; k < 4; k++) sw[i * 4 + k] /= tot || 1;
    _m.multiplyMatrices(toM, master.bindMatrixInverse).multiply(acc).multiply(master.bindMatrix);
    _v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(_m);
    pos.set([_v.x, _v.y, _v.z], i * 3);
    nm.getNormalMatrix(_m);
    _w.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm).normalize();
    nrm.set([_w.x, _w.y, _w.z], i * 3);
    if (mp) {
      lin.setFromMatrix4(_m);
      _u.fromBufferAttribute(mp, i).applyMatrix3(lin);
      dPos.set([_u.x, _u.y, _u.z], i * 3);
    }
    if (mn) {
      _u.fromBufferAttribute(mn, i).applyMatrix3(nm);
      dNrm.set([_u.x, _u.y, _u.z], i * 3);
    }
    if (g.attributes.uv) uv.set([g.attributes.uv.getX(i), g.attributes.uv.getY(i)], i * 2);
    for (let k = 0; k < 4; k++) mask[i * 4 + k] = masks[k] ? masks[k].getX(i) : k === 0 ? 1 : 0;
  }
  const idx = Uint32Array.from(g.index.array);
  const lodIndex = lodMesh && lodMesh.geometry.attributes.position.count === n && lodMesh.geometry.index ? Uint32Array.from(lodMesh.geometry.index.array) : null;
  // (textures partagées entre tous les moutons : jamais libérées par disposeModel)
  for (const key of ['map', 'normalMap']) if (master.material[key]) master.material[key].userData.shared = true;

  // Os : membres, tête, encolure, oreilles, queue.
  const B = (nmb) => index.get(nmb) ?? -1;
  const domBone = new Uint16Array(n);
  // Part de chaque sommet portée par le tronc (épaule à moitié) : la laine longue ne pend que de là.
  const trunkW = new Float32Array(names.length);
  for (const [nm, w] of [['root', 1], ['pelvis', 1], ['spine1', 1], ['spine2', 1], ['chest', 1], ['neck1', 1], ['tail1', 1], ['scapL', 0.6], ['scapR', 0.6]]) if (B(nm) >= 0) trunkW[B(nm)] = w;
  const trunk = new Float32Array(n);
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) trunk[i] += sw[i * 4 + k] * trunkW[si[i * 4 + k]];
  for (let i = 0; i < n; i++) {
    let best = 0;
    for (let k = 1; k < 4; k++) if (sw[i * 4 + k] > sw[i * 4 + best]) best = k;
    domBone[i] = si[i * 4 + best];
  }
  const legChains = LEG_KEYS.map(([, s, front]) => (front ? LEG_BONES.front : LEG_BONES.hind).map((b) => B(b + s)));
  const ext = scene.userData?.sheep ?? {};
  const natural = { ...NATURAL_SPEED, ...(ext.naturalSpeeds ?? {}) };

  // Cornes : maillage rigide enfant de l'os de la tête (géométrie partagée ; repère local gardé).
  let horns = null;
  if (hornMesh) {
    hornMesh.geometry.userData.shared = true;
    horns = {
      geometry: hornMesh.geometry,
      position: hornMesh.position.clone(),
      quaternion: hornMesh.quaternion.clone(),
      scale: hornMesh.scale.clone(),
      color: hornMesh.material?.color?.getHex?.() ?? 0xb9a786,
    };
  }

  const base = {
    names, index, parent, heads, rotW, nb,
    prim: { pos, nrm, dPos, dNrm, si, sw, uv, mask, trunk, index: idx, lodIndex, count: n, material: master.material, domBone },
    clips: cleanClips(gltf.animations),
    natural,
    legChains,
    horns,
    extras: ext,
    means: textureMeans(master.material.map, uv, mask, n),
    shapes: new Map(),
  };
  gltf.userData.sheepBase = base;
  return base;
}

// ------------------------------------------------------------------ gabarit (une fois par race et stade)

const emptyBoneBoxes = (nb) => {
  const b = new Float32Array(nb * 6);
  for (let k = 0; k < nb; k++) b.set([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], k * 6);
  return b;
};

function growBoneBoxes(box, pos, si, sw, count) {
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

/**
 * Articulations d'un gabarit : membres allongés (legs) sous le coude et le grasset — avant-bras, canon et pied, jambe,
 * canon et pied — et tout le reste du corps monté d'autant (les sabots restent au sol ; les postérieurs sont allongés
 * pour que le dos reste horizontal). Renvoie { heads, D (déplacement de chaque os), rise }.
 */
export function sheepJoints(base, legs) {
  const H = base.heads;
  const nb = base.nb;
  const D = Array.from({ length: nb }, () => V());
  const chains = base.legChains;
  const [fr] = chains;
  const k = legs;
  const span = (c) => H[c[1]].y - H[c[3]].y; // (de l'articulation du coude / du grasset au pied)
  const rise = (k - 1) * span(fr);
  const kOf = (c) => 1 + rise / Math.max(0.05, span(c));
  for (let i = 0; i < nb; i++) D[i].set(0, rise, 0);
  for (const c of chains) {
    const kc = kOf(c);
    // (c[0] : bras ou cuisse, dans le tronc, inchangé ; c[1] avant-bras ou jambe ; c[2] canon ; c[3] pied)
    for (let j = 2; j < 4; j++) {
      const d = _v.copy(H[c[j]]).sub(H[c[j - 1]]).multiplyScalar(kc - 1);
      D[c[j]].copy(D[c[j - 1]]).add(d);
    }
  }
  // les os sous un pied (aucun) et les enfants suivent leur parent : déjà couverts par la chaîne
  const heads = H.map((h, i) => h.clone().add(D[i]));
  return { heads, D, rise };
}

/** Géométries (partagées) d'un gabarit, ses articulations et ses mesures. users : nombre de moutons qui l'utilisent. */
function shapeFor(base, B) {
  const key = `legs:${B.legs.toFixed(3)}`;
  let S = base.shapes.get(key);
  if (S) return S;
  const P = base.prim;
  const n = P.count;
  const J = sheepJoints(base, B.legs);
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let x = P.pos[i * 3];
    let y = P.pos[i * 3 + 1];
    let z = P.pos[i * 3 + 2];
    for (let k = 0; k < 4; k++) {
      const w = P.sw[i * 4 + k];
      if (!(w > 0)) continue;
      const d = J.D[P.si[i * 4 + k]];
      x += d.x * w;
      y += d.y * w;
      z += d.z * w;
    }
    pos.set([x, y, z], i * 3);
  }
  const attrs = {
    position: new THREE.BufferAttribute(pos, 3),
    normal: new THREE.BufferAttribute(P.nrm, 3),
    uv: new THREE.BufferAttribute(P.uv, 2),
    skinIndex: new THREE.BufferAttribute(P.si, 4),
    skinWeight: new THREE.BufferAttribute(P.sw, 4),
    sheepMask: new THREE.BufferAttribute(P.mask, 4),
    sheepTrunk: new THREE.BufferAttribute(P.trunk, 1),
  };
  const morphP = new THREE.BufferAttribute(P.dPos, 3);
  const morphN = new THREE.BufferAttribute(P.dNrm, 3);
  const make = (index) => {
    const geo = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(attrs)) geo.setAttribute(k, a);
    geo.morphAttributes.position = [morphP];
    geo.morphAttributes.normal = [morphN];
    geo.morphTargetsRelative = true;
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.userData.shared = true;
    return geo;
  };
  const geo = make(P.index);
  const lodGeo = P.lodIndex ? make(P.lodIndex) : null;
  // (boîtes de repos par os, toison épaisse comprise : élimination hors champ)
  const boxPos = new Float32Array(pos);
  for (let i = 0; i < n * 3; i++) boxPos[i] -= P.dPos[i] * 0.7;
  const boneBox = growBoneBoxes(growBoneBoxes(emptyBoneBoxes(base.nb), pos, P.si, P.sw, n), boxPos, P.si, P.sw, n);
  S = { key, heads: J.heads, D: J.D, rise: J.rise, pos, geo, lodGeo, boneBox, measure: measureSheep(base, pos, J.heads) };
  base.shapes.set(key, S);
  return S;
}

/**
 * Repères d'un gabarit au repos (repère du mouton) : dessus du dos, ventre, hanches et épaules, demi-largeur, tête
 * (dessus, bout du nez, yeux), soles des sabots, anneau de l'encolure (collier, nœud du concours), bout de la queue.
 */
function measureSheep(base, pos, H) {
  const P = base.prim;
  const n = P.count;
  const idx = base.index;
  const bi = (nm) => idx.get(nm) ?? -1;
  const dom = P.domBone;
  const name = (i) => base.names[dom[i]];
  const hipZ = (H[bi('femurL')].z + H[bi('femurR')].z) / 2;
  const shZ = (H[bi('humerusL')].z + H[bi('humerusR')].z) / 2;
  let topY = 0;
  let bellyY = Infinity;
  let halfW = 0;
  let headY = 0;
  let noseZ = -Infinity;
  const nose = V();
  const skull = V(0, -Infinity, 0);
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    const nmb = name(i);
    const head = P.mask[i * 4 + 1] > 0.5;
    if (TRUNK.has(nmb) && !head) {
      if (z > hipZ - 0.05 && z < shZ + 0.05) {
        if (Math.abs(x) < 0.06 && y > topY) topY = y;
        if (y < bellyY && Math.abs(x) < 0.12) bellyY = y;
      }
      halfW = Math.max(halfW, Math.abs(x));
    }
    if (head) {
      if (y > headY) headY = y;
      if (z > noseZ) {
        noseZ = z;
        nose.set(x, y, z);
      }
    }
  }
  // dessus du crâne : entre les oreilles
  const headB = bi('head');
  const hh = H[headB];
  for (let i = 0; i < n; i++) {
    if (P.mask[i * 4 + 1] < 0.5 || /^ear/.test(name(i))) continue;
    const z = pos[i * 3 + 2];
    if (Math.abs(z - (hh.z + 0.02)) > 0.05) continue;
    if (pos[i * 3 + 1] > skull.y) skull.set(0, pos[i * 3 + 1], z);
  }
  if (!Number.isFinite(skull.y)) skull.set(0, headY, hh.z);
  // yeux : les sommets portés par l'os « eyes » (sinon à mi-chemin entre la tête et le nez)
  const eye = V(0, (skull.y + nose.y) / 2 + 0.01, hh.z + (nose.z - hh.z) * 0.38);
  const eyesB = bi('eyes');
  if (eyesB >= 0) {
    let n0 = 0;
    const acc = V();
    for (let i = 0; i < n; i++) {
      if (dom[i] !== eyesB) continue;
      acc.add(_v.set(0, pos[i * 3 + 1], pos[i * 3 + 2]));
      n0++;
    }
    if (n0 > 3) eye.copy(acc.multiplyScalar(1 / n0));
  }
  // soles : sommets des onglons de chaque membre, les plus bas, et le bout des onglons (le plus en avant)
  const soles = base.legChains.map((c) => {
    const foot = c[3];
    const list = [];
    let lo = Infinity;
    for (let i = 0; i < n; i++) {
      if (dom[i] !== foot && dom[i] !== c[2]) continue;
      if (P.mask[i * 4 + 3] < 0.4 && pos[i * 3 + 1] > H[foot].y) continue;
      list.push(i);
      lo = Math.min(lo, pos[i * 3 + 1]);
    }
    const low = list.filter((i) => pos[i * 3 + 1] < lo + 0.015);
    let toe = low[0];
    for (const i of low) if (pos[i * 3 + 2] > pos[toe * 3 + 2]) toe = i;
    const pick = low.filter((_, j) => j % Math.max(1, Math.floor(low.length / 8)) === 0).slice(0, 8);
    if (toe !== undefined && !pick.includes(toe)) pick.push(toe);
    return { list: pick, toe };
  });
  // anneau de l'encolure : à mi-chemin de la base de l'encolure et de la tête, perpendiculaire à l'encolure
  const n2 = H[bi('neck2')];
  const axis = _u.copy(hh).sub(H[bi('neck1')]).normalize().clone();
  const c0 = n2.clone().lerp(hh, 0.25);
  const ring = [];
  for (let i = 0; i < n; i++) {
    const nmb = name(i);
    if (nmb !== 'neck1' && nmb !== 'neck2' && nmb !== 'head') continue;
    const p = _v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    const d = _w.copy(p).sub(c0).dot(axis);
    if (Math.abs(d) < 0.03) ring.push(p.clone().addScaledVector(axis, -d));
  }
  const center = ring.length ? ring.reduce((a, p) => a.add(p), V()).multiplyScalar(1 / ring.length) : c0.clone();
  // (repère de l'anneau : z le long de l'encolure, x vers la gauche, y vers le dessus)
  const rz = axis.clone();
  const rx = V(1, 0, 0).addScaledVector(rz, -rz.x).normalize();
  const ry = rz.clone().cross(rx);
  let ex = 0.04;
  let ey = 0.04;
  for (const p of ring) {
    const d = _v.copy(p).sub(center);
    ex = Math.max(ex, Math.abs(d.dot(rx)));
    ey = Math.max(ey, Math.abs(d.dot(ry)));
  }
  const tailB = bi('tail1');
  let tailTip = H[tailB]?.clone() ?? V(0, topY, hipZ - 0.2);
  for (let i = 0; i < n; i++) if (dom[i] === tailB && pos[i * 3 + 2] < tailTip.z) tailTip = V(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  return {
    topY, bellyY, hipZ, shZ, halfW, headY, nose, noseZ, skull, eye, soles,
    collar: { center, axis: rz, rx: ex, ry: ey, basis: new THREE.Matrix4().makeBasis(rx, ry, rz) },
    tailTip,
    kneeY: [H[bi('metacarpusL')].y, H[bi('metatarsusL')].y, H[bi('toesL')].y],
  };
}

// ------------------------------------------------------------------ construction

let contactTex = null;
function contactShadow(R, L) {
  if (!contactTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const gr = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)');
    gr.addColorStop(0.5, 'rgba(0,0,0,0.4)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
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
  m.position.y = 0.012;
  m.renderOrder = -1;
  return m;
}

/** Le GLB du mouton est-il chargé ? */
export const realSheepReady = () => !!getModel(REAL_SHEEP_KEY);

/**
 * Construit le mouton réaliste (ou null si son GLB n'est pas chargé : on prend alors le mouton procédural).
 * look : la robe de l'animal (look.lamb : agneau, look.young : jeune, look.sex : 'm' pour les cornes des béliers,
 * look.fleece : toison figée 0-1 pour une vignette) ; breedId : sa race (anciennes sauvegardes) ; gltf : le GLB
 * (tests).
 */
export function buildRealSheepModel(look, breedId = null, gltf = null) {
  const src = gltf ?? getModel(REAL_SHEEP_KEY);
  if (!src) return null;
  const base = realSheepBase(src);
  const stage = look.lamb ? 'baby' : look.young ? 'young' : 'adult';
  const B = sheepBuild(look, { breed: breedId, stage, sex: look.sex ?? 'f' });
  const S = shapeFor(base, B);
  const H = S.heads;
  const names = base.names;
  const nb = names.length;
  const M = S.measure;

  // Squelette : mêmes noms que le GLB (les clips s'y lient), articulations du gabarit, rotations de repos du modèle.
  const root = new THREE.Group();
  const bones = [];
  for (let i = 0; i < nb; i++) {
    const b = new THREE.Bone();
    b.name = names[i];
    bones.push(b);
  }
  for (let i = 0; i < nb; i++) {
    const b = bones[i];
    const pi = base.parent[i];
    if (pi < 0) {
      b.position.copy(H[i]);
      b.quaternion.copy(base.rotW[i]);
      root.add(b);
    } else {
      const pq = base.rotW[pi].clone().invert();
      b.position.copy(H[i]).sub(H[pi]).applyQuaternion(pq);
      b.quaternion.copy(pq).multiply(base.rotW[i]);
      bones[pi].add(b);
    }
  }
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  skeleton.calculateInverses();
  const bone = (nm) => bones[base.index.get(nm)] ?? null;
  // Tête et oreilles de la race (échelle des os : les clips n'animent pas d'échelle).
  const headB = bone('head');
  headB.scale.setScalar(B.head);
  for (const e of [bone('earL'), bone('earR')]) if (e) e.scale.setScalar(B.ears);
  for (const b of bones) {
    b.userData.restP = b.position.clone();
    b.userData.restQ = b.quaternion.clone();
  }
  root.updateMatrixWorld(true);

  // Matière : la toison du GLB recolorée (uniformes propres à ce mouton).
  const uniforms = makeSheepUniforms();
  setSheepCoat(uniforms, B);
  uniforms.sMeans.value.set(...base.means);
  uniforms.sLand.value.set(M.bellyY, M.topY, M.hipZ, M.shZ);
  uniforms.sKnee.value.set(M.kneeY[0], M.kneeY[1], M.kneeY[2], (M.hipZ + M.shZ) / 2);
  uniforms.sHead.value.set(M.eye.z, M.eye.y, M.noseZ, M.skull.y);
  const { mat, depth } = sheepMaterial(base.prim.material, uniforms);
  const hb = { box: new THREE.Box3(), sphere: new THREE.Sphere(), boneBox: S.boneBox, skeleton, meshes: [], anim: null };
  const mesh = new SheepMesh(S.geo, mat, hb);
  mesh.customDepthMaterial = depth;
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.morphTargetInfluences = [0];
  root.add(mesh);
  hb.meshes.push(mesh);
  // Cornes (béliers, races cornues) : à la taille de la race, rigides sur la tête.
  let horns = null;
  if (base.horns && B.hornSize > 0) {
    horns = new THREE.Mesh(base.horns.geometry, hornMaterial(B.colors.horn));
    horns.position.copy(base.horns.position);
    horns.quaternion.copy(base.horns.quaternion);
    // (mises à l'échelle autour de leur base, sur le crâne)
    // (base de la corne gauche, notée par Blender : x, y vers l'arrière, z en haut ; au milieu des deux cornes)
    const hs = base.extras?.horns?.base;
    horns.scale.copy(base.horns.scale).multiplyScalar(B.hornSize);
    if (hs) {
      const b0 = V(0, hs[2] + S.rise, -hs[1]).applyMatrix4(skeleton.boneInverses[base.index.get('head')]);
      const off = b0.clone().multiplyScalar(1 - B.hornSize);
      horns.position.multiplyScalar(B.hornSize).add(off);
    }
    horns.castShadow = true;
    horns.receiveShadow = true;
    headB.add(horns);
  }
  const L = (M.shZ - M.hipZ) + 0.45;
  const shadow = contactShadow(M.halfW + 0.05, L * 0.9);
  root.add(shadow);
  const size = B.size;
  root.scale.setScalar(size);
  root.updateMatrixWorld(true);

  const legs = LEG_KEYS.map(([, s, front], l) => {
    const n4 = front ? LEG_BONES.front : LEG_BONES.hind;
    return {
      top: bone(front ? `scap${s}` : `femur${s}`), pivot: bone(n4[0] + s), knee: bone(n4[1] + s), fetlock: bone(n4[2] + s), paw: bone(n4[3] + s),
      front, side: s === 'L' ? 1 : -1, soles: M.soles[l],
    };
  });
  const neckB = bone('neck2');
  const tailB = bone('tail1');
  const ears = [bone('earL'), bone('earR')].filter(Boolean);
  ears.forEach((e, i) => {
    e.userData.side = i === 0 ? 1 : -1;
    e.userData.rest = e.rotation.clone();
  });
  // Repères dans le repère des os (au repos) : bouche, dessus du crâne, anneau de l'encolure, bout de la queue. (Par
  // l'inverse de liaison de l'os, comme la peau : un repère de la tête suit la tête agrandie de la race ou de l'agneau.)
  const toLocal = (b, p) => p.clone().applyMatrix4(skeleton.boneInverses[bones.indexOf(b)]);
  const mouth = toLocal(headB, M.nose.clone().add(V(0, -0.03, -0.015)));
  const skull = toLocal(headB, M.skull);
  const collarC = toLocal(neckB, M.collar.center);
  const neckQi = neckB.getWorldQuaternion(new THREE.Quaternion()).invert();
  const ringQ = neckQi.clone().multiply(new THREE.Quaternion().setFromRotationMatrix(M.collar.basis));
  const headQ = headB.getWorldQuaternion(new THREE.Quaternion()).invert();
  const leashPoint = new THREE.Object3D();
  leashPoint.name = 'leashPoint';
  neckB.add(leashPoint);
  leashPoint.position.copy(toLocal(neckB, M.collar.center.clone().addScaledVector(V(0, 1, 0), M.collar.ry + 0.01)));
  const tailTip = new THREE.Object3D();
  tailB?.add(tailTip);
  if (tailB) tailTip.position.copy(toLocal(tailB, M.tailTip));
  const model = {
    root,
    body: bone('root'),
    neck: neckB,
    head: headB,
    tail: tailB ?? bone('pelvis'),
    tailTip,
    ears,
    legs,
    skeleton,
    bones,
    bone,
    mesh,
    coatMesh: mesh,
    horns,
    uniforms,
    build: B,
    size,
    // (interface du modèle procédural : hauteurs en unités « taille 1 » — taille de la race comprise)
    y0: ((M.topY + M.bellyY) / 2) * size,
    legTop: M.bellyY * size,
    saddleY: M.topY * size,
    headHeight: M.headY * size,
    headTilt: 0,
    snoutTip: [0, 0, 0],
    mouth,
    skull,
    leashPoint,
    // (même nom que le chien réaliste : salon.js et Beauty.js y posent nœud, clochette et bandana)
    // (dans le repère des os : leur échelle — taille de la race, tête agrandie — s'applique d'elle-même)
    dogFit: { collar: { center: collarC, normal: M.collar.axis.clone().applyQuaternion(neckQi), q: ringQ, rx: M.collar.rx, ry: M.collar.ry, bone: neckB }, topY: M.topY, bellyY: M.bellyY, hipZ: M.hipZ, shZ: M.shZ },
    accessoryFit: { skull, headQ, mouth, headR: 0.075, tailTip },
    lamb: B.stage === 'baby',
    stage: B.stage,
    realSheep: true,
  };
  model.anim = new RealSheepAnim(model, base, S);
  hb.anim = model.anim;
  model.bounds = hb;
  model.lodLevel = 0;
  model.setLod = (level) => {
    const l = S.lodGeo && level ? 1 : 0;
    if (l === model.lodLevel) return;
    model.lodLevel = l;
    mesh.geometry = l ? S.lodGeo : S.geo;
    if (horns) horns.visible = !l || B.hornSize > 0.7;
  };
  model.staticPose = (kind = 'stand') => model.anim.staticPose(kind);
  model.photoPose = () => model.anim.staticPose('stand');
  // Toison : figée (vignette, look.fleece), sinon celle de l'animal à chaque image (animateRealSheep).
  model.fleece = Number.isFinite(look.fleece) ? look.fleece : 1;
  model.setFleece = (f, now = true) => {
    model.fleece = clamp(f, 0, 1);
    if (now) model.anim.applyFleece(1e9);
  };
  // Coupe du salon de toilettage (Groomer.refreshCutVisuals) : « tonte » égalise et raccourcit la toison, « concours »
  // et « long » la gonflent un peu. null : la toison de l'animal.
  model.setCut = (style) => {
    model.cut = style ?? null;
    model.anim.cutK = style === 'tonte' || style === 'court' ? 0.55 : 0;
    model.anim.cutExtra = style === 'concours' || style === 'long' ? 0.15 : 0;
  };
  model.setCut(null);
  // Laine gonflée (concours de beauté : « fluff » frais).
  model.setFluff = (on) => {
    model.anim.fluffExtra = on ? 0.2 : 0;
  };
  let disposed = false;
  model.dispose = () => {
    if (disposed) return;
    disposed = true;
    model.anim.dispose();
    shadow.geometry.dispose();
    shadow.material.dispose();
  };
  model.anim.applyFleece(1e9);
  model.anim.staticPose('stand');
  return model;
}

// ------------------------------------------------------------------ élimination hors champ

const _bm = new THREE.Matrix4();
const WOOL_MARGIN = 0.08;

/** Boîte englobante du mouton d'après la pose (boîte de repos de chaque os emmenée par sa matrice de peau). */
function sheepBounds(hb, mesh) {
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
  if (box.isEmpty()) box.set(V(-0.5, 0, -0.7), V(0.5, 1, 0.7));
  box.expandByScalar(WOOL_MARGIN);
  box.getBoundingSphere(hb.sphere);
  for (const m of hb.meshes) {
    m.boundingBox = box;
    m.boundingSphere = hb.sphere;
  }
}

/** Maillage du mouton : boîte qui suit la pose (voir dogReal.js DogMesh) ; dessiné : noté pour l'animation. */
class SheepMesh extends THREE.SkinnedMesh {
  constructor(geometry, material, hb) {
    super(geometry, material);
    this.sheep = hb;
  }

  updateMatrixWorld(force) {
    super.updateMatrixWorld(force);
    this.boundingBox = null;
    this.boundingSphere = null;
  }

  computeBoundingBox() {
    if (this.sheep) sheepBounds(this.sheep, this);
    else super.computeBoundingBox();
  }

  computeBoundingSphere() {
    if (this.sheep) sheepBounds(this.sheep, this);
    else super.computeBoundingSphere();
  }

  onBeforeRender() {
    if (this.sheep?.anim) this.sheep.anim.seen = true;
  }

  onBeforeShadow() {
    if (this.sheep?.anim) this.sheep.anim.seen = true;
  }
}

// ------------------------------------------------------------------ animation

/**
 * Allure d'après la vitesse (m/s, ramenée à la taille et aux membres du modèle d'origine), avec hystérésis.
 * prev : allure de l'image précédente ('idle', 'walk', 'trot', 'run').
 */
const GAIT_UP = { walk: 1.55, trot: 3.4 };
const GAIT_DOWN = { trot: 1.3, run: 3.0 };
export function pickSheepGait(prev, u) {
  if (!(u >= 0.05)) return 'idle';
  let g = prev === 'idle' || !prev ? 'walk' : prev;
  for (let k = 0; k < 3; k++) {
    if (g === 'walk' && u > GAIT_UP.walk) g = 'trot';
    else if (g === 'trot' && u > GAIT_UP.trot) g = 'run';
    else if (g === 'run' && u < GAIT_DOWN.run) g = 'trot';
    else if (g === 'trot' && u < GAIT_DOWN.trot) g = 'walk';
  }
  return g;
}

const lying = (p) => p === 'lie' || p === 'sleep';

/** Hauteur y (repère racine) d'un point de peau suivi par ses os (voir contactPoints) ; aussi rangé dans _w. */
function skinPoint(pt, s, inv) {
  _w.set(0, 0, 0);
  for (const [b, pr, ptip, w] of pt) _w.addScaledVector(_v.lerpVectors(pr, ptip, s).applyMatrix4(b.matrixWorld), w);
  return _w.applyMatrix4(inv).y;
}

/**
 * Mixeur d'un mouton : allures fondues selon la vitesse (chaque clip joué à vitesse réelle ÷ vitesse naturelle de son
 * gabarit : les sabots posés ne glissent pas, tenus sur place par footLock), postures (debout, couché, endormi) et leurs
 * transitions de ruminant (se coucher à genoux devant, se relever l'arrière-train d'abord), gestes (brouter, manger,
 * bêler, ruminer couché, gambader pour l'agneau) ; par-dessus : regard, oreilles, queue, tétée de l'agneau ; toison
 * (cible de forme) ; sabots jamais sous le sol, ventre posé au sol couché, museau au-dessus de l'herbe.
 */
class RealSheepAnim {
  constructor(model, base, S) {
    this.model = model;
    this.base = base;
    this.S = S;
    const B = model.build;
    this.bones = model.bones;
    this.rootBone = model.body;
    // Le mixeur note la position de la racine au premier clip qui l'anime : ce doit être celle du modèle d'origine
    // (le gabarit monte le corps de S.rise, ajouté après chaque mise à jour, voir applyShift).
    this.rootBone.position.y -= S.rise;
    this.mixer = new THREE.AnimationMixer(model.root);
    this.actions = {};
    this.w = {};
    this.names = [];
    this.list = [];
    for (const [name, clip] of Object.entries(base.clips)) {
      const a = this.mixer.clipAction(clip);
      if (ONCE.includes(name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      a.play();
      a.setEffectiveWeight(name === 'idle' ? 1 : 0);
      this.actions[name] = a;
      this.w[name] = name === 'idle' ? 1 : 0;
      this.names.push(name);
      this.list.push(a);
    }
    this.rootBone.position.y += S.rise;
    // Vitesse naturelle de chaque allure : celle du modèle, au prorata des membres (mesurée ensuite, measureNatural).
    const k = 0.35 + 0.65 * B.legs;
    this.natural = Object.fromEntries(MOVING.map((g) => [g, (base.natural[g] ?? NATURAL_SPEED[g]) * k]));
    this.speedScale = k;
    this.gait = 'idle';
    this.posture = 'stand';
    this.trans = null;
    this.hold = 10;
    this.target = {};
    for (const nm of this.names) this.target[nm] = 0;
    this.pose = this.bones.map((b) => [b.position.clone(), b.quaternion.clone()]);
    this.t = (model.root.id * 7.31) % 100;
    this.seen = false;
    this.seenNow = false;
    this.frame = -1;
    this.skipDt = 0;
    this.skipN = 0;
    this.look = new THREE.Vector2();
    this.lead = 'walk';
    this.trick = null;
    this.bleatOn = false;
    this.shorn = 0;
    this.cutK = 0;
    this.cutExtra = 0;
    this.fluffExtra = 0;
    this.nurse = 0;
    this.wag = 0;
    this.jaw = model.bone('jaw');
    // Rotation de repos (repère du mouton) du parent de chaque os : pour tourner un os autour d'un axe du mouton.
    this.pinv = new Map(this.bones.map((b, i) => [b, base.parent[i] >= 0 ? base.rotW[base.parent[i]].clone().invert() : new THREE.Quaternion()]));
    // Soles et bout des onglons dans le repère du pied (au repos, sur le squelette du gabarit).
    // (par l'inverse de liaison du pied, comme la peau)
    const local = (b, i) => V().fromArray(S.pos, i * 3).applyMatrix4(model.skeleton.boneInverses[this.bones.indexOf(b)]);
    this.solePts = model.legs.map((l) => l.soles.list.map((i) => local(l.paw, i)));
    this.toePts = model.legs.map((l) => (l.soles.toe !== undefined ? local(l.paw, l.soles.toe) : V()));
    this.bodyPts = [];
    this.headPts = [];
    this.gOff = 0;
    this.plant = [null, null, null, null];
    this.lockAng = [0, 0, 0, 0];
    this.lockSide = [0, 0, 0, 0];
    this.relTop = [0, 0, 0, 0];
    // (laine longue : la toison du ventre pend plus bas — le mouton couché est relevé d'autant)
    this.skirt = (B.long ?? 0) * 0.3;
    this.rootBone.position.y -= S.rise;
    this.savePose();
    this.rootBone.position.y += S.rise;
    this.contactPoints();
    this.measureNatural();
  }

  /** Décalage du gabarit ajouté à la racine après le mixeur (corps monté de S.rise : sabots au sol). */
  applyShift() {
    this.rootBone.position.y += this.S.rise;
  }

  restorePose() {
    const bs = this.bones;
    for (let i = 0; i < bs.length; i++) {
      bs[i].position.copy(this.pose[i][0]);
      bs[i].quaternion.copy(this.pose[i][1]);
    }
  }

  savePose() {
    const bs = this.bones;
    for (let i = 0; i < bs.length; i++) {
      this.pose[i][0].copy(bs[i].position);
      this.pose[i][1].copy(bs[i].quaternion);
    }
  }

  /** Tourne un os de ang autour d'un axe du mouton (axe vu par son parent au repos ; il suit le parent animé). */
  turn(b, axis, ang) {
    if (!b || !ang) return;
    _u.copy(axis).applyQuaternion(this.pinv.get(b));
    b.quaternion.premultiply(_q.setFromAxisAngle(_u, ang));
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model.root);
  }

  /** Pose d'un clip tenu à une fraction t de sa durée, sans temps qui passe (mesures, poses figées). */
  clipPose(clip, t = 0) {
    for (const nm of this.names) {
      this.w[nm] = nm === clip ? 1 : 0;
      this.actions[nm].setEffectiveWeight(this.w[nm]);
      this.actions[nm].time = nm === clip ? t * this.actions[nm].getClip().duration : 0;
    }
    this.restorePose();
    this.mixer.update(0);
    this.savePose();
    this.applyShift();
  }

  /**
   * Vitesse naturelle de chaque allure pour ce gabarit, mesurée sur son squelette : vitesse à laquelle les onglons en
   * appui reculent sous le corps quand le clip est joué à sa vitesse (moyenne des antérieurs et des postérieurs).
   */
  measureNatural() {
    const S = this.S;
    if (!S.natural) {
      const md = this.model;
      const nat = {};
      const N = 36;
      for (const g of MOVING) {
        const a = this.actions[g];
        if (!a) continue;
        const T = a.getClip().duration;
        const tracks = md.legs.map(() => []);
        for (let k = 0; k <= N; k++) {
          this.clipPose(g, k / N);
          md.root.updateMatrixWorld(true);
          md.legs.forEach((l, j) => tracks[j].push(this.toePts[j].clone().applyMatrix4(l.paw.matrixWorld)));
        }
        const s = md.size;
        const speed = tracks.map((tr) => {
          const ymin = Math.min(...tr.map((p) => p.y));
          let d = 0;
          let n = 0;
          for (let k = 1; k <= N; k++) {
            if (tr[k].y < ymin + 0.004 * s && tr[k - 1].y < ymin + 0.004 * s) {
              d += tr[k - 1].z - tr[k].z;
              n++;
            }
          }
          return n ? d / s / ((n * T) / N) : null;
        });
        const ok = (x) => x !== null && x > 0.05;
        const fr = [speed[0], speed[1]].filter(ok);
        const hi = [speed[2], speed[3]].filter(ok);
        if (!fr.length || !hi.length) continue;
        const avg = (xs) => xs.reduce((q, x) => q + x, 0) / xs.length;
        nat[g] = (avg(fr) + avg(hi)) / 2;
      }
      S.natural = nat;
      this.staticPose('stand');
    }
    for (const g of MOVING) if (S.natural[g] > 0.1) this.natural[g] = S.natural[g];
  }

  /**
   * Points de la peau qui touchent le sol à l'arrêt : le ventre et le poitrail couché ou endormi, le museau qui broute
   * ou dort le menton posé. Pour chaque pose, les sommets les plus bas du corps et de la tête ; calculés une fois par
   * gabarit (géométrie partagée). Chaque point suit ses os avec leurs poids, toison comprise (cible de forme).
   */
  contactPoints() {
    const S = this.S;
    const base = this.base;
    const md = this.model;
    const P = base.prim;
    const n = P.count;
    const names = base.names;
    if (!S.contact) {
      const cls = new Int8Array(n); // 0 corps, 1 tête (oreilles comprises : elles pendent en broutant), -1 ignoré (membres)
      for (let i = 0; i < n; i++) {
        const nm = names[P.domBone[i]];
        const head = P.mask[i * 4 + 1] > 0.5;
        cls[i] = head || nm === 'head' || nm === 'jaw' || /^ear/.test(nm) ? 1 : TRUNK.has(nm) || /^neck|^tail/.test(nm) ? 0 : -1;
      }
      const pick = [new Set(), new Set()];
      const inv = md.skeleton.boneInverses;
      const bm = new THREE.Matrix4();
      const ys = new Float32Array(n);
      const poses = [['lie', 0], ['sleep', 0], ['ruminate', 0.5], ['lie_down', 0.95], ['get_up', 0.05], ['graze', 0.1], ['graze', 0.6], ['eat', 0.3]];
      for (const [clip, t] of poses) {
        if (!this.actions[clip]) continue;
        this.clipPose(clip, t);
        md.root.updateMatrixWorld(true);
        const mats = md.bones.map((b, k) => bm.multiplyMatrices(b.matrixWorld, inv[k]).elements.slice());
        for (let i = 0; i < n; i++) {
          if (cls[i] < 0) continue;
          let y = 0;
          const x0 = S.pos[i * 3];
          const y0 = S.pos[i * 3 + 1];
          const z0 = S.pos[i * 3 + 2];
          for (let c = 0; c < 4; c++) {
            const w = P.sw[i * 4 + c];
            if (!(w > 0)) continue;
            const e = mats[P.si[i * 4 + c]];
            y += w * (e[1] * x0 + e[5] * y0 + e[9] * z0 + e[13]);
          }
          ys[i] = y;
        }
        for (let k = 0; k < 2; k++) {
          const best = [];
          for (let i = 0; i < n; i++) {
            if (cls[i] !== k) continue;
            if (best.length < 16) best.push(i);
            else {
              let wi = 0;
              for (let j = 1; j < 16; j++) if (ys[best[j]] > ys[best[wi]]) wi = j;
              if (ys[i] < ys[best[wi]]) best[wi] = i;
            }
          }
          for (const i of best) pick[k].add(i);
        }
      }
      S.contact = pick.map((s) => Uint32Array.from(s));
    }
    // (repères pris sur le squelette du gabarit au repos)
    const hold = this.bones.map((b) => [b.position.clone(), b.quaternion.clone()]);
    for (const b of this.bones) {
      b.position.copy(b.userData.restP);
      b.quaternion.copy(b.userData.restQ);
    }
    md.root.updateMatrixWorld(true);
    // (position de liaison par l'inverse de liaison de chaque os, comme la peau : la tête agrandie compte)
    const bind = (i, s) => V(S.pos[i * 3] + P.dPos[i * 3] * s, S.pos[i * 3 + 1] + P.dPos[i * 3 + 1] * s, S.pos[i * 3 + 2] + P.dPos[i * 3 + 2] * s);
    const invs = md.skeleton.boneInverses;
    const infl = (i) => {
      const out = [];
      let tot = 0;
      for (let c = 0; c < 4; c++) if (P.sw[i * 4 + c] > 0.02) tot += P.sw[i * 4 + c];
      for (let c = 0; c < 4; c++) {
        const w = P.sw[i * 4 + c];
        if (!(w > 0.02)) continue;
        const k = P.si[i * 4 + c];
        out.push([this.bones[k], bind(i, 0).applyMatrix4(invs[k]), bind(i, 1).applyMatrix4(invs[k]), w / (tot || 1)]);
      }
      return out;
    };
    this.bodyPts = [...S.contact[0]].map(infl);
    this.headPts = [...S.contact[1]].map(infl);
    for (let i = 0; i < this.bones.length; i++) {
      this.bones[i].position.copy(hold[i][0]);
      this.bones[i].quaternion.copy(hold[i][1]);
    }
    md.root.updateMatrixWorld(true);
  }

  /** Pose figée (vignettes, van, caisse) : debout (tête levée, de face), couché ou endormi, sans temps qui passe. */
  staticPose(kind = 'stand') {
    const clip = { stand: 'idle', lie: 'lie', sleep: 'sleep' }[kind] ?? 'idle';
    this.posture = kind === 'stand' ? 'stand' : kind;
    this.trans = null;
    this.bleatOn = false;
    this.clipPose(clip, 0);
    const st = { moving: false, v: 0, sleeping: kind === 'sleep', posture: this.posture };
    this.look.set(0, 0);
    this.overlay(0, st, true);
    this.ground(st, 0);
    this.model.root.updateMatrixWorld(true);
  }

  /** Toison : poids de la cible de forme « shorn » et teinte de la laine tondue, fondus vers l'état voulu. */
  applyFleece(dt) {
    const md = this.model;
    const B = md.build;
    let target = shornWeight(B, md.fleece, this.fluffExtra + this.cutExtra);
    // (tonte du salon : toison égale et courte)
    if (this.cutK) target = Math.max(target, this.cutK);
    this.shorn += (target - this.shorn) * Math.min(1, dt * 1.6);
    if (Math.abs(target - this.shorn) < 1e-4) this.shorn = target;
    md.mesh.morphTargetInfluences[0] = this.shorn;
    md.uniforms.sState.value.x = clamp(this.shorn, 0, 1);
    // (couché : la laine longue s'étale au sol au lieu de pendre sous le ventre)
    const lie = (this.w.lie ?? 0) + (this.w.sleep ?? 0) + (this.w.ruminate ?? 0) + 0.6 * ((this.w.lie_down ?? 0) + (this.w.get_up ?? 0));
    md.uniforms.sState.value.w = clamp(lie, 0, 1);
  }

  /**
   * Une image. st : { v (m/s, mouton de taille 1), moving, size, posture ('stand' | 'lie' | 'sleep'), action ('graze' |
   * 'eat' | 'nurse' | 'play' | null), play (gambade en courant : agneau), bleat (il bêle), ruminate, sad, herd, look
   * (cible du regard dans le repère du mouton ou null), noLock (sabots libres : tour du spectacle) }.
   */
  update(dt, st) {
    const md = this.model;
    this.restorePose();
    this.t += dt;
    this.hold += dt;
    const size = clamp(st.size ?? 1, 0.15, 1.6);
    // (allure au même nombre de Froude que le modèle : vitesse rapportée à la racine de la taille et des membres)
    const u = st.moving ? (st.v * Math.sqrt(size)) / Math.sqrt(this.speedScale) : 0;
    const g = pickSheepGait(this.gait, u);
    this.gait = g;
    const trick = this.trick && this.trick.age < 0.25 ? this.trick : null;
    if (this.trick) this.trick.age += dt;
    // Posture voulue (debout dès qu'il bouge) ; transitions de ruminant jouées une fois.
    const want = st.moving || trick ? 'stand' : st.posture ?? 'stand';
    if (this.trans) {
      const a = this.actions[this.trans.name];
      if (!a || a.time >= a.getClip().duration - 0.05) {
        this.posture = this.trans.to;
        this.trans = null;
        this.hold = 0;
      }
    }
    if (!this.trans && want !== this.posture) {
      let tr = null;
      if (lying(want) && lying(this.posture)) this.posture = want; // (couché ↔ endormi : en fondu)
      else if (want === 'stand') tr = 'get_up';
      else tr = 'lie_down';
      if (tr) {
        const a = this.actions[tr];
        if (a) {
          a.reset();
          a.play();
          this.trans = { name: tr, to: want };
        } else this.posture = want;
      }
    }
    // Bêler : tête levée, bouche ouverte (clip joué une fois) — en marchant, la tête et la mâchoire seulement.
    const bl = this.actions.bleat;
    if (st.bleat && bl && !this.bleatOn && this.posture === 'stand' && !this.trans && !st.moving) {
      bl.reset();
      bl.play();
      this.bleatOn = true;
    }
    if (this.bleatOn && (!bl || bl.time >= bl.getClip().duration - 0.05 || st.moving || this.posture !== 'stand')) this.bleatOn = false;
    if (st.bleat && st.moving) this.bleatWalk = 1.6;
    // Poids voulus.
    const target = this.target;
    for (let j = 0; j < this.names.length; j++) target[this.names[j]] = 0;
    let fadeK = 4;
    let moveClip = null;
    if (trick && this.actions[trick.clip]) {
      target[trick.clip] = 1;
      fadeK = 14;
    } else if (this.trans) {
      target[this.trans.name] = 1;
      fadeK = 10;
    } else if (st.moving) {
      moveClip = st.play && this.actions.lamb_play && g !== 'walk' ? 'lamb_play' : g === 'idle' ? 'walk' : g;
      target[moveClip] = 1;
      fadeK = 5;
    } else if (this.posture === 'lie') {
      target[st.ruminate && this.actions.ruminate ? 'ruminate' : 'lie'] = 1;
      fadeK = 1.5;
    } else if (this.posture === 'sleep') {
      target.sleep = 1;
      fadeK = 1.5;
    } else if (this.bleatOn) {
      target.bleat = 1;
      fadeK = 8;
    } else if ((st.action === 'graze' || st.action === 'eat') && this.actions[st.action]) {
      target[st.action] = 1;
      fadeK = 2.5;
    } else if (st.action === 'play' && this.actions.lamb_play) {
      target.lamb_play = 1;
      fadeK = 6;
    } else {
      target.idle = 1;
      fadeK = 3;
    }
    const k = 1 - Math.exp(-dt * fadeK);
    let lead = null;
    let leadW = 0;
    for (let j = 0; j < this.list.length; j++) {
      const name = this.names[j];
      const a = this.list[j];
      const was = this.w[name];
      let w = was + (target[name] - was) * k;
      if (w < 0.002) w = 0;
      this.w[name] = w;
      // (une allure qui entre se cale sur la phase de celle qui sort)
      if (was < 0.02 && w >= 0.02 && MOVING.includes(name) && this.lead && this.lead !== name) {
        const from = this.actions[this.lead];
        if (from) a.time = (from.time / from.getClip().duration) * a.getClip().duration;
      }
      a.setEffectiveWeight(w);
      if (MOVING.includes(name)) {
        const nat = this.natural[name];
        // (petits moutons, agneaux : la cadence monte comme 1 / racine de la taille, sans s'emballer)
        a.timeScale = Math.min(2.2 / Math.sqrt(Math.min(1, size)), Math.max(0.45, (st.moving ? st.v : nat) / nat));
        if (w > leadW) {
          lead = name;
          leadW = w;
        }
      } else if (trick && name === trick.clip) {
        a.timeScale = 0;
        a.time = trick.time * a.getClip().duration;
      } else if (this.trans?.name === name) {
        // (relevé pour repartir : vite)
        a.timeScale = st.moving ? 2.4 : st.quick ? 1.6 : 1;
      } else a.timeScale = name === 'lamb_play' ? 1.15 : 1;
    }
    if (lead && leadW > 0.3) this.lead = lead;
    this.mixer.update(dt);
    this.savePose();
    this.applyShift();
    this.overlay(dt, st, false);
    this.applyFleece(dt);
    this.ground(st, dt, moveClip);
  }

  /** Procédural par-dessus les clips : regard, tétée, bêlement en marchant, oreilles, queue. */
  overlay(dt, st, still) {
    const md = this.model;
    const B = md.build;
    const t = this.t;
    const moving = !!st.moving;
    const stand = this.posture === 'stand' && !this.trans;
    // Regard : vers ce qui l'intéresse (le joueur proche), sinon il regarde autour de lui ; pas en broutant.
    let yaw = (Math.sin(t * 0.31) * 0.5 + Math.sin(t * 0.11 + 1.7) * 0.5) * 0.3 * (moving ? 0.15 : 1);
    let pitch = 0;
    if (st.look && !moving) {
      yaw = clamp(Math.atan2(st.look.x, Math.max(0.05, st.look.z)), -0.9, 0.9);
      pitch = clamp(-Math.atan2(st.look.y, Math.hypot(st.look.x, st.look.z)), -0.4, 0.3);
    }
    const free = stand && st.action !== 'graze' && st.action !== 'eat' && !this.bleatOn;
    if (!free && !lying(this.posture)) {
      yaw *= 0.2;
      pitch = 0;
    }
    if (this.posture === 'sleep') {
      yaw = 0;
      pitch = 0;
    }
    const lk = still ? 1 : Math.min(1, dt * 2.5);
    this.look.x += (yaw - this.look.x) * lk;
    this.look.y += (pitch - this.look.y) * lk;
    const neck = md.neck;
    const head = md.head;
    this.turn(neck, AY, this.look.x * 0.45);
    this.turn(head, AY, this.look.x * 0.35);
    this.turn(head, AX, this.look.y * 0.5);
    if (st.sad && stand && !moving) this.turn(neck, AX, 0.15);
    // Agneau qui tète : encolure tendue vers le haut sous le ventre de sa mère, queue qui frétille.
    this.nurse += ((st.action === 'nurse' && stand && !moving ? 1 : 0) - this.nurse) * (still ? 1 : Math.min(1, dt * 3));
    if (this.nurse > 0.01) {
      this.turn(neck, AX, -0.45 * this.nurse);
      this.turn(head, AX, -0.35 * this.nurse);
    }
    // Bouche fermée au calme (l'arrêt du GLB mâchonne, la bouche entrouverte montrait les dents) ; elle s'ouvre pour
    // brouter, manger, ruminer et bêler.
    const chew = this.bleatOn || st.action === 'graze' || st.action === 'eat' || (this.posture === 'lie' && st.ruminate);
    this.jawShut = (this.jawShut ?? 1) + ((chew ? 0 : 1) - (this.jawShut ?? 1)) * (still ? 1 : Math.min(1, dt * 4));
    if (this.jawShut > 0.01) this.turn(this.jaw, AX, -0.07 * this.jawShut);
    // Bêler en marchant : tête levée, bouche ouverte un instant.
    if (this.bleatWalk > 0) {
      this.bleatWalk = Math.max(0, this.bleatWalk - dt);
      const b = Math.sin(Math.PI * Math.min(1, this.bleatWalk / 1.6));
      this.turn(neck, AX, -0.25 * b);
      this.turn(this.jaw, AX, 0.3 * b);
    }
    // Oreilles : port de la race (dressées du cheviot, tombantes du suffolk), un petit coup de temps en temps, basses
    // endormi ou triste.
    for (let i = 0; i < md.ears.length; i++) {
      const e = md.ears[i];
      const s = e.userData.side;
      const flick = Math.max(0, Math.sin(t * 1.7 + i * 2.6) - 0.93) * 12;
      const down = (st.sad ? 0.25 : 0) + (this.posture === 'sleep' ? 0.3 : 0);
      this.turn(e, AZ, s * (B.earUp - down + flick * 0.08));
      this.turn(e, AX, Math.sin(t * 1.1 + i) * 0.04 - flick * 0.15);
    }
    // Queue : frétille en broutant, en mangeant et en tétant.
    const tb = md.tail;
    if (tb) {
      const want = st.action === 'nurse' ? 1 : st.action === 'graze' || st.action === 'eat' ? 0.35 : 0;
      this.wag += (want - this.wag) * (still ? 1 : Math.min(1, dt * 3));
      if (this.wag > 0.01) this.turn(tb, AY, Math.sin(t * 16) * 0.35 * this.wag);
    }
  }

  /**
   * Sabots au sol. Aux allures, la sole la plus basse est posée sur le sol (relevée tout de suite, descendue en douceur
   * au trot et au galop, qui ont des temps de suspension) et les sabots en appui sont tenus sur place (footLock) ; à
   * l'arrêt (debout, couché, endormi), les soles et le ventre reposent sur le sol sans s'y enfoncer (toison épaisse ou
   * laine longue comprises) ; le museau qui broute ou dort reste au-dessus de l'herbe.
   * dt : 0 pour une pose fixe (vignettes, van) : sans transition.
   */
  ground(st, dt = 0, moveClip = null) {
    const md = this.model;
    md.root.updateMatrixWorld(true);
    _m.copy(md.root.matrixWorld).invert();
    let low = Infinity;
    for (let l = 0; l < md.legs.length; l++) {
      const paw = md.legs[l].paw;
      for (const p of this.solePts[l]) {
        const y = _v.copy(p).applyMatrix4(paw.matrixWorld).applyMatrix4(_m).y;
        if (y < low) low = y;
      }
    }
    if (!Number.isFinite(low)) low = 0;
    const air = !!(this.trick && this.trick.age < 0.25) || moveClip === 'lamb_play' || (this.w.jump ?? 0) > 0.3;
    const sh = this.shorn;
    let target;
    let floor = -low;
    if (st.moving || air) {
      target = !air && this.gait === 'walk' ? -low : Math.max(0, -low);
    } else {
      let lowB = Infinity;
      const lie = (this.w.lie ?? 0) + (this.w.sleep ?? 0) + (this.w.ruminate ?? 0) + (this.w.lie_down ?? 0) + (this.w.get_up ?? 0);
      if (lie > 0.05 || this.trans) {
        for (const pt of this.bodyPts) {
          const y = skinPoint(pt, sh, _m);
          if (y < lowB) lowB = y;
        }
        // (laine longue qui pend sous le ventre : déplacée par le shader, le corps est relevé d'autant)
        lowB -= this.skirt * Math.max(0, 1 - clamp(sh, 0, 1)) * Math.min(1, lie);
      }
      target = Math.max(-low, Number.isFinite(lowB) ? -(lowB + 0.006) : -Infinity);
      floor = target;
    }
    const rate = st.moving && !air && this.gait === 'walk' ? Infinity : st.moving && !air ? 10 : air ? 25 : this.trans ? 14 : 6;
    let off = dt > 0 ? this.gOff + (target - this.gOff) * Math.min(1, dt * rate) : target;
    off = Math.max(off, floor);
    this.gOff = off;
    if (Math.abs(off) > 0.0003) {
      md.body.position.y += off;
      md.root.updateMatrixWorld(true);
    }
    if (st.moving && !air && dt > 0 && !st.noLock) {
      this.footLock(dt);
      let low2 = Infinity;
      for (let l = 0; l < md.legs.length; l++) {
        for (const p of this.solePts[l]) {
          const y = _v.copy(p).applyMatrix4(md.legs[l].paw.matrixWorld).applyMatrix4(_m).y;
          if (y < low2) low2 = y;
        }
      }
      if (low2 < -0.0005) {
        md.body.position.y -= low2;
        this.gOff -= low2;
        md.root.updateMatrixWorld(true);
      }
    } else {
      this.plant.fill(null);
      this.lockAng.fill(0);
      this.lockSide.fill(0);
    }
    if (st.moving) return;
    // Museau : jamais sous l'herbe (tête plus grosse d'une race ou d'un agneau qui broute, dort) — l'encolure le relève.
    if (this.headPts.length && md.neck) {
      for (let pass = 0; pass < 2; pass++) {
        let lowY = Infinity;
        for (const pt of this.headPts) {
          const y = skinPoint(pt, sh, _m);
          if (y < lowY) {
            lowY = y;
            _u.copy(_w);
          }
        }
        const floorH = 0.012;
        if (!(lowY < floorH)) break;
        this.turn(md.neck, AX, raiseAngle(_v.setFromMatrixPosition(md.neck.matrixWorld).applyMatrix4(_m), _u, floorH + 0.004, 0.8));
        md.neck.updateMatrixWorld(true);
      }
    }
  }

  /**
   * Sabots en appui tenus sur place (pas, trot, galop ; voir dogReal.js footLock) : quand un sabot se pose, la place de
   * ses onglons dans le monde est notée ; tant qu'il reste posé, le membre est tourné à l'épaule ou à la hanche pour
   * les y ramener (en long et sur le côté) ; la correction s'efface en fondu quand le sabot repart, de quelques
   * millimètres au plus par image.
   */
  footLock(dt = 1 / 60) {
    const md = this.model;
    const inv = _m;
    md.root.matrixWorld.decompose(_rt, _rq, _rs);
    _rq.invert();
    const lowOf = (leg, l) => {
      let lo = Infinity;
      for (const p of this.solePts[l]) {
        const y = _v.copy(p).applyMatrix4(leg.paw.matrixWorld).applyMatrix4(inv).y;
        if (y < lo) lo = y;
      }
      return lo;
    };
    for (let l = 0; l < md.legs.length; l++) {
      const leg = md.legs[l];
      const lowClip = lowOf(leg, l);
      const planted = !!this.plant[l];
      const down = lowClip < (planted ? 0.016 : 0.011);
      let ang = this.lockAng[l];
      let sd = this.lockSide[l];
      if (!down || !planted) {
        if (planted) this.relTop[l] = 0;
        if (ang || sd) {
          this.turn(leg.pivot, AX, ang);
          this.turn(leg.pivot, AZ, sd);
          leg.pivot.updateMatrixWorld(true);
          const lo = lowOf(leg, l);
          const prevTop = this.relTop[l];
          this.relTop[l] = Math.max(prevTop, lo);
          const cap0 = 1 - smooth(0.01, 0.03, prevTop);
          const cap1 = 1 - smooth(0.01, 0.03, this.relTop[l]);
          const ratio = cap0 > 1e-3 ? cap1 / cap0 : 0;
          const fade = Math.exp(-dt * 12 * smooth(0.01, 0.03, lo)) * ratio;
          const toe = _u.copy(this.toePts[l]).applyMatrix4(leg.paw.matrixWorld);
          const arm = Math.max(0.05 * _rs.y, _w.setFromMatrixPosition(leg.pivot.matrixWorld).sub(toe).applyQuaternion(_rq).y);
          const dmax = ((0.004 + 0.016 * smooth(0.005, 0.03, lo)) * _rs.y) / arm;
          const a2 = ang + clamp(ang * fade - ang, -dmax, dmax);
          const s2 = sd + clamp(sd * fade - sd, -dmax, dmax);
          this.turn(leg.pivot, AZ, s2 - sd);
          this.turn(leg.pivot, AX, a2 - ang);
          leg.pivot.updateMatrixWorld(true);
          ang = Math.abs(a2) > 1e-4 ? a2 : 0;
          sd = Math.abs(s2) > 1e-4 ? s2 : 0;
        }
        this.lockAng[l] = ang;
        this.lockSide[l] = sd;
        this.plant[l] = down ? this.toePts[l].clone().applyMatrix4(leg.paw.matrixWorld) : null;
        continue;
      }
      let th = 0;
      let ph = 0;
      for (let pass = 0; pass < 2; pass++) {
        const toe = _u.copy(this.toePts[l]).applyMatrix4(leg.paw.matrixWorld);
        const err = _v.copy(toe).sub(this.plant[l]).applyQuaternion(_rq);
        const ez = err.z;
        const ex = err.x;
        const top = _w.setFromMatrixPosition(leg.pivot.matrixWorld);
        const Lg = Math.max(0.05, top.distanceTo(toe));
        const off = !pass && Math.abs(ez) > 0.45 * Lg;
        const dth = clamp(Math.asin(clamp(ez / Lg, -0.5, 0.5)), -0.52 - th, 0.52 - th);
        const dph = clamp(-Math.asin(clamp(ex / Lg, -0.2, 0.2)), -0.2 - ph, 0.2 - ph);
        const moved = Math.abs(dth) >= 1e-4 || Math.abs(dph) >= 1e-4;
        if (moved) {
          th += dth;
          ph += dph;
          this.turn(leg.pivot, AX, dth);
          this.turn(leg.pivot, AZ, dph);
          leg.pivot.updateMatrixWorld(true);
        }
        if (off) {
          this.plant[l] = null;
          this.relTop[l] = 0;
        }
        if (off || !moved) break;
      }
      if (!this.plant[l]) {
        const toe = _u.copy(this.toePts[l]).applyMatrix4(leg.paw.matrixWorld);
        const arm = Math.max(0.05 * _rs.y, _w.setFromMatrixPosition(leg.pivot.matrixWorld).sub(toe).applyQuaternion(_rq).y);
        const dmax = (0.004 * _rs.y) / arm;
        const a2 = ang + clamp(th - ang, -dmax, dmax);
        const s2 = sd + clamp(ph - sd, -dmax, dmax);
        this.turn(leg.pivot, AX, a2 - th);
        this.turn(leg.pivot, AZ, s2 - ph);
        leg.pivot.updateMatrixWorld(true);
        th = a2;
        ph = s2;
      }
      this.lockAng[l] = th;
      this.lockSide[l] = ph;
    }
  }
}

const _rt = V();
const _rq = new THREE.Quaternion();
const _rs = V(1, 1, 1);

/** Angle (autour de x) dont tourner le point q autour de c pour qu'il monte à la hauteur y (voir dogReal.js). */
function raiseAngle(c, q, y, max, prefer = 0) {
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
  let th = Math.abs(t1) < Math.abs(t2) ? t1 : t2;
  if (prefer) {
    const same = [t1, t2].filter((x) => Math.sign(x) === Math.sign(prefer) && Math.abs(x) <= max);
    if (same.length) th = same[0];
  }
  return clamp(th, -max, max);
}

// ------------------------------------------------------------------ entité du jeu

const _wv = V();
const _iv = new THREE.Matrix4();

/**
 * Pose imposée par une activité (spectacle) : 'jump' (saut, t : avancement 0-1 du clip), 'come' (il court : sabots
 * libres, la scène déplace le modèle). Renvoie false si ce n'est pas un mouton réaliste.
 */
export function realSheepPose(md, kind, s = 1, t = null) {
  if (!md?.realSheep) return false;
  const a = md.anim;
  if (kind === 'jump') a.trick = { clip: 'jump', time: t ?? 0.5, age: 0 };
  else if (kind === 'come') a.noLockFor = 0.3;
  void s;
  return true;
}

/**
 * Animation d'une entité (AnimalEntity) au mouton réaliste : ce qu'il fait (allure selon sa vitesse, brouter, manger à
 * la mangeoire, couché et ruminer, dormir, bêler, gambader et téter pour l'agneau, mené par le chien de troupeau) ;
 * renseigne e.gait. La toison suit l'animal (sheepFleece) à chaque image.
 */
export function animateRealSheep(e, dt, sad) {
  const md = e.model;
  const anim = md.anim;
  const d = e.data;
  const scale = (e.scale ?? 1) * (md.size ?? 1);
  // Version réduite au loin.
  if (horseView.on && md.setLod && !md.lodHold) {
    const far = gfx.quality === 'high' ? SHEEP_LOD_DIST.high : SHEEP_LOD_DIST.low;
    const dist = _wv.setFromMatrixPosition(e.root.matrixWorld).distanceTo(horseView.eye) / Math.max(0.25, scale);
    md.setLod(dist > far * (md.lodLevel ? 0.9 : 1) ? 1 : 0);
  }
  // Toison de l'animal (pleine, tondue, qui repousse) : lue à chaque image, fondue en douceur.
  md.fleece = sheepFleece(d);
  // Hors du champ et livré à lui-même : animé une image sur OFFSCREEN_STEP avec le temps cumulé.
  if (anim.frame !== horseView.frame) {
    anim.frame = horseView.frame;
    anim.seenNow = false;
  }
  if (anim.seen) {
    anim.seenNow = true;
    anim.seen = false;
  }
  // (au loin, en version réduite : une image sur FAR_STEP — à cette distance, sur un téléphone, ça ne se voit pas)
  const step = !anim.seenNow ? OFFSCREEN_STEP : md.lodLevel ? FAR_STEP : 1;
  if (step > 1 && !e.scripted && !e.herdCtrl && !e.posing && !d.following && horseView.on) {
    anim.skipDt += dt;
    if (++anim.skipN < step) return;
    dt = anim.skipDt;
  } else {
    dt += anim.skipDt;
  }
  anim.skipDt = 0;
  anim.skipN = 0;
  const st = (e.sheepSt ??= {});
  st.v = e.speed / Math.max(0.15, scale);
  st.moving = e.speed > 0.06 && e.perch?.phase !== 'on';
  st.size = scale;
  st.sad = sad;
  st.quick = !!e.posing;
  st.herd = !!e.herdCtrl;
  e.restSeed ??= ((d.id?.charCodeAt?.(0) ?? 7) + (d.id?.charCodeAt?.(1) ?? 3)) * 1.37;
  const t = e.time ?? 0;
  const lamb = md.lamb;
  const idle = e.state === 'idle' && !e.herdCtrl && !e.scripted && !d.following && !st.moving;
  // Couché : endormi, ou au repos (il rumine). Hystérésis : un mouton qui vient de dormir reste couché, éveillé, quand
  // on s'approche (le jeu le réveille à moins de 2,5 m) ; il ne se relève que pour partir.
  if (e.sleeping) anim.sleptAt = t;
  const justWoke = anim.sleptAt !== undefined && t - anim.sleptAt < 12;
  const restLie = idle && Math.sin(t * 0.045 + e.restSeed) > 0.62;
  let posture = 'stand';
  if (e.sleeping) posture = 'sleep';
  else if (!st.moving && !e.scripted && !e.herdCtrl && (justWoke || restLie || (lying(anim.posture) && anim.hold < 6))) posture = 'lie';
  st.posture = posture;
  st.ruminate = posture === 'lie' && Math.sin(t * 0.13 + e.restSeed * 0.7) > -0.2;
  // Gestes : manger à la mangeoire, brouter au repos (au pré et dans l'enclos), téter (agneau près de sa mère), gambader.
  let action = null;
  const mother = lamb && e.state === 'mother' ? e.partner : null;
  if (e.state === 'eat') action = 'eat';
  else if (mother && !st.moving && Math.hypot(mother.position.x - e.root.position.x, mother.position.z - e.root.position.z) < 1.4 * Math.max(0.6, mother.scale ?? 1)) {
    action = 'nurse';
    // (tourné vers le flanc de sa mère, la tête sous son ventre)
    const want = Math.atan2(mother.position.x - e.root.position.x, mother.position.z - e.root.position.z);
    let diff = want - e.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    e.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 1.5);
    e.root.rotation.y = e.heading;
  } else if (idle && (lamb || e.stage === 'young') && Math.sin(t * 0.37 + e.restSeed * 1.3) > 0.82) action = 'play';
  else if (idle && Math.sin(t * 0.3 + (e.phase ?? 0)) > 0.0) action = 'graze';
  st.action = action;
  st.play = (lamb || e.stage === 'young') && st.moving && !e.herdCtrl && Math.sin(t * 0.5 + e.restSeed) > 0.3;
  // Bêler : quand il se fait entendre (AnimalEntity.speak).
  st.bleat = e.spokeAt !== undefined && e.spokeAt !== anim.spokeSeen;
  anim.spokeSeen = e.spokeAt;
  // Regard : le joueur proche, dans le repère du mouton.
  st.look = null;
  if (e.playerAt && e.distPlayer < 5 && !e.scripted) {
    _iv.copy(e.root.matrixWorld).invert();
    st.look = (st.lookV ??= V()).copy(e.playerAt).setY(e.playerAt.y + 1.1).applyMatrix4(_iv);
  }
  if (anim.noLockFor > 0) anim.noLockFor -= dt;
  st.noLock = !!e.scripted || anim.noLockFor > 0;
  anim.update(dt, st);
  e.gait = anim.gait === 'run' ? 2 : anim.gait === 'trot' ? 1 : 0;
  e.headDown = action === 'graze' || action === 'eat' ? 1 : 0;
  e.lie = lying(anim.posture) ? 1 : 0;
}
