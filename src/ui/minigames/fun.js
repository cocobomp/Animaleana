// Mini-jeux « câlins et jeux » : caresser, jouer (balle ou plumeau), traire.

import { drawAnimal, animalShape, fitAnimal, hitAnimal, rrect, ellipse, circle, emoji, label, fillView, sky, clamp, lerp, dist, shade } from './draw.js';
import { homeBackground, sizeFor, isBig } from './food.js';

// ---------------------------------------------------------------- caresser

const FAVORITE = { dog: 'chest', cat: 'cheek', rabbit: 'headTop', horse: 'neck', cow: 'neck', sheep: 'cheek', goat: 'neck' };
const SPEED_LIMIT = { shy: 300, calm: 380, cuddly: 430, playful: 520, curious: 460, stubborn: 400 };

export function petGame(ctx) {
  const { a, t, fx } = ctx;
  const floorY = 305;
  const fit = fitAnimal(a, { groundY: floorY, maxW: 330, maxH: 240 });
  const sh = animalShape(a, { x: fit.x, y: floorY, s: fit.s, f: 1 });
  const fav = sh[FAVORITE[a.species] ?? 'back'];
  const favR = 46;
  const limit = SPEED_LIMIT[a.personality] ?? 420;
  const shy = a.personality === 'shy';
  let prog = 0;
  let speed = 0;
  let last = null;
  let lastT = 0;
  let heartAcc = 0;
  let favDist = 0;
  let total = 0;
  let fast = 0;
  let flinch = 0;
  let cool = 0;
  let calmStroke = 0;
  let purr = 0;

  ctx.hint(t(shy ? 'mg_pet_hint_shy' : 'mg_pet_hint', { name: a.name }));

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
        ctx.hint(t('mg_gentle', { name: a.name }), 'warn');
      }
      return;
    }
    const atFav = dist(p.x, p.y, fav.x, fav.y) < favR;
    prog += d * 0.0011 * (atFav ? 2.3 : 1);
    total += d;
    if (atFav) favDist += d;
    calmStroke += d;
    heartAcc += d;
    if (heartAcc > 48) {
      heartAcc = 0;
      fx.float(p.x, p.y - 12, atFav ? '💖' : '❤️', atFav ? 26 : 20);
    }
    if (atFav && Math.random() < 0.04) fx.text(sh.head.x, sh.head.y - sh.hr * 2, t(a.species === 'cat' ? 'mg_purr' : 'mg_loves'), '#d6457a', 18);
    if (atFav) purr = 0.6;
    if (calmStroke > 180) ctx.hint(t(atFav ? 'mg_pet_fav' : 'mg_pet_good', { name: a.name }), 'good');
    ctx.progress(prog);
    if (prog >= 1 && !ctx.done) {
      const share = favDist / Math.max(1, total);
      ctx.finish(0.6 + 0.4 * clamp(share / 0.3) - 0.08 * fast);
      fx.burst(sh.head.x, sh.head.y - 20, '💕', 6);
    }
  }

  return {
    peek: () => ({ fav, prog }),
    down(p) { last = p; lastT = ctx.time; },
    move(p, down) { if (down) stroke(p); },
    up() { last = null; speed *= 0.5; },
    update(dt) {
      flinch = Math.max(0, flinch - dt);
      cool = Math.max(0, cool - dt);
      purr = Math.max(0, purr - dt);
      if (!ctx.pointer.down) speed = Math.max(0, speed - dt * 600);
    },
    draw(g) {
      if (isBig(a)) sky(g, ctx.view, '#a9d8f2', '#e4f3fb', floorY, '#8cc268', '#6fa94f');
      else homeBackground(g, ctx, floorY);
      drawAnimal(g, a, { x: fit.x, y: floorY, s: fit.s, f: 1, happy: (ctx.pointer.down && flinch <= 0 && speed > 20) || ctx.done, earsBack: flinch > 0, shake: flinch > 0 ? 0.6 : 0, wag: purr > 0 || ctx.done });
      // Endroit préféré : il scintille si on ne l'a pas encore trouvé
      if (!ctx.done && ctx.time > 3.5 && favDist < 60) {
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
      const pp = ctx.pointer;
      if (pp.over || pp.down) emoji(g, '🤚', pp.x + 4, pp.y - 6, 36, -0.3);
    },
  };
}

// ---------------------------------------------------------------- jouer

export function playGame(ctx) {
  return ctx.a.species === 'cat' ? featherGame(ctx) : ballGame(ctx);
}

function ballGame(ctx) {
  const { a, t, fx } = ctx;
  const horizon = 150;
  const base = sizeFor(a, 0.75);
  const run = { dog: 240, goat: 210, rabbit: 200 }[a.species] ?? 220;
  const ROUNDS = 4;
  const scaleAt = (y) => base * lerp(0.55, 1, clamp((y - horizon) / 150));
  const pet = { x: 200, y: 230, f: 1, walk: 0, state: 'wander', tx: 120, ty: 210, lift: 0, has: false };
  let ball = { state: 'hand', x: 200, y: 330, k: 0 };
  let rounds = 0;
  const scores = [];
  let lastScore = 0;
  let wanderT = 0;
  let react = 0;

  ctx.hint(t('mg_ball_hint', { name: a.name }));

  function throwAt(p) {
    if (ctx.done || ball.state !== 'hand' || p.y < horizon + 5 || p.y > 315) return;
    ball = { state: 'fly', sx: 200, sy: 325, tx: p.x, ty: p.y, k: 0, x: 200, y: 325, h: 0 };
    react = 0.15;
    pet.state = 'chase';
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
    peek: () => ({ x: pet.x, y: pet.y, ball: ball.state, rounds }),
    down(p) { throwAt(p); },
    key(code, down) {
      if (down && (code === 'Space' || code === 'Enter')) throwAt({ x: pet.x + pet.f * 40, y: pet.y });
    },
    update(dt) {
      pet.lift = Math.max(0, pet.lift - dt * 80);
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
            lastScore = 1;
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
        const reached = arrive(target.x, target.y, run, dt);
        if (reached && ball.state === 'ground') {
          ball.state = 'mouth';
          pet.has = true;
          lastScore = 0.55;
          fx.text(pet.x, pet.y - 80, t('mg_gotIt'), '#3c7bd9', 22);
          pet.state = 'back';
        }
      } else if (pet.state === 'back') {
        if (arrive(200, 290, run * 0.8, dt)) {
          pet.has = false;
          ball = { state: 'hand', x: 200, y: 330, k: 0 };
          scores.push(lastScore);
          rounds++;
          ctx.progress(rounds / ROUNDS);
          fx.float(200, 220, '💛', 26);
          if (rounds >= ROUNDS) {
            ctx.finish(0.5 + 0.5 * (scores.reduce((s, x) => s + x, 0) / scores.length));
            pet.state = 'happy';
          } else {
            pet.state = 'wander';
            wanderT = 0;
            ctx.hint(t(rounds === 1 ? 'mg_ball_again' : 'mg_ball_hint', { name: a.name }));
          }
        }
      } else if (pet.state === 'wander') {
        wanderT -= dt;
        if (wanderT <= 0 || arrive(pet.tx, pet.ty, 0, 0)) {
          pet.tx = 50 + ctx.rng() * 300;
          pet.ty = horizon + 40 + ctx.rng() * 110;
          wanderT = 1.5 + ctx.rng() * 1.5;
        }
        arrive(pet.tx, pet.ty, 70, dt);
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
      const moving = pet.state !== 'wander' || dist(pet.x, pet.y, pet.tx, pet.ty) > 5;
      const sh = drawAnimal(g, a, { x: pet.x, y: pet.y, s, f: pet.f, walk: moving && react <= 0 ? pet.walk : null, lift: pet.lift, wag: true, happy: pet.has || ctx.done });
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
      label(g, `${rounds} / ${ROUNDS}`, 360, 30, 20);
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
  const floorY = 300;
  const s = sizeFor(a, 0.8);
  const NEED = 5;
  const cat = { x: 120, f: 1, walk: 0, jump: null, cool: 1, bored: 0, crouch: 0 };
  let feather = { x: 280, y: 160 };
  let fspeed = 0;
  let prev = { ...feather };
  let catches = 0;
  let held = 0;

  ctx.hint(t('mg_feather_hint', { name: a.name }));

  const catShape = (lift = 0) => animalShape(a, { x: cat.x, y: floorY, s, f: cat.f, lift });

  return {
    peek: () => ({ x: cat.x, catches }),
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
      if (held > 0) {
        held -= dt;
        if (held <= 0) feather = { x: cat.x + cat.f * -140 < 30 ? 330 : cat.x - cat.f * 140, y: 120 };
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
            fx.text(cat.x, 60, t('mg_caught'), '#2f8a5f', 26);
            fx.burst(feather.x, feather.y, '💛', 5);
            ctx.progress(catches / NEED);
            if (catches >= NEED) {
              const time = ctx.time;
              ctx.finish(time <= 22 ? 1 : Math.max(0.6, 1 - (time - 22) / 40));
            }
          } else fx.text(cat.x, 80, t('mg_missed'), '#c07a10', 20);
        }
        if (j.k >= 1) { cat.jump = null; cat.cool = 0.5; }
        return;
      }
      if (fspeed < 30) cat.bored += dt;
      else cat.bored = Math.max(0, cat.bored - dt * 3);
      if (cat.bored > 1.4) {
        ctx.hint(t('mg_feather_move'), 'warn');
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
        ctx.hint(t('mg_feather_hint', { name: a.name }));
      } else if (Math.abs(dx) > 70) {
        const st = Math.min(Math.abs(dx) - 60, 170 * dt);
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
      const sh = drawAnimal(g, a, { x: cat.x, y: floorY, s, f: cat.f, lift, pose: bored ? 'sit' : 'stand', walk: !cat.jump && !bored && cat.crouch < 1 ? cat.walk : null, happy: held > 0 || ctx.done, headDip: cat.crouch * 0.15, wag: cat.crouch > 0.5 });
      if (bored) emoji(g, '💤', sh.head.x + 20, sh.head.y - 40, 22);
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
      label(g, `${catches} / ${NEED}`, 40, 30, 20);
    },
  };
}

// ---------------------------------------------------------------- traire

export function milkGame(ctx) {
  const { a, t, fx } = ctx;
  const cow = a.species === 'cow';
  const P = cow ? 0.62 : 0.56;
  const teats = { L: { x: 160, y: 200 }, R: { x: 240, y: 200 } };
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

  ctx.hint(t('mg_milk_hint'));
  ctx.button(`👈 ${t('mg_left')}`, { cls: 'mg-half', onTap: () => press('L') });
  ctx.button(`${t('mg_right')} 👉`, { cls: 'mg-half', onTap: () => press('R') });

  function press(side) {
    if (ctx.done) return;
    const tm = ctx.time;
    if (side !== expect) {
      mistakes++;
      wiggle = 0.4;
      streak = 0;
      fx.text(teats[side].x, teats[side].y - 70, t('mg_alternate'), '#c07a10', 22);
      ctx.hint(t('mg_milk_alt'), 'warn');
      return;
    }
    const ph = (tm % P) / P;
    const err = Math.min(ph, 1 - ph) * P;
    const good = err < 0.16 && tm - lastHit > 0.22;
    lastHit = tm;
    hits++;
    if (good) { onBeat++; streak++; } else streak = 0;
    level = Math.min(1, level + (good ? 0.07 : 0.045));
    squirt[side] = 0.35;
    expect = side === 'L' ? 'R' : 'L';
    if (streak > 0 && streak % 5 === 0) fx.text(200, 80, t('mg_rhythm'), '#2f8a5f', 24);
    if (good) ctx.hint(t('mg_milk_good'), 'good');
    ctx.progress(level);
    if (level >= 1) {
      face = 1;
      ctx.finish(0.45 + 0.55 * (onBeat / Math.max(1, hits)) - 0.03 * mistakes);
    }
  }

  return {
    peek: () => ({ expect, phase: (ctx.time % P) / P, P, level }),
    down(p) { press(p.x < 200 ? 'L' : 'R'); },
    key(code, down) {
      if (!down) return;
      if (code === 'ArrowLeft' || code === 'KeyA' || code === 'KeyQ') press('L');
      if (code === 'ArrowRight' || code === 'KeyD') press('R');
      if (code === 'Space' || code === 'Enter') press(expect);
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
      const ly = 356 - level * 82;
      g.fillRect(120, ly, 160, 120);
      g.restore();
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
      emoji(g, face ? '😊' : ctx.sp.emoji, 356, 46, 36);
    },
  };
}
