// Où se passe le soin en 3D : le VRAI endroit où se trouve l'animal dans le jeu (son box, le pré, l'étable, la
// maison, le jardin, le clapier, son enclos…), la lumière de l'heure du jeu, la météo du jeu, la saison, et les petits
// objets autour qui changent un peu chaque jour. Un petit module sans 3D (tests/decors-*.test.js) : la scène
// (src/ui/minigames/care3d.js) choisit son décor d'après careSetting, et l'habille d'après careAmbience et pickExtras
// (src/game/care/ambience.js, src/game/care/extras.js).

import { enclosure, inside } from '../nav.js';
import { STRUCTURES, footprintOf } from '../../sim/construction.js';
import { PLACES } from '../../sim/places.js';

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
  f.placeId = p.place ?? null;
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

// ---------------------------------------------------------------- en voyage : le décor du lieu

/**
 * Les familles de lieux de voyage (src/sim/places.js : biome) et ce qui les montre dans le décor d'un soin dehors
 * (src/game/care/away.js) : le sol, les arbres, ce qu'on voit au loin, une construction du pays, et les objets du jour.
 */
export const AWAY_LOOKS = {
  // (la Bretagne : le sable, la mer au loin, une cabane de plage rayée, un voilier)
  plage: { ground: 'sable', trees: 'pin', far: ['mer', 'dunes'], landmark: 'cabane', extras: ['coquillage', 'crabe', 'mouette', 'seau', 'botte'] },
  // (les Alpes : les sommets enneigés, les sapins, un chalet)
  montagne: { ground: 'alpage', trees: 'sapin', far: ['sommets'], landmark: 'chalet', extras: ['sapin', 'rocher', 'fleurs', 'oiseau', 'botte', 'papillon'] },
  // (l'Islande : la mousse, les rochers noirs, un volcan qui fume, une maison au toit d'herbe)
  volcan: { ground: 'mousse', trees: 'bouleau', far: ['volcan', 'collines'], landmark: 'tourbe', extras: ['rocher', 'oiseau', 'botte', 'seau', 'mouette'] },
  // (l'Alberta : la grande prairie, les Rocheuses, une grange rouge)
  rocheuses: { ground: 'prairie', trees: 'pin', far: ['sommets', 'collines'], landmark: 'grange', extras: ['botte', 'oiseau', 'seau', 'brouette', 'fleurs', 'papillon'] },
  // (la Pampa : l'herbe à perte de vue, un grand arbre seul, une éolienne, l'estancia blanche)
  pampa: { ground: 'prairie', trees: 'ombu', far: ['plaine'], landmark: 'estancia', extras: ['botte', 'oiseau', 'seau', 'fleurs', 'papillon', 'poule'] },
  // (Kyoto : les cerisiers, un portail rouge, une lanterne de pierre)
  japon: { ground: 'herbe', trees: 'cerisier', far: ['collines'], landmark: 'torii', extras: ['lanterne', 'fleurs', 'oiseau', 'papillon', 'pot'] },
  // (l'Andalousie : la terre sèche, les oliviers, les cyprès, l'hacienda blanche au toit de tuiles)
  mediterranee: { ground: 'sec', trees: 'olivier', far: ['collines'], landmark: 'hacienda', extras: ['amphore', 'pot', 'fleurs', 'oiseau', 'papillon', 'seau'] },
  // (l'Australie : la terre rouge, les eucalyptus, l'éolienne, un grand rocher rouge, un kangourou au loin)
  bush: { ground: 'rouge', trees: 'eucalyptus', far: ['rocher', 'collines'], landmark: 'eolienne', extras: ['rocher', 'oiseau', 'botte', 'seau'] },
  // (les Cotswolds : les murets de pierre, les haies, un cottage de pierre blonde)
  cottage: { ground: 'herbe', trees: 'feuillu', far: ['collines'], landmark: 'cottage', extras: ['oiseau', 'fleurs', 'botte', 'seau', 'papillon', 'poule'] },
  // (le Kentucky : les clôtures blanches, une grande écurie à clocheton)
  haras: { ground: 'herbe', trees: 'feuillu', far: ['collines'], landmark: 'haras', extras: ['botte', 'brouette', 'seau', 'oiseau', 'fleurs', 'papillon'] },
};

/** La famille de décor d'un lieu de voyage (AWAY_LOOKS), ou null (lieu inconnu : le décor dehors habituel). */
export function awayLook(placeId) {
  const P = PLACES[placeId];
  if (!P) return null;
  if (placeId === 'angleterre') return 'cottage';
  if (placeId === 'kentucky') return 'haras';
  switch (P.biome) {
    case 'beach': return 'plage';
    case 'mountain': return 'montagne';
    case 'tundra': return 'volcan';
    case 'prairie': return P.mountains ? 'rocheuses' : 'pampa';
    case 'garden': return 'japon';
    case 'mediterranean': return 'mediterranee';
    case 'outback': return 'bush';
    case 'countryside': return 'cottage';
    default: return null;
  }
}

/** La liste des objets du jour d'un lieu (place : SETTINGS ; look : la famille du voyage, pour « ailleurs »). */
export function extrasPlace(place, look = null) {
  return place === 'ailleurs' && look && AWAY_LOOKS[look] ? `ailleurs-${look}` : place;
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
  // (en voyage)
  coquillage: 'floor',
  crabe: 'floor',
  mouette: 'perch',
  rocher: 'floor',
  sapin: 'floor',
  lanterne: 'floor',
  amphore: 'floor',
  // (accrochés au mur, à un poteau ou à une planche : ils ne prennent pas de place au sol, on les voit même en gros plan)
  fer: 'hang',
  licol: 'hang',
  nichoir: 'hang',
  cadre: 'hang',
  cloche: 'hang',
  // (au loin, derrière l'animal : un vol d'oiseaux dans le ciel, une poule dans le pré, une hirondelle sous le toit)
  vol: 'far',
  papillons: 'far',
  rougegorge: 'far',
  poulailler: 'far',
  hirondelle: 'far',
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
for (const [look, L] of Object.entries(AWAY_LOOKS)) EXTRAS_OF[`ailleurs-${look}`] = L.extras;

/**
 * Le petit plus de chaque lieu, en plus des objets du jour : des choses accrochées (on les voit même en gros plan,
 * quand le sol n'est pas dans l'image) et un peu de vie au loin. Toujours dans cet ordre (le premier qui trouve sa
 * place est pris) ; le jour choisit lequel commence (pickLife).
 */
export const LIFE_OF = {
  box: ['fer', 'licol', 'hirondelle'],
  etable: ['cloche', 'fer', 'hirondelle'],
  pre: ['vol', 'poulailler', 'fer', 'nichoir', 'papillons', 'rougegorge'],
  ailleurs: ['vol', 'nichoir', 'fer', 'papillons', 'rougegorge'],
  maison: ['cadre', 'cadre'],
  jardin: ['nichoir', 'vol', 'papillons', 'rougegorge', 'poulailler'],
  clapier: ['papillons', 'rougegorge', 'vol', 'poulailler'],
  enclos: ['papillons', 'rougegorge', 'vol', 'poulailler'],
};

/** Ce qui ne bouge pas la nuit (ni vol d'oiseaux, ni papillons, ni poule dehors, ni hirondelle) ; sous la pluie, la neige, le brouillard : ni vol ni papillons (pas l'hiver non plus). */
export function lifeOff(amb) {
  const off = new Set();
  if (!amb) return off;
  if (amb.time === 'nuit') off.add('vol').add('poulailler').add('hirondelle').add('papillons').add('rougegorge');
  if (amb.wet || amb.foggy || amb.snowy) off.add('vol').add('papillons');
  if (amb.season === 'winter') off.add('papillons');
  if (amb.wet || amb.snowy) off.add('poulailler');
  return off;
}

/**
 * Les choses en plus (LIFE_OF) de ce lieu, dans l'ordre où on les essaie : le jour fait tourner la liste (stable le
 * même jour). Pas celles de l'ambiance (lifeOff), ni celles déjà dans les objets du jour.
 */
export function pickLife({ day = 1, id = '', place = 'pre', amb = null, species = '', taken = [] } = {}) {
  const base = place.startsWith('ailleurs') ? LIFE_OF.ailleurs : LIFE_OF[place] ?? LIFE_OF.pre;
  const off = lifeOff(amb);
  // (le licol, le fer à cheval : l'écurie d'un cheval ; ailleurs, au bétail, la cloche)
  const list = [...new Set(base)].filter((k) => !off.has(k) && !taken.includes(k) && !(k === 'licol' && species !== 'horse'));
  if (!list.length) return [];
  const k = (hashSeed(`${id}|${place}|vie`) + Math.max(1, Math.floor(day))) % list.length;
  return [...list.slice(k), ...list.slice(0, k)];
}

/** Les objets qui n'ont pas leur place avec cette ambiance (careAmbience). */
export function extrasOff(amb) {
  const off = new Set();
  if (!amb) return off;
  if (amb.snowy || amb.season === 'winter') off.add('fleurs').add('papillon');
  if (amb.wet || amb.foggy) off.add('papillon');
  if (amb.time === 'nuit') off.add('papillon').add('oiseau').add('poule').add('mouette').add('crabe');
  return off;
}

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

/**
 * Les objets du jour autour de cet animal, dans ce lieu : tirés au sort de façon stable (le même jour, les mêmes
 * objets ; le lendemain, au moins un a changé). La liste du lieu est mélangée une fois pour cet animal ; chaque jour,
 * on avance d'un nombre de cases tiré au sort et on prend les n suivants. Renvoie une liste de kinds (EXTRAS).
 */
export function pickExtras({ day = 1, id = '', place = 'pre', n = 3, species = '', amb = null } = {}) {
  // (le chat sur le muret : pas pour le chat lui-même ; ni fleurs ni papillon sous la neige, pas de papillon sous la
  // pluie, la nuit les bêtes dorment)
  const banned = extrasOff(amb);
  const list = (EXTRAS_OF[place] ?? EXTRAS_OF.pre).filter((k) => !(k === 'chat' && species === 'cat') && !banned.has(k));
  const L = list.length;
  const m = Math.min(n, L);
  if (m <= 0) return [];
  const r = seeded(hashSeed(`${id}|${place}`));
  const perm = list.map((k) => ({ k, v: r() })).sort((a, b) => a.v - b.v).map((x) => x.k);
  if (m >= L) return perm;
  const d = Math.max(1, Math.floor(day));
  // (le décalage du jour : la somme des pas tirés de 1 à L - 1 ; une fenêtre qui avance change toujours)
  let off = hashSeed(`${id}|${place}|0`) % L;
  for (let k = 1; k <= Math.min(d, 5000); k++) off += 1 + (hashSeed(`${id}|${place}|${k}`) % (L - 1));
  const out = [];
  for (let i = 0; i < m; i++) out.push(perm[(off + i) % L]);
  return out;
}
