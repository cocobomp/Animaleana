// Modèles 3D des activités : obstacles de saut, agility, terrain de concours, tribunes,
// spectateurs, scène de spectacle, balises de balade et points de vue.
// Chaque obstacle regarde vers +Z : on le franchit en allant vers +Z (on le tourne ensuite selon son cap).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { signTexture } from '../textures.js';

const mat = (color, roughness = 0.75, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

function add(parent, geo, material, pos, rot) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}


/**
 * Fusionne les pièces fixes d'un modèle par matériau (beaucoup moins d'appels de dessin,
 * important sur téléphone). keep : objets à garder séparés (barres qui tombent, pièces animées…).
 */
export function mergeStatic(root, keep = []) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map();
  const kept = (o) => {
    for (let p = o; p && p !== root; p = p.parent) if (keep.includes(p) || p.userData.keep) return true;
    return false;
  };
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !kept(o)) meshes.push(o); });
  for (const o of meshes) {
    const m = o.material;
    const key = [m.type, m.color?.getHex(), m.map?.uuid ?? '', m.side, m.roughness, m.metalness, m.emissive?.getHex(), m.emissiveIntensity, m.transparent].join('|');
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(inv.clone().multiply(o.matrixWorld));
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    geo.morphAttributes = {};
    if (!buckets.has(key)) buckets.set(key, { material: m, geos: [] });
    buckets.get(key).geos.push(geo);
    o.parent.remove(o);
    o.geometry.dispose();
  }
  for (const { material, geos } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((x) => x.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

/** Texture à rayures pour les barres (couleurs alternées le long de la barre). */
function stripes(colors, bands = 8) {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 128;
  const ctx = c.getContext('2d');
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = hex(colors[i % colors.length]);
    ctx.fillRect(0, (i * 128) / bands, 8, 128 / bands + 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Briques du mur. */
function bricks(color, joint) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = hex(joint);
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = hex(color);
  for (let row = 0; row < 4; row++) {
    for (let col = -1; col < 4; col++) {
      const x = col * 32 + (row % 2) * 16 + 2;
      ctx.fillRect(x, row * 16 + 2, 28, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Plaque avec un numéro (ou un texte court). */
export function numberTexture(text, bg = '#ffffff', fg = '#23302a') {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(6, 6, 116, 116, 24);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = fg;
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.font = 'bold 76px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text), 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Grand panneau dont le texte est réduit pour tenir en entier. */
function fitSign(text, bg = '#2f6fd8', fg = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 12;
  ctx.strokeRect(14, 14, 996, 228);
  let size = 130;
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  while (ctx.measureText(text).width > 920 && size > 30) {
    size -= 6;
    ctx.font = `bold ${size}px system-ui, sans-serif`;
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 136);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function plate(text, size = 0.42, bg, fg) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: numberTexture(text, bg, fg), roughness: 0.6 }));
  return m;
}

/** Chandelier (montant) avec une aile décorée. */
function standard(parent, x, color, h = 1.6) {
  const white = mat(0xf4f4f0, 0.6);
  add(parent, new THREE.BoxGeometry(0.14, h, 0.14), white, [x, h / 2, 0]);
  add(parent, new THREE.BoxGeometry(0.5, 0.06, 0.5), white, [x, 0.03, 0]);
  // Aile pleine sur le côté extérieur
  const s = Math.sign(x) || 1;
  add(parent, new THREE.BoxGeometry(0.06, h * 0.8, 0.9), mat(color, 0.6), [x + s * 0.32, h * 0.42, 0]);
  add(parent, new THREE.BoxGeometry(0.08, 0.08, 0.95), white, [x + s * 0.32, h * 0.84, 0]);
  add(parent, new THREE.BoxGeometry(0.42, 0.06, 0.06), white, [x + s * 0.16, h * 0.84, 0]);
}

function pole(parent, width, y, z, tex) {
  const m = add(parent, new THREE.CylinderGeometry(0.055, 0.055, width - 0.2, 10), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }),
    [0, y, z], [0, 0, Math.PI / 2]);
  return m;
}

/** Bac à fleurs devant un obstacle. */
function flowerBox(parent, width, z) {
  add(parent, new THREE.BoxGeometry(width * 0.7, 0.22, 0.32), mat(0x7a5a38, 0.9), [0, 0.11, z]);
  const leaves = mat(0x3f8a3a, 0.9);
  const cols = [0xffd23a, 0xff5a7a, 0xffffff, 0xb070ff];
  const n = Math.round(width * 2.2);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * width * 0.65;
    add(parent, new THREE.SphereGeometry(0.11, 8, 6), leaves, [x, 0.27, z]);
    add(parent, new THREE.SphereGeometry(0.06, 6, 5), mat(cols[i % cols.length], 0.6), [x + 0.03, 0.36, z + 0.05]);
  }
}

/**
 * Obstacle de saut d'obstacles. def : { type, width, colors, n }, height en mètres.
 * Renvoie { group, poles } : poles = barres qui peuvent tomber (la première tombe en cas de faute).
 */
export function jumpObstacle(def, height) {
  const g = new THREE.Group();
  const w = def.width;
  const [c1, c2] = def.colors;
  const tex = stripes([c1, c2]);
  const poles = [];
  const set = (z, h) => {
    standard(g, -w / 2, c1, Math.max(1.4, h + 0.5));
    standard(g, w / 2, c1, Math.max(1.4, h + 0.5));
    g.children.slice(-10).forEach((m) => { m.position.z += z; });
    poles.unshift(pole(g, w, h, z, tex));
    if (h > 0.55) pole(g, w, h - 0.4, z, tex);
    if (h > 0.95) pole(g, w, h - 0.75, z, tex);
  };
  switch (def.type) {
    case 'poles': {
      // Barres au sol (pour apprendre) : trois barres posées sur de petits plots.
      const block = mat(c1, 0.7);
      for (const z of [-1, 0, 1]) {
        for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.25, Math.max(0.06, height - 0.05), 0.25), block, [s * (w / 2 - 0.3), Math.max(0.03, (height - 0.05) / 2), z]);
        const pl = pole(g, w - 0.2, height, z, tex);
        if (z === 0) poles.unshift(pl);
      }
      break;
    }
    case 'cavaletti': {
      // Cavaletti : une barre sur deux croisillons en bois.
      const wood = mat(0x9a7650, 0.85);
      for (const s of [-1, 1]) {
        for (const r of [0.7, -0.7]) add(g, new THREE.BoxGeometry(0.08, height * 1.9, 0.08), wood, [s * (w / 2 - 0.15), height * 0.55, 0], [r, 0, 0]);
      }
      poles.unshift(pole(g, w, height, 0, tex));
      break;
    }
    case 'oxer':
      set(-0.45, height - 0.1);
      set(0.45, height);
      break;
    case 'triple':
      set(-0.7, height - 0.35);
      set(0, height - 0.15);
      set(0.7, height);
      break;
    case 'wall': {
      standard(g, -w / 2, c1, height + 0.6);
      standard(g, w / 2, c1, height + 0.6);
      const bt = bricks(c1, c2);
      bt.repeat.set(3, 1);
      add(g, new THREE.BoxGeometry(w - 0.3, height - 0.15, 0.45), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.9 }), [0, (height - 0.15) / 2, 0]);
      // Les blocs du haut tombent si on touche.
      const top = new THREE.Group();
      g.add(top);
      for (let i = 0; i < 3; i++) {
        const b = add(top, new THREE.BoxGeometry((w - 0.3) / 3 - 0.02, 0.15, 0.45), mat(0xf2e6c8, 0.8), [((i - 1) * (w - 0.3)) / 3, height - 0.075, 0]);
        poles.push(b);
      }
      break;
    }
    case 'water': {
      // Rivière : un bac d'eau bleu bordé de blanc, avec une petite haie devant (concours à l'extérieur).
      add(g, new THREE.BoxGeometry(w, 0.12, 2.6), mat(0xf4f4f0, 0.7), [0, 0.06, 0.3]);
      add(g, new THREE.BoxGeometry(w - 0.3, 0.1, 2.3), new THREE.MeshStandardMaterial({ color: 0x3f9bd8, roughness: 0.15, metalness: 0.2 }), [0, 0.11, 0.3]);
      add(g, new THREE.BoxGeometry(w, Math.max(0.2, height), 0.4), mat(0x3f8f3a, 0.95), [0, Math.max(0.2, height) / 2, -1.1]);
      standard(g, -w / 2, c1, 1.2);
      standard(g, w / 2, c1, 1.2);
      g.children.slice(-10).forEach((m) => { m.position.z -= 1.1; });
      break;
    }
    case 'cross': {
      standard(g, -w / 2, c1, 1.4);
      standard(g, w / 2, c1, 1.4);
      const len = Math.hypot(w - 0.2, height + 0.2);
      const ang = Math.atan2(height + 0.2, w - 0.2);
      for (const s of [1, -1]) {
        const m = add(g, new THREE.CylinderGeometry(0.055, 0.055, len, 10), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }),
          [0, (height + 0.2) / 2 + 0.05, s * 0.06], [0, 0, Math.PI / 2 - s * ang]);
        poles.push(m);
      }
      break;
    }
    default: // vertical
      set(0, height);
  }
  const low = def.type === 'poles' || def.type === 'cavaletti';
  if (!low && def.type !== 'water') flowerBox(g, w, def.type === 'triple' ? -1.25 : -0.85);
  else add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), mat(0xf4f4f0), [w / 2 + 0.33, 0.45, 0]);
  if (def.n) {
    const p = plate(def.n, 0.42, '#ffffff', hex(c1));
    p.position.set(w / 2 + 0.33, low ? 1.05 : Math.max(1.4, height + 0.5) * 0.84 + 0.32, -0.02);
    p.rotation.y = Math.PI;
    g.add(p);
    const p2 = p.clone();
    p2.rotation.y = 0;
    p2.position.z = 0.02;
    g.add(p2);
  }
  mergeStatic(g, poles);
  return { group: g, poles };
}

/** Paire de fanions de départ ou d'arrivée (rouge à droite, blanc à gauche). */
export function flagPair(width, label) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 1.8, 8), mat(0xf4f4f0), [s * width / 2, 0.9, 0]);
    const flag = add(g, new THREE.PlaneGeometry(0.5, 0.35), new THREE.MeshStandardMaterial({ color: s > 0 ? 0xd8402f : 0xffffff, side: THREE.DoubleSide, roughness: 0.6 }), [s * width / 2 + s * 0.26, 1.6, 0]);
    flag.rotation.y = Math.PI / 2;
  }
  if (label) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshStandardMaterial({ map: signTexture(label, '#23302a'), roughness: 0.6, side: THREE.DoubleSide }));
    sign.position.set(0, 2.05, 0);
    sign.rotation.y = Math.PI; // lisible par le cavalier qui arrive
    g.add(sign);
    add(g, new THREE.BoxGeometry(width, 0.05, 0.05), mat(0xf4f4f0), [0, 1.8, 0]);
  }
  return g;
}

// ---------------------------------------------------------------- agility

/** Obstacle d'agility (taille pour un chien moyen ; scale pour les petits animaux). */
export function agilityObstacle(type, n) {
  const g = new THREE.Group();
  const blue = mat(0x2f6fd8, 0.55);
  const yellow = mat(0xffcf2e, 0.55);
  const red = mat(0xe0473a, 0.55);
  const white = mat(0xf6f6f2, 0.55);
  const parts = {};
  switch (type) {
    case 'hurdle': {
      for (const s of [-1, 1]) {
        add(g, new THREE.BoxGeometry(0.08, 0.9, 0.08), blue, [s * 0.65, 0.45, 0]);
        add(g, new THREE.BoxGeometry(0.08, 0.06, 0.5), blue, [s * 0.65, 0.03, 0]);
        add(g, new THREE.BoxGeometry(0.04, 0.6, 0.35), yellow, [s * 0.75, 0.45, 0]);
      }
      parts.bar = add(g, new THREE.CylinderGeometry(0.03, 0.03, 1.25, 8), new THREE.MeshStandardMaterial({ map: stripes([0xffcf2e, 0x2f6fd8], 6), roughness: 0.5 }), [0, 0.45, 0], [0, 0, Math.PI / 2]);
      break;
    }
    case 'tyre': {
      for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.1, 1.6, 0.1), white, [s * 0.75, 0.8, 0]);
      add(g, new THREE.BoxGeometry(1.6, 0.1, 0.1), white, [0, 1.6, 0]);
      add(g, new THREE.BoxGeometry(1.6, 0.08, 0.5), white, [0, 0.04, 0]);
      parts.ring = add(g, new THREE.TorusGeometry(0.42, 0.09, 10, 24), red, [0, 0.8, 0]);
      for (const s of [-1, 1]) add(g, new THREE.CylinderGeometry(0.015, 0.015, 0.28, 4), white, [s * 0.5, 1.4, 0], [0, 0, s * 0.6]);
      break;
    }
    case 'tunnel': {
      const L = 4;
      const n2 = 8;
      for (let i = 0; i < n2; i++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, L / n2 + 0.01, 16, 1, true), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xffcf2e : 0xe0473a, roughness: 0.7, side: THREE.DoubleSide }));
        seg.rotation.x = Math.PI / 2;
        seg.position.set(0, 0.4, -L / 2 + (i + 0.5) * (L / n2));
        seg.castShadow = true;
        g.add(seg);
      }
      for (const z of [-1.4, 0, 1.4]) add(g, new THREE.BoxGeometry(1, 0.1, 0.15), mat(0x5a5a5a), [0, 0.05, z]);
      break;
    }
    case 'weave': {
      add(g, new THREE.BoxGeometry(0.1, 0.04, 4.4), white, [0, 0.02, 0]);
      for (let i = 0; i < 8; i++) {
        add(g, new THREE.CylinderGeometry(0.025, 0.025, 1, 8), new THREE.MeshStandardMaterial({ map: stripes([i % 2 ? 0xffcf2e : 0x2f6fd8, 0xffffff], 6) }), [0, 0.52, -2.1 + i * 0.6]);
        add(g, new THREE.BoxGeometry(0.4, 0.03, 0.06), white, [0, 0.03, -2.1 + i * 0.6]);
      }
      break;
    }
    case 'seesaw': {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.3, 0.42, 3), mat(0x5a5a5a));
      base.position.y = 0.21;
      base.rotation.y = Math.PI / 2;
      g.add(base);
      const plank = new THREE.Group();
      plank.position.y = 0.44;
      g.add(plank);
      add(plank, new THREE.BoxGeometry(0.32, 0.05, 4.2), mat(0x2f6fd8, 0.7), [0, 0, 0]);
      // Zones de contact jaunes aux deux bouts
      for (const s of [-1, 1]) add(plank, new THREE.BoxGeometry(0.33, 0.055, 0.9), yellow, [0, 0.002, s * 1.65]);
      plank.rotation.x = 0.2;
      parts.plank = plank;
      break;
    }
    default:
  }
  if (n) {
    const p = plate(n, 0.36, '#ffcf2e', '#23302a');
    p.position.set(type === 'weave' || type === 'tunnel' || type === 'seesaw' ? 0.75 : 1.05, 1.0, 0);
    p.rotation.y = Math.PI;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), white);
    post.position.set(p.position.x, 0.5, 0.02);
    g.add(post, p);
    const p2 = p.clone();
    p2.rotation.y = 0;
    p2.position.z = 0.02;
    g.add(p2);
  }
  mergeStatic(g, Object.values(parts));
  g.userData.parts = parts;
  return g;
}

// ---------------------------------------------------------------- terrain de concours

/** Guirlande de fanions entre deux points (x, y, z). */
export function bunting(parent, a, b, colors) {
  const n = Math.max(4, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.7));
  const line = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 13 }, (_, i) => {
    const t = i / 12;
    return new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * 0.6, a[2] + (b[2] - a[2]) * t);
  }));
  parent.add(new THREE.Line(line, new THREE.LineBasicMaterial({ color: 0x444444 })));
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.18, 0, 0, 0.18, 0, 0, 0, -0.34, 0], 3));
  tri.computeVertexNormals();
  const yaw = Math.atan2(b[2] - a[2], b[0] - a[0]);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const m = new THREE.Mesh(tri, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, roughness: 0.7 }));
    m.position.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * 0.6, a[2] + (b[2] - a[2]) * t);
    m.rotation.y = -yaw;
    parent.add(m);
  }
}

/** Tribune : gradins colorés avec un toit rayé. Regarde vers -Z (vers la carrière). Longueur len. */
export function grandstand(len) {
  const g = new THREE.Group();
  const wood = mat(0xd9c3a0, 0.85);
  const seatCols = [0x2f6fd8, 0xe0473a, 0xffcf2e];
  for (let r = 0; r < 3; r++) {
    const y = 0.45 + r * 0.45;
    const z = r * 0.8;
    add(g, new THREE.BoxGeometry(len, 0.12, 0.8), wood, [0, y - 0.3, z]);
    add(g, new THREE.BoxGeometry(len, y - 0.3, 0.1), mat(0xbfa982, 0.9), [0, (y - 0.3) / 2, z - 0.4]);
    add(g, new THREE.BoxGeometry(len - 0.2, 0.1, 0.35), mat(seatCols[r], 0.6), [0, y - 0.18, z + 0.05]);
  }
  add(g, new THREE.BoxGeometry(len, 1.6, 0.12), mat(0xbfa982, 0.9), [0, 0.8, 2.05]);
  // Toit
  for (const x of [-len / 2 + 0.2, 0, len / 2 - 0.2]) add(g, new THREE.BoxGeometry(0.14, 3.6, 0.14), wood, [x, 1.8, 2.1]);
  const roofTex = stripes([0xffffff, 0xe0473a], 2);
  roofTex.wrapS = THREE.RepeatWrapping;
  roofTex.wrapT = THREE.RepeatWrapping;
  roofTex.center.set(0.5, 0.5);
  roofTex.rotation = Math.PI / 2;
  roofTex.repeat.set(1, len / 1.2);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 0.4, 0.08, 3), new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.7 }));
  roof.position.set(0, 3.55, 0.9);
  roof.rotation.x = -0.12;
  roof.castShadow = true;
  g.add(roof);
  // Seats positions (for spectators): local coordinates
  g.userData.seats = [];
  for (let r = 0; r < 3; r++) {
    for (let x = -len / 2 + 0.5; x < len / 2 - 0.3; x += 0.62) g.userData.seats.push([x, 0.45 + r * 0.45 - 0.13, r * 0.8 + 0.05]);
  }
  return g;
}

/**
 * Le terrain de concours complet, dans le repère du terrain (centre en 0, entrée vers +X).
 * hw, hd : demi-dimensions de la carrière.
 */
export function showgroundModel(hw, hd, label) {
  const g = new THREE.Group();
  const white = mat(0xf6f4ee, 0.6);
  // Sable : au ras du terrain (bien plat ici), là où marchent cavaliers et chevaux ; décalage de profondeur pour
  // passer devant le terrain. (À 3,5 cm, il cachait l'ombre de contact des chevaux et les sabots s'y enfonçaient.)
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 - 0.2, hd * 2 - 0.2), mat(0xd8c08f, 1, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = 0.004;
  sand.receiveShadow = true;
  g.add(sand);
  // Lices blanches (avec l'ouverture côté +X)
  const gate = 2.2;
  const posts = [];
  for (let x = -hw; x <= hw + 0.01; x += 2.5) posts.push([x, -hd], [x, hd]);
  for (let z = -hd + 2.5; z < hd; z += 2.5) {
    posts.push([-hw, z]);
    if (Math.abs(z) > gate) posts.push([hw, z]);
  }
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), white, posts.length);
  const m4 = new THREE.Matrix4();
  posts.forEach(([x, z], i) => im.setMatrixAt(i, m4.makeTranslation(x, 0.55, z)));
  im.castShadow = true;
  g.add(im);
  const rail = (len, x, z, alongX) => {
    for (const y of [0.5, 1.0]) add(g, new THREE.BoxGeometry(alongX ? len : 0.07, 0.1, alongX ? 0.07 : len), white, [x, y, z]);
  };
  rail(hw * 2, 0, -hd, true);
  rail(hw * 2, 0, hd, true);
  rail(hd * 2, -hw, 0, false);
  rail(hd - gate, hw, -(hd + gate) / 2, false);
  rail(hd - gate, hw, (hd + gate) / 2, false);
  // Portique d'entrée
  for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.22, 3.4, 0.22), mat(0x2f6fd8, 0.6), [hw + 0.4, 1.7, s * (gate + 0.3)]);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), new THREE.MeshStandardMaterial({ map: fitSign(`🏆 ${label}`), roughness: 0.6, side: THREE.DoubleSide }));
  sign.position.set(hw + 0.45, 3.3, 0);
  sign.rotation.y = Math.PI / 2;
  g.add(sign);
  // Tribune le long du côté +Z
  const stand = grandstand(hw * 1.3);
  stand.position.set(-2, 0, hd + 1.4);
  g.add(stand);
  g.userData.stand = stand;
  // Cabane du jury côté -X
  const jury = new THREE.Group();
  add(jury, new THREE.BoxGeometry(2.6, 2.2, 2.2), mat(0xf2ede4, 0.8), [0, 1.1, 0]);
  add(jury, new THREE.BoxGeometry(2.0, 0.7, 0.1), mat(0x9fc4d8, 0.2), [0.0, 1.5, 1.11]);
  add(jury, new THREE.BoxGeometry(3, 0.2, 2.6), mat(0x2f6fd8, 0.6), [0, 2.3, 0]);
  const js = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshStandardMaterial({ map: signTexture('Jury', '#23302a') }));
  js.position.set(0, 2.75, 1.0);
  jury.add(js);
  jury.position.set(-hw - 2.6, 0, -6);
  jury.rotation.y = Math.PI / 2;
  g.add(jury);
  // Mâts et guirlandes de fanions aux quatre coins
  const corners = [[-hw - 0.6, -hd - 0.6], [hw + 0.6, -hd - 0.6], [hw + 0.6, hd + 0.6], [-hw - 0.6, hd + 0.6]];
  const flagCols = [0xe0473a, 0xffcf2e, 0x2f9a4a, 0x2f6fd8, 0xb070ff, 0xff8a1f];
  for (const [x, z] of corners) {
    add(g, new THREE.CylinderGeometry(0.07, 0.09, 5.5, 8), white, [x, 2.75, z]);
    const f = add(g, new THREE.PlaneGeometry(1, 0.6), new THREE.MeshStandardMaterial({ color: flagCols[(x > 0 ? 1 : 0) + (z > 0 ? 2 : 0)], side: THREE.DoubleSide }), [x + 0.52, 5.1, z]);
    f.userData.flag = true;
  }
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    if (i === 2) continue; // la tribune est là
    bunting(g, [ax, 4.6, az], [bx, 4.6, bz], flagCols);
  }
  mergeStatic(stand);
  mergeStatic(g, [stand]);
  return g;
}

/** Spectateurs assis (corps + tête en instances), avec des couleurs variées. cheer(t, power) les fait sauter. */
export function spectators(seats, rng = Math.random) {
  const g = new THREE.Group();
  const n = seats.length;
  const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.17, 0.32, 3, 8), new THREE.MeshStandardMaterial({ roughness: 0.8 }), n);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.7 }), n);
  const tops = [0xe0473a, 0x2f6fd8, 0xffcf2e, 0x2f9a4a, 0xb070ff, 0xff8a1f, 0xf2f2f2, 0x23302a, 0xff7ab0];
  const skins = [0xf1c7a5, 0xe8b796, 0xc68a62, 0x8d5a3b, 0x5a3a26, 0xf6d7bd];
  const c = new THREE.Color();
  const data = seats.map(([x, y, z], i) => {
    body.setColorAt(i, c.setHex(tops[Math.floor(rng() * tops.length)]));
    head.setColorAt(i, c.setHex(skins[Math.floor(rng() * skins.length)]));
    return { x, y, z, phase: rng() * 10, k: 0.6 + rng() * 0.8 };
  });
  g.add(body, head);
  const m4 = new THREE.Matrix4();
  const update = (time = 0, power = 0) => {
    data.forEach((d, i) => {
      const jump = power > 0 ? Math.max(0, Math.sin(time * 9 * d.k + d.phase)) * 0.22 * power : Math.sin(time * 1.3 + d.phase) * 0.01;
      body.setMatrixAt(i, m4.makeTranslation(d.x, d.y + 0.33 + jump, d.z));
      head.setMatrixAt(i, m4.makeTranslation(d.x, d.y + 0.78 + jump, d.z));
    });
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
  };
  update();
  body.instanceColor.needsUpdate = true;
  head.instanceColor.needsUpdate = true;
  g.userData.cheer = update;
  return g;
}

/** Scène ronde du spectacle avec des tours de projecteurs. Renvoie { group, lamps } (positions des lampes). */
export function showStage() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(3.2, 3.4, 0.25, 40), mat(0xb3262e, 0.5), [0, 0.125, 0]);
  add(g, new THREE.TorusGeometry(3.3, 0.06, 8, 48), mat(0xf2c230, 0.3, { metalness: 0.6 }), [0, 0.25, 0], [Math.PI / 2, 0, 0]);
  // Étoile au centre
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.55 : 1.3;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const sm = new THREE.Mesh(new THREE.ShapeGeometry(star), mat(0xf2c230, 0.4, { metalness: 0.3, emissive: 0x6a4a00, emissiveIntensity: 0.3 }));
  sm.rotation.x = -Math.PI / 2;
  sm.position.y = 0.26;
  g.add(sm);
  const lamps = [];
  const truss = mat(0x3a3a3a, 0.5, { metalness: 0.5 });
  for (const [x, z] of [[-7, -6], [7, -6], [-8, 5], [8, 5]]) {
    add(g, new THREE.BoxGeometry(0.18, 5.5, 0.18), truss, [x, 2.75, z]);
    const lamp = add(g, new THREE.CylinderGeometry(0.22, 0.32, 0.5, 12), mat(0x1d1d1d, 0.4), [x, 5.6, z]);
    lamp.lookAt(new THREE.Vector3(0, 0, 0));
    lamp.rotateX(Math.PI / 2);
    add(g, new THREE.CircleGeometry(0.2, 12), new THREE.MeshBasicMaterial({ color: 0xfff3c8 }), [x - x * 0.03, 5.55, z - z * 0.03]).lookAt(0, 0, 0);
    lamps.push(new THREE.Vector3(x, 5.6, z));
  }
  mergeStatic(g);
  return { group: g, lamps };
}

// ---------------------------------------------------------------- balade

/** Balise de balade : un poteau avec un drapeau numéroté et un cercle au sol. */
export function trailMarker(n, last = false) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.06, 0.07, 2.6, 8), mat(0xf4f4f0), [0, 1.3, 0]);
  const flagMat = new THREE.MeshStandardMaterial({ map: numberTexture(last ? '🏠' : n, last ? '#2f8a5f' : '#ff8a1f', '#ffffff'), side: THREE.DoubleSide, roughness: 0.6 });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), flagMat);
  flag.position.set(0.45, 2.15, 0);
  g.add(flag);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: last ? 0x6fe39a : 0xffb347, transparent: true, opacity: 0.7, depthWrite: false }));
  ring.position.y = 0.08;
  g.add(ring);
  g.userData.ring = ring;
  g.userData.flag = flag;
  return g;
}

/** Points de vue à photographier. */
export function sightModel(id) {
  const g = new THREE.Group();
  const wood = mat(0x8a6342, 0.85);
  switch (id) {
    case 'viewpoint': {
      add(g, new THREE.BoxGeometry(1.8, 0.08, 0.45), wood, [0, 0.45, 0]);
      add(g, new THREE.BoxGeometry(1.8, 0.4, 0.06), wood, [0, 0.7, -0.22]);
      for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.08, 0.45, 0.4), wood, [s * 0.8, 0.22, 0]);
      add(g, new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), wood, [1.4, 0.8, 0]);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshStandardMaterial({ map: signTexture('📷', '#6b4a2f'), side: THREE.DoubleSide }));
      s.position.set(1.4, 1.6, 0);
      g.add(s);
      break;
    }
    case 'windmill': {
      add(g, new THREE.CylinderGeometry(0.9, 1.4, 6, 8), mat(0xf2ede4, 0.8), [0, 3, 0]);
      add(g, new THREE.ConeGeometry(1.2, 1.4, 8), mat(0x8a4a32, 0.7), [0, 6.7, 0]);
      add(g, new THREE.BoxGeometry(0.6, 1.0, 0.1), mat(0x6a4126), [0, 0.5, 1.3]);
      const blades = new THREE.Group();
      blades.position.set(0, 5.6, 1.1);
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Group();
        b.rotation.z = (i * Math.PI) / 2;
        add(b, new THREE.BoxGeometry(0.12, 3.2, 0.06), wood, [0, 1.6, 0]);
        add(b, new THREE.BoxGeometry(0.6, 2.4, 0.03), mat(0xf6f1e4, 0.9), [0.35, 1.9, 0]);
        blades.add(b);
      }
      g.add(blades);
      g.userData.spin = blades;
      break;
    }
    case 'cairn': {
      const stone = mat(0x9a958c, 0.95);
      let y = 0;
      for (let i = 0; i < 6; i++) {
        const r = 0.9 - i * 0.13;
        add(g, new THREE.DodecahedronGeometry(r, 0), stone, [Math.sin(i * 2) * 0.08, y + r * 0.6, Math.cos(i * 3) * 0.08], [i, i * 0.7, 0]).scale.y = 0.6;
        y += r * 0.95;
      }
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        add(g, new THREE.SphereGeometry(0.08, 6, 5), mat([0xffd23a, 0xff5a7a, 0xffffff][i % 3], 0.6), [Math.cos(a) * 1.4, 0.1, Math.sin(a) * 1.4]);
      }
      break;
    }
    default: { // vieux chêne
      add(g, new THREE.CylinderGeometry(0.55, 0.85, 4, 10), mat(0x5a4130, 0.95), [0, 2, 0]);
      const leaves = mat(0x4f8a36, 0.9);
      for (const [x, y, z, r] of [[0, 5, 0, 2.6], [1.8, 4.4, 0.4, 1.8], [-1.6, 4.6, -0.3, 1.9], [0.3, 4.2, 1.7, 1.7], [-0.4, 4.3, -1.7, 1.7]]) {
        add(g, new THREE.IcosahedronGeometry(r, 1), leaves, [x, y, z]);
      }
      // Balançoire
      add(g, new THREE.BoxGeometry(0.7, 0.06, 0.3), wood, [1.8, 0.7, 0]);
      for (const s of [-1, 1]) add(g, new THREE.CylinderGeometry(0.01, 0.01, 2.6, 4), mat(0xd9c3a0), [1.8 + s * 0.3, 2.0, 0]);
    }
  }
  return g;
}

// ---------------------------------------------------------------- jouets du clapier

/** Jouets de l'enclos des lapins : roue, tunnel, balle, plateforme, foin. userData.part = pièce animée. */
export function hutchToy(id) {
  const g = new THREE.Group();
  const wood = mat(0xc49a6c, 0.85);
  let part = null;
  switch (id) {
    case 'wheel': {
      // Grande roue d'exercice sur un support
      for (const s of [-1, 1]) {
        add(g, new THREE.BoxGeometry(0.06, 0.62, 0.06), wood, [s * 0.24, 0.31, 0.18], [0, 0, 0]);
        add(g, new THREE.BoxGeometry(0.06, 0.62, 0.06), wood, [s * 0.24, 0.31, -0.18]);
      }
      add(g, new THREE.BoxGeometry(0.56, 0.05, 0.5), wood, [0, 0.025, 0]);
      part = new THREE.Group();
      part.position.y = 0.42;
      g.add(part);
      const rim = mat(0x2fb8b0, 0.5);
      for (const s of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.03, 8, 28), rim);
        ring.rotation.y = Math.PI / 2;
        ring.position.x = s * 0.17;
        part.add(ring);
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 5), mat(0xf2f2f2, 0.5));
        rung.rotation.z = Math.PI / 2;
        rung.position.set(0, Math.sin(a) * 0.37, Math.cos(a) * 0.37);
        part.add(rung);
      }
      break;
    }
    case 'tunnel': {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.2, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x9a6ad8, roughness: 0.8, side: THREE.DoubleSide }));
      tube.rotation.z = Math.PI / 2;
      tube.position.y = 0.2;
      tube.castShadow = true;
      g.add(tube);
      for (const s of [-1, 1]) add(g, new THREE.TorusGeometry(0.2, 0.025, 6, 18), mat(0xffcf2e, 0.5), [s * 0.6, 0.2, 0], [0, Math.PI / 2, 0]);
      break;
    }
    case 'ball': {
      part = add(g, new THREE.SphereGeometry(0.11, 14, 10), mat(0xe0473a, 0.4), [0, 0.11, 0]);
      add(part, new THREE.TorusGeometry(0.11, 0.015, 6, 16), mat(0xffffff, 0.4), [0, 0, 0]);
      break;
    }
    case 'platform': {
      add(g, new THREE.BoxGeometry(0.6, 0.32, 0.5), wood, [0, 0.16, 0]);
      add(g, new THREE.BoxGeometry(0.62, 0.04, 0.52), mat(0x8a6342, 0.8), [0, 0.34, 0]);
      add(g, new THREE.BoxGeometry(0.3, 0.03, 0.6), wood, [-0.42, 0.15, 0], [0, 0, -0.5]);
      add(g, new THREE.CircleGeometry(0.12, 12), mat(0x3a2a1a, 0.9), [0.0, 0.16, 0.255]);
      break;
    }
    default: { // foin
      const hay = mat(0xd9b860, 1);
      for (let i = 0; i < 7; i++) add(g, new THREE.SphereGeometry(0.13, 7, 5), hay, [Math.sin(i * 2.1) * 0.15, 0.08 + (i % 3) * 0.04, Math.cos(i * 1.7) * 0.12]);
      add(g, new THREE.BoxGeometry(0.5, 0.04, 0.04), wood, [0, 0.32, -0.2]);
    }
  }
  g.userData.part = part;
  if (part) part.userData.keep = true;
  mergeStatic(g, part ? [part] : []);
  return g;
}

/** Flèche flottante qui montre où aller. */
export function guideArrow(color = 0xffd23a) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.4 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 16), m);
  cone.rotation.x = Math.PI;
  cone.position.y = 0.45;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.7, 10), m);
  stick.position.y = 1.2;
  g.add(cone, stick);
  return g;
}
