// Conduite du troupeau : un chien (ou le berger) passe derrière les moutons, chèvres et vaches
// pour les ramener à la bergerie ou les emmener au pré.

import * as THREE from 'three';
import { PEN, FIELD, inPen } from './AnimalEntity.js';

export class Herding {
  constructor(game) {
    this.game = game;
    this.active = null;
  }

  flock() {
    return [...this.game.entities.values()].filter((e) => e.sp.livestock);
  }

  /** dest : 'pen' (bergerie) ou 'field' (pré). pusher : chien (AnimalEntity) ou berger (HelperEntity). */
  start(dest, pusher) {
    const flock = this.flock();
    if (!flock.length || !pusher) return false;
    this.stop(false);
    this.active = { dest, pusher, flock, time: 0, sweep: Math.random() * 6 };
    for (const e of flock) {
      e.data.following = false;
      e.sleeping = false;
      e.herdCtrl = { from: pusher.position, goal: new THREE.Vector3(), center: new THREE.Vector3() };
    }
    if (pusher.data.species) {
      pusher.data.following = false;
      pusher.herdCtrl = { pusher: true, target: new THREE.Vector3() };
    }
    return true;
  }

  arrived(e, dest) {
    const p = e.position;
    if (dest === 'pen') return inPen(p.x, p.z, 1.5);
    return Math.hypot(p.x - FIELD.x, p.z - FIELD.z) < FIELD.r;
  }

  update(dt) {
    const h = this.active;
    if (!h) return;
    h.time += dt;
    const flock = h.flock.filter((e) => this.game.entities.has(e.data.id));
    if (!flock.length) {
      this.stop(false);
      return;
    }
    const center = new THREE.Vector3();
    flock.forEach((e) => center.add(e.position));
    center.divideScalar(flock.length);
    const spread = Math.max(2, ...flock.map((e) => e.position.distanceTo(center)));
    const dest = h.dest === 'pen' ? new THREE.Vector3(PEN.x, 0, PEN.z) : new THREE.Vector3(FIELD.x, 0, FIELD.z);

    for (const e of flock) {
      const c = e.herdCtrl;
      if (!c) continue;
      c.from = h.pusher.position;
      c.center.copy(center);
      c.goal.copy(e.navTarget(dest));
      if (this.arrived(e, h.dest)) {
        c.goal.copy(e.position);
      }
    }

    // Le chien se place derrière le troupeau, à l'opposé du but, en balayant de gauche à droite.
    const lead = flock[0].navTarget(dest).clone();
    const back = center.clone().sub(lead).setY(0);
    if (back.lengthSq() < 0.01) back.set(0, 0, 1);
    back.normalize();
    const side = new THREE.Vector3(-back.z, 0, back.x);
    const spot = center.clone()
      .addScaledVector(back, spread + 3.5)
      .addScaledVector(side, Math.sin(h.time * 1.3 + h.sweep) * Math.min(6, spread + 1.5));
    // Si le troupeau est dans l'enclos, le chien reste dedans (pas derrière la clôture).
    if (inPen(center.x, center.z)) {
      spot.x = Math.max(PEN.x - 9, Math.min(PEN.x + 9, spot.x));
      spot.z = Math.max(PEN.z - 6, Math.min(PEN.z + 6, spot.z));
    }
    if (h.pusher.herdCtrl?.pusher) h.pusher.herdCtrl.target.copy(spot);
    else h.pusher.forced = spot;

    if (flock.every((e) => this.arrived(e, h.dest))) this.stop(true);
    else if (h.time > 90) this.stop(true);
  }

  stop(success) {
    const h = this.active;
    if (!h) return;
    this.active = null;
    for (const e of h.flock) {
      e.herdCtrl = null;
      e.state = 'idle';
      e.timer = 1 + Math.random() * 3;
      if (success) e.data.zone = h.dest;
    }
    if (h.pusher.herdCtrl) h.pusher.herdCtrl = null;
    h.pusher.forced = null;
    if (success) this.game.herdingDone(h.dest, h.pusher);
  }
}
