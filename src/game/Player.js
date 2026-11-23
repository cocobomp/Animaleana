// Le joueur : son avatar, ses déplacements à pied ou à cheval, et la caméra.

import * as THREE from 'three';
import {
  buildAvatar, animateAvatarWalk, poseAvatar, updateAvatarLife, startAvatarGesture, careGestureFor,
  animateAvatarRide, avatarBusy, stopAvatarGesture,
} from './models/avatarModel.js';
import { gaitFromSpeed, gaitWeights, gestureHeight, clipGait, stirrupFor } from './models/avatarMotion.js';
import { rootToTorso, armIK } from './models/avatarRig.js';
import { disposeModel } from './models/animalModel.js';
import { navTarget } from './nav.js';
import { tackEffects } from '../sim/gear.js';
import { rideSpeed, allowedGait, rideEffort, nextSpookIn, nextGrazeIn, SPOOKY, responsiveness } from '../sim/riding.js'; // allures en balade libre
import { newPosting, postTick, isPosting, POST } from '../sim/posting.js'; // ⬆️ trot enlevé
import { newSession, sessionTick, effortFactor } from '../sim/warmup.js'; // 🐢 détente et retour au calme
import { PRAISE, newPraise, openPraise, coolJustDone } from '../sim/praise.js'; // 🤚 « Bravo ! » / « Rassure-le »
import { spookFactor } from '../sim/horseQuirks.js'; // (💪 plus peur de sa peur : moins d'écarts)
import { helmetModel, helmetStrapsModel } from './models/tackModels.js'; // bombe du cavalier et ses sangles
import { helmetFit } from './models/avatarHair.js'; // la bombe à la taille de la coiffure
import { prepareRiderFit, fitRider, seatOnSaddle, releaseRiderFit } from './models/riderFit.js'; // cavalier sur le cheval réaliste
const TAU = Math.PI * 2; // (un tour de foulée)

const WALK = 3.2;
const RUN = 6.2;
const CARRY = 2.3; // on marche moins vite avec une caisse dans les bras

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const _v = new THREE.Vector3();
const _head = new THREE.Vector3();
const _rA = new THREE.Vector3();
const _rB = new THREE.Vector3();
const _rC = new THREE.Vector3();
const _rD = new THREE.Vector3();
const _gw = {};
const _ray = new THREE.Vector3();

/** Pièce de décor visible (toute sa chaîne de parents) et assez grande pour cacher la vue (rayon ≥ 0,45 m). */
function bigVisible(o) {
  const g = o.geometry;
  if (!g) return false;
  if (!g.boundingSphere) g.computeBoundingSphere();
  const s = o.getWorldScale(_ray2);
  if (g.boundingSphere.radius * Math.max(s.x, s.y, s.z) < 0.45) return false;
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
const _ray2 = new THREE.Vector3();
const _hp = new THREE.Vector3();
const _hq = new THREE.Vector3();
const _hm = new THREE.Matrix4();
const _seat = { y: 0, z: 0 };

/** Quelques points des mains de l'avatar (repère de chaque main) : les sommets de leurs pièces. */
function handPoints(a) {
  if (a.handPts) return a.handPts;
  a.handPts = a.hands.map((h) => {
    h.updateWorldMatrix(true, true);
    const inv = _hm.copy(h.matrixWorld).invert();
    const pts = [];
    h.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      const step = Math.max(1, Math.floor(pos.count / 12));
      for (let i = 0; i < pos.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m));
    });
    return pts;
  });
  return a.handPts;
}

/**
 * Dessus de l'encolure et du garrot autour des mains (pelage du cheval réaliste) : les triangles tournés
 * vers le haut dans une boîte autour des mains (repère du cheval), choisis une fois par monture dans la
 * pose où on la monte ; leurs sommets déformés sont relus à chaque image (getVertexPosition).
 */
function crestMesh(entity, a) {
  const md = entity.model;
  const coat = md.coatMesh;
  const geo = coat.geometry;
  if (md.crest?.pos === geo.attributes.position) return md.crest;
  entity.root.updateMatrixWorld(true);
  const inv = _hm.copy(entity.root.matrixWorld).invert();
  const hz = [];
  const hy = [];
  for (const h of a.hands) {
    h.getWorldPosition(_hp).applyMatrix4(inv);
    hz.push(_hp.z);
    hy.push(_hp.y);
  }
  const z0 = Math.min(...hz) - 0.3;
  const z1 = Math.max(...hz) + 0.5;
  const y0 = Math.min(...hy) - 0.35;
  const pos = geo.attributes.position;
  const P = new Float32Array(pos.count * 3);
  const keep = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    coat.getVertexPosition(i, _hp).applyMatrix4(coat.matrixWorld).applyMatrix4(inv).toArray(P, i * 3);
    keep[i] = Math.abs(_hp.x) < 0.25 && _hp.z > z0 && _hp.z < z1 && _hp.y > y0 ? 1 : 0;
  }
  const I = geo.index.array;
  const tris = [];
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  for (let t = 0; t < I.length; t += 3) {
    const [i0, i1, i2] = [I[t], I[t + 1], I[t + 2]];
    if (!keep[i0] || !keep[i1] || !keep[i2]) continue;
    ab.set(P[i1 * 3] - P[i0 * 3], P[i1 * 3 + 1] - P[i0 * 3 + 1], P[i1 * 3 + 2] - P[i0 * 3 + 2]);
    ac.set(P[i2 * 3] - P[i0 * 3], P[i2 * 3 + 1] - P[i0 * 3 + 1], P[i2 * 3 + 2] - P[i0 * 3 + 2]);
    // (tourné vers le haut, quel que soit le sens des faces)
    const n = ab.cross(ac);
    if (Math.abs(n.y) > 0.25 * n.length()) tris.push(i0, i1, i2);
  }
  const verts = [...new Set(tris)];
  const slot = new Map(verts.map((v, k) => [v, k]));
  md.crest = {
    pos,
    verts: Uint32Array.from(verts),
    tris: Uint32Array.from(tris.map((v) => slot.get(v))),
    w: new Float32Array(verts.length * 3),
  };
  return md.crest;
}

/**
 * Bouche d'un animal (repère du monde), un peu sous le bout du nez : le long de la tête pour un
 * modèle procédural ; pour un GLB (repère de la tête aligné sur le corps), en avant et en bas.
 */
function mouthOf(entity, out) {
  const md = entity.model;
  const look = entity.data?.look ?? {};
  const hl = look.headLen ?? 0.3;
  if (md.mouth) out.copy(md.mouth); // (cheval réaliste : mesurée sur le modèle)
  else if (md.gltf) out.set(0, -0.5 * hl, 0.82 * hl);
  else out.set(0, -0.25 * (look.headR ?? 0.1), 0.72 * hl);
  return md.head.localToWorld(out);
}

export class Player {
  constructor(scene, world, look) {
    this.scene = scene;
    this.world = world;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.heading = 0;
    this.speed = 0;
    this.phase = 0;
    this.mount = null; // AnimalEntity monté
    // Options de updateAvatarLife, réutilisées à chaque image (pas d'allocation).
    this.lifeOpts = { speed: 0, riding: false, carry: false };
    this.setAvatar(look);
    // Lanterne du soir, un peu devant le personnage : les visages (le sien, ceux qu'on croise) sont
    // éclairés de face plutôt que d'en haut (le bas du visage, avec la bouche, restait dans le noir).
    this.torch = new THREE.PointLight(0xffd9a0, 0, 14, 1.6);
    this.torch.position.set(0, 2.1, 0.75);
    this.root.add(this.torch);
  }

  setAvatar(look) {
    this.look = look;
    if (this.avatar) {
      this.helmet?.parent?.remove(this.helmet); // la bombe passe sur le nouvel avatar
      this.helmetStraps?.parent?.remove(this.helmetStraps);
      this.root.remove(this.avatar.root);
      disposeModel(this.avatar.root);
    }
    // Avec la bombe, les mèches sont rentrées dessous (coiffure « sous un chapeau ») : les boucles ne
    // traversent plus la coque.
    this.avatar = buildAvatar(this.helmet ? { ...look, helmet: true } : look);
    this.root.add(this.avatar.root);
    if (this.helmet) this.wearHelmet();
    if (this.mount) this.seat();
    if (this.carried) poseAvatar(this.avatar, 'carry', { size: this.carrySize });
  }

  get position() {
    return this.root.position;
  }

  get eyeHeight() {
    return this.mount ? this.mount.model.saddleY * this.mount.scale + RIDER_EYE : 1.5;
  }

  spawn(x, z) {
    this.root.position.set(x, this.world.heightAt(x, z), z);
    this.heading = Math.PI;
  }

  /** Monter à cheval : l'avatar s'assoit sur le dos de l'animal. */
  ride(entity) {
    this.mount = entity;
    // En selle, on part au pas (boutons d'allure : src/ui/UI.js ; touches 0 1 2 3 : Game.onKey).
    this.gait = 'walk';
    this.gaitNow = 'walk';
    this.spook = null;
    this.spookIn = null;
    this.tiredSaid = null;
    this.canterFor = 0; // secondes de galop d'affilée (onCanter une fois par balade, à 3 s)
    this.cantered = false;
    this.session = newSession(); // 🐢 détente au début, retour au calme à la fin (src/sim/warmup.js)
    this.praise = newPraise(); // 🤚 le bouton « Bravo ! » / « Rassure-le » (src/sim/praise.js : Game.praiseHorse)
    this.grazing = null; // il s'est arrêté pour brouter (rideStep) : { pull } secondes de joystick poussé
    this.grazeIn = null;
    this.posting = newPosting(); // ⬆️ trot enlevé (src/sim/posting.js : Game.postTrot)
    this.postingNow = false;
    this.canPost = undefined; // (en selle avec des étriers : rideStep)
    entity.ridden = true;
    entity.data.following = false;
    this.root.position.copy(entity.position);
    this.heading = entity.heading;
    // (tournés tous les deux comme le cheval tout de suite : seat mesure le cheval dans le repère du cavalier ;
    // un cheval qu'on vient de faire venir n'a pas encore été animé)
    this.root.rotation.y = this.heading;
    if (entity.root) entity.root.rotation.y = this.heading;
    this.seat();
  }

  /**
   * Installe l'avatar en selle (cheval GLB ou procédural) : hauteur de la selle, pieds dans les
   * étriers contre le flanc selon la largeur du ventre (genou plié), mains aux rênes au-dessus du
   * garrot (base de l'encolure).
   */
  seat() {
    const a = this.avatar;
    const e = this.mount;
    const md = e.model;
    const sc = e.scale;
    const seatY = md.saddleY * sc - 0.78;
    const seatZ = -e.data.look.bodyLen * sc * 0.05;
    a.root.position.set(0, seatY, seatZ);
    const look = e.data.look;
    // (md.fat : embonpoint du cheval réaliste, son tronc s'élargit : les pieds restent contre le flanc)
    const R = (md.dims?.R ?? look.bodyR * (look.fluff ?? 1)) * sc * (md.fat ?? 1);
    const saddle = !this.bareback && !!e.data.gear?.saddle;
    const foot = stirrupFor(R, saddle, {});
    this.ride0 = {
      gait: 0, phase: 0, bob: 0, posting: saddle,
      seatY, seatZ, reinsY: 1.0, reinsZ: 0.36, footX: foot.x, footY: foot.y, footZ: foot.z, kneeOut: foot.out,
    };
    this.rideGait = 0;
    this.ridePhase = 0;
    this.rideRest = undefined;
    this.handLift = 0;
    poseAvatar(a, 'ride', this.ride0);
    // Cheval réaliste : le bassin posé sur le siège, les étriers à la longueur des jambes, les jambes hors des
    // flancs à chaque image (src/game/models/riderFit.js). Avant, le bassin entrait de 6 à 8 cm dans le dos et
    // les jambes de 5 à 13 cm dans les flancs (au saut).
    releaseRiderFit(this.fit);
    this.fit = prepareRiderFit(e, a, !saddle);
    const st = this.ride0;
    if (this.fit) {
      seatOnSaddle(this.fit, _seat);
      st.seatY = _seat.y;
      st.seatZ = _seat.z;
    }
    // Garrot : la base de l'encolure, dans le repère du cheval (le joueur est à la même place).
    if (md.neck) {
      e.root.updateMatrixWorld(true);
      md.neck.getWorldPosition(_v);
      e.root.worldToLocal(_v);
      st.reinsY = clamp(_v.y - st.seatY + 0.1, 0.95, 1.12);
      st.reinsZ = clamp(_v.z - st.seatZ - 0.18, 0.26, 0.4);
    }
    poseAvatar(a, 'ride', st);
    if (this.fit) fitRider(this.fit, a);
  }

  /**
   * Bombe du cavalier sur la tête de l'avatar (null : on l'enlève). En la mettant (ou en l'enlevant),
   * l'avatar est reconstruit avec les mèches rentrées dessous (ou qui ressortent).
   */
  setHelmet(h) {
    const had = !!this.helmet;
    if (this.helmet) {
      this.helmet.parent?.remove(this.helmet);
      this.helmet = null;
    }
    this.helmetStraps?.parent?.remove(this.helmetStraps);
    this.helmetStraps = null;
    if (h) {
      this.helmet = helmetModel(h.item, h.color);
      // Pas d'ombre portée : la visière mettait les yeux dans le noir à midi.
      this.helmet.traverse((o) => { o.castShadow = false; });
    }
    if (had !== !!h && this.look) this.setAvatar(this.look); // (pose la bombe : wearHelmet)
    else if (this.helmet) this.wearHelmet();
  }

  /**
   * Pose la bombe sur la tête, à la taille de la coiffure (helmetFit : plus grande sur les cheveux
   * bouclés, qui ont beaucoup de volume). Portée un peu en arrière : la visière s'arrête au-dessus des
   * sourcils (plus basse, elle cachait les yeux vus de la caméra, au-dessus du personnage).
   */
  wearHelmet() {
    const style = this.look?.hairStyle ?? 'short';
    const f = helmetFit(style);
    this.helmet.position.set(0, f.y, f.z);
    this.helmet.rotation.x = f.tilt;
    this.helmet.scale.setScalar(f.scale);
    this.avatar.head.add(this.helmet);
    // Sangles collées aux joues (devant et derrière l'oreille, jugulaire sous le menton), dans le repère
    // de la tête : le harnais de la bombe exposée (deux anneaux fixes) flottait à côté du visage.
    for (const m of this.helmet.userData.harness ?? []) m.visible = false;
    this.helmetStraps?.parent?.remove(this.helmetStraps);
    this.helmetStraps = helmetStrapsModel(style, f);
    this.avatar.head.add(this.helmetStraps);
  }

  /**
   * Rênes : des anneaux du mors (filet en place, voir gearModels.js) aux mains du cavalier, un peu
   * détendues. Deux rubans croisés par rêne (visibles sous tous les angles), recalculés à chaque image :
   * dans lateUpdate, puis par Game.frame après les séances (afterSessions), qui peuvent encore soulever
   * et basculer le cheval et le cavalier (saut d'obstacle, src/game/Activities.js).
   */
  updateReins(m) {
    const R = m.gearGroup?.userData.reins;
    if (!R) {
      if (this.reins) this.reins.visible = false;
      return;
    }
    if (!this.reins) {
      const N = 10;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * N * 4 * 3), 3));
      const idx = [];
      for (let r = 0; r < 2; r++) {
        for (let k = 0; k < 2; k++) {
          const b = (r * 2 + k) * N * 2;
          for (let i = 0; i < N - 1; i++) {
            const a0 = b + i * 2;
            idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
          }
        }
      }
      g.setIndex(idx);
      this.reins = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.6, side: THREE.DoubleSide }));
      this.reins.frustumCulled = false;
      this.reins.castShadow = false;
      this.reins.userData.N = N;
      this.scene.add(this.reins);
    }
    const mesh = this.reins;
    mesh.visible = true;
    if (mesh.userData.color !== R.color) {
      mesh.userData.color = R.color;
      mesh.material.color.setHex(R.color ?? 0x2a1a10);
    }
    const N = mesh.userData.N;
    const pos = mesh.geometry.attributes.position;
    R.parent.updateWorldMatrix(true, false);
    const a = this.avatar;
    const w = 0.009;
    for (let r = 0; r < 2; r++) {
      _rA.copy(R.points[r]).applyMatrix4(R.parent.matrixWorld);
      // (main du même côté que l'anneau : anneau droit -> main droite)
      const hand = a.hands[R.points[r].x > 0 ? 0 : 1];
      hand.getWorldPosition(_rB);
      const d = _rA.distanceTo(_rB);
      _rC.lerpVectors(_rA, _rB, 0.5);
      _rC.y -= Math.min(0.12, d * 0.18);
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        // courbe de Bézier (anneau, milieu détendu, main)
        _rD.copy(_rA).multiplyScalar((1 - t) * (1 - t)).addScaledVector(_rC, 2 * t * (1 - t)).addScaledVector(_rB, t * t);
        for (let k = 0; k < 2; k++) {
          const o = ((r * 2 + k) * N + i) * 2;
          if (k === 0) {
            pos.setXYZ(o, _rD.x, _rD.y + w, _rD.z);
            pos.setXYZ(o + 1, _rD.x, _rD.y - w, _rD.z);
          } else {
            pos.setXYZ(o, _rD.x + w, _rD.y, _rD.z);
            pos.setXYZ(o + 1, _rD.x - w, _rD.y, _rD.z);
          }
        }
      }
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }

  /**
   * Après les séances de l'image (Game.frame) : les rênes suivent la dernière place du cheval et du
   * cavalier. (Pas dans onBeforeRender : three.js envoie les sommets à la carte graphique avant cet
   * appel, les rênes dessinées seraient restées celles de lateUpdate, un mètre plus bas pendant un saut.)
   */
  afterSessions() {
    if (this.mount && this.fit) {
      // (harnachement changé en selle, à la sellerie : selle, étriers et cartes refaits)
      if (this.fit.gear !== (this.mount.gearGroup ?? null)) this.seat();
      if (this.fit) fitRider(this.fit, this.avatar);
    }
    if (this.mount && this.ride0) this.handsOverNeck(this.mount);
    if (this.mount && this.reins?.visible) this.updateReins(this.mount);
  }

  /**
   * Les mains restent au-dessus de l'encolure (cheval réaliste) : après les séances (le saut d'obstacle
   * bascule le cheval et le cavalier, étire puis relève l'encolure, les mains avancent le long de la
   * crinière), le dessus du pelage est lu sous chaque main et, si une main y entre, les deux mains montent
   * d'autant (bras refaits). Avant, elles entraient jusqu'à 11 cm dans l'encolure à la réception, et
   * jusqu'à 6 cm au galop. La hausse retombe en quelques images (pas d'à-coup quand l'encolure se baisse).
   */
  handsOverNeck(m) {
    const md = m.model;
    const a = this.avatar;
    const coat = md.coatMesh;
    if (!coat?.isSkinnedMesh || !a?.hands) {
      this.handLift = 0;
      return;
    }
    m.root.updateMatrixWorld(true);
    a.root.updateWorldMatrix(true, true);
    const C = crestMesh(m, a);
    const W = C.w;
    for (let k = 0; k < C.verts.length; k++) coat.getVertexPosition(C.verts[k], _hp).applyMatrix4(coat.matrixWorld).toArray(W, k * 3);
    const pts = handPoints(a);
    const H = (this.handW ??= []);
    H.length = 0;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < 2; i++) {
      for (const p of pts[i]) {
        _hq.copy(p).applyMatrix4(a.hands[i].matrixWorld);
        H.push(_hq.x, _hq.y, _hq.z);
        x0 = Math.min(x0, _hq.x);
        x1 = Math.max(x1, _hq.x);
        z0 = Math.min(z0, _hq.z);
        z1 = Math.max(z1, _hq.z);
      }
    }
    // Pour chaque point des mains, le pelage à sa verticale (le plus haut des triangles qui le couvrent).
    let need = 0;
    const T = C.tris;
    for (let t = 0; t < T.length; t += 3) {
      const a0 = T[t] * 3;
      const b0 = T[t + 1] * 3;
      const c0 = T[t + 2] * 3;
      const ax = W[a0];
      const az = W[a0 + 2];
      const bx = W[b0];
      const bz = W[b0 + 2];
      const cx = W[c0];
      const cz = W[c0 + 2];
      if (Math.max(ax, bx, cx) < x0 || Math.min(ax, bx, cx) > x1 || Math.max(az, bz, cz) < z0 || Math.min(az, bz, cz) > z1) continue;
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-12) continue;
      for (let k = 0; k < H.length; k += 3) {
        const px = H[k];
        const pz = H[k + 2];
        const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / det;
        const l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const y = l1 * W[a0 + 1] + l2 * W[b0 + 1] + l3 * W[c0 + 1];
        need = Math.max(need, y + 0.005 - H[k + 1]);
      }
    }
    need = Math.min(0.2, need);
    this.handLift = Math.max(need, (this.handLift ?? 0) * 0.85 - 0.002);
    if (this.handLift <= 0.0005) {
      this.handLift = 0;
      return;
    }
    for (let i = 0; i < 2; i++) {
      a.hands[i].getWorldPosition(_hp);
      _hp.y += this.handLift;
      a.root.worldToLocal(_hp);
      rootToTorso(a, _hp);
      _hq.set(i === 0 ? 0.45 : -0.45, -1, -0.7);
      armIK(a, i, _hp, _hq, 1);
    }
    a.root.updateMatrixWorld(true);
  }

  dismount() {
    const e = this.mount;
    if (!e) return null;
    this.stopGrazing();
    if (this.reins) this.reins.visible = false;
    releaseRiderFit(this.fit); // (étriers remis à leur longueur)
    this.fit = null;
    e.ridden = false;
    e.speed = 0;
    this.mount = null;
    this.ridePh = undefined;
    // Bombe ôtée une fois descendu : setHelmet refait l'avatar (mèches qui ressortent), et encore en selle il
    // était remis en selle (seat) : les étriers revenaient à la longueur des jambes, et le cheval les gardait.
    this.setHelmet(null);
    const a = this.avatar;
    a.root.position.set(0, 0, 0);
    a.root.rotation.x = 0;
    // (remis droit : il suivait l'inclinaison du cheval sur une pente)
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    poseAvatar(a, 'stand');
    // On descend à côté du cheval.
    const side = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading)).multiplyScalar(1.4);
    this.root.position.add(side);
    this.world.resolveCollisions(this.root.position);
    this.root.position.y = this.world.heightAt(this.root.position.x, this.root.position.z);
    return e;
  }

  /**
   * Marcher tout seul jusqu'à un point (toucher l'écran). onArrive est appelé à l'arrivée.
   * opts.slow : à petits pas ; opts.budget : distance maximale (m) avant de s'arrêter là.
   */
  goTo(point, radius = 0.6, onArrive = null, opts = null) {
    const here = this.root.position.clone();
    // anchor / still : point où l'on piétine et depuis combien de temps (voir update : on tourne en rond ?)
    this.auto = { target: point.clone().setY(0), radius, onArrive, stuck: 0, last: here, anchor: here.clone(), still: 0, slow: !!opts?.slow, budget: opts?.budget ?? Infinity };
  }

  /**
   * Porter une caisse (TripFlow.crateAnimal) : elle est tenue devant, à deux mains. obj reste
   * enfant de this.root (TripFlow l'enlève en la posant : on le remarque et on lâche).
   * size : { w, h, d } (sinon mesurée).
   */
  holdCrate(obj, size = null) {
    if (!obj) {
      this.carried = null;
      poseAvatar(this.avatar, 'stand');
      return;
    }
    if (!size) {
      const box = new THREE.Box3().setFromObject(obj);
      const s = box.getSize(new THREE.Vector3());
      size = { w: s.x, h: s.y, d: s.z };
    }
    this.carried = obj;
    this.carrySize = size;
    this.cancelGesture();
    poseAvatar(this.avatar, 'carry', { size });
    this.placeCrate();
  }

  /** La caisse suit le buste (repère du torse → repère du joueur), sans allocation. */
  placeCrate() {
    const c = this.carried;
    if (!c) return;
    const a = this.avatar;
    if (c.parent !== this.root || !a.carry) {
      this.holdCrate(null);
      return;
    }
    _v.copy(a.carry.pos).applyQuaternion(a.torso.quaternion).add(a.torso.position).add(a.root.position);
    c.position.copy(_v);
    c.quaternion.copy(a.torso.quaternion);
  }

  /**
   * Geste de soin (Game émet 'care') : selon le soin, verser, tendre la main, brosser, caresser,
   * frotter… tourné vers l'animal ; on fait d'abord un petit pas vers lui s'il est un peu loin.
   */
  careGesture(action, entity, opts = null) {
    const a = this.avatar;
    if (this.carried) return;
    if (this.mount) {
      // À cheval : une petite tape sur l'encolure (opts.withers : des gratouilles au garrot, juste devant la selle, sous
      // les mains qui tiennent les rênes).
      const w = !!opts?.withers;
      if (entity === this.mount && this.ride0) startAvatarGesture(a, 'pat', { local: true, x: -0.07, y: this.ride0.reinsY + (w ? -0.07 : 0.03), z: this.ride0.reinsZ + (w ? 0.02 : 0.12), duration: 1.2 });
      return;
    }
    const kind = careGestureFor(action);
    if (!entity) {
      startAvatarGesture(a, kind);
      return;
    }
    const p = this.root.position;
    const sc = entity.scale ?? 1;
    const back = (entity.model?.saddleY ?? 0.5) * sc; // hauteur du dos
    this.faceHead = false;
    this.faceUdder = false;
    if (kind === 'offer' && entity.model?.head && this.offerToHead(entity, kind)) return;
    // (traite d'une vache réaliste : la main va aux trayons, sous le ventre, pas au flanc)
    if (kind === 'milk' && entity.model?.udderPoint && this.milkAtUdder(entity, kind)) return;
    const y = gestureHeight(kind, back);
    // Distance au bord de l'animal dans notre direction (une ellipse : long devant, étroit sur le côté).
    const ep = entity.position;
    const dx = p.x - ep.x;
    const dz = p.z - ep.z;
    const d = Math.hypot(dx, dz) || 1;
    const look = entity.data?.look ?? {};
    const ang = Math.atan2(dx, dz) - (entity.heading ?? 0);
    const ra = Math.max(0.15, (look.bodyLen ?? 0.6) * 0.5 * sc);
    const rb = Math.max(0.1, (look.bodyR ?? 0.2) * sc);
    const edge = 1 / Math.hypot(Math.cos(ang) / ra, Math.sin(ang) / rb);
    this.faceTo = entity;
    const reach = kind === 'lead' || kind === 'play' ? 1.6 : 0.42;
    const go = (dist) => startAvatarGesture(a, kind, { y, z: clamp(dist - edge, 0.3, 0.48) });
    if (d - edge > reach + 0.15 && d - edge < reach + 1.8 && !this.auto) {
      // Un petit pas vers l'animal (pas plus de 1,8 m), puis le geste.
      this.goTo(ep, edge + reach, () => go(Math.hypot(this.root.position.x - ep.x, this.root.position.z - ep.z)), { slow: true, budget: 1.8 });
      return;
    }
    go(d);
  }

  /**
   * Friandise, remède : la main va à la bouche de l'animal (devant sa tête), pas au flanc. Petit
   * pas jusqu'à côté de la tête si besoin (en longeant l'animal). Renvoie faux si la tête est trop
   * loin : on garde alors le geste vers le corps.
   */
  offerToHead(entity, kind) {
    const a = this.avatar;
    const p = this.root.position;
    const sc = entity.scale ?? 1;
    entity.root?.updateMatrixWorld(true); // l'animal a pu bouger depuis la dernière image
    mouthOf(entity, _head);
    const groundY = this.world.heightAt(_head.x, _head.z);
    const y = clamp(_head.y - groundY - 0.03 * sc, 0.3, 1.45);
    const rHead = clamp((entity.data?.look?.headR ?? 0.12) * sc * 0.6, 0.04, 0.12);
    const reach = 0.4;
    const d = Math.hypot(p.x - _head.x, p.z - _head.z);
    if (d - rHead > reach + 2.6) return false;
    this.faceTo = entity;
    this.faceHead = true;
    const go = () => {
      mouthOf(entity, _head);
      const dd = Math.hypot(this.root.position.x - _head.x, this.root.position.z - _head.z);
      startAvatarGesture(a, kind, { y, z: clamp(dd - rHead, 0.3, 0.48) });
    };
    if (d - rHead > reach + 0.15 && !this.auto) {
      // À côté de la bouche, de notre côté de l'animal, à portée de main : on longe le flanc au
      // lieu de traverser l'animal.
      const h = entity.heading ?? 0;
      const rx = Math.cos(h);
      const rz = -Math.sin(h);
      const side = (p.x - entity.position.x) * rx + (p.z - entity.position.z) * rz >= 0 ? 1 : -1;
      const off = rHead + reach * 0.85;
      const target = new THREE.Vector3(_head.x + rx * side * off, 0, _head.z + rz * side * off);
      this.goTo(target, 0.2, go, { slow: true, budget: 3.2 });
      return true;
    }
    go();
    return true;
  }

  /**
   * Traite : la main va aux trayons (model.udderPoint, le bas de la mamelle de la vache réaliste), à leur hauteur ; petit
   * pas jusqu'à côté de la mamelle, de notre côté de l'animal, si besoin. Renvoie faux si la mamelle est trop loin.
   */
  milkAtUdder(entity, kind) {
    const a = this.avatar;
    const p = this.root.position;
    entity.root?.updateMatrixWorld(true);
    const up = entity.model.udderPoint.getWorldPosition(_head);
    const groundY = this.world.heightAt(up.x, up.z);
    const y = clamp(up.y - groundY + 0.05, 0.25, 1.0);
    const d = Math.hypot(p.x - up.x, p.z - up.z);
    if (d > 4.5) return false;
    this.faceTo = entity;
    this.faceUdder = true;
    const sc = entity.scale ?? 1;
    const half = Math.max(0.2, (entity.data?.look?.bodyR ?? 0.46) * sc * 0.9);
    const go = () => {
      const q = entity.model.udderPoint.getWorldPosition(_head);
      const dd = Math.hypot(this.root.position.x - q.x, this.root.position.z - q.z);
      startAvatarGesture(a, kind, { y, z: clamp(dd - 0.05, 0.3, 0.55) });
    };
    if (d > half + 0.6 && !this.auto) {
      const h = entity.heading ?? 0;
      const rx = Math.cos(h);
      const rz = -Math.sin(h);
      const side = (p.x - entity.position.x) * rx + (p.z - entity.position.z) * rz >= 0 ? 1 : -1;
      const off = half + 0.42;
      const target = new THREE.Vector3(up.x + rx * side * off, 0, up.z + rz * side * off);
      this.goTo(target, 0.2, go, { slow: true, budget: 3.2 });
      return true;
    }
    go();
    return true;
  }

  /**
   * Vrai pendant un geste de soin (ou le petit pas qui le précède) : la liste de tâches attend
   * qu'il soit fini avant de partir vers la suivante (TaskQueue.update).
   */
  careBusy() {
    return !!this.auto?.slow || avatarBusy(this.avatar);
  }

  cancelGesture() {
    this.faceTo = null;
    this.faceHead = false;
    this.faceUdder = false;
    if (this.avatar.life) this.avatar.life.act.kind = null;
  }

  cancelGoTo() {
    this.auto = null;
  }

  update(dt, ctrl, camYaw, firstPerson) {
    // scripted : déplacé par le jeu (on fait monter un cheval dans le van, src/game/Vehicle.js) ; on anime seulement la marche.
    if (this.scripted) {
      this.root.rotation.y = this.heading;
      this.animateWalk(dt); // (la caisse portée garde la pose « carry », voir holdCrate)
      return;
    }
    let { run } = ctrl;
    const { move } = ctrl;
    const f = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const r = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw));
    let dir = f.multiplyScalar(move.y).add(r.multiplyScalar(move.x));
    let amount = dir.length();
    if (amount > 0.05) {
      this.auto = null;
      if (this.faceTo) {
        // On repart au joystick : le geste de soin s'arrête en douceur.
        this.faceTo = null;
        stopAvatarGesture(this.avatar);
      }
    } else if (this.auto) {
      const a = this.auto;
      const pos = this.root.position;
      // On contourne les enclos par leur ouverture.
      const way = navTarget(pos, a.target);
      const to = new THREE.Vector3(way.x - pos.x, 0, way.z - pos.z);
      const d = way === a.target ? to.length() : Math.max(to.length(), a.radius + 0.1);
      // Bloqué contre un mur depuis un moment : on s'arrête là.
      const moved = pos.distanceTo(a.last);
      a.stuck = moved < dt * 0.5 ? a.stuck + dt : 0;
      a.budget -= moved;
      a.last.copy(pos);
      // On marche, mais sans aller nulle part (aller-retour entre deux points de passage, que la détection
      // « bloqué » ne voit pas : on bouge à chaque image) : après 4 s dans un rond de 2 m, on s'arrête aussi.
      if (pos.distanceTo(a.anchor) > 2) {
        a.anchor.copy(pos);
        a.still = 0;
      } else a.still += dt;
      if (d < a.radius || a.stuck > 1.2 || a.still > 4 || a.budget <= 0) {
        const cb = a.onArrive;
        this.auto = null;
        cb?.();
      } else {
        dir = to.normalize();
        amount = a.slow ? 0.3 : 1;
        run = d > 10 && !a.slow;
      }
    }
    const mount = this.mount;
    if (this.carried) run = false;
    let max = run ? RUN : this.carried ? CARRY : WALK;
    // Balade libre à cheval (pas pendant une activité, ni quand on se laisse guider) : l'allure choisie.
    const freeRide = !!mount && this.gaitEnabled !== false && !this.auto;
    // (une activité, un trajet, « aller vers » prend les rênes : il relève la tête, il ne broute plus)
    if (!freeRide && this.grazing) this.stopGrazing();
    if (mount && freeRide) {
      let g = this.gait ?? 'walk';
      // À l'arrêt, pousser le joystick fait repartir au pas.
      if (g === 'halt' && amount > 0.05) {
        g = this.gait = 'walk';
        this.onGait?.('walk', 'start');
      }
      if (run && g !== 'halt') g = 'gallop'; // Maj, 🏃 ou joystick au bord : le grand galop
      const ok = allowedGait(g, mount.data);
      if (ok.reason) {
        // Trop fatigué : il le dit une fois (et le bouton choisi redescend).
        if (this.tiredSaid !== ok.reason) this.onGait?.(ok.gait, ok.reason);
        this.tiredSaid = ok.reason;
        const order = ['halt', 'walk', 'trot', 'canter'];
        if (order.indexOf(this.gait) > order.indexOf(ok.gait)) this.gait = ok.gait;
        g = ok.gait;
      } else this.tiredSaid = null;
      this.gaitNow = g;
      max = rideSpeed(g, {
        scale: mount.scale,
        speedSkill: mount.data.skills.speed,
        tack: tackEffects(mount.data).speed,
        bareback: this.bareback || !mount.data.gear?.saddle,
      });
      if (this.spook) max *= 0.6; // (l'écart : il se reprend)
      if (this.grazing) {
        // Il broute : il ne bouge plus. Pousser le joystick un moment (raccourcir les rênes) le fait repartir.
        max = 0;
        this.grazing.pull = amount > 0.5 ? this.grazing.pull + dt : 0;
        if (this.grazing.pull > 0.6) this.stopGrazing();
      }
    } else if (mount) {
      const skill = 1 + mount.data.skills.speed / 150;
      // À cru : un peu moins vite ; la selle de course fait aller plus vite (src/sim/gear.js).
      max = (run ? 11 : 4.5) * skill * Math.min(1.2, mount.scale + 0.2) * (this.bareback || !mount.data.gear?.saddle ? 0.8 : tackEffects(mount.data).speed);
      if (mount.data.needs.energy < 10) max = 2;
    }
    const target = amount > 0.05 ? max * Math.min(1, amount) : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * (!mount ? 8 : freeRide ? 2.5 * responsiveness(mount.data) : 2.5)); // (⭐ dressage : plus à l'écoute)

    if (amount > 0.05) {
      const want = firstPerson && !mount && !this.auto ? camYaw : Math.atan2(dir.x, dir.z);
      let diff = want - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const turn = mount ? 3 : 10;
      this.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * turn);
      if (!this.auto?.slow) this.faceTo = null;
    } else if (this.faceTo && !mount) {
      // Pendant un geste de soin : on se tourne vers l'animal (vers sa bouche pour une friandise).
      const f = this.faceUdder && this.faceTo.model?.udderPoint ? this.faceTo.model.udderPoint.getWorldPosition(_head)
        : this.faceHead && this.faceTo.model?.head ? mouthOf(this.faceTo, _head) : this.faceTo.position;
      const p0 = this.root.position;
      let diff = Math.atan2(f.x - p0.x, f.z - p0.z) - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 6);
      if (!avatarBusy(this.avatar) && !this.auto) this.faceTo = null;
    }

    const p = this.root.position;
    if (freeRide) this.rideStep(dt, mount, p);
    if (this.speed > 0.01) {
      const moveDir = firstPerson && !mount && !this.auto && amount > 0.05 ? dir.normalize() : new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
      const nx = p.x + moveDir.x * this.speed * dt;
      const nz = p.z + moveDir.z * this.speed * dt;
      if (!this.world.isWater(nx, nz)) {
        p.x = nx;
        p.z = nz;
      } else {
        this.speed = 0;
      }
      this.world.resolveCollisions(p, mount ? 0.9 : 0.35, { mounted: !!mount });
    }
    // Un chien pas encore dressé tire sur la laisse.
    if (this.pull && !mount) {
      p.x += this.pull.x * dt * 1.4;
      p.z += this.pull.z * dt * 1.4;
      this.world.resolveCollisions(p, 0.35);
    }
    p.y = this.world.heightAt(p.x, p.z);
    this.root.rotation.y = this.heading;

    if (mount) {
      mount.position.copy(p);
      mount.heading = this.heading;
      mount.speed = this.speed;
      // Sabots : un bruit à chaque demi-foulée du cheval (phase du cavalier pour un modèle GLB).
      const k = Math.floor((this.ridePh ?? mount.phase) / Math.PI);
      if (k !== this.hoofK) {
        if (this.hoofK !== undefined && this.speed > 0.6) this.onStep?.(this.speed > 6, true);
        this.hoofK = k;
      }
      // La pose du cavalier suit le cheval : voir lateUpdate (après l'animation des animaux).
    } else {
      this.animateWalk(dt);
    }
  }

  /**
   * Balade libre, une image : ce que l'allure coûte au cheval (src/sim/riding.js) et les écarts. Un écart : le cheval
   * fait un bond de côté (un oiseau, un sac qui bouge…), ralentit, puis on repart ; au galop, il repasse au trot.
   */
  rideStep(dt, mount, p) {
    // ⬆️ Trot enlevé (src/sim/posting.js) : en selle, au trot, la série de bons temps (Game.postTrot) ; enlevé, le trot
    // le fatigue deux fois moins. Sans série, on trotte assis.
    const stride = this.stride ?? 0;
    this.canPost = !this.bareback && !!mount.data.gear?.saddle;
    const trotting = this.canPost && this.gaitNow === 'trot' && this.speed > 0.3;
    // (à cru, sans étriers : on trotte assis ; on le dit une fois)
    if (!this.canPost && this.gaitNow === 'trot' && this.speed > 0.3 && !this.sitTrotSaid) {
      this.sitTrotSaid = true;
      this.onGait?.(this.gait, 'sitTrot');
    }
    postTick(this.posting, stride, trotting);
    this.postingNow = trotting && isPosting(this.posting, stride);
    // 🐢 La détente : quelques tours au pas avant de trotter (et le retour au calme, compté pour la descente)
    this.session = this.session ?? newSession();
    const c0 = this.session.cool;
    const warmNews = sessionTick(this.session, this.speed > 0.3 ? this.gaitNow : 'halt', dt);
    if (warmNews) this.onGait?.(this.gait, warmNews);
    if (coolJustDone(this.session, c0)) this.openPraise('cool'); // (🤚 bravo, il a repris son souffle)
    rideEffort(mount.data, this.speed > 0.3 ? this.gaitNow : 'halt', dt, this.postingNow ? POST.save : 1, effortFactor(this.session)); // (immobile : il souffle)
    // Le cheval gourmand : au pas sur l'herbe, il finit par s'arrêter pour brouter (src/sim/riding.js nextGrazeIn).
    if (this.grazing) {
      const n = mount.data.needs;
      n.hunger = Math.min(100, n.hunger + 0.4 * dt); // (quelques bouchées)
    } else if ((this.gaitNow === 'walk' || this.gaitNow === 'halt') && !this.spook && this.onGrass?.()) {
      this.grazeIn = (this.grazeIn ?? nextGrazeIn(mount.data)) - dt;
      if (this.grazeIn <= 0) {
        this.grazeIn = null;
        this.grazing = { pull: 0 };
        mount.rideGraze = true;
        this.onGait?.(this.gait, 'graze');
      }
    }
    // Vraiment au galop (plus vite que le trot) pendant 3 s : le chapitre « au trot, puis au galop ».
    if ((this.gaitNow === 'canter' || this.gaitNow === 'gallop') && this.speed > 3.6 * (mount.scale ?? 1)) {
      this.canterFor = (this.canterFor ?? 0) + dt;
      if (this.canterFor >= 3 && !this.cantered) {
        this.cantered = true;
        this.onCanter?.();
      }
    } else this.canterFor = 0;
    if (SPOOKY.has(this.gaitNow) && this.speed > 2 && !this.spook) {
      this.spookIn = (this.spookIn ?? nextSpookIn(mount.data, Math.random, this.riderLevel ?? 0) * spookFactor(mount.data)) - dt;
      if (this.spookIn <= 0) {
        this.spookIn = null;
        this.spook = { t: 0.9, side: Math.random() < 0.5 ? -1 : 1 };
        if (this.gait === 'canter') this.gait = 'trot';
        this.onGait?.(this.gait, 'spook');
      }
    }
    if (this.spook) {
      const s = this.spook;
      s.t -= dt;
      const k = s.t > 0.55 ? 1 : 0.25;
      // Un pas de côté brusque et la tête qui part : le cavalier est secoué, puis tout se calme.
      p.x += Math.cos(this.heading) * s.side * dt * 2.6 * k;
      p.z -= Math.sin(this.heading) * s.side * dt * 2.6 * k;
      this.heading += s.side * dt * 1.4 * k;
      if (s.t <= 0) {
        this.spook = null;
        this.openPraise('spook'); // (🤚 rassure-le)
      }
    }
  }

  /** 🤚 Le bouton « Bravo ! » / « Rassure-le » apparaît quelques secondes (src/sim/praise.js). */
  openPraise(why) {
    if (!this.mount) return;
    this.praise = this.praise ?? newPraise();
    openPraise(this.praise, why, this.mount.time);
  }

  /** 🤚 Touché (Game.praiseHorse) : rassuré après un écart, le prochain vient plus tard. */
  praised(why) {
    if (why !== 'spook' || !this.mount) return;
    const a = this.mount.data;
    this.spookIn = (this.spookIn ?? nextSpookIn(a, Math.random, this.riderLevel ?? 0) * spookFactor(a)) * PRAISE.calm;
  }

  /** Choisir l'allure (boutons, touches) : 'halt', 'walk', 'trot', 'canter'. Il broutait : on raccourcit les rênes. */
  setGait(g) {
    if (!this.mount) return;
    this.gait = g;
    this.tiredSaid = null;
    if (this.grazing && g !== 'halt') this.stopGrazing();
  }

  /** Rênes raccourcies : il relève la tête et repart (le prochain arrêt gourmand viendra plus tard). */
  stopGrazing() {
    if (this.mount) this.mount.rideGraze = false;
    this.grazing = null;
    this.grazeIn = null;
  }

  /**
   * Après l'animation des animaux (Game) : le cavalier suit le dos du cheval qu'on vient d'animer
   * (rebond, allure, balancement) ; mains aux rênes, buste qui suit le pas, le trot (enlevé avec
   * une selle, assis sans) et le galop.
   */
  lateUpdate(dt) {
    const m = this.mount;
    if (!m || !this.ride0) return;
    // Cheval réaliste incliné sur une pente (horseReal.js, groundTilt) : le cavalier prend le même tangage, le même
    // roulis et la même hauteur que lui (son siège est mesuré dans le repère du cheval).
    const mr = m.root;
    if (mr && (mr.rotation.x || mr.rotation.z || this.root.rotation.x || this.root.rotation.z)) {
      this.root.rotation.order = mr.rotation.order;
      this.root.rotation.x = mr.rotation.x;
      this.root.rotation.z = mr.rotation.z;
      this.root.position.y = mr.position.y;
    }
    const a = this.avatar;
    const md = m.model;
    const sc = Math.max(0.3, m.scale);
    const v = this.speed / sc;
    const sp = m.sp ?? { walkSpeed: 1.6, runSpeed: 5 };
    // Allure : celle du cheval procédural ; pour un GLB, celle du clip qu'il joue (pas ou galop :
    // il n'a pas de clip de trot, donc pas de trot enlevé sur un cheval qui marche).
    let want;
    if (md.gltf) want = this.speed > 0.05 ? clipGait(this.speed, sp.runSpeed) : 0;
    else want = m.gait === undefined ? gaitFromSpeed(v, sp.walkSpeed, sp.runSpeed) : m.gait;
    this.rideGait += (want - this.rideGait) * Math.min(1, dt * 4);
    let phase;
    if (m.gait !== undefined && !md.gltf) phase = m.phase;
    else {
      const w = gaitWeights(this.rideGait, _gw);
      const legLen = (m.data.look.legLen ?? 0.9) * (m.data.look.legs ?? 1);
      const stride = Math.max(0.3, legLen * (1.7 * w.walk + 2.5 * w.trot + 3.7 * w.gallop));
      if (v > 0.05) this.ridePhase += dt * (v / stride) * Math.PI * 2;
      phase = this.ridePhase;
    }
    this.ridePh = phase;
    // Les foulées comptées sans retour à zéro (la phase du cheval réaliste repart de 0 à chaque foulée) : le rythme
    // du trot enlevé (src/sim/posting.js) ; stride = foulées entières + fraction.
    const ph = ((phase % TAU) + TAU) % TAU;
    if (this.stridePh !== undefined && ph < this.stridePh - Math.PI) this.strideK = (this.strideK ?? 0) + 1;
    this.stridePh = ph;
    this.stride = (this.strideK ?? 0) + ph / TAU;
    // Rebond du dos : la position de l'os du corps (GLB) ou du corps procédural. Cheval réaliste : le bassin
    // suit le siège de la selle (posée sur le tronc) à chaque image.
    let bob = 0;
    if (this.fit) {
      seatOnSaddle(this.fit, _seat);
      this.ride0.seatY = _seat.y;
      this.ride0.seatZ = _seat.z;
    } else if (md.gltf && md.body) {
      md.body.getWorldPosition(_v);
      m.root.worldToLocal(_v);
      if (this.rideRest === undefined) this.rideRest = _v.y;
      this.rideRest += (_v.y - this.rideRest) * Math.min(1, dt * 0.8);
      bob = clamp(_v.y - this.rideRest, -0.08, 0.08);
    } else if (md.body) bob = md.body.position.y * sc;
    const st = this.ride0;
    st.gait = this.rideGait;
    st.phase = phase;
    // (en balade libre, on se lève au trot seulement en trottant enlevé — le bouton ⬆️ en rythme ; sinon assis ; en
    // voyage à cheval, postAuto : le cavalier trotte enlevé tout seul, comme avant)
    if (this.canPost !== undefined) st.posting = this.canPost && (this.gaitEnabled === false || this.auto || this.postAuto ? true : !!this.postingNow);
    st.bob = bob;
    // (saut d'obstacle : position en suspension, réglée par la séance, src/game/Activities.js)
    st.jump = this.jumpPose ?? 0;
    animateAvatarRide(a, st);
    this.updateReins(m);
    const o = this.lifeOpts;
    o.riding = true;
    o.carry = false;
    o.speed = this.speed;
    updateAvatarLife(a, dt, o);
  }

  animateWalk(dt) {
    this.phase += dt * this.speed * 2.2;
    animateAvatarWalk(this.avatar, this.phase, this.speed);
    const o = this.lifeOpts;
    o.riding = false;
    o.carry = !!this.carried;
    o.speed = this.speed;
    updateAvatarLife(this.avatar, dt, o);
    this.placeCrate();
    // Un pied se pose à chaque demi-tour de la marche : bruit de pas (onStep est branché par Game).
    const k = Math.floor(this.phase / Math.PI);
    if (k !== this.stepK) {
      if (this.stepK !== undefined && this.speed > 0.6) this.onStep?.(this.speed > 4.5, false);
      this.stepK = k;
    }
  }
}

/**
 * Caméra à cheval (3e personne), au téléphone en hauteur comme en largeur : de trois quarts arrière, du côté droit du
 * cheval, assez bas, qui vise devant la selle. La tête et l'encolure sortent à droite de la cavalière (de dos ou à
 * gauche, elle les cachait : on ne voyait qu'une oreille) ; la croupe et les postérieurs restent au-dessus du joystick,
 * loin de « Descendre » et des boutons d'allure (à droite de l'écran en hauteur). Le lacet (yaw), qui oriente le
 * joystick, reste derrière le cheval : seule la caméra tourne autour de lui, pour l'image (tourner le lacet faisait
 * tourner le cheval en rond).
 * az : angle (rad) depuis l'arrière du cheval, positif à sa droite (≈ 43°) ; azSmall en plus pour un petit poney
 * (× (1 − taille)) : la jambe de la cavalière cachait sa tête basse ; slack, slackOut : dans un virage, le lacet suit le
 * cheval avec retard, l'angle reste entre az − slack et az + slackOut (vers la caméra, la cavalière recachait la tête) ; pitch :
 * angle de vue (le réglage de la joueuse s'y ajoute) ; distance near + far × taille (nearWide sur un écran en
 * largeur) ; visée ahead × taille devant la selle (vers le garrot), à aimK de la hauteur des sabots au casque (le
 * cheval entier, de la queue au bout du nez, et la cavalière tiennent entre le bandeau du haut et les boutons du bas ;
 * sur un petit poney, la cavalière, qui ne rapetisse pas, compte plus).
 * (Réglages cherchés sur des chevaux mesurés dans le jeu, du Falabella au Percheron, au pas et au galop, et un modèle
 * de la cavalière : tête dégagée d'au moins 12 cm, cheval entier dans la zone libre de l'écran, tête hors du bouton
 * « ⬆️ Debout » du trot enlevé (et « Bravo », « Saute », au même endroit), tête la plus grande possible.)
 * shift : sur un écran en hauteur, la visée glisse à droite de shift × la distance (le cheval glisse à gauche, ≈ 6 % de
 * la largeur) : dans un virage, la tête du Percheron passait sous la colonne des allures (Arrêt, Pas, Trot, Galop).
 */
export const RIDE_CAM = { az: 0.75, azSmall: 1.2, slack: 0.1, slackOut: 0.15, pitch: 0.14, near: 2, nearWide: 1.2, far: 5, ahead: 0.3, aimK: 0.34, shift: 0.035 };
/**
 * Caméra à cheval pendant une séance où l'on dirige son cheval vers des repères (saut d'obstacles, leçon, dressage,
 * balade : rig.course, posé par Game.frame) : il faut voir ce qui arrive devant. La caméra de balade (RIDE_CAM, de
 * trois quarts sur le côté) cachait l'obstacle suivant : il n'apparaissait que sous le cheval, sous « Sauter » et le
 * joystick. Ici (coursePose) elle est derrière le cheval, à back + backK × taille (backWide sur un écran en largeur),
 * décalée à droite de lat × cette distance : la tête sort à droite de la cavalière. Le même angle pour toutes les
 * tailles : plus de côté, un très petit poney sortait de l'écran en hauteur. Elle regarde loin devant (ahead
 * m), à aimK de la hauteur des sabots au casque, presque droit devant (look : 1 = parallèle au cheval, 0 = vers son
 * chemin), d'un peu haut (pitch). Le lacet suit le cheval plus vite (follow, au lieu de 0,8).
 */
export const COURSE_CAM = { back: 3, backWide: 2.2, backK: 4.6, lat: 0.32, ahead: 3, look: 0.2, aimK: 0.5, pitch: 0.28, follow: 1.8 };
/** Haut du casque de la cavalière au-dessus de la selle (m). */
export const RIDER_TOP = 1.05;
/**
 * Vue de la selle (1re personne) à cheval : l'œil de la cavalière assise, eye m au-dessus de la selle (pas debout sur
 * elle : 1,15 m), à sa place (ahead × taille), le regard baissé vers les oreilles (au moins down rad, au plus downMax
 * pour un petit poney) ; sur un écran en hauteur, un champ plus large (fovTall°, comme la vue du cavalier en balade,
 * TrailView) : avec 60°, on ne voyait que la nuque et deux oreilles géantes. On voit les oreilles, le toupet, la
 * crinière et les rênes en bas de l'écran, le chemin au-dessus.
 */
export const RIDE_FP = { eye: 0.85, ahead: -0.1, down: -0.35, downMax: -0.72, fovTall: 80 };
/**
 * Un cheval qui suit la joueuse (« Me suivre ») ou qu'elle mène en main : il marche derrière elle, entre elle et la
 * caméra (on ne voyait que sa tête géante, coupée en bas, ou rien). La caméra se met de côté (az rad, à droite), vise
 * entre eux deux à mi-hauteur (aimY m × sa taille) et recule selon l'écart : near + far × sa taille + sep × l'écart
 * (× tall sur un écran en hauteur : ≈ 30° de large).
 */
export const FOLLOW_CAM = { az: 0.55, aimY: 0.9, near: 2.5, far: 3.3, sep: 0.7, tall: 1.1 };
/** Œil du cavalier au-dessus de la selle (m) : Player.eyeHeight. */
export const RIDER_EYE = 1.15;
// (vecteurs de travail du cadrage, voir CameraRig.focus)
const _pv = new THREE.Vector3();
const _sv = new THREE.Vector3();
const _lv = new THREE.Vector3();
const _rv = new THREE.Vector3();
const _cv = new THREE.Vector3();
const _ca = new THREE.Vector3();
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Place de la caméra d'un plan (rig.focus.shot : { at, heading, dist, yaw, pitch }) : autour de at, à dist m, à yaw rad
 * du devant (heading), pitch rad au-dessus ; jamais sous le sol + 0,3 m. Utilisé aussi pour une photo prise avant que
 * la caméra y soit arrivée (CompetitionVenue.takePhoto).
 */
export function shotPose(s, out, heightAt = () => 0) {
  const a = s.heading + (s.yaw ?? 0.7);
  const pt = s.pitch ?? 0.22;
  out.set(s.at.x + Math.sin(a) * Math.cos(pt) * s.dist, s.at.y + Math.sin(pt) * s.dist, s.at.z + Math.cos(a) * Math.cos(pt) * s.dist);
  const g2 = heightAt(out.x, out.z) + 0.3;
  if (out.y < g2) out.y = g2;
  return out;
}

/** Hauteur de la selle (m au-dessus des sabots) du cheval monté. */
function seatOf(player) {
  const eye = player.eyeHeight;
  return Number.isFinite(eye) ? Math.max(0.3, eye - RIDER_EYE) : 1.5 * (player.mount?.scale ?? 1);
}

/** Angle (rad) du regard depuis la selle, en 1re personne : vers les oreilles du cheval de taille sc. */
export function rideLookDown(sc) {
  const s = Math.max(0.3, sc);
  // (oreilles : ≈ 0,45 m × taille au-dessus de la selle, 1,3 m × taille devant ; l'œil à RIDE_FP.eye, ahead devant)
  const ears = Math.atan2(0.45 * s - RIDE_FP.eye, Math.max(0.3, 1.3 - RIDE_FP.ahead) * s);
  return THREE.MathUtils.clamp(ears, RIDE_FP.downMax, RIDE_FP.down);
}

/** Azimut voulu de la caméra montée (rad, depuis l'arrière, positif à droite du cheval) pour un cheval de taille sc. */
export function rideAzimuth(sc) {
  return RIDE_CAM.az + RIDE_CAM.azSmall * THREE.MathUtils.clamp(1 - sc, 0, 0.6);
}

/** Distance de la caméra montée (m) pour un cheval de taille sc, selon la forme de l'écran. */
export function rideDistance(sc, aspect) {
  return (aspect < 0.8 ? RIDE_CAM.near : RIDE_CAM.nearWide) + RIDE_CAM.far * sc;
}

/**
 * Place de la caméra montée pendant une séance (COURSE_CAM) : derrière le cheval (p : sa place, yaw : le lacet, qui suit
 * son cap), un peu à droite ; out : position, aim : point visé. seat : hauteur de la selle (m), aspect : largeur / hauteur.
 */
export function coursePose(p, yaw, sc, seat, aspect, out, aim) {
  const C = COURSE_CAM;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  // (à droite du cavalier : −cos, +sin)
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  const B = (aspect < 0.8 ? C.back : C.backWide) + C.backK * sc;
  const L = C.lat * B;
  const y = p.y + C.aimK * (seat + RIDER_TOP);
  aim.set(p.x + fx * C.ahead + rx * L * C.look, y, p.z + fz * C.ahead + rz * L * C.look);
  out.set(p.x - fx * B + rx * L, y + (B + C.ahead) * Math.tan(C.pitch), p.z - fz * B + rz * L);
  return out;
}

/**
 * 📸 Photo souvenir à cheval (Game.memoryPhoto) : la caméra posée de trois quarts avant du cheval monté (≈ 43° depuis
 * le devant, un peu au-dessus), du côté éclairé par le soleil si on le connaît, assez loin pour que le cheval et sa
 * cavalière tiennent dans la bande gardée (band : sa hauteur / celle de l'écran) avec un champ vertical de ≈ 30° dans
 * cette bande. Pas dans un bâtiment, et sans décor devant eux (occluders : grands objets du lieu, une barrière le long
 * de laquelle on passe cachait le poney) : l'autre côté, un autre angle, un peu plus haut. Ne touche pas au CameraRig :
 * remettre la caméra avec restorePhotoCamera. Renvoie l'état d'avant (ou null : pas de cheval monté).
 */
export function placeRidePhotoCamera(cam, player, world = null, { band = 1, sun = null, occluders = null } = {}) {
  const m = player.mount;
  if (!m) return null;
  const saved = { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov };
  const sc = m.scale ?? 1;
  const p = player.position ?? m.position;
  const h = player.heading ?? m.heading ?? 0;
  const seat = seatOf(player);
  // (le sujet : des sabots au casque, de la queue au bout du nez ; visée un peu devant la selle, à mi-hauteur)
  const H = seat + RIDER_TOP + 0.05;
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  const aim = new THREE.Vector3(p.x + fx * 0.25 * sc, p.y + H * 0.52, p.z + fz * 0.25 * sc);
  const vb = THREE.MathUtils.degToRad(30);
  cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(vb / 2) / Math.max(0.2, Math.min(1, band))));
  cam.updateProjectionMatrix();
  const dist = Math.max(H / 0.74 / (2 * Math.tan(vb / 2)), 3.2 * sc + 1.2);
  // côté gauche (+) ou droit (−) du cheval : celui que le soleil éclaire d'abord
  let first = 1;
  if (sun) first = fz * sun.x - fx * sun.z >= 0 ? 1 : -1;
  const at = (side, yaw, pitch) => {
    const a = h + side * yaw;
    return new THREE.Vector3(aim.x + Math.sin(a) * Math.cos(pitch) * dist, aim.y + Math.sin(pitch) * dist, aim.z + Math.cos(a) * Math.cos(pitch) * dist);
  };
  const inside = (q) => {
    if (!world?.insideBuilding) return false;
    for (let i = 1; i <= 8; i++) {
      const u = i / 8;
      if (world.insideBuilding(aim.x + (q.x - aim.x) * u, aim.y + (q.y - aim.y) * u, aim.z + (q.z - aim.z) * u)) return true;
    }
    return false;
  };
  // (ce que la photo doit montrer : la tête du cheval, la cavalière, le corps et les jambes du cheval)
  const subject = [
    new THREE.Vector3(p.x + fx * 1.35 * sc, p.y + seat + 0.35 * sc, p.z + fz * 1.35 * sc),
    new THREE.Vector3(p.x, p.y + seat + 0.6, p.z),
    new THREE.Vector3(p.x, p.y + seat * 0.75, p.z),
    new THREE.Vector3(p.x + fx * 0.5 * sc, p.y + seat * 0.35, p.z + fz * 0.5 * sc),
  ];
  const hidden = (q) => {
    if (!occluders?.length) return 0;
    _photoRay ??= new THREE.Raycaster();
    let n = 0;
    for (const t of subject) {
      _rv.subVectors(q, t);
      const L = _rv.length();
      _photoRay.set(t, _rv.normalize());
      _photoRay.far = L;
      if (_photoRay.intersectObjects(occluders, false).some((x) => x.object.visible !== false)) n++;
    }
    return n;
  };
  let pos = null;
  let best = Infinity;
  for (const [yaw, pitch] of [[0.75, 0.1], [0.5, 0.1], [1.05, 0.1], [0.75, 0.32]]) {
    for (const side of [first, -first]) {
      const q = at(side, yaw, pitch);
      if (inside(q)) continue;
      const n = hidden(q);
      if (n < best) {
        best = n;
        pos = q;
      }
      if (n === 0) break;
    }
    if (best === 0) break;
  }
  if (!pos) pos = at(first, 0.75, 0.1);
  const ground = (world?.heightAt?.(pos.x, pos.z) ?? p.y) + 0.5;
  if (pos.y < ground) pos.y = ground;
  cam.position.copy(pos);
  cam.lookAt(aim);
  cam.updateMatrixWorld(true);
  return saved;
}
let _photoRay = null;

/** Remet la caméra comme avant placeRidePhotoCamera. */
export function restorePhotoCamera(cam, saved) {
  if (!saved) return;
  cam.position.copy(saved.pos);
  cam.quaternion.copy(saved.quat);
  cam.fov = saved.fov;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;
    this.pitch = 0.35;
    this.fpPitch = 0;
    this.dist = 7;
    this.mode = 'third';
    this.pos = new THREE.Vector3();
  }

  update(dt, ctrl, player, world) {
    const { look, zoom, keyLook = { x: 0, y: 0 } } = ctrl;
    const touch = matchMedia('(pointer: coarse)').matches;
    this.yaw -= look.dx * (touch ? 0.009 : 0.006);
    this.yaw -= keyLook.x * dt * 2.2;
    look.dy += keyLook.y * dt * 300;
    // Quand on marche sans toucher la vue, la caméra revient doucement derrière le personnage.
    this.idleLook = look.dx || look.dy || keyLook.x || keyLook.y ? 0 : (this.idleLook ?? 0) + dt;
    // À cheval (3e personne) : la caméra de trois quarts arrière (RIDE_CAM), lissée (ride : 0 → 1).
    const mount = player.mount;
    const sc = mount?.scale ?? 1;
    const riding = mount && this.mode === 'third' ? 1 : 0;
    this.ride = (this.ride ?? 0) + (riding - (this.ride ?? 0)) * Math.min(1, dt * 2);
    // (séance à cheval vers des repères : COURSE_CAM, en fondu ; rig.course, remis à zéro après usage)
    const course = riding && this.course ? 1 : 0;
    this.course = false;
    this.courseK = (this.courseK ?? 0) + (course - (this.courseK ?? 0)) * Math.min(1, dt * 2);
    const ck = this.courseK;
    if (this.mode === 'third' && player.speed > 1 && this.idleLook > 1.5 && !player.auto) {
      let diff = player.heading - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      // (séance à cheval : le lacet suit le cheval plus vite — COURSE_CAM.follow — dans un virage vers un obstacle,
      // on le voyait de côté, l'obstacle hors de l'écran)
      this.yaw += diff * Math.min(1, dt * (0.8 + (COURSE_CAM.follow - 0.8) * (this.courseK ?? 0)));
    }
    if (this.mode === 'third') {
      this.pitch = THREE.MathUtils.clamp(this.pitch + look.dy * 0.004, 0.02, 1.25);
      this.dist = THREE.MathUtils.clamp(this.dist + zoom, 2.5, 18);
    } else {
      this.fpPitch = THREE.MathUtils.clamp(this.fpPitch - look.dy * 0.004, -1.2, 1.2);
    }

    const p = player.position;
    const eye = new THREE.Vector3(p.x, p.y + player.eyeHeight, p.z);
    const cam = this.camera;
    // Champ de vision : 60°, sauf dans la vue de la selle sur un écran en hauteur (RIDE_FP.fovTall).
    const fov = this.mode === 'first' && mount && cam.aspect < 0.8 ? RIDE_FP.fovTall : 60;
    if (cam.fov !== fov && (this.fovSet || fov !== 60)) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
      this.fovSet = fov !== 60;
    }
    if (this.mode === 'first') {
      player.avatar.root.visible = false;
      if (mount) {
        // Vue de la selle : l'œil de la cavalière assise (RIDE_FP), le regard baissé vers les oreilles (réglable).
        const y = p.y + seatOf(player) + RIDE_FP.eye;
        cam.position.set(p.x + Math.sin(player.heading) * RIDE_FP.ahead * sc, y, p.z + Math.cos(player.heading) * RIDE_FP.ahead * sc);
      } else {
        cam.position.copy(eye).add(_rv.set(Math.sin(player.heading), 0, Math.cos(player.heading)).multiplyScalar(0.12));
      }
      const fp = THREE.MathUtils.clamp(this.fpPitch + (mount ? rideLookDown(sc) : 0), -1.35, 1.2);
      const dir = _rv.set(Math.sin(this.yaw) * Math.cos(fp), Math.sin(fp), Math.cos(this.yaw) * Math.cos(fp));
      cam.lookAt(_lv.copy(cam.position).add(dir));
      return;
    }
    player.avatar.root.visible = true;
    const target = eye.clone().add(new THREE.Vector3(0, -0.2, 0));
    const ride = this.ride ?? 0;
    if (ride > 0.001) {
      // (visée : à hauteur de selle, devant elle — vers l'encolure)
      const ahead = RIDE_CAM.ahead * sc;
      _rv.set(p.x + Math.sin(player.heading) * ahead, p.y + RIDE_CAM.aimK * (seatOf(player) + RIDER_TOP), p.z + Math.cos(player.heading) * ahead);
      target.lerp(_rv, ride);
    }
    // Azimut de la caméra autour de la cible : derrière (le lacet) ; à cheval, de trois quarts à droite du cheval,
    // gardé près de cet angle par rapport au cheval quand on ne touche pas à la vue (dans un virage, le lacet suit
    // le cheval avec retard).
    // (cheval qui suit ou mené en main : rig.focus.pair avec side, posé par Game.frame — lu ici, consommé plus bas)
    const follow = !mount && this.mode === 'third' && this.focus?.pair && this.focus.side ? this.focus : null;
    if (follow) {
      // (du côté où il n'est pas : à côté d'elle à droite, il passait entre elle et la caméra ; on ne change de côté que
      // s'il est franchement de l'autre, à 40 cm au moins)
      const lat = (follow.pair.x - p.x) * Math.cos(this.yaw) - (follow.pair.z - p.z) * Math.sin(this.yaw);
      if (Math.abs(lat) > 0.4) this.followSide = lat > 0 ? 1 : -1;
    }
    const azWant = mount && this.mode === 'third' ? rideAzimuth(sc) : follow ? FOLLOW_CAM.az * (this.followSide ?? 1) : 0;
    this.azOff = (this.azOff ?? 0) + (azWant - (this.azOff ?? 0)) * Math.min(1, dt * (follow ? 1.5 : 3));
    let off = this.azOff;
    if (mount && azWant && this.idleLook > 1.5) {
      // (pas lissé : le cheval tourne vite, jusqu'à 3 rad/s ; la position de la caméra, elle, est lissée plus bas)
      const lag = wrapAngle(this.yaw - player.heading);
      const rel = lag + off;
      if (rel < azWant - RIDE_CAM.slack) off = azWant - RIDE_CAM.slack - lag;
      else if (rel > azWant + RIDE_CAM.slackOut) off = azWant + RIDE_CAM.slackOut - lag;
    }
    // (à cheval, l'angle vient avec ride ; à pied, il s'éteint de lui-même avec azOff)
    let camYaw = this.yaw + (mount ? off * ride : off);
    // Angle de vue et distance : ceux de la joueuse à pied ; à cheval, ceux de RIDE_CAM (le réglage de la joueuse,
    // pincer et glisser, s'y ajoute).
    const ridePitch = THREE.MathUtils.clamp(RIDE_CAM.pitch + this.pitch - 0.35, 0.02, 1.1);
    const basePitch = this.pitch + (ridePitch - this.pitch) * ride;
    const rideDist = rideDistance(sc, this.camera.aspect) + (this.dist - 7) * 0.6;
    // Si un mur se trouve entre la caméra et le joueur, la caméra monte pour regarder
    // par-dessus (au lieu de se coller au mur) ; en dernier recours, elle se rapproche.
    let dist = this.dist + (Math.max(1.5, rideDist) - this.dist) * ride;
    // Animal mené à cadrer avec le joueur (concours de beauté : rig.frameWith) : on vise entre eux deux, un peu
    // plus loin, plus encore sur un écran en hauteur (avant, le cheval était coupé au bord de l'écran).
    const w = this.frameWith;
    this.frameAmt = (this.frameAmt ?? 0) + ((w ? 1 : 0) - (this.frameAmt ?? 0)) * Math.min(1, dt * 3);
    if (w) this.framePos = (this.framePos ?? new THREE.Vector3()).set(w.position.x, w.position.y + 0.9 * (w.scale ?? 1), w.position.z);
    if (this.frameAmt > 0.001 && this.framePos) {
      const k = this.frameAmt * 0.5;
      const q = this.framePos;
      const gap = Math.hypot(q.x - target.x, q.z - target.z);
      target.x += (q.x - target.x) * k;
      target.z += (q.z - target.z) * k;
      target.y += (Math.min(target.y, q.y) - target.y) * this.frameAmt;
      dist += this.frameAmt * (gap * 0.8 + (this.camera.aspect < 0.8 ? 1.6 : 0.4));
    }
    const blocked = (pitch, d, yaw = camYaw) => {
      const b = _sv.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      for (let i = 1; i <= 12; i++) {
        const q = _pv.copy(target).addScaledVector(b, (d * i) / 12);
        if (world.insideBuilding(q.x, q.y, q.z)) return true;
      }
      return false;
    };
    // À cheval le long d'un mur (écurie, maison) : la caméra revient vers l'arrière du cheval jusqu'à ne plus entrer
    // dans le bâtiment (avant de monter ou de se rapprocher) ; lissé.
    let sideF = 1;
    if ((ride > 0.001 || !mount) && Math.abs(off) > 0.01) {
      for (let i = 8; i >= 0; i--) {
        sideF = i / 8;
        if (!blocked(basePitch, dist, this.yaw + (mount ? off * ride : off) * sideF)) break;
      }
    }
    this.sideF = (this.sideF ?? sideF) + (sideF - (this.sideF ?? sideF)) * Math.min(1, dt * 6);
    camYaw = this.yaw + (mount ? off * ride : off) * Math.min(sideF, this.sideF);
    if (blocked(basePitch, dist)) {
      let pitch = basePitch;
      while (pitch < 1.35 && blocked(pitch, dist)) pitch += 0.1;
      if (!blocked(pitch, dist)) {
        this.autoPitch = pitch;
      } else {
        this.autoPitch = basePitch;
        for (let i = 12; i >= 1; i--) {
          if (!blocked(basePitch, (dist * i) / 12)) {
            dist = Math.max(2.2, (dist * i) / 12);
            break;
          }
        }
      }
    } else {
      this.autoPitch = basePitch;
    }
    this.curPitch = (this.curPitch ?? basePitch) + (this.autoPitch - (this.curPitch ?? basePitch)) * Math.min(1, dt * 4);
    const back = new THREE.Vector3(-Math.sin(camYaw) * Math.cos(this.curPitch), Math.sin(this.curPitch), -Math.cos(camYaw) * Math.cos(this.curPitch));
    // Cadrage demandé pour cette image (this.focus, remis à zéro après usage) : « pair » — la joueuse et son chien en
    // laisse ensemble (viser entre les deux, reculer selon l'écart) ; « shot » — plan rapproché sur un animal (tour du
    // spectacle, photo du podium : de trois quarts ou de face, à quelques mètres), en fondu à l'aller et au retour.
    const f = this.focus;
    this.focus = null;
    this.pairK = (this.pairK ?? 0) + ((f?.pair ? 1 : 0) - (this.pairK ?? 0)) * Math.min(1, dt * 2.5);
    if (f?.pair) (this.pairAt ??= new THREE.Vector3()).copy(f.pair);
    this.pairSide = (this.pairSide ?? 0) + ((f?.pair && f.side ? 1 : 0) - (this.pairSide ?? 0)) * Math.min(1, dt * 2.5);
    if (f?.pair) this.pairScale = f.scale ?? 1;
    if (this.pairK > 0.001 && this.pairAt) {
      const sep = Math.hypot(this.pairAt.x - target.x, this.pairAt.z - target.z);
      // (chien en laisse : entre les deux, plus loin ; cheval qui suit : entre les deux, à mi-hauteur, de côté)
      const s2 = this.pairSide;
      const ps = this.pairScale ?? 1;
      const y = target.y - 0.25 + (p.y + FOLLOW_CAM.aimY * ps - (target.y - 0.25)) * s2;
      target.lerp(_pv.set(this.pairAt.x, y, this.pairAt.z), (0.45 + 0.05 * s2) * this.pairK);
      target.y += (y - target.y) * s2 * this.pairK;
      const far = (FOLLOW_CAM.near + FOLLOW_CAM.far * ps + FOLLOW_CAM.sep * Math.min(5, sep)) * (this.camera.aspect < 0.8 ? FOLLOW_CAM.tall : 1);
      dist += (Math.min(2.4, sep * 0.9) * (1 - s2) + (far - dist) * s2) * this.pairK;
    }
    if (mount && ride > 0.001 && cam.aspect < 0.8) {
      // (à droite de l'écran : la colonne des allures ; le cheval glisse un peu à gauche — RIDE_CAM.shift)
      const k = RIDE_CAM.shift * dist * ride * (1 - ck);
      target.x -= Math.cos(camYaw) * k;
      target.z += Math.sin(camYaw) * k;
    }
    const want = target.clone().addScaledVector(back, dist);
    // Décor qui coupe la vue (concours de beauté : arche d'arrivée, panneau du terrain, cabane du jury, barrières —
    // rig.occluders, posé par Beauty.js) : la caméra se place devant lui au lieu de reculer derrière (avant, l'arche
    // et ses lettres géantes, puis un panneau, cachaient l'enfant et son cheval). Les petites pièces (fanions)
    // ne comptent pas.
    if (this.occluders?.length) {
      _ray.subVectors(want, target);
      const L = _ray.length();
      if (L > 0.5) {
        this.raycaster ??= new THREE.Raycaster();
        this.raycaster.set(target, _ray.normalize());
        this.raycaster.far = L;
        const hit = this.raycaster.intersectObjects(this.occluders, true).find((h) => bigVisible(h.object));
        if (hit) want.copy(target).addScaledVector(_ray, Math.max(2.4, hit.distance - 0.4));
      }
    }
    const ground = world.heightAt(want.x, want.z) + 0.4;
    if (want.y < ground) want.y = ground;
    this.shotK = (this.shotK ?? 0) + ((f?.shot ? 1 : 0) - (this.shotK ?? 0)) * Math.min(1, dt * 2.5);
    if (f?.shot) this.shot = f.shot;
    let aim = target;
    if (ck > 0.001) {
      // (séance : derrière le cheval, un peu à droite, le regard loin devant — coursePose)
      coursePose(p, this.yaw, sc, seatOf(player), cam.aspect, _cv, _ca);
      const g2 = world.heightAt(_cv.x, _cv.z) + 0.4;
      if (_cv.y < g2) _cv.y = g2;
      want.lerp(_cv, ck);
      aim = _lv.copy(target).lerp(_ca, ck);
    }
    if (this.shotK > 0.001 && this.shot) {
      const s = this.shot;
      // (de face : yaw 0 ; trois quarts : ± 0,7 rad depuis le devant de l'animal)
      const shotPos = shotPose(s, _sv, (x, z) => world.heightAt(x, z));
      want.lerp(shotPos, this.shotK);
      aim = _lv.copy(aim).lerp(s.at, this.shotK);
    }
    this.pos.lerp(want, this.pos.lengthSq() === 0 ? 1 : Math.min(1, dt * 10));
    cam.position.copy(this.pos);
    cam.lookAt(aim);
  }

  /** Après un voyage : la caméra se replace sans glisser à travers la carte. */
  reset() {
    this.pos.set(0, 0, 0);
  }
}
