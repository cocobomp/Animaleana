// Le pansage du cheval, comme au club : quatre outils dans l'ordre, chacun avec son bon geste.
//
//   1. L'étrille : des petits ronds sur la boue sèche pour la décoller (des traits droits la
//      décollent mal). Pas sur la tête ni sur les jambes : c'est dur, il n'y a que des os.
//   2. La brosse : chasser la poussière décollée, dans le sens du poil (vers la queue). Revenu du pré
//      boueux (src/sim/legMud.js) : ses chaussettes de boue, quatre taches sur les jambes, de haut en bas.
//   3. Le cure-pied : les quatre pieds l'un après l'autre (antérieur gauche, postérieur gauche,
//      antérieur droit, postérieur droit), en grattant la terre du talon vers la pince, le long
//      de la fourchette, sans piquer la fourchette (sensible). Parfois, un caillou coincé.
//   4. Le peigne : démêler les nœuds de la crinière et de la queue, de haut en bas.
//
// Règle « juste ce qu'il faut » (score.js) à chaque étape : la jauge a sa zone verte, on passe à
// la suite avec ✅ (le cure-pied passe tout seul au pied suivant, puis à l'étape suivante quand
// les quatre sont propres). Trop peu (de la boue qui reste) ou trop (frotter la peau propre, piquer
// la fourchette, tirer sur les crins) : moins de points. La note finale est la moyenne des quatre
// étapes ; le message de fin parle de l'étape la moins bien faite.
// Plus le cheval est sale (besoin « pansage » bas, après un galop par exemple), plus il y a de
// boue et de nœuds.

import { drawAnimal, animalShape, fitAnimal, inBody, rrect, ellipse, circle, emoji, label, clamp, lerp, dist, distToSegment } from './draw.js';
import { groomBackground, dialX, drawBrush, justRule, dustPatches } from './grooming.js';
import { justOutcome } from './score.js';
import { nbsp } from './frame.js';
import { LEG_MUD } from '../../sim/legMud.js'; // 🧦 ses chaussettes de boue

export const PANSAGE_STAGES = ['curry', 'brush', 'hoof', 'comb'];
/** Les pieds, dans l'ordre où on les cure (on fait le tour du cheval). */
export const PANSAGE_FEET = ['fl', 'hl', 'fr', 'hr'];

const MAX = 1.4; // la jauge de chaque étape va de 0 à 1,4 (au-delà de 1 : trop)
const SLACK = 0.3;
const STEP = 4; // longueur (px) d'un petit bout de geste
const PAUSE = 0.9; // secondes entre deux étapes
// Le pied en gros plan
const HX = 200;
const HY = 178;

/** Le pansage du cheval (le soin « brosser » d'un cheval, voir src/ui/minigames.js). */
export function pansageGame(ctx) {
  const { a, t, fx } = ctx;
  const name = a?.name ?? ctx.name;
  const rng = ctx.rng;
  const floorY = 300;
  const fit = fitAnimal(a, { groundY: floorY, maxW: 330, maxH: 236 });
  const sh = animalShape(a, { x: fit.x, y: floorY, s: fit.s, f: 1 });
  const s = fit.s;
  const dirt = clamp(1 - (a?.needs?.grooming ?? 50) / 100);

  // ---- 1. étrille : plaques de boue sèche
  // (il s'est roulé : de la terre partout, deux plaques de plus — src/game/AnimalEntity.js)
  const rolled = !!a?.muddy;
  const mud = dustPatches(sh, rng, 3 + Math.round(dirt * 4) + (rolled ? 2 : 0), 19 * Math.max(0.8, s))
    .map((q) => ({ x: q.x, y: q.y, r: q.r, seed: q.seed, mud: 1, dust: 0 }));
  // ---- 2. brosse : la poussière décollée, plus un peu de poussière partout (posée au début de l'étape)
  let dust = [];
  // (🧦 ses chaussettes de boue : une tache sur chaque jambe, à brosser de haut en bas ; le conseil, une fois —
  // ctx.opts.legMudTip, src/ui/UI.js careWithGame)
  const legMud = (a?.legMud ?? 0) > LEG_MUD.patchesAt;
  let legs = [];
  let tipUntil = -1; // (le conseil reste lu quelques secondes)
  // ---- 3. cure-pied (il boite : le caillou est dans le pied qui boite — src/sim/animal.js HOOF)
  const lame = a?.lame?.cause === 'stone';
  const r0 = rng();
  const r1 = rng();
  const stoneFoot = lame ? (a.lame.foot ?? 0) % 4 : r0 < 0.6 ? Math.floor(r1 * 4) : -1;
  const hooves = PANSAGE_FEET.map((foot, i) => makeHoof(foot, i === stoneFoot, rng, dirt));
  let foot = 0;
  let footAt = 0; // quand le pied en cours est arrivé (glisse depuis le bas)
  let footDoneAt = -1; // quand le pied en cours a été fini (on passe au suivant un peu après)
  let pokeAt = -9; // dernier coup sur la fourchette (le pied bouge)
  let stoneOut = false; // le caillou enlevé
  // ---- 4. peigne : les nœuds dans les crins
  const nKnots = 2 + Math.round(dirt * 4);
  const knots = [];
  for (let i = 0; i < nKnots; i++) {
    const part = i % 2 === 0 ? 'mane' : 'tail';
    const slot = Math.floor(i / 2);
    knots.push({ part, k: part === 'mane' ? [0.3, 0.55, 0.8][slot] : [0.5, 0.75, 0.97][slot], tangle: 1, r: 12 * Math.max(0.85, s), seed: rng() * 6 });
  }

  let si = 0; // étape en cours
  let rule = null;
  let over = 0; // trop (peau frottée, fourchette, crins tirés), en unités de jauge
  let grace = 0;
  let nextMark = 0;
  const marks = [];
  let annoyed = 0; // le cheval couche les oreilles (secondes)
  let pause = 0; // entre deux étapes : on ne joue pas
  const results = [];
  let last = null;
  let lastDir = null;
  let rot = 0;
  let goodLen = 0;
  let badLen = 0;
  let saidBony = false;

  const stage = () => PANSAGE_STAGES[si];
  const stageName = (k = stage()) => t(`mg_pansage_stage_${k}`);
  const hoofBlobs = () => hooves.flatMap((hf) => hf.blobs);

  /** Ce que montre la jauge à l'étape en cours (0 → 1 = tout propre ; au-delà : trop). */
  function value() {
    const st = stage();
    let done = 0;
    if (st === 'curry') done = 1 - mud.reduce((n, q) => n + q.mud, 0) / mud.length;
    else if (st === 'brush') done = dust.length ? 1 - dust.reduce((n, q) => n + q.dust, 0) / dust.length : 1;
    else if (st === 'hoof') {
      const b = hoofBlobs();
      done = 1 - b.reduce((n, q) => n + Math.min(1, q.dirt / q.hard), 0) / b.length;
    } else done = 1 - knots.reduce((n, q) => n + q.tangle, 0) / knots.length;
    return Math.min(MAX, done + over);
  }
  const count = () => ({ curry: mud.length, brush: dust.length, hoof: hoofBlobs().length, comb: knots.length })[stage()] || 1;

  const stopBtn = ctx.stopButton(() => endStage());
  const setStopLabel = () => {
    const text = `✅ ${si < PANSAGE_STAGES.length - 1 ? t('mg_pansage_next') : t('mg_stopHere')}`;
    if (stopBtn && 'textContent' in stopBtn) stopBtn.textContent = nbsp(text);
    else if (stopBtn) stopBtn.text = text;
  };

  function startStage(i) {
    si = i;
    over = 0;
    grace = 0;
    nextMark = 0;
    marks.length = 0;
    goodLen = 0;
    badLen = 0;
    last = null;
    lastDir = null;
    const st = stage();
    if (st === 'brush') {
      // La boue décollée devient de la poussière ; un peu de poussière en plus, ailleurs.
      dust = mud.filter((q) => q.mud <= 0).map((q) => ({ x: q.x, y: q.y, r: q.r * 1.05, seed: q.seed, dust: 1 }));
      const extra = dustPatches(sh, rng, 2, 15 * Math.max(0.8, s), mud.map((q) => ({ ...q })));
      for (const q of extra.slice(mud.length)) dust.push({ x: q.x, y: q.y, r: q.r, seed: q.seed, dust: 1 });
      if (legMud) {
        // (sur le canon, sous le genou : les quatre jambes de bony)
        const y = lerp(sh.L(0, sh.ry).y, floorY, 0.68);
        legs = [sh.rx * 0.58, sh.rx * 0.58 - 10 * s, -sh.rx * 0.58, -sh.rx * 0.58 + 8 * s]
          .map((lx) => ({ x: sh.L(lx, sh.ry * 0.35).x, y, r: 11 * Math.max(0.8, s), seed: rng() * 10, dust: 1, leg: true }));
        dust.push(...legs);
      }
    }
    if (st === 'hoof') {
      foot = 0;
      footAt = ctx.time;
      footDoneAt = -1;
    }
    const n = count();
    rule = justRule(ctx, { lo: 1 - 0.5 / n, hi: st === 'hoof' ? 1.1 : 1.05, max: MAX, slack: SLACK });
    if (st === 'curry' && rolled) ctx.hint(`${t('mg_pansage_rolled', { name, g: a?.sex })} ${t('mg_pansage_curry_hint')}`);
    else if (st === 'brush' && legs.length) ctx.hint(t('mg_pansage_legmud'));
    else if (st === 'hoof' && lame) ctx.hint(t('mg_pansage_hoof_lame', { name, foot: t(`mg_pansage_foot_${PANSAGE_FEET[stoneFoot]}`) }), 'warn');
    else ctx.hint(st === 'hoof' ? `${t('mg_pansage_hoof_hint')} (${t(`mg_pansage_foot_${PANSAGE_FEET[0]}`)})` : t(`mg_pansage_${st}_hint`));
    ctx.progress(value() / MAX);
    setStopLabel();
  }

  /** ✅ : on note l'étape et on passe à la suivante (ou c'est fini). */
  function endStage() {
    if (ctx.done || pause > 0 || !rule) return;
    const v = value();
    const res = justOutcome(v, rule.lo, rule.hi, { slack: SLACK });
    results.push({ stage: stage(), value: v, lo: rule.lo, hi: rule.hi, q: res.q, verdict: res.verdict });
    last = null;
    if (si >= PANSAGE_STAGES.length - 1) return finishAll();
    fx.text(200, 120, `✓ ${stageName()}`, '#2f8a5f', 26);
    pause = PAUSE;
  }

  function finishAll() {
    // Pour le jeu : la part de terre enlevée des sabots, et le caillou (src/game/Game.js care → applyCare).
    const b = hoofBlobs();
    const cleaned = 1 - b.reduce((n, q) => n + Math.min(1, q.dirt / q.hard), 0) / b.length;
    if (ctx.opts) ctx.opts.out = { ...(ctx.opts.out ?? {}), hooves: { cleaned, stoneOut } };
    const q = results.reduce((n, r) => n + r.q, 0) / results.length;
    const worst = results.reduce((w, r) => (r.q < w.q ? r : w), results[0]);
    const just = results.every((r) => r.verdict === 'just');
    const why = just ? 'just' : worst.verdict;
    const msg = just ? t('mg_pansage_just', { name }) : t(`mg_pansage_${worst.verdict}_${worst.stage}`, { name });
    ctx.finish(q, msg, why);
  }

  // ---------------------------------------------------------------- les gestes

  /** Le doigt va de `from` à `p` (un petit bout de geste d'au moins STEP px). */
  function rub(p) {
    if (ctx.done || pause > 0) return;
    if (!last) { last = p; return; }
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    const d = Math.hypot(dx, dy);
    if (d < STEP) return;
    const dir = Math.atan2(dy, dx);
    let turn = 0;
    if (lastDir !== null) {
      let dd = dir - lastDir;
      while (dd > Math.PI) dd -= Math.PI * 2;
      while (dd < -Math.PI) dd += Math.PI * 2;
      turn = Math.min(Math.abs(dd), 0.9);
    }
    rot = lerp(rot, clamp(dx / 40, -0.5, 0.5), 0.3);
    const seg = { x0: last.x, y0: last.y, x1: p.x, y1: p.y, dx, dy, d, turn };
    const st = stage();
    if (st === 'curry') rubCurry(seg, p);
    else if (st === 'brush') rubBrush(seg, p);
    else if (st === 'hoof') pick(seg, p);
    else comb(seg, p);
    last = p;
    lastDir = dir;
    if (st === 'hoof') ctx.progress(value() / MAX);
    else rule.show(value());
    if (value() >= MAX) endStage();
  }

  const near = (q, seg, pad) => distToSegment(q.x, q.y, seg.x0, seg.y0, seg.x1, seg.y1) <= q.r + pad;
  const crumbs = (p, color) => {
    if (Math.random() < 0.5) fx.dot(p.x + (Math.random() - 0.5) * 20, p.y + 8, color, 3 + Math.random() * 3, { vx: (Math.random() - 0.5) * 60, vy: 40, grav: 140, life: 0.6 });
  };

  /** Une fois tout propre (dans la zone verte), frotter encore la peau l'irrite (comme la brosse). */
  function overdo(seg, p, onCoat, rate = 0.0002) {
    if (!onCoat || value() < rule.lo) return;
    const free = Math.min(grace, seg.d);
    grace -= free;
    over += (seg.d - free) * rate;
    if (value() > rule.hi && over >= nextMark) {
      nextMark = over + 0.06;
      marks.push({ x: p.x + (Math.random() - 0.5) * 16, y: p.y + (Math.random() - 0.5) * 12, r: 7 + Math.random() * 5, seed: Math.random() * 10 });
      fx.float(p.x, p.y - 20, '💢', 20);
      annoyed = 0.8;
    }
  }

  /** Tête ou jambes : là où l'étrille fait mal. */
  function bony(p) {
    if (dist(p.x, p.y, sh.head.x, sh.head.y) < sh.hr * 1.35) return true;
    const bottom = sh.L(0, sh.ry).y;
    if (p.y < bottom + 4 || p.y > floorY) return false;
    const legW = sh.P.legW * s;
    return [sh.rx * 0.58, sh.rx * 0.58 - 10 * s, -sh.rx * 0.58, -sh.rx * 0.58 + 8 * s]
      .some((lx) => Math.abs(p.x - sh.L(lx, sh.ry * 0.35).x) < legW * 1.3);
  }

  function rubCurry(seg, p) {
    let touched = false;
    for (const q of mud) {
      if (q.mud <= 0 || !near(q, seg, 12)) continue;
      touched = true;
      // Les ronds décollent la boue ; un trait droit, à peine.
      q.mud -= seg.turn * 0.085 + seg.d * 0.0008;
      crumbs(p, 'rgba(110, 80, 50, 0.65)');
      if (q.mud <= 0.12) {
        q.mud = 0;
        q.dust = 1;
        fx.burst(q.x, q.y, '💨', 3, { speed: 70, size: 16 });
      }
    }
    if (touched) {
      grace = 2 * sh.rx;
      if (seg.turn > 0.15) goodLen += seg.d;
      else badLen += seg.d;
      if (rule.state() === 'low') {
        if (badLen > 220 && badLen > goodLen * 1.5) ctx.hint(t('mg_pansage_curry_round'), 'warn');
        else if (goodLen > 120 && goodLen > badLen) ctx.hint(t('mg_pansage_curry_good'), 'good');
      }
    } else if (bony(p)) {
      // L'étrille sur la tête ou les jambes : ça fait mal.
      over += seg.d * 0.0004;
      annoyed = 0.8;
      if (over >= nextMark) {
        nextMark = over + 0.04;
        fx.float(p.x, p.y - 18, '💢', 20);
      }
      if (!saidBony || over > 0.02) {
        saidBony = true;
        ctx.hint(t('mg_pansage_curry_bony'), 'warn');
      }
    } else overdo(seg, p, inBody(sh, p.x, p.y, 1.1) || dist(p.x, p.y, sh.neck.x, sh.neck.y) < sh.hr * 1.2);
  }

  function rubBrush(seg, p) {
    const withHair = -seg.dx > seg.d * 0.35; // le poil va de la tête (à droite) vers la queue
    const down = seg.dy > seg.d * 0.35; // (sur les jambes, il pousse vers le bas)
    let touched = false;
    let good = false;
    let onLeg = false;
    for (const q of dust) {
      if (q.dust <= 0 || !near(q, seg, 14)) continue;
      touched = true;
      const ok = q.leg ? down : withHair;
      good = good || ok;
      onLeg = onLeg || !!q.leg;
      // (la boue des jambes, collée, part un peu moins vite)
      q.dust -= seg.d * 0.0062 * (ok ? 1 : 0.55) * (q.leg ? 0.67 : 1);
      crumbs(p, 'rgba(150, 120, 90, 0.6)');
      if (q.dust <= 0.15) {
        q.dust = 0;
        fx.burst(q.x, q.y, '✨', 3, { speed: 80, size: 16 });
        // 🧦 Ses jambes sont propres : le conseil, la première fois.
        if (q.leg && ctx.opts?.legMudTip && tipUntil < 0 && legs.every((o) => o.dust <= 0)) {
          tipUntil = ctx.time + 4;
          ctx.opts.out = { ...(ctx.opts.out ?? {}), legMudTip: true };
          ctx.hint(t('mg_pansage_legmud_tip'), 'good');
        }
      }
    }
    if (touched) {
      grace = 2 * sh.rx;
      if (good) goodLen += seg.d;
      else badLen += seg.d;
      if (rule.state() === 'low' && ctx.time >= tipUntil) {
        if (badLen > 260 && badLen > goodLen) ctx.hint(t(onLeg ? 'mg_pansage_legmud' : 'mg_brush_dir'), 'warn');
        else if (good && goodLen > 120) ctx.hint(t('mg_brush_good'), 'good');
      }
    } else overdo(seg, p, inBody(sh, p.x, p.y, 1.1));
  }

  /** Le cure-pied sur le pied en gros plan. */
  function pick(seg, p) {
    const hf = hooves[foot];
    if (!hf || footDoneAt >= 0 || ctx.time - footAt < 0.35) return;
    // Sur la fourchette (le milieu du triangle) : ça pique.
    if (inFrog(p.x, p.y) && ctx.time - pokeAt > 0.6) {
      pokeAt = ctx.time;
      over += 0.04;
      annoyed = 0.8;
      fx.float(p.x, p.y - 20, '💢', 22);
      ctx.hint(t('mg_pansage_hoof_frog'), 'warn');
      return;
    }
    const toToe = seg.dy > seg.d * 0.35; // vers le bas : du talon vers la pince
    let touched = false;
    for (const q of hf.blobs) {
      if (q.dirt <= 0 || !near(q, seg, 8)) continue;
      touched = true;
      q.dirt -= seg.d * 0.016 * (toToe ? 1 : 0.3);
      crumbs(p, 'rgba(80, 58, 38, 0.75)');
      if (q.dirt <= 0.12) {
        q.dirt = 0;
        if (q.stone) {
          stoneOut = true;
          fx.text(q.x, q.y - 30, t(lame ? 'mg_pansage_hoof_stoneLame' : 'mg_pansage_hoof_stone', { name }), '#2f8a5f', 20);
          fx.dot(q.x, q.y, '#8d8d8d', 7, { vx: 70, vy: 60, grav: 300, life: 0.8 });
        } else fx.burst(q.x, q.y, '✨', 2, { speed: 60, size: 14 });
      }
    }
    if (touched) {
      if (toToe) goodLen += seg.d;
      else badLen += seg.d;
      if (badLen > 140 && badLen > goodLen) {
        ctx.hint(t('mg_pansage_hoof_dir'), 'warn');
        badLen = 0;
        goodLen = 0;
      }
    }
    if (hf.blobs.every((q) => q.dirt <= 0)) {
      footDoneAt = ctx.time;
      fx.burst(HX, HY, '✨', 5, { speed: 110, size: 16 });
    }
  }

  // ---- crins : la crinière (le long de l'encolure) et la queue (qui bouge un peu)
  const time = () => ctx.time;
  const wagAngle = () => Math.sin(time() * 2.5) * 0.12; // comme drawAnimal (queue au repos)
  function manePoint(k) {
    const m0 = sh.L(sh.rx * 0.55, -sh.ry * 0.95);
    const m2 = { x: sh.head.x - sh.hr * 0.45, y: sh.head.y - sh.hr * 0.75 };
    const m1 = { x: lerp(m0.x, sh.head.x, 0.5) - 8 * s, y: lerp(m0.y, sh.head.y, 0.5) - 10 * s };
    return { x: quad(m0.x, m1.x, m2.x, k) - 4 * s, y: quad(m0.y, m1.y, m2.y, k) + 8 * s };
  }
  function tailPoint(k) {
    const base = sh.L(-sh.rx * 0.95, -sh.ry * 0.25);
    const lx = quad(0, -22 * s, -16 * s, k);
    const ly = quad(0, 18 * s, 70 * s, k);
    const w = -wagAngle();
    return { x: base.x + lx * Math.cos(w) - ly * Math.sin(w), y: base.y + lx * Math.sin(w) + ly * Math.cos(w) };
  }
  const knotPos = (q) => (q.part === 'mane' ? manePoint(q.k) : tailPoint(q.k));
  function onHair(p) {
    for (let k = 0; k <= 1; k += 0.125) {
      const m = manePoint(k);
      const tl = tailPoint(k);
      if (dist(p.x, p.y, m.x, m.y) < 16 * s || dist(p.x, p.y, tl.x, tl.y) < 16 * s) return true;
    }
    return false;
  }

  function comb(seg, p) {
    const down = seg.dy > seg.d * 0.3;
    let touched = false;
    for (const q of knots) {
      if (q.tangle <= 0) continue;
      const kp = knotPos(q);
      if (distToSegment(kp.x, kp.y, seg.x0, seg.y0, seg.x1, seg.y1) > q.r + 12) continue;
      touched = true;
      q.tangle -= seg.d * (down ? 0.014 : 0.004);
      if (q.tangle <= 0.12) {
        q.tangle = 0;
        fx.burst(kp.x, kp.y, '✨', 3, { speed: 70, size: 14 });
      }
    }
    if (touched) {
      grace = 120;
      if (down) goodLen += seg.d;
      else badLen += seg.d;
      if (rule.state() === 'low') {
        if (badLen > 120 && badLen > goodLen) ctx.hint(t('mg_pansage_comb_dir'), 'warn');
        else if (down && goodLen > 80) ctx.hint(t('mg_pansage_comb_good'), 'good');
      }
    } else overdo(seg, p, onHair(p), 0.0004);
  }

  startStage(0);

  return {
    peek: () => ({
      stage: stage(), si, value: value(), lo: rule.lo, hi: rule.hi, max: MAX, over, pause,
      results: results.map((r) => ({ ...r })),
      mud: mud.filter((q) => q.mud > 0).map(({ x, y, r, mud: m }) => ({ x, y, r, mud: m })),
      dust: dust.filter((q) => q.dust > 0).map(({ x, y, r, dust: m, leg }) => ({ x, y, r, dust: m, leg: !!leg })),
      foot: PANSAGE_FEET[foot] ?? null, footIndex: foot, footReady: ctx.time - footAt >= 0.35 && footDoneAt < 0,
      blobs: (hooves[foot]?.blobs ?? []).filter((q) => q.dirt > 0).map(({ x, y, r, dirt: m, stone }) => ({ x, y, r, dirt: m, stone: !!stone })),
      frog: { x: HX, y: HY - 20 },
      knots: knots.filter((q) => q.tangle > 0).map((q) => ({ ...knotPos(q), r: q.r, tangle: q.tangle, part: q.part })),
      head: { x: sh.head.x, y: sh.head.y, r: sh.hr },
      body: { x: sh.bx, y: sh.by, rx: sh.rx, ry: sh.ry },
      legs: [sh.rx * 0.58, -sh.rx * 0.58].map((lx) => ({ x: sh.L(lx, 0).x, y: lerp(sh.L(0, sh.ry).y, floorY, 0.5) })),
    }),
    down(p) { last = p; lastDir = null; },
    move(p, isDown) { if (isDown) rub(p); },
    up() { last = null; lastDir = null; grace = 0; },
    key(code, isDown) { if (isDown && (code === 'Space' || code === 'Enter' || code === 'NumpadEnter')) endStage(); },
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
      // Pied propre : on passe au suivant, puis à l'étape suivante après le dernier.
      if (stage() === 'hoof' && footDoneAt >= 0 && ctx.time - footDoneAt > 0.7 && !ctx.done) {
        if (foot < hooves.length - 1) {
          foot++;
          footAt = ctx.time;
          footDoneAt = -1;
          badLen = 0;
          goodLen = 0;
          ctx.hint(t('mg_pansage_hoof_next', { foot: t(`mg_pansage_foot_${PANSAGE_FEET[foot]}`) }), 'good');
        } else {
          footDoneAt = -1;
          endStage();
        }
      }
    },
    draw(g) {
      const st = stage();
      const v = value();
      const zone = rule ? (v < rule.lo ? 'low' : v > rule.hi ? 'high' : 'just') : 'low';
      if (st === 'hoof' && pause <= 0) drawHoofScene(g, ctx, hooves[foot], foot, Math.max(0, 1 - (ctx.time - footAt) / 0.35), ctx.time - pokeAt < 0.5 ? 1 - (ctx.time - pokeAt) / 0.5 : 0);
      else {
        groomBackground(g, ctx, floorY);
        drawAnimal(g, a, {
          x: fit.x, y: floorY, s, f: 1, time: ctx.time,
          happy: zone === 'just' && annoyed <= 0, wag: ctx.done && zone !== 'high',
          earsBack: annoyed > 0 || zone === 'high', shake: annoyed > 0 && ctx.pointer.down ? 0.4 : 0,
        });
        // Boue sèche (craquelée), puis poussière décollée
        for (const q of mud) if (q.mud > 0) drawMud(g, q);
        const dusty = st === 'curry' ? mud.filter((q) => q.mud <= 0) : dust;
        for (const q of dusty) if (q.dust > 0) drawDust(g, q);
        if (st === 'brush' && pause <= 0 && dust.some((q) => q.dust > 0)) {
          g.save();
          g.globalAlpha = 0.45 + Math.sin(ctx.time * 3) * 0.15;
          if (dust.some((q) => q.dust > 0 && !q.leg)) {
            for (let i = -1; i <= 1; i++) {
              const p = sh.L(i * sh.rx * 0.45, -sh.ry * 0.05);
              label(g, '‹‹', p.x, p.y, 22, '#ffffff');
            }
          }
          // (🧦 jambes : de haut en bas, une flèche par paire de jambes)
          for (let i = 0; i + 1 < legs.length; i += 2) {
            if (legs[i].dust > 0 || legs[i + 1].dust > 0) label(g, '↓', (legs[i].x + legs[i + 1].x) / 2, legs[i].y - legs[i].r * 2, 18, '#ffffff');
          }
          g.restore();
        }
        if (st === 'comb' || (st === 'hoof' && pause > 0)) for (const q of knots) if (q.tangle > 0) drawKnot(g, knotPos(q), q, s);
        for (const m of marks) {
          g.save();
          g.globalAlpha = 0.55;
          g.fillStyle = '#f08ba3';
          ellipse(g, m.x, m.y, m.r, m.r * 0.7, m.seed);
          g.fill();
          g.restore();
        }
      }
      if (rule && pause <= 0) rule.dial(g, v, st === 'hoof' ? 354 : dialX(sh));
      drawStagePill(g, si, stageName(), st === 'hoof' && pause <= 0 ? foot : -1, t);
      drawTray(g, si, results, pause > 0, ctx.time);
      const pp = ctx.pointer;
      if ((pp.over || pp.down) && !ctx.done && pause <= 0) drawTool(g, st, pp.x, pp.y, rot);
    },
  };
}

const quad = (a, b, c, k) => (1 - k) * (1 - k) * a + 2 * (1 - k) * k * b + k * k * c;

// ---------------------------------------------------------------- le pied

/** Un pied à curer : de la terre tassée le long de la fourchette et à la pince (et parfois un caillou). */
function makeHoof(foot, stone, rng, dirt) {
  const blobs = [];
  for (const side of [-1, 1]) {
    for (const k of [0.12, 0.45, 0.78]) {
      blobs.push({ x: HX + side * lerp(46, 14, k), y: lerp(HY - 78, HY + 58, k), r: 15, dirt: 1, hard: 1, seed: rng() * 6 });
    }
  }
  const toe = dirt > 0.4 ? [-36, 0, 36] : [-30, 30];
  for (const dx of toe) blobs.push({ x: HX + dx, y: HY + 86 - Math.abs(dx) * 0.25, r: 14, dirt: 1, hard: 1, seed: rng() * 6 });
  if (stone) {
    const q = blobs[Math.floor(rng() * 6)];
    q.stone = true;
    q.dirt = 1.6;
    q.hard = 1.6;
  }
  return { foot, blobs };
}

/** Le milieu de la fourchette (le triangle du pied, en plus petit) : sensible. */
function inFrog(x, y) {
  const top = HY - 70;
  const tip = HY + 36;
  if (y < top || y > tip) return false;
  const half = 22 * (1 - (y - top) / (tip - top));
  return Math.abs(x - HX) < half;
}

/** Le pied levé, vu de dessous : les talons en haut (côté jambe), la pince en bas. */
function drawHoofScene(g, ctx, hf, foot, slide, shake) {
  const v = ctx.view;
  g.fillStyle = '#d9c39a';
  g.fillRect(v.x0, v.y0, v.w, v.h);
  // paille au sol
  g.strokeStyle = 'rgba(176, 140, 70, 0.5)';
  g.lineWidth = 3;
  for (let i = 0; i < 26; i++) {
    const x = 10 + ((i * 97) % 380);
    const y = 300 + ((i * 53) % 60);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 18, y - 6 + (i % 3) * 4);
    g.stroke();
  }
  if (!hf) return;
  g.save();
  g.translate(shake ? Math.sin(ctx.time * 60) * 5 * shake : 0, slide * 220);
  const col = ctx.col;
  const legCol = col?.raw?.pattern === 'socks' ? col.sec : col?.coat ?? '#8a5a2b';
  // jambe repliée
  g.fillStyle = legCol;
  rrect(g, HX - 44, v.y0 - 30, 88, HY - 70 - (v.y0 - 30), 28);
  g.fill();
  // fanons
  g.strokeStyle = col?.mane ?? '#3b2a1e';
  g.lineWidth = 3;
  for (let i = -4; i <= 4; i++) {
    g.beginPath();
    g.moveTo(HX + i * 9, HY - 96);
    g.lineTo(HX + i * 10, HY - 80);
    g.stroke();
  }
  // paroi, ligne blanche, sole
  g.fillStyle = '#4f3d2f';
  ellipse(g, HX, HY, 100, 110);
  g.fill();
  g.fillStyle = '#d9c7a4';
  ellipse(g, HX, HY + 4, 88, 98);
  g.fill();
  g.fillStyle = '#a78b6d';
  ellipse(g, HX, HY + 6, 80, 90);
  g.fill();
  // glomes (talons) en haut
  g.fillStyle = '#6e5644';
  ellipse(g, HX - 32, HY - 86, 30, 18);
  g.fill();
  ellipse(g, HX + 32, HY - 86, 30, 18);
  g.fill();
  // fourchette : le triangle, pointe vers la pince
  g.fillStyle = '#8c6c55';
  g.beginPath();
  g.moveTo(HX - 40, HY - 84);
  g.quadraticCurveTo(HX, HY - 70, HX + 40, HY - 84);
  g.lineTo(HX + 6, HY + 64);
  g.quadraticCurveTo(HX, HY + 70, HX - 6, HY + 64);
  g.closePath();
  g.fill();
  g.strokeStyle = '#6a503e';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(HX, HY - 74);
  g.lineTo(HX, HY - 10);
  g.stroke();
  // la terre, le caillou
  for (const q of hf.blobs) {
    if (q.dirt <= 0) continue;
    const k = Math.min(1, q.dirt / q.hard);
    g.save();
    g.globalAlpha = 0.3 + 0.7 * k;
    g.fillStyle = '#4a3524';
    ellipse(g, q.x, q.y, q.r, q.r * 0.8, q.seed);
    g.fill();
    g.fillStyle = '#6b5039';
    for (let i = 0; i < 4; i++) {
      const ang = q.seed + i * 1.6;
      circle(g, q.x + Math.cos(ang) * q.r * 0.45, q.y + Math.sin(ang) * q.r * 0.35, 3);
      g.fill();
    }
    g.restore();
    if (q.stone) emoji(g, '🪨', q.x, q.y, 20);
  }
  // sens du geste : du talon vers la pince
  if (hf.blobs.some((q) => q.dirt > 0)) {
    g.save();
    g.globalAlpha = 0.5 + Math.sin(ctx.time * 4) * 0.2;
    label(g, '↓', HX - 64, HY - 10, 26, '#ffffff');
    label(g, '↓', HX + 64, HY - 10, 26, '#ffffff');
    g.restore();
  }
  g.restore();
}

// ---------------------------------------------------------------- dessins

function drawMud(g, q) {
  g.save();
  g.globalAlpha = 0.35 + 0.6 * q.mud;
  g.fillStyle = '#5c3f24';
  ellipse(g, q.x, q.y, q.r, q.r * 0.78, q.seed);
  g.fill();
  // craquelures
  g.strokeStyle = '#8d6b47';
  g.lineWidth = 1.6;
  for (let i = 0; i < 3; i++) {
    const ang = q.seed + i * 2.1;
    g.beginPath();
    g.moveTo(q.x, q.y);
    g.lineTo(q.x + Math.cos(ang) * q.r * 0.7, q.y + Math.sin(ang) * q.r * 0.5);
    g.stroke();
  }
  g.restore();
}

function drawDust(g, q) {
  g.save();
  g.globalAlpha = 0.25 + 0.6 * q.dust;
  // (🧦 la boue d'une jambe : plus foncée, en long sur la jambe)
  g.fillStyle = q.leg ? '#6b4a2b' : '#a88a63';
  if (q.leg) ellipse(g, q.x, q.y, q.r * 0.75, q.r * 1.1);
  else ellipse(g, q.x, q.y, q.r, q.r * 0.75, q.seed);
  g.fill();
  g.fillStyle = '#7d6343';
  for (let i = 0; i < 6; i++) {
    const ang = q.seed + i * 1.1;
    circle(g, q.x + Math.cos(ang) * q.r * 0.55, q.y + Math.sin(ang) * q.r * 0.4, 2.2);
    g.fill();
  }
  g.restore();
}

function drawKnot(g, p, q, s) {
  g.save();
  g.globalAlpha = 0.4 + 0.6 * q.tangle;
  g.strokeStyle = '#2c2119';
  g.lineWidth = 2.2 * Math.max(0.8, s);
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.ellipse(p.x + Math.cos(q.seed + i * 2) * 3, p.y + Math.sin(q.seed + i * 2) * 3, q.r * 0.7, q.r * 0.45, q.seed + i, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

/** En haut : « 2/4 · Brosse » (et au cure-pied, les quatre pieds ●●○○). */
function drawStagePill(g, si, name, foot, t) {
  const text = `${si + 1}/${PANSAGE_STAGES.length} · ${name}`;
  g.save();
  g.fillStyle = 'rgba(255,255,255,0.88)';
  rrect(g, 200 - 78, 8, 156, 30, 15);
  g.fill();
  label(g, text, 200, 23, 16, '#23302a');
  if (foot >= 0) {
    rrect(g, 200 - 78, 42, 156, 26, 13);
    g.fill();
    label(g, t(`mg_pansage_foot_${PANSAGE_FEET[foot]}`), 200, 55, 13, '#5a4636');
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i < foot ? '#1e8a4a' : i === foot ? '#f2c84b' : '#d9d2c2';
      circle(g, 200 - 18 + i * 12, 76, 4);
      g.fill();
    }
  }
  g.restore();
}

/** En bas : les quatre outils, celui qu'on tient en jaune, ceux déjà passés cochés. */
function drawTray(g, si, results, pausing, time) {
  PANSAGE_STAGES.forEach((st, i) => {
    const x = 200 + (i - 1.5) * 50;
    const y = 333;
    const cur = i === si && !pausing;
    g.save();
    g.fillStyle = cur ? '#fff6d6' : 'rgba(255,255,255,0.8)';
    circle(g, x, y, 20);
    g.fill();
    if (cur || (pausing && i === si + 1)) {
      g.strokeStyle = '#f2c84b';
      g.lineWidth = 4;
      circle(g, x, y, 20 + (pausing ? Math.sin(time * 10) * 2 : 0));
      g.stroke();
    }
    drawTool(g, st, x, y + 2, 0, 0.5, true);
    const r = results[i];
    if (r) {
      g.fillStyle = r.verdict === 'just' ? '#1e8a4a' : '#e0a030';
      circle(g, x + 15, y - 14, 8);
      g.fill();
      label(g, r.verdict === 'just' ? '✓' : '~', x + 15, y - 13, 12, '#ffffff');
    }
    g.restore();
  });
}

/** L'outil dans la main (ou en petit dans le plateau). */
function drawTool(g, st, x, y, rot = 0, k = 1, icon = false) {
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  if (st === 'curry') {
    // étrille en caoutchouc : un ovale rouge à picots en cercles, sanglé sur la main
    g.rotate(rot);
    g.fillStyle = '#c0392b';
    ellipse(g, 0, icon ? 0 : -6, 26, 18);
    g.fill();
    g.strokeStyle = '#8e2a20';
    g.lineWidth = 2.4;
    for (const r of [8, 14, 20]) {
      g.beginPath();
      g.ellipse(0, icon ? 0 : -6, r, r * 0.68, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#333a40';
    rrect(g, -18, (icon ? 0 : -6) - 22, 36, 8, 4);
    g.fill();
  } else if (st === 'brush') {
    if (icon) g.translate(0, 4);
    drawBrush(g, 0, icon ? -4 : -6, rot);
  } else if (st === 'hoof') {
    // cure-pied : manche bleu, crochet en métal (la pointe est sous le doigt)
    g.rotate(icon ? 0.5 : 0.35);
    g.strokeStyle = '#9aa3ab';
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, icon ? 12 : 0);
    g.quadraticCurveTo(-10, (icon ? 12 : 0) - 6, -4, (icon ? 12 : 0) - 18);
    g.stroke();
    g.fillStyle = '#3c7bd9';
    rrect(g, -9, (icon ? 12 : 0) - 62, 18, 46, 8);
    g.fill();
  } else {
    // peigne : dos clair, dents vers le bas
    g.rotate(icon ? -0.2 : 0);
    g.fillStyle = '#e2b55c';
    rrect(g, -26, -14, 52, 10, 4);
    g.fill();
    g.strokeStyle = '#c99a3d';
    g.lineWidth = 2.4;
    for (let i = -22; i <= 22; i += 4.4) {
      g.beginPath();
      g.moveTo(i, -5);
      g.lineTo(i, 8);
      g.stroke();
    }
  }
  g.restore();
}
