// Voyages réalistes avec les animaux : véhicule, étapes, aires de repos, soins en route et stress.
// Ce fichier ne dépend pas de la 3D, il est testé dans tests/trip.test.js.
//
// Un voyage est une suite de « phases » :
//   - road : sur la route (voiture, van) ou à cheval. On peut s'arrêter et s'occuper des animaux.
//   - hold : dans la soute de l'avion ou dans le garage du bateau. Impossible d'aller les voir.
// Les arrêts (aires de repos, étapes pour la nuit, embarquement…) sont placés sur cette ligne du temps.

import { tickAnimal, applyCare } from './animal.js';

const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));

/** Les grands animaux voyagent debout dans une remorque (van) ; les petits dans une caisse de transport. */
export const TRAILER_SPECIES = ['horse', 'cow', 'sheep', 'goat'];
export const needsTrailer = (a) => TRAILER_SPECIES.includes(a.species);

// Points de stress gagnés par heure de route, selon l'espèce. Les chats et les lapins détestent la voiture.
export const TRAVEL_STRESS = { horse: 5, dog: 3, cat: 7, rabbit: 7, sheep: 5, goat: 4.5, cow: 5 };
const PERSONALITY_STRESS = { shy: 1.3, calm: 0.7, curious: 0.9, playful: 1, cuddly: 1.1, stubborn: 1 };

// Heures de route entre deux aires de repos. Avec des chevaux : au plus 4 h 30 (règle européenne des pauses).
export const STOP_EVERY = { car: 2.5, van: 3, horse: 2 };
export const MAX_DRIVE_HORSES = 4.5;
// Heures de route par jour avant une étape pour la nuit.
export const DAY_LIMIT = { car: 9, van: 9, horse: 6 };
export const NIGHT_HOURS = 10;
// Trajet en van ou en voiture jusqu'au port / à l'aéroport, puis depuis l'arrivée.
export const TRANSFER_HOURS = 1;
// Temps passé pour chaque soin pendant un arrêt (5 minutes).
export const ACTION_HOURS = 1 / 12;

/** Au-delà de ce stress à l'arrivée, l'animal risque de tomber malade (coliques, ventre…). */
export const SICK_STRESS = 80;

// Soins possibles pendant un arrêt.
export const STOP_ACTIONS = ['water', 'feed', 'walk', 'clean', 'calm', 'check'];
export const STOP_ACTION_EMOJI = { water: '💧', feed: '🥕', walk: '🦮', clean: '🧹', calm: '🤲', check: '🩺' };

/**
 * Quel véhicule garer dans la cour ?
 * 'none' (on part à cheval), 'trailer' (van + remorque pour les grands animaux) ou 'car' (voiture + caisses).
 * Pour l'avion et le bateau, c'est le véhicule qui emmène au port ou à l'aéroport.
 */
export function vehicleFor(mode, animals = []) {
  if (mode === 'horse') return 'none';
  if (mode === 'car') return 'car';
  if (mode === 'van') return 'trailer';
  return animals.some(needsTrailer) ? 'trailer' : 'car';
}

/** Où va l'animal dans le véhicule : 'trailer' (debout dans la remorque) ou 'crate' (caisse). */
export const placeFor = (vehicle, a) => (vehicle === 'trailer' && needsTrailer(a) ? 'trailer' : 'crate');

/**
 * Prépare un voyage.
 * opts : { mode, km, hours (temps de trajet sans les pauses, donné par checkTravel), animals, from, to, riderId, heat,
 *          cargo (contenu du coffre de transport { hay: 1, water: 1, … }, src/sim/cargo.js ; absent = tout est là),
 *          safety ({ [id]: true | false } : bien attaché dans la remorque ? src/sim/loading.js) }
 */
export function planTrip({ mode, km = 0, hours, animals = [], from = null, to = null, riderId = null, heat = false, cargo = null, safety = null }) {
  const phases = [];
  if (mode === 'plane' || mode === 'boat') {
    const hold = Math.max(1, hours - 2 * TRANSFER_HOURS);
    phases.push({ kind: 'road', hours: TRANSFER_HOURS }, { kind: 'hold', hours: hold }, { kind: 'road', hours: TRANSFER_HOURS });
  } else {
    phases.push({ kind: 'road', hours });
  }

  // Place les arrêts sur la ligne du temps (les nuits allongent le voyage).
  const stops = [];
  const every = STOP_EVERY[mode] ?? 2.5;
  const dayLimit = DAY_LIMIT[mode] ?? 9;
  let t = 0;
  phases.forEach((ph, i) => {
    ph.start = t;
    if (ph.kind === 'hold') {
      t += ph.hours;
      ph.end = t;
      // Juste après l'arrivée : on récupère les animaux et on vérifie qu'ils vont bien.
      stops.push(newStop(t, 'landing'));
      return;
    }
    let driven = 0;
    let sinceStop = 0;
    let today = 0;
    let nights = 0;
    while (ph.hours - driven > 1e-9) {
      const nextRest = every - sinceStop;
      const nextNight = dayLimit - today;
      const step = Math.min(nextRest, nextNight, ph.hours - driven);
      driven += step;
      sinceStop += step;
      today += step;
      t += step;
      if (ph.hours - driven < 0.5) break; // presque arrivé : pas besoin de s'arrêter
      if (today >= dayLimit - 1e-9) {
        stops.push(newStop(t, 'night'));
        t += NIGHT_HOURS;
        nights += 1;
        today = 0;
        sinceStop = 0;
      } else if (sinceStop >= every - 1e-9) {
        stops.push(newStop(t, 'rest'));
        sinceStop = 0;
      }
    }
    // Fin de la phase : son temps de route, plus ses nuits.
    t = ph.start + ph.hours + nights * NIGHT_HOURS;
    ph.end = t;
    // Dernier moment pour s'occuper d'eux avant la soute.
    if (phases[i + 1]?.kind === 'hold') stops.push(newStop(t, 'boarding'));
  });

  const comfort = {};
  const startStress = {};
  for (const a of animals) {
    comfort[a.id] = 85;
    startStress[a.id] = a.stress ?? 0;
  }
  return {
    mode,
    vehicle: vehicleFor(mode, animals),
    from,
    to,
    km,
    moveHours: hours,
    totalHours: t,
    elapsed: 0,
    phases,
    stops,
    stopIndex: 0,
    status: stops.length && stops[0].at <= 1e-9 ? 'stop' : 'moving',
    ids: animals.map((a) => a.id),
    riderId,
    heat,
    comfort,
    startStress,
    skipped: 0,
    cares: 0,
    cargo: cargo ? { ...cargo } : null,
    safety: safety ? { ...safety } : null,
  };
}

/** A-t-on emporté cette provision (foin, eau, gamelles, trousse) ? Sans coffre (ancien voyage) : oui. */
export const hasSupply = (trip, id) => !trip.cargo || (trip.cargo[id] ?? 0) > 0;

// Pendant la route, les chevaux (et le bétail) mangent au filet à foin : ça les occupe et les calme.
const HAY_EATERS = ['horse', 'cow', 'sheep', 'goat'];
const eatsHayNet = (trip, a, phaseKind) => phaseKind === 'road' && trip.mode !== 'horse' && HAY_EATERS.includes(a.species)
  && !!trip.cargo && (trip.cargo.hay ?? 0) > 0;
// Ce que chacun mange pendant une pause : du foin, ou des croquettes dans sa gamelle.
const FOOD_OF = { horse: 'hay', cow: 'hay', sheep: 'hay', goat: 'hay', dog: 'bowls', cat: 'bowls', rabbit: 'bowls' };

function newStop(at, kind) {
  return { at, kind, done: false, skipped: false, slept: false, actions: {} };
}

/** La phase en cours à l'instant t (en heures depuis le départ). */
export function phaseAt(trip, t = trip.elapsed) {
  return trip.phases.find((p) => t >= p.start - 1e-9 && t < p.end - 1e-9) ?? trip.phases[trip.phases.length - 1];
}

export const currentStop = (trip) => (trip.status === 'stop' ? trip.stops[trip.stopIndex] : null);
export const nextStop = (trip) => trip.stops[trip.stopIndex] ?? null;
export const remainingHours = (trip) => Math.max(0, trip.totalHours - trip.elapsed);
export const progress = (trip) => (trip.totalHours > 0 ? Math.min(1, trip.elapsed / trip.totalHours) : 1);

/** Décale tout ce qui suit d'un temps passé à l'arrêt (soins, nuit…). */
function shift(trip, hours) {
  trip.elapsed += hours;
  trip.totalHours += hours;
  for (let i = trip.stopIndex + 1; i < trip.stops.length; i++) trip.stops[i].at += hours;
  const cur = trip.stops[trip.stopIndex];
  for (const ph of trip.phases) {
    if (ph.start > (cur?.at ?? trip.elapsed) + 1e-9) ph.start += hours;
    if (ph.end > (cur?.at ?? trip.elapsed) - 1e-9) ph.end += hours;
  }
}

/** Le stress gagné en une heure de route, pour un animal. */
export function stressRate(trip, a, phaseKind) {
  let rate = (TRAVEL_STRESS[a.species] ?? 3) * (PERSONALITY_STRESS[a.personality] ?? 1);
  if (phaseKind === 'hold') rate *= 1.8; // bruit, noir, seul dans la soute
  if (trip.mode === 'horse') rate *= 0.35; // marcher à son rythme, c'est naturel
  if (a.needs.thirst < 30) rate += 2;
  if (a.needs.hunger < 25) rate += 1.5;
  if ((trip.comfort[a.id] ?? 80) < 40) rate += 1.5;
  if (trip.heat && phaseKind === 'road' && trip.mode !== 'horse') rate += 1.5;
  // Mal attaché, barre ouverte : il bouge, se cogne et a peur à chaque virage.
  if (trip.safety?.[a.id] === false && phaseKind === 'road') rate += 2.5;
  if (eatsHayNet(trip, a, phaseKind)) rate = Math.max(0.5, rate - 1);
  return rate;
}

/**
 * Fait avancer le voyage de `hours` heures (sans dépasser le prochain arrêt).
 * Renvoie { reached: 'stop' | 'arrived' | null, events: [{ a, events }] }.
 */
export function tickTrip(trip, animals, hours, { rng = Math.random } = {}) {
  const out = { reached: null, events: [] };
  if (trip.status !== 'moving' || hours <= 0) return out;
  const next = nextStop(trip);
  const limit = next ? next.at : trip.totalHours;
  const step = Math.max(0, Math.min(hours, limit - trip.elapsed));
  const phase = phaseAt(trip, trip.elapsed + step / 2);
  const mine = animals.filter((a) => trip.ids.includes(a.id));
  for (const a of mine) {
    const ridden = trip.mode === 'horse' && a.id === trip.riderId;
    const events = tickAnimal(a, step, {
      travelling: true,
      ridden,
      moving: trip.mode === 'horse' && !ridden,
      weather: trip.heat && phase.kind === 'road' && trip.mode !== 'horse' ? 'heat' : undefined,
      rng,
    });
    // Le stress monte de plus en plus lentement quand il est déjà haut.
    const s = a.stress ?? 0;
    a.stress = clamp(s + stressRate(trip, a, phase.kind) * step * (1 - s / 120));
    // En soute, l'équipage leur donne quand même à boire et à manger (traversées de plusieurs jours).
    if (phase.kind === 'hold') {
      if (a.needs.thirst < 35) a.needs.thirst = 65;
      if (a.needs.hunger < 25) a.needs.hunger = 55;
    }
    // À cheval, on est ensemble toute la journée.
    if (trip.mode === 'horse') a.needs.affection = clamp(a.needs.affection + 3 * step);
    // Le filet à foin : il grignote en route.
    if (eatsHayNet(trip, a, phase.kind)) a.needs.hunger = clamp(a.needs.hunger + 2.5 * step);
    trip.comfort[a.id] = clamp((trip.comfort[a.id] ?? 80) - (phase.kind === 'hold' ? 6 : trip.mode === 'horse' ? 2 : 4) * step);
    if (events.length) out.events.push({ a, events });
  }
  trip.elapsed += step;
  if (next && trip.elapsed >= next.at - 1e-9) {
    trip.elapsed = next.at;
    trip.status = 'stop';
    out.reached = 'stop';
  } else if (!next && trip.elapsed >= trip.totalHours - 1e-9) {
    trip.elapsed = trip.totalHours;
    trip.status = 'arrived';
    out.reached = 'arrived';
  }
  return out;
}

/** Peut-on faire ce soin à cet arrêt ? Renvoie { ok, reason }. */
export function canStopAction(trip, a, action) {
  const stop = currentStop(trip);
  if (!stop) return { ok: false, reason: 'moving' };
  if (stop.actions[a.id]?.[action]) return { ok: false, reason: 'done' };
  if (action === 'water' && a.needs.thirst >= 96) return { ok: false, reason: 'full' };
  if (action === 'feed' && a.needs.hunger >= 96) return { ok: false, reason: 'full' };
  // Sans bidon d'eau ni foin dans le coffre, on attend l'étape du soir (l'écurie d'étape a tout ce qu'il faut).
  const served = stop.kind === 'night' || stop.kind === 'landing';
  if (action === 'water' && !served && !hasSupply(trip, 'water')) return { ok: false, reason: 'noWater' };
  if (action === 'feed' && !served && trip.mode !== 'horse' && !hasSupply(trip, FOOD_OF[a.species] ?? 'bowls')) {
    return { ok: false, reason: FOOD_OF[a.species] === 'hay' ? 'noHay' : 'noBowls' };
  }
  if (action === 'walk') {
    // Un chat ou un lapin pourrait s'enfuir : il reste dans sa caisse.
    if (a.species === 'cat' || a.species === 'rabbit') return { ok: false, reason: 'walkCrate' };
    // On ne fait pas descendre un cheval sur une aire d'autoroute : seulement à l'étape du soir.
    if (needsTrailer(a) && trip.mode !== 'horse' && stop.kind !== 'night' && stop.kind !== 'landing') return { ok: false, reason: 'walkTrailer' };
  }
  if (action === 'clean' && trip.mode === 'horse') return { ok: false, reason: 'noCrate' };
  return { ok: true };
}

/**
 * Un soin pendant un arrêt. Renvoie { ok, reason, finding } ; `finding` (pour « vérifier ») dit ce qui ne va pas.
 */
export function doStopAction(trip, a, action) {
  const can = canStopAction(trip, a, action);
  if (!can.ok) return can;
  const stop = currentStop(trip);
  let finding = null;
  switch (action) {
    case 'water':
      applyCare(a, 'water', 1);
      a.stress = clamp((a.stress ?? 0) - 2);
      break;
    case 'feed':
      applyCare(a, 'feed', 1);
      a.stress = clamp((a.stress ?? 0) - 3);
      break;
    case 'walk':
      a.needs.exercise = clamp(a.needs.exercise + 25);
      trip.comfort[a.id] = clamp((trip.comfort[a.id] ?? 80) + 25);
      a.stress = clamp((a.stress ?? 0) - 12);
      break;
    case 'clean':
      trip.comfort[a.id] = clamp((trip.comfort[a.id] ?? 80) + 30);
      a.needs.hygiene = clamp(a.needs.hygiene + 20);
      break;
    case 'calm':
      a.needs.affection = clamp(a.needs.affection + 15);
      a.stress = clamp((a.stress ?? 0) - 10);
      break;
    case 'check':
      a.needs.affection = clamp(a.needs.affection + 5);
      a.stress = clamp((a.stress ?? 0) - 3);
      finding = diagnose(trip, a);
      if (finding === 'loose') trip.safety[a.id] = true; // on le rattache et on referme la barre
      break;
    default:
      return { ok: false, reason: 'unknown' };
  }
  stop.actions[a.id] = { ...stop.actions[a.id], [action]: true };
  trip.cares += 1;
  shift(trip, ACTION_HOURS);
  return { ok: true, finding };
}

/**
 * Reste-t-il une étape du soir plus loin sur la route (après l'arrêt en cours) ? Elle fournit l'eau et le foin ;
 * sinon, sans bidon ni foin dans le coffre, il faut attendre l'arrivée (textes « à l'étape du soir » / « à l'arrivée »).
 */
export function nightStopAhead(trip) {
  const from = trip.status === 'stop' ? trip.stopIndex + 1 : trip.stopIndex;
  return trip.stops.slice(from).some((s) => s.kind === 'night');
}

/** Ce qu'on remarque en vérifiant un animal. */
export function diagnose(trip, a) {
  if (a.sick) return 'sick';
  if (trip.safety?.[a.id] === false) return 'loose';
  if (a.needs.thirst < 40) return 'thirsty';
  if ((a.stress ?? 0) >= 60) return 'stressed';
  if (a.needs.hunger < 35) return 'hungry';
  if ((trip.comfort[a.id] ?? 80) < 45) return 'uncomfortable';
  return 'ok';
}

/** Étape du soir : tout le monde dort à l'écurie ou au gîte (les animaux sortent du véhicule). */
export function sleepAtStop(trip, animals, { rng = Math.random } = {}) {
  const stop = currentStop(trip);
  if (!stop || stop.kind !== 'night' || stop.slept) return { ok: false };
  const events = [];
  for (const a of animals.filter((x) => trip.ids.includes(x.id))) {
    const ev = tickAnimal(a, NIGHT_HOURS, { sleeping: true, travelling: true, rng });
    a.needs.energy = Math.max(a.needs.energy, 90);
    a.stress = clamp((a.stress ?? 0) - 35);
    trip.comfort[a.id] = 90;
    if (ev.length) events.push({ a, events: ev });
  }
  stop.slept = true;
  stop.actions = {}; // le matin, on peut de nouveau leur donner à boire et à manger
  trip.elapsed += NIGHT_HOURS;
  return { ok: true, events };
}

/** Peut-on repartir ? Une étape du soir demande de dormir (ou de la sauter). */
export function canContinue(trip) {
  const stop = currentStop(trip);
  if (!stop) return false;
  return stop.kind !== 'night' || stop.slept;
}

/** Repartir après un arrêt : la pause a fait du bien à tout le monde. */
export function continueTrip(trip, animals) {
  const stop = currentStop(trip);
  if (!stop || !canContinue(trip)) return false;
  for (const a of animals.filter((x) => trip.ids.includes(x.id))) {
    a.stress = clamp((a.stress ?? 0) - 4);
    trip.comfort[a.id] = clamp((trip.comfort[a.id] ?? 80) + 5);
  }
  stop.done = true;
  advance(trip);
  return true;
}

/** Ne pas s'arrêter : plus de soif, plus de stress. Sauter une nuit, c'est rouler fatigué toute la nuit. */
export function skipStop(trip, animals) {
  const stop = currentStop(trip);
  if (!stop) return false;
  for (const a of animals.filter((x) => trip.ids.includes(x.id))) {
    a.stress = clamp((a.stress ?? 0) + (stop.kind === 'night' ? 15 : 8));
    a.needs.thirst = clamp(a.needs.thirst - 5);
    trip.comfort[a.id] = clamp((trip.comfort[a.id] ?? 80) - 10);
    if (stop.kind === 'night') a.needs.energy = clamp(a.needs.energy - 25);
  }
  if (stop.kind === 'night' && !stop.slept) {
    // On roule pendant la nuit : le voyage est plus court, mais bien plus dur.
    trip.totalHours -= NIGHT_HOURS;
    for (let i = trip.stopIndex + 1; i < trip.stops.length; i++) trip.stops[i].at -= NIGHT_HOURS;
    for (const ph of trip.phases) {
      if (ph.start > stop.at + 1e-9) ph.start -= NIGHT_HOURS;
      if (ph.end > stop.at + 1e-9) ph.end -= NIGHT_HOURS;
    }
  }
  stop.skipped = true;
  trip.skipped += 1;
  advance(trip);
  return true;
}

function advance(trip) {
  trip.stopIndex += 1;
  trip.status = trip.elapsed >= trip.totalHours - 1e-9 && !nextStop(trip) ? 'arrived' : 'moving';
}

/** Soins minimum faits automatiquement quand on ne regarde pas le trajet : un peu d'eau, à manger le soir et le matin. */
export function autoCare(trip, animals) {
  const stop = currentStop(trip);
  if (!stop) return;
  for (const a of animals.filter((x) => trip.ids.includes(x.id))) {
    if (a.needs.thirst < 70 && canStopAction(trip, a, 'water').ok) doStopAction(trip, a, 'water');
    if (stop.kind === 'night' && a.needs.hunger < 60 && canStopAction(trip, a, 'feed').ok) doStopAction(trip, a, 'feed');
    if (stop.kind === 'night' && !stop.slept && canStopAction(trip, a, 'calm').ok) doStopAction(trip, a, 'calm');
  }
}

/** « Passer le trajet » : tout se fait tout seul, avec les soins minimum. */
export function runToEnd(trip, animals, { rng = Math.random } = {}) {
  const events = [];
  let guard = 0;
  while (trip.status !== 'arrived' && guard++ < 1000) {
    if (trip.status === 'moving') {
      events.push(...tickTrip(trip, animals, 1, { rng }).events);
    } else if (trip.status === 'stop') {
      autoCare(trip, animals);
      const stop = currentStop(trip);
      if (stop.kind === 'night' && !stop.slept) {
        events.push(...sleepAtStop(trip, animals, { rng }).events);
        autoCare(trip, animals);
      }
      continueTrip(trip, animals);
    }
  }
  return events;
}

/** Niveau de stress lisible : 'calm' | 'tense' | 'stressed' | 'panic'. */
export function stressLevel(stress = 0) {
  if (stress < 25) return 'calm';
  if (stress < 50) return 'tense';
  if (stress < SICK_STRESS) return 'stressed';
  return 'panic';
}

/**
 * Fin du voyage : un animal très stressé est fatigué, et peut tomber malade.
 * Renvoie le bilan { hours, skipped, cares, animals: [{ a, stress, level, sick }] }.
 */
export function finishTrip(trip, animals, { rng = Math.random } = {}) {
  const report = { hours: trip.elapsed, skipped: trip.skipped, cares: trip.cares, animals: [] };
  // Avec la trousse de secours, on soigne tout de suite les petits bobos du voyage.
  const kit = !!trip.cargo && (trip.cargo.firstAid ?? 0) > 0;
  for (const a of animals.filter((x) => trip.ids.includes(x.id))) {
    const stress = Math.round(a.stress ?? 0);
    a.needs.energy = clamp(a.needs.energy - stress * 0.3);
    a.trips = (a.trips ?? 0) + 1; // il a l'habitude : la prochaine fois, il montera plus facilement
    let sick = false;
    if (!a.sick && stress >= SICK_STRESS) {
      const chance = (stress >= 95 ? 1 : 0.5) * (kit ? 0.5 : 1);
      if (rng() < chance) {
        // Le stress du transport donne souvent mal au ventre (coliques chez le cheval).
        a.sick = 'belly';
        sick = true;
      }
    }
    report.animals.push({ a, stress, level: stressLevel(stress), sick });
  }
  trip.status = 'arrived';
  return report;
}

/**
 * Les conseils à montrer pour ce voyage (clés de texte, sans le préfixe « trip_tip_ »).
 * Le premier est toujours le plus important.
 */
export function tipsFor(trip, animals) {
  const mine = animals.filter((a) => trip.ids.includes(a.id));
  const tips = [];
  if (trip.moveHours >= 6 || trip.mode === 'plane' || trip.mode === 'boat') tips.push('long');
  if (mine.some((a) => a.species === 'horse') && trip.mode !== 'horse') tips.push('horseStand', 'horseRule', 'tieRule');
  if (trip.cargo && mine.some((a) => HAY_EATERS.includes(a.species)) && trip.mode !== 'horse') tips.push(hasSupply(trip, 'hay') ? 'hayNet' : 'noHay');
  if (trip.cargo && !hasSupply(trip, 'water') && mine.length) tips.push('noWater');
  if (trip.mode === 'plane' || trip.mode === 'boat') tips.push('hold');
  if (trip.vehicle !== 'none') tips.push('carSun');
  if (mine.some((a) => a.species === 'cat' || a.species === 'rabbit')) tips.push('crate');
  if (mine.some((a) => a.species === 'dog')) tips.push('dogWalk');
  tips.push('water', 'neighbour', 'stressHome');
  if (trip.mode === 'horse') tips.push('horseRide');
  return [...new Set(tips)];
}

/** Durée conseillée : au-delà, mieux vaut laisser les animaux à la maison chez le voisin. */
export const LONG_TRIP_HOURS = 6;
export const isLongTrip = (hours, mode) => hours >= LONG_TRIP_HOURS || mode === 'plane' || mode === 'boat';
