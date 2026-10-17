// Véhicules du voyage, générés par le code :
//   - le 4x4 qui tire le van (cabine avec sièges, tableau de bord, volant et rétroviseur) ;
//   - le van à chevaux (remorque 2 places) : pont (rampe) et portes hautes à l'arrière, séparation
//     (bat-flanc), barres de poitrail et barres arrière, filets à foin, sellerie avant avec sa porte ;
//     avec plus de chevaux, une remorque plus longue à deux essieux ;
//   - la voiture break avec son hayon, ses caisses de transport et son coffre de toit ;
//   - la caisse de transport et le coffre de sellerie, et les objets qu'on y range.
// Repère de chaque modèle : l'avant regarde vers +z, le sol est à y = 0, le conducteur est à gauche (+x).
// Les pièces qui bougent sont des groupes pivotants (portière, pont, portes, barres, hayon, couvercles)
// renvoyés avec le modèle ; Vehicle.js les anime.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { strawTexture, emojiTexture } from '../textures.js';
import { isHigh } from '../gfx.js';

const V2 = THREE.Vector2;
const V3 = THREE.Vector3;

// ---------------------------------------------------------------- matériaux et textures

const std = (color, roughness = 0.6, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

/** Matériaux d'un véhicule (créés pour lui, libérés avec lui par disposeVehicle). */
function palette(color, accent) {
  return {
    paint: std(color, 0.28, 0.35),
    accent: std(accent, 0.35, 0.25),
    black: std(0x1c1d20, 0.6, 0.1),
    plastic: std(0x2b2c30, 0.85),
    rubber: std(0x141414, 0.95),
    chrome: std(0xe2e5ea, 0.12, 1),
    alu: std(0xbcc2c8, 0.32, 0.85),
    glass: new THREE.MeshStandardMaterial({ color: 0x17262f, roughness: 0.03, metalness: 0.65, transparent: true, opacity: 0.52, depthWrite: false }),
    lamp: std(0xfff7e0, 0.12, 0.1, { emissive: 0xfff0c0, emissiveIntensity: 0.35 }),
    amber: std(0xf2a33a, 0.25, 0, { emissive: 0x6a3a00, emissiveIntensity: 0.4 }),
    tail: std(0xc4221b, 0.25, 0, { emissive: 0x5a0000, emissiveIntensity: 0.5 }),
    seat: std(0x3a3c42, 0.92),
    seatLight: std(0x8a7f70, 0.9),
    dash: std(0x3a3d43, 0.75),
    carpet: std(0x2a2a2c, 1),
    lining: std(0xe6e3dc, 0.85),
    kick: std(0x4a4d52, 0.9),
    mat: std(0x2f3133, 0.95, 0, { map: rubberTexture() }),
    pad: std(0x2a3a52, 0.75),
    wood: std(0x8a5a32, 0.7),
    leather: std(0x6b3d1f, 0.55),
    leatherDark: std(0x2a1a10, 0.6),
    hay: std(0xd8b65a, 0.95, 0, { map: strawTexture() }),
    mirror: std(0xdfe6ee, 0.04, 1),
    plate: std(0xffffff, 0.4, 0, { map: plateTexture() }),
    gauges: new THREE.MeshBasicMaterial({ map: gaugeTexture(), toneMapped: false }),
    screen: new THREE.MeshBasicMaterial({ map: screenTexture(), toneMapped: false }),
  };
}

const texCache = new Map();
function cachedTex(key, draw, w, h, repeat = false) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  texCache.set(key, tex);
  return tex;
}

/** Tapis en caoutchouc du plancher et du pont (petits plots). */
function rubberTexture() {
  return cachedTex('rubber', (ctx, w, h) => {
    ctx.fillStyle = '#3a3c3e';
    ctx.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 8) {
      for (let x = 4 + ((y / 8) % 2) * 4; x < w; x += 8) {
        ctx.fillStyle = '#2a2b2d';
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a4c4f';
        ctx.fillRect(x - 1.5, y - 2, 1.5, 1);
      }
    }
  }, 64, 64, true);
}

/** Plaque d'immatriculation française (bande bleue à gauche). */
function plateTexture() {
  return cachedTex('plate', (ctx, w, h) => {
    ctx.fillStyle = '#fbfbf6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1f47a8';
    ctx.fillRect(0, 0, 30, h);
    ctx.fillRect(w - 30, 0, 30, h);
    ctx.fillStyle = '#ffd52a';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.fillRect(15 + Math.cos(a) * 8 - 1, 18 + Math.sin(a) * 8 - 1, 2, 2);
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('F', 15, 50);
    ctx.fillStyle = '#18181a';
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('AN-123-MA', w / 2, h / 2 + 2);
    ctx.strokeStyle = '#18181a';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  }, 280, 62);
}

/** Compteurs du tableau de bord (vitesse et compte-tours). */
function gaugeTexture() {
  return cachedTex('gauges', (ctx, w, h) => {
    ctx.fillStyle = '#121316';
    ctx.fillRect(0, 0, w, h);
    for (const [cx, max] of [[w * 0.27, 13], [w * 0.73, 9]]) {
      const cy = h * 0.55;
      const r = h * 0.4;
      ctx.strokeStyle = '#3b3f46';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i <= max; i++) {
        const a = Math.PI * 0.75 + (i / max) * Math.PI * 1.5;
        ctx.strokeStyle = i >= max - 2 && max === 9 ? '#e0453a' : '#e8ecf0';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78);
        ctx.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95);
        ctx.stroke();
      }
      const a = Math.PI * 0.75 + 0.35 * Math.PI * 1.5;
      ctx.strokeStyle = '#ff5a3a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85);
      ctx.stroke();
      ctx.fillStyle = '#e8ecf0';
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#7fd36b';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⛽ ▮▮▮▮▯', w / 2, h * 0.93);
  }, 256, 110);
}

/** Écran du tableau de bord quand la caméra du van est éteinte : le GPS. */
function screenTexture() {
  return cachedTex('screen', (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#20344a');
    g.addColorStop(1, '#122030');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#3e6a8f';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 20 + i * 26);
      ctx.bezierCurveTo(w * 0.3, 10 + i * 30, w * 0.6, 40 + i * 20, w, 25 + i * 24);
      ctx.stroke();
    }
    ctx.strokeStyle = '#5fc0ff';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h);
    ctx.bezierCurveTo(w * 0.5, h * 0.6, w * 0.35, h * 0.45, w * 0.55, h * 0.1);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.72);
    ctx.lineTo(w * 0.44, h * 0.86);
    ctx.lineTo(w * 0.5, h * 0.82);
    ctx.lineTo(w * 0.56, h * 0.86);
    ctx.closePath();
    ctx.fill();
  }, 256, 160);
}

/** Croix rouge de la trousse de secours. */
function firstAidTexture() {
  return cachedTex('firstAid', (ctx, w, h) => {
    ctx.fillStyle = '#f4f4f0';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d42b2b';
    ctx.fillRect(w * 0.4, h * 0.18, w * 0.2, h * 0.64);
    ctx.fillRect(w * 0.22, h * 0.4, w * 0.56, h * 0.2);
  }, 64, 64);
}

// ---------------------------------------------------------------- petites aides

function mesh(geo, mat, x = 0, y = 0, z = 0, shadow = false) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (shadow) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  return m;
}

const rbox = (w, h, d, r = 0.03, seg = isHigh() ? 2 : 1) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const curveSegs = () => (isHigh() ? 12 : 7);

/**
 * Une pièce vue de profil (dessinée dans le plan z / y), extrudée sur la largeur (axe x), bords arrondis.
 * draw(shape) dessine le profil ; holes : profils de trous (fenêtres, porte).
 */
function profile(draw, width, mat, { bevel = 0.05, segs = 3, holes = [], shadow = true } = {}) {
  const shape = new THREE.Shape();
  draw(shape);
  for (const hd of holes) {
    const p = new THREE.Path();
    hd(p);
    shape.holes.push(p);
  }
  const depth = Math.max(0.005, width - 2 * bevel);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: curveSegs(), steps: 1,
  });
  geo.rotateY(-Math.PI / 2);
  geo.translate(depth / 2, 0, 0);
  return mesh(geo, mat, 0, 0, 0, shadow);
}

/** Rectangle arrondi (pour les trous des fenêtres), dans le plan z / y. */
function roundRect(p, z0, y0, z1, y1, r) {
  p.moveTo(z0 + r, y0);
  p.lineTo(z1 - r, y0);
  p.quadraticCurveTo(z1, y0, z1, y0 + r);
  p.lineTo(z1, y1 - r);
  p.quadraticCurveTo(z1, y1, z1 - r, y1);
  p.lineTo(z0 + r, y1);
  p.quadraticCurveTo(z0, y1, z0, y1 - r);
  p.lineTo(z0, y0 + r);
  p.quadraticCurveTo(z0, y0, z0 + r, y0);
}

/** Une poutre entre deux points (barres, montants, timon). */
function beam(a, b, r, mat, radial = 8) {
  const dir = new V3().subVectors(b, a);
  const len = dir.length();
  const m = mesh(new THREE.CylinderGeometry(r, r, len, radial), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir.normalize());
  return m;
}

/** Roue : pneu arrondi, jante à rayons et moyeu. side : +1 à gauche (+x), -1 à droite. */
function wheel(P, r, w, x, z, side) {
  const g = new THREE.Group();
  const ri = r * 0.62;
  const hw = w / 2;
  const pts = [
    new V2(ri, -hw * 0.92), new V2(r * 0.86, -hw), new V2(r * 0.97, -hw * 0.82), new V2(r, -hw * 0.4),
    new V2(r, hw * 0.4), new V2(r * 0.97, hw * 0.82), new V2(r * 0.86, hw), new V2(ri, hw * 0.92),
  ];
  const tyre = mesh(new THREE.LatheGeometry(pts, isHigh() ? 24 : 16).rotateZ(Math.PI / 2), P.rubber, 0, 0, 0, true);
  g.add(tyre);
  const rim = mesh(new THREE.CylinderGeometry(ri * 1.01, ri * 1.01, w * 0.78, 18).rotateZ(Math.PI / 2), P.alu);
  g.add(rim);
  const face = side * w * 0.4;
  g.add(mesh(new THREE.CylinderGeometry(ri * 0.28, ri * 0.3, 0.05, 12).rotateZ(Math.PI / 2), P.chrome, face, 0, 0));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const s = mesh(box(0.03, ri * 0.72, ri * 0.2), P.chrome, face * 0.95, Math.cos(a) * ri * 0.5, Math.sin(a) * ri * 0.5);
    s.rotation.x = -a;
    g.add(s);
  }
  // Écrous.
  g.position.set(x, r, z);
  g.userData.wheel = r;
  return g;
}

/** Garde-boue arrondi au-dessus d'une roue (axe x) : la moitié haute d'un cylindre. */
function fender(P, r, w, x, z, y) {
  const g = new THREE.CylinderGeometry(r, r, w, 16, 1, true, 0, Math.PI);
  g.rotateZ(Math.PI / 2);
  const m = mesh(g, P.black, x, y, z);
  m.material.side = THREE.DoubleSide;
  return m;
}

/**
 * Fusionne les pièces fixes qui ont le même matériau, groupe par groupe (les pièces qui bougent restent
 * des groupes à part) : beaucoup moins d'objets à dessiner, donc plus rapide sur téléphone.
 * Les maillages marqués userData.keep (écran…) ne sont pas touchés ; userData.cut (vue en coupe) est gardé.
 */
function mergeStatic(group) {
  const buckets = new Map();
  for (const child of [...group.children]) {
    if (child.isMesh && !child.userData.keep) {
      const key = `${child.material.uuid}|${child.userData.cut ? 1 : 0}|${child.castShadow ? 1 : 0}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(child);
    } else if (!child.isMesh) mergeStatic(child);
  }
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrix();
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      return g;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const m = new THREE.Mesh(merged, list[0].material);
    m.castShadow = list[0].castShadow;
    m.receiveShadow = list[0].receiveShadow;
    m.userData.cut = list[0].userData.cut;
    group.add(m);
    for (const old of list) {
      group.remove(old);
      old.geometry.dispose();
    }
  }
}

/** Un pivot : groupe placé à la charnière ; les pièces sont ajoutées dedans. */
function pivot(x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  return g;
}

/**
 * Une coque mince qui suit un chemin de profil (nez du van, capot, arrière), extrudée sur la largeur.
 * path : THREE.Path dessiné dans le plan z / y.
 */
function band(path, thick, width, mat, samples = 40, side = 1) {
  const outer = path.getSpacedPoints(isHigh() ? samples : Math.ceil(samples * 0.6));
  // side : de quel côté du chemin est l'épaisseur (+1 à gauche du sens du tracé, -1 à droite).
  const inner = outer.map((p, i) => {
    const a = outer[Math.max(0, i - 1)];
    const b = outer[Math.min(outer.length - 1, i + 1)];
    const t = new V2(b.x - a.x, b.y - a.y).normalize();
    return new V2(p.x + t.y * thick * side, p.y - t.x * thick * side);
  });
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape([...outer, ...inner.reverse()]), { depth: width, bevelEnabled: false, curveSegments: 4 });
  geo.rotateY(-Math.PI / 2);
  geo.translate(width / 2, 0, 0);
  return mesh(geo, mat, 0, 0, 0, true);
}

/**
 * Caisse creuse d'une voiture : deux flancs (avec les passages de roues), l'avant (calandre et capot)
 * et l'arrière en coques minces, pour qu'on voie l'intérieur à travers les vitres et depuis la cabine.
 */
function shellBody(g, P, W, side, front, rear) {
  for (const x of [-1, 1]) {
    const f = profile(side, 0.07, P.paint, { bevel: 0.025, segs: 2 });
    f.position.x = x * (W / 2 - 0.035);
    g.add(f);
  }
  const fp = new THREE.Path();
  front(fp);
  g.add(band(fp, 0.05, W - 0.1, P.paint, 30, -1));
  const rp = new THREE.Path();
  rear(rp);
  g.add(band(rp, 0.05, W - 0.1, P.paint, 16));
}

// ---------------------------------------------------------------- intérieur de cabine (4x4 et voiture)

/**
 * Tableau de bord, volant, sièges, console, rétroviseur.
 * o : { W, floorY, dashZ, dashY, seatZ, seatY, roofY, roofFrontZ, rear: z de la banquette, driverX }
 */
function cabin(P, o) {
  const g = new THREE.Group();
  const dx = o.driverX;
  g.add(mesh(box(o.W - 0.2, 0.04, o.floorLen), P.carpet, 0, o.floorY, o.floorZ));
  // Planche de bord (profil extrudé sur la largeur).
  const dz = o.dashZ;
  const dy = o.dashY;
  const dash = profile((s) => {
    s.moveTo(dz + 0.42, dy - 0.38);
    s.lineTo(dz + 0.42, dy + 0.02);
    s.quadraticCurveTo(dz + 0.2, dy + 0.12, dz - 0.02, dy + 0.05);
    s.lineTo(dz - 0.08, dy - 0.1);
    s.lineTo(dz + 0.04, dy - 0.38);
  }, o.W - 0.24, P.dash, { bevel: 0.025, segs: 2, shadow: false });
  g.add(dash);
  // Compteurs sous leur casquette, devant le conducteur.
  g.add(mesh(rbox(0.38, 0.08, 0.16, 0.03), P.dash, dx, dy + 0.1, dz + 0.02));
  const gauges = mesh(new THREE.PlaneGeometry(0.34, 0.145), P.gauges, dx, dy + 0.025, dz - 0.04);
  gauges.rotation.set(-0.25, Math.PI, 0);
  g.add(gauges);
  // Petit écran posé sur la planche de bord, devant le conducteur (GPS, ou la caméra du van).
  const mon = new THREE.Group();
  mon.position.set(dx - 0.3, dy + 0.17, dz + 0.02);
  mon.rotation.set(-0.2, Math.PI - 0.22, 0);
  // (le groupe est retourné vers le conducteur : son +z local regarde le conducteur)
  mon.add(mesh(rbox(0.25, 0.165, 0.03, 0.012), P.black, 0, 0, -0.016));
  const screen = mesh(new THREE.PlaneGeometry(0.225, 0.14), P.screen, 0, 0, 0.001);
  screen.userData.keep = true; // son image change (caméra du van)
  mon.add(screen);
  mon.add(mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.09, 8), P.black, 0, -0.11, -0.024));
  g.add(mon);
  // Aérateurs et boutons.
  for (const x of [-0.62, -0.2, 0.2, 0.62]) g.add(mesh(rbox(0.1, 0.05, 0.03, 0.01), P.black, x * (o.W / 1.9), dy - 0.12, dz - 0.05));
  // Volant.
  const wheelG = new THREE.Group();
  wheelG.position.set(dx, dy - 0.04, dz - 0.3);
  wheelG.rotation.x = 0.42;
  wheelG.add(mesh(new THREE.TorusGeometry(0.17, 0.02, 8, isHigh() ? 28 : 18), P.black));
  wheelG.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 14).rotateX(Math.PI / 2), P.plastic));
  for (const a of [Math.PI / 2 + 0.2, Math.PI / 2 - 0.2, -Math.PI / 2]) {
    const sp = mesh(box(0.018, 0.13, 0.025), P.black, Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0);
    sp.rotation.z = a - Math.PI / 2;
    wheelG.add(sp);
  }
  wheelG.add(mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.3, 8).rotateX(Math.PI / 2), P.plastic, 0, 0, 0.16));
  g.add(wheelG);
  // Sièges avant (le conducteur à gauche) et banquette arrière.
  const seat = (x, z, w = 0.5) => {
    const s = new THREE.Group();
    s.position.set(x, o.seatY, z);
    s.add(mesh(rbox(w, 0.13, 0.5, 0.05), P.seat, 0, 0, 0));
    const back = mesh(rbox(w, 0.64, 0.13, 0.05), P.seat, 0, 0.36, -0.27);
    back.rotation.x = -0.16;
    s.add(back);
    if (w < 1) s.add(mesh(rbox(0.26, 0.18, 0.1, 0.04), P.seat, 0, 0.78, -0.35));
    // Coutures plus claires.
    s.add(mesh(box(w * 0.5, 0.012, 0.42), P.seatLight, 0, 0.068, 0.01));
    g.add(s);
    return s;
  };
  seat(dx, o.seatZ);
  seat(-dx, o.seatZ);
  if (o.rear !== undefined) seat(0, o.rear, o.W - 0.36);
  // Console centrale et levier de vitesse.
  g.add(mesh(rbox(0.2, 0.22, 0.62, 0.04), P.dash, 0, o.seatY - 0.02, o.seatZ + 0.32));
  g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), P.chrome, 0, o.seatY + 0.14, o.seatZ + 0.46));
  g.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), P.black, 0, o.seatY + 0.22, o.seatZ + 0.46));
  // Rétroviseur intérieur (miroir : il reflète le ciel ; Vehicle.js peut y mettre une image).
  const my = o.roofY - 0.13;
  const mz = o.roofFrontZ - 0.12;
  g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6), P.black, 0, my + 0.06, mz + 0.03));
  g.add(mesh(rbox(0.27, 0.08, 0.03, 0.012), P.black, 0, my, mz));
  const mirror = mesh(new THREE.PlaneGeometry(0.245, 0.06), P.mirror, 0, my, mz - 0.017);
  mirror.rotation.y = Math.PI;
  g.add(mirror);
  // Pare-soleil.
  for (const x of [dx, -dx]) {
    const v = mesh(rbox(0.36, 0.015, 0.16, 0.006), P.seatLight, x, o.roofY - 0.05, o.roofFrontZ - 0.12);
    v.rotation.x = 0.15;
    g.add(v);
  }
  return { group: g, screen, mirror, steering: wheelG };
}

// ---------------------------------------------------------------- 4x4 (tracteur du van)

/** Le 4x4 qui tire le van. Renvoie { group, length, width, hitchZ, door, eye, screen, mirror }. */
export function towCar(color = 0x2f5d4e, accent = 0xd8d2c0) {
  const P = palette(color, accent);
  const g = new THREE.Group();
  const W = 1.92;
  const L = 4.66;
  // Caisse creuse (jusqu'à la ligne des vitres), avec les passages de roues.
  shellBody(g, P, W, (s) => {
    s.moveTo(-2.28, 0.44);
    s.lineTo(-1.96, 0.44);
    s.absarc(-1.42, 0.44, 0.54, Math.PI, 0, true);
    s.lineTo(0.91, 0.44);
    s.absarc(1.45, 0.44, 0.54, Math.PI, 0, true);
    s.lineTo(2.26, 0.44);
    s.lineTo(2.32, 0.62);
    s.lineTo(2.32, 0.98);
    s.quadraticCurveTo(2.31, 1.11, 2.14, 1.13);
    s.lineTo(1.1, 1.19);
    s.lineTo(-2.22, 1.19);
    s.quadraticCurveTo(-2.3, 1.19, -2.3, 1.1);
    s.lineTo(-2.3, 0.52);
    s.closePath();
  }, (p) => {
    p.moveTo(2.26, 0.44);
    p.lineTo(2.32, 0.62);
    p.lineTo(2.32, 0.98);
    p.quadraticCurveTo(2.31, 1.11, 2.14, 1.13);
    p.lineTo(1.1, 1.19);
  }, (p) => {
    p.moveTo(-2.3, 0.46);
    p.lineTo(-2.3, 1.1);
    p.quadraticCurveTo(-2.3, 1.19, -2.22, 1.19);
  });
  // Vitres (une seule pièce teintée), toit et montants.
  g.add(profile((s) => {
    s.moveTo(1.12, 1.18);
    s.lineTo(0.42, 1.8);
    s.lineTo(-2.08, 1.83);
    s.lineTo(-2.2, 1.78);
    s.lineTo(-2.22, 1.18);
    s.closePath();
  }, W - 0.2, P.glass, { bevel: 0.025, segs: 1, shadow: false }));
  g.add(mesh(rbox(W - 0.1, 0.09, 2.66, 0.04), P.paint, 0, 1.885, -0.84, true));
  for (const x of [-1, 1]) {
    g.add(mesh(rbox(0.05, 0.05, 2.3, 0.02), P.alu, x * 0.72, 1.96, -0.88)); // barres de toit
    const ap = beam(new V3(x * 0.87, 1.17, 1.12), new V3(x * 0.87, 1.82, 0.42), 0.04, P.paint, 6);
    g.add(ap);
    for (const z of [-0.26, -1.26, -2.17]) g.add(mesh(box(0.07, 0.64, z < -2 ? 0.1 : 0.12), P.paint, x * 0.87, 1.5, z));
  }
  // Calandre, phares ronds, pare-chocs, plaque.
  g.add(mesh(rbox(1.18, 0.3, 0.08, 0.03), P.black, 0, 0.83, 2.3));
  for (let i = 0; i < 4; i++) g.add(mesh(box(1.05, 0.025, 0.02), P.alu, 0, 0.73 + i * 0.065, 2.345));
  for (const x of [-1, 1]) {
    g.add(mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 18), P.chrome, x * 0.73, 0.86, 2.33));
    g.add(mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.04, 18).rotateX(Math.PI / 2), P.lamp, x * 0.73, 0.86, 2.32));
    g.add(mesh(rbox(0.12, 0.05, 0.03, 0.01), P.amber, x * 0.73, 0.67, 2.33));
    // Feux arrière, rétroviseurs, marchepieds, élargisseurs d'ailes.
    g.add(mesh(rbox(0.1, 0.32, 0.04, 0.015), P.tail, x * 0.87, 0.92, -2.33));
    g.add(mesh(rbox(0.1, 0.06, 0.04, 0.01), P.amber, x * 0.87, 0.71, -2.33));
    g.add(mesh(box(0.06, 0.03, 0.22), P.black, x * 1.0, 1.22, 0.96));
    g.add(mesh(rbox(0.12, 0.17, 0.24, 0.03), P.black, x * 1.1, 1.26, 0.92));
    const mg = mesh(new THREE.PlaneGeometry(0.2, 0.13), P.mirror, x * 1.1, 1.26, 0.795);
    mg.rotation.y = Math.PI;
    g.add(mg);
    g.add(mesh(rbox(0.14, 0.05, 1.5, 0.02), P.black, x * 0.98, 0.36, -0.2));
    g.add(mesh(box(0.03, 0.025, 3.3), P.black, x * 0.945, 1.2, -0.56)); // joint au bas des vitres
    for (const z of [-1.42, 1.45]) g.add(fender(P, 0.56, 0.09, x * 0.985, z, 0.44));
    // Poignées et lignes des portières.
    for (const z of [-0.28, -1.0]) g.add(mesh(box(0.012, 0.7, 0.012), P.black, x * 0.995, 0.81, z));
    for (const z of [0.12, -0.7]) g.add(mesh(rbox(0.03, 0.03, 0.14, 0.01), P.chrome, x * 1.0, 1.05, z));
  }
  g.add(mesh(rbox(W + 0.06, 0.2, 0.24, 0.05), P.black, 0, 0.47, 2.28, true));
  g.add(mesh(rbox(W + 0.04, 0.18, 0.2, 0.05), P.black, 0, 0.47, -2.28, true));
  g.add(mesh(new THREE.PlaneGeometry(0.52, 0.115), P.plate, 0, 0.48, 2.405));
  const rp = mesh(new THREE.PlaneGeometry(0.52, 0.115), P.plate, 0, 0.62, -2.385);
  rp.rotation.y = Math.PI;
  g.add(rp);
  // Porte arrière (charnière à droite) avec la roue de secours, et boule d'attelage.
  const rearDoor = pivot(-0.84, 0, -2.33);
  rearDoor.add(mesh(rbox(1.66, 0.7, 0.05, 0.025), P.paint, 0.84, 0.83, 0, true));
  rearDoor.add(mesh(rbox(0.05, 0.05, 0.14, 0.015), P.chrome, 1.5, 1.0, -0.04));
  const spare = wheel(P, 0.38, 0.24, 0, 0, 1);
  spare.rotation.y = Math.PI / 2;
  spare.position.set(0.84, 1.12, -0.16);
  spare.userData.wheel = 0; // la roue de secours ne tourne pas
  rearDoor.add(spare);
  rearDoor.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 20).rotateX(Math.PI / 2), P.accent, 0.84, 1.12, -0.3));
  rearDoor.add(mesh(rbox(0.12, 0.3, 0.12, 0.02), P.black, 0.84, 1.12, -0.12));
  g.add(rearDoor);
  g.add(mesh(box(0.08, 0.08, 0.36), P.black, 0, 0.42, -2.48));
  g.add(mesh(new THREE.SphereGeometry(0.05, 12, 10), P.chrome, 0, 0.5, -2.64));
  // Roues.
  for (const [x, z] of [[-0.86, 1.45], [0.86, 1.45], [-0.86, -1.42], [0.86, -1.42]]) g.add(wheel(P, 0.41, 0.3, x, z, Math.sign(x)));
  // Portière du conducteur (s'ouvre quand on monte).
  const door = pivot(W / 2 + 0.01, 0, 0.93);
  door.add(mesh(rbox(0.05, 0.7, 1.16, 0.025), P.paint, 0, 0.82, -0.6, true));
  door.add(mesh(box(0.04, 0.05, 1.08), P.paint, 0, 1.75, -0.62));
  door.add(mesh(box(0.04, 0.6, 0.05), P.paint, 0, 1.46, -1.16));
  door.add(mesh(rbox(0.06, 0.4, 0.95, 0.02), P.seat, -0.04, 0.85, -0.6));
  door.add(mesh(rbox(0.03, 0.03, 0.14, 0.01), P.chrome, 0.03, 1.05, -0.95));
  g.add(door);
  // Intérieur.
  const inside = cabin(P, {
    W, driverX: 0.43, floorY: 0.5, floorZ: -0.5, floorLen: 3.4, dashZ: 0.86, dashY: 1.12, seatY: 0.66, seatZ: -0.1,
    rear: -1.15, roofY: 1.84, roofFrontZ: 0.5,
  });
  g.add(inside.group);
  mergeStatic(g);
  return {
    group: g, length: L, width: W, hitchZ: -2.64, door, rearDoor, P,
    // Caisses des petits animaux : dans le coffre, puis sur la banquette (attachées par la ceinture).
    crateSlots: [new V3(-0.42, 0.53, -1.86), new V3(0.42, 0.53, -1.86), new V3(-0.44, 0.74, -1.12), new V3(0.44, 0.74, -1.12)],
    eye: new V3(0.43, 1.47, -0.3), screen: inside.screen, mirror: inside.mirror, steering: inside.steering,
    // Téléphone en portrait : plus haut, en arrière, vers le milieu (pare-brise et rétroviseur dans l'image étroite).
    eyePortrait: new V3(0.29, 1.59, -0.38),
  };
}

// ---------------------------------------------------------------- van à chevaux

/**
 * Remorque à chevaux : 2 places par rangée (rows rangées), pont et portes hautes à l'arrière.
 * Renvoie { group, length, width, frontZ, rearZ, floorY, ramp, upperDoors, tackDoor, stalls, bars, hayNets,
 *           tieRings, cargo: emplacements du matériel, eye: points de vue }.
 */
export function horseTrailer(rows = 1, color = 0xf4f1ea, accent = 0x2f6b4f) {
  const P = palette(color, accent);
  const g = new THREE.Group();
  // Pièces du côté gauche et du toit : cachées pour voir l'intérieur en coupe (compartiment, sellerie).
  const cut = [];
  const add = (m, x = 1) => {
    g.add(m);
    if (x > 0) m.userData.cut = true;
    return m;
  };
  const W = 1.84;
  const floorY = 0.4;
  const roofY = 2.72;
  const ROW = 2.45;
  const zBreast = (r) => 1.06 - r * ROW;
  const zRearBar = (r) => zBreast(r) - 1.95; // juste derrière la croupe du cheval
  const zr = zRearBar(rows - 1) - 0.36; // arrière
  const zf = 1.62; // début du nez (sellerie avant)
  const nose = (s) => {
    s.bezierCurveTo(2.0, 0.34, 2.14, 0.85, 2.14, 1.35);
    s.bezierCurveTo(2.14, 2.1, 1.96, 2.62, 1.46, roofY);
  };
  // Parois latérales, avec les fenêtres (et la porte de la sellerie à gauche).
  const wallShape = (s) => {
    s.moveTo(zr, 0.34);
    s.lineTo(zf, 0.34);
    nose(s);
    s.lineTo(zr + 0.08, roofY);
    s.quadraticCurveTo(zr, roofY, zr, roofY - 0.08);
    s.lineTo(zr, 0.34);
  };
  const windows = [];
  for (let r = 0; r < rows; r++) windows.push((p) => roundRect(p, zBreast(r) - 1.25, 1.78, zBreast(r) - 0.2, 2.32, 0.12));
  const tackHole = (p) => roundRect(p, 1.28, 0.5, 1.94, 1.5, 0.06);
  for (const x of [-1, 1]) {
    const wall = profile(wallShape, 0.045, P.paint, { bevel: 0.01, segs: 1, holes: x > 0 ? [...windows, tackHole] : windows });
    wall.position.x = x * (W / 2 - 0.0225);
    add(wall, x);
    // Bas de caisse en aluminium, bande de couleur et feux de gabarit.
    const len = zf - zr;
    add(mesh(box(0.012, 0.5, len), P.alu, x * (W / 2 + 0.004), 0.6, (zf + zr) / 2), x);
    add(mesh(box(0.012, 0.08, len - 0.2), P.accent, x * (W / 2 + 0.006), 1.42, (zf + zr) / 2 - 0.1), x);
    add(mesh(box(0.012, 0.03, len - 0.2), P.accent, x * (W / 2 + 0.006), 1.3, (zf + zr) / 2 - 0.1), x);
    for (let i = 0; i < 3; i++) add(mesh(rbox(0.03, 0.04, 0.07, 0.01), P.amber, x * (W / 2 + 0.01), 0.72, zr + 0.3 + (i * (len - 0.4)) / 2), x);
    // Vitres des fenêtres (avec des barreaux devant les yeux des chevaux).
    for (let r = 0; r < rows; r++) {
      const zc = zBreast(r) - 0.72;
      add(mesh(box(0.012, 0.5, 1.0), P.glass, x * (W / 2 - 0.01), 2.05, zc), x);
      for (let i = 0; i < 6; i++) add(mesh(box(0.016, 0.52, 0.016), P.alu, x * (W / 2 - 0.05), 2.05, zc - 0.45 + i * 0.18), x);
    }
    // Doublure intérieure : pare-coups sombres en bas, panneaux clairs en haut.
    add(mesh(box(0.02, 0.85, zf - zr - 0.1), P.kick, x * (W / 2 - 0.06), floorY + 0.43, (zf + zr) / 2 - 0.05), x);
  }
  // Nez et toit : une coque courbe d'une paroi à l'autre.
  const path = new THREE.Path();
  path.moveTo(zf, 0.34);
  nose(path);
  path.lineTo(zr + 0.02, roofY);
  add(band(path, 0.045, W - 0.06, P.paint, 60, -1));
  // Vitre du nez, lanterneau sur le toit, plafond clair et lumière.
  const nw = mesh(rbox(1.2, 0.42, 0.03, 0.08), P.glass, 0, 2.18, 2.02);
  nw.rotation.x = -0.62;
  add(nw);
  add(mesh(rbox(0.62, 0.1, 0.5, 0.04), P.plastic, 0, roofY + 0.05, zBreast(0) - 0.6));
  add(mesh(box(W - 0.14, 0.02, zf - zr - 0.1), P.lining, 0, roofY - 0.06, (zf + zr) / 2));
  add(mesh(rbox(0.3, 0.03, 0.12, 0.01), P.lamp, 0, roofY - 0.08, zBreast(0) - 1.0));
  // Plancher, tapis, châssis.
  g.add(mesh(box(W, 0.08, zf - zr + 0.25), P.black, 0, floorY - 0.04, (zf + zr) / 2 + 0.12, true));
  const matGeo = new THREE.PlaneGeometry(W - 0.12, zf - zr - 0.05).rotateX(-Math.PI / 2);
  const uv = matGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 10, uv.getY(i) * 20);
  g.add(mesh(matGeo, P.mat, 0, floorY + 0.006, (zf + zr) / 2));
  // Mur avant (poitrail) et mangeoire : la sellerie avant est dessous, devant.
  g.add(mesh(box(W - 0.1, floorY + 1.05 - floorY, 0.05), P.kick, 0, floorY + 0.52, 1.52));
  // (la mangeoire et sa tablette se cachent aussi quand on regarde dans la sellerie, par-dessus)
  const manger = mesh(rbox(W - 0.14, 0.12, 0.34, 0.04), P.plastic, 0, floorY + 1.1, 1.68);
  const shelf = mesh(box(W - 0.14, 0.03, 0.52), P.lining, 0, floorY + 1.02, 1.82);
  manger.userData.keep = true;
  shelf.userData.keep = true;
  g.add(manger, shelf);
  // Roues, garde-boue, timon, roue jockey, feux arrière.
  const axles = rows > 1 ? [zr + 0.5 * (zf - zr) - 0.45, zr + 0.5 * (zf - zr) + 0.45] : [-0.08];
  for (const az of axles) {
    for (const x of [-1, 1]) {
      g.add(wheel(P, 0.33, 0.2, x * (W / 2 + 0.13), az, x));
      add(fender(P, 0.4, 0.26, x * (W / 2 + 0.13), az, 0.33), x);
    }
  }
  for (const x of [-1, 1]) add(mesh(box(0.28, 0.035, (axles[axles.length - 1] - axles[0]) + 0.85), P.black, x * (W / 2 + 0.13), 0.74, (axles[0] + axles[axles.length - 1]) / 2), x);
  const hitchZ = 3.35;
  for (const x of [-1, 1]) g.add(beam(new V3(x * 0.55, 0.36, 1.85), new V3(x * 0.06, 0.44, hitchZ - 0.25), 0.045, P.black, 6));
  g.add(mesh(rbox(0.16, 0.12, 0.34, 0.03), P.black, 0, 0.47, hitchZ - 0.12));
  g.add(mesh(new THREE.SphereGeometry(0.07, 12, 10), P.alu, 0, 0.45, hitchZ - 0.02));
  g.add(mesh(rbox(0.32, 0.12, 0.2, 0.03), P.black, 0, 0.5, hitchZ - 0.5)); // frein
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), P.alu, 0.18, 0.32, hitchZ - 0.7));
  const jockey = wheel(P, 0.1, 0.07, 0.18, hitchZ - 0.7, 1);
  jockey.position.y = 0.1;
  g.add(jockey);
  for (const x of [-1, 1]) {
    g.add(mesh(rbox(0.36, 0.12, 0.05, 0.02), P.tail, x * 0.62, 0.52, zr - 0.02));
    g.add(mesh(rbox(0.12, 0.12, 0.05, 0.02), P.amber, x * 0.86, 0.52, zr - 0.02));
    add(mesh(box(0.06, roofY - 0.4, 0.06), P.alu, x * (W / 2 - 0.03), (roofY + 0.4) / 2, zr + 0.01), x); // montants arrière
  }
  // Pont (rampe) : charnière au bord du plancher ; fermé, il remonte et ferme le bas de l'arrière.
  const ramp = pivot(0, floorY, zr);
  const RL = 1.44;
  ramp.add(mesh(box(W - 0.1, 0.04, RL), P.mat, 0, 0.02, -RL / 2));
  ramp.add(mesh(box(W - 0.1, 0.035, RL), P.paint, 0, -0.018, -RL / 2, true));
  for (let i = 0; i < 6; i++) ramp.add(mesh(box(W - 0.24, 0.025, 0.04), P.kick, 0, 0.05, -0.18 - i * 0.22));
  for (const x of [-1, 1]) ramp.add(mesh(box(0.04, 0.06, RL), P.alu, x * (W / 2 - 0.06), 0.0, -RL / 2));
  const plate = mesh(new THREE.PlaneGeometry(0.52, 0.115), P.plate, 0, -0.04, -RL + 0.25);
  plate.rotation.x = Math.PI / 2;
  ramp.add(plate);
  ramp.add(mesh(box(0.4, 0.03, 0.06), P.alu, 0, -0.045, -RL + 0.08)); // poignée
  g.add(ramp);
  // Portes hautes (deux battants qui s'ouvrent sur les côtés).
  const upperDoors = [];
  for (const x of [-1, 1]) {
    const d = pivot(x * (W / 2 + 0.02), 0, zr - 0.01);
    d.add(mesh(rbox(W / 2 - 0.03, roofY - floorY - RL - 0.1, 0.045, 0.02), P.paint, -x * (W / 4 + 0.02), (roofY + floorY + RL) / 2 + 0.02, 0, true));
    d.add(mesh(box(0.04, 0.04, 0.06), P.alu, -x * (W / 2 - 0.09), floorY + RL + 0.4, -0.03));
    d.userData.side = x;
    add(d, x);
    upperDoors.push(d);
  }
  // Porte de la sellerie avant (côté gauche).
  const tackDoor = pivot(W / 2 + 0.012, 0, 1.94);
  tackDoor.add(mesh(rbox(0.03, 0.98, 0.64, 0.02), P.paint, 0, 1.0, -0.33, true));
  tackDoor.add(mesh(box(0.012, 0.98, 0.012), P.black, 0.016, 1.0, -0.65));
  tackDoor.add(mesh(rbox(0.03, 0.03, 0.12, 0.01), P.alu, 0.02, 1.0, -0.56));
  add(tackDoor);

  // Places : séparation, barres de poitrail, barres arrière, filets à foin, anneaux d'attache.
  const stalls = [];
  const bars = [];
  const hayNets = [];
  const tieRings = [];
  for (let r = 0; r < rows; r++) {
    const zb = zBreast(r);
    const zrb = zRearBar(r);
    // Bat-flanc : panneau rembourré au milieu, avec un tube en haut.
    g.add(mesh(rbox(0.05, 0.85, zb - zrb - 0.25, 0.02), P.pad, 0, floorY + 0.82, (zb + zrb) / 2 - 0.05));
    g.add(beam(new V3(0, floorY + 1.3, zrb + 0.1), new V3(0, floorY + 1.3, zb - 0.05), 0.025, P.alu, 8));
    g.add(beam(new V3(0, floorY + 1.3, zb - 0.05), new V3(0, roofY - 0.06, zb - 0.05), 0.03, P.alu, 8));
    if (r > 0) g.add(mesh(box(W - 0.1, 1.0, 0.04), P.kick, 0, floorY + 0.5, zb + 0.22));
    // La place de gauche d'abord : un cheval seul voyage à gauche (côté du milieu de la route).
    for (const x of [1, -1]) {
      const sx = x * 0.44;
      // Barre de poitrail : pivote vers le haut quand elle est ouverte.
      const bb = pivot(x * (W / 2 - 0.08), floorY + 1.18, zb);
      bb.add(beam(new V3(0, 0, 0), new V3(-x * 0.8, 0, 0), 0.05, P.pad, 10));
      bb.add(mesh(new THREE.SphereGeometry(0.055, 10, 8), P.alu));
      bb.userData = { kind: 'breastBar', side: x, row: r, open: { z: -x * 1.35 } };
      g.add(bb);
      // Barre arrière (barre de fesse) : ouverte, elle pend le long de la paroi.
      const rb = pivot(x * (W / 2 - 0.08), floorY + 1.02, zrb);
      rb.add(beam(new V3(0, 0, 0), new V3(-x * 0.8, 0, 0), 0.05, P.pad, 10));
      rb.add(mesh(new THREE.SphereGeometry(0.055, 10, 8), P.alu));
      rb.userData = { kind: 'rearBar', side: x, row: r, open: { z: x * 1.45 } };
      g.add(rb);
      // Filet à foin (garni ou vide) accroché au-dessus de la mangeoire.
      const net = new THREE.Group();
      // (vers la séparation : vue en coupe, on voit la tête du cheval devant son filet)
      net.position.set(x * 0.3, floorY + 1.68, zb + (r === 0 ? 0.36 : 0.12));
      const hay = mesh(new THREE.SphereGeometry(0.2, 10, 8), P.hay);
      hay.scale.set(1.05, 1.25, 0.8);
      const mesh2 = mesh(new THREE.SphereGeometry(0.215, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2c4a2a, wireframe: true }));
      mesh2.scale.copy(hay.scale);
      net.add(hay, mesh2);
      net.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4), P.black, 0, 0.36, 0));
      hayNets.push(net);
      g.add(net);
      // Anneau d'attache.
      const ring = mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 12), P.alu, x * 0.2, floorY + 1.26, zb + (r === 0 ? 0.43 : 0.18));
      g.add(ring);
      tieRings.push(ring.position.clone());
      stalls.push({ x: sx, zFront: zb, zRear: zrb, row: r, side: x, y: floorY });
    }
    bars.push(...g.children.filter((c) => c.userData?.row === r && (c.userData.kind === 'breastBar' || c.userData.kind === 'rearBar')));
  }
  // Sellerie avant : porte-selles, crochets, et la place du coffre.
  const cargo = {
    rack: [new V3(-0.42, floorY + 0.72, 1.86), new V3(-0.42, floorY + 0.42, 1.86)],
    hooks: [new V3(0.1, floorY + 0.95, 1.58), new V3(-0.1, floorY + 0.95, 1.58), new V3(-0.3, floorY + 0.95, 1.58)],
    floor: [new V3(-0.62, floorY, 1.78), new V3(-0.25, floorY, 1.95), new V3(0.05, floorY, 1.72), new V3(-0.62, floorY, 1.95)],
    trunk: new V3(0.36, floorY, 1.73),
    trunkYaw: 0,
  };
  for (const p of cargo.rack) g.add(mesh(rbox(0.36, 0.05, 0.16, 0.02), P.alu, p.x, p.y - 0.05, p.z));
  for (const net of hayNets) for (const c of net.children) c.userData.keep = true; // garnis ou vides
  mergeStatic(g);
  for (const c of g.children) if (c.userData.cut) cut.push(c);
  return {
    group: g, P, length: hitchZ - zr, bodyLength: zf + 0.5 - zr, width: W, frontZ: 2.14, rearZ: zr, hitchZ, floorY, roofY, rampLength: RL,
    ramp, upperDoors, tackDoor, stalls, bars, hayNets, tieRings, cargo, rows, cutaway: cut, cutTack: [manger, shelf, ...hayNets],
    views: {
      // Compartiment et sellerie vus en coupe, de côté (le flanc gauche et le toit sont cachés) :
      // on voit le cheval de profil, la barre de poitrail devant lui, la barre arrière, le filet à foin.
      stall: { pos: new V3(W / 2 + 2.6 + (rows - 1) * 2.2, 3.2 + (rows - 1) * 0.9, (zf + zr) / 2 + 0.1), look: new V3(-0.1, floorY + 0.55, (zf + zr) / 2 + 0.2) },
      // Sellerie : à hauteur du coffre, sous la tablette de la mangeoire (le coffre apparaît en haut de l'écran).
      tack: { pos: new V3(W / 2 + 1.45, 2.35, 1.25), look: new V3(-0.15, floorY + 0.2, 1.8) },
      // Caméra du van (écran du tableau de bord) : dans un coin à l'avant, elle regarde les chevaux.
      camera: { pos: new V3(-0.66, roofY - 0.24, 1.42), look: new V3(0.3, floorY + 1.2, zBreast(0) - 1.4) },
    },
  };
}

// ---------------------------------------------------------------- voiture break

/** Voiture break : hayon, banquette, caisses dans le coffre, coffre de toit. */
export function car(color = 0x2f6fb0, accent = 0x1d1d1f) {
  const P = palette(color, accent);
  const g = new THREE.Group();
  const W = 1.84;
  const L = 4.62;
  shellBody(g, P, W, (s) => {
    s.moveTo(-2.0, 0.38);
    s.lineTo(-1.86, 0.38);
    s.absarc(-1.4, 0.38, 0.46, Math.PI, 0, true);
    s.lineTo(0.98, 0.38);
    s.absarc(1.44, 0.38, 0.46, Math.PI, 0, true);
    s.lineTo(2.22, 0.38);
    s.lineTo(2.28, 0.56);
    s.quadraticCurveTo(2.29, 0.82, 2.06, 0.88);
    s.lineTo(1.0, 0.98);
    s.lineTo(-2.0, 1.0);
    s.closePath();
  }, (p) => {
    p.moveTo(2.22, 0.38);
    p.lineTo(2.28, 0.56);
    p.quadraticCurveTo(2.29, 0.82, 2.06, 0.88);
    p.lineTo(1.0, 0.98);
  }, (p) => {
    p.moveTo(-2.0, 0.4);
    p.lineTo(-2.0, 0.6);
  });
  g.add(profile((s) => {
    s.moveTo(1.0, 0.98);
    s.lineTo(0.18, 1.42);
    s.lineTo(-1.86, 1.44);
    s.lineTo(-1.98, 1.36);
    s.lineTo(-1.99, 0.98);
    s.closePath();
  }, W - 0.18, P.glass, { bevel: 0.02, segs: 1, shadow: false }));
  g.add(mesh(rbox(W - 0.12, 0.07, 2.12, 0.035), P.paint, 0, 1.47, -0.82, true));
  for (const x of [-1, 1]) {
    g.add(beam(new V3(x * 0.86, 0.98, 1.0), new V3(x * 0.86, 1.43, 0.2), 0.035, P.paint, 6));
    for (const z of [-0.45, -1.35]) g.add(mesh(box(0.06, 0.46, 0.1), P.paint, x * 0.86, 1.2, z));
    g.add(mesh(rbox(0.04, 0.04, 1.9, 0.015), P.alu, x * 0.7, 1.52, -0.85)); // barres de toit
    g.add(mesh(rbox(0.13, 0.11, 0.2, 0.03), P.paint, x * 1.02, 1.04, 0.86)); // rétroviseurs
    const mg = mesh(new THREE.PlaneGeometry(0.17, 0.09), P.mirror, x * 1.02, 1.04, 0.755);
    mg.rotation.y = Math.PI;
    g.add(mg);
    g.add(mesh(rbox(0.3, 0.08, 0.05, 0.02), P.lamp, x * 0.62, 0.74, 2.25));
    g.add(mesh(rbox(0.1, 0.04, 0.04, 0.01), P.amber, x * 0.82, 0.66, 2.24));
    for (const z of [-0.45, 0.4]) g.add(mesh(rbox(0.03, 0.025, 0.13, 0.01), P.chrome, x * 0.965, 0.9, z));
    for (const z of [0.95, -0.44, -1.3]) g.add(mesh(box(0.01, 0.55, 0.01), P.black, x * 0.97, 0.7, z));
  }
  g.add(mesh(rbox(0.9, 0.16, 0.06, 0.03), P.black, 0, 0.55, 2.27));
  g.add(mesh(rbox(W + 0.04, 0.18, 0.2, 0.05), P.accent, 0, 0.42, 2.22, true));
  g.add(mesh(rbox(W + 0.04, 0.18, 0.2, 0.05), P.accent, 0, 0.42, -2.12, true));
  g.add(mesh(new THREE.PlaneGeometry(0.52, 0.115), P.plate, 0, 0.42, 2.325));
  for (const [x, z] of [[-0.84, 1.44], [0.84, 1.44], [-0.84, -1.4], [0.84, -1.4]]) g.add(wheel(P, 0.35, 0.24, x, z, Math.sign(x)));
  // Hayon : charnière en haut, à l'arrière du toit ; il se soulève pour ouvrir le coffre.
  const tailgate = pivot(0, 1.44, -1.9);
  const tw = profile((s) => {
    s.moveTo(-0.0, 0.0);
    s.lineTo(-0.22, -0.46);
    s.lineTo(-0.26, -1.04);
    s.lineTo(-0.16, -1.04);
    s.lineTo(-0.12, -0.46);
    s.lineTo(0.06, 0.0);
    s.closePath();
  }, W - 0.04, P.paint, { bevel: 0.03, segs: 2 });
  tailgate.add(tw);
  const rw = mesh(box(W - 0.3, 0.42, 0.02), P.glass, 0, -0.22, -0.13);
  rw.rotation.x = 0.44;
  tailgate.add(rw);
  for (const x of [-1, 1]) tailgate.add(mesh(rbox(0.32, 0.12, 0.04, 0.02), P.tail, x * 0.62, -0.62, -0.26));
  const tp = mesh(new THREE.PlaneGeometry(0.52, 0.115), P.plate, 0, -0.82, -0.282);
  tp.rotation.y = Math.PI;
  tailgate.add(tp);
  g.add(tailgate);
  // Coffre de toit (s'ouvre sur le côté gauche) : le matériel du voyage.
  const roofBox = new THREE.Group();
  roofBox.position.set(0, 1.56, -0.9);
  // Un bac creux (fond et bords) : quand le couvercle est ouvert, on voit le matériel rangé dedans.
  roofBox.add(mesh(rbox(0.86, 0.05, 1.7, 0.02), P.black, 0, 0.025, 0, true));
  for (const x of [-1, 1]) roofBox.add(mesh(rbox(0.04, 0.2, 1.66, 0.015), P.black, x * 0.41, 0.1, 0, true));
  for (const z of [-1, 1]) roofBox.add(mesh(rbox(0.82, 0.2, 0.04, 0.015), P.black, 0, 0.1, z * 0.83, true));
  roofBox.add(mesh(box(0.78, 0.01, 1.58), P.carpet, 0, 0.052, 0));
  const lid = pivot(-0.43, 0.2, 0);
  lid.add(mesh(rbox(0.88, 0.14, 1.72, 0.09), P.black, 0.44, 0.04, 0, true));
  lid.add(mesh(box(0.5, 0.01, 1.2), P.plastic, 0.44, 0.115, 0));
  roofBox.add(lid);
  g.add(roofBox);
  // Intérieur.
  const inside = cabin(P, {
    W, driverX: 0.42, floorY: 0.42, floorZ: -0.3, floorLen: 3.4, dashZ: 0.82, dashY: 0.98, seatY: 0.56, seatZ: -0.15,
    rear: -1.05, roofY: 1.43, roofFrontZ: 0.25,
  });
  g.add(inside.group);
  g.add(mesh(box(W - 0.24, 0.04, 0.95), P.carpet, 0, 0.62, -1.62)); // plancher du coffre
  mergeStatic(g);
  // Caisses : deux dans le coffre, deux sur la banquette (attachées par la ceinture), puis empilées.
  const crateSlots = [
    new V3(-0.4, 0.64, -1.62), new V3(0.4, 0.64, -1.62),
    new V3(-0.42, 0.7, -1.02), new V3(0.42, 0.7, -1.02),
  ];
  return {
    group: g, P, length: L, width: W, tailgate, roofLid: lid, crateSlots, door: null,
    eye: new V3(0.42, 1.17, -0.22), screen: inside.screen, mirror: inside.mirror, steering: inside.steering,
    // (voir le 4x4) : la voiture est plus petite, le rétroviseur plus près : on regarde un peu plus vers le milieu.
    eyePortrait: new V3(0.28, 1.25, -0.5), yawPortrait: -0.18,
    cargo: { roof: new V3(0, 1.76, -0.9) },
    views: {
      tack: { pos: new V3(1.9, 3.5, -0.9), look: new V3(-0.1, 1.45, -0.9) },
      boot: { pos: new V3(0, 1.75, -4.4), look: new V3(0, 0.8, -1.5) },
    },
  };
}

// ---------------------------------------------------------------- caisse de transport

/** Caisse de transport en plastique, porte grillagée à l'avant (+z), à la taille de l'animal. */
export function crate(size = 0.6, color = 0x3f8fd0) {
  const g = new THREE.Group();
  const w = size * 0.72;
  const h = size * 0.68;
  const d = size;
  const plastic = std(color, 0.45, 0.05);
  const base = std(0xd8d2c4, 0.6);
  const grid = std(0xd8dbe0, 0.3, 0.8);
  // Coque : un tube aux coins arrondis (ouvert devant), le fond est fermé.
  const outer = new THREE.Shape();
  const r = Math.min(w, h) * 0.18;
  outer.moveTo(-w / 2 + r, 0);
  outer.lineTo(w / 2 - r, 0);
  outer.quadraticCurveTo(w / 2, 0, w / 2, r);
  outer.lineTo(w / 2, h - r);
  outer.quadraticCurveTo(w / 2, h, w / 2 - r, h);
  outer.lineTo(-w / 2 + r, h);
  outer.quadraticCurveTo(-w / 2, h, -w / 2, h - r);
  outer.lineTo(-w / 2, r);
  outer.quadraticCurveTo(-w / 2, 0, -w / 2 + r, 0);
  const t = 0.02;
  const hole = new THREE.Path();
  const ri = r * 0.7;
  hole.moveTo(-w / 2 + t + ri, t);
  hole.lineTo(w / 2 - t - ri, t);
  hole.quadraticCurveTo(w / 2 - t, t, w / 2 - t, t + ri);
  hole.lineTo(w / 2 - t, h - t - ri);
  hole.quadraticCurveTo(w / 2 - t, h - t, w / 2 - t - ri, h - t);
  hole.lineTo(-w / 2 + t + ri, h - t);
  hole.quadraticCurveTo(-w / 2 + t, h - t, -w / 2 + t, h - t - ri);
  hole.lineTo(-w / 2 + t, t + ri);
  hole.quadraticCurveTo(-w / 2 + t, t, -w / 2 + t + ri, t);
  outer.holes.push(hole);
  const shell = new THREE.ExtrudeGeometry(outer, { depth: d, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 1, curveSegments: 5 });
  shell.translate(0, 0, -d / 2);
  g.add(mesh(shell, plastic, 0, 0, 0, true));
  g.add(mesh(box(w - 0.03, 0.02, d - 0.04), base, 0, 0.03, 0));
  g.add(mesh(box(w - 0.02, h - 0.02, 0.02), plastic, 0, h / 2, -d / 2 + 0.01));
  // Jonction des deux moitiés, fentes d'aération, poignée.
  g.add(mesh(box(w + 0.02, 0.025, d + 0.01), base, 0, h * 0.45, 0));
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) g.add(mesh(box(0.01, h * 0.08, d * 0.12), std(0x1d2a33, 0.6), s * (w / 2 + 0.005), h * 0.68, -d * 0.3 + i * d * 0.2));
  g.add(mesh(rbox(w * 0.45, 0.035, 0.06, 0.015), std(0x2a2a2a, 0.6), 0, h + 0.05, 0));
  for (const s of [-1, 1]) g.add(mesh(box(0.02, 0.05, 0.02), std(0x2a2a2a, 0.6), s * w * 0.2, h + 0.025, 0));
  // Porte grillagée (charnière à gauche), qu'on peut ouvrir.
  const door = pivot(w / 2 - 0.02, 0, d / 2);
  for (let i = 0; i <= 6; i++) door.add(mesh(box(0.008, h - 0.06, 0.008), grid, -((i * (w - 0.04)) / 6), h / 2, 0));
  for (let i = 0; i <= 3; i++) door.add(mesh(box(w - 0.04, 0.008, 0.008), grid, -(w - 0.04) / 2, 0.03 + (i * (h - 0.06)) / 3, 0));
  g.add(door);
  mergeStatic(g);
  return { group: g, size: { w, h, d }, door };
}

// ---------------------------------------------------------------- coffre de sellerie et objets

/** Coffre de sellerie (malle en bois cerclée de métal) : le couvercle s'ouvre vers l'arrière. */
export function trunk(P = palette(0x8a5a32, 0x2f6b4f)) {
  const g = new THREE.Group();
  const w = 0.72;
  const h = 0.38;
  const d = 0.42;
  g.add(mesh(rbox(w, h, d, 0.025), P.wood, 0, h / 2, 0, true));
  g.add(mesh(box(w - 0.06, 0.02, d - 0.06), P.carpet, 0, h - 0.015, 0));
  for (const x of [-1, 1]) {
    g.add(mesh(box(0.03, h + 0.01, d + 0.01), P.alu, x * (w / 2 - 0.05), h / 2, 0));
    g.add(mesh(rbox(0.04, 0.03, 0.14, 0.01), P.black, x * (w / 2 + 0.015), h * 0.7, 0));
  }
  const lid = pivot(0, h, -d / 2);
  lid.add(mesh(rbox(w + 0.01, 0.07, d + 0.01, 0.025), P.wood, 0, 0.035, d / 2, true));
  for (const x of [-1, 1]) lid.add(mesh(box(0.03, 0.075, d + 0.02), P.alu, x * (w / 2 - 0.05), 0.035, d / 2));
  lid.add(mesh(rbox(0.07, 0.06, 0.02, 0.01), P.alu, 0, -0.01, d + 0.005));
  g.add(lid);
  // Cases à l'intérieur (3 × 2), à plat au fond du coffre.
  const cells = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) cells.push(new V3(-w / 2 + 0.13 + c * 0.23, h - 0.005, -d / 2 + 0.11 + r * 0.2));
  mergeStatic(g);
  return { group: g, lid, cells, size: { w, h, d } };
}

/**
 * Objets du coffre, à la bonne taille (selle, filet, foin, bidon, gamelles, trousse…), ou une étiquette
 * avec l'emoji de l'objet. o : { color, emoji }.
 */
export function cargoMesh(id, P, { color = 0x23395d, emoji = '📦' } = {}) {
  const g = new THREE.Group();
  switch (id) {
    case 'saddle': {
      const seat = mesh(new THREE.SphereGeometry(0.22, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), P.leather);
      seat.scale.set(0.9, 0.42, 1.2);
      g.add(seat);
      g.add(mesh(rbox(0.46, 0.04, 0.5, 0.02), P.leatherDark, 0, 0.0, 0));
      g.add(mesh(rbox(0.3, 0.07, 0.06, 0.02), P.leather, 0, 0.08, -0.22));
      g.add(mesh(rbox(0.22, 0.05, 0.05, 0.02), P.leather, 0, 0.07, 0.24));
      for (const x of [-1, 1]) {
        g.add(mesh(box(0.02, 0.28, 0.03), P.leatherDark, x * 0.22, -0.14, 0.02));
        g.add(mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 12), P.chrome, x * 0.22, -0.3, 0.02));
      }
      break;
    }
    case 'bridle':
    case 'halter': {
      const mat = id === 'halter' ? std(color, 0.6) : P.leatherDark;
      const a = mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 16), mat, 0, -0.1, 0);
      a.scale.set(0.8, 1.5, 1);
      g.add(a);
      g.add(mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14), mat, 0, -0.24, 0.02));
      if (id === 'bridle') g.add(mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 12), P.chrome, 0, -0.3, 0.03));
      break;
    }
    case 'blanket':
    case 'dogCoat': {
      g.add(mesh(rbox(id === 'blanket' ? 0.5 : 0.3, 0.1, 0.34, 0.04), std(color, 0.85), 0, 0.05, 0, true));
      g.add(mesh(box(id === 'blanket' ? 0.5 : 0.3, 0.012, 0.04), std(0xe8e2d4, 0.8), 0, 0.1, 0.12));
      break;
    }
    case 'hay': {
      g.add(mesh(rbox(0.48, 0.3, 0.34, 0.03), P.hay, 0, 0.15, 0, true));
      for (const x of [-0.12, 0.12]) g.add(mesh(box(0.012, 0.31, 0.35), std(0xc0392b, 0.6), x, 0.15, 0));
      break;
    }
    case 'water': {
      const can = mesh(rbox(0.22, 0.32, 0.14, 0.03), std(0x2f78c4, 0.5), 0, 0.16, 0, true);
      g.add(can);
      g.add(mesh(box(0.1, 0.03, 0.03), std(0x2f78c4, 0.5), 0.02, 0.34, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 10), std(0xf0f0f0, 0.5), -0.07, 0.34, 0));
      const bucket = mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.22, 16, 1, true), std(0x2f8a5f, 0.6), 0.22, 0.11, 0.06);
      bucket.material.side = THREE.DoubleSide;
      g.add(bucket);
      break;
    }
    case 'bowls': {
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.05, 16), P.chrome, 0, 0.025 + i * 0.035, 0));
      g.add(mesh(rbox(0.16, 0.22, 0.08, 0.02), std(0xe0a03a, 0.6), 0.2, 0.11, 0)); // sac de croquettes
      break;
    }
    case 'firstAid': {
      const kit = mesh(rbox(0.28, 0.16, 0.18, 0.02), std(0xf4f4f0, 0.5, 0, { map: firstAidTexture() }), 0, 0.08, 0, true);
      g.add(kit);
      g.add(mesh(box(0.1, 0.025, 0.03), std(0xd42b2b, 0.5), 0, 0.17, 0));
      break;
    }
    default: {
      // Une étiquette avec l'emoji de l'objet, posée à plat (brosse, shampoing, licol de chien…).
      g.add(mesh(rbox(0.17, 0.035, 0.15, 0.012), std(0xf3efe6, 0.7), 0, 0.018, 0));
      const tile = mesh(new THREE.PlaneGeometry(0.13, 0.13).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: emojiTexture(emoji), transparent: true }), 0, 0.037, 0);
      g.add(tile);
      g.userData.tile = tile;
    }
  }
  return g;
}

/** Libère la mémoire d'un véhicule (les textures dessinées sont partagées et gardées). */
export function disposeVehicle(object) {
  const done = new Set();
  object.traverse((o) => {
    if (!o.isMesh) return;
    if (!done.has(o.geometry)) {
      o.geometry.dispose();
      done.add(o.geometry);
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (done.has(m) || m.userData?.shared) continue;
      // Les étiquettes emoji : la texture vient du cache commun, on ne libère que le matériau.
      m.dispose();
      done.add(m);
    }
  });
}
