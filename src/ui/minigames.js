// Mini-jeux des soins : chaque soin (nourrir, brosser, laver…) se fait en jouant.
// Le mini-jeu s'ouvre par-dessus le jeu 3D (qui continue de tourner) et renvoie
// une qualité de 0 à 1, ou null si l'enfant le ferme avec ✕.
//
// Chaque mini-jeu (dossier minigames/) est une fonction qui reçoit un `ctx` et
// renvoie { update(dt), draw(g), down(p), move(p), up(p), key(code, pressed) }.
// Le dessin se fait dans un espace virtuel de 400 × 360, agrandi pour remplir l'écran.

import { h } from './dom.js';
import { t } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { EMOJI_FONT, TEXT_FONT, coatColors, makeRng, clamp } from './minigames/draw.js';
import { feedGame, waterGame, treatGame } from './minigames/food.js';
import { brushGame, washGame, nailsGame, shoeGame, shearGame } from './minigames/grooming.js';
import { cleanGame } from './minigames/clean.js';
import { petGame, playGame, milkGame } from './minigames/fun.js';
import { lungeGame, libertyGame } from './minigames/horse.js';
import { braidGame, shineGame, bowGame, fluffGame } from './minigames/beauty.js'; // concours de beauté

export const MG_W = 400;
export const MG_H = 360;

const GAMES = {
  feed: feedGame,
  water: waterGame,
  treat: treatGame,
  brush: brushGame,
  wash: washGame,
  nails: nailsGame,
  shoe: shoeGame,
  shear: shearGame,
  clean: cleanGame,
  pet: petGame,
  play: playGame,
  milk: milkGame,
  lunge: lungeGame,
  liberty: libertyGame,
  braid: braidGame, shine: shineGame, bow: bowGame, fluff: fluffGame, // concours de beauté (src/ui/beauty.js)
};

const ICONS = {
  feed: '🍽️', water: '💧', brush: '🪮', wash: '🫧', clean: '🧹', nails: '✂️', shoe: '🔨', pet: '🤚',
  treat: '🍪', play: '⚽', lunge: '🌀', liberty: '💛', shear: '🧶', milk: '🥛',
  braid: '🎀', shine: '✨', bow: '🎀', fluff: '🧶', // concours de beauté
};

/** Texte traduit, ou null s'il n'existe pas. */
const tt = (key, params) => {
  const s = t(key, params);
  return s === key ? null : s;
};

function titleFor(a, action) {
  return tt(`mg_act_${a.species}_${action}`) ?? tt(`act_${a.species}_${action}`) ?? t(`act_${action}`);
}

/** Effets : emoji qui s'envolent, petits textes, poussières… */
class Fx {
  constructor() { this.list = []; }

  add(p) {
    this.list.push({ vx: 0, vy: 0, grav: 0, life: 1, size: 22, spin: 0, rot: 0, fade: true, ...p, age: 0 });
    if (this.list.length > 300) this.list.shift();
  }

  /** Plusieurs emoji en éventail. */
  burst(x, y, ch, n = 6, opts = {}) {
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * (opts.spread ?? 2.4);
      const sp = (opts.speed ?? 120) * (0.6 + Math.random() * 0.6);
      this.add({ x, y, emoji: ch, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, grav: opts.grav ?? 160, life: opts.life ?? 1, size: opts.size ?? 20, spin: (Math.random() - 0.5) * 4 });
    }
  }

  /** Un emoji qui monte doucement (cœur, note…). */
  float(x, y, ch, size = 24) {
    this.add({ x, y, emoji: ch, vx: (Math.random() - 0.5) * 30, vy: -60, life: 1.2, size });
  }

  /** Un petit mot (« Parfait ! »). */
  text(x, y, text, color = '#2f8a5f', size = 22) {
    this.add({ x, y, text, color, vy: -40, life: 1.1, size, fade: true });
  }

  /** Une tache ronde (poussière, gouttes, bulles). */
  dot(x, y, color, r = 4, opts = {}) {
    this.add({ x, y, color, r, vx: opts.vx ?? 0, vy: opts.vy ?? 0, grav: opts.grav ?? 0, life: opts.life ?? 0.6, bubble: opts.bubble });
  }

  update(dt) {
    for (const p of this.list) {
      p.age += dt;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    this.list = this.list.filter((p) => p.age < p.life);
  }

  draw(g) {
    for (const p of this.list) {
      const k = p.age / p.life;
      const alpha = p.fade ? Math.min(1, (1 - k) * 2.2) : 1;
      g.save();
      g.globalAlpha = alpha;
      if (p.emoji) {
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        const pop = Math.min(1, p.age * 8);
        g.font = `${p.size * (0.6 + 0.4 * pop)}px ${EMOJI_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(p.emoji, 0, 0);
      } else if (p.text) {
        g.font = `900 ${p.size}px ${TEXT_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        g.lineWidth = 6;
        g.strokeStyle = 'rgba(255,255,255,0.95)';
        g.strokeText(p.text, p.x, p.y);
        g.fillStyle = p.color;
        g.fillText(p.text, p.x, p.y);
      } else {
        g.beginPath();
        g.arc(p.x, p.y, p.r * (p.bubble ? 1 : 1 - k * 0.5), 0, Math.PI * 2);
        if (p.bubble) {
          g.strokeStyle = 'rgba(255,255,255,0.9)';
          g.lineWidth = 1.5;
          g.fillStyle = 'rgba(220,240,255,0.45)';
          g.fill();
          g.stroke();
        } else {
          g.fillStyle = p.color;
          g.fill();
        }
      }
      g.restore();
    }
  }
}

/**
 * Lance le mini-jeu d'un soin. action : un soin de CARE, ou 'collect' (tonte / traite).
 * Renvoie une promesse : la qualité (0,4 à 1) si l'enfant a fini, null s'il a fermé.
 * opts : options passées au jeu (ctx.opts) ; un jeu peut y écrire son choix dans opts.out (concours de beauté).
 */
export function runMinigame(ui, a, action, opts = {}) {
  if (action === 'collect') action = SPECIES[a.species].product?.action;
  const make = GAMES[action];
  if (!make) return Promise.resolve(1);
  if (ui.minigameOpen) return Promise.resolve(null);
  ui.minigameOpen = true;

  return new Promise((resolve) => {
    const game = ui.game;
    const prevInput = game?.input?.enabled ?? true;
    if (game?.input) game.input.enabled = false;
    // Le bouton du panneau garde le focus : on l'enlève pour qu'Espace / Entrée ne le reclique pas.
    document.activeElement?.blur?.();

    const icon = ICONS[action] ?? '⭐';
    const closeBtn = h('button', { class: 'mg-close', 'aria-label': t('mg_close'), title: t('mg_close') }, '✕');
    const hintEl = h('p', { class: 'mg-hint' });
    const fillEl = h('div', { class: 'mg-progress-fill' });
    const progressEl = h('div', { class: 'mg-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, fillEl, h('span', { class: 'mg-progress-goal' }, '🏁'));
    const canvas = h('canvas', { class: 'mg-canvas' });
    const endEl = h('div', { class: 'mg-end', hidden: true });
    const stage = h('div', { class: 'mg-stage' }, canvas, endEl);
    const controls = h('div', { class: 'mg-controls' });
    const box = h('div', { class: 'mg-box' },
      h('header', { class: 'mg-head' },
        h('div', { class: 'mg-title' }, h('span', { class: 'mg-icon' }, icon), h('span', {}, titleFor(a, action)), h('small', {}, `${SPECIES[a.species].emoji} ${a.name}`)),
        closeBtn),
      hintEl, progressEl, stage, controls);
    const overlay = h('div', { class: 'mg-overlay', role: 'dialog', 'aria-modal': 'true' }, box);
    ui.root.append(overlay);

    const g2 = canvas.getContext('2d');
    const view = { x0: 0, y0: 0, x1: MG_W, y1: MG_H, w: MG_W, h: MG_H, scale: 1, ox: 0, oy: 0 };
    let dpr = 1;
    const resize = () => {
      const r = stage.getBoundingClientRect();
      dpr = Math.min(2.5, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      const sc = Math.min(r.width / MG_W, r.height / MG_H) || 1;
      view.scale = sc;
      view.ox = (r.width - MG_W * sc) / 2;
      view.oy = (r.height - MG_H * sc) / 2;
      view.x0 = -view.ox / sc;
      view.y0 = -view.oy / sc;
      view.x1 = MG_W + view.ox / sc;
      view.y1 = MG_H + view.oy / sc;
      view.w = view.x1 - view.x0;
      view.h = view.y1 - view.y0;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    resize();

    let progress = 0;
    let ended = false;
    let closed = false;
    let quality = null;

    const ctx = {
      a,
      sp: SPECIES[a.species],
      action,
      opts,
      W: MG_W,
      H: MG_H,
      view,
      col: coatColors(a),
      fx: new Fx(),
      rng: makeRng((a.look?.seed ?? 1) + Date.now()),
      time: 0,
      done: false,
      pointer: { x: MG_W / 2, y: MG_H / 2, down: false, over: false, type: 'mouse' },
      t,
      name: a.name,
      /** Consigne en une ligne. kind : '' | 'good' | 'warn'. */
      hint(text, kind = '') {
        if (hintEl.textContent !== text) {
          hintEl.textContent = text;
          hintEl.classList.remove('flash');
          void hintEl.offsetWidth;
          hintEl.classList.add('flash');
        }
        hintEl.dataset.kind = kind;
      },
      progress(v) {
        progress = clamp(v);
        fillEl.style.width = `${Math.round(progress * 100)}%`;
        progressEl.setAttribute('aria-valuenow', Math.round(progress * 100));
      },
      /** Ajoute un gros bouton sous le jeu. hold : appelle onDown / onUp (on garde appuyé). */
      button(text, opts = {}) {
        const b = h('button', { class: `mg-btn ${opts.cls ?? ''}`, type: 'button' }, text);
        if (opts.hold) {
          const up = () => { if (b.classList.contains('held')) { b.classList.remove('held'); opts.onUp?.(); } };
          b.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (ended) return;
            b.setPointerCapture?.(e.pointerId);
            b.classList.add('held');
            opts.onDown?.();
          });
          b.addEventListener('pointerup', up);
          b.addEventListener('pointercancel', up);
          b.addEventListener('lostpointercapture', up);
        } else {
          b.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (!ended) opts.onTap?.();
          });
        }
        b.addEventListener('contextmenu', (e) => e.preventDefault());
        controls.append(b);
        return b;
      },
      clearButtons() { controls.replaceChildren(); },
      /** Fin du mini-jeu : qualité 0 à 1 (au moins 0,4 car l'enfant a réussi). */
      finish(q, msg) {
        if (ended) return;
        ended = true;
        ctx.done = true;
        quality = Math.round(clamp(q, 0.4, 1) * 100) / 100;
        ctx.progress(1);
        ctx.hint(`🎉 ${t('mg_done')}`, 'good');
        controls.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        setTimeout(() => showEnd(msg), 900);
      },
    };

    const play = make(ctx);
    // État lisible par les tests automatiques (peek).
    ui.minigame = { action, ctx, peek: () => play.peek?.() };

    function showEnd(msg) {
      if (closed) return;
      const stars = quality >= 0.85 ? 3 : quality >= 0.6 ? 2 : 1;
      const cont = h('button', { class: 'primary mg-continue' }, `${t('mg_continue')} ➜`);
      cont.addEventListener('click', () => close(quality));
      endEl.replaceChildren(h('div', { class: 'mg-end-card' },
        h('div', { class: 'mg-end-emoji' }, SPECIES[a.species].emoji),
        h('h2', {}, t(stars === 3 ? 'mg_bravo' : stars === 2 ? 'mg_wellDone' : 'mg_done')),
        h('div', { class: 'mg-stars', 'aria-label': `${stars}/3` }, [1, 2, 3].map((i) => h('span', { class: i <= stars ? 'on' : 'off', style: { animationDelay: `${0.15 + i * 0.18}s` } }, '★'))),
        h('p', {}, msg ?? t(`mg_end${stars}`, { name: a.name })),
        cont));
      endEl.hidden = false;
      closeBtn.hidden = true;
      setTimeout(() => cont.focus({ preventScroll: true }), 50);
    }

    // ---------------------------------------------------------- entrées
    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left - view.ox) / view.scale, y: (e.clientY - r.top - view.oy) / view.scale, id: e.pointerId, type: e.pointerType };
    };
    let activeId = null;
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (ended) return;
      const p = toLocal(e);
      ctx.pointer = { ...ctx.pointer, ...p, down: true, over: true };
      if (activeId === null) {
        activeId = e.pointerId;
        canvas.setPointerCapture?.(e.pointerId);
      }
      play.down?.(p);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (ended) return;
      const p = toLocal(e);
      if (activeId !== null && e.pointerId !== activeId) return;
      ctx.pointer = { ...ctx.pointer, ...p, over: true };
      play.move?.(p, ctx.pointer.down);
    });
    const up = (e) => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      const p = toLocal(e);
      ctx.pointer = { ...ctx.pointer, ...p, down: false, over: e.pointerType === 'mouse' };
      if (!ended) play.up?.(p);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && activeId === null) ctx.pointer.over = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Clavier (facultatif) : Espace / Entrée, flèches. Les touches ne vont pas au jeu 3D.
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.code)) return;
      e.stopPropagation();
      const down = e.type === 'keydown';
      if (['Space', 'Enter', 'NumpadEnter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (down && e.code === 'Escape') return close(ended ? quality : null);
      if (ended) {
        if (down && !e.repeat && ['Space', 'Enter', 'NumpadEnter'].includes(e.code) && !endEl.hidden) close(quality);
        return;
      }
      if (!down || !e.repeat) play.key?.(e.code, down);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    closeBtn.addEventListener('click', () => close(null));

    // ---------------------------------------------------------- boucle
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      if (closed) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      ctx.time += dt;
      // L'animal n'est plus là (il est parti, ou mort de vieillesse) : on ferme sans rien appliquer.
      if (game?.profile && !game.profile.animals.some((x) => x.id === a.id)) return close(null);
      play.update?.(dt);
      ctx.fx.update(dt);
      g2.setTransform(1, 0, 0, 1, 0, 0);
      g2.clearRect(0, 0, canvas.width, canvas.height);
      g2.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.ox, dpr * view.oy);
      g2.save();
      play.draw?.(g2);
      g2.restore();
      ctx.fx.draw(g2);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    function close(result) {
      if (closed) return;
      closed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      play.destroy?.();
      overlay.remove();
      ui.minigameOpen = false;
      ui.minigame = null;
      if (game?.input) game.input.enabled = prevInput;
      resolve(result);
    }
  });
}
