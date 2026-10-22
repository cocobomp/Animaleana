// Robe des lapins réalistes (rabbitReal.js) : retouche du shader du pelage, comme les chats (catCoat.js) et la page
// « Chats et lapins » (src/compare/petRecolor.js).
//
// Le poil peint du modèle d'origine (lapin gris agouti de Dakota.Hinkle, bélier fauve de FourthGreen) est ramené à un
// gris neutre qui garde son grain (poils, reflets, tiquetage) mais pas ses taches : la luminance de chaque texel est
// rapportée à la moyenne de sa « classe » (poil sombre ou clair), moins sa moyenne locale sur la surface (attribut
// cmpLow, voir petReal.furLow). La robe du jeu est ensuite peinte selon l'endroit du corps (attribut cmpRest : position
// du sommet au repos dans le repère du modèle d'ORIGINE ; cmpPart : oreilles, queue, tête, pattes), collée à la peau.
//
// Robes (src/sim/species.js, SPECIES.rabbit) : unie (noir, blanc, crème), « agouti » quand la seconde couleur est plus
// claire (ventre, dessous de la queue, menton, tour des yeux et intérieur des pattes clairs : gris, fauve, castor,
// lynx, roux), panachée (« patches » : fond blanc, oreilles, tour des yeux, papillon du nez et taches du dos colorés).
// Les lapereaux de parents différents ont des couleurs mélangées : n'importe quelle couleur convient. Poil ras et
// velouté du rex (grain effacé, reflet doux) ; yeux de la race (rubis de l'angora blanc). Le même shader pousse la peau
// le long de la normale (embonpoint, respiration, coupe du salon) et fait frémir le nez (renifler).

import * as THREE from 'three';
import { gfx, keepFrameAlpha } from '../gfx.js';

const MAX_KEEP = 4;

export const RABBIT_PATTERN_ID = { solid: 0, agouti: 1, patches: 2 };

const hexLum = (c) => {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Robe d'un lapin d'après son look (coat, secondary, pattern, eye) et son gabarit (velours du rex, peluche) : couleurs,
 * motif, yeux, truffe. Pure (testée en node).
 */
export function rabbitCoatPlan(look = {}, build = null) {
  const base = look.coat ?? 0x8f8a84;
  const sec = look.secondary ?? base;
  let pattern = look.pattern === 'patches' ? 'patches' : 'solid';
  // (unie aux deux couleurs différentes : lapin agouti, dessous et tour des yeux de la seconde couleur)
  if (pattern === 'solid' && sec !== base) pattern = 'agouti';
  if (pattern === 'patches' && sec === base) pattern = 'solid';
  const lum = hexLum(base);
  const P = {
    pattern, base, sec,
    eye: look.eye ?? 0x2a1a10,
    velvet: build?.velvet ?? 0,
    plush: build?.plush ?? 0,
    dark: lum < 0.06,
    light: lum > 0.75,
    seed: ((look.seed ?? 7) % 997) * 0.731,
  };
  // Truffe : rose pour les robes claires (et l'albinos aux yeux rubis), brun-gris pour les foncées.
  P.nose = lum > 0.55 ? 0xd9a0a0 : lum < 0.08 ? 0x3a302e : 0x8a6a62;
  return P;
}

/** Uniformes de la robe (un jeu par lapin). */
export function makeRabbitCoatUniforms() {
  return {
    cOn: { value: 1 },
    cPat: { value: 0 },
    cBase: { value: new THREE.Color() },
    cSec: { value: new THREE.Color() },
    cNoseC: { value: new THREE.Color() },
    cHair: { value: new THREE.Vector4(0, 0, 0, 0) }, // velours, peluche
    cSeed: { value: 0 },
    cFat: { value: 0 }, // poussée du ventre et des flancs (m)
    cBreath: { value: 0 }, // poussée de la cage thoracique (m)
    cSniff: { value: 0 }, // nez qui frémit (m, vers le haut)
    cWet: { value: 0 },
    // Coupe du salon (m, le long de la normale) : tronc, crinière (cou et tête), pattes, pompon.
    cCut: { value: new THREE.Vector4(0, 0, 0, 0) },
    cEyeC: { value: new THREE.Color() },
  };
}

/** Applique une robe (rabbitCoatPlan) aux uniformes. */
export function setRabbitCoat(u, P) {
  u.cPat.value = RABBIT_PATTERN_ID[P.pattern] ?? 0;
  u.cBase.value.setHex(P.base);
  u.cSec.value.setHex(P.sec);
  u.cNoseC.value.setHex(P.nose);
  u.cHair.value.set(P.velvet, P.plush, 0, 0);
  u.cSeed.value = P.seed;
  u.cEyeC.value.setHex(P.eye);
}

/** Repères du corps au repos (modèle d'origine), communs à tous les lapins d'un modèle. */
export function makeRabbitLandUniforms(L) {
  return {
    cLand: { value: new THREE.Vector4(L.hipZ, L.shZ, L.bellyY, L.topY) },
    cHead: { value: new THREE.Vector4(L.head.x, L.head.y, L.head.z, L.noseZ) },
    cEye: { value: new THREE.Vector4(L.eyeX, L.eyeY, L.eyeZ, L.elbowY) },
    cMisc: { value: new THREE.Vector4(L.midX, L.tailBase.y, L.neckZ, L.tailBase.z) },
    cNose: { value: new THREE.Vector4(L.nose.x, L.nose.y, L.nose.z, Math.max(0.02, L.noseZ - L.head.z)) },
  };
}

const COMMON_V = /* glsl */ `
attribute vec3 cmpRest;
attribute vec4 cmpPart;
attribute float cmpLow;
attribute float cmpFur;
uniform vec4 cLand;
uniform vec4 cEye;
uniform vec4 cHead;
uniform vec4 cNose;
uniform float cFat;
uniform float cBreath;
uniform float cSniff;
uniform vec4 cCut;
varying vec3 vCmpPos;
varying vec4 vCmpPart;
varying float vCmpLow;`;

// Nez qui frémit (avant le squelette : le bout du museau monte et descend avec la tête).
const REST_V = /* glsl */ `
vCmpPos = cmpRest;
vCmpPart = cmpPart;
vCmpLow = cmpLow;
if (cSniff != 0.0) {
  float dn = distance(cmpRest, cNose.xyz) / cNose.w;
  float k = (1.0 - smoothstep(0.08, 0.32, dn)) * cmpPart.z * (1.0 - cmpPart.x);
  transformed.y += cSniff * k;
  transformed.z -= cSniff * 0.4 * k;
}`;

// Poil long contre le sol (après le squelette : repère du lapin, sol à y = 0) : couché sur le sol au lieu d'y entrer —
// ventre de l'angora, barbe et collerette du tête de lion passaient de 15 à 30 mm sous le sol aux allures. La peau du
// pelage remonte au plus de l'épaisseur de son poil (cmpFur, poussée de la race) ; les mèches (cartes), jamais dessous.
const GROUND_V = /* glsl */ `
{
  float under = 0.0015 - transformed.y;
  if (under > 0.0) transformed.y += min(under, max(cmpFur, 0.0) * 1.1);
}`;
const GROUND_CARD_V = /* glsl */ `
transformed.y = max(transformed.y, 0.0015);`;

// Embonpoint (ventre et flancs), respiration (cage thoracique) et coupe du salon, le long de la normale du sommet déformé.
const PUSH_V = /* glsl */ `
{
  float trunkW = (1.0 - cmpPart.w) * (1.0 - cmpPart.y) * (1.0 - cmpPart.z);
  float u = (cmpRest.z - cLand.x) / max(0.05, cLand.y - cLand.x);
  float h = (cmpRest.y - cLand.z) / max(0.02, cLand.w - cLand.z);
  float belly = trunkW * smoothstep(-0.2, 0.2, u) * (1.0 - smoothstep(0.8, 1.1, u)) * (1.0 - smoothstep(0.5, 1.0, h));
  float ribs = trunkW * smoothstep(0.3, 0.6, u) * (1.0 - smoothstep(0.95, 1.2, u)) * (1.0 - smoothstep(0.7, 1.05, h));
  float push = cFat * belly + cBreath * ribs;
  if (cCut != vec4(0.0)) {
    float tr = trunkW * smoothstep(-0.3, 0.0, u) * (1.0 - smoothstep(0.95, 1.2, u));
    float mane = (1.0 - cmpPart.w) * (1.0 - cmpPart.y) * (1.0 - cmpPart.x) * smoothstep(0.8, 1.05, u)
      * (1.0 - smoothstep(0.25, 0.6, distance(cmpRest, cNose.xyz) / cNose.w - 0.6));
    push += cCut.x * tr + cCut.y * mane + cCut.z * cmpPart.w + cCut.w * cmpPart.y;
  }
  // (jamais normalize(0) : une normale nulle donne NaN)
  if (push != 0.0) transformed += objectNormal * (push / max(1e-6, length(objectNormal)));
}`;

const COMMON_F = /* glsl */ `
uniform float cOn;
uniform float cPat;
uniform vec3 cBase;
uniform vec3 cSec;
uniform vec3 cNoseC;
uniform vec3 cEyeC;
float cEyeIn = 0.0;
uniform vec4 cHair;
uniform float cSeed;
uniform float cWet;
uniform vec4 cLand;
uniform vec4 cHead;
uniform vec4 cEye;
uniform vec4 cMisc;
uniform vec4 cNose;
uniform float cRole;
uniform float cTexMode;
uniform vec3 cMeans;
uniform vec4 cKeepS[${MAX_KEEP}];
uniform float cKeepL[${MAX_KEEP}];
uniform vec4 cKeepOpt;
varying vec3 vCmpPos;
varying vec4 vCmpPart;
varying float vCmpLow;
float cmpHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float cmpNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cmpHash(i), cmpHash(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(cmpHash(i + vec3(0.0, 1.0, 0.0)), cmpHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(cmpHash(i + vec3(0.0, 0.0, 1.0)), cmpHash(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(cmpHash(i + vec3(0.0, 1.0, 1.0)), cmpHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
const mat3 CMP_ROT = mat3(0.788, 0.441, -0.43, -0.39, 0.896, 0.215, 0.476, -0.054, 0.878);
vec3 cmpHsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
// Couleur de la robe à un endroit du corps (repos).
vec3 rabbitCoat(vec3 p, vec4 part) {
  float ear = part.x;
  float tail = part.y;
  float head = part.z;
  float legs = part.w;
  float face = head * (1.0 - ear);
  float trunk = (1.0 - head) * (1.0 - tail);
  float L = max(0.05, cLand.y - cLand.x);
  vec3 q = (p - vec3(cMisc.x, 0.0, cLand.x)) / L;
  float h = (p.y - cLand.z) / max(0.02, cLand.w - cLand.z);
  float u = (p.z - cLand.x) / L;
  float headLen = cNose.w;
  float ax = abs(p.x - cMisc.x);
  vec3 sd = vec3(cSeed, cSeed * 0.37, cSeed * 0.71);
  float n1 = cmpNoise(q * 3.0 + sd);
  float n2 = cmpNoise(q * 9.0 + 5.0 + sd);
  // dessous : ventre, intérieur des pattes, menton et gorge, dessous de la queue ; tour des yeux
  float belly = trunk * (1.0 - smoothstep(0.08, 0.4, h + (n2 - 0.5) * 0.12)) * (1.0 - legs * 0.3);
  float inLeg = legs * (1.0 - smoothstep(0.35, 0.7, h)) * smoothstep(0.004, 0.02, 0.03 - ax * 0.4);
  float chin = face * (1.0 - smoothstep(cNose.y - 0.45 * headLen, cNose.y - 0.15 * headLen, p.y));
  float tailUnder = tail * (1.0 - smoothstep(cMisc.y - 0.01, cMisc.y + 0.015, p.y));
  vec3 eL = vec3(cMisc.x + cEye.x, cEye.y, cEye.z);
  vec3 eR = vec3(cMisc.x - cEye.x, cEye.y, cEye.z);
  float ring = face * (1.0 - smoothstep(0.32 * headLen, 0.48 * headLen, min(distance(p, eL), distance(p, eR))));
  float dn = distance(p, cNose.xyz) / headLen;
  float muzzle = face * (1.0 - smoothstep(0.25, 0.5, dn));
  vec3 c = cBase;
  if (cPat < 0.5) {
    // unie : à peine plus clair dessous
    c = mix(cBase, mix(cBase, vec3(1.0), 0.12), belly * 0.6);
  } else if (cPat < 1.5) {
    // agouti : dos et flancs de la couleur, dessous, menton, tour des yeux et pompon dessous de la seconde
    float under = max(max(belly, inLeg * 0.8), max(chin * 0.9, tailUnder));
    under = max(under, ring * 0.75);
    c = mix(cBase, cSec, clamp(under, 0.0, 1.0));
    // oreilles bordées plus sombre, nuque un peu rousse chez les agoutis
    c = mix(c, cBase * 0.7, ear * smoothstep(0.6, 0.95, n2) * 0.3);
  } else {
    // panaché (« broken ») : fond blanc ; oreilles, tour des yeux, papillon du nez, raie du dos et taches colorés
    float butterfly = face * (1.0 - smoothstep(0.32, 0.5, dn + abs(p.x - cMisc.x) / headLen * 0.4)) * smoothstep(0.12, 0.2, dn);
    float spots = trunk * smoothstep(0.58, 0.66, n1 + 0.15 * n2 + 0.35 * smoothstep(0.55, 1.0, h));
    float spine = trunk * (1.0 - legs) * smoothstep(0.82, 0.95, h) * (1.0 - smoothstep(0.01, 0.025, ax + (n2 - 0.5) * 0.01));
    float col = max(max(ear, ring * 0.95), max(butterfly, max(spots * (1.0 - belly), spine)));
    col = max(col, tail * (1.0 - tailUnder) * 0.8);
    c = mix(cBase, cSec, clamp(col, 0.0, 1.0));
  }
  return c;
}`;

const COLOR_F = /* glsl */ `
if (cOn > 0.5) {
  vec3 c0 = diffuseColor.rgb;
  vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
  float lum0 = dot(c0, LUM);
  vec3 hsv = cmpHsv(pow(clamp(c0, 0.0, 1.0), vec3(0.4545)));
  float keep = 1.0 - cRole;
  float noseK = 0.0;
  for (int i = 0; i < ${MAX_KEEP}; i++) {
    vec4 s = cKeepS[i];
    if (s.w > 0.0) {
      float inS = 1.0 - smoothstep(s.w * 0.65, s.w, distance(vCmpPos, s.xyz));
      float k = inS * (1.0 - smoothstep(cKeepL[i] * 0.5, cKeepL[i], lum0));
      keep = max(keep, k);
      if (i == 0) noseK = k;
    }
  }
  // Intérieur des oreilles et truffe roses (tête seulement).
  float pinkK = 0.0;
  if (cKeepOpt.y > 0.0) {
    float dh = abs(fract(hsv.x - 0.99 + 0.5) - 0.5);
    pinkK = vCmpPart.z * (1.0 - smoothstep(0.035, 0.07, dh)) * smoothstep(0.14, 0.28, hsv.y) * smoothstep(0.25, 0.4, hsv.z);
    keep = max(keep, pinkK);
  }
  // Yeux peints (bélier) : repeints ronds par la robe (cKeepOpt.z : rayon, centres cEye) ; ailleurs sur la tête, les
  // texels très sombres de la texture gardent leur couleur (bouche).
  float eyeD = 9.0;
  vec3 eyeC = vec3(0.0);
  if (cKeepOpt.z > 0.0) {
    vec3 eL = vec3(cMisc.x + cEye.x, cEye.y, cEye.z);
    vec3 eR = vec3(cMisc.x - cEye.x, cEye.y, cEye.z);
    eyeC = distance(vCmpPos, eL) < distance(vCmpPos, eR) ? eL : eR;
    eyeD = distance(vCmpPos, eyeC) / cKeepOpt.z;
  }
  if (cKeepOpt.x > 0.0) keep = max(keep, vCmpPart.z * (1.0 - vCmpPart.x) * smoothstep(1.5, 2.1, eyeD) * (1.0 - smoothstep(cKeepOpt.x * 0.6, cKeepOpt.x, lum0)));
  float detail = 1.0;
  if (cTexMode > 0.5) {
    float ll = log(max(lum0, 1e-3));
    float w = smoothstep(cMeans.x + 0.15 * (cMeans.y - cMeans.x), cMeans.x + 0.85 * (cMeans.y - cMeans.x), ll);
    float nl = ll - mix(cMeans.x, cMeans.y, w);
    detail = exp(clamp((nl - vCmpLow) * cMeans.z + vCmpLow * 0.12, -0.9, 0.45));
    // (rex : poil ras et velouté, grain très atténué ; angora : grain doux)
    detail = mix(detail, 1.0 + (detail - 1.0) * 0.3, cHair.x);
    detail = mix(detail, 1.0 + (detail - 1.0) * 0.65, cHair.y);
  }
  vec3 coat = rabbitCoat(vCmpPos, vCmpPart);
  float l = dot(coat, LUM);
  detail = mix(detail, sqrt(detail), smoothstep(0.3, 0.8, l));
  vec3 nc = min(coat * detail, vec3(1.0));
  // velours du rex : grain serré et doux (effacé de loin)
  float fwC = length(fwidth(vCmpPos));
  if (cHair.x > 0.0) nc *= mix(1.0, 0.93 + 0.12 * cmpNoise(CMP_ROT * vCmpPos * 900.0), cHair.x * (1.0 - smoothstep(0.25, 0.9, fwC * 600.0)));
  nc *= 1.0 - 0.35 * cWet;
  keep = clamp(keep, 0.0, 1.0);
  vec3 kc = c0;
  kc = mix(kc, cNoseC * (0.55 + 0.9 * lum0), noseK * (1.0 - pinkK * 0.5) * 0.85);
  diffuseColor.rgb = mix(nc, kc, keep);
  if (eyeD < 1.2) {
    // œil rond : iris (couleur des yeux de la race) plus clair vers le bas, pupille, liseré sombre, paupière fondue dans
    // le poil, reflet en haut vers l'avant
    float eyeIn = vCmpPart.z * (1.0 - vCmpPart.x) * (1.0 - smoothstep(0.95, 1.12, eyeD));
    float lower = smoothstep(-0.7, 0.5, (eyeC.y - vCmpPos.y) / cKeepOpt.z);
    vec3 iris = mix(cEyeC * 1.3, cEyeC * 2.6 + vec3(0.06, 0.035, 0.015), lower * smoothstep(0.35, 0.8, eyeD));
    vec3 ecol = mix(vec3(0.012, 0.01, 0.01), iris, smoothstep(0.34, 0.46, eyeD));
    ecol = mix(ecol, vec3(0.025, 0.018, 0.016), smoothstep(0.82, 0.96, eyeD));
    float glint = 1.0 - smoothstep(0.18, 0.3, distance(vCmpPos, eyeC + vec3(0.0, 0.3, 0.32) * cKeepOpt.z) / cKeepOpt.z);
    ecol = mix(ecol, vec3(1.0), glint);
    diffuseColor.rgb = mix(diffuseColor.rgb, ecol, eyeIn);
    cEyeIn = eyeIn;
  }
}`;

// Yeux (sphères du lapin de Dakota) : l'iris prend la couleur de la race (brun foncé, rubis de l'albinos) ; la pupille
// (texels sombres) et les reflets gardent la texture.
const EYE_F = /* glsl */ `
{
  vec3 c0 = diffuseColor.rgb;
  float lum0 = dot(c0, vec3(0.2126, 0.7152, 0.0722));
  float pupil = 1.0 - smoothstep(0.02, 0.05, lum0);
  float glint = smoothstep(0.55, 0.8, lum0);
  vec3 ic = cEyeC * clamp(0.6 + 1.4 * lum0, 0.55, 1.4);
  diffuseColor.rgb = mix(ic, c0, clamp(max(pupil * 0.85, glint), 0.0, 1.0));
}`;

/**
 * Matière d'un lapin : pelage recoloré (role 'fur'), cartes de poils (role 'card' : même robe, découpées par la
 * texture des brins), yeux (role 'eye'). src : matière du GLB ; shared : uniformes du lapin (robe et repères) ;
 * opts : { role, means (furLow), contrast (grain), keep: { pink, dark, spheres }, alphaMap (cartes) }.
 */
export function rabbitCoatMaterial(src, shared, opts) {
  const role = opts.role ?? 'fur';
  const card = role === 'card';
  // (cartes, rendu anticrénelé — qualité haute, ou basse sur un écran fin — : bouts des brins translucides par la
  // couverture des échantillons, comme les crins du cheval ; sans, découpés net à alphaTest)
  const a2c = card && (gfx.msaa || gfx.quality === 'high');
  const mat = new THREE.MeshStandardMaterial({
    // (cartes : la texture des brins sert aussi d'ombrage, racines plus sombres, brins mêlés)
    map: card ? opts.alphaMap ?? null : src?.map ?? null,
    normalMap: role === 'fur' ? src?.normalMap ?? null : null,
    aoMap: role === 'fur' ? src?.aoMap ?? null : null,
    aoMapIntensity: 0.8,
    alphaMap: card ? opts.alphaMap ?? null : null,
    alphaTest: card ? 0.42 : 0,
    alphaToCoverage: a2c,
    side: card ? THREE.DoubleSide : THREE.FrontSide,
    roughness: role === 'eye' ? 0.1 : 0.88,
    metalness: 0,
    name: role === 'eye' ? 'rabbit_eye' : role === 'card' ? 'rabbit_fur' : 'rabbit_coat',
  });
  if (mat.normalMap) mat.normalScale.set(0.8, 0.8);
  // (sinon, au bord des brins, le fond de la page passait au travers en points clairs)
  if (a2c) keepFrameAlpha(mat);
  if (role === 'eye' && !mat.map) {
    // (globes sans texture, lapin de Dakota : œil de la couleur de la race, brillant ; le reflet fait le regard)
    mat.color.copy(shared.cEyeC.value);
    mat.userData.eyeColor = true;
    return mat;
  }
  if (role === 'eye') {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.cEyeC = shared.cEyeC;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 cEyeC;')
        .replace('#include <color_fragment>', `#include <color_fragment>\n${EYE_F}`);
    };
    mat.customProgramCacheKey = () => 'rabbit-eye-v1';
    return mat;
  }
  const keep = opts.keep ?? {};
  const spheres = [...(keep.spheres ?? [])];
  while (spheres.length < MAX_KEEP) spheres.push({ s: new THREE.Vector4(0, 0, 0, 0), l: 0 });
  const own = {
    cRole: { value: 1 },
    cTexMode: { value: opts.means && !card ? 1 : 0 },
    cMeans: { value: new THREE.Vector3(opts.means?.lo ?? -3, opts.means?.hi ?? -1, opts.contrast ?? 1) },
    cKeepS: { value: spheres.slice(0, MAX_KEEP).map((x) => (card ? new THREE.Vector4() : x.s)) },
    cKeepL: { value: spheres.slice(0, MAX_KEEP).map((x) => x.l) },
    cKeepOpt: { value: new THREE.Vector4(card ? 0 : keep.dark ?? 0, keep.pink && !card ? 1 : 0, card ? 0 : keep.eyeR ?? 0, 0) },
  };
  const uniforms = { ...shared, ...own };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON_V}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${REST_V}`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>\n${PUSH_V}\n${card ? GROUND_CARD_V : GROUND_V}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_F}`)
      .replace('#include <color_fragment>', card
        ? `#include <color_fragment>\nvec3 cardC0 = diffuseColor.rgb;\n${COLOR_F}\ndiffuseColor.rgb *= (0.93 + 0.18 * vCmpLow) * (0.76 + 0.3 * clamp(cardC0.r / max(cardC0.g, 0.05), 0.4, 1.0));`
        : `#include <color_fragment>\n${COLOR_F}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(mix(roughnessFactor, 0.62, cHair.x), 0.45, cWet), 0.12, cEyeIn);');
    // (cartes : éclairées comme la peau où elles poussent, des deux côtés ; sinon le revers d'une carte est noir)
    // (et tournées vers la caméra et le ciel, comme un poil que la lumière traverse : la crinière vue de face, éclairée
    // par-devant, ne montre plus le revers sombre de ses mèches, ni la gorge le vert sombre du sol)
    // (bouts des brins : l'opacité de la texture devient une couverture partielle sur toute sa pente — le seuil d'origine
    // ne garde qu'un pixel de fondu au bord, des brins découpés au ciseau)
    if (a2c) sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', 'diffuseColor.a = smoothstep(0.1, 0.75, diffuseColor.a);\nif (diffuseColor.a < 0.04) discard;');
    if (card) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(normalize(vNormal) + vec3(0.0, 0.0, 0.9) + (viewMatrix * vec4(0.0, 0.6, 0.0, 0.0)).xyz);');
  };
  mat.customProgramCacheKey = () => (card ? (a2c ? 'rabbit-card-v7-a2c' : 'rabbit-card-v7') : 'rabbit-coat-v4');
  return mat;
}
