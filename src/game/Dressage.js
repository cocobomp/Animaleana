// Dressage en 3D : séance de plat (transitions au bon moment sur la piste), figures d'entraînement
// (suivre les lettres allumées) et reprise de dressage (figures notées par le juge à C).
// La logique (figures, notes, gains) est dans src/sim/dressage.js. Les séances s'enregistrent dans
// le registre SESSION_TYPES de src/game/Activities.js (types 'flat', 'figures', 'dressage').

import * as THREE from 'three';
import { Session, SESSION_TYPES } from './Activities.js';
import { toWorld, eligibility } from '../sim/activities.js';
import {
  LETTERS, GAITS, GAIT_ORDER, gaitOf, nextGait, repriseFor, figureEnd, pathProgress, figureMark, haltMark, reinBackMark,
  judgeComment, repriseResult, dressageSkill, applyTraining, trainingBlock, cooldownLeft, learnFactor, flatSequence,
  transitionQuality, flatResult, RAIL_LOOP, pathLengths, CUE_WINDOW,
} from '../sim/dressage.js';
import { dressageArena, pathDiscs, haltRing } from './models/venue.js';
import { guideArrow } from './models/course.js';
import { emojiTexture } from './textures.js';
import { addStat } from '../sim/profile.js';
import { t, ta } from '../i18n.js';

const fwd = (h) => new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
const W = -Math.PI / 2; // on entre à A en allant vers −x (vers C)

/** Texte d'une allure : « 🏃 Trot ». */
export const gaitLabel = (g) => `${GAITS[g].icon} ${t(`dr_gait_${g}`)}`;

// ---------------------------------------------------------------- base : à cheval dans le rectangle

class ArenaSession extends Session {
  /** Prépare le cheval, le rectangle et le bouton d'allure. Renvoie false si on ne peut pas commencer. */
  setupHorse(opts, type) {
    const g = this.game;
    const a = opts.animal;
    const e = g.entities.get(a?.id);
    const why = a ? eligibility(a, 'dressage') : 'notHere';
    if (!e || why) {
      if (a) g.ui.toast(ta(`actv_why_${why ?? 'notHere'}`, a), 5000);
      return false;
    }
    const block = this.trainingType ? trainingBlock(a, this.trainingType, g.profile.clock) : null;
    if (block) {
      g.ui.toast(ta('dr_cooldown', a, { n: cooldownLeft(a, this.trainingType, g.profile.clock) }), 5000);
      return false;
    }
    this.animal = a;
    this.arena = dressageArena();
    const c = toWorld({ x: 0, z: 0 });
    this.put(this.arena, c.x, c.z, 0);
    this.discs = pathDiscs();
    this.group.add(this.discs);
    this.arrow = guideArrow(0xb070ff);
    this.group.add(this.arrow);
    // En selle, à A.
    const st = toWorld(LETTERS.A);
    if (g.player.mount && g.player.mount !== e) g.dismount();
    if (!g.player.mount) {
      e.position.set(st.x, 0, st.z);
      if (!g.ride(a)) return false;
    }
    this.mount = e;
    this.startAt = { x: st.x, z: st.z, heading: W };
    this.teleportPlayer(st.x, st.z, W);
    this.gait = 'walk';
    this.hud.setMain({ icon: GAITS.walk.icon, label: t('dr_gaitBtn', { gait: t('dr_gait_walk') }), key: t('actv_key_space'), onClick: () => this.cycleGait() });
    void type;
    return true;
  }

  setGait(gait) {
    if (!GAITS[gait] || gait === 'halt') return;
    this.gait = gait;
    this.hud.setMain({ icon: GAITS[gait].icon, label: t('dr_gaitBtn', { gait: t(`dr_gait_${gait}`) }), key: t('actv_key_space'), onClick: () => this.cycleGait() });
    this.onGaitChosen?.(gait);
  }

  cycleGait() {
    if (this.state !== 'run') return;
    this.setGait(nextGait(this.gait));
  }

  onKeyDown(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      this.cycleGait();
    }
    const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
    if (i >= 0 && this.state === 'run') this.setGait(GAIT_ORDER[i]);
  }

  /** Points du repère de la carrière → monde. */
  world(pts) {
    return pts.map((p) => toWorld(p));
  }

  /** Chaque image : garde la monture, plafonne la vitesse à l'allure, fait zigzaguer un cheval peu dressé. */
  updateRide(dt) {
    const g = this.game;
    const pl = g.player;
    if (pl.mount !== this.mount) {
      g.ui.toast(t('actv_dismounted'));
      this.end(true);
      return false;
    }
    const p = pl.root.position;
    if (this.state === 'countdown') {
      p.set(this.startAt.x, this.y(this.startAt.x, this.startAt.z), this.startAt.z);
      pl.heading = this.startAt.heading;
      pl.speed = 0;
      this.mount.position.copy(p);
      this.mount.heading = pl.heading;
    }
    pl.speed = Math.min(pl.speed, GAITS[this.gait].speed);
    if (pl.speed > 0.5) {
      // Un cheval peu dressé n'est pas droit : il faut le reprendre.
      const skill = dressageSkill(this.animal);
      pl.heading += Math.sin(this.time * 2.3) * 0.3 * dt * (1 - skill / 100);
    }
    return true;
  }
}

// ---------------------------------------------------------------- reprise de dressage et figures

class DressageSession extends ArenaSession {
  constructor(mgr, type, opts) {
    super(mgr, type, opts);
    this.training = type === 'figures';
    this.trainingType = this.training ? 'figures' : null;
    if (!this.setupHorse(opts, type)) {
      this.ok = false;
      return;
    }
    const g = this.game;
    this.level = this.comp?.level ?? opts.level ?? 1;
    this.reprise = repriseFor(this.training ? 'training' : this.level);
    this.marks = [];
    this.index = -1;
    this.fig = null;
    // Le juge à C, derrière la lice.
    const c = toWorld({ x: LETTERS.C.x - 1.8, z: 0 });
    const judge = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('🧑‍⚖️'), transparent: true, depthWrite: false }));
    judge.scale.setScalar(1.5);
    judge.position.set(c.x, this.y(c.x, c.z) + 1.0, c.z);
    this.group.add(judge);
    this.ring = haltRing();
    this.ring.visible = false;
    this.group.add(this.ring);
    if (this.comp) this.addCrowd();
    this.hud.hint(ta(this.training ? 'dr_figuresHint' : 'dr_repriseHint', this.animal));
    this.refreshHud();
  }

  onGo() {
    this.nextFigure();
  }

  refreshHud() {
    const f = this.fig;
    const total = this.reprise.length;
    const sum = this.marks.reduce((s, m) => s + m.mark, 0);
    const now = gaitOf(this.game.player.speed);
    const want = f?.gait ?? 'walk';
    const ok = f && (f.kind !== 'path' ? now === 'halt' : now === want);
    this.hud.stats([
      ['🎯', f ? `${f.n}/${total} ${t(`dr_fig_${f.id}`)}` : `${total} ${t('dr_figures')}`],
      ['🐎', f ? `${gaitLabel(want)} ${ok ? '✅' : '⚠️'}` : gaitLabel(this.gait)],
      ['⭐', this.marks.length ? `${sum}/${this.marks.length * 10}` : '—'],
    ]);
  }

  nextFigure() {
    this.index++;
    const f = this.reprise[this.index];
    this.fig = f;
    if (!f) {
      this.complete();
      return;
    }
    const end = toWorld(figureEnd(f));
    this.target = end;
    this.track = { t0: this.time, prog: 0, distSum: 0, samples: 0, gaitTime: 0, moveTime: 0, changes: 0, lastGait: null, still: 0, settled: null, moved: 0, halted: false, backing: null };
    if (f.kind === 'path') {
      this.discs.userData.set(this.world(f.pts), (x, z) => this.y(x, z));
      this.ring.visible = false;
    } else {
      this.discs.userData.hide();
      this.ring.visible = true;
      this.ring.position.set(end.x, this.y(end.x, end.z) + 0.06, end.z);
    }
    const label = f.kind === 'path' ? `${f.n}. ${t(`dr_fig_${f.id}`)} — ${gaitLabel(f.gait)}` : `${f.n}. ${t(`dr_fig_${f.id}`)}`;
    this.hud.big(label, 1800);
    if (f.kind !== 'path') this.hud.hint(t(f.kind === 'haltBack' ? 'dr_haltBackHint' : 'dr_haltHint'), 6000);
    this.refreshHud();
  }

  /** Le juge donne sa note : on l'affiche, puis figure suivante. */
  judge(mark, comment) {
    const f = this.fig;
    this.marks.push({ n: f.n, id: f.id, mark, comment });
    this.hud.big(`${mark}/10 ${mark >= 8 ? '✨' : mark >= 5 ? '👍' : '💭'}`, 1300, mark >= 7 ? 'good' : mark < 4 ? 'bad' : '');
    this.game.ui.toast(`🧑‍⚖️ ${t(`dr_say_${comment}`)}`, 3500);
    if (mark >= 8) this.mount.emit('⭐', 2);
    if (this.comp && mark >= 7) this.applause(0.4);
    this.fig = null;
    setTimeout(() => !this.ended && this.state === 'run' && this.nextFigure(), 900);
  }

  update(dt) {
    this.updateCommon(dt);
    if (this.state === 'done' || !this.updateRide(dt)) return;
    const pl = this.game.player;
    const p = pl.root.position;
    const f = this.fig;
    if (this.target) {
      this.arrow.position.set(this.target.x, this.y(this.target.x, this.target.z) + 2.4 + Math.sin(this.time * 4) * 0.2, this.target.z);
      this.arrow.rotation.y += dt * 2;
      this.arrow.visible = !!f && Math.hypot(this.target.x - p.x, this.target.z - p.z) > 4;
    }
    if (this.state !== 'run' || !f) return;
    const tr = this.track;
    const elapsed = this.time - tr.t0;
    const now = gaitOf(pl.speed);
    if (tr.lastGait !== null && now !== tr.lastGait && now !== 'halt' && tr.lastGait !== 'halt') tr.changes++;
    tr.lastGait = now;
    const skill = dressageSkill(this.animal);

    if (f.kind === 'path') {
      const local = { x: p.x - toWorld({ x: 0, z: 0 }).x, z: p.z - toWorld({ x: 0, z: 0 }).z };
      const r = pathProgress(f.pts, f.lengths, local, tr.prog);
      tr.prog = r.prog;
      if (pl.speed > 0.3) {
        tr.distSum += r.dist * dt;
        tr.moveTime += dt;
        if (now === f.gait) tr.gaitTime += dt;
      }
      const done = tr.prog >= f.lengths.total * 0.9 && Math.hypot(this.target.x - p.x, this.target.z - p.z) < 3;
      const timeout = elapsed > f.expected * 3 + 8;
      if (done || timeout) {
        const stats = { meanDist: tr.moveTime > 0 ? tr.distSum / tr.moveTime : 5, gaitRatio: tr.moveTime > 0 ? tr.gaitTime / tr.moveTime : 0, changes: tr.changes, duration: elapsed, expected: f.expected, skill };
        if (timeout) stats.meanDist = Math.max(stats.meanDist, 3);
        if (timeout) this.game.ui.toast(t('dr_moveOn'), 3000);
        this.judge(figureMark(stats), judgeComment(figureMark(stats), stats));
      }
    } else {
      const d = Math.hypot(this.target.x - p.x, this.target.z - p.z);
      if (!tr.backing) {
        if (d < 2.6 && now === 'halt') tr.still += dt;
        else {
          if (tr.settled !== null && pl.speed > 0.3) tr.moved += dt;
          tr.still = 0;
        }
        if (tr.still >= 2 && tr.settled === null) {
          tr.settled = elapsed - 2;
          tr.haltDist = d;
          tr.halted = true;
          if (f.kind === 'halt') {
            this.judge(haltMark({ dist: d, settle: tr.settled, moved: tr.moved, skill }), tr.settled > 6 ? 'slowHalt' : d > 2 ? 'offPath' : 'good');
            return;
          }
          this.hud.setMain({ icon: '↩️', label: t('dr_backBtn'), key: t('actv_key_space'), onClick: () => this.startBack() });
          this.hud.big(t('dr_nowBack'), 1200, 'good');
        }
        if (elapsed > 20 && tr.settled === null) {
          this.game.ui.toast(t('dr_moveOn'), 3000);
          this.judge(haltMark({ dist: d, settle: 20, moved: 3, skill }), 'noHalt');
        }
      } else {
        // Reculer : le cheval recule de trois pas, bien droit.
        const b = tr.backing;
        b.t += dt;
        pl.speed = 0;
        p.addScaledVector(fwd(pl.heading), -1.3 * dt);
        this.mount.position.copy(p);
        this.mount.speed = 1;
        if (b.t >= 1.8) {
          this.mount.speed = 0;
          this.hud.setMain({ icon: GAITS[this.gait].icon, label: t('dr_gaitBtn', { gait: t(`dr_gait_${this.gait}`) }), key: t('actv_key_space'), onClick: () => this.cycleGait() });
          this.judge(reinBackMark({ halted: tr.halted, dist: tr.haltDist ?? 3, wait: b.wait, skill }), tr.halted ? 'good' : 'noHalt');
        }
      }
    }
    this.refreshHud();
  }

  startBack() {
    const tr = this.track;
    if (!tr || tr.backing || this.fig?.kind !== 'haltBack') return;
    tr.backing = { t: 0, wait: this.time - tr.t0 - (tr.settled ?? 0) };
    this.hud.setMain(null);
  }

  cycleGait() {
    // Pendant un reculer, le bouton sert à reculer.
    if (this.fig?.kind === 'haltBack' && this.track?.settled !== null && this.track?.settled !== undefined && !this.track.backing) return this.startBack();
    return super.cycleGait();
  }

  complete() {
    const g = this.game;
    const a = this.animal;
    this.state = 'finishing';
    this.discs.userData.hide();
    this.ring.visible = false;
    const result = repriseResult(this.marks);
    const extra = [];
    if (result.best) extra.push(`✨ ${t('dr_bestFigure', { fig: t(`dr_fig_${result.best.id}`), n: result.best.mark })}`);
    if (result.worst && result.worst !== result.best) extra.push(`💭 ${t('dr_worstFigure', { fig: t(`dr_fig_${result.worst.id}`), n: result.worst.mark })}`);
    if (this.training) {
      const r = applyTraining(a, 'figures', result.percent / 100, g.profile.clock);
      extra.push(t('dr_skillGain', { n: r.gain, v: r.skill }));
      for (const why of r.reasons) extra.push(`⚠️ ${ta(`dr_learn_${why}`, a)}`);
      g.xp('training');
    } else {
      if (result.percent >= 70) addStat(g.profile, 'actvDressage70');
      a.skills.dressage = Math.min(100, dressageSkill(a) + 1);
    }
    this.applause(result.stars / 3);
    this.hud.big(t(result.stars === 3 ? 'actv_bravo' : 'dr_saluteDone'), 1600, result.stars === 3 ? 'good' : '');
    const body = this.marksTable();
    setTimeout(() => !this.ended && this.finish(result, { animals: [a], quality: result.percent / 100, extra, body }), 1400);
  }

  /** Le protocole : la note de chaque figure (affiché dans la fenêtre des résultats). */
  marksTable() {
    const table = document.createElement('table');
    table.className = 'actv-table dr-protocol';
    const tbody = document.createElement('tbody');
    for (const m of this.marks) {
      const tr = document.createElement('tr');
      for (const txt of [String(m.n), t(`dr_fig_${m.id}`), `${m.mark}/10`]) {
        const td = document.createElement('td');
        td.textContent = txt;
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(tbody);
    return table;
  }
}

// ---------------------------------------------------------------- séance de plat (transitions)

class FlatSession extends ArenaSession {
  constructor(mgr, type, opts) {
    super(mgr, type, opts);
    this.warmup = !!opts.warmup; // échauffement avant un concours : court, sans attente d'une heure
    this.trainingType = this.warmup ? null : 'flat';
    if (!this.setupHorse(opts, type)) {
      this.ok = false;
      return;
    }
    const g = this.game;
    this.loop = RAIL_LOOP();
    this.loopLen = pathLengths(this.loop);
    this.discs.userData.set(this.world(this.loop), (x, z) => this.y(x, z));
    this.seq = flatSequence(this.warmup ? 4 : 8, `${this.place}-${g.day}-${this.animal.id}-${Math.floor(g.hour)}`);
    this.idx = 1;
    this.cue = null;
    this.qualities = [];
    this.offTrack = 0;
    this.prog = 0;
    this.arrow.visible = false;
    this.hud.hint(ta(this.warmup ? 'dr_warmupHint' : 'dr_flatHint', this.animal));
    this.refreshHud();
  }

  refreshHud() {
    const next = this.seq[this.idx];
    const left = next ? Math.max(0, next.at - this.clock) : 0;
    this.hud.stats([
      ['⏱️', next ? t('dr_nextCue', { s: Math.ceil(left) }) : t('dr_lastCue')],
      ['🐎', gaitLabel(this.gait)],
      ['✅', `${this.qualities.length}/${this.seq.length - 1}`],
    ]);
  }

  onGaitChosen(gait) {
    const c = this.cue;
    if (!c || c.done) return;
    if (gait !== c.gait) return;
    const q = transitionQuality(this.clock - c.at);
    c.done = true;
    this.qualities.push(q);
    this.hud.big(q > 0.85 ? t('actv_perfect') : q > 0.4 ? t('actv_good') : t('dr_late'), 800, q > 0.4 ? 'good' : 'bad');
    if (q > 0.85) this.mount.emit('⭐', 1);
  }

  update(dt) {
    this.updateCommon(dt);
    if (this.state === 'done' || !this.updateRide(dt)) return;
    if (this.state !== 'run') return;
    const pl = this.game.player;
    const p = pl.root.position;
    // Annonces
    const next = this.seq[this.idx];
    if (next && this.clock >= next.at) {
      this.cue = { gait: next.gait, at: this.clock, done: false };
      this.idx++;
      this.hud.big(`→ ${gaitLabel(next.gait)} !`, 1400, 'good');
    }
    const c = this.cue;
    if (c && !c.done && this.clock - c.at > CUE_WINDOW) {
      c.done = true;
      this.qualities.push(0);
      this.hud.big(t('dr_late'), 900, 'bad');
    }
    // Rester sur la piste
    const o = toWorld({ x: 0, z: 0 });
    const r = pathProgress(this.loop, this.loopLen, { x: p.x - o.x, z: p.z - o.z }, this.prog, 10, 4);
    this.prog = r.prog >= this.loopLen.total - 0.5 ? 0 : r.prog;
    if (r.dist > 3.5 && pl.speed > 0.3) {
      this.offTrack += dt;
      if (!this.offHint || this.time - this.offHint > 6) {
        this.offHint = this.time;
        this.hud.hint(t('dr_stayOnTrack'), 2500);
      }
    }
    if (!next && c?.done && this.clock - c.at > 4) this.complete();
    this.refreshHud();
  }

  complete() {
    const g = this.game;
    const a = this.animal;
    this.state = 'finishing';
    this.discs.userData.hide();
    const result = flatResult(this.qualities, this.offTrack, this.clock);
    const extra = [t('dr_transitions', { n: this.qualities.filter((q) => q > 0.4).length, total: this.qualities.length })];
    if (this.warmup) {
      // Échauffement : le cheval se détend avant le concours.
      a.stress = Math.max(0, (a.stress ?? 0) - 25);
      a.warmedUp = g.day;
      extra.push(t('dr_warmupDone'));
    } else {
      const r = applyTraining(a, 'flat', result.quality, g.profile.clock);
      extra.push(t('dr_skillGain', { n: r.gain, v: r.skill }));
      for (const why of r.reasons) extra.push(`⚠️ ${ta(`dr_learn_${why}`, a)}`);
      g.xp('training');
    }
    this.hud.big(t(result.stars === 3 ? 'actv_bravo' : 'actv_finished'), 1400, result.stars === 3 ? 'good' : '');
    setTimeout(() => !this.ended && this.finish(result, { animals: [a], quality: result.quality, extra }), 1200);
  }
}

// ---------------------------------------------------------------- enregistrement

SESSION_TYPES.flat = { cls: FlatSession, icon: '🎠', stat: 'actvTraining' };
SESSION_TYPES.figures = { cls: DressageSession, icon: '🔤', stat: 'actvTraining' };
SESSION_TYPES.dressage = { cls: DressageSession, icon: '🎠', stat: 'actvDressage' };

/** Pour les menus : l'état d'apprentissage d'un cheval (« apprend bien », « fatigué »…). */
export function learnInfo(a) {
  const { factor, reasons } = learnFactor(a);
  return { factor, reasons, text: reasons.length ? reasons.map((r) => ta(`dr_learn_${r}`, a)).join(' · ') : t('dr_learnWell') };
}

