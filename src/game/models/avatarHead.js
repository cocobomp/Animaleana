// Forme de la tête des personnages (champ de distance), à part pour être utilisée aussi par le
// calcul des coiffures dans un worker (hairWorker.js), sans rien d'autre du modèle.

import { ellipsoid, blend } from './sdf.js';

/**
 * Tête : crâne, mâchoire, joues, nez et oreilles fondus. Proportions d'enfant : visage court et rond
 * (menton petit, pas de longue mâchoire), petit nez en bouton, arcades à peine marquées (plus
 * fortes, elles faisaient un pli lourd au-dessus des yeux : air fatigué ou fâché).
 */
export const HEAD_SHAPES = [
  [ellipsoid([0, 0.075, -0.005], [0.122, 0.135, 0.13]), 0],
  [ellipsoid([0, -0.008, 0.028], [0.097, 0.086, 0.098]), 0.05],
  [ellipsoid([0, -0.05, 0.048], [0.05, 0.034, 0.055]), 0.04],
  [ellipsoid([0.06, 0.006, 0.07], [0.042, 0.036, 0.036]), 0.03],
  [ellipsoid([-0.06, 0.006, 0.07], [0.042, 0.036, 0.036]), 0.03],
  [ellipsoid([0, 0.036, 0.118], [0.011, 0.021, 0.016]), 0.02],
  [ellipsoid([0, 0.02, 0.127], [0.017, 0.0125, 0.0135]), 0.012],
  [ellipsoid([0.122, 0.05, -0.005], [0.014, 0.032, 0.022]), 0.012],
  [ellipsoid([-0.122, 0.05, -0.005], [0.014, 0.032, 0.022]), 0.012],
  [ellipsoid([0.045, 0.101, 0.103], [0.03, 0.008, 0.012]), 0.02],
  [ellipsoid([-0.045, 0.101, 0.103], [0.03, 0.008, 0.012]), 0.02],
];

export const headSdf = blend(HEAD_SHAPES);
