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
  spitz_nain: { legs: 0.8, back: 0.8, girth: 1.05, head: 1.12, snout: 0.6, ears: 'pointed', earSize: 0.75, tail: 'curl', fur: 0.039, ruff: 1, tailLen: 0.9 },
  yorkshire: { legs: 0.85, back: 0.9, girth: 0.92, head: 1.05, snout: 0.75, ears: 'pointed', earSize: 0.85, tail: 'carrot', fur: 0.022, feather: 0.6, silky: 1 },
  carlin: { legs: 0.72, legW: 1.15, back: 0.85, girth: 1.28, head: 1.3, snout: 0.28, muzzleW: 1.3, neck: 0.8, ears: 'button', earSize: 0.6, tail: 'curl', tailLen: 0.7 },
  jack_russell: { tail: 'carrot', tailLen: 0.85 },
  corgi: { legs: 0.55, legW: 1.15, back: 1.25, girth: 1.18, head: 1.08, snout: 0.95, ears: 'pointed', earSize: 1.35, tail: 'stub', fur: 0.007 },
  cavalier: { legs: 0.9, back: 0.95, girth: 1.05, head: 1.05, snout: 0.62, ears: 'long', earSize: 1.45, tail: 'plume', fur: 0.011, feather: 1 },
  teckel: { legs: 0.5, legW: 1.12, back: 1.45, girth: 1.05, head: 1.0, snout: 1.25, ears: 'long', earSize: 1.3, tail: 'sabre', tailLen: 1.15 },
  bouledogue: { legs: 0.75, legW: 1.2, back: 0.88, girth: 1.3, head: 1.35, snout: 0.33, muzzleW: 1.35, neck: 0.8, ears: 'bat', earSize: 1.45, tail: 'stub' },
  cocker: { legs: 0.92, back: 0.92, girth: 1.08, head: 1.08, snout: 0.95, ears: 'long', earSize: 1.6, tail: 'stub', fur: 0.014, feather: 1 },
  // ---- moyens et grands (shiba) ; fur < 0 : le double poil du shiba est raccourci (races à poil ras)
  labrador: { legs: 0.97, legW: 1.08, back: 1.08, girth: 1.16, headW: 0.88, head: 1.08, snout: 1.15, muzzleW: 1.15, neck: 0.95, ears: 'floppy', earSize: 1.1, tail: 'otter', tailThick: 0.7, fur: -0.012 },
  berger_allemand: { legs: 1.02, back: 1.12, girth: 1.0, headW: 0.86, head: 1.05, snout: 1.38, ears: 'pointed', earSize: 1.25, tail: 'sabre', tailLen: 1.15, fur: 0.004, slope: 1 },
  golden: { legs: 0.98, legW: 1.06, back: 1.06, girth: 1.1, headW: 0.86, head: 1.05, snout: 1.15, muzzleW: 1.08, ears: 'floppy', earSize: 1.1, tail: 'plume', tailThick: 0.9, fur: 0.012, feather: 1, ruff: 0.4 },
  beagle: { legs: 0.88, legW: 1.06, back: 1.0, girth: 1.08, head: 1.1, snout: 1.1, ears: 'long', earSize: 1.3, tail: 'sickle', tailLen: 0.9, tailThick: 0.55, fur: -0.012 },
  border_collie: { legs: 1.0, back: 1.05, girth: 0.98, headW: 0.86, head: 0.98, snout: 1.12, ears: 'semi', tail: 'sabre', tailLen: 1.1, fur: 0.01, feather: 0.8, ruff: 0.6 },
  dalmatien: { legs: 1.05, back: 1.05, girth: 0.98, headW: 0.86, head: 1.0, snout: 1.25, ears: 'floppy', tail: 'sabre', tailLen: 1.1, tailThick: 0.5, fur: -0.016 },
  bouvier_bernois: { legs: 0.98, legW: 1.12, back: 1.08, girth: 1.2, headW: 0.95, head: 1.12, snout: 0.95, muzzleW: 1.12, ears: 'floppy', tail: 'plume', fur: 0.016, feather: 1, ruff: 0.8 },
  saint_bernard: { legs: 0.98, legW: 1.18, back: 1.1, girth: 1.28, head: 1.3, snout: 0.85, muzzleW: 1.35, neck: 0.95, ears: 'floppy', earSize: 1.1, tail: 'plume', fur: 0.012, ruff: 0.5 },
  epagneul_breton: { legs: 1.0, back: 0.95, girth: 1.0, headW: 0.88, head: 1.0, snout: 1.12, ears: 'floppy', earSize: 0.95, tail: 'stub', fur: 0.004, feather: 0.6 },
  husky: { legs: 1.0, back: 1.02, girth: 1.02, head: 1.0, snout: 1.1, ears: 'pointed', earSize: 1.05, tail: 'sickle', tailThick: 1.15, fur: 0.008, ruff: 0.5 },
  berger_islandais: { legs: 0.98, back: 0.98, girth: 1.02, head: 1.0, snout: 0.98, ears: 'pointed', tail: 'curl', fur: 0.01, ruff: 0.7 },
  shiba: {},
  akita: { legs: 1.0, legW: 1.1, back: 1.05, girth: 1.15, head: 1.15, snout: 0.95, muzzleW: 1.2, ears: 'pointed', earSize: 0.85, tail: 'curl', tailThick: 1.15, fur: 0.006 },
  galgo: { legs: 1.28, legW: 0.82, back: 1.08, girth: 0.78, headW: 0.76, head: 0.92, snout: 1.6, muzzleW: 0.8, neck: 1.2, ears: 'rose', earSize: 0.9, tail: 'whip', tailLen: 1.25, tailThick: 0.35, fur: -0.02, tuck: 1 },
  coonhound: { legs: 1.02, back: 1.05, girth: 1.04, headW: 0.84, head: 1.05, snout: 1.35, ears: 'long', earSize: 1.5, tail: 'sickle', tailThick: 0.55, fur: -0.014 },
  dogo: { legs: 1.0, legW: 1.12, back: 1.0, girth: 1.16, headW: 0.95, head: 1.18, snout: 1.05, muzzleW: 1.3, neck: 1.05, ears: 'floppy', earSize: 0.85, tail: 'sabre', tailThick: 0.5, fur: -0.016 },
  kelpie: { legs: 1.0, back: 1.0, girth: 0.98, headW: 0.86, head: 0.98, snout: 1.22, ears: 'pointed', earSize: 1.1, tail: 'sabre', tailThick: 0.85, fur: -0.006 },
  berger_australien: { legs: 0.98, back: 1.0, girth: 1.02, headW: 0.9, head: 1.0, snout: 1.1, ears: 'semi', tail: 'stub', fur: 0.012, feather: 0.8, ruff: 0.6 },
  caniche: { legs: 1.08, legW: 0.92, back: 0.95, girth: 0.95, headW: 0.8, head: 0.95, snout: 1.42, muzzleW: 0.9, neck: 1.1, ears: 'long', earSize: 1.1, tail: 'carrot', tailLen: 0.6, fur: 0.018, curly: 1 },
  boxer: { legs: 1.02, back: 0.95, girth: 1.08, headW: 0.95, head: 1.1, snout: 0.45, muzzleW: 1.25, ears: 'semi', tail: 'stub', tailThick: 0.5, fur: -0.016 },
  rottweiler: { legs: 0.98, legW: 1.15, back: 1.0, girth: 1.22, headW: 0.95, head: 1.18, snout: 0.95, muzzleW: 1.25, ears: 'floppy', earSize: 0.85, tail: 'sabre', tailThick: 0.55, fur: -0.012 },
  malinois: { legs: 1.02, back: 1.0, girth: 0.95, headW: 0.84, head: 0.98, snout: 1.38, ears: 'pointed', earSize: 1.15, tail: 'sabre', tailThick: 0.75, fur: -0.008 },
  samoyede: { legs: 1.0, back: 1.0, girth: 1.05, head: 1.0, snout: 1.0, ears: 'pointed', earSize: 0.9, tail: 'curl', fur: 0.028, ruff: 1, feather: 0.6 },
  whippet: { legs: 1.22, legW: 0.82, back: 1.02, girth: 0.82, headW: 0.78, head: 0.92, snout: 1.5, muzzleW: 0.8, neck: 1.15, ears: 'rose', earSize: 0.9, tail: 'whip', tailLen: 1.15, tailThick: 0.35, fur: -0.02, tuck: 1 },
  setter: { legs: 1.05, back: 1.05, girth: 0.95, headW: 0.8, head: 1.0, snout: 1.42, muzzleW: 0.9, neck: 1.08, ears: 'long', earSize: 1.15, tail: 'sabre', tailLen: 1.1, tailThick: 0.7, fur: 0.012, feather: 1 },
  terre_neuve: { legs: 0.95, legW: 1.25, back: 1.08, girth: 1.34, head: 1.25, snout: 0.85, muzzleW: 1.3, neck: 0.95, ears: 'floppy', earSize: 0.85, tail: 'plume', fur: 0.025, ruff: 0.8, feather: 1 },
  labradoodle: { legs: 1.0, back: 1.0, girth: 1.04, headW: 0.9, head: 1.0, snout: 1.1, ears: 'floppy', earSize: 1.15, tail: 'plume', fur: 0.02, curly: 1 },
  berger_blanc: { legs: 1.02, back: 1.1, girth: 1.0, headW: 0.86, head: 1.02, snout: 1.35, ears: 'pointed', earSize: 1.2, tail: 'sabre', tailLen: 1.1, fur: 0.008 },
};

const ONE = {
  legs: 1, legW: 1, back: 1, girth: 1, head: 1, snout: 1, muzzleW: 1, neck: 1,
  earSize: 1, headW: 1, tailLen: 1, tailThick: 1, fur: 0, ruff: 0, feather: 0, curly: 0, silky: 0, slope: 0, tuck: 0,
};

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
 * Renvoie { model, legs, legW, back, girth, head, snout, muzzleW, neck, ears, earSize, tail, tailLen, tailThick,
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
  B.puppy = !!puppy;
  if (puppy) {
    B.head *= 1.22;
    B.legs *= 0.86;
    B.snout *= 0.75;
    B.back *= 0.9;
    B.neck *= 0.85;
    B.girth *= 1.04;
    B.earSize *= 1.08;
    B.tailLen *= 0.8;
    B.fur *= 0.6;
    B.ruff *= 0.5;
    B.feather *= 0.3;
    B.slope = 0;
    // (oreilles droites : pas encore dressées chez le chiot)
    if (B.ears === 'pointed' || B.ears === 'bat') B.ears = 'semi';
  }
  const r = (x) => Math.round(x * 1000) / 1000;
  B.key = [model, ...Object.keys(ONE).map((k) => r(B[k])), B.ears, B.tail, B.puppy ? 1 : 0].join('|');
  return B;
}
