// Quels soins s'ouvrent en 3D, et quand on peut ouvrir la scène (src/game/care/stage.js) : un petit module sans
// le code de la scène. (Le code des soins 3D reste dans le paquet du jeu : en morceau à part, chargé à la demande,
// il ne marchait plus dans la version « à emporter », un seul fichier HTML ouvert depuis le disque ; il pèse 33 Ko
// compressé, 2 % du jeu.)

import { getModel } from '../assets.js';
import { REAL_HORSE_KEY } from '../models/horseReal.js';

/** Réglage par l'adresse ou le stockage local : ?care3d=off (toujours le mini-jeu dessiné, pour tester le repli). */
export function care3dSetting(search = null, storage = null) {
  try {
    const q = new URLSearchParams(search ?? (typeof location !== 'undefined' ? location.search : '')).get('care3d');
    if (q) return q;
    const st = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    return st?.getItem?.('care3d') ?? '';
  } catch {
    return '';
  }
}

/** Espèces qui ont déjà leur scène de soin en 3D (les autres gardent le mini-jeu dessiné). */
export const CARE3D_SPECIES = new Set(['horse']);

/** Soins refaits en 3D, par espèce (les jeux eux-mêmes : CARE3D_GAMES de src/ui/minigames/care3d.js). */
export const CARE3D_ACTIONS = { horse: ['feed', 'water', 'treat', 'pet', 'brush', 'wash'] };
// (seller, brider, vermifuge, maréchal, curer le box : chantier « chevalplus », src/ui/minigames/saddle3d.js…)
CARE3D_ACTIONS.horse.push('saddle', 'bridle', 'deworm');

/** Ce soin a-t-il un jeu 3D pour cette espèce ? */
export const care3dWanted = (a, action) => !!CARE3D_ACTIONS[a?.species]?.includes(action);

/**
 * Peut-on ouvrir la scène 3D pour cet animal ? L'espèce a sa scène, son modèle réaliste est chargé (sinon le
 * mini-jeu dessiné, plutôt qu'un cheval sculpté), le réglage ne l'interdit pas.
 * has : (clé du modèle) → chargé ? (getModel en jeu ; injecté par les tests).
 */
export function care3dPossible(a, { setting = '', has = (k) => !!getModel(k) } = {}) {
  if (!a || setting === 'off') return false;
  if (!CARE3D_SPECIES.has(a.species)) return false;
  if (a.species === 'horse') return has(REAL_HORSE_KEY);
  return false;
}
