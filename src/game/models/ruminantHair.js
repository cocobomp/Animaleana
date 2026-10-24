// Mèches du poil long et de la laine longue des ruminants réalistes (laine de l'islandais, sheepReal.js ; poil long de
// la poitevine et du col noir, goatReal.js) : des cartes effilées et ondulées, liées au squelette comme le sommet qui
// les porte.
//
// Chaque mèche est une bande de trois segments qui part de la peau (le haut rentré dans le corps : pas de bord visible),
// s'écarte un peu du corps puis pend, et s'effile jusqu'à une pointe ; sa toile (des brins de longueurs inégales, alpha
// découpé) en fait une frange, jamais un rectangle. Les mèches sont semées sur la peau à espacement régulier (elles se
// chevauchent : pas de trou), sur les flancs, le dos, la croupe et les cuisses — jamais en rang sous le ventre.
// Couchée (hState.y), la mèche se rabat sur le corps et ce qui toucherait le sol s'étale dans l'herbe ; tondue, elle
// rentre dans le corps (hState.x : longueur).
// Rien ici ne dépend de la race : les modules des espèces choisissent les sommets, les longueurs et les couleurs.

import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Hasard fixe d'un entier (même mèche à chaque construction). */
export const lockHash = (i) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const lockTexs = {};
/**
 * Toile d'une mèche (grise : elle ne donne que le grain et la découpe) : des brins effilés de longueurs inégales, serrés
 * en haut, qui s'écartent et finissent en pointes à des hauteurs différentes ; bords latéraux en brins isolés.
 * kind 'fine' (poil long de la Highland) : brins plus fins et moins nombreux, des jours entre eux — une mèche de poils,
 * pas une feuille.
 */
export function lockTexture(kind = 'wool') {
  if (lockTexs[kind]) return lockTexs[kind];
  const fine = kind === 'fine';
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
    for (let k = 0; k < (fine ? 90 : 150); k++) {
      const u = rnd();
      const x0 = W * (0.5 + (u - 0.5) * (fine ? 0.8 + 0.2 * rnd() : 0.55 + 0.45 * rnd()));
      const len = H * (fine ? 0.45 + 0.55 * rnd() : 0.6 + 0.4 * rnd()) * (1 - 0.3 * Math.abs(u - 0.5) * 2);
      const w = fine ? 1.1 + rnd() * 1.4 : 2.4 + rnd() * 3.2;
      const sway = (rnd() - 0.5) * (fine ? 14 : 9);
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
  const tex = c ? new THREE.CanvasTexture(c) : new THREE.Texture();
  tex.userData.shared = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  lockTexs[kind] = tex;
  return tex;
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
 * Attributs : hairTop (racine), hairN (normale de la peau à la racine), hairD (déplacement de la racine par la cible
 * de forme du corps, dPos : la toison tondue rentre ; zéro sans dPos), hairSide, uv (u en travers, v : 0 racine → 1
 * pointe), skinIndex, skinWeight. inset : la racine rentre dans le corps de tant (m).
 */
export function lockCards(picks, { pos, nrm, si, sw, dPos = null }, inset = 0.012, { cross = false } = {}) {
  // (cross : chaque mèche a une deuxième carte, tournée d'un quart de tour autour de la mèche — vue de profil, elle
  // garde du volume ; vue de face, la première ne fait plus une feuille plate posée sur le flanc)
  const planes = cross ? 2 : 1;
  const nq = picks.length * planes;
  const nv = nq * (SEGS + 1) * 2;
  const position = new Float32Array(nv * 3);
  const top = new Float32Array(nv * 3);
  const hn = new Float32Array(nv * 3);
  const hd = new Float32Array(nv * 3);
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
    const plane = q % planes;
    const { i, len, w: w0, back = 0, side: sd = 0 } = picks[(q - plane) / planes];
    // (deuxième carte un peu plus étroite et plus courte : elle épaissit la mèche sans la doubler)
    const w = plane ? w0 * 0.8 : w0;
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
    // (sur le dos, elle part sur le côté, à peine vers le haut : sinon, raccourcie (toison qui repousse), elle se
    // dressait en épis sombres au-dessus de la ligne du dos)
    if (D0.y > 0.12) {
      const hl = Math.hypot(D0.x, D0.z);
      if (hl < 1e-4) D0.set(Nh.x, 0.12, Nh.z);
      else D0.set((D0.x / hl) * Math.sqrt(1 - 0.12 * 0.12), 0.12, (D0.z / hl) * Math.sqrt(1 - 0.12 * 0.12));
      D0.normalize();
    }
    D1.copy(down).addScaledVector(Nh, 0.18).add(V(0, 0, -back * 0.45)).normalize();
    W.crossVectors(D0, N);
    if (W.lengthSq() < 1e-4) W.crossVectors(down, N);
    W.normalize();
    if (plane) W.crossVectors(W, D0).normalize();
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
        if (dPos) hd.set([dPos[i * 3], dPos[i * 3 + 1], dPos[i * 3 + 2]], vi * 3);
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
  geo.setAttribute('hairD', new THREE.BufferAttribute(hd, 3));
  geo.setAttribute('hairSide', new THREE.BufferAttribute(side, 1));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(sIdx, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sWgt, 4));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.userData.shared = true;
  geo.userData.cards = nq;
  return geo;
}

/**
 * Uniformes des mèches d'un animal : x longueur (0 rentrées, 1 pleines), y couché (0 à 1), z décalage le long de la
 * normale (m), w poids de la cible de forme du corps (la racine suit hairD : mouton à moitié tondu).
 */
// (hFloor : hauteur du sol sous l'animal, monde — le bout des mèches n'y entre jamais ; très bas tant que l'espèce ne le
// donne pas)
export const makeLockUniforms = () => ({ hState: { value: new THREE.Vector4(1, 0, 0, 0) }, hFloor: { value: -1e4 } });
/** Sol sous l'animal pour ses mèches : la hauteur de l'origine du modèle (ses sabots au sol), + 5 mm. */
export function setLockFloor(lu, md) {
  if (lu?.hFloor) lu.hFloor.value = md.root.matrixWorld.elements[13] + 0.005;
}

/**
 * Matière des mèches : couleur des deux zones de la robe (hairSide : 0 → colA, 1 → colB), grain des brins, racine un
 * peu plus sombre, découpe des brins (alphaTest) ; reflets doux (roughness 0,75 : la laine longue brille un peu).
 */
export function lockMaterial(lu, colA, colB, name = 'ruminant_locks', texKind = 'wool') {
  const hu = { hA: { value: new THREE.Color(colA) }, hB: { value: new THREE.Color(colB) } };
  const mat = new THREE.MeshStandardMaterial({ map: lockTexture(texKind), alphaTest: 0.32, side: THREE.DoubleSide, roughness: 0.75, metalness: 0, name });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, lu, hu);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 hairTop;\nattribute vec3 hairN;\nattribute vec3 hairD;\nattribute float hairSide;\nuniform vec4 hState;\nuniform float hFloor;\nvarying float vHSide;\nvarying float vHT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vHSide = hairSide;
vHT = uv.y;
// (racine poussée avec la toison et rentrée avec la cible de forme du corps : à moitié tondu, les mèches flottaient
// au-dessus du dos ; couchée, repliée aux trois quarts puis rabattue contre la peau : gardée à 88 %, la mèche
// rabattue se lisait en éclats de papier sous le ventre de l'islandais couché)
vec3 hRoot = hairTop + hairD * hState.w + hairN * hState.z;
transformed = hRoot + (transformed - hairTop) * hState.x * (1.0 - 0.72 * hState.y);`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
{
  vec4 hw = modelMatrix * vec4(transformed, 1.0);
#ifdef USE_SKINNING
  if (hState.y > 0.001) {
    // Couché (monde, après le squelette) : la mèche se rabat sur le corps — on lui retire l'essentiel de ce qui
    // l'écarte de la peau, sa longueur gardée —, et ce qui passerait sous le sol s'étale dans l'herbe, vers
    // l'extérieur ; elles pendaient droit sous le ventre, jusque dans le sol.
    vec3 rw = (modelMatrix * (skinMatrix * vec4(hRoot, 1.0))).xyz;
    vec3 nw = normalize(mat3(modelMatrix) * (mat3(skinMatrix) * hairN));
    vec3 L = hw.xyz - rw;
    vec3 Lf = L - nw * dot(L, nw) * 0.7;
    Lf *= length(L) / max(1e-4, length(Lf));
    vec3 p = rw + mix(L, Lf, hState.y);
    float ex = hFloor - p.y;
    if (ex > 0.0) {
      vec3 o = vec3(nw.x, 0.0, nw.z);
      if (dot(o, o) < 0.04) o = vec3(rw.x - modelMatrix[3].x, 0.0, rw.z - modelMatrix[3].z);
      // (vers l'extérieur et un peu vers l'arrière, les trois quarts de ce qui entrerait dans le sol)
      vec3 bk = -normalize(vec3(modelMatrix[2].x, 0.0, modelMatrix[2].z) + vec3(0.0, 0.0, 1e-4));
      o = normalize(normalize(o + vec3(1e-4, 0.0, 0.0)) + bk * 0.35);
      p += vec3(0.0, ex, 0.0) + o * (ex * 0.75 * hState.y);
    }
    transformed += inverse(mat3(modelMatrix)) * (p - hw.xyz);
    hw.xyz = p;
  }
#endif
  // (jamais sous le sol)
  if (hw.y < hFloor) transformed += inverse(mat3(modelMatrix)) * vec3(0.0, hFloor - hw.y, 0.0);
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 hA;\nuniform vec3 hB;\nvarying float vHSide;\nvarying float vHT;')
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  float g = diffuseColor.r;
  vec3 hc = mix(hA, hB, vHSide);
  // (grain des brins moins marqué sur le poil clair : les mèches blanches ne grisent pas)
  float lc = dot(hc, vec3(0.2126, 0.7152, 0.0722));
  // (racine assombrie — l'ombre du poil voisin — à peine sur le poil clair : grise, la racine de chaque mèche blanche se
  // posait sur la pointe de la précédente et dessinait des tuiles)
  float lt = smoothstep(0.3, 0.75, lc);
  diffuseColor.rgb = hc * mix(0.6 + 0.45 * g, 0.86 + 0.2 * g, lt) * (mix(0.82, 0.95, lt) + mix(0.18, 0.05, lt) * smoothstep(0.0, 0.35, vHT));
}`);
  };
  mat.customProgramCacheKey = () => `${name}-v6`;
  mat.userData.hairUniforms = hu;
  return mat;
}
