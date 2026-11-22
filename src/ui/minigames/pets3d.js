// Les soins des animaux de compagnie en 3D (chien, chat, lapin), sur le vrai animal du joueur dans son décor
// (src/game/care/petStage.js ; décors : home.js pour le chien et le chat, hutch.js pour le lapin).
//
// - Nourrir et donner à boire : la logique est celle des jeux dessinés (food.js pourGame : remplir juste ce qu'il
//   faut, jusqu'à la ligne 🎯), seule l'image change : notre main tient le sac de croquettes (ou de granulés) qui se
//   penche, les croquettes tombent une à une dans sa gamelle à son nom et le tas monte ; la carafe verse un filet
//   d'eau. Il attend assis en regardant la gamelle (le chien remue la queue), puis il vient manger, ou boire.

import * as THREE from 'three';
import { feedGame, waterGame } from './food.js';
import { withLogic, sideGauge, bubble } from './care3d.js';
import { kibbleBag, kibbleRain, pitcher, FOODS } from '../../game/care/petProps.js';
import { audio } from '../../game/audio.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
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
  const play = withLogic(ctx, water ? waterGame : feedGame, () => sc.project(bowlW().add(v3(0, D.r * 0.8, 0))));
  const s0 = play.peek();
  const mark = bowl.setMark(s0.lo, s0.hi, s0.target);
  // La source : le sac tenu par notre main, ou la carafe, au-dessus de la gamelle, de l'autre côté de sa tête.
  const size = Math.max(0.55, Math.min(1.25, D.r / 0.09));
  const src = water ? pitcher({ size, hand: P.hand, shoulder: () => shoulderOf(sc) }) : kibbleBag({ kind: sp, size, hand: P.hand, shoulder: () => shoulderOf(sc) });
  sc.scene.add(src.group);
  const srcAt = bowlW().add(v3(D.r * 0.1, D.r * 0.9 + 0.05 * size, -D.r * 0.2));
  src.group.position.copy(srcAt);
  src.setTilt(0.1);
  const food = FOODS[sp] ?? FOODS.dog;
  const rain = water ? null : kibbleRain(food, 70);
  if (rain) sc.scene.add(rain.mesh);
  const m = sc.mood;
  m.posture = WAIT[sp];
  m.look = bowlW().add(v3(0, D.r, 0));
  m.lookAmt = 0.8;
  m.ears = 'forward';
  m.happy = 0.4;
  // Cadrage : sa tête (assis, il lève la tête), la gamelle, la source au-dessus ; vu de face, un peu de haut.
  const frameWait = (now = false) => {
    const b = bowlW();
    sc.frame([L.muzzle, L.poll, ...L.ears, L.chest, L.croup, L.paws[0], L.paws[1], b.clone().add(v3(-D.r, -D.depth, 0)), b.clone().add(v3(D.r * 1.3, -D.depth, D.r)), srcAt.clone().add(v3(0.22 * size, 0.2 * size, 0))], { dir: [0.55, 0.3, 1], pad: 1.04, now, raise: -0.22 });
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
            rain.spawn(p, v3(-0.15 - Math.random() * 0.15, -0.1, (Math.random() - 0.5) * 0.12), food.size * Math.pow(D.r / 0.09, 0.35));
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
        sideGauge(g, Math.min(ctx.view.x1 - 22, b.x + 30), b.y, h, s.value, s.lo, s.hi, { icon: water ? '💧' : '🥣', time: ctx.time });
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
    const e = eatAt;
    const A = (p) => p.clone().add(v3(ahead, 0, 0));
    sc.frame([A(L.poll), A(L.withers), A(L.croup), A(L.tail), ...L.ears.map(A), ...L.paws.map(A), e.clone().add(v3(-D.r, -D.depth, 0)), e.clone().add(v3(D.r, -D.depth, D.r))], { dir: [0.5, 0.32, 1], pad: 1.2, half: 0.6 });
  }
}

/**
 * Notre épaule : près de la caméra, à droite et un peu plus bas (le bras entre dans l'image par le bord droit, comme
 * quand on tend la main ; il ne traverse pas la scène).
 */
export function shoulderOf(sc) {
  const c = sc.camera;
  const right = v3(1, 0, 0).applyQuaternion(c.quaternion);
  const up = v3(0, 1, 0).applyQuaternion(c.quaternion);
  const fwd = v3(0, 0, -1).applyQuaternion(c.quaternion);
  const d = c.position.distanceTo(sc.camTarget);
  return c.position.clone().addScaledVector(fwd, d * 0.35).addScaledVector(right, d * 0.45).addScaledVector(up, d * 0.12);
}

/** Les soins 3D des animaux de compagnie, par espèce (branchés dans CARE3D_GAMES : src/ui/minigames/care3d.js). */
export const PET_CARE3D_GAMES = {
  dog: { feed: petFeed3dGame, water: petWater3dGame },
  cat: { feed: petFeed3dGame, water: petWater3dGame },
  rabbit: { feed: petFeed3dGame, water: petWater3dGame },
};
