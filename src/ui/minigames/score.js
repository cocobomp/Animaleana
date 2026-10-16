// « Juste ce qu'il faut » : la règle de score commune à tous les mini-jeux.
//
// Dans chaque mini-jeu, il y a une quantité idéale (nourriture versée, temps de brossage,
// coups de marteau, paille étalée…). Si l'enfant tombe dans la zone juste [lo, hi], il a
// tous les points (qualité 1 : trois étoiles). S'il fait un peu moins OU un peu trop, il
// perd des points progressivement, de la même façon des deux côtés, jusqu'à un plancher
// (0,4 : une étoile, parce qu'il a quand même fini). Pas de couperet : jamais de chute
// brutale d'un côté ou de l'autre.
//
// Ce module est pur (pas de DOM) : il est testé dans tests/score.test.js.

/** Plancher par défaut : la qualité la plus basse quand l'enfant a fini quand même. */
export const JUST_FLOOR = 0.4;

/**
 * Qualité (plancher à 1) d'une valeur par rapport à la zone juste [lo, hi].
 * - 1 si lo ≤ value ≤ hi ;
 * - décroît linéairement jusqu'au plancher (opts.floor ?? 0,4) quand value atteint
 *   lo − slack ou hi + slack ;
 * - plancher au-delà.
 * slack = opts.slack ?? (hi − lo), mais jamais 0 : au minimum 0,15 × hi, pour qu'une zone
 * très étroite (ou réduite à un point) laisse quand même une pente douce.
 */
export function justRight(value, lo, hi, opts = {}) {
  const floor = clamp01(opts.floor ?? JUST_FLOOR);
  if (lo > hi) [lo, hi] = [hi, lo];
  if (!Number.isFinite(value)) return floor;
  if (value >= lo && value <= hi) return 1;
  const slack = Math.max(opts.slack ?? (hi - lo), 0.15 * Math.abs(hi));
  if (!(slack > 0)) return floor; // zone [0, 0] sans mou possible : tout ce qui sort est au plancher
  const dist = value < lo ? lo - value : value - hi;
  const k = Math.min(1, dist / slack); // 0 au bord de la zone, 1 à slack de distance
  return floor + (1 - floor) * (1 - k);
}

/** 'just' si la valeur est dans la zone, 'low' en dessous, 'high' au-dessus. */
export function verdict(value, lo, hi) {
  if (lo > hi) [lo, hi] = [hi, lo];
  if (value < lo) return 'low';
  if (value > hi) return 'high';
  return 'just';
}

/** Zone juste autour d'une cible : ± pct (12 % par défaut) de la cible. */
export function zoneAround(target, pct = 0.12) {
  const d = Math.abs(target) * pct;
  return { lo: target - d, hi: target + d };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
