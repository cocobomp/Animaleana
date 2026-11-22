// Jouer à la balle avec la chèvre, en 3D, dans le pré derrière la chèvrerie (src/game/care/paddock.js). La logique
// est celle du jeu dessiné (fun.js ballGame : lancer la balle près d'elle, juste le bon nombre de fois ; au-delà,
// elle se fatigue) : la note et les textes ne changent pas. Le petit terrain du jeu dessiné (400 × 165) est posé sur
// l'herbe devant nous. On touche l'herbe : la balle part de notre main en cloche ; la chèvre court la chercher à ses
// vraies allures (pas, trot, galop), d'un coup de tête l'arrête si elle tombe tout près d'elle, puis la ramène en la
// poussant du nez jusqu'à nous. Contente, le chevreau gambade ; fatiguée, elle traîne la tête basse, puis se couche.
//
// Le décor : la scène de soin est construite avec la chèvrerie (farmBarn.js) ; ce jeu la cache, pose le pré à sa place
// le temps de la partie, et rend la chèvrerie en partant.

import * as THREE from 'three';
import { playGame } from './fun.js';
import { drawCountZone } from './food.js';
import { withLogic } from './care3d.js';
import { handModel, avatarHand } from '../../game/care/props.js';
import { canvasTex } from '../../game/care/textures.js';
import { paddockSet } from '../../game/care/paddock.js';
import { callOut } from './farm3d.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// Le terrain du jeu dessiné : x de 0 à 400, y de l'horizon (150) au premier plan (315) ; la main en (200, 325).
const YARD = { y0: 150, y1: 315 };

/** Une balle de jeu en caoutchouc, rouge à bande blanche (elle roule : on voit la bande tourner). */
function ballModel(keep, r) {
  const tex = keep(canvasTex(128, 64, (c) => {
    c.fillStyle = '#d8403a';
    c.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 700; i++) {
      c.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`;
      c.fillRect(Math.random() * 128, Math.random() * 64, 1, 1);
    }
    c.fillStyle = '#f7f1e6';
    c.fillRect(0, 26, 128, 12);
    c.fillStyle = '#2f6fb8';
    c.fillRect(0, 24, 128, 2);
    c.fillRect(0, 38, 128, 2);
  }, { key: 'goat-ball', repeat: false }));
  const m = new THREE.Mesh(keep(new THREE.SphereGeometry(r, 24, 16)), keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 })));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function goatPlay3dGame(ctx) {
  const sc = ctx.scene;
  const L = sc.marks;
  const u = L.u;
  const m = sc.mood;
  const disp = [];
  const keep = (x) => {
    disp.push(x);
    return x;
  };
  // Le terrain sur l'herbe, à la taille de la chèvre (un chevreau joue plus près).
  const half = THREE.MathUtils.clamp(0.75 + 1.25 * u, 1.1, 2.1);
  const depth = THREE.MathUtils.clamp(0.9 + 1.5 * u, 1.3, 2.3);
  const xC = 0;
  const zFar = -depth * 0.55;
  const toWorld = (x, y) => v3(xC + ((x - 200) / 200) * half, 0, zFar + ((y - YARD.y0) / (YARD.y1 - YARD.y0)) * depth);
  const toYard = (P) => ({ x: 200 + ((P.x - xC) / half) * 200, y: YARD.y0 + ((P.z - zFar) / depth) * (YARD.y1 - YARD.y0) });
  // Le pré à la place de la chèvrerie (rendue à la fin).
  const barn = sc.decor;
  const before = { bg: sc.scene.background, fog: sc.scene.fog, env: sc.scene.environmentIntensity };
  sc.scene.remove(barn.group);
  const pre = paddockSet(sc, { xC, half, zFar, depth });
  pre.sky(sc);
  sc.decor = pre;
  sc.scene.add(pre.group);

  const anchor = () => sc.project(sc.holder.position.clone().add(v3(0, u * 1.35, 0)));
  const play = withLogic(ctx, playGame, anchor);
  // la balle (grosse : une chèvre la pousse du nez), notre main en bas de l'image, le rond où elle va tomber
  const ballR = THREE.MathUtils.clamp(0.05 * u + 0.025, 0.04, 0.075);
  const ball = ballModel(keep, ballR);
  sc.scene.add(ball);
  const hand = handModel(keep, avatarHand(sc.game?.profile));
  sc.scene.add(hand);
  const ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.8, 1, 32)), keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false })));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  sc.scene.add(ring);
  // elle part de la place du jeu dessiné, de profil
  const s0 = play.peek();
  const p0 = toWorld(s0.x, s0.y);
  m.drive = { x: p0.x, z: p0.z, speed: 0, heading: Math.PI / 2 };
  sc.holder.position.set(p0.x, 0, p0.z);
  sc.holder.rotation.y = Math.PI / 2;
  m.ears = 'forward';
  // Cadrage : tout le terrain, vu de devant et d'en haut, notre main en bas.
  const c0 = toWorld(0, YARD.y0);
  const c1 = toWorld(400, YARD.y0);
  const c2 = toWorld(0, YARD.y1);
  const c3 = toWorld(400, YARD.y1);
  sc.frame([c0, c1, c2, c3, c0.clone().add(v3(0, u * 1.4, 0)), c1.clone().add(v3(0, u * 1.4, 0))], { dir: [0, 0.62, 1], pad: 1.02, now: true });
  // (notre main tout près de nous, en bas de l'image, la balle posée dans la paume ; le bras sort par le bas)
  const placeHand = () => {
    const c = sc.camera;
    const fwd = v3(0, 0, -1).applyQuaternion(c.quaternion);
    const up = v3(0, 1, 0).applyQuaternion(c.quaternion);
    const right = v3(1, 0, 0).applyQuaternion(c.quaternion);
    const d = Math.min(1.2, c.position.distanceTo(sc.camTarget) * 0.32);
    const at = c.position.clone().addScaledVector(fwd, d).addScaledVector(up, -d * 0.27).addScaledVector(right, d * 0.1);
    // (paume vers le haut, doigts vers le pré)
    const x = v3(0, -0.2, -1).normalize();
    const y = v3(0, 1, 0).addScaledVector(x, -x.y).normalize();
    hand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)));
    return at;
  };
  let handAt = placeHand();
  hand.position.copy(handAt);
  let fly = null;
  let ground = null;
  let rounds = 0;
  let rollDir = v3(1, 0, 0);
  let wasState = s0.state;
  let bounce = 0;
  let restT = 0;
  return {
    peek: () => ({ ...play.peek(), ball3d: ball.getWorldPosition(v3()), goat: sc.holder.position.clone(), fly: !!fly }),
    down(p) {
      if (ctx.done) return;
      const s = play.peek();
      if (s.ball !== 'hand') return;
      const P = sc.pointOnPlane(p.x, p.y, 0);
      if (!P) return;
      const y = toYard(P);
      if (y.y < YARD.y0 + 6 || y.y > YARD.y1 || y.x < 0 || y.x > 400) return;
      play.down(y);
      if (play.peek().ball === 'fly') {
        fly = { from: hand.position.clone().add(v3(0, 0.04, 0)), to: toWorld(y.x, y.y).add(v3(0, ballR, 0)), k: 0 };
        ring.position.copy(fly.to).setY(0.008);
        ring.scale.setScalar(ballR * 2.2);
        ring.visible = true;
      }
    },
    key: (c, d) => play.key?.(c, d),
    update(dt) {
      play.update(dt);
      const s = play.peek();
      // elle : à la place du jeu dessiné, tournée vers où elle va, à sa vitesse
      const P = toWorld(s.x, s.y);
      const dx = P.x - m.drive.x;
      const dz = P.z - m.drive.z;
      const d = Math.hypot(dx, dz);
      const speed = dt > 0 ? d / dt : 0;
      m.drive.x = P.x;
      m.drive.z = P.z;
      m.drive.speed += (speed - m.drive.speed) * Math.min(1, dt * 8);
      if (d > 1e-4) m.drive.heading = Math.atan2(dx, dz);
      const tired = s.rounds > s.n;
      // (le chevreau gambade en courant, content)
      m.drive.play = !tired && (ctx.a?.stage === 'baby' || ctx.a?.stage === 'young' || u < 0.5);
      // elle regarde la balle ; fatiguée, la tête basse ; à la fin, contente ou couchée
      m.look = s.ball === 'hand' ? hand.position : ball.position;
      m.lookAmt = 0.8;
      m.ears = tired ? null : 'forward';
      m.tired = tired;
      if (s.state !== wasState) {
        // attrapée au vol (elle l'arrête d'un coup de tête), ramenée, posée devant nous
        if (s.state === 'back' && wasState === 'chase') {
          m.butt = 1;
          bounce = 0.5;
        }
        if (s.state === 'wander' && wasState === 'back' && !tired) callOut(sc);
        wasState = s.state;
      }
      if (ctx.done) {
        restT += dt;
        m.frolic = s.state === 'happy' && restT > 0.6 && restT < 4;
        m.posture = s.state === 'tired' && restT > 0.8 ? 'lie' : null;
      }
      // la balle
      if (fly && s.ball !== 'fly') {
        if (s.ball === 'ground') ground = fly.to.clone();
        fly = null;
      }
      if (fly) {
        fly.k = Math.min(1, fly.k + dt / 0.75);
        const h = Math.sin(fly.k * Math.PI) * Math.max(0.45, depth * 0.3);
        ball.position.copy(fly.from).lerp(fly.to, fly.k).add(v3(0, h, 0));
        ball.rotation.x += dt * 7;
      } else if (s.ball === 'mouth') {
        // elle la pousse du nez, devant elle, au ras de l'herbe (et elle roule)
        ground = null;
        ring.visible = false;
        const nose = sc.live('nose');
        const fwd = v3(Math.sin(sc.holder.rotation.y), 0, Math.cos(sc.holder.rotation.y));
        const want = v3(nose.x, ballR, nose.z).addScaledVector(fwd, ballR * 1.15);
        bounce = Math.max(0, bounce - dt);
        const hop = Math.sin(Math.min(1, bounce / 0.5) * Math.PI) * ballR * 1.5;
        const prev = ball.position.clone();
        ball.position.lerp(want.add(v3(0, hop, 0)), Math.min(1, dt * 14));
        const mv = ball.position.clone().sub(prev).setY(0);
        if (mv.lengthSq() > 1e-8) {
          rollDir = mv.clone().normalize();
          const axis = v3(rollDir.z, 0, -rollDir.x);
          ball.rotateOnWorldAxis(axis, mv.length() / ballR);
        }
      } else if (s.ball === 'ground' && ground) {
        ball.position.lerp(ground, Math.min(1, dt * 10));
      } else if (s.ball === 'hand') {
        ground = null;
        ring.visible = false;
        ball.position.copy(hand.position).add(v3(0.01, 0.045 + ballR * 0.6, 0));
      }
      if (s.rounds > rounds) {
        rounds = s.rounds;
        m.nod = 0.8;
      }
      handAt = placeHand();
      hand.position.copy(handAt).add(v3(0, fly && fly.k < 0.3 ? 0.04 : 0, 0));
    },
    draw(g) {
      if (!sc.ready) return;
      const s = play.peek();
      const v = ctx.view;
      drawCountZone(g, v.x1 - 24 - (s.max - 1) * 30, v.y0 + 30, s.rounds, s.n, s.max, '⚽', 30);
    },
    destroy() {
      sc.scene.remove(ball, hand, ring);
      m.drive = null;
      m.frolic = false;
      m.posture = null;
      m.tired = false;
      for (const x of disp) x.dispose?.();
      // la chèvrerie revient
      sc.scene.remove(pre.group);
      pre.dispose();
      sc.decor = barn;
      sc.scene.add(barn.group);
      sc.scene.background = before.bg;
      sc.scene.fog = before.fog;
      sc.scene.environmentIntensity = before.env;
    },
  };
}
