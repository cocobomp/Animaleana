// Concours à l'extérieur : calendrier des concours dans plusieurs lieux, inscriptions, forme des animaux,
// parcours de saut plus grands (combinaisons, rivière, mur), barrage en cas d'égalité, prix, titres.
// Logique pure, sans 3D : testée dans tests/competitions.test.js.
// Le déroulement sur place (voyage, site du concours, podium) est dans src/game/CompetitionVenue.js.

import { PLACES } from './places.js';
import {
  JUMP_COURSE, courseLength, jumpingResult, agilityResult, agilityPar, eligibility, compareResults, knownTricks,
} from './activities.js';
import { lifeStage } from './animal.js';
import { SPECIES, offeredOr } from './species.js';
import { seeded, pick, hashString } from './rng.js';
import { GEAR, wears, sizeFor, stockKey } from './gear.js'; // selle et filet à la taille du cheval
import { pack, unpack, inCargo, available, cargoItem } from './cargo.js'; // coffre de transport du voyage
import {
  CAREERS, isStarted, perksOf, noteAction, addCareerXp, changeReputation, addEarnings,
} from './careers.js'; // métier de cavalière / cavalier de concours (rider)

const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));

// ---------------------------------------------------------------- disciplines, lieux, niveaux

/**
 * Les disciplines des concours. horse : réservée aux chevaux.
 * 'beauty' (concours de beauté) est prévue dans le type du calendrier : elle est ajoutée par un autre module,
 * qui n'a qu'à la glisser dans CALENDAR_DISCIPLINES.
 */
export const DISCIPLINES = {
  jumping: { icon: '🏇', horse: true },
  dressage: { icon: '🎠', horse: true },
  agility: { icon: '🐕', horse: false },
  show: { icon: '🎪', horse: false },
  beauty: { icon: '🎀', horse: false },
};

/** Rotation des disciplines dans le calendrier (l'accent est mis sur les chevaux). */
export const CALENDAR_DISCIPLINES = ['jumping', 'dressage', 'jumping', 'agility', 'dressage', 'show'];

/** Les lieux qui organisent des concours : tous les `every` jours (décalés), bias : concours plus relevés. */
export const CIRCUIT = [
  { place: 'maison', name: { fr: 'Concours de Normandie', en: 'Normandy Show' }, every: 3, offset: 1, bias: 0 },
  { place: 'angleterre', name: { fr: 'Horse Show des Cotswolds', en: 'Cotswolds Horse Show' }, every: 4, offset: 2, bias: 0 },
  { place: 'kentucky', name: { fr: 'Kentucky Classic', en: 'Kentucky Classic' }, every: 5, offset: 3, bias: 1 },
  { place: 'andalousie', name: { fr: 'Feria d\'Andalousie', en: 'Andalusian Feria' }, every: 4, offset: 0, bias: 0 },
  { place: 'alpes', name: { fr: 'Trophée des Alpes', en: 'Alps Trophy' }, every: 5, offset: 1, bias: 1 },
  { place: 'bretagne', name: { fr: 'Concours de la plage', en: 'Beach Horse Show' }, every: 6, offset: 4, bias: 0 },
];

export const LEVELS = ['club', 'regional', 'grand'];
export const FEES = [20, 40, 70];
export const PRIZES = [[120, 70, 40], [260, 150, 90], [500, 300, 180]];
export const OPEN = 10;
export const CLOSE = 18;

export function makeEvent(venue, day, discipline, level) {
  return {
    id: `comp-${venue.place}-${day}-${discipline}`,
    place: venue.place,
    name: venue.name,
    day,
    discipline,
    level,
    levelId: LEVELS[level - 1],
    fee: FEES[level - 1],
    prizes: PRIZES[level - 1],
    open: OPEN,
    close: CLOSE,
  };
}

/**
 * Le calendrier des concours entre fromDay et fromDay + days − 1, dans tous les lieux du circuit,
 * trié par jour. Toujours le même pour une partie (déterministe).
 */
export function calendar(fromDay, days = 21) {
  const out = [];
  for (const v of CIRCUIT) {
    if (!PLACES[v.place]) continue;
    const h = hashString(v.place);
    for (let day = Math.max(1, fromDay); day < fromDay + days; day++) {
      if ((day + v.offset) % v.every !== 0) continue;
      const k = Math.floor((day + v.offset) / v.every);
      const discipline = CALENDAR_DISCIPLINES[(k + h) % CALENDAR_DISCIPLINES.length];
      const level = Math.min(3, 1 + v.bias + Math.floor(day / 12) + (k % 3 === 0 ? 1 : 0));
      out.push(makeEvent(v, day, discipline, level));
    }
  }
  return out.sort((a, b) => a.day - b.day || a.place.localeCompare(b.place));
}

// ---------------------------------------------------------------- profil : inscriptions et résultats

/** Données des concours dans le profil (créées au besoin). */
export function competitionData(p) {
  p.competitions = p.competitions ?? {};
  const d = p.competitions;
  d.entries = d.entries ?? []; // inscriptions { id, comp, animalIds, done, missed }
  d.results = d.results ?? []; // résultats { id, place, day, discipline, level, animalId, animalName, rank, score }
  return d;
}

/**
 * L'animal est-il en forme pour concourir ? (raison si non)
 * Il faut des besoins ≥ 50 (faim, soif, énergie), pas malade, pas enceinte, et savoir faire la discipline.
 */
export function eligibleForCompetition(a, discipline) {
  if (a.sick) return 'sick';
  if (a.pregnant) return 'pregnant';
  if (lifeStage(a) === 'baby') return 'baby';
  if (a.lame) return 'lame'; // (il boite : un caillou, un fer perdu)
  if (DISCIPLINES[discipline]?.horse && a.species !== 'horse') return 'notHorse';
  const low = ['hunger', 'thirst', 'energy'].find((n) => (a.needs?.[n] ?? 100) < 50);
  if (low) return `low_${low}`;
  if (discipline === 'dressage' || discipline === 'jumping') return eligibility(a, 'jumping');
  if (discipline === 'agility') return eligibility(a, 'agility');
  if (discipline === 'show') return knownTricks(a).length ? null : 'noTricks';
  return null;
}

/** Peut-on s'inscrire ? Renvoie null si oui, sinon la raison. */
export function canRegister(p, comp, animalIds, { day, hour }) {
  const d = competitionData(p);
  if (d.entries.some((e) => e.id === comp.id)) return 'already';
  if (day > comp.day || (day === comp.day && hour >= comp.close)) return 'past';
  if (!animalIds.length) return 'noAnimal';
  if (d.entries.some((e) => !e.done && !e.missed && e.comp.day === comp.day)) return 'sameDay';
  return null;
}

/** Inscrit les animaux (les frais sont réglés par l'appelant). Renvoie l'inscription. */
export function register(p, comp, animalIds) {
  const d = competitionData(p);
  const entry = { id: comp.id, comp: { ...comp }, animalIds: [...animalIds], done: false, missed: false };
  d.entries.push(entry);
  if (d.entries.length > 30) d.entries.splice(0, d.entries.length - 30);
  return entry;
}

/**
 * État d'une inscription pour le joueur :
 * 'done', 'missed', 'today' (sur place, c'est ouvert), 'tooEarly' (sur place, pas encore ouvert),
 * 'wait' (sur place, pas encore le jour), 'travel' (il faut y aller).
 */
export function entryState(entry, { day, hour, place }) {
  const c = entry.comp;
  if (entry.done) return 'done';
  if (entry.missed || day > c.day || (day === c.day && hour >= c.close)) return 'missed';
  if (place !== c.place) return 'travel';
  if (day < c.day) return 'wait';
  return hour < c.open ? 'tooEarly' : 'today';
}

/** Marque les inscriptions ratées (le jour est passé sans concourir). Renvoie celles qui viennent de l'être. */
export function markMissed(p, now) {
  const out = [];
  for (const e of competitionData(p).entries) {
    if (e.done || e.missed) continue;
    if (entryState(e, now) === 'missed') {
      e.missed = true;
      out.push(e);
    }
  }
  return out;
}

/** L'inscription à jouer ici aujourd'hui (le site du concours est installé), ou null. */
export function activeEntry(p, { day, place }) {
  return competitionData(p).entries.find((e) => !e.done && !e.missed && e.comp.place === place && e.comp.day === day) ?? null;
}

/** Les inscriptions à venir (pas faites, pas ratées), la plus proche d'abord. */
export const upcomingEntries = (p) => competitionData(p).entries.filter((e) => !e.done && !e.missed).sort((a, b) => a.comp.day - b.comp.day);

// ---------------------------------------------------------------- parcours de saut de concours

const W = -Math.PI / 2;
const E = Math.PI / 2;
const N = 0;
const S = Math.PI;
const o = (n, type, x, z, heading, height, colors, combo = null) => ({ n, type, x, z, heading, height, width: 3.6, colors, combo });
const RED = [0xd8402f, 0xffffff];
const BLUE = [0x2f6fd8, 0xffffff];
const GREEN = [0x2a9a4a, 0xffffff];
const PURPLE = [0x9a45d8, 0xffffff];
const ORANGE = [0xff8a1f, 0xffffff];
const TEAL = [0x2fb8b0, 0xffffff];
const BRICK = [0xb5523a, 0xf2e6c8];
const WATER = [0x2f8fd8, 0xf2f2f2];

/**
 * Les parcours de concours par niveau (coordonnées locales de la carrière).
 * combo : 'a' / 'b' / 'c' = éléments d'une combinaison (double, triple), rapprochés de 7,5 m.
 */
export const COMP_COURSES = {
  1: { ...JUMP_COURSE, speed: 4.5 },
  2: {
    speed: 5,
    start: { x: 18.5, z: -9, heading: W },
    obstacles: [
      o(1, 'vertical', 8, -9, W, 0.85, RED),
      o(2, 'oxer', -4, -9, W, 0.9, BLUE),
      o(3, 'wall', -17, -1, N, 0.9, BRICK),
      o(4, 'water', -10, 9, E, 0.2, WATER),
      o('5a', 'vertical', 0, 9, E, 0.9, GREEN, 'a'),
      o('5b', 'vertical', 7.5, 9, E, 0.95, GREEN, 'b'),
      o(6, 'oxer', 17, 2, S, 1.0, ORANGE),
      o(7, 'triple', 6, 0, W, 1.0, TEAL),
    ],
    finish: { x: -6, z: 0, heading: W, width: 6 },
  },
  3: {
    speed: 5.5,
    start: { x: 18.5, z: -9, heading: W },
    obstacles: [
      o(1, 'vertical', 9, -9, W, 1.0, RED),
      o(2, 'oxer', -2, -9, W, 1.05, BLUE),
      o(3, 'wall', -13, -9, W, 1.05, BRICK),
      o(4, 'oxer', -17, 2, N, 1.1, PURPLE),
      o(5, 'water', -9, 10, E, 0.25, WATER),
      o('6a', 'vertical', 0, 10, E, 1.1, GREEN, 'a'),
      o('6b', 'oxer', 7.5, 10, E, 1.15, GREEN, 'b'),
      o('6c', 'vertical', 15, 10, E, 1.1, GREEN, 'c'),
      o(7, 'vertical', 17, 0, S, 1.15, ORANGE),
      o(8, 'oxer', 10, -3, W, 1.2, TEAL),
    ],
    finish: { x: 2, z: -3, heading: W, width: 6 },
  },
};

/** Temps accordé (s) d'un parcours à une vitesse donnée. */
export const timeAllowed = (course, speed = course.speed ?? 4.5) => Math.ceil(courseLength(course) / speed / 5) * 5 + 5;

/** Le parcours d'un concours (copie, avec son temps accordé). */
export function competitionCourse(level = 1) {
  const base = COMP_COURSES[Math.min(3, Math.max(1, level))];
  const course = { ...base, obstacles: base.obstacles.map((x) => ({ ...x })), level };
  course.par = timeAllowed(course);
  return course;
}

/** Le barrage : 5 obstacles du parcours, 10 cm plus haut, contre la montre. */
export function jumpOffCourse(course) {
  const keep = course.obstacles.length >= 8 ? [0, 1, 3, 6, 7] : [0, 1, 4, 5, 6];
  const obstacles = keep.filter((i) => course.obstacles[i]).map((i) => ({ ...course.obstacles[i], height: Math.round((course.obstacles[i].height + 0.1) * 100) / 100, combo: null }));
  obstacles.forEach((x, i) => { x.n = i + 1; });
  const jo = { ...course, obstacles, jumpOff: true, speed: (course.speed ?? 4.5) + 0.5 };
  jo.par = timeAllowed(jo);
  return jo;
}

// ---------------------------------------------------------------- concurrents, classement, barrage

const RIVAL_NAMES = ['Léa', 'Hugo', 'Emma', 'Lucas', 'Chloé', 'Nathan', 'Inès', 'Jules', 'Manon', 'Louis', 'Zoé', 'Adam',
  'Camille', 'Sacha', 'Lina', 'Tom', 'Alice', 'Noah', 'Rose', 'Gabriel', 'Mia', 'Eliott', 'Jade', 'Rafael'];
const HORSE_NAMES = ['Tornado', 'Caramel', 'Étoile', 'Jolly', 'Pompon', 'Flocon', 'Cannelle', 'Vénus', 'Opale', 'Rubis', 'Nuage', 'Tempête'];
const PET_NAMES = ['Biscuit', 'Rex', 'Luna', 'Pixel', 'Noisette', 'Filou', 'Pirate', 'Choupette', 'Oscar', 'Plume'];

/**
 * Les concurrents d'un concours (toujours les mêmes). Saut : pénalités + temps sur le parcours donné ;
 * dressage : pourcentage ; agility : pénalités + temps ; spectacle : points.
 */
export function competitionRivals(comp, course = null, count = 6) {
  const rng = seeded(comp.id);
  const names = [...RIVAL_NAMES];
  const out = [];
  const par = comp.discipline === 'jumping' ? (course?.par ?? timeAllowed(JUMP_COURSE)) : comp.discipline === 'agility' ? agilityPar() : 0;
  for (let i = 0; i < count; i++) {
    const name = names.splice(Math.floor(rng() * names.length), 1)[0];
    const horse = DISCIPLINES[comp.discipline]?.horse;
    const r = { name, animal: pick(horse ? HORSE_NAMES : PET_NAMES, rng), species: horse ? 'horse' : offeredOr(pick(['dog', 'dog', 'cat', 'rabbit'], rng)) }; // (espèce proposée, même hasard)
    // Les concurrents sont meilleurs dans les concours relevés.
    const skill = clamp(0.3 + comp.level * 0.16 + (rng() - 0.5) * 0.4);
    if (comp.discipline === 'jumping') {
      const rails = rng() < skill ? 0 : rng() < 0.6 ? 1 : 2;
      const refusals = rng() < 0.1 * (1 - skill) ? 1 : 0;
      const time = par * (1.0 - skill * 0.25 + rng() * 0.22);
      Object.assign(r, jumpingResult({ rails, refusals, time, par }));
    } else if (comp.discipline === 'dressage') {
      r.points = Math.round((52 + skill * 28 + rng() * 8) * 10) / 10;
    } else if (comp.discipline === 'agility') {
      const faults = rng() < skill ? 0 : rng() < 0.6 ? 1 : 2;
      const time = par * (1.05 - skill * 0.3 + rng() * 0.25);
      Object.assign(r, agilityResult({ faults, time, par }));
    } else {
      r.points = Math.round(14 + skill * 34 + rng() * 6);
    }
    out.push(r);
  }
  return out;
}

/** Au saut, un concours se juge d'abord aux pénalités : les concurrents à égalité avec le joueur pour la 1ʳᵉ place. */
export function tiedLeaders(playerResult, rivalList) {
  const best = Math.min(playerResult.total, ...rivalList.map((r) => r.total));
  if (playerResult.total !== best) return [];
  return rivalList.filter((r) => r.total === best);
}

/** Les résultats de barrage des concurrents à égalité (toujours les mêmes). */
export function jumpOffRivals(tied, par, seed = 'jo') {
  const rng = seeded(`${seed}-barrage`);
  return tied.map((r) => {
    const rails = rng() < 0.55 ? 0 : 1;
    const time = par * (0.85 + rng() * 0.3);
    return { ...r, jo: jumpingResult({ rails, time, par }) };
  });
}

/**
 * Classement final d'un concours. playerResult : résultat du joueur (total/time ou points) ;
 * jumpOff : { player, rivals } quand il y a eu un barrage (les ex æquo sont départagés dessus).
 * Renvoie { table, rank }.
 */
export function finalRanking(comp, playerResult, rivalList, jumpOff = null) {
  const me = { ...playerResult, you: true };
  const type = comp.discipline === 'jumping' || comp.discipline === 'agility' ? comp.discipline : 'points';
  const cmp = compareResults(type);
  let table;
  if (jumpOff) {
    const byName = new Map(jumpOff.rivals.map((r) => [r.name, r.jo]));
    const tied = rivalList.filter((r) => byName.has(r.name)).map((r) => ({ ...r, jo: byName.get(r.name) }));
    me.jo = jumpOff.player;
    const joCmp = (a, b) => a.jo.total - b.jo.total || a.jo.time - b.jo.time;
    const leaders = [...tied, me].sort(joCmp);
    const others = rivalList.filter((r) => !byName.has(r.name)).sort(cmp);
    table = [...leaders, ...others];
  } else {
    table = [...rivalList, me].sort(type === 'points' ? (a, b) => b.points - a.points : cmp);
  }
  table.forEach((r, i) => { r.rank = i + 1; });
  return { table, rank: me.rank };
}

// ---------------------------------------------------------------- prix, résultats, titres

/** Récompense selon la place : coupe et argent pour le podium, flot ensuite. */
export function prizeFor(comp, rank) {
  if (rank <= 3) return { kind: 'trophy', tier: ['gold', 'silver', 'bronze'][rank - 1], money: comp.prizes[rank - 1], xp: rank === 1 ? 'win' : 'podium' };
  return { kind: 'ribbon', tier: rank === 4 ? 'green' : rank === 5 ? 'white' : 'pink', money: 0, xp: 'competition' };
}

/** Enregistre le résultat d'un concours et clôt l'inscription. */
export function recordResult(p, entry, { rank, animal, score }) {
  const d = competitionData(p);
  entry.done = true;
  const r = {
    id: entry.id, place: entry.comp.place, day: entry.comp.day, discipline: entry.comp.discipline, level: entry.comp.level,
    animalId: animal.id, animalName: animal.name, rank, score,
  };
  d.results.push(r);
  if (d.results.length > 80) d.results.shift();
  return r;
}

/** Les meilleurs résultats d'un animal, par discipline : { jumping: { rank, level, place, day }, … }. */
export function bestResults(p, animalId) {
  const out = {};
  for (const r of competitionData(p).results) {
    if (r.animalId !== animalId) continue;
    const old = out[r.discipline];
    if (!old || r.rank < old.rank || (r.rank === old.rank && r.level > old.level)) out[r.discipline] = r;
  }
  return out;
}

/**
 * Le titre d'un animal d'après ses victoires : 'champion_grand' (gagné un Grand Prix), 'champion_regional',
 * 'champion_club', 'promising' (3 podiums sans victoire) ou null.
 */
export function titleFor(p, animalId) {
  const mine = competitionData(p).results.filter((r) => r.animalId === animalId);
  const wins = (level) => mine.filter((r) => r.rank === 1 && r.level >= level).length;
  if (wins(3)) return 'champion_grand';
  if (wins(2)) return 'champion_regional';
  if (wins(1)) return 'champion_club';
  if (mine.filter((r) => r.rank <= 3).length >= 3) return 'promising';
  return null;
}

/** Nombre d'animaux inscriptibles d'une liste, pour une discipline. */
export const eligibleCount = (animals, discipline) => animals.filter((a) => !eligibleForCompetition(a, discipline)).length;

/** Espèces concernées par une discipline (pour la liste d'inscription). */
export function fitsDiscipline(a, discipline) {
  if (DISCIPLINES[discipline]?.horse) return a.species === 'horse';
  if (discipline === 'agility') return SPECIES[a.species].training.includes('agility');
  return true;
}

// ---------------------------------------------------------------- tenue du cheval au concours

/**
 * Au concours de saut ou de dressage, le cheval doit être sellé et bridé (pas à cru).
 * Renvoie null si c'est bon, sinon 'needBridle' ou 'needSaddle'. (Pour s'inscrire, ce n'est pas demandé.)
 */
export function tackReady(a, discipline) {
  if (!DISCIPLINES[discipline]?.horse || a.species !== 'horse') return null;
  if (!wears(a, 'bridle')) return 'needBridle';
  if (!wears(a, 'saddle')) return 'needSaddle';
  return null;
}

/**
 * Le matériel à emporter pour un cheval inscrit, à sa taille (clés de la sellerie : 'saddle@pony'…) :
 * d'abord la selle et le filet de la discipline si on les a (selle de dressage, filet olive…), sinon
 * les modèles de base. Seulement ce que le cheval ne porte pas déjà (ce qu'il porte voyage avec lui).
 * owned(key) : combien on en a (pour choisir le modèle). Renvoie [{ slot, keys: [clé préférée, …] }].
 */
export function competitionTack(a, discipline, owned = () => 0) {
  if (a.species !== 'horse') return [];
  const out = [];
  for (const type of ['saddle', 'bridle']) {
    if (wears(a, type)) continue;
    const variants = Object.keys(GEAR).filter((id) => GEAR[id].type === type && !GEAR[id].minObedience
      && (!GEAR[id].sizes || GEAR[id].sizes.includes(sizeFor(id, a))));
    const keys = variants.map((id) => stockKey(id, sizeFor(id, a)));
    // La discipline du concours d'abord, puis le modèle de base, puis les autres (ceux qu'on a).
    const rank = (k) => {
      const id = k.split('@')[0];
      if (GEAR[id].discipline === discipline) return 0;
      if (id === type) return 1;
      return 2;
    };
    keys.sort((x, y) => rank(x) - rank(y) || owned(y) - owned(x));
    out.push({ slot: type, keys });
  }
  return out;
}

/** Ce qu'on peut sortir du coffre pour faire de la place à une selle (le moins utile d'abord). */
const SPARE = ['ball', 'shampoo', 'lungeLine', 'nailClipper', 'pitchfork', 'treats', 'hoofKit', 'brush'];

/**
 * Prépare le coffre d'un voyage au concours : pour chaque cheval inscrit qui ne la porte pas, une selle
 * et un filet À SA TAILLE (la selle de dressage pour un concours de dressage, si on l'a). S'il n'y a plus
 * de place, on sort d'abord une balle, le shampoing… Renvoie les clés rangées.
 */
export function packCompetitionTack(p, cargo, horses, capacity, discipline) {
  const packed = [];
  for (const a of horses) {
    for (const { keys } of competitionTack(a, discipline, (k) => available(p, k))) {
      const there = keys.find((k) => inCargo(cargo, k) > 0 && cargoFitsHorse(k, a));
      if (there) {
        // Déjà une selle à sa taille dans le coffre (la selle mixte du dernier voyage…) : si on a celle de la
        // discipline (selle de dressage pour un concours de dressage), on l'échange contre elle.
        const best = keys[0];
        if (there !== best && GEAR[best.split('@')[0]].discipline === discipline && available(p, best) > inCargo(cargo, best)) {
          unpack(cargo, there);
          if (pack(p, cargo, best, capacity).ok) packed.push(best);
          else pack(p, cargo, there, capacity);
        }
        continue;
      }
      const want = keys.filter((k) => available(p, k) > inCargo(cargo, k));
      if (!want.length) continue; // on n'en a pas à sa taille (la sellerie en vend)
      let ok = pack(p, cargo, want[0], capacity).ok;
      for (const spare of SPARE) {
        if (ok) break;
        if (inCargo(cargo, spare) > 0) {
          unpack(cargo, spare);
          ok = pack(p, cargo, want[0], capacity).ok;
        }
      }
      if (ok) packed.push(want[0]);
    }
  }
  return packed;
}

/** Cette clé du coffre va-t-elle à ce cheval (type selle ou filet, à sa taille) ? */
function cargoFitsHorse(key, a) {
  const it = cargoItem(key);
  return !!it && it.kind === 'gear' && GEAR[it.gear].species.includes('horse') && (it.fit ?? null) === (sizeFor(it.gear, a) ?? null);
}

/**
 * Ce qui manque pour concourir, d'après le coffre : [{ a, slot: 'saddle' | 'bridle', size }] pour les
 * chevaux qui ne portent pas l'objet et n'en ont pas un à leur taille dans le coffre.
 */
export function missingCompetitionTack(cargo, horses, discipline) {
  const out = [];
  for (const a of horses) {
    if (a.species !== 'horse' || !DISCIPLINES[discipline]?.horse) continue;
    for (const { slot, keys } of competitionTack(a, discipline)) {
      if (!keys.some((k) => inCargo(cargo, k) > 0)) out.push({ a, slot, size: sizeFor(slot, a) });
    }
  }
  return out;
}

// ---------------------------------------------------------------- métier de cavalière / cavalier de concours

/** Les avantages du métier (rider) : frais d'inscription, primes, sponsor. Sans le métier : rien de spécial. */
export function riderPerks(p) {
  return isStarted(p, 'rider') ? perksOf(p, 'rider') : CAREERS.rider.perks[0];
}

/** Frais d'inscription (moins chers quand on est cavalier confirmé ou expert). */
export const entryFee = (p, comp) => Math.round((comp.fee * riderPerks(p).fee) / 5) * 5;

/** Prime pour une place (plus grosse avec le métier). */
export function prizeMoney(p, comp, rank) {
  const base = prizeFor(comp, rank).money;
  return base ? Math.round((base * riderPerks(p).prize) / 5) * 5 : 0;
}

/**
 * Une action du carnet du métier (rider) vient d'être faite : coche la première fois et donne de l'XP.
 * Renvoie { first, rankUp } ou null si le métier n'est pas commencé.
 */
export const noteRider = (p, action) => noteAction(p, 'rider', action);

/**
 * Après un concours à l'extérieur : expérience du métier, réputation, argent gagné, carnet.
 * Renvoie { xp, rep, notes: [{ action, first, rankUp }], rankUp } (rankUp : nouveau rang, ou null).
 */
export function riderAfterResult(p, comp, rank, money = 0) {
  if (!isStarted(p, 'rider')) return null;
  const notes = [];
  for (const action of rank <= 3 ? ['compete', 'podium'] : ['compete']) {
    const r = noteAction(p, 'rider', action);
    if (r) notes.push({ action, ...r });
  }
  const xp = 15 + comp.level * 10 + (rank === 1 ? 25 : rank <= 3 ? 12 : 0);
  const up = addCareerXp(p, 'rider', xp);
  const rep = changeReputation(p, 'rider', rank === 1 ? 8 : rank <= 3 ? 5 : rank <= 5 ? 1 : -1);
  if (money) addEarnings(p, 'rider', money);
  const rankUp = up?.rankUp ?? notes.map((n) => n.rankUp).find((x) => x !== null && x !== undefined) ?? null;
  return { xp, rep, notes, rankUp };
}

/** Une inscription ratée : les organisateurs n'aiment pas les places vides. */
export function riderMissed(p) {
  if (!isStarted(p, 'rider')) return null;
  return changeReputation(p, 'rider', -4);
}
