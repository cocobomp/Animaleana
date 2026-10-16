// Métier « Guide de randonnée » 🧭 : des visiteurs demandent une balade à cheval, on leur
// prête nos chevaux, on prépare le matériel, on les emmène sur un itinéraire et on gère les
// petits événements du chemin. Logique pure (sans 3D ni DOM), testée dans tests/trailGuide.test.js.
// La partie 3D est dans src/game/TrailGuide.js, l'interface dans src/ui/trailGuide.js.
// Le métier est inscrit dans le registre des métiers (CAREERS.trailGuide dans src/sim/careers.js) :
// il apparaît dans le panneau 💼, partage l'XP (profile.careers.xp.trailGuide) et le carnet.
//
// Dans le profil :
//   profile.careers.xp.trailGuide : expérience du métier (rangs apprenti / confirmé / expert)
//   profile.trailGuide = {
//     reputation: 50,        // 0 à 100
//     bookings: [],          // réservations acceptées pas encore faites (ici ou ailleurs)
//     history: [],           // balades faites { day, place, group, riders, stars, pay, tip }
//     offer: null,           // la demande en cours (les visiteurs attendent la réponse)
//     seen: [],              // actions du carnet déjà expliquées (petit tutoriel la première fois)
//     nextOfferAt: 0,        // horloge (minutes) à partir de laquelle une nouvelle demande peut arriver
//     started: null,         // jour où l'on a accepté sa première balade
//   }

import { canRide } from './animal.js';
// (comme wears() de gear.js, recopié ici : gear.js importe profile.js → careers.js → ce fichier, une boucle)
const wears = (a, item) => Object.values(a.gear ?? {}).some((g) => g.item === item);
import { seeded, pick, uid } from './rng.js';
import { PLACES, PLACE_IDS } from './places.js';

const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));

// ---------------------------------------------------------------- le métier

export const RANK_IDS = ['apprentice', 'skilled', 'expert'];

/**
 * Définition du métier (inscrite dans CAREERS, src/sim/careers.js).
 * ranks : XP de métier pour chaque rang ; perks : ce que chaque rang permet
 * (maxClients: 0 → ce métier ne fait pas venir de clients qui confient leurs animaux, src/sim/clients.js).
 * building : toucher l'écurie propose le métier (« Tu veux apprendre le métier de… ? »).
 */
export const TRAIL_GUIDE_CAREER = {
  id: 'trailGuide',
  emoji: '🧭',
  level: 4, // niveau du joueur pour que les premiers visiteurs arrivent
  building: 'stable',
  name: { fr: 'Guide de randonnée', en: 'Trail guide' },
  desc: {
    fr: 'Emmène des visiteurs en balade à cheval : choisis le bon cheval pour chacun, prépare le matériel et veille sur tout le monde en chemin.',
    en: 'Take visitors on horseback rides: pick the right horse for each one, pack the gear and look after everyone on the way.',
  },
  ranks: [0, 150, 400],
  // Le carnet : chaque action est expliquée la première fois (tutoriel) et cochée quand elle est faite.
  actions: [
    { id: 'accept', emoji: '📋', where: 'visitor' },
    { id: 'prepare', emoji: '✅', where: 'stable' },
    { id: 'ride', emoji: '🐎', where: 'trail' },
    { id: 'photo', emoji: '📷', where: 'trail' },
    { id: 'break', emoji: '🧃', where: 'trail' },
    { id: 'return', emoji: '⭐', where: 'stable' },
  ],
  perks: [
    { maxRiders: 2, durations: ['short'], abroad: false, dogs: false, special: false, price: 1, tips: false, maxClients: 0 },
    { maxRiders: 4, durations: ['short', 'half'], abroad: true, dogs: true, special: false, price: 1.15, tips: true, maxClients: 0 },
    { maxRiders: 6, durations: ['short', 'half', 'trek'], abroad: true, dogs: true, special: true, price: 1.3, tips: true, maxClients: 0 },
  ],
};

export function defaultTrailGuide() {
  return { reputation: 50, bookings: [], history: [], offer: null, seen: [], nextOfferAt: 0, started: null };
}

/** État du métier dans le profil (complété pour les vieilles sauvegardes). */
export function tgState(p) {
  if (!p.trailGuide) p.trailGuide = defaultTrailGuide();
  else for (const [k, v] of Object.entries(defaultTrailGuide())) if (p.trailGuide[k] === undefined) p.trailGuide[k] = v;
  p.careers = p.careers ?? {};
  p.careers.xp = p.careers.xp ?? {};
  if (p.careers.xp.trailGuide === undefined) p.careers.xp.trailGuide = 0;
  return p.trailGuide;
}

export const trailXp = (p) => p.careers?.xp?.trailGuide ?? 0;

/** Rang : 0 apprenti, 1 confirmé, 2 expert. */
export function rankOf(p) {
  const xp = trailXp(p);
  let r = 0;
  TRAIL_GUIDE_CAREER.ranks.forEach((need, i) => { if (xp >= need) r = i; });
  return r;
}

export const perksOf = (p) => TRAIL_GUIDE_CAREER.perks[rankOf(p)];

/** Progression vers le rang suivant : { rank, xp, from, to, ratio } (to = null au rang expert). */
export function rankProgress(p) {
  const rank = rankOf(p);
  const xp = trailXp(p);
  const from = TRAIL_GUIDE_CAREER.ranks[rank];
  const to = TRAIL_GUIDE_CAREER.ranks[rank + 1] ?? null;
  return { rank, xp, from, to, ratio: to === null ? 1 : Math.min(1, (xp - from) / (to - from)) };
}

/** Ajoute de l'XP de métier. Renvoie { xp, rank, rankUp }. */
export function addTrailXp(p, n) {
  tgState(p);
  const before = rankOf(p);
  p.careers.xp.trailGuide = trailXp(p) + n;
  const rank = rankOf(p);
  return { xp: p.careers.xp.trailGuide, rank, rankUp: rank > before };
}

export function changeReputation(p, delta) {
  const st = tgState(p);
  st.reputation = clamp(st.reputation + delta);
  if (p.careers?.reputation) p.careers.reputation.trailGuide = st.reputation; // carte du panneau 💼
  return st.reputation;
}

/** Une action du carnet faite pour la première fois ? (alors on l'explique). */
export function noteAction(p, actionId) {
  const st = tgState(p);
  if (st.seen.includes(actionId)) return false;
  st.seen.push(actionId);
  return true;
}

// ---------------------------------------------------------------- visiteurs et demandes

export const RIDER_NAMES = [
  ['Léa', 'f'], ['Hugo', 'm'], ['Emma', 'f'], ['Lucas', 'm'], ['Chloé', 'f'], ['Nathan', 'm'], ['Inès', 'f'], ['Jules', 'm'],
  ['Manon', 'f'], ['Louis', 'm'], ['Zoé', 'f'], ['Adam', 'm'], ['Camille', 'f'], ['Sacha', 'm'], ['Lina', 'f'], ['Tom', 'm'],
  ['Alice', 'f'], ['Noah', 'm'], ['Rose', 'f'], ['Gabriel', 'm'],
];
const GRANDMA_NAMES = [['Mamie Jeanne', 'f'], ['Mamie Odette', 'f'], ['Papi Marcel', 'm'], ['Mamie Rosa', 'f']];

/** Niveaux des cavaliers (débutant, moyen, confirmé) et gabarits (enfant, adulte). */
export const LEVELS = ['beginner', 'medium', 'confirmed'];

/**
 * Groupes de visiteurs : qui vient, et ce qu'ils demandent.
 * minRank : rang du guide nécessaire pour que ce groupe vienne.
 */
export const GROUPS = {
  kid: { emoji: '🧒', minRank: 0, riders: [{ age: 'child', level: 'beginner' }] },
  grandma: { emoji: '👵', minRank: 0, riders: [{ age: 'senior', level: 'beginner' }] },
  friends: { emoji: '🧑‍🤝‍🧑', minRank: 0, riders: [{ age: 'adult', level: 'medium' }, { age: 'adult', level: 'confirmed' }] },
  family: { emoji: '👨‍👩‍👧', minRank: 1, riders: [{ age: 'adult', level: 'medium' }, { age: 'adult', level: 'beginner' }, { age: 'child', level: 'beginner' }] },
  club: { emoji: '🏇', minRank: 2, riders: [{ age: 'adult', level: 'confirmed' }, { age: 'adult', level: 'medium' }, { age: 'adult', level: 'medium' }, { age: 'child', level: 'beginner' }, { age: 'adult', level: 'beginner' }] },
};

/** Durées : heures de jeu, nombre de balises, prix par cavalier. */
export const DURATIONS = {
  short: { hours: 1, legs: 5, price: 15 },
  half: { hours: 3, legs: 8, price: 30 },
  trek: { hours: 20, legs: 16, price: 60 }, // avec une nuit au gîte
};

/** Poids d'un cavalier : enfant (poney) ou adulte. */
export const weightOf = (rider) => (rider.age === 'child' ? 'child' : 'adult');

export function makeRiders(groupId, rng = Math.random) {
  const names = [...RIDER_NAMES];
  return GROUPS[groupId].riders.map((r, i) => {
    const [name, sex] = r.age === 'senior' ? pick(GRANDMA_NAMES, rng) : names.splice(Math.floor(rng() * names.length), 1)[0];
    return { id: `${groupId}${i}`, name, sex, age: r.age, level: r.level, weight: weightOf(r), fun: 60, horseId: null };
  });
}

/** Lieux où le rang expert propose des itinéraires spéciaux. */
export const SPECIAL_ROUTES = { islande: 'volcano', alpes: 'summit' };

/**
 * Une demande de balade. here : les visiteurs sont ici (sinon rendez-vous ailleurs, dans quelques jours).
 * rng : pour des tests reproductibles.
 */
export function makeBooking(p, { day, place, rng = Math.random, here = true }) {
  const rank = rankOf(p);
  const perks = perksOf(p);
  const groups = Object.entries(GROUPS).filter(([, g]) => g.minRank <= rank && g.riders.length <= perks.maxRiders).map(([id]) => id);
  const group = pick(groups, rng);
  const riders = makeRiders(group, rng);
  // Les grandes balades restent rares : surtout des petites sorties d'une heure.
  const durations = perks.durations.flatMap((d) => (d === 'short' ? [d, d] : [d]));
  const duration = pick(durations, rng);
  let placeId = place;
  let when = day;
  if (!here) {
    const others = PLACE_IDS.filter((id) => id !== place);
    placeId = pick(others, rng);
    when = day + 1 + Math.floor(rng() * 3);
  }
  const special = perks.special && SPECIAL_ROUTES[placeId] && rng() < 0.6 ? SPECIAL_ROUTES[placeId] : null;
  const route = special ?? routeFor(placeId, rng);
  const dogs = perks.dogs && rng() < 0.5;
  return {
    id: uid(),
    group,
    riders,
    duration,
    hours: DURATIONS[duration].hours,
    place: placeId,
    day: when,
    route,
    price: Math.round(DURATIONS[duration].price * riders.length),
    dogsWelcome: dogs, // les visiteurs aiment que nos chiens viennent (rang confirmé)
    status: 'offered',
    prep: { water: false, snack: false, dogs: false },
  };
}

/**
 * Faut-il faire arriver des visiteurs ? Entre 9 h et 17 h, pas pendant qu'on a déjà une demande
 * ou une balade prévue ici, et pas trop souvent (nextOfferAt).
 * ctx : { level, clock, hour, place }
 */
export function offerDue(p, { level, clock, hour, place }) {
  const st = tgState(p);
  if (level < TRAIL_GUIDE_CAREER.level) return false;
  if (st.offer) return false;
  if (st.bookings.some((b) => b.place === place)) return false;
  if (hour < 9 || hour >= 17) return false;
  return clock >= st.nextOfferAt;
}

/** Les visiteurs proposent : un rendez-vous ailleurs une fois sur trois (au rang confirmé). */
export function createOffer(p, { day, place, clock, rng = Math.random }) {
  const st = tgState(p);
  const abroad = perksOf(p).abroad && !st.bookings.length && rng() < 0.33;
  st.offer = makeBooking(p, { day, place, rng, here: !abroad });
  return st.offer;
}

export function acceptOffer(p, day = 1) {
  const st = tgState(p);
  const b = st.offer;
  if (!b) return null;
  b.status = 'accepted';
  st.offer = null;
  st.bookings.push(b);
  st.nextOfferAt = 0;
  if (st.started === null) st.started = day;
  p.stats = p.stats ?? {};
  p.stats.tgAccepted = (p.stats.tgAccepted ?? 0) + 1;
  return b;
}

export function refuseOffer(p, clock = 0) {
  const st = tgState(p);
  st.offer = null;
  st.nextOfferAt = clock + 3 * 60; // on nous laisse tranquille 3 h
}

/** La balade prévue ici (aujourd'hui ou en retard d'un jour), ou null. */
export function bookingHere(p, place, day) {
  return tgState(p).bookings.find((b) => b.place === place && day >= b.day && day <= b.day + 1) ?? null;
}

/** Rendez-vous ratés (on est passé la date) : retirés, avec un peu de réputation en moins. */
export function expireBookings(p, day) {
  const st = tgState(p);
  const missed = st.bookings.filter((b) => day > b.day + 1);
  if (missed.length) {
    st.bookings = st.bookings.filter((b) => !missed.includes(b));
    changeReputation(p, -4 * missed.length);
  }
  return missed;
}

// ---------------------------------------------------------------- itinéraires

/**
 * Itinéraires par type de paysage (coordonnées monde autour de la ferme). Chaque étape (« leg »)
 * va d'une balise à la suivante ; les événements sont placés sur une étape :
 *  - lag : un cavalier reste en arrière (ralentir)
 *  - scare : un sac plastique fait peur (s'arrêter, rassurer)
 *  - stream : un ruisseau à passer au pas
 *  - sight : le point de vue à photographier
 *  - break : la pause goûter
 */
export const ROUTES = {
  meadow: {
    emoji: '🌾',
    points: [{ x: -38, z: -26 }, { x: -20, z: -56 }, { x: 18, z: -62 }, { x: 46, z: -32 }, { x: 46, z: 18 }, { x: 30, z: 62 }, { x: -6, z: 52 }, { x: -2, z: 12 }],
    lag: 1, scare: 2, stream: null, sight: { id: 'windmill', leg: 3 }, break: 4,
  },
  forest: {
    emoji: '🌲',
    points: [{ x: -30, z: -30 }, { x: -10, z: -50 }, { x: 20, z: -54 }, { x: 40, z: -40 }, { x: 36, z: -14 }, { x: 14, z: -26 }, { x: -6, z: -34 }, { x: -18, z: -16 }],
    lag: 1, scare: 3, stream: null, sight: { id: 'oldTree', leg: 2 }, break: 4,
  },
  river: {
    emoji: '🏞️',
    points: [{ x: -40, z: -12 }, { x: -60, z: -22 }, { x: -70, z: -46 }, { x: -40, z: -62 }, { x: -6, z: -66 }, { x: 26, z: -56 }, { x: 12, z: -30 }, { x: -8, z: -18 }],
    lag: 1, scare: 2, stream: 3, sight: { id: 'viewpoint', leg: 5 }, break: 4,
  },
  cliffs: {
    emoji: '🌊',
    points: [{ x: -40, z: -30 }, { x: -30, z: -60 }, { x: 10, z: -70 }, { x: 40, z: -58 }, { x: 44, z: -20 }, { x: 40, z: 24 }, { x: 24, z: 56 }, { x: -4, z: 30 }],
    lag: 2, scare: 1, stream: null, sight: { id: 'viewpoint', leg: 4 }, break: 5,
  },
  mountain: {
    emoji: '⛰️',
    points: [{ x: -44, z: -28 }, { x: -66, z: -50 }, { x: -40, z: -70 }, { x: 0, z: -72 }, { x: 40, z: -66 }, { x: 56, z: -30 }, { x: 36, z: 10 }, { x: -4, z: 14 }],
    lag: 1, scare: 3, stream: 5, sight: { id: 'cairn', leg: 2 }, break: 4,
  },
  // Itinéraires spéciaux (rang expert) : Islande et Alpes.
  volcano: {
    emoji: '🌋', special: true,
    points: [{ x: -50, z: -40 }, { x: -72, z: -70 }, { x: -20, z: -90 }, { x: 30, z: -82 }, { x: 68, z: -50 }, { x: 72, z: 0 }, { x: 40, z: 42 }, { x: -6, z: 20 }],
    lag: 1, scare: 2, stream: 3, sight: { id: 'viewpoint', leg: 4 }, break: 5,
  },
  summit: {
    emoji: '🏔️', special: true,
    points: [{ x: -46, z: -36 }, { x: -70, z: -66 }, { x: -36, z: -92 }, { x: 12, z: -94 }, { x: 54, z: -72 }, { x: 70, z: -30 }, { x: 44, z: 20 }, { x: -2, z: 18 }],
    lag: 2, scare: 3, stream: 1, sight: { id: 'cairn', leg: 4 }, break: 5,
  },
};

/** Quels itinéraires existent dans chaque paysage (le premier est le plus courant). */
export const BIOME_ROUTES = {
  countryside: ['meadow', 'forest'],
  beach: ['cliffs', 'meadow'],
  mountain: ['mountain', 'forest'],
  tundra: ['river', 'mountain'],
  prairie: ['meadow', 'river'],
  garden: ['forest', 'river'],
  mediterranean: ['cliffs', 'forest'],
  outback: ['meadow', 'river'],
};

export function routeFor(placeId, rng = Math.random) {
  const list = BIOME_ROUTES[PLACES[placeId]?.biome] ?? ['meadow'];
  return rng() < 0.65 ? list[0] : list[list.length - 1];
}

/** L'autre itinéraire du lieu (pour le retour d'un trek). */
export function otherRoute(placeId, routeId) {
  const list = BIOME_ROUTES[PLACES[placeId]?.biome] ?? ['meadow'];
  return list.find((r) => r !== routeId) ?? list[0];
}

export const STABLE_DOOR = { x: -15.5, z: -4 };
export const LODGE_DOOR = { x: 0, z: -10.5 };

/**
 * Le plan complet d'une balade : balises dans l'ordre et événements par étape.
 * Renvoie { points: [{x,z,kind}], events: [{ type, leg, ... }] }. kind : 'marker' | 'lodge' | 'finish'.
 */
export function ridePlan(booking) {
  const route = ROUTES[booking.route] ?? ROUTES.meadow;
  const d = DURATIONS[booking.duration] ?? DURATIONS.short;
  const points = route.points.slice(0, Math.min(route.points.length, d.legs)).map((pt) => ({ ...pt, kind: 'marker' }));
  const events = [];
  const ev = (type, leg, extra = {}) => { if (leg < points.length) events.push({ type, leg, ...extra }); };
  ev('lag', route.lag);
  ev('scare', route.scare);
  if (route.stream !== null) ev('stream', route.stream);
  ev('sight', route.sight.leg, { id: route.sight.id });
  ev('break', Math.min(route.break, points.length - 1));
  if (booking.duration === 'trek') {
    // Nuit au gîte, puis un second itinéraire le lendemain.
    const back = ROUTES[otherRoute(booking.place, booking.route)] ?? ROUTES.forest;
    const n0 = points.length;
    points.push({ ...LODGE_DOOR, kind: 'lodge' });
    for (const pt of back.points) points.push({ ...pt, kind: 'marker' });
    const off = n0 + 1;
    ev('lag', off + back.lag);
    ev('scare', off + back.scare);
    if (back.stream !== null) ev('stream', off + back.stream);
    ev('sight', off + back.sight.leg, { id: back.sight.id });
    ev('break', off + Math.min(back.break, back.points.length - 1));
  }
  points.push({ ...STABLE_DOOR, kind: 'finish' });
  return { points, events };
}

// ---------------------------------------------------------------- préparer la balade

/** Un poney : un petit cheval (Shetland, islandais, Kiso…). */
export const isPony = (a) => a.species === 'horse' && (a.look?.scale ?? 1) <= 0.8;

/**
 * Ce cheval convient-il à ce cavalier ? Règles simples :
 *  - un cheval calme (obéissance ≥ 40, pas têtu) pour un débutant,
 *  - un poney pour un enfant (ou un cheval très obéissant),
 *  - pas de cheval malade, enceinte, trop jeune ni fatigué,
 *  - le lien avec nous compte (score).
 */
export function horseFit(horse, rider) {
  if (horse.species !== 'horse') return { ok: false, reason: 'notHorse' };
  const r = canRide(horse);
  if (!r.ok) return { ok: false, reason: r.reason };
  if (horse.needs.energy < 35) return { ok: false, reason: 'tired' };
  const ob = horse.skills?.obedience ?? 10;
  if (rider.level === 'beginner' && ob < 40) return { ok: false, reason: 'notCalm' };
  if (rider.level === 'beginner' && horse.personality === 'stubborn') return { ok: false, reason: 'stubborn' };
  if (rider.weight === 'child' && !isPony(horse) && ob < 60) return { ok: false, reason: 'needPony' };
  if (rider.weight === 'adult' && isPony(horse)) return { ok: false, reason: 'tooSmall' };
  const score = (horse.bond ?? 0) + ob * 0.5 + (horse.skills?.endurance ?? 0) * 0.3 + (rider.weight === 'child' && isPony(horse) ? 20 : 0)
    + (horse.personality === 'calm' ? 10 : 0);
  return { ok: true, score: Math.round(score) };
}

/** Le meilleur cheval pour chaque cavalier (sans en donner deux fois le même). */
export function autoAssign(booking, horses, exclude = []) {
  const taken = new Set(exclude);
  for (const rider of booking.riders) {
    rider.horseId = null;
    const best = horses.filter((h) => !taken.has(h.id)).map((h) => ({ h, fit: horseFit(h, rider) })).filter((x) => x.fit.ok)
      .sort((a, b) => b.fit.score - a.fit.score)[0];
    if (best) {
      rider.horseId = best.h.id;
      taken.add(best.h.id);
    }
  }
  return booking.riders;
}

/**
 * Matériel : selle + filet, ou licol seul pour un poney mené (enfant).
 * Renvoie { ok, reason: 'needBridle' | 'needSaddle', led }.
 */
export function gearFit(horse, rider) {
  const led = rider.weight === 'child' && isPony(horse);
  if (led) return wears(horse, 'halter') || wears(horse, 'bridle') ? { ok: true, led: true } : { ok: false, reason: 'needHalter', led: true };
  if (!wears(horse, 'bridle') && !wears(horse, 'halter')) return { ok: false, reason: 'needBridle', led: false };
  if (!wears(horse, 'saddle')) return { ok: false, reason: 'needSaddle', led: false };
  return { ok: true, led: false };
}

/** Météo : orage ou canicule = on reporte. */
export function weatherBlock(weather, temperature) {
  if (weather === 'storm') return 'storm';
  if (temperature >= 30) return 'heat';
  return null;
}

/** Notre propre cheval pour guider : monté, avec un filet ou un licol. */
export function guideHorseFit(horse) {
  if (horse.species !== 'horse') return { ok: false, reason: 'notHorse' };
  const r = canRide(horse);
  if (!r.ok) return { ok: false, reason: r.reason };
  if (!wears(horse, 'bridle') && !wears(horse, 'halter')) return { ok: false, reason: 'needBridle' };
  return { ok: true };
}

/**
 * La liste à cocher avant de partir.
 * ctx : { horses (nos chevaux ici), guideHorseId, weather, temperature }
 * Renvoie { items: [{ id, ok, rider?, horse?, reason?, params? }], ok }.
 */
export function prepChecklist(booking, { horses = [], guideHorseId = booking.guideHorseId ?? null, weather = 'clear', temperature = 20 } = {}) {
  const items = [];
  const byId = (id) => horses.find((h) => h.id === id) ?? null;
  for (const rider of booking.riders) {
    const horse = byId(rider.horseId);
    if (!horse) items.push({ id: 'horse', rider, ok: false, reason: 'noHorse' });
    else {
      const fit = horseFit(horse, rider);
      if (!fit.ok) items.push({ id: 'horse', rider, horse, ok: false, reason: fit.reason });
      else if (rider.horseId === guideHorseId) items.push({ id: 'horse', rider, horse, ok: false, reason: 'yourHorse' });
      else {
        items.push({ id: 'horse', rider, horse, ok: true });
        const g = gearFit(horse, rider);
        items.push({ id: 'gear', rider, horse, ok: g.ok, reason: g.reason, led: g.led });
      }
    }
  }
  const dup = booking.riders.filter((r) => r.horseId && booking.riders.some((o) => o !== r && o.horseId === r.horseId));
  if (dup.length) items.push({ id: 'sameHorse', ok: false, reason: 'sameHorse' });
  const mine = byId(guideHorseId);
  const gf = mine ? guideHorseFit(mine) : { ok: false, reason: 'noHorse' };
  items.push({ id: 'guideHorse', horse: mine, ok: gf.ok, reason: gf.ok ? undefined : gf.reason });
  items.push({ id: 'water', ok: !!booking.prep?.water });
  items.push({ id: 'snack', ok: !!booking.prep?.snack });
  const wb = weatherBlock(weather, temperature);
  items.push({ id: 'weather', ok: !wb, reason: wb ?? undefined });
  return { items, ok: items.every((i) => i.ok) };
}

// ---------------------------------------------------------------- la balade et son résultat

/** Jauges pendant la balade : plaisir des cavaliers (0–100) et eau des chevaux (0–100). */
export const FUN = {
  start: 60,
  checkpoint: 4, photo: 10, break: 12, eventGood: 8, eventBad: -12,
  troting: -8, // au trot dans le ruisseau
  lagPerSec: -2, // on laisse un cavalier derrière
  lostPerSec: -1, // mauvaise direction
  thirstyPerSec: -1, // chevaux sans eau (< 30)
};

export const WATER_PER_MIN = 14; // l'eau des chevaux baisse de 14 points par minute réelle de balade

export const addFun = (rider, n) => { rider.fun = clamp(rider.fun + n); };

/** Un commentaire de cavalier selon son plaisir : 'great' | 'ok' | 'bad'. */
export const riderMood = (fun) => (fun >= 75 ? 'great' : fun >= 45 ? 'ok' : 'bad');

/**
 * Résultat de la balade.
 * { riders, water, photos, handled, total (événements), legs, totalLegs, booking, perks }
 * Renvoie { stars, fun, pay, tip, repDelta, xp, comments: [{ rider, mood }] }.
 */
export function rideResult({ riders, water = 100, photos = 0, handled = 0, total = 1, legs, totalLegs, booking, perks, aborted = false }) {
  const fun = riders.length ? Math.round(riders.reduce((s, r) => s + r.fun, 0) / riders.length) : 0;
  const done = totalLegs ? legs / totalLegs : 1;
  let score = fun * 0.6 + water * 0.15 + done * 100 * 0.15 + (photos ? 10 : 0) + (total ? (handled / total) * 5 : 5);
  if (aborted) score *= 0.5;
  const stars = aborted ? 1 : score >= 78 ? 3 : score >= 52 ? 2 : 1;
  const base = booking?.price ?? 0;
  const pay = aborted ? Math.round(base * 0.3) : Math.round(base * (0.5 + (fun / 100) * 0.6) * (perks?.price ?? 1));
  const tip = !aborted && perks?.tips && fun >= 85 ? Math.round(base * 0.2) : 0;
  const repDelta = aborted ? -6 : stars === 3 ? 6 : stars === 2 ? 2 : -3;
  const hours = booking ? DURATIONS[booking.duration]?.hours ?? 1 : 1;
  const xp = aborted ? 10 : 30 + stars * 15 + riders.length * 5 + Math.min(40, hours * 2) + photos * 3;
  return { stars, fun, pay, tip, repDelta, xp, photos, comments: riders.map((r) => ({ rider: r, mood: riderMood(r.fun) })), aborted };
}

/** Gain d'endurance et de lien des chevaux après la balade. */
export const horseGains = (booking) => ({ endurance: booking.duration === 'trek' ? 8 : booking.duration === 'half' ? 5 : 3, bond: 4 });

/**
 * Applique le résultat au profil : argent (via earn, fourni par le jeu), réputation, XP, historique,
 * statistiques pour les quêtes. Renvoie { rankUp, rank, reputation }.
 */
export function applyRideResult(p, booking, result, { day = 1, earn = null, home = true } = {}) {
  const st = tgState(p);
  st.bookings = st.bookings.filter((b) => b.id !== booking.id);
  const money = result.pay + result.tip;
  if (earn && money) earn(money);
  if (p.careers?.earned) p.careers.earned.trailGuide = (p.careers.earned.trailGuide ?? 0) + money; // panneau 💼
  const reputation = changeReputation(p, result.repDelta);
  const x = addTrailXp(p, result.xp);
  st.history.unshift({ day, place: booking.place, group: booking.group, riders: booking.riders.length, stars: result.stars, pay: result.pay, tip: result.tip, duration: booking.duration });
  if (st.history.length > 20) st.history.pop();
  p.stats = p.stats ?? {};
  const add = (k, n = 1) => { p.stats[k] = (p.stats[k] ?? 0) + n; };
  if (!result.aborted) {
    add('tgRides');
    add('tgRiders', booking.riders.length);
    if (result.stars === 3) add('tgStars3');
    if (!home) add('tgAbroad');
    if (booking.duration === 'trek') add('tgTreks');
    add('tgPhotos', result.photos ?? 0);
    add('tgMoney', money);
  }
  return { rankUp: x.rankUp, rank: x.rank, reputation, money };
}
