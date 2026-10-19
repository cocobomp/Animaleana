// Le cavalier sur le cheval réaliste (horseReal.js) : assis SUR la selle (le bassin posé sur le siège, pas
// dedans), les jambes le long des flancs (genoux contre la selle, pieds dans les étriers), sans rien faire passer
// dans le cheval, à l'arrêt, aux trois allures et pendant le saut d'obstacle.
//
// prepareRiderFit (à la mise en selle) mesure le cheval dans le repère de son tronc (groupe body, qui porte la
// selle) : une « carte des flancs » (demi-largeur du pelage et de la selle pour chaque hauteur et chaque z), le
// dessus du siège (ou du dos, à cru), et met les étriers à la longueur de jambe du cavalier (genou plié de 65°,
// pied contre le flanc). fitRider (à chaque image, après les séances qui basculent le cheval au saut) relève le
// bassin s'il entre dans le siège, puis place chaque jambe : pied à l'étrier (il suit le tronc), genou écarté
// juste ce qu'il faut pour que cuisse, genou, tibia et pied restent hors des flancs (lus sur la carte, et sur la
// peau des épaules et des hanches déformée à cette image).
import * as THREE from 'three';
import { LEG } from './avatarMotion.js';
import { legReach, footTo } from './avatarRig.js';
import { fitStirrup } from '../gearModels.js';

/** Cellule de la carte des flancs (m, à la taille du cavalier ; divisée par l'échelle du cheval). */
const CELL = 0.02;
/** Écart laissé entre la jambe (ou le bassin) et le cheval (m). */
const GAP = 0.008;
/** Pied dans l'étrier : la cheville au-dessus de la grille et en arrière (repère de l'avatar). */
const FOOT = new THREE.Vector3(0, 0.05, -0.07);
/** Pli du genou voulu, étriers réglés (rad, ≈ 65°) ; à cru, jambes plus tombantes. */
const BEND = 1.1;
const BEND_BARE = 0.8;
/** Points des jambes contrôlés : [segment (0 cuisse, 1 tibia), t le long du segment, rayon (m)]. */
const SAMPLES = [
  [0, 0.25, 0.08], [0, 0.5, 0.072], [0, 0.75, 0.064], [0, 1, 0.058],
  [1, 0.15, 0.06], [1, 0.4, 0.056], [1, 0.65, 0.05], [1, 0.9, 0.046],
];
const FOOT_R = 0.055; // demi-largeur de la chaussure
const STATIC = new Set(['Spine', 'Ribs']); // peau qui suit le tronc
// peau relue à chaque image : encolure, épaules, bras, hanches, cuisses (pas le bas des membres, sous les pieds du
// cavalier et sous le ventre, ni la tête et la queue)
const MOVING = new Set(['Neck', 'FL1', 'FR1', 'FL2', 'FR2', 'HL1', 'HR1', 'HL2', 'HR2']);

const _m = new THREE.Matrix4();
const _mi = new THREE.Matrix4();
const _ri = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _h = new THREE.Vector3();
const _a = new THREE.Vector3();
const _k = new THREE.Vector3();
const _u = new THREE.Vector3();
const _p = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _ks = { phi: 0, over: 0 };
const _c = new THREE.Vector3();
/** Écart du genou cherché entre ces angles (rad) : vers le cheval → vers l'extérieur. */
const PHI_MIN = 0;
const PHI_MAX = 1.45;
/** Pied écarté du flanc au plus tant de fois quand le genou, même très écarté, touche encore. */
const PUSH_TRIES = 4;

/** Os qui porte le plus le sommet i du pelage. */
function dominant(geo, i) {
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  let b = si.getX(i);
  let w = sw.getX(i);
  for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > w) { w = sw.getComponent(i, k); b = si.getComponent(i, k); }
  return b;
}

/**
 * Mesures pour un cavalier sur ce cheval (cheval réaliste seulement : model.real, coatMesh lié au squelette).
 * entity : { model, root, scaleGroup, scale, gearGroup, data } ; a : avatar (buildAvatar) déjà posé en selle
 * (Player.seat).
 * bareback : sans selle. Renvoie null si le cheval n'est pas un cheval réaliste.
 */
export function prepareRiderFit(entity, a, bareback = false) {
  const md = entity.model;
  const coat = md.coatMesh;
  if (!md.real || !coat?.isSkinnedMesh || !md.body) return null;
  const body = md.body;
  const sc = Math.max(0.2, entity.scale ?? 1);
  const saddle = bareback ? null : entity.gearGroup?.userData.saddle;
  const seat = saddle?.parent === body ? saddle : null;
  entity.root.updateMatrixWorld(true);
  a.root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(body.matrixWorld).invert();
  // Région des jambes (repère de body) : autour des hanches du cavalier, jusque sous le ventre.
  const hip = a.legs[0].getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  // (de 80 cm sous la hanche à 15 cm au-dessus, de 35 cm derrière à 50 cm devant : à la taille du cavalier)
  const cell = CELL / sc;
  const z0 = hip.z - 0.35 / sc;
  const y0 = hip.y - 0.8 / sc;
  const nz = Math.ceil(0.85 / sc / cell);
  const ny = Math.ceil(0.95 / sc / cell);
  // Deux cartes : demi-largeur du cheval pour chaque (y, z), et hauteur du dessus pour chaque (|x|, z).
  const nx = Math.ceil(0.45 / sc / cell);
  const W0 = new Float32Array(ny * nz).fill(-1);
  const H0 = new Float32Array(nx * nz).fill(-Infinity);
  const put = (p) => {
    const iz = Math.floor((p.z - z0) / cell);
    if (iz < 0 || iz >= nz) return;
    const iy = Math.floor((p.y - y0) / cell);
    if (iy >= 0 && iy < ny && Math.abs(p.x) > W0[iy * nz + iz]) W0[iy * nz + iz] = Math.abs(p.x);
    const ix = Math.floor(Math.abs(p.x) / cell);
    if (ix < nx && p.y > H0[ix * nz + iz]) H0[ix * nz + iz] = p.y;
  };
  // (triangles remplis : les sommets du pelage sont à 3 ou 4 cm les uns des autres, plus que la cellule ; des
  // sommets seuls laissaient des trous, par où passaient les jambes à cru)
  const fill = (A, B, C) => {
    const m = Math.max(1, Math.ceil(Math.max(A.distanceTo(B), B.distanceTo(C), C.distanceTo(A)) / cell));
    for (let u = 0; u <= m; u++) {
      for (let w = 0; w <= m - u; w++) put(_v.copy(A).addScaledVector(_w.subVectors(B, A), u / m).addScaledVector(_p.subVectors(C, A), w / m));
    }
  };
  // Pelage : la peau du tronc dans la carte fixe, celle des épaules, des hanches, de l'encolure relue à chaque image.
  const geo = coat.geometry;
  const n = geo.attributes.position.count;
  const dyn = [];
  const bones = md.skeleton.bones;
  const kind = bones.map((b) => {
    const nm = String(b.name).replace(/^g/, '');
    return STATIC.has(nm) ? 1 : MOVING.has(nm) ? 2 : 0;
  });
  const P = new Float32Array(n * 3);
  const K = new Uint8Array(n);
  const inside = new Uint8Array(n);
  const margin = 0.1 / sc;
  for (let i = 0; i < n; i++) {
    K[i] = kind[dominant(geo, i)] ?? 1;
    if (!K[i]) continue;
    coat.getVertexPosition(i, _v).applyMatrix4(coat.matrixWorld).applyMatrix4(inv).toArray(P, i * 3);
    inside[i] = _v.y >= y0 - margin && _v.z >= z0 - margin && _v.y < y0 + ny * cell + margin && _v.z < z0 + nz * cell + margin ? 1 : 0;
    if (K[i] === 2 && inside[i]) dyn.push(i);
  }
  const I = geo.index.array;
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const Cv = new THREE.Vector3();
  for (let t = 0; t < I.length; t += 3) {
    const a0 = I[t];
    const b0 = I[t + 1];
    const c0 = I[t + 2];
    if (K[a0] !== 1 || K[b0] !== 1 || K[c0] !== 1 || !(inside[a0] || inside[b0] || inside[c0])) continue;
    fill(A.fromArray(P, a0 * 3), B.fromArray(P, b0 * 3), Cv.fromArray(P, c0 * 3));
  }
  // Selle, tapis, sangle (posés sur body) : dans la carte fixe ; pas les étriers ni les étrivières.
  const skip = new Set();
  for (const s of seat?.stirrups ?? []) {
    if (s.leather) skip.add(s.leather);
    s.iron?.traverse((o) => skip.add(o));
  }
  for (const g of entity.gearGroup?.userData.meshes ?? []) {
    if (g.parent !== body || skip.has(g)) continue;
    g.traverse((o) => {
      if (!o.isMesh || skip.has(o) || o.isSkinnedMesh) return;
      const pos = o.geometry.attributes.position;
      const ix = o.geometry.index?.array;
      _m.multiplyMatrices(inv, o.matrixWorld);
      const nt = ix ? ix.length : pos.count;
      for (let t = 0; t + 2 < nt; t += 3) {
        const [i0, i1, i2] = ix ? [ix[t], ix[t + 1], ix[t + 2]] : [t, t + 1, t + 2];
        fill(A.fromBufferAttribute(pos, i0).applyMatrix4(_m), B.fromBufferAttribute(pos, i1).applyMatrix4(_m), Cv.fromBufferAttribute(pos, i2).applyMatrix4(_m));
      }
    });
  }
  // (cases vides entre deux sommets : la plus grande voisine ; la carte est ainsi un peu plus large que le cheval)
  const W = W0.slice();
  for (let iy = 0; iy < ny; iy++) {
    for (let iz = 0; iz < nz; iz++) {
      let m = W0[iy * nz + iz];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const y = iy + dy;
          const z = iz + dz;
          if (y >= 0 && z >= 0 && y < ny && z < nz) m = Math.max(m, W0[y * nz + z]);
        }
      }
      W[iy * nz + iz] = m;
    }
  }
  // (hauteurs sans case voisine : les triangles remplis suffisent, et la voisine du troussequin soulevait le
  // bassin de 2 cm de plus sur un poney)
  const H = H0;
  // Haut des cuisses, près de la hanche (repère de chaque cuisse) : posé sur la selle ou sur le dos, comme le bassin.
  const thighs = a.legs.map((leg) => {
    const pts = [];
    leg.updateWorldMatrix(true, false);
    const lInv = new THREE.Matrix4().copy(leg.matrixWorld).invert();
    for (const o of leg.children) {
      if (!o.isMesh) continue;
      const pos = o.geometry.attributes.position;
      _m.multiplyMatrices(lInv, o.matrixWorld);
      for (let i = 0; i < pos.count; i += 2) {
        _v.fromBufferAttribute(pos, i).applyMatrix4(_m);
        if (_v.length() < 0.13) pts.push(_v.clone());
      }
    }
    return pts;
  });
  // Bas du bassin (repère du torse : il se penche avec le buste) et sa hauteur sous la hanche, buste droit.
  const pelvis = [];
  let low = Infinity;
  const tInv = new THREE.Matrix4().copy(a.torso.matrixWorld).invert();
  const rInv = new THREE.Matrix4().copy(a.root.matrixWorld).invert();
  for (const o of a.chest.children) {
    if (!o.isMesh) continue;
    o.geometry.computeBoundingBox();
    _m.multiplyMatrices(rInv, o.matrixWorld);
    const bb = o.geometry.boundingBox.clone().applyMatrix4(_m);
    if (bb.max.y > 1.0) continue; // (le bassin : sous la taille)
    const pos = o.geometry.attributes.position;
    _mi.multiplyMatrices(tInv, o.matrixWorld);
    const step = Math.max(1, Math.floor(pos.count / 200));
    for (let i = 0; i < pos.count; i += step) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(_m);
      if (_v.y > 0.8) continue;
      low = Math.min(low, _v.y);
      pelvis.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(_mi));
    }
  }
  const fit = {
    entity, gear: entity.gearGroup ?? null, md, sc, seat, bareback: !seat, cell, y0, z0, ny, nz, nx, W, H, Wd: new Float32Array(ny * nz),
    dyn: Uint32Array.from(dyn), pelvis, thighs, pelvisLow: Number.isFinite(low) ? low : 0.74, inv: new THREE.Matrix4(),
    feet: [new THREE.Vector3(), new THREE.Vector3()], stirrups: [null, null], phi: [0.35, 0.35],
  };
  // Dessus du siège (repère de body) : creux, là où le cavalier s'assoit.
  if (seat) {
    let best = null;
    for (const c of seat.seat) if (!best || c.y + c.ry < best.y + best.ry) best = c;
    fit.dip = new THREE.Vector3(0, best.y + best.ry, best.z);
  } else {
    const z = hip.z;
    fit.dip = new THREE.Vector3(0, md.backTop?.(z) ?? hip.y - 0.1, z);
  }
  // Le cavalier assis sur le siège : au creux, ou un peu en avant ou en arrière si son bassin y descend plus bas
  // (sur un poney, la selle est courte pour le cavalier : au creux, le bassin portait sur le troussequin, 4 cm
  // au-dessus) ; puis les pieds (et les étriers) à sa longueur de jambe.
  fit.dz = 0;
  const o = seatOnSaddle(fit, {});
  a.root.position.y = o.y;
  a.root.position.z = o.z;
  a.root.updateWorldMatrix(true, true);
  {
    _m.multiplyMatrices(inv, a.torso.matrixWorld);
    const pts = pelvis.map((p) => p.clone().applyMatrix4(_m));
    // (+z du joueur dans le repère de body, par mètre)
    _mi.multiplyMatrices(inv, a.root.parent ? a.root.parent.matrixWorld : _ri.identity());
    const d = _w.set(0, 0, 1).applyMatrix4(_mi).sub(_p.set(0, 0, 0).applyMatrix4(_mi));
    let best = Infinity;
    for (let k = -4; k <= 8; k++) {
      const dz = k * 0.01;
      let need = 0;
      for (const p of pts) {
        const top = topAt(fit, p.x + d.x * dz, p.z + d.z * dz);
        if (top > -Infinity) need = Math.max(need, top + GAP / sc - p.y - d.y * dz);
      }
      const cost = need * sc + 0.15 * Math.abs(dz); // (1 cm de déplacement vaut 1,5 mm de hauteur)
      if (cost < best - 1e-9) {
        best = cost;
        fit.dz = dz;
      }
    }
    seatOnSaddle(fit, o);
    a.root.position.z = o.z;
    a.root.updateWorldMatrix(true, true);
  }
  readSkin(fit, coat, inv);
  placeFeet(fit, a);
  return fit;
}

/** Dessus du cheval et de sa selle en (x, z), repère de body ; -Infinity s'il n'y a rien. */
function topAt(fit, x, z) {
  const ix = Math.floor(Math.abs(x) / fit.cell);
  const iz = Math.floor((z - fit.z0) / fit.cell);
  if (ix >= fit.nx || iz < 0 || iz >= fit.nz) return -Infinity;
  return fit.H[ix * fit.nz + iz];
}

/** Peau des épaules, des hanches, de l'encolure relue à cette image (carte Wd, repère de body : inv). */
function readSkin(fit, coat, inv) {
  const { Wd, dyn, cell, y0, z0, ny, nz } = fit;
  Wd.fill(-1);
  for (let k = 0; k < dyn.length; k++) {
    coat.getVertexPosition(dyn[k], _v).applyMatrix4(coat.matrixWorld).applyMatrix4(inv);
    const iy = Math.floor((_v.y - y0) / cell);
    const iz = Math.floor((_v.z - z0) / cell);
    if (iy < 0 || iz < 0 || iy >= ny || iz >= nz) continue;
    const c = iy * nz + iz;
    if (Math.abs(_v.x) > Wd[c]) Wd[c] = Math.abs(_v.x);
  }
}

/**
 * Écart du genou (φ, rad : 0 devant, > 0 vers l'extérieur, < 0 vers le cheval) le plus petit qui garde la
 * jambe (hanche H, cheville A, repère de l'avatar) hors du cheval ; et ce qui dépasse encore au plus écarté
 * (0 si rien). out : { phi, over }.
 */
function kneeSearch(fit, H, A, side, toBody, fat, out) {
  const pen = (phi) => legPenetration(fit, H, A, side, phi, toBody, fat);
  let lo = PHI_MIN;
  let hi = PHI_MAX;
  out.over = 0;
  if (pen(lo) <= 0) out.phi = lo;
  else if (pen(hi) > 0) {
    let best = hi;
    let bp = pen(hi);
    for (let f = PHI_MIN + 0.1; f < PHI_MAX; f += 0.1) {
      const p = pen(f);
      if (p < bp) { bp = p; best = f; }
    }
    out.phi = best;
    out.over = bp;
  } else {
    for (let it = 0; it < 10; it++) {
      const m = (lo + hi) / 2;
      if (pen(m) > 0) lo = m;
      else hi = m;
    }
    out.phi = hi;
  }
  return out;
}

/** Demi-largeur du cheval (repère de body) à la hauteur y et en z (carte fixe et peau relue à cette image). */
function widthAt(fit, y, z) {
  const iy = Math.floor((y - fit.y0) / fit.cell);
  const iz = Math.floor((z - fit.z0) / fit.cell);
  if (iy < 0 || iz < 0 || iy >= fit.ny || iz >= fit.nz) return -1;
  const { nz, ny, W, Wd } = fit;
  let m = W[iy * nz + iz];
  // (peau relue : ses sommets seuls, 2 cellules autour)
  for (let dy = -2; dy <= 2; dy++) {
    for (let dz = -2; dz <= 2; dz++) {
      const a = iy + dy;
      const b = iz + dz;
      if (a >= 0 && b >= 0 && a < ny && b < nz) m = Math.max(m, Wd[a * nz + b]);
    }
  }
  return m;
}

/**
 * À la mise en selle : où vont les pieds (repère de body). Genou plié de BEND, pied un peu en avant de la hanche,
 * contre le flanc (la plus grande largeur du cheval sur 25 cm au-dessus du pied, plus la demi-largeur de la
 * chaussure). Avec une selle anglaise, l'étrier y est mis (étrivière rallongée ou raccourcie : gearModels.fitStirrup) ;
 * étrier western : le pied va à l'étrier tel qu'il est.
 */
function placeFeet(fit, a) {
  const { md, sc } = fit;
  const body = md.body;
  const inv = fit.inv.copy(body.matrixWorld).invert();
  const toBody = _m.multiplyMatrices(inv, a.root.matrixWorld);
  const fat = body.scale.x || 1;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1; // (jambe 0 : gauche de l'avatar, côté +x, comme la gauche du cheval)
    const st = fit.seat?.stirrups.find((s) => s.side === side);
    if (st?.fixed) {
      st.iron.updateWorldMatrix(true, false);
      fit.feet[i].copy(st.tread).applyMatrix4(st.iron.matrixWorld).applyMatrix4(inv);
      fit.stirrups[i] = st;
      fit.feet[i].add(_v.copy(FOOT).multiplyScalar(1 / sc));
      continue;
    }
    const H = a.legs[i].position;
    const bend = fit.bareback ? BEND_BARE : BEND;
    const d = Math.sqrt(LEG.thigh ** 2 + LEG.shin ** 2 + 2 * LEG.thigh * LEG.shin * Math.cos(bend));
    // (pied 6 cm devant la hanche ; à cru, sous elle)
    const dz = fit.bareback ? 0.02 : 0.06;
    let x = side * 0.25;
    let y = H.y - d;
    for (let it = 0; it < 4; it++) {
      // largeur du cheval sur 25 cm au-dessus du pied (là où passent le pied et le bas du tibia)
      let wMax = 0;
      for (let t = 0; t <= 5; t++) {
        _v.set(x, y + 0.05 * t, H.z + dz).applyMatrix4(toBody);
        wMax = Math.max(wMax, widthAt(fit, _v.y, _v.z));
      }
      x = side * Math.max(Math.abs(H.x) + 0.05, wMax * sc * fat + FOOT_R + GAP);
      const dx = x - H.x;
      y = H.y - Math.sqrt(Math.max(0.01, d * d - dx * dx - dz * dz));
    }
    // Pied un peu plus loin du flanc si le genou peut ainsi rester devant (sur un cheval large, sinon, le genou
    // part de côté) : chaque 2,5 cm d'écart du pied comptent comme 0,1 rad d'écart du genou.
    let bestD = 0;
    let bestCost = Infinity;
    for (let dd = 0; dd <= 0.1001; dd += 0.02) {
      _c.set(x + side * dd, y, H.z + dz);
      const dx = _c.x - H.x;
      _c.y = H.y - Math.sqrt(Math.max(0.01, d * d - dx * dx - dz * dz));
      kneeSearch(fit, H, _c, side, toBody, fat, _ks);
      const cost = Math.max(0, _ks.phi) + 4 * dd + 20 * _ks.over;
      if (cost < bestCost - 1e-6) {
        bestCost = cost;
        bestD = dd;
      }
    }
    x += side * bestD;
    y = H.y - Math.sqrt(Math.max(0.01, d * d - (x - H.x) ** 2 - dz * dz));
    _a.set(x, y, H.z + dz); // cheville voulue (repère de l'avatar)
    fit.feet[i].copy(_a).applyMatrix4(toBody);
    if (st) {
      // l'étrier sous la cheville : grille sous la plante du pied
      const at = _v.copy(_a).sub(FOOT).applyMatrix4(toBody).sub(_w.copy(st.tread));
      fitStirrup(st, at);
      fit.stirrups[i] = st;
    }
  }
}

/** Remet les étriers à leur place d'origine (pied à terre). */
export function releaseRiderFit(fit) {
  if (!fit || fit.gear !== (fit.entity.gearGroup ?? null)) return; // (harnachement déjà remplacé, et libéré)
  for (const s of fit.stirrups) if (s && !s.fixed) fitStirrup(s, null);
}

/**
 * Hauteur de la racine de l'avatar (repère du joueur, qui est celui du cheval : même place, même cap) pour un
 * bassin posé sur le siège, et z du creux. D'après les transformations locales du moment, du tronc jusqu'au
 * scaleGroup : les matrices du monde datent de l'image d'avant (au saut, la séance soulève le joueur et le cheval
 * après lateUpdate : le cavalier s'envolait d'autant), et sans le tangage du saut (scaleGroup), que pitchAbout
 * applique ensuite au cavalier comme au cheval.
 */
export function seatOnSaddle(fit, out) {
  const sg = fit.entity.scaleGroup;
  _v.copy(fit.dip);
  for (let o = fit.md.body; o && o !== sg && o !== fit.entity.root; o = o.parent) {
    if (o.matrixAutoUpdate) o.updateMatrix();
    _v.applyMatrix4(o.matrix);
  }
  if (sg) _v.multiply(sg.scale);
  out.y = _v.y - fit.pelvisLow;
  out.z = _v.z + (fit.dz ?? 0);
  return out;
}

/**
 * À chaque image, après les séances : bassin relevé s'il entre dans le siège (ou le dos), jambes hors des flancs,
 * pieds aux étriers (a : l'avatar, déjà posé par lateUpdate et les séances). Renvoie de combien le bassin s'est
 * levé (m).
 */
export function fitRider(fit, a) {
  const { md, sc } = fit;
  const body = md.body;
  const coat = md.coatMesh;
  fit.entity.root.updateMatrixWorld(true);
  a.root.updateWorldMatrix(true, true);
  const inv = fit.inv.copy(body.matrixWorld).invert();
  const fat = body.scale.x || 1;
  readSkin(fit, coat, inv);
  // 1) Bassin (et haut des cuisses) posé sur le siège, ou sur le dos.
  let need = 0;
  const lift = (p) => {
    const top = topAt(fit, p.x, p.z);
    if (top > -Infinity) need = Math.max(need, top + GAP / sc - p.y);
  };
  _m.multiplyMatrices(inv, a.torso.matrixWorld);
  for (const p of fit.pelvis) lift(_v.copy(p).applyMatrix4(_m));
  // (haut des cuisses : à cru seulement, sur le dos arrondi ; sous la selle, la carte des hauteurs a le haut des
  // quartiers, à côté desquels les cuisses descendent : la carte des flancs s'en charge)
  for (let i = 0; i < 2 && fit.bareback; i++) {
    _m.multiplyMatrices(inv, a.legs[i].matrixWorld);
    for (const p of fit.thighs[i]) lift(_v.copy(p).applyMatrix4(_m));
  }
  if (need > 0) {
    a.root.position.y += need * sc;
    a.root.updateMatrixWorld(true);
  }
  // 2) Jambes.
  const toBody = _m.multiplyMatrices(inv, a.root.matrixWorld);
  const toAvatar = _mi.copy(toBody).invert();
  const rootInv = _ri.copy(a.root.matrixWorld).invert();
  const L1 = LEG.thigh;
  const L2 = LEG.shin;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const H = _h.copy(a.legs[i].position);
    // cheville : à l'étrier (il suit le tronc du cheval), ramenée à portée si le bassin s'est levé
    const st = fit.stirrups[i];
    if (st && !st.fixed) {
      st.iron.updateWorldMatrix(true, false);
      _a.copy(st.tread).applyMatrix4(st.iron.matrixWorld).applyMatrix4(rootInv).add(FOOT);
    } else _a.copy(fit.feet[i]).applyMatrix4(toAvatar);
    const reach = L1 + L2 - 0.01;
    _u.subVectors(_a, H);
    if (_u.length() > reach) _a.copy(H).addScaledVector(_u.normalize(), reach);
    // genou : le moins écarté possible, hors des flancs (même très écarté, si la jambe touche encore, le pied
    // s'écarte du flanc, du double de ce qui dépasse : le genou, entre hanche et pied, ne s'écarte que de la
    // moitié ; à cru au galop, la cuisse descend sur le haut du ventre, le plus large)
    kneeSearch(fit, H, _a, side, toBody, fat, _ks);
    for (let k = 0; k < PUSH_TRIES && _ks.over > 0; k++) {
      _a.x += side * _ks.over * 2;
      kneeSearch(fit, H, _a, side, toBody, fat, _ks);
    }
    const phi = _ks.phi;
    fit.phi[i] = phi;
    legReach(a, i, _a, _pole.set(side * Math.sin(phi), -0.1, Math.cos(phi)));
    // pied à plat dans l'étrier, talon un peu bas, pointe légèrement vers l'extérieur
    footTo(a, i, _q.setFromEuler(_e.set(-0.22, side * 0.28, 0)));
  }
  a.root.updateMatrixWorld(true);
  return need * sc;
}

/**
 * Enfoncement (m) de la jambe dans le cheval pour un genou écarté de phi : cuisse, genou, tibia, pied, avec leur
 * rayon, contre la carte des flancs (0 ou moins : rien ne traverse).
 */
function legPenetration(fit, H, A, side, phi, toBody, fat) {
  const L1 = LEG.thigh;
  const L2 = LEG.shin;
  _u.subVectors(A, H);
  const d = Math.min(L1 + L2 - 1e-4, Math.max(1e-3, _u.length()));
  _u.normalize();
  // genou : sur le cercle des positions possibles, du côté du pôle
  _pole.set(side * Math.sin(phi), -0.1, Math.cos(phi));
  _pole.addScaledVector(_u, -_pole.dot(_u)).normalize();
  const cosA = Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  _k.copy(H).addScaledVector(_u, L1 * cosA).addScaledVector(_pole, L1 * sinA);
  let worst = -Infinity;
  const sc = fit.sc;
  const test = (p, r) => {
    _p.copy(p).applyMatrix4(toBody);
    const w = widthAt(fit, _p.y, _p.z);
    if (w < 0) return;
    worst = Math.max(worst, (w - side * _p.x) * sc * fat + r + GAP);
  };
  for (const [seg, t, r] of SAMPLES) {
    if (seg === 0) _w.lerpVectors(H, _k, t);
    else _w.lerpVectors(_k, A, t);
    test(_w, r);
  }
  test(A, FOOT_R);
  return worst;
}
