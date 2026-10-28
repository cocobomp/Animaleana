// Mini-jeux des soins et des corvées : chaque soin (nourrir, brosser, laver…) et chaque
// corvée (curer, balayer, ranger…) se fait en jouant. Le mini-jeu s'ouvre par-dessus le
// jeu 3D (qui continue de tourner) et renvoie une qualité de 0 à 1, ou null si l'enfant
// le ferme avec ✕.
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
import { audio } from '../game/audio.js'; // petits sons : bien joué / raté / fini
import { CHORE_GAMES, CHORE_ICONS } from './minigames/chores.js';
import { justOutcome, starsFor } from './minigames/score.js'; // règle « juste ce qu'il faut »
import { fitView, toLocalPoint, nbsp } from './minigames/frame.js'; // échelle, doigt, typographie
import { braidGame, shineGame, bowGame, fluffGame } from './minigames/beauty.js'; // concours de beauté
import { pansageGame } from './minigames/pansage.js'; // le pansage complet du cheval

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

/** Ajoute un mini-jeu (ex. séances d'éducation canine, src/ui/minigames/dogTraining.js). */
export function registerMinigame(id, make, icon = '⭐') {
  GAMES[id] = make;
  ICONS[id] = icon;
}

/** Ajoute plusieurs mini-jeux d'un coup (ex. le salon de toilettage, src/ui/minigames/groomer.js). */
export function registerMinigames(games, icons = {}) {
  for (const [id, make] of Object.entries(games)) registerMinigame(id, make, icons[id] ?? ICONS[id] ?? '⭐');
}

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
    // Les mots orange / rouges (« Trop court », « Aïe ») sonnent « raté », les autres « bien joué ».
    audio.minigame(color === '#c07a10' || color === '#c8463c' ? 'bad' : 'good');
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
        g.fillStyle = '#000'; // opaque : un emoji prend l'alpha du fillStyle courant (voir draw.js, emoji)
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
  // Brosser un cheval, c'est le pansage complet : étrille, brosse, cure-pied, peigne.
  const make = a.species === 'horse' && action === 'brush' ? pansageGame : GAMES[action];
  if (!make) return Promise.resolve(1);
  const sp = SPECIES[a.species];
  return openMinigame(ui, {
    make,
    action,
    a,
    icon: ICONS[action] ?? '⭐',
    title: titleFor(a, action),
    subtitle: `${sp.emoji} ${a.name}`,
    seed: a.look?.seed ?? 1,
    endEmoji: sp.emoji,
    endText: (stars) => t(`mg_end${stars}`, { name: a.name }),
    // L'animal n'est plus là (il est parti, ou mort de vieillesse) : on ferme sans rien appliquer.
    // (a.guest : l'animal d'un client du salon de toilettage, qui n'est pas au joueur : il reste là.)
    stillThere: (game) => !game?.profile || !!a.guest || game.profile.animals.some((x) => x.id === a.id),
    opts,
  });
}

/**
 * Lance le mini-jeu d'une corvée (curer un box, balayer, ranger…) : même cadre, sans animal.
 * kind : une corvée de CHORE_GAMES ; target : le n° du box pour 'muck' et 'straw'.
 * o.a : l'animal qui habite là (pour le décor seulement) ; o.subtitle : « Box de Pomme ».
 * Les corvées sans mini-jeu renvoient tout de suite 1, comme avant.
 */
export function runChoreGame(ui, kind, target = null, o = {}) {
  const make = CHORE_GAMES[kind];
  if (!make) return Promise.resolve(1);
  const icon = CHORE_ICONS[kind] ?? '🧹';
  return openMinigame(ui, {
    make,
    action: kind,
    a: o.a ?? null,
    chore: { kind, target },
    icon,
    title: t(`mg_chore_${kind}`),
    subtitle: o.subtitle ?? null,
    seed: 17 + (target ?? 0),
    endEmoji: icon,
    endText: (stars) => t(`mg_chore_end${stars}`),
    stillThere: (game) => !game || !!game.profile,
  });
}

/**
 * Cadre commun : fenêtre, consigne, barre de progression, canvas agrandi, entrées, boucle,
 * carte de fin et fermeture. o : { make, action, a, chore, icon, title, subtitle, seed,
 * endEmoji, endText(stars), stillThere(game) }.
 */
function openMinigame(ui, o) {
  const { make, action, a } = o;
  if (ui.minigameOpen) return Promise.resolve(null);
  ui.minigameOpen = true;

  return new Promise((resolve) => {
    const game = ui.game;
    const prevInput = game?.input?.enabled ?? true;
    if (game?.input) game.input.enabled = false;
    // Le bouton du panneau garde le focus : on l'enlève pour qu'Espace / Entrée ne le reclique pas
    // (il le retrouve à la fin de la partie, voir close).
    const prevFocus = document.activeElement;
    // (le panneau peut se redessiner pendant la partie : on retrouvera le bouton à son texte)
    const prevLike = prevFocus && prevFocus !== document.body
      ? { text: prevFocus.textContent, label: prevFocus.querySelector?.('b')?.textContent ?? null } : null;
    document.activeElement?.blur?.();

    const closeBtn = h('button', { class: 'mg-close', 'aria-label': t('mg_close'), title: t('mg_close') }, '✕');
    const hintEl = h('p', { class: 'mg-hint' });
    const fillEl = h('div', { class: 'mg-progress-fill' });
    // Bande verte « juste ce qu'il faut » sur la jauge, avec son petit repère ✓ (cachée tant
    // que le jeu n'appelle pas ctx.zone).
    const zoneEl = h('div', { class: 'mg-progress-zone', hidden: true, 'aria-hidden': 'true' }, h('span', { class: 'mg-progress-zone-mark' }, '✓'));
    const progressEl = h('div', { class: 'mg-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, fillEl, zoneEl, h('span', { class: 'mg-progress-goal' }, '🏁'));
    const canvas = h('canvas', { class: 'mg-canvas' });
    const endEl = h('div', { class: 'mg-end', hidden: true });
    const stage = h('div', { class: 'mg-stage' }, canvas, endEl);
    const controls = h('div', { class: 'mg-controls' });
    const box = h('div', { class: 'mg-box' },
      h('header', { class: 'mg-head' },
        h('div', { class: 'mg-title' }, h('span', { class: 'mg-icon' }, o.icon), h('span', {}, o.title), o.subtitle ? h('small', {}, o.subtitle) : null),
        closeBtn),
      hintEl, progressEl, stage, controls);
    const overlay = h('div', { class: 'mg-overlay', role: 'dialog', 'aria-modal': 'true' }, box);
    ui.root.append(overlay);
    // Tout ce qui flotte au-dessus du jeu (bulle et anneau du tutoriel, z-index 55 et 60) se cache
    // tant que le mini-jeu est ouvert : voir style.css, body.mg-open.
    document.body?.classList?.add('mg-open');

    const g2 = canvas.getContext('2d');
    const view = { x0: 0, y0: 0, x1: MG_W, y1: MG_H, w: MG_W, h: MG_H, scale: 1, ox: 0, oy: 0 };
    let dpr = 1;
    const layout = { w: 0, h: 0 }; // taille de mise en page du canvas, en pixels CSS
    // Hauteur de consigne déjà atteinte pendant la partie (voir ctx.hint), oubliée si l'écran change de largeur.
    let hintMin = 0;
    let lastVW = window.innerWidth;
    const resize = () => {
      if (window.innerWidth !== lastVW) {
        lastVW = window.innerWidth;
        hintMin = 0;
        hintEl.style.minHeight = '';
      }
      // Taille de MISE EN PAGE (style calculé, sans les transformations), pas getBoundingClientRect() :
      // la première mesure tombe pendant l'animation d'ouverture « pop » de .mg-box (scale 0,9), et le
      // ResizeObserver ne la voit pas finir (un transform ne change pas la mise en page). L'échelle
      // restait alors 10 % trop petite toute la partie : canvas flou, et doigt lu 11 % trop loin.
      const cs = getComputedStyle(canvas);
      layout.w = parseFloat(cs.width) || canvas.clientWidth;
      layout.h = parseFloat(cs.height) || canvas.clientHeight;
      dpr = Math.min(2.5, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(layout.w * dpr));
      canvas.height = Math.max(1, Math.round(layout.h * dpr));
      Object.assign(view, fitView(layout.w, layout.h, MG_W, MG_H));
      fitEnd(); // écran tourné, fenêtre redimensionnée : la carte de fin tient-elle encore ?
    };
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    resize();
    // Par prudence, on remesure aussi à la fin de l'animation d'ouverture.
    box.addEventListener('animationend', (e) => { if (e.target === box) resize(); });

    let progress = 0;
    let progressAt = -Infinity; // dernière mise à jour de la jauge (performance.now)
    let ended = false;
    let closed = false;
    let quality = null;
    let zoneRange = null; // { lo, hi } de la bande verte affichée, ou null
    let endVerdict = null; // 'just' | 'low' | 'high' : verdict de la fin (finishJust), pour les étoiles

    // Pour une corvée, a / sp / col sont null (ou l'animal qui habite là, pour le décor).
    const ctx = {
      a,
      sp: a ? SPECIES[a.species] : null,
      action,
      chore: o.chore ?? null,
      opts: o.opts ?? {}, // options du jeu ; un jeu y écrit son choix dans opts.out (concours de beauté)
      W: MG_W,
      H: MG_H,
      view,
      col: a ? coatColors(a) : null,
      fx: new Fx(),
      rng: makeRng((o.seed ?? 1) + Date.now()),
      time: 0,
      done: false,
      pointer: { x: MG_W / 2, y: MG_H / 2, down: false, over: false, type: 'mouse' },
      t,
      name: a?.name ?? '',
      /** Consigne en une ligne. kind : '' | 'good' | 'warn'. (Typographie française : nbsp.) */
      hint(text, kind = '') {
        text = nbsp(text);
        if (hintEl.textContent !== text) {
          hintEl.textContent = text;
          // La consigne ne rétrécit pas pendant la partie : après une longue consigne de départ
          // (3 lignes en 360 px), une plus courte faisait remonter la scène sous le doigt.
          // Hauteur de mise en page arrondie AU-DESSUS (offsetHeight arrondit au plus près : 72,4 px
          // donnait 72, et la consigne « C'est fait ! » faisait encore bouger la scène de 0,2 px).
          const hh = Math.ceil(parseFloat(getComputedStyle(hintEl).height) || hintEl.offsetHeight);
          if (hh > hintMin) {
            hintMin = hh;
            hintEl.style.minHeight = `${hh}px`;
          }
          hintEl.classList.remove('flash');
          void hintEl.offsetWidth;
          hintEl.classList.add('flash');
          if (kind === 'good' || kind === 'warn') audio.minigame(kind === 'good' ? 'good' : 'bad');
        }
        hintEl.dataset.kind = kind;
      },
      /**
       * Remplit la jauge du haut (0 à 1). Jauge « en direct » (mise à jour à chaque image : ciseaux des griffes,
       * nœud, versement…) : elle suit sans retard, sans la transition CSS de 0,25 s qui la faisait traîner
       * derrière les ciseaux (« dans le vert » à l'écran, « un peu trop court » en vrai). Une jauge qui
       * avance par à-coups (un nœud défait, une tache lavée) glisse toujours en douceur. opts.live force l'un
       * ou l'autre.
       */
      progress(v, opts = {}) {
        const now = performance.now();
        const live = opts.live ?? now - progressAt < 150;
        progressAt = now;
        if (fillEl.classList.contains('live') !== live) fillEl.classList.toggle('live', live);
        progress = clamp(v);
        fillEl.style.width = `${Math.round(progress * 1000) / 10}%`;
        progressEl.setAttribute('aria-valuenow', Math.round(progress * 100));
      },
      /** Ajoute un gros bouton sous le jeu. hold : appelle onDown / onUp (on garde appuyé). */
      button(text, opts = {}) {
        const b = h('button', { class: `mg-btn ${opts.cls ?? ''}`, type: 'button' }, nbsp(text));
        if (opts.hold) {
          const up = () => { if (b.classList.contains('held')) { b.classList.remove('held'); opts.onUp?.(); } };
          const down = () => {
            if (ended || b.classList.contains('held')) return;
            b.classList.add('held');
            opts.onDown?.();
          };
          b.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (ended) return;
            b.setPointerCapture?.(e.pointerId);
            down();
          });
          b.addEventListener('pointerup', up);
          b.addEventListener('pointercancel', up);
          b.addEventListener('lostpointercapture', up);
          // Au clavier (bouton choisi avec Tab) : Entrée / Espace enfoncée = doigt posé (voir onKey).
          b.mgKey = (pressed) => (pressed ? down() : up());
        } else {
          b.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (!ended) opts.onTap?.();
          });
          b.mgKey = (pressed) => { if (pressed && !ended) opts.onTap?.(); };
        }
        b.addEventListener('contextmenu', (e) => e.preventDefault());
        controls.append(b);
        return b;
      },
      clearButtons() { controls.replaceChildren(); },
      /**
       * Fin du mini-jeu : qualité 0 à 1 (au moins 0,4 car l'enfant a réussi). why : le verdict
       * « juste ce qu'il faut » s'il y en a un ('just' | 'low' | 'high', donné par finishJust) :
       * trois étoiles seulement si c'est « juste » (et, sans verdict, si la note vaut 1).
       */
      finish(q, msg, why = null) {
        if (ended) return;
        ended = true;
        ctx.done = true;
        quality = Math.round(clamp(q, 0.4, 1) * 100) / 100;
        endVerdict = why;
        // Avec une bande verte, la jauge reste là où l'enfant s'est arrêté (pleine, elle disait
        // « trop » sous « Un peu trop peu… ») ; sans zone, elle se remplit jusqu'au 🏁.
        if (!zoneRange) ctx.progress(1);
        audio.minigame('done');
        ctx.hint(`🎉 ${t('mg_done')}`, 'good');
        controls.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        setTimeout(() => showEnd(msg), 900);
      },
      /**
       * Montre la zone « juste ce qu'il faut » sur la jauge : bande verte entre lo et hi
       * (fractions 0–1 de la jauge) avec un repère ✓. zone(null) la cache.
       * Renvoie la zone affichée ({ lo, hi }) ou null.
       */
      zone(lo, hi) {
        if (lo === null || lo === undefined || hi === null || hi === undefined || !Number.isFinite(lo) || !Number.isFinite(hi)) {
          zoneRange = null;
          zoneEl.hidden = true;
          return null;
        }
        let l = clamp(lo);
        let r = clamp(hi);
        if (l > r) [l, r] = [r, l];
        zoneRange = { lo: l, hi: r };
        zoneEl.style.left = `${l * 100}%`;
        zoneEl.style.width = `${Math.max(1.5, (r - l) * 100)}%`;
        zoneEl.hidden = false;
        return zoneRange;
      },
      /**
       * Fin « juste ce qu'il faut » : la qualité suit justRight(value, lo, hi) et le message
       * dit pourquoi (« Juste ce qu'il fallait ! », « Un peu trop peu… », « Un peu trop ! »).
       * o : { who (prénom, ou animal : par défaut celui du jeu), floor, slack,
       *       msgs: { just, low, high } (textes déjà traduits, pour remplacer les messages
       *       standard) }. Sans prénom (corvée), les messages mg_chore_* sont utilisés.
       * La note et le verdict sont toujours d'accord (justOutcome) : à un cheveu de la zone, la
       * note arrondie fait 1 et c'est « juste » ; hors de la zone, moins de 1 et deux étoiles au plus.
       * Renvoie { q, verdict }.
       */
      finishJust(value, lo, hi, o = {}) {
        const { q, verdict: v } = justOutcome(value, lo, hi, { floor: o.floor, slack: o.slack });
        const name = typeof o.who === 'string' ? o.who : o.who?.name ?? ctx.name;
        const key = v === 'just' ? 'justRight' : v === 'low' ? 'tooLittle' : 'tooMuch';
        const msg = o.msgs?.[v] ?? (name ? t(`mg_${key}`, { name }) : t(`mg_chore_${key}`));
        ctx.finish(q, msg, v);
        return { q, verdict: v };
      },
      /** Gros bouton « ✅ C'est bon ! » pour s'arrêter là : raccourci vers button(). */
      stopButton(onStop, label = t('mg_stopHere')) {
        const text = label.includes('✅') ? label : `✅ ${label}`;
        return ctx.button(text, { cls: 'stop primary', onTap: onStop });
      },
    };

    const play = make(ctx);
    // État lisible par les tests automatiques (peek).
    ui.minigame = { action, chore: o.chore ?? null, ctx, peek: () => play.peek?.(), get zone() { return zoneRange; } };

    /**
     * Carte de fin trop haute pour la scène (360 px de large, message de 3 lignes, long prénom) :
     * version compacte (.mg-end.tight), plutôt qu'une carte coupée en bas qui défile.
     */
    function fitEnd() {
      if (endEl.hidden) return;
      const card = endEl.firstElementChild;
      if (!card) return;
      endEl.classList.remove('tight');
      const cs = getComputedStyle(endEl);
      const room = endEl.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      // offsetHeight : taille de mise en page, sans l'animation d'apparition (scale) de la carte.
      if (card.offsetHeight > room + 0.5) endEl.classList.add('tight');
    }

    function showEnd(msg) {
      if (closed) return;
      const stars = starsFor(quality, endVerdict); // ★★★ = « juste ce qu'il fallait », et rien d'autre
      const cont = h('button', { class: 'primary mg-continue' }, `${t('mg_continue')} ➜`);
      cont.addEventListener('click', () => close(quality));
      endEl.replaceChildren(h('div', { class: 'mg-end-card' },
        h('div', { class: 'mg-end-emoji' }, o.endEmoji),
        h('h2', {}, nbsp(t(stars === 3 ? 'mg_bravo' : stars === 2 ? 'mg_wellDone' : 'mg_done'))),
        h('div', { class: 'mg-stars', 'aria-label': `${stars}/3` }, [1, 2, 3].map((i) => h('span', { class: i <= stars ? 'on' : 'off', style: { animationDelay: `${0.15 + i * 0.18}s` } }, '★'))),
        h('p', {}, nbsp(msg ?? o.endText(stars))),
        cont));
      endEl.hidden = false;
      // Le ✕ disparaît (fermer ici perdrait le soin) mais garde sa place (style.css,
      // .mg-close[hidden]) : l'en-tête ne rapetisse plus et la fenêtre ne saute plus.
      closeBtn.hidden = true;
      fitEnd();
      setTimeout(() => cont.focus({ preventScroll: true }), 50);
    }

    // ---------------------------------------------------------- entrées
    // Écran → jeu : ce qu'on voit (getBoundingClientRect, qui suit l'animation d'ouverture) ramené
    // à la mise en page, puis à la vue. Le point touché tombe exactement sous le doigt.
    const toLocal = (e) => {
      const p = toLocalPoint(e.clientX, e.clientY, canvas.getBoundingClientRect(), layout.w, layout.h, view);
      return { x: p.x, y: p.y, id: e.pointerId, type: e.pointerType };
    };
    let activeId = null;
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (ended) return;
      // La mise en page a changé et le ResizeObserver n'est pas encore passé : on remesure.
      if (Math.abs(canvas.clientWidth - layout.w) > 1 || Math.abs(canvas.clientHeight - layout.h) > 1) resize();
      const p = toLocal(e);
      // Un deuxième doigt pendant que le premier est posé : les jeux n'en suivent qu'un, donc le
      // premier est lâché là où il était, et le nouveau prend la main. Avant, le « up » du premier
      // n'arrivait jamais au jeu (objet tenu pour toujours au nettoyage, pouce posé qui bloquait).
      if (activeId !== null && activeId !== e.pointerId) {
        const old = activeId;
        activeId = null;
        try { canvas.releasePointerCapture?.(old); } catch { /* déjà relâché */ }
        play.up?.({ x: ctx.pointer.x, y: ctx.pointer.y, id: old, type: ctx.pointer.type });
      }
      ctx.pointer = { ...ctx.pointer, ...p, down: true, over: true };
      if (activeId === null) {
        activeId = e.pointerId;
        try { canvas.setPointerCapture?.(e.pointerId); } catch { /* doigt déjà levé */ }
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
      // Un bouton du cadre choisi avec Tab : Entrée / Espace l'active, au lieu d'aller au jeu (au
      // ferrage, Entrée tapait au marteau et « ✅ C'est bon ! » restait inatteignable au clavier).
      const focused = e.target?.closest?.('.mg-overlay button');
      if (focused && ['Space', 'Enter', 'NumpadEnter'].includes(e.code)) {
        if (focused.mgKey) {
          e.preventDefault();
          if (!focused.disabled && (!down || !e.repeat)) focused.mgKey(down);
        }
        return; // ✕, « Continuer » : le clic natif du bouton
      }
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
      // L'animal n'est plus là, ou la partie est finie : on ferme sans rien appliquer.
      if (!o.stillThere(game)) return close(null);
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
      document.body?.classList?.remove('mg-open');
      ui.minigameOpen = false;
      ui.minigame = null;
      if (game?.input) game.input.enabled = prevInput;
      resolve(result);
      // Les fenêtres arrivées pendant la partie (« ⭐ niveau supérieur »…) attendaient la fin :
      // juste après (le temps que le soin s'applique), une par une (UI.flushModals).
      setTimeout(() => {
        // Au clavier, le focus revient au bouton qui a lancé la partie (ou à son remplaçant, si le panneau a
        // été redessiné entre-temps ; sinon au premier bouton du panneau) au lieu de tomber sur la page.
        const a = document.activeElement;
        if (!ui.modalOpen && (!a || a === document.body)) {
          if (prevFocus?.isConnected && prevFocus !== document.body && prevFocus.getClientRects().length) prevFocus.focus({ preventScroll: true });
          else if (ui.panel) ui.focusPanel?.(prevLike);
        }
        ui.flushModals?.();
      }, 0);
    }
  });
}
