// Mini-jeux du concours de beauté : tresser la crinière et la queue (chevaux), lustrer la robe
// et huiler les sabots, mettre un nœud ou un bandana, « pouffer » la laine ou le poil.
// Même contrat que les autres mini-jeux (src/ui/minigames.js, cadre commun) :
// ctx → { update, draw, down, move, up, key, peek }. Le choix fait dans le jeu (couleur du ruban,
// motif) est écrit dans ctx.opts.out.
//
// Règle « juste ce qu'il faut » (score.js, via ctx.zone / ctx.finishJust) là où il y a une
// quantité : le lustrant (pas assez : terne, trop : ça colle) et le nœud (lâche : il glisse,
// trop serré : l'animal est gêné). Les tresses sont un geste à apprendre (gauche au milieu,
// droite au milieu) : la note suit les mèches touchées dans le bon ordre.

import { drawAnimal, animalShape, fitAnimal, sky, fillView, ellipse, circle, emoji, label, rrect, clamp, lerp, dist, css, shade } from './draw.js';
import { RIBBON_COLORS, BOW_PATTERNS } from '../../sim/beauty.js';

const COLOR_EMOJI = { red: '🔴', pink: '🩷', blue: '🔵', yellow: '🟡', green: '🟢', purple: '🟣', white: '⚪' };
const PATTERN_EMOJI = { plain: '⬜', dots: '🔘', stripes: '📏' };
const BEADS = ['#e0473a', '#ffcf2e', '#2f6fd8']; // élastiques des trois mèches de la tresse
const isGo = (code) => code === 'Space' || code === 'Enter' || code === 'NumpadEnter';

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

/** Une tresse : des mèches entrelacées. from → to, largeur w. k : part déjà tressée (0 à 1). */
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
    g.lineWidth = Math.max(1.2, w * 0.06);
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

/**
 * Tresser : le cheval en petit à gauche, et une loupe sur la tresse en cours à droite, avec trois
 * grosses mèches. Le vrai geste : la mèche de GAUCHE passe au milieu, puis celle de DROITE, puis
 * celle de gauche… (3 croisements par tresse). Quatre tresses le long de la crinière, une à la queue.
 * Puis on choisit la couleur des rubans et on en noue un au bout de chaque tresse.
 */
export function braidGame(ctx) {
  const { a, t, fx } = ctx;
  ctx.opts = ctx.opts ?? {};
  const floorY = 300;
  const fit = fitAnimal(a, { cx: 104, groundY: floorY, maxW: 190, maxH: 186 });
  const s = fit.s;
  const sh = animalShape(a, { x: fit.x, y: floorY, s, f: 1 });
  const mane = a.look?.mane ?? a.look?.secondary ?? 0x4a2f1d;
  const coat = a.look?.coat ?? 0x8a5a2b;
  // Les tresses sur le petit cheval : le long de la crinière, puis la queue.
  const m0 = sh.L(sh.rx * 0.55, -sh.ry * 0.95);
  const m1 = { x: sh.head.x - sh.hr * 0.45, y: sh.head.y - sh.hr * 0.75 };
  const sections = [];
  const N = 4;
  for (let i = 0; i < N; i++) {
    const k = (i + 0.5) / N;
    const top = { x: lerp(m0.x, m1.x, k), y: lerp(m0.y, m1.y, k) - 2 * s };
    sections.push({ top, bottom: { x: top.x - 7 * s, y: top.y + 28 * s }, done: 0, ribbon: false, tail: false });
  }
  const tb = sh.L(-sh.rx * 0.95, -sh.ry * 0.25);
  sections.push({ top: { x: tb.x - 6 * s, y: tb.y + 8 * s }, bottom: { x: tb.x - 18 * s, y: tb.y + 50 * s }, done: 0, ribbon: false, tail: true });

  // La loupe et ses trois mèches (gauche, milieu, droite), assez grosses pour un doigt.
  // (sur un téléphone de 390 px, ≈ 0,9 px par unité : 52 unités entre deux mèches ≈ 47 px sous le doigt)
  const LOUPE = { x: 204, y: 56, w: 190, h: 244 };
  const SLOT_X = [LOUPE.x + 43, LOUPE.x + 95, LOUPE.x + 147];
  const STRAND_W = 34;
  const TOP_Y = LOUPE.y + 44;
  const BOTTOM_Y = LOUPE.y + LOUPE.h - 18;
  const STEP = 34; // la tresse s'allonge à chaque croisement
  const CROSS = 3;
  let cur = 0;
  let crossings = 0;
  let order = [0, 1, 2]; // quelle mèche est à gauche, au milieu, à droite
  let wrong = 0;
  let total = 0;
  let phase = 'braid'; // braid | color | ribbons
  let color = null;
  let tie = 0; // prochaine tresse où nouer un ruban
  let shake = 0;
  let bounce = 0;
  let swap = null; // petite animation du croisement { from, t }

  ctx.hint(t('mg_braid_hint'));

  const expected = () => (crossings % 2 === 0 ? 0 : 2);
  const braidEnd = () => TOP_Y + crossings * STEP;
  const progress = () => {
    const braided = sections.reduce((acc, sec) => acc + sec.done, 0) / sections.length;
    const ribbons = sections.filter((x) => x.ribbon).length / sections.length;
    return braided * 0.75 + ribbons * 0.25;
  };
  /** La mèche (0, 1, 2) sous le doigt dans la loupe, ou -1. */
  const strandAt = (p) => {
    if (p.x < LOUPE.x || p.x > LOUPE.x + LOUPE.w || p.y < braidEnd() - 10 || p.y > LOUPE.y + LOUPE.h) return -1;
    let best = -1;
    let bd = STRAND_W * 0.95;
    SLOT_X.forEach((x, i) => {
      const d = Math.abs(p.x - x);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };

  function pick(pos) {
    if (phase !== 'braid' || pos < 0) return;
    total++;
    const want = expected();
    if (pos !== want) {
      wrong++;
      shake = 0.4;
      ctx.hint(t(want === 0 ? 'mg_braid_wrongLeft' : 'mg_braid_wrongRight'), 'warn');
      return;
    }
    // La mèche de côté passe par-dessus celle du milieu : elles échangent leur place.
    [order[pos], order[1]] = [order[1], order[pos]];
    swap = { from: pos, t: 0 };
    crossings++;
    const sec = sections[cur];
    sec.done = crossings / CROSS;
    fx.burst(SLOT_X[1], braidEnd(), '✨', 2, { speed: 60, size: 14 });
    if (crossings >= CROSS) {
      fx.text(LOUPE.x + LOUPE.w / 2, TOP_Y + CROSS * STEP + 34, t('mg_braid_done'), '#2f8a5f', 20);
      fx.burst(sec.bottom.x, sec.bottom.y, '✨', 3, { speed: 70, size: 14 });
      cur++;
      crossings = 0;
      order = [0, 1, 2];
      swap = null; // nouvelle tresse : trois mèches bien en place
      if (cur >= sections.length) {
        phase = 'color';
        ctx.hint(t('mg_braid_color'), 'good');
        colorButtons(ctx, (key) => {
          color = key;
          phase = 'ribbons';
          ctx.hint(t('mg_braid_ribbons'));
        });
      } else ctx.hint(t(cur === sections.length - 1 ? 'mg_braid_tail' : 'mg_braid_next'), 'good');
    } else ctx.hint(t(expected() === 0 ? 'mg_braid_left' : 'mg_braid_right'));
    ctx.progress(progress());
  }

  function tieRibbon() {
    if (phase !== 'ribbons' || ctx.done) return;
    const sec = sections[tie];
    if (!sec) return;
    sec.ribbon = true;
    tie++;
    bounce = 0.5;
    fx.burst(LOUPE.x + LOUPE.w / 2, TOP_Y + CROSS * STEP + 6, '🎀', 3, { speed: 70, size: 16 });
    fx.float(sec.bottom.x, sec.bottom.y - 10, '💕', 18);
    ctx.progress(progress());
    if (sections.every((x) => x.ribbon)) {
      const share = 1 - wrong / Math.max(1, total);
      ctx.finish(0.6 + 0.4 * clamp(share), t('mg_braid_end', { name: a.name, g: a.sex }));
      fx.text(200, 110, t(wrong ? 'mg_good' : 'mg_perfect'), '#2f8a5f', 28);
    }
  }

  /** La loupe : le cou de près, la tresse déjà faite, les trois mèches (celle à toucher brille). */
  function drawLoupe(g) {
    const L = LOUPE;
    g.save();
    // Cadre
    g.fillStyle = 'rgba(0,0,0,0.12)';
    rrect(g, L.x + 3, L.y + 5, L.w, L.h, 22);
    g.fill();
    g.fillStyle = css(coat);
    rrect(g, L.x, L.y, L.w, L.h, 22);
    g.fill();
    g.save();
    rrect(g, L.x, L.y, L.w, L.h, 22);
    g.clip();
    // Le dessus de l'encolure et la racine de la crinière
    g.fillStyle = shade(coat, 0.12);
    ellipse(g, L.x + L.w / 2, L.y - 30, L.w * 0.9, 70);
    g.fill();
    g.fillStyle = css(mane);
    rrect(g, L.x + 18, L.y + 10, L.w - 36, 34, 14);
    g.fill();
    const showSec = phase === 'braid' ? sections[cur] : sections[Math.min(tie, sections.length - 1)];
    const k = phase === 'braid' ? crossings : CROSS;
    const endY = TOP_Y + k * STEP;
    // La partie déjà tressée (au milieu)
    if (k > 0) drawBraid(g, { x: SLOT_X[1], y: TOP_Y - 8 }, { x: SLOT_X[1], y: endY }, 40, mane, 1);
    if (phase === 'braid') {
      // Les trois mèches qui pendent, chacune d'une nuance (on les reconnaît quand elles changent de place)
      const want = expected();
      for (let pos = 0; pos < 3; pos++) {
        const id = order[pos];
        // Nuances bien différentes, même pour une crinière noire (sinon on ne les reconnaît pas).
        const col = shade(mane, [0.12, 0.32, 0.52][id]);
        let x = SLOT_X[pos];
        if (swap && swap.t < 1 && (pos === swap.from || pos === 1)) x = lerp(pos === 1 ? SLOT_X[swap.from] : SLOT_X[1], x, swap.t);
        const glow = pos === want && !ctx.done;
        g.lineCap = 'round';
        if (glow) {
          g.strokeStyle = `rgba(255, 210, 58, ${0.55 + Math.sin(ctx.time * 6) * 0.3})`;
          g.lineWidth = STRAND_W + 12;
          strandPath(g, x, endY);
          g.stroke();
        }
        g.strokeStyle = shade(mane, -0.4);
        g.lineWidth = STRAND_W + 4;
        strandPath(g, x, endY);
        g.stroke();
        g.strokeStyle = col;
        g.lineWidth = STRAND_W;
        strandPath(g, x, endY);
        g.stroke();
        // reflets de crins
        g.strokeStyle = 'rgba(255,255,255,0.18)';
        g.lineWidth = 3;
        strandPath(g, x - 7, endY);
        g.stroke();
        // Un élastique de couleur au bout de chaque mèche : on la suit quand elle change de place.
        g.fillStyle = BEADS[id];
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2.5;
        circle(g, x, BOTTOM_Y - 2, 9);
        g.fill();
        g.stroke();
      }
      const hx = SLOT_X[want];
      emoji(g, '👆', hx + 4, BOTTOM_Y - 34 + Math.sin(ctx.time * 5) * 4, 26);
      // une petite flèche : de ce côté vers le milieu
      label(g, want === 0 ? '➜' : '⬅', SLOT_X[1] + (want === 0 ? -24 : 24), endY + 44, 22, '#ffffff');
    } else {
      // Tresse finie, avec son élastique ; le ruban apparaît quand on le noue.
      const done = showSec?.ribbon;
      if (done || phase === 'ribbons') {
        const bx = SLOT_X[1];
        const by = endY + 6;
        if (done || tie > 0) drawBow(g, bx, by, 26 * (1 + bounce * 0.4), RIBBON_COLORS[color] ?? RIBBON_COLORS.red, 'plain', -0.15);
        if (phase === 'ribbons' && !done) {
          g.globalAlpha = 0.55 + Math.sin(ctx.time * 5) * 0.3;
          g.strokeStyle = '#fff';
          g.lineWidth = 4;
          g.setLineDash([7, 7]);
          circle(g, bx, by, 34);
          g.stroke();
          g.setLineDash([]);
          g.globalAlpha = 1;
          emoji(g, '🎀', bx, by, 28, 0, 0.7);
          emoji(g, '👆', bx + 30, by + 34 + Math.sin(ctx.time * 5) * 4, 26);
        }
      }
    }
    g.restore();
    g.strokeStyle = '#fff';
    g.lineWidth = 5;
    rrect(g, L.x, L.y, L.w, L.h, 22);
    g.stroke();
    g.strokeStyle = '#e8c86a';
    g.lineWidth = 2;
    rrect(g, L.x - 3, L.y - 3, L.w + 6, L.h + 6, 24);
    g.stroke();
    emoji(g, '🔍', L.x + L.w - 14, L.y + 12, 22);
    g.restore();
  }

  /** Une mèche : de la fin de la tresse (au milieu) vers sa place, puis tout droit jusqu'en bas. */
  function strandPath(g, x, endY) {
    g.beginPath();
    g.moveTo(SLOT_X[1] + (x - SLOT_X[1]) * 0.25, endY);
    g.quadraticCurveTo(x, endY + 6, x, endY + 40);
    g.lineTo(x, BOTTOM_Y);
  }

  return {
    peek: () => ({
      phase,
      color,
      cur,
      crossings,
      sections: sections.length,
      next: phase === 'braid' ? { x: SLOT_X[expected()], y: (braidEnd() + 40 + BOTTOM_Y) / 2 } : null,
      wrongPoint: phase === 'braid' ? { x: SLOT_X[1], y: (braidEnd() + 40 + BOTTOM_Y) / 2 } : null,
      tie: phase === 'ribbons' ? { x: LOUPE.x + LOUPE.w / 2, y: TOP_Y + CROSS * STEP + 6 } : null,
      ribbonsLeft: sections.filter((x) => !x.ribbon).length,
      wrong,
      total,
    }),
    down(p) {
      if (phase === 'braid') pick(strandAt(p));
      else if (phase === 'ribbons') {
        const inLoupe = p.x >= LOUPE.x && p.x <= LOUPE.x + LOUPE.w && p.y >= LOUPE.y && p.y <= LOUPE.y + LOUPE.h;
        const onHorse = dist(p.x, p.y, sh.bx, sh.by) < sh.rx * 1.6;
        if (inLoupe || onHorse) tieRibbon();
      }
    },
    key(code, down) {
      if (!down) return;
      if (phase === 'braid') {
        if (code === 'ArrowLeft') pick(0);
        else if (code === 'ArrowRight') pick(2);
        else if (code === 'ArrowUp' || code === 'ArrowDown') pick(1);
        else if (isGo(code)) pick(expected());
      } else if (phase === 'ribbons' && isGo(code)) tieRibbon();
    },
    update(dt) {
      shake = Math.max(0, shake - dt);
      bounce = Math.max(0, bounce - dt);
      if (swap) {
        swap.t += dt * 5;
        if (swap.t >= 1) swap = null;
      }
    },
    draw(g) {
      ringBackground(g, ctx, floorY);
      drawAnimal(g, a, { x: fit.x, y: floorY, s, f: 1, happy: phase !== 'braid' || cur > 0, shake: shake > 0 ? 1 : 0 });
      sections.forEach((sec, i) => {
        if (sec.done > 0) drawBraid(g, sec.top, sec.bottom, 9 * s, mane, sec.done);
        if (sec.ribbon) drawBow(g, sec.bottom.x, sec.bottom.y, 8 * s, RIBBON_COLORS[color] ?? RIBBON_COLORS.red, 'plain', -0.2);
        const focus = (phase === 'braid' && i === cur) || (phase === 'ribbons' && i === tie);
        if (focus) {
          // La partie de la crinière montrée dans la loupe
          const mx = (sec.top.x + sec.bottom.x) / 2;
          const my = (sec.top.y + sec.bottom.y) / 2;
          g.save();
          g.globalAlpha = 0.6 + Math.sin(ctx.time * 5) * 0.3;
          g.strokeStyle = '#ffd23a';
          g.lineWidth = 3;
          circle(g, mx, my, 16 * Math.max(0.8, s));
          g.stroke();
          g.globalAlpha = 0.35;
          g.setLineDash([5, 6]);
          g.beginPath();
          g.moveTo(mx + 16 * s, my);
          g.lineTo(LOUPE.x, LOUPE.y + LOUPE.h * 0.4);
          g.stroke();
          g.restore();
        }
      });
      if (bounce > 0) emoji(g, '💖', sh.head.x, sh.head.y - sh.hr * 2.2, 22, 0, bounce * 2);
      drawLoupe(g);
    },
  };
}

// ---------------------------------------------------------------- lustrer la robe (et huiler les sabots)

/**
 * Lustrer : passer le chiffon partout (la jauge monte avec la part de la robe qui brille), huiler
 * les deux sabots (cheval), puis ✅. Juste : 0,9 à 1,08. Frotter encore une robe qui brille déjà
 * met trop de lustrant (ça colle : la jauge dépasse, jusqu'à 1,4).
 */
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
  const horse = a.species === 'horse';
  const hooves = horse ? [
    { x: sh.bx + sh.rx * 0.62, y: floorY - 7 * s, done: false },
    { x: sh.bx - sh.rx * 0.62, y: floorY - 7 * s, done: false },
  ] : [];
  const LO = 0.9;
  const HI = 1.08;
  const MAX = 1.4;
  const COAT_SHARE = horse ? 0.85 : 1; // le cheval : 15 % pour les sabots huilés
  let last = null;
  let sparkle = 0;
  let state = 'low';
  ctx.zone(LO / MAX, HI / MAX);

  ctx.hint(t(horse ? 'mg_shine_hintHorse' : 'mg_shine_hint'));

  const coverage = () => cells.reduce((acc, c) => acc + Math.min(1, c.v), 0) / Math.max(1, cells.length);
  // Trop de lustrant : au-delà de 2,5 (deux bons passages partout, avec ceux des rangées voisines), ça colle.
  const OVER_AT = 2.5;
  const over = () => cells.reduce((acc, c) => acc + Math.max(0, c.v - OVER_AT), 0) / Math.max(1, cells.length) * 0.25;
  const hoofPart = () => (hooves.length ? (hooves.filter((h) => h.done).length / hooves.length) * (1 - COAT_SHARE) : 0);
  const value = () => Math.min(MAX, coverage() * COAT_SHARE + hoofPart() + over());

  const stop = () => {
    if (ctx.done) return;
    if (hooves.some((h) => !h.done) && coverage() > 0.6) ctx.hint(t('mg_shine_hooves'), 'warn');
    ctx.finishJust(value(), LO, HI, {
      who: a,
      slack: 0.3,
      msgs: { just: t('mg_shine_end', { name: a.name }), low: t('mg_shine_low', { name: a.name }), high: t('mg_shine_high', { name: a.name }) },
    });
    if (state === 'just') fx.text(200, 110, t('mg_perfect'), '#2f8a5f', 28);
  };
  ctx.stopButton(stop);

  function show() {
    const v = value();
    ctx.progress(v / MAX);
    const st = v < LO ? 'low' : v > HI ? 'high' : 'just';
    if (st !== state) {
      state = st;
      if (st === 'just') ctx.hint(t('mg_shine_stop'), 'good');
      else if (st === 'high') ctx.hint(t('mg_shine_spread'), 'warn');
    }
    if (v >= MAX) stop();
  }

  function rub(p) {
    if (!last) { last = p; return; }
    const d = dist(last.x, last.y, p.x, p.y);
    if (d < 1) return;
    let touched = false;
    for (const c of cells) {
      if (dist(c.x, c.y, p.x, p.y) > step * 0.9) continue;
      touched = true;
      c.v += d * 0.012;
    }
    if (touched && Math.random() < 0.4) fx.dot(p.x + (Math.random() - 0.5) * 16, p.y + (Math.random() - 0.5) * 16, 'rgba(255,255,255,0.9)', 2 + Math.random() * 2, { life: 0.5 });
    if (state === 'low' && coverage() > 0.5 && coverage() < 0.85) ctx.hint(t('mg_shine_good'), 'good');
    last = p;
    show();
  }

  return {
    peek: () => ({
      value: value(), lo: LO, hi: HI, max: MAX, coverage: coverage(), over: over(),
      cells: cells.filter((c) => c.v < 1).map((c) => ({ x: c.x, y: c.y })),
      hooves: hooves.filter((h) => !h.done).map((h) => ({ x: h.x, y: h.y })),
      body: { x: sh.bx, y: sh.by, rx: sh.rx, ry: sh.ry },
    }),
    down(p) {
      last = p;
      for (const hv of hooves) {
        if (!hv.done && dist(p.x, p.y, hv.x, hv.y) < 24 * Math.max(1, s)) {
          hv.done = true;
          fx.burst(hv.x, hv.y - 6, '✨', 4, { speed: 70, size: 14 });
          show();
        }
      }
    },
    move(p, down) { if (down) rub(p); },
    up() { last = null; },
    key(code, down) { if (down && isGo(code)) stop(); },
    update(dt) { sparkle += dt; },
    draw(g) {
      ringBackground(g, ctx, floorY);
      drawAnimal(g, a, { x: fit.x, y: floorY, s, f: 1, happy: state === 'just' || coverage() > 0.4, earsBack: state === 'high' });
      // Le brillant : des taches claires là où on a lustré ; trop de lustrant : des traces jaunes qui collent
      for (const c of cells) {
        if (c.v <= 0) continue;
        g.save();
        g.globalAlpha = Math.min(0.55, c.v * 0.4);
        g.fillStyle = '#ffffff';
        ellipse(g, c.x, c.y, step * 0.55, step * 0.42, -0.3);
        g.fill();
        if (c.v > OVER_AT) {
          g.globalAlpha = Math.min(0.5, (c.v - OVER_AT) * 0.4);
          g.fillStyle = '#f2d36b';
          ellipse(g, c.x + 3, c.y + 2, step * 0.4, step * 0.28, 0.4);
          g.fill();
        }
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
        circle(g, hv.x, hv.y, 20 * Math.max(1, s));
        g.stroke();
        g.restore();
        emoji(g, '🧴', hv.x, hv.y - 30, 22);
      }
      if (state === 'just' || (ctx.done && state !== 'high')) {
        for (let i = 0; i < 5; i++) {
          const p = sh.L(Math.cos(sparkle * 2 + i * 1.3) * sh.rx * 0.65, Math.sin(sparkle * 3 + i) * sh.ry * 0.5);
          emoji(g, '✨', p.x, p.y, 18, 0, 0.85);
        }
      }
      const pp = ctx.pointer;
      if ((pp.over || pp.down) && !ctx.done) emoji(g, '🧽', pp.x, pp.y - 8, 34);
    },
  };
}

// ---------------------------------------------------------------- nœud ou bandana

/**
 * Le nœud : choisir la couleur, puis le motif, le faire glisser jusqu'au cou, et le serrer en
 * gardant le doigt posé (ou Espace) : juste ce qu'il faut (bande verte). Lâche : il glisse ;
 * trop serré : l'animal est gêné.
 */
export function bowGame(ctx) {
  const { a, t, fx } = ctx;
  ctx.opts = ctx.opts ?? {};
  const floorY = 305;
  const fit = fitAnimal(a, { groundY: floorY, maxW: 320, maxH: 240 });
  const sh = animalShape(a, { x: fit.x, y: floorY, s: fit.s, f: 1 });
  const s = fit.s;
  const target = { x: sh.neck.x + (a.species === 'rabbit' || a.species === 'cat' ? 0 : 4 * s), y: sh.neck.y + 6 * s };
  const LO = 0.7;
  const HI = 0.95;
  const MAX = 1.4;
  const RATE = 0.5; // serrage par seconde
  let color = null;
  let pattern = null;
  let phase = 'color'; // color | pattern | place | tighten
  const bow = { x: 70, y: 110, drag: false, placed: false };
  let tension = 0;
  let pulling = false;
  let pulled = false; // on a déjà serré une fois (le relâcher finit le jeu)
  let pulse = 0;
  let state = 'low';

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
        },
      });
    }
  });

  function place(accurate = true) {
    bow.placed = true;
    bow.drag = false;
    bow.x = target.x;
    bow.y = target.y;
    phase = 'tighten';
    ctx.zone(LO / MAX, HI / MAX);
    ctx.progress(0);
    ctx.hint(t('mg_bow_tighten'), accurate ? 'good' : '');
    fx.burst(target.x, target.y, '✨', 4, { speed: 70, size: 14 });
    // Un gros bouton à tenir, en plus du doigt posé sur l'écran.
    ctx.button(`🎀 ${t('mg_bow_pull')}`, { cls: 'primary', hold: true, onDown: () => startPull(), onUp: () => endPull() });
  }

  function startPull() {
    if (phase !== 'tighten' || ctx.done) return;
    pulling = true;
  }

  function endPull() {
    if (!pulling) return;
    pulling = false;
    if (!pulled || ctx.done) return;
    const r = ctx.finishJust(tension, LO, HI, {
      who: a,
      slack: 0.3,
      msgs: { just: t('mg_bow_end', { name: a.name }), low: t('mg_bow_loose', { name: a.name }), high: t('mg_bow_tight', { name: a.name, g: a.sex }) },
    });
    fx.float(target.x, target.y - 10, r.verdict === 'just' ? '💖' : r.verdict === 'high' ? '😣' : '💨', 24);
  }

  return {
    peek: () => ({ phase, bow: { x: bow.x, y: bow.y }, target, tension, lo: LO, hi: HI, max: MAX, pulling }),
    down(p) {
      if (phase === 'place') {
        if (dist(p.x, p.y, bow.x, bow.y) < 40) bow.drag = true;
        else if (dist(p.x, p.y, target.x, target.y) < 34 * Math.max(1, s)) ctx.hint(t('mg_bow_place'), '');
      } else if (phase === 'tighten') startPull();
    },
    move(p, down) {
      if (bow.drag && down) {
        bow.x = p.x;
        bow.y = p.y;
      }
    },
    up(p) {
      if (phase === 'tighten') return endPull();
      if (!bow.drag) return;
      bow.drag = false;
      if (dist(p.x, p.y, target.x, target.y) < 38 * Math.max(1, s)) place();
      else ctx.hint(t('mg_bow_miss'), 'warn');
    },
    key(code, down) {
      if (!isGo(code)) return;
      if (phase === 'place' && down) place(false);
      else if (phase === 'tighten') (down ? startPull() : endPull());
    },
    update(dt) {
      pulse = Math.max(0, pulse - dt);
      if (pulling && phase === 'tighten' && !ctx.done) {
        tension = Math.min(MAX, tension + RATE * dt);
        pulled = true;
        ctx.progress(tension / MAX, { live: true }); // (en direct : on lâche quand la jauge est dans le vert)
        const st = tension < LO ? 'low' : tension > HI ? 'high' : 'just';
        if (st !== state) {
          state = st;
          if (st === 'just') ctx.hint(t('mg_bow_letGo'), 'good');
          else if (st === 'high') ctx.hint(t('mg_bow_tooTight', { name: a.name }), 'warn');
        }
        if (Math.random() < dt * 6) pulse = 0.25;
        if (tension >= MAX) endPull();
      }
    },
    draw(g) {
      fillView(g, ctx.view, '#fbeff5', '#f3dde8');
      g.fillStyle = '#e9c9d8';
      g.fillRect(ctx.view.x0, floorY, ctx.view.w, ctx.view.y1 - floorY);
      const tight = phase === 'tighten' && state === 'high';
      drawAnimal(g, a, { x: fit.x, y: floorY, s, f: 1, happy: (phase === 'tighten' && state === 'just') || (ctx.done && state === 'just'), wag: ctx.done && state === 'just', earsBack: tight, shake: tight && pulling ? 0.4 : 0 });
      if (phase === 'color' || phase === 'pattern') {
        if (color) drawBow(g, 200, 120, 46 + Math.sin(ctx.time * 3) * 3, RIBBON_COLORS[color], pattern ?? 'plain', 0);
        else emoji(g, '🎀', 200, 120, 64 + Math.sin(ctx.time * 3) * 4);
        return;
      }
      if (phase === 'place') {
        g.save();
        g.globalAlpha = 0.5 + Math.sin(ctx.time * 5) * 0.3;
        g.strokeStyle = '#fff';
        g.lineWidth = 3;
        g.setLineDash([6, 6]);
        circle(g, target.x, target.y, 26 * Math.max(1, s));
        g.stroke();
        g.restore();
      }
      // Serrer : le nœud rapetisse un peu et les pans se tendent
      const squeeze = phase === 'tighten' ? 1 - Math.min(0.25, tension * 0.18) : 1;
      const size = (phase === 'place' ? 24 : 18 * Math.max(1, s)) * squeeze * (1 + pulse * 0.4);
      drawBow(g, bow.x, bow.y, size, RIBBON_COLORS[color] ?? RIBBON_COLORS.red, pattern ?? 'plain', bow.placed ? -0.15 : Math.sin(ctx.time * 2) * 0.15);
      if (phase === 'place' && !bow.drag) emoji(g, '👆', bow.x + 24, bow.y + 28 + Math.sin(ctx.time * 4) * 3, 24);
      if (phase === 'tighten' && !ctx.done && !pulling) emoji(g, '👆', target.x + 26, target.y + 30 + Math.sin(ctx.time * 4) * 3, 24);
      if (phase === 'tighten' && state === 'just' && !ctx.done) label(g, '✓', target.x, target.y - 34 * Math.max(1, s), 26, '#2f8a5f');
    },
  };
}

// ---------------------------------------------------------------- pouffer la laine / le poil

/**
 * Gonfler le poil : tapoter en rythme, quand le cercle devient vert (8 fois). La note suit les
 * tapes bien en rythme. Espace ou Entrée tapotent aussi.
 */
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
  const sh = animalShape(a, { x: fit.x, y: floorY, s, f: 1 });

  ctx.hint(t('mg_fluff_hint'));

  function pat(p) {
    if (ctx.done) return;
    taps++;
    const quality = Math.max(0, 1 - Math.abs(beat - 0.8) / 0.35);
    if (quality > 0.3) {
      good++;
      puff = Math.min(1, puff + 0.14);
      fx.burst(p.x, p.y, quality > 0.8 ? '✨' : '☁️', 3, { speed: 60, size: 16 });
      fx.text(p.x, p.y - 30, t(quality > 0.8 ? 'mg_perfect' : 'mg_good'), '#2f8a5f', 18);
    } else {
      fx.text(p.x, p.y - 30, t('mg_fluff_early'), '#c07a10', 18);
    }
    beat = 0;
    ctx.progress(taps / TOTAL);
    if (taps >= TOTAL) ctx.finish(0.5 + 0.5 * (good / TOTAL), t('mg_fluff_end', { name: a.name }));
  }

  return {
    peek: () => ({ beat, taps, good, total: TOTAL, body: { x: sh.bx, y: sh.by, rx: sh.rx, ry: sh.ry } }),
    down(p) {
      const onBody = dist(p.x, p.y, sh.bx, sh.by) < Math.max(sh.rx, sh.ry) * 1.3;
      if (onBody) pat(p);
    },
    key(code, down) { if (down && isGo(code)) pat({ x: sh.bx, y: sh.by }); },
    update(dt) {
      if (ctx.done) return;
      beat = Math.min(1, beat + dt * 0.75);
      if (beat >= 1) beat = 0; // trop tard : on repart
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
