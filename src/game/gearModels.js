// Équipement visible sur l'animal en 3D : couverture, selle, filet, licol, guêtres, bonnet, collier.
// Sur le cheval, les pièces épousent le corps sculpté (champ de distance) : sangle sous le ventre,
// muserolle autour du nez, couverture posée sur le dos.

import * as THREE from 'three';
import { BLANKET_COLORS } from '../sim/gear.js';
import { loft } from './models/shapes.js';
import { rayHit, sdfNormal } from './models/sdf.js';

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
  if (model.sdf) buildHorseGear(model, look, gear, add);
  else buildGenericGear(model, look, gear, add, L, R, y0);
  group.userData.meshes = holders;
  return group;
}

// ------------------------------------------------------------------ cheval

function buildHorseGear(model, look, gear, add) {
  const { torso, head } = model.sdf;
  const { L, R, hr, snoutZ, earZ } = model.dims;
  const y0 = model.y0;
  const body = model.body;
  const PI = Math.PI;
  const deg = (d) => (d * PI) / 180;
  const zSeat = -L * 0.05; // là où s'assoit le cavalier (src/game/Player.js)

  const blanket = gear.blanket;
  if (blanket) {
    const color = BLANKET_COLORS[blanket.color] ?? BLANKET_COLORS.red;
    const cloth = mat(color, 0.9, { side: THREE.DoubleSide });
    // Couverture : du garrot à la queue, retombant sur les flancs ; liseré clair devant.
    add(body, shell(torso, y0 - R * 0.2, -L * 0.52, L * 0.3, 12, deg(192), deg(-12), 20, 0.012), cloth);
    const edge = loop(torso, [0, y0 - R * 0.2, L * 0.3], 20, 0.016, deg(192), deg(-12));
    add(body, strap(edge, 0.018, 0.005), mat(0xf2ede4, 0.9));
    // Sangle de poitrail et sous-ventrière.
    add(body, strap(loop(torso, [0, y0 - R * 0.2, L * 0.02], 16, 0.014, deg(-15), deg(-165)), 0.014, 0.004), mat(0x332a26, 0.6));
  }

  if (gear.saddle) {
    const leather = mat(0x5a3418, 0.45);
    const dark = mat(0x3b2110, 0.5);
    const yc = y0 - R * 0.2;
    // Tapis de selle (blanc cassé) sous la selle, qui dépasse un peu ; repoussé en profondeur pour que
    // le quartier, posé dessus, ne le traverse jamais (plus de bande « déchirée »).
    add(body, shell(torso, yc, zSeat - L * 0.2, zSeat + L * 0.22, 8, deg(165), deg(15), 14, 0.01),
      mat(0xe9e2d4, 0.9, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
    // Siège plein : profil creusé, pommeau relevé devant, troussequin derrière, assis sur le tapis.
    const secs = [];
    const N = 9;
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const z = zSeat - L * 0.14 + f * L * 0.28;
      const dip = Math.sin(f * PI);
      const lift = f < 0.5 ? (0.5 - f) ** 2 * 0.2 : (f - 0.5) ** 2 * 0.28;
      const back = model.backTop(z) + 0.012; // dessus du tapis
      secs.push({ p: [0, back + 0.024 - dip * 0.008 + lift, z], rx: R * (0.3 + dip * 0.2), ry: 0.016 + lift * 0.5, ryb: 0.03 + lift + dip * 0.008 });
    }
    add(body, solid(loft(secs, { radial: 14, sub: 2, exp: 2.6, round: [0.6, 0.6] })), leather);
    const flapMat = mat(0x5a3418, 0.5, { side: THREE.DoubleSide });
    const steel = mat(STEEL, 0.3, { metalness: 0.6 });
    for (const s of [1, -1]) {
      // Quartier : pan de cuir qui épouse le flanc (grille posée sur le corps, au-dessus du tapis).
      const a0 = s > 0 ? deg(80) : deg(100);
      const a1 = s > 0 ? deg(8) : deg(172);
      add(body, shell(torso, yc, zSeat - L * 0.03, zSeat + L * 0.15, 6, a0, a1, 9, 0.02), flapMat);
      // Étrivière le long du quartier, étrier qui pend sous son bord.
      const top = rayHit(torso, [0, yc, zSeat + L * 0.07], [s * Math.cos(deg(70)), Math.sin(deg(70)), 0], 1.2);
      top.addScaledVector(sdfNormal(torso, top, 0.004), 0.026);
      const low = rayHit(torso, [0, yc, zSeat + L * 0.08], [s * Math.cos(deg(-8)), Math.sin(deg(-8)), 0], 1.2);
      const iron = low.clone().addScaledVector(sdfNormal(torso, low, 0.004), 0.05).add(new THREE.Vector3(0, -0.04, 0));
      const mid = rayHit(torso, [0, yc, zSeat + L * 0.075], [s * Math.cos(deg(30)), Math.sin(deg(30)), 0], 1.2);
      mid.addScaledVector(sdfNormal(torso, mid, 0.004), 0.03);
      add(body, strap([top, mid, iron], 0.013, 0.003), dark);
      add(body, new THREE.TorusGeometry(0.05, 0.008, 6, 16), steel, [iron.x, iron.y - 0.045, iron.z], [0, PI / 2, 0]);
      add(body, new THREE.BoxGeometry(0.012, 0.012, 0.07), steel, [iron.x, iron.y - 0.093, iron.z]); // semelle de l'étrier
    }
    // Sangle : part sous le quartier, passe sous le ventre derrière les coudes (un peu inclinée vers
    // l'avant, dans le passage de sangle).
    add(body, strap(loop(torso, [0, yc, zSeat + L * 0.13], 22, 0.014, deg(30), deg(-210), 0.3), 0.03, 0.005), dark);
  }

  const bridle = gear.bridle;
  const halter = gear.halter && !bridle;
  if (bridle || halter) {
    const color = halter ? (BLANKET_COLORS[gear.halter.color] ?? BLANKET_COLORS.red) : LEATHER;
    const strapMat = mat(color, halter ? 0.75 : 0.45);
    const w = halter ? 0.015 : 0.011; // demi-largeur des sangles (le licol est en toile plus large)
    const th = 0.0045;
    const yc = -hr * 0.2;
    // Muserolle : autour du nez, entre les yeux et les naseaux.
    const zNose = snoutZ - hr * (halter ? 1.45 : 1.3);
    const nose = loop(head, [0, yc, zNose], 22, 0.006);
    add(model.head, strap(nose, w, th, true), strapMat);
    // Têtière et sous-gorge : boucle derrière les oreilles, qui passe sous la gorge.
    const zCrown = earZ - hr * 0.15;
    const crown = loop(head, [0, hr * 0.05, zCrown], 22, 0.006, 0, PI * 2, 0.38);
    add(model.head, strap(crown, w, th, true), strapMat);
    // Montants : de la têtière (côté) vers la muserolle ou le mors.
    const sideOf = (pts) => [pts[0], pts[Math.round(pts.length / 2) - 1]];
    const [cR, cL] = sideOf(crown);
    const [nR, nL] = sideOf(nose);
    if (bridle) {
      add(model.head, strap(loop(head, [0, hr * 0.15, earZ + hr * 0.3], 12, 0.006, deg(20), deg(160)), w, th), strapMat); // frontal
      for (const [c, s] of [[cR, 1], [cL, -1]]) {
        // Anneau du mors à la commissure des lèvres.
        const m = rayHit(head, [0, -hr * 0.42, snoutZ - hr * 0.8], [s, -0.1, 0], hr * 3);
        const ring = m.clone().add(new THREE.Vector3(s * hr * 0.1, 0, 0));
        add(model.head, strap([c, new THREE.Vector3().lerpVectors(c, ring, 0.5).add(new THREE.Vector3(s * 0.006, 0, 0)), ring], w * 0.9, th), strapMat);
        add(model.head, new THREE.TorusGeometry(hr * 0.24, hr * 0.035, 6, 16), mat(STEEL, 0.3, { metalness: 0.6 }), ring.toArray(), [0, PI / 2, 0]);
      }
    } else {
      for (const [c, n, s] of [[cR, nR, 1], [cL, nL, -1]]) {
        add(model.head, strap([c, new THREE.Vector3().lerpVectors(c, n, 0.5).add(new THREE.Vector3(s * 0.006, 0, 0)), n], w, th), strapMat);
      }
      // Anneau sous le menton, pour la longe.
      const chin = nose[Math.round(nose.length * 0.75)];
      add(model.head, new THREE.TorusGeometry(hr * 0.14, hr * 0.03, 6, 12), mat(STEEL, 0.3, { metalness: 0.6 }), [chin.x, chin.y - hr * 0.1, chin.z], [0, 0, 0]);
    }
  }

  if (gear.head) {
    // Bonnet anti-mouches : voile clair qui couvre le front, les yeux et le haut des joues.
    const g = shell(head, hr * 0.05, earZ - hr * 0.1, snoutZ - hr * 1.45, 8, deg(200), deg(-20), 14, 0.012);
    add(model.head, g, new THREE.MeshStandardMaterial({ color: 0xd8e4ea, roughness: 0.9, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
    add(model.head, strap(loop(head, [0, hr * 0.05, snoutZ - hr * 1.45], 14, 0.014, deg(200), deg(-20)), 0.01, 0.004), mat(0x9fb3bd, 0.8));
  }

  if (gear.legs) {
    // Guêtres sur les canons, du genou (ou du jarret) au boulet.
    const T = model.legTop;
    const r = model.dims.legR;
    for (const leg of model.legs) {
      const parent = leg.knee ?? leg.pivot;
      const len = (leg.front ? 0.27 : 0.2) * T;
      const boot = new THREE.CylinderGeometry(r * 1.0, r * 1.08, len, 10);
      add(parent, boot, mat(0x22324a, 0.8), [0, -0.07 * T - len / 2, 0]);
      add(parent, new THREE.CylinderGeometry(r * 1.1, r * 1.1, len * 0.18, 10), mat(0x8da0b8, 0.7), [0, -0.07 * T - len * 0.4, 0]);
    }
  }
}

// ------------------------------------------------------------------ autres animaux

function buildGenericGear(model, look, gear, add, L, R, y0) {
  const back = model.saddleY ?? y0 + R;

  const blanket = gear.blanket;
  if (blanket) {
    const color = BLANKET_COLORS[blanket.color] ?? BLANKET_COLORS.red;
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
    const leather = mat(0x8a5a2e, 0.5);
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
    add(model.body, new THREE.BoxGeometry(R * 2.05, R * 0.045, R * 1.35), mat(0x2f5f9e, 0.9), [0, back - R * 0.06, sz + R * 0.02]);
    // Sangle sous le ventre.
    add(model.body, new THREE.TorusGeometry(R * 1.05, R * 0.03, 6, 22, Math.PI * 0.9), dark, [0, y0 + R * 0.05, sz + R * 0.15], [0, 0, Math.PI + Math.PI * 0.05]);
  }
  if (gear.bridle && model.head) {
    const hr = look.headR;
    const strap = mat(0x2a1a10, 0.5);
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
    const color = BLANKET_COLORS[gear.halter.color] ?? BLANKET_COLORS.red;
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
      const boot = mat(0x22324a, 0.8);
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
    const color = BLANKET_COLORS[gear.neck.color] ?? BLANKET_COLORS.red;
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
    m.geometry.dispose();
    m.material.dispose();
  }
}
