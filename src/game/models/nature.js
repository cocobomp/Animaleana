// Végétation, rochers et montagnes, dessinés en « instances » pour rester fluides sur téléphone.
// En qualité « high », les houppiers reçoivent des grappes de feuilles et tout ondule au vent.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { gfx } from '../gfx.js';
import { noise3 } from './shapes.js';
import { barkTexture, leafTexture } from '../textures.js';
import { mulberry32 } from '../../sim/rng.js';

// Couleurs du feuillage selon la saison (null = arbre sans feuilles).
const FOLIAGE = {
  deciduous: { spring: 0x6fa13d, summer: 0x4f8a32, autumn: 0xc77a2a, winter: null },
  maple: { spring: 0x76a845, summer: 0x4d8a34, autumn: 0xc8422a, winter: null },
  cherry: { spring: 0xf2b6c8, summer: 0x5a8f38, autumn: 0xd0702e, winter: null },
  birch: { spring: 0x9cc25a, summer: 0x77a845, autumn: 0xe0b33a, winter: null },
  pine: { spring: 0x2f5e34, summer: 0x2c5a31, autumn: 0x2c5631, winter: 0x2f5536 },
};

/**
 * Ondulation au vent (shader) : déplace les sommets selon leur hauteur dans l'objet.
 * amp = amplitude (m), h = hauteur où l'amplitude est atteinte.
 */
export function addWind(material, amp, h, key, noFlip = false) {
  material.onBeforeCompile = (sh) => {
    // Feuilles et brins : même éclairage des deux côtés (les normales sont déjà « vers l'extérieur »).
    if (noFlip) sh.fragmentShader = sh.fragmentShader.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;');
    sh.uniforms.gTime = gfx.time;
    sh.uniforms.gWind = gfx.wind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float gTime;
uniform float gWind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 wo = vec3(0.0);
  #ifdef USE_INSTANCING
    wo = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #endif
  float wh = clamp(position.y / ${h.toFixed(3)}, 0.0, 1.5);
  float ph = gTime * 1.7 + wo.x * 0.23 + wo.z * 0.19;
  float sway = sin(ph) * 0.65 + sin(ph * 2.7 + wo.z) * 0.25 + sin(ph * 5.3 + position.x * 3.0) * 0.1;
  transformed.x += sway * wh * wh * ${amp.toFixed(3)} * gWind;
  transformed.z += cos(ph * 0.83 + 1.3) * wh * wh * ${(amp * 0.6).toFixed(3)} * gWind;
}`);
  };
  material.customProgramCacheKey = () => `wind-${key}`;
  return material;
}

/** Assombrit le bas et l'intérieur d'une forme (occlusion ambiante peinte dans les sommets). */
function paintAO(geo, center, radius, minY, maxY, base = 0.45) {
  const p = geo.attributes.position;
  const col = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) - center.x;
    const y = p.getY(i);
    const z = p.getZ(i) - center.z;
    const out = Math.min(1, Math.hypot(x, (y - center.y) * 0.8, z) / radius);
    const up = Math.min(1, Math.max(0, (y - minY) / (maxY - minY)));
    const v = (base + (1 - base) * (0.35 * out + 0.65 * up)) * 0.8;
    col.push(v, v, v);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

/** Boule de feuillage bosselée. */
function lumpyBlob(r, x, y, z, seed, detail = 2) {
  let g = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i);
    const py = p.getY(i);
    const pz = p.getZ(i);
    const f = 1 + (noise3(px * 1.6 + seed, py * 1.6, pz * 1.6) - 0.5) * 0.55;
    p.setXYZ(i, px * f + x, py * f * 0.9 + y, pz * f + z);
  }
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** Cylindre courbé (tronc, branche) de a vers b. */
function limb(a, b, r0, r1, seg = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 3, true);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

function treeGeometries(type, high) {
  const rng = mulberry32(type.length * 101 + 7);
  if (type === 'pine') {
    const trunk = limb(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, 6.5, 0), 0.3, 0.06, 8);
    const layers = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const r = 2.3 * (1 - t * 0.78);
      const hgt = 2.0 - t * 0.6;
      const y = 1.5 + t * 4.6;
      const seg = 11;
      const g = new THREE.ConeGeometry(r, hgt, seg, 2, true);
      // Bord dentelé : les branches retombent.
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const px = p.getX(k);
        const py = p.getY(k);
        const pz = p.getZ(k);
        if (py < -hgt * 0.4) {
          const a = Math.atan2(pz, px);
          const tooth = Math.sin(a * seg * 0.5 + i) * 0.5 + 0.5;
          const f = 1 + tooth * 0.25 + (noise3(px, py + i, pz) - 0.5) * 0.3;
          p.setXYZ(k, px * f, py - tooth * 0.35, pz * f);
        }
      }
      g.translate(0, y, 0);
      g.computeVertexNormals();
      layers.push(g);
    }
    const leaves = paintAO(mergeGeometries(layers.map((g) => g.toNonIndexed())), new THREE.Vector3(0, 3.5, 0), 2.3, 0.6, 7.2, 0.4);
    let cards = null;
    if (high) {
      // Rameaux de sapin (cartes transparentes) autour de chaque étage.
      const quads = [];
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const r = 2.3 * (1 - t * 0.78);
        const y = 1.5 + t * 4.6 - 0.6;
        const m = 9 - Math.round(t * 4);
        for (let k = 0; k < m; k++) {
          const a = (k / m) * Math.PI * 2 + rng() * 0.4;
          const q = new THREE.PlaneGeometry(1.1 * (1 - t * 0.4), r * 0.95);
          q.translate(0, r * 0.47, 0);
          q.rotateX(Math.PI / 2 - 0.45); // la carte part du tronc et retombe
          q.rotateY(-a + Math.PI / 2);
          q.translate(Math.cos(a) * 0.15, y + 0.5, Math.sin(a) * 0.15);
          quads.push(q);
        }
      }
      cards = mergeGeometries(quads);
      upNormals(cards, 0.6);
    }
    return { trunk, leaves, cards, cardTex: 'needle' };
  }

  const tall = type === 'birch' ? 1.35 : 1;
  const parts = [limb(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0.1, 3.0 * tall, 0.05), 0.34, 0.2, 8)];
  const top = 3.0 * tall;
  const blobs = [[0, top + 1.1, 0, 1.75]];
  const nb = type === 'cherry' ? 5 : 4;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + rng() * 0.8;
    const d = 1.1 + rng() * 0.5;
    const end = new THREE.Vector3(Math.cos(a) * d, top + 0.6 + rng() * 1.1, Math.sin(a) * d);
    parts.push(limb(new THREE.Vector3(0.08, top - 0.6 - rng() * 0.6, 0.04), end, 0.15, 0.05, 5));
    blobs.push([end.x, end.y + 0.25, end.z, 1.05 + rng() * 0.35]);
  }
  const trunk = mergeGeometries(parts);
  const leaves = paintAO(mergeGeometries(blobs.map(([x, y, z, r], i) => lumpyBlob(r, x, y, z, i * 3.1, high ? 2 : 1))),
    new THREE.Vector3(0, top + 1, 0), 2.6, top - 0.6, top + 3, 0.4);
  let cards = null;
  if (high) {
    const quads = [];
    for (const [x, y, z, r] of blobs) {
      const m = Math.round(r * 24);
      for (let k = 0; k < m; k++) {
        // Points sur la surface de la boule, cartes orientées au hasard.
        const u = rng() * 2 - 1;
        const a = rng() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        const dir = new THREE.Vector3(Math.cos(a) * s, u * 0.9 + 0.1, Math.sin(a) * s).normalize();
        const q = new THREE.PlaneGeometry(1.5, 1.5);
        q.rotateZ(rng() * Math.PI);
        q.lookAt(dir);
        const pos = dir.multiplyScalar(r * (0.72 + rng() * 0.38));
        q.translate(x + pos.x, y + pos.y * 0.9, z + pos.z);
        quads.push(q);
      }
    }
    cards = mergeGeometries(quads);
    upNormals(cards, 0.45);
  }
  return { trunk, leaves, cards, cardTex: type === 'birch' || type === 'cherry' ? 'small' : 'broad' };
}

/** Normales « vers l'extérieur et le haut » : les cartes de feuilles s'éclairent comme un volume. */
function upNormals(geo, upw) {
  geo.computeBoundingBox();
  const c = new THREE.Vector3();
  geo.boundingBox.getCenter(c);
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) - c.x, (p.getY(i) - c.y) * 0.5 + upw, p.getZ(i) - c.z).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
}

/**
 * Forêt en instances. spots : liste de { x, y, z, s, r }.
 * Renvoie un groupe à ajouter à la scène.
 */
export function forest(type, spots, season, snowy) {
  const g = new THREE.Group();
  if (!spots.length) return g;
  const high = gfx.quality === 'high';
  const { trunk, leaves, cards, cardTex } = treeGeometries(type, high);
  const bark = barkTexture(type === 'birch');
  bark.repeat.set(2, 3);
  const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0xffffff, map: bark, roughness: 0.95 }), spots.length);
  const foliageColor = FOLIAGE[type][season];
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85 });
  if (high) addWind(leafMat, 0.12, 6, 'crown');
  const crowns = foliageColor !== null ? new THREE.InstancedMesh(leaves, leafMat, spots.length) : null;
  let cardMesh = null;
  if (crowns && cards) {
    const cm = new THREE.MeshStandardMaterial({
      color: 0xffffff, map: leafTexture(cardTex), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8,
    });
    addWind(cm, 0.16, 6, 'cards', true);
    cardMesh = new THREE.InstancedMesh(cards, cm, spots.length);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  const snow = new THREE.Color(0xf2f5f8);
  spots.forEach((p, i) => {
    q.setFromAxisAngle(up, p.r);
    const s = p.s * (0.9 + ((p.r * 13) % 0.2));
    m4.compose(new THREE.Vector3(p.x, p.y - 0.1, p.z), q, new THREE.Vector3(p.s, s, p.s));
    trunks.setMatrixAt(i, m4);
    if (crowns) {
      crowns.setMatrixAt(i, m4);
      color.setHex(foliageColor).offsetHSL((p.r % 0.1) - 0.05, ((p.r * 7) % 0.1) - 0.05, ((p.s * 7) % 0.12) - 0.06);
      if (snowy) color.lerp(snow, 0.55);
      crowns.setColorAt(i, color);
      if (cardMesh) {
        cardMesh.setMatrixAt(i, m4);
        cardMesh.setColorAt(i, color.clone().multiplyScalar(1.15));
      }
    }
  });
  trunks.castShadow = true;
  trunks.receiveShadow = true;
  g.add(trunks);
  if (crowns) {
    crowns.castShadow = true;
    crowns.receiveShadow = true;
    g.add(crowns);
  }
  if (cardMesh) {
    cardMesh.castShadow = true;
    cardMesh.receiveShadow = true;
    g.add(cardMesh);
  }
  return g;
}

/** Rochers bosselés, avec un peu de mousse sur le dessus. */
export function rocks(spots, color = 0x8c8a86) {
  const high = gfx.quality === 'high';
  let geo = new THREE.IcosahedronGeometry(1, high ? 3 : 2);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const p = geo.attributes.position;
  const col = [];
  const base = new THREE.Color(color);
  const moss = new THREE.Color(0x5f7040);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const f = 1 + (noise3(x * 1.8, y * 1.8, z * 1.8) - 0.5) * 0.5 + (noise3(x * 5, y * 5, z * 5) - 0.5) * 0.15;
    p.setXYZ(i, x * f, Math.max(-0.3, y * f), z * f);
    const shadeV = 0.75 + noise3(x * 6 + 3, y * 6, z * 6) * 0.4;
    c.copy(base).multiplyScalar(shadeV).lerp(moss, Math.max(0, y - 0.35) * 0.9 * (noise3(x * 3, z * 3, 1) > 0.45 ? 1 : 0.2));
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92 }), spots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spots.forEach((s, i) => {
    q.setFromEuler(new THREE.Euler(s.r * 0.2, s.r * 2, 0));
    m4.compose(new THREE.Vector3(s.x, s.y - s.s * 0.15, s.z), q, new THREE.Vector3(s.s, s.s * 0.62, s.s * 0.9));
    im.setMatrixAt(i, m4);
  });
  im.castShadow = true;
  im.receiveShadow = true;
  return im;
}

/** Touffes d'herbe (brins courbés, ondulant au vent) et fleurs. */
export function groundCover(spots, grassColor, flowerColors) {
  const g = new THREE.Group();
  const high = gfx.quality === 'high';
  const rng = mulberry32(17);
  const blades = [];
  const nBlades = high ? 7 : 5;
  for (let i = 0; i < nBlades; i++) {
    const h = 0.22 + rng() * 0.26;
    const w = 0.022 + rng() * 0.012;
    const segs = high ? 3 : 2;
    const b = new THREE.PlaneGeometry(w, h, 1, segs);
    b.translate(0, h / 2, 0);
    const p = b.attributes.position;
    const bend = (rng() - 0.3) * 0.12;
    for (let k = 0; k < p.count; k++) {
      const t = p.getY(k) / h;
      p.setX(k, p.getX(k) * (1 - t * 0.85));
      p.setZ(k, bend * t * t);
    }
    const col = [];
    for (let k = 0; k < p.count; k++) {
      const t = p.getY(k) / h;
      const v = 0.62 + 0.55 * t;
      col.push(v, v, v * 0.95);
    }
    b.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    b.rotateY(rng() * Math.PI);
    b.translate((rng() - 0.5) * 0.12, 0, (rng() - 0.5) * 0.12);
    blades.push(b);
  }
  const tuft = mergeGeometries(blades);
  // Normales vers le haut : l'herbe s'éclaire comme le sol, sans faces noires.
  const n = tuft.attributes.normal;
  for (let k = 0; k < n.count; k++) n.setXYZ(k, 0, 1, 0);
  const grassMat = new THREE.MeshStandardMaterial({ color: grassColor, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  addWind(grassMat, 0.06, 0.45, 'grass', true);
  const grass = new THREE.InstancedMesh(tuft, grassMat, spots.length);
  const flowerGeo = new THREE.IcosahedronGeometry(0.05, 0);
  flowerGeo.scale(1, 0.5, 1);
  flowerGeo.translate(0, 0.3, 0);
  const flowers = flowerColors.length ? new THREE.InstancedMesh(flowerGeo, addWind(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), 0.05, 0.3, 'flower'), spots.length) : null;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  spots.forEach((p, i) => {
    q.setFromAxisAngle(up, p.r * 6);
    m4.compose(new THREE.Vector3(p.x, p.y - 0.02, p.z), q, new THREE.Vector3(p.s, p.s * (0.8 + (p.r % 0.4)), p.s));
    grass.setMatrixAt(i, m4);
    grass.setColorAt(i, c.setRGB(1, 1, 1).offsetHSL(((p.r * 5) % 0.06) - 0.03, 0, ((p.r * 11) % 0.16) - 0.08));
    if (flowers) {
      const show = (p.r * 100) % 1 < 0.3;
      const sc = show ? 1 : 0;
      m4.compose(new THREE.Vector3(p.x + 0.08, p.y, p.z), q, new THREE.Vector3(sc, sc, sc));
      flowers.setMatrixAt(i, m4);
      flowers.setColorAt(i, c.setHex(flowerColors[i % flowerColors.length]));
    }
  });
  grass.receiveShadow = true;
  g.add(grass);
  if (flowers) g.add(flowers);
  return g;
}

/**
 * Chaîne de montagnes au loin : un anneau de relief (bruit « en crêtes »),
 * coloré selon l'altitude et la pente (herbe, roche, neige).
 */
export function mountainRing(count, radius, snowLine, color = 0x6f6a66, rng = Math.random) {
  const high = gfx.quality === 'high';
  const seed = rng() * 100;
  const segA = high ? 220 : 120;
  const segR = high ? 28 : 16;
  const r0 = radius - 30;
  const r1 = radius + 320;
  const pos = [];
  const col = [];
  const rock = new THREE.Color(color);
  const grassC = new THREE.Color(snowLine ? 0x56703e : 0x5c7a48);
  const forestC = new THREE.Color(0x3a5232);
  const snowC = new THREE.Color(0xf4f7fa);
  const c = new THREE.Color();
  const ridged = (x, z) => {
    let h = 0;
    let amp = 1;
    let f = 0.006;
    for (let o = 0; o < 4; o++) {
      const n = 1 - Math.abs(noise3(x * f + seed, z * f, o * 7.3) * 2 - 1);
      h += n * n * amp;
      amp *= 0.5;
      f *= 2.1;
    }
    return h;
  };
  const base = snowLine ? 22 : -4;
  const peak = snowLine ? 120 : 55;
  for (let j = 0; j <= segR; j++) {
    const t = j / segR;
    const r = r0 + (r1 - r0) * t * t;
    for (let i = 0; i <= segA; i++) {
      const a = (i / segA) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const env = Math.min(1, t * 3.2) * (1 - Math.max(0, t - 0.75) * 2.5);
      const h = base + ridged(x, z) * peak * env * (0.55 + noise3(x * 0.004, z * 0.004, seed) * 0.8);
      pos.push(x, h, z);
      const rel = (h - base) / peak;
      c.copy(grassC).lerp(forestC, Math.min(1, rel * 3) * 0.6).lerp(rock, Math.min(1, Math.max(0, (rel - 0.18) * 3)));
      if (snowLine) c.lerp(snowC, Math.min(1, Math.max(0, (rel - 0.45) * 4)));
      col.push(c.r, c.g, c.b);
    }
  }
  const idx = [];
  const W = segA + 1;
  for (let j = 0; j < segR; j++) {
    for (let i = 0; i < segA; i++) {
      const a = j * W + i;
      idx.push(a, a + 1, a + W, a + 1, a + W + 1, a + W);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Les pentes raides deviennent rocheuses (après calcul des normales).
  const nrm = geo.attributes.normal;
  for (let i = 0; i < nrm.count; i++) {
    const steep = 1 - nrm.getY(i);
    if (steep > 0.25) {
      c.setRGB(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]).lerp(rock, Math.min(1, (steep - 0.25) * 2.5));
      geo.attributes.color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  void count;
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
}
