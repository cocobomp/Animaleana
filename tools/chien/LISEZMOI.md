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
     **troué et déchiré**) sont réunies et **soudées** ; mise à l'échelle.
2. **`autorig.py`** (jack) : squelette du même plan que celui du shiba, poids par chaleur (heat weights) ; os des
   **yeux** (sommets des yeux, séparés par côté) et des **oreilles** (base → pli → bout, poids géométriques sur le
   lambeau mince repéré par épaisseur et remplissage limité). Réglages du jack dans `models.py` (`JACK_RIG`) :
   hauteur du coude, du jarret, de la hanche et du grasset, et `buttock` (le poids du fémur débordait sur la croupe :
   rendu au bassin derrière la hanche et au-dessus du grasset — assise, la croupe ne se déchire plus).
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
     la croupe ; le yorkshire, du gabarit trapu, perdait son assis (dos à 6°, pieds arrière à 5 cm) ;
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

Fichiers obtenus : `dog_shiba.glb` 0,88 Mo (17 800 triangles, 5 300 au loin, 57 os, 20 clips + 17 de ses
gabarits), `dog_jack.glb` 0,60 Mo (14 900 triangles, 36 os, 19 clips + 15 de ses gabarits). (Avant les gabarits et
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
  poil, encolure raccourcie, boucles égalisées en couleur et en relief sur le tronc coupé, pattes bouclées gardées,
  dessus de la tête bien arrondi, +0,85 fois le poil) ; sans coupe, ses boucles naturelles (pas de pompons).
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

La planche de contrôle `planche.html` (servie par vite : `/tools/chien/planche.html`) montre n'importe quelle
liste de races, robes, chiots, clips et points de vue (`window.planche.show({ cells: [...] })`), avec une coupe du
salon (`cut`), une vitesse pour les allures (`v` : queue relevée en action) et d'autres races dans la même case, côte
à côte (`with`).
