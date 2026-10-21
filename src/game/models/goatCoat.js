// Robe de la chèvre réaliste (goatReal.js), peinte par le shader de sa matière.
//
// Le GLB porte une photo de chèvre blanche (tête et canons plus foncés, raie dorsale grise). Chaque texel n'en garde que
// son grain : il est rapporté à la luminance moyenne de sa région (gMeans : corps, tête, pattes, cornes, mamelle), puis
// multiplié par la couleur voulue. Les régions viennent des os (goatReal.js : attribut goatMask = corps, tête, bas des
// membres, onglons ; goatPart = cornes, mamelle, barbe, part portée par le tronc) ; les motifs de race sont dessinés
// sur la position de repos (vGRest, repère de la chèvre : +z vers l'avant, y en haut) :
// - chamoisée (alpine) : brun, raie dorsale, ventre, bas des pattes et deux bandes de la face noirs ;
// - blanche (saanen) ;
// - poitevine : noire, ventre, intérieur des cuisses, bas des pattes, dessous de la queue et deux bandes de la face clairs ;
// - col noir : avant noir (tête, encolure, épaules, antérieurs), arrière blanc, limite un peu dentelée.
// Poil long (poitevine, col noir) : les sommets du tronc pendent (déplacés avant le squelette, plus bas sous le ventre et
// aux cuisses), mèches dessinées par le shader. Yeux et naseaux gardent les couleurs du fichier.
// La matière garde son shader quand on la clone (Beauty.js : robe lustrée) : uniformes partagés, clé de programme.

import * as THREE from 'three';

export const PATTERNS = { white: 0, chamoisee: 1, poitevine: 2, colnoir: 3 };

/** Uniformes d'une chèvre (partagés par sa matière, son ombre et leurs clones). */
export function makeGoatUniforms() {
  return {
    gBase: { value: new THREE.Color(0xf3efe6) },
    gDark: { value: new THREE.Color(0x1d1714) },
    gLight: { value: new THREE.Color(0xf1ece2) },
    gLeg: { value: new THREE.Color(0xf3efe6) },
    gHoof: { value: new THREE.Color(0x3a2f28) },
    gHorn: { value: new THREE.Color(0x5f5448) },
    gUdder: { value: new THREE.Color(0xd8a596) },
    // x : motif (PATTERNS), y : longueur du poil long (m), z : chevreau (0-1), w : couchée (0-1)
    gStyle: { value: new THREE.Vector4(0, 0, 0, 0) },
    // luminance moyenne de la texture : corps, tête, pattes, cornes (grain = texel ÷ moyenne)
    gMeans: { value: new THREE.Vector4(0.5, 0.4, 0.3, 0.15) },
    // repères de repos : x ventre, y dos (hauteurs), z hanches, w épaules (en long)
    gLand: { value: new THREE.Vector4(0.35, 0.75, -0.3, 0.3) },
    // genou (carpe), jarret, boulet (hauteurs de repos), w : limite avant / arrière (en long)
    gKnee: { value: new THREE.Vector4(0.25, 0.3, 0.08, 0) },
    // tête : x en long des yeux, y hauteur des yeux, z bout du nez (en long), w hauteur du dessus du crâne
    gHead: { value: new THREE.Vector4(0.45, 0.85, 0.62, 0.92) },
  };
}

/** Couleurs et réglages d'une race (goatBuild, src/sim/goatLook.js) dans les uniformes. */
export function setGoatCoat(u, B) {
  const c = B.colors;
  u.gBase.value.setHex(c.base);
  u.gDark.value.setHex(c.dark);
  u.gLight.value.setHex(c.light);
  u.gLeg.value.setHex(c.leg);
  u.gHoof.value.setHex(c.hoof);
  u.gHorn.value.setHex(c.horn);
  u.gUdder.value.setHex(c.udder);
  u.gStyle.value.x = PATTERNS[B.pattern] ?? 0;
  // (le corps ne gonfle qu'un peu : ce sont les mèches en cartes, goatReal.js hairCards, qui font le poil long)
  u.gStyle.value.y = (B.long ?? 0) * 0.3;
  u.gStyle.value.z = B.kid ? 1 : B.stage === 'young' ? 0.45 : 0;
}

const COMMON_V = /* glsl */ `
attribute vec4 goatMask;
attribute vec4 goatPart;
uniform vec4 gStyle;
uniform vec4 gLand;
varying vec4 vGMask;
varying vec4 vGPart;
varying vec3 vGRest;
float gHashV(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}`;

const BEGIN_V = /* glsl */ `
vGMask = goatMask;
vGPart = goatPart;
vGRest = position;`;

// Poil long : après les cibles de forme, avant le squelette (il suit le corps).
const LONG_V = /* glsl */ `
if (gStyle.y > 0.0) {
  float h = (position.y - gLand.x) / max(0.02, gLand.y - gLand.x);
  // (part portée par le tronc et le haut des cuisses ; ni la tête, ni le bas des pattes, ni la mamelle, ni la queue)
  float trunk = smoothstep(0.45, 0.9, goatPart.w) * (1.0 - goatMask.y) * (1.0 - goatMask.z) * (1.0 - goatPart.y);
  float skirt = 1.0 - smoothstep(-0.25, 0.95, h);
  // (culotte : plus long à l'arrière des cuisses)
  float rump = smoothstep(gLand.z + 0.12, gLand.z - 0.08, position.z);
  float len = gStyle.y * trunk * (0.25 + 0.75 * max(skirt, rump * 0.8)) * (0.6 + 0.8 * gHashV(floor(position * 40.0)));
  transformed += vec3(sign(position.x) * len * 0.22 * skirt, -len * (0.3 + 0.7 * skirt) * (1.0 - 0.7 * gStyle.w), -len * 0.2 * rump);
}`;

const COMMON_F = /* glsl */ `
uniform vec3 gBase;
uniform vec3 gDark;
uniform vec3 gLight;
uniform vec3 gLeg;
uniform vec3 gHoof;
uniform vec3 gHorn;
uniform vec3 gUdder;
uniform vec4 gStyle;
uniform vec4 gMeans;
uniform vec4 gLand;
uniform vec4 gKnee;
uniform vec4 gHead;
varying vec4 vGMask;
varying vec4 vGPart;
varying vec3 vGRest;
float gHashF(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float gNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHashF(i), gHashF(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(gHashF(i + vec3(0.0, 1.0, 0.0)), gHashF(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(gHashF(i + vec3(0.0, 0.0, 1.0)), gHashF(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(gHashF(i + vec3(0.0, 1.0, 1.0)), gHashF(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
// Mèches du poil long : bruit étiré vers le bas.
float gLocks(vec3 p) {
  return gNoise(vec3(p.x * 60.0, p.y * 6.0, p.z * 60.0)) * 0.65 + gNoise(vec3(p.x * 140.0, p.y * 14.0, p.z * 140.0)) * 0.35;
}
float gFade(vec3 p) {
  return 1.0 - smoothstep(0.12, 0.4, length(fwidth(p)) * 55.0);
}`;

const COLOR_F = /* glsl */ `
{
  vec3 c0 = diffuseColor.rgb;
  vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
  float lum0 = dot(c0, LUM);
  vec3 p = vGRest;
  float head = smoothstep(0.3, 0.7, vGMask.y);
  float leg = smoothstep(0.3, 0.7, vGMask.z) * (1.0 - head);
  float hoof = smoothstep(0.4, 0.7, vGMask.w);
  float horn = smoothstep(0.3, 0.7, vGPart.x);
  float udder = smoothstep(0.3, 0.7, vGPart.y);
  float beard = smoothstep(0.3, 0.7, vGPart.z);
  float pat = gStyle.x;
  // Grain de la texture rapporté à la moyenne de sa région.
  float mean = mix(mix(mix(gMeans.x, gMeans.z, leg), gMeans.y, head), gMeans.w, horn);
  float detail = clamp(lum0 / max(0.04, mean), 0.35, 1.7);
  // (repères : le tronc entre les épaules et les hanches ; dessous du ventre ; bas des pattes sous le genou / jarret)
  float trunkZ = smoothstep(gLand.z - 0.04, gLand.z + 0.06, p.z) * (1.0 - smoothstep(gLand.w - 0.06, gLand.w + 0.04, p.z));
  float hl = (p.y - gLand.x) / max(0.02, gLand.y - gLand.x);
  float front = step(gKnee.w, p.z);
  float kneeY = mix(gKnee.y, gKnee.x, front);
  float lowLeg = leg * (1.0 - smoothstep(kneeY - 0.02, kneeY + 0.05, p.y));
  float belly = (1.0 - smoothstep(0.06, 0.36, hl)) * trunkZ * (1.0 - head) * (1.0 - leg);
  // face : bandes de l'œil au museau, de chaque côté du chanfrein
  float faceZ = smoothstep(gHead.x - 0.03, gHead.x + 0.02, p.z) * (1.0 - smoothstep(gHead.z - 0.035, gHead.z, p.z));
  float band = head * faceZ * smoothstep(0.014, 0.024, abs(p.x)) * (1.0 - smoothstep(gHead.y - 0.004, gHead.y + 0.022, p.y));
  float muzzle = head * smoothstep(gHead.z - 0.05, gHead.z - 0.02, p.z);
  vec3 col = gBase;
  if (pat > 0.5 && pat < 1.5) {
    // Chamoisée : raie dorsale (du garrot à la queue, sur l'encolure aussi), ventre, bas des pattes, face, barbe noirs.
    float stripe = (1.0 - smoothstep(0.024, 0.052, abs(p.x))) * smoothstep(0.76, 0.9, hl) * (1.0 - head);
    float neckCrest = (1.0 - smoothstep(0.015, 0.035, abs(p.x))) * smoothstep(gLand.w - 0.02, gLand.w + 0.05, p.z) * (1.0 - head)
      * smoothstep(gLand.y - 0.02, gLand.y + 0.06, p.y);
    float d = max(max(stripe, neckCrest), max(belly * 0.95, lowLeg));
    d = max(d, max(band * 0.9, max(muzzle * 0.75, beard)));
    // (l'avant-bras et la jambe foncent vers le genou)
    d = max(d, leg * 0.6);
    col = mix(gBase, gDark, clamp(d, 0.0, 1.0));
  } else if (pat > 1.5 && pat < 2.5) {
    // Poitevine : noire ; ventre, intérieur des cuisses, bas des pattes, dessous de la queue, bandes de la face clairs.
    float inner = leg * (1.0 - smoothstep(0.02, 0.06, abs(abs(p.x) - 0.05))) * smoothstep(kneeY + 0.12, kneeY - 0.02, p.y);
    float under = (1.0 - smoothstep(gLand.z - 0.12, gLand.z - 0.05, p.z)) * smoothstep(gLand.y - 0.25, gLand.y - 0.12, p.y) * (1.0 - smoothstep(0.02, 0.05, abs(p.x))) * (1.0 - head);
    float l = max(max(belly, lowLeg * 0.85), max(inner * 0.7, under));
    l = max(l, max(band * 0.85, muzzle * 0.7));
    col = mix(gBase, gLight, clamp(l, 0.0, 1.0) * (1.0 - beard));
  } else if (pat > 2.5) {
    // Col noir : avant noir, arrière blanc (limite un peu dentelée au milieu du tronc).
    float edge = mix(gLand.z, gLand.w, 0.42) + (gNoise(p * vec3(9.0, 9.0, 3.0)) - 0.5) * 0.07;
    float fr = max(smoothstep(edge - 0.015, edge + 0.015, p.z), head);
    col = mix(gLight, gDark, fr);
  }
  col = mix(col, gUdder, udder);
  col = mix(col, gHorn, horn);
  col = mix(col, gHoof, hoof * (1.0 - horn));
  // Poil long : mèches sur le tronc, plus marquées vers le bas.
  if (gStyle.y > 0.0) {
    float trunk = smoothstep(0.45, 0.9, vGPart.w) * (1.0 - head) * (1.0 - leg) * (1.0 - udder);
    col *= mix(1.0, 0.72 + 0.5 * gLocks(p), trunk * gFade(p) * (0.5 + 0.5 * (1.0 - smoothstep(0.1, 0.9, hl))));
  }
  // (grain : entier sur le poil foncé, adouci sur le poil clair — la photo blanche a des ombres de poils marquées)
  float l = dot(col, LUM);
  float d = mix(detail, sqrt(detail), smoothstep(0.35, 0.8, l) * 0.7);
  // (chevreau : poil plus doux, grain adouci)
  d = mix(d, sqrt(d), gStyle.z * 0.5);
  col = min(col * d, vec3(1.0));
  // Yeux (texels très sombres autour de la place des yeux) et naseaux : couleurs du fichier.
  float eyeZone = (1.0 - smoothstep(0.025, 0.045, abs(p.z - gHead.x))) * (1.0 - smoothstep(0.03, 0.05, abs(p.y - gHead.y)));
  float keep = head * (1.0 - smoothstep(0.05, 0.11, lum0)) * eyeZone;
  diffuseColor.rgb = mix(col, c0, clamp(keep, 0.0, 1.0));
}`;

// Relief des mèches du poil long, après la carte de normales de la matière (dérivées d'écran).
const BUMP_F = /* glsl */ `
if (gStyle.y > 0.0) {
  float gW = smoothstep(0.45, 0.9, vGPart.w) * (1.0 - smoothstep(0.3, 0.7, vGMask.y)) * (1.0 - smoothstep(0.3, 0.7, vGMask.z)) * gFade(vGRest);
  float gH = gLocks(vGRest) * gW;
  vec2 dH = vec2(dFdx(gH), dFdy(gH)) * 1.0;
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
 * Matière de la chèvre : la photo du GLB (src : matière d'origine ; sa texture et sa carte de normales sont partagées),
 * recolorée par le shader. Renvoie { mat, depth } (depth : matière de l'ombre, même poil long).
 */
export function goatMaterial(src, uniforms) {
  const mat = new THREE.MeshStandardMaterial({
    map: src?.map ?? null,
    normalMap: src?.normalMap ?? null,
    roughness: 0.86,
    metalness: 0,
    name: 'goat_coat',
    // (oreilles et barbe : lambeaux minces, vus des deux côtés)
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
  mat.customProgramCacheKey = () => 'goat-coat-v1';
  mat.userData.goatUniforms = uniforms;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    vert(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vGMask;\nvarying vec4 vGPart;\nvarying vec3 vGRest;');
  };
  depth.customProgramCacheKey = () => 'goat-coat-depth-v1';
  return { mat, depth };
}

// ------------------------------------------------------------------ poil long (mèches en cartes)

let strandTex = null;

/** Mèches de poil (toile 32 × 128, partagée) : traits verticaux effilés, alpha pour les bords. */
function hairStrands() {
  if (strandTex) return strandTex;
  const W = 32;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  // (graines fixes : la même toile à chaque fois)
  let s = 7;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  // (mèches effilées de longueurs inégales qui se chevauchent : serrées à la racine, elles couvrent le haut de la carte
  // sans bord droit)
  for (let k = 0; k < 64 && ctx?.beginPath; k++) {
    const x0 = rnd() * W;
    const len = H * (0.4 + 0.6 * rnd());
    const w = 1.4 + rnd() * 2.2;
    const shade = Math.round(140 + rnd() * 115);
    const sway = (rnd() - 0.5) * 7;
    ctx.beginPath();
    ctx.moveTo(x0 - w, 0);
    ctx.quadraticCurveTo(x0 + sway, len * 0.55, x0 + sway * 0.6, len);
    ctx.quadraticCurveTo(x0 + sway, len * 0.55, x0 + w, 0);
    ctx.closePath();
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fill();
  }
  strandTex = new THREE.CanvasTexture(c);
  strandTex.userData.shared = true;
  strandTex.colorSpace = THREE.SRGBColorSpace;
  return strandTex;
}

/**
 * Matière des mèches du poil long (cartes liées au squelette, goatReal.js hairCards) : couleur des deux zones de la
 * robe (attribut hairSide : 0 → hA, 1 → hB), grain des mèches, bords découpés (alphaTest) ; couchée, les mèches se
 * replient contre le corps (attribut hairTop, uniforme gStyle.w).
 */
export function goatHairMaterial(uniforms, colA, colB) {
  const hu = { hA: { value: new THREE.Color(colA) }, hB: { value: new THREE.Color(colB) } };
  const mat = new THREE.MeshStandardMaterial({ map: hairStrands(), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, name: 'goat_hair' });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, hu);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 hairTop;\nattribute float hairSide;\nuniform vec4 gStyle;\nvarying float vHSide;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHSide = hairSide;\ntransformed = hairTop + (transformed - hairTop) * (1.0 - 0.75 * gStyle.w);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 hA;\nuniform vec3 hB;\nvarying float vHSide;')
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  // (la toile est grise : elle ne donne que le grain des mèches et leurs bords)
  float g = diffuseColor.r;
  diffuseColor.rgb = mix(hA, hB, vHSide) * (0.62 + 0.5 * g);
}`);
  };
  mat.customProgramCacheKey = () => 'goat-hair-v1';
  mat.userData.hairUniforms = hu;
  return mat;
}
