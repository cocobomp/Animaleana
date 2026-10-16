// Sellerie où l'on entre : murs en bois, porte-selles alignés avec leurs selles, porte-filets
// (filets et licols suspendus), étagères (tapis, guêtres, cloches, bombes), barres à couvertures,
// coffre avec des couvertures pliées, chevalet de nettoyage, et le comptoir de la sellière.
// Repère local : 8 m (x) × 6 m (z), la porte regarde vers +Z.
//
//   z = -3 ┌──────── filets · licols ───┬── étagères ────────┐  (mur du fond, pleine hauteur)
//          │S                                              C │
//          │S  selles        (chevalet)                    C │  S : porte-selles (mur gauche)
//          │S                                              C │  C : couvertures sur leurs barres
//          │S                                   ┌comptoir┐   │
//   z = 3  └──[coffre]────────── porte ─────────┴────────┴───┘
//        x = -4                   0                         4

import * as THREE from 'three';
import { mat as kitMat, add, WallKit, gableRoof, gables, plankTexture, texturedMat, plateTexture } from './interiorKit.js';
import { windowMaterials } from './buildings.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tackModel, padModel, saddleModel, bakeMeshes } from './tackModels.js';
import { buildAvatar, poseAvatar } from './avatarModel.js';
import { GEAR } from '../../sim/gear.js';

export const TACK_W = 8;
export const TACK_D = 6;
const H = 3;
const CUT = 1.3;
export const TACK_HALL = { x0: -3.6, x1: 3.6, z0: -2.4, z1: 2.6 };

/** Où chaque objet du catalogue est exposé : support, position (et repère « où se tenir » pour le toucher). */
const SADDLES = ['saddleRace', 'saddlePony', 'saddle', 'saddleJump', 'saddleDressage', 'saddleTrail', 'saddleWestern'];
const HOOKS = ['bridle', 'bridleOlive', 'hackamore', 'doubleBridle', 'halter', 'halterLeather', 'halterRope'];
const BLANKETS = ['blanketSummer', 'blanketRain', 'blanket'];
const SHELF_Y = [0.42, 0.9, 1.38, 1.84];
const SHELVES = [
  { id: 'saddlePad', x: 0.95, row: 0 }, { id: 'gelPad', x: 1.85, row: 0 },
  { id: 'boots', x: 0.95, row: 1 }, { id: 'bellBoots', x: 1.85, row: 1 }, { id: 'flyMask', x: 2.8, row: 1 },
  { id: 'helmet', x: 1.15, row: 2 }, { id: 'helmetSparkle', x: 2.25, row: 2 },
];
const COUNTER = [{ id: 'collar', z: 0.95 }, { id: 'leash', z: 1.38 }, { id: 'dogCoat', z: 1.85 }];

export function displaySlots() {
  const out = [];
  SADDLES.forEach((id, i) => out.push({ id, mount: 'rack', pos: [-3.9, 1.0, -2.5 + i * 0.73], rotY: -0.32, stand: [-2.75, -2.3 + i * 0.73] }));
  HOOKS.forEach((id, i) => out.push({ id, mount: 'hook', pos: [-2.9 + i * 0.43 + (i >= 4 ? 0.1 : 0), 1.64, -2.86], stand: [-2.9 + i * 0.43, -2.05] }));
  BLANKETS.forEach((id, i) => out.push({ id, mount: 'bar', pos: [3.76, 1.28, -2.05 + i * 0.97], stand: [2.85, -2.05 + i * 0.97] }));
  for (const s of SHELVES) out.push({ id: s.id, mount: 'shelf', pos: [s.x, SHELF_Y[s.row] + 0.025, -2.68], stand: [s.x, -2.05] });
  for (const c of COUNTER) out.push({ id: c.id, mount: 'counter', pos: [2.72, 0.97, c.z], stand: [1.75, c.z] });
  return out;
}

/** Étiquette de prix / de propriétaire (256 × 104 px) : deux lignes (nom, puis prix ou « À toi »). */
function drawTag(ctx, x0, y0, name, line, tone = 'price') {
  const bg = { price: '#fbf3df', mine: '#e3f4dc', worn: '#e2ecf7' }[tone] ?? '#fbf3df';
  const fg = { price: '#5a3418', mine: '#2f6b2f', worn: '#2b4a7a' }[tone] ?? '#5a3418';
  ctx.clearRect(x0, y0, 256, 104);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x0 + 4, y0 + 4, 248, 96, 14);
  ctx.fill();
  ctx.strokeStyle = fg;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#3f2a1c';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fit = (text, size, weight, y) => {
    ctx.font = `${weight} ${size}px system-ui, sans-serif`;
    while (ctx.measureText(text).width > 232 && size > 14) {
      size -= 1;
      ctx.font = `${weight} ${size}px system-ui, sans-serif`;
    }
    ctx.fillText(text, x0 + 128, y0 + y);
  };
  fit(name, 26, 600, 32);
  ctx.fillStyle = fg;
  fit(line, 34, 'bold', 72);
}

/**
 * Toutes les étiquettes dans une seule texture (4 × 8 cases de 256 × 128 px) :
 * un seul appel de rendu pour toutes, on ne redessine que la case qui change.
 */
class TagAtlas {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 1024;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
  }

  draw(i, name, line, tone) {
    drawTag(this.ctx, (i % 4) * 256, Math.floor(i / 4) * 128, name, line, tone);
    this.tex.needsUpdate = true;
  }

  /** Géométrie d'une étiquette (plan 0,34 × 0,14 m) dont les UV pointent sur la case i. */
  plane(i) {
    const geo = new THREE.PlaneGeometry(0.34, 0.14);
    const uv = geo.attributes.uv;
    const cx = (i % 4) * 256;
    const cy = Math.floor(i / 4) * 128;
    for (let k = 0; k < uv.count; k++) {
      uv.setXY(k, (cx + uv.getX(k) * 256) / 1024, 1 - (cy + (1 - uv.getY(k)) * 104) / 1024);
    }
    return geo;
  }
}

/** Porte-selle mural : console en bois arrondie sur laquelle repose la selle. */
function saddleRack(parent, wood, metal) {
  add(parent, new THREE.BoxGeometry(0.1, 0.36, 0.12), wood, [0.05, -0.1, 0]); // platine au mur
  add(parent, new THREE.CylinderGeometry(0.075, 0.075, 0.5, 14, 1, false, 0, Math.PI), wood, [0.3, 0.0, 0], [0, 0, Math.PI / 2]);
  add(parent, new THREE.BoxGeometry(0.5, 0.03, 0.15), wood, [0.3, -0.005, 0]);
  add(parent, new THREE.BoxGeometry(0.04, 0.04, 0.38), metal, [0.06, -0.24, 0], [0, 0, -0.9]); // jambe de force
}

/** Crochet à filet : demi-lune en bois sur une platine. */
function bridleHook(parent, wood) {
  add(parent, new THREE.BoxGeometry(0.12, 0.16, 0.03), wood, [0, -0.02, -0.03]);
  add(parent, new THREE.CylinderGeometry(0.06, 0.06, 0.08, 16, 1, false, 0, Math.PI), wood, [0, -0.02, 0.025], [0, Math.PI / 2, Math.PI / 2]);
}

export function tackRoomModel(label, boardLabel = 'Filets, licols') {
  // Matériaux réutilisés (même couleur = même matériau) : les meubles fusionnés font moins d'appels de rendu.
  const mats = new Map();
  const mat = (color, roughness = 0.85, extra = {}) => {
    const key = `${color}|${roughness}|${JSON.stringify(extra)}`;
    if (!mats.has(key)) mats.set(key, kitMat(color, roughness, extra));
    return mats.get(key);
  };
  const g = new THREE.Group();
  const lower = new THREE.Group();
  const upper = new THREE.Group(); // caché quand le joueur est dedans
  g.add(lower, upper);
  const kit = new WallKit(lower, upper, { h: H, cut: CUT });
  const W = TACK_W;
  const D = TACK_D;

  // Sol en planches.
  add(g, new THREE.BoxGeometry(W + 0.3, 0.1, D + 0.3), mat(0x8a8178), [0, 0.05, 0], null, false);
  const floor = add(g, new THREE.BoxGeometry(W - 0.2, 0.02, D - 0.2), texturedMat(plankTexture('#a87a4c', false, 'tackFloor'), 3, 2.5), [0, 0.11, 0], null, false);
  floor.receiveShadow = true;

  // Murs : planches foncées dehors, doublage en bois clair dedans.
  const outer = texturedMat(plankTexture('#7b4a2b', true, 'tackOut'), W / 2, 1.6);
  const outerUp = texturedMat(plankTexture('#7b4a2b', true, 'tackOut'), W / 2, 1);
  const lining = texturedMat(plankTexture('#c8a072', true, 'tackIn'), 3, 1);
  const liningUp = texturedMat(plankTexture('#c8a072', true, 'tackIn'), 3, 0.8);
  kit.segment('z', -W / 2, -D / 2, D / 2, outer, { upperMat: outerUp });
  kit.segment('z', W / 2, -D / 2, D / 2, outer, { upperMat: outerUp });
  kit.withGaps('x', D / 2, -W / 2, W / 2, [[0, 1.6, 2.25]], outer, { upperMat: outerUp });
  // Mur du fond (le grand mur des filets et des étagères) : pleine hauteur, il reste visible dedans.
  add(lower, new THREE.BoxGeometry(W, H, 0.2), outer, [0, H / 2, -D / 2]);
  kit.rects.push({ lx: 0, lz: -D / 2, hx: W / 2, hz: 0.12 });
  add(lower, new THREE.BoxGeometry(W - 0.4, H - 0.05, 0.02), liningUp, [0, H / 2, -D / 2 + 0.11], null, false);
  // Doublage des autres murs (bas toujours visible, haut caché avec le toit).
  for (const s of [-1, 1]) {
    add(lower, new THREE.BoxGeometry(0.02, CUT, D - 0.4), lining, [s * (W / 2 - 0.11), CUT / 2, 0], null, false);
    add(upper, new THREE.BoxGeometry(0.02, H - CUT, D - 0.4), liningUp, [s * (W / 2 - 0.11), CUT + (H - CUT) / 2, 0], null, false);
    add(lower, new THREE.BoxGeometry(W / 2 - 1.0, CUT, 0.02), lining, [s * (W / 4 + 0.5), CUT / 2, D / 2 - 0.11], null, false);
  }
  // Soubassement en pierre dehors, coins et encadrements blancs.
  const stone = mat(0x9a948c, 0.95);
  for (const [w, d, x, z] of [[W + 0.24, 0.24, 0, -D / 2], [0.24, D, -W / 2, 0], [0.24, D, W / 2, 0], [W / 2 - 0.8, 0.24, -(W / 4 + 0.4), D / 2], [W / 2 - 0.8, 0.24, W / 4 + 0.4, D / 2]]) {
    add(lower, new THREE.BoxGeometry(w, 0.36, d), stone, [x, 0.18, z]);
  }
  const trim = mat(0xeee6d6, 0.7);
  for (const [x, z] of [[-W / 2, D / 2], [W / 2, D / 2], [-W / 2, -D / 2], [W / 2, -D / 2]]) {
    add(lower, new THREE.BoxGeometry(0.24, CUT, 0.24), trim, [x, CUT / 2, z]);
    add(upper, new THREE.BoxGeometry(0.24, H - CUT, 0.24), trim, [x, CUT + (H - CUT) / 2, z]);
  }
  add(upper, new THREE.BoxGeometry(2.0, 0.12, 0.26), trim, [0, 2.3, D / 2]);
  for (const s of [-1, 1]) add(lower, new THREE.BoxGeometry(0.12, CUT, 0.26), trim, [s * 0.86, CUT / 2, D / 2]);
  for (const s of [-1, 1]) add(upper, new THREE.BoxGeometry(0.12, 2.25 - CUT, 0.26), trim, [s * 0.86, CUT + (2.25 - CUT) / 2, D / 2]);

  // Porte (pivote vers l'intérieur), seuil, fer à cheval porte-bonheur et enseigne.
  const doorHinge = new THREE.Group();
  doorHinge.position.set(-0.8, 0, D / 2);
  g.add(doorHinge);
  const doorMat = texturedMat(plankTexture('#5a3520', true, 'tackDoor'), 1, 1);
  add(doorHinge, new THREE.BoxGeometry(1.56, 2.15, 0.07), doorMat, [0.78, 1.18, 0]);
  add(doorHinge, new THREE.BoxGeometry(1.4, 0.07, 0.03), trim, [0.78, 1.18, 0.05], [0, 0, 0.9]);
  add(doorHinge, new THREE.SphereGeometry(0.045, 8, 6), mat(0xd9b44a, 0.3, { metalness: 0.8 }), [1.4, 1.1, 0.07]);
  add(g, new THREE.BoxGeometry(2.0, 0.12, 0.9), stone, [0, 0.06, D / 2 + 0.45], null, false);
  const shoe = add(upper, new THREE.TorusGeometry(0.09, 0.02, 6, 18, Math.PI * 1.35), mat(0x9aa0a6, 0.35, { metalness: 0.8 }), [0, 2.36, D / 2 + 0.16]);
  shoe.rotation.z = -Math.PI * 0.175 - Math.PI / 2 + Math.PI;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshStandardMaterial({ map: plateTexture(`🏇 ${label}`, '#4a2c18', '#fff8e8'), roughness: 0.7, emissive: 0x2a1a10, emissiveIntensity: 0.25 }));
  sign.position.set(0, 2.68, D / 2 + 0.15);
  upper.add(sign);

  // Fenêtres (s'allument la nuit), lanterne de la porte.
  const glass = mat(0x9fc4d8, 0.2, { emissive: 0xffc66b, emissiveIntensity: 0 });
  windowMaterials.push(glass);
  const win = (parent, x, y, z, alongX) => {
    add(parent, new THREE.BoxGeometry(alongX ? 1.0 : 0.26, 0.85, alongX ? 0.26 : 1.0), trim, [x, y, z]);
    add(parent, new THREE.BoxGeometry(alongX ? 0.82 : 0.28, 0.68, alongX ? 0.28 : 0.82), glass, [x, y, z]);
    add(parent, new THREE.BoxGeometry(alongX ? 0.04 : 0.3, 0.68, alongX ? 0.3 : 0.04), trim, [x, y, z]);
  };
  win(upper, -2.4, 2.05, D / 2, true);
  win(upper, 2.4, 2.05, D / 2, true);
  win(upper, -W / 2, 2.05, -0.6, false);
  win(upper, W / 2, 2.05, 1.2, false);
  win(lower, 0.05, 2.25, -D / 2, true);
  const lampMat = mat(0xfff3d0, 0.4, { emissive: 0xffd27a, emissiveIntensity: 0 });
  add(upper, new THREE.BoxGeometry(0.14, 0.2, 0.14), lampMat, [1.2, 2.2, D / 2 + 0.2]);
  add(upper, new THREE.BoxGeometry(0.18, 0.04, 0.18), mat(0x2b2b2b, 0.5), [1.2, 2.32, D / 2 + 0.2]);

  // Jardinières sous les fenêtres de la façade et enseigne en drapeau (un fer à cheval doré).
  for (const x of [-2.4, 2.4]) {
    add(upper, new THREE.BoxGeometry(1.0, 0.18, 0.22), mat(0x6e4a2c, 0.8), [x, 1.52, D / 2 + 0.2]);
    for (let i = 0; i < 5; i++) {
      add(upper, new THREE.SphereGeometry(0.09, 8, 6), mat(0x4f7f3a, 0.9), [x - 0.38 + i * 0.19, 1.65, D / 2 + 0.2]);
      add(upper, new THREE.SphereGeometry(0.035, 6, 5), mat([0xe0574a, 0xf2c94c, 0xe07aa5, 0xffffff, 0x9b59b6][i], 0.6), [x - 0.36 + i * 0.19, 1.72, D / 2 + 0.25]);
    }
  }
  add(upper, new THREE.BoxGeometry(0.05, 0.05, 0.75), mat(0x2b2b2b, 0.5, { metalness: 0.5 }), [1.25, 2.55, D / 2 + 0.4]);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), new THREE.MeshStandardMaterial({ map: plateTexture('🏇', '#4a2c18', '#ffd479'), roughness: 0.6, side: THREE.DoubleSide }));
  flag.position.set(1.25, 2.22, D / 2 + 0.55);
  flag.rotation.y = Math.PI / 2;
  upper.add(flag);

  // Toit en bardeaux.
  const roof = new THREE.Group();
  roof.add(gableRoof(W, D, 1.7, mat(0x4f3d33, 0.85), 0.5));
  roof.add(gables(W, D, 1.7, outerUp));
  roof.position.y = H;
  upper.add(roof);

  // ------------------------------------------------ mobilier
  const wood = mat(0x6e4a2c, 0.75);
  const lightWood = mat(0x9a6a40, 0.7);
  const metal = mat(0x3a3a3e, 0.45, { metalness: 0.6 });

  // Porte-filets : planche le long du mur du fond, grande enseigne peinte.
  add(lower, new THREE.BoxGeometry(3.4, 0.16, 0.03), lightWood, [-1.55, 1.64, -D / 2 + 0.135]);
  const boardSign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.36), new THREE.MeshStandardMaterial({ map: plateTexture(boardLabel, '#5a3418', '#fff3d6'), roughness: 0.7 }));
  boardSign.position.set(-1.6, 2.1, -D / 2 + 0.13);
  lower.add(boardSign);

  // Étagères (mur du fond, à droite) : montants, tablettes, décor (coupes et flots).
  const shelf = new THREE.Group();
  g.add(shelf);
  for (const x of [0.35, 2.05, 3.75]) add(shelf, new THREE.BoxGeometry(0.06, 2.0, 0.44), wood, [x, 1.0, -2.69]);
  for (const y of SHELF_Y) add(shelf, new THREE.BoxGeometry(3.46, 0.04, 0.44), lightWood, [2.05, y, -2.69]);
  add(shelf, new THREE.BoxGeometry(3.46, 2.0, 0.02), wood, [2.05, 1.0, -2.9], null, false);
  // Pile de tapis pliés (stock) et petites boîtes de soins.
  ['white', 'navy', 'red', 'green', 'pink'].forEach((c, i) => {
    const p = padModel('saddlePad', c);
    p.position.set(3.05, SHELF_Y[0] + 0.02 + i * 0.038, -2.68);
    p.rotation.y = (i % 2 ? 0.06 : -0.04) + Math.PI / 2;
    p.scale.set(0.9, 1, 0.9);
    shelf.add(p);
  });
  for (let i = 0; i < 4; i++) add(shelf, new THREE.CylinderGeometry(0.05, 0.05, 0.14, 12), mat([0x2f6f9a, 0xe0b040, 0xc23b2b, 0x3f8a4a][i], 0.5), [3.05 + (i - 1.5) * 0.14, SHELF_Y[2] + 0.09, -2.66]);
  for (let i = 0; i < 4; i++) {
    // Coupes et flots gagnés (décor du haut).
    const x = 0.75 + i * 0.85;
    if (i % 2 === 0) {
      add(shelf, new THREE.CylinderGeometry(0.07, 0.035, 0.12, 14), mat(0xd8b24a, 0.25, { metalness: 0.85 }), [x, SHELF_Y[3] + 0.14, -2.68]);
      add(shelf, new THREE.CylinderGeometry(0.03, 0.05, 0.06, 12), mat(0x3a2a20, 0.5), [x, SHELF_Y[3] + 0.05, -2.68]);
    } else {
      const ros = add(shelf, new THREE.CylinderGeometry(0.075, 0.075, 0.02, 18), mat([0x2f5fa8, 0xc23b2b][i % 3 === 1 ? 0 : 1], 0.8), [x, SHELF_Y[3] + 0.1, -2.8], [Math.PI / 2, 0, 0]);
      add(ros, new THREE.CylinderGeometry(0.035, 0.035, 0.024, 14), mat(0xf4e6c0, 0.6), [0, 0.002, 0]);
      for (const s of [-1, 1]) add(shelf, new THREE.BoxGeometry(0.035, 0.12, 0.005), mat(0x2f5fa8, 0.8), [x + s * 0.025, SHELF_Y[3] + 0.0, -2.79], [0, 0, s * 0.15]);
    }
  }

  bakeMeshes(shelf);

  // Comptoir de la sellière (en bois, dessus foncé), caisse, sonnette ; la sellière derrière.
  const counter = new THREE.Group();
  g.add(counter);
  add(counter, new THREE.BoxGeometry(0.62, 0.92, 1.75), lightWood, [2.75, 0.47, 1.62]);
  add(counter, new THREE.BoxGeometry(0.72, 0.05, 1.85), wood, [2.75, 0.955, 1.62]);
  for (const z of [0.95, 1.38, 1.85]) add(counter, new THREE.BoxGeometry(0.02, 0.6, 0.38), wood, [2.43, 0.5, z]);
  add(counter, new THREE.BoxGeometry(0.3, 0.16, 0.26), mat(0x2b2b2b, 0.5), [2.85, 1.06, 2.3]);
  add(counter, new THREE.BoxGeometry(0.26, 0.12, 0.02), mat(0x9fd6a0, 0.3, { emissive: 0x3a6a3a, emissiveIntensity: 0.6 }), [2.78, 1.2, 2.3], [0, Math.PI / 2, -0.4]);
  add(counter, new THREE.SphereGeometry(0.04, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xd8b24a, 0.25, { metalness: 0.85 }), [2.6, 0.98, 2.42]);
  bakeMeshes(counter);
  const seller = buildAvatar({ skin: 0xd9a37f, hair: 0x7a3f1d, hairStyle: 'ponytail', top: 0x2f6b45, bottom: 0x3a3a4a, shoes: 0x5a3418, hat: false });
  poseAvatar(seller, 'stand');
  seller.root.position.set(3.35, 0.11, 1.6);
  seller.root.rotation.y = -Math.PI / 2;
  counter.add(seller.root);
  seller.arms.forEach((arm) => arm.rotation.set(-0.35, 0, 0)); // mains posées vers le comptoir

  // Coffre (à gauche de la porte) avec une pile de couvertures pliées dessus.
  const chest = new THREE.Group();
  g.add(chest);
  add(chest, new THREE.BoxGeometry(1.05, 0.5, 0.52), mat(0x7a5532, 0.8), [-2.45, 0.36, 2.55]);
  add(chest, new THREE.BoxGeometry(1.1, 0.07, 0.56), mat(0x4a3220, 0.8), [-2.45, 0.64, 2.55]);
  for (const s of [-1, 1]) add(chest, new THREE.BoxGeometry(0.05, 0.52, 0.54), mat(0xb08a3a, 0.35, { metalness: 0.6 }), [-2.45 + s * 0.45, 0.37, 2.55]);
  add(chest, new THREE.BoxGeometry(0.08, 0.1, 0.02), mat(0xb08a3a, 0.35, { metalness: 0.6 }), [-2.45, 0.56, 2.28]);
  [[0x23395d, 0], [0xb7322c, 1], [0x6b3fa0, 2], [0x2f6b45, 3]].forEach(([c, i]) => {
    add(chest, new THREE.BoxGeometry(0.62 - i * 0.03, 0.07, 0.42 - i * 0.02), mat(c, 0.95), [-2.5 + (i % 2) * 0.03, 0.71 + i * 0.07, 2.55], [0, (i - 1.5) * 0.05, 0]);
    add(chest, new THREE.BoxGeometry(0.63 - i * 0.03, 0.015, 0.43 - i * 0.02), mat(0xf1ede4, 0.9), [-2.5 + (i % 2) * 0.03, 0.676 + i * 0.07, 2.55], [0, (i - 1.5) * 0.05, 0]);
  });

  bakeMeshes(chest);

  // Chevalet de nettoyage : une selle à graisser, seau, éponge et savon glycériné.
  const clean = new THREE.Group();
  clean.position.set(-1.35, 0.11, 0.95);
  g.add(clean);
  for (const s of [-1, 1]) {
    add(clean, new THREE.BoxGeometry(0.05, 0.85, 0.05), wood, [s * 0.25, 0.4, 0.2], [0.25, 0, 0]);
    add(clean, new THREE.BoxGeometry(0.05, 0.85, 0.05), wood, [s * 0.25, 0.4, -0.2], [-0.25, 0, 0]);
  }
  add(clean, new THREE.CylinderGeometry(0.07, 0.07, 0.62, 12), lightWood, [0, 0.82, 0], [0, 0, Math.PI / 2]);
  const cleanSaddle = saddleModel('saddle', 'havana');
  cleanSaddle.position.set(0, 0.84, 0);
  cleanSaddle.rotation.y = Math.PI / 2;
  clean.add(cleanSaddle);
  add(clean, new THREE.CylinderGeometry(0.15, 0.12, 0.26, 14), mat(0x2f6f9a, 0.5), [0.5, 0.13, 0.25]);
  add(clean, new THREE.CircleGeometry(0.135, 14), mat(0xc9d8de, 0.15, { transparent: true, opacity: 0.85 }), [0.5, 0.25, 0.25], [-Math.PI / 2, 0, 0], false);
  add(clean, new THREE.BoxGeometry(0.12, 0.05, 0.08), mat(0xe8c64a, 0.9), [0.48, 0.29, 0.22]);
  add(clean, new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14), mat(0xb8862a, 0.4, { metalness: 0.4 }), [0.32, 0.03, 0.42]);

  bakeMeshes(clean);

  // Tapis d'entrée.
  add(g, new THREE.BoxGeometry(1.4, 0.015, 0.7), mat(0x7a2f2f, 1), [0, 0.125, 2.45], null, false);
  add(g, new THREE.BoxGeometry(1.2, 0.017, 0.5), mat(0x9a4a3a, 1), [0, 0.126, 2.45], null, false);

  // Appliques au mur du fond (allumées la nuit).
  for (const x of [-3.25, 3.95 - 0.2]) {
    add(lower, new THREE.BoxGeometry(0.08, 0.12, 0.08), metal, [x, 2.45, -D / 2 + 0.16]);
    add(lower, new THREE.SphereGeometry(0.1, 12, 8), lampMat, [x, 2.32, -D / 2 + 0.22], null, false);
  }

  // ------------------------------------------------ supports et objets exposés
  // Les supports (porte-selles, crochets, barres) sont fusionnés une fois pour toutes ; les objets
  // exposés aussi (refaits quand une couleur change) ; chaque emplacement garde une boîte invisible
  // qu'on peut toucher, et son étiquette (toutes les étiquettes partagent une texture).
  const fixtures = new THREE.Group();
  g.add(fixtures);
  const items = new THREE.Group();
  g.add(items);
  const atlas = new TagAtlas();
  const tagGeos = [];
  const hitMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  const HIT = {
    rack: [[0.72, 0.7, 0.62], [0.38, -0.08, 0]],
    hook: [[0.34, 0.72, 0.22], [0, -0.3, 0.08]],
    bar: [[0.3, 0.72, 0.9], [-0.05, -0.3, 0]],
    shelf: [[0.52, 0.32, 0.42], [0, 0.12, 0]],
    counter: [[0.3, 0.26, 0.42], [0, 0.1, 0]],
  };
  const displays = new Map();
  const m4 = new THREE.Matrix4();
  displaySlots().forEach((slot, index) => {
    const obj = new THREE.Group(); // ce qu'on touche
    obj.position.set(...slot.pos);
    obj.rotation.y = slot.rotY ?? 0; // porte-selles un peu tournés vers la porte
    g.add(obj);
    const fix = new THREE.Group();
    fix.position.set(...slot.pos);
    fix.rotation.y = slot.rotY ?? 0;
    fixtures.add(fix);
    const hold = { pos: [0, 0, 0], rotY: 0, scale: 1 };
    let tagPos;
    let tagRot;
    let flatTag = false; // étiquette posée à plat sur le mur (pas tournée avec le support)
    if (slot.mount === 'rack') {
      flatTag = true;
      saddleRack(fix, wood, metal);
      hold.pos = [0.36, 0.07, 0];
      hold.rotY = Math.PI / 2; // le pommeau vers la pièce
      tagPos = [0.035, -0.5, 0];
      tagRot = [0, Math.PI / 2, 0];
    } else if (slot.mount === 'hook') {
      bridleHook(fix, lightWood);
      hold.pos = [0, -0.02, 0.06];
      tagPos = [0, -0.78, 0.02];
      tagRot = [0, 0, 0];
    } else if (slot.mount === 'bar') {
      // Barre à couverture le long du mur : la couverture montre sa face à la pièce.
      add(fix, new THREE.CylinderGeometry(0.02, 0.02, 0.9, 10), metal, [-0.02, 0, 0], [Math.PI / 2, 0, 0]);
      for (const z of [-0.42, 0.42]) add(fix, new THREE.BoxGeometry(0.14, 0.04, 0.04), metal, [0.06, 0, z]);
      hold.pos = [-0.02, 0.02, 0];
      hold.rotY = -Math.PI / 2;
      hold.scale = 0.9;
      tagPos = [0.1, -0.7, 0];
      tagRot = [0, -Math.PI / 2, 0];
    } else if (slot.mount === 'counter') {
      hold.rotY = -Math.PI / 2;
      hold.scale = slot.id === 'dogCoat' ? 0.9 : 1;
      tagPos = [-0.33, -0.25, 0];
      tagRot = [0, -Math.PI / 2, 0];
    } else {
      const type = GEAR[slot.id]?.type;
      hold.rotY = type === 'helmet' ? 0.5 : type === 'pad' ? Math.PI / 2 + 0.05 : 0.15;
      tagPos = [0, -0.065, 0.225];
      tagRot = [0, 0, 0];
    }
    const tg = atlas.plane(index);
    tg.applyMatrix4(m4.compose(new THREE.Vector3(...tagPos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...tagRot)), new THREE.Vector3(1, 1, 1)));
    obj.updateMatrix();
    if (flatTag) tg.translate(...slot.pos);
    else tg.applyMatrix4(obj.matrix); // dans le repère de la sellerie (avec la rotation du support)
    tagGeos.push(tg);
    const [size, at] = HIT[slot.mount];
    const hit = new THREE.Mesh(new THREE.BoxGeometry(...size), hitMat);
    hit.position.set(...at);
    hit.visible = false; // invisible, mais le doigt la touche (le rayon ne regarde pas la visibilité)
    hit.userData.noOccluder = true;
    obj.add(hit);
    displays.set(slot.id, { id: slot.id, index, mount: slot.mount, obj, hold, stand: slot.stand, color: null, visible: true, tagKey: '' });
  });
  bakeMeshes(fixtures);
  const tags = new THREE.Mesh(mergeGeometries(tagGeos), new THREE.MeshStandardMaterial({ map: atlas.tex, roughness: 0.7, transparent: true }));
  tagGeos.forEach((tg) => tg.dispose());
  tags.userData.noOccluder = true;
  g.add(tags);

  /** Refait les objets exposés (fusionnés par matériau) : couleur choisie, ou support vide. */
  const rebuildItems = () => {
    for (const c of [...items.children]) {
      items.remove(c);
      c.geometry?.dispose();
    }
    const tmp = new THREE.Group();
    items.add(tmp);
    for (const d of displays.values()) {
      if (!d.visible) continue;
      const base = new THREE.Group(); // le support (position et rotation de l'emplacement)
      base.position.copy(d.obj.position);
      base.rotation.y = d.obj.rotation.y;
      const holder = new THREE.Group();
      holder.position.set(...d.hold.pos);
      holder.rotation.y = d.hold.rotY;
      holder.scale.setScalar(d.hold.scale);
      holder.add(tackModel(d.id, d.color));
      base.add(holder);
      tmp.add(base);
    }
    bakeMeshes(items);
    items.remove(tmp);
  };

  /**
   * Met à jour les objets exposés. list : [{ id, color, visible, name, line, tone }].
   * L'étiquette ne se redessine que si son texte change ; les objets seulement si une couleur change.
   */
  const applyDisplays = (list) => {
    let rebuild = !items.children.length;
    for (const st of list) {
      const d = displays.get(st.id);
      if (!d) continue;
      const key = `${st.name}|${st.line}|${st.tone}`;
      if (d.tagKey !== key) {
        atlas.draw(d.index, st.name, st.line, st.tone);
        d.tagKey = key;
      }
      if (d.color !== st.color || d.visible !== st.visible) {
        d.color = st.color;
        d.visible = st.visible;
        rebuild = true;
      }
    }
    if (rebuild) rebuildItems();
  };
  for (const d of displays.values()) d.color = GEAR[d.id]?.colors?.[0];

  // Ce qui gêne le passage : porte-selles, couvertures, étagères, comptoir, coffre, chevalet.
  kit.rects.push(
    { lx: -3.55, lz: -0.2, hx: 0.38, hz: 2.6 },
    { lx: 3.68, lz: -1.08, hx: 0.24, hz: 1.45 },
    { lx: 2.05, lz: -2.69, hx: 1.75, hz: 0.24 },
    { lx: 3.05, lz: 1.62, hx: 0.95, hz: 0.95 },
    { lx: -2.45, lz: 2.55, hx: 0.58, hz: 0.3 },
    { lx: -1.35, lz: 0.95, hx: 0.38, hz: 0.38 },
  );

  // Murs, toit, fenêtres : fusionnés par matériau (le haut reste à part pour la vue en coupe).
  bakeMeshes(lower, null, { occluder: true });
  bakeMeshes(upper, null, { occluder: true });

  return {
    group: g,
    upper,
    lampMat,
    glass,
    doorHinge,
    seller,
    displays,
    applyDisplays,
    spots: {
      counter: { obj: counter, lx: 1.75, lz: 1.6 },
      chest: { obj: chest, lx: -2.45, lz: 1.85 },
      clean: { obj: clean, lx: -0.7, lz: 0.95 },
    },
    rects: kit.rects,
  };
}
