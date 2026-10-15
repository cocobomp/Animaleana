// Les aides embauchées progressent : expérience, niveaux, humeur, pauses, formation et consignes.
// Logique pure (testable), utilisée par src/sim/farm.js, src/game/Game.js et src/ui/helperChat.js.

import { HELPERS } from './farm.js';

/** XP nécessaire pour chaque niveau (niveau 1 à 5). */
export const HELPER_LEVELS = [0, 40, 120, 250, 450];
export const MAX_HELPER_LEVEL = HELPER_LEVELS.length;
export const TRAIN_XP = 35;
export const TRAIN_COST = 50;
export const BREAK_MINUTES = 60;

export function helperLevel(h) {
  const xp = h.xp ?? 0;
  let lv = 1;
  for (let i = 0; i < HELPER_LEVELS.length; i++) if (xp >= HELPER_LEVELS[i]) lv = i + 1;
  return lv;
}

/** Progression vers le niveau suivant (0 à 1). */
export function helperProgress(h) {
  const lv = helperLevel(h);
  if (lv >= MAX_HELPER_LEVEL) return 1;
  const a = HELPER_LEVELS[lv - 1];
  const b = HELPER_LEVELS[lv];
  return ((h.xp ?? 0) - a) / (b - a);
}

/** Ajoute de l'XP. Renvoie { level, levelUp }. */
export function addHelperXp(h, n) {
  const before = helperLevel(h);
  h.xp = (h.xp ?? 0) + n;
  const level = helperLevel(h);
  return { level, levelUp: level > before };
}

const mood = (h) => h.mood ?? 80;

/** Durée d'un soin (multiplicateur) : plus d'expérience = plus vite ; fatigué(e) = plus lent. */
export function helperSpeed(h) {
  const base = 1 - 0.12 * (helperLevel(h) - 1);
  return mood(h) < 30 ? base * 1.4 : base;
}

/** Qualité des soins (0 à 1) : un débutant fait moins bien qu'une aide expérimentée. */
export function helperQuality(h) {
  const q = 0.7 + 0.075 * (helperLevel(h) - 1);
  return Math.max(0.4, mood(h) < 30 ? q - 0.15 : q);
}

/** Chaque tâche fatigue un peu. */
export function tireHelper(h, n = 1) {
  h.mood = Math.max(0, mood(h) - 2 * n);
}

/** Se reposer (pause, nuit) : l'humeur remonte. */
export function restHelper(h, hours) {
  h.mood = Math.min(100, mood(h) + 25 * hours);
}

export function helperMood(h) {
  const m = mood(h);
  return m >= 65 ? 'great' : m >= 30 ? 'ok' : 'tired';
}

export function onBreak(h, clock) {
  return (h.breakUntil ?? -1) > clock;
}

/** Lui donner une pause : elle/il arrête de travailler un moment et récupère. */
export function startBreak(h, clock, minutes = BREAK_MINUTES) {
  h.breakUntil = clock + minutes;
}

export function endBreak(h) {
  delete h.breakUntil;
}

/** La pause est finie : l'humeur remonte d'un coup. Renvoie vrai si la pause vient de finir. */
export function updateBreak(h, clock) {
  if (h.breakUntil === undefined || h.breakUntil > clock) return false;
  restHelper(h, BREAK_MINUTES / 60 * 1.6);
  delete h.breakUntil;
  return true;
}

/** Former l'aide (une fois par jour). */
export function canTrain(h, day) {
  if (helperLevel(h) >= MAX_HELPER_LEVEL) return { ok: false, reason: 'maxLevel' };
  if (h.trainedDay === day) return { ok: false, reason: 'trainedToday' };
  return { ok: true };
}

export function trainHelper(h, day) {
  const c = canTrain(h, day);
  if (!c.ok) return c;
  h.trainedDay = day;
  h.mood = Math.min(100, mood(h) + 5);
  return { ok: true, ...addHelperXp(h, TRAIN_XP) };
}

/** Féliciter : ça fait plaisir (une fois par jour). */
export function praiseHelper(h, day) {
  if (h.praisedDay === day) return { ok: false, reason: 'praisedToday' };
  h.praisedDay = day;
  h.mood = Math.min(100, mood(h) + 15);
  return { ok: true };
}

/** Consigne : s'occuper d'abord d'un animal (ou null pour aucun). */
export function setPriority(h, animalId) {
  if (animalId) h.priority = animalId;
  else delete h.priority;
}

/** Les animaux dont cette aide s'occupe. */
export function helperAnimals(h, animals) {
  const def = HELPERS[h.type];
  if (def.species === null) return animals; // vétérinaire : tout le monde
  return animals.filter((a) => def.species.includes(a.species));
}

/**
 * Les nouvelles des animaux, racontées par l'aide.
 * Renvoie une liste de { key, name?, sex?, need? } (au plus 3).
 */
export function helperNews(h, animals) {
  const mine = helperAnimals(h, animals);
  if (!mine.length) return [{ key: 'nobody' }];
  const out = [];
  for (const a of mine.filter((x) => x.sick)) out.push({ key: 'sick', name: a.name, sex: a.sex });
  for (const a of mine) {
    if (out.length >= 3) break;
    let worst = null;
    for (const n of ['hunger', 'thirst', 'hygiene', 'affection', 'exercise', 'energy']) {
      const v = a.needs?.[n] ?? 100;
      if (v < 35 && (!worst || v < worst.v)) worst = { n, v };
    }
    if (worst && !a.sick) out.push({ key: 'need', name: a.name, sex: a.sex, need: worst.n });
  }
  for (const a of mine.filter((x) => x.pregnant)) if (out.length < 3) out.push({ key: 'pregnant', name: a.name, sex: a.sex });
  if (!out.length) {
    const happy = mine.reduce((b, a) => ((a.bond ?? 0) > (b.bond ?? 0) ? a : b), mine[0]);
    out.push({ key: 'allGood', name: happy.name, sex: happy.sex });
  }
  return out.slice(0, 3);
}

/** Moment de la journée pour dire bonjour. */
export function dayPart(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}
