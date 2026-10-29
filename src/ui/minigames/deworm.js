// Donner le vermifuge, comme en vrai (le carnet de santé du cheval, src/sim/horseHealth.js) :
//
//   1. La dose : on règle la bague de la seringue sur le poids du cheval (un poney ≈ 250 kg, un cheval ≈ 500 kg,
//      un cheval de trait ≈ 750 kg ; un peu plus s'il est gros). Juste : son poids, ou un peu plus (on arrondit
//      toujours au-dessus, jusqu'à DOSE.over kg de plus) ; moins, jamais : ça marche mal et les vers s'habituent au
//      produit (sous-dosé : noté, mais à refaire plus tôt — ctx.opts.out.dose, src/game/Game.js deworm). Beaucoup
//      trop, ce n'est pas bon pour lui. Deux boutons −10 / +10 kg pour régler au doigt près.
//   2. La seringue : on la glisse dans le coin de sa bouche, là où il n'a pas de dents (la « barre »), pas devant
//      ses dents (il relève la tête). Puis on garde le doigt sur le piston (ou Espace) : la pâte part, il fait la
//      grimace.
//
// La note : la moyenne des deux étapes « juste ce qu'il faut » (score.js).

import { rrect, ellipse, circle, label, clamp, lerp, dist, css, shade } from './draw.js';
import { justOutcome } from './score.js';
import { sizeOf } from '../../sim/gear.js';
import { nbsp } from './frame.js';

/** Le poids du cheval (kg), d'après sa taille et son embonpoint (a.weight : 50 = idéal). */
export function horseKg(a) {
  const base = { pony: 250, horse: 500, draft: 750 }[sizeOf(a) ?? 'horse'] ?? 500;
  return Math.round((base * (0.8 + 0.4 * ((a?.weight ?? 50) / 100))) / 10) * 10;
}
export const DOSE = { min: 100, max: 900, slack: 5, over: 50, step: 10 }; // (juste : son poids, jusqu'à un cran de 50 kg au-dessus)

// La seringue (en bas) : la bague glisse le long du corps, de DOSE.min à DOSE.max.
const SYR = { x0: 70, x1: 330, y: 300 };
// La tête du cheval (à droite), et le coin de sa bouche (la barre) : là où va la seringue (et le mors, bridle.js).
export const HEAD = { x: 250, y: 150 };
/** bar : le coin de la bouche, sans dents ; teeth : le bout du nez, les dents de devant. */
export const MOUTH = { bar: { x: HEAD.x - 58, y: HEAD.y + 70 }, teeth: { x: HEAD.x - 96, y: HEAD.y + 78 } };
/** De combien la tête se relève quand il n'est pas content (annoyed = 1). */
export const HEAD_LIFT = 18;

export function dewormGame(ctx) {
  const { a, t, fx } = ctx;
  const name = a?.name ?? ctx.name;
  const kg = horseKg(a);
  const col = ctx.col ?? { coat: '#8a5a2b', mane: '#2b1d14', light: '#b07a45', dark: '#5c3a1c' };
  const bar = { ...MOUTH.bar }; // le coin de la bouche
  const teeth = { ...MOUTH.teeth }; // le bout du nez, les dents de devant
  let stage = 'dose';
  let ring = 300 + Math.round((ctx.rng?.() ?? 0.5) * 300 / 10) * 10; // la bague, au départ
  let dragRing = false;
  const syr = { x: 120, y: 230, placed: false, pushing: false, left: 1 };
  let dragSyr = null;
  let grimace = 0;
  let annoyed = 0;
  let pause = 0;
  const results = [];

  const ringX = () => lerp(SYR.x0, SYR.x1, (ring - DOSE.min) / (DOSE.max - DOSE.min));
  const doseLo = kg - DOSE.slack;
  const doseHi = kg + DOSE.over;
  ctx.zone((doseLo - DOSE.min) / (DOSE.max - DOSE.min), (doseHi - DOSE.min) / (DOSE.max - DOSE.min));
  ctx.progress((ring - DOSE.min) / (DOSE.max - DOSE.min));
  ctx.hint(t('mg_deworm_dose_hint', { name, kg }));
  const stopBtn = ctx.stopButton(() => next());
  const setLabel = (key) => {
    const text = `✅ ${t(key)}`;
    if (stopBtn && 'textContent' in stopBtn) stopBtn.textContent = nbsp(text);
    else if (stopBtn) stopBtn.text = text;
  };
  setLabel('mg_pansage_next');
  // (régler la bague cran par cran, plus facile au doigt que de la faire glisser)
  const nudge = (k) => { if (stage === 'dose' && !ctx.done && pause <= 0) setRing(ringX() + (k * DOSE.step * (SYR.x1 - SYR.x0)) / (DOSE.max - DOSE.min)); };
  const minus = ctx.button(`➖ ${DOSE.step} kg`, { onTap: () => nudge(-1) });
  const plus = ctx.button(`➕ ${DOSE.step} kg`, { onTap: () => nudge(1) });

  function next() {
    if (ctx.done || pause > 0) return;
    if (stage === 'dose') {
      const res = justOutcome(ring, doseLo, doseHi, { slack: 120 });
      results.push({ stage: 'dose', value: ring, ...res });
      if (ctx.opts) ctx.opts.out = { ...(ctx.opts.out ?? {}), dose: res.verdict }; // (sous-dosé : à refaire plus tôt)
      for (const b of [minus, plus]) if (b) b.hidden = true;
      stage = 'give';
      pause = 0.6;
      ctx.zone(null);
      ctx.progress(0);
      ctx.hint(t('mg_deworm_give_hint', { name }));
      setLabel('mg_stopHere');
      return;
    }
    // (pas encore donné : on le dit, sans finir — la pâte doit aller dans sa bouche)
    if (!syr.placed || syr.left > 0.05) {
      ctx.hint(t('mg_deworm_give_hint', { name }), 'warn');
      return;
    }
    finish();
  }

  function finish() {
    if (ctx.done) return;
    // La seringue : dans le coin de la bouche, et toute la pâte donnée.
    const given = 1 - syr.left;
    const res = justOutcome(syr.placed ? given : 0, 0.95, 1, { slack: 0.6 });
    results.push({ stage: 'give', value: given, ...res });
    const q = results.reduce((n, r) => n + r.q, 0) / results.length;
    const worst = results.reduce((w, r) => (r.q < w.q ? r : w), results[0]);
    const just = results.every((r) => r.verdict === 'just');
    const p = { name, g: a?.sex, kg };
    const msg = just ? t('mg_deworm_just', p) : t(`mg_deworm_${worst.verdict}_${worst.stage}`, p);
    ctx.finish(q, msg, just ? 'just' : worst.verdict);
  }

  function setRing(x) {
    const k = clamp((x - SYR.x0) / (SYR.x1 - SYR.x0));
    ring = Math.round((DOSE.min + k * (DOSE.max - DOSE.min)) / 10) * 10;
    ctx.progress((ring - DOSE.min) / (DOSE.max - DOSE.min));
  }

  return {
    peek: () => ({ stage, ring, kg, doseLo, doseHi, syr: { ...syr }, bar: { ...bar }, teeth: { ...teeth }, ringX: ringX(), results: results.map((r) => ({ ...r })), pause }),
    down(p) {
      if (ctx.done || pause > 0) return;
      if (stage === 'dose') {
        if (Math.abs(p.y - SYR.y) < 40 && p.x > SYR.x0 - 20 && p.x < SYR.x1 + 20) {
          dragRing = true;
          setRing(p.x);
        }
        return;
      }
      if (syr.placed) {
        syr.pushing = true; // (doigt sur la seringue : on pousse le piston)
        return;
      }
      if (dist(p.x, p.y, syr.x, syr.y) < 60) dragSyr = { dx: syr.x - p.x, dy: syr.y - p.y };
    },
    move(p) {
      if (dragRing) setRing(p.x);
      if (dragSyr) {
        // (gardée dans la scène de 400 × 360 : lâchée hors de l'écran, on ne pourrait plus la reprendre)
        syr.x = clamp(p.x + dragSyr.dx, 20, 380);
        syr.y = clamp(p.y + dragSyr.dy, 20, 340);
      }
    },
    up() {
      dragRing = false;
      syr.pushing = false;
      if (!dragSyr) return;
      dragSyr = null;
      if (dist(syr.x, syr.y, bar.x, bar.y) < 34) {
        syr.placed = true;
        syr.x = bar.x;
        syr.y = bar.y;
        ctx.hint(t('mg_deworm_push', { name }), 'good');
      } else if (dist(syr.x, syr.y, teeth.x, teeth.y) < 40) {
        // Devant ses dents : il relève la tête et recule.
        annoyed = 1;
        fx.float(HEAD.x, HEAD.y - 60, '💢', 22);
        ctx.hint(t('mg_deworm_teeth', { name }), 'warn');
        syr.x = 120;
        syr.y = 230;
      }
    },
    key(code, isDown) {
      if (code === 'Enter' || code === 'NumpadEnter') {
        if (isDown) next();
        return;
      }
      if (code === 'ArrowLeft' && isDown && stage === 'dose') setRing(ringX() - 3.25);
      if (code === 'ArrowRight' && isDown && stage === 'dose') setRing(ringX() + 3.25);
      if (code === 'Space' && stage === 'give' && syr.placed) syr.pushing = isDown;
    },
    update(dt) {
      annoyed = Math.max(0, annoyed - dt);
      grimace = Math.max(0, grimace - dt * 0.5);
      if (pause > 0) {
        pause -= dt;
        return;
      }
      if (stage === 'give' && syr.placed && syr.pushing && syr.left > 0) {
        syr.left = Math.max(0, syr.left - dt * 0.6);
        grimace = 1;
        ctx.progress(1 - syr.left);
        if (syr.left <= 0) {
          fx.text(HEAD.x, HEAD.y - 70, '😝', '#5a4636', 30);
          ctx.hint(t('mg_pressStop'), 'good');
        }
      }
    },
    draw(g) {
      const v = ctx.view;
      g.fillStyle = '#e4f1f8';
      g.fillRect(v.x0, v.y0, v.w, v.h);
      g.fillStyle = '#d9c39a';
      g.fillRect(v.x0, 250, v.w, v.y1 - 250);
      drawHorseHead(g, col, annoyed, grimace, ctx.time);
      // le poids du cheval
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      rrect(g, 12, 12, 170, 44, 12);
      g.fill();
      label(g, `⚖️ ${t('mg_deworm_weight', { kg })}`, 97, 34, 16, '#23302a');
      g.restore();
      if (stage === 'dose' || pause > 0) drawSyringeScale(g, ring, ringX(), doseLo, doseHi);
      else {
        // la cible : le coin de la bouche (tant que la seringue n'y est pas)
        if (!syr.placed) {
          g.save();
          g.globalAlpha = 0.5 + Math.sin(ctx.time * 4) * 0.2;
          g.strokeStyle = '#ffffff';
          g.lineWidth = 3;
          g.setLineDash([5, 4]);
          circle(g, bar.x, bar.y, 22);
          g.stroke();
          g.restore();
        }
        drawSyringe(g, syr.x, syr.y, syr.left, syr.placed);
      }
    },
  };
}

// ---------------------------------------------------------------- dessins

/**
 * La tête du cheval de profil (le nez à gauche) : aussi pour la ration (ration.js) et le filet (bridle.js).
 * o : { ears: [près, loin] (pliées vers l'avant, 0 à 1 : on dessine alors aussi l'oreille de derrière), earsBack }
 */
export function drawHorseHead(g, col, annoyed, grimace, time, o = {}) {
  const lift = annoyed * HEAD_LIFT;
  const ear = annoyed > 0 || o.earsBack ? 0.9 : Math.sin(time * 2) * 0.1;
  g.save();
  g.translate(0, -lift);
  // encolure
  g.fillStyle = col.coat;
  g.beginPath();
  g.moveTo(HEAD.x + 40, HEAD.y - 70);
  g.lineTo(HEAD.x + 150, HEAD.y - 10);
  g.lineTo(HEAD.x + 150, HEAD.y + 110);
  g.lineTo(HEAD.x + 30, HEAD.y + 40);
  g.closePath();
  g.fill();
  // crinière
  g.strokeStyle = col.mane;
  g.lineWidth = 12;
  g.beginPath();
  g.moveTo(HEAD.x + 36, HEAD.y - 76);
  g.lineTo(HEAD.x + 150, HEAD.y - 16);
  g.stroke();
  // (l'autre oreille, derrière la tête)
  if (o.ears) {
    g.fillStyle = col.dark ?? col.coat;
    g.save();
    g.translate(HEAD.x + 8, HEAD.y - 44);
    g.rotate(-0.5 + ear - o.ears[1] * 1.1);
    ellipse(g, 0, -18, 9, 22);
    g.fill();
    g.restore();
  }
  // tête (de profil, le nez à gauche)
  g.fillStyle = col.coat;
  ellipse(g, HEAD.x, HEAD.y, 58, 46, 0.25);
  g.fill();
  ellipse(g, HEAD.x - 70, HEAD.y + 52, 46, 30, 0.55);
  g.fill();
  // naseau, bouche (la grimace : lèvre retroussée)
  g.fillStyle = shade(0x8a5a2b, -0.4);
  circle(g, HEAD.x - 104, HEAD.y + 50, 5);
  g.fill();
  g.strokeStyle = '#3a2618';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(HEAD.x - 108, HEAD.y + 78);
  g.quadraticCurveTo(HEAD.x - 84, HEAD.y + 84 + grimace * 6, HEAD.x - 58, HEAD.y + 72);
  g.stroke();
  if (grimace > 0.2) {
    g.fillStyle = '#e88a9a'; // la langue
    ellipse(g, HEAD.x - 92, HEAD.y + 86, 8 * grimace, 4 * grimace);
    g.fill();
  }
  // œil, oreilles
  g.fillStyle = '#1e140e';
  circle(g, HEAD.x + 4, HEAD.y - 8, 6);
  g.fill();
  g.fillStyle = col.coat;
  g.save();
  g.translate(HEAD.x + 28, HEAD.y - 40);
  g.rotate(-0.3 + ear - (o.ears?.[0] ?? 0) * 1.1);
  ellipse(g, 0, -18, 9, 22);
  g.fill();
  g.restore();
  g.restore();
}

function drawSyringeScale(g, ring, rx, lo, hi) {
  // corps de la seringue avec ses repères de poids
  g.save();
  g.fillStyle = '#f7f7f2';
  rrect(g, SYR.x0 - 16, SYR.y - 16, SYR.x1 - SYR.x0 + 50, 32, 10);
  g.fill();
  g.strokeStyle = '#9aa3ab';
  g.lineWidth = 2;
  g.stroke();
  for (let w = DOSE.min; w <= DOSE.max; w += 100) {
    const x = lerp(SYR.x0, SYR.x1, (w - DOSE.min) / (DOSE.max - DOSE.min));
    g.beginPath();
    g.moveTo(x, SYR.y - 12);
    g.lineTo(x, SYR.y + 2);
    g.stroke();
    label(g, `${w}`, x, SYR.y + 30, 11, '#5a6670');
  }
  // la zone juste (son poids), en vert
  g.fillStyle = 'rgba(63, 174, 98, 0.35)';
  const a = lerp(SYR.x0, SYR.x1, (lo - DOSE.min) / (DOSE.max - DOSE.min));
  const b = lerp(SYR.x0, SYR.x1, (hi - DOSE.min) / (DOSE.max - DOSE.min));
  g.fillRect(a, SYR.y - 14, b - a, 28);
  // la bague
  g.fillStyle = '#e0574a';
  rrect(g, rx - 7, SYR.y - 22, 14, 44, 5);
  g.fill();
  label(g, `${ring} kg`, rx, SYR.y - 34, 16, '#c0392b');
  g.restore();
}

function drawSyringe(g, x, y, left, placed) {
  g.save();
  g.translate(x, y);
  g.rotate(placed ? -0.25 : -0.1);
  // corps (la pâte : ce qui reste)
  g.fillStyle = '#f7f7f2';
  rrect(g, 0, -12, 120, 24, 8);
  g.fill();
  g.fillStyle = '#c9b48a';
  rrect(g, 4, -8, 112 * left, 16, 6);
  g.fill();
  g.strokeStyle = '#9aa3ab';
  g.lineWidth = 2;
  rrect(g, 0, -12, 120, 24, 8);
  g.stroke();
  // embout (vers la bouche) et piston
  g.fillStyle = '#d9dde0';
  rrect(g, -18, -5, 20, 10, 4);
  g.fill();
  g.fillStyle = '#3c7bd9';
  rrect(g, 120 + (1 - left) * -100 + 100, -16, 14, 32, 5);
  g.fill();
  g.restore();
}
