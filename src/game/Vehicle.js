// Le véhicule du voyage garé dans la cour : le 4x4 et son van à chevaux, ou la voiture et ses caisses.
// - les pièces qui bougent : portière, pont (rampe), portes hautes, porte de la sellerie, barres de poitrail
//   et barres arrière, hayon, coffre de toit, couvercle du coffre de sellerie ;
// - les animaux à leur place : les grands montent le pont en marchant (avec le joueur qui les tient au
//   licol) et restent vivants dans le van (ils bougent la tête, la queue…) ; les petits dans leur caisse ;
// - le matériel du coffre de transport rangé dans la sellerie avant ou le coffre de toit ;
// - les points de vue : au volant, dans le compartiment, devant la sellerie, et la caméra du van.

import * as THREE from 'three';
import { towCar, horseTrailer, car, crate, trunk, cargoMesh, disposeVehicle } from './models/vehicles.js';
import { buildAnimalModel, disposeModel } from './models/animalModel.js';
import { growthScale, stageLook } from '../sim/animal.js';
import { needsTrailer } from '../sim/trip.js';
import { cargoItem, cargoShape } from '../sim/cargo.js';

// Où se garer : au milieu de la cour, l'avant vers l'est (+x).
export const PARKING = { x: 3, z: 4, heading: Math.PI / 2 };
const CRATE_COLORS = [0x3f8fd0, 0xe07a3a, 0x6b3fa0, 0x2f8a5f, 0xd0a03f];
const SMALL_LIVESTOCK = ['sheep', 'goat'];
const UP = new THREE.Vector3(0, 1, 0);
const CAB_LOOK = new THREE.Vector3(0, -0.05, 3); // le conducteur regarde droit devant
// Au volant, sur un téléphone en portrait (image étroite) : l'œil un peu plus haut, plus en arrière et vers le milieu
// (main.eyePortrait), on regarde presque à l'horizontale et un peu vers le milieu (yaw < 0) : le pare-brise et le
// rétroviseur intérieur remplissent le haut de l'image, le volant et le tableau de bord restent en bas.
export const CAB_PORTRAIT = { pitch: -0.05, yaw: -0.1, fov: 70 };

/** Une caisse de transport à la taille de l'animal, avec l'animal dedans (on le voit à travers la grille). */
export function crateWithAnimal(a, colorIndex = 0) {
  const s = a.look.scale * growthScale(a);
  const len = (a.look.bodyLen + a.look.headLen) * s;
  const c = crate(Math.min(0.85, Math.max(0.5, len * 1.15)), CRATE_COLORS[colorIndex % CRATE_COLORS.length]);
  const model = buildAnimalModel(a.species, travelLook(a), a.breed); // chaque espèce par son modèle (cheval de sa race, chat…)
  // (chien et chat réalistes : couchés dans leur caisse ; lapin réaliste : en boule, pattes repliées sous lui)
  model.staticPose?.(a.species === 'rabbit' ? 'loaf' : 'lie');
  model.root.scale.setScalar(s * Math.min(1, (c.size.d * 0.8) / len));
  model.root.position.set(0, 0.03, -0.04);
  c.group.add(model.root);
  return { crate: c, model };
}

/**
 * Gabarit d'un voyageur : le chiot du chien réaliste a le sien (grosse tête, pattes courtes), comme en jeu ; le chat
 * réaliste aussi (chaton : modèle du chaton ; jeune : tête un peu plus grosse), le lapin réaliste aussi (lapereau).
 */
function travelLook(a) {
  return stageLook(a);
}

/** Nombre de places de remorque pour ces animaux (deux moutons ou deux chèvres partagent une place). */
export function placesNeeded(animals) {
  const big = animals.filter((a) => needsTrailer(a) && !SMALL_LIVESTOCK.includes(a.species)).length;
  const small = animals.filter((a) => SMALL_LIVESTOCK.includes(a.species)).length;
  return big + Math.ceil(small / 2);
}

export class TripVehicle {
  /** kind : 'trailer' | 'car' ; animals : les voyageurs (pour la taille du van). */
  constructor(game, kind, animals) {
    this.game = game;
    this.world = game.world;
    this.kind = kind;
    this.root = new THREE.Group();
    this.passengers = new Map(); // id -> { entity?, model?, crate?, stall?, slot? }
    this.colliders = [];
    this.speed = 0;
    this.driven = 0;
    this.parts = []; // { obj, axis, closed, open, t (0 fermé → 1 ouvert), target }
    this.walkers = [];
    this.ropes = new Map(); // stall -> corde d'attache
    this.cargoGroup = new THREE.Group();
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.tmp3 = new THREE.Vector3();

    if (kind === 'trailer') {
      this.main = towCar();
      const rows = Math.max(1, Math.ceil(placesNeeded(animals) / 2));
      this.trailer = horseTrailer(rows);
      this.root.add(this.main.group, this.trailer.group);
      this.trailer.group.position.z = this.main.hitchZ - this.trailer.hitchZ;
      this.crateSlots = this.main.crateSlots;
      this.stallUse = this.trailer.stalls.map(() => []);
      // Pièces mobiles du van.
      const tr = this.trailer;
      this.ramp = this.part(tr.ramp, 'x', Math.PI / 2, -Math.asin(Math.min(0.95, (tr.floorY + tr.group.position.y) / tr.rampLength)));
      this.upper = tr.upperDoors.map((d) => this.part(d, 'y', 0, -d.userData.side * 4.62)); // repliées contre les flancs
      this.tackDoor = this.part(tr.tackDoor, 'y', 0, -1.75);
      this.bars = tr.bars.map((b) => {
        const axis = b.userData.open.z !== undefined ? 'z' : 'y';
        const p = this.part(b, axis, 0, b.userData.open[axis]);
        this.open(p, true, true); // au début, toutes les barres sont ouvertes
        return { ...b.userData, p };
      });
      // Le coffre de sellerie dans la sellerie avant.
      this.trunk = trunk(tr.P);
      this.trunk.group.position.copy(tr.cargo.trunk);
      tr.group.add(this.trunk.group);
      this.trunkLid = this.part(this.trunk.lid, 'x', 0, -1.9);
      tr.group.add(this.cargoGroup);
      this.setHay(false);
      this.rear = tr.group.position.z + tr.rearZ - tr.rampLength - 0.9; // devant le pont
    } else {
      this.main = car();
      this.root.add(this.main.group);
      this.crateSlots = this.main.crateSlots;
      this.tailgate = this.part(this.main.tailgate, 'x', 0, 1.75);
      this.roofLid = this.part(this.main.roofLid, 'z', 0, 1.25);
      this.main.group.add(this.cargoGroup);
      this.rear = -this.main.length / 2 - 1.0;
    }
    this.door = this.main.door ? this.part(this.main.door, 'y', 0, -1.15) : null;
    this.rearDoor = this.main.rearDoor ? this.part(this.main.rearDoor, 'y', 0, 1.7) : null;
    this.length = this.kind === 'trailer' ? this.main.length / 2 - (this.trailer.group.position.z + this.trailer.rearZ) : this.main.length;
    // Corde du licol pendant la montée.
    this.lead = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xc0392b }));
    this.lead.frustumCulled = false;
    this.lead.visible = false;
    game.scene.add(this.lead);
    this.place(PARKING.x, PARKING.z, PARKING.heading);
    game.scene.add(this.root);
    // Prêt pour le chargement : pont baissé, portes ouvertes.
    if (this.ramp) {
      this.open(this.ramp, true, true);
      for (const u of this.upper) this.open(u, true, true);
    }
  }

  // ------------------------------------------------------------ pièces mobiles

  part(obj, axis, closed, open) {
    const p = { obj, axis, closed, open, t: 0, target: 0 };
    obj.rotation[axis] = closed;
    this.parts.push(p);
    return p;
  }

  /** Ouvre (true) ou ferme une pièce ; instant : sans animation. */
  open(p, on = true, instant = false) {
    if (!p) return;
    p.target = on ? 1 : 0;
    if (instant) {
      p.t = p.target;
      p.obj.rotation[p.axis] = p.closed + (p.open - p.closed) * p.t;
    }
  }

  /** Ouvre ou ferme une pièce par son nom : 'ramp', 'upper', 'tack', 'door', 'rearDoor', 'tailgate', 'roof', 'trunk'. */
  setOpen(name, on = true) {
    const map = { ramp: [this.ramp], upper: this.upper, tack: [this.tackDoor], door: [this.door], rearDoor: [this.rearDoor], tailgate: [this.tailgate], roof: [this.roofLid], trunk: [this.trunkLid] };
    for (const p of map[name] ?? []) this.open(p, on);
  }

  isOpen(name) {
    const p = { ramp: this.ramp, tack: this.tackDoor, door: this.door, tailgate: this.tailgate, roof: this.roofLid, trunk: this.trunkLid }[name];
    return !!p && p.target === 1;
  }

  /** Remonte le pont et ferme les portes (portière du conducteur comprise) : on est prêt à partir. */
  closeRamp() {
    this.setOpen('door', false);
    this.setOpen('ramp', false);
    this.setOpen('upper', false);
    this.setOpen('tack', false);
    this.setOpen('trunk', false);
    this.setOpen('tailgate', false);
    this.setOpen('roof', false);
    this.setOpen('rearDoor', false);
  }

  // ------------------------------------------------------------ position dans la cour

  /** Pose le véhicule et ajoute ses obstacles (on ne traverse pas une voiture). */
  place(x, z, heading) {
    this.removeColliders();
    this.invTrailer = null;
    this.heading = heading;
    this.root.position.set(x, this.world.heightAt(x, z), z);
    this.root.rotation.y = heading;
    const parts = [{ len: this.main.length, w: this.main.width, z: 0 }];
    if (this.trailer) {
      const tz = this.trailer.group.position.z;
      const zr = tz + this.trailer.rearZ;
      const zf = tz + this.trailer.frontZ;
      parts.push({ len: zf - zr, w: this.trailer.width + 0.3, z: (zf + zr) / 2 });
    }
    for (const p of parts) {
      const c = this.toWorld(new THREE.Vector3(0, 0, p.z));
      const alongX = Math.abs(Math.sin(heading)) > 0.5;
      const hl = p.len / 2 + 0.15;
      const hw = p.w / 2 + 0.15;
      // equip : la caméra ne prend pas le véhicule pour un bâtiment.
      const col = { x: c.x, z: c.z, hw: alongX ? hl : hw, hd: alongX ? hw : hl, equip: true, vehicle: true };
      this.world.colliders.push(col);
      this.colliders.push(col);
    }
  }

  removeColliders() {
    if (!this.colliders.length) return;
    this.world.colliders = this.world.colliders.filter((c) => !this.colliders.includes(c));
    this.colliders = [];
  }

  /** Point du véhicule (repère du véhicule) → monde (au sol). */
  toWorld(local, out = new THREE.Vector3()) {
    return out.copy(local).applyAxisAngle(UP, this.heading).add(this.root.position).setY(0);
  }

  /** Point de la remorque (repère de la remorque) → monde, avec la hauteur. */
  trailerToWorld(local, out = new THREE.Vector3()) {
    this.trailer.group.updateWorldMatrix(true, false);
    return out.copy(local).applyMatrix4(this.trailer.group.matrixWorld);
  }

  /** Point où amener les animaux : le bas du pont, ou derrière la voiture. */
  get loadPoint() {
    return this.toWorld(new THREE.Vector3(0, 0, this.rear));
  }

  get center() {
    return this.toWorld(new THREE.Vector3(0, 0, this.trailer ? (this.trailer.group.position.z + this.trailer.rearZ + this.main.length / 2) / 2 : 0));
  }

  /** La portière du conducteur (pour monter au volant), au sol. */
  get driverPoint() {
    return this.toWorld(new THREE.Vector3(this.main.width / 2 + 0.9, 0, 0.3));
  }

  /** Devant la sellerie avant (ou à côté du coffre de toit). */
  get tackPoint() {
    if (this.trailer) return this.toWorld(new THREE.Vector3(this.trailer.width / 2 + 0.9, 0, this.trailer.group.position.z + 1.6));
    return this.toWorld(new THREE.Vector3(this.main.width / 2 + 0.9, 0, -0.9));
  }

  /** Distance (au sol) d'un point au véhicule, 0 si on est dessus. */
  distanceTo(p) {
    let best = Infinity;
    for (const c of this.colliders) {
      const dx = Math.max(0, Math.abs(p.x - c.x) - c.hw);
      const dz = Math.max(0, Math.abs(p.z - c.z) - c.hd);
      best = Math.min(best, Math.hypot(dx, dz));
    }
    return best;
  }

  /** Les objets qu'on peut toucher pour charger. */
  get pickables() {
    return [this.root];
  }

  /** Quelle partie du véhicule a été touchée : 'cab', 'tack', 'trailer' ou 'boot'. */
  partAt(object) {
    let o = object;
    while (o && o !== this.root) {
      if (o === this.main.group) return 'cab';
      if (this.trailer && o === this.trailer.group) return 'trailer';
      o = o.parent;
    }
    return 'cab';
  }

  // ------------------------------------------------------------ places dans le van

  /** Une place libre pour cet animal (deux moutons par place), ou -1. */
  freeStall(a) {
    if (!this.trailer) return -1;
    const small = SMALL_LIVESTOCK.includes(a.species);
    return this.stallUse.findIndex((ids) => ids.length === 0 || (small && ids.length === 1 && SMALL_LIVESTOCK.includes(this.speciesOf(ids[0]))));
  }

  speciesOf(id) {
    return this.game.profile?.animals.find((x) => x.id === id)?.species;
  }

  /** Position (repère de la remorque) d'un animal à sa place : le poitrail juste derrière la barre de poitrail. */
  stallPose(i, a, scale) {
    const st = this.trailer.stalls[i];
    const half = (a.look.bodyLen * scale) / 2;
    const slot = this.stallUse[i].indexOf(a.id);
    const back = SMALL_LIVESTOCK.includes(a.species) && slot === 1 ? 0.95 : 0;
    return new THREE.Vector3(st.x, st.y, st.zFront - half - 0.14 - back);
  }

  /** Les points du chemin (monde) pour monter jusqu'à la place i : derrière le van, bas du pont, haut du pont, la place. */
  walkPath(i, a, scale) {
    const tr = this.trailer;
    const st = tr.stalls[i];
    const foot = tr.rearZ - tr.rampLength;
    return [
      this.trailerToWorld(new THREE.Vector3(st.x * 0.6, 0, foot - 1.4)),
      this.trailerToWorld(new THREE.Vector3(st.x, 0, foot - 0.25)),
      this.trailerToWorld(new THREE.Vector3(st.x, tr.floorY, tr.rearZ + 0.35)),
      this.trailerToWorld(this.stallPose(i, a, scale)),
    ].map((p) => p.setY(0));
  }

  /** Hauteur du sol à cet endroit : la terre, le pont en pente, ou le plancher du van. */
  floorAt(p) {
    const ground = this.world.heightAt(p.x, p.z);
    if (!this.trailer || this.ramp.t < 0.9) return ground;
    const tr = this.trailer;
    if (!this.invTrailer) {
      tr.group.updateWorldMatrix(true, false);
      this.invTrailer = tr.group.matrixWorld.clone().invert(); // le van ne bouge pas pendant le chargement
    }
    const local = this.tmp2.copy(p).applyMatrix4(this.invTrailer);
    if (Math.abs(local.x) > tr.width / 2) return ground;
    const floor = tr.group.position.y + this.root.position.y + tr.floorY;
    if (local.z >= tr.rearZ) return local.z <= tr.frontZ ? floor : ground;
    const foot = tr.rearZ - tr.rampLength * Math.cos(Math.asin(Math.min(0.95, tr.floorY / tr.rampLength)));
    if (local.z <= foot) return ground;
    return ground + (floor - ground) * ((local.z - foot) / (tr.rearZ - foot));
  }

  /**
   * Fait monter un animal (AnimalEntity) le long du pont jusqu'à sa place, le joueur à côté de lui.
   * o : { hesitate (il s'arrête au bas du pont), onHesitate(), onDone(), player }
   */
  walkIn(e, i, o = {}) {
    const a = e.data;
    this.stallUse[i].push(a.id);
    e.scripted = true;
    a.following = false;
    const w = { e, i, a, path: this.walkPath(i, a, e.scale), step: 0, wait: 0, ...o, paused: false, backoff: 0 };
    this.walkers.push(w);
    if (w.player) {
      w.player.scripted = true;
      this.lead.visible = true;
    }
    return w;
  }

  /** Après l'avoir rassuré : il repart vers sa place. */
  resumeWalk(w) {
    if (!w) return;
    w.paused = false;
    w.hesitate = false;
  }

  /** On abandonne la montée : l'animal redescend et nous suit de nouveau. */
  abortWalk(w) {
    if (!w) return;
    this.walkers = this.walkers.filter((x) => x !== w);
    this.stallUse[w.i] = this.stallUse[w.i].filter((id) => id !== w.a.id);
    w.e.scripted = false;
    w.e.speed = 0;
    w.a.following = true;
    if (w.player) w.player.scripted = false;
    this.lead.visible = false;
  }

  updateWalkers(dt) {
    for (const w of [...this.walkers]) {
      const e = w.e;
      const p = e.position;
      if (w.paused) {
        // Il hésite : il recule d'un pas, la tête haute, puis attend.
        e.speed = w.backoff > 0 ? 0.45 : 0;
        if (w.backoff > 0) {
          w.backoff -= dt;
          p.x -= Math.sin(e.heading) * 0.45 * dt;
          p.z -= Math.cos(e.heading) * 0.45 * dt;
        }
        p.y = this.floorAt(p);
        this.followHandler(w, dt, 0);
        continue;
      }
      const target = w.path[w.step];
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const d = Math.hypot(dx, dz);
      const speed = e.sp.walkSpeed * (w.step >= 2 ? 0.7 : 0.9);
      if (d < 0.08 + speed * dt) {
        w.step += 1;
        if (w.step === 2 && w.hesitate) {
          // Au bas du pont : un cheval peu confiant s'arrête.
          w.paused = true;
          w.backoff = 0.9;
          e.emit('❓', 2);
          w.onHesitate?.(w);
          continue;
        }
        if (w.step >= w.path.length) {
          this.finishWalk(w);
          continue;
        }
        continue;
      }
      const want = Math.atan2(dx, dz);
      let diff = want - e.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      e.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 3);
      const move = Math.min(d, speed * dt);
      e.speed = speed;
      p.x += Math.sin(e.heading) * move;
      p.z += Math.cos(e.heading) * move;
      p.y = this.floorAt(p);
      e.root.rotation.y = e.heading;
      this.followHandler(w, dt, speed);
    }
  }

  /** Le joueur marche à côté de l'animal (de l'autre côté de la séparation), la longe à la main. */
  followHandler(w, dt, speed) {
    const pl = w.player;
    if (!pl) return;
    const e = w.e;
    const side = w.step >= 2 ? -Math.sign(this.trailer.stalls[w.i].x || 1) : 1;
    const h = e.heading;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    // À l'épaule de l'animal, un peu en avant ; dans le van, le joueur s'arrête en haut du pont.
    const inside = w.step >= 3;
    const want = inside ? this.trailerToWorld(this.tmp.set(-this.trailer.stalls[w.i].x, 0, this.trailer.rearZ + 0.2), this.tmp3).setY(0)
      : this.tmp3.set(e.position.x + fx * 0.9 + fz * 0.85 * side, 0, e.position.z + fz * 0.9 - fx * 0.85 * side);
    const pp = pl.root.position;
    const dx = want.x - pp.x;
    const dz = want.z - pp.z;
    const d = Math.hypot(dx, dz);
    const sp = Math.min(d / Math.max(dt, 1e-3), Math.max(speed, d > 0.3 ? 2.2 : 0));
    if (d > 0.01) {
      pp.x += (dx / d) * Math.min(d, sp * dt);
      pp.z += (dz / d) * Math.min(d, sp * dt);
      pl.heading = d > 0.05 ? Math.atan2(dx, dz) : h;
    }
    pl.speed = d > 0.05 ? Math.min(3.2, sp) : 0;
    pp.y = this.floorAt(pp);
    pl.root.rotation.y = pl.heading;
    // Corde du licol : de la main du joueur à la tête de l'animal.
    const head = e.model.head ?? e.model.root;
    const pos = this.lead.geometry.attributes.position;
    const hand = this.tmp.set(pp.x + Math.cos(pl.heading) * -0.25 * side, pp.y + 1.0, pp.z - Math.sin(pl.heading) * -0.25 * side);
    pos.setXYZ(0, hand.x, hand.y, hand.z);
    head.getWorldPosition(this.tmp);
    const hy = this.tmp.y - 0.15;
    pos.setXYZ(2, this.tmp.x, hy, this.tmp.z);
    pos.setXYZ(1, (hand.x + this.tmp.x) / 2, Math.min(hand.y, hy) - 0.25, (hand.z + this.tmp.z) / 2);
    pos.needsUpdate = true;
  }

  finishWalk(w) {
    this.walkers = this.walkers.filter((x) => x !== w);
    this.lead.visible = false;
    this.boardEntity(w.e, w.i);
    if (w.player) {
      w.player.scripted = false;
      w.player.speed = 0;
      // Le joueur redescend le pont.
      const foot = this.loadPoint;
      this.game.walkTo(foot, 0.6, null);
    }
    w.onDone?.(w);
  }

  /** L'animal reste à sa place dans le van, vivant (il bouge la tête, les oreilles, la queue). */
  boardEntity(e, i) {
    const a = e.data;
    if (!this.stallUse[i].includes(a.id)) this.stallUse[i].push(a.id);
    e.scripted = true;
    e.speed = 0;
    a.following = false;
    this.trailer.group.add(e.root);
    e.root.position.copy(this.stallPose(i, a, e.scale));
    e.heading = 0;
    e.root.rotation.set(0, 0, 0);
    this.passengers.set(a.id, { entity: e, stall: i });
  }

  /** Installe un petit animal dans sa caisse (coffre, banquette). */
  addCrate(a) {
    if (this.passengers.has(a.id)) return;
    const i = [...this.passengers.values()].filter((p) => p.crate).length;
    const c = crateWithAnimal(a, i);
    const slot = this.crateSlots[i % this.crateSlots.length].clone();
    slot.y += Math.floor(i / this.crateSlots.length) * (c.crate.size.h + 0.05);
    c.crate.group.position.copy(slot);
    this.main.group.add(c.crate.group);
    this.passengers.set(a.id, { model: c.model, crate: c.crate });
  }

  /** Compatibilité : installe un passager sans animation (place 'trailer' ou 'crate'). */
  addPassenger(a, place) {
    if (place === 'crate' || !this.trailer) return this.addCrate(a);
    const i = this.freeStall(a);
    if (i < 0) return this.addCrate(a);
    const model = buildAnimalModel(a.species, travelLook(a), a.breed); // chaque espèce par son modèle (cheval de sa race, chat…)
    const s = a.look.scale * growthScale(a);
    model.root.scale.setScalar(s);
    this.stallUse[i].push(a.id);
    model.root.position.copy(this.stallPose(i, a, s));
    this.trailer.group.add(model.root);
    this.passengers.set(a.id, { model, stall: i });
    return null;
  }

  removePassenger(id) {
    const p = this.passengers.get(id);
    if (!p) return;
    if (p.entity) {
      p.entity.root.parent?.remove(p.entity.root);
      p.entity.dispose();
    } else {
      p.model.root.parent?.remove(p.model.root);
      p.model.dispose?.();
      disposeModel(p.model.root);
    }
    if (p.crate) {
      p.crate.group.parent?.remove(p.crate.group);
      disposeVehicle(p.crate.group);
    }
    if (p.stall !== undefined) {
      this.stallUse[p.stall] = this.stallUse[p.stall].filter((x) => x !== id);
      this.showStall(p.stall, { breastBar: false, rearBar: false, tie: false });
    }
    this.passengers.delete(id);
  }

  /** Barres et corde d'attache d'une place (état venant de sim/loading.js). */
  showStall(i, st) {
    if (!this.trailer) return;
    const s = this.trailer.stalls[i];
    for (const b of this.bars) {
      if (b.row !== s.row || b.side !== s.side) continue;
      this.open(b.p, !st[b.kind]);
    }
    const rope = this.ropes.get(i);
    if (st.tie && !rope) {
      const ring = this.trailer.tieRings[i];
      const a = this.passengerAt(i);
      const scale = a ? a.look.scale * growthScale(a) : 1;
      const head = new THREE.Vector3(s.x * 0.75, s.y + 1.45 * scale, s.zFront + 0.2);
      const mid = ring.clone().lerp(head, 0.5);
      mid.y -= 0.12;
      const geo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(ring.clone(), mid, head), 10, 0.012, 5, false);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8 }));
      this.trailer.group.add(m);
      this.ropes.set(i, m);
    } else if (!st.tie && rope) {
      rope.parent.remove(rope);
      rope.geometry.dispose();
      rope.material.dispose();
      this.ropes.delete(i);
    }
  }

  passengerAt(i) {
    const id = this.stallUse[i]?.[0];
    return id ? this.game.profile?.animals.find((x) => x.id === id) ?? null : null;
  }

  /** Vue en coupe : on cache le flanc gauche et le toit du van pour voir dedans (compartiment, sellerie). */
  setCutaway(on, tack = false) {
    if (!this.trailer) return;
    for (const m of this.trailer.cutaway) m.visible = !on;
    for (const m of this.trailer.cutTack) m.visible = !(on && tack);
  }

  /** Filets à foin garnis (foin dans le coffre) ou vides. */
  setHay(on) {
    if (!this.trailer) return;
    for (const net of this.trailer.hayNets) {
      net.children[0].visible = on;
      net.children[1].scale.set(on ? 1.05 : 0.5, on ? 1.25 : 1.4, on ? 0.8 : 0.3);
    }
  }

  // ------------------------------------------------------------ matériel du coffre

  /** Range le matériel emporté à sa place : selles sur les porte-selles, filets aux crochets, le reste dans le coffre. */
  setCargo(items) {
    for (const c of [...this.cargoGroup.children]) {
      this.cargoGroup.remove(c);
      disposeVehicle(c);
    }
    const P = this.main.P;
    const list = [];
    // (l'équipement est rangé par modèle et par taille : on dessine sa forme — une selle, un filet… — src/sim/cargo.js)
    for (const [key, n] of Object.entries(items ?? {})) for (let k = 0; k < n; k++) list.push(cargoShape(key));
    const emoji = (id) => cargoItem(id)?.emoji ?? '📦';
    const put = (id, pos, scale = 1, yaw = 0) => {
      const m = cargoMesh(id, P, { emoji: emoji(id), color: id === 'halter' ? 0xc0392b : 0x23395d });
      m.position.copy(pos);
      m.rotation.y = yaw;
      m.scale.setScalar(scale);
      this.cargoGroup.add(m);
    };
    if (this.trailer) {
      const spots = this.trailer.cargo;
      let rack = 0;
      let hook = 0;
      let floor = 0;
      let cell = 0;
      const cells = this.trunk.cells;
      for (const id of list) {
        if (id === 'saddle' && rack < spots.rack.length) put(id, spots.rack[rack++], 0.85, Math.PI / 2);
        else if ((id === 'bridle' || id === 'halter') && hook < spots.hooks.length) put(id, spots.hooks[hook++], 1);
        else if (['hay', 'water', 'bowls', 'blanket'].includes(id) && floor < spots.floor.length) put(id, spots.floor[floor++], 0.7, 0.3);
        else if (cell < cells.length) {
          const p = cells[cell++].clone().add(this.trunk.group.position);
          put(id, p, id === 'firstAid' ? 0.6 : 1);
        }
      }
      this.setHay(list.includes('hay'));
    } else {
      // Voiture : tout va dans le coffre de toit, bien rangé.
      const base = this.main.cargo.roof;
      // (4 objets dans la longueur du coffre, sur 2 rangées ; les gros objets un peu plus petits)
      list.slice(0, 8).forEach((id, k) => {
        const col = k % 4;
        const row = Math.floor(k / 4);
        const big = ['saddle', 'hay', 'water', 'blanket'].includes(id);
        put(id, new THREE.Vector3(base.x - 0.19 + row * 0.38, base.y - 0.15, base.z - 0.6 + col * 0.4), big ? 0.55 : 0.95, big ? Math.PI / 2 : 0);
      });
    }
  }

  // ------------------------------------------------------------ points de vue

  /**
   * Caméra pour une vue : 'cab' (au volant), 'stall' (dans le compartiment), 'tack' (sellerie ou coffre de toit),
   * 'boot' (coffre de la voiture), 'camera' (caméra du van). Renvoie { pos, look } dans le monde.
   */
  view(kind, out = this.pose ?? (this.pose = { pos: new THREE.Vector3(), look: new THREE.Vector3() }), portrait = false) {
    // (renvoie toujours le même objet : rien n'est créé à chaque image)
    if (kind === 'cab') {
      const m = this.main.group;
      m.updateWorldMatrix(true, false);
      const eye = this.cabEye(this.tmp2, portrait);
      out.pos.copy(eye).applyMatrix4(m.matrixWorld);
      out.look.copy(eye).add(CAB_LOOK).applyMatrix4(m.matrixWorld);
      return out;
    }
    const src = this.trailer ?? this.main;
    const v = src.views?.[kind] ?? src.views?.tack;
    src.group.updateWorldMatrix(true, false);
    out.pos.copy(v.pos).applyMatrix4(src.group.matrixWorld);
    out.look.copy(v.look).applyMatrix4(src.group.matrixWorld);
    return out;
  }

  /** L'œil du conducteur (repère du véhicule), un peu déplacé en portrait (voir CAB_PORTRAIT). */
  cabEye(out, portrait = false) {
    return out.copy((portrait && this.main.eyePortrait) || this.main.eye);
  }

  /** Regard de départ au volant (yaw, pitch), selon l'écran (portrait ou non) ; pitchWide : celui d'un écran large. */
  cabLook(portrait, pitchWide) {
    return portrait ? { yaw: this.main.yawPortrait ?? CAB_PORTRAIT.yaw, pitch: CAB_PORTRAIT.pitch } : { yaw: 0, pitch: pitchWide };
  }

  // ------------------------------------------------------------ chaque image

  /** Anime les pièces mobiles, les animaux qui montent et ceux qui sont déjà à bord. */
  update(dt) {
    for (const p of this.parts) {
      if (p.t === p.target) continue;
      const step = dt * 1.6;
      p.t = p.target > p.t ? Math.min(p.target, p.t + step) : Math.max(p.target, p.t - step);
      const k = p.t * p.t * (3 - 2 * p.t);
      p.obj.rotation[p.axis] = p.closed + (p.open - p.closed) * k;
    }
    this.updateWalkers(dt);
    const g = this.game;
    if (!this.ctx) this.ctx = { playerPos: g.player.position, night: false, entities: [], game: g };
    this.ctx.playerPos = g.player.position;
    for (const p of this.passengers.values()) {
      if (!p.entity) continue;
      p.entity.speed = 0;
      p.entity.update(dt, this.ctx);
    }
    for (const w of this.walkers) {
      // Pendant la montée, l'animal est encore dans la cour : Game le met à jour avec les autres.
      if (!g.entities.has(w.a.id)) w.e.update(dt, this.ctx);
    }
  }

  /** Le véhicule s'en va sur la route. Renvoie sa position (pour la caméra). */
  drive(dt) {
    this.removeColliders();
    this.speed = Math.min(9, this.speed + dt * 2.2);
    const step = this.speed * dt;
    this.driven += step;
    const dir = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.root.position.addScaledVector(dir, step);
    this.root.position.y = this.world.heightAt(this.root.position.x, this.root.position.z);
    this.spinWheels(step);
    this.root.visible = this.driven < 140;
    return this.root.position;
  }

  /** Les roues tournent (avancée de `step` mètres). */
  spinWheels(step) {
    if (!this.wheels) {
      this.wheels = [];
      this.root.traverse((o) => { if (o.userData.wheel) this.wheels.push(o); });
    }
    for (const w of this.wheels) w.rotation.x += step / w.userData.wheel;
  }

  dispose() {
    this.removeColliders();
    for (const w of this.walkers) this.abortWalk(w);
    for (const id of [...this.passengers.keys()]) this.removePassenger(id);
    for (const r of this.ropes.values()) {
      r.geometry.dispose();
      r.material.dispose();
    }
    this.ropes.clear();
    this.root.parent?.remove(this.root);
    disposeVehicle(this.root);
    this.lead.parent?.remove(this.lead);
    this.lead.geometry.dispose();
    this.lead.material.dispose();
  }
}
