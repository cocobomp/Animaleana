// Les soins du cheval refaits en 3D par le chantier « chevalplus » (branchés dans CARE3D_GAMES, care3d.js) : seller,
// brider, vermifuge, maréchal-ferrant, curer le box. Chacun garde la règle et la note de son jeu dessiné.

import { saddle3dGame } from './saddle3d.js';
import { bridle3dGame } from './bridle3d.js';
import { deworm3dGame } from './deworm3d.js';
import { shoe3dGame } from './shoe3d.js';
import { clean3dGame } from './floor3d.js';

export const HORSE_PLUS_GAMES = { saddle: saddle3dGame, bridle: bridle3dGame, deworm: deworm3dGame, shoe: shoe3dGame, clean: clean3dGame };
