// Réglages graphiques partagés par tous les modèles 3D.
// quality : 'high' (ordinateur) ou 'low' (téléphone) — fixé par Game au démarrage.
// time : horloge commune des shaders animés (herbe, eau, fourrure) ; wind : force du vent ;
// wet : sol mouillé après la pluie (0 à 1).
// texScale : taille des textures peintes du pelage (1 en jeu ; 0,5 pour les vignettes 3D, voir withTexScale).
// msaa : le rendu du jeu a l'anticrénelage (Game : qualité haute, ou basse sur un écran fin) — les crins
// adoucissent alors leurs bords (alphaToCoverage) au lieu de marches d'escalier.
// skyRim, horseFill : lumière du ciel pour le satiné et le liseré de la robe des chevaux (horseCoat.js), et
// petit éclairage d'appoint du soir et de la nuit (0 à midi) ; mis à jour par World.updateSky.

export const gfx = {
  quality: 'high',
  time: { value: 0 },
  wind: { value: 1 },
  wet: { value: 0 },
  texScale: 1,
  msaa: false,
  skyRim: { value: [0.28, 0.36, 0.5] },
  horseFill: { value: 0 },
};

/**
 * Fabrique pendant fn() avec des pelages peints plus petits (×s) : les vignettes 3D (≈ 200 px) n'ont pas
 * besoin de la finesse du jeu, et peindre un pelage est le plus long de la fabrication d'un chat ou d'un chien.
 */
export function withTexScale(s, fn) {
  const was = gfx.texScale;
  gfx.texScale = s;
  try {
    return fn();
  } finally {
    gfx.texScale = was;
  }
}

/** Côté d'une texture peinte : base × texScale (puissance de deux, au moins 32 px). */
export const texSize = (base) => Math.max(32, Math.round(base * gfx.texScale));

export const isHigh = () => gfx.quality === 'high';
