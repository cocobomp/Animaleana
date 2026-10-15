// Travail à pied du cheval, vu de dessus : longe et liberté.

import { drawHorseTop, drawPersonTop, rrect, circle, emoji, label, fillView, clamp, lerp, dist } from './draw.js';

const C = { x: 200, y: 158 };
const ARENA = 132;
const PATH = 102;

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

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------- longe

const GAITS = { walk: [12, 38], trot: [38, 66], canter: [66, 92] };

export function lungeGame(ctx) {
  const { a, t, fx } = ctx;
  const steps = ['walk', 'trot', 'canter', 'trot'];
  const NEED = 4;
  const lazy = a.personality === 'calm' ? -12 : a.personality === 'playful' ? 12 : 0;
  let step = 0;
  let inZone = 0;
  let zoneTotal = 0;
  let elapsed = 0;
  let v = 20;
  let natural = 25;
  let natT = 2;
  let theta = Math.PI / 2;
  let legs = 0;
  let whip = 0;
  let wasIn = false;

  const say = () => ctx.hint(t('mg_lunge_hint', { name: a.name, gait: t(`mg_gait_${steps[step]}`) }));
  say();
  ctx.button(`🐢 ${t('mg_lunge_slow')}`, { cls: 'mg-half', onTap: () => slow() });
  ctx.button(`✨ ${t('mg_lunge_fast')}`, { cls: 'mg-half primary', onTap: () => fast() });

  function slow() { if (!ctx.done) v = Math.max(0, v - 13); }
  function fast() {
    if (ctx.done) return;
    v = Math.min(100, v + 13);
    whip = 0.5;
  }

  return {
    peek: () => ({ v, gait: steps[step] }),
    down(p) { if (p.y > 300) return; if (dist(p.x, p.y, C.x, C.y) < 60) slow(); else fast(); },
    key(code, down) {
      if (!down) return;
      if (code === 'ArrowUp' || code === 'Space' || code === 'ArrowRight') fast();
      if (code === 'ArrowDown' || code === 'ArrowLeft') slow();
    },
    update(dt) {
      whip = Math.max(0, whip - dt);
      if (ctx.done) {
        v = Math.max(0, v - dt * 30);
      } else {
        elapsed += dt;
        natT -= dt;
        if (natT <= 0) {
          natT = 2 + ctx.rng() * 2.5;
          natural = clamp(20 + ctx.rng() * 60 + lazy, 8, 95);
        }
        v += (natural - v) * 0.3 * dt;
        const [lo, hi] = GAITS[steps[step]];
        const ok = v >= lo && v <= hi;
        if (ok) {
          inZone += dt;
          zoneTotal += dt;
          if (!wasIn) ctx.hint(t('mg_lunge_keep'), 'good');
        } else if (wasIn) say();
        wasIn = ok;
        ctx.progress((step + Math.min(1, inZone / NEED)) / steps.length);
        if (inZone >= NEED) {
          step++;
          inZone = 0;
          wasIn = false;
          fx.text(C.x, C.y - 40, t('mg_perfect'), '#2f8a5f', 24);
          if (step >= steps.length) {
            ctx.finish(0.45 + 0.55 * clamp((zoneTotal / Math.max(1, elapsed)) / 0.8));
            fx.burst(C.x, C.y, '💛', 6);
            return;
          }
          say();
        }
      }
      const speed = v * 0.022;
      theta += speed * dt;
      legs += dt * (4 + v * 0.18);
    },
    draw(g) {
      arena(g, ctx);
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
      drawGaitGauge(g, t, v, steps[step] ?? 'trot', ctx.done);
    },
  };
}

function drawGaitGauge(g, t, v, target, done) {
  const x0 = 30;
  const y0 = 322;
  const w = 340;
  g.fillStyle = 'rgba(255,255,255,0.9)';
  rrect(g, x0 - 10, y0 - 22, w + 20, 52, 16);
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
  let theta = -Math.PI / 2;
  let dirSign = 1;
  let speed = 0.3;
  let legs = 0;
  let prog = 0;
  let drive = 0;
  let elapsed = 0;
  let block = 0;
  let phase = 'drive';
  let join = null;
  let me = { x: C.x, y: C.y };

  ctx.hint(t('mg_liberty_hint', { name: a.name }));

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

  return {
    peek: () => ({ theta, dirSign, phase, horse: horsePos() }),
    down(p) {
      if (phase === 'call') {
        const hp = horsePos();
        if (dist(p.x, p.y, hp.x, hp.y) < 60) {
          phase = 'join';
          join = { ...hp, k: 0 };
          ctx.hint(t('mg_liberty_join', { name: a.name }), 'good');
          return;
        }
      }
      if (phase === 'drive') place(p);
    },
    move(p, down) { if ((down || p.type === 'mouse') && phase === 'drive') place(p); },
    update(dt) {
      legs += dt * (3 + speed * 10);
      if (phase === 'join') {
        join.k = Math.min(1, join.k + dt * 0.8);
        const tx = me.x + Math.cos(Math.atan2(join.y - me.y, join.x - me.x)) * 40;
        const ty = me.y + Math.sin(Math.atan2(join.y - me.y, join.x - me.x)) * 40;
        join.x = lerp(join.x, tx, dt * 2);
        join.y = lerp(join.y, ty, dt * 2);
        if (Math.random() < dt * 5) fx.float(join.x, join.y - 20, '💛', 22);
        if (join.k >= 1 && !ctx.done) {
          ctx.progress(1);
          ctx.finish(0.5 + 0.5 * clamp(drive / Math.max(1, elapsed) / 0.6), t('mg_liberty_end', { name: a.name }));
        }
        return;
      }
      const rel = relAngle();
      const r = dist(me.x, me.y, C.x, C.y);
      let target = 0.15;
      const driving = phase === 'drive' && rel < -0.2 && rel > -1.4 && r > 25;
      if (phase === 'drive') elapsed += dt;
      if (driving) {
        target = 1.25;
        drive += dt;
        block = 0;
      } else if (phase === 'drive' && rel > 0.05 && rel < 1.0 && r > 25) {
        // Devant lui : il ralentit puis fait demi-tour.
        target = 0;
        block += dt;
        if (block > 0.7 && speed < 0.25) {
          dirSign = -dirSign;
          block = 0;
          fx.text(horsePos().x, horsePos().y - 40, t('mg_liberty_turn'), '#3c7bd9', 18);
        }
      }
      if (phase === 'call') target = 0;
      speed = lerp(speed, target, dt * 1.6);
      theta += speed * dirSign * dt;
      if (phase === 'drive') {
        if (driving && speed > 0.7) prog += dt / 11;
        ctx.progress(prog * 0.85);
        if (driving && speed > 0.7) ctx.hint(t('mg_liberty_good', { name: a.name }), 'good');
        else if (!driving) ctx.hint(t('mg_liberty_hint', { name: a.name }));
        if (prog >= 1) {
          phase = 'call';
          ctx.hint(t('mg_liberty_call', { name: a.name }), 'good');
          fx.text(C.x, 40, t('mg_perfect'), '#2f8a5f', 24);
        }
      }
    },
    draw(g) {
      arena(g, ctx);
      const hp = horsePos();
      // Zone verte : derrière l'épaule du cheval
      if (phase === 'drive') {
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
        g.restore();
      }
      const heading = join ? Math.atan2(me.y - hp.y, me.x - hp.x) : theta + (dirSign * Math.PI) / 2;
      drawHorseTop(g, a, hp.x, hp.y, heading, 1, legs);
      const meDir = Math.atan2(hp.y - me.y, hp.x - me.x);
      drawPersonTop(g, me.x, me.y, meDir, 1);
      if (phase === 'call') {
        const s = 1 + Math.sin(ctx.time * 6) * 0.15;
        emoji(g, '👆', hp.x, hp.y - 44, 30 * s);
      }
      if (join && join.k > 0.2) emoji(g, '💛', (hp.x + me.x) / 2, (hp.y + me.y) / 2 - 30, 26);
      label(g, '🟢 ' + t('mg_liberty_zone'), 200, 330, 15, '#1e5c3e');
    },
  };
}
