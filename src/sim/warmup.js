// 🐢 La détente et le retour au calme, comme au club : on commence une séance au pas (les muscles s'échauffent), et
// on la finit au pas (il reprend son souffle et sèche un peu) avant de descendre. En balade libre, le jeu le
// remarque : trotter ou galoper trop tôt, ou descendre juste après un galop, et il le dit gentiment ; bien fait, le
// cheval est content (et un peu moins fatigué). Logique pure (tests/warmup.test.js) ; le jeu : src/game/Player.js
// (rideStep) et src/game/Game.js (dismount).
//
// La séance (dans le joueur, pas sauvegardée) : { walk (s de pas avant le premier trot), warm (échauffé ?), started
// (déjà trotté ou galopé), hard (s de galop), cool (s de pas depuis le dernier galop) }.

export const WARMUP = {
  walk: 20, // (secondes de pas au début : échauffé)
  hard: 4, // (au moins quelques secondes de galop : il faut un retour au calme)
  cool: 15, // (secondes de pas après le dernier galop : il a récupéré)
  coldEffort: 1.25, // (pas échauffé : l'effort le fatigue un peu plus, src/sim/riding.js rideEffort)
  coolBond: 0.5,
  coolAffection: 6,
};

export const newSession = () => ({ walk: 0, warm: false, started: false, hard: 0, cool: 0 });
/** Encore chaud (minutes de jeu) après un travail : une leçon, une balade, une séance… (src/game/Game.js ride). */
export const WARM_FOR = 60;
/** Une séance qui commence avec un cheval déjà chaud (il vient de travailler). */
export const warmSession = () => ({ ...newSession(), walk: WARMUP.walk, warm: true });

/**
 * Une image de balade à l'allure gait ('halt', 'walk', 'trot', 'canter', 'gallop') pendant dt secondes. Renvoie ce
 * qui vient de se passer : 'cold' (premier trot ou galop sans échauffement), 'warm' (premier trot, bien échauffé) ou
 * null.
 */
export function sessionTick(s, gait, dt) {
  if (gait === 'walk') {
    if (!s.started) {
      s.walk += dt;
      if (s.walk >= WARMUP.walk) s.warm = true;
    }
    if (s.hard > 0) s.cool += dt;
    return null;
  }
  if (gait === 'halt') return null;
  let news = null;
  if (!s.started) {
    s.started = true;
    news = s.warm ? 'warm' : 'cold';
  }
  if (gait === 'canter' || gait === 'gallop') s.hard += dt;
  s.cool = 0; // (trotter ou galoper après le retour au calme : il faut le refaire)
  return news;
}

/** L'effort coûte plus s'il n'est pas échauffé (multiplicateur de fatigue). */
export const effortFactor = (s) => (s && s.started && !s.warm ? WARMUP.coldEffort : 1);

/**
 * On descend : 'cooled' (il a galopé, puis marché assez : bravo), 'hot' (descendu juste après le galop) ou null
 * (pas de galop : rien à dire).
 */
export function dismountVerdict(s) {
  if (!s || s.hard < WARMUP.hard) return null;
  return s.cool >= WARMUP.cool ? 'cooled' : 'hot';
}
