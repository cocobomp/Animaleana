// Logique d'un animal : besoins, santé, humeur, âge, soins, dressage, reproduction.
// Ce fichier ne dépend pas de la 3D, il est testé dans tests/animal.test.js.

import { SPECIES, getBreed, PERSONALITIES, NAMES } from './species.js';
import { DAYS_PER_YEAR } from './time.js';
import { pick, randRange, uid } from './rng.js';

export const NEEDS = ['hunger', 'thirst', 'hygiene', 'energy', 'exercise', 'affection', 'grooming'];

// Points perdus par heure de jeu (avant multiplicateurs).
const BASE_DECAY = { hunger: 3, thirst: 3.8, hygiene: 1.4, energy: 2, exercise: 2.2, affection: 2.4, grooming: 1 };

const HAPPINESS_WEIGHTS = { hunger: 1.3, thirst: 1.3, hygiene: 0.8, energy: 0.8, exercise: 1, affection: 1.2, grooming: 0.6 };

const PERSONALITY_DECAY = {
  playful: { exercise: 1.4 },
  shy: { affection: 0.8 },
  cuddly: { affection: 1.4 },
  stubborn: {},
  curious: { exercise: 1.2 },
  calm: { exercise: 0.7, energy: 0.9 },
};

const WEATHER_DECAY = {
  rain: { hygiene: 1.6 },
  storm: { hygiene: 1.8, affection: 1.2 },
  snow: { energy: 1.3, hygiene: 1.2 },
  heat: { thirst: 1.5, energy: 1.2 },
  flies: { affection: 1.25, energy: 1.1 },
};

// Le sick-o-mètre : au-delà de NEGLECT_LIMIT heures de tristesse, l'animal tombe malade.
export const NEGLECT_LIMIT = 18;
const SAD_THRESHOLD = 35;

export const ILLNESSES = {
  ear: { zone: 'ears', treatment: 'drops', fever: false },
  paw: { zone: 'legs', treatment: 'bandage', fever: false },
  belly: { zone: 'belly', treatment: 'syrup', fever: true },
  cold: { zone: 'head', treatment: 'syrup', fever: true },
  fleas: { zone: 'back', treatment: 'shampoo', fever: false },
  flu: { zone: 'head', treatment: 'injection', fever: true },
};

export const CARE = {
  feed: { needs: { hunger: 45 }, cost: 3, full: 'hunger' },
  water: { needs: { thirst: 55 }, cost: 0, full: 'thirst' },
  brush: { needs: { grooming: 40, hygiene: 8, affection: 6 }, cost: 0, full: 'grooming' },
  wash: { needs: { hygiene: 60, affection: -4 }, cost: 2, full: 'hygiene' },
  clean: { needs: { hygiene: 45 }, cost: 1, full: 'hygiene' },
  nails: { needs: { grooming: 30 }, cost: 0, full: 'grooming' },
  shoe: { needs: { grooming: 35 }, cost: 15, full: 'grooming' },
  pet: { needs: { affection: 28 }, cost: 0, full: 'affection' },
  treat: { needs: { affection: 15, hunger: 8 }, cost: 2 },
  play: { needs: { exercise: 30, affection: 10, energy: -10 }, cost: 0, tiring: true },
  lunge: { needs: { exercise: 35, energy: -12 }, cost: 0, tiring: true, skills: { obedience: 2, endurance: 1 } },
  liberty: { needs: { exercise: 25, affection: 12, energy: -8 }, cost: 0, tiring: true, skills: { obedience: 3 } },
  shear: { needs: { grooming: 30, hygiene: 10 }, cost: 0, product: true },
  milk: { needs: { affection: 4 }, cost: 0, product: true },
};

export const TRAINING = {
  jump: { skill: 'jump', needs: { exercise: 25, energy: -15 } },
  speed: { skill: 'speed', needs: { exercise: 30, energy: -18 } },
  dressage: { skill: 'obedience', needs: { exercise: 20, energy: -12 } },
  endurance: { skill: 'endurance', needs: { exercise: 35, energy: -20 } },
  agility: { skill: 'jump', needs: { exercise: 30, energy: -15 } },
  obedience: { skill: 'obedience', needs: { exercise: 10, energy: -6 } },
  herding: { skill: 'herding', needs: { exercise: 30, energy: -15 } },
};

const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));

export function resolveLook(speciesId, breedId, colorIndex = 0) {
  const sp = SPECIES[speciesId];
  const breed = getBreed(speciesId, breedId);
  const color = breed.colors[colorIndex % breed.colors.length];
  return {
    ...sp.model,
    earType: breed.earType ?? sp.model.earType,
    tailType: breed.tailType ?? sp.model.tailType,
    scale: breed.scale ?? 1,
    fluff: breed.fluff ?? 1,
    legs: breed.legs ?? 1,
    snout: breed.snout ?? sp.model.snout,
    pattern: color.pattern ?? breed.pattern,
    coat: color.coat,
    secondary: color.secondary,
    third: color.third ?? color.secondary,
    mane: color.mane ?? color.secondary,
    eye: color.eye ?? 0x2a1a10,
    colorName: color.name,
    seed: Math.floor(Math.random() * 1e6),
  };
}

export function createAnimal({
  species, breed, sex, ageDays, name, colorIndex, personality, location = 'maison', rng = Math.random, day = 1,
}) {
  const sp = SPECIES[species];
  const breedDef = getBreed(species, breed) ?? sp.breeds[0];
  const look = resolveLook(species, breedDef.id, colorIndex ?? Math.floor(rng() * breedDef.colors.length));
  return {
    id: uid(),
    name: name ?? pick(NAMES, rng),
    species,
    breed: breedDef.id,
    sex: sex ?? (rng() < 0.5 ? 'f' : 'm'),
    ageDays: ageDays ?? randRange(sp.adultYears * DAYS_PER_YEAR, sp.lifespanYears * 0.4 * DAYS_PER_YEAR, rng),
    lifespanYears: sp.lifespanYears * randRange(0.85, 1.15, rng),
    personality: personality ?? pick(PERSONALITIES, rng),
    look,
    needs: Object.fromEntries(NEEDS.map((n) => [n, Math.round(randRange(65, 95, rng))])),
    health: 100,
    sick: null,
    neglect: 0,
    tricks: {},
    skills: { obedience: 10, speed: 10, endurance: 10, jump: 10, ...(breedDef.herder ? { herding: 35 } : species === 'dog' ? { herding: 5 } : {}) },
    produce: 0,
    weight: 50, // 50 = poids idéal ; plus de 75 = trop gros, moins de 25 = trop maigre
    location,
    lastBirthDay: -999,
    bornDay: day,
    parents: null,
  };
}

export const ageYears = (a) => a.ageDays / DAYS_PER_YEAR;

export function lifeStage(a) {
  const sp = SPECIES[a.species];
  const y = ageYears(a);
  if (y < sp.adultYears * 0.35) return 'baby';
  if (y < sp.adultYears) return 'young';
  if (y > a.lifespanYears * 0.75) return 'senior';
  return 'adult';
}

/** Taille relative à l'âge : un bébé fait environ la moitié d'un adulte. */
export function growthScale(a) {
  const sp = SPECIES[a.species];
  const t = Math.min(1, ageYears(a) / sp.adultYears);
  return 0.42 + 0.58 * Math.sqrt(t);
}

/** 'thin' | 'ideal' | 'chubby' | 'fat' */
export function weightClass(a) {
  const w = a.weight ?? 50;
  if (w < 25) return 'thin';
  if (w <= 65) return 'ideal';
  if (w <= 80) return 'chubby';
  return 'fat';
}

export function happiness(a) {
  let sum = 0;
  let weights = 0;
  for (const n of NEEDS) {
    sum += a.needs[n] * HAPPINESS_WEIGHTS[n];
    weights += HAPPINESS_WEIGHTS[n];
  }
  let h = (sum / weights) * (0.55 + 0.45 * (a.health / 100));
  if (a.sick) h -= 20;
  return clamp(Math.round(h));
}

export function mood(a) {
  if (a.sick) return 'sick';
  const h = happiness(a);
  if (h >= 70) return 'happy';
  if (h >= 45) return 'ok';
  return 'sad';
}

/**
 * Fait passer `hours` heures de jeu pour l'animal.
 * ctx : { sleeping, moving, ridden, weather, rng }
 * Renvoie la liste des événements : 'sick', 'died'.
 */
export function tickAnimal(a, hours, ctx = {}) {
  const events = [];
  if (hours <= 0) return events;
  const rng = ctx.rng ?? Math.random;
  const sp = SPECIES[a.species];
  const pers = PERSONALITY_DECAY[a.personality] ?? {};
  const weather = WEATHER_DECAY[ctx.weather] ?? {};
  const stage = lifeStage(a);

  for (const n of NEEDS) {
    let rate = BASE_DECAY[n] * (sp.decay[n] ?? 1) * (pers[n] ?? 1) * (weather[n] ?? 1);
    if (stage === 'baby' && (n === 'hunger' || n === 'affection')) rate *= 1.3;
    if (stage === 'senior' && n === 'energy') rate *= 1.2;
    // Un animal de troupeau seul s'ennuie (cheval, mouton, chèvre, vache).
    if (n === 'affection' && ctx.alone) rate *= 1.6;
    // Des crottins tout autour : on se salit plus vite.
    if (n === 'hygiene' && ctx.dirt) rate *= 1 + Math.min(2, ctx.dirt * 0.25);
    a.needs[n] = clamp(a.needs[n] - rate * hours);
  }
  if (ctx.companions > 0) a.needs.affection = clamp(a.needs.affection + Math.min(2, ctx.companions) * 0.8 * hours);
  // Poids : il baisse avec l'exercice, il monte quand on mange trop sans bouger.
  a.weight = a.weight ?? 50;
  if (ctx.ridden || ctx.moving) a.weight = Math.max(0, a.weight - 0.6 * hours);
  if (a.needs.hunger < 15) a.weight = Math.max(0, a.weight - 0.4 * hours);
  else if (a.weight > 50 && a.needs.exercise > 60) a.weight -= 0.1 * hours;
  if (ctx.sleeping) a.needs.energy = clamp(a.needs.energy + 9 * hours);
  if (ctx.ridden) {
    a.needs.exercise = clamp(a.needs.exercise + 14 * hours);
    a.needs.energy = clamp(a.needs.energy - 3 * hours);
    a.skills.endurance = Math.min(100, a.skills.endurance + 0.6 * hours);
    a.skills.speed = Math.min(100, a.skills.speed + 0.4 * hours);
  } else if (ctx.moving) {
    a.needs.exercise = clamp(a.needs.exercise + 8 * hours);
  }

  const h = happiness(a);
  if (h < SAD_THRESHOLD) a.neglect += hours;
  else a.neglect = Math.max(0, a.neglect - 2 * hours);

  if (!a.sick) {
    const neglected = a.neglect >= NEGLECT_LIMIT;
    // Un animal trop gros tombe plus souvent malade (mal de ventre).
    const overweight = a.weight > 80 && rng() < 0.01 * hours;
    if (overweight) {
      a.sick = 'belly';
      events.push('sick');
    }
    const unlucky = !a.sick && h < 50 && rng() < 0.002 * hours;
    if (!a.sick && (neglected || unlucky)) {
      a.sick = pick(Object.keys(ILLNESSES), rng);
      a.neglect = 0;
      events.push('sick');
    }
  }

  if ((a.weight ?? 50) > 80 || (a.weight ?? 50) < 20) a.health = clamp(a.health - 0.3 * hours, 40);
  if (a.sick) a.health = clamp(a.health - 2 * hours, 15);
  else if (h > 50) a.health = clamp(a.health + 1.5 * hours);
  else if (h < 25) a.health = clamp(a.health - 0.5 * hours, 30);

  a.ageDays += hours / 24;
  if (ageYears(a) >= a.lifespanYears) events.push('died');
  return events;
}

export function availableActions(a) {
  return SPECIES[a.species].actions;
}

/**
 * Applique un soin. quality (0 à 1) vient du mini-jeu : un soin bien fait remplit plus.
 * Renvoie { ok, reason }.
 */
export function applyCare(a, actionId, quality = 1) {
  const care = CARE[actionId];
  if (!care) return { ok: false, reason: 'unknown' };
  if (care.full && a.needs[care.full] >= 96) return { ok: false, reason: 'full' };
  if (care.tiring && a.needs.energy < 15) return { ok: false, reason: 'tired' };
  if (care.tiring && a.sick) return { ok: false, reason: 'sick' };
  const bonus = actionId === 'pet' && a.personality === 'cuddly' ? 1.5 : 1;
  for (const [n, v] of Object.entries(care.needs)) {
    a.needs[n] = clamp(a.needs[n] + v * (v > 0 ? bonus * (0.4 + 0.6 * quality) : 1));
  }
  for (const [s, v] of Object.entries(care.skills ?? {})) {
    a.skills[s] = Math.min(100, a.skills[s] + v);
  }
  // Les friandises et la nourriture en trop font grossir ; l'exercice fait maigrir.
  a.weight = a.weight ?? 50;
  if (actionId === 'treat') a.weight = Math.min(100, a.weight + 5);
  if (actionId === 'feed' && a.needs.hunger > 90) a.weight = Math.min(100, a.weight + 2);
  if (care.tiring) a.weight = Math.max(0, a.weight - 2);
  return { ok: true };
}

function successChance(a) {
  let chance = 0.35 + a.skills.obedience / 220 + happiness(a) / 400;
  if (a.personality === 'stubborn') chance -= 0.15;
  if (a.personality === 'playful' || a.personality === 'curious') chance += 0.05;
  if (lifeStage(a) === 'baby') chance -= 0.1;
  return Math.max(0.15, Math.min(0.95, chance));
}

/** Apprendre un tour. Renvoie { ok, reason, success, learned, progress }. */
export function trainTrick(a, trickId, rng = Math.random) {
  if (!SPECIES[a.species].tricks.includes(trickId)) return { ok: false, reason: 'unknown' };
  if (a.sick) return { ok: false, reason: 'sick' };
  if (a.needs.energy < 15) return { ok: false, reason: 'tired' };
  const current = a.tricks[trickId] ?? 0;
  if (current >= 100) return { ok: false, reason: 'known' };
  a.needs.energy = clamp(a.needs.energy - 8);
  a.needs.exercise = clamp(a.needs.exercise + 8);
  const success = rng() < successChance(a);
  if (success) {
    a.tricks[trickId] = Math.min(100, current + 25 + Math.round(rng() * 10));
    a.skills.obedience = Math.min(100, a.skills.obedience + 2);
    a.needs.affection = clamp(a.needs.affection + 5);
  }
  return { ok: true, success, learned: success && a.tricks[trickId] >= 100, progress: a.tricks[trickId] ?? 0 };
}

/** Séance d'entraînement (saut, vitesse…). Renvoie { ok, reason, gain }. */
export function trainSkill(a, trainingId, rng = Math.random) {
  const tr = TRAINING[trainingId];
  if (!tr || !SPECIES[a.species].training.includes(trainingId)) return { ok: false, reason: 'unknown' };
  if (a.sick) return { ok: false, reason: 'sick' };
  if (a.needs.energy < 20) return { ok: false, reason: 'tired' };
  if (lifeStage(a) === 'baby') return { ok: false, reason: 'baby' };
  for (const [n, v] of Object.entries(tr.needs)) a.needs[n] = clamp(a.needs[n] + v);
  const gain = Math.round((2 + rng() * 3) * successChance(a) * 2);
  a.skills[tr.skill] = Math.min(100, a.skills[tr.skill] + gain);
  return { ok: true, gain, skill: tr.skill };
}

export function canRide(a) {
  const sp = SPECIES[a.species];
  if (!sp.rideable) return { ok: false, reason: 'notRideable' };
  if (ageYears(a) < sp.rideYears) return { ok: false, reason: 'tooYoung' };
  if (a.sick) return { ok: false, reason: 'sick' };
  if (a.pregnant) return { ok: false, reason: 'pregnant' };
  if (a.needs.energy < 10) return { ok: false, reason: 'tired' };
  return { ok: true };
}

/** Le vétérinaire a soigné l'animal. */
export function cure(a, day) {
  if (day !== undefined) a.lastVet = day;
  a.sick = null;
  a.neglect = 0;
  a.health = clamp(a.health + 40);
  a.needs.affection = clamp(a.needs.affection + 10);
}

export function checkup(a, day) {
  if (day !== undefined) a.lastVet = day;
  a.health = clamp(a.health + 10);
}

const BREED_COOLDOWN_DAYS = 6;

// Durée de la gestation en jours de jeu (raccourcie mais dans le bon ordre de grandeur).
export const GESTATION_DAYS = { horse: 6, cow: 5, sheep: 3, goat: 3, dog: 2, cat: 2, rabbit: 1 };
export const BREED_LEVEL = 4;
const VET_RECENT_DAYS = 5;

/**
 * Conditions pour avoir des bébés, sous forme de liste à cocher.
 * ctx : { day, level }. Chaque ligne : { id, ok, who? } (who = nom de l'animal concerné).
 */
export function breedingChecklist(a, b, ctx) {
  const list = [];
  const both = (id, test) => {
    for (const x of [a, b]) list.push({ id, ok: test(x), who: x.name, g: x.sex });
  };
  list.push({ id: 'pair', ok: a.species === b.species && a.sex !== b.sex });
  list.push({ id: 'level', ok: (ctx.level ?? 1) >= BREED_LEVEL, n: BREED_LEVEL });
  both('adult', (x) => lifeStage(x) === 'adult');
  both('healthy', (x) => !x.sick && x.health >= 70);
  both('happy', (x) => happiness(x) >= 70);
  both('weight', (x) => (x.weight ?? 50) >= 25 && (x.weight ?? 50) <= 65);
  both('bond', (x) => x.needs.affection >= 70);
  both('vet', (x) => x.lastVet !== undefined && ctx.day - x.lastVet <= VET_RECENT_DAYS);
  both('rest', (x) => ctx.day - x.lastBirthDay >= BREED_COOLDOWN_DAYS && !x.pregnant);
  return list;
}

export function canBreed(a, b, day, level = BREED_LEVEL) {
  if (a.species !== b.species) return { ok: false, reason: 'species' };
  if (a.sex === b.sex) return { ok: false, reason: 'sex' };
  const missing = breedingChecklist(a, b, { day, level }).find((c) => !c.ok);
  if (missing) return { ok: false, reason: missing.id === 'rest' ? 'cooldown' : missing.id };
  return { ok: true };
}

/** Les deux animaux se rencontrent : la femelle attend des petits. */
export function mate(a, b, day) {
  const mother = a.sex === 'f' ? a : b;
  const father = mother === a ? b : a;
  mother.pregnant = { due: day + GESTATION_DAYS[mother.species], father: father.id };
  a.lastBirthDay = day;
  b.lastBirthDay = day;
  return mother;
}

const mixColor = (c1, c2, t) => {
  const r = Math.round(((c1 >> 16) & 255) * (1 - t) + ((c2 >> 16) & 255) * t);
  const g = Math.round(((c1 >> 8) & 255) * (1 - t) + ((c2 >> 8) & 255) * t);
  const b = Math.round((c1 & 255) * (1 - t) + (c2 & 255) * t);
  return (r << 16) | (g << 8) | b;
};

/** Fait naître une portée. Renvoie les bébés (il faut les ajouter au profil). */
export function breed(a, b, day, rng = Math.random) {
  const sp = SPECIES[a.species];
  const [min, max] = sp.litter;
  const count = min + Math.floor(rng() * (max - min + 1));
  const mother = a.sex === 'f' ? a : b;
  const babies = [];
  for (let i = 0; i < count; i++) {
    const main = rng() < 0.5 ? a : b;
    const other = main === a ? b : a;
    const t = rng() * 0.35;
    const look = {
      ...main.look,
      scale: (a.look.scale + b.look.scale) / 2,
      fluff: (a.look.fluff + b.look.fluff) / 2,
      legs: (a.look.legs + b.look.legs) / 2,
      snout: (a.look.snout + b.look.snout) / 2,
      coat: mixColor(main.look.coat, other.look.coat, t),
      secondary: mixColor(main.look.secondary, other.look.secondary, t),
      seed: Math.floor(rng() * 1e6),
    };
    babies.push({
      ...createAnimal({ species: a.species, breed: main.breed, ageDays: 0, location: mother.location, rng, day }),
      breed: a.breed === b.breed ? a.breed : 'mix',
      look,
      parents: [a.id, b.id],
      needs: Object.fromEntries(NEEDS.map((n) => [n, 85])),
    });
  }
  a.lastBirthDay = day;
  b.lastBirthDay = day;
  delete mother.pregnant;
  return babies;
}
