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
#ifdef H_REAL
  // Cheval réaliste : la corne commence à une hauteur nette (couronne), pas au bord d'un triangle.
  {
    float lh = isLeg + isHoof;
    isHoof = lh * (1.0 - smoothstep(hHoofY - 0.003, hHoofY + 0.003, P.y));
    isLeg = lh - isHoof;
  }
#endif
  float isBody = 1.0 - isHead - isLeg - isHoof - isSkin - isEar;
#ifdef H_REAL
  float headW = vHHead; // poids de la tête, continu (pas de dents de scie à la jonction avec l'encolure)
#else
  float headW = isHead;
#endif
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

  // Contre-ombrage : dos un peu plus foncé, ventre et intérieur des membres nettement plus clairs (le
  // ventre reste lisible au soleil, la lumière du sol l'éclaire peu). Le haut des membres suit la même
  // règle que le corps : pas de changement de teinte là où le membre sort du corps.
  float under = smoothstep(0.1, -0.8, up) * (isBody + isLeg);
  float inner = isLeg * smoothstep(0.15, 0.85, -sign(P.x) * normalize(vHNrm).x);
  float belly = under * isBody;
  c = mix(c, c * 1.38 + 0.03, clamp(under + inner * 0.55, 0.0, 1.0) * 0.62);
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
    float t = pn + isLeg * (1.0 - smoothstep(0.1, 0.7, h)) * 0.45 - headW * 0.5 + isBody * smoothstep(0.35, 0.9, up) * smoothstep(-0.6, -0.2, -abs(P.z + 0.1)) * 0.12;
    c = mix(c, hSec, smoothstep(0.49, 0.51, t) * hPinto * (1.0 - isHoof - isSkin));
  }

  // Isabelle / souris : raie de mulet le long du dos, zébrures sur les membres.
  if (hDun > 0.0) {
    float stripe = (1.0 - smoothstep(0.01, 0.028, abs(P.x) + (hNoise(P * 28.0) - 0.5) * 0.012)) * smoothstep(0.7, 0.95, up) * isBody;
    c = mix(c, hPointC * 0.75 + hCoat * 0.25, stripe * hDun);
    float bars = isLeg * smoothstep(0.5, 0.62, h) * (1.0 - smoothstep(0.8, 0.95, h)) * smoothstep(0.35, 0.95, sin(P.y * 75.0 + hSeed));
    c = mix(c, c * 0.72, bars * 0.55 * hDun);
  }

  // Gris truité : petites mouchetures brun-roux, surtout sur la tête, l'encolure et le corps.
  if (hFlea > 0.0) {
    float fl = mix(smoothstep(0.78, 0.86, hNoise(P * 95.0 + hSeed)), 0.12, aa) * (1.0 - isHoof - isSkin) * (1.0 - isLeg * (1.0 - smoothstep(0.5, 0.8, h)));
    c = mix(c, vec3(0.42, 0.27, 0.18), fl * 0.75 * hFlea);
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
#ifndef H_REAL
  c = mix(c, skin * 0.8, isHead * (1.0 - smoothstep(0.004, 0.012, abs(hl.y + 0.148 - (hl.z - 0.8) * 0.12))) * smoothstep(0.76, 0.8, hl.z) * smoothstep(0.03, 0.08, abs(hl.x)));
#endif

  // Naseaux en virgule (peints aussi : ils restent nets même quand le maillage est grossier).
#ifdef H_REAL
  float nos = 0.0; // (déjà dans le modelé de la texture)
#else
  float nos = isHead * (1.0 - smoothstep(0.8, 1.0, length(vec3((abs(hl.x) - 0.064) / 0.016, (hl.y + 0.045 + (abs(hl.x) - 0.064) * 0.8) / 0.036, (hl.z - 0.97) / 0.06))));
  c = mix(c, hSkin * 0.6, nos);
#endif
  // Peau nue (intérieur des oreilles et des naseaux, paupières) et sabots.
  c = mix(c, hSkin, isSkin);
  hBare = max(isSkin, max(nos, isHoof * 0.7));
  vec3 hoof = mix(hHoof, hHoofLight, step(0.01, sockH));
  hoof *= 0.9 + 0.12 * hNoise(vec3(P.x * 260.0, P.y * 8.0, P.z * 260.0));
  c = mix(c, hoof, isHoof);

  // Grain du poil (fin, couché vers l'arrière) et occlusion ambiante cuite.
#ifdef H_REAL
  // Modelé peint du modèle réaliste (muscles, poil, corne) : gris, 0,5 = moyen. C'est une photo : elle porte
  // aussi l'éclairage de la prise de vue (côtes, creux des muscles), qui doublait celui du jeu (robe « sale »,
  // « on voit les côtes »). Adouci (hDetail : 0,5, 0,35 sur les robes claires), un peu moins sur la corne
  // (stries), beaucoup sur les balzanes (l'ombre peinte de la balzane d'origine les coupait en deux) ; le
  // relief reste porté par la carte de normales.
  float hDet = mix(hDetail, 0.6, isHoof);
  hDet = mix(hDet, 0.2, sock * (1.0 - isHoof));
  c *= mix(1.0, hDetTex.r * 2.0, hDet);
#else
  c *= 1.0 + (hNoise(P * vec3(320.0, 110.0, 70.0)) - 0.5) * 0.07 * (1.0 - aa) * (1.0 - isHoof);
#endif
  // (plancher plus haut dessous : le ventre et l'intérieur des cuisses ne tombent pas au noir)
  c *= mix(mix(0.42, 0.62, clamp(under + inner, 0.0, 1.0)), 1.0, vHAO);
  diffuseColor.rgb = c;
}`;

/**
 * Satiné du poil ras et liseré de lumière, en qualité basse comme en haute (la robe en MeshStandard n'a pas de
 * sheen : elle était mate, « en plastique ») : un terme de bord (Fresnel) teinté par la robe, éclairé par le
 * ciel (gfx.skyRim) et par le soleil — fort en contre-jour, doré le soir puisque le soleil l'est. Pas sur la
 * peau nue ni sur la corne. Plus un petit appoint du soir et de la nuit (hFill) pour que la silhouette du
 * cheval reste lisible quand le soleil est couché. Quelques instructions par pixel.
 */
const RIM_FRAGMENT = /* glsl */ `
{
  vec3 hV = normalize( vViewPosition ); // (vers la caméra)
  float hF = pow( 1.0 - saturate( dot( normal, hV ) ), 4.0 );
  float hMax = max( max( diffuseColor.r, diffuseColor.g ), max( diffuseColor.b, 0.02 ) );
  vec3 hTint = mix( vec3( 1.0 ), diffuseColor.rgb / hMax, 0.7 ) * hRimTint;
  vec3 hRimL = hSkyRim;
#if NUM_HEMI_LIGHTS > 0
  // (le ciel éclaire le dos et les flancs, pas le dessous du ventre)
  hRimL *= saturate( dot( normal, hemisphereLights[ 0 ].direction ) * 0.5 + 0.6 );
#endif
#if NUM_DIR_LIGHTS > 0
  vec3 hL = directionalLights[ 0 ].direction;
  float hBack = saturate( dot( hL, -hV ) );
  float hWrap = saturate( dot( normal, hL ) * 0.6 + 0.4 );
  hRimL += directionalLights[ 0 ].color * hWrap * ( 0.04 + 0.24 * hBack * hBack );
#endif
  reflectedLight.indirectSpecular += hRimL * hTint * hF * ( 1.0 - hBare ) * hRim;
  reflectedLight.indirectDiffuse += diffuseColor.rgb * hSkyRim * hFill;
}`;

/**
 * Carte de relief du modèle réaliste : les marges de ses îlots sont noires (0, 0, 0), et le filtrage (bord d'un
 * îlot, mipmaps au loin) les mêle aux vraies normales : des normales renversées, d'où des coutures noires en
 * zigzag sur la ganache et l'encolure. Une vraie normale a z > 0 (bleu ≥ 0,5) : un texel plus sombre est en
 * partie « vide » ; on le divise par sa part de vrai texel (lue dans le bleu, comme une couleur prémultipliée),
 * et un texel presque tout vide devient plat.
 */
const NORMAL_MAP_FIX = /* glsl */ `
#ifdef USE_NORMALMAP_TANGENTSPACE
  vec3 hNt = texture2D( normalMap, vNormalMapUv ).xyz;
  float hCov = clamp( hNt.b / 0.9, 0.0, 1.0 );
  hNt = mix( hNt, hNt / max( hCov, 0.05 ), 1.0 - smoothstep( 0.55, 0.65, hNt.b ) );
  vec3 mapN = mix( vec3( 0.0, 0.0, 1.0 ), hNt * 2.0 - 1.0, smoothstep( 0.03, 0.15, hCov ) );
  mapN.xy *= normalScale;
  normal = normalize( tbn * mapN );
#else
#include <normal_fragment_maps>
#endif`;

/** Luminance (0-1) d'une couleur sRGB entière. */
const srgbLum = (hex) => (((hex >> 16) & 255) * 0.2126 + ((hex >> 8) & 255) * 0.7152 + (hex & 255) * 0.0722) / 255;

/** Couleur three.js (linéaire) depuis un entier sRGB. */
const col = (hex) => new THREE.Color(hex);

/**
 * Matière du pelage d'un cheval. Une matière par animal (ses couleurs), un seul programme GPU pour tous.
 * build : gabarit (horseBuild) ; breedFace : marque imposée par la race.
 */
export function coatMaterial(look, build, breed = null, real = null) {
  const high = gfx.quality === 'high';
  const tr = horseCoatTraits(look);
  const socks = horseSocks(look);
  const face = horseFaceMark(look, breed);
  const sheen = build.sheen ?? 0;
  const coat = col(look.coat);
  // Robe claire (gris, blanc, crème…) : modelé peint plus doux encore (voir COAT_FRAGMENT).
  const coatL = srgbLum(look.coat ?? 0x7a4528);
  const light = tr.grey > 0 || coatL > 0.55;
  // Teinte du reflet de bord : celle de la robe (dans le shader) × ce ton : doré (Akhal-Teké), brun chaud pour
  // les robes presque noires (sinon un liseré gris de latex), blanc sinon.
  const rimTint = sheen ? new THREE.Color(1, 0.86, 0.55) : coatL < 0.09 ? new THREE.Color(1, 0.78, 0.6) : new THREE.Color(1, 1, 1);
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
    hFlea: { value: tr.flea },
    hSocks: { value: new THREE.Vector4(...socks) },
    hFace: { value: face },
    hSeed: { value: ((look.seed ?? 1) % 997) * 0.731 },
    hHoofY: { value: real?.hoofY ?? 0 },
    hDetail: { value: light ? 0.35 : 0.5 },
    // Satiné et liseré (voir RIM_FRAGMENT) : force, teinte (dorée pour l'Akhal-Teké, brun chaud pour le noir),
    // lumière du ciel et appoint du soir (partagés, mis à jour par World.updateSky).
    hRim: { value: high ? 0.75 : 1 },
    hRimTint: { value: rimTint },
    hSkyRim: gfx.skyRim,
    hFill: gfx.horseFill,
  };
  // (Akhal-Teké : l'éclat passe par le satiné doré, pas par le métal — à 0,32, la robe reflétait l'herbe et
  // sortait kaki ou olive ; robes presque noires un peu moins lisses : le ciel y dessine les muscles.)
  const opts = {
    color: 0xffffff,
    roughness: sheen ? (high ? 0.34 : 0.38) : coatL < 0.09 ? 0.45 : 0.56,
    metalness: sheen ? 0.05 : 0.02,
  };
  // Ordinateur : reflet satiné du poil ras (sheen), très marqué et doré pour l'Akhal-Teké, brun chaud sur le noir.
  const sheenColor = sheen
    ? coat.clone().lerp(new THREE.Color(1, 0.82, 0.48), 0.55)
    : coatL < 0.09 ? new THREE.Color(0x5a4030) : coat.clone().lerp(new THREE.Color(1, 0.95, 0.85), 0.3);
  const m = high
    ? new THREE.MeshPhysicalMaterial({
      ...opts,
      sheen: coatL < 0.09 && !sheen ? 0.5 : 0.32 + sheen * 0.6,
      sheenRoughness: sheen ? 0.3 : 0.55,
      sheenColor,
    })
    : new THREE.MeshStandardMaterial(opts);
  // Cheval réaliste (horseReal.js) : modelé peint (gris) et relief du modèle, sabots à hauteur fixe.
  if (real) {
    m.map = real.detail;
    m.normalMap = real.normalMap ?? null;
    // (relief un peu moins creusé qu'avant, 0,7 au lieu de 0,9 : les côtes se voyaient encore de profil)
    m.normalScale.set(0.7, 0.7 * (real.normalSign ?? 1));
  }
  // H_REAL écrit dans le shader lui-même, pas dans m.defines : une copie de la matière (robe lustrée du
  // concours de beauté, Beauty.js) garde son onBeforeCompile mais material.copy() remet defines à zéro,
  // et le cheval réaliste perdait son modelé peint (robe de plastique).
  const def = real ? '#ifndef H_REAL\n#define H_REAL\n#endif\n' : '';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = def + sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float hPart;
attribute vec3 hInfo;
attribute float hAO;
#ifdef H_REAL
attribute float hHead;
varying float vHHead;
#endif
varying vec3 vHPos;
varying vec3 vHNrm;
flat varying float vHPart; // pas d'interpolation entre deux parties (sinon : fausses balzanes aux bords)
varying vec3 vHInfo;
varying float vHAO;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vHPos = position; vHNrm = normal; vHPart = hPart; vHInfo = hInfo; vHAO = hAO;
#ifdef H_REAL
vHHead = hHead;
#endif`);
    sh.fragmentShader = def + sh.fragmentShader
      .replace('#include <common>', `#include <common>
${Object.keys(u).map((k) => `uniform ${k === 'hSocks' ? 'vec4' : u[k].value.isColor || Array.isArray(u[k].value) ? 'vec3' : 'float'} ${k};`).join('\n')}
varying vec3 vHPos;
varying vec3 vHNrm;
flat varying float vHPart; // pas d'interpolation entre deux parties (sinon : fausses balzanes aux bords)
varying vec3 vHInfo;
varying float vHAO;
#ifdef H_REAL
varying float vHHead;
#endif
float hBare; // peau nue et sabots : pas de reflet satiné du poil
${NOISE}`)
      .replace('#include <map_fragment>', `${real ? 'vec4 hDetTex = texture2D( map, vMapUv );' : '#include <map_fragment>'}
${COAT_FRAGMENT}`)
      // Sabots plus lisses et brillants que le poil.
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor *= mix(1.0, 0.55, step(5.5, vHPart) * step(vHPart, 6.5));`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_SHEEN
material.sheenColor *= 1.0 - hBare;
#endif`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
${RIM_FRAGMENT}`);
    if (real) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', NORMAL_MAP_FIX);
  };
  m.customProgramCacheKey = () => `horsecoat${high ? 'p' : 's'}${real ? 'r' : ''}`;
  m.userData.horseUniforms = u;
  return m;
}

/**
 * Matière des crins : mèches semi-transparentes colorées par sommet (crinière bicolore du Fjord,
 * mèches plus claires ou plus foncées), qui ondulent au vent et quand le cheval court.
 */
export function maneMaterial(sway) {
  // Ordinateur (anticrénelage actif) : bords des mèches adoucis (alphaToCoverage) au lieu de marches.
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, map: maneTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.62,
    alphaToCoverage: gfx.msaa || gfx.quality === 'high',
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
