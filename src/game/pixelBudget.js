// Définition de l'image du jeu (pixels par point de l'écran) et anticrénelage, selon la qualité.
//
// Qualité basse (réglage par défaut des téléphones) : sur un écran fin (2 ou 3 pixels par point), l'image était
// rendue à 1,25 pixel par point sans anticrénelage, puis agrandie : contours du cheval, membres et crins en
// escalier, qui scintillent d'une image à l'autre. On garde 1,25 pixel par point, avec l'anticrénelage MSAA (peu
// coûteux sur les processeurs graphiques de téléphone, qui dessinent par tuiles : la netteté vient surtout de lui).
// 1,5 pixel par point avec MSAA, essayé d'abord, coûtait 2 fois l'ancien temps d'image sur SwiftShader (rendu sur
// le processeur, 10 chevaux), 1,25 avec MSAA 1,6 fois : trop pour un téléphone milieu de gamme qu'on n'a pas pu
// mesurer (le reste des changements du cheval : dans le bruit). Si les premières secondes de jeu sont trop lentes,
// on redescend à FALLBACK_RATIO pour la partie en cours (l'anticrénelage, lui, ne peut plus changer : il est
// choisi à la création du contexte WebGL ; à 1 pixel par point avec MSAA, le coût revient à celui de l'ancien
// réglage) et l'appareil est noté lent (SLOW_KEY) : aux parties suivantes, on reprend l'ancien réglage, 1,25
// sans anticrénelage — un téléphone lent ne paie jamais plus que quelques secondes.
// Logique pure (testée dans tests/horseGround.test.js).

/** Définition visée en qualité basse sur un écran fin (avec MSAA), celle d'un appareil lent (sans MSAA, parties
 * suivantes) et celle du repli dans la partie en cours (le contexte garde son MSAA). */
export const SHARP_RATIO = 1.25;
export const SAFE_RATIO = 1.25;
export const FALLBACK_RATIO = 1;
/** Clé du stockage local : cet appareil a été trop lent à 1,5 pixel par point (voir Game). */
export const SLOW_KEY = 'animaleana.pixelSlow';

/**
 * Réglage de départ : { ratio (pixels par point), msaa (anticrénelage), budget (surveiller les premières
 * secondes et redescendre si besoin) }. dpr : pixels par point de l'écran (window.devicePixelRatio) ; slow :
 * appareil déjà trouvé trop lent (SLOW_KEY).
 */
export function renderSetup(quality, dpr = 1, slow = false) {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  if (quality === 'high') return { ratio: Math.min(d, 2), msaa: true, budget: false };
  if (d >= 2 && !slow) return { ratio: SHARP_RATIO, msaa: true, budget: true };
  return { ratio: Math.min(d, SAFE_RATIO), msaa: false, budget: false };
}

/**
 * Surveille le temps d'image des premières secondes de jeu : après warmup s (compilation des shaders, arrivée
 * des modèles), sur span s, la moyenne sans les 10 % d'images les plus lentes (à-coups ponctuels). Au-delà de
 * limitMs, frame() renvoie la définition de repli (une seule fois) ; ensuite, plus rien (done).
 */
export class PixelBudget {
  constructor({ warmup = 2, span = 4, limitMs = 22, fallback = FALLBACK_RATIO } = {}) {
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
