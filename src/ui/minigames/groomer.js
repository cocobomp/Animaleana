// Mini-jeux du salon de toilettage (métier Toiletteur ✂️) : démêler les nœuds, la coupe au pochoir,
// nettoyer les oreilles, brosser les dents, le séchoir (sans faire peur !) et les finitions
// (accessoire, couleur, parfum). Même format que les autres mini-jeux (voir src/ui/minigames.js).
// Ces jeux sont inscrits auprès de runMinigame par registerMinigames (fait dans src/ui/groomer.js).

import { drawAnimal, animalShape, fitAnimal, rrect, ellipse, circle, emoji, label, fillView, tiles, clamp, lerp, dist, distToSegment, shade } from './draw.js';
import { ACCESSORIES, ACC_COLORS } from '../../sim/groomer.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

/** Décor du salon : carrelage pastel et tapis. */
function salonBackground(g, ctx, floorY = 300) {
  fillView(g, ctx.view, '#fdf0f5', '#f7dbe6');
  tiles(g, ctx.view, '#fbe6ee', '#f3cfdd', 44);
  g.fillStyle = '#e8d2dd';
  g.fillRect(ctx.view.x0, floorY, ctx.view.w, ctx.view.y1 - floorY);
  g.fillStyle = '#c9b6e6';
  ellipse(g, 200, floorY + 10, 175, 20);
  g.fill();
}

/** Petite jauge (stress, calme…) en haut à droite. */
function gauge(g, x, y, w, v, color, icon, text) {
  g.fillStyle = 'rgba(255,255,255,0.85)';
  rrect(g, x, y, w, 20, 10);
  g.fill();
  g.fillStyle = color;
  rrect(g, x + 2, y + 2, Math.max(0, (w - 4) * clamp(v)), 16, 8);
  g.fill();
  emoji(g, icon, x - 14, y + 10, 20);
  if (text) label(g, text, x + w / 2, y + 10, 12, '#23302a');
}

const speedOf = (last, p, dt) => (last && dt > 0 ? dist(last.x, last.y, p.x, p.y) / dt : 0);

/** Dessine un accessoire (prévisualisation) sur l'animal dessiné, à l'emplacement de son slot. */
export function drawAccessoryOn(g, sh, worn, s = 1) {
  const def = ACCESSORIES[worn?.id];
  if (!def) return;
  const color = hex(ACC_COLORS[worn.color] ?? ACC_COLORS.pink);
  const dark = shade(ACC_COLORS[worn.color] ?? ACC_COLORS.pink, -0.35);
  const bow = (x, y, r) => {
    g.fillStyle = color;
    ellipse(g, x - r * 0.9, y, r, r * 0.6, -0.3);
    g.fill();
    ellipse(g, x + r * 0.9, y, r, r * 0.6, 0.3);
    g.fill();
    g.fillStyle = dark;
    circle(g, x, y, r * 0.42);
    g.fill();
  };
  const hr = sh.hr;
  if (def.slot === 'head') {
    const x = sh.headTop.x;
    const y = sh.headTop.y - hr * 0.15;
    if (worn.id === 'ribbon') bow(x, y, hr * 0.5);
    else if (worn.id === 'flower') {
      g.fillStyle = color;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        circle(g, x + Math.cos(a) * hr * 0.32, y + Math.sin(a) * hr * 0.32, hr * 0.24);
        g.fill();
      }
      g.fillStyle = '#f2c94c';
      circle(g, x, y, hr * 0.2);
      g.fill();
    } else if (worn.id === 'hat') {
      g.fillStyle = color;
      rrect(g, x - hr * 0.95, y - hr * 0.1, hr * 1.9, hr * 0.22, 4);
      g.fill();
      rrect(g, x - hr * 0.55, y - hr * 1.0, hr * 1.1, hr * 0.95, 5);
      g.fill();
      g.fillStyle = '#2a2a2a';
      g.fillRect(x - hr * 0.55, y - hr * 0.32, hr * 1.1, hr * 0.14);
    }
  } else if (def.slot === 'neck') {
    const n = sh.a.species === 'horse' ? sh.chest : sh.neck;
    const x = lerp(n.x, sh.head.x, 0.25);
    const y = lerp(n.y, sh.head.y, 0.25) + hr * 0.45;
    const R = Math.max(10 * s, hr * 0.6);
    if (worn.id === 'bandana') {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(x - R * 0.9, y - R * 0.2);
      g.lineTo(x + R * 0.9, y - R * 0.2);
      g.lineTo(x, y + R * 0.9);
      g.closePath();
      g.fill();
    } else {
      g.strokeStyle = worn.id === 'bell' ? color : '#3a2a20';
      g.lineWidth = Math.max(3, R * 0.18);
      g.beginPath();
      g.arc(x, y - R * 0.3, R * 0.9, 0.15, Math.PI - 0.15);
      g.stroke();
      if (worn.id === 'bow') bow(x, y + R * 0.3, R * 0.5);
      else {
        g.fillStyle = '#f2c94c';
        circle(g, x, y + R * 0.45, R * 0.32);
        g.fill();
        g.fillStyle = '#8a6a10';
        circle(g, x, y + R * 0.55, R * 0.08);
        g.fill();
      }
    }
  } else if (def.slot === 'tail') {
    const p = sh.L(-sh.rx * 0.98, -sh.ry * 0.45);
    bow(p.x, p.y, Math.max(8 * s, sh.ry * 0.28));
  }
}

// ---------------------------------------------------------------- 🧶 démêler les nœuds

export function knotsGame(ctx) {
  const { a, t, fx, rng } = ctx;
  const floorY = 305;
  const fit = fitAnimal(a, { groundY: floorY, maxW: 340, maxH: 250 });
  const sh = animalShape(a, { x: fit.x, y: floorY, s: fit.s, f: 1 });
  const knots = [];
  let tries = 0;
  while (knots.length < 5 && tries < 300) {
    tries++;
    const lx = (rng() * 2 - 1) * sh.rx * 0.75;
    const ly = (rng() * 2 - 1) * sh.ry * 0.6;
    if ((lx * lx) / (sh.rx * 0.8) ** 2 + (ly * ly) / (sh.ry * 0.7) ** 2 > 1) continue;
    const p = sh.L(lx, ly);
    if (knots.some((k) => dist(k.x, k.y, p.x, p.y) < 40 * fit.s)) continue;
    knots.push({ ...p, r: 15 * Math.max(0.8, fit.s), left: 1, ang: null, seed: rng() * 10 });
  }
  if (a.species === 'horse') knots.push({ ...sh.neck, r: 15 * fit.s, left: 1, ang: null, seed: 4 });
  let cur = null;
  let last = null;
  let lastT = 0;
  let tugs = 0;
  let shake = 0;
  const NEED = Math.PI * 3.5;
  ctx.hint(t('mg_gknots_hint'));
  const progress = () => 1 - knots.reduce((s, k) => s + k.left, 0) / knots.length;

  function work(p) {
    if (!cur) return;
    const ang = Math.atan2(p.y - cur.y, p.x - cur.x);
    const sp = speedOf(last, p, ctx.time - lastT);
    if (cur.ang != null) {
      let d = ang - cur.ang;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (sp > 1100) {
        tugs++;
        shake = 0.5;
        fx.text(cur.x, cur.y - 30, t('mg_gknots_ouch'), '#c8463c', 18);
        ctx.hint(t('mg_gknots_gentle'), 'warn');
      } else {
        cur.left = Math.max(0, cur.left - Math.abs(d) / NEED);
        if (Math.random() < 0.3) fx.dot(p.x, p.y, 'rgba(120,90,60,0.5)', 2.5, { vy: 30, grav: 80, life: 0.5 });
        if (cur.left === 0) {
          fx.burst(cur.x, cur.y, '✨', 4, { speed: 90, size: 16 });
          fx.text(cur.x, cur.y - 26, t('mg_gknots_done1'), '#2f8a5f', 20);
          const i = knots.indexOf(cur);
          if (i >= 0) knots.splice(i, 1);
          cur = null;
          if (knots.length) ctx.hint(t('mg_gknots_hint'), 'good');
        }
      }
    }
    if (cur) cur.ang = ang;
    last = p;
    lastT = ctx.time;
    ctx.progress(progress());
    if (!knots.length && !ctx.done) ctx.finish(1 - clamp(tugs / 8) * 0.5, tugs <= 1 ? t('mg_gknots_end', { name: a.name }) : undefined);
  }

  return {
    peek: () => ({ knots: knots.map((k) => ({ x: k.x, y: k.y, r: k.r, left: k.left })), body: { x: sh.bx, y: sh.by, rx: sh.rx, ry: sh.ry } }),
    down(p) {
      cur = knots.find((k) => dist(k.x, k.y, p.x, p.y) < k.r + 22) ?? null;
      if (cur) cur.ang = null;
      last = p;
      lastT = ctx.time;
    },
    move(p, down) { if (down) work(p); },
    up() { cur = null; last = null; },
    update(dt) { shake = Math.max(0, shake - dt); },
    draw(g) {
      salonBackground(g, ctx, floorY);
      drawAnimal(g, a, { x: fit.x, y: floorY, s: fit.s, f: 1, shake: shake > 0 ? 1 : 0, happy: ctx.done });
      for (const k of knots) {
        g.save();
        g.globalAlpha = 0.25 + 0.75 * k.left;
        g.strokeStyle = shade(ctx.col.raw.coat, -0.5);
        g.lineWidth = 2.2;
        g.lineCap = 'round';
        for (let i = 0; i < 6; i++) {
          const a0 = k.seed + i * 1.1;
          g.beginPath();
          g.arc(k.x + Math.cos(a0) * k.r * 0.35, k.y + Math.sin(a0) * k.r * 0.3, k.r * (0.45 + (i % 3) * 0.15) * (0.5 + 0.5 * k.left), a0, a0 + 2.6);
          g.stroke();
        }
        g.restore();
        if (k === cur) {
          g.strokeStyle = 'rgba(47,138,95,0.8)';
          g.setLineDash([5, 5]);
          g.lineWidth = 2;
          circle(g, k.x, k.y, k.r + 14);
          g.stroke();
          g.setLineDash([]);
        }
      }
      if (ctx.pointer.over) emoji(g, '🪮', ctx.pointer.x + 12, ctx.pointer.y - 12, 34, 0.4);
    },
  };
}

// ---------------------------------------------------------------- ✂️ la coupe au pochoir

/** La zone à garder (en vert) selon la coupe. u, v : position dans le corps (-1…1), k : distance au bord (1 = bord). */
function keepFor(style) {
  const heart = (u, v) => {
    const x = (u + 0.45) / 0.33;
    const y = -(v + 0.05) / 0.33;
    return (x * x + y * y - 1) ** 3 - x * x * y * y * y < 0;
  };
  switch (style) {
    case 'long': return (u, v, k) => k < 1.12;
    case 'lion': return (u, v, k, head) => head || u > 0.3;
    case 'caniche': return (u, v, k, head) => head || u < -0.85 || (v > 0.55 && Math.abs(Math.abs(u) - 0.58) < 0.14);
    case 'coeur': return (u, v, k, head) => !head && k <= 1 && heart(u, v);
    case 'tonte': return (u, v, k, head) => head;
    case 'concours': return (u, v, k, head) => head || (k <= 1 && v > 0.25);
    default: return () => false; // court : on coupe tout
  }
}

let cutStyle = 'court';
/** Coupe demandée (appelé par le salon avant runMinigame). */
export function setCutStyle(style) {
  cutStyle = style ?? 'court';
}

export function cutGame(ctx) {
  const { a, t, fx, rng } = ctx;
  const style = cutStyle;
  ctx.style = style;
  const floorY = 305;
  const fit = fitAnimal(a, { groundY: floorY, maxW: 330, maxH: 240 });
  const sh = animalShape(a, { x: fit.x, y: floorY, s: fit.s, f: 1 });
  const keep = keepFor(style);
  const tufts = [];
  const s = fit.s;
  const step = 13 * Math.max(0.75, s);
  // Fourrure trop longue : touffes sur tout le corps et une bande autour.
  for (let ly = -sh.ry * 1.3; ly <= sh.ry * 1.3; ly += step) {
    for (let lx = -sh.rx * 1.3; lx <= sh.rx * 1.3; lx += step) {
      const u = lx / sh.rx;
      const v = ly / sh.ry;
      const k = Math.sqrt(u * u + v * v);
      if (k > 1.28) continue;
      const p = sh.L(lx + (rng() - 0.5) * 4, ly + (rng() - 0.5) * 4);
      tufts.push({ ...p, u, v, k, head: false, keep: !!keep(u, v, k, false), cut: false, r: 7 * Math.max(0.8, s), seed: rng() * 10 });
    }
  }
  // Et sur la tête.
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    const rr = sh.hr * (1.05 + (i % 2) * 0.15);
    tufts.push({ x: sh.head.x + Math.cos(ang) * rr, y: sh.head.y + Math.sin(ang) * rr, u: 0, v: 0, k: 1.1, head: true, keep: !!keep(0, 0, 1.1, true), cut: false, r: 6 * Math.max(0.8, s), seed: rng() * 10 });
  }
  const toCut = tufts.filter((q) => !q.keep);
  let mistakes = 0;
  let last = null;
  let flash = 0;
  ctx.hint(t('mg_gcut_hint'));
  const progress = () => toCut.filter((q) => q.cut).length / Math.max(1, toCut.length);

  function clip(p) {
    if (!last) { last = p; return; }
    let touched = false;
    for (const q of tufts) {
      if (q.cut) continue;
      if (distToSegment(q.x, q.y, last.x, last.y, p.x, p.y) > q.r + 9) continue;
      q.cut = true;
      touched = true;
      if (q.keep) {
        mistakes++;
        flash = 0.4;
        fx.text(q.x, q.y - 20, t('mg_gcut_oops'), '#c8463c', 18);
        ctx.hint(t('mg_gcut_careful'), 'warn');
      } else {
        for (let i = 0; i < 3; i++) fx.dot(q.x + (Math.random() - 0.5) * 10, q.y, shade(ctx.col.raw.coat, 0.2), 3, { vx: (Math.random() - 0.5) * 80, vy: -30, grav: 200, life: 0.7 });
      }
    }
    last = p;
    if (touched) {
      const pr = progress();
      ctx.progress(pr);
      if (pr >= 0.999 && !ctx.done) {
        const q = clamp(1 - mistakes * 0.09, 0.4, 1);
        ctx.finish(q, mistakes === 0 ? t('mg_gcut_end', { name: a.name }) : undefined);
        fx.burst(sh.bx, sh.by - sh.ry, '✨', 8, { speed: 120, size: 18 });
      } else if (pr > 0.5) ctx.hint(t('mg_gcut_more'), 'good');
    }
  }

  return {
    peek: () => ({ style, toCut: toCut.filter((q) => !q.cut).map((q) => ({ x: q.x, y: q.y })), keep: tufts.filter((q) => q.keep && !q.cut).map((q) => ({ x: q.x, y: q.y })), mistakes }),
    down(p) { last = p; },
    move(p, down) { if (down) clip(p); },
    up() { last = null; },
    update(dt) { flash = Math.max(0, flash - dt); },
    draw(g) {
      salonBackground(g, ctx, floorY);
      drawAnimal(g, a, { x: fit.x, y: floorY, s, f: 1, happy: ctx.done, shake: flash > 0 ? 0.6 : 0 });
      // Touffes : roses à couper, vertes à garder.
      for (const q of tufts) {
        if (q.cut) continue;
        g.fillStyle = shade(ctx.col.raw.coat, 0.18);
        for (let i = 0; i < 3; i++) {
          const a0 = q.seed + i * 2.1;
          circle(g, q.x + Math.cos(a0) * q.r * 0.45, q.y + Math.sin(a0) * q.r * 0.45, q.r * 0.75);
          g.fill();
        }
        g.strokeStyle = q.keep ? 'rgba(63,174,98,0.85)' : 'rgba(224,87,74,0.55)';
        g.lineWidth = q.keep ? 2.2 : 1.4;
        g.setLineDash(q.keep ? [] : [3, 3]);
        circle(g, q.x, q.y, q.r + 1);
        g.stroke();
      }
      g.setLineDash([]);
      // Légende
      g.fillStyle = 'rgba(255,255,255,0.85)';
      rrect(g, 8, 8, 170, 42, 10);
      g.fill();
      g.strokeStyle = 'rgba(224,87,74,0.8)';
      g.setLineDash([3, 3]);
      g.lineWidth = 1.5;
      circle(g, 24, 20, 7);
      g.stroke();
      g.setLineDash([]);
      label(g, t('mg_gcut_legendCut'), 38, 20, 12, '#23302a', 'left');
      g.strokeStyle = 'rgba(63,174,98,0.9)';
      g.lineWidth = 2.2;
      circle(g, 24, 38, 7);
      g.stroke();
      label(g, t('mg_gcut_legendKeep'), 38, 38, 12, '#23302a', 'left');
      if (ctx.pointer.over) emoji(g, '✂️', ctx.pointer.x + 10, ctx.pointer.y - 10, 34, ctx.pointer.down ? 0.2 : -0.2);
    },
  };
}

// ---------------------------------------------------------------- 👂 nettoyer les oreilles

export function earsGame(ctx) {
  const { a, t, fx, rng } = ctx;
  const sp = a.species;
  const cx = 265;
  const cy = 165;
  const R = 105;
  const fit = fitAnimal(a, { cx: 95, groundY: 300, maxW: 150, maxH: 180 });
  let side = 0; // oreille gauche puis droite
  let rough = 0;
  let shake = 0;
  let last = null;
  let lastT = 0;
  const makeDirt = () => {
    const out = [];
    while (out.length < 6) {
      const x = cx + (rng() - 0.5) * R * 0.9;
      const y = cy + (rng() - 0.3) * R * 1.0;
      if (dist(x, y, cx, cy + R * 0.1) > R * 0.62) continue;
      if (out.some((d) => dist(d.x, d.y, x, y) < 26)) continue;
      out.push({ x, y, r: 11, left: 1 });
    }
    return out;
  };
  let dirt = makeDirt();
  ctx.hint(t('mg_gears_hint'));
  const progress = () => (side + 1 - dirt.reduce((s, d) => s + d.left, 0) / dirt.length) / 2;

  function wipe(p) {
    const sp2 = speedOf(last, p, ctx.time - lastT);
    last = p;
    lastT = ctx.time;
    if (sp2 > 750) {
      rough = Math.min(10, rough + 0.6);
      shake = 0.4;
      ctx.hint(t('mg_gears_gentle'), 'warn');
      return;
    }
    for (const d of dirt) {
      if (d.left <= 0 || dist(d.x, d.y, p.x, p.y) > d.r + 16) continue;
      d.left = Math.max(0, d.left - 0.08);
      if (Math.random() < 0.4) fx.dot(p.x, p.y + 6, 'rgba(120,80,50,0.5)', 2.5, { vy: 40, grav: 100, life: 0.5 });
      if (d.left === 0) fx.burst(d.x, d.y, '✨', 2, { speed: 60, size: 14 });
    }
    ctx.progress(progress());
    if (dirt.every((d) => d.left <= 0)) {
      if (side === 0) {
        side = 1;
        dirt = makeDirt();
        ctx.hint(t('mg_gears_other'), 'good');
        fx.text(cx, cy - R - 10, t('mg_gears_one'), '#2f8a5f', 22);
      } else if (!ctx.done) ctx.finish(1 - clamp(rough / 10) * 0.6, rough < 2 ? t('mg_gears_end', { name: a.name }) : undefined);
    }
  }

  function earPath(g, flip) {
    g.beginPath();
    const f = flip ? -1 : 1;
    if (sp === 'cat') {
      g.moveTo(cx - R * 0.7 * f, cy + R * 0.7);
      g.lineTo(cx + R * 0.1 * f, cy - R * 0.85);
      g.lineTo(cx + R * 0.75 * f, cy + R * 0.7);
      g.closePath();
    } else if (sp === 'rabbit') ellipse(g, cx, cy, R * 0.45, R * 0.9, 0.08 * f);
    else if (sp === 'horse' || sp === 'goat') {
      g.moveTo(cx - R * 0.55 * f, cy + R * 0.75);
      g.quadraticCurveTo(cx - R * 0.8 * f, cy - R * 0.4, cx + R * 0.05 * f, cy - R * 0.9);
      g.quadraticCurveTo(cx + R * 0.8 * f, cy - R * 0.3, cx + R * 0.55 * f, cy + R * 0.75);
      g.closePath();
    } else ellipse(g, cx, cy + R * 0.05, R * 0.62, R * 0.85, 0.12 * f);
  }

  return {
    peek: () => ({ side, dirt: dirt.filter((d) => d.left > 0).map((d) => ({ x: d.x, y: d.y })), rough }),
    down(p) { last = p; lastT = ctx.time; },
    move(p, down) { if (down) wipe(p); },
    up() { last = null; },
    update(dt) { shake = Math.max(0, shake - dt); },
    draw(g) {
      salonBackground(g, ctx, 300);
      drawAnimal(g, a, { x: fit.x, y: 300, s: fit.s, f: 1, shake: shake > 0 ? 0.8 : 0, happy: ctx.done });
      // Loupe sur l'oreille
      g.fillStyle = '#fff';
      circle(g, cx, cy, R + 8);
      g.fill();
      g.save();
      circle(g, cx, cy, R);
      g.clip();
      g.fillStyle = ctx.col.coat;
      g.fillRect(cx - R, cy - R, R * 2, R * 2);
      g.fillStyle = ctx.col.coat;
      earPath(g, side === 1);
      g.fill();
      g.fillStyle = '#f3b7c3';
      g.save();
      g.translate(cx, cy + R * 0.12);
      g.scale(0.68, 0.72);
      g.translate(-cx, -cy - R * 0.12);
      earPath(g, side === 1);
      g.fill();
      g.restore();
      for (const d of dirt) {
        if (d.left <= 0) continue;
        g.globalAlpha = d.left;
        g.fillStyle = '#8a5a30';
        circle(g, d.x, d.y, d.r * (0.6 + 0.4 * d.left));
        g.fill();
        g.globalAlpha = 1;
      }
      g.restore();
      g.strokeStyle = '#8d6aa6';
      g.lineWidth = 5;
      circle(g, cx, cy, R + 4);
      g.stroke();
      label(g, side === 0 ? t('mg_gears_left') : t('mg_gears_right'), cx, cy + R + 26, 15, '#23302a');
      gauge(g, 300, 12, 86, rough / 10, rough > 6 ? '#e0574a' : '#e6b23a', '😟', '');
      if (ctx.pointer.over) {
        g.fillStyle = '#fff';
        circle(g, ctx.pointer.x, ctx.pointer.y, 14);
        g.fill();
        g.strokeStyle = '#d8ccd0';
        g.lineWidth = 2;
        circle(g, ctx.pointer.x, ctx.pointer.y, 14);
        g.stroke();
      }
    },
  };
}

// ---------------------------------------------------------------- 🦷 brosser les dents

export function teethGame(ctx) {
  const { a, t, fx } = ctx;
  const N = 8;
  const mx = 200;
  const my = 190;
  const W = 300;
  const teeth = Array.from({ length: N }, (_, i) => ({ x: mx - W / 2 + (W / N) * (i + 0.5), y: my, plaque: 1 }));
  const tw = W / N - 6;
  let last = null;
  ctx.hint(t('mg_gteeth_hint'));
  const progress = () => 1 - teeth.reduce((s, q) => s + q.plaque, 0) / N;

  function brush(p) {
    if (!last) { last = p; return; }
    const dx = Math.abs(p.x - last.x);
    const dy = Math.abs(p.y - last.y);
    for (const q of teeth) {
      if (q.plaque <= 0) continue;
      if (Math.abs(p.x - q.x) > tw * 0.8 || Math.abs(p.y - q.y) > 40) continue;
      q.plaque = Math.max(0, q.plaque - (dx * 0.012 + dy * 0.004));
      if (Math.random() < 0.35) fx.dot(p.x + (Math.random() - 0.5) * 14, p.y - 6, 'rgba(255,255,255,0.9)', 3 + Math.random() * 3, { vy: -30, life: 0.7, bubble: true });
      if (q.plaque === 0) fx.burst(q.x, q.y - 20, '✨', 2, { speed: 60, size: 14 });
    }
    last = p;
    ctx.progress(progress());
    if (teeth.every((q) => q.plaque <= 0) && !ctx.done) ctx.finish(1, t('mg_gteeth_end', { name: a.name }));
  }

  return {
    peek: () => ({ teeth: teeth.map((q) => ({ x: q.x, y: q.y, plaque: q.plaque })) }),
    down(p) { last = p; },
    move(p, down) { if (down) brush(p); },
    up() { last = null; },
    draw(g) {
      salonBackground(g, ctx, 330);
      // Museau de la couleur de l'animal, puis grand sourire
      g.fillStyle = ctx.col.coat;
      ellipse(g, mx, my + 10, 215, 150);
      g.fill();
      g.fillStyle = shade(ctx.col.raw.coat, 0.25);
      ellipse(g, mx, my + 40, 150, 90);
      g.fill();
      g.fillStyle = '#3a1f28';
      rrect(g, mx - W / 2 - 14, my - 46, W + 28, 92, 40);
      g.fill();
      g.fillStyle = '#e0657a';
      ellipse(g, mx, my + 42, 90, 22);
      g.fill();
      for (const q of teeth) {
        g.fillStyle = '#fffdf7';
        rrect(g, q.x - tw / 2, q.y - 30, tw, 60, 8);
        g.fill();
        if (q.plaque > 0) {
          g.globalAlpha = q.plaque * 0.9;
          g.fillStyle = '#d9c25a';
          rrect(g, q.x - tw / 2 + 3, q.y - 24, tw - 6, 50, 6);
          g.fill();
          g.globalAlpha = 1;
        }
      }
      // Nez et yeux au-dessus
      g.fillStyle = '#2a1a10';
      ellipse(g, mx, my - 90, 22, 15);
      g.fill();
      for (const s of [-1, 1]) {
        g.fillStyle = '#fff';
        circle(g, mx + s * 70, my - 125, 14);
        g.fill();
        g.fillStyle = '#2a1a10';
        circle(g, mx + s * 70 + 2, my - 123, 7);
        g.fill();
      }
      if (ctx.pointer.over) {
        // brosse à dents
        g.save();
        g.translate(ctx.pointer.x, ctx.pointer.y);
        g.rotate(0.5);
        g.fillStyle = '#3b7dd8';
        rrect(g, -6, -10, 12, 80, 6);
        g.fill();
        g.fillStyle = '#fff';
        rrect(g, -8, -34, 16, 30, 4);
        g.fill();
        g.restore();
      }
    },
  };
}

// ---------------------------------------------------------------- 💨 le séchoir

export function dryGame(ctx) {
  const { a, t, fx } = ctx;
  const floorY = 305;
  const fit = fitAnimal(a, { groundY: floorY, maxW: 300, maxH: 220 });
  const sh = animalShape(a, { x: fit.x, y: floorY, s: fit.s, f: 1 });
  let wet = 1;
  let stress = 0;
  let peak = 0;
  let zone = 'far';
  ctx.stress = 0;
  ctx.hint(t('mg_gdry_hint'));

  const normDist = (p) => {
    // Distance au corps en « rayons » (1 = le bord du corps).
    const dx = p.x - sh.bx;
    const dy = p.y - sh.by;
    const e = Math.sqrt((dx * dx) / (sh.rx * sh.rx) + (dy * dy) / (sh.ry * sh.ry));
    const dh = dist(p.x, p.y, sh.head.x, sh.head.y) / (sh.hr * 1.4);
    return Math.min(e, dh);
  };

  return {
    peek: () => ({ wet, stress, zone, body: { x: sh.bx, y: sh.by, rx: sh.rx, ry: sh.ry }, head: sh.head }),
    update(dt) {
      const p = ctx.pointer;
      let close = false;
      if (p.down && p.over && !ctx.done) {
        const e = normDist(p);
        if (e < 1.3) {
          zone = 'close';
          close = true;
          stress = Math.min(1, stress + dt * 0.45);
          ctx.hint(t('mg_gdry_tooClose', { name: a.name }), 'warn');
        } else if (e <= 2.3) {
          zone = 'good';
          wet = Math.max(0, wet - dt * 0.22);
          if (Math.random() < 0.6) fx.dot(lerp(p.x, sh.bx, 0.5) + (Math.random() - 0.5) * 30, lerp(p.y, sh.by, 0.5) + (Math.random() - 0.5) * 30, 'rgba(255,255,255,0.7)', 3, { vx: (sh.bx - p.x) * 1.5, vy: (sh.by - p.y) * 1.5 - 20, life: 0.4 });
          ctx.hint(t('mg_gdry_good'), 'good');
        } else {
          zone = 'far';
          ctx.hint(t('mg_gdry_closer'));
        }
      } else zone = 'far';
      if (!close) stress = Math.max(0, stress - dt * 0.1);
      peak = Math.max(peak, stress);
      ctx.stress = peak;
      if (wet > 0 && Math.random() < wet * 0.1) {
        const q = sh.L((Math.random() - 0.5) * sh.rx * 1.6, sh.ry * 0.9);
        fx.dot(q.x, q.y, 'rgba(90,160,230,0.8)', 3, { vy: 60, grav: 200, life: 0.6 });
      }
      ctx.progress(1 - wet);
      if (wet <= 0 && !ctx.done) ctx.finish(1 - peak * 0.6, peak < 0.25 ? t('mg_gdry_end', { name: a.name }) : undefined);
    },
    draw(g) {
      salonBackground(g, ctx, floorY);
      drawAnimal(g, a, { x: fit.x, y: floorY, s: fit.s, f: 1, shake: stress > 0.3 ? stress : 0, happy: ctx.done });
      // Poils mouillés : reflets bleutés
      if (wet > 0) {
        g.save();
        g.globalAlpha = wet * 0.45;
        g.fillStyle = '#6fb3e6';
        for (let i = 0; i < 7; i++) {
          const q = sh.L(-sh.rx * 0.8 + (i / 6) * sh.rx * 1.6, -sh.ry * 0.3 + Math.sin(i * 2.1) * sh.ry * 0.4);
          ellipse(g, q.x, q.y, 9 * fit.s, 5 * fit.s, 0.5);
          g.fill();
        }
        g.restore();
      }
      gauge(g, 300, 12, 86, stress, stress > 0.6 ? '#e0574a' : '#e6b23a', stress > 0.6 ? '😨' : '🙂', t('mg_gdry_calm'));
      // Zone idéale (anneau pointillé)
      g.strokeStyle = zone === 'good' ? 'rgba(63,174,98,0.6)' : 'rgba(141,106,166,0.45)';
      g.setLineDash([6, 6]);
      g.lineWidth = 2;
      ellipse(g, sh.bx, sh.by, sh.rx * 1.8, sh.ry * 1.8);
      g.stroke();
      g.setLineDash([]);
      if (ctx.pointer.over) {
        const p = ctx.pointer;
        const ang = Math.atan2(sh.by - p.y, sh.bx - p.x);
        g.save();
        g.translate(p.x, p.y);
        g.rotate(ang);
        if (p.down) {
          g.fillStyle = zone === 'close' ? 'rgba(224,87,74,0.25)' : 'rgba(255,255,255,0.45)';
          g.beginPath();
          g.moveTo(26, -8);
          g.lineTo(110, -40);
          g.lineTo(110, 40);
          g.lineTo(26, 8);
          g.closePath();
          g.fill();
        }
        g.fillStyle = '#ff7eb6';
        rrect(g, -22, -16, 48, 32, 12);
        g.fill();
        g.fillStyle = '#d8cfd3';
        rrect(g, 20, -9, 16, 18, 4);
        g.fill();
        g.fillStyle = '#e8619f';
        rrect(g, -16, 10, 16, 28, 6);
        g.fill();
        g.restore();
      }
    },
  };
}

// ---------------------------------------------------------------- 🎀 finitions : accessoire, couleur, parfum

let finishOptions = { accessories: [], colors: Object.keys(ACC_COLORS), current: null, allowNone: true };

/** Choix proposés par le salon (appelé avant runMinigame). */
export function setFinishOptions(opts) {
  finishOptions = { accessories: [], colors: Object.keys(ACC_COLORS), current: null, allowNone: true, ...opts };
}

export function finishGame(ctx) {
  const { a, t, fx } = ctx;
  const floorY = 300;
  const fit = fitAnimal(a, { groundY: floorY, maxW: 320, maxH: 230 });
  const sh = animalShape(a, { x: fit.x, y: floorY, s: fit.s, f: 1 });
  const opts = finishOptions;
  const accs = [...(opts.allowNone ? [null] : []), ...opts.accessories];
  const colors = opts.colors.length ? opts.colors : ['pink'];
  let ai = Math.max(0, accs.indexOf(opts.current?.id ?? null));
  let ci = Math.max(0, colors.indexOf(opts.current?.color ?? 'pink'));
  let puffs = 0;
  const NEED = 3;
  ctx.choice = { id: accs[ai], color: colors[ci] };
  const update = () => { ctx.choice = { id: accs[ai], color: colors[ci] }; refresh(); };
  const accName = () => (accs[ai] ? `${ACCESSORIES[accs[ai]].emoji} ${t(`grm_acc_${accs[ai]}`)}` : `🚫 ${t('grm_acc_none')}`);
  const colName = () => `${t(`grm_col_${colors[ci]}`)}`;
  let accBtn;
  let colBtn;
  const refresh = () => {
    accBtn.textContent = `${accName()} ▸`;
    colBtn.textContent = `🎨 ${colName()} ▸`;
    colBtn.style.setProperty('--sw', hex(ACC_COLORS[colors[ci]]));
    colBtn.disabled = !accs[ai];
  };
  accBtn = ctx.button('', { onTap: () => { ai = (ai + 1) % accs.length; update(); fx.float(sh.headTop.x, sh.headTop.y - 20, '✨'); } });
  colBtn = ctx.button('', { cls: 'mg-swatch', onTap: () => { ci = (ci + 1) % colors.length; update(); } });
  refresh();
  ctx.hint(t('mg_gfinish_hint'));

  return {
    peek: () => ({ puffs, need: NEED, choice: ctx.choice, accessories: accs, colors }),
    down(p) {
      if (ctx.done) return;
      if (dist(p.x, p.y, sh.bx, sh.by) > Math.max(sh.rx, sh.ry) * 2.2 && dist(p.x, p.y, sh.head.x, sh.head.y) > sh.hr * 3) {
        ctx.hint(t('mg_gfinish_spray'));
        return;
      }
      puffs++;
      for (let i = 0; i < 12; i++) fx.dot(p.x + (Math.random() - 0.5) * 20, p.y, 'rgba(255,255,255,0.75)', 3 + Math.random() * 4, { vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 40, life: 0.7 });
      fx.float(p.x, p.y - 10, '🌸', 22);
      ctx.progress(puffs / NEED);
      if (puffs >= NEED && !ctx.done) {
        ctx.finish(1, t('mg_gfinish_end', { name: a.name }));
        fx.burst(sh.bx, sh.by - sh.ry, '💖', 8, { speed: 120, size: 20 });
      } else ctx.hint(t('mg_gfinish_again', { n: NEED - puffs }), 'good');
    },
    draw(g) {
      salonBackground(g, ctx, floorY);
      // Miroir derrière
      g.fillStyle = '#d7ecf7';
      rrect(g, 60, 30, 280, 160, 24);
      g.fill();
      g.strokeStyle = '#8d6aa6';
      g.lineWidth = 6;
      rrect(g, 60, 30, 280, 160, 24);
      g.stroke();
      drawAnimal(g, a, { x: fit.x, y: floorY, s: fit.s, f: 1, happy: true });
      if (ctx.choice.id) drawAccessoryOn(g, sh, ctx.choice, fit.s);
      if (ctx.pointer.over && !ctx.done) emoji(g, '🧴', ctx.pointer.x + 14, ctx.pointer.y - 14, 34, 0.3);
    },
  };
}

export const GROOMER_GAMES = { gknots: knotsGame, gcut: cutGame, gears: earsGame, gteeth: teethGame, gdry: dryGame, gfinish: finishGame };
export const GROOMER_ICONS = { gknots: '🧶', gcut: '✂️', gears: '👂', gteeth: '🦷', gdry: '💨', gfinish: '🎀' };
