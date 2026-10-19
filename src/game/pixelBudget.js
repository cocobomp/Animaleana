// Définition de l'image du jeu (pixels par point de l'écran) et anticrénelage, selon la qualité.
//
// Qualité basse (réglage par défaut des téléphones) : sur un écran fin (2 ou 3 pixels par point), l'image était
// rendue à 1,25 pixel par point sans anticrénelage, puis agrandie : contours du cheval, membres et crins en
// escalier, qui scintillent d'une image à l'autre. On vise 1,5 pixel par point avec l'anticrénelage MSAA (peu
// coûteux sur les processeurs graphiques de téléphone, qui dessinent par tuiles). Si les premières secondes de
// jeu sont trop lentes, on redescend à 1,25 (l'anticrénelage, lui, ne peut plus changer : il est choisi à la
// création du contexte WebGL). Logique pure (testée dans tests/pixelBudget.test.js).

/** Définition visée en qualité basse sur un écran fin, et celle de repli. */
export const SHARP_RATIO = 1.5;
export const SAFE_RATIO = 1.25;

/**
 * Réglage de départ : { ratio (pixels par point), msaa (anticrénelage), budget (surveiller les premières
 * secondes et redescendre si besoin) }. dpr : pixels par point de l'écran (window.devicePixelRatio).
 */
export function renderSetup(quality, dpr = 1) {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  if (quality === 'high') return { ratio: Math.min(d, 2), msaa: true, budget: false };
  if (d >= 2) return { ratio: SHARP_RATIO, msaa: true, budget: true };
  return { ratio: Math.min(d, SAFE_RATIO), msaa: false, budget: false };
}

/**
 * Surveille le temps d'image des premières secondes de jeu : après warmup s (compilation des shaders, arrivée
 * des modèles), sur span s, la moyenne sans les 10 % d'images les plus lentes (à-coups ponctuels). Au-delà de
 * limitMs, frame() renvoie la définition de repli (une seule fois) ; ensuite, plus rien (done).
 */
export class PixelBudget {
  constructor({ warmup = 2, span = 4, limitMs = 22, fallback = SAFE_RATIO } = {}) {
    this.warmup = warmup;
    this.span = span;
    this.limitMs = limitMs;
    this.fallback = fallback;
    this.elapsed = 0;
    this.samples = [];
    this.done = false;
    this.meanMs = null;
  }

  /** Une image du jeu (dt en s, ratio : définition actuelle). Renvoie la nouvelle définition, ou null. */
  frame(dt, ratio) {
    if (this.done || !(dt > 0)) return null;
    this.elapsed += dt;
    if (this.elapsed <= this.warmup) return null;
    this.samples.push(dt * 1000);
    if (this.elapsed < this.warmup + this.span) return null;
    this.done = true;
    const s = this.samples.slice().sort((a, b) => a - b);
    const keep = s.slice(0, Math.max(1, Math.ceil(s.length * 0.9)));
    this.meanMs = keep.reduce((a, b) => a + b, 0) / keep.length;
    return this.meanMs > this.limitMs && ratio > this.fallback ? this.fallback : null;
  }
}
