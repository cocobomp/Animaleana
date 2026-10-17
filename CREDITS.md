# Crédits des ressources 3D

La ferme à Madichelle est un jeu libre et gratuit. Les modèles 3D ci-dessous sont placés dans le domaine
public (CC0 1.0) par leurs auteurs : aucune attribution n'est exigée, mais nous tenons à les remercier.
Les textes de licence sont dans `public/models/LICENSES/`.

| Pack | Auteur | Licence | Fichiers dans `public/models/` |
| --- | --- | --- | --- |
| Ultimate Nature Pack | [Quaternius](https://quaternius.com) | CC0 1.0 | `tree_*.glb`, `rock_*.glb`, `bush.glb` |
| Cheval réaliste : modèle et textures (*Realtime Ranchers 3D model pack*) | [Lyndon Daniels](https://opengameart.org/content/realtime-ranchers-3d-model-pack), sur OpenGameArt | CC0 1.0 | `horse_real.glb` |
| Cheval réaliste : squelette (*Rigged horse*) | [ChadM](https://opengameart.org/content/rigged-horse), sur OpenGameArt | CC0 1.0 | `horse_real.glb` |

Conversion : FBX → glTF binaire avec three.js (FBXLoader + GLTFExporter), animations
ré-échantillonnées à 12 images/s, compression `meshopt` via glTF-Transform. Tout le reste
(bâtiments, personnages, autres espèces) est pour l'instant dessiné par le code du jeu.
Le cheval est le modèle réaliste de Lyndon Daniels (squelette de ChadM), complété et animé pour le jeu
(allures, os de paturon, robe recolorée par shader, proportions des 33 races : voir `tools/cheval/LISEZMOI.md`
et `src/game/models/horseReal.js`). Le cheval sculpté par le code (`src/game/models/horseModel.js`) reste le
modèle de repli si le fichier ne se charge pas.

Le moteur 3D est [three.js](https://threejs.org) (licence MIT).
