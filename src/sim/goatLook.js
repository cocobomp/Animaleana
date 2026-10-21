// Gabarit des chèvres réalistes (src/game/models/goatReal.js) : proportions, robe, cornes, barbe, poil long et mamelle
// de chaque race, chevreau, bouc.
//
// Un seul modèle d'artiste sert aux 4 races et aux chevreaux : « Goat_White_01 » de la Microsoft Rocketbox Avatar
// Library (MIT, © 2020 Microsoft), avec les cornes arquées de « Goat_Brown_01 » en cible de forme (tools/chevre/).
// Chaque race est obtenue par les os (membres, tête, oreilles, cornes, barbe, mamelle), la cible de forme des cornes
// (0 droites, 1 arquées) et le shader (robe : chamoisée à raie dorsale et pattes noires, blanche, noire au ventre clair,
// avant noir et arrière blanc ; poil long qui pend). Valeurs relatives au modèle d'origine (1 : comme lui). La couleur
// de la robe vient de look (coat, secondary) mais le motif vient de la race : la poitevine reste noire au ventre clair
// même si species.js la dit « brune et blanche ». Rien ici ne dépend de three.js (tests en node).

import { SPECIES } from './species.js';
import { lifeStage } from './animal.js';

/**
 * Réglages par race (absents : ONE).
 * size : taille en plus de look.scale ; legs : longueur des membres ; head, ears : taille de la tête et des oreilles ;
 * earUp : oreilles relevées (positif) ou tombantes ; pattern : 'white' (unie), 'chamoisee' (raie dorsale, ventre, pattes
 * et masque noirs), 'poitevine' (noire, ventre, intérieur des pattes et bandes de la face clairs), 'colnoir' (avant noir,
 * arrière blanc) ; long : poil long qui pend (m) ; horns : 'straight' (droites), 'back' (arquées vers l'arrière), null
 * (sans) ; hornK : taille des cornes (chèvre ; bouc × BUCK.horns) ; beard : barbe de la chèvre ; hoof, horn : couleurs.
 */
const ONE = {
  size: 1, legs: 1, head: 1, ears: 1, earUp: 0, pattern: 'white', long: 0, horns: 'straight', hornK: 0.8, beard: 1,
  hoof: 0x3a2f28, horn: 0x5f5448,
};
export const GOAT_BUILDS = {
  // (brun chamois, raie dorsale noire, ventre et pattes noirs, deux bandes noires sur la face ; cornes arquées)
  alpine: { pattern: 'chamoisee', horns: 'back', hornK: 0.8, earUp: 0.15, hoof: 0x1f1a17, horn: 0x4a3f36 },
  // (toute blanche, sans cornes, oreilles dressées vers l'avant ; un peu plus grande)
  saanen: { pattern: 'white', horns: null, earUp: 0.25, beard: 0.8, hoof: 0x9a8a78, horn: 0xb8ab98, legs: 1.02 },
  // (poil long noir, ventre, intérieur des cuisses et bas des pattes clairs, bandes claires sur la face ; petites cornes)
  poitevine: { pattern: 'poitevine', long: 0.11, horns: 'straight', hornK: 0.55, earUp: -0.05, hoof: 0x1c1714, horn: 0x5a5048 },
  // (avant noir, arrière blanc, poil long ; grandes cornes arquées pour les deux sexes)
  col_noir: { pattern: 'colnoir', long: 0.14, horns: 'back', hornK: 1.0, earUp: 0.1, hoof: 0x1c1714, horn: 0x2f2925, head: 1.03 },
};

/** Chevreau (stade « bébé ») : tête plus grosse, pattes plus longues, oreilles plus grandes, ni cornes ni barbe. */
export const KID = { head: 1.28, legs: 1.12, ears: 1.12 };
const YOUNG = 0.45; // (le jeune est à mi-chemin, un peu plus près de l'adulte)
/** Bouc : cornes et barbe plus grandes, un peu plus massif. */
export const BUCK = { horns: 1.45, beard: 1.5, size: 1.05 };
/** Mamelle : bouc et chevreau (petite), chèvre vide et pleine (échelle de l'os). */
export const UDDER = { small: 0.28, empty: 0.72, full: 1.18 };

const lum = (hex) => {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const mixHex = (a, b, t) => {
  const c = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (c(16) << 16) | (c(8) << 8) | c(0);
};

/** Race d'une chèvre d'après sa robe (anciennes sauvegardes sans look.breed). */
export function goatBreedOfLook(look) {
  const sp = SPECIES.goat;
  return sp.breeds.find((b) => b.colors.some((c) => c.coat === look.coat && c.secondary === look.secondary))?.id ?? null;
}

/**
 * Gabarit d'une chèvre : race (look.breed, sinon celle de l'animal — jamais « mix » —, sinon devinée par la robe, sinon
 * alpine), stade ('baby' | 'young' | autre), sexe ('m' : bouc). Renvoie les réglages de ONE complétés, les couleurs
 * (base, dark, light, face, leg, hoof, horn, udder), la taille des cornes (hornSize, 0 = sans), leur forme (hornBack :
 * poids de la cible de forme), la barbe (beardSize) et la mamelle de base (udder).
 */
export function goatBuild(look = {}, { breed = null, stage = 'adult', sex = 'f' } = {}) {
  const id = [look.breed, breed].find((b) => b && b !== 'mix' && GOAT_BUILDS[b]) ?? goatBreedOfLook(look) ?? 'alpine';
  const B = { ...ONE, ...GOAT_BUILDS[id], breed: id };
  const k = stage === 'baby' ? 1 : stage === 'young' ? YOUNG : 0;
  B.stage = stage === 'baby' || stage === 'young' ? stage : 'adult';
  B.kid = stage === 'baby';
  B.buck = sex === 'm';
  if (k) {
    B.head *= 1 + (KID.head - 1) * k;
    B.legs *= 1 + (KID.legs - 1) * k;
    B.ears *= 1 + (KID.ears - 1) * k;
    // (poil des chevreaux : plus court)
    B.long *= 1 - k * 0.7;
  }
  if (B.buck && B.stage === 'adult') B.size *= BUCK.size;
  // Couleurs : celles de l'animal (look.coat, look.secondary : mélangées chez un chevreau croisé), arrangées selon le
  // motif de la race.
  const coat = look.coat ?? 0xf3efe6;
  const second = look.secondary ?? coat;
  let base = coat;
  let dark = 0x1d1714;
  let light = 0xf1ece2;
  if (B.pattern === 'chamoisee') {
    // (brun chamois un peu plus profond que la couleur du jeu : sous le soleil du jeu, elle tirait sur l'orange)
    base = mixHex(coat, 0x5c3317, 0.35);
    dark = lum(second) < 0.2 ? second : 0x1d1714;
  } else if (B.pattern === 'poitevine') {
    // (robe noire ou brun très foncé, même si la couleur du jeu est un brun : la poitevine est noire)
    base = mixHex(lum(coat) < lum(second) ? coat : second, 0x16120f, 0.55);
    light = mixHex(lum(coat) < lum(second) ? second : coat, 0xe6dccb, 0.35);
  } else if (B.pattern === 'colnoir') {
    dark = lum(coat) < lum(second) ? coat : second;
    light = lum(coat) < lum(second) ? second : coat;
    base = light;
  }
  const white = B.pattern === 'white';
  B.colors = {
    base,
    dark,
    light,
    face: base,
    leg: white ? base : dark,
    hoof: B.hoof,
    horn: B.horn,
    // (mamelle : peau rose des robes claires, gris foncé sinon)
    udder: white ? 0xd8a596 : B.pattern === 'colnoir' ? 0xc99a8c : 0x4a3d38,
  };
  // Cornes : aucune pour la saanen (et la robe « sans cornes » d'un croisé), aucune pour le chevreau, petites pour le
  // jeune ; plus grandes chez le bouc.
  const polled = !B.horns || look.horns === 'none';
  B.hornBack = B.horns === 'back' ? 1 : 0;
  B.hornSize = polled ? 0 : B.hornK * (B.buck ? BUCK.horns : 1) * (stage === 'baby' ? 0 : stage === 'young' ? 0.42 : 1);
  // Barbe : chevreau sans, jeune petite, bouc longue (look.beard false : sans).
  B.beardSize = look.beard === false ? 0 : B.beard * (B.buck ? BUCK.beard : 1) * (stage === 'baby' ? 0 : stage === 'young' ? 0.45 : 1);
  // Mamelle de repos : petite pour le bouc et le chevreau ; la chèvre adulte : selon le lait (goatUdder).
  B.udder = B.buck || B.stage !== 'adult' ? UDDER.small : UDDER.empty;
  B.milker = !B.buck && B.stage === 'adult';
  B.key = [id, B.stage, B.legs.toFixed(3)].join('|');
  return B;
}

/** Mamelle d'une chèvre laitière selon son lait (a.produce 0-100 : vide après la traite, pleine quand le lait est prêt). */
export function goatUdderFill(a) {
  if (!a || a.sex !== 'f') return 0;
  const st = lifeStage(a);
  if (st !== 'adult' && st !== 'senior') return 0;
  return Math.min(1, Math.max(0, (a.produce ?? 0) / 100));
}

/** Échelle de l'os de la mamelle : B (goatBuild), fill 0-1. */
export function udderScale(B, fill = 0) {
  if (!B.milker) return B.udder;
  return UDDER.empty + (UDDER.full - UDDER.empty) * Math.min(1, Math.max(0, fill));
}

/** Apparence d'une chèvre du jeu pour son modèle 3D : sa robe, son stade (chevreau, jeune) et son sexe (bouc). */
export function goatLookOf(a, stage = lifeStage(a)) {
  return { ...a.look, kid: stage === 'baby', young: stage === 'young', sex: a.sex ?? 'f' };
}

/** Stade du gabarit 3D d'une chèvre : 'baby', 'young' ou 'adult' (la chèvre âgée garde le gabarit adulte). */
export const goatStage = (stage) => (stage === 'baby' || stage === 'young' ? stage : 'adult');
