// Crins du cheval réaliste : texture de crins droits générée en code et matière des cartes de crins
// (crinière, toupet, queue, brosse, fanons ; les cartes elles-mêmes sont faites dans horseReal.js).
//
// La texture du GLB (« Hair12 ») est une fourrure frisée rangée en étoile : sur des rubans, elle donnait des
// plaques de caoutchouc. Ici, une bande de mèches droites : u le long de la mèche (0 racine, 1 pointe), v en
// travers ; quatre mèches différentes l'une au-dessus de l'autre (une par quart de la hauteur), chacune faite
// de crins fins de deux ou trois tons, aux pointes effilées et de longueurs inégales. Canaux (données, pas une
// couleur) : R ton du crin, G décalage du reflet (propre à chaque crin), B pente du crin en travers (relief),
// A couverture. Les niveaux réduits (mipmaps) gardent la même part de pixels opaques que l'image pleine : sans
// cela, la moyenne de l'alpha passe sous le seuil de découpe et les crins fondent au loin.

import * as THREE from 'three';
import { gfx } from '../gfx.js';

/** Taille de la bande de crins (u le long des crins, v en travers) et nombre de mèches rangées en hauteur. */
export const HAIR_TEX = { w: 512, h: 128, rows: 4, strands: 64 };
/** Seuil de découpe des crins (et de couverture des niveaux réduits). */
export const HAIR_CUT = 0.5;
/** Couleur des crins la plus claire (linéaire) : au-delà, le soleil les brûle en blanc uni. */
export const HAIR_TOP = 0.6;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Pixels de la bande de crins (flottants 0-1, RGBA), sans hasard d'un appel à l'autre (graine fixe).
 * Chaque crin est tracé de la racine à sa pointe, d'une largeur de 1 à 2,6 px, et se couche sur ceux d'avant
 * (« par-dessus ») ; les crins du bord de la mèche sont plus courts (mèche en pointe), la pointe de chaque
 * crin s'affine et s'efface sur ses 14 derniers %. Les racines (u < 0,06) sont pleines : pas de jour entre la
 * crinière et la peau.
 */
export function hairStrandPixels() {
  const { w: W, h: Hh, rows: ROWS, strands: NS } = HAIR_TEX;
  const RH = Hh / ROWS;
  const rgba = new Float32Array(W * Hh * 4);
  const rng = mulberry(9157);
  for (let k = 0; k < ROWS; k++) {
    const y0 = k * RH + 1; // (1 px vide entre deux mèches : pas de mélange au filtrage)
    const y1 = (k + 1) * RH - 1;
    const yc = (y0 + y1) / 2;
    const half = (y1 - y0) / 2;
    for (let s = 0; s < NS; s++) {
      // (crins plus serrés au milieu de la mèche : ses bords sont clairsemés, pas une arête droite)
      const sv = rng() * 2 - 1;
      const v0 = yc + Math.sign(sv) * Math.abs(sv) ** 1.5 * (half - 0.6);
      const e = Math.abs(v0 - yc) / half; // 0 au milieu de la mèche, 1 au bord
      const len = Math.min(1, (0.8 + 0.2 * rng()) * (1 - 0.1 * e * e));
      const hw = 0.5 + rng() * 0.8;
      const tone = [0.7, 0.84, 1][Math.floor(rng() * 3)] * (0.94 + rng() * 0.12);
      const shift = rng();
      const conv = 0.04 + rng() * 0.08;
      const wf = 1 + rng() * 2;
      const wp = rng() * 6.28;
      const u0 = rng() * 0.05; // (racine : chaque crin sort à sa place, pas de bord droit)
      for (let x = Math.floor(u0 * W); x < W; x++) {
        const u = (x + 0.5) / W;
        if (u > len) break;
        const fade = (1 - smooth(len - 0.14, len, u)) * smooth(u0, u0 + 0.015, u);
        const wt = hw * (1 - 0.45 * smooth(len - 0.2, len, u));
        const vc = v0 + (yc - v0) * conv * u + Math.sin(u * 6.28 * wf + wp) * 0.35;
        const ya = Math.max(Math.floor(y0), Math.floor(vc - wt - 1));
        const yb = Math.min(Math.ceil(y1) - 1, Math.ceil(vc + wt + 1));
        for (let y = ya; y <= yb; y++) {
          const d = Math.abs(y + 0.5 - vc);
          const cov = Math.min(1, Math.max(0, wt + 0.5 - d)) * fade;
          if (cov <= 0) continue;
          const i = (y * W + x) * 4;
          const a0 = rgba[i + 3];
          const a = cov + a0 * (1 - cov);
          const k0 = (a0 * (1 - cov)) / a;
          const k1 = cov / a;
          // (pente en travers : bord du crin tourné d'un côté ou de l'autre, comme un cylindre)
          const slope = Math.max(-1, Math.min(1, (y + 0.5 - vc) / Math.max(0.6, wt)));
          rgba[i] = rgba[i] * k0 + tone * k1;
          rgba[i + 1] = rgba[i + 1] * k0 + shift * k1;
          rgba[i + 2] = rgba[i + 2] * k0 + (0.5 + 0.5 * slope) * k1;
          rgba[i + 3] = a;
        }
      }
    }
    // Racines pleines, un peu plus sombres (le dessous de la mèche), qui commencent en dents irrégulières.
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      const us = 0.01 + rng() * 0.035;
      for (let x = 0; x < W * 0.08; x++) {
        const i = (y * W + x) * 4;
        const a0 = rgba[i + 3];
        const u = (x + 0.5) / W;
        const r = smooth(us, us + 0.012, u) * (1 - smooth(0.05, 0.08, u));
        if (a0 >= r) continue;
        rgba[i] = (rgba[i] * a0 + 0.62 * (r - a0)) / r;
        rgba[i + 1] = (rgba[i + 1] * a0 + 0.5 * (r - a0)) / r;
        rgba[i + 2] = (rgba[i + 2] * a0 + 0.5 * (r - a0)) / r;
        rgba[i + 3] = r;
      }
    }
  }
  // Pixels vides : couleur neutre (ton moyen, reflet et relief au repos), sinon le filtrage mêle du noir aux bords.
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a >= 0.999) continue;
    rgba[i] = rgba[i] * a + 0.82 * (1 - a);
    rgba[i + 1] = rgba[i + 1] * a + 0.5 * (1 - a);
    rgba[i + 2] = rgba[i + 2] * a + 0.5 * (1 - a);
  }
  return rgba;
}

/** Part des pixels dont l'alpha (× k) atteint le seuil. */
function coverage(rgba, k = 1, cut = HAIR_CUT) {
  let n = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] * k >= cut) n++;
  return n / (rgba.length / 4);
}

/**
 * Niveaux réduits (mipmaps) de la bande de crins jusqu'à 1 × 1 : moyenne 2 × 2 (couleur pondérée par l'alpha),
 * puis l'alpha est multiplié par le facteur qui redonne la même part de pixels au-dessus du seuil qu'au niveau
 * plein (recherche par dichotomie). Renvoie [{ data: Float32Array, width, height, coverage }].
 */
export function hairMipLevels(rgba, W = HAIR_TEX.w, H = HAIR_TEX.h) {
  const levels = [{ data: rgba, width: W, height: H, coverage: coverage(rgba) }];
  const c0 = levels[0].coverage;
  let src = rgba;
  let w = W;
  let h = H;
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1);
    const nh = Math.max(1, h >> 1);
    const out = new Float32Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let n = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const sx = Math.min(w - 1, x * 2 + dx);
            const sy = Math.min(h - 1, y * 2 + dy);
            const i = (sy * w + sx) * 4;
            const sa = src[i + 3] + 1e-4;
            r += src[i] * sa;
            g += src[i + 1] * sa;
            b += src[i + 2] * sa;
            a += sa;
            n++;
          }
        }
        const o = (y * nw + x) * 4;
        out[o] = r / a;
        out[o + 1] = g / a;
        out[o + 2] = b / a;
        out[o + 3] = Math.max(0, a / n - 1e-4);
      }
    }
    // (dichotomie sur le facteur d'alpha : même couverture qu'au niveau plein)
    let lo = 1;
    let hi = 4;
    for (let it = 0; it < 14; it++) {
      const mid = (lo + hi) / 2;
      if (coverage(out, mid) < c0) lo = mid;
      else hi = mid;
    }
    const k = (lo + hi) / 2;
    for (let i = 3; i < out.length; i += 4) out[i] = Math.min(1, out[i] * k);
    levels.push({ data: out, width: nw, height: nh, coverage: coverage(out) });
    src = out;
    w = nw;
    h = nh;
  }
  return levels;
}

let hairTex = null;

/** Texture de crins droits (partagée par tous les chevaux, jamais libérée avec l'un d'eux). */
export function hairTexture() {
  if (hairTex) return hairTex;
  const levels = hairMipLevels(hairStrandPixels());
  const bytes = levels.map((l) => {
    const d = new Uint8Array(l.data.length);
    for (let i = 0; i < d.length; i++) d[i] = Math.round(Math.min(1, Math.max(0, l.data[i])) * 255);
    return { data: d, width: l.width, height: l.height };
  });
  const tex = new THREE.DataTexture(bytes[0].data, bytes[0].width, bytes[0].height, THREE.RGBAFormat);
  tex.mipmaps = bytes;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace; // (données : ton, reflet, relief, couverture)
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = gfx.quality === 'high' ? 4 : 1;
  tex.needsUpdate = true;
  tex.userData.shared = true;
  hairTex = tex;
  return tex;
}

/**
 * Reflet des crins (modèle de Kajiya-Kay) : le long d'une mèche, la lumière fait une bande claire en
 * travers, là où la direction du crin est perpendiculaire à la bissectrice lumière-regard ; décalée crin par
 * crin (canal G de la texture), elle se casse en mèches au lieu d'un aplat. Ajouté à chaque lumière directe
 * (ombre du soleil comprise) : RE_Direct de three.js est remplacé par RE_Direct_Hair, qui appelle l'éclairage
 * habituel puis ajoute le reflet. Qualité haute (HAIR_HQ) : second reflet plus large teinté par les crins et
 * relief du crin en travers (canal B). En contre-jour, la lumière traverse les mèches (pointes surtout).
 */
const HAIR_LIGHT = /* glsl */ `
vec3 hHairT;
float hHairShift;
void RE_Direct_Hair( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  vec3 L = directLight.direction;
  // (diffus un peu « enveloppant » : la lumière passe entre les crins ; pas de reflet GGX, qui faisait de la
  // crinière noire une plaque grise satinée — le reflet des crins est la bande de Kajiya-Kay)
  float wrapNL = saturate( ( dot( geometryNormal, L ) + 0.3 ) / 1.3 );
  reflectedLight.directDiffuse += wrapNL * directLight.color * BRDF_Lambert( material.diffuseColor );
  vec3 H = normalize( L + geometryViewDir );
  float lit = smoothstep( -0.25, 0.35, dot( geometryNormal, L ) );
  vec3 T1 = normalize( hHairT + geometryNormal * ( hHairShift * 0.5 - 0.1 ) );
  float t1 = dot( T1, H );
  vec3 spec = vec3( pow( max( 0.0, 1.0 - t1 * t1 ), 64.0 ) * hHairSpec );
#ifdef HAIR_HQ
  vec3 T2 = normalize( hHairT + geometryNormal * ( hHairShift * 0.5 + 0.15 ) );
  float t2 = dot( T2, H );
  spec += material.diffuseColor * pow( max( 0.0, 1.0 - t2 * t2 ), 8.0 ) * hHairSpec * 2.2;
#endif
  reflectedLight.directSpecular += directLight.color * spec * lit;
  float back = pow( saturate( dot( geometryViewDir, - L ) ), 5.0 );
  reflectedLight.directDiffuse += directLight.color * material.diffuseColor * back * ( 0.2 + 0.7 * vHairF );
}
#undef RE_Direct
#define RE_Direct RE_Direct_Hair
`;

/**
 * Couleur de crins (linéaire) pour la matière ou les sommets d'une carte : crins presque noirs à peine éclaircis
 * (le reflet suffit à faire lire les mèches) ; ton moyen de la texture (≈ 0,85) compensé pour les crins foncés ;
 * crins clairs (lavés, crème, gris) plafonnés à HAIR_TOP, sinon le soleil les brûle en blanc uni.
 */
export function hairColor(hex) {
  const c = hex?.isColor ? hex.clone() : new THREE.Color(hex);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (l < 0.03) c.lerp(new THREE.Color(0x4a4442), 0.12);
  c.multiplyScalar(1.15 - 0.3 * smooth(0.15, 0.5, l));
  const top = Math.max(c.r, c.g, c.b);
  if (top > HAIR_TOP) c.multiplyScalar(HAIR_TOP / top);
  return c;
}

/**
 * Matière des cartes de crins (une par cheval : sa couleur ; un seul programme pour tous). color : couleur des
 * crins (cartes partagées par la race, ton gris par sommet), ou null pour des cartes colorées par sommet
 * (brosse bicolore du Fjord, fanons de la couleur du bas de chaque membre). sway : uniform de l'ondulation
 * (vitesse du cheval, coup de queue). Normales « de volume » (vers l'extérieur de la crinière, de la queue),
 * pas retournées au dos d'un ruban ; ondulation des pointes au vent, vers l'extérieur (jamais dans le cou).
 */
export function hairMaterial(color, sway) {
  const high = gfx.quality === 'high';
  // (cartes colorées par sommet : couleurs déjà plafonnées par hairColor ; la matière ne fait que compenser le
  // ton moyen de la texture)
  const c = color === null ? new THREE.Color(1, 1, 1) : hairColor(color);
  const l = color === null ? 0.5 : 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const m = new THREE.MeshStandardMaterial({
    color: c, map: hairTexture(), alphaTest: HAIR_CUT, side: THREE.DoubleSide, roughness: 0.75, metalness: 0,
    alphaToCoverage: gfx.msaa || high, vertexColors: true,
  });
  // (force du reflet : plus discret sur les crins clairs, qui ont déjà de la lumière)
  // (qualité basse : pas d'ombre du soleil, le reflet brillerait aussi du côté à l'ombre : plus discret)
  const spec = { value: (high ? 0.08 : 0.05) * (1 - 0.5 * Math.min(1, l * 2)) };
  // (crins foncés : les crins clairs de la texture un peu éclaircis, comme la lumière du ciel prise par chaque
  // crin — on lit les mèches même sans reflet, en qualité basse aussi)
  const lift = { value: 0.05 * (1 - smooth(0, 0.12, l)) };
  // (crinière tressée pour le concours de beauté : ses mèches rentrent dans les boutons de la crête, Beauty.js)
  const braid = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.hairBraid = braid;
    sh.uniforms.hairTime = gfx.time;
    sh.uniforms.hairWind = gfx.wind;
    sh.uniforms.hairSway = sway;
    sh.uniforms.hHairSpec = spec;
    sh.uniforms.hHairLift = lift;
    const def = high ? '#define HAIR_HQ\n' : '';
    sh.vertexShader = def + sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float hairG;
attribute vec3 hairT;
attribute vec4 hairRoot;
uniform float hairTime;
uniform float hairWind;
uniform float hairSway;
uniform float hairBraid;
varying vec3 vHairT;
varying float vHairF;`)
      .replace('#include <skinnormal_vertex>', `#include <skinnormal_vertex>
{
  vec3 hT = hairT;
#ifdef USE_SKINNING
  hT = ( skinMatrix * vec4( hT, 0.0 ) ).xyz;
#endif
  vHairT = normalize( mat3( modelViewMatrix ) * hT );
  vHairF = hairG;
}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
if ( hairRoot.w < 0.5 ) transformed = mix( transformed, hairRoot.xyz + ( transformed - hairRoot.xyz ) * 0.12, hairBraid );
{
  // Pointes qui ondulent au vent et quand le cheval court (racines immobiles) : une mèche bouge d'un bloc
  // (phase de sa racine), vers l'extérieur et d'avant en arrière ; la queue (hairRoot.w = 2) de côté aussi.
  float hw = hairG * hairG * ( 0.4 + hairWind * 0.45 + hairSway );
  float ph = hairTime * 2.1 + hairRoot.y * 6.0 + hairRoot.z * 4.0 - hairG * 1.6;
  transformed += normal * ( 0.5 + 0.5 * sin( ph ) ) * 0.012 * hw;
  transformed.z += cos( ph * 0.7 + 1.3 ) * 0.008 * hw;
  transformed.x += sin( ph ) * 0.012 * hw * step( 1.5, hairRoot.w );
}`);
    sh.fragmentShader = def + sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float hHairSpec;
uniform float hHairLift;
varying vec3 vHairT;
varying float vHairF;`)
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
${HAIR_LIGHT}`)
      // (reflet du ciel atténué : sur des normales « de volume » toutes tournées du même côté, les 4 % de
      // reflet d'un diélectrique faisaient de la crinière noire un aplat gris ; le reflet des crins, c'est
      // la bande de Kajiya-Kay)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
reflectedLight.indirectSpecular *= 0.3;`)
      .replace('#include <map_fragment>', `
vec4 hTex = texture2D( map, vMapUv );
diffuseColor.rgb = diffuseColor.rgb * hTex.r + hHairLift * max( 0.0, hTex.r - 0.62 );
diffuseColor.a *= hTex.a;`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
normal = normalize( vNormal );
hHairT = normalize( vHairT - normal * dot( vHairT, normal ) );
hHairShift = hTex.g - 0.5;
#ifdef HAIR_HQ
// (relief du crin en travers : un bord tourné vers la lumière, l'autre à l'ombre)
normal = normalize( normal + cross( normal, hHairT ) * ( hTex.b - 0.5 ) * 0.7 );
#endif`);
  };
  m.customProgramCacheKey = () => `horsehair${high ? 'h' : 'l'}`;
  m.userData.hairSpec = spec;
  m.userData.hairBraid = braid;
  return m;
}
