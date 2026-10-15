// Une aide embauchée (palefrenier, pet-sitter, berger…) qui se déplace et s'occupe des animaux.

import * as THREE from 'three';
import { HELPERS, helperTask } from '../sim/farm.js';
import { buildAvatar } from './models/avatarModel.js';
import { disposeModel } from './models/animalModel.js';

const SKINS = [0xf5d3b8, 0xe8b796, 0xd09a72, 0xa9714b, 0x7a4b2e, 0x5a3a24];
const HAIRS = [0x1b1411, 0x4a2f1d, 0x8a5a2b, 0xd2a557, 0xa63a1f, 0x9a9a9a];

function label(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 28px system-ui, sans-serif';
  const w = Math.min(250, ctx.measureText(text).width + 28);
  ctx.fillStyle = 'rgba(30,60,40,0.65)';
  ctx.beginPath();
  ctx.roundRect((256 - w) / 2, 10, w, 44, 22);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class HelperEntity {
  constructor(data, world, scene) {
    this.data = data;
    this.def = HELPERS[data.type];
    this.world = world;
    this.scene = scene;
    // Apparence variée : les aides femmes et hommes ont des coiffures, peaux et tenues différentes.
    const seed = [...data.name].reduce((n, c) => n + c.charCodeAt(0), 0);
    const female = data.sex === 'f';
    const styles = female ? ['ponytail', 'long', 'curly', 'long'] : ['short', 'curly', 'short', 'bald'];
    this.avatar = buildAvatar({
      skin: SKINS[seed % SKINS.length],
      hair: HAIRS[(seed * 3) % HAIRS.length],
      hairStyle: styles[seed % styles.length],
      top: this.def.color,
      bottom: female && seed % 2 ? 0x5a4a6a : 0x3a3f4a,
      shoes: 0x3b2a20,
      hat: data.type !== 'vet' && seed % 3 === 0,
    });
    this.root = new THREE.Group();
    this.root.add(this.avatar.root);
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: label(`${this.def.emoji} ${data.name}`), depthTest: false, transparent: true }));
    this.tag.position.y = 2.05;
    this.tag.scale.set(1.6, 0.4, 1);
    this.tag.renderOrder = 10;
    this.root.add(this.tag);
    const [bx, bz] = this.def.base;
    this.root.position.set(bx, world.heightAt(bx, bz), bz);
    scene.add(this.root);
    this.task = null;
    this.target = new THREE.Vector3(bx, 0, bz);
    this.heading = 0;
    this.speed = 0;
    this.phase = 0;
    this.think = 1 + Math.random() * 2;
    this.workTimer = 0;
    this.forced = null; // cible imposée (conduite du troupeau)
  }

  get position() {
    return this.root.position;
  }

  update(dt, game) {
    const p = this.root.position;
    let targetSpeed = 0;
    if (this.forced) {
      this.target.copy(this.forced);
      targetSpeed = 4.5;
    } else if (this.workTimer > 0) {
      this.workTimer -= dt;
      this.avatar.arms.forEach((a, i) => { a.rotation.x = -1 + Math.sin(this.workTimer * 8 + i) * 0.4; });
      if (this.workTimer <= 0) {
        game.helperDone(this, this.task);
        this.task = null;
        this.think = 1.5;
        this.avatar.arms.forEach((a) => { a.rotation.x = 0; });
      }
    } else {
      this.think -= dt;
      if (!this.task && this.think <= 0) {
        this.think = 2 + Math.random() * 2;
        this.task = helperTask(game.profile, this.data, game.animalsHere());
        if (!this.task) {
          const [bx, bz] = this.def.base;
          this.target.set(bx + (Math.random() - 0.5) * 6, 0, bz + (Math.random() - 0.5) * 6);
        }
      }
      if (this.task) {
        const goal = game.taskPosition(this.task);
        if (!goal) {
          this.task = null;
        } else {
          this.target.copy(goal);
          const d = Math.hypot(goal.x - p.x, goal.z - p.z);
          if (d < 1.6) this.workTimer = 2.5;
          else targetSpeed = d > 12 ? 4 : 2.4;
        }
      } else if (Math.hypot(this.target.x - p.x, this.target.z - p.z) > 0.6) {
        targetSpeed = 1.4;
      }
    }

    if (targetSpeed > 0) {
      const want = Math.atan2(this.target.x - p.x, this.target.z - p.z);
      let diff = want - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 6);
    } else if (this.task && this.workTimer > 0) {
      const goal = game.taskPosition(this.task);
      if (goal) this.heading = Math.atan2(goal.x - p.x, goal.z - p.z);
    }
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 6);
    if (this.speed > 0.02) {
      p.x += Math.sin(this.heading) * this.speed * dt;
      p.z += Math.cos(this.heading) * this.speed * dt;
      this.world.resolveCollisions(p, 0.35);
    }
    p.y = this.world.heightAt(p.x, p.z);
    this.root.rotation.y = this.heading;
    this.tag.visible = p.distanceTo(game.player.position) < 14;

    if (this.workTimer <= 0) {
      this.phase += dt * this.speed * 2.2;
      const amp = Math.min(0.7, this.speed * 0.16);
      this.avatar.legs[0].rotation.x = Math.sin(this.phase) * amp;
      this.avatar.legs[1].rotation.x = -Math.sin(this.phase) * amp;
      this.avatar.arms[0].rotation.x = -Math.sin(this.phase) * amp * 0.8;
      this.avatar.arms[1].rotation.x = Math.sin(this.phase) * amp * 0.8;
    }
  }

  dispose() {
    this.scene.remove(this.root);
    disposeModel(this.avatar.root);
    this.tag.material.map.dispose();
    this.tag.material.dispose();
  }
}
