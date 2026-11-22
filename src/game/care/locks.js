// Les mèches de la laine longue et du poil long, vues de près dans la scène de soin (src/game/care/ruminant.js).
//
// Dans le jeu, la laine de l'islandais et le poil long du col noir, de la poitevine ou de la Highland sont des cartes
// (ruminantHair.js) qu'on voit de loin. En gros plan, ces cartes larges et plates, éclairées d'un seul ton, se lisaient
// en lambeaux de papier collés sur l'animal (et en pics sous le ventre du bouc). Pour le double de la scène seulement
// (le gabarit du jeu n'est pas touché) :
// - chaque carte est rétrécie (une mèche, pas une bande) et reçoit une deuxième carte en croix : vue de profil comme
//   de face, la mèche garde du volume ;
// - la mèche est ombrée en rond (plus sombre sur ses bords, comme un faisceau de brins), ses brins ressortent, ses
//   bords s'effilochent en brins séparés (la découpe mord davantage sur les bords), sa racine est dans l'ombre du poil.

import * as THREE from 'three';

const NAMES = new Set(['sheep_locks', 'goat_hair', 'cow_hair']);
// (largeur gardée : la laine de l'islandais en mèches serrées ; le poil long, en mèches fines)
const NARROW = { sheep_locks: 0.72, goat_hair: 0.7, cow_hair: 0.75 };
// (le poil de la Highland a déjà sa carte en croix, cowReal.js)
const CROSSED = new Set(['cow_hair']);
// (rangées d'une mèche refaite : une courbe, plus une ligne brisée)
const ROWS = 9;

const SHADE_F = /* glsl */ `
#ifdef USE_MAP
{
  // (en travers de la mèche : 0 au bord, 1 au milieu — un faisceau rond de brins)
  float lx = vMapUv.x * 2.0 - 1.0;
  float cyl = sqrt(max(0.0, 1.0 - lx * lx));
  float strand = sampledDiffuseColor.r;
  diffuseColor.rgb *= (0.6 + 0.4 * cyl) * (0.78 + 0.3 * strand) * (0.84 + 0.16 * vCareLock);
  // (racine dans l'ombre des mèches voisines, pointe un peu plus claire : le bout des brins prend la lumière)
  diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 0.4, vMapUv.y)) * (1.0 + 0.08 * smoothstep(0.6, 1.0, vMapUv.y));
  // (bords effilochés : la découpe mord davantage loin du milieu, les brins s'y séparent)
  diffuseColor.a *= mix(0.72, 1.0, cyl);
}
#endif
#include <alphatest_fragment>`;

/**
 * Copie de la géométrie des mèches : chaque carte (4 rangées : une ligne brisée, pliée comme du papier) est refaite en
 * ROWS rangées le long d'une courbe lisse qui passe par les mêmes points, rétrécie (k), et reçoit (sauf cross : elle
 * l'a déjà) une deuxième carte en croix, tournée d'un quart de tour autour de la mèche.
 */
export function refineLockGeometry(src, k, cross = false, minY = -Infinity) {
  const nq0 = src.userData.cards ?? src.attributes.position.count / 8;
  const per0 = src.attributes.position.count / nq0; // (sommets par carte : (SEGS + 1) × 2)
  const rows0 = per0 / 2;
  const planes = cross ? 1 : 2;
  const nq = nq0 * planes;
  const per = ROWS * 2;
  const names = Object.keys(src.attributes);
  const out = {};
  for (const nm of names) out[nm] = new src.attributes[nm].array.constructor(nq * per * src.attributes[nm].itemSize);
  const P0 = src.attributes.position.array;
  const N0 = src.attributes.normal.array;
  const cs = [];
  const hs = [];
  for (let r = 0; r < rows0; r++) {
    cs.push(new THREE.Vector3());
    hs.push(new THREE.Vector3());
  }
  const curve = new THREE.CatmullRomCurve3(cs, false, 'centripetal');
  const c = new THREE.Vector3();
  const h = new THREE.Vector3();
  const d = new THREE.Vector3();
  const x = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  for (let q = 0; q < nq0; q++) {
    const s0 = q * per0;
    for (let r = 0; r < rows0; r++) {
      A.fromArray(P0, (s0 + r * 2) * 3);
      B.fromArray(P0, (s0 + r * 2 + 1) * 3);
      cs[r].addVectors(A, B).multiplyScalar(0.5);
      hs[r].subVectors(B, A).multiplyScalar(0.5 * k);
    }
    // (minY : la mèche ne descend pas plus bas — le poil long de la chèvre s'arrête à la ligne du ventre, ses pointes
    // sombres pendaient dessous en pics)
    let low = Infinity;
    for (const p of cs) low = Math.min(low, p.y);
    if (low < minY) {
      const f = cs[0].y > minY ? Math.max(0.3, (cs[0].y - minY) / (cs[0].y - low)) : 0.3;
      for (let r = 1; r < rows0; r++) cs[r].sub(cs[0]).multiplyScalar(f).add(cs[0]);
    }
    curve.updateArcLengths();
    for (let pl = 0; pl < planes; pl++) {
      const t0 = (q * planes + pl) * per;
      for (let r = 0; r < ROWS; r++) {
        const t = r / (ROWS - 1);
        curve.getPoint(t, c);
        curve.getTangent(t, d);
        // (demi-largeur : celle des rangées d'origine, interpolée)
        const f = t * (rows0 - 1);
        const r0 = Math.min(rows0 - 2, Math.floor(f));
        h.copy(hs[r0]).lerp(hs[r0 + 1], f - r0);
        if (pl === 1) {
          x.crossVectors(h, d);
          const l = x.length();
          if (l > 1e-9) h.copy(x.multiplyScalar(h.length() * 0.85 / l));
        }
        nrm.fromArray(N0, (s0 + r0 * 2) * 3).lerp(A.fromArray(N0, (s0 + (r0 + 1) * 2) * 3), f - r0);
        for (const [j, sgn] of [[0, -1], [1, 1]]) {
          const vo = t0 + r * 2 + j;
          const vs = s0 + j; // (attributs propres à la mèche : ceux de sa racine)
          for (const nm of names) {
            const a = src.attributes[nm];
            for (let e = 0; e < a.itemSize; e++) out[nm][vo * a.itemSize + e] = a.array[vs * a.itemSize + e];
          }
          out.position[vo * 3] = c.x + h.x * sgn;
          out.position[vo * 3 + 1] = c.y + h.y * sgn;
          out.position[vo * 3 + 2] = c.z + h.z * sgn;
          out.normal[vo * 3] = nrm.x;
          out.normal[vo * 3 + 1] = nrm.y;
          out.normal[vo * 3 + 2] = nrm.z;
          out.uv[vo * 2] = j;
          out.uv[vo * 2 + 1] = t;
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  for (const nm of names) geo.setAttribute(nm, new THREE.BufferAttribute(out[nm], src.attributes[nm].itemSize, src.attributes[nm].normalized));
  const idx = new Uint32Array(nq * (ROWS - 1) * 6);
  let ii = 0;
  for (let q = 0; q < nq; q++) {
    for (let r = 0; r < ROWS - 1; r++) {
      const a = q * per + r * 2;
      idx.set([a, a + 1, a + 3, a, a + 3, a + 2], ii);
      ii += 6;
    }
  }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  geo.userData.cards = nq;
  return geo;
}

/**
 * Affine les mèches du double (s'il en a) : nouvelle géométrie (à lui, libérée avec lui) et ombrage de la matière (une
 * autre clé de programme : les mèches du jeu gardent la leur). Renvoie le nombre de maillages affinés.
 */
export function refineLocks(md) {
  let n = 0;
  md.root.traverse((o) => {
    if (!o.isMesh || !NAMES.has(o.name) || o.userData.careLocks) return;
    const src = o.geometry;
    const floor = o.name === 'goat_hair' && md.legTop ? md.legTop / (md.root.scale.x || 1) + 0.035 : -Infinity;
    const geo = refineLockGeometry(src, NARROW[o.name] ?? 0.6, CROSSED.has(o.name), floor);
    o.geometry = geo;
    o.userData.careLocks = true;
    const mat = o.material;
    const before = mat.onBeforeCompile;
    const key = mat.customProgramCacheKey;
    mat.onBeforeCompile = (sh, r) => {
      before.call(mat, sh, r);
      // (chaque mèche son ton, un peu plus clair ou plus sombre : tirée de sa racine)
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vCareLock;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCareLock = fract(sin(dot(hairTop, vec3(12.9898, 78.233, 37.719))) * 43758.5453);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vCareLock;')
        .replace('#include <alphatest_fragment>', SHADE_F);
    };
    mat.customProgramCacheKey = () => `${key.call(mat)}-care`;
    mat.needsUpdate = true;
    n++;
  });
  return n;
}
