# La vache et le taureau du jeu (Lyndon Daniels, CC0 ; Rocketbox « Bull_Brown_01 », MIT)

Toutes les **vaches, génisses et veaux** des 11 races du jeu sont un seul modèle : la vache de **Lyndon Daniels**
(« Realtime Rancher's 3D Model Pack », OpenGameArt, **CC0 1.0** — aucune attribution exigée, nous le remercions ; même
pack et même artiste que le cheval du jeu). Les **taureaux** (mâles adultes) sont **« Bull_Brown_01 »** de la
*Microsoft Rocketbox Avatar Library* (**MIT**, © 2020 Microsoft, notice gardée). Textes : `public/models/LICENSES/
lyndon-daniels-vache.txt` et `microsoft-rocketbox-taureau.txt`, `CREDITS.md`, écran « À propos » (`src/ui/credits.js`).
Fichiers du jeu : `public/models/cow.glb` (≈ 750 Ko) et `public/models/bull.glb` (≈ 600 Ko). Ce dossier les refait à
partir des sources et documente ce qui a été corrigé.

Si un fichier manque (hors ligne avant la mise en cache, erreur réseau), le jeu garde la vache procédurale d'avant
(`animalModel.js`, un taureau sans son GLB aussi), puis la remplace par la vraie, une par image, dès que le GLB est là.

## Refaire les GLB

```sh
BLENDER=/chemin/blender-4.2/blender \
DL=/dossier/des/sources/vache \
SRC=/chemin/Microsoft-Rocketbox/Assets/Animals \
GT=/dossier/avec/node_modules/@gltf-transform \
WORK=/tmp/vache sh tools/vache/build.sh        # STEP=blender|measure|tex|pack ; ONLY=cow|bull
```

`DL` : `oga_lyndon_cow/cowTM08New00RTime02.blend` et `oga_lyndon_cow/zip/cow/*.png` (tirés de `cow.zip` du pack).
`SRC` : le dossier `Assets/Animals` du dépôt Rocketbox (il faut `Bull_Brown_01`). `GT` : un dossier où sont installés
`@gltf-transform/core`, `extensions`, `functions`, `meshoptimizer` et `sharp`. Le taureau reprend le moteur des membres
et les outils du mouton et de la chèvre (`tools/mouton/sheep_gait.py`, `sheepkit.py`, `tools/chevre/goat_models.py`).
Les étapes `tex` et `pack` refont les fichiers du jeu à l'octet près à partir des GLB bruts.

| Étape | Script | Ce qu'il fait |
|---|---|---|
| blender | `make_cow.py` + `cow_models.py`, `cowkit.py`, `cow_gait.py`, `cow_autorig.py` | Vache : le modèle n'avait que les groupes de sommets d'un ancien squelette — **squelette créé** (os aux noms des moutons et des chèvres du jeu : root, pelvis, spine1/2, chest, neck1/2/3, head, jaw, ear, scap/humerus/radius/metacarpus/toes, femur/tibia/metatarsus/htoes, tail1…6), os des **cornes** (échelle 0 : sans cornes), de la **mamelle** (4 trayons) et des oreilles, poids de la peau (diffusion de chaleur, tête rigide) ; garrot 1,40 m, tournée vers +Z, sabots à y = 0 ; 16 clips générés : `idle walk trot run graze eat lie_down lie ruminate sleep get_up moo milk tail_swish calf_play suckle` — se coucher à genoux devant puis l'arrière, se relever l'arrière d'abord ; IK des membres bornée (aucun os étiré), sabots jamais sous le sol, couchée posée sur le poitrail et les avant-bras repliés (descente cherchée par dichotomie). |
| blender | `taureau/prep_tex.py`, `taureau/make_bull.py` + `taureau/cow_models.py`, `taureau/cow_gait.py` | Taureau : textures TGA → PNG (normales OpenGL) ; os Biped renommés comme la vache, onglons fondus dans le paturon, os du **scrotum**, cornes longues en cible de forme `horns_long` ; garrot 1,45 m ; 20 clips (les mêmes, plus `ear_flick head_shake swat tail_flick`). |
| measure | `measure_cow.py`, `taureau/measure.py` | Mesures sur le maillage déformé, image par image : arêtes et os étirés, sabots sous le sol, glissement des sabots posés. |
| tex | `tex.mjs` | **Robe propre** : la photo est remplacée par une **carte de grain** (chaque texel rapporté à la moyenne de sa classe de poil, flou par îlot d'UV : plus de taches ni d'ombres de la photo, plus de « gris sale ») et un **masque** (R : taches de la photo, G : peau rose — nez, intérieur des oreilles, paupières —, B : gardé tel quel — bouche, cils) ; trous sombres de la texture neutralisés ; yeux peints du taureau notés (`--eyeuv`). |
| pack | `pack.mjs` | Canaux inutiles retirés (aucune translation d'os hors `root`, pas d'échelle animée), matières `cow_coat` / `cow_eye`, grain WebP 1024 q84, masque dans l'emplacement d'occlusion (512), géométrie meshopt ; mesures et réglages dans `scene.extras.cow`. |
| pack | `lod.mjs` | Version réduite (vache ≈ 30 %, taureau ≈ 36 % des triangles, meshoptimizer) dans le même fichier (nœud `cow_lod`, mêmes sommets). |

`planche.html` (servie par vite : `/tools/vache/planche.html`, `?avant=1` pour la vache procédurale) rend des planches
de races, de têtes, de poses et de veaux : `window.planche.show({ cells, cols, cw, ch })` (par case : race, robe,
stade, sexe, mamelle, clip, instant, images jouées, vue `side|three|front|head|back|low|top|hoof`, zoom, LOD, licol,
bonnet anti-mouches, mère pour la tétée, râtelier, `xray` : sol transparent).

### Contenu des GLB

- **cow.glb** : 3 517 sommets, 6 092 triangles (LOD 1 826) + yeux (116 sommets) ; 39 os ; grain 1024 et normales en
  WebP, masque 512. Vitesses naturelles (m/s, taille 1) : pas 1,18, trot 2,54, galop 5,21.
- **bull.glb** : 1 878 sommets, 3 092 triangles (LOD 1 128) ; 40 os ; cible de forme `horns_long` ; yeux peints.
- Mesures (Blender, pire image de chaque clip) : **os étirés 0 %** sur tous les clips ; sabots ≥ −0,43 cm (galop de la
  vache ; ≤ −0,1 cm ailleurs) ; glissement des sabots posés du taureau 2,9 à 3,3 % ; arêtes ≤ 4,1 aux allures (mufle
  et paupières : 5,6 à 6,6 au meuglement et couchée, voulu — bouche ouverte, yeux fermés).

## Ce qui a été corrigé dans le jeu (`src/game/models/cowReal.js`, `sheepReal.js`)

- **Couchée** : la vache repose sur son poitrail, ses épaules, ses cuisses et ses **avant-bras repliés** (points de
  contact du jeu comme la pose du GLB) ; ramenée jusqu'au ventre, ses antérieurs repliés s'enfonçaient de 4 à 8 cm
  sous l'herbe. Les membres allongés par le gabarit d'une race sont ramenés à la longueur du modèle couchée
  (`legFold`) ; sabots repliés à 2,5 cm au plus dans l'herbe ; plus de vache qui flotte puis tombe à la fin de « se
  coucher » (appui à ±2 cm dès la fin de la transition).
- **Sabots posés** tenus jusqu'à ce que le clip les lève de 2,8 cm (`lockDown` : l'onglon sautait de 1,2 à 1,6 cm en
  une image au trot) ; **arrêt** : le membre le plus de travers se replace d'un petit pas en premier, l'onglon suit un
  chemin régulier de sa place de départ à sa place d'arrivée, sabot levé de 7 cm (glissement à l'arrêt 6,5 → 1,0 cm ;
  commun au mouton et à la chèvre).
- **Brouter** : les races à pattes courtes (Highland, Hérens) et leurs veaux gardent les sabots au sol, le museau
  relevé par la base de l'encolure (la mâchoire du veau de Highland passait 8 cm sous l'herbe).
- **Cornes en lyre** (Highland, Retinta) : la corne courte et droite du modèle est refaite le long d'une courbe dans
  le gabarit — sur le côté, puis relevée, pointe vers le haut (`bendLongHorns`) ; elles ressemblaient à deux pointes
  dressées.

## Dans le jeu

- `src/game/models/cowReal.js` : construction (squelette par vache, géométrie partagée par gabarit), races, cornes,
  poil long en mèches et frange, mamelle, animation (`RealCowAnim`, sous-classe du mixeur du mouton `RealSheepAnim`),
  sol, LOD, hors champ, comportements. `src/game/models/cowCoat.js` : robe de chaque race peinte par le shader sur le
  grain du GLB. `src/sim/cowLook.js` : gabarits des races, veau, génisse, taureau, mamelle selon le lait du jeu.
- **Races** (os, forme et shader, une géométrie par gabarit) :
  - **Prim'Holstein** : pie noire à grandes taches, bas des pattes, ventre et toupillon blancs, grande, grosse mamelle ;
  - **Normande** : pie rouge, face blanche, **lunettes** foncées autour des yeux (paupières comprises), **bringé**
    dans les taches ;
  - **Charolaise** : crème unie, massive, **sans cornes** ;
  - **Highland** : petite, poil long roux en mèches (cartes, `ruminantHair.js`) et **frange sur les yeux**, longues
    cornes en lyre ;
  - **Bretonne pie noire** : toute petite, pie noire (plus de noir que de blanc) ;
  - **Hérens** : petite et trapue, noire ou rouge foncé, **cornes de lutteuse** portées en avant ;
  - **Wagyu** : noire unie ; **Canadienne** : brun noir, **mufle clair** ; **Hereford** : rouge, tête, poitrail, ventre,
    bas des pattes et toupillon blancs ; **Aberdeen Angus** : noire, sans cornes ; **Retinta** : rouge, cornes en lyre.
- **Taureau** : son modèle (Rocketbox), plus massif, cornes longues de la Highland et de la Retinta par la cible de
  forme, taches calculées pour les robes pie. **Veau** : tête plus grosse, pattes et oreilles plus longues, sans
  cornes, poil plus doux ; **génisse** : entre les deux, petites cornes. Ils grandissent (le modèle est refait au
  changement d'âge).
- **Mamelle** visible chez la vache adulte : suit le lait du jeu (vide après la traite, pleine quand le lait est
  prêt, en douceur), aplatie couchée ; **traite** : la main de la joueuse aux trayons (`calfTeatPoint`), la vache
  debout mâche.
- **Poses** : brouter, manger au râtelier (bouche à la hauteur du foin), allures sans glissement, menée par la
  joueuse ou le chien de troupeau, se coucher à genoux, couchée, ruminer, dormir (tête posée), se relever l'arrière
  d'abord, meugler, queue qui chasse les mouches (plus souvent l'été) et se retourner vers son flanc, brosse à
  vaches, toilettage d'une copine ; **veau** qui gambade (à l'arrêt), suit sa mère et **tète** (à côté d'elle, tourné
  vers sa croupe, bouche au trayon).
- **Chargement** : après la chèvre (`Game.realCowReady`), jamais attendu ; puis remplacement une vache par image
  (`swapRealCows` : mesuré, 6 vaches en 6 images) ; vignettes (portraits avec la mamelle du moment), van (longe
  1,18 m), salon. Le service worker et la version à emporter prennent tous les `public/models/*.glb`.
- **Tests** : `tests/cowReal.test.js` (déterministes : fichiers, races, gabarits, cornes, lyre, poil long, mamelle et
  traite, sol debout, couchée et à la fin de « se coucher », brouter des races à pattes courtes, allures, os jamais
  étirés, sabots posés sans glisser ni sauter, arrêt d'aplomb, transitions, gestes, tétée, LOD, boîte englobante,
  accessoires, shaders, crédits, espèce proposée).

## Perf (téléphone 390×844, Chromium SwiftShader sur une machine très chargée : seule la comparaison vaut)

Vaches au pré de la bergerie (11 races, un taureau sur cinq, un veau sur six), caméra qui voit tout le troupeau
(`perf.mjs`, celui de la chèvre). Avant = vache procédurale (GLB bloqués), après = vache de Lyndon Daniels et taureau
Rocketbox. Les temps d'image sont bruités (1 à 4 images par seconde) ; appels de dessin et triangles sont exacts.

| | appels de dessin | triangles (scène) | triangles des vaches | Game.frame (médiane) | animation des vaches (médiane) |
|---|---|---|---|---|---|
| basse, 10 | 608 → 313 | 367 k → 274 k | 123 k → 17 k | 12,8 → 14,1 ms | 0,2 → 1,1 ms |
| basse, 20 | 866 → 345 | 458 k → 289 k | 248 k → 35 k | 17,6 → 16,2 ms | 0,2 → 2,2 ms |
| haute, 10 | 591 → 311 | 871 k → 485 k | 350 k → 46 k | 19,9 → 17,2 ms | 0,2 → 1,8 ms |
| haute, 20 | 815 → 337 | 1 197 k → 523 k | 700 k → 95 k | 23,8 → 23,2 ms | 0,4 → 4,9 ms |

Géométries en mémoire (basse, 20) 947 → 360, textures 161 → 58, tas JS 171 → 159 Mo. Une vache = 3 appels de dessin
(robe, yeux, ombre de contact ; + 1 pour les mèches de la Highland de près). Au loin (au-delà de 12 m en basse, 26 m
en haute), version réduite, mèches cachées et animation une image sur deux ; hors champ, une image sur trois.
L'animation coûte plus que la procédurale (mixeur, sabots tenus, sol mesuré) mais le rendu, qui dominait, est divisé
par 2 à 7. Construction d'une vache : 1 à 40 ms dans le navigateur (le premier gabarit ≈ 0,1 s, partagé ensuite ;
la vache procédurale : 70 à 100 ms).
