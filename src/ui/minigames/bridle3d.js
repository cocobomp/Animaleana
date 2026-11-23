// Brider son cheval, en 3D : les trois étapes et la note du jeu dessiné (bridle.js), sur la vraie tête du cheval, avec
// SON filet (celui que le jeu va lui mettre : celui d'avant, ou un libre de la sellerie, dans sa couleur).
//
//   1. le mors : son licol est déjà enlevé ; il baisse la tête vers nous ; le filet est sur sa tête, la têtière
//      devant les oreilles, les montants un peu bas ; notre main tient l'anneau du mors sous ses lèvres. On touche le
//      coin de ses lèvres (là où il n'a pas de dents) : le mors y glisse, les montants remontent, il mâchonne. Devant
//      ses dents, il relève la tête et couche les oreilles ;
//   2. les oreilles : on touche une oreille, elle se plie vers l'avant et la têtière passe derrière elle ; puis
//      l'autre ; le frontal se pose ;
//   3. la sous-gorge : elle pend sous la gorge ; on la serre (🪢, ou le doigt sur sa gorge) en laissant un poing de
//      place. Trop serrée : 💢, il couche les oreilles et secoue la tête (elle garde la couleur du cuir).
//
// Les lanières (têtière, sous-gorge, montants, muserolle, frontal) sont posées sur la VRAIE peau de la tête (rayons
// sur la copie figée de la pose, 7 mm de marge) : plus de boucle rigide qui tourne et traverse la tête. Seuls les
// anneaux du mors (et les perles du frontal) viennent tels quels de l'équipement du jeu (gearModels.js).

import * as THREE from 'three';
import { justRule } from './grooming.js';
import { BRIDLE, throatVerdict } from './bridle.js';
import { freeBridle } from '../../sim/gear.js';
import { handModel, avatarHand } from '../../game/care/props.js';
import { nicker, snort } from './feed3d.js';
import { closeSleeve, v3, owner, rigidGear, impatience, stagePill, afterLife, smooth, dist2, pulseRing, updateRing, bakeSkin, skinPoint, earSkip, ribbon, gluePoint, skinNow } from './horse3dKit.js';

const PAUSE = 0.9;
const EAR_TIME = 0.8; // (s) une oreille qui se plie, la têtière qui passe derrière
const MARGIN = 0.007; // (m) les lanières au-dessus de la peau
const MARGIN_CROWN = 0.011; // (la nuque se plie avec l'encolure : un peu plus de place)
const DROP = 0.32; // (rad) les bouts de la têtière sous l'horizontale
const JOINT = 0.006; // (sous l'oreille, là où les lanières se rejoignent : encore un peu plus)
const ARC = 17; // points de la têtière (d'un montant à l'autre, par-dessus la tête)
const THROAT = 15; // points de la sous-gorge (d'un côté à l'autre, sous la gorge)
const CHEEK = 14; // points d'un montant
const NOSE = 22; // points de la muserolle (boucle)


/** Le filet que le jeu va lui mettre (Game.bridle → bridleUp). */
export function realBridle(profile, a, home = true) {
  let item = null;
  try {
    item = profile ? freeBridle(profile, a, { home }) : null;
  } catch {
    item = null;
  }
  item ??= a?.lastBridle?.item ?? 'bridle';
  const color = a?.lastBridle?.item === item ? a.lastBridle.color : undefined;
  return { item, color };
}

export function bridle3dGame(ctx) {
  const { a, t, fx } = ctx;
  const sc = ctx.scene;
  sc.decor.layout('rest');
  const name = a?.name ?? ctx.name;
  const who = { name, g: a?.sex };
  const own = owner();
  const md = sc.model;
  const head = md.head;
  const S = sc.double.scale;
  const L = sc.marks;
  const m = sc.mood;
  m.ears = 'forward';
  const T = BRIDLE.throat;
  const dims = md.dims ?? { hr: 0.11, snoutZ: 0.5, earZ: -0.05 };
  const hr = dims.hr ?? 0.11;
  const snout = dims.snoutZ ?? 0.5;
  const earZ = dims.earZ ?? -0.05;

  // ---------------------------------------------------------------- son filet
  // (les pièces du jeu : on garde les anneaux du mors et les perles du frontal ; les lanières sont refaites sur la
  // peau. Le hackamore garde sa muserolle en mouton et ses montants, sans mors)
  const real = realBridle(sc.game?.profile, a, sc.game?.isHome ?? true);
  const hack = real.item === 'hackamore';
  const gear = rigidGear(sc, { bridle: real });
  const root = new THREE.Group(); // (repère de la tête)
  root.name = 'bridle3d';
  head.add(root);
  const straps = [];
  const rings = [];
  const gems = [];
  const extras = [];
  for (const mesh of gear.meshes) {
    const geo = mesh.geometry;
    if (geo?.type === 'TorusGeometry') rings.push(mesh);
    else if (mesh.isMesh && !geo?.userData?.shared && geo?.type === 'BufferGeometry') straps.push(mesh);
    else if (geo?.type === 'SphereGeometry' && mesh.position.y > 0) gems.push(mesh);
    else extras.push(mesh);
  }
  // (ordre de gearModels.js : muserolle, têtière avec la sous-gorge, frontal, puis les montants)
  const leather = straps[1]?.material ?? straps[0]?.material ?? own(new THREE.MeshStandardMaterial({ color: 0x3b2110, roughness: 0.5 }));
  const keepRigid = hack ? [straps[0], ...straps.slice(3)].filter(Boolean) : [];
  for (const mesh of gear.meshes) mesh.visible = keepRigid.includes(mesh) || rings.includes(mesh) || extras.includes(mesh);
  // le mors (anneaux et ce qui va avec) : un groupe qui descend sous ses lèvres, puis remonte en place
  const bitGroup = new THREE.Group();
  root.add(bitGroup);
  for (const mesh of [...rings, ...extras]) bitGroup.add(mesh);
  const browGroup = new THREE.Group();
  root.add(browGroup);
  for (const mesh of gems) browGroup.add(mesh);
  for (const mesh of keepRigid) root.add(mesh);
  const BIT_DROP = v3(0, -hr * 0.3, hr * 0.06); // (tenu sous ses lèvres)

  // nos lanières
  const strapOf = (n, closed, nm) => {
    const r = ribbon(n, { hw: 0.011, th: 0.0045, closed });
    own(r.geo);
    const mesh = new THREE.Mesh(r.geo, leather);
    mesh.name = nm;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    mesh.frustumCulled = false;
    root.add(mesh);
    return { mesh, set: r.set, n };
  };
  const crownS = strapOf(ARC, false, 'bridle-crown');
  const throatS = strapOf(THROAT, false, 'bridle-throat');
  const browS = strapOf(9, false, 'bridle-brow');
  const noseS = hack ? null : strapOf(NOSE, true, 'bridle-nose');
  const cheekS = hack ? [] : [strapOf(CHEEK, false, 'bridle-cheek'), strapOf(CHEEK, false, 'bridle-cheek')];

  // Le mors (les anneaux, côté nous : x < 0 dans le repère de la tête — on voit son côté droit) et ses dents.
  const ringOf = (side) => (rings.length ? rings.reduce((p, q) => (side * q.position.x > side * p.position.x ? q : p)) : null);
  const ringNear = ringOf(-1);
  const ringFar = ringOf(1);
  const barLocal = ringNear ? ringNear.position.clone().add(v3(-0.004, 0, -0.01)) : v3(-hr * 0.5, -hr * 0.42, snout - hr * 0.8);
  const teethLocal = v3(-hr * 0.12, -0.13 * snout, snout * 0.99);
  const throatLocal = v3(-hr * 0.2, -hr * 0.9, earZ + hr * 0.4);
  // Son licol : enlevé dès le début (jamais deux harnachements l'un sur l'autre).
  const halter = (sc.double.gear?.userData?.meshes ?? []).filter((x) => x.parent === head && x.visible);
  for (const x of halter) x.visible = false;

  // ---------------------------------------------------------------- les mesures sur la peau (repère de la tête)
  const zCrown = earZ - hr * 0.15; // (derrière les oreilles, comme la têtière du jeu)
  const zFront = earZ + hr * 0.62; // (devant les oreilles, au-dessus des yeux)
  const yc = hr * 0.05;
  const TILT = 0.38;
  const dirOf = (ang, tilt) => v3(Math.cos(ang), Math.sin(ang) * Math.cos(tilt), -Math.sin(ang) * Math.sin(tilt));
  const P = {}; // chemins mesurés : { p: [], n: [] }
  /** Adoucit un chemin (les bouts ne bougent pas ; fermé : tous bougent) : plus de cassures entre deux rayons. */
  const soften = (path, passes = 2, closed = false) => {
    const n = path.p.length;
    for (let k = 0; k < passes; k++) {
      const p0 = path.p.map((x) => x.clone());
      const n0 = path.n.map((x) => x.clone());
      for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
        const a = (i - 1 + n) % n;
        const b = (i + 1) % n;
        path.p[i].copy(p0[i]).multiplyScalar(0.5).addScaledVector(p0[a], 0.25).addScaledVector(p0[b], 0.25);
        path.n[i].copy(n0[i]).multiplyScalar(0.5).addScaledVector(n0[a], 0.25).addScaledVector(n0[b], 0.25).normalize();
      }
    }
    return path;
  };
  const skipEar = earSkip(md);
  /**
   * Les points d'un chemin, chacun pris sur la peau par un rayon (guide : [point dans la tête, côté d'où vient le
   * rayon]). Un rayon qui ne touche rien (il passe dans une oreille) prend le milieu de ses voisins ; puis le chemin est
   * adouci, et chaque point reposé sur la peau, le long de sa normale, à `margin` de la peau.
   */
  const onSkin = (guides, margin = MARGIN, { closed = false, passes = 2, keepEnds = true, reach = 0.6 } = {}) => {
    const out = { p: [], n: [], miss: [], bone: [], glue: [], margin };
    for (const [c, d] of guides) {
      let h = skinPoint(sc, head, c, d, { margin, skip: skipEar, reach });
      // (un rayon qui passe pile entre deux triangles : on le décale un peu)
      if (h.miss) h = skinPoint(sc, head, c, d.clone().add(v3(0.013, 0.021, -0.017)), { margin, skip: skipEar, reach: reach * 1.3 });
      out.p.push(h.p);
      out.n.push(h.n);
      out.miss.push(!!h.miss);
      out.bone.push(h.bone ?? null);
      out.glue.push(h.glue ?? null);
    }
    const n = out.p.length;
    for (let i = 0; i < n; i++) {
      if (!out.miss[i]) continue;
      let a = i;
      let b = i;
      while (out.miss[a] && a > 0) a--;
      while (out.miss[b] && b < n - 1) b++;
      if (out.miss[a] && out.miss[b]) continue;
      if (out.miss[a]) a = b;
      if (out.miss[b]) b = a;
      const f = b === a ? 0 : (i - a) / (b - a);
      out.p[i].copy(out.p[a]).lerp(out.p[b], f);
      out.n[i].copy(out.n[a]).lerp(out.n[b], f);
      if (out.n[i].length() < 0.4) out.n[i].copy(guides[i][1]);
      out.n[i].normalize();
      out.bone[i] = out.bone[f < 0.5 ? a : b];
      out.glue[i] = null;
    }
    if (passes) soften(out, passes, closed);
    // (reposé sur la peau, le long de sa normale : l'adoucissement rentre un peu dans les bosses)
    for (let i = keepEnds && !closed ? 1 : 0; i < (keepEnds && !closed ? n - 1 : n); i++) {
      const h = skinPoint(sc, head, out.p[i].clone().addScaledVector(out.n[i], -0.03), out.n[i], { margin, skip: skipEar, reach: 0.12 });
      if (h.miss) continue;
      out.p[i].copy(h.p);
      out.n[i].lerp(h.n, 0.5).normalize();
      out.bone[i] = h.bone ?? out.bone[i];
      out.glue[i] = h.glue ?? null;
    }
    return pin(out);
  };
  /**
   * Chaque point est collé à la peau (le triangle touché par son rayon) : à chaque image, il est refait sur la peau
   * déformée (quand il baisse ou relève la tête, la peau de la gorge et de la nuque se plie, la lanière la suit au
   * lieu d'y rentrer). Les bouts gardés tels quels (sans colle) restent dans le repère de la tête.
   */
  function pin(path) {
    const n = path.p.length;
    path.glue ??= Array(n).fill(null);
    path.margin ??= MARGIN;
    return path;
  }
  const _g = { p: v3(), n: v3() };
  const _m = new THREE.Matrix4();
  const _sc = v3();
  /** Les points du chemin pour la pose de cette image (repère de la tête). skinNow avant. */
  function follow(path) {
    if (!path?.glue) return path;
    _m.copy(head.matrixWorld).invert();
    const k = path.margin / Math.max(0.2, head.getWorldScale(_sc).x);
    const n = path.p.length;
    for (let i = 0; i < n; i++) {
      const g = path.glue[i];
      if (!g) continue;
      gluePoint(g, _g);
      path.p[i].copy(_g.p).applyMatrix4(_m);
      path.n[i].copy(_g.n).transformDirection(_m);
      // (près des bouts, sous l'oreille, là où têtière, montant et sous-gorge se rejoignent comme à une boucle, la peau
      // bouge avec l'oreille : un peu plus de place)
      const end = Math.min(i, n - 1 - i);
      path.p[i].addScaledVector(path.n[i], k + (path.joint && end < 2 ? path.joint * (end === 0 ? 1 : 0.6) : 0));
    }
    return path;
  }
  /** Un chemin déjà sur la peau : adouci puis reposé (bouts gardés). */
  const onSkinPath = (path, margin = MARGIN) => {
    soften(path, 2);
    path.bone ??= Array(path.p.length).fill(null);
    path.glue ??= Array(path.p.length).fill(null);
    path.margin = margin;
    for (let i = 1; i < path.p.length - 1; i++) {
      const h = skinPoint(sc, head, path.p[i].clone().addScaledVector(path.n[i], -0.03), path.n[i], { margin, skip: skipEar, reach: 0.12 });
      if (h.miss) continue;
      path.p[i].copy(h.p);
      path.n[i].lerp(h.n, 0.5).normalize();
      path.bone[i] = h.bone ?? path.bone[i];
      path.glue[i] = h.glue ?? null;
    }
    return pin(path);
  };
  /** Un arc par-dessus la tête, du côté nous (angle π) à l'autre (0), dans le plan z (penché de tilt). */
  // (les bouts descendent un peu sous l'horizontale : la jonction avec les montants et la sous-gorge est sur le côté
  // de la tête, à l'écart du pli de la base de l'oreille)
  const arcAng = (i) => -DROP + (Math.PI + 2 * DROP) * (1 - i / (ARC - 1));
  const arcGuides = (z, tilt) => Array.from({ length: ARC }, (_, i) => [v3(0, yc, z), dirOf(arcAng(i), tilt)]);
  let measured = false;
  /** La têtière derrière les oreilles et le frontal, mesurés sur la pose du moment (la nuque se plie avec l'encolure). */
  function measureCrown() {
    P.back = onSkin(arcGuides(zCrown, TILT), MARGIN_CROWN, { keepEnds: false });
    P.back.joint = JOINT;
    if (P.front) {
      // (la têtière de devant part du même endroit que celle de derrière)
      for (const [i, j] of [[0, 0], [ARC - 1, ARC - 1]]) {
        P.front.p[i].copy(P.back.p[j]);
        P.front.n[i].copy(P.back.n[j]);
        P.front.glue[i] = P.back.glue[j];
      }
    }
    P.brow = onSkin(Array.from({ length: 9 }, (_, i) => {
      const ang = ((20 + (140 * i) / 8) * Math.PI) / 180;
      return [v3(0, hr * 0.15, earZ + hr * 0.3), v3(Math.cos(ang), Math.sin(ang), 0)];
    }), 0.006, { keepEnds: false });
    // (le frontal de notre côté vers le leur : du même sens que la têtière)
    P.brow.p.reverse();
    P.brow.n.reverse();
  }
  function measureHead() {
    if (measured) return;
    measured = true;
    bakeSkin(sc);
    measureCrown();
    // (devant les oreilles : les bouts descendent vers les côtés de la têtière, le milieu passe sur le front)
    P.front = onSkin(Array.from({ length: ARC }, (_, i) => {
      const ang = arcAng(i);
      const up = Math.max(0, Math.sin(ang));
      return [v3(0, yc, zCrown + (zFront - zCrown) * Math.sqrt(up)), dirOf(ang, TILT * (1 - Math.sqrt(up)))];
    }), MARGIN_CROWN, { keepEnds: false });
    // (les deux têtières partent du même endroit, sur le côté, sous l'oreille : là où les montants s'attachent)
    P.front.p[0].copy(P.back.p[0]);
    P.front.n[0].copy(P.back.n[0]);
    P.front.p[ARC - 1].copy(P.back.p[ARC - 1]);
    P.front.n[ARC - 1].copy(P.back.n[ARC - 1]);
    P.front.glue[0] = P.back.glue[0];
    P.front.glue[ARC - 1] = P.back.glue[ARC - 1];
    pin(P.front);
    P.front.joint = P.back.joint = JOINT;
    if (!hack) {
      P.nose = onSkin(Array.from({ length: NOSE }, (_, i) => {
        const ang = (Math.PI * 2 * i) / NOSE;
        return [v3(0, -hr * 0.2, snout - hr * 1.3), v3(Math.cos(ang), Math.sin(ang), 0)];
      }), 0.006, { closed: true });
      // les montants : du côté de la têtière à l'anneau, sur la joue (deux états du haut, deux états du bas)
      P.cheek = {};
      for (const [side, ring, end] of [[-1, ringNear, 0], [1, ringFar, ARC - 1]]) {
        // (le montant passe dans le haut de l'anneau, de notre côté de la joue)
        const ringAt = ring ? ring.position.clone().add(v3(0, hr * 0.2, 0)) : v3(side * hr * 0.6, -hr * 0.42, snout - hr * 0.8);
        // (chaque point du montant pris sur le côté de la face, à sa hauteur : la joue est plate, le montant aussi)
        const make = (top, topN, bottom) => {
          const c = onSkin(Array.from({ length: CHEEK }, (_, j) => {
            const q = top.clone().lerp(bottom, j / (CHEEK - 1));
            return [v3(0, q.y, q.z), v3(side, 0, 0)];
          }), MARGIN, { passes: 0 });
          c.p[0].copy(top);
          c.n[0].copy(topN);
          c.p[CHEEK - 1].copy(bottom);
          c.glue[0] = null;
          c.glue[CHEEK - 1] = null;
          // (adouci puis reposé : il ne rentre ni dans la joue ni dans les lèvres)
          return onSkinPath(c);
        };
        P.cheek[side] = {
          front0: make(P.front.p[end], P.front.n[end], ringAt.clone().add(BIT_DROP)),
          front1: make(P.front.p[end], P.front.n[end], ringAt),
          back1: make(P.back.p[end], P.back.n[end], ringAt),
        };
      }
    }
  }
  /** La sous-gorge, mesurée quand on y arrive (la gorge dépend de la pose de l'encolure). */
  let throatMeasured = false;
  function measureThroat() {
    if (throatMeasured) return;
    throatMeasured = true;
    bakeSkin(sc);
    measureCrown();
    // (de la têtière sous notre oreille, derrière la ganache, sous la gorge, jusqu'à l'autre côté : le bas du plan
    // part vers l'arrière, la lanière ne rentre pas dans la mâchoire)
    // (des rayons tout autour de la gorge, dans un plan juste derrière la ganache, depuis un point DANS la gorge :
    // ils prennent les côtés puis le dessous)
    // (la gorge est le creux entre l'arrière de la mâchoire et le devant de l'encolure : le plan penche vers l'avant
    // en bas, le centre est dans la gorge ; mesuré sur six gabarits : 6 à 9 mm de la peau tout du long)
    const cT = v3(0, -hr * 1.2, earZ + hr * 0.5);
    P.throat = onSkin(Array.from({ length: THROAT }, (_, i) => {
      const u = i / (THROAT - 1);
      if (i === 0 || i === THROAT - 1) return [v3(0, yc, zCrown), dirOf(Math.PI + Math.PI * u, 0)];
      const ang = Math.PI + 0.2 + (Math.PI - 0.4) * u;
      return [cT, dirOf(ang, 0.55)];
    }), MARGIN, { passes: 0, reach: 0.35 });
    // (les bouts : ceux de la têtière, qui est déjà en place)
    P.throat.p[0].copy(P.back.p[0]);
    P.throat.p[THROAT - 1].copy(P.back.p[ARC - 1]);
    P.throat.glue[0] = P.back.glue[0];
    P.throat.glue[THROAT - 1] = P.back.glue[ARC - 1];
    onSkinPath(P.throat);
    P.throat.joint = JOINT + MARGIN_CROWN - MARGIN;
  }

  // ---------------------------------------------------------------- les lanières à chaque image
  const tmpP = Array.from({ length: Math.max(ARC, THROAT, NOSE, CHEEK) }, () => v3());
  const tmpN = Array.from({ length: Math.max(ARC, THROAT, NOSE, CHEEK) }, () => v3());
  const mix = (A, B, w, n, lift = null) => {
    const pts = tmpP.slice(0, n);
    const nrm = tmpN.slice(0, n);
    for (let i = 0; i < n; i++) {
      const wi = typeof w === 'function' ? w(i) : w;
      pts[i].copy(A.p[i]).lerp(B.p[i], wi);
      nrm[i].copy(A.n[i]).lerp(B.n[i], wi).normalize();
      if (lift) pts[i].addScaledVector(nrm[i], lift(i, wi));
    }
    return [pts, nrm];
  };
  const DOWN = v3();
  const _off = v3();
  const _q = new THREE.Quaternion();
  /** k : le mors (0 sous les lèvres, 1 en place) ; side : la têtière passée derrière l'oreille [nous, eux] (0 à 1). */
  function poseStraps(k, side, throatSag) {
    if (!measured) return;
    bitGroup.position.copy(BIT_DROP).multiplyScalar(1 - k);
    skinNow(sc);
    head.updateWorldMatrix(true, false);
    for (const path of [P.front, P.back, P.throat, P.brow, P.nose]) follow(path);
    if (P.cheek) for (const sd of [-1, 1]) for (const key of ['front0', 'front1', 'back1']) follow(P.cheek[sd][key]);
    // la têtière : devant les oreilles, puis derrière (notre moitié d'abord) ; en passant, elle se soulève un peu
    const wOf = (i) => {
      const u = i / (ARC - 1); // 0 notre côté, 1 l'autre
      return u < 0.45 ? side[0] : u > 0.55 ? side[1] : (side[0] + side[1]) / 2;
    };
    crownS.set(...mix(P.front, P.back, wOf, ARC, (i, wi) => 0.04 * S * Math.sin(Math.PI * wi) * Math.sin((Math.PI * i) / (ARC - 1))));
    crownS.mesh.visible = true;
    browS.mesh.visible = side[0] > 0.98 && side[1] > 0.98;
    browGroup.visible = browS.mesh.visible;
    if (browS.mesh.visible) browS.set(P.brow.p, P.brow.n);
    if (noseS) {
      noseS.set(P.nose.p, P.nose.n);
      noseS.mesh.visible = true;
    }
    for (const [j, sd] of [[0, -1], [1, 1]]) {
      const c = cheekS[j];
      if (!c) continue;
      const C = P.cheek[sd];
      // (le haut du montant suit la têtière)
      const end = sd < 0 ? 0 : ARC - 1;
      for (const [cp, top] of [[C.front0, P.front], [C.front1, P.front], [C.back1, P.back]]) {
        cp.p[0].copy(top.p[end]);
        cp.n[0].copy(top.n[end]);
      }
      const [p0, n0] = mix(C.front0, C.front1, k, CHEEK);
      const A = { p: p0.map((x) => x.clone()), n: n0.map((x) => x.clone()) };
      c.set(...mix(A, C.back1, side[j], CHEEK));
      c.mesh.visible = true;
    }
    throatS.mesh.visible = throatSag !== null && throatMeasured;
    if (throatS.mesh.visible) {
      // (lâche, elle pend : vers le bas du monde, surtout au milieu)
      head.getWorldQuaternion(_q);
      DOWN.set(0, -1, 0).applyQuaternion(_q.invert());
      const [pts, nrm] = mix(P.throat, P.throat, 0, THROAT);
      // (vers le bas, et en s'écartant de la peau : sur les côtés de la ganache, elle ne glisse pas dans la joue)
      for (let i = 0; i < THROAT; i++) {
        const w = throatSag * Math.pow(Math.sin((Math.PI * i) / (THROAT - 1)), 1.4);
        pts[i].addScaledVector(_off.copy(DOWN).add(nrm[i]).normalize(), w);
      }
      throatS.set(pts, nrm);
    }
  }

  // ---------------------------------------------------------------- notre main
  // (la main tient l'anneau du mors par dessous, la paume vers le haut ; l'avant-bras et la manche montent vers nous
  // dans l'image)
  const hand = closeSleeve(handModel(own, { ...avatarHand(sc.game?.profile), grip: 0.55 }), own);
  const handK = 0.95 * Math.max(0.8, S);
  hand.scale.setScalar(handK);
  sc.scene.add(hand);
  const ring = pulseRing(own, { r: 0.03 * Math.max(0.8, S) });
  sc.scene.add(ring);

  // ---------------------------------------------------------------- état (la logique du jeu dessiné)
  let si = 0;
  let pause = 0;
  let annoyed = 0;
  let fuss = 0;
  let teethTaps = 0;
  let bitIn = false;
  let bitK = 0; // 0 tenu sous ses lèvres, 1 en place
  const earT = [-1, -1]; // temps depuis qu'on a touché l'oreille [la nôtre, l'autre] (-1 : pas encore)
  const earDone = [false, false];
  let throat = 0;
  let tightening = false;
  let zone = null;
  let rule = null;
  let chew = 0;
  const results = [];
  const step = () => BRIDLE.steps[si];
  const busy = impatience(sc, { after: 10 });
  const earSide = (i) => (earT[i] < 0 ? 0 : smooth(Math.min(1, Math.max(0, (earT[i] - 0.2) / (EAR_TIME - 0.3)))));
  const earFold = (i) => (earT[i] < 0 || earT[i] > EAR_TIME ? 0 : Math.sin((Math.PI * earT[i]) / EAR_TIME));

  ctx.stopButton(() => next());
  const quickBtn = ctx.opts?.quick
    ? ctx.button(t('mg_bridle_quick'), { onTap: () => { if (!ctx.done) { bitIn = true; earDone[0] = earDone[1] = true; throat = (T.lo + T.hi) / 2; ctx.finish(1, t('mg_bridle_end'), 'just'); } } })
    : null;

  /** La consigne d'une étape (le mors : la bouche du modèle ne s'ouvre pas, on ne le promet pas). */
  const stepHint = (st) => t(st === 'bit' ? 'mg_bridle_bit3d' : `mg_bridle_${st}`, who);
  function startStep(i) {
    si = i;
    const st = step();
    ctx.hint(stepHint(st));
    if (st === 'throat') measureThroat();
    if (st === 'ears' && measured) {
      bakeSkin(sc);
      measureCrown();
    }
    if (st !== 'ears') frameFor(st);
    busy.poke();
    if (st !== 'throat') return ctx.progress(0);
    if (quickBtn) quickBtn.remove();
    rule = justRule(ctx, { lo: T.lo, hi: T.hi, max: T.max, slack: T.hi - T.lo });
    ctx.button(`🪢 ${t('mg_seller_tighten')}`, { cls: 'primary', hold: true, onDown: () => { tightening = true; }, onUp: () => { tightening = false; } });
    ctx.progress(0);
  }

  function next() {
    if (ctx.done || pause > 0) return;
    if (step() !== 'throat') return ctx.hint(stepHint(step()), 'warn');
    tightening = false;
    results.push({ step: 'throat', value: throat, ...throatVerdict(throat) });
    finishAll();
  }

  function finishAll() {
    const q = results.reduce((n, r) => n + r.q, 0) / results.length;
    const worst = results.reduce((w, r) => (r.q < w.q ? r : w), results[0]);
    const just = results.every((r) => r.verdict === 'just');
    let msg;
    if (just) msg = t('mg_bridle_end');
    else if (worst.step === 'bit') msg = t('mg_deworm_teeth', who);
    else msg = t(worst.verdict === 'high' ? 'mg_bridle_tight' : 'mg_bridle_loose', who);
    ctx.finish(q, msg, just ? 'just' : worst.verdict);
    if (just) {
      nicker(sc);
      m.nod = 1;
    }
  }

  function showThroat() {
    ctx.progress(throat / T.max);
    const z = throat < T.lo ? 'low' : throat > T.hi ? 'high' : 'just';
    if (z === zone) return;
    zone = z;
    if (z === 'just') ctx.hint(t('mg_pressStop'), 'good');
    else if (z === 'high') {
      ctx.hint(t('mg_bridle_tight', who), 'warn');
      // (trop serrée : la lanière garde sa couleur, c'est lui qui le dit)
      const h = sc.project(W(throatAt()));
      fx.float(h.x + 18, h.y - 10, '💢', 22);
    }
  }

  // ---------------------------------------------------------------- où toucher (à l'écran)
  const W = (local) => head.localToWorld(local.clone());
  // (même serrée, elle enjambe le creux entre la mâchoire et l'encolure : un rien de mou)
  const sagOf = () => hr * 0.06 + hr * 0.5 * Math.max(0, 1 - throat / T.hi);
  /** Là où toucher pour serrer : le milieu de la sous-gorge, sinon sous la ganache. */
  const throatAt = () => {
    if (!P.throat) return throatLocal;
    const i = Math.floor(THROAT * 0.35);
    head.getWorldQuaternion(_q);
    const down = v3(0, -1, 0).applyQuaternion(_q.invert());
    return P.throat.p[i].clone().addScaledVector(down.add(P.throat.n[i]).normalize(), sagOf() * Math.pow(Math.sin((Math.PI * i) / (THROAT - 1)), 1.4));
  };
  const earTip = (i) => {
    const e = md.ears?.[i === 0 ? 1 : 0]; // (model.ears : [gauche, droite] ; celle de notre côté est la droite)
    return e ? e.localToWorld(v3(0, 0.1 * Math.max(0.7, S), 0)) : W(v3(0, hr * 1.2, earZ));
  };

  // ---------------------------------------------------------------- caméra
  // (toujours sur la tête telle qu'elle est, et une garde : si le bout du nez, une oreille ou la gorge sort de
  // l'image, on recadre)
  const nosePt = () => W(v3(0, -0.04 * snout, snout * 1.04));
  /** Où sera ce point quand il aura relevé la tête (il la baisse pour le mors : la caméra prépare la suite). */
  const risen = (p) => {
    if (!md.neck || lower < 0.01) return p;
    const o = md.neck.getWorldPosition(v3());
    const ax = v3(1, 0, 0).applyQuaternion(md.neck.getWorldQuaternion(new THREE.Quaternion()));
    return p.clone().sub(o).applyAxisAngle(ax, -0.16 * smooth(lower)).add(o);
  };
  const keyPts = (st) => {
    const pts = [nosePt(), W(v3(0, -hr * 0.3, snout * 0.95)), sc.live('poll') ?? L.poll, earTip(0), earTip(1), W(throatLocal)];
    if (st !== 'bit' && lower > 0.01) pts.push(...pts.map(risen));
    if (st === 'bit') pts.push(W(barLocal), W(teethLocal), W(barLocal.clone().add(BIT_DROP)).add(v3(0, -0.1 * S, 0)));
    if (st === 'ears') pts.push(earTip(0).add(v3(0, 0.12 * S, 0)), earTip(1).add(v3(0, 0.12 * S, 0)));
    if (st === 'throat') {
      pts.push(W(throatAt()).add(v3(0, -0.06 * S, 0)));
      if (P.throat) pts.push(W(P.throat.p[Math.floor(THROAT / 2)]).add(v3(0, -0.07 * S, 0)), W(P.throat.p[2]));
    }
    return pts;
  };
  function frameFor(st, now = false) {
    sc.holder.updateMatrixWorld(true);
    if (st === 'bit') sc.frame(keyPts(st), { dir: [0.75, 0.12, 1], pad: 1.26, now });
    else if (st === 'ears') sc.frame(keyPts(st), { dir: [0.62, 0.3, 1], pad: 1.3, now, half: 0.3 });
    else {
      // (la sous-gorge : de côté et un peu par-dessous, dans le repère de la tête — de face, la joue la cachait)
      const d = v3(-0.9, -0.28, 0.4).normalize().applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
      d.y = Math.max(-0.2, d.y);
      sc.frame(keyPts(st), { dir: d.normalize().toArray(), pad: 1.26, now, half: 0.3 });
    }
  }
  let guard = 0;
  /** Ce qui doit rester dans l'image : le bout du nez, les oreilles, (la gorge). */
  const mustSee = (st) => [nosePt(), earTip(0), earTip(1), ...(st === 'throat' ? [W(throatAt())] : [])];
  function keepInView(dt) {
    guard -= dt;
    if (guard > 0 || !sc.settled(0.05)) return;
    guard = 1;
    const v = ctx.view;
    const pad = 2;
    for (const p of mustSee(step())) {
      const q = sc.project(p);
      if (q.behind || q.x < v.x0 + pad || q.x > v.x1 - pad || q.y < v.y0 + pad || q.y > v.y1 - pad) {
        frameFor(step());
        return;
      }
    }
  }

  // ---------------------------------------------------------------- la pose : oreilles pliées, tête baissée
  let lower = 0; // (il baisse la tête vers nous pour qu'on lui mette le filet, tant que le mors n'est pas entré)
  let framedLow = false;
  const earScale = (md.ears ?? []).map((e) => e.scale.y);
  const unhook = afterLife(sc, (dt) => {
    lower += ((step() === 'bit' && annoyed <= 0 ? 1 : 0) - lower) * Math.min(1, dt * 2.5);
    if (lower > 0.01 && md.neck) md.neck.rotateX(0.16 * smooth(lower));
    if (annoyed > 0 && md.neck) md.neck.rotateX(-0.28 * smooth(Math.min(1, annoyed)));
    // (une oreille se plie vers l'avant, un peu aplatie, le temps que la têtière passe derrière)
    for (let i = 0; i < 2; i++) {
      const e = md.ears?.[i === 0 ? 1 : 0];
      if (!e) continue;
      const f = earFold(i);
      if (f > 0) e.rotateX(0.5 * f);
      e.scale.y = earScale[i === 0 ? 1 : 0] * (1 - 0.15 * f);
    }
    if (fuss > 0 && md.head) md.head.rotateZ(Math.sin(sc.time * 18) * 0.06 * fuss);
    // (les lanières, sur la pose de cette image)
    if (sc.ready) measureHead();
    poseStraps(smooth(bitK), [earSide(0), earSide(1)], step() === 'throat' ? sagOf() : null);
  });

  startStep(0);
  frameFor('bit', true);

  return {
    peek: () => ({
      step: step(), si, annoyed, throat, tightening, bitIn, crown: (earSide(0) + earSide(1)) / 2, pause, teethTaps, lo: T.lo, hi: T.hi,
      earDone: [...earDone], results: results.map((r) => ({ ...r })),
      bar: sc.project(W(barLocal)), teeth: sc.project(W(teethLocal)), ears: [0, 1].map((i) => sc.project(earTip(i))),
      nose: sc.project(nosePt()), hand: hand.visible ? sc.project(hand.position) : null,
      throatSpot: sc.project(W(throatAt())), halterHidden: halter.every((x) => !x.visible),
      sag: throatS.mesh.visible ? sagOf() : -1, measured, item: real.item,
    }),
    /** Les chemins mesurés sur la peau, repère de la tête (pour les essais). */
    paths: () => P,
    /** Nos lanières (pour les essais) : { nom: mesh }. */
    straps: () => ({ crown: crownS.mesh, throat: throatS.mesh, brow: browS.mesh, nose: noseS?.mesh ?? null, cheeks: cheekS.map((c) => c.mesh) }),
    down(p) {
      if (ctx.done || pause > 0) return;
      busy.poke();
      const st = step();
      if (st === 'bit') {
        const bar = sc.project(W(barLocal));
        const teeth = sc.project(W(teethLocal));
        const dBar = dist2(p, bar);
        const dTeeth = dist2(p, teeth);
        if (dBar < 44 && dBar <= dTeeth + 6) {
          bitIn = true;
          chew = 2.4;
          results.push({ step: 'bit', value: teethTaps, q: [1, 0.7][teethTaps] ?? 0.4, verdict: teethTaps ? 'low' : 'just' });
          ctx.progress(1);
          ctx.hint(t('mg_bridle_bitIn3d', who), 'good');
          // (le mot reste dans l'image, même quand la bouche est près du bord)
          const v = ctx.view;
          fx.text(Math.min(v.x1 - 80, Math.max(v.x0 + 80, bar.x)), bar.y - 40, `✓ ${t('mg_bridle_stage_bit')}`, '#2f8a5f', 26);
          pause = PAUSE;
          // (la caméra part déjà vers les oreilles, en tenant compte de la tête qui se relève)
          frameFor('ears');
        } else if (dTeeth < 52) {
          teethTaps++;
          annoyed = 1;
          m.annoyed = 1.2;
          const h = sc.project(sc.live('poll') ?? L.poll);
          fx.float(h.x, h.y - 20, '💢', 22);
          ctx.hint(t('mg_deworm_teeth', who), 'warn');
          snort(sc);
        }
        return;
      }
      if (st === 'ears') {
        let best = -1;
        let bd = 58;
        // (toute l'oreille compte, de sa base à sa pointe : elle bouge, un doigt d'enfant n'est pas pile sur la pointe)
        const earDist = (i) => {
          const e = md.ears?.[i === 0 ? 1 : 0];
          const tip = earTip(i);
          const base = e ? e.getWorldPosition(v3()) : tip;
          let d = Infinity;
          for (const f of [0.2, 0.5, 0.8, 1]) d = Math.min(d, dist2(p, sc.project(base.clone().lerp(tip, f))));
          return d;
        };
        for (let i = 0; i < 2; i++) {
          const d = earDist(i);
          if (!earDone[i] && d < bd) {
            bd = d;
            best = i;
          }
        }
        if (best < 0) return;
        earDone[best] = true;
        earT[best] = 0;
        const at = sc.project(earTip(best));
        fx.burst(at.x, at.y, '✨', 2, { speed: 60, size: 14 });
        const n = earDone.filter(Boolean).length;
        ctx.progress(n / 2);
        if (n < 2) return;
        results.push({ step: 'ears', value: 2, q: 1, verdict: 'just' });
        fx.text(at.x, at.y - 30, `✓ ${t('mg_bridle_stage_ears')}`, '#2f8a5f', 26);
        pause = Math.max(PAUSE, EAR_TIME + 0.2);
        return;
      }
      if (dist2(p, sc.project(W(throatAt()))) < 60) tightening = true;
    },
    up() {
      if (step() === 'throat') tightening = false;
    },
    key(code, isDown) {
      if (code === 'Enter' || code === 'NumpadEnter') {
        if (isDown) next();
        return;
      }
      if (code === 'Space' && step() === 'throat' && pause <= 0) tightening = isDown;
    },
    update(dt) {
      annoyed = Math.max(0, annoyed - dt);
      for (let i = 0; i < 2; i++) if (earT[i] >= 0) earT[i] += dt;
      if (bitIn) bitK = Math.min(1, bitK + dt / 0.55);
      chew = Math.max(0, chew - dt);
      fuss = Math.max(0, fuss - dt * 1.5);
      // il mâchonne son mors, il regarde la main qui tient le filet ; impatient si on traîne
      m.chew = Math.max(chew > 0 ? 1 : 0, m.chew - dt);
      const st = step();
      const fidget = busy.update(dt, tightening || pause > 0 || ctx.done);
      if (!fidget) m.lift = null;
      if (annoyed > 0) m.ears = 'back';
      else if (!(st === 'throat' && throat > T.hi)) m.ears = 'forward';
      m.look = hand.position;
      m.lookAmt = st === 'bit' ? 0.2 : 0;
      // (la tête baissée vers nous : on recadre une fois, en douceur, sur sa tête telle qu'elle est)
      if (st === 'bit' && !framedLow && lower > 0.92) {
        framedLow = true;
        frameFor('bit');
      }
      keepInView(dt);
      // la main : elle tient l'anneau du mors (de notre côté) par dessous et l'accompagne quand il entre ; puis elle
      // s'en va (on touche les oreilles, on serre la sous-gorge)
      hand.visible = !ctx.done && st === 'bit' && bitK < 1 && measured;
      if (hand.visible && ringNear) {
        const at = ringNear.getWorldPosition(v3());
        const toCam = sc.camera.position.clone().sub(at).normalize();
        // (le bras vient de notre côté, d'en bas et de devant : on voit le poignet et la manche)
        const from = at.clone().addScaledVector(toCam, 0.3).add(v3(0, -0.3, 0));
        const x = at.clone().sub(from).normalize();
        const z = new THREE.Vector3().crossVectors(x, v3(0, 1, 0)).normalize();
        const y = new THREE.Vector3().crossVectors(z, x).normalize();
        hand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
        // (l'anneau dans le creux des doigts : un peu au-delà de la paume, au-dessus d'elle)
        hand.position.copy(at).addScaledVector(x, -0.05 * handK).addScaledVector(y, -0.022 * handK);
      }
      // la cible : le coin des lèvres, puis les oreilles
      ring.visible = !ctx.done && pause <= 0 && sc.ready && !(st === 'throat' && (tightening || throat > 0));
      if (ring.visible) updateRing(ring, sc, ctx.time, st === 'bit' ? W(barLocal) : st === 'ears' ? earTip(earDone[0] ? 1 : 0) : W(throatAt()));
      if (pause > 0) {
        pause -= dt;
        if (pause <= 0) {
          pause = 0;
          if (!ctx.done) startStep(si + 1);
        }
        return;
      }
      if (ctx.done || st !== 'throat') return;
      if (tightening) {
        throat = Math.min(T.max, throat + T.rate * dt);
        if (throat > 0.95) {
          if (fuss <= 0.2) {
            const h = sc.project(sc.live('poll') ?? L.poll);
            fx.float(h.x + 20, h.y - 30, '💢', 20);
            snort(sc);
          }
          fuss = 1;
        }
      }
      if (throat > T.hi) m.ears = 'back';
      showThroat();
    },
    draw(g) {
      if (!sc.ready) return;
      const st = step();
      if (rule && st === 'throat') rule.dial(g, throat, 354, ctx.view.y0 + 56);
      // (la pastille en bas : en haut, elle se posait sur les oreilles et sur leur cible)
      stagePill(g, si, BRIDLE.steps.length, t(`mg_bridle_stage_${st}`), ctx.view.y1 - 42);
    },
    destroy() {
      unhook();
      (md.ears ?? []).forEach((e, i) => {
        e.scale.y = earScale[i];
      });
      root.parent?.remove(root);
      gear.dispose();
      for (const x of halter) x.visible = true;
      sc.scene.remove(hand, ring);
      own.free();
    },
  };
}
