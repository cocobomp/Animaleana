// 🌬️ Son souffle dans le froid : par temps froid (10 °C et moins), on voit la buée sortir de ses naseaux à chaque
// expiration (un cheval respire seulement par le nez), vers le bas et l'avant. Au repos, un souffle toutes les 5 s
// environ (12 par minute, 8 en dormant) ; essoufflé après un galop, presque un par seconde, puis de moins en moins
// pendant le retour au calme au pas. L'air humide (pluie, orage, neige, brouillard) la rend un peu plus visible.
// Un cheval qui a transpiré fume aussi du dos, de moins en moins en séchant.
// Logique pure (tests/breath.test.js) ; la buée en 3D : src/game/HorseBreath.js (rythme et essoufflement :
// src/game/models/horseReal.js overlay, breathPh et effort).

/**
 * warm : au-dessus, rien ; cold : buée bien visible ; humid : en plus par temps humide ; near : distance à la caméra
 * (m) ; max : chevaux suivis à la fois ; pool : bouffées à la fois ; exhaleAt : phase du début de l'expiration ;
 * tip : buée assez visible pour le petit mot de la première fois.
 */
export const BREATH_FX = { warm: 10, cold: 2, humid: 0.2, near: 15, max: 3, pool: 24, exhaleAt: 1.24, tip: 0.35 };

/**
 * La vapeur d'un cheval en sueur : warm → cold (°C), min : en dessous, rien ; toutes les every s, montée, durée, opacité
 * (pleine dès full : un galop de 30 s, 0,3 de sueur, se voit déjà bien).
 */
export const STEAM = { warm: 15, cold: 5, min: 0.15, every: 0.35, rise: 0.25, life: 2, alpha: 0.5, full: 0.5 };

const HUMID = ['rain', 'storm', 'snow', 'fog'];

/** 0 en a, 1 en b, en douceur (a > b : de plus en plus quand la température baisse). */
const smooth = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** La buée de son souffle (0 à 1) à tempC (°C), selon le temps. */
export function breathFog(tempC, weather) {
  if (!(tempC < BREATH_FX.warm)) return 0;
  const wet = HUMID.includes(weather) ? BREATH_FX.humid : 0;
  return Math.min(1, smooth(BREATH_FX.warm, BREATH_FX.cold, tempC) + wet);
}

/**
 * La phase de sa respiration (horseReal.js : breathPh, de 0 à 2π) vient de passer le début de l'expiration ? Les côtes
 * (sin(φ + 0,35 sin φ)) sont au plus haut vers φ = 1,24 : il a fini d'inspirer. (Phase repassée par 0 : cur < prev.)
 */
export function exhaleCrossed(prev, cur, at = BREATH_FX.exhaleAt) {
  if (cur === prev) return false;
  if (cur > prev) return prev < at && cur >= at;
  return prev < at || cur >= at;
}

/** Une bouffée (tailles en m, durée en s, vitesse en m/s, opacité) selon l'essoufflement (0 à 1) et la buée. */
export function puffOf(effort, fog, out = {}) {
  const e = Math.min(1, Math.max(0, effort || 0));
  out.size0 = 0.06;
  out.size1 = 0.28 + 0.2 * e;
  out.life = 1.2 + 0.4 * e;
  out.speed = 0.35 + 0.5 * e;
  out.alpha = (0.7 + 0.2 * e) * fog; // (0,45 se voyait à peine sur un téléphone, même devant sa robe)
  return out;
}

/** La vapeur qui monte de son dos (0 à 1) : sa sueur (0 à 1), plus visible quand il fait froid. */
export function steamOf(sweat, tempC) {
  const s = (sweat ?? 0) * smooth(STEAM.warm, STEAM.cold, tempC);
  return s < STEAM.min ? 0 : s;
}
