// Gabarit des chats réalistes (src/game/models/catReal.js) : quel modèle 3D prend chaque chat et ses proportions.
//
// Deux modèles d'artistes servent aux 15 races (src/sim/catBreeds.js) : le chat de Claire (claireanne3d, CC-BY 4.0)
// pour les adultes et les jeunes, le chaton de FainoDS (doinspire, CC-BY 4.0) pour les bébés. Chaque race est obtenue
// en déformant le modèle par ses os (pattes, dos, tronc, encolure, tête, museau, oreilles, queue) et en poussant la
// peau pour le poil (poil long, collerette, culottes, panache de la queue) ; le shader de la robe fait le reste (poil
// ras, frisé, peau nue et plissée). Valeurs relatives au modèle d'origine (1 : comme lui ; le chat de Claire est un
// européen fin à poil ras). Rien ici ne dépend de three.js (tests en node).

import { SPECIES } from './species.js';
import { catTraits } from './catBreeds.js';

/**
 * Champs (absents = valeur de ONE) :
 * legs, legW : longueur et épaisseur des pattes ; back : longueur du dos ; girth : largeur du tronc ; belly : ventre
 * plus bas (sphynx) ; head, headW : taille et largeur du crâne ; snout, muzzleW : longueur et largeur du museau ;
 * flat : face plate (persan : le nez rentre entre les yeux, le front se bombe) ; neck : encolure ;
 * ears : 'up' (dressées) ou 'fold' (pliées vers l'avant : scottish) ; earSize, earW : taille et largeur des
 * oreilles ; earOut : oreilles plantées plus écartées (rad) ; earRound : bout arrondi ; tufts : pinceaux du lynx
 * (maine coon, norvégien) ; furnish : poils clairs dans l'oreille ;
 * tailLen, tailThick : queue ; stub : queue courte en pompon (bobtail) ;
 * fur : poil long (m, chat de taille 1, poussé le long de la peau) ; ruff : collerette (cou, poitrail, joues) ;
 * breeches : culottes (arrière des cuisses) ; tailFur : panache de la queue ; shells : couches de poil (rendu du
 * poil long en haute qualité, 0 : aucune) ; curly : poil frisé (devon rex) ; hairless : peau nue (sphynx) ;
 * wrinkles : plis de la peau ; plush : poil dense et court (british, chartreux : relief doux du shader).
 */
export const ONE = {
  legs: 1, legW: 1, back: 1, girth: 1, belly: 0, head: 1, headW: 1, snout: 1, muzzleW: 1, flat: 0, neck: 1,
  earSize: 1, earW: 1, earOut: 0, earRound: 0, tufts: 0, furnish: 0,
  tailLen: 1, tailThick: 1, stub: 0,
  fur: 0, ruff: 0, breeches: 0, tailFur: 0, shells: 0, curly: 0, hairless: 0, wrinkles: 0, plush: 0,
};

// Proportions par race (relatives au chat de Claire ; les chatons : au chaton de FainoDS, voir catBuild).
export const CAT_BUILDS = {
  europeen: {},
  // Ragdoll : grand et doux, poil mi-long (collerette, culottes, queue fournie), yeux bleus (robe).
  ragdoll: { legW: 1.1, back: 1.05, girth: 1.14, head: 1.05, headW: 1.06, snout: 0.88, earSize: 0.92, earRound: 0.4, fur: 0.011, ruff: 0.014, breeches: 0.7, tailFur: 1.2, shells: 3, furnish: 0.6 },
  // Maine coon : le géant (taille de la race : 1,32), museau carré, grandes oreilles à pinceaux, grosse collerette,
  // culottes et queue en panache.
  maine_coon: { legs: 1.05, legW: 1.18, back: 1.1, girth: 1.12, head: 1.06, headW: 1.02, snout: 1.1, muzzleW: 1.2, earSize: 1.28, earW: 1.12, tufts: 1, furnish: 1, tailLen: 1.1, fur: 0.012, ruff: 0.024, breeches: 1, tailFur: 1.7, shells: 4 },
  // Persan : face plate, tête ronde et large, petites oreilles écartées, pattes courtes et fortes, poil très long.
  persan: { legs: 0.78, legW: 1.16, back: 0.92, girth: 1.2, head: 1.16, headW: 1.14, snout: 0.58, muzzleW: 1.1, flat: 0.7, neck: 0.72, earSize: 0.58, earOut: 0.35, earRound: 0.8, tailLen: 0.85, fur: 0.021, ruff: 0.022, breeches: 1, tailFur: 1.5, shells: 5, furnish: 0.8 },
  // Siamois : fin et long, tête en triangle, très grandes oreilles, queue fine.
  siamois: { legs: 1.12, legW: 0.84, back: 1.08, girth: 0.82, head: 0.92, headW: 0.84, snout: 1.3, muzzleW: 0.86, neck: 1.12, earSize: 1.42, earW: 1.15, earOut: 0.18, tailLen: 1.1, tailThick: 0.72, fur: -0.003 },
  // Sacré de Birmanie : mi-long, tête ronde, corps solide (gants blancs et points : robe).
  sacre_birmanie: { legW: 1.06, back: 1.02, girth: 1.08, head: 1.06, headW: 1.06, snout: 0.86, earSize: 0.95, earRound: 0.3, fur: 0.01, ruff: 0.013, breeches: 0.5, tailFur: 1.2, shells: 3, furnish: 0.5 },
  // Bengal : musclé, petites oreilles (rosettes : robe).
  bengal: { legs: 1.05, legW: 1.08, back: 1.06, head: 0.95, snout: 1.05, muzzleW: 1.05, earSize: 0.84, earRound: 0.3, tailThick: 1.05, fur: -0.002 },
  // British : tout rond et trapu, grosses joues, museau court et large, petites oreilles écartées, pattes courtes et
  // fortes, poil dense en peluche.
  british: { legs: 0.84, legW: 1.22, back: 0.92, girth: 1.28, head: 1.24, headW: 1.38, snout: 0.5, muzzleW: 1.38, neck: 0.78, earSize: 0.66, earOut: 0.34, earRound: 0.65, tailLen: 0.82, tailThick: 1.3, fur: 0.006, plush: 1 },
  // Chartreux : solide mais plus haut et allongé que le british, museau fin et plus long (son « sourire »), oreilles
  // moyennes, poil laineux (gris bleu argenté et yeux cuivre : robe).
  chartreux: { legs: 1.04, legW: 1.08, back: 1.08, girth: 1.08, head: 1.02, headW: 1.0, snout: 1.06, muzzleW: 0.9, neck: 1.0, earSize: 1.02, earRound: 0.2, tailThick: 1.1, fur: 0.004, plush: 0.55 },
  // Sphynx : nu et plissé, ventre bas, très grandes oreilles larges, queue fine.
  sphynx: { legs: 1.02, legW: 0.92, girth: 0.97, belly: 1, head: 1.0, headW: 1.04, snout: 0.95, earSize: 1.6, earW: 1.32, earOut: 0.3, tailThick: 0.6, fur: -0.006, hairless: 1, wrinkles: 1 },
  // Norvégien : grand chat des forêts au poil long, pinceaux, collerette et queue en panache.
  norvegien: { legs: 1.04, legW: 1.12, back: 1.06, girth: 1.1, head: 1.02, snout: 1.04, earSize: 1.16, tufts: 0.7, furnish: 1, fur: 0.016, ruff: 0.02, breeches: 1, tailFur: 1.6, shells: 4 },
  // Scottish fold : tête toute ronde, oreilles pliées vers l'avant, corps trapu.
  scottish_fold: { legs: 0.9, legW: 1.1, girth: 1.12, head: 1.15, headW: 1.16, snout: 0.66, muzzleW: 1.12, neck: 0.82, ears: 'fold', earSize: 0.86, tailThick: 1.15, fur: 0.005, plush: 0.6 },
  // Abyssin : fin, grandes oreilles (poil tiqueté : robe).
  abyssin: { legs: 1.1, legW: 0.88, back: 1.05, girth: 0.88, head: 0.95, headW: 0.94, snout: 1.12, neck: 1.08, earSize: 1.36, earW: 1.15, tailLen: 1.05, fur: -0.002 },
  // Devon rex : lutin aux immenses oreilles basses et écartées, joues saillantes, poil frisé.
  devon_rex: { legs: 1.06, legW: 0.88, back: 0.98, girth: 0.92, head: 1.02, headW: 1.08, snout: 0.7, neck: 1.05, earSize: 1.75, earW: 1.45, earOut: 0.45, earRound: 0.5, tailThick: 0.75, fur: -0.002, curly: 1 },
  // Bobtail japonais : fin, grandes oreilles, queue courte en pompon.
  bobtail: { legs: 1.04, legW: 0.92, girth: 0.92, head: 0.98, snout: 1.1, earSize: 1.25, earW: 1.05, tailLen: 0.24, stub: 1 },
};

/**
 * Race d'un chat d'après sa robe (anciennes sauvegardes sans look.breed ni a.breed) : comme catModel.js, la race dont
 * une robe correspond, et parmi elles celle dont le poil, le volume et le museau ressemblent le plus.
 */
export function catBreedGuess(look = {}) {
  let best = null;
  let bestScore = Infinity;
  for (const b of SPECIES.cat.breeds) {
    if (!b.colors.some((c) => c.coat === look.coat && c.secondary === look.secondary
      && (!look.colorName || c.name?.fr === look.colorName.fr))) continue;
    const score = (look.hair && b.look?.hair !== look.hair ? 1 : 0)
      + Math.abs((b.fluff ?? 1) - (look.fluff ?? 1)) + Math.abs((b.snout ?? 0.35) - (look.snout ?? 0.35));
    if (score < bestScore) {
      best = b;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Apparence d'un chat avec sa race (look.breed) : celle du look, sinon la race de l'animal (anciennes sauvegardes
 * d'avant look.breed : a.breed), et seulement à défaut la race devinée par la robe.
 */
export function catLookWithBreed(look = {}, breedOfAnimal = null) {
  if (look.breed) return look;
  return { ...look, breed: breedOfAnimal ?? catBreedGuess(look)?.id ?? null };
}

const breedById = (id) => SPECIES.cat.breeds.find((b) => b.id === id) ?? null;

/**
 * Gabarit d'un chat : { model: 'adult' | 'kitten', ears: 'up' | 'fold', ...ONE, key }. look : son apparence (avec
 * look.breed, voir catLookWithBreed) ; stage : 'baby' (chaton : modèle du chaton), 'young' (jeune : tête un peu plus
 * grosse, pattes plus courtes) ou 'adult'.
 */
export function catBuild(look = {}, stage = 'adult') {
  const kitten = stage === 'baby';
  const id = look.breed && CAT_BUILDS[look.breed] ? look.breed : null;
  const breed = id ? breedById(id) : null;
  const tr = catTraits(look, breed);
  const B = { ...ONE, model: kitten ? 'kitten' : 'adult', ears: 'up', ...(id ? CAT_BUILDS[id] : {}) };
  if (!id) {
    // Race sans gabarit : d'après les traits du look (poil, oreilles, queue).
    if (tr.hair === 'long') Object.assign(B, { fur: 0.016, ruff: 0.018, breeches: 0.8, tailFur: 1.4, shells: 4 });
    else if (tr.hair === 'semi') Object.assign(B, { fur: 0.01, ruff: 0.012, breeches: 0.5, tailFur: 1.1, shells: 3 });
    else if (tr.hair === 'plush') Object.assign(B, { fur: 0.005, plush: 1 });
    else if (tr.hair === 'curly') B.curly = 1;
    else if (tr.hair === 'hairless') Object.assign(B, { hairless: 1, wrinkles: 1, fur: -0.006 });
    if (tr.earType === 'cat_fold') B.ears = 'fold';
    if (tr.earType === 'cat_big') B.earSize = 1.35;
    if (tr.earType === 'cat_small') B.earSize = 0.7;
    if (tr.earType === 'cat_lynx') Object.assign(B, { earSize: 1.2, tufts: 1 });
  }
  if (tr.stubTail && !B.stub) Object.assign(B, { stub: 1, tailLen: 0.24 });
  B.kitten = kitten;
  if (kitten) {
    // Le chaton de FainoDS a déjà la grosse tête et les pattes courtes d'un bébé : les races y sont plus douces
    // (poil encore court, face moins plate, oreilles déjà pliées chez le scottish).
    const soft = (k, f) => { B[k] = 1 + (B[k] - 1) * f; };
    for (const k of ['legs', 'legW', 'back', 'girth', 'head', 'headW', 'snout', 'muzzleW', 'neck', 'tailThick']) soft(k, 0.6);
    soft('earSize', 0.7);
    soft('earW', 0.7);
    // (face à peine plate : le chaton persan gardait des yeux en fentes enfoncées sous un front bombé)
    B.flat *= 0.15;
    B.belly *= 0.5;
    B.fur *= 0.65;
    B.ruff *= 0.45;
    B.breeches *= 0.4;
    B.tailFur *= 0.6;
    B.tufts *= 0.4;
    B.shells = Math.min(B.shells, 3);
    B.wrinkles *= 0.6;
    if (B.stub) B.tailLen = 0.3;
  } else if (stage === 'young') {
    B.head *= 1.08;
    B.legs *= 0.96;
    B.earSize *= 1.06;
    B.fur *= 0.8;
    B.ruff *= 0.7;
    B.tailFur *= 0.8;
  }
  const r = (x) => Math.round(x * 1000) / 1000;
  B.key = [B.model, ...Object.keys(ONE).map((k) => r(B[k])), B.ears, kitten ? 1 : 0].join('|');
  return B;
}
