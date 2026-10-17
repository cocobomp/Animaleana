// Cheval réaliste : modèle et textures de Lyndon Daniels, squelette de ChadM (OpenGameArt, CC0 1.0),
// préparés et animés pour le jeu (public/models/horse_real.glb, voir tools/cheval/LISEZMOI.md).
//
// Le GLB n'est qu'une source : à son premier usage, on en tire une fois pour toutes la géométrie de
// repos (en flottants, dans le repère du cheval), le squelette et les allures. Puis chaque race a sa
// propre géométrie (proportions : longueur des membres, épaisseur du tronc, encolure, tête, crins),
// partagée par les chevaux de cette race, et chaque cheval son propre squelette, ses matières (robe
// peinte par le shader de horseCoat.js, crins recolorés) et son mixeur d'animations.
//
// Interface : la même que le cheval sculpté (horseModel.js), qui reste le modèle de repli si le GLB
// manque. Repère : regard vers +Z, y vers le haut, origine au sol sous le milieu du corps ; cheval
// « de taille 1 » (garrot ≈ 1,6 m), l'échelle de la race est appliquée par AnimalEntity.
// Les groupes du squelette (body, neck, head, oreilles, queue, membres) sont de vrais parents des os :
// ce qu'on leur fait (saut d'obstacles, tours, broutage) déforme le maillage. Leur rotation de repos
// est nulle (axes du cheval), sauf l'encolure (rotation x = NECK_REST, comme look.neckAngle) et la
// tête (axe z le long du chanfrein, rotation x seule).

import * as THREE from 'three';
import { getModel } from '../assets.js';
import { gfx } from '../gfx.js';
import { horseBuild, horseBreedOf, foalBuild } from '../../sim/horseLook.js';
import { coatMaterial, PART } from './horseCoat.js';

export const REAL_HORSE_KEY = 'horse_real';
/** Rotation x de repos de l'encolure (interface : look.neckAngle ; plus grand = encolure plus basse). */
export const NECK_REST = 0.85;

// Vitesse « naturelle » de chaque allure du GLB (m/s, cheval de taille 1, voir tools/cheval/gait2.py) :
// à cette vitesse, les sabots posés ne glissent pas. Le clip est accéléré ou ralenti d'autant.
export const NATURAL_SPEED = { walk: 1.6, trot: 3.0, canter: 4.6, canterR: 4.6, gallop: 8.5 };
const MOVING = ['walk', 'trot', 'canter', 'gallop'];
const STILL = ['idle', 'rest', 'eat'];
// Allure du cavalier (src/game/models/avatarRig.js) : 0 pas, 1 trot, 2 galop.
const RIDER_GAIT = { walk: 0, trot: 1, canter: 2, gallop: 2 };

// Gabarit natif du modèle (cheval de trait, en unités de horseLook.js) : les races s'obtiennent en
// divisant leur gabarit par celui-ci (pur-sang : tronc plus étroit, membres plus fins et plus longs…).
export const NATIVE_BUILD = { girth: 1.24, legs: 0.98, bone: 1.36, neck: 0.95, neckW: 1.24, crest: 1.25, head: 1.1, croup: 1.12, back: 1, mane: 1.45, tail: 0.85 };

// Squelette : [os, os parent dans le jeu]. Spine est le groupe body (origine au sol).
const RIG = [
  ['Spine', null], ['Ribs', 'Spine'], ['Neck', 'Spine'], ['Head', 'Neck'], ['EarL', 'Head'], ['EarR', 'Head'],
  ['Mane1', 'Neck'], ['Mane2', 'Neck'], ['Mane3', 'Neck'], ['Mane4', 'Neck'],
  ['FL1', 'Spine'], ['FL2', 'FL1'], ['FL3', 'FL2'], ['FL4', 'FL3'],
  ['FR1', 'Spine'], ['FR2', 'FR1'], ['FR3', 'FR2'], ['FR4', 'FR3'],
  ['HL1', 'Spine'], ['HL2', 'HL1'], ['HL3', 'HL2'], ['HL4', 'HL3'],
  ['HR1', 'Spine'], ['HR2', 'HR1'], ['HR3', 'HR2'], ['HR4', 'HR3'],
  ['Tail1', 'Spine'], ['Tail2', 'Tail1'],
];
const BONE_INDEX = Object.fromEntries(RIG.map(([n], i) => [n, i]));
const PARENT = Object.fromEntries(RIG);
// Membres dans l'ordre de l'interface : antérieur gauche (+x), antérieur droit, postérieur gauche, postérieur droit.
const LEGS = [['FL', true, 1], ['FR', true, -1], ['HL', false, 1], ['HR', false, -1]];
const TRUNK = new Set(['Spine', 'Ribs', 'FL1', 'FR1', 'HL1', 'HR1', 'Tail1']);

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const _v = V();
const _w = V();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();

// ------------------------------------------------------------------ données de repos (une fois par GLB)

/**
 * Géométrie et squelette de repos tirés du GLB, dans le repère du cheval (flottants : les positions
 * du fichier sont quantifiées, c'est le squelette qui les remet à l'échelle), et allures reciblées
 * sur les groupes du jeu. Gardé dans gltf.userData.
 */
function prepareBase(gltf) {
  if (gltf.userData.horseBase) return gltf.userData.horseBase;
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const toHorse = scene.matrixWorld.clone().invert();
  const meshes = [];
  scene.traverse((o) => {
    if (o.isSkinnedMesh) meshes.push(o);
  });
  const skel = meshes[0].skeleton;
  const glbIndex = new Map(skel.bones.map((b, i) => [b.name, i]));
  const restW = RIG.map(([n]) => {
    const b = skel.bones[glbIndex.get(n)];
    if (!b) throw new Error(`os ${n} absent du GLB`);
    return new THREE.Matrix4().multiplyMatrices(toHorse, b.matrixWorld);
  });
  const remap = skel.bones.map((b) => BONE_INDEX[b.name] ?? 0);
  const prims = {};
  const bm = new THREE.Matrix4();
  const acc = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  for (const mesh of meshes) {
    const name = mesh.material.name.replace('horse_', ''); // coat, eye, mane
    const g = mesh.geometry;
    const n = g.attributes.position.count;
    const pos = new Float32Array(n * 3);
    const nrm = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const uv = new Float32Array(n * 2);
    const ao = new Float32Array(n);
    const sIdx = g.attributes.skinIndex;
    const sWgt = g.attributes.skinWeight;
    const col = g.attributes.color;
    const toH = new THREE.Matrix4().multiplyMatrices(toHorse, mesh.matrixWorld);
    for (let i = 0; i < n; i++) {
      // Peau au repos : matrice mélangée des os (elle contient la déquantification).
      acc.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      let tot = 0;
      for (let k = 0; k < 4; k++) {
        const w = sWgt.getComponent(i, k);
        const bi = sIdx.getComponent(i, k);
        si[i * 4 + k] = remap[bi];
        sw[i * 4 + k] = w;
        tot += w;
        if (w <= 0) continue;
        bm.multiplyMatrices(skel.bones[bi].matrixWorld, skel.boneInverses[bi]);
        for (let e = 0; e < 16; e++) acc.elements[e] += bm.elements[e] * w;
      }
      for (let k = 0; k < 4; k++) sw[i * 4 + k] /= tot || 1;
      _m.multiplyMatrices(toH, mesh.bindMatrixInverse).multiply(acc).multiply(mesh.bindMatrix);
      _v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(_m);
      pos.set([_v.x, _v.y, _v.z], i * 3);
      nm.getNormalMatrix(_m);
      _w.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm).normalize();
      nrm.set([_w.x, _w.y, _w.z], i * 3);
      if (g.attributes.uv) uv.set([g.attributes.uv.getX(i), g.attributes.uv.getY(i)], i * 2);
      ao[i] = col ? col.getX(i) : 1;
    }
    prims[name] = { pos, nrm, si, sw, uv, ao, index: Uint32Array.from(g.index.array), count: n, material: mesh.material };
  }
  // Recalage en z : le creux du dos (là où se pose la selle) à z = -0,075, comme le cheval sculpté
  // (Player.seat, gearModels.js). Le GLB est centré sur sa boîte, qui comprend la tête et la queue.
  const rest = restW.map((m) => V().setFromMatrixPosition(m));
  const rot = restW.map((m) => new THREE.Quaternion().setFromRotationMatrix(m));
  const seatZ = backSeatZ(prims.coat, rest);
  const zShift = -0.075 - seatZ;
  for (const p of Object.values(prims)) for (let i = 2; i < p.pos.length; i += 3) p.pos[i] += zShift;
  for (const r of rest) r.z += zShift;
  // Rotation de repos des groupes (axes du cheval), sauf l'encolure et la tête (z le long du chanfrein).
  const iH = BONE_INDEX.Head;
  const snout = muzzleTip(prims.coat, rest[iH]);
  const chanfrein = snout.clone().sub(rest[iH]);
  const headTilt = Math.atan2(-chanfrein.y, chanfrein.z);
  const groupRest = RIG.map(([n]) => {
    if (n === 'Neck') return new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), NECK_REST);
    if (n === 'Head') return new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), headTilt);
    return new THREE.Quaternion();
  });
  const base = { prims, rest, rot, groupRest, headTilt, zShift, snout };
  base.hair = hairInfo(prims, rest);
  base.clips = retarget(gltf, toHorse, restW, groupRest, zShift);
  base.sole = solesOf(prims.coat, rest);
  gltf.userData.horseBase = base;
  // Les textures du GLB sont partagées par tous les chevaux : jamais libérées avec l'un d'eux.
  for (const p of Object.values(prims)) {
    const m = p.material;
    for (const key of ['map', 'normalMap']) {
      if (!m[key]) continue;
      m[key].userData.shared = true;
      if (key === 'map') m[key].colorSpace = THREE.NoColorSpace; // modelé gris (données), pas une couleur
    }
  }
  return base;
}

/** z du creux du dos (ligne du dessus entre garrot et hanches). */
function backSeatZ(coat, rest) {
  const zW = rest[BONE_INDEX.Neck].z;
  const zH = rest[BONE_INDEX.Spine].z;
  const bins = new Map();
  for (let i = 0; i < coat.count; i++) {
    const x = coat.pos[i * 3];
    const y = coat.pos[i * 3 + 1];
    const z = coat.pos[i * 3 + 2];
    if (Math.abs(x) > 0.1 || z > zW || z < zH) continue;
    const k = Math.round(z / 0.04);
    bins.set(k, Math.max(bins.get(k) ?? -1, y));
  }
  let best = null;
  for (const [k, y] of bins) {
    // (moyenne glissante sur trois cases : un sommet isolé ne fait pas le creux)
    const m = ((bins.get(k - 1) ?? y) + y + (bins.get(k + 1) ?? y)) / 3;
    if (!best || m < best[1]) best = [k * 0.04, m];
  }
  // Le creux est plat : on prend le milieu de la zone à moins de 1 cm du plus bas.
  const low = [...bins].filter(([k, y]) => y < best[1] + 0.012).map(([k]) => k * 0.04);
  return low.length ? (Math.min(...low) + Math.max(...low)) / 2 : best[0];
}

/** Bout du nez (sommet de la tête le plus loin de la nuque, dans l'axe de l'os de la tête). */
function muzzleTip(coat, poll) {
  let best = null;
  for (let i = 0; i < coat.count; i++) {
    const b = dominant(coat, i);
    if (b !== BONE_INDEX.Head) continue;
    _v.fromArray(coat.pos, i * 3);
    if (Math.abs(_v.x) > 0.05) continue;
    const d = _v.distanceTo(poll);
    if (!best || d > best[0]) best = [d, _v.clone()];
  }
  return best[1];
}

/**
 * Points de la sole de chaque sabot au repos (pince, centre, talons), par rapport au boulet : le jeu
 * vérifie qu'ils ne passent pas sous le sol.
 */
function solesOf(coat, rest) {
  return LEGS.map(([k]) => {
    const b = BONE_INDEX[k + '4'];
    const pts = [];
    for (let i = 0; i < coat.count; i++) {
      if (dominant(coat, i) !== b || coat.pos[i * 3 + 1] > 0.02) continue;
      pts.push(V().fromArray(coat.pos, i * 3));
    }
    const toe = pts.reduce((a, p) => (p.z > a.z ? p : a), pts[0]);
    const heel = pts.reduce((a, p) => (p.z < a.z ? p : a), pts[0]);
    const mid = toe.clone().lerp(heel, 0.5);
    return [toe, mid, heel].map((p) => p.clone().sub(rest[b]).setY(-rest[b].y));
  });
}

function dominant(p, i) {
  let b = p.si[i * 4];
  let w = p.sw[i * 4];
  for (let k = 1; k < 4; k++) {
    if (p.sw[i * 4 + k] > w) {
      w = p.sw[i * 4 + k];
      b = p.si[i * 4 + k];
    }
  }
  return b;
}

/**
 * Crins : la texture est rangée en étoile (racines au centre, pointes au bord) : la distance au centre
 * des UV dit où est chaque sommet le long de sa mèche (0 racine, 1 pointe). Crête de l'encolure et
 * attache de la queue : racines des mèches, pour allonger ou raccourcir les crins par race.
 */
function hairInfo(prims, rest) {
  const m = prims.mane;
  const g = new Float32Array(m.count);
  const tail = new Uint8Array(m.count);
  for (let i = 0; i < m.count; i++) {
    const r = Math.hypot(m.uv[i * 2] - 0.5, m.uv[i * 2 + 1] - 0.5);
    const b = dominant(m, i);
    tail[i] = b === BONE_INDEX.Tail1 || b === BONE_INDEX.Tail2 ? 1 : 0;
    g[i] = tail[i] ? smooth(0.04, 0.48, r) : smooth(0.15, 0.5, r);
  }
  // Crête : point le plus haut du pelage le long de l'axe de l'encolure (garrot -> nuque).
  const w = rest[BONE_INDEX.Neck];
  const p = rest[BONE_INDEX.Head];
  const axis = p.clone().sub(w);
  const len = axis.length();
  axis.normalize();
  const up = V(0, axis.z, -axis.y);
  if (up.y < 0) up.negate();
  const crest = [];
  const c = prims.coat;
  for (let k = 0; k <= 20; k++) {
    const t = k / 20;
    const o = w.clone().addScaledVector(axis, len * t);
    let best = null;
    for (let i = 0; i < c.count; i++) {
      _v.fromArray(c.pos, i * 3);
      if (Math.abs(_v.x) > 0.08 || Math.abs(_v.clone().sub(o).dot(axis)) > 0.05) continue;
      const h = _v.clone().sub(o).dot(up);
      if (!best || h > best[0]) best = [h, _v.clone()];
    }
    if (best) crest.push([t, best[1].setX(0)]);
  }
  return { g, tail, crest, axis, len, origin: w.clone() };
}

// ------------------------------------------------------------------ allures reciblées

/**
 * Les clips du GLB animent ses os ; on les traduit une fois en rotations des groupes du jeu (et en
 * position du groupe body pour le rebond). Échantillonnés à 25 images/s, comme ils ont été générés.
 */
function retarget(gltf, toHorse, restW, groupRest, zShift) {
  const scene = gltf.scene;
  const mixer = new THREE.AnimationMixer(scene);
  const bones = RIG.map(([n]) => scene.getObjectByName(n));
  const saved = [];
  scene.traverse((o) => saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
  const R0inv = restW.map((m) => new THREE.Quaternion().setFromRotationMatrix(m).invert());
  const P0 = restW.map((m) => V().setFromMatrixPosition(m).add(V(0, 0, zShift)));
  const W = new THREE.Matrix4();
  const out = {};
  const qWorld = RIG.map(() => new THREE.Quaternion());
  const pos = V();
  const sc = V();
  for (const clip of gltf.animations) {
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.play();
    const N = Math.max(2, Math.round(clip.duration * 25) + 1);
    const times = new Float32Array(N);
    const quats = RIG.map(() => new Float32Array(N * 4));
    const bodyPos = new Float32Array(N * 3);
    for (let s = 0; s < N; s++) {
      const t = (s / (N - 1)) * clip.duration;
      times[s] = t;
      mixer.setTime(t);
      scene.updateMatrixWorld(true);
      RIG.forEach(([n], j) => {
        W.multiplyMatrices(toHorse, bones[j].matrixWorld).decompose(pos, _q, sc);
        pos.z += zShift;
        // Rotation du groupe dans le repère du cheval : celle de l'os depuis le repos, appliquée au repos du groupe.
        qWorld[j].copy(_q).multiply(R0inv[j]).multiply(groupRest[j]);
        if (n === 'Spine') {
          // Groupe body (origine au sol) : rotation et translation qui amènent l'os du dos du repos à sa pose.
          const rb = _q2.copy(_q).multiply(R0inv[j]);
          const p0 = P0[j].clone().applyQuaternion(rb);
          bodyPos.set([pos.x - p0.x, pos.y - p0.y, pos.z - p0.z], s * 3);
        }
      });
      RIG.forEach(([n], j) => {
        const par = PARENT[n];
        const local = par ? _q2.copy(qWorld[BONE_INDEX[par]]).invert().multiply(qWorld[j]) : qWorld[j];
        // (continuité des quaternions d'une image à l'autre, pour l'interpolation)
        if (s > 0) {
          const o = (s - 1) * 4;
          const q = quats[j];
          if (q[o] * local.x + q[o + 1] * local.y + q[o + 2] * local.z + q[o + 3] * local.w < 0) {
            local.set(-local.x, -local.y, -local.z, -local.w);
          }
        }
        quats[j].set([local.x, local.y, local.z, local.w], s * 4);
      });
    }
    const tracks = [new THREE.VectorKeyframeTrack('gSpine.position', times, bodyPos)];
    RIG.forEach(([n], j) => {
      // Os immobiles par rapport à leur parent (crinière, côtes) : pas de piste (le jeu les anime).
      if (n.startsWith('Mane') || n === 'Ribs') return;
      tracks.push(new THREE.QuaternionKeyframeTrack(`g${n}.quaternion`, times, quats[j]));
    });
    out[clip.name] = new THREE.AnimationClip(clip.name, clip.duration, tracks);
    action.stop();
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
  // remet le GLB d'origine au repos
  for (const [o, p, q, s] of saved) {
    o.position.copy(p);
    o.quaternion.copy(q);
    o.scale.copy(s);
  }
  scene.updateMatrixWorld(true);
  return out;
}

// ------------------------------------------------------------------ proportions de race

/**
 * Géométrie d'une race (gabarit B) : chaque os déforme ses sommets (tronc plus ou moins large et
 * profond, dos plus ou moins long, membres plus longs et plus fins, encolure, tête, queue), mélangés
 * selon les poids de la peau ; les articulations suivent. Les sabots restent posés au sol.
 */
function deformer(base, B) {
  const N = NATIVE_BUILD;
  const r = (k) => (B[k] ?? 1) / (N[k] ?? 1);
  const rest = base.rest;
  const J = (n) => rest[BONE_INDEX[n]];
  const gx = r('girth');
  const gy = r('girth') ** 0.6;
  const rb = r('back');
  const rl = r('legs');
  const bone = r('bone');
  const hoof = bone ** 0.85;
  const croup = r('croup');
  const elbowY = (J('FL2').y + J('FR2').y) / 2;
  const yA = elbowY;
  const yA2 = elbowY * rl;
  const zSeat = -0.075;
  const zHip = J('Spine').z;
  // Tronc (et épaules, hanches, attache de la queue) : largeur, profondeur ancrée à la hauteur des
  // coudes (qui suit la longueur des membres), longueur du dos autour de la selle, croupe.
  const trunk = (p, o) => {
    const rear = smooth(zHip + 0.38, zHip - 0.05, p.z);
    const kx = gx * (1 + (croup - 1) * 0.8 * rear);
    const ky = gy * (1 + (croup - 1) * 0.35 * rear);
    return o.set(p.x * kx, yA2 + (p.y - yA) * ky, zSeat + (p.z - zSeat) * rb);
  };
  const affine = (head, newHead, lin) => (p, o) => o.copy(p).sub(head).applyMatrix3(lin).add(newHead);
  const along = (a, f, t) => {
    // f le long de a, t en travers
    const m = new THREE.Matrix3();
    const e = m.elements;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const aa = a.getComponent(i) * a.getComponent(j);
        e[j * 3 + i] = (i === j ? t : 0) + (f - t) * aa;
      }
    }
    return m;
  };
  const maps = new Array(RIG.length);
  const heads = new Array(RIG.length);
  for (const n of TRUNK) maps[BONE_INDEX[n]] = trunk;
  // Membres : sous le coude (ou le grasset), avant-bras et canon s'allongent pour que le sabot reste au sol.
  for (const [k, front] of LEGS) {
    const j1 = J(k + '1');
    const j2 = J(k + '2');
    const j3 = J(k + '3');
    const j4 = J(k + '4');
    const sole = j4.clone();
    sole.y = 0;
    // (pied de l'os du sabot : sous le boulet, au sol)
    const s2 = trunk(j2, V());
    const f = (s2.y - j4.y * hoof) / (j2.y - j4.y);
    const s3 = s2.clone().addScaledVector(j3.clone().sub(j2), f);
    const s4 = s3.clone().addScaledVector(j4.clone().sub(j3), f);
    const t2 = Math.sqrt(gx * bone) * (front ? 1 : 1.03);
    heads[BONE_INDEX[k + '1']] = trunk(j1, V());
    heads[BONE_INDEX[k + '2']] = s2;
    heads[BONE_INDEX[k + '3']] = s3;
    heads[BONE_INDEX[k + '4']] = s4;
    maps[BONE_INDEX[k + '2']] = affine(j2, s2, along(j3.clone().sub(j2).normalize(), f, t2));
    maps[BONE_INDEX[k + '3']] = affine(j3, s3, along(j4.clone().sub(j3).normalize(), f, bone));
    maps[BONE_INDEX[k + '4']] = affine(j4, s4, new THREE.Matrix3().multiplyScalar(hoof));
    void sole;
  }
  // Encolure : longueur et épaisseur, raccordée en douceur au tronc à sa base.
  const w0 = J('Neck');
  const w1 = trunk(w0, V());
  const nAxis = J('Head').clone().sub(w0);
  const nLen = nAxis.length();
  nAxis.normalize();
  const neckLin = affine(w0, w1, along(nAxis, r('neck'), r('neckW')));
  const tmpA = V();
  const tmpB = V();
  const neck = (p, o) => {
    const t = p.clone().sub(w0).dot(nAxis) / nLen;
    const s = smooth(0.06, 0.38, t);
    trunk(p, tmpA);
    neckLin(p, tmpB);
    return o.copy(tmpA).lerp(tmpB, s);
  };
  maps[BONE_INDEX.Neck] = neck;
  for (let i = 1; i <= 4; i++) maps[BONE_INDEX['Mane' + i]] = neck;
  const poll = J('Head');
  const poll2 = neckLin(poll, V());
  const rh = r('head');
  maps[BONE_INDEX.Head] = affine(poll, poll2, new THREE.Matrix3().multiplyScalar(rh));
  for (const e of ['EarL', 'EarR']) {
    const h = J(e);
    const h2 = maps[BONE_INDEX.Head](h, V());
    maps[BONE_INDEX[e]] = affine(h, h2, new THREE.Matrix3().multiplyScalar(rh ** 0.6));
    heads[BONE_INDEX[e]] = h2;
  }
  // Queue : le tronçon qui pend s'allonge ou se raccourcit (les crins suivent).
  const d0 = J('Tail2');
  const d1 = trunk(d0, V());
  const tAxis = V(0, -1, -0.15).normalize();
  maps[BONE_INDEX.Tail2] = affine(d0, d1, along(tAxis, 1, Math.sqrt(gx)));
  heads[BONE_INDEX.Spine] = trunk(J('Spine'), V());
  heads[BONE_INDEX.Ribs] = trunk(J('Ribs'), V());
  heads[BONE_INDEX.Neck] = w1;
  heads[BONE_INDEX.Head] = poll2;
  for (let i = 1; i <= 4; i++) heads[BONE_INDEX['Mane' + i]] = neck(J('Mane' + i), V());
  heads[BONE_INDEX.Tail1] = trunk(J('Tail1'), V());
  heads[BONE_INDEX.Tail2] = d1;
  return { maps, heads, scale: { gx, gy, rb, rl, bone, hoof, head: rh, yA2 } };
}

/** Applique le déformeur à une primitive : positions et normales mélangées selon les poids de la peau. */
function deformPrim(p, D) {
  const n = p.count;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const P = V();
  const o = V();
  const acc = V();
  const J = new THREE.Matrix3();
  const e = 0.002;
  const cols = [V(), V(), V()];
  const ax = [V(e, 0, 0), V(0, e, 0), V(0, 0, e)];
  const evalAt = (q, i, out) => {
    out.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = p.sw[i * 4 + k];
      if (w <= 0) continue;
      D.maps[p.si[i * 4 + k]](q, o);
      out.addScaledVector(o, w);
    }
    return out;
  };
  const qa = V();
  const qb = V();
  const ra = V();
  const rbv = V();
  for (let i = 0; i < n; i++) {
    P.fromArray(p.pos, i * 3);
    evalAt(P, i, acc);
    pos.set([acc.x, acc.y, acc.z], i * 3);
    for (let k = 0; k < 3; k++) {
      evalAt(qa.copy(P).add(ax[k]), i, ra);
      evalAt(qb.copy(P).sub(ax[k]), i, rbv);
      cols[k].subVectors(ra, rbv).multiplyScalar(1 / (2 * e));
    }
    J.set(cols[0].x, cols[1].x, cols[2].x, cols[0].y, cols[1].y, cols[2].y, cols[0].z, cols[1].z, cols[2].z);
    J.invert().transpose();
    P.fromArray(p.nrm, i * 3).applyMatrix3(J).normalize();
    nrm.set([P.x, P.y, P.z], i * 3);
  }
  return { pos, nrm };
}

/** Allonge (f > 1) ou raccourcit les mèches à partir de leur racine. */
function scaleHair(pos, base, D, B) {
  const H = base.hair;
  const m = base.prims.mane;
  const N = NATIVE_BUILD;
  const style = B.maneStyle;
  // Longueur de crinière : le gabarit, et le style (brosse : rasée, la brosse est ajoutée à part).
  const maneF = style === 'brush' || style === 'foal' ? 0.12
    : (B.mane / N.mane) * ({ long: 1.25, thick: 1.05, short: 0.5 }[style] ?? 1);
  const tailF = (B.tail ?? 1) / N.tail;
  const crest = H.crest.map(([t, c]) => [t, D.maps[BONE_INDEX.Neck](c, V())]);
  const neckAxis = H.axis;
  const o = H.origin;
  const dock = D.heads[BONE_INDEX.Tail2];
  const P = V();
  for (let i = 0; i < m.count; i++) {
    const g = H.g[i];
    if (g <= 0) continue;
    P.fromArray(pos, i * 3);
    let root;
    let f;
    if (H.tail[i]) {
      if (P.y > dock.y) continue;
      root = V(0, dock.y, dock.z);
      f = 1 + (tailF - 1) * g;
    } else {
      const t = Math.min(1, Math.max(0, _v.fromArray(m.pos, i * 3).sub(o).dot(neckAxis) / H.len));
      const k = Math.min(crest.length - 2, Math.max(0, Math.floor(t * (crest.length - 1))));
      root = crest[k][1].clone().lerp(crest[k + 1][1], t * (crest.length - 1) - k);
      // (le toupet, sur la tête, garde sa longueur sauf pour la brosse)
      if (dominant(m, i) === BONE_INDEX.Head && maneF > 0.5) continue;
      f = 1 + (maneF - 1) * g;
    }
    P.sub(root).multiplyScalar(f).add(root);
    pos.set([P.x, P.y, P.z], i * 3);
  }
}

const shapes = new Map();

/** Géométries (partagées) d'un gabarit : pelage, yeux, crins, avec les attributs du shader de la robe. */
function shapeFor(base, B) {
  const key = JSON.stringify(B);
  let S = shapes.get(key);
  if (S) return S;
  const D = deformer(base, B);
  const coat = base.prims.coat;
  const dc = deformPrim(coat, D);
  const de = deformPrim(base.prims.eye, D);
  const dm = deformPrim(base.prims.mane, D);
  scaleHair(dm.pos, base, D, B);
  const heads = D.heads;
  const elbowY = (heads[BONE_INDEX.FL2].y + heads[BONE_INDEX.FR2].y) / 2;
  // Attributs du shader de la robe (horseCoat.js) : partie du corps, repère de la tête, hauteur sur le membre.
  const n = coat.count;
  const part = new Float32Array(n);
  const info = new Float32Array(n * 3);
  const ao = new Float32Array(n);
  const poll = heads[BONE_INDEX.Head];
  const headQ = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), base.headTilt).invert();
  const headLen = base.snout.distanceTo(base.rest[BONE_INDEX.Head]) * D.scale.head;
  const legOf = (b) => LEGS.findIndex(([k]) => RIG[b][0].startsWith(k));
  const zMidLegs = (heads[BONE_INDEX.FL3].z + heads[BONE_INDEX.HL3].z) / 2;
  const P = V();
  for (let i = 0; i < n; i++) {
    const b = dominant(coat, i);
    const name = RIG[b][0];
    P.fromArray(dc.pos, i * 3);
    ao[i] = 0.45 + 0.55 * coat.ao[i];
    if (name === 'Head') {
      const h = P.clone().sub(poll).applyQuaternion(headQ).multiplyScalar(1 / headLen);
      part[i] = PART.head;
      info.set([h.x, h.y, h.z], i * 3);
    } else if (name === 'EarL' || name === 'EarR') {
      part[i] = PART.ear;
      const e = heads[b];
      info[i * 3] = Math.min(1, Math.max(0, (P.y - e.y) / 0.16));
    } else {
      // (hauteur relative partout sur le corps aussi : un triangle à cheval entre le corps et un
      // membre n'a pas de « fausse balzane » au bord ; membre le plus proche selon le quart du corps)
      const li = legOf(b);
      const near = (P.z > zMidLegs ? 0 : 2) + (P.x >= 0 ? 0 : 1);
      part[i] = li >= 0 && (!name.endsWith('1') || P.y < elbowY * 0.9) ? PART.leg0 + li : PART.body;
      info.set([P.y / elbowY, li >= 0 ? li : near, 0], i * 3);
    }
  }
  const geo = (d, prim, extra) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(prim.uv, 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(prim.si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(prim.sw, 4));
    for (const [k, a] of Object.entries(extra ?? {})) g.setAttribute(k, a);
    g.setIndex(new THREE.BufferAttribute(prim.index, 1));
    g.computeBoundingSphere();
    g.userData.shared = true;
    return g;
  };
  const hoofY = 0.128 * D.scale.hoof;
  const soles = base.sole.map((pts) => pts.map((p) => p.clone().multiplyScalar(D.scale.hoof)));
  S = {
    B,
    D,
    heads,
    coatGeo: geo(dc, coat, {
      hPart: new THREE.BufferAttribute(part, 1),
      hInfo: new THREE.BufferAttribute(info, 3),
      hAO: new THREE.BufferAttribute(ao, 1),
    }),
    eyeGeo: geo(de, base.prims.eye),
    maneGeo: geo(dm, base.prims.mane, { hairG: new THREE.BufferAttribute(base.hair.g, 1) }),
    hoofY,
    elbowY,
    headLen,
    soles,
  };
  S.measure = measureShape(S, dc.pos, coat, base);
  shapes.set(key, S);
  return S;
}

// ------------------------------------------------------------------ mesures (selle, équipement)

/**
 * Coupes du tronc et de la tête mesurées sur la géométrie de la race : champs de distance approchés
 * (comme gltfHorseFit.js) pour que gearModels.js pose la couverture, la selle, la sangle, le filet…
 */
function measureShape(S, pos, coat, base) {
  const heads = S.heads;
  const n = coat.count;
  const trunkTri = [];
  const headTri = [];
  const idx = coat.index;
  const isTrunk = new Uint8Array(n);
  const isHead = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const nm = RIG[dominant(coat, i)][0];
    isTrunk[i] = TRUNK.has(nm) || nm === 'Neck' ? 1 : 0;
    isHead[i] = nm === 'Head' ? 1 : 0;
  }
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t];
    const b = idx[t + 1];
    const c = idx[t + 2];
    if (isTrunk[a] && isTrunk[b] && isTrunk[c]) trunkTri.push(a, b, c);
    if (isHead[a] + isHead[b] + isHead[c] >= 2) headTri.push(a, b, c);
  }
  // Tronc : coupes en z (repère du corps). Centre à mi-hauteur, rayons tous les 15° de -90° à +90° (côté +x).
  const zH = heads[BONE_INDEX.Spine].z;
  const zN = heads[BONE_INDEX.Neck].z;
  const z0 = zH - 0.3;
  const z1 = zN + 0.42;
  const torso = sections(pos, trunkTri, (p) => p, z0, z1, 0.04);
  // Tête : repère du groupe head (origine à la nuque, z le long du chanfrein).
  const poll = heads[BONE_INDEX.Head];
  const hq = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), base.headTilt).invert();
  const toHead = (p) => p.clone().sub(poll).applyQuaternion(hq);
  const head = sections(pos, headTri, toHead, -0.16, S.headLen + 0.02, 0.025, true);
  // Ligne du dos : point le plus haut au milieu, tous les 2 cm.
  const back = new Map();
  for (let i = 0; i < n; i++) {
    if (!isTrunk[i] || Math.abs(pos[i * 3]) > 0.09) continue;
    const k = Math.round(pos[i * 3 + 2] / 0.02);
    back.set(k, Math.max(back.get(k) ?? -1, pos[i * 3 + 1]));
  }
  const keys = [...back.keys()].sort((a, b) => a - b);
  const backTop = (z) => {
    // interpolation entre les cases voisines, lissée sur ±2 cases
    const k = z / 0.02;
    let s = 0;
    let wsum = 0;
    for (let d = -3; d <= 3; d++) {
      const kk = Math.round(k) + d;
      if (!back.has(kk)) continue;
      const w = 1 / (1 + Math.abs(kk - k));
      s += back.get(kk) * w;
      wsum += w;
    }
    return wsum ? s / wsum : heads[BONE_INDEX.Spine].y;
  };
  void keys;
  return { torso, head, backTop };
}

/**
 * Coupes d'une forme triangulée le long de z (dans le repère donné par toFrame) : pour chaque coupe,
 * les points où les arêtes la traversent, puis le centre et le rayon par secteur de 15°.
 * Renvoie un champ de distance approché f(x, y, z) et ses coupes.
 */
function sections(pos, tris, toFrame, z0, z1, dz, centerAxis = false) {
  const STEP = Math.PI / 12;
  const rings = [];
  const pts = [];
  const nv = pos.length / 3;
  const fp = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    const q = toFrame(V(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
    fp[i * 3] = q.x;
    fp[i * 3 + 1] = q.y;
    fp[i * 3 + 2] = q.z;
  }
  for (let z = z0; z <= z1 + 1e-6; z += dz) {
    pts.length = 0;
    for (let t = 0; t < tris.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = tris[t + e];
        const b = tris[t + (e + 1) % 3];
        const za = fp[a * 3 + 2];
        const zb = fp[b * 3 + 2];
        if ((za - z) * (zb - z) > 0 || za === zb) continue;
        const u = (z - za) / (zb - za);
        pts.push([Math.abs(fp[a * 3] + (fp[b * 3] - fp[a * 3]) * u), fp[a * 3 + 1] + (fp[b * 3 + 1] - fp[a * 3 + 1]) * u]);
      }
    }
    if (pts.length < 6) {
      rings.push(null);
      continue;
    }
    let ymin = Infinity;
    let ymax = -Infinity;
    for (const [x, y] of pts) {
      if (x < 0.06) {
        ymin = Math.min(ymin, y);
        ymax = Math.max(ymax, y);
      }
    }
    if (!Number.isFinite(ymin)) for (const [, y] of pts) {
      ymin = Math.min(ymin, y);
      ymax = Math.max(ymax, y);
    }
    const yc = centerAxis ? (ymin + ymax) / 2 : (ymin + ymax) / 2;
    const r = new Array(13).fill(0);
    for (const [x, y] of pts) {
      const a = Math.atan2(y - yc, x);
      const k = Math.round((a + Math.PI / 2) / STEP);
      if (k < 0 || k > 12) continue;
      r[k] = Math.max(r[k], Math.hypot(x, y - yc));
    }
    // secteurs vides : voisins
    for (let pass = 0; pass < 3; pass++) {
      for (let k = 0; k <= 12; k++) {
        if (r[k] > 0) continue;
        const a = r[k - 1] ?? 0;
        const b = r[k + 1] ?? 0;
        r[k] = a && b ? (a + b) / 2 : a || b;
      }
    }
    rings.push([z, yc, r]);
  }
  // coupes manquantes aux bouts : la plus proche
  const first = rings.findIndex(Boolean);
  if (first < 0) {
    // (rien de mesuré : une forme ronde par défaut, pour ne jamais bloquer)
    for (let i = 0; i < rings.length; i++) rings[i] = [z0 + i * dz, 0, new Array(13).fill(0.1)];
  }
  const last = rings.length - 1 - [...rings].reverse().findIndex(Boolean);
  for (let i = 0; i < rings.length; i++) {
    if (rings[i]) continue;
    const j = i < first ? first : i > last ? last : null;
    if (j !== null) rings[i] = [z0 + i * dz, rings[j][1], rings[j][2].map((x) => x * 0.6)];
    else {
      let a = i - 1;
      while (!rings[a]) a--;
      let b = i + 1;
      while (!rings[b]) b++;
      const u = (i - a) / (b - a);
      rings[i] = [z0 + i * dz, rings[a][1] * (1 - u) + rings[b][1] * u, rings[a][2].map((x, k) => x * (1 - u) + rings[b][2][k] * u)];
    }
  }
  const nR = rings.length;
  const ringAt = (rr, a) => {
    const f = Math.min(11.999, Math.max(0, (a + Math.PI / 2) / STEP));
    const i = Math.floor(f);
    return rr[i] + (rr[i + 1] - rr[i]) * (f - i);
  };
  const za = z0;
  const zEnd0 = z0 - dz * 0.5;
  const zEnd1 = z0 + (nR - 1) * dz + dz * 0.5;
  const f = (x, y, z) => {
    const fz = Math.min(nR - 1.001, Math.max(0, (z - za) / dz));
    const i = Math.floor(fz);
    const k = fz - i;
    const A = rings[i];
    const Bq = rings[i + 1];
    const yc = A[1] + (Bq[1] - A[1]) * k;
    const dy = y - yc;
    const ax = Math.abs(x);
    const a = Math.atan2(dy, ax);
    const rr = ringAt(A[2], a) * (1 - k) + ringAt(Bq[2], a) * k;
    return Math.max(Math.hypot(ax, dy) - rr, z - zEnd1, zEnd0 - z);
  };
  f.rings = rings;
  return f;
}

// ------------------------------------------------------------------ matières

/** Crins : modelé gris de la texture du GLB × couleur des crins (une matière par cheval). */
function maneMaterial(base, color, sway) {
  const src = base.prims.mane.material;
  const m = new THREE.MeshStandardMaterial({
    map: src.map, normalMap: src.normalMap, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.62,
    alphaToCoverage: gfx.quality === 'high',
  });
  if (src.normalScale) m.normalScale.copy(src.normalScale);
  // (modelé médian = 0,5 dans la texture : ×2)
  const c = new THREE.Color(color);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (l < 0.02) c.lerp(new THREE.Color(0x4a4442), 0.1); // crins noirs : on voit encore les mèches
  m.color.copy(c).multiplyScalar(2);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.hairTime = gfx.time;
    sh.uniforms.hairWind = gfx.wind;
    sh.uniforms.hairSway = sway;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float hairG;
uniform float hairTime;
uniform float hairWind;
uniform float hairSway;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  // Pointes des mèches qui ondulent au vent et quand le cheval court (racines immobiles).
  float hw = hairG * hairG * (0.4 + hairWind * 0.45 + hairSway);
  float ph = hairTime * 2.1 + position.y * 6.0 + position.z * 4.0;
  transformed.x += sin(ph) * 0.012 * hw;
  transformed.z += cos(ph * 0.7 + 1.3) * 0.009 * hw;
}`);
  };
  m.customProgramCacheKey = () => 'horsereal-mane';
  return m;
}

function eyeMaterial() {
  const high = gfx.quality === 'high';
  return high
    ? new THREE.MeshPhysicalMaterial({ color: 0x120a06, roughness: 0.12, clearcoat: 0.8, clearcoatRoughness: 0.08 })
    : new THREE.MeshStandardMaterial({ color: 0x140c08, roughness: 0.15 });
}

/** Ombre de contact douce, partagée (comme horseModel.js). */
let contactTex = null;
function contactShadow(R, L) {
  if (!contactTex) {
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
  m.position.y = 0.015;
  m.renderOrder = -1;
  return m;
}

// ------------------------------------------------------------------ construction

/**
 * Construit le cheval réaliste (ou null si le GLB n'est pas chargé : on prend alors le cheval sculpté).
 * look : la robe de l'animal (look.foal : poulain) ; breedId : sa race.
 */
export function buildRealHorseModel(look, breedId = null) {
  const gltf = getModel(REAL_HORSE_KEY);
  if (!gltf) return null;
  const base = prepareBase(gltf);
  const breed = horseBreedOf(look, breedId);
  const B = look.foal ? foalBuild(horseBuild(breed, look)) : horseBuild(breed, look);
  const S = shapeFor(base, B);
  const heads = S.heads;

  // Groupes animés (repère du cheval, rotation de repos nulle sauf encolure et tête) et os dessous.
  const root = new THREE.Group();
  const groups = [];
  const bones = [];
  RIG.forEach(([n, par], i) => {
    const g = new THREE.Group();
    g.name = `g${n}`;
    const pi = par ? BONE_INDEX[par] : -1;
    const worldQ = base.groupRest[i];
    if (pi < 0) {
      g.position.set(0, 0, 0); // body : origine au sol
      root.add(g);
    } else {
      const pq = base.groupRest[pi].clone().invert();
      const pp = pi === 0 ? V() : heads[pi];
      g.position.copy(heads[i]).sub(pp).applyQuaternion(pq);
      g.quaternion.copy(pq).multiply(worldQ);
      groups[pi].add(g);
    }
    g.userData.restQ = g.quaternion.clone();
    groups.push(g);
    const b = new THREE.Bone();
    b.name = n;
    // Os : sa place (l'articulation) et son orientation de repos du GLB.
    const head = pi < 0 ? heads[i] : V();
    b.position.copy(head);
    b.quaternion.copy(worldQ).invert().multiply(base.rot[i]);
    g.add(b);
    bones.push(b);
  });
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const G = (n) => groups[BONE_INDEX[n]];

  const coatSrc = base.prims.coat.material;
  const coatMat = coatMaterial(look, B, breed, {
    detail: coatSrc.map, normalMap: coatSrc.normalMap, normalSign: Math.sign(coatSrc.normalScale?.y ?? 1), hoofY: S.hoofY,
  });
  const coat = new THREE.SkinnedMesh(S.coatGeo, coatMat);
  const eyes = new THREE.SkinnedMesh(S.eyeGeo, eyeMaterial());
  const hairSway = { value: 0 };
  const mane = new THREE.SkinnedMesh(S.maneGeo, maneMaterial(base, look.mane ?? 0x1b1410, hairSway));
  for (const m of [coat, eyes, mane]) {
    m.bind(skeleton, new THREE.Matrix4());
    m.castShadow = m !== eyes;
    m.receiveShadow = true;
    m.frustumCulled = false; // (sphère de la géométrie au repos : fausse quand il broute ou galope)
    root.add(m);
  }

  const gx = S.D.scale.gx;
  const back = S.measure.backTop;
  const zSeat = -0.075;
  const L = 1.5 * (B.back ?? 1);
  const elbow = heads[BONE_INDEX.FL2];
  const torsoTop = back(zSeat);
  const belly = S.D.scale.yA2 - 0.17 * S.D.scale.gy;
  const R = (torsoTop - belly) / 2;
  root.add(contactShadow(0.3 * gx + 0.05, L * 0.95));

  const legs = LEGS.map(([k, front, side], i) => {
    const fet = heads[BONE_INDEX[k + '4']];
    const sole = fet.clone().add(S.soles[i][1]);
    sole.y = 0;
    return {
      top: G(k + '1'), pivot: G(k + '2'), knee: G(k + '3'), fetlock: G(k + '4'), front, side,
      hoof: sole, fetlockRest: fet.clone(), kneeRest: heads[BONE_INDEX[k + '3']].clone(),
      solePts: S.soles[i].map((p) => p.clone().setY(p.y + 0.003)),
    };
  });
  const headG = G('Head');
  const poll = heads[BONE_INDEX.Head];
  const hq = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), base.headTilt).invert();
  const earLocal = heads[BONE_INDEX.EarL].clone().sub(poll).applyQuaternion(hq);
  const hr = 0.105 * Math.sqrt(B.head ?? 1) * 1.1;
  const legR = 0.04 * S.D.scale.bone * 1.25;
  const model = {
    root,
    body: G('Spine'),
    neck: G('Neck'),
    head: headG,
    tail: G('Tail1'),
    tailTip: G('Tail2'),
    ears: [G('EarL'), G('EarR')],
    ribs: G('Ribs'),
    mane: [1, 2, 3, 4].map((i) => G('Mane' + i)),
    legs,
    skeleton,
    hairSway,
    coatMesh: coat,
    y0: belly + R,
    legTop: elbow.y,
    saddleY: torsoTop,
    headHeight: poll.y,
    headTilt: base.headTilt - NECK_REST,
    snoutTip: V(0, 0, S.headLen).toArray(),
    mouth: V(0, -0.2 * S.headLen, 0.86 * S.headLen),
    sdf: { torso: S.measure.torso, head: S.measure.head },
    dims: {
      L, R, hr, legR, snoutZ: S.headLen, headBack: -0.12, earZ: earLocal.z, earY: earLocal.y,
      zGirth: elbow.z - 0.14, blanket: [heads[BONE_INDEX.Spine].z - 0.24, heads[BONE_INDEX.Neck].z + 0.1],
    },
    backTop: back,
    build: B,
    foal: !!look.foal,
    horseV3: true,
    real: true,
    speedScale: heads[BONE_INDEX.FL1].y / base.rest[BONE_INDEX.FL1].y,
  };
  for (const e of model.ears) e.userData.side = e === model.ears[0] ? 1 : -1;
  model.anim = new RealHorseAnim(model, base.clips);
  model.dispose = () => model.anim.dispose();
  return model;
}

// ------------------------------------------------------------------ animation

/**
 * Mixeur d'animations d'un cheval : les clips d'allures se fondent selon la vitesse (chacun joué à
 * vitesse réelle / vitesse naturelle : les sabots posés ne glissent pas), le repos, le repos d'un
 * postérieur et le broutage selon l'occupation ; par-dessus : regard, oreilles, queue, respiration,
 * crinière qui pend (souple), tête jusqu'à l'herbe quelle que soit la race.
 */
class RealHorseAnim {
  constructor(model, clips) {
    this.model = model;
    this.mixer = new THREE.AnimationMixer(model.root);
    this.actions = {};
    this.w = {};
    for (const name of [...MOVING, 'canterR', ...STILL]) {
      const clip = clips[name];
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(name === 'idle' ? 1 : 0);
      a.time = Math.random() * clip.duration;
      this.actions[name] = a;
      this.w[name] = name === 'idle' ? 1 : 0;
    }
    this.gait = 'idle';
    this.restAmt = 0;
    this.restTimer = 8 + Math.random() * 20;
    this.maneQ = model.mane.map((m) => m.quaternion.clone());
    this.maneV = model.mane.map(() => 0);
    this.t = Math.random() * 100;
    this.lead = 'canter';
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model.root);
  }

  /**
   * Une image. st : { v (m/s, cheval de taille 1), moving, sleeping, sad, graze (0-1 : tête à l'herbe),
   * feeder (0-1 : tête à la mangeoire), turn (virage, rad/s), fat (embonpoint) }.
   * Renvoie { gait (0 pas, 1 trot, 2 galop), phase (rad) } pour le cavalier et les bruits de sabots.
   */
  update(dt, st, out = {}) {
    const md = this.model;
    if (this.reachFix === undefined) this.reachFix = this.computeReach();
    this.t += dt;
    const t = this.t;
    const u = st.moving ? st.v / md.speedScale : 0;
    // Allure voulue, avec hystérésis (pas de va-et-vient entre deux allures à la limite).
    const g0 = this.gait;
    const up = { idle: 0.05, walk: 2.15, trot: 3.9, canter: 6.3 };
    const down = { walk: 0.03, trot: 1.85, canter: 3.55, gallop: 5.8 };
    let g = g0;
    if (!st.moving || u < 0.03) g = 'idle';
    else if (g === 'idle') g = 'walk';
    for (let k = 0; k < 3; k++) {
      if (g === 'walk' && u > up.walk) g = 'trot';
      else if (g === 'trot' && u > up.trot) g = 'canter';
      else if (g === 'canter' && u > up.canter) g = 'gallop';
      else if (g === 'gallop' && u < down.gallop) g = 'canter';
      else if (g === 'canter' && u < down.canter) g = 'trot';
      else if (g === 'trot' && u < down.trot) g = 'walk';
    }
    this.gait = g;
    // Petit galop : à droite dans un virage à droite.
    if (g === 'canter' && g0 !== 'canter') this.lead = (st.turn ?? 0) < -0.2 ? 'canterR' : 'canter';
    // Repos d'un postérieur de temps en temps quand il ne fait rien.
    this.restTimer -= dt;
    if (this.restTimer <= 0) {
      this.resting = !this.resting;
      this.restTimer = this.resting ? 10 + Math.random() * 20 : 8 + Math.random() * 25;
    }
    const still = g === 'idle';
    const graze = still ? Math.max(st.graze ?? 0, st.feeder ?? 0) : 0;
    const target = { idle: 0, rest: 0, eat: 0, walk: 0, trot: 0, canter: 0, canterR: 0, gallop: 0 };
    if (still) {
      target.eat = graze;
      const r = this.resting && !st.sleeping ? 1 : 0;
      target.rest = (1 - graze) * r;
      target.idle = (1 - graze) * (1 - r);
    } else {
      target[g === 'canter' ? this.lead : g] = 1;
    }
    const k = 1 - Math.exp(-dt * (still ? 3 : 5));
    let lead = null;
    let leadW = 0;
    for (const [name, a] of Object.entries(this.actions)) {
      const was = this.w[name];
      const w = was + (target[name] - was) * k;
      this.w[name] = w;
      // Une allure qui entre se cale sur la phase de celle qui sort (moins de glissement pendant le fondu).
      if (was < 0.02 && w >= 0.02 && NATURAL_SPEED[name] && this.leadName) {
        const from = this.actions[this.leadName];
        a.time = (from.time / from.getClip().duration) * a.getClip().duration;
      }
      a.setEffectiveWeight(w);
      if (NATURAL_SPEED[name]) {
        a.timeScale = Math.min(1.8, Math.max(0.3, (u || NATURAL_SPEED[name]) / NATURAL_SPEED[name]));
        if (w > leadW) {
          lead = name;
          leadW = w;
        }
      }
    }
    if (lead && leadW > 0.3) this.leadName = lead;
    this.mixer.update(dt);
    this.overlay(dt, st, graze);
    // Pour le cavalier : allure (moyenne pondérée) et phase du clip qui mène.
    let gs = 0;
    let ws = 0;
    for (const name of [...MOVING, 'canterR']) {
      const w = this.w[name] ?? 0;
      gs += (RIDER_GAIT[name] ?? 2) * w;
      ws += w;
    }
    out.gait = ws > 0.01 ? gs / ws : 0;
    const la = this.actions[this.leadName ?? 'walk'];
    out.phase = la ? (la.time / la.getClip().duration) * Math.PI * 2 : 0;
    out.moving = ws;
    return out;
  }

  /** Procédural par-dessus les clips. */
  overlay(dt, st, graze) {
    const md = this.model;
    const t = this.t;
    // Respiration (côtes) et embonpoint (tronc plus large, membres et encolure gardent leur forme).
    const breathe = Math.sin(t * (st.sleeping ? 1.3 : 2.1)) * (st.moving ? 0.006 : 0.014);
    md.ribs.scale.set(1 + breathe, 1 + breathe * 0.7, 1 + breathe * 0.2);
    const fat = st.fat ?? 1;
    md.body.scale.set(fat, 1 + (fat - 1) * 0.3, 1);
    if (fat !== 1) {
      for (const c of [md.neck, md.tail, ...md.legs.map((l) => l.top)]) c.scale.set(1 / fat, 1 / (1 + (fat - 1) * 0.3), 1);
    }
    // Somnolence : encolure basse, oreilles sur le côté ; tristesse : tête un peu basse.
    this.doze = (this.doze ?? 0) + ((st.sleeping ? 1 : 0) - (this.doze ?? 0)) * Math.min(1, dt * 1.5);
    this.sadAmt = (this.sadAmt ?? 0) + ((st.sad && !st.moving ? 1 : 0) - (this.sadAmt ?? 0)) * Math.min(1, dt * 1.5);
    const neckDrop = this.doze * 0.42 + this.sadAmt * 0.25 * (1 - graze);
    // Broutage : le clip pose le bout du nez à l'herbe pour le modèle d'origine ; pour une autre race
    // (membres, encolure, tête différents) on corrige l'angle de l'encolure.
    const reach = this.reachFix * (this.w.eat ?? 0);
    const feeder = (st.feeder ?? 0) * (this.w.eat ?? 0) * -0.42;
    if (neckDrop || reach || feeder) md.neck.rotateX(neckDrop + reach + feeder);
    if (this.doze) md.head.rotateX(this.doze * 0.12);
    // Regard qui se promène (moins en marche).
    const look = (Math.sin(t * 0.37) * 0.5 + Math.sin(t * 0.13 + 1.7) * 0.5) * 0.32 * (st.moving ? 0.15 : 1) * (1 - graze * 0.7);
    md.neck.quaternion.premultiply(_qYaw.setFromAxisAngle(AXIS_Y, look));
    // Oreilles : elles pivotent vers ce qu'il écoute ; sur le côté quand il somnole.
    md.ears.forEach((e, i) => {
      const s = i === 0 ? 1 : -1;
      const n1 = Math.sin(t * 1.3 + i * 2.1) + Math.sin(t * 0.47 + i);
      e.rotateX(n1 * 0.06 + this.doze * 0.2);
      e.rotateZ(-s * (this.doze * 0.45 + Math.max(0, Math.sin(t * 0.9 + i * 1.7)) * 0.12));
      e.rotateY(s * Math.sin(t * 0.7 + i * 3) * 0.3 * (1 - this.doze));
    });
    // Queue : de temps en temps un coup de fouet contre les mouches.
    const swish = Math.sin(t * 0.23 + (md.root.id % 7)) > 0.9 ? Math.sin(t * 9) * 0.35 : 0;
    if (swish) {
      md.tail.rotateZ(swish * 0.6);
      md.tailTip.rotateZ(swish);
    }
    // Crinière : elle pend (pesanteur) au lieu de suivre l'encolure, avec un peu de retard (souple).
    // relN : rotation de l'encolure dans le repère du cheval ; rel : depuis son repos.
    md.root.updateMatrixWorld(false);
    md.neck.updateWorldMatrix(true, false);
    const relN = _q.setFromRotationMatrix(md.root.matrixWorld).invert().multiply(_q2.setFromRotationMatrix(md.neck.matrixWorld));
    const rel = _qa.copy(relN).multiply(QNECK_REST_INV);
    const relNinv = _qc.copy(relN).invert();
    const kk = 1 - Math.exp(-dt * 9);
    const flutter = Math.min(1, (st.v ?? 0) / 6) * 0.08 + 0.01;
    md.mane.forEach((m, i) => {
      // monde voulu : entre « suit l'encolure » (rel) et « pend comme au repos » (identité)
      const want = _qb.copy(rel).slerp(QI, 0.55 + i * 0.08);
      const local = want.premultiply(relNinv);
      this.maneQ[i].slerp(local, kk);
      m.quaternion.copy(this.maneQ[i]);
      m.rotateZ(Math.sin(t * 5 + i * 0.8) * flutter);
    });
    md.hairSway.value = Math.min(2.5, (st.v ?? 0) * 0.45) + (Math.abs(swish) > 0.2 ? 1 : 0);
    // Sabots jamais sous le sol (fondu entre deux clips, proportions de la race) : on relève le corps.
    let low = 0;
    for (const l of md.legs) {
      l.fetlock.updateWorldMatrix(true, false);
      for (const p of l.solePts) {
        _v.copy(p).applyMatrix4(l.fetlock.matrixWorld);
        md.root.worldToLocal(_v);
        low = Math.min(low, _v.y);
      }
    }
    if (low < 0) md.body.position.y -= low;
  }

  /** Correction d'angle de l'encolure pour que le bout du nez touche l'herbe (pose « eat » de cette race). */
  computeReach() {
    const md = this.model;
    const a = this.actions.eat;
    if (!a) return 0;
    // pose eat seule, à mi-clip
    const saved = Object.entries(this.actions).map(([n, x]) => [x, x.getEffectiveWeight(), x.time]);
    for (const [x] of saved) x.setEffectiveWeight(0);
    a.setEffectiveWeight(1);
    a.time = a.getClip().duration * 0.5;
    this.mixer.update(0);
    const muzzle = () => {
      md.root.updateMatrixWorld(true);
      _v.set(0, -0.12 * md.dims.snoutZ, md.dims.snoutZ * 0.97).applyMatrix4(md.head.matrixWorld);
      return md.root.worldToLocal(_v).y;
    };
    // L'encolure tourne autour de sa base : on cherche l'angle qui met le bout du nez à 3 cm du sol.
    let fix = 0;
    const neckQ = md.neck.quaternion.clone();
    for (let i = 0; i < 6; i++) {
      md.neck.quaternion.copy(neckQ);
      md.neck.rotateX(fix);
      const y = muzzle() - 0.03;
      if (Math.abs(y) < 0.004) break;
      const lever = Math.max(0.4, md.dims.snoutZ + 0.6);
      fix += y / lever;
    }
    md.neck.quaternion.copy(neckQ);
    for (const [x, w, time] of saved) {
      x.setEffectiveWeight(w);
      x.time = time;
    }
    return Math.max(-0.5, Math.min(0.5, fix));
  }
}

const QNECK_REST = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), NECK_REST);
const QNECK_REST_INV = QNECK_REST.clone().invert();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const QI = new THREE.Quaternion();
const _qYaw = new THREE.Quaternion();
const AXIS_Y = V(0, 1, 0);

/**
 * Animation d'une entité (AnimalEntity) au cheval réaliste : ce qu'il fait (allure selon sa vitesse,
 * broutage, repos, somnolence) ; renseigne e.gait et e.phase (cavalier, bruits de sabots).
 */
export function animateRealHorse(e, dt, sad) {
  const md = e.model;
  const v = e.speed / Math.max(0.3, e.scale);
  const moving = e.speed > 0.05 && !e.sleeping;
  const t = e.time;
  e.grazeSeed ??= Math.random() * 10;
  const grazing = e.state === 'idle' && !e.sleeping && !e.herdCtrl && !e.ridden && Math.sin(t * 0.3 + e.grazeSeed) > 0.2;
  // (tête à l'herbe ou à la mangeoire : lissé, elle descend et remonte en douceur)
  e.grazeAmt = (e.grazeAmt ?? 0) + ((grazing ? 1 : 0) - (e.grazeAmt ?? 0)) * Math.min(1, dt * 1.2);
  e.feedAmt = (e.feedAmt ?? 0) + ((e.state === 'eat' ? 1 : 0) - (e.feedAmt ?? 0)) * Math.min(1, dt * 1.5);
  const heading = e.heading;
  const turn = e.lastHeading === undefined ? 0 : Math.atan2(Math.sin(heading - e.lastHeading), Math.cos(heading - e.lastHeading)) / Math.max(1e-3, dt);
  e.lastHeading = heading;
  const w = e.data.weight ?? 50;
  const st = e.realSt ??= {};
  st.v = v;
  st.moving = moving;
  st.sleeping = e.sleeping;
  st.sad = sad;
  st.graze = e.grazeAmt;
  st.feeder = e.feedAmt;
  st.turn = turn;
  st.fat = 1 + (w - 50) / 50 * 0.18;
  const o = md.anim.update(dt, st, e.realOut ??= {});
  e.gait = o.gait;
  e.phase = o.phase;
  e.headDown = Math.max(e.grazeAmt, e.feedAmt);
}
