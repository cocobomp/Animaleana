// Robe des chiens réalistes (dogReal.js) : retouche du shader du pelage, d'après la page « Choisis ton chien ».
//
// Le poil peint du modèle d'origine est ramené à un gris neutre qui garde son grain (poils, reflets) mais pas ses
// grandes taches : la luminance de chaque texel est divisée par la moyenne de sa « classe » (poil sombre ou poil
// clair, deux moyennes mesurées sur la texture au chargement), moins sa moyenne locale sur la surface (attribut
// cmpLow, voir furLow). La robe est ensuite peinte selon l'endroit du corps : position du sommet au repos dans le
// repère du modèle d'ORIGINE (attribut cmpRest : les taches ont la même place quelle que soit la race) et
// appartenance aux oreilles, à la queue, à la tête, aux pattes (cmpPart, tirée des poids du squelette). Les taches
// restent donc collées à la peau quand il bouge. Truffe, yeux, coussinets, dents et langue gardent leur couleur.
//
// Masques (0 → 1), combinés dans cet ordre sur la couleur de base : selle (dos), tête colorée et plaques (pie),
// merle, bringé, charbonné (pointes sombres), blanc ou crème du dessous (poitrail, ventre, pattes, museau, liste,
// bout de la queue, collier, joues), feux (sourcils, joues, poitrail, pattes), moucheture (rouan), taches
// (dalmatien), masque (museau et yeux foncés, oreilles). coatPlan traduit la robe du jeu (species.js) en masques.
//
// Le même shader pousse la peau le long de la normale pour l'embonpoint (ventre et flancs) et la respiration.

import * as THREE from 'three';

const MAX_KEEP = 4;
const MAX_UV = 3;

const lum = (c) => {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const mixHex = (a, b, t) => {
  const ca = new THREE.Color(a);
  return ca.lerp(new THREE.Color(b), t).getHex();
};
const scaleHex = (a, k) => new THREE.Color(a).multiplyScalar(k).getHex();

/**
 * Masques de la robe d'un chien, d'après sa robe du jeu (look : pattern, coat, secondary, third, colorName, seed)
 * et sa race. Renvoie { base, ...forces et couleurs } (voir COLOR_F).
 */
export function coatPlan(look = {}, breedId = null) {
  const coat = look.coat ?? 0xc98c43;
  const sec = look.secondary ?? coat;
  const third = look.third ?? sec;
  const name = `${look.colorName?.fr ?? ''} ${look.colorName?.en ?? ''}`;
  const breed = breedId ?? look.breed ?? null;
  const P = {
    base: coat, seed: ((look.seed ?? 1) % 997) * 0.731,
    under: 0, underColor: 0xf3efe7, reach: 0.4, legLevel: 0, face: 0, blaze: 0, tailTip: 0, collar: 0, cheek: 0,
    points: 0, pointsColor: 0xb0702e,
    saddle: 0, saddleColor: 0x1b1715, saddleLevel: 0.45,
    mask: 0, maskColor: 0x1a1512, maskEars: 0,
    headPatch: 0, patchColor: sec, blobs: 0, blobSize: 1, blobColor: sec,
    spots: 0, spotsColor: sec, merle: 0, merleColor: third, brindle: 0, brindleColor: 0x2a1d15,
    sable: 0, sableColor: 0x2a1f18, tick: 0, tickColor: coat,
    // franges, ventre et dessous de la queue plus clairs (toller) ; blanc du dessous au poitrail seulement (pas au ventre)
    light: 0, lightColor: coat, chestOnly: 0,
    // iris (couleur des yeux de la robe : bleus du husky, du berger australien merle) ; null : celui du modèle
    iris: look.eye ?? null,
  };
  const white = (c) => lum(c) > 0.62;
  const hound = ['beagle', 'coonhound'].includes(breed);
  // (berger islandais : pas l'urajiro du shiba — collier, liste, poitrail et pattes blancs comme un colley)
  const urajiro = ['shiba', 'akita'].includes(breed);
  if (/Bring|Brindle/.test(name)) {
    // Bringé : rayures sombres sur un fond fauve.
    P.brindle = 1;
    P.brindleColor = scaleHex(coat, lum(coat) < 0.2 ? 0.75 : 0.5);
    P.base = mixHex(coat, 0xb98c5c, lum(coat) < 0.2 ? 0.66 : 0.5);
  }
  // (charbonné : nom anglais « Sable », pas le « sable » français qui veut dire jaune chez le labrador)
  const en = look.colorName?.en ?? '';
  if (/Sable|Sesame|Wild boar|Agouti/.test(en) || /charbonn/.test(name)) {
    P.sable = /Sesame/.test(en) ? 0.8 : 0.65;
    P.sableColor = 0x1d1714;
  }
  const pattern = look.pattern ?? 'solid';
  if (pattern === 'solid') {
    if (sec !== coat && lum(sec) > lum(coat)) {
      // Dessous un peu plus clair (labrador sable, golden) : franges, ventre.
      P.under = 0.55;
      P.underColor = sec;
      P.reach = 0.28;
      P.legLevel = 0.15;
    }
    // (toller sans blanc : franges et dessous de la queue plus clairs)
    if (breed === 'toller') {
      P.light = 0.5;
      P.lightColor = mixHex(coat, 0xf2cf9a, 0.45);
    }
    if (/Fauve|Fawn/.test(name) && ['bouledogue', 'malinois', 'carlin', 'boxer'].includes(breed)) {
      P.mask = breed === 'malinois' ? 1 : 0.9;
      P.maskEars = breed === 'malinois' ? 1 : 0.3;
    }
    if (breed === 'malinois') P.sable = Math.max(P.sable, 0.5);
  } else if (pattern === 'tan') {
    if (breed === 'berger_allemand' || breed === 'yorkshire') {
      // Selle (noire ou bleu acier) sur fond feu ; masque du berger.
      P.base = sec;
      P.saddle = 1;
      P.saddleColor = coat;
      P.saddleLevel = breed === 'yorkshire' ? 0.3 : 0.38;
      if (breed === 'berger_allemand') {
        if (/Sable/.test(name)) {
          P.saddle = 0;
          P.sable = 1;
          P.sableColor = scaleHex(coat, 0.45);
        }
        // (masque noir franc sur le museau et autour des yeux, crâne et oreilles charbonnés)
        P.mask = 1;
        P.maskColor = scaleHex(coat, 0.9);
        P.sable = Math.max(P.sable, 0.55);
        P.sableColor = scaleHex(coat, 0.95);
      }
    } else {
      // Noir et feu (rottweiler, coonhound, kelpie…) : feux aux sourcils, joues, poitrail, pattes.
      P.points = 1;
      P.pointsColor = sec;
    }
  } else if (pattern === 'bicolor') {
    P.under = 1;
    P.underColor = sec;
    if (urajiro) {
      // Urajiro : crème sur le museau, les joues, la gorge, le poitrail, le ventre, l'intérieur des pattes.
      Object.assign(P, { reach: 0.42, legLevel: 0.35, face: 1, cheek: 1, blaze: 0, tailTip: 0 });
      if (lum(coat) < 0.12) {
        P.points = 1;
        P.pointsColor = 0xb07035;
      }
    } else if (breed === 'husky') {
      Object.assign(P, { reach: 0.45, legLevel: 0.8, face: 1, cheek: 1, blaze: 0.7, tailTip: 0 });
      P.sable = Math.max(P.sable, 0.35);
    } else if (breed === 'boxer') {
      Object.assign(P, { reach: 0.22, legLevel: 0.22, face: 0, blaze: 0.25, tailTip: 0 });
      P.mask = 0.95;
    } else if (breed === 'toller') {
      // Retriever de la Nouvelle-Écosse : roux ou orange vif, marques blanches — liste sur le chanfrein, bout du museau,
      // poitrail (le ventre reste roux), pieds (pas au-dessus du paturon), bout de la queue ; franges et dessous de la
      // queue plus clairs.
      Object.assign(P, { reach: 0.14, legLevel: 0.13, face: 0.3, blaze: 0.42, tailTip: 1, collar: 0, cheek: 0, chestOnly: 1 });
      P.light = 0.5;
      P.lightColor = mixHex(coat, 0xf2cf9a, 0.45);
    } else {
      // Border collie, corgi, berger islandais… : collier, liste, poitrail, pattes, bout de la queue. (Colley : liste
      // étroite, yeux dans le noir ; islandais : plus de blanc, collier.)
      Object.assign(P, { reach: 0.42, legLevel: 0.55, face: 0.7, blaze: 1, tailTip: 1, collar: breed === 'border_collie' ? 1 : breed === 'corgi' ? 0.6 : 0 });
      if (breed === 'border_collie') Object.assign(P, { blaze: 0.45 });
      if (breed === 'berger_islandais') Object.assign(P, { face: 0.5, blaze: 0.6, collar: 0.8, reach: 0.5, legLevel: 0.7 });
    }
  } else if (pattern === 'tricolor') {
    if (/merle/i.test(name)) {
      // Merle : taches sombres (third) sur fond gris bleu ou rouge, blanc au collier, à la liste, aux pattes.
      P.merle = 1;
      P.merleColor = third;
      P.under = 1;
      P.underColor = sec;
      Object.assign(P, { reach: 0.4, legLevel: 0.45, face: 0.6, blaze: 1, tailTip: 0, collar: 0.8 });
      // (marques cuivre sur les joues, les sourcils et les pattes : berger australien)
      if (breed === 'berger_australien') {
        P.points = 0.75;
        P.pointsColor = 0xb0672f;
      }
    } else if (lum(coat) < 0.13) {
      // Tricolore foncé (bouvier bernois, berger australien, border) : noir, blanc, feux.
      P.under = 1;
      P.underColor = sec;
      Object.assign(P, { reach: 0.4, legLevel: 0.4, face: 0.55, blaze: 1, tailTip: 1, collar: breed === 'border_collie' ? 0.8 : 0 });
      P.points = 1;
      P.pointsColor = third;
    } else if (white(coat)) {
      // Fond blanc (jack russell, cavalier, épagneul breton) : tête colorée, plaque noire sur le dos, feux sur la tête
      // (sourcils, joues) — jamais aux pattes.
      P.headPatch = 1;
      P.patchColor = third;
      P.blobs = 0.7;
      P.blobColor = third;
      P.points = 0.8;
      P.pointsColor = sec;
      P.pointsHead = 1;
    } else {
      // Tricolore clair (beagle) : fond feu, selle noire, blanc au poitrail, aux pattes, au museau et en liste
      // étroite (joues et tour des yeux feu).
      P.saddle = 1;
      P.saddleColor = third;
      P.under = 1;
      P.underColor = sec;
      Object.assign(P, { reach: 0.45, legLevel: 0.5, face: 0.65, blaze: 0.5, tailTip: 1 });
    }
  } else if (pattern === 'patches') {
    if (white(coat)) {
      P.headPatch = breed === 'bouledogue' ? 0.5 : 1;
      P.patchColor = sec;
      P.blobs = { jack_russell: 0.45, cavalier: 0.75, epagneul_breton: 0.85, bouledogue: 1, cocker: 0.8, galgo: 0.8, whippet: 0.8, lagotto: 0.6 }[breed] ?? 0.7;
      P.blobColor = sec;
      if (breed === 'epagneul_breton') {
        P.tick = 0.5;
        P.tickColor = sec;
      }
      if (breed === 'saint_bernard' || breed === 'terre_neuve') {
        // Manteau sur le dos et tête colorée, liste et poitrail blancs.
        P.blobs = 0.35;
        P.saddle = 1;
        P.saddleColor = sec;
        P.saddleLevel = 0.3;
        if (breed === 'saint_bernard') {
          P.mask = 0.5;
          P.maskColor = scaleHex(sec, 0.45);
          // (bout de la queue, liste et pattes blancs : la queue rousse se termine en blanc)
          Object.assign(P, { under: 1, underColor: coat, reach: 0.3, legLevel: 0.6, face: 0.6, blaze: 1, tailTip: 1 });
        }
      }
    } else {
      // Fond coloré et blanc (beagle citron et blanc) : comme un bicolore de chien courant.
      P.under = 1;
      P.underColor = sec;
      Object.assign(P, { reach: 0.55, legLevel: 1, face: 1, blaze: 1, tailTip: 1, collar: 0.5 });
    }
  } else if (pattern === 'spots') {
    if (white(coat)) {
      P.spots = 1;
      P.spotsColor = sec;
    } else if (white(sec)) {
      // Rouan (cocker bleu rouan) : blanc moucheté de la couleur, tête et oreilles colorées.
      P.base = sec;
      P.tick = 1;
      P.tickColor = coat;
      P.headPatch = 0.85;
      P.patchColor = coat;
      if (breed === 'lagotto') {
        // (rouan marron du lagotto : poils blancs et marron mêlés — un fond brun grisé moucheté —, tête, oreilles et
        // quelques plaques marron)
        P.base = mixHex(sec, coat, 0.35);
        P.tickColor = mixHex(coat, sec, 0.12);
        P.headPatch = 0.9;
        P.blobs = 0.45;
        P.blobColor = coat;
      }
    } else {
      // Arlequin (teckel) : merle.
      P.merle = 1;
      P.merleColor = sec;
    }
  } else if (pattern === 'points') {
    // Carlin fauve : masque et oreilles noirs, raie sombre.
    P.mask = 1;
    P.maskColor = sec;
    P.maskEars = 1;
  }
  if (hound && pattern === 'patches' && !white(coat)) P.headPatch = 0;
  // Noirs très sombres : relevés et réchauffés (brun-noir), sinon plus aucun modelé ni reflet du poil à l'écran — le
  // terre-neuve, le labrador ou le caniche noirs n'étaient plus qu'une silhouette avec une truffe.
  for (const k of ['base', 'saddleColor', 'patchColor', 'blobColor', 'merleColor', 'brindleColor', 'maskColor']) {
    const l = lum(P[k]);
    if (l < 0.13) P[k] = mixHex(P[k], 0x4d3f35, 0.75 * (1 - l / 0.13));
  }
  P.dark = lum(P.base) < 0.16;
  // (lustre et lisière claire des robes sombres : voir cSheen ; la laine bouclée du lagotto reste mate)
  P.sheen = P.dark ? 1 : lum(P.base) < 0.26 ? 0.5 : 0;
  if (breed === 'lagotto') P.sheen *= 0.4;
  return P;
}

/** Uniformes communs à tous les matériaux d'un chien (robe, repères du corps, embonpoint, respiration). */
export function makeCoatUniforms() {
  return {
    cOn: { value: 1 },
    cBase: { value: new THREE.Color() },
    cSeed: { value: 0 },
    cUnder: { value: new THREE.Vector4() }, // force, hauteur du dessous, hauteur sur les pattes, museau
    cUnder2: { value: new THREE.Vector4() }, // liste, bout de la queue, collier, joues
    cUnderC: { value: new THREE.Color() },
    cPoints: { value: 0 },
    cPointsHead: { value: 0 },
    cPointsC: { value: new THREE.Color() },
    cSaddle: { value: new THREE.Vector2() }, // force, hauteur
    cSaddleC: { value: new THREE.Color() },
    cMask: { value: new THREE.Vector2() }, // museau et yeux, oreilles
    cMaskC: { value: new THREE.Color() },
    cPatch: { value: new THREE.Vector3() }, // tête colorée, plaques, taille des plaques
    cPatchC: { value: new THREE.Color() },
    cBlobC: { value: new THREE.Color() },
    cSpots: { value: 0 },
    cSpotsC: { value: new THREE.Color() },
    cMerle: { value: 0 },
    cMerleC: { value: new THREE.Color() },
    cBrindle: { value: 0 },
    cBrindleC: { value: new THREE.Color() },
    cSable: { value: 0 },
    cSableC: { value: new THREE.Color() },
    cTick: { value: 0 },
    cTickC: { value: new THREE.Color() },
    cLight: { value: new THREE.Vector2() }, // franges et dessous de la queue plus clairs, blanc au poitrail seulement
    cLightC: { value: new THREE.Color() },
    cFat: { value: 0 }, // poussée du ventre et des flancs (m, repère du modèle)
    cBreath: { value: 0 }, // poussée de la cage thoracique (m)
    cWet: { value: 0 }, // poil mouillé (plus sombre, plus brillant)
    // Coupe du salon de toilettage (m, le long de la normale) : tronc, collerette (cou et poitrail), pompons (bas des
    // pattes), bout de la queue et dessus du crâne.
    cCut: { value: new THREE.Vector4(0, 0, 0, 0) },
    // Relief du poil : frisé (x : bouclettes), soyeux (y : mèches qui tombent) et bouclettes serrées (z : anneaux de
    // poil laineux du lagotto), 0 à 1.
    cCurl: { value: new THREE.Vector3(0, 0, 0) },
    // Iris (rgb, w : 1 si la robe en donne un) ; lustre des robes sombres (lisière claire, tour des yeux éclairci).
    cIris: { value: new THREE.Vector4(0, 0, 0, 0) },
    cSheen: { value: 0 },
    // Pompons modelés du caniche montrés (coupe « caniche ») ou ramenés à leur centre.
    cPom: { value: 0 },
    // Rides du front (carlin), 0 à 1 : relief du shader.
    cWrinkle: { value: 0 },
  };
}

/** Applique une robe (coatPlan) aux uniformes. */
export function setCoat(u, P) {
  u.cBase.value.setHex(P.base);
  u.cSeed.value = P.seed;
  u.cUnder.value.set(P.under, P.reach, P.legLevel, P.face);
  u.cUnder2.value.set(P.blaze, P.tailTip, P.collar, P.cheek);
  u.cUnderC.value.setHex(P.underColor);
  u.cPoints.value = P.points;
  u.cPointsHead.value = P.pointsHead ?? 0;
  u.cPointsC.value.setHex(P.pointsColor);
  u.cSaddle.value.set(P.saddle, P.saddleLevel);
  u.cSaddleC.value.setHex(P.saddleColor);
  u.cMask.value.set(P.mask, P.maskEars);
  u.cMaskC.value.setHex(P.maskColor);
  u.cPatch.value.set(P.headPatch, P.blobs, P.blobSize);
  u.cPatchC.value.setHex(P.patchColor);
  u.cBlobC.value.setHex(P.blobColor);
  u.cSpots.value = P.spots;
  u.cSpotsC.value.setHex(P.spotsColor);
  u.cMerle.value = P.merle;
  u.cMerleC.value.setHex(P.merleColor);
  u.cBrindle.value = P.brindle;
  u.cBrindleC.value.setHex(P.brindleColor);
  u.cSable.value = P.sable;
  u.cSableC.value.setHex(P.sableColor);
  u.cTick.value = P.tick;
  u.cTickC.value.setHex(P.tickColor);
  u.cLight.value.set(P.light ?? 0, P.chestOnly ?? 0);
  u.cLightC.value.setHex(P.lightColor ?? P.base);
  if (P.iris !== null && P.iris !== undefined) {
    // (iris très sombre — le brun foncé par défaut des robes — éclairci : un œil brun chaud, pas un trou noir)
    const c = new THREE.Color(P.iris);
    const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    if (l < 0.05 && l > 1e-4) c.multiplyScalar(Math.min(6, 0.05 / l));
    u.cIris.value.set(c.r, c.g, c.b, 1);
  } else u.cIris.value.set(0, 0, 0, 0);
  u.cSheen.value = P.sheen ?? 0;
}

/** Repères du corps au repos (modèle d'origine), communs à tous les chiens d'un modèle. */
export function makeLandUniforms(L) {
  return {
    cLand: { value: new THREE.Vector4(L.hipZ, L.shZ, L.bellyY, L.topY) },
    cHead: { value: new THREE.Vector4(L.head.x, L.head.y, L.head.z, L.noseZ) },
    cEye: { value: new THREE.Vector4(L.eyeX, L.eyeY, L.eyeZ, L.elbowY) },
    cMisc: { value: new THREE.Vector4(L.midX, L.tailTipZ, L.neckZ, L.tailBaseZ) },
    // (hauteur de la truffe : le dessus du museau descend des yeux jusqu'à elle — la liste le suit)
    cNoseY: { value: L.nose?.y ?? L.eyeY - 0.03 },
  };
}

const COMMON_V = /* glsl */ `
attribute vec3 cmpRest;
attribute vec4 cmpPart;
attribute float cmpLow;
attribute float cmpPom;
uniform float cPom;
uniform vec4 cLand;
uniform vec4 cEye;
uniform vec4 cMisc;
uniform vec4 cHead;
uniform float cFat;
uniform float cBreath;
uniform vec4 cCut;
varying vec3 vCmpPos;
varying vec4 vCmpPart;
varying float vCmpLow;`;

const REST_V = /* glsl */ `
vCmpPos = cmpRest;
vCmpPart = cmpPart;
vCmpLow = cmpLow;`;

// Embonpoint (ventre et flancs) et respiration (cage thoracique), le long de la normale du sommet déformé.
const PUSH_V = /* glsl */ `
{
  float trunkW = (1.0 - cmpPart.w) * (1.0 - cmpPart.y) * (1.0 - cmpPart.z);
  float u = (cmpRest.z - cLand.x) / max(0.05, cLand.y - cLand.x);
  float h = (cmpRest.y - cLand.z) / max(0.05, cLand.w - cLand.z);
  float belly = trunkW * smoothstep(-0.15, 0.25, u) * (1.0 - smoothstep(0.85, 1.15, u)) * (1.0 - smoothstep(0.55, 1.0, h));
  float ribs = trunkW * smoothstep(0.35, 0.65, u) * (1.0 - smoothstep(1.0, 1.25, u)) * (1.0 - smoothstep(0.7, 1.05, h));
  float push = cFat * belly + cBreath * ribs;
  if (cCut != vec4(0.0)) {
    float tr = trunkW * smoothstep(-0.25, 0.0, u) * (1.0 - smoothstep(0.95, 1.2, u));
    float ruff = (1.0 - cmpPart.w) * (1.0 - cmpPart.y) * (1.0 - cmpPart.x) * smoothstep(0.85, 1.05, u)
      * (1.0 - smoothstep(cHead.z - 0.02, cHead.z + 0.05, cmpRest.z)) * (1.0 - cmpPart.z * 0.6);
    float pom = cmpPart.w * smoothstep(0.02, 0.05, cmpRest.y) * (1.0 - smoothstep(cEye.w * 0.35, cEye.w * 0.55, cmpRest.y));
    float tip = cmpPart.y * (1.0 - smoothstep(0.03, 0.09, cmpRest.z - cMisc.y));
    float top = cmpPart.z * (1.0 - cmpPart.x) * smoothstep(cEye.y + 0.01, cEye.y + 0.05, cmpRest.y) * (1.0 - smoothstep(cEye.z - 0.02, cEye.z + 0.02, cmpRest.z));
    push += cCut.x * tr + cCut.y * ruff + cCut.z * pom + cCut.w * max(tip, top);
  }
  // (pompon modelé : ni embonpoint ni coupe, seulement montré ou ramené à son centre)
  if (cmpPom > 0.0) push = -cmpPom * (1.0 - cPom);
  transformed += normalize(objectNormal) * push;
}`;

const COMMON_F = /* glsl */ `
uniform float cOn;
uniform vec3 cBase;
uniform float cSeed;
uniform vec4 cUnder;
uniform vec4 cUnder2;
uniform vec3 cUnderC;
uniform float cPoints;
uniform float cPointsHead;
uniform vec3 cPointsC;
uniform vec2 cSaddle;
uniform vec3 cSaddleC;
uniform vec2 cMask;
uniform vec3 cMaskC;
uniform vec3 cPatch;
uniform vec3 cPatchC;
uniform vec3 cBlobC;
uniform float cSpots;
uniform vec3 cSpotsC;
uniform float cMerle;
uniform vec3 cMerleC;
uniform float cBrindle;
uniform vec3 cBrindleC;
uniform float cSable;
uniform vec3 cSableC;
uniform float cTick;
uniform vec3 cTickC;
uniform vec2 cLight;
uniform vec3 cLightC;
uniform vec4 cCut;
uniform float cWet;
uniform vec3 cCurl;
uniform vec4 cIris;
uniform float cSheen;
uniform float cWrinkle;
uniform vec4 cLand;
uniform vec4 cHead;
uniform vec4 cEye;
uniform vec4 cMisc;
uniform float cNoseY;
uniform float cRole;
uniform float cTexMode;
uniform vec3 cMeans;
uniform vec4 cKeepS[${MAX_KEEP}];
uniform float cKeepL[${MAX_KEEP}];
uniform vec4 cKeepUv[${MAX_UV}];
uniform vec4 cKeepOpt;
uniform sampler2D cDetail;
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
// Relief du poil : bouclettes (frisé) et mèches verticales (soyeux), hauteur 0 à 1 sur la position de repos.
// (axes tournés : le bruit à valeurs suit sinon la grille, en blocs carrés ou en marches d'escalier)
const mat3 CMP_ROT = mat3(0.788, 0.441, -0.43, -0.39, 0.896, 0.215, 0.476, -0.054, 0.878);
float cmpCurlH(vec3 p) {
  vec3 q = CMP_ROT * p * 80.0;
  return cmpNoise(q) * 0.6 + cmpNoise(q * 2.1 + 7.0) * 0.4;
}
float cmpSilkH(vec3 p) {
  vec3 r = CMP_ROT * vec3(p.x, 0.0, p.z);
  return cmpNoise(vec3(r.x * 170.0, p.y * 18.0, r.z * 170.0)) * 0.7 + cmpNoise(vec3(r.x * 340.0, p.y * 34.0, r.z * 340.0)) * 0.3;
}
// Bouclettes serrées (lagotto) : des mèches de laine enroulées, serrées les unes contre les autres. Chaque cellule d'un
// pavage (axes tournés, un peu déformé) porte une mèche : un dôme de laine adouci jusqu'à son bord, un arc large d'un
// côté et un arc plus serré de l'autre — une spirale, pas un anneau — ; les mèches voisines s'additionnent (pas de
// « la plus haute l'emporte », qui traçait des contours nets : des écailles). Elles sont mesurées dans le plan de la
// peau (nr : normale de repos) : coupées en travers, des sphères ne laissaient sur la peau que des cercles épars, des
// anneaux nets comme des rondelles. Le centre d'une cellule ne s'écarte que d'un quart de cellule et une mèche ne
// dépasse pas les deux tiers : les 2 × 2 × 2 cellules qui entourent le point suffisent (au lieu de 3 × 3 × 3).
// q : position en cellules (déjà tournée et déformée, cmpWarp), n : normale de repos tournée. Renvoie (hauteur 0 →
// ~1,5, pente par cellule, calculée — pas tirée de dFdx/dFdy, constantes par carré de deux pixels : un damier).
vec4 cmpCurls(vec3 q, vec3 n) {
  vec3 b = floor(q - 0.5);
  float h = 0.0;
  vec3 g = vec3(0.0);
  for (int z = 0; z <= 1; z++) for (int y = 0; y <= 1; y++) for (int x = 0; x <= 1; x++) {
    vec3 c = b + vec3(float(x), float(y), float(z));
    vec3 rnd = vec3(cmpHash(c), cmpHash(c + 17.31), cmpHash(c + 41.7));
    vec3 d = q - (c + 0.5 + (rnd - 0.5) * 0.5);
    float dn = dot(d, n);
    // (mèches dont le centre est loin de la peau, devant ou derrière : effacées)
    float wd = 1.0 - smoothstep(0.2, 0.5, abs(dn));
    d -= n * dn;
    float R = 0.56 + 0.1 * fract(rnd.x * 7.13 + rnd.z);
    float x2 = dot(d, d) / (R * R);
    if (x2 >= 1.0 || wd <= 0.0) continue;
    // dôme de laine (nul et plat au bord)
    float A = (0.35 + 0.25 * rnd.x) * wd;
    float f = 1.0 - x2;
    h += A * f * f;
    g += A * (-4.0 * f / (R * R)) * d;
    // la mèche enroulée : un arc large au bord, d'un côté, un arc serré vers le centre, de l'autre côté (bosses en
    // (1 − k²/3)², presque des gaussiennes, moins chères)
    float r = sqrt(x2) + 1e-4;
    float sd = 2.0 * dot(d, rnd - 0.5) / (r * R);
    float k = (r - 0.62) / 0.2;
    float t1 = max(0.0, 1.0 - k * k * 0.333);
    float s1 = smoothstep(-0.65, 0.7, sd) * 0.7 * wd;
    float k2 = (r - 0.3) / 0.14;
    float t2 = max(0.0, 1.0 - k2 * k2 * 0.333);
    float s2 = smoothstep(-0.65, 0.7, -sd) * 0.45 * wd;
    h += t1 * t1 * s1 + t2 * t2 * s2;
    g += (s1 * t1 * (-1.333 * k / 0.2) + s2 * t2 * (-1.333 * k2 / 0.14)) * d / (r * R * R);
  }
  return vec4(h, g);
}
// Pavage des bouclettes déformé (un peu de bruit sur les axes tournés : pas une grille régulière)
vec3 cmpWarp(vec3 q) {
  vec3 w = q * 0.37;
  float a = cmpNoise(w);
  float b = cmpNoise(w + 13.1);
  return q + vec3(a, b, a + b - 1.0) * 0.6;
}
// Rides du front (carlin) : plis horizontaux au-dessus des yeux, 0 à 1 (creux à 0).
float cmpWrinkleH(vec3 p, vec4 part) {
  float ax = abs(p.x - cMisc.x);
  float m = part.z * (1.0 - part.x) * smoothstep(cEye.y + 0.003, cEye.y + 0.012, p.y) * (1.0 - smoothstep(cEye.y + 0.032, cEye.y + 0.048, p.y))
    * (1.0 - smoothstep(cEye.x * 0.9, cEye.x * 1.5, ax)) * smoothstep(cEye.z - 0.06, cEye.z - 0.025, p.z);
  // (plis larges et doux : à 700 rad/m, des bandes d'aliasing rayaient le front du carlin)
  float w = 0.5 + 0.5 * sin((p.y - cEye.y) * 390.0 + sin(ax * 70.0) * 1.1);
  w = w * w * (3.0 - 2.0 * w);
  return mix(1.0, w, m);
}
// Liste (0 à 1) : bande au milieu du front, étroite entre les yeux, qui descend sur le chanfrein et s'élargit sur le
// museau. bw règle sa largeur, bs son départ sur le crâne. (Elle suit le dessus du museau, qui descend des yeux à la
// truffe, au lieu de s'arrêter net à hauteur des yeux : une coupure horizontale en travers de la face.)
float cmpBlaze(vec3 p, float hz, float ax, float edge, float bw, float bs) {
  float hzE = (cEye.z - cHead.z) / max(0.05, cHead.w - cHead.z);
  float fore = 1.0 - smoothstep(hzE - 0.25, hzE - 0.05, hz);
  float snout = max(0.0, hz - hzE - 0.06);
  float w = bw * (0.011 + 0.008 * fore) + snout * 0.3 * bw * bw;
  float across = 1.0 - smoothstep(w * 0.6, w * 1.4, ax + edge * 0.03 * bw);
  float t = clamp((hz - hzE - 0.13) / max(0.05, 0.87 - hzE), 0.0, 1.0);
  float yLim = mix(cEye.y, cNoseY, t) - 0.012 - 0.008 * t;
  float down = smoothstep(yLim - 0.008, yLim + 0.004, p.y);
  return across * down * smoothstep(0.05 + bs, 0.25 + bs, hz);
}
// Taches rondes (dalmatien) : la plus proche, rayon propre à chaque tache.
float cmpSpots(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float best = 0.0;
  float aa = max(0.03, length(fwidth(p)) * 0.7);
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 c = i + g;
    vec3 o = vec3(cmpHash(c), cmpHash(c + 17.31), cmpHash(c + 41.7));
    float r = 0.22 + 0.2 * cmpHash(c + 7.7);
    float d = length(g + o - f);
    best = max(best, 1.0 - smoothstep(r - aa, r + aa, d));
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
// Couleur de la robe à un endroit du corps (repos du modèle d'origine).
vec3 cmpCoat(vec3 p, vec4 part) {
  float hipZ = cLand.x;
  float shZ = cLand.y;
  float bellyY = cLand.z;
  float topY = cLand.w;
  float h = (p.y - bellyY) / max(0.05, topY - bellyY);
  float u = (p.z - hipZ) / max(0.05, shZ - hipZ);
  float ear = part.x;
  float tail = part.y;
  float head = part.z;
  float legs = part.w;
  float headLen = max(0.05, cHead.w - cHead.z);
  float hz = (p.z - cHead.z) / headLen; // 0 : os de la tête, 1 : bout du nez
  float elbowY = cEye.w;
  vec3 sp = p + vec3(cSeed, cSeed * 0.37, cSeed * 0.71);
  float n1 = cmpNoise(sp * 14.0);
  float n2 = cmpNoise(sp * 33.0 + 5.0);
  float edge = (n1 - 0.5) * 0.14 + (n2 - 0.5) * 0.05;
  float body = (1.0 - head) * (1.0 - tail);
  float trunk = body * (1.0 - legs);
  float neckZone = body * smoothstep(shZ - 0.02, shZ + 0.06, p.z);
  float midX = cMisc.x;
  float ax = abs(p.x - midX);
  // repères de la tête : sous la ligne des yeux, devant les yeux
  float belowEye = 1.0 - smoothstep(cEye.y - 0.012, cEye.y + 0.012, p.y + edge * 0.1);
  float muzzle = head * (1.0 - ear) * smoothstep(0.5, 0.64, hz + edge * 0.3);
  float legLow = legs * (1.0 - smoothstep(elbowY * 0.75, elbowY * 1.05, p.y));
  vec3 c = cBase;
  // ---- selle (dos et dessus de la queue)
  if (cSaddle.x > 0.0) {
    float s = trunk * smoothstep(cSaddle.y, cSaddle.y + 0.12, h + edge) * smoothstep(-0.35, -0.12, u + edge)
      * (1.0 - smoothstep(0.82, 1.0, u + edge));
    s = max(s, neckZone * (1.0 - head) * smoothstep(0.62, 0.8, h + edge) * (1.0 - smoothstep(cMisc.z - 0.06, cMisc.z, p.z)));
    // (toute la queue : prise selon sa hauteur au repos, la queue enroulée du shiba était à moitié blanche, délavée)
    s = max(s, tail * 0.95);
    c = mix(c, cSaddleC, cSaddle.x * s);
  }
  // ---- tête colorée (sauf la liste et le museau) et plaques (pie)
  if (cPatch.x > 0.0) {
    float blazeOut = cmpBlaze(p, hz, ax, edge, 1.0, 0.0);
    float hp = max(head * (1.0 - blazeOut) * (1.0 - muzzle * 0.85), ear);
    hp = max(hp, neckZone * smoothstep(0.55, 0.75, h + edge) * smoothstep(cMisc.z - 0.05, cMisc.z + 0.02, p.z));
    c = mix(c, cPatchC, cPatch.x * hp);
  }
  if (cPatch.y > 0.0) {
    float bn = cmpNoise(sp * 5.5 * cPatch.z) * 0.75 + cmpNoise(sp * 13.0) * 0.25;
    float blob = smoothstep(1.0 - 0.38 * cPatch.y, 1.04 - 0.38 * cPatch.y, bn) * (1.0 - legLow) * (1.0 - smoothstep(0.5, 0.2, h) * trunk);
    c = mix(c, cBlobC, blob * (1.0 - muzzle));
  }
  // ---- merle : fond marbré, plaques sombres irrégulières de toutes tailles aux bords déchirés (pas des ronds de vache)
  if (cMerle > 0.0) {
    vec3 wq = sp + vec3(cmpNoise(sp * 6.0 + 3.0), cmpNoise(sp * 6.0 + 9.0), cmpNoise(sp * 6.0 + 17.0)) * 0.06;
    float big = cmpNoise(wq * 13.0);
    float small = cmpNoise(wq * 31.0 + 5.0);
    float tear = (cmpNoise(sp * 75.0) - 0.5) * 0.1;
    float m = max(smoothstep(0.75, 0.78, big + tear), smoothstep(0.72, 0.75, small + tear * 1.3));
    c *= 0.9 + 0.2 * cmpNoise(sp * 4.0 + 1.3);
    c = mix(c, cMerleC, cMerle * m);
  }
  // ---- bringé : rayures presque verticales sur le corps, en travers sur les pattes ; plus discrètes sur la tête
  if (cBrindle > 0.0) {
    // (stries fines et ondulées, déformées par du bruit, en chevrons sur les côtes ; en travers sur les pattes, en long
    // sur la queue ; aussi sur la tête ; faible contraste et interrompues — pas des bandes de tigre, pas de poivre)
    vec3 wp = sp * 9.0;
    float warp = (cmpNoise(wp) - 0.5) * 7.0 + (cmpNoise(wp * 2.7 + 4.0) - 0.5) * 2.5;
    float chev = abs(p.y - (bellyY + topY) * 0.5) * 120.0;
    // (trois champs de stries fondus entre eux — fondre leurs phases faisait un labyrinthe)
    float sA = 0.5 + 0.5 * sin(sp.z * 320.0 + chev * 0.8 + warp);
    float sB = 0.5 + 0.5 * sin(sp.y * 360.0 + warp);
    float sT = 0.5 + 0.5 * sin((p.x - midX) * 460.0 + warp * 0.5);
    float st = mix(mix(sA, sB, smoothstep(0.3, 0.7, legs)), sT, smoothstep(0.3, 0.7, tail));
    // (épaisseur variable : seuil modulé par un bruit — des stries qui naissent, s'épaississent et meurent, pas des
    // courbes de niveau régulières)
    float thr = 0.5 + 0.32 * cmpNoise(sp * vec3(38.0, 16.0, 38.0));
    st = smoothstep(thr, thr + 0.25, st);
    // (de loin, moins d'un pixel par strie : le motif se fond en teinte moyenne au lieu de scintiller)
    // (phase par pixel : effacé au-delà d'environ deux pixels par strie, pas avant — le galgo de la planche des
    // races, à quatre ou cinq pixels par strie, paraissait uni)
    float fw = length(fwidth(sp)) * 320.0;
    st = mix(st, 0.25, smoothstep(1.4, 2.8, fw));
    float brk = 0.2 + 0.8 * smoothstep(0.3, 0.7, cmpNoise(sp * vec3(14.0, 6.0, 10.0)));
    // (mèches : stries de poil fines qui brouillent le bord des bandes ; effacées de loin)
    float hair = mix(0.75 + 0.5 * cmpNoise(sp * vec3(90.0, 220.0, 90.0)), 1.0, smoothstep(0.6, 1.4, fw));
    float stripe = clamp(st * brk * hair, 0.0, 1.0) * (1.0 - 0.6 * head);
    c = mix(c, cBrindleC, cBrindle * stripe * 0.65);
  }
  // ---- charbonné / sable : pointes sombres sur le dessus, la tête, les oreilles, le bout de la queue
  if (cSable > 0.0) {
    float top = trunk * smoothstep(0.45, 0.95, h + edge) + head * (1.0 - muzzle) * smoothstep(cEye.y - 0.02, cEye.y + 0.04, p.y) * 0.6
      + ear * 0.8 + tail * 0.6;
    c = mix(c, cSableC, cSable * clamp(top, 0.0, 1.0) * (0.55 + 0.45 * n2));
  }
  // ---- blanc ou crème du dessous
  float white = 0.0;
  float blazeW = 0.0;
  if (cUnder.x > 0.0) {
    float reach = cUnder.y;
    float chest = body * (1.0 - legs * 0.6) * smoothstep(shZ - 0.06, shZ + 0.02, p.z + edge * 0.3)
      * (1.0 - smoothstep(bellyY + (reach + 0.12) * (topY - bellyY), bellyY + (reach + 0.32) * (topY - bellyY), p.y + edge * 0.3));
    float bel = trunk * (1.0 - smoothstep(reach - 0.12, reach + 0.04, h + edge)) * (1.0 - cLight.y);
    // (poitrail seul — toller — : une plaque au milieu du poitrail, pas un plastron jusqu'aux épaules)
    chest *= 1.0 - cLight.y * smoothstep(0.035, 0.07, ax + edge * 0.08);
    float lg = legs * (1.0 - smoothstep(elbowY * cUnder.z * 1.25 - 0.02, elbowY * cUnder.z * 1.25 + 0.02, p.y + edge * 0.15));
    lg *= step(0.01, cUnder.z);
    // (museau blanc : devant les yeux, pas autour — l'œil du shiba est dans la zone du museau)
    float hzE = (cEye.z - cHead.z) / headLen;
    float mz = (muzzle * belowEye * smoothstep(hzE + 0.02, hzE + 0.12, hz + edge * 0.3) + muzzle * smoothstep(0.75, 0.9, hz) * 0.6) * cUnder.w;
    float cheek = head * (1.0 - ear) * cUnder2.w * belowEye * smoothstep(0.15, 0.4, hz) * smoothstep(0.02, 0.05, ax);
    float throat = neckZone * (1.0 - head) * (1.0 - smoothstep(0.35, 0.55, h + edge)) * step(0.01, cUnder.w + cUnder2.w);
    // (liste : sa force règle aussi sa largeur — étroite chez le boxer, large chez le colley — et sa longueur :
    // étroite, elle part du front et non de l'arrière du crâne)
    float blaze = head * (1.0 - ear) * step(0.01, cUnder2.x) * cmpBlaze(p, hz, ax, edge, mix(0.3, 1.0, cUnder2.x), 0.32 * (1.0 - cUnder2.x));
    blazeW = blaze;
    float tipT = tail * cUnder2.y * (1.0 - smoothstep(0.02, 0.06, p.z - cMisc.y + (n1 - 0.5) * 0.02));
    float collar = neckZone * (1.0 - head) * cUnder2.z * smoothstep(cMisc.z - 0.07, cMisc.z - 0.04, p.z + edge * 0.2)
      * (1.0 - smoothstep(cMisc.z + 0.03, cMisc.z + 0.06, p.z + edge * 0.2));
    white = max(max(max(chest, bel), max(lg, mz)), max(max(cheek, throat), max(blaze, max(tipT, collar))));
    white = smoothstep(0.35, 0.65, white) * cUnder.x;
    c = mix(c, cUnderC, white);
  }
  // ---- franges, ventre et dessous de la queue plus clairs (toller : roux, franges orangées)
  if (cLight.x > 0.0) {
    float lb = trunk * (1.0 - smoothstep(0.1, 0.42, h + edge));
    float lt = tail * (0.5 + 0.5 * smoothstep(0.1, 0.7, (cMisc.w - p.z) / max(0.05, cMisc.w - cMisc.y)));
    float lr = legs * smoothstep(elbowY * 0.75, elbowY * 1.15, p.y) * smoothstep(-0.02, 0.04, p.y - bellyY + 0.04) * 0.6;
    c = mix(c, cLightC, cLight.x * clamp(max(max(lb, lt), lr), 0.0, 1.0) * (1.0 - white));
  }
  // ---- feux (noir et feu, tricolores)
  if (cPoints > 0.0) {
    float brow = head * (1.0 - ear) * (1.0 - smoothstep(0.006, 0.016, length(vec2(ax - cEye.x * 0.9, (p.y - cEye.y - 0.025) * 1.3)) - 0.006 + edge * 0.02))
      * smoothstep(0.1, 0.3, hz) * (1.0 - smoothstep(0.42, 0.52, hz));
    // (joues : sur les côtés du museau, devant l'œil — prises depuis l'arrière de la tête, elles faisaient un pavé
    // cuivre sur la joue du berger australien)
    float hzEp = (cEye.z - cHead.z) / headLen;
    float cheekT = head * (1.0 - ear) * belowEye * smoothstep(hzEp - 0.14, hzEp + 0.0, hz + edge * 0.2) * smoothstep(0.015, 0.03, ax + edge * 0.02);
    float chestT = body * (1.0 - legs) * smoothstep(shZ, shZ + 0.05, p.z) * (1.0 - smoothstep(0.35, 0.5, h + edge))
      * smoothstep(0.01, 0.03, ax);
    float legT = legs * (1.0 - smoothstep(elbowY * 0.55, elbowY * 0.75, p.y + edge * 0.1));
    float under = tail * (1.0 - smoothstep(-0.02, 0.02, p.y - (cLand.w * 0.85))) * 0.8;
    // (tricolore sur fond blanc — jack, cavalier, épagneul — : le feu seulement sur la tête, les pattes restent blanches)
    float body2 = 1.0 - cPointsHead;
    float pt = max(max(brow, cheekT), max(chestT * body2, max(legT * body2, under * body2)));
    c = mix(c, cPointsC, cPoints * smoothstep(0.35, 0.65, pt) * (1.0 - white));
  }
  // ---- moucheture (rouan, épagneul breton) dans le blanc
  if (cTick > 0.0) {
    float tk = smoothstep(0.74, 0.79, cmpNoise(sp * 115.0) + (cmpNoise(sp * 30.0) - 0.5) * 0.15) * (1.0 - head * 0.5);
    // (bouclettes serrées : mèches marron et blanches mêlées par touffes de la taille des boucles, sur le fond grisé —
    // le rouan du lagotto ; tirées boucle par boucle, elles faisaient une mosaïque de facettes ; axes tournés, sinon
    // le bruit suit la grille et le rouan devient un camouflage en pixels carrés)
    if (cCurl.z > 0.0) {
      vec3 rq = CMP_ROT * sp;
      tk = smoothstep(0.4, 0.64, cmpNoise(rq * 120.0) * 0.7 + cmpNoise(rq * 47.0 + 5.0) * 0.3) * 0.8;
    }
    c = mix(c, cTickC, cTick * tk);
  }
  // ---- taches du dalmatien : plus petites sur la tête et les pattes, oreilles foncées
  if (cSpots > 0.0) {
    // (deux tailles calculées à part puis fondues : une seule échelle variant avec l'appartenance aux pattes ou à
    // la tête comprimait le motif là où elle change — épaules, cuisses, cou — en une poussière de points noirs)
    float small = smoothstep(0.35, 0.65, max(head, legs));
    float sA = small < 0.999 ? cmpSpots(sp * 24.0 + vec3(3.1, 1.7, 0.0)) : 0.0;
    float sB = small > 0.001 ? cmpSpots(sp * 40.0 + vec3(1.3, 4.1, 2.0)) : 0.0;
    float s = mix(sA, sB, small);
    s = max(s, ear * smoothstep(0.35, 0.65, n1 + 0.25));
    c = mix(c, cSpotsC, cSpots * s);
  }
  // ---- masque : museau et tour des yeux foncés, oreilles
  if (cMask.x > 0.0 || cMask.y > 0.0) {
    float eyeRing = head * (1.0 - smoothstep(0.012, 0.03, length(vec2(ax - cEye.x, (p.y - cEye.y) * 1.2)) + edge * 0.02))
      * smoothstep(0.15, 0.3, hz) * (1.0 - smoothstep(0.5, 0.6, hz));
    float m = max(muzzle * smoothstep(0.55, 0.7, hz + edge * 0.4), eyeRing * 0.8) * (1.0 - ear) * (1.0 - smoothstep(0.3, 0.6, blazeW) * cUnder.x);
    c = mix(c, cMaskC, clamp(cMask.x * m + cMask.y * ear, 0.0, 1.0));
  }
  // (oreilles un peu plus sombres que la tête : elles s'en détachent, surtout tombantes)
  c *= 1.0 - 0.12 * ear;
  // Robes sombres : tour des yeux et arête du museau un peu éclaircis (le visage se lit au lieu d'un masque noir).
  if (cSheen > 0.0) {
    float ring = 1.0 - smoothstep(0.014, 0.034, length(vec2(ax - cEye.x, (p.y - cEye.y) * 1.25)));
    float bridge = (1.0 - smoothstep(0.006, 0.02, ax)) * smoothstep(0.42, 0.55, hz) * (1.0 - smoothstep(0.82, 0.95, hz))
      * smoothstep(cEye.y - 0.03, cEye.y - 0.005, p.y);
    float lift = head * (1.0 - ear) * clamp(ring * 0.8 + bridge * 0.6, 0.0, 1.0) * cSheen;
    c = mix(c, c * 1.8 + vec3(0.012, 0.009, 0.007), lift * 0.6);
  }
  return c;
}`;

const COLOR_F = /* glsl */ `
float cmpEyeK = 0.0;
float cmpCatch = 0.0;
// (bouclettes serrées : calculées une fois, pour la couleur et pour le relief)
float cmpCurlZ = 0.0;
vec3 cmpCurlG = vec3(0.0);
float cmpCurlFade = 0.0;
float cmpCurlBump = 0.0;
if (cOn > 0.5 && cCurl.z > 0.0 && cRole > 0.5) {
  // (deux tailles : les boucles de 1,7 cm de près, des grappes de boucles de 4 cm à mi-distance — sinon la robe
  // paraissait lisse dès que le chien s'éloigne ; chacune effacée à moins de quatre ou cinq pixels par boucle, où elle
  // faisait un grain de papier de verre qui scintille ; les petites ne sont calculées que de près)
  float fw = length(fwidth(vCmpPos));
  float fadeS = 1.0 - smoothstep(0.2, 0.42, fw * 58.0);
  float fadeB = 1.0 - smoothstep(0.2, 0.42, fw * 25.0);
  if (fadeB > 0.0) {
    // (normale de repos, des pas d'écran de la position de repos)
    vec3 nq = CMP_ROT * normalize(cross(dFdx(vCmpPos), dFdy(vCmpPos)) + 1e-9);
    vec4 cv = vec4(0.0);
    // grappes de 4 cm (25 par mètre) ; de près, presque couvertes par les petites : pas calculées
    if (fadeS < 0.99) {
      vec4 bg = cmpCurls(cmpWarp(CMP_ROT * (vCmpPos + 3.7) * 25.0), nq);
      cv = vec4(bg.x, (bg.yzw * CMP_ROT) * 25.0);
    }
    // boucles de 1,7 cm (58 par mètre), deux pavages décalés : des mèches partout, pas des grappes éparses sur une
    // laine lisse (une seule déformation pour les deux)
    if (fadeS > 0.0) {
      vec3 qs = cmpWarp(CMP_ROT * vCmpPos * 58.0);
      vec4 sm = (cmpCurls(qs, nq) + cmpCurls(qs + vec3(7.5, 7.37, 7.61), nq)) * 0.6;
      sm = vec4(sm.x, (sm.yzw * CMP_ROT) * 58.0);
      cv = mix(cv, cv * 0.25 + sm, fadeS);
    }
    cmpCurlZ = cv.x;
    cmpCurlG = cv.yzw;
    cmpCurlFade = fadeB;
    cmpCurlBump = (1.0 - smoothstep(0.16, 0.36, fw * 25.0)) * (1.0 - 0.75 * vCmpPart.x);
  }
}
if (cOn > 0.5) {
  vec3 c0 = diffuseColor.rgb;
  vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
  float lum0 = dot(c0, LUM);
  vec3 hsv = cmpHsv(pow(clamp(c0, 0.0, 1.0), vec3(0.4545)));
  float keep = 1.0 - cRole;
  // Coussinets et griffes : texels sombres tout en bas des pattes.
  if (cKeepOpt.w > 0.0) keep = max(keep, (1.0 - smoothstep(0.025, 0.05, vCmpPos.y)) * (1.0 - smoothstep(cKeepOpt.w * 0.5, cKeepOpt.w, lum0)));
  // Sombre partout (truffe, yeux peints) au-dessous d'une luminance.
  if (cKeepOpt.x > 0.0) keep = max(keep, vCmpPart.z * (1.0 - smoothstep(cKeepOpt.x * 0.6, cKeepOpt.x, lum0)));
  for (int i = 0; i < ${MAX_KEEP}; i++) {
    vec4 s = cKeepS[i];
    if (s.w > 0.0) {
      float inS = 1.0 - smoothstep(s.w * 0.65, s.w, distance(vCmpPos, s.xyz));
      // (truffe : texels sombres et peu saturés ; le poil feu autour du nez du jack, sombre lui aussi, faisait un
      // anneau orange sur les robes noires ou grises)
      keep = max(keep, inS * (1.0 - smoothstep(cKeepL[i] * 0.5, cKeepL[i], lum0)) * (1.0 - smoothstep(0.3, 0.5, hsv.y)));
    }
  }
  // Langue, lèvres et gencives roses (dans la tête seulement).
  if (cKeepOpt.y > 0.0) {
    float dh = abs(fract(hsv.x - 0.985 + 0.5) - 0.5);
    keep = max(keep, vCmpPart.z * (1.0 - smoothstep(0.04, 0.075, dh)) * smoothstep(0.28, 0.42, hsv.y) * smoothstep(0.18, 0.3, hsv.z));
  }
  float eyeK = 0.0;
  #ifdef USE_MAP
  for (int i = 0; i < ${MAX_UV}; i++) {
    vec4 r = cKeepUv[i];
    if (r.z > r.x && vMapUv.x >= r.x && vMapUv.x <= r.z && vMapUv.y >= r.y && vMapUv.y <= r.w) {
      keep = 1.0;
      if (i == 0) eyeK = 1.0; // (le premier rectangle : les yeux)
    }
  }
  #endif
  float detail = 1.0;
  if (cTexMode > 1.5) {
    // grain de la texture sans ses plaques (furDetail : rapport à la moyenne locale de la même couleur)
    #ifdef USE_MAP
    detail = exp((texture2D(cDetail, vMapUv).r * 1.35 - 0.9) * cMeans.z);
    #endif
  } else if (cTexMode > 0.5) {
    float ll = log(max(lum0, 1e-3));
    float w = smoothstep(cMeans.x + 0.15 * (cMeans.y - cMeans.x), cMeans.x + 0.85 * (cMeans.y - cMeans.x), ll);
    float nl = ll - mix(cMeans.x, cMeans.y, w);
    detail = exp(clamp((nl - vCmpLow) * cMeans.z + vCmpLow * 0.12, -0.9, 0.45));
  }
  vec3 coat = cmpCoat(vCmpPos, vCmpPart);
  float l = dot(coat, LUM);
  detail = mix(detail, sqrt(detail), smoothstep(0.3, 0.8, l));
  vec3 nc = min(coat * detail, vec3(1.0));
  nc *= 1.0 - 0.35 * cWet;
  // (effacé de loin, comme le relief : sinon des pixels qui scintillent)
  float fwC = length(fwidth(vCmpPos));
  // (frisure : un relief doux, presque pas de gris dans la couleur — elle faisait du crépi sale sur le caniche blanc)
  if (cCurl.x > 0.0) nc *= mix(1.0, 0.88 + 0.16 * smoothstep(0.25, 0.75, cmpCurlH(vCmpPos)), cCurl.x * (1.0 - smoothstep(0.25, 0.9, fwC * 80.0)));
  // (soyeux : les mèches sur le corps, pas sur la face au poil court, où elles faisaient des stries)
  if (cCurl.y > 0.0) nc *= mix(1.0, 0.82 + 0.26 * cmpSilkH(vCmpPos), cCurl.y * (1.0 - smoothstep(0.25, 0.9, fwC * 170.0)) * (1.0 - 0.8 * vCmpPart.z));
  // (bouclettes serrées : le dessus de chaque boucle éclairé, les creux entre elles plus sombres ; de loin, des touffes
  // de boucles de 2 à 3 cm restent lisibles — la robe se lit laineuse, pas lisse)
  if (cCurl.z > 0.0) {
    // (coupé au salon — tronc raccourci — : boucles égalisées, robe plus unie sur le corps ; pattes et tête gardent
    // leurs boucles)
    float trim = clamp(-cCut.x / 0.02, 0.0, 1.0) * (1.0 - vCmpPart.w) * (1.0 - vCmpPart.z) * (1.0 - vCmpPart.y);
    float ringK = cCurl.z * (1.0 - 0.65 * trim);
    // (creux entre les mèches un peu plus sombres, sans trou noir au centre des boucles ; grain de la laine)
    nc *= mix(1.0, mix(0.74, 1.05, smoothstep(0.05, 0.8, cmpCurlZ)) * (1.0 + (cmpNoise(CMP_ROT * vCmpPos * 260.0) - 0.5) * 0.14 * (1.0 - smoothstep(0.25, 0.6, fwC * 260.0))), ringK * cmpCurlFade);
    float tuft = cmpNoise(CMP_ROT * vCmpPos * 34.0) * 0.65 + cmpNoise(CMP_ROT * vCmpPos * 71.0 + 3.0) * 0.35;
    nc *= mix(1.0, 0.86 + 0.24 * tuft, ringK * (1.0 - smoothstep(0.3, 0.9, fwC * 34.0)));
  }
  if (cWrinkle > 0.0) nc *= mix(1.0, 0.8 + 0.2 * cmpWrinkleH(vCmpPos, vCmpPart), cWrinkle * (1.0 - smoothstep(0.3, 1.0, fwC * 160.0)));
  // Lèvres et gencives (jack) : brun-noir comme chez le vrai chien, pas rouge vif (« rouge à lèvres »).
  if (cKeepOpt.z > 0.0 && cKeepOpt.y > 0.0) {
    float dh2 = abs(fract(hsv.x - 0.985 + 0.5) - 0.5);
    // (seulement le long de la fente de la gueule, devant les yeux : les plaques brun-roux de la tête du jack ont la
    // même teinte et faisaient des taches sales sur le front et autour des yeux)
    float yM = cEye.y - 0.066 + (vCmpPos.z - cHead.w + 0.041) * 0.25;
    float mouthZone = (1.0 - smoothstep(0.016, 0.026, abs(vCmpPos.y - yM))) * smoothstep(cEye.z, cEye.z + 0.025, vCmpPos.z);
    float lip = vCmpPart.z * mouthZone * (1.0 - smoothstep(0.05, 0.09, dh2)) * smoothstep(0.25, 0.4, hsv.y) * smoothstep(0.12, 0.25, hsv.z);
    keep = keep * (1.0 - lip);
    nc = mix(nc, vec3(0.035, 0.026, 0.022), lip);
  }
  diffuseColor.rgb = mix(nc, c0, clamp(keep, 0.0, 1.0));
  // Blanc de l'œil du shiba : foncé (il se voyait autour de l'iris dès que la tête grandit : chiots aux yeux ronds)
  if (eyeK > 0.5) {
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.038, 0.03), smoothstep(0.22, 0.45, lum0) * (1.0 - smoothstep(0.12, 0.3, hsv.y)));
    // iris de la robe (yeux bleus) : teinte remplacée, grain gardé
    float iris = smoothstep(0.22, 0.4, hsv.y) * smoothstep(0.012, 0.03, lum0) * (1.0 - smoothstep(0.35, 0.5, lum0));
    if (cIris.w > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, cIris.rgb * clamp(lum0 / 0.11, 0.35, 1.5), iris);
    // reflet : un point de lumière en haut et en avant du globe (le regard vit, même dans l'ombre)
    float side = sign(vCmpPos.x - cMisc.x);
    vec3 eo = vec3(cMisc.x + side * cEye.x, cEye.y, cEye.z);
    vec3 cp = eo + vec3(side * 0.004, 0.0085, 0.0175);
    cmpCatch = 1.0 - smoothstep(0.0018, 0.0032, distance(vCmpPos, cp));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), cmpCatch);
    cmpEyeK = 1.0;
  }
}`;

// Relief du poil frisé ou soyeux : la normale penche selon la pente de la hauteur (comme une bumpMap), effacé de loin
// (moins d'un pixel par bouclette : scintillement).
const CURL_F = /* glsl */ `
if (cOn > 0.5 && cRole > 0.5 && (cCurl.x > 0.0 || cCurl.y > 0.0 || cCurl.z > 0.0 || cWrinkle > 0.0)) {
  float fade = 1.0 - smoothstep(0.25, 0.9, length(fwidth(vCmpPos)) * 140.0);
  float hh = (cCurl.x * 0.004 * cmpCurlH(vCmpPos) + cCurl.y * 0.0015 * cmpSilkH(vCmpPos) * (1.0 - 0.8 * vCmpPart.z)) * fade
    + cWrinkle * 0.0022 * cmpWrinkleH(vCmpPos, vCmpPart) * (1.0 - smoothstep(0.3, 1.0, length(fwidth(vCmpPos)) * 160.0));
  vec2 dH = vec2(dFdx(hh), dFdy(hh));
  // (bouclettes serrées : leur pente calculée, projetée sur les pas d'écran de la position de repos)
  if (cCurl.z > 0.0) dH += cCurl.z * 0.0022 * cmpCurlBump * vec2(dot(cmpCurlG, dFdx(vCmpPos)), dot(cmpCurlG, dFdy(vCmpPos)));
  vec3 sx = dFdx(-vViewPosition);
  vec3 sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, normal);
  vec3 r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
  normal = normalize(abs(det) * normal - grad);
}`;

// Lisière claire des robes sombres (lumière rasante sur le poil lustré : le modelé de la tête et du corps se lit) et
// reflet de l'œil toujours visible.
const SHEEN_F = /* glsl */ `
if (cOn > 0.5 && cRole > 0.5) {
  float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);
  totalEmissiveRadiance += cSheen * vec3(0.075, 0.062, 0.052) * fr * (1.0 - cmpEyeK);
  totalEmissiveRadiance += vec3(0.55) * cmpCatch;
}`;

const _v = new THREE.Vector3();

/**
 * Grain du poil peint dans la texture, sans les taches de la robe d'origine (une fois par modèle, au chargement).
 * La luminance (log) est rapportée à la moyenne de sa « classe » (poil sombre ou clair : k-moyennes à une
 * dimension) ; ce qui reste de grandes variations est mesuré sur la surface même du chien (valeur par sommet,
 * lissée de proche en proche sur le maillage, sommets soudés par position) et retiré par le shader.
 * img : image de la texture ; uv, rest : Float32Array ; index : Uint32Array. Renvoie { low, lo, hi } ou null.
 */
export function furLow(img, uv, rest, index, count, opts = {}) {
  const low = new Float32Array(count);
  if (!img || typeof document === 'undefined') return { low, lo: -3, hi: -1, none: true };
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  try {
    ctx.drawImage(img, 0, 0, S, S);
  } catch {
    return { low, lo: -3, hi: -1, none: true };
  }
  const px = ctx.getImageData(0, 0, S, S).data;
  const c = new THREE.Color();
  const ll = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = uv[i * 2];
    const v = uv[i * 2 + 1];
    const x = Math.min(S - 1, Math.max(0, Math.floor((u - Math.floor(u)) * S)));
    const y = Math.min(S - 1, Math.max(0, Math.floor((v - Math.floor(v)) * S))); // (flipY = false dans glTF)
    const o = (y * S + x) * 4;
    c.setRGB(px[o] / 255, px[o + 1] / 255, px[o + 2] / 255, THREE.SRGBColorSpace);
    ll[i] = Math.log(Math.max(1e-3, c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722));
  }
  const vals = Array.from(ll).sort((a, b) => a - b);
  let lo = vals[Math.floor(count * 0.2)];
  let hi = vals[Math.floor(count * 0.8)];
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
  if (opts.classes === false) lo = hi = vals[Math.floor(count / 2)];
  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const key = new Map();
  const grp = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const k = `${Math.round(rest[i * 3] * 1000)},${Math.round(rest[i * 3 + 1] * 1000)},${Math.round(rest[i * 3 + 2] * 1000)}`;
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
  for (let i = 0; i < count; i++) {
    const w = smooth(lo + 0.15 * (hi - lo), lo + 0.85 * (hi - lo), ll[i]);
    val[grp[i]] += ll[i] - (lo + (hi - lo) * w);
    cnt[grp[i]]++;
  }
  for (let k = 0; k < G; k++) val[k] /= cnt[k] || 1;
  const tri = index.length / 3;
  const sum = new Float32Array(G);
  const deg = new Float32Array(G);
  for (let it = 0; it < (opts.iterations ?? 40); it++) {
    sum.fill(0);
    deg.fill(0);
    for (let t = 0; t < tri; t++) {
      for (let e = 0; e < 3; e++) {
        const a = grp[index[t * 3 + e]];
        const b = grp[index[t * 3 + ((e + 1) % 3)]];
        sum[a] += val[b];
        deg[a]++;
        sum[b] += val[a];
        deg[b]++;
      }
    }
    for (let k = 0; k < G; k++) if (deg[k]) val[k] = 0.5 * val[k] + 0.5 * (sum[k] / deg[k]);
  }
  for (let i = 0; i < count; i++) low[i] = val[grp[i]];
  return { low, lo, hi };
}

/**
 * Grain du poil d'une texture peinte à grandes plaques (jack russell : blanc et feu), sans ses plaques : chaque texel
 * est rapporté à la moyenne locale de SA couleur (feu ou blanc, séparés par la saturation : moyennes floues masquées,
 * rayon R texels). Rapportée à une moyenne commune, ou à une moyenne par sommet interpolée, la limite des plaques
 * d'origine restait visible sur les robes unies (contours dentelés, clairs et foncés). Renvoie une texture (rouge :
 * log du rapport, de -0,9 à 0,45, sur 0 à 1) ou null.
 */
export function furDetail(img, R = 10) {
  if (!img || typeof document === 'undefined') return null;
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  try {
    ctx.drawImage(img, 0, 0, S, S);
  } catch {
    return null;
  }
  const px = ctx.getImageData(0, 0, S, S).data;
  const N = S * S;
  const L = new Float32Array(N);
  const Mt = new Float32Array(N); // feu (saturé)
  const Mv = new Float32Array(N); // texel utile (pas le fond noir)
  const sm = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < N; i++) {
    const r = px[i * 4] / 255;
    const g = px[i * 4 + 1] / 255;
    const b = px[i * 4 + 2] / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const sat = mx > 1e-3 ? (mx - mn) / mx : 0;
    // (luminance linéaire)
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    L[i] = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    Mt[i] = sm(0.2, 0.34, sat);
    Mv[i] = L[i] > 0.01 ? 1 : 0;
  }
  // moyennes floues (boîte séparable) de l·m, m, l·(1-m), (1-m), pour les texels utiles
  const blur = (src) => {
    const tmp = new Float32Array(N);
    const out = new Float32Array(N);
    for (let y = 0; y < S; y++) {
      let acc = 0;
      for (let x = -R; x <= R; x++) acc += src[y * S + Math.min(S - 1, Math.max(0, x))];
      for (let x = 0; x < S; x++) {
        tmp[y * S + x] = acc;
        acc += src[y * S + Math.min(S - 1, x + R + 1)] - src[y * S + Math.max(0, x - R)];
      }
    }
    for (let x = 0; x < S; x++) {
      let acc = 0;
      for (let y = -R; y <= R; y++) acc += tmp[Math.min(S - 1, Math.max(0, y)) * S + x];
      for (let y = 0; y < S; y++) {
        out[y * S + x] = acc;
        acc += tmp[Math.min(S - 1, y + R + 1) * S + x] - tmp[Math.max(0, y - R) * S + x];
      }
    }
    return out;
  };
  const a1 = new Float32Array(N);
  const a2 = new Float32Array(N);
  const a3 = new Float32Array(N);
  const a4 = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    a1[i] = L[i] * Mt[i] * Mv[i];
    a2[i] = Mt[i] * Mv[i];
    a3[i] = L[i] * (1 - Mt[i]) * Mv[i];
    a4[i] = (1 - Mt[i]) * Mv[i];
  }
  const b1 = blur(a1);
  const b2 = blur(a2);
  const b3 = blur(a3);
  const b4 = blur(a4);
  const data = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const mt = b2[i] > 1e-3 ? b1[i] / b2[i] : 0;
    const mw = b4[i] > 1e-3 ? b3[i] / b4[i] : 0;
    const m = Mt[i];
    const mean = m * (mt || mw) + (1 - m) * (mw || mt);
    const d = mean > 1e-4 && Mv[i] ? Math.log(Math.max(1e-4, L[i]) / mean) : 0;
    const v = Math.round(((Math.min(0.45, Math.max(-0.9, d)) + 0.9) / 1.35) * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.flipY = false;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  tex.userData.shared = true;
  return tex;
}

/**
 * Matériau du pelage d'un chien : MeshStandardMaterial du modèle, recoloré par le shader. shared : uniformes du
 * chien (makeCoatUniforms) et du modèle (makeLandUniforms) ; opts : { role 'fur' | 'keep', means ({ lo, hi } ou
 * null), contrast (grain gardé), keep (réglages du modèle : spheres, uv, pads, pink, dark) }.
 * Les uniformes sont dans la fermeture (pas sur le matériau) : un clone (lustrage du concours de beauté) les garde.
 */
export function coatMaterial(src, shared, opts) {
  const keep = opts.keep ?? {};
  const spheres = [...(keep.spheres ?? [])];
  while (spheres.length < MAX_KEEP) spheres.push({ s: new THREE.Vector4(0, 0, 0, 0), l: 0 });
  const uvs = (keep.uv ?? []).map((r) => new THREE.Vector4(...r));
  while (uvs.length < MAX_UV) uvs.push(new THREE.Vector4(0, 0, 0, 0));
  const own = {
    cRole: { value: opts.role === 'keep' ? 0 : 1 },
    cTexMode: { value: opts.detail ? 2 : opts.means ? 1 : 0 },
    cDetail: { value: opts.detail ?? null },
    cMeans: { value: new THREE.Vector3(opts.means?.lo ?? -3, opts.means?.hi ?? -1, opts.contrast ?? 1) },
    cKeepS: { value: spheres.slice(0, MAX_KEEP).map((x) => x.s) },
    cKeepL: { value: spheres.slice(0, MAX_KEEP).map((x) => x.l) },
    cKeepUv: { value: uvs.slice(0, MAX_UV) },
    cKeepOpt: { value: new THREE.Vector4(keep.dark ?? 0, keep.pink ? 1 : 0, keep.darkLips ? 1 : 0, keep.pads ?? 0) },
  };
  const uniforms = { ...shared, ...own };
  const mat = new THREE.MeshStandardMaterial({
    map: src?.map ?? null,
    roughness: opts.role === 'keep' ? 0.15 : 0.82,
    metalness: 0,
    name: opts.role === 'keep' ? 'dog_eye' : 'dog_coat',
  });
  if (opts.role === 'keep') return mat;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON_V}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${REST_V}`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>\n${PUSH_V}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_F}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${COLOR_F}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${CURL_F}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.45, cWet);\nroughnessFactor = mix(roughnessFactor, 0.12, cmpEyeK);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${SHEEN_F}`);
  };
  mat.customProgramCacheKey = () => 'dog-coat-v5';
  return mat;
}
