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

/** Une touffe de paille propre (à laisser !) : une petite gerbe de brins dorés. */
export function strawTuft(own, mats, seed = 1) {
  const g = new THREE.Group();
  const r = rng(seed + 11);
  const n = 22;
  const inst = new THREE.InstancedMesh(mats.strand, mats.strandMat, n);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    e.set((r() - 0.5) * 0.6, r() * Math.PI * 2, (r() - 0.5) * 0.5);
    q.setFromEuler(e);
    const len = 0.1 + r() * 0.1;
    m4.compose(v3((r() - 0.5) * 0.06, 0.01 + r() * 0.03, (r() - 0.5) * 0.06), q, v3(len, 1.4, 1.3));
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, c.setHex([0xf0d88e, 0xe6c66e, 0xd8b45a, 0xf6e2a0][i % 4]));
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
  // le tas dedans
  const fillMat = own(new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.75, map: own(noiseTexture('#5a3e24', 0.3, 27, 64)) }));
  const heap = shade(new THREE.Mesh(own(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)), fillMat));
  heap.visible = false;
  g.add(heap);
  return {
    group: g,
    /** Le haut de la caisse (là où on jette), repère du groupe. */
    mouth: v3(0, y1 + 0.05, -0.05),
    setFill(k) {
      heap.visible = k > 0.01;
      const kk = Math.min(1, k);
      heap.scale.set(0.22 + 0.06 * kk, 0.04 + 0.16 * kk, 0.3 + 0.08 * kk);
      heap.position.set(0, y0 + 0.04 + H * 0.75 * kk, -0.04);
    },
  };
}

/** Fourche à fumier : manche en bois, cinq dents en acier ; origine au bout des dents, le manche vers +y et +z. */
export function pitchfork(own) {
  const g = new THREE.Group();
  const steel = own(new THREE.MeshStandardMaterial({ color: 0xaab1b8, roughness: 0.3, metalness: 0.85 }));
  const wood = own(new THREE.MeshStandardMaterial({ color: 0xb4834f, roughness: 0.55 }));
  const tine = own(new THREE.CylinderGeometry(0.007, 0.009, 0.26, 6));
  for (let i = 0; i < 5; i++) {
    const t = shade(new THREE.Mesh(tine, steel));
    const x = (i - 2) * 0.034;
    t.position.set(x, 0.015, 0.12);
    t.rotation.x = Math.PI / 2 - 0.18;
    g.add(t);
  }
  const bar = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8)), steel));
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 0.04, 0.245);
  g.add(bar);
  const neck = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.012, 0.016, 0.1, 8)), steel));
  neck.position.set(0, 0.07, 0.28);
  neck.rotation.x = -0.6;
  g.add(neck);
  const handle = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.022, 0.022, 0.9, 10)), wood));
  handle.position.set(0, 0.4, 0.55);
  handle.rotation.x = -0.75;
  g.add(handle);
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
 * Le box (stall.js) pour les corvées et le curage : sa litière propre est remplacée par une litière sale, tassée et
 * mouillée par endroits ; le seau est rangé. Avec ou sans cheval (stage.noAnimal). Renvoie le décor de stall.js, plus
 * dirty (la litière sale).
 */
export function boxFloorSet(stage) {
  const d = stallSet(stage);
  const own = [];
  const keep = (x) => {
    own.push(x);
    return x;
  };
  // (la litière propre du box et ses brins : cachés — on les reconnaît à leur forme)
  d.group.traverse((o) => {
    if (o.isMesh && o.geometry?.type === 'PlaneGeometry' && o.geometry.parameters?.widthSegments === 48) o.visible = false;
    if (o.isInstancedMesh && o.count > 1000) o.visible = false;
  });
  d.props.bucket.group.visible = false;
  const S = STALL;
  const tex = keep(dirtyBeddingTexture(3));
  tex.repeat.set(2.4, 2.4);
  const geo = keep(new THREE.PlaneGeometry(S.halfW * 2 + 0.1, S.front - S.back + 0.2, 40, 30));
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const edge = Math.max(0, 1 - Math.min(S.halfW - Math.abs(x), y - (-(S.front - S.back) / 2)) / 0.45);
    p.setZ(i, 0.012 + 0.008 * Math.sin(x * 6.3 + y * 4.1) * Math.cos(y * 5.1 - x * 2.7) + 0.06 * edge * edge);
  }
  geo.computeVertexNormals();
  const dirty = new THREE.Mesh(geo, keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, color: 0xffffff })));
  dirty.rotation.x = -Math.PI / 2;
  dirty.position.set(0, 0, (S.back + S.front) / 2);
  dirty.receiveShadow = true;
  d.group.add(dirty);
  // Devant la porte ouverte : le seuil en bois et le béton de l'allée (là où l'on se tient).
  const sill = new THREE.Mesh(keep(new THREE.BoxGeometry(S.halfW * 2 + 0.3, 0.07, 0.16)), keep(new THREE.MeshStandardMaterial({ map: keep(woodTexture({ base: '#6f4a2a', dark: '#3f2614', vertical: false, seed: 5 })), roughness: 0.85 })));
  sill.position.set(0, 0.035, S.front + 0.08);
  sill.receiveShadow = true;
  sill.castShadow = true;
  d.group.add(sill);
  const aTex = keep(concreteTexture());
  aTex.repeat.set(3, 1.5);
  const aisle = new THREE.Mesh(keep(new THREE.PlaneGeometry(S.halfW * 2 + 6, 3.5)), keep(new THREE.MeshStandardMaterial({ map: aTex, roughness: 0.9 })));
  aisle.rotation.x = -Math.PI / 2;
  aisle.position.set(0, 0.006, S.front + 0.16 + 1.75);
  aisle.receiveShadow = true;
  d.group.add(aisle);
  const base = d.dispose;
  const baseUpdate = d.update;
  return {
    ...d,
    dirty,
    update(dt, st) {
      baseUpdate(dt, st);
      // (on travaille depuis la porte ouverte : le devant du box ne cache jamais le sol)
      d.walls.front.visible = false;
    },
    dispose() {
      base();
      for (const x of own) x.dispose?.();
    },
  };
}

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
