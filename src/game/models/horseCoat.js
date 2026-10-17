// Pelage du cheval peint par un petit shader, sans texture par animal : la robe est calculée à
// chaque pixel à partir de la position « au repos » (le motif colle à la peau quand le cheval bouge).
// Bai (crins et bas des membres noirs), alezan, gris pommelé, isabelle (raie de mulet, zébrures),
// rouan, pie (tobiano), léopard, couverture, balzanes, marques en tête, bout du nez, sabots,
// contre-ombrage (dos plus foncé, ventre plus clair), occlusion ambiante cuite dans le maillage.
// Les crins ondulent au vent et à l'allure (vertex shader).

import * as THREE from 'three';
import { maneTexture, eyeTexture } from '../textures.js';
import { gfx } from '../gfx.js';
import { horseCoatTraits, horseFaceMark, horseSocks } from '../../sim/horseLook.js';

// Parties du maillage (attribut hPart) : le shader choisit la couleur selon la partie.
export const PART = { body: 0, head: 1, leg0: 2, hoof: 6, skin: 7, ear: 8 };

const NOISE = /* glsl */ `
float hHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hHash(i), hHash(i + vec3(1, 0, 0)), f.x), mix(hHash(i + vec3(0, 1, 0)), hHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hHash(i + vec3(0, 0, 1)), hHash(i + vec3(1, 0, 1)), f.x), mix(hHash(i + vec3(0, 1, 1)), hHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float hFbm(vec3 p) { return hNoise(p) * 0.55 + hNoise(p * 2.03 + 7.1) * 0.3 + hNoise(p * 4.1 + 3.3) * 0.15; }
// Bruit cellulaire : distance au centre de cellule le plus proche, et une valeur propre à la cellule.
vec2 hCell(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); float d = 8.0; float id = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = vec3(hHash(i + g), hHash(i + g + 19.1), hHash(i + g + 47.7));
    vec3 r = g + o - f; float dd = dot(r, r);
    if (dd < d) { d = dd; id = hHash(i + g + 5.3); }
  }
  return vec2(sqrt(d), id);
}`;

const COAT_FRAGMENT = /* glsl */ `
hBare = 0.0;
{
  vec3 P = vHPos;
  float part = vHPart;
  float isHead = step(0.5, part) * step(part, 1.5);
  float isLeg = step(1.5, part) * step(part, 5.5);
  float isHoof = step(5.5, part) * step(part, 6.5);
  float isSkin = step(6.5, part) * step(part, 7.5);
  float isEar = step(7.5, part);
  float isBody = 1.0 - isHead - isLeg - isHoof - isSkin - isEar;
  float h = vHInfo.x;          // membres : hauteur relative (0 = sol, 1 = coude) ; oreilles : 0 = base, 1 = pointe
  vec3 hl = vHInfo;            // tête : position dans le repère de la tête (÷ longueur de la tête)
  float legI = vHInfo.y;
  float up = normalize(vHNrm).y;
  float aa = clamp(length(fwidth(P)) * 140.0, 0.0, 1.0); // atténue les détails fins au loin (pas de scintillement)
  vec3 c = hCoat * 0.9;

  // Reflets doux : zones un peu plus chaudes ou plus froides, jamais un aplat.
  float n1 = hFbm(P * 2.3 + hSeed);
  c *= 0.93 + n1 * 0.14;

  // Gris : pommelures sur le corps, tête et bas des membres plus sombres.
  if (hGrey > 0.0) {
    vec2 cl = hCell(P * 8.5 + hSeed);
    float net = smoothstep(0.32, 0.62, cl.x + (hNoise(P * 30.0) - 0.5) * 0.12);
    float zone = (isBody + isLeg * smoothstep(0.55, 0.9, h)) * smoothstep(-0.6, 0.2, up);
    c *= 1.0 - net * 0.2 * zone * hGrey * (0.55 + 0.45 * hFbm(P * 1.2 + 3.0));
    c *= 1.0 + (1.0 - net) * 0.05 * zone * hGrey;
    c = mix(c, c * 0.62, isLeg * (1.0 - smoothstep(0.12, 0.5, h)) * 0.8);
    c = mix(c, c * 0.78, isHead * smoothstep(0.55, 0.95, hl.z) * 0.7);
  }

  // Contre-ombrage : dos un peu plus foncé, ventre et intérieur des membres plus clairs.
  float belly = smoothstep(0.15, -0.75, up) * isBody;
  c = mix(c, c * 1.12 + 0.025, belly * 0.55);
  c *= 1.0 - smoothstep(0.55, 1.0, up) * 0.06 * isBody;
  // Pangaré (Fjord, poneys) : ventre, tour des yeux et bout du nez plus clairs.
  float muzzleZone = isHead * smoothstep(0.82, 0.95, hl.z);
  c = mix(c, mix(c, vec3(0.94, 0.86, 0.72), 0.55), hMealy * clamp(belly * 1.4 + muzzleZone, 0.0, 1.0));

  // Bai, isabelle : crins noirs et bas des membres noirs ; pointes des oreilles noires.
  float pts = isLeg * (1.0 - smoothstep(0.42, 0.62, h + (hNoise(P * 24.0) - 0.5) * 0.1));
  c = mix(c, hPointC * 0.95 + c * 0.05, pts * hPoints);
  c = mix(c, hPointC, isEar * smoothstep(0.65, 0.95, h) * max(hPoints, 0.6));

  // Pie (tobiano) : grandes plaques blanches qui coupent le dos, membres blancs, tête foncée.
  if (hPinto > 0.0) {
    float pn = hFbm(P * vec3(1.7, 1.4, 1.7) + hSeed * 3.1) + (hNoise(P * 9.0) - 0.5) * 0.06;
    float t = pn + isLeg * (1.0 - smoothstep(0.1, 0.7, h)) * 0.45 - isHead * 0.5 + isBody * smoothstep(0.35, 0.9, up) * smoothstep(-0.6, -0.2, -abs(P.z + 0.1)) * 0.12;
    c = mix(c, hSec, smoothstep(0.49, 0.51, t) * hPinto * (1.0 - isHoof - isSkin));
  }

  // Isabelle / souris : raie de mulet le long du dos, zébrures sur les membres.
  if (hDun > 0.0) {
    float stripe = (1.0 - smoothstep(0.01, 0.028, abs(P.x) + (hNoise(P * 28.0) - 0.5) * 0.012)) * smoothstep(0.7, 0.95, up) * isBody;
    c = mix(c, hPointC * 0.75 + hCoat * 0.25, stripe * hDun);
    float bars = isLeg * smoothstep(0.5, 0.62, h) * (1.0 - smoothstep(0.8, 0.95, h)) * smoothstep(0.35, 0.95, sin(P.y * 75.0 + hSeed));
    c = mix(c, c * 0.72, bars * 0.55 * hDun);
  }

  // Rouan : poils blancs mêlés à la robe (pas sur la tête ni le bas des membres).
  if (hRoan > 0.0) {
    float speck = mix(step(0.55, hNoise(P * 170.0)), 0.45, aa);
    float zone = isBody + isLeg * smoothstep(0.5, 0.75, h);
    c = mix(c, hWhite, speck * 0.55 * hRoan * zone);
  }

  // Léopard (robe blanche à taches) et couverture (croupe blanche tachetée).
  if (hLeopard + hBlanket > 0.0) {
    vec2 cl = hCell(P * vec3(8.5, 8.5, 7.5) + hSeed);
    float r = 0.16 + cl.y * 0.24;
    float spot = (1.0 - smoothstep(r - 0.03, r + 0.03, cl.x + (hNoise(P * 45.0) - 0.5) * 0.07)) * step(0.22, cl.y);
    if (hBlanket > 0.0) {
      float bl = smoothstep(-0.05, 0.05, -(P.z + 0.15) + (hFbm(P * 3.0) - 0.5) * 0.25) * smoothstep(-0.35, 0.1, up) * isBody;
      c = mix(c, mix(hSec, hCoat, spot), bl * hBlanket);
    } else {
      c = mix(c, hSec, spot * hLeopard * (1.0 - isHoof - isSkin));
    }
  }

  // Balzanes : blanc en bas des membres (hauteur propre à chaque membre).
  float sockH = legI < 0.5 ? hSocks.x : legI < 1.5 ? hSocks.y : legI < 2.5 ? hSocks.z : hSocks.w;
  float sock = isLeg * step(0.01, sockH) * (1.0 - smoothstep(sockH - 0.015, sockH + 0.015, h + (hNoise(P * 35.0) - 0.5) * 0.07));
  c = mix(c, hWhite, sock);

  // Marques en tête : étoile, liste, large liste, ladre (repère de la tête : z = 0 nuque, 1 bout du nez).
  float face = 0.0;
  if (hFace > 0.5 && isHead > 0.5) {
    float fn = (hNoise(P * 40.0) - 0.5) * 0.06;
    float front = smoothstep(-0.02, 0.06, hl.y + 0.1 * smoothstep(0.75, 1.0, hl.z));
    float star = 1.0 - smoothstep(0.8, 1.0, length(vec2(hl.x / 0.045, (hl.z - 0.31) / 0.05)) + fn * 6.0 + (hNoise(P * 90.0) - 0.5) * 0.35);
    float stripe = (1.0 - smoothstep(0.018, 0.03, abs(hl.x) + fn * 0.4)) * smoothstep(0.3, 0.34, hl.z) * (1.0 - smoothstep(0.9, 0.95, hl.z));
    float blaze = (1.0 - smoothstep(0.045, 0.06, abs(hl.x) - hl.z * 0.035 + fn)) * smoothstep(0.24, 0.28, hl.z);
    float snip = 1.0 - smoothstep(0.85, 1.05, length(vec2(hl.x / 0.05, (hl.z - 0.93) / 0.05)) + fn * 4.0);
    face = hFace < 1.5 ? star : hFace < 2.5 ? max(star * 0.9, stripe) : hFace < 3.5 ? max(star, blaze) : snip;
    face *= front;
    c = mix(c, hWhite, face);
  }

  // Bout du nez : peau fine, foncée (rosée sous une marque blanche), lèvres et commissures.
  vec3 skin = mix(hSkin, vec3(0.72, 0.52, 0.5), clamp(face * 1.5, 0.0, 1.0));
  c = mix(c, mix(c, skin, 0.75), muzzleZone * (1.0 - smoothstep(0.0, 0.05, hl.y + 0.02 - (hl.z - 0.9) * 0.6)) );
  c = mix(c, skin * 0.8, isHead * (1.0 - smoothstep(0.004, 0.012, abs(hl.y + 0.148 - (hl.z - 0.8) * 0.12))) * smoothstep(0.76, 0.8, hl.z) * smoothstep(0.03, 0.08, abs(hl.x)));

  // Naseaux en virgule (peints aussi : ils restent nets même quand le maillage est grossier).
  float nos = isHead * (1.0 - smoothstep(0.8, 1.0, length(vec3((abs(hl.x) - 0.064) / 0.016, (hl.y + 0.045 + (abs(hl.x) - 0.064) * 0.8) / 0.036, (hl.z - 0.97) / 0.06))));
  c = mix(c, hSkin * 0.6, nos);
  // Peau nue (intérieur des oreilles et des naseaux, paupières) et sabots.
  c = mix(c, hSkin, isSkin);
  hBare = max(isSkin, max(nos, isHoof * 0.7));
  vec3 hoof = mix(hHoof, hHoofLight, step(0.01, sockH));
  hoof *= 0.9 + 0.12 * hNoise(vec3(P.x * 260.0, P.y * 8.0, P.z * 260.0));
  c = mix(c, hoof, isHoof);

  // Grain du poil (fin, couché vers l'arrière) et occlusion ambiante cuite.
  c *= 1.0 + (hNoise(P * vec3(320.0, 110.0, 70.0)) - 0.5) * 0.07 * (1.0 - aa) * (1.0 - isHoof);
  c *= mix(0.42, 1.0, vHAO);
  diffuseColor.rgb = c;
}`;

/** Couleur three.js (linéaire) depuis un entier sRGB. */
const col = (hex) => new THREE.Color(hex);

/**
 * Matière du pelage d'un cheval. Une matière par animal (ses couleurs), un seul programme GPU pour tous.
 * build : gabarit (horseBuild) ; breedFace : marque imposée par la race.
 */
export function coatMaterial(look, build, breed = null) {
  const high = gfx.quality === 'high';
  const tr = horseCoatTraits(look);
  const socks = horseSocks(look);
  const face = horseFaceMark(look, breed);
  const sheen = build.sheen ?? 0;
  const coat = col(look.coat);
  const u = {
    hCoat: { value: coat },
    hSec: { value: col(look.secondary ?? look.coat) },
    hPointC: { value: col(look.maneCore ?? look.mane ?? 0x1b1410) },
    hWhite: { value: col(0xf4f1ec) },
    hSkin: { value: col(0x2b2523) },
    hHoof: { value: col(0x3a332d) },
    hHoofLight: { value: col(0xb9a88c) },
    hGrey: { value: tr.grey },
    hDun: { value: tr.dun },
    hRoan: { value: tr.roan },
    hPoints: { value: tr.points },
    hPinto: { value: tr.pinto },
    hLeopard: { value: tr.leopard },
    hBlanket: { value: tr.blanket },
    hMealy: { value: tr.mealy },
    hSocks: { value: new THREE.Vector4(...socks) },
    hFace: { value: face },
    hSeed: { value: ((look.seed ?? 1) % 997) * 0.731 },
  };
  const opts = {
    color: 0xffffff,
    roughness: sheen ? 0.34 : 0.56,
    metalness: sheen ? 0.32 : 0.02,
  };
  // Ordinateur : reflet satiné du poil ras (sheen), très marqué et doré pour l'Akhal-Teké.
  const m = high
    ? new THREE.MeshPhysicalMaterial({
      ...opts,
      sheen: 0.32 + sheen * 0.6,
      sheenRoughness: sheen ? 0.3 : 0.55,
      sheenColor: coat.clone().lerp(new THREE.Color(1, 0.95, 0.85), 0.3 + sheen * 0.3),
    })
    : new THREE.MeshStandardMaterial(opts);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float hPart;
attribute vec3 hInfo;
attribute float hAO;
varying vec3 vHPos;
varying vec3 vHNrm;
flat varying float vHPart; // pas d'interpolation entre deux parties (sinon : fausses balzanes aux bords)
varying vec3 vHInfo;
varying float vHAO;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vHPos = position; vHNrm = normal; vHPart = hPart; vHInfo = hInfo; vHAO = hAO;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
${Object.keys(u).map((k) => `uniform ${k === 'hSocks' ? 'vec4' : u[k].value.isColor ? 'vec3' : 'float'} ${k};`).join('\n')}
varying vec3 vHPos;
varying vec3 vHNrm;
flat varying float vHPart; // pas d'interpolation entre deux parties (sinon : fausses balzanes aux bords)
varying vec3 vHInfo;
varying float vHAO;
float hBare; // peau nue et sabots : pas de reflet satiné du poil
${NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
${COAT_FRAGMENT}`)
      // Sabots plus lisses et brillants que le poil.
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor *= mix(1.0, 0.55, step(5.5, vHPart) * step(vHPart, 6.5));`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_SHEEN
material.sheenColor *= 1.0 - hBare;
#endif`);
  };
  m.customProgramCacheKey = () => `horsecoat${high ? 'p' : 's'}`;
  m.userData.horseUniforms = u;
  return m;
}

/**
 * Matière des crins : mèches semi-transparentes colorées par sommet (crinière bicolore du Fjord,
 * mèches plus claires ou plus foncées), qui ondulent au vent et quand le cheval court.
 */
export function maneMaterial(sway) {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, map: maneTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.62,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.hairTime = gfx.time;
    sh.uniforms.hairWind = gfx.wind;
    sh.uniforms.hairSway = sway;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float hairTime;
uniform float hairWind;
uniform float hairSway;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  // uv.y = 1 à la racine, 0 à la pointe : seules les pointes bougent.
  float hw = 1.0 - uv.y;
  hw = hw * hw * (0.35 + hairWind * 0.4 + hairSway);
  float ph = hairTime * 2.3 + position.y * 7.0 + position.z * 4.0 + position.x * 3.0;
  transformed.x += sin(ph) * 0.014 * hw;
  transformed.z += cos(ph * 0.7 + 1.3) * 0.01 * hw;
  transformed.y += sin(ph * 1.3 + 0.6) * 0.005 * hw;
}`);
  };
  // Normales « de volume » (vers l'extérieur de la crinière) : pas d'inversion pour la face arrière.
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
normal = normalize( vNormal );`);
  };
  m.customProgramCacheKey = () => 'horsehair2';
  return m;
}

/** Œil brillant (iris brun, pupille horizontale). */
export function eyeMaterial(color) {
  const high = gfx.quality === 'high';
  return high
    ? new THREE.MeshPhysicalMaterial({ map: eyeTexture(color, 'oval'), roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.12, envMapIntensity: 0.6 })
    : new THREE.MeshStandardMaterial({ map: eyeTexture(color, 'oval'), roughness: 0.22, envMapIntensity: 0.6 });
}
