// Où se passe le soin en 3D : le VRAI endroit où se trouve l'animal dans le jeu (son box, le pré, l'étable, la
// maison, le jardin, le clapier, son enclos…), la lumière de l'heure du jeu, la météo du jeu, la saison, et les petits
// objets autour qui changent un peu chaque jour. Un petit module sans 3D (tests/decors-*.test.js) : la scène
// (src/ui/minigames/care3d.js) choisit son décor d'après careSetting, et l'habille d'après careAmbience et pickExtras
// (src/game/care/ambience.js, src/game/care/extras.js).

import { enclosure, inside } from '../nav.js';
import { STRUCTURES, footprintOf } from '../../sim/construction.js';

/** Les lieux possibles d'un soin. */
export const SETTINGS = ['box', 'pre', 'etable', 'maison', 'jardin', 'clapier', 'enclos', 'ailleurs'];

const LIVESTOCK = ['sheep', 'goat', 'cow'];

/** Le lieu « à l'abri » de chaque espèce (c'est aussi celui qu'on prend quand on ne sait pas où il est). */
export const INDOOR_OF = { horse: 'box', sheep: 'etable', goat: 'etable', cow: 'etable', dog: 'maison', cat: 'maison', rabbit: 'clapier' };
/** Le lieu dehors de chaque espèce. */
export const OUTDOOR_OF = { horse: 'pre', sheep: 'pre', goat: 'pre', cow: 'pre', dog: 'jardin', cat: 'jardin', rabbit: 'enclos' };

/** Les lieux qui sont dehors (ciel, pluie, neige, herbe). */
export const OUTDOORS = new Set(['pre', 'jardin', 'enclos', 'ailleurs']);

/**
 * Les soins qu'on fait là où est l'animal, dedans comme dehors. Les autres ont besoin de leur lieu (curer le box ou
 * l'étable, la longe au rond de longe, la balle de la chèvre au pré, le salon de toilettage, seller au box…) : ils
 * gardent leur décor habituel, avec la lumière de l'heure, la météo et les objets du jour.
 */
export const CARE_ANYWHERE = {
  horse: ['feed', 'water', 'treat', 'pet', 'brush'],
  sheep: ['feed', 'water', 'treat', 'pet', 'brush'],
  goat: ['feed', 'water', 'treat', 'pet', 'brush'],
  cow: ['feed', 'water', 'treat', 'pet', 'brush'],
  dog: ['feed', 'water', 'treat', 'pet', 'brush', 'play'],
  cat: ['feed', 'water', 'treat', 'pet', 'brush', 'play'],
  rabbit: ['feed', 'water', 'treat', 'pet', 'brush', 'nails', 'play'],
};

/**
 * Ce que le jeu sait de l'endroit où est l'animal (sans 3D). game : le jeu (profile, entities, interiors, structures,
 * events) ; a : l'animal. Renvoie { known, here, away, stalled, housed, pos, inStable, inHouse, inFold, inPen,
 * inPaddock, inRun, building, nearHouse }.
 */
export function whereFacts(game, a) {
  const p = game?.profile;
  if (!p || !a) return { known: false };
  const f = { known: true };
  // (en voyage, en sortie : le jeu est dans un autre lieu que la ferme ; l'animal qui n'est pas là ne se soigne pas)
  f.here = !a.location || !p.place || a.location === p.place;
  f.away = !!p.home && !!p.place && p.place !== p.home;
  f.stalled = !!a.stalled;
  const e = game.entities?.get?.(a.id) ?? null;
  f.housed = !!a.housed && (e ? !!e.inside : true);
  f.ridden = !!e?.ridden;
  if (!e?.position) return f;
  const { x, z } = e.position;
  f.pos = { x, z };
  const room = (id) => {
    try {
      return game.interiors?.roomAt?.(id, x, z) ?? null;
    } catch {
      return null;
    }
  };
  f.inStable = !!room('stable');
  f.inHouse = !!room('house') || !!room('lodge');
  // Bergerie : l'enclos, et l'abri au fond (8 × 4 m, à 2,6 m du fond : src/game/farmLayout.js)
  const pe = enclosure('pen');
  if (pe) {
    f.inPen = inside(pe, x, z);
    const fz = pe.z - pe.hd + 2.6;
    f.inFold = f.inPen && Math.abs(x - pe.x) < 4.3 && Math.abs(z - fz) < 2.3;
  }
  const pd = enclosure('paddock');
  if (pd) f.inPaddock = inside(pd, x, z);
  const hu = enclosure('hutch');
  if (hu) f.inRun = inside(hu, x, z);
  // Constructions du joueur (grange, écurie neuve, abri, pré, paddocks, niche, clapier…)
  for (const s of game.structures?.here?.() ?? []) {
    const def = STRUCTURES[s.type];
    if (!def || !(def.species ?? []).includes(a.species)) continue;
    let fp = null;
    try {
      fp = footprintOf(s);
    } catch {
      fp = null;
    }
    if (fp && Math.abs(x - fp.x) < fp.hw + 0.3 && Math.abs(z - fp.z) < fp.hd + 0.3) {
      f.building = s.type;
      break;
    }
  }
  const door = game.events?.houseDoor?.();
  f.nearHouse = !!door && Math.hypot(x - door.x, z - door.z) < 4;
  return f;
}

/**
 * Le lieu du soin d'après ce qu'on sait (pur) : species, facts (whereFacts), action (le soin).
 * Renvoie un des SETTINGS.
 */
export function settingFrom(species, facts, action = null) {
  const indoor = INDOOR_OF[species] ?? 'box';
  const outdoor = OUTDOOR_OF[species] ?? 'pre';
  if (!facts?.known || facts.here === false) return indoor;
  // (un soin qui a besoin de son lieu : son décor habituel)
  if (action && !(CARE_ANYWHERE[species] ?? []).includes(action)) return indoor;
  const def = facts.building ? STRUCTURES[facts.building] : null;
  if (species === 'horse') {
    if (facts.stalled || facts.inStable) return 'box';
    if (def && def.cat === 'building' && !def.open) return 'box';
    return facts.away ? 'ailleurs' : 'pre';
  }
  if (LIVESTOCK.includes(species)) {
    if (facts.inFold || facts.inStable) return 'etable';
    if (def && (def.cat === 'building' || def.cat === 'ranch') && !def.open) return 'etable';
    return facts.away ? 'ailleurs' : 'pre';
  }
  if (species === 'dog' || species === 'cat') {
    if (facts.housed || facts.inHouse) return 'maison';
    return facts.away ? 'ailleurs' : 'jardin';
  }
  if (species === 'rabbit') {
    if (facts.housed) return 'clapier';
    return facts.away ? 'ailleurs' : 'enclos';
  }
  return facts.away ? 'ailleurs' : outdoor;
}

/** Le lieu du soin de cet animal dans le jeu (voir settingFrom). */
export function careSetting(game, a, action = null) {
  return settingFrom(a?.species, whereFacts(game, a), action);
}

// ---------------------------------------------------------------- l'heure, la météo, la saison

/** Le moment de la journée (heure du jeu, 0 à 24). */
export function careTime(hour = 12) {
  const h = ((hour % 24) + 24) % 24;
  if (h < 6.5 || h >= 21) return 'nuit';
  if (h < 10.5) return 'matin';
  if (h < 17) return 'jour';
  return 'soir';
}

const WEATHERS = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'];

/**
 * L'ambiance d'un soin : { time, weather, season, lamp, wet, snowy, sun, sky, tint, skyTop, skyLow, fog } où sun est
 * la force du soleil (0 à 1,1), sky celle du ciel (lumière douce), tint la couleur du soleil, skyTop / skyLow celles
 * du ciel (en haut, à l'horizon), lamp : une lampe est allumée (la nuit, ou le soir par gros temps).
 */
export function careAmbience({ hour = 12, weather = 'clear', season = 'summer' } = {}) {
  const time = careTime(hour);
  const w = weather === 'heat' ? 'clear' : WEATHERS.includes(weather) ? weather : 'clear';
  const L = {
    matin: { sun: 0.85, sky: 0.85, tint: 0xffe2b8, skyTop: 0x8db8e6, skyLow: 0xffd9b0 },
    jour: { sun: 1, sky: 1, tint: 0xfff2dc, skyTop: 0x6fa6dc, skyLow: 0xe6eef2 },
    soir: { sun: 0.72, sky: 0.62, tint: 0xffa860, skyTop: 0x6b78b8, skyLow: 0xffa66a },
    nuit: { sun: 0.12, sky: 0.22, tint: 0x8fa4d8, skyTop: 0x0c1430, skyLow: 0x243258 },
  }[time];
  const W = {
    clear: { sun: 1, sky: 1, grey: 0 },
    cloudy: { sun: 0.55, sky: 1.05, grey: 0.45 },
    rain: { sun: 0.3, sky: 0.92, grey: 0.7 },
    storm: { sun: 0.18, sky: 0.78, grey: 0.85 },
    snow: { sun: 0.45, sky: 1.15, grey: 0.5 },
    fog: { sun: 0.35, sky: 1.05, grey: 0.6 },
  }[w];
  // (par gros temps, le ciel tire vers le gris : plus clair pour la neige, plus sombre pour l'orage)
  const greyOf = w === 'snow' ? 0xdfe6ee : w === 'storm' ? 0x58606c : w === 'fog' ? 0xcfd4d8 : 0x9aa4ae;
  const mix = (a, b, k) => {
    const ch = (c, s) => (c >> s) & 255;
    const m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * k);
    return (m(16) << 16) | (m(8) << 8) | m(0);
  };
  const night = time === 'nuit';
  const grey = night ? W.grey * 0.4 : W.grey;
  return {
    time,
    weather: w,
    season: ['spring', 'summer', 'autumn', 'winter'].includes(season) ? season : 'summer',
    lamp: night || (time === 'soir' && (hour % 24) >= 19 && w !== 'clear'),
    wet: w === 'rain' || w === 'storm',
    snowy: w === 'snow',
    foggy: w === 'fog',
    sun: +(L.sun * W.sun).toFixed(3),
    sky: +(L.sky * W.sky).toFixed(3),
    tint: mix(L.tint, 0xdde4ec, grey * 0.8),
    skyTop: mix(L.skyTop, greyOf, grey),
    skyLow: mix(L.skyLow, greyOf, grey),
  };
}

/** L'ambiance du moment dans le jeu (heure, météo, saison du lieu). Sans jeu : un beau jour d'été. */
export function gameAmbience(game) {
  let hour = 12;
  let weather = 'clear';
  let season = 'summer';
  try {
    if (game) {
      hour = game.hour ?? 12;
      weather = game.weather ?? 'clear';
      season = game.season ?? 'summer';
    }
  } catch {
    /* jeu incomplet (tests) */
  }
  return careAmbience({ hour, weather, season });
}

// ---------------------------------------------------------------- les objets du jour

/**
 * Les petits objets qu'on peut trouver autour de l'animal, selon le lieu : kind (le modèle, extras.js) et where
 * (où il se pose : 'floor' au sol, 'perch' en haut d'un muret, d'une barrière ou d'une cloison, 'lean' contre un mur).
 */
export const EXTRAS = {
  brouette: 'floor',
  fourche: 'lean',
  chat: 'perch',
  oiseau: 'perch',
  fleurs: 'floor',
  seau: 'floor',
  poule: 'floor',
  botte: 'floor',
  arrosoir: 'floor',
  balle: 'floor',
  papillon: 'air',
  pot: 'floor',
};

/** Les objets possibles de chaque lieu. */
export const EXTRAS_OF = {
  box: ['fourche', 'seau', 'chat', 'oiseau', 'botte', 'brouette'],
  etable: ['fourche', 'seau', 'chat', 'poule', 'botte', 'brouette', 'oiseau'],
  pre: ['brouette', 'fourche', 'seau', 'chat', 'oiseau', 'fleurs', 'poule', 'botte', 'papillon'],
  ailleurs: ['seau', 'oiseau', 'fleurs', 'botte', 'papillon', 'brouette'],
  maison: ['balle', 'pot', 'chat', 'seau'],
  jardin: ['arrosoir', 'fleurs', 'oiseau', 'papillon', 'balle', 'poule', 'chat', 'brouette'],
  clapier: ['arrosoir', 'fleurs', 'oiseau', 'poule', 'seau'],
  enclos: ['arrosoir', 'fleurs', 'oiseau', 'papillon', 'poule', 'chat'],
};

/** Petit hachage d'un texte (graine stable). */
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Nombres entre 0 et 1 tirés d'une graine (toujours les mêmes pour la même graine). */
export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    // (mulberry32)
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rawPick(day, id, place, n, species) {
  // (le chat sur le muret : pas pour le chat lui-même)
  const list = (EXTRAS_OF[place] ?? EXTRAS_OF.pre).filter((k) => !(k === 'chat' && species === 'cat'));
  const r = seeded(hashSeed(`${day}|${id}|${place}`));
  const order = list.map((k) => ({ k, v: r() })).sort((a, b) => a.v - b.v).map((x) => x.k);
  return order.slice(0, Math.min(n, order.length));
}

/**
 * Les objets du jour autour de cet animal, dans ce lieu : tirés au sort de façon stable (le même jour, les mêmes
 * objets ; le lendemain, pas tout à fait les mêmes). Renvoie une liste de kinds (EXTRAS), du plus important au moins.
 */
export function pickExtras({ day = 1, id = '', place = 'pre', n = 3, species = '' } = {}) {
  const today = rawPick(day, id, place, n, species);
  const before = rawPick(day - 1, id, place, n, species);
  const same = today.length === before.length && today.every((k) => before.includes(k));
  if (!same) return today;
  // (pareil qu'hier : un autre objet prend la place du dernier)
  const list = (EXTRAS_OF[place] ?? EXTRAS_OF.pre).filter((k) => !today.includes(k) && !(k === 'chat' && species === 'cat'));
  if (!list.length) return today;
  const k = list[hashSeed(`${day}|${id}`) % list.length];
  return [...today.slice(0, -1), k];
}
