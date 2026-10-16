// Mini-jeux des corvées (src/game/Interiors.js → ui.choreWithGame → runChoreGame) :
// curer un box, étaler la paille, balayer l'allée, ranger le salon, faire la vaisselle.
// Pas d'animal ici (ou seulement celui qui habite le box, pour le décor : ctx.sp).
// Chaque jeu reçoit le ctx du cadre (minigames.js) et renvoie { update, draw, down, move, up, peek }.
// Tout se joue au doigt ou à la souris : toucher, glisser, lâcher.
//
// Règle « juste ce qu'il faut » (score.js) : chaque corvée a une quantité juste, visible en
// vert sur la jauge (et dans la scène), et l'enfant s'arrête avec « C'est bon ! » ; trop peu
// ou trop, c'est moins de points, de la même façon des deux côtés.
// - curer : tout le crottin, mais pas la paille propre (la jeter, c'est trop) ; un crottin
//   oublié compte autant qu'une touffe jetée ;
// - paille : une couche partout (0,85 à 1,15), plus c'est du gaspillage ; tant qu'il reste
//   plus de 15 % de sol nu, ce n'est pas « partout » (les tas ne comptent pas) ;
// - balayer : tout ramasser, sans passes à vide une fois fini (balayer du propre soulève la
//   poussière) ;
// - ranger : chaque objet à sa place (un objet au mauvais endroit compte en moins ; « trop »
//   n'existe pas) ;
// - vaisselle : frotter chaque assiette juste assez (trop longtemps, c'est de l'eau gaspillée).
// Le message de fin dit pourquoi (whyMsgs : le texte propre à la corvée, s'il existe).

import { rrect, ellipse, circle, emoji, label, fillView, tiles, clamp, dist, distToSegment } from './draw.js';
import { cleanGame, drawBoxWall, drawMiniGauge } from './clean.js';
import { justRight, verdict as verdictOf } from './score.js';

/** Les corvées qui ont un mini-jeu (l'écurie, puis la maison). */
export const CHORE_KINDS = ['muck', 'straw', 'sweep', 'living', 'kitchen'];

export const CHORE_ICONS = { muck: '🧹', straw: '🌾', sweep: '🧹', living: '🧽', kitchen: '🍽️' };

/**
 * Consigne quand la jauge entre dans le vert : le texte du bouton (« ✅ C'est bon ! »), pour
 * montrer quoi toucher. (Pas « Lâche maintenant ! » : dans les corvées, lever le doigt n'arrête rien.)
 */
const STOP_HINT = (t) => `✅ ${t('mg_stopHere')}`;

const VERDICT_KEY = { just: 'justRight', low: 'tooLittle', high: 'tooMuch' };

/**
 * Messages de fin qui disent pourquoi (o.msgs de ctx.finishJust) : le texte propre à la corvée
 * s'il existe dans i18n.js (mg_chore_<kind>_low / _high : « Il reste du crottin par terre »…).
 * noName : pour trop peu / trop, le message standard des corvées plutôt que celui avec le prénom
 * du cheval du box. Renvoie undefined s'il n'y a rien à changer (message standard du cadre).
 */
function whyMsgs(ctx, kind, noName = false) {
  const { t } = ctx;
  const msgs = {};
  for (const v of ['low', 'high']) {
    const own = `mg_chore_${kind}_${v}`;
    if (t(own) !== own) msgs[v] = t(own);
    else if (noName && ctx.name) msgs[v] = t(`mg_chore_${VERDICT_KEY[v]}`);
  }
  return Object.keys(msgs).length ? msgs : undefined;
}

/** Flèche qui invite à aller quelque part (petit rebond). */
function bounceArrow(g, ch, x, y, time, size = 24) {
  emoji(g, ch, x + Math.sin(time * 5) * 4, y, size);
}

// ---------------------------------------------------------------- curer le box

/** Fourche dessinée sous le doigt : les dents en bas, le manche vers le haut à droite. */
function drawFork(g, x, y) {
  g.save();
  g.translate(x, y);
  g.rotate(0.5);
  g.lineCap = 'round';
  g.strokeStyle = '#8a5a2b';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(0, -2);
  g.lineTo(0, -80);
  g.stroke();
  g.strokeStyle = '#6c7278';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(-15, 0);
  g.lineTo(15, 0);
  g.stroke();
  for (const dx of [-13, 0, 13]) {
    g.beginPath();
    g.moveTo(dx, 0);
    g.lineTo(dx, 24);
    g.stroke();
  }
  g.restore();
}

/**
 * Curer : le jeu « nettoyer » du cheval, à la fourche, sans la 2e étape (la paille a son propre
 * jeu). Juste ce qu'il faut : les 8 crottins dans la brouette, et pas les 3 touffes de paille
 * propre qui traînent (les jeter, c'est du gaspillage : trop).
 * Tout le crottin dans la brouette, c'est fini tout seul (clean.js) ; « C'est bon ! » permet de
 * s'arrêter avant (comme ranger le salon) : chaque crottin oublié compte autant qu'une touffe
 * jetée, et le message dit lequel des deux l'emporte (trop peu / trop).
 * La note et la jauge suivent toujours ces erreurs (en vol comprises), jamais le seul nombre
 * d'objets dans la brouette : 7 crottins + 1 touffe = 8 objets, mais ce n'est pas « juste ».
 */
export function muckGame(ctx) {
  const { t, fx } = ctx;
  const game = cleanGame(ctx, { species: 'horse', n: 8, decoys: 3, spread: false, tool: drawFork, hint: t('mg_chore_muck_hint') });
  const tufts = game.peek().items.filter((x) => x.good).length;
  /** Ce que la fourche tient en ce moment ('dirt' | 'tuft' | null) : ni par terre, ni jeté. */
  let holding = null;
  const count = (good) => game.peek().items.filter((x) => x.good === good).length;
  /** Ce qui ne va pas : crottins encore par terre (ou dans la fourche), touffes propres parties vers la brouette. */
  const faults = () => ({
    left: count(false) + (holding === 'dirt' ? 1 : 0),
    thrown: tufts - count(true) - (holding === 'tuft' ? 1 : 0),
  });
  /** La valeur notée : nDirt − erreurs si c'est surtout du crottin oublié, nDirt + erreurs sinon. */
  const scored = () => {
    const { nDirt } = game.peek();
    const { left, thrown } = faults();
    return left >= thrown ? nDirt - left - thrown : nDirt + left + thrown;
  };
  /** Note et message (sans effets) : le prénom du cheval seulement pour « juste » (« Pomme en
   * avait déjà assez » ne veut rien dire pour de la paille propre jetée). */
  const finishJust = ctx.finishJust.bind(ctx);
  const score = () => {
    const p = game.peek();
    return finishJust(scored(), p.lo, p.hi, { slack: 1.5, msgs: whyMsgs(ctx, 'muck', true) });
  };
  /**
   * Ce que la fourche tient reste dans la scène : glissé puis lâché sous le jeu (sur le bouton),
   * un crottin restait par terre hors de la vue, impossible à reprendre ni à finir.
   */
  const inScene = (p) => (holding ? { ...p, x: clamp(p.x, 16, 384), y: clamp(p.y, 16, 350) } : p);
  // clean.js finit tout seul quand le dernier crottin atterrit, en notant ce qui est DÉJÀ dans
  // la brouette : une touffe lancée dans la même image, ou encore en vol, n'y était pas encore,
  // et c'était « Juste ce qu'il fallait ! » au lieu de « trop ». Ce jeu-ci (son propre ctx) note
  // donc toujours avec ses erreurs à lui ; clean.js garde ses effets (« Oups ! », étincelles).
  ctx.finishJust = () => score();

  ctx.stopButton(() => {
    if (ctx.done) return;
    const p = game.peek();
    const { verdict } = score();
    const cx = p.floor.x + p.floor.w / 2;
    const cy = p.floor.y + p.floor.h / 2;
    if (verdict === 'just') {
      fx.burst(cx, cy, '✨', 8, { speed: 160 });
      fx.text(cx, cy - 20, t('mg_perfect'), '#2f8a5f', 26);
    } else if (verdict === 'low') fx.text(cx, cy - 20, t('mg_more_short'), '#c07a10', 26);
    else fx.text(cx, cy - 20, t('mg_oops'), '#c8463c', 26);
  });

  return {
    ...game,
    peek: () => ({ ...game.peek(), ...faults(), holding, scored: scored() }),
    down(p) {
      // Un 2e doigt pendant qu'on tient déjà quelque chose : ignoré. (clean.js prenait le 2e
      // objet et le premier restait « tenu » pour toujours : jamais dans la brouette, plus de
      // fin automatique, et compté comme ramassé.)
      if (holding) return;
      const dirt = count(false);
      const clean = count(true);
      game.down(p);
      holding = count(false) < dirt ? 'dirt' : count(true) < clean ? 'tuft' : null;
    },
    move(p, down) { game.move(inScene(p), down); },
    up(p) {
      game.up(inScene(p));
      holding = null;
    },
    update(dt) {
      game.update(dt);
      // La jauge suit la valeur notée (clean.js y mettait le nombre d'objets dans la brouette :
      // vert avec 7 crottins + 1 touffe, puis « trop peu » en touchant « C'est bon ! »).
      if (!ctx.done) ctx.progress(Math.max(0, scored()) / game.peek().max);
    },
  };
}

// ---------------------------------------------------------------- paille fraîche

/**
 * Zone juste : une couche partout (0,85 à 1,15) ; à 1,6, c'est des tas de gaspillage.
 * La valeur : tant que plus de 15 % du sol est nu, c'est la part du sol couverte (les tas n'y
 * changent rien) ; ensuite, c'est la paille posée (couches en moyenne). Avant, seules les
 * couches comptaient : tout en tas sur un tiers du box (60 % de sol nu), et c'était « Juste ce
 * qu'il fallait ! ». Maintenant, le vert veut dire « couvert partout (à 85 % au moins) ET juste
 * assez épais ». La valeur ne fait que monter quand on ajoute de la paille, où que ce soit ; si
 * on a fait des tas, elle saute au-dessus du vert quand le sol est enfin couvert (c'est trop).
 */
const STRAW = { lo: 0.85, hi: 1.15, max: 1.6 };

export function strawGame(ctx) {
  const { t, fx, rng } = ctx;
  const floor = { x: 14, y: 96, w: 300, h: 246 };
  const bale = { x: 322, y: 246, w: 74, h: 64 }; // reste dans les 400 px : visible aussi en portrait
  const step = 30;
  const cells = [];
  for (let y = floor.y + step / 2; y < floor.y + floor.h; y += step) {
    for (let x = floor.x + step / 2; x < floor.x + floor.w; x += step) cells.push({ x, y, n: 0, k: rng(), hit: false });
  }
  const ARM = 300; // trajet (px) que permet une brassée
  let arm = 0; // paille dans les bras (0 à 1)
  let last = null;
  let armfuls = 0;
  let zoneState = '';

  ctx.hint(t('mg_chore_straw_hint'));
  ctx.zone(STRAW.lo / STRAW.max, STRAW.hi / STRAW.max);
  ctx.stopButton(() => end());

  /** Couches de paille posées, en moyenne. */
  const layers = () => cells.reduce((s, c) => s + c.n, 0) / cells.length;
  const covered = () => cells.filter((c) => c.n > 0).length / cells.length;
  /** La quantité juste : la part du sol couverte, puis (sol couvert à 85 %) les couches. */
  const value = () => {
    const c = covered();
    return c < STRAW.lo ? c : layers();
  };
  const onBale = (p) => p.x > bale.x - 34 && p.y > bale.y - 70;
  const onFloor = (p) => p.x > floor.x && p.x < floor.x + floor.w && p.y > floor.y && p.y < floor.y + floor.h;

  function grab() {
    arm = 1;
    armfuls++;
    for (const c of cells) c.hit = false;
    fx.burst(bale.x + bale.w / 2, bale.y, '🌾', 4, { speed: 90, size: 16, life: 0.6 });
    if (!zoneState) ctx.hint(t('mg_chore_straw_spread'), 'good');
  }

  /** Fin : tous les points dans la zone verte, un peu moins si c'est clairsemé ou en tas. */
  function end() {
    if (ctx.done) return;
    const { verdict } = ctx.finishJust(value(), STRAW.lo, STRAW.hi, { msgs: whyMsgs(ctx, 'straw') });
    const cx = floor.x + floor.w / 2;
    const cy = floor.y + floor.h / 2;
    if (verdict === 'just') {
      fx.burst(cx, cy, '✨', 8, { speed: 160 });
      fx.text(cx, cy - 20, t('mg_chore_straw_even'), '#2f8a5f', 24);
    } else if (verdict === 'low') fx.text(cx, cy - 20, t('mg_more_short'), '#c07a10', 26);
    else fx.text(cx, cy - 20, t('mg_oops'), '#c8463c', 26);
  }

  function spread(p) {
    if (!last) { last = p; return; }
    const d = dist(p.x, p.y, last.x, last.y);
    if (arm > 0 && (onFloor(p) || onFloor(last))) {
      // En arrivant de la botte, on ne fait que boucher des trous : les couches (et donc les
      // tas) ne se posent qu'en glissant sur le sol.
      const inside = onFloor(p) && onFloor(last);
      let any = false;
      for (const c of cells) {
        if (c.hit) continue;
        const dc = distToSegment(c.x, c.y, last.x, last.y, p.x, p.y);
        // Le cœur de la brassée (15 px) pose une couche ; le bord (jusqu'à 24 px) ne fait que
        // boucher les trous, pour que deux passages voisins ne fassent pas des tas.
        if ((dc < 15 && inside) || (dc < 24 && c.n === 0)) {
          c.n++;
          c.hit = true;
          any = true;
        }
      }
      if (any && Math.random() < 0.6) fx.dot(p.x, p.y, '#f3d86b', 3, { vx: (Math.random() - 0.5) * 80, vy: -40, grav: 300, life: 0.5 });
      // La brassée s'use en l'étalant (pas sur le trajet depuis la botte).
      if (onFloor(p) && onFloor(last)) arm = Math.max(0, arm - d / ARM);
      if (arm <= 0) {
        ctx.hint(t('mg_chore_straw_empty'), 'warn');
        fx.text(p.x, p.y - 30, t('mg_chore_straw_empty_short'), '#c07a10', 20);
      }
    }
    last = p;
    const v = value();
    ctx.progress(Math.min(1, v / STRAW.max));
    const zs = v > STRAW.hi ? 'over' : v >= STRAW.lo ? 'in' : '';
    if (zs !== zoneState) {
      zoneState = zs;
      // Pas « lâche ! » (lever le doigt n'arrête rien ici) : on montre le bouton « C'est bon ! ».
      if (zs === 'in') { ctx.hint(STOP_HINT(t), 'good'); fx.text(200, 80, t('mg_good'), '#2f8a5f', 26); }
      else if (zs === 'over') ctx.hint(t('mg_zoneHint'), 'warn');
    }
    // Des tas partout : c'est trop, et c'est fini.
    if (v >= STRAW.max) end();
  }

  return {
    peek: () => ({ bale, floor, covered: covered(), layers: layers(), arm, armfuls, value: value(), lo: STRAW.lo, hi: STRAW.hi, max: STRAW.max }),
    down(p) {
      last = p;
      if (onBale(p)) grab();
    },
    move(p, down) {
      if (!down) return;
      // Retour à la botte sans lever le doigt : on reprend une brassée.
      if (arm < 0.25 && onBale(p)) grab();
      spread(p);
    },
    up() {
      last = null;
      for (const c of cells) c.hit = false;
    },
    update() {},
    draw(g) {
      const v = ctx.view;
      drawBoxWall(g, v, '#9a6740', floor.y, '#8d7250');
      // sol du box
      g.save();
      rrect(g, floor.x, floor.y, floor.w, floor.h, 4);
      g.clip();
      g.fillStyle = '#9b7d45';
      g.fillRect(floor.x, floor.y, floor.w, floor.h);
      for (const c of cells) {
        if (c.n === 0) {
          if (c.k < 0.15) {
            g.fillStyle = 'rgba(80, 60, 30, 0.14)';
            ellipse(g, c.x, c.y, 16, 10, c.k * 6);
            g.fill();
          }
          continue;
        }
        g.fillStyle = '#f3d86b';
        g.fillRect(c.x - step / 2 - 1, c.y - step / 2 - 1, step + 2, step + 2);
        if (c.n >= 2) {
          // un tas : plus épais, plus foncé
          g.fillStyle = '#dcb447';
          ellipse(g, c.x, c.y, 14 + Math.min(3, c.n), 10, c.k);
          g.fill();
        }
      }
      for (const c of cells) {
        if (c.n === 0) continue;
        g.strokeStyle = c.n >= 2 ? '#b8902e' : '#d9b84a';
        g.lineWidth = 2;
        const strands = c.n >= 2 ? 4 : 2;
        for (let i = 0; i < strands; i++) {
          const a0 = c.k * 9 + i * 2.1;
          const x = c.x + Math.cos(a0) * 10;
          const y = c.y + Math.sin(a0 * 1.3) * 10;
          g.beginPath();
          g.moveTo(x - 7, y);
          g.lineTo(x + 7, y + (i - 1) * 3);
          g.stroke();
        }
      }
      g.restore();
      // la botte de paille
      g.fillStyle = 'rgba(0,0,0,0.15)';
      ellipse(g, bale.x + bale.w / 2, bale.y + bale.h + 4, bale.w * 0.55, 8);
      g.fill();
      g.fillStyle = '#e6c25a';
      rrect(g, bale.x, bale.y, bale.w, bale.h, 10);
      g.fill();
      g.strokeStyle = '#b8902e';
      g.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        const y = bale.y + 8 + i * 6;
        g.beginPath();
        g.moveTo(bale.x + 6 + (i % 3) * 5, y);
        g.lineTo(bale.x + bale.w - 6 - ((i + 1) % 3) * 5, y + 2);
        g.stroke();
      }
      g.fillStyle = '#8a5a2b';
      g.fillRect(bale.x + 22, bale.y, 6, bale.h);
      g.fillRect(bale.x + bale.w - 28, bale.y, 6, bale.h);
      if (arm <= 0 && !ctx.done) bounceArrow(g, '⬇️', bale.x + bale.w / 2, bale.y - 30, ctx.time);
      // Petite jauge au mur : la même zone verte que sur la jauge du cadre.
      drawMiniGauge(g, 352, 40, 14, 120, value() / STRAW.max, STRAW.lo / STRAW.max, STRAW.hi / STRAW.max);
      label(g, `${Math.round(value() * 100)} %`, 359, 180, 15);
      // les bras pleins de paille
      const pp = ctx.pointer;
      if ((pp.over || pp.down) && !ctx.done) {
        if (arm > 0) emoji(g, '🌾', pp.x + 6, pp.y - 16, 24 + 18 * arm);
        else emoji(g, '🤚', pp.x + 10, pp.y - 12, 30);
      }
    },
  };
}

// ---------------------------------------------------------------- balayer l'allée

/**
 * Zone juste : au moins 90 % des brins dans la pelle, et pas de passes à vide une fois le
 * travail fait (chaque passe qui ne touche rien soulève de la poussière : + 0,05). À 1,5, la
 * poussière est partout. Avant d'avoir atteint 90 %, une passe à côté ne compte pas : sinon la
 * poussière comblerait les brins oubliés et la jauge serait dans le vert avec l'allée sale.
 */
const SWEEP = { lo: 0.9, hi: 1.1, max: 1.5, dust: 0.05 };

export function sweepGame(ctx) {
  const { t, fx, rng } = ctx;
  const aisle = { y: 104, h: 250 }; // l'allée, vue de dessus : tout le bas de la vue
  // La pelle, au bout de l'allée, ET son manche : tout tient dans les 400 px (en portrait, la
  // vue s'arrête pile à x = 400 ; le manche n'est plus coupé au bord).
  const pan = { x: 300, y: 116, w: 70, h: 228 };
  const handle = { x0: pan.x + pan.w - 8, x1: 395, y: pan.y + pan.h / 2, h: 18 };
  const bits = [];
  for (let i = 0; i < 46; i++) {
    bits.push({
      x: 20 + rng() * 262,
      y: aisle.y + 20 + rng() * (aisle.h - 44),
      kind: rng() < 0.55 ? 'straw' : 'dust',
      rot: rng() * Math.PI,
      r: 3 + rng() * 3,
      k: rng(),
      done: false,
    });
  }
  const specks = Array.from({ length: 40 }, () => ({ x: -200 + rng() * 800, y: aisle.y + rng() * 400, r: 1 + rng() * 2 }));
  const total = bits.length;
  let collected = 0;
  let last = null;
  let dir = 0;
  let strokes = 0;
  let strokeGain = 0;
  let strokeTouched = 0; // brins déplacés pendant la passe
  let strokeLen = 0;
  let emptyStrokes = 0; // passes à vide : de la poussière soulevée
  let zoneState = '';

  ctx.hint(t('mg_chore_sweep_hint'));
  ctx.zone(SWEEP.lo / SWEEP.max, SWEEP.hi / SWEEP.max);
  ctx.stopButton(() => end());

  // Dans la pelle dès qu'il passe son bord gauche : la pelle couvre toute la hauteur de l'allée
  // (à 4 px près), et un brin poussé en biais tout en haut ou tout en bas restait coincé sur son
  // rebord, dessiné « dans » la pelle mais jamais compté (et plus moyen de tout ramasser).
  const inPan = (b) => b.x > pan.x + 10;
  /** La quantité juste : part ramassée, plus la poussière soulevée par les passes à vide. */
  const value = () => collected / total + emptyStrokes * SWEEP.dust;

  /** Fin : tous les points dans la zone verte, un peu moins s'il en reste ou si on a trop balayé. */
  function end() {
    if (ctx.done) return;
    const { verdict } = ctx.finishJust(value(), SWEEP.lo, SWEEP.hi, { slack: 0.3, msgs: whyMsgs(ctx, 'sweep') });
    if (verdict === 'just') {
      fx.burst(pan.x + pan.w / 2, pan.y + pan.h / 2, '✨', 8, { speed: 160 });
      fx.text(200, 220, t('mg_perfect'), '#2f8a5f', 26);
    } else if (verdict === 'low') fx.text(200, 220, t('mg_more_short'), '#c07a10', 26);
    else fx.text(200, 220, t('mg_oops'), '#c8463c', 26);
  }

  function refresh() {
    const v = value();
    ctx.progress(Math.min(1, v / SWEEP.max));
    const zs = v > SWEEP.hi ? 'over' : v >= SWEEP.lo ? 'in' : '';
    if (zs !== zoneState) {
      zoneState = zs;
      if (zs === 'in') { ctx.hint(STOP_HINT(t), 'good'); fx.text(200, 220, t('mg_good'), '#2f8a5f', 26); }
      else if (zs === 'over') ctx.hint(t('mg_zoneHint'), 'warn');
    }
    // De la poussière partout : c'est trop, et c'est fini.
    if (v >= SWEEP.max) end();
  }

  function sweep(p) {
    if (!last) { last = p; return; }
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5) return;
    strokeLen += d;
    dir = Math.atan2(dy, dx);
    const nx = -dy / d; // normale à la passe : les brins au bord du balai glissent sur le côté
    const ny = dx / d;
    for (const b of bits) {
      if (b.done) continue;
      if (distToSegment(b.x, b.y, last.x, last.y, p.x, p.y) < 30) {
        const side = (b.x - last.x) * nx + (b.y - last.y) * ny;
        const slip = Math.abs(side) > 20 ? Math.sign(side) * (Math.abs(side) - 20) * 0.5 : 0;
        b.x = clamp(b.x + dx * 1.08 + nx * slip + (rng() - 0.5) * 3, 8, pan.x + pan.w - 18);
        b.y = clamp(b.y + dy * 1.08 + ny * slip + (rng() - 0.5) * 3, aisle.y + 8, aisle.y + aisle.h - 8);
        b.rot += dx * 0.02;
        strokeTouched++;
        if (inPan(b)) {
          b.done = true;
          collected++;
          strokeGain++;
          b.x = pan.x + 20 + rng() * (pan.w - 36);
          b.y = clamp(b.y, pan.y + 20, pan.y + pan.h - 20);
        }
      }
    }
    if (Math.random() < 0.35) fx.dot(p.x - dx, p.y - dy + 8, 'rgba(160, 140, 110, 0.5)', 3, { vx: -dx * 3, vy: -20, life: 0.5 });
    last = p;
    if (strokeGain) refresh();
  }

  return {
    peek: () => ({ pan, handle, aisle, collected, total, emptyStrokes, strokes, value: value(), lo: SWEEP.lo, hi: SWEEP.hi, max: SWEEP.max, bits: bits.filter((b) => !b.done).map((b) => ({ x: b.x, y: b.y })) }),
    down(p) {
      last = p;
      strokeGain = 0;
      strokeTouched = 0;
      strokeLen = 0;
    },
    move(p, down) { if (down) sweep(p); },
    up() {
      last = null;
      if (ctx.done) return;
      strokes++;
      // « Hop ! » dans la pelle (au-dessus, il cachait le compteur).
      if (strokeGain > 0) { fx.text(pan.x + pan.w / 2, pan.y + 44, t('mg_hop'), '#2f8a5f', 20); if (!zoneState) ctx.hint(t('mg_chore_sweep_more'), 'good'); }
      else if (strokeTouched === 0 && strokeLen >= 40 && collected / total >= SWEEP.lo) {
        // Une passe à vide quand le travail est fait : ça soulève la poussière (trop balayé).
        emptyStrokes++;
        const pp = ctx.pointer;
        for (let i = 0; i < 8; i++) fx.dot(pp.x + (Math.random() - 0.5) * 60, pp.y + (Math.random() - 0.5) * 40, 'rgba(150, 135, 110, 0.6)', 4 + Math.random() * 4, { vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 30, life: 0.9 });
        fx.float(pp.x, pp.y - 20, '💨', 24);
        refresh();
      } else if (strokes >= 2 && !zoneState) ctx.hint(t('mg_chore_sweep_toPan'), 'warn');
    },
    update() {},
    draw(g) {
      const v = ctx.view;
      // sol de l'allée (béton clair), puis le devant des box en haut
      fillView(g, v, '#b9b2a4', '#a9a294');
      g.fillStyle = 'rgba(255,255,255,0.25)';
      for (const s of specks) { circle(g, s.x, s.y, s.r); g.fill(); }
      g.fillStyle = '#9a6740';
      g.fillRect(v.x0, v.y0, v.w, aisle.y - v.y0);
      for (let x = Math.floor(v.x0 / 100) * 100; x < v.x1; x += 100) {
        g.fillStyle = '#5c3b1e';
        g.fillRect(x + 10, aisle.y - 70, 80, 62);
        g.strokeStyle = '#c9a66b';
        g.lineWidth = 3;
        for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x + 22 + i * 18, aisle.y - 64); g.lineTo(x + 22 + i * 18, aisle.y - 36); g.stroke(); }
        g.fillStyle = '#7a5230';
        g.fillRect(x + 10, aisle.y - 36, 80, 28);
      }
      g.fillStyle = '#7a5230';
      g.fillRect(v.x0, aisle.y - 8, v.w, 8);
      // la pelle (ouverte vers la gauche), et son manche court, arrondi, avec son trou pour
      // l'accrocher : il s'arrête avant le bord de la vue (x = 400 en portrait).
      g.fillStyle = 'rgba(0,0,0,0.15)';
      rrect(g, handle.x0 + 3, handle.y - handle.h / 2 + 5, handle.x1 - handle.x0, handle.h, handle.h / 2);
      g.fill();
      g.fillStyle = '#6b4a2b';
      rrect(g, handle.x0, handle.y - handle.h / 2, handle.x1 - handle.x0, handle.h, handle.h / 2);
      g.fill();
      g.fillStyle = '#4a2f17';
      circle(g, handle.x1 - 10, handle.y, 3.5);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.15)';
      rrect(g, pan.x + 4, pan.y + 6, pan.w, pan.h, 14);
      g.fill();
      g.fillStyle = '#d9534f';
      rrect(g, pan.x, pan.y, pan.w, pan.h, 14);
      g.fill();
      g.fillStyle = '#b8403c';
      rrect(g, pan.x + 14, pan.y + 12, pan.w - 26, pan.h - 24, 10);
      g.fill();
      g.fillStyle = '#f0908c';
      g.fillRect(pan.x, pan.y + 6, 10, pan.h - 12);
      // brins et poussière
      for (const b of bits) {
        if (b.kind === 'straw') {
          g.strokeStyle = b.done ? '#c9a94a' : '#e3c45a';
          g.lineWidth = 3;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(b.x - Math.cos(b.rot) * 8, b.y - Math.sin(b.rot) * 8);
          g.lineTo(b.x + Math.cos(b.rot) * 8, b.y + Math.sin(b.rot) * 8);
          g.stroke();
        } else {
          g.fillStyle = b.done ? '#7a7368' : '#6f685c';
          circle(g, b.x, b.y, b.r);
          g.fill();
        }
      }
      label(g, `${collected} / ${total}`, pan.x + pan.w / 2, pan.y - 20, 18);
      // Petite jauge sur le mur du haut : la même zone verte que sur la jauge du cadre.
      drawMiniGauge(g, 30, 14, 250, 14, value() / SWEEP.max, SWEEP.lo / SWEEP.max, SWEEP.hi / SWEEP.max);
      if (collected < total && !ctx.done && !zoneState) bounceArrow(g, '➡️', pan.x - 36, aisle.y + aisle.h / 2 + 60, ctx.time);
      // le balai
      const pp = ctx.pointer;
      if ((pp.over || pp.down) && !ctx.done) {
        g.save();
        g.translate(pp.x, pp.y);
        g.rotate(dir);
        g.lineCap = 'round';
        g.strokeStyle = '#8a5a2b';
        g.lineWidth = 8;
        g.beginPath();
        g.moveTo(-10, 0);
        g.lineTo(-95, 0);
        g.stroke();
        g.fillStyle = '#d9b24a';
        rrect(g, -8, -32, 20, 64, 6);
        g.fill();
        g.strokeStyle = '#b08a2e';
        g.lineWidth = 2;
        for (let i = -26; i <= 26; i += 8) { g.beginPath(); g.moveTo(-6, i); g.lineTo(10, i); g.stroke(); }
        g.fillStyle = '#5c3b1e';
        rrect(g, -12, -34, 8, 68, 3);
        g.fill();
        g.restore();
      }
    },
  };
}

// ---------------------------------------------------------------- ranger le salon

const LIVING_PLACES = {
  shelf: { x: 22, y: 92, w: 140, h: 100 },
  sofa: { x: 118, y: 212, w: 176, h: 84 },
  chest: { x: 306, y: 214, w: 84, h: 78 },
};

const LIVING_ITEMS = [
  { id: 'book1', emoji: '📕', place: 'shelf', slot: { x: 52, y: 168 } },
  { id: 'book2', emoji: '📗', place: 'shelf', slot: { x: 92, y: 168 } },
  { id: 'book3', emoji: '📘', place: 'shelf', slot: { x: 132, y: 168 } },
  { id: 'cushion', shape: 'cushion', place: 'sofa', slot: { x: 164, y: 248 } },
  { id: 'plaid', shape: 'plaid', place: 'sofa', slot: { x: 250, y: 246 } },
  { id: 'bear', emoji: '🧸', place: 'chest', slot: { x: 324, y: 254 } },
  { id: 'train', emoji: '🚂', place: 'chest', slot: { x: 372, y: 254 } },
  { id: 'ball', emoji: '⚽', place: 'chest', slot: { x: 348, y: 228 } },
];

// Où les objets traînent au départ (par terre, devant les meubles)
const LIVING_SPOTS = [
  { x: 52, y: 224 }, { x: 52, y: 282 }, { x: 60, y: 336 }, { x: 134, y: 330 },
  { x: 206, y: 334 }, { x: 278, y: 330 }, { x: 352, y: 334 }, { x: 96, y: 300 },
];

function drawLivingItem(g, it, x, y, alpha = 1) {
  g.save();
  g.globalAlpha *= alpha;
  if (it.shape === 'cushion') {
    g.fillStyle = '#e8734a';
    rrect(g, x - 22, y - 16, 44, 32, 10);
    g.fill();
    g.fillStyle = '#f4a07f';
    rrect(g, x - 12, y - 7, 24, 14, 6);
    g.fill();
  } else if (it.shape === 'plaid') {
    g.fillStyle = '#b084d8';
    rrect(g, x - 26, y - 14, 52, 28, 7);
    g.fill();
    g.strokeStyle = '#d7bdf0';
    g.lineWidth = 3;
    for (let i = -16; i <= 16; i += 8) { g.beginPath(); g.moveTo(x + i, y - 12); g.lineTo(x + i, y + 12); g.stroke(); }
    g.fillStyle = '#9a6cc4';
    rrect(g, x - 26, y - 2, 52, 6, 2);
    g.fill();
  } else {
    emoji(g, it.emoji, x, y, 36);
  }
  g.restore();
}

/**
 * Juste ce qu'il faut : chaque objet à sa place. Un objet posé au mauvais endroit y reste
 * (avec un ❗) et compte en moins : score = bien rangés − mal rangés. Tout bien rangé, c'est
 * fini tout seul ; sinon on s'arrête avec « C'est bon ! ».
 * « Trop » n'existe pas ici (on ne peut pas ranger plus que tout) : tout est du côté « trop
 * peu » (oublié par terre, ou mal rangé, qui compte double).
 */
export function livingGame(ctx) {
  const { t, fx, rng } = ctx;
  const spots = [...LIVING_SPOTS];
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const items = LIVING_ITEMS.map((it, i) => ({ ...it, x: spots[i].x, y: spots[i].y, home: spots[i], placed: false, misplaced: false }));
  const N = items.length;
  const LO = N - 0.4; // le dernier objet compte : à 7, ce n'est plus tout à fait juste
  // La jauge va un peu au-delà de N, pour que « tout rangé » tombe au milieu de la bande verte
  // (et pas collé au 🏁, où la bande était un trait de 5 %). HI n'est jamais dépassé.
  const HI = N + 0.4;
  const MAX = N + 0.5;
  let held = null;
  let off = { x: 0, y: 0 };
  let wrong = 0; // erreurs faites en tout (pour les tests)

  ctx.hint(t('mg_chore_living_hint'));
  ctx.zone(LO / MAX, HI / MAX);
  ctx.stopButton(() => end());

  const inPlace = (p, pl) => p.x > pl.x - 10 && p.x < pl.x + pl.w + 10 && p.y > pl.y - 10 && p.y < pl.y + pl.h + 10;
  const placed = () => items.filter((it) => it.placed).length;
  const misplaced = () => items.filter((it) => it.misplaced).length;
  /** La quantité juste : bien rangés − mal rangés. */
  const value = () => placed() - misplaced();

  function end() {
    if (ctx.done) return;
    const { verdict } = ctx.finishJust(value(), LO, HI, { slack: 2, msgs: whyMsgs(ctx, 'living') });
    if (verdict === 'just') {
      fx.burst(200, 200, '✨', 8, { speed: 160 });
      fx.text(200, 180, t('mg_perfect'), '#2f8a5f', 26);
    } else fx.text(200, 180, t('mg_more_short'), '#c07a10', 26);
  }

  return {
    peek: () => ({
      items: items.filter((it) => !it.placed).map((it) => ({ id: it.id, x: it.x, y: it.y, slot: it.slot, misplaced: it.misplaced })),
      placed: placed(),
      misplacedCount: misplaced(),
      wrong,
      value: value(),
      lo: LO,
      hi: HI,
      max: MAX,
      places: LIVING_PLACES,
    }),
    down(p) {
      const it = items.filter((x) => !x.placed).sort((u, v) => dist(u.x, u.y, p.x, p.y) - dist(v.x, v.y, p.x, p.y))[0];
      if (it && dist(it.x, it.y, p.x, p.y) < 40) {
        held = it;
        it.misplaced = false;
        off = { x: it.x - p.x, y: it.y - p.y };
        ctx.progress(Math.max(0, value()) / MAX);
      }
    },
    move(p, down) {
      if (!down || !held) return;
      held.x = p.x + off.x;
      held.y = p.y + off.y;
    },
    up(p) {
      if (!held) return;
      const it = held;
      held = null;
      // Près de sa silhouette, ou n'importe où sur SON meuble (le coffre n'a qu'une grande
      // silhouette pour ses trois jouets) : il file à sa place. Avant, un jouet lâché dans le
      // coffre mais à plus de 46 px de son emplacement restait posé dessus, sans rien dire.
      if (dist(it.x, it.y, it.slot.x, it.slot.y) < 46 || (p && inPlace(p, LIVING_PLACES[it.place]))) {
        it.placed = true;
        it.x = it.slot.x;
        it.y = it.slot.y;
        fx.burst(it.x, it.y, '✨', 4, { speed: 80, size: 16 });
        fx.text(it.x, it.y - 34, t('mg_hop'), '#2f8a5f', 20);
        ctx.progress(Math.max(0, value()) / MAX);
        if (placed() === N) end();
        else ctx.hint(t(misplaced() ? 'mg_chore_living_wrong' : 'mg_chore_living_more'), misplaced() ? 'warn' : 'good');
        return;
      }
      const wrongPlace = Object.entries(LIVING_PLACES).find(([id, pl]) => id !== it.place && inPlace(p, pl));
      if (wrongPlace) {
        // Pas sa place : l'objet y reste, avec un ❗, et compte en moins (on peut le reprendre).
        const pl = wrongPlace[1];
        wrong++;
        it.misplaced = true;
        it.x = clamp(it.x, pl.x + 20, pl.x + pl.w - 20);
        it.y = clamp(it.y, pl.y + 16, pl.y + pl.h - 12);
        fx.text(p.x, p.y - 30, t('mg_chore_living_wrong_short'), '#c07a10', 22);
        fx.float(p.x, p.y - 10, '❗', 24);
        ctx.hint(t('mg_chore_living_wrong'), 'warn');
        ctx.progress(Math.max(0, value()) / MAX);
      } else {
        it.x = clamp(it.x, 24, 376);
        it.y = clamp(it.y, 206, 344);
      }
    },
    update() {},
    draw(g) {
      const v = ctx.view;
      const floorY = 196;
      fillView(g, v, '#f6e9cf', '#f1e0c0');
      // plinthe et parquet
      g.fillStyle = '#e3d2ae';
      g.fillRect(v.x0, floorY - 8, v.w, 8);
      g.fillStyle = '#c99b63';
      g.fillRect(v.x0, floorY, v.w, v.y1 - floorY);
      g.strokeStyle = '#b5864f';
      g.lineWidth = 2;
      for (let y = floorY + 24; y < v.y1; y += 24) {
        g.beginPath();
        g.moveTo(v.x0, y);
        g.lineTo(v.x1, y);
        g.stroke();
      }
      // cadre au mur
      g.fillStyle = '#8a5a2b';
      rrect(g, 232, 104, 76, 58, 4);
      g.fill();
      g.fillStyle = '#bfe3f7';
      g.fillRect(238, 110, 64, 46);
      emoji(g, '🐴', 270, 134, 26);
      // étagère
      const sh = LIVING_PLACES.shelf;
      g.fillStyle = '#8a5a2b';
      g.fillRect(sh.x, sh.y, 10, sh.h);
      g.fillRect(sh.x + sh.w - 10, sh.y, 10, sh.h);
      g.fillRect(sh.x, sh.y, sh.w, 8);
      g.fillRect(sh.x, sh.y + 46, sh.w, 8);
      g.fillRect(sh.x, sh.y + sh.h - 8, sh.w, 8);
      emoji(g, '🪴', 60, 126, 28);
      emoji(g, '⏰', 120, 126, 24);
      // canapé
      const so = LIVING_PLACES.sofa;
      g.fillStyle = '#4f8fb3';
      rrect(g, so.x, so.y, so.w, 44, 14);
      g.fill();
      g.fillStyle = '#5ea0c6';
      rrect(g, so.x + 14, so.y + 32, so.w - 28, 40, 10);
      g.fill();
      g.fillStyle = '#4f8fb3';
      rrect(g, so.x, so.y + 20, 18, 56, 8);
      g.fill();
      rrect(g, so.x + so.w - 18, so.y + 20, 18, 56, 8);
      g.fill();
      g.fillStyle = '#5c3b1e';
      g.fillRect(so.x + 8, so.y + 74, 10, 10);
      g.fillRect(so.x + so.w - 18, so.y + 74, 10, 10);
      // coffre à jouets (ouvert)
      const ch = LIVING_PLACES.chest;
      g.fillStyle = '#704622';
      rrect(g, ch.x, ch.y, ch.w, 30, 8);
      g.fill();
      g.fillStyle = '#4a2f17';
      g.fillRect(ch.x + 4, ch.y + 24, ch.w - 8, 24);
      // silhouettes (où ranger) : un cercle vert par objet, une seule zone pour le coffre
      g.save();
      g.setLineDash([5, 4]);
      g.strokeStyle = 'rgba(30, 138, 74, 0.7)';
      g.fillStyle = 'rgba(63, 174, 98, 0.18)';
      g.lineWidth = 2.5;
      for (const it of items) {
        if (it.placed || it.place === 'chest') continue;
        circle(g, it.slot.x, it.slot.y, 24);
        g.fill();
        g.stroke();
      }
      if (items.some((it) => !it.placed && it.place === 'chest')) {
        rrect(g, ch.x - 4, ch.y - 22, ch.w + 8, 72, 14);
        g.fill();
        g.stroke();
      }
      g.restore();
      for (const it of items) if (!it.placed) drawLivingItem(g, it, it.slot.x, it.slot.y, it.place === 'chest' ? 0.25 : 0.3);
      for (const it of items) if (it.placed) drawLivingItem(g, it, it.x, it.y);
      // objets posés au mauvais endroit (sur un meuble), avec leur ❗
      for (const it of items) if (it.misplaced && it !== held) { drawLivingItem(g, it, it.x, it.y); emoji(g, '❗', it.x + 20, it.y - 22, 20); }
      // devant du coffre (les jouets dépassent)
      g.fillStyle = '#8a5a2b';
      rrect(g, ch.x, ch.y + 44, ch.w, ch.h - 44, 8);
      g.fill();
      g.fillStyle = '#c99b63';
      g.fillRect(ch.x + 34, ch.y + 56, 16, 6);
      // objets par terre (celui qu'on tient en dernier)
      for (const it of items) if (!it.placed && !it.misplaced && it !== held) drawLivingItem(g, it, it.x, it.y);
      if (held) {
        g.fillStyle = 'rgba(0,0,0,0.15)';
        ellipse(g, held.x, held.y + 22, 20, 6);
        g.fill();
        drawLivingItem(g, held, held.x, held.y - 6);
      }
      label(g, `${placed()} / ${N}`, 362, 66, 18);
    },
  };
}

// ---------------------------------------------------------------- la vaisselle

const PLATES = 5;
const SMEAR_COLORS = ['#c8762c', '#8fae3a', '#b54848'];
/**
 * Zone juste, par assiette : frottée entre 0,9 (presque propre) et 1,15 (propre, et un petit
 * tour de plus) ; au-delà, c'est de l'eau gaspillée, et à 1,6 l'assiette part toute seule.
 * scrubExtra : ce qu'ajoute chaque px frotté une fois l'assiette propre (× 1,6 en ronds). À
 * 0,0009, le vert durait ~120 à 170 px de frottage (un seul petit rond, une demi-seconde à
 * vitesse calme) : presque impossible de s'arrêter à temps. À 0,00025, il dure ~400 à 450 px
 * (2 à 3 ronds, ~1,4 s) ; l'assiette part toute seule ~1 500 px après être devenue propre.
 */
const DISH = { lo: 0.9, hi: 1.15, max: 1.6, scrubExtra: 0.00025 };

export function kitchenGame(ctx) {
  const { t, fx, rng } = ctx;
  const sink = { x: 118, y: 236, r: 48 };
  const rack = { x: 258, y: 176, w: 130, h: 128 };
  const slots = Array.from({ length: PLATES }, (_, i) => ({ x: rack.x + 20 + i * 23, y: rack.y + rack.h - 34 }));
  const plates = []; // ce que chaque assiette finie a reçu (sa valeur)
  let done = 0;
  let plate = newPlate();
  let phase = 'scrub'; // 'scrub' : on frotte ; 'fly' : elle file sur l'égouttoir
  let last = null;
  let lastAng = null;
  let straight = 0;
  let extra = 0; // frotté en plus une fois l'assiette propre (eau gaspillée)
  let splash = 0;
  let zoneState = '';

  ctx.hint(t('mg_chore_kitchen_hint'));
  ctx.zone(DISH.lo / DISH.max, DISH.hi / DISH.max);
  const stopBtn = ctx.stopButton(() => send());

  function newPlate() {
    const smears = [];
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + rng();
      const r = 8 + rng() * 24;
      smears.push({ dx: Math.cos(ang) * r, dy: Math.sin(ang) * r, amt: 1, col: SMEAR_COLORS[i % 3], r: 7 + rng() * 6, rot: rng() * 3 });
    }
    return { x: sink.x, y: sink.y, smears, k: 0 };
  }

  const dirt = () => plate.smears.reduce((s, q) => s + q.amt, 0) / plate.smears.length;
  /** La quantité juste de cette assiette : ce qui est nettoyé, plus ce qu'on a frotté en trop. */
  const value = () => 1 - dirt() + extra;

  /** « C'est bon ! » : l'assiette file sur l'égouttoir, avec sa note ; puis la suivante, ou la fin. */
  function send() {
    if (ctx.done || phase !== 'scrub') return;
    const v = value();
    plates.push(v);
    const why = verdictOf(v, DISH.lo, DISH.hi);
    if (why === 'just') { fx.text(plate.x, plate.y - 60, t('mg_perfect'), '#2f8a5f', 24); fx.burst(plate.x, plate.y, '✨', 5, { speed: 90, size: 16 }); }
    else if (why === 'low') fx.text(plate.x, plate.y - 60, t('mg_more_short'), '#c07a10', 24);
    else fx.text(plate.x, plate.y - 60, t('mg_oops'), '#c8463c', 24);
    phase = 'fly';
    stopBtn.disabled = true;
    last = null;
  }

  function finishAll() {
    if (ctx.done) return;
    const qs = plates.map((v) => justRight(v, DISH.lo, DISH.hi));
    const lows = plates.filter((v) => verdictOf(v, DISH.lo, DISH.hi) === 'low').length;
    const highs = plates.filter((v) => verdictOf(v, DISH.lo, DISH.hi) === 'high').length;
    const verdict = !lows && !highs ? 'just' : lows >= highs ? 'low' : 'high';
    // La moyenne des cinq assiettes ; une seule un peu à côté ne doit pas, une fois arrondie à
    // 2 décimales par le cadre, redevenir 1 (avec « Un peu trop peu… ») : au plus 0,99.
    const mean = qs.reduce((s, x) => s + x, 0) / qs.length;
    const key = VERDICT_KEY[verdict];
    const msg = whyMsgs(ctx, 'kitchen')?.[verdict] ?? (ctx.name ? t(`mg_${key}`, { name: ctx.name }) : t(`mg_chore_${key}`));
    ctx.finish(verdict === 'just' ? 1 : Math.min(0.99, mean), msg);
    fx.burst(rack.x + rack.w / 2, rack.y + 30, '✨', 8, { speed: 140 });
  }

  function scrub(p) {
    if (!last) {
      last = p;
      lastAng = Math.atan2(p.y - plate.y, p.x - plate.x);
      return;
    }
    const d = dist(p.x, p.y, last.x, last.y);
    if (d < 0.5) return;
    if (dist(p.x, p.y, plate.x, plate.y) < sink.r + 14) {
      const ang = Math.atan2(p.y - plate.y, p.x - plate.x);
      let da = ang - lastAng;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      lastAng = ang;
      // Des ronds (le doigt tourne autour du centre) : ça frotte mieux.
      const circular = Math.abs(da) > 0.04 && Math.abs(da) < 1.2;
      const k = circular ? 1.6 : 0.8;
      const clean = dirt() <= 0.04;
      if (clean) {
        // Propre, et on frotte encore : de l'eau gaspillée.
        extra += d * DISH.scrubExtra * k;
        splash -= d;
        if (splash <= 0) { splash = 70; fx.burst(plate.x + (Math.random() - 0.5) * 60, plate.y - 30, '💧', 2, { speed: 70, size: 14, life: 0.6 }); }
      } else {
        for (const s of plate.smears) {
          if (s.amt <= 0) continue;
          if (distToSegment(plate.x + s.dx, plate.y + s.dy, last.x, last.y, p.x, p.y) < s.r + 12) s.amt = Math.max(0, s.amt - d * 0.011 * k);
        }
        if (dirt() <= 0.04) for (const s of plate.smears) s.amt = 0;
      }
      if (Math.random() < 0.35) fx.dot(p.x + (Math.random() - 0.5) * 24, p.y + (Math.random() - 0.5) * 24, '', 3 + Math.random() * 4, { vy: -25, life: 0.8, bubble: true });
      if (!circular) {
        straight += d;
        if (straight > 360 && !zoneState) { ctx.hint(t('mg_chore_kitchen_circles'), 'warn'); straight = 0; }
      } else straight = Math.max(0, straight - d);
      const v = value();
      ctx.progress(Math.min(1, v / DISH.max));
      const zs = v > DISH.hi ? 'over' : v >= DISH.lo ? 'in' : '';
      if (zs !== zoneState) {
        zoneState = zs;
        // Dans le vert : le bouton à toucher. Au-delà : « Arrête-toi dans la zone verte »
        // (pas « Lâche vite ! » : lever l'éponge n'envoie pas l'assiette).
        if (zs === 'in') { ctx.hint(STOP_HINT(t), 'good'); fx.text(plate.x, plate.y - 60, t('mg_good'), '#2f8a5f', 24); }
        else if (zs === 'over') ctx.hint(t('mg_zoneHint'), 'warn');
      }
      // Beaucoup trop frotté : l'assiette part toute seule (trop).
      if (v >= DISH.max) send();
    }
    last = p;
  }

  return {
    peek: () => ({ phase, plate: { x: plate.x, y: plate.y }, sink, rack, done, dirt: dirt(), extra, value: value(), lo: DISH.lo, hi: DISH.hi, max: DISH.max, plates: [...plates] }),
    down(p) {
      last = null;
      if (phase === 'scrub') scrub(p);
    },
    move(p, down) {
      if (!down) return;
      if (phase === 'scrub') scrub(p);
    },
    up() { last = null; },
    key(code, down) { if (down && (code === 'Enter' || code === 'NumpadEnter' || code === 'Space')) send(); },
    update(dt) {
      if (phase !== 'fly') return;
      plate.k = Math.min(1, plate.k + dt * 2);
      const s = slots[done];
      const k = plate.k;
      plate.x = sink.x + (s.x - sink.x) * k;
      plate.y = sink.y + (s.y - sink.y) * k - Math.sin(k * Math.PI) * 60;
      if (k >= 1) {
        done++;
        fx.burst(s.x, s.y, '💧', 3, { speed: 60, size: 14, life: 0.6 });
        if (done >= PLATES) {
          phase = 'done';
          finishAll();
          return;
        }
        plate = newPlate();
        phase = 'scrub';
        extra = 0;
        straight = 0;
        zoneState = '';
        stopBtn.disabled = false;
        ctx.progress(0);
        ctx.hint(t('mg_chore_kitchen_next'));
      }
    },
    draw(g) {
      const v = ctx.view;
      // carrelage, plan de travail, placards
      tiles(g, v, '#d8eef6', '#bfdde9');
      g.fillStyle = '#d7d0c3';
      g.fillRect(v.x0, 150, v.w, 170);
      g.fillStyle = '#c4bcad';
      g.fillRect(v.x0, 150, v.w, 6);
      g.fillStyle = '#b08a5c';
      g.fillRect(v.x0, 320, v.w, v.y1 - 320);
      g.strokeStyle = '#8a6a3c';
      g.lineWidth = 3;
      for (let x = Math.floor(v.x0 / 100) * 100; x < v.x1; x += 100) {
        g.strokeRect(x + 8, 328, 84, 80);
        g.fillStyle = '#5c3b1e';
        rrect(g, x + 42, 336, 16, 5, 2);
        g.fill();
      }
      // évier et robinet
      g.fillStyle = '#9aa3ab';
      rrect(g, 36, 168, 164, 136, 18);
      g.fill();
      g.fillStyle = '#7f8a93';
      rrect(g, 46, 178, 144, 116, 14);
      g.fill();
      g.fillStyle = '#8ec6ea';
      ellipse(g, sink.x, sink.y, 68, 50);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 5; i++) { circle(g, 70 + i * 24 + (i % 2) * 6, 206 + (i % 3) * 30, 4 + (i % 2) * 2); g.fill(); }
      g.strokeStyle = '#aeb6bd';
      g.lineWidth = 9;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(118, 168);
      g.lineTo(118, 140);
      g.quadraticCurveTo(118, 118, 140, 122);
      g.stroke();
      // égouttoir
      g.fillStyle = '#eef1f3';
      rrect(g, rack.x, rack.y, rack.w, rack.h, 12);
      g.fill();
      g.strokeStyle = '#8f9aa4';
      g.lineWidth = 3;
      rrect(g, rack.x, rack.y, rack.w, rack.h, 12);
      g.stroke();
      for (let i = 0; i <= PLATES; i++) {
        const x = rack.x + 9 + i * 23;
        g.beginPath();
        g.moveTo(x, rack.y + rack.h - 72);
        g.lineTo(x, rack.y + rack.h - 8);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(rack.x + 6, rack.y + rack.h - 8);
      g.lineTo(rack.x + rack.w - 6, rack.y + rack.h - 8);
      g.stroke();
      for (let i = 0; i < done; i++) {
        const s = slots[i];
        g.fillStyle = '#ffffff';
        ellipse(g, s.x, s.y, 9, 30);
        g.fill();
        g.strokeStyle = '#bcd8e8';
        g.lineWidth = 2;
        ellipse(g, s.x, s.y, 9, 30);
        g.stroke();
      }
      label(g, `${done} / ${PLATES}`, rack.x + rack.w / 2, rack.y - 18, 18);
      // la pile qui attend
      for (let i = 0; i < PLATES - done - 1; i++) {
        g.fillStyle = '#f4f4f4';
        ellipse(g, 226, 300 - i * 5, 22, 7);
        g.fill();
        g.strokeStyle = '#c8762c';
        g.lineWidth = 1.5;
        ellipse(g, 226, 300 - i * 5, 22, 7);
        g.stroke();
      }
      // l'assiette en cours (et l'anneau « juste ce qu'il faut » autour, quand on frotte)
      if (phase !== 'done') {
        const { x, y } = plate;
        if (phase === 'scrub') drawPlateRing(g, x, y, sink.r + 12, value() / DISH.max, DISH.lo / DISH.max, DISH.hi / DISH.max);
        if (phase === 'fly') {
          g.fillStyle = 'rgba(0,0,0,0.15)';
          ellipse(g, x, y + 54, 40, 10);
          g.fill();
        }
        const pr = phase === 'fly' ? sink.r * (1 - 0.5 * plate.k) : sink.r;
        g.fillStyle = '#ffffff';
        circle(g, x, y, pr);
        g.fill();
        g.strokeStyle = '#bcd8e8';
        g.lineWidth = 3;
        circle(g, x, y, pr - 9);
        g.stroke();
        g.lineWidth = 2;
        circle(g, x, y, pr);
        g.stroke();
        for (const s of plate.smears) {
          if (s.amt <= 0.02) continue;
          g.save();
          g.globalAlpha = 0.35 + 0.65 * s.amt;
          g.fillStyle = s.col;
          ellipse(g, x + s.dx, y + s.dy, s.r * (0.7 + 0.3 * s.amt), s.r * 0.65, s.rot);
          g.fill();
          g.restore();
        }
        if (dirt() <= 0.04 && phase === 'scrub') emoji(g, '✨', x + 20, y - 24, 18, 0, 0.8);
      }
      // l'éponge
      const pp = ctx.pointer;
      if ((pp.over || pp.down) && !ctx.done && phase === 'scrub') {
        g.save();
        g.translate(pp.x, pp.y);
        g.rotate(Math.sin(ctx.time * 12) * (pp.down ? 0.2 : 0));
        g.fillStyle = '#f7d54a';
        rrect(g, -24, -16, 48, 32, 12);
        g.fill();
        g.fillStyle = '#6fbf73';
        rrect(g, -24, -16, 48, 10, 6);
        g.fill();
        g.fillStyle = '#e8b830';
        for (let i = 0; i < 5; i++) { circle(g, -14 + i * 7, 2 + (i % 2) * 8, 2.5); g.fill(); }
        g.restore();
      }
    },
  };
}

/**
 * Anneau autour de l'assiette : il se remplit (en bleu, dans le sens des aiguilles) avec le
 * frottage, la part verte est la zone juste [lo, hi] (fractions 0–1), le tour complet = trop.
 */
function drawPlateRing(g, x, y, R, k, lo, hi) {
  const a0 = -Math.PI / 2;
  const ang = (f) => a0 + clamp(f) * Math.PI * 2;
  g.save();
  g.lineCap = 'butt';
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = 9;
  circle(g, x, y, R);
  g.stroke();
  g.strokeStyle = 'rgba(63,174,98,0.95)';
  g.lineWidth = 13;
  g.beginPath();
  g.arc(x, y, R, ang(lo), ang(hi));
  g.stroke();
  if (k > 0) {
    g.strokeStyle = '#3c7bd9';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(x, y, R, a0, ang(k));
    g.stroke();
  }
  const am = ang((lo + hi) / 2);
  label(g, '✓', x + Math.cos(am) * (R + 14), y + Math.sin(am) * (R + 14), 16, '#1e5c3e');
  g.restore();
}

/** Un mini-jeu par corvée (même ordre que CHORE_KINDS). */
export const CHORE_GAMES = {
  muck: muckGame,
  straw: strawGame,
  sweep: sweepGame,
  living: livingGame,
  kitchen: kitchenGame,
};
