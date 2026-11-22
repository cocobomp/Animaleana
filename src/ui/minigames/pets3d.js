// Les soins des animaux de compagnie en 3D (chien, chat, lapin), sur le vrai animal du joueur dans son décor
// (src/game/care/petStage.js ; décors : home.js pour le chien et le chat, hutch.js pour le lapin).
//
// - Nourrir et donner à boire : la logique est celle des jeux dessinés (food.js pourGame : remplir juste ce qu'il
//   faut, jusqu'à la ligne 🎯), seule l'image change : notre main tient le sac de croquettes (ou de granulés) qui se
//   penche, les croquettes tombent une à une dans sa gamelle à son nom et le tas monte ; la carafe verse un filet
//   d'eau. Il attend assis en regardant la gamelle (le chien remue la queue), puis il vient manger, ou boire.

import * as THREE from 'three';
import { feedGame, waterGame, treatGame, drawCountZone, stopLabel, nb, justMsgs, emojiOpaque as emoji } from './food.js';
import { FAVORITE, SPEED_LIMIT, PET_AMOUNT, drawHeartGauge, HEART } from './fun.js';
import { rrect, circle, clamp, lerp, distToSegment } from './draw.js';
import { justRule } from './grooming.js';
import { petDirtTexture } from '../../game/care/petTextures.js';
import { petBrush } from '../../game/care/petProps.js';
import { softDot } from '../../game/care/textures.js';
import { petNails3dGame } from './petNails3d.js';
import { petPlay3dGame } from './petPlay3d.js';
import { petWash3dGame } from './petWash3d.js';
import { petClean3dGame } from './petClean3d.js';
import { withLogic, sideGauge, bubble } from './care3d.js';
import { kibbleBag, kibbleRain, pitcher, FOODS, own, treatFor } from '../../game/care/petProps.js';
import { aimHand } from '../../game/care/props.js';
import { petHand, shoulderFor } from '../../game/care/petHand.js';
import { audio } from '../../game/audio.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/**
 * De la place autour de sa tête (repère monde, pose du moment) : au-dessus des oreilles, devant le nez, sous le menton.
 * À ajouter aux points d'un cadrage : il lève la tête, la tourne, et elle reste dans l'image (surtout en paysage, où
 * la hauteur est comptée).
 */
export function headRoom(sc, k = 1) {
  const L = sc.marks;
  const hl = L.size.headLen;
  const up = v3(0, hl * 0.45 * k, 0);
  const nose = sc.live('nose');
  const fwd = nose.clone().sub(sc.live('head')).normalize();
  return [sc.live('poll').add(up), ...L.ears.map((e) => e.clone().add(v3(0, hl * 0.25 * k, 0))), nose.addScaledVector(fwd, hl * 0.3 * k), sc.live('muzzle').add(v3(0, -hl * 0.35 * k, 0))];
}

/** Luminance relative d'une couleur (THREE.Color, composantes linéaires). */
const relLum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

/** Un petit bruit de contentement de l'animal (aboiement doux, miaulement, rien pour le lapin). */
export function happySound(sc) {
  audio.animal?.(sc.a?.species ?? 'dog', 'happy', sc.a?.id ?? null);
}

/** Posture d'attente de chaque espèce : assis (chien, chat), assis sur son derrière (lapin). */
const WAIT = { dog: 'sit', cat: 'sit', rabbit: 'sit' };

// ---------------------------------------------------------------- nourrir et donner à boire

export const petFeed3dGame = (ctx) => pour3d(ctx, false);
export const petWater3dGame = (ctx) => pour3d(ctx, true);

function pour3d(ctx, water) {
  const sc = ctx.scene;
  const decor = sc.decor;
  const P = decor.props;
  const sp = sc.species;
  decor.layout(water ? 'water' : 'feed');
  const bowl = water ? P.water : P.food;
  const L = sc.marks;
  const D = bowl.dims;
  // Pendant qu'on verse, la gamelle est un peu plus loin devant lui (il ne met pas le nez dans le sac) ; à la fin,
  // il vient jusqu'à elle (la gamelle est alors juste sous sa bouche quand il mange : mesuré sur son animation).
  const eatAt = bowl.group.position.clone();
  const ahead = Math.max(D.r * 1.6, L.size.len * 0.32);
  bowl.group.position.x += ahead;
  const homeX = sc.holder.position.x;
  const bowlW = () => bowl.group.getWorldPosition(v3());
  // (eau : on verse avec une carafe, pas au robinet du jeu dessiné — consigne et bouton changés)
  const norm = (x) => String(x).replace(/\u00a0/g, ' ');
  const wctx = Object.create(ctx);
  if (water) {
    wctx.button = (text, o) => ctx.button(norm(text).includes(norm(ctx.t('mg_water_btn'))) ? `💧 ${ctx.t('mg_water_btn3d')}` : text, o);
    wctx.hint = (text, kind) => ctx.hint(norm(text) === norm(ctx.t('mg_water_hint')) ? ctx.t('mg_water_hint3d') : text, kind);
  }
  const play = withLogic(wctx, water ? waterGame : feedGame, () => sc.project(bowlW().add(v3(0, D.r * 0.8, 0))));
  const s0 = play.peek();
  const mark = bowl.setMark(s0.lo, s0.hi, s0.target);
  // La source : le sac tenu par notre main, ou la carafe, au-dessus de la gamelle, de l'autre côté de sa tête. Tant
  // qu'on ne verse pas, on la tient plus haut : elle ne cache jamais la gamelle ; on la baisse en la penchant.
  const size = Math.max(0.34, Math.min(1.1, (0.8 * D.r) / 0.09));
  const SRC = water ? { w: 0.13, h: 0.2 } : { w: 0.16, h: 0.24 };
  const hand = { ...(P.hand ?? {}), size: handSize(L) };
  const src = water ? pitcher({ size, hand, shoulder: (at) => shoulderOf(sc, at) }) : kibbleBag({ kind: sp, size, hand, shoulder: (at) => shoulderOf(sc, at) });
  sc.scene.add(src.group);
  // Vu de devant lui et d'assez haut (VIEW) : la gamelle au premier plan, lui derrière, qui la regarde ; la source
  // (le sac, la carafe) tournée vers la droite de l'image, son ouverture au-dessus de la gamelle : elle ne passe pas
  // devant sa tête, et notre bras arrive par le bas à droite.
  const VIEW = v3(1, 0.62, 0.62).normalize();
  const camRight = new THREE.Vector3().crossVectors(VIEW.clone().negate(), v3(0, 1, 0)).normalize();
  const srcAt = bowlW().add(v3(0, D.r * 0.9 + 0.05 * size, 0)).addScaledVector(camRight, D.r * 0.15);
  const lift = SRC.h * size * 0.92;
  src.group.position.copy(srcAt).add(v3(0, lift, 0));
  src.group.rotation.y = Math.atan2(-camRight.z, camRight.x);
  src.setTilt(0.1);
  const food = FOODS[sp] ?? FOODS.dog;
  const rain = water ? null : kibbleRain(food, 70);
  if (rain) sc.scene.add(rain.mesh);
  const m = sc.mood;
  m.posture = sp === 'rabbit' && !rabbitRears(sc) ? 'crouch' : WAIT[sp];
  m.look = bowlW().add(v3(0, D.r, 0));
  m.lookAmt = 0.8;
  m.ears = 'forward';
  m.happy = 0.4;
  // Cadrage : sa tête (assis, il lève la tête), la gamelle, la source au-dessus ; de trois quarts et d'assez haut
  // pour voir dans la gamelle (la ligne 🎯, le tas qui monte) ; la gamelle au premier plan.
  const frameWait = (now = false) => {
    const b = bowlW();
    const top = srcAt.clone().add(v3(0, lift, 0));
    sc.frame([L.muzzle, L.poll, ...L.ears, ...headRoom(sc), L.chest, L.croup, L.paws[0], L.paws[1], b.clone().add(v3(-D.r, -D.depth, -D.r)), b.clone().add(v3(D.r * 1.2, -D.depth, D.r * 1.2)), top, top.clone().addScaledVector(camRight, SRC.w * size)], { dir: VIEW.toArray(), pad: 1.06, now });
  };
  frameWait(true);
  let spawnAcc = 0;
  let saidOk = false;
  let doneT = 0;
  let snd = 1.5;
  return {
    peek: () => ({ ...play.peek(), bowl: bowl.level, walkX: sc.holder.position.x - homeX }),
    down: (p) => play.down(p),
    up: (p) => play.up(p),
    key: (c, d) => play.key(c, d),
    update(dt) {
      play.update(dt);
      const s = play.peek();
      const pouring = s.pouring && !ctx.done;
      src.setTilt(pouring ? 1 : s.finishing ? 0.5 : 0.1);
      src.update(dt);
      // (penchée, la source descend sur la gamelle ; droite, on la tient plus haut)
      if (!ctx.done) src.group.position.y = srcAt.y + lift * Math.max(0, 1 - (src.tilt - 0.1) / 0.9);
      bowl.setLevel(ctx.done && doneT > 0.1 ? bowl.level : s.level);
      if (water) {
        const surf = bowl.group.localToWorld(v3(0, bowl.surfaceY(), 0)).y;
        src.setStream(pouring ? 0.4 + 0.6 * Math.min(1, s.value * 3) : 0, surf);
        bowl.flow(pouring ? 1 : 0, bowl.group.worldToLocal(src.spout(v3())));
      } else {
        // les croquettes tombent du sac (seulement quand il est bien penché)
        if (pouring && src.tilt > 0.75) {
          spawnAcc += dt * 26;
          while (spawnAcc > 1) {
            spawnAcc -= 1;
            const p = src.mouth(v3());
            // (vers l'avant du sac penché : sa gauche, puisqu'il est tourné vers la droite de l'image)
            const vel = camRight.clone().multiplyScalar(-0.12 - Math.random() * 0.12).add(v3((Math.random() - 0.5) * 0.08, -0.1, (Math.random() - 0.5) * 0.08));
            rain.spawn(p, vel, food.size * Math.pow(D.r / 0.09, 0.35));
          }
        }
        const c = bowlW();
        const top = bowl.group.localToWorld(v3(0, bowl.surfaceY(), 0)).y;
        rain.update(dt, (p) => (Math.hypot(p.x - c.x, p.z - c.z) < D.inR ? top : 0.004));
      }
      if (!saidOk && s.value >= s.lo) {
        saidOk = true;
        m.happy = 1;
        happySound(sc);
      }
      // Lui : il regarde la gamelle (et le sac quand ça coule), content ; le chien remue la queue de plus en plus.
      if (!ctx.done) {
        m.look = pouring ? src.group.position.clone().lerp(bowlW(), 0.6) : bowlW().add(v3(0, D.r, 0));
        m.lookAmt = pouring ? 1 : 0.8;
        m.happy = Math.min(1, 0.4 + s.value * 0.8);
      } else {
        doneT += dt;
        // La source s'en va ; il se lève, vient jusqu'à la gamelle, et mange (ou boit).
        src.group.position.y += dt * 0.6;
        src.group.visible = doneT < 1.2;
        if (doneT > 0.2) m.posture = 'stand';
        if (doneT > 0.6) m.walkTo = homeX + ahead;
        const arrived = Math.abs(sc.holder.position.x - (homeX + ahead)) < 0.01;
        if (arrived && doneT > 0.9) {
          m.eat = water ? 'drink' : 'eat';
          m.lookAmt = 0;
          m.chew = water ? 0.3 : 1;
          if (water) bowl.drink(dt, 0.02);
          else bowl.eat(dt, 0.035);
        }
        if (doneT < 0.7) frameEat();
      }
      snd -= dt;
      if (snd <= 0) {
        snd = 6 + Math.random() * 5;
        if (!ctx.done && s.value > 0.2) happySound(sc);
      }
    },
    draw(g) {
      if (!sc.ready) return;
      const s = play.peek();
      if (!ctx.done) {
        const b = sc.project(bowl.group.localToWorld(v3(D.r, -D.depth, 0)));
        const t = sc.project(bowl.group.localToWorld(v3(D.r, 0, 0)));
        const h = Math.max(60, Math.min(130, (b.y - t.y) * 2.2));
        // (à droite de la gamelle, ou à gauche si le bord de l'image est trop près)
        const left = sc.project(bowl.group.localToWorld(v3(-D.r, -D.depth, 0)));
        const gx = b.x + 30 < ctx.view.x1 - 20 ? b.x + 30 : Math.max(ctx.view.x0 + 20, left.x - 30);
        sideGauge(g, gx, Math.min(b.y, ctx.view.y1 - 12), h, s.value, s.lo, s.hi, { icon: water ? '💧' : '🥣', time: ctx.time });
        // 🎯 au bord de la ligne, du côté de la caméra
        const m2 = sc.project(bowl.group.localToWorld(v3(-mark.r * 0.7, mark.y, mark.r * 0.7)));
        g.save();
        g.font = `18px ${EMOJI}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#000';
        g.fillText('🎯', m2.x - 14, m2.y);
        g.restore();
      } else if (doneT > 1.5) {
        const p = sc.project(sc.live('poll').add(v3(0, L.size.h * 0.25, 0)));
        if (!p.behind) bubble(g, p.x, p.y, water ? '💧' : '😋', { size: 16 });
      }
    },
    destroy() {
      sc.scene.remove(src.group);
      src.dispose();
      if (rain) {
        sc.scene.remove(rain.mesh);
        rain.dispose();
      }
      bowl.hideMark();
    },
  };

  function frameEat() {
    const e = eatAt.clone().add(v3(ahead, 0, 0)); // (la gamelle est restée là où on a versé)
    const A = (p) => p.clone().add(v3(ahead, 0, 0));
    sc.frame([A(L.poll), A(L.withers), A(L.croup), A(L.tail), ...L.ears.map(A), ...L.paws.map(A), e.clone().add(v3(-D.r, -D.depth, 0)), e.clone().add(v3(D.r, -D.depth, D.r))], { dir: VIEW.toArray(), pad: 1.2, half: 0.6 });
  }
}

// ---------------------------------------------------------------- la friandise

const TREAT_ICON = { dog: '🦴', cat: '🐟', rabbit: '🥕' };
/** Posture « sage » de chaque espèce : assis (le lapin se dresse sur ses pattes arrière pour la demander). */
const CALM = { dog: 'sit', cat: 'sit', rabbit: 'rear' };

/**
 * Le lapin peut-il se redresser (assis sur son derrière, dressé) ? Pas le tête de lion (ni un lapin à « jupe » de poil
 * long) : redressé, la barbe de sa crinière, poussée par le poil long, pendait sous son menton en une grande nappe
 * pâle, parfois jusqu'au sol. Il reste ramassé, le nez levé.
 */
export const rabbitRears = (sc) => !(sc.model?.build?.skirt > 0.1);

/**
 * La friandise en 3D : la logique est celle du jeu dessiné (food.js treatGame : attendre qu'il soit sage, en donner
 * juste le bon nombre). Notre main tendue, paume ouverte, avec la friandise de son espèce (biscuit en os, petit
 * poisson, bâtonnet de carotte) ; il s'agite (le chien frétille et tourne la tête partout, le lapin renifle), puis
 * il s'assied, sage, les yeux sur la main (le lapin se dresse) ; on donne : la main va jusqu'à sa bouche, il la prend
 * et la croque, content.
 */
export function petTreat3dGame(ctx) {
  const sc = ctx.scene;
  const sp = sc.species;
  sc.decor.layout('rest');
  const m = sc.mood;
  const L = sc.marks;
  const hl = L.size.headLen;
  const play = withLogic(ctx, treatGame, () => sc.project(sc.live('muzzle').add(v3(0, hl * 0.4, 0))));
  const keep = own();
  const hand = petHand(keep, { ...(sc.decor.props.hand ?? {}), size: handSize(L) });
  hand.userData.pose({ curl: 0.08, thumb: 0, spread: 0.2 });
  sc.scene.add(hand);
  const tscale = Math.max(0.45, Math.min(1.2, hl / 0.2));
  const treat = treatFor(sp, keep, tscale);
  hand.add(treat);
  treat.position.set(0.02, 0.012 + 0.01 * tscale, 0);
  treat.rotation.set(0, 0.5, 0);
  // Main au repos : devant le bout de son nez, de notre côté, un peu plus bas (il doit lever la tête vers elle).
  const rest = L.muzzle.clone().add(v3(hl * 0.9 + 0.05, -hl * 0.15, hl * 0.6 + 0.06));
  // (le lapin se dresse pour la demander : sa tête monte de presque sa hauteur)
  const calmPose = sp === 'rabbit' && !rabbitRears(sc) ? 'crouch' : CALM[sp];
  const tall = sp === 'rabbit' && calmPose === 'rear' ? [L.poll.clone().add(v3(-L.size.len * 0.25, L.size.h * 0.9, 0)), ...L.ears.map((e) => e.clone().add(v3(-L.size.len * 0.25, L.size.h * 0.9, 0)))] : [];
  sc.frame([L.muzzle, L.poll, ...L.ears, ...headRoom(sc), ...tall, L.chest, L.withers, L.croup, L.paws[0], L.paws[1], rest.clone().add(v3(0.06, -0.03, 0.04)), rest.clone().add(v3(-0.04, 0.05, 0))], { dir: [1.05, 0.2, 1], pad: sp === 'rabbit' ? 1.2 : 1.1, now: true });
  let given = 0;
  let pen = 0;
  let reachT = -1;
  let reach = 0;
  let back = 0;
  let wanderAt = 0;
  const wander = v3();
  m.ears = 'forward';
  return {
    peek: () => ({ ...play.peek(), reach }),
    down: (p) => play.down(p),
    key: (c, d) => play.key(c, d),
    update(dt) {
      play.update(dt);
      const s = play.peek();
      if (s.given > given) {
        given = s.given;
        reachT = 0;
        if (s.given <= s.n) happySound(sc);
      }
      if (s.penalties > pen) {
        pen = s.penalties;
        back = 1;
        sc.shake = 0.2;
      }
      back = Math.max(0, back - dt * 2.5);
      if (reachT >= 0) {
        reachT += dt;
        reach = reachT < 0.4 ? reachT / 0.4 : reachT < 0.7 ? 1 : Math.max(0, 1 - (reachT - 0.7) / 0.4);
        if (reachT > 1.15) reachT = -1;
      } else reach = 0;
      const taken = reachT >= 0.5;
      const mouth = sc.live('muzzle');
      const target = mouth.clone().add(v3(hl * 0.25, -hl * 0.12, hl * 0.12));
      const pos = rest.clone().lerp(target, smooth(reach)).add(v3(0.04, -0.03, 0.12).multiplyScalar(back));
      hand.position.copy(pos);
      aimHand(hand, shoulderOf(sc, pos), target.clone().lerp(pos, 0.2).add(v3(0, 0.01, 0)), true);
      treat.visible = !taken && !(ctx.done && s.given >= s.max) && !(s.state === 'eat' && reachT < 0);
      const calm = s.state === 'calm' || s.state === 'eat';
      if (!ctx.done && s.state === 'wiggle') {
        wanderAt -= dt;
        if (wanderAt <= 0) {
          wanderAt = 0.45 + Math.random() * 0.5;
          wander.copy(rest).add(v3((Math.random() - 0.5) * 0.8, (Math.random() - 0.2) * 0.4, (Math.random() - 0.3) * 0.6).multiplyScalar(Math.max(0.4, L.size.h * 1.5)));
        }
        m.look = wander;
        m.lookAmt = 1;
        // (le chien et le chat restent assis et se trémoussent, la tête partout ; le lapin renifle)
        m.posture = sp === 'rabbit' ? 'crouch' : 'sit';
        m.sniff = sp === 'rabbit';
        m.action = sp === 'dog' ? 'wag' : null;
        m.happy = 1;
      } else {
        m.look = hand.position;
        m.lookAmt = 1;
        m.posture = calm || ctx.done ? calmPose : 'stand';
        m.sniff = false;
        m.action = null;
        m.happy = s.given > s.n ? 0.2 : 0.9;
      }
      m.nuzzle = reach * 0.8;
      m.chew = s.state === 'eat' && reachT > 0.45 ? 1 : Math.max(0, (m.chew ?? 0) - dt * 1.5);
    },
    draw(g) {
      if (!sc.ready) return;
      const s = play.peek();
      const v = ctx.view;
      const w = 34 * s.max + 22;
      const x = v.x0 + 8;
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.86)';
      g.beginPath();
      g.roundRect(x, v.y0 + 8, w, 46, 16);
      g.fill();
      g.restore();
      drawCountZone(g, x + 22, v.y0 + 31, s.given, s.n, s.max, TREAT_ICON[sp] ?? '🍪');
      // sage : un halo doré discret au-dessus de sa tête, et le petit chrono qui se vide
      if (s.state === 'calm' && !ctx.done) {
        const p = sc.project(sc.live('poll').add(v3(0, hl * 0.6, 0)));
        g.save();
        g.font = `20px ${EMOJI}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#000';
        g.globalAlpha = 0.7 + Math.sin(ctx.time * 8) * 0.3;
        g.fillText('✨', p.x, p.y);
        g.restore();
      }
    },
    destroy() {
      sc.scene.remove(hand);
      keep.dispose();
    },
  };
}

const smooth = (k) => k * k * (3 - 2 * k);

// ---------------------------------------------------------------- caresser

/** Ronron du chat : un grondement doux, des petits souffles très graves, vingt-deux par seconde. */
export function purr(dur = 1.2, gain = 0.05) {
  const c = audio.ready?.();
  if (!c) return;
  try {
    const t0 = c.currentTime;
    for (let i = 0; i < dur * 22; i++) {
      const k = Math.sin((i / (dur * 22)) * Math.PI);
      audio.burst(audio.sfx, { t: t0 + i / 22, dur: 0.04, gain: gain * (0.4 + 0.6 * k), attack: 0.012, filter: { type: 'lowpass', f: 160, q: 0.9 } });
    }
  } catch {
    /* pas de son, pas grave */
  }
}

/** Ses coins (repère monde, pose du moment) : poitrail, joue, haut de la tête, dos. */
export function petSpots(sc) {
  const L = sc.marks;
  const hl = L.size.headLen;
  const head = sc.live('head');
  const toUs = v3(0, 0, 1);
  return {
    chest: L.chest.clone().add(v3(-hl * 0.15, -hl * 0.1, 0)).addScaledVector(toUs, L.size.w * 0.3),
    cheek: head.clone().lerp(sc.live('muzzle'), 0.25).add(v3(0, -hl * 0.05, 0)).addScaledVector(toUs, hl * 0.3),
    headTop: sc.live('poll').clone().lerp(sc.live('nose'), 0.15).add(v3(0, hl * 0.02, 0)),
    back: L.back.clone().addScaledVector(toUs, L.size.w * 0.15),
  };
}

/**
 * Caresser en 3D : on glisse le doigt sur lui (lancer de rayon sur le vrai modèle) et notre main se pose à plat sur
 * son poil. Mêmes règles que le jeu dessiné (fun.js petGame) : doucement (trop vite, il sursaute, oreilles en
 * arrière), son coin préféré (le poitrail du chien, la joue du chat, le haut de la tête du lapin) compte plus ; le
 * cœur doit s'arrêter dans la zone verte (trop : il en a assez). Il répond : le chien remue la queue, gueule
 * entrouverte, content ; le chat ronronne (on l'entend), la queue droite ; le lapin ferme à demi les yeux et
 * « ronronne des dents ».
 */
export function petPet3dGame(ctx) {
  const { a, t, fx } = ctx;
  const sc = ctx.scene;
  const sp = sc.species;
  sc.decor.layout('rest');
  const hint = (text, kind) => ctx.hint(nb(text), kind);
  const favKey = FAVORITE[sp] ?? 'back';
  const hintAfter = 3.5;
  const limit = SPEED_LIMIT[a.personality] ?? 420;
  const shy = a.personality === 'shy';
  const target = PET_AMOUNT[a.personality] ?? 0.65;
  const band = 0.12;
  const lo = target - band;
  const hi = target + band;
  const L = sc.marks;
  const hl = L.size.headLen;
  const favR = Math.max(0.03, hl * 0.6);
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
  let joy = 0;
  let lastLove = -9;
  let zoneState = 'low';
  let touch = null;
  let touchAge = 9;
  let purrIn = 0;
  let saidHappy = false;
  // Notre main, à plat sur son poil, un peu plus petite pour un tout petit animal (sinon elle le cache tout entier).
  const keep = own();
  const hs = handSize(L);
  const hand = petHand(keep, { ...(sc.decor.props.hand ?? {}), size: hs });
  hand.userData.pose({ curl: 0.2, thumb: 0.1, spread: 0.1 });
  hand.visible = false;
  sc.scene.add(hand);
  const m = sc.mood;
  m.posture = sp === 'rabbit' ? 'crouch' : 'sit';
  m.ears = 'forward';
  m.happy = 0.35;
  // Le chien et le chat assis, le lapin ramassé : de trois quarts avant, un peu de haut.
  sc.frame([L.muzzle, L.poll, ...L.ears, ...headRoom(sc), L.withers, L.back, L.chest, L.croup, ...L.paws], { dir: [0.7, 0.32, 1], pad: 1.1, now: true });

  hint(t(shy ? 'mg_pet_hint_shy' : 'mg_pet_hint', { name: a.name }));
  ctx.zone(lo, hi);
  const stopBtn = ctx.stopButton(() => { if (prog >= 0.03) end(); }, stopLabel(t));
  stopBtn.disabled = true;
  const headAt = () => sc.project(sc.live('poll').add(v3(0, hl * 0.5, 0)));

  function end() {
    if (ctx.done) return;
    const { verdict: why } = ctx.finishJust(prog, lo, hi, { who: a.name, msgs: justMsgs(t, a.name) });
    const h = headAt();
    if (why === 'just') {
      fx.burst(h.x, h.y, '💕', 6);
      happySound(sc);
      if (sp === 'cat') purr(2.2, 0.06);
    } else if (why === 'high') fx.float(h.x, h.y - 20, '😮‍💨', 28);
  }

  function stroke(p) {
    const now = ctx.time;
    if (!last) {
      last = p;
      lastT = now;
      return;
    }
    const d = Math.hypot(p.x - last.x, p.y - last.y);
    const dtm = Math.max(0.008, now - lastT);
    last = p;
    lastT = now;
    if (d < 0.5) return;
    speed = lerp(speed, d / dtm, 0.35);
    const hit = sc.pickAnimal(p.x, p.y);
    if (!hit || hit.region === 'leg' || hit.region === 'tail') return;
    touch = hit;
    touchAge = 0;
    if (speed > limit) {
      if (cool <= 0) {
        fast++;
        flinch = 0.5;
        cool = 0.9;
        prog = Math.max(0, prog - (shy ? 0.07 : 0.035));
        fx.text(p.x, p.y - 30, t('mg_gentle_short'), '#c07a10', 22);
        const h = headAt();
        fx.float(h.x, h.y - 10, '❗', 26);
        hint(t('mg_gentle', { name: a.name }), 'warn');
        zoneState = 'low';
        m.annoyed = 1.1;
        m.flinch = 1;
      }
      return;
    }
    const spots = petSpots(sc);
    const atFav = hit.point.distanceTo(spots[favKey]) < favR;
    prog = Math.min(1, prog + d * 0.0011 * (atFav ? 2.3 : 1));
    if (atFav) favDist += d;
    calmStroke += d;
    heartAcc += d;
    if (heartAcc > 48) {
      heartAcc = 0;
      fx.float(p.x, p.y - 12, prog > hi ? '💤' : atFav ? '💖' : '❤️', atFav ? 26 : 20);
    }
    if (prog <= hi && atFav && ctx.time - lastLove > 1.2 && Math.random() < 0.08) {
      lastLove = ctx.time;
      const h = headAt();
      fx.text(Math.max(70, h.x - 60), h.y - 20, t(sp === 'cat' ? 'mg_purr' : 'mg_loves'), '#d6457a', 18);
    }
    joy = Math.min(1.5, joy + (atFav ? 0.12 : 0.05));
    if (!saidHappy && prog > 0.25) {
      saidHappy = true;
      happySound(sc);
    }
    stopBtn.disabled = prog < 0.03;
    ctx.progress(prog);
    if (prog >= 1 && !ctx.done) end();
    else if (prog > hi) {
      if (zoneState !== 'high') {
        zoneState = 'high';
        hint(t('mg_tooMuch', { name: a.name }), 'warn');
      }
    } else if (prog >= lo) {
      if (zoneState !== 'just') {
        zoneState = 'just';
        hint(`✅ ${t('mg_stopHere')}`, 'good');
      }
    } else if (calmStroke > 180) {
      zoneState = 'low';
      hint(t(atFav ? 'mg_pet_fav' : 'mg_pet_good', { name: a.name, g: a.sex }), 'good');
    }
  }

  return {
    peek: () => ({ fav: favKey, prog, value: prog, lo, hi, fast, touching: touchAge < 0.2, region: touch?.region ?? null }),
    key(code, down) { if (down && (code === 'Enter' || code === 'NumpadEnter') && !stopBtn.disabled) end(); },
    down(p) {
      last = p;
      lastT = ctx.time;
      const hit = sc.pickAnimal(p.x, p.y);
      if (hit && hit.region !== 'leg' && hit.region !== 'tail') {
        touch = hit;
        touchAge = 0;
      }
    },
    move(p, down) { if (down) stroke(p); },
    up() {
      last = null;
      touch = null;
      speed *= 0.5;
    },
    update(dt) {
      if (!ctx.done) sc.setFocus(78 * ctx.view.scale, sc.size.h);
      flinch = Math.max(0, flinch - dt);
      cool = Math.max(0, cool - dt);
      joy = Math.max(0, joy - dt * 0.35);
      touchAge += dt;
      if (!ctx.pointer.down) speed = Math.max(0, speed - dt * 600);
      const fedUp = prog > hi && !ctx.done;
      const loved = (joy > 0.3 && flinch <= 0 && !fedUp) || (ctx.done && prog <= hi);
      // Lui : il nous regarde, content quand on le caresse bien ; il en a assez : oreilles en arrière, il détourne la tête.
      m.ears = fedUp ? 'back' : 'forward';
      if (fedUp) m.annoyed = Math.max(m.annoyed ?? 0, 0.3);
      m.look = fedUp ? L.muzzle.clone().add(v3(0.3, 0.05, -0.6).multiplyScalar(Math.max(0.3, L.size.h * 1.5))) : sc.camera.position;
      m.lookAmt = fedUp ? 0.6 : loved ? 0.45 : 0.35;
      m.happy = loved ? 1 : fedUp ? 0 : 0.35;
      m.action = sp === 'dog' && loved && joy > 0.8 ? 'wag' : null;
      m.chew = sp === 'rabbit' && loved ? 0.25 : Math.max(0, (m.chew ?? 0) - dt);
      // le chat ronronne (on l'entend) tant qu'on le caresse bien
      if (sp === 'cat' && loved && ctx.pointer.down) {
        purrIn -= dt;
        if (purrIn <= 0) {
          purrIn = 1.1;
          purr(1.2, 0.045);
        }
      }
      // notre main, à plat sur son poil, là où est le doigt
      const pp = ctx.pointer;
      hand.visible = !!(pp.down && touch && !ctx.done);
      if (hand.visible) {
        // (le bras vient de nous, par le bas de l'image : il ne passe jamais devant sa tête ; la main à plat sur le
        // poil, les doigts dans le prolongement du bras)
        const n = touch.normal.clone().normalize();
        const from = shoulderOf(sc, touch.point);
        const along = touch.point.clone().sub(from);
        along.addScaledVector(n, -along.dot(n));
        // (ce sont les doigts qui caressent : la paume un peu en arrière du doigt, vers le bras ; elle cache moins)
        hand.position.copy(touch.point).addScaledVector(n, 0.012 * hs).addScaledVector(along.clone().normalize(), -0.055 * hs);
        aimHand(hand, touch.point.clone().addScaledVector(along.normalize(), -0.1), touch.point, false, n);
      }
    },
    draw(g) {
      if (!sc.ready) return;
      const v = ctx.view;
      const fedUp = prog > hi && !ctx.done;
      if (fedUp) {
        const h = headAt();
        emoji(g, '😑', clamp(h.x + 34, v.x0 + 22, v.x1 - 22), clamp(h.y - 26, v.y0 + 70, v.y1 - 22), 26);
      }
      // Son coin préféré : il scintille si on ne l'a pas encore trouvé (après quelques secondes).
      if (!ctx.done && ctx.time > hintAfter && favDist < 60) {
        const spt = petSpots(sc)[favKey];
        const c = sc.project(spt);
        const r = Math.max(16, sc.projectRadius(spt, favR * 1.4));
        g.save();
        g.globalAlpha = 0.4 + Math.sin(ctx.time * 5) * 0.25;
        g.strokeStyle = '#ff7aa8';
        g.lineWidth = 4;
        g.setLineDash([6, 6]);
        circle(g, c.x, c.y, r);
        g.stroke();
        g.restore();
        emoji(g, '💡', c.x + r * 0.8, c.y - r * 0.8, 20);
      }
      // Tortue (doux) / lièvre (trop vite), en haut à gauche ; le grand cœur en haut à droite.
      const gx = v.x0 + 24;
      const gy = v.y0 + 26;
      const gw = 150;
      g.fillStyle = 'rgba(255,255,255,0.88)';
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
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.88)';
      circle(g, v.x1 - 34, v.y0 + 40, 32);
      g.fill();
      g.restore();
      drawHeartGauge(g, v.x1 - 34, v.y0 + 42, HEART.r, prog, lo, hi);
      // à la souris, sans toucher : la main montre où on va caresser
      const pp = ctx.pointer;
      if (!pp.down && pp.over && pp.type === 'mouse') emoji(g, '🤚', pp.x + 6, pp.y - 8, 40, -0.3);
    },
    destroy() {
      sc.scene.remove(hand);
      keep.dispose();
    },
  };
}

// ---------------------------------------------------------------- brosser

const BODY = new Set(['body', 'shoulder', 'hip']);

/**
 * Brosser en 3D : la logique est celle du jeu dessiné (grooming.js brushGame : enlever toutes les taches de
 * poussière, dans le sens du poil c'est mieux, puis s'arrêter avec ✅ ; brosser encore le poil propre l'irrite). Les
 * taches de poussière sont posées sur son poil (liées à ses os : elles suivent sa respiration) ; notre brosse à
 * picots glisse sur lui, de petites touffes de poil s'envolent ; il est debout de profil, la tête à droite : le sens
 * du poil va vers la queue (vers la gauche).
 */
export function petBrush3dGame(ctx) {
  const { a, t, fx } = ctx;
  const sc = ctx.scene;
  const sp = sc.species;
  sc.decor.layout('rest');
  const L = sc.marks;
  const S = L.size;
  const rng = ctx.rng;
  const keep = own();
  const m = sc.mood;
  m.posture = sp === 'rabbit' ? 'crouch' : 'stand';
  m.ears = 'forward';
  m.happy = 0.4;
  // de profil, un peu de haut, la tête à droite
  sc.frame([L.nose, L.muzzle, L.poll, ...L.ears, ...headRoom(sc), L.withers, L.croup, L.tail, L.tailTip, L.chest, L.belly, ...L.paws], { dir: [0.25, 0.2, 1], pad: 1.1, now: true });

  // ---- les taches de poussière, posées sur le flanc (rayons lancés vers lui depuis notre côté)
  // (la saleté qui se voit le mieux sur cette robe : terre sombre, ou poussière claire sur un poil foncé ou roux)
  const coatLum = relLum(new THREE.Color(ctx.col?.coat ?? '#c8a070'));
  const lightDirt = (0.65 + 0.05) / (coatLum + 0.05) > (coatLum + 0.05) / (0.045 + 0.05);
  const dustTex = keep(petDirtTexture(lightDirt, 5));
  const patchGeo = keep(new THREE.PlaneGeometry(1, 1));
  function decal(p, n, bone, r, tex, color = 0xffffff, opacity = 1) {
    const mat = keep(new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 1.5, transparent: true, depthWrite: false, roughness: 1, color, opacity, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    mat.userData.baseOpacity = opacity;
    const mesh = new THREE.Mesh(patchGeo, mat);
    mesh.scale.set(r * 2.6, r * 1.8, 1);
    mesh.position.copy(p).addScaledVector(n, 0.003);
    mesh.lookAt(p.clone().add(n));
    mesh.rotateZ((rng() - 0.5) * 0.5);
    // (après les couches de poil des chats et des lapins, qui la couvraient)
    mesh.renderOrder = 40;
    sc.scene.add(mesh);
    (bone ?? sc.holder).attach(mesh);
    return mesh;
  }
  sc.proxy.bake();
  function bodyPoints(count, r0) {
    const out = [];
    const x0 = L.croup.x + S.len * 0.04;
    const x1 = L.withers.x + S.len * 0.06;
    const y0 = L.belly.y + (L.back.y - L.belly.y) * 0.22;
    const y1 = L.back.y - (L.back.y - L.belly.y) * 0.08;
    const z0 = sc.holder.position.z + 2;
    const ray = new THREE.Ray();
    for (let r = r0; r > r0 * 0.4 && out.length < count; r *= 0.92) {
      out.length = 0;
      for (let tries = 0; out.length < count && tries < 200; tries++) {
        ray.set(v3(lerp(x0, x1, rng()), lerp(y0, y1, rng()), z0), v3(0, 0, -1));
        const h = sc.proxy.hit(ray, -9, 1e9);
        if (!h || !BODY.has(petRegionOfName(h.boneName))) continue;
        const rr = r * (0.9 + rng() * 0.2);
        if (out.some((q) => q.p.distanceTo(h.point) < (q.r + rr) * 1.1)) continue;
        out.push({ p: h.point, n: h.normal, bone: h.bone, r: rr });
      }
    }
    return out;
  }
  const r0 = Math.max(0.012, Math.min(S.len * 0.1, (L.back.y - L.belly.y) * 0.22));
  const spots = bodyPoints(7, r0);
  // (poussière claire sur un poil foncé, plus sombre sur un poil clair : elle se voit toujours)
  const patches = spots.map((q) => ({ ...q, dirt: 1, mesh: decal(q.p, q.n, q.bone, q.r, dustTex) }));
  const n0 = Math.max(1, patches.length);
  const MAX = 1.4;
  const OVER_RATE = 0.0002;
  const rule = justRule(ctx, { lo: 1 - 0.5 / n0, hi: 1.05, max: MAX, slack: 0.3 });
  let over = 0;
  let nextMark = 0;
  const marks = [];
  let grace = 0;
  let good = 0;
  let bad = 0;
  let last = null;
  let lastHit = null;
  let touchT = 9;
  let shine = 0;
  let saidHappy = false;
  let lastRub = 0;
  const pinkTex = keep(softDot('240,140,165'));
  // ---- la brosse, sous le doigt, sur son poil
  const brush = petBrush(keep, Math.max(0.6, Math.min(1.25, S.len / 0.7)));
  brush.visible = false;
  sc.scene.add(brush);
  // ---- de petites touffes de poil qui s'envolent (couleur de sa robe)
  const tuftTex = keep(softDot('255,255,255', 32));
  const coat = new THREE.Color(ctx.col?.coat ?? '#c8a070');
  ctx.hint(t('mg_brush_hint'));
  const clean = () => 1 - patches.reduce((sum, q) => sum + q.dirt, 0) / n0;
  const value = () => Math.min(MAX, clean() + over);
  const stop = () => { if (!ctx.done) rule.finish(value()); };
  ctx.stopButton(stop);
  // (le sens du poil à l'écran : de la tête vers la queue)
  const hairDir = () => {
    const h = sc.project(L.withers);
    const q = sc.project(L.croup);
    const d = Math.hypot(q.x - h.x, q.y - h.y) || 1;
    return { x: (q.x - h.x) / d, y: (q.y - h.y) / d };
  };
  const GRACE_PX = () => {
    const h = sc.project(L.withers);
    const q = sc.project(L.croup);
    return Math.hypot(q.x - h.x, q.y - h.y) * 1.2;
  };
  const wp = v3();
  const proj = (q) => {
    q.mesh.getWorldPosition(wp);
    const c = sc.project(wp);
    return { x: c.x, y: c.y, r: sc.projectRadius(wp, q.r * 1.1) };
  };

  function tufts(at, nrm, n = 2) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: tuftTex, color: coat.clone().multiplyScalar(0.9 + Math.random() * 0.25), transparent: true, depthWrite: false });
      const spr = new THREE.Sprite(mat);
      const s = Math.max(0.006, S.len * 0.02) * (0.7 + Math.random() * 0.6);
      spr.scale.set(s, s, s);
      spr.position.copy(at).addScaledVector(nrm, 0.01);
      sc.spawn(spr, { life: 0.9, v: nrm.clone().multiplyScalar(0.15).add(v3((Math.random() - 0.5) * 0.15, 0.1 + Math.random() * 0.1, (Math.random() - 0.5) * 0.1)), grav: 0.25 });
    }
  }

  function rub(p) {
    if (!last) {
      last = p;
      return;
    }
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    const hd = hairDir();
    const withHair = dx * hd.x + dy * hd.y > d * 0.35;
    const hit = sc.pickAnimal(p.x, p.y);
    if (hit) {
      lastHit = hit;
      touchT = 0;
    }
    let touched = false;
    for (const q of patches) {
      if (q.dirt <= 0) continue;
      const c = proj(q);
      if (distToSegment(c.x, c.y, last.x, last.y, p.x, p.y) > c.r + 14) continue;
      touched = true;
      q.dirt -= d * 0.0062 * (withHair ? 1 : 0.55);
      q.mesh.material.opacity = Math.max(0, q.dirt);
      if (Math.random() < 0.4 && hit) tufts(hit.point, hit.normal, 1);
      if (q.dirt <= 0.15) {
        q.dirt = 0;
        q.mesh.visible = false;
        fx.burst(c.x, c.y, '✨', 3, { speed: 80, size: 16 });
      }
    }
    if (touched) {
      lastRub = ctx.time;
      if (withHair) good += d;
      else bad += d;
      grace = GRACE_PX();
      if (rule.state() === 'low') {
        if (bad > 260 && bad > good) ctx.hint(t('mg_brush_dir'), 'warn');
        else if (withHair && good > 120) ctx.hint(t('mg_brush_good'), 'good');
      }
      if (!saidHappy && clean() > 0.5) {
        saidHappy = true;
        happySound(sc);
      }
    } else if (value() >= rule.lo && hit && BODY.has(hit.region)) {
      // Dans la zone (« C'est bon ! ») : brosser encore le poil propre irrite la peau.
      const free = Math.min(grace, d);
      grace -= free;
      over += (d - free) * OVER_RATE;
      if (value() > rule.hi && over >= nextMark) {
        nextMark = over + 0.06;
        marks.push(decal(hit.point, hit.normal, hit.bone, Math.max(0.008, S.len * 0.035), pinkTex, 0xffffff, 0.75));
        fx.float(p.x, p.y - 20, '💢', 20);
        m.annoyed = 0.8;
        m.flinch = 0.6;
      }
    } else if (hit && BODY.has(hit.region) && Math.random() < 0.25) tufts(hit.point, hit.normal, 1);
    last = p;
    rule.show(value());
    if (value() >= MAX) stop();
  }

  return {
    peek: () => ({
      value: value(), lo: rule.lo, hi: rule.hi, max: MAX, clean: clean(), over, n: n0, marks: marks.length,
      dirt: lightDirt ? 'light' : 'dark', contrast: lightDirt ? (0.65 + 0.05) / (coatLum + 0.05) : (coatLum + 0.05) / (0.045 + 0.05),
      patches: patches.filter((q) => q.dirt > 0).map((q) => ({ ...proj(q), dirt: q.dirt })),
      hair: hairDir(),
    }),
    down(p) {
      last = p;
      grace = 0;
      const hit = sc.pickAnimal(p.x, p.y);
      if (hit) {
        lastHit = hit;
        touchT = 0;
      }
    },
    move(p, down) { if (down) rub(p); },
    up() {
      last = null;
      grace = 0;
    },
    key(code, down) { if (down && (code === 'Space' || code === 'Enter' || code === 'NumpadEnter')) stop(); },
    update(dt) {
      touchT += dt;
      if (ctx.done || clean() >= 0.999) shine += dt;
      const st = rule.state();
      // Lui : détendu et content quand on le brosse bien ; trop : oreilles en arrière.
      m.happy = st === 'high' ? 0 : ctx.pointer.down ? 0.9 : 0.45;
      m.ears = st === 'high' ? 'back' : 'forward';
      m.look = sc.camera.position;
      m.lookAmt = 0.3;
      m.chew = sp === 'rabbit' && ctx.pointer.down && st !== 'high' ? 0.25 : 0;
      if (sp === 'cat' && ctx.pointer.down && st !== 'high' && Math.random() < dt * 0.6) purr(1.2, 0.04);
      // la brosse sur son poil, là où est le doigt
      const show = ctx.pointer.down && lastHit && touchT < 0.5 && !ctx.done;
      brush.visible = !!show;
      if (show) {
        const n = lastHit.normal.clone().normalize();
        brush.position.copy(lastHit.point).addScaledVector(n, 0.002);
        // (+y de la brosse : la normale ; son manche vers nous et vers la droite)
        const handle = v3(0.6, 0.5, 0.6).addScaledVector(n, -v3(0.6, 0.5, 0.6).dot(n)).normalize();
        const z = new THREE.Vector3().crossVectors(handle, n).normalize();
        brush.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(handle, n, z));
      }
    },
    draw(g) {
      if (!sc.ready) return;
      const st = rule.state();
      // Sens du poil (tant qu'il reste des taches) : des flèches ‹‹ sur son flanc
      if (!ctx.done && clean() < 0.999) {
        g.save();
        g.globalAlpha = 0.5 + Math.sin(ctx.time * 3) * 0.15;
        g.font = '900 22px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        // (blanches sur un poil foncé, brun sombre sur un poil clair : elles se voient toujours)
        g.fillStyle = coatLum > 0.3 ? '#4a2e18' : '#ffffff';
        g.strokeStyle = coatLum > 0.3 ? 'rgba(255,250,240,0.8)' : 'rgba(50,32,18,0.6)';
        g.lineWidth = 3.5;
        for (const k of [0.25, 0.5, 0.75]) {
          const c = sc.project(L.withers.clone().lerp(L.croup, k).lerp(L.belly, 0.35).add(v3(0, 0, S.w * 0.5)));
          g.strokeText('‹‹', c.x, c.y);
          g.fillText('‹‹', c.x, c.y);
        }
        g.restore();
      }
      // Les taches qui restent : un cercle pointillé qui palpite, si l'on n'en a pas frotté depuis un moment
      if (!ctx.done && clean() < 0.999 && ctx.time - lastRub > 3.5 && !ctx.pointer.down) {
        g.save();
        g.globalAlpha = 0.55 + Math.sin(ctx.time * 5) * 0.3;
        g.strokeStyle = coatLum > 0.3 ? '#4a2e18' : '#ffffff';
        g.lineWidth = 3;
        g.setLineDash([6, 5]);
        for (const q of patches) {
          if (q.dirt <= 0) continue;
          const c = proj(q);
          g.beginPath();
          g.arc(c.x, c.y, Math.max(14, c.r * 1.25), 0, Math.PI * 2);
          g.stroke();
        }
        g.restore();
      }
      if (clean() >= 0.999 && st !== 'high') {
        for (let i = 0; i < 4; i++) {
          const c = sc.project(L.body.clone().add(v3(Math.cos(shine * 2 + i * 1.6) * S.len * 0.25, Math.sin(shine * 3 + i) * S.h * 0.15, S.w * 0.5)));
          g.save();
          g.globalAlpha = 0.8;
          g.font = `18px ${EMOJI}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = '#000';
          g.fillText('✨', c.x, c.y);
          g.restore();
        }
      }
      const hx = sc.project(L.head).x;
      rule.dial(g, value(), hx > 200 ? ctx.view.x0 + 46 : ctx.view.x1 - 46, ctx.view.y0 + 50);
    },
    destroy() {
      for (const q of patches) q.mesh.parent?.remove(q.mesh);
      for (const mk of marks) mk.parent?.remove(mk);
      sc.scene.remove(brush);
      keep.dispose();
    },
  };
}

/** Région d'après l'os (sans importer la scène : même règle que petStage.js petRegionOf). */
function petRegionOfName(bone = '') {
  if (/^ear/.test(bone)) return 'ear';
  if (/^(head|jaw|tongue|lid|eye|nose)/.test(bone)) return 'head';
  if (/^neck/.test(bone)) return 'neck';
  if (/^tail/.test(bone)) return 'tail';
  if (/^(scap|humerus)/.test(bone)) return 'shoulder';
  if (/^(femur|haunch)/.test(bone)) return 'hip';
  if (/^(radius|metacarpus|toes|tibia|metatarsus|htoes)/.test(bone)) return 'leg';
  return bone ? 'body' : '';
}

/** Notre épaule, pour une main posée en `at` (petHand.js shoulderFor : le bras entre par le bas de l'image). */
export function shoulderOf(sc, at = sc.camTarget) {
  return shoulderFor(sc, at);
}

/**
 * La taille de notre main (une main d'enfant de 12 cm) près de cet animal : plus petite près des tout petits (chiot
 * chihuahua, lapin nain : la moitié), sinon elle les cacherait tout entiers.
 */
export function handSize(L) {
  const m = (L.size.len + L.size.h) / 2;
  return Math.max(0.45, Math.min(1, 0.2 + 1.5 * m));
}

/** Les soins 3D des animaux de compagnie, par espèce (branchés dans CARE3D_GAMES : src/ui/minigames/care3d.js). */
export const PET_CARE3D_GAMES = {
  dog: { feed: petFeed3dGame, water: petWater3dGame, treat: petTreat3dGame, pet: petPet3dGame, brush: petBrush3dGame, nails: petNails3dGame, play: petPlay3dGame, wash: petWash3dGame },
  cat: { feed: petFeed3dGame, water: petWater3dGame, treat: petTreat3dGame, pet: petPet3dGame, brush: petBrush3dGame, nails: petNails3dGame, clean: petClean3dGame },
  rabbit: { feed: petFeed3dGame, water: petWater3dGame, treat: petTreat3dGame, pet: petPet3dGame, brush: petBrush3dGame, nails: petNails3dGame, play: petPlay3dGame, clean: petClean3dGame },
};
