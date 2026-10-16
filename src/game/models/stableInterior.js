// Écurie où l'on entre : une grande porte, une allée, des box à demi-portes (4 au début,
// les autres servent de réserve tant qu'on ne les a pas achetés), le foin, l'eau et la sellerie.
// Repère local : 16 m (x) × 10 m (z), la porte regarde vers +Z. On peut la rallonger (vue construction) :
// deux colonnes de box de plus à chaque fois (8 → 12 → 16 box), une de chaque côté de l'entrée.
//
//   z = -5  ┌────┬────┬────┬────┬────┐   rangée du fond : box 3, 0, 1, 2, 6
//           │ B3 │ B0 │ B1 │ B2 │ B6 │
//   z = -1.4├─▭──┴─▭──┴─▭──┴─▭──┴─▭──┤
//           │          allée         │
//   z = 1.4 ├─▭──┬─▭──┬      ┬─▭──┬─▭─┤   devant : sellerie, box 4, entrée, box 5, box 7
//           │sel.│ B4 │entrée│ B5 │ B7 │
//   z = 5   └────┴────┴ ⇧⇧⇧ ┴────┴────┘

import * as THREE from 'three';
import { mat, add, WallKit, gableRoof, gables, plankTexture, tileTexture, texturedMat, plateTexture, bale } from './interiorKit.js';

export const STABLE_W = 16;
export const STABLE_D = 10;
const H = 3.2;
const CUT = 1.3;
const AISLE = 1.4; // l'allée va de z = -1.4 à z = 1.4
const BOX_W = 3.2;
const DOOR_GAP = 1.7;

/** Nombre de colonnes (de 3,2 m) et longueur de l'écurie pour une taille donnée (0, 1, 2). */
export const stableColumns = (ext = 0) => 5 + 2 * ext;
export const stableWidth = (ext = 0) => stableColumns(ext) * BOX_W;

/**
 * Box dans l'ordre où on les débloque : x du centre et rangée (-1 fond, +1 devant).
 * Les 8 premiers ne changent pas de rôle quand on rallonge ; les nouveaux s'ajoutent aux deux bouts.
 */
export function boxSlots(ext = 0) {
  const m = (stableColumns(ext) - 1) / 2; // colonne de l'entrée
  const order = [[-1, m - 1], [-1, m], [-1, m + 1], [-1, m - 2], [1, m - 1], [1, m + 1], [-1, m + 2], [1, m + 2]];
  for (let k = 1; k <= ext; k++) order.push([-1, m + 2 + k], [1, m + 2 + k], [-1, m - 2 - k], [1, m - 1 - k]);
  return order.map(([row, col]) => ({ cx: (col - m) * BOX_W, row }));
}
export const BOX_SLOTS = boxSlots(0);

const rowRange = (row) => (row < 0 ? [-STABLE_D / 2, -AISLE] : [AISLE, STABLE_D / 2]);

/** Pièces (pour la navigation) : chaque pièce a une porte sur un mur. */
export function stableRooms(ext = 0) {
  const W = stableWidth(ext);
  const rooms = boxSlots(ext).map((b, i) => {
    const [z0, z1] = rowRange(b.row);
    return { id: `box${i}`, box: i, x0: b.cx - BOX_W / 2, x1: b.cx + BOX_W / 2, z0, z1, door: { axis: 'z', wall: b.row < 0 ? -AISLE : AISLE, at: b.cx, gap: DOOR_GAP } };
  });
  rooms.push({ id: 'tack', x0: -W / 2, x1: -W / 2 + BOX_W, z0: AISLE, z1: 5, door: { axis: 'z', wall: AISLE, at: -W / 2 + BOX_W / 2, gap: 1.3 } });
  rooms.push({ id: 'passage', x0: -1.6, x1: 1.6, z0: AISLE, z1: 5, door: { axis: 'z', wall: AISLE, at: 0, gap: 3.2 } });
  return rooms;
}

/** L'allée, d'un bout à l'autre. */
export const stableHall = (ext = 0) => ({ x0: -stableWidth(ext) / 2, x1: stableWidth(ext) / 2, z0: -AISLE, z1: AISLE });
export const STABLE_HALL = stableHall(0);

export function stableModel(label, ext = 0) {
  const g = new THREE.Group();
  const lower = new THREE.Group();
  const upper = new THREE.Group(); // caché quand le joueur est dedans
  g.add(lower, upper);
  const kit = new WallKit(lower, upper, { h: H, cut: CUT });
  const W = stableWidth(ext);
  const D = STABLE_D;
  const X0 = -W / 2; // bout de la sellerie
  const slots = boxSlots(ext);
  const walls = [];
  for (let k = 1; k < stableColumns(ext); k++) walls.push(X0 + k * BOX_W); // cloisons entre les colonnes

  // Sol : dalles dans l'allée, terre battue ailleurs.
  const floor = add(g, new THREE.BoxGeometry(W, 0.06, D), mat(0x7d6a52, 1), [0, 0.03, 0], null, false);
  floor.receiveShadow = true;
  add(g, new THREE.BoxGeometry(W - 0.2, 0.02, AISLE * 2), texturedMat(tileTexture('#9c958a', '#8e877c', 4), W / 2, 1.4), [0, 0.07, 0], null, false);
  add(g, new THREE.BoxGeometry(3.2, 0.02, 5 - AISLE), texturedMat(tileTexture('#9c958a', '#8e877c', 4), 1.6, 1.8), [0, 0.07, (5 + AISLE) / 2], null, false);

  // Murs extérieurs (bois foncé) et cloisons des box (bois clair).
  const outer = texturedMat(plankTexture('#8b4f2e', true, 'stable'), W / 2, 1.6);
  const outerUp = texturedMat(plankTexture('#8b4f2e', true, 'stable'), W / 2, 1);
  const inner = texturedMat(plankTexture('#b58a5c', false, 'box'), 2, 1);
  kit.segment('x', -D / 2, -W / 2, W / 2, outer, { upperMat: outerUp });
  kit.segment('z', -W / 2, -D / 2, D / 2, outer, { upperMat: outerUp });
  kit.segment('z', W / 2, -D / 2, D / 2, outer, { upperMat: outerUp });
  kit.withGaps('x', D / 2, -W / 2, W / 2, [[0, 3.2, 2.7]], outer, { upperMat: outerUp });

  // Cloisons : bas plein, haut en barreaux (les barreaux sont dans le haut, cachés quand on est dedans).
  const backGaps = slots.filter((b) => b.row < 0).map((b) => [b.cx, DOOR_GAP, 0]).sort((a, b) => a[0] - b[0]);
  kit.withGaps('x', -AISLE, -W / 2, W / 2, backGaps, inner, { h: CUT });
  // Devant : la porte de la sellerie (premier bout), puis celles des box.
  const frontGaps = [[X0 + BOX_W / 2, 1.3, 0], ...slots.filter((b) => b.row > 0).map((b) => [b.cx, DOOR_GAP, 0])].sort((a, b) => a[0] - b[0]);
  kit.withGaps('x', AISLE, -W / 2, -1.6, frontGaps.filter(([c]) => c < 0), inner, { h: CUT });
  kit.withGaps('x', AISLE, 1.6, W / 2, frontGaps.filter(([c]) => c > 0), inner, { h: CUT });
  for (const x of walls) {
    kit.segment('z', x, -D / 2, -AISLE, inner, { h: CUT });
    kit.segment('z', x, AISLE, D / 2, inner, { h: CUT });
  }
  // Barreaux au-dessus des cloisons (un seul InstancedMesh).
  const barGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.85, 6);
  const barMat = mat(0x2f2f33, 0.4, { metalness: 0.6 });
  const bars = [];
  const barRow = (axis, fixed, a, b) => {
    for (let v = a + 0.15; v < b - 0.1; v += 0.22) bars.push(axis === 'x' ? [v, fixed] : [fixed, v]);
  };
  for (const x of walls) {
    barRow('z', x, -D / 2, -AISLE);
    barRow('z', x, AISLE, D / 2);
  }
  const inst = new THREE.InstancedMesh(barGeo, barMat, bars.length);
  const m4 = new THREE.Matrix4();
  bars.forEach(([x, z], i) => inst.setMatrixAt(i, m4.makeTranslation(x, CUT + 0.43, z)));
  inst.castShadow = true;
  upper.add(inst);
  // Lisses en bois au-dessus des barreaux.
  for (const x of walls) {
    add(upper, new THREE.BoxGeometry(0.12, 0.08, D / 2 - AISLE), mat(0x6e4a2c), [x, CUT + 0.88, -(D / 2 + AISLE) / 2]);
    add(upper, new THREE.BoxGeometry(0.12, 0.08, D / 2 - AISLE), mat(0x6e4a2c), [x, CUT + 0.88, (D / 2 + AISLE) / 2]);
  }

  // Coins et encadrement de la porte en blanc.
  const trim = mat(0xeee6d6, 0.7);
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
    add(lower, new THREE.BoxGeometry(0.26, CUT, 0.26), trim, [x, CUT / 2, z]);
    add(upper, new THREE.BoxGeometry(0.26, H - CUT, 0.26), trim, [x, CUT + (H - CUT) / 2, z]);
  }
  add(upper, new THREE.BoxGeometry(3.6, 0.16, 0.28), trim, [0, 2.75, D / 2]);
  // Grandes portes coulissantes, ouvertes sur le côté.
  const doorMat = texturedMat(plankTexture('#6b3d22', true, 'door'), 1, 1);
  for (const s of [-1, 1]) {
    const leaf = add(upper, new THREE.BoxGeometry(1.7, 2.65, 0.08), doorMat, [s * 2.55, 1.33, D / 2 + 0.16]);
    add(leaf, new THREE.BoxGeometry(1.6, 0.08, 0.04), trim, [0, 0, 0.05], [0, 0, s * 0.95]);
  }
  add(upper, new THREE.BoxGeometry(5.6, 0.1, 0.1), mat(0x333333, 0.4, { metalness: 0.7 }), [0, 2.72, D / 2 + 0.2]);
  // Panneau au-dessus de la porte.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), new THREE.MeshStandardMaterial({ map: plateTexture(`🐴 ${label}`, '#3f2a1c', '#fff8e8'), roughness: 0.7 }));
  sign.position.set(0, 3.05, D / 2 + 0.12);
  upper.add(sign);

  // Fenêtres au-dessus des box du fond.
  const glass = mat(0x9fc4d8, 0.2, { emissive: 0xffc66b, emissiveIntensity: 0 });
  for (const b of slots.filter((x) => x.row < 0)) {
    add(upper, new THREE.BoxGeometry(1, 0.7, 0.24), trim, [b.cx, 2.3, -D / 2]);
    add(upper, new THREE.BoxGeometry(0.84, 0.54, 0.26), glass, [b.cx, 2.3, -D / 2]);
  }

  // Toit.
  const roof = new THREE.Group();
  roof.add(gableRoof(W, D, 2.1, mat(0x4b3a30, 0.8), 0.7));
  roof.add(gables(W, D, 2.1, outerUp));
  roof.position.y = H;
  upper.add(roof);
  // Lampes sous la charpente (s'allument la nuit si on a acheté l'éclairage).
  const lampMat = mat(0xfff3d0, 0.4, { emissive: 0xffd27a, emissiveIntensity: 0 });
  const lamps = Math.max(3, Math.round(W / 5.3));
  for (let i = 0; i < lamps; i++) add(upper, new THREE.SphereGeometry(0.16, 10, 8), lampMat, [(i / (lamps - 1) - 0.5) * (W - 6), H - 0.25, 0], null, false);

  // ------------------------------------------------ contenu des box
  const boxes = slots.map((b, i) => buildBox(g, b, i));

  // Sellerie : selles sur leurs porte-selles, filets aux crochets, coffre.
  const tack = new THREE.Group();
  g.add(tack);
  const saddleMat = mat(0x5a3218, 0.5);
  for (const [i, z] of [[0, 2.4], [1, 3.8]]) {
    add(tack, new THREE.BoxGeometry(0.5, 0.08, 0.08), mat(0x777777, 0.5, { metalness: 0.5 }), [X0 + 0.35, 1.1, z]);
    // Selle posée sur son porte-selle : siège, quartiers qui pendent, pommeau, tapis dessous.
    add(tack, new THREE.BoxGeometry(0.62, 0.05, 0.5), mat(i ? 0x2f4f7a : 0x7a2f2f, 0.8), [X0 + 0.4, 1.15, z]);
    add(tack, new THREE.BoxGeometry(0.55, 0.1, 0.36), saddleMat, [X0 + 0.4, 1.23, z]);
    for (const sz of [-1, 1]) add(tack, new THREE.BoxGeometry(0.4, 0.42, 0.04), saddleMat, [X0 + 0.4, 1.0, z + sz * 0.24]);
    add(tack, new THREE.BoxGeometry(0.1, 0.12, 0.2), saddleMat, [X0 + 0.68, 1.32, z]);
    add(tack, new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), mat(0x999999, 0.3, { metalness: 0.8 }), [X0 + 0.45, 0.78, z + 0.27]);
  }
  for (const z of [2.2, 2.8, 3.4, 4.0]) {
    add(tack, new THREE.TorusGeometry(0.14, 0.02, 6, 14), mat(0x3a2414, 0.6), [X0 + 0.12, 1.85, z], [0, Math.PI / 2, 0]);
  }
  const chest = add(tack, new THREE.BoxGeometry(1.1, 0.55, 0.6), mat(0x7a5532, 0.8), [X0 + 2.1, 0.3, 4.55]);
  add(tack, new THREE.BoxGeometry(1.14, 0.06, 0.64), mat(0x4a3220, 0.8), [X0 + 2.1, 0.6, 4.55]);
  add(tack, new THREE.BoxGeometry(0.9, 0.04, 0.6), mat(0x2f6f9a, 0.7), [X0 + 2.1, 0.64, 4.5]); // tapis de selle plié

  // Réserve de foin et coin d'eau dans l'entrée.
  const hay = new THREE.Group();
  g.add(hay);
  for (const [z, y] of [[2.0, 0.24], [2.55, 0.24], [3.1, 0.24], [3.65, 0.24], [2.3, 0.66], [2.85, 0.66], [3.4, 0.66], [2.6, 1.08]]) {
    bale(hay, [-1.27, y, z], 0xd2b05e, Math.PI / 2);
  }
  const water = new THREE.Group();
  g.add(water);
  add(water, new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8), mat(0x888888, 0.4, { metalness: 0.7 }), [1.48, 0.8, 3.6]);
  add(water, new THREE.BoxGeometry(0.16, 0.06, 0.06), mat(0xc23b2b, 0.5), [1.4, 1.2, 3.6]);
  const bucket = add(water, new THREE.CylinderGeometry(0.2, 0.16, 0.32, 14), mat(0x3a78b5, 0.5), [1.3, 0.2, 3.6]);
  bucket.userData.kind = 'bucket';
  // Balai et brouette pour curer et balayer.
  const broom = new THREE.Group();
  g.add(broom);
  add(broom, new THREE.CylinderGeometry(0.025, 0.025, 1.4, 6), mat(0xb08350, 0.7), [1.45, 0.75, 2.2], [0.18, 0, 0]);
  add(broom, new THREE.BoxGeometry(0.4, 0.1, 0.12), mat(0x7a5a2a, 0.9), [1.45, 0.08, 2.05]);
  // Brouette : caisse évasée (avec un peu de paille dedans), roue devant, brancards et pieds derrière.
  const barrow = new THREE.Group();
  barrow.position.set(1.2, 0, 4.4);
  broom.add(barrow);
  add(barrow, new THREE.CylinderGeometry(1, 0.66, 0.3, 4, 1).rotateY(Math.PI / 4), mat(0x2f6a3f, 0.6, { metalness: 0.3 }), [0, 0.4, 0], null, [0.45, 1, 0.64]);
  add(barrow, new THREE.BoxGeometry(0.5, 0.03, 0.76), mat(0xc9a95a, 1), [0, 0.53, 0], null, null, false);
  add(barrow, new THREE.CylinderGeometry(0.13, 0.13, 0.07, 14), mat(0x222222, 0.9), [0, 0.13, -0.5], [0, 0, Math.PI / 2]);
  add(barrow, new THREE.CylinderGeometry(0.03, 0.03, 0.07, 8), mat(0x888888, 0.4, { metalness: 0.7 }), [0, 0.13, -0.5], [0, 0, Math.PI / 2]);
  for (const s of [-1, 1]) {
    add(barrow, new THREE.CylinderGeometry(0.02, 0.02, 1.35, 6), mat(0x8a6a44, 0.7), [s * 0.2, 0.26, 0.12], [Math.PI / 2 - 0.1, 0, 0]);
    add(barrow, new THREE.CylinderGeometry(0.018, 0.018, 0.28, 6), mat(0x555555, 0.6, { metalness: 0.5 }), [s * 0.17, 0.14, 0.32]);
  }

  // Saleté de l'allée : brins de paille et poussière (plus ou moins visibles).
  const aisleDirt = new THREE.Group();
  g.add(aisleDirt);
  const strawBit = mat(0xc9a95a, 1);
  let seed = 3;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 26; i++) {
    const m = add(aisleDirt, new THREE.PlaneGeometry(0.35 + rnd() * 0.3, 0.12 + rnd() * 0.12), strawBit, [(rnd() - 0.5) * (W - 1.5), 0.09, (rnd() - 0.5) * 2.4], [-Math.PI / 2, 0, rnd() * 3], false);
    m.userData.threshold = rnd() * 90;
  }

  // Le foin et la brouette gênent le passage.
  kit.rects.push({ lx: -1.27, lz: 2.8, hx: 0.28, hz: 1.3 }, { lx: 1.2, lz: 4.4, hx: 0.33, hz: 0.5 });

  return {
    group: g,
    upper,
    lampMat,
    glass,
    boxes,
    spots: {
      tack: { obj: tack, lx: X0 + BOX_W / 2, lz: 3.2 },
      hay: { obj: hay, lx: -0.5, lz: 2.8 },
      water: { obj: water, lx: 0.6, lz: 3.6 },
      broom: { obj: broom, lx: 0.6, lz: 2.2 },
      aisle: { obj: aisleDirt },
    },
    rects: kit.rects,
  };
}

/** Un box : paille au sol, râtelier, seau, demi-porte avec plaque, et réserve tant qu'il est fermé. */
function buildBox(parent, slot, i) {
  const g = new THREE.Group();
  parent.add(g);
  const [z0, z1] = rowRange(slot.row);
  const cz = (z0 + z1) / 2;
  const inW = BOX_W - 0.3;
  const inD = z1 - z0 - 0.3;
  const back = slot.row < 0 ? z0 + 0.25 : z1 - 0.25; // mur du fond du box
  const strawMat = mat(0xe0c46e, 1);
  const straw = add(g, new THREE.BoxGeometry(inW, 0.06, inD), strawMat, [slot.cx, 0.07, cz], null, false);
  straw.userData.box = i;
  // Petites touffes pour donner du volume à la litière.
  const tuftMat = mat(0xd8b860, 1);
  for (let k = 0; k < 7; k++) {
    const t = add(g, new THREE.SphereGeometry(0.28, 7, 5), tuftMat, [slot.cx + Math.sin(k * 2.3 + i) * 1.1, 0.07, cz + Math.cos(k * 1.7 + i) * 1.2], null, false);
    t.scale.set(1.3, 0.25, 1);
    t.userData.box = i;
  }
  // Taches de saleté (crottin écrasé, pipi) qui apparaissent quand le box est sale.
  const wet = mat(0x5b4a2a, 1, { transparent: true, opacity: 0.75 });
  const stains = [];
  for (let k = 0; k < 4; k++) {
    const s = add(g, new THREE.CircleGeometry(0.35 + (k % 2) * 0.15, 14), wet, [slot.cx + Math.sin(k * 2.1 + i * 1.3) * 0.9, 0.105, cz + Math.cos(k * 1.4 + i) * 0.9], [-Math.PI / 2, 0, 0], false);
    s.userData.box = i;
    stains.push(s);
  }
  // Râtelier à foin dans le coin et seau d'eau.
  const rack = new THREE.Group();
  g.add(rack);
  const rackX = slot.cx - BOX_W / 2 + 0.5;
  add(rack, new THREE.BoxGeometry(0.7, 0.4, 0.35), mat(0x6e4a2c, 0.8), [rackX, 1.0, back + (slot.row < 0 ? 0.1 : -0.1)]);
  const hay = add(rack, new THREE.BoxGeometry(0.6, 0.25, 0.28), mat(0xc8b060, 1), [rackX, 1.2, back + (slot.row < 0 ? 0.1 : -0.1)]);
  const bucketX = slot.cx + BOX_W / 2 - 0.45;
  add(rack, new THREE.CylinderGeometry(0.19, 0.15, 0.3, 12), mat(0x2f6f9a, 0.5), [bucketX, 0.25, back + (slot.row < 0 ? 0.15 : -0.15)]);
  const waterTop = add(rack, new THREE.CircleGeometry(0.17, 12), mat(0x5aa0c8, 0.1), [bucketX, 0.38, back + (slot.row < 0 ? 0.15 : -0.15)], [-Math.PI / 2, 0, 0], false);
  // Abreuvoir automatique (amélioration).
  const waterer = add(g, new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x9aa3ab, 0.3, { metalness: 0.7 }), [slot.cx, 0.9, back + (slot.row < 0 ? 0.12 : -0.12)], [Math.PI, 0, 0]);
  waterer.visible = false;

  // Demi-porte qui pivote sur sa charnière.
  const doorZ = slot.row < 0 ? -AISLE : AISLE;
  const hinge = new THREE.Group();
  hinge.position.set(slot.cx - DOOR_GAP / 2, 0, doorZ);
  g.add(hinge);
  const doorMat = texturedMat(plankTexture('#7a4a28', true, 'boxdoor'), 1, 1);
  add(hinge, new THREE.BoxGeometry(DOOR_GAP - 0.04, 1.2, 0.07), doorMat, [DOOR_GAP / 2, 0.68, 0]);
  add(hinge, new THREE.BoxGeometry(DOOR_GAP * 1.05, 0.07, 0.03), mat(0xeee6d6, 0.7), [DOOR_GAP / 2, 0.68, slot.row < 0 ? 0.05 : -0.05], [0, 0, 0.6]);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.24), new THREE.MeshStandardMaterial({ map: plateTexture('—'), roughness: 0.6 }));
  plate.position.set(DOOR_GAP / 2, 1.12, slot.row < 0 ? 0.045 : -0.045);
  if (slot.row > 0) plate.rotation.y = Math.PI;
  hinge.add(plate);
  // Réserve (box pas encore acheté) : bottes empilées.
  const storage = new THREE.Group();
  g.add(storage);
  for (let k = 0; k < 6; k++) bale(storage, [slot.cx - 0.6 + (k % 3) * 0.6, 0.3 + Math.floor(k / 3) * 0.42, cz + (slot.row < 0 ? -0.3 : 0.3)], 0xc9a85a, Math.PI / 2);
  add(storage, new THREE.BoxGeometry(0.8, 0.5, 0.5), mat(0x6a6a70, 0.6), [slot.cx + 0.9, 0.25, cz + (slot.row < 0 ? 0.8 : -0.8)]);

  return {
    i,
    slot,
    group: g,
    straw,
    strawMat,
    tuftMat,
    stains,
    hay,
    waterTop,
    waterer,
    hinge,
    plate,
    storage,
    plateText: '—',
    sign: slot.row < 0 ? 1 : -1, // sens d'ouverture de la porte (vers l'allée)
    center: { lx: slot.cx, lz: cz },
    inner: { lx: slot.cx, lz: cz + (slot.row < 0 ? 0.6 : -0.6) },
    door: { lx: slot.cx, lz: doorZ },
  };
}
