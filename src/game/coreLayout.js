// Où sont la bergerie, le paddock, la niche et le clapier dans ce lieu (le joueur peut les déplacer
// depuis la vue d'ensemble). Les positions d'origine sont écrites dans le code (World.js, farmLayout.js,
// nav.js, AnimalEntity.js) : ici on garde le décalage de chaque installation, et coreAt() le leur applique.

import { ENCLOSURES } from './nav.js';
import { PEN, HOME } from './AnimalEntity.js';
import { CORE_IDS, coreOffset } from '../sim/construction.js';

const OFF = Object.fromEntries(CORE_IDS.map((id) => [id, { dx: 0, dz: 0 }]));

// Copie des positions d'origine (avant tout déplacement).
const BASE = {
  enclosures: ENCLOSURES.filter((e) => CORE_IDS.includes(e.id)).map((e) => ({ e, x: e.x, z: e.z, at: e.gate.at })),
  pen: { x: PEN.x, z: PEN.z, gx: PEN.gate.x, gz: PEN.gate.z },
  homes: { horse: { ...HOME.horse }, dog: { ...HOME.dog }, rabbit: { ...HOME.rabbit } },
};
const HOME_OF = { horse: 'paddock', dog: 'kennel', rabbit: 'hutch' };

/** Applique les positions choisies pour ce lieu (appelé par Game.loadPlace avant World.build). */
export function applyCoreLayout(layout) {
  for (const id of CORE_IDS) OFF[id] = coreOffset(layout, id);
  for (const b of BASE.enclosures) {
    const o = OFF[b.e.id];
    b.e.x = b.x + o.dx;
    b.e.z = b.z + o.dz;
    b.e.gate.at = b.at + (b.e.gate.side.endsWith('x') ? o.dz : o.dx);
  }
  const p = OFF.pen;
  PEN.x = BASE.pen.x + p.dx;
  PEN.z = BASE.pen.z + p.dz;
  PEN.gate.x = BASE.pen.gx + p.dx;
  PEN.gate.z = BASE.pen.gz + p.dz;
  for (const [sp, id] of Object.entries(HOME_OF)) {
    HOME[sp].x = BASE.homes[sp].x + OFF[id].dx;
    HOME[sp].z = BASE.homes[sp].z + OFF[id].dz;
  }
}

/** Position d'origine (x, z) d'un élément de l'installation id → position actuelle [x, z]. */
export function coreAt(id, x, z) {
  return [x + OFF[id].dx, z + OFF[id].dz];
}

/** Décalage actuel d'une installation. */
export const coreShift = (id) => OFF[id];
