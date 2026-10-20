// Gabarit des chiens réalistes (src/game/models/dogReal.js) : quel modèle 3D prend chaque race et ses proportions.
//
// Deux modèles d'artistes servent à toutes les races : le shiba inu (quander, CC-BY 4.0) pour les chiens moyens et
// grands, le jack russell (FainoDS, CC-BY 4.0) pour les petits. Chaque race est obtenue en déformant le modèle par
// ses os (longueur des membres, du dos, de l'encolure, du museau, taille de la tête, oreilles, queue, poil) ; les
// valeurs sont relatives au modèle d'origine (1 : comme lui). Rien ici ne dépend de three.js (tests en node).

import { getBreed } from './species.js';

/** En dessous de cette taille de race (look.scale : 1 = labrador), le chien prend le modèle du jack russell. */
export const SMALL_DOG = 0.65;

/**
 * Oreilles : 'pointed' (droites), 'bat' (droites, grandes, écartées : chihuahua, bouledogue), 'semi' (droites, bout
 * replié : border collie), 'button' (repliées vers l'avant : jack russell), 'rose' (repliées vers l'arrière :
 * lévriers, carlin), 'floppy' (tombantes : labrador), 'long' (longues et tombantes : beagle, cocker, teckel).
 * Queue : 'curl' (enroulée sur le dos), 'sickle' (relevée en faucille), 'sabre' (pendante, bout relevé), 'otter'
 * (épaisse, portée bas : labrador), 'plume' (panache frangé, porté bas), 'whip' (fine et longue : lévriers),
 * 'carrot' (dressée, courte : terriers), 'stub' (écourtée).
 * fur : longueur du poil (m, chien de taille 1) ajoutée en épaississant la silhouette ; ruff : collerette (cou,
 * poitrail) ; feather : franges (arrière des membres, ventre, oreilles, queue) ; curly : poil frisé (caniche).
 */
const NATIVE = {
  shiba: { ears: 'pointed', tail: 'curl' },
  jack: { ears: 'button', tail: 'carrot' },
};

// Proportions par race (absentes = 1). Petits chiens : relatives au jack russell ; les autres : au shiba.
export const DOG_BUILDS = {
  // ---- petits (jack russell)
  chihuahua: { legs: 0.92, back: 0.9, girth: 0.95, head: 1.45, snout: 0.5, muzzleW: 0.9, neck: 0.85, ears: 'bat', earSize: 1.55, tail: 'sickle', tailLen: 0.9 },
  // (spitz : poil épais et collerette — dans le repère d'un chien de 57 cm, 5 cm de poil font les 2 cm du loulou —,
  // pattes courtes sous la fourrure, petites oreilles droites)
  spitz_nain: { legs: 0.75, back: 0.8, girth: 1.05, head: 1.1, snout: 0.55, ears: 'pointed', earSize: 0.7, tail: 'flat', fur: 0.052, ruff: 1.25, feather: 0.4, tailLen: 0.9, tailThick: 1.3, tailFur: 1.5, fluffy: 1 },
  // (yorkshire : robe soyeuse qui tombe en jupe, barbe et toupet, corps fin, petite queue)
  yorkshire: { legs: 0.85, back: 0.9, girth: 0.86, head: 1.05, snout: 0.75, ears: 'pointed', earSize: 0.85, tail: 'carrot', tailLen: 0.6, tailThick: 0.5, tailFur: 0.1, fur: 0.03, feather: 1.2, silky: 1, beard: 0.5, topknot: 1 },
  carlin: { legs: 0.72, legW: 1.15, back: 0.8, girth: 1.36, head: 1.3, snout: 0.28, muzzleW: 1.3, neck: 0.8, ears: 'button', earSize: 0.6, tail: 'screw', tailLen: 0.85, tailThick: 1.2, wrinkle: 1 },
  jack_russell: { tail: 'carrot', tailLen: 0.85 },
  corgi: { legs: 0.55, legW: 1.15, back: 1.25, girth: 1.18, head: 1.08, snout: 0.95, ears: 'pointed', earSize: 1.35, tail: 'stub', fur: 0.007 },
  cavalier: { legs: 0.9, back: 0.95, girth: 1.05, head: 1.05, snout: 0.62, ears: 'long', earSize: 1.45, tail: 'plume', fur: 0.011, feather: 1 },
  teckel: { legs: 0.5, legW: 1.12, back: 1.45, girth: 1.05, head: 1.0, snout: 1.25, ears: 'long', earSize: 1.3, tail: 'sabre', tailLen: 1.15 },
  bouledogue: { legs: 0.7, legW: 1.25, back: 0.85, girth: 1.42, head: 1.35, snout: 0.33, muzzleW: 1.35, neck: 0.8, ears: 'bat', earSize: 1.45, tail: 'stub', pear: 0.85, tailLen: 0.16 },
  cocker: { legs: 0.92, back: 0.92, girth: 1.08, head: 1.08, snout: 0.95, ears: 'long', earSize: 1.6, tail: 'level', fur: 0.014, feather: 1, tailLen: 0.42 },
  // ---- moyens et grands (shiba) ; fur < 0 : le double poil du shiba est raccourci (races à poil ras)
  labrador: { legs: 0.97, legW: 1.08, back: 1.08, girth: 1.16, headW: 0.88, head: 1.08, snout: 1.15, muzzleW: 1.15, neck: 0.95, ears: 'floppy', earSize: 1.1, tail: 'otter', tailThick: 0.95, fur: -0.012, earLen: 1.0, cheek: 1, mouth: 1, flews: 0.7, skullFlat: 0.6, stop: 0.7, square: 0.6, eyeOpen: 0.7, neckSlim: 1 },
  berger_allemand: { legs: 1.02, back: 1.12, girth: 1.0, headW: 0.86, head: 1.05, snout: 1.38, ears: 'pointed', earSize: 1.25, tail: 'sabre', tailLen: 1.15, fur: 0.004, slope: 1, cheek: 0.6, mouth: 0.6, eyeOpen: 0.3 },
  golden: { legs: 0.98, legW: 1.06, back: 1.06, girth: 1.1, headW: 0.86, head: 1.05, snout: 1.15, muzzleW: 1.08, ears: 'floppy', earSize: 1.1, tail: 'plume', tailThick: 0.6, fur: 0.012, feather: 1, ruff: 0.4, earLen: 1.05, cheek: 0.9, mouth: 1, flews: 0.5, skullFlat: 0.5, stop: 0.6, square: 0.4, eyeOpen: 0.7 },
  beagle: { legs: 0.88, legW: 1.06, back: 1.0, girth: 1.08, head: 1.1, snout: 1.1, ears: 'long', earSize: 1.3, tail: 'sickle', tailLen: 0.9, tailThick: 0.55, fur: -0.012, earLen: 0.85, cheek: 1, mouth: 1, flews: 0.5, stop: 0.6, square: 0.5, eyeOpen: 0.8, neckSlim: 1 },
  border_collie: { legs: 1.0, back: 1.05, girth: 0.98, headW: 0.86, head: 0.98, snout: 1.12, ears: 'semi', tail: 'sabre', tailLen: 1.1, fur: 0.01, feather: 0.8, ruff: 0.6, cheek: 0.6, mouth: 0.6, eyeOpen: 0.3 },
  dalmatien: { legs: 1.05, back: 1.05, girth: 0.98, headW: 0.86, head: 1.0, snout: 1.25, ears: 'floppy', tail: 'sabre', tailLen: 1.1, tailThick: 0.5, fur: -0.016, earLen: 0.9, earW: 0.9, cheek: 1, mouth: 1, flews: 0.4, stop: 0.5, square: 0.3, eyeOpen: 0.5, neckSlim: 1 },
  bouvier_bernois: { legs: 0.98, legW: 1.12, back: 1.08, girth: 1.2, headW: 0.95, head: 1.12, snout: 0.95, muzzleW: 1.12, ears: 'floppy', tail: 'plume', fur: 0.016, feather: 1, ruff: 0.8, earLen: 0.9, earW: 1.1, cheek: 0.5, mouth: 1, flews: 0.5, stop: 0.7, square: 0.5, eyeOpen: 0.6, tailThick: 0.7 },
  saint_bernard: { legs: 0.98, legW: 1.18, back: 1.1, girth: 1.28, head: 1.3, snout: 0.85, muzzleW: 1.35, neck: 0.95, ears: 'floppy', earSize: 1.1, tail: 'plume', fur: 0.012, ruff: 0.5, earLen: 0.9, earW: 1.15, cheek: 0.5, mouth: 1, flews: 1, jowl: 1, skullFlat: 0.7, stop: 1, square: 1, eyeOpen: 0.4, tailThick: 0.75 },
  epagneul_breton: { legs: 1.0, back: 0.95, girth: 1.0, headW: 0.88, head: 1.0, snout: 1.12, ears: 'floppy', earSize: 0.95, tail: 'stub', fur: 0.004, feather: 0.6, earLen: 0.8, cheek: 1, mouth: 1, flews: 0.3, stop: 0.5, eyeOpen: 0.6 },
  husky: { legs: 1.0, back: 1.02, girth: 1.02, head: 1.0, snout: 1.1, ears: 'pointed', earSize: 1.05, tail: 'sickle', tailThick: 1.15, fur: 0.008, ruff: 0.5 },
  berger_islandais: { legs: 0.98, back: 0.98, girth: 1.02, head: 1.0, snout: 1.08, ears: 'pointed', tail: 'curl', fur: 0.022, ruff: 1.0, headW: 0.92, feather: 0.7 },
  shiba: {},
  akita: { legs: 1.0, legW: 1.18, back: 1.05, girth: 1.2, head: 1.22, snout: 0.85, muzzleW: 1.28, ears: 'pointed', earSize: 0.72, tail: 'curl', tailThick: 1.4, fur: 0.012, headW: 1.12, neck: 0.9, earTilt: 0.45, tailFur: 1.3, ruff: 0.8 },
  galgo: { legs: 1.28, legW: 0.82, back: 1.08, girth: 0.78, headW: 0.66, head: 0.92, snout: 1.65, muzzleW: 0.74, neck: 1.2, ears: 'rose', earSize: 0.9, tail: 'whip', tailLen: 1.25, tailThick: 0.35, fur: -0.02, tuck: 1, cheek: 1, mouth: 1, eyeOpen: 0.3, chest: 1, stop: 0, earLen: 1.0, neckSlim: 0.5 },
  coonhound: { legs: 1.02, back: 1.05, girth: 1.04, headW: 0.84, head: 1.05, snout: 1.35, ears: 'long', earSize: 1.5, tail: 'sickle', tailThick: 0.55, fur: -0.014, earLen: 1.4, cheek: 1, mouth: 1, flews: 0.9, jowl: 0.3, skullFlat: 0.4, stop: 0.5, square: 0.6, eyeOpen: 0.5, neckSlim: 1 },
  dogo: { legs: 1.0, legW: 1.12, back: 1.0, girth: 1.16, headW: 0.95, head: 1.18, snout: 1.05, muzzleW: 1.3, neck: 1.05, ears: 'floppy', earSize: 0.85, tail: 'sabre', tailThick: 0.5, fur: -0.016, earLen: 0.7, earSet: 0.01, cheek: 0.9, mouth: 1, flews: 0.6, skullFlat: 0.8, stop: 0.5, square: 0.8, eyeOpen: 0.4, neckSlim: 1 },
  kelpie: { legs: 1.0, back: 1.0, girth: 0.98, headW: 0.86, head: 0.98, snout: 1.22, ears: 'pointed', earSize: 1.1, tail: 'sabre', tailThick: 0.85, fur: -0.006, cheek: 0.6, mouth: 0.6, eyeOpen: 0.3, neckSlim: 0.6 },
  berger_australien: { legs: 0.98, back: 1.0, girth: 1.02, headW: 0.9, head: 1.0, snout: 1.1, ears: 'semi', tail: 'stub', fur: 0.012, feather: 0.8, ruff: 0.6, cheek: 0.6, mouth: 0.6, eyeOpen: 0.3 },
  // (caniche : silhouette carrée — pattes longues, dos court, cou haut —, tête longue et fine, longues oreilles frisées,
  // queue portée haut et droite ; coupe « caniche » par défaut : pompons, toupet)
  caniche: { legs: 1.15, legW: 0.9, back: 0.86, girth: 0.92, headW: 0.78, head: 0.95, snout: 1.45, muzzleW: 0.85, neck: 1.25, ears: 'long', earSize: 1.1, tail: 'carrot', tailLen: 0.5, tailThick: 0.7, fur: 0.018, curly: 1, earLen: 1.1, cheek: 1, mouth: 1, stop: 0.2, eyeOpen: 0.4, pompons: 1 },
  boxer: { legs: 1.02, back: 0.95, girth: 1.08, headW: 0.95, head: 1.1, snout: 0.45, muzzleW: 1.25, ears: 'drop', tail: 'stub', tailThick: 0.5, fur: -0.016, cheek: 0.8, mouth: 1, flews: 0.8, stop: 1, square: 1, eyeOpen: 0.5, underbite: 1, earLen: 1.0, neckSlim: 1 },
  rottweiler: { legs: 0.98, legW: 1.15, back: 1.0, girth: 1.22, headW: 0.95, head: 1.18, snout: 0.95, muzzleW: 1.25, ears: 'floppy', earSize: 0.85, tail: 'sabre', tailThick: 0.55, fur: -0.012, earLen: 0.65, earSet: 0.012, cheek: 0.8, mouth: 1, flews: 0.5, skullFlat: 0.6, stop: 0.8, square: 0.7, eyeOpen: 0.3, neckSlim: 0.8 },
  malinois: { legs: 1.02, back: 1.0, girth: 0.95, headW: 0.84, head: 0.98, snout: 1.38, ears: 'pointed', earSize: 1.15, tail: 'sabre', tailThick: 0.75, fur: -0.008, cheek: 0.6, mouth: 0.6, eyeOpen: 0.3, neckSlim: 0.6 },
  samoyede: { legs: 1.0, back: 1.0, girth: 1.05, head: 1.0, snout: 1.0, ears: 'pointed', earSize: 0.9, tail: 'curl', fur: 0.028, ruff: 1, feather: 0.6 },
  whippet: { legs: 1.22, legW: 0.82, back: 1.02, girth: 0.82, headW: 0.68, head: 0.92, snout: 1.55, muzzleW: 0.76, neck: 1.15, ears: 'rose', earSize: 0.9, tail: 'whip', tailLen: 1.15, tailThick: 0.35, fur: -0.02, tuck: 1, cheek: 1, mouth: 1, eyeOpen: 0.3, chest: 1, stop: 0, neckSlim: 0.5 },
  setter: { legs: 1.05, back: 1.05, girth: 0.95, headW: 0.8, head: 1.0, snout: 1.42, muzzleW: 0.9, neck: 1.08, ears: 'long', earSize: 1.15, tail: 'flag', tailLen: 1.1, tailThick: 0.45, fur: 0.012, feather: 1, earLen: 1.15, cheek: 1, mouth: 1, flews: 0.4, skullFlat: 0.3, stop: 0.6, square: 0.3, eyeOpen: 0.6 },
  // (terre-neuve : grosse tête mais museau entier et large — raccourci, il lui faisait une face de bouledogue)
  terre_neuve: { legs: 0.95, legW: 1.25, back: 1.08, girth: 1.34, head: 1.15, snout: 1.0, muzzleW: 1.15, neck: 0.95, ears: 'floppy', earSize: 0.95, tail: 'plume', fur: 0.025, ruff: 0.8, feather: 1, earLen: 0.8, cheek: 0.4, mouth: 1, flews: 0.7, skullFlat: 0.7, stop: 0.6, square: 0.8, eyeOpen: 0.5, tailThick: 0.7 },
  labradoodle: { legs: 1.0, back: 1.0, girth: 1.04, headW: 0.9, head: 1.0, snout: 1.0, ears: 'long', earSize: 1.15, tail: 'plume', fur: 0.022, curly: 1, earLen: 1.0, cheek: 0.6, mouth: 1, flews: 0.2, eyeOpen: 0.8, beard: 1 },
  berger_blanc: { legs: 1.02, back: 1.1, girth: 1.0, headW: 0.86, head: 1.02, snout: 1.35, ears: 'pointed', earSize: 1.2, tail: 'sabre', tailLen: 1.1, fur: 0.008, cheek: 0.6, mouth: 0.6, eyeOpen: 0.3 },
};

const ONE = {
  legs: 1, legW: 1, back: 1, girth: 1, head: 1, snout: 1, muzzleW: 1, neck: 1,
  earSize: 1, headW: 1, tailLen: 1, tailThick: 1, tailFur: 1, fur: 0, ruff: 0, feather: 0, curly: 0, silky: 0, slope: 0, tuck: 0,
  // oreilles modelées (dogParts.js) : longueur, largeur, attache plus haute (m, tête de taille 1)
  earLen: 1, earW: 1, earSet: 0,
  // visage (modèle du shiba, dogParts.js faceShape) : joues amincies, bouche neutre, babines, bajoues, crâne plat,
  // stop, museau carré, paupières ouvertes (0 → 1)
  cheek: 0, mouth: 0, flews: 0, jowl: 0, skullFlat: 0, stop: 0, square: 0, eyeOpen: 0,
  // queue effilée vers la pointe (0 : rayon constant ; -1 : selon le port, voir TAPER)
  tailTaper: -1,
  // pompons modelés (caniche : toupet, bracelets, bout de la queue ; montrés avec la coupe « caniche »)
  pompons: 0,
  // barbe et sourcils touffus (fur > 0)
  beard: 0,
  // tronc en poire (poitrine large, croupe légère), oreilles droites inclinées vers l'avant (rad), menton avancé,
  // relief de poil touffu (spitz), rides du front (carlin)
  pear: 0, earTilt: 0, underbite: 0, fluffy: 0, wrinkle: 0,
  // poitrine profonde (lévriers) ; pieds plus gros (chiots) ; encolure et poitrail lisses, sans collerette (poil ras)
  chest: 0, paws: 1, neckSlim: 0,
  // toupet (yorkshire : taille de la boule sur le crâne)
  topknot: 0,
};

/** Effilement de la queue selon son port (rayon perdu à la pointe) : le panache et la loutre s'affinent au bout. */
const TAPER = { plume: 0.55, otter: 0.6, sabre: 0.4, whip: 0.4, sickle: 0.3, carrot: 0.3, curl: 0, stub: 0.15, level: 0.5, flag: 0.6, flat: 0.3, screw: 0.2 };

/** Modèle 3D d'un chien : 'jack' pour les petits, 'shiba' pour les autres (d'après la taille de sa race). */
export function dogModelOf(look) {
  const breedScale = getBreed('dog', look?.breed)?.scale ?? look?.scale ?? 1;
  return breedScale <= SMALL_DOG + 1e-6 ? 'jack' : 'shiba';
}

/** Les oreilles et la queue traduites des types du modèle procédural (species.js) pour une race sans gabarit. */
const EAR_OF = { pointed: 'pointed', floppy: 'floppy', semi: 'semi', bat: 'bat' };
const TAIL_OF = { dog: 'sabre', curl: 'curl', stub: 'stub' };

/**
 * Gabarit d'un chien. look : sa robe et ses proportions (species.js : scale, legs, snout, fluff, earType,
 * tailType, breed) ; puppy : chiot (tête plus grosse, pattes et museau courts, oreilles pas encore dressées).
 * Renvoie { model, legs, legW, back, girth, head, snout, muzzleW, neck, ears, earSize, tail, tailLen, tailThick, tailFur,
 * fur, ruff, feather, curly, silky, slope, tuck, puppy, key } (key : identifie la géométrie, partagée par race).
 */
export function dogBuild(look = {}, puppy = false) {
  const model = dogModelOf(look);
  const breed = look.breed && DOG_BUILDS[look.breed] ? look.breed : null;
  const B = { ...ONE, model, ears: NATIVE[model].ears, tail: NATIVE[model].tail, ...(breed ? DOG_BUILDS[breed] : {}) };
  if (!breed) {
    // Race sans gabarit (croisé) : proportions du modèle procédural.
    B.legs = look.legs ?? 1;
    B.snout = look.snout ?? 1;
    B.fur = Math.max(0, ((look.fluff ?? 1) - 1) * 0.12);
    B.ears = EAR_OF[look.earType] ?? B.ears;
    B.tail = TAIL_OF[look.tailType] ?? B.tail;
  }
  // Queue écourtée : courte, sauf longueur donnée par la race.
  if (B.tail === 'stub' && !(breed && DOG_BUILDS[breed].tailLen)) B.tailLen = 0.28;
  if (B.tailTaper < 0) B.tailTaper = TAPER[B.tail] ?? 0;
  B.puppy = !!puppy;
  if (puppy) {
    // (bouille de chiot : grosse tête, museau court et rond, yeux ronds grands ouverts, bouche neutre, pattes courtes
    // aux gros pieds, ventre rond — pas un adulte en réduction aux yeux plissés)
    B.head *= 1.22;
    B.legs *= 0.83;
    B.snout *= 0.68;
    B.back *= 0.9;
    B.neck *= 0.85;
    B.girth *= 1.08;
    B.paws = 1.2;
    B.tuck *= 0.3;
    B.chest *= 0.3;
    B.eyeOpen = Math.max(B.eyeOpen, 0.9);
    B.mouth = 1;
    B.cheek = Math.max(B.cheek, 0.4);
    B.flews *= 0.4;
    B.jowl *= 0.3;
    B.wrinkle *= 0.5;
    B.earSize *= 1.08;
    B.tailLen *= 0.8;
    B.fur *= 0.6;
    B.ruff *= 0.5;
    B.feather *= 0.3;
    B.slope = 0;
    // (oreilles droites : pas encore dressées chez le chiot)
    // (petits chiens : les coques des oreilles droites restent, plus petites ; le lambeau à demi déplié du jack
    // faisait deux ailes de chaque côté de la tête)
    if (B.ears === 'pointed' || B.ears === 'bat') {
      if (model === 'shiba') B.ears = 'semi';
      else B.earSize *= 0.8;
    }
  }
  const r = (x) => Math.round(x * 1000) / 1000;
  B.key = [model, ...Object.keys(ONE).map((k) => r(B[k])), B.ears, B.tail, B.puppy ? 1 : 0].join('|');
  return B;
}
