# Crédits des ressources 3D

La ferme à Madichelle est un jeu libre et gratuit. Les modèles 3D ci-dessous viennent d'autres auteurs : ceux
sous CC0 1.0 sont dans le domaine public (aucune attribution n'est exigée, mais nous tenons à les remercier) ; les
chiens, les chats et les lapins sont sous licence **Creative Commons Attribution 4.0 (CC BY 4.0)** : leur attribution ci-dessous est
obligatoire et figure aussi dans le jeu (❓ Aide → ℹ️ À propos). Les textes de licence sont dans
`public/models/LICENSES/`.

| Pack | Auteur | Licence | Fichiers dans `public/models/` |
| --- | --- | --- | --- |
| Ultimate Nature Pack | [Quaternius](https://quaternius.com) | CC0 1.0 | `tree_*.glb`, `rock_*.glb`, `bush.glb` |
| Cheval réaliste : modèle et textures (*Realtime Ranchers 3D model pack*) | [Lyndon Daniels](https://opengameart.org/content/realtime-ranchers-3d-model-pack), sur OpenGameArt | CC0 1.0 | `horse_real.glb` |
| Cheval réaliste : squelette (*Rigged horse*) | [ChadM](https://opengameart.org/content/rigged-horse), sur OpenGameArt | CC0 1.0 | `horse_real.glb` |
| Chiens moyens et grands : *Animated Dog Shiba Inu* | [quander](https://sketchfab.com/3d-models/animated-dog-shiba-inu-9abfce885a834399b2c3ccaed51cd474), sur Sketchfab | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `dog_shiba.glb` |
| Petits chiens : *Jack Russell* | [FainoDS (doinspire)](https://sketchfab.com/3d-models/jack-russell-45f1bbf15b67488fba6bea6822d8a7c3), sur Sketchfab | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `dog_jack.glb` |
| Chats adultes : *Cat game asset* | [Claire (claireanne3d)](https://sketchfab.com/3d-models/cat-game-asset-7a0c1a65e18747799af9fe9481f1bdb2), sur Sketchfab | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `cat_adult.glb` |
| Chatons : *Kitten* | [FainoDS (doinspire)](https://sketchfab.com/3d-models/kitten-4ae3704cd65b423ab994545988d4db1a), sur Sketchfab | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `cat_kitten.glb` |
| Lapins : *Rabbit* | [Dakota.Hinkle](https://sketchfab.com/3d-models/rabbit-073eef14ae3c4d06808498c3ba895e67), sur Sketchfab | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `rabbit.glb` |
| Lapins béliers : *Rabbit Rigged* | [FourthGreen](https://sketchfab.com/3d-models/rabbit-rigged-e7213589744d436b9d96e2dbb31198a5), sur Sketchfab | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `rabbit_lop.glb` |
| Lapins : course et saut d'artiste (gabarits, *Rabbit*) | [CDmir (Čestmír Dammer)](https://opengameart.org/content/rabbit-0), sur OpenGameArt | CC0 1.0 | `rabbit.glb`, `rabbit_lop.glb` (mouvements) |

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

### Les chats (CC BY 4.0)

- « Cat game asset » par **Claire (claireanne3d)**, https://sketchfab.com/3d-models/cat-game-asset-7a0c1a65e18747799af9fe9481f1bdb2,
  sous licence CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). **Modifié** : mis à l'échelle, pièces
  réunies, squelette et poids faits pour le jeu (oreilles, yeux, queue, os correcteurs des hanches pour la position
  assise), animations calculées et ajoutées (pas, trot, galop, équilibre, assis, couché, en boule, toilette,
  étirement, manger, queue dressée, « tape-m'en cinq », saut, transitions), pieds recalés au sol, robe recolorée par
  shader, proportions et pelages des 15 races par déformation, textures WebP, compression meshopt, version allégée
  pour le lointain. Fichier : `cat_adult.glb`, chats adultes de toutes les races.
- « Kitten » par **FainoDS (doinspire)**, https://sketchfab.com/3d-models/kitten-4ae3704cd65b423ab994545988d4db1a,
  sous licence CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). **Modifié** : mêmes traitements (squelette,
  poids, animations, robe, races adoucies, textures, compression, version allégée). Fichier : `cat_kitten.glb`,
  chatons (le chaton grandit et prend le modèle adulte en devenant jeune).

Ces modifications sont faites par les scripts de `tools/chat/` (voir `tools/chat/LISEZMOI.md`) et, en jeu, par
`src/game/models/catReal.js` et `catCoat.js` (races, robes, poses). Le chat sculpté par le code
(`src/game/models/catModel.js`) reste le modèle de repli pendant le chargement ou si les fichiers ne se chargent pas.

### Les lapins (CC BY 4.0)

- « Rabbit » par **Dakota.Hinkle**, https://sketchfab.com/3d-models/rabbit-073eef14ae3c4d06808498c3ba895e67,
  sous licence CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). **Modifié** : mis à l'échelle, os renommés,
  animations calculées et ajoutées (accroupi, sautillement lent, petit galop, course en bonds, saut, assis, debout sur
  les pattes arrière, couché étalé, en boule, toilette, renifler, manger, binky, tapi, porté dans les bras,
  transitions), pattes jamais étirées (cinématique inverse bornée, aucune translation d'os sauf la racine), pieds posés
  tenus sur place, corps recalé au-dessus du sol, robe recolorée par shader, proportions et poils des races par
  déformation et cartes de poils (angora, crinière du tête de lion), textures WebP, compression meshopt, version
  allégée pour le lointain. Fichier : `rabbit.glb`, lapins de toutes les races sauf le bélier (et leurs lapereaux).
- « Rabbit Rigged » par **FourthGreen**, https://sketchfab.com/3d-models/rabbit-rigged-e7213589744d436b9d96e2dbb31198a5,
  sous licence CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). **Modifié** : mêmes traitements (os de bout
  sans poids retirés, clip d'origine remplacé). Fichier : `rabbit_lop.glb`, lapins béliers (oreilles tombantes).
- La course en bonds et le saut des deux lapins sont rejoués d'après les clips « Running » et « Jump » du lapin de
  **CDmir (Čestmír Dammer)**, « Rabbit », https://opengameart.org/content/rabbit-0 (CC0 1.0 : attribution non exigée,
  par courtoisie) ; gabarits relevés dans `tools/lapin/templates/`.

Ces modifications sont faites par les scripts de `tools/lapin/` (voir `tools/lapin/LISEZMOI.md`) et, en jeu, par
`src/game/models/rabbitReal.js` et `rabbitCoat.js` (races, robes, poses). Le lapin sculpté par le code
(`src/game/models/animalModel.js`) reste le modèle de repli pendant le chargement ou si les fichiers ne se chargent pas.

## Page « Choisis ton chat et ton lapin » (`chats-lapins.html`, hors du jeu)

Page de comparaison des chats et des lapins (`src/compare/chatsLapins.js`). Ses modèles sont dans
`public/compare-chats-lapins/` : ils ne font pas partie du jeu (ni du service worker, ni de la version à
emporter) et ne sont pas publiés avec lui (le build les retire de `dist/` ; `COMPARE=1 npx vite build` les garde). Textes de licence, réponses de l'API publique de Sketchfab (licence vérifiée le 20/10/2026) et
métadonnées d'origine (instantané Objaverse, pages OpenGameArt) dans `public/compare-chats-lapins/LICENSES/`.
Les modèles sous **CC-BY 4.0** demandent la mention ci-dessous s'ils entrent dans le jeu (écran des crédits).

| Fichier | Modèle d'origine | Auteur | Source | Licence | Modifications |
| --- | --- | --- | --- | --- | --- |
| `claire_grey.glb` | « Cat game asset » (2019) | Claire (claireanne3d) | [Sketchfab](https://sketchfab.com/3d-models/cat-game-asset-7a0c1a65e18747799af9fe9481f1bdb2) (fichier : Objaverse) | CC-BY 4.0 | mis à l'échelle, squelette, poids et animations ajoutés |
| `lily_tuxedo.glb` | « My Cat Modeled » (2020) | lilyjoyhanna | [Sketchfab](https://sketchfab.com/3d-models/my-cat-modeled-28d33c1592e14d8b895d36a1e0dfaa5d) (fichier : Objaverse) | CC-BY 4.0 | pièces réunies, squelette, poids et animations ajoutés |
| `faino_kitten.glb` | « Kitten » (2018) | FainoDS (doinspire) | [Sketchfab](https://sketchfab.com/3d-models/kitten-4ae3704cd65b423ab994545988d4db1a) (fichier : Objaverse) | CC-BY 4.0 | pièces réunies, squelette, poids et animations ajoutés |
| `syaharani_roux.glb` | « cat Walk » (2020) | Erina eka syaharani (syaharanichan) | [Sketchfab](https://sketchfab.com/3d-models/cat-walk-fc6e597a81ce4dc291dcca6a9e6888ba) (fichier : Objaverse) | CC-BY 4.0 | squelette et marche d'origine remplacés, animations ajoutées |
| `sheldon_roux.glb` | « Sheldon The Cat » (2018) | luketmcfarlane | [Sketchfab](https://sketchfab.com/3d-models/sheldon-the-cat-b1cccd4b743b469dac8527480584f9fb) (fichier : Objaverse) | CC-BY 4.0 | maillage allégé, squelette, poids et animations ajoutés |
| `cdmir_garenne.glb` | « Rabbit » (2015) | CDmir (Čestmír Dammer), avec TinyWorlds, projet Kelgar | [OpenGameArt](https://opengameart.org/content/rabbit-0) | CC0 1.0 | clips d'artiste gardés (course, saut, assis, guetteur), autres animations ajoutées |
| `dakota_gris.glb` | « Rabbit » | Dakota.Hinkle | [Sketchfab](https://sketchfab.com/3d-models/rabbit-073eef14ae3c4d06808498c3ba895e67) (fichier : Objaverse) | CC-BY 4.0 | os renommés, animations ajoutées |
| `fourthgreen_belier.glb` | « Rabbit Rigged » | FourthGreen | [Sketchfab](https://sketchfab.com/3d-models/rabbit-rigged-e7213589744d436b9d96e2dbb31198a5) (fichier : Objaverse) | CC-BY 4.0 | clip d'origine gardé, os renommés, animations ajoutées |
| `victory_hollandais.glb` | « Rabbit » | victory_ (Paleo Modelist) | [Sketchfab](https://sketchfab.com/3d-models/rabbit-ce07bc73ca66435680e227767725f3f8) (fichier : Objaverse) | CC-BY 4.0 | clip d'origine retiré, os renommés, animations ajoutées |
| `rattel_peint.glb` | « Hand-painted bunny (unrigged version) » (2020) | Rattel | [OpenGameArt](https://opengameart.org/content/hand-painted-bunny-unrigged-version) | CC0 1.0 | squelette, poids et animations ajoutés |

Mentions à reprendre pour un modèle CC-BY (licence : https://creativecommons.org/licenses/by/4.0/) :

- « Chat (tigré gris) : “Cat game asset” par Claire (claireanne3d)
  (https://sketchfab.com/3d-models/cat-game-asset-7a0c1a65e18747799af9fe9481f1bdb2), CC BY 4.0, modifié :
  squelette et animations ajoutés. »
- « Chat (noir et blanc) : “My Cat Modeled” par lilyjoyhanna
  (https://sketchfab.com/3d-models/my-cat-modeled-28d33c1592e14d8b895d36a1e0dfaa5d), CC BY 4.0, modifié :
  squelette et animations ajoutés. »
- « Chaton : “Kitten” par FainoDS (https://sketchfab.com/3d-models/kitten-4ae3704cd65b423ab994545988d4db1a),
  CC BY 4.0, modifié : squelette et animations ajoutés. »
- « Chat (roux tigré) : “cat Walk” par Erina eka syaharani
  (https://sketchfab.com/3d-models/cat-walk-fc6e597a81ce4dc291dcca6a9e6888ba), CC BY 4.0, modifié : squelette
  et animations refaits. »
- « Chat (roux et blanc) : “Sheldon The Cat” par luketmcfarlane
  (https://sketchfab.com/3d-models/sheldon-the-cat-b1cccd4b743b469dac8527480584f9fb), CC BY 4.0, modifié :
  maillage allégé, squelette et animations ajoutés. »
- « Lapin (gris) : “Rabbit” par Dakota.Hinkle (https://sketchfab.com/3d-models/rabbit-073eef14ae3c4d06808498c3ba895e67),
  CC BY 4.0, modifié : animations ajoutées. »
- « Lapin (bélier) : “Rabbit Rigged” par FourthGreen
  (https://sketchfab.com/3d-models/rabbit-rigged-e7213589744d436b9d96e2dbb31198a5), CC BY 4.0, modifié :
  animations ajoutées. »
- « Lapin (hollandais) : “Rabbit” par victory_ / Paleo Modelist
  (https://sketchfab.com/3d-models/rabbit-ce07bc73ca66435680e227767725f3f8), CC BY 4.0, modifié : animations
  ajoutées. »
- CC0, par courtoisie : « Lapin de garenne : “Rabbit” par CDmir (Čestmír Dammer), OpenGameArt, CC0 » ;
  « Lapin peint : “Hand-painted bunny” par Rattel, OpenGameArt, CC0. »

Point à vérifier avant une diffusion commerciale : la page de « cat Walk » (syaharanichan) n'a pas de
description et sa texture s'appelle « GatoTextura.jpg » (provenance non documentée, peut-être une
republication). Les squelettes, allures, poses et transitions ajoutés ont été calculés pour La ferme à
Madichelle (Blender 4.2 en mode `--background`, glTF-Transform 4.5) et n'imposent aucune licence. Sur la page,
robes et races des modèles sont des retouches faites dans le navigateur (shaders), le fichier n'est pas modifié.

Le moteur 3D est [three.js](https://threejs.org) (licence MIT).
