// Animation « vivante » des personnages, par-dessus la marche (animateAvatarWalk) :
// - les yeux clignent (paupières, toutes les 2 à 6 s, parfois deux fois) et le regard bouge un peu ;
// - à l'arrêt : respiration, poids qui passe d'une jambe à l'autre (les pieds restent plantés),
//   petits mouvements de tête et, de temps en temps, un geste (se gratter la tête, regarder autour,
//   mains sur les hanches, s'étirer) ;
// - gestes de soin (verser, tendre la main, brosser, caresser, frotter…) tournés vers l'animal ;
// - à cheval : mains aux rênes, jambes le long des flancs, buste qui suit les allures ;
// - porter une caisse à deux mains.
// Les bras sont placés par cinématique inverse (deux os) : on donne où doit aller la main.
// Aucune allocation par image : tous les vecteurs de travail sont créés une fois ici.
// La logique pure (planification, choix des gestes, angles des jambes) est dans avatarMotion.js.

import * as THREE from 'three';
import {
  makeRandom, planBlink, blinkAmount, blinkDuration, planGaze, IDLE_GESTURES, pickIdleGesture,
  nextIdleDelay, nextShiftDelay, envelope, keyframes, squatPose, riderPose, stirrupFor, CARE_GESTURE_TIME, LEG,
} from './avatarMotion.js';

/** Proportions du squelette (doivent correspondre à buildAvatar). */
export const RIG = {
  hipY: 0.82, // hanche
  knee: 0.4, // hanche → genou
  shoulderY: 1.33,
  upper: 0.27, // épaule → coude
  fore: 0.265, // coude → milieu de la paume
  headScale: 1.1,
};

// Paupière supérieure : rotation (rad) ouverte / fermée.
export const LID_OPEN = -0.62;
export const LID_CLOSED = 0.5;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ vecteurs de travail

const _D = new THREE.Vector3();
const _U = new THREE.Vector3();
const _W = new THREE.Vector3();
const _X = new THREE.Vector3();
const _P = new THREE.Vector3();
const _h = new THREE.Vector3();
const _w = new THREE.Vector3();
const _x = new THREE.Vector3(1, 0, 0);
const _mL = new THREE.Matrix4();
const _mT = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _t0 = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _pole0 = new THREE.Vector3();
const _pole1 = new THREE.Vector3();

// Images clés des gestes (créées une fois : pas d'allocation par image).
const LOOK_KEYS = [[0, 0], [0.5, 0.62], [1.3, 0.62], [2.0, -0.58], [2.8, -0.58], [3.4, 0]];
const POUR_KEYS = [[0, 0], [0.32, 0], [0.55, 1], [0.95, 1], [1.15, 0]];
const THROW_X = [[0, -0.05], [0.4, -0.12], [0.75, 0], [1.15, 0]];
const THROW_Y = [[0, 0.15], [0.4, 0.5], [0.75, 0.35], [1.15, 0.05]];
const THROW_Z = [[0, -0.15], [0.4, -0.55], [0.75, 0.1], [1.15, 0]];
const THROW_TWIST = [[0, 0], [0.4, 0.25], [0.75, -0.2], [1.15, 0]];
const _sq = {};
const _rp = {};

// ------------------------------------------------------------------ état

/** Crée l'état d'animation d'un personnage (appelé par buildAvatar). seed : graine propre à chacun. */
export function initLife(a, seed = Math.random() * 1e9) {
  const rand = makeRandom(Math.floor(seed));
  const blink = planBlink(rand);
  a.life = {
    rand,
    t: rand() * 100,
    // Clignement.
    blinkIn: 0.4 + rand() * 3,
    blinkT: -1,
    blinkDouble: blink.double,
    // Regard.
    gazeIn: rand() * 2,
    gazeYaw: 0,
    gazePitch: 0,
    gazeTY: 0,
    gazeTP: 0,
    // Attente.
    idleW: 1,
    stillFor: 0,
    shift: 0,
    shiftTarget: rand() < 0.5 ? 1 : -1,
    shiftIn: nextShiftDelay(rand),
    dx: 0, // décalage actuel du bassin (appui)
    // Pendule de la queue de cheval / tresse.
    tailX: 0,
    tailV: 0,
    tailZ: 0,
    tailSV: 0,
    lastY: 0,
    lastVy: 0,
    lastYaw: 0,
    calm: 0.75 + rand() * 0.9, // tempérament : certains bougent plus que d'autres
    gesture: { kind: null, t: 0, dur: 0, k: 0 },
    gestureIn: 2 + rand() * 6,
    lastGesture: null,
    lookYaw: 0, // regarder autour (geste) : orientation de la tête, suivie par les yeux
    ph: [rand() * TAU, rand() * TAU, rand() * TAU, rand() * TAU, rand() * TAU],
    breath: rand() * TAU,
    breathRate: 1.4 + rand() * 0.35,
    exert: 0,
    // Geste de soin (ou d'aide au travail).
    act: { kind: null, t: 0, dur: 0, loop: false, local: false, target: new THREE.Vector3() },
  };
  return a.life;
}

// ------------------------------------------------------------------ cinématique inverse

/** Point du repère de l'avatar (a.root, au sol) → repère du torse (en place). */
export function rootToTorso(a, v) {
  v.sub(a.torso.position);
  _qi.copy(a.torso.quaternion).invert();
  return v.applyQuaternion(_qi);
}

/** Point du repère de la tête → repère du torse (en place). */
export function headToTorso(a, v) {
  v.multiplyScalar(a.head.scale.x).applyQuaternion(a.head.quaternion);
  return v.add(a.head.position);
}

/**
 * Place la main du bras i (0 = gauche du personnage, 1 = droite) sur target (repère du torse),
 * le coude du côté de pole (direction, repère du torse). weight : mélange avec la pose actuelle.
 */
export function armIK(a, i, target, pole, weight = 1) {
  if (weight <= 0.001) return;
  const sh = a.arms[i];
  const el = a.elbows[i];
  const L1 = RIG.upper;
  const L2 = RIG.fore;
  _D.subVectors(target, sh.position);
  const d = clamp(_D.length(), 0.08, L1 + L2 - 0.004);
  const cosG = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
  const bend = Math.PI - Math.acos(cosG);
  // Main dans le repère de l'épaule pour ce pli de coude : (0, -L1 - L2 cos, L2 sin).
  _h.set(0, -L1 - L2 * Math.cos(bend), L2 * Math.sin(bend)).normalize();
  _w.set(0, _h.z, -_h.y);
  _mL.makeBasis(_x, _h, _w);
  _U.copy(_D).normalize();
  _P.copy(pole).addScaledVector(_U, -pole.dot(_U));
  if (_P.lengthSq() < 1e-8) _P.set(0, -1, 0).addScaledVector(_U, _U.y);
  _W.copy(_P).normalize().negate();
  _X.crossVectors(_W, _U);
  _mT.makeBasis(_X, _U, _W);
  _mT.multiply(_mL.transpose());
  _q.setFromRotationMatrix(_mT);
  sh.quaternion.slerp(_q, weight);
  el.rotation.x += (-bend - el.rotation.x) * weight;
}

/**
 * Jambe i à deux os, en 3D : la cheville va sur target (repère de a.root), le genou du côté de
 * pole (direction, repère de a.root). Le genou se plie vers l'avant (rotation.x > 0), comme armIK
 * pour le coude. Remplace la pose actuelle de la cuisse et du genou.
 */
export function legReach(a, i, target, pole) {
  const hip = a.legs[i];
  const L1 = LEG.thigh;
  const L2 = LEG.shin;
  _D.subVectors(target, hip.position);
  const d = clamp(_D.length(), 0.08, L1 + L2 - 0.004);
  const cosG = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
  const bend = Math.PI - Math.acos(cosG);
  // Cheville dans le repère de la hanche pour ce pli : le tibia part vers l'arrière.
  _h.set(0, -L1 - L2 * Math.cos(bend), -L2 * Math.sin(bend)).normalize();
  _w.set(0, _h.z, -_h.y); // le genou est du côté +w
  _mL.makeBasis(_x, _h, _w);
  _U.copy(_D).normalize();
  _P.copy(pole).addScaledVector(_U, -pole.dot(_U));
  if (_P.lengthSq() < 1e-8) _P.set(0, 0, 1).addScaledVector(_U, -_U.z);
  _W.copy(_P).normalize();
  _X.crossVectors(_W, _U);
  _mT.makeBasis(_X, _U, _W);
  _mT.multiply(_mL.transpose());
  hip.quaternion.setFromRotationMatrix(_mT);
  a.knees[i].rotation.set(bend, 0, 0);
}

/** Oriente le pied i dans le repère de a.root (quaternion q), quelle que soit la pose de la jambe. */
function footTo(a, i, q) {
  if (!a.ankles) return;
  _qi.copy(a.legs[i].quaternion).multiply(a.knees[i].quaternion).invert();
  a.ankles[i].quaternion.copy(_qi.multiply(q));
}

/** Les deux jambes accroupies (depth 0 à 1), mélangées à la pose actuelle ; le bassin descend. */
function squat(a, depth, weight) {
  if (weight <= 0.001 || depth <= 0.001) return;
  const s = squatPose(depth, _sq);
  for (let i = 0; i < 2; i++) {
    const l = a.legs[i].rotation;
    l.x += (s.hip - l.x) * weight;
    const k = a.knees[i].rotation;
    k.x += (s.knee - k.x) * weight;
    if (a.ankles) {
      const an = a.ankles[i].rotation;
      an.x += (s.ankle - an.x) * weight;
    }
  }
  a.root.position.y -= s.drop * weight;
}

// ------------------------------------------------------------------ yeux

function eyes(a, L, dt) {
  const rand = L.rand;
  // Clignement : planifié au hasard toutes les 2 à 6 s, parfois double.
  if (L.blinkT >= 0) {
    L.blinkT += dt;
    if (L.blinkT > blinkDuration(L.blinkDouble)) {
      L.blinkT = -1;
      const p = planBlink(rand);
      L.blinkIn = p.delay;
      L.blinkDouble = p.double;
    }
  } else {
    L.blinkIn -= dt;
    if (L.blinkIn <= 0) L.blinkT = 0;
  }
  // Regard : petits sauts d'un point à un autre ; il devance la tête quand on regarde autour.
  L.gazeIn -= dt;
  if (L.gazeIn <= 0) {
    const g = planGaze(rand);
    L.gazeTY = g.yaw;
    L.gazeTP = g.pitch;
    L.gazeIn = g.delay;
  }
  const ty = clamp(L.gazeTY + L.lookYaw * 0.55, -0.4, 0.4);
  const k = Math.min(1, dt * 24);
  L.gazeYaw += (ty - L.gazeYaw) * k;
  L.gazePitch += (L.gazeTP - L.gazePitch) * k;
  if (!a.eyeBalls) return;
  for (const b of a.eyeBalls) b.rotation.set(L.gazePitch, L.gazeYaw, 0);
  const close = L.blinkT >= 0 ? blinkAmount(L.blinkT, L.blinkDouble) : 0;
  // La paupière suit un peu le regard (plus basse quand on regarde en bas).
  const open = LID_OPEN + Math.max(-0.06, L.gazePitch * 0.45);
  for (const lid of a.lids) lid.rotation.x = open + (LID_CLOSED - open) * close;
}

// ------------------------------------------------------------------ attente

function idle(a, L, dt, o) {
  const w = L.idleW;
  const carry = !!o.carry;
  // Respiration (plus rapide et plus ample après avoir couru).
  L.breath += dt * (L.breathRate + L.exert * 2.4);
  const br = Math.sin(L.breath) * (0.55 + 0.45 * w) * (1 + L.exert * 1.4);
  if (a.chest) a.chest.scale.set(1 + 0.007 * br, 1 + 0.003 * br, 1 + 0.016 * br);
  a.torso.rotation.x -= 0.006 * br * w;
  a.head.rotation.x += 0.005 * br * w;
  if (!carry) {
    // Les épaules montent un peu à l'inspiration (pas en portant : les mains tiennent la caisse).
    a.arms[0].rotation.z += 0.012 * br * w;
    a.arms[1].rotation.z -= 0.012 * br * w;
  }

  // Poids d'une jambe sur l'autre : le bassin glisse de côté, les pieds restent où ils sont.
  L.shiftIn -= dt;
  if (L.shiftIn <= 0) {
    L.shiftTarget = -L.shiftTarget;
    L.shiftIn = nextShiftDelay(L.rand) * L.calm;
  }
  L.shift += (L.shiftTarget - L.shift) * Math.min(1, dt * 1.4);
  const s = L.shift * w * (carry ? 0.45 : 1);
  const dx = 0.022 * s;
  a.root.position.x += dx - L.dx; // décalage relatif : la position de base reste à qui la règle
  L.dx = dx;
  const tilt = -Math.asin(dx / 0.8);
  const relaxed = s > 0 ? 1 : 0;
  const r = Math.abs(s);
  for (let i = 0; i < 2; i++) a.legs[i].rotation.z += tilt;
  a.legs[relaxed].rotation.x -= 0.07 * r;
  a.knees[relaxed].rotation.x += 0.17 * r;
  if (a.ankles) a.ankles[relaxed].rotation.x -= 0.06 * r;
  a.torso.rotation.z += 0.028 * s;
  a.head.rotation.z -= 0.024 * s;

  // Petits mouvements de tête, lents (pas de tremblement).
  const t = L.t;
  const p = L.ph;
  const hw = 0.35 + 0.65 * w;
  a.head.rotation.y += (0.07 * Math.sin(t * 0.31 + p[0]) + 0.03 * Math.sin(t * 0.73 + p[1])) * hw;
  a.head.rotation.x += (0.028 * Math.sin(t * 0.23 + p[2]) + 0.012 * Math.sin(t * 0.59 + p[3])) * hw;
  a.head.rotation.z += 0.02 * Math.sin(t * 0.37 + p[4]) * hw;

  // Gestes d'attente : seulement immobile depuis un moment, mains libres.
  const g = L.gesture;
  const free = !carry && !o.busy && !L.act.kind && w > 0.97;
  if (g.kind) {
    g.t += dt;
    g.k += ((free ? 1 : 0) - g.k) * Math.min(1, dt * (free ? 6 : 9));
    if (g.t >= g.dur || (!free && g.k < 0.02)) {
      L.lastGesture = g.kind;
      g.kind = null;
      L.gestureIn = nextIdleDelay(L.rand, L.calm);
    }
  } else if (free && L.stillFor > 1.2 && !o.noGestures) {
    L.gestureIn -= dt;
    if (L.gestureIn <= 0) {
      g.kind = pickIdleGesture(L.rand, L.lastGesture);
      g.t = 0;
      g.dur = IDLE_GESTURES[g.kind] * (0.9 + L.rand() * 0.25);
      g.k = 0;
    }
  }
  L.lookYaw = 0;
  if (g.kind) idleGesture(a, L, g, w);
}

function idleGesture(a, L, g, w) {
  const u = g.t;
  const gw = envelope(u, g.dur, 0.45, 0.5) * g.k * w;
  if (gw <= 0.001) return;
  switch (g.kind) {
    case 'scratch': {
      // Main droite sur le haut de la tête, petits allers-retours ; la tête se penche vers la main.
      // Avec un chapeau, la main se pose dessus (on l'ajuste) au lieu d'entrer dedans ; sinon elle
      // reste à la surface de la coiffure (bouclés plus loin que rasés).
      a.head.rotation.z += 0.13 * gw;
      a.head.rotation.x += 0.07 * gw;
      const sc = Math.min(1, Math.max(0, (u - 0.5) * 3)) * Math.min(1, Math.max(0, (g.dur - u - 0.5) * 3));
      if (a.hat) {
        const [cx, cy, cz] = a.hat.c;
        const r = a.hat.r + 0.024;
        _t0.set(cx - 0.86 * r, cy + 0.42 * r, cz + 0.06 * r);
      } else {
        const k = 1 + Math.max(0, (a.hairBulk ?? 0.03) - 0.03) * 4.5; // le long du rayon depuis le centre du crâne
        _t0.set(-0.122 * k, 0.075 + 0.093 * k, -0.005 + 0.01 * k);
      }
      _t0.x += 0.006 * Math.sin(u * 15) * sc;
      _t0.y += 0.012 * Math.sin(u * 15 + 1) * sc;
      _t0.z += 0.014 * Math.sin(u * 7.5) * sc;
      headToTorso(a, _t0);
      _pole0.set(-1, 0.25, 0.45);
      armIK(a, 1, _t0, _pole0, gw);
      a.hands[1].rotation.z += 0.5 * gw;
      break;
    }
    case 'look': {
      // Tête à gauche, puis à droite ; les yeux devancent, le buste suit un peu.
      const k = 3.4 / g.dur;
      const yaw = keyframes(u * k, LOOK_KEYS) * g.k * w;
      a.head.rotation.y += yaw * 0.78;
      a.torso.rotation.y += yaw * 0.22;
      L.lookYaw = keyframes((u + 0.15) * k, LOOK_KEYS) * g.k * w;
      break;
    }
    case 'hips': {
      // Les deux mains sur les hanches, coudes vers l'extérieur.
      a.torso.rotation.x -= 0.035 * gw;
      a.head.rotation.z += 0.06 * gw;
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? 1 : -1;
        _t0.set(s * 0.178, RIG.hipY + 0.11, 0.035);
        rootToTorso(a, _t0);
        _pole0.set(s, -0.05, -0.55);
        armIK(a, i, _t0, _pole0, gw);
        a.hands[i].rotation.x += 0.35 * gw;
      }
      break;
    }
    case 'stretch': {
      // Les bras au-dessus de la tête, le buste un peu en arrière, on regarde en l'air. Les mains
      // s'écartent selon le volume de la coiffure (les avant-bras ne traversent pas les boucles).
      a.torso.rotation.x -= 0.07 * gw;
      a.head.rotation.x -= 0.2 * gw;
      const wide = (a.hairBulk ?? 0.03) * 1.25;
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? 1 : -1;
        _t0.set(s * (0.11 + wide), 1.0 - wide * 0.5, 0.03);
        _pole0.set(s, 0.1, -0.2);
        armIK(a, i, _t0, _pole0, gw);
      }
      break;
    }
    default:
  }
}

// ------------------------------------------------------------------ gestes de soin

/**
 * Lance un geste de soin : kind ('pour', 'offer', 'brush', 'pet', 'scrub', 'tool', 'play', 'lead',
 * 'milk', 'pat'), vers le point (x, y, z) du repère de l'avatar (au sol, +Z devant). loop : le geste
 * se répète pendant duration (aides au travail).
 */
export function startAvatarGesture(a, kind, { duration = CARE_GESTURE_TIME, loop = false, x = 0, y = 0.95, z = 0.42, local = false } = {}) {
  const L = a.life;
  if (!L) return;
  const A = L.act;
  A.kind = kind;
  A.t = 0;
  A.dur = duration;
  A.loop = loop;
  A.local = local; // vrai : (x, y, z) dans le repère de l'avatar (à cheval), sinon au sol sous lui
  A.target.set(x, y, z);
}

/** Arrête doucement le geste en cours. */
export function stopAvatarGesture(a) {
  const A = a.life?.act;
  if (A?.kind) A.dur = Math.min(A.dur, A.t + 0.3);
}

/** Vrai pendant un geste de soin. */
export const avatarBusy = (a) => !!a.life?.act.kind;

function act(a, L, dt, riding) {
  const A = L.act;
  if (!A.kind) return;
  A.t += dt;
  if (A.t >= A.dur) {
    A.kind = null;
    return;
  }
  const u = A.t;
  const w = envelope(u, A.dur, 0.22, 0.32);
  const T = A.target;
  // Hauteur à atteindre : on se penche, et pour les petits animaux on s'accroupit.
  let depth = clamp((0.86 - T.y) / 0.5, 0, 1);
  if (A.kind === 'tool' || A.kind === 'milk') depth = Math.max(depth, 0.55);
  if (!riding) {
    squat(a, depth, w);
    const lean = 0.1 + depth * 0.28 + (T.y < 1.1 ? 0.06 : 0);
    a.torso.rotation.x += lean * w;
    // La tête regarde la main (vers le bas pour un petit animal).
    a.head.rotation.x += (-lean * 0.55 + clamp((1.35 - T.y) * 0.25, 0, 0.3)) * w;
  }
  const sR = -1; // main droite (côté -X)
  let both = false;
  let ox = 0;
  let oy = 0;
  let oz = 0;
  let ox2 = 0;
  let oy2 = 0;
  let oz2 = 0;
  switch (A.kind) {
    case 'pour': {
      // On tend la main au-dessus de la gamelle et on verse (le poignet bascule).
      oy = 0.1;
      oz = -0.04;
      const tip = A.loop ? 0.5 + 0.5 * Math.sin(u * 3) : keyframes(u, POUR_KEYS);
      a.hands[1].rotation.z += -sR * 1.1 * tip * w;
      break;
    }
    case 'offer': {
      // Main tendue, paume vers le haut, qui monte et descend un peu.
      oy = 0.04 + 0.012 * Math.sin(u * 5);
      oz = -0.02;
      a.hands[1].rotation.y += sR * 1.3 * w;
      a.hands[1].rotation.x -= 0.5 * w;
      break;
    }
    case 'brush': {
      // Coups de brosse le long du corps de l'animal.
      const st = u * 7.5;
      ox = 0.09 * Math.sin(st);
      oy = 0.02 * Math.cos(st);
      oz = 0.015 * Math.cos(st);
      a.hands[1].rotation.x += 0.4 * w;
      break;
    }
    case 'pet': {
      // Caresses lentes : la main glisse, se soulève au retour ; la tête se penche, attendrie.
      const st = u * 4.4;
      ox = 0.07 * Math.sin(st);
      oy = 0.02 * Math.max(0, Math.cos(st));
      a.hands[1].rotation.x += 0.55 * w;
      a.head.rotation.z += 0.1 * w;
      break;
    }
    case 'scrub': {
      // Les deux mains frottent en petits cercles, en alternance.
      both = true;
      const st = u * 9;
      ox = -0.08 + 0.04 * Math.cos(st);
      oy = 0.04 * Math.sin(st);
      ox2 = 0.08 + 0.04 * Math.cos(st + Math.PI);
      oy2 = 0.04 * Math.sin(st + Math.PI);
      a.hands[0].rotation.x += 0.5 * w;
      a.hands[1].rotation.x += 0.5 * w;
      break;
    }
    case 'tool': {
      // Accroupi, une main tient, l'autre fait de petits gestes précis (coupe, martelle).
      both = true;
      ox = -0.03;
      oy = 0.05 * Math.abs(Math.sin(u * 7));
      ox2 = 0.07;
      oy2 = 0;
      break;
    }
    case 'milk': {
      // Mains basses qui pressent l'une après l'autre.
      both = true;
      ox = -0.05;
      oy = 0.03 * Math.sin(u * 8);
      ox2 = 0.05;
      oy2 = 0.03 * Math.sin(u * 8 + Math.PI);
      break;
    }
    case 'play': {
      // Lancer la balle : on arme le bras derrière la tête puis on lance devant.
      const k = A.loop ? (u % 1.4) / 1.4 * 1.15 : u / A.dur * 1.15;
      ox = keyframes(k, THROW_X);
      oy = keyframes(k, THROW_Y);
      oz = keyframes(k, THROW_Z);
      a.torso.rotation.y += keyframes(k, THROW_TWIST) * w;
      break;
    }
    case 'lead': {
      // Longe : bras levé sur le côté, la main décrit un petit cercle ; la tête suit l'animal.
      ox = -0.42;
      oy = 0.32 + 0.04 * Math.sin(u * 3.5);
      oz = -0.15 + 0.04 * Math.cos(u * 3.5);
      a.head.rotation.y -= 0.35 * w;
      break;
    }
    case 'pat':
    default: {
      // Petites tapes (sur l'encolure du cheval).
      oy = 0.025 * Math.abs(Math.sin(u * 7));
      a.hands[1].rotation.x += 0.5 * w;
    }
  }
  _t0.set(T.x + ox, T.y + oy, T.z + oz);
  if (!A.local) _t0.sub(a.root.position);
  rootToTorso(a, _t0);
  _pole0.set(-0.6, -1, -0.35);
  armIK(a, 1, _t0, _pole0, w);
  if (both) {
    _t1.set(T.x + ox2, T.y + oy2, T.z + oz2);
    if (!A.local) _t1.sub(a.root.position);
    rootToTorso(a, _t1);
    _pole1.set(0.6, -1, -0.35);
    armIK(a, 0, _t1, _pole1, w);
  }
}

// ------------------------------------------------------------------ mise à jour

const NONE = {};

/**
 * À appeler à chaque image après animateAvatarWalk (ou animateAvatarRide) : clignement, regard,
 * attente vivante, gestes. o : { speed, riding, carry, busy (occupé : pas de geste d'attente),
 * noGestures }.
 */
export function updateAvatarLife(a, dt, o = NONE) {
  const L = a.life;
  if (!L) return;
  dt = Math.min(dt, 0.1);
  L.t += dt;
  const speed = o.speed ?? 0;
  const riding = !!o.riding;
  L.exert = clamp(L.exert + (speed > 4.2 ? dt * 0.22 : -dt * 0.05), 0, 1);
  const still = !riding && speed < 0.25;
  L.idleW += ((still ? 1 : 0) - L.idleW) * Math.min(1, dt * (still ? 2.2 : 7));
  L.stillFor = still ? L.stillFor + dt : 0;
  eyes(a, L, dt);
  if (!riding) idle(a, L, dt, o);
  else {
    // À cheval, animateAvatarRide replace l'avatar lui-même : plus de décalage d'appui.
    L.lookYaw = 0;
    L.dx = 0;
  }
  act(a, L, dt, riding);
  if (a.hairTail) swing(a, L, dt, speed);
}

/**
 * Queue de cheval / tresse : un petit pendule amorti, poussé par les rebonds du corps et les
 * mouvements de tête ; elle se soulève vers l'arrière quand on court.
 */
function swing(a, L, dt, speed) {
  if (dt <= 0) return;
  const y = a.root.position.y;
  const vy = (y - L.lastY) / dt;
  const ay = clamp((vy - L.lastVy) / dt, -40, 40);
  L.lastY = y;
  L.lastVy = vy;
  const tx = Math.min(0.45, speed * 0.06) - a.head.rotation.x - a.torso.rotation.x * 0.6;
  L.tailV += ((tx - L.tailX) * 70 - L.tailV * 7 - ay * 0.05) * dt;
  L.tailX = clamp(L.tailX + L.tailV * dt, -0.6, 0.9);
  const tz = -a.head.rotation.z - a.torso.rotation.z;
  const yaw = a.head.rotation.y + a.torso.rotation.y;
  L.tailSV += ((tz - L.tailZ) * 60 - L.tailSV * 6 + (yaw - L.lastYaw) / dt * 0.6) * dt;
  L.lastYaw = yaw;
  L.tailZ = clamp(L.tailZ + L.tailSV * dt, -0.5, 0.5);
  a.hairTail.rotation.set(L.tailX, 0, L.tailZ);
}

// ------------------------------------------------------------------ caisse

/**
 * Porter une caisse à deux mains devant soi : bras pliés, mains sur les côtés.
 * size : { w, h, d } de la caisse. Renvoie la position (repère du torse) de son fond, au centre.
 */
export function carryHold(a, size, out) {
  const yc = 0.2; // milieu de la caisse, au niveau du ventre (repère du torse)
  const near = 0.13; // la caisse touche presque le ventre
  out.set(0, yc - size.h / 2, near + size.d / 2);
  const grip = near + Math.min(size.d * 0.42, 0.24);
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    _t0.set(s * (size.w / 2 + 0.022), yc, grip);
    _pole0.set(s * 0.7, -1, -0.25);
    armIK(a, i, _t0, _pole0, 1);
    a.hands[i].rotation.set(0, 0, 0);
  }
  return out;
}

// ------------------------------------------------------------------ à cheval

const _foot = new THREE.Euler();
const _qf = new THREE.Quaternion();
const _stir = {};

/**
 * Pose du cavalier, à chaque image (remplace la pose précédente) :
 * st = { gait (0 pas, 1 trot, 2 galop), phase, posting (trot enlevé), seatY, seatZ, bob,
 *        footX, footY, footZ (cheville dans l'étrier, repère de l'avatar assis, voir stirrupFor),
 *        kneeOut (genou vers l'extérieur, rad), reinsY, reinsZ (mains, repère de l'avatar) }.
 * Sans footX/footY/footZ, les pieds vont dans les étriers d'un cheval moyen.
 */
export function animateAvatarRide(a, st) {
  const P = riderPose(st.gait, st.phase, st.posting !== false, _rp);
  a.root.position.set(0, st.seatY + st.bob + P.lift, st.seatZ + P.fwd);
  // Jambes : la cheville est fixée dans l'étrier (repère du cheval) ; quand le bassin se lève
  // (trot enlevé, galop en suspension), c'est le genou qui s'ouvre.
  if (st.footY === undefined) stirrupFor(0.34, st.posting !== false, _stir);
  const fx = st.footX ?? _stir.x;
  const fy = (st.footY ?? _stir.y) - P.lift;
  const fz = (st.footZ ?? _stir.z) - P.fwd;
  const out = st.kneeOut ?? _stir.out;
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    _t0.set(s * fx, fy, fz);
    // Genou vers l'avant, écarté pour longer le flanc.
    _pole0.set(s * Math.sin(out), -0.1, Math.cos(out));
    legReach(a, i, _t0, _pole0);
    // Pied à plat dans l'étrier, talon un peu bas, pointe légèrement vers l'extérieur.
    _foot.set(-0.22, s * 0.28, 0);
    footTo(a, i, _qf.setFromEuler(_foot));
  }
  // Buste : suit l'allure ; la tête reste droite et regarde devant.
  a.torso.rotation.set(P.lean + P.pitch, 0, P.sway);
  a.head.rotation.set(-(P.lean + P.pitch) * 0.85, 0, -P.sway * 0.7);
  if (a.chest) a.chest.scale.set(1, 1, 1);
  // Mains aux rênes : devant, à hauteur du garrot, coudes pliés. Elles suivent l'encolure.
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    _t0.set(s * 0.075, st.reinsY - P.lift - P.low, st.reinsZ + P.reach);
    rootToTorso(a, _t0);
    _pole0.set(s * 0.45, -1, -0.7);
    a.arms[i].rotation.set(0, 0, 0);
    a.elbows[i].rotation.set(-1.2, 0, 0);
    armIK(a, i, _t0, _pole0, 1);
    a.hands[i].rotation.set(0.35, 0, -s * 0.25);
  }
}
