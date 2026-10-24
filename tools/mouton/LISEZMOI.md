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
  couvre) ; les tests du jeu le bornent (`avant` < 4, `arrière` < 3). En jeu, avec la cible « shorn » et le squelette
  des races, l'aisselle montait à ×9,3–10,1 (bande mouchetée) quand la cible servait de toison (mérinos 0,75) : elle
  ne sert plus qu'un peu (mérinos 0,15), le volume vient du gonflement du shader → ×3,5 à ×4,8 au trot et au galop.

## Dans le jeu

- `src/game/models/sheepReal.js` : construction (squelette par mouton, géométrie partagée par gabarit), races, laine,
  animation (`RealSheepAnim`), sol, LOD, hors champ. `src/game/models/sheepCoat.js` : matière (laine recolorée,
  boucles, mèches longues, tête et pattes, genoux noirs, cornes à anneaux). `src/sim/sheepLook.js` : réglages des
  races, des agneaux, toison selon l'état du jeu.
- **Races** (os, forme et shader, une seule géométrie) : mérinos (toison épaisse, laine sur la tête et les pattes,
  bélier à cornes en spirale), suffolk (tête et pattes noires, grandes oreilles tombantes, toison courte), Ouessant
  (le plus petit, garrot ≈ 0,4 m, souvent noir, bélier à cornes), nez noir du Valais (face noire, genoux et pieds
  noirs, boucles, toupet blanc bouclé sur le front, toison en grosses mèches bouclées, cornes pour les deux sexes),
  islandais (laine longue en mèches qui pendent, cornes, robes moorit etc.), mérinos australien (plus grand, toison
  très dense), cheviot (face blanche nue, oreilles dressées, toison nette). Faces sombres (suffolk, nez noir, Ouessant
  noir) : iris ambre, pupille horizontale, paupière plus claire, pour que le regard se lise ; petit reflet partout.
- **Volume de la toison** : gonflée dans le shader le long d'une normale lissée sur 7 cm (attribut `sheepPuffN`, sans
  arêtes), d'une part du volume lissée sur 9 cm (attribut `sheepPuffW` : la toison descend en pente douce sur
  l'épaule et la cuisse au lieu d'y faire une marche qui se replie), en grosses bosses lisses (bruit trigonométrique,
  le même côté CPU dans `puffAt`) et plis du cou du mérinos ;
  le gonflement est compté au sol (points du ventre, `skinPoint`), dans la boîte englobante et sous le collier. Le
  mérinos et le mérinos australien sont nettement plus gros que le cheviot.
- **Laine longue** (islandais) : mèches en cartes effilées, ondulées, à racine étroite (`ruminantHair.js`, commun avec
  le poil long des chèvres), semées à espacement régulier sur les flancs, le dos, la croupe et les cuisses, jamais en
  rang sous le ventre ; repliées couché, rentrées une fois tondu ; la racine suit la cible « shorn » du corps
  (attribut `hairD`, poids `hState.w`) : à moitié tondu, les mèches ne flottent plus au-dessus du dos. Sur le dos,
  elles partent sur le côté (jamais en épi). Une carte par mèche, un seul appel de dessin.
- **Agneaux** : tête et pattes plus grandes, laine courte et bouclée, sans cornes ; ils grandissent (bébé → jeune →
  adulte : le modèle est refait au changement d'âge).
- **Laine** : suit le jeu — pleine, tondue à la récolte de la laine (`a.woolCut`), puis repousse avec la production
  (`sheepFleece`), fondue en douceur (gonflement du shader, un peu de cible `shorn`). Mouton jamais tondu (neuf,
  agneau devenu adulte) : toison pleine et laine prête tout de suite (`settleFleece`, appelé par `tickProduce`).
  Salon (`Groomer` → `setCut`) : « tonte » et « court » raccourcissent la laine, « long » et « concours » la gonflent ; frais du jour (`Beauty` → `setFluff`).
- **Poses** : allures à leur vitesse (hystérésis pas/trot/galop, sabots tenus au sol), brouter, manger à la mangeoire,
  bêler (la bouche s'ouvre), se coucher (à genoux), couché, ruminer (mâchoire), dormir, se relever (arrière d'abord),
  gambader (agneau, à l'arrêt seulement : en se déplaçant il joue l'allure, sabots tenus), sauter (tour), venir.
  Bouche fermée au repos ; museau toujours au-dessus de l'herbe (encolure relevée vers l'avant). Sol : sabots,
  ventre, tête mesurés.
- **Arrêt** : l'allure qui s'efface est figée, les sabots posés restent tenus, puis chaque membre resté de travers se
  replace d'un petit pas (sabot levé : genou et canon pliés d'après une table mesurée sur le gabarit, `measureLift`).
- **Tétée** : l'agneau vient au pas jusqu'à la mamelle de sa mère (ancre « teat » sur le bassin, place corrigée par
  la bouche mesurée, encolure qui ajuste la hauteur) ; la brebis reste debout tant qu'il tète, un agneau ne tète que
  sa mère debout ; des jumeaux prennent chacun un trayon, de part et d'autre (`nurseSideOf`, ils ne se repoussent pas).
  En jeu, bouche ↔ trayon : 8 cm (médiane, jumeaux) au lieu de 0,9 à 1,1 m.
- **Chargement** : après les chiens (`Game.realSheepReady`), puis remplacement un mouton par image ; vignettes
  (portraits, enclos), van, salon, concours. Le service worker et la version à emporter prennent tous les
  `public/models/*.glb`.
- **Tests** : `tests/sheepReal.test.js` (déterministes : fichier, races, laine et gonflement, sol debout et couché,
  os, glissement, allures, gambade en courant, arrêts au pas et au galop, tête qui broute, tétée à la mamelle, mère
  debout, jumeaux chacun son trayon, laine longue qui suit la tonte, volume en pente douce, toison d'un mouton neuf,
  shaders bien formés, LOD, accessoires, crédits, espèce proposée).

## Perf (téléphone 390×844, Chromium SwiftShader sur une machine très chargée : seule la comparaison vaut)

Moutons à la bergerie, caméra qui voit tout le troupeau (`perf.mjs` de la vérification). Avant = mouton procédural
(GLB bloqué), après = Rocketbox.

| | appels de dessin | triangles (scène) | triangles des moutons | Game.frame (médiane) | animation des moutons |
|---|---|---|---|---|---|
| basse, 10 | 561 → 287 | 365 k → 269 k | 129 k → 14 k | 11,9 → 8,8 ms | 0,2 → 0,9 ms |
| basse, 20 | 818 → 312 | 482 k → 287 k | 263 k → 32 k | 18,6 → 10,7 ms | 0,3 → 1,1 ms |
| haute, 10 | 609 → 288 | 763 k → 463 k | 324 k → 24 k | 21,4 → 16,4 ms | 0,2 → 1,1 ms |
| haute, 20 | 931 → 313 | 1 099 k → 492 k | 666 k → 52 k | 55 → 24 ms | 0,3 → 3,2 ms |

Géométries en mémoire (basse, 20) 937 → 333, textures 114 → 59. Au loin (au-delà de 15 m de l'œil en basse — la
caméra normale du téléphone voit le troupeau à 9-12 m ; 13,5 m pour revenir au maillage complet —, 18 m en haute ; la
distance n'est jamais divisée par une taille inférieure à 1 : l'agneau garde son maillage aussi loin que l'adulte),
version réduite, mèches de l'islandais cachées et animation une image sur deux ; hors champ, une image sur trois. Coût
du seuil de 15 m (basse, caméra du jeu, 10 et 20 moutons) : +12 à +16 k triangles dans la scène, mêmes appels de
dessin, Game.frame inchangé au bruit près. Construction d'un mouton :
≈ 6 ms (node), gabarit partagé ensuite.

## Finitions 2 (ruminants)

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

Planche (`planche.html`) : la pose figée donne la laine et les mèches tout de suite, comme en jeu.
