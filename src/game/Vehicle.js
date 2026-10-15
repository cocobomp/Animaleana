// Le véhicule du voyage garé dans la cour : van + remorque, ou voiture + caisses.
// Montre les animaux chargés à l'intérieur, et repart sur la route au départ.

import * as THREE from 'three';
import { van, horseTrailer, car, crate, disposeVehicle } from './models/vehicles.js';
import { buildAnimalModel, disposeModel } from './models/animalModel.js';
import { growthScale } from '../sim/animal.js';
import { needsTrailer } from '../sim/trip.js';

// Où se garer : au milieu de la cour, l'avant vers l'est (+x).
export const PARKING = { x: 3, z: 4, heading: Math.PI / 2 };
const CRATE_COLORS = [0x3f8fd0, 0xe07a3a, 0x6b3fa0, 0x2f8a5f, 0xd0a03f];

/** Une caisse de transport à la taille de l'animal, avec l'animal dedans (on le voit à travers la grille). */
export function crateWithAnimal(a, colorIndex = 0) {
  const s = a.look.scale * growthScale(a);
  const len = (a.look.bodyLen + a.look.headLen) * s;
  const c = crate(Math.min(0.85, Math.max(0.5, len * 1.15)), CRATE_COLORS[colorIndex % CRATE_COLORS.length]);
  const model = buildAnimalModel(a.species, a.look);
  model.root.scale.setScalar(s * Math.min(1, (c.size.d * 0.8) / len));
  model.root.position.set(0, 0.03, -0.04);
  c.group.add(model.root);
  return { crate: c, model };
}

export class TripVehicle {
  /** kind : 'trailer' | 'car' ; animals : les voyageurs (pour la taille de la remorque). */
  constructor(game, kind, animals) {
    this.game = game;
    this.world = game.world;
    this.kind = kind;
    this.root = new THREE.Group();
    this.passengers = new Map(); // id -> { model, crate }
    this.colliders = [];
    this.speed = 0;
    this.driven = 0;

    const big = animals.filter(needsTrailer).length;
    if (kind === 'trailer') {
      this.main = van();
      this.trailer = horseTrailer(Math.max(1, Math.ceil(big / 2)));
      this.root.add(this.main.group, this.trailer.group);
      const gap = 0.7;
      this.trailer.group.position.z = -(this.main.length / 2 + gap + this.trailer.length / 2);
      this.trailer.ramp.rotation.x = -0.32; // rampe baissée pendant le chargement
      // Les caisses des petits animaux vont à l'arrière du van.
      this.crateSlots = [-1.6, -0.8, 0].flatMap((z) => [new THREE.Vector3(-0.45, 0.85, z), new THREE.Vector3(0.45, 0.85, z)]);
      this.rear = this.trailer.group.position.z - this.trailer.length / 2 - 1.6; // bas de la rampe
    } else {
      this.main = car();
      this.root.add(this.main.group);
      this.crateSlots = this.main.crateSlots;
      this.rear = -this.main.length / 2 - 0.8;
    }
    this.length = this.main.length + (this.trailer ? this.trailer.length + 0.7 : 0);
    this.place(PARKING.x, PARKING.z, PARKING.heading);
    game.scene.add(this.root);
  }

  /** Pose le véhicule et ajoute ses obstacles (on ne traverse pas une voiture). */
  place(x, z, heading) {
    this.removeColliders();
    this.heading = heading;
    this.root.position.set(x, this.world.heightAt(x, z), z);
    this.root.rotation.y = heading;
    const parts = [{ obj: this.main, z: 0 }];
    if (this.trailer) parts.push({ obj: this.trailer, z: this.trailer.group.position.z });
    for (const p of parts) {
      const c = this.toWorld(new THREE.Vector3(0, 0, p.z));
      const alongX = Math.abs(Math.sin(heading)) > 0.5;
      const hl = p.obj.length / 2 + 0.2;
      const hw = p.obj.width / 2 + 0.2;
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

  toWorld(local) {
    return local.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading).add(new THREE.Vector3(this.root.position.x, 0, this.root.position.z));
  }

  /** Point où amener les animaux : le bas de la rampe, ou le coffre. */
  get loadPoint() {
    return this.toWorld(new THREE.Vector3(0, 0, this.rear));
  }

  get center() {
    return this.toWorld(new THREE.Vector3(0, 0, this.trailer ? this.trailer.group.position.z / 2 : 0));
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

  /** Installe un animal dans la remorque ou dans une caisse. */
  addPassenger(a, place) {
    if (this.passengers.has(a.id)) return;
    let model;
    let crateObj = null;
    if (place === 'trailer') {
      model = buildAnimalModel(a.species, a.look);
      model.root.scale.setScalar(a.look.scale * growthScale(a));
      model.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const i = [...this.passengers.values()].filter((p) => !p.crate).length;
      model.root.position.copy(this.trailer.stalls[i % this.trailer.stalls.length]);
      this.trailer.group.add(model.root);
    } else {
      const i = [...this.passengers.values()].filter((p) => p.crate).length;
      const c = crateWithAnimal(a, i);
      crateObj = c.crate;
      model = c.model;
      const slot = this.crateSlots[i % this.crateSlots.length].clone();
      slot.y += Math.floor(i / this.crateSlots.length) * (crateObj.size.h + 0.05);
      crateObj.group.position.copy(slot);
      this.main.group.add(crateObj.group);
    }
    this.passengers.set(a.id, { model, crate: crateObj });
  }

  removePassenger(id) {
    const p = this.passengers.get(id);
    if (!p) return;
    p.model.root.parent?.remove(p.model.root);
    disposeModel(p.model.root);
    if (p.crate) {
      p.crate.group.parent?.remove(p.crate.group);
      disposeVehicle(p.crate.group);
    }
    this.passengers.delete(id);
  }

  /** Remonte la rampe : on est prêt à partir. */
  closeRamp() {
    if (this.trailer) this.trailer.ramp.rotation.x = Math.PI / 2 - 0.05;
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
    // Les roues tournent.
    this.root.traverse((o) => {
      if (o.userData.wheel) o.rotation.x += step / o.userData.wheel;
    });
    this.root.visible = this.driven < 140;
    return this.root.position;
  }

  dispose() {
    this.removeColliders();
    for (const id of [...this.passengers.keys()]) this.removePassenger(id);
    this.game.scene.remove(this.root);
    disposeVehicle(this.root);
  }
}
