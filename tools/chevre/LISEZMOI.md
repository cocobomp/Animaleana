# La chèvre du jeu (Rocketbox « Goat_White_01 » et « Goat_Brown_01 »)

Toutes les chèvres du jeu (4 races, boucs, chevreaux et jeunes) sont un seul modèle : **« Goat_White_01 »** de la
*Microsoft Rocketbox Avatar Library*, avec les cornes arquées de **« Goat_Brown_01 »** (même maillage) — licence
**MIT**, © 2020 Microsoft (texte complet : `public/models/LICENSES/microsoft-rocketbox-goat.txt`, `CREDITS.md`, écran
« À propos »). Le fichier du jeu est `public/models/goat.glb` (≈ 530 Ko). Ce dossier le refait à partir des sources et
documente ce qui a été corrigé.

Si le fichier manque (hors ligne avant la mise en cache, erreur réseau), le jeu garde la chèvre procédurale d'avant
(`animalModel.js`), puis la remplace par la vraie, une par image, dès que le GLB est là.

## Refaire le GLB

```sh
BLENDER=/chemin/blender-4.2/blender \
SRC=/chemin/Microsoft-Rocketbox/Assets/Animals \
GT=/dossier/avec/node_modules/@gltf-transform \
WORK=/tmp/chevre sh tools/chevre/build.sh          # STEP=tex|blender|pack pour une seule étape
```

`SRC` : le dossier `Assets/Animals` du dépôt (il faut `Goat_White_01` et `Goat_Brown_01`). `GT` : un dossier où sont
installés `@gltf-transform/core`, `extensions`, `functions`, `meshoptimizer` et `sharp`. Le moteur des membres et les
outils Blender sont ceux du mouton (`tools/mouton/sheep_gait.py`, `sheepkit.py`, `fix_weights` de `sheep_models.py`).

| Étape | Script | Ce qu'il fait |
|---|---|---|
| tex | `prep_tex.py` | TGA → PNG ; carte de normales en convention OpenGL (vert inversé). |
| blender | `make_goat.py` + `goat_models.py`, `goat_gait.py` | Os renommés comme le mouton (root, pelvis, spine1/2, chest, neck1/2/3, head, jaw, earL/R, eyes, tail1, scap/humerus/radius/metacarpus/toes, femur/tibia/metatarsus/htoes) ; os ajoutés pour les **cornes** (hornL/R, échelle 0 = sans cornes, un bouchon referme le crâne), la **barbe** et la **mamelle** ; mise à l'échelle (garrot 0,75 m) ; omoplates rattachées au poitrail ; poids de l'aisselle, du bréchet, des cuisses et de la mamelle refaits (lissage laplacien) ; cornes arquées de la brune en cible de forme `horns_back` ; 20 clips ; sabots posés à y = 0 ; couchée posée sur le ventre (descente cherchée par dichotomie, tronc à ≤ 4 mm du sol). |
| blender | `measure.py` | Mesures sur le maillage déformé, image par image : arêtes étirées par zone, os étirés, sabots sous le sol, glissement. |
| pack | `pack.mjs` | Canaux inutiles retirés (aucune translation d'os hors `root`), textures WebP 1024 q84, géométrie meshopt ; mesures et réglages dans `scene.extras.goat`. |
| pack | `lod.mjs` | Version réduite (≈ 40 % des triangles, meshoptimizer) dans le même fichier (nœud `goat_lod`, mêmes sommets). |

`planche.html` (servie par vite : `/tools/chevre/planche.html`, `?avant=1` pour la chèvre procédurale) rend des
planches de races, de poils et de poses : `window.planche.show({ cells, cols, cw, ch })` (options par case : race,
stade, sexe, mamelle, clip, vue, barrière, licol, mère pour la tétée…).

### Contenu du GLB

- 1 637 sommets, 2 548 triangles (LOD 1 006) ; 37 os ; 2 textures WebP (couleur 94 Ko, normales 119 Ko).
- Clips : `idle walk trot run graze eat browse_up rear_up rear_down climb bleat headbutt lie_down lie ruminate sleep
  get_up kid_play jump milk`. Vitesses naturelles (m/s, chèvre de taille 1) : pas 0,92, trot 2,02, galop 4,46.
- Dressée contre la barrière (`rear_up` → `browse_up` → `rear_down`) : sabots antérieurs à 0,94 m (lisse haute de la
  bergerie : 0,95 m), 0,29 m devant l'origine (`extras.goat.browse`).
- Cible de forme `horns_back` (0 : cornes droites de la blanche, 1 : arquées vers l'arrière de la brune).

## Ce qui a été corrigé (mesures `measure.py`, rapport d'étirement des arêtes, max par clip et par zone)

« Avant » : le GLB de la chèvre Rocketbox de la page de comparaison des moutons et chèvres (mêmes clips, sans les
corrections), mesuré avec le même script.

| Clip | Avant (max · zone) | Après (avant · arrière · tronc) |
|---|---|---|
| se dresse / redescend | 7,2 (poitrail/avant-bras) | 3,7 · 2,6 · 2,8 |
| dressée, broute en hauteur | 6,3 (poitrail/avant-bras) | 3,7 · 2,6 · 2,8 |
| pas | 5,9 (poitrail/avant-bras) | 2,1 · 2,8 · 2,5 |
| saut | 5,7 (jambe/mamelle) ; tronc 4,7 | 1,8 · 2,8 · 2,5 |
| escalade | 5,5 (poitrail/avant-bras) ; sabot 1,4 mm sous le sol | 2,6 · 3,2 · 2,5 ; sabots au sol |
| trot | 5,1 (poitrail/avant-bras) | 1,9 · 2,4 · 2,4 |
| gambade du chevreau | 4,7 (avant-bras/poitrail) | 1,7 · 2,7 · 2,4 |
| galop | 4,4 (poitrail/avant-bras) ; tronc 4,1 | 1,9 · 2,5 · 3,1 |
| se couche / se relève | 4,4 (poitrail/avant-bras) | 2,1 · 3,0 · 2,5 |
| couchée, rumine, dort | 3,3 (mamelle/bassin) ; onglons à 2,2 cm | 2,1 · 3,1 · 2,5 ; onglons à 1,4 cm |
| coup de tête | 2,9 (jambe/mamelle) ; sabot 1,8 mm sous le sol | 1,4 · 2,4 · 2,1 ; sabots au sol |

- Os étirés : 0 % sur tous les clips (l'IK des membres est bornée à 98 % de la longueur de la jambe ; aucune
  translation d'os hors de la racine).
- Sabots : jamais sous le sol (≤ 0,05 cm, la tolérance de la mesure) ; glissement des sabots posés ≤ 4,3 % de la
  vitesse aux allures.
- Tête : le grand rapport du bêlement (6,0) est l'ouverture de la bouche (lèvres de la mâchoire), voulue.
- Couchée : le ventre est posé sur le sol (tronc à ≤ 4 mm), plus de chèvre qui flotte au-dessus de l'herbe ; se
  coucher passe par un genou puis les deux (les onglons antérieurs passaient 7,2 cm sous le sol aux images de
  transition ; 2,4 cm avec les genoux, puis 0 après le relèvement du corps `groundFix`), se relever l'arrière-train
  d'abord.
- Cornes arquées : la chèvre brune a aussi un corps un peu différent de la blanche ; le jeu ne garde la cible
  `horns_back` que sur la tête (`realGoatBase`), sinon le ventre de la chèvre couchée passait 3 cm sous le sol.
- Reste : 3,7 au creux de l'aisselle quand elle se dresse (arête de 1,5 cm cachée sous l'avant-bras) ; les tests du
  jeu bornent `avant` < 4, `arrière` et `tronc` < 3,5.

## Dans le jeu

- `src/game/models/goatReal.js` : construction (squelette par chèvre, géométrie partagée par gabarit), races, robe,
  poil long en mèches, cornes, barbe, mamelle, animation (`RealGoatAnim`, sous-classe du mixeur du mouton
  `RealSheepAnim`), sol, LOD, hors champ ; comportements (dressée contre la barrière, traite, tétée, coup de tête).
  `src/game/models/goatCoat.js` : matière (photo du GLB recolorée par motif, poil long, mèches en cartes).
  `src/sim/goatLook.js` : réglages des races, des chevreaux et des boucs, mamelle selon le lait du jeu.
- **Races** (os, forme et shader, une seule géométrie) :
  - **alpine chamoisée** : brun chamois, raie dorsale noire, ventre, bas des pattes et deux bandes de la face noirs ;
    cornes arquées ;
  - **saanen** : toute blanche, sans cornes (bouchon du crâne), oreilles dressées, un peu plus grande ;
  - **poitevine** : poil long noir (mèches qui pendent des flancs et des cuisses), ventre, intérieur des cuisses,
    dessous de la queue et bandes de la face clairs ; petites cornes droites ;
  - **col noir du Valais** : avant noir, arrière blanc (limite irrégulière), poil long, grandes cornes arquées pour les
    deux sexes.
- **Bouc** : cornes × 1,45, barbe × 1,5, un peu plus massif. **Chevreau** : tête plus grosse, pattes et oreilles plus
  grandes, ni cornes ni barbe, poil plus court ; **jeune** : entre les deux, petites cornes. Ils grandissent (le
  modèle est refait au changement d'âge).
- **Mamelle** : suit le lait du jeu (`goatUdderFill` : `a.produce`) — vide après la traite, pleine quand le lait est
  prêt, fondue en douceur ; couchée, elle s'aplatit contre le ventre. Petite chez le bouc et la chevrette.
- **Poses et comportements** : allures à leur vitesse (hystérésis pas/trot/galop, sabots tenus au sol), brouter au sol,
  manger au râtelier, **se dresser contre la barrière** de la bergerie (au repos dans l'enclos, de temps en temps : elle
  va jusqu'à la barrière, se dresse les antérieurs sur la lisse haute, broute en hauteur, redescend et recule ; jamais
  la barrière du fond, derrière l'abri), se coucher (à genoux), couchée et ruminer, dormir, se relever, bêler,
  **coup de tête** entre deux copines (état « groom »), **traite** (elle reste debout, mâche, la mamelle se vide),
  chevreau qui **gambade**, suit sa mère et **tète** (il se glisse à côté d'elle, tourné vers sa croupe, l'encolure
  plonge jusqu'au trayon : bouche à ≤ 3 cm), saut et salut du spectacle et de l'agility, menée au trot par le chien de
  troupeau. Escalade : le clip existe (`climb`), mais le jeu n'a pas encore d'objet où grimper.
- **Accessoires** : ancres de la tête et de l'encolure aux conventions du modèle procédural (licol, nœuds et rubans du
  salon) ; longe accrochée à l'anneau du licol sous le menton (`leashPoint`).
- **Chargement** : après le mouton (`Game.realGoatReady`), puis remplacement une chèvre par image ; vignettes
  (portraits avec la mamelle du moment, boutique), van, salon, spectacle. Le service worker et la version à emporter
  prennent tous les `public/models/*.glb`.
- **Tests** : `tests/goatReal.test.js` (déterministes : fichier, races, cornes, barbe, mamelle et traite, sol debout et
  couchée, dressée contre la barrière, os, glissement, allures, tétée, LOD, accessoires, crédits).

## Perf (téléphone 390×844, Chromium SwiftShader sur une machine très chargée : seule la comparaison vaut)

Chèvres à la bergerie (4 races, boucs et chèvres, un chevreau sur six), caméra qui voit tout le troupeau
(`perf.mjs`, le même que celui du mouton). Avant = chèvre procédurale (GLB bloqué), après = Rocketbox. La machine ne
donnait que 3 à 17 images en 10 s : les temps d'image sont bruités, les appels de dessin et les triangles sont exacts.

| | appels de dessin | triangles (scène) | triangles des chèvres | Game.frame (médiane) | animation des chèvres (médiane) |
|---|---|---|---|---|---|
| basse, 10 | 578 → 284 | 359 k → 265 k | 104 k → 10 k | 14,0 → 13,5 ms | 0,2 → 0,9 ms |
| basse, 20 | 879 → 308 | 463 k → 275 k | 210 k → 20 k | 19,5 → 12,2 ms | 0,5 → 1,6 ms |
| haute, 10 | 611 → 289 | 1 197 k → 464 k | 418 k → 25 k | 40,6 → 12,3 ms | 0,3 → 1,5 ms |
| haute, 20 | 948 → 313 | 2 192 k → 489 k | 925 k → 50 k | 29,8 → 27,0 ms | 0,3 → 5,7 ms |

Géométries en mémoire (basse, 20) 881 → 333, textures 170 → 55, tas JS 136 → 130 Mo. Une chèvre = 2 appels de
dessin (robe et ombre de contact ; + 1 pour les mèches du poil long de près). Au loin (au-delà de 7 m en basse, 18 m en
haute), version réduite, mèches cachées et animation une image sur deux ; hors champ, une image sur trois. L'animation
coûte plus que la procédurale (mixeur, sabots tenus, sol mesuré : ≈ 0,1 ms par chèvre au loin, ≈ 0,3 ms de près) mais
le rendu, qui dominait, est divisé par 2 à 4. Construction d’une chèvre : 3 à 15 ms dans le navigateur (le premier gabarit ≈ 0,3 s, partagé ensuite).
