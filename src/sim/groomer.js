// Métier « Toiletteur ✂️ » : le salon de toilettage, les clients qui viennent avec leur animal,
// les étapes du toilettage (bain, brossage, coupe…), la note du client (étoiles), la paye,
// la réputation, l'expérience du métier et ses rangs, les accessoires (nœuds, bandanas…)
// et la coupe de ses propres animaux. Logique pure, testée dans tests/groomer.test.js.

import { createAnimal, namesInUse } from './animal.js';
import { SPECIES, isOffered } from './species.js';
import { uid, pick } from './rng.js';
import { levelOf } from './progress.js';
import { dayOf } from './time.js';
// Le métier est inscrit dans LE registre des métiers (CAREERS.groomer, src/sim/careers.js) :
// il apparaît dans 💼 Métiers comme le vétérinaire, avec le même compteur d'XP et la même réputation.
import { CAREERS, careerState, reputationOf, changeReputation, addEarnings, rankOf as careerRank, perksOf } from './careers.js';

// ---------------------------------------------------------------- le métier

/** La définition du métier dans le registre (src/sim/careers.js). */
export const GROOMER_CAREER = CAREERS.groomer;

/** Niveau du joueur nécessaire pour ouvrir un salon. */
export const GROOMER_LEVEL = GROOMER_CAREER.level;

/** Rangs du métier (noms des textes grm_rank_*) et XP de métier nécessaire (celle du registre). */
export const RANKS = ['apprenti', 'confirme', 'expert'].map((id, i) => ({ id, xp: GROOMER_CAREER.ranks[i] }));

/**
 * Étapes d'un toilettage. game : le mini-jeu joué (ceux des soins, ou les nouveaux de minigames/groomer.js).
 * care : le soin équivalent pour ses propres animaux (bain = laver…). rank : rang minimum.
 * species : les espèces concernées (toutes si absent). carnet : l'action du carnet (💼 Métiers) qu'elle coche.
 */
export const STEPS = {
  bath: { emoji: '🫧', game: 'wash', care: 'wash', rank: 0, species: ['dog', 'cat', 'rabbit', 'horse'], carnet: 'bath' },
  dry: { emoji: '💨', game: 'gdry', rank: 0, species: ['dog', 'cat', 'rabbit', 'horse'], carnet: 'dry' },
  brush: { emoji: '🪮', game: 'brush', care: 'brush', rank: 0, carnet: 'brush' },
  knots: { emoji: '🧶', game: 'gknots', rank: 0, carnet: 'brush' },
  nails: { emoji: '💅', game: 'nails', care: 'nails', rank: 0, species: ['dog', 'cat', 'rabbit'], carnet: 'nails' },
  ears: { emoji: '👂', game: 'gears', rank: 0, species: ['dog', 'cat', 'rabbit', 'horse'] },
  teeth: { emoji: '🦷', game: 'gteeth', rank: 0, species: ['dog', 'cat'] },
  cut: { emoji: '✂️', game: 'gcut', rank: 0, carnet: 'cut' },
  finish: { emoji: '🎀', game: 'gfinish', rank: 0, carnet: 'finish' },
};
export const STEP_IDS = Object.keys(STEPS);
/** Cette étape se fait-elle sur cette espèce ? (pas de griffes à couper au cheval : il a des fers) */
export const stepFor = (id, species) => !!STEPS[id] && (!STEPS[id].species || !species || STEPS[id].species.includes(species));

/** Coupes : rang minimum et espèces possibles (toutes si absent). */
export const STYLES = {
  court: { emoji: '✂️', rank: 0 },
  long: { emoji: '🌾', rank: 1 },
  lion: { emoji: '🦁', rank: 1, species: ['dog', 'cat'] },
  caniche: { emoji: '🐩', rank: 1, species: ['dog'] },
  // (coupe du lagotto romagnolo : boucles égalisées sur le corps, pattes bouclées, tête ronde avec sourcils et barbe)
  lagotto: { emoji: '🍄', rank: 1, species: ['dog'] },
  coeur: { emoji: '💗', rank: 1 },
  tonte: { emoji: '🐎', rank: 1, species: ['horse', 'sheep'] },
  concours: { emoji: '🏆', rank: 2 },
};

/** Espèces acceptées au salon à chaque rang (avantages du registre : perks[rang].species). */
export const SPECIES_BY_RANK = GROOMER_CAREER.perks.map((k, i) => k.species.filter((s) => i === 0 || !GROOMER_CAREER.perks[i - 1].species.includes(s)));

/** Demandes des clients : étapes attendues, coupe, prix de base, rang et espèces. */
export const REQUESTS = {
  bathCut: { rank: 0, species: ['dog', 'cat', 'rabbit'], steps: ['bath', 'dry', 'cut'], style: 'court', price: 40 },
  knots: { rank: 0, species: ['dog', 'cat', 'rabbit'], steps: ['knots', 'brush'], price: 25 },
  nailsEars: { rank: 0, species: ['dog', 'cat', 'rabbit'], steps: ['nails', 'ears'], price: 25 },
  fresh: { rank: 0, species: ['dog', 'cat', 'rabbit'], steps: ['bath', 'dry', 'brush', 'finish'], price: 35 },
  teeth: { rank: 0, species: ['dog', 'cat'], steps: ['teeth', 'brush'], price: 20 },
  spa: { rank: 0, species: ['dog', 'cat', 'rabbit'], steps: ['bath', 'dry', 'knots', 'nails', 'finish'], price: 55 },
  lion: { rank: 1, species: ['dog', 'cat'], steps: ['bath', 'dry', 'cut'], style: 'lion', price: 60 },
  poodle: { rank: 1, species: ['dog'], breeds: ['caniche', 'labradoodle', 'spitz_nain'], steps: ['bath', 'dry', 'cut', 'finish'], style: 'caniche', price: 70 },
  // (les boucles du lagotto feutrent vite : démêlage avant la coupe)
  lagotto: { rank: 1, species: ['dog'], breeds: ['lagotto'], steps: ['bath', 'dry', 'knots', 'cut'], style: 'lagotto', price: 65 },
  heart: { rank: 1, species: ['dog', 'cat', 'rabbit'], steps: ['brush', 'cut', 'finish'], style: 'coeur', price: 55 },
  horseMane: { rank: 1, species: ['horse'], steps: ['knots', 'brush', 'bath', 'dry'], price: 70 },
  horseClip: { rank: 1, species: ['horse'], steps: ['bath', 'dry', 'cut'], style: 'tonte', price: 90 },
  show: { rank: 2, species: ['dog', 'cat', 'rabbit', 'horse'], steps: ['bath', 'dry', 'knots', 'brush', 'cut', 'finish'], style: 'concours', price: 140 },
  sheepShow: { rank: 2, species: ['sheep'], steps: ['knots', 'cut', 'finish'], style: 'tonte', price: 110 },
};

/** Accessoires cosmétiques : où ils se portent et leur prix. */
export const ACCESSORIES = {
  ribbon: { slot: 'head', emoji: '🎀', price: 15 },
  flower: { slot: 'head', emoji: '🌸', price: 10 },
  hat: { slot: 'head', emoji: '🎩', price: 30, rank: 1 },
  bow: { slot: 'neck', emoji: '🎗️', price: 15 },
  bandana: { slot: 'neck', emoji: '🧣', price: 20 },
  bell: { slot: 'neck', emoji: '🔔', price: 25 },
  tailBow: { slot: 'tail', emoji: '🪢', price: 12 },
};
export const ACC_SLOTS = ['head', 'neck', 'tail'];
export const ACC_COLORS = {
  pink: 0xff7eb6, red: 0xe03d3d, blue: 0x3b7dd8, yellow: 0xf2c94c, purple: 0x9b59d0, green: 0x3fae62, white: 0xf7f3ea,
};

/** Nombre de jours pendant lesquels une coupe reste belle (bonus au concours de beauté). */
export const CUT_DAYS = 6;
/** Clients qui peuvent attendre devant le salon (au rang apprenti ; voir maxWaiting). */
export const MAX_WAITING = GROOMER_CAREER.perks[0].salonClients;

// ---------------------------------------------------------------- profil

/** État sauvegardé dans profile.groomer. */
export function defaultGroomerState() {
  return { clients: [], history: [], seen: [], nextClientAt: 0, served: 0 };
}

/** S'assure que le profil a tout ce qu'il faut (anciennes sauvegardes). */
export function ensureGroomer(profile) {
  careerState(profile); // profile.careers (src/sim/careers.js)
  if (!profile.groomer) profile.groomer = defaultGroomerState();
  else for (const [k, v] of Object.entries(defaultGroomerState())) if (profile.groomer[k] === undefined) profile.groomer[k] = v;
  return profile.groomer;
}

export const careerXp = (p) => p.careers?.xp?.groomer ?? 0;

/** Rang (0, 1, 2) selon une XP de métier (paliers du registre). */
export function rankIndexFor(xp) {
  let r = 0;
  RANKS.forEach((k, i) => { if (xp >= k.xp) r = i; });
  return r;
}
/** Rang du joueur dans le métier : celui du registre (src/sim/careers.js, rankOf). */
export const rankOf = (p) => careerRank(p, 'groomer');
export const rankId = (p) => RANKS[rankOf(p)].id;

/** Progression vers le rang suivant : { rank, xp, next, share } (next = null au dernier rang). */
export function rankProgress(p) {
  const xp = careerXp(p);
  const i = rankOf(p);
  const next = RANKS[i + 1] ?? null;
  const from = RANKS[i].xp;
  return { rank: i, xp, next: next?.xp ?? null, share: next ? Math.min(1, (xp - from) / (next.xp - from)) : 1 };
}

/** Réputation du salon (celle du métier dans profile.careers.reputation, 50 au départ). */
export const reputation = (p) => reputationOf(p, 'groomer');

/**
 * Ajoute de l'XP de métier (le compteur du registre, profile.careers.xp.groomer, celui de 💼 Métiers).
 * Même avant d'avoir « commencé » le métier dans 💼 Métiers, toiletter ses animaux compte déjà.
 * Renvoie { rankUp: bool, rank }.
 */
export function addCareerXp(p, n) {
  const st = careerState(p);
  const before = rankOf(p);
  st.xp.groomer = (st.xp.groomer ?? 0) + Math.max(0, Math.round(n));
  const after = rankOf(p);
  return { rankUp: after > before, rank: after };
}

/** Peut-on exercer ? (niveau du joueur) */
export const canGroom = (p) => levelOf(p.xp ?? 0) >= GROOMER_LEVEL;

/** Le salon de toilettage du lieu (construction), ou null. */
export const salonAt = (p, place) => (p.structures ?? []).find((s) => s.type === 'salon' && s.place === place) ?? null;
export const hasSalon = (p) => (p.structures ?? []).some((s) => s.type === 'salon');

const sandbox = (p) => p.mode === 'sandbox';
const pay = (p, n) => { if (!sandbox(p)) p.money += n; };
const charge = (p, n) => {
  if (sandbox(p) || !n) return true;
  if (p.money < n) return false;
  p.money -= n;
  return true;
};
const stat = (p, k, n = 1) => { p.stats = p.stats ?? {}; p.stats[k] = (p.stats[k] ?? 0) + n; };

// ---------------------------------------------------------------- étapes, coupes et espèces disponibles

/** Espèces acceptées au salon à ce rang (avantages du registre). */
export const speciesAllowed = (p) => perksOf(p, 'groomer').species;
/** Clients qui peuvent attendre devant le salon à ce rang. */
export const maxWaiting = (p) => perksOf(p, 'groomer').salonClients ?? MAX_WAITING;
export const stepAllowed = (p, id) => (STEPS[id]?.rank ?? 99) <= rankOf(p);
export const styleAllowed = (p, id, species) => {
  const s = STYLES[id];
  return !!s && s.rank <= rankOf(p) && (!s.species || !species || s.species.includes(species));
};
export const stylesFor = (p, species) => Object.keys(STYLES).filter((id) => styleAllowed(p, id, species));
export const accessoryAllowed = (p, id) => (ACCESSORIES[id]?.rank ?? 0) <= rankOf(p);

/** Demandes possibles à ce rang. */
export const requestsFor = (p) => Object.entries(REQUESTS).filter(([, r]) => r.rank <= rankOf(p)).map(([id]) => id);

// ---------------------------------------------------------------- clients

const OWNERS = [
  ['Léa', 'f'], ['Nino', 'm'], ['Camille', 'f'], ['Sacha', 'm'], ['Inès', 'f'], ['Tom', 'm'], ['Jade', 'f'], ['Malo', 'm'],
  ['Zoé', 'f'], ['Gabin', 'm'], ['Mme Dupuis', 'f'], ['M. Martin', 'm'], ['Mamie Rose', 'f'], ['Papi Jean', 'm'],
];

/**
 * Un nouveau client : un propriétaire et son animal, avec une demande.
 * opts : { rng, day, requestId (forcer une demande), species }.
 */
export function newClient(profile, opts = {}) {
  const rng = opts.rng ?? Math.random;
  const day = opts.day ?? dayOf(profile.clock ?? 0);
  // Seulement des demandes pour une espèce proposée (OFFERED_SPECIES, src/sim/species.js) : pas de
  // concours des moutons tant que les moutons ne sont pas proposés.
  const allowed = requestsFor(profile).filter((id) => REQUESTS[id].species.some(isOffered));
  let requestId = opts.requestId && REQUESTS[opts.requestId] ? opts.requestId : null;
  if (!requestId) {
    // Les demandes de son rang sont un peu plus fréquentes que celles des rangs précédents.
    const rank = rankOf(profile);
    const weighted = allowed.flatMap((id) => (REQUESTS[id].rank === rank ? [id, id] : [id]));
    requestId = pick(weighted, rng);
  }
  const req = REQUESTS[requestId];
  const offered = req.species.filter(isOffered);
  // (opts.species et opts.requestId forcent le client, pour tester : src/game/Groomer.js, force)
  const species = opts.species && req.species.includes(opts.species) ? opts.species : pick(offered.length ? offered : req.species, rng);
  const sp = SPECIES[species];
  const breedPool = req.breeds ? sp.breeds.filter((b) => req.breeds.includes(b.id)) : sp.breeds.filter((b) => b.rarity <= (rankOf(profile) >= 2 ? 3 : 2));
  const breed = pick(breedPool.length ? breedPool : sp.breeds, rng);
  const animal = createAnimal({ species, breed: breed.id, location: 'salon', rng, day, avoidNames: namesInUse(profile) });
  animal.guest = true; // n'appartient pas au joueur : repart avec son maître
  animal.needs.hygiene = Math.round(20 + rng() * 30);
  animal.needs.grooming = Math.round(15 + rng() * 30);
  const [name, sex] = pick(OWNERS, rng);
  const bonus = Math.round(req.price * Math.min(0.5, reputation(profile) / 200));
  return {
    id: uid(),
    owner: { name, sex, seed: Math.floor(rng() * 1000) },
    animal,
    request: requestId,
    style: req.style ?? null,
    steps: req.steps.map((id) => ({ id, quality: null })),
    extra: [], // étapes en plus (non demandées)
    price: req.price + bonus,
    status: 'waiting',
    stress: 0,
    day,
  };
}

/** Peut-on accueillir un client de plus ? */
export function canWelcome(profile) {
  const st = ensureGroomer(profile);
  return st.clients.filter((c) => c.status !== 'done').length < maxWaiting(profile);
}

/** Ajoute un client qui attend au salon. */
export function addClient(profile, client) {
  const st = ensureGroomer(profile);
  if (!canWelcome(profile)) return { ok: false, reason: 'full' };
  st.clients.push(client);
  return { ok: true, client };
}

export const findClient = (profile, id) => (profile.groomer?.clients ?? []).find((c) => c.id === id) ?? null;
export const waitingClients = (profile) => (profile.groomer?.clients ?? []).filter((c) => c.status === 'waiting');
export const currentClient = (profile) => (profile.groomer?.clients ?? []).find((c) => c.status === 'accepted') ?? null;

export function acceptClient(profile, client) {
  if (currentClient(profile)) return { ok: false, reason: 'busy' };
  if (!speciesAllowed(profile).includes(client.animal.species)) return { ok: false, reason: 'rank' };
  client.status = 'accepted';
  return { ok: true };
}

/** Refuser (ou laisser partir) : petite baisse de réputation si on refuse. */
export function dismissClient(profile, client, refused = false) {
  const st = ensureGroomer(profile);
  st.clients = st.clients.filter((c) => c.id !== client.id);
  ensureGroomer(profile);
  if (refused) changeReputation(profile, 'groomer', -1);
  return { ok: true };
}

/** Les clients de la veille s'en vont (ils ne dorment pas au salon). */
export function expireClients(profile, day) {
  const st = ensureGroomer(profile);
  const gone = st.clients.filter((c) => c.day < day);
  st.clients = st.clients.filter((c) => c.day >= day);
  return gone;
}

/** Heures d'attente entre deux clients : plus on est connu, plus ils viennent. */
export function clientInterval(profile) {
  return Math.max(1.5, 5 - reputation(profile) / 25);
}

/** Note une étape faite pendant un toilettage (client). extra : stress (0 à 1) pour le séchage. */
export function recordStep(client, stepId, quality, extra = {}) {
  const q = Math.max(0, Math.min(1, quality ?? 0));
  const s = client.steps.find((x) => x.id === stepId);
  if (s) s.quality = Math.max(s.quality ?? 0, q);
  else if (!client.extra.includes(stepId)) client.extra.push(stepId);
  if (extra.stress != null) client.stress = Math.max(client.stress ?? 0, Math.min(1, extra.stress));
  return s ? 'required' : 'extra';
}

export const stepsDone = (client) => client.steps.filter((s) => s.quality != null).length;

/**
 * Satisfaction du client : moyenne des qualités des étapes demandées (0 si oubliée),
 * pondérée par le calme de l'animal (stress du séchage), avec un petit bonus pour les soins
 * faits en plus (extra : un joli nœud, les griffes…). stars : 1 à 5.
 */
export function rateService(client) {
  const n = client.steps.length;
  const avg = client.steps.reduce((s, x) => s + (x.quality ?? 0), 0) / Math.max(1, n);
  const done = stepsDone(client) / Math.max(1, n);
  const calm = 1 - (client.stress ?? 0);
  const extra = done > 0 ? Math.min(0.08, 0.04 * (client.extra?.length ?? 0)) : 0;
  const score = Math.min(1, avg * (0.7 + 0.3 * calm) + extra);
  const stars = score >= 0.9 ? 5 : score >= 0.72 ? 4 : score >= 0.5 ? 3 : score >= 0.28 ? 2 : 1;
  return { score, avg, done, calm, extra, stars };
}

const PAY_FACTOR = [0, 0.3, 0.6, 1, 1.2, 1.4];
const REP_DELTA = [0, -4, -2, 1, 3, 5];
const TIP_MULT = [1, 1.5, 2.5];

/**
 * Termine le toilettage d'un client : paye, pourboire, réputation, XP de métier, carnet.
 * Renvoie { stars, pay, tip, rep, xp, rankUp, rank }.
 */
export function completeService(profile, client, day = dayOf(profile.clock ?? 0)) {
  const st = ensureGroomer(profile);
  const r = rateService(client);
  const rank = rankOf(profile);
  const base = Math.round(client.price * PAY_FACTOR[r.stars]);
  // Pourboire : à partir du rang confirmé (avantages du registre), quand le client est ravi.
  const tips = perksOf(profile, 'groomer').tips;
  const tip = tips && r.stars >= 4 ? Math.round(client.price * 0.15 * (r.stars - 3) * TIP_MULT[rank]) : 0;
  pay(profile, base + tip);
  const rep = REP_DELTA[r.stars] + (REQUESTS[client.request]?.rank === 2 && r.stars >= 4 ? 2 : 0);
  changeReputation(profile, 'groomer', rep);
  addEarnings(profile, 'groomer', sandbox(profile) ? 0 : base + tip);
  const xp = 15 + 10 * r.stars + (REQUESTS[client.request]?.rank ?? 0) * 10;
  const up = addCareerXp(profile, xp);
  st.served += 1;
  st.history.unshift({ day, name: client.animal.name, species: client.animal.species, request: client.request, stars: r.stars, pay: base + tip });
  st.history = st.history.slice(0, 12);
  st.clients = st.clients.filter((c) => c.id !== client.id);
  stat(profile, 'groomClients');
  if (r.stars === 5) stat(profile, 'groomFive');
  if (REQUESTS[client.request]?.rank === 2) stat(profile, 'groomShow');
  client.status = 'done';
  client.result = { ...r, pay: base, tip };
  return { ...r, pay: base, tip, rep, xp, rankUp: up.rankUp, rank: up.rank };
}

// ---------------------------------------------------------------- mes animaux

/** Une coupe : l'animal garde son style CUT_DAYS jours (visible en 3D et bonus au concours). */
export function applyCut(a, style, day, quality = 1) {
  a.grooming = { style, day, quality: Math.max(0, Math.min(1, quality)) };
  a.needs.grooming = Math.min(100, (a.needs.grooming ?? 50) + 25 * quality);
  return a.grooming;
}

/** La coupe est-elle encore fraîche ? */
export const cutFresh = (a, day) => !!a.grooming && day - a.grooming.day < CUT_DAYS;

/**
 * Bonus de toilettage pour le concours de beauté (src/sim/beauty.js peut l'appeler) : 0 à 0,2.
 * Une coupe fraîche compte le plus, puis chaque accessoire porté.
 */
export function groomingBonus(a, day = null) {
  let b = 0;
  const d = day ?? (a.grooming?.day ?? 0);
  if (cutFresh(a, d)) {
    const age = d - a.grooming.day;
    b += 0.12 * a.grooming.quality * (1 - age / CUT_DAYS) + (a.grooming.style === 'concours' ? 0.04 : 0);
  }
  b += 0.02 * Object.keys(a.accessories ?? {}).length;
  return Math.min(0.2, Math.round(b * 1000) / 1000);
}

/** Note un toilettage complet d'un de ses animaux (quêtes, stats). */
export function recordOwnGrooming(profile, a, steps) {
  stat(profile, 'groomOwn');
  if (steps.includes('cut')) stat(profile, 'groomCuts');
  const r = addCareerXp(profile, 5 + 3 * steps.length);
  return r;
}

// ---------------------------------------------------------------- accessoires

/** Met un accessoire sur un animal (payant pour ses propres animaux sauf free). */
export function wearAccessory(profile, a, id, color = 'pink', { free = false } = {}) {
  const def = ACCESSORIES[id];
  if (!def) return { ok: false, reason: 'unknown' };
  if (!ACC_COLORS[color]) color = 'pink';
  if (!accessoryAllowed(profile, id)) return { ok: false, reason: 'rank' };
  const cur = a.accessories?.[def.slot];
  const samePiece = cur && cur.id === id; // changer la couleur est gratuit
  if (!free && !samePiece && !charge(profile, def.price)) return { ok: false, reason: 'money' };
  a.accessories = { ...(a.accessories ?? {}), [def.slot]: { id, color } };
  if (!a.guest && !samePiece) stat(profile, 'groomAccessories');
  return { ok: true };
}

export function removeAccessory(a, slot) {
  if (!a.accessories?.[slot]) return false;
  delete a.accessories[slot];
  if (!Object.keys(a.accessories).length) delete a.accessories;
  return true;
}
