// Les lieux du monde, leur climat, et les règles de voyage.

import { pickWeighted, seeded } from './rng.js';

// weather : poids de chaque météo par saison.
// temp : température moyenne à midi par saison (°C).
export const PLACES = {
  maison: {
    id: 'maison', flag: '🇫🇷', lat: 49.2, lon: 0.4, landmass: 'europe', biome: 'countryside', home: true,
    name: { fr: 'Ma maison', en: 'My home' }, region: { fr: 'Normandie, France', en: 'Normandy, France' },
    hills: 1, trees: 'deciduous', treeCount: 140,
    temp: { spring: 14, summer: 23, autumn: 14, winter: 5 },
    weather: {
      spring: { clear: 4, cloudy: 3, rain: 3 }, summer: { clear: 6, cloudy: 2, rain: 1, storm: 1 },
      autumn: { clear: 2, cloudy: 3, rain: 4, fog: 2 }, winter: { clear: 2, cloudy: 3, rain: 3, snow: 1, fog: 2 },
    },
  },
  bretagne: {
    id: 'bretagne', flag: '🇫🇷', lat: 48.3, lon: -4.5, landmass: 'europe', biome: 'beach',
    name: { fr: 'Plage de Bretagne', en: 'Brittany beach' }, region: { fr: 'Bretagne, France', en: 'Brittany, France' },
    hills: 0.6, trees: 'pine', treeCount: 60, sea: true,
    temp: { spring: 13, summer: 21, autumn: 14, winter: 8 },
    weather: {
      spring: { clear: 3, cloudy: 3, rain: 4 }, summer: { clear: 6, cloudy: 3, rain: 2 },
      autumn: { clear: 2, cloudy: 3, rain: 5, storm: 1 }, winter: { clear: 1, cloudy: 3, rain: 5, storm: 2, fog: 1 },
    },
  },
  alpes: {
    id: 'alpes', flag: '🇨🇭', lat: 46.0, lon: 7.75, landmass: 'europe', biome: 'mountain', abroad: true,
    name: { fr: 'Alpes suisses', en: 'Swiss Alps' }, region: { fr: 'Valais, Suisse', en: 'Valais, Switzerland' },
    hills: 2.4, trees: 'pine', treeCount: 160, mountains: true,
    temp: { spring: 8, summer: 18, autumn: 9, winter: -4 },
    weather: {
      spring: { clear: 4, cloudy: 3, rain: 2, snow: 1 }, summer: { clear: 6, cloudy: 2, storm: 2 },
      autumn: { clear: 3, cloudy: 3, rain: 2, fog: 2, snow: 1 }, winter: { clear: 3, cloudy: 2, snow: 6 },
    },
  },
  islande: {
    id: 'islande', flag: '🇮🇸', lat: 64.1, lon: -21.0, landmass: 'islande', biome: 'tundra', abroad: true,
    name: { fr: 'Plaines d\'Islande', en: 'Iceland plains' }, region: { fr: 'Islande', en: 'Iceland' },
    hills: 1.6, trees: 'birch', treeCount: 25, mountains: true, volcano: true,
    temp: { spring: 4, summer: 12, autumn: 5, winter: -2 },
    weather: {
      spring: { clear: 2, cloudy: 4, rain: 3, snow: 1 }, summer: { clear: 4, cloudy: 4, rain: 2 },
      autumn: { clear: 2, cloudy: 3, rain: 4, storm: 1 }, winter: { clear: 2, cloudy: 2, snow: 6, storm: 1 },
    },
  },
  canada: {
    id: 'canada', flag: '🇨🇦', lat: 47.1, lon: -71.2, landmass: 'amerique', biome: 'forest', abroad: true,
    name: { fr: 'Forêt du Québec', en: 'Québec forest' }, region: { fr: 'Québec, Canada', en: 'Québec, Canada' },
    hills: 1.2, trees: 'maple', treeCount: 220, lake: true,
    temp: { spring: 10, summer: 24, autumn: 9, winter: -12 },
    weather: {
      spring: { clear: 4, cloudy: 3, rain: 3 }, summer: { clear: 6, cloudy: 2, rain: 1, storm: 1 },
      autumn: { clear: 4, cloudy: 3, rain: 3 }, winter: { clear: 3, cloudy: 2, snow: 7 },
    },
  },
  japon: {
    id: 'japon', flag: '🇯🇵', lat: 35.0, lon: 135.8, landmass: 'japon', biome: 'garden', abroad: true,
    name: { fr: 'Campagne de Kyoto', en: 'Kyoto countryside' }, region: { fr: 'Kyoto, Japon', en: 'Kyoto, Japan' },
    hills: 1.3, trees: 'cherry', treeCount: 120,
    temp: { spring: 17, summer: 30, autumn: 19, winter: 6 },
    weather: {
      spring: { clear: 5, cloudy: 3, rain: 2 }, summer: { clear: 4, cloudy: 2, rain: 3, storm: 2 },
      autumn: { clear: 6, cloudy: 2, rain: 2 }, winter: { clear: 5, cloudy: 3, snow: 1 },
    },
  },
};

export const PLACE_IDS = Object.keys(PLACES);

export const TRAVEL_MODES = {
  car: { emoji: '🚗', speed: 85, ground: true, horses: false, cost: 0.15 },
  van: { emoji: '🚐', speed: 70, ground: true, horses: true, cost: 0.2 },
  horse: { emoji: '🐎', speed: 9, ground: true, horses: true, needsHorse: true, cost: 0 },
  boat: { emoji: '⛴️', speed: 35, ground: false, horses: true, cost: 0.1, extraHours: 2 },
  plane: { emoji: '✈️', speed: 750, ground: false, horses: true, cost: 0.3, extraHours: 3 },
};

export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

/**
 * Vérifie un mode de transport.
 * travelers : animaux emmenés ; rider : le cheval monté (pour le mode cheval).
 */
export function checkTravel(fromId, toId, modeId, travelers = [], hasRideableHorse = false) {
  const from = PLACES[fromId];
  const to = PLACES[toId];
  const mode = TRAVEL_MODES[modeId];
  if (fromId === toId) return { ok: false, reason: 'samePlace' };
  if (mode.ground && from.landmass !== to.landmass) return { ok: false, reason: 'sea' };
  if (modeId === 'boat' && from.landmass === to.landmass) return { ok: false, reason: 'noPort' };
  if (!mode.horses && travelers.some((a) => a.species === 'horse')) return { ok: false, reason: 'horseNeedsVan' };
  if (mode.needsHorse && !hasRideableHorse) return { ok: false, reason: 'needHorse' };
  const km = distanceKm(from, to);
  const hours = km / mode.speed + (mode.extraHours ?? 0);
  return { ok: true, km, hours, cost: Math.round(km * mode.cost + travelers.length * 5) };
}

export function rollWeather(placeId, season, key) {
  const rng = seeded(`${placeId}-${season}-${key}`);
  return pickWeighted(PLACES[placeId].weather[season], rng);
}

/** Température indicative : plus froid la nuit et par mauvais temps. */
export function temperature(placeId, season, hour, weather) {
  const base = PLACES[placeId].temp[season];
  const daily = -Math.cos(((hour - 3) / 24) * Math.PI * 2) * 5;
  const w = { rain: -3, storm: -4, snow: -3, fog: -2, cloudy: -1 }[weather] ?? 0;
  return Math.round(base - 3 + daily + w);
}

export const WEATHER_EMOJI = { clear: '☀️', cloudy: '⛅', rain: '🌧️', storm: '⛈️', snow: '❄️', fog: '🌫️' };
