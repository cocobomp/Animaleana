// Nourrir et abreuver le cheval, en 3D (src/game/care/stage.js) : la logique est celle des jeux dessinés
// (ration.js : le filet bien plein puis une petite mesure de granulés ; food.js : le seau rempli juste ce qu'il
// faut), seule l'image change : le vrai cheval dans son box, le filet qui se remplit vraiment de foin, la pelle qui
// verse les granulés dans la mangeoire, le robinet qui remplit le seau ; il tourne la tête vers ce qu'on lui
// prépare, hennit doucement, puis mange (ou boit) vraiment.

import * as THREE from 'three';
import { audio } from '../../game/audio.js';
import { rationGame, RATION } from './ration.js';
import { waterGame } from './food.js';
import { withLogic, sideGauge, bubble } from './care3d.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Petit souffle de contentement par les naseaux, et parfois un hennissement doux (« nicker »). */
export function snort(scene, sound = true) {
  const nose = scene.live('nose');
  const head = scene.live('head');
  if (!nose || !head) return;
  const dir = nose.clone().sub(head).normalize().add(v3(0, -0.4, 0)).normalize();
  scene.puff(nose, dir, { n: 6 });
  if (sound) {
    const c = audio.ready?.();
    if (c) {
      try {
        audio.burst(audio.sfx, { t: c.currentTime, dur: 0.35, gain: 0.07, attack: 0.02, filter: { type: 'bandpass', f: 520, q: 0.7 } });
      } catch {
        /* pas de son, pas grave */
      }
    }
  }
}

/** Hennissement doux de l'animal de la scène. */
export function nicker(scene) {
  audio.animal?.(scene.a?.species ?? 'horse', 'happy', scene.a?.id ?? null);
}

// ---------------------------------------------------------------- nourrir : la ration

export function ration3dGame(ctx) {
  const sc = ctx.scene;
  const decor = sc.decor;
  const P = decor.props;
  decor.layout('feed');
  // Point des effets : le filet pendant le foin, la mangeoire pendant les granulés.
  let stage = 'hay';
  const anchor = () => sc.project(stage === 'hay' ? P.net.bite(v3()) : P.feeder.group.getWorldPosition(v3()).add(v3(0, 0.12, 0)));
  const play = withLogic(ctx, rationGame, anchor);
  const m = sc.mood;
  m.ears = 'forward';
  m.look = P.net.bite(v3());
  m.lookAmt = 0.8;
  frameFor('hay', true);
  let saidOk = false;
  let saidGrain = false;
  let eatT = 0;
  let snortIn = 1.5;

  function frameFor(which, now = false) {
    const L = sc.marks;
    const net = P.net.group;
    net.updateWorldMatrix(true, false);
    const fd = P.feeder.group.getWorldPosition(v3());
    // (le filet entier, et un peu de place à sa droite pour la jauge ; la tête, les oreilles, le haut de l'encolure)
    const netPts = [v3(0, 0.12, 0), v3(0, -0.8, 0), v3(0, -0.4, 0.32), v3(0, -0.4, -0.3), v3(0, -0.45, 0.75)].map((p) => net.localToWorld(p));
    const head = [L.muzzle, L.poll, ...L.ears, L.withers.clone().lerp(L.poll, 0.45)];
    if (which === 'hay') sc.frame([...netPts, ...head, fd.clone().add(v3(0, -0.2, 0))], { dir: [-0.5, 0.26, 1], pad: 1.08, now });
    else sc.frame([fd.clone().add(v3(0, -0.24, 0)), fd.clone().add(v3(0, 0.4, 0.25)), fd.clone().add(v3(0, -0.1, 0.7)), ...head, netPts[1]], { dir: [-0.42, 0.5, 1], pad: 1.1, now });
  }

  return {
    peek: () => play.peek(),
    down: (p) => play.down(p),
    up: (p) => play.up(p),
    key: (c, d) => play.key(c, d),
    update(dt) {
      play.update(dt);
      const s = play.peek();
      const was = stage;
      stage = s.stage;
      P.net.setFill(s.hay);
      P.net.pour(stage === 'hay' && s.pouring && !ctx.done);
      P.feeder.showScoop(stage === 'grain' && !ctx.done);
      P.feeder.pour(stage === 'grain' && s.pouring && !ctx.done);
      P.feeder.setLevel(Math.min(1, s.grain * 1.15));
      if (was !== stage) {
        frameFor(stage);
        m.look = P.feeder.group.getWorldPosition(v3()).add(v3(0, 0.25, 0));
        nicker(sc);
      }
      if (!saidOk && s.hay >= RATION.hayLo) {
        saidOk = true;
        m.nod = 1;
        snort(sc);
      }
      if (!saidGrain && stage === 'grain' && s.grain > 0.05) {
        saidGrain = true;
        nicker(sc);
      }
      // Pendant qu'on prépare : il regarde, oreilles en avant, impatient (il hoche la tête quand ça arrive).
      if (!ctx.done) {
        m.lookAmt = s.pouring ? 1 : 0.7;
        if (s.pouring && Math.random() < dt * 0.4) m.nod = Math.max(m.nod, 0.5);
      } else {
        // Il mange : le foin du filet (granulés : la tête dans la mangeoire).
        eatT += dt;
        if (s.grain > 0.02) {
          m.feeder = 1;
          m.lookAmt = Math.max(0, m.lookAmt - dt);
          m.chew = Math.min(1, eatT * 0.8);
          P.feeder.eat(dt);
        } else {
          m.look = P.net.bite(v3());
          m.lookAmt = 1;
          m.nuzzle = Math.min(1, eatT);
          m.chew = Math.min(1, eatT * 0.8);
          P.net.nibble(true);
        }
      }
      snortIn -= dt;
      if (snortIn <= 0) {
        snortIn = 4 + Math.random() * 5;
        snort(sc, false);
      }
    },
    draw(g) {
      if (!sc.ready) return;
      const s = play.peek();
      // La jauge à côté du filet ou de la mangeoire (même bande verte que la jauge du haut).
      if (stage === 'hay') {
        const net = P.net.group;
        const b = sc.project(net.localToWorld(v3(0, -0.78, 0.3)));
        const t = sc.project(net.localToWorld(v3(0, 0.0, 0.3)));
        const h = Math.max(60, Math.min(150, b.y - t.y));
        if (!ctx.done) sideGauge(g, Math.min(ctx.view.x1 - 24, b.x + 44), b.y, h, s.hay, RATION.hayLo, RATION.hayHi, { icon: '🌾', time: ctx.time });
      } else if (!ctx.done) {
        const fd = P.feeder.group;
        const b = sc.project(fd.localToWorld(v3(0, -0.2, 0.3)));
        sideGauge(g, ctx.view.x1 - 24, b.y, 100, s.grain, s.grainLo, s.grainHi, { danger: RATION.colicAt, icon: '🥣', time: ctx.time });
      }
      if (ctx.done) {
        const p = sc.project(sc.live('head').add(v3(0, 0.3, 0)));
        if (!p.behind) bubble(g, p.x, p.y - 6, '😋', { size: 18 });
      }
    },
    destroy() {
      P.net.pour(false);
      P.feeder.pour(false);
    },
  };
}

// ---------------------------------------------------------------- abreuver : le seau

export function water3dGame(ctx) {
  const sc = ctx.scene;
  const decor = sc.decor;
  const P = decor.props;
  decor.layout('water');
  const anchor = () => sc.project(P.bucket.group.getWorldPosition(v3()).add(v3(0, 0.15, 0)));
  const play = withLogic(ctx, waterGame, anchor);
  const m = sc.mood;
  m.ears = 'forward';
  m.look = P.bucket.group.getWorldPosition(v3()).add(v3(0, 0.3, 0));
  m.lookAmt = 0.8;
  const L = sc.marks;
  const bk = P.bucket.group.getWorldPosition(v3());
  const tap = P.tap.group.getWorldPosition(v3());
  sc.frame([bk.clone().add(v3(0, -0.32, 0.18)), tap.clone().add(v3(0, 0.08, 0)), L.muzzle, L.poll, ...L.ears], { dir: [-0.25, 0.32, 1], pad: 1.12, now: true });
  let drinkT = 0;
  let saidIn = false;
  let snortIn = 2;
  return {
    peek: () => play.peek(),
    down: (p) => play.down(p),
    up: (p) => play.up(p),
    key: (c, d) => play.key(c, d),
    update(dt) {
      play.update(dt);
      const s = play.peek();
      P.bucket.setLevel(ctx.done && drinkT > 0 ? P.bucket.level : s.level);
      const flow = s.pouring ? 0.4 + 0.6 * Math.min(1, s.value * 3) : 0;
      P.tap.setFlow(flow, P.bucket.group.position.y + P.bucket.surfaceY() - P.tap.group.position.y);
      P.bucket.flow(flow);
      if (!saidIn && s.level > 0.2) {
        saidIn = true;
        m.nod = 0.8;
        nicker(sc);
      }
      if (ctx.done) {
        drinkT += dt;
        if (drinkT > 0.6) {
          m.feeder = 1;
          m.lookAmt = Math.max(0, m.lookAmt - dt);
          m.chew = 0.4;
          if (drinkT > 1.6) P.bucket.drink(dt);
        }
      }
      snortIn -= dt;
      if (snortIn <= 0) {
        snortIn = 5 + Math.random() * 5;
        snort(sc, false);
      }
    },
    draw(g) {
      if (!sc.ready) return;
      const s = play.peek();
      if (!ctx.done) {
        const b = sc.project(P.bucket.group.localToWorld(v3(0, -0.3, 0.2)));
        const t = sc.project(P.bucket.group.localToWorld(v3(0, 0, 0.2)));
        const h = Math.max(60, Math.min(140, b.y - t.y));
        sideGauge(g, ctx.view.x1 - 24, b.y, h, s.value, s.lo, s.hi, { icon: '💧', time: ctx.time });
      }
    },
    destroy() {
      P.tap.setFlow(0);
    },
  };
}
