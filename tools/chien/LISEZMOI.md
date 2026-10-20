# Chiens réalistes : fabrication de `public/models/dog_shiba.glb` et `dog_jack.glb`

Deux modèles d'artistes servent aux 38 races de chiens du jeu, tous deux sous licence
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
   - le shiba écrit ses **poses faites main** (repos, roulade) en rotations du monde ; le jack les reprend
     (retarget) sur son squelette ;
   - **allures générées** par trajectoires de pieds et cinématique inverse : `walk`, `trot`, `run` (galop) ;
     leurs **vitesses naturelles** (pieds posés immobiles) vont dans le GLB (`extras.dog.naturalSpeeds`) :
     shiba 0,95 / 2,40 / 5,72 m/s, jack 0,83 / 2,10 / 5,02 m/s ; le jeu joue chaque clip à vitesse réelle ÷
     vitesse naturelle (÷ longueur des membres de la race) ;
   - **positions et gestes** : `sit` (assis, croupe cherchée par dichotomie), `paw` (donner la patte), `lie`
     (couché), `sleep` (endormi, tête posée), `sniff` (renifler, truffe à 2,5 cm du sol), `eat`, `drink`
     (langue), `wag`, `bow` (révérence), `jump`, transitions `sit_down`, `stand_up`, `lie_down`, `get_up` ;
   - réglages des poses par modèle (`MODELS` dans `models.py`, ceux du jack) : assis `sit_flex`, `sit_tuck`,
     `sit_femur`, `sit_hip` (postérieurs repliés vers le haut, bassin et dos basculés, hanche fixée au lieu de la
     dichotomie : une assise de grenouille, pied à plat, sinon), couché `lie_pitch_max`, `lie_elbow`, `lie_wrist`,
     `lie_fold` (avant-bras posés, postérieurs repliés vers l'avant : plus de croupe en l'air), saut `jump_tuck`
     (postérieurs ramenés sous le corps à la réception : le maillage ne se déchire plus) ;
   - mise au point : `--hook script.py` exécute un script dans le contexte de `make_dog.py` (après le squelette,
     avant les poses) puis s'arrête ;
   - **pieds au sol** : sur chaque image, le chien est relevé de ce qui passe sous le sol (sommets des pieds et du
     corps), rapport JSON (`pawMin`, `bodyMin`, `muzzleMin` par clip) ;
   - les os que le jeu anime lui-même (queue, oreilles, paupières) n'ont plus de courbes ; `pose_tail` garde le port
     de queue enroulée du shiba.
4. **`pack.mjs`** : canaux constants ou d'échelle retirés, matières renommées (`dog_coat`, `dog_eye`), texture
   métal/rugosité retirée, ré-échantillonnage, simplification (shiba : 55 % des triangles, bords gardés), textures
   **WebP** 1024, compression **meshopt** (volume de quantification commun : la peau partagée gardait sinon des
   yeux géants).
5. **`lod.mjs`** : version allégée dans le même fichier (`extras.lod` : index simplifiés à 30 %) pour les chiens
   lointains (`DOG_LOD_DIST` dans `dogReal.js`).

Fichiers obtenus : `dog_shiba.glb` 0,86 Mo (17 800 triangles, 5 300 au loin, 57 os), `dog_jack.glb` 0,51 Mo
(14 900 triangles, 36 os), 19 clips chacun.

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
    crâne plat, stop, museau carré, paupières ouvertes ; gueule du jack fermée (`jackMouthClose`) ;
  - *pompons et toupet* (`buildPompons`) : toupet, bracelets et bout de la queue du caniche, repliés par le shader
    selon la coupe du salon (`setCut`, attribut `cmpPom`) ; toupet seul du yorkshire.
- **Nouveaux réglages de race** (`DOG_BUILDS`, valeurs neutres dans `ONE`) : `earLen`, `earW`, `earSet`, `cheek`,
  `mouth`, `flews`, `jowl`, `skullFlat`, `stop`, `square`, `eyeOpen`, `tailTaper` (effilement de la queue selon
  son port, `TAPER`), `pompons`, `beard`, `pear` (tronc en poire du bouledogue), `earTilt`, `underbite`, `fluffy`
  (relief touffu des spitz), `wrinkle` (rides du carlin), `chest` (poitrine profonde et ventre levretté des
  lévriers), `paws`, `neckSlim` (encolure lisse des poils ras, sans collerette), `topknot`.
- **Chiots** : tête plus grosse, museau court et rond, yeux ronds grands ouverts, pattes courtes aux gros pieds,
  ventre rond, oreilles pas encore dressées.
- **Robes par shader** (`coatPlan`) : unie, dessous clair, feu (noir et feu, selle du berger allemand), bicolore
  (urajiro du shiba, masque du husky, plastron du boxer, collier du colley), tricolore, merle (plaques déchirées
  de toutes tailles), pie (plaques, tête colorée), dalmatien, moucheté, bringé (stries fines, effacées en teinte
  moyenne de loin), charbonné, masque du carlin ; liste qui suit le chanfrein (`cmpBlaze`) ; iris de la couleur
  des yeux de la race (bleu du husky), reflet dans l'œil ; robes noires lustrées (reflet en bord, `cSheen`) avec
  le tour des yeux éclairci ; les yeux, la truffe, la langue et les coussinets gardent la texture d'origine.
- **Animation** : mélangeur three.js avec fondus, allure choisie avec hystérésis (`pickDogGait`), postures
  (assis, couché, endormi), actions (manger, boire, renifler, frétiller), regard, paupières, oreilles et queue
  vivantes, halètement, traction en laisse, chien de troupeau ; modèle de repli (chien sculpté par le code)
  pendant le chargement puis échange (`Game.onRealDogs` / `swapRealDogs`). Gueule fermée au calme (angle
  `JAW_CLOSED` depuis la pose de repos du GLB).
- **Au sol** (`RealDogAnim.ground`) : points d'appui de la peau mesurés une fois par race sur les poses (pieds,
  corps, queue, tête : `contactPoints`) ; au pas et au trot, pieds en appui tenus sur place (`footLock`) ; assis,
  le corps bascule pour poser les pieds avant (`settleSit` : dos longs, pattes courtes) ; debout sur place
  (renifler, manger, boire), il se redresse pour garder les pieds arrière posés (`settleStand`) ; queue et tête
  relevées au-dessus du sol ; roulade : peau entière mesurée (`skinLow`).
- **Équipement** ajusté au cou et au corps mesurés de chaque race (collier : bande plate `flatBand` dans
  `gearModels.js` ; manteau, accessoires du salon, nœud du concours de beauté, laisse accrochée à l'anneau du
  collier).

La planche de contrôle `planche.html` (servie par vite : `/tools/chien/planche.html`) montre n'importe quelle
liste de races, robes, chiots, clips et points de vue (`window.planche.show({ cells: [...] })`).
