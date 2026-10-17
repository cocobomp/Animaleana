// Allures du cheval (logique pure, testée dans tests/horseGait.test.js). Pour chaque membre : où est le
// sabot au cours de la foulée (en appui, posé au sol et immobile pendant que le corps avance ; en
// soutien, levé puis ramené vers l'avant), hauteur et tangage du corps pour que les sabots visés soient
// atteignables, puis cinématique inverse à deux os (épaule ou hanche → genou ou jarret → sabot) qui
// donne les angles des membres. Utilisé par src/game/AnimalEntity.js (animateHorse).
// Plan d'un membre : (z vers l'avant, y vers le haut). Membres : 0 antérieur gauche, 1 antérieur droit,
// 2 postérieur gauche, 3 postérieur droit.

// touchdown : moment où chaque sabot se pose (fraction de la foulée) ; duty : part de la foulée en
// appui ; lift : hauteur du sabot pendant le soutien (fraction de la hauteur de l'épaule).
export const GAITS = {
  // Pas : quatre temps, postérieur gauche, antérieur gauche, postérieur droit, antérieur droit.
  walk: { touchdown: [0.25, 0.75, 0, 0.5], duty: 0.6, lift: [0.1, 0.1, 0.07, 0.07] },
  // Trot : deux temps en diagonale, avec un court temps de suspension.
  trot: { touchdown: [0, 0.5, 0.5, 0], duty: 0.39, lift: [0.17, 0.17, 0.12, 0.12] },
  // Galop à gauche : postérieur droit, puis la diagonale postérieur gauche + antérieur droit, puis
  // l'antérieur gauche (le pied directeur), puis la suspension.
  gallop: { touchdown: [0.38, 0.2, 0.2, 0], duty: 0.4, lift: [0.24, 0.24, 0.17, 0.17] },
};

/** Longueur de foulée (distance parcourue par cycle) ; H : hauteur de l'épaule du modèle (pivot de l'antérieur). */
export function gaitStride(gait, v, H) {
  if (gait === 'walk') return H * 1.3;
  if (gait === 'trot') return H * 1.95;
  return H * Math.max(2.4, 0.34 * v + 0.55); // le galop s'allonge avec la vitesse
}

/** Part de la foulée en appui (plus courte au grand galop). */
export function gaitDuty(gait, v) {
  if (gait === 'gallop') return Math.min(0.4, Math.max(0.26, 0.4 - 0.035 * (v - 5.5)));
  return GAITS[gait].duty;
}

/**
 * Sabot d'un membre pour une allure : décalage z (avance par rapport à sa place au repos), hauteur y,
 * et s'il est en appui. cyc : position dans la foulée (en tours) ; S : longueur de l'appui. out :
 * objet réutilisé (pas d'allocation à chaque image).
 */
export function hoofOffset(gait, leg, cyc, S, lift, duty = GAITS[gait].duty, out = {}) {
  let psi = cyc - GAITS[gait].touchdown[leg];
  psi -= Math.floor(psi);
  if (psi < duty) {
    out.z = S / 2 - (psi / duty) * S;
    out.y = 0;
    out.stance = true;
    return out;
  }
  const s = (psi - duty) / (1 - duty);
  const front = leg < 2;
  // Retour vers l'avant (courbe d'Hermite) : au départ et à l'arrivée, le sabot recule à la vitesse du
  // corps, comme pendant l'appui (il se pose sans glisser) ; l'antérieur monte plus vite (genou replié).
  const k = (1 - duty) / duty;
  const e = (-2 - 2 * k) * s ** 3 + (3 + 3 * k) * s * s - k * s;
  out.z = -S / 2 + S * e;
  out.y = lift * Math.sin(Math.PI * s ** (front ? 0.78 : 0.9));
  out.stance = false;
  return out;
}

/**
 * Données de repos d'un membre (repère du corps) : pivot (épaule ou hanche), genou (ou jarret), point
 * d'appui du sabot. bend : -1 si le genou plie vers l'arrière (antérieur), +1 si le jarret plie vers
 * l'avant (postérieur). reach : part de l'extension complète permise en appui.
 */
export function legRig(pivot, knee, hoof, bend, reach = 0.9995) {
  const u0 = { y: knee.y - pivot.y, z: knee.z - pivot.z };
  const l0 = { y: hoof.y - knee.y, z: hoof.z - knee.z };
  const L1 = Math.hypot(u0.y, u0.z);
  const L2 = Math.hypot(l0.y, l0.z);
  const fu0 = Math.atan2(u0.y, u0.z);
  const fl0 = Math.atan2(l0.y, l0.z);
  const d0 = Math.hypot(hoof.y - pivot.y, hoof.z - pivot.z);
  const dmax = L1 + L2;
  // Postérieur : le jarret ne se tend jamais complètement.
  const dlim = bend > 0 ? d0 + (dmax - d0) * 0.35 : dmax * reach;
  return { pivot: { y: pivot.y, z: pivot.z }, hoof: { y: hoof.y, z: hoof.z }, L1, L2, fu0, fl0, b0: fl0 - fu0, bend, d0, dlim };
}

/**
 * Cinématique inverse à deux os : P (pivot) et T (sabot visé), dans le même repère. Renvoie a (rotation
 * x du pivot dans ce repère), b (rotation x du genou par rapport au pivot) et le sabot atteint (out :
 * objet réutilisé).
 */
export function legIK(rig, P, T, out = { hoof: {} }) {
  const { L1, L2, bend } = rig;
  const dz = T.z - P.z;
  const dy = T.y - P.y;
  const d = Math.min(rig.dlim, Math.max(Math.abs(L1 - L2) + 1e-4, Math.hypot(dz, dy)));
  const c = Math.min(1, Math.max(-1, (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2)));
  const beta = bend * Math.acos(c);
  const alpha = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const fD = Math.atan2(dy, dz);
  const fu = bend > 0 ? fD - alpha : fD + alpha;
  const fl = fu + beta;
  out.a = rig.fu0 - fu;
  out.b = rig.b0 - beta;
  out.hoof.z = P.z + L1 * Math.cos(fu) + L2 * Math.cos(fl);
  out.hoof.y = P.y + L1 * Math.sin(fu) + L2 * Math.sin(fl);
  return out;
}

/** Position d'un pivot (repère du corps au repos) une fois le corps monté de by et penché de pitch. */
export function pivotAt(rig, slide, by, pitch, out = {}) {
  const y = rig.pivot.y;
  const z = rig.pivot.z + slide;
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  out.y = y * c - z * s + by;
  out.z = y * s + z * c;
  return out;
}

const _P = [{}, {}, {}, {}];
const _room = new Float64Array(4);

/** Marge de chaque membre (de combien le corps peut monter) pour un tangage donné ; renvoie z avant − z arrière. */
function roomAt(rigs, targets, slide, pitch) {
  for (let i = 0; i < 4; i++) {
    const P = pivotAt(rigs[i], slide[i], 0, pitch, _P[i]);
    const dz = targets[i].z - P.z;
    _room[i] = targets[i].y + Math.sqrt(Math.max(0, rigs[i].dlim * rigs[i].dlim - dz * dz)) - P.y;
  }
  return (_P[0].z + _P[1].z) / 2 - (_P[2].z + _P[3].z) / 2;
}

/**
 * Hauteur (by) et tangage (pitch, rotation x : positif = avant plus bas) du corps pour que chaque sabot
 * visé reste atteignable. targets[i] : { y, z } du sabot ; slide[i] : avance du pivot (épaule qui
 * glisse avec la jambe) ; cap : hauteur maximale au-dessus du repos.
 */
export function bodyPose(rigs, targets, slide, cap = 0, out = {}) {
  let pitch = 0;
  // Quelques passes : le tangage avance ou recule aussi les épaules et les hanches.
  for (let it = 0; it < 3; it++) {
    const span = roomAt(rigs, targets, slide, pitch);
    const df = Math.min(cap, _room[0], _room[1]);
    const dh = Math.min(cap, _room[2], _room[3]);
    pitch += Math.max(-0.08, Math.min(0.08, (dh - df) / span));
  }
  pitch = Math.max(-0.22, Math.min(0.22, pitch));
  // Hauteur : tous les sabots visés restent atteignables.
  roomAt(rigs, targets, slide, pitch);
  out.by = Math.min(cap, _room[0], _room[1], _room[2], _room[3]);
  out.pitch = pitch;
  return out;
}

const GAIT_NAMES = ['walk', 'trot', 'gallop'];
const _off = {};

/** Résultat réutilisable de gaitFrame (un par cheval : pas d'allocation à chaque image). */
export function makeGaitFrame() {
  return {
    by: 0,
    pitch: 0,
    slide: [0, 0, 0, 0],
    targets: [0, 1, 2, 3].map(() => ({ y: 0, z: 0 })),
    legs: [0, 1, 2, 3].map(() => ({ a: 0, b: 0, slide: 0, lift: 0, hoof: { y: 0, z: 0 }, target: null, P: {} })),
  };
}

/**
 * Une image de la foulée : pour chaque membre, sabot visé (appui au sol, soutien levé), glissement de
 * l'épaule, puis pose du corps et angles. w : poids des allures { walk, trot, gallop } (somme 1) ;
 * cyc : position dans la foulée (tours) ; stride : longueur de foulée ; v : vitesse ; H : hauteur de
 * l'épaule (échelle des levers de sabot) ; move : 0 à l'arrêt, 1 en marche ; out : makeGaitFrame().
 */
export function gaitFrame(rigs, w, cyc, stride, v, H, move = 1, out = makeGaitFrame()) {
  const { targets, slide } = out;
  // (au grand galop, l'appui ne dépasse pas ce que la jambe peut couvrir : le sabot glisse un peu)
  const Smax = 1.0 * H;
  for (let i = 0; i < 4; i++) {
    let z = 0;
    let y = 0;
    for (const g of GAIT_NAMES) {
      if (!(w[g] > 0)) continue;
      const duty = gaitDuty(g, v);
      hoofOffset(g, i, cyc, Math.min(Smax, duty * stride), GAITS[g].lift[i] * H, duty, _off);
      z += _off.z * w[g];
      y += _off.y * w[g];
    }
    z *= move;
    y *= move;
    // L'épaule (et un peu la hanche) suit la jambe : moins d'angle, le dos monte et descend moins.
    slide[i] = z * ((i < 2 ? 0.34 : 0.24) + 0.1 * (w.gallop ?? 0));
    targets[i].z = rigs[i].hoof.z + z;
    targets[i].y = rigs[i].hoof.y + y;
  }
  bodyPose(rigs, targets, slide, 0.015 * move, out);
  for (let i = 0; i < 4; i++) {
    const l = out.legs[i];
    const P = pivotAt(rigs[i], slide[i], out.by, out.pitch, l.P);
    legIK(rigs[i], P, targets[i], l);
    l.a -= out.pitch;
    l.slide = slide[i];
    l.target = targets[i];
    l.lift = targets[i].y - rigs[i].hoof.y; // hauteur du sabot visé au-dessus du sol
  }
  return out;
}
