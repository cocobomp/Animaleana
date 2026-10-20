// Robe et proportions des chats et lapins GLB (page « Chats et lapins ») : retouche des shaders des matières.
// Même principe que la page des chiens (src/compare/dogRecolor.js sur sa branche), adapté aux petits animaux.
//
// Robe. Le poil d'origine est ramené à un gris neutre qui garde son grain (poils peints, reflets) mais pas ses
// grandes taches : la luminance de chaque texel est rapportée à la moyenne de sa « classe » (poil sombre ou
// poil clair, mesurées sur la texture au chargement), moins sa moyenne locale sur la surface (attribut cmpLow).
// La nouvelle robe est ensuite peinte selon l'endroit du corps : position du sommet au repos dans le repère de
// l'animal (mètres, pattes à y = 0, regard vers +Z ; attribut cmpRest) et appartenance aux os (pattes,
// oreilles, queue, tête ; attributs cmpLeg et cmpPart). Les taches et rayures restent donc collées à la peau
// quand il bouge. Yeux, truffe et intérieur des oreilles gardent leur couleur (texels sombres de la tête,
// roses, verts, zones de la texture).
//
// Proportions (races). Avant le squelette, dans l'espace de liaison du maillage (le déplacement suit donc la
// peau dans toutes les poses) : museau raccourci (face plate du persan), poil gonflé le long de la peau
// (angora, persan), collerette (tête de lion, maine coon), queue plus épaisse. Après le squelette, dans le
// repère de l'animal : pattes raccourcies le long de leur axe et épaissies, tête plus grosse autour de son os,
// tronc plus long ou plus large ; l'animal descend de ce que ses pattes ont perdu (calculé sur le CPU, sans
// passer sous le sol). La même retouche est faite sur le matériau d'ombre : l'ombre suit la nouvelle silhouette.

import * as THREE from 'three';

export const PATTERN = { solid: 0, tabby: 1, tricolor: 2, points: 3, rosettes: 4, agouti: 5, pie: 6 };
const MAX_KEEP = 4;
const MAX_UV = 3;

/** Uniformes communs à toutes les matières d'un animal (robe, proportions, repères du corps). */
export function makePetUniforms() {
  return {
    cOn: { value: 0 }, // 0 : couleurs d'origine
    cPattern: { value: 0 },
    cBase: { value: new THREE.Color() },
    cTan: { value: new THREE.Color() },
    cWhite: { value: new THREE.Color(0xf2eee6) },
    // Repères au repos : z de la hanche et de l'épaule, hauteur du ventre et du dos.
    cLand: { value: new THREE.Vector4(-0.1, 0.1, 0.1, 0.25) },
    // Os de la tête au repos (x, y, z) et z du bout du nez.
    cHead: { value: new THREE.Vector4(0, 0.25, 0.15, 0.25) },
    // x du milieu du tronc, z du bout de la queue (au repos), x du bout du nez, demi-largeur de la tête.
    cMisc: { value: new THREE.Vector4(0, -0.3, 0, 0.04) },
    // Avant le squelette : museau (facteur, début en part de la tête), poil, collerette, queue (facteur, rayon).
    cMuz: { value: new THREE.Vector2(1, 0.55) },
    cFluff: { value: 0 },
    cRuff: { value: 0 },
    cTail: { value: new THREE.Vector2(1, 0.02) },
    cHairless: { value: 0 },
    // Après le squelette : proportions.
    cShape: { value: 0 },
    cLegK: { value: 1 },
    cLegT: { value: 1 },
    cGirth: { value: 1 },
    cBack: { value: 1 },
    cDrop: { value: new THREE.Vector2() },
    cHeadJ: { value: new THREE.Vector3() }, // os de la tête (position du moment, repère de l'animal)
    cHeadS: { value: 1 },
    cJ: { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) },
    cA: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(0, -1, 0)) },
    cL: { value: [0.1, 0.1, 0.1, 0.1] },
  };
}

const COMMON_V = /* glsl */ `
attribute vec3 cmpRest;
attribute vec4 cmpLeg;
attribute vec4 cmpPart;
attribute float cmpLow;
attribute float cmpRigid;
uniform mat4 cToPet;
uniform mat4 cFromPet;
uniform mat3 cRestToBind;
uniform mat3 cBindToRestN;
uniform vec2 cMuz;
uniform float cFluff;
uniform float cRuff;
uniform vec2 cTail;
uniform float cShape;
uniform float cLegK;
uniform float cLegT;
uniform float cGirth;
uniform float cBack;
uniform vec2 cDrop;
uniform vec3 cHeadJ;
uniform float cHeadS;
uniform vec3 cJ[4];
uniform vec3 cA[4];
uniform float cL[4];
uniform vec4 cLand;
uniform vec4 cHead;
uniform vec4 cMisc;
varying vec3 vCmpPos;
varying vec4 vCmpPart;
varying float vCmpLow;
varying float vCmpNy;
// Décalage le long du dos (allongement du tronc) d'un point de repos z : nul au milieu, constant au-delà
// des épaules et des hanches (pattes, encolure, tête et queue suivent sans se déformer).
float cmpBackOff(float z) {
  float a = cLand.x + 0.02;
  float b = cLand.y - 0.015;
  float m = 0.5 * (a + b);
  float t = clamp((z - a) / (b - a), 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  return (cBack - 1.0) * (mix(a, b, t) - m);
}`;

// Avant le squelette (espace de liaison) : museau, poil, collerette, queue.
const REST_V = /* glsl */ `
vCmpPos = cmpRest;
vCmpPart = cmpPart;
vCmpLow = cmpLow;
{
  vec3 nR = normalize(cBindToRestN * normal);
  vCmpNy = nR.y; // (normale de repos vers le haut ou vers le bas : ventre)
  vec3 dR = vec3(0.0);
  float headLen = max(0.02, cHead.w - cHead.z);
  float face = cmpPart.z * (1.0 - cmpPart.x);
  float zc = cHead.z + cMuz.y * headLen;
  if (cMuz.x != 1.0 && cmpRest.z > zc) dR.z += face * (zc + (cmpRest.z - zc) * cMuz.x - cmpRest.z);
  // (rien sur l'avant de la tête : yeux, moustaches et truffe garderaient sinon leur taille gonflée)
  float front = face * smoothstep(-0.05, 0.22, (cmpRest.z - cHead.z) / headLen);
  float legLow = cmpPart.w * (1.0 - smoothstep(0.0, cLand.z, cmpRest.y));
  float fl = cFluff * (1.0 - cmpPart.x) * (1.0 - 0.75 * legLow) * (1.0 - front) * (1.0 - 0.5 * cmpPart.y);
  // Collerette : un anneau autour de l'os de la tête (arrière du crâne, joues, gorge, encolure), pas sur
  // l'avant de la face, les oreilles ni les pattes ; plus épaisse sur les côtés.
  float dHead = distance(cmpRest, cHead.xyz) / headLen;
  float hz = (cmpRest.z - cHead.z) / headLen;
  float ruffZ = smoothstep(0.15, 0.45, dHead) * (1.0 - smoothstep(1.3, 1.9, dHead)) * (1.0 - smoothstep(0.02, 0.3, hz));
  float ruff = cRuff * ruffZ * (1.0 - cmpPart.x) * (1.0 - cmpPart.w) * (1.0 - cmpPart.y) * (0.6 + 0.4 * (1.0 - abs(nR.y)));
  float tailK = (cTail.x - 1.0) * cTail.y * cmpPart.y;
  // (pièces détachées — yeux, moustaches, dents — : jamais gonflées)
  if (fl != 0.0 || ruff != 0.0 || tailK != 0.0) dR += nR * (fl + ruff + tailK) * (1.0 - cmpRigid);
  transformed += cRestToBind * dR;
}`;

// Après le squelette (repère de l'animal) : pattes, tête, tronc, descente.
const SHAPE_V = /* glsl */ `
if (cShape > 0.5) {
  vec3 hp = (cToPet * vec4(transformed, 1.0)).xyz;
  float legSum = 0.0;
  for (int i = 0; i < 4; i++) {
    float w = cmpLeg[i];
    legSum += w;
    if (w > 0.0) {
      vec3 d = hp - cJ[i];
      float al = dot(d, cA[i]);
      vec3 perp = d - al * cA[i];
      float a2 = al <= 0.0 ? al : (al < cL[i] ? al * cLegK : cL[i] * cLegK + (al - cL[i]));
      hp += w * ((a2 - al) * cA[i] + (cLegT - 1.0) * perp * smoothstep(0.0, 0.015, al));
    }
  }
  legSum = min(legSum, 1.0);
  hp = mix(hp, cHeadJ + cHeadS * (hp - cHeadJ), cmpPart.z);
  float trunk = (1.0 - legSum) * (1.0 - cmpPart.y) * (1.0 - cmpPart.z)
    * smoothstep(cLand.x - 0.04, cLand.x + 0.01, cmpRest.z) * (1.0 - smoothstep(cLand.y + 0.01, cLand.y + 0.06, cmpRest.z));
  hp.x = cMisc.x + (hp.x - cMisc.x) * mix(1.0, cGirth, trunk);
  float front = cmpLeg.x + cmpLeg.y;
  float hind = cmpLeg.z + cmpLeg.w;
  hp.z += (1.0 - legSum) * cmpBackOff(cmpRest.z) + front * cmpBackOff(cLand.y + 1.0) + hind * cmpBackOff(cLand.x - 1.0);
  float tz = clamp((hp.z - cLand.x) / (cLand.y - cLand.x), -0.6, 1.6);
  hp.y -= mix(cDrop.x, cDrop.y, tz);
  transformed = (cFromPet * vec4(hp, 1.0)).xyz;
}`;

const COMMON_F = /* glsl */ `
uniform float cOn;
uniform float cPattern;
uniform vec3 cBase;
uniform vec3 cTan;
uniform vec3 cWhite;
uniform vec4 cLand;
uniform vec4 cHead;
uniform vec4 cMisc;
uniform float cRole;
uniform float cTexMode;
uniform vec3 cMeans;
uniform float cHairless;
uniform vec4 cKeepS[${MAX_KEEP}];
uniform float cKeepL[${MAX_KEEP}];
uniform vec4 cKeepUv[${MAX_UV}];
uniform vec4 cKeepOpt;
varying vec3 vCmpPos;
varying vec4 vCmpPart;
varying float vCmpLow;
varying float vCmpNy;
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
// Taches (bengal, pie) : x = intérieur de la tache la plus proche, y = son contour (rosette).
vec2 cmpSpots(vec3 p, float r0, float rv) {
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
// Couleur de la robe à un endroit du corps (repos).
vec3 cmpCoat(vec3 p, vec4 part) {
  float hipZ = cLand.x;
  float shZ = cLand.y;
  float bellyY = cLand.z;
  float topY = cLand.w;
  float L = max(0.05, shZ - hipZ);
  vec3 q = (p - vec3(cMisc.x, 0.0, hipZ)) / L; // coordonnées en longueurs de tronc
  float h = (p.y - bellyY) / max(0.02, topY - bellyY);
  float head = part.z;
  float ear = part.x;
  float tail = part.y;
  float legs = part.w;
  float headLen = max(0.02, cHead.w - cHead.z);
  float hz = (p.z - cHead.z) / headLen; // 0 : os de la tête, 1 : bout du nez
  float face = head * (1.0 - ear);
  float muzzle = face * smoothstep(0.5, 0.72, hz);
  float chin = face * (1.0 - smoothstep(cHead.y - 0.45 * headLen, cHead.y - 0.1 * headLen, p.y)) * smoothstep(0.1, 0.4, hz);
  float legLow = (1.0 - smoothstep(bellyY * 0.4, bellyY * 0.8, p.y)) * (1.0 - head) * (1.0 - tail);
  float trunk = (1.0 - head) * (1.0 - tail);
  float u = (p.z - hipZ) / L;
  // (sous le tronc seulement : les cuisses du lapin accroupi descendent plus bas que le ventre)
  float belly = trunk * (1.0 - legs * 0.5) * (1.0 - smoothstep(0.02, 0.26, h)) * smoothstep(-0.1, 0.2, u) * (1.0 - smoothstep(1.05, 1.4, u))
    * mix(1.0, 1.0 - smoothstep(-0.45, 0.2, vCmpNy), 0.8); // (surtout ce qui regarde vers le bas)
  float tailD = length(vec2(p.y - topY * 0.9, p.z - hipZ)) / L; // distance à la racine de la queue
  // Queue bien derrière les hanches (les poids de la queue débordent parfois sur la croupe).
  float tailZone = smoothstep(0.5, 0.9, tail) * (1.0 - smoothstep(hipZ - 0.45 * L, hipZ - 0.2 * L, p.z));
  float n1 = cmpNoise(q * 4.0);
  float n2 = cmpNoise(q * 11.0 + 5.0);
  if (cPattern < 0.5) return cBase;
  if (cPattern < 1.5) {
    // Tigré (mackerel) : rayures en travers du corps, anneaux aux pattes et à la queue, lignes sur le front,
    // raie sombre sur le dos ; ventre, menton et babines plus clairs.
    float warp = n1 * 0.9 + n2 * 0.25;
    float body = sin((q.z * 7.0 + warp * 0.9 + 0.35 * h) * 6.2832);
    float ring = sin((q.y * 9.0 + warp * 0.6) * 6.2832);
    float tring = sin((tailD * 7.0 + n2 * 0.3) * 6.2832);
    float brow = sin(((p.x - cMisc.z) / max(0.01, cMisc.w) * 2.2 + n2 * 0.4) * 3.1416);
    float s = mix(body, ring, legs);
    s = mix(s, tring, tail);
    s = mix(s, brow * step(cHead.y, p.y) - 0.6 * (1.0 - step(cHead.y, p.y)) + 0.0, face * (1.0 - smoothstep(0.35, 0.55, hz)));
    float stripe = smoothstep(0.3, 0.8, s + (n2 - 0.5) * 0.6) * (0.55 + 0.45 * n1) * (1.0 - (1.0 - smoothstep(0.0, 0.3, h)) * trunk * (1.0 - legs) * 0.7);
    stripe = max(stripe * (1.0 - muzzle) * (1.0 - chin), trunk * (1.0 - legs) * smoothstep(0.86, 0.97, h) * (1.0 - smoothstep(0.03, 0.07, abs(q.x))));
    stripe = max(stripe, tail * smoothstep(0.85, 1.0, tailD * 0.85));
    vec3 c = mix(cBase, cTan, stripe * 0.85);
    float light = max(belly * (1.0 - legs) * 0.75, max(chin * 0.8, muzzle * 0.5));
    return mix(c, cWhite, light);
  }
  if (cPattern < 2.5) {
    // Tricolore (calico) : blanc au ventre, au poitrail, aux pattes, au museau et au menton ; grandes plaques
    // rousses et noires ailleurs.
    float edge = (n1 - 0.5) * 0.25 + (n2 - 0.5) * 0.08;
    float chest = trunk * smoothstep(0.75, 0.95, q.z + edge) * (1.0 - smoothstep(0.35, 0.65, h + edge));
    float white = max(max(belly * smoothstep(-0.1, 0.1, 0.35 - h + edge), legLow), max(chest, max(muzzle, chin)));
    white = max(white, legs * (1.0 - smoothstep(0.3, 0.7, h + 0.4 + edge)));
    float blot = cmpNoise(q * 2.3 + vec3(3.0, 1.0, 7.0)) + 0.4 * cmpNoise(q * 5.5);
    vec3 c = mix(cTan, cBase, smoothstep(0.66, 0.74, blot));
    return mix(c, cWhite, smoothstep(0.4, 0.6, white + edge));
  }
  if (cPattern < 3.5) {
    // Colourpoint (siamois) : corps crème, un peu plus foncé sur le dos ; masque, oreilles, bas des pattes et
    // queue foncés, avec un dégradé.
    float mask = face * smoothstep(0.15, 0.6, hz + (n2 - 0.5) * 0.15) * (1.0 - 0.35 * smoothstep(cHead.y + 0.3 * headLen, cHead.y + 0.6 * headLen, p.y));
    float pts = max(ear, mask);
    pts = max(pts, legs * (1.0 - smoothstep(bellyY * 0.2, bellyY * 1.1, p.y)));
    pts = max(pts, tail * smoothstep(0.25, 0.9, tailD));
    vec3 body = mix(cWhite, mix(cWhite, cBase, 0.22), smoothstep(0.5, 1.0, h) * trunk);
    return mix(body, cBase, smoothstep(0.15, 0.85, pts));
  }
  if (cPattern < 4.5) {
    // Tacheté bengal : fond doré, rosettes (contour sombre, cœur roux) sur le corps, petites taches aux pattes
    // et à la tête, anneaux et bout noir à la queue ; ventre crème tacheté.
    float small = max(face, legs);
    vec2 sp = cmpSpots(q * mix(5.5, 10.0, small) + vec3(3.1, 1.7, 0.0), 0.3, 0.12);
    float tring = smoothstep(0.55, 0.85, sin(tailD * 6.0 * 6.2832) * 0.5 + 0.5) * smoothstep(0.3, 0.6, tailD);
    vec3 ground = mix(cBase, cWhite, max(belly * 0.85, max(chin, muzzle * 0.7)));
    vec3 core = mix(cBase, cTan, 0.45);
    vec3 c = mix(ground, core, sp.x * (1.0 - small) * (1.0 - tail));
    float dark = max(sp.y * (1.0 - small), sp.x * small * (1.0 - muzzle));
    dark = mix(dark, max(tring, smoothstep(0.85, 1.0, tailD * 0.85)), tail);
    return mix(c, cTan, dark * 0.95);
  }
  if (cPattern < 5.5) {
    // Agouti (lapin) : poils tiquetés (pointe sombre), dos plus foncé, ventre, menton et dessous de la queue
    // clairs, bord des oreilles foncé.
    float tick = cmpNoise(p / L * 70.0) * 0.6 + cmpNoise(p / L * 140.0) * 0.4;
    vec3 c = mix(cBase, cTan, smoothstep(0.5, 0.85, tick) * 0.55 + smoothstep(0.55, 1.0, h) * trunk * 0.25);
    c = mix(c, cTan, ear * 0.3);
    float light = max(belly * (1.0 - legs * 0.6), max(chin * 0.85, tailZone * smoothstep(0.2, 0.6, 0.6 - h)));
    return mix(c, cWhite, light * 0.9);
  }
  // Pie (lapin) : fond blanc ; oreilles, tour des yeux, « papillon » sur le nez, raie du dos et chaîne de
  // taches sur les flancs foncés.
  float dark = ear;
  float hw = max(0.01, cMisc.w);
  vec3 eyeP = vec3(cMisc.x + sign(p.x - cMisc.x) * hw * 0.78, cHead.y + 0.12 * headLen, cHead.z + 0.42 * headLen);
  dark = max(dark, face * (1.0 - smoothstep(0.22 * headLen, 0.3 * headLen, distance(p, eyeP))));
  float wing = face * smoothstep(0.6, 0.7, hz) * (1.0 - smoothstep(hw * 0.45, hw * 0.6, abs(p.x - cMisc.z) - (hz - 0.6) * hw * 0.8)) * step(cHead.y - 0.15 * headLen, p.y);
  dark = max(dark, wing);
  float spine = trunk * smoothstep(0.82, 0.92, h + (n2 - 0.5) * 0.12) * (1.0 - smoothstep(0.05, 0.09, abs(q.x) + (n2 - 0.5) * 0.04));
  vec2 sp = cmpSpots(q * 4.5 + vec3(0.0, 2.0, 0.0), 0.22, 0.12);
  float side = trunk * (1.0 - legs) * smoothstep(0.25, 0.4, h) * (1.0 - smoothstep(0.7, 0.85, h)) * sp.x;
  dark = max(dark, max(spine, max(side, tailZone * smoothstep(0.3, 0.6, h))));
  return mix(cWhite, cBase, smoothstep(0.35, 0.65, dark));
}`;

const COLOR_F = /* glsl */ `
vec3 cmpEm = vec3(-1.0);
if (cOn > 0.5) {
  vec3 c0 = diffuseColor.rgb;
  vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
  float lum0 = dot(c0, LUM);
  vec3 hsv = cmpHsv(pow(clamp(c0, 0.0, 1.0), vec3(0.4545)));
  float keep = 1.0 - cRole;
  // Yeux peints : texels très sombres de la tête.
  if (cKeepOpt.x > 0.0) keep = max(keep, vCmpPart.z * (1.0 - vCmpPart.x) * (1.0 - smoothstep(cKeepOpt.x * 0.6, cKeepOpt.x, lum0)));
  for (int i = 0; i < ${MAX_KEEP}; i++) {
    vec4 s = cKeepS[i];
    if (s.w > 0.0) {
      float inS = 1.0 - smoothstep(s.w * 0.65, s.w, distance(vCmpPos, s.xyz));
      keep = max(keep, inS * (1.0 - smoothstep(cKeepL[i] * 0.5, cKeepL[i], lum0)));
    }
  }
  // Truffe, lèvres et intérieur des oreilles roses (tête seulement).
  if (cKeepOpt.y > 0.0) {
    float dh = abs(fract(hsv.x - 0.99 + 0.5) - 0.5);
    keep = max(keep, vCmpPart.z * (1.0 - smoothstep(0.035, 0.065, dh)) * smoothstep(0.18, 0.32, hsv.y) * smoothstep(0.25, 0.4, hsv.z));
  }
  // Yeux verts peints.
  if (cKeepOpt.z > 0.0) {
    float dh = abs(fract(hsv.x - 0.3 + 0.5) - 0.5);
    keep = max(keep, vCmpPart.z * (1.0 - smoothstep(0.08, 0.12, dh)) * smoothstep(0.25, 0.4, hsv.y));
  }
  #ifdef USE_MAP
  for (int i = 0; i < ${MAX_UV}; i++) {
    vec4 r = cKeepUv[i];
    if (r.z > r.x && vMapUv.x >= r.x && vMapUv.x <= r.z && vMapUv.y >= r.y && vMapUv.y <= r.w) keep = 1.0;
  }
  #endif
  float detail = 1.0;
  if (cTexMode > 0.5) {
    float ll = log(max(lum0, 1e-3));
    float w = smoothstep(cMeans.x + 0.15 * (cMeans.y - cMeans.x), cMeans.x + 0.85 * (cMeans.y - cMeans.x), ll);
    float nl = ll - mix(cMeans.x, cMeans.y, w);
    detail = exp(clamp((nl - vCmpLow) * cMeans.z + vCmpLow * 0.12, -0.9, 0.45));
    detail = mix(detail, 1.0, cHairless * 0.8);
  }
  vec3 coat = cmpCoat(vCmpPos, vCmpPart);
  float l = dot(coat, LUM);
  detail = mix(detail, sqrt(detail), smoothstep(0.3, 0.8, l));
  vec3 nc = min(coat * detail, vec3(1.0));
  keep = clamp(keep, 0.0, 1.0);
  diffuseColor.rgb = mix(nc, c0, keep);
  cmpEm = mix(nc, vec3(-1.0), step(0.5, keep));
}`;

// Matière à texture « émissive » (copie de la couleur) : la nouvelle robe remplace aussi cette lumière.
const EMISSIVE_F = /* glsl */ `
if (cmpEm.x >= 0.0) totalEmissiveRadiance = emissive * cmpEm;`;

const _v = new THREE.Vector3();

/**
 * Position de repos de chaque sommet dans le repère de l'animal (attribut cmpRest) : peau appliquée avec le
 * squelette au repos (les GLB compressés ont des positions quantifiées que seul le squelette remet à l'échelle).
 */
export function restPositions(mesh, toPet) {
  const pos = mesh.geometry.attributes.position;
  const rest = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    mesh.getVertexPosition(i, _v).applyMatrix4(toPet);
    rest[i * 3] = _v.x;
    rest[i * 3 + 1] = _v.y;
    rest[i * 3 + 2] = _v.z;
  }
  const attr = new THREE.BufferAttribute(rest, 3);
  mesh.geometry.setAttribute('cmpRest', attr);
  return attr;
}

/**
 * Passage de l'espace de liaison du maillage (position avant le squelette) au repère de l'animal, au repos :
 * matrice 4×4 A (même pour tous les sommets : au repos, chaque os vaut la même matrice de déquantification).
 * Sert à convertir dans l'espace de liaison les déplacements calculés dans le repère de l'animal.
 */
export function bindToPet(mesh, toPet) {
  if (!mesh.isSkinnedMesh) return toPet.clone();
  const sk = mesh.skeleton;
  const b = sk.bones[0];
  b.updateWorldMatrix(true, false);
  const B = new THREE.Matrix4().multiplyMatrices(b.matrixWorld, sk.boneInverses[0]);
  return new THREE.Matrix4().multiplyMatrices(toPet, mesh.matrixWorld)
    .multiply(mesh.bindMatrixInverse).multiply(B).multiply(mesh.bindMatrix);
}

/**
 * Appartenance de chaque sommet aux pattes (cmpLeg : avant gauche, avant droite, arrière gauche, arrière
 * droite) et aux oreilles, à la queue, à la tête, aux pattes (cmpPart), d'après les poids du squelette.
 * sets : { legs: [Set d'os ×4], ear: Set, tail: Set, head: Set }.
 */
export function partWeights(mesh, sets) {
  const g = mesh.geometry;
  const n = g.attributes.position.count;
  const leg = new Float32Array(n * 4);
  const part = new Float32Array(n * 4);
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  if (mesh.isSkinnedMesh && si && sw) {
    const bones = mesh.skeleton.bones;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (!w) continue;
        const b = bones[si.getComponent(i, k)];
        for (let l = 0; l < 4; l++) if (sets.legs[l].has(b)) leg[i * 4 + l] += w;
        if (sets.ear.has(b)) part[i * 4] += w;
        if (sets.tail.has(b)) part[i * 4 + 1] += w;
        if (sets.head.has(b)) part[i * 4 + 2] += w;
      }
    }
  }
  g.setAttribute('cmpLeg', new THREE.BufferAttribute(leg, 4));
  for (let i = 0; i < n; i++) part[i * 4 + 3] = Math.min(1, leg[i * 4] + leg[i * 4 + 1] + leg[i * 4 + 2] + leg[i * 4 + 3]);
  g.setAttribute('cmpPart', new THREE.BufferAttribute(part, 4));
  return { leg, part };
}

/**
 * Pièces détachées d'un maillage (yeux, moustaches, dents, cils : petits morceaux qui ne touchent pas le
 * corps) : attribut cmpRigid = 1. Le poil gonflé des races ne les déplace pas (sinon une moustache devient une
 * lame, un œil une bille). all : tout le maillage (matière gardée telle quelle : yeux à part).
 */
export function rigidPieces(mesh, rest, all = false) {
  const g = mesh.geometry;
  const n = g.attributes.position.count;
  const rigid = new Float32Array(n);
  g.setAttribute('cmpRigid', new THREE.BufferAttribute(rigid, 1));
  if (all) {
    rigid.fill(1);
    return;
  }
  // Sommets soudés par position (½ mm), puis morceaux reliés par les arêtes des triangles.
  const key = new Map();
  const grp = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(rest.getX(i) * 2000)},${Math.round(rest.getY(i) * 2000)},${Math.round(rest.getZ(i) * 2000)}`;
    let id = key.get(k);
    if (id === undefined) {
      id = key.size;
      key.set(k, id);
    }
    grp[i] = id;
  }
  const up = new Int32Array(key.size).map((_, i) => i);
  const find = (a) => {
    while (up[a] !== a) {
      up[a] = up[up[a]];
      a = up[a];
    }
    return a;
  };
  const idx = g.index;
  const tri = idx ? idx.count / 3 : n / 3;
  for (let t = 0; t < tri; t++) {
    const a = find(grp[idx ? idx.getX(t * 3) : t * 3]);
    const b = find(grp[idx ? idx.getX(t * 3 + 1) : t * 3 + 1]);
    const c = find(grp[idx ? idx.getX(t * 3 + 2) : t * 3 + 2]);
    up[b] = a;
    up[find(c)] = a;
  }
  const count = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(grp[i]);
    count.set(r, (count.get(r) ?? 0) + 1);
  }
  let big = -1;
  let bigN = 0;
  for (const [r, c] of count) {
    if (c > bigN) {
      bigN = c;
      big = r;
    }
  }
  const lim = Math.max(12, n * 0.05);
  for (let i = 0; i < n; i++) {
    const r = find(grp[i]);
    if (r !== big && count.get(r) < lim) rigid[i] = 1;
  }
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Grain du poil peint dans la texture, sans les taches de la robe d'origine (calculé une fois au chargement,
 * comme pour les chiens). La luminance (log) est rapportée à la moyenne de sa « classe » (poil sombre ou poil
 * clair : deux moyennes, k-moyennes à une dimension). Ce qui reste de grandes variations est mesuré sur la
 * surface même de l'animal (valeur à chaque sommet, lissée de proche en proche sur le maillage, sommets soudés
 * par position) : le shader retire cette moyenne locale (attribut cmpLow). Renvoie { lo, hi } ou null.
 */
export function furLow(mesh, rest, opts = {}) {
  const g = mesh.geometry;
  const n = g.attributes.position.count;
  const low = new Float32Array(n);
  g.setAttribute('cmpLow', new THREE.BufferAttribute(low, 1));
  const img = mesh.material.map?.image;
  const uv = g.attributes.uv;
  if (!img || !uv || typeof document === 'undefined') return null;
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, S, S);
  const px = ctx.getImageData(0, 0, S, S).data;
  const c = new THREE.Color();
  const ll = new Float32Array(n);
  const sample = (u, v) => {
    const x = Math.min(S - 1, Math.max(0, Math.floor((u - Math.floor(u)) * S)));
    const y = Math.min(S - 1, Math.max(0, Math.floor((v - Math.floor(v)) * S))); // (flipY = false dans glTF)
    const o = (y * S + x) * 4;
    c.setRGB(px[o] / 255, px[o + 1] / 255, px[o + 2] / 255, THREE.SRGBColorSpace);
    return Math.log(Math.max(1e-3, c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722));
  };
  for (let i = 0; i < n; i++) ll[i] = sample(uv.getX(i), uv.getY(i));
  const vals = Array.from(ll).sort((a, b) => a - b);
  let lo = vals[Math.floor(n * 0.2)];
  let hi = vals[Math.floor(n * 0.8)];
  for (let it = 0; it < 12; it++) {
    let s0 = 0;
    let n0 = 0;
    let s1 = 0;
    let n1 = 0;
    const mid = (lo + hi) / 2;
    for (const x of vals) {
      if (x < mid) {
        s0 += x;
        n0++;
      } else {
        s1 += x;
        n1++;
      }
    }
    if (n0) lo = s0 / n0;
    if (n1) hi = s1 / n1;
  }
  if (opts.classes === false) lo = hi = vals[Math.floor(n / 2)];
  const key = new Map();
  const grp = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(rest.getX(i) * 2000)},${Math.round(rest.getY(i) * 2000)},${Math.round(rest.getZ(i) * 2000)}`;
    let id = key.get(k);
    if (id === undefined) {
      id = key.size;
      key.set(k, id);
    }
    grp[i] = id;
  }
  const G = key.size;
  const val = new Float32Array(G);
  const cnt = new Float32Array(G);
  for (let i = 0; i < n; i++) {
    const w = smooth(lo + 0.15 * (hi - lo), lo + 0.85 * (hi - lo), ll[i]);
    val[grp[i]] += ll[i] - (lo + (hi - lo) * w);
    cnt[grp[i]]++;
  }
  for (let k = 0; k < G; k++) val[k] /= cnt[k] || 1;
  const idx = g.index;
  const tri = idx ? idx.count / 3 : n / 3;
  const ea = new Int32Array(tri * 3);
  const eb = new Int32Array(tri * 3);
  for (let t = 0; t < tri; t++) {
    const a = grp[idx ? idx.getX(t * 3) : t * 3];
    const b = grp[idx ? idx.getX(t * 3 + 1) : t * 3 + 1];
    const d = grp[idx ? idx.getX(t * 3 + 2) : t * 3 + 2];
    ea[t * 3] = a;
    eb[t * 3] = b;
    ea[t * 3 + 1] = b;
    eb[t * 3 + 1] = d;
    ea[t * 3 + 2] = d;
    eb[t * 3 + 2] = a;
  }
  const sum = new Float32Array(G);
  const deg = new Float32Array(G);
  const iters = opts.iterations ?? 40;
  for (let it = 0; it < iters; it++) {
    sum.fill(0);
    deg.fill(0);
    for (let e = 0; e < ea.length; e++) {
      sum[ea[e]] += val[eb[e]];
      deg[ea[e]]++;
      sum[eb[e]] += val[ea[e]];
      deg[eb[e]]++;
    }
    for (let k = 0; k < G; k++) if (deg[k]) val[k] = 0.5 * val[k] + 0.5 * (sum[k] / deg[k]);
  }
  for (let i = 0; i < n; i++) low[i] = val[grp[i]];
  return { lo, hi };
}

/**
 * Prépare un maillage : matériau recoloré et matériau d'ombre qui suivent les proportions.
 * toPet : maillage → repère de l'animal (au repos) ; bind : espace de liaison → repère de l'animal (bindToPet).
 * shared : makePetUniforms(). opts : { role ('fur' | 'keep'), detail (furLow : { lo, hi } ou null), contrast
 * (grain), keep (réglages du candidat), spheres ([{ s: Vector4 centre au repos et rayon, l: luminance }]) }.
 */
export function patchPetMesh(mesh, toPet, bind, shared, opts) {
  const keep = opts.keep ?? {};
  const spheres = [...(opts.spheres ?? [])];
  while (spheres.length < MAX_KEEP) spheres.push({ s: new THREE.Vector4(0, 0, 0, 0), l: 0 });
  const uvs = (keep.uv ?? []).map((r) => new THREE.Vector4(...r));
  while (uvs.length < MAX_UV) uvs.push(new THREE.Vector4(0, 0, 0, 0));
  const b3 = new THREE.Matrix3().setFromMatrix4(bind);
  const own = {
    cToPet: { value: toPet.clone() },
    cFromPet: { value: toPet.clone().invert() },
    cRestToBind: { value: b3.clone().invert() },
    cBindToRestN: { value: b3.clone().invert().transpose() },
    cRole: { value: opts.role === 'keep' ? 0 : 1 },
    cTexMode: { value: opts.detail ? 1 : 0 },
    cMeans: { value: new THREE.Vector3(opts.detail?.lo ?? -3, opts.detail?.hi ?? -1, opts.contrast ?? 1) },
    cKeepS: { value: spheres.slice(0, MAX_KEEP).map((x) => x.s) },
    cKeepL: { value: spheres.slice(0, MAX_KEEP).map((x) => x.l) },
    cKeepUv: { value: uvs.slice(0, MAX_UV) },
    cKeepOpt: { value: new THREE.Vector4(keep.dark ?? 0, keep.pink ? 1 : 0, keep.green ? 1 : 0, 0) },
  };
  const uniforms = { ...shared, ...own };
  const mat = mesh.material;
  const vert = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON_V}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${REST_V}`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>\n${SHAPE_V}`);
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    vert(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_F}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${COLOR_F}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${EMISSIVE_F}`);
  };
  mat.customProgramCacheKey = () => 'cmp-pet';
  mat.needsUpdate = true;

  // Ombre : même retouche des proportions (la découpe des cartes de poils est gardée).
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  if (mat.alphaTest > 0 && mat.map) {
    depth.map = mat.map;
    depth.alphaTest = mat.alphaTest;
  }
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    vert(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCmpPos;\nvarying vec4 vCmpPart;\nvarying float vCmpLow;\nvarying float vCmpNy;');
  };
  depth.customProgramCacheKey = () => `cmp-pet-depth${depth.map ? '-a' : ''}`;
  mesh.customDepthMaterial = depth;
  return own;
}
