// Gabarit des lapins réalistes (src/game/models/rabbitReal.js) : quel modèle 3D prend chaque lapin et ses proportions.
//
// Deux modèles d'artistes servent aux 6 races (src/sim/species.js, SPECIES.rabbit) : le lapin gris de Dakota.Hinkle
// (CC-BY 4.0, oreilles dressées) pour toutes les races sauf le bélier, le bélier fauve de FourthGreen (CC-BY 4.0,
// oreilles tombantes modélisées) pour le bélier. Chaque race est obtenue en déformant le modèle par ses os (pattes,
// dos, tronc, encolure, tête, museau, oreilles, queue) et en poussant la peau pour le poil (angora, crinière du tête de
// lion) ; des cartes de poils frangent la silhouette (poil long de l'angora, crinière et jupe du tête de lion, pinceaux
// des oreilles de l'angora) et le shader de la robe fait le reste (poil ras velouté du rex). Valeurs relatives au modèle
// d'origine (1 : comme lui ; le lapin de Dakota est un lapin commun rond à poil court). Rien ici ne dépend de three.js
// (tests en node).

import { SPECIES } from './species.js';

/**
 * Champs (absents = valeur de ONE) :
 * legs, legW : longueur et épaisseur des pattes ; back : longueur du dos ; girth : largeur du tronc ; head, headW :
 * taille et largeur du crâne ; snout, muzzleW : longueur et largeur du museau ; neck : encolure ; eyes : taille des yeux ;
 * earLen, earW : longueur et largeur des oreilles ; earOut : oreilles plus écartées (rad) ; tail : taille du pompon ;
 * fur : poil long (m, lapin de taille 1, poussé le long de la peau) ; mane : crinière (cou, nuque, joues, poitrail) ;
 * skirt : jupe (bas des flancs) ; cards : cartes de poils sur tout le corps (0 à 1, angora) ; cardLen : leur longueur
 * (m) ; maneCards : cartes de la crinière (0 à 1) ; tassels : pinceaux au bout des oreilles (angora) ;
 * velvet : poil ras velouté (rex : grain effacé, reflet doux) ; plush : poil dense.
 */
export const ONE = {
  legs: 1, legW: 1, back: 1, girth: 1, head: 1, headW: 1, snout: 1, muzzleW: 1, neck: 1, eyes: 1,
  earLen: 1, earW: 1, earOut: 0, tail: 1,
  fur: 0, mane: 0, skirt: 0, cards: 0, cardLen: 0, maneCards: 0, tassels: 0, velvet: 0, plush: 0,
};

// Proportions par race (relatives au lapin de Dakota ; le bélier : au bélier de FourthGreen).
export const RABBIT_BUILDS = {
  // Nain (néerlandais) : tout rond, grosse tête ronde et courte, toutes petites oreilles, pattes courtes, gros yeux.
  nain: { legs: 0.8, back: 0.76, girth: 1.14, head: 1.4, headW: 1.26, snout: 0.66, muzzleW: 1.08, neck: 0.62, eyes: 1.18, earLen: 0.38, earW: 1.02, earOut: 0.16, tail: 0.85 },
  // Bélier : le modèle de FourthGreen a déjà les oreilles tombantes ; tête large et forte, corps trapu.
  belier: { head: 1.06, headW: 1.1, girth: 1.06, snout: 0.92, muzzleW: 1.08, neck: 0.9, earLen: 1.04, earW: 1.06 },
  // Angora : une boule de poils longs (corps, pattes, joues), pinceaux au bout des oreilles.
  angora: { girth: 1.04, head: 1.02, earLen: 0.94, fur: 0.026, cards: 1, cardLen: 0.045, tassels: 1, plush: 0.5 },
  // Rex : poil ras et velouté (comme une peluche rase), oreilles épaisses, corps bien rond.
  rex: { girth: 1.05, head: 1.03, earLen: 0.92, earW: 1.12, fur: -0.002, velvet: 1 },
  // Géant des Flandres (taille de la race : 1,6) : long dos, grosses pattes, grandes oreilles larges.
  geant_flandres: { legs: 1.05, legW: 1.14, back: 1.24, girth: 1.08, head: 1.0, headW: 1.05, snout: 1.08, earLen: 1.2, earW: 1.18 },
  // Tête de lion : petit et rond, crinière autour de la tête et du cou, jupe sur les flancs, oreilles courtes.
  tete_de_lion: { back: 0.9, girth: 1.06, head: 1.12, headW: 1.06, snout: 0.85, neck: 0.78, eyes: 1.06, earLen: 0.6, earW: 0.95, mane: 0.03, maneCards: 1, cardLen: 0.045, skirt: 0.45, fur: 0.004 },
};

const breedById = (id) => SPECIES.rabbit.breeds.find((b) => b.id === id) ?? null;

/**
 * Race d'un lapin d'après sa robe (anciennes sauvegardes sans look.breed ni a.breed) : oreilles tombantes = bélier, sinon
 * la race dont une robe correspond (couleurs et nom), et à défaut le rex (la race « moyenne » du jeu).
 */
export function rabbitBreedGuess(look = {}) {
  if (look.earType === 'lop') return breedById('belier');
  let best = null;
  let bestScore = Infinity;
  for (const b of SPECIES.rabbit.breeds) {
    if (b.earType === 'lop') continue;
    if (!b.colors.some((c) => c.coat === look.coat && c.secondary === look.secondary
      && (!look.colorName || c.name?.fr === look.colorName.fr))) continue;
    const score = Math.abs((b.fluff ?? 1) - (look.fluff ?? 1)) + Math.abs((b.scale ?? 1) - (look.scale ?? 1));
    if (score < bestScore) {
      best = b;
      bestScore = score;
    }
  }
  return best ?? breedById('rex');
}

/**
 * Apparence d'un lapin avec sa race (look.breed) : celle du look, sinon la race de l'animal (anciennes sauvegardes
 * d'avant look.breed ; jamais « mix », celle d'un lapereau de parents de races différentes), et seulement à défaut la
 * race devinée par la robe.
 */
export function rabbitLookWithBreed(look = {}, breedOfAnimal = null) {
  if (look.breed && RABBIT_BUILDS[look.breed]) return look;
  const own = breedOfAnimal && breedOfAnimal !== 'mix' && RABBIT_BUILDS[breedOfAnimal] ? breedOfAnimal : null;
  return { ...look, breed: own ?? rabbitBreedGuess(look)?.id ?? 'rex' };
}

/**
 * Gabarit d'un lapin : { model: 'up' (Dakota) | 'lop' (FourthGreen), ...ONE, key }. look : son apparence (avec
 * look.breed, voir rabbitLookWithBreed ; look.earType 'lop' choisit le bélier, même pour un lapereau croisé) ; stage :
 * 'baby' (lapereau : grosse tête, pattes et oreilles courtes, corps ramassé, poil encore court), 'young' ou 'adult'.
 */
export function rabbitBuild(look = {}, stage = 'adult') {
  const lop = look.earType === 'lop' || (look.breed === 'belier' && look.earType !== 'rabbit');
  const id = look.breed && RABBIT_BUILDS[look.breed] ? look.breed : 'rex';
  // (lapereau croisé : un bélier né d'un parent aux oreilles dressées garde son look ; ses proportions sont celles du
  // bélier sur le modèle du bélier, ou celles de sa race sur le modèle aux oreilles dressées)
  const builds = lop && id !== 'belier' ? { ...RABBIT_BUILDS[id], earLen: 1, earW: 1, earOut: 0 } : !lop && id === 'belier' ? {} : RABBIT_BUILDS[id];
  const B = { ...ONE, model: lop ? 'lop' : 'up', ...builds };
  // Poil plus long ou plus court que la race (look.fluff : lapereau d'un angora et d'un rex…).
  const fluff = look.fluff ?? breedById(id)?.fluff ?? 1;
  const own = breedById(id)?.fluff ?? 1;
  if (Math.abs(fluff - own) > 0.05 && !(B.cards > 0)) {
    const k = Math.max(0, fluff - 1) / 0.45;
    B.fur = Math.max(B.fur, 0.03 * k);
    if (k > 0.5) Object.assign(B, { cards: Math.min(1, k), cardLen: 0.05 * k });
  }
  B.kit = stage === 'baby';
  if (stage === 'baby') {
    const soft = (k, f) => { B[k] = 1 + (B[k] - 1) * f; };
    for (const k of ['legW', 'girth', 'headW', 'muzzleW', 'earW']) soft(k, 0.6);
    // (bornés : sur la grosse tête ronde et le museau court du nain, le lapereau avait une tête de masque, aux yeux
    // exorbités et à la bouche écrasée)
    B.head = Math.min(1.58, B.head * 1.28);
    B.legs *= 0.85;
    B.back *= 0.86;
    B.snout = Math.max(0.6, B.snout * 0.76);
    B.neck *= 0.85;
    B.eyes = Math.min(1.22, B.eyes * 1.1);
    B.earLen *= 0.72;
    B.fur *= 0.5;
    B.mane *= 0.4;
    B.skirt *= 0.3;
    B.cards *= 0.7;
    B.maneCards *= 0.5;
    B.cardLen *= 0.55;
    B.tassels *= 0.4;
  } else if (stage === 'young') {
    B.head *= 1.1;
    B.legs *= 0.95;
    B.earLen *= 0.9;
    B.fur *= 0.8;
    B.mane *= 0.75;
    B.cardLen *= 0.8;
  }
  const r = (x) => Math.round(x * 1000) / 1000;
  B.key = [B.model, ...Object.keys(ONE).map((k) => r(B[k])), B.kit ? 1 : 0].join('|');
  return B;
}
