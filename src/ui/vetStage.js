// La scène de l'examen vétérinaire : l'animal dessiné en grand (src/ui/minigames/draw.js) dans la
// salle de consultation (sur la table d'examen pour les petits, dans le box pour les grands), les
// zones où poser chaque outil, et les gestes du véto : écouter et compter le cœur, prendre la
// température, éclairer avec la lampe (loupe), regarder la bouche et la recoloration des gencives,
// palper, peser, faire marcher.
// La scène montre et mesure ; ce qui est normal ou non vient de src/sim/vetExam.js, appelé par le
// contrôleur (src/ui/vetExam.js) à travers o.measure(id, input).
//
// Dessin dans un espace virtuel de 400 × 300, agrandi pour remplir la zone (comme les mini-jeux).

import { h } from './dom.js';
import { t, ta, getLang } from '../i18n.js';
import { audio } from '../game/audio.js';
import {
  drawAnimal, animalShape, fitAnimal, ellipse, circle, rrect, shade, css, mix, lerp, clamp, dist, EMOJI_FONT, TEXT_FONT, makeRng,
} from './minigames/draw.js';
import { TOOL_ZONES, measureFor, slowmoOf, vitalsOf, COUNT_SECONDS } from '../sim/vetExam.js';

export const SW = 400;
export const SH = 300;
const SMALL = ['dog', 'cat', 'rabbit'];
const ZONE_EMOJI = {
  heart: '❤️', lungs: '🫁', gut: '🍽️', rump: '🌡️', back: '🔍', belly: '🤲', legFront: '🦵', legHind: '🦵', eye: '👁️', ear: '👂', nose: '👃', mouth: '🦷',
};
const TOOL_CURSOR = { stetho: '🩺', thermo: '🌡️', light: '🔦', mouth: '🦷', palpate: '🤚', scale: '⚖️', walk: '👣' };
const LISTEN_TIME = 2.6;
const THERMO_TIME = 2.4;
const LENS_TIME = 1.9;
const WEIGH_TIME = 1.8;
const PALP_HOLD = 0.6;
const PRESS_TIME = 0.6;

// ---------------------------------------------------------------- petits sons (facultatifs)

function sfx(kind) {
  const c = audio.ready?.();
  if (!c) return;
  const d = audio.sfx;
  const t0 = c.currentTime;
  try {
    if (kind === 'beat') {
      audio.tone(d, { f: 64, curve: [[0.08, 40]], dur: 0.1, gain: 0.32, t: t0, attack: 0.004 });
      audio.tone(d, { f: 56, curve: [[0.07, 38]], dur: 0.08, gain: 0.22, t: t0 + 0.14, attack: 0.004 });
    } else if (kind === 'beep') {
      audio.tone(d, { type: 'square', f: 2300, dur: 0.1, gain: 0.04, t: t0, filter: { type: 'lowpass', f: 3200 } });
      audio.tone(d, { type: 'square', f: 2300, dur: 0.1, gain: 0.04, t: t0 + 0.16, filter: { type: 'lowpass', f: 3200 } });
    } else if (kind === 'breath') {
      audio.burst(d, { t: t0, dur: 1.1, gain: 0.05, attack: 0.4, filter: { type: 'bandpass', f: 650, q: 0.6 } });
    } else if (kind === 'crackle') {
      for (let i = 0; i < 7; i++) audio.burst(d, { t: t0 + i * 0.09 + Math.random() * 0.04, dur: 0.03, gain: 0.08, filter: { type: 'highpass', f: 1800 }, decay: 'exp' });
    } else if (kind === 'wheeze') {
      audio.tone(d, { f: 880, curve: [[0.7, 1040]], dur: 0.75, gain: 0.025, t: t0, attack: 0.15, vibrato: { rate: 8, depth: 25 } });
    } else if (kind === 'gurgle') {
      for (let i = 0; i < 3; i++) audio.tone(d, { f: 150 + i * 40, curve: [[0.18, 90 + i * 30]], dur: 0.2, gain: 0.07, t: t0 + i * 0.22, filter: { type: 'lowpass', f: 500 } });
    } else if (kind === 'loudGut') {
      for (let i = 0; i < 5; i++) audio.tone(d, { type: 'triangle', f: 120 + i * 25, curve: [[0.2, 70]], dur: 0.24, gain: 0.1, t: t0 + i * 0.15, filter: { type: 'lowpass', f: 600 } });
    }
  } catch {
    /* un son raté ne casse rien */
  }
}

// ---------------------------------------------------------------- géométrie

/** Où sont les zones à examiner sur l'animal dessiné (selon sa forme). */
export function zonePoints(sh, a) {
  const { rx, ry, L, hr, head, s, f } = sh;
  const sp = a.species;
  const earType = a.look?.earType ?? sp;
  const legMid = (lx) => {
    const top = L(lx, ry * 0.35);
    return { x: top.x, y: lerp(top.y, sh.groundY, 0.5) };
  };
  const sn = (sh.P.snout ?? 10) * s * (a.look?.snout ?? 1);
  let nose;
  if (sp === 'horse' || sp === 'goat') nose = { x: head.x + f * hr * 1.75, y: head.y + hr * 1.1 };
  else if (sp === 'cow') nose = { x: head.x + f * hr * 1.05, y: head.y + hr * 0.5 };
  else if (sp === 'sheep') nose = { x: head.x + f * hr * 1.05, y: head.y + hr * 0.45 };
  else nose = { x: head.x + f * (hr * 0.85 + sn * 0.75), y: head.y + hr * 0.12 };
  let ear;
  if (earType === 'floppy' || earType === 'lop') ear = { x: head.x - f * hr * 0.3, y: head.y + hr * 0.15 };
  else if (earType === 'rabbit') ear = { x: head.x - f * hr * 0.1, y: head.y - hr * 1.45 };
  else if (earType === 'cow' || earType === 'sheep') ear = { x: head.x - f * hr * 0.8, y: head.y - hr * 0.62 };
  else ear = { x: head.x - f * hr * 0.12, y: head.y - hr * 0.98 };
  const Z = (p, r) => ({ x: p.x, y: p.y, r: Math.max(17, r) });
  return {
    heart: Z(L(rx * 0.42, ry * 0.36), ry * 0.36),
    lungs: Z(L(rx * 0.08, -ry * 0.28), ry * 0.42),
    gut: Z(sp === 'horse' ? L(-rx * 0.42, ry * 0.08) : L(-rx * 0.42, ry * 0.25), ry * 0.38),
    rump: Z(L(-rx * 0.92, -ry * 0.06), ry * 0.3),
    back: Z(L(-rx * 0.15, -ry * 0.6), ry * 0.36),
    belly: Z(L(-rx * 0.05, ry * 0.62), ry * 0.36),
    legFront: Z(legMid(rx * 0.58), sh.P.legW * s * 1.5),
    legHind: Z(legMid(-rx * 0.58), sh.P.legW * s * 1.5),
    eye: Z({ x: head.x + f * hr * 0.28, y: head.y - hr * 0.15 }, hr * 0.38),
    ear: Z(ear, hr * 0.45),
    nose: Z(nose, hr * 0.36),
    mouth: Z(sh.mouth, hr * 0.4),
  };
}

const fmt1 = (n) => {
  const s = (Math.round(n * 10) / 10).toFixed(1);
  return getLang() === 'fr' ? s.replace('.', ',') : s;
};

// ---------------------------------------------------------------- la scène

export class VetStage {
  /**
   * a : l'animal ; cs : son cas (makeCase de src/sim/vetExam.js).
   * o : {
   *   measure(id, input) → résultat de evaluate() (déjà écrit dans le carnet par le contrôleur), ou { retry },
   *   hint(text, kind),             consigne sous la scène ('' | 'good' | 'warn')
   *   doneOf(measure) → 'ok' | 'bad' | null (pour les petites coches sur les zones),
   *   demo: [zones] (leçon : zones montrées avec leur nom, sans outil),
   * }
   */
  constructor(a, cs, o = {}) {
    this.a = a;
    this.cs = cs;
    this.o = o;
    this.canvas = h('canvas', { class: 'vx-canvas' });
    this.overlay = h('div', { class: 'vx-stage-ui' });
    this.el = h('div', { class: 'vx-stage' }, this.canvas, this.overlay);
    this.g = this.canvas.getContext('2d');
    this.view = { scale: 1, ox: 0, oy: 0, x0: 0, y0: 0, x1: SW, y1: SH };
    this.dpr = 1;
    this.small = SMALL.includes(a.species);
    this.groundY = this.small ? 222 : 274;
    const fit = fitAnimal(a, { cx: this.small ? 194 : 196, groundY: this.groundY, maxW: this.small ? 262 : 344, maxH: this.small ? 172 : 236 });
    this.base = fit;
    this.anim = { x: fit.x, f: 1, walk: null, headDip: 0, lift: 0, shake: 0, earsBack: 0, happy: 0 };
    this.tool = null;
    this.mode = 'idle';
    this.st = {}; // état du geste en cours
    this.fx = [];
    this.time = 0;
    this.pointer = { x: SW / 2, y: SH / 2, down: false, over: false };
    this.attempts = 0; // comptes du cœur ratés
    this.onScale = false;
    this.rng = makeRng((a.look?.seed ?? 5) + 11);
    this.straw = Array.from({ length: 70 }, () => [this.rng(), this.rng(), this.rng()]);
    this.demo = o.demo ?? null;

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
    this.resize();
    this.bindInput();
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener('keydown', this.onKey, true);
  }

  hint(text, kind = '') {
    this.o.hint?.(text, kind);
  }

  // ------------------------------------------------------------ cadre

  resize() {
    const r = this.el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    const sc = Math.min(r.width / SW, r.height / SH) || 1;
    const v = this.view;
    v.scale = sc;
    v.ox = (r.width - SW * sc) / 2;
    v.oy = (r.height - SH * sc) / 2;
    v.x0 = -v.ox / sc;
    v.y0 = -v.oy / sc;
    v.x1 = SW + v.ox / sc;
    v.y1 = SH + v.oy / sc;
  }

  toLocal(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.view.ox) / this.view.scale, y: (e.clientY - r.top - this.view.oy) / this.view.scale };
  }

  bindInput() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const p = this.toLocal(e);
      Object.assign(this.pointer, p, { down: true, over: true });
      c.setPointerCapture?.(e.pointerId);
      this.down(p);
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.toLocal(e);
      Object.assign(this.pointer, p, { over: true });
    });
    const up = (e) => {
      const p = this.toLocal(e);
      Object.assign(this.pointer, p, { down: false, over: e.pointerType === 'mouse' });
      this.up(p);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.pointer.over = false; });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    // Ordinateur : Espace = un battement pendant le comptage.
    this.onKey = (e) => {
      if (this.mode !== 'count' || e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      this.beatTap(this.zones().heart);
    };
    window.addEventListener('keydown', this.onKey, true);
  }

  // ------------------------------------------------------------ outils

  /** Choisit un outil de la trousse (null = aucun). */
  setTool(tool) {
    this.cancel();
    this.tool = tool;
    this.onScale = tool === 'scale';
    const name = this.a.name;
    if (!tool) return this.hint(t('vx_h_start'));
    if (tool === 'walk') return this.hint(ta('vx_h_walk', this.a));
    if (tool === 'scale') return this.hint(t('vx_h_scale', { name }));
    if (tool === 'palpate') return this.hint(ta('vx_h_palpate', this.a));
    return this.hint(t(`vx_h_${tool}`, { name }));
  }

  /** Met la scène en pause (diagnostic, traitement : elle est cachée). */
  pause(on) {
    if (on === this.paused) return;
    this.paused = on;
    if (!on) {
      this.last = performance.now();
      this.resize();
    }
  }

  /** Arrête le geste en cours (changement d'outil). */
  cancel() {
    this.mode = 'idle';
    this.st = {};
    this.anim.walk = null;
    this.anim.x = this.base.x;
    this.anim.f = 1;
    this.anim.headDip = 0;
    this.anim.lift = 0;
    this.overlay.replaceChildren();
  }

  /** Le geste est fini : on revient à l'outil choisi. */
  idle() {
    this.mode = 'idle';
    this.st = {};
    this.overlay.replaceChildren();
  }

  shape(extra = {}) {
    const an = this.anim;
    const plate = this.onScale ? (this.small ? 7 : 9) : 0;
    return animalShape(this.a, {
      x: an.x, y: this.groundY - plate, s: this.base.s, f: an.f, lift: an.lift, headDip: an.headDip, pose: 'stand', ...extra,
    });
  }

  zones() {
    return zonePoints(this.shape(), this.a);
  }

  /** La zone de l'outil sous le doigt (la plus proche), ou null. */
  zoneAt(p, tool = this.tool) {
    const list = TOOL_ZONES[tool] ?? [];
    const z = this.zones();
    let best = null;
    let bestD = Infinity;
    for (const id of list) {
      const q = z[id];
      const d = dist(p.x, p.y, q.x, q.y);
      if (d <= q.r + 12 && d < bestD) {
        best = id;
        bestD = d;
      }
    }
    return best;
  }

  measure(id, input) {
    return this.o.measure?.(id, input) ?? null;
  }

  // ------------------------------------------------------------ toucher

  down(p) {
    if (this.demo) return;
    const m = this.mode;
    if (m === 'count') return this.beatTap(p);
    if (m === 'mouth') return this.mouthDown(p);
    if (m !== 'idle' && m !== 'palp') return;
    const tool = this.tool;
    if (!tool) return this.hint(t('vx_h_start'), 'warn');
    if (tool === 'walk') return this.startWalk();
    if (tool === 'scale') return this.startWeigh();
    if (tool === 'palpate') {
      this.mode = 'palp';
      this.st = { zone: null, held: 0, done: false };
      return;
    }
    const zone = this.zoneAt(p);
    if (!zone) return this.hint(t('vx_h_zone'), 'warn');
    if (tool === 'stetho') {
      if (zone === 'heart') return this.startCount();
      return this.startListen(zone);
    }
    if (tool === 'thermo') return this.startThermo();
    if (tool === 'light') return this.startLens(zone);
    if (tool === 'mouth') return this.startMouth();
    return null;
  }

  up() {
    if (this.mode === 'palp') this.idle();
    else if (this.mode === 'mouth') this.mouthUp();
  }

  // ------------------------------------------------------------ 🩺 compter le cœur

  startCount() {
    this.mode = 'count';
    const slow = slowmoOf(this.a.species);
    this.st = { started: null, taps: 0, beatT0: this.time, period: 60 / (this.cs.heart / slow), lastBeat: -1, slow, ended: false };
    this.hint(t(slow > 1 ? 'vx_h_countReadySlow' : 'vx_h_countReady'));
    this.overlay.replaceChildren(h('div', { class: 'vx-count-badge' }, slow > 1 ? `🐢 ${t('vx_slowmo')}` : `⏱️ ${COUNT_SECONDS} s`));
  }

  beatTap(p) {
    const st = this.st;
    if (st.ended) return;
    if (st.started === null) {
      st.started = this.time;
      this.hint(t('vx_h_countGo'));
    }
    st.taps++;
    this.addFx({ x: p.x, y: p.y, ring: true, color: '#e0574a', life: 0.5 });
    this.addFx({ x: p.x, y: p.y - 14, text: `${st.taps}`, color: '#c8463c', size: 18, vy: -50, life: 0.7 });
  }

  updateCount() {
    const st = this.st;
    const beatIndex = Math.floor((this.time - st.beatT0) / st.period);
    if (beatIndex !== st.lastBeat) {
      st.lastBeat = beatIndex;
      sfx('beat');
    }
    if (st.started === null || st.ended) return;
    if (this.time - st.started >= COUNT_SECONDS) {
      st.ended = true;
      const assisted = this.attempts >= 2;
      const r = this.measure('heart', assisted ? { assisted: true } : { count: st.taps, seconds: COUNT_SECONDS });
      if (r?.retry) {
        this.attempts++;
        const key = this.attempts >= 2 ? 'vx_h_countHelp' : r.reason === 'few' ? 'vx_h_countFew' : 'vx_h_countMany';
        this.hint(t(key, { n: st.taps }), 'warn');
        // On recompte (à la deuxième erreur, le docteur aide).
        setTimeout(() => {
          if (this.dead || this.mode !== 'count') return;
          if (this.attempts >= 2) {
            this.measure('heart', { assisted: true });
            this.attempts = 0;
            this.idle();
          } else {
            Object.assign(this.st, { started: null, taps: 0, ended: false });
          }
        }, 1600);
        return;
      }
      this.attempts = 0;
      this.idle();
    }
  }

  // ------------------------------------------------------------ 🩺 écouter poumons / ventre

  startListen(zone) {
    this.mode = 'listen';
    this.st = { zone, t0: this.time, sound: zone === 'lungs' ? this.cs.lungs : this.cs.gut, next: 0 };
    this.hint(t('vx_h_listening'));
  }

  updateListen() {
    const st = this.st;
    const k = this.time - st.t0;
    if (k >= st.next) {
      st.next += 1.1;
      if (st.zone === 'lungs') sfx(st.sound === 'crackles' ? 'crackle' : st.sound === 'wheeze' ? 'wheeze' : 'breath');
      else if (st.sound === 'normal') sfx('gurgle');
      else if (st.sound === 'loud') sfx('loudGut');
    }
    if (k >= LISTEN_TIME) {
      this.measure(st.zone === 'lungs' ? 'lungs' : 'gut');
      this.idle();
    }
  }

  // ------------------------------------------------------------ 🌡️ température

  startThermo() {
    this.mode = 'thermo';
    this.st = { t0: this.time, beeped: false };
    this.hint(t('vx_h_thermoWait'));
  }

  updateThermo() {
    const st = this.st;
    if (!st.beeped && this.time - st.t0 >= THERMO_TIME) {
      st.beeped = true;
      sfx('beep');
      this.addFx({ x: this.zones().rump.x, y: this.zones().rump.y - 64, text: t('vx_beep'), color: '#2f6fb0', size: 20, vy: -30, life: 1 });
      this.measure('temp');
      setTimeout(() => { if (!this.dead && this.mode === 'thermo') this.idle(); }, 1100);
    }
  }

  // ------------------------------------------------------------ 🔦 lampe (loupe)

  startLens(zone) {
    this.mode = 'lens';
    this.st = { zone, t0: this.time, done: false };
    const m = measureFor('light', zone);
    this.hint(t(`vx_h_look_${m}`, { name: this.a.name }));
  }

  updateLens() {
    const st = this.st;
    if (!st.done && this.time - st.t0 >= LENS_TIME * 0.6) {
      st.done = true;
      this.measure(measureFor('light', st.zone));
    }
    if (this.time - st.t0 >= LENS_TIME + 0.6) this.idle();
  }

  // ------------------------------------------------------------ 🦷 bouche et recoloration

  startMouth() {
    this.mode = 'mouth';
    this.st = { press: null, pressAt: null, release: null, done: false, spot: null };
    this.measure('gums');
    this.hint(t('vx_h_gums'));
    this.overlay.replaceChildren(h('button', { class: 'vx-stage-btn back', onClick: () => this.idle() }, `↩ ${t('vx_btn_backAnimal')}`));
  }

  /** La gencive dans la vue de la bouche (bande du milieu). */
  inGum(p) {
    return p.y > 102 && p.y < 182 && p.x > 40 && p.x < 360;
  }

  mouthDown(p) {
    const st = this.st;
    if (st.release !== null && !st.done) return; // on attend que ce soit rose
    if (!this.inGum(p)) return;
    st.press = this.time;
    st.spot = { x: p.x, y: p.y };
    st.release = null;
    st.done = false;
  }

  mouthUp() {
    const st = this.st;
    if (st.press === null) return;
    const held = this.time - st.press;
    st.press = null;
    if (held < PRESS_TIME) {
      st.spot = null;
      return this.hint(t('vx_h_press'), 'warn');
    }
    st.release = this.time;
    this.hint(t('vx_h_crtWatch'));
    this.overlay.replaceChildren(
      h('button', { class: 'vx-stage-btn back', onClick: () => this.idle() }, `↩ ${t('vx_btn_backAnimal')}`),
      h('button', { class: 'vx-stage-btn pink', onClick: () => this.pinkAgain() }, t('vx_btn_pink')));
  }

  pinkAgain() {
    const st = this.st;
    if (st.release === null || st.done) return;
    const seconds = this.time - st.release;
    const r = this.measure('crt', { seconds });
    if (r?.retry) return this.hint(t('vx_h_crtEarly'), 'warn');
    st.done = true;
    st.counted = r?.value ?? seconds;
    this.overlay.replaceChildren(h('button', { class: 'vx-stage-btn back', onClick: () => this.idle() }, `↩ ${t('vx_btn_backAnimal')}`));
    return null;
  }

  // ------------------------------------------------------------ 👆 palper

  updatePalp(dt) {
    const st = this.st;
    if (!this.pointer.down) return;
    const zone = this.zoneAt(this.pointer, 'palpate');
    if (zone !== st.zone) {
      st.zone = zone;
      st.held = 0;
      st.done = false;
    }
    if (!zone || st.done) return;
    st.held += dt;
    if (st.held < PALP_HOLD) return;
    st.done = true;
    const r = this.measure(measureFor('palpate', zone));
    const z = this.zones()[zone];
    if (r?.status === 'bad') {
      this.anim.shake = 0.7;
      this.anim.earsBack = 1.6;
      audio.animal?.(this.a.species, 'sad');
      this.addFx({ x: z.x, y: z.y, ring: true, color: '#e0574a', life: 0.7, r: z.r });
      this.addFx({ x: z.x, y: z.y - 30, emoji: '😣', size: 30, vy: -40, life: 1.1 });
      this.addFx({ x: z.x + 30, y: z.y - 22, text: t('vx_ouch'), color: '#c8463c', size: 20, vy: -40, life: 1.1 });
    } else {
      this.anim.happy = 1;
      this.addFx({ x: z.x, y: z.y, ring: true, color: '#3fae62', life: 0.6, r: z.r });
      this.addFx({ x: z.x, y: z.y - 28, emoji: '😌', size: 24, vy: -36, life: 1 });
    }
  }

  // ------------------------------------------------------------ ⚖️ peser

  startWeigh() {
    this.mode = 'weigh';
    this.st = { t0: this.time, done: false };
    this.hint(t('vx_h_weighing'));
  }

  updateWeigh() {
    const k = this.time - this.st.t0;
    this.anim.lift = k < 0.5 ? Math.sin((k / 0.5) * Math.PI) * 10 * this.base.s : 0;
    if (!this.st.done && k >= WEIGH_TIME) {
      this.st.done = true;
      sfx('beep');
      this.measure('weight');
      setTimeout(() => { if (!this.dead && this.mode === 'weigh') this.idle(); }, 900);
    }
  }

  // ------------------------------------------------------------ 👣 faire marcher

  startWalk() {
    this.overlay.replaceChildren();
    this.mode = 'walk';
    const span = this.small ? 62 : 66;
    const x0 = this.base.x;
    // Il part à gauche, revient vers la droite, puis reprend sa place.
    this.st = { legs: [{ to: x0 - span, f: -1 }, { to: x0 + span * 0.8, f: 1 }, { to: x0, f: -1 }], phase: 0, lastSin: 0 };
    this.anim.walk = 0;
    this.hint(t('vx_h_watchWalk'));
  }

  updateWalk(dt) {
    const st = this.st;
    const an = this.anim;
    const leg = st.legs[0];
    if (!leg) {
      an.walk = null;
      an.headDip = 0;
      an.lift = 0;
      an.f = 1;
      this.askGait();
      return;
    }
    an.f = leg.f;
    const lame = this.cs.lame;
    const sinp = Math.sin(st.phase);
    const slowdown = lame ? 1 - 0.4 * Math.max(0, sinp) : 1;
    const speed = (this.small ? 58 : 66) * this.base.s * slowdown;
    const dx = Math.sign(leg.to - an.x) * Math.min(Math.abs(leg.to - an.x), speed * dt);
    an.x += dx;
    st.phase += Math.abs(dx) * 0.085 / this.base.s;
    an.walk = st.phase;
    if (lame === 'front') {
      an.headDip = 0.03 * Math.sin(st.phase * 2) - 0.16 * Math.max(0, sinp) ** 2;
      an.lift = 0;
    } else if (lame === 'hind') {
      an.headDip = 0.05 * Math.max(0, sinp);
      an.lift = 4 * this.base.s * Math.max(0, sinp) ** 2;
    } else {
      an.headDip = 0.025 * Math.sin(st.phase * 2);
      an.lift = 0;
    }
    // La patte qui fait mal touche le sol : petite grimace.
    if (lame && st.lastSin < 0.95 && sinp >= 0.95) {
      const z = this.zones()[lame === 'front' ? 'legFront' : 'legHind'];
      this.addFx({ x: z.x + 16 * an.f, y: z.y, emoji: '😣', size: 18, vy: -20, life: 0.8 });
    }
    st.lastSin = sinp;
    if (Math.abs(leg.to - an.x) < 0.5) st.legs.shift();
  }

  askGait() {
    this.mode = 'ask';
    this.hint(t('vx_q_walk', { g: this.a.sex }));
    const answer = (v) => {
      const r = this.measure('gait', { answer: v });
      if (r?.retry) {
        this.hint(t(this.cs.lame ? 'vx_h_walkWrongLame' : 'vx_h_walkWrongSound'), 'warn');
        return;
      }
      this.idle();
    };
    this.overlay.replaceChildren(h('div', { class: 'vx-stage-row' },
      h('button', { class: 'vx-stage-btn ok', onClick: () => answer('sound') }, t('vx_btn_sound', { g: this.a.sex })),
      h('button', { class: 'vx-stage-btn bad', onClick: () => answer('lame') }, t('vx_btn_lame', { g: this.a.sex })),
      h('button', { class: 'vx-stage-btn', onClick: () => this.startWalk(), 'aria-label': t('vx_btn_replay') }, '🔁')));
  }

  // ------------------------------------------------------------ boucle

  loop(now) {
    if (this.dead) return;
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) {
      this.time += dt;
      this.update(dt);
      this.draw();
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  update(dt) {
    const an = this.anim;
    an.shake = Math.max(0, an.shake - dt);
    an.earsBack = Math.max(0, an.earsBack - dt);
    an.happy = Math.max(0, an.happy - dt);
    switch (this.mode) {
      case 'count': this.updateCount(); break;
      case 'listen': this.updateListen(); break;
      case 'thermo': this.updateThermo(); break;
      case 'lens': this.updateLens(); break;
      case 'palp': this.updatePalp(dt); break;
      case 'weigh': this.updateWeigh(); break;
      case 'walk': this.updateWalk(dt); break;
      default:
    }
    for (const p of this.fx) {
      p.age += dt;
      p.x += (p.vx ?? 0) * dt;
      p.y += (p.vy ?? 0) * dt;
    }
    if (this.fx.length) this.fx = this.fx.filter((p) => p.age < p.life);
  }

  addFx(p) {
    this.fx.push({ age: 0, life: 1, ...p });
    if (this.fx.length > 60) this.fx.shift();
  }

  // ------------------------------------------------------------ dessin

  draw() {
    const g = this.g;
    const v = this.view;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(this.dpr * v.scale, 0, 0, this.dpr * v.scale, this.dpr * v.ox, this.dpr * v.oy);
    if (this.mode === 'mouth') {
      this.drawMouth(g);
    } else {
      this.drawRoom(g);
      if (this.tool === 'scale') this.drawScale(g);
      const sh = this.drawPatient(g);
      this.drawSigns(g, sh, false);
      if (this.demo) this.drawDemo(g, sh);
      else this.drawZones(g, sh);
      this.drawGesture(g, sh);
      if (this.tool === 'scale') this.drawScaleScreen(g);
    }
    this.drawFx(g);
    if (!this.demo) this.drawCursor(g);
  }

  drawRoom(g) {
    const v = this.view;
    const W0 = v.x0;
    const W = v.x1 - v.x0;
    if (this.small) {
      // Salle de consultation : mur clair, carrelage, table d'examen en inox.
      const wall = g.createLinearGradient(0, v.y0, 0, 250);
      wall.addColorStop(0, '#e9f4f1');
      wall.addColorStop(1, '#d3e7e0');
      g.fillStyle = wall;
      g.fillRect(W0, v.y0, W, 250 - v.y0);
      g.fillStyle = '#bcd6cd';
      g.fillRect(W0, 246, W, 6);
      g.fillStyle = '#e3e8e6';
      g.fillRect(W0, 252, W, v.y1 - 252);
      g.strokeStyle = 'rgba(120,140,135,0.25)';
      g.lineWidth = 1;
      for (let x = Math.floor(W0 / 32) * 32; x < v.x1; x += 32) {
        g.beginPath();
        g.moveTo(x, 252);
        g.lineTo(x - 12, v.y1);
        g.stroke();
      }
      // Affiche et étagère
      g.fillStyle = '#ffffff';
      rrect(g, 22, 22, 74, 92, 8);
      g.fill();
      g.strokeStyle = '#c9ddd6';
      g.lineWidth = 2;
      g.stroke();
      g.font = `34px ${EMOJI_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('🐾', 59, 56);
      g.fillStyle = '#7bbfa8';
      rrect(g, 34, 86, 50, 6, 3);
      g.fill();
      rrect(g, 34, 98, 34, 6, 3);
      g.fill();
      g.fillStyle = '#c9b49a';
      rrect(g, 300, 54, 86, 8, 3);
      g.fill();
      g.font = `20px ${EMOJI_FONT}`;
      g.fillText('🧴', 318, 42);
      g.fillText('💊', 346, 44);
      g.fillText('🩹', 370, 44);
      // Table
      const ty = this.groundY;
      g.fillStyle = '#9aa6ad';
      g.fillRect(92, ty + 10, 10, 290 - ty);
      g.fillRect(298, ty + 10, 10, 290 - ty);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      ellipse(g, 200, 292, 140, 6);
      g.fill();
      const top = g.createLinearGradient(0, ty, 0, ty + 16);
      top.addColorStop(0, '#f4f7f8');
      top.addColorStop(1, '#a9b5bc');
      g.fillStyle = top;
      rrect(g, 58, ty, 284, 15, 6);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(66, ty + 2, 268, 2);
    } else {
      // Box d'écurie : planches de bois, poutre, paille au sol.
      const wall = g.createLinearGradient(0, v.y0, 0, 260);
      wall.addColorStop(0, '#d8b48a');
      wall.addColorStop(1, '#b98d60');
      g.fillStyle = wall;
      g.fillRect(W0, v.y0, W, 262 - v.y0);
      g.strokeStyle = 'rgba(90,55,25,0.25)';
      g.lineWidth = 2;
      for (let x = Math.floor(W0 / 36) * 36; x < v.x1; x += 36) {
        g.beginPath();
        g.moveTo(x, v.y0);
        g.lineTo(x, 262);
        g.stroke();
      }
      g.fillStyle = '#8a5d36';
      g.fillRect(W0, 40, W, 12);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(W0, 40, W, 3);
      // Fenêtre
      g.fillStyle = '#9fd0ea';
      rrect(g, 300, 70, 70, 52, 6);
      g.fill();
      g.strokeStyle = '#6e4826';
      g.lineWidth = 4;
      g.stroke();
      g.beginPath();
      g.moveTo(335, 70);
      g.lineTo(335, 122);
      g.stroke();
      const floor = g.createLinearGradient(0, 258, 0, v.y1);
      floor.addColorStop(0, '#e7cf87');
      floor.addColorStop(1, '#d6b765');
      g.fillStyle = floor;
      g.fillRect(W0, 258, W, v.y1 - 258);
      g.strokeStyle = 'rgba(160,120,40,0.55)';
      g.lineWidth = 1.4;
      for (const [a, b, c] of this.straw) {
        const x = W0 + a * W;
        const y = 262 + b * (v.y1 - 262);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (c - 0.5) * 22, y + (c - 0.3) * 5);
        g.stroke();
      }
    }
  }

  /** Le plateau de la balance, sous l'animal. */
  drawScale(g) {
    const sh = this.shape();
    const w = sh.rx * 2.4;
    const y = this.groundY - (this.small ? 7 : 9);
    g.fillStyle = '#5f6b72';
    rrect(g, sh.bx - w / 2, y, w, this.small ? 7 : 9, 3);
    g.fill();
    g.fillStyle = '#88959c';
    rrect(g, sh.bx - w / 2, y, w, 3, 2);
    g.fill();
  }

  /** L'écran de la balance, à côté de l'animal (les chiffres montent pendant la pesée). */
  drawScaleScreen(g) {
    const kg = this.mode === 'weigh' ? this.cs.kg * clamp((this.time - this.st.t0 - 0.4) / (WEIGH_TIME - 0.6)) : this.o.doneOf?.('weight') ? this.cs.kg : 0;
    const bw = 104;
    const bx = SW - bw - 12;
    const by = this.small ? 128 : 150;
    g.fillStyle = '#2b3338';
    rrect(g, bx, by, bw, 40, 10);
    g.fill();
    g.strokeStyle = '#88959c';
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = '#9ff2b8';
    g.font = `800 20px ${TEXT_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`${kg >= 20 ? Math.round(kg) : fmt1(kg)} kg`, bx + bw / 2, by + 21);
    g.font = `14px ${EMOJI_FONT}`;
    g.fillText('⚖️', bx + 10, by - 2);
    // Le fil vers le plateau
    g.strokeStyle = '#2b3338';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(bx + bw / 2, by + 40);
    g.quadraticCurveTo(bx + bw / 2, this.groundY - 4, bx - 10, this.groundY - 4);
    g.stroke();
  }

  drawPatient(g) {
    const an = this.anim;
    const tired = this.cs.illness === 'flu' && this.time % 3.4 < 1.3;
    const plate = this.onScale ? (this.small ? 7 : 9) : 0;
    return drawAnimal(g, this.a, {
      x: an.x,
      y: this.groundY - plate,
      s: this.base.s,
      f: an.f,
      walk: an.walk,
      headDip: an.headDip,
      lift: an.lift,
      shake: an.shake > 0 ? 0.6 : 0,
      earsBack: an.earsBack > 0 || this.cs.illness === 'ear',
      blink: tired,
      happy: an.happy > 0,
      time: this.time,
    });
  }

  /** Ce qu'on voit sur l'animal malade (en petit ; la loupe le montre en grand). */
  drawSigns(g, sh, zoomed) {
    const cs = this.cs;
    const z = zonePoints(sh, this.a);
    const s = sh.s;
    if (cs.nose === 'runny') {
      const drip = (this.time * 0.6) % 1;
      g.fillStyle = 'rgba(190, 225, 240, 0.95)';
      ellipse(g, z.nose.x + 1 * s, z.nose.y + 4 * s + drip * 5 * s, 2.2 * s, (2.6 + drip * 2) * s);
      g.fill();
    }
    if (cs.eyes === 'watery') {
      g.strokeStyle = 'rgba(150, 205, 235, 0.95)';
      g.lineWidth = 1.8 * s;
      g.beginPath();
      g.moveTo(z.eye.x - 1 * s, z.eye.y + 4 * s);
      g.quadraticCurveTo(z.eye.x - 3 * s, z.eye.y + 9 * s, z.eye.x - 1.5 * s, z.eye.y + 14 * s);
      g.stroke();
      g.strokeStyle = 'rgba(220, 80, 90, 0.55)';
      g.lineWidth = 1 * s;
      circle(g, z.eye.x, z.eye.y, 6.3 * s);
      g.stroke();
    }
    if (cs.ears === 'red') {
      g.fillStyle = 'rgba(214, 60, 50, 0.38)';
      ellipse(g, z.ear.x, z.ear.y, 5 * s, 8 * s);
      g.fill();
      if (zoomed) {
        g.fillStyle = 'rgba(90, 50, 20, 0.8)';
        for (let i = 0; i < 6; i++) {
          circle(g, z.ear.x + Math.cos(i * 2.1) * 3 * s, z.ear.y + Math.sin(i * 1.7) * 5 * s, 0.9 * s);
          g.fill();
        }
      }
    }
    if (cs.coat === 'fleas') {
      // Des puces un peu partout sur le dos, et un petit groupe là où regarde la loupe (pelage).
      g.fillStyle = '#1b130e';
      g.strokeStyle = '#1b130e';
      for (let i = 0; i < 16; i++) {
        const near = i >= 9;
        const hop = Math.max(0, Math.sin(this.time * 7 + i * 2.3)) * (near ? 1.6 : 3) * s;
        const p = near
          ? { x: z.back.x + Math.sin(i * 4.1) * z.back.r * 0.55, y: z.back.y + Math.cos(i * 2.7) * z.back.r * 0.45 }
          : sh.L((Math.sin(i * 12.9) * 0.55 - 0.15) * sh.rx, (Math.cos(i * 7.3) * 0.35 - 0.45) * sh.ry);
        ellipse(g, p.x, p.y - hop, 1.1 * s, 0.7 * s, 0.4);
        g.fill();
        if (zoomed) {
          // Les pattes, visibles seulement à la loupe.
          g.lineWidth = 0.25 * s;
          for (const d of [-0.8, 0, 0.8]) {
            g.beginPath();
            g.moveTo(p.x + d * 0.6 * s, p.y - hop + 0.4 * s);
            g.lineTo(p.x + d * 1.2 * s, p.y - hop + 1.3 * s);
            g.stroke();
          }
        }
      }
    }
  }

  /** Leçon : les zones montrées avec leur nom (chaque étiquette de son côté, avec un petit trait). */
  drawDemo(g, sh) {
    const z = zonePoints(sh, this.a);
    const DIR = { heart: 'right', lungs: 'up', gut: 'down', rump: 'left', back: 'up', belly: 'down', legFront: 'right', legHind: 'left', eye: 'left', ear: 'up', nose: 'right', mouth: 'down' };
    const HEAD = ['eye', 'ear', 'nose', 'mouth'];
    for (const id of this.demo) {
      const q0 = z[id];
      // Les zones de la tête sont petites : des cercles plus fins pour qu'elles ne se cachent pas.
      const q = HEAD.includes(id) ? { x: q0.x, y: q0.y, r: Math.max(10, q0.r * 0.62) } : q0;
      const pulse = 1 + Math.sin(this.time * 3) * 0.06;
      g.fillStyle = 'rgba(255, 233, 120, 0.35)';
      circle(g, q.x, q.y, q.r * pulse);
      g.fill();
      g.strokeStyle = '#e8a91a';
      g.lineWidth = 2.5;
      g.stroke();
      const label = `${ZONE_EMOJI[id]} ${t(`vx_zone_${id}`)}`;
      g.font = `800 12px ${TEXT_FONT}`;
      const w = g.measureText(label).width + 12;
      const hh = 18;
      const dir = DIR[id] ?? 'up';
      const gap = 16;
      let cx = q.x;
      let cy = q.y;
      if (dir === 'up') cy = q.y - q.r - gap;
      else if (dir === 'down') cy = q.y + q.r + gap;
      else if (dir === 'left') cx = q.x - q.r - gap - w / 2;
      else cx = q.x + q.r + gap + w / 2;
      cx = clamp(cx, w / 2 + 4, SW - w / 2 - 4);
      cy = clamp(cy, hh / 2 + 4, SH - hh / 2 - 4);
      g.strokeStyle = '#b07a00';
      g.lineWidth = 1.5;
      g.beginPath();
      const ang = Math.atan2(cy - q.y, cx - q.x);
      g.moveTo(q.x + Math.cos(ang) * q.r, q.y + Math.sin(ang) * q.r);
      g.lineTo(cx, cy);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.96)';
      rrect(g, cx - w / 2, cy - hh / 2, w, hh, 9);
      g.fill();
      g.strokeStyle = '#e8a91a';
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = '#5b3d00';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, cx, cy + 0.5);
    }
  }

  drawZones(g, sh) {
    if (!this.tool || !['idle', 'palp'].includes(this.mode)) return;
    const list = TOOL_ZONES[this.tool];
    if (!list) return;
    const z = zonePoints(sh, this.a);
    const active = this.mode === 'palp' ? this.st.zone : null;
    for (const id of list) {
      const q = z[id];
      const m = measureFor(this.tool, id);
      const done = this.o.doneOf?.(m);
      const pulse = 1 + Math.sin(this.time * 4 + q.x * 0.05) * 0.08;
      g.fillStyle = active === id ? 'rgba(255, 210, 63, 0.45)' : 'rgba(255, 255, 255, 0.28)';
      circle(g, q.x, q.y, q.r * pulse);
      g.fill();
      g.setLineDash([5, 4]);
      g.lineDashOffset = -this.time * 12;
      g.strokeStyle = done ? (done === 'bad' ? '#e0574a' : '#3fae62') : '#ffd23f';
      g.lineWidth = 2.5;
      g.stroke();
      g.setLineDash([]);
      // Petite étiquette (emoji) et coche quand c'est fait.
      const bx = q.x + q.r * 0.72;
      const by = q.y - q.r * 0.72;
      g.fillStyle = 'rgba(255,255,255,0.95)';
      circle(g, bx, by, 9.5);
      g.fill();
      g.font = `11px ${EMOJI_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(done ? (done === 'bad' ? '⚠️' : '✅') : ZONE_EMOJI[id], bx, by + 0.5);
    }
  }

  drawGesture(g, sh) {
    const z = zonePoints(sh, this.a);
    const st = this.st;
    if (this.mode === 'count') this.drawCount(g, z.heart);
    else if (this.mode === 'listen') this.drawListen(g, z[st.zone]);
    else if (this.mode === 'thermo') this.drawThermo(g, z.rump);
    else if (this.mode === 'lens') this.drawLens(g, z[st.zone]);
    else if (this.mode === 'palp' && this.pointer.down) {
      const zone = st.zone && z[st.zone];
      if (zone && !st.done) {
        // Anneau qui se remplit pendant qu'on garde le doigt posé.
        g.strokeStyle = '#ffd23f';
        g.lineWidth = 5;
        g.beginPath();
        g.arc(zone.x, zone.y, zone.r + 6, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * st.held) / PALP_HOLD);
        g.stroke();
      }
    }
  }

  drawStethoHead(g, x, y) {
    // Le tuyau part du haut de la scène, la cloche est posée sur la zone.
    g.strokeStyle = '#3b4248';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x - 8, y - 8);
    g.bezierCurveTo(x - 30, y - 60, x - 80, y - 40, x - 96, y - 160);
    g.stroke();
    g.fillStyle = '#c9d2d8';
    circle(g, x, y, 11);
    g.fill();
    g.strokeStyle = '#7c878f';
    g.lineWidth = 2.5;
    g.stroke();
    g.fillStyle = '#eef3f6';
    circle(g, x - 3, y - 3, 4);
    g.fill();
  }

  drawCount(g, heart) {
    const st = this.st;
    const phase = ((this.time - st.beatT0) % st.period) / st.period;
    const pulse = Math.exp(-phase * 9);
    this.drawStethoHead(g, heart.x, heart.y);
    // Le cœur qui bat (au ralenti pour le chat et le lapin).
    g.font = `${26 + pulse * 14}px ${EMOJI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('❤️', heart.x - 28, heart.y - 26);
    if (pulse > 0.4) {
      g.font = `900 ${13 + pulse * 5}px ${TEXT_FONT}`;
      g.fillStyle = '#c8463c';
      g.fillText(t('vx_boum'), heart.x - 28, heart.y - 52);
    }
    // Électrocardiogramme en haut de la scène.
    const x0 = 14;
    const x1 = SW - 14;
    const y0 = 10;
    const hh = 46;
    g.fillStyle = 'rgba(12, 38, 30, 0.88)';
    rrect(g, x0, y0, x1 - x0, hh, 10);
    g.fill();
    g.strokeStyle = 'rgba(120, 255, 170, 0.15)';
    g.lineWidth = 1;
    for (let x = x0 + 12; x < x1; x += 16) {
      g.beginPath();
      g.moveTo(x, y0 + 4);
      g.lineTo(x, y0 + hh - 4);
      g.stroke();
    }
    g.strokeStyle = '#7dffa8';
    g.lineWidth = 2.2;
    g.beginPath();
    const speed = 90; // px par seconde
    for (let x = x0 + 6; x <= x1 - 6; x += 2) {
      const tc = this.time - (x1 - 6 - x) / speed - st.beatT0;
      const ph = ((tc % st.period) + st.period) % st.period / st.period;
      let yv = 0;
      if (ph < 0.04) yv = -ph / 0.04;
      else if (ph < 0.07) yv = -1 + ((ph - 0.04) / 0.03) * 1.5;
      else if (ph < 0.1) yv = 0.5 - ((ph - 0.07) / 0.03) * 0.5;
      else if (ph > 0.3 && ph < 0.42) yv = -0.18 * Math.sin(((ph - 0.3) / 0.12) * Math.PI);
      const y = y0 + hh * 0.62 + yv * hh * 0.42;
      if (x === x0 + 6) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    // Chrono et compteur
    const elapsed = st.started === null ? 0 : Math.min(COUNT_SECONDS, this.time - st.started);
    const k = elapsed / COUNT_SECONDS;
    g.fillStyle = 'rgba(255,255,255,0.92)';
    rrect(g, 120, y0 + hh + 6, 160, 34, 17);
    g.fill();
    g.fillStyle = '#e9e3d6';
    rrect(g, 128, y0 + hh + 32, 144, 5, 3);
    g.fill();
    g.fillStyle = '#e0574a';
    rrect(g, 128, y0 + hh + 32, 144 * k, 5, 3);
    g.fill();
    g.fillStyle = '#23302a';
    g.font = `900 17px ${TEXT_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const secs = st.started === null ? COUNT_SECONDS : Math.max(0, Math.ceil(COUNT_SECONDS - elapsed));
    g.fillText(`❤️ ${st.taps}   ⏱️ ${secs} s`, 200, y0 + hh + 19);
  }

  drawListen(g, zone) {
    const st = this.st;
    const k = this.time - st.t0;
    this.drawStethoHead(g, zone.x, zone.y);
    const sound = st.sound;
    const lungs = st.zone === 'lungs';
    const silent = sound === 'silent';
    const bad = lungs ? sound !== 'normal' : sound !== 'normal';
    // Ondes du son (pointues pour les crépitements, ondulées pour le reste, rien si silence).
    if (!silent) {
      for (let i = 0; i < 3; i++) {
        const r = 16 + ((k * 40 + i * 14) % 42);
        g.globalAlpha = 1 - r / 58;
        g.strokeStyle = bad ? '#e0574a' : '#3f7cc4';
        g.lineWidth = 2.2;
        g.beginPath();
        if (sound === 'crackles') {
          for (let a = -1.2; a <= 1.2; a += 0.2) {
            const rr = r + (Math.floor(a * 10) % 2 ? 4 : -3);
            const x = zone.x - Math.cos(a) * rr;
            const y = zone.y + Math.sin(a) * rr;
            if (a === -1.2) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
        } else {
          g.arc(zone.x, zone.y, r, Math.PI - 1.1, Math.PI + 1.1);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    // La bulle avec le bruit entendu.
    const key = lungs ? `vx_snd_lungs_${sound}` : `vx_snd_gut_${sound}`;
    const text = t(key);
    g.font = `900 14px ${TEXT_FONT}`;
    const w = g.measureText(text).width + 20;
    const bx = clamp(zone.x - w - 20, 6, SW - w - 6);
    const by = clamp(zone.y - 58 - Math.sin(k * 3) * 2, 8, SH - 40);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    rrect(g, bx, by, w, 28, 14);
    g.fill();
    g.strokeStyle = bad ? '#e0574a' : '#9cc4e8';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = bad ? '#8b2b22' : '#24476b';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, bx + w / 2, by + 14.5);
    // Barre de temps
    g.fillStyle = 'rgba(255,255,255,0.8)';
    rrect(g, bx + 8, by + 32, w - 16, 4, 2);
    g.fill();
    g.fillStyle = '#3f7cc4';
    rrect(g, bx + 8, by + 32, (w - 16) * clamp(k / LISTEN_TIME), 4, 2);
    g.fill();
  }

  drawThermo(g, rump) {
    const k = clamp((this.time - this.st.t0) / THERMO_TIME);
    // Le thermomètre, posé sous la queue.
    g.save();
    g.translate(rump.x - 6, rump.y + 2);
    g.rotate(-0.5);
    g.fillStyle = '#f7fafc';
    rrect(g, -46, -6, 48, 12, 6);
    g.fill();
    g.strokeStyle = '#8ea2b0';
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = '#b8c4cc';
    rrect(g, 0, -3, 12, 6, 3);
    g.fill();
    g.fillStyle = '#3f7cc4';
    rrect(g, -42, -4, 16, 8, 3);
    g.fill();
    g.restore();
    // L'écran : les chiffres montent jusqu'à la température.
    const val = 35 + (this.cs.temp - 35) * (1 - (1 - k) ** 2);
    const fever = k >= 1 && this.cs.temp > vitalsOf(this.a.species).temp[1];
    const bx = clamp(rump.x - 100, 6, SW - 96);
    const by = clamp(rump.y - 84, 8, SH - 50);
    g.fillStyle = '#2b3338';
    rrect(g, bx, by, 90, 38, 9);
    g.fill();
    g.fillStyle = k >= 1 ? (fever ? '#ffb4a8' : '#9ff2b8') : '#d8f0ff';
    g.font = `900 19px ${TEXT_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`${fmt1(val)} °C`, bx + 45, by + 20);
    g.strokeStyle = '#2b3338';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(bx + 60, by + 38);
    g.lineTo(rump.x - 30, rump.y - 10);
    g.stroke();
  }

  drawLens(g, zone) {
    const k = clamp((this.time - this.st.t0) / 0.3);
    const R = 58 * (0.6 + 0.4 * k);
    const zoom = 2.7;
    const cx = clamp(zone.x - 66, 64, SW - 64);
    const cy = clamp(zone.y - 70, 62, SH - 62);
    // Le faisceau de la lampe sur la zone.
    g.fillStyle = 'rgba(255, 244, 170, 0.35)';
    circle(g, zone.x, zone.y, zone.r * 1.1);
    g.fill();
    g.save();
    circle(g, cx, cy, R);
    g.clip();
    g.fillStyle = '#fffaf0';
    g.fillRect(cx - R, cy - R, R * 2, R * 2);
    g.translate(cx, cy);
    g.scale(zoom, zoom);
    g.translate(-zone.x, -zone.y);
    this.drawRoom(g);
    const sh = this.drawPatient(g);
    this.drawSigns(g, sh, true);
    g.restore();
    // Lumière douce dans la loupe
    g.fillStyle = 'rgba(255, 250, 210, 0.16)';
    circle(g, cx, cy, R);
    g.fill();
    g.strokeStyle = '#2f3a40';
    g.lineWidth = 6;
    circle(g, cx, cy, R);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, R - 6, -2.6, -1.7);
    g.stroke();
    // Manche
    const ang = Math.atan2(zone.y - cy, zone.x - cx);
    g.strokeStyle = '#6b4a2b';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(cx + Math.cos(ang + 0.9) * (R + 3), cy + Math.sin(ang + 0.9) * (R + 3));
    g.lineTo(cx + Math.cos(ang + 0.9) * (R + 34), cy + Math.sin(ang + 0.9) * (R + 34));
    g.stroke();
  }

  // ------------------------------------------------------------ 🦷 vue de la bouche

  drawMouth(g) {
    const v = this.view;
    const cs = this.cs;
    const st = this.st;
    const col = this.a.look ?? {};
    const fur = col.coat ?? 0xb08050;
    const sp = this.a.species;
    // Fond : le museau en très gros plan.
    g.fillStyle = css(fur);
    g.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
    g.fillStyle = shade(fur, -0.18);
    g.fillRect(v.x0, v.y0, v.x1 - v.x0, 46);
    // Lèvre relevée (la main du véto)
    g.fillStyle = shade(fur, 0.1);
    g.beginPath();
    g.moveTo(v.x0, 70);
    g.quadraticCurveTo(200, 28, v.x1, 70);
    g.lineTo(v.x1, 104);
    g.quadraticCurveTo(200, 84, v.x0, 104);
    g.closePath();
    g.fill();
    g.font = `46px ${EMOJI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🧤', 318, 70);
    // La gencive
    const pink = cs.gums === 'pale' ? 0xf0d6d6 : 0xe8798c;
    const gum = g.createLinearGradient(0, 100, 0, 184);
    gum.addColorStop(0, shade(pink, -0.12));
    gum.addColorStop(1, shade(pink, 0.12));
    g.fillStyle = gum;
    g.beginPath();
    g.moveTo(30, 108);
    g.quadraticCurveTo(200, 88, 370, 108);
    g.lineTo(370, 184);
    g.quadraticCurveTo(200, 170, 30, 184);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.28)';
    ellipse(g, 160, 118, 90, 7, -0.03);
    g.fill();
    // La tache blanche (appuyer) qui redevient rose.
    if (st.spot) {
      let white = 0;
      if (st.press !== null) white = clamp((this.time - st.press) / PRESS_TIME);
      else if (st.release !== null) white = st.done ? 0 : 1 - clamp((this.time - st.release) / cs.crt);
      const spot = mix(pink, 0xfff6f6, white);
      g.fillStyle = spot;
      circle(g, st.spot.x, st.spot.y, 15);
      g.fill();
      if (st.press !== null) {
        g.font = `34px ${EMOJI_FONT}`;
        g.fillText('👆', st.spot.x + 6, st.spot.y + 18);
      }
    }
    // Les dents
    const teeth = sp === 'rabbit' ? 2 : sp === 'horse' ? 6 : sp === 'dog' || sp === 'cat' ? 6 : 8;
    const wide = sp === 'rabbit' ? 46 : sp === 'horse' ? 40 : 32;
    const total = teeth * wide + (teeth - 1) * 4;
    const tx = 200 - total / 2;
    for (let i = 0; i < teeth; i++) {
      const x = tx + i * (wide + 4);
      const fang = (sp === 'dog' || sp === 'cat') && (i === 0 || i === teeth - 1);
      const hgt = sp === 'rabbit' ? 78 : fang ? 70 : 46;
      g.fillStyle = sp === 'horse' ? '#f3ead2' : '#fbfaf4';
      g.beginPath();
      if (fang) {
        g.moveTo(x, 178);
        g.lineTo(x + wide, 178);
        g.lineTo(x + wide / 2, 178 + hgt);
        g.closePath();
      } else {
        rrect(g, x, 176, wide, hgt, 7);
      }
      g.fill();
      g.strokeStyle = 'rgba(120,110,90,0.35)';
      g.lineWidth = 1.5;
      g.stroke();
    }
    // Chrono de la recoloration
    if (st.release !== null) {
      const sec = st.done ? st.counted : this.time - st.release;
      g.fillStyle = 'rgba(255,255,255,0.95)';
      rrect(g, 14, 12, 120, 34, 17);
      g.fill();
      g.fillStyle = st.done ? (cs.crt > 2 ? '#c8463c' : '#2f8a5f') : '#23302a';
      g.font = `900 18px ${TEXT_FONT}`;
      g.textAlign = 'center';
      g.fillText(`⏱️ ${fmt1(sec)} s`, 74, 30);
    }
  }

  drawFx(g) {
    for (const p of this.fx) {
      const k = p.age / p.life;
      g.save();
      g.globalAlpha = Math.min(1, (1 - k) * 2);
      if (p.ring) {
        g.strokeStyle = p.color;
        g.lineWidth = 4 * (1 - k) + 1;
        circle(g, p.x, p.y, (p.r ?? 14) + k * 22);
        g.stroke();
      } else if (p.emoji) {
        g.font = `${p.size ?? 22}px ${EMOJI_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(p.emoji, p.x, p.y);
      } else if (p.text) {
        g.font = `900 ${p.size ?? 18}px ${TEXT_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        g.lineWidth = 5;
        g.strokeStyle = 'rgba(255,255,255,0.95)';
        g.strokeText(p.text, p.x, p.y);
        g.fillStyle = p.color ?? '#23302a';
        g.fillText(p.text, p.x, p.y);
      }
      g.restore();
    }
  }

  drawCursor(g) {
    const p = this.pointer;
    if (!this.tool || !(p.over || p.down)) return;
    if (!['idle', 'palp'].includes(this.mode)) return;
    const ch = this.mode === 'palp' && p.down ? '🤚' : TOOL_CURSOR[this.tool];
    g.font = `30px ${EMOJI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.globalAlpha = 0.92;
    g.fillText(ch, p.x + 4, p.y - 18);
    g.globalAlpha = 1;
  }
}
