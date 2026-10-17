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

/** Sangle plate qui suit une liste de points (fermée si closed). */
function strap(pts, halfWidth, thick, closed = false) {
  const list = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : pts;
  return solid(loft(list.map((p) => ({ p: [p.x, p.y, p.z], rx: halfWidth, ry: thick })), {
    radial: 6, sub: closed ? 1 : 2, side: [0, 0, 1], capStart: !closed, capEnd: !closed,
  }));
}

/**
 * Nappe posée sur une forme : grille (z, angle) de points pris sur la surface, décalés de out.
 * Sert à la couverture, au tapis de selle et au bonnet anti-mouches.
 */
function shell(sdf, yc, z0, z1, nz, a0, a1, na, out, tilt = 0) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i < nz; i++) {
    const z = z0 + ((z1 - z0) * i) / (nz - 1);
    const pts = loop(sdf, [0, yc, z], na, out, a0, a1, tilt);
    for (let j = 0; j < na; j++) {
      pos.push(pts[j].x, pts[j].y, pts[j].z);
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
  // Un petit groupe tout fait (ex. un étrier du catalogue) : ses pièces sont partagées, on le retire en bloc.
  add.group = (parent, obj) => {
    parent.add(obj);
    holders.push(obj);
    return obj;
  };
  if (model.sdf) buildHorseGear(model, look, gear, add);
  else if (model.gearFit) buildHorseGear(model.gearFit, look, gear, add); // cheval GLB (src/game/models/gltfHorseFit.js)
  else buildGenericGear(model, look, gear, add, L, R, y0);
  group.userData.meshes = holders;
  // Où s'attachent les rênes (anneaux du mors, ou côtés de la muserolle du hackamore) : Player les tend
  // jusqu'aux mains du cavalier. { parent, points (repère du parent), color }.
  if (add.reins) group.userData.reins = add.reins;
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
    add(body, shell(torso, y0 - R * 0.2, bz0, front, 12, deg(192), deg(-12), 20, id === 'blanket' ? 0.016 : 0.011), cloth);
    const edge = loop(torso, [0, y0 - R * 0.2, front], 20, 0.018, deg(192), deg(-12));
    add(body, strap(edge, 0.018, 0.006), id === 'blanket' ? P.fleeceMat(0xe8e0d2) : P.clothMat(id === 'blanketSummer' ? 0x3a3a3a : 0xf2ede4));
    // Galon le long du bas des flancs.
    for (const sd of [1, -1]) {
      const hem = [];
      for (let i = 0; i <= 10; i++) {
        const z = bz0 + 0.02 + (i / 10) * (front - bz0 - 0.04);
        const p = rayHit(torso, [0, y0 - R * 0.2, z], [sd * Math.cos(deg(-12)), Math.sin(deg(-12)), 0], 1.2);
        hem.push(p.addScaledVector(sdfNormal(torso, p, 0.004), 0.016));
      }
      add(body, strap(hem, 0.014, 0.004), P.clothMat(id === 'blanketSummer' ? 0x3a3a3a : 0xf2ede4));
    }
    // Sangle de poitrail et sous-ventrières croisées.
    add(body, strap(loop(torso, [0, y0 - R * 0.2, model.dims.zGirth ?? L * 0.02], 16, 0.018, deg(-15), deg(-165)), 0.014, 0.004), P.nylonMat(0x2a2a2a));
  }

  if (gear.saddle) horseSaddle(model, gear, add);
  else if (gear.pad) horsePad(model, gear, add, SADDLE_STYLES.saddle); // tapis seul (sans selle) : il se voit

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
    const w = rope ? 0.006 : halter ? 0.015 : 0.011; // demi-largeur des sangles (le licol est en toile plus large)
    const th = rope ? 0.006 : 0.0045;
    // Corde ronde (licol éthologique) ou sangle plate ; une boucle fermée ne répète pas son premier point.
    const band = (pts, closed = false) => (rope ? P.tube(closed ? pts.slice(0, -1).map((v) => v.toArray()) : pts.map((v) => v.toArray()), 0.005, closed, 6) : strap(pts, w, th, closed));
    const yc = -hr * 0.2;
    // Muserolle : autour du nez, entre les yeux et les naseaux (en mouton pour le hackamore).
    const zNose = snoutZ - hr * (halter ? 1.45 : bid === 'hackamore' ? 1.1 : 1.3);
    const nose = loop(head, [0, yc, zNose], 22, bid === 'hackamore' ? 0.014 : 0.006);
    if (bid === 'hackamore') add(model.head, strap(nose, 0.02, 0.012, true), P.fleeceMat(0xf2eee6));
    else add(model.head, band(nose, true), strapMat);
    // Têtière et sous-gorge : boucle derrière les oreilles, qui passe sous la gorge.
    const zCrown = earZ - hr * 0.15;
    const crown = loop(head, [0, hr * 0.05, zCrown], 22, 0.006, 0, PI * 2, 0.38);
    add(model.head, band(crown, true), strapMat);
    // Montants : de la têtière (côté) vers la muserolle ou le mors.
    const sideOf = (pts) => [pts[0], pts[Math.round(pts.length / 2) - 1]];
    // Montant : il suit la joue (la ligne droite entre ses deux bouts rentrerait dans la tête).
    const cheek = (a, b) => {
      const pts = [a];
      for (const f of [0.25, 0.5, 0.75]) {
        const m = new THREE.Vector3().lerpVectors(a, b, f);
        const p = rayHit(head, [0, yc, m.z], [m.x, m.y - yc, 0], hr * 4);
        pts.push(p.addScaledVector(sdfNormal(head, p, 0.004), rope ? 0.008 : 0.007));
      }
      pts.push(b);
      return pts;
    };
    const [cR, cL] = sideOf(crown);
    const [nR, nL] = sideOf(nose);
    if (bridle) {
      add(model.head, strap(loop(head, [0, hr * 0.15, earZ + hr * 0.3], 12, 0.006, deg(20), deg(160)), w, th), strapMat); // frontal
      if (bid === 'doubleBridle' || bid === 'bridleOlive') {
        // Frontal à strass.
        for (const p of loop(head, [0, hr * 0.15, earZ + hr * 0.3], 9, 0.012, deg(30), deg(150))) {
          add(model.head, P.shared('gearGem', () => new THREE.SphereGeometry(0.006, 6, 5)), P.steelMat(), p.toArray());
        }
      }
      const reinPts = [];
      add.reins = { parent: model.head, points: reinPts, color };
      for (const [c, s] of [[cR, 1], [cL, -1]]) {
        const m = rayHit(head, [0, -hr * 0.42, snoutZ - hr * 0.8], [s, -0.1, 0], hr * 3);
        const ring = m.clone().add(new THREE.Vector3(s * hr * 0.1, 0, 0));
        reinPts.push(ring.clone());
        if (bid === 'hackamore') {
          // Pas de mors : le montant descend à la muserolle, une branche en métal pend sur le côté du nez.
          const n = s > 0 ? nR : nL;
          reinPts[reinPts.length - 1] = n.clone().add(new THREE.Vector3(s * 0.01, -hr * 0.6, hr * 0.12));
          add(model.head, strap(cheek(c, n), w * 0.9, th), strapMat);
          add(model.head, P.tube([n.toArray(), [n.x + s * 0.01, n.y - hr * 0.35, n.z + hr * 0.15], [n.x + s * 0.008, n.y - hr * 0.7, n.z + hr * 0.1]], 0.005), P.steelMat());
          continue;
        }
        add(model.head, strap(cheek(c, ring), w * 0.9, th), strapMat);
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
        add(model.head, band(cheek(c, n)), strapMat);
        if (rope) add(model.head, P.shared('gearKnot', () => new THREE.SphereGeometry(0.011, 8, 6)), strapMat, n.toArray());
      }
      // Anneau (ou gros nœud) sous le menton, pour la longe.
      const chin = nose[Math.round(nose.length * 0.75)];
      if (rope) add(model.head, P.shared('gearKnot', () => new THREE.SphereGeometry(0.011, 8, 6)), strapMat, [chin.x, chin.y - hr * 0.08, chin.z]);
      else add(model.head, new THREE.TorusGeometry(hr * 0.14, hr * 0.03, 6, 12), metal, [chin.x, chin.y - hr * 0.1, chin.z], [0, 0, 0]);
      if (leatherHalter) for (const p of [cR, cL]) add(model.head, P.shared('gearBuckle', () => new THREE.BoxGeometry(0.02, 0.016, 0.006)), metal, p.toArray());
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

/**
 * Tapis (ou amortisseur) sous la selle de style st : celui qu'on a mis, sinon un tapis blanc tout simple.
 * Aussi seul (sans selle). Renvoie son épaisseur (la selle se pose dessus).
 */
function horsePad(model, gear, add, st) {
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
    const trim = pad.item === 'gelPad' ? padColor : padColor === COLORS.white ? COLORS.navy : 0xf1ede4;
    add(model.body, strap(loop(torso, [0, y0 - R * 0.2, zSeat + padHalf], 14, padT + 0.004, deg(180 - padDrop), deg(padDrop)), 0.008, 0.004), P.clothMat(trim));
  }
  return padT;
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
      add(body, P.plate(fOut, flen, fMap, 4, 8), P.tooledMat(color));
      const end = new THREE.Vector3(...fMap(0.02 * k, flen));
      add(body, P.shared('gearOxbow', () => new THREE.TorusGeometry(0.055, 0.014, 6, 16, PI)), P.woodMat(), [end.x + side * 0.01, end.y - 0.06, end.z], [0, PI / 2, PI]);
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
    add(body, loft(spts.map((p) => ({ p, rx: 0.013 * k, ry: 0.0025 })), { radial: 6, sub: 2, side: [0, 0, 1], exp: 4 }), edgeM);
    const end = spts[spts.length - 1];
    const ironK = (st.race ? 0.75 : 1) * k;
    const iron = P.stirrupIron(Math.round(ironK * 100) / 100);
    iron.position.set(end[0] + side * 0.014, end[1] - 0.055 * ironK, end[2]);
    iron.rotation.z = side * 0.25;
    add.group(body, iron);
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

// ------------------------------------------------------------------ autres animaux

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
    if (!m.isMesh) continue; // groupe de pièces partagées (étrier…)
    if (!m.geometry.userData.shared) m.geometry.dispose(); // les pièces partagées (src/game/models/tackModels.js) restent
    if (!m.material.userData.shared) m.material.dispose();
  }
}
