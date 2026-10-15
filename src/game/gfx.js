// Réglages graphiques partagés par tous les modèles 3D.
// quality : 'high' (ordinateur) ou 'low' (téléphone) — fixé par Game au démarrage.
// time : horloge commune des shaders animés (herbe, eau, fourrure).

export const gfx = {
  quality: 'high',
  time: { value: 0 },
  wind: { value: 1 },
};

export const isHigh = () => gfx.quality === 'high';
