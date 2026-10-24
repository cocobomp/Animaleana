// Toison et robe du mouton réaliste (sheepReal.js), peintes par le shader de sa matière.
//
// Le GLB porte quatre masques par sommet (tools/mouton/wool.py), réunis ici en un attribut sheepMask : x = toison
// (1) ou peau nue (0), y = tête et oreilles, z = bas des membres, w = onglons. La texture d'origine (une photo de
// toison blanche, face blanche, pattes brunes) ne garde que son grain : chaque texel est rapporté à la luminance
// moyenne de sa région (sMeans), puis multiplié par la couleur voulue — laine de la robe, tête et pattes de la race
// (noires du suffolk, face nue blanche du cheviot…), onglons. Yeux gardés (texels très sombres de la tête), truffe rose
// des faces claires gardée.
// Par-dessus : laine bouclée (relief de petites boucles serrées, nez noir du Valais, agneaux), mèches de la laine
// longue (islandais : la toison du bas pend en jupe, déplacée dans le shader avant le squelette), laine du front
// (mérinos), genoux, jarrets et pieds noirs (nez noir), laine tondue (grain adouci, un peu plus claire).
// La matière garde son shader quand on la clone (Beauty.js : robe lustrée) : uniformes partagés, defines, clé.

import * as THREE from 'three';
import { addSelfShadow, SELF_SHADOW_GAP } from './ruminantShadow.js';

/** Uniformes d'un mouton (partagés par sa matière, son ombre et leurs clones). */
export function makeSheepUniforms() {
  return {
    sWool: { value: new THREE.Color(0xeee6d6) },
    sFace: { value: new THREE.Color(0xe8dccb) },
    sLeg: { value: new THREE.Color(0xe2d6c4) },
    sHoof: { value: new THREE.Color(0x3a302a) },
    // x : laine bouclée, y : mèches (laine longue), z : laine du front, w : laine du haut des pattes
    sWoolK: { value: new THREE.Vector4(0, 0, 0, 0) },
    // x : laine tondue (0 à 1, couleur et grain), y : genoux noirs, z : longueur de la laine longue (m), w : couché (0 à 1)
    sState: { value: new THREE.Vector4(0, 0, 0, 0) },
    // luminance moyenne de la texture : laine, tête, pattes (grain = texel ÷ moyenne)
    sMeans: { value: new THREE.Vector3(0.5, 0.55, 0.3) },
    // repères de repos : x ventre, y dos (hauteurs), z hanches, w épaules (en long)
    sLand: { value: new THREE.Vector4(0.3, 0.7, 0.35, -0.25) },
    // genou (carpe), jarret, boulet (hauteurs de repos), w : limite avant / arrière (en long)
    sKnee: { value: new THREE.Vector4(0.2, 0.25, 0.08, 0) },
    // tête : x en long des yeux, y hauteur des yeux, z bout du nez (en long), w hauteur du dessus du crâne
    sHead: { value: new THREE.Vector4(0.4, 0.62, 0.48, 0.7) },
    // volume de la toison (gonflée le long de la normale, avant le squelette) : x épaisseur du moment (m), y plis du cou
    // (m, mérinos), z bosses (0 à 1), w fréquence des bosses (1/m)
    sPuff: { value: new THREE.Vector4(0, 0, 0, 9) },
    // œil gauche au repos (x > 0 ; le droit en miroir) : centre et rayon
    sEye: { value: new THREE.Vector4(0.06, 0.76, 0.385, 0.009) },
    // x : toupet blanc bouclé du front (nez noir), y : œil dessiné sur une face sombre (iris ambre, paupière claire)
    sTuft: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
}

/** Couleurs et réglages d'une race (sheepBuild, src/sim/sheepLook.js) dans les uniformes. */
export function setSheepCoat(u, B) {
  const c = B.colors;
  u.sWool.value.setHex(c.wool);
  u.sFace.value.setHex(c.face);
  u.sLeg.value.setHex(c.leg);
  u.sHoof.value.setHex(c.hoof);
  u.sWoolK.value.set(B.curl ?? 0, B.long > 0 ? 1 : 0, B.headWool ?? 0, B.legWool ?? 0);
  u.sState.value.y = B.knees ? 1 : 0;
  u.sState.value.z = (B.long ?? 0) * 0.3; // (la jupe du shader ne fait plus que du volume sous les mèches, ruminantHair.js)
  // (épaisseur du moment : posée par RealSheepAnim.applyFleece selon la toison ; ici, plis, bosses et fréquence)
  u.sPuff.value.set(u.sPuff.value.x, B.folds ?? 0, B.lumps ?? 0.3, B.lumpFreq ?? 9);
  const f = u.sFace.value;
  const faceLum = 0.2126 * f.r + 0.7152 * f.g + 0.0722 * f.b;
  u.sTuft.value.set(B.forelock ?? 0, 1 - THREE.MathUtils.smoothstep(faceLum, 0.05, 0.25), 0, 0);
}

const COMMON_V = /* glsl */ `
attribute vec4 sheepMask;
attribute float sheepTrunk;
attribute vec3 sheepPuffN;
attribute float sheepPuffW;
attribute float sheepEar;
uniform vec4 sState;
uniform vec4 sLand;
uniform vec4 sHead;
uniform vec4 sPuff;
uniform vec4 sTuft;
varying vec4 vSMask;
varying vec3 vSRest;
float sHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
// (bosses lisses et identiques sur le processeur, sheepReal.js puffAt : le mouton couché est posé sur sa toison)
float sNoiseV(vec3 p) {
  return 0.5 + 0.25 * (sin(dot(p, vec3(1.0, 1.7, 1.3)) + 1.3) + sin(dot(p, vec3(-1.4, 0.9, 1.1)) * 1.31 + 4.1));
}
`;

// Avant le squelette (après la cible de forme) : position de repos pour les motifs ; laine longue qui pend.
const BEGIN_V = /* glsl */ `
vSMask = sheepMask;
vSRest = position;`;
const LONG_V = /* glsl */ `
if (sState.z > 0.0) {
  // Laine longue : la toison du tronc pend, plus bas sous le ventre et sur les flancs qu'au dos ; mèches de longueurs
  // inégales (graine du sommet). Ni la tête, ni le bas des pattes, ni le dos.
  float h = (position.y - sLand.x) / max(0.02, sLand.y - sLand.x);
  // (sheepTrunk : part du sommet portée par les os du tronc ; la laine d'un membre qui se lève ne pend pas en drapeau)
  float trunk = smoothstep(0.35, 0.8, sheepMask.x) * (1.0 - sheepMask.y) * (1.0 - sheepMask.z) * smoothstep(0.55, 0.95, sheepTrunk);
  float skirt = 1.0 - smoothstep(-0.2, 1.05, h);
  // (mèches de longueurs inégales, d'un sommet à l'autre : le bas de la toison s'effrange)
  float len = sState.z * trunk * (0.3 + 0.7 * skirt) * (0.55 + 0.9 * sHash(floor(position * 45.0)));
  // (vers le bas, un peu vers l'extérieur sur les côtés)
  // (tondue : plus de mèches ; couché : la laine s'étale au sol au lieu de pendre)
  transformed += vec3(sign(position.x) * len * 0.3 * skirt, -len * (0.25 + 0.75 * skirt) * (1.0 - 0.7 * sState.w), 0.0) * (1.0 - sState.x);
}
if (sPuff.x > 0.0 || sPuff.y > 0.0) {
  // Volume de la toison : le tronc et l'encolure (pas la tête, ni le bas des pattes, ni le creux de l'aisselle, porté par
  // le membre) gonflent le long de la normale de repos, en grosses bosses ; plis du cou du mérinos (anneaux).
  // (part du volume, lissée sur 9 cm par sheepReal.js puffWeights : pente douce vers l'épaule et la cuisse)
  float pm = sheepPuffW;
  float lump = 1.0 + sPuff.z * (sNoiseV(position * sPuff.w) * 2.0 - 1.0);
  float neckZ = smoothstep(sLand.w - 0.02, sLand.w + 0.07, position.z) * (1.0 - smoothstep(sHead.x - 0.21, sHead.x - 0.13, position.z));
  float fold = sPuff.y * neckZ * (0.5 + 0.5 * sin(position.z * 105.0));
  // (dessous du ventre : gonflé à moitié — le gabarit y a peu de sommets, et la toison poussée tout droit vers le bas en
  // faisait un ventre en facettes droites, vu du bas et au galop)
  float under = 1.0 - 0.5 * smoothstep(0.35, 0.9, -sheepPuffN.y);
  transformed += sheepPuffN * (sPuff.x * lump * under + fold) * pm;
}
if (sTuft.x > 0.0) {
  // Toupet du front (nez noir) : une touffe de laine bouclée entre les cornes, au-dessus des yeux.
  float tz = smoothstep(sHead.y + 0.008, sHead.y + 0.03, position.y) * (1.0 - smoothstep(0.03, 0.055, abs(position.x)))
    * (1.0 - smoothstep(sHead.x + 0.005, sHead.x + 0.04, position.z)) * smoothstep(sHead.x - 0.11, sHead.x - 0.07, position.z);
  transformed += normal * 0.022 * sTuft.x * tz * smoothstep(0.3, 0.7, sheepMask.y) * (0.55 + 0.9 * sNoiseV(position * 60.0));
}`;

const COMMON_F = /* glsl */ `
uniform vec3 sWool;
uniform vec3 sFace;
uniform vec3 sLeg;
uniform vec3 sHoof;
uniform vec4 sWoolK;
uniform vec4 sState;
uniform vec3 sMeans;
uniform vec4 sLand;
uniform vec4 sKnee;
uniform vec4 sHead;
uniform vec4 sEye;
uniform vec4 sTuft;
varying vec4 vSMask;
varying vec3 vSRest;
float sHashF(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float sNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sHashF(i), sHashF(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(sHashF(i + vec3(0.0, 1.0, 0.0)), sHashF(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(sHashF(i + vec3(0.0, 0.0, 1.0)), sHashF(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(sHashF(i + vec3(0.0, 1.0, 1.0)), sHashF(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
// Boucles rondes et serrées (cellules de 1,5 à 2 cm) : 1 sur la bosse, 0 au creux.
float sCurls(vec3 p) {
  vec3 q = p * 55.0;
  vec3 i = floor(q);
  vec3 f = fract(q);
  float d = 9.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 c = i + g;
    vec3 o = vec3(sHashF(c), sHashF(c + 17.31), sHashF(c + 41.7));
    d = min(d, length(g + o - f));
  }
  return 1.0 - smoothstep(0.15, 0.75, d);
}
// Mèches qui pendent (laine longue) : étirées vers le bas.
float sLocks(vec3 p) {
  return sNoise(vec3(p.x * 55.0, p.y * 7.0, p.z * 55.0)) * 0.7 + sNoise(vec3(p.x * 120.0, p.y * 15.0, p.z * 120.0)) * 0.3;
}
// Relief plus petit qu'un ou deux pixels (mouton vu de loin) : effacé, sinon il grésille.
float sFade(vec3 p) {
  return 1.0 - smoothstep(0.12, 0.4, length(fwidth(p)) * 55.0);
}
float sRelief(vec3 p) {
  float r = 0.0;
  if (sWoolK.x > 0.0) r += sWoolK.x * sCurls(p);
  if (sWoolK.y > 0.0) r += sWoolK.y * sLocks(p);
  return r;
}`;

const COLOR_F = /* glsl */ `
{
  vec3 c0 = diffuseColor.rgb;
  vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
  float lum0 = dot(c0, LUM);
  vec3 p = vSRest;
  float wool = smoothstep(0.3, 0.7, vSMask.x);
  float head = smoothstep(0.3, 0.7, vSMask.y) * (1.0 - wool);
  float leg = smoothstep(0.3, 0.7, vSMask.z) * (1.0 - wool);
  float hoof = smoothstep(0.4, 0.7, vSMask.w);
  // Laine du front et des joues (mérinos) : derrière les yeux, au-dessus d'eux.
  if (sWoolK.z > 0.0) {
    float cap = smoothstep(sHead.y - 0.01, sHead.y + 0.03, p.y) * (1.0 - smoothstep(sHead.x - 0.035, sHead.x + 0.005, p.z));
    float cheek = (1.0 - smoothstep(sHead.x - 0.07, sHead.x - 0.02, p.z));
    float hw = clamp(max(cap, cheek * 0.8) * sWoolK.z * 1.4, 0.0, 1.0) * head;
    wool = max(wool, hw);
    head *= 1.0 - hw;
  }
  // Toupet blanc bouclé du front (nez noir du Valais) : la laine de la robe entre les cornes, au-dessus des yeux.
  if (sTuft.x > 0.0) {
    float tuft = smoothstep(sHead.y + 0.006, sHead.y + 0.026, p.y) * (1.0 - smoothstep(0.03, 0.052, abs(p.x)))
      * (1.0 - smoothstep(sHead.x + 0.005, sHead.x + 0.04, p.z)) * smoothstep(sHead.x - 0.11, sHead.x - 0.07, p.z);
    tuft *= head * sTuft.x;
    wool = max(wool, tuft);
    head *= 1.0 - tuft;
  }
  // Laine du haut des pattes (mérinos) : jusqu'au-dessus du genou / du jarret.
  if (sWoolK.w > 0.0) {
    float front = step(sKnee.w, p.z);
    float kneeY = mix(sKnee.y, sKnee.x, front);
    float lw = smoothstep(kneeY + 0.01, kneeY + 0.07, p.y) * sWoolK.w * leg;
    wool = max(wool, lw);
    leg *= 1.0 - lw;
  }
  // Grain de la texture rapporté à la moyenne de sa région.
  float mean = mix(mix(sMeans.x, sMeans.z, leg), sMeans.y, head);
  float detail = clamp(lum0 / max(0.05, mean), 0.35, 1.6);
  vec3 skin = mix(sLeg, sFace, head / max(0.001, head + leg));
  skin = head + leg > 0.001 ? skin : sFace;
  if (sState.y > 0.5) {
    // Nez noir du Valais : genoux (devant) et jarrets (derrière), pieds noirs.
    float front = step(sKnee.w, p.z);
    float kneeY = mix(sKnee.y, sKnee.x, front);
    float knee = 1.0 - smoothstep(0.03, 0.055, abs(p.y - kneeY));
    float foot = 1.0 - smoothstep(sKnee.z * 0.8, sKnee.z * 1.25, p.y);
    skin = mix(skin, sFace, max(knee, foot) * leg);
  }
  float sh = sState.x * wool;
  vec3 wc = sWool;
  float fade = sFade(p) * (1.0 - sh);
  if (sWoolK.x > 0.0) wc *= mix(1.0, 0.8 + 0.28 * sCurls(p), sWoolK.x * fade);
  if (sWoolK.y > 0.0) wc *= mix(1.0, 0.6 + 0.58 * sLocks(p), sWoolK.y * fade * (1.0 - sh));
  // (laine tondue : rase, un peu plus claire, grain adouci)
  wc = mix(wc, wc * 1.05 + 0.012, sh);
  vec3 col = mix(skin, wc, wool);
  col = mix(col, sHoof, hoof);
  // (la laine garde tout son grain, c'est lui qui la rend laineuse ; tondue, peau claire : grain adouci)
  float l = dot(col, LUM);
  float d = mix(detail, sqrt(detail), max(sh, smoothstep(0.35, 0.8, l) * (1.0 - wool) * 0.6));
  col = min(col * d, vec3(1.0));
  // Yeux (texels très sombres de la tête, autour de la place des yeux — pas l'intérieur sombre des oreilles) et truffe
  // rose des faces claires : couleurs du fichier.
  float eyeZone = (1.0 - smoothstep(0.03, 0.05, abs(p.z - sHead.x))) * (1.0 - smoothstep(0.035, 0.06, abs(p.y - sHead.y)));
  float keep = smoothstep(0.3, 0.7, vSMask.y) * (1.0 - smoothstep(0.05, 0.11, lum0)) * eyeZone;
  float pink = smoothstep(0.3, 0.7, vSMask.y) * smoothstep(0.05, 0.12, c0.r - c0.g) * step(0.45, dot(sFace, LUM));
  keep = max(keep, pink * 0.85);
  diffuseColor.rgb = mix(col, c0, clamp(keep, 0.0, 1.0));
  // Regard : sur une face sombre (suffolk, nez noir, Ouessant noir), l'œil de la photo se perdait dans le noir — iris
  // ambre, pupille horizontale, paupière plus claire autour ; un petit reflet sur toutes les races.
  {
    float headM = smoothstep(0.3, 0.7, vSMask.y);
    vec3 e = vec3(abs(p.x), p.y, p.z) - sEye.xyz;
    float r = sEye.w;
    float dE = length(e);
    if (sTuft.y > 0.0) {
      float inEye = 1.0 - smoothstep(r * 0.85, r * 1.05, dE);
      float pupil = (1.0 - smoothstep(r * 0.15, r * 0.26, abs(e.y))) * (1.0 - smoothstep(r * 0.45, r * 0.65, abs(e.z)));
      vec3 iris = mix(vec3(0.52, 0.34, 0.1), vec3(0.015, 0.012, 0.01), pupil);
      float rim = smoothstep(r * 0.95, r * 1.12, dE) * (1.0 - smoothstep(r * 1.15, r * 1.65, dE));
      diffuseColor.rgb = mix(diffuseColor.rgb, iris, inEye * sTuft.y * headM);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.27, 0.25), rim * sTuft.y * headM * 0.8);
    }
    float glint = 1.0 - smoothstep(r * 0.1, r * 0.22, length(e - vec3(0.0, r * 0.35, r * 0.25)));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92), glint * headM * 0.85);
    totalEmissiveRadiance += vec3(0.35) * glint * headM;
  }
}`;

// Relief de la laine bouclée ou longue, après la carte de normales de la matière (dérivées d'écran).
const BUMP_F = /* glsl */ `
if (sWoolK.x > 0.0 || sWoolK.y > 0.0) {
  float sW = smoothstep(0.3, 0.7, vSMask.x) * (1.0 - sState.x) * sFade(vSRest);
  float sH = sRelief(vSRest) * sW;
  vec2 dH = vec2(dFdx(sH), dFdy(sH)) * 1.1;
  vec3 sp = -vViewPosition;
  vec3 sx = normalize(dFdx(sp));
  vec3 sy = normalize(dFdy(sp));
  vec3 r1 = cross(sy, normal);
  vec3 r2 = cross(normal, sx);
  float det = dot(sx, r1) * faceDirection;
  vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
  normal = normalize(abs(det) * normal - grad);
}`;

/**
 * Matière du mouton : la photo de toison du GLB (src : matière d'origine, sa texture et sa carte de normales sont
 * partagées), recolorée par le shader. Renvoie { mat, depth } (depth : matière de l'ombre, même laine longue).
 */
export function sheepMaterial(src, uniforms) {
  const mat = new THREE.MeshStandardMaterial({
    map: src?.map ?? null,
    normalMap: src?.normalMap ?? null,
    roughness: 0.92,
    metalness: 0,
    name: 'sheep_wool',
    // (comme le GLB : les oreilles sont des lambeaux minces, vus des deux côtés)
    side: THREE.DoubleSide,
  });
  if (src?.normalScale) mat.normalScale.copy(src.normalScale);
  const vert = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON_V}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${BEGIN_V}`)
      .replace('#include <morphtarget_vertex>', `#include <morphtarget_vertex>\n${LONG_V}`);
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    vert(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_F}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${COLOR_F}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${BUMP_F}`);
  };
  mat.customProgramCacheKey = () => 'sheep-wool-v5';
  mat.userData.sheepUniforms = uniforms;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    vert(sh);
    // (ombre des oreilles reculée : plus de strie sur la tête claire — ruminantShadow.js)
    addSelfShadow(sh, 'smoothstep(0.15, 0.5, sheepEar)', SELF_SHADOW_GAP.sheep);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vSMask;\nvarying vec3 vSRest;');
  };
  depth.customProgramCacheKey = () => 'sheep-wool-depth-v6';
  return { mat, depth };
}

/** Cornes : couleur de la race, anneaux de croissance le long de la corne (u de la texture : le long de la corne). */
export function hornMaterial(color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, name: 'sheep_horn' });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vHornUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHornUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vHornUv;')
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  // anneaux serrés près de la base, plus espacés vers la pointe ; pointe plus claire
  float u = vHornUv.x;
  float ring = 0.5 + 0.5 * sin(u * 70.0 + sin(u * 9.0) * 2.0);
  diffuseColor.rgb *= mix(0.78, 1.0, smoothstep(0.2, 0.8, ring)) * mix(0.85, 1.12, smoothstep(0.55, 1.0, u));
}`);
  };
  mat.customProgramCacheKey = () => 'sheep-horn-v1';
  return mat;
}

/**
 * Matière de l'ombre des cornes : reculée comme celle des oreilles (ruminantShadow.js). unit : 1 / échelle des cornes
 * dans le repère du mouton (maillage à part, enfant de l'os de la tête).
 */
export function hornDepthMaterial(unit) {
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => {
    sh.uniforms.rUnit = { value: unit };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float rUnit;');
    addSelfShadow(sh, '1.0', SELF_SHADOW_GAP.sheep, 'rUnit');
  };
  depth.customProgramCacheKey = () => 'sheep-horn-depth-v1';
  return depth;
}
