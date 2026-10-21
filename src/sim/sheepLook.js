// Gabarit des moutons réalistes (src/game/models/sheepReal.js) : proportions, toison, couleurs et cornes de chaque
// race, agneau, et l'état de la laine (toison qui repousse après la tonte).
//
// Un seul modèle d'artiste sert aux 7 races et aux agneaux : « Sheep_White_01 » de la Microsoft Rocketbox Avatar
// Library (MIT, © 2020 Microsoft ; tools/mouton/). Chaque race est obtenue par les os (longueur des membres, taille de
// la tête, oreilles), la cible de forme « shorn » (épaisseur de la toison : 1 tondu, négatif plus épaisse) et le
// shader (couleurs de la laine, de la tête, des pattes et des onglons, laine bouclée, laine longue). Valeurs
// relatives au modèle d'origine (1 : comme lui). Rien ici ne dépend de three.js (tests en node).

import { SPECIES } from './species.js';
import { lifeStage } from './animal.js';

/**
 * Réglages par race (absents : ONE).
 * size : taille en plus de look.scale (look.scale est recopié dans chaque sauvegarde : rapetisser une race passe par
 * ici) ; legs : longueur des membres ; head, ears : taille de la tête et des oreilles ; earUp : oreilles relevées
 * (cheviot) ou tombantes (négatif) ; fleece : toison pleine plus épaisse que celle du modèle (0 : comme lui, 0,6 :
 * mérinos très laineux) ; curl : laine bouclée ; long : laine longue qui pend (m, islandais) ; headWool : laine qui
 * couvre le front et les joues (mérinos) ; legWool : laine qui descend sur les pattes ; knees : genoux, jarrets et pieds
 * de la couleur de la tête (nez noir du Valais) ; face, leg, hoof : couleurs de la tête nue, du bas des pattes et des
 * onglons (null : celles de la robe, look.secondary) ; horns : 'ram' (béliers seulement), 'both' (béliers et brebis,
 * plus petites), null (sans cornes) ; hornK : taille des cornes ; hornColor.
 */
const ONE = {
  size: 1, legs: 1, head: 1, ears: 1, earUp: 0, fleece: 0.2, curl: 0, long: 0, headWool: 0, legWool: 0, knees: false,
  face: null, leg: null, hoof: 0x3a302a, horns: null, hornK: 1, hornColor: 0xc9b89a,
};
export const SHEEP_BUILDS = {
  // (très laineux : toison dense jusque sur le front et le haut des pattes, face et pattes blanches ; béliers à cornes
  // en spirale)
  merinos: { fleece: 0.75, curl: 0.25, headWool: 0.75, legWool: 0.6, face: 0xefe7d8, leg: 0xe9dfcd, hoof: 0x8c7c68, horns: 'ram', hornK: 1.15, head: 0.97, legs: 0.97 },
  // (tête et pattes noires, sans laine sur la tête, grandes oreilles tombantes ; toison courte)
  suffolk: { fleece: 0.08, face: 0x221c18, leg: 0x221c18, hoof: 0x14110f, legs: 1.07, head: 1.1, ears: 1.25, earUp: -0.35 },
  // (tout petit, souvent noir ; béliers à cornes en spirale)
  ouessant: { size: 0.8, fleece: 0.22, face: null, leg: null, hoof: 0x14100e, horns: 'ram', hornK: 0.85, hornColor: 0x7d705f, legs: 0.95, head: 1.1 },
  // (laine bouclée, face, oreilles, genoux, jarrets et pieds noirs ; cornes en spirale, béliers et brebis)
  nez_noir: { fleece: 0.45, curl: 1, headWool: 0.35, knees: true, face: 0x1a1614, leg: 0xede5d6, hoof: 0x14110f, horns: 'both', hornK: 1.2, hornColor: 0x8a7b66, head: 1.04 },
  // (laine longue en mèches qui pendent ; cornes, béliers et brebis)
  islandais_mouton: { fleece: 0.45, long: 0.17, horns: 'both', hornK: 1.0, hornColor: 0xb9a786, legs: 0.95, face: null, leg: null, hoof: 0x4a3e34 },
  // (toison très dense, mérinos plus grand ; béliers à cornes en spirale)
  merinos_australien: { fleece: 0.85, curl: 0.3, headWool: 0.6, legWool: 0.55, face: 0xf0e8d9, leg: 0xeae0ce, hoof: 0x8c7c68, horns: 'ram', hornK: 1.25 },
  // (face blanche nue, oreilles dressées, pattes blanches nues ; toison courte, sans cornes)
  cheviot: { fleece: 0.0, face: 0xf3eee5, leg: 0xefe9df, hoof: 0x3a2f28, legs: 1.05, head: 1.03, ears: 1.12, earUp: 0.35 },
};

/** Agneau (stade « bébé ») et jeune : tête plus grosse, pattes plus longues, toison courte et bouclée. */
export const LAMB = { head: 1.24, legs: 1.14, ears: 1.08, fleece: -0.45, curl: 0.55 };
const YOUNG = 0.45; // (le jeune est à mi-chemin, un peu plus près de l'adulte)

const lum = (hex) => {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Race d'un mouton d'après sa robe (anciennes sauvegardes sans look.breed). */
export function sheepBreedOfLook(look) {
  const sp = SPECIES.sheep;
  return sp.breeds.find((b) => b.colors.some((c) => c.coat === look.coat && c.secondary === look.secondary))?.id ?? null;
}

/**
 * Gabarit d'un mouton : race (look.breed, sinon celle de l'animal — jamais « mix » —, sinon devinée par la robe,
 * sinon mérinos), stade ('baby' | 'young' | autre), sexe (cornes des béliers). Renvoie les réglages de ONE complétés,
 * les couleurs (wool, face, leg, hoof, horn) et la taille des cornes (horns : 0 = sans).
 */
export function sheepBuild(look = {}, { breed = null, stage = 'adult', sex = 'f' } = {}) {
  const id = [look.breed, breed].find((b) => b && b !== 'mix' && SHEEP_BUILDS[b]) ?? sheepBreedOfLook(look) ?? 'merinos';
  const B = { ...ONE, ...SHEEP_BUILDS[id], breed: id };
  const k = stage === 'baby' ? 1 : stage === 'young' ? YOUNG : 0;
  B.lamb = stage === 'baby';
  B.stage = stage === 'baby' || stage === 'young' ? stage : 'adult';
  if (k) {
    B.head *= 1 + (LAMB.head - 1) * k;
    B.legs *= 1 + (LAMB.legs - 1) * k;
    B.ears *= 1 + (LAMB.ears - 1) * k;
    B.fleece = B.fleece * (1 - k) + LAMB.fleece * k;
    B.curl = Math.max(B.curl, LAMB.curl * k);
    B.long *= 1 - k * 0.8;
    B.headWool *= 1 - k * 0.5;
  }
  // Couleurs : laine = robe ; tête et pattes = celles de la race, ou la seconde couleur de la robe (marques des
  // « points » du suffolk et du nez noir, mouton noir d'Ouessant, islandais moorit, agneau croisé).
  const wool = look.coat ?? 0xeee6d6;
  const second = look.secondary ?? wool;
  const darkSecond = lum(second) < 0.25;
  const face = look.pattern === 'points' || darkSecond || B.face === null ? second : B.face;
  // (pattes : celles de la race, sinon la tête ; noires si la tête l'est, sauf le nez noir aux pattes blanches)
  const leg = B.leg === null ? face : B.knees ? B.leg : look.pattern === 'points' && darkSecond ? face : B.leg;
  B.colors = { wool, face, leg, hoof: B.hoof, horn: B.hornColor };
  // Cornes : béliers seulement ou les deux (brebis : plus petites) ; agneau sans, jeune à demi.
  const hornSex = B.horns === 'both' ? (sex === 'm' ? 1 : 0.55) : B.horns === 'ram' && sex === 'm' ? 1 : 0;
  B.hornSize = hornSex * B.hornK * (stage === 'baby' ? 0 : stage === 'young' ? 0.5 : 1);
  B.key = [id, B.stage, B.legs.toFixed(3)].join('|');
  return B;
}

/**
 * Toison d'un mouton, de 0 (tondu) à 1 (pleine) : elle repousse depuis la dernière tonte au rythme de la laine du jeu
 * (a.produce : 0 à 100, src/sim/farm.js). Jamais tondu (animalerie, client, agneau, ancienne partie) : pleine.
 */
export function sheepFleece(a) {
  if (!a || !a.woolCut) return 1;
  return Math.min(1, Math.max(0, (a.produce ?? 0) / 100));
}

/**
 * Poids de la cible de forme « shorn » pour une toison f (0 tondu, 1 pleine) : 1 tondu, jusqu'à -fleece (plus épaisse
 * que le modèle) quand elle est pleine. extra : épaisseur en plus (laine gonflée du concours de beauté, coupe du salon).
 */
export function shornWeight(B, f, extra = 0) {
  const full = -(B.fleece ?? 0) - extra;
  const t = Math.min(1, Math.max(0, f));
  return 1 + (full - 1) * t;
}

/** Apparence d'un mouton du jeu pour son modèle 3D : sa robe, son stade (agneau, jeune) et son sexe (cornes). */
export function sheepLookOf(a, stage = lifeStage(a)) {
  return { ...a.look, lamb: stage === 'baby', young: stage === 'young', sex: a.sex ?? 'f' };
}

/** Stade du gabarit 3D d'un mouton : 'baby', 'young' ou 'adult' (le senior garde le gabarit adulte). */
export const sheepStage = (stage) => (stage === 'baby' || stage === 'young' ? stage : 'adult');
