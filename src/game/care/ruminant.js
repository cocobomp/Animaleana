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

/** Espèces de la ferme qui ont leur scène de soin (la bergerie, la chèvrerie, l'étable : barn.js). */
export const RUMINANTS = ['sheep', 'goat', 'cow'];

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AX = V(1, 0, 0);
const AY = V(0, 1, 0);
const AZ = V(0, 0, 1);
const _v = V();
const _w = V();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

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
  st.posture = 'stand';
  st.noLock = false;
  st.sad = false;
  st.action = m.eat ? 'eat' : m.milk ? 'milk' : m.brush ? 'brush' : m.graze ? 'graze' : null;
  st.reachY = m.eat && Number.isFinite(m.reachY) ? m.reachY : null;
  // Regard : vers ce qu'on lui montre (repère du modèle, depuis la base de l'encolure, comme le joueur dans le jeu).
  st.look = null;
  if (m.look && m.lookAmt > 0.05) {
    const p = stage.holder.worldToLocal(_v.copy(m.look));
    const n = stage.holder.worldToLocal(neckBone(md).getWorldPosition(_w));
    st.look = st.lookV.set((p.x - n.x) * m.lookAmt, (p.y - n.y) * m.lookAmt, Math.max(0.05, p.z - n.z * 0.5));
  }
  // Bêler (mouton, chèvre) ou meugler (vache), doucement : une fois quand le jeu le demande.
  const call = m.call > 0;
  st.bleat = call && sp !== 'cow';
  st.moo = call && sp === 'cow';
  if (call) {
    m.call = 0;
    audio.animal?.(sp, m.callMood ?? 'happy', stage.a?.id ?? null, { gain: 0.7 });
  }
  // Mouches : la vache balance la queue de temps en temps (et se retourne vers son flanc, rarement).
  st.flies = sp === 'cow';
  st.fly = sp === 'cow' && !m.still && Math.random() < dt * 0.025;
  anim.update(dt, st);

  // ------------------------------------------------ par-dessus le clip
  const t = (stage.lifeT = (stage.lifeT ?? 0) + dt);
  const neck = neckBone(md);
  const head = headBone(md);
  const jaw = md.bone?.('jaw');
  // Ruminer debout : la mâchoire va de côté, en rond, sans fin (quand il ne mange pas déjà au râtelier).
  const ru = (stage.ruminK = (stage.ruminK ?? 0) + ((m.chew > 0 && !m.eat ? 1 : 0) - (stage.ruminK ?? 0)) * Math.min(1, dt * 3));
  if (jaw && ru > 0.01) {
    anim.turn(jaw, AX, (0.05 + 0.045 * Math.sin(t * 6.3)) * ru * Math.min(1, m.chew + 0.2));
    anim.turn(jaw, AY, Math.sin(t * 6.3 + 1.2) * 0.06 * ru);
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
  // Petite queue du mouton et de la chèvre : elle frétille quand il est content.
  if (sp !== 'cow' && md.tail && m.wag > 0) anim.turn(md.tail, AY, Math.sin(t * 15) * 0.4 * m.wag);
  md.root.updateMatrixWorld(true);
}

/** L'adaptation de la scène pour ces espèces (voir CareStage, o.fit). */
export const RUMINANT_FIT = {
  model: (a) => buildRuminantModel(a),
  marks: ruminantMarks,
  live: ruminantLive,
  region: ruminantRegion,
  eatMuzzle: ruminantEatMuzzle,
  life: ruminantLife,
};
