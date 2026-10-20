# Chats réalistes : fabrication de `public/models/cat_adult.glb` et `cat_kitten.glb`

Deux modèles d'artistes servent aux 15 races de chats du jeu (`src/sim/catBreeds.js`), tous deux sous licence
**Creative Commons Attribution 4.0** (CC BY 4.0 : l'attribution est obligatoire, voir `CREDITS.md`,
`public/models/LICENSES/` et, dans le jeu, ❓ Aide → ℹ️ À propos) :

- **chats adultes et jeunes** (toutes les races) : « Cat game asset » par **Claire (claireanne3d)**
  <https://sketchfab.com/3d-models/cat-game-asset-7a0c1a65e18747799af9fe9481f1bdb2> (chat tigré gris, maillage
  seul, yeux séparés, textures couleur, normales et occlusion 1024) ;
- **chatons** (stade « bébé ») : « Kitten » par **FainoDS (doinspire)**
  <https://sketchfab.com/3d-models/kitten-4ae3704cd65b423ab994545988d4db1a> (chaton tigré gris à grosse tête, yeux
  peints dans la texture).

Les fichiers d'origine viennent de l'instantané Objaverse de Sketchfab (licence vérifiée par l'API publique le
20/10/2026, voir `public/compare-chats-lapins/LICENSES/`), comme pour la page « Choisis ton chat et ton lapin ».

## Chaîne de fabrication (Blender 4.2 en mode `--background`, puis glTF-Transform)

`build.sh` enchaîne tout, un modèle après l'autre (≈ 1 min chacun) :

```sh
BLENDER=…/blender-4.2/blender SRC=<dossier avec claire_cat.glb et faino_kitten.glb> WORK=<travail> \
GT=<dossier avec node_modules de @gltf-transform/core, extensions, functions, meshoptimizer et sharp> \
./tools/chat/build.sh            # ou : ./tools/chat/build.sh kitten
```

1. **`cat_models.py`** : ce qui est propre à chaque modèle (fichier, réglages du squelette et des poses).
   **`catprep.py`** : pièces figées et orientées (le chat regarde +z), garrot à **0,25 m** (le chaton aussi : le jeu
   le met à sa taille), coutures soudées.
2. **`cat_autorig.py`** : squelette automatique aux noms du jeu (`root`, `pelvis`, `spine1…3`, `chest`,
   `neck1/neck2`, `head`, `eyeL/eyeR` (adulte), `ear1/ear2` par côté, `tail1…tail8`, membres
   `scap/humerus/radius/metacarpus/toes` et `femur/tibia/metatarsus/htoes`), poids par chaleur puis retouchés :
   - **os correcteurs des hanches** `haunchL/haunchR` (enfants du bassin, ½ rotation du fémur appliquée par
     `make_cat.py` à chaque image) et poids de l'arrière de la cuisse rendus au bassin (`buttock`) : assis, la
     cuisse ne se déchire plus (le chaton montrait un trou dans le flanc) ;
   - poids des pattes **coupés** à distance de l'os (les pattes avant ne tirent plus la peau du poitrail, la patte
     levée du « tape-m'en cinq » ne froisse plus l'épaule) ; chaton : la peau du poitrail entre les pattes avant
     revient au poitrail (`arm_clip`), sinon elle partait en voile jusqu'aux pieds, pattes tendues devant (couché,
     étirement, saut) et le chaton était relevé de 11 cm dans l'étirement ;
   - tête rigide, oreilles en deux os (base → bout), queue en 8 os le long de son axe.
3. **`make_cat.py`** + **`cat_gait.py`** : animations, 20 clips par modèle.
   - **allures générées** par trajectoires de pieds et cinématique inverse : `walk`, `trot`, `run` (galop),
     `balance` (marche lente sur une barrière, pattes resserrées sous le corps, queue en balancier) ; leurs
     **vitesses naturelles** (doigts en appui immobiles) vont dans le GLB (`extras.cat.naturalSpeeds`) : adulte
     0,54 / 1,62 / 5,74 m/s (équilibre 0,27), chaton 0,41 / 1,19 / 3,68 m/s (0,26) ;
   - **positions et gestes** : `idle`, `sit`, `groom` (toilette, patte léchée puis passée sur la tête), `lie`
     (couché en sphinx), `sleep` (en boule, queue enroulée), `stretch` (étirement), `eat` (accroupi, tête à 3,5 cm
     du sol), `tail_up` (queue en point d'interrogation, calque), `ears` (calque), `highfive` (« tape-m'en cinq »),
     `jump`, transitions `sit_down`, `stand_up`, `lie_down`, `get_up`, `curl_up` ;
   - **pieds au sol** : sur chaque image, le chat est relevé de ce qui passe sous le sol (soles, ventre, croupe,
     queue), relevé noté par clip (`extras.cat.groundFix`) ;
   - les os que le jeu anime lui-même (bout de la queue, oreilles, yeux) sont exclus du contrôle du sol ;
     `--hook script.py` exécute un script après le squelette (mise au point).
4. **`pack.mjs`** : canaux inutiles retirés (plus aucune échelle animée ; translations seulement à la racine),
   clés ré-échantillonnées, matières renommées (`cat_coat`, `cat_eye`), carte métal/rugosité retirée, textures
   **WebP** (pelage 1024, occlusion 512, yeux 256), maillage quantifié et compressé **meshopt**, mesures du rapport
   rangées dans la scène (`extras.cat`).
5. **`lod.mjs`** : version allégée dans le même fichier (nœud `cat_lod`, index simplifiés à 30 % qui partagent les
   attributs de la version complète) pour les chats lointains (`CAT_LOD_DIST` dans `catReal.js`).

Fichiers obtenus : `cat_adult.glb` **0,93 Mo** (19 990 triangles, 5 920 au loin, 43 os, 20 clips, 649 canaux),
`cat_kitten.glb` **0,73 Mo** (15 530 triangles, 4 600 au loin, 41 os, 20 clips).

**`planche.html`** (outil de mise au point, servi par `npx vite`) : `window.planche.show({ cells })` rend une planche de
races, robes, chatons, poses et équipements, avec le chat procédural en regard (`proc: true`, l'AVANT des
comparaisons), dans la même lumière et au même cadrage.

## Dans le jeu (`src/game/models/catReal.js`, `catCoat.js`, `petReal.js`, `src/sim/catLook.js`)

- **Entrée** : `buildAnimalModel('cat', look, race, stade)` construit le chat réaliste (`md.realCat`, jamais
  `md.cat`) ou, tant que le GLB n'est pas là, le chat procédural (`catModel.js`, repli). Les GLB sont demandés après
  ceux des chiens (`Game.realCatsReady`), jamais attendus ; à leur arrivée, les chats procéduraux déjà là prennent
  le modèle réaliste un par image (`Game.swapRealCats`, pas pendant une séance, porté, sur la table ou perché).
- **Races par les os** (`CAT_BUILDS`) : pattes, dos, tour de poitrine, ventre, cou, taille et largeur du crâne,
  museau et face plate (persan : la face recule sans toucher aux yeux), oreilles (taille, largeur, arrondi,
  écartement ; **pliées** vers l'avant du scottish fold), pinceaux (maine coon, norvégien), queue (longueur,
  épaisseur, panache ; **pompon** du bobtail), poil long poussé le long de la normale (collerette, culottes,
  panache) ou ras (siamois, sphynx). Sommets et têtes d'os sont déplacés ensemble : le squelette de chaque race
  garde les rotations de repos du GLB, les clips s'y appliquent tels quels ; pieds au sol. Une géométrie par race
  (et par stade), partagée entre les chats de cette race.
- **Chatons** : modèle du chaton, traits de la race adoucis ; le **jeune** prend le modèle adulte (tête un peu plus
  grosse, pattes un peu plus courtes) ; le chat change de modèle quand il grandit (`AnimalEntity.applyScale`).
- **Robes par shader** (`catCoatPlan`, `catTextures.js`/`catBreeds.js`) : la texture d'origine est ramenée à deux
  classes de luminance (fond et rayures) puis recolorée : le **grain du poil est gardé**. Motifs : uni, tigré
  (maquereau, marbré), rosettes (bengal), tiqueté (abyssin), points (siamois, sacré de Birmanie, ragdoll : masque,
  oreilles, pattes et queue foncés), écaille, tricolore, bicolore ; blancs : gants (sacré de Birmanie), mitaines
  (ragdoll), plastron, bicolore, van, smoking. Peau nue et plis (sphynx), poil frisé (devon rex), peluche (british,
  chartreux) par relief. Iris recoloré (bleu des points, cuivre du chartreux, vairons), truffe selon la robe.
- **Poil long** : en haute qualité, couches de poil (3 à 5) sur la version allégée, de près seulement
  (`CAT_SHELL_DIST`), brins flous mélangés par transparence (un halo doux) ; plus des mèches de pinceaux.
- **Animation** (`RealCatAnim`) : allure choisie par la vitesse avec hystérésis, chaque clip joué à vitesse réelle ÷
  vitesse naturelle de la race (mesurée sur son squelette) et pieds en appui tenus sur place (pas de patinage) ;
  postures (debout, assis, toilette, couché, en boule, accroupi) et passages par le plus court chemin (debout →
  assis → couché → en boule) ; étirement au réveil ; équilibre sur les barrières ; tours du spectacle (assis,
  couché, « tape-m'en cinq », révérence = étirement, saut) ; regard, clignements, paupières mi-closes (toilette,
  couché) et fermées (en boule), oreilles qui bougent et se couchent (peur, tristesse), queue dressée quand il suit
  quelqu'un, gonflée quand il a peur, respiration, embonpoint ; porté dans les bras (couché), sur la table du salon
  (assis), dans la caisse de transport (couché, pose figée), vignettes (pose figée).
- **Équipement** : collier plat ajusté sur l'encolure **mesurée sur le chat debout** (là où le cou est le plus
  fin ; à moitié enfoncé dans la collerette des poils longs), mêmes mesures que le chien réaliste
  (`dogFit`/`accessoryFit` : `gearModels.js`, `salon.js`, `Beauty.js`) ; accessoires du salon (nœud, fleur,
  chapeau sur le crâne, bandana qui pend vers le sol, nœud de queue).
- **Performance** : version allégée au loin (5 m en basse qualité, 12 m en haute), boîte des os pour le
  « frustum culling », chats hors du champ animés une image sur trois (sauf guidés, portés, perchés), couches de
  poil en haute qualité seulement et de près.

## Performance (mesurée le 20/10/2026)

Navigateur Chromium sans carte graphique (SwiftShader) sur une machine partagée de 4 cœurs, chargée par d'autres
navigateurs (charge ≈ 23) : le nombre d'images par seconde du jeu y tombe à 0,1–1,4 avec ou sans chats et ne mesure
rien. Les chiffres utiles sont pris la boucle du jeu arrêtée : animation (`AnimalEntity.animate`, 120 images) et rendu
d'une image attendu jusqu'au bout (`gl.finish`, médiane de 30), avec 0, 10 et 20 chats de toutes les races (dont des
chatons) à 2–4 m de la caméra ; chat réaliste (GLB) contre chat procédural (GLB bloqués : le repli actuel).

| 20 chats de près | appels de dessin | triangles ajoutés | rendu d'une image | animation d'un chat |
| --- | --- | --- | --- | --- |
| téléphone 390×844, qualité basse — procédural | +419 | +159 000 | 12,5 ms | 0,04 ms |
| téléphone 390×844, qualité basse — **réaliste** | **+92** | +196 000 (10 au loin) | **5,4 ms** | 0,15 ms |
| ordinateur 1280×800, qualité haute — procédural | +774 | +2 000 000 | 25,3 ms | 0,11 ms |
| ordinateur 1280×800, qualité haute — **réaliste** (poil long en couches) | **+134** | **+540 000** | **17,9 ms** | 0,39 ms |

Avec 10 chats : téléphone 4,1 ms de rendu (procédural 6,2 ms), ordinateur 10,8 ms (procédural 33,6 ms). Dans le jeu
lui-même, caméra par défaut (chats à 8–20 m, tous en version réduite) : 20 chats réalistes ajoutent 68 appels et
104 000 triangles en qualité basse (procédural : 559 appels, 215 000 triangles), 80 appels et 121 000 triangles en
qualité haute (procédural : 754 appels, 2 000 000 de triangles). Le chat réaliste coûte 3 à 4 fois plus de calcul
d'animation (mixeur, pieds au sol) mais 2 à 4 fois moins de dessin : l'image complète est moins chère, sur téléphone
comme sur ordinateur. Au loin il n'est animé qu'une image sur deux (`FAR_STEP`), hors du champ une sur trois.
