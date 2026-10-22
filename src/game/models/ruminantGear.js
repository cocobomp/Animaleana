// Licol et masque anti-mouches des ruminants réalistes (vache, taureau, veau, chèvre) : mesurés sur la tête du modèle.
//
// Le licol générique (gearModels.js, buildGenericGear) est taillé pour la tête procédurale (un cylindre de rayon
// look.headR) : sur la vraie tête, sa têtière et ses montants passaient sous la peau (rien ne se voyait sur la vache, un
// V rouge sur le nez de la chèvre) et le masque (une demi-sphère) disparaissait dans le crâne. Ici, la tête au repos du
// gabarit est coupée en tranches perpendiculaires à son axe (de la nuque au bout du nez) ; dans chaque tranche, le rayon
// de la peau est mesuré tout autour (angle 0 : dessus, ±π/2 : côtés, π : dessous). Muserolle, têtière, montants, anneau
// sous le menton et coque du masque sont posés sur ces rayons, un peu au-dessus de la peau, dans le repère de l'os de la
// tête (ils suivent la tête, son échelle de race comprise ; la mâchoire et les oreilles, qui bougent, sont laissées de
// côté). Mesuré une fois par gabarit (S.headFit).

import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const BINS = 36;

/**
 * Coupes de la tête d'un gabarit (repère du modèle, au repos). P : primitive (mask : y = tête ; exclude(i) : sommets à
 * ignorer — cornes, oreilles, barbe) ; pos : positions du gabarit ; poll : articulation de la tête (nuque) ; nose, eye,
 * skull : repères mesurés (measureSheep). Renvoie { at(t, θ, gap) → point du modèle, t : repères le long de l'axe }.
 */
export function headSections(P, pos, { poll, nose, eye, skull, exclude = () => false }) {
  const a = V().subVectors(nose, poll).normalize();
  const u = V().subVectors(skull, poll);
  u.addScaledVector(a, -u.dot(a));
  if (u.lengthSq() < 1e-8) u.set(0, 1, 0).addScaledVector(a, -a.y);
  u.normalize();
  // (côté +x de l'animal pour θ = +π/2)
  const s = V().crossVectors(u, a).normalize();
  if (s.x < 0) s.negate();
  const pts = [];
  const tmp = V();
  for (let i = 0; i < P.count; i++) {
    if (P.mask[i * 4 + 1] < 0.5 || exclude(i)) continue;
    tmp.fromArray(pos, i * 3).sub(poll);
    const t = tmp.dot(a);
    tmp.addScaledVector(a, -t);
    pts.push(t, Math.atan2(tmp.dot(s), tmp.dot(u)), tmp.length());
  }
  const tNose = V().subVectors(nose, poll).dot(a);
  const tEye = V().subVectors(eye, poll).dot(a);
  const cache = new Map();
  /** Rayons bruts de la tranche t (−1 : secteur vide). */
  const raw = (t, half) => {
    const r = new Float32Array(BINS).fill(-1);
    for (let k = 0; k < pts.length; k += 3) {
      if (Math.abs(pts[k] - t) > half) continue;
      const b = ((Math.round((pts[k + 1] / (Math.PI * 2)) * BINS) % BINS) + BINS) % BINS;
      if (pts[k + 2] > r[b]) r[b] = pts[k + 2];
    }
    return r;
  };
  /**
   * Rayon de la peau tout autour de la tranche t (BINS secteurs ; secteurs vides : interpolés), jamais rentré. Une
   * tranche presque vide (moins d'un tiers des secteurs : derrière la tête, au bord des oreilles) prend la plus proche
   * qui ne l'est pas, de 5 mm en 5 mm.
   */
  const ring = (t, half = 0.012) => {
    const key = `${Math.round(t * 2000)}|${half}`;
    if (cache.has(key)) return cache.get(key);
    let r = raw(t, half);
    const filled = (x) => x.filter((v) => v >= 0).length >= BINS / 3;
    for (let k = 1; k <= 16 && !filled(r); k++) {
      for (const sg of [1, -1]) {
        const q = raw(t + sg * k * 0.005, half);
        if (filled(q)) {
          r = q;
          break;
        }
      }
    }
    const full = r.some((x) => x >= 0);
    if (!full) r.fill(0.05);
    for (let b = 0; b < BINS && full; b++) {
      if (r[b] >= 0) continue;
      let i0 = b;
      let i1 = b;
      let n0 = 0;
      let n1 = 0;
      while (r[(i0 + BINS) % BINS] < 0 && n0 < BINS) { i0--; n0++; }
      while (r[i1 % BINS] < 0 && n1 < BINS) { i1++; n1++; }
      const r0 = r[(i0 + BINS) % BINS];
      const r1 = r[i1 % BINS];
      r[b] = Math.max(0, r0 + ((r1 - r0) * n0) / Math.max(1, n0 + n1));
    }
    // (adouci sans jamais rentrer sous la peau : le plus grand du rayon et de sa moyenne avec ses voisins)
    const out = new Float32Array(BINS);
    for (let b = 0; b < BINS; b++) {
      const m = 0.25 * r[(b + BINS - 1) % BINS] + 0.5 * r[b] + 0.25 * r[(b + 1) % BINS];
      out[b] = Math.max(r[b], m, Math.max(r[(b + BINS - 1) % BINS], r[(b + 1) % BINS]) * 0.92);
    }
    cache.set(key, out);
    return out;
  };
  const radius = (t, th, half = 0.012) => {
    const r = ring(t, half);
    const f = ((th / (Math.PI * 2)) * BINS % BINS + BINS) % BINS;
    const k = Math.floor(f);
    return r[k] + (r[(k + 1) % BINS] - r[k]) * (f - k);
  };
  /** Point de la tranche t, dans la direction θ, à la distance rr de l'axe. */
  const dirPoint = (t, th, rr) => poll.clone().addScaledVector(a, t).addScaledVector(u, Math.cos(th) * rr).addScaledVector(s, Math.sin(th) * rr);
  const at = (t, th, gap = 0) => dirPoint(t, th, radius(t, th) + gap);
  return { at, dirPoint, radius, axis: a, up: u, side: s, tNose, tEye, poll };
}

/**
 * Rayons d'une sangle lissés sans jamais rentrer sous la peau : le plus grand des voisins (± 2 échantillons), puis deux
 * moyennes glissantes, jamais sous le rayon mesuré. closed : la sangle fait le tour (muserolle).
 */
function smoothRadii(rs, closed, reach = 2) {
  const n = rs.length;
  const get = (a, i) => (closed ? a[(i + n) % n] : a[Math.max(0, Math.min(n - 1, i))]);
  let cur = rs.map((r, i) => {
    let m = r;
    for (let k = 1; k <= reach; k++) m = Math.max(m, get(rs, i - k), get(rs, i + k));
    return m;
  });
  for (let pass = 0; pass < 2; pass++) {
    const prev = cur;
    cur = prev.map((r, i) => Math.max(rs[i], (get(prev, i - 2) + 2 * get(prev, i - 1) + 3 * r + 2 * get(prev, i + 1) + get(prev, i + 2)) / 9));
  }
  return cur;
}

/**
 * Pièces du licol et du masque d'un gabarit, dans le repère de l'os de la tête (toHead : point du modèle → repère de
 * l'os). sec : headSections ; kind : 'cow' | 'goat' ; tCrown : tranche de la têtière (juste devant les oreilles et les
 * cornes, mesurée par l'appelant). Renvoie { noseband, crown, cheeks, ring, ringN, shell, w, th, leash (point du modèle
 * de l'anneau, pour la longe) }.
 */
export function headStrapFit(sec, toHead, { kind = 'cow', tCrown, tShell0 = tCrown, crownSec = sec }) {
  const { at, side, tNose, tEye } = sec;
  // (taille des sangles : 3,4 cm de large pour la vache, 2,2 cm pour la chèvre — lisibles à la caméra du téléphone ;
  // 7 et 5 mm au-dessus de la peau)
  const w = kind === 'cow' ? 0.017 : 0.011;
  const th = kind === 'cow' ? 0.004 : 0.003;
  const gap = kind === 'cow' ? 0.007 : 0.005;
  // Muserolle : à mi-chemin de l'œil et du bout du nez sur le chanfrein (un peu plus près de l'œil pour la chèvre, au
  // museau fin), et sous le menton un peu plus en avant (tN(θ)) : la tranche perpendiculaire à l'axe de la tête, qui
  // plonge vers l'avant, descendait de biais jusqu'à l'angle de la mâchoire et sous la gorge.
  const L = tNose - tEye;
  const tN0 = tEye + L * (kind === 'cow' ? 0.52 : 0.45);
  const tilt = L * (kind === 'cow' ? 0.3 : 0.12);
  const tNof = (thA) => tN0 + tilt * (1 - Math.cos(thA)) * 0.5;
  const NB = 36;
  const nbTh = Array.from({ length: NB }, (_, i) => (i / NB) * Math.PI * 2);
  // (tranches plus épaisses et voisins proches seulement : la muserolle en biais prenait d'un angle à l'autre des
  // tranches différentes et zigzaguait)
  const nbR = smoothRadii(nbTh.map((thA) => sec.radius(tNof(thA), thA, 0.022)), true, 1);
  const noseband = nbTh.map((thA, i) => toHead(sec.dirPoint(tNof(thA), thA, nbR[i] + gap + th)));
  const tN = tNof(Math.PI / 2 + 0.47);
  // Têtière : en travers de la nuque, derrière les yeux, devant les oreilles et les cornes, d'une joue à l'autre par le
  // dessus (elle rejoint les montants ; sous la gorge, la tranche passerait dans l'encolure, que la tête ne porte pas).
  const crown = [];
  const crTh = Array.from({ length: 19 }, (_, i) => -(Math.PI / 2 + 0.12) + ((Math.PI + 0.24) * i) / 18);
  const crR = smoothRadii(crTh.map((thA) => crownSec.radius(tCrown, thA, 0.02)), false, 1);
  // (un peu plus haut chez la vache : il passe au pied des cornes, que la race allonge après les mesures — la Highland)
  const crGap = gap + th + (kind === 'cow' ? 0.008 : 0);
  crTh.forEach((thA, i) => crown.push(toHead(crownSec.dirPoint(tCrown, thA, crR[i] + crGap))));
  // Montants : de la muserolle (côté, sous le milieu) à la têtière (côté), sur la joue : ils passent sous l'œil (≈ 27°
  // sous la ligne des yeux — l'axe passe par eux) puis remontent derrière lui jusqu'à la têtière.
  // (rayons lissés le long de la sangle sans jamais rentrer : le plus grand des voisins, puis moyenné — d'une tranche à
  // l'autre, le creux de l'œil et l'angle de la mâchoire la faisaient zigzaguer)
  const tUp = tEye - 0.15 * (tEye - tCrown);
  const cheeks = [1, -1].map((sg) => {
    const N = 16;
    const ts = [];
    const ths = [];
    const rs = [];
    for (let i = 0; i <= N; i++) {
      const t = tN + ((tCrown - tN) * i) / N;
      const g = t >= tUp ? 0 : Math.min(1, (tUp - t) / Math.max(1e-3, tUp - tCrown));
      const thA = sg * (Math.PI / 2 + 0.47 - 0.4 * g * g * (3 - 2 * g));
      ts.push(t);
      ths.push(thA);
      rs.push(sec.radius(t, thA));
    }
    const sm = smoothRadii(rs, false);
    return ts.map((t, i) => toHead(sec.dirPoint(t, ths[i], sm[i] + gap + th * 2.2)));
  });
  // Anneau sous le menton (la longe s'y attache), au bas de la muserolle, un peu en arrière.
  const ringR = kind === 'cow' ? 0.022 : 0.014;
  const leash = at(tNof(Math.PI) - L * 0.04, Math.PI, gap + th + ringR * 0.9);
  const ring = toHead(leash);
  // (l'anneau pend dans le plan de la tête : son axe est celui des flancs)
  const ringN = toHead(leash.clone().add(side)).sub(ring).normalize();
  // Masque (vache) : coque au-dessus des yeux et du front, de la têtière jusque sous les yeux, sur le dessus et les
  // côtés (jusqu'à ±115° du dessus), 1,6 cm au-dessus de la peau.
  const rows = [];
  const tS1 = tEye + (tNose - tEye) * 0.3;
  const NZ = 9;
  const NA = 19;
  for (let i = 0; i < NZ; i++) {
    const t = tShell0 + ((tS1 - tShell0) * i) / (NZ - 1);
    const row = [];
    for (let j = 0; j < NA; j++) row.push(toHead(crownSec.at(t, -2.0 + (4.0 * j) / (NA - 1), 0.016)));
    rows.push(row);
  }
  return { noseband, crown, cheeks, ring, ringN, ringR, shell: rows, w, th, leash };
}

/**
 * Licol et masque d'un gabarit de vache ou de chèvre (base : realCowBase / realGoatBase ; S : gabarit ; toHead : point du
 * modèle → repère de l'os de la tête). Seuls comptent les sommets portés surtout par la tête et la mâchoire (ni
 * l'encolure ni le fanon, que la tête tire un peu), sans les cornes, les oreilles ni la barbe, qui bougent ou dépassent.
 */
export function fitRuminantHead(base, S, kind, toHead) {
  const P = base.prim;
  const H = S.heads;
  const M = S.measure;
  const ix = (nm) => base.index.get(nm);
  const keep = new Uint8Array(base.names.length);
  for (const nm of ['head', 'jaw']) if (ix(nm) !== undefined) keep[ix(nm)] = 1;
  const isEar = base.names.map((nm) => /^ear/.test(nm));
  // (la gorge et le fanon, derrière l'œil et bien plus bas que lui, que l'os de la tête tire encore — le taureau — ne
  // sont pas la tête : la muserolle, tranchée de biais, y descendait)
  const L = M.nose.distanceTo(M.eye);
  const throat = (i) => S.pos[i * 3 + 2] < M.eye.z - 0.12 * L && S.pos[i * 3 + 1] < M.eye.y - 0.36 * L;
  const exclude = (i) => !keep[P.domBone[i]] || P.part[i * 4] > 0.55 || isEar[P.domBone[i]]
    || (kind === 'goat' && P.part[i * 4 + 2] > 0.3) || throat(i);
  const sec = headSections(P, S.pos, { poll: M.eye, nose: M.nose, eye: M.eye, skull: M.skull, exclude });
  const tOf = (p) => V().subVectors(p, M.eye).dot(sec.axis);
  // (têtière : derrière les yeux ; entre les cornes et les oreilles quand les cornes sont devant — la vache —, sinon
  // juste devant les deux — le taureau, la chèvre)
  const tEar = H[ix('earL')] ? tOf(H[ix('earL')]) : -0.5 * L;
  const tHorn = H[ix('hornL')] ? tOf(H[ix('hornL')]) : tEar;
  const tCrown = tHorn > tEar + 0.18 * L ? (tHorn + tEar) / 2 : Math.max(tHorn, tEar) + 0.09 * L;
  // (têtière et masque, sur la nuque : par-dessus toute la peau que porte la tête, la racine des cornes et des oreilles
  // comprise — sans elles, la têtière passait sous le pied des cornes de la vache, sous la racine des oreilles du veau
  // et sous le toupet du taureau)
  const roots = ['hornL', 'hornR', 'earL', 'earR'].map((nm) => [ix(nm), H[ix(nm)]]).filter(([b, p]) => b !== undefined && p);
  const nearRoot = (i) => {
    for (const [b, p] of roots) {
      if (P.domBone[i] !== b) continue;
      const rootR = (isEar[b] ? 0.16 : 0.24) * L;
      const dx = S.pos[i * 3] - p.x;
      const dy = S.pos[i * 3 + 1] - p.y;
      const dz = S.pos[i * 3 + 2] - p.z;
      return dx * dx + dy * dy + dz * dz < rootR * rootR;
    }
    return null;
  };
  const crownSec = headSections(P, S.pos, {
    poll: M.eye, nose: M.nose, eye: M.eye, skull: M.skull,
    exclude: (i) => {
      if (throat(i) || (kind === 'goat' && P.part[i * 4 + 2] > 0.3)) return true;
      const r = nearRoot(i);
      return r === null ? !keep[P.domBone[i]] : !r;
    },
  });
  return headStrapFit(sec, toHead, { kind, tCrown, tShell0: tCrown + 0.01, crownSec });
}

/** Nappe (rangées de points) en géométrie : deux faces, coordonnées de texture pour la maille. */
export function shellGeometry(rows) {
  const pos = [];
  const uv = [];
  const idx = [];
  const nz = rows.length;
  const na = rows[0].length;
  for (let i = 0; i < nz; i++) {
    for (let j = 0; j < na; j++) {
      pos.push(rows[i][j].x, rows[i][j].y, rows[i][j].z);
      uv.push(j / (na - 1), i / (nz - 1));
    }
  }
  for (let i = 0; i < nz - 1; i++) {
    for (let j = 0; j < na - 1; j++) {
      const q = i * na + j;
      idx.push(q, q + 1, q + na, q + 1, q + na + 1, q + na);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
