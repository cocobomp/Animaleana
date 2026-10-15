// Un animal dans le monde 3D : déplacements, comportement et animations.

import * as THREE from 'three';
import { SPECIES } from '../sim/species.js';
import { growthScale, mood, lifeStage } from '../sim/animal.js';
import { buildAnimalModel, disposeModel } from './models/animalModel.js';
import { emojiTexture } from './textures.js';

// Où chaque espèce aime traîner (les chevaux au paddock, le troupeau à la bergerie…).
const HOME = {
  horse: { x: -16, z: 16, r: 5 },
  dog: { x: 2, z: 2, r: 10 },
  cat: { x: -3, z: -7, r: 7 },
  rabbit: { x: 8, z: 4, r: 4 },
};
export const PEN = { x: 14, z: 35, r: 5, gate: { x: 14, z: 46 } };
export const FIELD = { x: 0, z: 60, r: 12 };

/** Vrai si (x, z) est dans l'enclos de la bergerie (20 m × 14 m). */
export const inPen = (x, z, margin = 0) => Math.abs(x - PEN.x) < 10 - margin && Math.abs(z - PEN.z) < 7 - margin;
const GATE_OUT = new THREE.Vector3(PEN.x, 0, PEN.z + 9.5);
const GATE_IN = new THREE.Vector3(PEN.x, 0, PEN.z + 4.5);
const CORNER = new THREE.Vector3();

const MOOD_EMOJI = { sick: '🤒', sad: '😢' };
const HERD = ['horse', 'sheep', 'goat', 'cow'];

function nameTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 30px system-ui, sans-serif';
  const w = Math.min(250, ctx.measureText(text).width + 28);
  ctx.fillStyle = 'rgba(20,24,30,0.55)';
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

export class AnimalEntity {
  constructor(data, world, scene) {
    this.data = data;
    this.world = world;
    this.scene = scene;
    this.sp = SPECIES[data.species];
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.targetSpeed = 0;
    this.phase = Math.random() * 10;
    this.time = Math.random() * 10;
    this.state = 'idle';
    this.timer = 1 + Math.random() * 3;
    this.target = new THREE.Vector3();
    this.lie = 0;
    this.ridden = false;
    this.sleeping = false;
    this.particles = [];
    this.target2 = null;
    this.eatTimer = 0;
    this.partner = null;

    this.build();
    const home = this.home;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * home.r;
    this.root.position.set(home.x + Math.cos(a) * r, 0, home.z + Math.sin(a) * r);
    this.snap();
    scene.add(this.root);
  }

  build() {
    if (this.root) {
      this.scene.remove(this.root);
      disposeModel(this.model.root);
    }
    this.model = buildAnimalModel(this.data.species, this.data.look);
    this.root = new THREE.Group();
    this.scaleGroup = new THREE.Group();
    this.scaleGroup.add(this.model.root);
    this.root.add(this.scaleGroup);
    this.applyScale();

    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(this.data.name), depthTest: false, transparent: true }));
    this.label.renderOrder = 10;
    this.root.add(this.label);
    this.status = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    this.status.visible = false;
    this.root.add(this.status);
    this.statusEmoji = null;
    this.placeLabels();
  }

  applyScale() {
    this.scale = this.data.look.scale * growthScale(this.data);
    this.scaleGroup.scale.setScalar(this.scale);
    this.stage = lifeStage(this.data);
  }

  placeLabels() {
    const top = (this.model.headHeight + this.data.look.headR * 2.5) * this.scale;
    const s = Math.max(0.6, Math.min(1.4, top * 0.9));
    this.label.position.y = top + 0.35 * s;
    this.label.scale.set(1.6 * s, 0.4 * s, 1);
    this.status.position.y = top + 0.8 * s;
    this.status.scale.setScalar(0.5 * s);
  }

  rename() {
    this.label.material.map.dispose();
    this.label.material.map = nameTexture(this.data.name);
  }

  /** Passe par la barrière pour entrer dans l'enclos ou en sortir. */
  navTarget(goal) {
    const p = this.root.position;
    const inside = inPen(p.x, p.z);
    if (inside === inPen(goal.x, goal.z)) return goal;
    const corridor = Math.abs(p.x - PEN.x) < 2.2 && p.z > GATE_IN.z - 0.5 && p.z < GATE_OUT.z + 0.5;
    if (inside) return corridor ? GATE_OUT : GATE_IN;
    if (corridor) return GATE_IN;
    // Derrière l'enclos : on le contourne par le côté le plus proche.
    if (p.z < PEN.z + 7.5 && Math.abs(p.x - PEN.x) < 11.5) {
      CORNER.set(PEN.x + (p.x < PEN.x ? -12 : 12), 0, PEN.z + 9);
      return CORNER;
    }
    return GATE_OUT;
  }

  /** Zone de vie : les animaux de ferme sont soit à la bergerie, soit au pré. */
  get home() {
    if (this.sp.livestock) return this.data.zone === 'field' ? FIELD : PEN;
    return HOME[this.data.species];
  }

  get position() {
    return this.root.position;
  }

  /** Rayon approximatif, pour savoir si le joueur est assez près. */
  get radius() {
    return (this.data.look.bodyLen * 0.5 + 0.4) * this.scale;
  }

  snap() {
    const p = this.root.position;
    p.y = this.world.heightAt(p.x, p.z);
  }

  pickWanderTarget() {
    const h = this.home;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * h.r;
      const x = h.x + Math.cos(a) * r;
      const z = h.z + Math.sin(a) * r;
      if (!this.world.isWater(x, z)) {
        this.target.set(x, 0, z);
        return;
      }
    }
    this.target.set(h.x, 0, h.z);
  }

  emit(emoji, count = 3) {
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(emoji), transparent: true, depthWrite: false }));
      s.position.set((Math.random() - 0.5) * 0.4, this.label.position.y - 0.2, (Math.random() - 0.5) * 0.4);
      s.scale.setScalar(0.35);
      s.userData = { life: 1.4 + Math.random() * 0.5, vy: 0.6 + Math.random() * 0.3, delay: i * 0.2 };
      s.visible = false;
      this.root.add(s);
      this.particles.push(s);
    }
  }

  /** Changement d'emoji au-dessus de la tête selon l'humeur. */
  updateStatus() {
    const m = mood(this.data);
    const emoji = this.sleeping ? '💤' : MOOD_EMOJI[m] ?? null;
    if (emoji !== this.statusEmoji) {
      this.statusEmoji = emoji;
      this.status.visible = !!emoji;
      if (emoji) {
        this.status.material.map = emojiTexture(emoji);
        this.status.material.needsUpdate = true;
      }
    }
    return m;
  }

  /** Choisit une nouvelle occupation (manger, jouer, se toiletter, suivre sa mère…). */
  decide(ctx) {
    const d = this.data;
    const p = this.root.position;
    const g = ctx.game;
    this.partner = null;

    const eq = g.wantedEquipment(d);
    if (eq) {
      this.state = 'goTo';
      this.goal = eq;
      this.target.set(eq.pos.x + (Math.random() - 0.5) * 1.2, 0, eq.pos.z + 1 + Math.random() * 0.6);
      this.timer = 25;
      return;
    }

    const others = ctx.entities.filter((o) => o !== this && !o.ridden && !o.sleeping && o.state !== 'eat');
    const near = (o, r) => Math.hypot(o.position.x - p.x, o.position.z - p.z) < r;

    // Les bébés restent près de leur mère et tètent quand ils ont faim.
    if (this.stage === 'baby' && d.parents) {
      const mother = others.find((o) => d.parents.includes(o.data.id) && o.data.sex === 'f');
      if (mother) {
        this.state = 'mother';
        this.partner = mother;
        this.timer = 6 + Math.random() * 6;
        return;
      }
    }

    // Les chiens jouent avec un autre chien ou courent après un chat.
    if (d.species === 'dog' && d.needs.energy > 40 && Math.random() < 0.35) {
      const mate = others.find((o) => (o.data.species === 'dog' || o.data.species === 'cat') && near(o, 12) && !o.herdCtrl);
      if (mate) {
        this.state = 'play';
        this.partner = mate;
        this.timer = 5 + Math.random() * 3;
        if (mate.state !== 'play') {
          mate.state = mate.data.species === 'cat' ? 'flee' : 'play';
          mate.partner = this;
          mate.timer = this.timer;
        }
        return;
      }
    }

    // Les chevaux (et vaches, chèvres) se font des toilettages mutuels.
    if (['horse', 'cow', 'goat'].includes(d.species) && Math.random() < 0.2) {
      const mate = others.find((o) => o.data.species === d.species && near(o, 8) && o.state !== 'groom');
      if (mate) {
        this.state = 'groom';
        this.partner = mate;
        this.timer = 6;
        mate.state = 'groom';
        mate.partner = this;
        mate.timer = 6;
        return;
      }
    }

    if (this.state === 'idle') {
      this.state = 'walk';
      this.pickWanderTarget();
      // Les animaux de troupeau restent groupés.
      if (HERD.includes(d.species)) {
        const herd = others.filter((o) => o.data.species === d.species || (o.sp.livestock && this.sp.livestock));
        if (herd.length) {
          const cx = herd.reduce((s, o) => s + o.position.x, 0) / herd.length;
          const cz = herd.reduce((s, o) => s + o.position.z, 0) / herd.length;
          this.target.x = this.target.x * 0.5 + cx * 0.5;
          this.target.z = this.target.z * 0.5 + cz * 0.5;
        }
      }
      this.timer = 4 + Math.random() * 6;
    } else {
      this.state = 'idle';
      this.timer = 2 + Math.random() * 6;
    }
  }

  update(dt, ctx) {
    this.time += dt;
    const d = this.data;
    const m = this.updateStatus();
    const sad = m === 'sad' || m === 'sick';
    const p = this.root.position;

    // Le nom n'apparaît que lorsque le joueur est proche.
    const distPlayer = p.distanceTo(ctx.playerPos);
    this.label.visible = distPlayer < 9 && !this.ridden;

    if (this.ridden) {
      this.sleeping = false;
    } else {
      const busy = this.herdCtrl || this.state === 'goTo' || this.state === 'eat';
      const tired = d.needs.energy < 12 || (this.sleeping && d.needs.energy < 60);
      this.sleeping = !busy && !d.following && (ctx.night || tired) && distPlayer > 2.5;
      this.targetSpeed = 0;

      if (this.herdCtrl) {
        // Conduit par le chien de troupeau ou par le berger.
        const h = this.herdCtrl;
        if (h.pusher) {
          this.target.copy(h.target);
          this.targetSpeed = this.sp.runSpeed * 0.9;
        } else {
          const away = new THREE.Vector3(p.x - h.from.x, 0, p.z - h.from.z);
          const dist = away.length();
          const toGoal = new THREE.Vector3(h.goal.x - p.x, 0, h.goal.z - p.z);
          if (toGoal.lengthSq() < 0.25) toGoal.set(0, 0, 0);
          const toCenter = new THREE.Vector3(h.center.x - p.x, 0, h.center.z - p.z);
          const pushed = dist < 9;
          const dir = toGoal.normalize().multiplyScalar(pushed ? 1 : 0.15)
            .add(toCenter.normalize().multiplyScalar(0.35))
            .add(pushed ? away.normalize().multiplyScalar(1.1 * (1 - dist / 9)) : new THREE.Vector3());
          this.target.set(p.x + dir.x * 4, 0, p.z + dir.z * 4);
          this.targetSpeed = pushed ? this.sp.walkSpeed * 2.2 : (toGoal.lengthSq() > 0 ? this.sp.walkSpeed * 0.3 : 0);
        }
      } else if (this.sleeping) {
        this.targetSpeed = 0;
      } else if (d.following) {
        this.target.copy(ctx.playerPos);
        const far = distPlayer > 7;
        const close = distPlayer < 2.2 + this.radius;
        this.targetSpeed = close ? 0 : far ? this.sp.runSpeed : this.sp.walkSpeed * 1.4;
      } else {
        this.timer -= dt;
        const partner = this.partner;
        switch (this.state) {
          case 'goTo': {
            const dd = Math.hypot(this.target.x - p.x, this.target.z - p.z);
            if (dd < 0.6 + this.radius * 0.5) {
              this.state = 'eat';
              this.eatTimer = 4;
            } else {
              this.targetSpeed = this.sp.walkSpeed * (dd > 15 ? 2 : 1.2);
            }
            if (this.timer <= 0) this.state = 'idle';
            break;
          }
          case 'eat':
            this.eatTimer -= dt;
            if (this.eatTimer <= 0) {
              ctx.game.animalUsedEquipment(this, this.goal);
              this.goal = null;
              this.state = 'idle';
              this.timer = 2;
            }
            break;
          case 'play':
          case 'flee':
            if (!partner || partner.sleeping) {
              this.state = 'idle';
              break;
            }
            if (this.state === 'play') {
              // On court vers son copain en tournant un peu autour.
              const a = this.time * 1.5 + (this.data.id.charCodeAt(0) % 6);
              this.target.set(partner.position.x + Math.cos(a) * 1.5, 0, partner.position.z + Math.sin(a) * 1.5);
              this.targetSpeed = this.sp.runSpeed * 0.8;
            } else {
              const away = new THREE.Vector3(p.x - partner.position.x, 0, p.z - partner.position.z).normalize();
              this.target.set(p.x + away.x * 5, 0, p.z + away.z * 5);
              this.targetSpeed = this.sp.runSpeed * 0.75;
            }
            if (this.timer <= 0) {
              ctx.game.socialMoment(this, 'play');
              this.state = 'idle';
              this.timer = 3;
            }
            break;
          case 'groom': {
            if (!partner) {
              this.state = 'idle';
              break;
            }
            const dd = Math.hypot(partner.position.x - p.x, partner.position.z - p.z);
            if (dd > 1.2 + this.radius) {
              this.target.copy(partner.position);
              this.targetSpeed = this.sp.walkSpeed;
            } else {
              this.heading = Math.atan2(partner.position.x - p.x, partner.position.z - p.z);
            }
            if (this.timer <= 0) {
              ctx.game.socialMoment(this, 'groom');
              this.state = 'idle';
              this.timer = 4;
            }
            break;
          }
          case 'mother': {
            if (!partner) {
              this.state = 'idle';
              break;
            }
            const dd = Math.hypot(partner.position.x - p.x, partner.position.z - p.z);
            this.target.set(partner.position.x - Math.sin(partner.heading) * 0.8, 0, partner.position.z - Math.cos(partner.heading) * 0.8);
            this.targetSpeed = dd > 1.2 ? Math.min(this.sp.runSpeed, partner.speed + 0.8 + dd * 0.2) : 0;
            if (this.timer <= 0) {
              if (d.needs.hunger < 60) ctx.game.socialMoment(this, 'nurse');
              this.decide(ctx);
            }
            break;
          }
          case 'walk': {
            const dx = this.target.x - p.x;
            const dz = this.target.z - p.z;
            if (Math.hypot(dx, dz) < 0.5) {
              this.state = 'idle';
              this.timer = 2 + Math.random() * 5;
            }
            this.targetSpeed = this.sp.walkSpeed * (sad ? 0.6 : 1);
            if (this.timer <= 0) this.decide(ctx);
            break;
          }
          default:
            if (this.timer <= 0) this.decide(ctx);
        }
      }

      // Se tourner vers la cible puis avancer.
      if (this.targetSpeed > 0) {
        const t = this.herdCtrl && !this.herdCtrl.pusher ? this.target : this.navTarget(this.target);
        const want = Math.atan2(t.x - p.x, t.z - p.z);
        let diff = want - this.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 3.5);
      }
      this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * 3);
      if (this.speed > 0.01) {
        const step = this.speed * dt;
        const nx = p.x + Math.sin(this.heading) * step;
        const nz = p.z + Math.cos(this.heading) * step;
        if (this.world.isWater(nx, nz)) {
          this.speed = 0;
          this.heading += Math.PI / 2;
          if (this.state === 'walk') this.state = 'idle';
        } else {
          p.x = nx;
          p.z = nz;
          this.world.resolveCollisions(p, this.radius * 0.6);
        }
      }
      this.snap();
    }

    this.root.rotation.y = this.heading;
    this.animate(dt, sad);

    // Petites particules (cœurs, étoiles…)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const s = this.particles[i];
      const u = s.userData;
      if (u.delay > 0) {
        u.delay -= dt;
        continue;
      }
      s.visible = true;
      u.life -= dt;
      s.position.y += u.vy * dt;
      s.material.opacity = Math.min(1, u.life);
      if (u.life <= 0) {
        this.root.remove(s);
        s.material.dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  animate(dt, sad) {
    const md = this.model;
    const sp = this.sp;
    const legLen = this.data.look.legLen * (this.data.look.legs ?? 1);
    const v = this.speed / Math.max(0.3, this.scale);
    const stride = Math.max(0.2, legLen * 2.4);
    this.phase += dt * (v / stride) * Math.PI * 2 * 0.5;
    const moving = this.speed > 0.05;
    const gallop = this.speed > sp.runSpeed * 0.65;
    this.lie += ((this.sleeping ? 1 : 0) - this.lie) * Math.min(1, dt * 2);
    const lie = this.lie;

    if (sp.hops) {
      const hop = moving ? Math.max(0, Math.sin(this.phase * 1.2)) : 0;
      md.body.position.y = hop * 0.1 - lie * 0.02;
      md.legs.forEach((l) => {
        l.pivot.rotation.x = (l.front ? hop * 0.6 : -hop * 0.9) * (1 - lie);
      });
    } else {
      const amp = (gallop ? 0.75 : Math.min(0.45, 0.15 + v * 0.12)) * (moving ? 1 : 0);
      md.legs.forEach((l, i) => {
        const offset = gallop ? [0, 0.35, Math.PI, Math.PI + 0.35][i] : [0, Math.PI, Math.PI, 0][i];
        const swing = Math.sin(this.phase + offset) * amp;
        const rest = l.front ? -1.35 : 1.35;
        l.pivot.rotation.x = swing * (1 - lie) + rest * lie;
      });
      const bob = moving ? Math.abs(Math.sin(this.phase)) * (gallop ? 0.06 : 0.02) : 0;
      md.body.position.y = bob - lie * md.y0 * 0.62;
    }

    // Respiration, tête, queue
    const breathe = Math.sin(this.time * (this.sleeping ? 1.2 : 2.4)) * 0.012;
    md.body.scale.set(1 + breathe, 1 + breathe, 1);
    const look = Math.sin(this.time * 0.4) * 0.35 * (moving ? 0.2 : 1);
    md.head.rotation.y = look;
    const baseNeck = this.data.look.neckAngle;
    // Tête baissée pour manger (à la mangeoire ou en broutant au pré).
    const grazing = this.sp.livestock && this.state === 'idle' && Math.sin(this.time * 0.3 + this.phase) > 0.2;
    const eat = this.state === 'eat' || (grazing && !this.herdCtrl) ? 0.9 + Math.sin(this.time * 4) * 0.06 : 0;
    this.headDown = (this.headDown ?? 0) + (eat - (this.headDown ?? 0)) * Math.min(1, dt * 3);
    md.neck.rotation.x = baseNeck + (sad ? 0.35 : 0) + lie * 0.4 + this.headDown;

    const happy = !sad;
    switch (this.data.look.tailType) {
      case 'dog':
      case 'curl':
        md.tail.rotation.y = Math.sin(this.time * (happy ? 14 : 3)) * (happy ? 0.5 : 0.1);
        break;
      case 'cat':
        md.tail.rotation.z = Math.sin(this.time * 1.5) * 0.3;
        break;
      case 'horse':
        md.tail.rotation.z = Math.sin(this.time * 0.9) * 0.12 + (Math.sin(this.time * 0.23) > 0.95 ? Math.sin(this.time * 9) * 0.3 : 0);
        break;
      default:
    }
    if (md.ears.length && this.data.look.earType === 'rabbit') {
      md.ears.forEach((e, i) => { e.rotation.x = -0.25 + Math.sin(this.time * 0.8 + i) * 0.1 - lie * 0.6; });
    }
  }

  dispose() {
    this.scene.remove(this.root);
    disposeModel(this.model.root);
    this.label.material.map.dispose();
    this.label.material.dispose();
    this.status.material.dispose();
    this.particles.forEach((s) => s.material.dispose());
  }
}
