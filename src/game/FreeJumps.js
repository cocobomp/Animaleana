// ⤴️ Sauter en balade (src/sim/freeJumps.js) : les troncs couchés le long du chemin de balade, à la ferme, et le saut
// au galop ; ⏱️ le cross : le premier tronc sauté lance le chrono, la flèche jaune montre le suivant. Le saut reprend celui des séances d'obstacles (src/game/Activities.js : poseJump, la bascule du cheval et
// le cavalier en suspension). Mis à jour après les activités (Game.frame).

import * as THREE from 'three';
import { t } from '../i18n.js';
import { addStat } from '../sim/profile.js';
import { LOG, logSpots, logView, jumpAhead, jumpNow, logRefusal, crossJump, crossTick, fmtCross } from '../sim/freeJumps.js';
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

/** Le piquet numéroté au bout du tronc (l'ordre du cross) : un petit poteau et son numéro, toujours lisible. */
function numberPost(o, n) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1, 6), BARK);
  post.position.y = 0.5;
  post.castShadow = true;
  g.add(post);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = n === 1 ? '#bfe6a8' : '#f4e3b5'; // (le n° 1, départ du cross : vert)
  x.strokeStyle = n === 1 ? '#2f6b45' : '#6b4a2b';
  x.lineWidth = 6;
  x.beginPath();
  x.arc(32, 32, 27, 0, Math.PI * 2);
  x.fill();
  x.stroke();
  x.fillStyle = '#3b2a17';
  x.font = 'bold 36px sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(String(n), 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sign.scale.set(0.42, 0.42, 1);
  sign.position.y = 1.12;
  g.add(sign);
  g.position.set(o.width / 2 + 0.35, 0, 0);
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
    this.cross = null; // ⏱️ le cross en cours : { next, t }
  }

  /**
   * La flèche jaune vers le prochain tronc du cross (ou plus de flèche). Rendue : seulement si c'est encore la nôtre
   * (la flèche de la quête reprend sa place au tour suivant du guide).
   */
  pointNext() {
    const g = this.game;
    const o = this.cross ? this.logs[this.cross.next] : null;
    if (o) {
      this.shown = new THREE.Vector3(o.x, 0, o.z);
      g.marker?.show(this.shown, { hideNear: 3 });
      this.marked = true;
    } else if (this.marked) {
      if (g.marker?.target === this.shown) g.marker.hide();
      if (g.ui?.tutorial) g.ui.tutorial.markerKey = null;
      this.marked = false;
      this.shown = null;
    }
  }

  /** Les troncs de la ferme (ailleurs : aucun). Refaits quand on change de lieu. */
  sync() {
    const g = this.game;
    // (une autre partie, ou un autre lieu : on refait les troncs, et le cross s'arrête)
    const key = g.profile ? `${g.profile.id}:${g.profile.place}` : null;
    if (key === this.place) return;
    this.place = key;
    if (this.cross) {
      this.cross = null;
      this.pointNext();
    }
    for (const o of this.logs) {
      o.model.removeFromParent();
      o.model.traverse((m) => {
        m.geometry?.dispose();
        if (m.isSprite) {
          m.material.map?.dispose();
          m.material.dispose();
        }
      });
    }
    this.logs = [];
    if (!g.profile || !g.isHome) return;
    for (const s of logSpots()) {
      if (g.world.isWater(s.x, s.z)) continue;
      const model = logModel(s);
      model.add(numberPost(s, this.logs.length + 1));
      model.position.set(s.x, g.world.heightAt(s.x, s.z), s.z);
      model.rotation.y = s.heading;
      g.scene.add(model);
      this.logs.push({ ...s, model, prev: null });
    }
  }

  /** Espace ou le bouton : « saute ! » (compté un court moment, comme dans les séances). Trop loin : on le dit. */
  want() {
    this.wantAt = this.time;
    const o = this.ahead;
    const pl = this.game.player;
    if (!o || this.jump || !pl.mount) return;
    const view = logView(o, pl.root.position.x, pl.root.position.z, pl.heading);
    // (même en comptant le petit moment où l'appel reste valable, il serait encore trop loin)
    if (view.u + pl.speed * 0.45 < LOG.early && this.time - (this.earlyAt ?? -99) > 2) {
      this.earlyAt = this.time;
      this.game.ui.toast(t('fj_early', { m: Math.round(-view.u) }), 2200);
    }
  }

  /** En balade libre, au galop, un tronc devant : le bouton « Sauter » est montré. */
  canJump() {
    return !!this.ahead && !this.jump;
  }

  /** Le bon moment pour appeler (le bouton devient vert) : entre LOG.early et LOG.late du tronc. */
  jumpNowWindow() {
    return this.canJump() && this.aheadU > LOG.early && this.aheadU < LOG.late;
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
    if (this.cross) {
      this.cross = crossTick(this.cross, dt);
      if (!this.cross) {
        g.ui.toast(t('cross_timeout'), 5000);
        this.pointNext();
      }
    }
    this.ahead = null;
    // (descendu, une activité, un voyage, un autre lieu : le cross et sa flèche s'arrêtent ; toucher le sol pour y
    // aller à cheval ne l'arrête pas)
    const off = !pl.mount || hide || !!g.tripFlow?.active || !this.logs.length || !g.isHome;
    if (off && this.cross) {
      this.cross = null;
      this.pointNext();
    }
    const free = !off && pl.gaitEnabled !== false && !pl.auto;
    if (!free) {
      for (const o of this.logs) o.prev = null;
      return;
    }
    const p = pl.root.position;
    const wanted = this.time - this.wantAt < 0.45;
    // (c'est l'allure qui compte, pas la vitesse : un shetland au galop va moins vite qu'un cheval de trait au trot ;
    // au galop lancé, il saute ; au trot ou au pas, il enjambe)
    // (un galop à peine poussé, presque sur place, ne saute pas : vitesse rapportée à sa taille)
    const canter = (pl.gaitNow === 'canter' || pl.gaitNow === 'gallop') && pl.speed / Math.max(0.3, pl.mount.scale ?? 1) > 2.4;
    const v = canter ? Math.max(LOG.minSpeed, pl.speed) : Math.min(pl.speed, LOG.minSpeed * 0.95);
    // (le premier galop à la ferme, sans avoir encore sauté : où sont les troncs)
    if (v >= LOG.minSpeed && !this.whereHint && !(g.profile.stats?.freeJumps > 0)) {
      this.whereHint = true;
      g.ui.toast(t('fj_where', { n: this.logs.length }), 7000);
    }
    for (const o of this.logs) {
      const view = logView(o, p.x, p.z, pl.heading);
      if (jumpAhead(view, v)) {
        this.ahead = o;
        this.aheadU = view.u; // (le bouton passe au vert dans la fenêtre d'appel)
      }
      // (u de l'image d'avant, s'il était pris dans le même sens : un demi-tour près du tronc n'est pas un passage)
      const r = jumpNow(view, o.prevH === view.o.heading ? o.prev : null, v, wanted);
      o.prev = Math.abs(view.v) < o.width ? view.u : null;
      o.prevH = view.o.heading;
      if (r) {
        // (pas encore habitué à sauter : il pile devant le tronc)
        if (r.what !== 'step' && logRefusal(pl.mount.data.skills?.jump ?? 10, r.timing)) this.refuse(o, view.o.heading);
        else this.start(o, view.o.heading, r);
        return;
      }
    }
  }

  /** Il pile devant le tronc : il s'arrête net et recule de quelques pas ; on reprend de l'élan. */
  refuse(o, heading) {
    const g = this.game;
    const pl = g.player;
    const e = pl.mount;
    pl.speed = 0;
    pl.root.position.addScaledVector(fwd(heading), -2.4);
    pl.root.position.y = g.world.heightAt(pl.root.position.x, pl.root.position.z);
    e.position.copy(pl.root.position);
    for (const x of this.logs) x.prev = null;
    this.wantAt = -99;
    e.emit('😨', 1.5);
    g.ui.toast(t('fj_refuse', { name: e.data.name, g: e.data.sex }), 5000);
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
    const crossNews = this.crossLanded(j.o);
    const a = e.data;
    const great = !j.auto && j.timing > 0.7;
    a.skills.jump = Math.min(100, (a.skills.jump ?? 10) + (great ? 0.4 : 0.2)); // (il s'habitue à sauter)
    addStat(g.profile, 'freeJumps');
    g.remember?.(a, 'firstLog');
    e.emit(great ? '⭐' : '💨', 1.5);
    const p = { name: a.name, g: a.sex };
    if (crossNews) g.ui.toast(crossNews, 5000); // (le cross dit déjà « hop »)
    else if (!g.profile.freeJumpHint) {
      g.profile.freeJumpHint = true;
      g.ui.toast(t('fj_first', p), 6000);
    } else g.ui.toast(t(great ? 'fj_great' : j.auto ? 'fj_auto' : 'fj_ok', p), 2500);
  }

  /** ⏱️ Un tronc sauté pendant (ou au début d'un) cross : le texte à dire, ou null. */
  crossLanded(o) {
    const g = this.game;
    const n = this.logs.length;
    const i = this.logs.indexOf(o);
    const r = crossJump(this.cross, i, n);
    if (!r.what) {
      // (pas de cross en cours, et pas le n° 1 : comment le lancer, une fois)
      if (i > 0 && !this.crossHow) {
        this.crossHow = true;
        return t('cross_how');
      }
      return null;
    }
    const was = this.cross;
    this.cross = r.cross;
    this.pointNext();
    if (r.what === 'start') return t('cross_start', { n });
    if (r.what === 'next') return t('cross_next', { i: this.cross.next, n, time: fmtCross(this.cross.t) });
    if (r.what === 'wrong') return t('cross_wrong', { i: was.next + 1 });
    // fini : le temps, et le record
    const s = g.profile.stats;
    const best = s.crossBest ?? null;
    const record = best === null || r.time < best;
    if (record) s.crossBest = Math.round(r.time);
    addStat(g.profile, 'crossDone');
    g.remember?.(g.player.mount?.data, 'firstCross');
    return t(record ? 'cross_record' : 'cross_done', { time: fmtCross(r.time), best: fmtCross(best ?? r.time) });
  }

  /** On descend, on change de lieu… : le cheval se remet droit (et le cross s'arrête). */
  cancel() {
    if (this.cross) {
      this.cross = null;
      this.pointNext();
    }
    if (!this.jump) return;
    const pl = this.game.player;
    if (pl.mount) resetPose(pl.mount);
    if (pl.avatar) pl.avatar.root.rotation.x = 0;
    pl.jumpPose = 0;
    this.jump = null;
  }
}

