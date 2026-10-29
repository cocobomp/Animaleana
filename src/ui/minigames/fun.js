// Mini-jeux « câlins et jeux » : caresser, jouer (balle ou plumeau), traire.

import { drawAnimal, animalShape, fitAnimal, hitAnimal, rrect, ellipse, circle, label, fillView, sky, clamp, lerp, dist, shade } from './draw.js';
// emoji toujours opaque (voir food.js : un emoji prend l'opacité du dernier fillStyle)
import { homeBackground, sizeFor, isBig, drawCountZone, emojiOpaque as emoji, stopLabel, nb, justMsgs, drawAnimalLifted } from './food.js';
import { quirksOf, knows } from '../../sim/horseQuirks.js'; // 🔍 son coin préféré (cheval)

// ---------------------------------------------------------------- caresser

const FAVORITE = { dog: 'chest', cat: 'cheek', rabbit: 'headTop', horse: 'neck', cow: 'neck', sheep: 'cheek', goat: 'neck' };
const SPEED_LIMIT = { shy: 300, calm: 380, cuddly: 430, playful: 520, curious: 460, stubborn: 400 };
// Combien de câlins « juste ce qu'il faut » (cœur rempli, 0 à 1) selon le caractère :
// un timide en veut moins, un câlin en veut plus. Au-delà, l'animal en a assez.
const PET_AMOUNT = { shy: 0.5, calm: 0.62, cuddly: 0.8, playful: 0.66, curious: 0.66, stubborn: 0.56 };

/**
 * Le grand cœur du jeu « caresser », en haut à droite. Avant (340, 62, r 34), il recouvrait
 * les oreilles du chien, du lapin, du cheval et de la chèvre (têtes vers x 290, y 50 à 95).
 */
export const HEART = { x: 368, y: 42, r: 24 };

/** Tracé d'un cœur centré en (x, y), de rayon r (largeur ≈ 2 r). */
function heartPath(g, x, y, r) {
  g.beginPath();
  g.moveTo(x, y + r * 0.95);
  g.bezierCurveTo(x - r * 1.5, y - r * 0.1, x - r * 0.9, y - r * 1.1, x, y - r * 0.35);
  g.bezierCurveTo(x + r * 0.9, y - r * 1.1, x + r * 1.5, y - r * 0.1, x, y + r * 0.95);
  g.closePath();
}

/** Le grand cœur qui se remplit, avec la zone verte « juste ce qu'il faut » et son ✓. */
function drawHeartGauge(g, x, y, r, value, lo, hi) {
  const top = y - r * 1.05;
  const bottom = y + r * 0.95;
  const yOf = (v) => bottom - v * (bottom - top);
  g.save();
  heartPath(g, x, y, r);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fill();
  g.save();
  heartPath(g, x, y, r);
  g.clip();
  g.fillStyle = value > hi ? '#c47ab0' : '#ff6f9c';
  g.fillRect(x - r * 2, yOf(value), r * 4, bottom - yOf(value) + 2);
  g.fillStyle = 'rgba(63, 174, 98, 0.45)';
  g.fillRect(x - r * 2, yOf(hi), r * 4, yOf(lo) - yOf(hi));
  g.strokeStyle = '#1e8a4a';
  g.lineWidth = 2;
  g.strokeRect(x - r * 2, yOf(hi), r * 4, yOf(lo) - yOf(hi));
  g.restore();
  heartPath(g, x, y, r);
  g.strokeStyle = '#d6457a';
  g.lineWidth = 3;
  g.stroke();
  label(g, '✓', x - r * 1.55, (yOf(lo) + yOf(hi)) / 2, 20, '#1e5c3e');
  g.restore();
}

export function petGame(ctx) {
  const { a, t, fx } = ctx;
  const hint = (text, kind) => ctx.hint(nb(text), kind); // (« ! » jamais seul à la ligne)
  const floorY = 305;
  const fit = fitAnimal(a, { groundY: floorY, maxW: 330, maxH: 240 });
  const sh = animalShape(a, { x: fit.x, y: floorY, s: fit.s, f: 1 });
  // Un cheval a son coin à lui (src/sim/horseQuirks.js) ; tant qu'on ne le connaît pas, le 💡 attend plus longtemps.
  const qk = a.species === 'horse' ? quirksOf(a) : null;
  const fav = sh[qk ? qk.spot : FAVORITE[a.species] ?? 'back'];
  const hintAfter = qk && !knows(a, 'spot') ? 8 : 3.5;
  const favR = 46;
  const limit = SPEED_LIMIT[a.personality] ?? 420;
  const shy = a.personality === 'shy';
  // « Juste ce qu'il faut » : le cœur doit arriver dans la zone verte, puis on appuie sur
  // « C'est bon ! ». Continuer trop longtemps lasse l'animal (cœur plein = trop, c'est fini).
  const target = PET_AMOUNT[a.personality] ?? 0.65;
  const band = 0.12;
  const lo = target - band;
  const hi = target + band;
  let prog = 0;
  let speed = 0;
  let last = null;
  let lastT = 0;
  let heartAcc = 0;
  let favDist = 0;
  let fast = 0;
  let flinch = 0;
  let cool = 0;
  let calmStroke = 0;
  let purr = 0;
  let lip = 0; // (cheval : il tend la lèvre, gratté à son coin préféré)
  let lipShown = false;
  let lastLove = -9; // dernier « Ronron… » affiché
  let zoneState = 'low'; // 'low' | 'just' | 'high' : pour ne changer la consigne qu'en entrant dans une zone

  hint(t(shy ? 'mg_pet_hint_shy' : 'mg_pet_hint', { name: a.name }));
  ctx.zone(lo, hi);
  const stopBtn = ctx.stopButton(() => { if (prog >= 0.03) end(); }, stopLabel(t)); // (un bouton grisé ne finit jamais le jeu)
  stopBtn.disabled = true;

  /** Fin : la note suit le remplissage du cœur par rapport à la zone verte. */
  function end() {
    if (ctx.done) return;
    const { verdict: why } = ctx.finishJust(prog, lo, hi, { who: a.name, msgs: justMsgs(t, a.name) });
    if (why === 'just') fx.burst(sh.head.x, sh.head.y - 20, '💕', 6);
    else if (why === 'high') fx.float(sh.head.x, sh.head.y - sh.hr * 1.6, '😮‍💨', 28);
  }

  function stroke(p) {
    const now = ctx.time;
    if (!last) { last = p; lastT = now; return; }
    const d = dist(p.x, p.y, last.x, last.y);
    const dtm = Math.max(0.008, now - lastT);
    last = p;
    lastT = now;
    if (d < 0.5) return;
    speed = lerp(speed, d / dtm, 0.35);
    if (!hitAnimal(sh, p.x, p.y, 8)) return;
    if (speed > limit) {
      if (cool <= 0) {
        fast++;
        flinch = 0.5;
        cool = 0.9;
        prog = Math.max(0, prog - (shy ? 0.07 : 0.035));
        fx.text(p.x, p.y - 30, t('mg_gentle_short'), '#c07a10', 22);
        fx.float(sh.head.x, sh.head.y - sh.hr * 1.6, '❗', 26);
        hint(t('mg_gentle', { name: a.name }), 'warn');
        zoneState = 'low';
      }
      return;
    }
    const atFav = dist(p.x, p.y, fav.x, fav.y) < favR;
    prog = Math.min(1, prog + d * 0.0011 * (atFav ? 2.3 : 1));
    if (atFav) favDist += d;
    if (qk && !lipShown && favDist > 120) {
      // 🔍 Gratté juste là, il tend la lèvre du haut : c'est son coin préféré (noté par le jeu : opts.out.quirk)
      lipShown = true;
      lip = 1.5;
      fx.text(200, sh.head.y - sh.hr * 2, t('mg_pet_lip', { name: a.name, g: a.sex }), '#d6457a', 16);
      if (ctx.opts) ctx.opts.out = { ...(ctx.opts.out ?? {}), quirk: 'spot' };
    } else if (lipShown && atFav) lip = Math.max(lip, 0.6); // (tant qu'on le gratte là, la lèvre reste tendue)
    calmStroke += d;
    heartAcc += d;
    if (heartAcc > 48) {
      heartAcc = 0;
      fx.float(p.x, p.y - 12, prog > hi ? '💤' : atFav ? '💖' : '❤️', atFav ? 26 : 20);
    }
    // « Ronron… » / « J'adore ! » : pas plus d'une fois par seconde, à gauche de la tête pour ne
    // pas cacher le grand cœur (en haut à droite).
    if (prog <= hi && atFav && ctx.time - lastLove > 1.2 && Math.random() < 0.08) {
      lastLove = ctx.time;
      fx.text(Math.max(70, sh.head.x - sh.hr * 2.4), sh.head.y - sh.hr * 1.6, t(a.species === 'cat' ? 'mg_purr' : 'mg_loves'), '#d6457a', 18);
    }
    if (atFav) purr = 0.6;
    stopBtn.disabled = prog < 0.03;
    ctx.progress(prog);
    if (prog >= 1 && !ctx.done) {
      end(); // il en a assez : c'est fini, et c'était trop
    } else if (prog > hi) {
      if (zoneState !== 'high') { zoneState = 'high'; hint(t('mg_tooMuch', { name: a.name }), 'warn'); }
    } else if (prog >= lo) {
      if (zoneState !== 'just') { zoneState = 'just'; hint(`✅ ${t('mg_stopHere')}`, 'good'); }
    } else if (calmStroke > 180) {
      zoneState = 'low';
      hint(t(lip > 0 ? 'mg_pet_lip' : atFav ? 'mg_pet_fav' : 'mg_pet_good', { name: a.name, g: a.sex }), 'good');
    }
  }

  return {
    peek: () => ({ fav, spot: qk?.spot ?? null, lip, prog, value: prog, lo, hi, fast, body: { x: sh.bx, y: sh.by } }),
    key(code, down) { if (down && (code === 'Enter' || code === 'NumpadEnter') && !stopBtn.disabled) end(); },
    down(p) { last = p; lastT = ctx.time; },
    move(p, down) { if (down) stroke(p); },
    up() { last = null; speed *= 0.5; },
    update(dt) {
      flinch = Math.max(0, flinch - dt);
      cool = Math.max(0, cool - dt);
      purr = Math.max(0, purr - dt);
      lip = Math.max(0, lip - dt);
      if (!ctx.pointer.down) speed = Math.max(0, speed - dt * 600);
    },
    draw(g) {
      if (isBig(a)) sky(g, ctx.view, '#a9d8f2', '#e4f3fb', floorY, '#8cc268', '#6fa94f');
      else homeBackground(g, ctx, floorY);
      const fedUp = prog > hi && !ctx.done;
      drawAnimal(g, a, { x: fit.x, y: floorY, s: fit.s, f: 1, happy: (ctx.pointer.down && flinch <= 0 && speed > 20 && !fedUp) || (ctx.done && prog <= hi), earsBack: flinch > 0 || fedUp, shake: flinch > 0 ? 0.6 : 0, wag: (purr > 0 && !fedUp) || (ctx.done && prog <= hi), lip: lip > 0 });
      if (fedUp) emoji(g, '😑', sh.head.x + sh.hr * 1.3, sh.head.y - sh.hr * 1.7, 26);
      // Endroit préféré : il scintille si on ne l'a pas encore trouvé
      if (!ctx.done && ctx.time > hintAfter && favDist < 60) {
        g.save();
        g.globalAlpha = 0.35 + Math.sin(ctx.time * 5) * 0.25;
        g.strokeStyle = '#ff7aa8';
        g.lineWidth = 4;
        g.setLineDash([6, 6]);
        circle(g, fav.x, fav.y, favR * 0.8);
        g.stroke();
        g.restore();
        emoji(g, '💡', fav.x + favR * 0.8, fav.y - favR * 0.8, 20);
      }
      // Jauge de vitesse : tortue = doux, lièvre = trop vite
      const gx = 24;
      const gy = 26;
      const gw = 150;
      g.fillStyle = 'rgba(255,255,255,0.85)';
      rrect(g, gx - 10, gy - 16, gw + 60, 32, 16);
      g.fill();
      const k = clamp(speed / (limit * 1.4));
      const okW = gw / 1.4;
      g.fillStyle = '#c9ecd4';
      rrect(g, gx + 18, gy - 6, okW, 12, 6);
      g.fill();
      g.fillStyle = '#f7c9c3';
      rrect(g, gx + 18 + okW, gy - 6, gw - okW, 12, 6);
      g.fill();
      g.fillStyle = k * 1.4 > 1 ? '#e0574a' : '#3fae62';
      circle(g, gx + 18 + gw * k, gy, 9);
      g.fill();
      emoji(g, '🐢', gx + 4, gy, 18);
      emoji(g, '🐇', gx + gw + 34, gy, 18);
      // Le grand cœur qui se remplit, avec la zone verte où s'arrêter (dans le coin : il ne
      // cache plus les oreilles du chien, du lapin, du cheval ou de la chèvre)
      drawHeartGauge(g, HEART.x, HEART.y, HEART.r, prog, lo, hi);
      const pp = ctx.pointer;
      if (pp.over || pp.down) emoji(g, '🤚', pp.x + 4, pp.y - 6, 36, -0.3);
    },
  };
}

// ---------------------------------------------------------------- jouer

export function playGame(ctx) {
  return ctx.a.species === 'cat' ? featherGame(ctx) : ballGame(ctx);
}

/** Nombre de lancers (ou de bonds) « juste ce qu'il faut » : un joueur en veut plus, un fatigué moins (2 à 4). */
export function playCount(a) {
  const base = a.personality === 'playful' ? 4 : 3;
  return Math.max(2, (a.needs?.energy ?? 100) < 40 ? base - 1 : base);
}

function ballGame(ctx) {
  const { a, t, fx } = ctx;
  const hint = (text, kind) => ctx.hint(nb(text), kind); // (« ! » jamais seul à la ligne)
  const horizon = 150;
  const base = sizeFor(a, 0.75);
  const run = { dog: 240, goat: 210, rabbit: 200 }[a.species] ?? 220;
  // « Juste ce qu'il faut » : n lancers (cadre vert en haut à droite). Au-delà, l'animal se
  // fatigue (il court moins vite, il souffle) ; à max, il n'en peut plus et c'est fini.
  const n = playCount(a);
  const max = n + 2;
  const scaleAt = (y) => base * lerp(0.55, 1, clamp((y - horizon) / 150));
  const pet = { x: 200, y: 230, f: 1, walk: 0, state: 'wander', tx: 120, ty: 210, lift: 0, has: false };
  let ball = { state: 'hand', x: 200, y: 330, k: 0 };
  let rounds = 0;
  let wanderT = 0;
  let react = 0;
  let puff = 0;
  const tired = () => rounds > n;

  hint(`${t('mg_ball_hint', { name: a.name })} ${'⚽'.repeat(n)}`);
  ctx.zone((n - 0.5) / max, (n + 0.5) / max);
  const stopBtn = ctx.stopButton(() => { if (rounds >= 1 && ball.state === 'hand') end(); }, stopLabel(t));
  stopBtn.disabled = true;

  function throwAt(p) {
    if (ctx.done || ball.state !== 'hand' || p.y < horizon + 5 || p.y > 315) return;
    ball = { state: 'fly', sx: 200, sy: 325, tx: p.x, ty: p.y, k: 0, x: 200, y: 325, h: 0 };
    react = 0.15;
    pet.state = 'chase';
  }

  /** Fin : la note suit le nombre de lancers par rapport à n. */
  function end() {
    if (ctx.done) return;
    const { verdict: why } = ctx.finishJust(rounds, n, n, { who: a.name, slack: 2, msgs: justMsgs(t, a.name) });
    pet.state = why === 'high' ? 'tired' : 'happy';
  }

  function arrive(x, y, speed, dt) {
    const d = dist(pet.x, pet.y, x, y);
    if (d < 4) return true;
    const st = Math.min(d, speed * dt);
    pet.x += ((x - pet.x) / d) * st;
    pet.y += ((y - pet.y) / d) * st;
    if (Math.abs(x - pet.x) > 2) pet.f = x > pet.x ? 1 : -1;
    pet.walk += dt * speed / 12;
    return d - st < 4;
  }

  return {
    peek: () => ({ x: pet.x, y: pet.y, ball: ball.state, rounds, n, max, lo: n, hi: n, value: rounds, state: pet.state }),
    down(p) { throwAt(p); },
    key(code, down) {
      // Espace : lancer près de l'animal ; Entrée : « C'est bon ! ».
      if (!down) return;
      if (code === 'Space') throwAt({ x: pet.x + pet.f * 40, y: pet.y });
      else if ((code === 'Enter' || code === 'NumpadEnter') && !stopBtn.disabled) end();
    },
    update(dt) {
      pet.lift = Math.max(0, pet.lift - dt * 80);
      stopBtn.disabled = ctx.done || rounds < 1 || ball.state !== 'hand';
      const speedK = tired() ? 0.55 : 1;
      if (tired() && !ctx.done) {
        puff += dt;
        if (puff > 0.6) { puff = 0; fx.float(pet.x + pet.f * 20, pet.y - 70, '💦', 20); }
      }
      if (ball.state === 'fly') {
        ball.k = Math.min(1, ball.k + dt / 0.75);
        ball.x = lerp(ball.sx, ball.tx, ball.k);
        ball.y = lerp(ball.sy, ball.ty, ball.k);
        ball.h = Math.sin(ball.k * Math.PI) * 110;
        if (ball.k >= 1) {
          const close = dist(pet.x, pet.y, ball.tx, ball.ty);
          if (close < 46) {
            ball.state = 'mouth';
            pet.has = true;
            pet.lift = 30;
            fx.text(pet.x, pet.y - 90, t('mg_caught'), '#2f8a5f', 26);
            fx.burst(pet.x, pet.y - 60, '⭐', 4);
            pet.state = 'back';
          } else {
            ball.state = 'ground';
            ball.h = 0;
            fx.text(ball.x, ball.y - 30, t('mg_tooFar'), '#c07a10', 20);
          }
        }
      }
      if (react > 0) { react -= dt; return; }
      if (pet.state === 'chase') {
        const target = ball.state === 'fly' ? { x: ball.tx, y: ball.ty } : ball;
        const reached = arrive(target.x, target.y, run * speedK, dt);
        if (reached && ball.state === 'ground') {
          ball.state = 'mouth';
          pet.has = true;
          fx.text(pet.x, pet.y - 80, t('mg_gotIt'), '#3c7bd9', 22);
          pet.state = 'back';
        }
      } else if (pet.state === 'back') {
        if (arrive(200, 290, run * 0.8 * speedK, dt)) {
          pet.has = false;
          ball = { state: 'hand', x: 200, y: 330, k: 0 };
          rounds++;
          ctx.progress(rounds / max);
          fx.float(200, 220, rounds > n ? '💤' : '💛', 26);
          if (rounds >= max) {
            end(); // il n'en peut plus : trop, et c'est fini
          } else {
            pet.state = 'wander';
            wanderT = 0;
            if (rounds === n) hint(`✅ ${t('mg_stopHere')}`, 'good');
            else if (rounds > n) hint(t('mg_tooMuch', { name: a.name }), 'warn');
            else hint(t(rounds === 1 ? 'mg_ball_again' : 'mg_ball_hint', { name: a.name }));
          }
        }
      } else if (pet.state === 'wander') {
        wanderT -= dt;
        if (wanderT <= 0 || arrive(pet.tx, pet.ty, 0, 0)) {
          pet.tx = 50 + ctx.rng() * 300;
          pet.ty = horizon + 40 + ctx.rng() * 110;
          wanderT = 1.5 + ctx.rng() * 1.5;
        }
        arrive(pet.tx, pet.ty, 70 * speedK, dt);
      }
    },
    draw(g) {
      sky(g, ctx.view, '#9fd4f5', '#e6f5ff', horizon, '#9fd27a', '#6fa94f');
      // arbres au loin
      for (let i = 0; i < 6; i++) {
        const x = 20 + i * 75;
        g.fillStyle = '#7a5232';
        g.fillRect(x - 4, horizon - 14, 8, 16);
        g.fillStyle = i % 2 ? '#5f9b45' : '#6aa84f';
        circle(g, x, horizon - 24, 20);
        g.fill();
        circle(g, x - 12, horizon - 14, 13);
        g.fill();
        circle(g, x + 12, horizon - 14, 13);
        g.fill();
      }
      // fleurs
      for (let i = 0; i < 14; i++) {
        const x = (i * 97) % 400;
        const y = horizon + 20 + ((i * 53) % 170);
        emoji(g, i % 2 ? '🌼' : '🌸', x, y, 10 + (y - horizon) / 18);
      }
      const s = scaleAt(pet.y);
      const moving = pet.state === 'chase' || pet.state === 'back' || (pet.state === 'wander' && dist(pet.x, pet.y, pet.tx, pet.ty) > 5);
      const sh = drawAnimalLifted(g, a, { x: pet.x, y: pet.y, s, f: pet.f, walk: moving && react <= 0 ? pet.walk : null, wag: !tired(), pose: pet.state === 'tired' ? 'sit' : 'stand', happy: (pet.has || ctx.done) && !tired(), earsBack: tired() }, pet.lift);
      if (tired() && !moving) emoji(g, '😮‍💨', sh.head.x + pet.f * 18, sh.head.y - 36, 22);
      if (ball.state === 'mouth') {
        ball.x = sh.mouth.x;
        ball.y = sh.mouth.y;
      }
      // balle
      if (ball.state !== 'hand') {
        const bs = ball.state === 'mouth' ? 14 * s : 12 * scaleAt(ball.y) + 4;
        if (ball.state === 'fly') {
          g.fillStyle = 'rgba(0,0,0,0.18)';
          ellipse(g, ball.x, ball.y, bs, bs * 0.4);
          g.fill();
          drawBall(g, ball.x, ball.y - ball.h, bs);
          // cible
          g.strokeStyle = 'rgba(255,255,255,0.8)';
          g.lineWidth = 2;
          ellipse(g, ball.tx, ball.ty, 20, 8);
          g.stroke();
        } else drawBall(g, ball.x, ball.y - (ball.state === 'mouth' ? 0 : bs * 0.8), bs);
      }
      // main du joueur
      emoji(g, '✋', 200, 342, 40);
      if (ball.state === 'hand') drawBall(g, 200, 330, 16);
      // Compteur : n lancers dans le cadre vert, les suivants grisés (trop)
      drawCountZone(g, 400 - 24 - (max - 1) * 30, 30, rounds, n, max, '⚽', 30);
      const pp = ctx.pointer;
      if (ball.state === 'hand' && !ctx.done && (pp.over || pp.down) && pp.y > horizon && pp.y < 315) {
        g.strokeStyle = 'rgba(255,255,255,0.9)';
        g.lineWidth = 3;
        g.setLineDash([6, 6]);
        g.beginPath();
        g.moveTo(200, 325);
        g.quadraticCurveTo((200 + pp.x) / 2, Math.min(pp.y, 325) - 110, pp.x, pp.y);
        g.stroke();
        g.setLineDash([]);
        emoji(g, '🎯', pp.x, pp.y, 24);
      }
    },
  };
}

function drawBall(g, x, y, r) {
  g.fillStyle = '#e0574a';
  circle(g, x, y, r);
  g.fill();
  g.strokeStyle = '#fff';
  g.lineWidth = Math.max(1.5, r * 0.2);
  g.beginPath();
  g.arc(x, y, r * 0.7, -0.6, 1.2);
  g.stroke();
}

function featherGame(ctx) {
  const { a, t, fx } = ctx;
  const hint = (text, kind) => ctx.hint(nb(text), kind); // (« ! » jamais seul à la ligne)
  const floorY = 300;
  const s = sizeFor(a, 0.8);
  // « Juste ce qu'il faut » : n bonds attrapés (cadre vert en haut). Au-delà, le chat se
  // fatigue (il bondit moins) ; à max, il n'en peut plus et c'est fini.
  const n = playCount(a);
  const max = n + 2;
  const cat = { x: 120, f: 1, walk: 0, jump: null, cool: 1, bored: 0, crouch: 0 };
  let feather = { x: 280, y: 160 };
  let fspeed = 0;
  let prev = { ...feather };
  let catches = 0;
  let held = 0;
  let puff = 0;
  const tired = () => catches > n;

  hint(`${t('mg_feather_hint', { name: a.name })} ${'🪶'.repeat(n)}`);
  ctx.zone((n - 0.5) / max, (n + 0.5) / max);
  const stopBtn = ctx.stopButton(() => { if (catches >= 1) end(); }, stopLabel(t));
  stopBtn.disabled = true;

  /** Fin : la note suit le nombre de bonds attrapés par rapport à n. */
  function end() {
    if (ctx.done) return;
    ctx.finishJust(catches, n, n, { who: a.name, slack: 2, msgs: justMsgs(t, a.name) });
  }

  const catShape = (lift = 0) => animalShape(a, { x: cat.x, y: floorY, s, f: cat.f, lift });

  return {
    peek: () => ({ x: cat.x, catches, n, max, lo: n, hi: n, value: catches, jumping: !!cat.jump, held: held > 0 }),
    key(code, down) { if (down && (code === 'Enter' || code === 'NumpadEnter') && !stopBtn.disabled) end(); },
    move(p) {
      if (held > 0) return;
      feather = { x: clamp(p.x, 20, 380), y: clamp(p.y, 40, floorY - 6) };
    },
    down(p) {
      if (held > 0) return;
      feather = { x: clamp(p.x, 20, 380), y: clamp(p.y, 40, floorY - 6) };
    },
    update(dt) {
      const v = dist(feather.x, feather.y, prev.x, prev.y) / Math.max(dt, 0.001);
      prev = { ...feather };
      fspeed = lerp(fspeed, v, 0.12);
      cat.cool = Math.max(0, cat.cool - dt);
      stopBtn.disabled = ctx.done || catches < 1;
      if (tired() && !ctx.done) {
        puff += dt;
        if (puff > 0.7) { puff = 0; fx.float(cat.x + cat.f * 20, floorY - 90, '💦', 20); }
      }
      if (held > 0) {
        held -= dt;
        if (held <= 0) {
          // Le chat lâche la plume, qui revient un peu plus loin. Ce saut n'est pas un mouvement
          // de l'enfant : sans ça, le chat (« plume très rapide ! ») rebondissait tout seul, et
          // l'enfant arrêté pile au bon nombre trouvait un bond de trop en appuyant sur « C'est bon ! ».
          feather = { x: cat.x + cat.f * -140 < 30 ? 330 : cat.x - cat.f * 140, y: 120 };
          prev = { ...feather };
          fspeed = 0;
        }
        return;
      }
      if (ctx.done) return;
      if (cat.jump) {
        const j = cat.jump;
        j.k = Math.min(1, j.k + dt / 0.6);
        cat.x = lerp(j.x0, j.x1, j.k);
        if (j.k > 0.45 && !j.checked) {
          j.checked = true;
          const sh = catShape(j.h * Math.sin(j.k * Math.PI));
          if (dist(sh.mouth.x, sh.mouth.y, feather.x, feather.y) < 62) {
            catches++;
            held = 0.8;
            fx.text(cat.x, 60, t(catches === n ? 'mg_perfect' : catches > n ? 'mg_oops' : 'mg_caught'), catches > n ? '#c8463c' : '#2f8a5f', 26);
            fx.burst(feather.x, feather.y, catches > n ? '💤' : '💛', 5);
            ctx.progress(catches / max);
            if (catches >= max) end(); // il n'en peut plus : trop, et c'est fini
            else if (catches === n) hint(`✅ ${t('mg_stopHere')}`, 'good');
            else if (catches > n) hint(t('mg_tooMuch', { name: a.name }), 'warn');
          } else fx.text(cat.x, 80, t('mg_missed'), '#c07a10', 20);
        }
        if (j.k >= 1) { cat.jump = null; cat.cool = tired() ? 1.3 : 0.5; }
        return;
      }
      if (fspeed < 30) cat.bored += dt;
      else cat.bored = Math.max(0, cat.bored - dt * 3);
      if (cat.bored > 1.4) {
        if (catches < n) hint(t('mg_feather_move'), 'warn');
        return;
      }
      const dx = feather.x - cat.x;
      if (Math.abs(dx) > 4) cat.f = dx > 0 ? 1 : -1;
      const reach = Math.abs(dx) < 120 && feather.y > floorY - 210;
      cat.crouch = reach ? Math.min(1, cat.crouch + dt * 3) : Math.max(0, cat.crouch - dt * 3);
      if (reach && cat.cool <= 0 && fspeed > 30 && cat.crouch >= 1) {
        // Bond vers la plume
        const off = animalShape(a, { x: 0, y: floorY, s, f: cat.f }).mouth.x;
        cat.jump = { x0: cat.x, x1: clamp(feather.x - off, 40, 360), k: 0, h: clamp(floorY - feather.y - 60, 10, 170), checked: false };
        if (catches < n) hint(t('mg_feather_hint', { name: a.name }));
      } else if (Math.abs(dx) > 70) {
        const st = Math.min(Math.abs(dx) - 60, (tired() ? 90 : 170) * dt);
        cat.x += Math.sign(dx) * st;
        cat.walk += dt * 14;
      }
    },
    draw(g) {
      homeBackground(g, ctx, floorY);
      // tapis
      g.fillStyle = '#e8a0b4';
      ellipse(g, 200, floorY + 24, 180, 26);
      g.fill();
      const lift = cat.jump ? cat.jump.h * Math.sin(cat.jump.k * Math.PI) : 0;
      const bored = cat.bored > 1.4 && !cat.jump;
      const sh = drawAnimalLifted(g, a, { x: cat.x, y: floorY, s, f: cat.f, pose: bored || (ctx.done && tired()) ? 'sit' : 'stand', walk: !cat.jump && !bored && cat.crouch < 1 ? cat.walk : null, happy: (held > 0 || ctx.done) && !tired(), headDip: cat.crouch * 0.15, wag: cat.crouch > 0.5 && !tired(), earsBack: tired() }, lift);
      if (bored) emoji(g, '💤', sh.head.x + 20, sh.head.y - 40, 22);
      else if (tired() && !cat.jump) emoji(g, '😮‍💨', sh.head.x + cat.f * 18, sh.head.y - 36, 22);
      // baguette + fil + plume
      const fx0 = held > 0 ? sh.mouth.x : feather.x;
      const fy0 = held > 0 ? sh.mouth.y : feather.y;
      g.strokeStyle = '#8a5a2b';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(420, 400);
      g.lineTo(340, 40);
      g.stroke();
      g.strokeStyle = 'rgba(60,60,60,0.7)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(340, 40);
      g.quadraticCurveTo((340 + fx0) / 2, Math.max(40, fy0) + 30, fx0, fy0 - 10);
      g.stroke();
      emoji(g, '🪶', fx0, fy0, 34, Math.sin(ctx.time * 9) * 0.4);
      // Compteur : n bonds dans le cadre vert, les suivants grisés (trop)
      drawCountZone(g, 36, 30, catches, n, max, '🪶', 30);
    },
  };
}

// ---------------------------------------------------------------- traire

export function milkGame(ctx) {
  const { a, t, fx } = ctx;
  const hint = (text, kind) => ctx.hint(nb(text), kind); // (« ! » jamais seul à la ligne)
  const cow = a.species === 'cow';
  const P = cow ? 0.62 : 0.56;
  const teats = { L: { x: 160, y: 200 }, R: { x: 240, y: 200 } };
  // « Juste ce qu'il faut » : le lait doit arriver au trait vert du seau (une vache en donne
  // plus qu'une chèvre), puis on appuie sur « C'est bon ! ». Un seau plein, c'est trop (et fini).
  // Dans la zone = tous les points. Le rythme compte quand même, mais dans le jeu : en mesure,
  // chaque pression donne plus de lait (on arrive plus vite au trait), et se tromper de côté
  // ne donne rien.
  const target = (cow ? 0.72 : 0.64) + (ctx.rng() - 0.5) * 0.08;
  const band = 0.08;
  const lo = target - band;
  const hi = target + band;
  let expect = 'L';
  let level = 0;
  let onBeat = 0;
  let hits = 0;
  let mistakes = 0;
  let lastHit = -1;
  let squirt = { L: 0, R: 0 };
  let wiggle = 0;
  let pulse = 0;
  let face = 0;
  let streak = 0;
  let zoneState = 'low';

  hint(t('mg_milk_hint'));
  ctx.zone(lo, hi);
  ctx.button(`👈 ${t('mg_left')}`, { cls: 'mg-half', onTap: () => press('L') });
  ctx.button(`${t('mg_right')} 👉`, { cls: 'mg-half', onTap: () => press('R') });
  const stopBtn = ctx.stopButton(() => { if (hits > 0) end(); }, stopLabel(t));
  stopBtn.disabled = true;
  // Trois boutons côte à côte, c'est trop serré sur un téléphone en portrait (libellés coupés
  // en deux) : Gauche / Droite sur une ligne, « C'est bon ! » en dessous, sur toute la largeur.
  // Sur un écran large (paysage, ordinateur), on garde une seule ligne : la scène a besoin de
  // toute la hauteur. Même seuil que le style des mini-jeux en portrait (640 px).
  const narrow = typeof matchMedia === 'function' ? matchMedia('(max-width: 640px)') : null;
  const layoutButtons = () => {
    const wrap = !!narrow?.matches;
    if (stopBtn.style) stopBtn.style.flexBasis = wrap ? '100%' : '';
    if (stopBtn.parentElement?.style) stopBtn.parentElement.style.flexWrap = wrap ? 'wrap' : '';
  };
  layoutButtons();
  narrow?.addEventListener?.('change', layoutButtons);

  /** Fin : la note suit le niveau du seau par rapport au trait vert. */
  function end() {
    if (ctx.done) return;
    const { verdict: why } = ctx.finishJust(level, lo, hi, { who: a.name, msgs: justMsgs(t, a.name) });
    face = why === 'high' ? 2 : 1;
  }

  function press(side) {
    if (ctx.done) return;
    const tm = ctx.time;
    if (side !== expect) {
      mistakes++;
      wiggle = 0.4;
      streak = 0;
      fx.text(teats[side].x, teats[side].y - 70, t('mg_alternate'), '#c07a10', 22);
      hint(t('mg_milk_alt'), 'warn');
      zoneState = 'low';
      return;
    }
    const ph = (tm % P) / P;
    const err = Math.min(ph, 1 - ph) * P;
    const good = err < 0.16 && tm - lastHit > 0.22;
    lastHit = tm;
    hits++;
    if (good) { onBeat++; streak++; } else streak = 0;
    level = Math.min(1, level + (good ? 0.05 : 0.035));
    squirt[side] = 0.35;
    expect = side === 'L' ? 'R' : 'L';
    stopBtn.disabled = false;
    if (streak > 0 && streak % 5 === 0) fx.text(200, 80, t('mg_rhythm'), '#2f8a5f', 24);
    ctx.progress(level);
    if (level >= 1) {
      end(); // ça déborde : trop, et c'est fini
    } else if (level > hi) {
      if (zoneState !== 'high') { zoneState = 'high'; hint(t('mg_tooMuch', { name: a.name }), 'warn'); }
    } else if (level >= lo) {
      if (zoneState !== 'just') { zoneState = 'just'; hint(`✅ ${t('mg_stopHere')}`, 'good'); }
    } else if (good) {
      zoneState = 'low';
      hint(t('mg_milk_good'), 'good');
    }
  }

  return {
    peek: () => ({ expect, phase: (ctx.time % P) / P, P, level, value: level, lo, hi, onBeat, hits, mistakes }),
    destroy() { narrow?.removeEventListener?.('change', layoutButtons); },
    down(p) { press(p.x < 200 ? 'L' : 'R'); },
    key(code, down) {
      if (!down) return;
      if (code === 'ArrowLeft' || code === 'KeyA' || code === 'KeyQ') press('L');
      if (code === 'ArrowRight' || code === 'KeyD') press('R');
      if (code === 'Space') press(expect);
      if ((code === 'Enter' || code === 'NumpadEnter') && !stopBtn.disabled) end();
    },
    update(dt) {
      squirt.L = Math.max(0, squirt.L - dt);
      squirt.R = Math.max(0, squirt.R - dt);
      wiggle = Math.max(0, wiggle - dt);
      const ph = (ctx.time % P) / P;
      pulse = Math.max(0, 1 - Math.min(ph, 1 - ph) * 6);
    },
    draw(g) {
      fillView(g, ctx.view, '#d9b98a', '#b08a5a');
      // ventre
      const c = ctx.col;
      g.fillStyle = c.coat;
      ellipse(g, 200, -10, 260, 110);
      g.fill();
      if (ctx.col.raw.pattern === 'patches' || ctx.col.raw.pattern === 'bicolor') {
        g.fillStyle = c.sec;
        ellipse(g, 110, 10, 70, 40, 0.3);
        g.fill();
        ellipse(g, 300, -20, 80, 50, -0.2);
        g.fill();
      }
      // pattes
      g.fillStyle = shade(ctx.col.raw.coat, -0.15);
      rrect(g, 20, 40, 50, 300, 20);
      g.fill();
      rrect(g, 330, 40, 50, 300, 20);
      g.fill();
      // pis
      const w = Math.sin(ctx.time * 30) * wiggle * 6;
      g.fillStyle = '#f2a9b4';
      ellipse(g, 200 + w, 120, cow ? 92 : 70, cow ? 56 : 48);
      g.fill();
      for (const side of ['L', 'R']) {
        const tp = teats[side];
        const pressNow = squirt[side] > 0.2;
        g.fillStyle = pressNow ? '#e5899a' : '#f0a0ae';
        rrect(g, tp.x - 14 + w, tp.y - 40, 28, pressNow ? 50 : 58, 13);
        g.fill();
        if (side === expect && !ctx.done) {
          g.save();
          g.globalAlpha = 0.4 + pulse * 0.6;
          g.strokeStyle = '#f2c84b';
          g.lineWidth = 6;
          rrect(g, tp.x - 22, tp.y - 48, 44, 74, 20);
          g.stroke();
          g.restore();
          emoji(g, side === 'L' ? '👇' : '👇', tp.x, tp.y - 70, 26 + pulse * 6);
        }
        if (squirt[side] > 0) {
          g.strokeStyle = 'rgba(255,255,255,0.95)';
          g.lineWidth = 6;
          g.beginPath();
          g.moveTo(tp.x, tp.y + 20);
          g.quadraticCurveTo(tp.x + (side === 'L' ? 20 : -20), 250, 200 + (side === 'L' ? -10 : 10), 280 - level * 50);
          g.stroke();
        }
      }
      // seau
      g.fillStyle = '#9aa7b1';
      g.beginPath();
      g.moveTo(130, 270);
      g.lineTo(270, 270);
      g.lineTo(255, 360);
      g.lineTo(145, 360);
      g.closePath();
      g.fill();
      g.save();
      g.beginPath();
      g.moveTo(134, 272);
      g.lineTo(266, 272);
      g.lineTo(252, 358);
      g.lineTo(148, 358);
      g.closePath();
      g.clip();
      g.fillStyle = '#7d8a94';
      g.fillRect(120, 260, 160, 110);
      g.fillStyle = '#fbfaf5';
      const yOf = (v) => 356 - v * 82;
      const ly = yOf(level);
      g.fillRect(120, ly, 160, 120);
      // Zone verte « juste ce qu'il faut » dans le seau, avec le trait au milieu
      g.fillStyle = 'rgba(63, 174, 98, 0.4)';
      g.fillRect(120, yOf(hi), 160, yOf(lo) - yOf(hi));
      g.strokeStyle = '#1e8a4a';
      g.lineWidth = 2;
      g.strokeRect(120, yOf(hi), 160, yOf(lo) - yOf(hi));
      g.setLineDash([6, 5]);
      g.strokeStyle = '#1e7a40';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(120, yOf(target));
      g.lineTo(280, yOf(target));
      g.stroke();
      g.setLineDash([]);
      g.restore();
      label(g, '✓', 114, yOf(target), 22, '#1e5c3e');
      emoji(g, '🎯', 288, yOf(target), 22);
      g.strokeStyle = '#5d6870';
      g.lineWidth = 5;
      ellipse(g, 200, 270, 70, 8);
      g.stroke();
      // métronome
      g.fillStyle = 'rgba(255,255,255,0.85)';
      circle(g, 44, 44, 26 + pulse * 6);
      g.fill();
      emoji(g, '🎵', 44, 46, 28 + pulse * 6);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      circle(g, 356, 44, 30);
      g.fill();
      emoji(g, face === 2 ? '😮‍💨' : face ? '😊' : ctx.sp.emoji, 356, 46, 36);
    },
  };
}
