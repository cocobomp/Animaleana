# Crédits des ressources 3D

La ferme à Madichelle est un jeu libre et gratuit. Les modèles 3D ci-dessous viennent d'autres auteurs : ceux
sous CC0 1.0 sont dans le domaine public (aucune attribution n'est exigée, mais nous tenons à les remercier) ; les
deux chiens sont sous licence **Creative Commons Attribution 4.0 (CC BY 4.0)** : leur attribution ci-dessous est
obligatoire et figure aussi dans le jeu (❓ Aide → ℹ️ À propos) ; le mouton est sous **licence MIT** (© 2020
Microsoft) : sa notice de copyright et le texte de la licence (ci-dessous) accompagnent le jeu, ici, dans
`public/models/LICENSES/` et dans l'écran À propos. Les textes de licence sont dans `public/models/LICENSES/`.

| Pack | Auteur | Licence | Fichiers dans `public/models/` |
| --- | --- | --- | --- |
| Ultimate Nature Pack | [Quaternius](https://quaternius.com) | CC0 1.0 | `tree_*.glb`, `rock_*.glb`, `bush.glb` |
| Cheval réaliste : modèle et textures (*Realtime Ranchers 3D model pack*) | [Lyndon Daniels](https://opengameart.org/content/realtime-ranchers-3d-model-pack), sur OpenGameArt | CC0 1.0 | `horse_real.glb` |
| Cheval réaliste : squelette (*Rigged horse*) | [ChadM](https://opengameart.org/content/rigged-horse), sur OpenGameArt | CC0 1.0 | `horse_real.glb` |
| Chiens moyens et grands : *Animated Dog Shiba Inu* | [quander](https://sketchfab.com/3d-models/animated-dog-shiba-inu-9abfce885a834399b2c3ccaed51cd474), sur Sketchfab | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `dog_shiba.glb` |
| Petits chiens : *Jack Russell* | [FainoDS (doinspire)](https://sketchfab.com/3d-models/jack-russell-45f1bbf15b67488fba6bea6822d8a7c3), sur Sketchfab | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `dog_jack.glb` |
| Moutons (7 races, agneaux) : *Sheep_White_01* de la Microsoft Rocketbox Avatar Library | [Microsoft](https://github.com/microsoft/Microsoft-Rocketbox) (Rocketbox Studios, Microsoft Research), © 2020 Microsoft | [MIT](https://github.com/microsoft/Microsoft-Rocketbox/blob/master/LICENSE.md) | `sheep.glb` |

Conversion : FBX → glTF binaire avec three.js (FBXLoader + GLTFExporter), animations
ré-échantillonnées à 12 images/s, compression `meshopt` via glTF-Transform. Tout le reste
(bâtiments, personnages, autres espèces) est pour l'instant dessiné par le code du jeu.
Le cheval est le modèle réaliste de Lyndon Daniels (squelette de ChadM), complété et animé pour le jeu
(allures, os de paturon, robe recolorée par shader, proportions des 33 races : voir `tools/cheval/LISEZMOI.md`
et `src/game/models/horseReal.js`). Le cheval sculpté par le code (`src/game/models/horseModel.js`) reste le
modèle de repli si le fichier ne se charge pas.

### Les chiens (CC BY 4.0)

- « Animated Dog Shiba Inu » par **quander**, https://sketchfab.com/3d-models/animated-dog-shiba-inu-9abfce885a834399b2c3ccaed51cd474,
  sous licence CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). **Modifié** : os de détail fusionnés et
  renommés, paupières attachées aux yeux, moustaches retirées, animations d'origine reprises (immobile, assis, patte,
  roulade) et animations ajoutées (pas, trot, galop, couché, endormi, renifler, manger, boire, révérence, saut,
  transitions), pieds recalés au sol, robe recolorée par shader, proportions des races par déformation, textures
  WebP, compression meshopt, version allégée pour le lointain. Fichier : `dog_shiba.glb`, chiens moyens et grands.
- « Jack Russell » par **FainoDS (doinspire)**, https://sketchfab.com/3d-models/jack-russell-45f1bbf15b67488fba6bea6822d8a7c3,
  sous licence CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). **Modifié** : pièces du maillage réunies et
  soudées (trous et déchirures du museau refermés), squelette et poids refaits (oreilles, yeux), animations d'origine
  reprises et animations ajoutées (allures, positions, gestes), pieds recalés au sol, robe recolorée par shader,
  proportions des races par déformation, textures WebP, compression meshopt, version allégée pour le lointain.
  Fichier : `dog_jack.glb`, petits chiens.

Ces modifications sont faites par les scripts de `tools/chien/` (voir `tools/chien/LISEZMOI.md`) et, en jeu, par
`src/game/models/dogReal.js` (races, robes, animations). Le chien sculpté par le code reste le modèle de repli
pendant le chargement ou si les fichiers ne se chargent pas.

### Le mouton (MIT)

- « Sheep_White_01 », **Microsoft Rocketbox Avatar Library**, https://github.com/microsoft/Microsoft-Rocketbox
  (`Assets/Animals/Sheep_White_01`, commit `0943055`), Copyright (c) 2020 Microsoft, licence MIT. **Modifié** : os
  renommés (racine ajoutée, omoplates rattachées au poitrail), poids de la peau refaits autour du coude, du grasset et
  de la base de l'encolure (plus de peau du poitrail étirée en rideau ni de cuisse étirée au galop), carte de normales
  convertie, cible de forme « shorn » (toison tondue) et masques de la robe, cornes de bélier en option, 14
  animations créées (le modèle n'en avait aucune : allures, brouter, manger, bêler, se coucher et se relever en
  ruminant, couché, ruminer, dormir, saut, gambade de l'agneau ; aucun os étiré, sabots jamais sous le sol),
  textures WebP, compression meshopt, version allégée pour le lointain. Fichier : `sheep.glb`, toutes les races et
  les agneaux.

Ces modifications sont faites par les scripts de `tools/mouton/` (voir `tools/mouton/LISEZMOI.md`) et, en jeu, par
`src/game/models/sheepReal.js` et `sheepCoat.js` (races, robes, toison qui suit la tonte, animations). Le mouton
sculpté par le code reste le modèle de repli pendant le chargement ou si le fichier ne se charge pas.

Texte de la licence du mouton :

```
MIT License

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
SOFTWARE.
```

Le moteur 3D est [three.js](https://threejs.org) (licence MIT).
