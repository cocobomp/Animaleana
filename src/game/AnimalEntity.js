// Un animal dans le monde 3D : déplacements, comportement et animations.

import * as THREE from 'three';
import { SPECIES } from '../sim/species.js';
import { growthScale, mood, lifeStage } from '../sim/animal.js';
import { buildAnimalModel, disposeModel } from './models/animalModel.js';
import { buildGltfAnimal } from './models/gltfAnimal.js';
import { emojiTexture } from './textures.js';
import { enclosure, inside, navTarget } from './nav.js';
import { buildGear, removeGear } from './gearModels.js';
import { canLeash, heelSkill } from '../sim/gear.js';
import { audio } from './audio.js'; // voix des animaux

// Où chaque espèce aime traîner (les chevaux au paddock, le troupeau à la bergerie…).
// Un cercle { x, z, r } ; les enclos ont aussi leur rectangle intérieur hw × hd (toute la place, même agrandi).
export const HOME = { // (place et taille appliquées par coreLayout.js : enclos déplacés ou agrandis)
  horse: { x: -16, z: 20, r: 9, hw: 9, hd: 11 },
  dog: { x: -8, z: -5, r: 3.5 }, // près de la niche
  cat: { x: -1, z: -10.5, r: 3.5 }, // sur le perron de la maison
  rabbit: { x: 9, z: 4.7, r: 1.6, hw: 2.2, hd: 1.5 }, // dans l'enclos du clapier
};
export const PEN = { x: 14, z: 35, r: 6, hw: 10.5, hd: 6.5, gate: { x: 14, z: 47 } };
export const FIELD = { x: 0, z: 60, r: 12 };

/** Vrai si (x, z) est dans l'enclos de la bergerie. */
export const inPen = (x, z, margin = 0) => inside(enclosure('pen'), x, z, margin);

// Les petits animaux passent sous les barrières.
const SMALL = (e) => e.data.species === 'cat' || e.data.species === 'rabbit' || (e.data.species === 'dog' && e.scale < 0.65);

const MOOD_EMOJI = { sick: '🤒', sad: '😢' };
const HERD = ['horse', 'sheep', 'goat', 'cow'];

// Décalages de phase des pattes du cheval [AVG, AVD, ARG, ARD] :
// pas latéral à quatre temps, trot en diagonale, galop à trois temps.
const P = Math.PI;
const OFF_WALK = [-P / 2, P / 2, 0, P];
const OFF_TROT = [0, P, P, 0];
const OFF_GALLOP = [4.19, 2.09, 2.09, 0];

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
      this.model.dispose?.();
      disposeModel(this.model.root);
    }
    // Modèle GLB animé si l'espèce en a un (src/game/assets.js), sinon le modèle procédural.
    this.model = buildGltfAnimal(this.data.species, this.data.look) ?? buildAnimalModel(this.data.species, this.data.look, this.data.breed);
    this.root = new THREE.Group();
    this.root.userData.entity = this;
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
    this.gearGroup = null;
    this.applyGear();
    this.placeLabels();
  }

  /** Met à jour l'équipement visible (selle, couverture…). */
  applyGear() {
    if (this.gearGroup) removeGear(this.gearGroup);
    this.gearGroup = buildGear(this.model, this.data.look, this.data.gear ?? {});
  }

  applyScale() {
    this.scale = this.data.look.scale * growthScale(this.data);
    this.scaleGroup.scale.setScalar(this.scale);
    this.stage = lifeStage(this.data);
    // Les poulains ont de longues pattes pour leur taille : on les étire et on relève le corps d'autant.
    const boost = this.data.species === 'horse' ? (this.stage === 'baby' ? 1.22 : this.stage === 'young' ? 1.08 : 1) : 1;
    for (const l of this.model.legs) l.pivot.scale.set(1, boost, 1);
    this.legLift = (boost - 1) * (this.model.legTop ?? 0);
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
    return navTarget(this.root.position, goal, this.small);
  }

  get small() {
    return SMALL(this);
  }

  /** Zone de vie : les animaux de ferme sont soit à la bergerie, soit au pré. */
  get home() {
    // Cheval rentré : sa zone de vie est son box (src/game/Interiors.js).
    const stall = this.data.stalled ? this.world.stallOf?.(this.data) : null;
    if (stall) return stall;
    // Maison choisie par le joueur (niche, paddock, ranch… voir src/game/Structures.js).
    const built = this.customHome;
    if (built) return built;
    if (this.sp.livestock) return this.data.zone === 'field' ? FIELD : PEN;
    return HOME[this.data.species];
  }

  /** Zone de vie de la construction attribuée à l'animal, ou null. */
  get customHome() {
    return (this.data.homeId && this.world.structureHomes?.get(this.data.homeId)) || null;
  }

  /** Ressort de la maison des animaux (devant la porte). */
  leaveHouse() {
    if (this.inside) {
      const den = this.world.petHouse;
      if (den) this.root.position.set(den.door.x + (Math.random() - 0.5) * 2, 0, den.door.z + 0.8 + Math.random());
      this.snap();
    }
    this.inside = false;
    this.root.visible = true;
    this.state = 'idle';
    this.timer = 1;
  }

  get position() {
    return this.root.position;
  }

  /** Rayon approximatif, pour savoir si le joueur est assez près. */
  get radius() {
    return (this.data.look.bodyLen * 0.5 + 0.4) * this.scale;
  }

  snap(dt = 0.016) {
    const p = this.root.position;
    // Hauteur de la barre du haut quand le chat est perché dessus.
    const want = this.perch?.phase === 'on' ? 0.97 : 0;
    this.perchY = (this.perchY ?? 0) + (want - (this.perchY ?? 0)) * Math.min(1, dt * 10);
    p.y = this.world.heightAt(p.x, p.z) + this.perchY;
  }

  pickWanderTarget() {
    const h = this.home;
    for (let i = 0; i < 8; i++) {
      let x;
      let z;
      if (h.hw) {
        // Enclos : n'importe où à l'intérieur (s'il est agrandi, les animaux en profitent).
        x = h.x + (Math.random() * 2 - 1) * h.hw;
        z = h.z + (Math.random() * 2 - 1) * h.hd;
      } else {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * h.r;
        x = h.x + Math.cos(a) * r;
        z = h.z + Math.sin(a) * r;
      }
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

  /**
   * Voix de l'animal (hennissement, aboiement, miaulement…). kind : 'happy', ou null = selon son humeur
   * (plaintive s'il est triste ou malade). dist : distance au joueur (plus loin = plus doux).
   * Les bébés ont la voix plus aiguë, les gros animaux plus grave. Limité à une voix toutes les ~2 s.
   */
  speak(kind = null, dist = 0) {
    const m = mood(this.data);
    const how = kind ?? (m === 'sick' ? 'sick' : m === 'sad' ? 'sad' : m === 'happy' ? 'happy' : 'neutral');
    const pitch = this.stage === 'baby' ? 1.6 : this.stage === 'young' ? 1.25 : 1 / (0.55 + this.scale * 0.45);
    return audio.animal(this.data.species, how, this.data.id, { pitch, gain: 1 / (1 + dist / 7) });
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

    // Au box, le cheval reste chez lui : il tourne un peu, mange, dort.
    if (d.stalled && this.world.stallOf?.(d)) {
      this.state = this.state === 'idle' ? 'walk' : 'idle';
      if (this.state === 'walk') this.pickWanderTarget();
      this.timer = 3 + Math.random() * 6;
      return;
    }

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

    // Les chats aiment sauter sur les barrières et y marcher en équilibre.
    if (d.species === 'cat' && this.stage !== 'baby' && Math.random() < 0.25 && this.world.fences) {
      const fence = this.world.fences.find((f) => Math.max(f.hw, f.hd) > 2
        && Math.abs(p.x - f.x) < f.hw + 5 && Math.abs(p.z - f.z) < f.hd + 5);
      if (fence) {
        const alongX = fence.hw > fence.hd;
        this.perch = { fence, alongX, dir: Math.random() < 0.5 ? 1 : -1, phase: 'go' };
        this.state = 'perch';
        this.timer = 8 + Math.random() * 6;
        const tx = alongX ? Math.max(fence.x - fence.hw + 0.5, Math.min(fence.x + fence.hw - 0.5, p.x)) : fence.x;
        const tz = alongX ? fence.z : Math.max(fence.z - fence.hd + 0.5, Math.min(fence.z + fence.hd - 0.5, p.z));
        this.target.set(tx, 0, tz);
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
      const mate = others.find((o) => o.data.species === d.species && near(o, 8) && o.state !== 'groom' && !o.data.stalled);
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
          // Chacun vise un point différent autour du groupe (sinon tout le monde finit au même endroit).
          const spread = 1.5 + herd.length * 0.8;
          const ang = Math.random() * Math.PI * 2;
          this.target.x = this.target.x * 0.5 + cx * 0.5 + Math.cos(ang) * spread;
          this.target.z = this.target.z * 0.5 + cz * 0.5 + Math.sin(ang) * spread;
        }
      }
      this.timer = 4 + Math.random() * 6;
    } else {
      this.state = 'idle';
      this.timer = 2 + Math.random() * 6;
    }
  }

  /**
   * Promenade du chien. Bien dressé : il marche au pied, à gauche du joueur.
   * Pas encore dressé : il part renifler à droite et à gauche, et en laisse il tire.
   */
  followDog(dt, ctx, distPlayer) {
    const d = this.data;
    const skill = heelSkill(d);
    const leashed = canLeash(d) && d.leashed;
    const pl = ctx.game.player;
    const h = pl.heading;
    // Place « au pied » : à gauche, un peu en arrière.
    const heel = { x: pl.position.x + Math.cos(h) * 0.9 - Math.sin(h) * 0.3, z: pl.position.z - Math.sin(h) * 0.9 - Math.cos(h) * 0.3 };
    this.sniff = (this.sniff ?? 0) - dt;
    if (this.sniff <= 0) {
      // Plus il est dressé, moins il est distrait.
      this.sniffing = Math.random() > skill;
      this.sniffSpot = { x: pl.position.x + (Math.random() - 0.5) * 10, z: pl.position.z + (Math.random() - 0.5) * 10 };
      this.sniff = 1.5 + Math.random() * 3;
    }
    const goal = this.sniffing ? this.sniffSpot : heel;
    this.target.set(goal.x, 0, goal.z);
    const dist = Math.hypot(goal.x - this.root.position.x, goal.z - this.root.position.z);
    this.targetSpeed = dist < 0.3 ? 0 : Math.min(this.sp.runSpeed, 0.8 + dist * 1.6);
    // Sans laisse, un chien pas dressé peut s'éloigner beaucoup ; il revient quand il en a envie.
    if (!leashed && distPlayer > 14 && Math.random() < dt) this.sniffing = false;
    this.leashPull = 0;
    if (leashed) {
      const LEASH = 2.6;
      const p = this.root.position;
      const dx = p.x - pl.position.x;
      const dz = p.z - pl.position.z;
      const len = Math.hypot(dx, dz);
      if (len > LEASH) {
        // La laisse est tendue : le chien est retenu… et il tire un peu le joueur.
        p.x = pl.position.x + (dx / len) * LEASH;
        p.z = pl.position.z + (dz / len) * LEASH;
        this.leashPull = (1 - skill) * Math.min(1, (len - LEASH) * 4 + 0.4);
        this.leashDir = { x: dx / len, z: dz / len };
      }
    }
  }

  /** Les animaux ne se marchent pas dessus : ceux qui se chevauchent s'écartent doucement. */
  separate(ctx, dt) {
    if (this.sleeping || this.ridden || this.inside || this.data.stalled || this.perch?.phase === 'on') return;
    const p = this.root.position;
    let moved = false;
    for (const o of ctx.entities) {
      if (o === this || o.inside || o.ridden || o.data.stalled) continue;
      const minD = (this.radius + o.radius) * 0.85;
      const dx = p.x - o.position.x;
      const dz = p.z - o.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= minD) continue;
      // Chacun fait la moitié du chemin, en douceur (quelques images pour se dégager).
      const push = (minD - dist) * Math.min(1, dt * 4) * 0.5;
      if (dist < 1e-3) {
        const a = Math.random() * Math.PI * 2;
        p.x += Math.cos(a) * push;
        p.z += Math.sin(a) * push;
      } else {
        p.x += (dx / dist) * push;
        p.z += (dz / dist) * push;
      }
      moved = true;
    }
    if (moved) this.world.resolveCollisions(p, this.radius * 0.6, { small: this.small });
  }

  update(dt, ctx) {
    this.time += dt;
    const d = this.data;
    const m = this.updateStatus();
    const sad = m === 'sad' || m === 'sick';
    const p = this.root.position;

    // Le nom n'apparaît que lorsque le joueur est proche.
    const distPlayer = p.distanceTo(ctx.playerPos);
    this.label.visible = false; // les noms sont affichés en HTML (étiquettes qu'on peut toucher)

    // De temps en temps (rarement), l'animal se manifeste s'il est assez près ; plus souvent s'il va mal.
    this.voiceTimer = (this.voiceTimer ?? 8 + Math.random() * 30) - dt;
    if (this.voiceTimer <= 0) {
      this.voiceTimer = (sad ? 20 : 40) + Math.random() * 50;
      if (!this.sleeping && !this.inside && distPlayer < 28 && Math.random() < 0.6) this.speak(null, distPlayer);
    }

    // Maison des animaux : on y va par la porte, puis on dort à l'abri dans son panier.
    if (d.housed && (d.following || this.ridden || this.herdCtrl?.pusher)) d.housed = false;
    const den = d.housed ? this.world.petHouse : null;
    if (!den && this.inside) this.leaveHouse();
    if (den && this.inside) {
      this.sleeping = ctx.night || d.needs.energy < 90;
      this.speed = 0;
      return;
    }
    if (den) {
      const dx = den.door.x - p.x;
      const dz = den.door.z - p.z;
      if (Math.hypot(dx, dz) < 1.3) {
        this.inside = true;
        this.root.visible = false;
        this.state = 'idle';
        return;
      }
      this.state = 'walk';
      this.target.set(den.door.x, 0, den.door.z);
      this.timer = 5;
    }

    // scripted : l'animal est guidé par une activité (agility, spectacle, src/game/Activities.js).
    if (this.ridden || this.scripted) {
      this.sleeping = false;
    } else {
      // Un cheval qui rentre au box ne s'endort pas en chemin.
      const stall = d.stalled ? this.world.stallOf?.(d) : null;
      const busy = this.herdCtrl || this.state === 'goTo' || this.state === 'eat' || den
        || (stall && Math.hypot(p.x - stall.x, p.z - stall.z) > 1.2);
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
      } else if (d.following && d.species === 'dog') {
        this.followDog(dt, ctx, distPlayer);
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
          case 'perch': {
            const pc = this.perch;
            const f = pc.fence;
            if (pc.phase === 'go') {
              // Marcher jusqu'au pied de la barrière, puis sauter dessus.
              const dd = Math.hypot(this.target.x - p.x, this.target.z - p.z);
              this.targetSpeed = this.sp.walkSpeed;
              if (dd < 0.4) {
                pc.phase = 'on';
                p.x = this.target.x;
                p.z = this.target.z;
                this.heading = pc.alongX ? (pc.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (pc.dir > 0 ? 0 : Math.PI);
                this.emit('✨', 1);
              }
            } else if (pc.phase === 'on') {
              // En équilibre : on avance doucement le long de la barre.
              this.targetSpeed = 0;
              const step = this.sp.walkSpeed * 0.45 * dt * pc.dir;
              if (pc.alongX) {
                p.x += step;
                if (Math.abs(p.x - f.x) > f.hw - 0.4) pc.dir *= -1;
              } else {
                p.z += step;
                if (Math.abs(p.z - f.z) > f.hd - 0.4) pc.dir *= -1;
              }
              this.heading = pc.alongX ? (pc.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (pc.dir > 0 ? 0 : Math.PI);
              this.speed = this.sp.walkSpeed * 0.45;
              if (this.timer <= 0) {
                pc.phase = 'down';
                if (pc.alongX) p.z += Math.random() < 0.5 ? 0.6 : -0.6;
                else p.x += Math.random() < 0.5 ? 0.6 : -0.6;
              }
            } else {
              this.perch = null;
              this.state = 'idle';
              this.timer = 2;
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
      if (this.perch?.phase !== 'on') this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * 3);
      if (this.speed > 0.01 && this.perch?.phase !== 'on') {
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
          this.world.resolveCollisions(p, this.radius * 0.6, { small: this.small });
        }
      }
      this.separate(ctx, dt);
      this.snap(dt);
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
    if (md.gltf) return this.animateGltf(dt, sad);
    const legLen = this.data.look.legLen * (this.data.look.legs ?? 1);
    const v = this.speed / Math.max(0.3, this.scale);
    const moving = this.speed > 0.05;
    const gallop = this.speed > sp.runSpeed * 0.65;
    const horse = this.data.species === 'horse';
    if (horse) {
      this.animateHorse(dt, sad, v, moving);
      return;
    }
    const stride = Math.max(0.2, legLen * 2.4);
    this.phase += dt * (v / stride) * Math.PI * 2 * 0.5;
    // Les chevaux dorment debout (tête basse) ; les autres se couchent, pattes repliées sous eux.
    const standingSleeper = horse;
    this.lie += ((this.sleeping && !standingSleeper ? 1 : 0) - this.lie) * Math.min(1, dt * 2);
    this.doze = (this.doze ?? 0) + ((this.sleeping && standingSleeper ? 1 : 0) - (this.doze ?? 0)) * Math.min(1, dt * 1.5);
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
        const ph = this.phase + offset;
        const swing = Math.sin(ph) * amp;
        // Couché : les pattes avant se replient vers l'arrière, les pattes arrière vers l'avant.
        const rest = l.front ? 1.25 : -1.25;
        l.pivot.rotation.x = swing * (1 - lie) + rest * lie;
        if (l.knee) {
          // Le genou (devant) se plie vers l'arrière et le jarret (derrière) vers l'avant quand la patte
          // revient vers l'avant ; au galop les pattes se replient davantage.
          const lift = Math.max(0, -Math.cos(ph));
          const bend = lift * amp * (gallop ? 1.5 : 1.2);
          const fold = l.front ? 0.7 : -0.7;
          l.knee.rotation.x = (l.front ? bend : -bend) * (1 - lie) + fold * lie;
        }
      });
      const bob = moving ? Math.abs(Math.sin(this.phase)) * (gallop ? 0.06 : 0.02) : 0;
      md.body.position.y = bob - lie * md.y0 * 0.62;
      // Le dos se cabre un peu au galop, et l'encolure accompagne le pas.
      md.body.rotation.x = gallop ? Math.sin(this.phase) * 0.05 : 0;
    }

    // Respiration, tête, queue
    const breathe = Math.sin(this.time * (this.sleeping ? 1.2 : 2.4)) * 0.012;
    // Un animal trop gros a le ventre plus large, un animal maigre est plus fin.
    const w = this.data.weight ?? 50;
    const girth = 1 + (w - 50) / 50 * 0.22;
    md.body.scale.set(girth + breathe, 1 + (girth - 1) * 0.4 + breathe, 1);
    const look = Math.sin(this.time * 0.4) * 0.35 * (moving ? 0.2 : 1);
    md.head.rotation.y = look;
    const baseNeck = this.data.look.neckAngle;
    // Tête baissée pour manger (à la mangeoire ou en broutant au pré).
    const grazing = this.sp.livestock && this.state === 'idle' && Math.sin(this.time * 0.3 + this.phase) > 0.2;
    const eat = this.state === 'eat' || (grazing && !this.herdCtrl) ? 0.9 + Math.sin(this.time * 4) * 0.06 : 0;
    this.headDown = (this.headDown ?? 0) + (eat - (this.headDown ?? 0)) * Math.min(1, dt * 3);
    // Hochement de l'encolure au pas (chevaux, vaches) ; la tête suit un peu.
    const nod = moving && !sp.hops ? Math.sin(this.phase * 2) * (gallop ? 0.08 : 0.04) * (this.data.species === 'horse' || this.data.species === 'cow' ? 1 : 0.4) : 0;
    md.neck.rotation.x = baseNeck + (sad ? 0.35 : 0) + lie * 0.4 + this.headDown + (this.doze ?? 0) * 0.55 + nod;
    if (md.headTilt !== undefined) md.head.rotation.x = md.headTilt - nod * 0.5 + (this.sleeping ? 0.15 : 0);

    const happy = !sad;
    const t = this.time;
    // Coup de queue occasionnel (chasser une mouche).
    const swish = Math.sin(t * 0.21 + this.phase * 0.01) > 0.93 ? Math.sin(t * 9) : 0;
    switch (this.data.look.tailType) {
      case 'dog':
      case 'curl':
        md.tail.rotation.y = Math.sin(t * (happy ? 14 : 3)) * (happy ? 0.5 : 0.1);
        break;
      case 'cat':
        md.tail.rotation.z = Math.sin(t * 1.5) * 0.3;
        md.tail.rotation.y = Math.sin(t * 0.7) * 0.15;
        break;
      case 'horse':
        md.tail.rotation.z = Math.sin(t * 0.9) * 0.12 + swish * 0.35;
        break;
      case 'cow':
        md.tail.rotation.z = Math.sin(t * 1.1) * 0.18 + swish * 0.6;
        md.tail.rotation.x = -Math.max(0, Math.sin(t * 0.37)) * 0.1;
        break;
      case 'goat':
        md.tail.rotation.z = Math.sin(t * (happy ? 7 : 2)) * (happy ? 0.3 : 0.1);
        break;
      case 'stub':
      case 'pompom':
        md.tail.rotation.z = Math.sin(t * (this.state === 'eat' || this.headDown > 0.5 ? 9 : 2.5)) * 0.25;
        break;
      default:
    }
    if (md.ears.length) {
      const rabbit = this.data.look.earType === 'rabbit';
      md.ears.forEach((e, i) => {
        const rest = e.userData.rest;
        if (!rest) return;
        // Petits mouvements d'oreille : une oreille pivote de temps en temps, les deux se couchent au repos.
        const flick = Math.max(0, Math.sin(t * 1.3 + i * 2.6 + this.phase * 0.02) - 0.9) * 10;
        if (rabbit) {
          e.rotation.x = rest.x + Math.sin(t * 0.8 + i) * 0.1 - lie * 0.6 - flick * 0.25;
          e.rotation.z = rest.z + (e.userData.side ?? 1) * flick * 0.12;
        } else {
          e.rotation.x = rest.x - flick * 0.25 - (this.sleeping ? 0.2 : 0);
          e.rotation.z = rest.z + (e.userData.side ?? 1) * (flick * 0.15 + (this.sleeping ? 0.08 : 0));
        }
      });
    }
  }

  /**
   * Animation du cheval : pas à quatre temps, trot en diagonale, galop à trois temps,
   * genoux et jarrets qui se replient, tête qui balance, oreilles mobiles, queue qui chasse les
   * mouches et report de poids à l'arrêt. Les allures se fondent l'une dans l'autre.
   */
  animateHorse(dt, sad, v, moving) {
    const md = this.model;
    const sp = this.sp;
    const legLen = this.data.look.legLen * (this.data.look.legs ?? 1);
    const t = this.time;
    const k = Math.min(1, dt * 4);
    // Poids de chaque allure (lissés) : 0 = pas, 1 = trot, 2 = galop.
    const want = !moving ? 0 : v > sp.runSpeed * 0.65 ? 2 : v > sp.walkSpeed * 1.45 ? 1 : 0;
    this.gait = (this.gait ?? 0) + (want - (this.gait ?? 0)) * k;
    const g = this.gait;
    const wTrot = Math.max(0, 1 - Math.abs(g - 1));
    const wGallop = Math.max(0, g - 1);
    const wWalk = Math.max(0, 1 - g);
    // Longueur de foulée par allure : la fréquence suit la vitesse, les sabots ne glissent pas.
    const stride = legLen * (1.7 * wWalk + 2.5 * wTrot + 3.7 * wGallop);
    if (moving) this.phase += dt * (v / Math.max(0.3, stride)) * Math.PI * 2;
    const ph = this.phase;
    const amp = moving ? 0.34 * wWalk + 0.46 * wTrot + 0.72 * wGallop : 0;
    // À l'arrêt, le cheval repose un postérieur (pointe du sabot au sol) et en change de temps en temps.
    this.restLeg = this.restLeg ?? 3;
    this.restTimer = (this.restTimer ?? 10 + Math.random() * 20) - dt;
    if (this.restTimer <= 0) {
      this.restLeg = this.restLeg === 2 ? 3 : 2;
      this.restTimer = 12 + Math.random() * 25;
    }
    this.restAmt = (this.restAmt ?? 0) + ((moving || this.sleeping ? 0 : 1) - (this.restAmt ?? 0)) * Math.min(1, dt * 1.5);
    const legs = md.legs;
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i];
      const aw = ph + OFF_WALK[i];
      const at = ph + OFF_TROT[i];
      const ag = ph + OFF_GALLOP[i];
      const swing = (Math.sin(aw) * wWalk + Math.sin(at) * wTrot + Math.sin(ag) * wGallop) * amp;
      // Le genou (ou le jarret) se plie quand la patte revient vers l'avant (sabot soulevé).
      const fold = moving
        ? (Math.max(0, -Math.cos(aw)) * wWalk + Math.max(0, -Math.cos(at)) * wTrot + Math.max(0, -Math.cos(ag)) * wGallop) * (0.5 + wGallop * 0.5)
        : 0;
      const rest = i === this.restLeg ? this.restAmt : 0;
      l.pivot.rotation.x = swing * (l.front ? 1 : 1.1) + rest * 0.12;
      if (l.knee) l.knee.rotation.x = (l.front ? fold * 1.1 : -fold * 0.9) - rest * 0.42;
    }
    const bob = moving ? Math.abs(Math.sin(ph * (1 + wTrot))) * (0.012 * wWalk + 0.03 * wTrot + 0.06 * wGallop) : 0;
    md.body.position.y = bob + (this.legLift ?? 0);
    // Au galop, le corps tangue légèrement ; à l'arrêt, le poids passe doucement d'un côté à l'autre.
    md.body.rotation.x = Math.sin(ph) * 0.05 * wGallop;
    md.body.rotation.z = moving ? 0 : Math.sin(t * 0.5) * 0.012 * this.restAmt;

    // Respiration et embonpoint.
    const breathe = Math.sin(t * (this.sleeping ? 1.2 : 2.2)) * 0.012;
    const w = this.data.weight ?? 50;
    const girth = 1 + (w - 50) / 50 * 0.22;
    md.body.scale.set(girth + breathe, 1 + (girth - 1) * 0.4 + breathe, 1);

    // Tête : regard qui se promène, balancement au pas et au galop, somnolence, broutage.
    this.doze = (this.doze ?? 0) + ((this.sleeping ? 1 : 0) - (this.doze ?? 0)) * Math.min(1, dt * 1.5);
    const look = Math.sin(t * 0.4) * 0.3 * (moving ? 0.15 : 1);
    md.head.rotation.y = look;
    const baseNeck = this.data.look.neckAngle;
    const grazing = this.state === 'idle' && !this.sleeping && Math.sin(t * 0.3 + this.phase) > 0.2;
    // Cheval réaliste (horseModel.js) : l'encolure descend jusqu'à l'herbe et la tête se met d'aplomb.
    const v3 = !!md.horseV3;
    // Brouter : le bout du nez touche l'herbe ; manger à la mangeoire : tête moins basse.
    const reach = !v3 ? 0.92 : this.state === 'eat' ? 1.2 : 1.6;
    const eat = this.state === 'eat' || (grazing && !this.herdCtrl) ? reach + Math.sin(t * 4) * 0.05 : 0;
    this.headDown = (this.headDown ?? 0) + (eat - (this.headDown ?? 0)) * Math.min(1, dt * 2.5);
    const nod = moving ? Math.sin(ph * 2) * 0.05 * wWalk + Math.sin(ph) * 0.12 * wGallop - 0.1 * wGallop : 0;
    md.neck.rotation.x = baseNeck + (sad ? 0.3 : 0) + this.headDown + this.doze * (v3 ? 0.45 : 0.6) + nod;
    // (modèle réaliste : quand l'encolure descend, la tête se redresse pour rester d'aplomb, chanfrein vertical.)
    md.head.rotation.x = (md.head.userData.baseX ??= md.head.rotation.x) + this.headDown * (v3 ? -0.5 : 0.25) - nod * 0.5 + (v3 ? this.doze * 0.15 : 0);

    // Oreilles : elles pivotent vers ce que le cheval écoute, tombent sur le côté quand il somnole.
    md.ears.forEach((e, i) => {
      const b = e.userData.base;
      if (!b) return;
      const s = i === 0 ? 1 : -1;
      const n1 = Math.sin(t * 1.3 + i * 2.1) + Math.sin(t * 0.47 + i);
      e.rotation.x = b.x + n1 * 0.08 - this.doze * 0.25;
      e.rotation.z = b.z - s * (Math.sin(t * 0.9 + i * 1.7) * 0.1 + this.doze * 0.45);
      e.rotation.y = s * Math.sin(t * 0.7 + i * 3) * 0.25 * (1 - this.doze);
    });

    // Queue : balancement, grands coups de fouet de temps en temps, relevée au galop.
    const swish = Math.sin(t * 0.23 + this.phase) > 0.9 ? Math.sin(t * 9) * 0.45 : 0;
    md.tail.rotation.z = Math.sin(t * 0.9) * 0.1 + swish + Math.sin(ph) * 0.06 * wGallop;
    // (modèle réaliste : rotation positive = queue relevée vers l'arrière.)
    const raise = (v3 ? 1 : -1) * (0.35 * wGallop + 0.1 * wTrot);
    md.tail.rotation.x = (md.tail.userData.baseX ?? 0) + raise + Math.sin(ph * 2) * 0.04 * wTrot;
    if (md.tailTip) {
      // Le bas de la queue suit avec un temps de retard (effet de fouet).
      md.tailTip.rotation.z = Math.sin(t * 0.9 - 0.7) * 0.08 + swish * 0.55;
      md.tailTip.rotation.x = 0.25 * wGallop + Math.sin(ph * 2 - 0.8) * 0.05 * (wTrot + wGallop);
    }
    // Les crins volent plus quand il court.
    if (md.hairSway) md.hairSway.value = Math.min(2.5, v * 0.5) + (Math.abs(swish) > 0.2 ? 1 : 0);
  }

  /** Animation d'un modèle GLB : clips idle/walk/run pilotés par l'état, tête baissée pour manger. */
  animateGltf(dt, sad) {
    const md = this.model;
    const sp = this.sp;
    const v = this.speed / Math.max(0.3, this.scale);
    const moving = this.speed > 0.05 && this.perch?.phase !== 'on';
    const gallop = this.speed > sp.runSpeed * 0.65;
    const grazing = sp.livestock && this.state === 'idle' && Math.sin(this.time * 0.3 + this.phase) > 0.2;
    const eat = this.state === 'eat' || (grazing && !this.herdCtrl) ? 0.9 + Math.sin(this.time * 4) * 0.06 : 0;
    this.headDown = (this.headDown ?? 0) + (eat - (this.headDown ?? 0)) * Math.min(1, dt * 3);
    md.animate(dt, { moving, gallop, v, sleeping: this.sleeping, headDown: this.headDown, sad, time: this.time });
  }

  dispose() {
    this.scene.remove(this.root);
    this.model.dispose?.();
    disposeModel(this.model.root);
    this.label.material.map.dispose();
    this.label.material.dispose();
    this.status.material.dispose();
    this.particles.forEach((s) => s.material.dispose());
  }
}
