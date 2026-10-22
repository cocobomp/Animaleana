// Vaches réalistes : deux modèles d'artistes pour les 11 races, les génisses, les veaux et les taureaux —
// - la vache de Lyndon Daniels, « Realtime Rancher's 3D Model Pack » (CC0 1.0 ; même artiste et même licence que le
//   cheval du jeu), pour les vaches, les génisses et les veaux des deux sexes (public/models/cow.glb) ;
// - « Bull_Brown_01 » de la Microsoft Rocketbox Avatar Library (MIT, © 2020 Microsoft ; même source que les moutons et
//   les chèvres), pour les taureaux (public/models/bull.glb) ;
// préparés et animés pour le jeu (tools/vache/).
//
// Construit comme la chèvre et le mouton réalistes (goatReal.js, sheepReal.js : module commun des ruminants — gabarits,
// mesures, boîte qui suit la pose, mixeur d'un ruminant : allures sans glissement, couchée/relevée à genoux, sol,
// footLock) : le GLB n'est qu'une source, dont on tire une fois la géométrie de repos, le squelette, les clips et les
// régions de la robe (d'après les os). Chaque gabarit (race et stade) a sa géométrie, partagée : membres allongés ou
// raccourcis par leurs os, tronc élargi et ventre approfondi pour les races à viande. Chaque vache a son squelette (tête,
// oreilles, cornes, mamelle à sa taille), sa matière (robe peinte par cowCoat.js sur le masque propre de tools/vache/
// tex.mjs) et son mixeur. La mamelle suit le lait du jeu à chaque image (pleine, vide après la traite).
//
// En plus de la chèvre : meugler, queue qui chasse les mouches (et la vache qui se retourne vers son flanc), brosse à
// vaches, manger à l'auge à la hauteur de l'auge, veau qui gambade et tète, poil long et frange de la Highland (mèches en
// cartes, ruminantHair.js — semées aussi entre les sommets du taureau, moins dense), cornes longues refaites le long
// d'une courbe propre à la race et au modèle (vache en lyre ; taureau de Highland à l'horizontale, pointes en avant).
//
// Interface : la même que la vache procédurale (animalModel.js), qui reste le modèle de repli tant que le GLB n'est pas
// là (et dans les tests sans GLB). Repère : regard vers +Z, y vers le haut, origine au sol sous le milieu du corps ;
// vache « de taille 1 » (garrot 1,40 m ; taureau 1,45 m). model.head et model.neck sont des ancres aux conventions du
// modèle procédural (comme la chèvre) : le licol, le bonnet anti-mouches et le nœud du concours s'y posent sans code à eux.

import * as THREE from 'three';
import { getModel } from '../assets.js';
import { gfx } from '../gfx.js';
import { horseView } from './horseReal.js';
import { cowBuild, cowUdderFill, cowUdderScale, cowModelKind } from '../../sim/cowLook.js';
import { makeCowUniforms, setCowCoat, cowMaterial, cowEyeMaterial } from './cowCoat.js';
import { lockCards, spreadLocks, lockMaterial, makeLockUniforms, lockHash } from './ruminantHair.js';
import {
  cleanClips, emptyBoneBoxes, growBoneBoxes, measureSheep, sheepJoints, contactShadow, SheepMesh, RealSheepAnim, lying, smoothNormals, nurseSideOf,
} from './sheepReal.js';
import { makeHeadAnchor, makeNeckAnchor, muzzleRing } from './goatReal.js';

/** Clés des GLB (assets.js) : jamais « cow » (gltfAnimal.js la prendrait pour un animal GLB générique). */
export const REAL_COW_KEY = 'cow_real';
export const REAL_BULL_KEY = 'bull_real';
/** Version réduite au-delà de cette distance à la caméra (m, divisée par la taille de la vache) ; hystérésis 10 %. */
export const COW_LOD_DIST = { low: 12, high: 26 };
/** Vache hors du champ : animée une image sur OFFSCREEN_STEP, avec le temps cumulé. */
export const OFFSCREEN_STEP = 3;
/** Au loin (version réduite), animée une image sur FAR_STEP. */
export const FAR_STEP = 2;
/** Vitesses « naturelles » des allures (m/s, vache de taille 1) si le GLB ne les donne pas. */
export const NATURAL_SPEED = { walk: 1.18, trot: 2.54, run: 5.21 };
/** Hauteur du foin du râtelier et de l'eau de l'abreuvoir de la bergerie (equipment.js : penFeeder, trough). */
export const FEED_Y = { penFeeder: 0.62, penTrough: 0.48 };

const LEG_KEYS = [['FL', 'L', true], ['FR', 'R', true], ['HL', 'L', false], ['HR', 'R', false]];
const LEG_BONES = { front: ['humerus', 'radius', 'metacarpus', 'toes'], hind: ['femur', 'tibia', 'metatarsus', 'htoes'] };
const ONCE_COW = ['moo', 'swat', 'head_shake'];
const MOVING = ['walk', 'trot', 'run'];
const HEAD_BONES = new Set(['head', 'jaw', 'earL', 'earR', 'eyeL', 'eyeR', 'hornL', 'hornR']);
const LEG_LOW = /^(radius|metacarpus|toes|tibia|metatarsus|htoes)/;
const HOOF = /^(toes|htoes)/;
const TRUNK_W = {
  root: 1, pelvis: 1, spine1: 1, spine2: 1, chest: 1, neck1: 0.85, neck2: 0.5, tail1: 0.3, scapL: 0.65, scapR: 0.65, femurL: 0.55, femurR: 0.55,
  humerusL: 0.3, humerusR: 0.3,
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AX = V(1, 0, 0);
const AY = V(0, 1, 0);
const AZ = V(0, 0, 1);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const _v = V();
const _w = V();
const _m4 = new THREE.Matrix4();

// ------------------------------------------------------------------ données de repos (une fois par GLB)

/** Données d'une primitive skinnée dans le repère de la vache (positions de repos en flottants : le fichier est quantifié). */
function restPrim(mesh, toCow, n0 = null) {
  const g = mesh.geometry;
  const n = n0 ?? g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const dPos = new Float32Array(n * 3);
  const dNrm = new Float32Array(n * 3);
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const uv = new Float32Array(n * 2);
  const sk = mesh.skeleton;
  const sIdx = g.attributes.skinIndex;
  const sWgt = g.attributes.skinWeight;
  const mp = g.morphAttributes?.position?.[0] ?? null;
  const mn = g.morphAttributes?.normal?.[0] ?? null;
  const toM = new THREE.Matrix4().multiplyMatrices(toCow, mesh.matrixWorld);
  const acc = new THREE.Matrix4();
  const bm = new THREE.Matrix4();
  const nm3 = new THREE.Matrix3();
  const lin = new THREE.Matrix3();
  const _u = V();
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
    _m4.multiplyMatrices(toM, mesh.bindMatrixInverse).multiply(acc).multiply(mesh.bindMatrix);
    _v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(_m4);
    pos.set([_v.x, _v.y, _v.z], i * 3);
    nm3.getNormalMatrix(_m4);
    _w.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm3).normalize();
    nrm.set([_w.x, _w.y, _w.z], i * 3);
    if (mp) {
      lin.setFromMatrix4(_m4);
      _u.fromBufferAttribute(mp, i).applyMatrix3(lin);
      dPos.set([_u.x, _u.y, _u.z], i * 3);
    }
    if (mn) {
      _u.fromBufferAttribute(mn, i).applyMatrix3(nm3);
      dNrm.set([_u.x, _u.y, _u.z], i * 3);
    }
    if (g.attributes.uv) uv.set([g.attributes.uv.getX(i), g.attributes.uv.getY(i)], i * 2);
  }
  return { pos, nrm, dPos, dNrm, si, sw, uv, count: n, index: Uint32Array.from(g.index.array), material: mesh.material, morph: !!mp };
}

/**
 * Géométrie, squelette, clips et régions de la robe tirés du GLB de la vache (ou du taureau), dans le repère de la vache.
 * Gardé dans gltf.userData. Régions (attribut cowMask) : x corps, y tête (tête, mâchoire, oreilles, cornes), z bas des
 * membres, w onglons ; cowPart : x cornes, y mamelle (scrotum du taureau), z queue, w part portée par le tronc ;
 * cowAux : x oreilles, y mâchoire, z avancement le long de la corne (0 base → 1 pointe), w avancement le long de la
 * queue (0 base → 1 bout).
 */
export function realCowBase(gltf) {
  if (gltf.userData.cowBase) return gltf.userData.cowBase;
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const toCow = scene.matrixWorld.clone().invert();
  let master = null;
  let eye = null;
  let lodMesh = null;
  let lodEye = null;
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const lod = /lod/.test(o.name) || o.userData?.lod || /lod/.test(o.parent?.name ?? '');
    const isEye = /eye/.test(o.material?.name ?? '');
    if (lod) {
      if (isEye) lodEye = o;
      else lodMesh = o;
    } else if (isEye) eye ??= o;
    else master ??= o;
  });
  if (!master) throw new Error('Vache réaliste : maillage introuvable');
  const bones = master.skeleton.bones;
  const names = bones.map((b) => b.name);
  const index = new Map(names.map((nm, i) => [nm, i]));
  const nb = bones.length;
  const restW = bones.map((b) => new THREE.Matrix4().multiplyMatrices(toCow, b.matrixWorld));
  const heads = restW.map((m) => V().setFromMatrixPosition(m));
  const rotW = restW.map((m) => new THREE.Quaternion().setFromRotationMatrix(_m4.extractRotation(m)));
  const parent = bones.map((b) => (b.parent?.isBone && index.has(b.parent.name) ? index.get(b.parent.name) : -1));
  const P = restPrim(master, toCow);
  const n = P.count;
  const { pos, si, sw } = P;
  // Régions de la robe d'après les os qui portent chaque sommet.
  const mask = new Float32Array(n * 4);
  const part = new Float32Array(n * 4);
  const aux = new Float32Array(n * 4);
  const domBone = new Uint16Array(n);
  const trunk = new Float32Array(n);
  let ymin = Infinity;
  for (let i = 0; i < n; i++) ymin = Math.min(ymin, pos[i * 3 + 1]);
  const hornB = ['hornL', 'hornR'].map((nm) => index.get(nm));
  const hornLen = [0, 0];
  const tailIdx = names.map((nm) => (/^tail(\d)/.test(nm) ? Number(nm.slice(4)) : 0));
  const tailMax = Math.max(1, ...tailIdx);
  for (let i = 0; i < n; i++) {
    let head = 0;
    let leg = 0;
    let toes = 0;
    let best = 0;
    let tailT = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw[i * 4 + k];
      const b = si[i * 4 + k];
      const nmb = names[b];
      if (HEAD_BONES.has(nmb)) head += w;
      if (LEG_LOW.test(nmb)) leg += w;
      if (HOOF.test(nmb)) toes += w;
      if (nmb === 'hornL' || nmb === 'hornR') part[i * 4] += w;
      else if (nmb === 'udder' || nmb === 'scrotum') part[i * 4 + 1] += w;
      else if (tailIdx[b]) {
        part[i * 4 + 2] += w;
        tailT += w * (tailIdx[b] - 1) / Math.max(1, tailMax - 1);
      }
      if (nmb === 'earL' || nmb === 'earR') aux[i * 4] += w;
      else if (nmb === 'jaw') aux[i * 4 + 1] += w;
      part[i * 4 + 3] += w * (TRUNK_W[nmb] ?? 0);
      if (w > sw[i * 4 + best]) best = k;
    }
    domBone[i] = si[i * 4 + best];
    aux[i * 4 + 3] = part[i * 4 + 2] > 0 ? tailT / part[i * 4 + 2] : 0;
    // (onglons : le bas du pied, sous 7 cm)
    const hoof = toes * (1 - clamp((pos[i * 3 + 1] - ymin - 0.06) / 0.03, 0, 1));
    mask.set([clamp(1 - Math.max(head, leg), 0, 1), clamp(head, 0, 1), clamp(leg, 0, 1), clamp(hoof, 0, 1)], i * 4);
    trunk[i] = part[i * 4 + 3];
    // (cornes : distance à la base de la corne, au repos ; normalisée plus bas)
    if (part[i * 4] > 0.3) {
      const s = pos[i * 3] > 0 ? 0 : 1;
      const hb = hornB[s] !== undefined ? heads[hornB[s]] : null;
      if (hb) {
        const d = Math.hypot(pos[i * 3] - hb.x, pos[i * 3 + 1] - hb.y, pos[i * 3 + 2] - hb.z);
        aux[i * 4 + 2] = d;
        hornLen[s] = Math.max(hornLen[s], d);
      }
    }
  }
  for (let i = 0; i < n; i++) if (part[i * 4] > 0.3) aux[i * 4 + 2] /= Math.max(0.02, hornLen[pos[i * 3] > 0 ? 0 : 1]);
  const lodIndex = lodMesh && lodMesh.geometry.attributes.position.count === n && lodMesh.geometry.index ? Uint32Array.from(lodMesh.geometry.index.array) : null;
  for (const key of ['map', 'normalMap', 'aoMap']) if (master.material[key]) master.material[key].userData.shared = true;
  // Yeux (vache de Lyndon Daniels : primitive à part, liée au même squelette).
  let eyeP = null;
  if (eye) {
    eyeP = restPrim(eye, toCow);
    eyeP.lodIndex = lodEye && lodEye.geometry.attributes.position.count === eyeP.count && lodEye.geometry.index ? Uint32Array.from(lodEye.geometry.index.array) : null;
    if (eye.material.map) eye.material.map.userData.shared = true;
  }
  const B = (nmb) => index.get(nmb) ?? -1;
  const legChains = LEG_KEYS.map(([, s, front]) => (front ? LEG_BONES.front : LEG_BONES.hind).map((b) => B(b + s)));
  const ext = scene.userData?.cow ?? {};
  const natural = { ...NATURAL_SPEED, ...(ext.naturalSpeeds ?? {}) };
  const tailBones = names.filter((nm) => /^tail\d/.test(nm)).sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
  const base = {
    names, index, parent, heads, rotW, nb,
    kind: ext.kind ?? (index.has('scrotum') ? 'bull' : 'cow'),
    prim: { ...P, mask, part, aux, trunk, lodIndex, domBone },
    eye: eyeP,
    clips: cleanClips(gltf.animations),
    natural,
    legChains,
    tailBones,
    extras: ext,
    shapes: new Map(),
  };
  gltf.userData.cowBase = base;
  return base;
}

// ------------------------------------------------------------------ gabarit (une fois par race et stade)

/**
 * Positions d'un gabarit : membres allongés par leurs os (sheepJoints : le corps monte d'autant, les sabots restent au
 * sol), tronc élargi (girth) et ventre approfondi (depth) pour les races massives — au repos, sur la part de chaque
 * sommet portée par le tronc (les membres et la tête ne changent pas ; l'épaule et la cuisse suivent à moitié).
 */
function shapePositions(base, P, J, B, ref) {
  const n = P.count;
  const pos = new Float32Array(n * 3);
  const tw = base.prim.trunk;
  const g = (B.girth ?? 1) - 1;
  const dp = (B.depth ?? 1) - 1;
  for (let i = 0; i < n; i++) {
    let x = P.pos[i * 3];
    let y = P.pos[i * 3 + 1];
    let z = P.pos[i * 3 + 2];
    if (ref && (g || dp)) {
      // (part du tronc lissée ; l'encolure s'élargit un peu moins, la croupe et le poitrail en entier)
      const t = P === base.prim ? clamp((tw[i] - 0.25) / 0.6, 0, 1) : 0;
      const k = t * t * (3 - 2 * t);
      if (k > 0) {
        x *= 1 + g * k;
        // (ventre : descend, le dos ne bouge pas)
        y -= dp * Math.max(0, ref.topY - y) * k;
      }
    }
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
  return pos;
}

/**
 * Cornes en lyre (vache des races à longues cornes : Highland, Retinta) : la corne courte du modèle, droite, est
 * refaite le long d'une courbe — elle part sur le côté (un peu en avant), puis se relève, la pointe vers le haut — et
 * allongée (hornReach). Chaque sommet garde sa place autour de l'axe de la corne (section tournée avec la courbe) ; la
 * base reste celle du modèle (pas de déchirure au crâne). Positions et normales du gabarit, une fois par gabarit.
 * Taureau : sa courbe à lui (B.bullHorn : la corne du taureau de Highland part à l'horizontale et tourne sa pointe vers
 * l'avant ; celle de la cible de forme « horns_long » se dressait vers le haut et l'arrière, comme un bouquetin), plus
 * épaisse à la base.
 */
function hornCurve(base, B) {
  const c = base.kind === 'bull' ? B.bullHorn ?? {} : {};
  return {
    t0: c.t0 ?? [1, 0.12, 0.32],
    t1: c.t1 ?? [0.15, 1, 0.3],
    reach: c.reach ?? B.hornReach ?? 2.6,
    thick: c.thick ?? 1,
  };
}

function bendLongHorns(base, P, pos, nrm, heads, B) {
  const cv = hornCurve(base, B);
  const n = P.count;
  const q = new THREE.Quaternion();
  for (const [s, nm] of [[0, 'hornL'], [1, 'hornR']]) {
    const bi = base.index.get(nm);
    if (bi === undefined) continue;
    const o = heads[bi];
    const sx = s === 0 ? 1 : -1;
    const side = (i) => (pos[i * 3] > 0 ? 0 : 1) === s;
    const ax = V();
    for (let i = 0; i < n; i++) {
      if (P.part[i * 4] > 0.3 && side(i) && P.aux[i * 4 + 2] > 0.85) ax.add(_v.set(pos[i * 3] - o.x, pos[i * 3 + 1] - o.y, pos[i * 3 + 2] - o.z));
    }
    if (ax.lengthSq() < 1e-10) continue;
    ax.normalize();
    let len = 0;
    for (let i = 0; i < n; i++) {
      if (P.part[i * 4] > 0.3 && side(i)) len = Math.max(len, (pos[i * 3] - o.x) * ax.x + (pos[i * 3 + 1] - o.y) * ax.y + (pos[i * 3 + 2] - o.z) * ax.z);
    }
    if (len < 0.01) continue;
    // (courbe de la corne : tangente qui passe de l'axe du modèle au côté, puis se relève)
    const T0 = V(sx * cv.t0[0], cv.t0[1], cv.t0[2]).normalize();
    const T1 = V(sx * cv.t1[0], cv.t1[1], cv.t1[2]).normalize();
    const N = 40;
    const L = len * cv.reach;
    const tan = (u) => (u < 0.15 ? ax.clone().lerp(T0, smoothK(0, 0.15, u)) : T0.clone().lerp(T1, smoothK(0.3, 1, u))).normalize();
    const T = [];
    const C = [V()];
    for (let k = 0; k <= N; k++) {
      T.push(tan(k / N));
      if (k) C.push(C[k - 1].clone().addScaledVector(T[k - 1], L / N));
    }
    for (let i = 0; i < n; i++) {
      const w = clamp((P.part[i * 4] - 0.1) / 0.3, 0, 1);
      if (!(w > 0) || !side(i)) continue;
      const rel = _v.set(pos[i * 3] - o.x, pos[i * 3 + 1] - o.y, pos[i * 3 + 2] - o.z);
      const a = rel.dot(ax);
      const r = rel.addScaledVector(ax, -a);
      const u = clamp(a / len, 0, 1);
      const k = Math.min(N - 1, Math.floor(u * N));
      const f = u * N - k;
      const c = _w.lerpVectors(C[k], C[k + 1], f);
      const t = _t.lerpVectors(T[k], T[k + 1], f).normalize();
      q.setFromUnitVectors(ax, t);
      // (base un peu plus forte, pointe fine)
      const thick = (1 + 0.18 * smoothK(0, 0.2, u) * (1 - u) - 0.25 * smoothK(0.6, 1, u)) * (1 + (cv.thick - 1) * (1 - u));
      c.add(r.applyQuaternion(q).multiplyScalar(thick)).add(o);
      pos[i * 3] += (c.x - pos[i * 3]) * w;
      pos[i * 3 + 1] += (c.y - pos[i * 3 + 1]) * w;
      pos[i * 3 + 2] += (c.z - pos[i * 3 + 2]) * w;
      const nv = _t.set(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]).applyQuaternion(q.slerp(_q0, 1 - w));
      nrm[i * 3] = nv.x;
      nrm[i * 3 + 1] = nv.y;
      nrm[i * 3 + 2] = nv.z;
    }
  }
}
const _t = V();
const _q0 = new THREE.Quaternion();

/**
 * Sans cornes (races sans cornes, veaux) : la corne du modèle est écrasée le long de son axe jusqu'à un chignon — petite
 * bosse ronde au-dessus de l'oreille, haute de capH (le bouton de corne du veau, sous le poil) — et peinte de la robe
 * (cowPart.x mis à 0 dans part). Avant, l'os de la corne était seulement mis à l'échelle 0 : les sommets en partie portés
 * par lui s'écrasaient sur sa base, deux pyramides couleur corne restaient sur le chignon. La base de la corne ne bouge
 * pas (pas de trou au crâne) ; les normales se tournent vers l'axe (le dessus de la bosse).
 */
function pollHorns(base, P, pos, nrm, part, heads, capH) {
  const n = P.count;
  for (const [s, nm] of [[0, 'hornL'], [1, 'hornR']]) {
    const bi = base.index.get(nm);
    if (bi === undefined) continue;
    const o = heads[bi];
    const side = (i) => (pos[i * 3] > 0 ? 0 : 1) === s;
    const ax = V();
    for (let i = 0; i < n; i++) {
      if (P.part[i * 4] > 0.3 && side(i) && P.aux[i * 4 + 2] > 0.85) ax.add(_v.set(pos[i * 3] - o.x, pos[i * 3 + 1] - o.y, pos[i * 3 + 2] - o.z));
    }
    if (ax.lengthSq() < 1e-10) continue;
    ax.normalize();
    let len = 0;
    for (let i = 0; i < n; i++) {
      if (P.part[i * 4] > 0.1 && side(i)) len = Math.max(len, (pos[i * 3] - o.x) * ax.x + (pos[i * 3 + 1] - o.y) * ax.y + (pos[i * 3 + 2] - o.z) * ax.z);
    }
    if (len < 0.01) continue;
    for (let i = 0; i < n; i++) {
      if (!(P.part[i * 4] > 0.1) || !side(i)) continue;
      const w = clamp((P.part[i * 4] - 0.1) / 0.3, 0, 1);
      const rel = _v.set(pos[i * 3] - o.x, pos[i * 3 + 1] - o.y, pos[i * 3 + 2] - o.z);
      const a = rel.dot(ax);
      const r = rel.addScaledVector(ax, -a);
      const u = clamp(a / len, 0, 1);
      // (dôme : hauteur capH au sommet, la section se resserre un peu vers le haut)
      const h = a > 0 ? capH * Math.sin(u * Math.PI * 0.5) : a;
      const c = _w.copy(o).addScaledVector(ax, h).addScaledVector(r, 1 - 0.3 * u);
      pos[i * 3] += (c.x - pos[i * 3]) * w;
      pos[i * 3 + 1] += (c.y - pos[i * 3 + 1]) * w;
      pos[i * 3 + 2] += (c.z - pos[i * 3 + 2]) * w;
      const k = w * smoothK(0, 0.6, u);
      const nv = _t.set(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]).multiplyScalar(1 - k).addScaledVector(ax, k).normalize();
      nrm[i * 3] = nv.x;
      nrm[i * 3 + 1] = nv.y;
      nrm[i * 3 + 2] = nv.z;
    }
  }
  // (peinte de la robe, jusqu'au bord de la base)
  for (let i = 0; i < n; i++) part[i * 4] = 0;
}
/** Hauteur du chignon sans cornes (m, vache de taille 1) : à peine bombé chez l'adulte, bouton de corne chez le veau. */
export const POLL_CAP = { adult: 0.006, calf: 0.014 };
const smoothK = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Géométries (partagées) d'un gabarit, ses articulations et ses mesures. */
function shapeFor(base, B) {
  const lyre = B.hornLong > 0 && B.hornSize > 1e-3;
  const cv = hornCurve(base, B);
  // (sans cornes — races sans cornes, veaux — : chignon, sur la vache de Lyndon Daniels ; le taureau, dont la corne est
  // portée tout entière par son os, la rentre sans pyramide)
  const poll = !(B.hornSize > 1e-3) && base.kind !== 'bull' ? (B.calf ? POLL_CAP.calf : POLL_CAP.adult) : 0;
  const key = `${B.legs.toFixed(3)}|${(B.girth ?? 1).toFixed(3)}|${(B.depth ?? 1).toFixed(3)}${lyre ? `|lyre${[...cv.t0, ...cv.t1, cv.reach, cv.thick].map((x) => x.toFixed(2)).join(',')}` : ''}${poll ? `|poll${poll}` : ''}`;
  let S = base.shapes.get(key);
  if (S) return S;
  const P = base.prim;
  const n = P.count;
  const J = sheepJoints(base, B.legs);
  // (repère du dos : le haut du tronc, au repos, avant le gabarit)
  if (!base.ref) {
    let top = 0;
    for (let i = 0; i < n; i++) if (P.trunk[i] > 0.9 && Math.abs(P.pos[i * 3]) < 0.08) top = Math.max(top, P.pos[i * 3 + 1]);
    base.ref = { topY: top };
  }
  const pos = shapePositions(base, P, J, B, base.ref);
  // (cornes en lyre : positions et normales propres à ce gabarit)
  let nrm = P.nrm;
  let part = P.part;
  if (lyre) {
    nrm = Float32Array.from(P.nrm);
    bendLongHorns(base, P, pos, nrm, J.heads, B);
  } else if (poll) {
    nrm = Float32Array.from(P.nrm);
    part = Float32Array.from(P.part);
    pollHorns(base, P, pos, nrm, part, J.heads, poll);
  }
  const attrs = {
    position: new THREE.BufferAttribute(pos, 3),
    normal: new THREE.BufferAttribute(nrm, 3),
    uv: new THREE.BufferAttribute(P.uv, 2),
    skinIndex: new THREE.BufferAttribute(P.si, 4),
    skinWeight: new THREE.BufferAttribute(P.sw, 4),
    cowMask: new THREE.BufferAttribute(P.mask, 4),
    cowPart: new THREE.BufferAttribute(part, 4),
    cowAux: new THREE.BufferAttribute(P.aux, 4),
  };
  const morphP = P.morph ? new THREE.BufferAttribute(P.dPos, 3) : null;
  const morphN = P.morph ? new THREE.BufferAttribute(P.dNrm, 3) : null;
  const make = (index, at = attrs, mP = morphP, mN = morphN) => {
    const geo = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(at)) geo.setAttribute(k, a);
    if (mP) {
      geo.morphAttributes.position = [mP];
      geo.morphAttributes.normal = [mN];
      geo.morphTargetsRelative = true;
    }
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.userData.shared = true;
    return geo;
  };
  const geo = make(P.index);
  const lodGeo = P.lodIndex ? make(P.lodIndex) : null;
  // Yeux : même gabarit (portés par la tête).
  let eyeGeo = null;
  let eyeLod = null;
  let eyePos = null;
  if (base.eye) {
    const E = base.eye;
    eyePos = shapePositions(base, E, J, B, null);
    const ea = {
      position: new THREE.BufferAttribute(eyePos, 3),
      normal: new THREE.BufferAttribute(E.nrm, 3),
      uv: new THREE.BufferAttribute(E.uv, 2),
      skinIndex: new THREE.BufferAttribute(E.si, 4),
      skinWeight: new THREE.BufferAttribute(E.sw, 4),
    };
    eyeGeo = make(E.index, ea, null, null);
    eyeLod = E.lodIndex ? make(E.lodIndex, ea, null, null) : null;
  }
  // (boîtes de repos par os, cornes longues et poil long compris : élimination hors champ)
  const boxPos = new Float32Array(pos);
  for (let i = 0; i < n * 3; i++) boxPos[i] += P.dPos[i];
  const boneBox = growBoneBoxes(growBoneBoxes(emptyBoneBoxes(base.nb), pos, P.si, P.sw, n), boxPos, P.si, P.sw, n);
  const measure = measureSheep(base, pos, J.heads);
  // (yeux : les sommets de la primitive des yeux, sinon ceux notés par tools/vache/tex.mjs — taureau, yeux peints)
  if (eyePos) {
    const acc = V();
    const accL = V();
    let nL = 0;
    const c = base.eye.count;
    for (let i = 0; i < c; i++) {
      acc.add(_v.set(0, eyePos[i * 3 + 1], eyePos[i * 3 + 2]));
      if (eyePos[i * 3] > 0) {
        accL.add(_v.set(eyePos[i * 3], eyePos[i * 3 + 1], eyePos[i * 3 + 2]));
        nL++;
      }
    }
    measure.eye.copy(acc.multiplyScalar(1 / c));
    if (nL) measure.eyeL.c.copy(accL.multiplyScalar(1 / nL));
  } else if (base.extras.eyes?.length) {
    const e = base.extras.eyes.find((q) => q[0] > 0) ?? base.extras.eyes[0];
    const dy = J.D[base.index.get('head')]?.y ?? 0;
    measure.eye.set(0, e[1] + dy, e[2]);
    measure.eyeL.c.set(Math.abs(e[0]), e[1] + dy, e[2]);
  }
  measure.muzzle = muzzleRing(P, pos, measure);
  // (pointe des fesses : le sommet du tronc le plus en arrière)
  measure.rearZ = Infinity;
  for (let i = 0; i < n; i++) if (P.trunk[i] > 0.5 && P.part[i * 4 + 2] < 0.2) measure.rearZ = Math.min(measure.rearZ, pos[i * 3 + 2]);
  if (!Number.isFinite(measure.rearZ)) measure.rearZ = measure.hipZ - 0.3;
  // Mamelle : le bas des trayons (sommets de l'os de la mamelle les plus bas), au repos.
  const ub = base.index.get('udder') ?? base.index.get('scrotum');
  if (ub !== undefined) {
    let lo = Infinity;
    const c = V();
    let k = 0;
    for (let i = 0; i < n; i++) if (P.part[i * 4 + 1] > 0.6) lo = Math.min(lo, pos[i * 3 + 1]);
    for (let i = 0; i < n; i++) {
      if (P.part[i * 4 + 1] > 0.6 && pos[i * 3 + 1] < lo + 0.05) {
        c.add(_v.fromArray(pos, i * 3));
        k++;
      }
    }
    measure.teat = k ? c.multiplyScalar(1 / k) : J.heads[ub].clone();
  }
  S = { key, heads: J.heads, D: J.D, rise: J.rise, pos, geo, lodGeo, eyeGeo, eyeLod, boneBox, measure, poll };
  base.shapes.set(key, S);
  return S;
}

/**
 * Points de semis en plus pour les mèches d'un modèle peu dense : le milieu de chaque arête et de chaque triangle dont
 * les sommets sont tous du même genre (kindOf : 1 corps, 2 frange) ; position et normale moyennes, poids de la peau
 * fusionnés (les 4 os les plus lourds). Ajoute les candidats à cand et fringe (indices après les sommets) et renvoie les
 * tableaux étendus { pos, nrm, si, sw }.
 */
function densifyLocks(P, src, kindOf, hlOf, thighOf, cand, fringe) {
  const n = P.count;
  const idx = P.index;
  const pts = [];
  const seen = new Set();
  const add = (ids) => {
    if (ids.length === 2) {
      const k = Math.min(ids[0], ids[1]) * 1048576 + Math.max(ids[0], ids[1]);
      if (seen.has(k)) return;
      seen.add(k);
    }
    pts.push(ids);
  };
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t];
    const b = idx[t + 1];
    const c = idx[t + 2];
    const k = kindOf[a];
    if (!k || kindOf[b] !== k || kindOf[c] !== k) continue;
    add([a, b, c]);
    add([a, b]);
    add([b, c]);
    add([c, a]);
  }
  const m = pts.length;
  const pos = new Float32Array((n + m) * 3);
  const nrm = new Float32Array((n + m) * 3);
  const si = new Uint16Array((n + m) * 4);
  const sw = new Float32Array((n + m) * 4);
  pos.set(src.pos.subarray(0, n * 3));
  nrm.set(src.nrm.subarray(0, n * 3));
  si.set(src.si.subarray(0, n * 4));
  sw.set(src.sw.subarray(0, n * 4));
  const acc = new Map();
  for (let j = 0; j < m; j++) {
    const ids = pts[j];
    const o = n + j;
    acc.clear();
    let hl = 0;
    let thigh = 0;
    for (const i of ids) {
      for (let c = 0; c < 3; c++) {
        pos[o * 3 + c] += src.pos[i * 3 + c] / ids.length;
        nrm[o * 3 + c] += src.nrm[i * 3 + c];
      }
      for (let k = 0; k < 4; k++) {
        const w = src.sw[i * 4 + k];
        if (w > 0) acc.set(src.si[i * 4 + k], (acc.get(src.si[i * 4 + k]) ?? 0) + w);
      }
      hl += hlOf[i] / ids.length;
      thigh = Math.max(thigh, thighOf[i]);
    }
    const l = Math.hypot(nrm[o * 3], nrm[o * 3 + 1], nrm[o * 3 + 2]) || 1;
    for (let c = 0; c < 3; c++) nrm[o * 3 + c] /= l;
    const top = [...acc].sort((x, y) => y[1] - x[1]).slice(0, 4);
    const tot = top.reduce((q, x) => q + x[1], 0) || 1;
    top.forEach(([b, w], k) => {
      si[o * 4 + k] = b;
      sw[o * 4 + k] = w / tot;
    });
    if (kindOf[ids[0]] === 2) fringe.push({ i: o, hl: 1 });
    else cand.push({ i: o, hl, thigh: !!thigh });
  }
  return { pos, nrm, si, sw };
}

/**
 * Poil long (Highland) : des mèches effilées et ondulées (ruminantHair.js) pendent des flancs, du dos, de la croupe, de
 * l'encolure et de l'arrière des cuisses — semées à espacement régulier, jamais en rang sous le ventre — et une frange
 * tombe du toupet sur les yeux. Géométrie partagée par gabarit et longueur ; hairSide : 0 couleur de la robe, 1 pointe
 * plus claire (reflets roux). Renvoie null sans poil long.
 */
function hairCards(base, S, B) {
  if (!(B.hair > 0.005) && !(B.fringe > 0.005)) return null;
  const key = `${B.hair.toFixed(3)}|${B.fringe.toFixed(3)}`;
  S.hair ??= new Map();
  if (S.hair.has(key)) return S.hair.get(key);
  const P = base.prim;
  const n = P.count;
  const pos = S.pos;
  const M = S.measure;
  // (normales lissées : les mèches partent d'une peau sans arêtes)
  P.smoothN ??= smoothNormals(P.pos, P.nrm, n, 0.09);
  const Hh = Math.max(0.05, M.topY - M.bellyY);
  const femur = new Set(['femurL', 'femurR'].map((nm) => base.index.get(nm)));
  const neck = new Set(['neck1', 'neck2', 'neck3'].map((nm) => base.index.get(nm)));
  const cand = [];
  const fringe = [];
  // (genre de chaque sommet : 1 corps, 2 frange — pour semer aussi entre les sommets, plus bas)
  const kindOf = new Uint8Array(n);
  const hlOf = new Float32Array(n);
  const thighOf = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const head = P.mask[i * 4 + 1];
    if (P.part[i * 4] > 0.15 || P.part[i * 4 + 1] > 0.15 || P.part[i * 4 + 2] > 0.3 || P.mask[i * 4 + 3] > 0.1 || P.aux[i * 4] > 0.3) continue;
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    const ny = P.smoothN[i * 3 + 1];
    // Frange : le toupet, entre les cornes et au-dessus des yeux, tourné vers le haut ou l'avant.
    if (head > 0.7) {
      if (B.fringe > 0.005 && P.aux[i * 4 + 1] < 0.2 && y > M.eye.y - 0.01 && z > M.eye.z - 0.16 && z < M.eye.z + 0.07 && Math.abs(pos[i * 3]) < 0.14
        && P.smoothN[i * 3 + 1] > -0.1) {
        fringe.push({ i, hl: 1 });
        kindOf[i] = 2;
      }
      continue;
    }
    if (!(B.hair > 0.005) || ny < -0.5) continue; // (pas sous le ventre)
    let fw = 0;
    let nw = 0;
    for (let k = 0; k < 4; k++) {
      if (femur.has(P.si[i * 4 + k])) fw += P.sw[i * 4 + k];
      if (neck.has(P.si[i * 4 + k])) nw += P.sw[i * 4 + k];
    }
    const hl = (y - M.bellyY) / Hh;
    const body = P.part[i * 4 + 3] > 0.55 && P.mask[i * 4 + 2] < 0.3 && hl > -0.2;
    const thigh = fw > 0.3 && z < M.hipZ + 0.08 && y > M.kneeY[1] + 0.06;
    const nk = nw > 0.4 && head < 0.3;
    if (body || thigh || nk) {
      cand.push({ i, hl, thigh });
      kindOf[i] = 1;
      hlOf[i] = hl;
      thighOf[i] = thigh ? 1 : 0;
    }
  }
  // (modèle peu dense — le taureau : 1 900 sommets, deux fois moins que la vache — : les mèches, semées sur les sommets,
  // restaient clairsemées et la frange en quelques lanières ; on sème aussi au milieu des arêtes et des triangles dont
  // les sommets sont tous candidats)
  let src = { pos, nrm: P.smoothN, si: P.si, sw: P.sw };
  if (n < 2600) src = densifyLocks(P, src, kindOf, hlOf, thighOf, cand, fringe);
  // (mèches étroites et longues, serrées : larges et courtes, elles faisaient des écailles plates sur le corps)
  const picks = spreadLocks(cand, src.pos, 0.05, 900).map(({ i, hl, thigh }) => ({
    i,
    // (plus longues en bas des flancs — la jupe — et à la culotte ; le dos garde un poil plus court)
    len: B.hair * (thigh ? 1.25 : 0.75 + 0.7 * (1 - clamp(hl, 0, 1))) * (0.8 + 0.4 * lockHash(i + 5)),
    w: 0.06 + 0.03 * lockHash(i + 9),
    back: thigh ? 0.45 : 0.08,
    side: lockHash(i + 31) > 0.7 ? 1 : 0,
  }));
  // (frange : mèches fines du toupet qui tombent en avant, sur les yeux — étroites et nombreuses : larges de 4 à 6 cm,
  // elles faisaient des lanières plates)
  for (const f of spreadLocks(fringe, src.pos, 0.014, 140)) {
    picks.push({ i: f.i, len: B.fringe * (0.7 + 0.6 * lockHash(f.i + 3)), w: 0.024 + 0.014 * lockHash(f.i + 7), back: -0.35, side: lockHash(f.i + 11) > 0.5 ? 1 : 0 });
  }
  const geo = picks.length ? lockCards(picks, src, 0.012) : null;
  S.hair.set(key, geo);
  return geo;
}

// ------------------------------------------------------------------ construction

/** Le GLB de la vache (ou du taureau, kind 'bull') est-il chargé ? */
export const realCowReady = (kind = 'cow') => !!getModel(kind === 'bull' ? REAL_BULL_KEY : REAL_COW_KEY);

/**
 * Construit la vache réaliste (ou null si son GLB n'est pas chargé : on prend alors la vache procédurale).
 * look : la robe de l'animal (look.calf : veau, look.young : génisse ou jeune taureau, look.sex : 'm' — adulte : le
 * taureau —, look.udderFill : mamelle figée 0-1 pour une vignette) ; breedId : sa race (anciennes sauvegardes) ; gltf :
 * le GLB (tests ; { cow, bull } ou le GLB du modèle voulu).
 */
export function buildRealCowModel(look, breedId = null, gltf = null) {
  const kind = cowModelKind(look);
  const src = gltf?.scene ? gltf : (gltf?.[kind] ?? getModel(kind === 'bull' ? REAL_BULL_KEY : REAL_COW_KEY));
  if (!src) return null;
  const base = realCowBase(src);
  const stage = look.calf ? 'baby' : look.young ? 'young' : 'adult';
  const B = cowBuild(look, { breed: breedId, stage, sex: look.sex ?? 'f' });
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
  const toLocal = (b, p) => p.clone().applyMatrix4(skeleton.boneInverses[bones.indexOf(b)]);
  const headB = bone('head');
  const neckB = bone('neck3') ?? bone('neck2') ?? bone('neck1');
  // Ancres de la tête et de l'encolure (conventions du modèle procédural), posées au repos avant les échelles de la race.
  const look0 = { headR: look.headR ?? 0.15, headLen: look.headLen ?? 0.48, bodyR: look.bodyR ?? 0.46, fluff: 1, neckLen: look.neckLen ?? 0.42 };
  const headAnchor = makeHeadAnchor(M, look0);
  const neckAnchor = makeNeckAnchor(M, look0);
  const restQ = (b) => b.getWorldQuaternion(new THREE.Quaternion());
  const place = (anchor, b, info) => {
    anchor.position.copy(toLocal(b, info.pos));
    anchor.quaternion.copy(restQ(b).invert().multiply(info.q));
    anchor.scale.setScalar(info.k);
    b.add(anchor);
  };
  place(headAnchor.obj, headB, headAnchor);
  place(neckAnchor.obj, neckB, neckAnchor);
  // Tête, oreilles, cornes et mamelle de la race (échelle des os : les clips n'animent pas d'échelle).
  headB.scale.setScalar(B.head);
  for (const e of [bone('earL'), bone('earR')]) if (e) e.scale.setScalar(B.ears);
  const pinv = (b) => base.rotW[base.parent[bones.indexOf(b)]].clone().invert();
  for (const [h, sgn] of [[bone('hornL'), 1], [bone('hornR'), -1]]) {
    // (sans cornes : chignon fait dans le gabarit, pollHorns — l'os garde sa taille, sa corne écrasée suit la tête)
    if (!h || S.poll) continue;
    const s = Math.max(1e-4, B.hornSize);
    // (cornes en lyre : refaites dans le gabarit, bendLongHorns ; ici leur taille seulement)
    h.scale.setScalar(s);
    const lyre = B.hornLong > 0;
    // (relevées vers le haut ou portées vers l'avant — Hérens, la lutteuse : axes de la vache)
    if (B.hornLift && !lyre) h.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(AZ.clone().applyQuaternion(pinv(h)), sgn * B.hornLift));
    if (B.hornFwd) h.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(AX.clone().applyQuaternion(pinv(h)), B.hornFwd));
    // (taureau : ses cornes partent sur le côté, la rotation autour de l'axe des flancs ne les avançait pas — tournées
    // aussi autour de la verticale, vers l'avant)
    if (B.hornFwd && base.kind === 'bull') h.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(AY.clone().applyQuaternion(pinv(h)), -sgn * B.hornFwd * 0.9));
  }
  const udderB = bone('udder');
  for (const b of bones) {
    b.userData.restP = b.position.clone();
    b.userData.restQ = b.quaternion.clone();
  }
  root.updateMatrixWorld(true);

  // Matière : le grain du GLB peint par le shader (uniformes propres à cette vache).
  const uniforms = makeCowUniforms();
  setCowCoat(uniforms, B, base.kind);
  uniforms.cLand.value.set(M.bellyY, M.topY, M.hipZ, M.shZ);
  // (haut du toupillon : le bas de la queue, ≈ 35 cm au-dessus du bout)
  uniforms.cKnee.value.set(M.kneeY[0], M.kneeY[1], M.kneeY[2], M.tailTip.y + 0.35);
  uniforms.cHead.value.set(M.eye.z, M.eye.y, M.noseZ, M.skull.y);
  uniforms.cEye.value.set(M.eyeL.c.x, M.eyeL.c.y, M.eyeL.c.z, base.kind === 'bull' ? 0.085 : 0.07);
  const { mat, depth } = cowMaterial(base.prim.material, uniforms);
  const hb = { box: new THREE.Box3(), sphere: new THREE.Sphere(), boneBox: S.boneBox, skeleton, meshes: [], anim: null, margin: 0.06 + (B.hair ?? 0) * 0.6 };
  const mesh = new SheepMesh(S.geo, mat, hb);
  mesh.name = base.kind === 'bull' ? 'bull' : 'cow';
  mesh.customDepthMaterial = depth;
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // (cible de forme « horns_long » du taureau : plus utilisée — ses cornes longues sont refaites en courbe dans le
  // gabarit, bendLongHorns)
  if (base.prim.morph) mesh.morphTargetInfluences = [0];
  root.add(mesh);
  hb.meshes.push(mesh);
  // Yeux de la vache (primitive à part, même squelette).
  let eyes = null;
  if (S.eyeGeo) {
    eyes = new SheepMesh(S.eyeGeo, cowEyeMaterial(base.eye.material), hb);
    eyes.name = 'cow_eyes';
    eyes.bind(skeleton, new THREE.Matrix4());
    eyes.castShadow = false;
    eyes.receiveShadow = true;
    root.add(eyes);
    hb.meshes.push(eyes);
  }
  // Poil long et frange (Highland) : mèches en cartes, liées au même squelette.
  let hair = null;
  const lockU = makeLockUniforms();
  const hairGeo = hairCards(base, S, B);
  if (hairGeo) {
    const c = new THREE.Color(B.colors.base);
    const hmat = lockMaterial(lockU, c, c.clone().lerp(new THREE.Color(0xe0a060), 0.14), 'cow_locks');
    hair = new SheepMesh(hairGeo, hmat, hb);
    hair.name = 'cow_hair';
    hair.bind(skeleton, new THREE.Matrix4());
    hair.castShadow = false;
    hair.receiveShadow = true;
    root.add(hair);
    hb.meshes.push(hair);
  }
  const L = (M.shZ - M.hipZ) + 0.9;
  const shadow = contactShadow(M.halfW + 0.06, L * 0.9);
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
  const tailB = bone('tail1');
  const ears = [bone('earL'), bone('earR')].filter(Boolean);
  ears.forEach((e, i) => {
    e.userData.side = i === 0 ? 1 : -1;
    e.userData.rest = e.rotation.clone();
  });
  // Repères dans le repère des ancres : bouche (friandises), dessus du crâne (accessoires), anneau du licol (longe).
  const ha = headAnchor.obj;
  const inA = (p) => headAnchor.toAnchor(p);
  const mouth = inA(M.nose.clone().add(V(0, -0.05, -0.025)));
  const skull = inA(M.skull);
  const leashPoint = new THREE.Object3D();
  leashPoint.name = 'leashPoint';
  ha.add(leashPoint);
  leashPoint.position.set(0, -look0.headR * 0.95, look0.headLen * 0.7 - look0.headR * 0.1);
  const tailTip = new THREE.Object3D();
  tailB?.add(tailTip);
  const tailEnd = bone(base.tailBones[base.tailBones.length - 1] ?? 'tail1');
  if (tailEnd) {
    tailEnd.add(tailTip);
    tailTip.position.copy(toLocal(tailEnd, M.tailTip));
  }
  // Mamelle : bas des trayons (traite : la main de la joueuse ; tétée : la bouche du veau).
  const udderPoint = new THREE.Object3D();
  udderPoint.name = 'udderPoint';
  const ub = udderB ?? bone('scrotum') ?? bone('pelvis');
  ub.add(udderPoint);
  udderPoint.position.copy(toLocal(ub, M.teat ?? V(0, M.bellyY - 0.1, M.hipZ + 0.1)));
  const model = {
    root,
    body: bone('root'),
    neck: neckAnchor.obj,
    head: ha,
    headBone: headB,
    neckBone: neckB,
    tail: tailB ?? bone('pelvis'),
    tailTip,
    tailBones: base.tailBones.map((nm) => bone(nm)).filter(Boolean),
    ears,
    legs,
    skeleton,
    bones,
    bone,
    mesh,
    coatMesh: mesh,
    eyes,
    hair,
    lockUniforms: lockU,
    udderBone: udderB,
    udderPoint,
    uniforms,
    build: B,
    size,
    kind: base.kind,
    // (interface du modèle procédural : hauteurs en unités « taille 1 » — taille du taureau comprise)
    y0: ((M.topY + M.bellyY) / 2) * size,
    legTop: M.bellyY * size,
    saddleY: M.topY * size,
    headHeight: Math.max(M.headY, M.skull.y) * size,
    headTilt: 0,
    snoutTip: [0, 0, 0],
    mouth,
    leashPoint,
    // (longueur mesurée, du bout du nez à la pointe des fesses — van, rayon — et mamelle, en long : tétée du veau)
    bodyLength: (M.noseZ - M.rearZ) * size,
    noseZ: M.noseZ * size,
    rumpZ: M.rearZ * size,
    halfWidth: M.halfW * size,
    udderZ: (M.teat?.z ?? M.hipZ + 0.1) * size,
    // (accessoires du salon : dessus du crâne et tour de tête dans le repère de l'ancre de la tête, bout de la queue)
    accessoryFit: { skull, headQ: headAnchor.qInv.clone(), mouth, headR: 0.13, tailTip },
    calf: B.stage === 'baby',
    stage: B.stage,
    bull: B.bull,
    male: B.male,
    realCow: true,
  };
  model.anim = new RealCowAnim(model, base, S);
  hb.anim = model.anim;
  model.bounds = hb;
  model.lodLevel = 0;
  model.setLod = (level) => {
    const l = S.lodGeo && level ? 1 : 0;
    if (l === model.lodLevel) return;
    model.lodLevel = l;
    mesh.geometry = l ? S.lodGeo : S.geo;
    if (eyes && S.eyeLod) eyes.geometry = l ? S.eyeLod : S.eyeGeo;
    // (au loin, les mèches du poil long ne se voient plus : la robe gonflée suffit)
    if (hair) hair.visible = !l;
  };
  model.staticPose = (kind = 'stand') => model.anim.staticPose(kind);
  model.photoPose = () => model.anim.staticPose('stand');
  // Mamelle : figée (vignette, look.udderFill), sinon celle de l'animal à chaque image (animateRealCow).
  model.udderFill = Number.isFinite(look.udderFill) ? look.udderFill : 0.5;
  model.setUdder = (f, now = true) => {
    model.udderFill = clamp(f, 0, 1);
    if (now) model.anim.applyFleece(1e9);
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

// ------------------------------------------------------------------ animation

/**
 * Allure d'une vache d'après la vitesse (m/s, ramenée à sa taille), avec hystérésis : seuils d'un bovin au garrot de
 * 1,40 m (pas → trot ≈ 1,9 m/s, trot → galop ≈ 3,4 m/s ; ceux du mouton sont faits pour 0,70 m).
 */
const COW_UP = { walk: 1.9, trot: 3.4 };
const COW_DOWN = { trot: 1.6, run: 3.0 };
export function pickCowGait(prev, u) {
  if (!(u >= 0.05)) return 'idle';
  let g = prev === 'idle' || !prev ? 'walk' : prev;
  for (let k = 0; k < 3; k++) {
    if (g === 'walk' && u > COW_UP.walk) g = 'trot';
    else if (g === 'trot' && u > COW_UP.trot) g = 'run';
    else if (g === 'run' && u < COW_DOWN.run) g = 'trot';
    else if (g === 'trot' && u < COW_DOWN.trot) g = 'walk';
  }
  return g;
}

/**
 * Mixeur d'une vache : celui du mouton (RealSheepAnim : allures sans glissement, postures et transitions de ruminant —
 * se coucher à genoux, se relever l'arrière d'abord —, regard, oreilles, sol, footLock), avec les gestes de la vache :
 * meugler, traite, queue qui chasse les mouches (balancement de toute la queue, et la vache qui se retourne vers son
 * flanc : clip tail_swish ou swat), brosse à vaches, manger à l'auge à sa hauteur, toilettage d'une copine, veau qui
 * gambade (calf_play) et tète (suckle), et la mamelle à la place de la toison.
 */
export class RealCowAnim extends RealSheepAnim {
  constructor(model, base, S) {
    super(model, base, S);
    for (const nm of ONCE_COW) {
      const a = this.actions[nm];
      if (!a) continue;
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
    }
    this.udder = model.udderFill ?? 0.5;
    this.mooOn = false;
    this.flyOn = null;
    this.swish = 0;
    this.skirt = (model.build.hair ?? 0) * 0.1;
    // (petit pas pour se replacer à l'arrêt : plus lent que celui du mouton, la vache est deux fois plus grande)
    this.stepT = 0.45;
    // (un sabot resté 40 cm derrière à l'arrêt revient en 0,8 s, pas en 0,45 s : il filait de 8 cm par image)
    this.stepRef = 0.22;
    // (sabot levé de 7 cm au petit pas : le postérieur, tourné à la hanche pour lever droit, montait à peine)
    this.stepLift = 0.07;
    // (sabot posé tenu tant que le clip ne l'a pas levé de 2,8 cm : la vache roule sur sa pince ; au seuil du mouton,
    // 1,6 cm, l'onglon repartait en avant de 1,2 à 1,6 cm en une image au début de la levée, encore au ras du sol)
    this.lockDown = [0.028, 0.012];
    // (couchée : les sabots des antérieurs repliés, sole tournée vers l'arrière, peuvent passer 2,5 cm dans l'herbe —
    // sinon ils portaient la vache au-dessus de ses avant-bras ; voir contactClass)
    this.lieSoleSlack = 0.025;
    // (poids de repos des os de la queue : le balancement s'ajoute à la pose du clip)
    this.tailK = model.tailBones.map((_, i, a) => 0.35 + 0.65 * (i / Math.max(1, a.length - 1)));
    // Membres allongés par le gabarit (sheepJoints : avant-bras et canon, jambe et canon × kc) : couchée, ils sont
    // ramenés à la longueur du modèle d'origine (échelle de l'avant-bras et de la jambe, qui portent le canon et le
    // pied), pour que la pose couchée du GLB tombe juste — sinon les membres repliés, plus longs, portaient la vache
    // 4 à 12 cm au-dessus du sol (veau : 12 cm), ou s'enfonçaient dans le sol.
    const H = base.heads;
    const span = (c) => H[c[1]].y - H[c[3]].y;
    const rise = (model.build.legs - 1) * span(base.legChains[0]);
    this.legFold = base.legChains.map((c) => ({ b: model.bones[c[1]], k: 1 / (1 + rise / Math.max(0.05, span(c))) }));
  }

  /** Points de contact au sol : ceux du mouton (tronc, tête), sans la mamelle (aplatie couchée, voir applyFleece). */
  contactClass(nm, head) {
    // (ni la mamelle, aplatie couchée, ni la queue, posée à plat dans l'herbe : elles portaient la vache couchée)
    if (nm === 'udder' || nm === 'scrotum' || /^tail/.test(nm)) return -1;
    // (couchée, la vache repose sur son poitrail, ses épaules, ses cuisses et ses avant-bras repliés — comme la pose
    // « lie » du GLB, posée ainsi dans Blender : tools/vache/make_cow.py, lie_gp ; sans les avant-bras et les canons,
    // le corps descendait jusqu'au ventre et les antérieurs repliés s'enfonçaient de 4 à 8 cm sous l'herbe. Les sabots,
    // les jambes et les canons des postérieurs, repliés sur le côté, ne portent rien.)
    if (!head && /^(humerus|radius|metacarpus|femur)[LR]$/.test(nm)) return 0;
    return super.contactClass(nm, head);
  }

  /** Mamelle (échelle de l'os, aplatie contre le ventre couchée) et poil long étalé au sol couché. */
  applyFleece(dt) {
    const md = this.model;
    if (!md?.build) return;
    const B = md.build;
    const target = clamp(md.udderFill ?? 0.5, 0, 1);
    this.udder = (this.udder ?? target) + (target - (this.udder ?? target)) * Math.min(1, dt * 0.8);
    const lie = (this.w.lie ?? 0) + (this.w.sleep ?? 0) + (this.w.ruminate ?? 0) + 0.6 * ((this.w.lie_down ?? 0) + (this.w.get_up ?? 0));
    const l = clamp(lie, 0, 1);
    const s = cowUdderScale(B, this.udder);
    // (os de la mamelle : couchée, elle s'étale contre le ventre au lieu de traverser le sol — le clip « lie » du GLB
    // l'aplatissait, mais les échelles animées sont retirées : cleanClips)
    md.udderBone?.scale.set(s * (1 + 0.15 * l), s * (1 - 0.65 * l), s * (1 + 0.15 * l));
    // (membres du gabarit ramenés à la longueur d'origine, couchée — voir le constructeur)
    const fold = clamp((this.w.lie ?? 0) + (this.w.sleep ?? 0) + (this.w.ruminate ?? 0) + (this.w.lie_down ?? 0) * this.transK('lie_down')
      + (this.w.get_up ?? 0) * (1 - this.transK('get_up')), 0, 1);
    for (const f of this.legFold ?? []) f.b.scale.setScalar(1 + (f.k - 1) * fold);
    if (md.uniforms) md.uniforms.cStyle.value.w = l;
    // (mèches du poil long couchée : à moitié repliées seulement, elles s'étalent dans l'herbe au lieu de disparaître)
    if (md.lockUniforms) md.lockUniforms.hState.value.y = l * 0.45;
  }

  /** Avancement (0-1) d'une transition jouée une fois (se coucher, se relever), 0 si elle ne joue pas. */
  transK(name) {
    const a = this.actions[name];
    if (!a || !(this.w[name] > 0)) return 0;
    return clamp(a.time / a.getClip().duration, 0, 1);
  }

  /**
   * (le mixeur du mouton tourne model.neck et model.head : chez la vache ce sont des ancres pour le licol et les
   * accessoires — le temps de son travail, il reçoit les os)
   */
  withBones(fn, neck = null) {
    const md = this.model;
    const n = md.neck;
    const h = md.head;
    md.neck = neck ?? md.neckBone ?? n;
    md.head = md.headBone ?? h;
    try {
      return fn();
    } finally {
      md.neck = n;
      md.head = h;
    }
  }

  overlay(dt, st, still) {
    this.withBones(() => super.overlay(dt, st, still));
    this.reach(dt, st, still);
    this.gestures(dt, st, still);
  }

  /**
   * Bouche amenée à une hauteur : le veau qui tète (trayon de sa mère, st.nurseY), la vache qui mange à l'auge (st.reachY :
   * le foin du râtelier, l'eau de l'abreuvoir). L'encolure plie jusqu'à ce que la bouche (monde) y arrive, corrigée d'une
   * image à l'autre (pas de cinématique inverse) ; la bouche est rendue dans this.mouthW (l'entité ajuste la place du
   * veau).
   */
  reach(dt, st, still) {
    const md = this.model;
    const want = st.action === 'nurse' ? st.nurseY : st.action === 'eat' ? st.reachY : null;
    const on = want != null && this.posture === 'stand' && !this.trans && !st.moving;
    this.reachK = (this.reachK ?? 0) + ((on ? 1 : 0) - (this.reachK ?? 0)) * (still ? 1 : Math.min(1, dt * 3));
    if (this.reachK < 0.01 || !md.neckBone || !md.headBone || !md.mouth) {
      this.reachK = on ? this.reachK : 0;
      this.reachBend = 0;
      this.mouthW = null;
      return;
    }
    this.reachBend ??= 0;
    this.turn(md.neckBone, AX, this.reachBend * this.reachK);
    if (st.action === 'nurse') this.turn(md.headBone, AX, -0.25 * this.reachK);
    md.head.updateWorldMatrix(true, false);
    const m = (this.mouthW ??= V()).copy(md.mouth);
    md.head.localToWorld(m);
    if (on) this.reachBend = clamp(this.reachBend + clamp((m.y - want) * 2.5, -0.1, 0.1) * Math.min(1, dt * 8), -0.9, 1.0);
  }

  /**
   * Gestes procéduraux de la vache par-dessus le clip : queue qui chasse les mouches (balancement qui part de la base et
   * court jusqu'au toupillon, de temps en temps, plus souvent l'été — st.flies), brosse à vaches (elle se frotte
   * l'encolure et le front, la tête qui monte et va de côté), toilettage d'une copine (elle lèche : mâchoire, tête
   * tendue vers elle).
   */
  gestures(dt, st, still) {
    const md = this.model;
    const t = this.t;
    const stand = this.posture === 'stand' && !this.trans;
    // Queue : coups réguliers (deux allers-retours) quand une mouche l'agace ; jamais couchée (à peine) ni au galop.
    const period = st.flies ? 5.5 : 9;
    const ph = ((t + (md.root.id % 7) * 1.3) % period) / period;
    const on = ph < 0.22 && this.gait !== 'run' && (stand || lying(this.posture));
    this.swish += ((on ? (lying(this.posture) ? 0.3 : 1) : 0) - this.swish) * (still ? 1 : Math.min(1, dt * 4));
    if (this.swish > 0.01) {
      const bones = md.tailBones;
      for (let i = 0; i < bones.length; i++) {
        const a = Math.sin(t * 7.5 - i * 0.55) * 0.32 * this.tailK[i] * this.swish;
        this.turn(bones[i], AY, a);
      }
    }
    if (!md.neckBone || !md.headBone) return;
    if (st.action === 'brush' && stand && !st.moving) {
      // (sous le rouleau de la brosse : l'encolure monte, la tête va de côté et revient)
      this.brushK = Math.min(1, (this.brushK ?? 0) + dt * 2);
    } else this.brushK = Math.max(0, (this.brushK ?? 0) - dt * 2);
    if (this.brushK > 0.01) {
      const k = this.brushK;
      this.turn(md.neckBone, AX, -0.35 * k);
      this.turn(md.neckBone, AY, Math.sin(t * 1.6) * 0.35 * k);
      this.turn(md.headBone, AZ, Math.sin(t * 1.6 + 0.8) * 0.25 * k);
    }
    if (st.action === 'groom' && stand && !st.moving) {
      const jaw = md.bone('jaw');
      if (jaw) this.turn(jaw, AX, (0.05 + 0.05 * Math.sin(t * 9)));
      this.turn(md.headBone, AX, 0.12 + Math.sin(t * 2.2) * 0.08);
    }
  }

  /**
   * Sol : comme le mouton ; le veau qui gambade est « en l'air » (ni posé ni tenu). Le museau qui broute est relevé par
   * la BASE de l'encolure (neck1) : la tête pend presque à la verticale sous le haut de l'encolure, qui ne pouvait que
   * l'avancer — la mâchoire du veau de Highland (grosse tête, pattes courtes) restait 8 cm sous l'herbe.
   */
  ground(st, dt = 0, moveClip = null) {
    const air = moveClip === 'calf_play' || (this.w?.calf_play ?? 0) > 0.3;
    this.withBones(() => super.ground(st, dt, air ? 'lamb_play' : moveClip), this.model.bone('neck1'));
  }

  /**
   * Une image. st : comme le mouton (v, moving, size, posture 'stand' | 'lie' | 'sleep', action 'graze' | 'eat' | 'milk'
   * | 'nurse' | 'play' | 'brush' | 'groom' | null, moo, fly (se retourner vers son flanc), flies (été), ruminate, sad,
   * look, noLock, quick, nurseY, reachY).
   */
  update(dt, st) {
    this.restorePose();
    this.t += dt;
    this.hold += dt;
    const size = clamp(st.size ?? 1, 0.15, 1.6);
    const u = st.moving ? (st.v * Math.sqrt(size)) / Math.sqrt(this.speedScale) : 0;
    const g = pickCowGait(this.gait, u);
    this.gait = g;
    const trick = this.trick && this.trick.age < 0.25 ? this.trick : null;
    if (this.trick) this.trick.age += dt;
    // Posture voulue (debout dès qu'elle bouge) ; transitions jouées une fois : se coucher (à genoux devant, puis
    // l'arrière) et se relever (l'arrière d'abord, un temps à genoux, puis l'avant).
    const want = st.moving || trick ? 'stand' : st.posture ?? 'stand';
    if (this.trans) {
      const a = this.actions[this.trans.name];
      if (!a || a.time >= a.getClip().duration - 0.04) {
        this.posture = this.trans.to;
        this.trans = null;
        this.hold = 0;
      }
    }
    if (!this.trans && want !== this.posture) {
      let tr = null;
      if (lying(want) && lying(this.posture)) this.posture = want;
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
    const standing = this.posture === 'stand' && !this.trans && !st.moving;
    // Meugler (encolure tendue, tête relevée, bouche ouverte) : joué une fois, debout à l'arrêt ; en marchant, la tête
    // se lève un instant (bleatWalk du mouton).
    const mo = this.actions.moo;
    if (st.moo && mo && !this.mooOn && !this.flyOn && standing) {
      mo.reset();
      mo.play();
      this.mooOn = true;
    }
    if (this.mooOn && (!mo || mo.time >= mo.getClip().duration - 0.05 || st.moving || this.posture !== 'stand')) this.mooOn = false;
    if (st.moo && st.moving) this.bleatWalk = 1.6;
    // Mouche sur le flanc : la vache se retourne (tail_swish de la vache, swat du taureau), une fois de temps en temps ;
    // le taureau secoue aussi la tête, une fois sur deux.
    const flyClip = this.actions.tail_swish ? 'tail_swish'
      : this.actions.head_shake && (this.flyN ?? 0) % 2 === 1 ? 'head_shake' : this.actions.swat ? 'swat' : null;
    if (st.fly && flyClip && !this.flyOn && !this.mooOn && standing && !st.action) {
      this.flyN = (this.flyN ?? 0) + 1;
      const a = this.actions[flyClip];
      a.reset();
      if (flyClip === 'tail_swish') a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.play();
      this.flyOn = flyClip;
    }
    if (this.flyOn) {
      const a = this.actions[this.flyOn];
      if (!a || a.time >= a.getClip().duration - 0.05 || st.moving || this.posture !== 'stand' || st.action) this.flyOn = null;
    }
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
      // (en se déplaçant, toujours l'allure, sabots tenus : la gambade jouée sur place glissait ; voir le mouton)
      moveClip = g === 'idle' ? 'walk' : g;
      target[moveClip] = 1;
      fadeK = 5;
    } else if (this.posture === 'lie') {
      target[st.ruminate && this.actions.ruminate ? 'ruminate' : 'lie'] = 1;
      fadeK = 1.5;
    } else if (this.posture === 'sleep') {
      target.sleep = 1;
      fadeK = 1.5;
    } else if (this.mooOn) {
      target.moo = 1;
      fadeK = 8;
    } else if (this.flyOn) {
      target[this.flyOn] = 1;
      fadeK = 5;
    } else if (st.action === 'nurse' && this.actions.suckle) {
      target.suckle = 1;
      fadeK = 3;
    } else if ((st.action === 'graze' || st.action === 'eat' || st.action === 'milk') && this.actions[st.action]) {
      target[st.action] = 1;
      fadeK = 2.5;
    } else if (st.action === 'play' && this.actions.calf_play) {
      target.calf_play = 1;
      fadeK = 3.5; // (voir le mouton : la tête qui broutait se relève en douceur)
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
      if (was < 0.02 && w >= 0.02 && MOVING.includes(name) && this.lead && this.lead !== name) {
        const from = this.actions[this.lead];
        if (from) a.time = (from.time / from.getClip().duration) * a.getClip().duration;
      }
      a.setEffectiveWeight(w);
      if (MOVING.includes(name)) {
        const nat = this.natural[name];
        // (arrêtée, l'allure qui s'efface est figée : voir le mouton ; en reculant, jouée à rebours)
        a.timeScale = st.moving ? Math.min(2.2 / Math.sqrt(Math.min(1, size)), Math.max(0.45, st.v / nat)) * (st.reverse ? -1 : 1) : 0;
        if (w > leadW) {
          lead = name;
          leadW = w;
        }
      } else if (trick && name === trick.clip) {
        a.timeScale = 0;
        a.time = trick.time * a.getClip().duration;
      } else if (this.trans?.name === name) {
        a.timeScale = st.moving ? 2.4 : st.quick ? 1.6 : 1;
      } else a.timeScale = name === 'calf_play' ? 1.05 : 1;
    }
    if (lead && leadW > 0.3) this.lead = lead;
    this.mixer.update(dt);
    this.savePose();
    this.applyShift();
    // (le regard et la mâchoire du mouton : à la traite et à la brosse, elle mâche)
    const action = st.action;
    const bleat = this.bleatOn;
    this.bleatOn = this.mooOn;
    if (action === 'milk') st.action = 'eat';
    this.overlay(dt, st, false);
    st.action = action;
    this.bleatOn = bleat;
    this.applyFleece(dt);
    this.ground(st, dt, moveClip);
  }
}

// ------------------------------------------------------------------ entité du jeu

const _wv = V();
const _iv = new THREE.Matrix4();
const _nv = V();
const _nt = V();

/**
 * Pose imposée par une activité (spectacle, concours) : 'come' (elle court : sabots libres, la scène déplace le modèle),
 * 'bow' (salut, s : 0-1 : elle baisse la tête, comme à l'auge). Renvoie false si ce n'est pas une vache réaliste.
 */
export function realCowPose(md, kind, s = 1, t = null) {
  if (!md?.realCow) return false;
  const a = md.anim;
  if (kind === 'come') a.noLockFor = 0.3;
  else if (kind === 'bow') a.trick = s > 0.05 ? { clip: 'eat', time: 0.25, age: 0 } : null;
  void t;
  return true;
}

/** Place du veau qui tète : à côté de sa mère, tourné vers sa croupe, la tête sous son ventre devant la mamelle. */
export function calfNurseSpot(e, mother, out) {
  const ms = (mother.scale ?? 1) * (mother.model?.size ?? 1);
  const ks = (e.scale ?? 1) * (e.model?.size ?? 1);
  const h = mother.heading ?? 0;
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  const side = e.nurseSide ?? 1;
  // (mamelle : 0,8 m derrière le milieu de la vache ; le museau du veau ≈ 1,0 × sa taille devant son milieu ; l'entité
  // corrige ensuite d'après la bouche mesurée)
  const back = -(mother.model?.udderZ ?? -0.8);
  const ux = mother.position.x - fx * back * ms;
  const uz = mother.position.z - fz * back * ms;
  const lat = 0.32 * ms + 0.12 * ks;
  out.set(ux + fx * 0.95 * ks + fz * side * lat, 0, uz + fz * 0.95 * ks - fx * side * lat);
  return h + Math.PI + side * 0.42;
}

/**
 * Corps d'une vache au sol (monde, mètres, dans son repère : x vers son flanc gauche, z vers l'avant) : demi-largeur du
 * tronc, bout du nez et pointe des fesses — le veau qui la rejoint la contourne au lieu de la traverser (AnimalEntity).
 */
export function calfMotherBox(mother) {
  const md = mother.model ?? {};
  const s = mother.scale ?? 1;
  return { halfW: (md.halfWidth ?? 0.34) * s, front: (md.noseZ ?? 1.15) * s, rear: (md.rumpZ ?? -1.1) * s };
}

/** Trayon où vient la bouche du veau (monde) : le bas de la mamelle de sa mère, de son côté. */
export function calfTeatPoint(e, mother, out) {
  const md = mother.model;
  if (!md?.udderPoint) return null;
  md.udderPoint.getWorldPosition(out);
  const ms = (mother.scale ?? 1) * (md.size ?? 1);
  const h = mother.heading ?? 0;
  const side = e.nurseSide ?? 1;
  out.x += Math.cos(h) * side * 0.06 * ms;
  out.z -= Math.sin(h) * side * 0.06 * ms;
  return out;
}

/**
 * Animation d'une entité (AnimalEntity) à la vache réaliste : ce qu'elle fait (allure selon sa vitesse, brouter, manger
 * à l'auge, brosse à vaches, couchée et ruminer, dormir, meugler, queue qui chasse les mouches, toilettage d'une copine,
 * traite, gambader et téter pour le veau, menée par le chien de troupeau) ; renseigne e.gait. La mamelle suit le lait de
 * l'animal à chaque image.
 */
export function animateRealCow(e, dt, sad) {
  const md = e.model;
  const anim = md.anim;
  const d = e.data;
  const scale = (e.scale ?? 1) * (md.size ?? 1);
  // Version réduite au loin.
  if (horseView.on && md.setLod && !md.lodHold) {
    const far = gfx.quality === 'high' ? COW_LOD_DIST.high : COW_LOD_DIST.low;
    const dist = _wv.setFromMatrixPosition(e.root.matrixWorld).distanceTo(horseView.eye) / Math.max(0.25, scale);
    md.setLod(dist > far * (md.lodLevel ? 0.9 : 1) ? 1 : 0);
  }
  // Mamelle : le lait de l'animal (pleine quand il est prêt, vide juste après la traite).
  if (md.build.milker) md.udderFill = cowUdderFill(d);
  // Traite (par la joueuse ou par l'aide : le lait retombe d'un coup) : elle reste debout, tranquille, quelques secondes.
  const prod = d.produce ?? 0;
  if (anim.lastProduce !== undefined && anim.lastProduce - prod > 25 && md.build.milker) {
    anim.milkT = 6;
    if (!e.scripted && !e.herdCtrl && !d.following) {
      e.state = 'idle';
      e.timer = Math.max(e.timer ?? 0, 6);
    }
  }
  anim.lastProduce = prod;
  if (anim.milkT > 0) anim.milkT -= dt;
  // Hors du champ et livrée à elle-même : animée une image sur OFFSCREEN_STEP avec le temps cumulé.
  if (anim.frame !== horseView.frame) {
    anim.frame = horseView.frame;
    anim.seenNow = false;
  }
  if (anim.seen) {
    anim.seenNow = true;
    anim.seen = false;
  }
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
  const st = (e.cowSt ??= {});
  e.restSeed ??= ((d.id?.charCodeAt?.(0) ?? 7) + (d.id?.charCodeAt?.(1) ?? 3)) * 1.37;
  const t = e.time ?? 0;
  const calf = md.calf;
  st.v = e.speed / Math.max(0.15, scale);
  st.moving = e.speed > 0.06 && e.perch?.phase !== 'on';
  st.size = scale;
  st.sad = sad;
  st.quick = !!e.posing;
  st.herd = !!e.herdCtrl;
  // (mouches : la vache sans bonnet anti-mouches les chasse plus souvent, une minute sur trois)
  st.flies = !d.gear?.flyMask && (e.time ?? 0) % 60 < 20;
  // (elle recule — hésitation au bas du pont du van : le pas est joué à rebours)
  const pp = e.root.position;
  if (anim.prevX !== undefined && dt > 0) {
    const fwd = ((pp.x - anim.prevX) * Math.sin(e.heading) + (pp.z - anim.prevZ) * Math.cos(e.heading)) / dt;
    anim.backing = e.speed > 0.06 && fwd < -0.05;
  }
  anim.prevX = pp.x;
  anim.prevZ = pp.z;
  st.reverse = !!anim.backing;
  const idle = e.state === 'idle' && !e.herdCtrl && !e.scripted && !d.following && !st.moving;
  // Couchée : endormie, ou au repos (elle rumine) ; une vache qui vient de dormir reste couchée quand on s'approche.
  if (e.sleeping) anim.sleptAt = t;
  const justWoke = anim.sleptAt !== undefined && t - anim.sleptAt < 12;
  // (une vache dont le veau tète reste debout : nursedFor, compté par le veau)
  if (e.nursedFor > 0) e.nursedFor -= dt;
  const restLie = idle && !(anim.milkT > 0) && !(e.nursedFor > 0) && Math.sin(t * 0.04 + e.restSeed) > 0.62;
  let posture = 'stand';
  if (e.sleeping) posture = 'sleep';
  else if (!st.moving && !e.scripted && !e.herdCtrl && !(anim.milkT > 0) && (justWoke || restLie || (lying(anim.posture) && anim.hold < 6))) posture = 'lie';
  st.posture = posture;
  st.ruminate = posture === 'lie' && Math.sin(t * 0.12 + e.restSeed * 0.7) > -0.25;
  // Gestes : traite, manger à l'auge ou se frotter à la brosse, téter (veau près de sa mère), toilettage, gambader,
  // brouter au repos.
  let action = null;
  const mother = calf && e.state === 'mother' ? e.partner : null;
  e.nursing = null;
  st.nurseY = null;
  st.reachY = null;
  let nurseV = 0;
  const mAnim = mother?.model?.anim;
  const eq = e.goal?.eq?.type ?? null;
  if (anim.milkT > 0 && !st.moving) action = 'milk';
  else if (e.state === 'eat') {
    action = eq === 'cowBrush' ? 'brush' : 'eat';
    if (FEED_Y[eq]) st.reachY = FEED_Y[eq];
  } else if (mother && !st.moving && !mother.sleeping && (mother.speed ?? 0) < 0.1 && (!mAnim || (mAnim.posture === 'stand' && !mAnim.trans))
    && Math.hypot(mother.position.x - e.root.position.x, mother.position.z - e.root.position.z) < 2.6 * Math.max(0.6, mother.scale ?? 1)) {
    action = 'nurse';
    // (il se glisse à côté de sa mère — au pas, sabots posés —, la tête sous son ventre devant la mamelle ; elle reste
    // debout et tranquille tant qu'il tète)
    e.nursing = mother;
    mother.nursedFor = 1.5;
    nurseSideOf(e, mother); // (jumeaux : chacun son côté)
    const want = calfNurseSpot(e, mother, _nv);
    const p = e.root.position;
    const k = Math.min(1, dt * 2);
    const teat = calfTeatPoint(e, mother, _nt);
    const m = anim.mouthW;
    if (teat && m && Math.hypot(_nv.x - p.x, _nv.z - p.z) < 1.0) _nv.set(p.x + teat.x - m.x, 0, p.z + teat.z - m.z);
    st.nurseY = teat ? teat.y : null;
    const dx = clamp((_nv.x - p.x) * k, -dt * 0.5, dt * 0.5);
    const dz = clamp((_nv.z - p.z) * k, -dt * 0.5, dt * 0.5);
    p.x += dx;
    p.z += dz;
    nurseV = Math.hypot(dx, dz) / Math.max(1e-4, dt);
    let diff = want - e.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    e.heading += diff * Math.min(1, dt * 3);
    e.root.rotation.y = e.heading;
    if (mother.state === 'idle' || mother.state === 'walk') {
      mother.state = 'idle';
      mother.timer = Math.max(mother.timer ?? 0, 3);
    }
  } else if (e.state === 'groom' && e.partner && !st.moving) {
    // (deux vaches se lèchent l'encolure : la tête tournée vers la copine)
    action = 'groom';
  } else if (idle && (calf || e.stage === 'young') && Math.sin(t * 0.35 + e.restSeed * 1.3) > 0.8) action = 'play';
  else if (idle && Math.sin(t * 0.27 + (e.phase ?? 0)) > -0.15) action = 'graze';
  st.action = action;
  if (nurseV > 0.06) {
    st.moving = true;
    st.v = Math.max(st.v, nurseV / Math.max(0.15, scale));
  }
  // Meugler : quand elle se fait entendre (AnimalEntity.speak).
  st.moo = e.spokeAt !== undefined && e.spokeAt !== anim.spokeSeen;
  anim.spokeSeen = e.spokeAt;
  // Mouche sur le flanc : de temps en temps, debout au repos, elle se retourne et chasse de la queue.
  st.fly = idle && !action && Math.sin(t * 0.21 + e.restSeed * 2.1) > 0.97;
  // Regard : la joueuse proche (ou la copine qu'elle lèche), dans le repère de la vache.
  st.look = null;
  const lookAt = action === 'groom' ? e.partner?.position : e.playerAt && e.distPlayer < 6 && !e.scripted ? e.playerAt : null;
  if (lookAt) {
    _iv.copy(e.root.matrixWorld).invert();
    st.look = (st.lookV ??= V()).copy(lookAt).setY(lookAt.y + (action === 'groom' ? 1.0 : 1.4)).applyMatrix4(_iv);
  }
  if (anim.noLockFor > 0) anim.noLockFor -= dt;
  st.noLock = !!e.scripted || anim.noLockFor > 0;
  anim.update(dt, st);
  e.gait = anim.gait === 'run' ? 2 : anim.gait === 'trot' ? 1 : 0;
  e.headDown = action === 'graze' || action === 'eat' ? 1 : 0;
  e.lie = lying(anim.posture) ? 1 : 0;
}
