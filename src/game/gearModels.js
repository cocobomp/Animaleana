// Équipement visible sur l'animal en 3D : couverture, selle, filet, licol, guêtres, bonnet, collier.
// Sur le cheval, les pièces épousent le corps sculpté (champ de distance) : sangle sous le ventre,
// muserolle autour du nez, couverture posée sur le dos. Chaque modèle du catalogue de la sellerie
// (src/sim/gear.js) a sa forme et sa couleur : selle d'obstacle aux quartiers en avant, selle western
// avec sa corne et ses fenders, hackamore sans mors, couverture imperméable brillante…

import * as THREE from 'three';
import { BLANKET_COLORS, COLORS, GEAR } from '../sim/gear.js';
import { loft } from './models/shapes.js';
import { rayHit, sdfNormal } from './models/sdf.js';
import { SADDLE_STYLES, TACK_PARTS, flapOutline } from './models/tackModels.js';
import { shellGeometry } from './models/ruminantGear.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const mat = (color, roughness = 0.7, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const LEATHER = 0x2a1a10;
const METAL = { metalness: 0.85 }; // métal brillant (boucles, étriers, anneaux)
const STEEL = 0xc8c8cc;

/**
 * Boucle de points autour d'une forme sculptée, dans un plan z = c.z (incliné de tilt autour de x).
 * Angles : 0 = côté +x, π/2 = dessus, -π/2 = dessous. out = décalage le long de la normale.
 */
function loop(sdf, c, n, out, a0 = 0, a1 = Math.PI * 2, tilt = 0, maxDist = 1.2) {
  const pts = [];
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / (n - 1);
    const dir = [Math.cos(a), Math.sin(a) * ct, -Math.sin(a) * st];
    const p = rayHit(sdf, c, dir, maxDist);
    pts.push(p.addScaledVector(sdfNormal(sdf, p, 0.004), out));
  }
  return pts;
}

/**
 * Boucle posée sur la vraie peau de la tête (sdf.skin : rayons contre ses triangles au repos, horseReal.js headSkin) :
 * même plan et mêmes angles que loop(), le point de la peau le plus loin de c sur chaque rayon, écarté de out (en m,
 * ou fonction de l'angle) le long de sa normale, puis lissée sans jamais se rapprocher de la peau. Sans peau mesurée
 * (cheval sculpté, cheval GLB), la forme approchée (loop). (Posée sur la forme approchée — coupes tous les 2,5 cm —,
 * la muserolle rentrait dans le chanfrein bombé des traits et la sous-gorge dans les ganaches.)
 */
function skinRing(sdf, c, n, out, a0 = 0, a1 = Math.PI * 2, tilt = 0, maxDist = 1.2, halfWidth = 0, first = false) {
  const outAt = typeof out === 'function' ? out : () => out;
  // (tilt : un angle, ou une fonction de l'angle autour de la boucle — la têtière penche plus en avant sous la gorge)
  const tiltOf = typeof tilt === 'function' ? tilt : () => tilt;
  const C = new THREE.Vector3(...c);
  const dirs = [];
  const rad = [];
  // (boucle fermée : n points différents, le premier n'est pas répété à la fin — répété, la sangle se tordait à la
  // jonction, sur le côté de la tête)
  const closed = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
  const angle = (i) => a0 + ((a1 - a0) * i) / (closed ? n : n - 1);
  for (let i = 0; i < n; i++) {
    const a = angle(i);
    const ti = tiltOf(a);
    const d = new THREE.Vector3(Math.cos(a), Math.sin(a) * Math.cos(ti), -Math.sin(a) * Math.sin(ti));
    dirs.push(d);
    // (une sangle plate a sa largeur de part et d'autre du plan de la boucle : ses deux bords aussi hors de la peau)
    const pn = new THREE.Vector3(0, Math.sin(ti), Math.cos(ti));
    const centers = halfWidth ? [C, C.clone().addScaledVector(pn, halfWidth), C.clone().addScaledVector(pn, -halfWidth)] : [C];
    if (!sdf.skin) {
      const p = rayHit(sdf, c, d.toArray(), maxDist);
      rad.push(p.addScaledVector(sdfNormal(sdf, p, 0.004), outAt(a)).sub(C).dot(d));
      continue;
    }
    let r = null;
    for (const o of centers) {
      const v = skinRadius(sdf.skin, o, d, outAt(a), maxDist, first);
      if (v !== null) r = Math.max(r ?? -Infinity, v);
    }
    rad.push(r);
  }
  // (rayon sans peau — un trou à la base d'une oreille — : celui des voisins)
  for (let i = 0; i < n; i++) {
    if (rad[i] !== null) continue;
    let k = 1;
    let v = null;
    while (v === null && k < n) {
      const l = closed ? rad[(i - k + n) % n] : rad[Math.max(0, i - k)];
      const r = closed ? rad[(i + k) % n] : rad[Math.min(n - 1, i + k)];
      v = l !== null && r !== null ? (l + r) / 2 : l ?? r;
      k++;
    }
    rad[i] = v ?? 0.05;
  }
  // (lissée vers l'extérieur seulement : une sangle tendue ne suit pas chaque creux de la peau, et n'y entre jamais)
  for (let pass = 0; pass < 2; pass++) {
    const r0 = rad.slice();
    for (let i = 0; i < n; i++) {
      const l = closed ? r0[(i - 1 + n) % n] : r0[Math.max(0, i - 1)];
      const r = closed ? r0[(i + 1) % n] : r0[Math.min(n - 1, i + 1)];
      rad[i] = Math.max(r0[i], (l + 2 * r0[i] + r) / 4);
    }
  }
  const pts = dirs.map((d, i) => C.clone().addScaledVector(d, rad[i]));
  // (et jamais plus près de la peau que out, même là où elle déborde entre deux rayons — la base d'une oreille contre la
  // têtière : ses deux bords aussi, la sangle déplacée d'autant)
  if (sdf.skin?.clear) {
    const zA = new THREE.Vector3(0, 0, 1);
    const side = new THREE.Vector3();
    const tg = new THREE.Vector3();
    const at = (i) => pts[closed ? (i + n) % n : Math.min(n - 1, Math.max(0, i))];
    const clearAll = () => pts.forEach((p, i) => {
      const want = outAt(angle(i));
      if (halfWidth) {
        tg.subVectors(at(i + 1), at(i - 1)).normalize();
        side.copy(zA).addScaledVector(tg, -tg.dot(zA)).normalize();
        const push = new THREE.Vector3();
        for (const e of [1, -1]) {
          const q = p.clone().addScaledVector(side, e * halfWidth);
          const q0 = q.clone();
          sdf.skin.clear(q, want);
          const dq = q.sub(q0);
          if (dq.lengthSq() > push.lengthSq()) push.copy(dq);
        }
        p.add(push);
      }
      sdf.skin.clear(p, want);
    });
    clearAll();
    // (puis lissée et reposée, trois fois : écartée point par point de la base des oreilles, la têtière faisait des
    // marches et des zigzags sur la nuque et sous la gorge)
    for (let pass = 0; pass < 3; pass++) {
      const q = pts.map((p) => p.clone());
      for (let i = 0; i < n; i++) {
        if (!closed && (i === 0 || i === n - 1)) continue;
        pts[i].copy(q[closed ? (i - 1 + n) % n : i - 1]).add(q[closed ? (i + 1) % n : i + 1]).multiplyScalar(0.25).addScaledVector(q[i], 0.5);
      }
      clearAll();
    }
  }
  return pts;
}

/** Distance le long de d depuis o où poser une sangle à out de la vraie peau (null : pas de peau de ce côté). */
function skinRadius(skin, o, d, out, maxDist, first = false) {
  const hit = skin.ray(o, d, maxDist, first);
  return hit ? hit.t + out / Math.max(0.35, hit.n.dot(d)) : null;
}

/** Point de la vraie peau de la tête dans la direction d depuis c, écarté de out (forme approchée sans peau mesurée). */
function skinPoint(sdf, c, d, out, maxDist = 1, first = false) {
  const hit = sdf.skin?.ray(new THREE.Vector3(...c), d, maxDist, first);
  if (hit) return hit.p.addScaledVector(hit.n, out);
  const p = rayHit(sdf, c, d, maxDist);
  return p.addScaledVector(sdfNormal(sdf, p, 0.004), out);
}

/**
 * Retourne les faces d'un tube de loft() (ses faces regardent vers l'intérieur) : sans ça, on voit la
 * paroi du fond (un siège de selle devient deux arcs fins, une sangle paraît creuse).
 */
function solid(geo) {
  const idx = geo.index;
  for (let i = 0; i < idx.count; i += 3) {
    const b = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, b);
  }
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return geo;
}

/**
 * Sangle plate qui suit une liste de points (fermée si closed). side : direction de sa largeur (rabattue
 * perpendiculairement à la sangle) ; [0, 0, 1] pour une boucle autour de la tête ou du corps, la largeur le long de
 * l'axe : elle est à plat sur la peau. Pour une sangle qui court le long de la tête (montant), [0, 1, 0] : avec [0, 0, 1],
 * presque le long d'elle, sa largeur se tournait vers la peau et la sangle était posée sur la tranche — sa moitié
 * dans la joue, l'autre dressée (un bâton, un point rouge qui sortait de la joue).
 */
function strap(pts, halfWidth, thick, closed = false, side = [0, 0, 1]) {
  // (boucle fermée : le tour une fois, revenu au premier point, puis le dernier anneau soudé au premier. Avant, le tube
  // repassait sur ses deux premiers segments : deux tubes l'un dans l'autre, un peu tournés, un cran clair sur la têtière.)
  const list = closed ? [...pts, pts[0]] : pts;
  const geo = solid(loft(list.map((p) => ({ p: [p.x, p.y, p.z], rx: halfWidth, ry: thick })), {
    radial: 6, sub: 2, side, capStart: !closed, capEnd: !closed,
  }));
  if (closed) {
    const W = 7;
    const last = (geo.userData.frame.rings.length - 1) * W;
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const v = new THREE.Vector3();
    for (let j = 0; j < W; j++) {
      pos.setXYZ(last + j, pos.getX(j), pos.getY(j), pos.getZ(j));
      v.set(nrm.getX(j) + nrm.getX(last + j), nrm.getY(j) + nrm.getY(last + j), nrm.getZ(j) + nrm.getZ(last + j)).normalize();
      nrm.setXYZ(j, v.x, v.y, v.z);
      nrm.setXYZ(last + j, v.x, v.y, v.z);
    }
  }
  return geo;
}

/**
 * Nappe posée sur une forme : grille (z, angle) de points pris sur la surface, décalés de out.
 * Sert à la couverture, au tapis de selle et au bonnet anti-mouches.
 */
function shell(sdf, yc, z0, z1, nz, a0, a1, na, out, tilt = 0, drape = 0) {
  const pos = [];
  const uv = [];
  const idx = [];
  const rows = [];
  for (let i = 0; i < nz; i++) {
    const z = z0 + ((z1 - z0) * i) / (nz - 1);
    rows.push(loop(sdf, [0, yc, z], na, out, a0, a1, tilt));
  }
  // Bord arrière qui tombe (drape : nombre de rangées) : il ne se referme pas sur la pointe des fesses,
  // chaque rangée reste au moins aussi loin de l'axe que la suivante, moins une pente douce. Sans ça, le
  // bord rentrait dans la croupe et la peau de la hanche passait par-dessus le tissu.
  for (let i = drape - 1; i >= 0; i--) {
    const dz = Math.abs(rows[i + 1][0].z - rows[i][0].z);
    for (let j = 0; j < na; j++) {
      const p = rows[i][j];
      const q = rows[i + 1][j];
      const r = Math.hypot(p.x, p.y - yc);
      const want = Math.hypot(q.x, q.y - yc) - 0.35 * dz;
      if (r >= want || r < 1e-6) continue;
      const k = want / r;
      p.x *= k;
      p.y = yc + (p.y - yc) * k;
    }
  }
  for (let i = 0; i < nz; i++) {
    for (let j = 0; j < na; j++) {
      pos.push(rows[i][j].x, rows[i][j].y, rows[i][j].z);
      uv.push(j / (na - 1), i / (nz - 1));
    }
  }
  for (let i = 0; i < nz - 1; i++) {
    for (let j = 0; j < na - 1; j++) {
      const a = i * na + j;
      const b = a + na;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Ajoute l'équipement de l'animal sur son modèle. Renvoie le groupe créé (à retirer pour changer). */
export function buildGear(model, look, gear = {}) {
  const group = new THREE.Group();
  const holders = [];
  const L = look.bodyLen;
  const R = look.bodyR * (look.fluff ?? 1);
  const y0 = model.y0;
  const add = (parent, geo, material, pos, rot, scale) => {
    const m = new THREE.Mesh(geo, material);
    if (pos) m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    if (scale) m.scale.set(...scale);
    m.castShadow = true;
    parent.add(m);
    holders.push(m);
    return m;
  };
  // Cheval réaliste : pièce liée au squelette (elle suit hanches, épaules, respiration) à la place de la
  // pièce rigide posée sur le groupe body.
  add.skin = (mesh) => {
    if (!model.skinGear) return mesh;
    const sk = model.skinGear(mesh);
    holders[holders.indexOf(mesh)] = sk;
    return sk;
  };
  // Un petit groupe tout fait (ex. un étrier du catalogue) : ses pièces sont partagées, on le retire en bloc.
  add.group = (parent, obj) => {
    parent.add(obj);
    holders.push(obj);
    return obj;
  };
  if (model.sdf) buildHorseGear(model, look, gear, add);
  else if (model.gearFit) buildHorseGear(model.gearFit, look, gear, add); // cheval GLB (src/game/models/gltfHorseFit.js)
  else if (model.dogFit) buildDogGear(model, gear, add); // chien réaliste (src/game/models/dogReal.js)
  else if (model.headFit) buildRuminantGear(model, gear, add); // vache, taureau, veau, chèvre réalistes
  else buildGenericGear(model, look, gear, add, L, R, y0);
  group.userData.meshes = holders;
  // (lignes du milieu des sangles de la tête — muserolle, têtière, montants —, repère de la tête : tests)
  if (add.headLines) group.userData.headLines = add.headLines;
  // Où s'attachent les rênes (anneaux du mors, ou côtés de la muserolle du hackamore) : Player les tend
  // jusqu'aux mains du cavalier. { parent, points (repère du parent), color }.
  if (add.reins) group.userData.reins = add.reins;
  if (add.saddle) group.userData.saddle = add.saddle;
  if (add.surcingle) group.userData.surcingle = add.surcingle; // voltige : poignées et anneaux (src/game/Vaulting.js)
  return group;
}

// ------------------------------------------------------------------ cheval

/** Couleur (hex) d'un objet porté : sa couleur choisie, sinon la première du modèle. */
function gearColor(entry, fallback) {
  const def = GEAR[entry?.item];
  const key = def?.colors?.includes(entry?.color) ? entry.color : def?.colors?.[0];
  return COLORS[key] ?? BLANKET_COLORS[entry?.color] ?? fallback;
}

function buildHorseGear(model, look, gear, add) {
  const { torso, head } = model.sdf;
  const { L, R, hr, snoutZ, earZ } = model.dims;
  const y0 = model.y0;
  const body = model.body;
  const PI = Math.PI;
  const deg = (d) => (d * PI) / 180;
  const P = TACK_PARTS;
  // (cheval réaliste : toupet rentré sous le bonnet anti-mouches, sorti quand on l'enlève — horseReal.js)
  model.setForelockTucked?.(!!gear.head);

  const blanket = gear.blanket;
  if (blanket) {
    // Couverture : du garrot à la queue, retombant sur les flancs ; liseré devant.
    // Hiver : matelassée avec un col en mouton ; imperméable : brillante ; chemise d'été : filet clair.
    const id = blanket.item;
    const color = gearColor(blanket, BLANKET_COLORS.red);
    const cloth = id === 'blanketSummer' ? P.netMat(color) : id === 'blanketRain' ? P.rainMat(color) : P.quiltMat(color);
    // (cheval réaliste : étendue mesurée sur son corps, du garrot à la pointe des fesses)
    const [bz0, bz1] = model.dims.blanket ?? [-L * 0.52, L * (id === 'blanketSummer' ? 0.34 : 0.3)];
    const front = bz1 + (model.dims.blanket && id === 'blanketSummer' ? 0.04 : 0);
    // (cheval réaliste : liée au squelette, add.skin ; un peu plus écartée sur la croupe et les flancs)
    // (9 mm : au galop d'un petit poney, la hanche passait encore à travers par endroits avec 6 mm)
    const gap = model.skinGear ? 0.009 : 0;
    const dense = model.skinGear ? 1.5 : 1; // (grille plus fine : moins de cordes sous les bosses de la peau)
    add.skin(add(body, shell(torso, y0 - R * 0.2, bz0, front, Math.round(12 * dense), deg(192), deg(-12), Math.round(20 * dense), (id === 'blanket' ? 0.016 : 0.011) + gap, 0, model.skinGear ? 3 : 0), cloth));
    const edge = loop(torso, [0, y0 - R * 0.2, front], 20, 0.018 + gap, deg(192), deg(-12));
    add.skin(add(body, strap(edge, 0.018, 0.006), id === 'blanket' ? P.fleeceMat(0xe8e0d2) : P.clothMat(id === 'blanketSummer' ? 0x3a3a3a : 0xf2ede4)));
    // Galon le long du bas des flancs.
    for (const sd of [1, -1]) {
      const hem = [];
      for (let i = 0; i <= 10; i++) {
        const z = bz0 + 0.02 + (i / 10) * (front - bz0 - 0.04);
        const p = rayHit(torso, [0, y0 - R * 0.2, z], [sd * Math.cos(deg(-12)), Math.sin(deg(-12)), 0], 1.2);
        hem.push(p.addScaledVector(sdfNormal(torso, p, 0.004), 0.016 + gap));
      }
      add.skin(add(body, strap(hem, 0.014, 0.004), P.clothMat(id === 'blanketSummer' ? 0x3a3a3a : 0xf2ede4)));
    }
    // Sangle de poitrail et sous-ventrières croisées.
    add.skin(add(body, strap(loop(torso, [0, y0 - R * 0.2, model.dims.zGirth ?? L * 0.02], 16, (model.skinGear ? 0.03 : 0.018) + gap, deg(-15), deg(-165)), 0.014, 0.004), P.nylonMat(0x2a2a2a)));
  }

  // Tapis de voltige : épais, du garrot aux reins (sous le surfaix, ou sous une selle) ; voir horseVaultPad.
  const vaultPadT = gear.pad?.item === 'vaultPad' ? horseVaultPad(model, gear, add) : 0;
  if (gear.saddle) horseSaddle(model, gear, add);
  else if (gear.pad && !vaultPadT) horsePad(model, gear, add, SADDLE_STYLES.saddle); // tapis seul (sans selle) : il se voit
  if (gear.surcingle && !gear.saddle) horseSurcingle(model, gear, add, vaultPadT);

  const bridle = gear.bridle;
  const halter = gear.halter && !bridle;
  if (bridle || halter) {
    const hid = halter ? gear.halter.item : null;
    const bid = bridle ? bridle.item : null;
    const rope = hid === 'halterRope';
    const leatherHalter = hid === 'halterLeather';
    const color = bridle ? gearColor(bridle, LEATHER) : gearColor(gear.halter, BLANKET_COLORS.red);
    const strapMat = bridle || leatherHalter ? P.leatherMat(color) : P.nylonMat(color);
    const metal = leatherHalter ? P.brassMat() : P.steelMat();
    const w = rope ? 0.006 : halter ? 0.0125 : 0.011; // demi-largeur des sangles (le licol est en toile plus large)
    const th = rope ? 0.006 : 0.0045;
    // Corde ronde (licol éthologique) ou sangle plate ; une boucle fermée ne répète pas son premier point.
    // (les boucles de skinRing ne répètent pas leur premier point)
    const band = (pts, closed = false, side = [0, 0, 1]) => (rope ? P.tube(pts.map((v) => v.toArray()), 0.005, closed, 6) : strap(pts, w, th, closed, side));
    const yc = -hr * 0.2;
    // Lignes des sangles gardées avec la peau du gabarit (head.skin.cache) : un deuxième licol du même modèle sur un cheval
    // du même gabarit (vignettes, soins, cheval qui revient dans le pré) ne refait pas les rayons.
    const memo = (key, fn) => {
      const cache = head.skin?.cache;
      const copy = (v) => (Array.isArray(v) ? v.map((p) => p.clone()) : v.clone());
      if (!cache) return fn();
      if (!cache.has(key)) cache.set(key, copy(fn()));
      return copy(cache.get(key));
    };
    // Muserolle : autour du nez, entre les yeux et les naseaux (en mouton pour le hackamore). Posée sur la vraie peau,
    // 6 à 7 mm au-dessus (skinRing).
    const zNose = snoutZ - hr * (halter ? 1.45 : bid === 'hackamore' ? 1.1 : 1.3);
    // (corde ronde : un peu plus loin, son rayon est plus grand que la demi-épaisseur d'une sangle)
    // (sa jonction — le bout de la sangle fermée — sous la mâchoire, où on ne la voit pas)
    const nose = memo(`nose|${bid}|${hid}`, () => skinRing(head, [0, yc, zNose], 48, bid === 'hackamore' ? 0.014 : rope ? 0.009 : 0.0065, -PI / 2, PI * 1.5, 0, 1.2, (bid === 'hackamore' ? 0.02 : w) * 0.9));
    if (bid === 'hackamore') add(model.head, strap(nose, 0.02, 0.012, true), P.fleeceMat(0xf2eee6));
    else add(model.head, band(nose, true), strapMat);
    // Têtière et sous-gorge : boucle bien derrière les oreilles (une oreille couchée passe par-dessus, pas dessous),
    // plaquée sur la nuque sous les crins, qui passe sous la gorge, décollée des ganaches. (Avant : à 1,7 cm derrière le
    // milieu des oreilles, sur la forme approchée : elle dépassait de la crinière comme un bâton, l'oreille couchée
    // passait dessous et, sous la ganache, la vraie peau passait par-dessus : un point rouge sortait de la joue.)
    const zCrown = earZ - hr * 0.38;
    // (sur la nuque et sur les côtés, 3 mm de plus ; sous la gorge, jusqu'à 1,4 cm)
    const crownOut = (a) => (rope ? 0.011 : 0.005) + (rope ? 0.014 : 0.009) * Math.max(0, -Math.sin(a)) ** 1.5
      + 0.003 * Math.min(1, Math.max(0, (Math.sin(a) + 0.45) / 0.35));
    // (le premier point de la peau sur chaque rayon : la nuque, pas l'encolure derrière elle)
    // (sa jonction sur le dessus de la nuque, sous les crins : sur le côté de la tête, on la voyait)
    // (penchée en avant sous la gorge, de 0,38 rad sur la nuque à 0,83 sous la gorge : la sous-gorge passe juste derrière
    // les ganaches, là où la gorge rejoint la tête. Avec 0,38 partout, elle descendait le long de la gorge jusqu'à 45 cm de
    // la nuque, et flottait loin sous la tête dès que la tête bougeait par rapport à l'encolure : photo, soins.)
    const crownTilt = (a) => 0.38 + 0.45 * Math.min(1, Math.max(0, (-Math.sin(a) - 0.2) / 0.8));
    const crown = memo(`crown|${rope}|${w}`, () => skinRing(head, [0, hr * 0.05, zCrown], 44, crownOut, PI / 2, PI * 2.5, crownTilt, 1.2, w * 0.8 * 0.9, true));
    // (la têtière un peu plus étroite que le reste du licol : sous les crins de la nuque)
    add(model.head, rope ? band(crown, true) : strap(crown, w * 0.8, th, true), strapMat);
    // Montants : de la têtière, sur le côté de la tête sous l'oreille (à la hauteur de l'articulation de la mâchoire, en
    // dessous et en arrière de l'œil), vers la muserolle ou le mors.
    // (les deux points de côté d'une boucle : le plus à gauche, le plus à droite)
    const sideOf = (pts) => [pts.reduce((a, p) => (p.x > a.x ? p : a)), pts.reduce((a, p) => (p.x < a.x ? p : a))];
    const crownSide = (sd) => memo(`side|${sd}|${rope}|${w}`, () => {
      const a = sd > 0 ? -0.95 : PI + 0.95;
      const ct = Math.cos(crownTilt(a));
      const st = Math.sin(crownTilt(a));
      // (2 mm plus loin que la boucle : le bout du montant, plat, est posé dessus)
      const p = skinPoint(head, [0, hr * 0.05, zCrown], [Math.cos(a), Math.sin(a) * ct, -Math.sin(a) * st], crownOut(a) + 0.002, 1.2, true);
      return head.skin?.clear ? head.skin.clear(p, crownOut(a) + 0.002) : p;
    });
    // Montant : il suit la joue (la ligne droite entre ses deux bouts rentrerait dans la tête), sur la vraie peau, ses
    // deux bords aussi (la sangle est plate : sur la joue bombée, ses bords y rentraient).
    const cheek = (a, b) => {
      const pts = memo(`cheek|${rope}|${w}|${a.toArray()}|${b.toArray()}`, () => cheekLine(a, b));
      add.headLines?.cheeks.push(pts);
      return pts;
    };
    const cheekLine = (a, b) => {
      const pts = [a];
      const along = new THREE.Vector3().subVectors(b, a);
      const sv = new THREE.Vector3(0, -along.z, along.y).normalize();
      const out = rope ? 0.008 : 0.0075;
      for (let k = 1; k < 12; k++) {
        const m = new THREE.Vector3().lerpVectors(a, b, k / 12);
        const d = new THREE.Vector3(m.x, m.y - yc, 0).normalize();
        if (!head.skin) {
          pts.push(skinPoint(head, [0, yc, m.z], d.toArray(), out, hr * 4));
          continue;
        }
        let r = null;
        for (const e of [0, 0.9, -0.9]) {
          const o = new THREE.Vector3(0, yc, m.z).addScaledVector(sv, e * w);
          const v = skinRadius(head.skin, o, d, out, hr * 4);
          if (v !== null) r = Math.max(r ?? -Infinity, v);
        }
        pts.push(r === null ? m : new THREE.Vector3(0, yc, m.z).addScaledVector(d, r));
      }
      pts.push(b);
      // (lissé vers l'extérieur seulement : tendu, le montant ne suit pas chaque bosse de la joue — avant, il ondulait ;
      // puis jamais plus près de la peau que out)
      for (let pass = 0; pass < 3; pass++) {
        const q = pts.map((p) => p.clone());
        for (let k = 1; k < pts.length - 1; k++) {
          const c = new THREE.Vector3(0, yc, q[k].z);
          const avg = q[k - 1].clone().add(q[k + 1]).multiplyScalar(0.25).addScaledVector(q[k], 0.5);
          const r0 = q[k].distanceTo(c);
          const ra = new THREE.Vector3(avg.x, avg.y, q[k].z).distanceTo(c);
          if (ra > r0) pts[k].copy(avg);
          else pts[k].copy(c).addScaledVector(new THREE.Vector3(avg.x, avg.y - yc, 0).normalize(), r0).setZ(avg.z);
        }
      }
      if (head.skin?.clear) for (let k = 1; k < pts.length - 1; k++) head.skin.clear(pts[k], out * 0.85);
      return pts;
    };
    const [cR, cL] = [crownSide(1), crownSide(-1)];
    add.headLines = { nose, crown, cheeks: [] };
    const [nR, nL] = sideOf(nose);
    if (bridle) {
      add(model.head, strap(skinRing(head, [0, hr * 0.15, earZ + hr * 0.3], 12, 0.006, deg(20), deg(160)), w, th), strapMat); // frontal
      if (bid === 'doubleBridle' || bid === 'bridleOlive') {
        // Frontal à strass.
        for (const p of skinRing(head, [0, hr * 0.15, earZ + hr * 0.3], 9, 0.012, deg(30), deg(150))) {
          add(model.head, P.shared('gearGem', () => new THREE.SphereGeometry(0.006, 6, 5)), P.steelMat(), p.toArray());
        }
      }
      const reinPts = [];
      add.reins = { parent: model.head, points: reinPts, color };
      for (const [c, s] of [[cR, 1], [cL, -1]]) {
        const m = skinPoint(head, [0, -hr * 0.42, snoutZ - hr * 0.8], [s, -0.1, 0], 0, hr * 3);
        const ring = m.clone().add(new THREE.Vector3(s * hr * 0.1, 0, 0));
        reinPts.push(ring.clone());
        if (bid === 'hackamore') {
          // Pas de mors : le montant descend à la muserolle, une branche en métal pend sur le côté du nez.
          const n = s > 0 ? nR : nL;
          reinPts[reinPts.length - 1] = n.clone().add(new THREE.Vector3(s * 0.01, -hr * 0.6, hr * 0.12));
          add(model.head, strap(cheek(c, n), w * 0.9, th, false, [0, 1, 0]), strapMat);
          add(model.head, P.tube([n.toArray(), [n.x + s * 0.01, n.y - hr * 0.35, n.z + hr * 0.15], [n.x + s * 0.008, n.y - hr * 0.7, n.z + hr * 0.1]], 0.005), P.steelMat());
          continue;
        }
        // (le montant s'attache en haut de l'anneau, à l'extérieur : il ne passe pas dans le coin de la bouche)
        add(model.head, strap(cheek(c, ring.clone().add(new THREE.Vector3(s * 0.004, hr * 0.2, 0))), w * 0.9, th, false, [0, 1, 0]), strapMat);
        add(model.head, new THREE.TorusGeometry(hr * (bid === 'doubleBridle' ? 0.18 : 0.24), hr * 0.035, 6, 16), P.steelMat(), ring.toArray(), [0, PI / 2, 0]);
        if (bid === 'bridleOlive') {
          // Mors à olives : la barrette en olive où passe l'anneau, debout dans l'anneau, côté extérieur
          // (avant, elle était dans la bouche : on ne la voyait pas, le filet ressemblait au filet simple).
          add(model.head, P.shared('gearOlive', () => new THREE.SphereGeometry(1, 10, 8)), P.steelMat(), [ring.x + s * hr * 0.04, ring.y, ring.z], null, [hr * 0.11, hr * 0.24, hr * 0.13]);
          add(model.head, new THREE.CylinderGeometry(hr * 0.045, hr * 0.045, hr * 0.2, 8), P.steelMat(), [ring.x - s * hr * 0.06, ring.y, ring.z], [0, 0, PI / 2]);
        }
        if (bid === 'doubleBridle') {
          // Mors de bride : branche droite sous l'anneau du filet.
          add(model.head, new THREE.CylinderGeometry(hr * 0.03, hr * 0.03, hr * 0.7, 6), P.steelMat(), [ring.x + s * hr * 0.05, ring.y - hr * 0.3, ring.z + hr * 0.12]);
          add(model.head, new THREE.TorusGeometry(hr * 0.1, hr * 0.025, 6, 12), P.steelMat(), [ring.x + s * hr * 0.05, ring.y - hr * 0.68, ring.z + hr * 0.12], [0, PI / 2, 0]);
        }
      }
    } else {
      for (const [c, n] of [[cR, nR], [cL, nL]]) {
        add(model.head, band(cheek(c, n), false, [0, 1, 0]), strapMat);
        // (nœud posé sur la muserolle, pas dans le nez)
        if (rope) add(model.head, P.shared('gearKnot', () => new THREE.SphereGeometry(0.011, 8, 6)), strapMat, n.clone().add(new THREE.Vector3(n.x, n.y - yc, 0).setLength(0.006)).toArray());
      }
      // Anneau (ou gros nœud) sous le menton, pour la longe.
      const chin = nose.reduce((a, p) => (p.y < a.y ? p : a));
      if (rope) add(model.head, P.shared('gearKnot', () => new THREE.SphereGeometry(0.011, 8, 6)), strapMat, [chin.x, chin.y - hr * 0.08, chin.z]);
      else add(model.head, new THREE.TorusGeometry(hr * 0.14, hr * 0.03, 6, 12), metal, [chin.x, chin.y - hr * 0.1, chin.z], [0, 0, 0]);
      // (boucles posées sur la sangle, pas dans la joue)
      if (leatherHalter) for (const p of [cR, cL]) add(model.head, P.shared('gearBuckle', () => new THREE.BoxGeometry(0.02, 0.016, 0.006)), metal, p.clone().add(new THREE.Vector3(Math.sign(p.x) * 0.004, 0, 0)).toArray());
      // Anneaux où se rejoignent têtière, sous-gorge et montant, à plat sur la joue, comme sur un vrai licol : ils cachent la
      // jonction des sangles (sans eux, le bout du montant dépassait de la têtière).
      else if (!rope) {
        for (const p of [cR, cL]) {
          const nrm = new THREE.Vector3(p.x, p.y - yc, 0).normalize();
          const ring = add(model.head, P.shared('gearJoinRing', () => new THREE.TorusGeometry(0.011, 0.0028, 6, 14)), metal, p.clone().addScaledVector(nrm, 0.004).toArray());
          ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
        }
      }
    }
  }

  if (gear.head) {
    // Bonnet anti-mouches : voile qui couvre le front, les yeux et le haut des joues.
    const color = gearColor(gear.head, 0xd8e4ea);
    const g = shell(head, hr * 0.05, earZ - hr * 0.1, snoutZ - hr * 1.45, 8, deg(200), deg(-20), 14, 0.012);
    add(model.head, g, new THREE.MeshStandardMaterial({ color, roughness: 0.9, transparent: true, opacity: 0.78, side: THREE.DoubleSide }));
    add(model.head, strap(loop(head, [0, hr * 0.05, snoutZ - hr * 1.45], 14, 0.014, deg(200), deg(-20)), 0.01, 0.004), mat(0x9fb3bd, 0.8));
  }

  if (gear.legs || gear.bells) {
    // Guêtres sur les canons, du genou (ou du jarret) au boulet ; cloches autour des sabots.
    const T = model.legTop;
    const r = model.dims.legR;
    const bootMat = gear.legs ? P.clothMat(gearColor(gear.legs, 0x22324a), THREE.FrontSide) : null;
    const bellMat = gear.bells ? P.rubberMat(gearColor(gear.bells, 0x1e1b19)) : null;
    for (const leg of model.legs) {
      const parent = leg.knee ?? leg.pivot;
      const len = (leg.front ? 0.27 : 0.2) * T;
      if (bootMat) {
        add(parent, new THREE.CylinderGeometry(r * 1.0, r * 1.08, len, 10), bootMat, [0, -0.07 * T - len / 2, 0]);
        for (const k of [0.25, 0.6]) add(parent, new THREE.CylinderGeometry(r * 1.1, r * 1.1, len * 0.12, 10), P.nylonMat(0x2a2a2a), [0, -0.07 * T - len * k, 0]);
      }
      if (bellMat && leg.fetlock && leg.hoof && leg.fetlockRest) {
        // Cloche autour du sabot : du paturon jusque par-dessus la couronne, centrée sur le sabot (le paturon
        // et le sabot sont en avant de l'axe du canon). Repère du boulet : elle suit le pied qui bouge.
        const E = leg.fetlockRest.y / 0.215; // (hauteur du boulet ÷ E, voir horseModel.js)
        const yc = 0.085 * E;
        const h = 0.09 * E;
        const c = new THREE.Vector3(leg.hoof.x, yc, leg.hoof.z - 0.04).sub(leg.fetlockRest);
        add(leg.fetlock, new THREE.CylinderGeometry(r * 1.32, r * 1.78, h, 16, 1, true), bellMat, c.toArray(), [0.12, 0, 0], [1, 1, 1.08]);
        // Bourrelet en bas (le bord roulé de la cloche) : on voit mieux sa forme.
        add(leg.fetlock, new THREE.TorusGeometry(r * 1.76, r * 0.12, 6, 18), bellMat, [c.x, c.y - h * 0.48, c.z - h * 0.06], [Math.PI / 2 + 0.12, 0, 0], [1, 1.08, 1]);
      } else if (bellMat) {
        const yb = -0.07 * T - len - 0.07 * T;
        add(parent, new THREE.CylinderGeometry(r * 1.05, r * 1.55, 0.06 * T, 12, 1, true), bellMat, [0, yb, 0]);
      }
    }
  }
}

/** Étrivière : bande de cuir mince le long des points (repère de body). */
function stirrupLeather(pts, k) {
  return loft(pts.map((p) => ({ p: Array.isArray(p) ? p : p.toArray(), rx: 0.013 * k, ry: 0.0025 })), { radial: 6, sub: 2, side: [0, 0, 1], exp: 4 });
}

/**
 * Étrier (userData.saddle.stirrups) mis à la longueur de jambe du cavalier : l'étrier (son origine, repère de
 * body) va en `at`. Selle anglaise : l'étrivière suit le quartier puis descend jusqu'à lui ; western : le
 * fender, refait le long du flanc, s'arrête juste au-dessus de lui. Sans `at`, l'étrier et l'étrivière (ou le
 * fender) reviennent à leur place d'origine. light : l'étrier suit le pied d'une image à l'autre, le fender
 * n'est pas refait (l'étrivière, elle, l'est : peu de sommets).
 */
export function fitStirrup(s, at = null, light = false) {
  s.home ??= { pos: s.iron.position.clone(), geo: s.leather.geometry };
  if (!at) {
    s.iron.position.copy(s.home.pos);
    if (s.leather.geometry !== s.home.geo) {
      s.leather.geometry.dispose();
      s.leather.geometry = s.home.geo;
    }
    delete s.leather.userData.homeGeo;
    return;
  }
  s.iron.position.copy(at);
  if (light && s.fender) return;
  let geo;
  if (s.fender) {
    // (la longueur dont le bas est 6 cm au-dessus du centre de l'étrier : le flanc descend avec la longueur)
    let lo = 0.3 * s.flen;
    let hi = 1.6 * s.flen;
    for (let it = 0; it < 14; it++) {
      const m = (lo + hi) / 2;
      if (s.fenderEnd(m).y - 0.06 > at.y) lo = m;
      else hi = m;
    }
    geo = s.fender((lo + hi) / 2);
  } else {
    const end = at.clone().add(s.hang);
    // (le long du quartier tant qu'il est au-dessus du bout, puis droit jusqu'à lui)
    const pts = s.pts.filter((p, i) => i === 0 || p.y > end.y + 0.02);
    pts.push(end);
    geo = stirrupLeather(pts, s.k);
  }
  if (s.leather.geometry !== s.home.geo) s.leather.geometry.dispose();
  s.leather.geometry = geo;
  s.leather.userData.homeGeo = s.home.geo; // (libérée avec le harnachement : removeGear)
}

/**
 * Tapis (ou amortisseur) sous la selle de style st : celui qu'on a mis, sinon un tapis blanc tout simple.
 * Aussi seul (sans selle). Renvoie son épaisseur (la selle se pose dessus).
 */
function horsePad(model, gear, add, st) {
  // (tapis de voltige sous une selle : déjà posé par horseVaultPad, la selle se pose dessus)
  if (gear.pad?.item === 'vaultPad') return (model.skinGear ? 0.009 : 0.002) + 0.028;
  const { torso } = model.sdf;
  const { L, R } = model.dims;
  const y0 = model.y0;
  const deg = (d) => (d * Math.PI) / 180;
  const P = TACK_PARTS;
  const k = L / 1.5;
  const zSeat = -L * 0.05;
  const pad = gear.pad;
  const padColor = pad ? gearColor(pad, 0xe9e2d4) : st.western ? 0x9a3b2a : 0xe9e2d4;
  const padMat = pad?.item === 'gelPad' ? P.rubberMat(padColor) : pad ? P.quiltMat(padColor) : P.clothMat(padColor);
  const padHalf = (st.western ? 0.3 : st.race ? 0.16 : 0.24) * k;
  const padDrop = st.western ? 15 : st.race ? 40 : 18;
  const padT = pad?.item === 'gelPad' ? 0.02 : st.western ? 0.016 : 0.01; // épaisseur : la selle se pose dessus
  add(model.body, shell(torso, y0 - R * 0.2, zSeat - padHalf * 0.9, zSeat + padHalf, 8, deg(180 - padDrop), deg(padDrop), 14, padT), padMat);
  if (pad) {
    const trim = GEAR[pad.item]?.trim ?? (pad.item === 'gelPad' ? padColor : padColor === COLORS.white ? COLORS.navy : 0xf1ede4);
    add(model.body, strap(loop(torso, [0, y0 - R * 0.2, zSeat + padHalf], 14, padT + 0.004, deg(180 - padDrop), deg(padDrop)), 0.008, 0.004), P.clothMat(trim));
  }
  return padT;
}

/**
 * Petites pièces regroupées par matériau en un seul maillage (moins d'appels de rendu : anneaux, boucles, poignées,
 * écussons). put(géométrie, matériau, { pos, quat, skin }) : copiée dans le repère du parent ; flush() les pose (liées
 * au squelette si skin, comme add.skin).
 */
function pieceBatch(parent, add) {
  const groups = new Map();
  const m = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  return {
    put(geo, material, { pos = null, quat = null, skin = false } = {}) {
      let g = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.clearGroups();
      g.morphAttributes = {};
      delete g.userData.shared;
      g.applyMatrix4(m.compose(pos ?? new THREE.Vector3(), quat ?? new THREE.Quaternion(), one));
      const key = `${material.uuid}|${skin ? 1 : 0}`;
      if (!groups.has(key)) groups.set(key, { material, skin, list: [] });
      groups.get(key).list.push(g);
    },
    flush() {
      for (const { material, skin, list } of groups.values()) {
        const merged = list.length === 1 ? list[0] : mergeGeometries(list);
        if (list.length > 1) list.forEach((x) => x.dispose());
        if (!merged) continue;
        const mesh = add(parent, merged, material);
        if (skin) add.skin(mesh);
      }
      groups.clear();
    },
  };
}

/**
 * Où est le tapis de voltige (repère du modèle) : du garrot jusqu'aux reins, retombant sur les flancs. (Le bord avant
 * s'arrête juste derrière les dernières mèches de la crinière : plus en avant, elles passaient sur le tapis et son
 * bord paraissait déchiré.)
 */
export function vaultPadSpan(model) {
  const { L } = model.dims;
  const zSeat = -L * 0.05;
  return { z0: zSeat - 0.3 * (L / 1.5), z1: (model.dims.zGirth ?? zSeat + L * 0.25) + 0.02 * (L / 1.5), drop: 30 };
}

/**
 * Tapis de voltige : une mousse épaisse (3 cm), longue et large, qui épouse le dos et les flancs et suit le corps
 * quand il bouge (lié au squelette, comme la couverture). Bords arrondis tout autour (le passepoil, plus foncé :
 * on voit son épaisseur), et un écusson clair sur chaque flanc. Renvoie son épaisseur (le surfaix ou la selle se
 * posent dessus).
 */
function horseVaultPad(model, gear, add) {
  const { torso } = model.sdf;
  const { R, L } = model.dims;
  const y0 = model.y0;
  const deg = (d) => (d * Math.PI) / 180;
  const P = TACK_PARTS;
  const k = L / 1.5;
  const color = gearColor(gear.pad, COLORS.navy);
  const T = 0.028; // épaisseur de la mousse
  const gap = model.skinGear ? 0.009 : 0.002;
  const { z0, z1, drop } = vaultPadSpan(model);
  const yc = y0 - R * 0.2;
  const aTop = deg(90);
  const half = deg(90 + drop); // de chaque côté du dessus, jusqu'à drop° sous l'horizontale
  const rc = 0.07 * k; // rayon des coins arrondis (m)
  // Point de la surface à la position (z, angle) : sur le corps, décalé de out.
  const at = (z, a, out) => {
    const p = rayHit(torso, [0, yc, z], [Math.cos(a), Math.sin(a), 0], 1.2);
    return p.addScaledVector(sdfNormal(torso, p, 0.004), out);
  };
  // Coins arrondis : près de l'avant et de l'arrière, le tapis descend un peu moins bas (quart de cercle de rayon rc).
  const reach = (z) => {
    const d = Math.min(z - z0, z1 - z);
    if (d >= rc) return half;
    const u = 1 - d / rc;
    const cut = rc * (1 - Math.sqrt(Math.max(0, 1 - u * u))); // (m le long du flanc)
    return half - cut / Math.max(0.2, R * 1.1);
  };
  const nz = model.skinGear ? 16 : 11;
  const na = model.skinGear ? 24 : 16;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i < nz; i++) {
    const z = z0 + ((z1 - z0) * i) / (nz - 1);
    const r = reach(z);
    for (let j = 0; j < na; j++) {
      const a = aTop + r * (1 - (2 * j) / (na - 1));
      const p = at(z, a, gap + T);
      pos.push(p.x, p.y, p.z);
      uv.push(j / (na - 1), i / (nz - 1));
    }
  }
  for (let i = 0; i < nz - 1; i++) {
    for (let j = 0; j < na - 1; j++) {
      const q = i * na + j;
      idx.push(q, q + 1, q + na, q + 1, q + na + 1, q + na);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  add.skin(add(model.body, geo, P.quiltMat(color)));
  // Le bord : un boudin tout autour (rayon T/2, centré à mi-épaisseur), d'une couleur plus foncée : on voit l'épaisseur.
  const edge = [];
  const ring = 44;
  for (let i = 0; i < ring; i++) {
    // le tour du tapis : côté gauche d'avant en arrière, dessus à l'arrière, côté droit, dessus à l'avant
    const u = i / ring;
    let z;
    let side;
    if (u < 0.35) { z = z1 - (z1 - z0) * (u / 0.35); side = 1; } else if (u < 0.5) { z = z0; side = 1 - 2 * ((u - 0.35) / 0.15); } else if (u < 0.85) { z = z0 + (z1 - z0) * ((u - 0.5) / 0.35); side = -1; } else { z = z1; side = -1 + 2 * ((u - 0.85) / 0.15); }
    edge.push(at(z, aTop - side * reach(z), gap + T / 2));
  }
  const trim = new THREE.Color(color).multiplyScalar(0.42).getHex();
  add.skin(add(model.body, P.tube(edge.map((v) => v.toArray()), T / 2 + 0.004, true, 8), P.clothMat(trim)));
  // Écusson : un disque clair à étoile sur chaque flanc, vers l'arrière du tapis.
  const batch = pieceBatch(model.body, add);
  for (const sd of [1, -1]) {
    const zc = z0 + (z1 - z0) * 0.3;
    const a = aTop - sd * deg(72);
    const p = at(zc, a, gap + T + 0.011);
    const q = rayHit(torso, [0, yc, zc], [Math.cos(a), Math.sin(a), 0], 1.2);
    const nrm = sdfNormal(torso, q, 0.004);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
    batch.put(P.shared('vaultBadge', () => new THREE.CircleGeometry(0.06, 24)), P.clothMat(0xf4efe4, THREE.FrontSide), { pos: p, quat, skin: true });
    batch.put(P.shared('vaultStar', () => starGeometry(0.04, 0.017, 5)), P.clothMat(color, THREE.FrontSide), { pos: p.clone().addScaledVector(nrm, 0.003), quat, skin: true });
  }
  batch.flush();
  return gap + T;
}

/** Étoile plate (dans le plan xy) : rayons extérieur r1 et intérieur r2. */
function starGeometry(r1, r2, k) {
  const sh = new THREE.Shape();
  for (let i = 0; i < k * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / k;
    const r = i % 2 ? r2 : r1;
    if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ShapeGeometry(sh);
}

/**
 * Surfaix de voltige, juste derrière le garrot, posé sur le tapis : un large dessus en cuir rembourré, la sangle
 * qui passe sous le ventre (derrière les coudes), deux poignées (des anses de cuir raides, droites, que la main
 * prend par le côté), une boucle souple entre elles, et des anneaux sur les flancs pour les enrênements.
 * Pour la voltige (src/game/Vaulting.js) : add.surcingle = { parent, grips (milieu de chaque poignée, gauche puis
 * droite), rings (anneau des enrênements, gauche puis droite), loop (la boucle du milieu), z (milieu du dessus) }.
 */
function horseSurcingle(model, gear, add, padT = 0) {
  const { torso } = model.sdf;
  const { L, R } = model.dims;
  const y0 = model.y0;
  const deg = (d) => (d * Math.PI) / 180;
  const P = TACK_PARTS;
  const body = model.body;
  const k = L / 1.5;
  const color = gearColor(gear.surcingle, 0x1e1b19);
  const leather = P.leatherMat(color);
  const edgeM = P.edgeMat(color);
  const zSeat = -L * 0.05;
  const zGirth = model.dims.zGirth ?? zSeat + L * 0.2;
  // Le dessus est 25 cm devant le siège ; la sangle descend presque droit, juste derrière les coudes.
  const zTop = zSeat + 0.25 * k;
  const tilt = Math.min(0.2, Math.atan2(Math.max(0, zGirth - zTop), 2 * R) * 0.5);
  const zc = zTop + R * Math.sin(tilt);
  const yc = y0 - R * 0.2;
  // Sur le tapis (il descend jusqu'à ~30° sous l'horizontale) : les « ailes » du surfaix, larges, en cuir rembourré.
  const onTop = padT ? padT + 0.012 : 0.012;
  const wingA = padT ? deg(-24) : deg(4);
  const wing = loop(torso, [0, yc, zc], 21, onTop + 0.011, wingA, Math.PI - wingA, tilt);
  add.skin(add(body, strap(wing, 0.068 * k, 0.012), leather));
  add.skin(add(body, strap(loop(torso, [0, yc, zc], 21, onTop + 0.0235, wingA + deg(2), Math.PI - wingA - deg(2), tilt), 0.06 * k, 0.0012), edgeM)); // surpiqûre
  // Sangle : du bas des ailes, sous le ventre (avec une partie élastique noire au milieu).
  const girth = loop(torso, [0, yc, zc], 22, (model.skinGear ? 0.016 : 0.012), wingA + deg(4), -Math.PI - wingA - deg(4), tilt);
  add.skin(add(body, strap(girth, 0.035 * k, 0.006), leather));
  add.skin(add(body, strap(loop(torso, [0, yc, zc], 9, (model.skinGear ? 0.0225 : 0.0185), deg(-62), deg(-118), tilt), 0.026 * k, 0.003), P.nylonMat(0x2a2a2a)));
  // Fourreau en mouton sous la sangle, là où elle frotte (blanc). Petites pièces : regroupées (pieceBatch).
  const batch = pieceBatch(body, add);
  for (const [b0, b1] of [[deg(-30), deg(-56)], [deg(-124), deg(-150)]]) {
    batch.put(strap(loop(torso, [0, yc, zc], 6, (model.skinGear ? 0.024 : 0.018), b0, b1, tilt), 0.04 * k, 0.009), P.fleeceMat(0xf2eee6), { skin: true });
  }
  // Boucles de la sangle, au bas des ailes.
  for (const a of [wingA + deg(3), Math.PI - wingA - deg(3)]) {
    const p = rayHit(torso, [0, yc, zc], [Math.cos(a), Math.sin(a) * Math.cos(tilt), -Math.sin(a) * Math.sin(tilt)], 1.2);
    const nrm = sdfNormal(torso, p, 0.004);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 4));
    batch.put(P.shared('vaultBuckle', () => new THREE.TorusGeometry(0.03, 0.005, 6, 4)), P.steelMat(), { pos: p.addScaledVector(nrm, onTop + 0.02), quat, skin: true });
  }
  // Repère du dessus pour les poignées : point du dessus, sa normale, et l'axe du dos (vers l'avant).
  const at = (a, out = onTop + 0.023) => {
    const p = rayHit(torso, [0, yc, zc], [Math.cos(a), Math.sin(a) * Math.cos(tilt), -Math.sin(a) * Math.sin(tilt)], 1.2);
    const nrm = sdfNormal(torso, p, 0.004);
    return { p: p.addScaledVector(nrm, out), n: nrm };
  };
  const fwd = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt)); // le long du dos, vers l'avant (dessus du surfaix)
  const grips = [];
  for (const sd of [1, -1]) {
    // Poignée : anse en U renversé, 15 cm de haut, 11 cm de long, penchée de 18° vers l'extérieur ; cuir enroulé.
    const { p, n } = at(deg(90 - sd * 16));
    const up = new THREE.Vector3(sd * Math.sin(deg(14)), Math.cos(deg(14)), 0);
    const H = 0.15 * k;
    const W = 0.055 * k;
    const path = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      const a = Math.PI * u;
      // pieds droits, dessus arrondi (super-ellipse)
      const s = Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** 0.6;
      const h = Math.abs(Math.sin(a)) ** 0.45;
      path.push(p.clone().addScaledVector(fwd, W * s).addScaledVector(up, H * h - 0.004).toArray());
    }
    batch.put(P.tube(path, 0.017 * k, false, 10), leather);
    // Embase cousue sur le dessus, et le haut de l'anse gainé d'un cuir plus clair (là où la main tient).
    batch.put(P.shared('vaultGripBase', () => new THREE.BoxGeometry(0.05, 0.012, 0.15)), edgeM, { pos: p, quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n) });
    const grip = p.clone().addScaledVector(up, H - 0.004);
    // (un manchon ouvert, qui s'amincit à ses deux bouts jusqu'à l'anse : son bouchon, posé de travers dans le coin
    // de l'anse, dépassait du cuir et se voyait comme une pastille cuivrée)
    const wrap = [];
    for (let i = 3; i <= 9; i++) {
      const r = (i === 3 || i === 9 ? 0.0172 : 0.0195) * k;
      wrap.push({ p: path[i], rx: r, ry: r });
    }
    // (dans l'autre sens que l'anse : ses faces regardent dehors — le daim n'a qu'une face, il était invisible)
    batch.put(loft(wrap.reverse(), { radial: 10, sub: 2, capStart: false, capEnd: false }), P.suedeMat(0xb07a44));
    // deux ligatures de cuir foncé aux bouts du gainage (comme sur une vraie poignée : elles le tiennent)
    for (const [i, j] of [[3, 4], [9, 8]]) {
      const tg = new THREE.Vector3(...path[j]).sub(new THREE.Vector3(...path[i])).normalize();
      batch.put(P.shared('vaultGripTie', () => new THREE.TorusGeometry(0.0192, 0.0042, 6, 14)), edgeM,
        { pos: new THREE.Vector3(...path[i]).addScaledVector(tg, 0.004), quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tg) });
    }
    grips.push(grip);
  }
  // Boucle souple du milieu (pour le pied ou la main), entre les poignées, plus basse.
  const mid = at(deg(90));
  const loopPts = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (i / 10);
    loopPts.push(mid.p.clone().addScaledVector(fwd, 0.045 * k * Math.cos(a)).addScaledVector(mid.n, 0.07 * k * Math.sin(a) ** 0.7).toArray());
  }
  batch.put(P.tube(loopPts, 0.008 * k, false, 6), edgeM);
  // Anneaux des enrênements : trois sur chaque flanc, à différentes hauteurs ; on se sert de celui du milieu.
  const rings = [];
  for (const sd of [1, -1]) {
    for (const [a, i] of [[deg(sd > 0 ? 28 : 152), 0], [deg(sd > 0 ? 14 : 166), 1], [deg(sd > 0 ? 0 : 180), 2]]) {
      const { p, n } = at(a, onTop + 0.026);
      batch.put(P.shared('vaultRing', () => new THREE.TorusGeometry(0.024, 0.005, 6, 16)), P.steelMat(), { pos: p, quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n), skin: true });
      if (i === 1) rings.push(p.clone().addScaledVector(n, 0.01));
    }
  }
  batch.flush();
  add.surcingle = { parent: body, grips, rings, loop: mid.p.clone(), z: zTop };
}

/**
 * Selle sur le cheval : siège creusé (pommeau, troussequin), tapis, quartiers qui épousent le flanc,
 * étrivières et étriers, sangle. La forme vient du modèle : obstacle, dressage, randonnée, western…
 */
function horseSaddle(model, gear, add) {
  const { torso } = model.sdf;
  const { L, R } = model.dims;
  const y0 = model.y0;
  const body = model.body;
  const PI = Math.PI;
  const deg = (d) => (d * PI) / 180;
  const P = TACK_PARTS;
  const id = gear.saddle.item;
  const st = SADDLE_STYLES[id] ?? SADDLE_STYLES.saddle;
  const color = gearColor(gear.saddle, 0x5a3418);
  const leather = P.leatherMat(color);
  const edgeM = P.edgeMat(color);
  const k = L / 1.5; // les cotes des selles sont pour un cheval de 1,5 m de corps (repère du modèle)
  const zSeat = -L * 0.05; // là où s'assoit le cavalier (src/game/Player.js)
  const len = st.len * k;
  const z0 = zSeat - len * 0.55;
  const z1 = zSeat + len * 0.45;

  const padT = horsePad(model, gear, add, st);

  // Siège : le profil du modèle, posé sur le dos du cheval.
  const secs = P.seatSections(st, 0).map((sec) => {
    const z = zSeat + (sec.p[2] / st.len) * len;
    const h = (sec.p[1] - st.dip) * k; // hauteur au-dessus du creux
    return { p: [0, model.backTop(z) + 0.02 + h, z], rx: sec.rx * k, ry: 0.02 * k, ryb: 0.03 * k + h };
  });
  if (st.western) {
    secs[0].rx = st.seatW * k * 0.95;
    secs[7].rx = st.seatW * k * 0.62;
  }
  // Pour le cavalier (src/game/models/riderFit.js) : dessus du siège le long de z (repère de body) et étriers.
  // (siège : coupes de centre y, de demi-largeur rx, le dessus ry au-dessus du centre, en superellipse d'exposant 2,6)
  add.saddle = { parent: body, seat: secs.map((sec) => ({ z: sec.p[2], y: sec.p[1], ry: sec.ry, rx: sec.rx })), stirrups: [] };
  add(body, solid(loft(secs, { radial: 14, sub: 2, exp: 2.6, round: [0.6, 0.5] })), leather); // (solid : siège plein, pas deux arcs)
  const inner = secs.slice(1, 7).map((sec) => ({ ...sec, p: [0, sec.p[1] + 0.012, sec.p[2]], rx: sec.rx * 0.8, ry: 0.01, ryb: 0.01 }));
  add(body, solid(loft(inner, { radial: 12, sub: 2, round: [0.3, 0.3] })), st.quilted ? P.quiltMat(0x2b2522) : P.suedeMat(color));

  // Quartiers (ou jupes western) posés sur le flanc : grille qui suit le corps sculpté.
  const th0 = 0.5;
  const onFlank = (side, out, zc, a0 = th0) => (sv, t) => {
    const a = a0 + t / R;
    const p = rayHit(torso, [0, y0 - R * 0.15, zc + sv], [side * Math.sin(a), Math.cos(a), 0], 1.5);
    const n = sdfNormal(torso, p, 0.004);
    return [p.x + n.x * out, p.y + n.y * out, p.z + n.z * out];
  };
  const zc = zSeat + len * 0.1;
  for (const side of [1, -1]) {
    if (st.western) {
      const out = (v) => {
        const r = v > 0.75 ? Math.sqrt(Math.max(0.05, 1 - ((v - 0.75) / 0.25) ** 2)) : 1;
        return [-0.32 * k * r, 0.3 * k * r];
      };
      const map = onFlank(side, padT + 0.01, zSeat - 0.02 * k, 0.42);
      add(body, P.plate(out, 0.3 * k, map, 8, 7), P.tooledMat(color));
      add(body, P.tube(P.plateEdge(out, 0.3 * k, map), 0.004, true, 4), edgeM);
      // Fender (large étrivière) et étrier en bois.
      const fOut = (v) => [0.02 * k - 0.065 * k + v * 0.01 * k, 0.02 * k + 0.065 * k - v * 0.012 * k];
      const fMap = onFlank(side, padT + 0.024, zSeat - 0.02 * k, 0.42);
      const flen = 0.46 * k;
      const fender = add(body, P.plate(fOut, flen, fMap, 4, 8), P.tooledMat(color));
      const end = new THREE.Vector3(...fMap(0.02 * k, flen));
      const oxbow = add(body, P.shared('gearOxbow', () => new THREE.TorusGeometry(0.055, 0.014, 6, 16, PI)), P.woodMat(), [end.x + side * 0.01, end.y - 0.06, end.z], [0, PI / 2, PI]);
      // Pour le cavalier : l'étrier en bois va au pied, le fender (refait le long du flanc) s'arrête au-dessus de
      // lui. (Le pied pose sur le dessus du fond de l'arc, 5,5 - 1,4 cm sous son centre : repère de l'arc
      // retourné, d'où le +y.)
      add.saddle.stirrups.push({
        side, iron: oxbow, leather: fender, k, tread: new THREE.Vector3(0, 0.055 - 0.014, 0),
        fender: (len) => P.plate(fOut, len, fMap, 4, 8), fenderEnd: (len) => new THREE.Vector3(...fMap(0.02 * k, len)), flen,
      });
      // Corne (pommeau).
      const zH = z1 - 0.02 * k;
      const yH = model.backTop(zH) + 0.02 + (st.pommel - st.dip) * k;
      add(body, P.shared('gearHornNeck', () => new THREE.CylinderGeometry(0.018, 0.026, 0.07, 12)), leather, [0, yH + 0.03, zH], [0.25, 0, 0]);
      add(body, P.shared('gearHornCap', () => new THREE.CylinderGeometry(0.042, 0.036, 0.016, 18)), edgeM, [0, yH + 0.068, zH + 0.01], [0.25, 0, 0]);
      for (const [sv, t] of [[-0.27 * k, 0.05 * k], [0.25 * k, 0.05 * k]]) {
        add(body, P.shared('gearConcho', () => new THREE.CylinderGeometry(0.018, 0.018, 0.005, 14)), P.steelMat(), onFlank(side, padT + 0.016, zSeat - 0.02 * k, 0.42)(sv, t), [0, 0, side * (PI / 2 - 0.5)]);
      }
      continue;
    }
    const outline = flapOutline(st, k);
    const fl = st.flap[0] * k;
    const map = onFlank(side, padT + 0.006, zc);
    add(body, P.plate(outline, fl, map), P.leatherDS(color));
    add(body, P.tube(P.plateEdge(outline, fl, map), 0.0035, true, 4), edgeM);
    const mapOut = onFlank(side, padT + 0.018, zc);
    if (st.knee) {
      const pts = [];
      for (let i = 0; i <= 4; i++) {
        const v = 0.06 + i * 0.13 * (0.6 + st.knee * 0.4);
        pts.push(mapOut(outline(v)[1] - 0.04 * k, v * fl));
      }
      add(body, loft(pts.map((p, i) => ({ p, rx: (0.016 + st.knee * 0.008) * k, ry: (0.01 + st.knee * 0.006 * Math.sin((i / 4) * PI)) * k })), { radial: 8, sub: 2, round: [0.8, 0.8] }), leather);
    }
    if (st.blocks) {
      const pts = [0.05, 0.15, 0.25, 0.32].map((v) => mapOut(outline(v)[0] + 0.045 * k, v * fl));
      add(body, loft(pts.map((p) => ({ p, rx: 0.02 * k, ry: 0.014 * k })), { radial: 8, sub: 2, round: [0.8, 0.8] }), leather);
    }
    // Étrivière le long du quartier, puis l'étrier qui pend.
    const sl = st.race ? 0.6 : 0.85;
    const sMap = onFlank(side, padT + 0.022, zc);
    const spts = [];
    for (let i = 0; i <= 6; i++) {
      const v = 0.04 + (i / 6) * (sl - 0.04);
      spts.push(sMap(outline(v)[0] * 0.3 + outline(v)[1] * 0.7 - 0.02 * k, v * fl));
    }
    const strap = add(body, stirrupLeather(spts, k), edgeM);
    const end = spts[spts.length - 1];
    const ironK = (st.race ? 0.75 : 1) * k;
    const iron = P.stirrupIron(Math.round(ironK * 100) / 100);
    iron.position.set(end[0] + side * 0.014, end[1] - 0.055 * ironK, end[2]);
    iron.rotation.z = side * 0.25;
    add.group(body, iron);
    add.saddle.stirrups.push({
      side, iron, leather: strap, pts: spts.map((p) => new THREE.Vector3(...p)), k, ironK,
      // (dessus de la grille de l'étrier, repère de l'étrier ; bout de l'étrivière, depuis l'étrier)
      tread: new THREE.Vector3(0, -0.012 * ironK, 0), hang: new THREE.Vector3(-side * 0.014, 0.055 * ironK, 0),
    });
  }
  // Sacoches et paquetage (randonnée).
  if (st.bags) {
    for (const s of [1, -1]) {
      const p = rayHit(torso, [0, y0, z0 - 0.02 * k], [s * 0.75, 0.66, 0], 1.2);
      add(body, P.shared('gearBag', () => new THREE.BoxGeometry(0.05, 0.12, 0.14)), leather, [p.x + s * 0.022, p.y - 0.045, p.z], [0, 0, s * 0.75]);
      add(body, P.shared('gearBagLid', () => new THREE.BoxGeometry(0.056, 0.04, 0.145)), edgeM, [p.x + s * 0.008, p.y - 0.005, p.z], [0, 0, s * 0.75]);
    }
    add(body, P.shared('gearRoll', () => new THREE.CylinderGeometry(0.045, 0.045, 0.32, 12)), P.clothMat(0x4f6b3a), [0, model.backTop(z0) + 0.02 + (st.cantle - st.dip) * k + 0.03, z0 - 0.05 * k], [0, 0, PI / 2]);
  }
  // Sangle sous le ventre (sangle large en mohair pour la western), juste derrière les coudes.
  const girthMat = st.western ? P.clothMat(0x8a6a48, THREE.FrontSide) : P.leatherMat(0x3b2110);
  // (la sangle part sous le quartier et passe sous le ventre, un peu inclinée vers l'avant)
  add(body, strap(loop(torso, [0, y0 - R * 0.2, model.dims.zGirth ?? zSeat + L * 0.13], 22, 0.014, deg(30), deg(-210), 0.3), st.western ? 0.045 : 0.03, 0.005), girthMat);
}

// ------------------------------------------------------------------ chien réaliste

/**
 * Bande plate (collier) autour d'une ellipse de demi-axes rx, ry (plan xy, z le long du cou) : tore de rayon 1 dont
 * le tube est aplati, épaisseur radiale 2 × th, largeur 2 × w. Géométrie mise à l'échelle (pas le maillage).
 */
export function flatBand(rx, ry, th, w) {
  const R = Math.max(rx, ry);
  const g = new THREE.TorusGeometry(1, th / R, 6, 32);
  g.scale(rx + th, ry + th, w * R / th);
  return g;
}

/**
 * Équipement du chien réaliste (dogReal.js), ajusté sur les mesures de sa race (model.dogFit) : collier autour de
 * l'encolure (anneau mesuré à 40 % du cou, ellipse de la coupe, avec boucle, anneau de laisse et médaille, porté
 * par l'os du cou), manteau taillé dans les coupes du tronc (du garrot aux hanches, sur le dos et les flancs) et lié
 * au squelette (il suit la respiration, les épaules et les hanches), avec sa bordure et ses sangles sous le ventre.
 */
function buildDogGear(model, gear, add) {
  const fit = model.dogFit;
  if (gear.neck && fit.collar?.bone) {
    const c = fit.collar;
    const color = gearColor(gear.neck, BLANKET_COLORS.red);
    const gap = 0.006;
    const ring = new THREE.Group();
    ring.position.copy(c.center);
    ring.quaternion.copy(c.q);
    // Bande plate : mince (épaisseur radiale 2 × th) et large le long du cou (2 × w), sur l'ellipse de la coupe de
    // l'encolure. (Le tube rond d'un rayon d'un huitième du cou faisait une bouée : 5 à 11 cm d'épaisseur.)
    const th = 0.0035;
    const w = 0.013;
    const geo = flatBand(c.rx + gap, c.ry + gap, th, w);
    const torus = new THREE.Mesh(geo, mat(color, 0.55));
    torus.castShadow = true;
    ring.add(torus);
    // Boucle, anneau (laisse) et médaille sous la gorge.
    const metal = mat(0xd2ab4e, 0.3, METAL);
    const band = w;
    const yb = -(c.ry + gap + th * 2);
    const buckle = new THREE.Mesh(new THREE.TorusGeometry(band * 0.8, band * 0.15, 6, 12), metal);
    buckle.position.set(0, yb, 0);
    ring.add(buckle);
    const medal = new THREE.Mesh(new THREE.CylinderGeometry(band * 0.9, band * 0.9, band * 0.2, 14), metal);
    medal.rotation.x = Math.PI / 2;
    medal.position.set(0, yb - band * 1.5, band * 0.3);
    ring.add(medal);
    // Anneau de la laisse sur le dessus de l'encolure (là où dogReal.js place leashPoint).
    const dRing = new THREE.Mesh(new THREE.TorusGeometry(band * 0.7, band * 0.14, 6, 12), metal);
    dRing.position.set(0, c.ry + gap + th * 2 + band * 0.6, 0);
    dRing.rotation.y = Math.PI / 2;
    ring.add(dRing);
    torus.userData.collarBand = true;
    medal.userData.collarMedal = true;
    add.group(c.bone, ring);
    // Chat réaliste (catReal.js skinCollar) : les pièces sont liées au squelette, la bande prend les poids de la peau
    // sous elle tout autour, boucle, médaille et anneau ceux de la bande à leur place. Rigide sur l'os du cou, l'anneau
    // quittait la peau dès que le cou se pliait (sa gorge suit surtout les pattes avant) : cerceau autour du poitrail
    // couché, bandoulière assis, barre au-dessus de la tête en mangeant. (ring reste, vide, sur l'os du cou : il porte
    // le sillon et ce qu'il faut libérer.)
    if (model.skinCollar) for (const sk of model.skinCollar(ring, c.rx + gap, c.ry + gap)) add.group(model.root, sk);
    // (le poil est serré sous la bande : sillon du collier dans la robe, retiré avec lui)
    const groove = { dispose: () => model.setGroove?.(ring, null) };
    model.setGroove?.(ring, { rx: c.rx + gap, ry: c.ry + gap, w });
    ring.userData.dispose = [geo, torus.material, buckle.geometry, medal.geometry, dRing.geometry, metal, groove];
  }
  if (gear.blanket && fit.rings?.length) {
    const color = gearColor(gear.blanket, BLANKET_COLORS.red);
    const rings = fit.rings.filter(([z]) => z > fit.hipZ - 0.01 && z < fit.shZ + 0.035);
    const A = 1.95; // demi-ouverture (rad) depuis le dos : jusque sous les flancs
    const NA = 18;
    const SECT = rings[0]?.[1].length ?? 24;
    const radiusAt = (r, a) => {
      const f = ((a / (Math.PI * 2)) * SECT % SECT + SECT) % SECT;
      const k = Math.floor(f);
      return r[k] + (r[(k + 1) % SECT] - r[k]) * (f - k);
    };
    const pos = [];
    const uv = [];
    const idx = [];
    // (centre de chaque coupe : son troisième nombre, sinon celui du tronc)
    rings.forEach(([z, r, yc = fit.ycAt], i) => {
      for (let j = 0; j <= NA; j++) {
        const a = -A + (2 * A * j) / NA;
        const rr = radiusAt(r, a) + 0.012;
        pos.push(fit.midX + Math.sin(a) * rr, yc + Math.cos(a) * rr, z);
        uv.push(j / NA, i / Math.max(1, rings.length - 1));
      }
    });
    const row = NA + 1;
    for (let i = 0; i < rings.length - 1; i++) {
      for (let j = 0; j < NA; j++) {
        const a = i * row + j;
        idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide });
    add.skin(add(model.root, geo, cloth));
    // Bordure claire tout autour, sangles sous le ventre (à l'avant et à l'arrière).
    const trim = [];
    const ends = [rings[0], rings[rings.length - 1]];
    for (const [z, r, yc = fit.ycAt] of ends) {
      const pts = [];
      for (let j = 0; j <= NA; j++) {
        const a = -A + (2 * A * j) / NA;
        const rr = radiusAt(r, a) + 0.016;
        pts.push(new THREE.Vector3(fit.midX + Math.sin(a) * rr, yc + Math.cos(a) * rr, z));
      }
      trim.push(pts);
    }
    for (const pts of trim) add.skin(add(model.root, strap(pts, 0.007, 0.004), mat(0xf2ede4, 0.8)));
    const belt = mat(0x2a2a2a, 0.6);
    for (const t of [0.22, 0.8]) {
      const [z, r, yc = fit.ycAt] = rings[Math.min(rings.length - 1, Math.round(t * (rings.length - 1)))];
      const pts = [];
      for (let j = 0; j <= 24; j++) {
        const a = A + ((Math.PI * 2 - 2 * A) * j) / 24;
        const rr = radiusAt(r, a) + 0.01;
        pts.push(new THREE.Vector3(fit.midX + Math.sin(a) * rr, yc + Math.cos(a) * rr, z));
      }
      add.skin(add(model.root, strap(pts, 0.008, 0.003), belt));
    }
  }
}

// ------------------------------------------------------------------ autres animaux

/**
 * Licol et masque anti-mouches des ruminants réalistes (cowReal.js, goatReal.js), posés sur la tête mesurée
 * (model.headFit, ruminantGear.js : coupes de la tête du gabarit, repère de l'os de la tête) : muserolle et têtière en
 * sangles plates fermées, montants sur les joues, anneau sous le menton (la longe), et pour la vache une coque de
 * maille claire sur le front et les yeux. Le licol générique, taillé pour la tête procédurale, passait sous la peau.
 */
function buildRuminantGear(model, gear, add) {
  const fit = model.headFit;
  const bone = fit.bone;
  if (gear.halter) {
    const item = gear.halter.item;
    const color = gearColor(gear.halter, BLANKET_COLORS.red);
    // (licol de corde : rond, un peu plus épais ; en cuir : plus brillant)
    const rope = item === 'halterRope';
    const w = rope ? fit.th * 1.7 : fit.w;
    const th = rope ? fit.th * 1.7 : fit.th;
    const m = mat(color, item === 'halterLeather' ? 0.45 : rope ? 0.85 : 0.65);
    add(bone, strap(fit.noseband, w, th, true), m);
    add(bone, strap(fit.crown, w, th), m);
    for (const c of fit.cheeks) add(bone, strap(c, w * 0.9, th), m);
    const ring = add(bone, new THREE.TorusGeometry(fit.ringR, fit.ringR * 0.2, 8, 18), mat(0xc9c9c9, 0.3, METAL), [fit.ring.x, fit.ring.y, fit.ring.z]);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fit.ringN);
  }
  if (gear.head) {
    const color = gearColor(gear.head, 0xd8e4ea);
    const net = new THREE.MeshStandardMaterial({ color, roughness: 0.9, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false });
    const m = add(bone, shellGeometry(fit.shell), net);
    m.castShadow = false;
    // (bordure de la coque : un liseré plus foncé)
    const rows = fit.shell;
    const nz = rows.length;
    const na = rows[0].length;
    const edge = [
      ...rows.map((r) => r[0]), ...rows[nz - 1].slice(1),
      ...rows.slice(0, nz - 1).map((r) => r[na - 1]).reverse(), ...rows[0].slice(1, na - 1).reverse(),
    ];
    add(bone, strap(edge, fit.w * 0.45, fit.th * 0.8, true), mat(new THREE.Color(color).multiplyScalar(0.55), 0.8));
  }
}

function buildGenericGear(model, look, gear, add, L, R, y0) {
  const back = model.saddleY ?? y0 + R;

  const blanket = gear.blanket;
  if (blanket) {
    const color = gearColor(blanket, BLANKET_COLORS.red);
    const geo = new THREE.CylinderGeometry(R * 1.12, R * 1.12, L * 0.82, 24, 1, true, -Math.PI * 0.62, Math.PI * 1.24);
    geo.rotateX(Math.PI / 2);
    add(model.body, geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide }), [0, y0 + R * 0.05, -L * 0.03]);
    // Bordure claire et sangles sous le ventre.
    const edge = new THREE.TorusGeometry(R * 1.12, R * 0.04, 6, 24, Math.PI * 1.24);
    edge.rotateZ(-Math.PI * 0.12);
    add(model.body, edge, mat(0xf2ede4), [0, y0 + R * 0.05, L * 0.38]);
    const strap = mat(0x2a2a2a, 0.6);
    for (const z of [-L * 0.2, L * 0.15]) add(model.body, new THREE.TorusGeometry(R * 1.1, R * 0.025, 6, 20, Math.PI * 0.8), strap, [0, y0 + R * 0.05, z], [0, 0, Math.PI + Math.PI * 0.1]);
  }
  if (gear.saddle) {
    const leather = mat(gearColor(gear.saddle, 0x8a5a2e), 0.5);
    const dark = mat(0x2a1a10, 0.6);
    const sz = L * 0.08; // centre de la selle
    // Siège : profil creusé, troussequin relevé derrière, pommeau devant.
    const seat = loft([[-0.3, 0.3, 0.1], [-0.22, 0.42, 0.22], [-0.1, 0.4, 0.1], [0.05, 0.38, 0.07], [0.18, 0.38, 0.12], [0.26, 0.32, 0.2], [0.3, 0.2, 0.08]]
      .map(([z, w, h]) => ({ p: [0, back + R * 0.06 + h * R, sz + z * L * 0.75], rx: w * R, ry: R * 0.09, ryb: R * 0.12 })), { radial: 14, sub: 3, round: [0.5, 0.5] });
    add(model.body, seat, leather, [0, 0, 0]);
    // Quartiers de chaque côté et tapis de selle à liseré.
    for (const s of [1, -1]) {
      add(model.body, new THREE.BoxGeometry(0.02, R * 0.75, R * 0.9), leather, [s * R * 0.9, back - R * 0.35, sz + R * 0.1], [0, 0, s * 0.3]);
      // Étrivière et étrier.
      add(model.body, new THREE.BoxGeometry(0.02, R * 1.2, 0.03), dark, [s * R * 1.0, back - R * 0.75, sz + R * 0.05]);
      add(model.body, new THREE.TorusGeometry(0.05, 0.012, 6, 12), mat(0xc0c4c8, 0.3, METAL), [s * R * 1.02, back - R * 1.35, sz + R * 0.05], [0, Math.PI / 2, 0]);
      add(model.body, new THREE.BoxGeometry(0.02, 0.012, 0.06), mat(0xc0c4c8, 0.3, METAL), [s * R * 1.02, back - R * 1.4, sz + R * 0.05]);
    }
    add(model.body, new THREE.BoxGeometry(R * 1.95, R * 0.05, R * 1.25), mat(0xe9e2d4, 0.9), [0, back - R * 0.04, sz + R * 0.02]);
    add(model.body, new THREE.BoxGeometry(R * 2.05, R * 0.045, R * 1.35), mat(gear.pad ? gearColor(gear.pad, 0x2f5f9e) : 0x2f5f9e, 0.9), [0, back - R * 0.06, sz + R * 0.02]);
    if (gear.saddle.item === 'saddleWestern') add(model.body, new THREE.CylinderGeometry(R * 0.06, R * 0.08, R * 0.25, 10), leather, [0, back + R * 0.45, sz + L * 0.22]); // corne
    // Sangle sous le ventre.
    add(model.body, new THREE.TorusGeometry(R * 1.05, R * 0.03, 6, 22, Math.PI * 0.9), dark, [0, y0 + R * 0.05, sz + R * 0.15], [0, 0, Math.PI + Math.PI * 0.05]);
  }
  if (gear.bridle && model.head) {
    const hr = look.headR;
    const strap = mat(gearColor(gear.bridle, 0x2a1a10), 0.5);
    const buckle = mat(0xc0c0c0, 0.3, METAL);
    add(model.head, new THREE.TorusGeometry(hr * 0.95, hr * 0.06, 6, 20), strap, [0, -hr * 0.1, look.headLen * 0.75]);
    add(model.head, new THREE.TorusGeometry(hr * 1.15, hr * 0.06, 6, 20), strap, [0, hr * 0.1, hr * 0.1], [0, 0, 0]);
    add(model.head, new THREE.TorusGeometry(hr * 1.0, hr * 0.05, 6, 20), strap, [0, hr * 0.2, -hr * 0.4], [0.3, 0, 0]); // frontal / têtière
    for (const s of [1, -1]) {
      add(model.head, new THREE.BoxGeometry(hr * 0.1, hr * 0.06, look.headLen * 0.62), strap, [s * hr * 0.95, -hr * 0.05, look.headLen * 0.4], [0.1, 0, 0]); // montant
      add(model.head, new THREE.TorusGeometry(hr * 0.12, hr * 0.03, 6, 12), buckle, [s * hr * 0.8, -hr * 0.2, look.headLen * 0.85], [0, Math.PI / 2, 0]); // anneau du mors
    }
  }
  if (gear.halter && !gear.bridle && model.head) {
    const hr = look.headR;
    const color = gearColor(gear.halter, BLANKET_COLORS.red);
    const strap = mat(color, 0.6);
    const nz = look.headLen * 0.7;
    add(model.head, new THREE.TorusGeometry(hr * 0.9, hr * 0.08, 6, 20), strap, [0, -hr * 0.1, nz]); // muserolle
    add(model.head, new THREE.TorusGeometry(hr * 1.12, hr * 0.08, 6, 20), strap, [0, hr * 0.05, hr * 0.15]); // têtière
    for (const s of [1, -1]) add(model.head, new THREE.BoxGeometry(hr * 0.12, hr * 0.08, nz - hr * 0.15), strap, [s * hr * 0.95, -hr * 0.04, (nz + hr * 0.15) / 2], [0.08, 0, 0]); // montants
    add(model.head, new THREE.TorusGeometry(hr * 0.14, hr * 0.03, 6, 12), mat(0xc9c9c9, 0.3, METAL), [0, -hr * 0.95, nz - hr * 0.1], [0.4, 0, 0]); // anneau sous le menton
  }
  if (gear.head && model.head) {
    const hr = look.headR;
    add(model.head, new THREE.SphereGeometry(hr * 1.25, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: 0xd8e4ea, roughness: 0.9, transparent: true, opacity: 0.75 }), [0, hr * 0.15, hr * 0.3]);
  }
  if (gear.legs) {
    for (const leg of model.legs) {
      const len = y0 - R * 0.3;
      const boot = mat(gearColor(gear.legs, 0x22324a), 0.8);
      if (leg.knee) {
        // Guêtre sur le canon (sous le genou), avec ses deux bandes de fermeture.
        const kneeY = leg.knee.position.y;
        const lower = -len - kneeY; // du genou jusqu'au sol (négatif)
        const bl = -lower * 0.55;
        add(leg.knee, new THREE.CylinderGeometry(look.legR * 1.45, look.legR * 1.6, bl, 10), boot, [0, lower * 0.58, leg.knee.position.z * 0.2]);
        for (const k of [0.35, 0.75]) add(leg.knee, new THREE.TorusGeometry(look.legR * 1.55, look.legR * 0.18, 6, 12), mat(0xd0d6dc, 0.6), [0, lower * 0.58 + (k - 0.55) * bl, leg.knee.position.z * 0.2], [Math.PI / 2, 0, 0]);
      } else {
        add(leg.pivot, new THREE.CylinderGeometry(look.legR * 1.5, look.legR * 1.6, len * 0.28, 10), boot, [0, -len * 0.78, 0]);
      }
    }
  }
  if (gear.neck && model.neck) {
    const color = gearColor(gear.neck, BLANKET_COLORS.red);
    const r = R * 0.6;
    const ny = look.neckLen * 0.6;
    add(model.neck, new THREE.TorusGeometry(r, R * 0.08, 6, 18), mat(color, 0.5), [0, ny, 0], [Math.PI / 2, 0, 0]);
    // Boucle et médaille.
    add(model.neck, new THREE.TorusGeometry(R * 0.07, R * 0.02, 6, 10), mat(0xd2ab4e, 0.3, METAL), [0, ny - R * 0.05, r * 0.95], [0.4, 0, 0]);
    add(model.neck, new THREE.CylinderGeometry(R * 0.08, R * 0.08, R * 0.02, 12), mat(0xd2ab4e, 0.3, METAL), [0, ny - R * 0.18, r * 0.95], [Math.PI / 2 + 0.4, 0, 0]);
  }
}

export function removeGear(group) {
  for (const m of group.userData.meshes ?? []) {
    m.parent?.remove(m);
    // (collier du chien réaliste : groupe à lui, ses pièces sont libérées avec lui)
    for (const x of m.userData?.dispose ?? []) x.dispose?.();
    if (!m.isMesh) continue; // groupe de pièces partagées (étrier…)
    if (!m.geometry.userData.shared) m.geometry.dispose(); // les pièces partagées (src/game/models/tackModels.js) restent
    m.userData.homeGeo?.dispose(); // (étrivière mise à la longueur du cavalier : sa forme d'origine)
    if (!m.material.userData.shared) m.material.dispose();
  }
}
