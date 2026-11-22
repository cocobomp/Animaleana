// Jouer avec le chat en 3D : la canne à plume. La logique et la note sont celles du jeu dessiné (fun.js featherGame :
// agiter la plume près de lui ; il se met à l'affût, bondit, l'attrape ; juste le bon nombre de bonds, au-delà il se
// fatigue). Le jeu dessiné est vu de côté (le sol à y = 300) : ici, c'est un plan vertical de la pièce, devant le mur,
// où le chat se promène ; le doigt est ramené sur ce plan (lancer de rayon), puis dans les coordonnées du jeu dessiné.
// Le vrai chat du joueur suit la logique : il marche vers la plume (ses allures), se ramasse à l'affût, bondit
// (son clip de saut, à la hauteur du bond), garde la plume dans la gueule, ronronne ; fatigué, il s'assied.

import * as THREE from 'three';
import { playGame } from './fun.js';
import { drawCountZone, sizeFor } from './food.js';
import { animalShape } from './draw.js';
import { withLogic } from './care3d.js';
import { realCatPose } from '../../game/models/catReal.js';
import { own, shadowed, holdHand } from '../../game/care/petProps.js';
import { petHand, shoulderFor } from '../../game/care/petHand.js';
import { paint } from '../../game/care/textures.js';
import { audio } from '../../game/audio.js';
import { purr } from './pets3d.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Une plume peinte (tuyau, barbes, couleurs douces), transparente autour. */
function featherTexture(c1, c2, key) {
  return paint(64, 192, (c) => {
    c.clearRect(0, 0, 64, 192);
    for (let i = 0; i < 70; i++) {
      const k = i / 70;
      const y = 186 - k * 176;
      const w = Math.sin(Math.min(1, k * 1.25) * Math.PI) * 26 * (1 - k * 0.25) + 3;
      for (const sd of [-1, 1]) {
        c.strokeStyle = k < 0.15 ? 'rgba(255,255,255,0.75)' : `rgba(${k < 0.6 ? c1 : c2},${0.65 + Math.random() * 0.3})`;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(32, y);
        c.quadraticCurveTo(32 + sd * w * 0.6, y - 6, 32 + sd * w, y - 14 - Math.random() * 4);
        c.stroke();
      }
    }
    c.strokeStyle = 'rgba(250,245,235,0.95)';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(32, 190);
    c.lineTo(32, 8);
    c.stroke();
  }, key);
}

export function petFeather3dGame(ctx) {
  const sc = ctx.scene;
  const a = ctx.a;
  sc.decor.layout('rest');
  const L = sc.marks;
  const S = L.size;
  const R = sc.decor.room;
  const keep = own();
  const m = sc.mood;
  const md = sc.model;
  m.ears = 'forward';
  m.happy = 0.6;
  // ---- l'échelle : la bouche du chat dessiné, à côté de son corps, devient celle du vrai chat
  const sh = animalShape(a, { x: 0, y: 300, s: sizeFor(a, 0.8), f: 1 });
  const homeX = sc.holder.position.x;
  const bodyOff = L.body.x - homeX; // (son corps, par rapport au point de l'animal)
  const mpp = Math.max(0.0012, (L.muzzle.x - L.body.x) / Math.max(10, sh.mouth.x));
  const z0 = sc.holder.position.z;
  // (le plan du jeu : centré devant lui, sans entrer dans le mur de côté)
  const span = 380 * mpp;
  const xMid = Math.min(homeX + 80 * mpp, (R?.side ?? 9) - span / 2 - 0.08);
  const toX = (lx) => xMid + (lx - 200) * mpp;
  const toY = (ly) => (300 - ly) * mpp;
  const fromWorld = (P) => ({ x: 200 + (P.x - xMid) / mpp, y: 300 - P.y / mpp });
  const fromScreen = (p) => {
    const ray = sc.rayAt(p.x, p.y);
    if (Math.abs(ray.direction.z) < 1e-4) return null;
    const t = (z0 - ray.origin.z) / ray.direction.z;
    return t > 0 ? fromWorld(ray.origin.clone().addScaledVector(ray.direction, t)) : null;
  };
  const play = withLogic(ctx, playGame, () => sc.project(sc.live('poll').add(v3(0, S.headLen * 0.8, 0))));
  let s = play.peek();
  // il part de la place du jeu dessiné
  m.drive = { x: toX(s.x) - bodyOff, z: z0, speed: 0, heading: Math.PI / 2 };
  sc.holder.position.x = toX(s.x) - bodyOff;

  // ---------------------------------------------------------------- la canne, le fil, la plume
  const wood = keep(new THREE.MeshStandardMaterial({ color: 0x9a6a3c, roughness: 0.6 }));
  const stickLen = Math.max(0.45, span * 0.7);
  const stick = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.0045, 0.007, stickLen, 10)), wood));
  sc.scene.add(stick);
  const fGroup = new THREE.Group();
  const fs = Math.max(0.6, Math.min(1.2, S.len / 0.45));
  const fMats = [['236,120,160', '170,100,210', 'pinkFeather'], ['90,190,190', '70,130,200', 'tealFeather']].map(([c1, c2, k]) => {
    const t = keep(new THREE.CanvasTexture(featherTexture(c1, c2, k)));
    t.colorSpace = THREE.SRGBColorSpace;
    return keep(new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, roughness: 0.8 }));
  });
  // (une belle touffe : on doit la voir de loin, sur un téléphone)
  const fGeo = keep(new THREE.PlaneGeometry(0.05 * fs, 0.15 * fs));
  fGeo.translate(0, -0.075 * fs, 0);
  [[0, 0.25, 0], [1, -0.3, 0.8], [0, 0.05, 1.7]].forEach(([mi, tilt, rot]) => {
    const f = new THREE.Mesh(fGeo, fMats[mi]);
    f.rotation.set(0, rot, tilt);
    fGroup.add(f);
  });
  const bead = shadowed(new THREE.Mesh(keep(new THREE.SphereGeometry(0.011 * fs, 12, 8)), keep(new THREE.MeshStandardMaterial({ color: 0xf2c84b, metalness: 0.6, roughness: 0.3 }))));
  fGroup.add(bead);
  sc.scene.add(fGroup);
  const lineGeo = keep(new THREE.BufferGeometry().setFromPoints(new Array(16).fill(0).map(() => v3())));
  const line = new THREE.Line(lineGeo, keep(new THREE.LineBasicMaterial({ color: 0x4a4a4a, transparent: true, opacity: 0.8 })));
  sc.scene.add(line);
  const hand = petHand(keep, { ...(sc.decor.props.hand ?? {}), grip: 0.85, size: Math.max(0.6, Math.min(1, 0.4 + S.len)) });
  sc.scene.add(hand);

  // ---------------------------------------------------------------- cadrage : lui, la plume, de la place pour ses bonds ;
  // la caméra le suit doucement (le terrain du jeu dessiné est plus large que l'image)
  const frameAt = (now = false) => {
    const dx = sc.holder.position.x - homeX;
    const at = (p) => p.clone().add(v3(dx, 0, 0));
    const cx = sc.holder.position.x + bodyOff;
    const f = s.f ?? 1;
    // (devant lui, là où il chasse, de la place : on y promène la plume)
    const pts = [at(L.poll), ...L.ears.map(at), at(L.tail), ...L.paws.map(at), v3(cx - f * S.len * 0.5, 0, z0), v3(cx + f * S.len * 1.3, 0, z0), v3(cx, Math.max(S.h * 2.3, 0.45), z0)];
    pts.push(fGroup.position.clone(), fGroup.position.clone().setY(0));
    sc.frame(pts, { dir: [0.12, 0.22, 1], pad: 1.1, now, half: 0.7 });
  };
  fGroup.position.set(toX(s.feather.x), toY(s.feather.y), z0);
  frameAt(true);
  let reframe = 0;

  let tip = v3(toX(330), toY(40), z0 + 0.1);
  let caught = 0;
  let purrIn = 0;
  const feather = v3();
  let lastX = s.x;
  return {
    peek: () => ({ ...play.peek(), feather3d: fGroup.position.clone(), toScreen: (lx, ly) => sc.project(v3(toX(lx), toY(ly), z0)) }),
    key: (c, d) => play.key?.(c, d),
    down(p) {
      const q = fromScreen(p);
      if (q) play.down(q);
    },
    move(p, down) {
      const q = fromScreen(p);
      if (q) play.move(q, down);
    },
    update(dt) {
      play.update(dt);
      s = play.peek();
      // lui : à la place du jeu dessiné, tourné vers la plume ; à l'affût il se ramasse ; il bondit
      const X = toX(s.x) - bodyOff;
      reframe -= dt;
      if (reframe <= 0) {
        reframe = 0.25;
        frameAt();
      }
      const speed = Math.abs(s.x - lastX) * mpp / Math.max(dt, 1e-3);
      lastX = s.x;
      m.drive.x = X;
      m.drive.z = z0;
      m.drive.speed = m.drive.speed + (speed - m.drive.speed) * Math.min(1, dt * 8);
      m.drive.heading = s.f > 0 ? Math.PI / 2 : -Math.PI / 2;
      const lift = s.jump ? s.jump.h * Math.sin(s.jump.k * Math.PI) * mpp : 0;
      sc.holder.position.y = lift;
      if (s.jump) realCatPose(md, 'jump', 1, null, 0.2 + s.jump.k * 0.6);
      m.posture = ctx.done || s.bored ? 'sit' : s.crouch > 0.6 && !s.jump ? 'crouch' : 'stand';
      m.ears = s.tired ? 'back' : 'forward';
      m.happy = s.held ? 1 : s.tired ? 0.2 : 0.7;
      // la plume : dans sa gueule quand il l'a attrapée, sinon au bout du fil, qui suit le doigt
      if (s.held) {
        const mouth = sc.live('muzzle');
        feather.copy(mouth);
        if (s.catches > caught) {
          caught = s.catches;
          audio.animal?.('cat', 'happy', a?.id ?? null);
        }
      } else feather.set(toX(s.feather.x), toY(s.feather.y), z0);
      fGroup.position.lerp(feather, Math.min(1, dt * (s.held ? 30 : 14)));
      fGroup.rotation.z = Math.sin(ctx.time * 9) * 0.35;
      fGroup.rotation.y = ctx.time * 1.5;
      m.look = fGroup.position;
      m.lookAmt = 1;
      // le bout de la canne : au-dessus de la plume, un peu en retard ; la canne vient de notre main (en bas à droite)
      const want = fGroup.position.clone().add(v3(Math.max(0.12, span * 0.15), Math.max(0.2, span * 0.3), 0.12));
      tip.lerp(want, Math.min(1, dt * 6));
      const handAt = shoulderFor(sc, tip).lerp(tip, 0.55);
      const dir = tip.clone().sub(handAt);
      const len = dir.length();
      stick.position.copy(handAt).addScaledVector(dir, 0.5);
      stick.quaternion.setFromUnitVectors(v3(0, 1, 0), dir.clone().normalize());
      stick.scale.set(1, len / stickLen, 1);
      const grip = handAt.clone().addScaledVector(dir.normalize(), 0.03);
      holdHand(hand, grip, v3(0, 0, -1), shoulderFor(sc, grip));
      // le fil : une courbe qui pend du bout de la canne jusqu'à la plume
      const p = lineGeo.attributes.position;
      const f = fGroup.position;
      for (let i = 0; i < 16; i++) {
        const k = i / 15;
        const x = tip.x + (f.x - tip.x) * k;
        const y = tip.y + (f.y - tip.y) * k - Math.sin(k * Math.PI) * 0.04;
        const z = tip.z + (f.z - tip.z) * k;
        p.setXYZ(i, x, y, z);
      }
      p.needsUpdate = true;
      lineGeo.computeBoundingSphere();
      // il ronronne quand il tient la plume
      if (s.held) {
        purrIn -= dt;
        if (purrIn <= 0) {
          purrIn = 1.2;
          purr(1, 0.04);
        }
      }
    },
    draw(g) {
      if (!sc.ready) return;
      const st = play.peek();
      const v = ctx.view;
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.86)';
      g.beginPath();
      g.roundRect(v.x0 + 8, v.y0 + 8, 30 * st.max + 18, 46, 16);
      g.fill();
      g.restore();
      drawCountZone(g, v.x0 + 28, v.y0 + 31, st.catches, st.n, st.max, '🪶', 30);
    },
    destroy() {
      m.drive = null;
      sc.holder.position.y = 0;
      sc.scene.remove(stick, fGroup, line, hand);
      keep.dispose();
    },
  };
}
