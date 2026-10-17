// Visage des personnages : yeux (globe qui regarde, paupière qui cligne, cils), sourcils, bouche
// souriante et joues roses. Tout est posé SUR la surface de la tête (champ de distance de
// avatarHead.js) : chaque trait suit la peau point par point, au lieu d'être placé à une
// profondeur fixe (l'ancienne bouche, un petit tore à z = 0,118, était enfouie plus d'un
// centimètre sous la peau et ne se voyait pas ; les joues roses non plus).
// Style : doux de près (aperçu de l'éditeur), pas réaliste.
//
// Lisible à la distance du jeu : la caméra est à quelques mètres ; sur un téléphone, une tête fait
// une vingtaine de pixels de haut. Le pli de la bouche (moins de 4 mm), les lèvres et les sourcils
// tombaient sous le pixel et disparaissaient : les personnages semblaient sans bouche. Les traits
// ont donc des niveaux de détail peints à la main (mipmaps), que la carte graphique choisit
// elle-même, pixel par pixel, selon leur taille à l'écran :
// - bouche et sourcils : un décalque (masque peint sur canevas) posé juste au-dessus de la peau,
//   vide de près (les traits en relief suffisent), puis un trait sombre de plus en plus épais et
//   simple (sourire plus large, en croissant ; sourcils plus marqués) quand le visage rapetisse,
//   jamais plus fin que deux pixels environ (mouthLOD, browLOD) ;
// - yeux : de loin, un grand iris presque noir avec son reflet (humanEyeTexture) au lieu d'un
//   gris-bleu délavé.
// Aucun calcul par image : le même modèle sert à l'éditeur, au jeu et à la vendeuse de la sellerie.
// Repère : celui de la tête (avant +Z, haut +Y), avant son échelle.

import * as THREE from 'three';
import { rayHit, sdfNormal } from './sdf.js';
import { headSdf } from './avatarHead.js';
import { humanEyeTexture } from '../textures.js';
import { LID_OPEN } from './avatarRig.js';

const mat = (color, roughness = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

/** Réglages du visage (repère de la tête). */
export const FACE = {
  eyeR: 0.0192, // rayon du globe de l'œil
  eyeSink: 0.0098, // centre du globe sous la peau (plus petit : l'œil sort davantage)
  mouthY: -0.026, // milieu de la bouche (sous le bout du nez)
  mouthW: 0.0255, // demi-largeur de la bouche
  smile: 0.0085, // les coins remontent d'autant
};

const cache = new Map();
function shared(key, make) {
  if (!cache.has(key)) {
    const g = make();
    g.userData.shared = true;
    cache.set(key, g);
  }
  return cache.get(key);
}

/** Point de la peau devant (x, y) : recherche de la surface de la tête le long de z. */
export function skinPoint(x, y, out = new THREE.Vector3()) {
  let a = -0.02;
  let b = 0.25;
  for (let i = 0; i < 32; i++) {
    const m = (a + b) / 2;
    if (headSdf(x, y, m) < 0) a = m;
    else b = m;
  }
  return out.set(x, y, (a + b) / 2);
}

/**
 * Trait posé sur la peau (sourcil, lèvre, pli de la bouche) : une suite de points (x, y) du visage
 * projetés sur la tête, avec une section en ellipse (demi-largeur w le long de la peau, hauteur h
 * au-dessus) qui s'effile aux deux bouts. Le centre de la section est un peu enfoncé (sink) : les
 * bords sortent de la peau en douceur, sans liseré ni scintillement.
 * w(t), h(t) : t de 0 à 1 le long du trait.
 */
function strokeGeo(pts, w, h, { sink = 0.0009, radial = 10 } = {}) {
  const n = pts.length;
  const C = pts.map(([x, y]) => skinPoint(x, y));
  const N = C.map((p) => sdfNormal(headSdf, p, 0.002));
  const pos = [];
  const T = new THREE.Vector3();
  const B = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    T.subVectors(C[Math.min(n - 1, i + 1)], C[Math.max(0, i - 1)]);
    T.addScaledVector(N[i], -T.dot(N[i])).normalize();
    B.crossVectors(N[i], T).normalize();
    const wi = w(t);
    const hi = h(t) + sink;
    c.copy(C[i]).addScaledVector(N[i], -sink);
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      pos.push(
        c.x + B.x * Math.cos(a) * wi + N[i].x * Math.sin(a) * hi,
        c.y + B.y * Math.cos(a) * wi + N[i].y * Math.sin(a) * hi,
        c.z + B.z * Math.cos(a) * wi + N[i].z * Math.sin(a) * hi,
      );
    }
  }
  // Bouts fermés : un sommet au centre de chaque extrémité.
  const s0 = pos.length / 3;
  pos.push(...C[0].clone().addScaledVector(N[0], -sink * 0.5).toArray());
  pos.push(...C[n - 1].clone().addScaledVector(N[n - 1], -sink * 0.5).toArray());
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k;
      const b = i * radial + ((k + 1) % radial);
      const c2 = a + radial;
      const d = b + radial;
      idx.push(a, b, d, a, d, c2);
    }
  }
  for (let k = 0; k < radial; k++) {
    idx.push(s0, (k + 1) % radial, k);
    const e = (n - 1) * radial;
    idx.push(s0 + 1, e + k, e + ((k + 1) % radial));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Profil d'un trait effilé : min aux bouts, 1 au milieu (pow règle la rondeur). */
const taper = (t, pow = 0.5, min = 0.15) => min + (1 - min) * Math.sin(Math.PI * t) ** pow;

/** Ligne du sourire : hauteur du pli de la bouche en x (les coins remontent). */
const smileY = (x) => {
  const u = x / FACE.mouthW;
  return FACE.mouthY + FACE.smile * u * u;
};

/**
 * Hauteur du sourcil (t de 0, côté nez, à 1, côté tempe) : un arc doux, un peu haut sur le front.
 * Les bouts intérieurs ne descendent pas vers le nez (ça faisait des sourcils froncés).
 */
const browY = (t) => 0.111 + 0.0075 * Math.sin(Math.PI * (0.15 + t * 0.85)) - 0.004 * t;

/** Points (x, y) le long de la bouche, du coin droit au coin gauche, décalés de dy (fois l'effilement). */
function mouthPoints(ext = 1, dy = 0, n = 21) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = (t * 2 - 1) * FACE.mouthW * ext;
    pts.push([x, smileY(x) + dy * Math.sin(Math.PI * t) ** 0.6]);
  }
  return pts;
}

/** Tache douce (joues roses) : dégradé radial partagé, utilisé comme masque d'opacité. */
let _soft = null;
function softSpot() {
  if (_soft) return _soft;
  const s = 64;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d');
  // Masque d'opacité : c'est le vert qui compte (gris sur fond noir, pas de transparence du canevas).
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, s, s);
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.35, '#c8c8c8');
  g.addColorStop(0.7, '#3c3c3c');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  _soft = new THREE.CanvasTexture(c);
  _soft.userData.shared = true;
  return _soft;
}

/**
 * Petit morceau de peau (cx, cy, rayons rx, ry) épousant la tête, à lift au-dessus : pour les joues
 * et les décalques du visage. u suit x, v suit y (v = 1 en haut).
 */
function patchGeo(cx, cy, rx, ry, seg = 8, { segY = seg, lift = 0.0012 } = {}) {
  const pos = [];
  const uv = [];
  const p = new THREE.Vector3();
  for (let j = 0; j <= segY; j++) {
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const v = j / segY;
      skinPoint(cx + (u * 2 - 1) * rx, cy + (v * 2 - 1) * ry, p);
      const n = sdfNormal(headSdf, p, 0.002);
      p.addScaledVector(n, lift);
      pos.push(p.x, p.y, p.z);
      uv.push(u, v);
    }
  }
  const idx = [];
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      idx.push(a, a + 1, a + seg + 2, a, a + seg + 2, a + seg + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ------------------------------------------------------------------ décalques à niveaux de détail

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Taille d'un texel (m, repère de la tête) où le décalque commence à se voir, et où il est entier.
 * Plus fin que MASK_FROM (visage vu de près), les traits en relief se voient très bien seuls.
 */
const MASK_FROM = 0.0018;
const MASK_FULL = 0.004;

/**
 * Régions du visage couvertes par les décalques (centre, demi-largeur, demi-hauteur), taille de la
 * texture (texels carrés), hauteur au-dessus de la peau (au-dessus des lèvres et des sourcils en relief).
 */
export const MOUTH_ZONE = { cx: 0, cy: -0.024, rx: 0.05, ry: 0.025, w: 128, h: 64, lift: 0.0036 };
export const BROW_ZONE = { cx: 0, cy: 0.113, rx: 0.088, ry: 0.022, w: 256, h: 64, lift: 0.003 };

/** Pièce de peau qui porte un décalque (zone Z), à Z.lift au-dessus de la peau. */
export const decalGeo = (Z, seg, segY) => patchGeo(Z.cx, Z.cy, Z.rx, Z.ry, seg, { segY, lift: Z.lift });

/** Opacité d'un niveau de décalque dont les texels font texel (m) : 0 de près, 1 de loin. */
export const maskOpacity = (texel) => smooth(MASK_FROM, MASK_FULL, texel);

/**
 * Bouche de loin, pour un niveau de texels de texel (m) : épaisseur au milieu T (au moins 2,5
 * texels, donc 2 pixels environ à l'écran, jamais moins que le pli en relief), demi-largeur W et
 * remontée des coins smile, qui grandissent quand le visage rapetisse (sourire plus franc).
 */
export function mouthLOD(texel) {
  const far = smooth(MASK_FULL, 0.007, texel);
  return {
    T: Math.min(0.02, Math.max(0.0045, 2.5 * texel)),
    W: lerp(FACE.mouthW * 1.06, 0.038, far),
    smile: lerp(FACE.smile, 0.0125, far),
  };
}

/** Sourcils de loin : épaisseur T (au moins 1,8 texel) et petit rehaussement lift (air gai). */
export function browLOD(texel) {
  const far = smooth(MASK_FULL, 0.009, texel);
  return { T: Math.min(0.013, Math.max(0.0075, 1.8 * texel)), lift: 0.002 * far };
}

const masks = new Map();

/**
 * Masque d'opacité (gris sur noir : c'est le vert qui compte) dont chaque niveau de mipmap est
 * peint exprès pour sa taille. draw(ctx, P, texel) dessine un niveau en blanc : P(x, y) donne le
 * pixel du canevas d'un point du visage, texel la taille d'un texel de ce niveau (m). Un niveau
 * plus fin que MASK_FROM reste vide ; entre MASK_FROM et MASK_FULL, il apparaît en fondu.
 */
function lodMask(key, Z, draw) {
  if (masks.has(key)) return masks.get(key);
  const levels = [];
  for (let w = Z.w, h = Z.h; ; w = Math.max(1, w >> 1), h = Math.max(1, h >> 1)) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const texel = (2 * Z.rx) / w;
    const k = maskOpacity(texel);
    if (k > 0.01) {
      const P = (x, y) => [((x - Z.cx + Z.rx) / (2 * Z.rx)) * w, ((Z.cy + Z.ry - y) / (2 * Z.ry)) * h];
      const g = Math.round(255 * k);
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      draw(ctx, P, texel);
    }
    levels.push(c);
    if (w === 1 && h === 1) break;
  }
  const tex = new THREE.CanvasTexture(levels[0]);
  tex.mipmaps = levels;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.userData.shared = true;
  masks.set(key, tex);
  return tex;
}

/**
 * Trait plein le long d'une courbe du visage : pts = [x, y] (m), demi-épaisseurs au-dessus et
 * au-dessous de la courbe (up(t), down(t), t de 0 à 1), bouts arrondis.
 */
function fillStroke(ctx, P, pts, up, down) {
  const n = pts.length;
  const top = [];
  const bot = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const [x0, y0] = pts[Math.max(0, i - 1)];
    const [x1, y1] = pts[Math.min(n - 1, i + 1)];
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / len; // normale (vers le haut quand le trait va vers +x)
    const ny = (x1 - x0) / len;
    const [x, y] = pts[i];
    top.push(P(x + nx * up(t), y + ny * up(t)));
    bot.push(P(x - nx * down(t), y - ny * down(t)));
  }
  ctx.beginPath();
  ctx.moveTo(...top[0]);
  for (const p of top) ctx.lineTo(...p);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(...bot[i]);
  ctx.closePath();
  ctx.fill();
  // Bouts ronds.
  for (const i of [0, n - 1]) {
    const [ax, ay] = top[i];
    const [bx, by] = bot[i];
    ctx.beginPath();
    ctx.arc((ax + bx) / 2, (ay + by) / 2, Math.hypot(ax - bx, ay - by) / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Bouche vue de loin : un sourire sombre, en croissant (épais au milieu, effilé aux coins), plus
 * large et plus relevé à mesure que le niveau grossit (mouthLOD).
 */
function mouthMask() {
  return lodMask('mouth', MOUTH_ZONE, (ctx, P, texel) => {
    const { T, W, smile } = mouthLOD(texel);
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const u = (i / 24) * 2 - 1;
      pts.push([u * W, FACE.mouthY + smile * u * u]);
    }
    const th = (t) => T * (0.32 + 0.68 * Math.sin(Math.PI * t) ** 0.8);
    // Plus épais sous le pli : un sourire qui s'ouvre un peu (lisible même en deux pixels).
    fillStroke(ctx, P, pts, (t) => 0.32 * th(t), (t) => 0.68 * th(t));
  });
}

/** Sourcils vus de loin : le même arc que ceux en relief, plus épais et un peu plus haut (browLOD). */
function browMask() {
  return lodMask('brows', BROW_ZONE, (ctx, P, texel) => {
    const { T, lift } = browLOD(texel);
    for (const s of [1, -1]) {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push([s * (0.026 + t * 0.05), browY(t) + lift]);
      }
      const th = (t) => T * (0.55 + 0.45 * Math.sin(Math.PI * (0.25 + 0.75 * t))) * (1.1 - 0.3 * t);
      fillStroke(ctx, P, pts, (t) => 0.5 * th(t), (t) => 0.5 * th(t));
    }
  });
}

function add(parent, geo, material, pos, rot, scale) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = false;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/**
 * Pose le visage sur la tête (groupe head, repère de headSdf). look : { skin, hair, eyes? }.
 * Renvoie { eyeBalls, lids } pour l'animation (regard, clignement : avatarRig.js).
 */
export function buildFace(head, look, high) {
  const skinC = new THREE.Color(look.skin);
  // --- Yeux : globe (blanc + iris) qui peut regarder ailleurs, paupière qui cligne avec ses cils.
  // Au repos la paupière est bien relevée (LID_OPEN) : yeux grands ouverts, regard éveillé.
  // (texture à niveaux de détail : de loin, grand iris sombre et net)
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: humanEyeTexture(look.eyes ?? 0x4a6b8a), roughness: 0.08, clearcoat: high ? 1 : 0 });
  const lidMat = mat(look.skin, 0.6);
  const lashMat = mat(0x2a1a14, 0.6);
  const eyeBalls = [];
  const lids = [];
  const R = FACE.eyeR;
  const lidGeo = shared('eyelid', () => new THREE.SphereGeometry(R * 1.07, 16, 7, 0, Math.PI * 2, 0, Math.PI * 0.5));
  const lashGeo = shared('eyelash', () => new THREE.TorusGeometry(R * 1.07, 0.0021, 5, 16, Math.PI));
  for (const s of [1, -1]) {
    const hit = rayHit(headSdf, [s * 0.042, 0.064, 0], [s * 0.15, 0, 1], 0.3);
    const n = sdfNormal(headSdf, hit, 0.003);
    const eye = new THREE.Group();
    eye.position.copy(hit).addScaledVector(n, -FACE.eyeSink);
    eye.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(s * 0.05, 0, 1).normalize());
    head.add(eye);
    const ball = new THREE.Group();
    eye.add(ball);
    add(ball, shared('eyeball', () => new THREE.SphereGeometry(R, 18, 14)), eyeMat);
    // Paupière : demi-sphère un peu plus grande que le globe ; elle pivote vers le bas pour cligner.
    const lid = new THREE.Group();
    lid.rotation.x = LID_OPEN;
    eye.add(lid);
    add(lid, lidGeo, lidMat);
    // Cils : un trait sombre le long du bord de la paupière (ils dessinent le haut de l'œil).
    add(lid, lashGeo, lashMat, null, [Math.PI / 2, 0, 0], [1.01, 1.01, 1]);
    eyeBalls.push(ball);
    lids.push(lid);
  }

  // --- Sourcils : un arc doux, un peu haut sur le front (air gai), plus épais côté nez. Les bouts
  // intérieurs ne descendent pas vers le nez (ça faisait des sourcils froncés).
  const browMat = mat(look.hair, 0.7);
  for (const s of [1, -1]) {
    const geo = shared(`brow${s}`, () => {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push([s * (0.026 + t * 0.05), browY(t)]);
      }
      return strokeGeo(pts, (t) => 0.0046 * taper(t, 0.45, 0.35) * (1.1 - 0.35 * t), (t) => 0.0024 * taper(t, 0.5, 0.3));
    });
    add(head, geo, browMat);
  }

  // --- Bouche : un sourire fermé, lèvres de la couleur de la peau tirée vers le rose, avec le pli
  // sombre entre les deux lèvres (lisible sur toutes les peaux) et des coins qui remontent.
  const lipC = skinC.clone().multiplyScalar(0.92).lerp(new THREE.Color(0xc0605a), 0.42);
  const lips = mat(lipC.getHex(), 0.45);
  const lineC = skinC.clone().multiplyScalar(0.3).lerp(new THREE.Color(0x3a1214), 0.6);
  const line = mat(lineC.getHex(), 0.6);
  // Lèvre du bas, charnue au milieu ; lèvre du haut plus fine.
  add(head, shared('lipLow', () => strokeGeo(mouthPoints(0.88, -0.0045), (t) => 0.0051 * taper(t, 0.7, 0.2), (t) => 0.003 * taper(t, 0.6, 0.2))), lips);
  add(head, shared('lipUp', () => strokeGeo(mouthPoints(0.92, 0.0022), (t) => 0.0028 * taper(t, 0.6, 0.2), (t) => 0.0018 * taper(t, 0.6, 0.2))), lips);
  // Le pli (un peu plus long que les lèvres : petites fossettes aux coins).
  add(head, shared('mouthLine', () => strokeGeo(mouthPoints(1.04, 0), (t) => 0.00165 * taper(t, 0.4, 0.45), (t) => 0.0017 * taper(t, 0.4, 0.4))), line);

  // --- Joues roses : une tache douce posée sur la peau.
  // Un peu plus marquées sur une peau claire (où le rose se voit moins), plus légères sur une peau foncée.
  const blushC = skinC.clone().lerp(new THREE.Color(0xf07a7a), 0.58);
  const lum = 0.2126 * skinC.r + 0.7152 * skinC.g + 0.0722 * skinC.b;
  const blush = mat(blushC.getHex(), 0.7, { alphaMap: softSpot(), transparent: true, opacity: 0.4 + 0.25 * lum, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const s of [1, -1]) {
    const m = add(head, shared(`blush${s}`, () => patchGeo(s * 0.071, 0.01, 0.026, 0.02)), blush);
    m.renderOrder = 1;
  }

  // --- Décalques de loin (voir l'en-tête) : invisibles de près, ils prennent le relais quand la
  // bouche et les sourcils en relief deviennent plus fins qu'un pixel. Posés un peu au-dessus des
  // lèvres et des sourcils en relief, pour les recouvrir quand ils se montrent.
  const decal = (color, alphaMap) => mat(color, 0.6, { alphaMap, transparent: true, depthWrite: false });
  // Bouche : plus sombre que le pli et tirée vers le rouge, pour trancher sur toutes les peaux.
  const mouthFarC = lineC.clone().multiplyScalar(0.55).lerp(new THREE.Color(0x6a1018), 0.25);
  const mouthFar = add(head, shared('mouthFar', () => decalGeo(MOUTH_ZONE, 12, 6)), decal(mouthFarC.getHex(), mouthMask()));
  // Sourcils : la couleur des cheveux, foncée (des sourcils blonds ne se voient pas de loin).
  const hairC = new THREE.Color(look.hair);
  const hairLum = 0.2126 * hairC.r + 0.7152 * hairC.g + 0.0722 * hairC.b;
  const browFarC = hairC.multiplyScalar(lerp(0.85, 0.42, smooth(0.04, 0.4, hairLum)));
  const browFar = add(head, shared('browFar', () => decalGeo(BROW_ZONE, 16, 4)), decal(browFarC.getHex(), browMask()));
  mouthFar.renderOrder = 1;
  browFar.renderOrder = 1;
  return { eyeBalls, lids };
}
