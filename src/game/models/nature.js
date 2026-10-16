// Végétation, rochers et montagnes, dessinés en « instances » pour rester fluides sur téléphone.
// Chaque essence d'arbre existe en 2 (low) ou 3 (high) silhouettes ; les houppiers sont des
// grappes de boules fondues par des normales adoucies (pas de « boules » visibles).
// En qualité « high », les houppiers reçoivent des grappes de feuilles et tout ondule au vent.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { gfx } from '../gfx.js';
import { noise3 } from './shapes.js';
import { barkTexture, leafTexture, grassTuftTexture, flowerTexture } from '../textures.js';
import { mulberry32 } from '../../sim/rng.js';

// Couleurs du feuillage selon la saison (null = arbre sans feuilles).
const FOLIAGE = {
  deciduous: { spring: 0x74a844, summer: 0x558f36, autumn: 0xc97c2c, winter: null },
  maple: { spring: 0x7bae4a, summer: 0x538e38, autumn: 0xc8452a, winter: null },
  cherry: { spring: 0xf2b6c8, summer: 0x5e933c, autumn: 0xd0702e, winter: null },
  birch: { spring: 0x9fc65e, summer: 0x7cab48, autumn: 0xe0b33a, winter: null },
  pine: { spring: 0x336538, summer: 0x2f6034, autumn: 0x2e5c33, winter: 0x325a3a },
};

const _hsl = { h: 0, s: 0, l: 0 };
/**
 * Décale teinte / saturation / luminosité en sRGB (comme on le voit à l'écran).
 * Color.offsetHSL travaille en linéaire : un petit décalage y assombrit beaucoup trop.
 */
export function tintHSL(color, dh, ds, dl) {
  color.getHSL(_hsl, THREE.SRGBColorSpace);
  return color.setHSL(_hsl.h + dh, Math.min(1, Math.max(0, _hsl.s + ds)), Math.min(1, Math.max(0, _hsl.l + dl)), THREE.SRGBColorSpace);
}

/**
 * Ondulation au vent (shader) : déplace les sommets selon leur hauteur dans l'objet.
 * amp = amplitude (m), h = hauteur où l'amplitude est atteinte.
 * opts.fade = [près, loin] : les instances rapetissent vers le sol entre ces distances
 * de la caméra (l'herbe lointaine disparaît en douceur au lieu de scintiller).
 */
export function addWind(material, amp, h, key, noFlip = false, opts = {}) {
  const fade = opts.fade ? `
  float dcam = distance(wo, cameraPosition);
  float fade = 1.0 - smoothstep(${opts.fade[0].toFixed(1)}, ${opts.fade[1].toFixed(1)}, dcam);
  transformed.xz *= fade;
  transformed.y *= fade;` : '';
  material.onBeforeCompile = (sh) => {
    // Feuilles et brins : même éclairage des deux côtés (les normales sont déjà « vers l'extérieur »).
    // Le chunk n'est pas encore développé ici : on remplace l'include par son texte modifié.
    if (noFlip) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;'));
    }
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
  transformed.z += cos(ph * 0.83 + 1.3) * wh * wh * ${(amp * 0.6).toFixed(3)} * gWind;${fade}
}`);
  };
  material.customProgramCacheKey = () => `wind-${key}-${opts.fade ? 'fade' : ''}`;
  return material;
}

/**
 * Assombrit le bas et l'intérieur d'une forme (occlusion ambiante peinte dans les sommets),
 * avec de légères taches claires et sombres pour que le feuillage ne soit pas uniforme.
 */
function paintAO(geo, center, radius, minY, maxY, base = 0.5, mottle = 0.2) {
  const p = geo.attributes.position;
  const col = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) - center.x;
    const y = p.getY(i);
    const z = p.getZ(i) - center.z;
    const out = Math.min(1, Math.hypot(x, (y - center.y) * 0.8, z) / radius);
    const up = Math.min(1, Math.max(0, (y - minY) / (maxY - minY)));
    const m = 1 + (noise3(x * 0.9 + 5, y * 0.9, z * 0.9) - 0.5) * mottle;
    const v = (base + (1 - base) * (0.4 * out + 0.6 * up)) * m;
    col.push(v, v, v);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

/**
 * Normales adoucies : mélange de la normale de chaque face et de la direction depuis le centre
 * du volume. Les boules qui composent un houppier se fondent en une seule masse douce.
 */
function softNormals(geo, center, k = 0.6, upBias = 0.3) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) - center.x, (p.getY(i) - center.y) * 0.85 + upBias, p.getZ(i) - center.z).normalize();
    w.set(n.getX(i), n.getY(i), n.getZ(i)).multiplyScalar(1 - k).addScaledVector(v, k).normalize();
    n.setXYZ(i, w.x, w.y, w.z);
  }
  return geo;
}

/** Boule de feuillage bosselée. */
function lumpyBlob(r, x, y, z, seed, detail = 2, amp = 0.4, squash = 0.88) {
  let g = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i);
    const py = p.getY(i);
    const pz = p.getZ(i);
    const f = 1 + (noise3(px * 1.4 + seed, py * 1.4, pz * 1.4) - 0.5) * amp + (noise3(px * 4 + seed, py * 4, pz * 4) - 0.5) * amp * 0.25;
    p.setXYZ(i, px * f + x, py * f * squash + y, pz * f + z);
  }
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** Cylindre courbé (branche) de a vers b. */
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

/**
 * Tronc qui s'affine vers le haut, évasé à la base (empattement des racines), légèrement penché.
 * Part de y = -0.3 (enfoui) jusqu'à y = h.
 */
function trunkGeo(h, r0, r1, seg, lean) {
  const rings = 7;
  const g = new THREE.CylinderGeometry(1, 1, h + 0.3, seg, rings, true);
  g.translate(0, (h + 0.3) / 2 - 0.3, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = Math.min(1, Math.max(0, (y + 0.3) / (h + 0.3)));
    const flare = Math.max(0, 1 - t * 7) ** 2 * r0 * 0.45;
    const r = r1 + (r0 - r1) * (1 - t) ** 1.3 + flare;
    const a = Math.atan2(p.getZ(i), p.getX(i));
    // Contour pas tout à fait rond.
    const rr = r * (1 + (noise3(Math.cos(a) * 2 + 3, y * 0.6, Math.sin(a) * 2) - 0.5) * 0.16);
    p.setXYZ(i, Math.cos(a) * rr + lean.x * t * t, y, Math.sin(a) * rr + lean.z * t * t);
  }
  g.computeVertexNormals();
  return g;
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

/** Silhouettes des feuillus : 0 = rond, 1 = large et bas, 2 = haut et étroit. */
const SHAPES = [
  { trunk: 3.0, spread: 1.25, ring: 5, central: 1.85, tall: 1.0, top: 1.15 },
  { trunk: 2.5, spread: 1.7, ring: 6, central: 1.65, tall: 0.8, top: 0.95 },
  { trunk: 3.6, spread: 1.0, ring: 5, central: 1.5, tall: 1.35, top: 1.2 },
];

function treeGeometries(type, high, variant) {
  const rng = mulberry32(type.length * 101 + 7 + variant * 37);
  const detail = high ? 2 : 1;
  if (type === 'pine') {
    const H = [6.8, 8.2, 5.6][variant % 3];
    const R = [2.2, 1.9, 2.5][variant % 3];
    const n = [6, 7, 5][variant % 3];
    const trunk = trunkGeo(H - 0.4, 0.3, 0.05, 7, new THREE.Vector3(0, 0, 0));
    const layers = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const r = R * (1 - t * 0.8);
      const hgt = 1.9 - t * 0.5;
      const y = 1.4 + t * (H - 2.3);
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
          const f = 1 + tooth * 0.22 + (noise3(px + variant, py + i, pz) - 0.5) * 0.3;
          p.setXYZ(k, px * f, py - tooth * 0.3, pz * f);
        }
      }
      g.translate(0, y, 0);
      g.computeVertexNormals();
      layers.push(g.toNonIndexed());
    }
    const leaves = mergeGeometries(layers);
    // Teinte : bouts de branches clairs, cœur sombre.
    {
      const p = leaves.attributes.position;
      const col = [];
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        const rad = Math.hypot(x, z) / (R * (1 - ((y - 1.4) / (H - 2.3)) * 0.8) + 0.01);
        const m = 1 + (noise3(x * 1.3, y * 1.3, z * 1.3) - 0.5) * 0.2;
        const v = (0.55 + 0.5 * Math.min(1, rad)) * m;
        col.push(v, v, v);
      }
      leaves.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    }
    softNormals(leaves, new THREE.Vector3(0, H * 0.45, 0), 0.35, 0.6);
    let cards = null;
    if (high) {
      // Rameaux de sapin (cartes transparentes) autour de chaque étage.
      const quads = [];
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const r = R * (1 - t * 0.8);
        const y = 1.4 + t * (H - 2.3) - 0.6;
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

  const shape = SHAPES[variant % SHAPES.length];
  const slim = type === 'birch';
  const wide = type === 'cherry';
  const trunkH = shape.trunk * (slim ? 1.3 : wide ? 0.85 : 1);
  const spread = shape.spread * (slim ? 0.75 : wide ? 1.15 : 1);
  const central = shape.central * (slim ? 0.8 : 1);
  const lean = new THREE.Vector3((rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5);
  const parts = [trunkGeo(trunkH, slim ? 0.26 : 0.36, slim ? 0.1 : 0.13, 8, lean)];
  const top = trunkH;
  const cy = top + central * 0.55 * shape.tall;
  const blobs = [[lean.x * 0.6, cy, lean.z * 0.6, central]];
  const ringN = high ? shape.ring : shape.ring - 1;
  for (let i = 0; i < ringN; i++) {
    const a = (i / ringN) * Math.PI * 2 + rng() * 0.7;
    const d = spread * (0.8 + rng() * 0.4);
    const y = top + (0.2 + rng() * 0.9) * shape.tall + central * 0.15;
    const r = (0.95 + rng() * 0.35) * (central / 1.8);
    const end = new THREE.Vector3(Math.cos(a) * d, y, Math.sin(a) * d);
    parts.push(limb(new THREE.Vector3(lean.x * 0.7, top - 0.5 - rng() * 0.7, lean.z * 0.7), end, 0.13, 0.04, 5));
    blobs.push([end.x, end.y + r * 0.25, end.z, r]);
  }
  // Boules du sommet : le houppier monte plus qu'il ne s'étale.
  const topN = high ? 2 : 1;
  for (let i = 0; i < topN; i++) {
    const a = rng() * Math.PI * 2;
    const d = spread * 0.45;
    blobs.push([Math.cos(a) * d, cy + central * (0.55 + i * 0.35) * shape.tall, Math.sin(a) * d, shape.top * (0.85 + rng() * 0.3) * (central / 1.8)]);
  }
  const trunk = mergeGeometries(parts);
  const center = new THREE.Vector3(0, cy + central * 0.2, 0);
  const radius = spread + central * 0.9;
  const leaves = paintAO(
    mergeGeometries(blobs.map(([x, y, z, r], i) => lumpyBlob(r, x, y, z, i * 3.1 + variant * 11, detail, 0.34))),
    center, radius, top - 0.4, cy + central * 1.6 * shape.tall, 0.5, 0.22,
  );
  softNormals(leaves, center, 0.62, 0.35);
  let cards = null;
  if (high) {
    const quads = [];
    for (const [x, y, z, r] of blobs) {
      const m = Math.round(r * 12);
      for (let k = 0; k < m; k++) {
        // Points sur la surface de la boule, cartes orientées au hasard.
        const u = rng() * 2 - 1;
        const a = rng() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        const dir = new THREE.Vector3(Math.cos(a) * s, u * 0.9 + 0.15, Math.sin(a) * s).normalize();
        const q = new THREE.PlaneGeometry(1.45, 1.45);
        q.rotateZ(rng() * Math.PI);
        q.lookAt(dir);
        const pos = dir.multiplyScalar(r * (0.72 + rng() * 0.33));
        q.translate(x + pos.x, y + pos.y * 0.9, z + pos.z);
        quads.push(q);
      }
    }
    cards = mergeGeometries(quads);
    upNormals(cards, 0.5);
  }
  return { trunk, leaves, cards, cardTex: slim || wide ? 'small' : 'broad' };
}

/**
 * Forêt en instances. spots : liste de { x, y, z, s, r }.
 * Renvoie un groupe à ajouter à la scène (2 ou 3 silhouettes par essence).
 */
export function forest(type, spots, season, snowy) {
  const g = new THREE.Group();
  if (!spots.length) return g;
  const high = gfx.quality === 'high';
  const foliageColor = FOLIAGE[type][season];
  const bark = barkTexture(type === 'birch');
  bark.repeat.set(2, 3);
  const barkMat = new THREE.MeshStandardMaterial({ color: type === 'birch' ? 0xffffff : 0xf0e6dc, map: bark, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85 });
  if (high) addWind(leafMat, 0.12, 6, 'crown');
  let cardMat = null;
  const nV = high ? 3 : 2;
  const groups = Array.from({ length: nV }, () => []);
  spots.forEach((p, i) => groups[i % nV].push(p));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  const snow = new THREE.Color(0xf2f5f8);
  const autumn = season === 'autumn';
  groups.forEach((list, v) => {
    if (!list.length) return;
    const { trunk, leaves, cards, cardTex } = treeGeometries(type, high, v);
    const trunks = new THREE.InstancedMesh(trunk, barkMat, list.length);
    const crowns = foliageColor !== null ? new THREE.InstancedMesh(leaves, leafMat, list.length) : null;
    let cardMesh = null;
    if (crowns && cards) {
      cardMat = cardMat || addWind(new THREE.MeshStandardMaterial({
        color: 0xffffff, map: leafTexture(cardTex), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8,
      }), 0.16, 6, 'cards', true);
      cardMesh = new THREE.InstancedMesh(cards, cardMat, list.length);
    }
    list.forEach((p, i) => {
      q.setFromAxisAngle(up, p.r);
      const s = p.s * (0.9 + ((p.r * 13) % 0.2));
      m4.compose(new THREE.Vector3(p.x, p.y - 0.1, p.z), q, new THREE.Vector3(p.s, s, p.s));
      trunks.setMatrixAt(i, m4);
      if (crowns) {
        crowns.setMatrixAt(i, m4);
        // Chaque arbre a sa teinte : un peu plus jaune ou plus bleu, plus ou moins clair.
        const h1 = (p.r * 7.3) % 1;
        const h2 = (p.s * 9.1) % 1;
        const h3 = (p.x * 0.37 + p.z * 0.23) % 1;
        tintHSL(color.setHex(foliageColor), (h1 - 0.5) * (autumn ? 0.1 : 0.05), (h2 - 0.5) * 0.14, (Math.abs(h3) - 0.5) * 0.1);
        if (snowy) color.lerp(snow, 0.55);
        crowns.setColorAt(i, color);
        if (cardMesh) {
          cardMesh.setMatrixAt(i, m4);
          cardMesh.setColorAt(i, color.clone().multiplyScalar(1.2));
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
  });
  return g;
}

/** Rochers bosselés (deux formes), dessous aplati, un peu de mousse sur le dessus. */
export function rocks(spots, color = 0x8c8a86) {
  const g = new THREE.Group();
  if (!spots.length) return g;
  const high = gfx.quality === 'high';
  const base = new THREE.Color(color);
  const moss = new THREE.Color(0x5f7a40);
  const c = new THREE.Color();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92 });
  const make = (seed) => {
    let geo = new THREE.IcosahedronGeometry(1, 2);
    geo.deleteAttribute('normal');
    geo.deleteAttribute('uv');
    geo = mergeVertices(geo);
    const p = geo.attributes.position;
    const col = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const f = 1 + (noise3(x * 1.6 + seed, y * 1.6, z * 1.6) - 0.5) * 0.55 + (noise3(x * 4.5 + seed, y * 4.5, z * 4.5) - 0.5) * 0.18;
      p.setXYZ(i, x * f, Math.max(-0.35, y * f), z * f);
      const shadeV = 0.78 + noise3(x * 5 + 3 + seed, y * 5, z * 5) * 0.35;
      const mossy = Math.max(0, y - 0.3) * 0.9 * (noise3(x * 2.5 + seed, z * 2.5, 1) > 0.42 ? 1 : 0.15);
      c.copy(base).multiplyScalar(shadeV).lerp(moss, Math.min(1, mossy));
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  };
  const nV = 2;
  const groups = Array.from({ length: nV }, () => []);
  spots.forEach((s, i) => groups[i % nV].push(s));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  groups.forEach((list, v) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(make(v * 7.7), mat, list.length);
    list.forEach((s, i) => {
      q.setFromEuler(new THREE.Euler(s.r * 0.15, s.r * 2, 0));
      m4.compose(new THREE.Vector3(s.x, s.y - s.s * 0.18, s.z), q, new THREE.Vector3(s.s, s.s * (0.55 + (s.r % 0.25)), s.s * (0.8 + (s.r % 0.3))));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, tintHSL(c.setRGB(1, 1, 1), 0, 0, ((s.r * 5) % 0.16) - 0.08));
    });
    im.castShadow = high;
    im.receiveShadow = true;
    g.add(im);
  });
  return g;
}

/**
 * Buissons (grappes de boules fondues) : le long des bâtiments et au pied des arbres.
 * spots : { x, y, z, s, r } ; color : couleur du feuillage.
 */
export function bushes(spots, color = 0x4f8a34, snowy = false) {
  const g = new THREE.Group();
  if (!spots.length) return g;
  const high = gfx.quality === 'high';
  const detail = high ? 2 : 1;
  const blobs = [[0, 0.45, 0, 0.62], [0.42, 0.34, 0.14, 0.46], [-0.36, 0.3, -0.22, 0.44], [0.08, 0.3, -0.42, 0.4], [-0.2, 0.32, 0.38, 0.38]].slice(0, high ? 5 : 3);
  const geo = paintAO(
    mergeGeometries(blobs.map(([x, y, z, r], i) => lumpyBlob(r, x, y, z, i * 2.3 + 40, detail, 0.3, 0.8))),
    new THREE.Vector3(0, 0.35, 0), 1.0, -0.1, 1.0, 0.5, 0.25,
  );
  softNormals(geo, new THREE.Vector3(0, 0.3, 0), 0.65, 0.45);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9 });
  if (high) addWind(mat, 0.03, 1, 'bush');
  const im = new THREE.InstancedMesh(geo, mat, spots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  const snow = new THREE.Color(0xf2f5f8);
  spots.forEach((p, i) => {
    q.setFromAxisAngle(up, p.r);
    m4.compose(new THREE.Vector3(p.x, p.y - 0.08, p.z), q, new THREE.Vector3(p.s * (0.85 + (p.r % 0.3)), p.s * (0.8 + ((p.r * 3) % 0.4)), p.s * (0.85 + ((p.r * 5) % 0.3))));
    im.setMatrixAt(i, m4);
    tintHSL(c.setHex(color), ((p.r * 7) % 0.06) - 0.03, ((p.r * 11) % 0.2) - 0.1, ((p.r * 13) % 0.14) - 0.07);
    if (snowy) c.lerp(snow, 0.5);
    im.setColorAt(i, c);
  });
  im.castShadow = high;
  im.receiveShadow = true;
  g.add(im);
  return g;
}

/**
 * Touffes d'herbe (cartes croisées avec une texture de brins, ondulant au vent, qui
 * s'effacent au loin) et fleurs (petites cartes à plat).
 */
export function groundCover(spots, grassColor, flowerColors) {
  const g = new THREE.Group();
  if (!spots.length) return g;
  const high = gfx.quality === 'high';
  const nq = 2;
  const quads = [];
  for (let k = 0; k < nq; k++) {
    const b = new THREE.PlaneGeometry(high ? 0.38 : 0.34, high ? 0.36 : 0.3);
    b.translate(0, (high ? 0.36 : 0.3) / 2 - 0.01, 0);
    b.rotateY((k / nq) * Math.PI + 0.2);
    quads.push(b);
  }
  const tuft = mergeGeometries(quads);
  // Normales vers le haut : l'herbe s'éclaire comme le sol, sans faces noires.
  const n = tuft.attributes.normal;
  for (let k = 0; k < n.count; k++) n.setXYZ(k, 0, 1, 0);
  const grassMat = new THREE.MeshStandardMaterial({
    color: grassColor, map: grassTuftTexture(), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.9,
  });
  addWind(grassMat, 0.05, 0.4, 'grass', true, { fade: high ? [32, 65] : [24, 50] });
  const grass = new THREE.InstancedMesh(tuft, grassMat, spots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const shown = [];
  spots.forEach((p, i) => {
    q.setFromAxisAngle(up, p.r * 6);
    const sy = p.s * (0.75 + (p.r % 0.5));
    m4.compose(new THREE.Vector3(p.x, p.y - 0.02, p.z), q, new THREE.Vector3(p.s, sy, p.s));
    grass.setMatrixAt(i, m4);
    // Touffes plus ou moins claires, quelques-unes jaunies.
    const dry = (p.r * 100) % 1 < 0.14;
    c.setHSL(0.25 + ((p.r * 5) % 0.05) - 0.025 + (dry ? -0.09 : 0), dry ? 0.35 : 0.12, 0.92 + ((p.r * 11) % 0.14) - 0.09, THREE.SRGBColorSpace);
    grass.setColorAt(i, c);
    if (flowerColors.length && (p.r * 37) % 1 < 0.22) shown.push(p);
  });
  g.add(grass);
  if (shown.length) {
    const flowerGeo = new THREE.PlaneGeometry(0.16, 0.16);
    flowerGeo.rotateX(-Math.PI / 2);
    flowerGeo.translate(0, 0.2, 0);
    const flowerMat = addWind(new THREE.MeshStandardMaterial({
      color: 0xffffff, map: flowerTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7,
    }), 0.05, 0.3, 'flower', true, { fade: high ? [30, 60] : [20, 40] });
    const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, shown.length);
    shown.forEach((p, i) => {
      q.setFromAxisAngle(up, p.r * 6);
      m4.compose(new THREE.Vector3(p.x + 0.1, p.y - 0.02, p.z + 0.05), q, new THREE.Vector3(p.s, p.s * (0.75 + (p.r % 0.5)), p.s));
      flowers.setMatrixAt(i, m4);
      flowers.setColorAt(i, c.setHex(flowerColors[Math.floor((p.r * 53) % 1 * flowerColors.length)]));
    });
    g.add(flowers);
  }
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
  const base = snowLine ? 18 : -4;
  const peak = snowLine ? 95 : 55;
  for (let j = 0; j <= segR; j++) {
    const t = j / segR;
    const r = r0 + (r1 - r0) * t * t;
    for (let i = 0; i <= segA; i++) {
      const a = (i / segA) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const env = Math.min(1, t * 2.2) * (1 - Math.max(0, t - 0.75) * 2.5);
      const h = base + ridged(x, z) * peak * env * (0.55 + noise3(x * 0.004, z * 0.004, seed) * 0.8);
      pos.push(x, h, z);
      const rel = (h - base) / peak;
      c.copy(grassC).lerp(forestC, Math.min(1, rel * 3) * 0.6).lerp(rock, Math.min(1, Math.max(0, (rel - 0.18) * 3)));
      if (snowLine) c.lerp(snowC, Math.min(1, Math.max(0, (rel - 0.34) * 4)));
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
    if (steep > 0.35) {
      c.setRGB(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]).lerp(rock, Math.min(0.7, (steep - 0.35) * 1.6));
      geo.attributes.color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  void count;
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
}
