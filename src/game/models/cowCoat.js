// Robe des vaches réalistes (cowReal.js), peinte par le shader de leur matière.
//
// La photo d'origine de la robe (pie rouge pour la vache de Lyndon Daniels, brun uni pour le taureau Rocketbox) n'est
// plus recolorée telle quelle : tools/vache/tex.mjs en a tiré une carte de GRAIN (chaque texel rapporté à la moyenne
// locale de sa classe — poil foncé, poil clair, peau, corne, onglon — : ni taches ni ombres de la photo ne restent ;
// gris neutre 0,5) et un MASQUE (rangé dans l'emplacement « occlusion » du GLB : R champ des taches de la photo, G peau
// rose du mufle et des oreilles, B couleurs gardées — bouche, cils, yeux peints du taureau). La robe est donc peinte ici,
// d'après la race, sur des régions propres :
// - unie (Charolaise, Highland, Hérens, Wagyu, Angus, Retinta ; Canadienne avec son mufle clair) ;
// - pie (Prim'Holstein, Normande, Bretonne pie noire) : taches du champ R, seuil de la race (plus ou moins de couleur,
//   bord net, un peu dentelé) ; sur le taureau, qui n'a pas de taches, taches calculées sur la position de repos.
//   Normande : lunettes foncées autour des yeux, bringé en fines stries verticales dans les taches. Prim'Holstein :
//   bas des pattes, ventre et toupillon blancs ;
// - Hereford : rouge ; tête, crête de l'encolure, fanon et poitrail, ventre, bas des pattes et toupillon blancs.
// Puis : mufle (peau, couleur de la race), intérieur des oreilles, mamelle, cornes (claires, pointe foncée), onglons.
// Poil long (Highland) : le tronc gonfle et pend un peu (avant le squelette), mèches dessinées par le shader et par les
// cartes de ruminantHair.js (cowReal.js).
// La matière garde son shader quand on la clone (Beauty.js : robe lustrée) : uniformes partagés, clé de programme.

import * as THREE from 'three';

export const COW_PATTERNS = { solid: 0, pie: 1, hereford: 2 };

/** Uniformes d'une vache (partagés par sa matière, son ombre et leurs clones). */
export function makeCowUniforms() {
  return {
    cBase: { value: new THREE.Color(0x6b3f25) },
    cWhite: { value: new THREE.Color(0xf2eee6) },
    cTan: { value: new THREE.Color(0x3b2316) },
    cNose: { value: new THREE.Color(0xd8a596) },
    cHoof: { value: new THREE.Color(0x2c2522) },
    cHorn: { value: new THREE.Color(0xd8cbb0) },
    cHornTip: { value: new THREE.Color(0x3a3028) },
    cUdder: { value: new THREE.Color(0xe0aa9c) },
    // x : motif (COW_PATTERNS), y : poil long (m), z : veau (0-1), w : couchée (0-1)
    cStyle: { value: new THREE.Vector4(0, 0, 0, 0) },
    // x : seuil des taches (0,5 : la photo), y : lunettes, z : bringé, w : bas des pattes et toupillon blancs
    cPie: { value: new THREE.Vector4(0.5, 0, 0, 0) },
    // x : mufle clair, y : taches du masque (1) ou calculées (0), z : graine des taches calculées, w : robe claire (0-1)
    cMark: { value: new THREE.Vector4(0, 1, 0, 0) },
    // repères de repos : x ventre, y dos (hauteurs), z hanches, w épaules (en long)
    cLand: { value: new THREE.Vector4(0.6, 1.3, -0.7, 0.5) },
    // genou (carpe), jarret, boulet (hauteurs de repos), w : haut du toupillon (hauteur)
    cKnee: { value: new THREE.Vector4(0.45, 0.55, 0.12, 0.6) },
    // tête : x en long des yeux, y hauteur des yeux, z bout du nez (en long), w hauteur du dessus du crâne
    cHead: { value: new THREE.Vector4(0.85, 1.25, 1.05, 1.35) },
    // œil gauche au repos (x > 0) et rayon des lunettes
    cEye: { value: new THREE.Vector4(0.14, 1.25, 0.85, 0.07) },
  };
}

/** Couleurs et réglages d'une race (cowBuild, src/sim/cowLook.js) dans les uniformes. */
export function setCowCoat(u, B, kind = 'cow') {
  const c = B.colors;
  u.cBase.value.setHex(c.base);
  u.cWhite.value.setHex(c.white);
  u.cTan.value.setHex(c.tan);
  u.cNose.value.setHex(c.nose);
  u.cHoof.value.setHex(c.hoof);
  u.cHorn.value.setHex(c.horn);
  u.cHornTip.value.setHex(c.hornTip);
  u.cUdder.value.setHex(c.udder);
  u.cStyle.value.x = COW_PATTERNS[B.pattern] ?? 0;
  // (le corps ne gonfle qu'un peu : ce sont les mèches en cartes, cowReal.js, qui font le poil long)
  u.cStyle.value.y = (B.hair ?? 0) * 0.32;
  u.cStyle.value.z = B.calf ? 1 : B.stage === 'young' ? 0.45 : 0;
  u.cPie.value.set(B.pie ?? 0.5, B.lunettes ?? 0, B.brindle ?? 0, B.whiteLegs ?? 0);
  const l = (h) => 0.2126 * ((h >> 16) & 255) / 255 + 0.7152 * ((h >> 8) & 255) / 255 + 0.0722 * (h & 255) / 255;
  u.cMark.value.set(B.muzzleRing ?? 0, kind === 'bull' ? 0 : 1, (B.breed?.length ?? 3) * 1.7, B.pattern === 'solid' ? Math.min(1, Math.max(0, (l(c.base) - 0.3) / 0.4)) : 0);
}

const COMMON_V = /* glsl */ `
attribute vec4 cowMask;
attribute vec4 cowPart;
attribute vec4 cowAux;
uniform vec4 cStyle;
uniform vec4 cLand;
varying vec4 vCMask;
varying vec4 vCPart;
varying vec4 vCAux;
varying vec3 vCRest;
float cHashV(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}`;

const BEGIN_V = /* glsl */ `
vCMask = cowMask;
vCPart = cowPart;
vCAux = cowAux;
vCRest = position;`;

// Poil long (Highland) : après les cibles de forme, avant le squelette (il suit le corps) : le tronc et le haut des
// membres gonflent, le bas des flancs pend en jupe, la culotte à l'arrière des cuisses.
const LONG_V = /* glsl */ `
if (cStyle.y > 0.0) {
  float h = (position.y - cLand.x) / max(0.02, cLand.y - cLand.x);
  float trunk = smoothstep(0.3, 0.85, cowPart.w) * (1.0 - cowMask.y) * (1.0 - cowMask.z) * (1.0 - cowPart.y) * (1.0 - cowPart.z);
  float skirt = 1.0 - smoothstep(-0.25, 0.9, h);
  float rump = smoothstep(cLand.z + 0.15, cLand.z - 0.1, position.z);
  float len = cStyle.y * trunk * (0.35 + 0.65 * max(skirt, rump * 0.8)) * (0.7 + 0.6 * cHashV(floor(position * 30.0)));
  transformed += vec3(sign(position.x) * len * 0.45, -len * (0.25 + 0.75 * skirt) * (1.0 - 0.7 * cStyle.w), -len * 0.25 * rump);
}`;

const COMMON_F = /* glsl */ `
uniform vec3 cBase;
uniform vec3 cWhite;
uniform vec3 cTan;
uniform vec3 cNose;
uniform vec3 cHoof;
uniform vec3 cHorn;
uniform vec3 cHornTip;
uniform vec3 cUdder;
uniform vec4 cStyle;
uniform vec4 cPie;
uniform vec4 cMark;
uniform vec4 cLand;
uniform vec4 cKnee;
uniform vec4 cHead;
uniform vec4 cEye;
varying vec4 vCMask;
varying vec4 vCPart;
varying vec4 vCAux;
varying vec3 vCRest;
float cHashF(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float cNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cHashF(i), cHashF(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(cHashF(i + vec3(0.0, 1.0, 0.0)), cHashF(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(cHashF(i + vec3(0.0, 0.0, 1.0)), cHashF(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(cHashF(i + vec3(0.0, 1.0, 1.0)), cHashF(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
// Mèches du poil long : bruit étiré vers le bas.
float cLocks(vec3 p) {
  return cNoise(vec3(p.x * 60.0, p.y * 5.0, p.z * 60.0)) * 0.55 + cNoise(vec3(p.x * 140.0, p.y * 11.0, p.z * 140.0)) * 0.45;
}
float cFade(vec3 p) {
  return 1.0 - smoothstep(0.12, 0.4, length(fwidth(p)) * 40.0);
}`;

const COLOR_F = /* glsl */ `
{
  vec3 c0 = diffuseColor.rgb;
  vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
  #ifdef USE_AOMAP
  vec3 mk = texture2D(aoMap, vAoMapUv).rgb;
  #else
  vec3 mk = vec3(0.5, 0.0, 0.0);
  #endif
  vec3 p = vCRest;
  float head = smoothstep(0.3, 0.7, vCMask.y);
  float leg = smoothstep(0.3, 0.7, vCMask.z) * (1.0 - head);
  float hoof = smoothstep(0.35, 0.7, vCMask.w);
  float horn = smoothstep(0.3, 0.7, vCPart.x);
  float udder = smoothstep(0.25, 0.7, vCPart.y);
  float tail = smoothstep(0.3, 0.7, vCPart.z);
  float ear = smoothstep(0.3, 0.7, vCAux.x);
  float skin = smoothstep(0.35, 0.75, mk.g) * (1.0 - horn) * (1.0 - hoof);
  float keep = smoothstep(0.3, 0.7, mk.b);
  // Grain (carte de tools/vache/tex.mjs : 0,5 = la moyenne de sa classe).
  float detail = clamp(dot(c0, LUM) * 2.0, 0.45, 1.7);
  // (repères : le tronc entre les épaules et les hanches ; dessous du ventre ; bas des pattes sous le genou / jarret)
  float L = max(0.1, cLand.w - cLand.z);
  float trunkZ = smoothstep(cLand.z - 0.06, cLand.z + 0.1, p.z) * (1.0 - smoothstep(cLand.w - 0.1, cLand.w + 0.06, p.z));
  float hl = (p.y - cLand.x) / max(0.02, cLand.y - cLand.x);
  float front = step(mix(cLand.z, cLand.w, 0.5), p.z);
  float kneeY = mix(cKnee.y, cKnee.x, front);
  float lowLeg = leg * (1.0 - smoothstep(kneeY - 0.03, kneeY + 0.06, p.y));
  float belly = (1.0 - smoothstep(0.04, 0.32, hl)) * trunkZ * (1.0 - head) * (1.0 - leg) * (1.0 - udder);
  float tuft = tail * (1.0 - smoothstep(cKnee.w - 0.04, cKnee.w + 0.08, p.y));
  float n2 = cNoise(p * 9.0 + 5.0);
  vec3 col = cBase;
  float pat = cStyle.x;
  if (pat > 0.5 && pat < 1.5) {
    // Pie : taches du masque (la photo de la vache) ou calculées (taureau), seuil de la race, bord net un peu dentelé.
    float f;
    if (cMark.y > 0.5) {
      f = mk.r + (n2 - 0.5) * 0.05;
    } else {
      vec3 q = p * vec3(2.4, 2.0, 1.6) + vec3(cMark.z, 1.3, 2.7);
      f = cNoise(q) * 0.65 + cNoise(q * 2.3 + 4.0) * 0.3 + (n2 - 0.5) * 0.06;
      // (calculées : ventre blanc, liste blanche sur la face, oreilles de couleur)
      f -= belly * 0.6 + head * (1.0 - smoothstep(0.03, 0.07, abs(p.x))) * smoothstep(cHead.x - 0.05, cHead.x + 0.05, p.z) * 0.8;
      f = max(f, ear);
    }
    float spot = smoothstep(cPie.x - 0.025, cPie.x + 0.025, f);
    // (Prim'Holstein : bas des pattes, ventre et toupillon blancs)
    spot *= 1.0 - cPie.w * max(lowLeg, max(tuft, belly * 0.8));
    vec3 sc = cBase;
    if (cPie.z > 0.0) {
      // Bringé (Normande) : fines stries verticales, irrégulières, plus foncées, dans les taches.
      float s = cNoise(vec3(p.x * 9.0, p.y * 2.2, p.z * 26.0)) * 0.7 + cNoise(vec3(p.x * 20.0, p.y * 4.0, p.z * 55.0)) * 0.3;
      sc = mix(cBase, cTan, smoothstep(0.52, 0.72, s) * cPie.z);
    }
    col = mix(cWhite, sc, spot);
    if (cPie.y > 0.0) {
      // Lunettes (Normande) : le tour des yeux foncé, bord irrégulier.
      vec3 e = vec3(abs(p.x), p.y, p.z);
      float dE = distance(e, cEye.xyz) + (n2 - 0.5) * cEye.w * 0.4;
      col = mix(col, cTan, head * (1.0 - ear) * (1.0 - smoothstep(cEye.w * 0.75, cEye.w, dE)) * cPie.y);
    }
  } else if (pat > 1.5) {
    // Hereford : rouge ; tête, crête de l'encolure, fanon et poitrail, ventre, bas des pattes et toupillon blancs.
    float neck = (1.0 - head) * (1.0 - tail) * (1.0 - leg * 0.7) * smoothstep(cLand.w - 0.1 * L, cLand.w + 0.06 * L, p.z);
    float brisket = neck * (1.0 - smoothstep(0.4, 0.66, hl + (n2 - 0.5) * 0.2));
    float crest = neck * smoothstep(cLand.w + 0.25 * L, cLand.w + 0.45 * L, p.z) * smoothstep(0.86, 1.0, hl + (n2 - 0.5) * 0.1);
    float face = head * (1.0 - ear * 0.85);
    float w = max(max(face, max(brisket, crest)), max(belly, max(lowLeg, tuft)));
    col = mix(cBase, cWhite, smoothstep(0.35, 0.65, w + (n2 - 0.5) * 0.12));
  }
  // Mufle clair (Canadienne) : un anneau fauve autour du nez, le nez reste sombre.
  if (cMark.x > 0.0) {
    float hz = (p.z - cHead.x) / max(0.02, cHead.z - cHead.x);
    float ring = head * (1.0 - ear) * smoothstep(0.55, 0.72, hz + (n2 - 0.5) * 0.08);
    col = mix(col, cTan, ring * cMark.x);
  }
  // Peau : nez (couleur de la race) et intérieur des oreilles (rosé, assombri sur une robe sombre).
  float lc = dot(col, LUM);
  vec3 earSkin = mix(col * 1.25 + vec3(0.03, 0.01, 0.01), vec3(0.78, 0.52, 0.48), smoothstep(0.1, 0.5, lc));
  col = mix(col, mix(cNose, earSkin, ear), skin);
  col = mix(col, cUdder, udder);
  col = mix(col, mix(cHorn, cHornTip, smoothstep(0.5, 1.0, vCAux.z)), horn);
  col = mix(col, cHoof, hoof * (1.0 - horn));
  // Poil long : mèches sur le tronc, plus marquées vers le bas ; reflets un peu plus clairs au bout.
  if (cStyle.y > 0.0) {
    float tr = smoothstep(0.3, 0.85, vCPart.w) * (1.0 - head) * (1.0 - leg) * (1.0 - udder);
    float lk = cLocks(p);
    col *= mix(1.0, 0.82 + 0.3 * lk, tr * cFade(p) * (0.55 + 0.45 * (1.0 - smoothstep(0.1, 0.9, hl))));
  }
  // Grain : entier sur le poil foncé, adouci sur le poil clair (la photo du poil blanc a des ombres de poils marquées ;
  // plancher : jamais de zone grise sale sur une robe blanche).
  float l = dot(col, LUM);
  float light = smoothstep(0.3, 0.75, l);
  float d = mix(detail, sqrt(detail), light * 0.75);
  d = mix(d, max(d, 0.9), light * 0.8 * (1.0 - hoof) * (1.0 - horn));
  // (veau : poil plus doux, grain adouci)
  d = mix(d, sqrt(d), cStyle.z * 0.5);
  col = min(col * d, vec3(1.0));
  diffuseColor.rgb = mix(col, c0, keep);
}`;

// Relief des mèches du poil long, après la carte de normales de la matière (dérivées d'écran).
const BUMP_F = /* glsl */ `
if (cStyle.y > 0.0) {
  float cW = smoothstep(0.3, 0.85, vCPart.w) * (1.0 - smoothstep(0.3, 0.7, vCMask.y)) * (1.0 - smoothstep(0.3, 0.7, vCMask.z)) * cFade(vCRest);
  float cH = cLocks(vCRest) * cW;
  vec2 dH = vec2(dFdx(cH), dFdy(cH)) * 1.2;
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
 * Matière de la vache : la carte de grain du GLB (src : matière d'origine ; ses textures sont partagées), son masque
 * (src.aoMap, jamais utilisé comme occlusion : aoMapIntensity 0) et sa carte de normales, peinte par le shader.
 * Renvoie { mat, depth } (depth : matière de l'ombre, même poil long, cils découpés).
 */
export function cowMaterial(src, uniforms) {
  const mat = new THREE.MeshStandardMaterial({
    map: src?.map ?? null,
    normalMap: src?.normalMap ?? null,
    aoMap: src?.aoMap ?? null,
    aoMapIntensity: 0,
    roughness: 0.86,
    metalness: 0,
    name: 'cow_coat',
    // (oreilles, cils : lambeaux minces vus des deux côtés ; cils découpés)
    side: THREE.DoubleSide,
    alphaTest: src?.alphaTest > 0 ? src.alphaTest : 0.5,
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
  mat.customProgramCacheKey = () => 'cow-coat-v1';
  mat.userData.cowUniforms = uniforms;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: src?.map ?? null, alphaTest: 0.5 });
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    vert(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vCMask;\nvarying vec4 vCPart;\nvarying vec4 vCAux;\nvarying vec3 vCRest;');
  };
  depth.customProgramCacheKey = () => 'cow-coat-depth-v1';
  return { mat, depth };
}

/** Matière des yeux de la vache (primitive à part du GLB de Lyndon Daniels) : la texture de l'œil, brillante. */
export function cowEyeMaterial(src) {
  const mat = new THREE.MeshStandardMaterial({ map: src?.map ?? null, roughness: 0.22, metalness: 0, name: 'cow_eye' });
  if (!src?.map) mat.color.setHex(0x1a120c);
  return mat;
}
