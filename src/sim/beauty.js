// Concours de beauté : préparation de l'animal (toilette, tresses, rubans, lustrage…),
// note de beauté (0 à 100) et notes du juge pendant la présentation dans la carrière.
// Logique pure, sans 3D : testée dans tests/beauty.test.js.
// La discipline s'appelle 'beauty' dans le calendrier des concours (src/sim/activities.js).
// La 3D est dans src/game/Beauty.js, l'interface dans src/ui/beauty.js et src/ui/minigames/beauty.js.

import { weightClass } from './animal.js';
import { seeded } from './rng.js';

const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));

/** Couleurs des rubans et des nœuds (clé → couleur 3D). */
export const RIBBON_COLORS = { red: 0xd8402f, pink: 0xf07ab8, blue: 0x2f6fd8, yellow: 0xf2c230, green: 0x2fa84a, purple: 0x8a45d8, white: 0xf6f4ee };

/** Motifs des bandanas et nœuds. */
export const BOW_PATTERNS = ['plain', 'dots', 'stripes'];

/**
 * Chaque geste de préparation : combien de temps il « tient » (heures de jeu), s'il s'agit d'un soin
 * existant (mini-jeu des soins) ou d'un nouveau mini-jeu de beauté, et son icône.
 */
export const PREP_ITEMS = {
  wash: { icon: '🫧', hours: 24, care: true },
  brush: { icon: '🪮', hours: 24, care: true },
  nails: { icon: '✂️', hours: 72, care: true },
  shoe: { icon: '🔨', hours: 72, care: true },
  braid: { icon: '🎀', hours: 48, game: true, color: true },
  shine: { icon: '✨', hours: 24, game: true },
  bow: { icon: '🎀', hours: 48, game: true, color: true },
  fluff: { icon: '🧶', hours: 48, game: true },
};

/**
 * La liste de préparation de chaque espèce : les gestes qui comptent (required) et un petit bonus.
 * Les chevaux sont les stars du concours : tresses de crinière et de queue, sabots huilés.
 */
const CHECKLISTS = {
  horse: { required: ['wash', 'brush', 'braid', 'shine'], bonus: ['shoe'] },
  dog: { required: ['wash', 'brush', 'bow', 'shine'], bonus: ['nails'] },
  cat: { required: ['brush', 'bow', 'shine'], bonus: ['nails'] },
  rabbit: { required: ['brush', 'bow', 'fluff'], bonus: ['nails'] },
  sheep: { required: ['brush', 'fluff', 'bow'], bonus: [] },
  goat: { required: ['brush', 'bow', 'shine'], bonus: ['nails'] },
  cow: { required: ['wash', 'brush', 'bow', 'shine'], bonus: [] },
};

export const checklistFor = (species) => CHECKLISTS[species] ?? CHECKLISTS.dog;

/** Tous les gestes (requis puis bonus) d'un animal. */
export const prepItems = (a) => {
  const c = checklistFor(a.species);
  return [...c.required, ...c.bonus];
};

/** Données de beauté de l'animal (créées au besoin, dans la sauvegarde de l'animal). */
export function beautyData(a) {
  a.beauty = a.beauty ?? {};
  const b = a.beauty;
  b.prep = b.prep ?? {};
  if (b.allure === undefined) b.allure = allureOf(a);
  return b;
}

/** « Allure » : la conformation de l'animal, toujours la même pour un même animal (60 à 100). */
export function allureOf(a) {
  const rng = seeded(`allure-${a.id}-${a.look?.seed ?? 0}`);
  return 60 + Math.round(rng() * 40);
}

/** Heure de jeu absolue (en heures) à partir de l'horloge du profil (minutes). */
export const nowHours = (profile) => (profile?.clock ?? 0) / 60;

/**
 * Note un geste de préparation fait maintenant. extra : { color, pattern } (rubans, nœuds).
 * quality (0 à 1) vient du mini-jeu : un geste bien fait tient un peu plus longtemps.
 */
export function notePrep(a, item, now, quality = 1, extra = {}) {
  const def = PREP_ITEMS[item];
  if (!def) return null;
  const b = beautyData(a);
  const entry = { t: now, q: Math.round(clamp(quality) * 100) / 100 };
  if (def.color) {
    entry.color = RIBBON_COLORS[extra.color] !== undefined ? extra.color : 'red';
    if (extra.pattern) entry.pattern = extra.pattern;
  }
  b.prep[item] = entry;
  return entry;
}

/** Heures de fraîcheur restantes d'un geste (0 si pas fait ou trop vieux). */
export function freshness(a, item, now) {
  const def = PREP_ITEMS[item];
  const e = a.beauty?.prep?.[item];
  if (!def || !e) return 0;
  const bonus = 1 + ((e.q ?? 1) - 0.5) * 0.3; // bien fait : jusqu'à +15 % de durée
  return Math.max(0, e.t + def.hours * bonus - now);
}

export const isFresh = (a, item, now) => freshness(a, item, now) > 0;

/** Un geste compte aussi s'il vient d'être fait par le soin normal : hygiène ou toilette au maximum. */
export function itemDone(a, item, now) {
  if (isFresh(a, item, now)) return true;
  if (item === 'wash' && (a.needs?.hygiene ?? 0) >= 90) return true;
  if (item === 'brush' && (a.needs?.grooming ?? 0) >= 90) return true;
  return false;
}

/**
 * La pluie et la boue abîment la préparation : la toilette et le lustrage vieillissent plus vite.
 * hours : heures de jeu passées sous la pluie (ou dans la boue).
 */
export function weatherWear(a, weather, hours) {
  const prep = a.beauty?.prep;
  if (!prep || hours <= 0) return false;
  const factor = { rain: 2, storm: 3, snow: 1.5, mud: 2 }[weather] ?? 0;
  if (!factor) return false;
  for (const k of ['wash', 'shine', 'fluff', 'braid']) {
    if (prep[k]) prep[k].t -= hours * factor * (k === 'braid' ? 0.5 : 1);
  }
  return true;
}

/** Oublie la préparation (après le concours, les rubans sont retirés) — on garde l'allure. */
export function clearPrep(a) {
  if (a.beauty) a.beauty.prep = {};
}

/** La liste à cocher affichée : chaque geste avec son état. */
export function checklist(a, now) {
  const c = checklistFor(a.species);
  const line = (item, required) => {
    const def = PREP_ITEMS[item];
    const left = freshness(a, item, now);
    const done = itemDone(a, item, now);
    const old = !done && !!a.beauty?.prep?.[item];
    return { item, icon: def.icon, required, done, old, left: Math.round(left), color: a.beauty?.prep?.[item]?.color ?? null, pattern: a.beauty?.prep?.[item]?.pattern ?? null };
  };
  return [...c.required.map((i) => line(i, true)), ...c.bonus.map((i) => line(i, false))];
}

/** Tous les gestes requis sont faits : l'animal est prêt pour le concours. */
export const isReady = (a, now) => checklist(a, now).filter((l) => l.required).every((l) => l.done);

const WEIGHT_FACTOR = { ideal: 1, chubby: 0.8, thin: 0.7, fat: 0.55 };

/**
 * La note de beauté (0 à 100) et ses morceaux (chacun de 0 à 1) :
 * présentation (gestes de préparation), robe (hygiène + toilette), santé, poids, calme (lien + obéissance)
 * et allure (conformation, propre à l'animal).
 */
export function beautyScore(a, now) {
  const list = checklist(a, now);
  const req = list.filter((l) => l.required);
  const bonus = list.filter((l) => !l.required);
  const presentation = clamp(req.filter((l) => l.done).length / Math.max(1, req.length) + bonus.filter((l) => l.done).length * 0.08);
  const coat = clamp(((a.needs?.hygiene ?? 50) * 0.5 + (a.needs?.grooming ?? 50) * 0.5) / 100);
  const health = clamp((a.health ?? 100) / 100) * (a.sick ? 0.5 : 1);
  const weight = WEIGHT_FACTOR[weightClass(a)] ?? 1;
  const calm = clamp(0.4 + ((a.bond ?? 5) / 100) * 0.35 + ((a.skills?.obedience ?? 10) / 100) * 0.25);
  const allure = (a.beauty?.allure ?? allureOf(a)) / 100;
  const parts = { presentation, coat, health, weight, calm, allure };
  const score = Math.round(100 * (presentation * 0.35 + coat * 0.25 + allure * 0.15 + weight * 0.1 + calm * 0.1 + health * 0.05));
  return { score: clamp(score, 0, 100), parts };
}

// ---------------------------------------------------------------- présentation dans la carrière

/** Les étapes de la présentation, selon l'espèce (les petits animaux sont portés jusqu'à la table). */
export function presentationSteps(species) {
  const led = species === 'horse' || species === 'dog';
  return led ? ['walk', 'halt', 'stand', 'turn', 'trot'] : ['walk', 'halt', 'stand', 'turn', 'pose'];
}

/** Taille de la zone verte des jauges de timing : un animal calme et attaché à toi aide. */
export function ringWindow(a) {
  const calm = beautyScore(a, 0).parts.calm;
  return clamp(0.16 + calm * 0.2, 0.14, 0.4);
}

/** Qualité d'un toucher sur la jauge (curseur 0 à 1, zone verte autour de 0,5). */
export function gaugeQuality(cursor, win) {
  const d = Math.abs(cursor - 0.5);
  if (d <= win / 2) return 1 - (d / (win / 2)) * 0.3;
  return Math.max(0, 0.5 - (d - win / 2) * 2);
}

/** Temps accordé (s) pour revenir au trot sur la distance donnée (m). */
export const trotPar = (dist) => Math.ceil(dist / 4) + 3;

/** Chance qu'un animal peu calme bouge pendant l'immobilité (par seconde). */
export const fidgetChance = (a) => clamp(0.25 - beautyScore(a, 0).parts.calm * 0.25, 0.01, 0.2);

/**
 * Les notes du juge (chacune sur 25) et le total sur 100.
 * perf : { walk, halt, stand, turn, trot } (qualités de 0 à 1 ; trot = pose pour les petits animaux).
 * Renvoie { presentation, condition, movement, behaviour, points, stars, comment }.
 */
export function judgeMarks(a, now, perf) {
  const { parts } = beautyScore(a, now);
  const q = (k) => clamp(perf[k] ?? 0);
  const presentation = 25 * (parts.presentation * 0.5 + parts.coat * 0.3 + parts.allure * 0.2);
  const condition = 25 * (parts.health * 0.4 + parts.weight * 0.4 + parts.coat * 0.2);
  const movement = 25 * (q('walk') * 0.5 + q('trot') * 0.5);
  const behaviour = 25 * (q('halt') * 0.4 + q('stand') * 0.4 + q('turn') * 0.2) * (0.6 + 0.4 * parts.calm);
  const marks = { presentation, condition, movement, behaviour };
  for (const k of Object.keys(marks)) marks[k] = Math.round(marks[k] * 10) / 10;
  const points = Math.round(presentation + condition + movement + behaviour);
  const stars = points >= 80 ? 3 : points >= 55 ? 2 : 1;
  // Le commentaire du juge : ce qui a le plus manqué (ou un bravo).
  const lowest = Object.entries(marks).sort((x, y) => x[1] - y[1])[0];
  let comment = 'perfect';
  if (lowest[1] < 22) {
    comment = lowest[0];
    if (comment === 'presentation' && parts.presentation < 0.7) comment = 'prep';
    if (comment === 'condition' && parts.weight < 1) comment = 'weight';
  }
  return { ...marks, points, stars, comment };
}

/** Points d'un concurrent de concours de beauté (skill 0 à 1). Entre 40 et 95. */
export const rivalBeautyPoints = (skill, rng) => Math.round(40 + clamp(skill) * 45 + rng() * 10);
