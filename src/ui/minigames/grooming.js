// Mini-jeux de toilette : brosser, laver, couper les griffes, ferrer, tondre.

import { drawAnimal, animalShape, fitAnimal, rrect, ellipse, circle, emoji, label, fillView, sky, tiles, clamp, lerp, dist, distToSegment, shade, css, mix } from './draw.js';
import { isBig } from './food.js';

/** Décor de toilette : sol de la cour (grands animaux) ou pièce claire. */
function groomBackground(g, ctx, floorY = 300) {
  if (isBig(ctx.a)) sky(g, ctx.view, '#a9d8f2', '#e4f3fb', floorY, '#c9c2b4', '#ada596');
  else {
    fillView(g, ctx.view, '#e9f4ee', '#d6ebe0');
    g.fillStyle = '#b7d6c4';
    g.fillRect(ctx.view.x0, floorY, ctx.view.w, ctx.view.y1 - floorY);
    // tapis
    g.fillStyle = '#f2d16b';
    ellipse(g, 200, floorY + 10, 170, 22);
    g.fill();
  }
}

/** Points répartis sur le corps de l'animal (repère local du corps). */
function bodyPoints(sh, step, k = 0.92, extra = true) {
  const pts = [];
  for (let ly = -sh.ry; ly <= sh.ry; ly += step) {
    for (let lx = -sh.rx; lx <= sh.rx; lx += step) {
      if ((lx * lx) / ((sh.rx * k) ** 2) + (ly * ly) / ((sh.ry * k) ** 2) > 1) continue;
      pts.push(sh.L(lx, ly));
    }
  }
  if (extra) {
    // Tête et cou
    for (let ly = -sh.hr; ly <= sh.hr; ly += step) {
      for (let lx = -sh.hr; lx <= sh.hr; lx += step) {
        if (lx * lx + ly * ly <= (sh.hr * 0.9) ** 2) pts.push({ x: sh.head.x + lx, y: sh.head.y + ly });
      }
    }
    if (sh.a.species === 'horse' || sh.a.species === 'goat') {
      for (let k2 = 0.2; k2 < 0.9; k2 += 0.25) {
        const nb = sh.L(sh.rx * 0.7, -sh.ry * 0.25);
        pts.push({ x: lerp(nb.x, sh.head.x, k2), y: lerp(nb.y, sh.head.y, k2) });
      }
    }
  }
  return pts;
}

function drawBrush(g, x, y, rot) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = '#9a5b2e';
  rrect(g, -30, -16, 60, 22, 10);
  g.fill();
  g.fillStyle = '#c47a3d';
  rrect(g, -26, -14, 52, 8, 4);
  g.fill();
  g.strokeStyle = '#4a3020';
  g.lineWidth = 2;
  for (let i = -24; i <= 24; i += 5) {
    g.beginPath();
    g.moveTo(i, 6);
    g.lineTo(i, 16);
    g.stroke();
  }
  g.restore();
}

// ---------------------------------------------------------------- brosser

export function brushGame(ctx) {
  const { a, t, fx } = ctx;
  const floorY = 305;
  const fit = fitAnimal(a, { groundY: floorY, maxW: 340, maxH: 255 });
  const sh = animalShape(a, { x: fit.x, y: floorY, s: fit.s, f: 1 });
  const tailDir = -1; // le poil va de la tête (à droite) vers la queue (à gauche)
  const patches = [];
  const rng = ctx.rng;
  const count = 7;
  let tries = 0;
  while (patches.length < count && tries < 400) {
    tries++;
    const lx = (rng() * 2 - 1) * sh.rx * 0.8;
    const ly = (rng() * 2 - 1) * sh.ry * 0.65;
    if ((lx * lx) / (sh.rx * 0.8) ** 2 + (ly * ly) / (sh.ry * 0.7) ** 2 > 1) continue;
    const p = sh.L(lx, ly);
    if (patches.some((q) => dist(q.x, q.y, p.x, p.y) < 34 * fit.s)) continue;
    patches.push({ ...p, r: 20 * Math.max(0.8, fit.s), dirt: 1, seed: rng() * 10 });
  }
  if (a.species === 'horse') patches.push({ ...sh.neck, r: 18 * fit.s, dirt: 1, seed: 3 });
  let good = 0;
  let bad = 0;
  let last = null;
  let rot = 0;
  let shine = 0;

  ctx.hint(t('mg_brush_hint'));

  const progress = () => 1 - patches.reduce((s, p) => s + p.dirt, 0) / patches.length;

  function rub(p) {
    if (!last) { last = p; return; }
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    const withHair = dx * tailDir > d * 0.35;
    rot = lerp(rot, clamp(dx / 40, -0.5, 0.5), 0.3);
    let touched = false;
    for (const q of patches) {
      if (q.dirt <= 0) continue;
      if (distToSegment(q.x, q.y, last.x, last.y, p.x, p.y) > q.r + 14) continue;
      touched = true;
      q.dirt -= d * 0.0062 * (withHair ? 1 : 0.55);
      if (Math.random() < 0.5) fx.dot(p.x + (Math.random() - 0.5) * 20, p.y + 10, 'rgba(150, 120, 90, 0.6)', 3 + Math.random() * 3, { vx: (Math.random() - 0.5) * 60, vy: 40, grav: 120, life: 0.6 });
      if (q.dirt <= 0.15) {
        q.dirt = 0;
        fx.burst(q.x, q.y, '✨', 3, { speed: 80, size: 16 });
      }
    }
    if (touched) {
      if (withHair) good += d;
      else bad += d;
      if (bad > 260 && bad > good) ctx.hint(t('mg_brush_dir'), 'warn');
      else if (withHair && good > 120) ctx.hint(t('mg_brush_good'), 'good');
    }
    last = p;
    const pr = progress();
    ctx.progress(pr);
    if (pr >= 0.999 && !ctx.done) {
      const share = good / Math.max(1, good + bad);
      ctx.finish(0.55 + 0.45 * clamp(share / 0.75), share > 0.6 ? t('mg_brush_end', { name: a.name }) : undefined);
      fx.text(200, 120, t('mg_perfect'), '#2f8a5f', 28);
    }
  }

  return {
    peek: () => ({ body: { x: sh.bx, y: sh.by, rx: sh.rx, ry: sh.ry }, head: sh.head, patches: patches.filter((q) => q.dirt > 0).map((q) => ({ x: q.x, y: q.y })) }),
    down(p) { last = p; },
    move(p, down) { if (down) rub(p); },
    up() { last = null; },
    update(dt) { if (ctx.done) shine += dt; },
    draw(g) {
      groomBackground(g, ctx, floorY);
      drawAnimal(g, a, { x: fit.x, y: floorY, s: fit.s, f: 1, happy: ctx.done || progress() > 0.6, wag: ctx.done });
      // Sens du poil
      if (!ctx.done) {
        g.save();
        g.globalAlpha = 0.45 + Math.sin(ctx.time * 3) * 0.15;
        for (let i = -1; i <= 1; i++) {
          const p = sh.L(i * sh.rx * 0.45, -sh.ry * 0.05);
          label(g, '‹‹', p.x, p.y, 22, '#ffffff');
        }
        g.restore();
      }
      // Taches de poussière
      for (const q of patches) {
        if (q.dirt <= 0) continue;
        g.save();
        g.globalAlpha = 0.25 + 0.7 * q.dirt;
        g.fillStyle = '#8a6a45';
        ellipse(g, q.x, q.y, q.r, q.r * 0.75, q.seed);
        g.fill();
        g.fillStyle = '#5e452b';
        for (let i = 0; i < 6; i++) {
          const ang = q.seed + i * 1.1;
          circle(g, q.x + Math.cos(ang) * q.r * 0.55, q.y + Math.sin(ang) * q.r * 0.4, 2.5);
          g.fill();
        }
        g.restore();
      }
      if (ctx.done) {
        for (let i = 0; i < 4; i++) {
          const p = sh.L(Math.cos(shine * 2 + i * 1.6) * sh.rx * 0.6, Math.sin(shine * 3 + i) * sh.ry * 0.5);
          emoji(g, '✨', p.x, p.y, 18, 0, 0.8);
        }
      }
      const pp = ctx.pointer;
      if (pp.over || pp.down) drawBrush(g, pp.x, pp.y - 6, rot);
    },
  };
}

// ---------------------------------------------------------------- laver

export function washGame(ctx) {
  const { a, t, fx } = ctx;
  const floorY = 305;
  const fit = fitAnimal(a, { groundY: floorY, maxW: 340, maxH: 250 });
  const sh = animalShape(a, { x: fit.x, y: floorY, s: fit.s, f: 1 });
  const step = 22 * Math.max(0.85, fit.s * 0.9);
  const cells = bodyPoints(sh, step).map((p) => ({
    x: p.x + (ctx.rng() - 0.5) * step * 0.7,
    y: p.y + (ctx.rng() - 0.5) * step * 0.7,
    soap: 0,
    mud: ctx.rng() < 0.45,
    k: ctx.rng(),
    // petites bulles autour du point
    b: [0, 1, 2].map(() => ({ dx: (ctx.rng() - 0.5) * step * 0.9, dy: (ctx.rng() - 0.5) * step * 0.9, r: 0.35 + ctx.rng() * 0.5 })),
  }));
  let phase = 'soap';
  let last = null;
  let shake = 0;
  let spray = 0;

  ctx.hint(t('mg_wash_hint'));

  const frac = (fn) => cells.filter(fn).length / cells.length;

  function scrub(p) {
    if (!last) { last = p; return; }
    const d = dist(p.x, p.y, last.x, last.y);
    for (const c of cells) {
      if (c.soap >= 1) continue;
      if (distToSegment(c.x, c.y, last.x, last.y, p.x, p.y) < 26) {
        c.soap = Math.min(1, c.soap + d * 0.022 + 0.04);
        if (Math.random() < 0.15) fx.dot(c.x, c.y, '', 4 + Math.random() * 5, { vy: -30 - Math.random() * 30, life: 0.9, bubble: true });
      }
    }
    last = p;
  }

  return {
    peek: () => ({ phase, body: { x: sh.bx, y: sh.by, rx: sh.rx, ry: sh.ry }, head: sh.head }),
    down(p) { last = p; },
    move(p, down) { if (down && phase === 'soap') scrub(p); },
    up() { last = null; },
    update(dt) {
      if (ctx.done) {
        shake = Math.max(0, shake - dt * 0.8);
        return;
      }
      const pp = ctx.pointer;
      if (phase === 'soap') {
        const f = frac((c) => c.soap >= 1);
        ctx.progress(0.6 * f / 0.9);
        if (f >= 0.9) {
          for (const c of cells) c.soap = 1;
          phase = 'rinse';
          ctx.hint(t('mg_wash_rinse'), 'good');
          fx.text(200, 80, t('mg_good'), '#2f8a5f', 26);
        }
      } else {
        if (pp.down) {
          spray += dt * 40;
          while (spray > 1) {
            spray--;
            fx.dot(pp.x + (Math.random() - 0.5) * 36, pp.y + 16, 'rgba(80, 160, 235, 0.85)', 2.5, { vy: 260 + Math.random() * 80, vx: (Math.random() - 0.5) * 30, life: 0.5 });
          }
          for (const c of cells) {
            if (c.soap <= 0) continue;
            const dx = c.x - pp.x;
            const dy = c.y - pp.y;
            if (Math.abs(dx) < 34 && dy > -20 && dy < 110) c.soap = Math.max(0, c.soap - dt * 2.2);
          }
        }
        const f = frac((c) => c.soap <= 0.05);
        ctx.progress(0.6 + 0.4 * f / 0.92);
        if (f >= 0.92) {
          for (const c of cells) c.soap = 0;
          shake = 1;
          fx.burst(sh.bx, sh.by - sh.ry, '💦', 10, { speed: 220, spread: 3 });
          const time = ctx.time;
          ctx.finish(time <= 24 ? 1 : Math.max(0.6, 1 - (time - 24) / 40));
        }
      }
    },
    draw(g) {
      if (isBig(a)) groomBackground(g, ctx, floorY);
      else {
        tiles(g, ctx.view);
        g.fillStyle = '#ffffff';
        rrect(g, 30, floorY - 40, 340, 80, 30);
        g.fill();
        g.fillStyle = '#9fd3f0';
        rrect(g, 42, floorY - 30, 316, 30, 14);
        g.fill();
      }
      drawAnimal(g, a, { x: fit.x, y: floorY, s: fit.s, f: 1, shake, happy: ctx.done, blink: phase === 'rinse' && ctx.pointer.down, earsBack: phase === 'rinse' && ctx.pointer.down });
      // Boue puis mousse
      for (const c of cells) {
        if (c.mud && c.soap < 0.7 && phase === 'soap') {
          g.fillStyle = `rgba(110, 80, 50, ${0.55 * (1 - c.soap / 0.7)})`;
          circle(g, c.x, c.y, step * 0.45);
          g.fill();
        }
      }
      for (const c of cells) {
        if (c.soap <= 0.02) continue;
        const k = Math.min(1, c.soap);
        for (const b of c.b) {
          const r = step * 0.42 * b.r * (0.4 + k * 0.6);
          const x = c.x + b.dx * k;
          const y = c.y + b.dy * k;
          g.fillStyle = 'rgba(255,255,255,0.88)';
          circle(g, x, y, r);
          g.fill();
          g.strokeStyle = 'rgba(140, 195, 235, 0.7)';
          g.lineWidth = 1;
          g.stroke();
          g.fillStyle = 'rgba(255,255,255,1)';
          circle(g, x - r * 0.35, y - r * 0.35, r * 0.25);
          g.fill();
        }
      }
      const pp = ctx.pointer;
      if ((pp.over || pp.down) && !ctx.done) {
        if (phase === 'soap') {
          g.save();
          g.translate(pp.x, pp.y);
          g.rotate(Math.sin(ctx.time * 12) * (pp.down ? 0.2 : 0));
          g.fillStyle = '#f7d54a';
          rrect(g, -24, -16, 48, 32, 12);
          g.fill();
          g.fillStyle = '#e8b830';
          for (let i = 0; i < 5; i++) { circle(g, -14 + i * 7, -4 + (i % 2) * 8, 2.5); g.fill(); }
          g.restore();
        } else {
          emoji(g, '🚿', pp.x, pp.y - 10, 44, 0.6);
        }
      }
    },
  };
}

// ---------------------------------------------------------------- griffes et onglons

export function nailsGame(ctx) {
  const { a, t, fx } = ctx;
  const goat = a.species === 'goat';
  const coat = ctx.col;
  const claws = [];
  const base = { x: 200, y: 300 };
  if (goat) {
    // Deux pieds, deux onglons chacun
    // (les onglons poussent vers le bas, sous la patte)
    [[-66, 0.08], [-32, -0.08], [32, 0.08], [66, -0.08]].forEach(([dx, ang]) => claws.push({ bx: base.x + dx, by: 150, ang: Math.PI + ang, len: 80, w: 32, cut: 1, done: false, score: 0 }));
  } else {
    [[-66, -0.42], [-24, -0.14], [24, 0.14], [66, 0.42]].forEach(([dx, ang]) => claws.push({ bx: base.x + dx, by: 210 - Math.abs(dx) * 0.35, ang, len: 74, w: 16, cut: 1, done: false, score: 0 }));
  }
  const QUICK = 0.38;
  const GOOD_LO = 0.46;
  const GOOD_HI = 0.66;
  const period = a.personality === 'shy' || a.personality === 'calm' ? 2.8 : a.personality === 'playful' || a.personality === 'stubborn' ? 2.0 : 2.4;
  let cur = 0;
  let u = 1;
  let phase = 0;
  let snip = 0;
  let tries = 0;
  let face = '';
  let faceT = 0;

  ctx.hint(t(goat ? 'mg_hooves_hint' : 'mg_nails_hint'));
  ctx.button(`✂️ ${t('mg_nails_btn')}`, { cls: 'primary', onTap: () => cut() });

  const pos = (c, k) => ({ x: c.bx + Math.sin(c.ang) * c.len * k, y: c.by - Math.cos(c.ang) * c.len * k });

  function cut() {
    if (ctx.done) return;
    const c = claws[cur];
    snip = 1;
    const p = pos(c, u);
    if (u < QUICK + 0.04) {
      c.cut = Math.max(QUICK, u);
      c.score = 0.35;
      c.done = true;
      fx.text(p.x, p.y - 30, t('mg_ouch'), '#c8463c', 24);
      face = '😣';
      faceT = 1.2;
    } else if (u <= GOOD_HI + 0.02) {
      c.cut = u;
      const perfect = u >= GOOD_LO && u <= GOOD_HI;
      c.score = perfect ? 1 : 0.8;
      c.done = true;
      fx.text(p.x, p.y - 30, t(perfect ? 'mg_perfect' : 'mg_good'), '#2f8a5f', 24);
      fx.burst(p.x, p.y, '✨', 3, { speed: 70, size: 14 });
      face = '😊';
      faceT = 1;
    } else {
      // Trop long : on raccourcit un peu, il faut recouper.
      c.cut = u;
      tries++;
      fx.text(p.x, p.y - 30, t('mg_shorter'), '#c07a10', 22);
      if (tries >= 3) {
        c.score = 0.7;
        c.done = true;
      }
    }
    fx.dot(p.x, p.y, '#f4efe2', 4, { vx: (Math.random() - 0.5) * 80, vy: -60, grav: 500, life: 0.8 });
    if (c.done) {
      tries = 0;
      cur++;
      phase = 0;
      ctx.progress(cur / claws.length);
      if (cur >= claws.length) {
        const q = claws.reduce((s, x) => s + x.score, 0) / claws.length;
        ctx.finish(q, q < 0.6 ? t('mg_nails_end_ouch', { name: a.name }) : undefined);
        return;
      }
    }
  }

  return {
    peek: () => ({ u, lo: GOOD_LO, hi: GOOD_HI, cur }),
    down() { cut(); },
    key(code, down) { if (down && (code === 'Space' || code === 'Enter')) cut(); },
    update(dt) {
      snip = Math.max(0, snip - dt * 4);
      faceT = Math.max(0, faceT - dt);
      if (ctx.done || cur >= claws.length) return;
      phase += dt / period;
      const c = claws[cur];
      const top = Math.min(1, c.cut);
      const lo = 0.2;
      const tri = 1 - Math.abs(((phase % 1) * 2) - 1); // 0 → 1 → 0
      u = lerp(top, lo, tri);
    },
    draw(g) {
      fillView(g, ctx.view, '#dff1fb', '#c4e3f4');
      // serviette
      g.fillStyle = '#f6a6b8';
      rrect(g, 20, 250, 360, 140, 24);
      g.fill();
      g.strokeStyle = '#f9c7d3';
      g.lineWidth = 6;
      for (let x = 40; x < 380; x += 26) { g.beginPath(); g.moveTo(x, 256); g.lineTo(x, 384); g.stroke(); }
      if (goat) {
        // pattes de chèvre
        for (const lx of [-49, 49]) {
          g.fillStyle = coat.coat;
          rrect(g, base.x + lx - 40, -60, 80, 220, 26);
          g.fill();
        }
      } else {
        g.fillStyle = coat.coat;
        ellipse(g, base.x, 270, 120, 90);
        g.fill();
        rrect(g, base.x - 70, 260, 140, 140, 20);
        g.fill();
      }
      // griffes
      claws.forEach((c, i) => {
        const tip = pos(c, c.cut);
        const b0 = pos(c, 0);
        g.save();
        if (goat) {
          // onglon : sabot gris foncé, partie rose vivante à la base
          g.fillStyle = '#4a3f38';
          g.beginPath();
          const nx = Math.cos(c.ang) * c.w * 0.5;
          const ny = Math.sin(c.ang) * c.w * 0.5;
          g.moveTo(b0.x - nx, b0.y - ny);
          g.lineTo(tip.x - nx * 0.7, tip.y - ny * 0.7);
          g.quadraticCurveTo(tip.x + Math.sin(c.ang) * 10, tip.y - Math.cos(c.ang) * 10, tip.x + nx * 0.7, tip.y + ny * 0.7);
          g.lineTo(b0.x + nx, b0.y + ny);
          g.closePath();
          g.fill();
          const q = pos(c, QUICK);
          g.fillStyle = '#f39bb0';
          g.beginPath();
          g.moveTo(b0.x - nx * 0.6, b0.y - ny * 0.6);
          g.lineTo(q.x - nx * 0.5, q.y - ny * 0.5);
          g.quadraticCurveTo(q.x + Math.sin(c.ang) * 6, q.y - Math.cos(c.ang) * 6, q.x + nx * 0.5, q.y + ny * 0.5);
          g.lineTo(b0.x + nx * 0.6, b0.y + ny * 0.6);
          g.fill();
        } else {
          // orteil
          g.fillStyle = shade(ctx.col.raw.coat, -0.08);
          circle(g, c.bx, c.by + 22, 26);
          g.fill();
          g.fillStyle = '#e9a0ae';
          ellipse(g, c.bx, c.by + 30, 12, 9);
          g.fill();
          // griffe (blanche), avec la partie rose (la « veine ») à la base
          g.strokeStyle = '#f7f1e3';
          g.lineCap = 'round';
          g.lineWidth = c.w;
          g.beginPath();
          g.moveTo(b0.x, b0.y);
          g.lineTo(tip.x, tip.y);
          g.stroke();
          g.strokeStyle = '#d9cdb4';
          g.lineWidth = 2;
          g.stroke();
          const q = pos(c, QUICK);
          g.strokeStyle = '#f08ba3';
          g.lineWidth = c.w * 0.5;
          g.beginPath();
          g.moveTo(b0.x, b0.y);
          g.lineTo(q.x, q.y);
          g.stroke();
        }
        // zone verte où couper (claw en cours)
        if (i === cur && !ctx.done) {
          const z0 = pos(c, GOOD_LO);
          const z1 = pos(c, Math.min(GOOD_HI, c.cut));
          g.strokeStyle = 'rgba(63, 174, 98, 0.55)';
          g.lineWidth = c.w + 18;
          g.lineCap = 'butt';
          g.beginPath();
          g.moveTo(z0.x, z0.y);
          g.lineTo(z1.x, z1.y);
          g.stroke();
        }
        if (c.done) emoji(g, c.score >= 0.8 ? '✅' : '🩹', tip.x, tip.y - 18, 18);
        g.restore();
      });
      // la pince
      if (!ctx.done && cur < claws.length) {
        const c = claws[cur];
        const p = pos(c, u);
        const nx = Math.cos(c.ang);
        const ny = Math.sin(c.ang);
        g.strokeStyle = '#e0574a';
        g.lineWidth = 4;
        g.setLineDash([5, 4]);
        g.beginPath();
        g.moveTo(p.x - nx * (c.w + 16), p.y - ny * (c.w + 16));
        g.lineTo(p.x + nx * (c.w + 16), p.y + ny * (c.w + 16));
        g.stroke();
        g.setLineDash([]);
        // Les ciseaux sont posés sur la griffe en cours
        emoji(g, '✂️', p.x + nx * (c.w * 0.5 + 12), p.y + ny * (c.w * 0.5 + 12), 32, Math.PI + c.ang + (snip ? 0.3 : 0));
      }
      // tête de l'animal qui réagit
      g.fillStyle = 'rgba(255,255,255,0.85)';
      circle(g, 350, 46, 34);
      g.fill();
      emoji(g, faceT > 0 ? face : ctx.sp.emoji, 350, 48, 40);
      label(g, `${Math.min(cur + 1, claws.length)} / ${claws.length}`, 50, 40, 20);
    },
  };
}

// ---------------------------------------------------------------- ferrer (maréchal-ferrant)

export function shoeGame(ctx) {
  const { a, t, fx } = ctx;
  const cx = 200;
  const cy = 200;
  const nails = [];
  for (let i = 0; i < 3; i++) {
    const ang = Math.PI * (0.92 - i * 0.2);
    nails.push({ x: cx + Math.cos(ang) * 88, y: cy - Math.sin(ang) * 88 * 0.95 + 30, h: 1 });
    nails.push({ x: cx - Math.cos(ang) * 88, y: cy - Math.sin(ang) * 88 * 0.95 + 30, h: 1 });
  }
  nails.sort((p, q) => p.y - q.y || p.x - q.x);
  const TARGET = 18;
  const DURATION = 1.35;
  let cur = 0;
  let ring = 0;
  let swing = 0;
  let misses = 0;
  let goods = 0;

  ctx.hint(t('mg_shoe_hint'));
  ctx.button(`🔨 ${t('mg_shoe_btn')}`, { cls: 'primary', onTap: () => hit() });

  const radius = () => 64 - (ring / DURATION) * 64;

  function hit() {
    if (ctx.done) return;
    const n = nails[cur];
    const diff = Math.abs(radius() - TARGET);
    swing = 1;
    if (diff < 6) {
      n.h = 0;
      fx.text(n.x, n.y - 40, t('mg_perfect'), '#2f8a5f', 24);
      fx.burst(n.x, n.y, '✨', 5, { speed: 120, size: 14 });
    } else if (diff < 14) {
      n.h = Math.max(0, n.h - 0.5);
      goods++;
      fx.text(n.x, n.y - 40, t('mg_good'), '#3c7bd9', 22);
      fx.burst(n.x, n.y, '💥', 2, { speed: 60, size: 14 });
    } else {
      misses++;
      fx.text(n.x, n.y - 40, t('mg_missed'), '#c07a10', 22);
    }
    ring = 0;
    if (n.h <= 0) {
      cur++;
      ctx.progress(cur / nails.length);
      if (cur >= nails.length) ctx.finish(1 - 0.06 * goods - 0.07 * misses);
    }
  }

  return {
    peek: () => ({ r: radius(), target: TARGET, cur }),
    down() { hit(); },
    key(code, down) { if (down && (code === 'Space' || code === 'Enter')) hit(); },
    update(dt) {
      swing = Math.max(0, swing - dt * 5);
      if (ctx.done) return;
      ring += dt;
      if (ring > DURATION) ring = 0;
    },
    draw(g) {
      fillView(g, ctx.view, '#e8d9c0', '#cbb393');
      // tablier / jambe repliée
      g.fillStyle = ctx.col.raw.pattern === 'socks' ? ctx.col.sec : ctx.col.coat;
      rrect(g, cx - 60, -40, 120, 140, 30);
      g.fill();
      // sabot vu de dessous
      g.fillStyle = '#5a4636';
      ellipse(g, cx, cy + 10, 110, 118);
      g.fill();
      g.fillStyle = '#7a6250';
      ellipse(g, cx, cy + 16, 86, 92);
      g.fill();
      // fourchette
      g.fillStyle = '#9b7f68';
      g.beginPath();
      g.moveTo(cx, cy - 10);
      g.lineTo(cx - 34, cy + 96);
      g.lineTo(cx + 34, cy + 96);
      g.closePath();
      g.fill();
      // fer à cheval
      g.strokeStyle = '#a9b4bd';
      g.lineWidth = 26;
      g.lineCap = 'round';
      g.beginPath();
      g.ellipse(cx, cy + 30, 88, 90, 0, Math.PI * 0.86, Math.PI * 2.14);
      g.stroke();
      g.strokeStyle = '#d5dde3';
      g.lineWidth = 6;
      g.beginPath();
      g.ellipse(cx, cy + 30, 92, 94, 0, Math.PI * 0.9, Math.PI * 1.5);
      g.stroke();
      // clous
      nails.forEach((n, i) => {
        g.fillStyle = '#3a3f44';
        circle(g, n.x, n.y, 6);
        g.fill();
        if (n.h > 0) {
          g.fillStyle = '#c9ced3';
          rrect(g, n.x - 4, n.y - 26 * n.h, 8, 26 * n.h, 2);
          g.fill();
          g.fillStyle = '#e8ecef';
          rrect(g, n.x - 9, n.y - 26 * n.h - 5, 18, 7, 3);
          g.fill();
        } else {
          g.fillStyle = '#e8ecef';
          circle(g, n.x, n.y, 7);
          g.fill();
        }
        if (i === cur && !ctx.done) {
          g.strokeStyle = '#f2c84b';
          g.lineWidth = 5;
          circle(g, n.x, n.y, TARGET);
          g.stroke();
          const r = radius();
          const close = Math.abs(r - TARGET) < 6;
          g.strokeStyle = close ? '#3fae62' : '#3c7bd9';
          g.lineWidth = close ? 6 : 4;
          circle(g, n.x, n.y, r);
          g.stroke();
        }
      });
      // marteau
      const n = nails[Math.min(cur, nails.length - 1)];
      g.save();
      g.translate(n.x + 46, n.y - 30);
      g.rotate(-0.9 + swing * 0.9);
      g.fillStyle = '#8a5a2b';
      rrect(g, -5, -6, 10, 80, 4);
      g.fill();
      g.fillStyle = '#5d6870';
      rrect(g, -26, -20, 46, 22, 5);
      g.fill();
      g.restore();
      label(g, `${Math.min(cur + 1, nails.length)} / ${nails.length}`, 50, 40, 20);
      emoji(g, '🐴', 350, 44, 40);
    },
  };
}

// ---------------------------------------------------------------- tondre

export function shearGame(ctx) {
  const { a, t, fx } = ctx;
  const floorY = 305;
  const fit = fitAnimal(a, { groundY: floorY, maxW: 330, maxH: 250 });
  const full = animalShape(a, { x: fit.x, y: floorY, s: fit.s, f: 1 });
  const step = 17 * Math.max(0.9, fit.s);
  const wool = [];
  for (let ly = -full.ry * 1.05; ly <= full.ry * 1.05; ly += step * 0.9) {
    for (let lx = -full.rx * 1.05; lx <= full.rx * 1.05; lx += step) {
      if ((lx * lx) / (full.rx * 1.05) ** 2 + (ly * ly) / (full.ry * 1.05) ** 2 > 1) continue;
      const p = full.L(lx + ((Math.round(ly / step) % 2) * step) / 2, ly);
      wool.push({ ...p, on: true, r: step * 0.75, k: ctx.rng() });
    }
  }
  // Toupet sur la tête
  wool.push({ x: full.head.x - full.hr * 0.3, y: full.head.y - full.hr * 0.6, on: true, r: full.hr * 0.6, k: 0.5 });
  const total = wool.length;
  let removed = 0;
  let last = null;
  let pile = 0;
  const woolCol = ctx.col.raw.coat;

  ctx.hint(t('mg_shear_hint'));

  function cutAlong(p) {
    if (!last) { last = p; return; }
    for (const w of wool) {
      if (!w.on) continue;
      if (distToSegment(w.x, w.y, last.x, last.y, p.x, p.y) < 20 + w.r * 0.3) {
        w.on = false;
        removed++;
        pile++;
        if (Math.random() < 0.6) fx.dot(w.x, w.y, css(woolCol), 7 + Math.random() * 4, { vx: (Math.random() - 0.5) * 60, vy: -20, grav: 420, life: 0.9 });
      }
    }
    last = p;
    const pr = removed / total;
    ctx.progress(pr);
    if (pr > 0.5 && pr < 0.9) ctx.hint(t('mg_shear_more'), 'good');
    if (pr >= 0.96 && !ctx.done) {
      for (const w of wool) w.on = false;
      fx.burst(full.bx, full.by - full.ry, '✨', 6);
      const time = ctx.time;
      ctx.finish(time <= 18 ? 1 : Math.max(0.6, 1 - (time - 18) / 40));
    }
  }

  return {
    peek: () => ({ body: { x: full.bx, y: full.by, rx: full.rx, ry: full.ry }, head: full.head }),
    down(p) { last = p; },
    move(p, down) { if (down) cutAlong(p); },
    up() { last = null; },
    draw(g) {
      sky(g, ctx.view, '#a9d8f2', '#e4f3fb', floorY, '#8cc268', '#6fa94f');
      // tas de laine
      g.fillStyle = css(woolCol);
      const pr = pile / total;
      for (let i = 0; i < 9; i++) {
        if (i / 9 > pr) break;
        circle(g, 330 + ((i * 37) % 50) - 20, floorY + 20 - Math.floor(i / 3) * 12, 16);
        g.fill();
      }
      drawAnimal(g, a, { x: fit.x, y: floorY, s: fit.s, f: 1, shorn: true, happy: ctx.done });
      // laine restante
      for (const w of wool) {
        if (!w.on) continue;
        g.fillStyle = shade(woolCol, -0.1);
        circle(g, w.x, w.y + 2, w.r);
        g.fill();
      }
      for (const w of wool) {
        if (!w.on) continue;
        g.fillStyle = mix(woolCol, 0xffffff, 0.1 + w.k * 0.2);
        circle(g, w.x, w.y, w.r * 0.92);
        g.fill();
      }
      const pp = ctx.pointer;
      if ((pp.over || pp.down) && !ctx.done) {
        g.save();
        g.translate(pp.x, pp.y);
        g.rotate(-0.3);
        g.fillStyle = '#3c7bd9';
        rrect(g, -10, 0, 20, 50, 8);
        g.fill();
        g.fillStyle = '#c9ced3';
        rrect(g, -18, -14, 36, 16, 3);
        g.fill();
        g.fillStyle = '#5d6870';
        for (let i = -16; i < 18; i += 5) g.fillRect(i, -20, 3, 7);
        g.restore();
      }
    },
  };
}

