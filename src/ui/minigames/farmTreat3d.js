// La friandise des moutons, chèvres et vaches, en 3D : la logique est celle du jeu dessiné (food.js treatGame :
// attendre qu'il soit calme, donner juste le bon nombre). Notre main tendue, paume ouverte, avec sa friandise (une
// pomme verte pour le mouton, des feuilles de chou pour la chèvre, un épi de maïs pour la vache) ; il s'agite (il
// regarde partout, secoue la tête, bêle), puis il se calme, oreilles en avant, la prend du bout des lèvres et la
// mâche longuement, la queue qui frétille.

import * as THREE from 'three';
import { treatGame, drawCountZone } from './food.js';
import { withLogic } from './care3d.js';
import { handModel, aimHand, avatarHand } from '../../game/care/props.js';
import { farmTreat } from '../../game/care/barnProps.js';
import { callOut } from './farm3d.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TREAT_ICON = { sheep: '🍏', goat: '🥬', cow: '🌽' };
const smooth = (k) => k * k * (3 - 2 * k);

export function farmTreat3dGame(ctx) {
  const sc = ctx.scene;
  sc.decor.layout('rest');
  const m = sc.mood;
  const L = sc.marks;
  const u = L.u;
  const sp = ctx.a?.species ?? 'sheep';
  // Main au repos : devant le bout de son nez, vers nous et un peu plus bas (à la taille de l'animal).
  const rest = L.muzzle.clone().add(v3(0.05 + 0.1 * u, -0.06 - 0.08 * u, 0.18 + 0.22 * u));
  const play = withLogic(ctx, treatGame, () => sc.project(sc.live('muzzle').add(v3(0, 0.1 * u, 0))));
  const keep = [];
  const own = (x) => {
    keep.push(x);
    return x;
  };
  const hand = handModel(own, avatarHand(sc.game?.profile));
  hand.scale.setScalar(1.1);
  sc.scene.add(hand);
  const treat = farmTreat(sp, own);
  hand.add(treat);
  treat.position.set(0.012, sp === 'cow' ? 0.03 : 0.04, 0);
  if (sp === 'cow') treat.rotation.y = Math.PI / 2 - 0.3;
  // (toute la tête, cornes et oreilles comprises, même quand il la tourne ; la main au repos)
  const head = [L.muzzle, L.poll.clone().add(v3(0, 0.2 * u, 0)), ...L.ears.map((e) => e.clone().add(v3(0, 0.1 * u, 0))), L.withers.clone().lerp(L.poll, 0.5), L.chest, L.muzzle.clone().add(v3(0.12 * u, 0, 0))];
  sc.frame([...head, rest.clone().add(v3(0, -0.05, 0.08)), rest.clone().add(v3(-0.25, 0, 0))], { dir: [0.6, 0.14, 1], pad: 1.25, now: true });

  let given = 0;
  let pen = 0;
  let reachT = -1;
  let back = 0;
  let wanderAt = 0;
  const wander = v3();
  let callIn = 0.8;
  let chewFor = 0;
  m.ears = 'forward';
  return {
    peek: () => play.peek(),
    down: (p) => play.down(p),
    key: (c, d) => play.key(c, d),
    update(dt) {
      play.update(dt);
      const s = play.peek();
      if (s.given > given) {
        given = s.given;
        reachT = 0;
        if (s.given <= s.n) callOut(sc);
      }
      if (s.penalties > pen) {
        pen = s.penalties;
        back = 1;
        m.annoyed = 0.6;
        m.flinch = 0.7;
        sc.shake = 0.25;
      }
      back = Math.max(0, back - dt * 2.5);
      let reach = 0;
      if (reachT >= 0) {
        reachT += dt;
        reach = reachT < 0.45 ? reachT / 0.45 : reachT < 0.8 ? 1 : Math.max(0, 1 - (reachT - 0.8) / 0.4);
        if (reachT > 1.25) reachT = -1;
      }
      const taken = reachT >= 0.6;
      const target = sc.live('muzzle').add(v3(0.02 * u, -0.05 * u, 0.02));
      const pos = rest.clone().lerp(target, smooth(reach)).add(v3(0.04, -0.04, 0.16).multiplyScalar(back));
      hand.position.copy(pos);
      aimHand(hand, shoulder(sc, pos), target.clone().lerp(pos, 0.3).add(v3(0, 0.02, 0)), true);
      treat.visible = !taken || reachT < 0;
      if (reachT < 0) treat.visible = !(ctx.done && s.given >= s.max);
      if (taken && reachT < 0.7) chewFor = 3.5;
      chewFor = Math.max(0, chewFor - dt);
      // Agité : il regarde partout, secoue la tête, bêle ; calme : il regarde la main, oreilles en avant.
      if (s.state === 'wiggle' && !ctx.done) {
        wanderAt -= dt;
        if (wanderAt <= 0) {
          wanderAt = 0.45 + Math.random() * 0.6;
          wander.copy(rest).add(v3((Math.random() - 0.5) * 1.6 * u, (Math.random() - 0.3) * 0.9 * u, (Math.random() - 0.5) * 1.4 * u));
          if (Math.random() < 0.5) m.nod = 0.8;
        }
        m.look = wander;
        m.lookAmt = 1;
        m.ears = Math.sin(ctx.time * 3) > 0 ? 'forward' : null;
        callIn -= dt;
        if (callIn <= 0) {
          callIn = 2.5 + Math.random() * 3;
          callOut(sc);
        }
      } else {
        m.look = hand.position;
        m.lookAmt = 1;
        m.ears = 'forward';
      }
      m.nuzzle = reach * 0.8;
      m.chew = chewFor > 0 ? 1 : Math.max(0, (m.chew ?? 0) - dt);
      m.wag = chewFor > 0 && given <= s.n ? 0.7 : 0;
    },
    draw(g) {
      if (!sc.ready) return;
      const s = play.peek();
      // Les friandises données, dans le cadre vert (comme le jeu dessiné), là où la plaque à son nom n'est pas.
      const v = ctx.view;
      const w = 34 * s.max + 22;
      let x = v.x0 + 8;
      const plate = sc.decor.plate;
      if (plate) {
        const c = sc.project(plate.getWorldPosition(v3()));
        const half = sc.projectRadius(plate.getWorldPosition(v3()), 0.56) / 2 + 10;
        if (c.x + half > x && c.x - half < x + w && c.y < v.y0 + 8 + 46 + 24) x = v.x1 - 8 - w;
      }
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.86)';
      g.beginPath();
      g.roundRect(x, v.y0 + 8, w, 46, 16);
      g.fill();
      g.restore();
      drawCountZone(g, x + 22, v.y0 + 31, s.given, s.n, s.max, TREAT_ICON[sp] ?? '🍏');
    },
    destroy() {
      sc.scene.remove(hand);
      for (const x of keep) x.dispose?.();
    },
  };
}

/** Notre épaule : à droite de la caméra, un peu plus bas, devant elle (le bras entre dans l'image par le côté). */
function shoulder(sc, hand) {
  const c = sc.camera;
  const right = v3(1, 0, 0).applyQuaternion(c.quaternion);
  const up = v3(0, 1, 0).applyQuaternion(c.quaternion);
  const d = c.position.distanceTo(hand);
  const fwd = hand.clone().sub(c.position).normalize();
  return c.position.clone().addScaledVector(fwd, d * 0.8).addScaledVector(right, 0.5).addScaledVector(up, -0.16);
}
