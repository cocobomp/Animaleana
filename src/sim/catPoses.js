// Ce que fait un chat au repos : rester debout à regarder, s'asseoir, faire sa toilette, se coucher
// en sphinx… Le choix dépend de son caractère et de sa fatigue. Logique pure (testée dans
// tests/catBreeds.test.js) ; l'animation 3D est dans src/game/catAnim.js.

export const CAT_IDLE_POSES = ['stand', 'sit', 'groom', 'loaf'];

// Durée (secondes) de chaque pose : [minimum, maximum].
const DURATION = { stand: [3, 6], sit: [6, 12], groom: [5, 9], loaf: [10, 18] };

/**
 * Choisit la prochaine pose de repos.
 * personality : caractère de l'animal ; energy : 0–100 ; prev : pose précédente (rarement répétée).
 * Renvoie { pose, duration }.
 */
export function pickIdlePose({ personality = 'calm', energy = 80, prev = null } = {}, rng = Math.random) {
  const w = { stand: 2, sit: 3, groom: 2, loaf: 1.5 };
  if (energy < 50) w.loaf += 2;
  if (energy < 25) w.loaf += 2;
  if (personality === 'calm') { w.loaf += 1; w.sit += 1; }
  if (personality === 'playful' || personality === 'curious') w.stand += 1.5;
  if (personality === 'cuddly') { w.groom += 0.5; w.loaf += 0.5; }
  if (personality === 'shy') w.sit += 1;
  if (prev && w[prev]) w[prev] *= 0.4;
  const total = CAT_IDLE_POSES.reduce((s, p) => s + w[p], 0);
  let r = rng() * total;
  let pose = CAT_IDLE_POSES[CAT_IDLE_POSES.length - 1];
  for (const p of CAT_IDLE_POSES) {
    r -= w[p];
    if (r < 0) {
      pose = p;
      break;
    }
  }
  const [a, b] = DURATION[pose];
  return { pose, duration: a + rng() * (b - a) };
}
