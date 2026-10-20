// Chiens réalistes : deux modèles d'artistes pour toutes les races (src/sim/dogLook.js) — le shiba inu de
// quander (Sketchfab, CC-BY 4.0) pour les chiens moyens et grands, le jack russell de FainoDS (Sketchfab, CC-BY 4.0)
// pour les petits —, préparés et animés pour le jeu (public/models/dog_shiba.glb, dog_jack.glb ; tools/chien/).
//
// Comme le cheval réaliste (horseReal.js), le GLB n'est qu'une source : à son arrivée on en tire une fois pour toutes
// la géométrie de repos (flottants, repère du chien), le squelette, les clips et les repères du corps. Chaque race a
// sa géométrie, partagée par les chiens de cette race : les os sont déplacés (membres, dos, encolure, museau, tête,
// oreilles, queue) et la peau les suit, le poil long épaissit la silhouette. Chaque chien a son squelette, ses
// matières (robe peinte par le shader de dogCoat.js) et son mixeur d'animations.
//
// Interface : la même que le chien procédural (animalModel.js), qui reste le modèle de repli tant que le GLB n'est
// pas là. Repère : regard vers +Z, y vers le haut, origine au sol sous le milieu du corps ; chien « de taille 1 »
// (garrot 0,57 m, un labrador), l'échelle de la race est appliquée par AnimalEntity.

import * as THREE from 'three';
import { getModel } from '../assets.js';
import { gfx } from '../gfx.js';
import { horseView } from './horseReal.js';
import { dogBuild } from '../../sim/dogLook.js';
import { coatPlan, makeCoatUniforms, makeLandUniforms, setCoat, coatMaterial, furLow, furDetail } from './dogCoat.js';
import { pendantEars, earSkullHide, buildPendantEars, faceShape, buildPompons, joinParts, jackMouthClose } from './dogParts.js';

/** Clés des deux GLB (assets.js) : jamais « dog » (gltfAnimal.js le prendrait pour un animal GLB générique). */
export const REAL_DOG_KEYS = { shiba: 'dog_shiba', jack: 'dog_jack' };
/** Version réduite au-delà de cette distance à la caméra (m, divisée par la taille du chien) ; hystérésis 10 %. */
export const DOG_LOD_DIST = { low: 6, high: 16 };
/** Chien hors du champ : animé une image sur OFFSCREEN_STEP, avec le temps cumulé (comme le cheval). */
export const OFFSCREEN_STEP = 3;
/** Vitesses « naturelles » des allures (m/s, chien de taille 1) si le GLB ne les donne pas. */
export const NATURAL_SPEED = { walk: 0.95, trot: 2.4, run: 5.9 };

const MOVING = ['walk', 'trot', 'run'];
const LEG_KEYS = [['FL', 'L', true], ['FR', 'R', true], ['HL', 'L', false], ['HR', 'R', false]];
const LEG_BONES = { front: ['humerus', 'radius', 'metacarpus', 'toes'], hind: ['femur', 'tibia', 'metatarsus', 'htoes'] };

// Ce qui garde sa couleur d'origine dans la texture (yeux, dents, truffe, langue, coussinets), par modèle.
const MODEL = {
  shiba: {
    keep: { pads: 0.04, pink: true, uv: [[0, 0, 0.255, 0.13], [0.42, 0, 0.9, 0.1]], nose: [0.032, 0.3] },
    grain: 1,
  },
  jack: {
    keep: { dark: 0.02, pink: true, nose: [0.032, 0.25], darkLips: true },
    grain: 0.55,
    // (grain tiré de la texture sans ses plaques blanc et feu : voir furDetail)
    detail: true,
  },
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const _v = V();
const _w = V();
const _u = V();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

// ------------------------------------------------------------------ données de repos (une fois par GLB)

/**
 * Géométrie, squelette, clips et repères de repos tirés d'un GLB de chien, dans le repère du chien (flottants : les
 * positions du fichier sont quantifiées, c'est le squelette qui les remet à l'échelle). Gardé dans gltf.userData.
 */
export function realDogBase(gltf, kind) {
  if (gltf.userData.dogBase) return gltf.userData.dogBase;
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const toDog = scene.matrixWorld.clone().invert();
  const meshes = [];
  const lods = [];
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const lod = o.userData.lod || o.parent?.userData?.lod || /dog_lod/.test(o.name) || /dog_lod/.test(o.parent?.name ?? '');
    (lod ? lods : meshes).push(o);
  });
  const master = meshes.find((m) => m.material.name === 'dog_coat') ?? meshes[0];
  const bones = master.skeleton.bones;
  const names = bones.map((b) => b.name);
  const index = new Map(names.map((n, i) => [n, i]));
  const nb = bones.length;
  const restW = bones.map((b) => new THREE.Matrix4().multiplyMatrices(toDog, b.matrixWorld));
  const heads = restW.map((m) => V().setFromMatrixPosition(m));
  const rotW = restW.map((m) => new THREE.Quaternion().setFromRotationMatrix(m));
  const parent = bones.map((b) => (b.parent?.isBone && index.has(b.parent.name) ? index.get(b.parent.name) : -1));
  const B = (n) => index.get(n) ?? -1;

  // Primitives : pelage (et yeux du jack), position et normale de repos, peau ramenée aux os du squelette maître.
  const prims = {};
  const bm = new THREE.Matrix4();
  const acc = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  for (const mesh of meshes) {
    const role = mesh.material.name === 'dog_eye' ? 'eye' : 'coat';
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
    const toM = new THREE.Matrix4().multiplyMatrices(toDog, mesh.matrixWorld);
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
    prims[role] = { pos, nrm, si, sw, uv, index: Uint32Array.from(g.index.array), count: n, material: mesh.material };
  }
  for (const mesh of lods) {
    const role = mesh.material.name === 'dog_eye' ? 'eye' : 'coat';
    const p = prims[role];
    if (p && mesh.geometry.attributes.position.count === p.count && mesh.geometry.index) p.lodIndex = Uint32Array.from(mesh.geometry.index.array);
  }

  // Ensembles d'os : membres (dans l'ordre de l'interface), oreilles, queue, encolure, tête et ses descendants.
  const desc = (i, set = new Set()) => {
    set.add(i);
    for (let k = 0; k < nb; k++) if (parent[k] === i) desc(k, set);
    return set;
  };
  const legSets = LEG_KEYS.map(([, s, front]) => new Set((front ? LEG_BONES.front : LEG_BONES.hind).map((b) => B(b + s))));
  const earSets = ['L', 'R'].map((s) => new Set([B('ear1' + s), B('ear2' + s)].filter((i) => i >= 0)));
  const ear2 = ['L', 'R'].map((s) => B('ear2' + s));
  const tailBones = [];
  for (let k = 1; B('tail' + k) >= 0; k++) tailBones.push(B('tail' + k));
  const tailSet = new Set(tailBones);
  const headSet = desc(B('head'));
  const neckSet = new Set([B('neck1'), B('neck2')]);
  const eyeSet = new Set([B('eyeL'), B('eyeR'), ...['lidUL', 'lidDL', 'lidUR', 'lidDR', 'lidU2L', 'lidD2L', 'lidU2R', 'lidD2R'].map(B)].filter((i) => i >= 0));
  const noseOut = new Set([...earSets[0], ...earSets[1], ...eyeSet]);
  const boneOf = (sets) => {
    const out = new Int8Array(nb).fill(-1);
    sets.forEach((s, j) => s.forEach((i) => { if (i >= 0) out[i] = j; }));
    return out;
  };
  const legOfBone = boneOf(legSets);

  // Appartenance de chaque sommet (pelage) : membres, oreilles, queue, tête, encolure.
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
    // (jack : les poids par diffusion de chaleur débordent des membres sur les flancs et le ventre ; pris tels quels,
    // le tronc des masques de la robe suivait ces débords — plaques claires et foncées à bords dentelés sur les
    // robes unies — et le ventre mesuré remontait sur le dos)
    const legPart = kind === 'jack' ? smooth(0.3, 0.75, legSum) : legSum;
    part.set([Math.min(1, W.ear[i * 2] + W.ear[i * 2 + 1]), W.tail[i], W.head[i], legPart], i * 4);
  }
  // (robe : la tête comprend tout ce qui est devant l'os de la tête et au-dessus de la mâchoire, même porté par
  // l'encolure — chez le jack, le crâne l'est en partie)
  {
    const hz = heads[B('head')].z;
    let jaw = Infinity;
    for (let i = 0; i < n; i++) if (W.head[i] > 0.9) jaw = Math.min(jaw, coat.pos[i * 3 + 1]);
    for (let i = 0; i < n; i++) {
      const y = coat.pos[i * 3 + 1];
      const z = coat.pos[i * 3 + 2];
      const g = smooth(hz - 0.05, hz + 0.01, z) * smooth(jaw - 0.01, jaw + 0.02, y) * (1 - part[i * 4 + 3]) * (1 - W.tail[i]);
      part[i * 4 + 2] = Math.max(part[i * 4 + 2], g);
    }
  }
  // Os : à quel membre, oreille, à la queue, à la tête (pour déplacer leurs articulations comme la peau).
  const boneW = names.map((nm_, i) => ({
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
  let tailTipZ = Infinity;
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
    if (W.tail[i] > 0.5) tailTipZ = Math.min(tailTipZ, z);
    if (part[i * 4 + 3] < 0.05 && W.tail[i] < 0.05 && W.head[i] < 0.05 && W.neck[i] < 0.5 && z > z0 && z < z1) {
      bellyY = Math.min(bellyY, y);
      topY = Math.max(topY, y);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }
  // (ventre : aussi le plus bas de la ligne médiane, quels que soient les poids — ceux du jack débordent des membres)
  {
    const mx = (minX + maxX) / 2;
    for (let i = 0; i < n; i++) {
      const z = coat.pos[i * 3 + 2];
      if (z <= z0 || z >= z1 || W.head[i] > 0.05 || W.tail[i] > 0.05) continue;
      if (Math.abs(coat.pos[i * 3] - mx) < 0.035) bellyY = Math.min(bellyY, coat.pos[i * 3 + 1]);
    }
  }
  const eyeL = heads[B('eyeL')];
  const eyeR = heads[B('eyeR')];
  const land = {
    hipZ, shZ, bellyY, topY, midX: (minX + maxX) / 2, halfW: (maxX - minX) / 2,
    head: heads[B('head')].clone(), noseZ, nose,
    eyeX: Math.abs(eyeL.x - eyeR.x) / 2, eyeY: (eyeL.y + eyeR.y) / 2, eyeZ: (eyeL.z + eyeR.z) / 2,
    elbowY: (heads[B('radiusL')].y + heads[B('radiusR')].y) / 2,
    tailTipZ, tailBaseZ: tailBones.length ? heads[tailBones[0]].z : hipZ,
    neckZ: (heads[B('neck1')].z + heads[B('head')].z) / 2,
  };
  // Bouts des oreilles (le plus loin de l'os de la tête : pointe d'une oreille dressée, bout du lambeau replié) et
  // bout de la queue.
  const earTip = [0, 1].map((s) => {
    const f = heads[B('head')];
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
  const tailTip = (() => {
    let best = tailBones.length ? heads[tailBones[tailBones.length - 1]].clone() : V(0, land.topY, hipZ - 0.1);
    let bd = -1;
    const t0 = tailBones.length ? heads[tailBones[0]] : best;
    for (let i = 0; i < n; i++) {
      if (W.tail[i] < 0.6) continue;
      const d = _v.fromArray(coat.pos, i * 3).distanceTo(t0);
      if (d > bd) {
        bd = d;
        best = _v.clone();
      }
    }
    return best;
  })();

  // Lambeau entier de l'oreille repliée du jack (rentré dans le crâne sous les oreilles dressées) : tout ce qui dépasse
  // du plan tangent au crâne à la racine de l'oreille, jusqu'à 1,4 fois sa longueur. (Les poids des oreilles du
  // squelette automatique n'en couvrent que le milieu : le bord et le pli restaient sur la tête, froissés.)
  // Chaque sommet du lambeau a une place cachée : sous la peau du crâne, dans sa direction depuis le centre de la tête
  // (3 mm sous le sommet du crâne le plus proche de cette direction). Le lambeau y est mis avant la déformation de la
  // race, qu'il suit alors comme le crâne. (Ramené sur un seul point, il tirait de longues lames et plissait la tête
  // là où il touche la joue.)
  const earFlap = kind !== 'jack' ? null : (() => {
    const hc = heads[B('head')].clone().lerp(V(land.midX, land.eyeY, land.eyeZ), 0.5);
    const out = [0, 1].map((s) => {
      const b1 = B(s === 0 ? 'ear1L' : 'ear1R');
      if (b1 < 0) return null;
      const root = heads[b1];
      const nrm = root.clone().sub(heads[B('head')]).normalize();
      const L = earTip[s].distanceTo(root);
      const ids = [];
      const cs = [];
      const tipP = earTip[s];
      for (let i = 0; i < n; i++) {
        _v.fromArray(coat.pos, i * 3);
        if (Math.sign(_v.x - land.midX) !== (s === 0 ? 1 : -1)) continue;
        // (le bout du lambeau, qui retombe contre la tempe, passe un peu sous le plan : pris aussi près du bout,
        // comme ce que le squelette automatique a pesé sur l'oreille)
        const nearTip = 1 - smooth(0.25 * L, 0.45 * L, _v.distanceTo(tipP));
        const d = _v.sub(root).dot(nrm);
        if (_v.length() > 1.4 * L) continue;
        const c = Math.max(smooth(0.002, 0.014, d), nearTip * smooth(-0.008, -0.003, d), W.ear[i * 2 + s] > 0.5 ? 1 : 0);
        if (c <= 0) continue;
        ids.push(i);
        cs.push(c);
      }
      return { ids: Uint32Array.from(ids), c: Float32Array.from(cs), hide: new Float32Array(ids.length * 3) };
    });
    const inFlap = new Uint8Array(n);
    for (const F of out) if (F) for (const i of F.ids) inFlap[i] = 1;
    // sommets du crâne (tête, ni oreilles ni lambeau) : direction et distance depuis le centre de la tête
    const skull = [];
    for (let i = 0; i < n; i++) {
      if (inFlap[i] || W.head[i] < 0.5 || W.ear[i * 2] + W.ear[i * 2 + 1] > 0.05) continue;
      _v.fromArray(coat.pos, i * 3).sub(hc);
      const r = _v.length();
      skull.push([_v.x / r, _v.y / r, _v.z / r, r]);
    }
    for (const F of out) {
      if (!F) continue;
      for (let k = 0; k < F.ids.length; k++) {
        _v.fromArray(coat.pos, F.ids[k] * 3).sub(hc);
        const r = _v.length();
        _v.multiplyScalar(1 / r);
        let best = r;
        let bc = 0.9;
        for (const q of skull) {
          const c = _v.x * q[0] + _v.y * q[1] + _v.z * q[2];
          if (c > bc) {
            bc = c;
            best = q[3];
          }
        }
        _w.copy(hc).addScaledVector(_v, Math.min(r, best) - 0.003);
        F.hide.set([_w.x, _w.y, _w.z], k * 3);
      }
    }
    return out;
  })();

  // Zone de la texture des oreilles d'origine (pelage des coques des oreilles dressées du jack).
  const earUv = [0, 1].map((s) => {
    const r = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) {
      if (W.ear[i * 2 + s] < 0.6) continue;
      const u = coat.uv[i * 2];
      const v = coat.uv[i * 2 + 1];
      r[0] = Math.min(r[0], u);
      r[1] = Math.min(r[1], v);
      r[2] = Math.max(r[2], u);
      r[3] = Math.max(r[3], v);
    }
    // (on ne garde que le milieu : les bords de la zone touchent d'autres morceaux de la texture)
    const cu = (r[0] + r[2]) / 2;
    const cv = (r[1] + r[3]) / 2;
    return Number.isFinite(cu) ? [cu - (r[2] - r[0]) * 0.18, cv - (r[3] - r[1]) * 0.18, cu + (r[2] - r[0]) * 0.18, cv + (r[3] - r[1]) * 0.18] : [0.5, 0.5, 0.5, 0.5];
  });

  // Normales de repos recalculées (soudées par position) : référence pour celles des races.
  coat.weld = weldGroups(coat.pos, n);
  coat.nrmCalc = weldedNormals(coat.pos, coat.index, coat.weld, n);

  // Clips : allures, poses, transitions ; pose de la queue enroulée du shiba ; os à translation animée.
  const clips = {};
  let tailPose = null;
  const transBones = new Set();
  for (const c of gltf.animations) {
    if (c.name === 'pose_tail') {
      tailPose = {};
      for (const t of c.tracks) {
        const [bn] = t.name.split('.');
        tailPose[bn] = new THREE.Quaternion().fromArray(t.values, 0);
      }
      continue;
    }
    for (const t of c.tracks) if (t.name.endsWith('.position')) transBones.add(t.name.split('.')[0]);
    clips[c.name] = c;
  }
  const ext = gltf.scene.userData?.dog ?? {};
  const base = {
    kind, names, index, parent, heads, rotW, restW, prims, W, part, boneW, land, earTip, earUv, earFlap, tailTip, tailBones, clips,
    tailPose, transBones: [...transBones].map((nm_) => index.get(nm_)).filter((i) => i !== undefined),
    natural: { ...NATURAL_SPEED, ...(ext.naturalSpeeds ?? {}) },
    cfg: MODEL[kind],
  };
  // Oreilles d'origine effacées du crâne : droites du shiba pour les races aux oreilles modelées, lambeau du jack
  // (places cachées sur une surface de crâne interpolée, dogParts.js : remplacent celles calculées plus haut).
  base.earHide = earSkullHide(base, earFlap);
  if (earFlap) base.earFlap = base.earHide;
  // Attributs communs à toutes les races (robe) : position de repos d'origine, appartenance, grain du poil.
  const low = furLow(coat.material.map?.image, coat.uv, coat.pos, coat.index, n);
  base.means = low.none ? null : { lo: low.lo, hi: low.hi };
  base.detail = MODEL[kind].detail ? furDetail(coat.material.map?.image) : null;
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
  base.landUniforms = makeLandUniforms(land);
  // Les textures du GLB sont partagées par tous les chiens : jamais libérées avec l'un d'eux.
  for (const p of Object.values(prims)) if (p.material.map) p.material.map.userData.shared = true;
  gltf.userData.dogBase = base;
  return base;
}

/** Sommets confondus (au dixième de millimètre) : un numéro de groupe par sommet. */
function weldGroups(pos, n) {
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

/**
 * Queue plus courte ou plus longue (B.tailLen), plus fine ou plus épaisse (B.tailThick), pour deformDog : autour de
 * la chaîne de ses os. Chaque sommet est projeté sur les segments des os de la queue qui le portent (moyenne pondérée
 * par la peau : pas de saut d'un os à l'autre) ; la ligne médiane est mise à l'échelle depuis la base (longueur, la
 * courbe garde sa forme), l'écart à la ligne médiane par une matrice de section propre à chaque os, interpolée le long
 * de la queue (épaisseur ; amincie, la section aplatie du panache est ramenée vers un cercle de même aire). Les deux
 * s'installent sur le premier tiers (la base reste soudée à la croupe). Modifie P (pelage) et H (articulations) ;
 * renvoie la distance de chaque sommet de la queue à sa ligne médiane (0 hors de la queue).
 */
function tailShape(base, B, P, H, n, wTail) {
  const rad = new Float32Array(n);
  const frac = new Float32Array(n);
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
    e.divideScalar(len);
    const u = Math.abs(e.y) < 0.9 ? V(0, 1, 0).cross(e).normalize() : V(1, 0, 0).cross(e).normalize();
    seg.push({ e, u, v: e.clone().cross(u), len, s0: tot });
    tot += len;
  }
  const slot = new Map(tb.map((b, k) => [b, k]));
  const wk = new Float32Array(m);
  const tk = new Float32Array(m);
  const x = V();
  const q = V();
  const o = V();
  // Projection du sommet i : q (ligne médiane), o (écart), wk/tk (part et position sur chaque os) ; renvoie
  // l'abscisse curviligne depuis la base (-1 : pas porté par la queue).
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
      tk[k] = t;
      q.addScaledVector(_u.copy(C[k]).addScaledVector(S.e, t * S.len), wk[k]);
      s += wk[k] * (S.s0 + t * S.len);
    }
    o.copy(x).sub(q);
    return s;
  };
  // Section de chaque os : axes principaux de l'écart (dans le plan perpendiculaire à l'os).
  const cov = Array.from({ length: m }, () => [0, 0, 0, 0]);
  for (let i = 0; i < n; i++) {
    if (wTail(i) < 0.9 || project(i) < 0) continue;
    for (let k = 0; k < m; k++) {
      if (wk[k] < 0.6) continue;
      const a = o.dot(seg[k].u);
      const b = o.dot(seg[k].v);
      const c = cov[k];
      c[0] += a * a;
      c[1] += a * b;
      c[2] += b * b;
      c[3]++;
    }
  }
  const th = B.tailThick;
  const ro = clamp((1 - th) / 0.4, 0, 1); // (arrondi : complet à tailThick 0,6 et moins)
  const Sk = seg.map((S, k) => {
    const [a0, b0, c0, cnt] = cov[k];
    const M = new THREE.Matrix3();
    const E = S.e;
    let fM = th;
    let fN = th;
    let Ma = S.u;
    if (cnt >= 8) {
      const a = a0 / cnt;
      const b = b0 / cnt;
      const c = c0 / cnt;
      const ang = 0.5 * Math.atan2(2 * b, a - c);
      const r = Math.sqrt(((a - c) / 2) ** 2 + b * b);
      const l1 = (a + c) / 2 + r;
      const l2 = Math.max(1e-12, (a + c) / 2 - r);
      Ma = S.u.clone().multiplyScalar(Math.cos(ang)).addScaledVector(S.v, Math.sin(ang));
      const ratio = clamp(Math.sqrt(l2 / Math.max(l1, 1e-12)), 0.15, 1);
      fM = th * ratio ** (0.5 * ro);
      fN = th * ratio ** (-0.5 * ro);
    }
    const Na = E.clone().cross(Ma);
    // S = e eᵀ + fM M Mᵀ + fN N Nᵀ (le long de l'os : inchangé)
    const el = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const er = E.getComponent(r);
        const mr = Ma.getComponent(r);
        const nr = Na.getComponent(r);
        el.push(er * E.getComponent(c) + fM * mr * Ma.getComponent(c) + fN * nr * Na.getComponent(c));
      }
    }
    M.set(...el);
    return M.elements;
  });
  // Aux articulations : moyenne des deux os voisins.
  const J = [];
  for (let k = 0; k <= m; k++) {
    const A = Sk[Math.max(0, k - 1)];
    const Bm = Sk[Math.min(m - 1, k)];
    J.push(A.map((v, i) => (v + Bm[i]) / 2));
  }
  const Sm = new Float32Array(9);
  const o2 = V();
  for (let i = 0; i < n; i++) {
    const w = wTail(i);
    if (!(w > 0)) continue;
    const s = project(i);
    if (s < 0) continue;
    const on = smooth(0, 0.3 * tot, s);
    const kl = 1 + (B.tailLen - 1) * on;
    Sm.fill(0);
    for (let k = 0; k < m; k++) {
      if (!wk[k]) continue;
      for (let e = 0; e < 9; e++) Sm[e] += wk[k] * (J[k][e] + (J[k + 1][e] - J[k][e]) * tk[k]);
    }
    // (Matrix3.elements : colonnes)
    o2.set(
      Sm[0] * o.x + Sm[3] * o.y + Sm[6] * o.z,
      Sm[1] * o.x + Sm[4] * o.y + Sm[7] * o.z,
      Sm[2] * o.x + Sm[5] * o.y + Sm[8] * o.z,
    );
    o2.lerpVectors(o, o2, on);
    // (effilée : le rayon décroît jusqu'à la pointe — un panache ou une queue de loutre, pas une massue)
    if (B.tailTaper > 0) o2.multiplyScalar(1 - B.tailTaper * Math.pow(clamp(s / tot, 0, 1), 1.15));
    rad[i] = o2.length();
    frac[i] = clamp(s / tot, 0, 1);
    _w.copy(q).sub(C0).multiplyScalar(kl).add(C0).add(o2);
    x.lerp(_w, w);
    P.set([x.x, x.y, x.z], i * 3);
  }
  for (let k = 1; k < m; k++) {
    const on = smooth(0, 0.3 * tot, seg[k].s0);
    const kl = 1 + (B.tailLen - 1) * on;
    H[tb[k]].copy(C[k]).sub(C0).multiplyScalar(kl).add(C0);
  }
  rad.frac = frac;
  return rad;
}

/** Normales lissées (somme des normales des faces, par groupe de sommets confondus : pas d'arête aux coutures). */
function weldedNormals(pos, index, grp, n) {
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

// ------------------------------------------------------------------ géométrie d'une race (par ses os)

const shapes = new Map();
const SPARE_SHAPES = 6;

function releaseShape(S) {
  S.users = Math.max(0, S.users - 1);
  if (S.users > 0) return;
  S.idleAt = performance.now?.() ?? Date.now();
  const idle = [...shapes.values()].filter((x) => x.users === 0).sort((a, b) => a.idleAt - b.idleAt);
  for (const x of idle.slice(0, Math.max(0, idle.length - SPARE_SHAPES))) {
    shapes.delete(x.key);
    for (const g of [x.coatGeo, x.eyeGeo, x.earGeo, x.lodCoat, x.lodEye]) g?.dispose();
  }
}

/**
 * Déformation d'une race : les os sont déplacés (membres raccourcis le long de leur axe, dos allongé, tronc élargi,
 * encolure allongée, tête grossie, museau raccourci, oreilles tournées et pliées, queue raccourcie) et la peau suit
 * avec les poids du squelette ; le poil long pousse la surface le long de sa normale. Les mêmes passes sont faites
 * sur les sommets et sur les articulations (têtes des os). Pures fonctions des données de repos et du gabarit B :
 * utilisées aussi par les tests (node).
 */
export function deformDog(base, B) {
  const coat = base.prims.coat;
  const n = coat.count;
  const P = coat.pos.slice();
  const N = coat.nrm.slice();
  const H = base.heads.map((h) => h.clone());
  const nbn = H.length;
  const W = base.W;
  const bw = base.boneW;
  const L = base.land;
  const idx = base.index;
  const I = (nm) => idx.get(nm) ?? -1;
  const eye = base.prims.eye;
  const EP = eye ? eye.pos.slice() : null;
  const EN = eye ? eye.nrm.slice() : null;
  // Points traités : sommets du pelage (0..n-1), articulations (n..n+nbn-1), sommets des yeux.
  const get = (j, out) => (j < n ? out.fromArray(P, j * 3) : j < n + nbn ? out.copy(H[j - n]) : out.fromArray(EP, (j - n - nbn) * 3));
  const set = (j, v) => {
    if (j < n) P.set([v.x, v.y, v.z], j * 3);
    else if (j < n + nbn) H[j - n].copy(v);
    else EP.set([v.x, v.y, v.z], (j - n - nbn) * 3);
  };
  const ne = eye ? eye.count : 0;
  const total = n + nbn + ne;
  const headI = I('head');
  // Poids d'un point : sommet (poids de la peau), articulation (son os), œil du jack (tête).
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

  // 0. Oreilles dressées du jack : le lambeau replié d'origine (remplacé par des coques) est d'abord caché sous la
  //    peau du crâne ; il suit ensuite toute la déformation comme le crâne. (Réduit au quart et à peine rentré, il
  //    restait visible, froissé, devant ou sous la coque.)
  // (le poil long ne les ressort pas : voir 9)
  const hidden = new Float32Array(n);
  // (oreilles modelées — pendantes, en rose — : l'oreille d'origine des deux modèles est cachée de même, voir dogParts.js)
  const hideSet = base.earFlap && (B.ears === 'pointed' || B.ears === 'bat' || pendantEars(B)) ? base.earFlap : base.earHide && pendantEars(B) ? base.earHide : null;
  if (hideSet) {
    for (const F of hideSet) {
      if (!F) continue;
      for (let k = 0; k < F.ids.length; k++) {
        const i = F.ids[k];
        p.fromArray(P, i * 3).lerp(_w.fromArray(F.hide, k * 3), F.c[k]);
        P.set([p.x, p.y, p.z], i * 3);
        hidden[i] = F.e ? F.e[k] : F.c[k];
      }
    }
  }

  // 0b. Gueule du jack fermée au repos (dogParts.js).
  jackMouthClose(base, P);
  // 1. Membres : raccourcis ou allongés entre l'épaule (la hanche) et le poignet (le jarret), le pied suit sans se
  //    déformer ; épaissis autour de leur axe.
  for (let l = 0; l < 4; l++) {
    const T = H[legTop[l]].clone();
    const Wr = H[legEnd[l]].clone();
    const a = Wr.clone().sub(T);
    const len = a.length();
    a.normalize();
    // (dos qui descend du garrot à la croupe — berger allemand — : postérieurs un peu plus courts, le chien est
    // reposé au sol plus bas derrière, voir 8)
    const k = B.legs * (LEG_KEYS[l][2] ? 1 + 0.02 * B.slope : 1 - 0.075 * B.slope);
    for (let j = 0; j < total; j++) {
      const w = wLeg(j, l);
      if (!(w > 0)) continue;
      get(j, p);
      d.copy(p).sub(T);
      const al = d.dot(a);
      const perp = _u.copy(d).addScaledVector(a, -al);
      const a2 = al <= 0 ? al : al < len ? al * k : len * k + (al - len);
      // (pieds plus gros : chiots)
      p.addScaledVector(a, w * (a2 - al)).addScaledVector(perp, w * ((B.legW - 1) * smooth(0, 0.05, al) + (B.paws - 1) * smooth(len * 0.85, len * 1.05, al)));
      set(j, p);
    }
  }
  // 2. Tronc : dos plus long (chaque membre suit son épaule ou sa hanche), tronc plus large, ventre relevé (lévriers).
  const za = L.hipZ + 0.02;
  const zb = L.shZ - 0.02;
  const zm = (za + zb) / 2;
  const zoff = (z) => (B.back - 1) * (clamp(z, za, zb) - zm);
  const trunkZ = (z) => smooth(L.hipZ - 0.1, L.hipZ + 0.02, z) * (1 - smooth(L.shZ - 0.02, L.shZ + 0.12, z));
  // (tronc en poire — bouledogue — : poitrine et avant-main larges, croupe plus légère)
  const girthAt = (z) => B.girth * (1 + B.pear * (0.38 * clamp((z - L.hipZ) / Math.max(0.05, L.shZ - L.hipZ), 0, 1) - 0.16));
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
      dx += w * (girthAt(T0[l].z) - 1) * (T0[l].x - L.midX) * trunkZ(T0[l].z);
    }
    lw = Math.min(1, lw);
    const h = (p.y - L.bellyY) / Math.max(0.05, L.topY - L.bellyY);
    const body = (1 - lw) * (1 - wHead(j)) * (1 - wTail(j));
    const tz = trunkZ(p.z);
    p.x = p.x + dx + body * (p.x - L.midX) * (girthAt(p.z) - 1) * tz * (1 - 0.4 * wNeck(j));
    p.z += dz + (1 - lw) * zoff(p.z);
    if (B.tuck) {
      const u = (p.z - L.hipZ) / Math.max(0.05, L.shZ - L.hipZ);
      p.y += body * B.tuck * 0.05 * (1 - smooth(0.0, 0.45, h)) * smooth(-0.1, 0.25, u) * (1 - smooth(0.45, 0.8, u));
    }
    // (poitrine profonde, descendue jusqu'au coude : lévriers)
    if (B.chest) {
      const u = (p.z - L.hipZ) / Math.max(0.05, L.shZ - L.hipZ);
      p.y -= body * B.chest * 0.035 * (1 - smooth(0.0, 0.5, h)) * smooth(0.5, 0.8, u) * (1 - smooth(1.05, 1.3, u));
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
  // 4. Tête plus grosse ou plus petite (oreilles, mâchoire, yeux compris), autour de l'os de la tête.
  //    Crâne plus étroit (headW) : le shiba a la tête large d'un spitz, les chiens de chasse et les lévriers l'ont
  //    fine ; moins vers le bout du museau (réglé à part : muzzleW).
  if (B.head !== 1 || B.headW !== 1) {
    const HJ = H[headI].clone();
    const noseLen = Math.max(0.05, (L.noseZ - base.heads[headI].z) * B.head);
    for (let j = 0; j < total; j++) {
      const wh = wHead(j);
      if (!(wh > 0)) continue;
      get(j, p);
      p.sub(HJ).multiplyScalar(1 + wh * (B.head - 1));
      const fz = 1 - 0.6 * smooth(0.45, 0.9, p.z / noseLen);
      p.x *= 1 + wh * fz * (B.headW - 1);
      p.add(HJ);
      set(j, p);
    }
    // Yeux du jack (maillage à part) : moins grossis que la tête et un peu rentrés dans l'orbite (sinon des yeux
    // globuleux de dessin animé sur le chihuahua ou le chiot).
    if (EP && B.head > 1.02) {
      const k = (1 + (B.head - 1) * 0.5) / B.head;
      for (const side of [1, -1]) {
        const c = V();
        let cnt = 0;
        for (let i = 0; i < ne; i++) {
          if (Math.sign(EP[i * 3] - L.midX) !== side) continue;
          c.x += EP[i * 3];
          c.y += EP[i * 3 + 1];
          c.z += EP[i * 3 + 2];
          cnt++;
        }
        if (!cnt) continue;
        c.multiplyScalar(1 / cnt);
        // (rentré vers le centre de la tête de ce que l'œil a perdu)
        const inward = HJ.clone().sub(c).multiplyScalar((1 - k) * 0.35);
        for (let i = 0; i < ne; i++) {
          if (Math.sign(EP[i * 3] - L.midX) !== side) continue;
          p.fromArray(EP, i * 3).sub(c).multiplyScalar(k).add(c).add(inward);
          EP.set([p.x, p.y, p.z], i * 3);
        }
      }
    }
  }
  // 5. Museau plus court ou plus long, plus large ou plus fin, devant les yeux.
  if (B.snout !== 1 || B.muzzleW !== 1) {
    const HJ = H[headI].clone();
    const E = H[I('eyeL')].clone().add(H[I('eyeR')]).multiplyScalar(0.5);
    // bout du nez de la race (après la taille de la tête)
    const nose0 = L.nose.clone().sub(base.heads[headI]).multiplyScalar(B.head).add(HJ);
    const f = nose0.clone().sub(E);
    f.x = 0;
    const flen = f.length();
    f.normalize();
    const side = V(1, 0, 0);
    for (let j = 0; j < total; j++) {
      const w = wNose(j);
      if (!(w > 0)) continue;
      get(j, p);
      d.copy(p).sub(E);
      const t = d.dot(f);
      if (t <= 0) continue;
      const on = smooth(0, 0.25 * flen, t);
      const lat = d.dot(side);
      p.addScaledVector(f, w * t * (B.snout - 1) * on).addScaledVector(side, w * lat * (B.muzzleW - 1) * on);
      set(j, p);
    }
  }
  // 5b. Visage (modèle du shiba) : joues, bouche neutre, babines, crâne, stop, museau carré, paupières (dogParts.js).
  faceShape(base, B, P);
  // 6. Oreilles : taille, puis port (dressées, pliées, tombantes) par rotation autour de la base et du pli.
  const earOps = pendantEars(B) ? [null, null] : earPlan(base, B, H);
  for (let s = 0; s < 2; s++) {
    const op = earOps[s];
    if (!op) continue;
    if (op.collapse !== undefined && base.earFlap?.[s]) {
      // (lambeau déjà caché sous la peau du crâne, voir plus haut) ; os des oreilles ramenés sur leur base
      for (let j = n; j < n + nbn; j++) if (wEar(j, s) > 0) set(j, get(j, p).lerp(op.base, 0.9));
      continue;
    }
    for (let j = 0; j < total; j++) {
      const we = wEar(j, s);
      if (!(we > 0)) continue;
      get(j, p);
      if (op.size !== 1) p.sub(op.base).multiplyScalar(1 + we * (op.size - 1)).add(op.base);
      const w2 = wEar2(j, s);
      if (op.fold && w2 > 0) rot(p, _q.identity().slerp(op.fold, w2), op.hinge);
      if (op.flat !== 1 && op.normal) {
        const t = _u.copy(p).sub(op.base).dot(op.normal);
        p.addScaledVector(op.normal, t * (op.flat - 1) * we);
      }
      if (op.turn) rot(p, _q.identity().slerp(op.turn, we), op.base);
      if (op.shift) p.addScaledVector(op.shift, we);
      set(j, p);
      if (j < n && (op.turn || op.fold)) {
        _w.fromArray(N, j * 3);
        if (op.fold && w2 > 0) _w.applyQuaternion(_q.identity().slerp(op.fold, w2));
        if (op.turn) _w.applyQuaternion(_q.identity().slerp(op.turn, we));
        N.set([_w.x, _w.y, _w.z], j * 3);
      }
    }
  }
  // 7. Queue : plus courte (écourtée) ou plus longue, plus fine ou plus épaisse. Autour de sa ligne médiane (la
  //    chaîne de ses os, projection lissée par les poids de la peau) et pas d'une droite : le panache du shiba est
  //    courbe, et l'aminci autour de sa corde devenait une lame plate et vrillée. Amincie (tailThick < 1), sa
  //    section aplatie de panache s'arrondit (vers un cercle de même aire).
  // (rayon de chaque sommet de la queue autour de sa ligne médiane : le poil ras ne la rase pas au-delà, voir 9)
  const tailR = base.tailBones.length ? tailShape(base, B, P, H, n, wTail) : null;
  // 8. Pieds au sol : le chien descend (ou monte) de ce que ses membres ont perdu (avant et arrière séparément).
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
  // 9. Poil long : la surface est poussée le long de sa normale (plus sur le cou et le poitrail : collerette ; à
  //    l'arrière des membres, sous le ventre, sur la queue et les oreilles : franges ; frisé : en touffes).
  if (B.fur < -0.0005) {
    // Poil ras : le double poil du shiba est raccourci (surtout la collerette du cou et du poitrail, les joues et
    // la queue en brosse ; peu sur les membres, jamais sur les pieds ni le museau).
    const nr = weldedNormals(P, coat.index, coat.weld, n);
    for (let i = 0; i < n; i++) {
      p.fromArray(P, i * 3);
      _w.fromArray(nr, i * 3);
      const legSum = Math.min(1, W.leg[i * 4] + W.leg[i * 4 + 1] + W.leg[i * 4 + 2] + W.leg[i * 4 + 3]);
      const ear = Math.min(1, W.ear[i * 2] + W.ear[i * 2 + 1]);
      const head = W.head[i] * (1 - ear);
      const tail = W.tail[i];
      const neck = W.neck[i] * (1 - W.head[i]);
      const r0 = coat.pos;
      const x0 = r0[i * 3] - L.midX;
      const y0 = r0[i * 3 + 1];
      const z0 = r0[i * 3 + 2];
      const h = (y0 - L.bellyY) / Math.max(0.05, L.topY - L.bellyY);
      const front = smooth(L.shZ - 0.08, L.shZ + 0.04, z0);
      let k = (1 - legSum) * (1 - head) * (1 - tail) * (1 - ear) * (0.75 + 0.6 * front * (1 - smooth(0.25, 0.85, h)));
      k += neck * 1.1;
      k += head * 0.8 * (1 - smooth(L.eyeY - 0.06, L.eyeY - 0.01, y0)) * smooth(L.eyeX * 0.8, L.eyeX * 1.6, Math.abs(x0))
        * (1 - smooth(0.45, 0.65, (z0 - L.head.z) / Math.max(0.05, L.noseZ - L.head.z)));
      k += legSum * 0.3 * smooth(L.elbowY * 0.6, L.elbowY * 1.3, y0);
      // (queue : au plus 30 % de son rayon — amincie, la brosse du shiba rasée de 2 cm passait à travers elle-même
      // et devenait une lame plate)
      const tr = tailR?.[i] || 0.05;
      p.addScaledVector(_w, (B.fur * k - Math.min(-B.fur * 1.4, 0.3 * tr) * tail) * (1 - hidden[i]));
      P.set([p.x, p.y, p.z], i * 3);
    }
  } else if (B.fur > 0.0005) {
    const nr = weldedNormals(P, coat.index, coat.weld, n);
    for (let i = 0; i < n; i++) {
      p.fromArray(P, i * 3);
      _w.fromArray(nr, i * 3);
      const legSum = Math.min(1, W.leg[i * 4] + W.leg[i * 4 + 1] + W.leg[i * 4 + 2] + W.leg[i * 4 + 3]);
      const ear = Math.min(1, W.ear[i * 2] + W.ear[i * 2 + 1]);
      const head = W.head[i] * (1 - ear);
      const tail = W.tail[i];
      const neck = W.neck[i] * (1 - W.head[i]);
      const r0 = base.prims.coat.pos;
      const y0 = r0[i * 3 + 1];
      const z0 = r0[i * 3 + 2];
      const h = (y0 - L.bellyY) / Math.max(0.05, L.topY - L.bellyY);
      const front = smooth(L.shZ - 0.06, L.shZ + 0.06, z0);
      let k = (1 - legSum) * (1 - head) * (1 - tail) * (1 - ear) * (0.7 + 0.4 * front * (1 - smooth(0.2, 0.8, h)) * B.ruff);
      k += neck * (0.3 + 0.5 * B.ruff - 0.6 * (1 - B.ruff));
      k += head * 0.12 * smooth(L.eyeY - 0.02, L.eyeY + 0.06, y0) * (1 - smooth(0.3, 0.6, (z0 - L.head.z) / Math.max(0.05, L.noseZ - L.head.z)));
      // barbe et sourcils touffus (labradoodle : bouille de nounours) : bas du museau, menton, au-dessus des yeux
      if (B.beard) {
        const hz = (z0 - L.head.z) / Math.max(0.05, L.noseZ - L.head.z);
        const ax = Math.abs(r0[i * 3] - L.midX);
        const muzzle = smooth(0.5, 0.7, hz) * (1 - smooth(L.eyeY - 0.03, L.eyeY - 0.005, y0)) * (1 - smooth(0.93, 1.0, hz));
        const brow = (1 - smooth(0.012, 0.03, Math.abs(y0 - L.eyeY - 0.022))) * smooth(0.25, 0.4, hz) * (1 - smooth(0.5, 0.6, hz)) * smooth(0.01, 0.025, ax);
        k += head * (1 - ear) * B.beard * (0.9 * muzzle + 0.7 * brow);
      }
      const paw = 1 - smooth(0.04, L.elbowY * 0.55, y0);
      k += legSum * (1 - paw) * (0.3 + B.feather * 0.8 * smooth(-0.1, -0.7, _w.z) * smooth(L.elbowY * 0.3, L.elbowY, y0));
      k += (1 - legSum) * (1 - head) * (1 - tail) * B.feather * 0.7 * smooth(-0.3, -0.9, _w.y);
      k += ear * (0.1 + 0.4 * B.feather);
      // (racine de la queue épaissie aussi : le panache du saint-bernard faisait un bulbe sur une tige fine ; poil
      // effilé vers la pointe — sinon une boule au bout des queues courtes, une massue au bout des longues — et
      // frange qui pend sous la queue des races frangées : le drapeau du setter, le panache du golden)
      const tf = tailR?.frac?.[i] ?? 0;
      const under = base.kind === 'shiba' ? smooth(-0.15, -0.75, _w.y) : smooth(-0.15, -0.75, _w.z);
      k += Math.sqrt(tail) * B.tailFur * ((0.9 + 0.2 * B.feather) * (1 - B.tailTaper * 0.85 * tf ** 1.3) + B.feather * 2.4 * under * smooth(0.04, 0.3, tf) * (1 - tf) ** 1.2 * Math.min(1, 0.012 / B.fur));
      const nz = B.curly ? 0.65 + 0.7 * fbm(p.x * 38, p.y * 38, p.z * 38) : 0.75 + 0.5 * fbm(p.x * 30, p.y * 30, p.z * 30);
      // Sans collerette (setter, caniche, golden) : celle du shiba et ses joues de spitz d'abord raccourcies (sinon
      // une crinière de lion autour de la tête).
      let shave = 0;
      if (base.kind === 'shiba' && B.ruff < 0.5) {
        const x0 = r0[i * 3] - L.midX;
        shave = (1 - 2 * B.ruff) * 0.015 * (neck * 1.1 + head * 0.8 * (1 - smooth(L.eyeY - 0.06, L.eyeY - 0.01, y0))
          * smooth(L.eyeX * 0.8, L.eyeX * 1.6, Math.abs(x0)) * (1 - smooth(0.45, 0.65, (z0 - L.head.z) / Math.max(0.05, L.noseZ - L.head.z))));
      }
      p.addScaledVector(_w, (B.fur * k * nz - shave) * (1 - hidden[i]));
      // Poil soyeux (yorkshire) : la robe tombe, les flancs descendent en jupe sur le haut des membres (jamais les
      // pieds, posés au sol avant).
      if (B.silky) p.y -= B.silky * B.fur * 1.4 * (1 - smooth(0.1, 0.75, h)) * (1 - head) * (1 - tail) * (1 - ear) * (1 - 0.6 * legSum) * (1 - paw) * (1 - hidden[i]);
      // Franges (golden, setter, épagneuls, bernois) : le poil long pend — sous le ventre, à l'arrière des membres
      // (culotte des cuisses, franges des avant-bras), au poitrail. Poussé vers le bas et l'arrière plutôt que le long de
      // la normale : la silhouette se frange au lieu de gonfler (le gonflement seul ne se voyait pas).
      // (pas pour le poil soyeux du yorkshire, qui a sa jupe ; borné : assis ou couché, la frange entrait dans le sol)
      if (B.feather >= 0.6 && !B.silky) {
        const fe = Math.min(0.008, (B.feather - 0.5) * 2 * B.fur) * (1 - hidden[i]);
        const u = (z0 - L.hipZ) / Math.max(0.05, L.shZ - L.hipZ);
        const trunk = (1 - legSum) * (1 - head) * (1 - tail) * (1 - ear);
        // (mèches : bord bas déchiqueté le long du corps, pas un ventre qui pend)
        const strand = 0.45 + 1.1 * fbm(z0 * 95 + 3.1, (r0[i * 3] - L.midX) * 40, 1.7);
        const belly = trunk * smooth(-0.6, -0.95, _w.y) * smooth(-0.05, 0.25, u) * (1 - smooth(0.8, 1.05, u)) * strand;
        const backLeg = legSum * (1 - paw) * smooth(-0.2, -0.75, _w.z) * smooth(L.elbowY * 0.35, L.elbowY * 0.75, y0) * (1 - smooth(L.elbowY * 0.95, L.elbowY * 1.25, y0));
        const chest = trunk * smooth(0.3, 0.8, _w.z) * smooth(0.85, 1.0, u) * (1 - smooth(0.25, 0.6, h));
        // (culotte des cuisses vers l'arrière seulement : assis, poussée vers le bas, elle entrait dans le sol)
        p.y -= fe * (2.0 * belly + 1.1 * chest);
        p.z -= fe * 1.6 * backLeg;
        p.z += fe * 0.9 * chest;
      }
      P.set([p.x, p.y, p.z], i * 3);
    }
  }
  // Normales : celles du modèle, tournées comme la surface (différence des normales recalculées avant et après).
  const nDef = weldedNormals(P, coat.index, coat.weld, n);
  for (let i = 0; i < n; i++) {
    _w.fromArray(N, i * 3).add(_v.fromArray(nDef, i * 3)).sub(_u.fromArray(coat.nrmCalc, i * 3)).normalize();
    N.set([_w.x, _w.y, _w.z], i * 3);
  }
  return { pos: P, nrm: N, heads: H, eyePos: EP, eyeNrm: EN, hidden };
}

/** Bruit lisse simple (déterministe) pour les touffes de poil. */
function fbm(x, y, z) {
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

/**
 * Port des oreilles d'une race, pour chaque côté : { base (centre de rotation), size, turn (rotation de toute
 * l'oreille autour de la base), fold + hinge (rotation de la partie au-delà du pli), flat (épaisseur), normal }.
 * Chiffres réglés à l'œil sur les deux modèles (oreilles droites du shiba, repliées en bouton du jack).
 */
function earPlan(base, B, H) {
  const I = (nm) => base.index.get(nm) ?? -1;
  const out = [null, null];
  const kind = base.kind;
  const want = B.ears;
  for (let s = 0; s < 2; s++) {
    const side = s === 0 ? 1 : -1;
    const b1 = I(s === 0 ? 'ear1L' : 'ear1R');
    const b2 = I(s === 0 ? 'ear2L' : 'ear2R');
    if (b1 < 0) continue;
    const baseP = H[b1].clone();
    const fold = b2 >= 0 ? H[b2].clone() : baseP.clone();
    // bout de l'oreille, emmené comme la tête
    const tip = base.earTip[s].clone().sub(base.heads[b1]).multiplyScalar(B.head).add(baseP);
    const op = { base: baseP, size: B.earSize, turn: null, fold: null, hinge: fold, flat: 1, normal: null };
    const dir = tip.clone().sub(baseP).normalize();
    const qTo = (v) => new THREE.Quaternion().setFromUnitVectors(dir, v.clone().normalize());
    const axisRot = (axis, ang) => new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), ang);
    // (normale de l'oreille ≈ vers l'avant pour une oreille dressée)
    op.normal = V(0, 0, 1).addScaledVector(dir, -dir.z).normalize();
    if (kind === 'shiba') {
      if (want === 'floppy' || want === 'long') {
        // (pendante le long de la joue, pas écartée : sinon la tête paraît ronde comme celle d'un chow-chow)
        op.turn = qTo(V(side * 0.24, -1, 0.18));
        op.flat = 0.45;
        // (attachée plus bas et plus en arrière que l'oreille dressée du shiba : au niveau de l'œil)
        op.shift = V(-side * 0.008, -0.022, -0.012).multiplyScalar(B.head);
        if (want === 'long') op.size *= 1.25;
      } else if (want === 'semi') {
        op.fold = axisRot(V(1, 0, 0), 1.6);
      } else if (want === 'rose' || want === 'button') {
        op.turn = qTo(V(side * 0.9, 0.25, -0.6));
        op.fold = axisRot(V(1, 0, 0), want === 'rose' ? -1.2 : 1.4);
        op.flat = 0.7;
      } else if (want === 'bat') {
        op.turn = qTo(V(side * 0.75, 1, 0.1));
      }
      // (petites oreilles inclinées vers l'avant, dans le prolongement de la nuque : akita)
      if (B.earTilt && want === 'pointed') op.turn = axisRot(V(1, 0, 0), B.earTilt);
    } else {
      // jack : oreille en bouton (base dressée, lambeau replié vers l'avant et le bas)
      const dir1 = fold.clone().sub(baseP).normalize();
      const flap = tip.clone().sub(fold).normalize();
      const unfold = new THREE.Quaternion().setFromUnitVectors(flap, dir1);
      if (want === 'pointed' || want === 'bat') {
        // (le lambeau replié ne se déplie pas proprement : il est rentré dans le crâne, des coques le remplacent)
        op.collapse = 0;
        op.size = 1;
      } else if (want === 'semi') {
        op.fold = new THREE.Quaternion().identity().slerp(unfold, 0.45);
      } else if (want === 'floppy' || want === 'long') {
        op.turn = qTo(V(side * 0.35, -1, 0.15));
        op.fold = new THREE.Quaternion().identity().slerp(unfold, 0.7);
      } else if (want === 'rose') {
        op.turn = axisRot(V(1, 0, 0), -0.9);
      }
    }
    out[s] = op;
  }
  return out;
}

/**
 * Oreilles dressées du jack (son oreille d'origine est repliée en bouton : elle est rentrée dans le crâne, voir
 * earPlan) : deux coques minces, pointues ('pointed' : spitz, yorkshire, corgi) ou larges et arrondies ('bat' :
 * chihuahua, bouledogue), creusées vers l'avant, plantées à la base de l'oreille d'origine et liées à son os (elles
 * bougent avec lui). Attributs de la robe comme le pelage (pour le shader : oreille et tête). Null sinon.
 */
function erectEars(base, D, B) {
  if (base.kind !== 'jack' || (B.ears !== 'pointed' && B.ears !== 'bat')) return null;
  const I = (nm) => base.index.get(nm) ?? -1;
  const bat = B.ears === 'bat';
  const NH = 8;
  const NW = 7;
  const pos = [];
  const nrm = [];
  const uv = [];
  const rest = [];
  const part = [];
  const si = [];
  const sw = [];
  const idx = [];
  const Hh = 0.075 * B.head * B.earSize;
  // (pointues : un peu plus larges, et d'autant plus que l'oreille est grande — corgi ; fines, elles faisaient des
  // cornes)
  const Wb = Hh * (bat ? 0.86 : 0.7 + 0.2 * clamp((B.earSize - 1) / 0.4, 0, 1));
  const thick = Math.max(0.004, Hh * 0.05);
  // (plantées au-dessus du poil long : sous la fourrure du spitz ou du yorkshire, on ne voyait que leur pointe)
  const lift = Math.max(0, B.fur) * 0.7;
  for (let s = 0; s < 2; s++) {
    const side = s === 0 ? 1 : -1;
    const b1 = I(s === 0 ? 'ear1L' : 'ear1R');
    if (b1 < 0) continue;
    const up = V(side * (bat ? 0.75 : 0.32), 1, bat ? 0.02 : -0.06).normalize();
    const Bp = D.heads[b1].clone().addScaledVector(up, lift);
    const Bn = base.heads[b1].clone().addScaledVector(up, lift);
    const lat = V(0, 0, 1).cross(up).normalize().multiplyScalar(side); // vers l'extérieur
    if (lat.x * side < 0) lat.negate();
    const fwd = lat.clone().cross(up).normalize();
    if (fwd.z < 0) fwd.negate();
    const [u0, v0, u1, v1] = base.earUv[s];
    const start = pos.length / 3;
    const width = (h) => (bat ? Math.sqrt(Math.max(0, 1 - h ** 2.4)) * (1 - 0.18 * h) : (1 - h) ** 0.9) * Wb * 0.5;
    for (let layer = 0; layer < 2; layer++) {
      for (let r = 0; r <= NH; r++) {
        const h = -0.12 + (1.12 * r) / NH;
        const hh = Math.max(0, h);
        for (let c = 0; c <= NW; c++) {
          const x = -1 + (2 * c) / NW;
          const w = width(hh);
          const cup = Wb * 0.22 * (1 - x * x) * (1 - hh) * (bat ? 1 : 0.8);
          const off = (q) => q.clone().addScaledVector(up, h * Hh).addScaledVector(lat, x * w).addScaledVector(fwd, -cup - layer * thick);
          const P = off(Bp);
          const R = off(Bn);
          pos.push(P.x, P.y, P.z);
          rest.push(R.x, R.y, R.z);
          const nn = layer ? fwd.clone().negate() : fwd;
          nrm.push(nn.x, nn.y, nn.z);
          uv.push(u0 + (u1 - u0) * (c / NW), v0 + (v1 - v0) * (r / NH));
          part.push(1, 0, 1, 0);
          si.push(b1, 0, 0, 0);
          sw.push(1, 0, 0, 0);
        }
      }
    }
    const row = NW + 1;
    const lay = row * (NH + 1);
    // (sens des triangles : face avant tournée vers l'avant, quel que soit le côté)
    const flip = lat.clone().cross(up).dot(fwd) < 0;
    const tri = (a, b, c) => (flip ? idx.push(a, c, b) : idx.push(a, b, c));
    for (let r = 0; r < NH; r++) {
      for (let c = 0; c < NW; c++) {
        const a = start + r * row + c;
        tri(a, a + 1, a + row);
        tri(a + 1, a + row + 1, a + row);
        const b = a + lay;
        tri(b, b + row, b + 1);
        tri(b + 1, b + row, b + row + 1);
      }
    }
    // bords : les deux couches reliées sur les côtés
    for (let r = 0; r < NH; r++) {
      for (const c of [0, NW]) {
        const a = start + r * row + c;
        const b = a + lay;
        if (c === 0) {
          tri(a, a + row, b);
          tri(b, a + row, b + row);
        } else {
          tri(a, b, a + row);
          tri(b, b + row, a + row);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setAttribute('cmpRest', new THREE.Float32BufferAttribute(rest, 3));
  g.setAttribute('cmpPart', new THREE.Float32BufferAttribute(part, 4));
  g.setAttribute('cmpLow', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.userData.shared = true;
  return g;
}

const emptyBoneBoxes = (nb) => {
  const b = new Float32Array(nb * 6);
  for (let k = 0; k < nb; k++) b.set([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], k * 6);
  return b;
};

/** Boîtes englobantes par os (voir horseReal.js growBoneBoxes). */
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

/** Géométries (partagées) d'une race, avec les attributs du shader de la robe et ses mesures. */
function shapeFor(base, B) {
  const key = `${base.kind}|${B.key}`;
  let S = shapes.get(key);
  if (S) {
    S.users++;
    return S;
  }
  const D = deformDog(base, B);
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
  // Pièces modelées (oreilles pendantes : dogParts.js) ajoutées au pelage ; peau de l'oreille d'origine cachée rendue
  // à la tête (elle ne ressort plus quand l'oreille bouge).
  const extra = joinParts([buildPendantEars(base, D, B), buildPompons(base, D, B)]);
  S.coatGeo = extra ? mergedCoatGeo(base, D, extra) : geo(D.pos, D.nrm, coat, base.attrs);
  S.eyeGeo = base.prims.eye ? geo(D.eyePos, D.eyeNrm, base.prims.eye, base.eyeAttrs) : null;
  S.earGeo = erectEars(base, D, B);
  S.lodCoat = lodGeo(S.coatGeo, coat.lodIndex && extra ? Uint32Array.from([...coat.lodIndex, ...extra.index.map((i) => i + coat.count)]) : coat.lodIndex);
  S.lodEye = S.eyeGeo ? lodGeo(S.eyeGeo, base.prims.eye.lodIndex) : null;
  S.boneBox = emptyBoneBoxes(base.names.length);
  {
    const ga = S.coatGeo.attributes;
    growBoneBoxes(S.boneBox, ga.position.array, ga.skinIndex.array, ga.skinWeight.array, ga.position.count);
  }
  if (S.eyeGeo) growBoneBoxes(S.boneBox, D.eyePos, base.prims.eye.si, base.prims.eye.sw, base.prims.eye.count);
  if (S.earGeo) growBoneBoxes(S.boneBox, S.earGeo.attributes.position.array, S.earGeo.attributes.skinIndex.array, S.earGeo.attributes.skinWeight.array, S.earGeo.attributes.position.count);
  S.measure = measureDog(base, D, B);
  shapes.set(key, S);
  return S;
}

/**
 * Géométrie du pelage d'une race avec des pièces modelées en plus (extra : buildPendantEars) : attributs mis bout à
 * bout ; les sommets cachés (oreille d'origine rentrée dans le crâne) passent de l'os de l'oreille à celui de la tête.
 */
function mergedCoatGeo(base, D, extra) {
  const coat = base.prims.coat;
  const n = coat.count;
  const m = extra.count;
  const cat = (a, b, k, T) => {
    const out = new T((n + m) * k);
    out.set(a.subarray(0, n * k));
    out.set(b, n * k);
    return out;
  };
  const si = cat(coat.si, extra.si, 4, Uint16Array);
  const sw = cat(coat.sw, extra.sw, 4, Float32Array);
  if (D.hidden) {
    const headI = base.index.get('head');
    const ears = new Set(['ear1L', 'ear2L', 'ear1R', 'ear2R'].map((nm) => base.index.get(nm)));
    const acc = new Map();
    for (let i = 0; i < n; i++) {
      const c = D.hidden[i];
      if (!(c > 0)) continue;
      acc.clear();
      for (let k = 0; k < 4; k++) {
        const w = sw[i * 4 + k];
        if (!(w > 0)) continue;
        const b = si[i * 4 + k];
        if (ears.has(b)) {
          acc.set(b, (acc.get(b) ?? 0) + w * (1 - c));
          acc.set(headI, (acc.get(headI) ?? 0) + w * c);
        } else acc.set(b, (acc.get(b) ?? 0) + w);
      }
      const top = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const tot = top.reduce((x, [, w]) => x + w, 0) || 1;
      for (let k = 0; k < 4; k++) {
        si[i * 4 + k] = top[k] ? top[k][0] : 0;
        sw[i * 4 + k] = top[k] ? top[k][1] / tot : 0;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(cat(D.pos, extra.pos, 3, Float32Array), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(cat(D.nrm, extra.nrm, 3, Float32Array), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(cat(coat.uv, extra.uv, 2, Float32Array), 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setAttribute('cmpRest', new THREE.BufferAttribute(cat(base.attrs.cmpRest.array, extra.rest, 3, Float32Array), 3));
  g.setAttribute('cmpPart', new THREE.BufferAttribute(cat(base.attrs.cmpPart.array, extra.part, 4, Float32Array), 4));
  g.setAttribute('cmpLow', new THREE.BufferAttribute(cat(base.attrs.cmpLow.array, extra.low, 1, Float32Array), 1));
  // (pompons du caniche : rayon de chaque boule, ramenée à son centre par le shader hors de la coupe « caniche »)
  if (extra.pom) g.setAttribute('cmpPom', new THREE.BufferAttribute(cat(new Float32Array(n), extra.pom, 1, Float32Array), 1));
  const idx = new Uint32Array(coat.index.length + extra.index.length);
  idx.set(coat.index);
  for (let i = 0; i < extra.index.length; i++) idx[coat.index.length + i] = extra.index[i] + n;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.userData.shared = true;
  return g;
}

/**
 * Mesures d'une race au repos (repère du chien) : hauteur du dos, du ventre, du coude, de la tête ; anneau de
 * l'encolure (collier) ; coupes du tronc (manteau) ; dessus du crâne (accessoires) ; points d'appui des pattes.
 */
function measureDog(base, D, B) {
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
    if (!trunk(i) || Math.abs(z - midZ) > 0.04 * (B.back || 1)) continue;
    topY = Math.max(topY, P[i * 3 + 1]);
    bellyY = Math.min(bellyY, P[i * 3 + 1]);
    halfW = Math.max(halfW, Math.abs(P[i * 3] - L.midX));
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
      if (W.neck[i] + W.head[i] < 0.3 && !(W.leg[i * 4] + W.leg[i * 4 + 1] < 0.05 && Math.abs(P[i * 3 + 2] - c.z) < 0.06)) continue;
      _v.fromArray(P, i * 3);
      const dd = _v.clone().sub(c).dot(axis);
      if (Math.abs(dd) > 0.012) continue;
      if (W.ear[i * 2] + W.ear[i * 2 + 1] > 0.1) continue;
      // (pas les joues d'une grosse tête qui débordent sur le cou : chihuahua, carlin)
      if (W.head[i] > 0.7) continue;
      pts.push(_v.clone());
      sx += _v.x;
      sy += _v.y;
      sz += _v.z;
      cnt++;
    }
    if (!cnt) return { center: c, r: 0.05, rx: 0.05, ry: 0.05 };
    const center = V(sx / cnt, sy / cnt, sz / cnt);
    // (demi-axes dans le plan de la coupe : x sur le côté, y vers le dessus du cou ; mesurés en y du monde, le cou
    // dressé d'un petit chien donnait un collier aplati)
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
  const collar = ringAt(0.4);
  // Coupes du tronc pour le manteau : de l'épaule à la hanche, rayon par secteur de 15° autour de l'axe du tronc.
  const rings = [];
  const SECT = 24;
  const z0 = hipZ - 0.04;
  const z1 = shZ + 0.04;
  const step = 0.02;
  const ycAt = (topY + bellyY) / 2;
  for (let z = z0; z <= z1 + 1e-6; z += step) {
    const r = new Float32Array(SECT);
    for (let i = 0; i < n; i++) {
      const lw = W.leg[i * 4] + W.leg[i * 4 + 1] + W.leg[i * 4 + 2] + W.leg[i * 4 + 3];
      if (W.head[i] > 0.05 || W.tail[i] > 0.05 || W.neck[i] > 0.6) continue;
      const pz = P[i * 3 + 2];
      if (Math.abs(pz - z) > step * 0.75) continue;
      const px = P[i * 3] - L.midX;
      const py = P[i * 3 + 1] - ycAt;
      // (membres seulement au-dessus du coude : épaule, cuisse)
      if (lw > 0.3 && P[i * 3 + 1] < bellyY + 0.25 * (topY - bellyY)) continue;
      const a = Math.atan2(px, py);
      const k = ((Math.round((a / (Math.PI * 2)) * SECT) % SECT) + SECT) % SECT;
      r[k] = Math.max(r[k], Math.hypot(px, py));
    }
    for (let k = 0; k < SECT; k++) {
      if (r[k] > 0) continue;
      let a = 0;
      let c = 0;
      for (const kk of [k - 1, k + 1, k - 2, k + 2]) {
        const v = r[(kk + SECT) % SECT];
        if (v > 0) {
          a += v;
          c++;
        }
      }
      r[k] = c ? a / c : (topY - bellyY) / 2;
    }
    rings.push([z, r]);
  }
  // Dessus du crâne entre les oreilles, bout du nez, bouche.
  let skullTop = HJ.clone();
  let noseTip = HJ.clone();
  for (let i = 0; i < n; i++) {
    if (W.head[i] < 0.6 || W.ear[i * 2] + W.ear[i * 2 + 1] > 0.05) continue;
    _v.fromArray(P, i * 3);
    if (Math.abs(_v.x - L.midX) < 0.02 && _v.y > skullTop.y && _v.z < HJ.z + 0.1 * B.head) skullTop = _v.clone();
    if (W.nose[i] > 0.6 && _v.z > noseTip.z) noseTip = _v.clone();
  }
  // Appuis : sommets les plus bas de chaque patte (repère du chien) ; calage au sol pendant l'animation.
  const soles = [0, 1, 2, 3].map((l) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      if (W.leg[i * 4 + l] < 0.8) continue;
      if (P[i * 3 + 1] < 0.02) pts.push(i);
    }
    const sorted = pts.sort((a, b) => P[a * 3 + 1] - P[b * 3 + 1]).slice(0, 6);
    return sorted;
  });
  return {
    hipZ, shZ, topY, bellyY, halfW, ycAt, collar, rings, skullTop, noseTip, soles,
    elbowY: (H[I('radiusL')].y + H[I('radiusR')].y) / 2,
    headY: HJ.y,
    axis, nlen,
  };
}

// ------------------------------------------------------------------ construction

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
  m.position.y = 0.012;
  m.renderOrder = -1;
  return m;
}

/** Modèles GLB des chiens chargés (assets.js) : l'un ou l'autre peut manquer. */
export const realDogReady = (kind) => !!getModel(REAL_DOG_KEYS[kind]);

/**
 * Construit le chien réaliste (ou null si son GLB n'est pas chargé : on prend alors le chien procédural).
 * look : la robe de l'animal (look.puppy : chiot) ; breedId : sa race ; gltf : le GLB chargé (tests).
 */
export function buildRealDogModel(look, breedId = null, gltf = null) {
  const lk = breedId && !look.breed ? { ...look, breed: breedId } : look;
  const B = dogBuild(lk, !!look.puppy);
  const src = gltf ?? getModel(REAL_DOG_KEYS[B.model]);
  if (!src) return null;
  const base = realDogBase(src, B.model);
  const S = shapeFor(base, B);
  const H = S.heads;
  const names = base.names;
  const nb = names.length;

  // Squelette du chien : mêmes noms que le GLB (les clips s'y lient), articulations de la race, rotations de repos
  // du modèle d'origine.
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

  // Matières : robe du chien (uniformes propres) ; yeux du jack.
  const uniforms = { ...makeCoatUniforms(), ...base.landUniforms };
  const plan = coatPlan(look, lk.breed);
  setCoat(uniforms, plan);
  // Poil frisé (caniche, labradoodle) ou soyeux et frangé (yorkshire, setter, cavalier) : relief dans le shader.
  // (touffu : spitz — un relief de bouclettes léger, le poil n'est plus de la pâte à modeler)
  uniforms.cCurl.value.set(B.curly ? 1 : B.fluffy ? 0.4 * B.fluffy : 0, B.silky ? 1 : B.feather >= 0.8 ? 0.55 : 0);
  uniforms.cWrinkle.value = B.wrinkle ?? 0;
  const keepCfg = base.cfg.keep;
  const nose = S.measure.noseTip;
  const spheres = keepCfg.nose ? [{ s: new THREE.Vector4(base.land.nose.x, base.land.nose.y, base.land.nose.z - keepCfg.nose[0] * 0.4, keepCfg.nose[0]), l: keepCfg.nose[1] }] : [];
  void nose;
  const coatMat = coatMaterial(base.prims.coat.material, uniforms, {
    role: 'fur', means: base.means, detail: base.detail, contrast: base.cfg.grain, keep: { ...keepCfg, spheres },
  });
  // (robe noire : du lustre, sinon le poil n'a plus de modelé ; brune ou bringée foncée : un peu)
  coatMat.roughness = plan.dark ? 0.48 : plan.sheen ? 0.66 : 0.82;
  const hb = { box: new THREE.Box3(), sphere: new THREE.Sphere(), boneBox: S.boneBox.slice(), skeleton, meshes: [], anim: null };
  const coatMesh = new DogMesh(S.coatGeo, coatMat, hb);
  const meshes = [coatMesh];
  let eyeMesh = null;
  if (S.eyeGeo) {
    eyeMesh = new DogMesh(S.eyeGeo, coatMaterial(base.prims.eye.material, uniforms, { role: 'keep' }), hb);
    meshes.push(eyeMesh);
  }
  if (S.earGeo) meshes.push(new DogMesh(S.earGeo, coatMat, hb));
  for (const m of meshes) {
    m.bind(skeleton, new THREE.Matrix4());
    m.castShadow = m !== eyeMesh;
    m.receiveShadow = true;
    root.add(m);
    hb.meshes.push(m);
  }
  const M = S.measure;
  const L = (M.shZ - M.hipZ) + 0.25;
  root.add(contactShadow(M.halfW + 0.03, L * 0.9));

  const legs = LEG_KEYS.map(([, s, front], l) => {
    const names4 = front ? LEG_BONES.front : LEG_BONES.hind;
    const top = bone((front ? 'scap' : 'femur') + s);
    return {
      top, pivot: bone(names4[0] + s), knee: bone(names4[1] + s), fetlock: bone(names4[2] + s), paw: bone(names4[3] + s),
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
  // Repères dans le repère des os (au repos) : bouche, dessus du crâne, collier, laisse, bout de la queue.
  const toLocal = (b, p) => b.worldToLocal(p.clone());
  const mouth = toLocal(headB, M.noseTip.clone().add(V(0, -0.035 * B.head, -0.02 * B.head)));
  const skull = toLocal(headB, M.skullTop);
  const collarC = toLocal(neckB, M.collar.center);
  const neckQi = neckB.getWorldQuaternion(new THREE.Quaternion()).invert();
  const collarN = M.axis.clone().applyQuaternion(neckQi);
  // Repère de l'anneau du collier (z le long du cou, x sur le côté gauche, -y vers la gorge), dans celui de l'os.
  const ringQ = (() => {
    const z = M.axis.clone().normalize();
    const x = V(1, 0, 0).addScaledVector(z, -z.x).normalize();
    const y = z.clone().cross(x);
    return neckQi.clone().multiply(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)));
  })();
  // Repère de la tête (x à gauche, y en haut, z devant le chien au repos), dans celui de l'os de la tête.
  const headQ = headB.getWorldQuaternion(new THREE.Quaternion()).invert();
  const leashPoint = new THREE.Object3D();
  leashPoint.name = 'leashPoint';
  neckB.add(leashPoint);
  // (anneau du collier où s'accroche la laisse : sur le dessus de l'encolure, la laisse ne traverse pas le cou)
  leashPoint.position.copy(toLocal(neckB, M.collar.center.clone().add(V(0, M.collar.ry + 0.008, -0.004))));
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
    skeleton,
    bones,
    bone,
    coatMesh,
    eyeMesh,
    uniforms,
    coatPlan: plan,
    // (interface du modèle procédural : hauteurs en unités « taille 1 »)
    y0: (M.topY + M.bellyY) / 2,
    legTop: M.elbowY,
    saddleY: M.topY,
    headHeight: M.headY,
    headTilt: 0,
    snoutTip: [0, 0, 0],
    mouth,
    skull,
    leashPoint,
    dogFit: { collar: { center: collarC, normal: collarN, q: ringQ, rx: M.collar.rx, ry: M.collar.ry, bone: neckB }, rings: M.rings, ycAt: M.ycAt, midX: base.land.midX, hipZ: M.hipZ, shZ: M.shZ, topY: M.topY, bellyY: M.bellyY },
    accessoryFit: { skull, headQ, mouth, headR: 0.085 * B.head, tailTip: lastTail },
    build: B,
    kind: B.model,
    puppy: !!B.puppy,
    realDog: true,
  };
  model.skinGear = (mesh) => skinDogGear(model, S, base, mesh, hb);
  model.anim = new RealDogAnim(model, base, S);
  hb.anim = model.anim;
  model.bounds = hb;
  model.lodLevel = 0;
  model.setLod = (level) => {
    const l = S.lodCoat && level ? 1 : 0;
    if (l === model.lodLevel) return;
    model.lodLevel = l;
    coatMesh.geometry = l ? S.lodCoat : S.coatGeo;
    if (eyeMesh) eyeMesh.geometry = l ? S.lodEye ?? S.eyeGeo : S.eyeGeo;
  };
  model.staticPose = (kind = 'stand') => model.anim.staticPose(kind);
  model.setCoat = (lk2) => setCoat(uniforms, coatPlan(lk2, lk2.breed ?? lk.breed));
  // Coupe du salon de toilettage (Groomer.refreshCutVisuals) : poil raccourci ou gonflé par le shader, collerette du
  // lion, pompons du caniche. null : poil de la race.
  // (coupe de la race tant que le salon n'en a pas fait : le caniche a ses pompons — sans eux, un samoyède)
  const breedCut = DEFAULT_CUT[lk.breed] ?? null;
  model.setCut = (style) => {
    const f = Math.max(0.006, B.fur);
    const st = style ?? breedCut;
    const cut = {
      court: [-0.6 * f, -0.6 * f, -0.3 * f, -0.4 * f], tonte: [-0.8 * f, -0.8 * f, -0.5 * f, -0.6 * f],
      concours: [-0.25 * f, 0, 0, 0.3 * f], long: [0.35 * f, 0.35 * f, 0.2 * f, 0.3 * f],
      lion: [-0.7 * f, 0.03 + 0.6 * f, -0.3 * f, 0.02],
      // (pompons modelés de la race : seulement la crinière du devant au shader)
      caniche: B.pompons ? [-0.75 * f, 0.016, 0, 0] : [-0.7 * f, 0.01, 0.028, 0.03],
    }[st] ?? [0, 0, 0, 0];
    uniforms.cCut.value.set(...cut);
    uniforms.cPom.value = st === 'caniche' ? 1 : 0;
    model.cut = style ?? null;
  };
  model.setCut(null);
  let disposed = false;
  model.dispose = () => {
    if (disposed) return;
    disposed = true;
    model.anim.dispose();
    releaseShape(S);
  };
  model.anim.staticPose('stand');
  return model;
}

/**
 * Pièce d'équipement (manteau : coque dans le repère du chien) changée en maillage lié au squelette : chaque sommet
 * prend les poids des sommets de la peau les plus proches (tronc, épaules, hanches). Elle suit alors la respiration,
 * les épaules et les hanches au lieu de rester rigide sur le dos. Renvoie le nouveau maillage.
 */
function skinDogGear(model, S, base, mesh, hb) {
  const coat = base.prims.coat;
  const cp = S.D.pos;
  const W = base.W;
  if (!S.trunkSkin) {
    const list = [];
    for (let i = 0; i < coat.count; i++) {
      const lw = W.leg[i * 4] + W.leg[i * 4 + 1] + W.leg[i * 4 + 2] + W.leg[i * 4 + 3];
      if (W.head[i] > 0.1 || W.tail[i] > 0.1) continue;
      if (lw > 0.5 && cp[i * 3 + 1] < S.measure.bellyY + 0.3 * (S.measure.topY - S.measure.bellyY)) continue;
      list.push(i);
    }
    S.trunkSkin = Uint32Array.from(list);
  }
  const geo = mesh.geometry;
  mesh.updateMatrix();
  geo.applyMatrix4(mesh.matrix);
  const pos = geo.attributes.position;
  const n = pos.count;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const p = V();
  const near = [];
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    near.length = 0;
    for (const j of S.trunkSkin) {
      const dd = (cp[j * 3] - p.x) ** 2 + (cp[j * 3 + 1] - p.y) ** 2 + (cp[j * 3 + 2] - p.z) ** 2;
      if (near.length < 4 || dd < near[3][0]) {
        near.push([dd, j]);
        near.sort((a, b) => a[0] - b[0]);
        if (near.length > 4) near.pop();
      }
    }
    const acc = new Map();
    for (const [dd, j] of near) {
      const f = 1 / (Math.sqrt(dd) + 0.004);
      for (let k = 0; k < 4; k++) {
        const w = coat.sw[j * 4 + k];
        if (w > 0) acc.set(coat.si[j * 4 + k], (acc.get(coat.si[j * 4 + k]) ?? 0) + w * f);
      }
    }
    const top = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = top.reduce((x, [, w]) => x + w, 0) || 1;
    top.forEach(([b, w], k) => {
      si[i * 4 + k] = b;
      sw[i * 4 + k] = w / tot;
    });
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  growBoneBoxes(hb.boneBox, pos.array, si, sw, n);
  const sk = new DogMesh(geo, mesh.material, hb);
  sk.castShadow = mesh.castShadow;
  sk.receiveShadow = true;
  mesh.parent?.remove(mesh);
  model.root.add(sk);
  sk.bind(model.skeleton, new THREE.Matrix4());
  hb.meshes = hb.meshes.filter((m) => m.parent);
  hb.meshes.push(sk);
  return sk;
}

// ------------------------------------------------------------------ élimination hors champ

const _bm = new THREE.Matrix4();
const FUR_MARGIN = 0.05;

/** Boîte englobante du chien d'après la pose (boîte de repos de chaque os emmenée par sa matrice de peau). */
function dogBounds(hb, mesh) {
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
  if (box.isEmpty()) box.set(V(-0.5, 0, -0.6), V(0.5, 0.9, 0.6));
  box.expandByScalar(FUR_MARGIN);
  box.getBoundingSphere(hb.sphere);
  for (const m of hb.meshes) {
    m.boundingBox = box;
    m.boundingSphere = hb.sphere;
  }
}

/** Maillage du chien : boîte qui suit la pose (voir horseReal.js HorseMesh) ; dessiné : noté pour l'animation. */
class DogMesh extends THREE.SkinnedMesh {
  constructor(geometry, material, hb) {
    super(geometry, material);
    this.dog = hb;
  }

  updateMatrixWorld(force) {
    super.updateMatrixWorld(force);
    this.boundingBox = null;
    this.boundingSphere = null;
  }

  computeBoundingBox() {
    if (this.dog) dogBounds(this.dog, this);
    else super.computeBoundingBox();
  }

  computeBoundingSphere() {
    if (this.dog) dogBounds(this.dog, this);
    else super.computeBoundingSphere();
  }

  onBeforeRender() {
    if (this.dog?.anim) this.dog.anim.seen = true;
  }

  onBeforeShadow() {
    if (this.dog?.anim) this.dog.anim.seen = true;
  }
}

// ------------------------------------------------------------------ animation

/**
 * Allure d'après la vitesse (m/s, ramenée à la taille et aux membres du modèle d'origine), avec hystérésis.
 * prev : allure de l'image précédente ('idle', 'walk', 'trot', 'run').
 */
const GAIT_UP = { walk: 1.7, trot: 3.9 };
const GAIT_DOWN = { trot: 1.45, run: 3.5 };
export function pickDogGait(prev, u) {
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

// Postures : clip qui la tient et transitions jouées une fois pour y entrer (depuis debout) ou en sortir.
const POSTURE = {
  stand: { clip: 'idle' },
  sit: { clip: 'sit', enter: 'sit_down', leave: 'stand_up' },
  lie: { clip: 'lie', enter: 'lie_down', from: 'sit', leave: 'get_up' },
  sleep: { clip: 'sleep', enter: 'lie_down', from: 'sit', leave: 'get_up' },
};
const ACTIONS = ['sniff', 'eat', 'drink', 'wag', 'paw', 'rollover', 'bow', 'jump'];

/**
 * Mixeur d'un chien : allures fondues selon la vitesse (chaque clip joué à vitesse réelle ÷ vitesse naturelle de
 * cette race : les pattes posées glissent peu), postures (assis, couché, endormi) avec leurs transitions, actions
 * (renifler, manger, boire, tours) ; par-dessus : regard, oreilles, queue (port de la race, frétillements), clignement
 * des yeux, respiration, halètement, embonpoint ; pattes jamais sous le sol.
 */
class RealDogAnim {
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
      const once = ['sit_down', 'stand_up', 'lie_down', 'get_up', 'jump', 'paw', 'rollover'].includes(name);
      if (once) {
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
    // Vitesse naturelle de chaque allure pour cette race : celle du modèle × longueur des membres.
    const k = 0.35 + 0.65 * B.legs;
    this.natural = Object.fromEntries(MOVING.map((g) => [g, (base.natural[g] ?? NATURAL_SPEED[g]) * k]));
    this.speedScale = k;
    this.gait = 'idle';
    this.posture = 'stand';
    this.trans = null; // { name, to }
    this.target = {};
    for (const nm of this.names) this.target[nm] = 0;
    // Os : pose écrite par le mixeur (rétablie avant chaque mise à jour, voir horseReal.js restorePose).
    this.bones = model.bones;
    // Décalage des articulations de la race pour les os dont un clip anime la translation (racine…).
    //    (écart de la position locale : déplacement de l'os moins celui de son parent, dans le repère de repos du
    //    parent ; sans retirer celui du parent, il comptait deux fois le long des membres : le galgo volait au galop
    //    et le chiot s'enfonçait dans le sol)
    this.shift = base.transBones.map((i) => {
      const p = base.parent[i];
      const d = S.heads[i].clone().sub(base.heads[i]);
      if (p >= 0) d.sub(_u.copy(S.heads[p]).sub(base.heads[p]));
      return [this.bones[i], d.applyQuaternion(p >= 0 ? base.rotW[p].clone().invert() : new THREE.Quaternion())];
    });
    this.pose = this.bones.map((b) => [b.position.clone(), b.quaternion.clone()]);
    // Port de la queue de la race (rotations locales des os de la queue) et des oreilles.
    this.tailRest = tailCarriage(model, base, B);
    this.t = (model.root.id * 7.31) % 100;
    this.seen = false;
    this.seenNow = false;
    this.frame = -1;
    this.skipDt = 0;
    this.skipN = 0;
    this.blink = 0;
    this.blinkT = 2;
    this.look = new THREE.Vector2();
    this.wagAmt = 0;
    this.pant = 0;
    this.lidQ = ['lidUL', 'lidDL', 'lidUR', 'lidDR'].map((nm) => model.bone(nm)).map((b) => (b ? [b, b.quaternion.clone()] : null));
    this.eyes = ['eyeL', 'eyeR'].map((nm) => model.bone(nm)).filter(Boolean);
    this.jaw = model.bone('jaw');
    this.tongue = [1, 2, 3, 4, 5, 6].map((i) => model.bone('tongue' + i)).filter(Boolean);
    this.breathe = model.bone('breathe');
    this.trick = null;
    this.lead = 'walk';
    // Rotation de repos (repère du chien) du parent de chaque os : pour tourner un os autour d'un axe du chien
    // (les os gardent les orientations arbitraires du GLB ; voir turn).
    this.pinv = new Map(this.bones.map((b, i) => [b, base.parent[i] >= 0 ? base.rotW[base.parent[i]].clone().invert() : new THREE.Quaternion()]));
    this.solePts = model.legs.map((l) => l.soles.map((i) => {
      const p = V().fromArray(S.D.pos, i * 3);
      return l.paw.worldToLocal(p);
    }));
    // Points de la peau qui touchent le sol à l'arrêt (corps, queue, tête : voir contactPoints), chacun suit ses os avec
    // leurs poids, comme le shader (lié à un seul os, un point de la cuisse assise passait sous le sol et le chien
    // s'asseyait en l'air).
    this.bodyPts = [];
    this.tailPts = [];
    this.headPts = [];
    // (le poil s'écrase un peu, pas de plusieurs centimètres : la croupe du terre-neuve assis entrait de 4 cm)
    this.bodyAllow = 0.004 + Math.max(0, B.fur) * 0.3;
    this.gOff = 0;
    this.plant = [null, null, null, null];
    // Les os à translation animée partent de leur position du modèle d'origine : le mixeur la garde comme valeur de
    // repos, et c'est elle qu'il rend quand aucun clip actif n'anime leur translation ; le décalage de la race est
    // ajouté après. (Partis de la position de la race, le décalage comptait deux fois dès qu'un clip n'animait pas
    // l'os : les yeux du shiba sortaient de la tête des races à grosse tête — l'œil à 1,6 fois sa distance pour une
    // tête 1,3 fois plus grosse.) Fait en dernier : les repères ci-dessus sont pris sur le squelette de la race.
    for (const [b, d] of this.shift) b.position.sub(d);
    this.savePose();
    this.contactPoints();
    this.measureNatural();
  }

  /**
   * Vitesse naturelle de chaque allure pour cette race, mesurée sur son squelette : vitesse à laquelle les doigts en
   * appui reculent sous le corps quand le clip est joué à sa vitesse (moyenne des antérieurs et des postérieurs).
   * (Déduite de la seule longueur des membres, elle laissait patiner les races aux membres changés : 30 à 50 % de la
   * vitesse pour le teckel et le corgi, 20 à 40 % pour les lévriers.) Une fois par race.
   */
  measureNatural() {
    const S = this.S;
    if (!S.natural) {
      const md = this.model;
      const feet = ['toesL', 'toesR', 'htoesL', 'htoesR'].map((nm) => md.bone(nm));
      const nat = {};
      const N = 48;
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
        // vitesse de recul des doigts en appui (au plus 4 mm au-dessus de leur plus bas)
        const speed = tracks.map((tr) => {
          const ymin = Math.min(...tr.map((p) => p.y));
          let d = 0;
          let n = 0;
          for (let k = 1; k <= N; k++) {
            if (tr[k].y < ymin + 0.004 && tr[k - 1].y < ymin + 0.004) {
              d += tr[k - 1].z - tr[k].z;
              n++;
            }
          }
          return n ? d / ((n * T) / N) : null;
        });
        const ok = (x) => x !== null && x > 0.05;
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
    for (const g of MOVING) if (S.natural[g] > 0.1) this.natural[g] = S.natural[g];
  }

  /**
   * Points de contact avec le sol des poses à l'arrêt (assis, couché, endormi, patte, roulade, renifler, manger, boire,
   * révérence) : pour chaque pose, les
   * sommets les plus bas du corps, de la queue et de la tête, plus un échantillon régulier ; calculés une fois par race
   * (géométrie partagée). Le corps repose dessus (bodyPts), la queue se relève (tailPts), l'encolure relève la tête
   * (headPts) : un échantillon fixe de 240 points manquait la croupe, la queue n'était tenue que par ses articulations
   * (sa peau épaisse entrait de 6 à 9 cm dans le sol), et rien ne tenait la tête (teckel qui renifle : -10 cm).
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
      const poses = [['sit'], ['lie'], ['sleep'], ['paw', 0.3], ['rollover', 0.05], ['rollover', 0.12], ['rollover', 0.2], ['sniff', 0.1], ['sniff', 0.6], ['eat', 0.3], ['drink', 0.3], ['bow', 0.3]];
      for (const [clip, t] of poses) {
        if (!this.actions[clip]) continue;
        if (t === undefined) this.staticPose(clip);
        else this.clipPose(clip, t);
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
    // (repères pris sur le squelette de la race au repos)
    md.root.updateMatrixWorld(true);
    const hold = this.bones.map((b) => [b.position.clone(), b.quaternion.clone()]);
    for (let i = 0; i < this.bones.length; i++) {
      this.bones[i].position.copy(this.bones[i].userData.restP);
      this.bones[i].quaternion.copy(this.bones[i].userData.restQ);
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
    for (let i = 0; i < this.bones.length; i++) {
      this.bones[i].position.copy(hold[i][0]);
      this.bones[i].quaternion.copy(hold[i][1]);
    }
    md.root.updateMatrixWorld(true);
  }

  /** Pose d'un clip tenu à une fraction t de sa durée (comme les tours du spectacle), pieds et corps posés. */
  clipPose(clip, t) {
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
    const st = { moving: false, v: 0, sleeping: false, happy: 0, sad: false };
    this.overlay(0, st, true);
    this.ground(st);
    this.model.root.updateMatrixWorld(true);
  }

  /** Tourne un os de ang autour d'un axe du chien (axe vu par son parent au repos ; il suit le parent animé). */
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

  /** Pose figée (vignettes, caisse de transport, van) : debout, assis ou couché, sans temps qui passe. */
  staticPose(kind = 'stand') {
    const clip = { stand: 'idle', sit: 'sit', lie: 'lie', sleep: 'sleep' }[kind] ?? 'idle';
    for (const nm of this.names) {
      this.w[nm] = nm === clip ? 1 : 0;
      this.actions[nm].setEffectiveWeight(this.w[nm]);
      this.actions[nm].time = 0;
    }
    this.posture = kind === 'stand' ? 'stand' : kind;
    this.trans = null;
    this.restorePose();
    this.mixer.update(0);
    this.savePose();
    // (comme update : articulations de la race sous les translations des clips, puis pieds posés au sol)
    for (const [b, d] of this.shift) b.position.add(d);
    const st = { moving: false, v: 0, sleeping: kind === 'sleep', happy: 0, sad: false };
    this.overlay(0, st, true);
    this.ground(st);
    this.model.root.updateMatrixWorld(true);
  }

  /**
   * Une image. st : { v (m/s, chien de taille 1), moving, posture ('stand' | 'sit' | 'lie' | 'sleep'), action
   * (ACTIONS ou null), sleeping, happy (0-1), sad, pull (laisse tendue 0-1), herd (troupeau), hot (halète), fat,
   * look (cible du regard dans le repère du chien ou null), wet }.
   */
  update(dt, st) {
    const md = this.model;
    this.restorePose();
    this.t += dt;
    const u = st.moving ? st.v / this.speedScale : 0;
    const g = pickDogGait(this.gait, u);
    this.gait = g;
    // Posture voulue (debout dès qu'il bouge) ; transitions jouées une fois.
    const want = st.moving ? 'stand' : st.posture ?? 'stand';
    if (this.trans) {
      const a = this.actions[this.trans.name];
      if (!a || a.time >= a.getClip().duration - 0.05 || (st.moving && this.trans.to !== 'stand')) {
        this.posture = this.trans.to;
        this.trans = null;
      }
    }
    if (!this.trans && want !== this.posture) {
      const from = this.posture;
      let tr = null;
      let to = want;
      if (want === 'stand') tr = POSTURE[from]?.leave;
      else if (from === 'stand') {
        // (pour se coucher : on s'assoit d'abord)
        if (POSTURE[want].from === 'sit') {
          tr = 'sit_down';
          to = 'sit';
        } else tr = POSTURE[want].enter;
      } else if (from === 'sit' && (want === 'lie' || want === 'sleep')) tr = 'lie_down';
      else if ((from === 'lie' || from === 'sleep') && (want === 'lie' || want === 'sleep')) tr = null;
      else tr = POSTURE[from]?.leave ?? null;
      if (st.moving || !tr || !this.actions[tr]) {
        this.posture = st.moving ? 'stand' : to;
      } else {
        const a = this.actions[tr];
        a.reset();
        a.play();
        this.trans = { name: tr, to: tr === POSTURE[from]?.leave ? 'stand' : to };
      }
    }
    // Poids voulus.
    const target = this.target;
    for (let j = 0; j < this.names.length; j++) target[this.names[j]] = 0;
    const trick = this.trick && this.trick.age < 0.25 ? this.trick : null;
    if (this.trick) this.trick.age += dt;
    let fadeK = 5;
    if (trick && this.actions[trick.clip]) {
      target[trick.clip] = trick.w;
      const rest = 1 - trick.w;
      if (rest > 0.01) target[this.posture === 'stand' ? 'idle' : POSTURE[this.posture].clip] = rest;
      fadeK = 8;
    } else if (this.trans) {
      target[this.trans.name] = 1;
      fadeK = 12;
    } else if (st.moving) {
      target[g === 'idle' ? 'walk' : g] = 1;
    } else if (this.posture !== 'stand') {
      target[POSTURE[this.posture].clip] = 1;
      fadeK = 4;
    } else if (st.action && this.actions[st.action]) {
      target[st.action] = 1;
      fadeK = 4;
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
      // Une allure qui entre se cale sur la phase de celle qui sort.
      if (was < 0.02 && w >= 0.02 && MOVING.includes(name) && this.lead && this.lead !== name) {
        const from = this.actions[this.lead];
        if (from) a.time = (from.time / from.getClip().duration) * a.getClip().duration;
      }
      a.setEffectiveWeight(w);
      if (MOVING.includes(name)) {
        const nat = this.natural[name];
        a.timeScale = Math.min(2.2, Math.max(0.45, (st.moving ? st.v : nat) / nat)) * (st.pull ? 1 - 0.3 * st.pull : 1);
        if (w > leadW) {
          lead = name;
          leadW = w;
        }
      } else if (trick && name === trick.clip && trick.time !== undefined) {
        a.timeScale = 0;
        a.time = trick.time * a.getClip().duration;
      } else {
        // (sur commande, « assis ! », « couché ! » : les transitions plus vives)
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
    const B = md.build;
    const t = this.t;
    const u = md.uniforms;
    const sleeping = !!st.sleeping;
    // Respiration (plus lente endormi, haletante après l'effort ou par la chaleur) et embonpoint.
    this.pant += ((st.hot || st.v > 3.5 ? 1 : 0) - this.pant) * Math.min(1, dt * 0.6);
    const rate = sleeping ? 1.4 : 2.3 + this.pant * 9;
    u.cBreath.value = Math.sin(t * rate) * (sleeping ? 0.004 : 0.0025 + this.pant * 0.002);
    u.cFat.value = Math.max(-0.012, Math.min(0.03, ((st.fat ?? 1) - 1) * 0.08));
    u.cWet.value = st.wet ?? 0;
    // Gueule entrouverte et langue qui pend quand il halète ou qu'il est content.
    const open = Math.max(this.pant * 0.9, (st.happy ?? 0) * 0.35) * (sleeping ? 0 : 1);
    // (au calme, la gueule du shiba, ouverte dans ses animations, est refermée : sinon il montre les dents. Jusqu'à
    // l'angle de la gueule fermée, mesuré depuis la pose de repos du GLB (elle-même entrouverte) — pas d'un angle
    // fixe : fermée de 0,1 rad, l'idle montrait encore une rangée de dents ; de 0,2, la marche, sans piste de
    // mâchoire, la refermait trop et les dents du bas passaient à travers la lèvre)
    let shut = 0;
    if (B.model === 'shiba' && this.jaw) {
      _q.copy(this.jaw.userData.restQ).invert().multiply(this.jaw.quaternion);
      const a = 2 * Math.atan2(_q.x, _q.w);
      shut = Math.max(0, a - JAW_CLOSED) * (1 - Math.min(1, open * 2.5));
    }
    if (this.jaw && (open > 0.01 || shut > 0)) this.turn(this.jaw, AX, open * 0.22 + Math.sin(t * rate) * 0.03 * this.pant - shut);
    if (this.tongue.length && this.pant > 0.05) {
      for (let i = 0; i < this.tongue.length; i++) this.turn(this.tongue[i], AX, this.pant * 0.12 * (i + 1) / this.tongue.length);
    }
    // Regard : vers ce qui l'intéresse (le joueur proche), sinon il regarde autour de lui ; moins en marche.
    const moving = !!st.moving;
    const head = md.head;
    const neck = md.neck;
    let yaw = (Math.sin(t * 0.37) * 0.5 + Math.sin(t * 0.13 + 1.7) * 0.5) * 0.45 * (moving ? 0.15 : 1);
    let pitch = Math.sin(t * 0.21 + 0.6) * 0.08;
    if (st.look) {
      yaw = clamp(Math.atan2(st.look.x, Math.max(0.05, st.look.z)), -1.0, 1.0);
      pitch = clamp(-Math.atan2(st.look.y, Math.hypot(st.look.x, st.look.z)), -0.5, 0.4);
    }
    if (sleeping || this.posture === 'sleep') {
      yaw = 0;
      pitch = 0;
    }
    const lk = Math.min(1, dt * 3);
    this.look.x += (yaw - this.look.x) * (still ? 1 : lk);
    this.look.y += (pitch - this.look.y) * (still ? 1 : lk);
    if (head) {
      this.turn(neck, AXIS_Y, this.look.x * 0.45);
      this.turn(head, AXIS_Y, this.look.x * 0.4);
      this.turn(head, AX, this.look.y * 0.5);
    }
    if (st.sad && !moving) this.turn(neck, AX, 0.18);
    // Tirer en laisse : corps penché en avant, tête en avant et un peu basse.
    if (st.pull) {
      this.turn(md.body, AX, 0.12 * st.pull);
      this.turn(neck, AX, -0.15 * st.pull);
    }
    // Chien de troupeau : tête basse, encolure tendue (« l'œil »).
    if (st.herd && moving) this.turn(neck, AX, 0.3);
    // Clignement des yeux (shiba : paupières ; jack : globe aplati) ; yeux clos endormi.
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blink = 1;
      this.blinkT = 2.5 + ((Math.sin(t * 12.9898) * 43758.5) % 1 + 1) % 1 * 4;
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    const closed = sleeping || this.posture === 'sleep' ? 1 : Math.sin(Math.PI * this.blink);
    for (const x of this.lidQ) {
      if (!x) continue;
      const [b] = x;
      const up = b.name.startsWith('lidU');
      this.turn(b, AX, (up ? 0.55 : -0.25) * closed);
    }
    if (md.kind === 'jack') for (const e of this.eyes) e.scale.set(1, 1 - 0.85 * closed, 1);
    // Oreilles : elles bougent vers ce qu'il écoute, se couchent quand il est triste ou endormi, se dressent au jeu.
    const ears = md.ears;
    for (let i = 0; i < ears.length; i++) {
      const e = ears[i];
      const s = e.userData.side;
      const n1 = Math.sin(t * 1.3 + i * 2.1) + Math.sin(t * 0.47 + i);
      const flick = Math.max(0, Math.sin(t * 1.7 + i * 2.6) - 0.93) * 12;
      const down = (st.sad ? 0.35 : 0) + (sleeping ? 0.25 : 0);
      this.turn(e, AX, n1 * 0.04 - flick * 0.2 - down * 0.5); // (négatif : oreille couchée en arrière)
      this.turn(e, AZ, -s * (down * 0.35 + flick * 0.1));
    }
    // Queue : port de la race, plus haut au trot et au jeu, frétille quand il est content, basse s'il est triste.
    const tb = md.tailBones;
    if (tb.length) {
      const happy = st.happy ?? 0;
      this.wagAmt += ((sleeping ? 0 : Math.max(happy, st.action === 'wag' ? 1 : 0)) - this.wagAmt) * Math.min(1, dt * 3);
      const freq = 6 + happy * 6;
      const wag = Math.sin(t * freq) * (0.15 + 0.5 * this.wagAmt) * (B.tail === 'curl' ? 0.4 : 1) + Math.sin(t * 0.9) * 0.05;
      const lift = (moving ? Math.min(1, st.v / 3) * 0.25 : 0) + happy * 0.15 - (st.sad ? 0.5 : 0) - (sleeping ? 0.2 : 0);
      const low = this.posture !== 'stand' ? 1 : 0;
      for (let i = 0; i < tb.length; i++) {
        const b = tb[i];
        b.quaternion.copy(this.tailRest[i]);
        const f = 1 - i / tb.length;
        if (i === 0) {
          this.turn(b, AX, lift - low * 0.35); // (positif : queue relevée)
          this.turn(b, AXIS_Y, wag * 0.8);
        } else {
          this.turn(b, AXIS_Y, wag * 0.25 * f);
        }
      }
    }
    // Sabots… pattes : voir ground.
  }

  /**
   * Pattes jamais sous le sol (fondu entre deux clips, proportions de la race), queue au-dessus du sol : le corps est
   * relevé de ce qui dépasse, la queue relevée autour de sa base. Positions des points d'appui par les matrices des os
   * (une mise à jour des matrices du squelette par image, faite ici plutôt qu'au rendu).
   */
  /**
   * Pieds au sol. Au pas et au trot, la sole la plus basse est posée sur le sol (relevée tout de suite, descendue
   * en douceur) ; au galop et pendant le saut, le chien est seulement relevé (il a des temps de suspension) ; à
   * l'arrêt (debout, assis, couché, tours), les soles sont posées et le corps ne s'enfonce pas sous le sol.
   * dt : 0 pour une pose fixe (vignettes, caisse de transport) : sans transition.
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
    const air = this.trick?.clip === 'jump' && this.trick.age < 0.25;
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
    if (Math.abs(off) > 0.0003) {
      md.body.position.y += off;
      md.root.updateMatrixWorld(true);
    }
    if (st.moving && !air && dt > 0 && this.gait !== 'run') {
      this.footLock();
      // (un membre tourné peut descendre un peu : le corps est relevé de ce qui passerait sous le sol)
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
    } else this.plant.fill(null);
    if (st.moving || air) return;
    // Assis (et en s'asseyant, en se relevant) : voir settleSit.
    const sitW = (this.w.sit ?? 0) + (this.w.sit_down ?? 0) + (this.w.stand_up ?? 0);
    const lieW = (this.w.lie ?? 0) + (this.w.sleep ?? 0) + (this.w.lie_down ?? 0) + (this.w.get_up ?? 0);
    if (sitW > 0.3 && this.trick?.clip !== 'rollover') this.settleSit();
    // (aussi au début d'un tour assis ou patte, quand le chien reniflait encore)
    else if (sitW < 0.1 && lieW < 0.1 && (!this.trick || this.trick.clip === 'sit' || this.trick.clip === 'paw')) this.settleStand();
    // Queue : sa peau (poil compris) au-dessus du sol, assis, couché, endormi — chaque os relevé, de la base au bout, de
    // ce qui passe encore sous le sol au-delà de lui. (Tenue par ses articulations seulement, la queue épaisse entrait
    // de 6 à 9 cm dans le sol, sur la table du salon ou la scène.)
    const tb = md.tailBones;
    const floorT = 0.004;
    if (tb.length && this.tailPts.length) {
      // (deux passes : une queue pendante qui plonge dans le sol — teckel assis — demande plus d'un os par passe)
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
            if (i === 0) break tail; // (rien sous le sol)
            continue;
          }
          this.turn(tb[i], AX, raiseAngle(_v.setFromMatrixPosition(tb[i].matrixWorld).applyMatrix4(_m), _u, floorT + 0.004, i === 0 ? 1.4 : 1.0));
          tb[i].updateMatrixWorld(true);
        }
      }
    }
    // Tête : jamais sous le sol (races aux pattes courtes qui reniflent, mangent ou boivent, roulade) — l'encolure la
    // relève de ce qui dépasse.
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
        const floorH = 0.008;
        if (!(lowY < floorH)) break;
        this.turn(md.neck, AX, raiseAngle(_v.setFromMatrixPosition(md.neck.matrixWorld).applyMatrix4(_m), _u, floorH + 0.004, 0.8));
        md.neck.updateMatrixWorld(true);
      }
    }
    // Roulade : sur le dos, ce sont le dos, l'encolure, la tête et les oreilles qui touchent le sol (scène du
    // spectacle) — des parties que les points d'appui des poses ne couvrent pas toutes (oreilles du berger allemand
    // 5 cm, dos 15 cm sous la scène ; l'encolure relevée pour un point de la tête en descendait un autre). Le tour est
    // court et rare : à la fin, la peau entière (un sommet sur trois) est mesurée et le corps relevé.
    if (this.trick?.clip === 'rollover') {
      const lo = this.skinLow(3);
      if (lo < -this.bodyAllow) {
        md.body.position.y -= lo + this.bodyAllow;
        md.root.updateMatrixWorld(true);
      }
    }
  }

  /**
   * Pieds en appui tenus sur place (pas et trot) : quand une patte se pose, la place de ses doigts dans le monde est
   * notée ; tant qu'elle reste posée, le membre est tourné à l'épaule ou à la hanche pour y ramener les doigts (de
   * l'avant à l'arrière). Les membres raccourcis ou allongés d'une race changent la longueur de la foulée des clips
   * (teckel : antérieurs 30 % plus courts que les postérieurs) : sans cela, les pieds patinaient en appui.
   */
  footLock() {
    const md = this.model;
    const inv = _m; // (inverse de la racine, voir ground)
    for (let l = 0; l < md.legs.length; l++) {
      const leg = md.legs[l];
      let low = Infinity;
      for (const p of this.solePts[l]) {
        const y = _v.copy(p).applyMatrix4(leg.paw.matrixWorld).applyMatrix4(inv).y;
        if (y < low) low = y;
      }
      if (!(low < 0.012)) {
        this.plant[l] = null;
        continue;
      }
      const toe = _u.setFromMatrixPosition(leg.paw.matrixWorld);
      if (!this.plant[l]) {
        this.plant[l] = toe.clone();
        continue;
      }
      // écart dans le repère du chien (avant : +z), à corriger en tournant le membre autour de son articulation haute
      const errW = _v.copy(toe).sub(this.plant[l]);
      _q.setFromRotationMatrix(md.root.matrixWorld).invert();
      const ez = errW.applyQuaternion(_q).z;
      const top = _w.setFromMatrixPosition(leg.pivot.matrixWorld);
      const Lg = Math.max(0.05, top.distanceTo(toe));
      // (rotation +θ autour de x : le pied, sous l'articulation, recule de L sin θ)
      const th = Math.asin(clamp(ez / Lg, -0.5, 0.5));
      if (Math.abs(th) < 1e-4) continue;
      this.turn(leg.pivot, AX, th);
      leg.pivot.updateMatrixWorld(true);
      // (trop loin de sa place, le pied repart : nouvelle prise d'appui)
      if (Math.abs(ez) > 0.45 * Lg) this.plant[l] = null;
    }
  }

  /**
   * Chien assis, posé sur sa croupe : le dos d'une race longue aux pattes avant courtes (teckel, corgi, petits chiens)
   * n'a pas la pente de celui du shiba du clip, et ses pieds avant restaient en l'air (30 cm pour le teckel, 22 pour
   * le corgi, 4 à 6 pour le jack ou le carlin). Le corps bascule vers l'avant autour de l'os racine, de l'écart entre
   * les pieds avant et le reste de l'appui (pieds arrière, croupe), puis est reposé au sol ; les pieds arrière qui
   * flottent encore (croupe au poil épais : terre-neuve) sont descendus en tournant le membre à la hanche.
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
    // appui hors pieds avant : pieds arrière et peau du corps (croupe), avec la marge du poil
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
      if (!(gap > 0.004)) break;
      const th = Math.min(0.7 - total, gap / Math.max(0.05, f.z - o.z));
      if (!(th > 0.001)) break;
      const floor = o.y;
      this.turn(md.body, AX, th);
      total += th;
      md.root.updateMatrixWorld(true);
      // (reposé au sol : le plus bas de l'appui revient à la hauteur d'avant)
      const m = Math.min(lowFront().y, lowRest().y);
      md.body.position.y -= m - floor;
      md.root.updateMatrixWorld(true);
    }
    // Pieds arrière encore en l'air au-dessus de la croupe posée.
    lowRest();
    const base = Math.max(0, o.y);
    for (const l of [2, 3]) {
      const s = lowSole(l, t);
      if (!(s.y > base + 0.006)) continue;
      const pv = md.legs[l].pivot;
      const c = _u.setFromMatrixPosition(pv.matrixWorld).applyMatrix4(_m);
      this.turn(pv, AX, raiseAngle(c, s, base + 0.002, 0.35));
      pv.updateMatrixWorld(true);
    }
  }

  /**
   * Debout sur place (renifler, manger, boire) : le clip du shiba baisse l'avant du corps ; avec le dos long ou les
   * pattes avant courtes d'une race (teckel, corgi), l'avant-bras et les pieds avant passaient sous le sol, le chien
   * entier était relevé d'autant et les pieds arrière flottaient (9 cm pour le teckel, 3 pour le terre-neuve). Le
   * corps est redressé autour de l'os racine pour remettre l'avant (pieds et peau de la moitié avant) et l'arrière à la
   * même hauteur, puis reposé au sol.
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
      // (positif : l'avant est plus bas, l'arrière flotte)
      const gap = Hn.y - F.y;
      if (!(Math.abs(gap) > 0.004)) break;
      const floor = Math.min(F.y, Hn.y);
      const th = clamp(-gap / Math.max(0.05, F.z - Hn.z), -0.35 - total, 0.35 - total);
      if (!(Math.abs(th) > 0.001)) break;
      this.turn(md.body, AX, th);
      total += th;
      md.root.updateMatrixWorld(true);
      scan();
      md.body.position.y -= Math.min(F.y, Hn.y) - floor;
      md.root.updateMatrixWorld(true);
    }
  }

  /** Point le plus bas de la peau animée (repère du chien, _m : inverse de la racine), un sommet sur step. */
  skinLow(step = 3) {
    const m = this.model.coatMesh;
    const n = m?.geometry.attributes.position.count ?? 0;
    let lo = Infinity;
    for (let i = 0; i < n; i += step) {
      const y = m.getVertexPosition(i, _q2v).applyMatrix4(m.matrixWorld).applyMatrix4(_m).y;
      if (y < lo) lo = y;
    }
    return lo;
  }

  /** Hauteur (repère du chien, _m : inverse de la racine) d'un point de peau ; sa position dans _w. */
  skinY(inf) {
    _w.set(0, 0, 0);
    for (const [b, p, w] of inf) _w.addScaledVector(_q2v.copy(p).applyMatrix4(b.matrixWorld), w);
    return _w.applyMatrix4(_m).y;
  }
}

/**
 * Angle (autour de l'axe x du chien, sens de turn) dont tourner un os de tête c pour amener le point q à la hauteur y
 * (repère du chien) : le plus petit en valeur absolue, borné à max. (Le sens dépend de la place du point : derrière
 * l'articulation, tourner vers le haut le relève ; devant elle — queue rabattue sous le chien assis —, il l'enfonce.)
 */
function raiseAngle(c, q, y, max) {
  const dy = q.y - c.y;
  const dz = q.z - c.z;
  const R = Math.hypot(dy, dz);
  if (R < 1e-4) return 0;
  const phi = Math.atan2(dz, dy);
  const t = clamp((y - c.y) / R, -1, 1);
  const a = Math.acos(t);
  // y(θ) = R cos(φ + θ) : θ = ±a − φ, ramené dans ]−π, π]
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  const t1 = wrap(a - phi);
  const t2 = wrap(-a - phi);
  const th = Math.abs(t1) < Math.abs(t2) ? t1 : t2;
  return clamp(th, -max, max);
}

const AXIS_Y = V(0, 1, 0);
const AX = V(1, 0, 0); // (tourner autour de x du chien, positif : vers le bas pour une tête qui regarde devant)
const JAW_CLOSED = -0.12;
/** Coupe de la race quand le salon n'en a pas fait (Groomer.refreshCutVisuals : setCut(null)). */
const DEFAULT_CUT = { caniche: 'caniche' }; // (gueule du shiba fermée : angle de la mâchoire depuis la pose de repos du GLB, rad)
const AZ = V(0, 0, 1);
const _ax = V();
const _q2v = V();

/**
 * Port de la queue de la race : rotation locale de chaque os de la queue. Shiba : la queue enroulée de son clip
 * d'origine (pose_tail) pour 'curl', sinon une courbe calculée (pendante, en faucille, dressée) ; jack : sa queue
 * dressée d'origine, ou une courbe.
 */
function tailCarriage(model, base, B) {
  const tb = model.tailBones;
  const n = tb.length;
  const rest = tb.map((b) => b.userData.restQ.clone());
  if (!n) return rest;
  const want = B.tail;
  if (base.kind === 'shiba' && want === 'curl' && base.tailPose) return tb.map((b, i) => base.tailPose[b.name]?.clone() ?? rest[i]);
  if (base.kind === 'jack' && (want === 'carrot' || want === 'stub')) return rest;
  // Direction de repos de la queue dans le repère du chien, puis courbe voulue : angle sous l'horizontale à la base,
  // courbure le long de la queue (positive : le bout remonte).
  const shapes = {
    sabre: [0.9, -0.35], otter: [1.05, -0.12], plume: [0.85, -0.25], whip: [1.25, -0.18], sickle: [-0.6, 0.55],
    carrot: [-1.0, 0.15], stub: [-0.2, 0], curl: [-1.1, 0.9],
    // (tire-bouchon serré sur la hanche : carlin ; panache couché à plat sur le dos : spitz nain ; drapeau à
    // l'horizontale : setter ; droite dans l'axe du dos : cocker)
    screw: [-1.9, 4.6], flat: [-2.25, -0.7], flag: [0.25, -0.15], level: [0.1, 0.05],
  };
  const [a0, curve] = shapes[want] ?? shapes.sabre;
  // Le premier os : on le tourne pour que la queue parte à a0 sous l'horizontale vers l'arrière ; les suivants se
  // courbent de curve / n chacun, autour de l'axe x du chien (dans le repère de leur parent).
  const out = rest.map((q) => q.clone());
  model.root.updateMatrixWorld(true);
  const w0 = tb[0].getWorldPosition(V());
  const wEnd = (tb[n - 1].children.find((c) => c.isBone) ?? tb[n - 1]).getWorldPosition(V());
  const dir = (n > 1 ? tb[1].getWorldPosition(V()) : wEnd).sub(w0).normalize();
  const cur = Math.atan2(-dir.y, -dir.z); // angle sous l'horizontale (vers l'arrière)
  const pq = tb[0].parent.getWorldQuaternion(new THREE.Quaternion());
  const axisLocal = V(1, 0, 0).applyQuaternion(pq.clone().invert());
  out[0] = new THREE.Quaternion().setFromAxisAngle(axisLocal, -(a0 - cur)).multiply(rest[0]);
  for (let i = 1; i < n; i++) {
    const pw = tb[i].parent.getWorldQuaternion(new THREE.Quaternion());
    const ax = V(1, 0, 0).applyQuaternion(pw.invert());
    out[i] = new THREE.Quaternion().setFromAxisAngle(ax, -curve / Math.max(1, n - 1) * (base.kind === 'shiba' ? 1.6 : 1)).multiply(rest[i]);
  }
  return out;
}

// ------------------------------------------------------------------ entité du jeu

const _wv = V();

/**
 * Poses imposées par les activités (src/game/Activities.js, après l'animation) : 'sit', 'down', 'paw', 'roll',
 * 'jump' (phase t), 'bow'. s : 0 → 1 (amplitude). Le chien réaliste joue le clip correspondant (tenu au temps voulu) à
 * l'image suivante. Renvoie true si le modèle est le chien réaliste (sinon l'activité garde sa pose habituelle).
 */
export function realDogPose(md, kind, s, sg = null, t = null) {
  if (!md?.realDog) return false;
  const a = md.anim;
  const map = { sit: 'sit', down: 'lie', paw: 'paw', roll: 'rollover', jump: 'jump', bow: 'bow', heel: 'sit' };
  const clip = map[kind];
  if (!clip) return true;
  let time;
  if (kind === 'roll') time = Math.min(1, Math.max(0, s)) * 0.22;
  else if (kind === 'jump') time = t ?? 0.5;
  else if (kind === 'paw') time = 0.15 + 0.3 * Math.min(1, s);
  a.trick = { clip, w: kind === 'jump' || kind === 'roll' ? 1 : Math.min(1, s * 1.5), time, age: 0 };
  if (sg && kind !== 'jump') {
    sg.rotation.x = 0;
    sg.rotation.z = 0;
  }
  return true;
}

/**
 * Animation d'une entité (AnimalEntity) au chien réaliste : ce qu'il fait (allure selon sa vitesse, assis, couché,
 * endormi, renifler, manger, boire, jouer, tirer en laisse, conduire le troupeau) ; renseigne e.gait et e.phase.
 */
export function animateRealDog(e, dt, sad) {
  const md = e.model;
  const anim = md.anim;
  // Version réduite au loin.
  if (horseView.on && md.setLod && !md.lodHold) {
    const far = gfx.quality === 'high' ? DOG_LOD_DIST.high : DOG_LOD_DIST.low;
    const d = _wv.setFromMatrixPosition(e.root.matrixWorld).distanceTo(horseView.eye) / Math.max(0.25, e.scale);
    md.setLod(d > far * (md.lodLevel ? 0.9 : 1) ? 1 : 0);
  }
  // Hors du champ et livré à lui-même : animé une image sur OFFSCREEN_STEP avec le temps cumulé.
  if (anim.frame !== horseView.frame) {
    anim.frame = horseView.frame;
    anim.seenNow = false;
  }
  if (anim.seen) {
    anim.seenNow = true;
    anim.seen = false;
  }
  const d = e.data;
  if (!anim.seenNow && !e.scripted && !e.herdCtrl && !e.posing && !d.following && !d.leashed && horseView.on) {
    anim.skipDt += dt;
    if (++anim.skipN < OFFSCREEN_STEP) return;
    dt = anim.skipDt;
  } else {
    dt += anim.skipDt;
  }
  anim.skipDt = 0;
  anim.skipN = 0;
  const st = (e.dogSt ??= {});
  const v = e.speed / Math.max(0.25, e.scale);
  st.v = v;
  st.moving = e.speed > 0.06 && !e.sleeping && e.perch?.phase !== 'on';
  st.sleeping = !!e.sleeping;
  st.sad = sad;
  st.quick = !!e.posing;
  // Posture : endormi, couché sur commande, assis (au pied quand le maître s'arrête, sur la table du salon, au repos).
  e.restSeed ??= (e.data.id?.charCodeAt?.(0) ?? 7) * 1.37;
  const t = e.time;
  const idle = e.state === 'idle' && !e.herdCtrl && !e.scripted && !d.following;
  const restSit = idle && Math.sin(t * 0.11 + e.restSeed) > 0.55;
  const restLie = idle && Math.sin(t * 0.07 + e.restSeed * 1.7) > 0.75;
  let posture = 'stand';
  if (e.sleeping) posture = 'sleep';
  else if (e.posing === 'down') posture = 'lie';
  else if (e.posing === 'sit' || e.onTable) posture = 'sit';
  else if (d.following && !st.moving && e.atHeel) posture = 'sit';
  else if (restLie) posture = 'lie';
  else if (restSit) posture = 'sit';
  st.posture = posture;
  // Action : manger ou boire (selon l'équipement), renifler (promenade, au repos), frétiller (jeu, content).
  let action = null;
  if (e.state === 'eat') action = e.goal?.eq?.type === 'petFountain' || e.goal?.need === 'thirst' ? 'drink' : 'eat';
  else if (e.sniffing && !st.moving) action = 'sniff';
  else if (idle && Math.sin(t * 0.19 + e.restSeed * 0.7) > 0.8) action = 'sniff';
  else if (e.state === 'play') action = 'wag';
  st.action = action;
  // (happyFor : secondes de contentement données par un tour réussi, le « sourire » du spectacle)
  if (e.happyFor > 0) e.happyFor = Math.max(0, e.happyFor - dt);
  st.happy = e.state === 'play' ? 1 : sad ? 0 : (e.happyFor ?? 0) > 0 ? 1 : 0.25;
  st.pull = e.leashPull ?? 0;
  // (chien de troupeau au travail : seulement lui, pas le chien d'un client qui rejoint son maître)
  st.herd = d.role === 'herder' && !!e.herdCtrl?.pusher;
  st.hot = (e.panting ?? 0) > 0;
  st.fat = 1 + ((d.weight ?? 50) - 50) / 50 * 0.6;
  st.wet = e.wetAmt ?? 0;
  st.look = e.lookAt ?? null;
  anim.update(dt, st);
  e.gait = anim.gait === 'run' ? 2 : anim.gait === 'trot' ? 1 : 0;
  e.headDown = action === 'eat' || action === 'drink' || action === 'sniff' ? 1 : 0;
}
