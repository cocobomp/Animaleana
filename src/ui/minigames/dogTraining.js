// Mini-jeux des séances d'éducation canine (métier éducateur canin, src/sim/dogTrainer.js).
// Même API que les autres mini-jeux (src/ui/minigames.js) : make(ctx) → { update, draw, peek… }.
// Chaque jeu est un exercice de « bon moment » : agir quand il faut, récompenser quand c'est bien.
// peek() expose un petit état et des fonctions scriptables pour les tests automatiques.

import { drawAnimal, fitAnimal, sky, emoji, rrect, clamp, label, TEXT_FONT } from './draw.js';
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

// ---------------------------------------------------------------- les ordres ✋ : assis, couché, pas bouger, au pied, rappel

/** Les ordres de base, leur geste et la pose du chien quand il obéit. */
export const COMMANDS = {
  sit: { emoji: '✋', pose: 'sit' },
  down: { emoji: '👇', pose: 'down' },
  stay: { emoji: '🛑', pose: 'sit' },
  heel: { emoji: '🦵', pose: 'stand' },
  recall: { emoji: '📣', pose: 'sit' },
};

/**
 * Les ordres d'une séance selon l'espèce (un chat ne se couche pas sur commande, un cheval ne s'assoit pas).
 * action 'dt_pull' (tire en laisse, sans la promenade en 3D) : surtout « au pied ».
 */
export function commandsFor(species, action = 'dt_obey') {
  if (action === 'dt_pull') return ['heel', 'sit', 'heel'];
  if (species === 'dog') return ['sit', 'down', 'stay', 'heel', 'recall'];
  if (species === 'horse') return ['stay', 'heel', 'recall'];
  return ['sit', 'stay', 'recall'];
}

export const REWARD_WINDOW = 1.6; // secondes pour récompenser au bon moment
const HEEL_ZONE = 16; // « au pied » : le chien à moins de 16 px de sa place, à côté de toi
const HEEL_BACK = 70; // sa place : l'épaule à ta jambe (70 px devant toi, il marche vers la gauche)
const DOG_X = 200; // le chien face à toi (assis, couché)
const STAY_X = 170; // « pas bouger » : il attend là pendant que tu recules

/**
 * Note d'une séance d'ordres : la moyenne des récompenses (1 = donnée vite, 0,75 = un peu tard
 * mais encore dans le cercle vert), moins 0,1 par erreur (ordre de travers, friandise trop tôt ou
 * trop tard). Toujours entre 0,4 et 1.
 */
export function commandsQuality(timings, misses) {
  const avg = timings.length ? timings.reduce((s, v) => s + v, 0) / timings.length : 0.4;
  return clamp(avg - misses * 0.1, 0.4, 1);
}

/**
 * Séance « Les ordres » : une bulle dit quel ordre donner ; on touche le bon bouton ; dès que le
 * chien obéit (cercle vert), on donne vite la friandise 🍪. Trop tôt ou trop tard : ça ne compte pas.
 * Un chien qui a encore beaucoup de mal (problème élevé, peu d'obéissance) n'obéit pas toujours
 * du premier coup : on redonne l'ordre, sans récompenser.
 */
export function commandsGame(ctx) {
  const { a, t, fx, rng } = ctx;
  const fit = dogFit(a);
  const list = commandsFor(a.species, ctx.action);
  const total = list.length;
  // Difficulté : le niveau du problème (chien client), ou ce qu'il reste à apprendre (animal à soi).
  const level = a.client?.problems?.obey ?? Math.max(0, 100 - (a.skills?.obedience ?? 30));
  const distractChance = clamp(level / 100) * 0.45;
  const sitPose = a.species === 'horse' ? 'stand' : 'sit'; // un cheval « attend » debout
  const tg = (key, params = {}) => t(key, { name: a.name, g: a.sex, ...params });
  const cmdName = (id) => t(`dt_cmd_${id}`);
  const cmdLabel = (id) => `${COMMANDS[id].emoji} ${cmdName(id)}`;

  let round = 0;
  // Phases : ask (on attend l'ordre) → react | ignore | hold | walk | come → window (cercle vert)
  // → yay (bravo), ou broke (il a bougé) → ask.
  let phase = 'ask';
  let timer = 0; // temps passé dans la phase
  let wanted = list[0];
  let attempts = 0; // ordres donnés dans ce tour
  let misses = 0;
  const timings = [];
  let pose = 'stand';
  let dogX = DOG_X;
  let dogTarget = DOG_X;
  let playerX = PLAYER_X;
  let wrongFlash = 0;
  let distractor = null; // { emoji, x, y, speed, breaks } : écureuil, ballon qui passe
  let sniffing = true; // rappel : le chien renifle (true) ou te regarde (false)
  let sniffTimer = 2;
  let heelPhase = 0;
  let heelAmp = 40;
  let yay = 0;

  const glow = (b, on) => b?.classList.toggle('glow', !!on);
  const cmdBtns = {};
  const buttons = [...new Set(list)]; // un bouton par ordre (« au pied » revient deux fois pour le chien qui tire)
  for (const id of buttons) cmdBtns[id] = ctx.button(cmdLabel(id), { cls: 'dt-cmd', onTap: () => command(id) });
  const treatBtn = ctx.button(`🍪 ${t('dt_mg_btn_treat')}`, { cls: 'dt-treat', onTap: () => treat() });

  /** Au pied : où est le chien par rapport à sa place (0 = parfait, négatif = devant toi). */
  const heelOffset = () => {
    const s = Math.sin(heelPhase);
    return -heelAmp * Math.sign(s) * Math.max(0, Math.abs(s) - 0.5) * 2;
  };
  const heelOk = () => phase === 'walk' && Math.abs(heelOffset()) < HEEL_ZONE;
  const rewardNow = () => phase === 'window' || heelOk();

  function setPhase(p) {
    phase = p;
    timer = 0;
    for (const b of Object.values(cmdBtns)) glow(b, false);
  }

  /** Début d'un tour : le chien et toi vous placez pour l'ordre demandé. */
  function startRound() {
    wanted = list[round];
    attempts = 0;
    distractor = null;
    playerX = PLAYER_X;
    pose = 'stand';
    dogTarget = DOG_X;
    if (wanted === 'stay') {
      dogTarget = STAY_X;
      playerX = 290;
      pose = sitPose;
    } else if (wanted === 'heel') {
      dogTarget = PLAYER_X - HEEL_BACK;
    } else if (wanted === 'recall') {
      dogTarget = 80;
      sniffing = true;
      sniffTimer = 1.5 + rng() * 1.5;
    }
    setPhase('ask');
    ctx.hint(tg(`dt_mg_ask_${wanted}`));
  }

  function command(id) {
    if (ctx.done || phase !== 'ask') return; // le chien est déjà en train d'obéir : rien ne se passe
    if (id !== wanted) {
      misses++;
      wrongFlash = 1.2;
      ctx.hint(t('dt_mg_wrongCmd', { cmd: cmdLabel(wanted) }), 'warn');
      return;
    }
    attempts++;
    // Un chien qui a encore du mal n'obéit pas toujours du premier coup (jamais deux fois de suite).
    const ignores = attempts === 1 && rng() < distractChance;
    if (wanted === 'sit' || wanted === 'down') {
      if (ignores) {
        setPhase('ignore');
        ctx.hint(tg('dt_mg_distracted'));
      } else setPhase('react');
    } else if (wanted === 'stay') {
      // Tu recules, puis un écureuil (ou un ballon) passe : le chien doit rester en place.
      setPhase('hold');
      distractor = { emoji: rng() < 0.5 ? '🐿️' : '⚽', x: -30, y: FLOOR - 18, speed: 150, breaks: ignores };
      ctx.hint(tg('dt_mg_stay_hold'));
    } else if (wanted === 'heel') {
      setPhase('walk');
      heelPhase = Math.PI / 2; // il commence un peu en avant
      heelAmp = ignores ? 60 : 40;
      ctx.hint(tg('dt_mg_heel_walk'));
    } else if (wanted === 'recall') {
      if (sniffing) {
        // Il renifle : il n'entend pas. Il faut attendre qu'il te regarde 👀.
        misses++;
        attempts = 0;
        fx.float(dogX, FLOOR - 110, '🙉', 26);
        ctx.hint(tg('dt_mg_recall_wait'), 'warn');
        return;
      }
      setPhase('come');
      fx.float(dogX, FLOOR - 100, '💨', 24);
    }
  }

  /** La friandise : seulement quand le chien vient d'obéir (cercle vert). */
  function treat() {
    if (ctx.done || phase === 'yay') return;
    if (rewardNow()) {
      const fast = phase === 'walk' || timer <= REWARD_WINDOW * 0.6;
      timings.push(fast ? 1 : 0.75);
      yay = 1.1;
      fx.burst(dogX, FLOOR - 70, '🍪', 5);
      fx.float(dogX, FLOOR - 120, '❤️', 26);
      fx.text(200, 110, t(fast ? 'mg_bravo' : 'dt_mg_justInTime'), '#2f8a5f');
      round++;
      ctx.progress(round / total);
      setPhase('yay');
      if (round >= total) ctx.finish(commandsQuality(timings, misses), tg(ctx.action === 'dt_pull' ? 'dt_mg_pull_end' : 'dt_mg_obey_end'));
      else ctx.hint(tg('dt_mg_good'), 'good');
      return;
    }
    misses++;
    fx.float(dogX, FLOOR - 120, '❌', 26);
    if (phase === 'walk') ctx.hint(tg('dt_mg_heel_notNow'), 'warn');
    else if (phase === 'hold') {
      // Trop tôt : il se lève pour attraper la friandise. On recommence le « pas bouger ».
      pose = 'stand';
      distractor = null;
      setPhase('broke');
      ctx.hint(tg('dt_mg_stay_early'), 'warn');
    } else ctx.hint(tg('dt_mg_tooEarly'), 'warn');
  }

  startRound();

  return {
    peek: () => ({ win: () => ctx.finish(1), phase, wanted, round, total, misses, sniffing, heelOk: heelOk(), command, treat }),
    key(code, pressed) {
      if (!pressed) return;
      const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(code);
      if (i >= 0 && buttons[i]) command(buttons[i]);
      if (code === 'Space' || code === 'Enter') treat();
    },
    update(dt) {
      timer += dt;
      wrongFlash = Math.max(0, wrongFlash - dt);
      yay = Math.max(0, yay - dt);
      glow(treatBtn, rewardNow());
      // Le chien marche vers sa place.
      const d = dogTarget - dogX;
      if (Math.abs(d) > 1) dogX += Math.sign(d) * Math.min(Math.abs(d), 170 * dt);
      if (distractor) {
        distractor.x += distractor.speed * dt;
        if (distractor.x > 460) distractor = null;
      }
      if (ctx.done) return;
      if (phase === 'ask') {
        if (wanted === 'recall') {
          sniffTimer -= dt;
          if (sniffTimer <= 0) {
            sniffing = !sniffing;
            sniffTimer = sniffing ? 1.6 + rng() * 1.6 : 1.5;
            ctx.hint(tg(sniffing ? 'dt_mg_ask_recall' : 'dt_mg_recall_look'), sniffing ? '' : 'good');
          }
          // Il renifle en se promenant au fond de la cour ; il s'arrête quand il te regarde.
          if (sniffing && Math.abs(dogTarget - dogX) < 2) dogTarget = 55 + rng() * 60;
          if (!sniffing) dogTarget = dogX;
        } else if (timer > 2.5) glow(cmdBtns[wanted], true); // coup de pouce : le bon bouton brille
      } else if (phase === 'react') {
        if (timer > 0.7) {
          pose = COMMANDS[wanted].pose;
          setPhase('window');
          ctx.hint(tg('dt_mg_now'), 'good');
        }
      } else if (phase === 'ignore') {
        if (timer > 1.8) {
          setPhase('ask');
          ctx.hint(tg('dt_mg_ignored'), 'warn');
        }
      } else if (phase === 'hold') {
        playerX = Math.min(350, playerX + 50 * dt);
        if (distractor?.breaks && distractor.x > dogX - 30) {
          // Il n'a pas tenu : il se lève pour suivre l'écureuil.
          pose = 'stand';
          dogTarget = dogX + 40;
          fx.float(dogX, FLOOR - 110, '💨', 26);
          setPhase('broke');
          ctx.hint(tg('dt_mg_stay_broke'), 'warn');
        } else if (!distractor) {
          setPhase('window');
          ctx.hint(tg('dt_mg_stay_now'), 'good');
        }
      } else if (phase === 'broke') {
        if (timer > 1) {
          dogTarget = STAY_X;
          pose = sitPose;
          playerX = 290;
          attempts = 1; // la deuxième fois, il tiendra
          setPhase('ask');
          ctx.hint(tg('dt_mg_ask_stay'));
        }
      } else if (phase === 'walk') {
        playerX -= 48 * dt;
        heelPhase += dt * 1.2;
        dogX = playerX - HEEL_BACK + heelOffset();
        dogTarget = dogX;
        if (playerX < 90) {
          // Au bout de la cour sans récompense : on revient et on recommence.
          misses++;
          ctx.hint(tg('dt_mg_heel_again'), 'warn');
          playerX = PLAYER_X;
          dogX = PLAYER_X - HEEL_BACK;
          dogTarget = dogX;
          attempts = 1;
          setPhase('ask');
        }
      } else if (phase === 'come') {
        dogTarget = playerX - 100; // il s'assoit devant toi
        if (Math.abs(dogTarget - dogX) < 3) {
          pose = sitPose;
          setPhase('window');
          ctx.hint(tg('dt_mg_recall_arrived'), 'good');
        }
      } else if (phase === 'window') {
        if (timer > REWARD_WINDOW) {
          // Trop tard : il ne sait plus pourquoi il aurait une friandise. On redonne l'ordre.
          misses++;
          fx.float(dogX, FLOOR - 110, '🤷', 26);
          ctx.hint(tg('dt_mg_tooLate'), 'warn');
          attempts = 1;
          if (wanted === 'recall') {
            dogTarget = 80;
            sniffing = true;
            sniffTimer = 1.5;
            pose = 'stand';
          } else if (wanted === 'stay') {
            playerX = 290;
          } else pose = 'stand';
          setPhase('ask');
        }
      } else if (phase === 'yay') {
        if (timer > 1.1 && round < total) startRound();
      }
    },
    draw(g) {
      scene(g, ctx);
      // Bulle en haut : l'ordre à donner.
      const text = cmdLabel(wanted);
      g.font = `800 20px ${TEXT_FONT}`;
      const bw = Math.min(280, g.measureText(text).width + 40);
      g.fillStyle = wrongFlash > 0 ? '#ffe0dc' : 'rgba(255,255,255,0.95)';
      rrect(g, 200 - bw / 2, 20, bw, 40, 20);
      g.fill();
      label(g, text, 200, 41, 20, '#23302a');
      label(g, `${Math.min(round + 1, total)} / ${total}`, 368, 32, 16);
      // Au pied : la place du chien, à côté de toi (verte quand il y est).
      if (wanted === 'heel' && (phase === 'walk' || phase === 'ask')) {
        g.fillStyle = heelOk() ? 'rgba(63,174,98,0.75)' : 'rgba(255,255,255,0.55)';
        rrect(g, playerX - HEEL_BACK - HEEL_ZONE - 24, FLOOR + 6, HEEL_ZONE * 2 + 48, 10, 5);
        g.fill();
      }
      const heelWalk = wanted === 'heel' && (phase === 'walk' || phase === 'ask');
      if (!heelWalk) player(g, playerX, phase === 'hold');
      // Cercle vert : c'est le bon moment pour la friandise.
      const now = rewardNow();
      if (now) {
        const k = 0.5 + Math.sin(ctx.time * 10) * 0.5;
        g.strokeStyle = `rgba(63,174,98,${0.55 + k * 0.4})`;
        g.lineWidth = 5;
        g.beginPath();
        g.ellipse(dogX, FLOOR - 50, 92 + k * 6, 64 + k * 4, 0, 0, Math.PI * 2);
        g.stroke();
        emoji(g, '🍪', dogX, FLOOR - 150 - k * 6, 30);
      }
      const walking = phase === 'walk' || Math.abs(dogTarget - dogX) > 2;
      // Il regarde où il va ; à l'arrêt, vers toi (sauf « au pied » : vers où vous allez marcher).
      const f = phase === 'walk' ? -1 : Math.abs(dogTarget - dogX) > 2 ? Math.sign(dogTarget - dogX) : heelWalk ? -1 : dogX < playerX ? 1 : -1;
      dog(g, a, fit, dogX, {
        f,
        pose: walking ? 'stand' : pose,
        walk: walking ? ctx.time * 9 : null,
        happy: yay > 0 || now,
        wag: yay > 0 || phase === 'come' || now,
        earsBack: wrongFlash > 0,
      });
      if (heelWalk) player(g, playerX, false);
      if (wanted === 'recall' && phase === 'ask') {
        if (sniffing) emoji(g, '🐾', dogX - 34, FLOOR - 24, 22);
        else emoji(g, '👀', dogX, FLOOR - 125 - Math.sin(ctx.time * 8) * 4, 30);
      }
      if (phase === 'ignore') emoji(g, '🦋', dogX - 40 + Math.sin(ctx.time * 3) * 30, FLOOR - 130 + Math.cos(ctx.time * 4) * 10, 28);
      if (wrongFlash > 0) emoji(g, '❓', dogX, FLOOR - 140, 30);
      if (distractor) emoji(g, distractor.emoji, distractor.x, distractor.y, 30);
    },
  };
}

// ---------------------------------------------------------------- jauge de moment : troupeau, agility

const TIMING_THEMES = {
  dt_herd: { cmd: '🐑', hold: '🛑', distract: '🐑', reward: '🍪', pose: 'stand' },
  dt_agility: { cmd: '🎯', hold: '🕳️', distract: '🦋', reward: '🍪', pose: 'stand' },
};

export function timingGame(ctx) {
  const { a, t, fx } = ctx;
  const theme = TIMING_THEMES[ctx.action] ?? TIMING_THEMES.dt_herd;
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
      timer = 3 + Math.random() * 1.5; // il reste au sol : le temps de le récompenser
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
      dog(g, a, fit, 225, { lift, pose: jump >= 0 ? 'beg' : celebrate > 0 ? 'sit' : 'stand', happy: celebrate > 0, wag: celebrate > 0 });
      if (jump >= 0) emoji(g, '❗', 225, FLOOR - 140 - lift, 32);
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
registerMinigame('dt_obey', commandsGame, '✋');
registerMinigame('dt_pull', commandsGame, '🦮'); // tire en laisse, quand la promenade en 3D n'est pas possible
registerMinigame('dt_herd', timingGame, '🐑');
registerMinigame('dt_agility', timingGame, '🎯');
registerMinigame('dt_jump', jumpGame, '🙅');
registerMinigame('dt_bark', barkGame, '🤫');
registerMinigame('dt_shy', shyGame, '🫣');

export const DOG_TRAINING_GAMES = ['dt_recall', 'dt_obey', 'dt_pull', 'dt_herd', 'dt_agility', 'dt_jump', 'dt_bark', 'dt_shy'];
