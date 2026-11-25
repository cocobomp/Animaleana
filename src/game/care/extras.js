// Les petits objets du jour autour de l'animal, dans la scène de soin : une brouette, une fourche contre le mur, un chat
// sur le muret, un oiseau sur la clôture, des fleurs, un seau renversé, une poule qui passe, une botte de paille, un
// arrosoir, une balle, un papillon, un pot de fleurs. Lesquels : pickExtras (setting.js, tirés au sort de façon stable
// pour la journée). Où : aux places que le décor propose (decor.spots : au sol, en haut d'un muret ou d'une clôture,
// contre un mur) et sur les pans de mur qu'on voit (decor.hangAreas), choisies pour l'image — dans l'image, jamais
// devant l'animal ni sur ce qu'on lui tend — et revues à chaque fois que le jeu recadre. Les gros plans ont en plus un
// rouge-gorge, une souris, un escargot, des choses accrochées (pickLife). Tout est fait en code, léger (quelques
// formes simples), et libéré à la fermeture.

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

/** Les toutes petites choses (une souris, un escargot, des carottes au mur) : leur ombre ne se verrait pas, elle coûterait. */
function lit(o) {
  o.traverse((m) => {
    if (m.isMesh) m.receiveShadow = true;
  });
  return o;
}

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
    const range = g.userData.range ?? 0.3;
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

/**
 * Une petite souris grise qui trottine dans la paille, s'arrête, renifle, repart (de RANGE.souris de part et d'autre
 * de sa place). ~0,05 m : on la voit même en gros plan sur un mouton ou un sabot, même la nuit.
 */
function mouse(keep) {
  const g = new THREE.Group();
  const b = new THREE.Group();
  g.add(b);
  const fur = std(keep, 0x8a8078, { roughness: 0.95 });
  const pink = std(keep, 0xe8a8a0, { roughness: 0.7 });
  const dark = std(keep, 0x111111, { roughness: 0.3 });
  const body = new THREE.Mesh(keep(new THREE.SphereGeometry(0.022, 12, 8)), fur);
  body.scale.set(1.6, 1, 1);
  body.position.y = 0.022;
  b.add(body);
  const head = new THREE.Group();
  head.position.set(0.035, 0.026, 0);
  b.add(head);
  const snout = new THREE.Mesh(keep(new THREE.ConeGeometry(0.014, 0.034, 10)), fur);
  snout.rotation.z = -Math.PI / 2;
  snout.position.x = 0.012;
  head.add(snout);
  const nose = new THREE.Mesh(keep(new THREE.SphereGeometry(0.004, 6, 4)), pink);
  nose.position.x = 0.03;
  head.add(nose);
  const ear = keep(new THREE.SphereGeometry(0.009, 8, 6));
  const eye = keep(new THREE.SphereGeometry(0.003, 6, 4));
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(ear, pink);
    e.scale.set(0.4, 1, 1);
    e.position.set(-0.004, 0.012, s * 0.011);
    head.add(e);
    const ey = new THREE.Mesh(eye, dark);
    ey.position.set(0.012, 0.006, s * 0.008);
    head.add(ey);
  }
  const tail = new THREE.Mesh(keep(new THREE.TorusGeometry(0.03, 0.002, 4, 12, Math.PI * 0.8)), pink);
  tail.rotation.x = Math.PI / 2;
  tail.position.set(-0.06, 0.008, -0.012);
  b.add(tail);
  // (elle trottine un peu, s'arrête, renifle, repart dans l'autre sens)
  let t = Math.random() * 7;
  g.userData.step = (dt) => {
    t += dt;
    const k = t % 7;
    const R = g.userData.range ?? 0.06;
    const run = k < 0.6 || (k > 3.5 && k < 4.1);
    const ph = k < 3.5 ? Math.min(1, k / 0.6) : Math.max(0, 1 - (k - 3.5) / 0.6);
    b.position.x = (ph - 0.5) * 2 * R;
    b.rotation.y = k < 3.5 ? 0 : Math.PI;
    b.position.y = run ? Math.abs(Math.sin(t * 30)) * 0.003 : 0;
    head.rotation.z = run ? 0 : Math.sin(t * 9) * 0.12;
  };
  return lit(g);
}

/**
 * Un escargot qui avance tout doucement (sa coquille rousse enroulée, ses cornes qui bougent) : il sort la nuit et
 * sous la pluie. ~0,05 m : on le voit même en gros plan sur un lapin.
 */
function snail(keep) {
  const g = new THREE.Group();
  const b = new THREE.Group();
  g.add(b);
  const skin = std(keep, 0xb8a888, { roughness: 0.4 });
  const shell = std(keep, 0xa8603a, { roughness: 0.5 });
  const band = std(keep, 0xe0b878, { roughness: 0.5 });
  const dark = std(keep, 0x2a2018, { roughness: 0.3 });
  const foot = new THREE.Mesh(keep(new THREE.SphereGeometry(0.012, 10, 6)), skin);
  foot.scale.set(3.2, 0.7, 1);
  foot.position.y = 0.008;
  b.add(foot);
  const neck = new THREE.Mesh(keep(new THREE.SphereGeometry(0.008, 8, 6)), skin);
  neck.scale.set(1.4, 1.2, 1);
  neck.position.set(0.032, 0.016, 0);
  b.add(neck);
  const sh = new THREE.Mesh(keep(new THREE.SphereGeometry(0.018, 12, 10)), shell);
  sh.scale.set(1, 1, 0.75);
  sh.position.set(-0.006, 0.028, 0);
  b.add(sh);
  const sp = new THREE.Mesh(keep(new THREE.TorusGeometry(0.011, 0.0035, 6, 16, Math.PI * 1.6)), band);
  sp.position.set(-0.006, 0.028, 0.0135);
  b.add(sp);
  const horn = keep(new THREE.CylinderGeometry(0.0012, 0.0015, 0.016, 4));
  const tip = keep(new THREE.SphereGeometry(0.0025, 6, 4));
  const horns = [];
  for (const s of [-1, 1]) {
    const h = new THREE.Group();
    h.position.set(0.036, 0.022, s * 0.004);
    h.rotation.set(s * 0.3, 0, -0.35);
    b.add(h);
    const c = new THREE.Mesh(horn, skin);
    c.position.y = 0.008;
    h.add(c);
    const e = new THREE.Mesh(tip, dark);
    e.position.y = 0.016;
    h.add(e);
    horns.push({ h, s });
  }
  // (il avance, s'arrête, fait demi-tour au bout de sa petite course)
  let t = Math.random() * 20;
  g.userData.step = (dt) => {
    t += dt;
    const k = t % 20;
    const R = g.userData.range ?? 0.03;
    const ph = k < 10 ? k / 10 : 1 - (k - 10) / 10;
    b.position.x = (ph - 0.5) * 2 * R;
    b.rotation.y = k < 10 ? 0 : Math.PI;
    for (const { h, s } of horns) h.rotation.x = s * (0.3 + Math.sin(t * 1.7 + s) * 0.15);
  };
  return lit(g);
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
    // (toujours au-dessus de sa place, ailes comprises : placeExtras vérifie de sa place à sa place + SIZE)
    const R = g.userData.range ?? 0.24;
    fly.position.set(Math.cos(t * 0.6) * R, Math.sin(t * 1.3) * 0.06 + 0.12, Math.sin(t * 0.6) * R * 0.5);
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

/** Une botte de carottes pendue à un clou par ses fanes, la ficelle autour (le lapin la regarde). */
function carrots(keep, seed = 1) {
  const g = new THREE.Group();
  const r = seeded(seed);
  const orange = std(keep, 0xf08a2a, { roughness: 0.7 });
  const green = std(keep, 0x4f9a3a, { roughness: 0.8 });
  const twine = std(keep, 0xc8b48a, { roughness: 1 });
  const root = keep(new THREE.ConeGeometry(0.017, 0.11, 8));
  const top = keep(new THREE.ConeGeometry(0.009, 0.06, 5));
  // (en éventail sous la ficelle, la pointe en bas)
  for (let i = 0; i < 4; i++) {
    const a = (i - 1.5) * 0.24 + (r() - 0.5) * 0.08;
    const pv = new THREE.Group();
    pv.position.set(0, 0.135, 0.03);
    pv.rotation.z = a;
    g.add(pv);
    const c = new THREE.Mesh(root, orange);
    c.rotation.z = Math.PI;
    c.position.y = -0.065;
    pv.add(c);
    const f = new THREE.Mesh(top, green);
    f.position.set((r() - 0.5) * 0.01, 0.028, 0);
    f.rotation.z = (r() - 0.5) * 0.5;
    pv.add(f);
  }
  const knot = new THREE.Mesh(keep(new THREE.TorusGeometry(0.019, 0.004, 4, 12)), twine);
  knot.rotation.x = Math.PI / 2;
  knot.position.set(0, 0.145, 0.03);
  g.add(knot);
  const line = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.002, 0.002, 0.05, 4)), twine);
  line.position.set(0, 0.18, 0.017);
  line.rotation.x = 0.5;
  g.add(line);
  const nail = new THREE.Mesh(keep(new THREE.SphereGeometry(0.005, 6, 4)), std(keep, 0x3a3a3e));
  nail.position.set(0, 0.203, 0.005);
  g.add(nail);
  return lit(g);
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
    case 'carottes': return carrots(keep, seed);
    case 'souris': return mouse(keep);
    case 'escargot': return snail(keep);
    case 'poulailler': return farHens(keep);
    case 'rougegorge': {
      const b = bird(keep);
      b.scale.setScalar(2.1);
      const g = new THREE.Group();
      g.add(b);
      g.userData.step = (dt) => b.userData.step?.(dt);
      return g;
    }
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
        b.scale.setScalar(1.8);
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


/**
 * La taille de chaque objet (rayon au sol, hauteur), pour le placer. Ce qui bouge compte toute sa course : la poule va
 * et vient de RANGE.poule de part et d'autre de sa place, plus son bec et sa queue (0,23 m) ; le papillon volette en
 * rond, plus ses ailes ; le crabe marche de côté.
 */
const SIZE = {
  brouette: [0.75, 0.7], fourche: [0.2, 1.5], chat: [0.12, 0.33], oiseau: [0.06, 0.11], fleurs: [0.14, 0.3], seau: [0.2, 0.3],
  poule: [0.6, 0.45], botte: [0.5, 0.42], arrosoir: [0.2, 0.32], balle: [0.06, 0.1], papillon: [0.33, 0.26], pot: [0.13, 0.35],
  coquillage: [0.12, 0.05], crabe: [0.2, 0.07], mouette: [0.12, 0.2], rocher: [0.3, 0.26], sapin: [0.33, 0.9], lanterne: [0.15, 0.7],
  amphore: [0.17, 0.52], fer: [0.08, 0.17], licol: [0.12, 0.5], nichoir: [0.09, 0.23], cadre: [0.16, 0.25], cloche: [0.08, 0.33],
  carottes: [0.08, 0.21], souris: [0.15, 0.06], escargot: [0.08, 0.05],
};
/** La course de ce qui bouge autour de sa place (m), déjà comptée dans SIZE. */
const RANGE = { poule: 0.3, papillon: 0.24, souris: 0.06, escargot: 0.03 };
/** Ce qui se perche (EXTRAS : 'perch') mais peut aussi s'asseoir ou sautiller par terre. */
const FLOOR_TOO = new Set(['chat', 'oiseau']);

/** La taille d'un objet du jour pour le placer : [rayon, hauteur] (tests). */
export function extraSize(kind) {
  return SIZE[kind] ?? [0.2, 0.3];
}

/** La course que placeExtras donne à ce qui bouge (userData.range), ou null (tests). */
export function extraRange(kind) {
  return RANGE[kind] ?? null;
}

/**
 * Sur un pan de mur (decor.hangAreas), la hauteur du bas de chaque chose accrochée (m) : un licol à hauteur d'homme, un
 * cadre pas au ras du sol, la botte de carottes à hauteur de lapin.
 */
const HANG_Y = { fer: [0.6, 2.7], licol: [0.9, 2.3], cloche: [0.6, 2.5], nichoir: [0.5, 2.6], cadre: [0.4, 1.9], carottes: [0.04, 1.2] };

const _bb = new THREE.Box3();
/** La boîte (monde) de ce qu'on voit d'un objet : ses maillages visibles seulement (un accessoire range sa main cachée). */
function shownBox(o, out = new THREE.Box3()) {
  out.makeEmpty();
  o.updateWorldMatrix(true, true);
  o.traverseVisible((m) => {
    if (!m.isMesh || !m.geometry) return;
    if (m.isSkinnedMesh || m.isInstancedMesh) {
      if (!m.boundingBox) m.computeBoundingBox();
      out.union(_bb.copy(m.boundingBox).applyMatrix4(m.matrixWorld));
      return;
    }
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    out.union(_bb.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld));
  });
  return out;
}

/** L'objet et tous ses parents sont-ils visibles ? */
function shown(o) {
  for (let p = o; p; p = p.parent) if (p.visible === false) return false;
  return true;
}

/** Deux rectangles de l'image ({ x0, x1, y0, y1 }) se touchent-ils (à m px près) ? */
function overlap(a, b, m = 0) {
  return a.x1 + m > b.x0 && a.x0 - m < b.x1 && a.y1 + m > b.y0 && a.y0 - m < b.y1;
}

/**
 * Pose les objets du jour (kinds : pickExtras) aux places du décor. Renvoie { group, placed, items, update(dt, stage),
 * dispose() }. Les objets attendent la caméra posée pour choisir leur place (dans l'image, pas devant l'animal ni sur
 * ce qu'on lui tend), puis apparaissent doucement. Quand le jeu recadre, chacun est revu : ce qui n'aura plus sa place
 * s'efface avant que la caméra arrive, ce qui passerait devant l'animal disparaît tout de suite, et une fois la caméra
 * posée, ce qui manque reprend une place dans la nouvelle image (ce qui est bien placé ne bouge pas).
 *
 * life (pickLife) : le petit plus du lieu, essayé dans l'ordre tant qu'il y a moins de min choses à voir (un gros plan
 * laisse peu de sol dans l'image) : des choses accrochées au mur ou à un poteau, un vol d'oiseaux qui traverse le ciel
 * loin derrière, des poules au loin, une hirondelle sous le toit. look : la famille du voyage (des mouettes à la plage,
 * des rochers rouges dans le bush). anywhere : pas de caméra fixe (la longe : la caméra tourne avec le cheval) — les
 * objets prennent leur place tout de suite, sans regarder l'image.
 *
 * Le décor propose ses places (decor.spots : { kind, p, face, wall }) et ses pans de mur où accrocher ce qu'on veut
 * (decor.hangAreas : { axis 'z' ou 'x', at (la face du mur), u0, u1 (le long du mur), y0, y1, face, wall, holes }) ;
 * wall : le groupe du mur, que le décor cache quand la caméra passe derrière.
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
    const ground = where === 'floor' || where === 'air' || FLOOR_TOO.has(kind);
    const cands = where === 'far' ? [] : spots.filter((s) => (where === 'air' ? s.kind === 'floor' : s.kind === where));
    // (un chat, un oiseau : perchés de préférence, sinon par terre)
    if (FLOOR_TOO.has(kind)) cands.push(...spots.filter((s) => s.kind === 'floor'));
    const areas = where === 'hang' && decor.hangAreas?.length;
    if (where !== 'far' && !cands.length && !areas && !(decor.area && ground)) continue;
    if (where === 'far' && anywhere) continue;
    const m = extraModel(kind, keep, seed + i * 7, opts);
    if (!m) continue;
    m.visible = false;
    if (RANGE[kind]) m.userData.range = RANGE[kind];
    g.add(m);
    // (l'ordre des places essayées : tiré de la graine du jour)
    const r = seeded(hashSeed(`${seed}|${kind}|${i}`));
    const order = cands.map((s) => ({ s, v: r() })).sort((a, b) => a.v - b.v).map((x) => x.s);
    items.push({ kind, i, m, order, where, ground, life: extra, grow: 0, fade: 0, at: null, spot: null, why: {}, path: null });
  }
  const placed = [];
  let tried = false;
  let waited = 0;
  let frames = 0;

  let box = null;
  const tmp = V();
  const rc = new THREE.Raycaster();

  // ---------------------------------------------------------------- ce qui gêne : l'animal, ce qu'on lui tend

  /** La boîte de l'animal dans sa pose du moment (la copie figée des rayons), sinon celle de son pelage. */
  function freshBox(st) {
    const b = st.proxy?.geo?.boundingBox;
    if (b && !b.isEmpty() && b.max.x - b.min.x < 6) return b.clone();
    return animalBox(st);
  }

  /**
   * Le rectangle d'une boîte (monde) dans l'image : ses coins devant la caméra, gardé à ce qu'on voit de l'image (ce
   * qui se recouvre au-dessus de l'image ne gêne personne) ; null s'il n'y en a rien dans l'image.
   */
  function rectOf(st, b) {
    const r = rawRect(st, b);
    const v = st.view;
    if (!r || !v) return r;
    const c = { x0: Math.max(r.x0, v.x0), x1: Math.min(r.x1, v.x1), y0: Math.max(r.y0, v.y0), y1: Math.min(r.y1, v.y1) };
    return c.x0 <= c.x1 && c.y0 <= c.y1 ? c : null;
  }

  /** Le rectangle d'une boîte (monde) dans l'image, tout entier : ses coins devant la caméra ; null s'il n'y en a aucun. */
  function rawRect(st, b) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const x of [b.min.x, b.max.x]) {
      for (const y of [b.min.y, b.max.y]) {
        for (const z of [b.min.z, b.max.z]) {
          const q = st.project(tmp.set(x, y, z));
          if (q.behind) continue;
          x0 = Math.min(x0, q.x);
          x1 = Math.max(x1, q.x);
          y0 = Math.min(y0, q.y);
          y1 = Math.max(y1, q.y);
        }
      }
    }
    return x0 <= x1 ? { x0, x1, y0, y1 } : null;
  }

  /**
   * Ce qu'on ne doit jamais cacher, en plus de l'animal : ce qu'on lui tend (les accessoires du décor, notre main), la
   * plaque à son nom. far : la distance de la caméra à son point le plus loin (ce qui est tout entier plus loin ne le
   * cache pas, c'est lui qui le cache).
   */
  function obstacles(st) {
    const out = [];
    const cam = st.camera.position;
    const farOf = (b) => {
      let far = 0;
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) far = Math.max(far, cam.distanceTo(tmp.set(x, y, z)));
      return far;
    };
    const add = (o, kind) => {
      if (!o?.parent || !shown(o)) return;
      const b = shownBox(o);
      if (b.isEmpty()) return;
      out.push({ box: b, rect: st.view && !anywhere ? rectOf(st, b) : null, kind, far: farOf(b) });
    };
    for (const pr of Object.values(decor.props ?? {})) add(pr?.group, 'accessoire');
    // (et ce que le jeu a mis dans la scène : notre main, la seringue, la brosse, le mors — pas un décor entier, ni les
    // petits effets de la scène, souffle ou brins)
    // (elles sont souvent tout près de nous, le bras qui entre par le bord de l'image)
    const fx = new Set((st.fx ?? []).map((f) => f.obj));
    for (const c of st.scene?.children ?? []) {
      if (c === st.holder || c === decor.group || c.isLight || c.isCamera || fx.has(c) || !shown(c)) continue;
      const b = shownBox(c);
      const sz = b.getSize(tmp);
      if (b.isEmpty() || Math.max(sz.x, sz.y, sz.z) < 0.005 || sz.x > 1.6 || sz.y > 1.6 || sz.z > 1.6) continue;
      out.push({ box: b, rect: st.view && !anywhere ? rectOf(st, b) : null, kind: 'accessoire', far: farOf(b) });
    }
    add(decor.plate, 'plaque');
    return out;
  }

  /**
   * Ce qui ne change pas pendant une série d'essais : la boîte de l'animal et son rectangle dans l'image, sa tête, ce
   * qu'on lui tend. Refait la copie figée de l'animal pour les rayons (au plus deux fois par seconde : elle coûte).
   */
  function survey(st) {
    st.camera.updateMatrixWorld?.();
    decor.group.updateMatrixWorld(true);
    const P = st.proxy;
    if (P?.bake && (st.time ?? 0) - (P.at ?? -Infinity) > 0.5) {
      P.at = st.time ?? 0;
      P.bake();
    }
    box = freshBox(st);
    const S = { obs: obstacles(st), arect: st.view && !anywhere ? rectOf(st, box) : null, hc: null, hr: 0, head: null, hm: 0 };
    const hd = st.live?.('head');
    if (hd && st.view && !anywhere) {
      const H = Math.max(0.25, box.max.y - box.min.y);
      S.hc = st.project(hd);
      S.hr = st.projectRadius(hd, 0.26 * H) + 10;
      // (le nez, le front, les oreilles : à moins d'un quart de sa hauteur du milieu de sa tête ; et quelques
      // centimètres d'air autour)
      S.head = headRect(st, hd, 0.22 * H);
      S.hm = st.projectRadius(hd, 0.03 * H) + 8;
    }
    return S;
  }

  /**
   * Sa tête dans l'image : le rectangle des points de l'animal (la copie figée des rayons, pose du moment) à moins de
   * R de sa tête — le bout du nez, le front, les oreilles —, plus serré qu'un disque autour d'elle (en gros plan, un
   * disque prenait toute l'image) ; null sans ces points (on garde alors le disque).
   */
  function headRect(st, hd, R) {
    const P = st.proxy?.pos;
    if (!P?.length) return null;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    const R2 = R * R;
    for (let i = 0; i < P.length; i += 3) {
      const dx = P[i] - hd.x;
      const dy = P[i + 1] - hd.y;
      const dz = P[i + 2] - hd.z;
      if (dx * dx + dy * dy + dz * dz > R2) continue;
      const q = st.project(tmp.set(P[i], P[i + 1], P[i + 2]));
      if (q.behind) continue;
      x0 = Math.min(x0, q.x);
      x1 = Math.max(x1, q.x);
      y0 = Math.min(y0, q.y);
      y1 = Math.max(y1, q.y);
    }
    if (x0 > x1) return null;
    // (sa tête hors de l'image : rien à garder autour)
    const v = st.view;
    if (x1 < v.x0 || x0 > v.x1 || y1 < v.y0 || y0 > v.y1) return { out: true };
    return { x0, x1, y0, y1 };
  }

  /** Ce rectangle de l'image touche-t-il sa tête (m : la marge, px ; k : la part de la marge gardée) ? */
  function onHead(S, r, k = 1) {
    if (!r || !S.hc || S.head?.out) return false;
    if (S.head) return overlap(r, S.head, S.hm * k);
    const dx = Math.max(r.x0 - S.hc.x, 0, S.hc.x - r.x1);
    const dy = Math.max(r.y0 - S.hc.y, 0, S.hc.y - r.y1);
    return Math.hypot(dx, dy) < S.hr * (k < 1 ? 0.85 : k > 1 ? 1.15 : 1);
  }

  // ---------------------------------------------------------------- le mur, ce qu'on voit

  let solids = null;
  /** Les maillages pleins du décor (pas l'herbe, le ciel, la pluie, ni les objets du jour). */
  function solidList() {
    if (!solids) {
      solids = [];
      for (const c of decor.group.children) {
        if (c === g) continue;
        c.traverse((o) => {
          if (o.isMesh && !o.isInstancedMesh && !o.userData?.grass && !o.userData?.sky && o.geometry && !o.material?.transparent) solids.push(o);
        });
      }
    }
    return solids;
  }

  /** Ce point se voit-il depuis la caméra (pas derrière l'animal ; walls : ni derrière un mur ou la clôture pleine) ? */
  function seen(st, q, walls = true) {
    const cam = st.camera.position;
    const dir = q.clone().sub(cam);
    const d = dir.length();
    dir.normalize();
    if (st.proxy?.hit) {
      const h = st.proxy.hit(new THREE.Ray(cam.clone(), dir), -9, 1e9);
      if (h && h.point.distanceTo(cam) < d - 0.05) return false;
    }
    if (!walls) return true;
    rc.set(cam, dir);
    rc.near = 0.05;
    rc.far = d - 0.05;
    for (const o of solidList()) {
      if (!o.parent || !shown(o)) continue;
      if (rc.intersectObject(o, false).length) return false;
    }
    return true;
  }

  const nearWall = new Map();
  /** Les maillages du décor tout près de ce pan de mur (ce qui peut y être accroché ou en dépasser), calculés une fois. */
  function wallList(A) {
    let list = nearWall.get(A);
    if (!list) {
      list = [];
      const k = A.axis === 'z' ? 'z' : 'x';
      for (const o of solidList()) {
        const b = shownBox(o);
        if (!b.isEmpty() && b.min[k] < A.at + 0.4 && b.max[k] > A.at - 0.4) list.push(o);
      }
      nearWall.set(A, list);
    }
    return list;
  }

  /** Derrière tout l'objet accroché, le mur est-il là, nu (ni fenêtre, ni poteau, ni plaque, ni rien d'autre dessus) ? */
  function bare(st, p, rad, h, A) {
    const cam = st.camera.position;
    const list = wallList(A).filter((o) => o.parent && shown(o));
    for (const [du, dy] of [[0, 0.5], [-1, 0.06], [1, 0.06], [-1, 0.94], [1, 0.94]]) {
      const q = A.axis === 'z' ? tmp.set(p.x + du * rad, p.y + dy * h, A.at) : tmp.set(A.at, p.y + dy * h, p.z + du * rad);
      const dir = q.clone().sub(cam);
      const d = dir.length();
      rc.set(cam, dir.normalize());
      rc.near = 0.05;
      rc.far = d + 0.2;
      const hit = rc.intersectObjects(list, false)[0];
      if (!hit || Math.abs(hit.distance - d) > 0.03) return false;
    }
    return true;
  }

  /**
   * La place p convient-elle à cet objet ? s : la place du décor (son mur). mode : 'place' (une nouvelle place),
   * 'keep' (un objet déjà posé, quand le cadrage change : un peu de marge, pour ne pas le faire clignoter), 'safe'
   * (pendant que la caméra bouge : seulement ce qui ne doit jamais arriver, cacher l'animal ou ce qu'on lui tend).
   */
  function fits(st, it, p, taken, S, s = null, mode = 'place') {
    const no = (why) => {
      it.why[why] = (it.why[why] ?? 0) + 1;
      return false;
    };
    const placing = mode === 'place';
    const [rad, h] = SIZE[it.kind] ?? [0.2, 0.3];
    // (pas sur un autre objet du jour : la poule qui se promène ne passe pas dans le seau)
    if (placing) for (const q of taken) if (q.p.distanceTo(p) < Math.max(rad + 0.25, rad + q.r)) return no('pris');
    // (accroché, perché, appuyé : à un mur, une clôture qu'on voit — le décor cache ceux qui passent devant la caméra)
    if (s?.wall && !shown(s.wall)) return no('mur caché');
    // (ni sur ce qu'on lui tend — mangeoire, seau, gamelles, filet, notre main — ni sur la plaque à son nom : leur
    // boîte, dans le monde et dans l'image, pas seulement leur centre)
    const ib = new THREE.Box3(V(p.x - rad, p.y, p.z - rad), V(p.x + rad, p.y + h, p.z + rad));
    const view = !anywhere && st.view;
    const orect = view ? rectOf(st, ib) : null;
    const near = ib.distanceToPoint(st.camera.position);
    for (const ob of S.obs) {
      if (_bb.copy(ob.box).expandByScalar(0.12).intersectsBox(ib)) return no(ob.kind);
      if (orect && ob.rect && overlap(orect, ob.rect, 10) && !(ob.far && near > ob.far + 0.05)) return no(`${ob.kind} (image)`);
    }
    if (!view) return true;
    const v = st.view;
    const pts = [p.clone(), p.clone().add(V(0, h, 0)), p.clone().add(V(rad, h * 0.5, 0)), p.clone().add(V(-rad, h * 0.5, 0))];
    if (mode !== 'safe') {
      const slack = mode === 'keep' ? 16 : 0;
      const top = v.y0 + 40;
      for (const [i, q] of pts.entries()) {
        const s2 = st.project(q);
        // (au bord du cadre, un objet au sol peut dépasser un peu sur le côté : son pied et son haut restent dans l'image)
        const side = (i >= 2 && it.where === 'floor' ? 30 : -8) + slack;
        if (s2.behind || s2.x < v.x0 - side || s2.x > v.x1 + side || s2.y < top - slack || s2.y > v.y1 - 8 + slack) return no('hors image');
      }
      // (pas sur sa tête, même derrière lui : on la voit toujours en entier, avec un peu d'air autour — tout le
      // rectangle de l'objet, pas seulement ses bords)
      if (onHead(S, orect, mode === 'keep' ? 0.5 : 1)) return no('tête');
    }
    // (jamais devant l'animal : ni trop près de nous ; ni, dans sa moitié avant, sur lui dans l'image)
    if (box && p.z > box.max.z + 0.45 * (box.max.y - box.min.y) + 0.2) return no('trop près');
    const over = orect && S.arect && overlap(orect, S.arect, 4);
    if (box && over && p.z + rad > box.min.z + 0.1 * (box.max.z - box.min.z)) return no('devant');
    // (ne cache jamais l'animal : entre la caméra et chacun de ses points, pas de peau plus loin derrière l'objet ;
    // inutile s'il n'est pas sur lui dans l'image, ou tout entier derrière lui)
    // (les rayons coûtent : un nombre d'essais compté à chaque fois qu'on pose, le reste attend son tour — place())
    if (placing) budget--;
    const cam = st.camera.position;
    const behind = box && cam.z > box.max.z && p.z + rad < box.min.z;
    if (st.proxy?.hit && over && !behind) {
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
    if (mode === 'safe') return true;
    // (accroché à un pan de mur : le mur est là, nu, derrière lui)
    if (placing && s?.area && !bare(st, p, rad, h, s.area)) return no('mur');
    // (on le voit : ni tout entier derrière l'animal, ni derrière un mur — les murs, seulement pour une nouvelle place)
    if ((over || placing) && !seen(st, p.clone().add(V(0, h * 0.5, 0)), placing) && !seen(st, p.clone().add(V(0, h * 0.9, 0)), placing)) return no('caché');
    return true;
  }

  // ---------------------------------------------------------------- les places dans l'image

  /** Des places au sol dans l'image : sous des points de l'image, dans la zone du décor (decor.area), pas sous lui. */
  function floorInView(st) {
    const A = decor.area;
    const v = st.view;
    if (!A || !v || !st.rayAt) return [];
    const out = [];
    const keys = new Set();
    // (autour d'un petit animal, une grille plus fine et un écart plus court : en gros plan sur un lapin, le sol qu'on
    // voit ne fait que quelques dizaines de centimètres)
    const Hb = box ? box.max.y - box.min.y : 1;
    const cell = Math.min(0.2, Math.max(0.05, Hb * 0.2));
    const gap = Math.min(0.15, Hb * 0.25);
    // (toute la hauteur de l'image : en gros plan sur un sabot, le sol derrière lui est en haut)
    for (let gy = 0.08; gy <= 0.96; gy += 0.06) {
      for (let gx = 0.03; gx <= 0.98; gx += 0.07) {
        const ray = st.rayAt(v.x0 + gx * (v.x1 - v.x0), v.y0 + gy * (v.y1 - v.y0));
        if (ray.direction.y > -1e-3) continue;
        const t = (A.y - ray.origin.y) / ray.direction.y;
        const p = ray.origin.clone().addScaledVector(ray.direction, t);
        if (p.x < A.x0 || p.x > A.x1 || p.z < A.z0 || p.z > A.z1) continue;
        if (box && p.x > box.min.x - gap && p.x < box.max.x + gap && p.z > box.min.z - gap && p.z < box.max.z + gap) continue;
        // (sur une grille : la même place d'une fois à l'autre, même si la caméra bouge d'un rien)
        const q = [Math.round(p.x / cell) * cell, A.y, Math.round(p.z / cell) * cell];
        const key = q.join(',');
        if (keys.has(key)) continue;
        keys.add(key);
        out.push({ kind: 'floor', p: q });
      }
    }
    return out;
  }

  /**
   * Des places au mur dans l'image : sous des points de l'image, sur les pans de mur que le décor propose
   * (decor.hangAreas). En gros plan, il reste presque toujours un bout de mur à côté ou au-dessus de sa tête.
   */
  function wallInView(st) {
    const v = st.view;
    if (!v || !st.rayAt || !decor.hangAreas?.length) return [];
    const out = [];
    const keys = new Set();
    for (const A of decor.hangAreas) {
      if (A.wall && !shown(A.wall)) continue;
      for (let gy = 0.04; gy <= 0.96; gy += 0.05) {
        for (let gx = 0.04; gx <= 0.96; gx += 0.05) {
          const ray = st.rayAt(v.x0 + gx * (v.x1 - v.x0), v.y0 + gy * (v.y1 - v.y0));
          const dk = A.axis === 'z' ? ray.direction.z : ray.direction.x;
          const ok = A.axis === 'z' ? ray.origin.z : ray.origin.x;
          if (Math.abs(dk) < 1e-4) continue;
          const t = (A.at - ok) / dk;
          if (t <= 0) continue;
          const p = ray.origin.clone().addScaledVector(ray.direction, t);
          const u = A.axis === 'z' ? p.x : p.z;
          if (u < A.u0 || u > A.u1 || p.y < A.y0 || p.y > A.y1) continue;
          if (A.holes?.some(([a, b, c, e]) => u > a && u < b && p.y > c && p.y < e)) continue;
          // (sur une grille de 10 cm : la même place d'une fois à l'autre)
          const us = Math.round(u * 10) / 10;
          const ys = Math.round(p.y * 10) / 10;
          const key = `${decor.hangAreas.indexOf(A)}|${us}|${ys}`;
          if (keys.has(key)) continue;
          keys.add(key);
          // (p : le milieu de l'objet ; placeExtras le descend de sa demi-hauteur, à la bonne hauteur pour lui)
          const q = A.axis === 'z' ? [us, ys, A.at + 0.004] : [A.at + 0.004 * Math.sign(Math.sin(A.face ?? 0)), ys, us];
          out.push({ kind: 'hang', p: q, face: A.face ?? 0, wall: A.wall ?? null, area: A });
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- au loin : derrière lui, rien ne le cache

  /** Ce que la course de ce qui vole ajoute en haut et en bas de son trajet (m) : l'ondulation, puis le vol lui-même. */
  const SWING = { hirondelle: [0.18, 0.1], papillons: [0.12, 0.25], vol: [0.5, 0.45] };

  /** Le trajet de ce qui vole est-il bon pour l'image du moment : d'un bord à l'autre, loin de sa tête, ondulation comprise ? */
  function pathOk(st, it, P, S) {
    const v = st.view;
    if (!v) return false;
    const qa = st.project(P.a);
    const qb = st.project(P.b);
    if (qa.behind || qb.behind) return false;
    if (!((qa.x < v.x0 && qb.x > v.x1) || (qb.x < v.x0 && qa.x > v.x1))) return false;
    const mid = P.a.clone().lerp(P.b, 0.5);
    const [amp, ext] = SWING[it.kind] ?? [0.3, 0.3];
    const sw = st.projectRadius(mid, amp + ext);
    // (pas en travers de son visage, même loin derrière : la bande de sa tête, ondulation comprise, est refusée)
    for (const q of [qa, qb, st.project(mid)]) {
      if (q.y < v.y0 + 20 || q.y > v.y1) return false;
      if (onHead(S, { x0: v.x0 - 1e4, x1: v.x1 + 1e4, y0: q.y - sw, y1: q.y + sw }, 1.5)) return false;
    }
    return true;
  }

  /** Les poules au loin, le rouge-gorge derrière lui : cette place se voit-elle, loin de sa tête ? */
  function farSpotOk(st, it, p, S, ext, mode = 'place') {
    const v = st.view;
    const pts = [p, ...ext.map((e) => p.clone().add(e))];
    // (derrière lui, mais pas forcément derrière ce qu'on lui tend, l'abreuvoir rangé au fond : ni dessus, ni devant)
    const ib = new THREE.Box3().setFromPoints(pts).expandByScalar(0.08);
    const r = rectOf(st, ib);
    const near = ib.distanceToPoint(st.camera.position);
    for (const ob of S.obs) {
      if (_bb.copy(ob.box).expandByScalar(0.2).intersectsBox(ib)) return false;
      if (r && ob.rect && overlap(r, ob.rect, 10) && !(ob.far && near > ob.far + 0.05)) return false;
    }
    if (mode === 'safe') return true;
    for (const q of pts) {
      const s = st.project(q);
      if (s.behind || s.x < v.x0 + 10 || s.x > v.x1 - 10 || s.y < v.y0 + 40 || s.y > v.y1 - 10) return false;
      if (onHead(S, { x0: s.x, x1: s.x, y0: s.y, y1: s.y }, 1.5)) return false;
    }
    // (au moins une des deux poules se voit : entre les lisses de la clôture, à côté de lui)
    return it.kind === 'rougegorge' ? seen(st, p.clone().add(V(0, 0.06, 0))) : seen(st, p.clone().add(V(0, 0.3, 0))) || seen(st, p.clone().add(V(0.8, 0.3, 0.5)));
  }
  const FAR_EXT = {
    // (le rouge-gorge : sa tête, sa queue, ses petits sauts, dans tous les sens)
    rougegorge: [V(0, 0.25, 0), V(0.17, 0.05, 0.17), V(-0.17, 0.05, -0.17)],
    poulailler: [V(0, 0.55, 0), V(0.9, 0.3, 0.5), V(-0.6, 0.3, 0)],
  };

  function farPlace(st, it, S) {
    const v = st.view;
    if (!v || !st.rayAt || !box) return false;
    const W = v.x1 - v.x0;
    const H = v.y1 - v.y0;
    const r = seeded(hashSeed(`${seed}|${it.kind}|loin|${it.tries = (it.tries ?? 0) + 1}`));
    if (it.kind === 'poulailler' || it.kind === 'rougegorge') {
      // (les poules : loin dans le pré ; le rouge-gorge : sur l'herbe juste derrière lui, il sautille et picore — ou
      // dans la paille du box, de l'étable : l'hiver, il y entre)
      const robin = it.kind === 'rougegorge';
      if (!decor.outdoor && !robin) return false;
      const A = decor.outdoor ? null : decor.area;
      const [zn, zf] = robin ? [0.3, 2.2] : [2.2, 7.5];
      const gy0 = decor.area?.y ?? 0;
      const cands = [];
      for (let gy = 0.12; gy <= 0.8; gy += 0.05) {
        for (let gx = 0.08; gx <= 0.92; gx += 0.06) {
          const ray = st.rayAt(v.x0 + gx * W, v.y0 + gy * H);
          if (ray.direction.y > -1e-3) continue;
          const p = ray.origin.clone().addScaledVector(ray.direction, (gy0 - ray.origin.y) / ray.direction.y);
          if (p.z > box.min.z - zn || p.z < box.min.z - zf) continue;
          if (A && (p.x < A.x0 || p.x > A.x1 || p.z < A.z0 || p.z > A.z1)) continue;
          cands.push({ p, v: r() });
        }
      }
      cands.sort((a, b) => a.v - b.v);
      let n = 0;
      for (const { p } of cands) {
        if (++n > 80) break;
        if (!farSpotOk(st, it, p, S, FAR_EXT[it.kind])) continue;
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
    const [amp] = SWING[it.kind] ?? [0.3];
    const y0 = (bfly ? 0.25 : out ? 1.3 : Math.max(1.0, box.min.y + (box.max.y - box.min.y) * 0.75)) + amp;
    const y1 = (bfly ? Math.max(1, box.max.y + 0.4) : out ? 8 : roof - 0.25) - amp;
    const at = (sx, sy) => {
      const ray = st.rayAt(sx, sy);
      if (ray.direction.z > -1e-3) return null;
      return ray.origin.clone().addScaledVector(ray.direction, (zP - ray.origin.z) / ray.direction.z);
    };
    const best = [];
    for (const fy of bfly ? [0.12, 0.22, 0.32, 0.42, 0.52] : [0.03, 0.06, 0.1, 0.17, 0.25, 0.33, 0.42]) {
      const sy = v.y0 + 44 + fy * (H - 44);
      const a = at(v.x0 - 0.12 * W, sy);
      const b = at(v.x1 + 0.12 * W, sy);
      const m = at((v.x0 + v.x1) / 2 + (r() - 0.5) * 0.3 * W, sy);
      if (!a || !b || !m) continue;
      if (Math.min(a.y, b.y) < y0 || Math.max(a.y, b.y) > y1) continue;
      // (jamais en travers de son visage : au-dessus de sa tête ou en dessous, sinon pas du tout)
      if (!pathOk(st, it, { a, b }, S)) continue;
      if (!seen(st, m)) continue;
      best.push({ a, b, v: r() });
    }
    if (!best.length) {
      it.why.ciel = (it.why.ciel ?? 0) + 1;
      return false;
    }
    best.sort((p, q) => p.v - q.v);
    it.path = best[0];
    it.at = best[0].a.clone().lerp(best[0].b, 0.5);
    it.t ??= r() * 3;
    return true;
  }

  // ---------------------------------------------------------------- poser, revoir, enlever

  /** Les places de cet objet, dans l'ordre où on les essaie : d'abord celles qu'on voit (tirées dans l'ordre du jour), puis celles du décor. */
  function orderOf(it, seenFloor, seenWall) {
    const shuffle = (list, tag) => {
      const r = seeded(hashSeed(`${seed}|${it.kind}|${it.i}|${tag}`));
      return list.map((s) => ({ s, v: r() })).sort((a, b) => a.v - b.v).map((x) => x.s);
    };
    if ((it.where === 'floor' || it.where === 'air') && seenFloor.length) return [...shuffle(seenFloor, 'vue'), ...it.order];
    // (perché d'abord, sur les places du décor ; puis par terre, là où on voit le sol)
    if (it.ground && seenFloor.length) {
      const up = it.order.filter((s) => s.kind !== 'floor');
      return [...up, ...shuffle(seenFloor, 'vue'), ...it.order.filter((s) => s.kind === 'floor')];
    }
    if (it.where === 'hang' && seenWall.length) return [...shuffle(seenWall, 'mur'), ...it.order];
    return it.order;
  }

  let budget = 0;
  /**
   * Pose ce qui n'a pas encore de place (ou plus), sans toucher à ce qui est bien placé. tries : combien de places
   * peuvent aller jusqu'aux rayons sur le décor (le téléphone ne doit pas s'arrêter de dessiner).
   */
  function place(st, tries = 24, now = null) {
    tried = true;
    budget = tries;
    const S = survey(st);
    // (posé pour la caméra qui arrive : il ne doit pas non plus gêner là où elle est encore)
    let Snow = null;
    const safeNow = (it, p, s) => {
      if (!now?.target) return true;
      return atPose(st, now, () => {
        Snow ??= survey(st);
        return fits(st, it, p, [], Snow, s, 'safe');
      });
    };
    const live = items.filter((i) => i.at && !i.fade);
    const taken = live.filter((i) => !i.path).map((i) => ({ p: i.at, r: (SIZE[i.kind] ?? [0.2])[0] }));
    let count = live.length;
    const seenFloor = anywhere ? [] : floorInView(st);
    const seenWall = anywhere ? [] : wallInView(st);
    for (const it of items) {
      if (it.at || it.cool > clock) continue;
      // (le petit plus : seulement s'il manque encore de quoi voir)
      if (it.life && count >= min) continue;
      if (it.where === 'far') {
        if (farPlace(st, it, S)) {
          count++;
          if (!it.path) appear(it);
        }
        continue;
      }
      // (là où le dernier essai s'est arrêté faute de temps, pour le même cadrage : pas toujours les mêmes places)
      const order = orderOf(it, seenFloor, seenWall);
      const from = it.resume?.pose === placedFor && it.resume.n === order.length ? it.resume.k : 0;
      it.resume = null;
      for (let j = 0; j < order.length; j++) {
        const k = (from + j) % order.length;
        const s = order[k];
        if (budget <= 0) {
          it.resume = { pose: placedFor, n: order.length, k };
          break;
        }
        const p = V(...s.p);
        const [, h] = SIZE[it.kind] ?? [0.2, 0.3];
        if (s.area) {
          // (sur un pan de mur : centré sur le point vu, à une hauteur qui lui va — plus bas près d'un petit animal, une
          // cloche à hauteur de mouton ; un tableau jamais au ras du sol)
          const [lo0, hi] = HANG_Y[it.kind] ?? [0.5, 2.5];
          const lo = it.kind === 'cadre' ? lo0 : Math.min(lo0, 0.45 * (box ? box.max.y - box.min.y : 2));
          const ya = Math.max(s.area.y0, lo);
          const yb = Math.min(s.area.y1 - h, hi);
          if (yb < ya) continue;
          p.y = Math.min(yb, Math.max(ya, p.y - h / 2));
        }
        if (it.where === 'air') p.y += 0.35 + 0.25 * Math.min(1.5, box ? box.max.y : 1);
        // (appuyée contre le mur : le pied un peu en avant, le haut contre le mur)
        if (it.where === 'lean') p.add(V(Math.sin(s.face ?? 0) * 0.3, 0, Math.cos(s.face ?? 0) * 0.3));
        if (!fits(st, it, p, taken, S, s) || !safeNow(it, p, s)) continue;
        it.at = p;
        it.spot = s;
        it.m.position.copy(p);
        // (face à nous, avec un petit angle ; posé sur une lisse, le long de celle-ci ; accroché : face au dehors du mur)
        const r = seeded(hashSeed(`${it.kind}|${s.p.join(',')}`));
        it.m.rotation.y = s.face ?? (it.where === 'lean' ? (r() - 0.5) * 0.3 : it.kind === 'brouette' || it.kind === 'botte' ? (r() - 0.5) * 0.6 : (r() - 0.5) * 1.2);
        if (it.kind === 'chat' || it.kind === 'oiseau' || it.kind === 'mouette') it.m.rotation.y = (s.face ?? 0) + (r() - 0.5) * 0.5 + (it.kind !== 'chat' ? Math.PI / 2 : 0);
        if (it.where === 'hang') it.m.rotation.y = s.face ?? 0;
        appear(it);
        taken.push({ p, r: (SIZE[it.kind] ?? [0.2])[0] });
        count++;
        break;
      }
    }
    listPlaced();
  }

  /** Il apparaît doucement à sa place. */
  function appear(it) {
    it.m.visible = true;
    it.m.scale.setScalar(0.001);
    it.grow = 0;
    it.fade = 0;
  }

  /** Il s'en va : en fondu (now : tout de suite — il passerait devant l'animal ou ce qu'on lui tend). */
  function leave(it, now = false) {
    // (pas de retour tout de suite : il clignoterait si l'animal va et vient)
    if (now) it.cool = clock + 1.2;
    if (now || it.grow < 0.05) gone(it);
    else if (!it.fade) it.fade = 1;
    listPlaced();
  }

  /** Il n'est plus là : sa place est libre, une autre lui sera cherchée (la caméra posée). */
  function gone(it) {
    it.at = null;
    it.spot = null;
    it.fade = 0;
    it.m.visible = false;
    dirty = true;
    listPlaced();
  }

  function listPlaced() {
    placed.length = 0;
    for (const it of items) if (it.at && !it.fade) placed.push(it.kind);
  }

  /** Les objets posés ont-ils toujours leur place ? Ceux qui ne l'ont plus s'en vont (mode : voir fits). */
  function recheck(st, mode) {
    const S = survey(st);
    for (const it of items) {
      if (!it.at || it.path || it.fade) continue;
      const ok = it.where === 'far' ? farSpotOk(st, it, it.at, S, FAR_EXT[it.kind] ?? [], mode) : fits(st, it, it.at, [], S, it.spot, mode);
      if (!ok) leave(it, mode === 'safe');
    }
  }

  // ---------------------------------------------------------------- la caméra : où elle est, où elle va

  /** La caméra du moment, ou celle où elle va (goal) : position, cible, décalage de l'image (la carte de fin). */
  function poseOf(st, goal) {
    const G = goal ? st.camGoal : null;
    const pos = (G?.position ?? st.camPos ?? st.camera.position).clone();
    const target = (G?.target ?? st.camTarget ?? null)?.clone() ?? null;
    const f = st.focus;
    const viewY = goal ? (f ? st.size.h / 2 - (f.top + f.bottom) / 2 : 0) : st.viewY ?? 0;
    return { pos, target, viewY, key: `${st.size?.w}|${st.size?.h}|${st.view?.x0}|${st.view?.y0}` };
  }
  const gap = (a, b) => (!a || !b || a.key !== b.key || !a.target || !b.target ? Infinity : a.pos.distanceTo(b.pos) + a.target.distanceTo(b.target) + Math.abs(a.viewY - b.viewY) * 0.002);

  /** Le temps de fn, la caméra mise à la pose P (sans rien changer d'autre) ; puis elle revient où elle était. */
  function atPose(st, P, fn) {
    const c = st.camera;
    if (!P.target) return fn();
    const pos = c.position.clone();
    const quat = c.quaternion.clone();
    const was = c.view?.enabled ? { ...c.view } : null;
    c.position.copy(P.pos);
    c.lookAt(P.target);
    if (Math.abs(P.viewY) > 0.5) c.setViewOffset(st.size.w, st.size.h, 0, P.viewY, st.size.w, st.size.h);
    else if (c.view?.enabled) c.clearViewOffset();
    c.updateMatrixWorld();
    try {
      return fn();
    } finally {
      c.position.copy(pos);
      c.quaternion.copy(quat);
      if (was) c.setViewOffset(was.fullWidth, was.fullHeight, was.offsetX, was.offsetY, was.width, was.height);
      else if (c.view?.enabled) c.clearViewOffset();
      c.updateMatrixWorld();
    }
  }

  let since = 0;
  let clock = 0;
  let goalSeen = null;
  let placedFor = null;
  let lastTry = 0;
  let dirty = false;
  /**
   * Toutes les 0,2 s : le cadrage qui vient (ce qui n'y aura plus sa place s'efface déjà) ; la caméra en chemin et
   * l'animal qui bouge (ce qui passerait devant lui disparaît tout de suite) ; la caméra arrivée, ou presque — une
   * caméra qui suit sa tête ne se pose jamais tout à fait — : ce qui manque reprend une place, là où elle va.
   */
  function watch(dt, st) {
    since += dt;
    if (since < 0.2) return;
    since = 0;
    const goal = poseOf(st, true);
    if (gap(goal, goalSeen) > 0.02) {
      goalSeen = goal;
      atPose(st, goal, () => recheck(st, 'keep'));
    }
    recheck(st, 'safe');
    const live = items.filter((i) => i.at && !i.fade).length;
    if (!dirty && live >= min) return;
    if (!items.some((i) => !i.at && !(i.cool > clock))) return;
    // (une fois par nouveau cadrage, ou quand un objet s'en est allé ; sinon, de temps en temps : la tête a bougé) —
    // tout de suite, sans attendre que la caméra arrive : une caméra qui suit sa tête met des secondes à se poser
    if (clock - lastTry < 0.6) return;
    const behind = items.some((i) => i.resume);
    if (dirty || gap(goal, placedFor) > 0.1 || clock - lastTry > (behind ? 0.6 : 2)) {
      dirty = false;
      // (le même cadrage : on reprend là où on s'était arrêté)
      if (gap(goal, placedFor) > 0.1) placedFor = goal;
      lastTry = clock;
      const now = poseOf(st, false);
      atPose(st, goal, () => place(st, 16, gap(now, goal) > 0.05 ? now : null));
    }
  }

  /** Le vol : traverse l'image en quelques secondes, attend, repart (dans l'autre sens pour l'hirondelle). */
  const _d = V();
  function fly(it, dt, st) {
    const f = it.m.userData.flight;
    const swallow = it.kind === 'hirondelle';
    const bfly = it.kind === 'papillons';
    const T = swallow ? 3.2 : bfly ? 11 : 8;
    const wait = swallow ? 4 : bfly ? 3 : 6;
    it.t += dt;
    const k = it.t % (T + wait);
    const cyc = Math.floor(it.t / (T + wait));
    // (à chaque passage, le trajet est revu pour l'image du moment et la tête où elle est : sinon un autre, ou pas de
    // passage cette fois)
    if (cyc !== it.cyc && st?.view && !anywhere) {
      it.cyc = cyc;
      const S = survey(st);
      it.skip = false;
      if (!pathOk(st, it, it.path, S)) {
        const old = it.path;
        if (!farPlace(st, it, S)) {
          it.path = old;
          it.skip = true;
        }
      }
    }
    if (k > T || it.skip) {
      it.m.visible = false;
      return;
    }
    it.m.visible = true;
    const P = it.path;
    const u = k / T;
    const back = (swallow || bfly) && cyc % 2 === 1;
    const a = back ? P.b : P.a;
    const b = back ? P.a : P.b;
    _d.subVectors(b, a);
    it.m.position.copy(a).addScaledVector(_d, u);
    it.m.position.y += Math.sin(u * Math.PI * (swallow ? 3 : bfly ? 4 : 1.5)) * (SWING[it.kind]?.[0] ?? 0.3);
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
    /** Les places au mur qu'on voit en ce moment (essais). */
    wallInView: (st) => wallInView(st),
    /** Ce qu'il ne faut jamais cacher, et où c'est dans l'image (essais). */
    survey: (st) => survey(st),
    /** Choisit les places maintenant (essais ; le jeu attend la caméra posée). */
    placeNow(st) {
      place(st);
      for (const it of items) if (it.at && !it.path) it.m.scale.setScalar(1);
    },
    update(dt, st) {
      // (quelques images après l'ouverture : la caméra est à sa place, pas à l'origine ; sans caméra fixe, tout de suite)
      // (une caméra qui ne se pose jamais tout à fait — la friandise suit la main — : on place quand même après ~3 s)
      clock += dt;
      if (!tried) {
        if (st.ready) waited += dt;
        if (anywhere || (st.ready && ++frames > 3 && ((st.settled?.(0.02) ?? true) || waited > 3))) {
          // (à la place où va la caméra : une caméra qui ne se pose jamais tout à fait y est presque)
          const goal = anywhere ? null : poseOf(st, true);
          placedFor = goalSeen = goal;
          if (goal) atPose(st, goal, () => place(st));
          else place(st);
          lastTry = clock;
        }
      } else if (!anywhere && st.view) watch(dt, st);
      for (const it of items) {
        if (!it.at) continue;
        if (it.path) {
          fly(it, dt, st);
          continue;
        }
        if (it.fade) {
          // (il s'en va : il rapetisse, puis sa place est libre)
          it.fade = Math.max(0, it.fade - dt / 0.25);
          it.m.scale.setScalar(Math.max(0.001, it.fade * it.fade));
          if (!it.fade) gone(it);
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
