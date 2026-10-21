// Gabarit des vaches réalistes (src/game/models/cowReal.js) : proportions, robe, cornes, poil long et mamelle de chaque
// race, veau, génisse, taureau.
//
// Deux modèles d'artistes : la vache de Lyndon Daniels (« Realtime Rancher's 3D Model Pack », CC0 1.0 — même artiste et
// même licence que le cheval du jeu) pour les vaches, les génisses et les veaux des deux sexes, et « Bull_Brown_01 » de
// la Microsoft Rocketbox Avatar Library (MIT, © 2020 Microsoft — même source que les moutons et les chèvres) pour les
// taureaux (mâles adultes). Chaque race est obtenue par les os (membres, tête, oreilles, cornes, mamelle), par le
// gabarit (tronc plus large et plus profond des races à viande, fait sur la géométrie) et par le shader (robe peinte
// sur un masque propre : pie noire, pie rouge à lunettes et bringé, unie, rouge à tête blanche ; mufle ; poil long).
// Valeurs relatives au modèle d'origine (1 : comme lui). La couleur vient de look (coat, secondary) mais le motif vient
// de la race : la Canadienne reste brun noir même si species.js la dit « brune ». Rien ici ne dépend de three.js
// (tests en node).

import { SPECIES } from './species.js';
import { lifeStage } from './animal.js';

/**
 * Réglages par race (absents : ONE).
 * size : taille en plus de look.scale ; legs : longueur des membres ; girth : largeur du tronc ; depth : profondeur du
 * ventre ; head, ears : taille de la tête et des oreilles ; earUp : oreilles relevées (+) ou tombantes (−) ; pattern :
 * 'pie' (taches de la photo de la vache, seuil pie : 0,5 comme la photo, plus bas = plus de couleur), 'solid' (unie),
 * 'hereford' (rouge, tête, poitrail, ventre, bas des pattes et toupillon blancs) ; lunettes (tour des yeux foncé),
 * brindle (bringé dans les taches), whiteLegs (bas des pattes et toupillon blancs), muzzleRing (mufle clair autour d'un
 * nez sombre) ; hair : poil long (m) ; fringe : frange sur les yeux (m) ; horns : 'cow' (courtes), 'long' (en lyre),
 * 'none' (sans) ; hornK : taille des cornes, hornLift : cornes courtes relevées (rad), hornFwd : cornes portées en avant
 * (lutteuse), hornReach : longueur des cornes en lyre (× la corne du modèle, refaite en courbe : cowReal.js) ; udder : mamelle (1 vache laitière) ; nose, hoof, horn, hornTip : couleurs.
 * Taureau (son propre modèle, sans taches dans sa photo) : bullPie, seuil de ses taches calculées (pie) ; bullHorn,
 * courbe de ses cornes longues (t0 : départ, t1 : pointe — directions dans le repère de la vache, x vers son côté —,
 * reach : longueur × sa corne courte, thick : épaisseur à la base) ; bullHair : poil long du taureau (× hair).
 */
const ONE = {
  size: 1, legs: 1, girth: 1, depth: 1, head: 1, ears: 1, earUp: 0, pattern: 'solid', pie: 0.5, lunettes: 0, brindle: 0, whiteLegs: 0,
  muzzleRing: 0, hair: 0, fringe: 0, horns: 'cow', hornK: 1, hornLift: 0, hornFwd: 0, hornReach: 2.6, udder: 1,
  nose: 0x3a3236, hoof: 0x2c2522, horn: 0xd8cbb0, hornTip: 0x3a3028,
};
export const COW_BUILDS = {
  // (pie rouge et blanche à « lunettes » foncées autour des yeux, bringé dans les taches ; face blanche)
  normande: { pattern: 'pie', pie: 0.56, lunettes: 1, brindle: 0.55, nose: 0xc99a8a, hoof: 0x6a5a4c, udder: 1.05, girth: 1.03 },
  // (pie NOIRE et blanche à grandes taches, grande, grosse mamelle ; bas des pattes et toupillon blancs)
  holstein: { pattern: 'pie', pie: 0.62, whiteLegs: 1, legs: 1.05, girth: 0.95, depth: 0.97, nose: 0x2e2a2c, hoof: 0x34302e, udder: 1.25 },
  // (blanc crème uni, massive, sans cornes)
  charolaise: { pattern: 'solid', horns: 'none', legs: 0.95, girth: 1.18, depth: 1.06, head: 1.04, nose: 0xd2a89a, hoof: 0x9c8a74, udder: 0.6 },
  // (petite, poil long roux, frange sur les yeux, très longues cornes en lyre)
  highland: {
    pattern: 'solid', legs: 0.82, girth: 1.1, depth: 1.04, head: 1.05, ears: 1.05, hair: 0.17, fringe: 0.2, horns: 'long', hornK: 1.0, hornReach: 3.0,
    nose: 0x3c2e2a, hoof: 0x2a2320, horn: 0xe6dcc6, hornTip: 0x2e2620, udder: 0.5,
    // (taureau : cornes épaisses, à l'horizontale sur le côté puis pointes tournées vers l'avant et un peu relevées)
    bullHorn: { t0: [1, -0.06, 0.16], t1: [0.3, 0.8, 0.62], reach: 2.7, thick: 1.5 },
  },
  // (toute petite, pie noire — plus de noir que de blanc)
  bretonne_pie_noire: { pattern: 'pie', pie: 0.4, bullPie: 0.43, legs: 0.94, head: 1.07, nose: 0x2e2a2c, hoof: 0x2a2624, udder: 0.85, hornK: 0.9, hornLift: 0.2 },
  // (petite, trapue, noire ou rouge foncé, cornes de lutteuse portées en avant)
  herens: { pattern: 'solid', legs: 0.86, girth: 1.14, depth: 1.05, head: 1.1, horns: 'cow', hornK: 1.15, hornFwd: 0.5, nose: 0x2a2426, hoof: 0x231e1c, udder: 0.65 },
  // (noire unie)
  wagyu: { pattern: 'solid', girth: 1.03, nose: 0x2a2426, hoof: 0x231e1c, udder: 0.65 },
  // (brun noir, mufle clair)
  canadienne: { pattern: 'solid', muzzleRing: 1, girth: 0.96, head: 0.98, nose: 0x2a2224, hoof: 0x2a2320, udder: 0.9 },
  // (rouge à tête, poitrail, ventre, bas des pattes et toupillon blancs ; trapue)
  hereford: { pattern: 'hereford', legs: 0.92, girth: 1.12, depth: 1.04, head: 1.04, nose: 0xd8a596, hoof: 0x8a7866, udder: 0.6 },
  // (noire unie, sans cornes)
  angus: { pattern: 'solid', horns: 'none', legs: 0.94, girth: 1.12, depth: 1.03, nose: 0x2a2426, hoof: 0x231e1c, udder: 0.6 },
  // (rouge, cornes longues en lyre)
  retinta: {
    pattern: 'solid', legs: 1.02, girth: 0.98, horns: 'long', hornK: 0.85, hornReach: 2.2, nose: 0x5a3c34, hoof: 0x3a2e28, udder: 0.6,
    // (taureau : en lyre, sur le côté puis relevées)
    bullHorn: { t0: [1, 0.1, 0.22], t1: [0.25, 1, 0.3], reach: 2.5, thick: 1.15 },
  },
};

/** Veau (stade « bébé ») : tête plus grosse, longues pattes pour sa taille, corps plus fin, oreilles plus grandes. */
export const CALF = { head: 1.3, legs: 1.12, ears: 1.12, girth: 0.88, depth: 0.92 };
const YOUNG = 0.45; // (la génisse ou le jeune taureau est à mi-chemin, un peu plus près de l'adulte)
/** Taureau : plus massif, encolure épaisse (sur son propre modèle, Rocketbox). */
export const BULL = { girth: 1.04, size: 1.04 };
/** Mamelle : veau mâle (rentrée), velle et génisse (petite), vache vide et pleine (échelle de l'os, × udder de la race). */
export const UDDER = { none: 0.02, small: 0.14, empty: 0.72, full: 1.12 };
/** Couleur forcée de quelques robes (la couleur du jeu ne colle pas à la race). */
const FORCED = {
  // (« brun noir » : la couleur « Brune » du jeu, 0x5a3a26, est trop claire)
  canadienne: 0x2c1c14,
};

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

/** Race d'une vache d'après sa robe (anciennes sauvegardes sans look.breed). */
export function cowBreedOfLook(look) {
  const sp = SPECIES.cow;
  return sp.breeds.find((b) => b.colors.some((c) => c.coat === look.coat && c.secondary === look.secondary))?.id ?? null;
}

/**
 * Race d'une vache : look.breed, sinon celle de l'animal (jamais « mix »), sinon devinée par la robe, sinon normande.
 */
export function cowBreedOf(look = {}, breed = null) {
  return [look.breed, breed].find((b) => b && b !== 'mix' && COW_BUILDS[b]) ?? cowBreedOfLook(look) ?? 'normande';
}

/** Le modèle 3D d'une vache : 'bull' (taureau Rocketbox) pour un mâle adulte, sinon 'cow' (vache de Lyndon Daniels). */
export const cowModelKind = (look = {}) => (look.sex === 'm' && !look.calf && !look.young ? 'bull' : 'cow');

/**
 * Gabarit d'une vache : race, stade ('baby' | 'young' | autre), sexe ('m' : taureau, adulte). Renvoie les réglages de
 * ONE complétés, le modèle (kind), les couleurs (base, white, tan, nose, hoof, horn, hornTip, udder), la taille des
 * cornes (hornSize, 0 = sans), leur forme (hornLong : 0 courtes → 1 en lyre), la mamelle de base (udder) et la clé du
 * gabarit (géométrie partagée).
 */
export function cowBuild(look = {}, { breed = null, stage = 'adult', sex = 'f' } = {}) {
  const id = cowBreedOf(look, breed);
  const B = { ...ONE, ...COW_BUILDS[id], breed: id };
  const k = stage === 'baby' ? 1 : stage === 'young' ? YOUNG : 0;
  B.stage = stage === 'baby' || stage === 'young' ? stage : 'adult';
  B.calf = stage === 'baby';
  B.bull = sex === 'm' && B.stage === 'adult';
  B.male = sex === 'm';
  B.kind = B.bull ? 'bull' : 'cow';
  if (k) {
    B.head *= 1 + (CALF.head - 1) * k;
    B.legs *= 1 + (CALF.legs - 1) * k;
    B.ears *= 1 + (CALF.ears - 1) * k;
    B.girth *= 1 + (CALF.girth - 1) * k;
    B.depth *= 1 + (CALF.depth - 1) * k;
    // (poil du veau : plus court, frange légère)
    B.hair *= 1 - k * 0.55;
    B.fringe *= 1 - k * 0.5;
  }
  if (B.bull) {
    B.girth *= BULL.girth;
    B.size *= BULL.size;
  }
  // Couleurs : celles de l'animal (look.coat, look.secondary : mélangées chez un veau croisé), arrangées selon le motif.
  const coat = FORCED[id] ?? look.coat ?? 0x6b3f25;
  const second = look.secondary ?? coat;
  let base = coat;
  let white = 0xf2eee6;
  let tan = mixHex(coat, 0x000000, 0.45);
  if (B.pattern === 'pie') {
    // (couleur des taches : la plus foncée des deux ; le fond : la plus claire)
    base = lum(coat) < lum(second) ? coat : second;
    white = lum(coat) < lum(second) ? second : coat;
    if (lum(white) < 0.55) white = 0xf2eee6;
    tan = mixHex(base, 0x120806, 0.55);
  } else if (B.pattern === 'hereford') {
    base = lum(coat) < lum(second) ? coat : second;
    white = lum(coat) < lum(second) ? second : coat;
  } else if (B.muzzleRing) {
    // (Canadienne : mufle clair — un anneau fauve autour du nez)
    tan = 0xb89c78;
  }
  B.colors = {
    base,
    white,
    tan,
    nose: B.nose,
    hoof: B.hoof,
    horn: B.horn,
    hornTip: B.hornTip,
    // (mamelle : peau rose des robes claires ou pie, gris rosé des robes sombres)
    udder: B.pattern === 'solid' && lum(base) < 0.12 ? 0x6a5452 : 0xe0aa9c,
  };
  // Cornes : selon la race (et la robe « sans cornes » d'un croisé) ; aucune pour le veau, petites pour le jeune.
  const want = look.horns === 'none' || B.horns === 'none' ? 'none' : look.horns === 'long' || B.horns === 'long' ? 'long' : 'cow';
  B.horns = want;
  B.hornLong = want === 'long' ? 1 : 0;
  B.hornSize = want === 'none' ? 0 : B.hornK * (stage === 'baby' ? 0 : stage === 'young' ? 0.4 : 1) * (B.bull ? 1.1 : 1);
  // Mamelle de repos : petite pour la velle et la génisse, rentrée pour le veau mâle et le jeune taureau (le taureau
  // adulte, son propre modèle, n'en a pas) ; la vache : selon le lait (cowUdderFill).
  B.milker = !B.male && B.stage === 'adult';
  B.udderBase = B.udder;
  B.udder = B.milker ? UDDER.empty * B.udderBase : B.male ? UDDER.none : UDDER.small;
  B.key = [B.kind, id, B.stage, B.legs.toFixed(3), B.girth.toFixed(3), B.depth.toFixed(3)].join('|');
  return B;
}

/** Mamelle d'une vache laitière selon son lait (a.produce 0-100 : vide après la traite, pleine quand le lait est prêt). */
export function cowUdderFill(a) {
  if (!a || a.sex !== 'f') return 0;
  const st = lifeStage(a);
  if (st !== 'adult' && st !== 'senior') return 0;
  return Math.min(1, Math.max(0, (a.produce ?? 0) / 100));
}

/** Échelle de l'os de la mamelle : B (cowBuild), fill 0-1. */
export function cowUdderScale(B, fill = 0) {
  if (!B.milker) return B.udder;
  const f = Math.min(1, Math.max(0, fill));
  return (UDDER.empty + (UDDER.full - UDDER.empty) * f) * (B.udderBase ?? 1);
}

/** Apparence d'une vache du jeu pour son modèle 3D : sa robe, son stade (veau, jeune), son sexe et sa race. */
export function cowLookOf(a, stage = lifeStage(a)) {
  const breed = cowBreedOf(a.look ?? {}, a.breed);
  return { ...a.look, breed, calf: stage === 'baby', young: stage === 'young', sex: a.sex ?? 'f' };
}

/** Stade du gabarit 3D d'une vache : 'baby', 'young' ou 'adult' (la vache âgée garde le gabarit adulte). */
export const cowStage = (stage) => (stage === 'baby' || stage === 'young' ? stage : 'adult');
