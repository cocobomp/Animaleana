// Chats réalistes : deux modèles d'artistes pour les 15 races (src/sim/catLook.js) — le chat de Claire (claireanne3d,
// Sketchfab, « Cat game asset », CC-BY 4.0) pour les adultes et les jeunes, le chaton de FainoDS (doinspire,
// Sketchfab, « Kitten », CC-BY 4.0) pour les bébés —, préparés et animés pour le jeu (public/models/cat_adult.glb,
// cat_kitten.glb ; tools/chat/).
//
// Comme les chiens (dogReal.js), le GLB n'est qu'une source : à son arrivée on en tire une fois pour toutes la
// géométrie de repos (flottants, repère du chat), le squelette, les clips et les repères du corps. Chaque race a sa
// géométrie, partagée par les chats de cette race : les os sont déplacés (pattes, dos, tronc, encolure, tête, museau,
// face plate, oreilles, queue) et la peau les suit ; le poil long épaissit la silhouette (collerette, culottes, queue en
// panache) et, en haute qualité, des couches de poil frangent le contour ; les oreilles du scottish sont pliées, celles
// du maine coon portent des pinceaux. Chaque chat a son squelette (avec des paupières), ses matières (robe peinte par
// le shader de catCoat.js) et son mixeur d'animations.
//
// Interface : la même que le chat procédural (catModel.js), qui reste le modèle de repli tant que le GLB n'est pas là,
// mais SANS md.cat (animateCat le lirait) : drapeau md.realCat. Repère : regard vers +Z, y vers le haut, origine au sol
// sous le milieu du corps ; chat « de taille 1 » (garrot 0,25 m), l'échelle de la race est appliquée par AnimalEntity.

import * as THREE from 'three';
import { getModel } from '../assets.js';
import { gfx } from '../gfx.js';
import { horseView } from './horseReal.js';
import { hairTexture } from '../textures.js';
import { catBuild } from '../../sim/catLook.js';
import { SPECIES } from '../../sim/species.js';
import { pickIdlePose } from '../../sim/catPoses.js';
import { catCoatPlan, makeCatCoatUniforms, makeCatLandUniforms, setCatCoat, catCoatMaterial, catShellMaterial } from './catCoat.js';
import {
  V, smooth, clamp, restPrims, weldGroups, weldedNormals, furLow, fbm, emptyBoneBoxes, growBoneBoxes, PetMesh, contactShadow, raiseAngle,
} from './petReal.js';

/** Clés des deux GLB (assets.js) : jamais « cat » (gltfAnimal.js le prendrait pour un animal GLB générique). */
export const REAL_CAT_KEYS = { adult: 'cat_adult', kitten: 'cat_kitten' };
/** Version réduite au-delà de cette distance à la caméra (m, divisée par la taille du chat) ; hystérésis 10 %. */
export const CAT_LOD_DIST = { low: 5, high: 12 };
/** Couches de poil (poil long, haute qualité) jusqu'à cette distance (m, divisée par la taille du chat). */
export const CAT_SHELL_DIST = 6;
/** Chat hors du champ : animé une image sur OFFSCREEN_STEP, avec le temps cumulé (comme le cheval et le chien). */
export const OFFSCREEN_STEP = 3;
/** Vitesses « naturelles » des allures (m/s, chat de taille 1) si le GLB ne les donne pas. */
export const NATURAL_SPEED = { walk: 0.54, trot: 1.62, run: 5.7, balance: 0.42 };

const MOVING = ['walk', 'trot', 'run', 'balance'];
const LEG_KEYS = [['FL', 'L', true], ['FR', 'R', true], ['HL', 'L', false], ['HR', 'R', false]];
const LEG_BONES = { front: ['humerus', 'radius', 'metacarpus', 'toes'], hind: ['femur', 'tibia', 'metatarsus', 'htoes'] };

// Ce qui garde sa couleur d'origine dans la texture (truffe, intérieur des oreilles ; yeux peints du chaton).
const MODEL = {
  adult: { keep: { pink: true, nose: [0.011, 0.32] }, grain: 0.8 },
  kitten: { keep: { pink: true, dark: 0.05, nose: [0.011, 0.28] }, grain: 0.7 },
};

const _v = V();
const _w = V();
const _u = V();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

// ------------------------------------------------------------------ données de repos (une fois par GLB)

/**
 * Géométrie, squelette, clips et repères de repos tirés d'un GLB de chat, dans le repère du chat. Gardé dans
 * gltf.userData (calculé une fois : Game.onRealCats le fait hors de l'image en cours).
 */
export function realCatBase(gltf, kind) {
  if (gltf.userData.catBase) return gltf.userData.catBase;
  const R = restPrims(
    gltf,
    (m) => (m.material?.name === 'cat_eye' ? 'eye' : 'coat'),
    (o) => !!(o.userData.lod || o.parent?.userData?.lod || /cat_lod/.test(o.name) || /cat_lod/.test(o.parent?.name ?? '')),
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
  const legSets = LEG_KEYS.map(([, s, front]) => new Set((front ? LEG_BONES.front : LEG_BONES.hind).map((b) => B(b + s)).filter((i) => i >= 0)));
  const earSets = ['L', 'R'].map((s) => new Set([B('ear1' + s), B('ear2' + s)].filter((i) => i >= 0)));
  const ear2 = ['L', 'R'].map((s) => B('ear2' + s));
  const tailBones = [];
  for (let k = 1; B('tail' + k) >= 0; k++) tailBones.push(B('tail' + k));
  const tailSet = new Set(tailBones);
  const headSet = desc(B('head'));
  const neckSet = new Set([B('neck1'), B('neck2')].filter((i) => i >= 0));
  const eyeSet = new Set([B('eyeL'), B('eyeR')].filter((i) => i >= 0));
  const noseOut = new Set([...earSets[0], ...earSets[1], ...eyeSet]);
  const legOfBone = new Int8Array(nb).fill(-1);
  legSets.forEach((s, j) => s.forEach((i) => { legOfBone[i] = j; }));

  const coat = prims.coat;
  const n = coat.count;
  const W = {
    leg: new Float32Array(n * 4), ear: new Float32Array(n * 2), ear2: new Float32Array(n * 2),
    tail: new Float32Array(n), head: new Float32Array(n), neck: new Float32Array(n), nose: new Float32Array(n),
  };
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
      if (b === ear2[0]) W.ear2[i * 2] += w;
      if (b === ear2[1]) W.ear2[i * 2 + 1] += w;
      if (tailSet.has(b)) W.tail[i] += w;
      if (headSet.has(b)) W.head[i] += w;
      if (neckSet.has(b)) W.neck[i] += w;
      if (headSet.has(b) && !noseOut.has(b)) W.nose[i] += w;
    }
    const legSum = Math.min(1, W.leg[i * 4] + W.leg[i * 4 + 1] + W.leg[i * 4 + 2] + W.leg[i * 4 + 3]);
    part.set([Math.min(1, W.ear[i * 2] + W.ear[i * 2 + 1]), W.tail[i], W.head[i], legSum], i * 4);
  }
  const boneW = names.map((_, i) => ({
    leg: legOfBone[i], ear: earSets[0].has(i) ? 0 : earSets[1].has(i) ? 1 : -1, ear2: ear2.indexOf(i),
    tail: tailSet.has(i), head: headSet.has(i), neck: neckSet.has(i), nose: headSet.has(i) && !noseOut.has(i),
  }));

  // Repères du corps au repos.
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
    const x = coat.pos[i * 3];
    const y = coat.pos[i * 3 + 1];
    const z = coat.pos[i * 3 + 2];
    if (W.nose[i] > 0.5 && z > noseZ) {
      noseZ = z;
      nose = V(x, y, z);
    }
    if (part[i * 4 + 3] < 0.05 && W.tail[i] < 0.05 && W.head[i] < 0.05 && W.neck[i] < 0.5 && z > z0 && z < z1) {
      bellyY = Math.min(bellyY, y);
      topY = Math.max(topY, y);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }
  const midX = (minX + maxX) / 2;
  // Yeux : os des yeux (Claire), sinon centres des sommets des yeux de chaque côté (chaton : yeux portés par la tête).
  const eyes = [1, -1].map((side) => {
    const e = prims.eye;
    const c = V();
    let cnt = 0;
    if (e) {
      for (let i = 0; i < e.count; i++) {
        if (Math.sign(e.pos[i * 3] - midX) !== side) continue;
        c.x += e.pos[i * 3];
        c.y += e.pos[i * 3 + 1];
        c.z += e.pos[i * 3 + 2];
        cnt++;
      }
    }
    if (cnt) c.multiplyScalar(1 / cnt);
    else c.copy(heads[B('head')]).add(V(side * 0.012, 0.01, 0.025));
    let r = 0;
    if (e) for (let i = 0; i < e.count; i++) if (Math.sign(e.pos[i * 3] - midX) === side) r += _v.fromArray(e.pos, i * 3).distanceTo(c);
    return { c, r: cnt ? r / cnt : 0.008 };
  });
  const tb0 = tailBones.length ? heads[tailBones[0]] : V(0, topY, hipZ - 0.05);
  const tailTip = (() => {
    let best = tailBones.length ? heads[tailBones[tailBones.length - 1]].clone() : V(0, topY, hipZ - 0.1);
    let bd = -1;
    for (let i = 0; i < n; i++) {
      if (W.tail[i] < 0.6) continue;
      const d = _v.fromArray(coat.pos, i * 3).distanceTo(tb0);
      if (d > bd) {
        bd = d;
        best = _v.clone();
      }
    }
    return best;
  })();
  let tailLen = 0;
  for (let k = 0; k < tailBones.length; k++) {
    const a = heads[tailBones[k]];
    const b = k + 1 < tailBones.length ? heads[tailBones[k + 1]] : tailTip;
    tailLen += a.distanceTo(b);
  }
  const land = {
    hipZ, shZ, bellyY, topY, midX, halfW: (maxX - minX) / 2,
    head: heads[B('head')].clone(), noseZ, nose,
    eyeX: Math.abs(eyes[0].c.x - eyes[1].c.x) / 2, eyeY: (eyes[0].c.y + eyes[1].c.y) / 2, eyeZ: (eyes[0].c.z + eyes[1].c.z) / 2,
    elbowY: (heads[B('radiusL')].y + heads[B('radiusR')].y) / 2,
    tailTipZ: tailTip.z, tailBaseZ: tb0.z, tailBase: tb0.clone(), tailLen,
    neckZ: (heads[B('neck1')].z + heads[B('head')].z) / 2,
  };
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
  // Normales de repos recalculées (soudées par position) : référence pour celles des races.
  coat.weld = weldGroups(coat.pos, n);
  coat.nrmCalc = weldedNormals(coat.pos, coat.index, coat.weld, n);

  // Clips.
  const clips = {};
  for (const c of gltf.animations) clips[c.name] = c;
  const ext = gltf.scene.userData?.cat ?? {};
  const base = {
    kind, names, index, parent, heads, rotW, prims, W, part, boneW, land, earTip, tailTip, tailBones, eyes, clips,
    natural: { ...NATURAL_SPEED, ...(ext.naturalSpeeds ?? {}) },
    cfg: MODEL[kind] ?? MODEL.adult,
  };
  // Attributs communs à toutes les races (robe) : position de repos d'origine, appartenance, grain du poil.
  const low = furLow(coat.material.map?.image, coat.uv, coat.pos, coat.index, n);
  base.means = low.none ? null : { lo: low.lo, hi: low.hi };
  base.attrs = {
    cmpRest: new THREE.BufferAttribute(coat.pos.slice(), 3),
    cmpPart: new THREE.BufferAttribute(part, 4),
    cmpLow: new THREE.BufferAttribute(low.low, 1),
  };
  if (prims.eye) {
    const ne = prims.eye.count;
    const ep = new Float32Array(ne * 4);
    for (let i = 0; i < ne; i++) ep[i * 4 + 2] = 1;
    base.eyeAttrs = {
      cmpRest: new THREE.BufferAttribute(prims.eye.pos.slice(), 3),
      cmpPart: new THREE.BufferAttribute(ep, 4),
      cmpLow: new THREE.BufferAttribute(new Float32Array(ne), 1),
    };
  }
  base.landUniforms = makeCatLandUniforms(land);
  // Les textures du GLB sont partagées par tous les chats : jamais libérées avec l'un d'eux.
  for (const p of Object.values(prims)) {
    for (const m of p.materials ?? [p.material]) for (const k of ['map', 'normalMap', 'aoMap']) if (m?.[k]) m[k].userData.shared = true;
  }
  gltf.userData.catBase = base;
  return base;
}

// ------------------------------------------------------------------ géométrie d'une race (par ses os)

/**
 * Queue plus courte ou plus longue (B.tailLen), plus fine ou plus épaisse (B.tailThick, B.tailFur), en pompon (B.stub) :
 * autour de la chaîne de ses os (projection lissée par les poids de la peau ; voir dogReal.js tailShape). Modifie P et
 * H ; renvoie la distance de chaque sommet de la queue à sa ligne médiane (0 hors de la queue).
 */
function tailShape(base, B, P, H, n, wTail) {
  const rad = new Float32Array(n);
  const tb = base.tailBones;
  const m = tb.length;
  const coat = base.prims.coat;
  const last = tb[m - 1];
  const C = tb.map((i) => H[i].clone());
  C.push(base.tailTip.clone().add(H[last]).sub(base.heads[last]));
  const C0 = C[0];
  const seg = [];
  let tot = 0;
  for (let k = 0; k < m; k++) {
    const e = C[k + 1].clone().sub(C[k]);
    const len = Math.max(1e-6, e.length());
    seg.push({ e: e.divideScalar(len), len, s0: tot });
    tot += len;
  }
  const slot = new Map(tb.map((b, k) => [b, k]));
  const wk = new Float32Array(m);
  const x = V();
  const q = V();
  const o = V();
  const project = (i) => {
    wk.fill(0);
    let sw = 0;
    for (let c = 0; c < 4; c++) {
      const k = slot.get(coat.si[i * 4 + c]);
      if (k === undefined) continue;
      wk[k] += coat.sw[i * 4 + c];
      sw += coat.sw[i * 4 + c];
    }
    if (!(sw > 0)) return -1;
    x.fromArray(P, i * 3);
    q.set(0, 0, 0);
    let s = 0;
    for (let k = 0; k < m; k++) {
      if (!wk[k]) continue;
      wk[k] /= sw;
      const S = seg[k];
      const t = clamp(_u.copy(x).sub(C[k]).dot(S.e) / S.len, 0, 1);
      q.addScaledVector(_u.copy(C[k]).addScaledVector(S.e, t * S.len), wk[k]);
      s += wk[k] * (S.s0 + t * S.len);
    }
    o.copy(x).sub(q);
    return s;
  };
  const o2 = V();
  for (let i = 0; i < n; i++) {
    const w = wTail(i);
    if (!(w > 0)) continue;
    const s = project(i);
    if (s < 0) continue;
    const on = smooth(0, 0.3 * tot, s);
    const kl = 1 + (B.tailLen - 1) * on;
    // épaisseur : la race, le panache du poil long (plus vers le milieu), le pompon du bobtail (au bout)
    const f = s / tot;
    let th = 1 + (B.tailThick - 1) * on + B.tailFur * 0.55 * smooth(0.05, 0.4, f) * (1 - 0.35 * smooth(0.75, 1, f));
    if (B.stub) th *= 1 + 1.3 * smooth(0.15, 0.9, f);
    o2.copy(o).multiplyScalar(th);
    rad[i] = o2.length();
    _w.copy(q).sub(C0).multiplyScalar(kl).add(C0).add(o2);
    x.lerp(_w, w);
    P.set([x.x, x.y, x.z], i * 3);
  }
  for (let k = 1; k < m; k++) {
    const on = smooth(0, 0.3 * tot, seg[k].s0);
    const kl = 1 + (B.tailLen - 1) * on;
    H[tb[k]].copy(C[k]).sub(C0).multiplyScalar(kl).add(C0);
  }
  return rad;
}

/**
 * Déformation d'une race : les os sont déplacés (pattes raccourcies le long de leur axe, dos allongé, tronc élargi,
 * ventre plus bas, encolure allongée, tête grossie et élargie, museau raccourci, face plate, oreilles agrandies,
 * élargies, écartées ou pliées, queue raccourcie ou en pompon) et la peau suit avec les poids du squelette ; le poil
 * long pousse la surface le long de sa normale (collerette, culottes, panache). Mêmes passes sur les sommets, les
 * articulations (têtes des os) et les yeux. Pure fonction des données de repos et du gabarit B (tests en node).
 */
export function deformCat(base, B) {
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
  // Centres des yeux (repères des paupières), déplacés comme la tête.
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
  const wEar2 = (j, s) => (j < n ? W.ear2[j * 2 + s] : j < n + nbn ? (bw[j - n].ear2 === s ? 1 : 0) : 0);
  const p = V();
  const d = V();
  const rot = (v, q, c) => v.sub(c).applyQuaternion(q).add(c);
  const legTop = LEG_KEYS.map(([, s, front]) => I((front ? 'humerus' : 'femur') + s));
  const legEnd = LEG_KEYS.map(([, s, front]) => I((front ? 'metacarpus' : 'metatarsus') + s));
  const T0 = legTop.map((i) => H[i].clone());

  // 1. Pattes : raccourcies ou allongées entre l'épaule (la hanche) et le poignet (le jarret), le pied suit sans se
  //    déformer ; épaissies autour de leur axe.
  for (let l = 0; l < 4; l++) {
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
      p.addScaledVector(a, w * (a2 - al)).addScaledVector(perp, w * (B.legW - 1) * smooth(0, 0.03, al));
      set(j, p);
    }
  }
  // 2. Tronc : dos plus long (chaque patte suit son épaule ou sa hanche), tronc plus large, ventre plus bas.
  const za = L.hipZ + 0.01;
  const zb = L.shZ - 0.01;
  const zm = (za + zb) / 2;
  const zoff = (z) => (B.back - 1) * (clamp(z, za, zb) - zm);
  const trunkZ = (z) => smooth(L.hipZ - 0.06, L.hipZ + 0.01, z) * (1 - smooth(L.shZ - 0.01, L.shZ + 0.07, z));
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
    const h = (p.y - L.bellyY) / Math.max(0.03, L.topY - L.bellyY);
    const body = (1 - lw) * (1 - wHead(j)) * (1 - wTail(j));
    const tz = trunkZ(p.z);
    p.x = p.x + dx + body * (p.x - L.midX) * (B.girth - 1) * tz * (1 - 0.4 * wNeck(j));
    p.z += dz + (1 - lw) * zoff(p.z);
    if (B.belly) {
      const u = (p.z - L.hipZ) / Math.max(0.05, L.shZ - L.hipZ);
      p.y -= body * B.belly * 0.012 * (1 - smooth(0.0, 0.5, h)) * smooth(-0.1, 0.3, u) * (1 - smooth(0.55, 0.95, u));
    }
    set(j, p);
  }
  // 3. Encolure plus longue ou plus courte : la tête suit d'un bloc.
  if (B.neck !== 1) {
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
  // 4. Tête plus grosse ou plus petite (oreilles et yeux compris), autour de l'os de la tête ; plus large (joues du
  //    british, du persan) surtout en arrière du museau.
  if (B.head !== 1 || B.headW !== 1) {
    const HJ = H[headI].clone();
    const noseLen = Math.max(0.02, (L.noseZ - base.heads[headI].z) * B.head);
    for (let j = 0; j < total; j++) {
      const wh = wHead(j);
      if (!(wh > 0)) continue;
      get(j, p);
      p.sub(HJ).multiplyScalar(1 + wh * (B.head - 1));
      const fz = 1 - 0.5 * smooth(0.45, 0.95, p.z / noseLen);
      p.x *= 1 + wh * fz * (B.headW - 1) * (isEye(j) ? 0.6 : 1);
      p.add(HJ);
      set(j, p);
    }
  }
  // 5. Museau plus court ou plus long, plus large ou plus fin, devant les yeux ; face plate (persan) : le nez rentre
  //    entre les yeux et remonte un peu, le front se bombe au-dessus.
  const E = EC[0].clone().add(EC[1]).multiplyScalar(0.5);
  if (B.snout !== 1 || B.muzzleW !== 1 || B.flat) {
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
      if (!(w > 0)) continue;
      get(j, p);
      d.copy(p).sub(E);
      const t = d.dot(f);
      if (t <= 0) continue;
      // (la peau juste devant l'œil reste où elle est : sinon le globe passe à travers la paupière)
      const on = smooth(eyeR * 0.8, eyeR * 0.8 + 0.25 * flen, t);
      const lat = d.dot(side);
      p.addScaledVector(f, w * (t - eyeR * 0.8) * (B.snout - 1) * on).addScaledVector(side, w * lat * (B.muzzleW - 1) * on);
      if (B.flat) p.y += w * B.flat * 0.25 * (1 - B.snout) * Math.max(0, t - eyeR) * on;
      set(j, p);
    }
    if (B.flat) {
      // front bombé : le haut du crâne avance un peu au-dessus des yeux
      for (let j = 0; j < total; j++) {
        const wh = wHead(j);
        if (!(wh > 0) || isEye(j)) continue;
        get(j, p);
        const up = smooth(E.y, E.y + 0.03 * B.head, p.y) * (1 - smooth(0.0, 0.04 * B.head, Math.abs(p.z - E.z)));
        if (wEar(j, 0) + wEar(j, 1) > 0.2) continue;
        p.z += wh * up * B.flat * 0.006;
        set(j, p);
      }
    }
  }
  // 6. Oreilles : taille et largeur (autour de leur base), écartées (rotation vers l'extérieur), bout arrondi, puis
  //    pliées vers l'avant (scottish : la partie au-delà du pli se rabat sur le crâne).
  for (let s = 0; s < 2; s++) {
    const sd = s === 0 ? 1 : -1;
    const b1 = I(s === 0 ? 'ear1L' : 'ear1R');
    const b2 = I(s === 0 ? 'ear2L' : 'ear2R');
    if (b1 < 0) continue;
    const bp = H[b1].clone();
    const tip = base.earTip[s].clone().sub(base.heads[b1]).multiplyScalar(B.head).add(bp);
    const ax = tip.clone().sub(bp);
    const elen = Math.max(1e-4, ax.length());
    ax.normalize();
    const lat = V(1, 0, 0).addScaledVector(ax, -ax.x).normalize();
    const hinge = b2 >= 0 ? H[b2].clone() : bp.clone().lerp(tip, 0.45);
    const out = B.earOut ? new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -sd * B.earOut) : null;
    // pli : rotation autour de l'axe latéral au pli, vers l'avant et le bas
    const fold = B.ears === 'fold' ? new THREE.Quaternion().setFromAxisAngle(lat.clone().multiplyScalar(sd > 0 ? 1 : 1), 1.95) : null;
    const lean = B.ears === 'fold' ? new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.45) : null;
    for (let j = 0; j < total; j++) {
      const we = wEar(j, s);
      if (!(we > 0)) continue;
      get(j, p);
      // taille et largeur
      d.copy(p).sub(bp);
      const al = d.dot(ax);
      const lw = d.dot(lat);
      p.copy(bp).addScaledVector(d, 1 + we * (B.earSize - 1)).addScaledVector(lat, we * lw * B.earSize * (B.earW - 1));
      // bout arrondi : le dernier tiers est tassé vers le milieu de l'oreille
      if (B.earRound) {
        const u = al / elen;
        const k = B.earRound * 0.3 * smooth(0.55, 1.0, u);
        p.addScaledVector(ax, -we * k * (al - 0.55 * elen) * B.earSize);
      }
      if (lean) rot(p, _q.identity().slerp(lean, we), bp);
      const w2 = wEar2(j, s);
      if (fold) {
        // (pli au milieu de l'oreille, vers l'avant : la pointe se rabat devant, contre le crâne)
        const hp = hinge.clone();
        if (lean) rot(hp, lean, bp);
        const u = clamp((al - 0.35 * elen) / (0.3 * elen), 0, 1);
        const fw = Math.max(w2, we * u);
        rot(p, _q.identity().slerp(fold, fw), hp);
        // l'oreille pliée est plus petite et serrée contre la tête
        p.y -= we * 0.002;
      }
      if (out) rot(p, _q.identity().slerp(out, we), bp);
      set(j, p);
      if (j < n && (fold || out || lean)) {
        _w.fromArray(N, j * 3);
        if (lean) _w.applyQuaternion(_q.identity().slerp(lean, we));
        if (fold) _w.applyQuaternion(_q.identity().slerp(fold, Math.max(w2, we * clamp((al - 0.35 * elen) / (0.3 * elen), 0, 1))));
        if (out) _w.applyQuaternion(_q.identity().slerp(out, we));
        N.set([_w.x, _w.y, _w.z], j * 3);
      }
    }
  }
  // 7. Queue : longueur, épaisseur, panache, pompon.
  const tailR = base.tailBones.length ? tailShape(base, B, P, H, n, wTail) : null;
  // 8. Pieds au sol : le chat descend (ou monte) de ce que ses pattes ont perdu (avant et arrière séparément).
  let minF = Infinity;
  let minH = Infinity;
  for (let i = 0; i < n; i++) {
    const lf = W.leg[i * 4] + W.leg[i * 4 + 1];
    const lh = W.leg[i * 4 + 2] + W.leg[i * 4 + 3];
    const y = P[i * 3 + 1];
    if (lf > 0.6) minF = Math.min(minF, y);
    if (lh > 0.6) minH = Math.min(minH, y);
  }
  const dropF = Number.isFinite(minF) ? minF : 0;
  const dropH = Number.isFinite(minH) ? minH : 0;
  const dropAt = (z) => dropH + (dropF - dropH) * clamp((z - L.hipZ) / Math.max(0.05, L.shZ - L.hipZ), 0, 1);
  const legZ = LEG_KEYS.map((_, l) => H[legTop[l]].z);
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
  // 9. Poil : long (poussé le long de la normale : plus sur le cou, le poitrail et les joues — collerette —, l'arrière
  //    des cuisses — culottes —, moins sur les pattes, jamais sur le bout des pieds ni le museau ; en mèches) ou ras
  //    (siamois, sphynx : la silhouette s'affine un peu).
  if (Math.abs(B.fur) > 0.0005 || B.ruff > 0.0005 || B.breeches > 0) {
    const nr = weldedNormals(P, coat.index, coat.weld, n);
    const r0 = coat.pos;
    for (let i = 0; i < n; i++) {
      p.fromArray(P, i * 3);
      _w.fromArray(nr, i * 3);
      const legSum = Math.min(1, W.leg[i * 4] + W.leg[i * 4 + 1] + W.leg[i * 4 + 2] + W.leg[i * 4 + 3]);
      const ear = Math.min(1, W.ear[i * 2] + W.ear[i * 2 + 1]);
      const head = W.head[i] * (1 - ear);
      const tail = W.tail[i];
      const neck = W.neck[i] * (1 - W.head[i]);
      const x0 = r0[i * 3] - L.midX;
      const y0 = r0[i * 3 + 1];
      const z0 = r0[i * 3 + 2];
      const h = (y0 - L.bellyY) / Math.max(0.03, L.topY - L.bellyY);
      const u = (z0 - L.hipZ) / Math.max(0.05, L.shZ - L.hipZ);
      const hz = (z0 - L.head.z) / Math.max(0.02, L.noseZ - L.head.z);
      const paw = 1 - smooth(0.012, L.elbowY * 0.5, y0);
      let k = (1 - legSum) * (1 - head) * (1 - tail) * (0.75 + 0.35 * (1 - smooth(0.1, 0.6, h)));
      k += legSum * (1 - paw) * 0.45 * smooth(L.elbowY * 0.4, L.elbowY * 1.2, y0);
      k += head * 0.35 * (1 - smooth(-0.1, 0.35, hz));
      // collerette : cou, poitrail, joues (pas l'avant de la face)
      const ruff = (neck * 1.2 + (1 - legSum) * (1 - tail) * (1 - head) * smooth(0.85, 1.1, u) * (1 - smooth(0.5, 0.9, h)) * 0.9
        + head * smooth(L.eyeX * 0.9, L.eyeX * 1.8, Math.abs(x0)) * (1 - smooth(L.eyeY - 0.005, L.eyeY + 0.01, y0)) * (1 - smooth(0.25, 0.55, hz)));
      // culottes : arrière du haut des cuisses
      const br = legSum * smooth(-0.2, -0.7, _w.z) * smooth(L.elbowY * 0.5, L.elbowY * 1.4, y0) * (1 - smooth(0.0, 0.35, u)) + (1 - legSum) * (1 - tail) * smooth(0.0, -0.35, u) * (1 - smooth(0.55, 0.9, h)) * 0.5;
      const nz = B.fur > 0.004 ? 0.7 + 0.6 * fbm(p.x * 160, p.y * 160, p.z * 160) : 1;
      let push = B.fur * k * nz * (1 - ear * 0.8) + B.ruff * ruff * (0.75 + 0.5 * nz) + B.breeches * 0.012 * br * nz;
      // poil ras : jamais plus que le tiers du rayon de la queue
      if (B.fur < 0) push = B.fur * k - Math.min(-B.fur, 0.3 * (tailR?.[i] || 0.01)) * tail;
      p.addScaledVector(_w, push * (1 - paw * 0.8));
      P.set([p.x, p.y, p.z], i * 3);
    }
  }
  // Normales : celles du modèle, tournées comme la surface (différence des normales recalculées avant et après).
  const nDef = weldedNormals(P, coat.index, coat.weld, n);
  for (let i = 0; i < n; i++) {
    _w.fromArray(N, i * 3).add(_v.fromArray(nDef, i * 3)).sub(_u.fromArray(coat.nrmCalc, i * 3)).normalize();
    N.set([_w.x, _w.y, _w.z], i * 3);
  }
  return { pos: P, nrm: N, heads: H, eyePos: EP, eyeNrm: EN, eyeCenters: EC };
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
    for (const g of [x.coatGeo, x.eyeGeo, x.lidGeo, x.tuftGeo, x.lodCoat, x.lodEye]) g?.dispose();
  }
}

/** Géométries (partagées) d'une race, avec les attributs du shader de la robe et ses mesures. */
function shapeFor(base, B) {
  const key = `${base.kind}|${B.key}`;
  let S = shapes.get(key);
  if (S) {
    S.users++;
    return S;
  }
  const D = deformCat(base, B);
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
  S.measure = measureCat(base, D, B);
  S.boneBox = emptyBoneBoxes(base.names.length + 2);
  growBoneBoxes(S.boneBox, D.pos, coat.si, coat.sw, coat.count);
  if (S.eyeGeo) growBoneBoxes(S.boneBox, D.eyePos, base.prims.eye.si, base.prims.eye.sw, base.prims.eye.count);
  shapes.set(key, S);
  return S;
}

/**
 * Mesures d'une race au repos (repère du chat) : hauteur du dos, du ventre, du coude, de la tête ; anneau de l'encolure
 * (collier) ; dessus du crâne (accessoires) ; bout du nez ; points d'appui des pattes.
 */
function measureCat(base, D, B) {
  const P = D.pos;
  const H = D.heads;
  const W = base.W;
  const L = base.land;
  const n = base.prims.coat.count;
  const I = (nm) => base.index.get(nm) ?? -1;
  const hipZ = (H[I('femurL')].z + H[I('femurR')].z) / 2;
  const shZ = (H[I('humerusL')].z + H[I('humerusR')].z) / 2;
  const midZ = (hipZ + shZ) / 2;
  let topY = -Infinity;
  let bellyY = Infinity;
  let halfW = 0;
  const trunk = (i) => W.leg[i * 4] + W.leg[i * 4 + 1] + W.leg[i * 4 + 2] + W.leg[i * 4 + 3] < 0.05 && W.head[i] < 0.05 && W.tail[i] < 0.05 && W.neck[i] < 0.5;
  for (let i = 0; i < n; i++) {
    const z = P[i * 3 + 2];
    if (!trunk(i) || Math.abs(z - midZ) > 0.025 * (B.back || 1)) continue;
    topY = Math.max(topY, P[i * 3 + 1]);
    bellyY = Math.min(bellyY, P[i * 3 + 1]);
    halfW = Math.max(halfW, Math.abs(P[i * 3] - L.midX));
  }
  if (!Number.isFinite(topY)) {
    topY = L.topY;
    bellyY = L.bellyY;
    halfW = L.halfW;
  }
  // Encolure : coupe perpendiculaire à l'axe cou → tête, aux 45 % (là où se pose le collier).
  const N0 = H[I('neck1')];
  const HJ = H[I('head')];
  const axis = HJ.clone().sub(N0);
  const nlen = axis.length();
  axis.normalize();
  const ringAt = (t) => {
    const c = N0.clone().addScaledVector(axis, nlen * t);
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let cnt = 0;
    const pts = [];
    for (let i = 0; i < n; i++) {
      if (W.neck[i] + W.head[i] < 0.3) continue;
      if (W.ear[i * 2] + W.ear[i * 2 + 1] > 0.1 || W.head[i] > 0.7) continue;
      _v.fromArray(P, i * 3);
      if (Math.abs(_w.copy(_v).sub(c).dot(axis)) > 0.006) continue;
      pts.push(_v.clone());
      sx += _v.x;
      sy += _v.y;
      sz += _v.z;
      cnt++;
    }
    if (!cnt) return { center: c, r: 0.025, rx: 0.025, ry: 0.025 };
    const center = V(sx / cnt, sy / cnt, sz / cnt);
    const ly = V(0, 1, 0).addScaledVector(axis, -axis.y).normalize();
    let rx = 0;
    let ry = 0;
    for (const q of pts) {
      _w.copy(q).sub(center);
      rx = Math.max(rx, Math.abs(_w.x));
      ry = Math.max(ry, Math.abs(_w.dot(ly)));
    }
    return { center, r: Math.max(rx, ry), rx, ry };
  };
  const collar = ringAt(0.45);
  // Dessus du crâne entre les oreilles, bout du nez.
  let skullTop = HJ.clone();
  let noseTip = HJ.clone();
  for (let i = 0; i < n; i++) {
    if (W.head[i] < 0.6 || W.ear[i * 2] + W.ear[i * 2 + 1] > 0.05) continue;
    _v.fromArray(P, i * 3);
    if (Math.abs(_v.x - L.midX) < 0.008 && _v.y > skullTop.y && _v.z < HJ.z + 0.03 * B.head) skullTop = _v.clone();
    if (W.nose[i] > 0.6 && _v.z > noseTip.z) noseTip = _v.clone();
  }
  // Appuis : sommets les plus bas de chaque patte (repère du chat) ; calage au sol pendant l'animation.
  const soles = [0, 1, 2, 3].map((l) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      if (W.leg[i * 4 + l] < 0.5) continue;
      if (P[i * 3 + 1] < 0.02) pts.push(i);
    }
    // (les plus bas au repos ne le sont plus forcément quand le pied roule : tout le dessous du pied, 32 points au plus)
    const sorted = pts.sort((a, b) => P[a * 3 + 1] - P[b * 3 + 1]);
    const step = Math.max(1, Math.floor(sorted.length / 32));
    return sorted.filter((_, k) => k % step === 0).slice(0, 32);
  });
  return {
    hipZ, shZ, topY, bellyY, halfW, collar, skullTop, noseTip, soles, axis, nlen,
    elbowY: (H[I('radiusL')].y + H[I('radiusR')].y) / 2,
    headY: HJ.y,
  };
}

/**
 * Paupières : une calotte de peau par œil (un peu plus grande que le globe), liée à un os ajouté au squelette (lidL,
 * lidR, enfants de la tête, au centre de l'œil). Fermée, elle couvre le devant de l'œil ; ouverte, l'os est réduit à
 * rien. Ses attributs de robe sont ceux de la peau autour de l'œil (modèle d'origine) : la paupière a la couleur du
 * visage à cet endroit. bone0 : index du premier os ajouté.
 */
function lidGeometry(base, D, B, bone0) {
  const pos = [];
  const nrm = [];
  const rest = [];
  const si = [];
  const sw = [];
  const idx = [];
  const NU = 14;
  const NV = 6;
  for (let s = 0; s < 2; s++) {
    const side = s === 0 ? 1 : -1;
    const e0 = base.eyes[s];
    const C = D.eyeCenters[s];
    const r = e0.r * B.head * 1.12;
    const r0 = e0.r * 1.12;
    // axe de la calotte fermée : le regard (devant, un peu vers l'extérieur)
    const g = V(side * 0.35, 0.05, 1).normalize();
    const a1 = V(0, 1, 0).cross(g).normalize();
    const a2 = g.clone().cross(a1).normalize();
    const start = pos.length / 3;
    const TH = Math.PI * 0.62;
    for (let v = 0; v <= NV; v++) {
      const th = (v / NV) * TH;
      for (let u = 0; u <= NU; u++) {
        const ph = (u / NU) * Math.PI * 2;
        const dir = g.clone().multiplyScalar(Math.cos(th)).addScaledVector(a1, Math.sin(th) * Math.cos(ph)).addScaledVector(a2, Math.sin(th) * Math.sin(ph));
        const P = C.clone().addScaledVector(dir, r);
        const R0 = e0.c.clone().addScaledVector(dir, r0);
        pos.push(P.x, P.y, P.z);
        rest.push(R0.x, R0.y, R0.z);
        nrm.push(dir.x, dir.y, dir.z);
        si.push(bone0 + s, 0, 0, 0);
        sw.push(1, 0, 0, 0);
      }
    }
    const row = NU + 1;
    for (let v = 0; v < NV; v++) {
      for (let u = 0; u < NU; u++) {
        const a = start + v * row + u;
        idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
      }
    }
  }
  const n = pos.length / 3;
  const part = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) part[i * 4 + 2] = 1;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2).fill(0.5), 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setAttribute('cmpRest', new THREE.Float32BufferAttribute(rest, 3));
  g.setAttribute('cmpPart', new THREE.BufferAttribute(part, 4));
  g.setAttribute('cmpLow', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.userData.shared = true;
  return g;
}

/**
 * Pinceaux du lynx au bout des oreilles (maine coon, norvégien) et poils clairs dans l'oreille (poil long) : cartes de
 * poils (texture découpée), liées aux os des oreilles. Null si la race n'en a pas.
 */
function earTuftGeometry(base, D, B) {
  if (!(B.tufts > 0.05) && !(B.furnish > 0.05)) return null;
  const I = (nm) => base.index.get(nm) ?? -1;
  const pos = [];
  const uv = [];
  const si = [];
  const sw = [];
  const idx = [];
  const col = [];
  const quad = (a, up, side, w, h, bone, c) => {
    const s = pos.length / 3;
    const p0 = a.clone().addScaledVector(side, -w / 2);
    const p1 = a.clone().addScaledVector(side, w / 2);
    const p2 = p1.clone().addScaledVector(up, h);
    const p3 = p0.clone().addScaledVector(up, h);
    for (const [p, u, v] of [[p0, 0, 0], [p1, 1, 0], [p2, 1, 1], [p3, 0, 1]]) {
      pos.push(p.x, p.y, p.z);
      uv.push(u, v);
      si.push(bone, 0, 0, 0);
      sw.push(1, 0, 0, 0);
      col.push(...c);
    }
    idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
  };
  for (let s = 0; s < 2; s++) {
    const sd = s === 0 ? 1 : -1;
    const b1 = I(s === 0 ? 'ear1L' : 'ear1R');
    const b2 = I(s === 0 ? 'ear2L' : 'ear2R');
    if (b1 < 0) continue;
    const bp = D.heads[b1];
    const tip = base.earTip[s].clone().sub(base.heads[b1]).multiplyScalar(B.head * B.earSize).add(bp);
    const ax = tip.clone().sub(bp);
    const elen = ax.length();
    ax.normalize();
    if (B.tufts > 0.05) {
      // pinceau : trois cartes en éventail qui prolongent la pointe vers le haut
      for (const k of [-1, 0, 1]) {
        const up = ax.clone().add(V(sd * 0.25 * k + sd * 0.1, 0.35, -0.1)).normalize();
        const side = V(1, 0, 0).cross(up).normalize().add(V(0, 0, k * 0.4)).normalize();
        quad(tip.clone().addScaledVector(ax, -elen * 0.12), up, side, elen * 0.16, elen * (0.32 + 0.1 * (1 - Math.abs(k))) * B.tufts, b2 >= 0 ? b2 : b1, [0, 0, 0]);
      }
    }
    if (B.furnish > 0.05) {
      // poils dans l'oreille : cartes claires qui sortent de la conque vers l'avant et le haut
      for (const k of [-0.5, 0.5]) {
        const a = bp.clone().addScaledVector(ax, elen * 0.15).add(V(sd * k * elen * 0.12, 0, elen * 0.06));
        const up = ax.clone().add(V(-sd * 0.15 * k, 0, 0.35)).normalize();
        quad(a, up, V(1, 0, 0), elen * 0.22, elen * 0.5 * B.furnish, b1, [1, 1, 1]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.userData.shared = true;
  return g;
}

// ------------------------------------------------------------------ construction

/** Modèles GLB des chats chargés (assets.js) : l'un ou l'autre peut manquer. */
export const realCatReady = (kind) => !!getModel(REAL_CAT_KEYS[kind]);

const breedById = (id) => SPECIES.cat.breeds.find((b) => b.id === id) ?? null;

/**
 * Construit le chat réaliste (ou null si son GLB n'est pas chargé : on prend alors le chat procédural).
 * look : la robe de l'animal (avec look.breed, voir catLookWithBreed) ; stage : 'baby' (chaton), 'young', 'adult' ;
 * gltf : le GLB chargé (tests).
 */
export function buildRealCatModel(look, stage = 'adult', gltf = null) {
  const B = catBuild(look, stage);
  const src = gltf ?? getModel(REAL_CAT_KEYS[B.model]);
  if (!src) return null;
  const base = realCatBase(src, B.model);
  const S = shapeFor(base, B);
  const H = S.heads;
  const names = base.names;
  const nb = names.length;

  // Squelette du chat : mêmes noms que le GLB (les clips s'y lient), articulations de la race, rotations de repos du
  // modèle d'origine ; plus deux os de paupières (enfants de la tête, au centre des yeux).
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
  const headI = base.index.get('head');
  const headQi = base.rotW[headI].clone().invert();
  const lids = [0, 1].map((s) => {
    const b = new THREE.Bone();
    b.name = s === 0 ? 'lidL' : 'lidR';
    b.position.copy(S.D.eyeCenters[s]).sub(H[headI]).applyQuaternion(headQi);
    b.quaternion.copy(headQi); // (repère du chat au repos)
    bones[headI].add(b);
    b.userData.restP = b.position.clone();
    b.userData.restQ = b.quaternion.clone();
    bones.push(b);
    return b;
  });
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  skeleton.calculateInverses();
  const bone = (nm) => bones[base.index.get(nm)] ?? null;

  // Matières : robe du chat (uniformes propres), yeux (iris de la race).
  const breed = breedById(look.breed);
  const uniforms = { ...makeCatCoatUniforms(), ...base.landUniforms };
  const plan = catCoatPlan(look, breed, B.kitten);
  setCatCoat(uniforms, plan);
  const keepCfg = base.cfg.keep;
  const L0 = base.land;
  const spheres = keepCfg.nose ? [{ s: new THREE.Vector4(L0.nose.x, L0.nose.y, L0.nose.z - keepCfg.nose[0] * 0.4, keepCfg.nose[0]), l: keepCfg.nose[1] }] : [];
  const coatMat = catCoatMaterial(base.prims.coat.material, uniforms, {
    role: 'fur', means: base.means, contrast: base.cfg.grain, keep: { ...keepCfg, spheres },
  });
  // (robe noire : un peu de lustre, sinon le poil n'a plus de modelé ; peau nue : satinée)
  coatMat.roughness = plan.hairless ? 0.6 : plan.dark ? 0.62 : 0.85;
  const hb = { box: new THREE.Box3(), sphere: new THREE.Sphere(), boneBox: S.boneBox.slice(), skeleton, meshes: [], anim: null, margin: 0.02 + Math.max(0, B.fur) };
  const coatMesh = new PetMesh(S.coatGeo, coatMat, hb);
  const meshes = [coatMesh];
  let eyeMesh = null;
  if (S.eyeGeo) {
    eyeMesh = new PetMesh(S.eyeGeo, catCoatMaterial(base.prims.eye.material, uniforms, { role: 'eye' }), hb);
    meshes.push(eyeMesh);
  }
  // Paupières (géométrie propre à la race, partagée).
  S.lidGeo ??= lidGeometry(base, S.D, B, nb);
  const lidMesh = new PetMesh(S.lidGeo, coatMat, hb);
  meshes.push(lidMesh);
  growBoneBoxes(hb.boneBox, S.lidGeo.attributes.position.array, S.lidGeo.attributes.skinIndex.array, S.lidGeo.attributes.skinWeight.array, S.lidGeo.attributes.position.count);
  // Pinceaux et poils des oreilles.
  if (S.tuftGeo === undefined) S.tuftGeo = earTuftGeometry(base, S.D, B);
  let tuftMesh = null;
  if (S.tuftGeo) {
    const tc = new THREE.Color(plan.pattern === 'points' ? plan.sec : plan.dark ? 0x141010 : new THREE.Color(plan.base).multiplyScalar(0.55).getHex());
    const tm = new THREE.MeshStandardMaterial({ map: hairTexture(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true });
    tm.onBeforeCompile = (sh) => {
      sh.uniforms.cTuft = { value: tc };
      sh.uniforms.cFurn = { value: new THREE.Color(0xf0ebe2) };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 cTuft;\nuniform vec3 cFurn;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(cTuft, cFurn, vColor.r) * (0.7 + 0.3 * diffuseColor.r);');
    };
    tm.customProgramCacheKey = () => 'cat-tuft-v1';
    tuftMesh = new PetMesh(S.tuftGeo, tm, hb);
    meshes.push(tuftMesh);
  }
  for (const m of meshes) {
    m.bind(skeleton, new THREE.Matrix4());
    m.castShadow = m === coatMesh;
    m.receiveShadow = true;
    root.add(m);
    hb.meshes.push(m);
  }
  // Couches de poil (poil long) : haute qualité seulement, copies de la version réduite du pelage.
  const shells = [];
  if (gfx.quality === 'high' && B.shells > 0) {
    const sg = S.lodCoat ?? S.coatGeo;
    const furMap = new THREE.Vector4(Math.max(0.004, B.fur * 0.7), B.ruff * 0.6, B.breeches * 0.008, B.tailFur * 0.006);
    for (let k = 1; k <= B.shells; k++) {
      const sm = new PetMesh(sg, catShellMaterial(coatMat, uniforms, k / B.shells, furMap), hb);
      sm.bind(skeleton, new THREE.Matrix4());
      sm.castShadow = false;
      sm.receiveShadow = true;
      sm.renderOrder = 1;
      root.add(sm);
      hb.meshes.push(sm);
      shells.push(sm);
    }
  }
  const M = S.measure;
  const Lt = (M.shZ - M.hipZ) + 0.12;
  root.add(contactShadow(M.halfW + 0.015, Lt * 0.9));

  const legs = LEG_KEYS.map(([, s, front], l) => {
    const names4 = front ? LEG_BONES.front : LEG_BONES.hind;
    return {
      top: bone((front ? 'scap' : 'femur') + s), pivot: bone(names4[0] + s), knee: bone(names4[1] + s), fetlock: bone(names4[2] + s), paw: bone(names4[3] + s),
      front, side: s === 'L' ? 1 : -1, soles: M.soles[l],
    };
  });
  const headB = bone('head');
  const neckB = bone('neck2');
  const tailB = base.tailBones.map((i) => bones[i]);
  const ears = [bone('ear1L'), bone('ear1R')].filter(Boolean);
  ears.forEach((e, i) => {
    e.userData.side = i === 0 ? 1 : -1;
    e.userData.rest = e.rotation.clone();
  });
  // Repères dans le repère des os (au repos) : bouche, dessus du crâne, collier, bout de la queue.
  const toLocal = (b, p) => b.worldToLocal(p.clone());
  const mouth = toLocal(headB, M.noseTip.clone().add(V(0, -0.012 * B.head, -0.006 * B.head)));
  const skull = toLocal(headB, M.skullTop);
  const collarC = toLocal(neckB, M.collar.center);
  const neckQi = neckB.getWorldQuaternion(new THREE.Quaternion()).invert();
  const collarN = M.axis.clone().applyQuaternion(neckQi);
  const ringQ = (() => {
    const z = M.axis.clone().normalize();
    const x = V(1, 0, 0).addScaledVector(z, -z.x).normalize();
    const y = z.clone().cross(x);
    return neckQi.clone().multiply(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)));
  })();
  const headQ = headB.getWorldQuaternion(new THREE.Quaternion()).invert();
  const lastTail = tailB[tailB.length - 1] ?? null;
  const model = {
    root,
    body: bone('root'),
    neck: neckB,
    head: headB,
    tail: tailB[0] ?? bone('pelvis'),
    tailTip: lastTail,
    tailBones: tailB,
    ears,
    legs,
    lids,
    skeleton,
    bones,
    bone,
    coatMesh,
    eyeMesh,
    lidMesh,
    tuftMesh,
    shells,
    uniforms,
    coatPlan: plan,
    // (interface du modèle procédural : hauteurs en unités « taille 1 »)
    y0: (M.topY + M.bellyY) / 2,
    legTop: M.elbowY,
    saddleY: M.topY,
    headHeight: M.headY,
    headTilt: 0,
    snoutTip: [M.noseTip.x, M.noseTip.y, M.noseTip.z],
    mouth,
    skull,
    // (mêmes mesures que le chien réaliste : collier plat de gearModels.js, nœud du concours de Beauty.js, accessoires
    // du salon de salon.js ; un chat ne porte pas de manteau : pas de coupes du tronc)
    dogFit: { collar: { center: collarC, normal: collarN, q: ringQ, rx: M.collar.rx, ry: M.collar.ry, bone: neckB }, rings: [], ycAt: (M.topY + M.bellyY) / 2, midX: base.land.midX, hipZ: M.hipZ, shZ: M.shZ, topY: M.topY, bellyY: M.bellyY },
    accessoryFit: { skull, headQ, mouth, headR: 0.034 * B.head, tailTip: lastTail },
    build: B,
    kind: B.model,
    kitten: !!B.kitten,
    stage: stage === 'baby' || stage === 'young' ? stage : 'adult',
    realCat: true,
  };
  model.catFit = model.dogFit;
  model.anim = new RealCatAnim(model, base, S);
  hb.anim = model.anim;
  model.bounds = hb;
  model.lodLevel = 0;
  model.setLod = (level, near = true) => {
    const l = S.lodCoat && level ? 1 : 0;
    for (const sm of shells) sm.visible = !l && near;
    if (l === model.lodLevel) return;
    model.lodLevel = l;
    coatMesh.geometry = l ? S.lodCoat : S.coatGeo;
    if (eyeMesh) eyeMesh.geometry = l ? S.lodEye ?? S.eyeGeo : S.eyeGeo;
    if (tuftMesh) tuftMesh.visible = !l;
  };
  model.staticPose = (kind = 'stand') => model.anim.staticPose(kind);
  model.setCoat = (lk2) => setCatCoat(uniforms, catCoatPlan(lk2, breedById(lk2.breed ?? look.breed), B.kitten));
  // Coupe du salon de toilettage (Groomer.refreshCutVisuals) : poil raccourci ou gonflé par le shader, coupe « lion »
  // des persans (corps rasé, collerette gardée). null : poil de la race.
  model.setCut = (style) => {
    const f = Math.max(0.004, B.fur);
    const cut = {
      court: [-0.6 * f, -0.6 * f, -0.3 * f, -0.4 * f], tonte: [-0.8 * f, -0.8 * f, -0.5 * f, -0.6 * f],
      concours: [-0.2 * f, 0, 0, 0.2 * f], long: [0.3 * f, 0.3 * f, 0.15 * f, 0.3 * f],
      lion: [-0.85 * f, 0.4 * f + 0.004, -0.4 * f, 0.006], caniche: [-0.7 * f, 0.004, 0.008, 0.008],
    }[style] ?? [0, 0, 0, 0];
    uniforms.cCut.value.set(...cut);
    model.cut = style ?? null;
  };
  let disposed = false;
  model.dispose = () => {
    if (disposed) return;
    disposed = true;
    model.anim.dispose();
    for (const m of [coatMat, eyeMesh?.material, tuftMesh?.material, ...shells.map((x) => x.material)]) m?.dispose?.();
    releaseShape(S);
  };
  model.anim.staticPose('stand');
  return model;
}

// ------------------------------------------------------------------ animation

/**
 * Allure d'après la vitesse (m/s, ramenée à la taille et aux pattes du modèle d'origine), avec hystérésis.
 * prev : allure de l'image précédente ('idle', 'walk', 'trot', 'run').
 */
const GAIT_UP = { walk: 1.15, trot: 3.0 };
const GAIT_DOWN = { trot: 0.95, run: 2.6 };
export function pickCatGait(prev, u) {
  if (!(u >= 0.05)) return 'idle';
  let g = prev === 'idle' || prev === 'balance' || !prev ? 'walk' : prev;
  for (let k = 0; k < 3; k++) {
    if (g === 'walk' && u > GAIT_UP.walk) g = 'trot';
    else if (g === 'trot' && u > GAIT_UP.trot) g = 'run';
    else if (g === 'run' && u < GAIT_DOWN.run) g = 'trot';
    else if (g === 'trot' && u < GAIT_DOWN.trot) g = 'walk';
  }
  return g;
}

// Postures : clip qui la tient ; passages d'une posture à l'autre (clip joué une fois, ou fondu si null). Le chemin le
// plus court est pris : un chat debout qui doit se mettre en boule s'assoit, se couche, puis s'enroule.
export const POSTURE_CLIP = { stand: 'idle', sit: 'sit', groom: 'groom', lie: 'lie', curl: 'sleep', crouch: 'eat' };
const EDGES = [
  ['stand', 'sit', 'sit_down'], ['sit', 'stand', 'stand_up'], ['sit', 'lie', 'lie_down'], ['lie', 'stand', 'get_up'],
  ['lie', 'curl', 'curl_up'], ['curl', 'lie', null], ['sit', 'groom', null], ['groom', 'sit', null],
  ['stand', 'crouch', null], ['crouch', 'stand', null], ['lie', 'sit', null],
];
const ONCE = ['sit_down', 'stand_up', 'lie_down', 'get_up', 'curl_up', 'jump', 'highfive', 'stretch'];

/** Chemin le plus court entre deux postures : liste d'arêtes [de, vers, clip] (un fondu compte 1,5 passage). */
export function catPosturePath(from, to) {
  if (from === to) return [];
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

const AX = V(1, 0, 0); // (tourner autour de x du chat, positif : vers le bas pour une tête qui regarde devant)
const AXIS_Y = V(0, 1, 0);
const AZ = V(0, 0, 1);
const _ax = V();
const _q2v = V();

/**
 * Mixeur d'un chat : allures fondues selon la vitesse (chaque clip joué à vitesse réelle ÷ vitesse naturelle de cette
 * race : pieds en appui tenus sur place au pas et au trot), postures (debout, assis, toilette, couché en sphinx, en
 * boule, accroupi pour manger) avec leurs passages, gestes joués une fois (étirement au réveil, tours du spectacle,
 * saut) ; par-dessus : regard, paupières (clignement, yeux mi-clos, fermés en boule), oreilles, queue levée quand il
 * suit, gonflée quand il a peur, respiration, embonpoint ; pattes, croupe, queue et tête jamais sous le sol.
 */
class RealCatAnim {
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
      if (name === 'tail_up' || name === 'ears') continue; // (calques : voir tailUpQ, oreilles procédurales)
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
    this.speedScale = k;
    this.gait = 'idle';
    this.posture = 'stand';
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
    this.t = (model.root.id * 7.31) % 100;
    this.seen = false;
    this.seenNow = false;
    this.frame = -1;
    this.skipDt = 0;
    this.skipN = 0;
    this.blink = 0;
    this.blinkT = 2;
    this.look = new THREE.Vector2();
    this.tailUp = 0;
    this.puff = 0;
    this.earBack = 0;
    this.trick = null;
    this.oneShot = null;
    this.lead = 'walk';
    this.gOff = 0;
    this.plant = [null, null, null, null];
    this.bodyAllow = 0.003 + Math.max(0, B.fur) * 0.35;
    this.solePts = model.legs.map((l) => l.soles.map((i) => l.paw.worldToLocal(V().fromArray(S.D.pos, i * 3))));
    for (const [b, d] of this.shift) b.position.sub(d);
    this.savePose();
    this.tailUpQ = this.sampleTail('tail_up');
    this.contactPoints();
    this.measureNatural();
  }

  /** Rotations locales des os de la queue d'un clip (calque « queue levée »), à son début. */
  sampleTail(name) {
    const clip = this.base.clips[name];
    if (!clip) return null;
    const a = this.mixer.clipAction(clip);
    for (const x of this.list) x.setEffectiveWeight(0);
    a.reset().play().setEffectiveWeight(1);
    a.time = 0;
    this.restorePose();
    this.mixer.update(0);
    const out = this.model.tailBones.map((b) => b.quaternion.clone());
    a.stop();
    this.mixer.uncacheAction(clip);
    for (const nm of this.names) this.actions[nm].setEffectiveWeight(this.w[nm]);
    this.restorePose();
    return out;
  }

  /**
   * Vitesse naturelle de chaque allure pour cette race, mesurée sur son squelette : vitesse à laquelle les doigts en
   * appui reculent sous le corps quand le clip est joué à sa vitesse (voir dogReal.js). Une fois par race.
   */
  measureNatural() {
    const S = this.S;
    if (!S.natural) {
      const md = this.model;
      const feet = ['toesL', 'toesR', 'htoesL', 'htoesR'].map((nm) => md.bone(nm));
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
        if (!fr.length || !hi.length) continue;
        const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
        nat[g] = (avg(fr) + avg(hi)) / 2;
      }
      S.natural = nat;
      for (const nm of this.names) this.actions[nm].setEffectiveWeight(this.w[nm]);
      this.restorePose();
    }
    for (const g of MOVING) if (S.natural[g] > 0.05) this.natural[g] = S.natural[g];
  }

  /**
   * Points de contact avec le sol des poses à l'arrêt (assis, toilette, couché, en boule, manger, étirement, tour) :
   * pour chaque pose, les sommets les plus bas du corps, de la queue et de la tête, plus un échantillon régulier ;
   * calculés une fois par race (voir dogReal.js contactPoints).
   */
  contactPoints() {
    const S = this.S;
    const base = this.base;
    const md = this.model;
    const coat = base.prims.coat;
    const W = base.W;
    const n = coat.count;
    if (!S.contact) {
      const cls = new Int8Array(n); // 0 corps, 1 queue, 2 tête, -1 ignoré (oreilles)
      for (let i = 0; i < n; i++) {
        const ear = W.ear[i * 2] + W.ear[i * 2 + 1];
        cls[i] = W.tail[i] > 0.3 ? 1 : ear > 0.3 ? -1 : W.head[i] > 0.6 ? 2 : 0;
      }
      const pick = [new Set(), new Set(), new Set()];
      const stride = [Math.ceil(n / 100), 9, 14];
      for (let i = 0; i < n; i++) if (cls[i] >= 0 && i % stride[cls[i]] === 0) pick[cls[i]].add(i);
      const P = S.D.pos;
      const inv = md.skeleton.boneInverses;
      const ys = new Float32Array(n);
      const bm = new THREE.Matrix4();
      const poses = [['sit', 0], ['groom', 0.3], ['groom', 0.7], ['lie', 0], ['sleep', 0], ['eat', 0.3], ['stretch', 0.5], ['highfive', 0.5]];
      for (const [clip, t] of poses) {
        if (!this.actions[clip]) continue;
        this.clipPose(clip, t, false);
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
        for (let k = 0; k < 3; k++) {
          const ids = [];
          for (let i = 0; i < n; i++) if (cls[i] === k) ids.push(i);
          ids.sort((a, b) => ys[a] - ys[b]);
          for (const i of ids.slice(0, 20)) pick[k].add(i);
        }
      }
      S.contact = pick.map((s) => Uint32Array.from(s));
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
    const tb = md.tailBones;
    this.tailPts = [...S.contact[1]].map((i) => {
      let best = 0;
      let bw = -1;
      for (let c = 0; c < 4; c++) {
        const k = tb.indexOf(this.bones[coat.si[i * 4 + c]]);
        if (k >= 0 && coat.sw[i * 4 + c] > bw) {
          bw = coat.sw[i * 4 + c];
          best = k;
        }
      }
      return { inf: infl(i), bone: best };
    });
    this.headPts = [...S.contact[2]].map(infl);
    this.bones.forEach((b, i) => {
      b.position.copy(hold[i][0]);
      b.quaternion.copy(hold[i][1]);
    });
    md.root.updateMatrixWorld(true);
  }

  /** Pose d'un clip tenu à une fraction t de sa durée, pieds et corps posés (ground : false pendant les mesures). */
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
    const st = { moving: false, v: 0, sleeping: false, sad: false };
    this.overlay(0, st, true);
    if (settle) this.ground(st);
    this.model.root.updateMatrixWorld(true);
  }

  /** Tourne un os de ang autour d'un axe du chat (axe vu par son parent au repos ; il suit le parent animé). */
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

  /** Pose figée (vignettes, caisse de transport) : debout, assis, couché (sphinx) ou en boule, sans temps qui passe. */
  staticPose(kind = 'stand') {
    const posture = { stand: 'stand', sit: 'sit', lie: 'lie', loaf: 'lie', sleep: 'curl', curl: 'curl' }[kind] ?? 'stand';
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
    const st = { moving: false, v: 0, sleeping: posture === 'curl', sad: false, posture };
    this.overlay(0, st, true);
    this.ground(st);
    this.model.root.updateMatrixWorld(true);
  }

  /**
   * Une image. st : { v (m/s, chat de taille 1), moving, balance (sur une barre), posture ('stand' | 'sit' | 'groom' |
   * 'lie' | 'curl' | 'crouch'), sleeping, sad, fear, following, happy, look (cible du regard, repère du chat) ou null,
   * fat, quick }.
   */
  update(dt, st) {
    this.restorePose();
    this.t += dt;
    const u = st.moving ? st.v / this.speedScale : 0;
    const g = st.moving && st.balance && this.actions.balance ? 'balance' : pickCatGait(this.gait === 'balance' ? 'walk' : this.gait, u);
    this.gait = g;
    // Posture voulue (debout dès qu'il bouge) ; passages joués une fois, par le plus court chemin.
    const want = st.moving ? 'stand' : st.posture ?? 'stand';
    if (this.trans) {
      const a = this.actions[this.trans.name];
      if (!a || a.time >= a.getClip().duration - 0.04 || (st.moving && this.trans.to !== 'stand')) {
        this.posture = st.moving ? 'stand' : this.trans.to;
        this.trans = null;
      }
    }
    if (!this.trans && want !== this.posture) {
      if (st.moving) this.posture = 'stand';
      else {
        const [edge] = catPosturePath(this.posture, want);
        const clip = edge[2];
        if (clip && this.actions[clip]) {
          const a = this.actions[clip];
          a.reset();
          a.play();
          this.trans = { name: clip, to: edge[1] };
        } else this.posture = edge[1];
      }
    }
    // Geste joué une fois (étirement au réveil), tours du spectacle (clip tenu à un instant, voir realCatPose).
    if (this.oneShot) {
      const a = this.actions[this.oneShot];
      if (!a || st.moving || (a.time >= a.getClip().duration - 0.04 && this.oneShotAge > 0.2)) this.oneShot = null;
    }
    this.oneShotAge = (this.oneShotAge ?? 0) + dt;
    const target = this.target;
    for (let j = 0; j < this.names.length; j++) target[this.names[j]] = 0;
    const trick = this.trick && this.trick.age < 0.25 ? this.trick : null;
    if (this.trick) this.trick.age += dt;
    let fadeK = 5;
    if (trick && this.actions[trick.clip]) {
      target[trick.clip] = trick.w;
      const rest = 1 - trick.w;
      if (rest > 0.01) target[POSTURE_CLIP[this.posture] ?? 'idle'] = rest;
      fadeK = 8;
    } else if (this.oneShot && !st.moving) {
      target[this.oneShot] = 1;
      fadeK = 6;
    } else if (this.trans) {
      target[this.trans.name] = 1;
      fadeK = 12;
    } else if (st.moving) {
      target[g === 'idle' ? 'walk' : g] = 1;
      fadeK = 6;
    } else {
      target[POSTURE_CLIP[this.posture] ?? 'idle'] = 1;
      fadeK = this.posture === 'curl' ? 1.6 : 3.5;
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
      // (un geste ou un passage qui revient : rejoué depuis le début)
      if (was === 0 && w > 0 && ONCE.includes(name) && name !== trick?.clip) a.reset().play();
      a.setEffectiveWeight(w);
      if (MOVING.includes(name)) {
        const nat = this.natural[name];
        a.timeScale = Math.min(2.2, Math.max(0.45, (st.moving ? st.v : nat) / nat));
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
    this.ground(st, dt);
  }

  /** Procédural par-dessus les clips. */
  overlay(dt, st, still) {
    const md = this.model;
    const t = this.t;
    const u = md.uniforms;
    const curl = this.posture === 'curl' || st.posture === 'curl';
    const sleeping = !!st.sleeping || curl;
    const lk = still ? 1 : Math.min(1, dt * 3);
    // Respiration (plus lente endormi), embonpoint, queue gonflée de peur.
    u.cBreath.value = Math.sin(t * (sleeping ? 1.3 : 2.6)) * (sleeping ? 0.0018 : 0.0011);
    u.cFat.value = Math.max(-0.005, Math.min(0.012, ((st.fat ?? 1) - 1) * 0.03));
    this.puff += ((st.fear ? 1 : 0) - this.puff) * (still ? 1 : Math.min(1, dt * 4));
    u.cPuff.value = this.puff * 0.012;
    // Regard : vers ce qui l'intéresse (le joueur proche), sinon il regarde autour de lui ; moins en marche, pas en
    // dormant, peu pendant la toilette et le repas (le clip guide la tête).
    const moving = !!st.moving;
    const busy = this.posture === 'groom' || this.posture === 'crouch' || sleeping ? 0.15 : 1;
    let yaw = (Math.sin(t * 0.37) * 0.5 + Math.sin(t * 0.13 + 1.7) * 0.5) * 0.5 * (moving ? 0.15 : 1);
    let pitch = Math.sin(t * 0.21 + 0.6) * 0.08;
    if (st.look) {
      yaw = clamp(Math.atan2(st.look.x, Math.max(0.05, st.look.z)), -1.1, 1.1);
      pitch = clamp(-Math.atan2(st.look.y, Math.hypot(st.look.x, st.look.z)), -0.5, 0.35);
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
      this.turn(neck, AXIS_Y, this.look.x * 0.45);
      this.turn(head, AXIS_Y, this.look.x * 0.4);
      this.turn(head, AX, this.look.y * 0.5);
    }
    if (st.sad && !moving && !sleeping) this.turn(neck, AX, 0.2);
    // Paupières : clignement ; mi-closes pendant la toilette et couché ; fermées en boule.
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blink = 1;
      this.blinkT = 2.5 + ((Math.sin(t * 12.9898) * 43758.5) % 1 + 1) % 1 * 4;
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    const half = this.posture === 'groom' ? 0.55 : this.posture === 'lie' ? 0.3 + 0.25 * Math.max(0, Math.sin(t * 0.2)) : 0;
    const closed = sleeping ? 1 : Math.max(half, Math.sin(Math.PI * this.blink));
    for (const lid of md.lids) {
      const on = closed > 0.03;
      lid.scale.setScalar(on ? 1 : 0.0001);
      lid.quaternion.copy(lid.userData.restQ);
      if (on) this.turn(lid, AX, -1.35 * (1 - closed));
    }
    // Oreilles : elles bougent vers ce qu'il écoute, se couchent quand il a peur, qu'il est triste ou endormi.
    const fold = md.build.ears === 'fold';
    this.earBack += (((st.fear ? 1 : 0) + (st.sad ? 0.45 : 0) + (sleeping ? 0.2 : 0)) - this.earBack) * (still ? 1 : Math.min(1, dt * 5));
    const ears = md.ears;
    for (let i = 0; i < ears.length; i++) {
      const e = ears[i];
      const s = e.userData.side;
      const n1 = Math.sin(t * 1.3 + i * 2.1) + Math.sin(t * 0.47 + i);
      const flick = Math.max(0, Math.sin(t * 1.7 + i * 2.6) - 0.94) * 12;
      const k = fold ? 0.25 : 1;
      this.turn(e, AX, (n1 * 0.04 - flick * 0.2 - this.earBack * 0.7) * k);
      this.turn(e, AZ, -s * (this.earBack * 0.5 + flick * 0.12) * k);
    }
    // Queue : levée en point d'interrogation quand il suit quelqu'un (debout ou au pas), basse s'il est triste.
    const tb = md.tailBones;
    const upW = (st.following || st.happy > 0.8) && this.posture === 'stand' && (!moving || this.gait === 'walk') ? 1 : 0;
    this.tailUp += (upW - this.tailUp) * (still ? 1 : Math.min(1, dt * 3));
    if (this.tailUpQ && this.tailUp > 0.01) {
      for (let i = 0; i < tb.length; i++) tb[i].quaternion.slerp(this.tailUpQ[i], this.tailUp);
      this.turn(tb[tb.length - 1], AXIS_Y, Math.sin(t * 3.1) * 0.25 * this.tailUp);
    }
    if (st.sad && tb.length && !sleeping) this.turn(tb[0], AX, 0.35);
    if (st.fear && tb.length) this.turn(tb[0], AX, -0.25);
  }

  /**
   * Pieds au sol. Au pas, au trot et en équilibre, la sole la plus basse est posée sur le sol et les pieds en appui sont
   * tenus sur place (footLock) ; à la course et pendant le saut, le chat est seulement relevé (temps de suspension) ;
   * à l'arrêt, les soles et la peau du corps (croupe assise, ventre couché) sont posées, sans s'enfoncer. Queue et tête
   * relevées au-dessus du sol. dt : 0 pour une pose fixe (sans transition).
   */
  ground(st, dt = 0) {
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
    const air = (this.trick?.clip === 'jump' && this.trick.age < 0.25) || (this.w.jump ?? 0) > 0.3;
    let target;
    let floor = -low;
    if (st.moving || air) {
      target = !air && this.gait !== 'run' ? -low : Math.max(0, -low);
    } else {
      let lowB = Infinity;
      for (const pt of this.bodyPts) {
        _w.set(0, 0, 0);
        for (const [b, p, w] of pt) _w.addScaledVector(_v.copy(p).applyMatrix4(b.matrixWorld), w);
        const y = _w.applyMatrix4(_m).y;
        if (y < lowB) lowB = y;
      }
      target = Math.max(-low, Number.isFinite(lowB) ? -(lowB + this.bodyAllow) : -Infinity);
      floor = target;
    }
    let off = dt > 0 ? this.gOff + (target - this.gOff) * Math.min(1, dt * 6) : target;
    off = Math.max(off, floor);
    this.gOff = off;
    if (Math.abs(off) > 0.0002) {
      md.body.position.y += off;
      md.root.updateMatrixWorld(true);
    }
    if (st.moving && !air && dt > 0 && this.gait !== 'run') {
      this.footLock();
      let low2 = Infinity;
      for (let l = 0; l < md.legs.length; l++) {
        for (const p of this.solePts[l]) {
          const y = _v.copy(p).applyMatrix4(md.legs[l].paw.matrixWorld).applyMatrix4(_m).y;
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
    const sitW = (this.w.sit ?? 0) + (this.w.groom ?? 0) + (this.w.sit_down ?? 0) + (this.w.stand_up ?? 0) + (this.w.highfive ?? 0);
    const lieW = (this.w.lie ?? 0) + (this.w.sleep ?? 0) + (this.w.lie_down ?? 0) + (this.w.get_up ?? 0) + (this.w.curl_up ?? 0);
    if (sitW > 0.3) this.settleSit();
    else if (sitW < 0.1 && lieW < 0.1) this.settleStand();
    // Queue : sa peau au-dessus du sol (assis, couché, en boule) — chaque os relevé, de la base au bout.
    const tb = md.tailBones;
    const floorT = 0.003;
    if (tb.length && this.tailPts.length) {
      tail: for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < tb.length; i++) {
          let lowY = Infinity;
          for (const pt of this.tailPts) {
            if (pt.bone < i) continue;
            const y = this.skinY(pt.inf);
            if (y < lowY) {
              lowY = y;
              _u.copy(_w);
            }
          }
          if (!(lowY < floorT)) {
            if (i === 0) break tail;
            continue;
          }
          this.turn(tb[i], AX, raiseAngle(_v.setFromMatrixPosition(tb[i].matrixWorld).applyMatrix4(_m), _u, floorT + 0.003, i === 0 ? 1.2 : 0.9));
          tb[i].updateMatrixWorld(true);
        }
      }
    }
    // Tête : jamais sous le sol (races aux pattes courtes qui mangent, en boule) — l'encolure la relève.
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
        const floorH = 0.004;
        if (!(lowY < floorH)) break;
        this.turn(md.neck, AX, raiseAngle(_v.setFromMatrixPosition(md.neck.matrixWorld).applyMatrix4(_m), _u, floorH + 0.003, 0.8));
        md.neck.updateMatrixWorld(true);
      }
    }
  }

  /**
   * Pieds en appui tenus sur place (pas, trot, équilibre) : quand une patte se pose, la place de ses doigts est notée ;
   * tant qu'elle reste posée, la patte est tournée à l'épaule ou à la hanche pour y ramener les doigts. Les pattes
   * raccourcies ou allongées d'une race changent la foulée du clip : sans cela, les pieds patinaient en appui.
   */
  footLock() {
    const md = this.model;
    const inv = _m;
    for (let l = 0; l < md.legs.length; l++) {
      const leg = md.legs[l];
      let low = Infinity;
      for (const p of this.solePts[l]) {
        const y = _v.copy(p).applyMatrix4(leg.paw.matrixWorld).applyMatrix4(inv).y;
        if (y < low) low = y;
      }
      if (!(low < 0.006)) {
        this.plant[l] = null;
        continue;
      }
      const toe = _u.setFromMatrixPosition(leg.paw.matrixWorld);
      if (!this.plant[l]) {
        this.plant[l] = toe.clone();
        continue;
      }
      const errW = _v.copy(toe).sub(this.plant[l]);
      _q.setFromRotationMatrix(md.root.matrixWorld).invert();
      const ez = errW.applyQuaternion(_q).z;
      const top = _w.setFromMatrixPosition(leg.pivot.matrixWorld);
      const Lg = Math.max(0.02, top.distanceTo(toe));
      const th = Math.asin(clamp(ez / Lg, -0.5, 0.5));
      if (Math.abs(th) < 1e-4) continue;
      this.turn(leg.pivot, AX, th);
      leg.pivot.updateMatrixWorld(true);
      if (Math.abs(ez) > 0.45 * Lg) this.plant[l] = null;
    }
  }

  /**
   * Chat assis, posé sur sa croupe : les pattes avant courtes ou longues d'une race (persan, siamois) laissaient les
   * pieds avant en l'air ou sous le sol. Le corps bascule autour de la racine pour poser les pieds avant au niveau du
   * reste de l'appui (pieds arrière, croupe), puis est reposé au sol (voir dogReal.js settleSit).
   */
  settleSit() {
    const md = this.model;
    const lowSole = (l, out) => {
      out.y = Infinity;
      for (const p of this.solePts[l]) {
        _v.copy(p).applyMatrix4(md.legs[l].paw.matrixWorld).applyMatrix4(_m);
        if (_v.y < out.y) out.copy(_v);
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
      const th = clamp(gap / Math.max(0.03, f.z - o.z), -0.4 - total, 0.5 - total);
      if (!(Math.abs(th) > 0.001)) break;
      const fl = o.y;
      this.turn(md.body, AX, th);
      total += th;
      md.root.updateMatrixWorld(true);
      const m = Math.min(lowFront().y, lowRest().y);
      md.body.position.y -= m - fl;
      md.root.updateMatrixWorld(true);
    }
  }

  /**
   * Debout sur place (et accroupi pour manger) : le corps est redressé autour de la racine pour remettre l'avant et
   * l'arrière à la même hauteur (pattes avant et arrière de longueurs différentes selon la race), puis reposé au sol.
   */
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
        for (const p of this.solePts[l]) {
          _v.copy(p).applyMatrix4(md.legs[l].paw.matrixWorld).applyMatrix4(_m);
          if (_v.y < out.y) out.copy(_v);
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
      const th = clamp(-gap / Math.max(0.03, F.z - Hn.z), -0.3 - total, 0.3 - total);
      if (!(Math.abs(th) > 0.001)) break;
      this.turn(md.body, AX, th);
      total += th;
      md.root.updateMatrixWorld(true);
      scan();
      md.body.position.y -= Math.min(F.y, Hn.y) - fl;
      md.root.updateMatrixWorld(true);
    }
  }

  /** Hauteur (repère du chat, _m : inverse de la racine) d'un point de peau ; sa position dans _w. */
  skinY(inf) {
    _w.set(0, 0, 0);
    for (const [b, p, w] of inf) _w.addScaledVector(_q2v.copy(p).applyMatrix4(b.matrixWorld), w);
    return _w.applyMatrix4(_m).y;
  }
}

// ------------------------------------------------------------------ entité du jeu

const _wv = V();

/**
 * Poses imposées par les activités (src/game/Activities.js, après l'animation) : 'sit', 'highfive', 'down', 'jump'
 * (phase t), 'bow', 'heel'. s : 0 → 1 (amplitude). Le chat réaliste joue le clip correspondant (tenu au temps voulu) à
 * l'image suivante. Renvoie true si le modèle est le chat réaliste (sinon l'activité garde sa pose habituelle).
 */
export function realCatPose(md, kind, s, sg = null, t = null) {
  if (!md?.realCat) return false;
  const a = md.anim;
  const map = { sit: 'sit', heel: 'sit', highfive: 'highfive', down: 'lie', jump: 'jump', bow: 'stretch', paw: 'highfive' };
  const clip = map[kind];
  if (!clip || !a.actions[clip]) return true;
  let time;
  if (kind === 'jump') time = t ?? 0.5;
  else if (kind === 'highfive' || kind === 'paw') time = 0.2 + 0.3 * Math.min(1, s);
  else if (kind === 'bow') time = 0.25 + 0.2 * Math.min(1, s);
  a.trick = { clip, w: kind === 'jump' ? 1 : Math.min(1, s * 1.5), time, age: 0 };
  if (sg && kind !== 'jump') {
    sg.rotation.x = 0;
    sg.rotation.z = 0;
  }
  return true;
}

/**
 * Animation d'une entité (AnimalEntity) au chat réaliste : ce qu'il fait (allure selon sa vitesse, en équilibre sur une
 * barrière, assis, toilette, couché, en boule pour dormir, étirement au réveil, accroupi pour manger, porté dans les
 * bras, sur la table du salon, peur, queue levée quand il suit) ; renseigne e.gait et e.headDown.
 */
export function animateRealCat(e, dt, sad) {
  const md = e.model;
  const anim = md.anim;
  const d = e.data;
  // Version réduite au loin ; couches de poil de près seulement.
  if (horseView.on && md.setLod && !md.lodHold) {
    const far = gfx.quality === 'high' ? CAT_LOD_DIST.high : CAT_LOD_DIST.low;
    const dist = _wv.setFromMatrixPosition(e.root.matrixWorld).distanceTo(horseView.eye) / Math.max(0.15, e.scale);
    md.setLod(dist > far * (md.lodLevel ? 0.9 : 1) ? 1 : 0, dist < CAT_SHELL_DIST);
  }
  // Hors du champ et livré à lui-même : animé une image sur OFFSCREEN_STEP avec le temps cumulé (jamais quand une
  // activité le guide, qu'il est porté, sur la table du salon ou perché sur une barrière).
  if (anim.frame !== horseView.frame) {
    anim.frame = horseView.frame;
    anim.seenNow = false;
  }
  if (anim.seen) {
    anim.seenNow = true;
    anim.seen = false;
  }
  if (!anim.seenNow && !e.scripted && !e.herdCtrl && !e.posing && !e.onTable && !e.carried && !e.perch && !d.following && horseView.on) {
    anim.skipDt += dt;
    if (++anim.skipN < OFFSCREEN_STEP) return;
    dt = anim.skipDt;
  } else {
    dt += anim.skipDt;
  }
  anim.skipDt = 0;
  anim.skipN = 0;
  // Ce qu'il fait au repos (comme catAnim.js) : debout un moment, puis assis, toilette ou couché en sphinx selon son
  // caractère et sa fatigue ; au réveil, il s'étire.
  const rs = (e.realCatSt ??= { idle: 'stand', idleT: 1 + Math.random() * 2, still: 0, wasAsleep: false });
  const moving = e.speed > 0.05;
  const asleep = !!e.sleeping;
  if (rs.wasAsleep && !asleep && !moving && anim.actions.stretch) {
    anim.oneShot = 'stretch';
    anim.oneShotAge = 0;
  }
  rs.wasAsleep = asleep;
  rs.still = moving ? 0 : rs.still + dt;
  let posture = 'stand';
  if (asleep) posture = 'curl';
  else if (e.carried) posture = 'lie';
  else if (e.onTable || e.posing === 'sit') posture = 'sit';
  else if (e.posing === 'down') posture = 'lie';
  else if (e.state === 'eat' || (e.headDown ?? 0) > 0.5) posture = 'crouch';
  else if (e.state === 'mother' && !moving && d.needs?.hunger < 60) posture = 'crouch';
  else if (rs.still < 1.2 || e.perch || e.state === 'flee') posture = 'stand';
  else if (!e.scripted && !d.following) {
    rs.idleT -= dt;
    if (rs.idleT <= 0) {
      const next = pickIdlePose({ personality: d.personality, energy: d.needs?.energy ?? 80, prev: rs.idle });
      if (rs.idle === 'loaf' && next.pose !== 'loaf' && Math.random() < 0.5 && anim.actions.stretch) {
        anim.oneShot = 'stretch';
        anim.oneShotAge = 0;
      }
      rs.idle = next.pose;
      rs.idleT = next.duration;
    }
    posture = rs.idle === 'loaf' ? 'lie' : rs.idle;
  } else if (d.following) posture = rs.still > 3 ? 'sit' : 'stand';
  // Pose imposée (spectacle, captures, vignettes) : posture ou tour.
  const ov = e.catPoseOverride;
  if (ov) {
    if (ov === 'highfive') realCatPose(md, 'highfive', 1);
    else if (ov === 'stretch') {
      if (!anim.oneShot) {
        anim.oneShot = 'stretch';
        anim.oneShotAge = 0;
      }
    } else posture = { loaf: 'lie', sleep: 'curl', eat: 'crouch' }[ov] ?? ov;
  }
  const st = (e.catSt ??= {});
  st.v = e.speed / Math.max(0.15, e.scale);
  st.moving = moving && !asleep;
  st.balance = e.perch?.phase === 'on';
  st.sleeping = asleep;
  st.posture = posture;
  st.sad = sad;
  st.fear = e.state === 'flee';
  st.following = !!(d.following || e.herdCtrl?.pusher);
  if (e.happyFor > 0) e.happyFor = Math.max(0, e.happyFor - dt);
  st.happy = (e.happyFor ?? 0) > 0 ? 1 : 0;
  st.quick = !!e.posing;
  st.fat = 1 + ((d.weight ?? 50) - 50) / 50 * 0.6;
  st.look = e.lookAt ?? null;
  anim.update(dt, st);
  e.gait = anim.gait === 'run' ? 2 : anim.gait === 'trot' ? 1 : 0;
  e.headDown = posture === 'crouch' ? 1 : 0;
}
