// Arbres, rochers et buissons issus des modèles GLB (pack « Ultimate Nature » de Quaternius, CC0),
// posés en instances comme la version procédurale (nature.js). Même signature que forest()/rocks().

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { gfx } from '../gfx.js';
import { getModel, hasModel } from '../assets.js';
import { addWind, FOLIAGE } from './nature.js';

// Hauteur (m) donnée à chaque modèle avant l'échelle du spot (0,8 à 1,5).
const HEIGHT = { tree_common: 7, tree_common2: 8, tree_birch: 8.5, tree_pine: 8, rock_a: 1.1, rock_b: 0.9, rock_moss: 1.0, bush: 1.1 };
const LEAF_NAMES = /green|leaf|leaves|needle/i;
const cache = new Map();

/**
 * Fusionne les maillages d'un GLB en deux géométries : feuillage et reste (tronc, pierre…),
 * normalisées à HEIGHT[key] de haut, posées sur y = 0.
 */
function parts(key) {
  if (cache.has(key)) return cache.get(key);
  const gltf = getModel(key);
  if (!gltf) return null;
  const scene = gltf.scene;
  scene.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(scene);
  const h = box.max.y - box.min.y;
  const s = (HEIGHT[key] ?? 1) / h;
  const norm = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
  const leaf = { geos: [], mats: [] };
  const rest = { geos: [], mats: [] };
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    // Les GLB sont quantifiés (positions en entiers normalisés) : on repasse en flottants avant de transformer,
    // sinon applyMatrix4 écrase les valeurs hors de [-1, 1].
    const geo = new THREE.BufferGeometry();
    geo.setIndex(o.geometry.index);
    for (const k of ['position', 'normal']) {
      const a = o.geometry.attributes[k];
      if (!a) continue;
      const f = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) {
        f[i * 3] = a.getX(i);
        f[i * 3 + 1] = a.getY(i);
        f[i * 3 + 2] = a.getZ(i);
      }
      geo.setAttribute(k, new THREE.BufferAttribute(f, 3));
    }
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(norm, o.matrixWorld));
    geo.clearGroups();
    // Un maillage multi-matériaux a déjà été séparé par primitive par GLTFLoader : un seul matériau ici.
    const m = mats[0];
    const dst = LEAF_NAMES.test(m.name) ? leaf : rest;
    dst.geos.push(geo);
    dst.mats.push(m);
  });
  const merge = (p) => (p.geos.length ? { geo: mergeGeometries(p.geos, true), mats: p.mats } : null);
  const out = { leaf: merge(leaf), rest: merge(rest), height: HEIGHT[key] ?? 1 };
  cache.set(key, out);
  return out;
}

function stdMat(src, color, roughness = 0.9) {
  return new THREE.MeshStandardMaterial({ color: color ?? src.color, roughness, metalness: 0, name: src.name });
}

function instancesFor(spots, geo, materials, { yOffset = 0, tilt = false, squash = null } = {}) {
  const im = new THREE.InstancedMesh(geo, materials, spots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  spots.forEach((p, i) => {
    e.set(tilt ? (p.r % 0.3) - 0.15 : 0, p.r, 0);
    q.setFromEuler(e);
    const sy = p.s * (0.9 + ((p.r * 13) % 0.2));
    m4.compose(new THREE.Vector3(p.x, p.y + yOffset * p.s, p.z), q, squash ? squash(p) : new THREE.Vector3(p.s, sy, p.s));
    im.setMatrixAt(i, m4);
  });
  im.castShadow = true;
  im.receiveShadow = true;
  return im;
}

/** Vrai si les modèles nécessaires à gltfForest sont chargés. */
export const hasGltfTrees = () => hasModel('tree_common') && hasModel('tree_pine') && hasModel('tree_birch');

/**
 * Forêt en instances à partir des GLB. type : deciduous | maple | cherry | birch | pine.
 * Les feuillus alternent deux silhouettes ; la couleur suit la saison (FOLIAGE) avec de petites variations.
 */
export function gltfForest(type, spots, season, snowy) {
  const g = new THREE.Group();
  if (!spots.length) return g;
  const high = gfx.quality === 'high';
  const keys = type === 'pine' ? ['tree_pine'] : type === 'birch' ? ['tree_birch'] : ['tree_common', 'tree_common2'];
  const foliage = FOLIAGE[type]?.[season] ?? FOLIAGE.deciduous[season];
  const snow = new THREE.Color(0xf2f5f8);
  const color = new THREE.Color();
  keys.forEach((key, ki) => {
    const p = parts(key);
    if (!p) return;
    const mine = spots.filter((_, i) => i % keys.length === ki);
    if (!mine.length) return;
    if (p.rest) {
      const im = instancesFor(mine, p.rest.geo, p.rest.mats.map((m) => stdMat(m)), { yOffset: -0.05 });
      g.add(im);
    }
    if (p.leaf && foliage !== null) {
      const leafMat = stdMat(p.leaf.mats[0], 0xffffff, 0.85);
      if (high) addWind(leafMat, 0.1, 6, `gltf-${key}`);
      const im = instancesFor(mine, p.leaf.geo, leafMat, { yOffset: -0.05 });
      mine.forEach((s, i) => {
        color.setHex(foliage).offsetHSL((s.r % 0.1) - 0.05, ((s.r * 7) % 0.1) - 0.05, ((s.s * 7) % 0.12) - 0.06);
        if (snowy) color.lerp(snow, 0.55);
        im.setColorAt(i, color);
      });
      g.add(im);
    }
  });
  return g;
}

/** Rochers GLB (trois formes), teintés selon le lieu comme rocks(). */
export function gltfRocks(spots, tint = 0x8c8a86) {
  const g = new THREE.Group();
  const keys = ['rock_a', 'rock_b', 'rock_moss'];
  const base = new THREE.Color(tint);
  const color = new THREE.Color();
  keys.forEach((key, ki) => {
    const p = parts(key);
    if (!p?.rest) return;
    const mine = spots.filter((_, i) => i % keys.length === ki);
    if (!mine.length) return;
    const mats = p.rest.mats.map((m) => (LEAF_NAMES.test(m.name) ? stdMat(m) : stdMat(m, 0xffffff, 0.92)));
    const im = instancesFor(mine, p.rest.geo, mats, { tilt: true, yOffset: -0.08, squash: (s) => new THREE.Vector3(s.s * 1.6, s.s * 1.1, s.s * 1.5) });
    mine.forEach((s, i) => {
      color.copy(base).multiplyScalar(0.85 + ((s.r * 5) % 0.3));
      im.setColorAt(i, color);
    });
    g.add(im);
  });
  return g;
}

/** Buissons GLB. */
export function gltfBushes(spots, season) {
  const g = new THREE.Group();
  const p = parts('bush');
  if (!p?.rest || !spots.length) return g;
  const mat = stdMat(p.rest.mats[0], FOLIAGE.deciduous[season] ?? 0x4f8a32, 0.9);
  const im = instancesFor(spots, p.rest.geo, p.rest.mats.map(() => mat), { yOffset: -0.05 });
  g.add(im);
  return g;
}
