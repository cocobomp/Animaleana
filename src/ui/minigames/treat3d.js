// La friandise du cheval, en 3D : la logique est celle du jeu dessiné (food.js treatGame : attendre qu'il soit sage,
// donner juste le bon nombre, sa préférée le rend fou de joie). Ici, notre main tendue, paume ouverte, avec la carotte
// ou la pomme ; il s'agite (tête qui bouge, oreilles qui tournent, il gratte du pied), puis il se calme, oreilles en
// avant, et la prend du bout des lèvres ; il la croque en hochant la tête (on la voit un instant entre ses lèvres).
//
// La tête reste toujours dans l'image (headFrame.js) : la caméra la recadre en douceur quand il tourne la tête ou
// tend le nez vers la main (avant : un seul cadrage, sur la pose photo ; au moment de croquer, la tête sortait à
// gauche). Notre bras entre par le bas à droite, le poignet plié, la paume bien à plat (avant : un gros tube bleu,
// creux au bout, en travers de l'image).

import * as THREE from 'three';
import { treatGame, drawCountZone } from './food.js';
import { withLogic } from './care3d.js';
import { treatModel, handModel, aimHand } from '../../game/care/props.js';
import { nicker, snort } from './feed3d.js';
import { headShape, headFollow } from './headFrame.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TREAT_ICON = { carrot: '🥕', apple: '🍎' };

/** Réglages (tests) : regard quand il s'agite, cadrage. */
export const TREAT3D = {
  wander: 0.25, // (m : il regarde un point proche de la main, devant nous, jamais en l'air)
  wanderUp: 0.06,
  wanderLook: 0.6,
  calmLook: 0.8,
  pad: 1.4,
  half: 0.6,
  dir: [0.62, 0.12, 1],
};

export function treat3dGame(ctx) {
  const sc = ctx.scene;
  sc.decor.layout('rest');
  const m = sc.mood;
  const L = sc.marks;
  const S = sc.double.scale;
  const muzzle = L.muzzle.clone();
  // Main au repos : devant le bout du nez, un peu vers nous et plus bas (tout près : la tête reste grande).
  const rest = muzzle.clone().add(v3(0.1, -0.16, 0.32).multiplyScalar(Math.max(0.75, S)));
  // (les cœurs et les mots partent d'au-dessus de son front, pas de ses yeux)
  const play = withLogic(ctx, treatGame, () => sc.project(sc.live('forehead').add(v3(0.04, 0.12 * S, 0))));
  // Notre main (couleur de peau de l'avatar), et les deux friandises.
  const keep = [];
  const own = (x) => {
    keep.push(x);
    return x;
  };
  const avatar = ctx.opts?.avatar ?? sc.game?.profile?.avatar ?? {};
  const hand = handModel(own, { skin: colorOf(avatar.skin, 0xf0c29a), sleeve: colorOf(avatar.top ?? avatar.shirt, 0x3f7fd0) });
  hand.scale.setScalar(1.15);
  hand.userData.hand = true;
  // (une manche plus longue : le bras entre toujours par le bord de l'image, on n'en voit jamais le bout)
  for (const c of hand.children) {
    if (c.geometry?.type === 'CylinderGeometry' && c.geometry.parameters.height > 0.3) {
      c.scale.y = 2.4;
      c.position.x = -0.142 - (0.34 * 2.4) / 2;
    }
  }
  sc.scene.add(hand);
  // (posées à plat au creux de la main : la carotte en travers de la paume, la pomme au milieu)
  const treats = { carrot: treatModel('carrot', own), apple: treatModel('apple', own) };
  for (const tm of Object.values(treats)) hand.add(tm);
  const inHand = {
    carrot: { p: v3(0.012, 0.024, 0.004), r: new THREE.Euler(0, Math.PI / 2 - 0.35, 0), s: 0.85 },
    apple: { p: v3(0.012, 0.045, 0), r: new THREE.Euler(), s: 1 },
  };
  const putInHand = (k) => {
    const tm = treats[k];
    if (tm.parent !== hand) hand.add(tm);
    tm.position.copy(inHand[k].p);
    tm.rotation.copy(inHand[k].r);
    tm.scale.setScalar(inHand[k].s);
  };
  putInHand('carrot');
  putInHand('apple');

  // Ses lèvres (repère de la tête du modèle : model.mouth), pose du moment.
  const snout = sc.model.dims?.snoutZ ?? 0.5;
  const mouthLocal = sc.model.mouth?.clone?.() ?? v3(0, -0.2 * snout, 0.86 * snout);
  const lips = () => (sc.model.head ? sc.model.head.localToWorld(mouthLocal.clone()) : sc.live('muzzle').add(v3(0, -0.05, 0)));
  let started = false;
  let away = 0; // (fini : la main s'en va, par le bas de l'image)
  // Cadrage : la tête (pose du moment et des dernières secondes) et la main au repos ; recadré en douceur.
  const shape = headShape(sc);
  const handPts = () => (away > 0.5 ? [] : [rest.clone().add(v3(0, -0.06, 0.06)), rest.clone().add(v3(-0.08, 0.02, 0)), rest.clone().add(v3(0.06, -0.1, 0.02))]);
  const follow = headFollow(sc, shape, handPts, { dir: TREAT3D.dir, pad: TREAT3D.pad, half: TREAT3D.half, reach: 0.12 });
  follow.frame(true);

  let given = 0;
  let pen = 0;
  let reach = 0; // 0 main au repos, 1 contre sa bouche
  let reachT = -1; // temps depuis le don (animation)
  let back = 0;
  let wanderAt = 0;
  const wander = v3();
  let held = 'apple';
  let bite = null; // la friandise qu'il croque (entre ses lèvres un instant)
  let snortIn = 1;
  m.ears = 'forward';

  /** Le point de la scène où il regarde quand il s'agite : près de la main, devant nous, pas en l'air. */
  function pickWander() {
    const w = TREAT3D.wander;
    wander.copy(rest).add(v3((Math.random() - 0.5) * 2 * w, (Math.random() - 0.5) * 2 * TREAT3D.wanderUp, (Math.random() - 0.5) * 2 * w));
    return wander;
  }

  return {
    peek: () => ({ ...play.peek(), look: m.look ? m.look.toArray() : null, lookAmt: m.lookAmt, bite: !!bite, reach }),
    down: (p) => play.down(p),
    key: (c, d) => play.key(c, d),
    update(dt) {
      play.update(dt);
      const s = play.peek();
      if (!ctx.done) {
        // (le compteur des friandises, en haut : la scène se cadre dessous ; à la première image, sans fondu)
        const v = ctx.view;
        sc.setFocus(Math.max(0, (v.y0 + 58) * v.scale + v.oy), sc.size.h);
        if (!started) follow.frame(true);
      }
      started = true;
      // (fini : la carte de fin couvre le bas ; la tête remonte au-dessus d'elle sans traîner)
      if (ctx.done) follow.opts.half = 0.4;
      follow.update(dt);
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
      // Il la prend : elle passe entre ses lèvres (on la voit un instant dépasser de sa bouche), puis elle fond.
      if (reachT >= 0.55 && !bite && sc.model.head) {
        const tm = treats[held];
        sc.scene.add(tm);
        tm.scale.setScalar(held === 'carrot' ? 0.85 : 0.9);
        bite = { tm, k: held, t: 0 };
      }
      if (bite) {
        // (entre ses lèvres : la carotte en travers, qui dépasse de notre côté ; la pomme au bord des lèvres ; il la
        // garde un instant en mâchant, puis elle disparaît dans sa bouche)
        bite.t += dt;
        sc.model.head.getWorldQuaternion(_hq);
        const side = v3(-1, 0, 0).applyQuaternion(_hq);
        const down = v3(0, -1, 0).applyQuaternion(_hq);
        const carrot = bite.k === 'carrot';
        bite.tm.position.copy(sc.live('muzzle')).addScaledVector(down, 0.025 * S).addScaledVector(side, (carrot ? 0.06 : 0.02) * S);
        bite.tm.quaternion.copy(_hq);
        if (carrot) bite.tm.rotateY(0.25);
        const k = bite.t < 0.5 ? 1 : Math.max(0.05, 1 - (bite.t - 0.5) / 0.4);
        bite.tm.scale.setScalar((carrot ? 0.85 : 0.9) * k);
        bite.tm.visible = bite.t < 0.88;
        if (bite.t > 0.9) {
          putInHand(bite.k);
          bite = null;
        }
      }
      // (la paume juste sous ses lèvres : la friandise posée dessus arrive à sa bouche)
      const target = lips().add(v3(0.015, -0.05 * S - 0.012, 0.02));
      away = ctx.done ? Math.min(1, away + dt * 1.2) : 0;
      const arm = armDir(sc);
      const pos = rest.clone().lerp(target, smooth(reach)).add(v3(0.05, -0.05, 0.18).multiplyScalar(back)).addScaledVector(arm, smooth(away) * 0.7);
      hand.position.copy(pos);
      hand.visible = away < 1;
      // Paume ouverte vers le haut, les doigts vers sa bouche ; le bras vient de nous, d'en bas à droite.
      aimHand(hand, pos.clone().add(arm), target.clone().lerp(pos, 0.3).add(v3(0, 0.02, 0)), true);
      for (const [k, tm] of Object.entries(treats)) {
        if (bite?.tm === tm) continue;
        tm.visible = k === held && !taken && !(ctx.done && s.given >= s.max);
      }
      // Le cheval : agité (il regarde autour de la main, hoche, gratte), puis sage (il regarde la main, oreilles en
      // avant). Il ne tourne jamais la tête loin de nous : elle reste dans l'image.
      const calm = s.state === 'calm' || s.state === 'eat';
      if (s.state === 'wiggle' && !ctx.done) {
        wanderAt -= dt;
        if (wanderAt <= 0) {
          wanderAt = 0.6 + Math.random() * 0.6;
          pickWander();
          if (Math.random() < 0.5) m.nod = 0.7;
        }
        m.look = wander;
        m.lookAmt = TREAT3D.wanderLook;
        m.ears = Math.sin(ctx.time * 3) > 0 ? 'forward' : null;
        m.lift = Math.sin(ctx.time * 2.2) > 0.75 ? 0 : null; // (il gratte du pied, impatient)
        m.liftMax = 0.3;
      } else {
        // (sage, il regarde la main ; quand elle arrive à sa bouche, il ne la suit plus des yeux : il la prend)
        m.look = reachT >= 0 ? rest : hand.position;
        m.lookAmt = TREAT3D.calmLook;
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
      // Les friandises données, dans le cadre vert (comme le jeu dessiné) : en haut à gauche, ou en haut à droite
      // si la plaque à son nom est là (le compteur la cachait).
      const v = ctx.view;
      const w = 34 * s.max + 22;
      let x = v.x0 + 8;
      const plate = sc.decor.plate;
      if (plate) {
        const c = sc.project(plate.getWorldPosition(v3()));
        const half = sc.projectRadius(plate.getWorldPosition(v3()), 0.62) / 2 + 10;
        if (c.x + half > x && c.x - half < x + w && c.y < v.y0 + 8 + 46 + 24) x = v.x1 - 8 - w;
      }
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.86)';
      g.beginPath();
      g.roundRect(x, v.y0 + 8, w, 46, 16);
      g.fill();
      g.restore();
      drawCountZone(g, x + 22, v.y0 + 31, s.given, s.n, s.max, TREAT_ICON[held] ?? '🍎');
    },
    destroy() {
      if (bite) bite.tm.parent?.remove(bite.tm);
      sc.scene.remove(hand);
      for (const x of keep) x.dispose?.();
    },
  };
}

const smooth = (k) => k * k * (3 - 2 * k);
const _hq = new THREE.Quaternion();

/**
 * Le sens du bras, de la main vers l'épaule (repère monde, normé) : vers nous et vers la droite de l'image, un peu
 * vers le bas. Il ne dépend que de la caméra (pas d'une épaule fixe) : quand la main va jusqu'à sa bouche, le bras
 * suit sans s'allonger en travers de l'image ; il entre dans l'image par le bas à droite, presque à plat (la paume
 * reste à plat), et la manche, longue, sort toujours du cadre.
 */
export function armDir(sc) {
  const c = sc.camera;
  const right = v3(1, 0, 0).applyQuaternion(c.quaternion).setY(0).normalize();
  const toCam = v3(0, 0, 1).applyQuaternion(c.quaternion).setY(0).normalize();
  return right.multiplyScalar(0.62).addScaledVector(toCam, 0.72).add(v3(0, -0.3, 0)).normalize();
}

function colorOf(c, fallback) {
  if (typeof c === 'number') return c;
  if (typeof c === 'string' && /^#?[0-9a-f]{6}$/i.test(c)) return parseInt(c.replace('#', ''), 16);
  return fallback;
}
