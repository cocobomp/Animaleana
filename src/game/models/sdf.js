// Sculpture par champs de distance (SDF) : des formes simples (ellipsoïdes, cônes arrondis)
// fondues entre elles avec un « minimum doux », puis transformées en maillage lisse
// (algorithme « surface nets »). Sert au corps et à la tête des animaux : pas de couture
// entre poitrail, épaules, cuisses et encolure.

import * as THREE from 'three';

// ------------------------------------------------------------------ primitives

/** Ellipsoïde (approximation d'Inigo Quilez). */
export function ellipsoid(c, r) {
  const [cx, cy, cz] = c;
  const [rx, ry, rz] = r;
  return (x, y, z) => {
    const px = (x - cx) / rx;
    const py = (y - cy) / ry;
    const pz = (z - cz) / rz;
    const k0 = Math.sqrt(px * px + py * py + pz * pz);
    const qx = px / rx;
    const qy = py / ry;
    const qz = pz / rz;
    const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
    return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
  };
}

/** Cône arrondi entre a (rayon ra) et b (rayon rb) ; sx aplatit la largeur (axe x). */
export function roundCone(a, b, ra, rb, sx = 1) {
  const [ax, ay, az] = a;
  const bax = (b[0] - ax) / sx;
  const bay = b[1] - ay;
  const baz = b[2] - az;
  const l2 = Math.max(1e-8, bax * bax + bay * bay + baz * baz);
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const k = Math.min(1, sx);
  return (x, y, z) => {
    const px = (x - ax) / sx;
    const py = y - ay;
    const pz = z - az;
    const yv = px * bax + py * bay + pz * baz;
    const zv = yv - l2;
    const qx = px * l2 - bax * yv;
    const qy = py * l2 - bay * yv;
    const qz = pz * l2 - baz * yv;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yv * yv * l2;
    const z2 = zv * zv * l2;
    const kk = Math.sign(rr) * rr * rr * x2;
    let d;
    if (Math.sign(zv) * a2 * z2 > kk) d = Math.sqrt(x2 + z2) * il2 - rb;
    else if (Math.sign(yv) * a2 * y2 < kk) d = Math.sqrt(x2 + y2) * il2 - ra;
    else d = (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - ra;
    return d * k;
  };
}

/** Minimum doux (polynomial) : fond deux formes avec un congé de taille k. */
export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Union douce d'une liste de [fonction, k]. */
export function blend(list) {
  return (x, y, z) => {
    let d = list[0][0](x, y, z);
    for (let i = 1; i < list.length; i++) {
      const [f, k] = list[i];
      d = k > 0 ? smin(d, f(x, y, z), k) : Math.min(d, f(x, y, z));
    }
    return d;
  };
}

// ------------------------------------------------------------------ maillage

/**
 * Maillage d'une SDF par « surface nets ».
 * bounds : [[minx, miny, minz], [maxx, maxy, maxz]], cell : taille d'une case.
 * uv(x, y, z) → [u, v] ; displace(x, y, z, nx, ny, nz) → décalage le long de la normale.
 */
export function sdfMesh(sdf, bounds, cell, { uv = null, displace = null } = {}) {
  const [mn, mx] = bounds;
  const nx = Math.ceil((mx[0] - mn[0]) / cell) + 2;
  const ny = Math.ceil((mx[1] - mn[1]) / cell) + 2;
  const nz = Math.ceil((mx[2] - mn[2]) / cell) + 2;
  const ox = mn[0] - cell * 0.5;
  const oy = mn[1] - cell * 0.5;
  const oz = mn[2] - cell * 0.5;
  const field = new Float32Array(nx * ny * nz);
  const idx = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) {
    const z = oz + k * cell;
    for (let j = 0; j < ny; j++) {
      const y = oy + j * cell;
      for (let i = 0; i < nx; i++) field[idx(i, j, k)] = sdf(ox + i * cell, y, z);
    }
  }

  // Un sommet par case traversée par la surface (moyenne des points de croisement des arêtes).
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const val = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const [a, b, d] = corners[c];
          val[c] = field[idx(i + a, j + b, k + d)];
          if (val[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [e0, e1] of edges) {
          const v0 = val[e0];
          const v1 = val[e1];
          if ((v0 < 0) === (v1 < 0)) continue;
          const t = v0 / (v0 - v1);
          const c0 = corners[e0];
          const c1 = corners[e1];
          sx += c0[0] + (c1[0] - c0[0]) * t;
          sy += c0[1] + (c1[1] - c0[1]) * t;
          sz += c0[2] + (c1[2] - c0[2]) * t;
          n++;
        }
        cellVert[idx(i, j, k)] = pos.length / 3;
        pos.push(ox + (i + sx / n) * cell, oy + (j + sy / n) * cell, oz + (k + sz / n) * cell);
      }
    }
  }

  // Quadrilatères autour de chaque arête de la grille qui traverse la surface.
  const tris = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) tris.push(a, c, b, a, d, c);
    else tris.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const inside = field[idx(i, j, k)] < 0;
        if (inside !== (field[idx(i + 1, j, k)] < 0)) {
          quad(cellVert[idx(i, j - 1, k - 1)], cellVert[idx(i, j, k - 1)], cellVert[idx(i, j, k)], cellVert[idx(i, j - 1, k)], !inside);
        }
        if (inside !== (field[idx(i, j + 1, k)] < 0)) {
          quad(cellVert[idx(i - 1, j, k - 1)], cellVert[idx(i - 1, j, k)], cellVert[idx(i, j, k)], cellVert[idx(i, j, k - 1)], !inside);
        }
        if (inside !== (field[idx(i, j, k + 1)] < 0)) {
          quad(cellVert[idx(i - 1, j - 1, k)], cellVert[idx(i, j - 1, k)], cellVert[idx(i, j, k)], cellVert[idx(i - 1, j, k)], !inside);
        }
      }
    }
  }

  // Projection sur la surface et normales lisses (gradient de la SDF).
  const nrm = new Float32Array(pos.length);
  const e = cell * 0.25;
  for (let v = 0; v < pos.length; v += 3) {
    let x = pos[v];
    let y = pos[v + 1];
    let z = pos[v + 2];
    let gx = 0;
    let gy = 0;
    let gz = 0;
    for (let it = 0; it < 2; it++) {
      const d = sdf(x, y, z);
      gx = sdf(x + e, y, z) - sdf(x - e, y, z);
      gy = sdf(x, y + e, z) - sdf(x, y - e, z);
      gz = sdf(x, y, z + e) - sdf(x, y, z - e);
      const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
      gx /= gl;
      gy /= gl;
      gz /= gl;
      if (it === 0) {
        x -= gx * d;
        y -= gy * d;
        z -= gz * d;
      }
    }
    if (displace) {
      const dd = displace(x, y, z, gx, gy, gz);
      x += gx * dd;
      y += gy * dd;
      z += gz * dd;
    }
    pos[v] = x;
    pos[v + 1] = y;
    pos[v + 2] = z;
    nrm[v] = gx;
    nrm[v + 1] = gy;
    nrm[v + 2] = gz;
  }

  const geo = new THREE.BufferGeometry();
  if (uv) {
    // UV avec couture : les triangles à cheval sur u = 0/1 reçoivent des sommets dupliqués.
    const uvs = [];
    const count = pos.length / 3;
    for (let v = 0; v < count; v++) uvs.push(...uv(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]));
    const dup = new Map();
    for (let t = 0; t < tris.length; t += 3) {
      const a = uvs[tris[t] * 2];
      const b = uvs[tris[t + 1] * 2];
      const c = uvs[tris[t + 2] * 2];
      if (Math.max(a, b, c) - Math.min(a, b, c) <= 0.5) continue;
      for (let q = 0; q < 3; q++) {
        const vi = tris[t + q];
        if (uvs[vi * 2] >= 0.5) continue;
        let ni = dup.get(vi);
        if (ni === undefined) {
          ni = pos.length / 3;
          pos.push(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]);
          uvs.push(uvs[vi * 2] + 1, uvs[vi * 2 + 1]);
          dup.set(vi, ni);
        }
        tris[t + q] = ni;
      }
    }
    const n2 = new Float32Array(pos.length);
    n2.set(nrm);
    for (const [vi, ni] of dup) n2.set(nrm.subarray(vi * 3, vi * 3 + 3), ni * 3);
    geo.setAttribute('normal', new THREE.BufferAttribute(n2, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  } else {
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(tris);
  geo.computeBoundingSphere();
  return geo;
}

/** Point de la surface rencontré en partant de o dans la direction dir (marche de sphère). */
export function rayHit(sdf, o, dir, maxDist = 2) {
  const d = new THREE.Vector3(...dir).normalize();
  const p = new THREE.Vector3(...o);
  let t = 0;
  // Si on part de l'intérieur, on avance jusqu'à sortir.
  for (let i = 0; i < 200 && t < maxDist; i++) {
    const s = sdf(p.x + d.x * t, p.y + d.y * t, p.z + d.z * t);
    if (s > 0) {
      // Affinage par dichotomie entre t - pas et t.
      let a = Math.max(0, t - 0.01);
      let b = t;
      for (let k = 0; k < 12; k++) {
        const m = (a + b) / 2;
        if (sdf(p.x + d.x * m, p.y + d.y * m, p.z + d.z * m) > 0) b = m;
        else a = m;
      }
      t = b;
      break;
    }
    t += Math.max(0.002, Math.abs(s) * 0.8);
  }
  return p.addScaledVector(d, t);
}

/** Normale de la SDF en un point. */
export function sdfNormal(sdf, p, e = 0.002) {
  return new THREE.Vector3(
    sdf(p.x + e, p.y, p.z) - sdf(p.x - e, p.y, p.z),
    sdf(p.x, p.y + e, p.z) - sdf(p.x, p.y - e, p.z),
    sdf(p.x, p.y, p.z + e) - sdf(p.x, p.y, p.z - e),
  ).normalize();
}
