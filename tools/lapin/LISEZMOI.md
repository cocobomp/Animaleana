# Lapins réalistes : fabrication de `public/models/rabbit.glb` et `rabbit_lop.glb`

Deux modèles d'artistes servent aux 6 races de lapins du jeu (`src/sim/species.js`, `SPECIES.rabbit`), tous deux
sous licence **Creative Commons Attribution 4.0** (CC BY 4.0 : l'attribution est obligatoire, voir `CREDITS.md`,
`public/models/LICENSES/` et, dans le jeu, ❓ Aide → ℹ️ À propos) :

- **toutes les races sauf le bélier** (nain, angora, rex, géant des Flandres, tête de lion) et leurs lapereaux :
  « Rabbit » par **Dakota.Hinkle** <https://sketchfab.com/3d-models/rabbit-073eef14ae3c4d06808498c3ba895e67>
  (lapin gris agouti, texture photo 1024, yeux en sphères séparées) → `rabbit.glb` ;
- **le bélier** (oreilles tombantes modélisées) : « Rabbit Rigged » par **FourthGreen**
  <https://sketchfab.com/3d-models/rabbit-rigged-e7213589744d436b9d96e2dbb31198a5> (bélier fauve, texture 256,
  yeux peints) → `rabbit_lop.glb`.

La course en bonds et le saut sont rejoués d'après les clips « Running » et « Jump » du lapin de **CDmir (Čestmír
Dammer)**, « Rabbit », <https://opengameart.org/content/rabbit-0> (CC0 1.0 : attribution non exigée, citée par
courtoisie) ; leurs gabarits (trajectoires des pieds et du corps, relevées une fois) sont dans `templates/`.

Les fichiers d'origine viennent de l'instantané Objaverse de Sketchfab (`073eef14ae3c4d06808498c3ba895e67.glb`,
`e7213589744d436b9d96e2dbb31198a5.glb`, licence vérifiée par l'API publique le 20/10/2026, voir
`public/compare-chats-lapins/LICENSES/`), comme pour la page « Choisis ton chat et ton lapin ». Pour la chaîne, ils
sont renommés `dakota_rabbit.glb` et `fourthgreen_rabbit.glb` dans le dossier `$SRC`.

## Chaîne de fabrication (Blender 4.2 en mode `--background`, puis glTF-Transform)

`build.sh` enchaîne tout, un modèle après l'autre (≈ 1 min chacun) :

```sh
BLENDER=…/blender-4.2/blender SRC=<dossier avec dakota_rabbit.glb et fourthgreen_rabbit.glb> WORK=<travail> \
GT=<dossier avec node_modules de @gltf-transform/core, extensions, functions, meshoptimizer et sharp> \
./tools/lapin/build.sh            # ou : ./tools/lapin/build.sh fourthgreen ; STEP=blender ou STEP=pack
```

1. **`rabbit_models.py`** : ce qui est propre à chaque modèle (fichier, nettoyage, orientation, rôles des os,
   réglages des poses). **`rabbitkit.py`** : outils communs (import, nettoyage, regard vers -Y, échelle **nez-croupe
   0,35 m**, pattes au sol, vérifications sur le maillage déformé, export).
2. **`make_rabbit.py`** : noms d'os communs aux deux lapins (`root`/`pelvis`, `spine1…3`, `chest`, `neck1`, `head`,
   `ear1…` par côté — trois os qui pendent chez le bélier —, `tail1…`, membres `humerus/radius/metacarpus/toes` et
   `femur/tibia/metatarsus/htoes`) ; os de bout sans poids retirés (bélier) ; clips d'origine remplacés.
3. **`rabbit_clips.py`** + **`rabbit_anim.py`** + **`rabbit_gait.py`** : 21 clips par modèle, calculés sur les
   proportions du modèle :
   - **allures** : `hop` (sautillement lent), `lope` (petit galop en bonds), `run` (course en bonds, gabarit de
     CDmir) ; tous les pieds posés reculent à la même vitesse, la **vitesse naturelle** du clip, rangée dans le GLB
     (`extras.rabbit.naturalSpeeds`) : lapin gris 0,29 / 0,82 / 1,58 m/s, bélier 0,29 / 0,66 / 0,92 m/s ;
     glissement des appuis mesuré sur le maillage déformé (`extras.rabbit.slipCm`) : au plus 1 cm (gris) et 1,6 cm
     (antérieurs du bélier au sautillement) ;
   - **positions et gestes** : `idle` (accroupi), `sit`, `stand` (debout sur les postérieurs, guetteur), `lie`
     (couché étalé), `sleep` (en boule), `groom` (toilette : pattes sur le museau puis l'oreille), `sniff`, `eat`,
     `binky` (saut de joie), `hide` (tapi, oreilles plaquées), `held` (porté dans les bras), `jump` (gabarit de
     CDmir), transitions `sit_down`, `stand_up`, `rear_up`, `rear_down`, `lie_down`, `get_up` ;
   - **pattes jamais étirées** : la cinématique inverse à deux os est **bornée à 0,98 de l'allonge**, sans
     étirement (quand la cible est trop loin, la patte entière est ramenée vers l'épaule ou la hanche sur la même
     droite) ; **aucune translation d'os sauf la racine** (les autres os ne reçoivent que des rotations ; l'écart
     résiduel est mesuré et doit rester sous le dixième de millimètre). Avant ces corrections, l'avant-bras
     « s'allongeait » de 30 % à la course et de 2,7 fois à la toilette du bélier ;
   - **pieds au sol** : sur chaque image, le lapin est relevé de ce qui passe sous le sol (soles, ventre, museau),
     relevé noté par clip (`extras.rabbit.groundFix`) ; rapport `CHECK` par clip (sole, corps, museau au plus bas).
4. **`pack.mjs`** : canaux inutiles retirés (plus aucune échelle animée ; translations seulement à la racine), clés
   ré-échantillonnées, matières renommées (`rabbit_coat`, `rabbit_eye`), carte métal/rugosité retirée, textures
   **WebP** (pelage 1024), maillage quantifié et compressé **meshopt**, mesures du rapport rangées dans la scène
   (`extras.rabbit`).
5. **`lod.mjs`** : version allégée dans le même fichier (nœud `rabbit_lod`, index simplifiés à 35 % qui partagent
   les attributs de la version complète) pour les lapins lointains (`RABBIT_LOD_DIST` dans `rabbitReal.js`).

Fichiers obtenus : `rabbit.glb` **0,60 Mo** (8 900 triangles, 2 920 au loin, 29 os, 21 clips), `rabbit_lop.glb`
**0,43 Mo** (2 580 triangles, 1 090 au loin, 31 os, 21 clips).

**`planche.html`** (outil de mise au point, servi par `npx vite`) : `window.planche.show({ cells })` rend une planche
de races, robes, lapereaux, poses et accessoires, avec le lapin procédural en regard (`proc: true`, l'AVANT des
comparaisons), dans la même lumière et au même cadrage.

## Dans le jeu (`src/game/models/rabbitReal.js`, `rabbitCoat.js`, `petReal.js`, `src/sim/rabbitLook.js`)

- **Entrée** : `buildAnimalModel('rabbit', look, race, stade)` construit le lapin réaliste (`md.realRabbit`) ou,
  tant que le GLB n'est pas là, le lapin procédural (`animalModel.js`, repli ; aussi dans les tests). Clés
  `rabbit_up` et `rabbit_lop` (jamais « rabbit » : `gltfAnimal.js` le prendrait pour un animal GLB générique). Les
  GLB sont demandés après ceux des chats (`Game.realRabbitsReady`), jamais attendus ; à leur arrivée, les lapins
  procéduraux déjà là prennent le modèle réaliste un par image (`Game.swapRealRabbits`, pas pendant un jeu du
  clapier, une séance, porté ni sur la table du salon).
- **Quel modèle** : oreilles tombantes (`look.earType === 'lop'`, aussi pour un lapereau croisé) → bélier ; sinon le
  lapin gris. Race des anciennes sauvegardes : `look.breed`, sinon celle de l'animal (jamais « mix »), sinon devinée
  par la robe (`rabbitLookWithBreed`).
- **Races par les os** (`RABBIT_BUILDS`) : pattes, dos, tronc, encolure, taille et largeur du crâne, museau, yeux,
  oreilles (longueur, largeur, écartement), pompon ; poil long poussé le long de la normale. **Nain** tout rond à
  grosse tête et toutes petites oreilles ; **bélier** à tête forte ; **angora** : une toison de mèches sur tout le
  corps, joues, pinceaux au bout des oreilles ; **rex** : poil ras velouté (grain effacé, reflet doux) ; **géant des
  Flandres** : long, grosses pattes, grandes oreilles larges (taille 1,6) ; **tête de lion** : collerette de mèches
  autour de la face (nuque, base des oreilles, joues, barbe, cou), jupe sur les flancs, oreilles courtes. Sommets et
  têtes d'os sont déplacés ensemble : le squelette de chaque race garde les rotations de repos du GLB, les clips s'y
  appliquent tels quels ; pieds au sol. Une géométrie par race (et par stade), partagée entre les lapins de cette
  race. Les mèches (cartes de poils) ont la couleur du pelage où elles poussent, jamais près des yeux ni sur la face.
- **Lapereaux** (stade « bébé ») : grosse tête, pattes, museau et oreilles courts, poil encore court ; le jeune entre
  les deux ; le lapin change de gabarit quand il grandit (`AnimalEntity.applyScale`).
- **Robes par shader** (`rabbitCoatPlan`) : la texture d'origine est ramenée à un gris neutre qui **garde son grain**,
  puis peinte selon l'endroit du corps : unie, agouti (dessous, menton, tour des yeux et dessous du pompon de la
  seconde couleur), panachée du bélier (oreilles, tour des yeux, papillon du nez, taches) ; n'importe quelle couleur
  (lapereaux aux robes mélangées) ; yeux rubis de l'angora blanc ; truffe selon la robe.
- **Animation** (`RealRabbitAnim`) : allure choisie par la vitesse **relativement aux vitesses naturelles de ce
  lapin** (passage à mi-chemin, ± 8 %), chaque clip joué à vitesse réelle ÷ vitesse naturelle de la race (mesurée
  sur son squelette, la course jusqu'à 3,5 fois) et pieds en appui tenus sur place au sautillement et au petit galop
  (pas de patinage, même aux 1,2 à 3,4 m/s du jeu) ; postures et passages par le plus court chemin (accroupi → assis
  → debout ; couché → en boule ; porté en fondu) ; au repos, il renifle (nez qui frémit), s'assoit, fait sa
  toilette, se dresse, se couche, mange ; binky de joie de temps en temps ; tapi s'il a peur ou qu'il est triste ;
  regard, oreilles qui pivotent et se couchent (peur, course, sommeil), pompon, respiration, embonpoint (shader) ;
  porté dans les bras (concours de beauté), sur la table du salon, dans la caisse de transport (en boule, pose
  figée), vignettes (pose figée). Jeux du clapier (roue et pirouette : bonds sur place sans pieds tenus ; plateforme :
  saut tenu à sa phase ; foin : il mange), lapin-hop et agility (saut tenu à la phase de la haie), spectacle (saut,
  pirouette, salut debout sur les postérieurs) : poses imposées par `realRabbitPose`, jouées à l'image suivante.
- **Sol** : les points de contact (soles, poignets et jarrets les plus bas sur toute la foulée, ventre, croupe,
  tête) sont relevés une fois par race ; aux allures, la patte la plus basse est posée sur le sol ; à l'arrêt, le
  corps bascule pour poser la croupe (assis) ou le ventre (couché) ; la tête ne passe jamais sous le sol.
- **Équipement** : collier mesuré sur l'encolure du lapin accroupi (là où le cou est le plus fin, à moitié enfoncé
  dans le poil long), mêmes mesures que le chien réaliste (`dogFit`/`accessoryFit` : `gearModels.js`, `salon.js`,
  `Beauty.js`) ; coupe du salon (`setCut` : court, cœur, concours) par le shader.
- **Performance** : version allégée au loin (4,5 m en basse qualité, 10 m en haute, divisés par la taille du lapin),
  boîte des os pour le « frustum culling », lapins hors du champ animés une image sur trois, au loin une sur deux
  (sauf guidés, portés, sur la table ou qui suivent le joueur).

## Performance

Voir la section suivante (mesures du 20/10/2026).
