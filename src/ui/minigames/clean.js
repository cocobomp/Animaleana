// Mini-jeu « nettoyer » : curer le box (cheval), l'étable (vache), le clapier (lapin)
// ou changer la litière (chat). 1) Mettre les saletés dans la brouette. 2) Étaler du propre.

import { rrect, ellipse, circle, emoji, label, fillView, dist, distToSegment } from './draw.js';

const SCENES = {
  horse: { floor: '#c8a964', dirty: '#9b7d45', fresh: '#f3d86b', wall: '#9a6740', bin: 'barrow', item: 'manure', n: 6 },
  cow: { floor: '#b9ab8e', dirty: '#8d7d60', fresh: '#f3d86b', wall: '#8a5d3a', bin: 'barrow', item: 'manure', n: 7 },
  rabbit: { floor: '#d9c27a', dirty: '#a8945a', fresh: '#f3dc7e', wall: '#b88a55', bin: 'bucket', item: 'droppings', n: 6 },
  cat: { floor: '#c9c3b8', dirty: '#a49d90', fresh: '#efe9dc', wall: '#cfe6f2', bin: 'bag', item: 'clump', n: 6 },
};

export function cleanGame(ctx) {
  const { a, t, fx } = ctx;
  const sc = SCENES[a.species] ?? SCENES.horse;
  const cat = a.species === 'cat';
  // Zone du sol (la litière pour le chat)
  const floor = cat ? { x: 30, y: 110, w: 290, h: 210 } : { x: 14, y: 96, w: 312, h: 246 };
  const bin = { x: 362, y: 250 };
  const items = [];
  let tries = 0;
  while (items.length < sc.n && tries < 500) {
    tries++;
    const x = floor.x + 30 + ctx.rng() * (floor.w - 60);
    const y = floor.y + 30 + ctx.rng() * (floor.h - 60);
    if (items.some((it) => dist(it.x, it.y, x, y) < 62)) continue;
    items.push({ x, y, state: 'floor', k: 0, seed: ctx.rng() * 6, sx: 0, sy: 0 });
  }
  const step = 36;
  const cells = [];
  for (let y = floor.y + step / 2; y < floor.y + floor.h; y += step) {
    for (let x = floor.x + step / 2; x < floor.x + floor.w; x += step) cells.push({ x, y, fresh: false, k: ctx.rng() });
  }
  let phase = 'pick';
  let held = null;
  let downAt = null;
  let last = null;
  let inBin = 0;

  ctx.hint(t(cat ? 'mg_clean_hint_cat' : 'mg_clean_hint'));

  function toBin(it) {
    it.state = 'fly';
    it.k = 0;
    it.sx = it.x;
    it.sy = it.y;
  }

  function spread(p) {
    if (!last) { last = p; return; }
    let any = false;
    for (const c of cells) {
      if (c.fresh) continue;
      if (distToSegment(c.x, c.y, last.x, last.y, p.x, p.y) < 32) {
        c.fresh = true;
        any = true;
      }
    }
    if (any && Math.random() < 0.6) fx.dot(p.x, p.y, sc.fresh, 3, { vx: (Math.random() - 0.5) * 80, vy: -40, grav: 300, life: 0.5 });
    last = p;
    const f = cells.filter((c) => c.fresh).length / cells.length;
    ctx.progress(0.6 + 0.4 * Math.min(1, f / 0.92));
    if (f >= 0.92 && !ctx.done) {
      for (const c of cells) c.fresh = true;
      fx.burst(floor.x + floor.w / 2, floor.y + floor.h / 2, '✨', 8, { speed: 160 });
      const time = ctx.time;
      ctx.finish(time <= 24 ? 1 : Math.max(0.6, 1 - (time - 24) / 40));
    }
  }

  return {
    peek: () => ({ phase, items: items.filter((x) => x.state === 'floor').map((x) => ({ x: x.x, y: x.y })), floor }),
    down(p) {
      if (phase === 'pick') {
        const it = items.filter((x) => x.state === 'floor').sort((u, v) => dist(u.x, u.y, p.x, p.y) - dist(v.x, v.y, p.x, p.y))[0];
        if (it && dist(it.x, it.y, p.x, p.y) < 44) {
          held = it;
          it.state = 'held';
          downAt = { x: p.x, y: p.y };
        }
      } else last = p;
    },
    move(p, down) {
      if (!down) return;
      if (held) {
        held.x = p.x;
        held.y = p.y;
      } else if (phase === 'spread') spread(p);
    },
    up(p) {
      if (held) {
        const moved = dist(downAt.x, downAt.y, p.x, p.y);
        // Lâché sur la brouette, ou simple tape : l'objet file dans la brouette.
        if (dist(p.x, p.y, bin.x, bin.y) < 70 || moved < 12) toBin(held);
        else held.state = 'floor';
        held = null;
      }
      last = null;
    },
    update(dt) {
      for (const it of items) {
        if (it.state !== 'fly') continue;
        it.k = Math.min(1, it.k + dt * 2.6);
        it.x = it.sx + (bin.x - it.sx) * it.k;
        it.y = it.sy + (bin.y - 30 - it.sy) * it.k - Math.sin(it.k * Math.PI) * 70;
        if (it.k >= 1) {
          it.state = 'bin';
          inBin++;
          fx.text(bin.x, bin.y - 70, t('mg_hop'), '#2f8a5f', 20);
          ctx.progress(0.6 * (inBin / items.length));
          if (inBin === items.length && phase === 'pick') {
            phase = 'spread';
            ctx.hint(t(cat ? 'mg_clean_spread_cat' : 'mg_clean_spread'), 'good');
            fx.text(200, 80, t('mg_good'), '#2f8a5f', 26);
          }
        }
      }
    },
    draw(g) {
      const v = ctx.view;
      fillView(g, v, sc.wall, sc.wall);
      if (!cat) {
        // planches du mur
        g.strokeStyle = 'rgba(60, 35, 15, 0.35)';
        g.lineWidth = 3;
        for (let x = Math.floor(v.x0 / 40) * 40; x < v.x1; x += 40) { g.beginPath(); g.moveTo(x, v.y0); g.lineTo(x, floor.y); g.stroke(); }
        g.fillStyle = sc.dirty;
        g.fillRect(v.x0, floor.y, v.w, v.y1 - floor.y);
      } else {
        g.fillStyle = '#e9dccb';
        g.fillRect(v.x0, 300, v.w, v.y1 - 300);
        // bac à litière
        g.fillStyle = '#3c7bd9';
        rrect(g, floor.x - 16, floor.y - 16, floor.w + 32, floor.h + 32, 22);
        g.fill();
        g.fillStyle = '#2f62b0';
        rrect(g, floor.x - 6, floor.y - 6, floor.w + 12, floor.h + 12, 16);
        g.fill();
      }
      // sol
      g.save();
      rrect(g, floor.x, floor.y, floor.w, floor.h, cat ? 12 : 4);
      g.clip();
      g.fillStyle = sc.dirty;
      g.fillRect(floor.x, floor.y, floor.w, floor.h);
      for (const c of cells) {
        if (!c.fresh) {
          if (c.k < 0.12 && !cat) {
            g.fillStyle = 'rgba(80, 60, 30, 0.14)';
            ellipse(g, c.x, c.y, 16, 10, c.k * 6);
            g.fill();
          }
          continue;
        }
        g.fillStyle = sc.fresh;
        g.fillRect(c.x - step / 2 - 1, c.y - step / 2 - 1, step + 2, step + 2);
      }
      // brins / grains
      for (const c of cells) {
        g.strokeStyle = c.fresh ? (cat ? 'rgba(200,190,170,0.7)' : '#d9b84a') : 'rgba(90, 70, 40, 0.45)';
        g.lineWidth = 2;
        for (let i = 0; i < 2; i++) {
          const a0 = c.k * 9 + i * 2.1;
          const x = c.x + Math.cos(a0) * 10;
          const y = c.y + Math.sin(a0 * 1.3) * 10;
          g.beginPath();
          if (cat) { g.arc(x, y, 1.6, 0, Math.PI * 2); g.stroke(); } else { g.moveTo(x - 7, y); g.lineTo(x + 7, y + (i - 1) * 3); g.stroke(); }
        }
      }
      g.restore();
      // saletés
      for (const it of items) if (it.state !== 'bin') drawItem(g, sc.item, it);
      // poubelle / brouette
      drawBin(g, sc.bin, bin, inBin, items.length);
      // l'animal qui attend
      g.fillStyle = 'rgba(255,255,255,0.85)';
      circle(g, 362, 48, 32);
      g.fill();
      emoji(g, ctx.sp.emoji, 362, 50, 38);
      if (phase === 'pick') label(g, `${inBin} / ${items.length}`, 362, 100, 18);
      // outil
      const pp = ctx.pointer;
      if ((pp.over || pp.down) && !ctx.done) {
        if (phase === 'spread') emoji(g, cat ? '🥄' : '🌾', pp.x + 10, pp.y - 14, 34);
        else if (!held) emoji(g, cat ? '🥄' : '🧤', pp.x + 12, pp.y - 12, 30);
      }
    },
  };
}

function drawItem(g, kind, it) {
  const { x, y, seed } = it;
  g.save();
  if (it.state === 'held' || it.state === 'fly') {
    g.fillStyle = 'rgba(0,0,0,0.15)';
    ellipse(g, x, y + 22, 18, 6);
    g.fill();
  }
  if (kind === 'manure') {
    g.fillStyle = '#6b4a2b';
    circle(g, x - 9, y + 4, 11); g.fill();
    circle(g, x + 9, y + 5, 11); g.fill();
    circle(g, x, y - 5, 12); g.fill();
    g.fillStyle = '#87603a';
    circle(g, x - 3, y - 9, 4); g.fill();
    circle(g, x + 7, y + 1, 3); g.fill();
  } else if (kind === 'droppings') {
    g.fillStyle = '#4e3622';
    for (let i = 0; i < 7; i++) {
      circle(g, x + Math.cos(seed + i * 0.9) * (6 + (i % 3) * 5), y + Math.sin(seed + i * 1.7) * 8, 4.5);
      g.fill();
    }
  } else if (seed < 2) {
    // petite crotte
    g.fillStyle = '#6b4a2b';
    ellipse(g, x - 8, y + 2, 10, 7, 0.3); g.fill();
    ellipse(g, x + 7, y - 1, 9, 6, -0.4); g.fill();
    g.fillStyle = '#8a6440';
    circle(g, x - 10, y, 2.5); g.fill();
  } else {
    // boule de litière mouillée
    g.fillStyle = 'rgba(0,0,0,0.18)';
    ellipse(g, x + 2, y + 4, 19, 13, seed);
    g.fill();
    g.fillStyle = '#6f675b';
    ellipse(g, x, y, 18, 13, seed);
    g.fill();
    g.fillStyle = '#857d70';
    circle(g, x - 6, y - 4, 6); g.fill();
    circle(g, x + 6, y + 2, 5); g.fill();
  }
  g.restore();
}

function drawBin(g, kind, bin, n, total) {
  const { x, y } = bin;
  g.save();
  if (kind === 'barrow') {
    g.fillStyle = '#3a3f44';
    circle(g, x - 18, y + 46, 12); g.fill();
    g.fillStyle = '#2f8a5f';
    g.beginPath();
    g.moveTo(x - 48, y - 26);
    g.lineTo(x + 34, y - 26);
    g.lineTo(x + 20, y + 30);
    g.lineTo(x - 40, y + 30);
    g.closePath();
    g.fill();
    g.strokeStyle = '#1e5c3e';
    g.lineWidth = 4;
    g.stroke();
    g.strokeStyle = '#8a5a2b';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(x + 20, y + 20);
    g.lineTo(x + 46, y + 50);
    g.stroke();
  } else if (kind === 'bucket') {
    g.fillStyle = '#e0574a';
    g.beginPath();
    g.moveTo(x - 34, y - 26);
    g.lineTo(x + 34, y - 26);
    g.lineTo(x + 26, y + 40);
    g.lineTo(x - 26, y + 40);
    g.closePath();
    g.fill();
  } else {
    g.fillStyle = '#3a3f44';
    g.beginPath();
    g.moveTo(x - 34, y - 20);
    g.quadraticCurveTo(x, y - 34, x + 34, y - 20);
    g.lineTo(x + 30, y + 44);
    g.lineTo(x - 30, y + 44);
    g.closePath();
    g.fill();
  }
  // contenu qui monte
  const k = total ? n / total : 0;
  if (k > 0) {
    g.fillStyle = kind === 'bag' ? '#8f8778' : '#6b4a2b';
    ellipse(g, x - 6, y - 24, 34 * Math.min(1, 0.4 + k), 6 + 10 * k);
    g.fill();
  }
  g.restore();
  if (n < total) emoji(g, '⬇️', x - 6, y - 64 + Math.sin(performance.now() / 250) * 4, 22);
}
