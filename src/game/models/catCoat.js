// Robe des chats réalistes (catReal.js) : retouche du shader du pelage, comme les chiens (dogCoat.js) et la page
// « Chats et lapins » (src/compare/petRecolor.js).
//
// Le poil peint du modèle d'origine (chat tigré gris de Claire, chaton de FainoDS) est ramené à un gris neutre qui
// garde son grain (poils, reflets) mais pas ses rayures : la luminance de chaque texel est rapportée à la moyenne de sa
// « classe » (poil sombre ou clair, mesurées sur la texture au chargement), moins sa moyenne locale sur la surface
// (attribut cmpLow, voir petReal.furLow). La robe du jeu est ensuite peinte selon l'endroit du corps : position du
// sommet au repos dans le repère du modèle d'ORIGINE (attribut cmpRest : les rayures ont la même place quelle que soit
// la race) et appartenance aux oreilles, à la queue, à la tête, aux pattes (cmpPart, tirée des poids du squelette).
// Elle reste donc collée à la peau quand le chat bouge. Truffe, intérieur des oreilles et yeux gardent la texture.
//
// Motifs (src/sim/catBreeds.js, CAT_PATTERNS) : uni, tigré (mackerel : rayures, colliers, « M » du front), marbré
// (classic : cocarde sur les flancs, papillon des épaules, trois raies du dos), tacheté (rosettes du bengal), tiqueté
// (abyssin), colourpoint (masque mesuré depuis le bout du nez, oreilles, pattes, queue ; pâles chez le chaton),
// tricolore (calico), écaille de tortue, bicolore (smoking) ; taches blanches (CAT_WHITE) : gants, mitted, bicolore,
// plastron, van. Peau nue et plissée (sphynx), poil frisé (devon rex), poil dense en peluche (british).
//
// Le même shader pousse la peau le long de la normale : embonpoint, respiration, queue gonflée de peur, coupe du salon.

import * as THREE from 'three';
import { catTraits } from '../../sim/catBreeds.js';

const MAX_KEEP = 4;

export const CAT_PATTERN_ID = { solid: 0, tabby: 1, classic: 2, rosettes: 3, ticked: 4, points: 5, tricolor: 6, tortie: 7, bicolor: 8 };
export const CAT_WHITE_ID = { none: 0, gloves: 1, mitted: 2, bicolor: 3, chest: 4, van: 5, tuxedo: 6 };

const hexLum = (c) => {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Robe d'un chat d'après son look (coat, secondary, third, pattern, white, eye, eye2) et sa race : couleurs, motif,
 * blanc, yeux, truffe, poil (peau nue, frisé, peluche). kitten : points pâles et masque plus petit (le colourpoint
 * fonce avec l'âge). Pure (testée en node).
 */
export function catCoatPlan(look = {}, breed = null, kitten = false) {
  const tr = catTraits(look, breed);
  const coat = look.coat ?? 0x8b8780;
  const sec = look.secondary ?? coat;
  const third = look.third ?? 0x231e1b;
  let pattern = tr.pattern;
  let white = tr.white ?? (pattern === 'bicolor' ? 'tuxedo' : 'none');
  let whiteC = 0xf4f1ea;
  // Bicolore : la seconde couleur est le blanc (« Smoking » : noir et blanc ; sphynx pie : peau rose).
  if (pattern === 'bicolor') whiteC = sec;
  // (une robe « tigrée » dont les deux couleurs sont égales n'a pas de rayures)
  if ((pattern === 'tabby' || pattern === 'classic' || pattern === 'ticked' || pattern === 'rosettes') && coat === sec) pattern = 'solid';
  const hairless = tr.hair === 'hairless' ? 1 : 0;
  const P = {
    pattern, white, base: coat, sec, third, whiteC,
    eye: tr.eye, eye2: tr.eye2,
    points: pattern === 'points' ? (kitten ? 0.45 : 1) : 0,
    maskScale: kitten ? 0.62 : 1,
    hairless, curly: tr.hair === 'curly' ? 1 : 0, plush: tr.hair === 'plush' ? 1 : 0, wrinkles: hairless,
    dark: hexLum(coat) < 0.06 && pattern !== 'tricolor',
    seed: ((look.seed ?? 7) % 997) * 0.731,
  };
  // Truffe (nez) : rose pour les robes claires et blanches, foncée pour les noires, bleu-gris pour les bleues ;
  // colourpoint : couleur des points.
  const lumC = hexLum(pattern === 'tricolor' ? sec : coat);
  P.nose = pattern === 'points' ? sec : hairless ? 0xd99a92 : lumC < 0.08 ? 0x2a2220 : lumC > 0.6 ? 0xe3a2a0
    : (coat & 255) > ((coat >> 16) & 255) ? 0x646872 : 0xb57868;
  return P;
}

/** Uniformes de la robe (un jeu par chat). */
export function makeCatCoatUniforms() {
  return {
    cOn: { value: 1 },
    cPat: { value: 0 },
    cWhiteT: { value: 0 },
    cBase: { value: new THREE.Color() },
    cSec: { value: new THREE.Color() },
    cThird: { value: new THREE.Color() },
    cWhiteC: { value: new THREE.Color() },
    cNoseC: { value: new THREE.Color() },
    cPoint: { value: new THREE.Vector2(0, 1) }, // force des points, taille du masque
    cHair: { value: new THREE.Vector4(0, 0, 0, 0) }, // peau nue, frisé, peluche, plis
    cSeed: { value: 0 },
    cFat: { value: 0 }, // poussée du ventre et des flancs (m)
    cBreath: { value: 0 }, // poussée de la cage thoracique (m)
    cPuff: { value: 0 }, // queue gonflée (m : peur)
    cWet: { value: 0 },
    // Coupe du salon (m, le long de la normale) : tronc, collerette, bas des pattes, bout de la queue.
    // (Vector4() vaut (0, 0, 0, 1) : la coupe « bout de la queue » poussait la queue d'un mètre)
    cCut: { value: new THREE.Vector4(0, 0, 0, 0) },
    cEyeL: { value: new THREE.Color() },
    cEyeR: { value: new THREE.Color() },
  };
}

/** Applique une robe (catCoatPlan) aux uniformes. */
export function setCatCoat(u, P) {
  u.cPat.value = CAT_PATTERN_ID[P.pattern] ?? 0;
  u.cWhiteT.value = CAT_WHITE_ID[P.white] ?? 0;
  u.cBase.value.setHex(P.base);
  u.cSec.value.setHex(P.sec);
  u.cThird.value.setHex(P.third);
  u.cWhiteC.value.setHex(P.whiteC);
  u.cNoseC.value.setHex(P.nose);
  u.cPoint.value.set(P.points, P.maskScale);
  u.cHair.value.set(P.hairless, P.curly, P.plush, P.wrinkles);
  u.cSeed.value = P.seed;
  u.cEyeL.value.setHex(P.eye);
  u.cEyeR.value.setHex(P.eye2);
}

/** Repères du corps au repos (modèle d'origine), communs à tous les chats d'un modèle. */
export function makeCatLandUniforms(L) {
  return {
    cLand: { value: new THREE.Vector4(L.hipZ, L.shZ, L.bellyY, L.topY) },
    cHead: { value: new THREE.Vector4(L.head.x, L.head.y, L.head.z, L.noseZ) },
    cEye: { value: new THREE.Vector4(L.eyeX, L.eyeY, L.eyeZ, L.elbowY) },
    cMisc: { value: new THREE.Vector4(L.midX, L.tailTipZ, L.neckZ, L.tailBaseZ) },
    cNose: { value: new THREE.Vector4(L.nose.x, L.nose.y, L.nose.z, Math.max(0.02, L.noseZ - L.head.z)) },
    cTailB: { value: new THREE.Vector4(L.tailBase.x, L.tailBase.y, L.tailBase.z, Math.max(0.05, L.tailLen)) },
  };
}

const COMMON_V = /* glsl */ `
attribute vec3 cmpRest;
attribute vec4 cmpPart;
attribute float cmpLow;
uniform vec4 cLand;
uniform vec4 cEye;
uniform vec4 cMisc;
uniform vec4 cHead;
uniform vec4 cTailB;
uniform float cFat;
uniform float cBreath;
uniform float cPuff;
uniform vec4 cCut;
varying vec3 vCmpPos;
varying vec4 vCmpPart;
varying float vCmpLow;`;

const REST_V = /* glsl */ `
vCmpPos = cmpRest;
vCmpPart = cmpPart;
vCmpLow = cmpLow;`;

// Embonpoint (ventre et flancs), respiration (cage thoracique), queue gonflée et coupe du salon, le long de la normale
// du sommet déformé.
const PUSH_V = /* glsl */ `
{
  float trunkW = (1.0 - cmpPart.w) * (1.0 - cmpPart.y) * (1.0 - cmpPart.z);
  float u = (cmpRest.z - cLand.x) / max(0.05, cLand.y - cLand.x);
  float h = (cmpRest.y - cLand.z) / max(0.02, cLand.w - cLand.z);
  float belly = trunkW * smoothstep(-0.15, 0.25, u) * (1.0 - smoothstep(0.85, 1.15, u)) * (1.0 - smoothstep(0.55, 1.0, h));
  float ribs = trunkW * smoothstep(0.35, 0.65, u) * (1.0 - smoothstep(1.0, 1.25, u)) * (1.0 - smoothstep(0.7, 1.05, h));
  float push = cFat * belly + cBreath * ribs;
  // (queue gonflée : plus vers le bout ; la base reste soudée à la croupe)
  if (cPuff > 0.0) push += cPuff * cmpPart.y * smoothstep(0.0, 0.25, distance(cmpRest, cTailB.xyz) / cTailB.w);
  if (cCut != vec4(0.0)) {
    float tr = trunkW * smoothstep(-0.25, 0.0, u) * (1.0 - smoothstep(0.95, 1.2, u));
    float ruff = (1.0 - cmpPart.w) * (1.0 - cmpPart.y) * (1.0 - cmpPart.x) * smoothstep(0.85, 1.05, u)
      * (1.0 - smoothstep(cHead.z - 0.02, cHead.z + 0.04, cmpRest.z)) * (1.0 - cmpPart.z * 0.6);
    float pom = cmpPart.w * smoothstep(0.015, 0.03, cmpRest.y) * (1.0 - smoothstep(cEye.w * 0.35, cEye.w * 0.55, cmpRest.y));
    float tip = cmpPart.y * smoothstep(0.75, 0.9, distance(cmpRest, cTailB.xyz) / cTailB.w);
    push += cCut.x * tr + cCut.y * ruff + cCut.z * pom + cCut.w * tip;
  }
  // (jamais normalize(0) : une normale nulle donne NaN, et NaN × 0 reste NaN — un sommet perdu à l'infini)
  if (push != 0.0) transformed += objectNormal * (push / max(1e-6, length(objectNormal)));
}`;

const COMMON_F = /* glsl */ `
uniform float cOn;
uniform float cPat;
uniform float cWhiteT;
uniform vec3 cBase;
uniform vec3 cSec;
uniform vec3 cThird;
uniform vec3 cWhiteC;
uniform vec3 cNoseC;
uniform vec2 cPoint;
uniform vec4 cHair;
uniform float cSeed;
uniform float cWet;
uniform vec4 cLand;
uniform vec4 cHead;
uniform vec4 cEye;
uniform vec4 cMisc;
uniform vec4 cNose;
uniform vec4 cTailB;
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
// Relief : bouclettes (frisé), plis de la peau nue (sphynx : rides du front, du cou et des épaules).
float catCurlH(vec3 p) {
  vec3 q = CMP_ROT * p * 160.0;
  return cmpNoise(q) * 0.6 + cmpNoise(q * 2.1 + 7.0) * 0.4;
}
float catWrinkleH(vec3 p, vec4 part) {
  float headLen = cNose.w;
  float hz = (p.z - cHead.z) / headLen;
  float face = part.z * (1.0 - part.x);
  // front : plis en travers entre les oreilles et les yeux ; cou et épaules : plis en anneaux
  float brow = face * smoothstep(cEye.y - 0.1 * headLen, cEye.y + 0.25 * headLen, p.y) * (1.0 - smoothstep(0.15, 0.55, hz));
  float neck = (1.0 - part.z) * (1.0 - part.w * 0.7) * (1.0 - part.y) * smoothstep(cLand.y - 0.05, cLand.y + 0.03, p.z) * (1.0 - smoothstep(cHead.z - 0.01, cHead.z + 0.02, p.z));
  float w1 = sin((p.y * 260.0 + cmpNoise(p * 60.0) * 2.5)) * brow;
  float w2 = sin((p.z * 230.0 + cmpNoise(p * 50.0 + 3.0) * 3.0)) * neck;
  return 0.5 + 0.5 * clamp(w1 + w2, -1.0, 1.0);
}
// Taches (bengal) : x = intérieur de la tache la plus proche, y = son contour (rosette).
vec2 catSpots(vec3 p, float r0, float rv) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec2 best = vec2(0.0);
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 c = i + g;
    vec3 o = vec3(cmpHash(c), cmpHash(c + 17.31), cmpHash(c + 41.7));
    float r = r0 + rv * cmpHash(c + 7.7);
    float d = length(g + o - f) + (cmpNoise(p * 3.0 + c) - 0.5) * 0.12;
    float inside = 1.0 - smoothstep(r - 0.04, r + 0.02, d);
    float ring = inside * smoothstep(r * 0.42, r * 0.62, d);
    best = max(best, vec2(inside, ring));
  }
  return best;
}
vec3 cmpHsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
// Repères d'un endroit du corps (repos) : remplis par catRegions, lus par les motifs.
struct CatR {
  float ear; float tail; float head; float legs; float face; float trunk;
  float h; float u; float hz; float dn; float tt; float ax;
  float muzzle; float chin; float throat; float belly; float chest; float legLow; float paws;
  vec3 q;
};
CatR catRegions(vec3 p, vec4 part) {
  CatR r;
  r.ear = part.x; r.tail = part.y; r.head = part.z; r.legs = part.w;
  float hipZ = cLand.x;
  float shZ = cLand.y;
  float L = max(0.05, shZ - hipZ);
  r.q = (p - vec3(cMisc.x, 0.0, hipZ)) / L;
  r.h = (p.y - cLand.z) / max(0.02, cLand.w - cLand.z);
  r.u = (p.z - hipZ) / L;
  float headLen = cNose.w;
  r.hz = (p.z - cHead.z) / headLen;
  r.face = r.head * (1.0 - r.ear);
  r.trunk = (1.0 - r.head) * (1.0 - r.tail);
  r.ax = abs(p.x - cMisc.x);
  // distance au bout du nez (en longueurs de tête) : museau, masque du colourpoint
  r.dn = distance(p, cNose.xyz - vec3(0.0, 0.05 * headLen, 0.12 * headLen)) / headLen;
  r.tt = clamp(distance(p, cTailB.xyz) / cTailB.w, 0.0, 1.0);
  r.muzzle = r.face * (1.0 - smoothstep(0.32, 0.55, r.dn));
  r.chin = r.face * (1.0 - smoothstep(cNose.y - 0.42 * headLen, cNose.y - 0.18 * headLen, p.y)) * smoothstep(0.05, 0.35, r.hz);
  // gorge et poitrail : sous une ligne qui va du milieu du poitrail (épaules) au menton
  float zc = clamp((p.z - shZ) / max(0.02, cHead.z - shZ), 0.0, 1.0);
  float yl = mix(cLand.z + 0.55 * (cLand.w - cLand.z), cNose.y - 0.3 * headLen, zc);
  r.throat = (1.0 - r.ear) * (1.0 - r.tail) * (1.0 - r.legs * 0.6) * smoothstep(shZ - 0.25 * L, shZ - 0.05 * L, p.z)
    * (1.0 - smoothstep(yl - 0.006, yl + 0.006, p.y)) * (1.0 - smoothstep(0.3, 0.6, r.hz));
  r.chest = r.trunk * (1.0 - r.legs * 0.4) * smoothstep(0.8, 1.0, r.u) * (1.0 - smoothstep(0.35, 0.65, r.h));
  r.belly = r.trunk * (1.0 - r.legs * 0.5) * (1.0 - smoothstep(0.02, 0.3, r.h)) * smoothstep(-0.1, 0.15, r.u) * (1.0 - smoothstep(1.0, 1.25, r.u));
  r.legLow = r.legs * (1.0 - smoothstep(cEye.w * 0.25, cEye.w * 0.55, p.y));
  r.paws = r.legs * (1.0 - smoothstep(cEye.w * 0.12, cEye.w * 0.26, p.y));
  return r;
}
// Taches blanches (gants, mitted, bicolore, plastron, van, smoking) : 0 à 1.
float catWhite(vec3 p, CatR r, float t, float n) {
  if (t < 0.5) return 0.0;
  float front = smoothstep(0.55, 0.75, r.u);
  if (t < 1.5) {
    // gants (sacré de Birmanie) : bout des pattes avant, un peu plus haut derrière (les « éperons »)
    return r.legs * (1.0 - smoothstep(cEye.w * (0.14 + 0.18 * (1.0 - front)), cEye.w * (0.2 + 0.18 * (1.0 - front)), p.y + (n - 0.5) * 0.006));
  }
  if (t < 2.5) {
    // mitted (ragdoll) : gants, menton, bande sous le ventre et le poitrail
    float g = r.legs * (1.0 - smoothstep(cEye.w * (0.2 + 0.35 * (1.0 - front)), cEye.w * (0.28 + 0.35 * (1.0 - front)), p.y));
    float strip = (r.belly + r.chest + r.throat) * (1.0 - smoothstep(0.02, 0.035, r.ax + (n - 0.5) * 0.01));
    return max(max(g, strip), r.chin);
  }
  if (t < 3.5) {
    // bicolore : pattes, ventre, poitrail, gorge, museau et « V » renversé sur le nez
    float legsW = r.legs * (1.0 - smoothstep(cEye.w * 0.8, cEye.w * 1.25, p.y + (n - 0.5) * 0.02));
    float under = max(r.belly * 1.2, max(r.chest, r.throat)) + r.trunk * (1.0 - smoothstep(0.3, 0.5, r.h + (n - 0.5) * 0.15));
    float vee = r.face * smoothstep(0.35, 0.6, r.hz) * (1.0 - smoothstep(0.0, 0.012, r.ax - (r.hz - 0.4) * cNose.w * 0.9));
    return clamp(max(max(legsW, under), max(vee, max(r.muzzle, r.chin))), 0.0, 1.0);
  }
  if (t < 4.5) {
    // plastron : médaillon blanc sur la gorge et le poitrail
    return max(r.throat, r.chest) * (1.0 - smoothstep(0.016, 0.026, r.ax + (n - 0.5) * 0.01));
  }
  if (t < 5.5) {
    // van : tout blanc sauf le haut de la tête, les oreilles et la queue
    float cap = r.head * smoothstep(cEye.y - 0.004, cEye.y + 0.01, p.y + (n - 0.5) * 0.01) * (1.0 - smoothstep(0.45, 0.6, r.hz)) * (1.0 - smoothstep(0.012, 0.022, r.ax - 0.012));
    float col = max(r.ear, max(cap, r.tail * smoothstep(0.05, 0.12, r.tt)));
    return 1.0 - col;
  }
  // smoking (bicolore noir et blanc) : plastron, ventre, chaussettes, museau et menton
  float socks = r.legs * (1.0 - smoothstep(cEye.w * 0.35, cEye.w * 0.5, p.y + (n - 0.5) * 0.01));
  float under = max(r.belly * 1.3, max(r.chest, r.throat));
  return clamp(max(max(socks, under), max(r.muzzle * 0.9, r.chin)), 0.0, 1.0);
}
// « M » du front et lignes des joues (tigrés).
float catFaceStripes(vec3 p, CatR r, float n2) {
  float headLen = cNose.w;
  float fh = r.face * smoothstep(cEye.y + 0.05 * headLen, cEye.y + 0.2 * headLen, p.y) * (1.0 - smoothstep(0.45, 0.62, r.hz));
  float m = sin(((p.x - cMisc.x) / max(0.004, cEye.x) * 2.6 + n2 * 0.4) * 3.1416) * 0.5 + 0.5;
  float cheek = r.face * (1.0 - smoothstep(cEye.y - 0.05 * headLen, cEye.y + 0.05 * headLen, p.y)) * smoothstep(cEye.x * 0.9, cEye.x * 1.3, r.ax)
    * smoothstep(0.1, 0.25, r.hz) * (1.0 - smoothstep(0.4, 0.55, r.hz));
  float cl = smoothstep(0.55, 0.85, sin((p.y - cEye.y) / headLen * 22.0 + (p.z - cHead.z) / headLen * 5.0 + n2) * 0.5 + 0.5);
  return max(fh * smoothstep(0.55, 0.85, m), cheek * cl);
}
// Couleur de la robe à un endroit du corps (repos).
vec3 catCoat(vec3 p, vec4 part) {
  CatR r = catRegions(p, part);
  vec3 sd = vec3(cSeed, cSeed * 0.37, cSeed * 0.71);
  float n1 = cmpNoise(r.q * 4.0 + sd);
  float n2 = cmpNoise(r.q * 11.0 + 5.0 + sd);
  float light = max(r.belly * 0.75, max(r.chin * 0.8, r.muzzle * 0.45));
  vec3 c = cBase;
  if (cPat < 0.5) {
    // uni : un peu plus clair dessous
    c = mix(cBase, mix(cBase, vec3(1.0), 0.18), r.belly * 0.5);
  } else if (cPat < 2.5) {
    float warp = n1 * 0.9 + n2 * 0.25;
    float tring = sin((r.tt * 8.0 + n2 * 0.3) * 6.2832);
    float ring = sin((p.y / max(0.02, cEye.w) * 4.0 + warp * 0.6) * 6.2832);
    float s;
    if (cPat < 1.5) {
      // tigré (mackerel) : fines rayures en travers des flancs, raie du dos, colliers au poitrail
      float body = sin((r.q.z * 7.5 + warp * 0.9 + 0.35 * r.h) * 6.2832);
      float neckl = sin(((p.y - cLand.z) / max(0.02, cLand.w - cLand.z) * 3.5 + warp * 0.4) * 6.2832) * max(r.throat, r.chest);
      s = mix(body, ring, r.legs);
      s = max(s, neckl);
    } else {
      // marbré (classic) : cocarde sur chaque flanc, papillon sur les épaules, trois raies sur le dos
      float d = length(vec2((r.q.z - 0.42) * 1.15, (r.h - 0.55) * 0.75)) + warp * 0.06;
      float bull = sin(d * 6.2832 * 3.2 + 0.6);
      float spine = sin((r.ax / 0.012 + n2 * 0.5) * 3.1416) * smoothstep(0.82, 0.95, r.h);
      float fly = sin(length(vec2((r.q.z - 0.95) * 1.6, (r.h - 0.95))) * 6.2832 * 3.0 + n1) * smoothstep(0.7, 0.9, r.h) * smoothstep(0.75, 0.95, r.q.z);
      s = mix(max(bull, max(spine, fly)), ring, r.legs);
    }
    s = mix(s, tring, r.tail);
    float stripe = smoothstep(0.25, 0.8, s + (n2 - 0.5) * 0.6) * (0.6 + 0.4 * n1);
    stripe *= (1.0 - r.belly * 0.85) * (1.0 - r.muzzle) * (1.0 - r.chin);
    stripe = max(stripe * (1.0 - r.face * (1.0 - smoothstep(0.55, 0.7, r.hz))), catFaceStripes(p, r, n2));
    stripe = max(stripe, r.trunk * (1.0 - r.legs) * smoothstep(0.88, 0.98, r.h) * (1.0 - smoothstep(0.006, 0.014, r.ax)));
    stripe = max(stripe, r.tail * smoothstep(0.82, 0.95, r.tt));
    c = mix(cBase, cSec, stripe * 0.9);
    c = mix(c, mix(cBase, vec3(0.97, 0.94, 0.88), 0.5), light);
  } else if (cPat < 3.5) {
    // tacheté (bengal) : fond doré, rosettes (contour sombre, cœur roux), petites taches aux pattes et à la tête
    float small = max(r.face, r.legs);
    vec2 sp = catSpots(r.q * mix(5.5, 11.0, small) + vec3(3.1, 1.7, 0.0) + sd, 0.3, 0.12);
    float tring = smoothstep(0.55, 0.85, sin(r.tt * 6.0 * 6.2832) * 0.5 + 0.5) * smoothstep(0.3, 0.6, r.tt);
    vec3 ground = mix(cBase, vec3(0.95, 0.9, 0.8), max(r.belly * 0.85, max(r.chin, r.muzzle * 0.7)));
    vec3 core = mix(cBase, cSec, 0.4);
    c = mix(ground, core, sp.x * (1.0 - small) * (1.0 - r.tail));
    float dark = max(sp.y * (1.0 - small), sp.x * small * (1.0 - r.muzzle));
    dark = mix(dark, max(tring, smoothstep(0.85, 0.97, r.tt)), r.tail);
    dark = max(dark, catFaceStripes(p, r, n2) * 0.8);
    c = mix(c, cSec, dark * 0.92);
  } else if (cPat < 4.5) {
    // tiqueté (abyssin) : chaque poil rayé (grain fin), raie du dos, barres légères aux pattes, bout de queue foncé
    float tick = cmpNoise(p * 520.0 + sd) * 0.6 + cmpNoise(p * 1100.0) * 0.4;
    c = mix(cBase, cSec, smoothstep(0.5, 0.9, tick) * 0.45 + smoothstep(0.8, 1.0, r.h) * r.trunk * 0.3);
    float bars = r.legs * smoothstep(0.6, 0.9, sin(p.y / max(0.02, cEye.w) * 4.0 * 6.2832) * 0.5 + 0.5) * smoothstep(cEye.w * 0.5, cEye.w, p.y) * 0.35;
    c = mix(c, cSec, max(bars, max(r.tail * smoothstep(0.85, 0.97, r.tt), catFaceStripes(p, r, n2) * 0.5)));
    c = mix(c, mix(cBase, vec3(0.97, 0.92, 0.82), 0.6), max(light, r.throat * 0.4));
  } else if (cPat < 5.5) {
    // colourpoint : corps crème (un peu plus foncé sur le dos), masque autour du nez, oreilles, pattes et queue
    float ms = cPoint.y;
    float mask = r.face * (1.0 - smoothstep(0.42 * ms, 0.95 * ms, r.dn + (n2 - 0.5) * 0.12));
    float pts = max(r.ear, mask);
    pts = max(pts, r.legs * (1.0 - smoothstep(cEye.w * 0.35, cEye.w * 1.15, p.y)));
    pts = max(pts, r.tail * smoothstep(0.05, 0.5, r.tt));
    vec3 body = mix(cBase, mix(cBase, cSec, 0.2), smoothstep(0.55, 1.0, r.h) * r.trunk * cPoint.x);
    c = mix(body, cSec, smoothstep(0.1, 0.85, pts) * cPoint.x);
  } else if (cPat < 6.5) {
    // tricolore (calico) : blanc dessous (ventre, poitrail, pattes, museau) ; grandes plaques rousses et noires
    float edge = (n1 - 0.5) * 0.25 + (n2 - 0.5) * 0.08;
    float w = max(max(r.belly * 1.3, r.chest), max(r.throat, max(r.muzzle, r.chin)));
    w = max(w, r.legs * (1.0 - smoothstep(cEye.w * 0.6, cEye.w * 1.1, p.y)));
    w = max(w, r.trunk * (1.0 - smoothstep(0.25, 0.45, r.h + edge)));
    float blot = cmpNoise(r.q * 2.3 + vec3(3.0, 1.0, 7.0) + sd) + 0.4 * cmpNoise(r.q * 5.5);
    vec3 patchC = mix(cSec, cThird, smoothstep(0.66, 0.74, blot));
    c = mix(patchC, cBase, smoothstep(0.4, 0.6, w + edge));
  } else if (cPat < 7.5) {
    // écaille de tortue : noir et roux mêlés en marbrures fines, liste rousse possible sur le nez
    float m = cmpNoise(r.q * 6.0 + sd) * 0.6 + cmpNoise(r.q * 15.0 + 2.0) * 0.4;
    float blaze = r.face * smoothstep(0.3, 0.6, r.hz) * (1.0 - smoothstep(0.004, 0.01, r.ax)) * step(0.5, cmpHash(sd + 3.0));
    c = mix(cBase, cSec, max(smoothstep(0.5, 0.62, m), blaze));
  } else {
    c = cBase;
  }
  // Taches blanches par-dessus le motif.
  float wh = catWhite(p, r, cWhiteT, n2);
  c = mix(c, cWhiteC, clamp(wh, 0.0, 1.0));
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
    pinkK = vCmpPart.z * (1.0 - smoothstep(0.035, 0.065, dh)) * smoothstep(0.16, 0.3, hsv.y) * smoothstep(0.25, 0.4, hsv.z);
    keep = max(keep, pinkK);
  }
  // Yeux peints (chaton) : texels très sombres de la tête.
  if (cKeepOpt.x > 0.0) keep = max(keep, vCmpPart.z * (1.0 - vCmpPart.x) * (1.0 - smoothstep(cKeepOpt.x * 0.6, cKeepOpt.x, lum0)));
  float detail = 1.0;
  if (cTexMode > 0.5) {
    float ll = log(max(lum0, 1e-3));
    float w = smoothstep(cMeans.x + 0.15 * (cMeans.y - cMeans.x), cMeans.x + 0.85 * (cMeans.y - cMeans.x), ll);
    float nl = ll - mix(cMeans.x, cMeans.y, w);
    detail = exp(clamp((nl - vCmpLow) * cMeans.z + vCmpLow * 0.12, -0.9, 0.45));
    // (peau nue : presque plus de poils peints)
    detail = mix(detail, 1.0 + (detail - 1.0) * 0.15, cHair.x);
  }
  vec3 coat = catCoat(vCmpPos, vCmpPart);
  float l = dot(coat, LUM);
  detail = mix(detail, sqrt(detail), smoothstep(0.3, 0.8, l));
  vec3 nc = min(coat * detail, vec3(1.0));
  float fwC = length(fwidth(vCmpPos));
  // poil frisé : bouclettes (effacées de loin, sinon des pixels qui scintillent)
  if (cHair.y > 0.0) nc *= mix(1.0, 0.72 + 0.4 * smoothstep(0.25, 0.75, catCurlH(vCmpPos)), cHair.y * (1.0 - vCmpPart.x) * (1.0 - smoothstep(0.25, 0.9, fwC * 160.0)));
  // peau nue : plis plus sombres au fond, peau un peu rosée
  if (cHair.w > 0.0) nc *= mix(1.0, 0.8 + 0.25 * catWrinkleH(vCmpPos, vCmpPart), cHair.w * (1.0 - smoothstep(0.25, 0.9, fwC * 200.0)));
  // poil en peluche : pointes plus claires, grain doux et serré
  if (cHair.z > 0.0) nc *= mix(1.0, 0.92 + 0.16 * cmpNoise(CMP_ROT * vCmpPos * 700.0), cHair.z * (1.0 - smoothstep(0.25, 0.9, fwC * 500.0)));
  nc *= 1.0 - 0.35 * cWet;
  keep = clamp(keep, 0.0, 1.0);
  vec3 kc = c0;
  // truffe : couleur de la race (rose, noire, bleu-gris…), modelé gardé
  kc = mix(kc, cNoseC * (0.55 + 0.9 * lum0), noseK * (1.0 - pinkK * 0.5) * 0.85);
  diffuseColor.rgb = mix(nc, kc, keep);
}`;

// Relief du poil frisé et des plis de la peau nue : la normale penche selon la pente de la hauteur.
const BUMP_F = /* glsl */ `
if (cOn > 0.5 && cRole > 0.5 && (cHair.y > 0.0 || cHair.w > 0.0)) {
  float fade = 1.0 - smoothstep(0.25, 0.9, length(fwidth(vCmpPos)) * 150.0);
  float hh = (cHair.y * 0.0025 * catCurlH(vCmpPos) * (1.0 - vCmpPart.x) + cHair.w * 0.0012 * catWrinkleH(vCmpPos, vCmpPart)) * fade;
  vec2 dH = vec2(dFdx(hh), dFdy(hh));
  vec3 sx = dFdx(-vViewPosition);
  vec3 sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, normal);
  vec3 r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
  normal = normalize(abs(det) * normal - grad);
}`;

// Yeux : l'iris prend la couleur de la race (œil gauche cEyeL, droit cEyeR : yeux vairons), la pupille (texels
// sombres) et les reflets (très clairs, peu colorés) gardent la texture.
const EYE_F = /* glsl */ `
{
  vec3 c0 = diffuseColor.rgb;
  float lum0 = dot(c0, vec3(0.2126, 0.7152, 0.0722));
  vec3 hsv = cmpHsv(pow(clamp(c0, 0.0, 1.0), vec3(0.4545)));
  float pupil = 1.0 - smoothstep(0.025, 0.06, lum0);
  float glint = smoothstep(0.55, 0.8, lum0) * (1.0 - smoothstep(0.1, 0.3, hsv.y));
  vec3 iris = (vCmpPos.x > cMisc.x ? cEyeL : cEyeR);
  vec3 ic = iris * clamp(0.55 + 1.6 * lum0, 0.5, 1.45);
  diffuseColor.rgb = mix(ic, c0, clamp(max(pupil, glint), 0.0, 1.0));
}`;

const EYE_COMMON_F = /* glsl */ `
uniform vec3 cEyeL;
uniform vec3 cEyeR;
uniform vec4 cMisc;
varying vec3 vCmpPos;
vec3 cmpHsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}`;

/**
 * Matière d'un chat : pelage recoloré (role 'fur'), yeux (role 'eye' : iris recoloré), ou gardée telle quelle.
 * src : matière du GLB (sa texture de couleur, ses normales et son occlusion sont reprises) ; shared : uniformes du chat
 * (robe et repères) ; opts : { role, means (furLow), contrast (grain), keep: { pink, dark, spheres } }.
 */
export function catCoatMaterial(src, shared, opts) {
  const role = opts.role ?? 'fur';
  const mat = new THREE.MeshStandardMaterial({
    map: src?.map ?? null,
    normalMap: role === 'fur' ? src?.normalMap ?? null : null,
    aoMap: role === 'fur' ? src?.aoMap ?? null : null,
    aoMapIntensity: 0.8,
    roughness: role === 'eye' ? 0.12 : 0.85,
    metalness: 0,
    name: role === 'eye' ? 'cat_eye' : 'cat_coat',
  });
  if (mat.normalMap) mat.normalScale.set(0.8, 0.8);
  if (role === 'eye') {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { cEyeL: shared.cEyeL, cEyeR: shared.cEyeR, cMisc: shared.cMisc });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 cmpRest;\nvarying vec3 vCmpPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCmpPos = cmpRest;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${EYE_COMMON_F}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${EYE_F}`);
    };
    mat.customProgramCacheKey = () => 'cat-eye-v1';
    return mat;
  }
  const keep = opts.keep ?? {};
  const spheres = [...(keep.spheres ?? [])];
  while (spheres.length < MAX_KEEP) spheres.push({ s: new THREE.Vector4(0, 0, 0, 0), l: 0 });
  const own = {
    cRole: { value: role === 'keep' ? 0 : 1 },
    cTexMode: { value: opts.means ? 1 : 0 },
    cMeans: { value: new THREE.Vector3(opts.means?.lo ?? -3, opts.means?.hi ?? -1, opts.contrast ?? 1) },
    cKeepS: { value: spheres.slice(0, MAX_KEEP).map((x) => x.s) },
    cKeepL: { value: spheres.slice(0, MAX_KEEP).map((x) => x.l) },
    cKeepOpt: { value: new THREE.Vector4(keep.dark ?? 0, keep.pink ? 1 : 0, 0, 0) },
  };
  const uniforms = { ...shared, ...own };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON_V}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${REST_V}`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>\n${PUSH_V}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_F}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${COLOR_F}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${BUMP_F}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(roughnessFactor, 0.55, cHair.x), 0.45, cWet);');
  };
  mat.customProgramCacheKey = () => 'cat-coat-v1';
  return mat;
}

// ------------------------------------------------------------------ couches de poil (poil long, haute qualité)

const SHELL_F = /* glsl */ `
uniform float cShellK;
varying float vShellLen;
float shHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}`;

const SHELL_DISCARD_F = /* glsl */ `
{
  // mèches : un brin par cellule (2 mm), plus fin vers le bout ; pas de poil là où il est court
  vec3 cell = floor(vCmpPos * 520.0);
  float strand = shHash(cell);
  if (vShellLen < 0.0015 || strand < cShellK * 0.95 + 0.05) discard;
  diffuseColor.rgb *= 0.78 + 0.32 * cShellK;
}`;

/**
 * Matière d'une couche de poil (k de 0 à 1, de la peau au bout des poils) : celle du pelage (même robe, même grain),
 * poussée le long de la normale selon la longueur du poil à cet endroit (cFurMap), percée en brins.
 */
export function catShellMaterial(coatMat, shared, k, furMap) {
  const mat = coatMat.clone();
  mat.normalMap = null;
  mat.aoMap = null;
  const coatCompile = coatMat.onBeforeCompile;
  const own = { cShellK: { value: k }, cFurMap: { value: furMap } };
  mat.onBeforeCompile = (sh, r) => {
    coatCompile(sh, r);
    Object.assign(sh.uniforms, own);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float cShellK;\nuniform vec4 cFurMap;\nvarying float vShellLen;`)
      .replace('if (push != 0.0) transformed += objectNormal * (push / max(1e-6, length(objectNormal)));', `if (push != 0.0) transformed += objectNormal * (push / max(1e-6, length(objectNormal)));
  {
    float L2 = max(0.05, cLand.y - cLand.x);
    float u2 = (cmpRest.z - cLand.x) / L2;
    float face2 = cmpPart.z * (1.0 - cmpPart.x);
    float hz2 = (cmpRest.z - cHead.z) / max(0.02, cHead.w - cHead.z);
    float len = cFurMap.x * (1.0 - cmpPart.x) * (1.0 - face2 * smoothstep(0.1, 0.45, hz2));
    len *= 1.0 - 0.8 * cmpPart.w * (1.0 - smoothstep(0.02, 0.08, cmpRest.y));
    float ruff = (1.0 - cmpPart.w) * (1.0 - cmpPart.y) * smoothstep(0.75, 1.05, u2) * (1.0 - face2 * smoothstep(-0.2, 0.25, hz2));
    float br = cmpPart.w * (1.0 - smoothstep(-0.1, 0.25, u2)) * smoothstep(0.03, 0.07, cmpRest.y);
    len += cFurMap.y * ruff + cFurMap.z * br + cFurMap.w * cmpPart.y * smoothstep(0.05, 0.2, distance(cmpRest, cTailB.xyz) / cTailB.w);
    vShellLen = len;
    transformed += objectNormal * (len * cShellK / max(1e-6, length(objectNormal)));
  }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${SHELL_F}`)
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>\n${SHELL_DISCARD_F}`);
  };
  mat.customProgramCacheKey = () => 'cat-shell-v1';
  mat.side = THREE.FrontSide;
  return mat;
}

