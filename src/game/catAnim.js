// Animation des chats (modèle catModel.js) : allures (pas, course), queue levée en point
// d'interrogation quand il marche, et poses de repos qui se fondent l'une dans l'autre : debout,
// assis, toilette (patte léchée, flanc), couché en sphinx, en boule pour dormir, étirement au
// réveil, accroupi pour manger. Oreilles qui bougent, paupières qui clignent, respiration.
// La colonne (os du tronc) se courbe pour dormir en boule ; assis ou couché, la queue se pose au
// sol et fait le tour des pattes. Tout est calculé dans des tableaux et objets réutilisés : aucune
// allocation par image.

import * as THREE from 'three';
import { pickIdlePose } from '../sim/catPoses.js';

// Canaux d'une pose.
const BODY_Y = 0;
const BODY_Z = 1;
const PITCH = 2; // négatif : l'avant se lève
const ROLL = 3;
const LEG = 4; // 4 à 7 : AVG, AVD, ARG, ARD (épaule / hanche)
const KNEE = 8; // 8 à 11 : coude / grasset
const PAW = 12; // 12 à 15 : poignet / jarret
const NECK_X = 16;
const NECK_Y = 17;
const HEAD_X = 18;
const HEAD_Y = 19;
const HEAD_Z = 20;
const TAIL_UP = 21; // premier os : positif = vers le haut
const TAIL_CURL = 22; // chaque os suivant (vers le haut)
const TAIL_SIDE = 23; // premier os : sur le côté
const TAIL_WRAP = 24; // chaque os suivant : s'enroule sur le côté
const TAIL_TIP = 25; // le bout de la queue se recourbe (point d'interrogation)
const EARS_BACK = 26;
const LIDS = 27; // 0 ouvert, 1 fermé
const SPLAY = 28; // pattes arrière écartées
const TWITCH = 29; // le bout de la queue frétille sur le côté
const REACH = 30; // pattes avant allongées (assis : l'épaule remonte, la patte reste au sol)
const TOE = 31; // 31 à 34 : la patte reste à plat au sol (assis, couché)
const BEND = 35; // colonne : courbe sur le côté (par os ; positif = les deux bouts vers +x)
const ARCH = 36; // colonne : dos rond (par os ; positif = les deux bouts vers le ventre)
const BODY_X = 37; // décalage sur le côté (couché sur le flanc, le corps reste à sa place)
const N = 38;

const POSES = ['stand', 'move', 'sit', 'groom', 'loaf', 'curl', 'stretch', 'crouch', 'highfive'];
const acc = new Float32Array(N);
const tmp = new Float32Array(N);
// Contexte des poses, réutilisé d'une image à l'autre (rempli par animateCat).
const ctx = { t: 0, d: null, ph: 0, run: 0, amp: 0, side: 1, sub: 0, stretch: 0, seed: 0, perch: false, tailHigh: false };
const P = Math.PI;
const OFF_WALK = [-P / 2, P / 2, 0, P];
const OFF_RUN = [0, 0.35, P, P + 0.35];

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ queue posée au sol

// Objets réutilisés (aucune allocation par image).
const _inv = new THREE.Matrix4();
const _rel = new THREE.Matrix4();
const _qw = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _qt = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _sc = new THREE.Vector3();
const _d = new THREE.Vector3();
const _tg = new THREE.Vector3();
const NEG_Z = new THREE.Vector3(0, 0, -1);
const tailArc = { rx: 0, rz: 0, cz: 0, a1: 0 };

/**
 * Assis, à la toilette ou couché : la queue descend jusqu'au sol puis suit un arc d'ellipse posé
 * par terre (repère du chat, sol à y = 0) qui fait le tour des pattes, du côté s. Chaque os vise le
 * point suivant de l'arc ; le résultat est mélangé à la pose des canaux avec le poids w.
 * g : { rx, rz, cz (centre de l'ellipse, en avant de la racine de la queue), a1 (angle d'arrivée) }.
 */
function groundTail(md, C, w, s, g) {
  const bones = C.tailBones;
  md.tail.updateWorldMatrix(true, false);
  _inv.copy(md.root.matrixWorld).invert();
  _rel.multiplyMatrices(_inv, md.tail.matrixWorld);
  _rel.decompose(_p, _qw, _sc);
  const seg = C.tailSeg;
  const yg = C.tailR * 0.85;
  const cz = _p.z + g.cz;
  const at = (a, out) => out.set(-s * g.rx * Math.sin(a), yg, cz - g.rz * Math.cos(a));
  let a = 0;
  for (let i = 0; i < bones.length - 1; i++) {
    // Prochain point de l'arc à une longueur d'os de la jointure.
    while (a < g.a1 && at(a, _tg).distanceToSquared(_p) < seg * seg) a += 0.04;
    at(a, _tg);
    _d.subVectors(_tg, _p).normalize();
    // Direction voulue dans le repère du parent, puis rotation de l'os (son axe de repos est -z).
    _qi.copy(_qw).invert();
    _d.applyQuaternion(_qi);
    _qt.setFromUnitVectors(NEG_Z, _d);
    bones[i].quaternion.slerp(_qt, w);
    _qw.multiply(bones[i].quaternion);
    _p.addScaledVector(_d.copy(NEG_Z).applyQuaternion(_qw), seg);
  }
  bones[bones.length - 1].quaternion.slerp(_qt.identity(), w);
}

/**
 * Patte i : angles « dans le monde » (0 = verticale, négatif = vers l'avant) des trois segments,
 * convertis en rotations des os (chaque os tourne par rapport au précédent).
 */
function leg(o, i, pitch, a, b, c, flat = 0) {
  o[LEG + i] = a - pitch;
  o[KNEE + i] = b - a;
  o[PAW + i] = c - b;
  o[TOE + i] = -c * flat; // flat = 1 : coussinets posés à plat quel que soit l'angle de la patte
}

/** Bascule du corps autour d'un point q = [y, z] (repère du corps) qui doit arriver en [y', z']. */
function pivot(o, pitch, qy, qz, ty, tz) {
  const cs = Math.cos(pitch);
  const sn = Math.sin(pitch);
  o[PITCH] = pitch;
  o[BODY_Y] = ty - (qy * cs - qz * sn);
  o[BODY_Z] = tz - (qy * sn + qz * cs);
}

/**
 * Assise : le derrière au sol, le dos bien redressé. Renvoie l'angle et l'allongement des pattes
 * avant pour qu'elles restent verticales et touchent juste le sol (l'épaule remonte quand il s'assoit).
 */
function sitPose(d) {
  const p = -0.58;
  const qy = d.y0 - d.R * 0.8;
  const qz = d.hipZ - d.R * 0.3;
  const cs = Math.cos(p);
  const sn = Math.sin(p);
  const by = d.R * 0.15 - (qy * cs - qz * sn);
  const sy = by + d.legTop * cs - d.shoulderZ * sn;
  return { pitch: p, reach: Math.min(1.45, Math.max(1, sy / d.legTop)) };
}

// ------------------------------------------------------------------ poses

function stand(o, c) {
  const t = c.t;
  o[TAIL_UP] = c.tailHigh ? 1.1 : -0.5;
  o[TAIL_CURL] = c.tailHigh ? 0.02 : 0.17;
  o[TAIL_SIDE] = Math.sin(t * 0.8 + c.seed) * 0.2;
  o[TWITCH] = Math.sin(t * 5.5) * 0.3 * Math.max(0, Math.sin(t * 0.37 + c.seed));
  o[HEAD_Y] = Math.sin(t * 0.4 + c.seed) * 0.35;
  o[HEAD_X] = Math.sin(t * 0.23 + c.seed) * 0.08;
  o[NECK_X] = -0.05;
}

function move(o, c) {
  const { ph, run, amp } = c;
  // Petit balancement au pas ; à la course, le dos se plie et se déplie.
  o[PITCH] = Math.sin(ph * 2) * 0.012 * (1 - run) + Math.sin(ph) * 0.1 * run;
  for (let i = 0; i < 4; i++) {
    const off = OFF_WALK[i] * (1 - run) + OFF_RUN[i] * run;
    const a = ph + off;
    const swing = Math.sin(a) * amp;
    const lift = Math.max(0, -Math.cos(a)) * amp;
    if (i < 2) leg(o, i, o[PITCH], swing, swing - lift * 0.5, swing + lift * 1.4);
    else leg(o, i, o[PITCH], swing * 1.1, swing * 1.1 - lift * 1.1, swing * 1.1 + lift * 0.5);
  }
  o[BODY_Y] = Math.abs(Math.sin(ph)) * (0.004 + 0.02 * run);
  o[ROLL] = Math.sin(ph) * 0.03 * (1 - run);
  o[NECK_X] = 0.12 - run * 0.1 + Math.sin(ph * 2) * 0.03;
  o[HEAD_X] = -0.08;
  // Queue : bien droite en marchant, le bout recourbé en point d'interrogation ; à plat en courant.
  const perch = c.perch ? 1 : 0;
  o[TAIL_UP] = (1.3 * (1 - run) + 0.25 * run) * (1 - perch) + 0.05 * perch;
  o[TAIL_CURL] = (-0.06 * (1 - run) + 0.02 * run) * (1 - perch);
  o[TAIL_TIP] = (0.45 * (1 - run)) * (1 - perch);
  o[TAIL_SIDE] = Math.sin(ph) * (0.1 + 0.25 * perch);
}

function sit(o, c) {
  const d = c.d;
  const p = d.sit.pitch;
  pivot(o, p, d.y0 - d.R * 0.8, d.hipZ - d.R * 0.3, d.R * 0.15, d.hipZ - d.R * 0.3);
  // Pattes avant droites, posées juste devant ; pattes arrière repliées sur le côté.
  leg(o, 0, p, -0.04, -0.04, -0.02);
  leg(o, 1, p, -0.04, -0.04, -0.02);
  leg(o, 2, p, -1.0, 1.1, -1.5, 0.95);
  leg(o, 3, p, -1.0, 1.1, -1.5, 0.95);
  o[REACH] = d.sit.reach - 1;
  o[SPLAY] = 0.32;
  o[NECK_X] = -p * 0.5 - 0.05;
  o[HEAD_X] = -p * 0.35;
  o[HEAD_Y] = Math.sin(c.t * 0.3 + c.seed) * 0.4;
  // Queue posée au sol, enroulée autour des pattes.
  o[TAIL_UP] = -0.15 - p;
  o[TAIL_CURL] = -0.07;
  o[TAIL_SIDE] = 1.3 * c.side;
  o[TAIL_WRAP] = 0.55 * c.side;
  o[TWITCH] = Math.sin(c.t * 4) * 0.25 * Math.max(0, Math.sin(c.t * 0.5 + c.seed));
}

function groom(o, c) {
  sit(o, c);
  const p = c.d.sit.pitch;
  const t = c.t;
  const s = c.side;
  const lick = Math.sin(t * 13) * 0.06 * (Math.sin(t * 1.7) > -0.3 ? 1 : 0);
  o[LIDS] = 0.7;
  o[HEAD_Y] = 0;
  if (c.sub === 0) {
    // Lèche sa patte avant levée.
    const i = s > 0 ? 0 : 1;
    leg(o, i, p, -1.05, -2.5, -2.9);
    o[NECK_X] += 0.25;
    o[HEAD_X] += 0.45 + lick;
    o[HEAD_Y] = s * 0.35;
    o[HEAD_Z] = s * 0.15;
  } else if (c.sub === 1) {
    // Se frotte la tête et l'oreille avec la patte.
    const i = s > 0 ? 0 : 1;
    const rub = Math.sin(t * 3.2);
    leg(o, i, p, -1.3 + rub * 0.15, -2.6 + rub * 0.2, -3.0);
    o[NECK_X] += 0.3;
    o[HEAD_X] += 0.35;
    o[HEAD_Z] = s * (0.35 + rub * 0.1);
    o[HEAD_Y] = s * 0.25;
    o[EARS_BACK] = 0.3;
  } else {
    // Se lèche le flanc, la tête tournée en arrière.
    o[NECK_Y] = s * 1.15;
    o[NECK_X] += 0.3;
    o[HEAD_Y] = s * 0.75;
    o[HEAD_X] += 0.55 + lick;
    o[HEAD_Z] = s * 0.2;
  }
}

function loaf(o, c) {
  const d = c.d;
  o[BODY_Y] = -(d.y0 - d.R * 1.0) + d.R * 0.04;
  // Couché en sphinx : avant-bras posés devant, pattes arrière repliées sous le corps.
  leg(o, 0, 0, 0.5, -1.45, -1.6, 0.9);
  leg(o, 1, 0, 0.5, -1.45, -1.6, 0.9);
  leg(o, 2, 0, -1.35, 1.35, -1.5, 0.9);
  leg(o, 3, 0, -1.35, 1.35, -1.5, 0.9);
  o[SPLAY] = 0.25;
  o[NECK_X] = -0.2;
  o[HEAD_X] = 0.05;
  o[HEAD_Y] = Math.sin(c.t * 0.25 + c.seed) * 0.35;
  o[LIDS] = 0.35 + 0.3 * Math.max(0, Math.sin(c.t * 0.2 + c.seed));
  o[TAIL_UP] = -0.15;
  o[TAIL_CURL] = -0.03;
  o[TAIL_SIDE] = 1.15 * c.side;
  o[TAIL_WRAP] = 0.46 * c.side;
  o[TWITCH] = Math.sin(c.t * 3) * 0.25 * Math.max(0, Math.sin(c.t * 0.4 + c.seed));
}

function curl(o, c) {
  const d = c.d;
  const s = c.side;
  // En boule, couché sur le flanc (le ventre tourné vers +x quand s = 1) : la colonne s'enroule vers
  // le ventre, les pattes repliées au milieu, la tête rentrée vers les pattes arrière, à l'endroit
  // (oreilles en haut), et la queue fait le tour jusque devant le museau.
  const roll = 1.15;
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  o[ROLL] = roll * s;
  o[BODY_Y] = d.R * 0.85 - d.y0 * cr; // le flanc posé au sol
  o[BODY_X] = d.y0 * sr * s; // sans glisser sur le côté
  // Courbe « à plat » : mélange de courbe sur le côté et de dos rond selon l'inclinaison du corps.
  const bend = 0.52;
  o[BEND] = bend * cr * s;
  o[ARCH] = bend * sr;
  leg(o, 0, 0, -0.3, 0.5, 0.8);
  leg(o, 1, 0, -0.3, 0.5, 0.8);
  leg(o, 2, 0, -0.7, 0.3, -0.4);
  leg(o, 3, 0, -0.7, 0.3, -0.4);
  // Corps sur le flanc : baisser le cou ramène la tête vers le ventre, à plat ; la tête tourne
  // ensuite sur elle-même pour garder les oreilles en l'air.
  o[NECK_X] = 1.1;
  o[HEAD_X] = 0.2;
  o[HEAD_Z] = -1.3 * s;
  o[LIDS] = 1;
  o[EARS_BACK] = 0.15;
  // Queue enroulée vers le ventre, à plat sur le sol (même mélange que la colonne).
  o[TAIL_UP] = -0.6 * sr;
  o[TAIL_SIDE] = -0.6 * cr * s;
  o[TAIL_CURL] = -0.35 * sr;
  o[TAIL_WRAP] = -0.35 * cr * s;
}

function stretch(o, c) {
  const d = c.d;
  const k = c.stretch; // 0 → 1 pendant l'étirement
  // 1) l'avant s'allonge, la poitrine au sol, le derrière en l'air ; 2) une patte arrière tendue.
  const front = smooth(0, 0.2, k) * (1 - smooth(0.5, 0.65, k));
  const back = smooth(0.55, 0.7, k) * (1 - smooth(0.88, 1, k));
  const p = 0.4 * front - 0.08 * back;
  pivot(o, p, d.legTop, d.hipZ, d.legTop - 0.004, d.hipZ);
  const sy = o[BODY_Y] + d.legTop * Math.cos(p) - d.shoulderZ * Math.sin(p);
  const reach = -Math.acos(Math.min(1, Math.max(0.2, sy / d.legTop)));
  leg(o, 0, p, reach * front, reach * front, reach * front + 0.2 * front, 0.9);
  leg(o, 1, p, reach * front, reach * front, reach * front + 0.2 * front, 0.9);
  leg(o, 2, p, 0.3 * front + 0.9 * back, 0.3 * front + 0.9 * back, 0.3 * front + 1.0 * back);
  leg(o, 3, p, 0.3 * front, 0.3 * front, 0.3 * front);
  o[NECK_X] = -0.35 * front;
  o[HEAD_X] = -0.25 * front;
  o[LIDS] = 0.6 * front;
  o[EARS_BACK] = 0.35 * front;
  o[TAIL_UP] = 0.9;
  o[TAIL_CURL] = 0.05;
  o[TAIL_TIP] = 0.3;
}

function crouch(o, c) {
  // Accroupi pour manger : coudes bien pliés, l'avant plus bas.
  const p = 0.38;
  pivot(o, p, c.d.legTop, c.d.hipZ, c.d.legTop - 0.006, c.d.hipZ);
  leg(o, 0, p, 0.75, -0.9, 0.1);
  leg(o, 1, p, 0.75, -0.9, 0.1);
  leg(o, 2, p, -0.15, 0.25, -0.1);
  leg(o, 3, p, -0.15, 0.25, -0.1);
  // Le cou s'allonge vers le bas : le museau arrive dans la gamelle et mâchonne ; oreilles en avant.
  o[NECK_X] = 1.2 + Math.sin(c.t * 4) * 0.05;
  o[HEAD_X] = Math.sin(c.t * 8) * 0.05;
  o[EARS_BACK] = -0.1;
  o[TAIL_UP] = -0.4 - p * 0.8; // la queue reste basse malgré l'arrière relevé
  o[TAIL_CURL] = 0.12;
  o[TAIL_SIDE] = 0.6 * c.side;
  o[TAIL_WRAP] = 0.15 * c.side;
  o[TWITCH] = Math.sin(c.t * 4) * 0.3;
}

function highfive(o, c) {
  // Tour du spectacle : assis, une patte avant levée bien haut pour taper dans la main.
  sit(o, c);
  const p = c.d.sit.pitch;
  leg(o, c.side > 0 ? 0 : 1, p, -2.1, -2.7, -2.9);
  o[HEAD_Y] = 0;
  o[HEAD_X] -= 0.1;
  o[EARS_BACK] = -0.1;
}

const FN = { stand, move, sit, groom, loaf, curl, stretch, crouch, highfive };

// ------------------------------------------------------------------ animation

/** Anime un chat (AnimalEntity). sad : humeur triste (oreilles basses, queue basse). */
export function animateCat(e, dt, sad) {
  const md = e.model;
  const C = md.cat;
  const d = C.dims;
  if (!d.sit) d.sit = sitPose(d);
  const st = e.catAnim ?? (e.catAnim = {
    w: Object.fromEntries(POSES.map((p) => [p, p === 'stand' ? 1 : 0])),
    idle: 'stand', idleT: 1 + Math.random() * 2, still: 0, side: Math.random() < 0.5 ? 1 : -1,
    sub: 0, subT: 3, stretch: 0, blink: 3, blinkT: 0, flick: [0, 0], flickT: [2, 4], wasAsleep: false, seed: Math.random() * 10,
  });
  const t = e.time;
  const v = e.speed / Math.max(0.3, e.scale);
  const moving = e.speed > 0.05;
  const asleep = !!e.sleeping;

  // Quelle pose viser ?
  if (st.wasAsleep && !asleep) st.stretch = 0.0001; // au réveil, il s'étire
  st.wasAsleep = asleep;
  st.still = moving ? 0 : st.still + dt;
  let target;
  if (asleep) target = 'curl';
  else if (st.stretch > 0) {
    st.stretch += dt / 2.8;
    target = 'stretch';
    if (st.stretch >= 1) st.stretch = 0;
  } else if (moving) target = 'move';
  else if (e.state === 'eat' || (e.headDown ?? 0) > 0.5) target = 'crouch';
  else if (st.still < 1.2 || e.perch) target = 'stand';
  else {
    st.idleT -= dt;
    if (st.idleT <= 0) {
      const next = pickIdlePose({ personality: e.data.personality, energy: e.data.needs?.energy ?? 80, prev: st.idle });
      // Après s'être couché, il s'étire souvent en se relevant.
      if (st.idle === 'loaf' && next.pose !== 'loaf' && Math.random() < 0.5) st.stretch = 0.0001;
      st.idle = next.pose;
      st.idleT = next.duration;
      st.side = Math.random() < 0.5 ? 1 : -1;
    }
    target = st.idle;
  }
  if (e.catPoseOverride) target = e.catPoseOverride; // pose imposée (aperçus, captures)
  if (target === 'groom') {
    st.subT -= dt;
    if (st.subT <= 0) {
      st.sub = (st.sub + 1 + Math.floor(Math.random() * 2)) % 3;
      st.subT = 2.5 + Math.random() * 2.5;
    }
  }

  // Allure et phase des pattes.
  const run = smooth(1.7, 3, v);
  const stride = Math.max(0.12, d.legLen * (2.6 + run * 2.2));
  if (moving) e.phase += dt * (v / stride) * Math.PI * 2 * 0.5;

  // Mélange des poses (poids lissés : les poses se fondent l'une dans l'autre).
  ctx.t = t;
  ctx.d = d;
  ctx.ph = e.phase;
  ctx.run = run;
  ctx.amp = moving ? 0.32 + run * 0.4 : 0;
  ctx.side = st.side;
  ctx.sub = st.sub;
  ctx.stretch = st.stretch;
  ctx.seed = st.seed;
  ctx.perch = e.perch?.phase === 'on';
  ctx.tailHigh = !!e.data.following;
  acc.fill(0);
  let total = 0;
  for (const name of POSES) {
    const want = name === target ? 1 : 0;
    const rate = name === 'curl' || target === 'curl' ? 1.6 : name === 'move' || target === 'move' ? 6 : 3;
    st.w[name] += (want - st.w[name]) * Math.min(1, dt * rate);
    const w = st.w[name];
    if (w < 0.002) continue;
    tmp.fill(0);
    FN[name](tmp, ctx);
    for (let k = 0; k < N; k++) acc[k] += tmp[k] * w;
    total += w;
  }
  if (total > 0) for (let k = 0; k < N; k++) acc[k] /= total;

  // Clignements (plus lents et plus longs quand il est bien), oreilles qui frémissent.
  st.blink -= dt;
  if (st.blink <= 0) {
    st.blinkT = 0.16 + (Math.random() < 0.2 ? 0.5 : 0);
    st.blink = 2.5 + Math.random() * 4;
  }
  let blink = 0;
  if (st.blinkT > 0) {
    st.blinkT -= dt;
    blink = Math.min(1, Math.sin(Math.max(0, st.blinkT) * 20) * 1.5);
  }
  for (let i = 0; i < 2; i++) {
    st.flickT[i] -= dt;
    if (st.flickT[i] <= 0) {
      st.flick[i] = 1;
      st.flickT[i] = 2 + Math.random() * 6;
    }
    st.flick[i] = Math.max(0, st.flick[i] - dt * 5);
  }

  // Application au modèle.
  const body = md.body;
  const w = e.data.weight ?? 50;
  const girth = 1 + ((w - 50) / 50) * 0.2;
  const breathe = Math.sin(t * (asleep ? 1.3 : 2.6)) * (asleep ? 0.02 : 0.01);
  body.scale.set(girth + breathe, 1 + (girth - 1) * 0.4 + breathe, 1);
  body.position.set(acc[BODY_X], acc[BODY_Y] + (e.legLift ?? 0), acc[BODY_Z]);
  body.rotation.set(acc[PITCH], 0, acc[ROLL]);
  // Colonne : les os vers les épaules et vers les hanches tournent en miroir (courbe en C, dos rond).
  const sp = C.spine;
  if (sp) {
    for (let k = 1; k <= 3; k++) {
      sp[k].rotation.set(acc[ARCH], acc[BEND], 0);
      sp[k + 3].rotation.set(-acc[ARCH], -acc[BEND], 0);
    }
  }
  for (let i = 0; i < 4; i++) {
    const l = md.legs[i];
    l.pivot.rotation.x = acc[LEG + i];
    l.pivot.rotation.z = i >= 2 ? l.side * acc[SPLAY] : 0;
    l.pivot.scale.y = i < 2 ? 1 + acc[REACH] : 1;
    if (l.knee) l.knee.rotation.x = acc[KNEE + i];
    if (l.paw) l.paw.rotation.x = acc[PAW + i];
    if (l.toe) l.toe.rotation.x = acc[TOE + i];
  }
  const fear = e.state === 'flee' ? 1 : 0;
  const low = sad ? 1 : 0;
  md.neck.rotation.set(C.neckRest + acc[NECK_X] + low * 0.3, acc[NECK_Y], 0);
  md.head.rotation.set(md.headTilt + acc[HEAD_X], acc[HEAD_Y], acc[HEAD_Z]);
  // Chaton : grosse tête (grands yeux, grandes oreilles) par rapport au corps.
  md.head.scale.setScalar(e.stage === 'baby' ? 1.3 : e.stage === 'young' ? 1.12 : 1);
  // Queue.
  const bones = C.tailBones;
  const nb = bones.length;
  const tailDown = low * 0.6;
  for (let i = 0; i < nb; i++) {
    const b = bones[i];
    if (i === 0) {
      b.rotation.x = acc[TAIL_UP] - tailDown;
      b.rotation.y = acc[TAIL_SIDE];
    } else {
      const tip = i >= nb - 2 ? 1 : 0;
      b.rotation.x = acc[TAIL_CURL] + tip * acc[TAIL_TIP];
      b.rotation.y = acc[TAIL_WRAP] + Math.sin(t * 2.2 - i * 0.7) * 0.04 + tip * acc[TWITCH];
    }
  }
  const tailScale = 1 + fear * 0.45; // queue gonflée quand il a peur
  md.tail.scale.set(tailScale, tailScale, 1);
  // Assis ou couché : la queue se pose au sol et fait le tour des pattes (arc plus long couché).
  const wSit = st.w.sit + st.w.groom + st.w.highfive;
  const wLoaf = st.w.loaf;
  const wg = Math.min(1, (wSit + wLoaf) / Math.max(1e-3, total));
  if (wg > 0.01 && C.tailSeg && !C.traits.stubTail) {
    const k = wLoaf / (wSit + wLoaf);
    tailArc.rx = d.R * (1.2 + 0.1 * k);
    tailArc.rz = d.L * (0.32 + 0.18 * k);
    tailArc.cz = tailArc.rz * 0.9;
    tailArc.a1 = 3.4 - 0.8 * k;
    groundTail(md, C, wg, st.side, tailArc);
    if (acc[TWITCH]) bones[nb - 1].rotation.y += acc[TWITCH] * 0.5; // le bout frétille encore
  }
  // Oreilles : frémissements, elles pivotent un peu, se couchent quand il a peur ou qu'il est triste.
  const back = Math.min(1, acc[EARS_BACK] + fear * 0.9 + low * 0.45);
  md.ears.forEach((ear, i) => {
    const b = ear.userData.base;
    const s = ear.userData.side;
    const f = st.flick[i];
    ear.rotation.x = b.x - f * 0.3 - back * 0.55;
    ear.rotation.y = b.y + s * (Math.sin(t * 0.6 + i * 2 + st.seed) * 0.12 + back * 0.3);
    ear.rotation.z = b.z - s * (f * 0.18 + back * 0.55);
  });
  // Paupières.
  const lid = Math.max(acc[LIDS], blink);
  for (const l of C.lids) l.rotation.x = C.lidOpen + (C.lidShut - C.lidOpen) * lid;
}
