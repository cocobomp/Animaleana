// Voltige en 3D : ton cheval galope (ou marche) en cercle à main gauche, tenu à la longe par le longeur au centre ;
// ton avatar court à côté de lui, monte en s'aidant des poignées du surfaix, et fait les figures imposées sur son
// dos — assise de base, drapeau, moulin, ciseaux, debout, flanc — puis saute à terre et salue les juges. Pour
// débuter : le tonneau de voltige (un cheval de bois), toujours là.
//
// Le jeu : toucher l'écran au bon moment (l'anneau qui se resserre bat au rythme de la foulée) pour lancer chaque
// figure, puis glisser le doigt pour garder l'équilibre pendant qu'elle tient. Trois juges notent chaque figure sur 10.
// La logique (notes, rythme, équilibre, progrès) est dans src/sim/vaulting.js ; l'interface dans src/ui/vaulting.js.
// Séance enregistrée dans le registre SESSION_TYPES de src/game/Activities.js (type 'vaulting').

import * as THREE from 'three';
import { Session, SESSION_TYPES } from './Activities.js';
import { toWorld, practiceAward, addAward } from '../sim/activities.js';
import {
  VAULT_LEVELS, FIGURES, PROGRAM, CIRCLE_R, CIRCLE_AT, onCircle, tapError, tapQuality, tapGrade, TAP_LATENCY, balancePush, balanceAmp, leanOf,
  balanceScore, horseCalm, figureMark, judgesMarks, figureScore, judgeComment, vaultResult, vaultBlock,
  recordVault, vaultHorseEffect, barrelReward,
} from '../sim/vaulting.js';
import { NATURAL_SPEED } from './models/horseReal.js';
import { buildAvatar, animateAvatarWalk, updateAvatarLife } from './models/avatarModel.js';
import { legReach, footTo, armIK, rootToTorso, RIG } from './models/avatarRig.js';
import { disposeModel } from './models/animalModel.js';
import { bakeMeshes } from './models/tackModels.js';
import { rayHit } from './models/sdf.js';
import { circleTrack, vaultBarrel, lungeWhip, ribbon, sagPoints, judgesTable } from './models/vaultingProps.js';
import { VaultHud, showVaultResults, fmtMark } from '../ui/vaulting.js';
import { addStat, isSandbox } from '../sim/profile.js';
import { t, ta } from '../i18n.js';

const HIP = RIG.hipY;
/**
 * La main sur une poignée : le milieu de la paume 4 cm au-dessus du milieu du cuir de l'anse (la paume posée dessus,
 * les doigts qui l'entourent ; à 2,5 cm, la poignée traversait la main), le poignet plié pour que les doigts
 * passent devant.
 */
const GRIP_UP = 0.04;
const GRIP_FLEX = 0.55;
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (u) => u * u * (3 - 2 * u);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// vecteurs de travail (pas d'allocation par image)
const _v = V();
const _w = V();
const _p = V();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _qf = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _s = V(1, 1, 1);
const ONE = V(1, 1, 1);
const UP = V(0, 1, 0);

// ---------------------------------------------------------------- ce sur quoi on voltige

/** Sommets du dessus du dos (sur l'échine) aux z donnés (repère du corps) : le plus haut à moins de 3 cm. */
function backVertices(coat, zs) {
  const pos = coat.geometry.attributes.position;
  return zs.map((z) => {
    let best = -1;
    let y = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getX(i)) > 0.04 || Math.abs(pos.getZ(i) - z) > 0.03) continue;
      if (pos.getY(i) > y) {
        y = pos.getY(i);
        best = i;
      }
    }
    return best;
  });
}

/**
 * Le cheval : repère « du tapis » (origine sur le dessus du tapis, au siège ; x à sa gauche, y en haut, z vers
 * l'avant, en mètres), mis à jour à chaque image d'après l'os du tronc ; puis posé sur la peau du dos telle qu'elle
 * est à cette image (au galop, le dos ne suit pas tout à fait l'os : le voltigeur flottait de 15 cm au-dessus).
 */
function horseMount(e) {
  const md = e.model;
  const sur = e.gearGroup?.userData.surcingle;
  const L = md.dims?.L ?? 1.5;
  const zSeat = -L * 0.05;
  const PAD = 0.045; // tapis de voltige (mousse et écart), le dessus
  const back = (z) => md.backTop?.(z) ?? md.saddleY;
  const seatB = V(0, back(zSeat) + PAD, zSeat);
  // Le dessus du dos, lu sur la peau à quatre endroits (devant le siège, au siège, derrière, aux reins).
  const coat = md.coatMesh?.isSkinnedMesh ? md.coatMesh : null;
  const SZ = [0.18, 0, -0.25, -0.5];
  const zs = SZ.map((dz) => zSeat + dz);
  const ids = coat ? backVertices(coat, zs) : [];
  const ok = coat && ids.every((i) => i >= 0);
  const tops = SZ.map(() => 0); // hauteur du dessus (repère du tapis) à chaque z de SZ
  let lift = 0; // (lissé : la peau tremble un peu d'une image à l'autre)
  const m = {
    kind: 'horse', frame: new THREE.Matrix4(), inv: new THREE.Matrix4(), pos: V(), quat: new THREE.Quaternion(), scale: 1,
    grips: [V(0.08, 0.15, 0.25), V(-0.08, 0.15, 0.25)], wL: 0.32, ground: -1.6,
    update(world) {
      e.root.updateMatrixWorld(true);
      md.body.matrixWorld.decompose(_v, m.quat, _s);
      m.scale = _s.y;
      m.pos.copy(seatB).applyMatrix4(md.body.matrixWorld);
      if (ok) {
        // la peau au siège : de combien est-elle sous (ou sur) l'os, le long du « haut » du tronc
        _w.set(0, 1, 0).applyQuaternion(m.quat);
        coat.getVertexPosition(ids[1], _p).applyMatrix4(coat.matrixWorld);
        _v.copy(_p).sub(m.pos);
        const d = _v.dot(_w) + PAD * m.scale;
        lift = Math.abs(lift - d) > 0.3 ? d : lift + (d - lift) * 0.5;
        m.pos.addScaledVector(_w, lift);
      }
      m.frame.compose(m.pos, m.quat, ONE);
      m.inv.copy(m.frame).invert();
      m.ground = world.heightAt(m.pos.x, m.pos.z) - m.pos.y;
      if (ok) {
        for (let k = 0; k < SZ.length; k++) {
          coat.getVertexPosition(ids[k], _p).applyMatrix4(coat.matrixWorld).applyMatrix4(m.inv);
          tops[k] = _p.y + PAD * m.scale;
        }
      }
    },
    topAt(z) {
      if (!ok) return (back(zSeat + z / m.scale) - back(zSeat)) * m.scale;
      // entre les sommets lus (z décroissant), prolongé au-delà
      const u = z / m.scale;
      let k = 0;
      while (k < SZ.length - 2 && u < SZ[k + 1]) k++;
      const f = (u - SZ[k]) / (SZ[k + 1] - SZ[k]);
      return tops[k] + (tops[k + 1] - tops[k]) * f;
    },
  };
  m.update(e.world);
  if (sur) {
    m.grips = sur.grips.map((g) => g.clone().applyMatrix4(md.body.matrixWorld).applyMatrix4(m.inv));
    m.rings = sur.rings;
  }
  // Demi-largeur des flancs, 25 cm sous le dessus (là où passent les cuisses), tapis compris.
  if (md.sdf?.torso) {
    const fat = md.body.scale.x || 1;
    const p = rayHit(md.sdf.torso, [0, back(zSeat) - 0.25 / m.scale, zSeat], [1, 0, 0], 1.5);
    m.wL = p.x * m.scale * fat + 0.05;
  }
  return m;
}

/** Le tonneau : même repère, fixe. */
function barrelMount(group, world) {
  const u = group.userData;
  const m = {
    kind: 'barrel', frame: new THREE.Matrix4(), inv: new THREE.Matrix4(), pos: V(), quat: new THREE.Quaternion(), scale: 1,
    grips: [], wL: u.width + 0.03, ground: -u.top,
    update() {
      group.updateMatrixWorld(true);
      m.pos.copy(u.seat).applyMatrix4(group.matrixWorld);
      group.getWorldQuaternion(m.quat);
      m.frame.compose(m.pos, m.quat, ONE);
      m.inv.copy(m.frame).invert();
      m.ground = world.heightAt(m.pos.x, m.pos.z) - m.pos.y;
    },
    topAt(z) {
      return z < -0.45 || z > 0.32 ? -0.04 : 0;
    },
  };
  m.update();
  m.grips = u.grips.map((g) => g.clone().applyMatrix4(group.matrixWorld).applyMatrix4(m.inv));
  return m;
}

// ---------------------------------------------------------------- cadrer un groupe

const _fitCam = new THREE.PerspectiveCamera();
const _fitV = V();

/**
 * Visée d'un plan (caméra en az / pitch autour de la visée, à la distance d) qui place le point mid au milieu de la
 * partie libre de l'écran (frame.box : x0, x1, y0, y1 de -1 à 1) au lieu du milieu de l'écran. frame : { fov, aspect,
 * box, az, pitch }. Renvoie la visée (dans out).
 */
export function shotAim(mid, d, frame, out = V()) {
  const { az, pitch, box } = frame;
  const tanV = Math.tan((frame.fov * Math.PI) / 360);
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  // (droite et haut de la caméra)
  const rx = Math.cos(az);
  const rz = -Math.sin(az);
  const ux = -Math.sin(az) * Math.sin(pitch);
  const uy = Math.cos(pitch);
  const uz = -Math.cos(az) * Math.sin(pitch);
  const kx = -cx * d * tanV * frame.aspect;
  const ky = -cy * d * tanV;
  return out.set(mid.x + rx * kx + ux * ky, mid.y + uy * ky, mid.z + rz * kx + uz * ky);
}

/** Tous les points pts sont-ils dans la partie libre de l'écran, vus de ce plan (visée at, distance d) ? */
export function shotFits(pts, at, d, frame) {
  const { az, pitch, box } = frame;
  const c = _fitCam;
  c.fov = frame.fov;
  c.aspect = frame.aspect;
  c.near = 0.1;
  c.far = 500;
  c.updateProjectionMatrix();
  c.position.set(at.x + Math.sin(az) * Math.cos(pitch) * d, at.y + Math.sin(pitch) * d, at.z + Math.cos(az) * Math.cos(pitch) * d);
  c.lookAt(at);
  c.updateMatrixWorld(true);
  for (const q of pts) {
    _fitV.copy(q).project(c);
    if (_fitV.x < box.x0 || _fitV.x > box.x1 || _fitV.y < box.y0 || _fitV.y > box.y1) return false;
  }
  return true;
}

/**
 * Cap du plan large (vu depuis pref, le côté des juges), d'après la ligne avatar → cheval (line) : en hauteur, tourné
 * vers cette ligne (ils s'étagent dans la profondeur) ; en paysage, en travers (ils s'étalent en largeur). Au plus de
 * 0,6 rad, et sans à-coup quand la ligne tourne (sin 2·écart).
 */
export const wideAzimuth = (pref, line, portrait) => pref + (portrait ? 0.6 : -0.6) * Math.sin(2 * wrap(line - pref));

/** La plus petite distance (de 5 à 40 m) où tous les points tiennent dans la partie libre de l'écran. */
export function fitDistance(pts, mid, frame) {
  const at = V();
  let d = 5;
  while (d < 40 && !shotFits(pts, shotAim(mid, d, frame, at), d, frame)) d += 0.75;
  return d;
}

// ---------------------------------------------------------------- les poses

/**
 * Une pose du voltigeur, dans le repère du tapis : hip (milieu des hanches), yaw / pitch / roll (le corps : 0 face
 * à l'avant ; yaw π/2 face à l'intérieur du cercle, à gauche du cheval), bend / twist / side (le buste), head,
 * legs (chevilles : at dans le repère du tapis ou local dans celui du corps, pole = où va le genou, repère du corps ;
 * toe : pointe de pied tendue ; flat : pied à plat sur le tapis), arms (mains : at, local, ou grip 0 / 1 = la
 * poignée gauche / droite ; pole = où va le coude, repère du corps ; hand : rotation de la main).
 */
function pose(spec) {
  return {
    hip: [0, 0.085, -0.03], yaw: 0, pitch: 0, roll: 0, bend: 0.05, twist: 0, side: 0, head: [-0.05, 0],
    ...spec,
  };
}

/** Les poses clés, d'après la forme de ce sur quoi on voltige (largeur des flancs, sol). */
function makePoses(mt) {
  const w = mt.wL;
  const G = mt.ground;
  const top = (z) => mt.topAt(z);
  const leg = (x, y, z, pole, extra = {}) => ({ at: [x, y, z], pole, toe: 0.75, ...extra });
  // (jambes pendantes : 60 cm sous le dessus du tapis, mais jamais à moins de 32 cm du sol — un grand poney)
  const low = (y) => Math.max(y, G + 0.32);
  const hang = (s, z = 0.06) => leg(s * (w + 0.05), low(-0.6), z, [s * 0.35, -0.1, 1]);
  const grip = (k, pole) => ({ grip: k, pole, hand: [GRIP_FLEX, 0, 0] });
  const pad = (x, z, pole) => ({ at: [x, top(z) + 0.035, z], pole, hand: [0.5, 0, 0] });
  const P = {};
  // Assise : en avant, les mains aux poignées ; puis bras écartés (l'assise de base).
  P.seatGrip = pose({ legs: [hang(1), hang(-1)], arms: [grip(0, [0.6, -1, -0.3]), grip(1, [-0.6, -1, -0.3])], bend: 0.1 });
  P.seat = pose({
    legs: [hang(1), hang(-1)], bend: -0.02, head: [-0.12, 0],
    arms: [{ local: [0.7, 1.34, 0.08], pole: [0.1, -1, -0.4], hand: [0, 0, -0.2] }, { local: [-0.7, 1.34, 0.08], pole: [-0.1, -1, -0.4], hand: [0, 0, 0.2] }],
  });
  // À genoux (deux genoux sur le tapis), puis le drapeau : jambe droite tendue en arrière, bras gauche en avant.
  // Le genou posé sur le tapis (son centre 6 cm au-dessus), le tibia couché vers l'arrière ; la hanche à la longueur
  // de la cuisse du genou, reculée de back (assis vers les talons) : hipOn(zk, back) donne sa hauteur.
  const knee = (x, zk, extra = {}) => leg(x, top(zk - 0.35) + 0.06, zk - 0.35, [0, -1, 0.35], { toe: 1.35, ...extra });
  const hipOn = (zk, backBy) => top(zk) + 0.06 + Math.sqrt(0.4 * 0.4 - backBy * backBy) - 0.005;
  P.kneel = pose({
    hip: [0, hipOn(0, 0.2), -0.2], bend: 1.2, head: [-0.85, 0],
    legs: [knee(0.11, 0), knee(-0.11, 0)],
    arms: [grip(0, [0.5, -1, -0.4]), grip(1, [-0.5, -1, -0.4])],
  });
  P.flag = pose({
    hip: [0.04, hipOn(-0.08, 0.06), -0.14], bend: 1.35, side: -0.04, head: [-1.25, 0],
    legs: [knee(0.11, -0.08), { local: [-0.13, HIP + 0.12, -0.76], pole: [0, 1, 0], toe: 0.9 }],
    arms: [{ local: [0.17, 1.02, 1.02], pole: [0.3, -1, 0], hand: [0, 0, -0.3] }, { local: [-0.33, 0.84, 0.12], pole: [-0.4, 0.2, 1], hand: [0, 0, 0.3] }],
  });
  // Moulin : assis de côté (face à l'intérieur), à l'envers, de l'autre côté, puis en avant ; une jambe passe par-dessus
  // l'encolure ou la croupe à chaque quart.
  const sideLegs = (s) => [leg(s * (w + 0.12), low(-0.5), -s * 0.1, [0, 0.3, 1]), leg(s * (w + 0.12), low(-0.5), s * 0.1, [0, 0.3, 1])];
  P.sideL = pose({ hip: [0.03, 0.085, -0.04], yaw: Math.PI / 2, legs: sideLegs(1), bend: 0.05, arms: [pad(0.06, -0.32, [0.3, -1, -0.3]), grip(0, [-0.3, -1, -0.2])] });
  P.back = pose({
    hip: [0, 0.085, -0.08], yaw: Math.PI, bend: 0.3, head: [-0.25, 0],
    legs: [leg(-(w + 0.05), -0.6, -0.16, [0.35, -0.1, 1]), leg(w + 0.05, -0.6, -0.16, [-0.35, -0.1, 1])],
    arms: [pad(-0.12, -0.42, [0.5, -1, -0.2]), pad(0.12, -0.42, [-0.5, -1, -0.2])],
  });
  P.sideR = pose({ hip: [-0.03, 0.085, -0.04], yaw: Math.PI * 1.5, legs: [leg(-(w + 0.12), -0.5, 0.1, [0, 0.3, 1]), leg(-(w + 0.12), -0.5, -0.1, [0, 0.3, 1])], bend: 0.05, arms: [grip(1, [0.3, -1, -0.2]), pad(-0.06, -0.32, [-0.3, -1, -0.3])] });
  P.seat2 = { ...P.seatGrip, yaw: TAU };
  // Une jambe tendue qui passe par-dessus (au milieu du quart) : haut au-dessus de l'encolure (avant) ou de la croupe.
  const over = (yaw, hip, legs, arms, bend = -0.15) => pose({ hip, yaw, legs, arms, bend, head: [-0.1, 0] });
  const lift = (x, z) => ({ at: [x, 0.7, z], pole: [0, 1, 0], toe: 1 });
  // (penché un peu en avant, les hanches avancées : la main garde sa poignée pendant que la jambe passe)
  P.q1 = over(Math.PI * 0.25, [0.04, 0.11, 0.04], [hang(1), lift(-0.02, 0.62)], [grip(0, [0.6, -1, -0.3]), { local: [-0.55, HIP + 0.85, 0.15], pole: [-0.2, -1, 0], hand: [0, 0, 0.3] }], 0.3);
  P.q2 = over(Math.PI * 0.75, [0.02, 0.11, -0.06], [lift(0.04, -0.7), leg(w + 0.1, -0.52, 0.04, [0, 0.3, 1])], [pad(0.02, -0.36, [0.4, -1, -0.2]), grip(0, [-0.4, -1, -0.2])], 0.3);
  P.q3 = over(Math.PI * 1.25, [-0.02, 0.11, -0.06], [leg(-(w + 0.1), -0.52, 0.04, [0, 0.3, 1]), lift(-0.04, -0.7)], [grip(1, [0.4, -1, -0.2]), pad(-0.02, -0.36, [-0.4, -1, -0.2])], 0.3);
  P.q4 = over(Math.PI * 1.75, [-0.04, 0.11, 0.04], [lift(0.02, 0.62), hang(-1)], [{ local: [0.55, HIP + 0.85, 0.15], pole: [0.2, -1, 0], hand: [0, 0, -0.3] }, grip(1, [-0.6, -1, -0.3])], 0.3);
  // Ciseaux : élan, jambes en l'air qui se croisent au-dessus des poignées (demi-tour), assis à l'envers ; puis retour.
  const straight = (x, y, z) => ({ local: [x, y, z], pole: [0, 0, 1], toe: 1.1 });
  const armsGrip = [grip(0, [0.7, -0.3, -0.6]), grip(1, [-0.7, -0.3, -0.6])];
  P.backGrip = pose({ ...P.back, bend: -0.1, head: [-0.05, 0], arms: [grip(1, [0.5, -1, 0.4]), grip(0, [-0.5, -1, 0.4])] });
  P.sc1 = pose({ hip: [0, 0.5, -0.1], pitch: 1.15, bend: 0.2, head: [-0.6, 0], legs: [straight(0.12, -0.05, -0.1), straight(-0.12, -0.05, -0.1)], arms: armsGrip });
  P.sc2 = pose({ hip: [0, 0.98, 0.1], yaw: Math.PI * 0.5, pitch: 2.5, bend: 0.15, head: [-0.9, 0], legs: [straight(0.32, -0.02, 0.28), straight(-0.3, 0.02, -0.26)], arms: armsGrip });
  // (après le demi-tour : on redescend tourné vers l'arrière, les jambes de chaque côté, juste au-dessus du dos, les
  // mains toujours aux poignées, derrière soi — à 0,5 m de haut, penché vers la croupe, elles lâchaient de 48 cm)
  P.sc3 = pose({ ...P.backGrip, hip: [0, 0.17, 0.02], pitch: -0.3, bend: 0.12, head: [-0.3, 0], legs: [leg(-(w + 0.08), low(-0.45), -0.12, [0.35, -0.1, 1]), leg(w + 0.08, low(-0.45), -0.12, [-0.35, -0.1, 1])] });
  P.sc4 = pose({ hip: [0, 0.98, 0.1], yaw: Math.PI * 1.5, pitch: 2.5, bend: 0.15, head: [-0.9, 0], legs: [straight(0.32, -0.02, 0.28), straight(-0.3, 0.02, -0.26)], arms: armsGrip });
  P.sc5 = pose({ hip: [0, 0.4, -0.08], yaw: TAU, pitch: 0.9, bend: 0.2, head: [-0.4, 0], legs: [straight(0.12, -0.05, -0.1), straight(-0.12, -0.05, -0.1)], arms: armsGrip });
  // Debout : accroupi les pieds sur le tapis, puis debout, genoux souples, les bras tendus sur les côtés, les mains
  // à hauteur des yeux (comme en vraie voltige).
  const feet = (z1, z2) => [leg(0.13, top(z1) + 0.065, z1, [0.25, 0, 1], { flat: true }), leg(-0.13, top(z2) + 0.065, z2, [-0.25, 0, 1], { flat: true })];
  P.crouch = pose({ hip: [0, top(-0.15) + 0.38, -0.12], bend: 0.95, head: [-0.6, 0], legs: feet(-0.04, -0.1), arms: [grip(0, [0.6, -1, -0.4]), grip(1, [-0.6, -1, -0.4])] });
  P.stand = pose({
    hip: [0, top(-0.15) + 0.775, -0.16], bend: 0.1, head: [-0.08, 0], legs: feet(-0.08, -0.24),
    arms: [{ local: [0.68, RIG.shoulderY + 0.11, 0.12], pole: [0.2, -1, -0.3], hand: [0, 0, -0.25] }, { local: [-0.68, RIG.shoulderY + 0.11, 0.12], pole: [-0.2, -1, -0.3], hand: [0, 0, 0.25] }],
  });
  // Flanc : élan, le corps à l'horizontale de côté au-dessus du cheval, puis assis de côté, face à l'intérieur.
  P.fl1 = pose({ hip: [-0.04, 0.5, -0.08], pitch: 1.1, roll: 0.25, bend: 0.2, head: [-0.6, 0], legs: [straight(0.12, -0.05, -0.12), straight(-0.12, -0.05, -0.12)], arms: armsGrip });
  P.fl2 = pose({ hip: [-0.44, 0.64, 0.32], yaw: Math.PI / 2, pitch: 1.45, roll: 0, bend: 0.05, head: [-0.4, 0], legs: [straight(0.12, -0.02, 0), straight(-0.12, -0.02, 0)], arms: [grip(0, [0.5, -0.2, -0.8]), grip(1, [-0.5, -0.2, -0.8])] });
  // (assis de côté avant la 2e partie : la main droite à la poignée intérieure, la gauche à plat sur le tapis derrière
  // — tendue vers l'autre poignée, elle restait à 17 cm dans le vide)
  P.sideLGrip = pose({ ...P.sideL, arms: [pad(0.05, -0.26, [0.3, -1, -0.3]), grip(0, [-0.3, -1, -0.2])] });
  // Flanc, 2e partie : de l'assise de côté, élan des deux jambes serrées vers le haut, par-dessus le dos du cheval
  // (vers l'extérieur), le corps tendu, les hanches plus haut que les épaules, les mains aux poignées ; puis on
  // repousse et on redescend côté intérieur.
  P.fl3 = pose({
    hip: [-0.3, 0.75, 0.08], yaw: Math.PI / 2, pitch: 2.3, bend: 0.05, head: [-0.5, 0],
    legs: [straight(0.08, -0.02, 0), straight(-0.08, -0.02, 0)], arms: [grip(0, [0.5, -0.2, -0.8]), grip(1, [-0.5, -0.2, -0.8])],
  });
  // Saut à terre (côté intérieur), puis réception les genoux pliés.
  P.off1 = pose({ hip: [0.42, 0.18, 0.02], yaw: Math.PI / 2, pitch: 0.3, bend: 0.2, legs: [leg(w + 0.45, -0.5, -0.1, [0, 0.2, 1]), leg(w + 0.45, -0.5, 0.1, [0, 0.2, 1])], arms: [grip(1, [0.2, -1, 0.3]), grip(0, [-0.3, -1, -0.2])] });
  P.off2 = pose({ hip: [w + 0.62, G + 1.05, 0.05], yaw: Math.PI * 0.35, pitch: 0.1, bend: 0.15, legs: [leg(w + 0.68, G + 0.3, -0.05, [0.2, 0, 1]), leg(w + 0.62, G + 0.3, 0.15, [0.2, 0, 1])], arms: [{ local: [0.45, HIP + 0.75, 0.25], pole: [0.3, -1, 0] }, { local: [-0.45, HIP + 0.75, 0.25], pole: [-0.3, -1, 0] }] });
  P.land = pose({ hip: [w + 0.66, G + 0.66, 0.15], yaw: Math.PI * 0.12, bend: 0.35, head: [-0.3, 0], legs: [leg(w + 0.76, G + 0.065, 0.12, [0.2, 0, 1], { flat: true }), leg(w + 0.56, G + 0.065, 0.2, [-0.2, 0, 1], { flat: true })], arms: [{ local: [0.4, HIP + 0.55, 0.25], pole: [0.3, -1, 0] }, { local: [-0.4, HIP + 0.55, 0.25], pole: [-0.3, -1, 0] }] });
  // Montée : courir à côté, attraper les poignées, sauter, la jambe droite passe par-dessus le dos (vers l'arrière).
  P.run = pose({ hip: [w + 0.42, G + HIP, 0.08], bend: 0.15, legs: [leg(w + 0.5, G + 0.065, 0.12, [0, 0, 1], { flat: true }), leg(w + 0.36, G + 0.065, 0.02, [0, 0, 1], { flat: true })], arms: [grip(0, [0.6, -1, -0.4]), grip(1, [-0.3, -1, -0.4])] });
  P.m1 = pose({ hip: [w + 0.25, G + 1.1, 0.0], pitch: 0.25, roll: 0.25, bend: 0.2, head: [-0.3, 0], legs: [leg(w + 0.35, G + 0.45, 0.08, [0, -0.3, 1]), { local: [-0.15, HIP - 0.35, -0.68], pole: [0, -1, 0], toe: 1 }], arms: armsGrip });
  P.m2 = pose({ hip: [0.14, 0.32, -0.06], pitch: 0.35, roll: 0.45, bend: 0.25, head: [-0.4, 0], legs: [leg(w + 0.1, -0.35, 0.06, [0.2, -0.3, 1]), { local: [-0.2, HIP - 0.05, -0.72], pole: [0, -1, 0], toe: 1 }], arms: armsGrip });
  P.m3 = pose({ ...P.seatGrip, hip: [0.02, 0.12, -0.04], legs: [hang(1), leg(-(w + 0.15), -0.45, -0.2, [-0.35, -0.1, 1])] });
  return P;
}

/** Pose résolue : tout dans le repère du tapis (positions, orientation du corps). */
function resolve(P, mt) {
  _e.set(P.pitch, P.yaw, P.roll, 'YXZ');
  const q = new THREE.Quaternion().setFromEuler(_e);
  const hip = V(...P.hip);
  const rootPos = hip.clone().sub(V(0, HIP, 0).applyQuaternion(q));
  const toPad = (local) => V(...local).applyQuaternion(q).add(rootPos);
  const end = (s, isArm) => {
    let at;
    if (s.grip !== undefined) at = mt.grips[s.grip].clone().add(V(0, GRIP_UP, 0));
    else if (s.local) at = toPad(s.local);
    else at = V(...s.at);
    void isArm;
    return { at, pole: V(...(s.pole ?? [0, 0, 1])).normalize(), toe: s.toe ?? 0, flat: s.flat ? 1 : 0, hand: s.hand ?? [0, 0, 0] };
  };
  return {
    hip, q, bend: P.bend, twist: P.twist, side: P.side, head: [...P.head],
    legs: P.legs.map((s) => end(s, false)), arms: P.arms.map((s) => end(s, true)),
  };
}

/** Mélange de deux poses résolues (u de 0 à 1). */
function blend(A, B, u, out) {
  out.hip.lerpVectors(A.hip, B.hip, u);
  out.q.slerpQuaternions(A.q, B.q, u);
  out.bend = A.bend + (B.bend - A.bend) * u;
  out.twist = A.twist + (B.twist - A.twist) * u;
  out.side = A.side + (B.side - A.side) * u;
  out.head[0] = A.head[0] + (B.head[0] - A.head[0]) * u;
  out.head[1] = A.head[1] + (B.head[1] - A.head[1]) * u;
  for (const k of ['legs', 'arms']) {
    for (let i = 0; i < 2; i++) {
      const a = A[k][i];
      const b = B[k][i];
      const o = out[k][i];
      o.at.lerpVectors(a.at, b.at, u);
      o.pole.lerpVectors(a.pole, b.pole, u).normalize();
      o.toe = a.toe + (b.toe - a.toe) * u;
      o.flat = a.flat + (b.flat - a.flat) * u;
      for (let j = 0; j < 3; j++) o.hand[j] = a.hand[j] + (b.hand[j] - a.hand[j]) * u;
    }
  }
  return out;
}

const copyResolved = (A) => ({
  hip: A.hip.clone(), q: A.q.clone(), bend: A.bend, twist: A.twist, side: A.side, head: [...A.head],
  legs: A.legs.map((l) => ({ ...l, at: l.at.clone(), pole: l.pole.clone(), hand: [...l.hand] })),
  arms: A.arms.map((l) => ({ ...l, at: l.at.clone(), pole: l.pole.clone(), hand: [...l.hand] })),
});

/**
 * Pose l'avatar a (enfant de parent, le groupe du joueur) dans la pose résolue R, sur ce sur quoi on voltige (mt).
 * lean : penché de l'équilibre (le buste et la tête s'inclinent de côté).
 */
function applyPose(a, R, mt, parent, lean = 0) {
  // Racine de l'avatar : la hanche à sa place, le corps orienté.
  const rootPos = _p.set(0, HIP, 0).applyQuaternion(R.q).negate().add(R.hip);
  _m.compose(rootPos, R.q, ONE).premultiply(mt.frame); // monde
  parent.updateMatrixWorld(true);
  _m2.copy(parent.matrixWorld).invert().multiply(_m);
  _m2.decompose(a.root.position, a.root.quaternion, _s);
  // Buste et tête.
  a.torso.rotation.set(R.bend, R.twist, R.side + lean * 0.3);
  a.head.rotation.set(R.head[0], R.head[1], -lean * 0.22);
  if (a.chest) a.chest.scale.set(1, 1, 1);
  // Repère du tapis → repère du corps : inverse de (rootPos, q).
  _qi.copy(R.q).invert();
  for (let i = 0; i < 2; i++) {
    const L = R.legs[i];
    _v.copy(L.at).sub(rootPos).applyQuaternion(_qi);
    legReach(a, i, _v, L.pole);
    if (a.ankles) {
      if (L.flat > 0.5) {
        // à plat sur le tapis (ou le sol), la pointe tournée comme le corps
        _w.set(0, 0, 1).applyQuaternion(R.q);
        footTo(a, i, _q.copy(_qi).multiply(_qf.setFromAxisAngle(UP, Math.atan2(_w.x, _w.z))));
      }
      else a.ankles[i].rotation.set(L.toe, 0, 0); // pointe tendue
    }
  }
  for (let i = 0; i < 2; i++) {
    const A = R.arms[i];
    a.arms[i].rotation.set(0, 0, 0);
    a.elbows[i].rotation.set(-0.3, 0, 0);
    _v.copy(A.at).sub(rootPos).applyQuaternion(_qi);
    rootToTorso(a, _v);
    _w.copy(A.pole).applyQuaternion(_q.copy(a.torso.quaternion).invert());
    armIK(a, i, _v, _w, 1);
    a.hands[i].rotation.set(A.hand[0], A.hand[1], A.hand[2]);
  }
}

// ---------------------------------------------------------------- le programme

/**
 * Les étapes de la séance : la montée, puis chaque figure (une étape par toucher). move : les poses de la
 * transition ; hold : la pose tenue (équilibre) ; back : le retour à l'assise après la figure tenue.
 */
const STEPS = [
  { fig: 'mount', part: 0, move: ['run', 'm1', 'm2', 'm3', 'seatGrip'] },
  { fig: 'basicSeat', part: 0, move: ['seatGrip', 'seat'], hold: 'seat', back: ['seat', 'seatGrip'] },
  { fig: 'flag', part: 0, move: ['seatGrip', 'kneel', 'flag'], hold: 'flag', back: ['flag', 'kneel', 'seatGrip'] },
  { fig: 'mill', part: 0, move: ['seatGrip', 'q1', 'sideL'] },
  { fig: 'mill', part: 1, move: ['sideL', 'q2', 'back'] },
  { fig: 'mill', part: 2, move: ['back', 'q3', 'sideR'] },
  { fig: 'mill', part: 3, move: ['sideR', 'q4', 'seat2'], reset: true },
  { fig: 'scissors', part: 0, move: ['seatGrip', 'sc1', 'sc2', 'sc3', 'backGrip'] },
  { fig: 'scissors', part: 1, move: ['backGrip', 'sc3', 'sc4', 'sc5', 'seat2'], reset: true },
  { fig: 'stand', part: 0, move: ['seatGrip', 'kneel', 'crouch', 'stand'], hold: 'stand', back: ['stand', 'crouch', 'seatGrip'] },
  { fig: 'flank', part: 0, move: ['seatGrip', 'fl1', 'fl2', 'sideLGrip'] },
  { fig: 'flank', part: 1, move: ['sideLGrip', 'fl3', 'off1', 'off2', 'land'], dismount: true },
];

// ---------------------------------------------------------------- la séance

class VaultingSession extends Session {
  constructor(mgr, type, opts) {
    super(mgr, type, opts);
    const g = this.game;
    document.body.classList.add('actv-nomove', 'vt-on');
    this.level = VAULT_LEVELS[opts.level] ? opts.level : 'walk';
    this.L = VAULT_LEVELS[this.level];
    const a = this.L.horse ? opts.animal : null;
    const why = vaultBlock(a, this.level, g.profile);
    if (why) {
      if (a) g.ui.toast(ta(`vt_why_${why}`, a), 5000);
      else g.ui.toast(t(`vt_why_${why}`), 5000);
      this.ok = false;
      return;
    }
    this.animal = a;
    if (g.player.mount) g.dismount({ card: false });
    this.e = a ? g.entities.get(a.id) : null;
    if (a && !this.e) {
      g.ui.toast(ta('actv_why_notHere', a), 4000);
      this.ok = false;
      return;
    }
    this.calm = horseCalm(a);
    this.center = toWorld(CIRCLE_AT);
    this.cy = this.y(this.center.x, this.center.z);
    this.props = new THREE.Group();
    g.scene.add(this.props);
    this.sharedMats = new Set();
    this.buildScene();
    // L'avatar : on le pose nous-mêmes (Player.update ne fait que l'animer à pied, avant nous).
    this.pl = g.player;
    this.av = g.player.avatar;
    this.pl.cancelGoTo();
    this.camMode = g.rig.mode;
    g.rig.mode = 'third';
    this.cur = null; // pose résolue en cours
    this.ground = { x: this.center.x + 1.6, z: this.center.z - 1.2, h: 0, speed: 0, phase: 0 };
    this.mode = 'ground';
    this.figures = [];
    this.taps = [];
    this.stepI = -1;
    this.lean = 0;
    this.control = 0;
    this.hud2 = new VaultHud(this.hud, {
      onTap: (ts) => this.tap(ts),
      onDrag: (d) => { this.control = clamp(this.control + d, -1.2, 1.2); },
    });
    this.hud.hint(this.e ? ta(`vt_hint_${this.level}`, this.animal) : t('vt_hint_barrel'), 7000);
    this.hud.setMain(null); // (le gros bouton rond du rythme : VaultHud)
    this.hud.fade();
    this.refreshHud();
    // Départ : le cheval tourne déjà ; le voltigeur salue les juges, près du longeur.
    this.phase = 'salute';
    this.placeStart();
  }

  // ------------------------------------------------------------ le décor

  buildScene() {
    const g = this.game;
    const c = this.center;
    const track = circleTrack(CIRCLE_R, 1.6);
    track.position.set(c.x, this.cy + 0.012, c.z);
    this.group.add(track);
    // La table des juges, au bord de la carrière, face au cercle (côté −z).
    const jt = toWorld({ x: CIRCLE_AT.x, z: CIRCLE_AT.z - CIRCLE_R - 3.6 });
    this.judgeAt = V(jt.x, this.y(jt.x, jt.z), jt.z);
    const table = judgesTable();
    table.position.copy(this.judgeAt);
    this.props.add(table);
    // Trois juges assis (immobiles : fusionnés en peu de maillages).
    const looks = [
      { skin: 0xe8b796, hair: 0x9a9a9a, hairStyle: 'short', top: 0x23395d, bottom: 0x2d3a4f, shoes: 0x2b2b2b, hat: false },
      { skin: 0xc68a63, hair: 0x2a1a10, hairStyle: 'bun', top: 0x7a2e3a, bottom: 0x2d3a4f, shoes: 0x2b2b2b, hat: false },
      { skin: 0x8d5a3b, hair: 0x1e1612, hairStyle: 'short', top: 0x2f6b45, bottom: 0x2d3a4f, shoes: 0x2b2b2b, hat: true },
    ];
    const judges = new THREE.Group();
    looks.forEach((look, i) => {
      const j = buildAvatar(look, 91 + i);
      j.root.position.set(-0.75 + i * 0.75, 0, -0.62);
      j.root.scale.setScalar(1.12);
      seat(j);
      judges.add(j.root);
    });
    judges.position.copy(this.judgeAt);
    this.props.add(judges);
    judges.updateMatrixWorld(true);
    bakeMeshes(judges);
    this.judges = judges;
    // Le longeur, au centre, avec sa longe et sa chambrière ; ou l'entraîneur à côté du tonneau.
    // (veste bordeaux et pantalon beige : on ne le confond pas avec ton avatar)
    const coach = buildAvatar({ skin: 0xd9a27e, hair: 0x3b2a20, hairStyle: 'ponytail', top: 0x7a2633, bottom: 0xcbb994, shoes: 0x3b2a1e, hat: true }, 57);
    coach.root.scale.setScalar(1.14);
    g.scene.add(coach.root);
    this.coach = coach;
    this.coachLife = { speed: 0, riding: false, carry: false, busy: true, noGestures: true };
    this.coachPhase = 0;
    if (this.e) {
      this.whip = lungeWhip();
      g.scene.add(this.whip);
      this.lunge = ribbon(0xf2eee6, 0.008, 18);
      this.lash = ribbon(0x2a2a2a, 0.004, 12);
      this.sideReins = [ribbon(0x1e1b19, 0.009, 6), ribbon(0x1e1b19, 0.009, 6)];
      for (const r of [this.lunge, this.lash, ...this.sideReins]) this.group.add(r);
      this.donuts = [0, 1].map(() => {
        const d = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 6, 12), new THREE.MeshStandardMaterial({ color: 0x1e1b19, roughness: 0.6 }));
        this.group.add(d);
        return d;
      });
      this.ropeA = Array.from({ length: 18 }, () => V());
      this.lashA = Array.from({ length: 12 }, () => V());
      this.sideA = Array.from({ length: 6 }, () => V());
      // Le cheval : guidé par la séance, sur le cercle, déjà à son allure.
      this.script(this.e);
      const md = this.e.model;
      const ss = md.speedScale ?? 1;
      this.speed = (this.level === 'canter' ? 4.0 : 1.5) * ss * this.e.scale;
      this.theta = Math.PI * 0.15;
      this.placeHorse(0);
      this.e.speed = this.speed;
      this.mt = horseMount(this.e);
    } else {
      // Le tonneau, au centre du cercle.
      const b = vaultBarrel();
      b.position.set(c.x, this.cy, c.z);
      b.rotation.y = -Math.PI / 2;
      this.props.add(b);
      for (const m of b.userData.sharedMats) this.sharedMats.add(m);
      this.barrel = b;
      this.mt = barrelMount(b, g.world);
    }
    this.P = makePoses(this.mt);
    this.R = Object.fromEntries(Object.entries(this.P).map(([k, p]) => [k, resolve(p, this.mt)]));
  }

  /** Le cheval à l'angle theta du cercle, cap tangent (main gauche). */
  placeHorse(dt) {
    const e = this.e;
    this.theta += (this.speed / CIRCLE_R) * dt;
    const p = onCircle(this.center, this.theta, CIRCLE_R);
    e.position.set(p.x, this.y(p.x, p.z), p.z);
    e.heading = this.theta;
    e.root.rotation.y = e.heading;
    e.speed = this.speed;
  }

  /** Avant de commencer : le voltigeur debout près du longeur (ou du tonneau), face aux juges. */
  placeStart() {
    const c = this.center;
    const gr = this.ground;
    if (this.e) {
      gr.x = c.x + 1.3;
      gr.z = c.z - 1.6;
    } else {
      const s = this.mt.pos;
      _v.set(this.mt.wL + 0.75, 0, 0.05).applyQuaternion(this.mt.quat);
      gr.x = s.x + _v.x;
      gr.z = s.z + _v.z;
    }
    gr.h = Math.atan2(this.judgeAt.x - gr.x, this.judgeAt.z - gr.z);
    this.toGround();
  }

  toGround() {
    const a = this.av;
    a.root.position.set(0, 0, 0);
    a.root.quaternion.identity();
    this.mode = 'ground';
  }

  // ------------------------------------------------------------ le rythme

  /** Où en est la foulée (0 → 1) : la phase du cheval, ou le temps du tonneau. */
  stridePhase() {
    if (this.e) return (((this.e.phase ?? 0) / TAU) % 1 + 1) % 1;
    return ((this.time / this.L.beat) % 1 + 1) % 1;
  }

  /** Durée d'une foulée (s), mesurée sur le cheval. */
  strideTime() {
    return this.strideT ?? (this.e ? (this.level === 'canter' ? 0.62 : 1.1) : this.L.beat);
  }

  trackBeat(dt) {
    const ph = this.stridePhase();
    if (this.lastPh !== undefined && ph < this.lastPh - 0.5) {
      // une nouvelle foulée : on mesure sa durée, et le sabot (ou le claquement du longeur) donne le temps
      if (this.beatAt !== undefined) {
        const d = this.time - this.beatAt;
        if (d > 0.2 && d < 3) this.strideT = this.strideT ? this.strideT * 0.7 + d * 0.3 : d;
      }
      this.beatAt = this.time;
      if (this.e) this.game.audio?.step('hoof', this.level === 'canter');
      else this.game.audio?.ui('tap');
      this.hud2.beat();
    }
    this.lastPh = ph;
    void dt;
  }

  // ------------------------------------------------------------ toucher, figures

  refreshHud() {
    const s = STEPS[this.stepI];
    const fig = s && s.fig !== 'mount' ? s.fig : null;
    const done = this.figures.length;
    const sum = this.figures.reduce((x, f) => x + f.score, 0);
    this.hud.stats([
      [this.L.icon, t(`vt_level_${this.level}`)],
      // (la barre du haut compte les figures ; la carte du bas, les temps d'une figure : des points)
      ['🎯', fig ? t('vt_figN', { n: PROGRAM.indexOf(fig) + 1, total: PROGRAM.length }) : `${PROGRAM.length} ${t('vt_figures')}`],
      ['⭐', done ? fmtMark(sum / done) : '—'],
    ]);
  }

  onGo() {
    // Après le salut : vers le cheval (en courant au galop, en marchant au pas), ou contre le tonneau.
    this.phase = this.e ? 'approach' : 'ready';
    if (!this.e) this.cue(0);
  }

  /** Attendre le toucher de l'étape i. */
  cue(i) {
    this.stepI = i;
    const s = STEPS[i];
    if (!s) return this.complete();
    this.phase = 'cue';
    this.cueAt = this.time;
    const name = s.fig === 'mount' ? t('vt_mount') : t(`vt_fig_${s.fig}`);
    const parts = s.fig !== 'mount' ? FIGURES[s.fig].parts : 1;
    // (sur le tonneau, qui ne bouge pas, on ne court pas à côté pour monter)
    const how = s.part > 0 ? t('vt_howNext') : t(s.fig === 'mount' && !this.e ? 'vt_how_mount_barrel' : `vt_how_${s.fig}`);
    this.hud2.cue(s.fig === 'mount' ? '🤸' : FIGURES[s.fig].icon, name, how, s.part, parts);
    this.refreshHud();
  }

  /** Un toucher (ts : heure de l'événement, en ms comme performance.now). */
  tap(ts = performance.now()) {
    if (this.state !== 'run') return;
    if (this.phase !== 'cue') {
      if (this.phase === 'approach') this.hud2.say(t('vt_wait'), 900);
      return;
    }
    this.go(this.phaseAt(ts), true);
  }

  /**
   * La phase de la foulée au moment où le doigt a touché : la dernière image peut dater un peu (on prolonge la
   * foulée jusqu'à l'heure de l'événement), et le doigt a touché TAP_LATENCY avant que le jeu le reçoive.
   */
  phaseAt(ts) {
    const wall = clamp((ts - (this.wallAt ?? ts)) / 1000, -0.5, 0.5) - TAP_LATENCY;
    return (this.phAt ?? this.stridePhase()) + (wall * (this.rate ?? 1)) / this.strideTime();
  }

  /** On lance l'étape : la qualité du toucher (en rythme ou pas), puis le mouvement. */
  go(phase, tapped) {
    const s = STEPS[this.stepI];
    const err = tapError(phase, this.strideTime());
    const q = tapped ? tapQuality(err, this.level) : 0;
    const grade = tapped ? tapGrade(err, this.level) : 'late';
    this.taps.push(q);
    this.hud2.say(t(`vt_tap_${grade}`), 800, grade === 'perfect' || grade === 'good' ? 'good' : 'bad');
    if (q >= 0.8 && this.e) this.e.emit('✨', 1);
    this.hud2.cue(null);
    this.phase = 'move';
    this.moveList = s.move;
    this.moveT = 0;
    this.moveSeg = Math.max(0.42, Math.min(0.85, this.strideTime() * (this.level === 'canter' ? 0.9 : 0.7)));
    // Départ de la montée : les pieds et la hanche là où ils sont (en courant).
    if (s.fig === 'mount') this.startFrom = this.captureGroundPose();
    else this.startFrom = null;
  }

  /** Fin du mouvement d'une étape : tenir (équilibre), enchaîner, ou noter la figure. */
  moveDone() {
    const s = STEPS[this.stepI];
    if (s.dismount) {
      this.landed();
      return;
    }
    if (s.hold) {
      this.phase = 'hold';
      this.holdT = 0;
      this.holdLen = this.L.hold * this.strideTime();
      this.leans = [];
      this.control = 0;
      this.pushSeed = this.stepI * 7 + (this.figures.length + 1);
      this.amp = balanceAmp(this.level, s.fig, this.calm);
      this.hud2.balance(true);
      this.hud.hint(t('vt_balanceHint'), 3500);
      return;
    }
    this.endPart();
  }

  /** Une étape finie : si c'est la dernière partie de la figure, les juges notent. */
  endPart(balance = null) {
    const s = STEPS[this.stepI];
    if (s.fig !== 'mount' && s.part === FIGURES[s.fig].parts - 1) {
      const n = FIGURES[s.fig].parts;
      const taps = this.taps.slice(-n);
      const timing = taps.reduce((x, q) => x + q, 0) / taps.length;
      const mark = figureMark({ timing, balance, calm: this.calm });
      const marks = judgesMarks(mark, `${this.game.day}-${this.stepI}-${this.figures.length}-${Math.round(timing * 100)}`);
      const score = figureScore(marks);
      const comment = judgeComment(mark, { timing, balance });
      this.figures.push({ id: s.fig, marks, score, comment, timing, balance });
      this.hud2.marks(FIGURES[s.fig].icon, t(`vt_fig_${s.fig}`), marks, score, t(`vt_say_${comment}`));
      if (score >= 8) this.applauseSoft();
      this.refreshHud();
    }
    this.phase = 'pause';
    this.pauseT = 0;
  }

  applauseSoft() {
    this.burst('👏', V(this.judgeAt.x, this.judgeAt.y + 1.6, this.judgeAt.z), 3, 1.6, 0.5);
  }

  /** Réception au sol après le saut à terre : on court encore quelques pas, puis on salue. */
  landed() {
    const s = this.mt.pos;
    // hanche au sol → position du joueur
    const R = this.cur;
    _v.copy(R.hip).applyMatrix4(this.mt.frame);
    const gr = this.ground;
    gr.x = _v.x;
    gr.z = _v.z;
    _w.set(0, 0, 1).applyQuaternion(R.q).applyQuaternion(this.mt.quat);
    gr.h = Math.atan2(_w.x, _w.z);
    gr.speed = this.e ? this.speed * 0.7 : 0;
    void s;
    this.toGround();
    this.endPart();
    this.phase = 'outro';
    this.outroT = 0;
    this.hud2.idle(true); // (plus rien à toucher : on salue)
  }

  // ------------------------------------------------------------ chaque image

  update(dt) {
    this.updateCommon(dt);
    if (this.ended) return;
    const g = this.game;
    if (this.e) {
      this.placeHorse(dt);
      this.mt.update(g.world);
    }
    this.trackBeat(dt);
    // (pour situer un toucher entre deux images : où en était la foulée, à quelle heure, et combien de temps de jeu
    // passe par seconde — 1 d'habitude ; plus en ×2 ; moins sur un appareil lent, où une image dure plus de 0,1 s)
    const now = performance.now();
    if (this.wallAt !== undefined && now - this.wallAt > 4) {
      const r = clamp((this.time - this.timeAt) / ((now - this.wallAt) / 1000), 0, 4);
      this.rate = this.rate === undefined ? r : this.rate * 0.8 + r * 0.2;
    }
    if (this.wallAt === undefined || now - this.wallAt > 4) this.wallAt = now;
    this.timeAt = this.time;
    this.phAt = this.stridePhase();
    this.updateCoach(dt);
    if (this.state === 'countdown' || this.phase === 'salute') this.updateSalute(dt);
    else if (this.state === 'run' || this.state === 'finishing') this.updateRun(dt);
    this.updateLines();
    this.camera(dt);
    this.hud2.ring(this.stridePhase());
  }

  updateRun(dt) {
    switch (this.phase) {
      case 'approach': return this.updateApproach(dt);
      case 'cue': {
        // en attendant le toucher : on court à côté (montée) ou on tient l'assise, les mains aux poignées
        if (STEPS[this.stepI].fig === 'mount') {
          if (this.e) this.updateAlongside(dt);
          else this.updateBeside(dt);
        }
        else this.holdPose(this.restPose(), dt);
        // trop long : on y va quand même (« trop tard »)
        if (this.time - this.cueAt > Math.max(5, this.strideTime() * 6)) {
          this.hud.hint(t('vt_tooLate'), 2500);
          this.go(0.5, false);
        }
        return;
      }
      case 'move': return this.updateMove(dt);
      case 'hold': return this.updateHold(dt);
      case 'back': return this.updateBack(dt);
      case 'pause': {
        this.holdPose(this.restPose(), dt);
        this.pauseT += dt;
        if (this.pauseT > 0.6) this.cue(this.stepI + 1);
        return;
      }
      case 'outro': return this.updateOutro(dt);
      default: return this.holdPose(this.restPose(), dt);
    }
  }

  /** La pose de repos entre deux étapes : celle de la fin de l'étape précédente. */
  restPose() {
    const s = STEPS[this.stepI];
    if (!s || s.fig === 'mount') return this.R.seatGrip;
    if (this.phase === 'cue') {
      const prev = STEPS[this.stepI - 1];
      if (!prev) return this.R.seatGrip;
      const last = prev.back ? prev.back[prev.back.length - 1] : prev.move[prev.move.length - 1];
      return this.R[last === 'seat2' ? 'seatGrip' : last];
    }
    const last = s.back ? s.back[s.back.length - 1] : s.move[s.move.length - 1];
    return this.R[last === 'seat2' ? 'seatGrip' : last];
  }

  holdPose(R, dt, lean = 0) {
    if (this.mode !== 'pose') this.mode = 'pose';
    this.cur = this.cur ?? copyResolved(R);
    // (petit lissage : les changements de pose de repos ne sautent pas)
    blend(this.cur, R, Math.min(1, dt * 12), this.cur);
    this.placeAvatar(lean);
  }

  placeAvatar(lean = 0) {
    const pl = this.pl;
    pl.root.position.copy(this.mt.pos);
    pl.root.rotation.set(0, 0, 0);
    pl.heading = 0;
    pl.speed = 0;
    applyPose(this.av, this.cur, this.mt, pl.root, lean);
    this.av.root.updateMatrixWorld(true);
  }

  updateMove(dt) {
    this.moveT += dt;
    const list = this.moveList;
    const n = list.length - 1;
    const u = this.moveT / this.moveSeg;
    const k = Math.min(n - 1, Math.floor(u));
    const f = smooth(clamp(u - k));
    const A = k === 0 && this.startFrom ? this.startFrom : this.R[list[k]];
    const B = this.R[list[k + 1]];
    this.mode = 'pose';
    this.cur = this.cur ?? copyResolved(A);
    blend(A, B, f, this.cur);
    this.placeAvatar(0);
    if (u >= n) this.moveDone();
  }

  updateHold(dt) {
    const s = STEPS[this.stepI];
    this.holdT += dt;
    const push = balancePush(this.holdT, this.amp, this.pushSeed, this.holdLen);
    // le clavier pousse aussi (flèches)
    const keys = this.keysLR ?? 0;
    if (keys) this.control = clamp(this.control + keys * dt * 1.6, -1.2, 1.2);
    this.lean = leanOf(push, this.control);
    this.leans.push(this.lean);
    this.hud2.setBalance(this.lean);
    this.holdPose(this.R[s.hold], dt, this.lean);
    if (this.holdT >= this.holdLen) {
      this.balance = balanceScore(this.leans);
      this.hud2.balance(false);
      this.hud2.say(this.balance >= 0.75 ? t('vt_steady') : this.balance >= 0.45 ? t('vt_okBalance') : t('vt_wobbly'), 1000, this.balance >= 0.45 ? 'good' : 'bad');
      this.phase = 'back';
      this.moveList = s.back;
      this.moveT = 0;
      this.lean = 0;
    }
  }

  updateBack(dt) {
    this.moveT += dt;
    const list = this.moveList;
    const n = list.length - 1;
    const u = this.moveT / this.moveSeg;
    const k = Math.min(n - 1, Math.floor(u));
    blend(this.R[list[k]], this.R[list[k + 1]], smooth(clamp(u - k)), this.cur);
    this.placeAvatar(0);
    if (u >= n) this.endPart(this.balance);
  }

  // ------------------------------------------------------------ à pied

  /** La pose à pied, résolue dans le repère du tapis (départ de la montée : pas de saut de pose). */
  captureGroundPose() {
    const a = this.av;
    const R = copyResolved(this.R.run);
    a.root.updateMatrixWorld(true);
    const toPad = (o, out) => o.getWorldPosition(out).applyMatrix4(this.mt.inv);
    for (let i = 0; i < 2; i++) toPad(a.ankles?.[i] ?? a.knees[i], R.legs[i].at);
    _v.set(0, HIP, 0);
    a.root.localToWorld(_v);
    R.hip.copy(_v).applyMatrix4(this.mt.inv);
    a.root.getWorldQuaternion(_q);
    R.q.copy(this.mt.quat).invert().multiply(_q);
    return R;
  }

  /** Marcher / courir au sol vers (x, z), à la vitesse voulue. */
  walkTo(x, z, want, dt, faceH = null) {
    const gr = this.ground;
    const dx = x - gr.x;
    const dz = z - gr.z;
    const d = Math.hypot(dx, dz);
    const h = d > 0.05 ? Math.atan2(dx, dz) : (faceH ?? gr.h);
    gr.h += wrap((faceH !== null && d < 0.4 ? faceH : h) - gr.h) * Math.min(1, dt * 8);
    gr.speed += (want - gr.speed) * Math.min(1, dt * 5);
    const step = Math.min(d, gr.speed * dt);
    if (d > 0.001) {
      gr.x += (dx / d) * step;
      gr.z += (dz / d) * step;
    }
    this.placeGround(dt);
    return d;
  }

  placeGround(dt) {
    const gr = this.ground;
    const pl = this.pl;
    this.toGround();
    pl.root.position.set(gr.x, this.y(gr.x, gr.z), gr.z);
    pl.root.rotation.set(0, gr.h, 0);
    pl.heading = gr.h;
    pl.speed = 0;
    gr.phase += dt * gr.speed * 2.2;
    animateAvatarWalk(this.av, gr.phase, gr.speed);
  }

  updateSalute(dt) {
    const gr = this.ground;
    this.walkTo(gr.x, gr.z, 0, dt, Math.atan2(this.judgeAt.x - gr.x, this.judgeAt.z - gr.z));
    // salut : le bras droit levé, puis redescendu
    const k = this.state === 'countdown' ? Math.sin(clamp((3.2 - this.count) / 2.4) * Math.PI) : 0;
    if (k > 0.01) {
      _v.set(-0.3, 1.95, 0.12);
      rootToTorso(this.av, _v);
      armIK(this.av, 1, _v, _w.set(-1, 0, 0), k);
    }
  }

  /** Courir vers le cheval, puis à côté de lui (au flanc gauche, près du surfaix). */
  updateApproach(dt) {
    const mt = this.mt;
    _v.set(mt.wL + 0.55, 0, 0.15).applyMatrix4(mt.frame);
    // on vise un peu devant (le cheval avance)
    _w.set(Math.sin(this.e.heading), 0, Math.cos(this.e.heading)).multiplyScalar(this.speed * 0.5);
    const d = this.walkTo(_v.x + _w.x, _v.z + _w.z, Math.min(6.2, this.speed * 1.5 + 1), dt);
    if (d < 0.9 || this.time - (this.approachAt ??= this.time) > 6) {
      this.phase = 'alongside';
      this.cue(0);
    }
  }

  updateAlongside(dt) {
    const mt = this.mt;
    _v.set(mt.wL + 0.45, 0, 0.12).applyMatrix4(mt.frame);
    const gr = this.ground;
    const d = Math.hypot(_v.x - gr.x, _v.z - gr.z);
    // on suit le cheval : à sa vitesse, un peu plus si on est derrière
    this.walkTo(_v.x, _v.z, this.speed * (1 + Math.min(0.6, d * 0.8)), dt, this.e.heading);
    gr.h += wrap(this.e.heading - gr.h) * Math.min(1, dt * 6);
    this.pl.root.rotation.y = gr.h;
    // les mains montent vers les poignées
    const a = this.av;
    a.root.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      _p.copy(mt.grips[i]).add(_w.set(0, GRIP_UP, 0)).applyMatrix4(mt.frame);
      a.root.worldToLocal(_p);
      rootToTorso(a, _p);
      armIK(a, i, _p, _w.set(i ? -0.6 : 0.6, -1, -0.4), 0.85);
    }
  }

  /** Debout à côté du tonneau, les mains aux poignées, prêt à sauter. */
  updateBeside(dt) {
    const gr = this.ground;
    const h = Math.atan2(_w.set(0, 0, 1).applyQuaternion(this.mt.quat).x, _w.z);
    this.walkTo(gr.x, gr.z, 0, dt, h);
    const a = this.av;
    a.root.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      _p.copy(this.mt.grips[i]).add(_w.set(0, GRIP_UP, 0)).applyMatrix4(this.mt.frame);
      a.root.worldToLocal(_p);
      rootToTorso(a, _p);
      armIK(a, i, _p, _w.set(i ? -0.6 : 0.6, -1, -0.4), 0.9);
    }
  }

  updateOutro(dt) {
    this.outroT += dt;
    const gr = this.ground;
    if (this.outroT < 1.4) {
      // encore quelques foulées de course, en ralentissant, puis on s'arrête
      const want = Math.max(0, (gr.speed ?? 0) - dt * 4);
      const x = gr.x + Math.sin(gr.h) * 3;
      const z = gr.z + Math.cos(gr.h) * 3;
      this.walkTo(x, z, want, dt);
    } else {
      const face = Math.atan2(this.judgeAt.x - gr.x, this.judgeAt.z - gr.z);
      this.walkTo(gr.x, gr.z, 0, dt, face);
      // salut final : les deux bras levés
      const k = clamp((this.outroT - 1.8) / 0.5);
      if (k > 0) {
        for (let i = 0; i < 2; i++) {
          _v.set(i ? -0.32 : 0.32, 1.98, 0.1);
          rootToTorso(this.av, _v);
          armIK(this.av, i, _v, _w.set(i ? -1 : 1, 0, 0), k);
        }
      }
      if (this.outroT > 3.0 && this.state === 'run') this.complete();
    }
  }

  // ------------------------------------------------------------ le longeur

  updateCoach(dt) {
    const c = this.coach;
    const cx = this.center.x;
    const cz = this.center.z;
    let target;
    let speed = 0;
    let face = null;
    if (this.e) {
      // il marche un petit cercle au centre (1,1 m de rayon), à la même vitesse angulaire que le cheval, tourné vers
      // lui de trois quarts (il avance en le regardant : sa longe et sa chambrière restent vers le cheval)
      const r = 1.1;
      const pos = onCircle(this.center, this.theta, r);
      const along = (this.speed / CIRCLE_R) * r; // (sa vitesse sur son petit cercle)
      c.root.position.set(pos.x, this.y(pos.x, pos.z), pos.z);
      const toHorse = Math.atan2(this.e.position.x - pos.x, this.e.position.z - pos.z);
      face = toHorse + wrap(this.e.heading - toHorse) * 0.6; // (entre « vers le cheval » et « là où il va »)
      speed = along * Math.cos(wrap(this.e.heading - face)); // (la part de ses pas qui va vers l'avant)
      target = this.e.position;
    } else {
      // l'entraîneur, debout à côté du tonneau, qui frappe des mains en rythme
      const s = this.mt.pos;
      _v.set(-(this.mt.wL + 0.75), 0, 1.15).applyQuaternion(this.mt.quat);
      c.root.position.set(s.x + _v.x, this.y(s.x + _v.x, s.z + _v.z), s.z + _v.z);
      target = s;
    }
    c.root.rotation.y = face ?? Math.atan2(target.x - c.root.position.x, target.z - c.root.position.z);
    this.coachPhase += dt * speed * 2.2;
    animateAvatarWalk(c, this.coachPhase, speed);
    this.coachLife.speed = speed;
    updateAvatarLife(c, dt, this.coachLife);
    c.root.updateMatrixWorld(true);
    if (this.e) {
      // main gauche : la longe, vers la tête du cheval ; main droite : la chambrière, vers les hanches
      const md = this.e.model;
      md.head.getWorldPosition(_p);
      c.root.worldToLocal(_p);
      _p.y = 0;
      _p.normalize().multiplyScalar(0.46).add(_w.set(0.17, 1.16, 0.05));
      rootToTorso(c, _p);
      armIK(c, 0, _p, _w.set(1, -0.6, -0.3), 1);
      _v.set(-0.36, 0.86, 0.32);
      rootToTorso(c, _v);
      armIK(c, 1, _v, _w.set(-1, -0.5, -0.4), 1);
    } else {
      // il frappe dans ses mains au rythme (le temps du tonneau)
      const clap = Math.abs(Math.cos(this.stridePhase() * Math.PI));
      for (let i = 0; i < 2; i++) {
        _v.set((i ? -1 : 1) * (0.03 + 0.12 * (1 - clap)), 1.2, 0.3);
        rootToTorso(c, _v);
        armIK(c, i, _v, _w.set(i ? -1 : 1, -0.6, -0.3), 1);
      }
    }
  }

  /** La longe, la chambrière et sa mèche, les enrênements : refaits à chaque image. */
  updateLines() {
    if (!this.e) return;
    const c = this.coach;
    const md = this.e.model;
    const reins = this.e.gearGroup?.userData.reins;
    c.root.updateMatrixWorld(true);
    // Longe : de la main gauche du longeur à l'anneau du mors côté intérieur (gauche du cheval).
    c.hands[0].getWorldPosition(_v);
    if (reins) {
      const left = reins.points[0].x > 0 ? reins.points[0] : reins.points[1];
      _w.copy(left).applyMatrix4(reins.parent.matrixWorld);
    } else md.head.localToWorld(_w.copy(md.mouth ?? V(0, -0.1, 0.4)));
    this.lunge.userData.setPoints(sagPoints(_v, _w, 0.35, this.ropeA));
    // Chambrière : de la main droite, pointée vers l'arrière du cheval, la mèche qui traîne.
    c.hands[1].getWorldPosition(_v);
    this.e.root.localToWorld(_w.set(0, 0.6 * this.e.scale, -1.1 * this.e.scale));
    _p.subVectors(_w, _v).normalize();
    _p.y = Math.min(_p.y, -0.12);
    _p.normalize();
    this.whip.position.copy(_v);
    this.whip.quaternion.setFromUnitVectors(UP, _p);
    const tip = _v.clone().addScaledVector(_p, 1.8);
    const end = tip.clone().addScaledVector(_p, 1.2);
    end.y = this.y(end.x, end.z) + 0.02;
    this.lash.userData.setPoints(sagPoints(tip, end, 0.25, this.lashA));
    // Enrênements : des anneaux du surfaix aux anneaux du mors (avec le filet seulement).
    const sur = this.e.gearGroup?.userData.surcingle;
    const show = !!(sur && reins);
    for (let i = 0; i < 2; i++) {
      this.sideReins[i].visible = show;
      this.donuts[i].visible = show;
      if (!show) continue;
      _v.copy(sur.rings[i]).applyMatrix4(sur.parent.matrixWorld);
      const bit = reins.points.find((p) => (i === 0 ? p.x > 0 : p.x < 0)) ?? reins.points[i];
      _w.copy(bit).applyMatrix4(reins.parent.matrixWorld);
      this.sideReins[i].userData.setPoints(sagPoints(_v, _w, 0.02, this.sideA));
      this.donuts[i].position.lerpVectors(_v, _w, 0.42);
      this.donuts[i].lookAt(_w);
    }
  }

  // ------------------------------------------------------------ la caméra

  /**
   * La partie de l'écran que rien ne cache (coordonnées de -1 à 1, y vers le haut) : sous la barre du haut et la
   * bulle d'aide, au-dessus du gros bouton rond (en hauteur) ou à sa gauche (en paysage). Relue deux fois par seconde.
   */
  freeBox() {
    if (this.box && this.time - this.boxAt < 0.5) return this.box;
    const W = window.innerWidth;
    const H = window.innerHeight;
    let top = H * 0.12;
    let bottom = H * 0.92;
    let right = W * 0.92;
    const left = W * 0.08;
    const r = (el) => (el && !el.hidden && el.offsetParent ? el.getBoundingClientRect() : null);
    const bar = r(this.hud.root.querySelector('.actv-top'));
    if (bar && bar.width > W * 0.6) top = Math.max(top, bar.bottom + 8);
    const tip = W < H ? r(this.hud.hintEl) : null; // (en paysage, la bulle d'aide est courte : on passe dessous)
    if (tip && tip.width > W * 0.6) top = Math.max(top, tip.bottom + 6);
    const btn = r(this.hud2.btn);
    if (btn) {
      if (btn.left > W * 0.55) right = Math.min(right, btn.left - 36); // (paysage : le bouton à droite)
      else bottom = Math.min(bottom, btn.top - 60); // (l'anneau déborde du bouton)
    }
    const nx = (x) => (x / W) * 2 - 1;
    const ny = (y) => 1 - (y / H) * 2;
    this.box = { x0: nx(left), x1: nx(right), y0: ny(bottom), y1: ny(top) };
    this.boxAt = this.time;
    return this.box;
  }

  /**
   * Plan large du départ (salut et course vers le cheval) : vu du côté des juges (on voit ton avatar de face quand il
   * salue), tourné vers la ligne qui va de ton avatar à ton cheval (ils s'étagent dans la profondeur, ce qui tient
   * mieux dans un écran en hauteur), assez loin pour que ton avatar, le longeur et le cheval entier tiennent dans la
   * partie libre de l'écran. Lissé : le plan suit doucement le cheval qui tourne.
   */
  wideShot(dt, portrait) {
    const g = this.game;
    const e = this.e;
    const S = e.scale ?? 1;
    const pl = this.pl.root.position;
    const co = this.coach.root.position;
    const pts = (this.widePts ??= Array.from({ length: 8 }, () => V()));
    pts[0].set(pl.x, pl.y, pl.z);
    pts[1].set(pl.x, pl.y + 1.55, pl.z);
    pts[2].set(co.x, co.y, co.z);
    pts[3].set(co.x, co.y + 1.95, co.z);
    e.root.localToWorld(pts[4].set(0, 0, 1.35 * S)); // (la tête et la croupe, en bas et en haut)
    e.root.localToWorld(pts[5].set(0, 1.95 * S, 1.2 * S));
    e.root.localToWorld(pts[6].set(0, 0, -1.25 * S));
    e.root.localToWorld(pts[7].set(0, 1.6 * S, -1.25 * S));
    // le centre du groupe
    const mid = _p.set(0, 0, 0);
    for (const q of pts) mid.add(q);
    mid.multiplyScalar(1 / pts.length);
    // vu du côté des juges ; en hauteur, tourné vers la ligne avatar → cheval (ils s'étagent dans la profondeur) ;
    // en paysage, tourné en travers de cette ligne (ils s'étalent en largeur). Au plus de 0,6 rad, sans à-coup.
    const pref = Math.atan2(this.judgeAt.x - this.center.x, this.judgeAt.z - this.center.z);
    const az = wideAzimuth(pref, Math.atan2(e.position.x - pl.x, e.position.z - pl.z), portrait);
    this.wideAz = this.wideAz === undefined ? az : this.wideAz + wrap(az - this.wideAz) * Math.min(1, dt * 1.5);
    const pitch = portrait ? 0.55 : 0.3;
    const box = this.freeBox();
    const cam = g.camera;
    const frame = { fov: cam.fov, aspect: cam.aspect, box, az: this.wideAz, pitch };
    const d = fitDistance(pts, mid, frame);
    this.wideDist = this.wideDist === undefined ? d : this.wideDist + (d - this.wideDist) * Math.min(1, dt * 2);
    const at = shotAim(mid, this.wideDist, frame, (this.wideAt ??= V()));
    return { at: at.clone(), heading: this.wideAz, yaw: 0, pitch, dist: this.wideDist };
  }

  camera(dt) {
    const g = this.game;
    const portrait = g.camera.aspect < 0.8;
    const at = _v.copy(this.mt.pos);
    // (en hauteur, la visée est plus basse : le cheval est au-dessus du gros bouton rond)
    at.y += portrait ? -0.25 : 0.3;
    const h = this.e ? this.e.heading : Math.atan2(_w.set(0, 0, 1).applyQuaternion(this.mt.quat).x, _w.z);
    let yaw = 1.25;
    let pitch = 0.2;
    let dist = portrait ? 6.6 : 4.4;
    if (this.state === 'countdown' || this.phase === 'salute' || this.phase === 'approach') {
      // plan large : ton avatar, le longeur et ton cheval, tous les trois dans la partie libre de l'écran
      if (this.e) {
        g.rig.focus = { shot: this.wideShot(dt, portrait) };
        return;
      }
      dist += 1;
    }
    if (this.phase === 'outro') {
      // le salut : de face (les juges sont derrière la caméra)
      const pl = this.pl.root.position;
      at.set(pl.x, pl.y + (portrait ? 0.75 : 1.0), pl.z);
      dist = portrait ? 5.2 : 4.2;
      g.rig.focus = { shot: { at: at.clone(), heading: this.ground.h, yaw: 0.55, pitch: 0.15, dist } };
      return;
    }
    if (!this.e) {
      yaw = 0.95;
      dist = portrait ? 5.4 : 4.0;
    }
    // (debout : un peu plus bas, pour voir la hauteur)
    if (this.phase === 'hold' && STEPS[this.stepI]?.fig === 'stand') pitch = 0.1;
    // 🎥 la vue choisie : de trois quarts (au départ), de près, ou de loin (plus haut : le cheval entier et la piste ;
    // pas tout à fait de côté, sinon le longeur, au centre, passait devant la caméra)
    if (this.view === 1) {
      dist *= 0.62;
      pitch = 0.12;
      at.y += portrait ? 0.45 : 0.25;
    } else if (this.view === 2) {
      yaw = 1.05;
      dist *= 1.7;
      pitch = 0.32;
    }
    g.rig.focus = { shot: { at: at.clone(), heading: h, yaw, pitch, dist } };
    void dt;
  }

  /** 🎥 (ou la touche C) : la vue suivante — de trois quarts, de près, de loin. Renvoie true (le bouton est pris). */
  cameraButton() {
    this.view = ((this.view ?? 0) + 1) % 3;
    this.hud.hint(t(`vt_cam_${this.view}`), 1600);
    return true;
  }

  // ------------------------------------------------------------ clavier

  onKeyDown(e) {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (!e.repeat) this.tap(e.timeStamp);
    }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'KeyQ') this.keysLR = -1;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') this.keysLR = 1;
    if (!this.keyUp) {
      this.keyUp = (ev) => { if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyQ', 'KeyD'].includes(ev.code)) this.keysLR = 0; };
      window.addEventListener('keyup', this.keyUp);
    }
  }

  action() {
    this.tap();
  }

  onTap() {
    this.tap();
    return true;
  }

  // ------------------------------------------------------------ fin

  complete() {
    if (this.state === 'finishing' || this.state === 'done') return;
    const g = this.game;
    const p = g.profile;
    this.state = 'done';
    this.hud.setMain(null);
    this.hud2.cue(null);
    const result = vaultResult(this.figures);
    const rec = recordVault(p, this.level, result);
    addStat(p, 'actvVaulting');
    if (this.e) addStat(p, 'actvVaultingHorse');
    if (this.level === 'canter') addStat(p, 'actvVaultingCanter');
    if (this.level === 'canter' && result.score >= 8) addStat(p, 'vaultCanter8');
    const fx = vaultHorseEffect(this.animal, this.level, result.score / 10);
    // (sur le tonneau : l'XP une fois par jour, le flot une fois par jour)
    const bar = this.e ? null : barrelReward(p, g.day, result.stars);
    if (!bar || bar.xp) g.xp('activity');
    if (this.animal) g.markHorseDay?.(this.animal, 'activity');
    const award = !bar || bar.ribbon ? practiceAward('vaulting', result.stars, 3) : null;
    let saved = null;
    if (award) {
      saved = addAward(p, award, {
        type: 'vaulting', day: g.day, place: p.place, animal: this.animal?.name ?? t('vt_barrel'), animalId: this.animal?.id ?? null,
        species: 'horse', level: null, rank: null,
      });
    }
    g.save();
    g.ui.refresh();
    this.applause(result.stars / 3);
    showVaultResults(g.ui, {
      level: this.level, result, animal: this.animal, record: rec.record, unlockedCanter: rec.unlockedCanter,
      newFigures: rec.newFigures, horse: fx, award: saved, sandbox: isSandbox(p), barrelDone: !!bar && result.stars >= 3 && !bar.ribbon,
      onAgain: () => this.again(),
      onClose: () => this.end(false),
    });
  }

  cleanup() {
    const g = this.game;
    const pl = this.pl;
    if (this.keyUp) window.removeEventListener('keyup', this.keyUp);
    this.hud2?.remove();
    document.body.classList.remove('vt-on');
    if (g.rig && this.camMode) g.rig.mode = this.camMode;
    if (this.coach) {
      g.scene.remove(this.coach.root);
      disposeModel(this.coach.root);
      this.coach = null;
    }
    if (this.whip) {
      g.scene.remove(this.whip);
      this.whip.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    }
    if (this.props) {
      g.scene.remove(this.props);
      disposeProps(this.props, this.sharedMats);
    }
    // Le voltigeur revient à pied, debout, au bord du cercle.
    if (pl && this.av) {
      this.toGround();
      const gr = this.ground;
      if (this.mode !== 'ground' || !Number.isFinite(gr.x)) {
        gr.x = this.center.x + 1.5;
        gr.z = this.center.z;
      }
      pl.root.position.set(gr.x, this.y(gr.x, gr.z), gr.z);
      pl.root.rotation.set(0, gr.h ?? 0, 0);
      pl.heading = gr.h ?? 0;
      pl.speed = 0;
      this.av.root.position.set(0, 0, 0);
      this.av.root.quaternion.identity();
    }
    const e = this.e;
    if (e) {
      e.speed = 0;
      e.position.y = this.y(e.position.x, e.position.z);
    }
    g.rig.focus = null;
  }
}

/**
 * Libère le décor de la séance (table et juges, tonneau…) : ses géométries, sauf celles partagées entre plusieurs
 * modèles (userData.shared), et ses matériaux, sauf ceux de sharedMats (le bois du tonneau, gardé pour la suivante).
 */
export function disposeProps(root, sharedMats = new Set()) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.geometry.userData.shared) o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!sharedMats.has(m)) m.dispose();
  });
}

/** Un juge assis sur sa chaise (pose fixe : hanches à 46 cm, genoux pliés, mains sur la table). */
function seat(j) {
  const a = j;
  a.root.position.y = 0.48 - HIP + 0.04;
  for (let i = 0; i < 2; i++) {
    const s = i ? -1 : 1;
    _v.set(s * 0.12, -a.root.position.y + 0.065, 0.45);
    legReach(a, i, _v, _w.set(0, 0, 1));
    footTo(a, i, _q.identity());
  }
  a.torso.rotation.set(0.12, 0, 0);
  a.head.rotation.set(0.05, 0, 0);
  for (let i = 0; i < 2; i++) {
    const s = i ? -1 : 1;
    a.arms[i].rotation.set(0, 0, 0);
    _v.set(s * 0.16, HIP + 0.28 - a.root.position.y * 0, 0.42);
    rootToTorso(a, _v);
    armIK(a, i, _v, _w.set(s * 0.6, -1, -0.3), 1);
  }
}

SESSION_TYPES.vaulting = { cls: VaultingSession, icon: '🤸', stat: 'actvVaulting' };

export { VaultingSession, makePoses, resolve, applyPose, barrelMount, GRIP_UP };
