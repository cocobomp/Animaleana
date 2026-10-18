// Repère 3D réutilisable : une grosse flèche jaune qui rebondit au-dessus d'une cible
// (bâtiment, animal, endroit), avec un cercle qui pulse au sol. Visible même derrière un mur.
// Si la cible est hors de l'écran, une flèche au bord de l'écran montre la direction
// (et la toucher fait marcher l'avatar vers la cible).
//
//   game.marker.show(cible, options) — cible : Vector3, { x, z }, entité (avec .position) ou fonction
//   game.marker.hide()
// options : { height, hideNear, onEdgeTap, color }

import * as THREE from 'three';

const YELLOW = 0xffd23f;
const NEAR_RING_ONLY = 2.5; // m : l'avatar est à côté de la cible, le cercle au sol suffit

export class Marker {
  constructor(game) {
    this.game = game;
    this.target = null;
    this.opts = {};
    this.time = 0;
    this.pos = new THREE.Vector3();
    this._tip = new THREE.Vector3();

    const mat = (color, opacity = 1) => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthTest: false, depthWrite: false,
    });
    this.mats = [mat(YELLOW), mat(0x8a5a00), mat(YELLOW, 0.75)];
    const g = new THREE.Group();
    // Flèche vers le bas : une pointe (cône) et une tige, avec un contour plus foncé.
    const arrow = new THREE.Group();
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.8, 24), this.mats[0]);
    tip.rotation.x = Math.PI;
    tip.position.y = 0.4;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.7, 16), this.mats[0]);
    shaft.position.y = 1.1;
    const edge = new THREE.Mesh(new THREE.ConeGeometry(0.58, 0.92, 24), this.mats[1]);
    edge.rotation.x = Math.PI;
    edge.position.y = 0.44;
    edge.renderOrder = 998;
    arrow.add(edge, tip, shaft);
    tip.renderOrder = shaft.renderOrder = 999;
    this.arrow = arrow;
    // Cercle au sol.
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 40).rotateX(-Math.PI / 2), this.mats[2]);
    ring.renderOrder = 997;
    this.ring = ring;
    g.add(arrow, ring);
    g.visible = false;
    this.group = g;
    game.scene.add(g);

    // Flèche au bord de l'écran quand la cible n'est pas visible.
    this.edgeEl = document.createElement('button');
    this.edgeEl.className = 'marker-edge';
    this.edgeEl.hidden = true;
    this.edgeEl.innerHTML = '<span class="marker-edge-arrow">➜</span>';
    this.edgeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.walkToTarget();
    });
    (game.ui?.root ?? document.body).append(this.edgeEl);
  }

  get visible() {
    return this.group.visible;
  }

  show(target, opts = {}) {
    this.target = target;
    this.opts = opts;
    this.mats[0].color.setHex(opts.color ?? YELLOW);
    this.mats[2].color.setHex(opts.color ?? YELLOW);
    this.group.visible = !!this.resolve();
  }

  hide() {
    this.target = null;
    this.group.visible = false;
    this.edgeEl.hidden = true;
  }

  /** Position de la cible (et hauteur de la flèche), ou null. */
  resolve() {
    let t = this.target;
    if (typeof t === 'function') t = t();
    if (!t) return null;
    let p = null;
    let top = 0;
    if (t.isVector3) p = t;
    else if (t.position?.isVector3) {
      p = t.position;
      // Une entité animale : au-dessus de son étiquette.
      if (t.label) top = t.label.position.y;
    } else if (typeof t.x === 'number') p = { x: t.x, z: t.z };
    if (!p) return null;
    const world = this.game.world;
    const ground = world?.heightAt ? world.heightAt(p.x, p.z) : 0;
    this.pos.set(p.x, ground, p.z);
    return { ground, top: this.opts.height ?? (top ? top + 0.9 : 2.6) };
  }

  walkToTarget() {
    if (this.opts.onEdgeTap) return this.opts.onEdgeTap();
    if (!this.target || !this.resolve()) return;
    this.game.walkTo(this.pos.clone(), 2);
  }

  update(dt) {
    if (!this.target) return;
    const r = this.resolve();
    if (!r) {
      this.group.visible = false;
      this.edgeEl.hidden = true;
      return;
    }
    this.time += dt;
    this.group.visible = true;
    this.group.position.copy(this.pos);
    const bounce = Math.abs(Math.sin(this.time * 3.2)) * 0.45;
    this.arrow.position.y = r.top + bounce;
    this.arrow.rotation.y += dt * 1.5;
    const s = 1 + Math.sin(this.time * 4) * 0.15;
    this.ring.scale.set(s, 1, s);
    this.ring.position.y = 0.06;

    const player = this.game.player?.position;
    const near = player ? Math.hypot(player.x - this.pos.x, player.z - this.pos.z) : Infinity;
    if (this.opts.hideNear && near < this.opts.hideNear) {
      this.hide();
      return;
    }
    // La flèche est toujours dessinée par-dessus tout (depthTest: false) : une cible entre la caméra et l'avatar
    // (l'animal à caresser, le matin devant la maison) la mettait en grand sur la moitié de l'écran, l'avatar
    // caché dessous. Seul le cercle au sol reste quand la cible est à côté de l'avatar ou plus près de la caméra
    // que lui (au premier plan, on la voit bien) ; ailleurs, près de la caméra, la flèche rapetisse.
    const cam = this.game.camera;
    const dCam = cam ? cam.position.distanceTo(this._tip.copy(this.pos).setY(this.pos.y + this.arrow.position.y)) : Infinity;
    const front = cam && player && !this.game.mgmt?.active // (vue d'ensemble : la caméra est en l'air, pas derrière l'avatar)
      && Math.hypot(cam.position.x - this.pos.x, cam.position.z - this.pos.z) < Math.hypot(cam.position.x - player.x, cam.position.z - player.z) - 0.5;
    this.arrow.scale.setScalar(THREE.MathUtils.clamp(dCam / 9, 0.3, 1));
    this.arrow.visible = near > NEAR_RING_ONLY && !front;
    this.updateEdge(r);
  }

  updateEdge(r) {
    const cam = this.game.camera;
    const blocked = this.game.ui?.isBlocking?.() || this.opts.noEdge;
    const v = this.pos.clone();
    v.y += r.top * 0.6;
    const local = v.clone().applyMatrix4(cam.matrixWorldInverse); // repère de la caméra (z < 0 : devant)
    v.project(cam);
    const ahead = local.z < 0;
    const onScreen = ahead && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.88;
    if (onScreen || blocked) {
      this.edgeEl.hidden = true;
      return;
    }
    // Flèche sur le bord gauche ou droit (le haut et le bas sont occupés par les boutons).
    const right = ahead ? v.x > 0 : local.x > 0;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const ny = ahead ? Math.max(-0.4, Math.min(0.3, v.y)) : -0.1;
    const sx = right ? W - 44 : 44;
    let sy = (1 - (ny + 1) / 2) * H;
    // Pas sur le suivi de quête rangé contre ce bord (src/ui/tutorial.js) : la flèche passe juste en dessous.
    const box = this.game.ui?.tutorial?.trackerBox;
    if (box && sx + 32 > box.left && sx - 32 < box.right && sy + 32 > box.top - 6 && sy - 32 < box.bottom + 6) sy = box.bottom + 40;
    this.edgeEl.hidden = false;
    this.edgeEl.style.left = `${sx - 32}px`;
    this.edgeEl.style.top = `${sy - 32}px`;
    this.edgeEl.firstChild.style.transform = right ? 'none' : 'scaleX(-1)';
  }
}
