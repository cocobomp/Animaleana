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
  `src/game/models/goatCoat.js` : matière (photo du GLB recolorée par motif, poil long). Mèches en cartes :
  `src/game/models/ruminantHair.js` (commun avec la laine longue de l'islandais) — effilées, ondulées, à racine
  étroite, semées à espacement régulier sur les flancs, le dos, la croupe et les cuisses, jamais en rang sous le
  ventre (la poitevine n'a plus de languettes noires sur son ventre clair) ; ≤ 400 cartes par chèvre.
  `src/sim/goatLook.js` : réglages des races, des chevreaux et des boucs, mamelle selon le lait du jeu.
- **Races** (os, forme et shader, une seule géométrie) :
  - **alpine chamoisée** : brun chamois, raie dorsale noire, ventre, bas des pattes et deux bandes de la face noirs ;
    cornes arquées ;
  - **saanen** : toute blanche (face comprise : la photo du GLB y est éclaircie), sans cornes (bouchon du crâne),
    oreilles dressées, un peu plus grande ;
  - **poitevine** : poil long noir (mèches qui pendent des flancs et des cuisses), ventre, intérieur des cuisses,
    dessous de la queue et bandes de la face clairs ; petites cornes droites ;
  - **col noir du Valais** : avant noir, arrière blanc (limite irrégulière), poil long, grandes cornes arquées pour les
    deux sexes.
- **Bouc** : cornes × 1,45, barbe × 1,5, un peu plus massif. **Chevreau** : tête plus grosse, pattes et oreilles plus
  grandes, ni cornes ni barbe, poil plus court ; **jeune** : entre les deux, petites cornes. Ils grandissent (le
  modèle est refait au changement d'âge). Oreilles portées vers l'avant et sur le côté (`earUp`/`earFwd`), pour
  qu'on ne les prenne pas pour une deuxième paire de cornes.
- **Mamelle** : suit le lait du jeu (`goatUdderFill` : `a.produce`) — vide après la traite, pleine quand le lait est
  prêt, fondue en douceur ; couchée, elle s'aplatit contre le ventre. Petite chez le bouc et la chevrette.
- **Poses et comportements** : allures à leur vitesse (hystérésis pas/trot/galop, sabots tenus au sol), brouter au sol,
  manger au râtelier, **se dresser contre la barrière** de la bergerie (au repos dans l'enclos, de temps en temps : elle
  va jusqu'à la barrière — pas qui démarre et finit en douceur —, se pose d'aplomb, se dresse les antérieurs sur la
  lisse haute en gardant les postérieurs posés, broute en hauteur, redescend et recule ; jamais la barrière du fond,
  derrière l'abri), se coucher (à genoux), couchée et ruminer, dormir, se relever, bêler,
  **coup de tête** entre deux copines (état « groom »), **traite** (elle reste debout, mâche, la mamelle se vide),
  chevreau qui **gambade** (à l'arrêt seulement : en se déplaçant il joue l'allure, sabots tenus), suit sa mère et
  **tète** (il y va au pas, se glisse à côté d'elle, tourné vers sa croupe, l'encolure plonge jusqu'au trayon :
  bouche à ≤ 3 cm ; la chèvre reste debout tant qu'il tète, il ne tète que sa mère debout ; des jumeaux prennent
  chacun un trayon, de part et d'autre ; en jeu, 9 cm au lieu de 20 à 28 cm), saut et salut du
  spectacle et de l'agility, menée au trot par le chien de troupeau. Museau toujours au-dessus de l'herbe : la tête
  du chevreau qui broute ne saute plus. Arrêt : sabots tenus puis petit pas de replacement (comme le mouton).
  Escalade : le clip existe (`climb`), mais le jeu n'a pas encore d'objet où grimper.
- **Accessoires** : ancres de la tête et de l'encolure aux conventions du modèle procédural (licol, nœuds et rubans du
  salon) ; longe accrochée à l'anneau du licol sous le menton (`leashPoint`).
- **Chargement** : après le mouton (`Game.realGoatReady`), puis remplacement une chèvre par image ; vignettes
  (portraits avec la mamelle du moment, boutique), van, salon, spectacle. Le service worker et la version à emporter
  prennent tous les `public/models/*.glb`.
- **Tests** : `tests/goatReal.test.js` (déterministes : fichier, races, cornes, barbe, mamelle et traite, sol debout et
  couchée, dressée contre la barrière et postérieurs posés, os, glissement, allures, gambade en courant, arrêts,
  tête du chevreau qui broute, tétée au pas et mère debout, oreilles, mèches (pas sous le ventre, budget), LOD,
  accessoires, crédits, espèce proposée).

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
dessin (robe et ombre de contact ; + 1 pour les mèches du poil long de près). Au loin (au-delà de 15 m de l'œil en
basse — la caméra normale du téléphone voit les chèvres à 9-12 m —, 18 m en haute ; jamais raccourcie pour le chevreau),
version réduite, mèches cachées et animation une image sur deux ; hors champ, une image sur trois. Coût du seuil de
15 m (basse, caméra du jeu, 10 et 20 chèvres) : +8 à +15 k triangles, mêmes appels de dessin. L'animation
coûte plus que la procédurale (mixeur, sabots tenus, sol mesuré : ≈ 0,1 ms par chèvre au loin, ≈ 0,3 ms de près) mais
le rendu, qui dominait, est divisé par 2 à 4. Construction d’une chèvre : 3 à 15 ms dans le navigateur (le premier gabarit ≈ 0,3 s, partagé ensuite).

## Finitions 2 (ruminants)

### Bouc nettement plus grand et massif (`src/sim/goatLook.js` BUCK, `goatReal.js` shapeFor, railPitch, browseFence)

Le bouc adulte est × 1,12 (× 1,05 avant), tête × 1,06, encolure, épaules et poitrail épaissis : dans le gabarit, la
peau est poussée le long de sa normale lissée de 2,5 à 5,6 cm (plus sur le dessus de l'encolure), ni la tête ni le bas
des pattes ni l'arrière du corps (gabarit partagé par longueur de pattes et épaississement : + 19 Ko de positions par
gabarit de bouc, + les mèches du poil long pour le col noir et la poitevine). Le bouc ainsi agrandi restait dressé au-dessus de
la lisse : `railPitch` atténuait sa correction selon l'écart sans signe (pleine à 8 cm, nulle à 25 cm) alors que le
clip lève les antérieurs d'un grand bouc 15 cm au-dessus de la lisse — il n'en corrigeait que la moitié (saanen
7,8-8,7 cm, col noir 6,3-7,2 cm au-dessus). Maintenant : atténuation seulement sous la lisse, bascule jusqu'à
0,24 rad avec le terme du second ordre (au premier ordre, 1,2 cm de trop : dans la lisse), et glissade réglée sur les
onglons mesurés (`railFrontAt`) pour les poser au milieu de la lisse (en basculant, l'avant avance ; la chèvre alpine
s'arrêtait aussi 10,7 cm avant le milieu de la lisse). Boucs alpine, saanen, col noir, poitevine : sole des
antérieurs 0,3-1,6 cm au-dessus de la lisse, à 0-0,4 cm de son milieu, aucun sommet dans les lisses
(`tests/ruminantFinish.test.js`).

### Tête claire sans strie d'ombre derrière l'œil (`ruminantShadow.js`, qualité haute ; vache, chèvre, mouton)

La strie gris-bleu à bord net derrière l'œil des têtes claires (Hereford, Charolais, saanen, mérinos…) est l'ombre des
oreilles et des cornes, minces et tout près de la joue. Leur ombre est reculée le long du rayon, dans la passe d'ombre
seulement : la matière d'ombre (`customDepthMaterial`) recule leurs sommets de 65 cm pour la vache, 30 cm pour la chèvre
et le mouton, à la taille de la bête (`SELF_SHADOW_GAP` ; part des oreilles et des cornes : `cowPart.x`, `cowAux.x` ;
`goatPart.x` et le nouvel attribut `goatEar` ; `sheepEar`, et une matière d'ombre pour le maillage des cornes du
bélier). Leur ombre ne tombe plus sur la tête, toujours au sol. La première passe mettait un biais de 30 cm sur la tête
qui reçoit l'ombre : une lisse, un râtelier, un barreau à moins de 30 cm de la tête n'y portaient plus d'ombre (barre de
4 cm à 0,12 / 0,25 / 0,4 m, pixels ombrés : main 1636 / 2622 / 3264, biais 0 / 45 / 1521, maintenant 1636 / 2622 /
3263), et le bas de la joue et le naseau gardaient une tache au soleil bas (taureau Hereford 9 h : 2768 pixels). Ombre
propre sur la tête claire dans le jeu (36 vues, 3 heures × 6 caps × 2 côtés, même bête AVANT/APRÈS, disque autour de la
tête) : taureau Hereford 65 029 → 448 pixels assombris de plus de 10 %, Charolais 32 877 → 643, vache Hereford 59 265 →
2 544, bouc saanen 7 652 → 3 273 (le reste : la barbe sous le menton), brebis mérinos 1 726 → 243. Coût : quatre
opérations par sommet de la passe d'ombre ; un flottant par sommet (chèvre, mouton : ≈ 6 Ko par gabarit).

### Van : deux moutons ou chèvres dans une place (`Vehicle.js`)

Une place de van (1,95 m entre la barre de poitrail et la barre arrière, 0,84 m de large) recevait deux moutons ou
chèvres l'un 0,95 m derrière l'autre, au milieu ; une chèvre mesure 1,3 à 1,6 m du nez à la queue (le bouc × 1,12) :
ils se traversaient (10 s au repos, sommets après le squelette : 2 boucs col noir 44 cm, 2 chèvres alpines 32, bouc +
chèvre 35-42, 2 béliers suffolk 16, mouton + bouc 36). Maintenant chacun prend d'abord une place vide, tant qu'il en
reste pour les voyageurs pas encore montés (`freeStall`) ; à deux, celui de devant a le nez sous la barre de poitrail,
contre la séparation, celui de derrière la pointe des fesses à la barre arrière, contre la paroi (`stallPose`,
`smallFit` : longueur et largeur mesurées sur le maillage, toison comprise) ; seul, il reste au milieu ; le premier se
range à pas lents quand le second monte. 2 chèvres alpines 0 cm, bouc + chèvre 0-2, 2 béliers suffolk 0, 2 boucs col
noir 9, bélier + bouc 16-18 (la place ne peut pas les contenir), cornes dans la paroi en tournant la tête 4 cm au plus
(`tests/ruminantFinish.test.js`).

### Demi-tour sur place et petit pas : les sabots piétinent (`sheepReal.js`, commun au mouton, à la chèvre et à la vache)

Quand le corps tourne sur place ou avance à peine (`trackMotion` : rotation qui domine, ou moins de 22 % de la vitesse
du pas), le clip du pas n'est plus joué : l'animal reste sur son pose debout et **chaque sabot se lève et se repose à
son tour** (`shuffleSteps`, `pivotStep` : deux sabots au plus en l'air, jamais deux de la même ceinture), le sabot
levé posé un peu en avant de là où le corps l'entraîne. L'allure qui repart entre calée sur les sabots posés
(`matchPhase`). La rotation suit ce que les sabots peuvent tenir (`turnRate`, `steer` : sur place, au rythme des pas ;
au pas, le cercle de virage que tiennent les sabots ; il ralentit quand sa cible est dans ce cercle ; plus vite quand
il suit le troupeau, sa mère ou la joueuse) et le sabot levé est posé du côté où le corps l'entraînera (`turnLead`).
Le temps de se retourner ne compte pas dans la promenade de l'entité (8 s au plus par demi-tour, `AnimalEntity.js`).
Glissement d'un sabot posé sur son appui (max), demi-tour de l'entité (`tests/ruminantFinish.test.js`) : mouton
suffolk 41-59 → 2-5 cm, agneau islandais 28-33 → 3-4 cm, chèvre alpine 36 → 4-5 cm, bouc col noir 47 → 4-7 cm,
chevreau 21-23 → 2-8 cm, vache holstein 110-117 → 9-11 cm, taureau hereford 44 → 4-9 cm, veau 68 → 8-11 cm ;
chèvre qui se retourne vers la barrière 36-52 → 3-6 cm. Le sabot levé balance de 9,5 à 10,5 cm d'une image à
l'autre pendant un pas sur place (moins qu'au pas : 14 à 16 cm). Promenade libre de 60 s (4 vaches) : 24-30 m
parcourus comme avant, aucun animal sur place plus de 0,6 s.

Reprise après la critique (régressions de cette passe) : pressé (il suit la joueuse ou sa mère, conduit par le chien),
il ne tourne plus deux fois plus vite au trot en traînant un sabot jusqu'à 54 cm : il se retourne presque sur place, à
pas plus vifs, puis repart (`steer`, niveaux de hâte). Sur place, il tourne autour du milieu de ses sabots (l'entité
suit), pas de sa racine ; la vitesse en se retournant est rapportée à sa taille ; la rotation freine tant qu'un sabot
posé attend son tour ; un sabot posé est corrigé au plus de 0,38 rad en long et 0,2 de côté (avant : 0,52 et 0,28,
membres lancés de côté), au-delà il est replacé d'un petit pas ; un sabot qui part se lève au moins comme dans le clip.
Glissement d'un appui (vraie entité, 30 images/s), main → première passe → maintenant : pressé Holstein 38,6 → 53,8 →
6,5 cm, Highland 26,9 → 48,3 → 4,5, Hereford 30,4 → 41,3 → 7,6, suffolk 30,4 → 36,2 → 6,0 ; demi-tour ordinaire
13-30 → 2,6-12,6 → 1,4-5,5 cm ; ligne droite ≤ 3 cm. Demi-tour de 175° : 0,9 s sur main (sabots traînés) → 3,5-6,2 →
3,0-3,8 s (pressé 2,0-2,7 s). Coût mesuré (node, `AnimalEntity.update` complet, 12 ruminants qui font demi-tour toutes
les 4 s, cinq passages alternés main / maintenant, machine peu chargée) : 57-62 → 65-78 µs par animal et par image
(médianes 59 → 73 µs, + 24 % ; ≈ + 0,3 ms par image pour 20 animaux) ; l'essentiel du temps reste la mise à jour des
matrices de three.js.

### Mèches longues couché (`ruminantHair.js`, commun à l'islandais, au col noir, à la poitevine et à la Highland)

Couchée, la mèche se replie aux trois quarts (la Highland à moitié : `hState.y` = 0,45 × couchée) — gardée à 88 %, rabattue, elle se lisait en éclats de papier sous le ventre de l'islandais —, se rabat
contre la peau (dans le shader, après le squelette : l'essentiel de ce qui l'écarte du corps est retiré, la longueur
gardée) et la part qui entrerait dans le sol s'étale dans l'herbe, vers l'extérieur et un peu vers l'arrière. La pose
figée couchée (caisse de voyage, van : `staticPose`) donne le repli tout de suite — les mèches pendaient droit sous le
ventre, à travers le plancher. Mèches visibles couché, vue de dessus : islandais 630 → 5558 pixels dont 208 → 2751
étalés hors du corps ; col noir 149 → 1340 ; poitevine 68 → 2034 ; de côté : islandais 1081 → 12 120. Coût : une
branche du vertex shader des mèches, prise seulement couché (uniforme), ≈ 30 opérations par sommet.

Reste (critique) : vues de près, les mèches rabattues sur le flanc se lisent encore comme des cartes plates rangées en
écailles, et vues de dessus leurs pointes font une frange en dents de scie autour du corps. Essayé dans la reprise
(gardé hors du dépôt) : longueur, repli et étalement tirés au hasard pour chaque mèche, étalement vers l'arrière,
éclairage des deux faces comme la peau, grain plus marqué, repli plus fort (85-100 %). Mesure des pointes vues de
dessus (pixels qu'une ouverture de 11 px enlève au contour, islandais couché) : 581 → 380 de près, 406 → 467 à 3 m,
827 → 697 endormi — pas de vrai progrès, la frange reste ; il faudrait d'autres mèches (plusieurs cartes plus étroites,
pointes en brins séparés) plutôt qu'un réglage du repli.
