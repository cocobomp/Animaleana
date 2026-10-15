// Métier « Éducateur canin » 🐕 : des maîtres viennent avec un chien qui a UN problème
// (tire en laisse, ne revient pas…) ; on le garde à la ferme, on fait une séance par jour,
// et quand le problème est presque réglé, le maître revient le chercher : démonstration,
// étoiles, paiement, pourboire, réputation et XP de métier.
// Logique pure (testable). Le 3D est dans src/game/DogTrainer.js, l'interface dans src/ui/dogTrainer.js.

import { createAnimal } from './animal.js';
import { DAYS_PER_YEAR } from './time.js';
import { earn } from './profile.js';
import { pick, randRange } from './rng.js';
import { registerCareer, careerRank, addCareerXp, rankIndex } from './careersRegistry.js';

/** Les problèmes qu'on sait régler. `game` : le mini-jeu ; `gains` : ce que chaque séance fait progresser. */
export const PROBLEMS = {
  pull: { emoji: '🦮', game: 'dt_pull', gains: { heel: 14, obedience: 5 }, sessions: [3, 5] },
  recall: { emoji: '📣', game: 'dt_recall', gains: { fetch: 10, obedience: 7 }, sessions: [3, 5] },
  jump: { emoji: '🙅', game: 'dt_jump', gains: { down: 10, obedience: 6 }, sessions: [3, 4] },
  bark: { emoji: '🤫', game: 'dt_bark', gains: { obedience: 8 }, sessions: [3, 5] },
  shy: { emoji: '🫣', game: 'dt_shy', gains: { obedience: 4, bond: 6 }, sessions: [4, 5] },
  obey: { emoji: '✋', game: 'dt_obey', gains: { sit: 12, down: 6, obedience: 6 }, sessions: [3, 4] },
};
export const PROBLEM_IDS = Object.keys(PROBLEMS);

/** Coaching de ses propres animaux (gratuit) : les mêmes séances + deux spécialités. */
export const COACHINGS = {
  herd: { emoji: '🐑', game: 'dt_herd', gains: { herding: 6, obedience: 2 }, rank: 1, species: ['dog'] },
  agility: { emoji: '🎯', game: 'dt_agility', gains: { jump: 5, speed: 4, obedience: 2 }, rank: 2, species: ['dog', 'cat', 'rabbit'] },
};

/** Séances possibles pour un animal à soi, selon l'espèce (chiots : tout ; poulains et chatons : assis et rappel). */
export function coachingsFor(a, rank = 0) {
  const out = [];
  if (a.species === 'dog') out.push(...PROBLEM_IDS);
  else if (['cat', 'horse', 'rabbit'].includes(a.species)) out.push('obey', 'recall');
  for (const [id, c] of Object.entries(COACHINGS)) if (c.species.includes(a.species) && rank >= c.rank) out.push(id);
  return out;
}

export const FIXED_BELOW = 15; // en dessous de ce niveau de problème, c'est réglé
export const SESSION_MINUTES = 8; // temps de jeu que prend une séance
export const BASE_PRICE = 20; // prix d'une séance (× réputation, × rang)
export const CAREER_XP = { accept: 10, session: 15, sessionPerfect: 25, deliver: 60, deliverFail: 20, coach: 8 };

export const DOG_TRAINER_CAREER = registerCareer({
  id: 'dogTrainer',
  emoji: '🐕',
  name: { fr: 'Éducateur canin', en: 'Dog trainer' },
  name_f: { fr: 'Éducatrice canine', en: 'Dog trainer' },
  desc: { fr: 'Aide les chiens des voisins à bien se comporter : laisse, rappel, assis…', en: 'Help the neighbours\' dogs behave: leash, recall, sit…' },
  level: 3,
  ranks: [
    { id: 'apprenti', xp: 0, maxClients: 1 },
    { id: 'confirme', xp: 150, maxClients: 2 },
    { id: 'expert', xp: 400, maxClients: 3 },
  ],
  // Chaque action a une petite explication la première fois (clé i18n dt_tuto_<id>).
  actions: [
    { id: 'meetClient', tutorial: 'dt_tuto_meetClient' },
    { id: 'session', tutorial: 'dt_tuto_session' },
    { id: 'deliver', tutorial: 'dt_tuto_deliver' },
    { id: 'coachOwn', tutorial: 'dt_tuto_coachOwn' },
    { id: 'coachHerd', rank: 1, tutorial: 'dt_tuto_coachHerd' },
    { id: 'coachAgility', rank: 2, tutorial: 'dt_tuto_coachAgility' },
    { id: 'rescue', rank: 2, tutorial: 'dt_tuto_rescue' },
  ],
});

export const defaultDogTrainer = () => ({ reputation: 50, clients: [], history: [], tutored: {}, lastVisitDay: 0, earned: 0 });

/** profile.dogTrainer existe toujours. */
export function dogTrainerOf(profile) {
  if (!profile.dogTrainer) profile.dogTrainer = defaultDogTrainer();
  const d = profile.dogTrainer;
  d.clients = d.clients ?? [];
  d.history = d.history ?? [];
  d.tutored = d.tutored ?? {};
  if (d.reputation === undefined) d.reputation = 50;
  return d;
}

export const dogTrainerRank = (profile) => careerRank(profile, DOG_TRAINER_CAREER);
export const rankId = (profile) => DOG_TRAINER_CAREER.ranks[dogTrainerRank(profile)].id;

const OWNERS = [
  ['Mme Dupont', 'f'], ['M. Martin', 'm'], ['Léa', 'f'], ['Papi Jean', 'm'], ['Mamie Rose', 'f'], ['Karim', 'm'],
  ['Mme Leroy', 'f'], ['Tom', 'm'], ['Nour', 'f'], ['M. Garcia', 'm'], ['Camille', 'f'], ['Oscar', 'm'],
];

/** Prix d'une séance : la réputation et le rang font monter le tarif. */
export function sessionPrice(profile) {
  const d = dogTrainerOf(profile);
  const rank = dogTrainerRank(profile);
  return Math.round(BASE_PRICE * (0.7 + d.reputation / 100 * 0.6) * (1 + rank * 0.25));
}

/** Les chiens clients en pension d'éducation. */
export const clientDogs = (profile) => profile.animals.filter((a) => a.client?.kind === 'training');

/** Combien de clients on peut garder en même temps (selon le rang). */
export const maxClients = (profile) => DOG_TRAINER_CAREER.ranks[dogTrainerRank(profile)].maxClients;

/**
 * Un maître se présente avec son chien. rescue (expert) : un chien de refuge avec deux problèmes.
 * Renvoie { ownerName, ownerSex, dog, problems: { id: niveau }, sessionsNeeded, price, rescue }.
 */
export function makeClientRequest(profile, { day = 1, rng = Math.random, problem = null, rescue = false } = {}) {
  const rank = dogTrainerRank(profile);
  const [ownerName, ownerSex] = pick(OWNERS, rng);
  const main = problem && PROBLEMS[problem] ? problem : pick(PROBLEM_IDS, rng);
  const isRescue = rescue && rank >= 2;
  const problems = { [main]: Math.round(randRange(60, 90, rng)) };
  if (isRescue) {
    const other = pick(PROBLEM_IDS.filter((p) => p !== main), rng);
    problems[other] = Math.round(randRange(50, 75, rng));
  }
  // Un chien adulte (1,5 à 7 ans ; une année de jeu = DAYS_PER_YEAR jours).
  const dog = createAnimal({ species: 'dog', location: profile.place, day, rng, ageDays: Math.round(randRange(1.5 * DAYS_PER_YEAR, 7 * DAYS_PER_YEAR, rng)) });
  // Un chien pas encore éduqué : peu d'obéissance, peu de tours ; il vient avec son collier et sa laisse.
  dog.skills.obedience = Math.round(randRange(5, 20, rng));
  dog.tricks = {};
  dog.bond = 8;
  dog.gear = { neck: { item: 'collar', color: 'navy' }, leash: { item: 'leash' } };
  const [smin, smax] = PROBLEMS[main].sessions;
  const sessionsNeeded = Math.round(randRange(smin, smax + (isRescue ? 1 : 0), rng));
  return { ownerName, ownerSex, dog, problems, sessionsNeeded, price: sessionPrice(profile), rescue: isRescue, main };
}

/** Accepte le client : le chien reste à la ferme (flag client) jusqu'à la fin. */
export function acceptClient(profile, req, day) {
  const d = dogTrainerOf(profile);
  if (clientDogs(profile).length >= maxClients(profile)) return { ok: false, reason: 'full' };
  const a = req.dog;
  a.location = profile.place;
  a.client = {
    kind: 'training',
    problem: req.main,
    problems: { ...req.problems },
    start: { ...req.problems },
    sessionsDone: 0,
    sessionsNeeded: req.sessionsNeeded,
    ownerName: req.ownerName,
    ownerSex: req.ownerSex,
    price: req.price,
    since: day,
    until: day + req.sessionsNeeded + 3,
    rescue: !!req.rescue,
    lastDay: -1,
  };
  profile.animals.push(a);
  d.clients.push(a.id);
  addCareerXp(profile, DOG_TRAINER_CAREER, CAREER_XP.accept);
  return { ok: true, a };
}

/** Niveau du problème principal (0 à 100). */
export const problemLevel = (a, id = a.client?.problem) => a.client?.problems?.[id] ?? 0;
export const isFixed = (a) => !!a.client && Object.values(a.client.problems).every((v) => v < FIXED_BELOW);
export const outOfSessions = (a) => !!a.client && a.client.sessionsDone >= a.client.sessionsNeeded && !isFixed(a);
/** Le maître doit revenir chercher son chien (réussi, ou séances épuisées). */
export const readyForDelivery = (a) => !!a.client && (isFixed(a) || outOfSessions(a));

/** Peut-on faire une séance aujourd'hui ? (une par jour et par animal, pas trop fatigué). */
export function canSession(a, day) {
  if (a.client && readyForDelivery(a)) return { ok: false, reason: 'done' };
  const last = a.client ? a.client.lastDay : a.dtLastDay ?? -1;
  if (last === day) return { ok: false, reason: 'today' };
  if ((a.needs?.energy ?? 100) < 15) return { ok: false, reason: 'tired' };
  return { ok: true };
}

/** La vitesse de progrès selon le rang : un expert règle les problèmes plus vite. */
export const rankSpeed = (rank) => 1 + rank * 0.25;

/**
 * Applique le résultat d'une séance (quality 0 à 1, ou null si abandonnée).
 * Une bonne séance baisse le problème (−15 à −30 %), une mauvaise le remonte un peu.
 * Renvoie { before, after, fixed, perfect, xp }.
 */
export function applySession(profile, a, id, quality, day) {
  const rank = dogTrainerRank(profile);
  const def = PROBLEMS[id] ?? COACHINGS[id];
  const q = Math.max(0, Math.min(1, quality ?? 0));
  const gain = (q < 0.45 ? -6 : 10 + q * 22) * rankSpeed(rank);
  let before = null;
  let after = null;
  if (a.client) {
    before = a.client.problems[id] ?? 0;
    after = Math.round(Math.max(0, Math.min(100, before - gain)));
    a.client.problems[id] = after;
    a.client.sessionsDone += 1;
    a.client.lastDay = day;
  } else {
    a.dtLastDay = day;
  }
  // Le chien progresse pour de vrai (tours, obéissance, lien).
  const k = Math.max(0.3, q) * rankSpeed(rank);
  for (const [skill, v] of Object.entries(def.gains)) {
    const n = Math.round(v * k);
    if (skill === 'obedience' || skill === 'herding' || skill === 'jump' || skill === 'speed') a.skills[skill] = Math.min(100, (a.skills[skill] ?? 10) + n);
    else if (skill === 'bond') a.bond = Math.min(100, (a.bond ?? 0) + n);
    else a.tricks[skill] = Math.min(100, (a.tricks[skill] ?? 0) + n);
  }
  a.needs.energy = Math.max(0, (a.needs.energy ?? 100) - 10);
  a.needs.exercise = Math.min(100, (a.needs.exercise ?? 50) + 20);
  a.needs.affection = Math.min(100, (a.needs.affection ?? 50) + 8);
  const perfect = q >= 0.85;
  const xp = a.client ? (perfect ? CAREER_XP.sessionPerfect : CAREER_XP.session) : CAREER_XP.coach;
  const r = addCareerXp(profile, DOG_TRAINER_CAREER, xp);
  profile.stats = profile.stats ?? {};
  profile.stats[a.client ? 'dtSessions' : 'dtCoach'] = (profile.stats[a.client ? 'dtSessions' : 'dtCoach'] ?? 0) + 1;
  if (COACHINGS[id]) profile.stats[`dtCoach_${id}`] = (profile.stats[`dtCoach_${id}`] ?? 0) + 1;
  return { before, after, fixed: a.client ? isFixed(a) : false, perfect, xp, rankUp: r.rankUp, rank: r.rank };
}

/**
 * Le maître récupère son chien. Renvoie ce qu'il se passe : étoiles, paiement, pourboire,
 * réputation gagnée ou perdue. success = problème réglé.
 */
export function deliveryResult(profile, a) {
  const c = a.client;
  const success = isFixed(a);
  const start = Object.values(c.start).reduce((s, v) => s + v, 0) / Math.max(1, Object.keys(c.start).length);
  const now = Object.values(c.problems).reduce((s, v) => s + v, 0) / Math.max(1, Object.keys(c.problems).length);
  const progress = Math.max(0, Math.min(1, (start - now) / Math.max(1, start)));
  const quick = c.sessionsDone <= Math.max(2, c.sessionsNeeded - 1);
  const stars = !success ? (progress > 0.5 ? 2 : 1) : quick || now < 5 ? 3 : 2;
  const base = c.price * c.sessionsDone;
  const pay = success ? base : Math.round(base * 0.5);
  const tip = success && stars === 3 ? Math.round(c.price * (c.rescue ? 2 : 1)) : 0;
  const repDelta = success ? (stars === 3 ? 8 : 5) : -4;
  const xp = success ? CAREER_XP.deliver * (c.rescue ? 2 : 1) : CAREER_XP.deliverFail;
  return { success, stars, pay, tip, repDelta, xp, progress };
}

/** Clôture : paiement, réputation, XP, historique ; le chien repart avec son maître. */
export function finishClient(profile, a, day) {
  const d = dogTrainerOf(profile);
  const r = deliveryResult(profile, a);
  earn(profile, r.pay + r.tip);
  d.earned = (d.earned ?? 0) + r.pay + r.tip;
  d.reputation = Math.max(0, Math.min(100, d.reputation + r.repDelta));
  const xp = addCareerXp(profile, DOG_TRAINER_CAREER, r.xp);
  d.history.unshift({ name: a.name, owner: a.client.ownerName, problem: a.client.problem, stars: r.stars, pay: r.pay + r.tip, day, success: r.success, rescue: a.client.rescue });
  while (d.history.length > 20) d.history.pop();
  d.clients = d.clients.filter((id) => id !== a.id);
  profile.animals = profile.animals.filter((x) => x.id !== a.id);
  profile.stats = profile.stats ?? {};
  profile.stats.dtDelivered = (profile.stats.dtDelivered ?? 0) + 1;
  if (r.success) profile.stats.dtSuccess = (profile.stats.dtSuccess ?? 0) + 1;
  if (r.stars === 3) profile.stats.dtStars3 = (profile.stats.dtStars3 ?? 0) + 1;
  return { ...r, rankUp: xp.rankUp, rank: xp.rank };
}

/**
 * Un nouveau client se présente-t-il aujourd'hui ? Niveau 3 requis, pas plus d'une visite par jour,
 * de la place à la niche, entre 9 h et 18 h ; plus de réputation = plus de visites.
 */
export function shouldClientArrive(profile, { day, hour, level, rng = Math.random }) {
  const d = dogTrainerOf(profile);
  if (level < DOG_TRAINER_CAREER.level) return false;
  if (profile.careers?.active && profile.careers.active !== 'dogTrainer') return false;
  if (hour < 9 || hour > 18) return false;
  if (d.lastVisitDay >= day) return false;
  if (clientDogs(profile).length >= maxClients(profile)) return false;
  d.lastVisitDay = day;
  // Le tout premier client vient toujours (c'est la découverte du métier).
  if (!d.history.length && !d.clients.length) return true;
  return rng() < 0.45 + d.reputation / 250;
}

/** Les actions du carnet, avec ✅ si déjà faites au moins une fois. */
export function careerBook(profile) {
  const d = dogTrainerOf(profile);
  const rank = dogTrainerRank(profile);
  const st = profile.stats ?? {};
  const done = {
    meetClient: d.clients.length + d.history.length > 0,
    session: (st.dtSessions ?? 0) > 0,
    deliver: d.history.length > 0,
    coachOwn: (st.dtCoach ?? 0) > 0,
    coachHerd: (st.dtCoach_herd ?? 0) > 0,
    coachAgility: (st.dtCoach_agility ?? 0) > 0,
    rescue: d.history.some((x) => x.rescue) || profile.animals.some((a) => a.client?.rescue),
  };
  return DOG_TRAINER_CAREER.actions.map((act) => ({ ...act, done: !!done[act.id], locked: rank < (act.rank ?? 0) }));
}

export { rankIndex };
