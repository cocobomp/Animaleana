// Lapins réalistes : deux modèles d'artistes pour les 6 races (src/sim/rabbitLook.js) — le lapin gris de Dakota.Hinkle
// (Sketchfab, « Rabbit », CC-BY 4.0) pour toutes les races sauf le bélier, le bélier fauve de FourthGreen (Sketchfab,
// « Rabbit Rigged », CC-BY 4.0) pour le bélier —, préparés et animés pour le jeu (public/models/rabbit.glb,
// rabbit_lop.glb ; tools/lapin/).
//
// Comme les chats (catReal.js) et les chiens (dogReal.js), le GLB n'est qu'une source : à son arrivée on en tire une
// fois pour toutes la géométrie de repos, le squelette, les clips et les repères du corps. Chaque race a sa géométrie,
// partagée par les lapins de cette race : les os sont déplacés (pattes, dos, tronc, encolure, tête, museau, oreilles,
// pompon) et la peau les suit ; le poil long épaissit la silhouette (angora, crinière du tête de lion) et des cartes de
// poils la frangent. Chaque lapin a son squelette, ses matières (robe peinte par le shader de rabbitCoat.js) et son
// mixeur d'animations.
//
// Interface : la même que le lapin procédural (animalModel.js), qui reste le modèle de repli tant que le GLB n'est pas
// là, avec le drapeau md.realRabbit (AnimalEntity.animate aiguille vers animateRealRabbit). Repère : regard vers +Z,
// y vers le haut, origine au sol sous le milieu du corps ; lapin « de taille 1 » (nez-croupe 0,35 m), l'échelle de la
// race est appliquée par AnimalEntity.

import * as THREE from 'three';
import { getModel } from '../assets.js';
import { gfx } from '../gfx.js';
import { horseView } from './horseReal.js';
import { rabbitBuild } from '../../sim/rabbitLook.js';
import { rabbitCoatPlan, makeRabbitCoatUniforms, makeRabbitLandUniforms, setRabbitCoat, rabbitCoatMaterial } from './rabbitCoat.js';
import {
  V, smooth, clamp, WindowMin, addWhiskers, restPrims, weldGroups, weldedNormals, furLow, fbm, emptyBoneBoxes, growBoneBoxes, PetMesh, contactShadow, raiseAngle,
} from './petReal.js';

/** Clés des deux GLB (assets.js) : jamais « rabbit » (gltfAnimal.js le prendrait pour un animal GLB générique). */
export const REAL_RABBIT_KEYS = { up: 'rabbit_up', lop: 'rabbit_lop' };
/** Version réduite au-delà de cette distance à la caméra (m, divisée par la taille du lapin) ; hystérésis 10 %. */
export const RABBIT_LOD_DIST = { low: 4.5, high: 10 };
/** Lapin hors du champ : animé une image sur OFFSCREEN_STEP, avec le temps cumulé (comme les autres animaux). */
export const OFFSCREEN_STEP = 3;
/** Lapin au loin (version réduite) : animé une image sur FAR_STEP. */
export const FAR_STEP = 2;
/** Vitesses « naturelles » des allures (m/s, lapin de taille 1) si le GLB ne les donne pas. */
export const NATURAL_SPEED = { hop: 0.29, lope: 0.8, run: 1.5 };

const MOVING = ['hop', 'lope', 'run'];
const LEG_KEYS = [['FL', 'L', true], ['FR', 'R', true], ['HL', 'L', false], ['HR', 'R', false]];
const LEG_BONES = { front: ['humerus', 'radius', 'metacarpus', 'toes'], hind: ['femur', 'tibia', 'metatarsus', 'htoes'] };

// Ce qui garde sa couleur d'origine dans la texture (truffe, intérieur des oreilles ; yeux peints du bélier).
const MODEL = {
  up: { keep: { pink: true, nose: [0.012, 0.3] }, grain: 0.75 },
  lop: { keep: { pink: true, dark: 0.05, nose: [0.012, 0.28] }, grain: 0.6 },
};

const _v = V();
const _w = V();
const _u = V();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _rt = V();
const _rs = V();

// ------------------------------------------------------------------ données de repos (une fois par GLB)

/**
 * Positions de la peau dans une pose d'un clip (repère de l'animal) : la robe est peinte d'après la pose accroupie (le
 * bélier de FourthGreen est lié à demi assis : ses repères ventre, dos, poitrail seraient penchés).
 */
function clipPositions(gltf, clipName, R, prim) {
  const clip = gltf.animations.find((c) => c.name === clipName);
  const scene = gltf.scene;
  const bonesByName = new Map();
  scene.traverse((o) => { if (o.isBone) bonesByName.set(o.name, o); });
  const saved = [...bonesByName.values()].map((b) => [b, b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
  let mats = null;
  if (clip) {
    const mixer = new THREE.AnimationMixer(scene);
    const a = mixer.clipAction(clip);
    a.play();
    mixer.update(0);
    scene.updateMatrixWorld(true);
    mats = R.names.map((n, k) => {
      const b = bonesByName.get(n);
      const inv = R.restW[k].clone().invert();
      return b ? new THREE.Matrix4().multiplyMatrices(R.toPet, b.matrixWorld).multiply(inv) : new THREE.Matrix4();
    });
    a.stop();
    mixer.uncacheRoot(scene);
  }
  for (const [b, p, q, s] of saved) {
    b.position.copy(p);
    b.quaternion.copy(q);
    b.scale.copy(s);
  }
  scene.updateMatrixWorld(true);
  const out = new Float32Array(prim.count * 3);
  if (!mats) {
    out.set(prim.pos);
    return out;
  }
  for (let i = 0; i < prim.count; i++) {
    _w.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const wt = prim.sw[i * 4 + k];
      if (!(wt > 0)) continue;
      _v.fromArray(prim.pos, i * 3).applyMatrix4(mats[prim.si[i * 4 + k]]);
      _w.addScaledVector(_v, wt);
    }
    out.set([_w.x, _w.y, _w.z], i * 3);
  }
  return out;
}

/** Repères d'un corps (ventre, dos, largeur, nez, yeux, pompon) mesurés sur des positions de la peau. */
function landmarks(base, pos, eyePos) {
  const { W, part, heads, index } = base;
  const coat = base.prims.coat;
  const n = coat.count;
  const B = (nm) => index.get(nm) ?? -1;
  const hipZ = (heads[B('femurL')].z + heads[B('femurR')].z) / 2;
  const shZ = (heads[B('humerusL')].z + heads[B('humerusR')].z) / 2;
  let bellyY = Infinity;
  let topY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let noseZ = -Infinity;
  let nose = V();
  const z0 = hipZ + 0.25 * (shZ - hipZ);
  const z1 = shZ - 0.25 * (shZ - hipZ);
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    if (W.nose[i] > 0.5 && z > noseZ) {
      noseZ = z;
      nose = V(x, y, z);
    }
    if (part[i * 4 + 3] < 0.05 && W.tail[i] < 0.05 && W.head[i] < 0.05 && W.neck[i] < 0.5 && z > Math.min(z0, z1) && z < Math.max(z0, z1)) {
      bellyY = Math.min(bellyY, y);
      topY = Math.max(topY, y);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }
  const midX = Number.isFinite(minX) ? (minX + maxX) / 2 : 0;
  // Tête : centre des sommets de la tête (sans les oreilles).
  const hc = V();
  let hn = 0;
  let headMaxX = 0;
  for (let i = 0; i < n; i++) {
    if (W.head[i] < 0.7 || W.ear[i * 2] + W.ear[i * 2 + 1] > 0.1) continue;
    hc.x += pos[i * 3];
    hc.y += pos[i * 3 + 1];
    hc.z += pos[i * 3 + 2];
    hn++;
  }
  if (hn) hc.multiplyScalar(1 / hn);
  for (let i = 0; i < n; i++) {
    if (W.head[i] < 0.7 || W.ear[i * 2] + W.ear[i * 2 + 1] > 0.1) continue;
    if (Math.abs(pos[i * 3 + 2] - hc.z) < 0.012) headMaxX = Math.max(headMaxX, Math.abs(pos[i * 3] - midX));
  }
  // Yeux : sommets de la pièce des yeux (lapin de Dakota), sinon sur les flancs de la tête, devant son centre.
  const eyes = [1, -1].map((side) => {
    const c = V();
    let cnt = 0;
    const e = base.prims.eye;
    if (e && eyePos) {
      for (let i = 0; i < e.count; i++) {
        if (Math.sign(eyePos[i * 3] - midX) !== side) continue;
        c.x += eyePos[i * 3];
        c.y += eyePos[i * 3 + 1];
        c.z += eyePos[i * 3 + 2];
        cnt++;
      }
    }
    if (cnt) c.multiplyScalar(1 / cnt);
    else c.set(midX + side * headMaxX * 0.78, hc.y + 0.25 * (nose.y - hc.y) + 0.012, hc.z + 0.45 * (noseZ - hc.z));
    let r = 0;
    if (cnt) for (let i = 0; i < e.count; i++) if (Math.sign(eyePos[i * 3] - midX) === side) r += _v.fromArray(eyePos, i * 3).distanceTo(c);
    return { c, r: cnt ? r / cnt : 0.008 };
  });
  // Base du pompon : tête de l'os de la queue.
  const tb = base.tailBones.length ? heads[base.tailBones[0]] : V(midX, topY * 0.7, hipZ - 0.05);
  let tailBase = tb.clone();
  if (base.tailBones.length) {
    // (dans la pose : centre des sommets de la queue)
    const c = V();
    let k = 0;
    for (let i = 0; i < n; i++) {
      if (W.tail[i] < 0.6) continue;
      c.x += pos[i * 3];
      c.y += pos[i * 3 + 1];
      c.z += pos[i * 3 + 2];
      k++;
    }
    if (k) tailBase = c.multiplyScalar(1 / k);
  }
  return {
    hipZ, shZ, bellyY, topY, midX, halfW: (maxX - minX) / 2,
    head: hc, noseZ, nose, eyes,
    eyeX: Math.abs(eyes[0].c.x - eyes[1].c.x) / 2, eyeY: (eyes[0].c.y + eyes[1].c.y) / 2, eyeZ: (eyes[0].c.z + eyes[1].c.z) / 2,
    elbowY: (heads[B('radiusL')].y + heads[B('radiusR')].y) / 2,
    tailBase, neckZ: (heads[B('neck1')].z + heads[B('head')].z) / 2,
  };
}

/**
 * Géométrie, squelette, clips et repères de repos tirés d'un GLB de lapin, dans le repère du lapin. Gardé dans
 * gltf.userData (calculé une fois : Game.onRealRabbits le fait hors de l'image en cours).
 */
export function realRabbitBase(gltf, kind) {
  if (gltf.userData.rabbitBase) return gltf.userData.rabbitBase;
  const R = restPrims(
    gltf,
    (m) => (m.material?.name === 'rabbit_eye' ? 'eye' : 'coat'),
    (o) => !!(o.userData.lod || o.parent?.userData?.lod || /rabbit_lod/.test(o.name) || /rabbit_lod/.test(o.parent?.name ?? '')),
  );
  const { names, index, parent, heads, rotW, prims } = R;
  const nb = names.length;
  const B = (n) => index.get(n) ?? -1;
  const desc = (i, set = new Set()) => {
    if (i < 0) return set;
    set.add(i);
    for (let k = 0; k < nb; k++) if (parent[k] === i) desc(k, set);
    return set;
  };
  const legBone = (s, front, k) => {
    const nm = (front ? LEG_BONES.front : LEG_BONES.hind)[k] + s;
    return B(nm);
  };
  const legSets = LEG_KEYS.map(([, s, front]) => new Set([0, 1, 2, 3].map((k) => legBone(s, front, k)).filter((i) => i >= 0)));
  const earSets = ['L', 'R'].map((s) => {
    const set = new Set();
    for (let k = 1; B(`ear${k}${s}`) >= 0; k++) set.add(B(`ear${k}${s}`));
    return set;
  });
  const tailBones = [];
  for (let k = 1; B('tail' + k) >= 0; k++) tailBones.push(B('tail' + k));
  const tailSet = new Set(tailBones);
  const headSet = desc(B('head'));
  const neckSet = new Set([B('neck1'), B('neck2')].filter((i) => i >= 0));
  const noseOut = new Set([...earSets[0], ...earSets[1]]);
  const legOfBone = new Int8Array(nb).fill(-1);
  legSets.forEach((s, j) => s.forEach((i) => { legOfBone[i] = j; }));

  const coat = prims.coat;
  const n = coat.count;
  const W = {
    leg: new Float32Array(n * 4), ear: new Float32Array(n * 2), tail: new Float32Array(n), head: new Float32Array(n),
    neck: new Float32Array(n), nose: new Float32Array(n), paw: new Float32Array(n),
  };
  const pawBones = new Set(LEG_KEYS.map(([, s, front]) => [legBone(s, front, 2), legBone(s, front, 3)]).flat().filter((i) => i >= 0));
  const part = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) {
      const w = coat.sw[i * 4 + k];
      if (!w) continue;
      const b = coat.si[i * 4 + k];
      const l = legOfBone[b];
      if (l >= 0) W.leg[i * 4 + l] += w;
      if (earSets[0].has(b)) W.ear[i * 2] += w;
      if (earSets[1].has(b)) W.ear[i * 2 + 1] += w;
      if (tailSet.has(b)) W.tail[i] += w;
      if (headSet.has(b)) W.head[i] += w;
      if (neckSet.has(b)) W.neck[i] += w;
      if (headSet.has(b) && !noseOut.has(b)) W.nose[i] += w;
      if (pawBones.has(b)) W.paw[i] += w;
    }
    const legSum = Math.min(1, W.leg[i * 4] + W.leg[i * 4 + 1] + W.leg[i * 4 + 2] + W.leg[i * 4 + 3]);
    part.set([Math.min(1, W.ear[i * 2] + W.ear[i * 2 + 1]), W.tail[i], W.head[i], legSum], i * 4);
  }
  const boneW = names.map((_, i) => ({
    leg: legOfBone[i], ear: earSets[0].has(i) ? 0 : earSets[1].has(i) ? 1 : -1,
    tail: tailSet.has(i), head: headSet.has(i), neck: neckSet.has(i), nose: headSet.has(i) && !noseOut.has(i),
  }));
  const base = { kind, names, index, parent, heads, rotW, prims, W, part, boneW, tailBones, earSets };
  // Repères au repos (déformation des races) et dans la pose accroupie (robe : régions du corps).
  const land = landmarks(base, coat.pos, prims.eye?.pos);
  const crouch = clipPositions(gltf, 'idle', R, coat);
  const crouchEye = prims.eye ? clipPositions(gltf, 'idle', R, prims.eye) : null;
  const paint = landmarks(base, crouch, crouchEye);
  // Bouts des oreilles (le plus loin de leur base).
  const earTip = [0, 1].map((s) => {
    const b1 = B(s === 0 ? 'ear1L' : 'ear1R');
    const f = b1 >= 0 ? heads[b1] : heads[B('head')];
    let best = f.clone();
    let bd = -1;
    for (let i = 0; i < n; i++) {
      if (W.ear[i * 2 + s] < 0.5) continue;
      const d = _v.fromArray(coat.pos, i * 3).distanceTo(f);
      if (d > bd) {
        bd = d;
        best = _v.clone();
      }
    }
    return best;
  });
  coat.weld = weldGroups(coat.pos, n);
  coat.nrmCalc = weldedNormals(coat.pos, coat.index, coat.weld, n);

  const clips = {};
  for (const c of gltf.animations) clips[c.name] = c;
  const ext = gltf.scene.userData?.rabbit ?? {};
  Object.assign(base, {
    land, paint, earTip, eyes: land.eyes, clips,
    natural: { ...NATURAL_SPEED, ...(ext.naturalSpeeds ?? {}) },
    earRest: ext.earRest ?? (kind === 'lop' ? 'lop' : 'up'),
    cfg: MODEL[kind] ?? MODEL.up,
  });
  // Attributs communs à toutes les races (robe) : position dans la pose accroupie du modèle d'origine, appartenance,
  // grain du poil.
  const low = furLow(coat.material.map?.image, coat.uv, coat.pos, coat.index, n);
  base.means = low.none ? null : { lo: low.lo, hi: low.hi };
  base.attrs = {
    cmpRest: new THREE.BufferAttribute(crouch, 3),
    cmpPart: new THREE.BufferAttribute(part, 4),
    cmpLow: new THREE.BufferAttribute(low.low, 1),
  };
  if (prims.eye) {
    const ne = prims.eye.count;
    const ep = new Float32Array(ne * 4);
    for (let i = 0; i < ne; i++) ep[i * 4 + 2] = 1;
    base.eyeAttrs = {
      cmpRest: new THREE.BufferAttribute(crouchEye ?? prims.eye.pos.slice(), 3),
      cmpPart: new THREE.BufferAttribute(ep, 4),
      cmpLow: new THREE.BufferAttribute(new Float32Array(ne), 1),
    };
  }
  base.landUniforms = makeRabbitLandUniforms(paint);
  for (const p of Object.values(prims)) {
    for (const m of p.materials ?? [p.material]) for (const k of ['map', 'normalMap', 'aoMap']) if (m?.[k]) m[k].userData.shared = true;
  }
  gltf.userData.rabbitBase = base;
  return base;
}

// ------------------------------------------------------------------ géométrie d'une race (par ses os)

/**
 * Déformation d'une race : les os sont déplacés (pattes raccourcies ou allongées, dos, tronc, encolure, tête grossie,
 * museau raccourci, yeux, oreilles plus courtes, plus larges, écartées, pompon) et la peau suit avec les poids du
 * squelette ; le poil long pousse la surface le long de sa normale (angora partout, crinière et jupe du tête de lion).
 * Mêmes passes sur les sommets, les articulations (têtes des os) et les yeux. Pure fonction des données de repos et du
 * gabarit B (tests en node).
 */
export function deformRabbit(base, B) {
  const coat = base.prims.coat;
  const n = coat.count;
  const P = coat.pos.slice();
  const N = coat.nrm.slice();
  const H = base.heads.map((h) => h.clone());
  const nbn = H.length;
  const W = base.W;
  const bw = base.boneW;
  const L = base.land;
  const I = (nm) => base.index.get(nm) ?? -1;
  const eye = base.prims.eye;
  const EP = eye ? eye.pos.slice() : null;
  const EN = eye ? eye.nrm.slice() : null;
  const ne = eye ? eye.count : 0;
  const EC = base.eyes.map((e) => e.c.clone());
  const get = (j, out) => (j < n ? out.fromArray(P, j * 3) : j < n + nbn ? out.copy(H[j - n]) : j < n + nbn + ne ? out.fromArray(EP, (j - n - nbn) * 3) : out.copy(EC[j - n - nbn - ne]));
  const set = (j, v) => {
    if (j < n) P.set([v.x, v.y, v.z], j * 3);
    else if (j < n + nbn) H[j - n].copy(v);
    else if (j < n + nbn + ne) EP.set([v.x, v.y, v.z], (j - n - nbn) * 3);
    else EC[j - n - nbn - ne].copy(v);
  };
  const total = n + nbn + ne + EC.length;
  const isEye = (j) => j >= n + nbn;
  const headI = I('head');
  const wLeg = (j, l) => (j < n ? W.leg[j * 4 + l] : j < n + nbn ? (bw[j - n].leg === l ? 1 : 0) : 0);
  const wHead = (j) => (j < n ? W.head[j] : j < n + nbn ? (bw[j - n].head ? 1 : 0) : 1);
  const wNose = (j) => (j < n ? W.nose[j] : j < n + nbn ? (bw[j - n].nose ? 1 : 0) : 0);
  const wNeck = (j) => (j < n ? W.neck[j] : j < n + nbn ? (bw[j - n].neck ? 1 : 0) : 0);
  const wTail = (j) => (j < n ? W.tail[j] : j < n + nbn ? (bw[j - n].tail ? 1 : 0) : 0);
  const wEar = (j, s) => (j < n ? W.ear[j * 2 + s] : j < n + nbn ? (bw[j - n].ear === s ? 1 : 0) : 0);
  const p = V();
  const d = V();
  const rot = (v, q, c) => v.sub(c).applyQuaternion(q).add(c);
  const legTop = LEG_KEYS.map(([, s, front]) => I((front ? 'humerus' : 'femur') + s));
  const legEnd = LEG_KEYS.map(([, s, front]) => I((front ? 'metacarpus' : 'metatarsus') + s));
  const T0 = legTop.map((i) => H[i].clone());

  // 1. Pattes : raccourcies ou allongées entre l'épaule (la hanche) et le poignet (le jarret), le pied suit sans se
  //    déformer ; épaissies autour de leur axe.
  for (let l = 0; l < 4; l++) {
    if (legTop[l] < 0 || legEnd[l] < 0) continue;
    const T = H[legTop[l]].clone();
    const Wr = H[legEnd[l]].clone();
    const a = Wr.clone().sub(T);
    const len = a.length();
    a.normalize();
    const k = B.legs;
    for (let j = 0; j < total; j++) {
      const w = wLeg(j, l);
      if (!(w > 0)) continue;
      get(j, p);
      d.copy(p).sub(T);
      const al = d.dot(a);
      const perp = _u.copy(d).addScaledVector(a, -al);
      const a2 = al <= 0 ? al : al < len ? al * k : len * k + (al - len);
      p.addScaledVector(a, w * (a2 - al)).addScaledVector(perp, w * (B.legW - 1) * smooth(0, 0.02, al));
      set(j, p);
    }
  }
  // 2. Tronc : dos plus long ou plus court (chaque patte suit son épaule ou sa hanche), tronc plus large.
  const za = Math.min(L.hipZ, L.shZ) + 0.01;
  const zb = Math.max(L.hipZ, L.shZ) - 0.01;
  const zm = (za + zb) / 2;
  const zoff = (z) => (B.back - 1) * (clamp(z, za, zb) - zm);
  const trunkZ = (z) => smooth(L.hipZ - 0.07, L.hipZ + 0.01, z) * (1 - smooth(L.shZ - 0.01, L.shZ + 0.06, z));
  for (let j = 0; j < total; j++) {
    get(j, p);
    let lw = 0;
    let dz = 0;
    let dx = 0;
    for (let l = 0; l < 4; l++) {
      const w = wLeg(j, l);
      if (!(w > 0)) continue;
      lw += w;
      dz += w * zoff(T0[l].z);
      dx += w * (B.girth - 1) * (T0[l].x - L.midX) * trunkZ(T0[l].z);
    }
    lw = Math.min(1, lw);
    const body = (1 - lw) * (1 - wHead(j)) * (1 - wTail(j));
    const tz = trunkZ(p.z);
    p.x = p.x + dx + body * (p.x - L.midX) * (B.girth - 1) * tz * (1 - 0.4 * wNeck(j));
    // (un tronc plus large est aussi un peu plus haut : le dos s'arrondit)
    if (B.girth !== 1) p.y += body * tz * (B.girth - 1) * 0.5 * Math.max(0, p.y - L.bellyY);
    p.z += dz + (1 - lw) * zoff(p.z);
    set(j, p);
  }
  // 3. Encolure plus longue ou plus courte : la tête suit d'un bloc.
  if (B.neck !== 1 && I('neck1') >= 0) {
    const N0 = H[I('neck1')].clone();
    const HJ = H[headI].clone();
    const a = HJ.clone().sub(N0);
    const len = a.length();
    a.normalize();
    for (let j = 0; j < total; j++) {
      const wh = wHead(j);
      const wn = wNeck(j);
      if (!(wh > 0 || wn > 0)) continue;
      get(j, p);
      const s = clamp(_u.copy(p).sub(N0).dot(a) / len, 0, 1);
      p.addScaledVector(a, (B.neck - 1) * len * (wh + wn * s));
      set(j, p);
    }
  }
  // 4. Tête plus grosse ou plus petite (oreilles et yeux compris), autour de l'os de la tête ; plus large (joues).
  if (B.head !== 1 || B.headW !== 1) {
    const HJ = H[headI].clone();
    for (let j = 0; j < total; j++) {
      const wh = wHead(j);
      if (!(wh > 0)) continue;
      get(j, p);
      p.sub(HJ).multiplyScalar(1 + wh * (B.head - 1));
      p.x *= 1 + wh * (B.headW - 1) * (isEye(j) ? 0.6 : 1);
      p.add(HJ);
      set(j, p);
    }
  }
  // 5. Museau plus court ou plus long, plus large ou plus fin, devant les yeux.
  const E = EC[0].clone().add(EC[1]).multiplyScalar(0.5);
  if (B.snout !== 1 || B.muzzleW !== 1) {
    const HJ = H[headI].clone();
    const nose0 = L.nose.clone().sub(base.heads[headI]).multiplyScalar(B.head).add(HJ);
    const f = nose0.clone().sub(E);
    f.x = 0;
    const flen = f.length();
    f.normalize();
    const side = V(1, 0, 0);
    const eyeR = (base.eyes[0].r + base.eyes[1].r) * 0.5 * B.head;
    for (let j = 0; j < total; j++) {
      const w = wNose(j);
      if (!(w > 0) || isEye(j)) continue;
      get(j, p);
      d.copy(p).sub(E);
      const t = d.dot(f);
      if (t <= 0) continue;
      const on = smooth(eyeR * 0.9, eyeR * 0.9 + 0.3 * flen, t);
      const lat = d.dot(side);
      p.addScaledVector(f, w * (t - eyeR * 0.9) * (B.snout - 1) * on).addScaledVector(side, w * lat * (B.muzzleW - 1) * on);
      set(j, p);
    }
  }
  // 6. Yeux plus gros (nain, lapereau) : chaque globe autour de son centre.
  if (B.eyes !== 1 && EP) {
    for (let i = 0; i < ne; i++) {
      p.fromArray(EP, i * 3);
      const c = Math.sign(p.x - L.midX) > 0 ? EC[0] : EC[1];
      p.sub(c).multiplyScalar(B.eyes).add(c);
      EP.set([p.x, p.y, p.z], i * 3);
    }
  }
  // 7. Oreilles : longueur (le long de leur axe, depuis la base), largeur, écartées vers l'extérieur.
  for (let s = 0; s < 2; s++) {
    const sd = s === 0 ? 1 : -1;
    const b1 = I(s === 0 ? 'ear1L' : 'ear1R');
    if (b1 < 0) continue;
    const bp = H[b1].clone();
    const tip = base.earTip[s].clone().sub(base.heads[b1]).multiplyScalar(B.head).add(bp);
    const ax = tip.clone().sub(bp);
    ax.normalize();
    const lat = V(1, 0, 0).addScaledVector(ax, -ax.x).normalize();
    const out = B.earOut ? new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -sd * B.earOut) : null;
    for (let j = 0; j < total; j++) {
      const we = wEar(j, s);
      if (!(we > 0)) continue;
      get(j, p);
      d.copy(p).sub(bp);
      const al = d.dot(ax);
      const lw = d.dot(lat);
      // (la base reste où elle est : seule la partie au-delà de 15 % de la longueur s'allonge)
      const along = Math.max(0, al) * (B.earLen - 1);
      p.addScaledVector(ax, we * along).addScaledVector(lat, we * lw * (B.earW - 1));
      if (out) rot(p, _q.identity().slerp(out, we), bp);
      set(j, p);
      if (j < n && out) {
        _w.fromArray(N, j * 3).applyQuaternion(_q.identity().slerp(out, we));
        N.set([_w.x, _w.y, _w.z], j * 3);
      }
    }
  }
  // 8. Pompon plus gros ou plus petit, autour de la base de la queue.
  if (B.tail !== 1 && base.tailBones.length) {
    const c = H[base.tailBones[0]].clone();
    for (let j = 0; j < total; j++) {
      const w = wTail(j);
      if (!(w > 0)) continue;
      get(j, p);
      p.sub(c).multiplyScalar(1 + w * (B.tail - 1)).add(c);
      set(j, p);
    }
  }
  // 9. Pieds au sol : le lapin descend (ou monte) de ce que ses pattes ont perdu (avant et arrière séparément).
  let minF = Infinity;
  let minH = Infinity;
  let minF0 = Infinity;
  let minH0 = Infinity;
  for (let i = 0; i < n; i++) {
    const lf = W.leg[i * 4] + W.leg[i * 4 + 1];
    const lh = W.leg[i * 4 + 2] + W.leg[i * 4 + 3];
    const y = P[i * 3 + 1];
    const y0 = coat.pos[i * 3 + 1];
    if (lf > 0.6) {
      minF = Math.min(minF, y);
      minF0 = Math.min(minF0, y0);
    }
    if (lh > 0.6) {
      minH = Math.min(minH, y);
      minH0 = Math.min(minH0, y0);
    }
  }
  const dropF = Number.isFinite(minF) ? minF - minF0 : 0;
  const dropH = Number.isFinite(minH) ? minH - minH0 : 0;
  const dropAt = (z) => dropH + (dropF - dropH) * clamp((z - L.hipZ) / Math.max(0.05, L.shZ - L.hipZ), 0, 1);
  const legZ = LEG_KEYS.map((_, l) => (legTop[l] >= 0 ? H[legTop[l]].z : 0));
  for (let j = 0; j < total; j++) {
    get(j, p);
    let lw = 0;
    let dy = 0;
    for (let l = 0; l < 4; l++) {
      const w = wLeg(j, l);
      if (!(w > 0)) continue;
      lw += w;
      dy += w * dropAt(legZ[l]);
    }
    lw = Math.min(1, lw);
    p.y -= dy + (1 - lw) * dropAt(p.z);
    set(j, p);
  }
  // 10. Poil : long (angora : partout, moins sur le bout des pattes, le museau et les oreilles ; poussé le long de la
  //     normale), crinière du tête de lion (nuque, joues, cou, poitrail), jupe (bas des flancs) ; ras (rex).
  const furW = new Float32Array(n);
  if (Math.abs(B.fur) > 0.0005 || B.mane > 0.0005 || B.skirt > 0) {
    const nr = weldedNormals(P, coat.index, coat.weld, n);
    const r0 = coat.pos;
    for (let i = 0; i < n; i++) {
      p.fromArray(P, i * 3);
      _w.fromArray(nr, i * 3);
      const k = furWeights(base, i, r0);
      const nz = B.fur > 0.004 ? 0.8 + 0.4 * fbm(p.x * 120, p.y * 120, p.z * 120) : 1;
      let push = B.fur * k.body * nz + B.mane * k.mane * (0.75 + 0.5 * nz) + B.skirt * 0.03 * k.skirt * nz;
      if (B.fur < 0) push = B.fur * k.body;
      furW[i] = push;
      p.addScaledVector(_w, push);
      P.set([p.x, p.y, p.z], i * 3);
    }
  }
  // Normales : celles du modèle, tournées comme la surface.
  const nDef = weldedNormals(P, coat.index, coat.weld, n);
  for (let i = 0; i < n; i++) {
    _w.fromArray(N, i * 3).add(_v.fromArray(nDef, i * 3)).sub(_u.fromArray(coat.nrmCalc, i * 3)).normalize();
    N.set([_w.x, _w.y, _w.z], i * 3);
  }
  return { pos: P, nrm: N, heads: H, eyePos: EP, eyeNrm: EN, eyeCenters: EC, furW, nDef };
}

/**
 * Où pousse le poil (sommet i, positions de repos r0) : body (poil long sur le corps, moins sur les pattes et la face,
 * rien au bout des pieds, au nez, aux yeux, à l'intérieur des oreilles), mane (crinière : arrière de la tête, joues,
 * cou, poitrail), skirt (jupe : bas des flancs et des cuisses).
 */
const _fw = V();
function furWeights(base, i, r0) {
  const W = base.W;
  const L = base.land;
  const legSum = Math.min(1, W.leg[i * 4] + W.leg[i * 4 + 1] + W.leg[i * 4 + 2] + W.leg[i * 4 + 3]);
  const ear = Math.min(1, W.ear[i * 2] + W.ear[i * 2 + 1]);
  const head = W.head[i] * (1 - ear);
  const neck = W.neck[i] * (1 - W.head[i]);
  const tail = W.tail[i];
  const y0 = r0[i * 3 + 1];
  const z0 = r0[i * 3 + 2];
  const h = (y0 - L.bellyY) / Math.max(0.03, L.topY - L.bellyY);
  const fr = Math.sign(L.shZ - L.hipZ) || 1;
  const u = ((z0 - L.hipZ) * fr) / Math.max(0.05, Math.abs(L.shZ - L.hipZ));
  // Place sur la tête, des yeux (0) au bout du nez (1) : négatif derrière les yeux (base des oreilles vers -0,9). (Le
  // centre des sommets de la tête n'est pas un repère : le museau, très maillé, le tire vers l'avant ; les yeux du
  // lapin gris étaient « derrière » lui, et la crinière et le poil long les recouvraient.)
  const fz = ((z0 - L.eyeZ) * fr) / Math.max(0.01, Math.abs(L.noseZ - L.eyeZ));
  // Autour des yeux : jamais de poil long (sinon il les enfouit).
  _fw.fromArray(r0, i * 3);
  let de = Infinity;
  for (const e of L.eyes) de = Math.min(de, _fw.distanceTo(e.c) - e.r);
  const eyeK = smooth(0.003, 0.016, de);
  const below = 1 - smooth(L.eyeY - 0.02, L.eyeY - 0.004, y0); // sous les yeux (joues, menton)
  const paw = W.paw[i] * (1 - smooth(0.012, L.elbowY * 0.6, y0));
  // (tronc : ni pattes, ni tête — oreilles comprises, elles sont des os de la tête —, ni queue)
  const trunk = (1 - legSum) * (1 - W.head[i]) * (1 - tail) * (1 - ear);
  // poil long : le corps, les pattes, la queue ; sur la tête, l'arrière du crâne et les joues (pas la face, ni les
  // oreilles : elles enflaient en boudins, les pinceaux de l'angora suffisent)
  const body = trunk * (0.85 + 0.25 * (1 - smooth(0.1, 0.6, h))) + legSum * (1 - paw) * 0.7
    + head * 0.5 * Math.max(1 - smooth(-0.9, -0.35, fz), below * (1 - smooth(-0.1, 0.45, fz)) * 0.8) + tail * 0.9;
  // crinière : nuque, base des oreilles, joues et barbe sous les yeux, cou, haut du poitrail ; la face reste rase
  const mane = head * Math.max(1 - smooth(-0.75, -0.25, fz), below * (1 - smooth(0.0, 0.5, fz))) + neck * 1.0
    + trunk * smooth(0.8, 1.05, u) * (1 - smooth(0.2, 0.55, h) * 0.4);
  const skirt = trunk * (1 - smooth(0.05, 0.4, h)) * smooth(-0.2, 0.2, u) * (1 - smooth(0.85, 1.1, u)) + legSum * (1 - paw) * (1 - smooth(0.0, 0.35, u)) * 0.6;
  return {
    body: Math.max(0, body) * (1 - paw * 0.9) * eyeK, mane: Math.min(1, mane) * eyeK, skirt: Math.min(1, skirt) * (1 - paw),
    fz, eye: de, head, below,
  };
}

/**
 * Cartes de poils (angora : tout le corps ; tête de lion : crinière et jupe ; pinceaux au bout des oreilles de
 * l'angora) : petites cartes découpées par la texture des brins, plantées dans la peau (mêmes os et poids que le
 * sommet où elles poussent, mêmes attributs de robe : elles ont la couleur du pelage à cet endroit), couchées vers
 * l'arrière et vers le bas. Null si la race n'en a pas. density : part des cartes gardées (qualité basse : moins).
 */
function cardGeometry(base, D, B, density = 1) {
  const cards = B.cards;
  const maneC = B.maneCards;
  if (!(cards > 0.05) && !(maneC > 0.05) && !(B.tassels > 0.05)) return null;
  const coat = base.prims.coat;
  const n = coat.count;
  const W = base.W;
  const P = D.pos;
  const N = D.nDef;
  const L = base.land;
  const r0 = coat.pos;
  const pos = [];
  const uv = [];
  const si = [];
  const sw = [];
  const rest = [];
  const partA = [];
  const lowA = [];
  const idx = [];
  const hash = (k) => {
    const s = Math.sin(k * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const fr = Math.sign(L.shZ - L.hipZ) || 1;
  const back = V(0, 0, -fr); // vers la croupe
  const down = V(0, -1, 0);
  const grp = coat.weld;
  const seen = new Set();
  const nrm = V();
  const dir = V();
  const side = V();
  const root = V();
  const out = V();
  const cn = V();
  const nrmA = [];
  // Centre de la crinière (derrière les yeux, au milieu de la tête) : ses mèches rayonnent autour de la face.
  const maneC0 = V(L.midX, L.eyeY - 0.004, L.eyeZ - 0.012 * fr);
  /**
   * Une mèche plantée au sommet i : len, wid (m) ; droop (vers le sol), comb (vers la croupe), bend (le bout retombe) ;
   * radial : part de la direction prise depuis le centre de la crinière plutôt que la normale de la peau.
   */
  const jit = V();
  const addCard = (i, len, wid, droop, comb, bend = 0.3, radial = 0, up = false) => {
    root.fromArray(P, i * 3);
    nrm.fromArray(N, i * 3).normalize();
    dir.copy(nrm);
    if (radial > 0) dir.lerp(out.copy(root).sub(maneC0).normalize(), radial);
    // (mèches un peu en désordre : pas toutes peignées dans le même sens)
    jit.set(hash(i * 5.3) - 0.5, hash(i * 6.1) - 0.5, hash(i * 4.7) - 0.5).multiplyScalar(0.5);
    dir.addScaledVector(down, droop).addScaledVector(back, comb).add(jit).normalize();
    // (racine un peu sous la peau : la mèche sort du pelage sans laisser voir sa base)
    root.addScaledVector(nrm, -0.002);
    side.crossVectors(dir, nrm);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const tw = (hash(i * 3.1) - 0.5) * 1.2;
    side.applyAxisAngle(dir, tw);
    const s = pos.length / 3;
    // deux segments : la carte s'incurve vers le bas
    const mid = root.clone().addScaledVector(dir, len * 0.5);
    const dir2 = dir.clone().addScaledVector(down, bend).normalize();
    const tip = mid.clone().addScaledVector(dir2, len * 0.5);
    // (mèche en éventail : étroite à la racine, large au bout, comme les brins de la texture)
    const pts = [
      [root, -wid * 0.22, 0], [root, wid * 0.22, 0],
      [mid, -wid * 0.4, 0.5], [mid, wid * 0.4, 0.5],
      [tip, -wid * 0.5, 1], [tip, wid * 0.5, 1],
    ];
    // Éclairée comme la peau où elle pousse (sa normale ; le shader la tourne à moitié vers la caméra) : une toison douce, pas des
    // éclats de papier qui brillent ou noircissent selon leur face.
    if (up) cn.set(0, 1, 0.2).normalize(); // (pinceaux des oreilles : éclairés par le ciel, pas verts comme le sol)
    else cn.copy(nrm);
    const lo = (hash(i * 7.7) - 0.5) * 0.8;
    for (const [c, o, v] of pts) {
      const q = c.clone().addScaledVector(side, o);
      pos.push(q.x, q.y, q.z);
      nrmA.push(cn.x, cn.y, cn.z);
      uv.push(o > 0 ? 1 : 0, v);
      for (let k = 0; k < 4; k++) {
        si.push(coat.si[i * 4 + k]);
        sw.push(coat.sw[i * 4 + k]);
      }
      rest.push(base.attrs.cmpRest.array[i * 3], base.attrs.cmpRest.array[i * 3 + 1], base.attrs.cmpRest.array[i * 3 + 2]);
      partA.push(...base.part.subarray(i * 4, i * 4 + 4));
      lowA.push(lo);
    }
    idx.push(s, s + 1, s + 3, s, s + 3, s + 2, s + 2, s + 3, s + 5, s + 2, s + 5, s + 4);
  };
  for (let i = 0; i < n; i++) {
    const g = grp[i];
    if (seen.has(g)) continue;
    seen.add(g);
    const h = hash(i + 0.5);
    if (h > density) continue;
    const k = furWeights(base, i, r0);
    const ear = W.ear[i * 2] + W.ear[i * 2 + 1];
    if (ear > 0.3) continue;
    // (jamais près des yeux ni sur la face : museau, front entre les yeux)
    if (k.eye < 0.008) continue;
    const head = k.head > 0.5;
    if (head && k.fz > 0.45) continue;
    const ln = B.cardLen * (0.7 + 0.6 * hash(i * 1.37));
    const sideN = Math.abs(N[i * 3]) / Math.max(1e-6, Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]));
    // joues : sous les yeux et sur les côtés de la tête
    const cheek = head && k.below > 0.5 && k.fz > -0.6 && sideN > 0.45;
    if (cards > 0.05 && (k.body > 0.3 || cheek) && hash(i * 2.3) < cards) {
      // angora : une toison de mèches larges et serrées autour du corps, couchées vers l'arrière et vers le bas comme
      // un poil long qui retombe, plus courtes sur les joues, la tête et les pattes
      const kk = cheek ? 0.5 : head ? 0.6 : Math.min(1, 0.35 + k.body * 0.7);
      addCard(i, ln * kk, ln * 0.8 * kk, 0.55, 0.55, 0.5);
    } else if (maneC > 0.05 && (k.mane > 0.4 || cheek) && hash(i * 2.9) < maneC * 0.95) {
      // crinière : une collerette autour de la face (nuque, base des oreilles, joues, barbe, cou, poitrail) dont les
      // mèches rayonnent depuis la tête, un peu vers l'arrière
      addCard(i, ln * (cheek ? 0.65 : head ? 0.8 : 0.95), ln * 0.75, 0.25, 0.35, 0.35, head || k.mane > 0.7 ? 0.6 : 0.3);
    } else if (maneC > 0.05 && B.skirt > 0.05 && k.skirt > 0.5 && hash(i * 3.7) < B.skirt * 1.2) {
      // jupe : brins qui tombent vers le sol au bas des flancs
      addCard(i, ln * 0.7, ln * 0.5, 1.1, 0.3, 0.45);
    }
  }
  // Pinceaux au bout des oreilles (angora).
  if (B.tassels > 0.05) {
    for (let s = 0; s < 2; s++) {
      const b1 = base.index.get(s === 0 ? 'ear1L' : 'ear1R');
      if (b1 === undefined) continue;
      const tip = base.earTip[s];
      const cand = [];
      for (let i = 0; i < n; i++) if (W.ear[i * 2 + s] > 0.6 && _v.fromArray(r0, i * 3).distanceTo(tip) < 0.025) cand.push(i);
      cand.sort((a, b) => _v.fromArray(r0, a * 3).distanceTo(tip) - _w.fromArray(r0, b * 3).distanceTo(tip));
      for (const i of cand.slice(0, 7)) addCard(i, 0.035 * B.tassels * B.head, 0.016, -0.2, 0.1, 0.15, 0, true);
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setAttribute('cmpRest', new THREE.Float32BufferAttribute(rest, 3));
  g.setAttribute('cmpPart', new THREE.Float32BufferAttribute(partA, 4));
  g.setAttribute('cmpLow', new THREE.Float32BufferAttribute(lowA, 1));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrmA, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.userData.shared = true;
  return g;
}

let cardTex = null;
/**
 * Texture des cartes de poils : une mèche faite de brins effilés, serrés et pleins à la racine (en bas), qui s'écartent
 * et s'affinent vers le bout. Sert d'opacité (canal vert, découpée par alphaTest) et d'ombrage des brins (racine plus
 * sombre, brins clairs et foncés mêlés). Null hors d'un navigateur (tests).
 */
function cardTexture() {
  if (cardTex || typeof document === 'undefined') return cardTex;
  const w = 64;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx?.fillRect) return null;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  let s = 7;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  // Un brin : bande effilée (largeur w0 à la racine, presque rien au bout), légèrement courbe.
  const strand = (x0, x1, len, w0, v) => {
    const cx = (x0 + x1) / 2 + (r() - 0.5) * 8;
    const N = 10;
    const L = [];
    const R = [];
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const x = (1 - t) * (1 - t) * x0 + 2 * t * (1 - t) * cx + t * t * x1;
      const y = h - len * t;
      const hw = (w0 / 2) * (1 - t * 0.92);
      L.push([x - hw, y]);
      R.push([x + hw, y]);
    }
    const g = ctx.createLinearGradient(0, h, 0, h - len);
    g.addColorStop(0, `rgb(${v * 0.78},${v * 0.78},${v * 0.78})`);
    g.addColorStop(0.5, `rgb(${v * 0.9},${v * 0.9},${v * 0.9})`);
    g.addColorStop(1, `rgb(${v},${v},${v})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(L[0][0], L[0][1]);
    for (const p of L.slice(1)) ctx.lineTo(p[0], p[1]);
    for (const p of R.reverse()) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.fill();
  };
  // (cœur de la mèche : brins larges, puis brins fins qui s'échappent sur les bords)
  for (let i = 0; i < 16; i++) strand(w * (0.36 + 0.28 * r()), w * (0.22 + 0.56 * r()), h * (0.7 + 0.3 * r()), 7 + r() * 5, 190 + r() * 65);
  for (let i = 0; i < 26; i++) strand(w * (0.3 + 0.4 * r()), w * (0.04 + 0.92 * r()), h * (0.45 + 0.5 * r()), 3 + r() * 3, 160 + r() * 95);
  cardTex = new THREE.CanvasTexture(c);
  cardTex.flipY = true;
  cardTex.colorSpace = THREE.NoColorSpace;
  cardTex.userData.shared = true;
  return cardTex;
}

const shapes = new Map();
const SPARE_SHAPES = 6;

function releaseShape(S) {
  S.users = Math.max(0, S.users - 1);
  if (S.users > 0) return;
  S.idleAt = performance.now?.() ?? Date.now();
  const idle = [...shapes.values()].filter((x) => x.users === 0).sort((a, b) => a.idleAt - b.idleAt);
  for (const x of idle.slice(0, Math.max(0, idle.length - SPARE_SHAPES))) {
    shapes.delete(x.key);
    for (const g of [x.coatGeo, x.eyeGeo, x.cardGeo, x.lodCoat, x.lodEye]) g?.dispose();
  }
}

/** Géométries (partagées) d'une race, avec les attributs du shader de la robe et ses mesures. */
function shapeFor(base, B) {
  const q = gfx.quality === 'high' ? 'h' : 'l';
  const key = `${base.kind}|${B.key}|${q}`;
  let S = shapes.get(key);
  if (S) {
    S.users++;
    return S;
  }
  const D = deformRabbit(base, B);
  const coat = base.prims.coat;
  const geo = (pos, nrm, prim, attrs) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(prim.uv, 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(prim.si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(prim.sw, 4));
    for (const [k, a] of Object.entries(attrs ?? {})) g.setAttribute(k, a);
    g.setIndex(new THREE.BufferAttribute(prim.index, 1));
    g.computeBoundingSphere();
    g.userData.shared = true;
    return g;
  };
  const lodGeo = (full, index) => {
    if (!index) return null;
    const g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(full.attributes)) g.setAttribute(k, a);
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.boundingSphere = full.boundingSphere?.clone() ?? null;
    g.userData.shared = true;
    return g;
  };
  S = { key, B, D, heads: D.heads, users: 1 };
  S.coatGeo = geo(D.pos, D.nrm, coat, base.attrs);
  S.eyeGeo = base.prims.eye ? geo(D.eyePos, D.eyeNrm, base.prims.eye, base.eyeAttrs) : null;
  S.lodCoat = lodGeo(S.coatGeo, coat.lodIndex);
  S.lodEye = S.eyeGeo ? lodGeo(S.eyeGeo, base.prims.eye.lodIndex) : null;
  S.cardGeo = cardGeometry(base, D, B, q === 'h' ? 1 : 0.55);
  S.measure = measureRabbit(base, D, B);
  S.boneBox = emptyBoneBoxes(base.names.length);
  growBoneBoxes(S.boneBox, D.pos, coat.si, coat.sw, coat.count);
  if (S.eyeGeo) growBoneBoxes(S.boneBox, D.eyePos, base.prims.eye.si, base.prims.eye.sw, base.prims.eye.count);
  if (S.cardGeo) {
    const cg = S.cardGeo.attributes;
    growBoneBoxes(S.boneBox, cg.position.array, cg.skinIndex.array, cg.skinWeight.array, cg.position.count);
  }
  shapes.set(key, S);
  return S;
}

/**
 * Mesures d'une race au repos (repère du lapin) : hauteur du dos, du ventre, du coude, de la tête ; anneau de
 * l'encolure (collier, remesuré sur le lapin accroupi, voir fitCollar) ; dessus du crâne (accessoires) ; bout du nez.
 */
function measureRabbit(base, D, B) {
  const P = D.pos;
  const H = D.heads;
  const W = base.W;
  const L = base.land;
  const n = base.prims.coat.count;
  const I = (nm) => base.index.get(nm) ?? -1;
  const hipZ = (H[I('femurL')].z + H[I('femurR')].z) / 2;
  const shZ = (H[I('humerusL')].z + H[I('humerusR')].z) / 2;
  const HJ = H[I('head')];
  let skullTop = HJ.clone();
  let noseTip = HJ.clone();
  for (let i = 0; i < n; i++) {
    if (W.head[i] < 0.6 || W.ear[i * 2] + W.ear[i * 2 + 1] > 0.05) continue;
    _v.fromArray(P, i * 3);
    if (Math.abs(_v.x - L.midX) < 0.01 && _v.y > skullTop.y && Math.abs(_v.z - HJ.z) < 0.03 * B.head) skullTop = _v.clone();
    if (W.nose[i] > 0.6 && _v.z > noseTip.z) noseTip = _v.clone();
  }
  return { hipZ, shZ, skullTop, noseTip, elbowY: (H[I('radiusL')].y + H[I('radiusR')].y) / 2, headY: HJ.y };
}

// ------------------------------------------------------------------ construction

/** Modèles GLB des lapins chargés (assets.js) : l'un ou l'autre peut manquer. */
export const realRabbitReady = (kind) => !!getModel(REAL_RABBIT_KEYS[kind]);

/**
 * Construit le lapin réaliste (ou null si son GLB n'est pas chargé : on prend alors le lapin procédural).
 * look : la robe de l'animal (avec look.breed, voir rabbitLookWithBreed) ; stage : 'baby' (lapereau), 'young',
 * 'adult' ; gltf : le GLB chargé (tests).
 */
export function buildRealRabbitModel(look, stage = 'adult', gltf = null) {
  const B = rabbitBuild(look, stage);
  const src = gltf ?? getModel(REAL_RABBIT_KEYS[B.model]);
  if (!src) return null;
  const base = realRabbitBase(src, B.model);
  const S = shapeFor(base, B);
  const H = S.heads;
  const names = base.names;
  const nb = names.length;

  // Squelette du lapin : mêmes noms que le GLB (les clips s'y lient), articulations de la race, rotations de repos.
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
    b.userData.restP = b.position.clone();
    b.userData.restQ = b.quaternion.clone();
  }
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  skeleton.calculateInverses();
  const bone = (nm) => bones[base.index.get(nm)] ?? null;

  // Matières : robe du lapin (uniformes propres), yeux, cartes de poils.
  const uniforms = { ...makeRabbitCoatUniforms(), ...base.landUniforms };
  const plan = rabbitCoatPlan(look, B);
  setRabbitCoat(uniforms, plan);
  const keepCfg = base.cfg.keep;
  const L0 = base.paint;
  const spheres = keepCfg.nose ? [{ s: new THREE.Vector4(L0.nose.x, L0.nose.y, L0.nose.z - keepCfg.nose[0] * 0.3, keepCfg.nose[0]), l: keepCfg.nose[1] }] : [];
  const coatMat = rabbitCoatMaterial(base.prims.coat.material, uniforms, {
    role: 'fur', means: base.means, contrast: base.cfg.grain, keep: { ...keepCfg, spheres },
  });
  coatMat.roughness = plan.dark ? 0.66 : 0.88;
  const hb = { box: new THREE.Box3(), sphere: new THREE.Sphere(), boneBox: S.boneBox.slice(), skeleton, meshes: [], anim: null, margin: 0.02 + Math.max(0, B.fur) + B.cardLen * 0.6 };
  const coatMesh = new PetMesh(S.coatGeo, coatMat, hb);
  const meshes = [coatMesh];
  let eyeMesh = null;
  if (S.eyeGeo) {
    eyeMesh = new PetMesh(S.eyeGeo, rabbitCoatMaterial(base.prims.eye.material, uniforms, { role: 'eye' }), hb);
    meshes.push(eyeMesh);
  }
  let cardMesh = null;
  if (S.cardGeo) {
    const cm = rabbitCoatMaterial(null, uniforms, { role: 'card', alphaMap: cardTexture() });
    cm.roughness = 0.9;
    cardMesh = new PetMesh(S.cardGeo, cm, hb);
    meshes.push(cardMesh);
  }
  for (const m of meshes) {
    m.bind(skeleton, new THREE.Matrix4());
    m.castShadow = m === coatMesh;
    // (les mèches ne prennent pas l'ombre de la tête et des oreilles : la crinière en devenait brun sale)
    m.receiveShadow = m !== cardMesh;
    root.add(m);
    hb.meshes.push(m);
  }
  const M = S.measure;
  const Lt = Math.abs(M.shZ - M.hipZ) + 0.14;
  root.add(contactShadow(base.land.halfW * B.girth + 0.02, Lt * 0.95));

  const legs = LEG_KEYS.map(([, s, front]) => {
    const names4 = front ? LEG_BONES.front : LEG_BONES.hind;
    return {
      top: bone((front ? 'scap' : 'femur') + s) ?? bone(names4[0] + s), pivot: bone(names4[0] + s), knee: bone(names4[1] + s),
      fetlock: bone(names4[2] + s), paw: bone(names4[3] + s) ?? bone(names4[2] + s), front, side: s === 'L' ? 1 : -1,
    };
  });
  const headB = bone('head');
  const neckB = bone('neck1');
  const tailB = base.tailBones.map((i) => bones[i]);
  const ears = [bone('ear1L'), bone('ear1R')].filter(Boolean);
  ears.forEach((e, i) => {
    e.userData.side = i === 0 ? 1 : -1;
    e.userData.rest = e.rotation.clone();
    // (os suivants de l'oreille : le bélier en a trois, qui pendent)
    e.userData.chain = [];
    for (let k = 2; bone(`ear${k}${i === 0 ? 'L' : 'R'}`); k++) e.userData.chain.push(bone(`ear${k}${i === 0 ? 'L' : 'R'}`));
  });
  const toLocal = (b, p) => b.worldToLocal(p.clone());
  const mouth = toLocal(headB, M.noseTip.clone().add(V(0, -0.012 * B.head, -0.006 * B.head)));
  const skull = toLocal(headB, M.skullTop);
  const headQ = headB.getWorldQuaternion(new THREE.Quaternion()).invert();
  const lastTail = tailB[tailB.length - 1] ?? null;
  // Moustaches : longues vibrisses de part et d'autre du nez, plus courtes chez le lapereau.
  const hr = 0.032 * B.head;
  const whiskers = addWhiskers({
    head: headB, midX: base.land.midX,
    pad: M.noseTip.clone().add(V(0.25 * hr, -0.22 * hr, -0.18 * hr)),
    len: hr * (B.kit ? 1.2 : 1.6), count: 4, spread: 0.05 * hr, droop: 0.15,
    color: plan.dark ? 0xd8d4cc : 0xeeeae2, opacity: 0.75,
  });
  const model = {
    root,
    body: bone('root') ?? bone('pelvis'),
    neck: neckB,
    head: headB,
    tail: tailB[0] ?? bone('pelvis'),
    tailTip: lastTail,
    tailBones: tailB,
    ears,
    legs,
    skeleton,
    bones,
    bone,
    coatMesh,
    eyeMesh,
    cardMesh,
    uniforms,
    coatPlan: plan,
    // (interface du modèle procédural : hauteurs en unités « taille 1 », remesurées accroupi plus bas)
    y0: 0.08,
    legTop: M.elbowY,
    saddleY: 0.16,
    headHeight: M.headY,
    headTilt: 0,
    snoutTip: [M.noseTip.x, M.noseTip.y, M.noseTip.z],
    mouth,
    skull,
    // (mêmes mesures que le chien réaliste : collier de gearModels.js, nœud du concours de Beauty.js, accessoires du
    // salon de salon.js ; un lapin ne porte pas de manteau : pas de coupes du tronc)
    dogFit: { collar: { center: V(), normal: V(0, 0, 1), q: new THREE.Quaternion(), rx: 0.03, ry: 0.03, bone: neckB }, rings: [], ycAt: 0.08, midX: base.land.midX, hipZ: M.hipZ, shZ: M.shZ, topY: 0.16, bellyY: 0.03 },
    accessoryFit: { skull, headQ, mouth, headR: 0.032 * B.head, tailTip: lastTail },
    build: B,
    kind: B.model,
    kit: !!B.kit,
    stage: stage === 'baby' || stage === 'young' ? stage : 'adult',
    realRabbit: true,
  };
  model.anim = new RealRabbitAnim(model, base, S);
  hb.anim = model.anim;
  model.bounds = hb;
  model.lodLevel = 0;
  model.setLod = (level) => {
    const l = S.lodCoat && level ? 1 : 0;
    if (l === model.lodLevel) return;
    model.lodLevel = l;
    coatMesh.geometry = l ? S.lodCoat : S.coatGeo;
    if (eyeMesh) eyeMesh.geometry = l ? S.lodEye ?? S.eyeGeo : S.eyeGeo;
    whiskers.visible = !l;
  };
  model.staticPose = (kind = 'crouch') => model.anim.staticPose(kind);
  model.photoPose = () => model.anim.staticPose('crouch');
  model.setCoat = (lk2) => {
    setRabbitCoat(uniforms, rabbitCoatPlan(lk2, B));
    if (eyeMesh?.material.userData.eyeColor) eyeMesh.material.color.copy(uniforms.cEyeC.value);
  };
  // Coupe du salon de toilettage (Groomer.refreshCutVisuals) : poil raccourci ou gonflé par le shader (styles du lapin :
  // court, cœur, concours). null : poil de la race.
  model.setCut = (style) => {
    const f = Math.max(0.004, B.fur + B.mane * 0.5);
    const cut = {
      court: [-0.6 * f, -0.6 * f, -0.3 * f, -0.4 * f], coeur: [-0.4 * f, 0.15 * f, -0.2 * f, 0.004],
      concours: [0.1 * f, 0.2 * f, 0, 0.003], tonte: [-0.8 * f, -0.8 * f, -0.5 * f, -0.5 * f],
    }[style] ?? [0, 0, 0, 0];
    uniforms.cCut.value.set(...cut);
    if (cardMesh) cardMesh.visible = !(style === 'court' || style === 'tonte');
    model.cut = style ?? null;
  };
  let disposed = false;
  model.dispose = () => {
    if (disposed) return;
    disposed = true;
    model.anim.dispose();
    for (const m of [coatMat, eyeMesh?.material, cardMesh?.material, whiskers.material]) m?.dispose?.();
    whiskers.geometry.dispose();
    releaseShape(S);
  };
  model.anim.staticPose('crouch');
  fitBody(model, base, S);
  return model;
}

/**
 * Hauteurs du lapin accroupi (y0, dos, tête : étiquettes, équipement) et anneau du collier mesuré sur la peau du lapin
 * accroupi (là où le cou est le plus fin, comme le chat réaliste). Une fois par gabarit (S.fit), dans le repère de l'os
 * du cou posé.
 */
function fitBody(model, base, S) {
  if (!S.fit) {
    model.root.updateMatrixWorld(true);
    const W = base.W;
    const mesh = model.coatMesh;
    const n = base.prims.coat.count;
    const p = V();
    let topY = 0;
    let bellyY = Infinity;
    let headY = 0;
    const hz = model.head.getWorldPosition(V());
    for (let i = 0; i < n; i++) {
      mesh.getVertexPosition(i, p);
      const ear = W.ear[i * 2] + W.ear[i * 2 + 1];
      if (ear > 0.2) continue;
      if (W.head[i] > 0.5) headY = Math.max(headY, p.y);
      else if (W.leg[i * 4] + W.leg[i * 4 + 1] + W.leg[i * 4 + 2] + W.leg[i * 4 + 3] < 0.05 && W.tail[i] < 0.05) {
        topY = Math.max(topY, p.y);
        if (Math.abs(p.x - base.land.midX) < 0.02) bellyY = Math.min(bellyY, p.y);
      }
    }
    // Encolure : coupes perpendiculaires à l'axe cou → tête, la plus fine.
    const n0 = (model.neck ?? model.head).getWorldPosition(V());
    const axis = hz.clone().sub(n0);
    const nlen = Math.max(0.01, axis.length());
    axis.normalize();
    const lx = V(1, 0, 0).addScaledVector(axis, -axis.x).normalize();
    const ly = axis.clone().cross(lx);
    const mid = n0.clone().addScaledVector(axis, nlen * 0.5);
    const cand = [];
    for (let i = 0; i < n; i++) {
      if (W.ear[i * 2] + W.ear[i * 2 + 1] > 0.1) continue;
      if (W.leg[i * 4] + W.leg[i * 4 + 1] + W.leg[i * 4 + 2] + W.leg[i * 4 + 3] > 0.5) continue;
      mesh.getVertexPosition(i, p);
      if (p.distanceTo(mid) > 0.09) continue;
      _w.copy(p).sub(n0);
      cand.push([_w.dot(axis), _w.dot(lx), _w.dot(ly)]);
    }
    let best = null;
    for (let t = 0.1; t <= 0.91; t += 0.1) {
      const d0 = nlen * t;
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      let cnt = 0;
      for (const [d, x, y] of cand) {
        if (Math.abs(d - d0) > 0.005) continue;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
        cnt++;
      }
      if (cnt < 10) continue;
      const area = (x1 - x0) * (y1 - y0);
      if (!best || area < best.area) best = { area, d0, x0, x1, y0, y1 };
    }
    const B = model.build;
    let center = n0.clone().addScaledVector(axis, nlen * 0.5);
    let rx = 0.03;
    let ry = 0.03;
    if (best) {
      center = n0.clone().addScaledVector(axis, best.d0).addScaledVector(lx, (best.x0 + best.x1) / 2).addScaledVector(ly, (best.y0 + best.y1) / 2);
      rx = (best.x1 - best.x0) / 2;
      ry = (best.y1 - best.y0) / 2;
      // (le collier s'enfonce à moitié dans le poil long et la crinière)
      const sink = 0.5 * (Math.max(0, B.fur) + Math.max(0, B.mane));
      rx = Math.max(rx * 0.7, rx - sink);
      ry = Math.max(ry * 0.7, ry - sink);
    }
    const neckB = model.neck ?? model.head;
    const nq = neckB.getWorldQuaternion(new THREE.Quaternion()).invert();
    S.fit = {
      y0: (topY + (Number.isFinite(bellyY) ? bellyY : 0.03)) / 2, topY, bellyY: Number.isFinite(bellyY) ? bellyY : 0.03, headY,
      collar: {
        center: neckB.worldToLocal(center.clone()),
        normal: axis.clone().applyQuaternion(nq),
        q: nq.clone().multiply(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(lx, ly, axis))),
        rx, ry,
      },
    };
  }
  const F = S.fit;
  model.y0 = F.y0;
  model.saddleY = F.topY;
  // (étiquette au-dessus de la tête, sans les oreilles : AnimalEntity.placeLabels ajoute look.headR × 2,5)
  model.headHeight = F.headY;
  const fit = model.dogFit;
  Object.assign(fit, { ycAt: F.y0, topY: F.topY, bellyY: F.bellyY });
  fit.collar.center = F.collar.center.clone();
  fit.collar.normal = F.collar.normal.clone();
  fit.collar.q = F.collar.q.clone();
  fit.collar.rx = F.collar.rx;
  fit.collar.ry = F.collar.ry;
}

// ------------------------------------------------------------------ animation

/**
 * Allure d'après la vitesse (m/s, ramenée à la taille du lapin), avec hystérésis : sautillement lent, petit galop,
 * course en bonds. prev : allure de l'image précédente ('idle', 'hop', 'lope', 'run') ; nat : vitesses naturelles des
 * allures de ce lapin (le bélier de FourthGreen court à 0,92 m/s, le lapin gris à 1,58) : on passe d'une allure à la
 * suivante à mi-chemin (moyenne géométrique) de leurs vitesses naturelles, ± 8 % : chaque clip reste près de sa cadence.
 */
const GAIT_HYST = 1.08;
export function pickRabbitGait(prev, u, nat = NATURAL_SPEED) {
  if (!(u >= 0.04)) return 'idle';
  const hl = Math.sqrt((nat.hop ?? NATURAL_SPEED.hop) * (nat.lope ?? NATURAL_SPEED.lope));
  const lr = Math.sqrt((nat.lope ?? NATURAL_SPEED.lope) * (nat.run ?? NATURAL_SPEED.run));
  let g = prev === 'idle' || !prev ? 'hop' : prev;
  for (let k = 0; k < 3; k++) {
    if (g === 'hop' && u > hl * GAIT_HYST) g = 'lope';
    else if (g === 'lope' && u > lr * GAIT_HYST) g = 'run';
    else if (g === 'run' && u < lr / GAIT_HYST) g = 'lope';
    else if (g === 'lope' && u < hl / GAIT_HYST) g = 'hop';
  }
  return g;
}

// Postures : clip qui la tient ; passages d'une posture à l'autre (clip joué une fois, ou fondu si null). Le chemin le
// plus court est pris : un lapin accroupi qui doit se dresser s'assoit d'abord, puis se lève sur ses pattes arrière.
export const POSTURE_CLIP = {
  crouch: 'idle', sit: 'sit', rear: 'stand', lie: 'lie', sleep: 'sleep', groom: 'groom', eat: 'eat', sniff: 'sniff', hide: 'hide', held: 'held',
};
const EDGES = [
  ['crouch', 'sit', 'sit_down'], ['sit', 'crouch', 'stand_up'], ['sit', 'rear', 'rear_up'], ['rear', 'sit', 'rear_down'],
  ['crouch', 'lie', 'lie_down'], ['lie', 'crouch', 'get_up'], ['lie', 'sleep', null], ['sleep', 'lie', null],
  ['sit', 'groom', null], ['groom', 'sit', null], ['crouch', 'eat', null], ['eat', 'crouch', null],
  ['crouch', 'sniff', null], ['sniff', 'crouch', null], ['crouch', 'hide', null], ['hide', 'crouch', null],
  ['sniff', 'eat', null], ['eat', 'sniff', null], ['sleep', 'crouch', null],
];
const ONCE = ['sit_down', 'stand_up', 'rear_up', 'rear_down', 'lie_down', 'get_up', 'jump', 'binky'];

/** Chemin le plus court entre deux postures : liste d'arêtes [de, vers, clip] (un fondu compte 1,5 passage). */
export function rabbitPosturePath(from, to) {
  if (from === to) return [];
  // (porté dans les bras : on y entre et on en sort par un fondu, de n'importe où)
  if (from === 'held' || to === 'held') return [[from, to, null]];
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const todo = [from];
  while (todo.length) {
    todo.sort((a, b) => dist.get(a) - dist.get(b));
    const a = todo.shift();
    for (const e of EDGES) {
      if (e[0] !== a) continue;
      const d = dist.get(a) + (e[2] ? 1 : 1.5);
      if (d < (dist.get(e[1]) ?? Infinity)) {
        dist.set(e[1], d);
        prev.set(e[1], e);
        todo.push(e[1]);
      }
    }
  }
  if (!prev.has(to)) return [[from, to, null]];
  const path = [];
  for (let k = to; k !== from; k = prev.get(k)[0]) path.unshift(prev.get(k));
  return path;
}

const AX = V(1, 0, 0); // (tourner autour de x du lapin, positif : vers le bas pour une tête qui regarde devant)
const AXIS_Y = V(0, 1, 0);
const AZ = V(0, 0, 1);
const _ax = V();
const _q2v = V();
const _p0 = V();
const _ev = V();
const _qe = new THREE.Quaternion();
const _qe2 = new THREE.Quaternion();
const _m2 = new THREE.Matrix4();
const _gm = V();
const _gs = V();
const _gp = V();
const _gt = V();
const _gv = V();
const _gw = V();
const _gq = new THREE.Quaternion();
const _gq2 = new THREE.Quaternion();

/**
 * Mixeur d'un lapin : allures fondues selon la vitesse (chaque clip joué à vitesse réelle ÷ vitesse naturelle de cette
 * race : pieds en appui tenus sur place au sautillement et au petit galop), postures (accroupi, assis, debout sur les
 * pattes arrière, couché étalé, en boule, toilette, manger, renifler, tapi, porté) avec leurs passages, gestes joués une
 * fois (binky, saut) ; par-dessus : regard, nez qui frémit, oreilles qui pivotent et se couchent, pompon, respiration,
 * embonpoint ; pattes, ventre et tête jamais sous le sol.
 */
class RealRabbitAnim {
  constructor(model, base, S) {
    this.model = model;
    this.base = base;
    this.S = S;
    const B = model.build;
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
    const k = 0.35 + 0.65 * B.legs;
    this.natural = Object.fromEntries(MOVING.map((g) => [g, (base.natural[g] ?? NATURAL_SPEED[g]) * k]));
    this.speedScale = 1;
    this.gait = 'idle';
    this.posture = 'crouch';
    this.trans = null; // { name, to }
    this.target = {};
    for (const nm of this.names) this.target[nm] = 0;
    this.bones = model.bones;
    // Os à translation animée (la racine) : décalage de la race (voir dogReal.js).
    const trans = new Set();
    for (const c of Object.values(base.clips)) for (const t of c.tracks) if (t.name.endsWith('.position')) trans.add(t.name.split('.')[0]);
    this.shift = [...trans].map((nm) => base.index.get(nm)).filter((i) => i !== undefined).map((i) => {
      const p = base.parent[i];
      const d = S.heads[i].clone().sub(base.heads[i]);
      if (p >= 0) d.sub(_u.copy(S.heads[p]).sub(base.heads[p]));
      return [this.bones[i], d.applyQuaternion(p >= 0 ? base.rotW[p].clone().invert() : new THREE.Quaternion())];
    });
    this.pose = this.bones.map((b) => [b.position.clone(), b.quaternion.clone()]);
    this.pinv = new Map(this.bones.map((b) => [b, b.parent?.isBone ? b.parent.getWorldQuaternion(new THREE.Quaternion()).invert() : new THREE.Quaternion()]));
    this.earAxes = model.ears.map((e) => {
      // axe de l'oreille au repos (de sa base à son bout), dans le repère de son parent : pivoter l'oreille sur elle-même
      const s = e.userData.side > 0 ? 0 : 1;
      const tip = base.earTip[s].clone().sub(base.heads[base.index.get(e.name)]).normalize();
      return tip.applyQuaternion(this.pinv.get(e)).normalize();
    });
    // Bout de chaque oreille (sommet le plus loin de sa base, peau de la race) dans le repère de l'os de l'oreille :
    // borne des oreilles couchées (earLow).
    this.earTip = null;
    this.earLen = [];
    if (model.build.model !== 'lop' && model.ears.length) {
      model.root.updateMatrixWorld(true);
      const W = base.W;
      const P = S.D.pos;
      this.earTip = model.ears.map((e, i) => {
        const s = e.userData.side > 0 ? 0 : 1;
        const b0 = e.getWorldPosition(V());
        let best = b0.clone();
        let bd = 0;
        for (let k = 0; k < base.prims.coat.count; k++) {
          if (W.ear[k * 2 + s] < 0.5) continue;
          const d = _v.fromArray(P, k * 3).distanceTo(b0);
          if (d > bd) {
            bd = d;
            best = _v.clone();
          }
        }
        this.earLen[i] = bd;
        return e.worldToLocal(best);
      });
    }
    this.t = (model.root.id * 7.31) % 100;
    this.seen = false;
    this.seenNow = false;
    this.frame = -1;
    this.skipDt = 0;
    this.skipN = 0;
    this.look = new THREE.Vector2();
    this.earBack = 0;
    this.trick = null;
    this.oneShot = null;
    this.oneShotAge = 0;
    this.lead = 'hop';
    this.gOff = 0;
    this.plant = [null, null, null, null];
    // (minimums glissants sur la foulée : appuis avant, appuis arrière — voir ground)
    this.win = [new WindowMin(), new WindowMin()];
    this.lastPos = null;
    this.bodyAllow = 0.002 + Math.max(0, B.fur) * 0.4 + B.mane * 0.2;
    for (const [b, d] of this.shift) b.position.sub(d);
    this.savePose();
    this.contactPoints();
    this.measureNatural();
    // Oreilles tombantes (bélier) : leur direction au repos (accroupi), repère du lapin, pour la pesanteur (overlay).
    this.earHang = null;
    if (model.build.model === 'lop' && model.ears.length && this.actions.idle) {
      this.clipPose('idle', 0, false);
      model.root.updateMatrixWorld(true);
      this.earHang = model.ears.map((_, i) => this.earPitch(i));
      this.restorePose();
    }
    // Pose assise des pattes avant (rotations locales), pour la toilette du lapin gris (voir groomArms ; celle du bélier
    // garde les pattes près du museau sans voile de peau).
    this.groomArmQ = null;
    if (this.actions.sit && this.actions.groom && model.build.model !== 'lop') {
      this.clipPose('sit', 0, false);
      this.groomArmQ = [];
      for (const leg of model.legs) {
        if (!leg.front) continue;
        for (const b of [leg.top, leg.pivot, leg.knee, leg.fetlock, leg.paw]) if (b && !this.groomArmQ.some(([x]) => x === b)) this.groomArmQ.push([b, b.quaternion.clone()]);
      }
      this.restorePose();
    }
    this.resync();
  }

  /**
   * Après les mesures (faites une fois par race, sur le premier lapin construit) : os remis au repos et mixeur forcé de
   * tout réécrire à la prochaine image (il n'écrit un os que si sa valeur change ; un os qu'un clip n'anime pas gardait
   * la pose de la dernière mesure — voir catReal.js resync).
   */
  resync() {
    for (const b of this.bones) {
      b.position.copy(b.userData.restP);
      b.quaternion.copy(b.userData.restQ);
    }
    this.savePose();
    for (const pm of this.mixer._bindings ?? []) pm.buffer.fill(NaN, pm.valueSize, 3 * pm.valueSize);
  }

  /**
   * Vitesse naturelle de chaque allure pour cette race, mesurée sur son squelette : vitesse à laquelle les doigts en
   * appui reculent sous le corps quand le clip est joué à sa vitesse (voir catReal.js). Une fois par race.
   */
  measureNatural() {
    const S = this.S;
    if (!S.natural) {
      const md = this.model;
      const feet = md.legs.map((l) => l.paw);
      const nat = {};
      const N = 40;
      for (const g of MOVING) {
        const a = this.actions[g];
        if (!a || feet.some((f) => !f)) continue;
        const T = a.getClip().duration;
        const tracks = feet.map(() => []);
        for (let k = 0; k <= N; k++) {
          for (const nm of this.names) {
            this.actions[nm].setEffectiveWeight(nm === g ? 1 : 0);
            this.actions[nm].time = nm === g ? (k / N) * T : 0;
          }
          this.restorePose();
          this.mixer.update(0);
          for (const [b, d] of this.shift) b.position.add(d);
          md.root.updateMatrixWorld(true);
          feet.forEach((f, j) => tracks[j].push(f.getWorldPosition(V())));
        }
        const speed = tracks.map((tr) => {
          const ymin = Math.min(...tr.map((p) => p.y));
          let d = 0;
          let n = 0;
          for (let k = 1; k <= N; k++) {
            if (tr[k].y < ymin + 0.003 && tr[k - 1].y < ymin + 0.003) {
              d += tr[k - 1].z - tr[k].z;
              n++;
            }
          }
          return n ? d / ((n * T) / N) : null;
        });
        const ok = (x) => x !== null && x > 0.03;
        const fr = [speed[0], speed[1]].filter(ok);
        const hi = [speed[2], speed[3]].filter(ok);
        const all = [...fr, ...hi];
        if (!all.length) continue;
        // (les postérieurs donnent la mesure : ils portent la poussée ; à défaut, les antérieurs)
        const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
        nat[g] = hi.length ? avg(hi) : avg(fr);
      }
      S.natural = nat;
      for (const nm of this.names) this.actions[nm].setEffectiveWeight(this.w[nm]);
      this.restorePose();
    }
    for (const g of MOVING) if (S.natural[g] > 0.05) this.natural[g] = S.natural[g];
  }

  /**
   * Points de contact avec le sol : soles (sommets les plus bas de chaque patte accroupi), et pour les poses à l'arrêt
   * (assis, toilette, couché, en boule, manger, renifler, tapi) les sommets les plus bas du corps et de la tête, plus un
   * échantillon régulier ; calculés une fois par race (voir catReal.js contactPoints).
   */
  contactPoints() {
    const S = this.S;
    const base = this.base;
    const md = this.model;
    const coat = base.prims.coat;
    const W = base.W;
    const n = coat.count;
    if (!S.contact) {
      const cls = new Int8Array(n); // 0 corps, 2 tête, 3..6 patte (sole), -1 ignoré (oreilles)
      for (let i = 0; i < n; i++) {
        const ear = W.ear[i * 2] + W.ear[i * 2 + 1];
        cls[i] = ear > 0.3 ? -1 : W.head[i] > 0.6 ? 2 : 0;
      }
      const pick = [new Set(), new Set(), new Set()];
      const stride = [Math.ceil(n / 100), 9, 14];
      for (let i = 0; i < n; i++) if (cls[i] >= 0 && i % stride[cls[i]] === 0) pick[cls[i]].add(i);
      const P = S.D.pos;
      const inv = md.skeleton.boneInverses;
      const ys = new Float32Array(n);
      const bm = new THREE.Matrix4();
      const evalY = () => {
        md.root.updateMatrixWorld(true);
        const mats = md.bones.map((b, k) => bm.multiplyMatrices(b.matrixWorld, inv[k]).elements.slice());
        for (let i = 0; i < n; i++) {
          let y = 0;
          const x0 = P[i * 3];
          const y0 = P[i * 3 + 1];
          const z0 = P[i * 3 + 2];
          for (let c = 0; c < 4; c++) {
            const w = coat.sw[i * 4 + c];
            if (!(w > 0)) continue;
            const e = mats[coat.si[i * 4 + c]];
            y += w * (e[1] * x0 + e[5] * y0 + e[9] * z0 + e[13]);
          }
          ys[i] = y;
        }
      };
      // Soles : dans la pose accroupie (le bélier est lié à demi assis : ses pattes avant sont en l'air au repos).
      this.clipPose('idle', 0, false);
      evalY();
      const soles = [0, 1, 2, 3].map((l) => {
        const ids = [];
        for (let i = 0; i < n; i++) if (W.leg[i * 4 + l] > 0.5 && W.paw[i] > 0.5) ids.push(i);
        ids.sort((a, b) => ys[a] - ys[b]);
        const lo = ys[ids[0]] ?? 0;
        return ids.filter((i) => ys[i] < lo + 0.012).slice(0, 28);
      });
      // (aux allures, ce n'est pas toujours la sole qui touche : le poignet quand la patte avant se pose à plat, le
      // jarret du bélier ; les sommets de chaque patte les plus bas sur toute la foulée s'y ajoutent, sinon ils
      // passaient sous le sol, de 2 cm quand les pieds en appui sont tenus sur place)
      const legIds = [0, 1, 2, 3].map((l) => {
        const ids = [];
        for (let i = 0; i < n; i++) if (W.leg[i * 4 + l] > 0.5) ids.push(i);
        return ids;
      });
      const extra = soles.map((s) => new Set(s));
      // (pattes aussi tournées à l'épaule et à la hanche, comme footLock les tourne pour tenir un pied en appui)
      for (const clip of MOVING) {
        if (!this.actions[clip]) continue;
        for (let k = 0; k < 12; k++) {
          for (const rot of [0, -0.35, 0.35]) {
            this.clipPose(clip, k / 12, false);
            if (rot) for (const leg of md.legs) this.turn(leg.pivot, AX, rot);
            evalY();
            legIds.forEach((ids, l) => {
              const lo = ids.reduce((m, i) => Math.min(m, ys[i]), Infinity);
              const low = ids.filter((i) => ys[i] < lo + 0.006).sort((a, b) => ys[a] - ys[b]);
              for (const i of low.slice(0, 4)) extra[l].add(i);
            });
          }
        }
      }
      for (let l = 0; l < 4; l++) soles[l] = [...extra[l]].slice(0, 80);
      const poses = [['sit', 0], ['groom', 0.3], ['groom', 0.7], ['lie', 0], ['sleep', 0], ['eat', 0.3], ['sniff', 0.4], ['hide', 0], ['idle', 0], ['stand', 0]];
      for (const [clip, t] of poses) {
        if (!this.actions[clip]) continue;
        this.clipPose(clip, t, false);
        evalY();
        for (let k = 0; k < 3; k++) {
          const ids = [];
          for (let i = 0; i < n; i++) if (cls[i] === k) ids.push(i);
          ids.sort((a, b) => ys[a] - ys[b]);
          for (const i of ids.slice(0, 18)) pick[k].add(i);
        }
      }
      S.contact = pick.map((s) => Uint32Array.from(s));
      S.soles = soles;
      this.restorePose();
    }
    const infl = (i) => {
      const inf = [];
      for (let c = 0; c < 4; c++) {
        const w = coat.sw[i * 4 + c];
        if (w > 0.02) inf.push([this.bones[coat.si[i * 4 + c]], w]);
      }
      const tot = inf.reduce((a, x) => a + x[1], 0) || 1;
      return inf.map(([b, w]) => [b, b.worldToLocal(V().fromArray(S.D.pos, i * 3)), w / tot]);
    };
    const hold = this.bones.map((b) => [b.position.clone(), b.quaternion.clone()]);
    for (const b of this.bones) {
      b.position.copy(b.userData.restP);
      b.quaternion.copy(b.userData.restQ);
    }
    md.root.updateMatrixWorld(true);
    this.bodyPts = [...S.contact[0]].map(infl);
    this.headPts = [...S.contact[2]].map(infl);
    this.solePts = S.soles.map((ids) => ids.map(infl));
    this.bones.forEach((b, i) => {
      b.position.copy(hold[i][0]);
      b.quaternion.copy(hold[i][1]);
    });
    md.root.updateMatrixWorld(true);
  }

  /** Pose d'un clip tenu à une fraction t de sa durée, pieds et corps posés (settle : false pendant les mesures). */
  clipPose(clip, t, settle = true) {
    for (const nm of this.names) {
      this.w[nm] = nm === clip ? 1 : 0;
      this.actions[nm].setEffectiveWeight(this.w[nm]);
      this.actions[nm].time = nm === clip ? t * this.actions[nm].getClip().duration : 0;
    }
    this.trans = null;
    this.restorePose();
    this.mixer.update(0);
    this.savePose();
    for (const [b, d] of this.shift) b.position.add(d);
    if (settle) {
      const st = { moving: false, v: 0, sleeping: false, sad: false };
      this.overlay(0, st, true);
      this.ground(st);
    }
    this.model.root.updateMatrixWorld(true);
  }

  /**
   * Inclinaison d'une oreille dans le repère du lapin : angle de sa direction (de la base au bout) depuis la verticale
   * descendante, positif vers l'avant (pose en cours ; les parents sont mis à jour).
   */
  earPitch(i) {
    const e = this.model.ears[i];
    e.parent.getWorldQuaternion(_qe);
    _ev.copy(this.earAxes[i]).applyQuaternion(_qe2.copy(e.userData.restQ).invert()).applyQuaternion(e.quaternion).applyQuaternion(_qe);
    this.model.root.getWorldQuaternion(_qe).invert();
    _ev.applyQuaternion(_qe);
    return Math.atan2(_ev.z, -_ev.y);
  }

  /**
   * Oreille i trop basse ? Son bout (sommet de l'oreille le plus loin de sa base) sous sa base moins un cinquième de sa
   * longueur, ou à moins de 5 mm du sol (repère du lapin ; les parents sont mis à jour).
   */
  earLow(i) {
    const md = this.model;
    const e = md.ears[i];
    e.updateMatrixWorld(true);
    _m2.copy(md.root.matrixWorld).invert();
    const tip = _gt.copy(this.earTip[i]).applyMatrix4(e.matrixWorld).applyMatrix4(_m2);
    const baseP = _gs.setFromMatrixPosition(e.matrixWorld).applyMatrix4(_m2);
    // (le sol : y = 0 dans le repère du lapin une fois posé — le calage de l'image d'avant, gOff, s'y ajoute)
    return tip.y < baseP.y - 0.2 * this.earLen[i] || tip.y + (this.gOff ?? 0) < 0.005;
  }

  /** Tourne un os de ang autour d'un axe du lapin (axe vu par son parent au repos ; il suit le parent animé). */
  turn(b, axis, ang) {
    if (!b || !ang) return;
    _ax.copy(axis).applyQuaternion(this.pinv.get(b));
    b.quaternion.premultiply(_q.setFromAxisAngle(_ax, ang));
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

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model.root);
  }

  /** Pose figée (vignettes, caisse de transport, table) : accroupi, assis, debout, couché, en boule ou porté. */
  staticPose(kind = 'crouch') {
    const posture = { stand: 'crouch', crouch: 'crouch', sit: 'sit', rear: 'rear', lie: 'lie', loaf: 'sleep', sleep: 'sleep', curl: 'sleep', held: 'held' }[kind] ?? 'crouch';
    const clip = POSTURE_CLIP[posture];
    for (const nm of this.names) {
      this.w[nm] = nm === clip ? 1 : 0;
      this.actions[nm].setEffectiveWeight(this.w[nm]);
      this.actions[nm].time = 0;
    }
    this.posture = posture;
    this.trans = null;
    this.restorePose();
    this.mixer.update(0);
    this.savePose();
    for (const [b, d] of this.shift) b.position.add(d);
    const st = { moving: false, v: 0, sleeping: posture === 'sleep', sad: false, posture };
    this.overlay(0, st, true);
    if (posture !== 'held') this.ground(st);
    this.model.root.updateMatrixWorld(true);
  }

  /**
   * Une image. st : { v (m/s, lapin de taille 1), moving, posture ('crouch' | 'sit' | 'rear' | 'lie' | 'sleep' | 'groom'
   * | 'eat' | 'sniff' | 'hide' | 'held'), sleeping, sad, fear, alert, look (cible du regard, repère du lapin) ou null,
   * fat, quick, inPlace (court sans avancer : roue, pas de pieds tenus), held }.
   */
  update(dt, st) {
    this.restorePose();
    this.t += dt;
    const u = st.moving ? st.v : 0;
    const g = pickRabbitGait(this.gait, u, this.natural);
    this.gait = g;
    // Posture voulue (accroupi dès qu'il bouge) ; passages joués une fois, par le plus court chemin.
    const want = st.moving ? 'crouch' : st.posture ?? 'crouch';
    if (this.trans) {
      const a = this.actions[this.trans.name];
      if (!a || a.time >= a.getClip().duration - 0.04 || (st.moving && this.trans.to !== 'crouch')) {
        this.posture = st.moving ? 'crouch' : this.trans.to;
        this.trans = null;
      }
    }
    if (!this.trans && want !== this.posture) {
      if (st.moving) this.posture = 'crouch';
      else {
        const [edge] = rabbitPosturePath(this.posture, want);
        const clip = edge[2];
        if (clip && this.actions[clip]) {
          const a = this.actions[clip];
          a.reset();
          a.play();
          this.trans = { name: clip, to: edge[1] };
        } else this.posture = edge[1];
      }
    }
    // Geste joué une fois (binky), tours et sauts imposés (clip tenu à un instant, voir realRabbitPose).
    if (this.oneShot) {
      const a = this.actions[this.oneShot];
      if (!a || st.moving || (a.time >= a.getClip().duration - 0.04 && this.oneShotAge > 0.2)) this.oneShot = null;
    }
    this.oneShotAge += dt;
    const target = this.target;
    for (let j = 0; j < this.names.length; j++) target[this.names[j]] = 0;
    const trick = this.trick && this.trick.age < 0.25 ? this.trick : null;
    if (this.trick) this.trick.age += dt;
    let fadeK = 5;
    if (trick && this.actions[trick.clip]) {
      target[trick.clip] = trick.w;
      const rest = 1 - trick.w;
      if (rest > 0.01) target[st.moving ? (g === 'idle' ? 'hop' : g) : POSTURE_CLIP[this.posture] ?? 'idle'] = rest;
      fadeK = 10;
    } else if (this.oneShot && !st.moving) {
      target[this.oneShot] = 1;
      fadeK = 8;
    } else if (this.trans) {
      target[this.trans.name] = 1;
      fadeK = 12;
    } else if (st.moving) {
      target[g === 'idle' ? 'hop' : g] = 1;
      fadeK = 7;
    } else {
      target[POSTURE_CLIP[this.posture] ?? 'idle'] = 1;
      fadeK = this.posture === 'sleep' ? 1.8 : this.posture === 'held' ? 6 : 4;
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
      // Une allure qui entre se cale sur la phase de celle qui sort.
      if (was < 0.02 && w >= 0.02 && MOVING.includes(name) && this.lead && this.lead !== name) {
        const from = this.actions[this.lead];
        if (from) a.time = (from.time / from.getClip().duration) * a.getClip().duration;
      }
      if (was === 0 && w > 0 && ONCE.includes(name) && name !== trick?.clip) a.reset().play();
      a.setEffectiveWeight(w);
      if (MOVING.includes(name)) {
        const nat = this.natural[name];
        // (course : la cadence suit la vitesse jusqu'à 6 fois la vitesse naturelle, concours et agility compris ; à 3,5
        // le lapereau qui suit l'enfant à 2,8 m/s glissait de la moitié de son chemin)
        a.timeScale = Math.min(name === 'run' ? 6 : 2.4, Math.max(0.45, (st.moving ? st.v : nat) / nat));
        if (w > leadW) {
          lead = name;
          leadW = w;
        }
      } else if (trick && name === trick.clip && trick.time !== undefined) {
        a.timeScale = 0;
        a.time = trick.time * a.getClip().duration;
      } else {
        a.timeScale = st.quick && this.trans?.name === name ? 1.8 : 1;
      }
    }
    if (lead && leadW > 0.3) this.lead = lead;
    this.mixer.update(dt);
    this.savePose();
    for (const [b, d] of this.shift) b.position.add(d);
    this.overlay(dt, st, false);
    if (!st.held && this.posture !== 'held') this.ground(st, dt);
    else {
      this.plant.fill(null);
      this.gOff = 0;
    }
  }

  /** Procédural par-dessus les clips. */
  overlay(dt, st, still) {
    const md = this.model;
    const t = this.t;
    const u = md.uniforms;
    const sleeping = !!st.sleeping || this.posture === 'sleep';
    const lk = still ? 1 : Math.min(1, dt * 3);
    // Respiration (rapide chez le lapin, plus lente endormi), embonpoint, nez qui frémit (plus vite en reniflant).
    u.cBreath.value = Math.sin(t * (sleeping ? 4 : 9)) * (sleeping ? 0.0012 : 0.0008);
    u.cFat.value = Math.max(-0.004, Math.min(0.01, ((st.fat ?? 1) - 1) * 0.025));
    const sniffing = this.posture === 'sniff' || this.posture === 'eat' || (this.w.sniff ?? 0) > 0.3;
    const nf = sleeping ? 0 : sniffing ? 1 : 0.45;
    u.cSniff.value = nf * 0.0012 * Math.max(0, Math.sin(t * (sniffing ? 26 : 18))) * (0.6 + 0.4 * Math.sin(t * 1.7));
    // Regard : vers ce qui l'intéresse (le joueur proche), sinon il regarde autour de lui ; peu en courant, pas en
    // dormant ni porté dans les bras.
    const moving = !!st.moving;
    const busy = this.posture === 'groom' || this.posture === 'eat' || this.posture === 'hide' || sleeping ? 0.15 : 1;
    let yaw = (Math.sin(t * 0.41) * 0.5 + Math.sin(t * 0.17 + 1.7) * 0.5) * 0.45 * (moving ? 0.1 : 1);
    let pitch = Math.sin(t * 0.23 + 0.6) * 0.06;
    if (st.look) {
      yaw = clamp(Math.atan2(st.look.x, Math.max(0.05, st.look.z)), -1.0, 1.0);
      pitch = clamp(-Math.atan2(st.look.y, Math.hypot(st.look.x, st.look.z)), -0.4, 0.3);
    }
    if (sleeping) {
      yaw = 0;
      pitch = 0;
    }
    this.look.x += (yaw * busy - this.look.x) * lk;
    this.look.y += (pitch * busy - this.look.y) * lk;
    const head = md.head;
    const neck = md.neck;
    if (head) {
      this.turn(neck, AXIS_Y, this.look.x * 0.4);
      this.turn(head, AXIS_Y, this.look.x * 0.45);
      this.turn(head, AX, this.look.y * 0.5);
    }
    if (st.sad && !moving && !sleeping) this.turn(neck, AX, 0.15);
    // Oreilles : elles pivotent vers ce qu'il écoute, se couchent sur le dos quand il a peur, court ou dort ; celles du
    // bélier se balancent un peu.
    const lop = md.build.model === 'lop';
    const run = moving && this.gait === 'run';
    this.earBack += (((st.fear ? 1 : 0) + (st.sad ? 0.35 : 0) + (sleeping ? 0.25 : 0) + (run ? 0.3 : 0)) - this.earBack) * (still ? 1 : Math.min(1, dt * 5));
    const ears = md.ears;
    for (let i = 0; i < ears.length; i++) {
      const e = ears[i];
      const s = e.userData.side;
      const n1 = Math.sin(t * 1.1 + i * 2.1) + Math.sin(t * 0.43 + i);
      const flick = Math.max(0, Math.sin(t * 1.5 + i * 2.6) - 0.95) * 14;
      if (lop) {
        const sw = Math.sin(t * 2.2 + i) * 0.04 + (moving ? Math.sin(t * 11) * 0.06 : 0);
        this.turn(e, AZ, s * sw);
        // Pesanteur : l'oreille tombante pend vers le sol quand la tête se baisse ou se relève (renifler, manger,
        // debout) ; sinon elle suivait la tête et pointait devant le nez comme une corne.
        if (this.earHang) {
          const d = this.earPitch(i) - this.earHang[i];
          // (pas pendant la toilette : les pattes tirent alors l'oreille pour la laver)
          this.turn(e, AX, clamp(d, -1.1, 1.1) * (moving ? 0.5 : 0.85) * (1 - Math.min(1, this.w.groom ?? 0)));
        }
        continue;
      }
      // pivot de la conque (vers le côté qui écoute), puis vers l'arrière
      const swivel = (n1 * 0.18 + (st.alert ? 0 : 0.15)) * (1 - this.earBack);
      _ax.copy(this.earAxes[i]);
      e.quaternion.premultiply(_q.setFromAxisAngle(_ax, s * swivel));
      _qe2.copy(e.quaternion);
      // (oreilles couchées : jamais dans le dos ni dans le sol — les longues oreilles du géant, tapi, y rentraient de
      // 3 cm ; la rotation vers l'arrière est réduite jusqu'à ce que le bout reste au-dessus de sa base, moins un
      // cinquième de l'oreille, et du sol)
      let back = this.earBack * 1.0 + flick * 0.08 + n1 * 0.03;
      for (let pass = 0; pass < 5; pass++) {
        e.quaternion.copy(_qe2);
        this.turn(e, AX, -back);
        this.turn(e, AZ, -s * (this.earBack * 0.25 + flick * 0.05));
        if (!this.earTip || back < 0.2 || !this.earLow(i)) break;
        back *= 0.8;
      }
    }
    // Pompon : petits coups quand il bouge ou qu'il est content.
    const tb = md.tailBones;
    if (tb.length) this.turn(tb[0], AX, (moving ? -0.25 : 0) + Math.max(0, Math.sin(t * 7)) * 0.05 * (st.happy ? 1 : 0.3));
    // Toilette : pattes avant ramenées devant le museau.
    const wg = this.w.groom ?? 0;
    if (wg > 0.02) this.groomArms(wg);
  }

  /**
   * Toilette : les pattes avant gardent à peu près leur pose assise (coudes près du corps, pattes posées devant) et la
   * tête descend vers elles, comme un lapin qui se lèche les pattes avant de se frotter le museau. Le clip les levait de
   * part et d'autre de la tête, à hauteur des yeux : la peau tendue entre l'avant-bras et l'épaule faisait un voile plat,
   * retourné. w : poids de la toilette.
   */
  groomArms(w) {
    const G = this.groomArmQ;
    if (!G) return;
    const k = Math.min(1, w);
    for (const [b, q] of G) b.quaternion.slerp(q, k * 0.85);
    const md = this.model;
    const lick = Math.sin(this.t * 9) * 0.06;
    this.turn(md.neck, AX, (0.4 + lick) * k);
    this.turn(md.head, AX, (0.3 + lick) * k);
    md.root.updateMatrixWorld(true);
  }

  /**
   * Pieds au sol. Au sautillement et au petit galop, la sole la plus basse est posée sur le sol et les pieds en appui
   * sont tenus sur place (footLock) ; à la course et pendant les sauts, le lapin est seulement relevé (temps de
   * suspension) ; à l'arrêt, les soles et la peau du corps (croupe assise, ventre couché) sont posées, sans
   * s'enfoncer. Tête relevée au-dessus du sol. dt : 0 pour une pose fixe (sans transition).
   */
  ground(st, dt = 0) {
    const md = this.model;
    md.root.updateMatrixWorld(true);
    _m.copy(md.root.matrixWorld).invert();
    const air = (this.trick?.clip === 'jump' && this.trick.age < 0.25) || (this.w.jump ?? 0) > 0.3 || (this.w.binky ?? 0) > 0.3;
    let low = Infinity;
    let F = Infinity;
    let H = Infinity;
    for (let l = 0; l < this.solePts.length; l++) {
      for (const inf of this.solePts[l]) {
        const y = this.skinY(inf);
        if (y < low) low = y;
        if (l < 2 && y < F) F = y;
        else if (l >= 2 && y < H) H = y;
      }
    }
    if (!Number.isFinite(low)) low = 0;
    let target;
    let floor = -low;
    let k = 8;
    const gaitOn = st.moving && !air && !st.inPlace && dt > 0 && Number.isFinite(F) && Number.isFinite(H);
    if (!gaitOn) for (const w of this.win) w.reset();
    if (gaitOn) {
      // Allures (sautillement, petit galop, course en bonds) : chaque paire de pattes touche le sol au plus bas de sa
      // foulée. Le corps descend vers la paire qui se pose (hauteur la plus basse de cette paire sur la dernière
      // foulée), passe de l'une à l'autre pendant les temps de suspension ; les pattes d'une race (nain, géant)
      // n'ont plus une paire qui reste en l'air pendant que l'autre glisse.
      const span = this.cycle();
      const fMin = this.win[0].push(F, dt, span);
      const hMin = this.win[1].push(H, dt, span);
      const wF = 1 - smooth(0.002, 0.012, F - fMin);
      const wH = 1 - smooth(0.002, 0.012, H - hMin);
      if (wF + wH > 1e-3) this.gaitY = -(wF * fMin + wH * hMin) / (wF + wH);
      target = this.gaitY ?? -low;
      k = 18;
    } else if (st.moving || air) {
      target = !air && this.gait !== 'run' ? -low : Math.max(0, -low);
    } else {
      let lowB = Infinity;
      for (const pt of this.bodyPts) {
        const y = this.skinY(pt);
        if (y < lowB) lowB = y;
      }
      target = Math.max(-low, Number.isFinite(lowB) ? -(lowB + this.bodyAllow) : -Infinity);
      floor = target;
    }
    let off = dt > 0 ? this.gOff + (target - this.gOff) * Math.min(1, dt * k) : target;
    off = Math.max(off, floor);
    this.gOff = off;
    if (Math.abs(off) > 0.0002) {
      md.body.position.y += off / Math.max(1e-6, md.body.parent?.isBone ? 1 : 1);
      md.root.updateMatrixWorld(true);
    }
    if (st.moving && !air && dt > 0 && !st.inPlace) {
      this.footLock();
      let low2 = Infinity;
      for (const pts of this.solePts) {
        for (const inf of pts) {
          const y = this.skinY(inf);
          if (y < low2) low2 = y;
        }
      }
      if (low2 < -0.0003) {
        md.body.position.y -= low2;
        this.gOff -= low2;
        md.root.updateMatrixWorld(true);
      }
    } else this.plant.fill(null);
    if (st.moving || air) return;
    const sitW = (this.w.sit ?? 0) + (this.w.groom ?? 0) + (this.w.sit_down ?? 0) + (this.w.stand_up ?? 0);
    const lieW = (this.w.lie ?? 0) + (this.w.sleep ?? 0) + (this.w.lie_down ?? 0) + (this.w.get_up ?? 0) + (this.w.stand ?? 0) + (this.w.rear_up ?? 0) + (this.w.rear_down ?? 0);
    if (sitW > 0.3) this.settleSit();
    else if (sitW < 0.1 && lieW < 0.1) this.settleStand();
    // Tête : jamais sous le sol (races aux pattes courtes qui mangent ou reniflent) — l'encolure la relève.
    if (this.headPts.length && md.neck) {
      for (let pass = 0; pass < 2; pass++) {
        let lowY = Infinity;
        for (const inf of this.headPts) {
          const y = this.skinY(inf);
          if (y < lowY) {
            lowY = y;
            _u.copy(_w);
          }
        }
        const floorH = 0.003;
        if (!(lowY < floorH)) break;
        this.turn(md.neck, AX, raiseAngle(_v.setFromMatrixPosition(md.neck.matrixWorld).applyMatrix4(_m), _u, floorH + 0.003, 0.8));
        md.neck.updateMatrixWorld(true);
      }
    }
  }

  /** Durée d'une foulée de l'allure en cours (s), à sa cadence. */
  cycle() {
    const a = this.actions[this.gait] ?? this.actions[this.lead];
    return a ? Math.min(1.5, a.getClip().duration / Math.max(0.2, Math.abs(a.timeScale))) : 0.5;
  }

  /**
   * Pieds en appui tenus sur place (toutes les allures) : quand une patte se pose, la place de ses doigts est notée ;
   * tant qu'elle reste posée, la patte est tournée à l'épaule ou à la hanche pour l'y ramener, en long et sur le côté.
   * Les pattes raccourcies ou allongées d'une race changent la foulée du clip : sans cela, les pieds patinaient en appui.
   * Prise d'appui à 10 mm du sol, lâchée à 25 — la patte qui se déroule reste tenue (à 5 mm, le pied du clip arrivait encore lancé et glissait avant d'être
   * tenu).
   */
  footLock() {
    const md = this.model;
    // (rotation seule de la racine : sa matrice porte aussi la taille du lapin)
    md.root.matrixWorld.decompose(_rt, _q, _rs);
    _q.invert();
    for (let l = 0; l < md.legs.length; l++) {
      const leg = md.legs[l];
      let low = Infinity;
      for (const inf of this.solePts[l]) {
        const y = this.skinY(inf);
        if (y < low) low = y;
      }
      if (!(low < (this.plant[l] ? 0.025 : 0.01))) {
        this.plant[l] = null;
        continue;
      }
      if (!this.plant[l]) {
        this.plant[l] = _u.setFromMatrixPosition(leg.paw.matrixWorld).clone();
        continue;
      }
      // en long et sur le côté, deux passes (le pied n'est pas à l'aplomb de l'articulation)
      let th = 0;
      let ph = 0;
      for (let pass = 0; pass < 2; pass++) {
        const toe = _u.setFromMatrixPosition(leg.paw.matrixWorld);
        const err = _v.copy(toe).sub(this.plant[l]).applyQuaternion(_q);
        const top = _p0.setFromMatrixPosition(leg.pivot.matrixWorld);
        const Lg = Math.max(0.02 * _rs.y, top.distanceTo(toe));
        if (!pass && Math.abs(err.z) > 0.45 * Lg) {
          this.plant[l] = null;
          break;
        }
        const dth = clamp(Math.asin(clamp(err.z / Lg, -0.5, 0.5)), -0.5 - th, 0.5 - th);
        const dph = clamp(-Math.asin(clamp(err.x / Lg, -0.2, 0.2)), -0.2 - ph, 0.2 - ph);
        if (!(Math.abs(dth) >= 1e-4 || Math.abs(dph) >= 1e-4)) break;
        th += dth;
        ph += dph;
        this.turn(leg.pivot, AX, dth);
        this.turn(leg.pivot, AZ, dph);
        leg.pivot.updateMatrixWorld(true);
      }
    }
  }

  /** Lapin assis, posé sur sa croupe : le corps bascule pour poser les pieds avant au niveau du reste de l'appui. */
  settleSit() {
    const md = this.model;
    const lowSole = (l, out) => {
      out.y = Infinity;
      for (const inf of this.solePts[l]) {
        const y = this.skinY(inf);
        if (y < out.y) out.set(_w.x, y, _w.z);
      }
      return out;
    };
    const f = V();
    const o = V();
    const t = V();
    const lowRest = () => {
      o.y = Infinity;
      for (const l of [2, 3]) if (lowSole(l, t).y < o.y) o.copy(t);
      for (const pt of this.bodyPts) {
        const y = this.skinY(pt) + this.bodyAllow;
        if (y < o.y) o.set(_w.x, y, _w.z);
      }
      return o;
    };
    const lowFront = () => {
      lowSole(0, f);
      if (lowSole(1, t).y < f.y) f.copy(t);
      return f;
    };
    let total = 0;
    for (let pass = 0; pass < 4; pass++) {
      lowFront();
      lowRest();
      const gap = f.y - o.y;
      if (!(Math.abs(gap) > 0.003)) break;
      const th = clamp(gap / Math.max(0.03, f.z - o.z), -0.3 - total, 0.35 - total);
      if (!(Math.abs(th) > 0.001)) break;
      const fl = o.y;
      this.turn(md.body, AX, th);
      total += th;
      md.root.updateMatrixWorld(true);
      const mm = Math.min(lowFront().y, lowRest().y);
      md.body.position.y -= mm - fl;
      md.root.updateMatrixWorld(true);
    }
  }

  /** Accroupi (et manger, renifler, tapi) : l'avant et l'arrière remis à la même hauteur, puis reposés au sol. */
  settleStand() {
    const md = this.model;
    const zMid = (md.legs[0].pivot.getWorldPosition(_u).applyMatrix4(_m).z + md.legs[2].pivot.getWorldPosition(_v).applyMatrix4(_m).z) / 2;
    const F = V();
    const Hn = V();
    const scan = () => {
      F.y = Infinity;
      Hn.y = Infinity;
      for (let l = 0; l < 4; l++) {
        const out = l < 2 ? F : Hn;
        for (const inf of this.solePts[l]) {
          const y = this.skinY(inf);
          if (y < out.y) out.set(_w.x, y, _w.z);
        }
      }
      for (const pt of this.bodyPts) {
        const y = this.skinY(pt) + this.bodyAllow;
        const out = _w.z > zMid ? F : Hn;
        if (y < out.y) out.set(_w.x, y, _w.z);
      }
    };
    let total = 0;
    for (let pass = 0; pass < 3; pass++) {
      scan();
      const gap = Hn.y - F.y;
      if (!(Math.abs(gap) > 0.003)) break;
      const fl = Math.min(F.y, Hn.y);
      const th = clamp(-gap / Math.max(0.03, F.z - Hn.z), -0.25 - total, 0.25 - total);
      if (!(Math.abs(th) > 0.001)) break;
      this.turn(md.body, AX, th);
      total += th;
      md.root.updateMatrixWorld(true);
      scan();
      md.body.position.y -= Math.min(F.y, Hn.y) - fl;
      md.root.updateMatrixWorld(true);
    }
  }

  /** Hauteur (repère du lapin, _m : inverse de la racine) d'un point de peau ; sa position dans _w. */
  skinY(inf) {
    _w.set(0, 0, 0);
    for (const [b, p, w] of inf) _w.addScaledVector(_q2v.copy(p).applyMatrix4(b.matrixWorld), w);
    return _w.applyMatrix4(_m).y;
  }
}

// ------------------------------------------------------------------ entité du jeu

const _wv = V();

/**
 * Poses imposées par les activités (src/game/Activities.js, après l'animation) : 'jump' (phase t), 'binky', 'sit',
 * 'rear' (debout sur les pattes arrière : salut), 'down' (couché), 'bow' (salut : debout). s : 0 → 1 (amplitude). Le
 * lapin réaliste joue le clip correspondant (tenu au temps voulu) à l'image suivante. Renvoie true si le modèle est le
 * lapin réaliste (sinon l'activité garde sa pose habituelle).
 */
export function realRabbitPose(md, kind, s, sg = null, t = null) {
  if (!md?.realRabbit) return false;
  const a = md.anim;
  const map = { sit: 'sit', heel: 'sit', rear: 'stand', bow: 'stand', down: 'lie', jump: 'jump', binky: 'binky', hide: 'hide' };
  const clip = map[kind];
  if (!clip || !a.actions[clip]) return true;
  let time;
  if (kind === 'jump' || kind === 'binky') time = clamp(t ?? 0.5, 0, 1);
  a.trick = { clip, w: kind === 'jump' || kind === 'binky' ? 1 : Math.min(1, s * 1.5), time, age: 0 };
  if (sg && kind !== 'jump' && kind !== 'binky') {
    sg.rotation.x = 0;
    sg.rotation.z = 0;
  }
  return true;
}

/** Ce qu'un lapin fait au repos (tirage) : posture et durée, selon son caractère et sa fatigue. */
export function pickRabbitIdle(prev, energy = 80, r = Math.random) {
  const tired = energy < 35;
  const list = tired
    ? [['crouch', 3], ['lie', 4], ['sleep', 2], ['sniff', 1], ['groom', 1]]
    : [['crouch', 4], ['sniff', 3], ['sit', 2], ['groom', 1.5], ['rear', 1], ['lie', 1.2], ['eat', 0.8]];
  const opts = list.filter(([p]) => p !== prev);
  const tot = opts.reduce((s, [, w]) => s + w, 0);
  let x = r() * tot;
  for (const [p, w] of opts) {
    x -= w;
    if (x <= 0) return { pose: p, duration: (p === 'rear' ? 2 : p === 'groom' ? 4 : 3) + r() * 4 };
  }
  return { pose: 'crouch', duration: 3 };
}

/**
 * Animation d'une entité (AnimalEntity) au lapin réaliste : ce qu'il fait (allure selon sa vitesse, accroupi, renifle,
 * assis, debout, toilette, couché, en boule pour dormir, binky de joie, tapi s'il a peur ou qu'il est triste, mange,
 * porté dans les bras, sur la table du salon, jeux du clapier) ; renseigne e.gait et e.headDown.
 */
export function animateRealRabbit(e, dt, sad) {
  const md = e.model;
  const anim = md.anim;
  const d = e.data;
  if (horseView.on && md.setLod && !md.lodHold) {
    const far = gfx.quality === 'high' ? RABBIT_LOD_DIST.high : RABBIT_LOD_DIST.low;
    const dist = _wv.setFromMatrixPosition(e.root.matrixWorld).distanceTo(horseView.eye) / Math.max(0.15, e.scale);
    md.setLod(dist > far * (md.lodLevel ? 0.9 : 1) ? 1 : 0);
  }
  if (anim.frame !== horseView.frame) {
    anim.frame = horseView.frame;
    anim.seenNow = false;
  }
  if (anim.seen) {
    anim.seenNow = true;
    anim.seen = false;
  }
  const step = !anim.seenNow ? OFFSCREEN_STEP : md.lodLevel ? FAR_STEP : 1;
  if (step > 1 && !e.scripted && !e.herdCtrl && !e.posing && !e.onTable && !e.carried && !d.following && horseView.on) {
    anim.skipDt += dt;
    if (++anim.skipN < step) return;
    dt = anim.skipDt;
  } else {
    dt += anim.skipDt;
  }
  anim.skipDt = 0;
  anim.skipN = 0;
  const rs = (e.realRabbitSt ??= { idle: 'crouch', idleT: 1 + Math.random() * 2, still: 0, binkyT: 6 + Math.random() * 10 });
  const moving = e.speed > 0.05;
  const asleep = !!e.sleeping;
  rs.still = moving ? 0 : rs.still + dt;
  // Jeu du clapier (Activities.updatePlays) : ce que fait le lapin avec le jouet (consommé à chaque image).
  const act = e.petAction ?? null;
  e.petAction = null;
  let posture = 'crouch';
  if (asleep) posture = 'sleep';
  else if (e.carried) posture = 'held';
  else if (e.onTable) posture = 'crouch';
  else if (e.posing === 'sit') posture = 'sit';
  else if (e.posing === 'down') posture = 'lie';
  else if (act === 'eat' || e.state === 'eat') posture = 'eat';
  else if (act === 'sniff') posture = 'sniff';
  else if (e.state === 'mother' && !moving && d.needs?.hunger < 60) posture = 'eat';
  else if (e.state === 'flee' || (sad && rs.still > 2 && !e.scripted)) posture = 'hide';
  else if (rs.still < 1.0 || e.scripted) posture = 'crouch';
  else if (!d.following) {
    rs.idleT -= dt;
    if (rs.idleT <= 0) {
      const next = pickRabbitIdle(rs.idle, d.needs?.energy ?? 80);
      rs.idle = next.pose;
      rs.idleT = next.duration;
    }
    posture = rs.idle;
    // binky de joie de temps en temps (lapin heureux, éveillé, qui ne fait rien)
    rs.binkyT -= dt;
    if (rs.binkyT <= 0 && anim.actions.binky && !sad && (d.needs?.happiness ?? d.needs?.affection ?? 70) > 60 && posture === 'crouch') {
      anim.oneShot = 'binky';
      anim.oneShotAge = 0;
      rs.binkyT = 15 + Math.random() * 25;
    }
  } else posture = rs.still > 4 ? 'sit' : 'crouch';
  // Pose imposée (spectacle, captures, vignettes) : posture ou geste.
  const ov = e.rabbitPoseOverride;
  if (ov) {
    if (ov === 'binky') {
      if (!anim.oneShot) {
        anim.oneShot = 'binky';
        anim.oneShotAge = 0;
      }
    } else posture = { stand: 'rear', loaf: 'sleep' }[ov] ?? ov;
  }
  if (act === 'jump' && e.petActionT !== undefined) realRabbitPose(md, 'jump', 1, null, e.petActionT);
  const st = (e.rabbitSt ??= {});
  st.v = e.speed / Math.max(0.15, e.scale);
  st.moving = moving && !asleep && !e.carried;
  st.inPlace = act === 'wheel';
  st.sleeping = asleep;
  st.posture = posture;
  st.held = !!e.carried;
  st.sad = sad;
  st.fear = e.state === 'flee';
  st.alert = posture === 'rear' || !!d.following;
  if (e.happyFor > 0) e.happyFor = Math.max(0, e.happyFor - dt);
  st.happy = (e.happyFor ?? 0) > 0 ? 1 : 0;
  st.quick = !!e.posing;
  st.fat = 1 + ((d.weight ?? 50) - 50) / 50 * 0.6;
  st.look = e.lookAt ?? null;
  anim.update(dt, st);
  e.gait = anim.gait === 'run' ? 2 : anim.gait === 'lope' ? 1 : 0;
  e.headDown = posture === 'eat' ? 1 : 0;
}
