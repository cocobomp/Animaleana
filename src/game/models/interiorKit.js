// Petits outils pour construire les bâtiments où l'on entre (écurie, maison) :
// murs coupés en deux (le haut disparaît quand on est dedans), toit, textures de planches.
// Tout est construit dans le repère du bâtiment : la porte d'entrée regarde vers +Z.

import * as THREE from 'three';

export const mat = (color, roughness = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

export function add(parent, geo, material, pos, rot = null, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const texCache = new Map();

/** Texture de planches (murs et sols en bois), partagée entre les reconstructions du monde. */
export function plankTexture(base = '#8b5a35', vertical = true, key = '') {
  const id = `${base}-${vertical}-${key}`;
  if (texCache.has(id)) return texCache.get(id);
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rnd() * 0.06})`;
    if (vertical) ctx.fillRect(i * 16, 0, 16, 128);
    else ctx.fillRect(0, i * 16, 128, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    if (vertical) ctx.fillRect(i * 16, 0, 1.5, 128);
    else ctx.fillRect(0, i * 16, 128, 1.5);
  }
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.08})`;
    const x = rnd() * 128;
    const y = rnd() * 128;
    if (vertical) ctx.fillRect(x, y, 1, 6 + rnd() * 14);
    else ctx.fillRect(x, y, 6 + rnd() * 14, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.userData.shared = true;
  texCache.set(id, tex);
  return tex;
}

/** Carrelage (cuisine) ou dalles (allée de l'écurie). */
export function tileTexture(a = '#d9d4c8', b = '#c9c2b4', n = 4) {
  const id = `tile-${a}-${b}-${n}`;
  if (texCache.has(id)) return texCache.get(id);
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const s = 128 / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      ctx.fillStyle = (i + j) % 2 ? a : b;
      ctx.fillRect(i * s, j * s, s, s);
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s, 0);
    ctx.lineTo(i * s, 128);
    ctx.moveTo(0, i * s);
    ctx.lineTo(128, i * s);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.userData.shared = true;
  texCache.set(id, tex);
  return tex;
}

/** Matériau texturé avec une répétition adaptée à la taille (chaque mesh a sa copie de texture). */
export function texturedMat(tex, repX, repY, extra = {}) {
  const t = tex.clone();
  t.repeat.set(repX, repY);
  t.needsUpdate = true;
  t.userData.shared = false;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, ...extra });
}

/** Petite plaque avec un texte (nom du cheval sur la porte du box, nom des pièces). */
export function plateTexture(text, bg = '#f4ead2', fg = '#3f2a1c') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(4, 4, 248, 56, 12);
  ctx.fill();
  ctx.strokeStyle = fg;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.slice(0, 14), 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Constructeur de murs : chaque mur est coupé à la hauteur `cut`.
 * Le bas reste toujours visible, le haut va dans `upper` (caché quand on est dedans).
 * Chaque mur est aussi ajouté à `rects` (pour les collisions).
 */
export class WallKit {
  constructor(lower, upper, { h, cut = 1.3, thick = 0.2 }) {
    this.lower = lower;
    this.upper = upper;
    this.h = h;
    this.cut = cut;
    this.thick = thick;
    this.rects = [];
  }

  /** Mur aligné sur X (z fixe) de x0 à x1, ou sur Z (x fixe) de z0 à z1. */
  segment(axis, fixed, a, b, material, { h = this.h, upperMat = material, collide = true, thick = this.thick } = {}) {
    if (b - a < 0.02) return;
    const len = b - a;
    const mid = (a + b) / 2;
    const geo = (hh) => (axis === 'x' ? new THREE.BoxGeometry(len, hh, thick) : new THREE.BoxGeometry(thick, hh, len));
    const at = (y) => (axis === 'x' ? [mid, y, fixed] : [fixed, y, mid]);
    const lowH = Math.min(this.cut, h);
    add(this.lower, geo(lowH), material, at(lowH / 2));
    if (h > this.cut) add(this.upper, geo(h - this.cut), upperMat, at(this.cut + (h - this.cut) / 2));
    if (collide) {
      this.rects.push(axis === 'x'
        ? { lx: mid, lz: fixed, hx: len / 2, hz: thick / 2 + 0.02 }
        : { lx: fixed, lz: mid, hx: thick / 2 + 0.02, hz: len / 2 });
    }
  }

  /** Mur avec des ouvertures (portes) : gaps = [[centre, largeur, hauteur du linteau ou 0]]. */
  withGaps(axis, fixed, a, b, gaps, material, opts = {}) {
    const sorted = [...gaps].sort((g1, g2) => g1[0] - g2[0]);
    let cur = a;
    for (const [c, w, lintel] of sorted) {
      this.segment(axis, fixed, cur, c - w / 2, material, opts);
      if (lintel) {
        // Linteau au-dessus de la porte (seulement en haut).
        const len = w;
        const hh = (opts.h ?? this.h) - lintel;
        const geo = axis === 'x' ? new THREE.BoxGeometry(len, hh, this.thick) : new THREE.BoxGeometry(this.thick, hh, len);
        add(this.upper, geo, opts.upperMat ?? material, axis === 'x' ? [c, lintel + hh / 2, fixed] : [fixed, lintel + hh / 2, c]);
      }
      cur = c + w / 2;
    }
    this.segment(axis, fixed, cur, b, material, opts);
  }
}

/** Toit à deux pans au-dessus d'un bâtiment w × d (faîtage le long de X). */
export function gableRoof(w, d, h, material, overhang = 0.5) {
  const g = new THREE.Group();
  // Le pan passe par le faîtage (0, h) et le haut du mur (d/2, 0), puis déborde de `overhang`.
  const drop = (h * overhang) / (d / 2);
  const slope = Math.hypot(d / 2 + overhang, h + drop);
  const ang = Math.atan2(h, d / 2);
  for (const s of [-1, 1]) {
    add(g, new THREE.BoxGeometry(w + overhang * 2, 0.14, slope), material, [0, (h - drop) / 2 + 0.07, s * (d / 2 + overhang) / 2], [s * ang, 0, 0]);
  }
  return g;
}

/** Pignons (triangles) aux deux bouts du toit. */
export function gables(w, d, h, material) {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false });
    geo.translate(0, 0, -0.1);
    const m = new THREE.Mesh(geo, material);
    m.rotation.y = Math.PI / 2;
    m.position.x = s * (w / 2 - 0.1);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

/** Botte de paille / foin. */
export function bale(parent, pos, color = 0xd8b765, rotY = 0) {
  const m = add(parent, new THREE.BoxGeometry(0.9, 0.42, 0.5), mat(color, 1), pos, [0, rotY, 0]);
  return m;
}
