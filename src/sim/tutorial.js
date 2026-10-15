// Tutoriel guidé pour les enfants + aide pour les quêtes (quoi faire, et où).
// Logique pure, sans 3D ni DOM : l'interface (src/ui/tutorial.js) fournit un « contexte »
// (le joueur a-t-il marché ? le refuge est-il ouvert ?…) et les événements du jeu.

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
    id: 'wait', emoji: '⏩', target: { type: 'hud', id: 'skip' },
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
    id: 'time', emoji: '⏩', target: { type: 'hud', id: 'skip' },
    skip: (c) => !!c.flags.skipUsed,
    done: (c) => c.seen.has('skip'),
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
  if (name === 'skip') tuto.flags.skipUsed = true;
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
 * Pour chaque quête : où aller (clé de texte quest_where_*) et quoi montrer.
 * ready(p) : la quête est faisable maintenant (sinon on en propose une autre).
 */
const hasHorse = (p) => p.animals.some((a) => a.species === 'horse');
const hasAnimal = (p) => p.animals.length > 0;

const SHOWGROUND = { type: 'building', id: 'showground' };

export const QUEST_GUIDE = {
  adopt1: { where: 'refuge', target: { type: 'building', id: 'refuge' } },
  feed5: { where: 'animal', target: { type: 'action', id: 'feed' }, ready: hasAnimal },
  pet3: { where: 'animal', target: { type: 'action', id: 'pet' }, ready: hasAnimal },
  water3: { where: 'animal', target: { type: 'action', id: 'water' }, ready: hasAnimal },
  brush3: { where: 'animal', target: { type: 'action', id: 'brush' }, ready: hasAnimal },
  scoop1: { where: 'ground', target: { type: 'dropping' }, ready: (p) => (p.droppings ?? []).some((d) => d.kind === 'poop' && d.place === p.place) },
  vet1: { where: 'vet', target: { type: 'building', id: 'vet' }, ready: hasAnimal },
  trick1: { where: 'sheet', target: { type: 'action', id: 'more' }, ready: hasAnimal },
  ride1: { where: 'horse', target: { type: 'action', id: 'ride', species: 'horse' }, ready: hasHorse },
  travel1: { where: 'travel', target: { type: 'hud', id: 'travel' } },
  abroad: { where: 'travel', target: { type: 'hud', id: 'travel' } },
  horseTrip: { where: 'travel', target: { type: 'hud', id: 'travel' }, ready: hasHorse },
  baby: { where: 'sheet', target: { type: 'action', id: 'more' }, ready: (p) => p.animals.length >= 2 },
  species4: { where: 'refuge', target: { type: 'building', id: 'refuge' } },
  // Activités : au terrain de concours (src/sim/activities.js)
  actvLesson1: { where: 'showground', target: SHOWGROUND, horse: true, ready: hasHorse },
  actvJump1: { where: 'showground', target: SHOWGROUND, horse: true, ready: hasHorse },
  actvClear1: { where: 'showground', target: SHOWGROUND, horse: true, ready: hasHorse },
  actvTrail1: { where: 'showground', target: SHOWGROUND },
  actvAgility1: { where: 'showground', target: SHOWGROUND, animal: true, ready: hasAnimal },
  actvShow1: { where: 'showground', target: SHOWGROUND, animal: true, ready: hasAnimal },
  actvCompete1: { where: 'showground', target: SHOWGROUND, animal: true, ready: hasAnimal },
  actvHop1: { where: 'showground', target: SHOWGROUND, animal: true, ready: (p) => p.animals.some((a) => a.species === 'rabbit') },
  actvHutch5: { where: 'hutch', target: { type: 'building', id: 'hutch' }, animal: true, ready: (p) => p.animals.some((a) => a.species === 'rabbit') },
};

/** Ordre conseillé des quêtes, de la plus facile à la plus difficile. */
export const QUEST_ORDER = [
  'adopt1', 'pet3', 'feed5', 'water3', 'brush3', 'scoop1', 'vet1', 'trick1', 'ride1',
  'travel1', 'baby', 'abroad', 'horseTrip', 'species4',
  'actvLesson1', 'actvJump1', 'actvTrail1', 'actvAgility1', 'actvHutch5', 'actvHop1', 'actvShow1', 'actvClear1', 'actvCompete1',
];

/**
 * Où faire une quête et quoi montrer, selon la situation du joueur
 * (sans animal, tout commence au refuge ; sans cheval, il faut d'abord en adopter un).
 */
export function questGuide(id, profile) {
  const g = QUEST_GUIDE[id];
  if (!g) return null;
  const needsAnimal = g.target.type === 'action' || g.where === 'vet' || g.animal || g.horse;
  if (needsAnimal && !hasAnimal(profile)) return { where: 'refuge', target: { type: 'building', id: 'refuge' }, first: 'adopt' };
  if ((g.where === 'horse' || g.horse) && !hasHorse(profile)) return { where: 'refuge', target: { type: 'building', id: 'refuge' }, first: 'horse' };
  return { where: g.where, target: g.target };
}

/** La quête conseillée maintenant (affichée à l'écran), ou null si tout est fait. */
export function suggestedQuest(profile, objectives) {
  const quests = objectives.filter((o) => o.kind === 'quest' && !profile.completed.includes(o.id));
  if (!quests.length) return null;
  const rank = (o) => {
    const i = QUEST_ORDER.indexOf(o.id);
    return i < 0 ? QUEST_ORDER.length : i;
  };
  quests.sort((a, b) => rank(a) - rank(b));
  return quests.find((o) => QUEST_GUIDE[o.id]?.ready?.(profile) ?? true) ?? quests[0];
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
  waitOpen: { target: { type: 'hud', id: 'skip' }, skip: (c) => c.refugeOpen, done: (c) => c.refugeOpen },
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
  doActivity: { target: null, done: questDone, progress: true },
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
};

/** Étapes d'une quête selon la situation : sans animal (ou sans cheval), on va d'abord en adopter un. */
export function questSteps(id, profile) {
  const steps = QUEST_STEPS[id] ?? [];
  const g = questGuide(id, profile);
  if (g?.first) return ['goRefuge', 'waitOpen', g.first === 'horse' ? 'adoptHorse' : 'adoptFirst', ...steps];
  return steps;
}

/** Commence à suivre une quête (une seule à la fois). Les étapes sont figées au départ. */
export function followQuest(profile, id) {
  profile.questFollow = { id, step: 0, seen: [], steps: questSteps(id, profile) };
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
  if (!o) {
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
  if (!o) return null;
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
