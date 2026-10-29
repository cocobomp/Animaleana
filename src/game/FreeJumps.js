// ⤴️ Sauter en balade (src/sim/freeJumps.js) : les troncs couchés le long du chemin de balade, à la ferme, et le saut
// au galop. Le saut reprend celui des séances d'obstacles (src/game/Activities.js : poseJump, la bascule du cheval et
// le cavalier en suspension). Mis à jour après les activités (Game.frame).

import * as THREE from 'three';
import { t } from '../i18n.js';
import { addStat } from '../sim/profile.js';
import { logSpots, logView, jumpAhead, jumpNow } from '../sim/freeJumps.js';
import { poseJump, resetPose } from './Activities.js';

const BARK = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.95 });
const WOOD = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.8 });
const fwd = (h) => new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Un tronc couché (axe en x : en travers du sens de saut), ses deux bouts clairs et une branche cassée. */
function logModel(o) {
  const g = new THREE.Group();
  const r = o.height / 2;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, o.width, 12), BARK);
  trunk.rotation.z = Math.PI / 2;
  trunk.position.y = r;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  g.add(trunk);
  for (const s of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.CircleGeometry(r * (s < 0 ? 0.92 : 1) * 0.96, 12), WOOD);
    end.position.set((s * o.width) / 2 + s * 0.002, r, 0);
    end.rotation.y = (s * Math.PI) / 2;
    g.add(end);
  }
  const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 6), BARK);
  twig.position.set(o.width * 0.22, r * 1.7, 0.05);
  twig.rotation.z = -0.9;
  twig.castShadow = true;
  g.add(twig);
  return g;
}

export class FreeJumps {
  constructor(game) {
    this.game = game;
    this.logs = [];
    this.place = null;
    this.jump = null;
    this.wantAt = -99;
    this.time = 0;
    this.ahead = null; // (le tronc devant, au galop : le bouton « Sauter »)
  }

  /** Les troncs de la ferme (ailleurs : aucun). Refaits quand on change de lieu. */
  sync() {
    const g = this.game;
    const key = g.profile?.place ?? null;
    if (key === this.place) return;
    this.place = key;
    for (const o of this.logs) {
      o.model.removeFromParent();
      o.model.traverse((m) => m.geometry?.dispose());
    }
    this.logs = [];
    if (!g.profile || !g.isHome) return;
    for (const s of logSpots()) {
      if (g.world.isWater(s.x, s.z)) continue;
      const model = logModel(s);
      model.position.set(s.x, g.world.heightAt(s.x, s.z), s.z);
      model.rotation.y = s.heading;
      g.scene.add(model);
      this.logs.push({ ...s, model, prev: null });
    }
  }

  /** Espace ou le bouton : « saute ! » (compté un court moment, comme dans les séances). */
  want() {
    this.wantAt = this.time;
  }

  /** En balade libre, au galop, un tronc devant : le bouton « Sauter » est montré. */
  canJump() {
    return !!this.ahead && !this.jump;
  }

  update(dt) {
    this.time += dt;
    this.sync();
    const g = this.game;
    const pl = g.player;
    // (pendant une activité ou une balade guidée, qui ont leur propre chemin : pas de troncs)
    const hide = !!(g.activities.active || g.trailGuide?.session);
    if (hide !== !!this.hidden) {
      this.hidden = hide;
      for (const o of this.logs) o.model.visible = !hide;
    }
    if (this.jump) return this.updateJump(dt);
    this.ahead = null;
    const free = pl.mount && !hide && pl.gaitEnabled !== false && !pl.auto && !g.tripFlow?.active;
    if (!free || !this.logs.length) {
      for (const o of this.logs) o.prev = null;
      return;
    }
    const p = pl.root.position;
    const wanted = this.time - this.wantAt < 0.45;
    for (const o of this.logs) {
      const view = logView(o, p.x, p.z, pl.heading);
      if (jumpAhead(view, pl.speed)) this.ahead = o;
      // (u de l'image d'avant, s'il était pris dans le même sens : un demi-tour près du tronc n'est pas un passage)
      const r = jumpNow(view, o.prevH === view.o.heading ? o.prev : null, pl.speed, wanted);
      o.prev = Math.abs(view.v) < o.width ? view.u : null;
      o.prevH = view.o.heading;
      if (r) {
        this.start(o, view.o.heading, r);
        return;
      }
    }
  }

  start(o, heading, r) {
    const pl = this.game.player;
    const step = r.what === 'step'; // (au trot : un petit bond par-dessus)
    const speed = step ? Math.max(1.5, pl.speed) : Math.max(4.5, pl.speed);
    const dur = step ? 0.5 : 0.62 + o.height * 0.22;
    this.wantAt = -99;
    this.ahead = null;
    pl.spookIn = Math.max(pl.spookIn ?? 0, 6); // (pas d'écart en plein saut)
    this.jump = {
      o, t: 0, dur, timing: r.timing, auto: r.what === 'auto', step,
      from: pl.root.position.clone(), heading, h0: pl.heading,
      dist: step ? Math.max(1.6, speed * dur) : Math.max(3.6, speed * dur),
      height: step ? o.height * 0.8 : o.height * 1.1 + 0.3 * (0.6 + 0.4 * r.timing), speed,
    };
  }

  updateJump(dt) {
    const j = this.jump;
    const g = this.game;
    const pl = g.player;
    const e = pl.mount;
    if (!e) {
      this.jump = null;
      pl.jumpPose = 0;
      return;
    }
    j.t = Math.min(1, j.t + dt / j.dur);
    const s = Math.sin(Math.PI * j.t);
    const pos = j.from.clone().addScaledVector(fwd(j.heading), j.dist * j.t);
    pl.root.position.set(pos.x, g.world.heightAt(pos.x, pos.z) + s * j.height, pos.z);
    pl.heading = j.h0 + wrap(j.heading - j.h0) * Math.min(1, j.t * 3);
    pl.root.rotation.y = pl.heading;
    pl.speed = j.speed;
    e.position.copy(pl.root.position);
    e.heading = pl.heading;
    e.root.rotation.y = pl.heading;
    poseJump(e, pl, j.t);
    if (j.t < 1) return;
    // Réception
    this.jump = null;
    resetPose(e);
    pl.avatar.root.rotation.x = 0;
    pl.jumpPose = 0;
    pl.onStep?.(true, true); // (les sabots retombent)
    for (const o of this.logs) o.prev = null;
    if (j.step) return; // (enjambé au trot : rien à fêter)
    const a = e.data;
    const great = !j.auto && j.timing > 0.7;
    a.skills.jump = Math.min(100, (a.skills.jump ?? 10) + (great ? 0.4 : 0.2)); // (il s'habitue à sauter)
    addStat(g.profile, 'freeJumps');
    e.emit(great ? '⭐' : '💨', 1.5);
    const p = { name: a.name, g: a.sex };
    if (!g.profile.freeJumpHint) {
      g.profile.freeJumpHint = true;
      g.ui.toast(t('fj_first', p), 6000);
    } else g.ui.toast(t(great ? 'fj_great' : j.auto ? 'fj_auto' : 'fj_ok', p), 2500);
  }

  /** On descend, on change de lieu… : le cheval se remet droit. */
  cancel() {
    if (!this.jump) return;
    const pl = this.game.player;
    if (pl.mount) resetPose(pl.mount);
    if (pl.avatar) pl.avatar.root.rotation.x = 0;
    pl.jumpPose = 0;
    this.jump = null;
  }
}

