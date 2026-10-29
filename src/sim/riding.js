// Monter à cheval en balade libre : les allures (arrêt, pas, trot, galop, et le grand galop quand on « court »),
// ce qu'elles coûtent au cheval (énergie, sueur, soif), le cheval fatigué qui ne veut plus galoper, et les écarts
// (un oiseau, un sac qui bouge… le cheval fait un bond de côté). Logique pure, testée dans tests/riding.test.js ;
// le cavalier dans src/game/Player.js, les boutons dans src/ui/UI.js.

const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));

/** Les allures qu'on choisit avec les boutons (le grand galop vient en plus, en « courant » : Maj, 🏃). */
export const FREE_GAITS = ['halt', 'walk', 'trot', 'canter'];

/**
 * Vitesse de chaque allure (m/s) pour un cheval de taille 1. Elles tombent au milieu des seuils de l'animation
 * (cheval réaliste, src/game/models/horseReal.js pickGait : pas < 2,15 < trot < 3,9 < galop < 6,3 < grand galop ;
 * cheval simple, avatarMotion.gaitFromSpeed : trot > 2,32, galop > 3,25) : le cheval qu'on voit prend bien
 * l'allure choisie.
 */
export const GAIT_SPEED = { halt: 0, walk: 1.6, trot: 3, canter: 5, gallop: 8 };

/** Énergie dépensée par seconde de monte (négatif : il récupère). */
export const GAIT_COST = { halt: -0.03, walk: -0.01, trot: 0.03, canter: 0.12, gallop: 0.3 };

/** En dessous de cette énergie, il ne veut plus galoper (il reste au trot) ; en dessous de TIRED_WALK, au pas. */
export const CANTER_MIN = 25;
export const TIRED_WALK = 10;

/**
 * Vitesse (m/s) d'une allure pour ce cheval : selon sa taille (un poney va moins vite), et au galop selon sa
 * compétence de vitesse et la selle (à cru, un peu moins vite). Le bonus reste sous le seuil du grand galop.
 * o : { scale, speedSkill (0-100), tack (1 = selle normale, src/sim/gear.js tackEffects), bareback }
 */
export function rideSpeed(gait, { scale = 1, speedSkill = 0, tack = 1, bareback = false } = {}) {
  const base = GAIT_SPEED[gait] ?? 0;
  if (gait !== 'canter' && gait !== 'gallop') return base * scale;
  // (au galop, le bonus reste sous 1,12 : 5,6 m/s, sous le seuil où le cheval réaliste repasserait au grand galop)
  const bonus = Math.min(gait === 'canter' ? 1.12 : 1.3, (1 + speedSkill / 150) * (bareback ? 0.85 : tack));
  return base * scale * bonus;
}

/**
 * L'allure que le cheval accepte : un cheval fatigué ne galope pas (trot), un cheval épuisé ne trotte pas (pas).
 * Renvoie { gait, reason: null | 'tired' | 'exhausted' }.
 */
export function allowedGait(gait, a) {
  const e = a?.needs?.energy ?? 100;
  if (gait === 'halt') return { gait, reason: null };
  if (e < TIRED_WALK && gait !== 'walk') return { gait: 'walk', reason: 'exhausted' };
  if (e < CANTER_MIN && (gait === 'canter' || gait === 'gallop')) return { gait: 'trot', reason: 'tired' };
  return { gait, reason: null };
}

/**
 * dt secondes de monte à cette allure : l'énergie baisse (ou remonte un peu au pas et à l'arrêt) ; au galop, il
 * transpire (pansage) et a soif. trotK : le coût du trot (0,5 quand tu trottes enlevé, src/sim/posting.js).
 */
export function rideEffort(a, gait, dt, trotK = 1) {
  const n = a.needs;
  n.energy = clamp(n.energy - (GAIT_COST[gait] ?? 0) * (gait === 'trot' ? trotK : 1) * dt);
  if (gait === 'canter' || gait === 'gallop') {
    n.grooming = clamp(n.grooming - (gait === 'gallop' ? 0.08 : 0.04) * dt);
    n.thirst = clamp(n.thirst - (gait === 'gallop' ? 0.05 : 0.025) * dt);
  }
}

/** Les allures où un écart peut arriver (le cheval avance assez vite pour être surpris). */
export const SPOOKY = new Set(['trot', 'canter', 'gallop']);

/**
 * Dans combien de secondes de monte le prochain écart ? Un cheval timide en fait plus, un calme moins, et plus il
 * est obéissant (dressage, leçons), moins il en fait ; et plus tu as de Galops (galops : 0 à 3), moins il en fait.
 * rng : nombre au hasard entre 0 et 1.
 */
export function nextSpookIn(a, rng = Math.random, galops = 0) {
  const pers = { shy: 0.55, calm: 1.7, curious: 0.9, playful: 0.85, cuddly: 1.1, stubborn: 1 }[a?.personality] ?? 1;
  const obedience = a?.skills?.obedience ?? 10;
  const trust = 1 + (a?.bond ?? 0) / 100; // (il te fait confiance : il s'effraie moins)
  const rider = 1 + 0.2 * galops; // (tes Galops, src/sim/galops.js : plus d'assurance, il est plus tranquille)
  return (60 + rng() * 120) * pers * (1 + obedience / 80) * trust * rider;
}

/**
 * Le cheval gourmand : au pas sur l'herbe, il finit par baisser la tête pour brouter (et s'arrête). Dans combien de
 * secondes ? Plus vite s'il a faim, s'il est têtu ou joueur ; moins souvent s'il est calme et bien dressé (obéissance).
 * rng : nombre au hasard entre 0 et 1.
 */
export function nextGrazeIn(a, rng = Math.random) {
  const pers = { stubborn: 0.6, playful: 0.8, curious: 0.9, cuddly: 1, shy: 1.1, calm: 1.3 }[a?.personality] ?? 1;
  const hunger = a?.needs?.hunger ?? 80;
  const greed = hunger < 40 ? 0.45 : hunger < 70 ? 0.75 : 1;
  const obedience = a?.skills?.obedience ?? 10;
  return (35 + rng() * 70) * pers * greed * (1 + obedience / 60);
}

/** Les allures dans l'ordre : une de plus ou de moins (touches, joystick). */
export function shiftGait(gait, dir) {
  const i = FREE_GAITS.indexOf(gait);
  return FREE_GAITS[clamp((i < 0 ? 1 : i) + dir, 0, FREE_GAITS.length - 1)];
}
