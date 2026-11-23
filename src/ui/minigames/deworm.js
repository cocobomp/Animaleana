// Donner le vermifuge, comme en vrai (le carnet de santé du cheval, src/sim/horseHealth.js) :
//
//   1. La dose : on règle la bague de la seringue sur le poids du cheval (un Shetland ≈ 165 kg, un cheval ≈ 500 kg,
//      un cheval de trait ≈ 800 kg ; un peu plus s'il est gros). Juste : son poids, ou un peu plus (on arrondit
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
import { growthScale } from '../../sim/animal.js';
import { horseFaceMark, horseBreedOf } from '../../sim/horseLook.js';
import { nbsp } from './frame.js';

export const DOSE = { min: 100, max: 900, slack: 5, over: 50, step: 10 }; // (juste : son poids, jusqu'à un cran de 50 kg au-dessus)

/**
 * Le poids du cheval (kg), d'après sa race (sa taille : look.scale, son épaisseur : look.fluff, un cheval de trait est
 * plus lourd), son embonpoint (a.weight : 50 = idéal) et son âge : un poulain pèse bien moins qu'un adulte (le poids
 * suit la taille au cube, growthScale). Un Falabella ≈ 100 kg, un Shetland ≈ 165 kg, un selle français ≈ 500 kg, un
 * percheron ≈ 800 kg. Jamais moins que la plus petite dose de la seringue (DOSE.min) : pour un tout petit poulain ou un
 * Falabella, on donne cette dose-là.
 */
export function horseKg(a) {
  const size = sizeOf(a) ?? 'horse';
  const scale = a?.look?.scale ?? { pony: 0.75, horse: 1, draft: 1.06 }[size] ?? 1;
  const fluff = a?.look?.fluff ?? 1;
  const base = 500 * scale ** 2.3 * fluff * (size === 'draft' ? 1.4 : 1);
  const grow = a?.species && Number.isFinite(a?.ageDays) ? growthScale(a) ** 3 : 1;
  return Math.max(DOSE.min, Math.round((base * (0.8 + 0.4 * ((a?.weight ?? 50) / 100)) * grow) / 10) * 10);
}

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
  const face = faceOf(a);
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
      drawHorseHead(g, col, annoyed, grimace, ctx.time, { face });
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

/** La marque en tête de l'animal (0 aucune … 4 ladre), pour le dessin. */
export function faceOf(a) {
  if (a?.species !== 'horse') return 0;
  try {
    return horseFaceMark(a.look ?? {}, horseBreedOf(a.look ?? {}, a.breed));
  } catch {
    return 0;
  }
}

/** Clarté (0 à 1) d'une couleur css (#rrggbb ou rgb(…)), pour éclaircir le contour d'une robe noire. */
function lightness(c) {
  const m = /^#([0-9a-f]{6})$/i.exec(c ?? '') ?? null;
  let r;
  let gg;
  let b;
  if (m) {
    const n = parseInt(m[1], 16);
    r = n >> 16;
    gg = (n >> 8) & 255;
    b = n & 255;
  } else {
    const k = /rgba?\(([^)]+)\)/.exec(c ?? '');
    if (!k) return 0.5;
    [r, gg, b] = k[1].split(',').map((x) => parseFloat(x));
  }
  return (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
}

/** Le contour de la tête de profil (repère de la tête : HEAD en 0,0 ; le nez à gauche, vers le bas). */
function headPath(g) {
  g.beginPath();
  g.moveTo(34, -50); // la nuque
  g.bezierCurveTo(16, -54, -6, -48, -28, -32); // le front
  g.bezierCurveTo(-56, -12, -86, 12, -108, 32); // le chanfrein
  g.bezierCurveTo(-120, 42, -126, 56, -122, 68); // le bout du nez
  g.bezierCurveTo(-120, 76, -114, 81, -106, 81); // la lèvre du haut
  g.bezierCurveTo(-104, 88, -98, 94, -88, 93); // la lèvre du bas, le menton
  g.bezierCurveTo(-76, 92, -66, 86, -54, 84); // la barbe
  g.bezierCurveTo(-30, 82, -10, 82, 10, 78); // le dessous de la mâchoire
  g.bezierCurveTo(40, 72, 56, 46, 52, 18); // la ganache, ronde
  g.bezierCurveTo(50, 0, 46, -30, 34, -50); // derrière la joue, vers la nuque
  g.closePath();
}

/**
 * La tête du cheval de profil (le nez à gauche) : aussi pour la ration (ration.js) et le filet (bridle.js).
 * o : { ears: [près, loin] (pliées vers l'avant, 0 à 1 : on dessine alors aussi l'oreille de derrière), earsBack,
 *       face (marque en tête : 0 aucune, 1 étoile, 2 liste fine, 3 large liste, 4 ladre au bout du nez, voir
 *       horseFaceMark) }.
 * Une vraie tête de cheval : encolure et crinière aux couleurs des crins, toupet, ganache ronde, chanfrein, naseau et
 * bouche tirés de la robe, œil avec son reflet (visible même sur un cheval noir : sa tête a alors un contour plus clair),
 * la marque blanche de l'animal.
 */
export function drawHorseHead(g, col, annoyed, grimace, time, o = {}) {
  const lift = annoyed * HEAD_LIFT;
  const ear = annoyed > 0 || o.earsBack ? 0.9 : Math.sin(time * 2) * 0.1;
  const coat = col.coat;
  const dark = col.dark ?? coat;
  const light = col.light ?? coat;
  const mane = col.mane ?? dark;
  const L = lightness(coat);
  const black = L < 0.2;
  const rim = black ? 'rgba(255,255,255,0.28)' : 'rgba(40,24,12,0.35)';
  g.save();
  g.translate(HEAD.x, HEAD.y - lift);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // encolure (derrière la tête), avec son ombre sous la gorge
  g.fillStyle = coat;
  g.beginPath();
  g.moveTo(30, -56);
  g.bezierCurveTo(70, -60, 120, -40, 160, -20);
  g.lineTo(160, 120);
  g.bezierCurveTo(110, 100, 70, 70, 44, 44);
  g.closePath();
  g.fill();
  g.strokeStyle = rim;
  g.lineWidth = 2;
  g.stroke();
  // la crinière : des mèches qui tombent du bord de l'encolure
  g.strokeStyle = mane;
  for (let i = 0; i < 11; i++) {
    const k = i / 10;
    const x = 34 + k * 120;
    const y = -56 + k * 34 + Math.sin(k * 9) * 2;
    g.lineWidth = 9 - k * 2;
    g.beginPath();
    g.moveTo(x - 6, y - 4);
    g.quadraticCurveTo(x + 4, y + 10, x + 2 + Math.sin(time * 1.5 + i) * 1.5, y + 26 + (i % 3) * 5);
    g.stroke();
  }
  // (l'autre oreille, derrière la tête)
  const drawEar = (x, y, rot, back) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = back ? dark : coat;
    g.beginPath();
    g.moveTo(-9, 2);
    g.bezierCurveTo(-11, -16, -6, -34, 1, -42);
    g.bezierCurveTo(8, -32, 11, -14, 9, 2);
    g.closePath();
    g.fill();
    g.strokeStyle = rim;
    g.lineWidth = 1.5;
    g.stroke();
    if (!back) {
      g.fillStyle = shadeCss(dark, 0.6);
      g.beginPath();
      g.moveTo(-4, -2);
      g.bezierCurveTo(-5, -14, -2, -28, 1, -34);
      g.bezierCurveTo(4, -26, 5, -12, 4, -2);
      g.closePath();
      g.fill();
    }
    g.restore();
  };
  if (o.ears) drawEar(14, -46, -0.45 + ear - o.ears[1] * 1.1, true);
  // la tête
  headPath(g);
  g.fillStyle = coat;
  g.fill();
  // (le relief : la joue plus claire, le chanfrein et le dessous plus sombres)
  g.save();
  headPath(g);
  g.clip();
  const cheek = g.createRadialGradient(18, 22, 4, 18, 22, 46);
  cheek.addColorStop(0, black ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.22)');
  cheek.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = cheek;
  g.fillRect(-30, -30, 100, 100);
  const under = g.createLinearGradient(0, 40, 0, 96);
  under.addColorStop(0, 'rgba(0,0,0,0)');
  under.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = under;
  g.fillRect(-130, 40, 200, 60);
  // la marque blanche (étoile, liste, large liste, ladre)
  const face = o.face ?? 0;
  if (face) {
    g.fillStyle = '#f5f1ea';
    g.beginPath();
    if (face === 1) {
      g.ellipse(-14, -30, 7, 5, -0.5, 0, Math.PI * 2);
    } else if (face === 4) {
      g.ellipse(-112, 58, 12, 16, 0.4, 0, Math.PI * 2);
    } else {
      const w = face === 3 ? 13 : 6;
      g.moveTo(-10 - w * 0.6, -38);
      g.bezierCurveTo(-40, -18, -80, 14, -112 - w * 0.4, 44);
      g.lineTo(-114 + w * 0.8, 66);
      g.bezierCurveTo(-96 + w, 24, -50 + w, -8, -6 + w * 0.6, -36);
      g.closePath();
    }
    g.fill();
  }
  g.restore();
  headPath(g);
  g.strokeStyle = rim;
  g.lineWidth = 2;
  g.stroke();
  // la ganache (le rond de la joue)
  g.strokeStyle = black ? 'rgba(255,255,255,0.16)' : 'rgba(40,24,12,0.18)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(20, 30, 30, 1.9, 4.3);
  g.stroke();
  // le naseau (une virgule, plus sombre que la robe) et la bouche
  g.fillStyle = black ? '#050403' : shadeCss(dark, -0.35);
  g.beginPath();
  g.moveTo(-104, 46);
  g.bezierCurveTo(-112, 44, -118, 52, -114, 60);
  g.bezierCurveTo(-110, 64, -104, 60, -106, 54);
  g.closePath();
  g.fill();
  g.strokeStyle = black ? 'rgba(255,255,255,0.3)' : shadeCss(dark, -0.2);
  g.lineWidth = 1.6;
  g.beginPath();
  g.arc(-110, 53, 8, 2.2, 5.0);
  g.stroke();
  g.strokeStyle = black ? 'rgba(255,255,255,0.35)' : '#3a2618';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(-112, 81);
  g.quadraticCurveTo(-88, 84 + grimace * 5, -60, 76);
  g.stroke();
  if (grimace > 0.2) {
    // la langue, qui sort au coin des lèvres
    g.fillStyle = '#d4707e';
    g.beginPath();
    g.ellipse(-62, 84 + 6 * grimace, 9 * grimace, 5 * grimace, 0.5, 0, Math.PI * 2);
    g.fill();
  }
  // l'œil : en amande, le bord des paupières, et son reflet (on le voit même sur un cheval noir)
  g.save();
  g.translate(2, -10);
  g.rotate(0.35);
  g.fillStyle = black ? 'rgba(255,255,255,0.22)' : shadeCss(dark, -0.25);
  g.beginPath();
  g.ellipse(0, 0, 11, 7.5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1b120c';
  g.beginPath();
  g.ellipse(0, 0, 8.5, 6, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#4a2f1c';
  g.beginPath();
  g.ellipse(-1, 0.5, 5, 4, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(-3, -2.2, 2.2, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 0.6;
  g.beginPath();
  g.arc(2.5, 2, 1, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // l'oreille de devant, puis le toupet qui tombe sur le front, entre les oreilles
  drawEar(28, -44, -0.25 + ear - (o.ears?.[0] ?? 0) * 1.1, false);
  g.strokeStyle = mane;
  for (let i = 0; i < 5; i++) {
    g.lineWidth = 6 - i * 0.6;
    g.beginPath();
    g.moveTo(22 - i * 3, -50);
    g.quadraticCurveTo(6 - i * 4, -40, -6 - i * 5 + Math.sin(time * 1.3 + i) * 1.2, -24 + i * 2);
    g.stroke();
  }
  g.restore();
}

/** Une couleur css un peu plus claire (k > 0) ou plus sombre (k < 0). */
function shadeCss(c, k) {
  const m = /^#([0-9a-f]{6})$/i.exec(c ?? '');
  let r = 128;
  let gg = 128;
  let b = 128;
  if (m) {
    const n = parseInt(m[1], 16);
    r = n >> 16;
    gg = (n >> 8) & 255;
    b = n & 255;
  } else {
    const q = /rgba?\(([^)]+)\)/.exec(c ?? '');
    if (q) [r, gg, b] = q[1].split(',').map((x) => parseFloat(x));
  }
  const f = (v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgb(${f(r)}, ${f(gg)}, ${f(b)})`;
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
  // le piston : son joint pousse la pâte (juste derrière elle), sa tige sort du corps, le poussoir au bout (pleine : la
  // tige sort de toute sa longueur ; vide : le poussoir touche le corps). Avant : le poussoir flottait loin du corps.
  const seal = 4 + 112 * left;
  const push = seal + 114;
  g.fillStyle = '#c3c8cc';
  rrect(g, seal, -3.5, push - seal, 7, 3);
  g.fill();
  g.fillStyle = '#2d3a46';
  rrect(g, seal - 3, -9, 6, 18, 2);
  g.fill();
  g.fillStyle = '#3c7bd9';
  rrect(g, push, -16, 12, 32, 5);
  g.fill();
  g.restore();
}
