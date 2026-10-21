// ℹ️ À propos : les crédits des modèles 3D, visibles dans le jeu (en bas de l'aide ❓).
// Les deux chiens sont sous licence CC-BY 4.0 : l'attribution (auteur, titre, lien, licence, modifications) est
// obligatoire, ici comme dans CREDITS.md et public/models/LICENSES/. Le mouton (Microsoft Rocketbox) est sous licence
// MIT : sa notice de copyright et le texte de la licence sont gardés ici et dans les fichiers distribués. Rien ici ne
// dépend du DOM (tests en node).

import { h } from './dom.js';
import { L } from '../i18n.js';

const CC_BY = { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };
const CC0 = { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' };
const MIT = { name: 'MIT', url: 'https://github.com/microsoft/Microsoft-Rocketbox/blob/master/LICENSE.md' };

/** Texte de la licence MIT du mouton (Microsoft Rocketbox) : la notice et ce texte doivent accompagner le jeu. */
export const ROCKETBOX_MIT = `MIT License

Copyright (c) 2020 Microsoft

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

/** Modèles 3D d'autres auteurs : ce qu'ils sont dans le jeu, leur titre, auteur, lien, licence et ce qu'on y a changé. */
export const MODEL_CREDITS = [
  {
    id: 'dog_shiba', file: 'dog_shiba.glb',
    what: { fr: 'Chiens moyens et grands', en: 'Medium and large dogs' },
    title: 'Animated Dog Shiba Inu', author: 'quander',
    url: 'https://sketchfab.com/3d-models/animated-dog-shiba-inu-9abfce885a834399b2c3ccaed51cd474',
    license: CC_BY,
    changes: {
      fr: 'Squelette simplifié et renommé, moustaches retirées, allures, positions et gestes ajoutés, robes recolorées par le jeu, proportions des races, textures WebP et compression meshopt.',
      en: 'Skeleton simplified and renamed, whiskers removed, gaits, postures and gestures added, coats recoloured by the game, breed proportions, WebP textures and meshopt compression.',
    },
  },
  {
    id: 'dog_jack', file: 'dog_jack.glb',
    what: { fr: 'Petits chiens', en: 'Small dogs' },
    title: 'Jack Russell', author: 'FainoDS (doinspire)',
    url: 'https://sketchfab.com/3d-models/jack-russell-45f1bbf15b67488fba6bea6822d8a7c3',
    license: CC_BY,
    changes: {
      fr: 'Pièces du maillage réunies et trous refermés, squelette et poids refaits (oreilles, yeux), allures, positions et gestes ajoutés, robes recolorées par le jeu, proportions des races, textures WebP et compression meshopt.',
      en: 'Mesh parts joined and holes closed, skeleton and weights redone (ears, eyes), gaits, postures and gestures added, coats recoloured by the game, breed proportions, WebP textures and meshopt compression.',
    },
  },
  {
    id: 'sheep_real', file: 'sheep.glb',
    what: { fr: 'Moutons (toutes les races, agneaux)', en: 'Sheep (all breeds, lambs)' },
    title: 'Sheep_White_01 · Microsoft Rocketbox Avatar Library', author: 'Microsoft (Rocketbox Studios, Microsoft Research)',
    url: 'https://github.com/microsoft/Microsoft-Rocketbox',
    license: MIT,
    notice: 'Copyright (c) 2020 Microsoft',
    licenseText: ROCKETBOX_MIT,
    changes: {
      fr: 'Os renommés, poids de la peau refaits (poitrail, cuisse, encolure), toison tondue (cible de forme), cornes et 14 animations ajoutées (allures, brouter, couché, ruminer, dormir, bêler, gambade), races et robes peintes par le jeu, textures WebP et compression meshopt.',
      en: 'Bones renamed, skin weights redone (chest, thigh, neck), shorn fleece (morph target), horns and 14 animations added (gaits, grazing, lying, ruminating, sleeping, bleating, lamb play), breeds and coats painted by the game, WebP textures and meshopt compression.',
    },
  },
  {
    id: 'horse_real', file: 'horse_real.glb',
    what: { fr: 'Chevaux', en: 'Horses' },
    title: 'Realtime Ranchers 3D model pack · Rigged horse', author: 'Lyndon Daniels · ChadM',
    url: 'https://opengameart.org/content/realtime-ranchers-3d-model-pack',
    license: CC0,
    changes: { fr: 'Squelette complété, allures, robes recolorées par le jeu.', en: 'Skeleton completed, gaits, coats recoloured by the game.' },
  },
  {
    id: 'nature', file: 'tree_*.glb, rock_*.glb, bush.glb',
    what: { fr: 'Arbres, rochers, buissons', en: 'Trees, rocks, bushes' },
    title: 'Ultimate Nature Pack', author: 'Quaternius', url: 'https://quaternius.com', license: CC0,
    changes: null,
  },
];

/** Bloc « À propos » (repliable) pour le panneau d'aide. */
export function creditsBlock() {
  const link = (url, text) => h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, text);
  return h('details', { class: 'help-topic credits' },
    h('summary', { class: 'help-title' }, `ℹ️ ${L({ fr: 'À propos : crédits des modèles 3D', en: 'About: 3D model credits' })}`),
    h('p', { class: 'note' }, L({
      fr: 'La ferme à Madichelle utilise ces modèles 3D d\'autres auteurs. Merci à eux !',
      en: 'La ferme à Madichelle uses these 3D models by other authors. Thank you!',
    })),
    h('ul', { class: 'credits-list' }, MODEL_CREDITS.map((c) => h('li', {},
      h('b', {}, L(c.what)), ' — ', link(c.url, `« ${c.title} »`), ` ${L({ fr: 'par', en: 'by' })} ${c.author}, `,
      link(c.license.url, c.license.name), '.',
      c.notice ? h('br') : null,
      c.notice ? h('small', {}, c.notice) : null,
      c.changes ? h('br') : null,
      c.changes ? h('small', {}, `${L({ fr: 'Modifié pour le jeu', en: 'Modified for the game' })} : ${L(c.changes)}`) : null,
      // (licence MIT : son texte accompagne le jeu)
      c.licenseText ? h('details', { class: 'credits-license' },
        h('summary', {}, L({ fr: `Texte de la licence ${c.license.name}`, en: `${c.license.name} license text` })),
        h('pre', {}, c.licenseText)) : null))),
    h('p', { class: 'note' }, L({ fr: 'Moteur 3D : ', en: '3D engine: ' }), link('https://threejs.org', 'three.js'), ' (MIT).'));
}
