// Travail à pied du cheval, vu de dessus : longe et liberté.
//
// Règle « juste ce qu'il faut » (score.js) : dans les deux jeux, la quantité juste est le
// travail demandé au cheval (secondes à la bonne allure à la longe, secondes de pression en
// liberté). La zone verte est sur la jauge et sur l'anneau autour du manège ; l'enfant
// s'arrête avec « C'est bon ! » (ou en appelant le cheval). Trop peu ou trop : moins de
// points, de la même façon des deux côtés.
//
// Tout tient dans les 400 × 360 du cadre (portrait : largeur visible 400 ; paysage : hauteur
// visible 360) et l'anneau ne passe pas sous la jauge des allures (tests/minigames-nettoyage-cheval).

import { drawHorseTop, drawPersonTop, rrect, circle, emoji, label, fillView, clamp, lerp, dist } from './draw.js';
import { tOr } from './clean.js';

const C = { x: 200, y: 158 };
const ARENA = 126;
const PATH = 102;

/** Anneau « juste ce qu'il faut » autour du manège : centre, rayon, épaisseur du trait le plus large. */
export const WORK_RING = { x: C.x, y: C.y, r: ARENA + 12, width: 16 };
/** Jauge des allures (longe), en bas : son cadre blanc va de top à bottom, sous l'anneau. */
export const GAIT_GAUGE = { x0: 30, y0: 328, w: 340, top: 306, bottom: 358 };

function arena(g, ctx) {
  fillView(g, ctx.view, '#8cc268', '#6fa94f');
  g.fillStyle = '#e3cf9f';
  circle(g, C.x, C.y, ARENA);
  g.fill();
  g.strokeStyle = 'rgba(160, 130, 80, 0.35)';
  g.lineWidth = 16;
  circle(g, C.x, C.y, PATH);
  g.stroke();
  g.strokeStyle = '#f4f0e6';
  g.lineWidth = 6;
  circle(g, C.x, C.y, ARENA);
  g.stroke();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.fillStyle = '#8a5a2b';
    circle(g, C.x + Math.cos(a) * ARENA, C.y + Math.sin(a) * ARENA, 4.5);
    g.fill();
  }
}

/**
 * Anneau « juste ce qu'il faut » autour du manège : il se remplit (en bleu) avec le travail
 * fait, la part verte est la zone juste [lo, hi] (avec son ✓), le tour complet = max (trop).
 */
function drawWorkRing(g, value, lo, hi, max) {
  const R = WORK_RING.r;
  const a0 = -Math.PI / 2;
  const ang = (k) => a0 + clamp(k) * Math.PI * 2;
  g.save();
  g.lineCap = 'butt';
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.lineWidth = 10;
  circle(g, C.x, C.y, R);
  g.stroke();
  g.strokeStyle = 'rgba(63,174,98,0.95)';
  g.lineWidth = WORK_RING.width;
  g.beginPath();
  g.arc(C.x, C.y, R, ang(lo / max), ang(hi / max));
  g.stroke();
  if (value > 0) {
    g.strokeStyle = '#3c7bd9';
    g.lineWidth = 8;
    g.beginPath();
    g.arc(C.x, C.y, R, a0, ang(value / max));
    g.stroke();
  }
  const am = ang((lo + hi) / 2 / max);
  label(g, '✓', C.x + Math.cos(am) * (R + 15), C.y + Math.sin(am) * (R + 15), 18, '#1e5c3e');
  g.restore();
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------- longe

const GAITS = { walk: [12, 38], trot: [38, 66], canter: [66, 92] };

export function lungeGame(ctx) {
  const { a, t, fx } = ctx;
  const steps = ['walk', 'trot', 'canter', 'trot'];
  const NEED = 3; // secondes à la bonne allure avant de passer à la suivante
  // « Juste ce qu'il faut » : le travail (secondes à la bonne allure) doit s'arrêter entre
  // LO et HI ; à MAX, le cheval n'en peut plus et c'est fini (trop).
  const LO = NEED * steps.length;
  const HI = LO + 4;
  const MAX = HI + 6;
  const lazy = a.personality === 'calm' ? -12 : a.personality === 'playful' ? 12 : 0;
  let work = 0; // la quantité juste : secondes passées à l'allure demandée
  let step = 0;
  let v = 20;
  let natural = 25;
  let natT = 2;
  let theta = Math.PI / 2;
  let legs = 0;
  let whip = 0;
  let wasIn = false;
  let zoneState = ''; // '' | 'in' | 'over' : pour ne dire la consigne qu'au changement

  const gait = () => steps[Math.min(step, steps.length - 1)];
  const say = () => ctx.hint(t('mg_lunge_hint', { name: a.name, gait: t(`mg_gait_${gait()}`) }));
  say();
  ctx.zone(LO / MAX, HI / MAX);
  ctx.button(`🐢 ${t('mg_lunge_slow')}`, { cls: 'mg-half', onTap: () => slow() });
  ctx.button(`✨ ${t('mg_lunge_fast')}`, { cls: 'mg-half primary', onTap: () => fast() });
  const unstack = stopOnOwnRow(ctx.stopButton(() => end()));

  function slow() { if (!ctx.done) v = Math.max(0, v - 13); }
  function fast() {
    if (ctx.done) return;
    v = Math.min(100, v + 13);
    whip = 0.5;
  }

  /** Fin : tous les points dans la zone verte, un peu moins si c'est trop peu ou trop. */
  function end() {
    if (ctx.done) return;
    const { verdict } = ctx.finishJust(work, LO, HI, { who: a.name });
    if (verdict === 'just') {
      fx.text(C.x, C.y - 40, t('mg_perfect'), '#2f8a5f', 24);
      fx.burst(C.x, C.y, '💛', 6);
    } else if (verdict === 'low') {
      fx.text(C.x, C.y - 40, t('mg_more_short'), '#c07a10', 24);
    } else {
      fx.text(C.x, C.y - 40, t('mg_oops'), '#c8463c', 24);
      fx.burst(C.x, C.y, '💨', 5);
    }
  }

  return {
    peek: () => ({ v, gait: gait(), step, value: work, lo: LO, hi: HI, max: MAX, gaits: GAITS }),
    destroy() { unstack?.(); },
    // Toucher le manège : au centre, doucement ; ailleurs, allez ! (pas sur la jauge des allures).
    down(p) { if (p.y > GAIT_GAUGE.top) return; if (dist(p.x, p.y, C.x, C.y) < 60) slow(); else fast(); },
    key(code, down) {
      if (!down) return;
      if (code === 'ArrowUp' || code === 'Space' || code === 'ArrowRight') fast();
      if (code === 'ArrowDown' || code === 'ArrowLeft') slow();
      if (code === 'Enter' || code === 'NumpadEnter') end();
    },
    update(dt) {
      dt = Math.max(0, dt); // le premier pas du cadre peut être (très légèrement) négatif
      whip = Math.max(0, whip - dt);
      if (ctx.done) {
        v = Math.max(0, v - dt * 30);
      } else {
        natT -= dt;
        if (natT <= 0) {
          natT = 2 + ctx.rng() * 2.5;
          natural = clamp(20 + ctx.rng() * 60 + lazy, 8, 95);
        }
        v += (natural - v) * 0.3 * dt;
        const [lo, hi] = GAITS[gait()];
        let ok = v >= lo && v <= hi;
        if (ok) {
          work += dt;
          // L'allure suivante dès que le temps est fait (la dernière, le trot, dure tant qu'on continue).
          const next = Math.min(steps.length - 1, Math.floor(work / NEED));
          if (next !== step) {
            step = next;
            fx.text(C.x, C.y - 40, t('mg_perfect'), '#2f8a5f', 24);
            say();
            const [l2, h2] = GAITS[gait()];
            ok = v >= l2 && v <= h2;
            wasIn = ok; // la nouvelle allure vient d'être dite : pas d'autre consigne ce tour-ci
          }
        }
        ctx.progress(work / MAX);
        // Consignes : la zone verte passe avant l'allure, et on ne parle qu'au changement.
        const zs = work >= MAX ? 'max' : work > HI ? 'over' : work >= LO ? 'in' : '';
        if (zs !== zoneState) {
          zoneState = zs;
          wasIn = ok;
          // Dans le vert : « appuie sur C'est bon ! » (mg_tapStop, sinon la consigne de la zone).
          if (zs === 'in') { ctx.hint(tOr(t, 'mg_tapStop', 'mg_zoneHint'), 'good'); fx.text(C.x, C.y + 40, t('mg_good'), '#2f8a5f', 22); }
          else if (zs === 'over') ctx.hint(tOr(t, 'mg_tooMuchStop', 'mg_zoneHint'), 'warn');
        } else if (!zs) {
          if (ok && !wasIn) ctx.hint(t('mg_lunge_keep'), 'good');
          else if (!ok && wasIn) say();
          wasIn = ok;
        }
        if (work >= MAX) {
          // Le cheval n'en peut plus : c'est trop, et c'est fini.
          end();
          return;
        }
      }
      const speed = v * 0.022;
      theta += speed * dt;
      legs += dt * (4 + v * 0.18);
    },
    draw(g) {
      arena(g, ctx);
      drawWorkRing(g, work, LO, HI, MAX);
      const hx = C.x + Math.cos(theta) * PATH;
      const hy = C.y + Math.sin(theta) * PATH;
      const dir = theta + Math.PI / 2;
      // longe
      const head = { x: hx + Math.cos(dir) * 50, y: hy + Math.sin(dir) * 50 };
      g.strokeStyle = '#3c7bd9';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(C.x, C.y);
      g.quadraticCurveTo((C.x + head.x) / 2, (C.y + head.y) / 2 + 10, head.x, head.y);
      g.stroke();
      // chambrière
      const ang = Math.atan2(hy - C.y, hx - C.x);
      const wa = ang - 0.9 - whip * 0.6;
      g.strokeStyle = '#5b3a24';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(C.x, C.y);
      g.lineTo(C.x + Math.cos(wa) * (60 + whip * 30), C.y + Math.sin(wa) * (60 + whip * 30));
      g.stroke();
      drawHorseTop(g, a, hx, hy, dir, 1, legs);
      drawPersonTop(g, C.x, C.y, ang, 1);
      if (whip > 0) emoji(g, '✨', C.x + Math.cos(wa) * 90, C.y + Math.sin(wa) * 90, 20);
      if (ctx.done && work >= MAX) emoji(g, '💨', hx + 24, hy - 24, 22);
      drawGaitGauge(g, t, v, gait(), ctx.done);
    },
  };
}

/**
 * Téléphone en portrait : « C'est bon ! » passe sur sa propre ligne, en entier, sous
 * « Doucement » / « Allez ! ». Trois boutons côte à côte coupaient les mots sur deux ou trois
 * lignes (« Allez / ! »), et un « Allez ! » tapé un peu trop à droite finissait la séance.
 * En paysage, ils restent sur une ligne : la hauteur y est comptée. Renvoie de quoi se désabonner.
 */
function stopOnOwnRow(btn) {
  const row = btn?.parentElement;
  const mq = globalThis.matchMedia?.('(max-width: 640px) and (orientation: portrait)');
  if (!row?.style || !btn.style || !mq) return null;
  const apply = () => {
    row.style.flexWrap = mq.matches ? 'wrap' : '';
    btn.style.flexBasis = mq.matches ? '100%' : '';
  };
  apply();
  mq.addEventListener?.('change', apply);
  return () => mq.removeEventListener?.('change', apply);
}

function drawGaitGauge(g, t, v, target, done) {
  const { x0, y0, w, top, bottom } = GAIT_GAUGE;
  g.fillStyle = 'rgba(255,255,255,0.9)';
  rrect(g, x0 - 10, top, w + 20, bottom - top, 16);
  g.fill();
  for (const [id, [lo, hi]] of Object.entries(GAITS)) {
    const xa = x0 + (lo / 100) * w;
    const xb = x0 + (hi / 100) * w;
    const on = id === target && !done;
    g.fillStyle = on ? '#3fae62' : '#dfe8e2';
    rrect(g, xa + 2, y0 - 8, xb - xa - 4, 16, 8);
    g.fill();
    label(g, t(`mg_gait_${id}`), (xa + xb) / 2, y0 + 19, 12, on ? '#1e7a40' : '#66746c');
  }
  emoji(g, '🐴', x0 + (clamp(v, 0, 100) / 100) * w, y0 - 4, 24);
}

// ---------------------------------------------------------------- liberté

export function libertyGame(ctx) {
  const { a, t, fx } = ctx;
  // « Juste ce qu'il faut » : la pression (secondes où le cheval avance parce que tu es
  // derrière lui) doit s'arrêter entre LO et HI avant de l'appeler ; à MAX il est épuisé.
  // Trop près de lui (moins de CLOSE px), il se presse : la pression compte double.
  const LO = 8;
  const HI = 11;
  const MAX = 16;
  const CLOSE = 40;
  let theta = -Math.PI / 2;
  let dirSign = 1;
  let speed = 0.3;
  let legs = 0;
  let drive = 0; // la quantité juste
  let block = 0;
  let phase = 'drive'; // 'drive' : on le fait avancer ; 'join' : il vient vers toi (fin)
  let join = null;
  let me = { x: C.x, y: C.y };
  let driving = false;
  let close = false;
  let rushFx = 0;
  let zoneState = '';

  ctx.hint(t('mg_liberty_hint', { name: a.name }));
  ctx.zone(LO / MAX, HI / MAX);
  const stopBtn = ctx.stopButton(() => call());

  const horsePos = () => (join ? { x: join.x, y: join.y } : { x: C.x + Math.cos(theta) * PATH, y: C.y + Math.sin(theta) * PATH });

  function place(p) {
    const d = dist(p.x, p.y, C.x, C.y);
    const k = d > 100 ? 100 / d : 1;
    me = { x: C.x + (p.x - C.x) * k, y: C.y + (p.y - C.y) * k };
  }

  function relAngle() {
    const pa = Math.atan2(me.y - C.y, me.x - C.x);
    return wrap(pa - theta) * dirSign; // négatif = derrière le cheval
  }

  /** On l'appelle : il vient, et c'est la fin (la pression accumulée fait la note). */
  function call() {
    if (ctx.done || phase !== 'drive') return;
    phase = 'join';
    join = { ...horsePos(), k: 0 };
    stopBtn.disabled = true;
    ctx.hint(t('mg_liberty_join', { name: a.name }), 'good');
  }

  function end() {
    if (ctx.done) return;
    const { verdict } = ctx.finishJust(drive, LO, HI, { who: a.name });
    const hp = horsePos();
    if (verdict === 'just') {
      fx.text(C.x, 40, t('mg_perfect'), '#2f8a5f', 24);
      fx.burst(hp.x, hp.y - 20, '💛', 6);
    } else if (verdict === 'low') {
      fx.text(C.x, 40, t('mg_more_short'), '#c07a10', 24);
    } else {
      fx.text(C.x, 40, t('mg_oops'), '#c8463c', 24);
      fx.burst(hp.x, hp.y - 20, '💨', 5);
    }
  }

  return {
    peek: () => ({ theta, dirSign, phase, horse: horsePos(), me: { ...me }, value: drive, lo: LO, hi: HI, max: MAX, close: CLOSE, driving, tooClose: close }),
    down(p) {
      if (phase !== 'drive') return;
      // Dès que la jauge est dans le vert, toucher le cheval l'appelle.
      if (drive >= LO) {
        const hp = horsePos();
        if (dist(p.x, p.y, hp.x, hp.y) < 50) return call();
      }
      place(p);
    },
    move(p, down) { if ((down || p.type === 'mouse') && phase === 'drive') place(p); },
    key(code, down) { if (down && (code === 'Enter' || code === 'NumpadEnter' || code === 'Space')) call(); },
    update(dt) {
      dt = Math.max(0, dt); // le premier pas du cadre peut être (très légèrement) négatif
      legs += dt * (3 + speed * 10);
      if (phase === 'join') {
        join.k = Math.min(1, join.k + dt * 0.8);
        const tx = me.x + Math.cos(Math.atan2(join.y - me.y, join.x - me.x)) * 40;
        const ty = me.y + Math.sin(Math.atan2(join.y - me.y, join.x - me.x)) * 40;
        join.x = lerp(join.x, tx, dt * 2);
        join.y = lerp(join.y, ty, dt * 2);
        if (Math.random() < dt * 5) fx.float(join.x, join.y - 20, '💛', 22);
        if (join.k >= 1 && !ctx.done) end();
        return;
      }
      const rel = relAngle();
      const r = dist(me.x, me.y, C.x, C.y);
      const hp = horsePos();
      const dh = dist(me.x, me.y, hp.x, hp.y);
      let target = 0.15;
      driving = rel < -0.2 && rel > -1.4 && r > 25;
      close = driving && dh < CLOSE;
      if (driving) {
        // Trop près : il se presse (et ça le fatigue deux fois plus vite).
        target = close ? 1.9 : 1.25;
        drive += dt * (close ? 2 : 1);
        block = 0;
        if (close) {
          rushFx -= dt;
          if (rushFx <= 0) { rushFx = 0.5; fx.float(hp.x, hp.y - 24, '💨', 22); }
        }
      } else if (rel > 0.05 && rel < 1.0 && r > 25) {
        // Devant lui : il ralentit puis fait demi-tour.
        target = 0;
        block += dt;
        if (block > 0.7 && speed < 0.25) {
          dirSign = -dirSign;
          block = 0;
          fx.text(hp.x, hp.y - 40, t('mg_liberty_turn'), '#3c7bd9', 18);
        }
      }
      speed = lerp(speed, target, dt * 1.6);
      theta += speed * dirSign * dt;
      ctx.progress(drive / MAX);
      const zs = drive > HI ? 'over' : drive >= LO ? 'in' : '';
      if (zs !== zoneState) {
        zoneState = zs;
        if (zs === 'in') { ctx.hint(t('mg_liberty_call', { name: a.name }), 'good'); fx.text(C.x, 40, t('mg_good'), '#2f8a5f', 24); }
        else if (zs === 'over') ctx.hint(t('mg_liberty_call', { name: a.name }), 'warn');
      } else if (!zs) {
        if (driving && speed > 0.7 && !close) ctx.hint(t('mg_liberty_good', { name: a.name }), 'good');
        else if (!driving) ctx.hint(t('mg_liberty_hint', { name: a.name }));
      }
      // Épuisé : il s'arrête tout seul et vient vers toi (trop).
      if (drive >= MAX) call();
    },
    draw(g) {
      arena(g, ctx);
      drawWorkRing(g, drive, LO, HI, MAX);
      const hp = horsePos();
      if (phase === 'drive') {
        // Zone verte : derrière l'épaule du cheval
        const a0 = theta - 1.4 * dirSign;
        const a1 = theta - 0.2 * dirSign;
        g.save();
        g.globalAlpha = 0.35 + Math.sin(ctx.time * 4) * 0.1;
        g.fillStyle = '#3fae62';
        g.beginPath();
        g.arc(C.x, C.y, 100, Math.min(a0, a1), Math.max(a0, a1));
        g.arc(C.x, C.y, 25, Math.max(a0, a1), Math.min(a0, a1), true);
        g.closePath();
        g.fill();
        // Trop près : un disque orange autour du cheval (il se presse)
        g.globalAlpha = close ? 0.45 : 0.22;
        g.fillStyle = '#e0574a';
        circle(g, hp.x, hp.y, CLOSE);
        g.fill();
        g.restore();
      }
      const heading = join ? Math.atan2(me.y - hp.y, me.x - hp.x) : theta + (dirSign * Math.PI) / 2;
      drawHorseTop(g, a, hp.x, hp.y, heading, 1, legs);
      const meDir = Math.atan2(hp.y - me.y, hp.x - me.x);
      drawPersonTop(g, me.x, me.y, meDir, 1);
      if (phase === 'drive' && drive >= LO) {
        // La main « touche-le » au-dessus du cheval, sans sortir du cadre quand il passe en haut.
        const s = 1 + Math.sin(ctx.time * 6) * 0.15;
        emoji(g, '👆', hp.x, Math.max(20, hp.y - 44), 30 * s);
      }
      if (join && join.k > 0.2) emoji(g, '💛', (hp.x + me.x) / 2, (hp.y + me.y) / 2 - 30, 26);
      label(g, '🟢 ' + t('mg_liberty_zone'), 200, 330, 15, '#1e5c3e');
    },
  };
}
