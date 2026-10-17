// Visage des personnages : yeux (globe qui regarde, paupière qui cligne, cils), sourcils, bouche
// souriante et joues roses. Tout est posé SUR la surface de la tête (champ de distance de
// avatarHead.js) : chaque trait suit la peau point par point, au lieu d'être placé à une
// profondeur fixe (l'ancienne bouche, un petit tore à z = 0,118, était enfouie plus d'un
// centimètre sous la peau et ne se voyait pas ; les joues roses non plus).
// Style : doux et lisible de loin (aperçu de l'éditeur, joueur vu de dessus en jeu), pas réaliste.
// Repère : celui de la tête (avant +Z, haut +Y), avant son échelle.

import * as THREE from 'three';
import { rayHit, sdfNormal } from './sdf.js';
import { headSdf } from './avatarHead.js';
import { eyeTexture } from '../textures.js';
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

/** Petit morceau de peau (cx, cy, rayons rx, ry) épousant la tête, juste au-dessus : pour les joues. */
function patchGeo(cx, cy, rx, ry, seg = 8) {
  const pos = [];
  const uv = [];
  const p = new THREE.Vector3();
  for (let j = 0; j <= seg; j++) {
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const v = j / seg;
      skinPoint(cx + (u * 2 - 1) * rx, cy + (v * 2 - 1) * ry, p);
      const n = sdfNormal(headSdf, p, 0.002);
      p.addScaledVector(n, 0.0012);
      pos.push(p.x, p.y, p.z);
      uv.push(u, v);
    }
  }
  const idx = [];
  for (let j = 0; j < seg; j++) {
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
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTexture(look.eyes ?? 0x4a6b8a, 'human'), roughness: 0.08, clearcoat: high ? 1 : 0 });
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
        const x = s * (0.026 + t * 0.05);
        pts.push([x, 0.111 + 0.0075 * Math.sin(Math.PI * (0.15 + t * 0.85)) - 0.004 * t]);
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
  return { eyeBalls, lids };
}
