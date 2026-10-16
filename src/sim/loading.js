// Faire monter les animaux dans le véhicule, comme en vrai :
//   - devant le pont (la rampe), un cheval peu confiant hésite : on le rassure, on lui donne une
//     friandise ou on patiente, puis il monte en main (au licol) jusqu'à sa place ;
//   - dans le compartiment, les étapes de sécurité : barre de poitrail fermée devant lui, barre arrière
//     (barre de fesse) fermée derrière lui, et seulement ensuite on l'attache au filet à foin.
// Ce fichier ne dépend pas de la 3D, il est testé dans tests/loading.test.js.

const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));

/** Au-dessus de cette confiance, l'animal monte le pont sans s'arrêter. */
export const CONFIDENCE_OK = 55;

// Confiance de départ devant le pont, selon le caractère.
const PERSONALITY_CONFIDENCE = { calm: 75, curious: 64, cuddly: 62, playful: 58, stubborn: 42, shy: 30 };

/** Ce que rapporte chaque façon d'aider (un peu moins à chaque fois qu'on recommence la même). */
export const ENCOURAGE = { reassure: 18, treat: 30, wait: 8 };

/**
 * Confiance de l'animal devant le pont (0–100) : son caractère, l'habitude des voyages,
 * la confiance qu'il a en toi (affection) et son stress du moment.
 */
export function loadConfidence(a) {
  let c = PERSONALITY_CONFIDENCE[a.personality] ?? 55;
  c += Math.min(30, (a.trips ?? 0) * 10); // il a déjà voyagé : il connaît le van
  c += ((a.needs?.affection ?? 50) - 50) * 0.2;
  c -= (a.stress ?? 0) * 0.4;
  if (a.species !== 'horse') c += 25; // vaches, moutons et chèvres suivent le groupe sans trop se poser de questions
  return Math.round(clamp(c));
}

/** Début de la montée : on mesure la confiance. */
export function startLoad(a) {
  return { conf: loadConfidence(a), tries: 0, reassure: 0, treat: 0, wait: 0 };
}

export const willLoad = (s) => s.conf >= CONFIDENCE_OK;

/**
 * Aider l'animal à monter : 'reassure' (le rassurer, le caresser), 'treat' (une friandise), 'wait' (patienter).
 * Renvoie true s'il est prêt à monter.
 */
export function encourage(s, how) {
  const base = ENCOURAGE[how];
  if (!base) return willLoad(s);
  const n = s[how] ?? 0;
  s[how] = n + 1;
  s.conf = Math.round(clamp(s.conf + base / (1 + n * 0.5)));
  s.tries += 1;
  return willLoad(s);
}

// ---------------------------------------------------------------- places dans la remorque

/** Les étapes de sécurité d'une place, dans l'ordre. Les moutons et les chèvres ne s'attachent pas. */
export function stallSteps(a) {
  return a.species === 'horse' || a.species === 'cow' ? ['breastBar', 'rearBar', 'tie'] : ['breastBar', 'rearBar'];
}

/** Une place vide : barres ouvertes, rien d'attaché. */
export const newStall = () => ({ inside: false, breastBar: false, rearBar: false, tie: false });

/** L'animal arrive à sa place. Renvoie 'breastOpen' si la barre de poitrail n'était pas fermée avant (à éviter). */
export function enterStall(stall) {
  stall.inside = true;
  return stall.breastBar ? null : 'breastOpen';
}

/** Peut-on faire cette étape maintenant ? Renvoie { ok, reason }. */
export function canStep(stall, a, step) {
  if (!stallSteps(a).includes(step)) return { ok: false, reason: 'noStep' };
  if (stall[step]) return { ok: false, reason: 'done' };
  if (step === 'breastBar') return { ok: true }; // se ferme avant la montée (ou après, si on a oublié)
  if (!stall.inside) return { ok: false, reason: 'empty' };
  // On attache le cheval seulement APRÈS avoir fermé derrière lui : un cheval attaché qui recule
  // sans barre arrière tire sur sa corde et panique.
  if (step === 'tie' && !stall.rearBar) return { ok: false, reason: 'rearFirst' };
  return { ok: true };
}

/** Fait une étape. Renvoie { ok, reason }. */
export function doStep(stall, a, step) {
  const can = canStep(stall, a, step);
  if (!can.ok) return can;
  stall[step] = true;
  return { ok: true };
}

/** La prochaine étape à faire (ou null si tout est fait). */
export function nextStep(stall, a) {
  return stallSteps(a).find((s) => !stall[s]) ?? null;
}

export const secured = (stall, a) => stallSteps(a).every((s) => stall[s]);

/** Fait toutes les étapes qui restent, dans le bon ordre (le « Fais-le pour moi »). */
export function secureAll(stall, a) {
  stall.inside = true;
  for (const s of stallSteps(a)) stall[s] = true;
}

/**
 * Pour planTrip : { [id]: true | false } — false si un animal voyage sans être attaché ou sans barre
 * (il est bien plus stressé, et ça se voit quand on le vérifie pendant une pause).
 */
export function safetyMap(stalls, animals) {
  const out = {};
  for (const a of animals) {
    const s = stalls.get?.(a.id) ?? stalls[a.id];
    if (s) out[a.id] = secured(s, a);
  }
  return out;
}
