// Activités : saut d'obstacles, balade, agility, spectacles et concours.
// Logique pure (parcours, chances de réussite, notes, classements, calendrier, récompenses),
// sans 3D : testée dans tests/activities.test.js. La partie 3D est dans src/game/Activities.js.

import { SPECIES } from './species.js';
import { happiness, lifeStage, canRide } from './animal.js';
import { wears, rideGear } from './gear.js';
import { seeded, pick, hashString } from './rng.js';
import { NAMES } from './species.js';

const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));

// ---------------------------------------------------------------- terrain de concours

/**
 * Terrain de concours (carrière de compétition) présent dans chaque lieu, à côté du paddock.
 * x, z : centre ; hw, hd : demi-largeur et demi-profondeur ; l'entrée est du côté +x.
 */
export const SHOWGROUND = { x: -52, z: 14, hw: 20, hd: 13, gate: { side: '+x', at: 14, width: 4 } };

/** Vrai si (x, z) est dans la carrière. */
export const inShowground = (x, z, margin = 0) =>
  Math.abs(x - SHOWGROUND.x) < SHOWGROUND.hw - margin && Math.abs(z - SHOWGROUND.z) < SHOWGROUND.hd - margin;

/**
 * Facteur d'aplanissement du terrain (0 = sol normal, 1 = tout plat) autour de la carrière
 * et de ses tribunes, avec une transition douce de 12 m.
 */
export function showgroundFlat(x, z) {
  const dx = Math.max(0, Math.abs(x - SHOWGROUND.x) - SHOWGROUND.hw - 7);
  const dz = Math.max(0, Math.abs(z - SHOWGROUND.z) - SHOWGROUND.hd - 7);
  const d = Math.hypot(dx, dz);
  const t = clamp(1 - d / 12);
  return t * t * (3 - 2 * t);
}

/** Coordonnées locales de la carrière → monde. */
export const toWorld = (p) => ({ x: SHOWGROUND.x + p.x, z: SHOWGROUND.z + p.z });

// Directions (cap à suivre pour franchir l'obstacle) : cap 0 = vers +z.
const W = -Math.PI / 2;
const E = Math.PI / 2;
const N = 0;
const S = Math.PI;

// ---------------------------------------------------------------- saut d'obstacles

export const JUMP_TYPES = ['poles', 'cavaletti', 'vertical', 'oxer', 'wall', 'cross', 'triple'];

/** Le parcours d'obstacles (7 obstacles + arrivée), en coordonnées locales de la carrière. */
export const JUMP_COURSE = {
  start: { x: 18.5, z: -9, heading: W },
  obstacles: [
    { n: 1, type: 'vertical', x: 7, z: -9, heading: W, height: 0.7, width: 3.6, colors: [0xd8402f, 0xffffff] },
    { n: 2, type: 'oxer', x: -6, z: -9, heading: W, height: 0.8, width: 3.6, colors: [0x2f6fd8, 0xffffff] },
    { n: 3, type: 'wall', x: -16, z: 0, heading: N, height: 0.8, width: 3.6, colors: [0xb5523a, 0xf2e6c8] },
    { n: 4, type: 'cross', x: -8, z: 9, heading: E, height: 0.6, width: 3.6, colors: [0xf2c230, 0x2a9a4a] },
    { n: 5, type: 'vertical', x: 2, z: 9, heading: E, height: 0.9, width: 3.6, colors: [0x9a45d8, 0xffffff] },
    { n: 6, type: 'oxer', x: 10, z: 9, heading: E, height: 0.9, width: 3.6, colors: [0xff8a1f, 0xffffff] },
    { n: 7, type: 'triple', x: 17, z: 0, heading: S, height: 0.9, width: 3.6, colors: [0x2fb8b0, 0xffffff] },
  ],
  finish: { x: 17, z: -6, heading: S, width: 6 },
};

/** Longueur approximative du parcours (m), en ligne droite d'un point au suivant. */
export function courseLength(course) {
  const pts = [course.start, ...course.obstacles, course.finish];
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return len;
}

/** Temps accordé (s) : au-delà, on a des pénalités de temps. */
export const parTime = (course, speed = 4.5) => Math.ceil(courseLength(course) / speed / 5) * 5 + 5;

/** Hauteur réelle d'un obstacle selon le niveau du concours (1 à 3). */
export const obstacleHeight = (o, level = 1) => Math.round((o.height + (level - 1) * 0.15) * 100) / 100;

/**
 * Position d'un point dans le repère d'un obstacle :
 * u = distance le long du sens de saut (négatif avant l'obstacle), v = écart sur le côté.
 */
export function approach(o, x, z) {
  const fx = Math.sin(o.heading);
  const fz = Math.cos(o.heading);
  const dx = x - o.x;
  const dz = z - o.z;
  return { u: dx * fx + dz * fz, v: dx * fz - dz * fx };
}

/** Alignement (0 à 1) entre le cap du cheval et le sens de saut. 1 = bien droit. */
export function alignment(o, heading) {
  const diff = Math.atan2(Math.sin(heading - o.heading), Math.cos(heading - o.heading));
  return clamp(1 - Math.abs(diff) / (Math.PI / 3));
}

/** Point d'appel idéal : à environ 1,8 m avant la barre. */
export const TAKEOFF = 1.8;

/** Qualité de l'appel (0 à 1) selon l'endroit où l'on demande le saut (u < 0). */
export const takeoffQuality = (u) => clamp(1 - Math.abs(-u - TAKEOFF) / 1.6);

/**
 * Chance de franchir l'obstacle sans faire tomber de barre.
 * skill : saut (0–100), height (m), align et timing (0–1), boots : guêtres, energy (0–100).
 */
export function jumpChance({ skill = 10, height = 0.8, align = 1, timing = 0.7, boots = false, energy = 80, obedience = 10 }) {
  // Ce qui compte, c'est la hauteur par rapport à ce que le cheval a appris à sauter.
  const over = Math.max(0, height - comfortHeight(skill));
  let p = 0.62 + (skill / 100) * 0.26 + (obedience / 100) * 0.07 - over * 1.1 - Math.max(0, height - 0.7) * 0.1;
  p *= 0.55 + 0.45 * align;
  p += (timing - 0.5) * 0.24;
  if (boots) p += 0.06;
  if (energy < 30) p -= 0.12;
  return clamp(p, 0.12, 0.97);
}

// ---------------------------------------------------------------- apprendre à sauter, pas à pas

/** Hauteur que le cheval saute sans peur (m) : elle grandit avec sa compétence de saut. */
export const comfortHeight = (skill = 10) => Math.round((0.2 + (skill / 100) * 1.0) * 100) / 100;

/**
 * Risque de refus (dérobade) quand l'obstacle est trop haut pour ce que le cheval a appris.
 * 0 tant que l'obstacle est à sa portée.
 */
export function refusalChance(skill, height) {
  const over = height - comfortHeight(skill);
  return over <= 0.05 ? 0 : clamp((over - 0.05) / 0.35) * 0.85;
}

/**
 * Niveaux de parcours : on commence par des barres au sol, puis des petites croix…
 * minSkill : compétence de saut conseillée pour débloquer le niveau.
 */
export const JUMP_STAGES = [
  { id: 'poles', minSkill: 0, types: ['poles', 'cavaletti'], heights: [0.12, 0.3] },
  { id: 'crosses', minSkill: 20, types: ['cross', 'cross', 'vertical'], heights: [0.4, 0.55] },
  { id: 'club', minSkill: 40, types: null, heights: null }, // le parcours de base (JUMP_COURSE)
  { id: 'grand', minSkill: 65, types: null, heights: [1.0, 1.2] },
];

/** Niveaux débloqués pour un cheval (indices de JUMP_STAGES). */
export const unlockedStages = (skill) => JUMP_STAGES.map((st, i) => (skill >= st.minSkill ? i : -1)).filter((i) => i >= 0);

/** Le niveau conseillé pour un cheval (le plus haut débloqué). */
export const stageFor = (skill) => Math.max(...unlockedStages(skill));

/** Niveau de parcours d'un concours : club → petites croix, régional → club, Grand Prix → grand. */
export const stageForLevel = (level) => Math.min(3, level);

/** Le parcours d'un niveau : mêmes emplacements, obstacles et hauteurs adaptés. */
export function courseForStage(stage) {
  const st = JUMP_STAGES[stage] ?? JUMP_STAGES[2];
  const n = JUMP_COURSE.obstacles.length;
  const obstacles = JUMP_COURSE.obstacles.map((o, i) => {
    if (!st.types && !st.heights) return { ...o };
    const [h0, h1] = st.heights;
    const type = st.types ? st.types[i % st.types.length] : o.type;
    return { ...o, type, height: Math.round((h0 + ((h1 - h0) * i) / (n - 1)) * 100) / 100 };
  });
  return { ...JUMP_COURSE, stage, obstacles };
}

/** Étapes de la leçon « Apprendre à sauter » : chaque réussite fait monter la barre. */
export const LESSON_STEPS = [
  { type: 'poles', height: 0.12 },
  { type: 'cavaletti', height: 0.3 },
  { type: 'cross', height: 0.45 },
  { type: 'cross', height: 0.6 },
  { type: 'vertical', height: 0.7 },
  { type: 'vertical', height: 0.85 },
  { type: 'oxer', height: 0.95 },
  { type: 'oxer', height: 1.1 },
  { type: 'triple', height: 1.2 },
];

export const LESSON_JUMPS = 6;

/** Étape de départ de la leçon : la plus haute que le cheval saute déjà sans peur, moins une. */
export function lessonStart(skill) {
  const c = comfortHeight(skill);
  let i = 0;
  while (i < LESSON_STEPS.length - 1 && LESSON_STEPS[i + 1].height <= c) i++;
  return Math.max(0, i - 1);
}

/** Gain de compétence après un saut de leçon réussi : plus la barre est à sa limite, plus il apprend. */
export function lessonGain(skill, height) {
  const margin = comfortHeight(skill) - height;
  return margin > 0.25 ? 1 : margin > 0 ? 2 : 3;
}

/** Résultat d'une leçon : étoiles selon les sauts réussis. */
export function lessonResult({ success, jumps, gained, step }) {
  const stars = success >= jumps - 1 ? 3 : success >= jumps / 2 ? 2 : 1;
  return { points: success, success, jumps, gained, step, stars, max: jumps };
}

/** Paramètres de saut d'un cheval (avec ses guêtres). */
export function horseJumpStats(a) {
  return { skill: a.skills.jump, obedience: a.skills.obedience, boots: wears(a, 'boots'), energy: a.needs.energy };
}

/** Le cheval refuse si on arrive de travers ou trop lentement. */
export const refuses = (align, speed) => align < 0.35 || speed < 1.6;

export const FAULTS = { rail: 4, refusal: 4, agility: 5 };

/** Pénalités de temps : 1 point par tranche de 4 secondes commencée au-delà du temps accordé. */
export const timeFaults = (time, par) => (time > par ? Math.ceil((time - par) / 4) : 0);

/**
 * Résultat d'un parcours de saut. Renvoie { faults, timePenalty, total, clear, stars }.
 * total = pénalités (barres + refus + temps) ; un « sans faute » = 0.
 */
export function jumpingResult({ rails = 0, refusals = 0, time, par }) {
  const timePenalty = timeFaults(time, par);
  const faults = rails * FAULTS.rail + refusals * FAULTS.refusal;
  const total = faults + timePenalty;
  const stars = total === 0 ? 3 : total <= 4 ? 2 : 1;
  return { faults, timePenalty, total, time: Math.round(time * 10) / 10, clear: total === 0, stars };
}

// ---------------------------------------------------------------- balade (trail)

/** Itinéraire de balade autour de la ferme (coordonnées monde). Arrivée à l'écurie. */
export const TRAIL = {
  start: { x: -15.5, z: -6 },
  checkpoints: [
    { x: -38, z: -24 },
    { x: -22, z: -56 },
    { x: 16, z: -62 },
    { x: 46, z: -30 },
    { x: 44, z: 18 },
    { x: 30, z: 64 },
    { x: -6, z: 50 },
    { x: 0, z: 10 },
    { x: -15.5, z: -2 }, // écurie
  ],
  // Points de vue à photographier
  sights: [
    { id: 'viewpoint', x: -30, z: -44 },
    { id: 'windmill', x: 34, z: -52 },
    { id: 'cairn', x: 50, z: 42 },
    { id: 'oldTree', x: 12, z: 66 },
  ],
};

/** Objets à ramasser le long de la balade (pommes, fleurs, fers à cheval), placés de façon reproductible. */
export function trailCollectibles(points, seed = 'trail', perLeg = 2) {
  const rng = seeded(seed);
  const out = [];
  const kinds = ['apple', 'flower', 'horseshoe', 'carrot'];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const b = points[i];
    for (let k = 0; k < perLeg; k++) {
      const t = (k + 1) / (perLeg + 1) + (rng() - 0.5) * 0.1;
      const side = (rng() - 0.5) * 6;
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      out.push({
        id: `c${i}-${k}`,
        kind: pick(kinds, rng),
        x: a.x + (b.x - a.x) * t + (-(b.z - a.z) / len) * side,
        z: a.z + (b.z - a.z) * t + ((b.x - a.x) / len) * side,
      });
    }
  }
  return out;
}

/**
 * Points d'une balade : chaque balise 10, objet 4, photo 8, et un bonus si l'on a pris son temps
 * sans traîner (ni trop vite pour le cheval, ni trop lent).
 */
export function trailResult({ checkpoints, totalCheckpoints, collected, totalCollectibles, photos, time }) {
  const base = checkpoints * 10 + collected * 4 + photos * 8;
  const max = totalCheckpoints * 10 + totalCollectibles * 4 + TRAIL.sights.length * 8;
  const pace = time < 60 ? 0.85 : time > 420 ? 0.9 : 1; // au galop tout le long, le cheval s'épuise
  const points = Math.round(base * pace);
  const ratio = points / max;
  const stars = ratio >= 0.8 ? 3 : ratio >= 0.5 ? 2 : 1;
  return { points, max, stars, time: Math.round(time) };
}

/** Gain d'endurance après une balade (selon les balises franchies). */
export const trailEnduranceGain = (checkpoints) => Math.round(2 + checkpoints * 0.6);

// ---------------------------------------------------------------- agility

export const AGILITY_TYPES = ['hurdle', 'tunnel', 'weave', 'seesaw', 'tyre'];

/** Parcours d'agility (coordonnées locales de la carrière). */
export const AGILITY_COURSE = {
  start: { x: 17, z: -6, heading: W },
  obstacles: [
    { n: 1, type: 'hurdle', x: 10, z: -6, heading: W },
    { n: 2, type: 'tunnel', x: 1, z: -6, heading: W },
    { n: 3, type: 'weave', x: -9, z: -6, heading: W },
    { n: 4, type: 'hurdle', x: -15, z: 2, heading: N },
    { n: 5, type: 'seesaw', x: -6, z: 7, heading: E },
    { n: 6, type: 'tyre', x: 4, z: 7, heading: E },
    { n: 7, type: 'hurdle', x: 12, z: 2, heading: S },
  ],
  finish: { x: 12, z: -3, heading: S, width: 4 },
};

/** Longueur de chaque obstacle d'agility (le chien le traverse sur cette distance). */
export const AGILITY_LENGTH = { hurdle: 0.6, tunnel: 4, weave: 4.6, seesaw: 4.2, tyre: 0.6 };

/** Quelle qualité d'animal compte pour chaque obstacle d'agility. */
const AGILITY_SKILL = { hurdle: 'jump', tyre: 'jump', tunnel: 'speed', weave: 'obedience', seesaw: 'obedience' };

/** Espèces qui font de l'agility. */
export const canDoAgility = (a) => SPECIES[a.species].training.includes('agility');

/** Qualité du commandement (0 à 1) selon le moment où l'on touche (phase 0→1, idéal vers 0.75). */
export const commandQuality = (phase) => clamp(1 - Math.abs(phase - 0.75) / 0.5);

/** Chance de réussir un obstacle d'agility sans faute. */
export function agilityChance(a, type, quality) {
  const skill = a.skills[AGILITY_SKILL[type]] ?? 10;
  if (type === 'tunnel') return 0.98;
  let p = 0.55 + (skill / 100) * 0.3 + (a.skills.obedience / 100) * 0.08 + (quality - 0.5) * 0.3;
  if (a.needs.energy < 30) p -= 0.1;
  return clamp(p, 0.15, 0.97);
}

/** Vitesse de course d'un animal sur le parcours (m/s). */
export function agilitySpeed(a) {
  const sp = SPECIES[a.species];
  const base = Math.max(3.2, sp.runSpeed);
  return base * (0.85 + (a.skills.speed ?? 10) / 300) * (a.needs.energy < 30 ? 0.8 : 1);
}

/** Résultat d'un parcours d'agility : 5 points par faute ou refus, + pénalités de temps. */
export function agilityResult({ faults = 0, refusals = 0, time, par }) {
  const timePenalty = time > par ? Math.ceil(time - par) : 0;
  const total = (faults + refusals) * FAULTS.agility + timePenalty;
  const stars = total === 0 ? 3 : total <= 5 ? 2 : 1;
  return { total, timePenalty, time: Math.round(time * 10) / 10, clear: total === 0, stars };
}

// ---------------------------------------------------------------- spectacles

/** Tours parfaitement appris (≥ 100 %) d'un animal. */
export const knownTricks = (a) => Object.entries(a.tricks ?? {}).filter(([, v]) => v >= 100).map(([k]) => k);

/** Taille de la zone verte du mini-jeu de timing (0 à 1 de la jauge) : un animal obéissant et heureux aide. */
export function trickWindow(a) {
  return clamp(0.14 + (a.skills.obedience / 100) * 0.16 + (happiness(a) / 100) * 0.08, 0.12, 0.4);
}

/** Note d'un tour (0 à 10) selon la qualité du timing (0 à 1). */
export const trickPoints = (quality) => Math.round(clamp(quality) * 8 + (quality > 0 ? 2 : 0));

export const MAX_ACTS = 5;

/**
 * Note d'un spectacle. acts : [{ animalId, trick, points }].
 * Bonus de variété : plusieurs animaux, plusieurs tours différents.
 * Renvoie { points, max, stars (1–5), applause (0–1) }.
 */
export function showResult(acts) {
  if (!acts.length) return { points: 0, max: 0, stars: 1, applause: 0, variety: 0 };
  const base = acts.reduce((s, x) => s + x.points, 0);
  const animals = new Set(acts.map((x) => x.animalId)).size;
  const tricks = new Set(acts.map((x) => x.trick)).size;
  const variety = (animals - 1) * 3 + (tricks - 1) * 1;
  const max = acts.length * 10 + (Math.min(acts.length, 3) - 1) * 3 + (acts.length - 1);
  const points = base + variety;
  const ratio = clamp(points / Math.max(1, max));
  // Un petit spectacle (1 ou 2 tours) ne peut pas avoir 5 étoiles.
  const cap = acts.length >= 3 ? 5 : acts.length === 2 ? 4 : 3;
  const stars = Math.min(cap, Math.max(1, Math.round(ratio * 5)));
  return { points, max, stars, applause: ratio, variety };
}

/** Spectateurs et recette d'un spectacle (mode gestion). */
export function showAudience(stars, acts, isHome = true) {
  const spectators = Math.round((isHome ? 14 : 22) + acts * 3 + stars * 4);
  return { spectators, earnings: Math.round(spectators * (1 + stars * 0.5)) };
}


// ---------------------------------------------------------------- lapins : saut d'obstacles (« lapin-hop ») et jeux au clapier

/** Petit parcours pour lapins : le lapin suit le joueur et saute les petites haies (coordonnées locales de la carrière). */
export const HOP_COURSE = {
  start: { x: 12, z: -2, heading: W },
  obstacles: [
    { n: 1, type: 'hurdle', x: 8, z: -2, heading: W },
    { n: 2, type: 'hurdle', x: 4, z: -2, heading: W },
    { n: 3, type: 'tunnel', x: -1, z: -2, heading: W },
    { n: 4, type: 'hurdle', x: -6, z: 0.8, heading: N },
    { n: 5, type: 'hurdle', x: -2, z: 3.5, heading: E },
    { n: 6, type: 'hurdle', x: 3, z: 3.5, heading: E },
  ],
  finish: { x: 8, z: 3.5, heading: E, width: 3 },
};

/** Les lapins font le lapin-hop. */
export const canHop = (a) => a.species === 'rabbit';

/** Chance qu'un lapin passe une petite haie sans la toucher. */
export function hopChance(a) {
  let p = 0.6 + (a.skills.jump / 100) * 0.3 + (a.skills.obedience / 100) * 0.05;
  if (a.needs.energy < 30) p -= 0.1;
  return clamp(p, 0.2, 0.96);
}

export const hopPar = () => Math.ceil(courseLength(HOP_COURSE) / 1.6 / 5) * 5 + 5;

/** Résultat du lapin-hop : 5 points par barre touchée, + temps. */
export function hopResult({ faults = 0, time, par }) {
  return agilityResult({ faults, time, par });
}

/**
 * Jouets de l'enclos du clapier (coordonnées relatives au centre de l'enclos grillagé).
 * effect : ce que le jeu apporte au lapin.
 */
export const HUTCH_TOYS = {
  wheel: { x: -1.7, z: 0.6, icon: '🎡', effect: { exercise: 30, energy: -10, affection: 4 } },
  tunnel: { x: 1.6, z: 0.2, icon: '🕳️', effect: { exercise: 18, affection: 8, energy: -5 } },
  ball: { x: 0.4, z: 1.2, icon: '⚽', effect: { exercise: 20, affection: 10, energy: -6 } },
  platform: { x: 1.9, z: 1.5, icon: '🪵', effect: { exercise: 12, affection: 6, energy: -3 } },
  hay: { x: -1.6, z: 1.7, icon: '🌾', effect: { hunger: 15, affection: 6 } },
};

/** Peut-on jouer maintenant ? (raison si non) */
export function hutchPlayBlock(a) {
  if (a.species !== 'rabbit') return 'notRabbit';
  if (a.sick) return 'sick';
  if (a.needs.energy < 12) return 'tired';
  return null;
}

/** Applique le jeu à un lapin. Renvoie les changements. */
export function hutchPlay(a, toyId) {
  const toy = HUTCH_TOYS[toyId];
  if (!toy) return { ok: false };
  for (const [k, v] of Object.entries(toy.effect)) a.needs[k] = Math.max(0, Math.min(100, a.needs[k] + v));
  if (toyId === 'wheel' || toyId === 'tunnel') a.skills.jump = Math.min(100, a.skills.jump + 0.5);
  if (toy.effect.exercise) a.weight = Math.max(0, (a.weight ?? 50) - 1);
  return { ok: true, effect: toy.effect };
}

// ---------------------------------------------------------------- concours

export const COMPETITION_TYPES = ['jumping', 'agility', 'show', 'trail'];
export const LEVELS = ['club', 'regional', 'grand'];

/** Frais d'inscription et prix (mode gestion), par niveau. */
const FEES = [10, 25, 45];
const PRIZES = [[80, 45, 25], [180, 100, 60], [350, 200, 120]];

/**
 * Concours prévus dans un lieu entre fromDay et fromDay + days − 1.
 * À la maison : un concours tous les 3 jours. En voyage : un tous les 2 jours (pour en profiter).
 */
export function competitionsAt(placeId, isHome, fromDay, days = 7) {
  const out = [];
  const h = hashString(placeId);
  for (let day = Math.max(1, fromDay); day < fromDay + days; day++) {
    const every = isHome ? 3 : 2;
    if ((day + (isHome ? 0 : h)) % every !== 0) continue;
    const k = Math.floor(day / every) + (isHome ? 0 : h);
    const type = COMPETITION_TYPES[k % COMPETITION_TYPES.length];
    const level = Math.min(3, 1 + Math.floor((day - 1) / 10) + (isHome ? 0 : (h % 2)));
    out.push(makeCompetition(placeId, day, type, level));
  }
  return out;
}

export function makeCompetition(placeId, day, type, level) {
  return {
    id: `${placeId}-${day}-${type}`,
    place: placeId,
    day,
    type,
    level,
    levelId: LEVELS[level - 1],
    fee: FEES[level - 1],
    prizes: PRIZES[level - 1],
    open: 9,
    close: 18,
  };
}

/** Peut-on s'inscrire maintenant ? Renvoie null si oui, sinon la raison. */
export function entryBlock(comp, { day, hour, entered = [] }) {
  if (entered.includes(comp.id)) return 'entered';
  if (day < comp.day) return 'notYet';
  if (day > comp.day) return 'over';
  if (hour < comp.open) return 'notYet';
  if (hour >= comp.close) return 'over';
  return null;
}

/** Quels animaux peuvent participer à ce type d'activité ? (raison si non) */
export function eligibility(a, type) {
  if (a.sick) return 'sick';
  if (lifeStage(a) === 'baby') return 'baby';
  if (a.needs.energy < 20) return 'tired';
  if (type === 'jumping' || type === 'trail') {
    if (!SPECIES[a.species].rideable) return 'notRideable';
    const r = canRide(a);
    if (!r.ok) return r.reason;
    if (!rideGear(a).ok) return 'needBridle';
    return null;
  }
  if (type === 'agility') return canDoAgility(a) ? null : 'noAgility';
  if (type === 'hop') return canHop(a) ? null : 'notRabbit';
  if (type === 'lesson') return eligibility(a, 'jumping');
  if (type === 'show') return knownTricks(a).length ? null : 'noTricks';
  return null;
}

const RIVAL_NAMES = ['Léa', 'Hugo', 'Emma', 'Lucas', 'Chloé', 'Nathan', 'Inès', 'Jules', 'Manon', 'Louis',
  'Zoé', 'Adam', 'Camille', 'Sacha', 'Lina', 'Tom', 'Alice', 'Noah', 'Rose', 'Gabriel', 'Mia', 'Eliott'];

const RIVAL_SPECIES = { jumping: ['horse'], trail: ['horse'], agility: ['dog', 'dog', 'dog', 'cat', 'rabbit'], show: ['dog', 'horse', 'cat', 'rabbit', 'goat'] };

/**
 * Concurrents générés (toujours les mêmes pour un même concours).
 * Pour le saut et l'agility : pénalités + temps ; pour le spectacle et la balade : des points.
 */
export function rivals(comp, count = 5) {
  const rng = seeded(comp.id);
  const names = [...RIVAL_NAMES];
  const out = [];
  const par = comp.type === 'jumping' ? parTime(JUMP_COURSE) : comp.type === 'agility' ? agilityPar() : 0;
  for (let i = 0; i < count; i++) {
    const name = names.splice(Math.floor(rng() * names.length), 1)[0];
    const animal = pick(NAMES, rng);
    const species = pick(RIVAL_SPECIES[comp.type], rng);
    // Le niveau des concurrents augmente avec le niveau du concours.
    const skill = clamp(0.25 + comp.level * 0.17 + (rng() - 0.5) * 0.4);
    const r = { name, animal, species };
    if (comp.type === 'jumping') {
      const rails = rng() < skill ? 0 : rng() < 0.6 ? 1 : 2;
      const refusals = rng() < 0.1 * (1 - skill) ? 1 : 0;
      const time = par * (1.05 - skill * 0.3 + rng() * 0.25);
      Object.assign(r, jumpingResult({ rails, refusals, time, par }));
    } else if (comp.type === 'agility') {
      const faults = rng() < skill ? 0 : rng() < 0.6 ? 1 : 2;
      const time = par * (1.05 - skill * 0.3 + rng() * 0.25);
      Object.assign(r, agilityResult({ faults, time, par }));
    } else if (comp.type === 'show') {
      r.points = Math.round(14 + skill * 34 + rng() * 6);
    } else {
      r.points = Math.round(60 + skill * 75 + rng() * 15);
    }
    out.push(r);
  }
  return out;
}

/** Temps accordé du parcours d'agility. */
export const agilityPar = () => Math.ceil(courseLength(AGILITY_COURSE) / 4 / 5) * 5 + 5;

/** Les points ou pénalités font le classement : moins de pénalités puis meilleur temps, ou plus de points. */
export function compareResults(type) {
  if (type === 'jumping' || type === 'agility' || type === 'hop') return (a, b) => a.total - b.total || a.time - b.time;
  return (a, b) => b.points - a.points;
}

/** Classement final avec le joueur (you: true). Renvoie { table, rank } (rank commence à 1). */
export function ranking(comp, playerResult, rivalList = rivals(comp)) {
  const me = { ...playerResult, you: true };
  const table = [...rivalList, me].sort(compareResults(comp.type));
  table.forEach((r, i) => { r.rank = i + 1; });
  return { table, rank: me.rank };
}

/** Récompense selon la place : coupe pour le podium, flot (rosette) pour 4ᵉ–6ᵉ. */
export function placementAward(comp, rank) {
  if (rank <= 3) {
    return { kind: 'trophy', tier: ['gold', 'silver', 'bronze'][rank - 1], money: comp.prizes[rank - 1] };
  }
  return { kind: 'ribbon', tier: rank === 4 ? 'green' : rank === 5 ? 'white' : 'pink', money: 0 };
}

/** Flot gagné à l'entraînement (sans concours) selon le nombre d'étoiles. */
export function practiceAward(type, stars, maxStars = 3) {
  if (stars < maxStars - (type === 'show' ? 1 : 0)) return null;
  const tier = { jumping: 'blue', agility: 'yellow', trail: 'green', show: 'purple', hop: 'pink', lesson: 'white' }[type];
  return { kind: 'ribbon', tier, money: 0 };
}

// ---------------------------------------------------------------- profil

/** Données des activités dans le profil (créées au besoin, sans changer le format de sauvegarde). */
export function activityData(p) {
  p.activities = p.activities ?? {};
  const d = p.activities;
  d.awards = d.awards ?? [];
  d.photos = d.photos ?? [];
  d.entered = d.entered ?? [];
  d.best = d.best ?? {};
  return d;
}

/** Ajoute une récompense à l'étagère. */
export function addAward(p, award, info) {
  const d = activityData(p);
  const entry = { ...award, ...info };
  delete entry.money;
  d.awards.push(entry);
  return entry;
}

/** Garde le meilleur résultat par activité (et par animal). Renvoie true si c'est un record. */
export function recordBest(p, type, animalId, result) {
  const d = activityData(p);
  const key = `${type}:${animalId}`;
  const old = d.best[key];
  const better = !old || compareResults(type)(result, old) < 0;
  if (better) d.best[key] = { total: result.total, time: result.time, points: result.points };
  return better;
}

/** Nombre de récompenses par sorte, pour l'étagère et les succès. */
export function awardCounts(p) {
  const d = activityData(p);
  const c = { gold: 0, silver: 0, bronze: 0, ribbons: 0, trophies: 0 };
  for (const a of d.awards) {
    if (a.kind === 'trophy') {
      c.trophies++;
      c[a.tier]++;
    } else c.ribbons++;
  }
  return c;
}

/** Gains de compétences après une activité (appliqués à l'animal). Renvoie les gains. */
export function activitySkillGain(a, type, quality = 0.5) {
  const gains = {
    jumping: { jump: 1 + Math.round(quality * 2), obedience: 1 },
    agility: { jump: 1 + Math.round(quality), obedience: 1 + Math.round(quality), speed: 1 },
    trail: { endurance: 0 },
    show: { obedience: 1 },
    hop: { jump: 1 + Math.round(quality * 2), obedience: 1 },
    lesson: { obedience: 1 },
  }[type] ?? {};
  for (const [k, v] of Object.entries(gains)) a.skills[k] = Math.min(100, (a.skills[k] ?? 0) + v);
  const tired = { jumping: 14, agility: 12, trail: 18, show: 6, hop: 8, lesson: 12 }[type] ?? 8;
  a.needs.energy = Math.max(0, a.needs.energy - tired);
  a.needs.exercise = Math.min(100, a.needs.exercise + ({ jumping: 30, agility: 30, trail: 40, show: 10, hop: 25, lesson: 25 }[type] ?? 15));
  a.needs.affection = Math.min(100, a.needs.affection + 8);
  return gains;
}
