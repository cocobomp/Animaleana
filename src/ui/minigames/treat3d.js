// La friandise du cheval, en 3D : la logique est celle du jeu dessiné (food.js treatGame : attendre qu'il soit sage,
// donner juste le bon nombre, sa préférée le rend fou de joie). Ici, notre main tendue, paume ouverte, avec la carotte
// ou la pomme ; il s'agite (tête qui bouge, oreilles qui tournent, il gratte du pied), puis il se calme, oreilles en
// avant, et la prend du bout des lèvres ; il la croque en hochant la tête.

import * as THREE from 'three';
import { treatGame, drawCountZone } from './food.js';
import { withLogic } from './care3d.js';
import { treatModel, handModel, aimHand } from '../../game/care/props.js';
import { nicker, snort } from './feed3d.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TREAT_ICON = { carrot: '🥕', apple: '🍎' };

export function treat3dGame(ctx) {
  const sc = ctx.scene;
  sc.decor.layout('rest');
  const m = sc.mood;
  const L = sc.marks;
  const muzzle = L.muzzle.clone();
  // Main au repos : devant le bout du nez, vers nous et un peu plus bas.
  const rest = muzzle.clone().add(v3(0.12, -0.14, 0.5));
  const play = withLogic(ctx, treatGame, () => sc.project(sc.live('muzzle').add(v3(0, 0.1, 0))));
  // Notre main (couleur de peau de l'avatar), et les deux friandises.
  const keep = [];
  const own = (x) => {
    keep.push(x);
    return x;
  };
  const avatar = ctx.opts?.avatar ?? sc.game?.profile?.avatar ?? {};
  const hand = handModel(own, { skin: colorOf(avatar.skin, 0xf0c29a), sleeve: colorOf(avatar.top ?? avatar.shirt, 0x3f7fd0) });
  hand.scale.setScalar(1.15);
  sc.scene.add(hand);
  const treats = { carrot: treatModel('carrot', own), apple: treatModel('apple', own) };
  for (const tm of Object.values(treats)) {
    tm.position.set(0.035, 0.035, 0);
    hand.add(tm);
  }
  treats.carrot.rotation.set(0, 0.3, 0);
  const head = [L.muzzle, L.poll, ...L.ears, L.withers.clone().lerp(L.poll, 0.55)];
  sc.frame([...head, rest.clone().add(v3(0, -0.08, 0.1)), rest.clone().add(v3(-0.3, 0, 0))], { dir: [0.62, 0.12, 1], pad: 1.28, now: true });

  let given = 0;
  let pen = 0;
  let reach = 0; // 0 main au repos, 1 contre sa bouche
  let reachT = -1; // temps depuis le don (animation)
  let back = 0;
  let wanderAt = 0;
  const wander = v3();
  let held = 'apple';
  let snortIn = 1;
  m.ears = 'forward';

  return {
    peek: () => play.peek(),
    down: (p) => play.down(p),
    key: (c, d) => play.key(c, d),
    update(dt) {
      play.update(dt);
      const s = play.peek();
      held = s.fav ? s.kind : 'apple';
      if (s.given > given) {
        given = s.given;
        reachT = 0;
        if (s.given <= s.n) nicker(sc);
      }
      if (s.penalties > pen) {
        pen = s.penalties;
        back = 1;
        m.annoyed = 0.5;
        sc.shake = 0.3;
      }
      back = Math.max(0, back - dt * 2.5);
      // La main : elle avance jusqu'à sa bouche, il prend la friandise, elle revient.
      if (reachT >= 0) {
        reachT += dt;
        reach = reachT < 0.45 ? reachT / 0.45 : reachT < 0.75 ? 1 : Math.max(0, 1 - (reachT - 0.75) / 0.4);
        if (reachT > 1.2) reachT = -1;
      } else reach = 0;
      const taken = reachT >= 0.55 && reachT < 1.6;
      const target = sc.live('muzzle').add(v3(0.04, -0.06, 0.04));
      const pos = rest.clone().lerp(target, smooth(reach)).add(v3(0.05, -0.05, 0.18).multiplyScalar(back));
      hand.position.copy(pos);
      // paume vers le haut, le bras qui vient de nous (en bas à droite de l'image), les doigts vers sa bouche
      aimHand(hand, shoulder(sc), target.clone().lerp(pos, 0.3).add(v3(0, 0.05, 0)), true);
      for (const [k, tm] of Object.entries(treats)) tm.visible = k === held && !taken && !(ctx.done && s.given >= s.max);
      // Le cheval : agité (il regarde partout, hoche, gratte), puis sage (il regarde la main, oreilles en avant).
      const calm = s.state === 'calm' || s.state === 'eat';
      if (s.state === 'wiggle' && !ctx.done) {
        wanderAt -= dt;
        if (wanderAt <= 0) {
          wanderAt = 0.5 + Math.random() * 0.6;
          wander.copy(rest).add(v3((Math.random() - 0.5) * 1.2, (Math.random() - 0.2) * 0.8, (Math.random() - 0.5) * 1.0));
          if (Math.random() < 0.5) m.nod = 0.7;
        }
        m.look = wander;
        m.lookAmt = 1;
        m.ears = Math.sin(ctx.time * 3) > 0 ? 'forward' : null;
        m.lift = Math.sin(ctx.time * 2.2) > 0.75 ? 0 : null; // (il gratte du pied, impatient)
        m.liftMax = 0.3;
      } else {
        m.look = hand.position;
        m.lookAmt = 1;
        m.ears = 'forward';
        m.lift = null;
      }
      m.nuzzle = reach * 0.6;
      m.chew = s.state === 'eat' ? 1 : Math.max(0, m.chew - dt);
      if (calm && s.state === 'eat' && reachT > 0.8 && Math.random() < dt * 1.5) m.nod = Math.max(m.nod, 0.4);
      snortIn -= dt;
      if (snortIn <= 0) {
        snortIn = s.state === 'wiggle' ? 1.5 + Math.random() * 2 : 5;
        snort(sc, s.state === 'wiggle');
      }
    },
    draw(g) {
      if (!sc.ready) return;
      const s = play.peek();
      // Les friandises données, dans le cadre vert (comme le jeu dessiné).
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.86)';
      g.beginPath();
      g.roundRect(ctx.view.x0 + 8, ctx.view.y0 + 8, 34 * s.max + 22, 46, 16);
      g.fill();
      g.restore();
      drawCountZone(g, ctx.view.x0 + 30, ctx.view.y0 + 31, s.given, s.n, s.max, TREAT_ICON[held] ?? '🍎');
    },
    destroy() {
      sc.scene.remove(hand);
      for (const x of keep) x.dispose?.();
    },
  };
}

const smooth = (k) => k * k * (3 - 2 * k);

/** Notre épaule : sous la caméra, un peu à droite (le bras entre dans l'image par le bas). */
function shoulder(sc) {
  const c = sc.camera;
  const right = v3(1, 0, 0).applyQuaternion(c.quaternion);
  const up = v3(0, 1, 0).applyQuaternion(c.quaternion);
  const fwd = v3(0, 0, -1).applyQuaternion(c.quaternion);
  return c.position.clone().addScaledVector(right, 0.28).addScaledVector(up, -0.42).addScaledVector(fwd, 0.15);
}

function colorOf(c, fallback) {
  if (typeof c === 'number') return c;
  if (typeof c === 'string' && /^#?[0-9a-f]{6}$/i.test(c)) return parseInt(c.replace('#', ''), 16);
  return fallback;
}
