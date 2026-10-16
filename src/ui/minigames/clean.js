// Mini-jeu « nettoyer » : curer le box (cheval), l'étable (vache), le clapier (lapin)
// ou changer la litière (chat). 1) Mettre les saletés dans la brouette. 2) Étaler du propre.
// Sert aussi à la corvée « curer le box » (chores.js) : sans animal, à la fourche, sans la 2e étape.
//
// Règle « juste ce qu'il faut » (score.js) :
// - étaler : une couche de paille (ou de litière) partout, ni clairsemée ni en tas. La quantité
//   juste est le nombre moyen de couches (chaque passage du doigt pose une couche) ; la zone
//   verte est sur la jauge et sur la petite jauge au mur ; on s'arrête avec « C'est bon ! ».
// - curer (corvée) : tout le crottin dans la brouette, mais pas la paille propre qui traîne
//   (la jeter, c'est trop).

import { rrect, ellipse, circle, emoji, label, fillView, dist, distToSegment } from './draw.js';

const SCENES = {
  horse: { floor: '#c8a964', dirty: '#9b7d45', fresh: '#f3d86b', heap: '#dcb447', wall: '#9a6740', bin: 'barrow', item: 'manure', n: 6 },
  cow: { floor: '#b9ab8e', dirty: '#8d7d60', fresh: '#f3d86b', heap: '#dcb447', wall: '#8a5d3a', bin: 'barrow', item: 'manure', n: 7 },
  rabbit: { floor: '#d9c27a', dirty: '#a8945a', fresh: '#f3dc7e', heap: '#e0c45a', wall: '#b88a55', bin: 'bucket', item: 'droppings', n: 6 },
  cat: { floor: '#c9c3b8', dirty: '#a49d90', fresh: '#efe9dc', heap: '#dcd3c2', wall: '#cfe6f2', bin: 'bag', item: 'clump', n: 6 },
};

/** Zone juste du tapis de paille : au moins 0,85 couche, au plus 1,25 ; à 1,6 c'est des tas partout. */
export const SPREAD_ZONE = { lo: 0.85, hi: 1.25, max: 1.6 };

/** Mur de planches du box (ou de l'étable), du haut de la vue jusqu'au sol. */
export function drawBoxWall(g, v, wall, floorY, floorColor) {
  fillView(g, v, wall, wall);
  g.strokeStyle = 'rgba(60, 35, 15, 0.35)';
  g.lineWidth = 3;
  for (let x = Math.floor(v.x0 / 40) * 40; x < v.x1; x += 40) { g.beginPath(); g.moveTo(x, v.y0); g.lineTo(x, floorY); g.stroke(); }
  g.fillStyle = floorColor;
  g.fillRect(v.x0, floorY, v.w, v.y1 - floorY);
}

/**
 * Petite jauge « juste ce qu'il faut » dessinée dans la scène (même sens que la jauge du cadre) :
 * fond blanc, bande verte entre lo et hi (fractions 0–1) avec son ✓, remplissage bleu jusqu'à k.
 * Verticale (elle monte) si h > w, horizontale (vers la droite) sinon.
 */
export function drawMiniGauge(g, x, y, w, h, k, lo, hi) {
  const vert = h > w;
  const kk = Math.max(0, Math.min(1, k));
  g.save();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  rrect(g, x - 3, y - 3, w + 6, h + 6, 8);
  g.fill();
  g.fillStyle = '#e9e3d6';
  rrect(g, x, y, w, h, 6);
  g.fill();
  // zone verte
  g.fillStyle = 'rgba(63,174,98,0.55)';
  g.strokeStyle = '#1e8a4a';
  g.lineWidth = 2;
  if (vert) {
    const y1 = y + h - hi * h;
    rrect(g, x - 2, y1, w + 4, (hi - lo) * h, 4);
  } else {
    rrect(g, x + lo * w, y - 2, (hi - lo) * w, h + 4, 4);
  }
  g.fill();
  g.stroke();
  // remplissage
  g.fillStyle = '#3c7bd9';
  if (kk > 0) {
    if (vert) rrect(g, x + 2, y + h - kk * h, w - 4, kk * h, 4);
    else rrect(g, x, y + 2, kk * w, h - 4, 4);
    g.fill();
  }
  const mid = (lo + hi) / 2;
  if (vert) label(g, '✓', x + w + 12, y + h - mid * h, 16, '#1e5c3e');
  else label(g, '✓', x + mid * w, y - 12, 16, '#1e5c3e');
  g.restore();
}

/**
 * o (facultatif, pour les corvées) : species (décor si pas d'animal), n (nombre de saletés),
 * decoys (touffes de paille propre à ne PAS jeter), spread (false : on s'arrête quand tout le
 * crottin est dans la brouette), tool(g, x, y) (outil dessiné sous le doigt), hint (consigne
 * de départ).
 */
export function cleanGame(ctx, o = {}) {
  const { a, t, fx } = ctx;
  const species = o.species ?? a?.species;
  const sc = SCENES[species] ?? SCENES.horse;
  const cat = species === 'cat';
  const withSpread = o.spread ?? true;
  const who = a?.name;
  // Zone du sol (la litière pour le chat)
  const floor = cat ? { x: 30, y: 110, w: 290, h: 210 } : { x: 14, y: 96, w: 312, h: 246 };
  const bin = { x: 362, y: 250 };
  const items = [];
  const nDirt = o.n ?? sc.n;
  const nDecoys = o.decoys ?? 0;
  let tries = 0;
  while (items.length < nDirt + nDecoys && tries < 600) {
    tries++;
    const x = floor.x + 30 + ctx.rng() * (floor.w - 60);
    const y = floor.y + 30 + ctx.rng() * (floor.h - 60);
    if (items.some((it) => dist(it.x, it.y, x, y) < 58)) continue;
    items.push({ x, y, state: 'floor', k: 0, seed: ctx.rng() * 6, sx: 0, sy: 0, good: items.length >= nDirt });
  }
  const step = 36;
  const cells = [];
  for (let y = floor.y + step / 2; y < floor.y + floor.h; y += step) {
    for (let x = floor.x + step / 2; x < floor.x + floor.w; x += step) cells.push({ x, y, n: 0, k: ctx.rng(), hit: false });
  }
  let phase = 'pick';
  let held = null;
  let downAt = null;
  let last = null;
  let inBin = 0; // tout ce qui est dans la brouette (crottin et paille propre)
  let dirtInBin = 0;
  let zoneState = '';

  ctx.hint(o.hint ?? t(cat ? 'mg_clean_hint_cat' : 'mg_clean_hint'));
  /** Part de la barre réservée au ramassage (tout, s'il n'y a pas de 2e étape). */
  const pickShare = withSpread ? 0.35 : 1;
  // Corvée : la quantité juste, c'est tout le crottin (nDirt) et rien d'autre. Jauge jusqu'à
  // nDirt + 3 : chaque touffe de paille propre jetée pousse la jauge au-delà du vert.
  const PICK = { lo: nDirt - 0.5, hi: nDirt + 0.5, max: nDirt + 3 };
  const Z = SPREAD_ZONE;
  const zoneOf = (lo, hi) => (withSpread ? [pickShare + (1 - pickShare) * (lo / Z.max), pickShare + (1 - pickShare) * (hi / Z.max)] : [lo / PICK.max, hi / PICK.max]);
  ctx.zone(...(withSpread ? zoneOf(Z.lo, Z.hi) : zoneOf(PICK.lo, PICK.hi)));

  /** Couches de paille posées, en moyenne (0 = rien, 1 = une couche partout, 2 = des tas). */
  const layers = () => cells.reduce((s, c) => s + c.n, 0) / cells.length;
  const covered = () => cells.filter((c) => c.n > 0).length / cells.length;
  const onFloor = (p) => p.x > floor.x - 6 && p.x < floor.x + floor.w + 6 && p.y > floor.y - 6 && p.y < floor.y + floor.h + 6;

  function toBin(it) {
    it.state = 'fly';
    it.k = 0;
    it.sx = it.x;
    it.sy = it.y;
  }

  /** Fin de la 2e étape : tous les points dans la zone verte, un peu moins si trop peu ou trop. */
  function endSpread() {
    if (ctx.done) return;
    const { verdict } = ctx.finishJust(layers(), Z.lo, Z.hi, { who });
    const cx = floor.x + floor.w / 2;
    const cy = floor.y + floor.h / 2;
    if (verdict === 'just') {
      fx.burst(cx, cy, '✨', 8, { speed: 160 });
      fx.text(cx, cy - 20, t('mg_perfect'), '#2f8a5f', 26);
    } else if (verdict === 'low') fx.text(cx, cy - 20, t('mg_more_short'), '#c07a10', 26);
    else fx.text(cx, cy - 20, t('mg_oops'), '#c8463c', 26);
  }

  /** Fin de la corvée : tout le crottin est dans la brouette ; la paille propre jetée, c'est trop. */
  function endPick() {
    if (ctx.done) return;
    phase = 'done';
    const { verdict } = ctx.finishJust(inBin, PICK.lo, PICK.hi, { who, slack: 1.5 });
    const cx = floor.x + floor.w / 2;
    const cy = floor.y + floor.h / 2;
    fx.burst(cx, cy, '✨', 8, { speed: 160 });
    if (verdict === 'just') fx.text(cx, cy - 20, t('mg_perfect'), '#2f8a5f', 26);
    else fx.text(cx, cy - 20, t('mg_oops'), '#c8463c', 26);
  }

  function spread(p) {
    if (!last) { last = p; return; }
    // Les couches (et donc les tas) ne se posent qu'en glissant sur le sol ; en arrivant du
    // bord, on ne fait que boucher des trous.
    const inside = onFloor(p) && onFloor(last);
    let any = false;
    for (const c of cells) {
      if (c.hit) continue; // une couche par passage (on lève le doigt pour en remettre)
      const d = distToSegment(c.x, c.y, last.x, last.y, p.x, p.y);
      // Le cœur de la brassée (18 px) pose une couche ; le bord (jusqu'à 32 px) ne fait que
      // boucher les trous, pour que deux passages voisins ne fassent pas des tas.
      if ((d < 18 && inside) || (d < 32 && c.n === 0)) {
        c.n++;
        c.hit = true;
        any = true;
      }
    }
    if (any && Math.random() < 0.6) fx.dot(p.x, p.y, sc.fresh, 3, { vx: (Math.random() - 0.5) * 80, vy: -40, grav: 300, life: 0.5 });
    last = p;
    const v = layers();
    ctx.progress(pickShare + (1 - pickShare) * Math.min(1, v / Z.max));
    const zs = v > Z.hi ? 'over' : v >= Z.lo ? 'in' : '';
    if (zs !== zoneState) {
      zoneState = zs;
      if (zs === 'in') { ctx.hint(t('mg_nowStop'), 'good'); fx.text(200, 80, t('mg_good'), '#2f8a5f', 26); }
      else if (zs === 'over') ctx.hint(t('mg_stop'), 'warn');
    }
    // Des tas partout : c'est trop, et c'est fini.
    if (v >= Z.max) endSpread();
  }

  return {
    peek: () => ({
      phase,
      items: items.filter((x) => x.state === 'floor').map((x) => ({ x: x.x, y: x.y, good: x.good })),
      floor,
      bin,
      inBin,
      dirtInBin,
      nDirt,
      covered: covered(),
      value: withSpread ? layers() : inBin,
      lo: withSpread ? Z.lo : PICK.lo,
      hi: withSpread ? Z.hi : PICK.hi,
      max: withSpread ? Z.max : PICK.max,
    }),
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
      for (const c of cells) c.hit = false;
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
          if (it.good) {
            // De la paille propre à la brouette : c'est du gaspillage (trop).
            fx.text(bin.x, bin.y - 70, t('mg_oops'), '#c07a10', 22);
            fx.burst(bin.x, bin.y - 30, '🌾', 4, { speed: 90, size: 16, life: 0.6 });
          } else {
            dirtInBin++;
            fx.text(bin.x, bin.y - 70, t('mg_hop'), '#2f8a5f', 20);
          }
          ctx.progress(withSpread ? pickShare * (dirtInBin / nDirt) : inBin / PICK.max);
          if (dirtInBin === nDirt && phase === 'pick') {
            if (!withSpread) endPick();
            else {
              phase = 'spread';
              ctx.hint(t(cat ? 'mg_clean_spread_cat' : 'mg_clean_spread'), 'good');
              fx.text(200, 80, t('mg_good'), '#2f8a5f', 26);
              ctx.stopButton(() => endSpread());
            }
          }
        }
      }
    },
    draw(g) {
      const v = ctx.view;
      if (!cat) drawBoxWall(g, v, sc.wall, floor.y, sc.dirty);
      else {
        fillView(g, v, sc.wall, sc.wall);
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
        if (c.n === 0) {
          if (c.k < 0.12 && !cat) {
            g.fillStyle = 'rgba(80, 60, 30, 0.14)';
            ellipse(g, c.x, c.y, 16, 10, c.k * 6);
            g.fill();
          }
          continue;
        }
        g.fillStyle = sc.fresh;
        g.fillRect(c.x - step / 2 - 1, c.y - step / 2 - 1, step + 2, step + 2);
        if (c.n >= 2) {
          // un tas : plus épais, plus foncé
          g.fillStyle = sc.heap;
          ellipse(g, c.x, c.y, 17 + Math.min(3, c.n), 12, c.k);
          g.fill();
        }
      }
      // brins / grains
      for (const c of cells) {
        g.strokeStyle = c.n > 0 ? (cat ? 'rgba(200,190,170,0.7)' : c.n >= 2 ? '#b8902e' : '#d9b84a') : 'rgba(90, 70, 40, 0.45)';
        g.lineWidth = 2;
        const strands = c.n >= 2 ? 4 : 2;
        for (let i = 0; i < strands; i++) {
          const a0 = c.k * 9 + i * 2.1;
          const x = c.x + Math.cos(a0) * 10;
          const y = c.y + Math.sin(a0 * 1.3) * 10;
          g.beginPath();
          if (cat) { g.arc(x, y, 1.6, 0, Math.PI * 2); g.stroke(); } else { g.moveTo(x - 7, y); g.lineTo(x + 7, y + (i - 1) * 3); g.stroke(); }
        }
      }
      g.restore();
      // saletés (celle qu'on tient est dessinée en dernier, sur l'outil)
      for (const it of items) if (it.state !== 'bin' && it !== held) drawItem(g, it.good ? 'straw' : sc.item, it);
      // poubelle / brouette
      drawBin(g, sc.bin, bin, dirtInBin, nDirt);
      // l'animal qui attend (pas d'animal pour une corvée dans un box vide)
      if (ctx.sp) {
        g.fillStyle = 'rgba(255,255,255,0.85)';
        circle(g, 362, 48, 32);
        g.fill();
        emoji(g, ctx.sp.emoji, 362, 50, 38);
      }
      const labelY = ctx.sp ? 100 : 60;
      if (phase === 'pick') label(g, `${dirtInBin} / ${nDirt}`, 362, labelY, 18);
      else if (withSpread) {
        // Petite jauge au mur : la même zone verte que sur la jauge du cadre.
        const gy = labelY + 14;
        drawMiniGauge(g, 350, gy, 14, 186 - gy, layers() / Z.max, Z.lo / Z.max, Z.hi / Z.max);
        label(g, `${Math.round(layers() * 100)} %`, 362, 204, 15);
      }
      // outil
      const pp = ctx.pointer;
      if ((pp.over || pp.down) && !ctx.done) {
        if (phase === 'spread') emoji(g, cat ? '🥄' : '🌾', pp.x + 10, pp.y - 14, 34);
        else if (o.tool) o.tool(g, pp.x, pp.y + 6);
        else if (!held) emoji(g, cat ? '🥄' : '🧤', pp.x + 12, pp.y - 12, 30);
      }
      if (held) drawItem(g, held.good ? 'straw' : sc.item, held);
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
  if (kind === 'straw') {
    // touffe de paille propre (à laisser !)
    g.fillStyle = '#f3d86b';
    ellipse(g, x, y + 2, 20, 12, seed * 0.2);
    g.fill();
    g.strokeStyle = '#c9a23a';
    g.lineCap = 'round';
    g.lineWidth = 2.5;
    for (let i = 0; i < 6; i++) {
      const a0 = seed + i * 1.05;
      g.beginPath();
      g.moveTo(x + Math.cos(a0) * 4, y + Math.sin(a0) * 2);
      g.lineTo(x + Math.cos(a0) * 19, y + Math.sin(a0) * 11);
      g.stroke();
    }
  } else if (kind === 'manure') {
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
