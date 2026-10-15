// Formes organiques générées par le code : « lofts » (tubes à section variable le long
// d'une courbe lisse) et mèches de poils. Elles servent aux animaux et à l'avatar.

import * as THREE from 'three';

const _v = new THREE.Vector3();

/** Catmull-Rom uniforme sur un nombre. */
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

const KEYS = ['x', 'y', 'z', 'rx', 'ry', 'ryb', 'rxb'];

/** Sections → anneaux interpolés (positions et rayons lissés). */
function interpolate(sections, sub) {
  const S = sections.map((s) => ({
    x: s.p[0], y: s.p[1], z: s.p[2], rx: s.rx, ry: s.ry ?? s.rx, ryb: s.ryb ?? s.ry ?? s.rx, rxb: s.rxb ?? s.rx,
  }));
  const out = [];
  const n = S.length;
  for (let i = 0; i < n - 1; i++) {
    const a = S[Math.max(0, i - 1)];
    const b = S[i];
    const c = S[i + 1];
    const d = S[Math.min(n - 1, i + 2)];
    const steps = i === n - 2 ? sub + 1 : sub;
    for (let k = 0; k < steps; k++) {
      const t = k / sub;
      const r = {};
      for (const key of KEYS) r[key] = cr(a[key], b[key], c[key], d[key], t);
      r.rx = Math.max(0.0005, r.rx);
      r.ry = Math.max(0.0005, r.ry);
      r.ryb = Math.max(0.0005, r.ryb);
      r.rxb = Math.max(0.0005, r.rxb);
      out.push(r);
    }
  }
  return out;
}

/**
 * Ajoute un dôme arrondi à chaque bout (round = [longueur début, longueur fin], en fraction du rayon).
 */
function roundEnds(sections, [a, b]) {
  const dome = (end, prev, k) => {
    const dir = [end.p[0] - prev.p[0], end.p[1] - prev.p[1], end.p[2] - prev.p[2]];
    const l = Math.hypot(...dir) || 1;
    const r = Math.min(end.rx, end.ry ?? end.rx, end.ryb ?? end.ry ?? end.rx);
    const len = r * k;
    return [0.45, 0.75, 0.92, 1].map((t) => {
      const f = Math.sqrt(Math.max(0.0, 1 - t * t));
      const sc = Math.max(0.04, f);
      return {
        p: [end.p[0] + (dir[0] / l) * len * t, end.p[1] + (dir[1] / l) * len * t, end.p[2] + (dir[2] / l) * len * t],
        rx: end.rx * sc, ry: (end.ry ?? end.rx) * sc, ryb: (end.ryb ?? end.ry ?? end.rx) * sc, rxb: (end.rxb ?? end.rx) * sc,
      };
    });
  };
  const n = sections.length;
  const out = [...sections];
  if (b) out.push(...dome(sections[n - 1], sections[n - 2], b));
  if (a) out.unshift(...dome(sections[0], sections[1], a).reverse());
  return out;
}

/**
 * Tube lisse dont la section (ellipse ou « super-ellipse ») varie le long d'un chemin.
 * sections : [{ p: [x, y, z], rx, ry, ryb?, rxb? }]
 *   rx = demi-largeur (axe latéral), ry = demi-hauteur côté « haut », ryb = côté « bas ».
 * options : radial, sub, exp (2 = ellipse, plus grand = plus carré), side (axe latéral initial),
 *   capStart / capEnd, displace(x, y, z, u, v) → décalage le long de la normale,
 *   color(u, v) → [r, g, b] (couleurs de sommets).
 * Les UV : u fait le tour (0 = dessous), v suit le chemin. L'attribut furUv est en mètres.
 */
export function loft(sections, opts = {}) {
  const radial = opts.radial ?? 16;
  const sub = opts.sub ?? 4;
  const exp = opts.exp ?? 2;
  if (opts.round) sections = roundEnds(sections, opts.round);
  const rings = interpolate(sections, sub);
  const nR = rings.length;

  // Repères le long du chemin (transport parallèle de l'axe latéral).
  const P = rings.map((r) => new THREE.Vector3(r.x, r.y, r.z));
  const T = P.map((p, i) => {
    const a = P[Math.max(0, i - 1)];
    const b = P[Math.min(nR - 1, i + 1)];
    return new THREE.Vector3().subVectors(b, a).normalize();
  });
  let side = new THREE.Vector3(...(opts.side ?? [1, 0, 0]));
  const B = [];
  const N = [];
  for (let i = 0; i < nR; i++) {
    side = side.clone().addScaledVector(T[i], -side.dot(T[i]));
    if (side.lengthSq() < 1e-8) side = new THREE.Vector3(0, 0, 1).cross(T[i]);
    side.normalize();
    B.push(side.clone());
    N.push(new THREE.Vector3().crossVectors(T[i], side).normalize());
  }

  // Longueurs (pour v et furUv).
  const arc = [0];
  for (let i = 1; i < nR; i++) arc.push(arc[i - 1] + P[i].distanceTo(P[i - 1]));
  const total = arc[nR - 1] || 1;

  const pos = [];
  const uv = [];
  const fur = [];
  const col = opts.color ? [] : null;
  const e = 2 / exp;
  const sp = (c) => Math.sign(c) * Math.abs(c) ** e;
  for (let i = 0; i < nR; i++) {
    const r = rings[i];
    const v = arc[i] / total;
    const circ = Math.PI * (r.rx + r.rxb + r.ry + r.ryb) / 2;
    for (let j = 0; j <= radial; j++) {
      const u = j / radial;
      const a = -Math.PI / 2 + u * Math.PI * 2;
      const ca = sp(Math.cos(a));
      const sa = sp(Math.sin(a));
      const rx = ca >= 0 ? r.rx : r.rxb;
      const ry = sa >= 0 ? r.ry : r.ryb;
      _v.copy(P[i]).addScaledVector(B[i], ca * rx).addScaledVector(N[i], sa * ry);
      if (opts.displace) {
        const d = opts.displace(_v.x, _v.y, _v.z, u, v);
        if (d) {
          const nx = B[i].x * ca * ry + N[i].x * sa * rx;
          const ny = B[i].y * ca * ry + N[i].y * sa * rx;
          const nz = B[i].z * ca * ry + N[i].z * sa * rx;
          const l = Math.hypot(nx, ny, nz) || 1;
          _v.x += (nx / l) * d;
          _v.y += (ny / l) * d;
          _v.z += (nz / l) * d;
        }
      }
      pos.push(_v.x, _v.y, _v.z);
      uv.push(u, v);
      fur.push(u * circ, arc[i]);
      if (col) col.push(...opts.color(u, v));
    }
  }
  const idx = [];
  const W = radial + 1;
  for (let i = 0; i < nR - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * W + j;
      const b = a + W;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // Bouts fermés par un sommet central.
  const cap = (ring, flip) => {
    const c = pos.length / 3;
    const p = P[ring];
    pos.push(p.x, p.y, p.z);
    uv.push(0.5, ring === 0 ? 0 : 1);
    fur.push(0, arc[ring]);
    if (col) col.push(...opts.color(0.5, ring === 0 ? 0 : 1));
    for (let j = 0; j < radial; j++) {
      const a = ring * W + j;
      if (flip) idx.push(c, a + 1, a);
      else idx.push(c, a, a + 1);
    }
  };
  if (opts.capStart !== false) cap(0, false);
  if (opts.capEnd !== false) cap(nR - 1, true);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('furUv', new THREE.Float32BufferAttribute(fur, 2));
  if (col) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Recoud la couture (u = 0 et u = 1) pour éviter une ligne d'ombre.
  const n = geo.attributes.normal;
  for (let i = 0; i < nR; i++) {
    const a = i * W;
    const b = a + radial;
    _v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, _v.x, _v.y, _v.z);
    n.setXYZ(b, _v.x, _v.y, _v.z);
  }
  geo.userData.frame = { P, B, N, rings, arc, total, exp };
  return geo;
}

/**
 * Point à la surface d'un loft : v (0–1 le long du chemin), angle (0 = côté +latéral,
 * π/2 = haut, -π/2 = bas), out = décalage vers l'extérieur.
 */
export function surfacePoint(geo, v, angle, out = 0) {
  const f = geo.userData.frame;
  const target = v * f.total;
  let i = 0;
  while (i < f.arc.length - 2 && f.arc[i + 1] < target) i++;
  const span = f.arc[i + 1] - f.arc[i] || 1;
  const t = Math.min(1, Math.max(0, (target - f.arc[i]) / span));
  const lerp = (a, b) => a + (b - a) * t;
  const r0 = f.rings[i];
  const r1 = f.rings[i + 1];
  const e = 2 / f.exp;
  const sp = (c) => Math.sign(c) * Math.abs(c) ** e;
  const ca = sp(Math.cos(angle));
  const sa = sp(Math.sin(angle));
  const rx = ca >= 0 ? lerp(r0.rx, r1.rx) : lerp(r0.rxb, r1.rxb);
  const ry = sa >= 0 ? lerp(r0.ry, r1.ry) : lerp(r0.ryb, r1.ryb);
  const P = new THREE.Vector3().lerpVectors(f.P[i], f.P[i + 1], t);
  const Bv = new THREE.Vector3().lerpVectors(f.B[i], f.B[i + 1], t).normalize();
  const Nv = new THREE.Vector3().lerpVectors(f.N[i], f.N[i + 1], t).normalize();
  const dir = Bv.clone().multiplyScalar(ca).addScaledVector(Nv, sa).normalize();
  return P.addScaledVector(Bv, ca * rx).addScaledVector(Nv, sa * ry).addScaledVector(dir, out);
}

/**
 * Mèches de poils (crinière, queue, barbe) : rubans plats le long de polylignes.
 * list : [{ pts: [Vector3...], w0, w1, side: Vector3 }] — side = direction de la largeur.
 */
export function strands(list) {
  const pos = [];
  const uv = [];
  const nor = [];
  const idx = [];
  const tmp = new THREE.Vector3();
  const tan = new THREE.Vector3();
  for (const s of list) {
    const base = pos.length / 3;
    const n = s.pts.length;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const w = (s.w0 + (s.w1 - s.w0) * t) / 2;
      const p = s.pts[i];
      tan.subVectors(s.pts[Math.min(n - 1, i + 1)], s.pts[Math.max(0, i - 1)]).normalize();
      const nrm = tmp.crossVectors(s.side, tan).normalize();
      for (const k of [-1, 1]) {
        pos.push(p.x + s.side.x * w * k, p.y + s.side.y * w * k, p.z + s.side.z * w * k);
        uv.push((k + 1) / 2 * (s.u1 ?? 1) + (s.u0 ?? 0) * (1 - (k + 1) / 2), 1 - t);
        nor.push(nrm.x, nrm.y, nrm.z);
      }
      if (i < n - 1) {
        const a = base + i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

/** Bruit de valeur 3D lisse et léger (pour bosseler la laine, les rochers…). */
export function noise3(x, y, z) {
  const h = (i, j, k) => {
    const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}
