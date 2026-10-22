// Chèvres réalistes : un modèle d'artiste pour les 4 races et les chevreaux — « Goat_White_01 » de la Microsoft Rocketbox
// Avatar Library (MIT, © 2020 Microsoft), avec les cornes arquées de « Goat_Brown_01 » en cible de forme, préparé et
// animé pour le jeu (public/models/goat.glb, tools/chevre/).
//
// Construit comme le mouton réaliste (sheepReal.js, dont il reprend le module commun : gabarits, mesures, boîte qui suit
// la pose, mixeur d'un ruminant — allures sans glissement, couché/relevé à genoux, sol, footLock) : le GLB n'est qu'une
// source, dont on tire une fois la géométrie de repos, le squelette, les clips, la cible de forme des cornes et les
// régions de la robe (d'après les os). Chaque gabarit (race et stade) a sa géométrie, partagée ; chaque chèvre a son
// squelette (tête, oreilles, cornes, barbe et mamelle à sa taille), sa matière (robe peinte par goatCoat.js) et son
// mixeur. La mamelle suit le lait du jeu à chaque image (pleine, vide après la traite).
//
// En plus du mouton : se dresser contre la barrière de la bergerie pour brouter en hauteur (rear_up, browse_up,
// rear_down — jamais sans barrière), coup de tête entre chèvres qui jouent, traite (debout, la tête tournée vers la
// trayeuse), chevreau qui gambade et tète sous le ventre de sa mère, saut des tours et de l'agility.
//
// Interface : la même que la chèvre procédurale (animalModel.js), qui reste le modèle de repli tant que le GLB n'est pas
// là (et dans les tests sans GLB). Repère : regard vers +Z, y vers le haut, origine au sol sous le milieu du corps ;
// chèvre « de taille 1 » (garrot 0,75 m). model.head et model.neck sont des ancres aux conventions du modèle procédural
// (tête : origine au milieu de la tête, +z vers le museau ; encolure : +y le long du cou, crête en −z) : le licol, les
// accessoires du salon et le nœud du concours s'y posent sans code à eux.

import * as THREE from 'three';
import { getModel } from '../assets.js';
import { gfx } from '../gfx.js';
import { horseView } from './horseReal.js';
import { goatBuild, goatUdderFill, udderScale } from '../../sim/goatLook.js';
import { makeGoatUniforms, setGoatCoat, goatMaterial } from './goatCoat.js';
import { lockCards, spreadLocks, lockMaterial, makeLockUniforms, lockHash } from './ruminantHair.js';
import { fitRuminantHead } from './ruminantGear.js';
import {
  cleanClips, emptyBoneBoxes, growBoneBoxes, measureSheep, sheepJoints, contactShadow, SheepMesh, RealSheepAnim, pickSheepGait, lying,
  smoothNormals, nurseSideOf, lodScale,
} from './sheepReal.js';

/** Clé du GLB (assets.js) : jamais « goat » (gltfAnimal.js le prendrait pour un animal GLB générique). */
export const REAL_GOAT_KEY = 'goat_real';
/**
 * Version réduite au-delà de cette distance à la caméra (m, allongée pour une grande chèvre, jamais raccourcie pour un
 * chevreau — lodScale) ; hystérésis 10 %. En basse, 15 m, comme le mouton : à 7 m, la caméra normale du téléphone ne
 * voyait que des chèvres réduites, sans leur poil long, animées une image sur deux.
 */
export const GOAT_LOD_DIST = { low: 15, high: 18 };
/** Chèvre hors du champ : animée une image sur OFFSCREEN_STEP, avec le temps cumulé. */
export const OFFSCREEN_STEP = 3;
/** Au loin (version réduite), animée une image sur FAR_STEP. */
export const FAR_STEP = 2;
/** Vitesses « naturelles » des allures (m/s, chèvre de taille 1) si le GLB ne les donne pas. */
export const NATURAL_SPEED = { walk: 0.916, trot: 2.015, run: 4.464 };
/** Hauteur du dessus de la lisse haute de la barrière de la bergerie (farmLayout.js : lisses à 0,45 et 0,90 m). */
export const FENCE_RAIL = 0.95;

const LEG_KEYS = [['FL', 'L', true], ['FR', 'R', true], ['HL', 'L', false], ['HR', 'R', false]];
const LEG_BONES = { front: ['humerus', 'radius', 'metacarpus', 'toes'], hind: ['femur', 'tibia', 'metatarsus', 'htoes'] };
const ONCE_GOAT = ['rear_up', 'rear_down', 'headbutt', 'climb'];
const MOVING = ['walk', 'trot', 'run'];
const HIND = [2, 3]; // (membres : 0 et 1 antérieurs, 2 et 3 postérieurs)
const HEAD_BONES = new Set(['head', 'jaw', 'earL', 'earR', 'eyeL', 'eyeR', 'beard', 'hornL', 'hornR']);
const LEG_LOW = /^(radius|metacarpus|toes|tibia|metatarsus|htoes)/;
const HOOF = /^(toes|htoes)/;
const TRUNK_W = { root: 1, pelvis: 1, spine1: 1, spine2: 1, chest: 1, neck1: 0.8, tail1: 0.3, scapL: 0.6, scapR: 0.6, femurL: 0.55, femurR: 0.55, humerusL: 0.3, humerusR: 0.3 };

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const X_AXIS = V(1, 0, 0);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const _v = V();
const _w = V();
const _q = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();

// ------------------------------------------------------------------ données de repos (une fois par GLB)

const DEFAULT_MEANS = [0.5, 0.36, 0.28, 0.14];

/** Luminance moyenne (linéaire) de la texture par région : corps, tête, pattes, cornes (grain du shader). */
function goatTextureMeans(map, uv, mask, part, n) {
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
    const acc = [0, 0, 0, 0];
    const cnt = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const u = uv[i * 2];
      const v = map.flipY ? 1 - uv[i * 2 + 1] : uv[i * 2 + 1];
      const x = clamp(Math.floor(u * S), 0, S - 1);
      const y = clamp(Math.floor(v * S), 0, S - 1);
      const o = (y * S + x) * 4;
      const l = 0.2126 * lin(px[o]) + 0.7152 * lin(px[o + 1]) + 0.0722 * lin(px[o + 2]);
      const k = part[i * 4] > 0.7 ? 3 : mask[i * 4 + 1] > 0.7 ? 1 : mask[i * 4 + 2] > 0.7 ? 2 : mask[i * 4] > 0.7 ? 0 : -1;
      if (k < 0 || l < 0.02) continue;
      acc[k] += l;
      cnt[k]++;
    }
    return acc.map((a, k) => (cnt[k] > 4 ? a / cnt[k] : DEFAULT_MEANS[k]));
  } catch {
    return DEFAULT_MEANS;
  }
}

/**
 * Géométrie, squelette, clips, cornes arquées (cible de forme) et régions de la robe tirés du GLB de la chèvre, dans le
 * repère de la chèvre (flottants : les positions du fichier sont quantifiées). Gardé dans gltf.userData.
 * Régions (attribut goatMask) : x corps, y tête (tête, mâchoire, oreilles, yeux, barbe, cornes), z bas des membres
 * (avant-bras, canon, pied ; jambe, canon, pied), w onglons ; goatPart : x cornes, y mamelle, z barbe, w part portée par
 * le tronc (poil long).
 */
export function realGoatBase(gltf) {
  if (gltf.userData.goatBase) return gltf.userData.goatBase;
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const toGoat = scene.matrixWorld.clone().invert();
  let master = null;
  let lodMesh = null;
  scene.traverse((o) => {
    if (o.isSkinnedMesh) {
      if (/lod/.test(o.name) || o.userData?.lod || /lod/.test(o.parent?.name ?? '')) lodMesh = o;
      else if (!master) master = o;
    }
  });
  if (!master) throw new Error('Chèvre réaliste : maillage introuvable');
  const bones = master.skeleton.bones;
  const names = bones.map((b) => b.name);
  const index = new Map(names.map((nm, i) => [nm, i]));
  const nb = bones.length;
  const restW = bones.map((b) => new THREE.Matrix4().multiplyMatrices(toGoat, b.matrixWorld));
  const heads = restW.map((m) => V().setFromMatrixPosition(m));
  const rotW = restW.map((m) => new THREE.Quaternion().setFromRotationMatrix(_m4.extractRotation(m)));
  const parent = bones.map((b) => (b.parent?.isBone && index.has(b.parent.name) ? index.get(b.parent.name) : -1));

  const g = master.geometry;
  const n = g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const dPos = new Float32Array(n * 3);
  const dNrm = new Float32Array(n * 3);
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const uv = new Float32Array(n * 2);
  const sk = master.skeleton;
  const sIdx = g.attributes.skinIndex;
  const sWgt = g.attributes.skinWeight;
  const mp = g.morphAttributes?.position?.[0] ?? null;
  const mn = g.morphAttributes?.normal?.[0] ?? null;
  const toM = new THREE.Matrix4().multiplyMatrices(toGoat, master.matrixWorld);
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
    _m4.multiplyMatrices(toM, master.bindMatrixInverse).multiply(acc).multiply(master.bindMatrix);
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
  // Régions de la robe d'après les os qui portent chaque sommet.
  const mask = new Float32Array(n * 4);
  const part = new Float32Array(n * 4);
  const domBone = new Uint16Array(n);
  const trunk = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let head = 0;
    let leg = 0;
    let toes = 0;
    let best = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw[i * 4 + k];
      const nmb = names[si[i * 4 + k]];
      if (HEAD_BONES.has(nmb)) head += w;
      if (LEG_LOW.test(nmb)) leg += w;
      if (HOOF.test(nmb)) toes += w;
      if (nmb === 'hornL' || nmb === 'hornR') part[i * 4] += w;
      else if (nmb === 'udder') part[i * 4 + 1] += w;
      else if (nmb === 'beard') part[i * 4 + 2] += w;
      part[i * 4 + 3] += w * (TRUNK_W[nmb] ?? 0);
      if (w > sw[i * 4 + best]) best = k;
    }
    domBone[i] = si[i * 4 + best];
    // (cible « cornes arquées » : prise sur la chèvre brune, dont le corps diffère un peu du nôtre — le ventre de la
    // chèvre couchée passait 3 cm sous le sol — : gardée sur la tête seulement)
    const keep = clamp((head - 0.2) / 0.5, 0, 1);
    if (keep < 1) {
      for (let c = 0; c < 3; c++) {
        dPos[i * 3 + c] *= keep;
        dNrm[i * 3 + c] *= keep;
      }
    }
    // (onglons : le bas du pied, sous 4,5 cm)
    const hoof = toes * (1 - clamp((pos[i * 3 + 1] - 0.03) / 0.025, 0, 1));
    mask.set([clamp(1 - Math.max(head, leg), 0, 1), clamp(head, 0, 1), clamp(leg, 0, 1), clamp(hoof, 0, 1)], i * 4);
    trunk[i] = part[i * 4 + 3];
  }
  const idx = Uint32Array.from(g.index.array);
  const lodIndex = lodMesh && lodMesh.geometry.attributes.position.count === n && lodMesh.geometry.index ? Uint32Array.from(lodMesh.geometry.index.array) : null;
  for (const key of ['map', 'normalMap']) if (master.material[key]) master.material[key].userData.shared = true;
  const B = (nmb) => index.get(nmb) ?? -1;
  const legChains = LEG_KEYS.map(([, s, front]) => (front ? LEG_BONES.front : LEG_BONES.hind).map((b) => B(b + s)));
  const ext = scene.userData?.goat ?? {};
  const natural = { ...NATURAL_SPEED, ...(ext.naturalSpeeds ?? {}) };
  const base = {
    names, index, parent, heads, rotW, nb,
    prim: { pos, nrm, dPos, dNrm, si, sw, uv, mask, part, trunk, index: idx, lodIndex, count: n, material: master.material, domBone },
    clips: cleanClips(gltf.animations),
    natural,
    legChains,
    extras: ext,
    // (sabots antérieurs de la chèvre dressée contre la barrière : [en avant de l'origine, hauteur], m)
    browseHoof: ext.browse?.hoof ?? [0.29, 0.936],
    means: goatTextureMeans(master.material.map, uv, mask, part, n),
    shapes: new Map(),
  };
  gltf.userData.goatBase = base;
  return base;
}

// ------------------------------------------------------------------ gabarit (une fois par race et stade)

/** Géométries (partagées) d'un gabarit, ses articulations et ses mesures. */
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
    goatMask: new THREE.BufferAttribute(P.mask, 4),
    goatPart: new THREE.BufferAttribute(P.part, 4),
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
  // (boîtes de repos par os, cornes arquées et poil long compris : élimination hors champ)
  const boxPos = new Float32Array(pos);
  for (let i = 0; i < n * 3; i++) boxPos[i] += P.dPos[i];
  const boneBox = growBoneBoxes(growBoneBoxes(emptyBoneBoxes(base.nb), pos, P.si, P.sw, n), boxPos, P.si, P.sw, n);
  const measure = measureSheep(base, pos, J.heads);
  // (yeux : les sommets portés par les os des yeux)
  const eyeB = [base.index.get('eyeL'), base.index.get('eyeR')].filter((x) => x !== undefined);
  if (eyeB.length) {
    const acc = V();
    let c = 0;
    for (let i = 0; i < n; i++) {
      if (!eyeB.includes(P.domBone[i])) continue;
      acc.add(_v.set(0, pos[i * 3 + 1], pos[i * 3 + 2]));
      c++;
    }
    if (c > 2) measure.eye.copy(acc.multiplyScalar(1 / c));
  }
  measure.muzzle = muzzleRing(P, pos, measure);
  S = { key, heads: J.heads, D: J.D, rise: J.rise, pos, geo, lodGeo, boneBox, measure };
  base.shapes.set(key, S);
  return S;
}

/**
 * Poil long (poitevine, col noir) : des mèches effilées et ondulées (ruminantHair.js) pendent des flancs, du dos, de la
 * croupe et de l'arrière des cuisses — semées à espacement régulier, jamais en rang sous le ventre (la « jupe » de
 * rectangles noirs de la première version). Géométrie partagée par gabarit, motif et longueur ; hairSide : zone de la
 * robe (0 foncée, 1 claire). Renvoie null sans poil long.
 */
function hairCards(base, S, B) {
  if (!(B.long > 0.005)) return null;
  const key = `${B.pattern}|${B.long.toFixed(3)}`;
  S.hair ??= new Map();
  if (S.hair.has(key)) return S.hair.get(key);
  const P = base.prim;
  const n = P.count;
  const pos = S.pos;
  const M = S.measure;
  // (normales lissées : les mèches partent d'une peau sans arêtes)
  P.smoothN ??= smoothNormals(P.pos, P.nrm, n, 0.06);
  const Hh = Math.max(0.05, M.topY - M.bellyY);
  const femur = new Set(['femurL', 'femurR'].map((nm) => base.index.get(nm)));
  const edge = M.hipZ + (M.shZ - M.hipZ) * 0.42;
  const cand = [];
  for (let i = 0; i < n; i++) {
    if (P.mask[i * 4 + 1] > 0.3 || P.part[i * 4 + 1] > 0.15 || P.part[i * 4 + 2] > 0.15 || P.mask[i * 4 + 3] > 0.1) continue;
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    const ny = P.smoothN[i * 3 + 1];
    if (ny < -0.45) continue; // (pas sous le ventre)
    let fw = 0;
    for (let k = 0; k < 4; k++) if (femur.has(P.si[i * 4 + k])) fw += P.sw[i * 4 + k];
    const hl = (y - M.bellyY) / Hh;
    // (poitevine : le poil long couvre le dos, la croupe et le haut des flancs, pas le bas au-dessus du ventre clair)
    const body = P.part[i * 4 + 3] > 0.6 && P.mask[i * 4 + 2] < 0.3 && hl > (B.pattern === 'poitevine' ? 0.32 : -0.15);
    const thigh = fw > 0.3 && z < M.hipZ + 0.06 && y > M.kneeY[1] + 0.04;
    if (body || thigh) cand.push({ i, hl, thigh });
  }
  const picks = spreadLocks(cand, pos, 0.036, 400).map(({ i, hl, thigh }) => {
    const z = pos[i * 3 + 2];
    let side = 0;
    if (B.pattern === 'colnoir') side = z > edge ? 0 : 1;
    else if (B.pattern === 'poitevine') side = hl < 0.08 ? 1 : 0;
    return {
      i,
      // (poitevine : poil long sur le dos et la croupe, plus court en bas des flancs — il ne pend pas en languettes noires
      // sur le ventre clair ; col noir : plus long en bas, la jupe)
      len: B.long * (thigh ? 1.1 : B.pattern === 'poitevine' ? 0.55 + 0.55 * Math.min(1, Math.max(0, hl)) : 0.62 + 0.5 * (1 - Math.min(1, Math.max(0, hl))))
        * (0.85 + 0.3 * lockHash(i + 5)),
      w: 0.07 + 0.022 * lockHash(i + 9),
      back: thigh ? 0.45 : 0.1,
      side,
    };
  });
  const geo = lockCards(picks, { pos, nrm: P.smoothN, si: P.si, sw: P.sw }, 0.008);
  S.hair.set(key, geo);
  return geo;
}

/** Tour du museau (licol) : centre et rayon de la coupe de la tête 4 cm derrière le bout du nez (au repos ; repris par la vache). */
export function muzzleRing(P, pos, M) {
  const n = P.count;
  const axis = V().subVectors(M.nose, M.eye).normalize();
  const c0 = M.nose.clone().addScaledVector(axis, -0.045);
  const ring = [];
  for (let i = 0; i < n; i++) {
    if (P.mask[i * 4 + 1] < 0.5 || P.part[i * 4] > 0.3 || P.part[i * 4 + 2] > 0.3) continue;
    _v.fromArray(pos, i * 3);
    const d = _w.subVectors(_v, c0).dot(axis);
    if (Math.abs(d) < 0.014) ring.push(_v.clone().addScaledVector(axis, -d));
  }
  if (ring.length < 4) return { center: c0, axis, radius: 0.045 };
  const center = ring.reduce((a, p) => a.add(p), V()).multiplyScalar(1 / ring.length);
  const radius = ring.reduce((a, p) => a + p.distanceTo(center), 0) / ring.length;
  return { center, axis, radius };
}

// ------------------------------------------------------------------ construction

/** Le GLB de la chèvre est-il chargé ? */
export const realGoatReady = () => !!getModel(REAL_GOAT_KEY);

/**
 * Construit la chèvre réaliste (ou null si son GLB n'est pas chargé : on prend alors la chèvre procédurale).
 * look : la robe de l'animal (look.kid : chevreau, look.young : jeune, look.sex : 'm' pour le bouc, look.udderFill :
 * mamelle figée 0-1 pour une vignette) ; breedId : sa race (anciennes sauvegardes) ; gltf : le GLB (tests).
 */
export function buildRealGoatModel(look, breedId = null, gltf = null) {
  const src = gltf ?? getModel(REAL_GOAT_KEY);
  if (!src) return null;
  const base = realGoatBase(src);
  const stage = look.kid ? 'baby' : look.young ? 'young' : 'adult';
  const B = goatBuild(look, { breed: breedId, stage, sex: look.sex ?? 'f' });
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
  const neckB = bone('neck2') ?? bone('neck1');
  // Ancres de la tête et de l'encolure (conventions du modèle procédural), posées au repos avant les échelles de la race.
  const look0 = { headR: look.headR ?? 0.075, headLen: look.headLen ?? 0.24, bodyR: look.bodyR ?? 0.19, fluff: look.fluff ?? 1, neckLen: look.neckLen ?? 0.3 };
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
  // Licol mesuré sur la tête du gabarit (ruminantGear.js), une fois par gabarit : le licol générique, taillé pour la
  // tête procédurale, passait sous la peau (il n'en restait qu'un V rouge sur le nez).
  S.headFit ??= fitRuminantHead(base, S, 'goat', (p) => toLocal(headB, p));
  // Tête, oreilles, cornes, barbe et mamelle de la race (échelle des os : les clips n'animent pas d'échelle).
  headB.scale.setScalar(B.head);
  for (const e of [bone('earL'), bone('earR')]) if (e) e.scale.setScalar(B.ears);
  for (const h of [bone('hornL'), bone('hornR')]) if (h) h.scale.setScalar(Math.max(1e-4, B.hornSize));
  if (bone('beard')) bone('beard').scale.setScalar(Math.max(1e-4, B.beardSize));
  const udderB = bone('udder');
  for (const b of bones) {
    b.userData.restP = b.position.clone();
    b.userData.restQ = b.quaternion.clone();
  }
  root.updateMatrixWorld(true);

  // Matière : la photo du GLB recolorée (uniformes propres à cette chèvre).
  const uniforms = makeGoatUniforms();
  setGoatCoat(uniforms, B);
  uniforms.gMeans.value.set(...base.means);
  uniforms.gLand.value.set(M.bellyY, M.topY, M.hipZ, M.shZ);
  uniforms.gKnee.value.set(M.kneeY[0], M.kneeY[1], M.kneeY[2], (M.hipZ + M.shZ) / 2);
  uniforms.gHead.value.set(M.eye.z, M.eye.y, M.noseZ, M.skull.y);
  const { mat, depth } = goatMaterial(base.prim.material, uniforms);
  const hb = { box: new THREE.Box3(), sphere: new THREE.Sphere(), boneBox: S.boneBox, skeleton, meshes: [], anim: null };
  const mesh = new SheepMesh(S.geo, mat, hb);
  mesh.name = 'goat';
  mesh.customDepthMaterial = depth;
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // (cornes : droites de la chèvre blanche, ou arquées de la brune)
  mesh.morphTargetInfluences = [B.hornBack];
  root.add(mesh);
  hb.meshes.push(mesh);
  // Poil long (poitevine, col noir) : mèches en cartes, liées au même squelette.
  let hair = null;
  const lockU = makeLockUniforms();
  const hairGeo = hairCards(base, S, B);
  if (hairGeo) {
    const c = B.colors;
    const hmat = lockMaterial(lockU, B.pattern === 'poitevine' ? c.base : c.dark, c.light, 'goat_locks');
    hair = new SheepMesh(hairGeo, hmat, hb);
    hair.name = 'goat_hair';
    hair.bind(skeleton, new THREE.Matrix4());
    hair.castShadow = false;
    hair.receiveShadow = true;
    root.add(hair);
    hb.meshes.push(hair);
  }
  const L = (M.shZ - M.hipZ) + 0.45;
  const shadow = contactShadow(M.halfW + 0.04, L * 0.9);
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
  const mouth = inA(M.nose.clone().add(V(0, -0.025, -0.012)));
  const skull = inA(M.skull);
  const leashPoint = new THREE.Object3D();
  leashPoint.name = 'leashPoint';
  ha.add(leashPoint);
  // (anneau du licol sous le menton, mesuré : la longe s'y attache)
  leashPoint.position.copy(inA(S.headFit.leash));
  const tailTip = new THREE.Object3D();
  tailB?.add(tailTip);
  if (tailB) tailTip.position.copy(toLocal(tailB, M.tailTip));
  const model = {
    root,
    body: bone('root'),
    neck: neckAnchor.obj,
    head: ha,
    headBone: headB,
    neckBone: neckB,
    tail: tailB ?? bone('pelvis'),
    tailTip,
    ears,
    legs,
    skeleton,
    bones,
    bone,
    mesh,
    coatMesh: mesh,
    hair,
    lockUniforms: lockU,
    udderBone: udderB,
    uniforms,
    build: B,
    size,
    // (interface du modèle procédural : hauteurs en unités « taille 1 » — taille du bouc comprise)
    y0: ((M.topY + M.bellyY) / 2) * size,
    legTop: M.bellyY * size,
    saddleY: M.topY * size,
    headHeight: Math.max(M.headY, M.skull.y) * size,
    headTilt: 0,
    snoutTip: [0, 0, 0],
    mouth,
    leashPoint,
    // (accessoires du salon : dessus du crâne et tour de tête dans le repère de l'ancre de la tête, bout de la queue)
    accessoryFit: { skull, headQ: headAnchor.qInv.clone(), mouth, headR: 0.065, tailTip },
    // (licol posé sur la tête mesurée : gearModels.js, buildRuminantGear)
    headFit: { ...S.headFit, bone: headB },
    kid: B.stage === 'baby',
    stage: B.stage,
    buck: B.buck,
    realGoat: true,
    // (sabots antérieurs de la chèvre dressée : en avant de l'origine, hauteur — taille 1)
    browseHoof: base.browseHoof,
  };
  model.anim = new RealGoatAnim(model, base, S);
  hb.anim = model.anim;
  model.bounds = hb;
  model.lodLevel = 0;
  model.setLod = (level) => {
    const l = S.lodGeo && level ? 1 : 0;
    if (l === model.lodLevel) return;
    model.lodLevel = l;
    mesh.geometry = l ? S.lodGeo : S.geo;
    // (au loin, les mèches du poil long ne se voient plus)
    if (hair) hair.visible = !l;
  };
  model.staticPose = (kind = 'stand') => model.anim.staticPose(kind);
  model.photoPose = () => model.anim.staticPose('stand');
  // Mamelle : figée (vignette, look.udderFill), sinon celle de l'animal à chaque image (animateRealGoat).
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

/**
 * Ancre de la tête : origine et orientation pour que le licol générique (gearModels.js : muserolle à 0,7 × headLen
 * devant l'origine, de rayon 0,9 × headR) tombe sur le museau mesuré ; +z le long du chanfrein, +y vers le dessus du
 * crâne. k : échelle de l'ancre (rayon du museau ÷ rayon de la muserolle).
 */
export function makeHeadAnchor(M, look) {
  const mz = M.muzzle;
  const k = clamp((mz.radius + 0.006) / (look.headR * 0.9), 0.3, 2);
  const z = mz.axis.clone();
  const up = V().subVectors(M.skull, M.nose);
  const x = V().crossVectors(up, z).normalize();
  if (x.lengthSq() < 0.5) x.set(1, 0, 0);
  const y = V().crossVectors(z, x).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  const pos = mz.center.clone().addScaledVector(z, -look.headLen * 0.7 * k);
  const obj = new THREE.Group();
  obj.name = 'headAnchor';
  const inv = new THREE.Matrix4().compose(pos, q, V(k, k, k)).invert();
  return { obj, pos, q, k, qInv: q.clone().invert(), toAnchor: (p) => p.clone().applyMatrix4(inv) };
}

/**
 * Ancre de l'encolure : +y le long du cou (vers la tête), −z vers la crête, +z vers la gorge ; échelle telle que le
 * collier générique (rayon 0,62 × R à 0,5 × neckLen de l'origine) entoure l'anneau mesuré de l'encolure.
 */
export function makeNeckAnchor(M, look) {
  const c = M.collar;
  const R = (look.bodyR ?? 0.19) * (look.fluff ?? 1);
  const k = clamp(((c.rx + c.ry) / 2 + 0.012) / (R * 0.62), 0.2, 2);
  const e = c.basis.elements;
  const rx = V(e[0], e[1], e[2]);
  const ry = V(e[4], e[5], e[6]);
  const rz = V(e[8], e[9], e[10]);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(rx, rz, ry.clone().negate()));
  const pos = c.center.clone().addScaledVector(rz, -(look.neckLen ?? 0.3) * 0.5 * k);
  const obj = new THREE.Group();
  obj.name = 'neckAnchor';
  return { obj, pos, q, k };
}

// ------------------------------------------------------------------ animation

/**
 * Mixeur d'une chèvre : celui du mouton (RealSheepAnim : allures sans glissement, postures et transitions de ruminant,
 * gestes, regard, oreilles, queue, sol, footLock), avec les postures et gestes de la chèvre — dressée contre la
 * barrière (rear_up → browse_up → rear_down), coup de tête, traite, gambade du chevreau (kid_play), escalade — et la
 * mamelle à la place de la toison.
 */
export class RealGoatAnim extends RealSheepAnim {
  constructor(model, base, S) {
    super(model, base, S);
    for (const nm of ONCE_GOAT) {
      const a = this.actions[nm];
      if (!a) continue;
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
    }
    this.udder = model.udderFill ?? 0.5;
    this.buttOn = false;
    // (poil long couchée : le shader ne le fait plus pendre qu'à 30 % et les mèches se replient — le corps n'est relevé
    // que de ce qui dépasse encore sous le ventre, pas de toute la longueur comme la laine du mouton)
    this.skirt = (model.build.long ?? 0) * 0.12;
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
    const s = udderScale(B, this.udder);
    // (os de la mamelle : y le long de l'os, vers le bas — couchée, elle s'étale au lieu de traverser le sol)
    md.udderBone?.scale.set(s * (1 + 0.2 * l), s * (1 - 0.6 * l), s * (1 + 0.2 * l));
    if (md.uniforms) md.uniforms.gStyle.value.w = l;
    if (md.lockUniforms) md.lockUniforms.hState.value.y = l;
  }

  /**
   * (le mixeur du mouton tourne model.neck et model.head : chez la chèvre ce sont des ancres pour le licol et les
   * accessoires — le temps de son travail, il reçoit les os)
   */
  withBones(fn) {
    const md = this.model;
    const n = md.neck;
    const h = md.head;
    md.neck = md.neckBone ?? n;
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
    this.nurseReach(dt, st, still);
  }

  /**
   * Chevreau qui tète : l'encolure plonge jusqu'à ce que la bouche arrive à la hauteur des trayons de sa mère (st.nurseY,
   * hauteur dans le monde, donnée par l'entité), le museau relevé ; la bouche (monde) est rendue dans this.mouthW pour
   * que l'entité ajuste sa place. Corrigé d'une image à l'autre (pas de calcul de cinématique inverse).
   */
  nurseReach(dt, st, still) {
    const md = this.model;
    const on = st.action === 'nurse' && st.nurseY != null && this.posture === 'stand' && !this.trans && !st.moving;
    this.nurseK = (this.nurseK ?? 0) + ((on ? 1 : 0) - (this.nurseK ?? 0)) * (still ? 1 : Math.min(1, dt * 3));
    if (this.nurseK < 0.01 || !md.neckBone || !md.headBone || !md.mouth) {
      this.nurseK = on ? this.nurseK : 0;
      this.nurseBend = 0;
      this.mouthW = null;
      return;
    }
    this.nurseBend ??= 0;
    this.turn(md.neckBone, X_AXIS, this.nurseBend * this.nurseK);
    this.turn(md.headBone, X_AXIS, -0.3 * this.nurseK);
    md.head.updateWorldMatrix(true, false);
    const m = (this.mouthW ??= V()).copy(md.mouth);
    md.head.localToWorld(m);
    if (on) this.nurseBend = clamp(this.nurseBend + clamp((m.y - st.nurseY) * 3, -0.12, 0.12) * Math.min(1, dt * 8), -0.5, 1.2);
  }

  /**
   * Dressée contre la barrière (se dresser, brouter en hauteur, redescendre) : les postérieurs restent posés où ils
   * étaient (footLock sur eux seuls) ; du clip seul, ils glissaient de 3 à 19 cm pendant qu'elle se dressait.
   */
  holdLegs() {
    const t = this.trans?.name;
    return this.posture === 'rear' || t === 'rear_up' || t === 'rear_down' ? HIND : super.holdLegs();
  }

  /**
   * Sol : comme le mouton ; le chevreau qui gambade, le saut et l'escalade sont « en l'air » (le corps libre). Le
   * chevreau qui gambade sur place garde ses sabots qui retombent tenus où ils se posent (airLock, comme l'agneau et le
   * veau) ; l'escalade, non.
   */
  ground(st, dt = 0, moveClip = null) {
    const play = moveClip === 'kid_play' || (this.w?.kid_play ?? 0) > 0.3;
    const air = play || (this.w?.climb ?? 0) > 0.3;
    this.airLock = play && !st.moving && !((this.w?.climb ?? 0) > 0.3);
    return this.withBones(() => super.ground(st, dt, air ? 'lamb_play' : moveClip));
  }

  /**
   * Une image. st : comme le mouton (v, moving, size, posture 'stand' | 'lie' | 'sleep' | 'rear', action 'graze' | 'eat'
   * | 'nurse' | 'play' | 'milk' | null, play, bleat, butt (coup de tête), ruminate, sad, look, noLock, quick).
   */
  update(dt, st) {
    this.restorePose();
    this.t += dt;
    this.hold += dt;
    const size = clamp(st.size ?? 1, 0.15, 1.6);
    const u = st.moving ? (st.v * Math.sqrt(size)) / Math.sqrt(this.speedScale) : 0;
    const g = pickSheepGait(this.gait, u);
    this.gait = g;
    const trick = this.trick && this.trick.age < 0.25 ? this.trick : null;
    if (this.trick) this.trick.age += dt;
    // Posture voulue (debout dès qu'elle bouge) ; transitions jouées une fois : se dresser / redescendre, se coucher /
    // se relever (de dressée à couchée : elle redescend d'abord).
    let want = st.moving || trick ? 'stand' : st.posture ?? 'stand';
    if (this.trans) {
      const a = this.actions[this.trans.name];
      if (!a || a.time >= a.getClip().duration - 0.04) {
        this.posture = this.trans.to;
        this.trans = null;
        this.hold = 0;
      }
    }
    if (!this.trans && want !== this.posture) {
      if (this.posture === 'rear' && want !== 'stand') want = 'stand';
      if (want === 'rear' && this.posture !== 'stand') want = 'stand';
      let tr = null;
      if (lying(want) && lying(this.posture)) this.posture = want;
      else if (this.posture === 'rear') tr = 'rear_down';
      else if (want === 'rear') tr = 'rear_up';
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
    // Bêler (tête levée, bouche ouverte) et coup de tête : joués une fois, debout à l'arrêt.
    const bl = this.actions.bleat;
    if (st.bleat && bl && !this.bleatOn && !this.buttOn && standing) {
      bl.reset();
      bl.play();
      this.bleatOn = true;
    }
    if (this.bleatOn && (!bl || bl.time >= bl.getClip().duration - 0.05 || st.moving || this.posture !== 'stand')) this.bleatOn = false;
    if (st.bleat && st.moving) this.bleatWalk = 1.6;
    const hb = this.actions.headbutt;
    if (st.butt && hb && !this.buttOn && !this.bleatOn && standing) {
      hb.reset();
      hb.play();
      this.buttOn = true;
    }
    if (this.buttOn && (!hb || hb.time >= hb.getClip().duration - 0.05 || st.moving || this.posture !== 'stand')) this.buttOn = false;
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
    } else if (this.posture === 'rear') {
      target.browse_up = 1;
      fadeK = 6;
    } else if (this.posture === 'lie') {
      target[st.ruminate && this.actions.ruminate ? 'ruminate' : 'lie'] = 1;
      fadeK = 1.5;
    } else if (this.posture === 'sleep') {
      target.sleep = 1;
      fadeK = 1.5;
    } else if (this.buttOn) {
      target.headbutt = 1;
      fadeK = 10;
    } else if (this.bleatOn) {
      target.bleat = 1;
      fadeK = 8;
    } else if ((st.action === 'graze' || st.action === 'eat' || st.action === 'milk') && this.actions[st.action]) {
      target[st.action] = 1;
      fadeK = 2.5;
    } else if (st.action === 'play' && this.actions.kid_play) {
      target.kid_play = 1;
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
        // (arrêtée, l'allure qui s'efface est figée : voir le mouton)
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
      } else a.timeScale = name === 'kid_play' ? 1.1 : 1;
    }
    if (lead && leadW > 0.3) this.lead = lead;
    // (vitesse de lecture de l'allure en tête : footLock efface ses corrections d'autant plus vite, voir le mouton)
    this.leadRate = st.moving && this.lead ? Math.abs(this.actions[this.lead]?.timeScale ?? 1) : 1;
    this.mixer.update(dt);
    this.savePose();
    this.applyShift();
    // (le regard et la mâchoire du mouton : dressée ou à la traite, elle mâche)
    const action = st.action;
    if (this.posture === 'rear' || action === 'milk') st.action = 'eat';
    this.overlay(dt, st, false);
    st.action = action;
    this.applyFleece(dt);
    this.ground(st, dt, moveClip);
  }
}

// ------------------------------------------------------------------ entité du jeu

const _wv = V();
const _iv = new THREE.Matrix4();

/**
 * Pose imposée par une activité (spectacle, agility) : 'jump' (saut, t : avancement 0-1 du clip), 'come' (elle court :
 * sabots libres, la scène déplace le modèle), 'bow' (salut, s : 0-1). Renvoie false si ce n'est pas une chèvre réaliste.
 */
export function realGoatPose(md, kind, s = 1, t = null) {
  if (!md?.realGoat) return false;
  const a = md.anim;
  if (kind === 'jump') a.trick = { clip: 'jump', time: t ?? 0.5, age: 0 };
  else if (kind === 'come') a.noLockFor = 0.3;
  // (salut : elle baisse la tête, comme au râtelier, le temps de la révérence)
  else if (kind === 'bow') a.trick = s > 0.05 ? { clip: 'eat', time: 0.25, age: 0 } : null;
  void s;
  return true;
}

/** Barrières de la bergerie (World.fences, celles de l'enclos « pen ») le long desquelles une chèvre peut se dresser. */
function penFences(world) {
  return (world?.fences ?? []).filter((f) => f.core === 'pen' && !f.wire && Math.max(f.hw, f.hd) > 1);
}

/**
 * Se dresser contre la barrière : la chèvre au repos, dans la bergerie, près d'une barrière, va s'y poser (elle
 * s'arrête à 0,7 m, s'avance au pas — sans collision — jusqu'à poser les antérieurs sur la lisse du haut), broute en
 * hauteur, puis redescend et recule. Renvoie l'état (e.goatBrowse) ou null.
 */
function browseFence(e, dt, anim, scale) {
  const p = e.root.position;
  let b = e.goatBrowse;
  const busy = e.scripted || e.herdCtrl || e.data.following || e.sleeping || e.ridden || e.inside || e.customHome || e.data.zone === 'field';
  if (busy || (b && e.state !== 'idle' && e.state !== 'walk')) {
    e.goatBrowse = null;
    return null;
  }
  if (!b) {
    if (e.state !== 'idle' || e.speed > 0.05 || anim.posture !== 'stand' || e.model.kid || e.stage === 'baby') return null;
    anim.browseCheck = (anim.browseCheck ?? 2 + Math.random() * 6) - dt;
    if (anim.browseCheck > 0) return null;
    anim.browseCheck = 6 + Math.random() * 10;
    if (Math.random() > 0.45) return null;
    // barrière la plus proche (à moins de 3 m), la chèvre de son côté ; pas au fond, derrière l'abri
    let best = null;
    const fences = penFences(e.world);
    const cx = fences.reduce((a, f) => a + f.x, 0) / Math.max(1, fences.length);
    const zBack = Math.min(...fences.map((f) => f.z));
    for (const f of fences) {
      const alongX = f.hw > f.hd;
      const lo = alongX ? f.x - f.hw + 0.8 : f.z - f.hd + 0.8;
      const hi = alongX ? f.x + f.hw - 0.8 : f.z + f.hd - 0.8;
      const t = clamp(alongX ? p.x : p.z, lo, hi);
      if (alongX && Math.abs(f.z - zBack) < 0.5 && Math.abs(t - cx) < 4.8) continue;
      const d = alongX ? f.z - p.z : f.x - p.x;
      if (Math.abs(d) > 3 || Math.abs(d) < 0.3) continue;
      if (!best || Math.abs(d) < Math.abs(best.d)) best = { f, alongX, t, d };
    }
    if (!best) return null;
    const n = Math.sign(best.d); // vers la barrière
    const line = best.alongX ? best.f.z : best.f.x;
    const reach = (e.model.browseHoof?.[0] ?? 0.29) * scale;
    const at = (dist) => (best.alongX ? V(best.t, 0, line - n * dist) : V(line - n * dist, 0, best.t));
    b = e.goatBrowse = {
      phase: 'go',
      heading: best.alongX ? (n > 0 ? 0 : Math.PI) : (n > 0 ? Math.PI / 2 : -Math.PI / 2),
      from: at(0.75 + 0.1 * scale),
      to: at(reach),
      t: 0,
      dur: 6 + Math.random() * 6,
    };
    e.state = 'walk';
    e.target.copy(b.from);
    e.timer = 8;
    return b;
  }
  b.t += dt;
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  if (b.phase === 'go') {
    const d = Math.hypot(b.from.x - p.x, b.from.z - p.z);
    if (e.state === 'walk' && d > 0.55) {
      if (b.t > 10) e.goatBrowse = null;
      return b;
    }
    // arrivée : tournée vers la barrière, elle s'avance au pas
    e.state = 'idle';
    e.timer = 30;
    e.speed = 0;
    b.phase = 'step';
    b.t = 0;
  }
  if (b.phase === 'step' || b.phase === 'back') {
    const goal = b.phase === 'step' ? b.to : b.from;
    const dh = wrap(b.heading - e.heading);
    e.heading += Math.sign(dh) * Math.min(Math.abs(dh), dt * 2.5);
    e.root.rotation.y = e.heading;
    const dx = goal.x - p.x;
    const dz = goal.z - p.z;
    const d = Math.hypot(dx, dz);
    // (le pas démarre et finit en douceur : la vitesse qui passait de 0,38 m/s à 0 d'une image à l'autre faisait sauter
    // une patte de 13 cm au bout du pas et de 28 à 30 cm au bout du recul)
    const v = 0.38 * Math.max(0.6, scale) * Math.min(1, 0.25 + b.t / 0.4) * clamp(d / (0.15 * Math.max(0.6, scale)), 0.3, 1);
    // (en reculant, les pattes vont à l'envers : le clip du pas est joué à rebours)
    anim.stepReverse = b.phase === 'back';
    if (Math.abs(dh) < 0.35 && d > 0.02) {
      const step = Math.min(d, v * dt);
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      anim.stepV = v;
    } else anim.stepV = d > 0.02 ? 0.25 : 0;
    if (d <= 0.02 && Math.abs(dh) < 0.05) {
      anim.stepV = 0;
      if (b.phase === 'step') {
        // (arrivée : elle se pose d'aplomb — sabots replacés, voir RealSheepAnim.footLock — avant de se dresser ; dressée
        // depuis le milieu d'un pas, ses postérieurs glissaient de 19 cm)
        b.phase = 'settle';
        b.t = 0;
      } else {
        e.goatBrowse = null;
        e.timer = 2 + Math.random() * 3;
        return null;
      }
    }
    return b;
  }
  if (b.phase === 'settle') {
    e.heading = b.heading;
    e.root.rotation.y = e.heading;
    e.timer = Math.max(e.timer, 3);
    const moveW = (anim.w?.walk ?? 0) + (anim.w?.trot ?? 0) + (anim.w?.run ?? 0);
    const square = !anim.stepL && !anim.lockAng?.some((x) => Math.abs(x) > 0.03);
    if ((b.t > 0.35 && moveW < 0.04 && square) || b.t > 2.5) {
      b.phase = 'up';
      b.t = 0;
    }
    return b;
  }
  if (b.phase === 'up') {
    e.heading = b.heading;
    e.root.rotation.y = e.heading;
    e.timer = Math.max(e.timer, 3);
    if (b.t > b.dur) {
      b.phase = 'down';
      b.t = 0;
    }
    return b;
  }
  if (b.phase === 'down') {
    e.timer = Math.max(e.timer, 3);
    // redescendue (posture debout de nouveau) : elle recule au pas
    if (anim.posture === 'stand' && !anim.trans && b.t > 0.3) {
      b.phase = 'back';
      b.t = 0;
      b.heading = e.heading;
    }
    return b;
  }
  return b;
}

/** Place du chevreau qui tète : à côté de sa mère, la tête sous son ventre, devant la mamelle. */
export function nurseSpot(e, mother, out) {
  const ms = (mother.scale ?? 1) * (mother.model?.size ?? 1);
  const ks = (e.scale ?? 1) * (e.model?.size ?? 1);
  const h = mother.heading;
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  const side = e.nurseSide ?? 1;
  // (mamelle à 0,32 m derrière le milieu de la mère ; le chevreau, tourné vers l'arrière de sa mère, a le museau à
  // ≈ 0,62 × sa taille devant son milieu ; l’entité corrige ensuite d’après la bouche mesurée)
  const ux = mother.position.x - fx * 0.32 * ms;
  const uz = mother.position.z - fz * 0.32 * ms;
  const lat = 0.2 * ms + 0.08 * ks;
  out.set(ux + fx * 0.62 * ks + fz * side * lat, 0, uz + fz * 0.62 * ks - fx * side * lat);
  // (tourné vers l'arrière de sa mère, le museau rentré vers le milieu de son ventre)
  return h + Math.PI + side * 0.4;
}

/** Trayon où vient la bouche du chevreau (monde) : sous l'os de la mamelle, du côté du chevreau. */
export function teatPoint(e, mother, out) {
  const md = mother.model;
  const ms = (mother.scale ?? 1) * (md?.size ?? 1);
  if (!md?.udderBone) return null;
  md.udderBone.getWorldPosition(out);
  const h = mother.heading;
  const side = e.nurseSide ?? 1;
  out.x += Math.cos(h) * side * 0.035 * ms;
  out.z -= Math.sin(h) * side * 0.035 * ms;
  out.y -= 0.08 * ms;
  return out;
}

/**
 * Animation d'une entité (AnimalEntity) à la chèvre réaliste : ce qu'elle fait (allure selon sa vitesse, brouter,
 * manger au râtelier, se dresser contre la barrière, couchée et ruminer, dormir, bêler, coup de tête avec une copine,
 * traite, gambader et téter pour le chevreau, menée par le chien de troupeau) ; renseigne e.gait. La mamelle suit le
 * lait de l'animal à chaque image.
 */
export function animateRealGoat(e, dt, sad) {
  const md = e.model;
  const anim = md.anim;
  const d = e.data;
  const scale = (e.scale ?? 1) * (md.size ?? 1);
  // Version réduite au loin.
  if (horseView.on && md.setLod && !md.lodHold) {
    const far = gfx.quality === 'high' ? GOAT_LOD_DIST.high : GOAT_LOD_DIST.low;
    const dist = _wv.setFromMatrixPosition(e.root.matrixWorld).distanceTo(horseView.eye) / lodScale(scale);
    md.setLod(dist > far * (md.lodLevel ? 0.9 : 1) ? 1 : 0);
  }
  // Mamelle : le lait de l'animal (pleine quand il est prêt, vide juste après la traite).
  if (md.build.milker) md.udderFill = goatUdderFill(d);
  // Traite (par la joueuse ou par l'aide : le lait retombe d'un coup) : elle reste debout, tranquille, quelques secondes.
  const prod = d.produce ?? 0;
  if (anim.lastProduce !== undefined && anim.lastProduce - prod > 25 && md.build.milker) {
    anim.milkT = 5;
    if (!e.scripted && !e.herdCtrl && !d.following) {
      e.state = 'idle';
      e.timer = Math.max(e.timer ?? 0, 5);
      e.goatBrowse = null;
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
  const browsing = !!e.goatBrowse && e.goatBrowse.phase !== 'go';
  const step = !anim.seenNow ? OFFSCREEN_STEP : md.lodLevel ? FAR_STEP : 1;
  if (step > 1 && !e.scripted && !e.herdCtrl && !e.posing && !d.following && !browsing && horseView.on) {
    anim.skipDt += dt;
    if (++anim.skipN < step) return;
    dt = anim.skipDt;
  } else {
    dt += anim.skipDt;
  }
  anim.skipDt = 0;
  anim.skipN = 0;
  const st = (e.goatSt ??= {});
  e.restSeed ??= ((d.id?.charCodeAt?.(0) ?? 7) + (d.id?.charCodeAt?.(1) ?? 3)) * 1.37;
  const t = e.time ?? 0;
  const kid = md.kid;
  // Se dresser contre la barrière de la bergerie (jamais sans barrière).
  anim.stepV = 0;
  anim.stepReverse = false;
  const br = browseFence(e, dt, anim, scale);
  st.v = Math.max(e.speed, anim.stepV) / Math.max(0.15, scale);
  st.moving = (e.speed > 0.06 || anim.stepV > 0.05) && e.perch?.phase !== 'on';
  st.size = scale;
  st.sad = sad;
  st.quick = !!e.posing;
  st.herd = !!e.herdCtrl;
  // (elle recule — hésitation au bas du pont du van, recul après s'être dressée : le pas est joué à rebours)
  const pp = e.root.position;
  if (anim.prevX !== undefined && dt > 0) {
    const fwd = ((pp.x - anim.prevX) * Math.sin(e.heading) + (pp.z - anim.prevZ) * Math.cos(e.heading)) / dt;
    anim.backing = e.speed > 0.06 && fwd < -0.05;
  }
  anim.prevX = pp.x;
  anim.prevZ = pp.z;
  st.reverse = (anim.stepReverse && anim.stepV > 0) || !!anim.backing;
  const idle = e.state === 'idle' && !e.herdCtrl && !e.scripted && !d.following && !st.moving;
  // Couchée : endormie, ou au repos (elle rumine) ; une chèvre qui vient de dormir reste couchée quand on s'approche.
  if (e.sleeping) anim.sleptAt = t;
  const justWoke = anim.sleptAt !== undefined && t - anim.sleptAt < 12;
  // (une chèvre dont le chevreau tète reste debout : nursedFor, compté par le chevreau — elle se couchait sous lui)
  if (e.nursedFor > 0) e.nursedFor -= dt;
  const restLie = idle && !br && !(anim.milkT > 0) && !(e.nursedFor > 0) && Math.sin(t * 0.045 + e.restSeed) > 0.66;
  let posture = 'stand';
  if (e.sleeping) posture = 'sleep';
  else if (br && (br.phase === 'up')) posture = 'rear';
  else if (!st.moving && !e.scripted && !e.herdCtrl && !br && !(anim.milkT > 0) && (justWoke || restLie || (lying(anim.posture) && anim.hold < 6))) posture = 'lie';
  st.posture = posture;
  st.ruminate = posture === 'lie' && Math.sin(t * 0.13 + e.restSeed * 0.7) > -0.2;
  // Gestes : traite, manger au râtelier, téter (chevreau près de sa mère), coup de tête avec une copine, gambader,
  // brouter au repos.
  let action = null;
  st.butt = false;
  const mother = kid && e.state === 'mother' ? e.partner : null;
  e.nursing = null;
  st.nurseY = null;
  let nurseV = 0;
  const mAnim = mother?.model?.anim;
  if (anim.milkT > 0 && !st.moving) action = 'milk';
  else if (e.state === 'eat') action = 'eat';
  else if (mother && !st.moving && !mother.sleeping && (mother.speed ?? 0) < 0.1 && (!mAnim || (mAnim.posture === 'stand' && !mAnim.trans))
    && Math.hypot(mother.position.x - e.root.position.x, mother.position.z - e.root.position.z) < 1.6 * Math.max(0.6, mother.scale ?? 1)) {
    action = 'nurse';
    // (il se glisse à côté de sa mère — au pas, sabots posés —, la tête sous son ventre, devant la mamelle ; la mère ne
    // le repousse pas et reste debout : tétée seulement si elle est debout)
    e.nursing = mother;
    mother.nursedFor = 1.5;
    nurseSideOf(e, mother); // (jumeaux : chacun son trayon)
    const want = nurseSpot(e, mother, _v);
    const p = e.root.position;
    const k = Math.min(1, dt * 2);
    // (près de sa place, c'est sa bouche qui vient au trayon : la place est corrigée de l'écart mesuré à l'image
    // d'avant — la taille du chevreau, l'encolure qui plonge et la mamelle qui grossit sont ainsi suivies)
    const teat = teatPoint(e, mother, _w);
    const m = anim.mouthW;
    if (teat && m && Math.hypot(_v.x - p.x, _v.z - p.z) < 0.8) {
      _v.set(p.x + teat.x - m.x, 0, p.z + teat.z - m.z);
    }
    st.nurseY = teat ? teat.y : null;
    const dx = clamp((_v.x - p.x) * k, -dt * 0.45, dt * 0.45);
    const dz = clamp((_v.z - p.z) * k, -dt * 0.45, dt * 0.45);
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
    // (deux chèvres face à face : coups de tête pour jouer, de temps en temps)
    const pd = Math.hypot(e.partner.position.x - e.root.position.x, e.partner.position.z - e.root.position.z);
    if (pd < 2.4 * Math.max(0.6, scale) && Math.sin(t * 1.9 + e.restSeed) > 0.93) st.butt = true;
  } else if (idle && !br && (kid || e.stage === 'young') && Math.sin(t * 0.37 + e.restSeed * 1.3) > 0.8) action = 'play';
  else if (idle && !br && Math.sin(t * 0.3 + (e.phase ?? 0)) > -0.1) action = 'graze';
  st.action = action;
  if (nurseV > 0.06) {
    st.moving = true;
    st.v = Math.max(st.v, nurseV / Math.max(0.15, scale));
  }
  st.play = (kid || e.stage === 'young') && st.moving && !e.herdCtrl && Math.sin(t * 0.5 + e.restSeed) > 0.3;
  // Bêler : quand elle se fait entendre (AnimalEntity.speak).
  st.bleat = e.spokeAt !== undefined && e.spokeAt !== anim.spokeSeen;
  anim.spokeSeen = e.spokeAt;
  // Regard : la joueuse proche, dans le repère de la chèvre.
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

void _q;
