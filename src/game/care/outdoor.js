// Le dehors des scènes de soin : l'herbe (avec ses touffes et ses fleurs, selon la saison), les clôtures en bois, les
// arbres et les collines au loin, le ciel (ses couleurs suivent l'heure et la météo : ambience.js) et la lumière du
// soleil. Une boîte à outils pour les décors qui ont une version dehors : le pré du cheval (stall.js, outdoor), le pré
// du bétail (farmBarn.js, outdoor), le jardin du chien et du chat (garden.js), l'enclos du lapin (hutch.js).
// Reprend l'herbe et les touffes du pré des chèvres (paddock.js).

import * as THREE from 'three';
import { rng, canvasTex } from './textures.js';
import { barnWood, lumpy } from './barnProps.js';
import { grassTexture, tuftTexture } from './paddock.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Couleur de l'herbe selon la saison (multipliée par la texture). */
const GRASS_TINT = { spring: 0xe8f4cf, summer: 0xdfe8cf, autumn: 0xe0d8ae, winter: 0xcfd2bf };
/** Couleurs du feuillage selon la saison (l'hiver : des arbres nus, quelques sapins). */
const LEAVES = { spring: [0x6a9a3e, 0x7aa848, 0xe8b8c8], summer: [0x4f7a34, 0x5d8a3c, 0x46702f], autumn: [0xc8782c, 0xd8a03a, 0x9a4a28], winter: [0x2f5a3a, 0x355f40, 0x2a5236] };

/**
 * L'herbe : un grand sol, des touffes (cartes en croix, une seule instance) et des fleurs. o : { x0, x1, z0, z1 }
 * (la zone où semer), keepOut (rectangle sans touffes hautes : là où il se tient), season, high, seed, flowers.
 * Renvoie { group, mats } (mats : les matières du sol, que la pluie mouille et que la neige blanchit).
 */
export function grassField(keep, { x0 = -6, x1 = 6, z0 = -6, z1 = 4, keepOut = null, season = 'summer', high = true, seed = 12, flowers = 60, size = 60 } = {}) {
  const g = new THREE.Group();
  const r = rng(seed);
  const tex = keep(grassTexture());
  tex.repeat.set(size / 3.6, size / 3.6);
  const groundMat = keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 1, color: GRASS_TINT[season] ?? GRASS_TINT.summer }));
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(size, size)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
  ground.receiveShadow = true;
  g.add(ground);
  const tuftMat = keep(new THREE.MeshStandardMaterial({ map: keep(tuftTexture()), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9, color: season === 'autumn' ? 0xe8dcb0 : season === 'winter' ? 0xd8d8c4 : 0xffffff }));
  const tuftGeo = keep(new THREE.PlaneGeometry(1, 1));
  tuftGeo.translate(0, 0.5, 0);
  const nT = high ? 360 : 220;
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, nT * 2);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = V();
  let k = 0;
  for (let i = 0; i < nT; i++) {
    const x = x0 + r() * (x1 - x0);
    const z = z0 + r() * (z1 - z0);
    const inside = keepOut && x > keepOut.x0 && x < keepOut.x1 && z > keepOut.z0 && z < keepOut.z1;
    if (inside && r() < 0.8) continue;
    const h = (0.05 + r() * 0.09) * (inside ? 0.6 : 1);
    for (const a of [0, Math.PI / 2]) {
      e.set(0, r() * 3 + a, 0);
      q.setFromEuler(e);
      s.set(h * 1.3, h, h * 1.3);
      m4.compose(V(x, 0, z), q, s);
      tufts.setMatrixAt(k++, m4);
    }
  }
  tufts.count = k;
  tufts.receiveShadow = true;
  tufts.userData.grass = true; // (sous la neige, l'herbe disparaît : ambience.js)
  g.add(tufts);
  // fleurs : pâquerettes au printemps et l'été, boutons d'or, quelques feuilles mortes l'automne
  const nF = season === 'winter' ? 0 : season === 'autumn' ? Math.round(flowers * 0.6) : season === 'spring' ? Math.round(flowers * 1.4) : flowers;
  if (nF > 0) {
    const petal = keep(new THREE.CircleGeometry(0.013, 8));
    petal.rotateX(-Math.PI / 2);
    const col = season === 'autumn' ? [0xc8642c, 0xd89a3a, 0x8a4a24] : [0xfbfaf4, 0xfbfaf4, 0xf4d23c];
    const mats = col.map((c) => keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 })));
    const per = Math.ceil(nF / mats.length);
    for (const mt of mats) {
      const inst = new THREE.InstancedMesh(petal, mt, per);
      for (let i = 0; i < per; i++) {
        const x = x0 + r() * (x1 - x0);
        const z = z0 + r() * (z1 - z0);
        const sc = season === 'autumn' ? 1.6 : 1;
        m4.compose(V(x, 0.012 + r() * 0.02, z), q.setFromEuler(e.set(0, r() * 6, 0)), s.set(sc, 1, sc * 0.8));
        inst.setMatrixAt(i, m4);
      }
      inst.userData.grass = true;
      g.add(inst);
    }
  }
  return { group: g, mats: [groundMat, tuftMat], ground };
}

/** Les matières du bois des clôtures (poteaux plus vieux, lisses plus claires). */
export function fenceMats(keep) {
  const post = keep(barnWood(21, true, 'old'));
  const rail = keep(barnWood(22, false, 'pale'));
  return {
    post: keep(new THREE.MeshStandardMaterial({ map: post, roughness: 0.9, color: 0xd8c4a8 })),
    rail: keep(new THREE.MeshStandardMaterial({ map: rail, roughness: 0.85, color: 0xe6d6bc })),
  };
}

/**
 * Une clôture à lisses de a à b (au sol), dans le groupe into : des poteaux tous les ~1,7 m et trois lisses (ou rails).
 * h : hauteur. Renvoie la liste des poteaux (positions) et les hauteurs des lisses.
 */
export function fenceLine(keep, into, mats, a, b, { h = 1.2, rails = 3, seed = 3, postEvery = 1.7, skipPosts = false } = {}) {
  const r = rng(seed);
  const len = a.distanceTo(b);
  const n = Math.max(1, Math.round(len / postEvery));
  const postGeo = keep(lumpy(new THREE.BoxGeometry(0.11, h + 0.1, 0.11, 1, 3, 1), 0.006, 3));
  const posts = [];
  if (!skipPosts) {
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      const m = new THREE.Mesh(postGeo, mats.post);
      m.position.set(p.x, (h + 0.1) / 2 - 0.05, p.z);
      m.rotation.y = (r() - 0.5) * 0.2;
      m.castShadow = true;
      m.receiveShadow = true;
      into.add(m);
      posts.push(p);
    }
  }
  const ang = Math.atan2(b.z - a.z, b.x - a.x);
  const ys = [];
  for (let i = 0; i < rails; i++) {
    const y = (0.3 + (i * 0.62) / Math.max(1, rails - 1)) * h;
    ys.push(y);
    const geo = keep(new THREE.BoxGeometry(len + 0.1, 0.09, 0.04));
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * len / 1.2, uv.getY(k));
    const m = new THREE.Mesh(geo, mats.rail);
    m.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
    m.rotation.set(0, -ang, (r() - 0.5) * 0.02);
    m.castShadow = true;
    m.receiveShadow = true;
    into.add(m);
  }
  return { posts, rails: ys, top: ys[ys.length - 1] + 0.05 };
}

/** Au loin : des arbres (feuillage de la saison) et des collines. xC : le milieu ; zFar : la ligne des arbres. */
export function farAway(keep, { xC = 0, zFar = -8, season = 'summer', seed = 7, n = 9, spread = 3.2 } = {}) {
  const g = new THREE.Group();
  const r = rng(seed);
  const trunkMat = keep(new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 1 }));
  const leafMats = (LEAVES[season] ?? LEAVES.summer).map((c) => keep(new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true })));
  const crown = keep(lumpy(new THREE.IcosahedronGeometry(1, 2), 0.16, 4, 2.4));
  const cone = keep(new THREE.ConeGeometry(1, 2.6, 9));
  const trunkGeo = keep(new THREE.CylinderGeometry(0.12, 0.18, 1.8, 8));
  const branchGeo = keep(new THREE.CylinderGeometry(0.03, 0.06, 1.3, 5));
  for (let i = 0; i < n; i++) {
    const x = xC + (i - (n - 1) / 2) * spread + (r() - 0.5) * 1.4;
    const z = zFar - r() * 6;
    const sc = 0.75 + r() * 0.5;
    const t = new THREE.Mesh(trunkGeo, trunkMat);
    t.position.set(x, 0.9 * sc, z);
    t.scale.setScalar(sc);
    g.add(t);
    if (season === 'winter') {
      // (l'hiver : un sapin sur trois, les autres nus, quelques branches)
      if (i % 3 === 0) {
        const c = new THREE.Mesh(cone, leafMats[i % 3]);
        c.position.set(x, (1.6 + 1.3) * sc, z);
        c.scale.setScalar(sc * 0.9);
        g.add(c);
      } else {
        for (let j = 0; j < 3; j++) {
          const b = new THREE.Mesh(branchGeo, trunkMat);
          b.position.set(x + (j - 1) * 0.25 * sc, 2.1 * sc, z);
          b.rotation.z = (j - 1) * 0.7;
          b.scale.setScalar(sc);
          g.add(b);
        }
      }
      continue;
    }
    for (let j = 0; j < 3; j++) {
      const c = new THREE.Mesh(crown, leafMats[(i + j) % 3]);
      c.position.set(x + (r() - 0.5) * 1.1 * sc, (2.2 + r() * 0.9) * sc, z + (r() - 0.5) * 0.8);
      c.scale.setScalar((0.9 + r() * 0.5) * sc);
      g.add(c);
    }
  }
  const hillMat = keep(new THREE.MeshStandardMaterial({ color: season === 'autumn' ? 0x9a9a5c : season === 'winter' ? 0x8c9a80 : 0x7c9f5c, roughness: 1 }));
  const hillGeo = keep(new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2));
  for (let i = 0; i < 5; i++) {
    const h = new THREE.Mesh(hillGeo, hillMat);
    h.scale.set(10 + r() * 6, 2 + r() * 2.5, 6);
    h.position.set(xC + (i - 2) * 11 + (r() - 0.5) * 4, -0.2, zFar - 14 - r() * 4);
    g.add(h);
  }
  return { group: g, mats: [hillMat] };
}

/**
 * Le ciel : une grande sphère vue de dedans, dégradé du haut vers l'horizon ; setColors(top, low) le repeint (l'heure,
 * la météo : ambience.js).
 */
export function skySphere(keep, r = 40) {
  const geo = keep(new THREE.SphereGeometry(r, 24, 12));
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = keep(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -1;
  m.userData.sky = true;
  const top = new THREE.Color();
  const low = new THREE.Color();
  const mid = new THREE.Color();
  const c = new THREE.Color();
  m.setColors = (t, l) => {
    top.set(t);
    low.set(l);
    mid.copy(top).lerp(low, 0.55);
    for (let i = 0; i < n; i++) {
      const y = geo.attributes.position.getY(i) / r;
      if (y > 0.18) c.copy(mid).lerp(top, Math.min(1, (y - 0.18) / 0.6));
      else c.copy(low).lerp(mid, Math.max(0, (y + 0.05) / 0.23));
      c.toArray(col, i * 3);
    }
    geo.attributes.color.needsUpdate = true;
  };
  m.setColors(0x6fa6dc, 0xe6eef2);
  return m;
}

/**
 * La lumière du dehors : le ciel (hémisphère), le soleil (ombres) de notre côté, un petit débouchage en face.
 * center : ce qu'éclaire le soleil ; span : la taille de la zone des ombres.
 */
export function outdoorLights(stage, into, { center = V(0, 0.8, 0), span = 3.5 } = {}) {
  const high = stage.high;
  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x6f8a4a, 0.95);
  hemi.userData.role = 'sky';
  into.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.5);
  sun.userData.role = 'sun';
  sun.position.set(center.x - 3.2, center.y + 6.5, center.z + 4);
  sun.target.position.copy(center);
  sun.castShadow = true;
  const sm = high ? 2048 : 1024;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 0.5, far: 20 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  into.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xd8e6ff, 0.35);
  fill.userData.role = 'fill';
  fill.position.set(center.x + 4, 3, center.z - 3);
  into.add(fill);
  return { hemi, sun, fill };
}

/** Un panneau de planches fixé à la clôture (le coin repas : la mangeoire, le filet, le râtelier y sont accrochés). */
export function plankPanel(keep, into, mats, { x, z0, z1, y0 = 0.05, y1 = 1.5, t = 0.045 }) {
  const w = z1 - z0;
  const geo = keep(new THREE.BoxGeometry(t, y1 - y0, w));
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 1.2, uv.getY(i) * (y1 - y0) / 1.2);
  const m = new THREE.Mesh(geo, mats.plank ?? mats.rail);
  m.position.set(x + t / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = true;
  m.receiveShadow = true;
  into.add(m);
  // (un chapeau en planche au-dessus, pour la pluie)
  const cap = new THREE.Mesh(keep(new THREE.BoxGeometry(0.22, 0.05, w + 0.16)), mats.post);
  cap.position.set(x - 0.06, y1 + 0.03, (z0 + z1) / 2);
  cap.rotation.z = -0.25;
  cap.castShadow = true;
  into.add(cap);
  return m;
}

/** Pierres maçonnées (soubassement, dalles) : des moellons arrondis, joints clairs. */
export function stoneTexture(base = '#a89c8a', seed = 5) {
  return canvasTex(128, 128, (c) => {
    const r = rng(seed);
    c.fillStyle = '#d8d0c2';
    c.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 21) {
      for (let x = (y / 21) % 2 ? -14 : 0; x < 128; x += 30) {
        const sh = 0.82 + r() * 0.3;
        const col = (k) => Math.round(parseInt(base.slice(k, k + 2), 16) * sh);
        c.fillStyle = `rgb(${col(1)},${col(3)},${col(5)})`;
        c.beginPath();
        c.ellipse(x + 15, y + 10, 13 + r() * 2, 8.5 + r() * 1.5, (r() - 0.5) * 0.2, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.08)';
        c.beginPath();
        c.ellipse(x + 12, y + 7, 7, 3, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
  }, { key: `stone|${base}|${seed}` });
}
