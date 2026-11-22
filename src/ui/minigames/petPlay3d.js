// Jouer à la balle en 3D (chien, lapin) : la logique est celle du jeu dessiné (fun.js ballGame : lancer la balle
// près de lui, juste le bon nombre de fois ; au-delà, il se fatigue). Le jeu dessiné tient un petit terrain à plat
// (400 × 165) : ici, ce terrain est le sol de la pièce (ou de l'enclos), devant nous. On touche le sol, la balle part
// de notre main en cloche ; il court la chercher (ses vraies allures, il se tourne), la rapporte dans la gueule
// jusqu'à notre main ; fatigué, il halète et s'assied.

import * as THREE from 'three';
import { playGame } from './fun.js';
import { drawCountZone } from './food.js';
import { withLogic } from './care3d.js';
import { petHand } from '../../game/care/petHand.js';
import { own, shadowed } from '../../game/care/petProps.js';
import { canvasTex } from '../../game/care/textures.js';
import { audio } from '../../game/audio.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const happySound = (sc) => audio.animal?.(sc.a?.species ?? 'dog', 'happy', sc.a?.id ?? null);

// Le terrain du jeu dessiné (fun.js ballGame) : x de 0 à 400, y de l'horizon (150) au premier plan (315) ; la main en (200, 325).
const YARD = { x0: 0, x1: 400, y0: 150, y1: 315 };

/** Une balle de tennis (chien) ou une balle à grelot colorée (lapin). */
function ballModel(keep, sp, r) {
  const tex = keep(canvasTex(128, 64, (c) => {
    c.fillStyle = sp === 'rabbit' ? '#e86a8a' : '#cfe03a';
    c.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`;
      c.fillRect(Math.random() * 128, Math.random() * 64, 1, 1);
    }
    c.strokeStyle = sp === 'rabbit' ? '#fff3c4' : '#ffffff';
    c.lineWidth = 5;
    c.beginPath();
    for (let x = 0; x <= 128; x += 2) {
      const y = 32 + Math.sin((x / 128) * Math.PI * 4) * 14;
      if (x === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }, { key: `ball|${sp}`, repeat: false }));
  const m = shadowed(new THREE.Mesh(keep(new THREE.SphereGeometry(r, 20, 14)), keep(new THREE.MeshStandardMaterial({ map: tex, roughness: sp === 'rabbit' ? 0.5 : 0.85 }))));
  return m;
}

export function petPlay3dGame(ctx) {
  const sc = ctx.scene;
  const sp = sc.species;
  sc.decor.layout('rest');
  const L = sc.marks;
  const S = L.size;
  const R = sc.decor.room;
  const keep = own();
  const m = sc.mood;
  const t = ctx.t;
  const name = ctx.a?.name ?? ctx.name;
  // Le terrain sur le sol : devant lui, entre le mur du fond et nous.
  const half = Math.min(1.4, 0.45 + S.len * 1.3);
  const depth = Math.min(2.2, 0.7 + S.len * 1.9);
  const zFar = R.back + Math.max(0.2, S.w * 1.5 + 0.12);
  const xC = Math.min(L.body.x, R.side - half - 0.15);
  const toWorld = (x, y) => v3(xC + ((x - 200) / 200) * half, 0, zFar + ((y - YARD.y0) / (YARD.y1 - YARD.y0)) * depth);
  const toYard = (P) => ({ x: 200 + ((P.x - xC) / half) * 200, y: YARD.y0 + ((P.z - zFar) / depth) * (YARD.y1 - YARD.y0) });
  const hints = new Map([[t('mg_ball_hint', { name }), t('mg_ball_hint3d', { name })]]);
  // (les consignes du jeu dessiné ajoutent les ⚽ à la fin : on garde ce qui suit)
  // (le jeu dessiné passe ses consignes par nb() : espaces insécables avant « ! »)
  const norm = (x) => String(x).replace(/\u00a0/g, ' ');
  const lctxHint = (text) => {
    for (const [k, v] of hints) if (norm(text).startsWith(norm(k))) return v + norm(text).slice(norm(k).length);
    return text;
  };
  const petAt = () => sc.holder.position.clone();
  const play = withLogic(ctx, playGame, () => sc.project(petAt().add(v3(0, S.h * 1.1, 0))), { hints: { get: lctxHint } });
  // la balle, notre main (en bas, devant nous), la cible au sol
  const ballR = Math.max(0.022, Math.min(0.034, S.headLen * 0.2));
  const ball = ballModel(keep, sp, ballR);
  sc.scene.add(ball);
  const hand = petHand(keep, { ...(sc.decor.props.hand ?? {}), size: Math.max(0.7, Math.min(1, 0.6 + S.len * 0.45)) });
  hand.userData.pose({ curl: 0.35, thumb: 0.3 });
  sc.scene.add(hand);
  let handAt = toWorld(200, 340).add(v3(0, Math.max(0.25, S.h * 0.9), 0));
  hand.position.copy(handAt);
  hand.rotation.set(0, Math.PI / 2, 0.25); // (paume vers le haut, doigts vers le fond)
  const ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.8, 1, 32)), keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false })));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  sc.scene.add(ring);
  // il part de la place du jeu dessiné
  let last = play.peek();
  const p0 = toWorld(last.x, last.y);
  sc.holder.position.x = p0.x;
  sc.holder.position.z = p0.z;
  m.drive = { x: p0.x, z: p0.z, speed: 0, heading: Math.PI / 2 };
  m.ears = 'forward';
  m.happy = 0.8;
  // Cadrage : tout le terrain, vu de devant et de haut, avec notre main en bas.
  const c0 = toWorld(0, YARD.y0);
  const c1 = toWorld(400, YARD.y0);
  const c2 = toWorld(0, YARD.y1);
  const c3 = toWorld(400, YARD.y1);
  sc.frame([c0, c1, c2, c3, c0.clone().add(v3(0, S.h * 1.2, 0)), c1.clone().add(v3(0, S.h * 1.2, 0))], { dir: [0, 0.85, 1], pad: 1.02, now: true });
  // notre main, juste devant nous, en bas de l'image (le bras sort par le bas) : la balle part de là. (Refaite à chaque
  // image : la caméra se recadre quand la toile prend sa taille.)
  const placeHand = () => {
    const c = sc.camera;
    const fwd = v3(0, 0, -1).applyQuaternion(c.quaternion);
    const up = v3(0, 1, 0).applyQuaternion(c.quaternion);
    const k = Math.min(0.75, c.position.distanceTo(sc.camTarget) * 0.3);
    handAt = c.position.clone().addScaledVector(fwd, k).addScaledVector(up, -k * 0.34);
    // (paume vers le haut, doigts vers le fond de la pièce)
    const x = v3(0, -0.25, -1).normalize();
    const y = v3(0, 1, 0).addScaledVector(x, -x.y).normalize();
    hand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)));
  };
  placeHand();
  let fly = null; // { from, to, k }
  let ground = null;
  let rounds = 0;
  let lastT = 0;
  return {
    peek: () => ({ ...play.peek(), ball3d: ball.getWorldPosition(v3()), fly: !!fly }),
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
        fly = { from: hand.position.clone().add(v3(0, 0.03, 0)), to: toWorld(y.x, y.y).add(v3(0, ballR, 0)), k: 0 };
        ring.position.copy(fly.to).setY(0.006);
        ring.scale.setScalar(Math.max(0.05, S.len * 0.25));
        ring.visible = true;
      }
    },
    key: (c, d) => play.key?.(c, d),
    update(dt) {
      play.update(dt);
      const s = play.peek();
      // lui : à la place du jeu dessiné, tourné vers où il va, à sa vitesse
      const P = toWorld(s.x, s.y);
      const dx = P.x - m.drive.x;
      const dz = P.z - m.drive.z;
      const d = Math.hypot(dx, dz);
      const speed = dt > 0 ? d / dt : 0;
      m.drive.x = P.x;
      m.drive.z = P.z;
      m.drive.speed = m.drive.speed + (speed - m.drive.speed) * Math.min(1, dt * 8);
      if (d > 1e-4) m.drive.heading = Math.atan2(dx, dz);
      const tired = s.rounds > s.n;
      // il regarde la balle ; fatigué, il halète ; à la fin, assis
      m.look = s.ball === 'hand' ? hand.position : ball.position;
      m.lookAmt = 0.8;
      m.happy = tired ? 0.3 : 1;
      m.pant = tired || s.state === 'back';
      m.posture = ctx.done || (tired && s.state === 'wander' && m.drive.speed < 0.05) ? (sp === 'rabbit' ? 'crouch' : 'sit') : sp === 'rabbit' ? 'crouch' : 'stand';
      // la balle
      if (s.ball !== 'mouth' && ball.parent !== sc.scene) sc.scene.attach(ball);
      if (fly && s.ball !== 'fly') {
        // (la logique a fini le vol : attrapée en l'air, ou tombée au sol)
        if (s.ball === 'ground') ground = fly.to.clone();
        fly = null;
      }
      if (fly) {
        fly.k = Math.min(1, fly.k + dt / 0.75);
        const h = Math.sin(fly.k * Math.PI) * Math.max(0.35, depth * 0.35);
        ball.position.copy(fly.from).lerp(fly.to, fly.k).add(v3(0, h, 0));
        ball.rotation.x += dt * 8;
        if (fly.k >= 1) {
          ground = fly.to.clone();
          fly = null;
        }
      } else if (s.ball === 'mouth') {
        ground = null;
        ring.visible = false;
        // (dans sa gueule : la balle suit l'os de la tête, sans une image de retard)
        if (ball.parent !== sc.model.head) {
          sc.holder.updateMatrixWorld(true);
          const mouth = sc.live('muzzle');
          const fwd = sc.live('nose').sub(sc.live('head')).normalize();
          ball.position.copy(mouth).addScaledVector(fwd, ballR * 0.4).add(v3(0, -ballR * 0.3, 0));
          sc.model.head.attach(ball);
        }
      } else if (s.ball === 'ground' && ground) {
        ball.position.copy(ground);
      } else if (s.ball === 'hand') {
        ground = null;
        ring.visible = false;
        ball.position.copy(hand.position).add(v3(0, 0.03, 0));
      }
      if (s.rounds > rounds) {
        rounds = s.rounds;
        if (rounds <= s.n) happySound(sc);
      }
      // notre main : elle se lève un peu pour lancer
      lastT = Math.max(0, lastT - dt);
      placeHand();
      hand.position.copy(handAt).add(v3(0, fly && fly.k < 0.3 ? 0.04 : 0, 0));
      last = s;
    },
    draw(g) {
      if (!sc.ready) return;
      const s = play.peek();
      const v = ctx.view;
      drawCountZone(g, v.x1 - 24 - (s.max - 1) * 30, v.y0 + 30, s.rounds, s.n, s.max, sp === 'rabbit' ? '🔴' : '🎾', 30);
    },
    destroy() {
      ball.parent?.remove(ball);
      sc.scene.remove(hand, ring);
      m.drive = null;
      keep.dispose();
    },
  };
}
