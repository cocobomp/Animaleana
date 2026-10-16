// Examen vétérinaire « comme un vrai véto » (simplifié) : les constantes normales de chaque espèce,
// le « cas » d'un animal (ce qu'on va trouver en l'examinant), l'évaluation de chaque mesure
// (✅ normal / ⚠️ anormal, avec la norme rappelée) et les maladies compatibles avec les signes trouvés.
// Logique pure, sans DOM ni 3D : testée dans tests/vetExam.test.js. L'écran est dans src/ui/vetExam.js.
//
// Les valeurs normales sont celles des manuels vétérinaires (animal adulte, au repos), arrondies :
//   température en °C, cœur en battements par minute, respiration en mouvements par minute.

import { ILLNESSES, ageYears } from './animal.js';

export const VITALS = {
  horse: { temp: [37.2, 38.3], heart: [28, 44], resp: [8, 16], kg: 500 },
  cow: { temp: [38.0, 39.3], heart: [48, 84], resp: [26, 50], kg: 650 },
  sheep: { temp: [38.5, 39.9], heart: [70, 90], resp: [16, 34], kg: 70 },
  goat: { temp: [38.5, 39.7], heart: [70, 90], resp: [15, 30], kg: 60 },
  dog: { temp: [38.0, 39.2], heart: [60, 140], resp: [10, 30], kg: 30 },
  cat: { temp: [38.0, 39.2], heart: [140, 220], resp: [20, 40], kg: 4.5 },
  rabbit: { temp: [38.5, 40.0], heart: [180, 250], resp: [30, 60], kg: 2.5 },
};
export const VITAL_SPECIES = Object.keys(VITALS);

/** La gencive appuyée redevient rose en moins de 2 secondes (temps de recoloration capillaire). */
export const CRT_MAX = 2;
/** On compte les battements pendant 10 secondes, puis × 6 pour avoir la minute. */
export const COUNT_SECONDS = 10;
/** Cœurs trop rapides pour taper au rythme : on les écoute au ralenti (× 2). */
export const SLOWMO = { cat: 2, rabbit: 2 };
/** Écart accepté entre ce que l'enfant a compté et le vrai nombre de battements. */
export const COUNT_TOLERANCE = 0.15;

export const vitalsOf = (species) => VITALS[species] ?? VITALS.dog;
export const slowmoOf = (species) => SLOWMO[species] ?? 1;
const round1 = (n) => Math.round(n * 10) / 10;

/** 'low' | 'normal' | 'high' par rapport à une plage [min, max]. */
export function classify(value, [lo, hi]) {
  if (value < lo) return 'low';
  if (value > hi) return 'high';
  return 'normal';
}

/** Les outils de la trousse, dans l'ordre de la barre d'outils. */
export const TOOLS = [
  { id: 'stetho', emoji: '🩺' },
  { id: 'thermo', emoji: '🌡️' },
  { id: 'light', emoji: '🔦' },
  { id: 'mouth', emoji: '🦷' },
  { id: 'palpate', emoji: '👆' },
  { id: 'scale', emoji: '⚖️' },
  { id: 'walk', emoji: '👣' },
];
export const TOOL_IDS = TOOLS.map((x) => x.id);

/**
 * Les mesures : chacune se fait avec un outil, sur une zone du corps.
 * zone null : l'outil s'applique à tout l'animal (balance, marche).
 */
export const MEASURES = {
  heart: { tool: 'stetho', zone: 'heart', emoji: '❤️' },
  lungs: { tool: 'stetho', zone: 'lungs', emoji: '🫁' },
  gut: { tool: 'stetho', zone: 'gut', emoji: '🍽️' },
  temp: { tool: 'thermo', zone: 'rump', emoji: '🌡️' },
  eyes: { tool: 'light', zone: 'eye', emoji: '👁️' },
  ears: { tool: 'light', zone: 'ear', emoji: '👂' },
  nose: { tool: 'light', zone: 'nose', emoji: '👃' },
  coat: { tool: 'light', zone: 'back', emoji: '🔍' },
  gums: { tool: 'mouth', zone: 'mouth', emoji: '🦷' },
  crt: { tool: 'mouth', zone: 'mouth', emoji: '⏱️' },
  palpBelly: { tool: 'palpate', zone: 'belly', emoji: '🤲' },
  palpFront: { tool: 'palpate', zone: 'legFront', emoji: '🦵' },
  palpHind: { tool: 'palpate', zone: 'legHind', emoji: '🦵' },
  palpHead: { tool: 'palpate', zone: 'ear', emoji: '🤚' },
  weight: { tool: 'scale', zone: null, emoji: '⚖️' },
  gait: { tool: 'walk', zone: null, emoji: '👣' },
};
export const MEASURE_IDS = Object.keys(MEASURES);

/** Les zones qu'on peut toucher avec chaque outil (l'écran les dessine sur l'animal). */
export const TOOL_ZONES = {};
for (const m of Object.values(MEASURES)) {
  if (!m.zone) continue;
  const list = (TOOL_ZONES[m.tool] ??= []);
  if (!list.includes(m.zone)) list.push(m.zone);
}

/** La mesure faite quand on pose cet outil sur cette zone (bouche : d'abord les gencives). */
export function measureFor(tool, zone) {
  return MEASURE_IDS.find((id) => MEASURES[id].tool === tool && MEASURES[id].zone === zone) ?? null;
}

// ------------------------------------------------------------------ maladies et signes

/**
 * Les signes de chaque maladie du jeu (ILLNESSES dans src/sim/animal.js).
 * Un signe = ce que l'examen trouve d'anormal (fièvre, crépitements…).
 */
export const ILLNESS_SIGNS = {
  ear: ['earsRed', 'painEar'],
  paw: ['lame', 'painLeg', 'heartFast'],
  belly: ['gutSilent', 'gutLoud', 'painBelly', 'gumsPale', 'crtSlow', 'heartFast', 'fever'],
  cold: ['noseRunny', 'eyesWatery', 'wheeze', 'fever'],
  flu: ['fever', 'crackles', 'breathFast', 'heartFast', 'noseRunny', 'eyesWatery'],
  fleas: ['fleas'],
};
export const ILLNESS_IDS = Object.keys(ILLNESS_SIGNS);

/** Le signe qui « signe » la maladie (celui qu'il faut trouver pour être sûr). */
export const KEY_SIGNS = {
  ear: ['earsRed', 'painEar'],
  paw: ['lame', 'painLeg'],
  belly: ['gutSilent', 'gutLoud', 'painBelly'],
  cold: ['wheeze'],
  flu: ['crackles'],
  fleas: ['fleas'],
};

/** Signes qui ne sont pas des maladies (le poids) : notés, mais pas pris pour le diagnostic. */
export const BODY_SIGNS = ['thin', 'fat'];

/** La mesure qui montre chaque signe (pour l'indice « tu n'as pas encore… »). */
export const SIGN_MEASURE = {
  fever: 'temp',
  hypothermia: 'temp',
  heartFast: 'heart',
  heartSlow: 'heart',
  breathFast: 'lungs',
  crackles: 'lungs',
  wheeze: 'lungs',
  gutSilent: 'gut',
  gutLoud: 'gut',
  gumsPale: 'gums',
  crtSlow: 'crt',
  eyesWatery: 'eyes',
  noseRunny: 'nose',
  earsRed: 'ears',
  fleas: 'coat',
  painBelly: 'palpBelly',
  painEar: 'palpHead',
  lame: 'gait',
  thin: 'weight',
  fat: 'weight',
};

const HERBIVORES = ['horse', 'cow', 'sheep', 'goat', 'rabbit'];

/** Ce que l'animal montre quand on le regarde arriver (le « motif de consultation »). */
export const LOOK_OF = { ear: 'shakesHead', paw: 'limps', belly: 'noEat', cold: 'sneezes', flu: 'tired', fleas: 'scratches' };

// ------------------------------------------------------------------ le cas de l'animal

/** Poids typique de l'animal (kg) selon l'espèce, la taille de la race et l'âge. */
export function typicalKg(a) {
  const V = vitalsOf(a.species);
  const scale = a.look?.scale ?? 1;
  const years = a.ageDays === undefined ? 10 : ageYears(a);
  const adult = { horse: 4, cow: 2, sheep: 1, goat: 1, dog: 1.5, cat: 1, rabbit: 0.6 }[a.species] ?? 1;
  const growth = Math.min(1, 0.25 + 0.75 * Math.min(1, years / adult));
  return V.kg * scale ** 2.2 * growth;
}

/** La plage de poids normale pour cet animal (± 15 % autour du poids typique). */
export function normalKg(a) {
  const k = typicalKg(a);
  const r = (n) => (n >= 20 ? Math.round(n) : round1(n));
  return [r(k * 0.85), r(k * 1.15)];
}

/** Silhouette d'après a.weight (50 = poids idéal ; > 75 trop gros, < 25 trop maigre). */
export function bodyScore(a) {
  const w = a.weight ?? 50;
  return w > 75 ? 'fat' : w < 25 ? 'thin' : 'ok';
}

/** Cœur au repos typique (les petits chiens ont le cœur plus rapide que les grands). */
function typicalHeart(a) {
  const V = vitalsOf(a.species);
  if (a.species === 'dog') {
    const kg = typicalKg(a);
    return kg < 10 ? 112 : kg > 25 ? 82 : 96;
  }
  return (V.heart[0] + V.heart[1]) / 2;
}

/**
 * Le cas : tout ce que l'examen va révéler pour cet animal (selon sa maladie a.sick).
 * Les valeurs normales sont bien au milieu de la norme, les anormales bien en dehors :
 * l'enfant qui mesure à peu près juste trouve toujours la bonne conclusion.
 */
export function makeCase(a, rng = Math.random) {
  const species = VITALS[a.species] ? a.species : 'dog';
  const V = vitalsOf(species);
  const illness = a.sick && ILLNESS_SIGNS[a.sick] ? a.sick : null;
  const wobble = (k) => (rng() - 0.5) * 2 * k;
  const mid = (r) => (r[0] + r[1]) / 2;
  const width = (r) => r[1] - r[0];

  let temp = mid(V.temp) + wobble(width(V.temp) * 0.18);
  const fever = { cold: 0.6, flu: 1.4, belly: 0.5 }[illness];
  if (fever) temp = V.temp[1] + fever + rng() * 0.2;

  let heart = typicalHeart(a) * (1 + wobble(0.05));
  if (illness === 'paw' || illness === 'belly' || illness === 'flu') heart = V.heart[1] * (1.3 + rng() * 0.08);

  let resp = mid(V.resp) * (1 + wobble(0.08));
  if (illness === 'flu') resp = V.resp[1] * (1.35 + rng() * 0.1);

  const herbivore = HERBIVORES.includes(species);
  const lame = illness === 'paw' ? (rng() < 0.5 ? 'front' : 'hind') : null;
  const kgRange = normalKg(a);
  const score = bodyScore(a);
  let kg = typicalKg(a) * (1 + wobble(0.05));
  if (score === 'fat') kg = kgRange[1] * (1.08 + rng() * 0.06);
  if (score === 'thin') kg = kgRange[0] * (0.9 - rng() * 0.05);

  return {
    species,
    illness,
    temp: round1(temp),
    heart: Math.round(heart),
    resp: Math.round(resp),
    lungs: illness === 'flu' ? 'crackles' : illness === 'cold' ? 'wheeze' : 'normal',
    gut: illness === 'belly' ? (herbivore ? 'silent' : 'loud') : 'normal',
    crt: illness === 'belly' ? round1(3 + rng() * 0.6) : round1(1.1 + rng() * 0.5),
    gums: illness === 'belly' ? 'pale' : 'pink',
    eyes: illness === 'cold' || illness === 'flu' ? 'watery' : 'clear',
    nose: illness === 'cold' || illness === 'flu' ? 'runny' : 'clean',
    ears: illness === 'ear' ? 'red' : 'clean',
    coat: illness === 'fleas' ? 'fleas' : 'ok',
    pain: { belly: illness === 'belly', ear: illness === 'ear', front: lame === 'front', hind: lame === 'hind' },
    lame,
    kg: kg >= 20 ? Math.round(kg) : round1(kg),
    kgRange,
    body: score,
    look: LOOK_OF[illness] ?? 'fine',
  };
}

// ------------------------------------------------------------------ compter le cœur

/** Battements par minute d'après ce qu'on a compté (10 s × 6, et × 2 au ralenti). */
export function bpmFromCount(count, species, seconds = COUNT_SECONDS) {
  return Math.round(count * (60 / seconds) * slowmoOf(species));
}

/** Combien de « boum » on entend pendant le comptage (au ralenti pour les cœurs rapides). */
export function expectedCount(bpm, species, seconds = COUNT_SECONDS) {
  return (bpm / slowmoOf(species)) * (seconds / 60);
}

/** Le compte est-il assez juste ? (± 15 %, et au moins ± 1,5 battement). */
export function countOk(count, bpm, species, seconds = COUNT_SECONDS) {
  const exp = expectedCount(bpm, species, seconds);
  return Math.abs(count - exp) <= Math.max(1.5, exp * COUNT_TOLERANCE);
}

// ------------------------------------------------------------------ évaluer une mesure

/** Petit résultat commun. */
function res(measure, status, extra = {}) {
  return { measure, tool: MEASURES[measure].tool, status, signs: [], ...extra };
}

/**
 * Évalue une mesure sur le cas. input selon la mesure :
 *   heart : { count, seconds?, assisted? } (assisted : le docteur aide après deux comptes ratés)
 *   crt   : { seconds } (le temps compté par l'enfant)
 *   gait  : { answer: 'sound' | 'lame' } (ce que l'enfant a vu)
 * Renvoie { measure, tool, status: 'ok' | 'bad', signs: [...], value?, unit?, norm?, state?, note? }
 * ou { measure, retry: true, reason } quand il faut recommencer (compte faux, mauvaise réponse).
 */
export function evaluate(cs, measure, input = {}) {
  const V = vitalsOf(cs.species);
  switch (measure) {
    case 'heart': {
      const assisted = !!input.assisted;
      const count = input.count ?? 0;
      const seconds = input.seconds ?? COUNT_SECONDS;
      const trueClass = classify(cs.heart, V.heart);
      if (!assisted) {
        const bpm = bpmFromCount(count, cs.species, seconds);
        // Compte trop loin du vrai, ou conclusion différente (tout près d'une limite) : on recompte.
        if (!countOk(count, cs.heart, cs.species, seconds) || classify(bpm, V.heart) !== trueClass) {
          return { measure, retry: true, reason: count < expectedCount(cs.heart, cs.species, seconds) ? 'few' : 'many', bpm, count };
        }
        return vitalResult(measure, bpm, V.heart, trueClass, 'heartFast', 'heartSlow', { count, slowmo: slowmoOf(cs.species) });
      }
      return vitalResult(measure, cs.heart, V.heart, trueClass, 'heartFast', 'heartSlow', { assisted: true, slowmo: slowmoOf(cs.species) });
    }
    case 'lungs': {
      const rc = classify(cs.resp, V.resp);
      const signs = [];
      if (cs.lungs === 'crackles') signs.push('crackles');
      if (cs.lungs === 'wheeze') signs.push('wheeze');
      if (rc === 'high') signs.push('breathFast');
      return { ...res(measure, signs.length ? 'bad' : 'ok'), signs, state: cs.lungs, value: cs.resp, unit: '/min', norm: V.resp, rate: rc };
    }
    case 'gut': {
      const signs = cs.gut === 'silent' ? ['gutSilent'] : cs.gut === 'loud' ? ['gutLoud'] : [];
      return { ...res(measure, signs.length ? 'bad' : 'ok'), signs, state: cs.gut };
    }
    case 'temp': {
      const c = classify(cs.temp, V.temp);
      return vitalResult(measure, cs.temp, V.temp, c, 'fever', 'hypothermia', { unit: '°C' });
    }
    case 'eyes':
      return state(measure, cs.eyes, cs.eyes === 'watery' ? 'eyesWatery' : null);
    case 'ears':
      return state(measure, cs.ears, cs.ears === 'red' ? 'earsRed' : null);
    case 'nose':
      return state(measure, cs.nose, cs.nose === 'runny' ? 'noseRunny' : null);
    case 'coat':
      return state(measure, cs.coat, cs.coat === 'fleas' ? 'fleas' : null);
    case 'gums':
      return state(measure, cs.gums, cs.gums === 'pale' ? 'gumsPale' : null);
    case 'crt': {
      const counted = input.seconds;
      // Trop tôt : la gencive n'est pas encore redevenue rose.
      if (counted !== undefined && counted < cs.crt * 0.6) return { measure, retry: true, reason: 'early' };
      const near = counted !== undefined && Math.abs(counted - cs.crt) <= 1;
      const value = round1(near ? Math.round(counted * 2) / 2 || 0.5 : cs.crt);
      const slow = cs.crt > CRT_MAX;
      return { ...res(measure, slow ? 'bad' : 'ok'), signs: slow ? ['crtSlow'] : [], value, unit: 's', norm: [0, CRT_MAX] };
    }
    case 'palpBelly':
      return state(measure, cs.pain.belly ? 'pain' : 'soft', cs.pain.belly ? 'painBelly' : null);
    case 'palpFront':
      return state(measure, cs.pain.front ? 'pain' : 'ok', cs.pain.front ? 'painLeg' : null);
    case 'palpHind':
      return state(measure, cs.pain.hind ? 'pain' : 'ok', cs.pain.hind ? 'painLeg' : null);
    case 'palpHead':
      return state(measure, cs.pain.ear ? 'pain' : 'ok', cs.pain.ear ? 'painEar' : null);
    case 'weight': {
      const signs = cs.body === 'ok' ? [] : [cs.body];
      return { ...res(measure, signs.length ? 'bad' : 'ok'), signs, value: cs.kg, unit: 'kg', norm: cs.kgRange, state: cs.body };
    }
    case 'gait': {
      const truth = cs.lame ? 'lame' : 'sound';
      if (input.answer && input.answer !== truth) return { measure, retry: true, reason: 'look' };
      return { ...res(measure, cs.lame ? 'bad' : 'ok'), signs: cs.lame ? ['lame'] : [], state: truth, leg: cs.lame };
    }
    default:
      return null;
  }
}

function vitalResult(measure, value, norm, cls, highSign, lowSign, extra = {}) {
  const signs = cls === 'high' ? [highSign] : cls === 'low' ? [lowSign] : [];
  return { ...res(measure, signs.length ? 'bad' : 'ok'), signs, value, norm, rate: cls, ...extra };
}

function state(measure, st, sign) {
  return { ...res(measure, sign ? 'bad' : 'ok'), signs: sign ? [sign] : [], state: st };
}

/** Tous les signes trouvés dans une liste de résultats (sans doublons). */
export function signsFound(results) {
  const out = [];
  for (const r of results) for (const s of r?.signs ?? []) if (!out.includes(s)) out.push(s);
  return out;
}

// ------------------------------------------------------------------ diagnostic

/**
 * Les maladies compatibles avec les signes trouvés : chaque signe trouvé doit être un signe
 * de la maladie. Triées : signe clé trouvé d'abord, puis le plus de signes expliqués.
 * Sans aucun signe anormal : [{ id: 'healthy' }]. Renvoie [{ id, matched, key }].
 */
export function compatibleDiagnoses(signs) {
  const found = signs.filter((s) => !BODY_SIGNS.includes(s));
  if (!found.length) return [{ id: 'healthy', matched: [], key: true }];
  return ILLNESS_IDS
    .map((id) => {
      const list = ILLNESS_SIGNS[id];
      const matched = found.filter((s) => list.includes(s));
      return { id, matched, key: matched.some((s) => KEY_SIGNS[id].includes(s)), ok: matched.length === found.length };
    })
    .filter((x) => x.ok)
    .sort((a, b) => (b.key - a.key) || (b.matched.length - a.matched.length) || (ILLNESS_SIGNS[a.id].length - ILLNESS_SIGNS[b.id].length))
    .map(({ id, matched, key }) => ({ id, matched, key }));
}

/** Le diagnostic choisi est-il le bon ? ('healthy' pour un animal en bonne santé.) */
export const isRightDiagnosis = (cs, id) => (cs.illness ? id === cs.illness : id === 'healthy');

/**
 * L'examen à faire pour être sûr : une mesure pas encore faite qui montrerait le signe clé
 * de la vraie maladie (ou, s'il est en bonne santé, une constante pas encore prise). null sinon.
 */
export function missingExam(cs, doneMeasures) {
  if (!cs.illness) return ['temp', 'heart', 'lungs'].find((m) => !doneMeasures.includes(m)) ?? null;
  const keys = KEY_SIGNS[cs.illness];
  const wanted = [];
  for (const s of keys) {
    if (s === 'painLeg') wanted.push(cs.lame === 'hind' ? 'palpHind' : 'palpFront');
    else if (SIGN_MEASURE[s]) wanted.push(SIGN_MEASURE[s]);
  }
  // Ne demande que les mesures qui montrent vraiment quelque chose pour ce cas.
  const useful = wanted.filter((m) => evaluate(cs, m, m === 'heart' ? { assisted: true } : {})?.status === 'bad');
  if (useful.some((m) => doneMeasures.includes(m))) return null;
  return useful[0] ?? null;
}

// ------------------------------------------------------------------ traitement

export const TREATMENTS = ['drops', 'bandage', 'syrup', 'shampoo', 'injection'];
export const treatmentFor = (illness) => ILLNESSES[illness]?.treatment ?? null;

/** Dose selon le poids : sirop 1 ml pour 5 kg, piqûre 1 ml pour 10 kg (au moins 0,5 ml). */
export function doseFor(treatment, kg) {
  if (!kg) return null;
  const per = { syrup: 5, injection: 10 }[treatment];
  if (!per) return null;
  const ml = kg / per;
  return { amount: ml >= 10 ? Math.round(ml) : Math.max(0.5, Math.round(ml * 2) / 2), unit: 'ml' };
}
