// Mèches du poil long et de la laine longue des ruminants réalistes (laine de l'islandais, sheepReal.js ; poil long de
// la poitevine et du col noir, goatReal.js) : des cartes effilées et ondulées, liées au squelette comme le sommet qui
// les porte.
//
// Chaque mèche est une bande de trois segments qui part de la peau (le haut rentré dans le corps : pas de bord visible),
// s'écarte un peu du corps puis pend, et s'effile jusqu'à une pointe ; sa toile (des brins de longueurs inégales, alpha
// découpé) en fait une frange, jamais un rectangle. Les mèches sont semées sur la peau à espacement régulier (elles se
// chevauchent : pas de trou), sur les flancs, le dos, la croupe et les cuisses — jamais en rang sous le ventre.
// Couchée, la mèche se replie vers sa racine (hState.y) ; tondue, elle rentre dans le corps (hState.x : longueur).
// Rien ici ne dépend de la race : les modules des espèces choisissent les sommets, les longueurs et les couleurs.

import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Hasard fixe d'un entier (même mèche à chaque construction). */
export const lockHash = (i) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

let lockTex = null;
/**
 * Toile d'une mèche (grise : elle ne donne que le grain et la découpe) : des brins effilés de longueurs inégales, serrés
 * en haut, qui s'écartent et finissent en pointes à des hauteurs différentes ; bords latéraux en brins isolés.
 */
export function lockTexture() {
  if (lockTex) return lockTex;
  const W = 64;
  const H = 256;
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (c) {
    c.width = W;
    c.height = H;
  }
  const ctx = c?.getContext?.('2d');
  let s = 11;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  if (ctx?.beginPath) {
    ctx.clearRect(0, 0, W, H);
    // (brins : partent du haut, plus serrés au milieu de la carte ; longueur 55 à 100 % ; ondulés)
    for (let k = 0; k < 150; k++) {
      const u = rnd();
      const x0 = W * (0.5 + (u - 0.5) * (0.55 + 0.45 * rnd()));
      const len = H * (0.6 + 0.4 * rnd()) * (1 - 0.3 * Math.abs(u - 0.5) * 2);
      const w = 2.4 + rnd() * 3.2;
      const sway = (rnd() - 0.5) * 9;
      const shade = Math.round(120 + rnd() * 135);
      ctx.beginPath();
      ctx.moveTo(x0 - w, 0);
      ctx.bezierCurveTo(x0 - w + sway, len * 0.35, x0 - sway * 0.6, len * 0.7, x0 + sway * 0.4, len);
      ctx.bezierCurveTo(x0 + w - sway * 0.6, len * 0.7, x0 + w + sway, len * 0.35, x0 + w, 0);
      ctx.closePath();
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fill();
    }
  }
  lockTex = c ? new THREE.CanvasTexture(c) : new THREE.Texture();
  lockTex.userData.shared = true;
  lockTex.colorSpace = THREE.SRGBColorSpace;
  lockTex.anisotropy = 4;
  return lockTex;
}

/**
 * Sème des mèches sur des sommets candidats : un candidat sur le disque de rayon spacing autour d'un autre est écarté
 * (ordre fixe tiré de lockHash), au plus max mèches. cand : [{ i, ... }] ; pos : positions (Float32Array).
 */
export function spreadLocks(cand, pos, spacing, max = 400) {
  const cell = spacing;
  const grid = new Map();
  const order = cand.map((c, j) => [lockHash(c.i * 3 + 1), j]).sort((a, b) => a[0] - b[0]);
  const out = [];
  const s2 = spacing * spacing;
  for (const [, j] of order) {
    if (out.length >= max) break;
    const c = cand[j];
    const x = pos[c.i * 3];
    const y = pos[c.i * 3 + 1];
    const z = pos[c.i * 3 + 2];
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    const gz = Math.floor(z / cell);
    let near = false;
    for (let a = -1; a <= 1 && !near; a++) for (let b = -1; b <= 1 && !near; b++) for (let d = -1; d <= 1 && !near; d++) {
      for (const q of grid.get(`${gx + a}|${gy + b}|${gz + d}`) ?? []) {
        const dx = pos[q * 3] - x;
        const dy = pos[q * 3 + 1] - y;
        const dz = pos[q * 3 + 2] - z;
        if (dx * dx + dy * dy + dz * dz < s2) {
          near = true;
          break;
        }
      }
    }
    if (near) continue;
    const k = `${gx}|${gy}|${gz}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(c.i);
    out.push(c);
  }
  return out;
}

const SEGS = 3;

/**
 * Géométrie des mèches (partagée) : picks [{ i (sommet porteur), len (m), w (largeur à la racine, m), back (penche vers
 * l'arrière, 0 à 1), side (zone de la robe : 0 ou 1) }] ; pos, nrm, si, sw : sommets du gabarit (repère de l'animal).
 * Attributs : hairTop (racine), hairN (normale de la peau à la racine), hairSide, uv (u en travers, v : 0 racine → 1
 * pointe), skinIndex, skinWeight. inset : la racine rentre dans le corps de tant (m).
 */
export function lockCards(picks, { pos, nrm, si, sw }, inset = 0.012) {
  const nq = picks.length;
  const nv = nq * (SEGS + 1) * 2;
  const position = new Float32Array(nv * 3);
  const top = new Float32Array(nv * 3);
  const hn = new Float32Array(nv * 3);
  const normal = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const side = new Float32Array(nv);
  const sIdx = new Uint16Array(nv * 4);
  const sWgt = new Float32Array(nv * 4);
  const index = new Uint32Array(nq * SEGS * 6);
  const N = V();
  const Nh = V();
  const T = V();
  const P = V();
  const D = V();
  const D0 = V();
  const D1 = V();
  const W = V();
  const down = V(0, -1, 0);
  let vi = 0;
  let ii = 0;
  for (let q = 0; q < nq; q++) {
    const { i, len, w, back = 0, side: sd = 0 } = picks[q];
    const h1 = lockHash(i);
    const h2 = lockHash(i + 17);
    N.fromArray(nrm, i * 3).normalize();
    // (sur le dos, la mèche tombe sur le côté : direction horizontale de la normale)
    Nh.set(N.x, 0, N.z);
    if (Nh.lengthSq() < 1e-4) Nh.set(Math.sign(pos[i * 3]) || 1, 0, 0);
    Nh.normalize();
    T.fromArray(pos, i * 3).addScaledVector(N, -inset);
    // (départ : s'écarte du corps ; arrivée : pend, un peu vers l'arrière pour la culotte)
    D0.copy(N).multiplyScalar(0.85).addScaledVector(Nh, 0.35).addScaledVector(down, 0.4).normalize();
    D1.copy(down).addScaledVector(Nh, 0.18).add(V(0, 0, -back * 0.45)).normalize();
    W.crossVectors(D0, N);
    if (W.lengthSq() < 1e-4) W.crossVectors(down, N);
    W.normalize();
    const phase = h1 * 6.28;
    const wave = 0.18 * len * (0.6 + 0.8 * h2);
    P.copy(T);
    const base = vi;
    for (let r = 0; r <= SEGS; r++) {
      const t = r / SEGS;
      if (r > 0) {
        D.copy(D0).lerp(D1, Math.min(1, t * 1.25)).normalize();
        P.addScaledVector(D, len / SEGS);
      }
      // (ondulée sur le côté, effilée vers la pointe)
      const off = Math.sin(t * Math.PI * 1.4 + phase) * wave * t;
      // (racine étroite — elle sort du corps sans bord droit —, la plus large au tiers, puis effilée jusqu'à la pointe)
      const half = 0.5 * w * (0.4 + 0.6 * Math.min(1, t / 0.3)) * (1 - 0.85 * t ** 1.3);
      for (const u of [-1, 1]) {
        const x = P.x + W.x * (u * half + off);
        const y = P.y + W.y * (u * half + off);
        const z = P.z + W.z * (u * half + off);
        position.set([x, y, z], vi * 3);
        top.set([T.x, T.y, T.z], vi * 3);
        hn.set([N.x, N.y, N.z], vi * 3);
        // (éclairée comme la peau qui la porte, un peu tournée vers le bas à la pointe)
        normal.set([N.x, N.y - 0.25 * t, N.z], vi * 3);
        uv.set([u < 0 ? 0 : 1, t], vi * 2);
        side[vi] = sd;
        for (let m = 0; m < 4; m++) {
          sIdx[vi * 4 + m] = si[i * 4 + m];
          sWgt[vi * 4 + m] = sw[i * 4 + m];
        }
        vi++;
      }
    }
    for (let r = 0; r < SEGS; r++) {
      const a = base + r * 2;
      index.set([a, a + 1, a + 3, a, a + 3, a + 2], ii);
      ii += 6;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('hairTop', new THREE.BufferAttribute(top, 3));
  geo.setAttribute('hairN', new THREE.BufferAttribute(hn, 3));
  geo.setAttribute('hairSide', new THREE.BufferAttribute(side, 1));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(sIdx, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sWgt, 4));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.userData.shared = true;
  geo.userData.cards = nq;
  return geo;
}

/** Uniformes des mèches d'un animal : x longueur (0 rentrées, 1 pleines), y couché (0 à 1), z décalage le long de la normale (m). */
export const makeLockUniforms = () => ({ hState: { value: new THREE.Vector4(1, 0, 0, 0) } });

/**
 * Matière des mèches : couleur des deux zones de la robe (hairSide : 0 → colA, 1 → colB), grain des brins, racine un
 * peu plus sombre, découpe des brins (alphaTest) ; reflets doux (roughness 0,75 : la laine longue brille un peu).
 */
export function lockMaterial(lu, colA, colB, name = 'ruminant_locks') {
  const hu = { hA: { value: new THREE.Color(colA) }, hB: { value: new THREE.Color(colB) } };
  const mat = new THREE.MeshStandardMaterial({ map: lockTexture(), alphaTest: 0.32, side: THREE.DoubleSide, roughness: 0.75, metalness: 0, name });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, lu, hu);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 hairTop;\nattribute vec3 hairN;\nattribute float hairSide;\nuniform vec4 hState;\nvarying float vHSide;\nvarying float vHT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vHSide = hairSide;
vHT = uv.y;
{
  // (longueur du moment, repliée vers la racine quand l'animal est couché ; racine poussée avec la toison)
  float k = hState.x * (1.0 - 0.72 * hState.y);
  transformed = hairTop + hairN * hState.z + (transformed - hairTop) * k;
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 hA;\nuniform vec3 hB;\nvarying float vHSide;\nvarying float vHT;')
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  float g = diffuseColor.r;
  vec3 hc = mix(hA, hB, vHSide);
  // (grain des brins moins marqué sur le poil clair : les mèches blanches ne grisent pas)
  float lc = dot(hc, vec3(0.2126, 0.7152, 0.0722));
  diffuseColor.rgb = hc * mix(0.6 + 0.45 * g, 0.86 + 0.2 * g, smoothstep(0.3, 0.75, lc)) * (0.82 + 0.18 * smoothstep(0.0, 0.35, vHT));
}`);
  };
  mat.customProgramCacheKey = () => `${name}-v3`;
  mat.userData.hairUniforms = hu;
  return mat;
}
