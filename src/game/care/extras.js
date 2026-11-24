// Les petits objets du jour autour de l'animal, dans la scène de soin : une brouette, une fourche contre le mur, un chat
// sur le muret, un oiseau sur la clôture, des fleurs, un seau renversé, une poule qui passe, une botte de paille, un
// arrosoir, une balle, un papillon, un pot de fleurs. Lesquels : pickExtras (setting.js, tirés au sort de façon stable
// pour la journée). Où : aux places que le décor propose (decor.spots : au sol, en haut d'un muret ou d'une clôture,
// contre un mur), choisies une fois la caméra posée — dans l'image, jamais devant l'animal ni sur ce qu'on lui tend.
// Tout est fait en code, léger (quelques formes simples), et libéré à la fermeture.

import * as THREE from 'three';
import { strawBale, pitchfork, bag } from './barnProps.js';
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
function hen(keep) {
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
  neck.add(wattle);
  const beak = new THREE.Mesh(keep(new THREE.ConeGeometry(0.013, 0.035, 6)), yel);
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.105, 0.075, 0);
  neck.add(beak);
  for (const s of [-1, 1]) {
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

/** Le modèle de cet objet. seed : les petites variations (la robe du chat, les fleurs). */
export function extraModel(kind, keep, seed = 1) {
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
};

/**
 * Pose les objets du jour (kinds : pickExtras) aux places du décor. Renvoie { group, placed, update(dt, stage),
 * dispose() }. Les objets attendent la caméra posée pour choisir leur place (dans l'image, pas devant l'animal ni sur
 * ce qu'on lui tend), puis apparaissent doucement.
 */
export function placeExtras(stage, decor, kinds, { seed = 1 } = {}) {
  const keep = bag();
  const g = new THREE.Group();
  g.name = 'objets du jour';
  decor.group.add(g);
  const spots = decor.spots ?? [];
  const items = [];
  for (const [i, kind] of kinds.entries()) {
    const where = EXTRAS[kind];
    const cands = spots.filter((s) => (where === 'air' ? s.kind === 'floor' : s.kind === where));
    if (!cands.length && !(decor.area && (where === 'floor' || where === 'air'))) continue;
    const m = extraModel(kind, keep, seed + i * 7);
    if (!m) continue;
    m.visible = false;
    g.add(m);
    // (l'ordre des places essayées : tiré de la graine du jour)
    const r = seeded(hashSeed(`${seed}|${kind}`));
    const order = cands.map((s) => ({ s, v: r() })).sort((a, b) => a.v - b.v).map((x) => x.s);
    items.push({ kind, m, order, where, grow: 0, at: null, why: {} });
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
    const v = st.view;
    if (!v) return true;
    for (const q of taken) if (q.distanceTo(p) < rad + 0.25) return no('pris');
    const pts = [p.clone(), p.clone().add(V(0, h, 0)), p.clone().add(V(rad, h * 0.5, 0)), p.clone().add(V(-rad, h * 0.5, 0))];
    const top = v.y0 + 40;
    for (const q of pts) {
      const s = st.project(q);
      if (s.behind || s.x < v.x0 + 8 || s.x > v.x1 - 8 || s.y < top || s.y > v.y1 - 8) return no('hors image');
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
      for (const q of pts) {
        const dir = q.clone().sub(cam);
        const d = dir.length();
        const h2 = st.proxy.hit(new THREE.Ray(cam.clone(), dir.normalize()), -9, 1e9);
        if (h2 && h2.point.distanceTo(cam) > d - 0.02) return no('devant');
      }
    }
    // (ni sur ce qu'on lui tend : mangeoire, seau, gamelles, filet…)
    for (const pr of Object.values(decor.props ?? {})) {
      const o = pr?.group;
      if (!o || !o.visible || !o.parent) continue;
      const w = o.getWorldPosition(V());
      if (w.distanceTo(p) < rad + 0.45) return no('accessoire');
      const a = st.project(w);
      const b = st.project(p.clone().add(V(0, h * 0.5, 0)));
      if (Math.hypot(a.x - b.x, a.y - b.y) < 70) return no('accessoire (image)');
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
      for (let gx = 0.05; gx <= 0.96; gx += 0.07) {
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

  function place(st) {
    tried = true;
    box = animalBox(st);
    // (la caméra à jour, même sans image rendue depuis qu'elle a bougé)
    st.camera.updateMatrixWorld?.();
    decor.group.updateMatrixWorld(true);
    const taken = [];
    const seen = floorInView(st);
    for (const it of items) {
      // (au sol : d'abord des places qu'on voit, tirées dans l'ordre du jour, puis celles du décor)
      if ((it.where === 'floor' || it.where === 'air') && seen.length) {
        const r = seeded(hashSeed(`${seed}|${it.kind}|vue`));
        it.order = seen.map((s) => ({ s, v: r() })).sort((a, b) => a.v - b.v).map((x) => x.s).concat(it.order);
      }
      for (const s of it.order) {
        const p = V(...s.p);
        if (it.where === 'air') p.y += 0.35 + 0.25 * Math.min(1.5, box ? box.max.y : 1);
        // (appuyée contre le mur : le pied un peu en avant, le haut contre le mur)
        if (it.where === 'lean') p.z += 0.3;
        if (!fits(st, it, p, taken)) continue;
        it.at = p;
        it.m.position.copy(p);
        // (face à nous, avec un petit angle ; posé sur une lisse, le long de celle-ci)
        const r = seeded(hashSeed(`${it.kind}|${s.p.join(',')}`));
        it.m.rotation.y = s.face ?? (it.where === 'lean' ? (r() - 0.5) * 0.3 : it.kind === 'brouette' || it.kind === 'botte' ? (r() - 0.5) * 0.6 : (r() - 0.5) * 1.2);
        if (it.kind === 'chat' || it.kind === 'oiseau') it.m.rotation.y = (s.face ?? 0) + (r() - 0.5) * 0.5 + (it.kind === 'oiseau' ? Math.PI / 2 : 0);
        if (it.kind === 'poule') it.m.userData.range = 0.35;
        it.m.visible = true;
        it.m.scale.setScalar(0.001);
        taken.push(p);
        placed.push(it.kind);
        break;
      }
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
      for (const it of items) if (it.at) it.m.scale.setScalar(1);
    },
    update(dt, st) {
      // (quelques images après l'ouverture : la caméra est à sa place, pas à l'origine)
      if (!tried && st.ready && ++frames > 3 && (st.settled?.(0.02) ?? true)) place(st);
      for (const it of items) {
        if (!it.at) continue;
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
