# Le mouton du jeu (Rocketbox « Sheep_White_01 »)

Tous les moutons du jeu (7 races et les agneaux) sont un seul modèle : **« Sheep_White_01 »** de la *Microsoft
Rocketbox Avatar Library* — licence **MIT**, © 2020 Microsoft Corporation (texte complet :
`public/models/LICENSES/microsoft-rocketbox-sheep.txt`, `CREDITS.md`, écran « À propos »). Le fichier du jeu est
`public/models/sheep.glb` (≈ 480 Ko). Ce dossier le refait à partir des sources et documente ce qui a été corrigé.

Si le fichier manque (hors ligne avant la mise en cache, erreur réseau), le jeu garde le mouton procédural
d'avant (`animalModel.js`), puis le remplace par le vrai, un par image, dès que le GLB est là.

## Refaire le GLB

```sh
BLENDER=/chemin/blender-4.2/blender \
SRC=/chemin/Microsoft-Rocketbox/Assets/Animals/Sheep_White_01 \
GT=/dossier/avec/node_modules/@gltf-transform \
WORK=/tmp/mouton sh tools/mouton/build.sh          # STEP=tex|blender|pack pour une seule étape
```

`GT` : un dossier où sont installés `@gltf-transform/core`, `extensions`, `functions`, `meshoptimizer` et `sharp`.

| Étape | Script | Ce qu'il fait |
|---|---|---|
| tex | `prep_tex.py` | TGA → PNG ; carte de normales en convention OpenGL (vert inversé). |
| blender | `make_sheep.py` + `sheep_models.py`, `sheepkit.py`, `sheep_gait.py`, `wool.py`, `horns.py` | Os renommés comme les chiens du jeu (root, pelvis, spine1/2, chest, neck1/2, head, jaw, earL/R, eyes, tail1, scap/humerus/radius/metacarpus/toes, femur/tibia/metatarsus/htoes) ; mise à l'échelle (× 0,817 : garrot 0,70 m) ; poids de l'aisselle et de la cuisse refaits (`fix_weights`) ; masques de laine/tête/pattes/onglons ; forme « tondue » ; cornes en option ; 14 clips ; sabots posés à y = 0. |
| blender | `measure.py` | Mesures sur le maillage déformé, image par image : arêtes étirées par zone, os étirés, sabots sous le sol, glissement. |
| pack | `pack.mjs` | Canaux inutiles retirés (aucune translation d'os hors `root`), textures WebP 1024 q84, géométrie meshopt ; mesures et réglages dans `scene.extras.sheep`. |
| pack | `lod.mjs` | Version réduite (35 % des triangles, meshoptimizer) dans le même fichier (nœud `sheep_lod`, mêmes sommets). |

`planche.html` (servie par vite : `/tools/mouton/planche.html`, `?avant=1` pour le mouton procédural) rend des
planches de races, de laines et de poses : `window.planche.show({ cells, cols, cw, ch })`.

### Contenu du GLB

- 1 319 sommets, 2 186 triangles (LOD 894) ; cornes 1 796 triangles (maillage rigide, partagé) ; 31 os.
- Clips : `idle walk trot run graze eat bleat ruminate lie lie_down get_up sleep jump lamb_play`. Vitesses
  naturelles (m/s, mouton de taille 1) : pas 0,77, trot 2,12, galop 5,00.
- Cible de forme `shorn` (laine tondue, jusqu'à 6,6 cm) ; attributs `_WOOL _HEAD _LEG _HOOF`.

## Ce qui a été corrigé (mesures `measure.py`, rapport d'étirement des arêtes, max par clip)

| Clip | Avant (GLB de la page de comparaison) | Après |
|---|---|---|
| galop | 10,7 (rideau poitrail/avant-bras) | 3,6 (avant) · 2,3 (arrière) · 2,1 (tronc) |
| trot | 10,1 (avant-bras/poitrail) | 3,5 · 2,2 · 2,4 |
| pas | 7,8 (avant-bras/poitrail) | 2,9 · 2,1 · 1,7 |
| se couche / se relève | 4,2 (poitrail/avant-bras) | 2,4 · 1,7 · 2,2 |
| gambade (agneau) | 3,9 (avant-bras/poitrail) | 2,0 · 2,6 · 1,7 |
| saut | **os étirés de 28 %** (métacarpe) | 0 % (2,4 · 2,1 · 1,7) |
| couché, dort, rumine | 3,2–3,3 | 2,4 · 1,7 · 2,2–2,6 |

- Os étirés : 0 % sur tous les clips (avant : 28 % au saut — les translations des os du membre venaient d'une IK
  hors de portée ; l'IK est bornée à 98 % de la longueur de la jambe et les translations sont retirées partout).
- Sabots : jamais sous le sol debout (≤ 0,01 cm) ; couché, onglons à 1,2 cm au-dessus du sol.
- Tête : les grands rapports (bêle 25,8, broute 11,0) sont l'ouverture de la bouche (lèvres de la mâchoire), voulue.
- Reste : 3,5 au galop et au trot sur une arête de 1,4 cm au creux de l'aisselle (invisible en jeu, la laine la
  couvre) ; les tests du jeu le bornent (`avant` < 4, `arrière` < 3).

## Dans le jeu

- `src/game/models/sheepReal.js` : construction (squelette par mouton, géométrie partagée par gabarit), races, laine,
  animation (`RealSheepAnim`), sol, LOD, hors champ. `src/game/models/sheepCoat.js` : matière (laine recolorée,
  boucles, mèches longues, tête et pattes, genoux noirs, cornes à anneaux). `src/sim/sheepLook.js` : réglages des
  races, des agneaux, toison selon l'état du jeu.
- **Races** (os, forme et shader, une seule géométrie) : mérinos (toison épaisse, laine sur la tête et les pattes,
  bélier à cornes en spirale), suffolk (tête et pattes noires, grandes oreilles tombantes, toison courte), Ouessant
  (le plus petit, garrot ≈ 0,4 m, souvent noir, bélier à cornes), nez noir du Valais (face noire, genoux et pieds
  noirs, boucles, cornes pour les deux sexes), islandais (laine longue en mèches qui pendent, cornes, robes moorit
  etc.), mérinos australien (plus grand, toison très dense), cheviot (face blanche nue, oreilles dressées).
- **Agneaux** : tête et pattes plus grandes, laine courte et bouclée, sans cornes ; ils grandissent (bébé → jeune →
  adulte : le modèle est refait au changement d'âge).
- **Laine** : suit le jeu — pleine, tondue à la récolte de la laine (`a.woolCut`), puis repousse avec la production
  (`sheepFleece`), fondue en douceur (cible `shorn` + shader). Salon (`Groomer` → `setCut`) : « tonte » et « court » raccourcissent la laine, « long » et « concours » la gonflent ; frais du jour (`Beauty` → `setFluff`).
- **Poses** : allures à leur vitesse (hystérésis pas/trot/galop, sabots tenus au sol), brouter, manger à la mangeoire,
  bêler (la bouche s'ouvre), se coucher (à genoux), couché, ruminer (mâchoire), dormir, se relever (arrière d'abord),
  gambader et téter (agneau), sauter (tour), venir. Bouche fermée au repos. Sol : sabots, ventre, tête mesurés.
- **Chargement** : après les chiens (`Game.realSheepReady`), puis remplacement un mouton par image ; vignettes
  (portraits, enclos), van, salon, concours. Le service worker et la version à emporter prennent tous les
  `public/models/*.glb`.
- **Tests** : `tests/sheepReal.test.js` (déterministes : fichier, races, laine, sol, os, glissement, allures, LOD,
  accessoires, crédits).

## Perf (téléphone 390×844, Chromium SwiftShader sur une machine très chargée : seule la comparaison vaut)

Moutons à la bergerie, caméra qui voit tout le troupeau (`perf.mjs` de la vérification). Avant = mouton procédural
(GLB bloqué), après = Rocketbox.

| | appels de dessin | triangles (scène) | triangles des moutons | Game.frame (médiane) | animation des moutons |
|---|---|---|---|---|---|
| basse, 10 | 561 → 287 | 365 k → 269 k | 129 k → 14 k | 11,9 → 8,8 ms | 0,2 → 0,9 ms |
| basse, 20 | 818 → 312 | 482 k → 287 k | 263 k → 32 k | 18,6 → 10,7 ms | 0,3 → 1,1 ms |
| haute, 10 | 609 → 288 | 763 k → 463 k | 324 k → 24 k | 21,4 → 16,4 ms | 0,2 → 1,1 ms |
| haute, 20 | 931 → 313 | 1 099 k → 492 k | 666 k → 52 k | 55 → 24 ms | 0,3 → 3,2 ms |

Géométries en mémoire (basse, 20) 937 → 333, textures 114 → 59. Au loin (au-delà de 7 m en basse, 18 m en haute),
version réduite et animation une image sur deux ; hors champ, une image sur trois. Construction d'un mouton :
≈ 6 ms (node), gabarit partagé ensuite.
