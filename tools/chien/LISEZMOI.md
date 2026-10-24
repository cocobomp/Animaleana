# Chiens réalistes : fabrication de `public/models/dog_shiba.glb` et `dog_jack.glb`

Deux modèles d'artistes servent aux 40 races de chiens du jeu, tous deux sous licence
**Creative Commons Attribution 4.0** (CC BY 4.0 : l'attribution est obligatoire, voir `CREDITS.md`,
`public/models/LICENSES/` et, dans le jeu, ❓ Aide → ℹ️ À propos) :

- **chiens moyens et grands** : « Animated Dog Shiba Inu » par **quander**
  <https://sketchfab.com/3d-models/animated-dog-shiba-inu-9abfce885a834399b2c3ccaed51cd474> (riggé et animé :
  immobile, assis, secouer la patte, roulade) ;
- **petits chiens** (race de taille ≤ 0,65, `SMALL_DOG` dans `src/sim/dogLook.js`) : « Jack Russell » par
  **FainoDS (doinspire)** <https://sketchfab.com/3d-models/jack-russell-45f1bbf15b67488fba6bea6822d8a7c3>
  (maillage seul, en trois pièces, sans squelette utilisable).

## Chaîne de fabrication (Blender 4.2 en mode `--background`, puis glTF-Transform)

`build.sh` enchaîne tout (variables `BLENDER`, `SRC` : dossier des deux GLB téléchargés, `WORK`, `GT` : dossier
avec `node_modules/` de `@gltf-transform/core`, `extensions`, `functions`, `meshoptimizer` et `sharp`).

1. **`models.py`** : ce qui est propre à chaque modèle.
   - *Shiba* : 57 os gardés sur près de 200 : les os de détail (doigts, lèvres, sourcils, plis, narines, bouts de
     chaîne `_end_`, moustaches) sont **fusionnés** dans leur parent (poids additionnés) ; les os restants sont
     **renommés** pour le jeu (`root` au centre de gravité, `pelvis`, `spine1…`, `neck1…`, `head`, `jaw`,
     `tongue1…`, `ear1L/ear2L`, `tail1…`, membres `scapL/humerusL/radiusL/metacarpusL/toesL`,
     `femurL/tibiaL/metatarsusL/htoesL`, `breathe`…) en deux temps (Blender renomme aussi les groupes et les
     courbes d'animation : un renommage direct faisait des doublons) ; les paupières sont rattachées aux yeux ;
     les 560 sommets des **moustaches** sont retirés (des pointes qui traversaient tout une fois la tête déformée).
   - *Jack* : les trois pièces (corps, yeux, intérieur de la gueule : la pièce oubliée laissait le museau
     **troué et déchiré**) sont réunies et **soudées** ; mise à l'échelle. **Gueule** (`jack_mouth`, une fois à
     l'échelle du jeu) : le modèle n'a ni os de mâchoire ni langue (le creux rose de la mâchoire du bas est sa peau) ;
     un os `jaw` (enfant de `head`, charnière à la commissure `JACK_HINGE`) reçoit les poids de la mâchoire du bas
     (sous la ligne des lèvres, devant la commissure : 334 sommets, pris sur la tête), une **langue modelée**
     (`JACK_TONGUE` : 308 sommets, du fond de la gueule jusque derrière les incisives du bas, dessous posé dans le creux
     en V de la mâchoire par lancers de rayons, dessus sous la ligne des lèvres, section en lentille, bout arrondi) est
     ajoutée au bout de la peau, portée par quatre os `tongue1…4` (enfants de `jaw`, poids fondus d'un os à l'autre) ;
     puis mâchoire et langue sont tournées de `JACK_JAW_OPEN` (0,17 rad) pour joindre les lèvres : le repos du GLB est
     la gueule fermée (avant : refermée par le jeu, `jackMouthClose`, sans os — la gueule ne s'ouvrait jamais). Mâchoire
     et langue sont des os du jeu (`game_bones` : aucune clé dans les clips).
2. **`autorig.py`** (jack) : squelette du même plan que celui du shiba, poids par chaleur (heat weights) ; os des
   **yeux** (sommets des yeux, séparés par côté) et des **oreilles** (base → pli → bout, poids géométriques sur le
   lambeau mince repéré par épaisseur et remplissage limité). Réglages du jack dans `models.py` (`JACK_RIG`) :
   hauteur du coude, du jarret, de la hanche et du grasset, et `buttock` (le poids du fémur débordait sur la croupe :
   rendu au bassin derrière la hanche et au-dessus du grasset — assise, la croupe ne se déchire plus) ;
   `buttock_knee` : la peau du grasset, déjà portée en partie par le tibia, reste au fémur (passée au bassin, elle était
   tiraillée entre le bassin et la jambe : une trentaine de triangles étirés au grasset du teckel assis).
3. **`make_dog.py`** + **`dog_gait.py`** : animations.
   - orientation (le chien regarde +z), garrot à 0,57 m, courbes d'échelle retirées ;
   - le shiba écrit ses **poses faites main** (repos, assis, patte, roulade) et ses **poses couchées générées**
     (couché, endormi), une fois au sol, en rotations du monde (`--dump-retarget`, à la fin de sa fabrication) ; le
     jack les reprend (retarget) sur son squelette : repos, roulade, **assis, couché, endormi**. Les poses au sol
     (`ground_poses` dans `models.py`) sont **reposées** : le corps descend jusqu'à ce que la croupe, le ventre ou les
     avant-bras touchent le sol, puis chaque membre est replié par cinématique inverse, pied à plat (`ground_leg` :
     angle du métapode, grasset vers l'avant). (Les assis et couché du jack générés jusqu'ici n'en étaient pas :
     croupe en V, cuisse qui pendait, couché croupe en l'air.) « Donner la patte » part de cet assis : l'antérieur
     droit reste posé, le gauche se lève devant le poitrail (`paw_lift`) ;
   - **mélanges en repère local** (`dog_gait.blend_local` : transitions, saut, patte) : chaque os garde sa place au
     bout de son parent (mélangées en espace armature, les têtes d'os s'écartaient le long de la corde et gardaient
     une translation animée — yeux sortis de la tête dans le jeu, clips plus lourds) ;
   - **allures générées** par trajectoires de pieds et cinématique inverse : `walk`, `trot`, `run` (galop) ;
     leurs **vitesses naturelles** (pieds posés immobiles) vont dans le GLB (`extras.dog.naturalSpeeds`) :
     shiba 0,95 / 2,40 / 5,72 m/s, jack 0,83 / 2,10 / 5,02 m/s ; le jeu joue chaque clip à vitesse réelle ÷
     vitesse naturelle (÷ longueur des membres de la race) ;
   - **positions et gestes** : `sit` (assis), `paw` (donner la patte), `lie` (couché), `sleep` (endormi, tête
     posée), `sniff` (renifler), `eat`, `drink` (langue), `wag`, `bow` (révérence), `jump`, transitions `sit_down`,
     `stand_up`, `lie_down`, `get_up`. Renifler, manger, boire : l'encolure descend, le corps bascule un peu
     (`sniff_pitch`), les **antérieurs restent tendus** (`front_planted` : métacarpe à son angle de repos, seuls
     l'épaule et le coude se plient — visés comme une allure à l'arrêt, le carpe se pliait vers l'avant, pattes
     croisées sous le museau) ; le pied visé reste sous l'épaule à la hauteur du sol (`under` dans les réglages de
     membre de `dog_gait.py`), un peu en avant pour renifler, manger et boire ; seules l'encolure et les épaules
     descendent (`SNIFF_PITCH` 0,3 : à 0,12 la truffe restait à 18 cm du sol) ;
   - **gabarits** (`gabarits` dans `models.py`) : le jeu raccourcit ou allonge les membres des races (teckel 0,5,
     corgi 0,55, carlin 0,72, lévriers 1,22 à 1,28, chiots 0,8 environ) en gardant les rotations des clips ; la foulée
     des antérieurs ne correspondait plus à celle des postérieurs (pieds qui patinent, antérieurs qui ne touchaient
     jamais le sol, galop disloqué des lévriers), les poses au sol non plus. Pour chaque gabarit, des clips sont
     refaits sur un squelette « virtuel » (`gabarit_rig`) aux membres déformés comme dans le jeu (`deformDog`,
     étape 1 : longueur le long de l'axe épaule → poignet, épaisseur `legW`/`paws` autour de lui), le sol de chaque
     membre à la hauteur où son pied est alors monté ou descendu (`ground` dans `dog_gait.Rig`) ; seules leurs
     rotations sont gardées (le jeu place les os de la race). Shiba : `long` (1,25 : allures, assis, patte, couché,
     endormi, renifler, manger, boire et leurs transitions) et `court` (0,82, chiots : allures) ; jack : `court`
     (0,52 : allures, assis, patte, renifler, manger, boire, révérence, transitions) et `trapu` (0,74 : allures). Clips
     nommés `walk_long`, `sit_court`… ; longueur et vitesses naturelles de chaque gabarit dans `extras.dog.gabarits` ;
     révérence du gabarit court (`gab_bow`) : l'avant descend autour des pieds avant, les postérieurs restent tendus
     au sol par cinématique inverse (avant : pieds arrière à 6 cm du sol). Un assis généré (`sit_gen=True`,
     `gab_sit_gen` : rotation autour de l'épaule jusqu'à une hauteur de hanches, postérieurs repliés sous le corps,
     antérieurs `under`) a été essayé pour le court et le trapu sans être retenu : teckel et corgi gardaient les
     hanches à 13 cm (contre 6) et le dos plus plat (8–11° contre 14–18°), le ventre profond touchant le sol avant
     la croupe ; le yorkshire, du gabarit trapu, perdait son assis (dos à 6°, pieds arrière à 5 cm). Assis du gabarit
   court (`gab_sit`, `sit_flex` du gabarit : cinq angles) : reins fléchis avant la pose — bassin rentré autour de
   spine1, bas du dos autour de spine2 puis de chest, poitrail redressé, tête relevée en deux moitiés (base de la tête
   et dernier os de l'encolure : tout à la base, l'encolure se cassait en équerre) ;
   - réglages des poses générées (`MODELS` dans `models.py`, utilisés seulement quand la pose n'est pas reprise du
     shiba) : assis `sit_flex`, `sit_tuck`, `sit_femur`, `sit_hip`, couché `lie_pitch_max`, `lie_elbow`, `lie_wrist`,
     `lie_fold` ; saut `jump_tuck` (postérieurs ramenés sous le corps à la réception : le maillage ne se déchire
     plus) ;
   - mise au point : `--hook script.py` exécute un script dans le contexte de `make_dog.py` (après le squelette,
     avant les poses) puis s'arrête ;
   - **pieds au sol** : sur chaque image, le chien est relevé de ce qui passe sous le sol (sommets des pieds et du
     corps), rapport JSON (`pawMin`, `bodyMin`, `muzzleMin` par clip) ;
   - les os que le jeu anime lui-même (queue, oreilles, paupières) n'ont plus de courbes ; `pose_tail` garde le port
     de queue enroulée du shiba ;
   - poses tenues longtemps (repos, assis, couché, endormi, patte, roulade, et celles des gabarits) : une clé sur 2
     ou 3 (`DECIMATE`), la respiration et le regard seuls y bougent.
4. **`pack.mjs`** : canaux constants ou d'échelle retirés, matières renommées (`dog_coat`, `dog_eye`), texture
   métal/rugosité retirée, ré-échantillonnage (`--animTol`, 5e-4 : 0,03° près), simplification (shiba : 55 % des
   triangles, bords gardés), textures
   **WebP** 1024, compression **meshopt** (volume de quantification commun : la peau partagée gardait sinon des
   yeux géants).
5. **`lod.mjs`** : version allégée dans le même fichier (`extras.lod` : index simplifiés à 30 %) pour les chiens
   lointains (`DOG_LOD_DIST` dans `dogReal.js`).
6. **`clips.mjs`** (à la main, après `build.sh`) : `node clips.mjs <jeu.glb> <refait.glb> <sortie.glb> clip1,clip2…`
   greffe des clips refaits sur le GLB du dépôt sans toucher à son maillage, à son squelette, à ses textures ni aux
   autres clips (données non re-quantifiées). Le shiba refait aujourd'hui avec les mêmes sources n'a pas le maillage
   du dépôt : même nombre de triangles mais pas les mêmes (simplification), 10 743 sommets au lieu de 10 795 — des
   éclats de 1 cm de plus aux dents du lagotto et un triangle de l'arcade retourné (tests de tollerLagotto.test.js).
   Un clip refait ne doit pas changer la peau des 20 races du shiba : `dog_shiba.glb` est le GLB du dépôt où
   `lie_long`, `sleep_long`, `lie_down_long` et `get_up_long` sont ceux de `build.sh` (finitions 2, couché du gabarit
   long ; +16 Ko, la compression des clips n'est pas refaite à l'identique).

Fichiers obtenus : `dog_shiba.glb` 0,89 Mo (17 800 triangles, 5 300 au loin, 57 os, 20 clips + 17 de ses
gabarits), `dog_jack.glb` 0,61 Mo (15 500 triangles, 41 os, 19 clips + 15 de ses gabarits ; mâchoire et langue :
+600 triangles, +5 os, +8 Ko). (Avant les gabarits et
les poses reprises du shiba : 0,86 et 0,51 Mo ; les clips des gabarits sont allégés par `DECIMATE` et le
ré-échantillonnage, les couchés du gabarit court du jack n'ont pas été faits.)

## Dans le jeu (`src/game/models/dogReal.js`, `dogCoat.js`, `src/sim/dogLook.js`)

- **Races par les os** (`DOG_BUILDS`) : longueur et épaisseur des membres, dos, tour de poitrine, ventre relevé,
  encolure, taille et largeur du crâne, museau (longueur, largeur), oreilles (dressées, en chauve-souris,
  semi-dressées, en bouton, en rose, tombantes, longues), queue (enroulée, faucille, sabre, loutre, panache,
  fouet, carotte, écourtée), poil (épaissi : collerette, franges ; ou raccourci pour les races à poil ras),
  frisé ou soyeux (relief du shader). Les sommets et les têtes d'os sont déplacés ensemble : le squelette de chaque
  race garde les noms et les rotations de repos du GLB, les clips s'y appliquent tels quels. Les pieds restent au
  sol (le chien descend de ce que ses membres ont perdu). La queue est amincie ou allongée autour de la chaîne de
  ses os (`tailShape`, section ramenée vers un cercle : plus de lame plate). Oreilles dressées du jack : le
  lambeau replié d'origine est caché sous la peau du crâne, des coques prennent sa place. Les yeux suivent la
  tête de la race (os des yeux déplacés une seule fois avec la peau).
- **Pièces modelées** (`dogParts.js`, fondues dans la géométrie de la robe : aucun appel de dessin en plus) :
  - *oreilles pendantes* (`buildPendantEars`, types `floppy`, `long`, `drop`, `rose` ; `earShape` : longueur,
    largeur, attache, pli, rideau qui tombe le long de la joue, frange du setter/golden, frisure du caniche) ;
    l'oreille dressée d'origine est effacée du crâne (`earSkullHide` : ramenée sur la surface du crâne interpolée,
    poids reportés sur l'os de la tête) ;
  - *visage* (`faceShape`, modèle du shiba) : joues, bouche neutre (plus de sourire de shiba), babines, bajoues,
    crâne plat, stop, museau carré, paupières ouvertes ou plissées (`eyeOpen` négatif : petits yeux enfoncés de
    l'akita) ; dents et pointe de la langue rentrées pour toutes les races du shiba (la pointe claire de la langue,
    couleur du museau, dépassait sous la truffe comme une incisive) ; gueule du jack fermée (`jackMouthClose`) ;
  - *pompons et toupet* (`buildPompons`) : toupet, bracelets et bout de la queue du caniche, repliés par le shader
    selon la coupe du salon (`setCut`, attribut `cmpPom`) ; toupet seul du yorkshire (une mèche haute et étroite,
    effilée vers le haut, plus une boule posée sur le crâne).
- **Mémoire** : les pièces modelées sont rangées une fois par modèle (`partLayout` : pelage | pompons | oreilles
  pendantes) et la géométrie de chaque race reprend cette disposition (`mergedCoatGeo`) : attributs de peau
  quantifiés (poids sur 8 bits, index sur 16 bits), oreilles absentes exclues par `drawRange`, pompons absents
  repliés sur leur articulation. 20 races en jeu : +14,9 Mo de tas JavaScript (72b1684 : +13,5 ; avant ce
  rangement : +28,4).
- **Nouveaux réglages de race** (`DOG_BUILDS`, valeurs neutres dans `ONE`) : `earLen`, `earW`, `earSet`, `cheek`,
  `mouth`, `flews`, `jowl`, `skullFlat`, `stop`, `square`, `eyeOpen`, `tailTaper` (effilement de la queue selon
  son port, `TAPER`), `pompons`, `beard`, `pear` (tronc en poire du bouledogue), `earTilt`, `underbite`, `fluffy`
  (relief touffu des spitz), `wrinkle` (rides du carlin : sillons lissés par la taille à l'écran, sans scintiller),
  `chest` (poitrine profonde et ventre levretté des lévriers), `paws`, `neckSlim` (encolure lisse des poils ras,
  sans collerette), `topknot`, `tailRound` (section de queue ronde, sinon selon le port : `ROUND`), `ringlets`
  (bouclettes serrées du lagotto, voir plus bas), `tailAction` (queue relevée haut en action : panache du toller).
  Ces deux derniers (et tout réglage ajouté après eux : `KEY_IF_SET`, `dogLook.js`) n'entrent dans la clé du gabarit
  que s'ils servent : la longueur de la clé donne la phase des franges et des bosses frisées des oreilles tombantes
  (`dogParts.js`) — ajoutés à toutes les clés, ils changeaient les oreilles du golden, du setter, du caniche…
- **Retriever de la Nouvelle-Écosse** (`toller`, ≈ 48 cm : taille 0,85) : plus compact que le golden, tête en coin
  (`muzzleW` 0,92), oreilles triangulaires courtes attachées haut (`earLen` 0,78, `earSet`), franges légères,
  panache `brush` (au repos dans le prolongement du dos, bout relevé) relevé haut au trot, au galop et au jeu
  (`tailAction` : jusqu'à 0,6 rad de plus que les autres races, jamais couché sur le dos). Robe (`coatPlan`,
  bicolore du toller) : roux ou orange vif, liste étroite sur le chanfrein, bout du museau, au poitrail une **goutte**
  blanche (`chestOnly`, uniforme `cLight.y`) qui part étroite de la gorge, s'élargit et s'arrondit vers le bas, au bord
  déchiré, sans le ventre ni la bande de la gorge d'une épaule à l'autre (elle faisait une bavette carrée), pieds blancs
  jusqu'au paturon, bout de la queue blanc ; franges, ventre et dessous de la queue plus clairs (`light`,
  `cLight.x`/`cLightC`) ; « Roux foncé » aux marques discrètes (bout de la queue, doigts, petite goutte, ni liste ni
  museau : sans aucun blanc, on le prenait pour un golden roux foncé).
- **Lagotto romagnolo** (`lagotto`, ≈ 45 cm : taille 0,8) : silhouette carrée (dos court 0,85, membres épais), tête
  large et ronde, museau court et large, oreilles moyennes bouclées, queue en faucille, sourcils et barbe frisés
  (`beard`). Ses **bouclettes serrées** (`ringlets`) : dans la géométrie, des touffes de boucles (bruit cellulaire
  `curlTufts`, cellules de 2,5 cm, **lissé sur le maillage** par `ringletTufts` — sans lissage, les grands triangles
  de la tête se dressaient en éclats) festonnent la silhouette, jusque sur le crâne, les joues et le bas des pattes ;
  sur la tête, la poussée du poil et sa direction sont lissées de proche en proche (`smoothOnMesh`) avant d'être
  appliquées, et **rien n'est poussé autour de l'œil** (moins de 3,5 cm, en fondu jusqu'à 6 cm) : les petits
  triangles de la paupière et du pli de l'arcade, deux couches de peau du modèle qui se chevauchent, poussés le long
  de normales divergentes, se croisaient en éclats au-dessus de l'œil. Dans le shader (`cCurl.z`, `cmpCurls`), des
  **mèches de laine enroulées** : chaque cellule d'un pavage (axes tournés, déformé par `cmpWarp`) porte un dôme de
  laine adouci et deux arcs opposés — une spirale, pas un anneau —, mesurés **dans le plan de la peau** (normale de
  repos tirée des pas d'écran) et additionnés à ceux des voisines ; des sphères coupées par la peau ne laissaient que
  des anneaux nets et épars (des rondelles, des écailles, des cratères). Deux pavages décalés pour les boucles de
  1,7 cm (couverture de toute la robe), un pour les grappes de 4 cm à mi-distance (presque sans arcs : leurs spirales y
  faisaient des cratères), chacun effacé à moins de quatre ou cinq pixels par boucle. Le centre d'une cellule ne
  s'écarte que d'un quart de cellule, une mèche ne dépasse pas les deux tiers : les **2 × 2 × 2** cellules qui entourent
  le point suffisent. Le **relief** vient de la pente calculée des mèches, projetée sur les pas d'écran de la position
  de repos (`dot(cmpCurlG, dFdx(vCmpPos))`) : tirée de `dFdx`/`dFdy` d'une hauteur fine, constante par carré de deux
  pixels, elle faisait un damier 2 × 2 sur le corps et les chiots. Pas de frisure douce (`cCurl.x` à 0) en plus.
  Laine mate (rugosité 0,86). Oreilles bouclées en triangle aux bouts arrondis, section en lentille (`earShape` :
  `se`, `lumpy`), bosses modelées larges et douces (tirées rangée par rangée, elles empilaient des planches), surface
  de la tête sous l'oreille lissée le long de l'oreille, relief des mèches réduit au quart sur l'oreille (ses
  coordonnées de repos, une oreille de référence plate, y étiraient le relief en marches). **Truffe peinte**
  (`cNose`, `cNoseC` : brune, plus claire sur la robe orange, bord net adouci d'un pixel, deux narines) au lieu de
  celle de la texture, qui faisait dans la barbe une tache grise floue et une bavure. Assis, la laine dense s'écrase peu
  (`bodyAllow` réduit) et le métatarse arrière, couché au sol, garde un poil ras : jarrets à −0,8 à −1,2 cm (−1,6 à
  −1,9 cm avant ; golden −0,7). Robes : blanc cassé, taches marron ou orange (tête colorée, plaques), rouan marron (fond
  brun clair chaud moucheté finement de marron, mèches de 5 mm fondues en leur moyenne de loin — à 2 cm sur un fond
  grisé, un camouflage kaki), marron, orange. Coupe du salon `lagotto` (`setCut` : tronc raccourci de 1,25 fois le
  poil, encolure raccourcie, boucles égalisées en couleur et en relief sur le tronc coupé, pattes bouclées gardées mais
  raccourcies — bas 0,35 fois le poil, haut des pattes `cCutLeg` 0,6 fois —, dessus de la tête bien arrondi, +0,85 fois
  le poil) ; sans coupe, ses boucles naturelles (pas de pompons).
- **Coût du pelage du lagotto** (swiftshader, 800 × 800, `perf-chiens.html` du correcteur) : les mèches coûtent
  +19 à +37 % de près et +9 à +16 % à mi-distance par rapport au même lagotto sans elles (avant : +39 à +63 % et
  +35 %) ; le lagotto reste 1,4 à 1,6 fois le golden de près (sans ses boucles, déjà 1,15 à 1,3 fois : plus de pixels
  couverts), 1,5 à 1,6 fois avec 10 ou 20 chiens (avant 1,55 à 1,7), autant que lui de loin.
- **Queues** : formes des ports bas (`sabre`, `otter`, `plume`, `whip`) en courbe de puissance (`th = a0 −
  total·(i/(n−1))^pw`) : la queue descend d'abord peu puis pend, au lieu d'une colonne verticale ; crochet du
  galgo relevé au galop ; panache du spitz (`flat`) couché sur le dos.
- **Chiots** : tête plus grosse, museau court et rond, yeux ronds grands ouverts, pattes courtes aux gros pieds,
  ventre rond, oreilles pas encore dressées ; front lisse, stop doux, ni bajoues ni babines, bouche à peine
  relevée (`dogBuild` : plus de tête de vieux chien).
- **Robes par shader** (`coatPlan`) : unie, dessous clair, feu (noir et feu, selle du berger allemand), bicolore
  (urajiro du shiba, masque du husky, plastron du boxer, collier du colley), tricolore, merle (plaques déchirées
  de toutes tailles), pie (plaques, tête colorée), dalmatien, moucheté, bringé (stries fines, effacées en teinte
  moyenne de loin), charbonné, masque du carlin ; liste qui suit le chanfrein (`cmpBlaze`) ; iris de la couleur
  des yeux de la race (bleu du husky), reflet dans l'œil ; robes noires lustrées (reflet en bord, `cSheen`) avec
  le tour des yeux éclairci ; les yeux, la truffe, la langue et les coussinets gardent la texture d'origine.
- **Animation** : mélangeur three.js avec fondus, allure choisie avec hystérésis (`pickDogGait`) au même nombre
  de Froude pour toutes les tailles (vitesse rapportée à la racine de la hauteur des membres : un chihuahua ne
  galope plus à la vitesse de flânerie), postures (assis, couché, endormi), actions (manger, boire, renifler,
  frétiller), regard, paupières, oreilles et queue vivantes, halètement, traction en laisse (encolure tendue, sans
  ralentir les pattes), chien de troupeau ; modèle de repli (chien sculpté par le code) pendant le chargement puis
  échange (`Game.onRealDogs` / `swapRealDogs`). Gueule fermée au calme (angle `JAW_CLOSED` depuis la pose de repos
  du GLB).
  - **gabarit** de la race (`pickGabarit` : longueur des membres et taille des pieds les plus proches, sinon le
    modèle d'origine) : ses clips remplacent ceux du modèle (`dogClips` : `walk_court` joue `walk`), ses vitesses
    naturelles donnent celles de la race ;
  - os à translation animée : le décalage de la race est retiré avant que le mixeur note la pose d'origine, puis
    ajouté après chaque mise à jour (`applyShift`, sinon il comptait deux fois dès qu'une transition animait les
    yeux) ; hanches ancrées (`hipE` : les clips tournent le corps autour de la racine du modèle, une race aux
    hanches déplacées décollait la croupe) ;
  - tours du spectacle et de l'éducateur : assis et couché par les transitions (`sit_down`, `lie_down`, plus vives
    sur commande), « donner la patte » depuis l'assis, fin de roulade par « se lever » (d'un bond si le salut suit) ;
    pendant le tour, la caméra se rapproche de l'artiste (de trois quarts, à 3 m environ : `CameraRig.focus.shot`),
    comme pour la photo du podium du concours de beauté (de face) ; en laisse, elle cadre la joueuse et son chien
    ensemble (`focus.pair` : visée entre les deux, recul selon l'écart) — laisse de 1,6 m (`LEASH_LEN`), mou dessiné
    pour cette longueur, coins à renifler devant la joueuse.
- **Au sol** (`RealDogAnim.ground`) : points d'appui de la peau mesurés une fois par race sur les poses (pieds,
  corps, queue, tête : `contactPoints`) ; au pas, le corps suit le pied le plus bas sans lissage (un pied est
  toujours posé : le chien qui tire en laisse ne flotte plus), au trot et au galop il est relevé tout de suite et
  redescend en douceur ; au pas, au trot et au galop, **pieds en appui tenus sur place** (`footLock`) : le bout des
  doigts (`toePts`, le point de la sole le plus en avant) est noté quand le pied se pose, le membre est tourné à
  l'épaule ou à la hanche pour l'y ramener, en long et sur le côté (deux passes), la correction s'efface en fondu
  quand le pied repart. C'est le clip qui décide de l'appui (pied à moins de 11 mm de son sol : posé ; relâché
  au-dessus de 16 mm), le fondu de relâche suit la hauteur du pied et la correction change d'au plus quelques
  millimètres par image : le pied ne saute plus de 2 à 5 cm en se posant ou en repartant (banc du trot : 5,1 cm →
  0,04 cm d'une image à l'autre pour un pied posé, test « un pied posé ne bouge pas de plus de 5 mm ») ; les vitesses naturelles sont mesurées sur le squelette de la race au même point
  (`measureNatural`). Glissement des pieds posés (banc de `planche.html`, 15 races et 2 chiots, 240 images) : 0 à
  3 % de la course au pas, 0 à 4 % au trot, 0 à 2 % au galop (avant : jusqu'à 22 % au pas pour le corgi, 32 % au
  galop pour le galgo). Assis, le corps bascule pour poser les pieds avant (`settleSit` : écart signé, pivot sur
  l'appui arrière, fondu selon l'avancement de la transition — le teckel se cabrait de 18 cm en une image) ; pieds
  avant sous le sol (caniche : 2 cm), le corps est relevé puis rebasculé autour d'eux ; pieds arrière en l'air
  (bouledogue, carlin : 2 à 4 cm), le membre tourne à la hanche puis au jarret pour les poser ; debout
  sur place (renifler, manger, boire), il se redresse pour garder les pieds arrière posés (`settleStand`) ; queue
  (port de la race aligné sur la courbe, relevée sans à-coup d'une image à l'autre) et tête relevées au-dessus du
  sol ; oreilles pendantes compensées quand la tête plonge ; roulade : peau entière mesurée (`skinLow`).
- **Équipement** ajusté au cou et au corps mesurés de chaque race (collier : bande plate `flatBand` dans
  `gearModels.js` ; manteau, accessoires du salon, nœud du concours de beauté, laisse accrochée à l'anneau du
  collier).

### Finitions vues au téléphone (correcteur des chiens)

Mesures dans `tests/dogFinish.test.js` (taille réelle sauf mention) :

- **Manteau** (`measureDog`) : coupes du tronc tranchées dans la peau de la race (contour des triangles coupés par le
  plan, centre commun pris sur les coupes du milieu, secteurs vides repris de la coupe voisine), coque liée au
  squelette. Races du jack : 80 à 96 % du dos sortait du manteau (dents de scie sur le teckel) → moins de 3 %,
  dépassement < 8 mm, debout et au pas, 12 races.
- **Collier** : anneau mesuré sur la peau sous le poil (enfoncé de 55 % du poil) et penché comme le cou (au plus
  0,7 rad au-dessus de l'horizontale : les os du cou du jack montent à la verticale) ; le poil est serré sous la bande
  dans le shader (`cCollar*`, `model.setGroove` : collier et nœud du salon). Golden : 11 × 15 cm de demi-axes → celui
  du labrador + moins de 7,5 cm, plus de cerceau autour de la collerette.
- **Queues dressées** (jack, chihuahua, yorkshire, spitz) : elles battent de côté autour de l'axe du bassin au lieu de
  tourner sur elles-mêmes (battement rapporté à la longueur : 0,36 → plus de 1) ; queue enroulée battue d'un bloc ;
  panache du spitz touffu (relief de mèches).
- **Assis des pattes courtes** (`settleSit`) : antérieurs tendus (`straightFront`), postérieurs repliés (`foldHind`) :
  dos du teckel 13,6° → 18,2°, du corgi 17,4° → 22,8° ; triangles de l'arrière-train étirés 121 et 110 → 54 et 62
  (jack : 43°, 0 — le modèle d'origine). **Couché** des races du jack : postérieurs repliés au sol (pieds arrière
  4 à 6 cm → 0,2 à 0,6 cm), inclinaison lissée dans le temps (plus d'à-coup de 6 cm de la tête du corgi). Galgo
  couché : hanche 18,7 → 16,9 cm, antérieurs 5,5 cm → au sol.
- **Yorkshire** : robe soyeuse en mèches modelées qui pendent (jupe des flancs jusqu'à moins de 4 cm du sol, barbe ;
  `silkyStrands`, gravité et sol dans le shader), museau affiné sans bajoues, toupet bas et noué.
- **Gueule** : au calme (content à moins de 0,5) fermée ; en haletant, la langue glisse en avant (os `tongue1`, plus
  ce que `faceShape` l'a rentrée dans un museau court) et pend : sa pointe 2 à 2,3 cm derrière les lèvres au calme,
  3 à 3,6 cm devant en haletant ; rose jusqu'au bout (`cTongue` : poids des os de la langue dans le shader).
- **Salon** : foulard en bavette posée sur le cou et le poitrail (`dogBib`, `model.drapeChest`) et lié au squelette ;
  nœud à la taille de la tête, posé sur la peau sous l'anneau et sous le menton (yorkshire : plus devant la bouche).
- **Pieds en virage** (`footLock`) : correction latérale du membre jusqu'à 0,38 rad (0,2 avant) — au pas en virage à
  1,2 rad/s, le postérieur intérieur glissait de 8 à 9 cm par appui (teckel, cocker, cavalier) → 2 à 5 cm, l'extérieur
  9,8 → 4 à 6 cm.
- **Têtes** : plis en V du carlin (`cmpWrinkleH`) ; museau carré de l'akita sans cran ; face intérieure des oreilles
  tombantes éclairée comme la face externe (liseré verdâtre du dogue) ; boucles de l'oreille du lagotto à moitié
  (coupe « lagotto » : poitrail et pattes un peu raccourcis) ; vibrisses des sourcils éclaircies sur les robes
  claires (`cWhisk`) ; lambeau d'origine du jack caché de nouveau sous le crâne déformé (`rehideEars` : chiot
  chihuahua, 544 sommets dehors jusqu'à 15 mm → 2, 1,4 mm), bas des coques d'oreilles fondu dans le crâne.

La planche de contrôle `planche.html` (servie par vite : `/tools/chien/planche.html`) montre n'importe quelle
liste de races, robes, chiots, clips et points de vue (`window.planche.show({ cells: [...] })`), avec une coupe du
salon (`cut`), une vitesse pour les allures (`v` : queue relevée en action) et d'autres races dans la même case, côte
à côte (`with`).

### Finitions 2 (correcteur des chiens)

- **Gueule des races du jack** (jack russell, cavalier, cocker, chihuahua, carlin, bouledogue, teckel, corgi, yorkshire,
  spitz nain) : os de la mâchoire et langue modelée dans le GLB (voir `jack_mouth` plus haut). Dans le jeu
  (`RealDogAnim`) : la gueule s'ouvre une fois et demie plus que celle du shiba (charnière à la commissure) ; en
  haletant, la langue glisse de 1,1 fois sa longueur (dans un museau raccourci, un peu plus : 30 % de ce que le museau
  lui a pris), un peu vers le haut pour passer sur les incisives, s'allonge (au plus de 55 % : au-delà elle se pliait en
  équerre entre deux os) et pend en arc (`tongueCurl`) ; rose (`cTongue`, texture jamais gardée sur elle : sinon
  brun-noir des lèvres du jack). Langue sortie (test `tongueOut`, cm rapportés à la taille de la tête) : jack russell
  2,8, cavalier 2,7, chihuahua 2,6, carlin 2,2, bouledogue 2,3, teckel 3,2, spitz nain 2,4 à l'arrêt (avant : pas de
  langue, gueule fermée) ; au calme −1,1 à −1,6 (dedans), mâchoire à son repos. (Le dessous de la langue est posé sur
  la première surface tournée vers le haut sous le rayon : au fond de la gueule, le rayon touchait la paroi du fond.)
- **Langue du boxer** (et des autres museaux courts du shiba : akita, saint-bernard, lagotto) : elle glisse de sa
  longueur de repos à la taille de la tête (racine de `head`) et reprend tout ce que `faceShape` l'a rentrée (avant :
  le terme était multiplié par le raccourcissement de la langue). Boxer : +0,1 → 3,2 cm devant les lèvres (labrador 3,2 ;
  akita 2,0 → 2,6). Points d'appui : la langue n'en est pas (le pas d'échantillonnage du corps est
  compté sans elle) ; assis, la peau des antérieurs n'est plus un appui « hors pieds avant » (races du jack : le chiot
  carlin basculait ou non selon un dixième de millimètre).
- **Assis et « donne la patte » du teckel et du corgi** (gabarit court) : reins fléchis dans le clip (`sit_flex`, voir
  `gab_sit`) et peau du grasset laissée au tibia (`buttock_knee`) — dos du teckel 18 → 33°, du corgi 23 → 44°
  (patte : 18 → 33°, 23 → 41°), triangles de l'arrière-train étirés plus de trois fois 54 → 6 et 62 → 2, croupe posée
  (peau du tronc à 0,5 cm du sol). Dans le jeu (`settleSit`) : l'antérieur resté plus haut que l'autre (corps un peu
  roulé de l'assis du clip : 0,7 à 0,9 cm) est posé en tournant l'omoplate ; la bascule qui repose la croupe sur des
  pieds avant enfoncés est fondue dans le temps (`settledW` : prise d'un coup à la fin de « s'asseoir », la tête du
  teckel sautait de 5 cm en une image). Couché et endormi par des clips de gabarit (`lie`, `sleep` dans les clips du
  court et du trapu, `gab_lie`) : essayé, pas retenu — corps posé trop haut (antérieurs à 7,8 cm, tronc à 8,5 cm du sol
  pour le teckel).
- **Couché et endormi des races du jack aux membres changés** (teckel, corgi, carlin, bouledogue, yorkshire, spitz nain ;
  jeu, `lieSettle`) : antérieurs posés — l'avant-bras s'abaisse au coude jusqu'à poser le poignet à l'épaisseur de la
  main, la main se pose à plat au poignet, puis, s'il le faut, le bras descend à l'épaule (avant-bras gardant son
  inclinaison) ; antérieurs 3,4 / 3,7 / 4,6 / 6,1 / 5,5 / 4,7 cm → 0,0 à 0,1 cm du sol, poitrail jamais dessous (tronc
  1,2 à 3,9 cm). Yorkshire : la jupe de peau sous le ventre (`silkDrop` de `deformDog`, `bodySilk`) et la peau de l'aine
  aux poids des deux cuisses (`bodyMid`) ne sont plus des appuis couché — hanches 7,9 → 2,7 cm, pieds arrière 2,6 → 0 cm ;
  ses mèches (shader, `cmpPom` < 0) se couchent au sol vers l'extérieur de la longueur qui passerait dessous (avant :
  aplaties sur place, une palissade de planches sous le chien couché ou assis).
- **Couché et endormi du gabarit long** (galgo, whippet, caniche ; `gab_lie`, `front_sphinx`) : antérieurs en sphinx —
  coude posé contre le poitrail à l'épaisseur de l'avant-bras au-dessus du sol (en arrière de l'épaule de ce que
  l'humérus ne peut descendre), avant-bras à plat vers l'avant, main posée. Repliés par `ground_leg` depuis l'épaule
  descendue au sol du tronc, les antérieurs allongés passaient le coude 4 cm sous le sol (les clips des gabarits ne
  passent pas par `ground_fix`) : le jeu relevait tout le chien sur ses coudes, tronc à 4 cm du sol, à genoux croupe
  haute. Hanches du galgo couché 16,9 → 13,9 cm (labrador 14,6), whippet 12,9 → 9,6, caniche 10,3 → 7,9 ; tronc posé.
  (Ces quatre clips greffés par `clips.mjs` sur le `dog_shiba.glb` du dépôt : maillage du shiba inchangé.)
- **Pieds posés en virage serré** (jeu, `footLock`) : la correction latérale du membre va jusqu'à 0,6 rad (0,38 avant) —
  au pas en virage à 1,2 rad/s, le pied posé qui glissait le plus par appui : teckel 5,7 → 1,3 cm, corgi 4,4 → 0,8, jack
  russell 5,0 → 1,0, cocker 4,3 → 1,0, cavalier 4,2 → 1,0, chihuahua 3,9 → 1,0 ; en ligne droite inchangé (0,1 à 0,2 cm),
  labrador inchangé (0,4).
- **Lambeau de l'oreille d'origine caché** (jeu, `rehideEars`) : rentré à 6,5 mm sous le crâne (3 avant) — la petite lame
  claire à la tempe du chiot chihuahua (1,4 mm dehors, 6 sommets) et du chihuahua adulte (1,2 mm) a disparu. La bouche
  en zigzag du chiot chihuahua n'est pas reprise (voir le rapport : la lèvre du bas du modèle du jack ne rejoint pas
  celle du haut aux commissures ; refermer la mâchoire de 0,05 à 0,1 rad de plus au calme ne la cachait pas).
- **Foulard du salon sur le caniche** (jeu, `drapeDogChest` et `dogBib` de salon.js) : posé sur la crinière telle que la
  coupe du shader la gonfle (`cCut.y`, 1,6 cm sur le poitrail du caniche), sur une enveloppe lissée de la peau et lissé
  en quatre passes — il était posé sur la peau sans la crinière, 4 mm dans les boucles qui le traversaient (froissé de
  face) ; maintenant 3,7 mm devant. Taille inchangée (celle de e00898a).
- **Coupe « lagotto » vue de face** (shader, `cCutLeg`) : le haut des pattes — coudes, avant-bras, cuisses, au-dessus
  de la bande des pompons — est raccourci de 0,6 fois le poil (le bas de 0,35 fois comme avant). De face, la silhouette
  est faite des épaules et des coudes, que le tronc et le bas des pattes coupés ne touchaient pas : la coupe ne
  l'amincissait que de 3,9 % (épaules 2,9 cm, pattes 0,8 cm) ; maintenant 10 % (épaules 5,3 cm, pattes 2,9 cm). Les
  autres coupes ne touchent pas le haut des pattes (`cCutLeg` 0).
- **Oreilles bouclées du lagotto** (`earRest` de `mergedCoatGeo`) : leur repos (`cmpRest`, d'où le shader tire les
  boucles et la robe) est celui de la peau de SON oreille, ramenée au repère d'origine par la tête (décalage à l'os de la
  tête divisé par sa taille), au lieu de l'oreille de référence partagée — une plaque plate, la même pour les deux faces,
  plus petite que l'oreille bombée du lagotto. Ses boucles s'y étiraient en traînées (anisotropie médiane 1,57, 3,61
  pour 90 % des triangles ; le bord roulé, sans épaisseur au repos, n'en était qu'une rayure) : maintenant 1,00 partout,
  boucles de la taille de celles de la tête. Copie du repos commun pour cette seule race (+0,14 Mo ; les autres gardent
  l'attribut partagé).
### Finitions 2, reprise (correcteur des chiens, après la critique)

- **Variante « nain » du gabarit court** (`models.py`, gabarit `nain` : `of='court'`, `back=0.8`, clips `sit` et `paw`) :
  l'assis aux reins fléchis du gabarit court (`sit_flex`) est fait pour les dos longs du teckel et du corgi ; les chiots
  carlin et bouledogue, aux pattes courtes (0,60 et 0,58) mais au dos court (0,72 et 0,77), prennent aussi ce gabarit et
  basculaient à la renverse (dos 130° et 121°, 76 et 93 triangles étirés). La variante refait l'assis sans les reins
  fléchis (celui d'avant les finitions 2) ; `extras.dog.gabarits` garde `of` et `back` (`pack.mjs`) ; le jeu
  (`dogClips`, `mixClips` de `dogReal.js`) ne choisit jamais une variante seule et fond, clé par clé, ses clips avec ceux du
  gabarit selon la longueur du dos de la race, de la variante (dos 0,8 ou moins) au gabarit (court : `back=1.25` ou plus ;
  pas de 0,05, clips mêlés partagés). Chiots carlin 130 → 42°, bouledogue 121 → 40°, corgi 59 → 46° (peau 1,1 → 0,9 cm
  sous le sol) ; teckel et corgi adultes inchangés (dos 1,45 et 1,25 : assis du gabarit seul). Transitions des gabarits
  (`sit_down`, `stand_up`, `lie_down`, `get_up`) : une clé sur 2 (`GAB_DECIMATE`). `dog_jack.glb` 614 → 655 Ko (+5 clips ;
  0,60 Mo sur main : +9 %).
- **Assis du teckel et du corgi, sans bosse ni tête renversée** : dans `gab_sit`, un angle positif autour de `chest`
  baisse le poitrail (chien tourné vers −Y) ; les +0,55 « poitrail redressé » le baissaient — base du cou 73° sous le
  garrot (segment poitrail → encolure à −73° contre +40° pour le jack russell assis), dos bossu, tête du teckel à 7,3 cm
  au-dessus des épaules (jack russell 10,5). `sit_flex` du court : `[-0.65, -0.75, -0.25, -0.6, 0.3]` (reins plus
  fléchis, poitrail relevé de 0,25) ; `paw_lift=(0.9, 0.22)` : patte donnée devant le poitrail (avant : repliée sous le
  menton). Dans le jeu (`sitHead`, fin de `settleSit`, gabarit court) : encolure redressée comme celle du jack russell
  assis (angle base du cou → tête 104°) et tête à 2° au-dessus de son port debout, en gardant ce que l'air triste, la
  laisse et le regard y mettent. Teckel : tête 7,3 → 10,3 cm au-dessus des épaules, inclinaison −4,4 → 0,1°, dos 32°,
  patte levée 7,6 → 8,9 cm et 2,5 → 3,7 cm devant l'épaule ; corgi : tête 13,7 → 4° au-dessus de son port, dos 46°
  (patte 42°) ; chiot corgi 21 → 1°. Taille du GLB inchangée.
- **Mèches du yorkshire couché et assis** (shader, `SILK` de `dogCoat.js`) : la mèche ne pend à la verticale que tronc
  presque à plat (debout, au pas, couché) ; tronc incliné de 0,12 à 0,4 rad (assis), elle suit le corps, couchée le long
  du flanc et de la cuisse. Ce qui passerait sous le sol se couche vers l'extérieur, tassé au 0,4 de cette longueur et un
  peu bombé. Réplique sur le processeur dans `tests/dogFinish.test.js` (`silkLayout`) : couché, les mèches dépassaient
  du corps vu d'en haut de 19 cm (lames droites en oursin ; main : 0, aplaties sous le corps en palissade), maintenant
  4,2 cm (chiot 8,6 → 1,7) ; assis, 25 → 1,3 cm, et la part des segments de mèche verticaux 73 % (main) / 59 % → 10 %
  (rideau devant le poitrail). Debout, inchangé (84 %). Reste : vues de face, les mèches de devant, rubans vus de chant,
  font encore quelques traits verticaux devant les antérieurs du chien assis (rubans tournés autour de l'épaule essayés :
  couché, ils se dressaient en plaque claire au coude — pas retenu).
- **Intérieur des babines du jack, gueule ouverte** (shader, `dogCoat.js`, bloc des lèvres du jack) : le dessous de la
  lèvre du haut et le dessus de celle du bas (faces tournées vers le bas ou le haut au repos, normale de la face tirée des
  dérivées de la position de repos, dans la bande de la fente, pas plus haut — sous la truffe, une étoile rose) prennent
  une teinte de gencive brun rose sombre, plus sombre au fond, là où la robe calculée est claire (jack russell, cavalier,
  corgi : avant, poil blanc verdi par le ciel, vert olive ; carlin et bouledogue, lèvres déjà noires, inchangés). Reste :
  vu de très près, le bord est en dents de scie (classement par face) ; pas de dents modelées.
- **Écart latéral des membres en virage** (`footLock`, `sideMax`) : la borne de 0,6 rad (finitions 2) ne vaut que pour les
  races du jack et les membres courts (longueur < 0,85 : chiots du shiba) ; les membres longs gardent 0,38 rad. En virage
  à 2 rad/s, membre le plus écarté : labrador 33 → 30°, saint-bernard 36 → 31°, husky 28 → 25°, galgo 28 → 24° (valeurs
  de main) ; pieds posés inchangés ; teckel et jack russell inchangés (glissement en virage de la reprise gardé).
- **Couché des races du jack sans gabarit** (cavalier, cocker, chihuahua, jack russell ; jeu, `lieSettle`) : leurs
  postérieurs, que les membres un peu raccourcis laissaient en l'air (pieds arrière à 2,3 / 2,8 / 0,9 / 0,8 cm), sont
  repliés au sol par `foldHind` (0,0 à 0,1 cm) ; le reste — bascule, corps reposé, antérieurs abaissés — ne s'applique
  pas à elles : essayé, il les relevait sur des antérieurs dressés, poitrail haut ; leur clip pose déjà les avant-bras à
  plat (bout des pieds avant relevé de 1 à 2,6 cm, une patte au repos, gardé).
