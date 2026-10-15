// Mini-jeux des séances d'éducation canine (métier éducateur canin, src/sim/dogTrainer.js).
// Même API que les autres mini-jeux (src/ui/minigames.js) : make(ctx) → { update, draw, peek… }.
// Chaque jeu est un exercice de « bon moment » : agir quand il faut, récompenser quand c'est bien.
// peek() expose un petit état et des fonctions scriptables pour les tests automatiques.

import { drawAnimal, fitAnimal, sky, emoji, rrect, clamp, lerp, label } from './draw.js';
import { registerMinigame } from '../minigames.js';

const FLOOR = 300;
const PLAYER_X = 330;

/** Jauge horizontale avec une zone verte [a, b] (0 à 1) et un curseur. */
function gauge(g, x, y, w, v, zone = null, color = '#3fae62') {
  g.fillStyle = 'rgba(255,255,255,0.9)';
  rrect(g, x - 6, y - 10, w + 12, 20, 10);
  g.fill();
  g.fillStyle = '#e4ebe6';
  rrect(g, x, y - 5, w, 10, 5);
  g.fill();
  if (zone) {
    g.fillStyle = '#c9ecd4';
    rrect(g, x + w * zone[0], y - 5, w * (zone[1] - zone[0]), 10, 5);
    g.fill();
  }
  g.fillStyle = color;
  g.beginPath();
  g.arc(x + w * clamp(v), y, 8, 0, Math.PI * 2);
  g.fill();
}

/** Jauge « remplissage » (stress, calme…). */
function meter(g, x, y, w, v, color, text) {
  g.fillStyle = 'rgba(255,255,255,0.9)';
  rrect(g, x - 6, y - 12, w + 12, 24, 12);
  g.fill();
  g.fillStyle = '#e4ebe6';
  rrect(g, x, y - 6, w, 12, 6);
  g.fill();
  g.fillStyle = color;
  rrect(g, x, y - 6, Math.max(6, w * clamp(v)), 12, 6);
  g.fill();
  if (text) label(g, text, x + w / 2, y - 22, 14, '#23302a');
}

function scene(g, ctx) {
  sky(g, ctx.view, '#a9d8f2', '#e4f3fb', FLOOR, '#8cc268', '#6fa94f');
  // Une barrière au fond : on est dans la cour de la ferme.
  g.strokeStyle = '#a37a4a';
  g.lineWidth = 4;
  for (let x = ctx.view.x0; x < ctx.view.x1; x += 44) {
    g.beginPath();
    g.moveTo(x, FLOOR - 40);
    g.lineTo(x, FLOOR - 4);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(ctx.view.x0, FLOOR - 28);
  g.lineTo(ctx.view.x1, FLOOR - 28);
  g.stroke();
}

function player(g, x, back = false) {
  emoji(g, back ? '🧍' : '🧒', x, FLOOR - 40, 64);
}

function dogFit(a) {
  return fitAnimal(a, { cx: 200, groundY: FLOOR, maxW: 170, maxH: 130 });
}

/** Dessine le chien centré en cx (fit calculé une fois). */
function dog(g, a, fit, cx, { lift = 0, ...o } = {}) {
  drawAnimal(g, a, { x: fit.x + (cx - 200), y: FLOOR - lift, s: fit.s, f: 1, ...o });
}

// ---------------------------------------------------------------- rappel 📣

export function recallGame(ctx) {
  const { a, t, fx } = ctx;
  const fit = dogFit(a);
  const NEED = 4;
  let phase = 'wander';
  let dogX = 70;
  let dir = 1;
  let timer = 2;
  let success = 0;
  let miss = 0;
  let happy = 0;
  ctx.hint(t('dt_mg_recall_hint', { name: a.name }));

  const call = () => {
    if (ctx.done) return;
    if (phase === 'look') {
      phase = 'coming';
      fx.text(dogX, FLOOR - 120, t('mg_bravo'), '#2f8a5f');
      fx.float(dogX, FLOOR - 100, '💨', 24);
    } else if (phase === 'wander') {
      miss++;
      fx.float(dogX, FLOOR - 100, '🙉', 26);
      ctx.hint(t('dt_mg_recall_wait'), 'warn');
    }
  };
  const treat = () => {
    if (ctx.done) return;
    if (phase !== 'arrived') {
      miss++;
      ctx.hint(t('dt_mg_treat_later'), 'warn');
      return;
    }
    success++;
    happy = 1.5;
    fx.burst(PLAYER_X - 50, FLOOR - 60, '🍪', 5);
    ctx.progress(success / NEED);
    ctx.hint(t('dt_mg_recall_good', { name: a.name }), 'good');
    if (success >= NEED) ctx.finish(clamp(1 - miss * 0.12), t('dt_mg_recall_end', { name: a.name }));
    else {
      phase = 'wander';
      dogX = 60 + Math.random() * 60;
      timer = 1.5 + Math.random() * 2;
      treatBtn.disabled = true;
    }
  };
  const callBtn = ctx.button(`📣 ${t('dt_mg_btn_call')}`, { cls: 'primary', onTap: call });
  const treatBtn = ctx.button(`🍪 ${t('dt_mg_btn_treat')}`, { onTap: treat });
  treatBtn.disabled = true;

  return {
    peek: () => ({ win: () => ctx.finish(1), phase, success, miss, call, treat }),
    update(dt) {
      happy = Math.max(0, happy - dt);
      timer -= dt;
      if (phase === 'wander') {
        dogX += dir * 25 * dt;
        if (dogX < 50 || dogX > 180) dir *= -1;
        if (timer <= 0) { phase = 'look'; timer = 1.4; }
      } else if (phase === 'look') {
        if (timer <= 0) { phase = 'wander'; timer = 2 + Math.random() * 2.5; }
      } else if (phase === 'coming') {
        dogX += 170 * dt;
        if (dogX >= PLAYER_X - 60) { phase = 'arrived'; treatBtn.disabled = false; ctx.hint(t('dt_mg_recall_arrived', { name: a.name }), 'good'); }
      }
    },
    draw(g) {
      scene(g, ctx);
      player(g, PLAYER_X);
      const sitting = phase === 'arrived';
      dog(g, a, fit, dogX, { pose: sitting ? 'sit' : 'stand', happy: happy > 0 || sitting, wag: phase === 'coming' || happy > 0 });
      if (phase === 'look') emoji(g, '👀', dogX, FLOOR - 110 - Math.sin(ctx.time * 8) * 4, 30);
      if (phase === 'wander') emoji(g, '🐾', dogX + dir * 30, FLOOR - 70, 20);
      label(g, `${success} / ${NEED}`, 200, 30, 20);
    },
  };
}

// ---------------------------------------------------------------- jauge de moment : assis, troupeau, agility

const TIMING_THEMES = {
  dt_obey: { cmd: '✋', hold: '🤚', distract: '🐿️', reward: '🍪', pose: 'sit' },
  dt_herd: { cmd: '🐑', hold: '🛑', distract: '🐑', reward: '🍪', pose: 'stand' },
  dt_agility: { cmd: '🎯', hold: '🕳️', distract: '🦋', reward: '🍪', pose: 'stand' },
};

export function timingGame(ctx) {
  const { a, t, fx } = ctx;
  const theme = TIMING_THEMES[ctx.action] ?? TIMING_THEMES.dt_obey;
  const key = ctx.action.replace('dt_', '');
  const fit = dogFit(a);
  const ROUNDS = 3;
  const ZONE = [0.58, 0.84];
  let phase = 'sweep';
  let marker = 0;
  let mdir = 1;
  let rounds = 0;
  let miss = 0;
  let hold = 0;
  let holding = false;
  let distract = -1;
  let timing = 0;
  let celebrate = 0;
  ctx.hint(t(`dt_mg_${key}_hint`, { name: a.name }));

  const inZone = () => marker >= ZONE[0] && marker <= ZONE[1];
  const tap = () => {
    if (ctx.done || phase !== 'sweep') return;
    if (inZone()) {
      timing += 1 - Math.abs(marker - 0.71) / 0.13;
      phase = 'hold';
      hold = 0;
      distract = 0.8;
      fx.text(200, 120, t('mg_bravo'), '#2f8a5f');
      ctx.hint(t(`dt_mg_${key}_hold`, { name: a.name }), 'good');
      cmdBtn.disabled = true;
      holdBtn.disabled = false;
    } else {
      miss++;
      fx.float(200, FLOOR - 110, '❌', 26);
      ctx.hint(t('dt_mg_timing_miss'), 'warn');
    }
  };
  const holdStart = () => { if (phase === 'hold') holding = true; };
  const holdEnd = () => {
    if (!holding) return;
    holding = false;
    if (phase === 'hold' && hold < 2.5) {
      miss++;
      phase = 'sweep';
      fx.float(200, FLOOR - 110, '💨', 26);
      ctx.hint(t('dt_mg_timing_early'), 'warn');
      cmdBtn.disabled = false;
      holdBtn.disabled = true;
    }
  };
  const cmdBtn = ctx.button(`${theme.cmd} ${t(`dt_mg_${key}_cmd`)}`, { cls: 'primary', onTap: tap });
  const holdBtn = ctx.button(`${theme.hold} ${t(`dt_mg_${key}_holdBtn`)}`, { hold: true, onDown: holdStart, onUp: holdEnd });
  holdBtn.disabled = true;

  return {
    peek: () => ({ win: () => ctx.finish(1), phase, marker, inZone: inZone(), rounds, miss, tap, holdStart, holdEnd }),
    update(dt) {
      celebrate = Math.max(0, celebrate - dt);
      if (phase === 'sweep') {
        marker += mdir * dt * 0.7;
        if (marker > 1) { marker = 1; mdir = -1; }
        if (marker < 0) { marker = 0; mdir = 1; }
      } else if (phase === 'hold') {
        distract -= dt;
        if (holding) hold += dt;
        if (hold >= 2.5) {
          rounds++;
          celebrate = 1.2;
          fx.burst(200, FLOOR - 80, theme.reward, 5);
          ctx.progress(rounds / ROUNDS);
          holdBtn.disabled = true;
          holding = false;
          if (rounds >= ROUNDS) ctx.finish(clamp(1 - miss * 0.1 - (1 - timing / ROUNDS) * 0.25), t(`dt_mg_${key}_end`, { name: a.name }));
          else {
            phase = 'sweep';
            marker = 0;
            mdir = 1;
            cmdBtn.disabled = false;
            ctx.hint(t(`dt_mg_${key}_hint`, { name: a.name }));
          }
        }
      }
    },
    draw(g) {
      scene(g, ctx);
      player(g, PLAYER_X);
      const sitting = phase === 'hold' || celebrate > 0;
      dog(g, a, fit, 190, { pose: sitting ? theme.pose : 'stand', happy: celebrate > 0, wag: celebrate > 0 || holding, earsBack: phase === 'hold' && distract > -1.5 && distract < 0 });
      if (phase === 'sweep') {
        gauge(g, 70, 50, 260, marker, ZONE, inZone() ? '#3fae62' : '#e0574a');
        label(g, t('dt_mg_timing_zone'), 200, 78, 14);
        emoji(g, '👀', 190, FLOOR - 120, 24);
      } else if (phase === 'hold') {
        meter(g, 70, 50, 260, hold / 2.5, '#3fae62', t('dt_mg_timing_holdMeter'));
        // Distraction : passe devant le chien, il ne doit pas bouger.
        if (distract < 0 && distract > -2.2) emoji(g, theme.distract, 60 + (-distract / 2.2) * 280, FLOOR - 20, 30);
      }
      label(g, `${rounds} / ${ROUNDS}`, 360, 30, 20);
    },
  };
}

// ---------------------------------------------------------------- ne saute pas 🙅

export function jumpGame(ctx) {
  const { a, t, fx } = ctx;
  const fit = dogFit(a);
  const NEED = 4;
  let jump = -1; // > 0 : en train de sauter (0 → 1)
  let timer = 2;
  let calm = 0; // temps avec les 4 pattes au sol
  let back = 0; // le joueur s'est tourné
  let success = 0;
  let miss = 0;
  let celebrate = 0;
  ctx.hint(t('dt_mg_jump_hint', { name: a.name }));

  const turn = () => {
    if (ctx.done) return;
    if (jump >= 0) {
      jump = -1;
      back = 1;
      calm = 0;
      fx.text(240, 150, t('mg_bravo'), '#2f8a5f');
      ctx.hint(t('dt_mg_jump_wait', { name: a.name }), 'good');
    } else {
      back = 0.6;
    }
  };
  const treat = () => {
    if (ctx.done) return;
    if (jump >= 0 || calm < 1.5) {
      miss++;
      if (jump >= 0) jump = -1;
      fx.float(240, FLOOR - 120, '❌', 26);
      ctx.hint(t('dt_mg_jump_bad'), 'warn');
      treatBtn.disabled = true;
      calm = 0;
      return;
    }
    success++;
    celebrate = 1.2;
    calm = 0;
    treatBtn.disabled = true;
    fx.burst(250, FLOOR - 80, '🍪', 5);
    ctx.progress(success / NEED);
    ctx.hint(t('dt_mg_jump_good', { name: a.name }), 'good');
    if (success >= NEED) ctx.finish(clamp(1 - miss * 0.12), t('dt_mg_jump_end', { name: a.name }));
    else timer = 1.5 + Math.random() * 2;
  };
  ctx.button(`🙅 ${t('dt_mg_btn_turn')}`, { cls: 'primary', onTap: turn });
  const treatBtn = ctx.button(`🍪 ${t('dt_mg_btn_treat')}`, { onTap: treat });
  treatBtn.disabled = true;

  return {
    peek: () => ({ win: () => ctx.finish(1), jumping: jump >= 0, calm, success, miss, turn, treat }),
    update(dt) {
      celebrate = Math.max(0, celebrate - dt);
      back = Math.max(0, back - dt);
      if (jump >= 0) {
        jump += dt / 1.3;
        if (jump >= 1) { // il a sauté sans qu'on réagisse : à refaire
          jump = -1;
          miss++;
          timer = 1 + Math.random() * 1.5;
          fx.float(PLAYER_X, FLOOR - 120, '😵', 26);
          ctx.hint(t('dt_mg_jump_missed'), 'warn');
        }
      } else if (!ctx.done) {
        timer -= dt;
        calm += dt;
        if (calm >= 1.5 && treatBtn.disabled && celebrate <= 0) { treatBtn.disabled = false; ctx.hint(t('dt_mg_jump_now'), 'good'); }
        if (timer <= 0 && celebrate <= 0) { jump = 0; calm = 0; treatBtn.disabled = true; ctx.hint(t('dt_mg_jump_turnNow'), 'warn'); }
      }
    },
    draw(g) {
      scene(g, ctx);
      player(g, PLAYER_X, back > 0);
      const lift = jump >= 0 ? Math.sin(jump * Math.PI) * 70 : 0;
      dog(g, a, fit, 250, { lift, pose: jump >= 0 ? 'beg' : celebrate > 0 ? 'sit' : 'stand', happy: celebrate > 0, wag: celebrate > 0 });
      if (jump >= 0) emoji(g, '❗', 250, FLOOR - 140 - lift, 32);
      if (jump < 0) meter(g, 70, 50, 200, calm / 1.5, '#3fae62', t('dt_mg_jump_meter'));
      label(g, `${success} / ${NEED}`, 360, 30, 20);
    },
  };
}

// ---------------------------------------------------------------- aboiements 🤫

const TRIGGERS = ['🚲', '📦', '🐈', '🛵', '🐦'];

export function barkGame(ctx) {
  const { a, t, fx } = ctx;
  const fit = dogFit(a);
  const NEED = 4;
  let trig = null; // { emoji, x }
  let timer = 1.5;
  let bark = 0; // durée d'aboiement
  let calm = 0;
  let holding = false;
  let success = 0;
  let miss = 0;
  let celebrate = 0;
  ctx.hint(t('dt_mg_bark_hint', { name: a.name }));

  const hushStart = () => { holding = true; };
  const hushEnd = () => { holding = false; };
  const treat = () => {
    if (ctx.done) return;
    if (bark > 0 || calm < 1) {
      miss++;
      fx.float(200, FLOOR - 120, '❌', 26);
      ctx.hint(t('dt_mg_treat_later'), 'warn');
      return;
    }
    success++;
    celebrate = 1.2;
    calm = 0;
    treatBtn.disabled = true;
    fx.burst(200, FLOOR - 80, '🍪', 5);
    ctx.progress(success / NEED);
    ctx.hint(t('dt_mg_bark_good', { name: a.name }), 'good');
    if (success >= NEED) ctx.finish(clamp(1 - miss * 0.12), t('dt_mg_bark_end', { name: a.name }));
    else timer = 1.5 + Math.random() * 2;
  };
  ctx.button(`🤫 ${t('dt_mg_btn_hush')}`, { cls: 'primary', hold: true, onDown: hushStart, onUp: hushEnd });
  const treatBtn = ctx.button(`🍪 ${t('dt_mg_btn_treat')}`, { onTap: treat });
  treatBtn.disabled = true;

  return {
    peek: () => ({ win: () => ctx.finish(1), barking: bark > 0, calm, success, miss, hushStart, hushEnd, treat }),
    update(dt) {
      celebrate = Math.max(0, celebrate - dt);
      if (trig) {
        trig.x += 90 * dt;
        if (trig.x > 160 && bark <= 0 && calm <= 0 && !trig.seen) { trig.seen = true; bark = 0.01; calm = 0; ctx.hint(t('dt_mg_bark_now'), 'warn'); }
        if (trig.x > 460) trig = null;
      } else if (bark <= 0 && celebrate <= 0 && !ctx.done) {
        timer -= dt;
        if (timer <= 0) { trig = { emoji: TRIGGERS[Math.floor(Math.random() * TRIGGERS.length)], x: -40, seen: false }; }
      }
      if (bark > 0) {
        bark += dt;
        if (holding) calm += dt / 2;
        else calm = Math.max(0, calm - dt * 0.5);
        if (calm >= 1) { bark = 0; calm = 1; treatBtn.disabled = false; ctx.hint(t('dt_mg_bark_calm', { name: a.name }), 'good'); }
        else if (bark > 5) { bark = 0; calm = 0; miss++; fx.float(60, 80, '😠', 30); ctx.hint(t('dt_mg_bark_tooLong'), 'warn'); timer = 1.5; }
      }
    },
    draw(g) {
      scene(g, ctx);
      player(g, PLAYER_X);
      dog(g, a, fit, 200, { pose: celebrate > 0 ? 'sit' : 'stand', happy: celebrate > 0, wag: celebrate > 0, shake: bark > 0 ? 0.5 : 0 });
      if (trig) emoji(g, trig.emoji, trig.x, FLOOR - 50, 34);
      if (bark > 0) {
        const k = 0.5 + Math.sin(ctx.time * 12) * 0.5;
        g.fillStyle = '#fff';
        rrect(g, 230, FLOOR - 150, 86, 34, 12);
        g.fill();
        label(g, 'WAF !', 273, FLOOR - 133, 18 + k * 4, '#c0392b');
        meter(g, 70, 50, 200, calm, '#5b8def', t('dt_mg_bark_meter'));
      }
      label(g, `${success} / ${NEED}`, 360, 30, 20);
    },
  };
}

// ---------------------------------------------------------------- peur 🫣

export function shyGame(ctx) {
  const { a, t, fx } = ctx;
  const fit = dogFit(a);
  const NEED = 3;
  let px = 40;
  let dogX = 330;
  let stress = 20;
  let approaching = false;
  let success = 0;
  let miss = 0;
  let flinch = 0;
  let celebrate = 0;
  ctx.hint(t('dt_mg_shy_hint', { name: a.name }));

  const near = () => dogX - px < 120;
  const goStart = () => { approaching = true; };
  const goEnd = () => { approaching = false; };
  const treat = () => {
    if (ctx.done) return;
    if (!near() || stress > 55) {
      miss++;
      stress = Math.min(100, stress + 10);
      fx.float(dogX, FLOOR - 120, '❌', 26);
      ctx.hint(t(near() ? 'dt_mg_shy_tooStressed' : 'dt_mg_shy_tooFar'), 'warn');
      return;
    }
    success++;
    celebrate = 1.2;
    stress = Math.max(0, stress - 30);
    fx.burst(dogX - 30, FLOOR - 80, '🍪', 5);
    ctx.progress(success / NEED);
    ctx.hint(t('dt_mg_shy_good', { name: a.name }), 'good');
    if (success >= NEED) ctx.finish(clamp(1 - miss * 0.12), t('dt_mg_shy_end', { name: a.name }));
    else { px = Math.max(40, px - 110); dogX = Math.max(230, dogX - 25); }
  };
  ctx.button(`🚶 ${t('dt_mg_btn_approach')}`, { cls: 'primary', hold: true, onDown: goStart, onUp: goEnd });
  const treatBtn = ctx.button(`🍪 ${t('dt_mg_btn_treat')}`, { onTap: treat });

  return {
    peek: () => ({ win: () => ctx.finish(1), stress, dist: dogX - px, near: near(), success, miss, goStart, goEnd, treat }),
    update(dt) {
      celebrate = Math.max(0, celebrate - dt);
      flinch = Math.max(0, flinch - dt);
      if (approaching && !ctx.done) {
        px = Math.min(dogX - 60, px + 55 * dt);
        stress += dt * (near() ? 42 : 22);
      } else {
        stress -= dt * 18;
      }
      stress = clamp(stress, 0, 100);
      if (stress >= 100) {
        miss++;
        flinch = 0.8;
        stress = 55;
        px = Math.max(40, px - 90);
        fx.float(dogX, FLOOR - 120, '😨', 30);
        ctx.hint(t('dt_mg_shy_tooFast', { name: a.name }), 'warn');
      }
      treatBtn.disabled = !near() || stress > 55;
    },
    draw(g) {
      scene(g, ctx);
      player(g, px);
      dog(g, a, fit, dogX, { f: -1, pose: celebrate > 0 ? 'sit' : 'stand', happy: celebrate > 0, wag: celebrate > 0, earsBack: stress > 50, shake: flinch > 0 ? 0.6 : 0 });
      meter(g, 70, 50, 260, stress / 100, stress > 55 ? '#e0574a' : stress > 30 ? '#e8a33d' : '#3fae62', t('dt_mg_shy_meter'));
      if (near() && stress <= 55) emoji(g, '💛', dogX, FLOOR - 120 - Math.sin(ctx.time * 6) * 4, 26);
      label(g, `${success} / ${NEED}`, 360, 30, 20);
    },
  };
}

// ---------------------------------------------------------------- enregistrement

registerMinigame('dt_recall', recallGame, '📣');
registerMinigame('dt_obey', timingGame, '✋');
registerMinigame('dt_herd', timingGame, '🐑');
registerMinigame('dt_agility', timingGame, '🎯');
registerMinigame('dt_jump', jumpGame, '🙅');
registerMinigame('dt_bark', barkGame, '🤫');
registerMinigame('dt_shy', shyGame, '🫣');

export const DOG_TRAINING_GAMES = ['dt_recall', 'dt_obey', 'dt_herd', 'dt_agility', 'dt_jump', 'dt_bark', 'dt_shy'];
