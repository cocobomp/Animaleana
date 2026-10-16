// Le joueur : son avatar, ses déplacements à pied ou à cheval, et la caméra.

import * as THREE from 'three';
import { buildAvatar, animateAvatarWalk, poseAvatar } from './models/avatarModel.js';
import { disposeModel } from './models/animalModel.js';
import { navTarget } from './nav.js';
import { tackEffects } from '../sim/gear.js';

const WALK = 3.2;
const RUN = 6.2;

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
    this.setAvatar(look);
    this.torch = new THREE.PointLight(0xffd9a0, 0, 14, 1.6);
    this.torch.position.set(0, 2.2, 0.4);
    this.root.add(this.torch);
  }

  setAvatar(look) {
    if (this.avatar) {
      this.root.remove(this.avatar.root);
      disposeModel(this.avatar.root);
    }
    this.avatar = buildAvatar(look);
    this.root.add(this.avatar.root);
    if (this.mount) this.seat();
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

  seat() {
    const a = this.avatar;
    const e = this.mount;
    a.root.position.set(0, e.model.saddleY * e.scale - 0.78, -e.data.look.bodyLen * e.scale * 0.05);
    poseAvatar(a, 'ride');
  }

  dismount() {
    const e = this.mount;
    if (!e) return null;
    e.ridden = false;
    e.speed = 0;
    this.mount = null;
    const a = this.avatar;
    a.root.position.set(0, 0, 0);
    poseAvatar(a, 'stand');
    // On descend à côté du cheval.
    const side = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading)).multiplyScalar(1.4);
    this.root.position.add(side);
    this.world.resolveCollisions(this.root.position);
    this.root.position.y = this.world.heightAt(this.root.position.x, this.root.position.z);
    return e;
  }

  /** Marcher tout seul jusqu'à un point (toucher l'écran). onArrive est appelé à l'arrivée. */
  goTo(point, radius = 0.6, onArrive = null) {
    this.auto = { target: point.clone().setY(0), radius, onArrive, stuck: 0, last: this.root.position.clone() };
  }

  cancelGoTo() {
    this.auto = null;
  }

  update(dt, ctrl, camYaw, firstPerson) {
    let { run } = ctrl;
    const { move } = ctrl;
    const f = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const r = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw));
    let dir = f.multiplyScalar(move.y).add(r.multiplyScalar(move.x));
    let amount = dir.length();
    if (amount > 0.05) this.auto = null;
    else if (this.auto) {
      const a = this.auto;
      const pos = this.root.position;
      // On contourne les enclos par leur ouverture.
      const way = navTarget(pos, a.target);
      const to = new THREE.Vector3(way.x - pos.x, 0, way.z - pos.z);
      const d = way === a.target ? to.length() : Math.max(to.length(), a.radius + 0.1);
      // Bloqué contre un mur depuis un moment : on s'arrête là.
      a.stuck = pos.distanceTo(a.last) < dt * 0.5 ? a.stuck + dt : 0;
      a.last.copy(pos);
      if (d < a.radius || a.stuck > 1.2) {
        const cb = a.onArrive;
        this.auto = null;
        cb?.();
      } else {
        dir = to.normalize();
        amount = 1;
        run = d > 10;
      }
    }
    const mount = this.mount;
    let max = run ? RUN : WALK;
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
      // Sabots : un bruit à chaque demi-foulée du cheval.
      const k = Math.floor(mount.phase / Math.PI);
      if (k !== this.hoofK) {
        if (this.hoofK !== undefined && this.speed > 0.6) this.onStep?.(this.speed > 6, true);
        this.hoofK = k;
      }
      // Petit balancement de l'avatar avec le pas du cheval.
      this.avatar.root.position.y = mount.model.saddleY * mount.scale - 0.78 + mount.model.body.position.y * mount.scale;
      this.avatar.torso.rotation.x = Math.sin(mount.phase * 2) * 0.03 * Math.min(1, this.speed / 4);
    } else {
      this.animateWalk(dt);
    }
  }

  animateWalk(dt) {
    this.phase += dt * this.speed * 2.2;
    animateAvatarWalk(this.avatar, this.phase, this.speed);
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
