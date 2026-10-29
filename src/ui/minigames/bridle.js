// Brider son cheval, comme au club : après la selle, on met le filet en dernier (toujours par la gauche).
//
//   1. Le mors : il serre les dents. On glisse le pouce dans le coin de ses lèvres, là où il n'a pas de dents (la
//      « barre ») : il ouvre la bouche et le mors entre. Devant ses dents, il relève la tête.
//   2. Les oreilles : on passe la têtière derrière une oreille, puis l'autre, en les pliant doucement.
//   3. La sous-gorge : on la boucle sans trop serrer (un poing de place). Trop serrée, elle le gêne pour respirer :
//      il couche les oreilles.
//
// La note : la moyenne des trois étapes (dents touchées : moins bien ; sous-gorge « juste ce qu'il faut », score.js).
// Après trois filets mis, « ⏩ Brider vite » passe le jeu (ctx.opts.quick : src/ui/UI.js, saddleWithGame).

import { rrect, circle, label, clamp, lerp, dist, emoji, css } from './draw.js';
import { justRule } from './grooming.js';
import { justOutcome } from './score.js';
import { drawHorseHead, HEAD, MOUTH, HEAD_LIFT } from './deworm.js';
import { COLORS } from '../../sim/gear.js';

/** Les trois étapes, et la sous-gorge : 0 lâche → 1,2 bien trop serrée ; juste entre 0,55 et 0,8. */
export const BRIDLE = { steps: ['bit', 'ears', 'throat'], throat: { lo: 0.55, hi: 0.8, max: 1.2, rate: 0.35 } };

const PAUSE = 0.9;
const EAR_FOLD = 0.4; // (une oreille pliée sous la têtière, le temps de passer)
// Les oreilles (celle de notre côté, puis celle de derrière) : là où on touche pour passer la têtière.
const EARS = [{ x: HEAD.x + 22, y: HEAD.y - 57 }, { x: HEAD.x - 1, y: HEAD.y - 60 }];
// La gorge, sous la ganache : le doigt posé là serre aussi la sous-gorge.
const THROAT = { x: HEAD.x + 48, y: HEAD.y + 22 };
// La tête en gros plan : le dessin de deworm.js (repère de la tête), agrandi et décalé dans la scène de 400 × 360.
const ZOOM = { k: 1.3, x: -120, y: -22 };
const toHead = (p) => ({ x: (p.x - ZOOM.x) / ZOOM.k, y: (p.y - ZOOM.y) / ZOOM.k });
const toScene = (p) => ({ x: p.x * ZOOM.k + ZOOM.x, y: p.y * ZOOM.k + ZOOM.y });

/**
 * Où tombe le doigt pour le mors (repère de la tête) : 'bar' (le coin des lèvres, sans dents), 'teeth' (devant ses
 * dents) ou 'miss'.
 */
export function bitTap(p, geo = MOUTH) {
  if (dist(p.x, p.y, geo.bar.x, geo.bar.y) < 34) return 'bar';
  if (dist(p.x, p.y, geo.teeth.x, geo.teeth.y) < 40) return 'teeth';
  return 'miss';
}

/** La sous-gorge : { q, verdict } (juste : un poing de place entre elle et sa gorge). */
export const throatVerdict = (v) => justOutcome(v, BRIDLE.throat.lo, BRIDLE.throat.hi);

/** Le mini-jeu « Brider » (src/ui/minigames.js : action 'bridle'). */
export function bridleGame(ctx) {
  const { a, t, fx } = ctx;
  const name = a?.name ?? ctx.name;
  const who = { name, g: a?.sex }; // (« il » ou « elle »)
  const col = ctx.col ?? { coat: '#8a5a2b', mane: '#2b1d14', light: '#b07a45', dark: '#5c3a1c' };
  const T = BRIDLE.throat;
  // (le cuir du filet qu'il portait la dernière fois, sinon marron)
  const leather = css(COLORS[a?.lastBridle?.color] ?? COLORS.brown);
  let si = 0;
  let pause = 0;
  let annoyed = 0; // il relève la tête (dents touchées)
  let fuss = 0; // (sous-gorge trop serrée : 💢 une fois, pas à chaque image)
  let open = 0; // il ouvre la bouche : le mors entre
  let teethTaps = 0;
  let bitIn = false;
  const ears = [0, 0]; // temps qui reste à l'oreille pliée
  const earDone = [false, false];
  let crown = 0; // la têtière : 0 devant les oreilles, 1 derrière (sur la nuque)
  let throat = 0;
  let tightening = false;
  let zone = null;
  let rule = null;
  const results = [];

  const step = () => BRIDLE.steps[si];
  const lift = () => annoyed * HEAD_LIFT;
  /** Le coin de la bouche et les dents, là où est la tête (relevée ou pas). */
  const mouth = () => ({ bar: { x: MOUTH.bar.x, y: MOUTH.bar.y - lift() }, teeth: { x: MOUTH.teeth.x, y: MOUTH.teeth.y - lift() } });

  ctx.stopButton(() => next());
  const quickBtn = ctx.opts?.quick
    ? ctx.button(t('mg_bridle_quick'), { onTap: () => { if (!ctx.done) ctx.finish(1, t('mg_bridle_end'), 'just'); } })
    : null;

  function startStep(i) {
    si = i;
    const st = step();
    ctx.hint(t(`mg_bridle_${st}`, who));
    if (st !== 'throat') return ctx.progress(0);
    // (ajouté à côté de ✅ ; ⏩ s'en va : il est trop tard pour aller vite)
    if (quickBtn) quickBtn.hidden = true;
    rule = justRule(ctx, { lo: T.lo, hi: T.hi, max: T.max, slack: T.hi - T.lo });
    ctx.button(`🪢 ${t('mg_seller_tighten')}`, { cls: 'primary', hold: true, onDown: () => { tightening = true; }, onUp: () => { tightening = false; } });
    ctx.progress(0);
  }

  function next() {
    if (ctx.done || pause > 0) return;
    // (pas encore fait : on redit quoi faire, sans finir)
    if (step() !== 'throat') return ctx.hint(t(`mg_bridle_${step()}`, who), 'warn');
    tightening = false;
    results.push({ step: 'throat', value: throat, ...throatVerdict(throat) });
    finishAll();
  }

  function finishAll() {
    const q = results.reduce((n, r) => n + r.q, 0) / results.length;
    const worst = results.reduce((w, r) => (r.q < w.q ? r : w), results[0]);
    const just = results.every((r) => r.verdict === 'just');
    let msg;
    if (just) msg = t('mg_bridle_end');
    else if (worst.step === 'bit') msg = t('mg_deworm_teeth', who);
    else msg = t(worst.verdict === 'high' ? 'mg_bridle_tight' : 'mg_bridle_loose', who);
    ctx.finish(q, msg, just ? 'just' : worst.verdict);
  }

  /** La jauge de la sous-gorge, et ce qu'on dit en entrant dans la zone juste ou au-delà. */
  function showThroat() {
    ctx.progress(throat / T.max);
    const z = throat < T.lo ? 'low' : throat > T.hi ? 'high' : 'just';
    if (z === zone) return;
    zone = z;
    if (z === 'just') ctx.hint(t('mg_pressStop'), 'good');
    else if (z === 'high') ctx.hint(t('mg_bridle_tight', who), 'warn');
  }

  startStep(0);

  return {
    /** (positions dans la scène, là où toucher : le coin de la bouche, les dents, les oreilles, la gorge) */
    peek: () => ({
      step: step(), si, annoyed, open, throat, tightening, bitIn, crown, pause, teethTaps, lo: T.lo, hi: T.hi,
      earDone: [...earDone], results: results.map((r) => ({ ...r })),
      bar: toScene(mouth().bar), teeth: toScene(mouth().teeth), ears: EARS.map((e) => toScene({ x: e.x, y: e.y - lift() })),
      throatSpot: toScene(THROAT),
    }),
    down(p0) {
      if (ctx.done || pause > 0) return;
      const p = toHead(p0);
      const st = step();
      if (st === 'bit') {
        const where = bitTap(p, mouth());
        if (where === 'teeth') {
          // Devant ses dents : il relève la tête.
          teethTaps++;
          annoyed = 1;
          const at = toScene({ x: HEAD.x, y: HEAD.y - 60 });
          fx.float(at.x, at.y, '💢', 22);
          ctx.hint(t('mg_deworm_teeth', who), 'warn');
        } else if (where === 'bar') {
          bitIn = true;
          open = 1;
          results.push({ step: 'bit', value: teethTaps, q: [1, 0.7][teethTaps] ?? 0.4, verdict: teethTaps ? 'low' : 'just' });
          ctx.progress(1);
          ctx.hint(t('mg_bridle_bitIn', who), 'good');
          fx.text(200, 120, `✓ ${t('mg_bridle_stage_bit')}`, '#2f8a5f', 26);
          pause = PAUSE;
        }
        return;
      }
      if (st === 'ears') {
        // (la plus proche de celles qui restent : deux petites cibles, sous un doigt d'enfant)
        let best = -1;
        let bd = 46;
        EARS.forEach((e, i) => {
          const d = dist(p.x, p.y, e.x, e.y - lift());
          if (!earDone[i] && d < bd) {
            bd = d;
            best = i;
          }
        });
        if (best < 0) return;
        earDone[best] = true;
        ears[best] = EAR_FOLD;
        const at = toScene(EARS[best]);
        fx.burst(at.x, at.y, '✨', 2, { speed: 60, size: 14 });
        const n = earDone.filter(Boolean).length;
        ctx.progress(n / 2);
        if (n < 2) return;
        results.push({ step: 'ears', value: 2, q: 1, verdict: 'just' });
        fx.text(200, 120, `✓ ${t('mg_bridle_stage_ears')}`, '#2f8a5f', 26);
        pause = PAUSE;
        return;
      }
      // (doigt sur sa gorge, là où passe la sous-gorge : on serre aussi)
      if (dist(p.x, p.y, THROAT.x, THROAT.y) < 50) tightening = true;
    },
    up() {
      if (step() === 'throat') tightening = false;
    },
    key(code, isDown) {
      if (code === 'Enter' || code === 'NumpadEnter') {
        if (isDown) next();
        return;
      }
      if (code === 'Space' && step() === 'throat' && pause <= 0) tightening = isDown;
    },
    update(dt) {
      annoyed = Math.max(0, annoyed - dt);
      open = Math.max(0, open - dt * 0.8);
      for (let i = 0; i < ears.length; i++) ears[i] = Math.max(0, ears[i] - dt);
      crown += (earDone.filter(Boolean).length / 2 - crown) * Math.min(1, dt * 8);
      if (pause > 0) {
        pause -= dt;
        if (pause <= 0) {
          pause = 0;
          startStep(si + 1);
        }
        return;
      }
      if (ctx.done || step() !== 'throat') return;
      fuss = Math.max(0, fuss - dt);
      if (tightening) {
        throat = Math.min(T.max, throat + T.rate * dt);
        if (throat > 0.95) {
          const at = toScene({ x: HEAD.x + 20, y: HEAD.y - 90 });
          if (fuss <= 0) fx.float(at.x, at.y, '💢', 20);
          fuss = 0.6;
        }
      }
      showThroat();
    },
    draw(g) {
      const v = ctx.view;
      g.fillStyle = '#f1e9d6'; // le mur de l'écurie
      g.fillRect(v.x0, v.y0, v.w, v.h);
      g.fillStyle = '#cdb68a';
      g.fillRect(v.x0, 320, v.w, v.y1 - 320);
      const st = step();
      const tight = st === 'throat' && throat > T.hi;
      const fold = (i) => (ears[i] > 0 ? Math.sin(Math.PI * (1 - ears[i] / EAR_FOLD)) : 0);
      g.save();
      g.translate(ZOOM.x, ZOOM.y);
      g.scale(ZOOM.k, ZOOM.k);
      drawHorseHead(g, col, annoyed, open, ctx.time, { ears: [fold(0), fold(1)], earsBack: tight });
      g.translate(0, -lift());
      if (!bitIn) drawTeeth(g);
      drawBridle(g, { bitIn, crown, throat, tight, leather, throatOn: earDone.every(Boolean) });
      if (!bitIn) emoji(g, '✋', HEAD.x - 30, HEAD.y - 74, 30); // (la main droite tient la têtière)
      // les cibles : le coin de la bouche, puis les oreilles
      if (!ctx.done && pause <= 0 && st !== 'throat') {
        g.save();
        g.globalAlpha = 0.5 + Math.sin(ctx.time * 4) * 0.2;
        g.strokeStyle = '#ffffff';
        g.lineWidth = 3;
        g.setLineDash([5, 4]);
        if (st === 'bit') {
          circle(g, MOUTH.bar.x, MOUTH.bar.y, 22);
          g.stroke();
        } else {
          EARS.forEach((e, i) => {
            if (earDone[i]) return;
            circle(g, e.x, e.y, 15);
            g.stroke();
          });
        }
        g.restore();
      }
      g.restore();
      if (rule && st === 'throat') rule.dial(g, throat, 46);
      // l'étape en cours
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.88)';
      rrect(g, 200 - 78, 8, 156, 30, 15);
      g.fill();
      label(g, `${si + 1}/${BRIDLE.steps.length} · ${t(`mg_bridle_stage_${st}`)}`, 200, 23, 16, '#23302a');
      g.restore();
    },
  };
}

// ---------------------------------------------------------------- dessins

/** Les dents de devant, serrées (tant que le mors n'est pas entré). */
function drawTeeth(g) {
  g.save();
  g.fillStyle = '#fbf6e8';
  rrect(g, MOUTH.teeth.x - 12, MOUTH.teeth.y - 9, 22, 8, 3);
  g.fill();
  g.strokeStyle = '#b9ae94';
  g.lineWidth = 1.5;
  for (const dx of [-5, 1]) {
    g.beginPath();
    g.moveTo(MOUTH.teeth.x + dx, MOUTH.teeth.y - 9);
    g.lineTo(MOUTH.teeth.x + dx, MOUTH.teeth.y - 1);
    g.stroke();
  }
  g.restore();
}

/**
 * Le filet : montant, muserolle, mors et rênes ; la têtière devant les oreilles, puis sur la nuque, avec le
 * frontal et la sous-gorge. Avant le mors, on le tient devant sa tête (le mors devant ses lèvres).
 */
function drawBridle(g, s) {
  const B = s.bitIn ? MOUTH.bar : { x: MOUTH.bar.x - 18, y: MOUTH.bar.y + 24 };
  const F = s.bitIn ? { x: HEAD.x + 2, y: HEAD.y - 48 } : { x: HEAD.x - 30, y: HEAD.y - 62 }; // têtière tenue devant
  const P = { x: HEAD.x + 36, y: HEAD.y - 36 }; // la nuque, juste derrière les oreilles
  const C = { x: lerp(F.x, P.x, s.crown), y: lerp(F.y, P.y, s.crown) };
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = s.leather;
  if (s.bitIn) {
    // les rênes, qui pendent sur l'encolure
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(B.x, B.y);
    g.quadraticCurveTo(HEAD.x + 10, HEAD.y + 150, HEAD.x + 124, HEAD.y + 74);
    g.stroke();
    // la muserolle, autour du nez
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(HEAD.x - 44, HEAD.y + 10);
    g.lineTo(HEAD.x - 22, HEAD.y + 58);
    g.stroke();
  }
  if (s.throatOn) {
    // la sous-gorge : lâche, elle pend loin de la gorge ; serrée, elle la touche (trop : en rouge)
    const sag = (1 - clamp(s.throat / BRIDLE.throat.hi)) * 40;
    g.strokeStyle = s.tight ? '#c0392b' : s.leather;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(P.x, P.y + 4);
    g.quadraticCurveTo(HEAD.x + 80 + sag, HEAD.y + 6 + sag * 0.4, HEAD.x + 34, HEAD.y + 44);
    g.stroke();
    // le frontal, devant les oreilles
    g.strokeStyle = s.leather;
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(HEAD.x + 30, HEAD.y - 30);
    g.lineTo(HEAD.x + 8, HEAD.y - 36);
    g.stroke();
  }
  // le montant, de la têtière au mors (le long de la joue)
  g.strokeStyle = s.leather;
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(C.x, C.y);
  g.quadraticCurveTo(lerp(C.x, B.x, 0.5) + 30, lerp(C.y, B.y, 0.5), B.x, B.y);
  g.stroke();
  // l'anneau du mors
  g.strokeStyle = '#b8c0c6';
  g.lineWidth = 3;
  circle(g, B.x, B.y, 8);
  g.stroke();
  g.restore();
}
