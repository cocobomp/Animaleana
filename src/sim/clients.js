// Clients : des gens viennent à la ferme confier leur animal, en pension (il est en bonne santé)
// ou en soins (il est malade ou blessé : il faut jouer au vétérinaire puis le garder en convalescence).
// Si on s'en occupe bien, on est payé et la réputation du métier monte.
//
// Tant qu'on n'a pas appris le métier (src/sim/careers.js), le village s'en charge : le visiteur
// avec un animal malade va chez le vétérinaire du village (visite « auto »), et personne ne
// demande de pension. Une fois le métier commencé, les visiteurs viennent nous voir.
//
// Logique pure, sans 3D ni DOM (testée dans tests/clients.test.js). La partie 3D est dans
// src/game/Clients.js, l'interface dans src/ui/clients.js.
//
// Dans le profil :
//   profile.clients = { active: [...], history: [...], nextVisitDay, nextVisitHour, refusedStreak, visitor, lastDay }
//   l'animal confié est dans profile.animals avec a.client = { ownerName, ownerSex, kind, startDay, until, ... }
//   kind = 'vet' (soins) ou 'pension' : c'est aussi l'identifiant du métier concerné.

import { SPECIES } from './species.js';
import { createAnimal, NEEDS, happiness, ILLNESSES } from './animal.js';
import { pick, uid } from './rng.js';
import {
  CAREERS, startedCareers, isStarted, perksOf, rankOf, reputationOf, changeReputation, addCareerXp, addEarnings, noteAction,
} from './careers.js';

export const VISIT_HOURS = [8, 18]; // les visiteurs viennent dans la journée
export const VISITOR_WAIT_HOURS = 2; // un visiteur ignoré repart au bout de 2 h de jeu
export const REFUSALS_BEFORE_DIP = 3; // 3 refus de suite : la réputation baisse un peu
export const UPSET_SCORE = 30; // en dessous, le propriétaire est fâché : pas de paiement
export const PENSION_DAYS = [2, 5];
export const VET_DAYS = [3, 4]; // soins + convalescence
export const CLIENT_XP = { base: 20, perStar: 10 }; // XP de métier gagnée par client

export const OWNER_NAMES = {
  f: ['Mme Dupont', 'Léa', 'Fatou', 'Camille', 'Mme Garcia', 'Nour', 'Zoé', 'Mamie Rose', 'Alice', 'Mme Nguyen'],
  m: ['M. Martin', 'Tom', 'Samir', 'Papi Jean', 'M. Rossi', 'Noah', 'Gabriel', 'M. Diallo', 'Léo', 'M. Petit'],
};

// Prix de la pension par jour selon l'espèce (🪙). Les soins coûtent plus cher.
export const DAY_PRICE = { dog: 20, cat: 15, rabbit: 10, horse: 45, sheep: 18, goat: 18, cow: 35 };
export const VET_FEE = 40; // en plus, pour soigner
const VET_FACTOR = 1.6;

const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));
const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);

export function defaultClients() {
  return { active: [], history: [], nextVisitDay: 0, nextVisitHour: 10, refusedStreak: 0, visitor: null, lastDay: 0 };
}

/** État des clients dans le profil (complété pour les vieilles sauvegardes). */
export function clientState(profile) {
  if (!profile.clients) profile.clients = defaultClients();
  else for (const [k, v] of Object.entries(defaultClients())) if (profile.clients[k] === undefined) profile.clients[k] = v;
  return profile.clients;
}

export const isClientAnimal = (a) => !!a?.client && a.client.kind !== 'training'; // 'training' : éducateur canin (src/sim/dogTrainer.js)
export const reputationFactor = (rep = 50) => 0.8 + (clamp(rep) / 100) * 0.4; // 0,8 → 1,2

/** Nombre d'animaux qu'on peut garder en même temps (selon le meilleur rang des métiers commencés). */
export function maxClients(profile) {
  const started = startedCareers(profile).filter((id) => CAREERS[id].perks);
  if (!started.length) return 0;
  return Math.max(...started.map((id) => perksOf(profile, id).maxClients));
}

/** Prix total proposé par le propriétaire (et par jour). */
export function pricing(species, kind, days, reputation = 50, rankFactor = 1) {
  const base = DAY_PRICE[species] ?? 15;
  const perDay = round5(base * (kind === 'vet' ? VET_FACTOR : 1) * reputationFactor(reputation) * rankFactor);
  const total = perDay * days + (kind === 'vet' ? VET_FEE : 0);
  return { perDay, total };
}

// ------------------------------------------------------------------ visites

/**
 * Programme la prochaine visite : dans 1 ou 2 jours (plus souvent avec le rang et la réputation),
 * entre 8 h et 17 h.
 */
export function scheduleNextVisit(profile, day, rng = Math.random) {
  const st = clientState(profile);
  const started = startedCareers(profile);
  const rank = started.length ? Math.max(...started.map((id) => rankOf(profile, id))) : 0;
  const rep = started.length ? Math.max(...started.map((id) => reputationOf(profile, id))) : 50;
  const soon = 0.35 + rank * 0.15 + (rep - 50) / 200;
  const gap = rng() < soon ? 1 : 2;
  st.nextVisitDay = day + gap;
  st.nextVisitHour = VISIT_HOURS[0] + Math.floor(rng() * (VISIT_HOURS[1] - VISIT_HOURS[0] - 1));
  return st.nextVisitDay;
}

/**
 * Un visiteur doit-il arriver maintenant ? (métier commencé ou non : sans métier, c'est une visite
 * « auto » pour le vétérinaire du village.)
 * ctx : { day, hour, isHome }
 */
export function shouldVisitorArrive(profile, ctx) {
  const st = clientState(profile);
  if (!ctx.isHome) return false;
  if (st.visitor) return false;
  if (ctx.hour < VISIT_HOURS[0] || ctx.hour >= VISIT_HOURS[1]) return false;
  if (!st.nextVisitDay) return false; // rien de prévu (on programme au premier passage)
  if (ctx.day < st.nextVisitDay) return false;
  if (ctx.day === st.nextVisitDay && ctx.hour < st.nextVisitHour) return false;
  return true;
}

/** Quel genre de visite : 'vet' / 'pension' si le métier est appris, sinon 'autoVet' ou 'autoPension' (indice). */
export function pickVisitKind(profile, rng = Math.random) {
  const started = startedCareers(profile).filter((id) => id === 'vet' || id === 'pension');
  const wantVet = rng() < 0.45;
  if (started.includes('vet') && started.includes('pension')) return wantVet ? 'vet' : 'pension';
  if (started.includes('vet')) return rng() < 0.75 ? 'vet' : 'autoPension';
  if (started.includes('pension')) return wantVet ? 'autoVet' : 'pension';
  return rng() < 0.7 ? 'autoVet' : 'autoPension';
}

/**
 * Crée une demande de visite : un propriétaire, son animal, la durée et le prix.
 * ctx : { day, clock, place, species?: [...] (espèces possibles ici) }. kind forcé pour les tests.
 * kind 'autoVet' / 'autoPension' : visite automatique (le village s'en occupe), sans prix.
 */
export function createVisit(profile, ctx, rng = Math.random, forcedKind = null) {
  const kind = forcedKind ?? pickVisitKind(profile, rng);
  const auto = kind.startsWith('auto');
  const career = auto ? (kind === 'autoVet' ? 'vet' : 'pension') : kind;
  const perks = isStarted(profile, career) ? perksOf(profile, career) : CAREERS[career].perks[0];
  const sex = rng() < 0.5 ? 'f' : 'm';
  const ownerName = pick(OWNER_NAMES[sex], rng);
  // Les petits animaux sont les plus fréquents ; les gros seulement si le rang et la ferme le permettent.
  const pool = perks.species.filter((s) => !ctx.species || ctx.species.includes(s));
  const weighted = [...pool, ...pool.filter((s) => ['dog', 'cat', 'rabbit'].includes(s))];
  const species = pick(weighted.length ? weighted : ['dog'], rng);
  const sp = SPECIES[species];
  const animal = createAnimal({
    species,
    ageDays: sp.adultYears * 12 * (0.8 + rng() * 1.5),
    rng,
    location: ctx.place ?? profile.place ?? 'maison',
    day: ctx.day ?? 1,
  });
  animal.bond = 2;
  const [min, max] = career === 'vet' ? VET_DAYS : PENSION_DAYS;
  const days = min + Math.floor(rng() * (max - min + 1));
  let illness = null;
  if (career === 'vet') {
    // Malade ou blessé (une patte abîmée = 'paw', comme dans les événements). Les cas rares : rang expert.
    illness = pick(perks.illnesses ?? Object.keys(ILLNESSES), rng);
    animal.sick = illness;
    animal.health = 55 + Math.round(rng() * 20);
    animal.needs.energy = clamp(animal.needs.energy - 25);
  }
  const price = auto ? { perDay: 0, total: 0 } : pricing(species, career, days, reputationOf(profile, career), perks.price ?? 1);
  return {
    id: uid(),
    owner: { name: ownerName, sex, seed: Math.floor(rng() * 1e6) },
    kind,
    career,
    auto,
    days,
    illness,
    animal,
    perDay: price.perDay,
    price: price.total,
    arrivedClock: ctx.clock ?? 0,
    expiresClock: (ctx.clock ?? 0) + VISITOR_WAIT_HOURS * 60,
  };
}

/** Le visiteur est là (gardé dans le profil pour survivre à un rechargement). */
export function setVisitor(profile, visit) {
  clientState(profile).visitor = visit;
}

/** Peut-on accepter ? { ok, reason: 'full' | 'career' } */
export function canAccept(profile, visit = null) {
  const st = clientState(profile);
  if (visit && !isStarted(profile, visit.career)) return { ok: false, reason: 'career' };
  const max = maxClients(profile);
  if (st.active.length >= max) return { ok: false, reason: 'full', n: max };
  return { ok: true };
}

/** On accepte : l'animal rejoint la ferme pour quelques jours. */
export function acceptVisit(profile, visit, day) {
  const st = clientState(profile);
  const check = canAccept(profile, visit);
  if (!check.ok) return check;
  const a = visit.animal;
  a.client = {
    id: visit.id,
    ownerName: visit.owner.name,
    ownerSex: visit.owner.sex,
    ownerSeed: visit.owner.seed,
    kind: visit.career,
    illness: visit.illness,
    startDay: day,
    until: day + visit.days,
    days: visit.days,
    price: visit.price,
    perDay: visit.perDay,
    startBond: a.bond ?? 0,
    daily: [], // un score par jour passé chez nous
    gotSick: false, // tombé malade (ou blessé) chez nous
    curedDay: null, // soins : jour où il a été guéri
  };
  a.location = profile.place;
  profile.animals.push(a);
  st.active.push({ id: visit.id, animalId: a.id, kind: visit.career, until: a.client.until, startDay: day });
  st.refusedStreak = 0;
  if (st.visitor?.id === visit.id) st.visitor = null;
  const welcome = noteAction(profile, visit.career, 'welcome');
  return { ok: true, animal: a, firstWelcome: !!welcome?.first, rankUp: welcome?.rankUp ?? null };
}

/** On refuse (sans conséquence, sauf 3 refus de suite : petite baisse de réputation du métier). */
export function refuseVisit(profile, visit) {
  const st = clientState(profile);
  if (!visit || st.visitor?.id === visit.id) st.visitor = null;
  st.refusedStreak += 1;
  let dip = 0;
  if (st.refusedStreak >= REFUSALS_BEFORE_DIP) {
    st.refusedStreak = 0;
    dip = 2;
    if (visit && isStarted(profile, visit.career)) changeReputation(profile, visit.career, -dip);
  }
  return { dip };
}

/** Le visiteur s'en va sans réponse (ignoré pendant 2 h). */
export function visitorExpired(profile, clock) {
  const st = clientState(profile);
  return !!st.visitor && clock >= st.visitor.expiresClock;
}

export function clearVisitor(profile) {
  clientState(profile).visitor = null;
}

// ------------------------------------------------------------------ score de soin

/** Les animaux confiés. */
export const clientAnimals = (profile) => profile.animals.filter(isClientAnimal);

export const daysLeft = (a, day) => Math.max(0, (a.client?.until ?? day) - day);

/**
 * Note du jour (0 à 100) : besoins moyens, bonheur, santé et propreté.
 * Pour une pension, être malade compte très mal ; pour des soins, seulement une fois guéri.
 */
export function dailyCareScore(a) {
  const c = a.client ?? {};
  const avg = NEEDS.reduce((s, n) => s + (a.needs[n] ?? 0), 0) / NEEDS.length;
  let score = avg * 0.5 + happiness(a) * 0.25 + (a.health ?? 100) * 0.1 + (a.needs.hygiene ?? 0) * 0.15;
  const sickCounts = a.sick && (c.kind !== 'vet' || c.curedDay !== null);
  if (sickCounts) score -= 25;
  return clamp(Math.round(score));
}

/**
 * À chaque nouveau jour passé chez nous : on note la journée et on regarde s'il est tombé malade
 * ou s'il a été guéri (soins).
 */
export function tickClientDay(a, day) {
  const c = a.client;
  if (!c) return;
  if (c.kind === 'vet' && c.curedDay === null && !a.sick) c.curedDay = day;
  if (a.sick && (c.kind !== 'vet' || c.curedDay !== null)) c.gotSick = true;
  c.daily.push(dailyCareScore(a));
}

/** On remarque tout de suite une guérison (sans attendre le lendemain). Renvoie vrai la première fois. */
export function noteCure(a, day) {
  const c = a.client;
  if (c && c.kind === 'vet' && c.curedDay === null && !a.sick) {
    c.curedDay = day;
    return true;
  }
  return false;
}

/** Note finale 0 à 100 au moment où le propriétaire revient. */
export function finalScore(a, day) {
  const c = a.client;
  if (!c) return 0;
  const notes = [...c.daily, dailyCareScore(a)];
  let score = notes.reduce((s, x) => s + x, 0) / notes.length;
  // Le lien qui a grandi avec l'animal : on l'a vraiment câliné.
  const bondGain = (a.bond ?? 0) - (c.startBond ?? 0);
  score += Math.min(10, Math.max(0, bondGain) * 0.5);
  if (c.gotSick) score -= 15;
  if (c.kind === 'vet') {
    if (c.curedDay === null && a.sick) score = Math.min(score, 25); // pas soigné du tout
    else if (c.curedDay !== null && c.curedDay - c.startDay > 2) score -= 10; // soigné tard
    else if (c.curedDay !== null) score += 5;
  }
  // Le propriétaire a dû attendre (on était en voyage).
  const late = Math.max(0, day - c.until);
  score -= late * 5;
  return clamp(Math.round(score));
}

export function stars(score) {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 55) return 3;
  if (score >= UPSET_SCORE) return 2;
  return 1;
}

/** Ce qui a manqué (pour expliquer gentiment) : besoin le plus bas en moyenne, maladie, pas soigné. */
export function worstPoint(a) {
  const c = a.client ?? {};
  if (c.kind === 'vet' && c.curedDay === null && a.sick) return 'notCured';
  if (c.gotSick) return 'sick';
  let worst = null;
  for (const n of NEEDS) {
    if (!worst || a.needs[n] < a.needs[worst]) worst = n;
  }
  return worst && a.needs[worst] < 60 ? worst : null;
}

/** Paiement et réputation selon la note. tips : le rang permet les pourboires. */
export function payout(price, score, rng = Math.random, tips = true) {
  const s = stars(score);
  if (score < UPSET_SCORE) return { money: 0, tip: 0, bonus: 0, repDelta: -8, stars: s, upset: true };
  let money = Math.round(price * (0.5 + 0.5 * (score / 100)));
  let bonus = 0;
  if (s === 5) {
    bonus = Math.round(price * 0.2);
    money += bonus;
  }
  let tip = 0;
  if (tips && s >= 4 && rng() < 0.5) tip = round5(price * (0.05 + rng() * 0.1));
  const repDelta = { 5: 6, 4: 4, 3: 1, 2: -3 }[s];
  return { money: money + tip, tip, bonus, repDelta, stars: s, upset: false };
}

/** Un client est-il attendu par son propriétaire (séjour terminé) ? */
export const isPickupDue = (a, day) => isClientAnimal(a) && day >= a.client.until;

/**
 * Le propriétaire revient : note, paiement, réputation et XP du métier, et l'animal quitte le profil.
 * Renvoie le résultat pour l'écran de fin.
 */
export function completeClient(profile, a, day, rng = Math.random) {
  const st = clientState(profile);
  const c = a.client;
  const career = c.kind;
  const score = finalScore(a, day);
  const pay = payout(c.price, score, rng, isStarted(profile, career) ? perksOf(profile, career).tips : false);
  const sandbox = profile.mode === 'sandbox';
  if (!sandbox) profile.money += pay.money;
  addEarnings(profile, career, pay.money);
  const reputation = changeReputation(profile, career, pay.repDelta);
  profile.stats = profile.stats ?? {};
  const stat = (k, n = 1) => { profile.stats[k] = (profile.stats[k] ?? 0) + n; };
  stat('clients');
  if (pay.stars >= 4) stat('clientsHappy');
  if (pay.stars === 5) stat('clients5Stars');
  if (career === 'vet' && c.curedDay !== null) stat('clientsVet');
  if (pay.money) stat('clientMoney', pay.money);
  const careerXp = pay.upset ? 5 : CLIENT_XP.base + CLIENT_XP.perStar * pay.stars;
  const action = noteAction(profile, career, 'return');
  const up = addCareerXp(profile, career, careerXp);
  profile.animals = profile.animals.filter((x) => x.id !== a.id);
  st.active = st.active.filter((x) => x.animalId !== a.id);
  const result = {
    animal: a,
    name: a.name,
    g: a.sex,
    species: a.species,
    ownerName: c.ownerName,
    ownerSex: c.ownerSex,
    kind: career,
    score,
    stars: pay.stars,
    upset: pay.upset,
    money: pay.money,
    tip: pay.tip,
    bonus: pay.bonus,
    repDelta: pay.repDelta,
    reputation,
    careerXp,
    rankUp: up?.rankUp ?? action?.rankUp ?? null,
    worst: worstPoint(a),
    cured: career === 'vet' && c.curedDay !== null,
    late: Math.max(0, day - c.until),
    day,
  };
  st.history.unshift({ ownerName: c.ownerName, name: a.name, species: a.species, kind: career, stars: pay.stars, money: pay.money, day });
  st.history = st.history.slice(0, 20);
  return result;
}

/** Les jours qui ont passé depuis la dernière fois (pour noter chaque journée des clients). */
export function advanceClientDays(profile, day) {
  const st = clientState(profile);
  if (!st.lastDay) st.lastDay = day;
  const missed = [];
  while (st.lastDay < day) {
    st.lastDay += 1;
    missed.push(st.lastDay);
    for (const a of clientAnimals(profile)) if (a.client.startDay < st.lastDay) tickClientDay(a, st.lastDay);
  }
  return missed;
}

/**
 * Un soin fait sur un animal confié : coche le carnet du métier.
 * Renvoie l'action cochée pour la première fois (ou null).
 */
export function noteClientCare(profile, a, action) {
  const c = a.client;
  if (!c) return null;
  let step = null;
  if (c.kind === 'pension') {
    if (['feed', 'water', 'treat'].includes(action)) step = 'feed';
    else if (['wash', 'clean', 'brush', 'nails'].includes(action)) step = 'clean';
    else if (['play', 'pet', 'lunge', 'liberty'].includes(action)) step = 'play';
  } else if (c.kind === 'vet' && c.curedDay !== null) step = 'watch';
  if (!step) return null;
  const r = noteAction(profile, c.kind, step);
  return r?.first ? step : null;
}
