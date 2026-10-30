// Événements spéciaux : un orage arrive, une canicule, un grand froid, un animal blessé,
// un animal échappé, un petit animal perdu, un voisin qui a besoin d'aide, une naissance,
// la fête du village.
// Ce fichier ne dépend pas de la 3D : il décide quand un événement commence, ce qu'il faut
// faire, où on en est et ce qui se passe à la fin. Il est testé dans tests/events.test.js.
//
// Le jeu (src/game/Events.js) lui donne un « contexte » qui décrit le monde :
//   { clock, hour, season, place, isHome, weather, temperature, day,
//     animals,            // animaux présents ici
//     whereOf(a),         // 'paddock' | 'pen' | 'house' | 'out' : où est l'animal
//     ridingId,           // animal monté par le joueur
//     playerDist,         // distance joueur → cible de l'événement (en mètres)
//     strayAtRefuge }     // le petit animal perdu est arrivé au refuge

import { SPECIES, isOffered, speciesAvailable, anyAvailable, LIVESTOCK_IDS } from './species.js';
import { lifeStage, createAnimal, namesInUse } from './animal.js';
import { PLACES } from './places.js';
import { wears, canLead, keepsWarm } from './gear.js';
import { DAYS_PER_YEAR } from './time.js';
import { earn, addStat } from './profile.js';
import { pick, uid } from './rng.js';

/** Pas d'événement avant midi du premier jour (les premières minutes d'un nouveau profil). */
export const START_CLOCK = 12 * 60;
/** Heures de jeu minimum entre la fin d'un événement et le début du suivant. */
export const MIN_GAP_HOURS = 8;
/** Chance qu'un événement commence, à chaque heure de jeu. */
export const CHANCE_PER_HOUR = 0.07;

const PETS = ['dog', 'cat', 'rabbit'];
const BIRTH_SPECIES = ['horse', 'sheep', 'goat', 'cow'];
const inHours = (h, from, to) => h >= from && h < to;
const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));

/** Où un animal doit aller pour être à l'abri : l'écurie (paddock), la bergerie ou la maison. */
export function shelterOf(species) {
  if (species === 'horse') return 'paddock';
  if (SPECIES[species]?.livestock) return 'pen';
  return 'house';
}

export const isSheltered = (a, ctx) => ctx.whereOf(a) === shelterOf(a.species) && a.id !== ctx.ridingId;

/** Au chaud pendant le grand froid : couverture pour les chevaux, manteau ou maison pour le chien, abri pour les autres. */
export function isWarm(a, ctx) {
  if (a.species === 'horse') return keepsWarm(a); // la couverture d'hiver (pas la chemise d'été ni l'imperméable)
  if (a.species === 'dog' && wears(a, 'dogCoat')) return true;
  return isSheltered(a, ctx);
}

export const THIRST_OK = 75;
export const FAIR_OK = 70;
/** Bien propre et bien brossé : prêt pour le concours de la fête du village. */
export const fairReady = (a) => a.needs.grooming >= FAIR_OK && a.needs.hygiene >= FAIR_OK;
const BIRTH_NEAR_HOURS = 0.75;

const NEIGHBOURS = { f: ['Martine', 'Sophie', 'Claire', 'Inès', 'Lucie'], m: ['Paul', 'Jacques', 'Karim', 'Louis', 'Hugo'] };
const NEIGHBOUR_TASKS = ['hay', 'fence', 'hens', 'apples'];
const INJURIES = ['brambles', 'wire', 'stone', 'sprain', 'thorn'];
// (un caillou sous le pied d'un cheval, c'est sa boiterie : le cure-pied ou le vétérinaire, src/sim/animal.js)
const HORSE_INJURIES = INJURIES.filter((c) => c !== 'stone');

/**
 * Où mettre les animaux à l'abri avant l'orage (texte d'annonce ev_storm_intro) : seulement les groupes qui
 * comptent pour la partie (espèces proposées ou déjà à la ferme, src/sim/species.js) — pas de « troupeau à la
 * bergerie » tant qu'aucun mouton, chèvre ni vache n'est possible. ['horse', 'flock', 'pets'] au plus.
 */
export function stormShelters(profile) {
  return [
    speciesAvailable(profile, 'horse') ? 'horse' : null,
    anyAvailable(profile, LIVESTOCK_IDS) ? 'flock' : null,
    anyAvailable(profile, ['dog', 'cat', 'rabbit']) ? 'pets' : null,
  ].filter(Boolean);
}

/**
 * Les événements. Pour chacun :
 * - hours : temps pour réussir (heures de jeu) ; cooldown : heures avant qu'il revienne ;
 * - weight : fréquence relative ; money : récompense en mode gestion ;
 * - can(ctx, force) : null si impossible maintenant, sinon ce qu'il faut pour le lancer ;
 * - weather : météo imposée pendant l'événement (l'orage change vraiment le temps).
 */
export const EVENTS = {
  storm: {
    emoji: '⛈️', hours: 2, cooldown: 48, weight: 3, money: 30,
    can(ctx, force) {
      if (!force && !inHours(ctx.hour, 7, 19)) return null;
      const w = PLACES[ctx.place]?.weather[ctx.season] ?? {};
      if (!force && !(w.storm || (w.rain ?? 0) >= 3) && ctx.season !== 'summer') return null;
      if (!force && ['storm', 'snow'].includes(ctx.weather)) return null;
      if (!ctx.animals.some((a) => !isSheltered(a, ctx))) return null;
      return {};
    },
    // Le ciel se couvre, puis l'orage éclate au bout d'une heure et dure encore 2 h après la fin.
    weather: (ev) => ({ pre: 'cloudy', kind: 'storm', at: ev.start + 60, until: ev.deadline + 120, tempDelta: -2 }),
  },
  heatwave: {
    emoji: '🥵', hours: 3, cooldown: 60, weight: 2, money: 25,
    can(ctx, force) {
      if (!force && !inHours(ctx.hour, 10, 16)) return null;
      if (!force && !(ctx.season === 'summer' || (PLACES[ctx.place]?.temp[ctx.season] ?? 0) >= 20)) return null;
      if (!force && ctx.weather !== 'clear') return null;
      return ctx.animals.length ? {} : null;
    },
    weather: (ev) => ({ kind: 'clear', at: ev.start, until: ev.deadline + 60, tempDelta: 9 }),
  },
  coldSnap: {
    emoji: '🥶', hours: 3, cooldown: 60, weight: 2, money: 30,
    can(ctx, force) {
      if (!force && !inHours(ctx.hour, 8, 18)) return null;
      if (!force && !(ctx.season === 'winter' || ctx.temperature <= 3)) return null;
      if (!ctx.animals.some((a) => !isWarm(a, ctx))) return null;
      return {};
    },
    weather: (ev) => ({ kind: 'snow', at: ev.start, until: ev.deadline + 120, tempDelta: -9 }),
  },
  injury: {
    emoji: '🩹', hours: 6, cooldown: 36, weight: 3, money: 20,
    can(ctx, force) {
      if (!force && !inHours(ctx.hour, 8, 18)) return null;
      const list = ctx.animals.filter((a) => !a.sick && lifeStage(a) !== 'baby' && a.id !== ctx.ridingId);
      return list.length ? { candidates: list } : null;
    },
  },
  escape: {
    emoji: '🏃', hours: 3, cooldown: 36, weight: 2, money: 25,
    can(ctx, force) {
      if (!force && !inHours(ctx.hour, 8, 17)) return null;
      const list = ctx.animals.filter((a) => (a.species === 'horse' || SPECIES[a.species]?.livestock)
        && lifeStage(a) !== 'baby' && !a.following && !a.sick && a.id !== ctx.ridingId && canLead(a).ok
        && ctx.whereOf(a) === shelterOf(a.species));
      return list.length ? { candidates: list } : null;
    },
  },
  lostPet: {
    emoji: '🐾', hours: 4, cooldown: 96, weight: 1, money: 15,
    can(ctx, force) {
      if (!ctx.isHome) return null;
      if (!force && !inHours(ctx.hour, 8, 18)) return null;
      return {};
    },
  },
  neighbour: {
    emoji: '👋', hours: 3, cooldown: 30, weight: 2, money: 40,
    can(ctx, force) {
      if (!ctx.isHome) return null;
      if (!force && !inHours(ctx.hour, 8, 16)) return null;
      return {};
    },
  },
  birth: {
    emoji: '🍼', hours: 3, cooldown: 96, weight: 1, money: 0,
    can(ctx, force) {
      if (!force && !inHours(ctx.hour, 7, 20)) return null;
      if (ctx.animals.length >= 40) return null;
      // Une maman qui attend des petits et dont la naissance approche (voir la gestation dans animal.js).
      for (const mother of ctx.animals) {
        if (mother.sex !== 'f' || !BIRTH_SPECIES.includes(mother.species) || !mother.pregnant) continue;
        if (ctx.day < mother.pregnant.due - 1 && !force) continue;
        const father = ctx.animals.find((b) => b.id === mother.pregnant.father) ?? mother;
        return { mother, father };
      }
      if (!force) return null;
      // Pour tester : n'importe quel couple adulte.
      for (const mother of ctx.animals) {
        if (mother.sex !== 'f' || !BIRTH_SPECIES.includes(mother.species) || lifeStage(mother) === 'baby') continue;
        const father = ctx.animals.find((b) => b.species === mother.species && b.sex === 'm');
        if (father) return { mother, father };
      }
      return null;
    },
  },
  fair: {
    emoji: '🎪', hours: 4, cooldown: 96, weight: 1, money: 50,
    can(ctx, force) {
      if (!force && !inHours(ctx.hour, 9, 14)) return null;
      return ctx.animals.some((a) => lifeStage(a) !== 'baby' && canLead(a).ok) ? {} : null;
    },
  },
};

export const EVENT_TYPES = Object.keys(EVENTS);

/** État des événements dans le profil (créé s'il manque, pour les anciennes sauvegardes). */
export function eventState(profile) {
  if (!profile.events) profile.events = defaultEventState();
  return profile.events;
}

export function defaultEventState() {
  return { active: null, cooldowns: {}, nextAt: 0, lastRoll: -1, weather: null, done: {} };
}

/** Lance un événement précis. force : ignore l'heure, la saison et la météo (pour tester). */
export function startEvent(profile, type, ctx, rng = Math.random, force = false) {
  const def = EVENTS[type];
  const st = eventState(profile);
  if (!def || st.active) return null;
  const plan = def.can(ctx, force);
  if (!plan) return null;
  const ev = {
    id: uid(), type, place: ctx.place, start: ctx.clock, deadline: ctx.clock + def.hours * 60, data: {},
  };
  switch (type) {
    case 'injury': {
      const a = pick(plan.candidates, rng);
      ev.targetId = a.id;
      ev.data.cause = pick(a.species === 'horse' ? HORSE_INJURIES : INJURIES, rng); // (un seul tirage, comme avant)
      a.sick = 'paw'; // une blessure à la patte (la jambe d'un cheval) : le vétérinaire met un pansement
      a.needs.affection = clamp(a.needs.affection - 10);
      break;
    }
    case 'escape':
      ev.targetId = pick(plan.candidates, rng).id;
      ev.data.found = false;
      break;
    case 'heatwave':
      // Il fait si chaud que tout le monde a très soif.
      for (const a of ctx.animals) a.needs.thirst = Math.min(a.needs.thirst, 40);
      break;
    case 'lostPet': {
      // (un seul tirage, comme avant : la suite du hasard ne bouge pas ; une espèce pas encore
      // proposée est remplacée par un petit animal proposé — aujourd'hui, toujours un chien)
      let species = rng() < 0.5 ? 'dog' : 'cat';
      if (!isOffered(species)) species = PETS.find(isOffered) ?? 'dog';
      const sp = SPECIES[species];
      const stray = createAnimal({ species, ageDays: sp.adultYears * DAYS_PER_YEAR * 0.25, location: ctx.place, rng, day: ctx.day, avoidNames: namesInUse(profile) });
      stray.stray = true;
      stray.needs.hunger = 35;
      stray.needs.affection = 30;
      ev.data.stray = stray;
      ev.targetId = stray.id;
      ev.data.choice = null;
      break;
    }
    case 'neighbour': {
      const sex = rng() < 0.5 ? 'f' : 'm';
      ev.data.neighbour = { name: pick(NEIGHBOURS[sex], rng), sex };
      ev.data.task = pick(NEIGHBOUR_TASKS, rng);
      ev.data.helped = false;
      break;
    }
    case 'birth':
      ev.targetId = plan.mother.id;
      ev.data.fatherId = plan.father.id;
      ev.data.near = 0;
      break;
    case 'fair':
      ev.data.won = false;
      break;
    default:
  }
  // Nom et sexe de l'animal concerné, pour les textes (même s'il n'est plus là à la fin).
  const who = ctx.animals.find((a) => a.id === ev.targetId) ?? ev.data.stray;
  if (who) ev.data.who = { name: who.name, sex: who.sex, species: who.species };
  st.active = ev;
  st.cooldowns[type] = ctx.clock + def.cooldown * 60;
  if (def.weather) st.weather = { place: ctx.place, ...def.weather(ev) };
  return ev;
}

/**
 * À appeler souvent (le jeu le fait au plus une fois par heure de jeu, grâce à lastRoll).
 * Tire au sort un nouvel événement parmi ceux qui sont possibles ici et maintenant.
 */
export function maybeStartEvent(profile, ctx, rng = Math.random) {
  const st = eventState(profile);
  const hourIdx = Math.floor(ctx.clock / 60);
  if (hourIdx <= st.lastRoll) return null;
  st.lastRoll = hourIdx;
  if (st.active || ctx.clock < START_CLOCK || ctx.clock < st.nextAt) return null;
  if (!ctx.animals.length) return null;
  if (rng() >= CHANCE_PER_HOUR) return null;
  const ready = EVENT_TYPES.filter((type) => (st.cooldowns[type] ?? 0) <= ctx.clock && EVENTS[type].can(ctx, false));
  if (!ready.length) return null;
  const total = ready.reduce((s, type) => s + EVENTS[type].weight, 0);
  let r = rng() * total;
  const type = ready.find((x) => (r -= EVENTS[x].weight) <= 0) ?? ready[ready.length - 1];
  return startEvent(profile, type, ctx, rng);
}

/** Météo imposée par un événement, ou null. */
export function eventWeather(profile, clock, place) {
  const w = profile.events?.weather;
  if (!w || w.place !== place || clock >= w.until) return null;
  if (clock < w.at) return w.pre ? { weather: w.pre, tempDelta: 0 } : null;
  return { weather: w.kind, tempDelta: w.tempDelta ?? 0 };
}

/** Les animaux concernés par l'événement (pour la barre de progression). */
function involved(ev, ctx) {
  return ctx.animals.filter((a) => !a.stray);
}

/**
 * Où en est l'événement ? Met à jour ses compteurs (hours : temps écoulé depuis le dernier appel).
 * Renvoie { done, total, complete, missing } ; missing = animaux pas encore en règle.
 */
export function eventProgress(ev, ctx, hours = 0) {
  const target = ctx.animals.find((a) => a.id === ev.targetId);
  const one = (ok) => ({ done: ok ? 1 : 0, total: 1, complete: ok, missing: ok || !target ? [] : [target] });
  switch (ev.type) {
    case 'storm':
    case 'coldSnap':
    case 'heatwave': {
      const list = involved(ev, ctx);
      const test = ev.type === 'storm' ? (a) => isSheltered(a, ctx)
        : ev.type === 'coldSnap' ? (a) => isWarm(a, ctx) : (a) => a.needs.thirst >= THIRST_OK;
      const missing = list.filter((a) => !test(a));
      return { done: list.length - missing.length, total: list.length, complete: missing.length === 0, missing };
    }
    case 'injury':
      return one(!target || !target.sick);
    case 'escape':
      // Rejoint (à moins de 4 m), déjà en train de suivre, ou monté : il est retrouvé et l'événement est
      // réussi tout de suite. (Avant, il fallait encore le ramener à l'abri : à cheval sur l'animal
      // échappé, le bandeau disait toujours « Trouve Éclair : suis la flèche ! 0 m ».)
      if (target && !ev.data.found && ((ctx.playerDist !== undefined && ctx.playerDist < 4) || target.following || ctx.ridingId === target.id)) ev.data.found = true;
      return one(!target || !!ev.data.found);
    case 'lostPet':
      return one(ev.data.choice === 'adopt' || (ev.data.choice === 'refuge' && !!ctx.strayAtRefuge));
    case 'neighbour':
      return one(!!ev.data.helped);
    case 'birth':
      if (ctx.playerDist !== undefined && ctx.playerDist < 10) ev.data.near += hours;
      return {
        done: Math.min(BIRTH_NEAR_HOURS, ev.data.near), total: BIRTH_NEAR_HOURS,
        complete: ev.data.near >= BIRTH_NEAR_HOURS || !target, missing: [],
      };
    case 'fair': {
      if (!ev.data.won && ctx.playerDist !== undefined && ctx.playerDist < 4) {
        const star = ctx.animals.find((a) => a.following && fairReady(a));
        if (star) {
          ev.data.won = true;
          ev.data.winnerId = star.id;
        }
      }
      return one(ev.data.won);
    }
    default:
      return { done: 0, total: 1, complete: false, missing: [] };
  }
}

/**
 * Prochaine chose à faire, pour le bouton « Y aller » et la flèche :
 * { step, animalId?, group? } ; step = 'shelter' | 'water' | 'warm' | 'vet' | 'find' | 'lead'
 * | 'meet' | 'stay' | 'brush' | 'stand' | 'decide' | 'refuge'.
 */
export function nextStep(ev, ctx, progress = eventProgress(ev, ctx)) {
  const first = progress.missing[0];
  switch (ev.type) {
    case 'storm': {
      if (!first) return null;
      // On commence par le groupe le plus proche du joueur, sinon dans l'ordre.
      return { step: 'shelter', group: shelterOf(first.species), animalId: first.id };
    }
    case 'coldSnap':
      if (!first) return null;
      if (first.species === 'horse') return { step: 'warm', animalId: first.id, gear: 'blanket' };
      return { step: 'shelter', group: shelterOf(first.species), animalId: first.id };
    case 'heatwave':
      return first ? { step: 'water', animalId: first.id } : null;
    case 'injury':
      return progress.complete ? null : { step: 'vet', animalId: ev.targetId };
    case 'escape':
      return progress.complete ? null : { step: 'find', animalId: ev.targetId };
    case 'lostPet':
      if (progress.complete) return null;
      return ev.data.choice === 'refuge' ? { step: 'refuge', animalId: ev.targetId } : { step: 'decide', animalId: ev.targetId };
    case 'neighbour':
      return progress.complete ? null : { step: 'meet' };
    case 'birth':
      return progress.complete ? null : { step: 'stay', animalId: ev.targetId };
    case 'fair': {
      if (progress.complete) return null;
      const ready = ctx.animals.find((a) => a.following && fairReady(a));
      if (ready) return { step: 'stand', animalId: ready.id };
      const list = ctx.animals.filter((a) => lifeStage(a) !== 'baby' && canLead(a).ok);
      // On garde le même animal tant qu'il est là (la flèche ne saute pas de l'un à l'autre).
      const best = list.find((a) => a.id === ev.data.pick)
        ?? list.sort((x, y) => (y.needs.grooming + y.needs.hygiene) - (x.needs.grooming + x.needs.hygiene))[0];
      if (best) ev.data.pick = best.id;
      if (best && fairReady(best)) return { step: 'lead', animalId: best.id };
      return best ? { step: 'brush', animalId: best.id } : null;
    }
    default:
      return null;
  }
}

/** L'événement est-il fini ? 'success' | 'fail' | null. */
export function eventOutcome(ev, ctx, progress) {
  if (ctx.place !== ev.place) return 'cancel';
  if (progress.complete) return 'success';
  if (ctx.clock >= ev.deadline) return 'fail';
  return null;
}

/**
 * Termine l'événement : effets sur les animaux, récompense, temps de repos avant le suivant.
 * Renvoie { type, outcome, money, xp, affected: [noms], sick: [noms] } pour l'écran de fin.
 * (La naissance des bébés et le retour de l'animal échappé sont faits par le jeu.)
 */
export function resolveEvent(profile, ev, outcome, ctx, rng = Math.random) {
  const st = eventState(profile);
  const def = EVENTS[ev.type];
  const res = { type: ev.type, outcome, money: 0, xp: outcome === 'success', affected: [], sick: [] };
  const progress = eventProgress(ev, ctx);
  const hit = (a) => res.affected.push(a.name);
  const catchCold = (a, chance) => {
    if (!a.sick && rng() < chance) {
      a.sick = 'cold';
      res.sick.push(a.name);
    }
  };
  if (outcome === 'success') {
    res.money = def.money;
    earn(profile, def.money);
    st.done[ev.type] = (st.done[ev.type] ?? 0) + 1;
    addStat(profile, 'events');
    if (ev.type === 'storm') for (const a of involved(ev, ctx)) a.needs.affection = clamp(a.needs.affection + 8);
    if (ev.type === 'fair') addStat(profile, 'ribbons');
  } else if (outcome === 'fail') {
    for (const a of progress.missing) {
      hit(a);
      if (ev.type === 'storm') {
        a.needs.hygiene = clamp(a.needs.hygiene - 25);
        a.needs.affection = clamp(a.needs.affection - 15);
        catchCold(a, 0.35);
      } else if (ev.type === 'coldSnap') {
        a.needs.energy = clamp(a.needs.energy - 20);
        catchCold(a, 0.4);
      } else if (ev.type === 'heatwave') {
        a.needs.energy = clamp(a.needs.energy - 15);
        a.health = clamp(a.health - 10);
      } else if (ev.type === 'injury') {
        a.health = clamp(a.health - 15, 15);
      } else if (ev.type === 'escape') {
        a.needs.affection = clamp(a.needs.affection - 10);
      }
    }
  }
  // Après un orage, la météo imposée continue (l'orage éclate quand même).
  if (outcome === 'cancel') st.weather = null;
  st.active = null;
  st.nextAt = Math.max(ctx.clock, ev.deadline) + MIN_GAP_HOURS * 60;
  return res;
}

/** Temps restant en minutes de jeu. */
export const minutesLeft = (ev, clock) => Math.max(0, ev.deadline - clock);
