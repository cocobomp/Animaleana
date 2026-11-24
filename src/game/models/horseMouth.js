// La bouche du cheval réaliste qui s'ouvre (brider : il ouvre la bouche pour prendre le mors ; il mâchonne).
//
// Le maillage du GLB a une vraie fente de bouche (les lèvres, et l'intérieur de la bouche derrière), mais pas d'os de
// mâchoire. On ajoute au pelage une forme (morph target) : la lèvre du bas et le menton tournent vers le bas autour du
// coin des lèvres, de plus en plus vers l'avant (le coin reste fermé, comme une vraie bouche). Toutes les races et
// tous les âges ont le même maillage, mis à l'échelle : les repères sont donnés dans le repère de la tête, en parts de
// la longueur de la tête (snoutZ), et valent pour tous (Shetland, Falabella, poulain…).
//
// La forme est posée sur une COPIE de la géométrie du pelage, pour ce cheval-là seulement (la géométrie de la race
// est partagée par tous les chevaux du monde : eux ne paient rien). dispose() remet la géométrie d'origine.

import * as THREE from 'three';

/**
 * La fente de la bouche vue de côté : [z, y] en parts de la longueur de la tête (repère de la tête : z vers le bout du
 * nez, y vers le haut). Sous cette ligne : la lèvre du bas, le menton et le bas de la bouche (ce qui s'ouvre). Le coin
 * des lèvres est vers z = 0,72 ; devant, la lèvre du haut descend un peu devant celle du bas (la ligne plonge).
 */
export const MOUTH_LINE = [[0.7, -0.06], [0.76, -0.047], [0.8, -0.034], [0.9, -0.024], [0.95, -0.027], [0.965, -0.032], [0.985, -0.08]];
/** Le coin des lèvres, autour duquel le bas s'ouvre (repère de la tête, parts de la longueur de la tête). */
export const MOUTH_HINGE = [0, -0.05, 0.7];
/** De quoi à quoi (z) l'ouverture grandit : rien au coin, tout devant. */
export const MOUTH_RAMP = [0.7, 0.8];
/** L'angle (rad) de la bouche grande ouverte (influence 1). */
export const MOUTH_ANGLE = 0.36;
const BAND = 0.004; // (épaisseur du passage entre le haut et le bas, autour de la ligne)

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** La hauteur de la fente à cette place (z) le long de la tête. */
export function mouthLineY(z) {
  const L = MOUTH_LINE;
  if (z <= L[0][0]) return L[0][1];
  for (let i = 1; i < L.length; i++) {
    if (z <= L[i][0]) {
      const [z0, y0] = L[i - 1];
      const [z1, y1] = L[i];
      return y0 + ((y1 - y0) * (z - z0)) / (z1 - z0);
    }
  }
  return L[L.length - 1][1];
}

/** Combien ce point (repère de la tête, parts de la longueur) s'ouvre avec la mâchoire (0 à 1). */
export function jawWeight(z, y) {
  return smooth(MOUTH_RAMP[0], MOUTH_RAMP[1], z) * smooth(BAND, -BAND, y - mouthLineY(z));
}

/** Le repère de la tête du squelette au repos, dans le repère de la géométrie (liaison). */
function headRest(mesh, model) {
  const sk = mesh.skeleton;
  const i = sk?.bones.findIndex((b) => b.name === 'Head') ?? -1;
  if (i < 0) return null;
  const bone = sk.bones[i];
  // (l'os est posé dans le groupe de la tête de model : repère de liaison de l'os × inverse de sa place dans le
  // groupe = le groupe de la tête au repos ; z le long du chanfrein, comme model.dims)
  const m = sk.boneInverses[i].clone().invert().multiply(bone.matrix.clone().invert());
  const bind = mesh.bindMatrix ?? new THREE.Matrix4();
  return { index: i, rest: m.premultiply(new THREE.Matrix4().copy(bind).invert()) };
}

const _cache = new WeakMap();
/**
 * Les déplacements de la forme « bouche ouverte » (position et normale) pour la géométrie de ce pelage : calculés une
 * fois par géométrie (race), gardés. Renvoie { pos, nrm, count } ou null.
 */
export function mouthMorphData(model) {
  const mesh = model?.coatMesh;
  const src = mesh?.geometry;
  const snout = model?.dims?.snoutZ;
  if (!mesh?.isSkinnedMesh || !src?.attributes?.position || !snout) return null;
  const hit = _cache.get(src);
  if (hit) return hit;
  const H = headRest(mesh, model);
  if (!H) return null;
  const inv = H.rest.clone().invert();
  const P = src.attributes.position;
  const N = src.attributes.normal;
  const si = src.attributes.skinIndex;
  const sw = src.attributes.skinWeight;
  const n = P.count;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  const q = new THREE.Vector3();
  const nv = new THREE.Vector3();
  const hinge = new THREE.Vector3(...MOUTH_HINGE).multiplyScalar(snout);
  const restQ = new THREE.Quaternion().setFromRotationMatrix(H.rest);
  const restQi = restQ.clone().invert();
  const rot = new THREE.Quaternion();
  const X = new THREE.Vector3(1, 0, 0);
  let moved = 0;
  for (let i = 0; i < n; i++) {
    // (seule la peau de la tête : jamais l'encolure)
    let wh = 0;
    for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === H.index) wh += sw.getComponent(i, k);
    if (wh < 0.5) continue;
    v.fromBufferAttribute(P, i).applyMatrix4(inv);
    const w = jawWeight(v.z / snout, v.y / snout) * smooth(0.5, 0.9, wh);
    if (w <= 0) continue;
    moved++;
    rot.setFromAxisAngle(X, MOUTH_ANGLE * w);
    q.copy(v).sub(hinge).applyQuaternion(rot).add(hinge).applyMatrix4(H.rest);
    v.applyMatrix4(H.rest);
    pos[i * 3] = q.x - v.x;
    pos[i * 3 + 1] = q.y - v.y;
    pos[i * 3 + 2] = q.z - v.z;
    if (N) {
      nv.fromBufferAttribute(N, i);
      q.copy(nv).applyQuaternion(restQi).applyQuaternion(rot).applyQuaternion(restQ);
      nrm[i * 3] = q.x - nv.x;
      nrm[i * 3 + 1] = q.y - nv.y;
      nrm[i * 3 + 2] = q.z - nv.z;
    }
  }
  const out = { pos, nrm, count: n, moved };
  _cache.set(src, out);
  return out;
}

/**
 * Une bouche qui s'ouvre pour ce cheval (model : buildRealHorseModel). Renvoie { set(k) (0 fermée, 1 ouverte), get k,
 * dispose() } ou null (pas un cheval réaliste, pas de pelage).
 */
export function mouthOpener(model) {
  const data = mouthMorphData(model);
  if (!data || !data.moved) return null;
  const mesh = model.coatMesh;
  const src = mesh.geometry;
  // (copie à ce cheval : la géométrie de la race est partagée par tous les chevaux du monde)
  const geo = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) geo.setAttribute(name, attr.clone());
  if (src.index) geo.setIndex(src.index.clone());
  for (const g of src.groups) geo.addGroup(g.start, g.count, g.materialIndex);
  geo.morphAttributes.position = [new THREE.BufferAttribute(data.pos, 3)];
  if (src.attributes.normal) geo.morphAttributes.normal = [new THREE.BufferAttribute(data.nrm, 3)];
  geo.morphTargetsRelative = true;
  geo.name = 'coat-mouth';
  mesh.geometry = geo;
  mesh.updateMorphTargets();
  mesh.morphTargetInfluences[0] = 0;
  let k = 0;
  return {
    geometry: geo,
    get k() {
      return k;
    },
    set(x) {
      k = Math.min(1, Math.max(0, x));
      if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[0] = k;
    },
    dispose() {
      if (mesh.geometry === geo) {
        mesh.geometry = src;
        mesh.morphTargetInfluences = undefined;
        mesh.morphTargetDictionary = undefined;
        mesh.updateMorphTargets();
      }
      geo.dispose();
    },
  };
}
