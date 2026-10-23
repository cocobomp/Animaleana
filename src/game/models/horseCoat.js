// Pelage du cheval peint par un petit shader, sans texture par animal : la robe est calculée à
// chaque pixel à partir de la position « au repos » (le motif colle à la peau quand le cheval bouge).
// Bai (crins et bas des membres noirs), alezan, gris pommelé, isabelle (raie de mulet, zébrures),
// rouan, pie (tobiano), léopard, couverture, balzanes, marques en tête, bout du nez, sabots,
// contre-ombrage (dos plus foncé, ventre plus clair), occlusion ambiante cuite dans le maillage.
// Les crins ondulent au vent et à l'allure (vertex shader).

import * as THREE from 'three';
import { maneTexture, eyeTexture } from '../textures.js';
import { gfx, keepFrameAlpha } from '../gfx.js';
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
// Bruit cellulaire : distances aux deux centres de cellule les plus proches (F1, F2 : F2 - F1 est nul sur la
// frontière entre deux cellules, un réseau de lignes de largeur égale) et une valeur propre à la cellule.
vec3 hCell(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); float d = 8.0; float d2 = 8.0; float id = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = vec3(hHash(i + g), hHash(i + g + 19.1), hHash(i + g + 47.7));
    vec3 r = g + o - f; float dd = dot(r, r);
    if (dd < d) { d2 = d; d = dd; id = hHash(i + g + 5.3); } else if (dd < d2) { d2 = dd; }
  }
  return vec3(sqrt(d), sqrt(d2), id);
}`;

/**
 * Réglages des robes (étape 8 du plan « cheval beau ») : lus par le shader (constantes écrites dans son texte) et
 * par les tests. Gris pommelé : fond foncé entre les pommelures (dark), pommelures éclaircies (light), cellules par
 * mètre (cell), rayon des pommelures (rMin à rMax, en cellules), largeur de leur bord flou (soft) et part de la robe
 * qu'elles couvrent en moyenne (mean : valeur prise au loin, même teinte d'ensemble). Pie : champ d'avant l'étape 8
 * un peu déformé (warp, en unités du bruit), bord déchiqueté (jag). Léopard : rayon des taches (en cellules de 12 cm
 * environ), halo marbré autour. Isabelle : largeur de la raie de mulet (m).
 */
export const COAT_LOOKS = {
  dapple: { dark: 0.26, light: 0.16, cell: 7.5, rMin: 0.36, rMax: 0.53, soft: 0.2, mean: 0.55 },
  pinto: { warp: 0.12, jag: 0.06 },
  spots: { rMin: 0.13, rMax: 0.38, halo: 0.08 },
  dun: { stripe: 0.03 },
  // robes dorées : pommelures de santé (fond × 1 - dark), plus marquées sur le palomino
  bloom: { dark: 0.16 },
  // Rouan : part de blanc sur un poil blanc, seuil du bruit au-dessus duquel un poil est blanc (cut : 8,7 % des poils),
  // la même part au loin (far : le motif fondu en sa moyenne) ; robe de base tirée de la teinte d'ensemble de la race
  // (saturation × sat, clarté × light)
  roan: { white: 0.85, cut: 0.76, far: 0.087, sat: 5, light: 0.62 },
  // Appaloosa « couverture » : inclinaison du bord avant (m vers l'avant par m de hauteur)
  blanket: { slope: 0.55 },
};

const glf = (x) => Number(x).toFixed(4);
/** Ombre du toupet sur le front (part de lumière en moins sous lui). */
export const FORE_SHADE = 0.34;
/** Ombre du toupet en plus (part de FORE_SHADE) quand des crins clairs sont sur une robe claire. */
export const FORE_SHADE_LIGHT = 0.6;

/** Crins clairs sur une robe claire (0 à 1) : gris, blanc, crème aux crins clairs. */
export function lightManeOnLight(look) {
  const l = (hex) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
  const s = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return s(0.25, 0.45, l(look.mane ?? 0x1b1410)) * s(0.25, 0.45, l(look.coat ?? 0x7a4528));
}
const { dapple: DAP, pinto: PIN, spots: SPOT, dun: DUN, roan: ROAN, blanket: BLANKET } = COAT_LOOKS;

const COAT_FRAGMENT = /* glsl */ `
hBare = 0.0;
hMuz = 0.0;
hHoofV = 0.0;
hGrainV = 0.5;
hDarkV = 0.0;
hEarIn = 0.0;
{
  vec3 P = vHPos;
  float part = vHPart;
  float isHead = step(0.5, part) * step(part, 1.5);
  float isLeg = step(1.5, part) * step(part, 5.5);
  float isHoof = step(5.5, part) * step(part, 6.5);
  float isSkin = step(6.5, part) * step(part, 7.5);
  float isEar = step(7.5, part);
#ifdef H_REAL
  // (repère de la tête et hauteur relative au coude justes sur tous les sommets, même ceux d'une autre partie dans un
  // triangle à cheval entre deux parties : voir hHL dans horseReal.js)
  float h = isEar > 0.5 ? vHInfo.x : vHHL.w;
  vec3 hl = vHHL.xyz;
#else
  float h = vHInfo.x;          // membres : hauteur relative (0 = sol, 1 = coude) ; oreilles : 0 = base, 1 = pointe
  vec3 hl = vHInfo;            // tête : position dans le repère de la tête (÷ longueur de la tête)
#endif
  float legI = vHInfo.y;
  vec2 hc = vec2(0.0);
#ifdef H_REAL
  // Cheval réaliste : la corne commence à la couronne, une hauteur nette (pas le bord d'un triangle) qui descend de
  // la pince vers les talons ; les glomes, au-dessus de la couronne des talons, restent de peau et de poil (ils
  // étaient peints en corne : des « ergots » gris derrière le paturon).
  {
    float lh = isLeg + isHoof;
    hc = legI < 0.5 ? hHoofA.xy : legI < 1.5 ? hHoofA.zw : legI < 2.5 ? hHoofB.xy : hHoofB.zw;
    float cor = hHoofY * mix(0.55, 1.0, smoothstep(-0.045, 0.03, P.z - hc.y));
    isHoof = lh * (1.0 - smoothstep(cor - 0.003, cor + 0.003, P.y));
    isLeg = lh - isHoof;
  }
#endif
  float isBody = 1.0 - isHead - isLeg - isHoof - isSkin - isEar;
#ifdef H_REAL
  float headW = vHHead; // poids de la tête, continu (pas de dents de scie à la jonction avec l'encolure)
  // Poids du corps, continu lui aussi à la jonction de la tête : le numéro de partie (constant par triangle,
  // isBody) découpait en dents de scie, derrière l'œil, sous l'oreille et le long de la ganache, tout ce qui
  // ne vaut que pour le corps — réseau des pommelures d'un gris, ventre éclairci (contre-ombrage), robes dorées,
  // raie de mulet, rouan : des plaques grises nettes sur la joue des chevaux gris.
  float bodyS = clamp(isBody + isHead + isEar, 0.0, 1.0) * (1.0 - headW);
#else
  float headW = isHead;
  float bodyS = isBody;
#endif
  // Poids du corps prolongé sur le haut des membres, continu au coude et au grasset (hauteur relative au coude,
  // la même sur le corps et sur les membres) : le numéro de partie, constant par triangle, y découpait en dents de
  // scie ce qui ne vaut que pour le corps — ventre éclairci du pangaré (des dents noires dans la bande claire du
  // Trotteur noir pangaré et du Fjord), ton et pommelures des robes dorées.
  float bodyL = clamp(bodyS + isLeg * smoothstep(0.55, 0.9, h), 0.0, 1.0);
  float up = normalize(vHNrm).y;
  float aa = clamp(length(fwidth(P)) * 140.0, 0.0, 1.0); // atténue les détails fins au loin (pas de scintillement)
  // (motifs larges — pommelures, taches — fondus en leur moyenne seulement quand un pixel couvre plusieurs cm)
  float aaW = clamp(length(fwidth(P)) * 22.0 - 0.15, 0.0, 1.0);
  vec3 c = hCoat * 0.9;

  // (grain du poil, en traînées le long du corps : casse le reflet)
  hGrainV = mix(hNoise(P * vec3(240.0, 120.0, 45.0)), 0.5, aa);
  // Reflets doux : zones un peu plus chaudes ou plus froides, jamais un aplat.
  float n1 = hFbm(P * 2.3 + hSeed);
  c *= 0.93 + n1 * 0.14;

  // Gris pommelé : pommelures claires, rondes et floues, de tailles inégales (distance au centre de cellule le plus
  // proche, F1, rayon propre à chaque cellule), sur un fond gris plus foncé et large entre elles ; un peu déformées ;
  // une cellule sur deux redivisée en pommelures plus petites en qualité haute ; nettes sur le corps, la croupe et
  // l'épaule, fondues vers le ventre et le bas des membres, fondues en leur moyenne au loin ; tête et bas des membres
  // plus foncés. (Avant : un réseau de fines lignes grises sur fond blanc, rapport F1 / F2 — au téléphone, une
  // mosaïque « girafe » ou une terre craquelée.) Les gris sans pommelures (hGrey 0,4 : « Gris », « Gris clair »,
  // poulains) n'ont que la tête et le bas des membres plus foncés : pas de bruit cellulaire à calculer.
  if (hGrey > 0.0) {
    if (hGrey > 0.5) {
      vec3 Pd = P + (vec3(hNoise(P * 3.1 + hSeed), hNoise(P * 3.1 + hSeed + 11.0), hNoise(P * 3.1 + hSeed + 23.0)) - 0.5) * 0.09;
      vec3 cl = hCell(Pd * ${glf(DAP.cell)} + hSeed);
      float d1 = cl.x + (hNoise(P * 26.0) - 0.5) * 0.07 + (hNoise(P * 7.0 + hSeed) - 0.5) * 0.1;
      float r = mix(${glf(DAP.rMin)}, ${glf(DAP.rMax)}, fract(cl.z * 5.3));
      float spot = 1.0 - smoothstep(r - ${glf(DAP.soft)}, r + 0.05, d1);
#ifdef H_HQ
      vec3 cs = hCell(Pd * ${glf(DAP.cell * 1.9)} + hSeed * 1.3 + 5.0);
      spot = max(spot, (1.0 - smoothstep(r - ${glf(DAP.soft)}, r + 0.05, cs.x)) * step(0.5, cl.z));
#endif
      spot = mix(spot, ${glf(DAP.mean)}, aaW);
      float zone = min(1.0, (bodyS + isLeg * smoothstep(0.55, 0.9, h)) * smoothstep(-0.7, 0.1, up) * (0.6 + 0.55 * hFbm(P * 1.3 + 3.0)));
      c *= mix(1.0 - ${glf(DAP.dark)} * zone, 1.0 + ${glf(DAP.light)} * zone, spot);
    }
    c = mix(c, c * 0.55, isLeg * (1.0 - smoothstep(0.12, 0.55, h)) * 0.85);
    c = mix(c, c * 0.74, isHead * smoothstep(0.5, 0.95, hl.z) * 0.8);
  }

  // Robes dorées (palomino surtout, un peu l'alezan et le bai) : pommelures de santé, discrètes, et un ton plus chaud
  // et plus saturé dans la lumière (avant : un jaune plat, en plastique beige en basse).
  // (les pommelures, le seul calcul coûteux, ne sont faites que là où elles se voient : pas sur le bai, la robe la
  // plus courante, où elles ne faisaient que 4 %)
  if (hGold * hGoldDap > 0.3 && hGrey <= 0.0) {
    vec3 Pd = P + (vec3(hNoise(P * 3.1 + hSeed), hNoise(P * 3.1 + hSeed + 11.0), 0.5) - 0.5) * 0.08;
    vec3 cl = hCell(Pd * ${glf(DAP.cell * 0.9)} + hSeed * 1.7);
    float net = mix(smoothstep(0.3, 0.55, cl.x + (hNoise(P * 26.0) - 0.5) * 0.1), 0.45, aaW);
    float zone = bodyL * smoothstep(-0.3, 0.4, up) * (0.4 + 0.7 * hFbm(P * 1.3 + 9.0)) * hGold * hGoldDap;
    c *= 1.0 - net * ${glf(COAT_LOOKS.bloom.dark)} * zone;
  }
  c = mix(c, c * vec3(1.06, 0.98, 0.84), hGold * hGoldDap * bodyL * 0.7);

  // Contre-ombrage : dos un peu plus foncé, ventre et intérieur des membres nettement plus clairs (le
  // ventre reste lisible au soleil, la lumière du sol l'éclaire peu). Le haut des membres suit la même
  // règle que le corps : pas de changement de teinte là où le membre sort du corps. (Robes presque noires :
  // presque rien d'ajouté, sinon un voile gris de latex sous le ventre.)
  float under = smoothstep(0.1, -0.8, up) * (bodyS + isLeg);
  float inner = isLeg * smoothstep(0.15, 0.85, -sign(P.x) * normalize(vHNrm).x);
  float belly = under * bodyL;
  float lift = 0.03 * clamp(dot(hCoat, vec3(0.2126, 0.7152, 0.0722)) * 8.0 + 0.3, 0.0, 1.0);
  c = mix(c, c * 1.38 + lift, clamp(under + inner * 0.55, 0.0, 1.0) * 0.62);
  c *= 1.0 - smoothstep(0.55, 1.0, up) * 0.06 * bodyS;
  // Pangaré (Fjord, poneys) : ventre, tour des yeux et bout du nez plus clairs.
  float muzzleZone = isHead * smoothstep(0.82, 0.95, hl.z);
  c = mix(c, mix(c, vec3(0.94, 0.86, 0.72), 0.55), hMealy * clamp(belly * 1.4 + muzzleZone, 0.0, 1.0));

  // Bai, isabelle : crins noirs et bas des membres noirs ; pointes des oreilles noires.
  float pts = isLeg * (1.0 - smoothstep(0.42, 0.62, h + (hNoise(P * 24.0) - 0.5) * 0.1));
  c = mix(c, hPointC * 0.95 + c * 0.05, pts * hPoints);
  c = mix(c, hPointC, isEar * smoothstep(0.65, 0.95, h) * max(hPoints, 0.6));

  // Pie (tobiano) : grandes plaques blanches qui coupent le dos et montent des membres, tête foncée (sa marque en
  // tête à part). Pour une graine donnée, les plaques sont celles d'avant l'étape 8 du plan (même champ de bruit,
  // même seuil) : le cheval d'une partie sauvegardée garde ses marques et tout son blanc — le bruit étiré en hauteur
  // de l'étape 8 lui en retirait l'essentiel (un Shetland pie presque noir). Seuls les bords changent : un peu
  // déformés (quelques centimètres, les plaques restent en place) et déchiquetés, au lieu des ronds d'une vache.
  if (hPinto > 0.0) {
    vec3 q = P * vec3(1.7, 1.4, 1.7) + hSeed * 3.1;
    vec3 w = vec3(hNoise(P * 4.0 + 1.7), hNoise(P * 4.0 + 9.2), hNoise(P * 4.0 + 4.4)) - 0.5;
    float pn = hFbm(q + w * ${glf(PIN.warp)}) + (hNoise(P * 9.0) - 0.5) * 0.06;
    float jag = (hNoise(P * 20.0 + hSeed) - 0.5) * ${glf(PIN.jag)};
    float back = bodyS * smoothstep(0.35, 0.9, up) * smoothstep(-0.6, -0.2, -abs(P.z + 0.1));
    float t = pn + jag + isLeg * (1.0 - smoothstep(0.1, 0.7, h)) * 0.45 - headW * 0.5 + back * 0.12;
    float wdt = max(fwidth(t) * 0.75, 0.002);
    c = mix(c, hSec, smoothstep(0.5 - wdt, 0.5 + wdt, t) * hPinto * (1.0 - isHoof - isSkin));
  }

  // Isabelle / souris : raie de mulet nette et assez large le long du dos (du garrot à la queue), zébrures sur les
  // membres, tête un peu plus foncée.
  if (hDun > 0.0) {
    float stripe = (1.0 - smoothstep(${glf(DUN.stripe * 0.55)}, ${glf(DUN.stripe)}, abs(P.x) + (hNoise(P * 28.0) - 0.5) * 0.012)) * smoothstep(0.62, 0.9, up) * bodyS;
    c = mix(c, hPointC * 0.85 + hCoat * 0.15, stripe * hDun * 0.9);
    float bars = isLeg * smoothstep(0.48, 0.6, h) * (1.0 - smoothstep(0.82, 0.97, h)) * smoothstep(0.3, 0.9, sin(P.y * 70.0 + hSeed + hNoise(P * 9.0) * 2.0));
    c = mix(c, mix(c, hPointC, 0.45), bars * 0.75 * hDun);
    c = mix(c, c * 0.8, isHead * smoothstep(0.35, 0.8, hl.z) * 0.6 * hDun);
  }

  // Gris truité : petites mouchetures brun-roux, surtout sur la tête, l'encolure et le corps.
  if (hFlea > 0.0) {
    float fl = mix(smoothstep(0.78, 0.86, hNoise(P * 95.0 + hSeed)), 0.12, aa) * (1.0 - isHoof - isSkin) * (1.0 - isLeg * (1.0 - smoothstep(0.5, 0.8, h)));
    c = mix(c, vec3(0.42, 0.27, 0.18), fl * 0.75 * hFlea);
  }

  // Rouan : poils blancs mêlés à la robe de base (plus saturée que la teinte d'ensemble de la race, voir roanBase)
  // sur le corps, 7 % de blanc de près comme au loin ; la tête et le bas des membres gardent la couleur de base. Le
  // mélange est en lumière linéaire : sur un fond foncé, un peu de blanc pèse lourd — avec 19 % de blanc sur un brun
  // peu saturé, le flanc d'un Trait breton rouan se lisait gris au téléphone (saturation 0,03) ; avec moins de blanc
  // sur un fond roux plus saturé, il reste rouan rouge (flanc brun rosé, la tête et les membres restés roux).
  if (hRoan > 0.0) {
    // (8,7 % des valeurs du bruit au-dessus de 0,76 ; même part au loin)
    float speck = mix(step(${glf(ROAN.cut)}, hNoise(P * 170.0)), ${glf(ROAN.far)}, aa);
    float zone = bodyS + isLeg * smoothstep(0.5, 0.75, h);
    c = mix(c, hWhite, speck * ${glf(ROAN.white)} * hRoan * zone);
    c = mix(c, c * 0.9, (headW + isLeg * (1.0 - smoothstep(0.35, 0.6, h))) * hRoan * 0.7);
  }

  // Léopard (robe blanche à taches) et couverture (croupe blanche tachetée) : taches de tailles inégales, un peu
  // allongées, plus nombreuses vers l'arrière, cernées d'un halo marbré (la peau foncée sous le poil blanc) ; plus
  // petites sur la tête et le bas des membres ; bord de la couverture givré. (Avant : des pois ronds tous pareils.)
  if (hLeopard + hBlanket > 0.0) {
    // (cellules d'avant l'étape 8 : mêmes taches, aux mêmes places, pour un cheval déjà là)
    vec3 cl = hCell(P * vec3(8.5, 8.5, 7.5) + hSeed);
    float small = clamp(headW + isLeg * (1.0 - smoothstep(0.3, 0.85, h)), 0.0, 1.0);
    float r = mix(${glf(SPOT.rMin)}, ${glf(SPOT.rMax)}, fract(cl.z * 3.7)) * mix(1.15, 0.7, small);
    float dd = cl.x + (hNoise(P * 45.0) - 0.5) * 0.06;
    float rear = smoothstep(0.35, -0.55, P.z);
    // (les taches d'avant — step(0,22, id) — toutes gardées, et quelques-unes de plus vers l'arrière)
    float present = max(step(0.22, cl.z), step(mix(0.22, 0.04, rear) - hBlanket * 0.08, cl.z));
    float spot = (1.0 - smoothstep(r - 0.025, r + 0.025, dd)) * present;
    float halo = (1.0 - smoothstep(r + 0.02, r + ${glf(SPOT.halo + 0.04)}, dd)) * present * (1.0 - spot) * (0.45 + 0.55 * hNoise(P * 90.0));
    if (hBlanket > 0.0) {
      // (bord avant incliné : plus en avant sur le rein, il recule vers le ventre et la cuisse ; déchiqueté, à grande et
      // petite échelle — avant : un plan vertical, une coupe droite au milieu du flanc, comme peinte)
      float edge = -(P.z + 0.15) + ${glf(BLANKET.slope)} * (P.y - 1.12) + (hFbm(P * 2.2 + hSeed) - 0.5) * 0.34 + (hNoise(P * 14.0) - 0.5) * 0.1 + (hNoise(P * 38.0) - 0.5) * 0.035;
      // (bas de la couverture d'après la hauteur, pas d'après l'orientation de la peau ni la partie du corps,
      // constante par triangle : elle découpait des dents de scie sur la cuisse)
      float onBody = smoothstep(1.02, 1.22, h + (hFbm(P * 4.0 + 5.0) - 0.5) * 0.25) * (bodyS + isLeg);
      float bl = smoothstep(-0.04, 0.04, edge) * onBody;
      float frost = (1.0 - smoothstep(0.0, 0.12, abs(edge + 0.06))) * mix(step(0.5, hNoise(P * 150.0)), 0.5, aa) * onBody;
      vec3 inside = mix(hSec, hCoat, spot);
      inside = mix(inside, mix(hSec, hCoat, 0.3), halo * 0.5);
      // (quelques taches blanches détachées devant le bord, sur la robe foncée : des flocons, pas une ligne)
      float flake = (1.0 - smoothstep(r * 0.55 - 0.02, r * 0.55 + 0.02, dd)) * step(0.55, fract(cl.z * 7.3))
        * smoothstep(-0.3, -0.08, edge) * (1.0 - bl) * onBody;
      c = mix(c, hSec, frost * 0.6 * hBlanket);
      c = mix(c, hSec, flake * 0.9 * hBlanket);
      c = mix(c, inside, bl * hBlanket);
    } else {
      float k = hLeopard * (1.0 - isHoof - isSkin);
      c = mix(c, mix(hCoat, hSec, 0.45), halo * 0.7 * k);
      c = mix(c, hSec, spot * k);
    }
  }

  // Balzanes : blanc en bas des membres (hauteur propre à chaque membre).
  float sockH = legI < 0.5 ? hSocks.x : legI < 1.5 ? hSocks.y : legI < 2.5 ? hSocks.z : hSocks.w;
  float sock = isLeg * step(0.01, sockH) * (1.0 - smoothstep(sockH - 0.015, sockH + 0.015, h + (hNoise(P * 35.0) - 0.5) * 0.07));
  c = mix(c, hWhite, sock);

  // Marques en tête : étoile, liste, large liste, ladre (repère de la tête : z = 0 nuque, 1 bout du nez). Bords
  // irréguliers : la largeur de la liste ondule le long du chanfrein, pas pareil des deux côtés, avec une dentelure
  // fine (avant : un ruban adhésif aux bords parallèles).
  float face = 0.0;
  if (hFace > 0.5 && isHead > 0.5) {
    float fn = (hNoise(P * 40.0) - 0.5) * 0.06;
    float wob = (hNoise(vec3(hl.z * 9.0, hSeed, 1.7)) - 0.5) * 0.024 + (hNoise(vec3(hl.z * 31.0, hl.x * 18.0, hSeed)) - 0.5) * 0.01
      + (hNoise(vec3(hl.z * 6.0 + sign(hl.x) * 3.1, hSeed, 4.2)) - 0.5) * 0.014;
    float ax = abs(hl.x) + wob;
    float front = smoothstep(-0.02, 0.06, hl.y + 0.1 * smoothstep(0.75, 1.0, hl.z));
    float star = 1.0 - smoothstep(0.8, 1.0, length(vec2(hl.x / 0.045, (hl.z - 0.31) / 0.05)) + fn * 6.0 + (hNoise(P * 90.0) - 0.5) * 0.35);
    float stripe = (1.0 - smoothstep(0.016, 0.027, ax + fn * 0.4)) * smoothstep(0.3, 0.34, hl.z) * (1.0 - smoothstep(0.9, 0.95, hl.z));
    float blaze = (1.0 - smoothstep(0.042, 0.054, ax - hl.z * 0.035 + fn)) * smoothstep(0.24, 0.28, hl.z);
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
  // Cheval réaliste : le bout du nez a un poil ras et clairsemé (plus foncé, plus lisse, hMuz) ; naseau ouvert,
  // une virgule sombre autour de la fente du modèle (hNos : centre et taille, repère de la tête), à peine
  // visible depuis que le modelé peint est adouci.
  hMuz = isHead * smoothstep(0.84, 0.97, hl.z);
  c *= 1.0 - 0.16 * hMuz * (1.0 - face);
  vec3 nq = vec3(abs(hl.x) - hNos.x, hl.y - hNos.y, hl.z - hNos.z);
  float nd = length(vec3((nq.x - nq.z * 0.35) / hNos.w, (nq.y + nq.x * 0.5) / (hNos.w * 0.8), nq.z / (hNos.w * 1.25)));
  float nos = isHead * step(0.001, hNos.w) * (1.0 - smoothstep(0.62, 1.0, nd));
  float nosRim = isHead * step(0.001, hNos.w) * (1.0 - smoothstep(1.0, 1.7, nd)) * (1.0 - nos);
  c = mix(c, c * 0.72, nosRim * 0.6);
  c = mix(c, hSkin * 0.32, nos * 0.92);
  // Yeux : bord des paupières foncé (l'œil se lit plus grand, même de loin) ; gris et appaloosas : peau noire
  // marbrée (de rose chez l'appaloosa) autour des yeux et au bout du nez, sous un poil clair et ras.
  float eyeD = hEye.w > 0.0 ? length(vec3(abs(hl.x) - hEye.x, hl.y - hEye.y, hl.z - hEye.z)) / hEye.w : 99.0;
  // (marbrures petites et serrées, rose foncé et gris — pas des plaques blanches, qui se lisaient comme une maladie
  // de peau —, seulement au bord des naseaux, sur les lèvres et en un fin cercle autour de l'œil)
  if (hSkinMot > 0.0) {
    float mot = hNoise(P * 110.0 + hSeed) * 0.6 + hNoise(P * 260.0) * 0.4;
    vec3 mottled = mix(hSkin, mix(vec3(0.32, 0.2, 0.19), vec3(0.16, 0.14, 0.14), step(0.62, hNoise(P * 45.0 + hSeed))), smoothstep(0.5, 0.62, mot) * hSkinPink);
    float spect = 1.0 - smoothstep(1.12, 1.55, eyeD + (hNoise(P * 40.0) - 0.5) * 0.25);
    float snout = smoothstep(0.86, 0.94, hl.z + (hNoise(P * 30.0) - 0.5) * 0.03);
    c = mix(c, mottled, isHead * clamp(spect * 0.5 + snout * 0.85, 0.0, 1.0) * hSkinMot * (1.0 - face * 0.6));
  }
  // Ombre du toupet sur le front (contact, douce, plus large que lui : un liseré d'ombre autour de ses bords et de sa
  // pointe) : un toupet clair sur une robe claire se détache par son ombre au lieu d'une plaque pâle translucide ;
  // sous un toupet foncé, à peine visible.
  if (hFore.w > 0.0 && isHead > 0.5) {
    float ff = (hl.z - hFore.x) / max(1e-3, hFore.y - hFore.x);
    float fw = hFore.z * (1.0 - 0.85 * pow(smoothstep(0.05, 0.85, ff), 0.85)) * 1.7 + 0.012;
    float fsh = smoothstep(-0.04, 0.06, ff) * (1.0 - smoothstep(0.85, 1.15, ff)) * (1.0 - smoothstep(fw * 0.45, fw, abs(hl.x))) * smoothstep(-0.03, 0.02, hl.y);
    c *= 1.0 - ${glf(FORE_SHADE)} * fsh * hFore.w;
  }
  // (plus épais au-dessus : le bord de la paupière supérieure et ses cils)
  float lidR = hl.y > hEye.y ? 1.24 : 1.14;
  float lidD = isHead * (1.0 - smoothstep(1.03, lidR, eyeD));
  c = mix(c, hSkin * 0.5, lidD * 0.88);
  // Intérieur des oreilles (face avant creusée, hors du bord) : peau foncée au fond, poils clairs vers les bords.
  {
    float inEar = isEar * clamp(vHInfo.z, 0.0, 1.0) * (1.0 - smoothstep(0.78, 0.98, abs(vHInfo.y))) * (1.0 - smoothstep(0.8, 0.95, h));
    // (poils clairs en mèches, plus nombreux le long des bords et en bas de l'oreille, sur un fond plus foncé que la
    // robe ; mat : pas le reflet d'un creux de plastique noir)
    float hairs = clamp(smoothstep(0.2, 0.65, abs(vHInfo.y)) + 1.0 - smoothstep(0.25, 0.5, h), 0.0, 1.0) * 0.75 + 0.25;
    float streak = 0.45 + 0.55 * hNoise(vec3(vHInfo.y * 18.0, h * 5.0, hSeed));
    vec3 inC = mix(c * 0.45 + hSkin * 0.25, vec3(0.66, 0.62, 0.56), hairs * streak);
    c = mix(c, inC, inEar * 0.85);
    hEarIn = inEar;
  }
  float nosB = nos;
#else
  float nos = isHead * (1.0 - smoothstep(0.8, 1.0, length(vec3((abs(hl.x) - 0.064) / 0.016, (hl.y + 0.045 + (abs(hl.x) - 0.064) * 0.8) / 0.036, (hl.z - 0.97) / 0.06))));
  c = mix(c, hSkin * 0.6, nos);
  float nosB = nos;
#endif
  // Peau nue (intérieur des oreilles et des naseaux, paupières) et sabots.
  c = mix(c, hSkin, isSkin);
  hBare = max(isSkin, max(nosB, isHoof * 0.7));
#ifdef H_REAL
  hBare = max(hBare, lidD);
#endif
  // Sabots : corne foncée, ou claire et propre sous une balzane, stries verticales de pousse bien marquées ;
  // appaloosa : corne rayée de bandes claires et foncées.
  vec3 hoof = mix(hHoof, hHoofLight, step(0.01, sockH));
  hoof *= 0.84 + 0.22 * hNoise(vec3(P.x * 260.0, P.y * 6.0, P.z * 260.0));
  if (hHoofStripe > 0.0) {
    // (bandes verticales : angle autour du centre du sabot)
    float band = smoothstep(0.4, 0.6, hNoise(vec3(atan(P.x - hc.x, P.z - hc.y) * 4.5, P.y * 3.0, hSeed)));
    hoof = mix(hoof, mix(hHoof, hHoofLight, band), hHoofStripe);
  }
  c = mix(c, hoof, isHoof);
  hHoofV = isHoof;

  // Grain du poil (fin, couché vers l'arrière) et occlusion ambiante cuite.
#ifdef H_REAL
  // Modelé peint du modèle réaliste (muscles, poil, corne) : gris, 0,5 = moyen. C'est une photo : elle porte
  // aussi l'éclairage de la prise de vue (côtes, creux des muscles), qui doublait celui du jeu (robe « sale »,
  // « on voit les côtes »). Adouci (hDetail : 0,5, 0,35 sur les robes claires), sur la corne un peu (stries),
  // beaucoup sur la corne claire (le modelé d'origine la salissait de gris-vert) et sur les balzanes (l'ombre
  // peinte de la balzane d'origine les coupait en deux) ; le relief reste porté par la carte de normales.
  float hDet = mix(hDetail, mix(0.55, 0.3, step(0.01, sockH)), isHoof);
  hDet = mix(hDet, 0.2, sock * (1.0 - isHoof));
  c *= mix(1.0, hDetTex.r * 2.0, hDet);
#else
  c *= 1.0 + (hNoise(P * vec3(320.0, 110.0, 70.0)) - 0.5) * 0.07 * (1.0 - aa) * (1.0 - isHoof);
#endif
  // (plancher plus haut dessous : le ventre et l'intérieur des cuisses ne tombent pas au noir)
  c *= mix(mix(0.42, 0.62, clamp(under + inner, 0.0, 1.0)), 1.0, vHAO);
  hDarkV = 1.0 - smoothstep(0.012, 0.05, dot(c, vec3(0.2126, 0.7152, 0.0722)));
  diffuseColor.rgb = c;
}`;

/**
 * Lumière d'ambiance sur la robe : le reflet du sol (herbe verte du pré, hémisphère et environnement) garde sa
 * force mais perd l'excès de vert. Du côté à l'ombre, il tournait les robes claires et dorées au kaki (Akhal-Teké
 * palomino olive au pré, teinte du flanc 66° au lieu de 40-50°). Le vert est ramené à celui du rouge ou du bleu
 * (le plus fort des deux, + 8 %), la luminance gardée ; le ciel bleu n'est pas touché. Quelques instructions.
 */
const AMBIENT_FIX = /* glsl */ `
{
  vec3 hLw = vec3( 0.2126, 0.7152, 0.0722 );
  vec3 hIr = irradiance;
  hIr.g = min( hIr.g, max( hIr.r, hIr.b ) * 1.08 );
  irradiance = mix( irradiance, hIr * ( dot( irradiance, hLw ) / max( dot( hIr, hLw ), 1e-4 ) ), 0.85 );
  vec3 hIb = iblIrradiance;
  hIb.g = min( hIb.g, max( hIb.r, hIb.b ) * 1.08 );
  iblIrradiance = mix( iblIrradiance, hIb * ( dot( iblIrradiance, hLw ) / max( dot( hIb, hLw ), 1e-4 ) ), 0.85 );
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
  // (robe dorée : le reflet de ses parties noires — bas des membres du bai — reste neutre)
  vec3 hTint = mix( vec3( 1.0 ), diffuseColor.rgb / hMax, 0.7 ) * mix( hRimTint, vec3( 1.0 ), hDarkV * hGold );
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

/** Réchauffement de la base des robes métallisées (Akhal-Teké), linéaire : moins de vert, nettement moins de bleu. */
export const SHEEN_WARM = new THREE.Color(1, 0.82, 0.55);
/** Robe d'un poulain gris (linéaire, × la robe adulte) : gris foncé, il grisonnera en grandissant. */
export const GREY_FOAL = 0.3;
/** Robe d'un gris pommelé (linéaire, × la couleur de la race) : fond gris acier sous les pommelures claires. */
export const DAPPLE_BASE = 0.86;
/** Noir brun vers lequel la base des robes presque noires est relevée à moitié (contre les reflets « latex »). */
export const BLACK_FLOOR = new THREE.Color(0x26211f);

/**
 * Robe de base d'un rouan : la couleur de la race est la teinte d'ensemble (poils blancs mêlés compris) ; le shader
 * mêle lui-même les poils blancs — à une base plus foncée et plus saturée (rouan rouge, rouan bai : brun-roux ; rouan
 * bleu : presque noir).
 */
export function roanBase(hex) {
  const hsl = col(hex).getHSL({}, THREE.SRGBColorSpace);
  return new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * COAT_LOOKS.roan.sat), hsl.l * COAT_LOOKS.roan.light, THREE.SRGBColorSpace);
}

/**
 * Part dorée d'une robe (0 à 1) : teinte orangée à jaune (16 à 55°), assez saturée, ni grise, ni blanche, ni presque
 * noire, ni Akhal-Teké (son éclat a son propre réglage). Alezan, palomino, isabelle, crins lavés ; un peu le bai.
 */
export function coatGold(look, tr = horseCoatTraits(look), sheen = 0) {
  if (sheen || tr.grey > 0) return 0;
  const c = col(look.coat ?? 0x7a4528);
  const hsl = c.getHSL({}, THREE.SRGBColorSpace);
  const hue = hsl.h * 360;
  if (srgbLum(look.coat ?? 0x7a4528) < 0.09 || hue < 12 || hue > 60) return 0;
  const t = Math.min(1, Math.max(0, (hsl.s - 0.25) / 0.25)) * Math.min(1, Math.max(0, (0.88 - hsl.l) / 0.08));
  return t * Math.min(1, (hue - 12) / 6) * Math.min(1, (60 - hue) / 6);
}

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
  // (robe métallisée de l'Akhal-Teké : base réchauffée vers l'or orangé — un palomino « crème » sortait kaki au pré,
  // teinte du flanc 66° au lieu de 40-50°)
  // (poulain gris : il naît foncé et grisonne en grandissant — robe gris foncé, sans pommelures ; avant : la mosaïque
  // d'un adulte sur un poulain de 12 jours)
  const greyFoal = tr.grey > 0 && !!(look.foal || build.foal);
  // (gris pommelé : fond un peu plus foncé, gris acier, sous des pommelures claires — pas un cheval blanc à pois)
  const coat = sheen ? col(look.coat).multiply(SHEEN_WARM) : greyFoal ? col(look.coat).multiplyScalar(GREY_FOAL)
    : tr.roan > 0 ? roanBase(look.coat ?? 0x9c8a80) : tr.grey >= 1 ? col(look.coat).multiplyScalar(DAPPLE_BASE) : col(look.coat);
  const black0 = srgbLum(look.coat ?? 0x7a4528) < 0.09 && !sheen;
  // Robe claire (gris, blanc, crème…) : modelé peint plus doux encore (voir COAT_FRAGMENT).
  const coatL = srgbLum(look.coat ?? 0x7a4528);
  // (rouan : sa robe de base, plus foncée que la teinte d'ensemble de la race, n'est pas une robe claire)
  const light = tr.grey > 0 || (coatL > 0.55 && !(tr.roan > 0));
  // Robes dorées (alezan, palomino, isabelle, crins lavés, bai) : teinte orangée à jaune assez saturée. Leur reflet
  // est doré (avant : un reflet blanc, le palomino était un jaune plat).
  const gold = coatGold(look, tr, sheen);
  // Teinte du reflet de bord : celle de la robe (dans le shader) × ce ton : doré (Akhal-Teké, robes dorées), brun
  // chaud pour les robes presque noires (sinon un liseré gris de latex), blanc sinon.
  const rimTint = sheen ? new THREE.Color(1, 0.86, 0.55) : coatL < 0.09 ? new THREE.Color(1, 0.78, 0.6)
    : new THREE.Color(1, 1, 1).lerp(new THREE.Color(1, 0.86, 0.6), 0.75 * gold);
  const spots = tr.leopard > 0 || tr.blanket > 0;
  const u = {
    hCoat: { value: black0 ? coat.clone().lerp(BLACK_FLOOR, 0.5) : coat },
    hSec: { value: col(look.secondary ?? look.coat) },
    hPointC: { value: col(look.maneCore ?? look.mane ?? 0x1b1410) },
    hWhite: { value: col(0xf4f1ec) },
    hSkin: { value: col(0x2b2523) },
    hHoof: { value: col(0x3a332d) },
    hHoofLight: { value: col(0xc2b090) },
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
    // Cheval réaliste : centre de la sole de chaque sabot (x, z ; couronne qui descend vers les talons), œil (centre
    // dans le repère de la tête, rayon) et naseau (centre, taille), mesurés sur le gabarit de la race.
    hHoofA: { value: new THREE.Vector4(...(real?.hooves?.slice(0, 2).flat() ?? [0, 0, 0, 0])) },
    hHoofB: { value: new THREE.Vector4(...(real?.hooves?.slice(2, 4).flat() ?? [0, 0, 0, 0])) },
    hEye: { value: new THREE.Vector4(...(real?.eye ?? [0, 0, 0, 0])) },
    hNos: { value: new THREE.Vector4(...(real?.nostril ?? [0, 0, 0, 0])) },
    // (toupet : racine et pointe le long du chanfrein, demi-largeur en haut — repère de la tête — et force de son ombre)
    // (crins clairs sur une robe claire : ombre plus marquée — c'est elle qui détache le toupet du front, plutôt que
    // des crins grisés, qui se lisaient en plaque pâle)
    hFore: { value: new THREE.Vector4(...(real?.fore ?? [0, 0, 0, 0])).setW((real?.fore?.[3] ?? 0) * (1 + FORE_SHADE_LIGHT * lightManeOnLight(look))) },
    // Gris et appaloosas : peau noire marbrée (de rose chez l'appaloosa) autour des yeux et au bout du nez ;
    // sabots rayés de l'appaloosa.
    hSkinMot: { value: spots ? 1 : tr.grey > 0 ? 0.85 : 0 },
    hSkinPink: { value: spots ? 1 : 0.25 },
    hHoofStripe: { value: spots ? 1 : 0 },
    hGold: { value: gold },
    // (pommelures de santé : marquées sur une robe dorée claire — palomino —, à peine sur l'alezan et le bai)
    hGoldDap: { value: gold > 0 ? Math.min(1, Math.max(0.25, (coatL - 0.2) / 0.45)) : 0 },
    // (poulain : modelé presque effacé, il n'a pas encore les muscles d'un adulte)
    // (robes dorées claires — palomino — un peu moins effacées : sinon un jaune plat)
    hDetail: { value: build.foal ? 0.25 : light ? 0.35 + 0.1 * gold : 0.5 },
    // Satiné et liseré (voir RIM_FRAGMENT) : force, teinte (dorée pour l'Akhal-Teké, brun chaud pour le noir),
    // lumière du ciel et appoint du soir (partagés, mis à jour par World.updateSky).
    // (robes dorées : satiné un peu plus fort, le reflet doré se voit aussi sur téléphone)
    hRim: { value: (high ? 0.75 : 1) * (1 + 0.3 * gold) },
    hRimTint: { value: rimTint },
    hSkyRim: gfx.skyRim,
    hFill: gfx.horseFill,
  };
  // (Akhal-Teké : l'éclat passe par le satiné doré, pas par le métal — à 0,32, la robe reflétait l'herbe et
  // sortait kaki ou olive ; robes presque noires un peu moins lisses : le ciel y dessine les muscles.)
  // (noir profond : poil satiné, des reflets cassés par le grain du poil, moins de voile gris-bleu du ciel sur tout
  // le corps — specularIntensity en qualité haute, satiné brun discret. À 0,36 de rugosité, les reflets restaient
  // des taches blanches dures, « latex », sur un noir encore plus noir : 0,46 à 0,48, et la base relevée vers un
  // noir brun, BLACK_FLOOR, pour lire les muscles sans tache blanche.)
  const black = coatL < 0.09 && !sheen;
  const opts = {
    color: 0xffffff,
    roughness: sheen ? (high ? 0.34 : 0.38) : black ? (high ? 0.46 : 0.48) : 0.56,
    metalness: sheen ? 0.05 : 0.02,
  };
  // Ordinateur : reflet satiné du poil ras (sheen), très marqué et doré pour l'Akhal-Teké, brun chaud sur le noir.
  // Robes dorées : la robe × 1,4 tirée vers l'or (0xffd27a), au lieu d'un mélange de blanc.
  const sheenColor = sheen
    ? coat.clone().lerp(new THREE.Color(1, 0.82, 0.48), 0.55)
    : coatL < 0.09 ? new THREE.Color(0x5a4030)
      : coat.clone().lerp(new THREE.Color(1, 0.95, 0.85), 0.3).lerp(coat.clone().multiplyScalar(1.4).lerp(new THREE.Color(0xffd27a), 0.5), gold);
  const m = high
    ? new THREE.MeshPhysicalMaterial({
      ...opts,
      sheen: black ? 0.36 : 0.32 + sheen * 0.6 + 0.18 * gold,
      sheenRoughness: sheen ? 0.3 : 0.55,
      sheenColor,
      specularIntensity: black ? 0.6 : 1,
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
  const def = (real ? '#ifndef H_REAL\n#define H_REAL\n#endif\n' : '') + (high ? '#ifndef H_HQ\n#define H_HQ\n#endif\n' : '');
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
attribute vec4 hHL;
varying vec4 vHHL;
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
vHHL = hHL;
#endif`);
    sh.fragmentShader = def + sh.fragmentShader
      .replace('#include <common>', `#include <common>
${Object.keys(u).map((k) => `uniform ${u[k].value.isVector4 ? 'vec4' : u[k].value.isColor || Array.isArray(u[k].value) ? 'vec3' : 'float'} ${k};`).join('\n')}
varying vec3 vHPos;
varying vec3 vHNrm;
flat varying float vHPart; // pas d'interpolation entre deux parties (sinon : fausses balzanes aux bords)
varying vec3 vHInfo;
varying float vHAO;
#ifdef H_REAL
varying float vHHead;
varying vec4 vHHL;
#endif
float hBare; // peau nue et sabots : pas de reflet satiné du poil
float hMuz; // bout du nez : poil ras et clairsemé, plus lisse
float hHoofV; // corne des sabots (plus lisse que le poil)
float hGrainV; // grain du poil couché vers l'arrière (0-1, 0,5 de loin) : le reflet se casse au lieu d'un latex lisse
float hDarkV; // poil presque noir (bas des membres et crins d'un bai…) : pas de reflet doré dessus
float hEarIn; // intérieur des oreilles (poils mats)
${NOISE}`)
      .replace('#include <map_fragment>', `${real ? 'vec4 hDetTex = texture2D( map, vMapUv );' : '#include <map_fragment>'}
${COAT_FRAGMENT}`)
      // Sabots plus lisses et brillants que le poil (corne : 0,45 environ), bout du nez aussi (0,35 environ).
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor *= mix(1.0, 0.55, step(5.5, vHPart) * step(vHPart, 6.5));
roughnessFactor *= mix(1.0, 0.8, hHoofV) * mix(1.0, 0.62, hMuz);
roughnessFactor = clamp(roughnessFactor * (0.78 + 0.44 * hGrainV), 0.04, 1.0);
roughnessFactor = mix(roughnessFactor, 0.9, hEarIn);`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_SHEEN
material.sheenColor = mix( material.sheenColor, vec3( 0.3, 0.28, 0.26 ), hDarkV * hGold ) * ( 1.0 - hBare );
#endif`)
      .replace('#include <lights_fragment_end>', `${AMBIENT_FIX}
#include <lights_fragment_end>
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
  if (m.alphaToCoverage) keepFrameAlpha(m);
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
