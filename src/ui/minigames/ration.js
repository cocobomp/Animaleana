// La ration du cheval, comme en vrai : il mange surtout du foin (presque toute la journée), et seulement une petite
// mesure de granulés. Le mini-jeu « Nourrir » du cheval (src/ui/minigames.js) :
//
//   1. Le filet à foin : on garde le doigt sur « 🌾 Remplir » (ou Espace) ; il doit être bien plein (≥ 75 %).
//   2. Les granulés : on verse dans le seau, une petite mesure seulement (la zone verte, vers le fond). Trop de
//      granulés d'un coup, c'est le mal de ventre (les coliques) : le jeu le dit, et il peut tomber malade
//      (ctx.opts.out.colic, src/game/Game.js care). La ration suit le travail, comme en vrai : le soir d'un jour
//      sans travail (rien de coché dans « 🏇 » de sa journée, src/sim/horseDay.js), presque que du foin
//      (RATION.restLo–restHi : quelques granulés seulement).
//
// La note : la moyenne des deux étapes « juste ce qu'il faut » (score.js).

import { rrect, ellipse, label, clamp } from './draw.js';
import { justOutcome } from './score.js';
import { nbsp } from './frame.js';
import { drawHorseHead } from './deworm.js';

/** Le filet : bien plein. Les granulés : une petite mesure (part du seau) ; au-delà de colicAt, trop. */
export const RATION = { hayLo: 0.75, hayHi: 1, hayRate: 0.32, grainLo: 0.15, grainHi: 0.3, restLo: 0.03, restHi: 0.14, grainRate: 0.22, colicAt: 0.55 };

/**
 * Un jour de repos : le soir (dès 14 h), ton cheval n'a pas travaillé aujourd'hui (« work » pas coché dans sa journée,
 * src/sim/horseDay.js ; une journée d'hier, pas encore remise à zéro, ne compte pas).
 */
export const restDay = (a, day, hour) =>
  hour >= 14 && day !== undefined && a?.species === 'horse' && !a.client && !a.guest
  && !(a.today?.day === day && a.today.done?.includes('work'));

const NET = { x: 70, top: 40, w: 96, h: 150 };
const BUCKET = { x: 108, y: 300, w: 92, h: 70 };

export function rationGame(ctx) {
  const { a, t, fx } = ctx;
  const name = a?.name ?? ctx.name;
  const col = ctx.col ?? { coat: '#8a5a2b', mane: '#2b1d14' };
  let stage = 'hay';
  let hay = 0;
  let grain = 0;
  let pouring = false;
  let pause = 0;
  let eat = 0;
  const results = [];
  const bits = [];

  ctx.zone(RATION.hayLo, RATION.hayHi);
  ctx.progress(0);
  ctx.hint(t('mg_ration_hay_hint', { name }));
  // (le soir d'un jour sans travail : presque que du foin)
  const rest = restDay(a, ctx.day, ctx.hour);
  const grainLo = rest ? RATION.restLo : RATION.grainLo;
  const grainHi = rest ? RATION.restHi : RATION.grainHi;
  const pourBtn = ctx.button(`🌾 ${t('mg_ration_hay_btn')}`, { hold: true, cls: 'primary', onDown: () => start(), onUp: () => stop() });
  const stopBtn = ctx.stopButton(() => next());
  const setText = (b, text) => {
    if (b && 'textContent' in b) b.textContent = nbsp(text);
    else if (b) b.text = text;
  };
  setText(stopBtn, `✅ ${t('mg_pansage_next')}`);

  function start() {
    if (ctx.done || pause > 0) return;
    pouring = true;
  }
  function stop() {
    pouring = false;
  }

  function next() {
    if (ctx.done || pause > 0) return;
    pouring = false;
    if (stage === 'hay') {
      results.push({ stage: 'hay', value: hay, ...justOutcome(hay, RATION.hayLo, RATION.hayHi, { slack: 0.5 }) });
      stage = 'grain';
      pause = 0.5;
      ctx.zone(grainLo, grainHi);
      ctx.progress(0);
      ctx.hint(t(rest ? 'mg_ration_grain_rest' : 'mg_ration_grain_hint', { name, g: a?.sex }));
      setText(pourBtn, `🥣 ${t('mg_feed_btn')}`);
      setText(stopBtn, `✅ ${t('mg_stopHere')}`);
      return;
    }
    finish();
  }

  function finish() {
    if (ctx.done) return;
    results.push({ stage: 'grain', value: grain, ...justOutcome(grain, grainLo, grainHi, { slack: 0.3 }) });
    const colic = grain >= RATION.colicAt;
    if (ctx.opts) ctx.opts.out = { ...(ctx.opts.out ?? {}), colic };
    const q = results.reduce((n, r) => n + r.q, 0) / results.length;
    const worst = results.reduce((w, r) => (r.q < w.q ? r : w), results[0]);
    const just = results.every((r) => r.verdict === 'just');
    const p = { name, g: a?.sex };
    const key = `mg_ration_${worst.verdict}_${worst.stage}${rest && worst.stage === 'grain' && worst.verdict === 'high' ? '_rest' : ''}`;
    const msg = colic ? t('mg_ration_colic', p) : just ? t(rest ? 'mg_ration_justRest' : 'mg_ration_just', p) : t(key, p);
    ctx.finish(colic ? Math.min(q, 0.4) : q, msg, colic ? 'high' : just ? 'just' : worst.verdict);
  }

  return {
    peek: () => ({ stage, hay, grain, pouring, pause, rest, grainLo, grainHi, results: results.map((r) => ({ ...r })) }),
    down() { start(); },
    up() { stop(); },
    key(code, isDown) {
      if (code === 'Space') {
        if (isDown) start();
        else stop();
      } else if (isDown && (code === 'Enter' || code === 'NumpadEnter')) next();
    },
    update(dt) {
      if (pause > 0) {
        pause -= dt;
        return;
      }
      if (ctx.done) {
        eat = Math.min(1, eat + dt * 0.8);
        return;
      }
      if (!pouring) return;
      if (stage === 'hay') {
        hay = clamp(hay + RATION.hayRate * dt);
        ctx.progress(hay);
        if (Math.random() < dt * 10) fx.dot(NET.x + (Math.random() - 0.5) * 60, NET.top + 10, '#d6c060', 3, { vy: 40, grav: 200, life: 0.5 });
        if (hay >= 1) {
          pouring = false;
          ctx.hint(t('mg_ration_hay_full'), 'good');
        } else if (hay >= RATION.hayLo) ctx.hint(t('mg_ration_hay_ok'), 'good');
      } else {
        grain = clamp(grain + RATION.grainRate * dt);
        ctx.progress(grain);
        if (bits.length < 120 && Math.random() < dt * 30) bits.push({ dx: (Math.random() - 0.5) * 0.8, k: Math.random() });
        if (grain >= RATION.colicAt) ctx.hint(t('mg_ration_tooMuch', { name, g: a?.sex }), 'warn');
        else if (grain > grainHi) ctx.hint(t('mg_stop'), 'warn');
        else if (grain >= grainLo) ctx.hint(t('mg_nowStop'), 'good');
        if (grain >= 1) {
          pouring = false;
          finish();
        }
      }
    },
    draw(g) {
      const v = ctx.view;
      g.fillStyle = '#f1e9d6'; // le mur de l'écurie
      g.fillRect(v.x0, v.y0, v.w, v.h);
      g.fillStyle = '#cdb68a';
      g.fillRect(v.x0, 300, v.w, v.y1 - 300);
      drawHorseHead(g, col, 0, eat > 0 ? Math.sin(ctx.time * 8) * 0.3 + 0.3 : 0, ctx.time);
      drawNet(g, hay, stage === 'hay');
      drawBucket(g, grain, bits, stage === 'grain', grainLo, grainHi);
      // le sac (granulés) au-dessus du seau quand on verse
      if (stage === 'grain' && pouring) {
        g.save();
        g.fillStyle = '#c9a46a';
        rrect(g, BUCKET.x - 20, 150, 40, 56, 8);
        g.fill();
        g.fillStyle = '#a5713a';
        for (let i = 0; i < 6; i++) ellipse(g, BUCKET.x - 4 + Math.sin(ctx.time * 20 + i) * 6, 212 + ((ctx.time * 200 + i * 15) % 70), 2.4, 2);
        g.fill();
        g.restore();
      }
      label(g, `🌾 ${Math.round(hay * 100)} %`, NET.x, NET.top + NET.h + 22, 14, '#4a3a20');
    },
  };
}

function drawNet(g, level, active) {
  g.save();
  // le crochet et la corde
  g.strokeStyle = '#7a6a50';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(NET.x, NET.top - 22);
  g.lineTo(NET.x, NET.top);
  g.stroke();
  // le foin dedans (de bas en haut)
  const h = NET.h * level;
  g.fillStyle = '#d6c060';
  ellipse(g, NET.x, NET.top + NET.h - h / 2, NET.w / 2 * (0.7 + 0.3 * level), Math.max(1, h / 2));
  g.fill();
  // le filet (mailles)
  g.strokeStyle = active ? '#2f7a4a' : '#3d8a5a';
  g.lineWidth = 2;
  ellipse(g, NET.x, NET.top + NET.h / 2, NET.w / 2, NET.h / 2);
  g.stroke();
  g.globalAlpha = 0.6;
  for (let i = -3; i <= 3; i++) {
    g.beginPath();
    g.moveTo(NET.x + i * 12 - 30, NET.top + 10);
    g.lineTo(NET.x + i * 12 + 30, NET.top + NET.h - 10);
    g.moveTo(NET.x + i * 12 + 30, NET.top + 10);
    g.lineTo(NET.x + i * 12 - 30, NET.top + NET.h - 10);
    g.stroke();
  }
  g.restore();
}

function drawBucket(g, level, bits, active, lo = RATION.grainLo, hi = RATION.grainHi) {
  const { x, y, w, h } = BUCKET;
  g.save();
  // la zone juste (une petite mesure, vers le fond ; un jour de repos, plus petite encore)
  if (active) {
    g.fillStyle = 'rgba(63, 174, 98, 0.25)';
    g.fillRect(x - w / 2 + 6, y - h * hi, w - 12, h * (hi - lo));
    // (au-dessus de ce trait rouge : trop, les coliques)
    g.strokeStyle = 'rgba(200, 70, 60, 0.85)';
    g.lineWidth = 2;
    g.setLineDash([6, 4]);
    g.beginPath();
    g.moveTo(x - w / 2 + 4, y - h * RATION.colicAt);
    g.lineTo(x + w / 2 - 4, y - h * RATION.colicAt);
    g.stroke();
    g.setLineDash([]);
    label(g, '⚠️', x + w / 2 + 12, y - h * RATION.colicAt, 14, '#c8463c');
  }
  // les granulés
  g.fillStyle = '#a5713a';
  const top = y - h * level;
  g.fillRect(x - w / 2 + 6, top, w - 12, y - top);
  g.fillStyle = '#8a5a2b';
  for (const b of bits) {
    const by = y - h * level * b.k;
    if (by < top) continue;
    ellipse(g, x + b.dx * (w - 16) / 2, by, 2.4, 2);
    g.fill();
  }
  // le seau
  g.strokeStyle = '#3c7bd9';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(x - w / 2, y - h);
  g.lineTo(x - w / 2 + 6, y);
  g.lineTo(x + w / 2 - 6, y);
  g.lineTo(x + w / 2, y - h);
  g.stroke();
  g.restore();
}
