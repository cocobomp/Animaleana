// Gabarit et robe des chevaux selon la race (logique pure, testée dans tests/horses.test.js).
// Le modèle 3D (src/game/models/horseModel.js) lit ces nombres : épaisseur du tronc, longueur et
// os des membres, encolure, tête, volume des crins, fanons, port de queue, reflet de la robe.

import { SPECIES, getBreed } from './species.js';

// Types de chevaux. Toutes les valeurs sont relatives au cheval de selle (warmblood = 1).
// girth : largeur et profondeur du tronc ; legs : longueur des membres ; bone : épaisseur des canons ;
// neck : longueur de l'encolure ; neckW : épaisseur de l'encolure ; crest : bombé du dessus de l'encolure ;
// head : taille de la tête ; croup : volume de l'arrière-main ; back : longueur du dos ;
// mane / tail : longueur des crins ; maneN : quantité de mèches.
export const HORSE_TYPES = {
  hotblood: { girth: 0.9, legs: 1.05, bone: 0.86, neck: 1.08, neckW: 0.88, crest: 0.85, head: 0.92, croup: 0.94, back: 0.98, mane: 0.8, tail: 1, maneN: 0.8 },
  warmblood: { girth: 1, legs: 1, bone: 1, neck: 1, neckW: 1, crest: 1, head: 1, croup: 1, back: 1, mane: 1, tail: 1, maneN: 1 },
  baroque: { girth: 1.05, legs: 0.97, bone: 1.04, neck: 0.98, neckW: 1.14, crest: 1.35, head: 1, croup: 1.08, back: 0.94, mane: 1.9, tail: 1.3, maneN: 1.4 },
  stock: { girth: 1.07, legs: 0.94, bone: 1.05, neck: 0.9, neckW: 1.06, crest: 1, head: 0.95, croup: 1.18, back: 0.93, mane: 0.85, tail: 1, maneN: 1 },
  cob: { girth: 1.13, legs: 0.9, bone: 1.2, neck: 0.9, neckW: 1.16, crest: 1.2, head: 1.04, croup: 1.1, back: 0.95, mane: 1.25, tail: 1.15, maneN: 1.3 },
  draft: { girth: 1.27, legs: 0.9, bone: 1.42, neck: 0.9, neckW: 1.32, crest: 1.4, head: 1.1, croup: 1.22, back: 1, mane: 1.1, tail: 1.1, maneN: 1.3 },
  pony: { girth: 1.09, legs: 0.88, bone: 1.1, neck: 0.9, neckW: 1.08, crest: 1.1, head: 1.07, croup: 1.06, back: 0.96, mane: 1.3, tail: 1.2, maneN: 1.3 },
  mini: { girth: 1.1, legs: 0.86, bone: 1.12, neck: 0.86, neckW: 1.1, crest: 1.1, head: 1.12, croup: 1.05, back: 0.95, mane: 1.5, tail: 1.25, maneN: 1.4 },
};

/** Race d'un cheval : celle de l'animal, sinon celle gardée dans la robe, sinon devinée d'après la robe. */
export function horseBreedOf(look = {}, breedId = null) {
  const sp = SPECIES.horse;
  const direct = getBreed('horse', breedId) ?? getBreed('horse', look.breed);
  if (direct) return direct;
  return sp.breeds.find((b) => b.colors.some((c) => c.coat === look.coat && c.secondary === look.secondary
    && (!look.colorName || c.name?.fr === look.colorName.fr))) ?? null;
}

/**
 * Gabarit complet d'un cheval. Sans race connue (poulain croisé), on part du cheval de selle et des
 * réglages gardés dans la robe (fluff = plus épais, legs = membres plus longs).
 */
export function horseBuild(breed, look = {}) {
  const base = HORSE_TYPES[breed?.type] ?? HORSE_TYPES.warmblood;
  const b = { ...base, ...(breed?.build ?? {}) };
  if (!breed) {
    const f = look.fluff ?? 1;
    b.girth *= f;
    b.bone *= 1 + (f - 1) * 1.5;
    b.legs *= look.legs ?? 1;
  }
  return {
    ...b,
    type: breed?.type ?? 'warmblood',
    profile: breed?.profile ?? 'straight', // 'dish' (tête concave : arabe, welsh), 'convex' (busquée : lusitanien, PRE), 'square' (carrée : camargue)
    maneStyle: breed?.maneStyle ?? 'normal', // 'brush' (Fjord), 'long', 'thick', 'short'
    feathers: breed?.feathers ?? 0, // fanons : 0 (aucun) à 1 (Irish Cob, Frison)
    tailSet: breed?.tailSet ?? 0, // 0 = queue portée bas, 1 = queue relevée (arabe)
    sheen: breed?.sheen ?? 0, // reflet métallique de la robe (Akhal-Teké)
  };
}

/**
 * Gabarit d'un poulain (premiers mois) à partir de celui de sa race : membres longs, corps court et
 * étroit, grosse tête, encolure courte et fine, crinière courte en brosse, petite queue touffue.
 */
export function foalBuild(b) {
  return {
    ...b,
    foal: 1,
    legs: b.legs * 1.2,
    girth: b.girth * 0.84,
    back: b.back * 0.85,
    head: b.head * 1.16,
    neck: b.neck * 0.84,
    neckW: b.neckW * 0.86,
    crest: Math.min(b.crest, 1) * 0.7,
    croup: b.croup * 0.93,
    bone: b.bone * 0.94,
    mane: 1,
    maneN: Math.max(0.9, b.maneN * 0.9),
    maneStyle: 'foal',
    tail: 0.42,
    feathers: b.feathers * 0.4,
  };
}

const lum = (c) => ((c >> 16 & 255) * 0.2126 + (c >> 8 & 255) * 0.7152 + (c & 255) * 0.0722) / 255;

/**
 * Lecture de la robe (couleurs + motif) en caractéristiques simples, pour le shader du pelage.
 * Les robes récentes le disent elles-mêmes (dun, points, dapple…) ; pour les anciennes sauvegardes,
 * on devine d'après les couleurs et le nom de la robe.
 */
export function horseCoatTraits(look = {}) {
  const name = look.colorName?.fr ?? '';
  const pattern = look.pattern ?? 'solid';
  const coatL = lum(look.coat ?? 0x7a4528);
  const secL = lum(look.secondary ?? look.coat ?? 0x7a4528);
  const maneL = lum(look.mane ?? 0x1b1410);
  const named = (re) => re.test(name);
  const grey = look.grey ?? (pattern !== 'spots' && coatL > 0.42 && Math.abs(coatL - secL) < 0.2 && !named(/Palomino|Isabelle|Alezan|Rouan|Souris|Crème|Dor/));
  const dun = look.dun ?? named(/^Isabelle$|Souris/);
  const roan = look.roan ?? named(/Rouan/);
  // Bai : corps brun-roux et crins noirs → bas des membres noirs aussi.
  const points = look.points ?? (maneL < 0.12 && coatL > 0.07 && coatL < 0.5 && pattern !== 'spots' && !grey);
  const spots = pattern === 'spots';
  const blanket = spots && coatL < secL; // couverture blanche sur la croupe (appaloosa « couverture »)
  return {
    grey: grey ? (look.dapple ?? true ? 1 : 0.4) : 0,
    dun: dun ? 1 : 0,
    roan: roan ? 1 : 0,
    points: points || dun ? 1 : 0,
    pinto: pattern === 'patches' ? 1 : 0,
    leopard: spots && !blanket ? 1 : 0,
    blanket: blanket ? 1 : 0,
    socks: pattern === 'socks',
    mealy: look.mealy ?? 0,
    flea: look.flea ? 1 : 0, // gris truité : petites mouchetures brun-roux sur la robe blanche
  };
}

/** Marque en tête (0 aucune, 1 étoile, 2 liste fine, 3 large liste, 4 ladre au bout du nez) d'après la graine. */
export function horseFaceMark(look = {}, breed = null) {
  const pattern = look.pattern ?? 'solid';
  if (breed?.face) return { none: 0, star: 1, stripe: 2, blaze: 3, snip: 4 }[breed.face] ?? 0;
  const seed = look.seed ?? 0;
  if (pattern === 'patches') return 3; // les pies ont souvent une grande liste
  if (pattern === 'spots') return 0;
  if (pattern === 'socks') return [3, 2, 1, 4, 1, 0][seed % 6];
  return seed % 4 === 0 && lum(look.coat ?? 0) < 0.5 ? 1 : 0;
}

/** Hauteur des balzanes (0 = pas de balzane) pour les quatre membres, de 0 à 1 (1 = jusqu'au genou). */
export function horseSocks(look = {}) {
  if ((look.pattern ?? 'solid') !== 'socks') return [0, 0, 0, 0];
  const seed = look.seed ?? 0;
  const n = seed % 5; // nombre de membres balzanés
  return [0, 1, 2, 3].map((i) => (i < n ? 0.16 + ((seed >> (2 + i)) % 4) * 0.08 : 0));
}
