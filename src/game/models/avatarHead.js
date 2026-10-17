// Forme de la tête des personnages (champ de distance), à part pour être utilisée aussi par le
// calcul des coiffures dans un worker (hairWorker.js), sans rien d'autre du modèle.

import { ellipsoid, blend } from './sdf.js';

/** Tête : crâne, mâchoire, joues, nez et oreilles fondus. */
export const HEAD_SHAPES = [
  [ellipsoid([0, 0.075, -0.005], [0.122, 0.135, 0.13]), 0],
  [ellipsoid([0, -0.015, 0.03], [0.1, 0.095, 0.1]), 0.05],
  [ellipsoid([0, -0.06, 0.05], [0.055, 0.04, 0.06]), 0.04],
  [ellipsoid([0.06, 0.0, 0.07], [0.04, 0.035, 0.035]), 0.03],
  [ellipsoid([-0.06, 0.0, 0.07], [0.04, 0.035, 0.035]), 0.03],
  [ellipsoid([0, 0.035, 0.122], [0.016, 0.03, 0.022]), 0.02],
  [ellipsoid([0, 0.012, 0.13], [0.02, 0.014, 0.016]), 0.012],
  [ellipsoid([0.122, 0.05, -0.005], [0.014, 0.032, 0.022]), 0.012],
  [ellipsoid([-0.122, 0.05, -0.005], [0.014, 0.032, 0.022]), 0.012],
  [ellipsoid([0.045, 0.1, 0.105], [0.035, 0.012, 0.02]), 0.02],
  [ellipsoid([-0.045, 0.1, 0.105], [0.035, 0.012, 0.02]), 0.02],
];

export const headSdf = blend(HEAD_SHAPES);
