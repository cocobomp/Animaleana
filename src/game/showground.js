// Terrain de concours : ajouté à chaque lieu par World.build() (carrière, tribune, jury, fanions).
// Sert au saut d'obstacles, à l'agility, aux spectacles et aux concours (src/game/Activities.js).

import { SHOWGROUND, HUTCH_TOYS } from '../sim/activities.js';
import { showgroundModel, hutchToy } from './models/course.js';
import { ENCLOSURES, addBaseEnclosure, fenceColliders, enclosure } from './nav.js';
import { t } from '../i18n.js';

// La carrière a une barrière avec une ouverture : on l'ajoute aux enclos connus de la navigation
// (pour que toucher l'intérieur y emmène par l'entrée). Enclos de base : il doit survivre à
// setBuiltEnclosures(), appelé à chaque chargement de lieu (voyage, construction, changement de langue).
addBaseEnclosure({ id: 'showground', x: SHOWGROUND.x, z: SHOWGROUND.z, hw: SHOWGROUND.hw, hd: SHOWGROUND.hd, gate: SHOWGROUND.gate });

export function buildShowground(world, group) {
  const S = SHOWGROUND;
  const model = showgroundModel(S.hw, S.hd, t('actv_showground'));
  model.position.set(S.x, world.heightAt(S.x, S.z), S.z);
  group.add(model);
  world.showground = model;
  // Barrières (on n'entre que par l'ouverture) et tribune / jury (on ne les traverse pas).
  const fences = fenceColliders(ENCLOSURES.find((e) => e.id === 'showground'));
  world.colliders.push(...fences);
  world.fences = [...(world.fences ?? []), ...fences];
  world.colliders.push(
    { x: S.x - 2, z: S.z + S.hd + 2.6, hw: S.hw * 0.65 + 0.2, hd: 1.4, kind: 'showground' },
    { x: S.x - S.hw - 2.6, z: S.z - 6, hw: 1.2, hd: 1.4, kind: 'showground' },
  );
  world.interactables.push({ kind: 'showground', x: S.x + S.hw + 2.2, z: S.z });
  world.clearZones.push({ x: S.x, z: S.z, r: Math.hypot(S.hw, S.hd) + 6 });
}

/**
 * Jouets dans l'enclos grillagé du clapier (roue, tunnel, balle, plateforme, foin). Appelé avec les
 * installations de base (src/game/farmLayout.js) : ils suivent l'enclos quand on le déplace ou l'agrandit
 * (leurs places s'écartent ou se resserrent avec sa taille, sans sortir du grillage).
 */
export function buildHutchToys(world, group) {
  const hu = enclosure('hutch');
  world.hutchToys = {};
  if (!hu) return;
  const kx = hu.hw / 2.6; // (places prévues pour l'ancien enclos de 5,2 × 4,4 m)
  const kz = hu.hd / 2.2;
  for (const [id, def] of Object.entries(HUTCH_TOYS)) {
    const x = hu.x + Math.max(-hu.hw + 0.5, Math.min(hu.hw - 0.5, def.x * kx));
    const z = hu.z + Math.max(-hu.hd + 0.5, Math.min(hu.hd - 0.5, def.z * kz));
    const toy = hutchToy(id);
    toy.position.set(x, world.heightAt(x, z), z);
    group.add(toy);
    world.hutchToys[id] = { id, x, z, group: toy, part: toy.userData.part };
  }
}
