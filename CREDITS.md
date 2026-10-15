# Crédits des ressources 3D

Animadichelle est un jeu libre et gratuit. Les modèles 3D ci-dessous sont placés dans le domaine
public (CC0 1.0) par leurs auteurs : aucune attribution n'est exigée, mais nous tenons à les remercier.
Les textes de licence sont dans `public/models/LICENSES/`.

| Pack | Auteur | Licence | Fichiers dans `public/models/` |
| --- | --- | --- | --- |
| Farm Animals Animated (2018) | [Quaternius](https://quaternius.com) | CC0 1.0 | `horse.glb` |
| Ultimate Nature Pack | [Quaternius](https://quaternius.com) | CC0 1.0 | `tree_*.glb`, `rock_*.glb`, `bush.glb` |

Conversion : FBX → glTF binaire avec three.js (FBXLoader + GLTFExporter), animations
ré-échantillonnées à 12 images/s, compression `meshopt` via glTF-Transform. Tout le reste
(bâtiments, personnages, autres espèces) est pour l'instant dessiné par le code du jeu.

Le moteur 3D est [three.js](https://threejs.org) (licence MIT).
