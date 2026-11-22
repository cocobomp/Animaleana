// Accessoires de la corvée de l'étable (src/ui/minigames/barnClean3d.js) : la litière sale (paille foulée, humide et
// brunie), les bouses (galettes brun-vert, luisantes, avec des brins de paille), la brouette verte qui se remplit
// vraiment, et la paille fraîche qu'on étale à la fourche, case par case (une brassée dorée ; deux, c'est un tas).
// Même forme que les autres accessoires (barnProps.js) : { group, …, dispose() }.

import * as THREE from 'three';
import { canvasTex, rng } from './textures.js';
import { bag, lumpy, pitchfork } from './barnProps.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const shadowed = (m, cast = true) => {
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
};

/** La litière sale : paille foulée, brunie, des taches humides plus sombres. */
export function dirtyLitterTexture(seed = 6) {
  return canvasTex(256, 256, (c) => {
    const r = rng(seed);
    c.fillStyle = '#8a7650';
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 30; i++) {
      c.fillStyle = `rgba(${55 + r() * 25},${45 + r() * 20},${25 + r() * 10},${0.25 + r() * 0.25})`;
      c.beginPath();
      c.ellipse(r() * 256, r() * 256, 12 + r() * 30, 8 + r() * 20, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < 1500; i++) {
      const l = 6 + r() * 16;
      const a = r() * Math.PI;
      const x = r() * 256;
      const y = r() * 256;
      c.strokeStyle = `rgba(${150 + r() * 60},${120 + r() * 50},${60 + r() * 30},${0.35 + r() * 0.4})`;
      c.lineWidth = 1 + r();
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      c.stroke();
    }
  }, { key: `litter-dirty|${seed}` });
}

/** La paille fraîche, dorée, brins serrés dans tous les sens. */
export function freshStrawTexture(seed = 3) {
  return canvasTex(128, 128, (c) => {
    const r = rng(seed);
    c.fillStyle = '#e2c26a';
    c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const l = 5 + r() * 14;
      const a = r() * Math.PI;
      const x = r() * 128;
      const y = r() * 128;
      const k = r();
      c.strokeStyle = k < 0.15 ? 'rgba(160,120,50,0.6)' : `rgba(${235 + r() * 20},${200 + r() * 40},${110 + r() * 50},0.9)`;
      c.lineWidth = 1 + r() * 0.8;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      c.stroke();
    }
  }, { key: `straw-fresh|${seed}` });
}

/**
 * Une bouse : une galette en deux ou trois couches affaissées, brun-vert et luisante, quelques brins de paille
 * collés. size : son diamètre (m). Origine : au sol, au milieu.
 */
export function cowPat(keep, mats, size = 0.26, seed = 1) {
  const g = new THREE.Group();
  const r = rng(seed * 7 + 3);
  const layers = 2 + (r() < 0.5 ? 1 : 0);
  for (let i = 0; i < layers; i++) {
    const k = 1 - i * 0.28;
    const m = shadowed(new THREE.Mesh(mats.geo, mats.pat), i === 0);
    m.scale.set(size * 0.5 * k * (0.9 + r() * 0.2), size * (0.09 - i * 0.012), size * 0.5 * k * (0.85 + r() * 0.2));
    m.position.set((r() - 0.5) * size * 0.08, size * (0.02 + i * 0.055), (r() - 0.5) * size * 0.08);
    m.rotation.y = r() * 6;
    g.add(m);
  }
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(mats.straw, mats.strawMat);
    s.scale.set(size * (0.35 + r() * 0.3), 1, 1);
    s.position.set((r() - 0.5) * size * 0.5, size * (0.05 + r() * 0.06), (r() - 0.5) * size * 0.5);
    s.rotation.set(0, r() * 6, (r() - 0.5) * 0.5);
    g.add(s);
  }
  return g;
}

/** Les matières et formes partagées des bouses. */
export function patMaterials(keep) {
  const tex = keep(canvasTex(64, 64, (c) => {
    const r = rng(9);
    c.fillStyle = '#6e5a34';
    c.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 160; i++) {
      c.fillStyle = `rgba(${90 + r() * 50},${80 + r() * 40},${35 + r() * 20},${0.5 * r()})`;
      c.beginPath();
      c.arc(r() * 64, r() * 64, 1 + r() * 3, 0, Math.PI * 2);
      c.fill();
    }
  }, { key: 'cow-pat' }));
  return {
    geo: keep(lumpy(new THREE.SphereGeometry(1, 20, 10), 0.06, 4, 3.5)),
    pat: keep(new THREE.MeshStandardMaterial({ map: tex, color: 0xd8c49a, roughness: 0.32, metalness: 0 })),
    straw: keep(new THREE.BoxGeometry(1, 0.003, 0.005)),
    strawMat: keep(new THREE.MeshStandardMaterial({ color: 0xd9bc6a, roughness: 0.8 })),
  };
}

/**
 * La brouette (benne verte en tôle, roue en avant, deux bras en bois, deux pieds). Origine : au sol, sous la benne ;
 * la roue vers +x. fill(n, total) : le tas de bouses et de paille sale monte dedans.
 */
export function wheelbarrow(keep, s = 1) {
  const g = new THREE.Group();
  const green = keep(new THREE.MeshStandardMaterial({ color: 0x2f8f57, roughness: 0.45, metalness: 0.35 }));
  const dark = keep(new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.8 }));
  const steel = keep(new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.35, metalness: 0.8 }));
  const wood = keep(new THREE.MeshStandardMaterial({ color: 0xa07a4c, roughness: 0.7 }));
  // la benne : un tronc de pyramide ouvert (plus large en haut), les bords roulés
  const top = { x: 0.42 * s, z: 0.3 * s };
  const bot = { x: 0.26 * s, z: 0.18 * s };
  const h = 0.24 * s;
  const y0 = 0.3 * s;
  const tub = new THREE.BufferGeometry();
  const P = [];
  const quad = (a, b, c, d) => P.push(...a, ...b, ...c, ...a, ...c, ...d);
  const T = (x, z) => [x * top.x, y0 + h, z * top.z];
  const B = (x, z) => [x * bot.x, y0, z * bot.z];
  quad(B(-1, -1), B(1, -1), B(1, 1), B(-1, 1));
  quad(B(-1, -1), T(-1, -1), T(1, -1), B(1, -1));
  quad(B(1, 1), T(1, 1), T(-1, 1), B(-1, 1));
  quad(B(1, -1), T(1, -1), T(1, 1), B(1, 1));
  quad(B(-1, 1), T(-1, 1), T(-1, -1), B(-1, -1));
  tub.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  tub.computeVertexNormals();
  keep(tub);
  const tubMat = keep(green.clone());
  tubMat.side = THREE.DoubleSide;
  g.add(shadowed(new THREE.Mesh(tub, tubMat)));
  // le rebord roulé
  const rim = new THREE.Mesh(keep(new THREE.TorusGeometry(1, 0.012 * s / Math.max(top.x, 0.01), 6, 4)), green);
  rim.rotation.set(Math.PI / 2, 0, Math.PI / 4);
  rim.scale.set(top.x * Math.SQRT2, top.z * Math.SQRT2, 1);
  rim.position.y = y0 + h;
  g.add(shadowed(rim));
  // la roue, devant
  const wheel = new THREE.Group();
  wheel.position.set(top.x + 0.06 * s, 0.17 * s, 0);
  const tyre = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(0.13 * s, 0.045 * s, 10, 24)), dark));
  wheel.add(tyre);
  const hub = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 0.07 * s, 14)), steel));
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  g.add(wheel);
  // les bras (en bois), de la roue jusqu'aux poignées derrière
  for (const sd of [-1, 1]) {
    const a = V(top.x + 0.06 * s, 0.17 * s, sd * 0.07 * s);
    const b = V(-top.x - 0.45 * s, y0 + 0.05 * s, sd * 0.24 * s);
    const len = a.distanceTo(b);
    const arm = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(len, 0.035 * s, 0.035 * s)), wood));
    arm.position.copy(a).lerp(b, 0.5);
    arm.quaternion.setFromUnitVectors(V(1, 0, 0), b.clone().sub(a).normalize());
    g.add(arm);
    const grip = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.14 * s, 10)), dark));
    grip.position.copy(b).add(V(-0.05 * s, 0, 0));
    grip.rotation.z = Math.PI / 2;
    g.add(grip);
    // le pied (tube d'acier)
    const leg = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.012 * s, 0.012 * s, y0, 8)), steel));
    leg.position.set(-bot.x * 0.7, y0 / 2, sd * bot.z * 0.9);
    g.add(leg);
  }
  // le tas dedans
  const pile = new THREE.Group();
  g.add(pile);
  const pileMat = keep(new THREE.MeshStandardMaterial({ map: keep(dirtyLitterTexture(11)), color: 0xa08a64, roughness: 0.6 }));
  const pileGeo = keep(lumpy(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0.08, 2, 3));
  const mound = shadowed(new THREE.Mesh(pileGeo, pileMat), false);
  mound.visible = false;
  pile.add(mound);
  return {
    group: g,
    /** Le haut de la benne (monde : à recalculer par l'appelant), pour viser. */
    mouth: V(0, y0 + h, 0),
    fill(n, total) {
      const k = Math.min(1, n / Math.max(1, total));
      mound.visible = k > 0;
      // (le tas reste dans la benne : il ne dépasse le bord que d'un peu, à la fin)
      mound.scale.set(top.x * (0.6 + 0.35 * k), h * (0.25 + 0.45 * k), top.z * (0.6 + 0.35 * k));
      mound.position.y = y0 + h * (0.3 + 0.55 * k);
    },
    dispose() {},
  };
}

/** La fourche, tenue par notre main (le manche vers nous) : une brassée de paille fraîche sur les dents (load). */
export function strawFork(keep) {
  const g = new THREE.Group();
  const fork = pitchfork(keep);
  g.add(fork);
  const load = new THREE.Mesh(keep(lumpy(new THREE.SphereGeometry(1, 14, 8), 0.12, 3, 4)), keep(new THREE.MeshStandardMaterial({ map: keep(freshStrawTexture(5)), roughness: 0.9 })));
  load.scale.set(0.11, 0.05, 0.08);
  load.position.set(0, 0.12, 0.02);
  load.castShadow = true;
  g.add(load);
  return { group: g, load };
}

/** Tout ce qui est créé ici, à libérer ensemble. */
export const choreBag = bag;
