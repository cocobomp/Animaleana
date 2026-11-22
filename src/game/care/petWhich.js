// Les soins des animaux de compagnie (chien, chat, lapin) qui s'ouvrent en 3D (src/game/care/petStage.js), et les
// modèles réalistes qu'il leur faut : un petit module sans le code de la scène, lu par which.js.

import { REAL_DOG_KEYS } from '../models/dogReal.js';
import { REAL_CAT_KEYS } from '../models/catReal.js';
import { REAL_RABBIT_KEYS } from '../models/rabbitReal.js';

/** Soins refaits en 3D, par espèce (les jeux : PET_CARE3D_GAMES de src/ui/minigames/pets3d.js). */
export const PET_CARE3D_ACTIONS = {
  dog: ['feed', 'water', 'treat', 'pet', 'brush', 'nails', 'play'],
  cat: ['feed', 'water', 'treat', 'pet', 'brush', 'nails'],
  rabbit: ['feed', 'water', 'treat', 'pet', 'brush', 'nails', 'play'],
};

/** Modèles réalistes de chaque espèce (tous chargés ensemble par le jeu : Game.js realDogsReady…). */
export const PET_MODEL_KEYS = {
  dog: Object.values(REAL_DOG_KEYS),
  cat: Object.values(REAL_CAT_KEYS),
  rabbit: Object.values(REAL_RABBIT_KEYS),
};
