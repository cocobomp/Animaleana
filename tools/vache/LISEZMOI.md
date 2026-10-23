# La vache et le taureau du jeu (Lyndon Daniels, CC0 ; Rocketbox « Bull_Brown_01 », MIT)

Toutes les **vaches, génisses et veaux** des 11 races du jeu sont un seul modèle : la vache de **Lyndon Daniels**
(« Realtime Rancher's 3D Model Pack », OpenGameArt, **CC0 1.0** — aucune attribution exigée, nous le remercions ; même
pack et même artiste que le cheval du jeu). Les **taureaux** (mâles adultes) sont **« Bull_Brown_01 »** de la
*Microsoft Rocketbox Avatar Library* (**MIT**, © 2020 Microsoft, notice gardée). Textes : `public/models/LICENSES/
lyndon-daniels-vache.txt` et `microsoft-rocketbox-taureau.txt`, `CREDITS.md`, écran « À propos » (`src/ui/credits.js`).
Fichiers du jeu : `public/models/cow.glb` (≈ 750 Ko) et `public/models/bull.glb` (≈ 550 Ko). Ce dossier les refait à
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
| blender | `taureau/prep_tex.py`, `taureau/make_bull.py` + `taureau/cow_models.py`, `taureau/cow_gait.py` | Taureau : textures TGA → PNG (normales OpenGL) ; os Biped renommés comme la vache, onglons fondus dans le paturon, os du **scrotum**, cornes longues en cible de forme `horns_long` (retirée au paquet) ; garrot 1,45 m ; 20 clips (les mêmes, plus `ear_flick head_shake swat tail_flick`), dont 14 gardés au paquet. |
| measure | `measure_cow.py`, `taureau/measure.py` | Mesures sur le maillage déformé, image par image : arêtes et os étirés, sabots sous le sol, glissement des sabots posés. |
| tex | `tex.mjs` | **Robe propre** : la photo est remplacée par une **carte de grain** (chaque texel rapporté à la moyenne de sa classe de poil, flou par îlot d'UV : plus de taches ni d'ombres de la photo, plus de « gris sale » ; taureau : moyenne prise à 3,5 texels au lieu de 12 — les boucles du front et l'anneau clair des yeux restaient en plaques, « face marbrée de bleu » sur une robe blanche) et un **masque** (R : taches de la photo, G : peau rose — nez, intérieur des oreilles, paupières —, B : gardé tel quel — bouche, cils, iris du taureau) ; trous sombres de la texture neutralisés ; yeux peints du taureau notés (`--eyeuv`) : seul l'iris sombre est gardé, les paupières claires et le blanc de l'œil prennent la robe (plus d'anneau pâle autour de l'œil, ni de « monocle » dans les lunettes de la Normande). |
| pack | `pack.mjs` | Canaux inutiles retirés (aucune translation d'os hors `root`, pas d'échelle animée), matières `cow_coat` / `cow_eye`, grain WebP 1024 q84, masque dans l'emplacement d'occlusion (512), géométrie meshopt ; mesures et réglages dans `scene.extras.cow`. Taureau : cible de forme `horns_long` retirée (le jeu courbe ses cornes selon la race ; `--morphs 1` la garde) et clips qu'il ne joue jamais retirés (`--drop calf_play,suckle,milk,ear_flick,tail_flick` : un taureau n'est jamais trait et ne tète pas) — 601 → 548 Ko. |
| pack | `lod.mjs` | Version réduite (vache ≈ 30 %, taureau ≈ 36 % des triangles, meshoptimizer) dans le même fichier (nœud `cow_lod`, mêmes sommets). |

`planche.html` (servie par vite : `/tools/vache/planche.html`, `?avant=1` pour la vache procédurale) rend des planches
de races, de têtes, de poses et de veaux : `window.planche.show({ cells, cols, cw, ch })` (par case : race, robe,
stade, sexe, mamelle, clip, instant, images jouées, vue `side|three|front|head|back|low|top|hoof`, zoom, LOD, licol,
bonnet anti-mouches, mère pour la tétée, râtelier, `xray` : sol transparent).

### Contenu des GLB

- **cow.glb** : 3 517 sommets, 6 092 triangles (LOD 1 826) + yeux (116 sommets) ; 39 os ; grain 1024 et normales en
  WebP, masque 512. Vitesses naturelles (m/s, taille 1) : pas 1,18, trot 2,54, galop 5,21.
- **bull.glb** : 1 878 sommets, 3 092 triangles (LOD 1 132) ; 40 os ; 14 clips (`idle walk trot run graze eat lie_down lie
  ruminate get_up sleep moo swat head_shake`) ; ni cible de forme ni clip de traite, de tétée ou de gambade ; yeux peints.
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

### Après la contre-vérification (beauté et jeu)

- **Taches fantômes** des robes unies (Charolaise, Highland, Retinta, Hérens rouge, Wagyu, Canadienne) : le grain du GLB
  garde la clarté des taches de la photo d'origine (masque `aoMap` R) ; il est ramené à la même clarté dedans et dehors
  (`COW_GRAIN` dans `cowCoat.js`, mesuré à l'écran : rapport 1,10). Écart de clarté tache/hors tache à l'écran : 9,6 à
  15,3 % → −2,4 à +1,2 %. **À remesurer si `tex.mjs` refait la texture de grain** (rendu au grain plat comparé au rendu
  normal, même lumière, dans les anciennes taches et hors taches).
- **Ventre blanc** (Prim'Holstein, Hereford) : limite nette et irrégulière, plus de dégradé gris sale sur le poitrail et le
  bas du flanc ; bas des pattes blanc à bord net au genou.
- **Races sans cornes et veaux** : les cornes « rentrées » ne sont plus deux pyramides couleur corne ; la corne est
  écrasée en petit dôme sous la peau du chignon (`pollHorns`, 6 mm chez l'adulte, 14 mm de bouton chez le veau), peint
  couleur robe.
- **Highland** : vraies mèches serrées (1 100 sur le corps), étroites (4,8 cm au plus), en deux cartes croisées, texture
  de brins fins (`lockTexture('fine')`) ; frange dense qui couvre les yeux (320 mèches) ; veau poilu (poil à 75 %, frange
  à 70 %, presque autant de mèches). **Coût** : vache 2 524 cartes (15 144 triangles), veau 2 404 (14 424), taureau
  1 892 (11 352) — il y en avait 920 et 632 ; un seul appel de dessin, caché au loin (au-delà de 16 m en basse).
- **Mangeoire** : les petites races (Highland, Hérens, Bretonne) relèvent l'encolure jusqu'au foin (bouche à 61-62 cm
  pour toutes les races, au lieu de 41 cm) ; le veau trop petit pour atteindre le bac broute au pied de la mangeoire
  (plus de museau dans le bac).
- **Sabots des veaux** : ils ne glissent plus aux allures ni quand ils gambadent sur place (seuils du sabot tenu en
  centimètres du monde — `lockWorld` — et rappel suivant la vitesse du clip ; glissement par appui > 1 cm : 16/71, 4/47,
  10/119 → 0 ; gambade 6-7 cm → 0).
- **Se coucher et se relever**, à l'arrêt, au pas ou en broutant : genoux et avant-bras à 1 cm au plus sous l'herbe
  (−3,7 cm avant), onglons repliés à 2,5 cm au plus (`hoofPts`, poses intermédiaires de « se coucher » et « se relever »
  dans les points de contact) ; taureau de Highland couché posé (+0,3 cm, il flottait d'1 cm).
- **Face des taureaux à face blanche** : la carte de normales du Rocketbox est adoucie sur la tête claire (plus de stries
  gris-bleu sous l'œil) ; **cornes de lutteuse** de l'Hérens propres à la vache (épaisses à la base, pointes en avant), plus
  celles de la Wagyu ; **Hereford** : limite rouge/blanc nette.
- **Jeu** : le veau rejoint sa place à la mamelle en longeant le flanc, s'y arrête et tète (au jeu, 120 s après une
  naissance : 0,06 % → 67 à 92 % du temps) ; il ne pousse plus sa mère (seul le veau s'écarte du corps de sa mère, une
  boîte et non un cercle) ; **traite** (`Game.collect`) : la joueuse fait le geste, face à la mamelle, mains aux trayons ;
  **van** : un bovin trop long pour sa stalle (taureau charolais) est réduit de 15 % au plus, sa croupe reste devant la
  barre arrière (18 cm au-delà avant ; seule la queue la dépasse).
- Tests : `tests/cowCorrections.test.js` (robe, chignon, Highland, mangeoire, sabots des veaux, se coucher et se relever,
  cornes) et `tests/cowEntity.test.js` (tétée par l'entité, traite par `Game.collect`, van) — déterministes.

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
- **Taureau** (mâle adulte ; le veau mâle et le jeune taureau restent sur la vache de Lyndon Daniels, mamelle rentrée) :
  son modèle (Rocketbox), plus massif ; cornes de sa race — sans cornes (Charolaise, Angus), longues refaites le long
  d'une courbe (`bullHorn` : Highland à l'horizontale sur le côté, pointes tournées vers l'avant et relevées, épaisses à
  la base ; Retinta en lyre), de lutteuse portées en avant (Hérens) ; poil long et frange de la Highland semés aussi
  entre ses sommets (1 900 sommets, deux fois moins que la vache : 946 mèches croisées, 1 892 cartes) ; taches calculées pour les robes pie, au
  seuil de la race (`bullPie` : Bretonne pie noire) ; lunettes de la Normande en tache allongée au bord irrégulier ;
  face blanche sans marbrures (creux du grain d'une robe claire réchauffés, sinon gris-bleu sous le ciel) ; jamais trait
  ni tété (pas de mamelle, pas de clip ; la tétée ne choisit qu'une mère) ; contre les mouches, il chasse de la queue ou
  secoue la tête. **Veau** : tête plus grosse, pattes et oreilles plus longues, sans
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
(robe, yeux, ombre de contact ; + 1 pour les mèches de la Highland de près). Au loin (au-delà de 16 m de l'œil en
basse — la caméra normale du téléphone voit les vaches à 10-14 m —, 26 m en haute ; jamais raccourcie pour le veau),
version réduite, mèches cachées et animation une image sur deux ; hors champ, une image sur trois. Coût du seuil de
16 m (basse, caméra du jeu, 10 vaches à 7-14 m, toutes en maillage complet) : +33 k triangles, mêmes appels de dessin,
Game.frame au bruit près. **Licol et masque anti-mouches** : posés sur la vraie tête (`ruminantGear.js` : la tête du
gabarit coupée en tranches, rayon de la peau tout autour) — muserolle en biais autour du museau, montants, têtière
devant les oreilles, anneau de la longe sous le menton ; masque en coque claire sur le front et les yeux.
L'animation coûte plus que la procédurale (mixeur, sabots tenus, sol mesuré) mais le rendu, qui dominait, est divisé
par 2 à 7. Construction d'une vache : 1 à 40 ms dans le navigateur (le premier gabarit ≈ 0,1 s, partagé ensuite ;
la vache procédurale : 70 à 100 ms).

### Bovins avec des taureaux (après les corrections du taureau)

Mêmes mesures (`perf.mjs`), troupeau de 10 puis 20 bovins : un mâle sur trois (des taureaux et des veaux mâles), un veau
sur six ; puis 10 et 20 taureaux seuls. Avant = vache procédurale (GLB bloqués), après = vache de Lyndon Daniels et
taureau Rocketbox.

| | appels de dessin | triangles (scène) | triangles des bovins | Game.frame (médiane) | animation (médiane) |
|---|---|---|---|---|---|
| basse, 10 (2 taureaux) | 593 → 313 | 361 k → 274 k | 123 k → 17 k | 11,1 → 10,4 ms | 0,1 → 1,1 ms |
| basse, 20 (3 taureaux) | 962 → 346 | 489 k → 292 k | 248 k → 35 k | 14,5 → 11,5 ms | 0,3 → 1,8 ms |
| haute, 10 (2 taureaux) | 593 → 311 | 873 k → 483 k | 350 k → 43 k | 16,0 → 12,8 ms | 0,1 → 1,6 ms |
| haute, 20 (3 taureaux) | 827 → 336 | 1 199 k → 525 k | 700 k → 98 k | 22,0 → 15,9 ms | 0,3 → 2,7 ms |
| basse, 10 taureaux | 544 → 303 | 347 k → 267 k | 123 k → 11 k | 11,7 → 9,7 ms | 0,2 → 1,0 ms |
| basse, 20 taureaux | 871 → 324 | 457 k → 278 k | 248 k → 23 k | 13,7 → 10,4 ms | 0,3 → 2,2 ms |

Un taureau = 2 appels de dessin (robe, ombre de contact ; + 1 pour les mèches de la Highland de près), 3 092 triangles
(1 132 au loin) : moins qu'une vache. Géométries en mémoire (basse, 20 taureaux) 945 → 347, textures 158 → 50.

## La vache est proposée

`src/sim/species.js` : `'cow'` est dans `OFFERED_SPECIES` (en dernier) — toutes les espèces du jeu sont proposées.
`tests/vacheProposee.test.js` vérifie, avec la liste du jeu (pas un scénario), que tout revient pour elle : animalerie
(des vaches à la maison, les 11 races chez les éleveurs du monde ; aperçu et vignettes 3D, le taureau pour un mâle
adulte), refuge, van (remorque, foin, seau à lait), clients du vétérinaire et de la pension (au rang qui apporte les
vaches), classe « ferme » du concours de beauté, quêtes, grange, pré, abri et ranch, brosse à vaches, berger, traite des
femelles (jamais du taureau ni du veau), école vétérinaire (tri des cœurs, textes). Les tests des espèces proposées qui
jouent un scénario (`especesProposees.test.js`, `contreVerifEspeces.test.js` : seuls le cheval et le chien) fixent leur
liste et la rendent ensuite : ils restent justes.

## Finitions 2 (ruminants)

### Tête claire sans strie d'ombre derrière l'œil (`cowCoat.js`, qualité haute)

La strie gris-bleu à bord net derrière l'œil des taureaux et vaches à tête claire (Hereford, Charolais…) était surtout
l'ombre des cornes (et des oreilles), minces et proches de la joue (le rendu sans ombres, puis sans les cornes dans la
carte d'ombre, l'a montré). Biais de profondeur de l'ombre de 30 cm, à la taille de la bête, sur la tête seulement
(`HEAD_SHADOW_BIAS`, ajouté aux coordonnées d'ombre du soleil dans le vertex shader de la robe) : les ombres du décor
(abri, arbres, à plus d'un mètre) tombent toujours sur la tête, le corps garde le biais du soleil, les cornes et les
oreilles portent toujours leur ombre sur l'encolure et au sol ; `World.js` inchangé. Joue derrière l'œil (planche) :
3382 pixels assombris de plus de 10 % (jusqu'à 44 %) → 2 ; tête du taureau dans le jeu (16 vues, 8 h à 18 h) :
28 224 pixels clairs assombris de plus de 15 % → 590 (bord des naseaux). Coût : trois opérations par sommet de la robe.

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
chèvre qui se retourne vers la barrière 36-52 → 3-6 cm, correction des sabots 0,52 → 0,2-0,42 rad. Un demi-tour
prend ≈ 2,5 s au mouton, 3,4 s à la chèvre, 4 à 6 s à la vache (avant : 1 s, sabots traînés). Le sabot levé balance de
9,5 à 10,5 cm d'une image à l'autre pendant un pas sur place (moins qu'au pas : 14 à 16 cm). Coût (node, 12 ruminants
qui font demi-tour toutes les 4 s, machine chargée) : 64-86 → 72-119 µs par animal et par image (≈ +0,3 ms par image
pour 20 animaux). Promenade libre de 60 s (4 vaches) : 24-30 m parcourus comme avant, aucun animal sur place plus de
0,6 s.

### Mèches longues couché (`ruminantHair.js`, commun à l'islandais, au col noir, à la poitevine et à la Highland)

Couchée, la mèche garde 88 % de sa longueur (repliée aux trois quarts, elle disparaissait dans la toison), se rabat
contre la peau (dans le shader, après le squelette : l'essentiel de ce qui l'écarte du corps est retiré, la longueur
gardée) et la part qui entrerait dans le sol s'étale dans l'herbe, vers l'extérieur et un peu vers l'arrière. La pose
figée couchée (caisse de voyage, van : `staticPose`) donne le repli tout de suite — les mèches pendaient droit sous le
ventre, à travers le plancher. Mèches visibles couché, vue de dessus : islandais 630 → 5558 pixels dont 208 → 2751
étalés hors du corps ; col noir 149 → 1340 ; poitevine 68 → 2034 ; de côté : islandais 1081 → 12 120. Coût : une
branche du vertex shader des mèches, prise seulement couché (uniforme), ≈ 30 opérations par sommet.
