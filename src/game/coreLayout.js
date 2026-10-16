// Où sont, et quelle taille ont, la bergerie, le paddock, la niche et le clapier dans ce lieu : le joueur
// peut les déplacer et agrandir les enclos (vue construction). La place et la taille de chacun viennent
// de src/sim/construction.js (coreRect) ; applyCoreLayout() les recopie dans les enclos de la navigation
// (nav.js) et dans les zones de vie des animaux (AnimalEntity.js), et coreAt() donne le décalage d'un
// élément par rapport à la place d'origine (niche…). Appelé avant World.build et avant rebuildCores.

import { ENCLOSURES } from './nav.js';
import { PEN, HOME } from './AnimalEntity.js';
import { CORE_IDS, coreOffset, coreRect } from '../sim/construction.js';

const OFF = Object.fromEntries(CORE_IDS.map((id) => [id, { dx: 0, dz: 0 }]));
const RECT = Object.fromEntries(CORE_IDS.map((id) => [id, coreRect(null, id)]));
// Où se tiennent les chiens par rapport à la niche.
const DOG_FROM_KENNEL = { x: 1, z: 2 };

/** Applique les places et tailles choisies pour ce lieu (layout : profile.coreLayout[lieu]). */
export function applyCoreLayout(layout) {
  for (const id of CORE_IDS) {
    OFF[id] = coreOffset(layout, id);
    RECT[id] = coreRect(layout, id);
  }
  for (const e of ENCLOSURES) {
    const r = RECT[e.id];
    if (!r || e.built || e.interior) continue;
    e.x = r.x;
    e.z = r.z;
    e.hw = r.hw;
    e.hd = r.hd;
    // La porte reste au milieu de son côté.
    e.gate.at = e.gate.side.endsWith('x') ? r.z : r.x;
  }
  // Bergerie : centre, devant de la porte et zone de vie (tout l'enclos, sauf le bord).
  const pen = RECT.pen;
  Object.assign(PEN, { x: pen.x, z: pen.z, hw: Math.max(1, pen.hw - 1.5), hd: Math.max(1, pen.hd - 1.5), r: Math.max(3, Math.min(pen.hw, pen.hd) - 2) });
  PEN.gate.x = pen.x;
  PEN.gate.z = pen.z + pen.hd + 4;
  // Chevaux : tout le paddock.
  const pad = RECT.paddock;
  Object.assign(HOME.horse, { x: pad.x, z: pad.z, hw: Math.max(1, pad.hw - 2), hd: Math.max(1, pad.hd - 2), r: Math.max(3, Math.min(pad.hw, pad.hd) - 2) });
  // Lapins : leur enclos grillagé (le clapier est au fond).
  const hu = RECT.hutch;
  Object.assign(HOME.rabbit, { x: hu.x, z: hu.z + 0.2, hw: Math.max(0.6, hu.hw - 0.8), hd: Math.max(0.6, hu.hd - 1), r: Math.max(1, Math.min(hu.hw, hu.hd) - 0.9) });
  const k = RECT.kennel;
  HOME.dog.x = k.x + DOG_FROM_KENNEL.x;
  HOME.dog.z = k.z + DOG_FROM_KENNEL.z;
}

/** Position d'origine (x, z) d'un élément de l'installation id → position actuelle [x, z] (même décalage). */
export function coreAt(id, x, z) {
  return [x + OFF[id].dx, z + OFF[id].dz];
}

/** Décalage actuel d'une installation. */
export const coreShift = (id) => OFF[id];

/** Rectangle actuel d'une installation { x, z, hw, hd }. */
export const coreRectNow = (id) => RECT[id];
