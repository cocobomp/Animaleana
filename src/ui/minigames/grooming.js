// Mini-jeux de toilette : brosser, laver, couper les griffes, ferrer, tondre.
//
// Règle « juste ce qu'il faut » (score.js, via ctx.zone / ctx.finishJust) : chaque jeu a une
// quantité idéale — pelage démêlé sans insister, mousse, longueur de griffe coupée, coups de
// marteau par clou, laine laissée — montrée sur la jauge (bande verte) et dans la scène
// (cadran, repères). Un peu trop peu ou un peu trop : moins de points, pareil des deux côtés.

import { drawAnimal, animalShape, fitAnimal, inBody, rrect, ellipse, circle, emoji, label, fillView, sky, tiles, clamp, lerp, dist, distToSegment, shade, css, mix } from './draw.js';
import { isBig } from './food.js';
import { justRight } from './score.js';

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

/**
 * Texte traduit s'il existe, sinon un texte de secours (pour une clé pas encore ajoutée dans
 * i18n.js : t() renvoie alors la clé elle-même).
 */
function tOr(t, key, fallback, params) {
  const s = t(key, params);
  return s === key ? fallback : s;
}

/** Consigne quand on est dans la zone verte : c'est le bouton ✅ qui termine (pas « lâcher »). */
const pressStopHint = (t) => tOr(t, 'mg_pressStop', `${t('mg_perfect')} 👉 ✅ ${t('mg_stopHere')}`);

/** Où poser le cadran : dans le coin du haut opposé à la tête, pour ne pas la cacher. */
const dialX = (sh) => (sh.head.x > 200 ? 46 : 354);

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

// ---------------------------------------------------------------- « juste ce qu'il faut »

/**
 * Petit cadran dans la scène : l'arc vert est la zone juste [lo, hi] (sur 0 → max), le point
 * est la valeur. Bleu : pas encore assez ; vert (✓) : juste ; rouge (!) : trop.
 */
function drawDial(g, x, y, value, lo, hi, max, r = 24) {
  const A0 = Math.PI * 0.75;
  const A1 = Math.PI * 2.25;
  const ang = (v) => A0 + (A1 - A0) * clamp(v / max);
  const state = value < lo ? 'low' : value > hi ? 'high' : 'just';
  const col = state === 'low' ? '#3c7bd9' : state === 'high' ? '#e0574a' : '#1e8a4a';
  g.save();
  g.fillStyle = 'rgba(255,255,255,0.88)';
  circle(g, x, y, r + 11);
  g.fill();
  g.lineCap = 'round';
  g.strokeStyle = '#d9d2c2';
  g.lineWidth = 9;
  g.beginPath();
  g.arc(x, y, r, A0, A1);
  g.stroke();
  g.lineCap = 'butt';
  g.strokeStyle = '#3fae62';
  g.lineWidth = 11;
  g.beginPath();
  g.arc(x, y, r, ang(lo), ang(hi));
  g.stroke();
  g.lineCap = 'round';
  if (value > 0) {
    g.strokeStyle = col;
    g.lineWidth = 5;
    g.beginPath();
    g.arc(x, y, r, A0, ang(value));
    g.stroke();
  }
  const av = ang(value);
  g.fillStyle = col;
  circle(g, x + Math.cos(av) * r, y + Math.sin(av) * r, 6.5);
  g.fill();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 2;
  g.stroke();
  if (state !== 'low') label(g, state === 'just' ? '✓' : '!', x, y + 1, 22, col);
  g.restore();
}

/**
 * Suivi « juste ce qu'il faut » d'un jeu qui s'arrête au bouton ✅ : la zone [lo, hi] sur la
 * jauge (qui va de 0 à max), les consignes quand on entre dans la zone ou qu'on la dépasse,
 * le cadran dans la scène et la note finale (ctx.finishJust).
 */
function justRule(ctx, { lo, hi, max, slack, msgs }) {
  const { t } = ctx;
  const name = ctx.a?.name ?? ctx.name;
  ctx.zone(lo / max, hi / max);
  let state = 'low';
  return {
    lo,
    hi,
    max,
    state: () => state,
    /** Met la jauge à jour ; dit « C'est bon » en entrant dans la zone, « Un peu trop » au-delà. */
    show(value) {
      ctx.progress(value / max);
      if (ctx.done) return state;
      const s = value < lo ? 'low' : value > hi ? 'high' : 'just';
      if (s !== state) {
        state = s;
        if (s === 'just') ctx.hint(pressStopHint(t), 'good');
        else if (s === 'high') ctx.hint(t('mg_tooMuch', { name }), 'warn');
      }
      return state;
    },
    dial(g, value, x = 354, y = 50) { drawDial(g, x, y, value, lo, hi, max); },
    finish(value) {
      // Un cheveu hors de la zone (la note arrondie fait 1,00 : trois étoiles) compte comme
      // juste, sinon la carte de fin dirait « Un peu trop ! » sous « Bravo ! ★★★ ».
      const v = justRight(value, lo, hi, { slack }) >= 0.995 ? clamp(value, lo, hi) : value;
      return ctx.finishJust(v, lo, hi, { who: name, slack, msgs });
    },
  };
}

// ---------------------------------------------------------------- brosser

/**
 * Taches de poussière bien séparées, toutes sur le pelage : on essaie un rayon, et s'il ne
 * laisse pas la place pour `count` taches, on recommence un peu plus petit. Deux taches
 * gardent toujours un petit jour entre elles (cercles écartés de 6 %, quelle que soit la
 * rotation de l'ellipse dessinée) : avant, rayon 0,62 × l'écart = diamètre plus grand que
 * l'écart, et sur la chèvre, la vache ou le cheval les taches se fondaient en une seule plaque.
 * fixed : taches déjà posées (le garrot du cheval), que les autres évitent.
 */
function dustPatches(sh, rng, count, r0, fixed = []) {
  let patches = fixed.slice();
  for (let r = r0; r > 6; r *= 0.92) {
    patches = fixed.slice();
    for (let tries = 0; patches.length < count + fixed.length && tries < 300; tries++) {
      const lx = (rng() * 2 - 1) * sh.rx;
      const ly = (rng() * 2 - 1) * sh.ry;
      const rr = r * (0.9 + rng() * 0.2);
      // La tache entière reste sur le corps (pas à cheval sur le ventre ou le dos).
      if (((Math.abs(lx) + rr * 0.75) / sh.rx) ** 2 + ((Math.abs(ly) + rr * 0.75) / sh.ry) ** 2 > 1) continue;
      const p = sh.L(lx, ly);
      if (patches.some((q) => dist(q.x, q.y, p.x, p.y) < (q.r + rr) * 1.06)) continue;
      patches.push({ ...p, r: rr, dirt: 1, seed: rng() * 10 });
    }
    if (patches.length >= count + fixed.length) break;
  }
  return patches;
}

/**
 * Brosser : enlever les taches de poussière (0 → 1 sur la jauge) puis s'arrêter avec ✅.
 * Juste : de « une demi-tache qui reste » (1 − 0,5 / nombre de taches) à 1,05. Laisser une
 * tache entière, c'est trop peu (avant, avec lo = 0,85, une tache sur 7 pouvait rester sale
 * et la carte disait « Juste ce qu'il fallait »). Continuer à frotter le poil une fois dans la
 * zone irrite la peau (marques roses, 💢) : la jauge monte jusqu'à 1,4 et le jeu finit tout
 * seul si on y arrive.
 */
export function brushGame(ctx) {
  const { a, t, fx } = ctx;
  const floorY = 305;
  const fit = fitAnimal(a, { groundY: floorY, maxW: 340, maxH: 255 });
  const sh = animalShape(a, { x: fit.x, y: floorY, s: fit.s, f: 1 });
  const tailDir = -1; // le poil va de la tête (à droite) vers la queue (à gauche)
  const rng = ctx.rng;
  // 7 taches pour toutes les espèces (avec 4, en laisser une suffisait à sortir de la zone),
  // plus une sur le garrot du cheval.
  const neck = a.species === 'horse' ? [{ ...sh.neck, r: 16 * fit.s, dirt: 1, seed: 3 }] : [];
  const patches = dustPatches(sh, rng, 7, 20 * Math.max(0.8, fit.s), neck);
  const MAX = 1.4;
  // Irritation par pixel frotté dans la zone sans toucher de poussière : un trait de plus sur
  // le corps (≈ 200 px) reste dans la zone (+0,04), deux traits en sortent.
  const OVER_RATE = 0.0002;
  // Sursis : après la dernière poussière touchée, la fin du geste (jusqu'à une longueur de
  // corps) ne compte pas (on ne lève pas le doigt pile au bon pixel). Avant, le sursis durait
  // jusqu'à ce qu'on lève le doigt : un enfant qui frottait sans jamais lever le doigt
  // pouvait brosser à l'infini sans jamais être « trop ».
  const GRACE_PX = 2 * sh.rx;
  let grace = 0; // pixels encore sans irritation dans ce trait
  const rule = justRule(ctx, { lo: 1 - 0.5 / patches.length, hi: 1.05, max: MAX, slack: 0.3 });
  let over = 0; // brossage « à vide » dans la zone, en unités de jauge
  let nextMark = 0; // prochaine marque d'irritation (la première : en sortant de la zone)
  const marks = []; // marques roses sur la peau
  let good = 0;
  let bad = 0;
  let last = null;
  let rot = 0;
  let shine = 0;

  ctx.hint(t('mg_brush_hint'));

  const clean = () => 1 - patches.reduce((s, p) => s + p.dirt, 0) / patches.length;
  const value = () => Math.min(MAX, clean() + over);
  const stop = () => { if (!ctx.done) rule.finish(value()); };
  ctx.stopButton(stop);

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
      grace = GRACE_PX;
      if (rule.state() === 'low') {
        if (bad > 260 && bad > good) ctx.hint(t('mg_brush_dir'), 'warn');
        else if (withHair && good > 120) ctx.hint(t('mg_brush_good'), 'good');
      }
    } else if (value() >= rule.lo && inBody(sh, p.x, p.y, 1.1)) {
      // Dans la zone (« C'est bon ! ») : continuer à frotter le poil propre irrite la peau.
      const free = Math.min(grace, d);
      grace -= free;
      over += (d - free) * OVER_RATE;
      if (value() > rule.hi && over >= nextMark) {
        nextMark = over + 0.06;
        marks.push({ x: p.x + (Math.random() - 0.5) * 16, y: p.y + (Math.random() - 0.5) * 12, r: 7 + Math.random() * 5, seed: Math.random() * 10 });
        fx.float(p.x, p.y - 20, '💢', 20);
      }
    }
    last = p;
    rule.show(value());
    if (value() >= MAX) stop();
  }

  return {
    peek: () => ({
      value: value(), lo: rule.lo, hi: rule.hi, max: MAX, clean: clean(), over,
      body: { x: sh.bx, y: sh.by, rx: sh.rx, ry: sh.ry }, head: sh.head,
      patches: patches.filter((q) => q.dirt > 0).map((q) => ({ x: q.x, y: q.y, r: q.r, dirt: q.dirt })),
      n: patches.length, marks: marks.length,
    }),
    down(p) { last = p; grace = 0; },
    move(p, down) { if (down) rub(p); },
    up() { last = null; grace = 0; },
    key(code, down) { if (down && (code === 'Space' || code === 'Enter' || code === 'NumpadEnter')) stop(); },
    update(dt) { if (ctx.done || clean() >= 0.999) shine += dt; },
    draw(g) {
      groomBackground(g, ctx, floorY);
      const st = rule.state();
      drawAnimal(g, a, { x: fit.x, y: floorY, s: fit.s, f: 1, happy: st === 'just' || (ctx.done && over < 0.1), wag: ctx.done && st !== 'high', earsBack: st === 'high', shake: st === 'high' && !ctx.done && ctx.pointer.down ? 0.4 : 0 });
      // Sens du poil (tant qu'il reste des taches)
      if (!ctx.done && clean() < 0.999) {
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
      // Peau irritée (brossé trop longtemps)
      for (const m of marks) {
        g.save();
        g.globalAlpha = 0.55;
        g.fillStyle = '#f08ba3';
        ellipse(g, m.x, m.y, m.r, m.r * 0.7, m.seed);
        g.fill();
        g.restore();
      }
      // Le poil brille : c'est le moment de s'arrêter
      if (clean() >= 0.999 && st !== 'high') {
        for (let i = 0; i < 4; i++) {
          const p = sh.L(Math.cos(shine * 2 + i * 1.6) * sh.rx * 0.6, Math.sin(shine * 3 + i) * sh.ry * 0.5);
          emoji(g, '✨', p.x, p.y, 18, 0, 0.8);
        }
      }
      rule.dial(g, value(), dialX(sh));
      const pp = ctx.pointer;
      if ((pp.over || pp.down) && !ctx.done) drawBrush(g, pp.x, pp.y - 6, rot);
    },
  };
}

// ---------------------------------------------------------------- laver

/**
 * Laver : savonner (la jauge monte avec la part du corps bien savonnée) puis ✅, et rincer.
 * Juste : 0,85 à 1,05 (une passe partout = 1). Une fois dans la zone, continuer à frotter
 * sur la mousse en met trop (la jauge dépasse, jusqu'à 1,5 : long à rincer) ; pas assez :
 * la boue reste. La note vient de la mousse au moment du ✅.
 * Avant, chaque passe qui chevauchait la précédente ajoutait du surplus : une seule passe
 * normale (rangées qui se recouvrent) donnait déjà 1,2 à 1,3, donc « trop » pour un travail juste.
 */
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
    peak: 0, // le plus de mousse qu'il y a eu (la boue part à partir de 0,7)
    mud: ctx.rng() < 0.45,
    k: ctx.rng(),
    // petites bulles autour du point
    b: [0, 1, 2].map(() => ({ dx: (ctx.rng() - 0.5) * step * 0.9, dy: (ctx.rng() - 0.5) * step * 0.9, r: 0.35 + ctx.rng() * 0.5 })),
  }));
  const SOAP_MAX = 1.5; // mousse par point : 1 = bien savonné, au-delà = mousse en trop (dessin, rinçage)
  const MAX = 1.5;
  const LO = 0.85;
  const OVER_RATE = 0.00025; // mousse en trop par pixel frotté ensuite (un trait sur le corps ≈ +0,05)
  let over = 0; // mousse en trop, en unités de jauge
  const GRACE_PX = sh.rx;
  let grace = 0; // pixels encore sans mousse en trop dans ce trait
  let spare = 3 * sh.rx; // frottage « pour rien » encore permis dans la zone
  const rule = justRule(ctx, { lo: LO, hi: 1.05, max: MAX, slack: 0.3 });
  let phase = 'soap';
  let soapValue = 0; // mousse au moment du ✅ (c'est elle qui est notée)
  let last = null;
  let shake = 0;
  let spray = 0;
  // Rinçage sans viser : le bouton 🚿 (ou Espace / Entrée) gardé appuyé promène la douche
  // tout seul sur l'animal (clavier, une main). Le bouton garde aussi la place des
  // commandes : la fenêtre ne saute pas quand le ✅ disparaît.
  let auto = false;
  let autoT = 0;
  let sprayAt = null; // où arrose la douche en ce moment ({ x, y }), ou null
  const top = Math.min(sh.by - sh.ry, sh.head.y - sh.hr) - 30;
  const bottom = sh.by + sh.ry;
  const autoX0 = sh.bx - sh.rx - 10;
  const autoX1 = Math.max(sh.bx + sh.rx, sh.head.x + sh.hr) + 10;
  const autoYs = bottom - top > 120 ? [top, top + 100] : [top];

  ctx.hint(t('mg_wash_hint'));

  const frac = (fn) => cells.filter(fn).length / cells.length;
  const covered = () => frac((c) => c.soap >= 1);
  // Mousse : part des points bien savonnés (≥ 1) + mousse en trop (frotté sur la mousse dans la zone).
  const soapNow = () => Math.min(MAX, covered() + over);
  const value = () => (phase === 'soap' ? soapNow() : soapValue);

  function scrub(p) {
    if (!last) { last = p; return; }
    const d = dist(p.x, p.y, last.x, last.y);
    const near = cells.filter((c) => distToSegment(c.x, c.y, last.x, last.y, p.x, p.y) < 26);
    // Mousse en trop : les bouts de trait qui ne passent que sur des endroits déjà bien
    // savonnés, une fois dans la zone. Un trait qui savonne encore un endroit neuf ne compte
    // jamais en trop, ni la fin du geste juste après (une demi-longueur de corps : bouts de
    // rangées qui repassent sur la rangée d'avant). Dans la zone, on a aussi droit à un peu
    // de frottage « pour rien » (une longueur et demie de corps : une rangée de trop, chercher
    // un coin oublié) ; au-delà, tout compte.
    // Avant, la mousse en trop ne comptait qu'à 97 % du corps savonné : s'il manquait un coin
    // (une oreille, le haut de la tête), on pouvait frotter à l'infini sans jamais être « trop ».
    let extra = 0; // pixels de ce bout de trait qui mettent de la mousse en trop
    if (near.some((c) => c.soap < 1)) grace = GRACE_PX;
    else if (near.length) {
      const free = Math.min(grace, d);
      grace -= free;
      let rest = d - free;
      if (covered() >= LO) {
        const s2 = Math.min(spare, rest);
        spare -= s2;
        rest -= s2;
      } else rest = 0;
      extra = rest;
    }
    for (const c of near) {
      // Jusqu'à 1 la mousse monte vite (une passe suffit).
      if (c.soap < 1) c.soap = Math.min(1, c.soap + d * 0.022 + 0.04);
      else if (extra > 0) c.soap = Math.min(SOAP_MAX, c.soap + extra * 0.004); // la mousse gonfle
      c.peak = Math.max(c.peak, c.soap);
      if (Math.random() < 0.15) fx.dot(c.x, c.y, '', 4 + Math.random() * 5, { vy: -30 - Math.random() * 30, life: 0.9, bubble: true });
    }
    over += extra * OVER_RATE;
    last = p;
    rule.show(soapNow());
    if (soapNow() >= MAX - 0.08) toRinse();
  }

  /** ✅ : on garde la mousse telle quelle pour la note, et on passe au rinçage. */
  function toRinse() {
    if (ctx.done || phase !== 'soap') return;
    soapValue = soapNow();
    phase = 'rinse';
    last = null;
    ctx.zone(null);
    ctx.progress(0);
    ctx.clearButtons();
    const shower = ctx.button('🚿 💦', { cls: 'primary', hold: true, onDown: () => { auto = true; }, onUp: () => { auto = false; } });
    // Bouton sans texte : un nom pour les lecteurs d'écran (la consigne du rinçage).
    shower?.setAttribute?.('aria-label', t('mg_wash_rinse'));
    ctx.hint(t('mg_wash_rinse'), 'good');
    fx.text(200, 80, t('mg_good'), '#2f8a5f', 26);
  }
  ctx.stopButton(toRinse);

  return {
    peek: () => ({
      phase, value: value(), lo: rule.lo, hi: rule.hi, max: MAX, over,
      soaped: covered(), rinsed: frac((c) => c.soap <= 0.05),
      body: { x: sh.bx, y: sh.by, rx: sh.rx, ry: sh.ry }, head: sh.head,
    }),
    down(p) { last = p; grace = 0; },
    move(p, down) { if (down && phase === 'soap') scrub(p); },
    up() { last = null; grace = 0; },
    key(code, down) {
      if (code !== 'Space' && code !== 'Enter' && code !== 'NumpadEnter') return;
      if (phase === 'soap') { if (down) toRinse(); } else auto = down;
    },
    update(dt) {
      if (ctx.done) {
        shake = Math.max(0, shake - dt * 0.8);
        sprayAt = null;
        return;
      }
      if (phase !== 'rinse') return;
      const pp = ctx.pointer;
      sprayAt = null;
      if (pp.down) sprayAt = { x: pp.x, y: pp.y };
      else if (auto) {
        // Aller-retour de gauche à droite, une rangée en haut puis une plus bas.
        autoT += dt * 0.45; // ≈ 2 s par aller : la mousse part derrière la douche en une passe
        const leg = Math.floor(autoT);
        const k = autoT - leg;
        sprayAt = { x: leg % 2 ? autoX1 - (autoX1 - autoX0) * k : autoX0 + (autoX1 - autoX0) * k, y: autoYs[leg % autoYs.length] };
      }
      if (sprayAt) {
        const sp = sprayAt;
        spray += dt * 40;
        while (spray > 1) {
          spray--;
          fx.dot(sp.x + (Math.random() - 0.5) * 36, sp.y + 16, 'rgba(80, 160, 235, 0.85)', 2.5, { vy: 260 + Math.random() * 80, vx: (Math.random() - 0.5) * 30, life: 0.5 });
        }
        for (const c of cells) {
          if (c.soap <= 0) continue;
          const dx = c.x - sp.x;
          const dy = c.y - sp.y;
          if (Math.abs(dx) < 34 && dy > -20 && dy < 110) c.soap = Math.max(0, c.soap - dt * 2.2);
        }
      }
      const f = frac((c) => c.soap <= 0.05);
      ctx.progress(f / 0.92);
      if (f >= 0.92) {
        for (const c of cells) c.soap = 0;
        shake = 1;
        fx.burst(sh.bx, sh.by - sh.ry, '💦', 10, { speed: 220, spread: 3 });
        rule.finish(soapValue);
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
      drawAnimal(g, a, { x: fit.x, y: floorY, s: fit.s, f: 1, shake, happy: ctx.done, blink: !!sprayAt, earsBack: !!sprayAt });
      // Boue (elle part dès qu'il y a eu assez de mousse ; sinon elle reste : encore sale)
      for (const c of cells) {
        if (c.mud && c.peak < 0.7) {
          g.fillStyle = `rgba(110, 80, 50, ${0.55 * (1 - c.peak / 0.7)})`;
          circle(g, c.x, c.y, step * 0.45);
          g.fill();
        }
      }
      // Mousse (plus grosse quand on en a mis trop)
      for (const c of cells) {
        if (c.soap <= 0.02) continue;
        const k = Math.min(SOAP_MAX, c.soap);
        for (const b of c.b) {
          const r = step * 0.42 * b.r * (0.4 + k * 0.6);
          const x = c.x + b.dx * Math.min(1, k);
          const y = c.y + b.dy * Math.min(1, k);
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
      if (phase === 'soap') rule.dial(g, soapNow(), dialX(sh));
      const pp = ctx.pointer;
      if (phase === 'rinse' && sprayAt && !pp.down && !ctx.done) emoji(g, '🚿', sprayAt.x, sprayAt.y - 10, 44, 0.6);
      else if ((pp.over || pp.down) && !ctx.done) {
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

/**
 * Griffes : un seul coup de ciseaux par griffe, quand ils passent dans la zone verte.
 * La quantité notée est la longueur coupée (0 = rien, 1 = tout) : juste entre 0,34 et 0,54 ;
 * en dessous la griffe reste longue, au-dessus on approche du rose (ça fait mal). La jauge
 * suit les ciseaux en direct ; la note finale est la moyenne des écarts à la zone.
 */
export function nailsGame(ctx) {
  const { a, t, fx } = ctx;
  const goat = a.species === 'goat';
  const coat = ctx.col;
  const claws = [];
  const base = { x: 200, y: 300 };
  if (goat) {
    // Deux pieds, deux onglons chacun
    // (les onglons poussent vers le bas, sous la patte)
    [[-66, 0.08], [-32, -0.08], [32, 0.08], [66, -0.08]].forEach(([dx, ang]) => claws.push({ bx: base.x + dx, by: 150, ang: Math.PI + ang, len: 80, w: 32, cut: 1, done: false, cutLen: 0 }));
  } else {
    [[-66, -0.42], [-24, -0.14], [24, 0.14], [66, 0.42]].forEach(([dx, ang]) => claws.push({ bx: base.x + dx, by: 210 - Math.abs(dx) * 0.35, ang, len: 74, w: 16, cut: 1, done: false, cutLen: 0 }));
  }
  const QUICK = 0.38; // en dessous : le rose (la veine)
  const GOOD_LO = 0.46; // position des ciseaux (0 = base, 1 = bout) : zone verte
  const GOOD_HI = 0.66;
  const LO = 1 - GOOD_HI; // longueur coupée juste : 0,34 à 0,54
  const HI = 1 - GOOD_LO;
  const SLACK = 0.15;
  const period = a.personality === 'shy' || a.personality === 'calm' ? 2.8 : a.personality === 'playful' || a.personality === 'stubborn' ? 2.0 : 2.4;
  let cur = 0;
  let u = 1;
  let phase = 0;
  let snip = 0;
  let ouch = false;
  let face = '';
  let faceT = 0;

  ctx.hint(t(goat ? 'mg_hooves_hint' : 'mg_nails_hint'));
  ctx.zone(LO, HI);
  ctx.button(`✂️ ${t('mg_nails_btn')}`, { cls: 'primary', onTap: () => cut() });

  const pos = (c, k) => ({ x: c.bx + Math.sin(c.ang) * c.len * k, y: c.by - Math.cos(c.ang) * c.len * k });

  // Un cheveu à côté de la zone (0,02 de longueur), griffe par griffe, compte comme juste :
  // la même règle pour « Parfait ! », le ✅ sur la griffe et la note.
  const TOL = 0.02;
  const errOf = (len) => {
    const d = len < LO ? LO - len : len > HI ? len - HI : 0;
    return d <= TOL ? 0 : d;
  };

  /**
   * Note finale : moyenne des écarts à la zone, du côté le plus fréquent. Une griffe coupée
   * dans le rose (« Aïe », 🩹) n'est jamais « juste », même si les trois autres sont parfaites :
   * avant, le cheveu de tolérance portait sur la moyenne (≤ 0,02), et une seule griffe dans le
   * rose avec trois parfaites donnait « Juste ce qu'il fallait ! ★★★ ».
   */
  function finishAll() {
    let low = 0;
    let high = 0;
    for (const c of claws) {
      if (c.cutLen < LO) low += errOf(c.cutLen);
      else high += errOf(c.cutLen);
    }
    const mean = (low + high) / claws.length;
    let value = mean === 0 ? (LO + HI) / 2 : ouch || high >= low ? HI + mean : LO - mean;
    // Note arrondie à 1,00 (trois étoiles) : la carte dit « juste », pas « trop » (sauf « Aïe »).
    if (!ouch && justRight(value, LO, HI, { slack: SLACK }) >= 0.995) value = (LO + HI) / 2;
    const who = { name: a.name };
    ctx.finishJust(value, LO, HI, {
      who: a.name,
      slack: SLACK,
      // Clés attendues dans i18n.js (griffe trop courte sans toucher le rose / encore trop
      // longue) ; en attendant, les messages standard « trop » / « trop peu ».
      msgs: {
        high: ouch ? t('mg_nails_end_ouch', who) : tOr(t, 'mg_nails_end_short', undefined, who),
        low: tOr(t, 'mg_nails_end_long', undefined, who),
      },
    });
  }

  function cut() {
    if (ctx.done || cur >= claws.length) return;
    const c = claws[cur];
    snip = 1;
    const p = pos(c, u);
    c.cut = u;
    c.cutLen = 1 - u;
    c.done = true;
    if (u < QUICK + 0.04) {
      ouch = true;
      fx.text(p.x, p.y - 30, t('mg_ouch'), '#c8463c', 24);
      face = '😣';
      faceT = 1.2;
    } else if (errOf(c.cutLen) === 0) {
      fx.text(p.x, p.y - 30, t('mg_perfect'), '#2f8a5f', 24);
      fx.burst(p.x, p.y, '✨', 3, { speed: 70, size: 14 });
      face = '😊';
      faceT = 1;
    } else if (u < GOOD_LO) {
      fx.text(p.x, p.y - 30, t('mg_oops'), '#c07a10', 22);
      face = '😬';
      faceT = 1;
    } else {
      // Trop long : il en reste un bout qui dépasse.
      fx.text(p.x, p.y - 30, t('mg_shorter'), '#c07a10', 22);
      face = '😕';
      faceT = 1;
    }
    fx.dot(p.x, p.y, '#f4efe2', 4, { vx: (Math.random() - 0.5) * 80, vy: -60, grav: 500, life: 0.8 });
    cur++;
    phase = 0;
    if (cur >= claws.length) finishAll();
  }

  return {
    peek: () => ({
      u, value: 1 - u, lo: LO, hi: HI, uLo: GOOD_LO, uHi: GOOD_HI, quick: QUICK, cur, n: claws.length,
      cuts: claws.map((c) => (c.done ? c.cutLen : null)),
    }),
    down() { cut(); },
    key(code, down) { if (down && (code === 'Space' || code === 'Enter' || code === 'NumpadEnter')) cut(); },
    update(dt) {
      snip = Math.max(0, snip - dt * 4);
      faceT = Math.max(0, faceT - dt);
      if (ctx.done || cur >= claws.length) return;
      phase += dt / period;
      const tri = 1 - Math.abs(((phase % 1) * 2) - 1); // 0 → 1 → 0
      u = lerp(1, 0.2, tri);
      ctx.progress(1 - u); // la jauge suit les ciseaux : longueur qui serait coupée
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
        // zone verte où couper (griffe en cours)
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
          const zm = pos(c, (GOOD_LO + GOOD_HI) / 2);
          label(g, '✓', zm.x + Math.cos(c.ang) * (c.w * 0.5 + 20), zm.y + Math.sin(c.ang) * (c.w * 0.5 + 20), 18, '#1e8a4a');
        }
        if (c.done) emoji(g, c.cut < QUICK + 0.04 ? '🩹' : errOf(c.cutLen) === 0 ? '✅' : '😕', tip.x, tip.y - 18, 18);
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

/**
 * Ferrer : quatre clous ; on tape sur un clou (doigt, souris, ou bouton 🔨 / Espace) et il
 * s'enfonce d'un tiers à chaque coup. Juste : 3 coups par clou (la tête affleure, ✓). Un coup
 * de plus et le clou plie (💢). On s'arrête avec ✅ ; la jauge montre les coups du clou choisi.
 * Le bouton 🔨 (et Espace) passe tout seul au clou suivant quand celui-ci est juste : sans ça,
 * l'enfant qui ne tapait que sur le bouton pliait le premier clou sans jamais atteindre les
 * autres. Toucher directement un clou déjà enfoncé le plie quand même (trop).
 * Note : moyenne des coups en trop ou en moins (1 clou plié = 0,925 ; tous à 4 = 0,7).
 */
export function shoeGame(ctx) {
  const { a, t, fx } = ctx;
  const cx = 200;
  const cy = 200;
  const JUST = 3;
  const MAXHITS = 5;
  const nails = [];
  for (const ang of [Math.PI * 0.9, Math.PI * 0.66]) {
    const dx = Math.cos(ang) * 88;
    const dy = -Math.sin(ang) * 88 * 0.95 + 30;
    nails.push({ x: cx + dx, y: cy + dy, hits: 0, bend: 0 }, { x: cx - dx, y: cy + dy, hits: 0, bend: 0 });
  }
  nails.sort((p, q) => p.y - q.y || p.x - q.x);
  const n = nails.length;
  const TOTAL = JUST * n;
  const TAP_R = 46; // rayon de la cible autour d'un clou (≥ 44 px pour le doigt)
  let sel = 0;
  let swing = 0;
  let saidStop = false;

  // Clé dédiée attendue dans i18n.js (mg_shoe_hint_just) ; en attendant :
  // « Taper 3× 🔨 — Arrête-toi dans la zone verte 🟩 »
  ctx.hint(tOr(t, 'mg_shoe_hint_just', `${t('mg_shoe_btn')} 3× 🔨 — ${t('mg_zoneHint')}`));
  ctx.zone((JUST - 0.5) / MAXHITS, (JUST + 0.5) / MAXHITS);
  // Le marteau en icône seule, plus étroit : en 360 px, deux boutons de même largeur coupaient
  // « ✅ C'est bon ! » sur deux lignes (le « ! » tout seul en dessous).
  const hammerBtn = ctx.button('🔨', { cls: 'primary', onTap: () => hammer() });
  if (hammerBtn?.style) {
    hammerBtn.style.flex = '0 0 30%';
    hammerBtn.style.fontSize = '1.7rem';
    hammerBtn.setAttribute('aria-label', t('mg_shoe_btn'));
    hammerBtn.title = t('mg_shoe_btn');
  }
  ctx.stopButton(() => finishAll());

  const showGauge = () => { if (!ctx.done) ctx.progress(nails[sel].hits / MAXHITS); };
  showGauge();

  /** Coups en trop (high) et en moins (low) sur tous les clous, et la valeur notée. */
  function tally() {
    let low = 0;
    let high = 0;
    for (const x of nails) {
      if (x.hits < JUST) low += JUST - x.hits;
      else high += x.hits - JUST;
    }
    const value = low + high === 0 ? TOTAL : high >= low ? TOTAL + low + high : TOTAL - low - high;
    return { low, high, value };
  }

  function finishAll() {
    if (ctx.done) return;
    ctx.finishJust(tally().value, TOTAL, TOTAL, { who: a.name, slack: 2 * n });
  }

  function select(i) {
    sel = (i + n) % n;
    showGauge();
  }

  /**
   * 🔨 (bouton, Espace) : si le clou choisi est déjà juste, on passe au prochain qui attend.
   * S'il est déjà enfoncé au maximum, on passe au prochain qui peut encore être tapé : sans
   * ça, l'enfant qui ne s'arrêtait jamais tapait dans le vide (« Oups ») sans fin, et le jeu
   * ne finissait jamais tout seul.
   */
  function hammer() {
    if (ctx.done) return;
    const next = (ok) => {
      for (let k = 1; k < n; k++) if (ok(nails[(sel + k) % n])) return select(sel + k);
    };
    if (nails[sel].hits >= JUST) next((x) => x.hits < JUST);
    if (nails[sel].hits >= MAXHITS) next((x) => x.hits < MAXHITS);
    hit();
  }

  function hit() {
    if (ctx.done) return;
    const nl = nails[sel];
    swing = 1;
    if (nl.hits >= MAXHITS) {
      fx.text(nl.x, nl.y - 40, t('mg_oops'), '#c07a10', 22);
      return;
    }
    nl.hits++;
    if (nl.hits < JUST) {
      fx.text(nl.x, nl.y - 40, t('mg_hop'), '#3c7bd9', 22);
      fx.burst(nl.x, nl.y, '💥', 2, { speed: 60, size: 14 });
    } else if (nl.hits === JUST) {
      fx.text(nl.x, nl.y - 40, t('mg_perfect'), '#2f8a5f', 24);
      fx.burst(nl.x, nl.y, '✨', 5, { speed: 120, size: 14 });
    } else {
      // Le clou plie.
      nl.bend = Math.min(1, nl.bend + 0.5);
      fx.text(nl.x, nl.y - 40, t('mg_oops'), '#c07a10', 22);
      fx.float(nl.x + 16, nl.y - 20, '💢', 22);
      ctx.hint(t('mg_tooMuch', { name: a.name }), 'warn');
      saidStop = true;
    }
    showGauge();
    if (nails.every((x) => x.hits >= MAXHITS)) finishAll();
    else if (!saidStop && nails.every((x) => x.hits >= JUST)) {
      saidStop = true;
      ctx.hint(pressStopHint(t), 'good');
    }
  }

  return {
    peek: () => ({
      value: tally().value, lo: TOTAL, hi: TOTAL, just: JUST, max: MAXHITS, sel, tapR: TAP_R,
      hits: nails.map((x) => x.hits), nails: nails.map(({ x, y }) => ({ x, y })),
    }),
    down(p) {
      let best = -1;
      let bd = TAP_R;
      nails.forEach((nl, i) => {
        const d = dist(p.x, p.y, nl.x, nl.y);
        if (d < bd) { bd = d; best = i; }
      });
      if (best < 0) return;
      select(best);
      hit();
    },
    key(code, down) {
      if (!down) return;
      if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') hammer();
      else if (code === 'ArrowLeft' || code === 'ArrowUp') select(sel - 1);
      else if (code === 'ArrowRight' || code === 'ArrowDown') select(sel + 1);
    },
    update(dt) {
      swing = Math.max(0, swing - dt * 5);
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
      nails.forEach((nl, i) => {
        const isSel = i === sel && !ctx.done;
        if (isSel) {
          // cible du clou choisi (assez grande pour le doigt)
          g.strokeStyle = '#f2c84b';
          g.lineWidth = 5;
          circle(g, nl.x, nl.y, TAP_R - 10 + Math.sin(ctx.time * 5) * 2);
          g.stroke();
        }
        g.fillStyle = '#3a3f44';
        circle(g, nl.x, nl.y, 6);
        g.fill();
        const h = 1 - Math.min(JUST, nl.hits) / JUST; // ce qui dépasse encore
        if (nl.hits < JUST) {
          g.fillStyle = '#c9ced3';
          rrect(g, nl.x - 4, nl.y - 26 * h, 8, 26 * h, 2);
          g.fill();
          g.fillStyle = '#e8ecef';
          rrect(g, nl.x - 9, nl.y - 26 * h - 5, 18, 7, 3);
          g.fill();
        } else if (nl.hits === JUST) {
          // la tête affleure : juste
          g.fillStyle = '#e8ecef';
          circle(g, nl.x, nl.y, 7);
          g.fill();
          label(g, '✓', nl.x + 16, nl.y - 10, 16, '#1e8a4a');
        } else {
          // plié
          g.save();
          g.translate(nl.x, nl.y);
          g.rotate(0.9 * nl.bend);
          g.fillStyle = '#9aa3ab';
          rrect(g, -4, -16 * nl.bend - 4, 8, 16 * nl.bend + 4, 2);
          g.fill();
          g.fillStyle = '#c9ced3';
          rrect(g, -9, -16 * nl.bend - 8, 18, 7, 3);
          g.fill();
          g.restore();
          emoji(g, '💢', nl.x + 18, nl.y - 14, 16);
        }
        // compte des coups : ●●● (3 = juste), ✕ pour les coups en trop
        for (let k = 0; k < MAXHITS; k++) {
          const px = nl.x - 16 + k * 8;
          const py = nl.y + 20;
          if (k < JUST) {
            g.fillStyle = k < nl.hits ? '#1e8a4a' : 'rgba(255,255,255,0.8)';
            circle(g, px, py, 3.2);
            g.fill();
          } else if (k < nl.hits) {
            label(g, '✕', px, py, 11, '#e0574a');
          }
        }
      });
      // marteau
      const nl = nails[Math.min(sel, n - 1)];
      g.save();
      g.translate(nl.x + 46, nl.y - 30);
      g.rotate(-0.9 + swing * 0.9);
      g.fillStyle = '#8a5a2b';
      rrect(g, -5, -6, 10, 80, 4);
      g.fill();
      g.fillStyle = '#5d6870';
      rrect(g, -26, -20, 46, 22, 5);
      g.fill();
      g.restore();
      label(g, `${nails.filter((x) => x.hits >= JUST).length} / ${n}`, 50, 40, 20);
      emoji(g, '🐴', 350, 44, 40);
    },
  };
}

// ---------------------------------------------------------------- tondre

/**
 * Tondre : chaque touffe a 3 états (longue → courte → à ras). Une passe de tondeuse la
 * raccourcit ; pour la raser il faut repasser juste dessus. La jauge compte la laine enlevée
 * (0 → 2) : juste entre 0,85 et 1,15 (tout court, rien à ras). On s'arrête avec ✅ ; tout
 * raser finit le jeu tout seul (trop).
 */
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
      wool.push({ ...p, len: 2, r: step * 0.75, k: ctx.rng(), away: true, at: -9 });
    }
  }
  // Toupet sur la tête
  wool.push({ x: full.head.x - full.hr * 0.3, y: full.head.y - full.hr * 0.6, len: 2, r: full.hr * 0.6, k: 0.5, away: true, at: -9 });
  const total = wool.length;
  const MAX = 2;
  const rule = justRule(ctx, { lo: 0.85, hi: 1.15, max: MAX, slack: 0.35 });
  let last = null;
  const woolCol = ctx.col.raw.coat;

  // Clé dédiée attendue dans i18n.js (mg_shear_hint_just : « ni à ras, ni trop long ») ;
  // en attendant, la zone verte sert de consigne.
  ctx.hint(tOr(t, 'mg_shear_hint_just', `🧶 ${t('mg_zoneHint')}`));

  const value = () => wool.reduce((s, w) => s + (2 - w.len), 0) / total;
  const stop = () => { if (!ctx.done) rule.finish(value()); };
  ctx.stopButton(stop);

  function cutAlong(p) {
    if (!last) { last = p; return; }
    for (const w of wool) {
      if (w.len <= 0) continue;
      // Une touffe longue se coupe de loin ; pour la raser, il faut passer juste dessus.
      const reach = w.len === 2 ? 20 + w.r * 0.3 : 9 + w.r * 0.3;
      const near = distToSegment(w.x, w.y, last.x, last.y, p.x, p.y) < reach;
      // Une seule coupe par passage : pour recouper, il faut s'éloigner (ou lever le doigt),
      // laisser passer 1,5 s et revenir. Un doigt lent qui s'attarde, ou deux passes voisines
      // qui se chevauchent, ne rasent donc pas : il faut vraiment repasser.
      if (near && w.away && (w.len === 2 || ctx.time - w.at > 1.5)) {
        w.len--;
        w.at = ctx.time;
        w.away = false;
        if (Math.random() < 0.6) fx.dot(w.x, w.y, css(woolCol), 7 + Math.random() * 4, { vx: (Math.random() - 0.5) * 60, vy: -20, grav: 420, life: 0.9 });
        if (w.len === 0 && Math.random() < 0.3) fx.float(w.x, w.y - 10, '💢', 16);
      } else if (!near && dist(w.x, w.y, p.x, p.y) > reach + 12) w.away = true;
    }
    last = p;
    const v = value();
    const s = rule.show(v);
    if (s === 'low' && v > 0.5) ctx.hint(t('mg_shear_more'), 'good');
    if (v >= MAX - 0.02) stop();
  }

  return {
    peek: () => ({
      value: value(), lo: rule.lo, hi: rule.hi, max: MAX,
      long: wool.filter((w) => w.len === 2).length, short: wool.filter((w) => w.len === 1).length, bald: wool.filter((w) => w.len === 0).length,
      longAt: wool.filter((w) => w.len === 2).map(({ x, y }) => ({ x: Math.round(x), y: Math.round(y) })),
      body: { x: full.bx, y: full.by, rx: full.rx, ry: full.ry }, head: full.head,
    }),
    down(p) { last = p; },
    move(p, down) { if (down) cutAlong(p); },
    up() { last = null; for (const w of wool) w.away = true; },
    key(code, down) { if (down && (code === 'Space' || code === 'Enter' || code === 'NumpadEnter')) stop(); },
    draw(g) {
      sky(g, ctx.view, '#a9d8f2', '#e4f3fb', floorY, '#8cc268', '#6fa94f');
      // tas de laine (vide tant que rien n'est coupé : avant, une pelote y était dès le début)
      g.fillStyle = css(woolCol);
      const balls = Math.ceil((value() / MAX) * 9 - 1e-9);
      for (let i = 0; i < balls; i++) {
        circle(g, 330 + ((i * 37) % 50) - 20, floorY + 20 - Math.floor(i / 3) * 12, 16);
        g.fill();
      }
      const st = rule.state();
      drawAnimal(g, a, { x: fit.x, y: floorY, s: fit.s, f: 1, shorn: true, happy: ctx.done && st !== 'high', earsBack: st === 'high' });
      // peau à ras (trop)
      for (const w of wool) {
        if (w.len !== 0) continue;
        g.fillStyle = 'rgba(241, 183, 192, 0.7)';
        circle(g, w.x, w.y, w.r * 0.7);
        g.fill();
      }
      // laine restante : longue (grosse touffe bouclée) ou courte (plus petite, plus claire).
      // Les touffes courtes se touchent encore : une toison courte et régulière (le « juste »),
      // et pas des pois sur la peau rose, qu'on prenait pour une tonte trop rase.
      const rad = (w) => (w.len === 2 ? w.r : w.r * 0.72);
      for (const w of wool) {
        if (w.len <= 0) continue;
        g.fillStyle = shade(woolCol, w.len === 2 ? -0.1 : -0.04);
        circle(g, w.x, w.y + (w.len === 2 ? 2 : 1), rad(w));
        g.fill();
      }
      for (const w of wool) {
        if (w.len <= 0) continue;
        g.fillStyle = mix(woolCol, 0xffffff, (w.len === 2 ? 0.1 : 0.32) + w.k * 0.2);
        circle(g, w.x, w.y, rad(w) * 0.92);
        g.fill();
      }
      rule.dial(g, value(), dialX(full));
      const pp = ctx.pointer;
      if ((pp.over || pp.down) && !ctx.done) drawClipper(g, pp.x, pp.y);
      else if (!ctx.done && value() === 0) {
        // Rien de coupé encore : la tondeuse se promène sur la laine (↔) pour montrer le geste.
        // La consigne de secours (sans clé mg_shear_hint_just) ne parle que de la zone verte,
        // et au doigt, la tondeuse n'apparaît qu'une fois l'écran touché.
        const k = Math.sin(ctx.time * 2.2);
        const x = full.bx + k * full.rx * 0.6;
        const y = full.by - full.ry * 0.1;
        drawClipper(g, x, y, 0.75);
        label(g, '↔', full.bx, full.by - full.ry - 18, 30, 'rgba(35, 48, 42, 0.55)');
      }
    },
  };
}

/** La tondeuse (manche bleu, peigne en haut). */
function drawClipper(g, x, y, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
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
