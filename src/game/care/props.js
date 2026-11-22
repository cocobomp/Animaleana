// Accessoires 3D des soins (src/game/care/) : filet à foin qui se remplit vraiment de foin, mangeoire en caoutchouc
// et ses granulés, pelle à grain, seau d'eau et robinet, friandises, main tendue, outils du pansage. Chaque
// fabrique renvoie { group, …, update(dt), dispose() } ; ce qu'elle crée est à elle (libéré par dispose).

import * as THREE from 'three';
import { hayTexture, hayStrandTexture, netTexture, pelletTexture, rippleNormal, noiseTexture, softDot, rng, paint } from './textures.js';

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

/** Petit gestionnaire de ce qu'on crée (à libérer ensemble). */
function bag() {
  const list = [];
  const keep = (x) => {
    list.push(x);
    return x;
  };
  keep.dispose = () => {
    for (const x of list) x.dispose?.();
    list.length = 0;
  };
  return keep;
}

function shadowed(m, cast = true) {
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

/** Bosselle une géométrie (bruit déterministe le long de la normale). */
function lumpy(geo, amp, seed = 1, freq = 9) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const d = (Math.sin(x * freq + seed) * Math.cos(y * freq * 1.3 - seed) + Math.sin(z * freq * 1.7 + y * 3 + seed * 2) * 0.6) * amp;
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------- filet à foin

// Profil du filet plein (rayon, hauteur sous l'anneau) : resserré en haut par la cordelette, ventru, arrondi en bas.
const NET_PROFILE = [[0.0, 0.02], [0.035, 0], [0.07, -0.05], [0.17, -0.13], [0.25, -0.26], [0.285, -0.4], [0.275, -0.52], [0.23, -0.63], [0.15, -0.71], [0.06, -0.755], [0.0, -0.765]];
export const NET_DEPTH = 0.765;

/**
 * Le filet à foin accroché au mur (son anneau à l'origine du groupe). setFill(k) : 0 vide (le filet pend, tout
 * plat) à 1 plein (rond, des brins dépassent des mailles). pour(on) : des poignées de foin tombent dedans.
 * nibble(on) : le cheval tire du foin (le filet bouge, des brins tombent).
 */
export function hayNet({ high = true, keep: outer = null } = {}) {
  const keep = bag();
  const g = new THREE.Group();
  const pts = NET_PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
  // Foin dedans : même forme, un peu plus petite, bosselée.
  const hayTex = keep(hayTexture(4));
  hayTex.repeat.set(3, 2);
  const hayMat = keep(new THREE.MeshStandardMaterial({ map: hayTex, roughness: 1, color: 0xffffff }));
  const hayGeo = keep(lumpy(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p.x * 0.93, p.y * 0.97)), 28, 0, Math.PI * 2), 0.018, 2, 14));
  const hayPivot = new THREE.Group(); // (le foin grandit depuis le fond du filet)
  hayPivot.position.y = -NET_DEPTH;
  g.add(hayPivot);
  const hay = shadowed(new THREE.Mesh(hayGeo, hayMat));
  hay.position.y = NET_DEPTH;
  hayPivot.add(hay);
  // Les mailles.
  const netTex = keep(netTexture([40, 96, 66]));
  netTex.repeat.set(9, 5);
  const netMat = keep(new THREE.MeshStandardMaterial({ map: netTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 }));
  const netGeo = keep(new THREE.LatheGeometry(pts, 32, 0, Math.PI * 2));
  const net = shadowed(new THREE.Mesh(netGeo, netMat));
  // (ombre des mailles : la profondeur avec les trous, sinon une ombre pleine)
  net.customDepthMaterial = keep(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: netTex, alphaTest: 0.45 }));
  g.add(net);
  // Brins qui dépassent des mailles : petites cartes croisées.
  const strandTex = keep(hayStrandTexture());
  const strandMat = keep(new THREE.MeshStandardMaterial({ map: strandTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }));
  const card = keep(crossCard(0.09, 0.16));
  const N = high ? 120 : 80;
  const strands = new THREE.InstancedMesh(card, strandMat, N);
  strands.castShadow = true;
  const spots = [];
  const r = rng(7);
  for (let i = 0; i < N; i++) {
    const k = 0.18 + r() * 0.8; // hauteur dans le filet (0 haut, 1 bas)
    const a = r() * Math.PI * 2;
    spots.push({ k, a, tilt: 0.6 + r() * 0.9, spin: r() * Math.PI, s: 0.6 + r() * 0.7 });
  }
  g.add(strands);
  // Anneau au mur et cordelette qui serre le haut du filet.
  const metal = keep(new THREE.MeshStandardMaterial({ color: 0x9a9aa0, roughness: 0.35, metalness: 0.85 }));
  const ring = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(0.04, 0.007, 8, 20)), metal));
  ring.position.set(0.24, 0.1, 0);
  ring.rotation.y = Math.PI / 2;
  g.add(ring);
  const plate = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.025, 0.025, 0.012, 12)), metal));
  plate.position.set(0.245, 0.1, 0);
  plate.rotation.z = Math.PI / 2;
  g.add(plate);
  const ropeMat = keep(new THREE.MeshStandardMaterial({ color: 0x2a5a3e, roughness: 0.8 }));
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.235, 0.065, 0), new THREE.Vector3(0.16, 0.0, 0.01), new THREE.Vector3(0.07, 0.03, 0), new THREE.Vector3(0.0, 0.035, 0)]);
  const rope = shadowed(new THREE.Mesh(keep(new THREE.TubeGeometry(curve, 16, 0.007, 6, false)), ropeMat));
  g.add(rope);
  const knot = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(0.03, 0.011, 8, 16)), ropeMat));
  knot.position.set(0, 0.01, 0);
  knot.rotation.x = Math.PI / 2;
  g.add(knot);

  let fill = 0;
  let shown = -1;
  let nib = 0;
  let swing = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  // Forme du filet selon le foin : vide, il pend plat et long ; plein, il est rond.
  const apply = () => {
    const k = clamp(fill);
    const w = lerp(0.36, 1, Math.pow(k, 0.6));
    net.scale.set(w * 0.82, lerp(1.08, 1, k), w);
    net.position.y = 0;
    hay.visible = k > 0.01;
    // (le foin remplit depuis le fond : sa hauteur suit le remplissage, sa largeur un peu)
    hayPivot.scale.set(w * 0.82 * lerp(0.85, 1, k), Math.max(0.02, k) * lerp(1.08, 1, k), w * lerp(0.85, 1, k));
    hayPivot.position.y = -NET_DEPTH * lerp(1.08, 1, k);
    // brins : ceux qui sont sous le niveau du foin
    let n = 0;
    for (let i = 0; i < N; i++) {
      const s = spots[i];
      if (1 - s.k > k + 0.02) continue;
      const pr = profileAt(s.k);
      const rad = pr.r * w;
      v.set(Math.cos(s.a) * rad * 0.82, pr.y * lerp(1.08, 1, k), Math.sin(s.a) * rad);
      e.set(s.tilt * Math.sin(s.a), -s.a + s.spin, s.tilt * Math.cos(s.a) - 0.3);
      q.setFromEuler(e);
      sc.setScalar(s.s * clamp((k - (1 - s.k)) * 4 + 0.2));
      m4.compose(v, q, sc);
      strands.setMatrixAt(n++, m4);
    }
    strands.count = n;
    strands.instanceMatrix.needsUpdate = true;
  };
  apply();

  // Poignées de foin qui tombent dans le filet (petites cartes).
  const flakes = [];
  const flakeGeo = keep(crossCard(0.12, 0.1));
  let pouring = false;
  let spawn = 0;

  return {
    group: g,
    net,
    get fill() { return fill; },
    setFill(k) {
      fill = clamp(k);
      if (Math.abs(fill - shown) > 0.004) {
        shown = fill;
        apply();
      }
    },
    pour(on) { pouring = !!on; },
    nibble(on) { nib = on ? 1 : 0; },
    /** Point (monde) où le cheval tire le foin : le bas du filet, côté cheval. */
    bite(out = new THREE.Vector3()) {
      g.updateWorldMatrix(true, false);
      return g.localToWorld(out.set(-0.18, -NET_DEPTH * 0.55, 0));
    },
    update(dt) {
      // balancement (le cheval tire dessus)
      swing += dt;
      const amp = nib * 0.05 + (pouring ? 0.02 : 0);
      g.rotation.z = Math.sin(swing * 5.5) * amp + Math.sin(swing * 1.3) * 0.006;
      g.rotation.x = Math.sin(swing * 3.7 + 1) * amp * 0.6;
      if (pouring) {
        spawn += dt * 14;
        while (spawn > 1) {
          spawn -= 1;
          const m = new THREE.Mesh(flakeGeo, strandMat);
          m.position.set((Math.random() - 0.5) * 0.1 - 0.05, 0.3 + Math.random() * 0.12, (Math.random() - 0.5) * 0.1);
          m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
          m.castShadow = true;
          g.add(m);
          flakes.push({ m, vy: -0.4 - Math.random() * 0.4, spin: (Math.random() - 0.5) * 6 });
        }
      }
      for (const f of flakes) {
        f.vy -= 5 * dt;
        f.m.position.y += f.vy * dt;
        f.m.rotation.x += f.spin * dt;
        if (f.m.position.y < -0.08) f.dead = true;
      }
      for (let i = flakes.length - 1; i >= 0; i--) {
        if (!flakes[i].dead) continue;
        g.remove(flakes[i].m);
        flakes.splice(i, 1);
      }
    },
    dispose() {
      strands.dispose();
      keep.dispose();
    },
  };
}

/** Rayon et hauteur du profil du filet à la part k de sa hauteur (0 haut, 1 bas). */
function profileAt(k) {
  const y = -NET_DEPTH * k;
  for (let i = 1; i < NET_PROFILE.length; i++) {
    const [r0, y0] = NET_PROFILE[i - 1];
    const [r1, y1] = NET_PROFILE[i];
    if (y <= y0 && y >= y1) {
      const t = (y - y0) / (y1 - y0 || 1);
      return { r: lerp(r0, r1, t), y };
    }
  }
  return { r: 0, y };
}

/** Deux cartes croisées (brins, poignées de foin) : se voient de tous les côtés. */
function crossCard(w, h) {
  const a = new THREE.PlaneGeometry(w, h);
  a.translate(0, h / 2, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  const geo = mergeSimple([a, b]);
  a.dispose();
  b.dispose();
  return geo;
}

/** Fusion de géométries non indexées ou indexées (position, normale, uv), sans dépendance. */
export function mergeSimple(list) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  let base = 0;
  for (const g0 of list) {
    const g = g0.index ? g0 : g0;
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const t = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0);
      uv.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
    base += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

// ---------------------------------------------------------------- mangeoire et granulés

/** Profil d'un récipient épais (rayon du haut, du bas, profondeur, épaisseur) pour un LatheGeometry. */
function tubProfile(rTop, rBot, depth, th, lip = 0.012) {
  return [
    [0.0, -depth], [rBot, -depth], [rTop, -lip], [rTop + lip * 0.6, 0], [rTop - th + 0.002, lip * 0.4],
    [rTop - th, -lip], [rBot - th, -depth + th], [0.0, -depth + th],
  ].map(([x, y]) => new THREE.Vector2(x, y));
}

export const FEEDER = { r: 0.27, rBot: 0.2, depth: 0.2, th: 0.025 };

/**
 * Mangeoire en caoutchouc noir accrochée au mur (le bord du haut à l'origine du groupe). setLevel(k) : les
 * granulés dedans (0 vide, 1 pleine). pourFrom(on, from) : la pelle verse (des granulés tombent dedans).
 */
export function feeder({ high = true } = {}) {
  const keep = bag();
  const g = new THREE.Group();
  const F = FEEDER;
  const rubberTex = keep(noiseTexture('#26262a', 0.18, 4, 64));
  const rubber = keep(new THREE.MeshStandardMaterial({ map: rubberTex, color: 0x9a9a9e, roughness: 0.62, metalness: 0.0 }));
  const tubGeo = keep(new THREE.LatheGeometry(tubProfile(F.r, F.rBot, F.depth, F.th), 36));
  const tub = shadowed(new THREE.Mesh(tubGeo, rubber));
  tub.scale.set(1, 1, 0.82);
  g.add(tub);
  // Support en métal contre le mur.
  const metal = keep(new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.4, metalness: 0.8 }));
  const bracket = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(F.r + 0.01, 0.012, 8, 40, Math.PI)), metal));
  bracket.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
  bracket.position.y = -0.05;
  bracket.scale.set(1, 0.82, 1);
  g.add(bracket);
  // Granulés : un tas (dôme) qui monte, avec des granulés en relief sur le dessus.
  const pelTex = keep(pelletTexture());
  pelTex.repeat.set(2, 2);
  const pelMat = keep(new THREE.MeshStandardMaterial({ map: pelTex, roughness: 0.85, color: 0xffffff }));
  const mound = shadowed(new THREE.Mesh(keep(lumpy(new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0.03, 3, 11)), pelMat), false);
  g.add(mound);
  const pelGeo = keep(new THREE.CylinderGeometry(0.0055, 0.0055, 0.016, 6));
  const pelBit = keep(new THREE.MeshStandardMaterial({ color: 0x8c5e2e, roughness: 0.75 }));
  const NP = high ? 140 : 90;
  const bits = new THREE.InstancedMesh(pelGeo, pelBit, NP);
  bits.castShadow = false;
  bits.receiveShadow = true;
  const r = rng(21);
  const bitSpots = Array.from({ length: NP }, () => ({ a: r() * Math.PI * 2, d: Math.sqrt(r()), rx: r() * 3, ry: r() * 3, c: 0.75 + r() * 0.5 }));
  g.add(bits);
  const col = new THREE.Color();
  bitSpots.forEach((s, i) => bits.setColorAt(i, col.setRGB(0.55 * s.c, 0.37 * s.c, 0.18 * s.c)));
  let level = 0;
  let shown = -1;
  let eaten = 0; // ce que le cheval a déjà mangé (le tas baisse)
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const apply = () => {
    const k = clamp(level - eaten);
    mound.visible = k > 0.005;
    const bottom = -F.depth + F.th;
    const top = bottom + (F.depth - F.th - 0.01) * Math.min(1, k * 1.05);
    const rad = lerp(F.rBot - F.th, F.r - F.th, (top - bottom) / (F.depth - F.th)) * 0.98;
    // (un petit tas au fond, puis une surface presque plate qui monte)
    const dome = 0.012 + 0.03 * Math.min(1, k * 4);
    mound.scale.set(rad, Math.max(0.004, top - bottom + dome), rad * 0.82);
    mound.position.y = bottom;
    let n = 0;
    for (let i = 0; i < NP; i++) {
      const s = bitSpots[i];
      if (s.d > Math.min(1, k * 6)) continue;
      const rr = s.d * rad * 0.92;
      const h = top + dome * (1 - s.d * s.d) - 0.002;
      v.set(Math.cos(s.a) * rr, h, Math.sin(s.a) * rr * 0.82);
      e.set(s.rx, s.ry, Math.PI / 2);
      q.setFromEuler(e);
      m4.compose(v, q, one);
      bits.setMatrixAt(n++, m4);
    }
    bits.count = n;
    bits.instanceMatrix.needsUpdate = true;
    if (bits.instanceColor) bits.instanceColor.needsUpdate = true;
  };
  apply();

  // La pelle à grain (plastique rouge) et les granulés qui tombent.
  const scoop = scoopModel(keep);
  scoop.visible = false;
  g.add(scoop);
  const falling = [];
  let pouring = false;
  let spawn = 0;
  let tilt = 0;
  return {
    group: g,
    scoop,
    get level() { return level; },
    setLevel(k) {
      level = clamp(k);
      if (Math.abs(level - eaten - shown) > 0.002) {
        shown = level - eaten;
        apply();
      }
    },
    /** Le cheval mange : le tas baisse peu à peu (sans changer ce qui a été versé). */
    eat(dt) {
      if (level - eaten <= 0) return;
      eaten = Math.min(level, eaten + dt * 0.03);
      shown = -1;
      this.setLevel(level);
    },
    showScoop(on) { scoop.visible = !!on; },
    /** Posée dans la paille (poulain) : sans son support de mur. */
    setFloor(on) { bracket.visible = !on; },
    pour(on) { pouring = !!on; },
    update(dt) {
      tilt += ((pouring ? 1 : scoop.visible ? 0.15 : 0) - tilt) * Math.min(1, dt * 8);
      // (au-dessus de la mangeoire, le manche vers nous ; le bec penche quand on verse)
      scoop.position.set(-0.02, 0.26 + 0.015 * Math.sin(performance.now() / 260) * tilt, 0.04);
      scoop.rotation.set(0, -2.45, 0.12 + tilt * 0.85);
      if (pouring) {
        spawn += dt * 55;
        while (spawn > 1) {
          spawn -= 1;
          const m = new THREE.Mesh(pelGeo, pelBit);
          scoop.updateMatrix();
          m.position.set(0, -0.01, (Math.random() - 0.5) * 0.08).applyMatrix4(scoop.matrix);
          m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
          g.add(m);
          falling.push({ m, vy: -0.1, vx: (Math.random() - 0.5) * 0.12, spin: (Math.random() - 0.5) * 20 });
        }
      }
      const surf = -F.depth + F.th + (F.depth - F.th) * clamp(level - eaten);
      for (const f of falling) {
        f.vy -= 9.8 * dt;
        f.m.position.y += f.vy * dt;
        f.m.position.x += f.vx * dt;
        f.m.rotation.x += f.spin * dt;
        if (f.m.position.y < surf) f.dead = true;
      }
      for (let i = falling.length - 1; i >= 0; i--) {
        if (!falling[i].dead) continue;
        g.remove(falling[i].m);
        falling.splice(i, 1);
      }
    },
    dispose() {
      bits.dispose();
      keep.dispose();
    },
  };
}

/**
 * Pelle à grain en aluminium : une gouttière ronde ouverte en haut, fermée au fond, une poignée. Origine au bord
 * avant (le bec, en -x) ; tourner autour de z (+) penche le bec vers le bas.
 */
function scoopModel(keep) {
  const s = new THREE.Group();
  const alu = keep(new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.32, metalness: 0.85, side: THREE.DoubleSide }));
  const L = 0.2;
  const R = 0.07;
  // gouttière : la moitié basse d'un cylindre couché le long de x
  const body = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(R, R, L, 22, 1, true, Math.PI, Math.PI)), alu));
  body.rotation.z = Math.PI / 2;
  body.position.x = L / 2;
  s.add(body);
  // rebord roulé du bec et fond
  const lip = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(R, 0.005, 6, 20, Math.PI)), alu));
  lip.rotation.set(0, Math.PI / 2, Math.PI);
  s.add(lip);
  const back = shadowed(new THREE.Mesh(keep(new THREE.CircleGeometry(R, 22, Math.PI, Math.PI)), alu));
  back.rotation.y = Math.PI / 2;
  back.position.x = L;
  s.add(back);
  // granulés dedans (le dessus du tas)
  const pel = keep(new THREE.MeshStandardMaterial({ map: keep(pelletTexture()), roughness: 0.85 }));
  const inside = new THREE.Mesh(keep(new THREE.PlaneGeometry(L * 0.8, R * 1.6)), pel);
  inside.rotation.x = -Math.PI / 2;
  inside.position.set(L * 0.55, -0.02, 0);
  s.add(inside);
  // poignée
  const grip = keep(new THREE.MeshStandardMaterial({ color: 0x2d2d33, roughness: 0.6 }));
  const handle = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.016, 0.018, 0.12, 12)), grip));
  handle.rotation.z = Math.PI / 2 + 0.35;
  handle.position.set(L + 0.055, 0.02, 0);
  s.add(handle);
  return s;
}

// ---------------------------------------------------------------- seau et robinet

export const BUCKET = { r: 0.17, rBot: 0.13, depth: 0.3, th: 0.012 };

/** Seau d'eau en plastique bleu (le bord du haut à l'origine). setLevel(k) : l'eau (0 vide, 1 au bord). */
export function bucket({ high = true } = {}) {
  const keep = bag();
  const g = new THREE.Group();
  const B = BUCKET;
  const blue = keep(new THREE.MeshStandardMaterial({ color: 0x2f74c8, roughness: 0.38, metalness: 0.0 }));
  const shell = shadowed(new THREE.Mesh(keep(new THREE.LatheGeometry(tubProfile(B.r, B.rBot, B.depth, B.th, 0.014), 36)), blue));
  g.add(shell);
  // anneaux moulés du seau
  for (const y of [-0.06, -0.2]) {
    const ring = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(lerp(B.r, B.rBot, -y / B.depth) + 0.003, 0.005, 6, 40)), blue));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    g.add(ring);
  }
  // anse en métal
  const metal = keep(new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.3, metalness: 0.9 }));
  const handle = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(B.r + 0.01, 0.005, 6, 32, Math.PI)), metal));
  handle.rotation.y = Math.PI / 2;
  handle.rotation.z = 0.35;
  handle.position.y = -0.02;
  g.add(handle);
  // L'eau : un disque qui monte, reflets et petites rides.
  const ripple = keep(rippleNormal());
  ripple.repeat.set(2, 2);
  const waterMat = keep(new THREE.MeshStandardMaterial({
    color: 0x1f5a74, roughness: 0.06, metalness: 0.05, transparent: true, opacity: 0.88, normalMap: ripple, normalScale: new THREE.Vector2(0.35, 0.35),
  }));
  waterMat.envMapIntensity = 1.6;
  const water = new THREE.Mesh(keep(new THREE.CircleGeometry(1, 40)), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.receiveShadow = true;
  g.add(water);
  // éclaboussures : anneaux qui s'élargissent à la surface
  const splashTex = keep(softDot('255,255,255'));
  const rings = [];
  const splash = new THREE.Vector3(0.02, 0, 0); // (là où l'eau tombe, repère du seau)
  let level = 0;
  let pour = 0;
  let t = 0;
  const apply = () => {
    const k = clamp(level);
    water.visible = k > 0.01;
    const y = -B.depth + B.th + (B.depth - B.th - 0.02) * k;
    water.position.y = y;
    water.scale.setScalar(lerp(B.rBot - B.th, B.r - B.th, (y + B.depth) / B.depth) * 0.99);
  };
  apply();
  // la bande verte et la ligne 🎯 (setMark), sur la paroi intérieure
  const band = new THREE.Mesh(keep(new THREE.CylinderGeometry(1, 1, 1, 36, 1, true)), keep(new THREE.MeshBasicMaterial({ color: 0x3fae62, transparent: true, opacity: 0.38, side: THREE.BackSide, depthWrite: false })));
  band.visible = false;
  g.add(band);
  const line = new THREE.Mesh(keep(new THREE.TorusGeometry(1, 0.035, 6, 40)), keep(new THREE.MeshBasicMaterial({ color: 0xffffff })));
  line.rotation.x = Math.PI / 2;
  line.visible = false;
  g.add(line);
  const yAt = (k) => -B.depth + B.th + (B.depth - B.th - 0.02) * k;
  const rAt = (y) => lerp(B.rBot - B.th, B.r - B.th, (y + B.depth) / B.depth) * 0.995;
  return {
    group: g,
    water,
    /** La zone juste [lo, hi] et la ligne 🎯 (parts du seau). Renvoie la hauteur de la ligne (repère du seau). */
    setMark(lo, hi, target) {
      const y0 = yAt(lo);
      const y1 = yAt(hi);
      band.position.y = (y0 + y1) / 2;
      const r = rAt(band.position.y);
      band.scale.set(r, y1 - y0, r);
      band.visible = true;
      line.position.y = yAt(target);
      line.scale.setScalar(rAt(line.position.y));
      line.visible = true;
      return { y: line.position.y, r: rAt(line.position.y) };
    },
    get level() { return level; },
    setLevel(k) {
      level = clamp(k);
      apply();
    },
    /** Où tombe l'eau (repère du seau) : les anneaux d'éclaboussure naissent là. */
    splashAt(p) { splash.set(p.x, 0, p.z); },
    /** Hauteur de l'eau (repère du seau). */
    surfaceY() { return water.position.y; },
    flow(k) { pour = k; },
    drink(dt) {
      level = Math.max(0, level - dt * 0.012);
      apply();
    },
    update(dt) {
      t += dt;
      ripple.offset.set(t * 0.03, t * 0.02);
      waterMat.normalScale.setScalar(0.25 + pour * 0.8);
      if (pour > 0 && water.visible && Math.random() < dt * 12 * pour) {
        const m = new THREE.Mesh(keep(new THREE.RingGeometry(0.6, 1, 24)), keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, alphaMap: splashTex })));
        m.rotation.x = -Math.PI / 2;
        m.position.set((Math.random() - 0.5) * 0.04 + splash.x, water.position.y + 0.003, (Math.random() - 0.5) * 0.04 + splash.z);
        m.scale.setScalar(0.01);
        g.add(m);
        rings.push({ m, age: 0 });
      }
      for (const rr of rings) {
        rr.age += dt;
        rr.m.scale.setScalar(0.01 + rr.age * 0.18);
        rr.m.material.opacity = Math.max(0, 0.45 * (1 - rr.age / 0.6));
        rr.m.position.y = water.position.y + 0.003;
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        if (rings[i].age < 0.6) continue;
        g.remove(rings[i].m);
        rings[i].m.geometry.dispose();
        rings[i].m.material.dispose();
        rings.splice(i, 1);
      }
    },
    dispose() { keep.dispose(); },
  };
}

/**
 * Robinet en laiton au mur (origine contre le mur, le corps sort vers -x, dans le box), un tuyau d'arrosage vert
 * qui descend le long du mur et passe par-dessus le bord du seau, où sa lance verse l'eau. Rien ne dépasse du mur
 * de plus de 7 cm au-dessus du seau : la tête du cheval (même d'un poulain qui baisse le nez vers le seau) ne
 * traverse jamais le robinet. hookUp(nozzle, inward) : pose la lance (repère du robinet) et y tire le tuyau ;
 * setFlow(k, toY) : 0 fermé, 1 grand ouvert ; toY : hauteur de l'eau (repère du robinet).
 */
export function waterTap() {
  const keep = bag();
  const g = new THREE.Group();
  const brass = keep(new THREE.MeshStandardMaterial({ color: 0xc89a48, roughness: 0.25, metalness: 0.9 }));
  const flange = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 18)), brass));
  flange.rotation.z = Math.PI / 2;
  flange.position.x = -0.005;
  g.add(flange);
  const pipe = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 12)), brass));
  pipe.rotation.z = Math.PI / 2;
  pipe.position.x = -0.03;
  g.add(pipe);
  const body = shadowed(new THREE.Mesh(keep(new THREE.SphereGeometry(0.022, 14, 10)), brass));
  body.position.x = -0.055;
  g.add(body);
  const outlet = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.011, 0.013, 0.045, 12)), brass));
  outlet.position.set(-0.055, -0.035, 0);
  g.add(outlet);
  // poignée papillon rouge, sur le dessus (elle tourne quand on ouvre)
  const red = keep(new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.5 }));
  const handleG = new THREE.Group();
  handleG.position.set(-0.055, 0.03, 0);
  g.add(handleG);
  const stem = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.005, 0.005, 0.025, 8)), brass));
  stem.position.y = -0.01;
  handleG.add(stem);
  const wing = keep(new THREE.SphereGeometry(0.018, 12, 8));
  for (const s of [-1, 1]) {
    const w = shadowed(new THREE.Mesh(wing, red));
    w.scale.set(1.5, 0.45, 0.8);
    w.position.set(0, 0.004, s * 0.024);
    handleG.add(w);
  }
  // le tuyau (fait par hookUp) et sa lance
  const hoseMat = keep(new THREE.MeshStandardMaterial({ color: 0x2f8a3c, roughness: 0.55, map: keep(hoseTexture()) }));
  let hose = null;
  const black = keep(new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.6 }));
  const nozzle = new THREE.Group();
  const nzBody = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.014, 0.017, 0.07, 14)), black));
  nzBody.position.y = 0.035;
  nozzle.add(nzBody);
  const nzTip = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.009, 0.012, 0.02, 12)), brass));
  nzTip.position.y = -0.005;
  nozzle.add(nzTip);
  g.add(nozzle);
  // le filet d'eau : un cylindre transparent dont la texture défile vers le bas
  const streamTex = keep(new THREE.CanvasTexture(streamCanvas()));
  streamTex.wrapS = THREE.RepeatWrapping;
  streamTex.wrapT = THREE.RepeatWrapping;
  const streamMat = keep(new THREE.MeshStandardMaterial({ color: 0xcfe9ff, map: streamTex, transparent: true, opacity: 0.75, roughness: 0.05, metalness: 0.1, depthWrite: false }));
  const stream = new THREE.Mesh(keep(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true)), streamMat);
  stream.visible = false;
  g.add(stream);
  const tip = new THREE.Vector3(-0.055, -0.06, 0);
  let flow = 0;
  let to = -0.5;
  let t = 0;
  return {
    group: g,
    /**
     * Pose la lance en nz (repère du robinet : sur le bord du seau, côté mur) et tire le tuyau du robinet jusqu'à
     * elle : il descend le long du mur, puis passe par-dessus le bord. inward : direction (repère du robinet, à plat)
     * du bord vers le milieu du seau.
     */
    hookUp(nz, inward, floorY = null) {
      const inn = inward.clone().setY(0).normalize();
      nozzle.position.copy(nz);
      // (la lance penche vers le milieu du seau)
      nozzle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0).addScaledVector(inn, -0.45).normalize());
      tip.copy(nz).addScaledVector(inn, 0.02).add(new THREE.Vector3(0, -0.012, 0));
      const top = nz.clone().addScaledVector(inn, -0.035).add(new THREE.Vector3(0, 0.09, 0));
      const wallX = Math.max(-0.02, Math.min(nz.x, -0.02));
      const end = [top, nz.clone().add(new THREE.Vector3(0, 0.07, 0)).addScaledVector(inn, -0.015)];
      // Seau loin du mur (posé dans la paille) : le tuyau descend le long du mur jusqu'au sol, traverse la paille
      // et remonte le long du seau ; seau au mur : il descend le long du mur et passe par-dessus le bord.
      const pts = floorY !== null && nz.x < -0.12
        ? [
          new THREE.Vector3(-0.055, -0.055, 0),
          new THREE.Vector3(-0.04, -0.2, 0.02),
          new THREE.Vector3(-0.03, floorY + 0.08, nz.z * 0.4),
          new THREE.Vector3(-0.07, floorY + 0.012, nz.z * 0.7),
          new THREE.Vector3(nz.x + 0.12, floorY + 0.012, nz.z + 0.02),
          new THREE.Vector3(nz.x + 0.05, floorY + 0.03, nz.z),
          new THREE.Vector3(nz.x + 0.025, (floorY + nz.y) / 2, nz.z),
          ...end,
        ]
        : [
          new THREE.Vector3(-0.055, -0.055, 0),
          new THREE.Vector3(-0.05, -0.16, 0.01),
          new THREE.Vector3(wallX, (nz.y + -0.16) / 2 + 0.02, nz.z * 0.55),
          top.clone().setX((top.x + wallX) / 2).add(new THREE.Vector3(0, 0.06, 0)),
          ...end,
        ];
      if (hose) {
        g.remove(hose);
        hose.geometry.dispose();
      }
      hose = shadowed(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 64, 0.0115, 10, false), hoseMat));
      g.add(hose);
    },
    setFlow(k, toY = to) {
      flow = clamp(k);
      to = toY;
    },
    /** Le bout de la lance, d'où tombe l'eau (repère monde). */
    tipWorld(out = new THREE.Vector3()) {
      g.updateWorldMatrix(true, false);
      return g.localToWorld(out.copy(tip));
    },
    update(dt) {
      t += dt;
      handleG.rotation.y += ((flow > 0 ? -1.2 : 0) - handleG.rotation.y) * Math.min(1, dt * 10);
      stream.visible = flow > 0.02;
      if (stream.visible) {
        const len = Math.max(0.02, tip.y - to);
        stream.scale.set(0.005 + flow * 0.007, len, 0.005 + flow * 0.007);
        stream.position.set(tip.x, tip.y - len / 2, tip.z);
        streamTex.offset.y = (t * 3.5) % 1;
        streamTex.repeat.set(1, len * 3);
      }
    },
    dispose() {
      hose?.geometry.dispose();
      keep.dispose();
    },
  };
}

/** Tuyau d'arrosage : vert, une fine rayure claire le long du tuyau. */
function hoseTexture() {
  const c = paint(64, 16, (x) => {
    x.fillStyle = '#3a9a46';
    x.fillRect(0, 0, 64, 16);
    x.fillStyle = 'rgba(255,255,255,0.35)';
    x.fillRect(0, 6, 64, 2);
    x.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 64; i += 4) x.fillRect(i, 0, 1, 16);
  }, 'hose');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 1);
  return t;
}

function streamCanvas() {
  return paint(16, 64, (x) => {
    const r = rng(17);
    x.fillStyle = '#b8dcff';
    x.fillRect(0, 0, 16, 64);
    for (let i = 0; i < 18; i++) {
      x.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.5})`;
      x.fillRect(r() * 16, r() * 64, 1 + r() * 2, 4 + r() * 10);
    }
  }, 'stream');
}

// ---------------------------------------------------------------- friandises et main

/** Une carotte (avec ses fanes) ou une pomme rouge. */
export function treatModel(kind = 'carrot', keep) {
  const g = new THREE.Group();
  if (kind === 'apple') {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI;
      const r = Math.sin(a) * (0.042 + 0.006 * Math.sin(a * 2));
      pts.push(new THREE.Vector2(Math.max(0.0001, r), -Math.cos(a) * 0.04 - (i < 3 || i > 13 ? 0.004 : 0)));
    }
    const skin = keep(new THREE.MeshStandardMaterial({ color: 0xc4231f, roughness: 0.35, map: keep(noiseTexture('#d23a2a', 0.25, 6, 64)) }));
    const apple = shadowed(new THREE.Mesh(keep(new THREE.LatheGeometry(pts, 24)), skin));
    g.add(apple);
    const stem = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.003, 0.004, 0.03, 6)), keep(new THREE.MeshStandardMaterial({ color: 0x5a3a1c }))));
    stem.position.y = 0.045;
    stem.rotation.z = 0.3;
    g.add(stem);
    const leaf = shadowed(new THREE.Mesh(keep(new THREE.SphereGeometry(0.014, 8, 6)), keep(new THREE.MeshStandardMaterial({ color: 0x4f9a3a, roughness: 0.6 }))));
    leaf.scale.set(1.4, 0.25, 0.7);
    leaf.position.set(0.012, 0.05, 0);
    g.add(leaf);
  } else {
    const carrot = keep(new THREE.MeshStandardMaterial({ color: 0xf07a1e, roughness: 0.55, map: keep(carrotTexture()) }));
    const body = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.02, 0.003, 0.17, 14, 6)), carrot));
    body.rotation.z = Math.PI / 2;
    g.add(body);
    const tip = shadowed(new THREE.Mesh(keep(new THREE.SphereGeometry(0.02, 12, 8)), carrot));
    tip.position.x = -0.085;
    tip.scale.set(0.5, 1, 1);
    g.add(tip);
    const green = keep(new THREE.MeshStandardMaterial({ color: 0x4c9a34, roughness: 0.6, side: THREE.DoubleSide }));
    for (let i = 0; i < 4; i++) {
      const leaf = shadowed(new THREE.Mesh(keep(new THREE.ConeGeometry(0.012, 0.09, 5)), green));
      leaf.position.set(-0.12, 0.012 * (i - 1.5), 0.006 * (i % 2 ? 1 : -1));
      leaf.rotation.z = Math.PI / 2 + (i - 1.5) * 0.25;
      g.add(leaf);
    }
  }
  return g;
}

function carrotTexture() {
  const c = paint(64, 64, (x) => {
    const r = rng(5);
    x.fillStyle = '#f08a2e';
    x.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 14; i++) {
      x.fillStyle = 'rgba(150,60,10,0.35)';
      x.fillRect(0, r() * 64, 64, 1);
    }
  }, 'carrot');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Une main ouverte et bien à plat, paume vers le haut (la nôtre : couleur de peau de l'avatar), comme on tend une
 * friandise à un cheval (les doigts serrés, le pouce le long de la main : rien qu'il puisse pincer), avec le
 * poignet et le bas de la manche. Origine au milieu de la paume ; les doigts vers +x, la paume vers +y, le pouce vers
 * +z.
 */
export function handModel(keep, { skin = 0xf0c29a, sleeve = 0x3f7fd0 } = {}) {
  const g = new THREE.Group();
  const skinMat = keep(new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 }));
  // paume : un coussin plat, un peu plus large vers les doigts, creusé au milieu (le creux de la main)
  const palmGeo = keep(new THREE.SphereGeometry(0.05, 24, 14));
  const pp = palmGeo.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i);
    const y = pp.getY(i);
    const z = pp.getZ(i);
    const w = 1 + 0.18 * (x / 0.05); // (plus large côté doigts)
    const hollow = y > 0 ? 1 - 0.35 * Math.max(0, 1 - (x * x + z * z) / 0.0016) : 1;
    pp.setXYZ(i, x * 1.08, y * 0.3 * hollow, z * 0.9 * w);
  }
  palmGeo.computeVertexNormals();
  const palm = shadowed(new THREE.Mesh(palmGeo, skinMat));
  g.add(palm);
  // doigts : quatre, longs et serrés, presque droits (main à plat), le bout un peu relevé
  const seg = keep(new THREE.CapsuleGeometry(0.0085, 0.03, 4, 10));
  const tipSeg = keep(new THREE.CapsuleGeometry(0.0078, 0.022, 4, 10));
  const lens = [0.92, 1.05, 1.0, 0.8];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group();
    f.position.set(0.05 - Math.abs(i - 1.5) * 0.004, 0.003, -0.026 + i * 0.0175);
    f.rotation.y = (i - 1.5) * 0.03;
    g.add(f);
    const p1 = shadowed(new THREE.Mesh(seg, skinMat));
    p1.rotation.z = -Math.PI / 2;
    p1.position.x = 0.02 * lens[i];
    p1.scale.set(1, lens[i], 1);
    f.add(p1);
    const j = new THREE.Group();
    j.position.x = 0.042 * lens[i];
    j.rotation.z = 0.12;
    f.add(j);
    const p2 = shadowed(new THREE.Mesh(tipSeg, skinMat));
    p2.rotation.z = -Math.PI / 2;
    p2.position.x = 0.014 * lens[i];
    p2.scale.set(1, lens[i], 1);
    j.add(p2);
  }
  // le pouce, le long de la main
  const thumb = shadowed(new THREE.Mesh(seg, skinMat));
  thumb.position.set(0.012, 0.004, 0.046);
  thumb.rotation.set(0, -0.35, -Math.PI / 2);
  thumb.scale.set(1.12, 1.05, 1.12);
  g.add(thumb);
  // poignet et bas de la manche (court : la main entre dans l'image par le côté)
  const wrist = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.026, 0.03, 0.11, 16)), skinMat));
  wrist.rotation.z = Math.PI / 2;
  wrist.position.x = -0.085;
  wrist.scale.set(1, 1, 0.68);
  g.add(wrist);
  const sleeveMat = keep(new THREE.MeshStandardMaterial({ color: sleeve, roughness: 0.88 }));
  const cuff = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.036, 0.042, 0.34, 18, 1, true)), sleeveMat));
  cuff.rotation.z = Math.PI / 2;
  cuff.position.x = -0.31;
  cuff.scale.set(1, 1, 0.85);
  g.add(cuff);
  const band = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(0.034, 0.006, 8, 22)), sleeveMat));
  band.rotation.y = Math.PI / 2;
  band.position.x = -0.142;
  band.scale.set(1, 1, 0.85);
  g.add(band);
  return g;
}

/**
 * Oriente la main : les doigts de from (l'épaule, hors de l'image) vers to, la paume vers le haut (palmUp) ou vers
 * le bas (sur le poil).
 */
export function aimHand(hand, from, to, palmUp = true, normal = null) {
  const x = to.clone().sub(from).normalize();
  const upRef = normal ? normal.clone().multiplyScalar(palmUp ? 1 : -1) : new THREE.Vector3(0, palmUp ? 1 : -1, 0);
  const z = new THREE.Vector3().crossVectors(x, upRef).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  hand.quaternion.setFromRotationMatrix(m);
}

// ---------------------------------------------------------------- outils du pansage

/**
 * Outils du pansage, prêts à suivre le doigt (origine : là où l'outil touche le poil ; +y : vers l'extérieur du
 * corps). kind : curry (étrille ronde en caoutchouc), brush (brosse douce, dos en bois), pick (cure-pied), comb
 * (peigne), sponge (éponge).
 */
export function groomTool(kind, keep) {
  const g = new THREE.Group();
  if (kind === 'curry') {
    const rub = keep(new THREE.MeshStandardMaterial({ color: 0xd23d3d, roughness: 0.55 }));
    const disc = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.06, 0.065, 0.03, 28)), rub));
    disc.position.y = 0.025;
    g.add(disc);
    // dents en anneaux
    for (const r of [0.052, 0.036, 0.02]) {
      const ring = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(r, 0.0045, 6, 30)), rub));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.006;
      g.add(ring);
    }
    const strap = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(0.045, 0.008, 6, 20, Math.PI)), keep(new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.7 }))));
    strap.position.y = 0.04;
    strap.scale.set(1, 0.6, 1);
    g.add(strap);
  } else if (kind === 'brush') {
    const woodM = keep(new THREE.MeshStandardMaterial({ color: 0x9a6232, roughness: 0.5 }));
    const back = shadowed(new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.035, 0.12, 6, 14)), woodM));
    back.rotation.z = Math.PI / 2;
    back.scale.set(1, 1, 0.45);
    back.position.y = 0.04;
    g.add(back);
    const bristles = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(0.17, 0.028, 0.055)), keep(new THREE.MeshStandardMaterial({ color: 0x2c2018, roughness: 0.95, map: keep(noiseTexture('#3a2a1e', 0.35, 9, 64)) }))));
    bristles.position.y = 0.014;
    g.add(bristles);
    const strap = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(0.055, 0.007, 6, 20, Math.PI)), keep(new THREE.MeshStandardMaterial({ color: 0x1d4f8a, roughness: 0.7 }))));
    strap.position.y = 0.058;
    strap.scale.set(1.3, 0.45, 1);
    g.add(strap);
  } else if (kind === 'pick') {
    const handleM = keep(new THREE.MeshStandardMaterial({ color: 0x2a7ac4, roughness: 0.45 }));
    const metal = keep(new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.25, metalness: 0.9 }));
    const handle = shadowed(new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.016, 0.1, 6, 12)), handleM));
    handle.position.y = 0.09;
    handle.rotation.z = 0.25;
    g.add(handle);
    const hook = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(0.025, 0.006, 8, 16, Math.PI * 0.9)), metal));
    hook.position.set(-0.005, 0.03, 0);
    hook.rotation.z = Math.PI * 0.55;
    g.add(hook);
  } else if (kind === 'comb') {
    const metal = keep(new THREE.MeshStandardMaterial({ color: 0xd2d6dc, roughness: 0.25, metalness: 0.9 }));
    const spine = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(0.15, 0.022, 0.006)), metal));
    spine.position.y = 0.045;
    g.add(spine);
    const teeth = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(0.003, 0.04, 0.004)), metal, 18);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 18; i++) teeth.setMatrixAt(i, m4.makeTranslation(-0.068 + i * 0.008, 0.017, 0));
    teeth.castShadow = true;
    keep({ dispose: () => teeth.dispose() });
    g.add(teeth);
  } else {
    const sponge = shadowed(new THREE.Mesh(keep(lumpy(new THREE.BoxGeometry(0.12, 0.05, 0.08, 6, 3, 5), 0.004, 2, 40)), keep(new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.95 }))));
    sponge.position.y = 0.025;
    g.add(sponge);
  }
  return g;
}

/**
 * Chaussette de boue (à enrouler autour d'un canon : u autour de la jambe, v de bas en haut) : une boue épaisse en
 * bas, qui remonte en traînées et en éclaboussures, au bord haut déchiqueté. base : couleur de la boue (mouillée,
 * foncée ; sèche, claire et craquelée). Des taches plus sombres et des croûtes plus claires : elle se voit sur une
 * jambe noire comme sur une balzane blanche.
 */
export function sockTexture(base = 'rgb(130,100,70)', wet = 0, seed = 3) {
  const W = 128;
  const H = 256;
  const c = paint(W, H, (x) => drawSock(x, W, H, base, wet, seed), `sock|${base}|${wet < 0.5}|${seed}`);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function drawSock(x, W, H, base, wet, seed) {
  const r = rng(seed);
  const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(base) ?? [0, 130, 100, 70];
  const [R, G, B] = [+m[1], +m[2], +m[3]];
  const col = (k, a = 1) => `rgba(${Math.round(R * k)},${Math.round(G * k)},${Math.round(B * k)},${a})`;
  // (en canvas, y vers le bas : le bas de la jambe est en bas de l'image)
  // le bord haut, déchiqueté : des coulées qui remontent plus ou moins haut
  x.fillStyle = col(1);
  x.beginPath();
  x.moveTo(0, H);
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const u = (i / n) * W;
    const top = H * (0.22 + 0.2 * r()) - (r() < 0.3 ? H * 0.12 * r() : 0);
    x.lineTo(u, top);
  }
  x.lineTo(W, H);
  x.closePath();
  x.fill();
  // plus épaisse et plus foncée en bas (le sabot a traîné dans la boue)
  const gr = x.createLinearGradient(0, H * 0.4, 0, H);
  gr.addColorStop(0, col(1, 0));
  gr.addColorStop(1, col(0.7, 0.9));
  x.fillStyle = gr;
  x.fillRect(0, H * 0.4, W, H * 0.6);
  // taches sombres (mottes) et éclaboussures au-dessus du bord
  for (let i = 0; i < 46; i++) {
    const u = r() * W;
    const v = H * (0.35 + 0.65 * r());
    x.fillStyle = col(0.6 + r() * 0.2, 0.85);
    x.beginPath();
    x.ellipse(u, v, 3 + r() * 7, 2 + r() * 5, r() * 3, 0, Math.PI * 2);
    x.fill();
  }
  for (let i = 0; i < 40; i++) {
    const u = r() * W;
    const v = H * (0.04 + 0.3 * r());
    x.fillStyle = col(0.85 + r() * 0.3, 0.95);
    x.beginPath();
    x.arc(u, v, 1 + r() * 3.2, 0, Math.PI * 2);
    x.fill();
  }
  // sèche : croûtes claires et fines craquelures ; mouillée : reflets
  if (wet < 0.5) {
    for (let i = 0; i < 70; i++) {
      x.fillStyle = col(1.3 + r() * 0.2, 0.8);
      x.fillRect(r() * W, H * (0.3 + 0.7 * r()), 2 + r() * 4, 1.5 + r() * 2.5);
    }
    x.strokeStyle = col(0.45, 0.7);
    x.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      let u = r() * W;
      let v = H * (0.5 + 0.5 * r());
      x.beginPath();
      x.moveTo(u, v);
      for (let k = 0; k < 3; k++) x.lineTo((u += (r() - 0.5) * 16), (v += (r() - 0.5) * 16));
      x.stroke();
    }
  } else {
    for (let i = 0; i < 30; i++) {
      x.fillStyle = 'rgba(255,255,255,0.18)';
      x.fillRect(r() * W, H * (0.45 + 0.5 * r()), 1 + r() * 2, 4 + r() * 8);
    }
  }
}

/** Tache de boue séchée (craquelée, bords irréguliers), de poussière (poudre claire) ou de boue des jambes (traînées). */
export function mudTexture(kind = 'mud', seed = 1) {
  const S = 128;
  const c = paint(S, S, (x) => drawMud(x, S, kind, seed), `mud|${kind}|${seed}`);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function drawMud(x, S, kind, seed) {
  const r = rng(seed);
  /** Une forme irrégulière (polygone aux rayons tirés au hasard, lissé). */
  const splat = (cx, cy, rad, col, n = 14, jag = 0.35) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 - jag / 2 + r() * jag;
      pts.push([cx + Math.cos(a) * rad * k, cy + Math.sin(a) * rad * k]);
    }
    x.fillStyle = col;
    x.beginPath();
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % n];
      if (i === 0) x.moveTo((x0 + x1) / 2, (y0 + y1) / 2);
      else x.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    const [xa, ya] = pts[0];
    const [xb, yb] = pts[1];
    x.quadraticCurveTo(xa, ya, (xa + xb) / 2, (ya + yb) / 2);
    x.fill();
  };
  if (kind === 'dust') {
    // poussière : un voile sableux, des grains plus clairs
    for (let i = 0; i < 26; i++) splat(S / 2 + (r() - 0.5) * 56, S / 2 + (r() - 0.5) * 50, 10 + r() * 16, `rgba(${196 + r() * 24},${172 + r() * 20},${136 + r() * 18},0.22)`, 10, 0.5);
    for (let i = 0; i < 160; i++) {
      x.fillStyle = `rgba(${215 + r() * 30},${195 + r() * 30},${160 + r() * 30},${0.3 + r() * 0.4})`;
      x.fillRect(S / 2 + (r() - 0.5) * 80, S / 2 + (r() - 0.5) * 70, 1 + r() * 1.5, 1 + r() * 1.5);
    }
  } else {
    const leg = kind === 'leg';
    // bord séché plus clair, cœur sombre et humide, puis craquelures et croûtes claires
    const blobs = leg ? 5 : 6;
    for (let i = 0; i < blobs; i++) {
      const cx = S / 2 + (r() - 0.5) * (leg ? 22 : 40);
      const cy = S / 2 + (r() - 0.5) * (leg ? 70 : 36);
      const rad = (leg ? 14 : 18) + r() * (leg ? 10 : 16);
      splat(cx, cy, rad * 1.12, 'rgba(150,108,70,0.88)');
      splat(cx, cy, rad, `rgba(${92 + r() * 18},${58 + r() * 12},${32 + r() * 8},0.97)`);
    }
    // éclaboussures autour
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2;
      const d = 34 + r() * 18;
      splat(S / 2 + Math.cos(a) * d * (leg ? 0.5 : 1), S / 2 + Math.sin(a) * d, 2 + r() * 4, 'rgba(96,68,42,0.9)', 8, 0.4);
    }
    // craquelures
    x.strokeStyle = 'rgba(40,26,14,0.8)';
    x.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) {
      x.beginPath();
      let px = S / 2 + (r() - 0.5) * 40;
      let py = S / 2 + (r() - 0.5) * 40;
      x.moveTo(px, py);
      for (let k = 0; k < 3; k++) {
        px += (r() - 0.5) * 18;
        py += (r() - 0.5) * 18;
        x.lineTo(px, py);
      }
      x.stroke();
    }
    // croûtes sèches (petits éclats clairs)
    for (let i = 0; i < 40; i++) {
      x.fillStyle = `rgba(${170 + r() * 30},${142 + r() * 25},${104 + r() * 20},${0.4 + r() * 0.4})`;
      x.fillRect(S / 2 + (r() - 0.5) * 56, S / 2 + (r() - 0.5) * (leg ? 80 : 50), 1.5 + r() * 2, 1 + r() * 1.5);
    }
  }
}
