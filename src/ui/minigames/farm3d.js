// Nourrir, abreuver et donner une friandise aux moutons, chèvres et vaches, en 3D (la bergerie, la chèvrerie,
// l'étable : src/game/care/barn.js). La logique est celle des jeux dessinés (food.js : verser jusqu'à la ligne 🎯,
// le robinet, la friandise quand il est calme) : la note et les textes ne changent pas, seule l'image change. Le
// râtelier se remplit vraiment de foin (des brassées tombent de notre main), l'abreuvoir se remplit au tuyau ; il
// regarde ce qu'on lui prépare, bêle ou meugle doucement, puis mange au râtelier ou boit vraiment, en mâchant.

import * as THREE from 'three';
import { feedGame, waterGame } from './food.js';
import { withLogic, sideGauge, bubble } from './care3d.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Sa voix, doucement (bêlement, meuglement), et un petit coup de tête content. */
export function callOut(sc, mood = 'happy') {
  sc.mood.call = 1;
  sc.mood.callMood = mood;
}

// ---------------------------------------------------------------- nourrir : le râtelier

export function farmFeed3dGame(ctx) {
  const sc = ctx.scene;
  const P = sc.decor.props;
  const rack = P.rack;
  sc.decor.layout('feed');
  rack.setFill(0);
  const L = sc.marks;
  const u = L.u;
  // (les mots et les 😋 du jeu dessiné : au foin pendant qu'on verse, à sa bouche quand il mange)
  let play = null;
  const anchor = () => sc.project(ctx.done ? sc.live('muzzle').add(v3(0, 0.12 * u, 0)) : rack.barsAt(Math.min(1, play?.peek().value ?? 0) * 0.9 + 0.1).add(v3(0, 0.05 * u, 0)));
  play = withLogic(ctx, feedGame, anchor);
  const s0 = play.peek();
  rack.setMark(s0.lo, s0.hi, s0.target);
  const m = sc.mood;
  m.ears = 'forward';
  m.look = rack.barsAt(0.4);
  m.lookAmt = 0.8;
  // (le râtelier entier, la jauge à côté ; lui debout devant, de la tête aux sabots de devant, et son dos)
  const frameNow = (now) => {
    const pts = [rack.barsAt(0), rack.barsAt(1.1), rack.mouthAt().add(v3(0, -rack.trough * 1.1, 0)), rack.barsAt(1).add(v3(0, 0, rack.w * 0.55)), rack.barsAt(1).add(v3(0, 0, -rack.w * 0.55)),
      L.muzzle, L.poll, ...L.ears, L.withers, L.chest, L.hooves[0], L.hooves[1], L.back];
    sc.frame(pts, { dir: [-0.22, 0.3, 1], pad: 1.06, now });
  };
  frameNow(true);
  let saidOk = false;
  let saidIn = false;
  let eatT = 0;
  return {
    peek: () => play.peek(),
    down: (p) => play.down(p),
    up: (p) => play.up(p),
    key: (c, d) => play.key(c, d),
    update(dt) {
      play.update(dt);
      const s = play.peek();
      rack.setFill(s.level);
      rack.pour(s.pouring && !ctx.done);
      if (!saidIn && s.level > 0.08) {
        saidIn = true;
        callOut(sc);
        m.nod = 0.8;
      }
      if (!saidOk && s.level >= s.lo) {
        saidOk = true;
        m.nod = 1;
      }
      if (!ctx.done) {
        // Il regarde le foin arriver, oreilles en avant, impatient (il hoche la tête).
        m.look = rack.barsAt(Math.max(0.2, s.level * 0.8));
        m.lookAmt = s.pouring ? 1 : 0.75;
        if (s.pouring && Math.random() < dt * 0.4) m.nod = Math.max(m.nod, 0.5);
        m.wag = s.pouring ? 0.4 : 0;
      } else {
        // Il mange au râtelier : tête baissée, il tire le foin et mâche (cadré au-dessus de la carte de fin).
        if (eatT === 0) {
          const bite = rack.bite(v3());
          sc.frame([rack.barsAt(0.9), rack.mouthAt().add(v3(0, -rack.trough, rack.w * 0.45)), rack.mouthAt().add(v3(0, -rack.trough, -rack.w * 0.45)), bite.clone().add(v3(0.05 * u, -0.05 * u, 0)), L.withers, L.poll, L.chest, L.back],
            { dir: [-0.38, 0.36, 1], pad: 1.1, half: 0.5 });
        }
        eatT += dt;
        m.eat = s.level > 0.02;
        m.reachY = rack.bite(v3()).y;
        m.lookAmt = Math.max(0, m.lookAmt - dt);
        m.chew = m.eat ? 0 : Math.min(1, eatT);
        m.wag = 0.5;
        rack.nibble(m.eat && eatT > 0.8);
        // (il mange : la tête reste dans le foin, il ne s'interrompt pas pour bêler)
      }
    },
    draw(g) {
      if (!sc.ready) return;
      const s = play.peek();
      if (!ctx.done) {
        // La jauge à côté du râtelier (même bande verte que la jauge du haut).
        const b = sc.project(rack.barsAt(0));
        const t = sc.project(rack.barsAt(1));
        const h = Math.max(60, Math.min(150, b.y - t.y));
        const x = Math.min(ctx.view.x1 - 24, Math.max(b.x, t.x) + 40);
        sideGauge(g, x, b.y, h, s.value, s.lo, s.hi, { icon: '🌾', time: ctx.time });
      } else {
        const p = sc.project(sc.live('poll').add(v3(0, 0.25 * u, 0)));
        if (!p.behind) bubble(g, p.x, p.y - 6, '😋', { size: 18 });
      }
    },
    destroy() {
      rack.pour(false);
      rack.nibble(false);
    },
  };
}

// ---------------------------------------------------------------- abreuver : l'abreuvoir

export function farmWater3dGame(ctx) {
  const sc = ctx.scene;
  const P = sc.decor.props;
  const tr = P.trough;
  sc.decor.layout('water');
  tr.setLevel(0);
  const L = sc.marks;
  const u = L.u;
  const at = (x, y, z) => tr.group.localToWorld(v3(x, y, z));
  tr.group.updateWorldMatrix(true, false);
  const anchor = () => sc.project(at(0, 0.05 * u, 0));
  const play = withLogic(ctx, waterGame, anchor);
  const m = sc.mood;
  m.ears = 'forward';
  m.look = at(0, 0, 0);
  m.lookAmt = 0.8;
  const tap = P.tap.group.getWorldPosition(v3());
  sc.frame([at(tr.r, -tr.r * 1.1, tr.len / 2), at(-tr.r, -tr.r * 1.1, -tr.len / 2), at(-tr.r, 0, tr.len / 2), tap.clone().add(v3(0, 0.1, 0)), L.muzzle, L.poll, ...L.ears, L.withers.clone().lerp(L.poll, 0.4)],
    { dir: [-0.3, 0.42, 1], pad: 1.12, now: true });
  const s0 = play.peek();
  const mark = tr.setMark(s0.lo, s0.hi, s0.target);
  tr.splashAt(tr.group.worldToLocal(P.tap.tipWorld()));
  let drinkT = 0;
  let saidIn = false;
  return {
    peek: () => play.peek(),
    down: (p) => play.down(p),
    up: (p) => play.up(p),
    key: (c, d) => play.key(c, d),
    update(dt) {
      play.update(dt);
      const s = play.peek();
      tr.setLevel(ctx.done && drinkT > 0 ? tr.level : s.level);
      const flow = s.pouring ? 0.4 + 0.6 * Math.min(1, s.value * 3) : 0;
      P.tap.setFlow(flow, (tr.group.localToWorld(v3(0, tr.surfaceY(), 0)).y - P.tap.group.position.y) / P.tap.group.scale.y);
      tr.flow(flow);
      if (!saidIn && s.level > 0.2) {
        saidIn = true;
        m.nod = 0.8;
        callOut(sc);
      }
      if (!ctx.done) {
        m.look = at(0, tr.surfaceY(), 0);
        m.lookAmt = s.pouring ? 1 : 0.7;
      } else {
        if (drinkT === 0) sc.frame([at(tr.r, -tr.r, tr.len / 2), at(-tr.r, -tr.r, -tr.len / 2), L.withers, L.poll, L.muzzle, L.chest], { dir: [-0.35, 0.36, 1], pad: 1.1, half: 0.5 });
        drinkT += dt;
        if (drinkT > 0.5) {
          // (la bouche dans l'eau)
          m.eat = true;
          m.reachY = at(0, tr.surfaceY(), 0).y + 0.01;
          m.lookAmt = Math.max(0, m.lookAmt - dt);
          m.wag = 0.3;
          if (drinkT > 1.5) tr.drink(dt);
        }
      }
    },
    draw(g) {
      if (!sc.ready || ctx.done) return;
      const s = play.peek();
      const b = sc.project(at(0, -tr.r, tr.len / 2));
      const t = sc.project(at(0, 0, tr.len / 2));
      const h = Math.max(60, Math.min(140, (b.y - t.y) * 1.6));
      sideGauge(g, ctx.view.x1 - 24, b.y, h, s.value, s.lo, s.hi, { icon: '💧', time: ctx.time });
      // 🎯 au bout de la ligne, côté allée
      const m2 = sc.project(at(mark.r * 0.2, mark.y, tr.len / 2 + 0.04));
      g.save();
      g.font = '20px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#000';
      g.fillText('🎯', m2.x + 14, m2.y);
      g.restore();
    },
    destroy() {
      P.tap.setFlow(0);
      tr.flow(0);
    },
  };
}
