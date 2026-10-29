// 📣 Appeler ton cheval : au pré, il lève la tête, hennit… et s'il te fait assez confiance (le lien), il vient vers
// toi au trot. Plus votre lien est fort, plus il vient ; s'il a faim, il espère un peu de foin et vient plus volontiers.
// Il ne vient pas s'il dort, s'il a mal (il boite, il est malade) ou s'il est dans son box (il te répond de là).
// Logique pure (tests/horseCall.test.js) ; le jeu : src/game/Game.js (callHorse), src/game/AnimalEntity.js (comeTo).

export const CALL = {
  base: 0.15, // (un cheval qui ne te connaît pas encore vient rarement)
  perBond: 1 / 60, // (lien 51 et plus : il vient toujours)
  hungry: 0.2, // (il a faim : il espère du foin)
  hungryAt: 45,
  near: 5, // (plus près, pas besoin de l'appeler : il est là)
  bondGain: 1, // (il est venu : le lien grandit un peu…)
  bondPerDay: 3, // (… trois fois par jour au plus)
};

/** La chance qu'il vienne quand tu l'appelles (0 à 1). */
export function callChance(a) {
  const hungry = (a.needs?.hunger ?? 100) < CALL.hungryAt ? CALL.hungry : 0;
  return Math.max(0, Math.min(1, CALL.base + (a.bond ?? 0) * CALL.perBond + hungry));
}

/**
 * Tu l'appelles d'une distance dist (mètres). Renvoie la réponse : 'come' (il vient au trot), 'look' (il lève la
 * tête et te regarde, mais reste là), 'near' (il est juste à côté), 'sleep', 'pain' (il boite ou il est malade),
 * 'box' (il est au box : il hennit pour te répondre).
 */
export function answerCall(a, { dist = 20, sleeping = false, rng = Math.random } = {}) {
  if (dist < CALL.near) return 'near';
  if (sleeping) return 'sleep';
  if (a.sick || a.lame) return 'pain';
  if (a.stalled) return 'box';
  return rng() < callChance(a) ? 'come' : 'look';
}

/** Il est venu : le lien grandit un peu (bondPerDay fois par jour au plus). Renvoie true si le lien a grandi. */
export function cameWhenCalled(a, day) {
  if (!a.calls || a.calls.day !== day) a.calls = { day, n: 0 };
  if (a.calls.n >= CALL.bondPerDay) return false;
  a.calls.n++;
  a.bond = Math.min(100, (a.bond ?? 0) + CALL.bondGain);
  return true;
}
