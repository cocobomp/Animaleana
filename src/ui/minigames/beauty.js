// Mini-jeux du concours de beauté : tresser la crinière et la queue (chevaux), lustrer la robe
// et huiler les sabots, mettre un nœud ou un bandana, « pouffer » la laine ou le poil.
// Même contrat que les autres mini-jeux (src/ui/minigames.js) : ctx → { update, draw, down, move, up, peek }.
// Le choix fait dans le jeu (couleur du ruban, motif) est écrit dans ctx.opts.out.

import { drawAnimal, animalShape, fitAnimal, sky, fillView, ellipse, circle, emoji, label, clamp, lerp, dist, css, shade } from './draw.js';
import { RIBBON_COLORS, BOW_PATTERNS } from '../../sim/beauty.js';

const COLOR_EMOJI = { red: '🔴', pink: '🩷', blue: '🔵', yellow: '🟡', green: '🟢', purple: '🟣', white: '⚪' };
const PATTERN_EMOJI = { plain: '⬜', dots: '🔘', stripes: '📏' };

function ringBackground(g, ctx, floorY = 305) {
  // La cour de l'écurie, un matin de concours : ciel clair, sable, guirlande de fanions.
  sky(g, ctx.view, '#b9e0f5', '#eef8ff', floorY, '#dcc89a', '#c7b07f');
  const cols = ['#e0473a', '#ffcf2e', '#2f9a4a', '#2f6fd8', '#b070ff'];
  g.strokeStyle = '#6b4a2f';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(ctx.view.x0, 22);
  g.quadraticCurveTo(200, 46, ctx.view.x1, 22);
  g.stroke();
  for (let x = ctx.view.x0 + 10; x < ctx.view.x1; x += 34) {
    const k = (x - ctx.view.x0) / (ctx.view.x1 - ctx.view.x0);
    const y = 22 + Math.sin(k * Math.PI) * 12;
    g.fillStyle = cols[Math.floor(x / 34) % cols.length];
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 16, y);
    g.lineTo(x + 8, y + 18);
    g.closePath();
    g.fill();
  }
}

/** Un petit nœud (ruban) : deux boucles, un nœud et deux pans. */
export function drawBow(g, x, y, size, color, pattern = 'plain', rot = 0) {
  const c = css(color);
  const dark = shade(color, -0.3);
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = c;
  g.strokeStyle = dark;
  g.lineWidth = Math.max(1, size * 0.08);
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(s * size * 0.55, -size * 0.1, size * 0.55, size * 0.36, s * 0.35, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // pans
    g.beginPath();
    g.moveTo(0, size * 0.1);
    g.lineTo(s * size * 0.45, size * 0.9);
    g.lineTo(s * size * 0.15, size * 0.95);
    g.closePath();
    g.fill();
    g.stroke();
  }
  if (pattern === 'dots') {
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [dx, dy] of [[-0.7, -0.15], [-0.4, 0.05], [0.4, -0.2], [0.75, 0.0]]) {
      circle(g, dx * size, dy * size, size * 0.09);
      g.fill();
    }
  } else if (pattern === 'stripes') {
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = size * 0.08;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * size * 0.25, -size * 0.35);
      g.lineTo(s * size * 0.85, size * 0.05);
      g.stroke();
    }
  }
  circle(g, 0, 0, size * 0.2);
  g.fillStyle = dark;
  g.fill();
  g.restore();
}

/** Une tresse : des mèches entrelacées. from → to, largeur w. */
function drawBraid(g, from, to, w, color, k = 1) {
  const n = Math.max(2, Math.round(dist(from.x, from.y, to.x, to.y) / (w * 0.75)));
  const shown = Math.ceil(n * k);
  const dx = (to.x - from.x) / n;
  const dy = (to.y - from.y) / n;
  const nx = -dy / Math.hypot(dx, dy) || 0;
  const ny = dx / Math.hypot(dx, dy) || 0;
  for (let i = 0; i < shown; i++) {
    const s = i % 2 ? 1 : -1;
    const x = from.x + dx * (i + 0.5) + nx * s * w * 0.22;
    const y = from.y + dy * (i + 0.5) + ny * s * w * 0.22;
    g.fillStyle = i % 2 ? css(color) : shade(color, -0.18);
    g.strokeStyle = shade(color, -0.45);
    g.lineWidth = 1.2;
    ellipse(g, x, y, w * 0.55, w * 0.38, Math.atan2(dy, dx) + s * 0.6);
    g.fill();
    g.stroke();
  }
}

/** Boutons de couleur : la couleur choisie va dans ctx.opts.out.color. */
function colorButtons(ctx, onPick, list = ['red', 'pink', 'blue', 'yellow', 'green', 'purple']) {
  ctx.clearButtons();
  for (const key of list) {
    ctx.button(COLOR_EMOJI[key] ?? '🎀', {
      cls: 'mg-color',
      onTap: () => {
        ctx.opts.out = { ...(ctx.opts.out ?? {}), color: key };
        ctx.clearButtons();
        onPick(key);
      },
    });
  }
}

// ---------------------------------------------------------------- tresser (chevaux)

export function braidGame(ctx) {
  const { a, t, fx } = ctx;
  ctx.opts = ctx.opts ?? {};
  const floorY = 305;
  const fit = fitAnimal(a, { groundY: floorY, maxW: 330, maxH: 250 });
  const sh = animalShape(a, { x: fit.x, y: floorY, s: fit.s, f: 1 });
  const s = fit.s;
  const mane = a.look?.mane ?? a.look?.secondary ?? 0x4a2f1d;
  // Les sections de tresse : le long de la crinière, puis la queue.
  const m0 = sh.L(sh.rx * 0.55, -sh.ry * 0.95);
  const m1 = { x: sh.head.x - sh.hr * 0.45, y: sh.head.y - sh.hr * 0.75 };
  const sections = [];
  const N = 4;
  for (let i = 0; i < N; i++) {
    const k = (i + 0.5) / N;
    const top = { x: lerp(m0.x, m1.x, k), y: lerp(m0.y, m1.y, k) - 2 * s };
    const len = 34 * s;
    sections.push({ top, bottom: { x: top.x - 10 * s, y: top.y + len }, len, done: 0, taps: 0, ribbon: false, tail: false });
  }
  const tb = sh.L(-sh.rx * 0.95, -sh.ry * 0.25);
  sections.push({ top: { x: tb.x - 8 * s, y: tb.y + 10 * s }, bottom: { x: tb.x - 24 * s, y: tb.y + 62 * s }, len: 52 * s, done: 0, taps: 0, ribbon: false, tail: true });
  // Trois mèches par section : on les prend dans l'ordre gauche → droite → milieu.
  const ORDER = [0, 2, 1];
  const gap = Math.max(13, 13 * s);
  const strands = (sec) => [-1, 0, 1].map((o) => ({ x: sec.top.x + o * gap - 4 * s, y: sec.top.y + sec.len * 0.45 }));
  let cur = 0;
  let wrong = 0;
  let total = 0;
  let phase = 'braid'; // braid | color | ribbons
  let color = null;
  let shake = 0;
  let bounce = 0;

  ctx.hint(t('mg_braid_hint'));

  const progress = () => {
    const braided = sections.reduce((acc, sec) => acc + sec.done, 0) / sections.length;
    const ribbons = sections.filter((x) => x.ribbon).length / sections.length;
    return braided * 0.6 + (phase === 'braid' ? 0 : 0.1 + ribbons * 0.3);
  };

  function tap(p) {
    if (phase === 'braid') {
      const sec = sections[cur];
      if (!sec) return;
      const pts = strands(sec);
      const want = ORDER[sec.taps];
      // La mèche la plus proche du doigt (si on touche assez près).
      let hit = -1;
      let best = 18 * Math.max(1, s);
      pts.forEach((q, i) => {
        const d = dist(p.x, p.y, q.x, q.y);
        if (d < best) { best = d; hit = i; }
      });
      if (hit < 0) return;
      total++;
      if (hit !== want) {
        wrong++;
        shake = 0.4;
        ctx.hint(t('mg_braid_wrong'), 'warn');
        return;
      }
      sec.taps++;
      sec.done = sec.taps / 3;
      fx.burst(pts[hit].x, pts[hit].y, '✨', 2, { speed: 60, size: 14 });
      if (sec.taps >= 3) {
        cur++;
        fx.text(sec.top.x, sec.top.y - 24, t('mg_braid_done'), '#2f8a5f', 18);
        if (cur >= sections.length) {
          phase = 'color';
          ctx.hint(t('mg_braid_color'), 'good');
          colorButtons(ctx, (key) => {
            color = key;
            phase = 'ribbons';
            ctx.hint(t('mg_braid_ribbons'));
          });
        } else ctx.hint(t(cur === sections.length - 1 ? 'mg_braid_tail' : 'mg_braid_next'), 'good');
      }
      ctx.progress(progress());
    } else if (phase === 'ribbons') {
      for (const sec of sections) {
        if (sec.ribbon) continue;
        if (dist(p.x, p.y, sec.bottom.x, sec.bottom.y) < 22 * Math.max(1, s)) {
          sec.ribbon = true;
          bounce = 0.5;
          fx.burst(sec.bottom.x, sec.bottom.y, '🎀', 3, { speed: 70, size: 16 });
          fx.float(sec.bottom.x, sec.bottom.y - 10, '💕', 18);
          break;
        }
      }
      ctx.progress(progress());
      if (sections.every((x) => x.ribbon)) {
        const share = 1 - wrong / Math.max(1, total);
        ctx.finish(0.6 + 0.4 * clamp(share), t('mg_braid_end', { name: a.name }));
        fx.text(200, 110, t('mg_perfect'), '#2f8a5f', 28);
      }
    }
  }

  return {
    peek: () => ({
      phase,
      color,
      next: phase === 'braid' && sections[cur] ? strands(sections[cur])[ORDER[sections[cur].taps]] : null,
      ribbons: sections.filter((x) => !x.ribbon).map((x) => x.bottom),
    }),
    down(p) { tap(p); },
    update(dt) {
      shake = Math.max(0, shake - dt);
      bounce = Math.max(0, bounce - dt);
    },
    draw(g) {
      ringBackground(g, ctx, floorY);
      drawAnimal(g, a, { x: fit.x, y: floorY, s, f: 1, happy: phase !== 'braid' || cur > 0, shake: shake > 0 ? 1 : 0 });
      // Tresses faites (et en cours)
      sections.forEach((sec, i) => {
        if (sec.done > 0) drawBraid(g, sec.top, sec.bottom, 11 * s, mane, sec.done);
        if (sec.ribbon) drawBow(g, sec.bottom.x, sec.bottom.y, 11 * s, RIBBON_COLORS[color] ?? RIBBON_COLORS.red, 'plain', -0.2);
        else if (phase === 'ribbons') {
          // Les endroits où nouer un ruban clignotent
          g.save();
          g.globalAlpha = 0.5 + Math.sin(ctx.time * 5) * 0.3;
          g.strokeStyle = '#fff';
          g.lineWidth = 3;
          circle(g, sec.bottom.x, sec.bottom.y, 14 * Math.max(1, s));
          g.stroke();
          g.restore();
          emoji(g, '🎀', sec.bottom.x, sec.bottom.y, 16, 0, 0.6);
        }
        // Mèches de la section en cours : numérotées dans l'ordre à suivre
        if (phase === 'braid' && i === cur) {
          const pts = strands(sec);
          pts.forEach((q, j) => {
            const step = ORDER.indexOf(j);
            const isNext = ORDER[sec.taps] === j;
            const taken = step < sec.taps;
            const r = (taken ? 8 : 11) * Math.max(1, s) * (isNext ? 1 + Math.sin(ctx.time * 6) * 0.12 : 1);
            g.fillStyle = taken ? shade(mane, -0.2) : isNext ? '#ffd23a' : '#fff7df';
            g.strokeStyle = shade(mane, -0.45);
            g.lineWidth = 2;
            ellipse(g, q.x, q.y, r * 0.7, r * 1.5, 0.2);
            g.fill();
            g.stroke();
            if (!taken) label(g, String(step + 1), q.x, q.y, 14, isNext ? '#6a4a00' : '#8a8273');
          });
        }
      });
      if (bounce > 0) emoji(g, '💖', sh.head.x, sh.head.y - sh.hr * 2.2, 26, 0, bounce * 2);
    },
  };
}

// ---------------------------------------------------------------- lustrer la robe (et huiler les sabots)

export function shineGame(ctx) {
  const { a, t, fx } = ctx;
  const floorY = 305;
  const fit = fitAnimal(a, { groundY: floorY, maxW: 340, maxH: 250 });
  const sh = animalShape(a, { x: fit.x, y: floorY, s: fit.s, f: 1 });
  const s = fit.s;
  const step = 24 * Math.max(0.85, s * 0.9);
  const cells = [];
  for (let ly = -sh.ry; ly <= sh.ry; ly += step) {
    for (let lx = -sh.rx; lx <= sh.rx; lx += step) {
      if ((lx * lx) / (sh.rx * 0.9) ** 2 + (ly * ly) / (sh.ry * 0.85) ** 2 > 1) continue;
      cells.push({ ...sh.L(lx, ly), v: 0 });
    }
  }
  const hooves = a.species === 'horse' ? [
    { x: sh.bx + sh.rx * 0.62, y: floorY - 7 * s, done: false },
    { x: sh.bx - sh.rx * 0.62, y: floorY - 7 * s, done: false },
  ] : [];
  let last = null;
  let over = 0;
  let strokes = 0;
  let sparkle = 0;

  ctx.hint(t(a.species === 'horse' ? 'mg_shine_hintHorse' : 'mg_shine_hint'));

  const coverage = () => cells.reduce((acc, c) => acc + Math.min(1, c.v), 0) / Math.max(1, cells.length);
  const progress = () => coverage() * (hooves.length ? 0.8 : 1) + (hooves.length ? (hooves.filter((h) => h.done).length / hooves.length) * 0.2 : 0);

  function rub(p) {
    if (!last) { last = p; return; }
    const d = dist(last.x, last.y, p.x, p.y);
    if (d < 1) return;
    let touched = false;
    for (const c of cells) {
      if (dist(c.x, c.y, p.x, p.y) > step * 0.9) continue;
      touched = true;
      const before = c.v;
      c.v += d * 0.012;
      // Trop frotté au même endroit : ça ne brille pas plus, on perd en régularité.
      if (before > 1.3) over += d * 0.012;
      strokes += d * 0.012;
    }
    if (touched && Math.random() < 0.4) fx.dot(p.x + (Math.random() - 0.5) * 16, p.y + (Math.random() - 0.5) * 16, 'rgba(255,255,255,0.9)', 2 + Math.random() * 2, { life: 0.5 });
    if (over > 1.5 && over > strokes * 0.3) ctx.hint(t('mg_shine_spread'), 'warn');
    else if (coverage() > 0.5) ctx.hint(t('mg_shine_good'), 'good');
    last = p;
    check();
  }

  function check() {
    ctx.progress(progress());
    if (coverage() >= 0.97 && hooves.every((h) => h.done) && !ctx.done) {
      const even = clamp(1 - over / Math.max(1, strokes) * 2);
      ctx.finish(0.55 + 0.45 * even, t('mg_shine_end', { name: a.name }));
      fx.text(200, 110, t('mg_perfect'), '#2f8a5f', 28);
    }
  }

  return {
    peek: () => ({ cells: cells.filter((c) => c.v < 1).map((c) => ({ x: c.x, y: c.y })), hooves: hooves.filter((h) => !h.done) }),
    down(p) {
      last = p;
      for (const hv of hooves) {
        if (!hv.done && dist(p.x, p.y, hv.x, hv.y) < 20 * Math.max(1, s)) {
          hv.done = true;
          fx.burst(hv.x, hv.y - 6, '✨', 4, { speed: 70, size: 14 });
          check();
        }
      }
    },
    move(p, down) { if (down) rub(p); },
    up() { last = null; },
    update(dt) { sparkle += dt; },
    draw(g) {
      ringBackground(g, ctx, floorY);
      drawAnimal(g, a, { x: fit.x, y: floorY, s, f: 1, happy: coverage() > 0.4 });
      // Le brillant : des taches claires là où on a lustré
      for (const c of cells) {
        if (c.v <= 0) continue;
        g.save();
        g.globalAlpha = Math.min(0.55, c.v * 0.4);
        g.fillStyle = '#ffffff';
        ellipse(g, c.x, c.y, step * 0.55, step * 0.42, -0.3);
        g.fill();
        g.restore();
      }
      // Les sabots à huiler
      for (const hv of hooves) {
        if (hv.done) {
          emoji(g, '✨', hv.x, hv.y - 10 + Math.sin(sparkle * 4) * 2, 16, 0, 0.9);
          continue;
        }
        g.save();
        g.globalAlpha = 0.6 + Math.sin(ctx.time * 5) * 0.3;
        g.strokeStyle = '#fff';
        g.lineWidth = 3;
        circle(g, hv.x, hv.y, 15 * Math.max(1, s));
        g.stroke();
        g.restore();
        emoji(g, '🧴', hv.x, hv.y - 26, 20);
      }
      if (ctx.done) {
        for (let i = 0; i < 5; i++) {
          const p = sh.L(Math.cos(sparkle * 2 + i * 1.3) * sh.rx * 0.65, Math.sin(sparkle * 3 + i) * sh.ry * 0.5);
          emoji(g, '✨', p.x, p.y, 18, 0, 0.85);
        }
      }
      const pp = ctx.pointer;
      if (pp.over || pp.down) emoji(g, '🧽', pp.x, pp.y - 8, 34);
    },
  };
}

// ---------------------------------------------------------------- nœud ou bandana

export function bowGame(ctx) {
  const { a, t, fx } = ctx;
  ctx.opts = ctx.opts ?? {};
  const floorY = 305;
  const fit = fitAnimal(a, { groundY: floorY, maxW: 320, maxH: 240 });
  const sh = animalShape(a, { x: fit.x, y: floorY, s: fit.s, f: 1 });
  const s = fit.s;
  const target = { x: sh.neck.x + (a.species === 'rabbit' || a.species === 'cat' ? 0 : 4 * s), y: sh.neck.y + 6 * s };
  let color = null;
  let pattern = null;
  let phase = 'color'; // color | pattern | place | tighten
  const bow = { x: 70, y: 110, drag: false, placed: false };
  let accuracy = 0;
  let taps = 0;
  let pulse = 0;

  ctx.hint(t('mg_bow_color'));
  colorButtons(ctx, (key) => {
    color = key;
    phase = 'pattern';
    ctx.hint(t('mg_bow_pattern'));
    ctx.clearButtons();
    for (const pt of BOW_PATTERNS) {
      ctx.button(`${PATTERN_EMOJI[pt]} ${t(`mg_bow_p_${pt}`)}`, {
        onTap: () => {
          pattern = pt;
          ctx.opts.out = { ...(ctx.opts.out ?? {}), pattern: pt };
          ctx.clearButtons();
          phase = 'place';
          ctx.hint(t('mg_bow_place'));
          ctx.progress(0.4);
        },
      });
    }
    ctx.progress(0.2);
  });

  return {
    peek: () => ({ phase, bow: { x: bow.x, y: bow.y }, target }),
    down(p) {
      if (phase === 'place' && dist(p.x, p.y, bow.x, bow.y) < 36) bow.drag = true;
      else if (phase === 'tighten' && dist(p.x, p.y, target.x, target.y) < 40) {
        taps++;
        pulse = 0.35;
        fx.float(target.x, target.y - 10, taps >= 3 ? '💖' : '💕', 20);
        ctx.progress(0.7 + taps * 0.1);
        if (taps >= 3 && !ctx.done) ctx.finish(0.7 + 0.3 * accuracy, t('mg_bow_end', { name: a.name }));
      }
    },
    move(p, down) {
      if (bow.drag && down) {
        bow.x = p.x;
        bow.y = p.y;
      }
    },
    up(p) {
      if (!bow.drag) return;
      bow.drag = false;
      const d = dist(p.x, p.y, target.x, target.y);
      if (d < 34 * Math.max(1, s)) {
        bow.placed = true;
        bow.x = target.x;
        bow.y = target.y;
        accuracy = clamp(1 - d / (34 * Math.max(1, s)));
        phase = 'tighten';
        ctx.hint(t('mg_bow_tighten'), 'good');
        ctx.progress(0.7);
        fx.burst(target.x, target.y, '✨', 4, { speed: 70, size: 14 });
      } else ctx.hint(t('mg_bow_miss'), 'warn');
    },
    update(dt) { pulse = Math.max(0, pulse - dt); },
    draw(g) {
      fillView(g, ctx.view, '#fbeff5', '#f3dde8');
      g.fillStyle = '#e9c9d8';
      g.fillRect(ctx.view.x0, floorY, ctx.view.w, ctx.view.y1 - floorY);
      drawAnimal(g, a, { x: fit.x, y: floorY, s, f: 1, happy: phase === 'tighten' || ctx.done, wag: ctx.done });
      if (phase === 'color' || phase === 'pattern') {
        emoji(g, '🎀', 200, 120, 64 + Math.sin(ctx.time * 3) * 4);
        return;
      }
      if (phase === 'place') {
        g.save();
        g.globalAlpha = 0.5 + Math.sin(ctx.time * 5) * 0.3;
        g.strokeStyle = '#fff';
        g.lineWidth = 3;
        g.setLineDash([6, 6]);
        circle(g, target.x, target.y, 24 * Math.max(1, s));
        g.stroke();
        g.restore();
      }
      const size = (phase === 'place' ? 22 : 18 * Math.max(1, s)) * (1 + pulse * 0.6);
      drawBow(g, bow.x, bow.y, size, RIBBON_COLORS[color] ?? RIBBON_COLORS.red, pattern ?? 'plain', bow.placed ? -0.15 : Math.sin(ctx.time * 2) * 0.15);
      if (phase === 'place' && !bow.drag) emoji(g, '👆', bow.x + 22, bow.y + 26 + Math.sin(ctx.time * 4) * 3, 22);
    },
  };
}

// ---------------------------------------------------------------- pouffer la laine / le poil

export function fluffGame(ctx) {
  const { a, t, fx } = ctx;
  const floorY = 305;
  const fit = fitAnimal(a, { groundY: floorY, maxW: 320, maxH: 240 });
  const s = fit.s;
  const TOTAL = 8;
  let good = 0;
  let taps = 0;
  let beat = 0; // 0 → 1 ; le cercle grossit, il faut taper quand il est grand
  let puff = 0;
  let last = -1;
  const sh = animalShape(a, { x: fit.x, y: floorY, s, f: 1 });

  ctx.hint(t('mg_fluff_hint'));

  return {
    peek: () => ({ beat, taps, good, body: { x: sh.bx, y: sh.by, rx: sh.rx, ry: sh.ry } }),
    down(p) {
      if (ctx.done) return;
      const onBody = dist(p.x, p.y, sh.bx, sh.by) < Math.max(sh.rx, sh.ry) * 1.3;
      if (!onBody) return;
      taps++;
      const quality = Math.max(0, 1 - Math.abs(beat - 0.8) / 0.35);
      if (quality > 0.3) {
        good++;
        puff = Math.min(1, puff + 0.14);
        fx.burst(p.x, p.y, quality > 0.8 ? '✨' : '☁️', 3, { speed: 60, size: 16 });
        fx.text(p.x, p.y - 30, t(quality > 0.8 ? 'mg_perfect' : 'mg_good'), '#2f8a5f', 18);
      } else {
        fx.text(p.x, p.y - 30, t('mg_fluff_early'), '#8b2b22', 18);
      }
      beat = 0;
      ctx.progress(taps / TOTAL);
      if (taps >= TOTAL) ctx.finish(0.5 + 0.5 * (good / TOTAL), t('mg_fluff_end', { name: a.name }));
    },
    update(dt) {
      if (ctx.done) return;
      beat = Math.min(1, beat + dt * 0.75);
      if (beat >= 1) beat = 0; // trop tard : on repart
      if (Math.floor(beat * 4) !== last) last = Math.floor(beat * 4);
    },
    draw(g) {
      fillView(g, ctx.view, '#eef6ec', '#dcebd8');
      g.fillStyle = '#c6dcc0';
      g.fillRect(ctx.view.x0, floorY, ctx.view.w, ctx.view.y1 - floorY);
      const scale = s * (1 + puff * 0.1);
      drawAnimal(g, a, { x: fit.x, y: floorY, s: scale, f: 1, happy: puff > 0.3, wag: ctx.done });
      if (!ctx.done) {
        // Le rythme : un cercle qui grandit ; on tape quand il touche l'anneau.
        const r = 14 + beat * 36;
        g.save();
        g.strokeStyle = '#fff';
        g.lineWidth = 3;
        g.globalAlpha = 0.9;
        circle(g, sh.bx, sh.by, 44);
        g.stroke();
        g.fillStyle = beat > 0.65 && beat < 0.95 ? 'rgba(63,174,98,0.55)' : 'rgba(255,255,255,0.5)';
        circle(g, sh.bx, sh.by, r);
        g.fill();
        g.restore();
        emoji(g, '🧶', sh.bx, sh.by, 26);
      }
      for (let i = 0; i < Math.round(puff * 6); i++) {
        const p = sh.L(Math.cos(ctx.time * 1.5 + i * 1.1) * sh.rx * 0.7, Math.sin(ctx.time * 2 + i) * sh.ry * 0.6);
        emoji(g, '☁️', p.x, p.y - 8, 16, 0, 0.5);
      }
    },
  };
}
