// Décors et accessoires des corvées en 3D (src/ui/minigames/floor3d.js, chores3d.js) : le box à curer et à pailler
// (le box du cheval, stall.js, dont la litière propre est remplacée par une litière sale, mouillée par endroits),
// l'allée de l'écurie à balayer (béton brossé, devants de box en bois et barreaux, poutres) ; et ce qu'on y manie :
// brouette, fourche, crottin, touffes de paille, botte de paille, balai, grande pelle.
//
// Repère du box : stall.js (le cheval, s'il y en a un, a la tête vers +x ; on se tient du côté +z, la porte).

import * as THREE from 'three';
import { stallSet, STALL } from './stall.js';
import { canvasTex, rng, strawFloorTexture, noiseTexture, woodTexture } from './textures.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function shade(m, cast = true) {
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- textures

/** Litière sale vue d'en haut : vieille paille brunie et tassée, taches d'urine plus sombres, crottin écrasé. */
export function dirtyBeddingTexture(seed = 3) {
  const S = 512;
  return canvasTex(S, S, (c) => {
    const r = rng(seed);
    c.fillStyle = '#8e7a52';
    c.fillRect(0, 0, S, S);
    // taches mouillées
    for (let i = 0; i < 14; i++) {
      const x = r() * S;
      const y = r() * S;
      const rad = 30 + r() * 70;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(78,60,34,0.5)');
      g.addColorStop(1, 'rgba(78,60,34,0)');
      c.fillStyle = g;
      c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // brins brunis, tassés
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 2200; i++) {
        const x = r() * S;
        const y = r() * S;
        const a = r() * Math.PI * 2;
        const l = 8 + r() * 26;
        const v = r();
        c.strokeStyle = v < 0.25 ? `rgba(90,68,38,${0.3 + r() * 0.3})` : v < 0.7 ? `rgba(${170 + r() * 30},${140 + r() * 25},${80 + r() * 25},${0.4 + r() * 0.35})` : `rgba(${210 + r() * 30},${180 + r() * 30},${105 + r() * 30},${0.35 + r() * 0.35})`;
        c.lineWidth = 1 + r() * 1.8;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        c.stroke();
      }
    }
  }, { key: `dirtyBedding|${seed}` });
}

/**
 * Sol nu du box, curé et balayé : tapis de caoutchouc noir-brun (joints entre les plaques, petits picots), encore humide
 * par endroits, quelques brins oubliés et un peu de sciure. C'est le sol qu'on paille (corvée « pailler »).
 */
export function rubberMatTexture() {
  const S = 512;
  return canvasTex(S, S, (c) => {
    const r = rng(17);
    c.fillStyle = '#3f3935';
    c.fillRect(0, 0, S, S);
    // picots du caoutchouc
    for (let y = 6; y < S; y += 12) {
      for (let x = (y / 12) % 2 ? 6 : 12; x < S; x += 12) {
        c.fillStyle = `rgba(255,245,230,${0.04 + r() * 0.04})`;
        c.beginPath();
        c.arc(x, y, 2.6, 0, Math.PI * 2);
        c.fill();
      }
    }
    // humide par endroits (plus sombre)
    for (let i = 0; i < 8; i++) {
      const x = r() * S;
      const y = r() * S;
      const rad = 40 + r() * 80;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(20,16,14,0.35)');
      g.addColorStop(1, 'rgba(20,16,14,0)');
      c.fillStyle = g;
      c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // sciure et poussière claire
    for (let i = 0; i < 1400; i++) {
      c.fillStyle = `rgba(${170 + r() * 50},${140 + r() * 40},${100 + r() * 30},${0.08 + r() * 0.18})`;
      c.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
    }
    // quelques brins oubliés
    for (let i = 0; i < 26; i++) {
      const x = r() * S;
      const y = r() * S;
      const a = r() * Math.PI * 2;
      const l = 10 + r() * 22;
      c.strokeStyle = `rgba(${200 + r() * 40},${165 + r() * 35},${90 + r() * 30},${0.55 + r() * 0.35})`;
      c.lineWidth = 1.5 + r() * 1.5;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      c.stroke();
    }
    // joints entre les plaques
    c.strokeStyle = 'rgba(12,10,9,0.8)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, 1.5);
    c.lineTo(S, 1.5);
    c.moveTo(1.5, 0);
    c.lineTo(1.5, S);
    c.stroke();
  }, { key: 'rubberMat' });
}

/** Béton brossé de l'allée : gris chaud, stries du balai, joints de dilatation, quelques taches. */
export function concreteTexture() {
  const S = 512;
  return canvasTex(S, S, (c) => {
    const r = rng(41);
    c.fillStyle = '#a49b8c';
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 9000; i++) {
      const x = r() * S;
      const y = r() * S;
      c.fillStyle = r() < 0.5 ? `rgba(70,62,52,${0.05 + r() * 0.1})` : `rgba(255,250,240,${0.05 + r() * 0.12})`;
      c.fillRect(x, y, 1 + r() * 2, 1 + r() * 2);
    }
    // stries (le béton a été brossé en travers)
    for (let y = 0; y < S; y += 3) {
      c.strokeStyle = `rgba(80,72,60,${0.04 + r() * 0.05})`;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, y + r() * 2);
      c.lineTo(S, y + r() * 2);
      c.stroke();
    }
    // taches
    for (let i = 0; i < 6; i++) {
      const x = r() * S;
      const y = r() * S;
      const rad = 20 + r() * 50;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(90,78,60,0.18)');
      g.addColorStop(1, 'rgba(90,78,60,0)');
      c.fillStyle = g;
      c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // joint
    c.strokeStyle = 'rgba(55,48,40,0.55)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, 2);
    c.lineTo(S, 2);
    c.stroke();
  }, { key: 'concrete' });
}

// ---------------------------------------------------------------- accessoires

/** Une petite boule bosselée (crottin), géométrie partagée par toutes les pommes de crottin. */
export function lumpGeometry(seed = 7) {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const p = geo.attributes.position;
  const r = rng(seed);
  for (let i = 0; i < p.count; i++) {
    const k = 0.86 + r() * 0.24;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Un tas de crottin : 5 à 7 pommes (boules brun foncé, un peu luisantes). */
export function manurePile(own, mats, seed = 1) {
  const g = new THREE.Group();
  if (mats.wet) {
    const wet = new THREE.Mesh(mats.wetGeo, mats.wet);
    wet.rotation.x = -Math.PI / 2;
    wet.position.y = 0.004;
    wet.scale.setScalar(0.11);
    wet.renderOrder = 1;
    g.add(wet);
  }
  const r = rng(seed + 3);
  const n = 5 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const m = shade(new THREE.Mesh(mats.lump, i % 3 === 0 ? mats.manure2 : mats.manure));
    const a = r() * Math.PI * 2;
    const d = i < 4 ? 0.035 + r() * 0.03 : r() * 0.02;
    const s = 0.028 + r() * 0.012;
    m.scale.set(s * 1.1, s * 0.85, s);
    m.position.set(Math.cos(a) * d, s * 0.7 + (i >= 4 ? 0.03 : 0), Math.sin(a) * d);
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    g.add(m);
  }
  return g;
}

/**
 * Une touffe de paille propre (à laisser !) : un petit tas doré, bosselé, hérissé de brins dorés couchés dans tous les
 * sens — comme les bottillons jaunes du jeu dessiné. (Avant : des brins pâles partant d'un point, on aurait dit une
 * petite étoile blanche, une étincelle de bonus à ramasser.)
 */
export function strawTuft(own, mats, seed = 1) {
  const g = new THREE.Group();
  const r = rng(seed + 11);
  // le tas (partagé par toutes les touffes : une demi-boule bosselée, la paille du box en plus doré)
  if (!mats.tuftGeo) {
    const geo = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = geo.attributes.position;
    const rr = rng(23);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = 0.82 + 0.14 * Math.sin(a * 3 + 0.7) + (rr() - 0.5) * 0.16;
      p.setXYZ(i, x * k, p.getY(i) * (0.8 + rr() * 0.35), z * k);
    }
    geo.computeVertexNormals();
    mats.tuftGeo = own(geo);
    const tex = own(strawFloorTexture());
    tex.repeat.set(0.5, 0.5);
    mats.tuftMat = own(new THREE.MeshStandardMaterial({ map: tex, color: 0xffd774, roughness: 0.95 }));
    mats.tuftStrandMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
  }
  const heap = shade(new THREE.Mesh(mats.tuftGeo, mats.tuftMat));
  heap.scale.set(0.075, 0.042, 0.06);
  heap.rotation.y = r() * Math.PI;
  g.add(heap);
  // les brins, couchés sur le tas et autour, dorés (pas pâles : on doit voir que c'est de la belle paille)
  const n = 34;
  const inst = new THREE.InstancedMesh(mats.strand, mats.tuftStrandMat, n);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 0.06;
    const y = 0.042 * Math.max(0, 1 - (d / 0.07) ** 2) * 0.9 + 0.004;
    e.set((r() - 0.5) * 0.35, r() * Math.PI * 2, (r() - 0.5) * 0.35);
    q.setFromEuler(e);
    const len = 0.07 + r() * 0.09;
    m4.compose(v3(Math.cos(a) * d, y, Math.sin(a) * d), q, v3(len, 1.6, 1.6));
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, c.setHex([0xe2b648, 0xd9a83c, 0xf0c95e, 0xc99634, 0xeccb6a][i % 5]));
  }
  inst.castShadow = true;
  inst.receiveShadow = true;
  own({ dispose: () => inst.dispose() });
  g.add(inst);
  return g;
}

/**
 * Brouette : caisse en tôle verte, roue devant, deux bras et deux pieds ; origine au sol sous la caisse, la roue vers
 * -z, les poignées vers +z. setFill(k) : le tas de crottin qui monte dans la caisse (0 à 1).
 */
export function wheelbarrow(own) {
  const g = new THREE.Group();
  const green = own(new THREE.MeshStandardMaterial({ color: 0x2f7d4f, roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide }));
  const dark = own(new THREE.MeshStandardMaterial({ color: 0x1d4f33, roughness: 0.5, metalness: 0.4 }));
  const metal = own(new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.4, metalness: 0.7 }));
  const rubber = own(new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.85 }));
  const wood = own(new THREE.MeshStandardMaterial({ color: 0x9a6a3a, roughness: 0.6 }));
  // la caisse : un tronc de pyramide ouvert, plus large en haut
  const W0 = 0.36;
  const L0 = 0.52;
  const W1 = 0.6;
  const L1 = 0.82;
  const H = 0.32;
  const geo = new THREE.BufferGeometry();
  const y0 = 0.28;
  const y1 = y0 + H;
  const P = [
    [-W0 / 2, y0, -L0 / 2], [W0 / 2, y0, -L0 / 2], [W0 / 2, y0, L0 / 2], [-W0 / 2, y0, L0 / 2],
    [-W1 / 2, y1, -L1 / 2 - 0.08], [W1 / 2, y1, -L1 / 2 - 0.08], [W1 / 2, y1, L1 / 2], [-W1 / 2, y1, L1 / 2],
  ];
  const quads = [[0, 1, 2, 3], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
  const pos = [];
  for (const [a, b, c, d] of quads) pos.push(...P[a], ...P[b], ...P[c], ...P[a], ...P[c], ...P[d]);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const tray = shade(new THREE.Mesh(own(geo), green));
  g.add(tray);
  // le rebord roulé
  const rim = shade(new THREE.Mesh(own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([P[4], P[5], P[6], P[7]].map((p) => v3(...p)), true, 'catmullrom', 0.02), 48, 0.012, 6, true)), dark));
  g.add(rim);
  // la roue
  const wheel = new THREE.Group();
  const tyre = shade(new THREE.Mesh(own(new THREE.TorusGeometry(0.15, 0.045, 10, 26)), rubber));
  tyre.rotation.y = Math.PI / 2;
  wheel.add(tyre);
  const hub = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 18)), own(new THREE.MeshStandardMaterial({ color: 0xc23a2f, roughness: 0.5, metalness: 0.3 }))));
  hub.rotation.z = Math.PI / 2;
  wheel.add(hub);
  wheel.position.set(0, 0.19, -L1 / 2 - 0.12);
  g.add(wheel);
  // les bras (de la roue aux poignées) et les pieds
  for (const s of [-1, 1]) {
    const arm = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.018, 0.018, 1.45, 10)), metal));
    arm.position.set(s * 0.24, 0.36, 0.06);
    arm.rotation.x = Math.PI / 2 - 0.16;
    g.add(arm);
    const grip = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 10)), wood));
    grip.position.set(s * 0.24, 0.46, 0.84);
    grip.rotation.x = Math.PI / 2 - 0.16;
    g.add(grip);
    const leg = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.015, 0.015, 0.34, 8)), metal));
    leg.position.set(s * 0.2, 0.17, 0.3);
    g.add(leg);
  }
  // le tas dedans : un fond de litière sale (une nappe bosselée qui monte), et des pommes de crottin posées dessus
  const fillTex = own(dirtyBeddingTexture(9));
  fillTex.repeat.set(0.8, 0.8);
  const fillMat = own(new THREE.MeshStandardMaterial({ map: fillTex, color: 0xb59a74, roughness: 0.95 }));
  const bedGeo = own(new THREE.PlaneGeometry(1, 1, 10, 10));
  {
    const p = bedGeo.attributes.position;
    const rr = rng(31);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) * 2;
      const y = p.getY(i) * 2;
      const dome = Math.max(0, 1 - (x * x + y * y) * 0.85);
      p.setZ(i, dome * 0.6 + (rr() - 0.5) * 0.12 * dome);
    }
    bedGeo.computeVertexNormals();
  }
  const heap = shade(new THREE.Mesh(bedGeo, fillMat));
  heap.rotation.x = -Math.PI / 2;
  heap.visible = false;
  g.add(heap);
  const ballGeo = own(lumpGeometry(13));
  const ballMats = [own(new THREE.MeshStandardMaterial({ color: 0x4b3a1e, roughness: 0.38 })), own(new THREE.MeshStandardMaterial({ color: 0x5d4a26, roughness: 0.5 }))];
  const NB = 34;
  const balls = [];
  {
    const rr = rng(57);
    for (let i = 0; i < NB; i++) {
      const b = shade(new THREE.Mesh(ballGeo, ballMats[i % 2]));
      const s = 0.026 + rr() * 0.012;
      b.scale.set(s * 1.1, s * 0.85, s);
      b.rotation.set(rr() * 3, rr() * 3, rr() * 3);
      // (au fond d'abord, au milieu ensuite : le tas monte)
      const k = i / NB;
      const rad = Math.sqrt(rr()) * (0.5 - 0.3 * k);
      const a = rr() * Math.PI * 2;
      b.userData.u = { x: Math.cos(a) * rad, z: Math.sin(a) * rad, k };
      b.visible = false;
      balls.push(b);
      g.add(b);
    }
  }
  return {
    group: g,
    /** Le haut de la caisse (là où on jette), repère du groupe. */
    mouth: v3(0, y1 + 0.05, -0.05),
    setFill(k) {
      const kk = Math.min(1, k);
      if (kk === this.k) return;
      this.k = kk;
      heap.visible = kk > 0.01;
      // (la nappe : de la largeur de la caisse à sa hauteur ; elle monte avec ce qu'on y jette)
      const top = y0 + 0.03 + H * 0.7 * kk;
      const f = (top - y0) / H; // (la caisse s'évase en montant)
      const wx = (W0 + (W1 - W0) * f) * 0.92;
      const lz = (L0 + (L1 - L0) * f) * 0.92;
      heap.scale.set(wx, lz, 0.05 + 0.12 * kk);
      heap.position.set(0, top - (0.05 + 0.12 * kk) * 0.6 * 0.5, -0.04);
      for (const b of balls) {
        const u = b.userData.u;
        b.visible = kk > 0.01 && u.k < kk * 1.1;
        if (!b.visible) continue;
        const dome = Math.max(0, 1 - ((u.x * 2) ** 2 + (u.z * 2) ** 2) * 0.85);
        b.position.set(u.x * wx, top - (0.05 + 0.12 * kk) * 0.6 * 0.5 + dome * (0.05 + 0.12 * kk) * 0.6 + 0.012, u.z * lz - 0.04);
      }
    },
  };
}

/**
 * Fourche à fumier : une large tête de huit dents en acier (recourbées, bien visibles d'en haut), un manche en bois
 * avec sa poignée en D. Origine au bout des dents, le manche vers +y et +z. (Avant : cinq dents fines, on ne voyait
 * qu'un trait.)
 */
export function pitchfork(own) {
  const g = new THREE.Group();
  const steel = own(new THREE.MeshStandardMaterial({ color: 0xb9c0c6, roughness: 0.28, metalness: 0.8 }));
  const dark = own(new THREE.MeshStandardMaterial({ color: 0x2c2e31, roughness: 0.5, metalness: 0.6 }));
  const wood = own(new THREE.MeshStandardMaterial({ color: 0xc08a50, roughness: 0.5 }));
  // une dent : un tube recourbé (droit, puis le bout relevé)
  const curve = new THREE.CatmullRomCurve3([v3(0, 0.035, 0.3), v3(0, 0.02, 0.18), v3(0, 0.008, 0.06), v3(0, 0.018, 0)]);
  const tine = own(new THREE.TubeGeometry(curve, 12, 0.0085, 6, false));
  const n = 8;
  for (let i = 0; i < n; i++) {
    const t = shade(new THREE.Mesh(tine, steel));
    const x = (i - (n - 1) / 2) * 0.042;
    t.position.set(x * (1 + 0.0), 0, 0);
    t.rotation.y = (i - (n - 1) / 2) * -0.025;
    g.add(t);
  }
  // la traverse (noire), d'où partent les dents
  const bar = shade(new THREE.Mesh(own(new THREE.BoxGeometry(n * 0.042 + 0.02, 0.026, 0.03)), dark));
  bar.position.set(0, 0.04, 0.3);
  g.add(bar);
  const neck = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.014, 0.02, 0.12, 8)), dark));
  neck.position.set(0, 0.075, 0.35);
  neck.rotation.x = -0.75;
  g.add(neck);
  const handle = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.02, 0.022, 0.95, 10)), wood));
  handle.position.set(0, 0.42, 0.66);
  handle.rotation.x = -0.75;
  g.add(handle);
  // la poignée en D au bout du manche
  const grip = shade(new THREE.Mesh(own(new THREE.TorusGeometry(0.055, 0.012, 6, 14, Math.PI)), dark));
  grip.position.set(0, 0.78, 0.98);
  grip.rotation.set(-0.75 + Math.PI / 2, 0, 0);
  g.add(grip);
  return g;
}

/** Botte de paille : un pavé doré aux brins visibles, deux ficelles. Origine au sol, au milieu. */
export function strawBale(own, { w = 0.82, h = 0.38, d = 0.46 } = {}) {
  const g = new THREE.Group();
  const tex = own(strawFloorTexture());
  tex.repeat.set(1.4, 0.7);
  const mat = own(new THREE.MeshStandardMaterial({ map: tex, color: 0xf3dc9a, roughness: 1 }));
  const geo = own(new THREE.BoxGeometry(w, h, d, 6, 3, 4));
  const p = geo.attributes.position;
  const r = rng(51);
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.98 + r() * 0.04), p.getY(i) * (0.97 + r() * 0.05), p.getZ(i) * (0.98 + r() * 0.04));
  geo.computeVertexNormals();
  const bale = shade(new THREE.Mesh(geo, mat));
  bale.position.y = h / 2;
  g.add(bale);
  const twine = own(new THREE.MeshStandardMaterial({ color: 0xc8502e, roughness: 0.7 }));
  for (const x of [-w * 0.27, w * 0.27]) {
    const band = shade(new THREE.Mesh(own(new THREE.TorusGeometry(1, 0.012, 4, 4)), twine));
    band.rotation.set(0, Math.PI / 2, Math.PI / 4);
    band.scale.set(h * 0.72, d * 0.72, 1);
    band.position.set(x, h / 2, 0);
    g.add(band);
  }
  return { group: g, top: v3(0, h, 0), w, h, d };
}

/** Une brassée de paille (dans nos bras, sous le doigt) : une gerbe bosselée. */
export function strawArmful(own, mats) {
  const g = new THREE.Group();
  const tex = own(strawFloorTexture());
  tex.repeat.set(0.6, 0.6);
  const blob = shade(new THREE.Mesh(own(new THREE.IcosahedronGeometry(1, 2)), own(new THREE.MeshStandardMaterial({ map: tex, color: 0xf6e0a0, roughness: 1 }))));
  blob.scale.set(0.16, 0.08, 0.12);
  blob.position.y = 0.05;
  g.add(blob);
  const t = strawTuft(own, mats, 9);
  t.scale.setScalar(1.6);
  t.position.y = 0.03;
  g.add(t);
  return g;
}

/** Balai d'écurie : large tête en bois, poils raides, long manche. Origine au milieu des poils au sol ; tête le long de x. */
export function pushBroom(own) {
  const g = new THREE.Group();
  const wood = own(new THREE.MeshStandardMaterial({ color: 0xb98a55, roughness: 0.55 }));
  const bristle = own(new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.95, map: own(noiseTexture('#3e3026', 0.35, 19, 64)) }));
  const block = shade(new THREE.Mesh(own(new THREE.BoxGeometry(0.46, 0.045, 0.07)), wood));
  block.position.y = 0.085;
  g.add(block);
  const br = shade(new THREE.Mesh(own(new THREE.BoxGeometry(0.44, 0.07, 0.06)), bristle));
  br.position.y = 0.035;
  g.add(br);
  const handle = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.014, 0.014, 1.3, 10)), wood));
  handle.position.set(0, 0.6, 0.38);
  handle.rotation.x = -0.6;
  g.add(handle);
  return g;
}

/** Grande pelle d'écurie (plastique rouge), couchée, sa lèvre vers -x ; origine sur la lèvre, au milieu. w : largeur. */
export function bigDustpan(own, w = 0.8) {
  const g = new THREE.Group();
  const red = own(new THREE.MeshStandardMaterial({ color: 0xc8443c, roughness: 0.55, side: THREE.DoubleSide }));
  const redDark = own(new THREE.MeshStandardMaterial({ color: 0x9e302b, roughness: 0.6 }));
  const L = 0.42;
  const floor = shade(new THREE.Mesh(own(new THREE.PlaneGeometry(L, w)), red));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(L / 2, 0.012, 0);
  floor.rotation.y = 0.06;
  g.add(floor);
  for (const s of [-1, 1]) {
    const side = shade(new THREE.Mesh(own(new THREE.BoxGeometry(L, 0.11, 0.015)), red));
    side.position.set(L / 2, 0.055, s * w / 2);
    g.add(side);
  }
  const back = shade(new THREE.Mesh(own(new THREE.BoxGeometry(0.015, 0.14, w)), red));
  back.position.set(L, 0.07, 0);
  g.add(back);
  const handle = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.018, 0.018, 0.75, 10)), redDark));
  handle.rotation.z = -Math.PI / 2 + 0.5;
  handle.position.set(L + 0.32, 0.25, 0);
  g.add(handle);
  return { group: g };
}

// ---------------------------------------------------------------- le box à curer et à pailler

/**
 * Le box à curer : sur le décor du box (stall.js, déjà construit : d), la litière propre et ses brins sont cachés et
 * remplacés par une litière sale, tassée et mouillée par endroits ; le seau est rangé ; devant la porte ouverte, le
 * seuil et le béton de l'allée (là où l'on se tient : le devant du box ne cache jamais le sol). Sert au box vide des
 * corvées (boxFloorSet) et au box du cheval qu'on cure (floor3d.js clean3dGame). Renvoie { dirty, update, dispose }
 * (dispose remet le box comme avant).
 */
export function dirtyBox(stage, d, { bare = false } = {}) {
  const own = [];
  const keep = (x) => {
    own.push(x);
    return x;
  };
  const hidden = [];
  // (la litière propre du box et ses brins : on les reconnaît à leur forme)
  d.group.traverse((o) => {
    const bed = o.isMesh && o.geometry?.type === 'PlaneGeometry' && o.geometry.parameters?.widthSegments === 48;
    if ((bed || (o.isInstancedMesh && o.count > 1000)) && o.visible) {
      o.visible = false;
      hidden.push(o);
    }
  });
  if (d.props?.bucket?.group?.visible) {
    d.props.bucket.group.visible = false;
    hidden.push(d.props.bucket.group);
  }
  const S = STALL;
  const added = [];
  // (bare : le sol nu d'un box curé — le tapis de caoutchouc —, à pailler ; sinon la vieille litière sale, à curer)
  const tex = keep(bare ? rubberMatTexture() : dirtyBeddingTexture(3));
  if (bare) tex.repeat.set(2.2 / 1.2, 3.2 / 1.6); // (des plaques de 1,2 × 1,6 m)
  else tex.repeat.set(2.4, 2.4);
  const geo = keep(new THREE.PlaneGeometry(S.halfW * 2 + 0.1, S.front - S.back + 0.2, 40, 30));
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const edge = Math.max(0, 1 - Math.min(S.halfW - Math.abs(x), y - (-(S.front - S.back) / 2)) / 0.45);
    p.setZ(i, bare ? 0.006 : 0.012 + 0.008 * Math.sin(x * 6.3 + y * 4.1) * Math.cos(y * 5.1 - x * 2.7) + 0.06 * edge * edge);
  }
  geo.computeVertexNormals();
  const dirty = new THREE.Mesh(geo, keep(new THREE.MeshStandardMaterial({ map: tex, roughness: bare ? 0.75 : 0.95, color: 0xffffff })));
  dirty.rotation.x = -Math.PI / 2;
  dirty.position.set(0, 0, (S.back + S.front) / 2);
  dirty.receiveShadow = true;
  added.push(dirty);
  const sill = new THREE.Mesh(keep(new THREE.BoxGeometry(S.halfW * 2 + 0.3, 0.07, 0.16)), keep(new THREE.MeshStandardMaterial({ map: keep(woodTexture({ base: '#6f4a2a', dark: '#3f2614', vertical: false, seed: 5 })), roughness: 0.85 })));
  sill.position.set(0, 0.035, S.front + 0.08);
  sill.receiveShadow = true;
  sill.castShadow = true;
  added.push(sill);
  const aTex = keep(concreteTexture());
  aTex.repeat.set(3, 1.5);
  const aisle = new THREE.Mesh(keep(new THREE.PlaneGeometry(S.halfW * 2 + 6, 3.5)), keep(new THREE.MeshStandardMaterial({ map: aTex, roughness: 0.9 })));
  aisle.rotation.x = -Math.PI / 2;
  aisle.position.set(0, 0.006, S.front + 0.16 + 1.75);
  aisle.receiveShadow = true;
  added.push(aisle);
  for (const m of added) d.group.add(m);
  return {
    dirty,
    update() {
      d.walls.front.visible = false;
    },
    dispose() {
      for (const m of added) d.group.remove(m);
      for (const o of hidden) o.visible = true;
      for (const x of own) x.dispose?.();
    },
  };
}

/** Le box vide des corvées : le box (stall.js) devenu box à curer (dirtyBox), ou, curé (bare), à pailler. */
export function boxFloorSet(stage, { bare = false } = {}) {
  const d = stallSet(stage);
  const x = dirtyBox(stage, d, { bare });
  return {
    ...d,
    dirty: x.dirty,
    update(dt, st) {
      d.update(dt, st);
      x.update();
    },
    dispose() {
      x.dispose();
      d.dispose();
    },
  };
}

/** Le box curé, sol nu (tapis de caoutchouc), à pailler. */
export const bareBoxSet = (stage) => boxFloorSet(stage, { bare: true });

// ---------------------------------------------------------------- l'allée de l'écurie

export const AISLE = { x0: -3.2, x1: 3.2, zBoxes: -1.1, zWall: 2.4, roof: 3.1 };

/**
 * L'allée de l'écurie, à balayer : béton brossé, de l'autre côté les devants des box (planches en bas, barreaux noirs
 * en haut, portes coulissantes et plaques), poutres, lampes ; derrière nous, le mur. Lumière chaude du soir.
 */
export function aisleSet(stage) {
  const g = new THREE.Group();
  const own = [];
  const keep = (x) => {
    own.push(x);
    return x;
  };
  const A = AISLE;
  const high = stage.high;
  const floorTex = keep(concreteTexture());
  floorTex.repeat.set(4, 2.5);
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(A.x1 - A.x0 + 4, A.zWall - A.zBoxes + 2)), keep(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, color: 0xffffff })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, (A.zBoxes + A.zWall) / 2);
  floor.receiveShadow = true;
  g.add(floor);
  // le caniveau, le long des box
  const gutter = new THREE.Mesh(keep(new THREE.BoxGeometry(A.x1 - A.x0 + 4, 0.01, 0.1)), keep(new THREE.MeshStandardMaterial({ color: 0x5f5850, roughness: 0.8 })));
  gutter.position.set(0, 0.003, A.zBoxes + 0.12);
  g.add(gutter);
  // devants des box
  const wood = keep(woodTexture({ base: '#94633a', dark: '#5a381c', vertical: true, seed: 13 }));
  wood.repeat.set(6, 1);
  const woodMat = keep(new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8 }));
  const beamTex = keep(woodTexture({ base: '#6f4a2a', dark: '#3f2614', vertical: false, seed: 5 }));
  const beamMat = keep(new THREE.MeshStandardMaterial({ map: beamTex, roughness: 0.85 }));
  const metal = keep(new THREE.MeshStandardMaterial({ color: 0x1d1d20, roughness: 0.4, metalness: 0.7 }));
  const plateMat = keep(new THREE.MeshStandardMaterial({ color: 0xece2c8, roughness: 0.5 }));
  const low = 1.25;
  const high2 = 2.35;
  const lowWall = new THREE.Mesh(keep(new THREE.BoxGeometry(A.x1 - A.x0 + 4, low, 0.08)), woodMat);
  lowWall.position.set(0, low / 2, A.zBoxes);
  lowWall.castShadow = true;
  lowWall.receiveShadow = true;
  g.add(lowWall);
  for (const y of [low + 0.04, high2]) {
    const rail = new THREE.Mesh(keep(new THREE.BoxGeometry(A.x1 - A.x0 + 4, 0.09, 0.12)), beamMat);
    rail.position.set(0, y, A.zBoxes);
    rail.castShadow = true;
    g.add(rail);
  }
  const nBars = Math.floor((A.x1 - A.x0 + 4) / 0.14);
  const bars = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(0.012, 0.012, high2 - low, 8)), metal, nBars);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < nBars; i++) bars.setMatrixAt(i, m4.makeTranslation(A.x0 - 2 + 0.07 + i * 0.14, (low + high2) / 2, A.zBoxes));
  bars.castShadow = true;
  g.add(bars);
  // montants entre les box, et une plaque par box
  for (let x = A.x0 - 1.5; x <= A.x1 + 1.5; x += 3) {
    const post = new THREE.Mesh(keep(new THREE.BoxGeometry(0.14, A.roof, 0.16)), beamMat);
    post.position.set(x, A.roof / 2, A.zBoxes + 0.02);
    post.castShadow = true;
    g.add(post);
    const plate = new THREE.Mesh(keep(new THREE.BoxGeometry(0.4, 0.13, 0.02)), plateMat);
    plate.position.set(x + 1.5, low + 0.2, A.zBoxes + 0.06);
    g.add(plate);
  }
  // l'ombre des box derrière les barreaux
  const dark = new THREE.Mesh(keep(new THREE.PlaneGeometry(A.x1 - A.x0 + 4, high2 + 0.4)), keep(new THREE.MeshStandardMaterial({ map: wood, color: 0x5a4632, roughness: 1, emissive: 0x1e140a })));
  dark.position.set(0, (high2 + 0.4) / 2, A.zBoxes - 1.4);
  g.add(dark);
  // au-dessus des box, la cloison ; le plafond et ses poutres
  const top = new THREE.Mesh(keep(new THREE.BoxGeometry(A.x1 - A.x0 + 4, A.roof - high2, 0.08)), woodMat);
  top.position.set(0, (A.roof + high2) / 2, A.zBoxes);
  g.add(top);
  // (le plafond et le mur derrière nous : cachés quand la caméra est au-dessus ou derrière, comme les murs du box)
  const roof = new THREE.Group();
  g.add(roof);
  const ceil = new THREE.Mesh(keep(new THREE.PlaneGeometry(A.x1 - A.x0 + 4, A.zWall - A.zBoxes + 1)), keep(new THREE.MeshStandardMaterial({ color: 0xe2d5bd, roughness: 0.95 })));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, A.roof, (A.zBoxes + A.zWall) / 2);
  roof.add(ceil);
  for (let x = A.x0 - 1; x <= A.x1 + 1; x += 1.6) {
    const beam = new THREE.Mesh(keep(new THREE.BoxGeometry(0.16, 0.2, A.zWall - A.zBoxes + 0.4)), beamMat);
    beam.position.set(x, A.roof - 0.1, (A.zBoxes + A.zWall) / 2);
    roof.add(beam);
  }
  const back = new THREE.Mesh(keep(new THREE.PlaneGeometry(A.x1 - A.x0 + 4, A.roof)), woodMat);
  back.position.set(0, A.roof / 2, A.zWall);
  back.rotation.y = Math.PI;
  g.add(back);
  // une fourche et un licol accrochés aux barreaux (de la vie)
  const rope = keep(new THREE.MeshStandardMaterial({ color: 0x2f6aa8, roughness: 0.8 }));
  const coil = new THREE.Mesh(keep(new THREE.TorusGeometry(0.14, 0.018, 8, 28)), rope);
  coil.position.set(A.x0 + 0.9, 1.0, A.zBoxes + 0.07);
  coil.scale.set(1, 1.35, 1);
  coil.castShadow = true;
  g.add(coil);
  // de la vie dans l'allée : une brouette garée contre les box, une botte de paille, un seau
  const parked = wheelbarrow(keep);
  parked.group.position.set(A.x0 + 0.9, 0, A.zBoxes + 0.75);
  parked.group.rotation.y = Math.PI / 2 + 0.25;
  parked.setFill(0.4);
  g.add(parked.group);
  const bale = strawBale(keep);
  bale.group.position.set(A.x1 - 0.7, 0, A.zBoxes + 0.45);
  bale.group.rotation.y = 0.1;
  g.add(bale.group);
  // lumière
  const hemi = new THREE.HemisphereLight(0xfff0d6, 0x7a6248, high ? 0.7 : 0.8);
  g.add(hemi);
  const key = new THREE.DirectionalLight(0xffe2b8, 2.0);
  key.position.set(-2.2, 4.5, 3.2);
  key.target.position.set(0.3, 0, 0.2);
  key.castShadow = true;
  const sm = high ? 2048 : 1024;
  key.shadow.mapSize.set(sm, sm);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 3, bottom: -3, near: 0.5, far: 14 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  g.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xc9dcff, 0.4);
  fill.position.set(3, 2, 4);
  g.add(fill);
  // des lampes au plafond (une lueur chaude)
  for (const x of [-1.6, 1.6]) {
    const bulb = new THREE.Mesh(keep(new THREE.SphereGeometry(0.07, 12, 8)), keep(new THREE.MeshBasicMaterial({ color: 0xfff1c8, toneMapped: false })));
    bulb.position.set(x, A.roof - 0.3, 0.6);
    roof.add(bulb);
    const shadeMesh = new THREE.Mesh(keep(new THREE.ConeGeometry(0.16, 0.12, 16, 1, true)), keep(new THREE.MeshStandardMaterial({ color: 0x2a3a2e, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide })));
    shadeMesh.position.set(x, A.roof - 0.24, 0.6);
    roof.add(shadeMesh);
  }
  stage.scene.background = new THREE.Color(0x2a1e14);
  stage.scene.fog = new THREE.Fog(0x2a1e14, 7, 16);
  stage.scene.environment = null;
  return {
    group: g,
    props: {},
    layout() {},
    update(dt, st) {
      const c = st.camera.position;
      roof.visible = c.y < A.roof - 0.05;
      back.visible = c.z < A.zWall - 0.05;
    },
    dispose() {
      for (const x of own) x.dispose?.();
      bars.dispose();
    },
  };
}
