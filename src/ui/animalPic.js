// Vignette 3D d'un animal du jeu (refuge, fiche, listes : Mes animaux, vétérinaire, activités, concours, beauté,
// voltige, construction, clients) : la même fabrique que l'animalerie (src/game/thumbScenes.js), avec sa race, sa robe,
// son sexe, son âge et sa graine de marques. Module à part, qui n'importe pas le jeu : les écrans des activités ou des
// concours l'importent sans boucle d'imports (en passant par panels.js, qui importe Game.js, TrailGuide.js se chargeait
// avant ActivitySession : « Class extends value undefined »).

import { h } from './dom.js';
import { SPECIES, getBreed } from '../sim/species.js';
import { lifeStage } from '../sim/animal.js';
import { thumb } from '../game/thumbScenes.js';

/**
 * Demande de vignette d'un animal du jeu. null si sa robe n'est pas au catalogue de la race (croisement) : on garde
 * alors l'emoji.
 */
export function animalThumbSpec(a) {
  const breed = getBreed(a.species, a.breed);
  if (!breed?.colors?.length || !a.look) return null;
  const same = (c) => c.coat === a.look.coat && (c.pattern ?? breed.pattern) === a.look.pattern;
  let ci = breed.colors.findIndex((c) => same(c) && (c.secondary ?? null) === (a.look.secondary ?? null));
  if (ci < 0) ci = breed.colors.findIndex(same);
  if (ci < 0) return null;
  const st = lifeStage(a);
  return { kind: 'animal', species: a.species, breed: breed.id, colorIndex: ci, sex: a.sex, stage: st === 'senior' ? 'adult' : st, seed: a.look.seed };
}

/** Élément vignette (ou emoji) d'un animal du jeu, w × h pixels affichés. */
export function animalPic(g, a, w, hh, cls = '') {
  const emoji = SPECIES[a.species].emoji;
  const spec = animalThumbSpec(a);
  if (!spec || !g) return h('span', { class: cls ? `card-emoji ${cls}` : 'card-emoji' }, emoji);
  return thumb(g, spec, { w, h: hh, emoji, cls, alt: a.name ?? '' });
}

/**
 * Vignette d'un animal dans une carte de liste : le vrai animal en 3D, sa race et sa robe (l'emoji en attendant
 * l'image, ou pour une robe hors du catalogue de la race). Avant : l'emoji de l'espèce pour tous, le même 🐴 pour
 * chaque cheval.
 */
export function listPic(g, a) {
  return animalPic(g, a, 64, 48, 'list-thumb');
}
