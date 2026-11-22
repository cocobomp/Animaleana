// Moutons, chèvres et vaches dans la scène de soin en 3D (src/game/care/stage.js) : comment construire leur double
// (le même gabarit que dans le jeu : agneau, chevreau, veau, bélier cornu, bouc, toison du moment, mamelle), leurs
// repères (bouche, crâne, garrot, croupe, sabots, mamelle…), la région du corps sous le doigt, et leur vie dans la
// scène. Ce sont des modèles « réalistes » à eux (sheepReal.js, goatReal.js, cowReal.js) : leurs os n'ont ni les
// noms ni les axes de ceux du cheval, et leur mixeur sait déjà regarder un point, manger à une hauteur donnée, bêler,
// meugler, chasser les mouches avec la queue ; la scène lui passe ce que le jeu demande (stage.mood).
//
// Branché par l'objet FIT (une « adaptation » d'espèce que la scène consulte : voir CareStage, o.fit).

import * as THREE from 'three';
import { REAL_SHEEP_KEY, buildRealSheepModel } from '../models/sheepReal.js';
import { REAL_GOAT_KEY, buildRealGoatModel } from '../models/goatReal.js';
import { REAL_COW_KEY, REAL_BULL_KEY, buildRealCowModel } from '../models/cowReal.js';
import { sheepLookOf, sheepFleece } from '../../sim/sheepLook.js';
import { goatLookOf, goatUdderFill } from '../../sim/goatLook.js';
import { cowLookOf, cowUdderFill, cowModelKind } from '../../sim/cowLook.js';
import { audio } from '../audio.js';
import { refineLocks } from './locks.js';
import { disposeModel } from '../models/animalModel.js';

/** Espèces de la ferme qui ont leur scène de soin (la bergerie, la chèvrerie, l'étable : farmBarn.js). */
export const RUMINANTS = ['sheep', 'goat', 'cow'];

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AX = V(1, 0, 0);
const AY = V(0, 1, 0);
const AZ = V(0, 0, 1);
const _v = V();
const _w = V();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
/** Pied levé : angles (rad, autour de l'axe en travers du corps) de l'épaule ou de la hanche, du coude ou du grasset,
 * du genou ou du jarret, du boulet. */
export const LIFT = { front: [0, 0, 2.4, 0, 0], hind: [0, 0, 2.4, 0, 0] };
/** Durée d'un bêlement ou d'un meuglement doux (s). */
const CALL_S = 0.9;

/** Le gabarit de cet animal dans le jeu (même fonction que AnimalEntity.build). */
export function ruminantLook(a) {
  if (a.species === 'sheep') return sheepLookOf(a);
  if (a.species === 'goat') return goatLookOf(a);
  return cowLookOf(a);
}

/** Clé du GLB de cet animal (le taureau a le sien). */
export function ruminantKey(a, look = null) {
  if (a.species === 'sheep') return REAL_SHEEP_KEY;
  if (a.species === 'goat') return REAL_GOAT_KEY;
  return cowModelKind(look ?? cowLookOf(a)) === 'bull' ? REAL_BULL_KEY : REAL_COW_KEY;
}

/**
 * Son double réaliste (null si le GLB n'est pas chargé) : le gabarit du jeu (agneau, cornes du bélier, barbe du bouc,
 * taureau), la toison d'aujourd'hui (tondu, qui repousse), la mamelle d'aujourd'hui. gltf : le GLB (tests).
 */
export function buildRuminantModel(a, gltf = null) {
  const look = ruminantLook(a);
  let md = null;
  if (a.species === 'sheep') md = buildRealSheepModel(look, a.breed, gltf);
  else if (a.species === 'goat') md = buildRealGoatModel(look, a.breed, gltf);
  else if (a.species === 'cow') md = buildRealCowModel(look, a.breed, gltf);
  if (!md) return null;
  if (md.setFleece) md.setFleece(sheepFleece(a));
  if (md.setUdder && md.build?.milker) md.setUdder(a.species === 'goat' ? goatUdderFill(a) : cowUdderFill(a));
  // (laine longue, poil long : des mèches qui tiennent le gros plan, locks.js)
  refineLocks(md);
  return md;
}

/** Région du corps d'après l'os (squelette des ruminants réalistes). */
export function ruminantRegion(bone = '') {
  if (/^(head|jaw|ear|eye|horn|beard)/.test(bone)) return 'head';
  if (/^neck/.test(bone)) return 'neck';
  if (/^tail/.test(bone)) return 'tail';
  if (/^udder/.test(bone)) return 'udder';
  if (/^(radius|metacarpus|toes|tibia|metatarsus|htoes)/.test(bone)) return 'leg';
  if (/^(scap|humerus)/.test(bone)) return 'shoulder';
  if (/^femur/.test(bone)) return 'hip';
  return bone ? 'body' : '';
}

/** Os de la tête et de l'encolure (la chèvre et la vache ont des ancres à leur place pour le licol). */
const headBone = (md) => md.headBone ?? md.head;
const neckBone = (md) => md.neckBone ?? md.neck;

/**
 * Repères au repos (pose debout), repère monde : mêmes noms que ceux du cheval (stage.marks), plus la mamelle et
 * l'unité de taille (u : hauteur au garrot, m) pour cadrer sans chiffres en dur.
 */
export function ruminantMarks(stage) {
  const md = stage.model;
  const h = stage.holder;
  md.photoPose?.();
  h.updateMatrixWorld(true);
  const W = (o, p = null) => (o ? o.localToWorld(p ? p.clone() : V()) : null);
  const bz = (nm) => {
    const b = md.bone?.(nm);
    return b ? h.worldToLocal(b.getWorldPosition(V())).z : 0;
  };
  const H = (x, y, z) => h.localToWorld(V(x, y, z));
  const top = md.saddleY ?? 1;
  const low = md.legTop ?? top * 0.45;
  const y0 = md.y0 ?? (top + low) / 2;
  const L = {};
  L.muzzle = W(md.head, md.mouth);
  const skull = md.accessoryFit?.skull ?? md.skull;
  L.poll = skull ? W(md.head, skull) : W(md.head);
  L.head = L.poll.clone().lerp(L.muzzle, 0.45);
  L.ears = (md.ears ?? []).map((e) => W(e));
  L.neck = W(neckBone(md));
  L.withers = H(0, top, bz('scapL'));
  L.back = H(0, top, bz('spine2'));
  L.croup = H(0, top * 0.98, bz('pelvis'));
  L.chest = H(0, (low + y0) / 2, bz('humerusL') + 0.12 * top);
  L.belly = H(0, low, bz('spine2'));
  L.body = H(0, y0, bz('spine2'));
  L.tail = W(md.tail);
  L.tailTip = md.tailTip ? W(md.tailTip) : L.tail;
  L.hooves = (md.legs ?? []).map((l) => {
    const p = W(l.paw);
    p.y = 0.02;
    return p;
  });
  L.udder = md.udderBone ? W(md.udderBone) : md.teat ? W(md.teat) : L.belly.clone();
  // (unité : hauteur au garrot dans le monde — un agneau, une chèvre naine, une vache)
  L.u = L.withers.y;
  return L;
}

/** Repères dans la pose du moment (la tête bouge) : bouche, bout du nez, tête, front. */
export function ruminantLive(stage, name) {
  const md = stage.model;
  if (!md.head) return null;
  const skull = md.accessoryFit?.skull ?? md.skull;
  const mouth = md.head.localToWorld(_v.copy(md.mouth)).clone();
  if (name === 'muzzle') return mouth;
  const poll = skull ? md.head.localToWorld(_w.copy(skull)).clone() : md.head.getWorldPosition(V());
  if (name === 'nose') return mouth.clone().addScaledVector(mouth.clone().sub(poll).normalize(), 0.025 * (stage.marks?.u ?? 1));
  if (name === 'head') return poll.clone().lerp(mouth, 0.45);
  if (name === 'forehead') return poll.clone().lerp(mouth, 0.22);
  if (name === 'poll') return poll;
  return null;
}

/**
 * Où est sa bouche quand il mange au râtelier ou à l'auge (tête baissée, pose « eat ») ? Repère monde. La vache amène
 * sa bouche à la hauteur stage.eatReach si le décor la donne (son encolure plie : la bouche avance en montant) ; le
 * mouton et la chèvre mangent à la hauteur de leur pose.
 */
export function ruminantEatMuzzle(stage) {
  const md = stage.model;
  const st = { moving: false, v: 0, size: stage.double.scale * (md.size ?? 1), posture: 'stand', action: 'eat', reachY: stage.eatReach ?? null };
  for (let i = 0; i < 40; i++) md.anim.update(0.1, st);
  stage.holder.updateMatrixWorld(true);
  const p = ruminantLive(stage, 'muzzle');
  md.photoPose();
  stage.holder.updateMatrixWorld(true);
  return p;
}

/**
 * Une image de vie. Le mixeur du modèle fait l'essentiel (respiration, oreilles qui bougent, regard vers un point,
 * tête à l'auge ou au râtelier à la bonne hauteur, bêler ou meugler, la vache qui chasse les mouches avec la queue) ;
 * par-dessus : il rumine debout (la mâchoire de côté), hoche la tête, tend le nez, couche les oreilles et secoue la
 * tête quand on va trop fort. stage.mood (écrit par les jeux) : look, lookAmt, eat (tête à l'auge), reachY (hauteur
 * de la bouche à l'auge, monde), milk (la vache se laisse traire), brush (la vache sous la brosse), chew, nod,
 * nuzzle, ears ('forward' | 'back'), annoyed (secondes), call (bêler / meugler : une fois), flinch (sursaut).
 */
export function ruminantLife(stage, dt) {
  const md = stage.model;
  const anim = md.anim;
  if (!anim) return;
  const m = stage.mood;
  const st = (stage.rst ??= { look: null, lookV: V() });
  const sp = stage.a?.species;
  st.v = 0;
  st.moving = false;
  st.size = stage.double.scale * (md.size ?? 1);
  st.play = false;
  // Il se déplace (jouer à la balle, goatPlay3d.js) : mood.drive = { x, z (place au sol, monde), speed (m/s), heading
  // (vers où il va : atan2(dx, dz) ; π/2 : vers +x, de profil) } ; le jeu le mène, le mixeur choisit l'allure (pas, trot,
  // galop) et cale les sabots. (Même forme que la scène des chiens et des chats, petStage.js.)
  if (m.drive) {
    const dv = m.drive;
    stage.holder.position.x = dv.x;
    stage.holder.position.z = dv.z;
    // (il se tourne en douceur vers où il va)
    let dh = dv.heading - stage.holder.rotation.y;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    stage.holder.rotation.y += dh * Math.min(1, dt * (dv.speed > 0.3 ? 8 : 4));
    st.moving = dv.speed > 0.06;
    st.v = dv.speed / Math.max(0.15, stage.double.scale);
    st.play = !!dv.play && st.moving;
    stage.holder.updateMatrixWorld(true);
  }
  st.posture = 'stand';
  st.noLock = false;
  st.sad = !!m.tired; // (fatiguée : la tête basse, goatPlay3d.js)
  st.action = m.eat ? 'eat' : m.milk ? 'milk' : m.brush ? 'brush' : m.graze ? 'graze' : m.frolic ? 'play' : null;
  // (coup de tête — la chèvre pousse la balle —, une fois ; se dresser sur les postérieurs : mood.posture 'rear')
  st.butt = m.butt > 0;
  m.butt = 0;
  if (m.posture) st.posture = m.posture;
  st.reachY = m.eat && Number.isFinite(m.reachY) ? m.reachY : null;
  // Regard : vers ce qu'on lui montre (repère du modèle, depuis la base de l'encolure, comme le joueur dans le jeu).
  st.look = null;
  if (m.look && m.lookAmt > 0.05) {
    const p = stage.holder.worldToLocal(_v.copy(m.look));
    const n = stage.holder.worldToLocal(neckBone(md).getWorldPosition(_w));
    st.look = st.lookV.set((p.x - n.x) * m.lookAmt, (p.y - n.y) * m.lookAmt, Math.max(0.05, p.z - n.z * 0.5));
  }
  // Bêler (mouton, chèvre) ou meugler (vache), doucement : une fois quand le jeu le demande. Pas le clip du jeu (la
  // tête levée vers le plafond, la gueule grande ouverte, vue de près sans langue ni dents) : le son, et par-dessus
  // (plus bas) la tête à peine levée et les lèvres entrouvertes, le temps du son (CALL_S).
  st.bleat = false;
  st.moo = false;
  if (m.call > 0) {
    m.call = 0;
    stage.callT = CALL_S;
    audio.animal?.(sp, m.callMood ?? 'happy', stage.a?.id ?? null, { gain: 0.7 });
  }
  // Mouches : la vache balance la queue de temps en temps (et se retourne vers son flanc, rarement).
  st.flies = sp === 'cow';
  st.fly = sp === 'cow' && !m.still && Math.random() < dt * 0.025;
  anim.update(dt, st);
  // (la tonte : les mèches de la laine longue raccourcissent avec la toison coupée, shear3d.js)
  if (md.lockUniforms && Number.isFinite(m.lockK)) md.lockUniforms.hState.value.x *= m.lockK;

  // ------------------------------------------------ par-dessus le clip
  const t = (stage.lifeT = (stage.lifeT ?? 0) + dt);
  const neck = neckBone(md);
  const head = headBone(md);
  const jaw = md.bone?.('jaw');
  // Son appel doux (voir plus haut) : 0 → 1 → 0 pendant CALL_S secondes.
  stage.callT = Math.max(0, (stage.callT ?? 0) - dt);
  const calling = stage.callT > 0 ? Math.sin(Math.PI * (1 - stage.callT / CALL_S)) : 0;
  // Ruminer debout : la mâchoire va de côté, en rond, sans fin (quand il ne mange pas déjà au râtelier). Le jeu le
  // demande (mood.chew) ; sinon il rumine de lui-même, par moments, comme au pré. Pas pendant qu'il bêle.
  const chew = stage.callT > 0 ? 0 : m.chew > 0 ? m.chew : Math.sin(t * 0.23 + 1) > 0.1 ? 0.5 : 0;
  const ru = (stage.ruminK = (stage.ruminK ?? 0) + ((chew > 0 && !m.eat ? 1 : 0) - (stage.ruminK ?? 0)) * Math.min(1, dt * (stage.callT > 0 ? 9 : 3)));
  if (jaw && ru > 0.01) {
    anim.turn(jaw, AX, (0.05 + 0.045 * Math.sin(t * 6.3)) * ru * Math.min(1, chew + 0.2));
    anim.turn(jaw, AY, Math.sin(t * 6.3 + 1.2) * 0.06 * ru);
  }
  if (calling > 0.01) {
    // (la tête levée de quelques degrés seulement — elle reste où elle est, à l'auge comme ailleurs —, les lèvres
    // entrouvertes : la vache, plus grave, ouvre un peu plus et plus longtemps)
    if (!m.eat) anim.turn(neck, AX, -0.07 * calling);
    if (jaw) anim.turn(jaw, AX, (sp === 'cow' ? 0.13 : 0.1) * calling);
  }
  // Hocher la tête (contente, ou impatiente quand on prépare son repas).
  if (m.nod > 0) {
    anim.turn(neck, AX, Math.sin(t * 7) * 0.07 * m.nod);
    m.nod = Math.max(0, m.nod - dt * 0.8);
  }
  // Tendre le nez (vers la main, la friandise).
  if (m.nuzzle > 0) {
    anim.turn(neck, AX, 0.12 * m.nuzzle);
    anim.turn(head, AX, -0.18 * m.nuzzle);
  }
  // Trop fort : oreilles couchées, la tête secouée ; un sursaut (flinch) recule le cou.
  m.annoyed = Math.max(0, (m.annoyed ?? 0) - dt);
  const back = m.annoyed > 0 || m.ears === 'back';
  stage.earsBack = (stage.earsBack ?? 0) + ((back ? 1 : 0) - (stage.earsBack ?? 0)) * Math.min(1, dt * 8);
  const fwd = (stage.earsFwd = (stage.earsFwd ?? 0) + ((m.ears === 'forward' && !back ? 1 : 0) - (stage.earsFwd ?? 0)) * Math.min(1, dt * 4));
  for (const e of md.ears ?? []) {
    const s = e.userData.side ?? 1;
    if (stage.earsBack > 0.01) {
      anim.turn(e, AZ, -s * 0.55 * stage.earsBack);
      anim.turn(e, AX, -0.5 * stage.earsBack);
    }
    if (fwd > 0.01) anim.turn(e, AX, 0.25 * fwd);
  }
  if (m.annoyed > 0) anim.turn(head, AY, Math.sin(t * 13) * 0.12 * clamp(m.annoyed * 2, 0, 1));
  if (m.flinch > 0) {
    anim.turn(neck, AX, -0.2 * m.flinch);
    m.flinch = Math.max(0, m.flinch - dt * 2.5);
  }
  // Un pied levé et tenu (parer les onglons) : mood.lift = n° du membre (md.legs : 0 et 1 devant, 2 et 3 derrière),
  // en douceur. Devant : le genou plié, le canon et le pied repliés vers l'arrière, la sole vers le haut ; derrière :
  // le membre tiré en arrière, le jarret ouvert, le paturon plié, la sole vers le haut. (Les angles : LIFT.)
  const want = Number.isInteger(m.lift) ? m.lift : null;
  if (want !== null) stage.liftLeg = want;
  stage.liftK = (stage.liftK ?? 0) + ((want !== null ? 1 : 0) - (stage.liftK ?? 0)) * Math.min(1, dt * 3.5);
  if (stage.liftK < 0.002 && want === null) stage.liftLeg = null;
  const lifted = stage.liftLeg !== null && stage.liftLeg !== undefined ? md.legs?.[stage.liftLeg] : null;
  if (lifted && stage.liftK > 0.001) {
    const k = stage.liftK * stage.liftK * (3 - 2 * stage.liftK);
    const A = (stage.liftTune ?? LIFT)[lifted.front ? 'front' : 'hind'];
    // (le pied tenu ne bouge plus avec l'animation du membre : la pose du membre au moment où on le lève, figée ;
    // sinon le clip de l'arrêt le faisait aller et venir de 3 cm sous la caméra, toute proche)
    const chain = [lifted.pivot, lifted.knee, lifted.fetlock, lifted.paw];
    if (stage.liftBaseOf !== lifted) {
      stage.liftBaseOf = lifted;
      stage.liftBase = chain.map((b) => b.quaternion.clone());
    }
    chain.forEach((b, i) => b.quaternion.slerp(stage.liftBase[i], k));
    anim.turn(lifted.pivot, AX, A[0] * k);
    anim.turn(lifted.knee, AX, A[1] * k);
    anim.turn(lifted.fetlock, AX, A[2] * k);
    anim.turn(lifted.paw, AX, A[3] * k);
    // (et un peu écarté du corps, vers l'extérieur : on voit la sole d'en haut, à côté du ventre, pas dessous)
    if (A[4]) anim.turn(lifted.pivot, AZ, (lifted.side ?? 1) * A[4] * k);
  }
  // Petite queue du mouton et de la chèvre : elle frétille quand il est content.
  if (sp !== 'cow' && md.tail && m.wag > 0) anim.turn(md.tail, AY, Math.sin(t * 15) * 0.4 * m.wag);
  md.root.updateMatrixWorld(true);
}

/** L'adaptation de la scène pour ces espèces (voir CareStage, o.fit). */
export const RUMINANT_FIT = {
  model: (a) => buildRuminantModel(a),
  /** Libère un double construit (model) que la scène n'a pas pu prendre (WebGL refusé avant de le poser). */
  drop(md) {
    if (!md || md.root?.parent) return;
    md.dispose?.();
    disposeModel(md.root);
  },
  marks: ruminantMarks,
  live: ruminantLive,
  region: ruminantRegion,
  eatMuzzle: ruminantEatMuzzle,
  life: ruminantLife,
};
