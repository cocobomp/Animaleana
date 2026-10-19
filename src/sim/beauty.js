// Concours de beauté : préparation de l'animal (toilette, tresses, rubans, lustrage…),
// note de beauté (0 à 100) et notes du juge pendant la présentation dans la carrière.
// Logique pure, sans 3D : testée dans tests/beauty.test.js.
// La discipline s'appelle 'beauty' dans le calendrier des concours (src/sim/activities.js).
// La 3D est dans src/game/Beauty.js, l'interface dans src/ui/beauty.js et src/ui/minigames/beauty.js.
//
// Ce que le juge regarde vient de l'animal VRAI : sa propreté (besoins hygiène et toilette),
// son humeur (bonheur : faim, soif, câlins…), sa santé, son poids, son lien avec toi et son
// obéissance. Un bain qui a été suivi d'une roulade dans la boue ne compte plus.
//
// Inscription : chaque animal concourt dans la classe de son espèce (chevaux, chiens, chats,
// petits animaux, animaux de la ferme), contre des concurrents de la même classe. On peut
// s'inscrire à l'avance (les frais sont payés à l'inscription) ; dans la sauvegarde :
//   profile.activities.beautyEntries = [{ compId, day, animalId, cls, presented, missed }]
//   (créé au besoin, comme le reste de profile.activities).

import { weightClass, happiness, lifeStage, NEEDS } from './animal.js';
import { NAMES } from './species.js';
import { seeded, pick } from './rng.js';
import { GEAR } from './gear.js';

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

/** Le bain et le brossage ne comptent que si l'animal est encore propre (vrais besoins). */
export const CLEAN_MIN = 60;
/**
 * Un bain (brossage) qui a rendu l'animal propre compte encore tant que la propreté réelle n'est pas
 * descendue de plus de DIRTY_DROP sous CLEAN_MIN : la petite baisse naturelle des heures suivantes ne
 * l'efface pas, une roulade dans la boue si (dirtiedSince).
 */
export const DIRTY_DROP = 15;
/** Un animal tout propre (soin normal juste fait) : le geste compte même sans le mini-jeu. */
export const SPOTLESS = 90;

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
  // Bain, brossage : la propreté réelle juste après le geste (pour savoir s'il s'est sali depuis).
  const need = REAL_NEED[item];
  if (need && Number.isFinite(a.needs?.[need])) entry.n = Math.floor(a.needs[need] * 10) / 10;
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

/** Le besoin réel qui dit si un geste « tient » encore (bain → hygiène, brossage → toilette). */
export const REAL_NEED = { wash: 'hygiene', brush: 'grooming' };

/** L'animal n'est pas assez propre (bain) ou démêlé (brossage) : propreté réelle sous CLEAN_MIN. */
export function undone(a, item) {
  const need = REAL_NEED[item];
  return !!need && (a.needs?.[need] ?? 100) < CLEAN_MIN;
}

/**
 * Le bain (brossage) avait rendu l'animal propre, mais il s'est sali (emmêlé) depuis : la propreté réelle est
 * passée sous CLEAN_MIN − DIRTY_DROP. Faux si le geste n'a jamais été fait, ou s'il n'avait pas suffi (encore
 * sale juste après : c'est « refais un bain », pas « il s'est sali depuis »).
 */
export function dirtiedSince(a, item) {
  const need = REAL_NEED[item];
  const e = a.beauty?.prep?.[item];
  if (!need || !e) return false;
  const v = a.needs?.[need] ?? 100;
  if (e.n == null) return v < CLEAN_MIN; // (geste noté par une ancienne version : comme avant)
  return e.n >= CLEAN_MIN && v < CLEAN_MIN - DIRTY_DROP;
}

/**
 * Le geste compte-t-il ? Frais ET (pour le bain et le brossage) l'animal est encore propre : propreté réelle
 * d'au moins CLEAN_MIN, ou geste qui l'avait rendu propre et pas sali depuis (dirtiedSince).
 * Il compte aussi s'il vient d'être fait par le soin normal : hygiène ou toilette presque au maximum.
 */
export function itemDone(a, item, now) {
  const need = REAL_NEED[item];
  const v = need ? a.needs?.[need] ?? 0 : 0;
  if (need && v >= SPOTLESS) return true;
  if (!isFresh(a, item, now)) return false;
  if (!need || v >= CLEAN_MIN) return true;
  const n = a.beauty?.prep?.[item]?.n;
  return n != null && n >= CLEAN_MIN && !dirtiedSince(a, item);
}

/** Qualité du mini-jeu (0 à 1) à partir de laquelle un bain ou un brossage de concours compte (★★). */
export const SHOW_CARE_MIN = 0.5;

/**
 * Toilette de concours : un bain (brossage) réussi depuis la liste de préparation rend l'animal assez propre
 * pour le juge, même s'il était tout sale : propreté réelle remontée à au moins CLEAN_MIN + 20 × qualité.
 * (Avant, un bain ★★★ sur un chien à 0 laissait 59,98 < 60 : « à refaire : elle s'est salie depuis ».)
 * Renvoie vrai si la propreté a été remontée.
 */
export function showCare(a, item, quality) {
  const need = REAL_NEED[item];
  if (!need || !a.needs || !(quality >= SHOW_CARE_MIN)) return false;
  const target = CLEAN_MIN + Math.round(20 * clamp(quality));
  if ((a.needs[need] ?? 0) >= target) return false;
  a.needs[need] = target;
  return true;
}

/**
 * Pourquoi le bain ou le brossage ne compte pas, côté saleté : 'dirtied' (il s'est sali depuis le geste),
 * 'tooDirty' (pas encore fait, ou pas suffi : encore trop sale) ou null (il compte, ou ce n'est pas une
 * question de saleté).
 */
export function dirtState(a, item, now) {
  if (!REAL_NEED[item] || itemDone(a, item, now)) return null;
  if (isFresh(a, item, now) && dirtiedSince(a, item)) return 'dirtied';
  return undone(a, item) ? 'tooDirty' : null;
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

/** La liste à cocher affichée : chaque geste avec son état (dirty : défait par la saleté réelle). */
export function checklist(a, now) {
  const c = checklistFor(a.species);
  const line = (item, required) => {
    const def = PREP_ITEMS[item];
    const left = freshness(a, item, now);
    const done = itemDone(a, item, now);
    const dirt = dirtState(a, item, now);
    const dirty = dirt === 'dirtied'; // fait, mais sali depuis : à refaire
    const tooDirty = dirt === 'tooDirty'; // encore trop sale (jamais lavé, ou bain trop léger)
    const old = !done && !dirty && !tooDirty && !!a.beauty?.prep?.[item];
    return { item, icon: def.icon, required, done, old, dirty, tooDirty, left: Math.round(left), color: a.beauty?.prep?.[item]?.color ?? null, pattern: a.beauty?.prep?.[item]?.pattern ?? null };
  };
  return [...c.required.map((i) => line(i, true)), ...c.bonus.map((i) => line(i, false))];
}

/** Tous les gestes requis sont faits : l'animal est prêt pour le concours. */
export const isReady = (a, now) => checklist(a, now).filter((l) => l.required).every((l) => l.done);

// ---------------------------------------------------------------- accessoires assortis (sellerie)

/** Famille de couleur d'un objet de la sellerie (src/sim/gear.js, COLORS) → couleur de ruban. */
const COLOR_FAMILY = { red: 'red', pink: 'pink', navy: 'blue', sky: 'blue', turquoise: 'blue', green: 'green', purple: 'purple', white: 'white', gold: 'yellow', silver: 'white' };
/** L'accessoire de présentation de chaque espèce : le licol (gros animaux) ou le collier. */
const ACCESSORY_SLOT = { horse: 'halter', cow: 'halter', goat: 'halter', dog: 'neck', cat: 'neck' };

export const colorFamily = (gearColor) => COLOR_FAMILY[gearColor] ?? null;

/** La couleur des rubans (tresses) ou du nœud de l'animal, s'il en porte un tout frais. */
export function ribbonColor(a, now) {
  for (const k of ['braid', 'bow']) if (isFresh(a, k, now) && a.beauty?.prep?.[k]?.color) return a.beauty.prep[k].color;
  return null;
}

/**
 * L'accessoire porté (licol, collier) et s'il va avec les rubans :
 * { slot, item, color, ribbon, matches, show, want } — want : la couleur de l'accessoire qui irait
 * avec les rubans (null si aucune ne va, ou pas de ruban). show : licol de présentation en cuir.
 * Renvoie null pour une espèce sans accessoire de présentation (lapin, mouton).
 */
export function accessoryInfo(a, now) {
  const slot = ACCESSORY_SLOT[a.species];
  if (!slot) return null;
  const worn = a.gear?.[slot] ?? null;
  const ribbon = ribbonColor(a, now);
  const item = worn?.item ?? null;
  const base = slot === 'halter' ? 'halter' : 'collar';
  // L'objet à remettre dans la bonne couleur : celui qu'il porte s'il existe dans cette couleur, sinon le modèle de base.
  const fits = (id) => (GEAR[id]?.colors ?? []).find((c) => colorFamily(c) === ribbon) ?? null;
  const target = item && fits(item) ? item : base;
  const want = ribbon ? fits(target) : null;
  return {
    slot,
    item,
    base,
    target,
    color: worn?.color ?? null,
    ribbon,
    matches: !!(worn && ribbon && colorFamily(worn.color) === ribbon),
    show: item === 'halterLeather',
    want,
  };
}

const WEIGHT_FACTOR = { ideal: 1, chubby: 0.8, thin: 0.7, fat: 0.55 };

/** Le besoin le plus bas (ce qui gâche l'humeur), ou null si tout va bien. */
export function lowestNeed(a) {
  let worst = null;
  for (const n of NEEDS) if (!worst || (a.needs?.[n] ?? 100) < (a.needs?.[worst] ?? 100)) worst = n;
  return worst && (a.needs?.[worst] ?? 100) < 50 ? worst : null;
}

/**
 * La note de beauté (0 à 100) et ses morceaux (chacun de 0 à 1) :
 * présentation (gestes de préparation, accessoires assortis), robe (hygiène + toilette réelles),
 * santé, poids, calme (lien + obéissance + humeur), allure (conformation, propre à l'animal)
 * et humeur (bonheur réel : faim, soif, câlins, énergie…).
 */
export function beautyScore(a, now) {
  const list = checklist(a, now);
  const req = list.filter((l) => l.required);
  const bonus = list.filter((l) => !l.required);
  const acc = accessoryInfo(a, now);
  const accBonus = (acc?.matches ? 0.08 : 0) + (acc?.show ? 0.04 : 0);
  const presentation = clamp(req.filter((l) => l.done).length / Math.max(1, req.length) + bonus.filter((l) => l.done).length * 0.08 + accBonus);
  const coat = clamp(((a.needs?.hygiene ?? 50) * 0.5 + (a.needs?.grooming ?? 50) * 0.5) / 100);
  const health = clamp((a.health ?? 100) / 100) * (a.sick ? 0.5 : 1);
  const weight = WEIGHT_FACTOR[weightClass(a)] ?? 1;
  const mood = a.needs ? clamp(happiness(a) / 100) : 0.7;
  const calm = clamp(0.35 + ((a.bond ?? 5) / 100) * 0.3 + ((a.skills?.obedience ?? 10) / 100) * 0.2 + mood * 0.15);
  const allure = (a.beauty?.allure ?? allureOf(a)) / 100;
  const parts = { presentation, coat, health, weight, calm, allure, mood };
  const score = Math.round(100 * (presentation * 0.33 + coat * 0.22 + allure * 0.13 + weight * 0.1 + calm * 0.08 + mood * 0.08 + health * 0.06));
  return { score: clamp(score, 0, 100), parts };
}

// ---------------------------------------------------------------- présentation dans la carrière

/** Les étapes de la présentation, selon l'espèce (les petits animaux sont portés jusqu'à la table). */
export function presentationSteps(species) {
  const led = species === 'horse' || species === 'dog';
  return led ? ['walk', 'halt', 'stand', 'turn', 'trot'] : ['walk', 'halt', 'stand', 'turn', 'pose'];
}

/** Taille de la zone verte des jauges de timing : un animal calme, heureux et attaché à toi aide. */
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

/** Chance qu'un animal peu calme (ou de mauvaise humeur) bouge pendant l'immobilité (par seconde). */
export const fidgetChance = (a) => clamp(0.25 - beautyScore(a, 0).parts.calm * 0.25, 0.01, 0.2);

/** Les quatre critères du juge, chacun sur 25. */
export const JUDGE_CRITERIA = ['presentation', 'condition', 'movement', 'behaviour'];

/**
 * Les notes du juge (chacune sur 25) et le total sur 100.
 * perf : { walk, halt, stand, turn, trot } (qualités de 0 à 1 ; trot = pose pour les petits animaux).
 * Renvoie { presentation, condition, movement, behaviour, points, stars, comment, need, matches }.
 * comment : ce qui a le plus manqué ('prep', 'dirty', 'presentation', 'weight', 'condition',
 * 'movement', 'mood', 'behaviour') ou 'perfect'. need : le besoin le plus bas (commentaire 'mood').
 */
export function judgeMarks(a, now, perf) {
  const { parts } = beautyScore(a, now);
  const q = (k) => clamp(perf[k] ?? 0);
  const presentation = 25 * (parts.presentation * 0.5 + parts.coat * 0.3 + parts.allure * 0.2);
  const condition = 25 * (parts.health * 0.4 + parts.weight * 0.4 + parts.coat * 0.2);
  const movement = 25 * (q('walk') * 0.5 + q('trot') * 0.5);
  const behaviour = 25 * (q('halt') * 0.4 + q('stand') * 0.4 + q('turn') * 0.2) * (0.5 + 0.3 * parts.calm + 0.2 * parts.mood);
  const marks = { presentation, condition, movement, behaviour };
  // Des notes entières (« 23 / 25 ») qui s'additionnent exactement : le total affiché est leur somme.
  for (const k of Object.keys(marks)) marks[k] = Math.round(marks[k]);
  const points = marks.presentation + marks.condition + marks.movement + marks.behaviour;
  const stars = points >= 80 ? 3 : points >= 55 ? 2 : 1;
  // Le commentaire du juge : ce qui a le plus manqué (ou un bravo).
  const lowest = Object.entries(marks).sort((x, y) => x[1] - y[1])[0];
  let comment = 'perfect';
  const need = lowestNeed(a);
  if (lowest[1] < 22) {
    comment = lowest[0];
    if (comment === 'presentation') comment = parts.presentation < 0.7 ? 'prep' : parts.coat < 0.6 ? 'dirty' : 'presentation';
    if (comment === 'condition' && parts.weight < 1) comment = 'weight';
    if (comment === 'behaviour' && parts.mood < 0.55) comment = 'mood';
  }
  return { ...marks, points, stars, comment, need, matches: !!accessoryInfo(a, now)?.matches };
}

// ---------------------------------------------------------------- classes et concurrents

/** Les classes du concours : chaque animal concourt avec ceux de son espèce (ou presque). */
export const BEAUTY_CLASSES = {
  horses: { emoji: '🐴', species: ['horse'] },
  dogs: { emoji: '🐶', species: ['dog'] },
  cats: { emoji: '🐱', species: ['cat'] },
  small: { emoji: '🐰', species: ['rabbit'] },
  farm: { emoji: '🐑', species: ['sheep', 'goat', 'cow'] },
};

/** La classe d'une espèce. */
export function classOf(species) {
  for (const [k, c] of Object.entries(BEAUTY_CLASSES)) if (c.species.includes(species)) return k;
  return 'farm';
}

/** Points d'un concurrent de concours de beauté (skill 0 à 1). Entre 40 et 95. */
export const rivalBeautyPoints = (skill, rng) => Math.round(40 + clamp(skill) * 45 + rng() * 10);

const HANDLERS = ['Margot', 'Théo', 'Jade', 'Arthur', 'Lou', 'Ethan', 'Nina', 'Raphaël', 'Anna', 'Malo',
  'Léna', 'Sami', 'Clara', 'Yanis', 'Elsa', 'Victor', 'Maëlle', 'Oscar', 'Ambre', 'Timéo'];

/**
 * Les concurrents d'une classe (toujours les mêmes pour un même concours et une même classe).
 * Leur niveau monte avec le niveau du concours (club, régional, grand prix).
 */
export function classRivals(comp, cls, count = 5) {
  const rng = seeded(`${comp.id}:beauty:${cls}`);
  const names = [...HANDLERS];
  const species = BEAUTY_CLASSES[cls]?.species ?? ['dog'];
  const out = [];
  for (let i = 0; i < count; i++) {
    const name = names.splice(Math.floor(rng() * names.length), 1)[0];
    const animal = pick(NAMES, rng);
    const skill = clamp(0.25 + (comp.level ?? 1) * 0.17 + (rng() - 0.5) * 0.4);
    out.push({ name, animal, species: pick(species, rng), cls, points: rivalBeautyPoints(skill, rng) });
  }
  return out;
}

// ---------------------------------------------------------------- inscription

/** Les inscriptions aux concours de beauté (créées au besoin dans profile.activities). */
export function beautyEntries(p) {
  p.activities = p.activities ?? {};
  p.activities.beautyEntries = p.activities.beautyEntries ?? [];
  return p.activities.beautyEntries;
}

export const entryFor = (p, compId, animalId) => beautyEntries(p).find((e) => e.compId === compId && e.animalId === animalId) ?? null;

/** Les inscriptions d'un concours (un animal par classe au plus). */
export const entriesOf = (p, compId) => beautyEntries(p).filter((e) => e.compId === compId);

/**
 * Peut-on inscrire cet animal à ce concours ? null si oui, sinon la raison :
 * 'over' (concours passé ou fermé), 'baby', 'already' (déjà inscrit), 'classTaken' (un autre
 * animal est déjà inscrit dans sa classe). ctx : { day, hour }.
 */
export function registerBlock(p, comp, a, ctx) {
  if (ctx.day > comp.day || (ctx.day === comp.day && ctx.hour >= comp.close)) return 'over';
  if (entryFor(p, comp.id, a.id)) return 'already';
  const cls = classOf(a.species);
  if (entriesOf(p, comp.id).some((e) => e.cls === cls)) return 'classTaken';
  if (lifeStage(a) === 'baby') return 'baby';
  return null;
}

/** Inscrit l'animal (les frais sont payés par l'appelant). Renvoie l'inscription. */
export function registerEntry(p, comp, a) {
  const e = { compId: comp.id, day: comp.day, level: comp.level, animalId: a.id, cls: classOf(a.species), presented: false, missed: false };
  beautyEntries(p).push(e);
  return e;
}

/**
 * Peut-on entrer dans la carrière pour ce concours maintenant ? null si oui, sinon :
 * 'notYet' (pas encore le jour ou l'heure), 'over', 'presented' (déjà présenté).
 */
export function ringBlock(p, comp, a, ctx) {
  const e = entryFor(p, comp.id, a.id);
  if (e?.presented) return 'presented';
  if (ctx.day < comp.day || (ctx.day === comp.day && ctx.hour < comp.open)) return 'notYet';
  if (ctx.day > comp.day || ctx.hour >= comp.close) return 'over';
  return null;
}

/** Le résultat de la présentation est gardé dans l'inscription. */
export function markPresented(p, comp, a, result) {
  const e = entryFor(p, comp.id, a.id) ?? registerEntry(p, comp, a);
  e.presented = true;
  e.points = result.points;
  e.rank = result.rank ?? null;
  return e;
}

/**
 * Inscriptions oubliées : concours passé sans présentation. Elles sont marquées (missed) et renvoyées
 * (une seule fois chacune), et les très vieilles inscriptions sont oubliées.
 */
export function missedEntries(p, day) {
  const list = beautyEntries(p);
  const out = [];
  for (const e of list) {
    if (!e.presented && !e.missed && day > e.day) {
      e.missed = true;
      out.push(e);
    }
  }
  p.activities.beautyEntries = list.filter((e) => day - e.day < 30);
  return out;
}

/** Les inscriptions du jour pas encore présentées (pour le rappel du matin). */
export const todaysEntries = (p, day) => beautyEntries(p).filter((e) => e.day === day && !e.presented);

// ---------------------------------------------------------------- récompenses

/** Écharpe « plus bel animal » : gagner la classe d'un concours avec au moins ce score. */
export const CHAMPION_POINTS = 88;
export const isChampion = (rank, points) => rank === 1 && points >= CHAMPION_POINTS;

/** XP du métier de handler pour une présentation (plus avec de bonnes notes et un podium). */
export const handlerXp = (stars, rank = null) => 6 + stars * 4 + (rank && rank <= 3 ? 10 : 0);
