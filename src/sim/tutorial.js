// Tutoriel guidé pour les enfants + aide pour les quêtes (quoi faire, et où).
// Logique pure, sans 3D ni DOM : l'interface (src/ui/tutorial.js) fournit un « contexte »
// (le joueur a-t-il marché ? le refuge est-il ouvert ?…) et les événements du jeu.

import { objectiveShown } from './objectives.js'; // quêtes cachées tant que leur espèce n'est pas proposée
import { levelOf } from './progress.js';
import { PLACES, PLACE_IDS, TRAVEL_MODES, checkTravel } from './places.js'; // le voyage le moins cher (quête du voyage)
import { POOPS_PER_DAY } from './droppings.js'; // qui fait des crottins (quête « ramasser »)
import { SPECIES } from './species.js';
import { ageYears, BOND_FOR_TRICKS } from './animal.js'; // monter un cheval adulte ; le lien qu'il faut pour un tour
import { wears, hasFreeHeadgear } from './gear.js'; // filet ou licol pour monter
import { STRUCTURES } from './construction.js'; // prix du salon de toilettage

const stat = (p, k) => p.stats?.[k] ?? 0;

/**
 * Étapes du tutoriel, dans l'ordre.
 * - target : ce qu'il faut montrer (bâtiment, animal, bouton du haut, bouton d'un menu…)
 * - skip(c) : étape inutile dans cette situation (on passe à la suivante)
 * - done(c) : l'étape est réussie
 * - manual : l'étape se termine avec le bouton « OK » de la bulle
 * c = { profile, tuto, base, seen, flags, moved, refugeOpen, animals, full }
 */
export const TUTORIAL_STEPS = [
  { id: 'welcome', emoji: '👋', manual: true },
  { id: 'move', emoji: '👣', done: (c) => c.moved >= 3 },
  {
    id: 'refuge', emoji: '🐾', target: { type: 'building', id: 'refuge' },
    skip: (c) => c.animals > 0,
    done: (c) => c.seen.has('building:refuge') || c.seen.has('panel:adoption'),
  },
  {
    // Le refuge ouvre à 9 h : on apprend le bouton ⏩ pour attendre.
    id: 'wait', emoji: '⏩', target: { type: 'hud', id: 'timeFast' },
    skip: (c) => c.animals > 0 || c.refugeOpen,
    done: (c) => c.refugeOpen,
  },
  {
    id: 'adopt', emoji: '🐶', target: { type: 'adopt' },
    skip: (c) => (c.base.animals ?? 0) > 0, // déjà des animaux (tutoriel rejoué)
    done: (c) => stat(c.profile, 'adopted') > (c.base.adopted ?? 0),
  },
  {
    id: 'tapAnimal', emoji: '👆', target: { type: 'animal' },
    skip: (c) => c.animals === 0,
    done: (c) => c.seen.has('animalActions'),
  },
  {
    id: 'feed', emoji: '🍖', target: { type: 'action', id: 'feed' },
    skip: (c) => c.animals === 0,
    done: (c) => stat(c.profile, 'feed') > (c.base.feed ?? 0) || c.full.hunger,
  },
  {
    id: 'pet', emoji: '❤️', target: { type: 'action', id: 'pet' },
    skip: (c) => c.animals === 0,
    done: (c) => stat(c.profile, 'pet') > (c.base.pet ?? 0) || c.full.affection,
  },
  { id: 'journal', emoji: '📖', target: { type: 'hud', id: 'journal' }, done: (c) => c.seen.has('panel:journal') },
  {
    // Si on a déjà utilisé ⏩ (refuge fermé), pas besoin de le réapprendre.
    id: 'time', emoji: '⏩', target: { type: 'hud', id: 'timeFast' },
    skip: (c) => !!c.flags.skipUsed,
    done: (c) => c.seen.has('timeFast') || c.seen.has('skip'),
  },
  { id: 'farm', emoji: '🚜', target: { type: 'hud', id: 'farm' }, done: (c) => c.seen.has('panel:farm') },
  { id: 'end', emoji: '🎉', manual: true },
];

/** Récompense de fin de tutoriel (argent en mode gestion, et de l'XP). */
export const TUTORIAL_REWARD = { money: 100, xp: 'quest' };

export const STEP_IDS = TUTORIAL_STEPS.map((s) => s.id);
const STAT_KEYS = ['adopted', 'feed', 'pet'];

/** État sauvegardé dans le profil (profile.tutorial). */
export function createTutorial(done = false) {
  return { step: done ? null : 'welcome', done, skipped: false, base: {}, seen: [], flags: {} };
}

export function tutorialStep(tuto) {
  if (!tuto || tuto.done) return null;
  return TUTORIAL_STEPS.find((s) => s.id === tuto.step) ?? null;
}

/** Numéro de l'étape (pour « 3 / 12 »). */
export function stepNumber(tuto) {
  const i = STEP_IDS.indexOf(tuto?.step);
  return { n: i + 1, total: STEP_IDS.length };
}

const snapshot = (p) => ({ ...Object.fromEntries(STAT_KEYS.map((k) => [k, stat(p, k)])), animals: p.animals?.length ?? 0 });

/** Un événement du jeu (« building:refuge », « panel:journal », « skip », « next »…). */
export function noteEvent(tuto, name) {
  if (!tuto) return;
  // ⏩ (avance rapide) ou un saut dans le temps : le bouton est appris.
  if (name === 'skip' || name === 'timeFast') tuto.flags.skipUsed = true;
  if (tuto.done) return;
  if (!tuto.seen.includes(name)) tuto.seen.push(name);
}

function goTo(profile, id) {
  const tuto = profile.tutorial;
  tuto.step = id;
  tuto.seen = [];
  tuto.base = snapshot(profile);
  if (!id) tuto.done = true;
}

/** Passe à l'étape suivante (ou termine). Renvoie la nouvelle étape. */
export function advanceTutorial(profile) {
  const tuto = profile.tutorial;
  const i = STEP_IDS.indexOf(tuto.step);
  goTo(profile, STEP_IDS[i + 1] ?? null);
  return tutorialStep(tuto);
}

function context(profile, ctx) {
  const tuto = profile.tutorial;
  return {
    moved: 0, refugeOpen: true, animals: profile.animals?.length ?? 0, full: {},
    ...ctx,
    profile, tuto, base: tuto.base ?? {}, seen: new Set(tuto.seen), flags: tuto.flags ?? {},
  };
}

/**
 * Vérifie l'étape en cours. Passe les étapes inutiles et valide celles qui sont réussies.
 * Renvoie { completed: [ids réussis], finished: bool } — ou null si rien n'a changé.
 */
export function updateTutorial(profile, ctx = {}) {
  const tuto = profile.tutorial;
  if (!tuto || tuto.done) return null;
  const completed = [];
  let changed = false;
  for (let guard = 0; guard < STEP_IDS.length + 1; guard++) {
    const step = tutorialStep(tuto);
    if (!step) break;
    const c = context(profile, ctx);
    if (step.skip?.(c)) {
      advanceTutorial(profile);
      changed = true;
      continue;
    }
    const ok = step.manual ? c.seen.has('next') : step.done(c);
    if (!ok) break;
    completed.push(step.id);
    advanceTutorial(profile);
    changed = true;
    // Une seule étape réussie à la fois : l'enfant voit chaque bravo.
    break;
  }
  if (!changed) return null;
  return { completed, finished: tuto.done };
}

export function skipTutorial(profile) {
  profile.tutorial = { ...createTutorial(true), skipped: true, flags: profile.tutorial?.flags ?? {} };
}

export function restartTutorial(profile) {
  profile.tutorial = createTutorial(false);
  profile.tutorial.base = snapshot(profile);
}

// ------------------------------------------------------------------ quêtes claires

/**
 * Ce qu'il faut avoir pour pouvoir faire une quête (need de QUEST_GUIDE). Chaque besoin dit s'il est rempli ;
 * sinon la quête dit simplement pourquoi (texte qneed_<id>, voir questBlock) et n'est jamais imposée.
 * Seuls nos propres animaux comptent (pas ceux des clients ni les invités).
 */
const own = (p) => (p.animals ?? []).filter((a) => !a.client && !a.guest);
const hasAnimal = (p) => own(p).length > 0;
const hasHorse = (p) => own(p).some((a) => a.species === 'horse');
const hasSalon = (p) => (p.structures ?? []).some((s) => s.type === 'salon'); // salon de toilettage
const hasCareer = (p) => Object.keys(p.careers?.started ?? {}).length > 0;
const careerOn = (p, id) => p.careers?.started?.[id] !== undefined;
const dogTrainerStarted = (p) => careerOn(p, 'dogTrainer'); // éducateur canin (src/sim/dogTrainer.js)
const hasTrainingDog = (p) => (p.animals ?? []).some((a) => a.client?.kind === 'training');
const coachable = (p) => own(p).some((a) => ['dog', 'cat', 'horse', 'rabbit'].includes(a.species));
const level = (p) => levelOf(p.xp ?? 0);
const horses = (p) => own(p).filter((a) => a.species === 'horse');
// (un cheval trop jeune ne se monte pas : canRide, src/sim/animal.js)
const grownHorse = (p) => horses(p).some((a) => ageYears(a) >= (SPECIES.horse.rideYears ?? 0));
// Pour monter : un filet ou un licol sur le cheval, ou un libre à lui mettre (« 🏇 Monter » le met tout seul).
const headgear = (p) => horses(p).some((a) => wears(a, 'bridle') || wears(a, 'halter')) || hasFreeHeadgear(p);
const bestBond = (p) => Math.max(0, ...own(p).map((a) => a.bond ?? 0));
const knowsTrick = (p) => own(p).some((a) => Object.values(a.tricks ?? {}).some((v) => v >= 100)); // (activities.js : knownTricks)
const salonPrice = () => STRUCTURES.salon?.price ?? 0;

/** Le voyage le moins cher d'ici (en 🪙 : sans animal, sans le cheval), seulement vers l'étranger avec abroad. */
export function cheapestTrip(p, { abroad = false } = {}) {
  const here = PLACES[p.place] ?? PLACES[p.home] ?? PLACES[PLACE_IDS[0]];
  const homeCountry = PLACES[p.home ?? 'maison']?.country;
  let best = null;
  for (const to of PLACE_IDS) {
    if (abroad && PLACES[to].country === homeCountry) continue;
    for (const mode of Object.keys(TRAVEL_MODES)) {
      if (TRAVEL_MODES[mode].needsHorse) continue;
      const r = checkTravel(here.id, to, mode, []);
      if (r.ok && (best === null || r.cost < best)) best = r.cost;
    }
  }
  return best ?? 0;
}
const tripOk = (p, abroad) => p.mode !== 'manage' || (p.money ?? 0) >= cheapestTrip(p, { abroad });

/**
 * Les besoins : ok(p) = rempli ; params(p) = ce que dit le texte (« Il te faut {n} 🪙 »).
 * Le niveau : { id: 'level', n, for } (« Niveau 3 pour construire », texte qneed_level_<for>).
 */
export const QUEST_NEEDS = {
  animal: { ok: hasAnimal },
  horse: { ok: hasHorse },
  grownHorse: { ok: grownHorse }, // un cheval assez grand pour être monté
  tack: { ok: headgear }, // un filet ou un licol
  // le lien qu'il faut pour apprendre un tour (trainTrick : BOND_FOR_TRICKS) ; on le gagne en s'occupant de l'animal
  bond: { ok: (p) => bestBond(p) >= BOND_FOR_TRICKS, params: (p) => ({ n: Math.floor(bestBond(p)), max: BOND_FOR_TRICKS }) },
  trickKnown: { ok: knowsTrick }, // un tour appris (le spectacle)
  rabbit: { ok: (p) => own(p).some((a) => a.species === 'rabbit') },
  // deux animaux pour un bébé : un mâle et une femelle de la même espèce
  pair: { ok: (p) => own(p).some((a) => a.sex === 'f' && own(p).some((b) => b.sex === 'm' && b.species === a.species)) },
  pooper: { ok: (p) => own(p).some((a) => POOPS_PER_DAY[a.species]) }, // (chats et lapins : litière, pas de crottin)
  agility: { ok: (p) => own(p).some((a) => SPECIES[a.species]?.training?.includes('agility')) },
  coachable: { ok: coachable },
  salon: { ok: hasSalon },
  salonMoney: { ok: (p) => p.mode !== 'manage' || (p.money ?? 0) >= salonPrice(), params: () => ({ n: salonPrice() }) },
  career: { ok: hasCareer },
  // métiers dont les visiteurs viennent confier leur animal (src/sim/clients.js)
  visitCareer: { ok: (p) => ['vet', 'pension', 'handler'].some((id) => careerOn(p, id)) },
  vetCareer: { ok: (p) => careerOn(p, 'vet') },
  dogTrainer: { ok: dogTrainerStarted },
  trainingDog: { ok: hasTrainingDog },
  trip: { ok: (p) => tripOk(p, false), params: (p) => ({ n: cheapestTrip(p) }) },
  tripAbroad: { ok: (p) => tripOk(p, true), params: (p) => ({ n: cheapestTrip(p, { abroad: true }) }) },
  level: { ok: (p, need) => level(p) >= need.n, params: (p, need) => ({ n: need.n }) },
};

const SHOWGROUND = { type: 'building', id: 'showground' };
const LEVEL_BUILD = { id: 'level', n: 3, for: 'build' }; // 150 XP = niveau 3 (salon de toilettage)
const LEVEL_CAREER = { id: 'level', n: 3, for: 'career' }; // premier métier (src/sim/careers.js : niveau 3)
const LEVEL_TRAIL = { id: 'level', n: 4, for: 'career' }; // 🧭 guide de randonnée (niveau 4)
// Monter à cheval : un cheval, assez grand, avec un filet ou un licol (le jeu le met tout seul s'il en reste un).
const MOUNT = ['horse', 'grownHorse', 'tack'];

/**
 * Pour chaque quête : où aller (clé de texte quest_where_*), quoi montrer, et ce qu'il faut avoir (need, dans
 * l'ordre : le premier qui manque est celui qu'on dit).
 */
export const QUEST_GUIDE = {
  adopt1: { where: 'refuge', target: { type: 'building', id: 'refuge' } },
  feed5: { where: 'animal', target: { type: 'action', id: 'feed' }, need: ['animal'] },
  pet3: { where: 'animal', target: { type: 'action', id: 'pet' }, need: ['animal'] },
  water3: { where: 'animal', target: { type: 'action', id: 'water' }, need: ['animal'] },
  brush3: { where: 'animal', target: { type: 'action', id: 'brush' }, need: ['animal'] },
  // (un crottin arrive tout seul avec le temps : l'étape « attends un crottin » du suivi)
  scoop1: { where: 'ground', target: { type: 'dropping' }, need: ['animal', 'pooper'] },
  vet1: { where: 'vet', target: { type: 'building', id: 'vet' }, need: ['animal'] },
  trick1: { where: 'sheet', target: { type: 'action', id: 'more' }, need: ['animal', 'bond'] },
  ride1: { where: 'horse', target: { type: 'action', id: 'ride', species: 'horse' }, need: MOUNT },
  travel1: { where: 'travel', target: { type: 'hud', id: 'travel' }, need: ['trip'] },
  abroad: { where: 'travel', target: { type: 'hud', id: 'travel' }, need: ['tripAbroad'] },
  horseTrip: { where: 'travel', target: { type: 'hud', id: 'travel' }, need: ['horse', 'grownHorse'] },
  baby: { where: 'sheet', target: { type: 'action', id: 'more' }, need: ['animal', 'pair'] },
  species4: { where: 'refuge', target: { type: 'building', id: 'refuge' } },
  // Activités : au terrain de concours (src/sim/activities.js)
  actvLesson1: { where: 'showground', target: SHOWGROUND, horse: true, need: MOUNT },
  actvJump1: { where: 'showground', target: SHOWGROUND, horse: true, need: MOUNT },
  actvClear1: { where: 'showground', target: SHOWGROUND, horse: true, need: MOUNT },
  actvTrail1: { where: 'showground', target: SHOWGROUND, horse: true, need: MOUNT }, // (la balade se fait à cheval)
  actvAgility1: { where: 'showground', target: SHOWGROUND, animal: true, need: ['animal', 'agility'] },
  actvShow1: { where: 'showground', target: SHOWGROUND, animal: true, need: ['animal', 'trickKnown'] }, // (on montre un tour appris)
  actvCompete1: { where: 'showground', target: SHOWGROUND, animal: true, need: ['animal'] },
  actvHop1: { where: 'showground', target: SHOWGROUND, animal: true, need: ['rabbit'] },
  actvHutch5: { where: 'hutch', target: { type: 'building', id: 'hutch' }, animal: true, need: ['rabbit'] },
  // Dressage et concours à l'extérieur (src/sim/dressage.js, src/sim/competitions.js)
  drTrain3: { where: 'showground', target: SHOWGROUND, horse: true, need: MOUNT },
  drReprise1: { where: 'showground', target: SHOWGROUND, horse: true, need: MOUNT },
  compRegister1: { where: 'calendar', target: { type: 'hud', id: 'actv_hud' }, animal: true, need: ['animal'] },
  compAway1: { where: 'calendar', target: { type: 'hud', id: 'actv_hud' }, animal: true, need: ['animal'] },
  // Concours de beauté (src/sim/beauty.js) : préparer depuis la fiche, présenter au terrain de concours
  beautyPrep1: { where: 'sheet', target: { type: 'action', id: 'more' }, animal: true, need: ['animal'] },
  beautyBraid1: { where: 'sheet', target: { type: 'action', id: 'more' }, horse: true, need: ['horse'] },
  beauty1: { where: 'showground', target: SHOWGROUND, animal: true, need: ['animal'] },
  // Métier éducateur canin (une fois commencé) : les maîtres arrivent près de la niche, les séances se font
  // depuis le chien (menu rapide ou fiche).
  dtClient1: { where: 'dogTrainer', target: { type: 'building', id: 'kennel' }, need: ['dogTrainer'] },
  dtSession3: { where: 'dogSheet', target: { type: 'animal', training: true }, need: ['dogTrainer', 'trainingDog'] },
  dtDeliver1: { where: 'dogTrainer', target: { type: 'building', id: 'kennel' }, need: ['dogTrainer', 'trainingDog'] },
  dtCoach1: { where: 'dogSheet', target: { type: 'action', id: 'more' }, need: ['dogTrainer', 'coachable'] },
  // Métier Toiletteur (src/sim/groomer.js) : construire le salon, puis y travailler.
  grmSalon: { where: 'build', target: { type: 'hud', id: 'hud_build' }, need: [LEVEL_BUILD, 'salonMoney'] },
  grmClient1: { where: 'salon', target: { type: 'building', id: 'salon' }, need: ['salon'] },
  grmOwn1: { where: 'salon', target: { type: 'building', id: 'salon' }, animal: true, need: ['salon', 'animal'] },
  grmAccessory1: { where: 'salon', target: { type: 'building', id: 'salon' }, animal: true, need: ['salon', 'animal'] },
  grmFive1: { where: 'salon', target: { type: 'building', id: 'salon' }, need: ['salon'] },
  // Métiers et clients (src/sim/careers.js, src/sim/clients.js)
  career1: { where: 'careers', target: { type: 'hud', id: 'careers' }, need: [LEVEL_CAREER] },
  client1: { where: 'home', target: { type: 'hud', id: 'careers' }, need: ['career', 'visitCareer'] },
  clientVet1: { where: 'home', target: { type: 'hud', id: 'careers' }, need: ['vetCareer'] },
  clientHappy5: { where: 'home', target: { type: 'hud', id: 'careers' }, need: ['career', 'visitCareer'] },
  clientMoney500: { where: 'home', target: { type: 'hud', id: 'careers' }, need: ['career', 'visitCareer'] },
  // 🧭 Guide de randonnée (src/sim/trailGuide.js) : les visiteurs arrivent près de l'écurie (dès le niveau 4).
  tgFirst: { where: 'trailGuide', target: { type: 'building', id: 'stable' }, horse: true, need: [...MOUNT, LEVEL_TRAIL] },
  tgStars3: { where: 'trailGuide', target: { type: 'building', id: 'stable' }, horse: true, need: [...MOUNT, LEVEL_TRAIL] },
  tgRiders10: { where: 'trailGuide', target: { type: 'building', id: 'stable' }, horse: true, need: [...MOUNT, LEVEL_TRAIL] },
  tgAbroad: { where: 'travel', target: { type: 'hud', id: 'travel' }, horse: true, need: [...MOUNT, LEVEL_TRAIL] },
};

/**
 * Pourquoi cette quête n'est pas encore possible ? null si on peut la faire maintenant, sinon
 * { need, key, params } : key = le texte à dire (qneed_horse « Il te faut d'abord un cheval », qneed_level_build
 * « Niveau 3 pour construire »…).
 */
export function questBlock(id, profile) {
  for (const raw of QUEST_GUIDE[id]?.need ?? []) {
    const need = typeof raw === 'string' ? { id: raw } : raw;
    const def = QUEST_NEEDS[need.id];
    if (!def || def.ok(profile, need)) continue;
    return { need: need.id, key: need.for ? `qneed_${need.id}_${need.for}` : `qneed_${need.id}`, params: def.params?.(profile, need) ?? {} };
  }
  return null;
}

/** La quête est-elle faisable maintenant ? */
export const questReady = (id, profile) => !questBlock(id, profile);

/**
 * Ce qu'il manque et que l'enfant trouve au refuge : sans animal (ou sans cheval), « 🧭 Suivre » commence par y
 * aller (questSteps : étapes goRefuge, adoptFirst / adoptHorse), et le cheval adopté reçoit son licol.
 */
const AT_REFUGE = new Set(['animal', 'horse', 'grownHorse', 'tack', 'rabbit', 'pooper', 'agility', 'coachable']);

/**
 * Peut-on SUIVRE cette quête (🧭) ? null si oui, sinon ce qui manque (comme questBlock). Le suivi guide pas à pas :
 * il ne doit jamais emmener l'enfant vers une action impossible (un bébé avec un seul animal, un voyage sans assez
 * d'argent…). Seul ce qu'on trouve au refuge ne bloque pas : le suivi commence alors par l'adoption.
 */
export function followBlock(id, profile) {
  const adopting = !!questGuide(id, profile)?.first; // (le suivi commence par le refuge)
  for (const raw of QUEST_GUIDE[id]?.need ?? []) {
    const need = typeof raw === 'string' ? { id: raw } : raw;
    const def = QUEST_NEEDS[need.id];
    if (!def || def.ok(profile, need) || (adopting && AT_REFUGE.has(need.id))) continue;
    return { need: need.id, key: need.for ? `qneed_${need.id}_${need.for}` : `qneed_${need.id}`, params: def.params?.(profile, need) ?? {} };
  }
  return null;
}

/** Ordre des quêtes, de la plus facile à la plus difficile (journal, thèmes des quêtes : src/sim/quests.js). */
export const QUEST_ORDER = [
  'adopt1', 'pet3', 'feed5', 'water3', 'brush3', 'scoop1', 'vet1', 'trick1', 'ride1',
  'travel1', 'baby', 'abroad', 'horseTrip', 'species4',
  'actvLesson1', 'actvJump1', 'actvTrail1', 'actvAgility1', 'actvHutch5', 'actvHop1', 'actvShow1', 'actvClear1', 'actvCompete1',
  'drTrain3', 'drReprise1', 'compRegister1', 'compAway1',
  'beautyPrep1', 'beautyBraid1', 'beauty1',
  'grmSalon', 'grmOwn1', 'grmAccessory1', 'grmClient1', 'grmFive1',
  'career1', 'client1', 'clientVet1', 'dtClient1', 'dtSession3', 'dtDeliver1', 'dtCoach1', 'clientHappy5', 'clientMoney500',
  'tgFirst', 'tgStars3', 'tgRiders10', 'tgAbroad', // 🧭 guide de randonnée
];

/**
 * Où faire une quête et quoi montrer, selon la situation du joueur
 * (sans animal, tout commence au refuge ; sans cheval, il faut d'abord en adopter un).
 */
export function questGuide(id, profile) {
  const g = QUEST_GUIDE[id];
  if (!g) return null;
  const needsAnimal = g.target.type === 'action' || g.where === 'vet' || g.animal || g.horse;
  // (une quête à cheval sans aucun animal : un cheval d'abord, pas « un animal » — un chat ne servirait à rien)
  if ((g.where === 'horse' || g.horse) && !hasHorse(profile)) return { where: 'refuge', target: { type: 'building', id: 'refuge' }, first: 'horse' };
  if (needsAnimal && !hasAnimal(profile)) return { where: 'refuge', target: { type: 'building', id: 'refuge' }, first: 'adopt' };
  return { where: g.where, target: g.target };
}

// ------------------------------------------------------------------ suivre une quête

/**
 * « Suivre la quête » : chaque quête est découpée en petites étapes (aller au bon endroit,
 * toucher le bon bouton…). Chaque étape se coche toute seule et le repère passe à la suivante.
 * Textes : clés quest_step_<id>. La dernière étape est réussie quand la quête l'est.
 * c = { profile, seen, questDone, refugeOpen, hasDropping, travelDest, travelMode }
 */
const seenAny = (...names) => (c) => names.some((n) => c.seen.has(n));
const questDone = (c) => c.questDone;
const travelEl = (sel) => ({ type: 'el', sel, fallback: { type: 'hud', id: 'travel' } });

/** Toutes les petites étapes possibles, par identifiant. */
export const FOLLOW_STEPS = {
  goRefuge: { target: { type: 'building', id: 'refuge' }, done: seenAny('building:refuge', 'panel:adoption') },
  waitOpen: { target: { type: 'hud', id: 'timeFast' }, skip: (c) => c.refugeOpen, done: (c) => c.refugeOpen },
  adoptOne: { target: { type: 'adopt' }, done: questDone },
  adoptFirst: { target: { type: 'adopt' }, done: (c) => hasAnimal(c.profile) },
  adoptHorse: { target: { type: 'adopt' }, done: (c) => hasHorse(c.profile) },
  adoptMore: { target: { type: 'adopt' }, done: questDone, progress: true },
  tapAnimal: { target: { type: 'animal' }, done: seenAny('animalActions', 'panel:animal') },
  tapHorse: { target: { type: 'animal', species: 'horse' }, done: seenAny('animalActions', 'panel:animal') },
  openMore: { target: { type: 'action', id: 'more' }, done: seenAny('panel:animal') },
  do_pet: { target: { type: 'action', id: 'pet' }, done: questDone, progress: true },
  do_feed: { target: { type: 'action', id: 'feed' }, done: questDone, progress: true },
  do_water: { target: { type: 'action', id: 'water' }, done: questDone, progress: true },
  do_brush: { target: { type: 'action', id: 'brush' }, done: questDone, progress: true },
  waitDropping: { target: null, skip: (c) => c.hasDropping, done: (c) => c.hasDropping },
  scoopIt: { target: { type: 'dropping' }, done: questDone },
  goVet: { target: { type: 'building', id: 'vet' }, done: seenAny('building:vet', 'panel:vetClinic', 'panel:vetExam') },
  vetOpen: { target: { type: 'sheet', label: 'do_vet', fallback: { type: 'building', id: 'vet' } }, done: seenAny('panel:vetClinic', 'panel:vetExam') },
  vetChoose: { target: { type: 'el', sel: '#panel .cards button.card', fallback: { type: 'building', id: 'vet' } }, done: seenAny('panel:vetExam') },
  vetExam: { target: null, done: questDone },
  trainTrick: { target: { type: 'section', h3: 'tricks', fallback: { type: 'action', id: 'more' } }, done: questDone },
  breedNow: { target: { type: 'section', h3: 'breedTitle', fallback: { type: 'action', id: 'more' } }, done: questDone },
  doRide: { target: { type: 'action', id: 'ride', species: 'horse' }, done: questDone },
  openTravel: { target: { type: 'hud', id: 'travel' }, done: seenAny('panel:travel') },
  pickPlace: { target: travelEl('#panel .card.place:not([disabled])'), done: (c) => c.travelDest || c.questDone },
  pickAbroad: { target: travelEl('#panel .card.place:not([disabled])'), done: (c) => c.travelDest || c.questDone },
  pickMode: { target: travelEl('#panel .card.mode:not([disabled])'), done: (c) => c.travelMode || c.questDone },
  pickHorse: { target: travelEl('#panel .card.mode:not([disabled])'), done: (c) => c.travelMode || c.questDone },
  goTravel: { target: travelEl('#panel button.primary.big:not([disabled])'), done: questDone },
  goShowground: { target: SHOWGROUND, done: seenAny('building:showground') },
  goHutch: { target: { type: 'building', id: 'hutch' }, done: seenAny('building:hutch') },
  openCalendar: { target: { type: 'hud', id: 'actv_hud' }, done: seenAny('panel:activities') }, // calendrier des concours
  doActivity: { target: null, done: questDone, progress: true },
  // éducateur canin
  waitClient: { target: { type: 'building', id: 'kennel' }, done: seenAny('panel:dogTrainerChat') },
  acceptClient: { target: { type: 'el', sel: '#panel .dt-accept', fallback: { type: 'building', id: 'kennel' } }, done: questDone },
  tapDog: { target: { type: 'animal', training: true }, done: seenAny('animalActions', 'panel:animal') },
  doSession: { target: { type: 'el', sel: '#panel .big-action.dt-quick', fallback: { type: 'section', h3: 'dt_sectionTitle', fallback: { type: 'animal', training: true } } }, done: questDone, progress: true },
  waitOwner: { target: { type: 'animal', training: true }, done: (c) => c.dtOwnerBack || c.questDone, progress: true },
  deliverDog: { target: { type: 'el', sel: '#panel .dt-deliver', fallback: { type: 'building', id: 'kennel' } }, done: questDone },
  doCoach: { target: { type: 'section', h3: 'dt_sectionTitle', fallback: { type: 'action', id: 'more' } }, done: questDone },
  // Salon de toilettage (src/ui/groomer.js émet building:salon)
  openBuild: { target: { type: 'hud', id: 'hud_build' }, done: (c) => c.seen.has('panel:build') || c.questDone }, // 🏗️ Construire
  buildSalon: { target: null, done: questDone },
  goSalon: { target: { type: 'building', id: 'salon' }, done: seenAny('building:salon') },
  doGrooming: { target: null, done: questDone, progress: true },
  // Métiers et clients
  careerStart: { target: { type: 'hud', id: 'careers' }, done: questDone },
  clientWait: { target: null, done: (c) => c.hasClient || c.questDone },
  clientCare: { target: null, done: questDone, progress: true },
  clientVet: { target: null, done: questDone, progress: true },
  // 🧭 Guide de randonnée : attendre les visiteurs, préparer, partir.
  tgWait: { target: { type: 'building', id: 'stable' }, done: (c) => (c.profile.trailGuide?.bookings ?? []).some((b) => b.place === c.profile.place) || c.questDone },
  tgPrepare: { target: null, done: (c) => !!c.profile.trailGuide?.riding || c.questDone },
  tgRide: { target: null, done: questDone, progress: true },
};

export const QUEST_STEPS = {
  adopt1: ['goRefuge', 'waitOpen', 'adoptOne'],
  species4: ['goRefuge', 'waitOpen', 'adoptMore'],
  pet3: ['tapAnimal', 'do_pet'],
  feed5: ['tapAnimal', 'do_feed'],
  water3: ['tapAnimal', 'do_water'],
  brush3: ['tapAnimal', 'do_brush'],
  scoop1: ['waitDropping', 'scoopIt'],
  vet1: ['goVet', 'vetOpen', 'vetChoose', 'vetExam'],
  trick1: ['tapAnimal', 'openMore', 'trainTrick'],
  ride1: ['tapHorse', 'doRide'],
  travel1: ['openTravel', 'pickPlace', 'pickMode', 'goTravel'],
  abroad: ['openTravel', 'pickAbroad', 'pickMode', 'goTravel'],
  horseTrip: ['openTravel', 'pickPlace', 'pickHorse', 'goTravel'],
  baby: ['tapAnimal', 'openMore', 'breedNow'],
  actvLesson1: ['goShowground', 'doActivity'],
  actvJump1: ['goShowground', 'doActivity'],
  actvClear1: ['goShowground', 'doActivity'],
  actvTrail1: ['goShowground', 'doActivity'],
  actvAgility1: ['goShowground', 'doActivity'],
  actvShow1: ['goShowground', 'doActivity'],
  actvCompete1: ['goShowground', 'doActivity'],
  actvHop1: ['goShowground', 'doActivity'],
  actvHutch5: ['goHutch', 'doActivity'],
  drTrain3: ['goShowground', 'doActivity'],
  drReprise1: ['goShowground', 'doActivity'],
  compRegister1: ['openCalendar', 'doActivity'],
  compAway1: ['openCalendar', 'doActivity'],
  // Concours de beauté
  beautyPrep1: ['tapAnimal', 'openMore', 'doActivity'],
  beautyBraid1: ['tapHorse', 'openMore', 'doActivity'],
  beauty1: ['goShowground', 'doActivity'],
  dtClient1: ['waitClient', 'acceptClient'],
  dtSession3: ['tapDog', 'doSession'],
  dtCoach1: ['tapAnimal', 'openMore', 'doCoach'],
  dtDeliver1: ['waitOwner', 'deliverDog'],
  grmSalon: ['openBuild', 'buildSalon'],
  grmClient1: ['goSalon', 'doGrooming'],
  grmOwn1: ['goSalon', 'doGrooming'],
  grmAccessory1: ['goSalon', 'doGrooming'],
  grmFive1: ['goSalon', 'doGrooming'],
  career1: ['careerStart'],
  client1: ['clientWait', 'clientCare'],
  clientVet1: ['clientWait', 'clientVet'],
  clientHappy5: ['clientWait', 'clientCare'],
  clientMoney500: ['clientWait', 'clientCare'],
  // 🧭 Guide de randonnée
  tgFirst: ['tgWait', 'tgPrepare', 'tgRide'],
  tgStars3: ['tgWait', 'tgPrepare', 'tgRide'],
  tgRiders10: ['tgWait', 'tgPrepare', 'tgRide'],
  tgAbroad: ['openTravel', 'pickAbroad', 'pickMode', 'tgWait', 'tgPrepare', 'tgRide'],
};

/** Étapes d'une quête selon la situation : sans animal (ou sans cheval), on va d'abord en adopter un. */
export function questSteps(id, profile) {
  const steps = QUEST_STEPS[id] ?? [];
  const g = questGuide(id, profile);
  if (g?.first) return ['goRefuge', 'waitOpen', g.first === 'horse' ? 'adoptHorse' : 'adoptFirst', ...steps];
  return steps;
}

/**
 * Commence à suivre une quête (une seule à la fois). Les étapes sont figées au départ.
 * `resume` : le suivi arrêté juste avant (✋ touché par erreur, puis 🧭 de nouveau) ; même quête et mêmes étapes,
 * on reprend à l'étape où l'on était au lieu de tout recommencer.
 */
export function followQuest(profile, id, resume = null) {
  const steps = questSteps(id, profile);
  const same = resume?.id === id && Array.isArray(resume.steps) && resume.steps.length === steps.length
    && resume.steps.every((s, i) => s === steps[i]);
  profile.questFollow = same
    ? { id, step: Math.max(0, Math.min(resume.step | 0, steps.length - 1)), seen: [...(resume.seen ?? [])], steps }
    : { id, step: 0, seen: [], steps };
  return profile.questFollow;
}

export function stopFollow(profile) {
  profile.questFollow = null;
}

export function noteFollowEvent(profile, name) {
  const f = profile.questFollow;
  if (f && !f.seen.includes(name)) f.seen.push(name);
}

/**
 * Vérifie l'étape en cours de la quête suivie.
 * Renvoie { questDone, id } quand la quête est finie, { stepDone } quand une étape se coche, sinon null.
 */
export function updateFollow(profile, objectives, ctx = {}) {
  const f = profile.questFollow;
  if (!f) return null;
  const o = objectives.find((x) => x.id === f.id);
  // (quête suivie avant la mise à jour, qui demande une espèce pas encore proposée — le lapin-hop sans lapin :
  // objectiveShown, src/sim/objectives.js —, ou qui n'existe plus : le suivi s'arrête)
  if (!o || !objectiveShown(profile, o)) {
    stopFollow(profile);
    return null;
  }
  const [cur, max] = o.progress(profile);
  if (cur >= max || profile.completed.includes(f.id)) {
    stopFollow(profile);
    return { questDone: true, id: o.id };
  }
  const c = { refugeOpen: true, hasDropping: false, ...ctx, profile, seen: new Set(f.seen), questDone: false };
  let stepDone = null;
  while (f.step < f.steps.length - 1) {
    const s = FOLLOW_STEPS[f.steps[f.step]];
    if (s?.skip?.(c)) {
      f.step++;
      continue;
    }
    if (s && !s.done(c)) break;
    stepDone = f.steps[f.step];
    f.step++;
  }
  return stepDone ? { stepDone } : null;
}

/** Ce qu'affiche l'objectif suivi : la quête, ses étapes (faite / en cours / à faire) et la cible. */
export function followView(profile, objectives) {
  const f = profile.questFollow;
  if (!f) return null;
  const o = objectives.find((x) => x.id === f.id);
  if (!o || !objectiveShown(profile, o)) return null; // (quête cachée : voir updateFollow)
  const [cur, max] = o.progress(profile);
  const id = f.steps[f.step];
  return {
    id: f.id,
    cur,
    max,
    current: id ? { id, ...FOLLOW_STEPS[id] } : null,
    steps: f.steps.map((s, i) => ({ id: s, progress: !!FOLLOW_STEPS[s]?.progress, state: i < f.step ? 'done' : i === f.step ? 'now' : 'todo' })),
  };
}

/**
 * Le petit suivi sur le côté n'a la place que pour quelques lignes : on montre l'étape en cours,
 * les suivantes et (s'il y a la place pour 3 lignes ou plus) la dernière faite.
 * Renvoie { steps, before, after } : before / after = nombre d'étapes cachées avant / après.
 */
export function stepWindow(steps, max = 3) {
  const n = steps.length;
  const size = Math.max(1, max);
  if (n <= size) return { steps, before: 0, after: 0 };
  let now = steps.findIndex((s) => s.state === 'now');
  if (now < 0) now = n - 1;
  const start = Math.max(0, Math.min(now - (size >= 3 ? 1 : 0), n - size));
  return { steps: steps.slice(start, start + size), before: start, after: n - start - size };
}
