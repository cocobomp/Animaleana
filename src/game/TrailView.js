// Le voyage à cheval en temps réel : on chevauche son cheval sur un chemin de terre, à travers le paysage du pays
// de départ puis de celui d'arrivée (le même décor que la route du voyage en voiture, src/game/RoadView.js), avec
// les autres animaux du voyage qui suivent derrière. On choisit son allure (pas, trot, galop : src/sim/trip.js,
// RIDE_GAITS) avec les boutons de la fiche du trajet ou les flèches ↑ ↓ ; le galop fait arriver plus vite mais
// fatigue le cheval. Aux pauses, le cheval s'arrête près d'un abreuvoir (l'écurie d'étape le soir).
//
// Le cheval, le cavalier et les animaux qui suivent sont les vrais (ceux de la ferme) : ils passent dans cette
// scène le temps du trajet, posés sur un sol plat (FLAT), puis reviennent à leur place (detachCarrier). À l'arrivée,
// le lieu est rechargé de toute façon (Game.travel).

import * as THREE from 'three';
import { RoadView } from './RoadView.js';
import { RIDE_GAITS, RIDE_GAIT_ORDER, rideGait } from '../sim/trip.js';

/** Le sol du chemin : plat, sans eau ni mur (ce que les animations des animaux demandent au monde). */
const FLAT = {
  heightAt: () => 0,
  isWater: () => false,
  resolveCollisions: () => {},
  insideBuilding: () => false,
  fences: [],
  structureHomes: [],
  stallOf: () => null,
  petHouse: null,
};

const SIDE = -1; // l'aire de pause est à droite du chemin (comme sur la route)
const portrait = () => window.innerWidth < window.innerHeight;

export class TrailView extends RoadView {
  /** horse : l'entité du cheval monté ; followers : les entités des autres animaux du voyage. */
  constructor(game, trip, { horse, followers = [] }) {
    super(game, null, trip, { trail: true, horse, followers });
  }

  /** Le cavalier sur son cheval, au milieu du chemin, et les autres en file derrière. */
  attachCarrier() {
    const g = this.game;
    const pl = g.player;
    const { horse, followers = [] } = this.opts;
    this.horse = horse;
    this.followers = followers.filter(Boolean);
    this.accel = 1.4; // (un cheval change d'allure plus vite qu'une voiture ne prend de la vitesse)
    this.saved = [];
    this.savedPlayer = {
      parent: pl.root.parent,
      pos: pl.root.position.clone(),
      rot: pl.root.rotation.clone(),
      heading: pl.heading,
      speed: pl.speed,
      visible: pl.root.visible,
      avatarVisible: pl.avatar.root.visible,
    };
    const keep = (e) => this.saved.push({
      e, parent: e.root.parent, pos: e.root.position.clone(), rot: e.root.rotation.clone(), world: e.world,
      heading: e.heading, speed: e.speed, visible: e.root.visible,
    });
    const place = (e, x, z) => {
      keep(e);
      e.world = FLAT;
      e.sleeping = false;
      e.wish = null; // (pas de bulle « il te demande » sur le chemin : la ferme attend, rien ne la ferait éclater)
      e.updateStatus?.();
      e.heading = 0;
      e.speed = 0;
      e.root.position.set(x, 0, z);
      e.root.rotation.set(0, 0, 0);
      e.root.visible = true;
      this.scene.add(e.root);
    };
    place(horse, 0, 0);
    // En selle (on monte s'il le faut : le voyage est « à cheval »), avec sa bombe (Game.mountRider).
    if (pl.mount !== horse) {
      if (pl.mount) pl.dismount();
      g.mountRider(horse);
    }
    pl.root.position.set(0, 0, 0);
    pl.root.rotation.set(0, 0, 0);
    pl.heading = 0;
    pl.root.visible = true;
    pl.avatar.root.visible = true;
    this.scene.add(pl.root);
    pl.seat(); // (remesuré ici : le cheval est maintenant au milieu du chemin)
    // Les autres suivent en file derrière le cheval, en quinconce (on les voit de la caméra « derrière »).
    let z = -(horse.radius ?? 1.2) - 0.6;
    this.followers.forEach((e, i) => {
      const r = e.radius ?? 0.5;
      z -= r + 0.5;
      place(e, (i % 2 ? 1 : -1) * Math.min(0.9, 0.35 + r * 0.4), z);
      e.trailZ = z;
      z -= r;
    });
    this.gaitHeld = 0;
  }

  /** Vitesse du cheval selon l'allure choisie (0 pendant une pause). */
  wantedSpeed(speedMul) {
    return speedMul > 0 ? RIDE_GAITS[rideGait(this.trip) ?? 'trot'].speed : 0;
  }

  /**
   * Une image : le cheval et ceux qui suivent marchent à la vitesse du chemin, le cavalier suit le dos du cheval,
   * les sabots résonnent. Flèche ↑ / ↓ (ou W / S, Z / S) : allure plus vive ou plus calme.
   */
  updateCarrier(dt, step, ctrl, flow) {
    const g = this.game;
    const pl = g.player;
    const h = this.horse;
    this.gaitKeys(ctrl, flow, dt);
    h.speed = this.speed;
    h.heading = 0;
    h.root.position.x = 0;
    h.root.position.z = 0;
    h.root.rotation.y = 0;
    h.animate(dt, false);
    pl.speed = this.speed;
    pl.heading = 0;
    pl.lateUpdate(dt);
    // Les sabots : un bruit à chaque demi-foulée.
    const k = Math.floor((pl.ridePh ?? h.phase ?? 0) / Math.PI);
    if (k !== this.hoofK) {
      if (this.hoofK !== undefined && this.speed > 0.6) g.audio?.step?.('hoof', this.speed > 5);
      this.hoofK = k;
    }
    for (const e of this.followers) {
      // (un petit animal court un peu plus vite que le cheval pour rester à sa place : même vitesse au sol)
      e.speed = this.speed;
      e.heading = 0;
      e.root.position.z = e.trailZ;
      e.root.rotation.y = 0;
      e.animate(dt, false);
    }
  }

  /** Flèches ↑ ↓ : un appui = une allure de plus ou de moins (on peut garder la touche : une allure par demi-seconde). */
  gaitKeys(ctrl, flow, dt) {
    const y = ctrl?.move?.y ?? 0;
    const dir = y > 0.5 ? 1 : y < -0.5 ? -1 : 0;
    if (!dir) {
      this.gaitHeld = 0;
      return;
    }
    this.gaitHeld -= dt;
    if (this.gaitHeld > 0) return;
    this.gaitHeld = 0.5;
    const order = RIDE_GAIT_ORDER;
    const i = order.indexOf(rideGait(this.trip) ?? 'trot');
    const next = order[Math.max(0, Math.min(order.length - 1, i + dir))];
    if (next !== order[i]) flow?.setGait?.(next);
  }

  /** L'aire de pause du chemin : un abreuvoir, une barre d'attache, un arbre ; l'écurie d'étape le soir. */
  buildRestArea() {
    const g = new THREE.Group();
    const m = (c, extra = {}) => this.track(new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...extra }));
    const add = (geo, mat, x, y, z, parent = g) => {
      const o = new THREE.Mesh(this.track(geo), mat);
      o.position.set(x * SIDE, y, z);
      parent.add(o);
      return o;
    };
    const wood = m(0x8a6a44);
    // Un coin d'herbe tassée, l'abreuvoir en pierre et son eau.
    add(new THREE.CircleGeometry(7, 20).rotateX(-Math.PI / 2), m(0x8f8a5a, { roughness: 1 }), 7.5, 0.012, 1);
    add(new THREE.BoxGeometry(0.7, 0.55, 2.2), m(0x9a978e), 4.2, 0.28, 2);
    add(new THREE.PlaneGeometry(0.5, 2).rotateX(-Math.PI / 2), m(0x5a8fb0, { roughness: 0.15, metalness: 0.1 }), 4.2, 0.56, 2);
    // La barre d'attache (deux poteaux, une barre).
    for (const z of [-3.5, -1]) add(new THREE.CylinderGeometry(0.07, 0.08, 1.2, 8), wood, 3.4, 0.6, z);
    const bar = add(new THREE.CylinderGeometry(0.05, 0.05, 2.7, 8), wood, 3.4, 1.05, -2.25);
    bar.rotation.x = Math.PI / 2;
    // Un grand arbre pour l'ombre, une botte de foin.
    add(new THREE.CylinderGeometry(0.22, 0.32, 3.2, 7), m(0x6b4a2f), 9, 1.6, -1);
    add(new THREE.IcosahedronGeometry(2.6, 0), m(0x3f6f2e, { flatShading: true }), 9, 4.4, -1);
    add(new THREE.BoxGeometry(1, 0.55, 0.6), m(0xd8b860, { roughness: 1 }), 6, 0.28, 4.2);
    // L'écurie d'étape (le soir).
    const stable = new THREE.Group();
    add(new THREE.BoxGeometry(8, 3, 5), m(0xc9a77a), 14, 1.5, 0, stable);
    const roof = add(new THREE.ConeGeometry(5.6, 2, 4, 1).rotateY(Math.PI / 4), m(0x8a3a2a), 14, 4, 0, stable);
    roof.scale.set(1.05, 1, 0.68);
    add(new THREE.BoxGeometry(0.1, 0.4, 0.3), m(0xffe2a0, { emissive: 0xffc860, emissiveIntensity: 1.5 }), 9.95, 2.4, 0, stable);
    for (const z of [-1.4, 1.4]) add(new THREE.BoxGeometry(0.08, 2, 1.2), m(0x5a3a22), 9.97, 1, z, stable);
    g.add(stable);
    g.userData.stable = stable;
    g.visible = false;
    return g;
  }

  /**
   * Caméra : derrière le cavalier (un peu de côté et au-dessus : on voit le cheval, le chemin et ceux qui suivent),
   * en selle (entre les oreilles du cheval, on tourne la tête en faisant glisser), ou autour (elle tourne doucement).
   */
  updateCamera(dt, ctrl) {
    const cam = this.camera;
    const pl = this.game.player;
    if (cam.aspect !== window.innerWidth / window.innerHeight) {
      cam.aspect = window.innerWidth / window.innerHeight;
      cam.updateProjectionMatrix();
    }
    const dx = ctrl?.look?.dx ?? 0;
    const dy = ctrl?.look?.dy ?? 0;
    const tall = portrait();
    // (en selle, la tête du cavalier cacherait tout : on ne la voit pas)
    pl.avatar.root.visible = this.cameraMode !== 'rider';
    if (this.cameraMode === 'rider') {
      this.yaw = THREE.MathUtils.clamp(this.yaw - dx * 0.006, -2.2, 2.2);
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.004, -0.7, 0.5);
      const bob = Math.sin((pl.ridePh ?? 0) * 2) * 0.03 * Math.min(1, this.speed / 3);
      cam.position.set(0, pl.eyeHeight + bob, 0.15);
      const dir = this.v1.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
      this.lookAt.copy(cam.position).add(dir);
      cam.fov = tall ? 72 : 66;
    } else if (this.cameraMode === 'side') {
      this.orbit += dt * 0.08 - dx * 0.006;
      const far = tall ? 1.5 : 1;
      const r = 8.5 * far;
      const len = this.followers.length ? Math.min(6, -(this.followers.at(-1).trailZ ?? 0) / 2) : 0;
      const center = this.v2.set(0, 1.5, -len);
      cam.position.set(Math.sin(this.orbit) * r, 3 + (far - 1) * 3, center.z + Math.cos(this.orbit) * r);
      this.lookAt.copy(center);
      cam.fov = 55;
    } else {
      // Derrière : un peu à gauche du chemin (l'aire de pause arrive à droite) et au-dessus, assez loin pour voir
      // le cheval ET ceux qui suivent (la fiche du trajet couvre le bas de l'écran).
      this.yaw = THREE.MathUtils.clamp((this.yaw ?? 0) - dx * 0.004, -0.9, 0.9);
      const tail = this.followers.length ? -(this.followers.at(-1).trailZ ?? 0) : 0;
      const back = (tall ? 8 : 6.5) + tail * 0.9;
      const height = (tall ? 5.2 : 3.8) + tail * 0.35;
      cam.position.set(2.2 + Math.sin(this.yaw) * back, height, -tail - back * Math.cos(this.yaw));
      this.lookAt.set(0, 0.9, 2 - tail * 0.45);
      cam.fov = tall ? 62 : 55;
    }
    this.finishCamera(dt);
  }

  resetLook() {
    this.yaw = 0;
    this.pitch = -0.08;
  }

  /** Le cheval, le cavalier et les autres retournent à leur place (et à leur monde). */
  detachCarrier() {
    const pl = this.game.player;
    const sp = this.savedPlayer;
    if (sp) {
      pl.root.removeFromParent();
      sp.parent?.add(pl.root);
      pl.root.position.copy(sp.pos);
      pl.root.rotation.copy(sp.rot);
      pl.heading = sp.heading;
      pl.speed = 0;
      pl.root.visible = sp.visible;
      pl.avatar.root.visible = true;
    }
    for (const s of this.saved ?? []) {
      const e = s.e;
      e.root.removeFromParent();
      s.parent?.add(e.root);
      e.root.position.copy(s.pos);
      e.root.rotation.copy(s.rot);
      e.world = s.world;
      e.heading = s.heading;
      e.speed = 0;
      e.root.visible = s.visible;
      delete e.trailZ;
    }
    this.saved = [];
    this.savedPlayer = null;
  }
}
