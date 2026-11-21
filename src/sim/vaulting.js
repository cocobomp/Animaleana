// Voltige : de la gymnastique sur le dos d'un cheval qui galope en cercle, tenu à la longe par le longeur.
// Le vrai sport : le cheval tourne à main gauche sur un cercle d'environ 15 m, avec un surfaix de voltige (deux
// poignées) sur un tapis épais et des enrênements ; le voltigeur monte en courant à côté de lui, puis fait les
// figures imposées (assise de base, drapeau, moulin, ciseaux, debout, flanc). Pour débuter : le tonneau de voltige
// (un cheval de bois), puis le cheval au pas, et enfin au galop.
//
// Le jeu, pour une enfant : toucher au bon moment, en rythme avec la foulée (le « temps » du galop), pour lancer
// chaque figure ; puis garder l'équilibre en glissant le doigt pendant que la figure tient quelques foulées.
// Les juges notent chaque figure sur 10.
//
// Logique pure, sans 3D (testée dans tests/vaulting.test.js). La partie 3D est dans src/game/Vaulting.js.

import { canRide } from './animal.js';
import { wears } from './gear.js';
import { seeded } from './rng.js';

const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const half = (v) => Math.round(clamp(v, 0, 10) * 2) / 2;
const tenth = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------- le cercle

/** Rayon du cercle de voltige (m) : un vrai cercle fait au moins 15 m de diamètre. */
export const CIRCLE_R = 7.5;

/** Centre du cercle dans la carrière (coordonnées locales du terrain de concours, voir SHOWGROUND). */
export const CIRCLE_AT = { x: 2, z: 0 };

/**
 * Point du cercle à l'angle h (cap du cheval, rad) quand il tourne à main gauche (sens inverse des aiguilles d'une
 * montre vu d'en haut : son flanc gauche, celui du voltigeur, regarde le centre). Cap 0 = vers +z ; la gauche du
 * cheval est (cos h, −sin h). Renvoie { x, z } autour du centre c.
 */
export function onCircle(c, h, r = CIRCLE_R) {
  return { x: c.x - r * Math.cos(h), z: c.z + r * Math.sin(h) };
}

// ---------------------------------------------------------------- niveaux

/**
 * Les trois niveaux. horse : il faut un cheval ; gait : son allure ; beat : durée d'un temps (s) sur le tonneau
 * (avec un cheval, c'est sa foulée) ; window : tolérance du toucher (part de la foulée) ; wobble : ce que le
 * mouvement du cheval pousse le voltigeur (équilibre) ; hold : foulées tenues pendant une figure.
 */
export const VAULT_LEVELS = {
  barrel: { horse: false, gait: null, beat: 1.25, window: 0.42, wobble: 0.38, hold: 3, icon: '🛢️' },
  walk: { horse: true, gait: 'walk', beat: null, window: 0.36, wobble: 0.55, hold: 3, icon: '🚶' },
  canter: { horse: true, gait: 'canter', beat: null, window: 0.3, wobble: 0.8, hold: 4, icon: '🐎' },
};
export const LEVEL_IDS = ['barrel', 'walk', 'canter'];

/** Note au pas qu'il faut avoir pour passer au galop (sur 10). */
export const CANTER_UNLOCK = 6;

// ---------------------------------------------------------------- figures

/**
 * Les figures imposées, dans l'ordre du programme. parts : touchers en rythme (le moulin se fait en quatre temps,
 * les ciseaux et le flanc en deux) ; hold : la figure tient quelques foulées (équilibre) ; balance : difficulté
 * de l'équilibre ; icon : pour l'affichage.
 */
export const FIGURES = {
  basicSeat: { parts: 1, hold: true, balance: 0.75, icon: '🧘' },
  flag: { parts: 1, hold: true, balance: 1.05, icon: '🚩' },
  mill: { parts: 4, hold: false, balance: 0, icon: '🌀' },
  scissors: { parts: 2, hold: false, balance: 0, icon: '✂️' },
  stand: { parts: 1, hold: true, balance: 1.3, icon: '🧍' },
  flank: { parts: 2, hold: false, balance: 0, icon: '🤸' },
};
export const PROGRAM = ['basicSeat', 'flag', 'mill', 'scissors', 'stand', 'flank'];

// ---------------------------------------------------------------- le bon moment

/**
 * Qualité d'un toucher (0 à 1) selon la phase de la foulée (0 → 1) au moment où l'on touche : le bon moment est
 * le début de la foulée (phase 0, ou 1 juste avant). window : tolérance (part de la foulée) du niveau.
 */
export function tapQuality(phase, window = VAULT_LEVELS.canter.window) {
  const p = ((phase % 1) + 1) % 1;
  const err = Math.min(p, 1 - p);
  return clamp(1 - err / window);
}

/** Ce qu'on dit d'un toucher : 'perfect', 'good', 'early' (avant le temps) ou 'late' (après). */
export function tapGrade(phase, window = VAULT_LEVELS.canter.window) {
  const q = tapQuality(phase, window);
  if (q >= 0.8) return 'perfect';
  if (q >= 0.45) return 'good';
  const p = ((phase % 1) + 1) % 1;
  return p < 0.5 ? 'late' : 'early';
}

// ---------------------------------------------------------------- l'équilibre

/** Zone d'équilibre : tant que le penché reste entre −BALANCE_ZONE et +BALANCE_ZONE, on est bien. */
export const BALANCE_ZONE = 0.3;

/**
 * Ce que le mouvement du cheval pousse le voltigeur à l'instant t (−1 à 1 environ, lisse) : deux ondulations
 * lentes, différentes à chaque figure (seed). amp : force du niveau, de la figure et du cheval.
 */
export function balancePush(t, amp, seed = 1) {
  const r = seeded(`push-${seed}`);
  const p1 = r() * 6.28;
  const p2 = r() * 6.28;
  const f1 = 0.9 + r() * 0.5;
  const f2 = 2.1 + r() * 0.9;
  return amp * (0.65 * Math.sin(f1 * t + p1) + 0.35 * Math.sin(f2 * t + p2));
}

/** Force de la poussée : niveau, figure, et cheval calme à la longe (obéissance) qui pousse moins. */
export function balanceAmp(level, figure, calm = 0.5) {
  const L = VAULT_LEVELS[level] ?? VAULT_LEVELS.canter;
  return L.wobble * (FIGURES[figure]?.balance ?? 1) * (1.15 - 0.3 * clamp(calm));
}

/**
 * Le penché du voltigeur : la poussée plus ce que fait le doigt (control, −1 à 1 : glisser vers la gauche ramène la
 * bulle à gauche). Bien joué, control ≈ −push.
 */
export const leanOf = (push, control) => clamp(push + control, -1.5, 1.5);

/**
 * Note d'équilibre (0 à 1) d'après les penchés relevés pendant la figure (un par image, à intervalles égaux) :
 * dans la zone, c'est parfait ; un peu dehors, ça compte à moitié ; trop penché, rien.
 */
export function balanceScore(leans) {
  if (!leans.length) return 1;
  let s = 0;
  for (const l of leans) {
    const a = Math.abs(l);
    s += a <= BALANCE_ZONE ? 1 : a <= BALANCE_ZONE * 2 ? 0.5 * (1 - (a - BALANCE_ZONE) / BALANCE_ZONE) + 0.25 : 0;
  }
  return clamp(s / leans.length);
}

// ---------------------------------------------------------------- notes des juges

/** Calme du cheval à la longe (0 à 1) : son obéissance ; le tonneau ne bouge pas, il est parfait. */
export const horseCalm = (a) => (a ? clamp((a.skills?.obedience ?? 10) / 100) : 1);

/**
 * Note d'une figure (sur 10, par demi-points) : le rythme (moyenne des touchers) et, si la figure tient, l'équilibre ;
 * un cheval calme aide un peu.
 */
export function figureMark({ timing = 0, balance = null, calm = 0.5 }) {
  const raw = balance === null ? clamp(timing) : 0.4 * clamp(timing) + 0.6 * clamp(balance);
  return half(1 + 8.5 * raw + 0.5 * clamp(calm));
}

/** Les trois juges : chacun voit la figure un peu différemment (demi-point de plus ou de moins). */
export function judgesMarks(mark, seed = 'vault') {
  const r = seeded(`judges-${seed}`);
  return [0, 1, 2].map(() => half(mark + (Math.floor(r() * 3) - 1) * 0.5));
}

/** Note retenue pour une figure : la moyenne des trois juges, au dixième. */
export const figureScore = (marks) => tenth(marks.reduce((s, m) => s + m, 0) / Math.max(1, marks.length));

/** Le petit mot de la juge (clé vt_say_<id>) : selon la note, et ce qui a manqué. */
export function judgeComment(mark, { timing = 1, balance = null } = {}) {
  if (mark >= 9) return 'perfect';
  if (balance !== null && balance < 0.5 && balance <= timing) return 'balance';
  if (timing < 0.5) return 'rhythm';
  if (mark >= 7) return 'good';
  if (mark >= 5) return 'ok';
  return 'keepGoing';
}

/**
 * Résultat d'un programme. figures : [{ id, score, marks, comment }]. Renvoie { points (la note finale sur 10, au
 * centième : le classement), score, stars, best, worst }.
 */
export function vaultResult(figures) {
  if (!figures.length) return { points: 0, score: 0, stars: 1, figures: [], best: null, worst: null };
  const mean = figures.reduce((s, f) => s + f.score, 0) / figures.length;
  const score = Math.round(mean * 100) / 100;
  const stars = score >= 7.5 ? 3 : score >= 5.5 ? 2 : 1;
  const sorted = [...figures].sort((a, b) => b.score - a.score);
  return { points: score, score, stars, figures, best: sorted[0], worst: sorted[sorted.length - 1] };
}

// ---------------------------------------------------------------- qui peut faire de la voltige ?

/**
 * Pourquoi ce cheval ne peut pas faire de voltige à ce niveau (null : il peut). Le tonneau, lui, est toujours là.
 * Raisons : notHorse, tooYoung, sick, pregnant, lame, tired, noSurcingle, noVaultPad, needBridle, canterLocked.
 */
export function vaultBlock(a, level = 'walk', profile = null) {
  if (level === 'barrel') return null;
  if (!a || a.species !== 'horse') return 'notHorse';
  const r = canRide(a);
  if (!r.ok) return r.reason;
  if ((a.needs?.energy ?? 100) < 20) return 'tired';
  if (!wears(a, 'surcingle')) return 'noSurcingle';
  if (!wears(a, 'vaultPad')) return 'noVaultPad';
  if (!wears(a, 'bridle') && !wears(a, 'halter')) return 'needBridle';
  if (level === 'canter' && profile && !canterUnlocked(profile)) return 'canterLocked';
  return null;
}

// ---------------------------------------------------------------- progrès (dans le profil)

/** Les données de voltige du profil (créées au besoin) : séances, meilleures notes, figures réussies. */
export function vaultData(p) {
  p.vaulting = p.vaulting ?? {};
  const d = p.vaulting;
  d.sessions = d.sessions ?? 0;
  d.best = d.best ?? {};
  d.figures = d.figures ?? {};
  d.onHorse = d.onHorse ?? {};
  return d;
}

/** Le galop se débloque avec une note d'au moins CANTER_UNLOCK au pas (ou s'il a déjà été fait). */
export const canterUnlocked = (p) => (vaultData(p).best.walk ?? 0) >= CANTER_UNLOCK || (vaultData(p).best.canter ?? 0) > 0;

/** Figures réussies (note ≥ 5) sur un vrai cheval (au pas ou au galop). */
export const figuresOnHorse = (p) => PROGRAM.filter((id) => (vaultData(p).onHorse[id] ?? 0) >= 5);

/**
 * Enregistre une séance : meilleures notes (programme et figures), figures réussies à cheval. Renvoie
 * { record (meilleure note à ce niveau), unlockedCanter (le galop vient de se débloquer), newFigures }.
 */
export function recordVault(p, level, result) {
  const d = vaultData(p);
  const wasCanter = canterUnlocked(p);
  const before = figuresOnHorse(p);
  d.sessions += 1;
  const record = result.score > (d.best[level] ?? 0);
  if (record) d.best[level] = result.score;
  for (const f of result.figures) {
    d.figures[f.id] = Math.max(d.figures[f.id] ?? 0, f.score);
    if (VAULT_LEVELS[level]?.horse) d.onHorse[f.id] = Math.max(d.onHorse[f.id] ?? 0, f.score);
  }
  const after = figuresOnHorse(p);
  return { record, unlockedCanter: !wasCanter && canterUnlocked(p), newFigures: after.filter((id) => !before.includes(id)) };
}

/**
 * Ce que la séance fait au cheval : un peu fatigué, il s'est dépensé, plus calme à la longe (obéissance), et
 * plus proche de toi. Renvoie les changements.
 */
export function vaultHorseEffect(a, level, quality = 0.5) {
  if (!a || !VAULT_LEVELS[level]?.horse) return null;
  const tired = level === 'canter' ? 14 : 8;
  const gain = 1 + (quality >= 0.7 ? 1 : 0);
  a.needs.energy = Math.max(0, a.needs.energy - tired);
  a.needs.exercise = Math.min(100, (a.needs.exercise ?? 0) + (level === 'canter' ? 30 : 18));
  a.needs.affection = Math.min(100, (a.needs.affection ?? 0) + 6);
  a.skills.obedience = Math.min(100, (a.skills.obedience ?? 10) + gain);
  a.bond = Math.min(100, (a.bond ?? 0) + 2);
  return { energy: -tired, obedience: gain };
}
