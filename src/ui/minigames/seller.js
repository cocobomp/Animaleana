// Seller son cheval, comme au club : trois étapes, chacune avec son bon geste.
//
//   1. Le tapis : le poser sur le dos, juste derrière le garrot (trop en avant, il gêne les épaules ; trop en
//      arrière, il appuie sur les reins).
//   2. La selle : la poser sur le tapis, au même endroit.
//   3. La sangle : la serrer en deux fois. La première fois, le cheval gonfle le ventre (il retient sa
//      respiration) : la sangle se relâche, on attend, puis on resserre. Juste : ni lâche (la selle tournerait),
//      ni trop serrée (il couche les oreilles).
//
// Règle « juste ce qu'il faut » (score.js) à chaque étape ; ✅ passe à la suivante. La note finale est la moyenne,
// et le message de fin parle de l'étape la moins bien faite. On glisse le tapis et la selle avec le doigt (ou la
// souris) ; la sangle se serre en gardant le doigt sur le bouton 🪢 (ou sur le ventre du cheval, ou Espace).

import { drawAnimal, animalShape, fitAnimal, rrect, ellipse, circle, label, clamp, lerp, dist } from './draw.js';
import { groomBackground, justRule } from './grooming.js';
import { justOutcome } from './score.js';
import { nbsp } from './frame.js';

export const SELLER_STAGES = ['pad', 'saddle', 'girth'];
/** Où va la selle (milieu, sur le dos, en fraction de la demi-longueur du corps, vers la tête) : juste derrière le garrot. */
export const SADDLE_SPOT = { lo: 0.12, hi: 0.38 };
/** La sangle : 0 lâche → 1,2 bien trop serrée ; juste entre 0,7 et 0,85. */
export const GIRTH = { lo: 0.7, hi: 0.85, max: 1.2, rate: 0.32, bloat: 0.2, bloatAt: 0.5 };

const PAUSE = 0.9;
const TRAY = { pad: { x: 92, y: 330 }, saddle: { x: 92, y: 330 } };

/** Le mini-jeu « Seller » (src/ui/minigames.js : action 'saddle'). */
export function sellerGame(ctx) {
  const { a, t, fx } = ctx;
  const name = a?.name ?? ctx.name;
  const floorY = 300;
  const fit = fitAnimal(a, { groundY: floorY, maxW: 330, maxH: 236 });
  const sh = animalShape(a, { x: fit.x, y: floorY, s: fit.s, f: 1 });
  const s = fit.s;
  const rx = sh.rx;
  const ry = sh.ry;

  /** Le haut du dos à la position lx (repère du corps), et sa pente. */
  const backAt = (lx) => {
    const k = clamp(lx / rx, -0.97, 0.97);
    return sh.L(lx, -ry * Math.sqrt(1 - k * k));
  };
  const slopeAt = (lx) => {
    const p0 = backAt(lx - 8);
    const p1 = backAt(lx + 8);
    return Math.atan2(p1.y - p0.y, p1.x - p0.x);
  };
  /** Distance d'un point au haut du dos (en cherchant le point du dos le plus proche). */
  const toBack = (x, y) => {
    let best = Infinity;
    let at = 0;
    for (let lx = -rx * 0.9; lx <= rx * 0.95; lx += 4) {
      const p = backAt(lx);
      const d = dist(x, y, p.x, p.y);
      if (d < best) {
        best = d;
        at = lx;
      }
    }
    return { d: best, lx: at };
  };

  const items = {
    pad: { placed: false, lx: 0, x: TRAY.pad.x, y: TRAY.pad.y },
    saddle: { placed: false, lx: 0, x: TRAY.saddle.x, y: TRAY.saddle.y },
  };
  let drag = null; // { key, dx, dy }
  let tension = 0;
  let tightening = false;
  let bloat = { done: false, at: -1 }; // le cheval gonfle le ventre la première fois qu'on lâche
  let annoyed = 0;
  let si = 0;
  let pause = 0;
  let rule = null;
  let lastZone = null;
  const results = [];

  const stage = () => SELLER_STAGES[si];
  const spotLo = SADDLE_SPOT.lo;
  const spotHi = SADDLE_SPOT.hi;
  /** Position sur la jauge : 0 = la queue, 1 = la tête ; la zone verte, juste derrière le garrot. */
  const gaugeOf = (lx) => (lx / rx + 1) / 2;
  const onPad = () => items.pad.placed && Math.abs(items.saddle.lx - items.pad.lx) < rx * 0.15;

  function value() {
    const st = stage();
    if (st === 'girth') return tension;
    const it = items[st];
    if (!it.placed) return 0;
    if (st === 'saddle' && !onPad()) return 0;
    return gaugeOf(it.lx);
  }
  const zoneOf = (st) => (st === 'girth' ? { lo: GIRTH.lo, hi: GIRTH.hi, max: GIRTH.max } : { lo: gaugeOf(spotLo * rx), hi: gaugeOf(spotHi * rx), max: 1 });

  const stopBtn = ctx.stopButton(() => endStage());
  let holdBtn = null;
  const setStopLabel = () => {
    const text = `✅ ${si < SELLER_STAGES.length - 1 ? t('mg_pansage_next') : t('mg_stopHere')}`;
    if (stopBtn && 'textContent' in stopBtn) stopBtn.textContent = nbsp(text);
    else if (stopBtn) stopBtn.text = text;
  };

  function startStage(i) {
    si = i;
    lastZone = null;
    const st = stage();
    const z = zoneOf(st);
    rule = justRule(ctx, { lo: z.lo, hi: z.hi, max: z.max, slack: st === 'girth' ? 0.2 : 0.12 });
    if (st === 'girth' && !holdBtn) {
      // (ajouté à côté de ✅, rien n'est remplacé sous le doigt)
      holdBtn = ctx.button(`🪢 ${t('mg_seller_tighten')}`, { cls: 'primary', hold: true, onDown: () => { tightening = true; }, onUp: () => release() });
    }
    ctx.hint(t(`mg_seller_${st}_hint`, { name }));
    ctx.progress(value() / z.max);
    setStopLabel();
  }

  function endStage() {
    if (ctx.done || pause > 0 || !rule) return;
    tightening = false;
    const st = stage();
    const v = value();
    const res = justOutcome(v, rule.lo, rule.hi, { slack: st === 'girth' ? 0.2 : 0.12 });
    const offPad = st === 'saddle' && items.saddle.placed && !onPad();
    results.push({ stage: st, value: v, lo: rule.lo, hi: rule.hi, q: res.q, verdict: res.verdict, offPad });
    if (si >= SELLER_STAGES.length - 1) return finishAll();
    fx.text(200, 120, `✓ ${t(`mg_seller_stage_${st}`)}`, '#2f8a5f', 26);
    pause = PAUSE;
  }

  function finishAll() {
    const q = results.reduce((n, r) => n + r.q, 0) / results.length;
    const worst = results.reduce((w, r) => (r.q < w.q ? r : w), results[0]);
    const just = results.every((r) => r.verdict === 'just');
    const why = just ? 'just' : worst.verdict;
    const p = { name, g: a?.sex };
    let msg;
    if (just) msg = t('mg_seller_just', p);
    else if (worst.offPad) msg = t('mg_seller_offPad', p);
    else if (worst.stage === 'girth' || worst.value > 0) msg = t(`mg_seller_${worst.verdict}_${worst.stage}`, p);
    else msg = t(`mg_seller_missing_${worst.stage}`, p); // (pas posé du tout)
    ctx.finish(q, msg, why);
  }

  /** Dit où en est l'objet posé : en avant, en arrière, juste. */
  function placeHint() {
    const st = stage();
    if (st === 'girth') return;
    const it = items[st];
    if (!it.placed) return;
    if (st === 'saddle' && !onPad()) {
      ctx.hint(t('mg_seller_onPad'), 'warn');
      lastZone = 'offPad';
      return;
    }
    const v = value();
    const z = v < rule.lo ? 'back' : v > rule.hi ? 'forward' : 'just';
    ctx.progress(v);
    if (z === lastZone) return;
    lastZone = z;
    if (z === 'just') ctx.hint(t('mg_pressStop'), 'good');
    else ctx.hint(t(`mg_seller_${z}`), 'warn');
  }

  function release() {
    if (!tightening) return;
    tightening = false;
    // La première fois qu'on lâche une sangle déjà un peu serrée : il gonfle le ventre.
    if (!bloat.done && tension >= GIRTH.bloatAt && bloat.at < 0) bloat.at = ctx.time + 1.2;
  }

  startStage(0);

  return {
    peek: () => ({
      stage: stage(), si, value: value(), lo: rule.lo, hi: rule.hi, pause, tension, tightening, bloated: bloat.done,
      results: results.map((r) => ({ ...r })),
      items: Object.fromEntries(Object.entries(items).map(([k, it]) => [k, { ...it }])),
      /** Où poser pour être juste (milieu de la zone), et un endroit trop en avant / trop en arrière. */
      spot: backAt(((spotLo + spotHi) / 2) * rx), forward: backAt(0.75 * rx), back: backAt(-0.45 * rx),
      tray: { ...TRAY.pad }, belly: sh.L(0, ry * 0.9),
    }),
    down(p) {
      if (ctx.done || pause > 0) return;
      const st = stage();
      if (st === 'girth') {
        // (doigt sur le ventre, là où passe la sangle : on serre aussi)
        const b = sh.L(items.saddle.lx, ry * 0.6);
        if (dist(p.x, p.y, b.x, b.y) < 60) tightening = true;
        return;
      }
      const it = items[st];
      // (on l'attrape n'importe où dessus : il pend de part et d'autre du point d'accroche)
      if (dist(p.x, p.y, it.x, it.y + ry * 0.35) < 58) drag = { key: st, dx: it.x - p.x, dy: it.y - p.y };
    },
    move(p) {
      if (!drag) return;
      const it = items[drag.key];
      it.x = p.x + drag.dx;
      it.y = p.y + drag.dy;
      it.placed = false;
    },
    up(p) {
      if (stage() === 'girth') return release();
      if (!drag) return;
      const key = drag.key;
      const it = items[key];
      drag = null;
      const b = toBack(it.x, it.y);
      if (b.d < 55) {
        it.placed = true;
        it.lx = clamp(b.lx, -rx * 0.8, rx * 0.9);
        const q = backAt(it.lx);
        it.x = q.x;
        it.y = q.y;
        fx.burst(q.x, q.y - 10, '✨', 2, { speed: 60, size: 14 });
        placeHint();
      } else {
        // (lâché à côté : il retourne dans le plateau)
        it.x = TRAY[key].x;
        it.y = TRAY[key].y;
        it.placed = false;
        ctx.progress(0);
        lastZone = null;
      }
    },
    key(code, isDown) {
      if (code === 'Enter' || code === 'NumpadEnter') {
        if (isDown) endStage();
        return;
      }
      if (code === 'Space' && stage() === 'girth' && pause <= 0) {
        if (isDown) tightening = true;
        else release();
      }
    },
    update(dt) {
      annoyed = Math.max(0, annoyed - dt);
      if (pause > 0) {
        pause -= dt;
        if (pause <= 0) {
          pause = 0;
          startStage(si + 1);
        }
        return;
      }
      if (ctx.done || stage() !== 'girth') return;
      if (tightening) {
        tension = Math.min(GIRTH.max, tension + GIRTH.rate * dt);
        if (tension > 0.95) {
          if (annoyed <= 0) fx.float(sh.head.x, sh.head.y - 30, '💢', 20);
          annoyed = 0.6;
        }
      }
      if (bloat.at > 0 && ctx.time >= bloat.at) {
        bloat = { done: true, at: -1 };
        tension = Math.max(0, tension - GIRTH.bloat);
        fx.text(sh.bx, sh.by + ry + 10, '💨', '#3c7bd9', 22);
        ctx.hint(t('mg_seller_bloat', { name }), 'warn');
      }
      rule.show(tension);
    },
    draw(g) {
      const st = stage();
      groomBackground(g, ctx, floorY);
      const tooTight = st === 'girth' && tension > 0.95;
      drawAnimal(g, a, {
        x: fit.x, y: floorY, s, f: 1, time: ctx.time,
        happy: ctx.done && results.every((r) => r.verdict === 'just'), earsBack: annoyed > 0 || tooTight,
      });
      // Là où va la selle (tant qu'elle n'est pas posée) : un contour pointillé derrière le garrot.
      if (!ctx.done && pause <= 0 && st !== 'girth' && !items[st].placed) {
        g.save();
        g.globalAlpha = 0.5 + Math.sin(ctx.time * 3) * 0.2;
        g.setLineDash([6, 5]);
        g.strokeStyle = '#ffffff';
        g.lineWidth = 3;
        const c = backAt(((spotLo + spotHi) / 2) * rx);
        g.translate(c.x, c.y);
        g.rotate(slopeAt(((spotLo + spotHi) / 2) * rx));
        rrect(g, -rx * 0.3, -8, rx * 0.6, ry * 0.8, 8);
        g.stroke();
        g.restore();
      }
      // La sangle, sous le ventre (lâche : elle pend ; serrée : collée au ventre)
      if (items.saddle.placed && (st === 'girth' || si > 1)) drawGirth(g, sh, items.saddle.lx, tension, ry);
      if (items.pad.placed || drag?.key === 'pad' || st === 'pad') drawPad(g, items.pad, items.pad.placed ? slopeAt(items.pad.lx) : 0, rx, ry);
      if (st !== 'pad') drawSaddle(g, items.saddle, items.saddle.placed ? slopeAt(items.saddle.lx) : 0, rx, ry);
      if (st === 'girth' && rule && pause <= 0) rule.dial(g, tension, 46);
      // l'étape en cours
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.88)';
      rrect(g, 200 - 78, 8, 156, 30, 15);
      g.fill();
      label(g, `${si + 1}/${SELLER_STAGES.length} · ${t(`mg_seller_stage_${st}`)}`, 200, 23, 16, '#23302a');
      g.restore();
    },
  };
}

// ---------------------------------------------------------------- dessins

function drawPad(g, it, rot, rx, ry) {
  g.save();
  g.translate(it.x, it.y);
  g.rotate(rot);
  g.fillStyle = '#f4f1ea';
  rrect(g, -rx * 0.34, -6, rx * 0.68, ry * 0.95, 10);
  g.fill();
  g.strokeStyle = '#3c7bd9';
  g.lineWidth = 3;
  rrect(g, -rx * 0.34 + 4, -2, rx * 0.68 - 8, ry * 0.95 - 8, 8);
  g.stroke();
  g.restore();
}

function drawSaddle(g, it, rot, rx, ry) {
  g.save();
  g.translate(it.x, it.y);
  g.rotate(rot);
  // quartier (le grand rabat de cuir) et siège
  g.fillStyle = '#7a4a26';
  rrect(g, -rx * 0.18, -2, rx * 0.36, ry * 0.75, 8);
  g.fill();
  g.fillStyle = '#5c3519';
  g.beginPath();
  g.moveTo(-rx * 0.27, -14);
  g.quadraticCurveTo(0, 6, rx * 0.25, -16); // siège, entre le troussequin et le pommeau
  g.lineTo(rx * 0.25, -4);
  g.lineTo(-rx * 0.27, -2);
  g.closePath();
  g.fill();
  // étrier relevé
  g.strokeStyle = '#b8c0c6';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 2);
  g.lineTo(0, ry * 0.45);
  g.stroke();
  ellipse(g, 0, ry * 0.52, 7, 5);
  g.stroke();
  g.restore();
}

function drawGirth(g, sh, lx, tension, ry) {
  const top = sh.L(lx, -ry * 0.2);
  const bottom = sh.L(lx, ry * 1.0);
  const sag = Math.max(0, 0.75 - tension) * 26; // lâche : elle pend sous le ventre
  g.save();
  g.strokeStyle = tension > 0.95 ? '#c0392b' : '#3a3f44';
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(top.x, top.y);
  g.quadraticCurveTo(top.x + 4, (top.y + bottom.y) / 2, bottom.x, bottom.y + sag);
  g.stroke();
  // la boucle
  g.fillStyle = '#c9ced3';
  rrect(g, top.x - 7, lerp(top.y, bottom.y, 0.2) - 5, 14, 10, 3);
  g.fill();
  g.restore();
  if (tension > 0.95) {
    g.save();
    g.globalAlpha = 0.5;
    g.fillStyle = '#f08ba3';
    circle(g, bottom.x, bottom.y - 6, 10);
    g.fill();
    g.restore();
  }
}
