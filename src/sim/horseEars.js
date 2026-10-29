// 👂 Les oreilles du cheval : ce qu'elles disent de lui (et ce qu'on apprend au Galop 1).
//   en avant : il est attentif, curieux (et quand tu t'approches, il les pointe vers toi) ;
//   sur le côté : il somnole, il est fatigué ;
//   couchées en arrière : il n'est pas content — il a mal (il boite, il est malade) ou il est grognon.
//   (La faim et la soif ne les couchent pas : il guette son repas, les oreilles pointées vers toi ou vers l'eau.)
// Logique pure (tests/horseEars.test.js) ; le cheval en 3D : src/game/models/horseReal.js (st.ears), sa fiche :
// src/ui/panels.js.

/** Les seuils (besoins de 0 à 100) sous lesquels il couche les oreilles ou les laisse tomber sur le côté. */
export const EARS = { hungry: 20, thirsty: 20, tired: 25, grumpy: 30 };

/**
 * Ses oreilles maintenant : { pose: 'forward' | 'side' | 'back', why } (why : 'curious', 'sleepy', 'tired', 'pain',
 * 'hunger', 'thirst', 'grumpy'). null si ce n'est pas un cheval. happy : son bonheur (0 à 100, src/sim/animal.js).
 */
export function earsOf(a, { sleeping = false, happy = 60 } = {}) {
  if (a?.species !== 'horse') return null;
  if (sleeping) return { pose: 'side', why: 'sleepy' };
  if (a.sick || a.lame) return { pose: 'back', why: 'pain' };
  const n = a.needs ?? {};
  if ((n.hunger ?? 100) < EARS.hungry) return { pose: 'forward', why: 'hunger' };
  if ((n.thirst ?? 100) < EARS.thirsty) return { pose: 'forward', why: 'thirst' };
  if ((n.energy ?? 100) < EARS.tired) return { pose: 'side', why: 'tired' };
  if (happy < EARS.grumpy) return { pose: 'back', why: 'grumpy' };
  return { pose: 'forward', why: 'curious' };
}
