// Les petits objets du jour autour de l'animal, dans la scène de soin : une brouette, une fourche contre le mur, un chat
// sur le muret, un oiseau sur la clôture, des fleurs, un seau renversé, une poule qui passe, une botte de paille, un
// arrosoir, une balle, un papillon, un pot de fleurs. Lesquels : pickExtras (setting.js, tirés au sort de façon stable
// pour la journée). Où : aux places que le décor propose (decor.spots : au sol, en haut d'un muret ou d'une clôture,
// contre un mur), choisies une fois la caméra posée — dans l'image, jamais devant l'animal ni sur ce qu'on lui tend.
// Tout est fait en code, léger (quelques formes simples), et libéré à la fermeture.

import * as THREE from 'three';
import { strawBale, pitchfork, bag, lumpy } from './barnProps.js';
import { canvasTex } from './textures.js';
import { EXTRAS, seeded, hashSeed } from './setting.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function shade(o) {
  o.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return o;
}

const std = (keep, color, o = {}) => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o }));

// ---------------------------------------------------------------- les modèles (origine au sol, ou sous les pattes)

/** Une brouette verte (bac en tôle, roue, deux bras), tournée vers +x. ~1,3 m. */
function wheelbarrow(keep) {
  const g = new THREE.Group();
  const green = std(keep, 0x3f8a4a, { roughness: 0.5, metalness: 0.3 });
  const dark = std(keep, 0x2a2a2a);
  const wood = std(keep, 0x9a7448);
  // le bac : une boîte évasée (le haut plus large)
  const tray = keep(new THREE.BoxGeometry(0.8, 0.32, 0.6, 1, 1, 1));
  const p = tray.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setXYZ(i, p.getX(i) * 1.18, p.getY(i), p.getZ(i) * 1.15);
  tray.computeVertexNormals();
  const t = new THREE.Mesh(tray, green);
  t.position.set(0.05, 0.5, 0);
  g.add(t);
  const wheel = new THREE.Mesh(keep(new THREE.TorusGeometry(0.17, 0.05, 8, 20)), dark);
  wheel.position.set(0.58, 0.2, 0);
  g.add(wheel);
  const hub = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.05, 0.05, 0.09, 10)), green);
  hub.rotation.x = Math.PI / 2;
  hub.position.copy(wheel.position);
  g.add(hub);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.022, 0.022, 1.3, 8)), wood);
    arm.rotation.z = Math.PI / 2 - 0.22;
    arm.position.set(-0.05, 0.46, s * 0.24);
    g.add(arm);
    const leg = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.018, 0.018, 0.36, 6)), dark);
    leg.position.set(-0.32, 0.18, s * 0.22);
    g.add(leg);
  }
  return shade(g);
}

/** Un chat assis (formes douces), la queue enroulée qui bouge. ~0,3 m. color : la robe. */
function sittingCat(keep, color = 0xd88a3a) {
  const g = new THREE.Group();
  const fur = std(keep, color, { roughness: 0.95 });
  const pale = std(keep, 0xf2e6d4, { roughness: 0.95 });
  const dark = std(keep, 0x1a1410, { roughness: 0.4 });
  const body = new THREE.Mesh(keep(new THREE.SphereGeometry(0.09, 16, 12)), fur);
  body.scale.set(0.9, 1.25, 1.1);
  body.position.y = 0.11;
  g.add(body);
  const chest = new THREE.Mesh(keep(new THREE.SphereGeometry(0.05, 12, 10)), pale);
  chest.position.set(0, 0.12, 0.06);
  g.add(chest);
  const head = new THREE.Group();
  head.position.set(0, 0.25, 0.03);
  g.add(head);
  const skull = new THREE.Mesh(keep(new THREE.SphereGeometry(0.058, 16, 12)), fur);
  skull.scale.set(1.1, 0.95, 1);
  head.add(skull);
  const snout = new THREE.Mesh(keep(new THREE.SphereGeometry(0.025, 10, 8)), pale);
  snout.position.set(0, -0.015, 0.048);
  head.add(snout);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(keep(new THREE.ConeGeometry(0.022, 0.045, 4)), fur);
    ear.position.set(s * 0.033, 0.055, 0);
    ear.rotation.z = -s * 0.25;
    head.add(ear);
    const eye = new THREE.Mesh(keep(new THREE.SphereGeometry(0.008, 8, 6)), dark);
    eye.position.set(s * 0.022, 0.008, 0.053);
    head.add(eye);
    const paw = new THREE.Mesh(keep(new THREE.SphereGeometry(0.02, 8, 6)), pale);
    paw.scale.set(1, 0.7, 1.3);
    paw.position.set(s * 0.035, 0.012, 0.07);
    g.add(paw);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.03, -0.07);
  g.add(tail);
  const tg = new THREE.Mesh(keep(new THREE.TorusGeometry(0.08, 0.016, 6, 14, Math.PI * 1.1)), fur);
  tg.rotation.set(Math.PI / 2, 0, Math.PI * 0.2);
  tail.add(tg);
  let t = Math.random() * 5;
  g.userData.step = (dt) => {
    t += dt;
    tail.rotation.y = Math.sin(t * 1.4) * 0.35;
    head.rotation.y = Math.sin(t * 0.37) * 0.35;
    head.rotation.z = Math.sin(t * 0.23) * 0.08;
  };
  return shade(g);
}

/** Un rouge-gorge qui sautille et picore. ~0,1 m. */
function bird(keep) {
  const g = new THREE.Group();
  const brown = std(keep, 0x7a5a3a);
  const red = std(keep, 0xe0602a);
  const dark = std(keep, 0x1a1410, { roughness: 0.3 });
  const yel = std(keep, 0x3a2a1a);
  const b = new THREE.Group();
  g.add(b);
  const body = new THREE.Mesh(keep(new THREE.SphereGeometry(0.035, 12, 10)), brown);
  body.scale.set(1.25, 1, 1);
  body.position.y = 0.045;
  b.add(body);
  const breast = new THREE.Mesh(keep(new THREE.SphereGeometry(0.026, 10, 8)), red);
  breast.position.set(0.022, 0.045, 0);
  b.add(breast);
  const head = new THREE.Group();
  head.position.set(0.035, 0.078, 0);
  b.add(head);
  head.add(new THREE.Mesh(keep(new THREE.SphereGeometry(0.022, 10, 8)), brown));
  const beak = new THREE.Mesh(keep(new THREE.ConeGeometry(0.006, 0.02, 6)), yel);
  beak.rotation.z = -Math.PI / 2;
  beak.position.x = 0.026;
  head.add(beak);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(keep(new THREE.SphereGeometry(0.004, 6, 4)), dark);
    eye.position.set(0.014, 0.006, s * 0.015);
    head.add(eye);
  }
  const tail = new THREE.Mesh(keep(new THREE.BoxGeometry(0.045, 0.006, 0.025)), brown);
  tail.position.set(-0.05, 0.055, 0);
  tail.rotation.z = 0.4;
  b.add(tail);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.002, 0.002, 0.02, 4)), yel);
    leg.position.set(0, 0.01, s * 0.01);
    b.add(leg);
  }
  let t = Math.random() * 3;
  g.userData.step = (dt) => {
    t += dt;
    const k = t % 3.2;
    // (un petit saut de temps en temps, puis il picore)
    b.position.y = k < 0.3 ? Math.sin((k / 0.3) * Math.PI) * 0.03 : 0;
    head.rotation.z = k > 1.4 && k < 1.8 ? -0.7 * Math.sin(((k - 1.4) / 0.4) * Math.PI) : 0;
    head.rotation.y = Math.sin(t * 0.9) * 0.4;
  };
  return shade(g);
}

/** Une touffe de fleurs des champs (tiges, feuilles, corolles de couleurs). ~0,3 m. */
function flowers(keep, seed = 1) {
  const g = new THREE.Group();
  const r = seeded(seed);
  const stem = std(keep, 0x4f8a3a);
  const cols = [0xe84a6a, 0xf4c23c, 0xf6f2ea, 0x8a6ad8, 0xf08a3a];
  const mats = cols.map((c) => std(keep, c, { roughness: 0.6 }));
  const heart = std(keep, 0xf1c232);
  const sg = keep(new THREE.CylinderGeometry(0.004, 0.005, 1, 5));
  const pg = keep(new THREE.SphereGeometry(0.026, 8, 6));
  const lg = keep(new THREE.SphereGeometry(0.03, 6, 4));
  const hg = keep(new THREE.SphereGeometry(0.01, 6, 4));
  for (let i = 0; i < 9; i++) {
    const h = 0.16 + r() * 0.16;
    const x = (r() - 0.5) * 0.18;
    const z = (r() - 0.5) * 0.14;
    const s = new THREE.Mesh(sg, stem);
    s.scale.y = h;
    s.position.set(x, h / 2, z);
    g.add(s);
    const f = new THREE.Mesh(pg, mats[Math.floor(r() * mats.length)]);
    f.scale.set(1, 0.45, 1);
    f.position.set(x, h, z);
    g.add(f);
    const c = new THREE.Mesh(hg, heart);
    c.position.set(x, h + 0.01, z);
    g.add(c);
    const leaf = new THREE.Mesh(lg, stem);
    leaf.scale.set(1.4, 0.25, 0.6);
    leaf.position.set(x + 0.02, h * 0.35, z);
    leaf.rotation.y = r() * 3;
    g.add(leaf);
  }
  return shade(g);
}

/** Un seau en zinc renversé sur le côté. ~0,3 m. */
function tippedBucket(keep) {
  const g = new THREE.Group();
  const zinc = std(keep, 0xaeb6bc, { roughness: 0.35, metalness: 0.75, side: THREE.DoubleSide });
  const pts = [[0, 0], [0.12, 0], [0.155, 0.28], [0.162, 0.29]].map(([x, y]) => new THREE.Vector2(x, y));
  const b = new THREE.Mesh(keep(new THREE.LatheGeometry(pts, 24)), zinc);
  b.rotation.z = Math.PI / 2 - 0.08;
  b.position.set(0.14, 0.15, 0);
  g.add(b);
  const handle = new THREE.Mesh(keep(new THREE.TorusGeometry(0.155, 0.005, 5, 20, Math.PI)), zinc);
  handle.position.set(0.0, 0.15, 0);
  handle.rotation.set(0, Math.PI / 2, 1.1);
  g.add(handle);
  return shade(g);
}

/** Une poule rousse qui se promène et picore. ~0,4 m. */
/** far : vue de loin, sans les détails qu'on ne verrait pas (yeux, barbillon) : moins de pièces à dessiner. */
function hen(keep, { far = false } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const rust = std(keep, 0xa8582a, { roughness: 0.95 });
  const dark = std(keep, 0x6a3418, { roughness: 0.95 });
  const red = std(keep, 0xd42a2a);
  const yel = std(keep, 0xe0a83a);
  const eyeM = std(keep, 0x111111, { roughness: 0.3 });
  const b = new THREE.Mesh(keep(new THREE.SphereGeometry(0.12, 16, 12)), rust);
  b.scale.set(1.3, 1, 0.95);
  b.position.y = 0.2;
  body.add(b);
  const tail = new THREE.Mesh(keep(new THREE.ConeGeometry(0.07, 0.16, 8)), dark);
  tail.position.set(-0.15, 0.29, 0);
  tail.rotation.z = 0.7;
  body.add(tail);
  const neck = new THREE.Group();
  neck.position.set(0.11, 0.27, 0);
  body.add(neck);
  const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.055, 12, 10)), rust);
  head.position.set(0.04, 0.08, 0);
  neck.add(head);
  const comb = new THREE.Mesh(keep(new THREE.BoxGeometry(0.05, 0.035, 0.012)), red);
  comb.position.set(0.04, 0.14, 0);
  neck.add(comb);
  const wattle = new THREE.Mesh(keep(new THREE.SphereGeometry(0.014, 6, 4)), red);
  wattle.position.set(0.085, 0.04, 0);
  if (!far) neck.add(wattle);
  const beak = new THREE.Mesh(keep(new THREE.ConeGeometry(0.013, 0.035, 6)), yel);
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.105, 0.075, 0);
  neck.add(beak);
  for (const s of [-1, 1]) {
    if (far) continue;
    const eye = new THREE.Mesh(keep(new THREE.SphereGeometry(0.008, 6, 4)), eyeM);
    eye.position.set(0.07, 0.095, s * 0.035);
    neck.add(eye);
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.007, 0.007, 0.12, 5)), yel);
    leg.geometry.translate(0, -0.06, 0);
    leg.position.set(0, 0.12, s * 0.04);
    body.add(leg);
    legs.push(leg);
  }
  // elle va et vient le long de sa place (range : la demi-longueur), picore à chaque bout
  let t = Math.random() * 6;
  g.userData.step = (dt) => {
    t += dt;
    const cycle = 9;
    const k = t % cycle;
    const range = g.userData.range ?? 0.4;
    const walk = k < 3 || (k > 4.5 && k < 7.5);
    const dir = k < 4.5 ? 1 : -1;
    const ph = k < 4.5 ? Math.min(1, k / 3) : Math.max(0, 1 - (k - 4.5) / 3);
    body.position.x = (ph - 0.5) * 2 * range;
    body.rotation.y = dir > 0 ? 0 : Math.PI;
    for (let i = 0; i < 2; i++) legs[i].rotation.z = walk ? Math.sin(t * 9 + i * Math.PI) * 0.45 : 0;
    body.position.y = walk ? Math.abs(Math.sin(t * 9)) * 0.008 : 0;
    const peck = !walk ? Math.max(0, Math.sin(t * 6)) : 0;
    neck.rotation.z = walk ? Math.sin(t * 9) * 0.12 : -1.0 * peck;
  };
  return shade(g);
}

/** Un arrosoir en zinc (bec, anse). ~0,35 m. */
function wateringCan(keep) {
  const g = new THREE.Group();
  const m = std(keep, 0x5aa070, { roughness: 0.45, metalness: 0.4 });
  const body = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.1, 0.11, 0.22, 18)), m);
  body.position.y = 0.11;
  g.add(body);
  const spout = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.014, 0.02, 0.3, 8)), m);
  spout.position.set(0.17, 0.2, 0);
  spout.rotation.z = -0.95;
  g.add(spout);
  const rose = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.032, 0.016, 0.03, 10)), m);
  rose.position.set(0.29, 0.29, 0);
  rose.rotation.z = -0.95;
  g.add(rose);
  const handle = new THREE.Mesh(keep(new THREE.TorusGeometry(0.08, 0.011, 6, 16, Math.PI)), m);
  handle.position.set(-0.01, 0.22, 0);
  g.add(handle);
  return shade(g);
}

/** Une balle de jeu (rouge, une bande). r : le rayon. */
function ball(keep, color = 0xd8403a, r = 0.05) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(keep(new THREE.SphereGeometry(r, 18, 12)), std(keep, color, { roughness: 0.5 }));
  m.position.y = r;
  g.add(m);
  const band = new THREE.Mesh(keep(new THREE.TorusGeometry(r * 1.002, r * 0.12, 6, 24)), std(keep, 0xf6f0e4, { roughness: 0.5 }));
  band.position.y = r;
  band.rotation.x = 0.5;
  g.add(band);
  return shade(g);
}

/** Un pot en terre cuite et ses fleurs. ~0,35 m. */
function flowerPot(keep, seed = 2) {
  const g = new THREE.Group();
  const pts = [[0, 0], [0.08, 0], [0.11, 0.17], [0.125, 0.18], [0.125, 0.2], [0.11, 0.2]].map(([x, y]) => new THREE.Vector2(x, y));
  const pot = new THREE.Mesh(keep(new THREE.LatheGeometry(pts, 20)), std(keep, 0xc0603a, { roughness: 0.9 }));
  g.add(pot);
  const f = flowers(keep, seed);
  f.scale.setScalar(0.8);
  f.position.y = 0.17;
  g.add(f);
  return shade(g);
}

/** Un papillon qui volette autour de sa place (deux ailes qui battent). */
function butterfly(keep, color = 0xf4b23c) {
  const g = new THREE.Group();
  const fly = new THREE.Group();
  g.add(fly);
  const wm = keep(new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide }));
  const wg = keep(new THREE.CircleGeometry(0.03, 10));
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    fly.add(pivot);
    const w = new THREE.Mesh(wg, wm);
    w.scale.set(1, 1.3, 1);
    w.position.set(0, 0, s * 0.03);
    w.rotation.x = Math.PI / 2;
    pivot.add(w);
    wings.push({ pivot, s });
  }
  const body = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.004, 0.004, 0.045, 5)), std(keep, 0x2a2018));
  body.rotation.z = Math.PI / 2;
  fly.add(body);
  let t = Math.random() * 10;
  g.userData.step = (dt) => {
    t += dt;
    for (const w of wings) w.pivot.rotation.x = w.s * (0.2 + Math.abs(Math.sin(t * 14)) * 1.1);
    const R = g.userData.range ?? 0.3;
    fly.position.set(Math.cos(t * 0.6) * R, Math.sin(t * 1.3) * 0.08 + 0.05, Math.sin(t * 0.6) * R * 0.5);
    fly.rotation.y = -t * 0.6;
  };
  return g;
}

// ---------------------------------------------------------------- en voyage

/** Deux ou trois coquillages sur le sable (coquilles Saint-Jacques, nacrées). */
function shells(keep, seed = 1) {
  const g = new THREE.Group();
  const r = seeded(seed);
  const geo = keep(new THREE.SphereGeometry(0.035, 12, 6, 0, Math.PI, 0, Math.PI / 2));
  const cols = [0xf2d8c8, 0xf6e6d4, 0xe8b8a0];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(geo, std(keep, cols[i], { roughness: 0.45 }));
    m.scale.set(1, 0.35, 1.1);
    m.rotation.set(-Math.PI / 2 + 0.2, r() * 6, 0);
    m.position.set((r() - 0.5) * 0.18, 0.005, (r() - 0.5) * 0.12);
    g.add(m);
  }
  return shade(g);
}

/** Un petit crabe rouge qui marche de côté, s'arrête, repart. */
function crab(keep) {
  const g = new THREE.Group();
  const b = new THREE.Group();
  g.add(b);
  const red = std(keep, 0xd2482a, { roughness: 0.5 });
  const dark = std(keep, 0x1a1410, { roughness: 0.3 });
  const body = new THREE.Mesh(keep(new THREE.SphereGeometry(0.035, 12, 8)), red);
  body.scale.set(1.3, 0.55, 1);
  body.position.y = 0.025;
  b.add(body);
  const claw = keep(new THREE.SphereGeometry(0.014, 8, 6));
  const leg = keep(new THREE.CylinderGeometry(0.003, 0.003, 0.035, 4));
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(claw, red);
    c.scale.set(1, 0.7, 1.4);
    c.position.set(s * 0.045, 0.03, 0.035);
    b.add(c);
    const e = new THREE.Mesh(keep(new THREE.SphereGeometry(0.005, 6, 4)), dark);
    e.position.set(s * 0.012, 0.048, 0.025);
    b.add(e);
    for (let i = 0; i < 3; i++) {
      const l = new THREE.Mesh(leg, red);
      l.position.set(s * 0.045, 0.012, -0.015 + i * 0.015);
      l.rotation.z = s * 1.1;
      b.add(l);
    }
  }
  let t = Math.random() * 6;
  g.userData.step = (dt) => {
    t += dt;
    const k = t % 6;
    const walk = k < 1.6 || (k > 3 && k < 4.6);
    const ph = k < 3 ? Math.min(1, k / 1.6) : Math.max(0, 1 - (k - 3) / 1.6);
    b.position.x = (ph - 0.5) * 0.25;
    b.position.y = walk ? Math.abs(Math.sin(t * 18)) * 0.004 : 0;
  };
  return shade(g);
}

/** Une mouette posée (blanche, ailes grises, bec jaune), qui tourne la tête. */
function gull(keep) {
  const g = new THREE.Group();
  const white = std(keep, 0xf6f6f2);
  const grey = std(keep, 0x9aa2aa);
  const yel = std(keep, 0xf0c03a);
  const orange = std(keep, 0xe8904a);
  const dark = std(keep, 0x1a1410, { roughness: 0.3 });
  const body = new THREE.Mesh(keep(new THREE.SphereGeometry(0.06, 12, 10)), white);
  body.scale.set(1.6, 1, 1);
  body.position.y = 0.09;
  g.add(body);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(keep(new THREE.BoxGeometry(0.17, 0.02, 0.05)), grey);
    w.position.set(-0.03, 0.11, s * 0.05);
    w.rotation.z = 0.15;
    g.add(w);
    const l = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 4)), orange);
    l.position.set(0, 0.025, s * 0.02);
    g.add(l);
  }
  const head = new THREE.Group();
  head.position.set(0.09, 0.15, 0);
  g.add(head);
  head.add(new THREE.Mesh(keep(new THREE.SphereGeometry(0.035, 10, 8)), white));
  const beak = new THREE.Mesh(keep(new THREE.ConeGeometry(0.009, 0.045, 6)), yel);
  beak.rotation.z = -Math.PI / 2;
  beak.position.x = 0.045;
  head.add(beak);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(keep(new THREE.SphereGeometry(0.005, 6, 4)), dark);
    e.position.set(0.02, 0.01, s * 0.025);
    head.add(e);
  }
  let t = Math.random() * 4;
  g.userData.step = (dt) => {
    t += dt;
    head.rotation.y = Math.sin(t * 0.7) * 0.6;
  };
  return shade(g);
}

/** Un rocher (gris, ou rouge pour le bush). */
function rock(keep, seed = 1, color = 0x8a8a86) {
  const g = new THREE.Group();
  const mt = std(keep, color, { roughness: 1, flatShading: true });
  const m = new THREE.Mesh(keep(lumpy(new THREE.IcosahedronGeometry(0.2, 1), 0.035, seed % 7, 9)), mt);
  m.scale.set(1.4, 0.8, 1.1);
  m.position.y = 0.12;
  g.add(m);
  const m2 = new THREE.Mesh(keep(lumpy(new THREE.IcosahedronGeometry(0.1, 1), 0.02, seed % 5, 9)), mt);
  m2.position.set(0.24, 0.06, 0.08);
  g.add(m2);
  return shade(g);
}

/** Un petit sapin (deux étages de branches). */
function smallFir(keep) {
  const g = new THREE.Group();
  const green = std(keep, 0x2f5a3a, { flatShading: true });
  const t = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.04, 0.25, 6)), std(keep, 0x5b4330));
  t.position.y = 0.12;
  g.add(t);
  for (const [y, r, h] of [[0.4, 0.32, 0.45], [0.68, 0.22, 0.4]]) {
    const c = new THREE.Mesh(keep(new THREE.ConeGeometry(r, h, 8)), green);
    c.position.y = y;
    g.add(c);
  }
  return shade(g);
}

/** Une lanterne de pierre japonaise. */
function stoneLantern(keep) {
  const g = new THREE.Group();
  const stone = std(keep, 0x9a968c, { roughness: 1 });
  const add = (geo, y) => {
    const m = new THREE.Mesh(keep(geo), stone);
    m.position.y = y;
    g.add(m);
    return m;
  };
  add(new THREE.CylinderGeometry(0.13, 0.15, 0.08, 8), 0.04);
  add(new THREE.CylinderGeometry(0.045, 0.05, 0.3, 8), 0.23);
  add(new THREE.BoxGeometry(0.22, 0.05, 0.22), 0.4);
  add(new THREE.BoxGeometry(0.15, 0.13, 0.15), 0.49);
  const roof = add(new THREE.ConeGeometry(0.2, 0.12, 4), 0.61);
  roof.rotation.y = Math.PI / 4;
  add(new THREE.SphereGeometry(0.03, 8, 6), 0.69);
  return shade(g);
}

/** Une amphore en terre cuite. */
function amphora(keep) {
  const pts = [[0, 0], [0.08, 0], [0.16, 0.12], [0.17, 0.25], [0.12, 0.38], [0.06, 0.44], [0.065, 0.5], [0.08, 0.52]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(keep(new THREE.LatheGeometry(pts, 18)), std(keep, 0xc4683e, { roughness: 0.95, side: THREE.DoubleSide })));
  return shade(g);
}

// ---------------------------------------------------------------- accrochés (au mur, à un poteau) : face vers +z

/** Un fer à cheval porte-bonheur, cloué, les branches en haut. */
function horseshoe(keep) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(keep(new THREE.TorusGeometry(0.065, 0.014, 6, 18, Math.PI * 1.55)), std(keep, 0x5a5a5e, { roughness: 0.5, metalness: 0.6 }));
  // (l'ouverture en haut : l'arc commence à droite, tourne par le bas)
  m.rotation.z = Math.PI / 2 + Math.PI * 0.225;
  m.position.set(0, 0.08, 0.016);
  m.scale.set(1, 1.1, 1);
  g.add(m);
  const nail = new THREE.Mesh(keep(new THREE.SphereGeometry(0.008, 6, 4)), std(keep, 0x3a3a3e));
  nail.position.set(0, 0.16, 0.012);
  g.add(nail);
  return shade(g);
}

/** Un licol pendu à son crochet, la longe enroulée dessous. */
function halterHook(keep, seed = 1) {
  const g = new THREE.Group();
  const r = seeded(seed);
  const strap = std(keep, [0x3a78d8, 0xd84a8a, 0x2a9a6a][Math.floor(r() * 3)], { roughness: 0.6 });
  const rope = std(keep, 0xe8dcc0, { roughness: 0.9 });
  const metal = std(keep, 0x9aa2aa, { roughness: 0.35, metalness: 0.8 });
  const hook = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6)), metal);
  hook.rotation.x = Math.PI / 2;
  hook.position.set(0, 0.48, 0.04);
  g.add(hook);
  const loop = new THREE.Mesh(keep(new THREE.TorusGeometry(0.11, 0.012, 5, 18)), strap);
  loop.scale.set(0.8, 1.25, 0.4);
  loop.position.set(0, 0.36, 0.05);
  g.add(loop);
  const nose = new THREE.Mesh(keep(new THREE.TorusGeometry(0.07, 0.012, 5, 16)), strap);
  nose.scale.set(1, 0.7, 0.5);
  nose.position.set(0, 0.24, 0.06);
  g.add(nose);
  const coil = new THREE.Mesh(keep(new THREE.TorusGeometry(0.08, 0.016, 5, 18)), rope);
  coil.scale.set(1, 1.3, 0.5);
  coil.position.set(0.02, 0.12, 0.07);
  g.add(coil);
  return shade(g);
}

/** Un nichoir en bois (toit à deux pans, trou rond, perchoir). */
function birdhouse(keep) {
  const g = new THREE.Group();
  const wood = std(keep, 0xb08a5a, { roughness: 0.9 });
  const roofM = std(keep, 0x7a3a2a, { roughness: 0.8 });
  const b = new THREE.Mesh(keep(new THREE.BoxGeometry(0.15, 0.18, 0.13)), wood);
  b.position.set(0, 0.1, 0.07);
  g.add(b);
  for (const s of [-1, 1]) {
    const rf = new THREE.Mesh(keep(new THREE.BoxGeometry(0.12, 0.015, 0.16)), roofM);
    rf.position.set(s * 0.045, 0.215, 0.07);
    rf.rotation.z = -s * 0.6;
    g.add(rf);
  }
  const hole = new THREE.Mesh(keep(new THREE.CircleGeometry(0.022, 12)), std(keep, 0x1a1410));
  hole.position.set(0, 0.13, 0.137);
  g.add(hole);
  const perch = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 5)), wood);
  perch.rotation.x = Math.PI / 2;
  perch.position.set(0, 0.085, 0.155);
  g.add(perch);
  return shade(g);
}

/** Un petit tableau (un pré, une colline, le soleil). */
function picture(keep, seed = 1) {
  const g = new THREE.Group();
  const r = seeded(seed);
  const which = Math.floor(r() * 3);
  const tex = keep(canvasTex(64, 48, (c) => {
    c.fillStyle = ['#9ccbe8', '#f2c08a', '#b8d8f0'][which];
    c.fillRect(0, 0, 64, 48);
    c.fillStyle = ['#7ab050', '#d8884a', '#5a9a5a'][which];
    c.beginPath();
    c.ellipse(20, 48, 40, 20, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#5a8a3c';
    c.beginPath();
    c.ellipse(52, 50, 30, 14, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#f6d23c';
    c.beginPath();
    c.arc(48, 12, 6, 0, Math.PI * 2);
    c.fill();
  }, { repeat: false, key: `cadre|${which}` }));
  const frame = new THREE.Mesh(keep(new THREE.BoxGeometry(0.32, 0.25, 0.02)), std(keep, [0x8a5a2a, 0xd8b24a, 0xf2ece0][which], { roughness: 0.6 }));
  frame.position.set(0, 0.125, 0.01);
  g.add(frame);
  const canvas = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.27, 0.2)), std(keep, 0xffffff, { map: tex, roughness: 0.9 }));
  canvas.position.set(0, 0.125, 0.021);
  g.add(canvas);
  return shade(g);
}

/** Une cloche de vache pendue à sa courroie de cuir. */
function cowbell(keep) {
  const g = new THREE.Group();
  const strap = new THREE.Mesh(keep(new THREE.TorusGeometry(0.09, 0.012, 4, 16, Math.PI)), std(keep, 0x6a3a1a, { roughness: 0.8 }));
  strap.rotation.z = Math.PI;
  strap.position.set(0, 0.3, 0.04);
  strap.scale.set(0.8, 1, 0.3);
  g.add(strap);
  const pts = [[0, 0.2], [0.035, 0.2], [0.05, 0.14], [0.065, 0.06], [0.07, 0.05]].map(([x, y]) => new THREE.Vector2(x, y));
  const bell = new THREE.Mesh(keep(new THREE.LatheGeometry(pts, 14)), std(keep, 0xb08a3a, { roughness: 0.35, metalness: 0.7, side: THREE.DoubleSide }));
  bell.position.set(0, 0.02, 0.07);
  g.add(bell);
  return shade(g);
}

// ---------------------------------------------------------------- au loin

/** Un oiseau qui vole (corps, deux ailes qui battent) ; color : sombre, ou blanc pour une mouette. */
function flyer(keep, color, span = 0.4) {
  const g = new THREE.Group();
  const m = std(keep, color, { roughness: 0.8, side: THREE.DoubleSide });
  const body = new THREE.Mesh(keep(new THREE.SphereGeometry(span * 0.09, 8, 6)), m);
  body.scale.set(2.2, 0.9, 0.9);
  g.add(body);
  const wg = keep(new THREE.PlaneGeometry(span * 0.22, span * 0.5));
  wg.translate(0, span * 0.25, 0);
  wg.rotateX(Math.PI / 2);
  const wings = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Group();
    const w = new THREE.Mesh(wg, m);
    w.scale.z = s;
    p.add(w);
    g.add(p);
    wings.push({ p, s });
  }
  // (une queue fourchue, en deux brins)
  const tg = keep(new THREE.BoxGeometry(span * 0.28, span * 0.01, span * 0.04));
  for (const s of [-1, 1]) {
    const tl = new THREE.Mesh(tg, m);
    tl.position.set(-span * 0.26, 0, s * span * 0.03);
    tl.rotation.y = s * 0.35;
    g.add(tl);
  }
  g.userData.flap = (t) => {
    for (const w of wings) w.p.rotation.x = w.s * (0.15 + Math.sin(t) * 0.45);
  };
  return g;
}

/** Un vol d'oiseaux (trois, en V), ou une hirondelle seule ; ils traversent l'image de temps en temps. */
function flight(keep, { n = 3, color = 0x3a3a44, span = 0.45 } = {}) {
  const g = new THREE.Group();
  const birds = [];
  for (let i = 0; i < n; i++) {
    const b = flyer(keep, color, span * (i ? 0.9 : 1));
    const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
    b.userData.off = new THREE.Vector3(-Math.abs(k) * span * 1.6, Math.abs(k) * span * 0.4, k * span * 1.4);
    b.userData.ph = i * 1.7;
    g.add(b);
    birds.push(b);
  }
  return { g, birds };
}

/** Deux poules au loin, qui picorent (le poulailler n'est pas loin). */
function farHens(keep) {
  const g = new THREE.Group();
  for (const [x, z, s] of [[0, 0, 1.3], [0.8, 0.5, 1.2]]) {
    const h = hen(keep, { far: true });
    h.position.set(x, 0, z);
    h.scale.setScalar(s);
    h.userData.range = 0.5;
    g.add(h);
  }
  g.userData.step = (dt) => {
    for (const h of g.children) h.userData.step?.(dt);
  };
  return g;
}

/** Le modèle de cet objet. seed : les petites variations (la robe du chat, les fleurs). */
export function extraModel(kind, keep, seed = 1, opts = {}) {
  const r = seeded(seed);
  switch (kind) {
    case 'brouette': return wheelbarrow(keep);
    case 'fourche': {
      const g = new THREE.Group();
      const f = pitchfork(keep);
      f.rotation.x = -0.22; // (appuyée contre le mur, les dents au sol)
      g.add(f);
      return shade(g);
    }
    case 'chat': return sittingCat(keep, [0xd88a3a, 0x7a7a80, 0x2a2420, 0xe8dccc][Math.floor(r() * 4)]);
    case 'oiseau': return bird(keep);
    case 'fleurs': return flowers(keep, seed);
    case 'seau': return tippedBucket(keep);
    case 'poule': return hen(keep);
    case 'botte': return shade(strawBale(keep, { w: 0.9, h: 0.4, d: 0.48, seed: 4 + (seed % 5) }));
    case 'arrosoir': return wateringCan(keep);
    case 'balle': return ball(keep, [0xd8403a, 0x3a78d8, 0xf0b42a][Math.floor(r() * 3)]);
    case 'papillon': return butterfly(keep, [0xf4b23c, 0x6ab0f0, 0xf6f6f0][Math.floor(r() * 3)]);
    case 'pot': return flowerPot(keep, seed);
    case 'coquillage': return shells(keep, seed);
    case 'crabe': return crab(keep);
    case 'mouette': return gull(keep);
    case 'rocher': return rock(keep, seed, opts.red ? 0xb8603a : 0x8a8a86);
    case 'sapin': return smallFir(keep);
    case 'lanterne': return stoneLantern(keep);
    case 'amphore': return amphora(keep);
    case 'fer': return horseshoe(keep);
    case 'licol': return halterHook(keep, seed);
    case 'nichoir': return birdhouse(keep);
    case 'cadre': return picture(keep, seed);
    case 'cloche': return cowbell(keep);
    case 'poulailler': return farHens(keep);
    case 'vol': {
      const f = flight(keep, opts.gulls ? { color: 0xf4f4f0, span: 0.6 } : {});
      f.g.userData.flight = f;
      return f.g;
    }
    case 'papillons': {
      // (deux papillons qui volettent ensemble d'un bord à l'autre, juste derrière lui)
      const g = new THREE.Group();
      const birds = [];
      for (const [i, c] of [0xf4b23c, 0x6ab0f0].entries()) {
        const b = butterfly(keep, c);
        b.userData.range = 0.08;
        b.userData.off = new THREE.Vector3(i * 0.18, i * 0.1, i * 0.12);
        b.userData.ph = 0;
        b.scale.setScalar(1.3);
        g.add(b);
        birds.push(b);
      }
      g.userData.flight = { g, birds };
      return g;
    }
    case 'hirondelle': {
      const f = flight(keep, { n: 1, color: 0x22263a, span: 0.3 });
      f.g.userData.flight = f;
      return f.g;
    }
    default: return null;
  }
}

/**
 * La boîte de l'animal lui-même (son pelage), sans ce qu'il porte ou traîne (longe, licol) : stage.box peut être
 * bien plus grande. Repère monde.
 */
export function animalBox(stage) {
  const m = stage.model?.coatMesh ?? null;
  if (m) {
    try {
      m.updateWorldMatrix(true, false);
      const b = new THREE.Box3().setFromObject(m);
      if (!b.isEmpty() && b.max.x - b.min.x < 6) return b;
    } catch {
      /* repli : la boîte de la scène */
    }
  }
  return stage.box?.clone?.() ?? new THREE.Box3(V(-1, 0, -0.4), V(1, 1.5, 0.4));
}

/** La taille de chaque objet (rayon au sol, hauteur), pour le placer. */
const SIZE = {
  brouette: [0.75, 0.7], fourche: [0.2, 1.5], chat: [0.12, 0.33], oiseau: [0.06, 0.11], fleurs: [0.14, 0.3], seau: [0.2, 0.3],
  poule: [0.35, 0.4], botte: [0.5, 0.42], arrosoir: [0.2, 0.32], balle: [0.06, 0.1], papillon: [0.25, 0.2], pot: [0.13, 0.35],
  coquillage: [0.12, 0.05], crabe: [0.18, 0.07], mouette: [0.12, 0.2], rocher: [0.3, 0.26], sapin: [0.33, 0.9], lanterne: [0.15, 0.7],
  amphore: [0.17, 0.52], fer: [0.08, 0.17], licol: [0.12, 0.5], nichoir: [0.09, 0.23], cadre: [0.16, 0.25], cloche: [0.08, 0.33],
};

/**
 * Pose les objets du jour (kinds : pickExtras) aux places du décor. Renvoie { group, placed, update(dt, stage),
 * dispose() }. Les objets attendent la caméra posée pour choisir leur place (dans l'image, pas devant l'animal ni sur
 * ce qu'on lui tend), puis apparaissent doucement.
 *
 * life (pickLife) : le petit plus du lieu, essayé dans l'ordre tant qu'il y a moins de min choses à voir (un gros plan
 * laisse peu de sol dans l'image) : des choses accrochées au mur ou à un poteau, un vol d'oiseaux qui traverse le ciel
 * loin derrière, des poules au loin, une hirondelle sous le toit. look : la famille du voyage (des mouettes à la plage,
 * des rochers rouges dans le bush). anywhere : pas de caméra fixe (la longe : la caméra tourne avec le cheval) — les
 * objets prennent leur place tout de suite, sans regarder l'image.
 */
export function placeExtras(stage, decor, kinds, { seed = 1, life = [], min = 3, look = null, anywhere = false } = {}) {
  const keep = bag();
  const g = new THREE.Group();
  g.name = 'objets du jour';
  decor.group.add(g);
  const spots = decor.spots ?? [];
  const items = [];
  const opts = { red: look === 'bush', gulls: look === 'plage' };
  const all = [...kinds.map((k) => ({ kind: k, life: false })), ...life.map((k) => ({ kind: k, life: true }))];
  for (const [i, { kind, life: extra }] of all.entries()) {
    const where = EXTRAS[kind];
    const cands = where === 'far' ? [] : spots.filter((s) => (where === 'air' ? s.kind === 'floor' : s.kind === where));
    if (where !== 'far' && !cands.length && !(decor.area && (where === 'floor' || where === 'air'))) continue;
    if (where === 'far' && anywhere) continue;
    const m = extraModel(kind, keep, seed + i * 7, opts);
    if (!m) continue;
    m.visible = false;
    g.add(m);
    // (l'ordre des places essayées : tiré de la graine du jour)
    const r = seeded(hashSeed(`${seed}|${kind}|${i}`));
    const order = cands.map((s) => ({ s, v: r() })).sort((a, b) => a.v - b.v).map((x) => x.s);
    items.push({ kind, m, order, where, life: extra, grow: 0, at: null, why: {}, path: null });
  }
  const placed = [];
  let tried = false;
  let frames = 0;

  let box = null;
  const tmp = V();
  /** La place p convient-elle à cet objet (dans l'image, rien de gênant) ? */
  function fits(st, it, p, taken) {
    const no = (why) => {
      it.why[why] = (it.why[why] ?? 0) + 1;
      return false;
    };
    const [rad, h] = SIZE[it.kind] ?? [0.2, 0.3];
    for (const q of taken) if (q.distanceTo(p) < rad + 0.25) return no('pris');
    // (ni sur ce qu'on lui tend : mangeoire, seau, gamelles, filet…)
    for (const pr of Object.values(decor.props ?? {})) {
      const o = pr?.group;
      if (!o || !o.visible || !o.parent) continue;
      const w = o.getWorldPosition(V());
      if (w.distanceTo(p) < rad + 0.45) return no('accessoire');
      if (anywhere || !st.view) continue;
      const a = st.project(w);
      const b = st.project(p.clone().add(V(0, h * 0.5, 0)));
      if (Math.hypot(a.x - b.x, a.y - b.y) < 70) return no('accessoire (image)');
    }
    const v = st.view;
    if (!v || anywhere) return true;
    const pts = [p.clone(), p.clone().add(V(0, h, 0)), p.clone().add(V(rad, h * 0.5, 0)), p.clone().add(V(-rad, h * 0.5, 0))];
    const top = v.y0 + 40;
    for (const [i, q] of pts.entries()) {
      const s = st.project(q);
      // (au bord du cadre, un objet au sol peut dépasser un peu sur le côté : son pied et son haut restent dans l'image)
      const side = i >= 2 && it.where === 'floor' ? 30 : -8;
      if (s.behind || s.x < v.x0 - side || s.x > v.x1 + side || s.y < top || s.y > v.y1 - 8) return no('hors image');
    }
    // (pas sur sa tête, même derrière lui : on la voit toujours en entier)
    const hd = st.live?.('head');
    if (hd) {
      const hc = st.project(hd);
      const hr = st.projectRadius(hd, 0.26 * Math.max(0.25, box ? box.max.y - box.min.y : 1)) + 10;
      for (const q of pts) {
        const s = st.project(q);
        if (Math.hypot(s.x - hc.x, s.y - hc.y) < hr) return no('tête');
      }
    }
    // (jamais devant l'animal : s'il est plus près de nous que l'animal et qu'il le recouvre dans l'image ; ni trop
    // près de nous)
    if (box && p.z > box.max.z + 0.45 * (box.max.y - box.min.y) + 0.2) return no('trop près');
    // (devant lui : pas du tout sur lui dans l'image — sa boîte, celle de son pelage)
    if (box && p.z + rad > box.min.z + 0.1 * (box.max.z - box.min.z)) {
      const c = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) c.push(st.project(tmp.set(x, y, z)));
      const ax0 = Math.min(...c.map((q) => q.x));
      const ax1 = Math.max(...c.map((q) => q.x));
      const ay0 = Math.min(...c.map((q) => q.y));
      const ay1 = Math.max(...c.map((q) => q.y));
      const o = [];
      for (const dx of [-rad, rad]) for (const dz of [-rad, rad]) for (const y of [0, h]) o.push(st.project(tmp.set(p.x + dx, p.y + y, p.z + dz)));
      const ox0 = Math.min(...o.map((q) => q.x));
      const ox1 = Math.max(...o.map((q) => q.x));
      const oy0 = Math.min(...o.map((q) => q.y));
      const oy1 = Math.max(...o.map((q) => q.y));
      if (ox1 > ax0 && ox0 < ax1 && oy1 > ay0 && oy0 < ay1) return no('devant');
    }
    // (ne cache jamais l'animal : entre la caméra et chacun de ses points, pas de peau plus loin derrière l'objet)
    if (st.proxy?.hit) {
      const cam = st.camera.position;
      // (le contour de l'objet, à plusieurs hauteurs : un petit sapin ne déborde pas sur son poitrail)
      const ring = [];
      for (const k of [0.25, 0.6, 0.9]) for (const [dx, dz] of [[rad, 0], [-rad, 0], [0, rad], [0, -rad]]) ring.push(p.clone().add(V(dx * (1.1 - k * 0.5), h * k, dz * (1.1 - k * 0.5))));
      for (const q of [...pts, ...ring]) {
        const dir = q.clone().sub(cam);
        const d = dir.length();
        const h2 = st.proxy.hit(new THREE.Ray(cam.clone(), dir.normalize()), -9, 1e9);
        if (h2 && h2.point.distanceTo(cam) > d - 0.02) return no('devant');
      }
    }
    return true;
  }

  /** Des places au sol dans l'image : sous des points de l'image, dans la zone du décor (decor.area), pas sous lui. */
  function floorInView(st) {
    const A = decor.area;
    const v = st.view;
    if (!A || !v || !st.rayAt) return [];
    const out = [];
    for (let gy = 0.42; gy <= 0.96; gy += 0.06) {
      for (let gx = 0.03; gx <= 0.98; gx += 0.07) {
        const ray = st.rayAt(v.x0 + gx * (v.x1 - v.x0), v.y0 + gy * (v.y1 - v.y0));
        if (ray.direction.y > -1e-3) continue;
        const t = (A.y - ray.origin.y) / ray.direction.y;
        const p = ray.origin.clone().addScaledVector(ray.direction, t);
        if (p.x < A.x0 || p.x > A.x1 || p.z < A.z0 || p.z > A.z1) continue;
        if (box && p.x > box.min.x - 0.15 && p.x < box.max.x + 0.15 && p.z > box.min.z - 0.15 && p.z < box.max.z + 0.15) continue;
        // (sur une grille de 20 cm : la même place d'une fois à l'autre, même si la caméra bouge d'un rien)
        out.push({ kind: 'floor', p: [Math.round(p.x * 5) / 5, A.y, Math.round(p.z * 5) / 5] });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- au loin : derrière lui, rien ne le cache
  let walls = null;
  /** Ce point se voit-il depuis la caméra (ni derrière un mur ou la clôture pleine, ni derrière l'animal) ? */
  function seen(st, q) {
    const cam = st.camera.position;
    const dir = q.clone().sub(cam);
    const d = dir.length();
    dir.normalize();
    if (st.proxy?.hit) {
      const h = st.proxy.hit(new THREE.Ray(cam.clone(), dir), -9, 1e9);
      if (h && h.point.distanceTo(cam) < d - 0.05) return false;
    }
    if (!walls) {
      walls = [];
      for (const c of decor.group.children) {
        if (c === g) continue;
        c.traverse((o) => {
          if (o.isMesh && !o.isInstancedMesh && o.visible && !o.userData?.grass && !o.userData?.sky && o.geometry) walls.push(o);
        });
      }
    }
    const rc = new THREE.Raycaster(cam.clone(), dir, 0.05, d - 0.05);
    for (const o of walls) {
      // (le ciel, l'herbe, la pluie : transparents pour ça)
      if (o.material?.transparent || !o.parent) continue;
      if (rc.intersectObject(o, false).length) return false;
    }
    return true;
  }

  function farPlace(st, it) {
    const v = st.view;
    if (!v || !st.rayAt || !box) return false;
    const W = v.x1 - v.x0;
    const H = v.y1 - v.y0;
    const hd = st.live?.('head');
    const hc = hd ? st.project(hd) : null;
    const hr = hd ? st.projectRadius(hd, 0.3 * Math.max(0.25, box.max.y - box.min.y)) + 14 : 0;
    const r = seeded(hashSeed(`${seed}|${it.kind}|loin`));
    if (it.kind === 'poulailler') {
      if (!decor.outdoor) return false;
      const cands = [];
      for (let gy = 0.12; gy <= 0.8; gy += 0.05) {
        for (let gx = 0.08; gx <= 0.92; gx += 0.06) {
          const ray = st.rayAt(v.x0 + gx * W, v.y0 + gy * H);
          if (ray.direction.y > -1e-3) continue;
          const p = ray.origin.clone().addScaledVector(ray.direction, -ray.origin.y / ray.direction.y);
          if (p.z > box.min.z - 2.2 || p.z < box.min.z - 7.5) continue;
          cands.push({ p, v: r() });
        }
      }
      cands.sort((a, b) => a.v - b.v);
      let n = 0;
      for (const { p } of cands) {
        if (++n > 80) break;
        const pts = [p, p.clone().add(V(0, 0.55, 0)), p.clone().add(V(0.9, 0.3, 0.5)), p.clone().add(V(-0.6, 0.3, 0))];
        let ok = true;
        for (const q of pts) {
          const s = st.project(q);
          if (s.behind || s.x < v.x0 + 10 || s.x > v.x1 - 10 || s.y < v.y0 + 40 || s.y > v.y1 - 10) ok = false;
          if (hc && Math.hypot(s.x - hc.x, s.y - hc.y) < hr) ok = false;
        }
        // (au moins une des deux poules se voit : entre les lisses de la clôture, à côté de lui)
        if (!ok || !(seen(st, p.clone().add(V(0, 0.3, 0))) || seen(st, p.clone().add(V(0.8, 0.3, 0.5))))) continue;
        it.at = p;
        it.m.position.copy(p);
        it.m.rotation.y = (r() - 0.5) * 1.5;
        return true;
      }
      it.why.loin = (it.why.loin ?? 0) + 1;
      return false;
    }
    // un vol d'oiseaux (dehors), une hirondelle (dedans) : d'un bord de l'image à l'autre, loin derrière lui
    const out = !!decor.outdoor;
    const bfly = it.kind === 'papillons';
    if (bfly ? !out : out !== (it.kind === 'vol')) return false;
    // (les papillons : juste derrière lui, à hauteur de fleurs et de tête ; le vol d'oiseaux : loin, au-dessus des
    // clôtures ; l'hirondelle : devant le mur du fond, sous le toit)
    const zP = bfly ? box.min.z - 0.7 : out ? box.min.z - 8 : Math.min(box.min.z - 0.25, (decor.area?.z0 ?? box.min.z - 0.8) + 0.2);
    const roof = decor.dims?.roof ?? decor.dims?.eave ?? decor.room?.roof ?? 2.6;
    const y0 = bfly ? 0.25 : out ? 1.3 : Math.max(1.0, box.min.y + (box.max.y - box.min.y) * 0.75);
    const y1 = bfly ? Math.max(1, box.max.y + 0.4) : out ? 8 : roof - 0.25;
    const at = (sx, sy) => {
      const ray = st.rayAt(sx, sy);
      if (ray.direction.z > -1e-3) return null;
      return ray.origin.clone().addScaledVector(ray.direction, (zP - ray.origin.z) / ray.direction.z);
    };
    const best = [];
    for (const fy of bfly ? [0.12, 0.22, 0.32, 0.42, 0.52] : [0.04, 0.1, 0.17, 0.25, 0.33, 0.42]) {
      const sy = v.y0 + 44 + fy * (H - 44);
      const a = at(v.x0 - 0.12 * W, sy);
      const b = at(v.x1 + 0.12 * W, sy);
      const m = at((v.x0 + v.x1) / 2 + (r() - 0.5) * 0.3 * W, sy);
      if (!a || !b || !m) continue;
      if (Math.min(a.y, b.y) < y0 || Math.max(a.y, b.y) > y1) continue;
      if (!seen(st, m)) continue;
      // (de préférence au-dessus de sa tête : pas en travers de son visage, même loin derrière)
      const overHead = hc && sy > hc.y - hr && sy < hc.y + hr;
      best.push({ a, b, k: overHead ? 1 : 0, v: r() });
    }
    if (!best.length) {
      it.why.ciel = (it.why.ciel ?? 0) + 1;
      return false;
    }
    best.sort((p, q) => p.k - q.k || p.v - q.v);
    it.path = best[0];
    it.at = best[0].a.clone().lerp(best[0].b, 0.5);
    it.t = r() * 3;
    return true;
  }

  function place(st) {
    tried = true;
    box = animalBox(st);
    // (la caméra à jour, même sans image rendue depuis qu'elle a bougé)
    st.camera.updateMatrixWorld?.();
    decor.group.updateMatrixWorld(true);
    const taken = [];
    const seenFloor = anywhere ? [] : floorInView(st);
    let count = 0;
    for (const it of items) {
      // (le petit plus : seulement s'il manque encore de quoi voir)
      if (it.life && count >= min) continue;
      if (it.where === 'far') {
        if (farPlace(st, it)) {
          count++;
          placed.push(it.kind);
          if (!it.path) {
            it.m.visible = true;
            it.m.scale.setScalar(0.001);
          }
        }
        continue;
      }
      // (au sol : d'abord des places qu'on voit, tirées dans l'ordre du jour, puis celles du décor)
      if ((it.where === 'floor' || it.where === 'air') && seenFloor.length) {
        const r = seeded(hashSeed(`${seed}|${it.kind}|vue`));
        it.order = seenFloor.map((s) => ({ s, v: r() })).sort((a, b) => a.v - b.v).map((x) => x.s).concat(it.order);
      }
      for (const s of it.order) {
        const p = V(...s.p);
        if (it.where === 'air') p.y += 0.35 + 0.25 * Math.min(1.5, box ? box.max.y : 1);
        // (appuyée contre le mur : le pied un peu en avant, le haut contre le mur)
        if (it.where === 'lean') p.add(V(Math.sin(s.face ?? 0) * 0.3, 0, Math.cos(s.face ?? 0) * 0.3));
        if (!fits(st, it, p, taken)) continue;
        it.at = p;
        it.m.position.copy(p);
        // (face à nous, avec un petit angle ; posé sur une lisse, le long de celle-ci ; accroché : face au dehors du mur)
        const r = seeded(hashSeed(`${it.kind}|${s.p.join(',')}`));
        it.m.rotation.y = s.face ?? (it.where === 'lean' ? (r() - 0.5) * 0.3 : it.kind === 'brouette' || it.kind === 'botte' ? (r() - 0.5) * 0.6 : (r() - 0.5) * 1.2);
        if (it.kind === 'chat' || it.kind === 'oiseau' || it.kind === 'mouette') it.m.rotation.y = (s.face ?? 0) + (r() - 0.5) * 0.5 + (it.kind !== 'chat' ? Math.PI / 2 : 0);
        if (it.where === 'hang') it.m.rotation.y = s.face ?? 0;
        if (it.kind === 'poule') it.m.userData.range = 0.35;
        it.m.visible = true;
        it.m.scale.setScalar(0.001);
        taken.push(p);
        placed.push(it.kind);
        count++;
        break;
      }
    }
  }

  /** Le vol : traverse l'image en quelques secondes, attend, repart (dans l'autre sens pour l'hirondelle). */
  const _d = V();
  function fly(it, dt) {
    const f = it.m.userData.flight;
    const P = it.path;
    const swallow = it.kind === 'hirondelle';
    const bfly = it.kind === 'papillons';
    const T = swallow ? 3.2 : bfly ? 11 : 8;
    const wait = swallow ? 4 : bfly ? 3 : 6;
    it.t += dt;
    const k = it.t % (T + wait);
    const back = (swallow || bfly) && Math.floor(it.t / (T + wait)) % 2 === 1;
    if (k > T) {
      it.m.visible = false;
      return;
    }
    it.m.visible = true;
    const u = k / T;
    const a = back ? P.b : P.a;
    const b = back ? P.a : P.b;
    _d.subVectors(b, a);
    it.m.position.copy(a).addScaledVector(_d, u);
    it.m.position.y += Math.sin(u * Math.PI * (swallow ? 3 : bfly ? 4 : 1.5)) * (swallow ? 0.18 : bfly ? 0.12 : 0.5);
    it.m.rotation.y = bfly ? 0 : Math.atan2(-_d.z, _d.x);
    for (const bd of f.birds) {
      bd.position.copy(bd.userData.off);
      bd.userData.flap?.(it.t * (swallow ? 22 : 9) + bd.userData.ph);
      bd.userData.step?.(dt);
    }
  }

  return {
    group: g,
    placed,
    items,
    /** Les places au sol qu'on voit en ce moment (essais). */
    floorInView: (st) => floorInView(st),
    /** Choisit les places maintenant (tests ; le jeu attend la caméra posée). */
    placeNow(st) {
      place(st);
      for (const it of items) if (it.at && !it.path) it.m.scale.setScalar(1);
    },
    update(dt, st) {
      // (quelques images après l'ouverture : la caméra est à sa place, pas à l'origine ; sans caméra fixe, tout de suite)
      if (!tried && (anywhere || (st.ready && ++frames > 3 && (st.settled?.(0.02) ?? true)))) place(st);
      for (const it of items) {
        if (!it.at) continue;
        if (it.path) {
          fly(it, dt);
          continue;
        }
        if (it.grow < 1) {
          it.grow = Math.min(1, it.grow + dt / 0.45);
          const k = it.grow;
          it.m.scale.setScalar(Math.max(0.001, 1 - (1 - k) * (1 - k)));
        }
        it.m.userData.step?.(dt);
      }
    },
    dispose() {
      g.parent?.remove(g);
      keep.dispose();
    },
  };
}
