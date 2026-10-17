// Dressage des chevaux : rectangle de dressage (lettres A-K-E-H-C-M-B-F), allures, figures,
// reprises (suite de figures notées par le juge à C) et séances d'entraînement (plat, figures).
// Logique pure, sans 3D : testée dans tests/dressage.test.js. La partie 3D est dans src/game/Dressage.js.

import { seeded } from './rng.js';
import { tackEffects } from './gear.js'; // selle et bride de dressage : un peu plus de brillance

const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));

// ---------------------------------------------------------------- le rectangle et ses lettres

/**
 * Rectangle de dressage dessiné dans la carrière (coordonnées locales de la carrière, voir SHOWGROUND).
 * Un vrai rectangle fait 20 × 40 m ; ici 18 × 36 m pour laisser la place aux lices.
 * A est du côté de l'entrée (+x), C (le juge) en face.
 */
export const ARENA = { hl: 18, hw: 9 };

export const LETTERS = {
  A: { x: 18, z: 0 }, K: { x: 12, z: -9 }, E: { x: 0, z: -9 }, H: { x: -12, z: -9 },
  C: { x: -18, z: 0 }, M: { x: -12, z: 9 }, B: { x: 0, z: 9 }, F: { x: 12, z: 9 },
  // Lettres de la ligne du milieu (pas de pancarte)
  D: { x: 12, z: 0 }, X: { x: 0, z: 0 }, G: { x: -12, z: 0 },
};

/** Les lettres affichées sur des pancartes autour du rectangle, dans l'ordre de la piste. */
export const RAIL_LETTERS = ['A', 'K', 'E', 'H', 'C', 'M', 'B', 'F'];

// ---------------------------------------------------------------- allures

/**
 * Vitesse maximale de chaque allure (m/s) : on plafonne la vitesse du cheval monté.
 * Les seuils suivent l'animation du cheval (AnimalEntity.animateHorse / animateGltf) : trot au-delà de
 * 1,45 × la vitesse de marche (≈ 2,3 m/s), galop au-delà de 0,65 × la vitesse de course (≈ 3,25 m/s).
 * Ainsi l'allure affichée est bien celle que l'on voit.
 */
export const GAITS = {
  halt: { speed: 0, icon: '🛑' },
  walk: { speed: 1.8, icon: '🚶' },
  trot: { speed: 2.9, icon: '🏃' },
  canter: { speed: 5.0, icon: '🐎' },
};
export const GAIT_ORDER = ['walk', 'trot', 'canter'];

/** L'allure observée d'après la vitesse réelle. */
export function gaitOf(speed) {
  if (speed < 0.35) return 'halt';
  if (speed < 2.35) return 'walk';
  if (speed < 3.3) return 'trot';
  return 'canter';
}

/** L'allure suivante quand on appuie sur le bouton (pas → trot → galop → pas). */
export const nextGait = (g) => GAIT_ORDER[(GAIT_ORDER.indexOf(g) + 1) % GAIT_ORDER.length];

// ---------------------------------------------------------------- tracés

const P = (l) => (typeof l === 'string' ? LETTERS[l] : l);
const short = (p) => Math.abs(p.x) >= ARENA.hl - 0.01; // sur un petit côté (A ou C)
const long = (p) => Math.abs(p.z) >= ARENA.hw - 0.01; // sur un grand côté

/**
 * Tracé passant par des lettres (ou des points {x, z}). Entre une lettre d'un petit côté
 * et une lettre d'un grand côté, on ajoute le coin arrondi (le cheval ne va pas dans l'angle).
 */
export function letterPath(list) {
  const pts = [];
  for (let i = 0; i < list.length; i++) {
    const p = P(list[i]);
    const prev = pts[pts.length - 1];
    if (prev && ((short(prev) && long(p)) || (long(prev) && short(p)))) {
      const s = short(prev) ? prev : p;
      const l = short(prev) ? p : prev;
      pts.push({ x: Math.sign(s.x) * (ARENA.hl - 2), z: Math.sign(l.z) * (ARENA.hw - 2) });
    }
    pts.push({ x: p.x, z: p.z });
  }
  return pts;
}

/** Cercle (points) de centre c et rayon r, à partir de l'angle a0, dans le sens dir (+1 / −1). */
export function circlePath(c, r, a0, dir = 1, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + dir * (i / n) * Math.PI * 2;
    pts.push({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r });
  }
  return pts;
}

/** Serpentine de `loops` boucles d'un petit côté à l'autre (de A vers C si fromA). */
export function serpentinePath(loops = 3, fromA = true, n = 36) {
  const pts = [];
  const x0 = ARENA.hl - 2;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = (fromA ? 1 : -1) * (x0 - 2 * x0 * u);
    pts.push({ x, z: Math.sin(u * Math.PI * loops) * (ARENA.hw - 1) });
  }
  return pts;
}

/** Longueur d'un tracé et longueurs cumulées. */
export function pathLengths(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { total: cum[cum.length - 1], cum };
}

/** Distance d'un point à un segment, et position (0–1) du point le plus proche sur le segment. */
function segNearest(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz || 1;
  const u = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / len2);
  return { u, d: Math.hypot(p.x - (a.x + dx * u), p.z - (a.z + dz * u)) };
}

/**
 * Où en est-on sur le tracé ? On avance seulement vers l'avant (fenêtre autour de la progression
 * précédente), ce qui évite qu'un cercle soit « fini » dès le départ. prog : mètres parcourus.
 * Renvoie { prog, dist } (dist = écart au tracé, en m).
 */
export function pathProgress(pts, lengths, p, prevProg = 0, ahead = 8, behind = 3) {
  let best = { prog: prevProg, dist: Infinity };
  for (let i = 1; i < pts.length; i++) {
    const s0 = lengths.cum[i - 1];
    const s1 = lengths.cum[i];
    if (s1 < prevProg - behind || s0 > prevProg + ahead) continue;
    const { u, d } = segNearest(p, pts[i - 1], pts[i]);
    const prog = s0 + (s1 - s0) * u;
    if (prog < prevProg - behind) continue;
    if (d < best.dist) best = { prog, dist: d };
  }
  if (best.dist === Infinity) {
    // Loin devant la fenêtre : on garde la progression et on mesure l'écart au point attendu.
    const i = Math.max(1, lengths.cum.findIndex((c) => c >= prevProg));
    best = { prog: prevProg, dist: segNearest(p, pts[i - 1], pts[i]).d };
  }
  return best;
}

// ---------------------------------------------------------------- figures et reprises

const X = LETTERS.X;
const circleE = () => circlePath(X, ARENA.hw, -Math.PI / 2, 1);
const circleB = () => circlePath(X, ARENA.hw, Math.PI / 2, -1);
const smallCircleB = () => circlePath({ x: 0, z: ARENA.hw - 5 }, 5, Math.PI / 2, -1, 20);

/**
 * Les figures : id (texte dr_fig_<id>), kind ('path' : suivre le tracé à l'allure demandée,
 * 'halt' : s'arrêter au point, 'haltBack' : s'arrêter puis reculer), gait, pts ou at.
 */
const FIGURES = {
  enter: () => ({ kind: 'path', gait: 'trot', pts: letterPath(['A', 'X']) }),
  halt: () => ({ kind: 'halt', gait: 'halt', at: X }),
  haltBack: () => ({ kind: 'haltBack', gait: 'halt', at: X }),
  trackLeft: () => ({ kind: 'path', gait: 'trot', pts: [X, { x: -15, z: 0 }, { x: -16, z: -6 }, LETTERS.H, LETTERS.E] }),
  circleE: () => ({ kind: 'path', gait: 'trot', pts: circleE() }),
  diagonalWalk: () => ({ kind: 'path', gait: 'walk', pts: letterPath(['E', 'K', 'X', 'M']) }),
  canterTrack: () => ({ kind: 'path', gait: 'canter', pts: letterPath(['M', 'C', 'H', 'E', 'K', 'A']) }),
  final: () => ({ kind: 'path', gait: 'trot', pts: letterPath(['A', 'X']) }),
  serpentine: () => ({ kind: 'path', gait: 'trot', pts: [...letterPath(['E', 'K', 'A']), ...serpentinePath(3, true).slice(1), LETTERS.C] }),
  canterRight: () => ({ kind: 'path', gait: 'canter', pts: letterPath(['C', 'M', 'B']) }),
  circleB: () => ({ kind: 'path', gait: 'canter', pts: circleB() }),
  smallCircleB: () => ({ kind: 'path', gait: 'canter', pts: smallCircleB() }),
  diagonalFH: () => ({ kind: 'path', gait: 'walk', pts: letterPath(['B', 'F', 'X', 'H']) }),
  diagonalCanter: () => ({ kind: 'path', gait: 'canter', pts: letterPath(['B', 'F', 'X', 'H']) }),
  centreLine: () => ({ kind: 'path', gait: 'trot', pts: [LETTERS.H, { x: -16, z: -6 }, { x: -16, z: 0 }, LETTERS.G, X] }),
  centreWalk: () => ({ kind: 'path', gait: 'walk', pts: [LETTERS.H, { x: -16, z: -6 }, { x: -16, z: 0 }, LETTERS.G, X] }),
  // entraînement
  walkTrack: () => ({ kind: 'path', gait: 'walk', pts: letterPath(['A', 'K', 'E', 'H', 'C']) }),
  trotTrack: () => ({ kind: 'path', gait: 'trot', pts: letterPath(['C', 'M', 'B', 'F', 'A']) }),
};

export const FIGURE_IDS = Object.keys(FIGURES);

/** Les reprises par niveau de concours (1 = club, 2 = régional, 3 = Grand Prix) et celle de l'entraînement. */
export const REPRISES = {
  training: ['walkTrack', 'trotTrack', 'enter', 'halt', 'circleE'],
  1: ['enter', 'halt', 'trackLeft', 'circleE', 'diagonalWalk', 'canterTrack', 'final', 'halt'],
  2: ['enter', 'halt', 'trackLeft', 'circleE', 'serpentine', 'canterRight', 'circleB', 'diagonalFH', 'centreLine', 'halt'],
  3: ['enter', 'halt', 'trackLeft', 'circleE', 'serpentine', 'canterRight', 'smallCircleB', 'diagonalCanter', 'centreWalk', 'haltBack'],
};

/** Durée attendue d'une figure (s) : la longueur à l'allure demandée, avec un peu de marge. */
export function expectedDuration(fig) {
  if (fig.kind !== 'path') return 6;
  const { total } = pathLengths(fig.pts);
  return total / GAITS[fig.gait].speed * 1.15 + 1.5;
}

/** Construit la reprise (liste de figures prêtes à jouer) d'un niveau. */
export function repriseFor(level = 1) {
  const ids = REPRISES[level] ?? REPRISES[1];
  return ids.map((id, i) => {
    const f = FIGURES[id]();
    const lengths = f.kind === 'path' ? pathLengths(f.pts) : null;
    return { id, n: i + 1, ...f, lengths, expected: expectedDuration(f) };
  });
}

/** Le dernier point d'une figure (là où va la flèche). */
export const figureEnd = (fig) => (fig.kind === 'path' ? fig.pts[fig.pts.length - 1] : fig.at);

// ---------------------------------------------------------------- notes du juge

const half = (v) => Math.round(clamp(v, 0, 10) * 2) / 2;

/**
 * Note d'une figure (0 à 10, par demi-points) :
 * précision (écart moyen au tracé), allure (part du temps à la bonne allure), calme (changements
 * d'allure inutiles), rythme (durée par rapport à l'attendu) et brillance (dressage du cheval).
 */
export function figureMark({ meanDist = 0, gaitRatio = 1, changes = 0, duration = 0, expected = 10, skill = 10 }) {
  const precision = 4 * clamp(1 - (meanDist - 0.6) / 2.4);
  const gait = 3 * clamp(gaitRatio);
  const calm = 2 * clamp(1 - Math.max(0, changes - 1) / 3);
  const ratio = expected > 0 ? duration / expected : 1;
  const timing = 1 * clamp(1 - Math.abs(ratio - 1) / 0.8);
  const brilliance = clamp(skill / 100);
  return half(precision + gait + calm + timing + brilliance);
}

/** Note d'un arrêt : au bon endroit, vite immobile, sans bouger. */
export function haltMark({ dist = 0, settle = 0, moved = 0, skill = 10 }) {
  const place = 5 * clamp(1 - (dist - 0.8) / 2.5);
  const quick = 3 * clamp(1 - Math.max(0, settle - 3) / 6);
  const still = 2 * clamp(1 - moved / 1.5);
  return half(place + quick + still + clamp(skill / 100) * 0.5);
}

/** Note d'un reculer : on était bien arrêté avant, et on n'a pas traîné. */
export function reinBackMark({ halted = true, dist = 0, wait = 0, skill = 10 }) {
  const base = halted ? 7 : 4;
  const place = 2 * clamp(1 - (dist - 0.8) / 2.5);
  const quick = clamp(1 - Math.max(0, wait - 5) / 6);
  return half(base + place + quick + clamp(skill / 100) * 0.5);
}

/** Le petit mot du juge (clé dr_say_<id>) selon la note et ce qui a péché. */
export function judgeComment(mark, { gaitRatio = 1, meanDist = 0, changes = 0 } = {}) {
  if (mark >= 9) return 'brilliant';
  if (gaitRatio < 0.5) return 'wrongGait';
  if (meanDist > 2) return 'offPath';
  if (changes >= 3) return 'rushed';
  if (mark >= 7) return 'good';
  if (mark >= 5) return 'ok';
  if (mark >= 3) return 'meh';
  return 'oops';
}

/**
 * Résultat d'une reprise. marks : [{ n, id, mark, comment }].
 * Renvoie { points (= pourcentage, pour le classement), percent, stars, marks, best, worst }.
 */
export function repriseResult(marks) {
  if (!marks.length) return { points: 0, percent: 0, stars: 1, marks: [], best: null, worst: null };
  const mean = marks.reduce((s, m) => s + m.mark, 0) / marks.length;
  const percent = Math.round(mean * 100) / 10;
  const stars = percent >= 70 ? 3 : percent >= 58 ? 2 : 1;
  const sorted = [...marks].sort((a, b) => b.mark - a.mark);
  return { points: percent, percent, stars, marks, best: sorted[0], worst: sorted[sorted.length - 1] };
}

/** Compétence de dressage d'un cheval (les anciens chevaux n'en avaient pas encore). */
export const dressageSkill = (a) => a.skills?.dressage ?? 10;

/**
 * Bonus de l'équipement aux yeux du juge (en points de compétence) : la selle de dressage (+4) et la bride
 * de dressage (+5) aident le cheval à se tenir ; le hackamore (sans mors) un peu moins (−2). Voir GEAR.fx.tricks.
 */
export const dressageTackBonus = (a) => Math.round(tackEffects(a).tricks * 100);

/** Compétence utilisée pour la brillance des notes : dressage du cheval + équipement. */
export const judgedSkill = (a) => Math.max(0, Math.min(100, dressageSkill(a) + dressageTackBonus(a)));

// ---------------------------------------------------------------- entraînement

export const TRAINING_TYPES = ['flat', 'figures', 'lesson'];
/** On ne progresse qu'une fois par heure de jeu, par cheval et par type de séance. */
export const TRAIN_COOLDOWN_MIN = 60;

/**
 * Un cheval fatigué, stressé ou qui ne nous connaît pas bien apprend moins.
 * Renvoie { factor (0,25 à 1), reasons: ['tired', 'stressed', 'lowBond'] }.
 */
export function learnFactor(a) {
  let factor = 1;
  const reasons = [];
  if ((a.needs?.energy ?? 100) < 40) { factor *= 0.5; reasons.push('tired'); }
  if ((a.stress ?? 0) >= 50) { factor *= 0.6; reasons.push('stressed'); }
  if ((a.bond ?? 0) < 35) { factor *= 0.7; reasons.push('lowBond'); }
  return { factor: Math.max(0.25, Math.round(factor * 100) / 100), reasons };
}

/** Minutes à attendre avant de pouvoir refaire cette séance avec ce cheval (0 si c'est possible). */
export function cooldownLeft(a, type, clock) {
  const last = a.trainedAt?.[type];
  if (last === undefined) return 0;
  return Math.max(0, Math.ceil(TRAIN_COOLDOWN_MIN - (clock - last)));
}

/** Pourquoi on ne peut pas s'entraîner maintenant ('cooldown'), ou null. */
export const trainingBlock = (a, type, clock) => (cooldownLeft(a, type, clock) > 0 ? 'cooldown' : null);

/** Points gagnés : 2 à 6 selon la qualité de la séance, réduits par le facteur d'apprentissage. */
export function trainingGain(a, quality) {
  const { factor, reasons } = learnFactor(a);
  const raw = 2 + Math.round(clamp(quality) * 4);
  return { gain: Math.round(raw * factor * 10) / 10, raw, factor, reasons };
}

/**
 * Applique une séance d'entraînement à un cheval : compétence de dressage (et un peu d'obéissance),
 * fatigue, et l'heure de la séance (pour l'attente d'une heure). Renvoie le détail des gains.
 */
export function applyTraining(a, type, quality, clock) {
  const r = trainingGain(a, quality);
  a.skills.dressage = Math.min(100, dressageSkill(a) + r.gain);
  if (type === 'flat') a.skills.obedience = Math.min(100, (a.skills.obedience ?? 10) + 1);
  a.trainedAt = { ...(a.trainedAt ?? {}), [type]: clock };
  return { ...r, type, skill: Math.round(a.skills.dressage * 10) / 10 };
}

// ---------------------------------------------------------------- séance de plat (transitions)

/** Fenêtre (s) après l'annonce pour changer d'allure. */
export const CUE_WINDOW = 1.8;

/**
 * La suite des transitions d'une séance de plat : [{ gait, at (s) }], toujours la même pour une graine.
 * On commence au pas ; ensuite, une nouvelle allure toutes les 6 à 9 secondes.
 */
export function flatSequence(count = 8, seed = 'flat') {
  const rng = seeded(seed);
  const out = [{ gait: 'walk', at: 0 }];
  let t = 5;
  let gait = 'walk';
  for (let i = 0; i < count; i++) {
    const choices = GAIT_ORDER.filter((g) => g !== gait);
    gait = choices[Math.floor(rng() * choices.length)];
    t += 6 + Math.floor(rng() * 4);
    out.push({ gait, at: t });
  }
  return out;
}

/** Qualité d'une transition selon le retard (s) : tout de suite = 1, trop tard = 0, en avance = 0,3. */
export function transitionQuality(delay) {
  if (delay < 0) return 0.3;
  if (delay <= 0.6) return 1;
  return clamp(1 - (delay - 0.6) / (CUE_WINDOW - 0.6));
}

/** Résultat d'une séance de plat : qualités des transitions et temps passé hors de la piste. */
export function flatResult(qualities, offTrack = 0, total = 0) {
  const n = Math.max(1, qualities.length);
  const mean = qualities.reduce((s, q) => s + q, 0) / n;
  const track = total > 0 ? clamp(1 - offTrack / total) : 1;
  const quality = clamp(mean * 0.8 + track * 0.2);
  const points = Math.round(quality * 100);
  const stars = points >= 75 ? 3 : points >= 50 ? 2 : 1;
  return { points, max: 100, stars, quality, transitions: qualities.length };
}

/** La piste du tour de carrière (pour la séance de plat) : le tour du rectangle, coins arrondis. */
export const RAIL_LOOP = () => letterPath(['A', 'K', 'E', 'H', 'C', 'M', 'B', 'F', 'A']);
