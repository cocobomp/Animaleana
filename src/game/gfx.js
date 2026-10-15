// Réglages graphiques partagés par tous les modèles 3D.
// quality : 'high' (ordinateur) ou 'low' (téléphone) — fixé par Game au démarrage.
// time : horloge commune des shaders animés (herbe, eau, fourrure) ; wind : force du vent ;
// wet : sol mouillé après la pluie (0 à 1).

export const gfx = {
  quality: 'high',
  time: { value: 0 },
  wind: { value: 1 },
  wet: { value: 0 },
};

export const isHigh = () => gfx.quality === 'high';
