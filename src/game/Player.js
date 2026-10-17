// Le joueur : son avatar, ses déplacements à pied ou à cheval, et la caméra.

import * as THREE from 'three';
import {
  buildAvatar, animateAvatarWalk, poseAvatar, updateAvatarLife, startAvatarGesture, careGestureFor,
  animateAvatarRide, avatarBusy, stopAvatarGesture,
} from './models/avatarModel.js';
import { gaitFromSpeed, gaitWeights, gestureHeight, clipGait, stirrupFor } from './models/avatarMotion.js';
import { disposeModel } from './models/animalModel.js';
import { navTarget } from './nav.js';
import { tackEffects } from '../sim/gear.js';
import { helmetModel } from './models/tackModels.js'; // bombe du cavalier

const WALK = 3.2;
const RUN = 6.2;
const CARRY = 2.3; // on marche moins vite avec une caisse dans les bras

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const _v = new THREE.Vector3();
const _head = new THREE.Vector3();
const _gw = {};

/**
 * Bouche d'un animal (repère du monde), un peu sous le bout du nez : le long de la tête pour un
 * modèle procédural ; pour un GLB (repère de la tête aligné sur le corps), en avant et en bas.
 */
function mouthOf(entity, out) {
  const md = entity.model;
  const look = entity.data?.look ?? {};
  const hl = look.headLen ?? 0.3;
  if (md.gltf) out.set(0, -0.5 * hl, 0.82 * hl);
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
    this.torch = new THREE.PointLight(0xffd9a0, 0, 14, 1.6);
    this.torch.position.set(0, 2.2, 0.4);
    this.root.add(this.torch);
  }

  setAvatar(look) {
    if (this.avatar) {
      this.helmet?.parent?.remove(this.helmet); // la bombe passe sur le nouvel avatar
      this.root.remove(this.avatar.root);
      disposeModel(this.avatar.root);
    }
    this.avatar = buildAvatar(look);
    this.root.add(this.avatar.root);
    if (this.helmet) {
      this.avatar.head.add(this.helmet);
    }
    if (this.mount) this.seat();
    if (this.carried) poseAvatar(this.avatar, 'carry', { size: this.carrySize });
  }

  get position() {
    return this.root.position;
  }

  get eyeHeight() {
    return this.mount ? this.mount.model.saddleY * this.mount.scale + 1.15 : 1.5;
  }

  spawn(x, z) {
    this.root.position.set(x, this.world.heightAt(x, z), z);
    this.heading = Math.PI;
  }

  /** Monter à cheval : l'avatar s'assoit sur le dos de l'animal. */
  ride(entity) {
    this.mount = entity;
    entity.ridden = true;
    entity.data.following = false;
    this.root.position.copy(entity.position);
    this.heading = entity.heading;
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
    const R = (md.dims?.R ?? look.bodyR * (look.fluff ?? 1)) * sc;
    const saddle = !this.bareback && !!e.data.gear?.saddle;
    const foot = stirrupFor(R, saddle, {});
    // Garrot : la base de l'encolure, dans le repère du cheval (le joueur est à la même place).
    let reinsY = 1.0;
    let reinsZ = 0.36;
    if (md.neck) {
      e.root.updateMatrixWorld(true);
      md.neck.getWorldPosition(_v);
      e.root.worldToLocal(_v);
      reinsY = clamp(_v.y - seatY + 0.1, 0.95, 1.12);
      reinsZ = clamp(_v.z - seatZ - 0.18, 0.26, 0.4);
    }
    this.ride0 = {
      gait: 0, phase: 0, bob: 0, posting: saddle,
      seatY, seatZ, reinsY, reinsZ, footX: foot.x, footY: foot.y, footZ: foot.z, kneeOut: foot.out,
    };
    this.rideGait = 0;
    this.ridePhase = 0;
    this.rideRest = undefined;
    poseAvatar(a, 'ride', this.ride0);
  }

  /** Bombe du cavalier sur la tête de l'avatar (null : on l'enlève). */
  setHelmet(h) {
    if (this.helmet) {
      this.helmet.parent?.remove(this.helmet);
      this.helmet = null;
    }
    if (!h) return;
    this.helmet = helmetModel(h.item, h.color);
    this.helmet.position.set(0, 0.105, -0.01);
    this.helmet.rotation.x = -0.12;
    this.helmet.scale.setScalar(1.36);
    this.avatar.head.add(this.helmet);
  }

  dismount() {
    const e = this.mount;
    if (!e) return null;
    this.setHelmet(null);
    e.ridden = false;
    e.speed = 0;
    this.mount = null;
    this.ridePh = undefined;
    const a = this.avatar;
    a.root.position.set(0, 0, 0);
    a.root.rotation.x = 0;
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
    this.auto = { target: point.clone().setY(0), radius, onArrive, stuck: 0, last: this.root.position.clone(), slow: !!opts?.slow, budget: opts?.budget ?? Infinity };
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
  careGesture(action, entity) {
    const a = this.avatar;
    if (this.carried) return;
    if (this.mount) {
      // À cheval : une petite tape sur l'encolure.
      if (entity === this.mount && this.ride0) startAvatarGesture(a, 'pat', { local: true, x: -0.07, y: this.ride0.reinsY + 0.03, z: this.ride0.reinsZ + 0.12, duration: 1.2 });
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
    if (kind === 'offer' && entity.model?.head && this.offerToHead(entity, kind)) return;
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
   * Vrai pendant un geste de soin (ou le petit pas qui le précède) : la liste de tâches attend
   * qu'il soit fini avant de partir vers la suivante (TaskQueue.update).
   */
  careBusy() {
    return !!this.auto?.slow || avatarBusy(this.avatar);
  }

  cancelGesture() {
    this.faceTo = null;
    this.faceHead = false;
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
      if (d < a.radius || a.stuck > 1.2 || a.budget <= 0) {
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
    if (mount) {
      const skill = 1 + mount.data.skills.speed / 150;
      // À cru : un peu moins vite ; la selle de course fait aller plus vite (src/sim/gear.js).
      max = (run ? 11 : 4.5) * skill * Math.min(1.2, mount.scale + 0.2) * (this.bareback || !mount.data.gear?.saddle ? 0.8 : tackEffects(mount.data).speed);
      if (mount.data.needs.energy < 10) max = 2;
    }
    const target = amount > 0.05 ? max * Math.min(1, amount) : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * (mount ? 2.5 : 8));

    if (amount > 0.05) {
      const want = firstPerson && !mount && !this.auto ? camYaw : Math.atan2(dir.x, dir.z);
      let diff = want - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const turn = mount ? 3 : 10;
      this.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * turn);
      if (!this.auto?.slow) this.faceTo = null;
    } else if (this.faceTo && !mount) {
      // Pendant un geste de soin : on se tourne vers l'animal (vers sa bouche pour une friandise).
      const f = this.faceHead && this.faceTo.model?.head ? mouthOf(this.faceTo, _head) : this.faceTo.position;
      const p0 = this.root.position;
      let diff = Math.atan2(f.x - p0.x, f.z - p0.z) - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 6);
      if (!avatarBusy(this.avatar) && !this.auto) this.faceTo = null;
    }

    const p = this.root.position;
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
   * Après l'animation des animaux (Game) : le cavalier suit le dos du cheval qu'on vient d'animer
   * (rebond, allure, balancement) ; mains aux rênes, buste qui suit le pas, le trot (enlevé avec
   * une selle, assis sans) et le galop.
   */
  lateUpdate(dt) {
    const m = this.mount;
    if (!m || !this.ride0) return;
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
    // Rebond du dos : la position de l'os du corps (GLB) ou du corps procédural.
    let bob = 0;
    if (md.gltf && md.body) {
      md.body.getWorldPosition(_v);
      m.root.worldToLocal(_v);
      if (this.rideRest === undefined) this.rideRest = _v.y;
      this.rideRest += (_v.y - this.rideRest) * Math.min(1, dt * 0.8);
      bob = clamp(_v.y - this.rideRest, -0.08, 0.08);
    } else if (md.body) bob = md.body.position.y * sc;
    const st = this.ride0;
    st.gait = this.rideGait;
    st.phase = phase;
    st.bob = bob;
    animateAvatarRide(a, st);
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
    if (this.mode === 'third' && player.speed > 1 && this.idleLook > 1.5 && !player.auto) {
      let diff = player.heading - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.yaw += diff * Math.min(1, dt * 0.8);
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
    if (this.mode === 'first') {
      player.avatar.root.visible = false;
      cam.position.copy(eye).add(new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading)).multiplyScalar(player.mount ? 0.3 : 0.12));
      const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.fpPitch), Math.sin(this.fpPitch), Math.cos(this.yaw) * Math.cos(this.fpPitch));
      cam.lookAt(cam.position.clone().add(dir));
      return;
    }
    player.avatar.root.visible = true;
    const target = eye.clone().add(new THREE.Vector3(0, -0.2, 0));
    const back = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    // Si un mur se trouve entre la caméra et le joueur, la caméra monte pour regarder
    // par-dessus (au lieu de se coller au mur) ; en dernier recours, elle se rapproche.
    let dist = this.dist + (player.mount ? 2 : 0);
    const blocked = (pitch, d) => {
      const b = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(this.yaw) * Math.cos(pitch));
      for (let i = 1; i <= 12; i++) {
        const q = target.clone().addScaledVector(b, (d * i) / 12);
        if (world.insideBuilding(q.x, q.y, q.z)) return true;
      }
      return false;
    };
    if (blocked(this.pitch, dist)) {
      let pitch = this.pitch;
      while (pitch < 1.35 && blocked(pitch, dist)) pitch += 0.1;
      if (!blocked(pitch, dist)) {
        this.autoPitch = pitch;
      } else {
        this.autoPitch = this.pitch;
        for (let i = 12; i >= 1; i--) {
          if (!blocked(this.pitch, (dist * i) / 12)) {
            dist = Math.max(2.2, (dist * i) / 12);
            break;
          }
        }
      }
    } else {
      this.autoPitch = this.pitch;
    }
    this.curPitch = (this.curPitch ?? this.pitch) + (this.autoPitch - (this.curPitch ?? this.pitch)) * Math.min(1, dt * 4);
    back.set(-Math.sin(this.yaw) * Math.cos(this.curPitch), Math.sin(this.curPitch), -Math.cos(this.yaw) * Math.cos(this.curPitch));
    const want = target.clone().addScaledVector(back, dist);
    const ground = world.heightAt(want.x, want.z) + 0.4;
    if (want.y < ground) want.y = ground;
    this.pos.lerp(want, this.pos.lengthSq() === 0 ? 1 : Math.min(1, dt * 10));
    cam.position.copy(this.pos);
    cam.lookAt(target);
  }

  /** Après un voyage : la caméra se replace sans glisser à travers la carte. */
  reset() {
    this.pos.set(0, 0, 0);
  }
}
