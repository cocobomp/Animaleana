// 🐷 La tirelire : gagner de l'argent doit être MOTIVANT (pas plus facile).
//
// - 🎯 Un objectif d'épargne choisi par la joueuse (une selle, un outil, un animal de l'animalerie) : sa tirelire se
//   remplit vers lui, on voit « il te manque 120 pièces », et on le fête quand on a assez.
// - 🔥 La série des petits boulots : un boulot au moins chaque jour de jeu, et le premier boulot du jour rapporte un
//   petit bonus qui grandit (+5, +10, +15, +20 au plus). Un jour sauté : la série recommence, sans rien perdre.
// - ⭐ Journée complète : tous les petits boulots du jour faits, un petit bonus en plus.
// - ☀️ Bon retour : la première ouverture de la partie un nouveau jour du CALENDRIER (un vrai jour), un petit cadeau.
//   Pas de série : un jour sauté ne fait rien perdre.
// (Aussi : ⭐ la prime du travail bien fait, src/sim/wellDone.js ; 🎯 les défis du jour, src/sim/dailyChallenges.js.)
//
// Les règles des petits boulots ne changent pas (une fois par jour chacun, entre 8 h et 18 h : src/game/Game.js).
// Logique pure (tests/tirelire.test.js) ; le jeu : Game.doJob, Game.buyGear/buyTool/buyAnimal ; l'écran :
// src/ui/piggy.js (tirelire du HUD, pièces qui volent) et src/ui/panels.js (openJobs).
//
// Dans le profil (sauvegardé ; absents d'une ancienne partie : createProfile les remet par défaut) :
//   goal : null | { kind: 'gear', id, size } | { kind: 'tool', id } | { kind: 'animal', species, breed, stage, place }
//          (+ told : la fête « tu as assez ! » déjà faite ; place : l'élevage du voyage où l'animal a été choisi,
//          absent à la maison et dans une ancienne partie : voir goalPlace)
//   jobStreak : { day (dernier jour avec un boulot), n (jours de suite) }
//   lastVisit : 'AAAA-MM-JJ', la dernière date du calendrier où la partie a été ouverte (créé au premier usage)

import { GEAR, gearPrice, defaultSize } from './gear.js';
import { TOOLS } from './tools.js';
import { SPECIES } from './species.js';
import { shopPrice, breedsFor } from './adoption.js';
import { PLACES } from './places.js';

/** Bonus de série : (jours de suite - 1) × step, au plus max × step (le 5e jour et après : +20). */
export const JOB_STREAK = { step: 5, max: 4 };
/** Tous les petits boulots du jour faits : un bonus en plus. */
export const FULL_DAY_BONUS = 15;

export const defaultJobStreak = () => ({ day: 0, n: 0 });

/** Le bonus du premier boulot d'un jour quand on en est à n jours de suite. */
export const streakBonus = (n) => Math.max(0, Math.min(n - 1, JOB_STREAK.max)) * JOB_STREAK.step;

/**
 * La série si l'on fait un boulot le jour day : { n, first (premier boulot de ce jour), kept (la série continue
 * depuis hier) }. Ne change rien (voir recordJob).
 */
export function streakOn(streak, day) {
  const s = streak ?? defaultJobStreak();
  if (s.day === day) return { n: s.n, first: false, kept: true };
  if (s.day === day - 1 && s.n > 0) return { n: s.n + 1, first: true, kept: true };
  return { n: 1, first: true, kept: false };
}

/** La série encore vivante aujourd'hui (fait hier ou aujourd'hui), sinon 0. */
export const streakAlive = (streak, day) => (streak && (streak.day === day || streak.day === day - 1) ? streak.n : 0);

/**
 * Ce que rapporte le boulot job fait le jour day : { base, streak (bonus de série), full (bonus journée complète),
 * total, n (jours de suite) }. jobs : les petits boulots proposés (ceux de la journée complète) ; done : ceux déjà
 * faits aujourd'hui (sans job).
 */
export function jobPayout(profile, job, day, jobs = [job]) {
  const s = streakOn(profile.jobStreak, day);
  const streak = s.first ? streakBonus(s.n) : 0;
  const today = profile.jobsToday?.day === day ? profile.jobsToday.done : [];
  const after = new Set([...today, job.id]);
  const full = jobs.length > 1 && jobs.every((j) => after.has(j.id)) && !today.includes(job.id) ? FULL_DAY_BONUS : 0;
  return { base: job.pay, streak, full, total: job.pay + streak + full, n: s.n };
}

/** Note un boulot fait le jour day dans la série du profil ; renvoie la série. */
export function recordJob(profile, day) {
  const s = streakOn(profile.jobStreak, day);
  profile.jobStreak = { day, n: s.n };
  return profile.jobStreak;
}

/** 🔥 Les paliers de la série fêtés par un mot (« 🔥 3 jours de suite ! ») au premier boulot du jour. */
export const STREAK_CHEERS = [3, 5, 7, 14, 30];

/**
 * 🎉 Le mot de fête d'un boulot (pay : jobPayout) : { key, n, big }. Un seul à la fois, le plus beau : la journée
 * complète (en grand), sinon un palier de la série, sinon « Bravo ! ». Ne change rien (les textes : src/i18n.js).
 */
export function jobCheer(pay) {
  if (pay?.full) return { key: 'cel_fullDay', big: true };
  if (pay?.streak && STREAK_CHEERS.includes(pay.n)) return { key: 'cel_streak', n: pay.n, big: false };
  return { key: 'cel_bravo', big: false };
}

// ---------------------------------------------------------------- ☀️ bon retour

/** ☀️ Le cadeau « bon retour », une fois par date du calendrier. */
export const RETURN_BONUS = 10;

/**
 * ☀️ Bon retour : la partie s'ouvre un nouveau jour du calendrier (today : 'AAAA-MM-JJ', la date locale :
 * src/sim/saveFile.js localDay). Renvoie { coins (0 en bac à sable), word (on fête : « Bon retour ! ») }. La date est
 * notée à chaque fois (profile.lastVisit, créé au premier usage) : rien juste après la fin de l'histoire du début le
 * même jour. Rien pendant l'histoire du début, ni le jour où la partie a été créée (createdDay : ce n'est pas un
 * retour). Une ancienne partie (sans lastVisit, ou abîmé) qui revient : le cadeau. Pas de série : sauter des jours ne
 * change rien. La date notée ne recule jamais : un jour plus ancien (la date du téléphone remise en arrière) ne donne
 * rien et ne change rien, sinon avancer puis reculer la date redonnerait +10 à chaque fois (les 'AAAA-MM-JJ' se
 * comparent comme du texte). Le prix de cette protection : un téléphone réglé une fois loin dans le futur, et plus
 * de cadeau jusqu'à cette date-là. On n'y perd rien.
 */
export function returnBonus(profile, today, createdDay = '') {
  const none = { coins: 0, word: false };
  if (!profile || typeof today !== 'string' || !today) return none;
  const last = typeof profile.lastVisit === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(profile.lastVisit) ? profile.lastVisit : '';
  if (last && today <= last) return none; // (le même jour, ou un jour plus ancien : rien)
  profile.lastVisit = today;
  if (profile.tutorial?.done === false) return none;
  if (!last && createdDay === today) return none; // (une partie toute neuve : pas encore un retour)
  return { coins: profile.mode === 'sandbox' ? 0 : RETURN_BONUS, word: true };
}

// ---------------------------------------------------------------- 🎯 objectif d'épargne

/** Le prix de l'objectif (null : objectif inconnu, par exemple un objet retiré du jeu). */
export function goalPrice(goal) {
  if (!goal) return null;
  if (goal.kind === 'gear') return GEAR[goal.id] && !GEAR[goal.id].reward ? gearPrice(goal.id, goal.size ?? defaultSize(goal.id)) : null;
  if (goal.kind === 'tool') return TOOLS[goal.id]?.price ?? null;
  if (goal.kind === 'animal') return SPECIES[goal.species]?.breeds.some((b) => b.id === goal.breed) ? shopPrice(goal.species, goal.breed, goal.stage ?? 'young') : null;
  return null;
}

/** L'emoji de l'objectif. */
export function goalEmoji(goal) {
  if (goal?.kind === 'gear') return GEAR[goal.id]?.emoji ?? '🎯';
  if (goal?.kind === 'tool') return TOOLS[goal.id]?.emoji ?? '🎯';
  if (goal?.kind === 'animal') return SPECIES[goal.species]?.emoji ?? '🎯';
  return '🎯';
}

/** Deux objectifs pareils (même chose à acheter) ? */
export function sameGoal(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'gear') return a.id === b.id && (a.size ?? null) === (b.size ?? null);
  if (a.kind === 'tool') return a.id === b.id;
  if (a.kind === 'animal') return a.species === b.species && a.breed === b.breed && (a.stage ?? 'young') === (b.stage ?? 'young');
  return false;
}

/**
 * Choisit (ou change) l'objectif. Rien en bac à sable (l'argent y est illimité). Un animal choisi à l'élevage d'un
 * voyage garde son lieu (place) : on dira où aller l'acheter (goalPlace).
 */
export function setGoal(profile, goal) {
  if (profile.mode === 'sandbox' || goalPrice(goal) === null) return false;
  const { kind, id, size, species, breed, stage } = goal;
  const place = kind === 'animal' && typeof goal.place === 'string' && PLACES[goal.place] ? goal.place : undefined;
  profile.goal = Object.fromEntries(Object.entries({ kind, id, size, species, breed, stage, place }).filter(([, v]) => v !== undefined));
  return true;
}

/**
 * 🧭 Où acheter l'animal de l'objectif : null (à l'animalerie de la maison, ou pas un animal) ou l'id du lieu de son
 * élevage, quand la race n'est vendue que là-bas (un Kiso : au Japon). Lu de façon tolérante : un objectif sans lieu
 * (ancienne partie) prend l'origine de la race ; un lieu inconnu est ignoré.
 */
export function goalPlace(profile) {
  const g = profile?.goal;
  if (g?.kind !== 'animal') return null;
  const home = typeof profile.home === 'string' && PLACES[profile.home] ? profile.home : 'maison';
  if (breedsFor(home, true).some((x) => x.species === g.species && x.breed.id === g.breed)) return null; // (vendu ici)
  const origin = SPECIES[g.species]?.breeds.find((b) => b.id === g.breed)?.origin;
  for (const id of [g.place, origin]) if (typeof id === 'string' && PLACES[id] && id !== home) return id;
  return null;
}

export const clearGoal = (profile) => { profile.goal = null; };

/**
 * Où en est la tirelire : null (pas d'objectif, bac à sable) ou { goal, emoji, price, have, missing, pct (0..1),
 * ready (assez de pièces) }. gain : des pièces en plus (« après ce boulot »).
 */
export function goalStatus(profile, gain = 0) {
  if (!profile?.goal || profile.mode === 'sandbox') return null;
  const price = goalPrice(profile.goal);
  if (price === null) return null;
  const have = Math.max(0, (profile.money ?? 0) + gain);
  const missing = Math.max(0, price - have);
  return { goal: profile.goal, emoji: goalEmoji(profile.goal), price, have, missing, pct: price > 0 ? Math.min(1, have / price) : 1, ready: missing === 0 };
}

/**
 * Le joueur vient d'acheter kind/what (même forme qu'un objectif ; pour un objet de sellerie, la taille compte peu :
 * la selle achetée, l'objectif est atteint). Renvoie true si c'était l'objectif (il est alors effacé).
 */
export function goalBought(profile, bought) {
  const g = profile.goal;
  if (!g || !bought || g.kind !== bought.kind) return false;
  const hit = g.kind === 'gear' || g.kind === 'tool' ? g.id === bought.id : g.species === bought.species && g.breed === bought.breed;
  if (hit) profile.goal = null;
  return hit;
}

/**
 * La fête « tu as assez de pièces ! » : true une seule fois quand la tirelire atteint l'objectif (repart si l'argent
 * redescend en dessous).
 */
export function goalJustReady(profile) {
  const s = goalStatus(profile);
  if (!s) return false;
  if (!s.ready) {
    if (profile.goal.told) profile.goal.told = false;
    return false;
  }
  if (profile.goal.told) return false;
  profile.goal.told = true;
  return true;
}
