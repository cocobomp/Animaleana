// Métier « Éducateur canin » 🐕 : des maîtres viennent avec un chien qui a UN problème
// (tire en laisse, saute sur les gens, ne revient pas au rappel…) ; on le garde à la ferme, on fait
// une séance par jour, et quand le problème est presque réglé (ou au jour prévu), le maître revient
// le chercher : démonstration, étoiles, paiement, pourboire, réputation et XP de métier.
// Logique pure (testée dans tests/dogTrainer.test.js). La 3D est dans src/game/DogTrainer.js,
// l'interface dans src/ui/dogTrainer.js.
//
// Le métier est inscrit dans le registre commun (CAREERS.dogTrainer, src/sim/careers.js) : rang, XP,
// réputation, argent gagné et carnet d'actions sont dans profile.careers comme pour les autres métiers ;
// ce que change chaque rang est dans CAREERS.dogTrainer.perks.
// Ce qui est propre à l'éducateur canin est dans profile.dogTrainer = { clients, history, tutored, lastVisitDay, pending }.
// Un chien en éducation a a.client = { kind: 'training', problem, problems, start, sessionsDone,
// sessionsNeeded, ownerName, ownerSex, ownerSeed, price, since, until, rescue, lastDay }.

import { createAnimal, namesInUse } from './animal.js';
import { dailyCareScore, VISITOR_WAIT_HOURS } from './clients.js';
import { DAYS_PER_YEAR } from './time.js';
import { anyAvailable } from './species.js'; // espèces proposées (coaching du troupeau)
import { earn } from './profile.js';
import { pick, randRange } from './rng.js';
import {
  CAREERS, rankOf, perksOf, addCareerXp, reputationOf, changeReputation, addEarnings, noteAction, isStarted, carnet,
} from './careers.js';

export const CAREER_ID = 'dogTrainer';
/** La définition du métier (registre commun) : { id, emoji, level, building, ranks, actions, perks }. */
export const DOG_TRAINER_CAREER = CAREERS[CAREER_ID];

/**
 * Les problèmes qu'on sait régler. `game` : le mini-jeu de la séance ; `gains` : ce que chaque
 * séance fait progresser (tours, obéissance, lien) ; `sessions` : combien il en faut (min, max).
 */
export const PROBLEMS = {
  obey: { emoji: '✋', game: 'dt_obey', gains: { sit: 12, down: 8, obedience: 6 }, sessions: [3, 4] },
  pull: { emoji: '🦮', game: 'dt_pull', gains: { heel: 14, obedience: 5 }, sessions: [3, 5] },
  jump: { emoji: '🙅', game: 'dt_jump', gains: { down: 10, obedience: 6 }, sessions: [3, 4] },
  recall: { emoji: '📣', game: 'dt_recall', gains: { fetch: 10, obedience: 7 }, sessions: [3, 5] },
  bark: { emoji: '🤫', game: 'dt_bark', gains: { obedience: 8 }, sessions: [3, 5] },
  shy: { emoji: '🫣', game: 'dt_shy', gains: { obedience: 4, bond: 6 }, sessions: [4, 5] },
};
export const PROBLEM_IDS = Object.keys(PROBLEMS);

/** Coaching de ses propres animaux (gratuit) : les mêmes séances + deux spécialités. */
export const COACHINGS = {
  // needs : un troupeau possible dans la partie (moutons, chèvres ou vaches proposés ou déjà là : src/sim/species.js)
  herd: { emoji: '🐑', game: 'dt_herd', gains: { herding: 6, obedience: 2 }, rank: 1, species: ['dog'], needs: ['sheep', 'goat', 'cow'] },
  agility: { emoji: '🎯', game: 'dt_agility', gains: { jump: 5, speed: 4, obedience: 2 }, rank: 2, species: ['dog', 'cat', 'rabbit'] },
};

/**
 * Séances possibles pour un animal à soi, selon l'espèce (chiens : tout ; chats, chevaux, lapins : ordres et rappel).
 * profile : sans troupeau possible dans la partie, pas de coaching « chien de troupeau » (needs).
 */
export function coachingsFor(a, rank = 0, profile = null) {
  const out = [];
  if (a.species === 'dog') out.push(...PROBLEM_IDS);
  else if (['cat', 'horse', 'rabbit'].includes(a.species)) out.push('obey', 'recall');
  for (const [id, c] of Object.entries(COACHINGS)) {
    if (c.species.includes(a.species) && rank >= c.rank && (!profile || anyAvailable(profile, c.needs))) out.push(id);
  }
  return out;
}

export const FIXED_BELOW = 15; // en dessous de ce niveau de problème, c'est réglé
export const SESSION_MINUTES = 8; // temps de jeu que prend une séance
export const BASE_PRICE = 20; // prix d'une séance (× réputation, × rang)
export const EXTRA_DAYS = 3; // jours de marge avant que le maître revienne quand même
export const CAREER_XP = { accept: 10, session: 15, sessionPerfect: 25, deliver: 60, deliverFail: 20, coach: 8 };

export const defaultDogTrainer = () => ({ clients: [], history: [], tutored: {}, lastVisitDay: 0, pending: null });

/** profile.dogTrainer existe toujours (vieilles sauvegardes complétées). */
export function dogTrainerOf(profile) {
  if (!profile.dogTrainer) profile.dogTrainer = defaultDogTrainer();
  const d = profile.dogTrainer;
  d.clients = d.clients ?? [];
  d.history = d.history ?? [];
  d.tutored = d.tutored ?? {};
  d.lastVisitDay = d.lastVisitDay ?? 0;
  d.pending = d.pending ?? null; // le maître qui attend une réponse (setPending)
  return d;
}

export const isTrainingClient = (a) => a?.client?.kind === 'training';
export const dogTrainerRank = (profile) => rankOf(profile, CAREER_ID);
export const dogTrainerStarted = (profile) => isStarted(profile, CAREER_ID);
export const dogTrainerReputation = (profile) => reputationOf(profile, CAREER_ID);
/** Les avantages du rang actuel (CAREERS.dogTrainer.perks). */
export const dogTrainerPerks = (profile) => perksOf(profile, CAREER_ID);

/** XP de métier (+ coche une action du carnet). Renvoie { rankUp, rank }. */
function gain(profile, xp, action = null) {
  const before = dogTrainerRank(profile);
  addCareerXp(profile, CAREER_ID, xp);
  if (action) noteAction(profile, CAREER_ID, action);
  const rank = dogTrainerRank(profile);
  return { rankUp: rank > before, rank };
}

const OWNERS = [
  ['Mme Dupont', 'f'], ['M. Martin', 'm'], ['Léa', 'f'], ['Papi Jean', 'm'], ['Mamie Rose', 'f'], ['Karim', 'm'],
  ['Mme Leroy', 'f'], ['Tom', 'm'], ['Nour', 'f'], ['M. Garcia', 'm'], ['Camille', 'f'], ['Oscar', 'm'],
];

/** Prix d'une séance : la réputation et le rang font monter le tarif. */
export function sessionPrice(profile) {
  const perks = dogTrainerStarted(profile) ? dogTrainerPerks(profile) : DOG_TRAINER_CAREER.perks[0];
  return Math.round(BASE_PRICE * (0.7 + (dogTrainerReputation(profile) / 100) * 0.6) * perks.price);
}

/** Les chiens clients en pension d'éducation. */
export const clientDogs = (profile) => profile.animals.filter(isTrainingClient);

/** Combien de chiens en éducation en même temps (selon le rang). */
export const maxClients = (profile) => (dogTrainerStarted(profile) ? dogTrainerPerks(profile) : DOG_TRAINER_CAREER.perks[0]).maxClients;

/** Le tout premier client (découverte du métier) : un chien qui n'obéit pas aux ordres de base. */
export const isFirstClient = (profile) => {
  const d = dogTrainerOf(profile);
  return !d.history.length && !d.clients.length;
};

/**
 * Un maître se présente avec son chien. rescue (rang expert) : un chien de refuge avec deux problèmes.
 * Renvoie { ownerName, ownerSex, ownerSeed, dog, problems: { id: niveau }, sessionsNeeded, price, rescue, main }.
 */
export function makeClientRequest(profile, { day = 1, rng = Math.random, problem = null, rescue = false } = {}) {
  const perks = dogTrainerStarted(profile) ? dogTrainerPerks(profile) : DOG_TRAINER_CAREER.perks[0];
  const [ownerName, ownerSex] = pick(OWNERS, rng);
  const pool = perks.problems.filter((id) => PROBLEMS[id]);
  const main = problem && PROBLEMS[problem] ? problem : isFirstClient(profile) ? 'obey' : pick(pool, rng);
  const isRescue = !!rescue && !!perks.rescue;
  const problems = { [main]: Math.round(randRange(60, 90, rng)) };
  if (isRescue) {
    const other = pick(pool.filter((p) => p !== main), rng);
    problems[other] = Math.round(randRange(50, 75, rng));
  }
  // Un chien adulte (1,5 à 7 ans ; une année de jeu = DAYS_PER_YEAR jours).
  const dog = createAnimal({ species: 'dog', location: profile.place, day, rng, ageDays: Math.round(randRange(1.5 * DAYS_PER_YEAR, 7 * DAYS_PER_YEAR, rng)), avoidNames: namesInUse(profile) });
  // Un chien pas encore éduqué : peu d'obéissance, peu de tours ; il vient avec SON collier et SA laisse
  // (own : ce n'est pas le matériel de ta sellerie, src/sim/gear.js ne le compte pas).
  dog.skills.obedience = Math.round(randRange(5, 20, rng));
  dog.tricks = {};
  dog.bond = 8;
  dog.gear = { neck: { item: 'collar', color: pick(['red', 'navy', 'green', 'purple', 'pink'], rng), own: true }, leash: { item: 'leash', own: true } };
  const [smin, smax] = PROBLEMS[main].sessions;
  const sessionsNeeded = Math.round(randRange(smin, smax + (isRescue ? 1 : 0), rng));
  const ownerSeed = Math.floor(rng() * 1000);
  return { ownerName, ownerSex, ownerSeed, dog, problems, sessionsNeeded, price: sessionPrice(profile), rescue: isRescue, main };
}

/** Accepte le client : le chien reste à la ferme (a.client) jusqu'à la fin des séances. */
export function acceptClient(profile, req, day) {
  const d = dogTrainerOf(profile);
  if (clientDogs(profile).length >= maxClients(profile)) return { ok: false, reason: 'full', n: maxClients(profile) };
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
    ownerSeed: req.ownerSeed ?? 0,
    price: req.price,
    since: day,
    until: day + req.sessionsNeeded + EXTRA_DAYS,
    rescue: !!req.rescue,
    lastDay: -1,
  };
  profile.animals.push(a);
  d.clients.push(a.id);
  profile.stats = profile.stats ?? {};
  profile.stats.dtClients = (profile.stats.dtClients ?? 0) + 1;
  if (req.rescue) noteAction(profile, CAREER_ID, 'rescue');
  return { ok: true, a, ...gain(profile, CAREER_XP.accept, 'meetClient') };
}

/** Le problème à travailler maintenant : le plus fort de ceux qui ne sont pas encore réglés (ou null). */
export function nextProblem(a) {
  if (!isTrainingClient(a)) return null;
  const left = Object.entries(a.client.problems).filter(([, v]) => v >= FIXED_BELOW);
  if (!left.length) return null;
  return left.sort((x, y) => y[1] - x[1])[0][0];
}

/** Niveau du problème principal (0 à 100). */
export const problemLevel = (a, id = a.client?.problem) => (isTrainingClient(a) ? a.client.problems[id] ?? 0 : 0);
export const isFixed = (a) => isTrainingClient(a) && Object.values(a.client.problems).every((v) => v < FIXED_BELOW);
export const outOfSessions = (a) => isTrainingClient(a) && a.client.sessionsDone >= a.client.sessionsNeeded && !isFixed(a);
/** Le jour prévu est passé : le maître revient quand même (avec ce qui a été fait). */
export const isOverdue = (a, day) => isTrainingClient(a) && day !== undefined && day > a.client.until;
/** Le maître doit revenir chercher son chien (réussi, séances épuisées, ou jour prévu passé). */
export const readyForDelivery = (a, day) => isTrainingClient(a) && (isFixed(a) || outOfSessions(a) || isOverdue(a, day));
/** Jours avant le retour prévu du maître (0 = aujourd'hui). */
export const daysLeft = (a, day) => (isTrainingClient(a) ? Math.max(0, a.client.until - day) : 0);

/** Peut-on faire une séance aujourd'hui ? (une par jour et par animal, pas trop fatigué). */
export function canSession(a, day) {
  if (a.client && !isTrainingClient(a)) return { ok: false, reason: 'notYours' }; // pension / soins : pas d'éducation
  if (readyForDelivery(a, day)) return { ok: false, reason: 'done' };
  const last = isTrainingClient(a) ? a.client.lastDay : a.dtLastDay ?? -1;
  if (last === day) return { ok: false, reason: 'today' };
  if ((a.needs?.energy ?? 100) < 15) return { ok: false, reason: 'tired' };
  return { ok: true };
}

/** La vitesse de progrès selon le rang (perks.speed) : un expert règle les problèmes plus vite. */
export const rankSpeed = (profile) => (dogTrainerStarted(profile) ? dogTrainerPerks(profile).speed ?? 1 : 1);

/** Quelle action du carnet une séance coche. */
const sessionAction = (a, id) => (isTrainingClient(a) ? 'session' : id === 'herd' ? 'coachHerd' : id === 'agility' ? 'coachAgility' : 'coachOwn');

/**
 * Applique le résultat d'une séance (quality 0 à 1).
 * Une bonne séance baisse le problème (−15 à −30 points × vitesse du rang), une mauvaise le remonte un peu.
 * Renvoie { before, after, fixed, perfect, xp, rankUp, rank } (before/after : null pour un animal à soi).
 */
export function applySession(profile, a, id, quality, day) {
  const speed = rankSpeed(profile);
  const client = isTrainingClient(a);
  const def = PROBLEMS[id] ?? COACHINGS[id];
  const q = Math.max(0, Math.min(1, quality ?? 0));
  const drop = q < 0.45 ? -6 : (10 + q * 22) * speed;
  let before = null;
  let after = null;
  if (client) {
    before = a.client.problems[id] ?? 0;
    after = Math.round(Math.max(0, Math.min(100, before - drop)));
    a.client.problems[id] = after;
    a.client.sessionsDone += 1;
    a.client.lastDay = day;
  } else {
    a.dtLastDay = day;
  }
  // Le chien progresse pour de vrai (tours, obéissance, lien).
  const k = Math.max(0.3, q) * speed;
  a.skills = a.skills ?? {};
  a.tricks = a.tricks ?? {};
  for (const [skill, v] of Object.entries(def.gains)) {
    const n = Math.round(v * k);
    if (skill === 'obedience' || skill === 'herding' || skill === 'jump' || skill === 'speed') a.skills[skill] = Math.min(100, (a.skills[skill] ?? 10) + n);
    else if (skill === 'bond') a.bond = Math.min(100, (a.bond ?? 0) + n);
    else a.tricks[skill] = Math.min(100, (a.tricks[skill] ?? 0) + n);
  }
  a.needs = a.needs ?? {};
  a.needs.energy = Math.max(0, (a.needs.energy ?? 100) - 10);
  a.needs.exercise = Math.min(100, (a.needs.exercise ?? 50) + 20);
  a.needs.affection = Math.min(100, (a.needs.affection ?? 50) + 8);
  const perfect = q >= 0.85;
  const xp = client ? (perfect ? CAREER_XP.sessionPerfect : CAREER_XP.session) : CAREER_XP.coach;
  const r = gain(profile, xp, sessionAction(a, id));
  profile.stats = profile.stats ?? {};
  const key = client ? 'dtSessions' : 'dtCoach';
  profile.stats[key] = (profile.stats[key] ?? 0) + 1;
  if (COACHINGS[id]) profile.stats[`dtCoach_${id}`] = (profile.stats[`dtCoach_${id}`] ?? 0) + 1;
  return { before, after, fixed: isFixed(a), perfect, xp, ...r };
}

// ---------------------------------------------------------------- bien-être du chien confié

export const CARE_GOOD = 50; // note de soin (0 à 100, comme la pension) en dessous de laquelle le maître le remarque
export const CARE_BAD = 30; // en dessous : il est fâché (une étoile, moitié de la paye, réputation en baisse)
export const NEED_LOW = 30; // faim, soif ou propreté sous ce niveau : on prévient sur la fiche du chien
const CARE_PAY = { good: 1, poor: 0.75, bad: 0.5 };

/**
 * Ce qui ne va pas chez le chien confié : 'sick', 'hunger', 'thirst', 'hygiene' (le besoin le plus bas sous
 * NEED_LOW), 'other' (note de soin trop basse) ou null s'il va bien.
 */
export function neglectReason(a, score = dailyCareScore(a)) {
  if (a.sick) return 'sick';
  const low = ['hunger', 'thirst', 'hygiene'].filter((n) => (a.needs?.[n] ?? 100) < NEED_LOW)
    .sort((x, y) => a.needs[x] - a.needs[y])[0];
  return low ?? (score < CARE_GOOD ? 'other' : null);
}

/**
 * Le chien est chez nous pendant son éducation : comment va-t-il ? { score, level, reason } ;
 * level 'good', 'poor' (quelque chose ne va pas : note sous CARE_GOOD, malade, affamé, assoiffé ou sale ;
 * c'est aussi ce qui fait apparaître l'alerte sur sa fiche) ou 'bad' (note sous CARE_BAD).
 */
export function careCheck(a) {
  const score = dailyCareScore(a);
  const reason = neglectReason(a, score);
  const level = score < CARE_BAD ? 'bad' : reason ? 'poor' : 'good';
  return { score, level, reason };
}

/**
 * Le maître récupère son chien. Renvoie ce qu'il se passe : étoiles, paiement, pourboire,
 * réputation gagnée ou perdue. success = problème réglé. Le chien rentré mal soigné (affamé, assoiffé,
 * sale ou malade : careCheck) donne moins d'étoiles, une paye réduite et de la réputation en moins, même
 * si son problème est réglé (avant, un chien malade et affamé valait ★★★ « Incroyable ! »).
 */
export function deliveryResult(profile, a) {
  const c = a.client;
  const success = isFixed(a);
  const avg = (o) => Object.values(o).reduce((s, v) => s + v, 0) / Math.max(1, Object.keys(o).length);
  const start = avg(c.start);
  const now = avg(c.problems);
  const progress = Math.max(0, Math.min(1, (start - now) / Math.max(1, start)));
  const quick = c.sessionsDone <= Math.max(2, c.sessionsNeeded - 1);
  const care = careCheck(a);
  let stars = !success ? (progress > 0.5 ? 2 : 1) : quick || now < 5 ? 3 : 2;
  if (care.level === 'poor') stars = Math.min(stars, 2);
  if (care.level === 'bad') stars = 1;
  const base = c.price * c.sessionsDone;
  const pay = Math.round(base * (success ? 1 : 0.5) * CARE_PAY[care.level]);
  const tips = dogTrainerStarted(profile) ? dogTrainerPerks(profile).tips : false;
  const tip = success && stars === 3 && tips ? Math.round(c.price * (c.rescue ? 2 : 1)) : 0;
  const repDelta = care.level === 'bad' ? (success ? -6 : -8)
    : !success ? -4
      : care.level === 'poor' ? 2 : stars === 3 ? 8 : 5;
  const xp = success && care.level !== 'bad' ? CAREER_XP.deliver * (c.rescue ? 2 : 1) : CAREER_XP.deliverFail;
  return { success, stars, pay, tip, repDelta, xp, progress, care: care.level, careScore: care.score, neglect: care.reason };
}

/** Clôture : paiement, réputation, XP, historique ; le chien repart avec son maître. */
export function finishClient(profile, a, day) {
  const d = dogTrainerOf(profile);
  const r = deliveryResult(profile, a);
  earn(profile, r.pay + r.tip);
  addEarnings(profile, CAREER_ID, r.pay + r.tip);
  const reputation = changeReputation(profile, CAREER_ID, r.repDelta);
  const xp = gain(profile, r.xp, 'deliver');
  d.history.unshift({ name: a.name, owner: a.client.ownerName, problem: a.client.problem, stars: r.stars, pay: r.pay + r.tip, day, success: r.success, rescue: a.client.rescue });
  while (d.history.length > 20) d.history.pop();
  d.clients = d.clients.filter((id) => id !== a.id);
  profile.animals = profile.animals.filter((x) => x.id !== a.id);
  profile.stats = profile.stats ?? {};
  profile.stats.dtDelivered = (profile.stats.dtDelivered ?? 0) + 1;
  if (r.success) profile.stats.dtSuccess = (profile.stats.dtSuccess ?? 0) + 1;
  if (r.stars === 3) profile.stats.dtStars3 = (profile.stats.dtStars3 ?? 0) + 1;
  return { ...r, ...xp, reputation };
}

/**
 * Un nouveau client se présente-t-il aujourd'hui ? Métier commencé (💼 Métiers, ou en touchant la niche),
 * pas plus d'une visite par jour, de la place à la niche, entre 9 h et 18 h ; plus de réputation = plus de visites.
 */
export function shouldClientArrive(profile, { day, hour, rng = Math.random }) {
  const d = dogTrainerOf(profile);
  if (!dogTrainerStarted(profile)) return false; // (le niveau requis est vérifié quand on commence le métier)
  if (hour < 9 || hour > 18) return false;
  if (d.lastVisitDay >= day) return false;
  if (clientDogs(profile).length >= maxClients(profile)) return false;
  d.lastVisitDay = day;
  // Le tout premier client vient toujours (c'est la découverte du métier).
  if (isFirstClient(profile)) return true;
  return rng() < 0.45 + dogTrainerReputation(profile) / 250;
}

/**
 * Le maître qui attend une réponse est gardé dans le profil : profile.dogTrainer.pending = { req, day, expires }.
 * Après un rechargement (ou un voyage), il revient le même jour au lieu de disparaître : sa visite du jour
 * est déjà comptée (lastVisitDay), et le tout premier client doit toujours venir. Comme le visiteur de la
 * pension (profile.clients.visitor), il n'attend pas plus de VISITOR_WAIT_HOURS (2 h de jeu) : expires
 * (minutes, comme profile.clock) ; ensuite il repart (src/game/DogTrainer.js) et la demande est oubliée.
 * Le même maître qui revient (rechargement) garde son heure de départ. Le lendemain, la demande est oubliée.
 */
export function setPending(profile, req, day, clock = null) {
  const d = dogTrainerOf(profile);
  const old = d.pending;
  const same = old && old.day === day && (old.req === req || (old.req?.dog?.id && old.req.dog.id === req?.dog?.id));
  const expires = same && old.expires != null ? old.expires : clock === null ? null : clock + VISITOR_WAIT_HOURS * 60;
  d.pending = { req, day, expires };
}

/** Le maître attend depuis plus de 2 h (clock : profile.clock, en minutes). */
export function pendingExpired(profile, clock) {
  const pend = dogTrainerOf(profile).pending;
  return !!pend && pend.expires != null && clock >= pend.expires;
}

/**
 * La demande du maître qui attendait aujourd'hui (ou null ; une demande d'un autre jour, ou plus vieille
 * que 2 h si clock est donné, est effacée).
 */
export function pendingRequest(profile, day, clock = null) {
  const d = dogTrainerOf(profile);
  const pend = d.pending;
  if (!pend) return null;
  const done = !pend.req?.dog || profile.animals.some((a) => a.id === pend.req.dog.id); // (déjà accepté)
  if (pend.day !== day || done || (clock !== null && pendingExpired(profile, clock))) {
    d.pending = null;
    return null;
  }
  return pend.req;
}

export function clearPending(profile) {
  dogTrainerOf(profile).pending = null;
}

/** Le carnet du métier (registre commun) : [{ id, emoji, where, rank?, done, locked }]. */
export const careerBook = (profile) => carnet(profile, CAREER_ID);
