// Équipement sur le cheval GLB (public/models/horse.glb) : la selle, le filet, la couverture… du
// catalogue de la sellerie sont posés par src/game/gearModels.js (buildHorseGear) sur une surface
// « sculptée » (champ de distance). Le cheval GLB n'en a pas : on lui en donne une, approchée par des
// coupes mesurées une fois sur le modèle au repos (rayons lancés de l'extérieur vers l'axe du corps
// ou de la tête). Si le modèle GLB change, il faut refaire ces mesures.
//
// Coupes : pour chaque position le long de l'axe, le rayon de la surface tous les 15°, de -90° (dessous)
// à +90° (dessus), du côté +x (le cheval est symétrique).

import * as THREE from 'three';

const STEP = Math.PI / 12; // 15°

/** Tronc, repère du modèle (m) : [z, centre y, rayons -90°…+90°]. Le haut, vers z = 0,4…0,7, monte dans l'encolure. */
const TORSO = [
  [-0.9, 1.228, [0.326, 0.317, 0.4, 0.42, 0.436, 0.396, 0.383, 0.363, 0.362, 0.328, 0.307, 0.305, 0.326]],
  [-0.8, 1.259, [0.356, 0.346, 0.4, 0.42, 0.422, 0.383, 0.357, 0.338, 0.343, 0.339, 0.338, 0.335, 0.356]],
  [-0.7, 1.274, [0.34, 0.339, 0.39, 0.41, 0.408, 0.368, 0.337, 0.319, 0.323, 0.328, 0.317, 0.32, 0.34]],
  [-0.6, 1.288, [0.323, 0.323, 0.346, 0.38, 0.38, 0.352, 0.316, 0.256, 0.268, 0.302, 0.295, 0.298, 0.323]],
  [-0.5, 1.247, [0.311, 0.312, 0.333, 0.313, 0.268, 0.249, 0.24, 0.241, 0.26, 0.288, 0.295, 0.298, 0.311]],
  [-0.4, 1.191, [0.309, 0.306, 0.317, 0.308, 0.263, 0.244, 0.244, 0.249, 0.255, 0.279, 0.306, 0.297, 0.309]],
  [-0.3, 1.164, [0.322, 0.311, 0.322, 0.307, 0.262, 0.244, 0.242, 0.25, 0.256, 0.281, 0.317, 0.308, 0.322]],
  [-0.2, 1.153, [0.331, 0.32, 0.332, 0.308, 0.263, 0.244, 0.242, 0.254, 0.26, 0.284, 0.324, 0.314, 0.331]],
  [-0.1, 1.143, [0.341, 0.33, 0.341, 0.309, 0.263, 0.244, 0.242, 0.258, 0.264, 0.284, 0.33, 0.323, 0.341]],
  [0, 1.133, [0.351, 0.339, 0.351, 0.31, 0.264, 0.244, 0.243, 0.259, 0.265, 0.284, 0.331, 0.332, 0.351]],
  [0.1, 1.158, [0.36, 0.354, 0.366, 0.327, 0.282, 0.261, 0.259, 0.27, 0.284, 0.31, 0.357, 0.344, 0.36]],
  [0.2, 1.185, [0.367, 0.366, 0.384, 0.336, 0.295, 0.277, 0.275, 0.278, 0.293, 0.333, 0.373, 0.356, 0.367]],
  [0.3, 1.216, [0.37, 0.379, 0.39, 0.35, 0.308, 0.289, 0.291, 0.285, 0.3, 0.341, 0.385, 0.367, 0.37]],
  [0.4, 1.299, [0.429, 0.42, 0.42, 0.38, 0.33, 0.309, 0.281, 0.279, 0.297, 0.337, 0.374, 0.354, 0.429]],
  [0.5, 1.351, [0.461, 0.44, 0.43, 0.39, 0.34, 0.295, 0.273, 0.271, 0.289, 0.333, 0.4, 0.377, 0.461]],
  [0.6, 1.397, [0.487, 0.45, 0.369, 0.304, 0.274, 0.266, 0.248, 0.243, 0.255, 0.29, 0.364, 0.396, 0.487]],
  [0.7, 1.514, [0.442, 0.398, 0.297, 0.233, 0.203, 0.191, 0.193, 0.19, 0.2, 0.227, 0.284, 0.346, 0.442]],
];

/**
 * Tête : repère incliné de HEAD.tilt (rad) autour de x, origine HEAD.o (repère du modèle) ; z le long du
 * chanfrein vers le nez, y vers le front. Coupes [z, rayons -90°…+90°] (centre sur l'axe), oreilles lissées.
 */
const HEAD = { o: [0, 1.86, 0.92], tilt: 0.56, tip: 0.555 };
const HEAD_RINGS = [
  [-0.1, [0.12, 0.12, 0.13, 0.14, 0.145, 0.13, 0.124, 0.125, 0.13, 0.15, 0.17, 0.18, 0.19]],
  [-0.05, [0.13, 0.13, 0.14, 0.15, 0.159, 0.139, 0.132, 0.133, 0.145, 0.17, 0.18, 0.19, 0.2]],
  [0, [0.14, 0.14, 0.15, 0.16, 0.166, 0.145, 0.137, 0.138, 0.147, 0.17, 0.2, 0.21, 0.22]],
  [0.05, [0.15, 0.15, 0.15, 0.15, 0.147, 0.141, 0.147, 0.148, 0.159, 0.189, 0.21, 0.215, 0.213]],
  [0.1, [0.16, 0.16, 0.159, 0.157, 0.145, 0.146, 0.157, 0.164, 0.176, 0.186, 0.194, 0.198, 0.193]],
  [0.15, [0.171, 0.165, 0.166, 0.178, 0.167, 0.163, 0.169, 0.164, 0.162, 0.172, 0.174, 0.178, 0.173]],
  [0.2, [0.165, 0.159, 0.165, 0.183, 0.185, 0.161, 0.151, 0.149, 0.148, 0.157, 0.154, 0.157, 0.154]],
  [0.25, [0.149, 0.141, 0.145, 0.16, 0.164, 0.139, 0.137, 0.132, 0.135, 0.143, 0.134, 0.13, 0.134]],
  [0.3, [0.122, 0.115, 0.117, 0.128, 0.136, 0.126, 0.12, 0.115, 0.119, 0.126, 0.114, 0.11, 0.115]],
  [0.35, [0.104, 0.099, 0.101, 0.112, 0.122, 0.113, 0.102, 0.098, 0.102, 0.109, 0.099, 0.096, 0.101]],
  [0.4, [0.093, 0.088, 0.089, 0.098, 0.108, 0.094, 0.084, 0.086, 0.095, 0.094, 0.088, 0.086, 0.09]],
  [0.45, [0.082, 0.077, 0.079, 0.086, 0.093, 0.083, 0.079, 0.081, 0.089, 0.079, 0.075, 0.076, 0.079]],
  [0.5, [0.089, 0.091, 0.099, 0.099, 0.088, 0.079, 0.075, 0.076, 0.072, 0.064, 0.061, 0.062, 0.068]],
];

/** Pattes : os du bas de la jambe, centre de la patte (repère du modèle) là où commence la guêtre. */
const KNEES = [
  ['FrontLowLegL', [0.28, 0.505, 0.444]], ['FrontLowLegR', [-0.28, 0.505, 0.444]],
  ['BackLowLegL', [0.245, 0.42, -1.03]], ['BackLowLegR', [-0.245, 0.42, -1.03]],
];

/** Rayon interpolé d'une coupe (angle a entre -π/2 et π/2). */
function ringAt(r, a) {
  const f = Math.min(r.length - 1.001, Math.max(0, (a + Math.PI / 2) / STEP));
  const i = Math.floor(f);
  return r[i] + (r[i + 1] - r[i]) * (f - i);
}

/**
 * Champ de distance (approché) d'une forme décrite par des coupes le long de z.
 * rings : [[z, yc, rayons]] ; z0 / z1 : bouts fermés un peu au-delà de la première / dernière coupe.
 */
function sectionSdf(rings, z0, z1) {
  const n = rings.length;
  const za = rings[0][0];
  const dz = rings[1][0] - za;
  return (x, y, z) => {
    const f = Math.min(n - 1.001, Math.max(0, (z - za) / dz));
    const i = Math.floor(f);
    const k = f - i;
    const A = rings[i];
    const B = rings[i + 1];
    const yc = A[1] + (B[1] - A[1]) * k;
    const dy = y - yc;
    const ax = Math.abs(x);
    const a = Math.atan2(dy, ax);
    const r = ringAt(A[2], a) * (1 - k) + ringAt(B[2], a) * k;
    return Math.max(Math.hypot(ax, dy) - r, z - z1, z0 - z);
  };
}

export const torsoSdf = sectionSdf(TORSO, -0.95, 0.75);
export const headSdf = sectionSdf(HEAD_RINGS.map(([z, r]) => [z, 0, r]), -0.16, HEAD.tip);

/** Hauteur du dos (repère du modèle) au niveau z. */
export function backTopAt(z) {
  const n = TORSO.length;
  const f = Math.min(n - 1.001, Math.max(0, (z - TORSO[0][0]) / 0.1));
  const i = Math.floor(f);
  const k = f - i;
  const top = (row) => row[1] + row[2][row[2].length - 1];
  return top(TORSO[i]) * (1 - k) + top(TORSO[i + 1]) * k;
}

/**
 * Ce qu'il faut à buildHorseGear (src/game/gearModels.js) pour habiller le cheval GLB :
 * surfaces (sdf), cotes (dims), points d'accroche (corps, tête inclinée, genoux) et hauteur du dos.
 * anchor(bone, root, origin) : groupe qui suit l'os ; findBone(name) : l'os du squelette.
 */
export function horseGearFit(model, anchor, findBone, root) {
  // Repère de la tête : sous l'ancre de la tête, à l'origine HEAD.o, z le long du chanfrein.
  // (appelé pendant la construction : root est encore à l'identité, repère monde = repère du modèle ;
  // l'ancre de la tête a l'orientation du modèle au repos, seule son origine diffère.)
  root.updateMatrixWorld(true);
  const headFrame = new THREE.Group();
  headFrame.position.set(...HEAD.o).applyMatrix4(model.head.matrixWorld.clone().invert());
  headFrame.rotation.x = HEAD.tilt;
  model.head.add(headFrame);
  const legs = KNEES.map(([bone, p], i) => {
    const b = findBone(bone);
    const knee = b ? anchor(b, root, new THREE.Vector3(...p)) : model.legs[i]?.pivot;
    return { pivot: knee, knee, front: i < 2, side: p[0] > 0 ? 1 : -1 };
  });
  return {
    body: model.body,
    head: headFrame,
    y0: 1.2,
    legTop: 1.0,
    legs,
    sdf: { torso: torsoSdf, head: headSdf },
    dims: { L: 1.5, R: 0.3, hr: 0.12, legR: 0.058, snoutZ: HEAD.tip, earZ: 0, headBack: -0.1 },
    backTop: backTopAt,
  };
}
