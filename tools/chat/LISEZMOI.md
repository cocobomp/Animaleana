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
   - **genou fondu large** (`knee_band`) : près du genou, le partage fémur/tibia suit le plan qui coupe l'angle du
     genou en deux, en fondu sur une demi-largeur de 1 (adulte) ou 1,3 (chaton) longueur de fémur ; **pattes arrière
     propres** (`leg_clean`) : la part de la queue (jusqu'à 0,07) revient à l'os de la patte, celle de la patte d'en
     face (jusqu'à 0,09) au même os du bon côté ; **flanc** (adulte, `flank_clip`) : loin de l'os, devant la hanche
     ou derrière l'épaule, la part du fémur et du bras (jusqu'à 0,3 au milieu du flanc) revient à l'os du dos. Avant,
     assis et pendant la toilette, la peau du pli du genou et du flanc se retournait : triangle de faces arrière
     (magenta en débogage) devant la cuisse repliée, sur toutes les races. Mesuré dans Blender (tous les clips à 0, ¼,
     ½, ¾) : peau retournée visible de l'adulte 376 → 94 cm² au total, assis 16,7 → 1,4 cm² ; dans le jeu, pattes
     arrière pendant la toilette 0,8–25 → 0,3–1,2 cm² (adulte), 2,6–8,8 → 0,9–2,2 cm² (chaton). Le chaton garde un
     fondu plus étroit (rayon 1,2 au lieu de 1,5) : plus large, l'arrière de la cuisse remontait dans le pli et la
     recherche de la hauteur assise (`sit_search`) l'asseyait deux fois plus bas ; la croupe assise est maintenant
     choisie d'après la part des os du bas de la jambe (plus de 0,6 : exclue), pas d'après l'os dominant. Coût : nul
     dans le jeu ; GLB adulte −0,2 Ko, chaton +2,4 Ko ;
   - **soles à plat** (chaton, `sole_flat`) : la chaleur partageait la peau de la sole à parts égales entre les doigts
     et le métacarpe (ou le métatarse) jusqu'au sol ; au pas, le métacarpe bascule autour de l'articulation des doigts,
     12 mm au-dessus du sol, et le coussinet reculait en se levant. Près du sol, la sole suit les seuls doigts ;
   - tête rigide, oreilles en deux os (base → bout), queue en 8 os le long de son axe.
3. **`make_cat.py`** + **`cat_gait.py`** : animations, 20 clips par modèle.
   - **allures générées** par trajectoires de pieds et cinématique inverse : `walk`, `trot`, `run` (galop),
     `balance` (marche lente sur une barrière, pattes resserrées sous le corps, queue en balancier) ; leurs
     **vitesses naturelles** (doigts en appui immobiles) vont dans le GLB (`extras.cat.naturalSpeeds`) : adulte
     0,54 / 1,62 / 5,74 m/s (équilibre 0,27), chaton 0,41 / 1,19 / 3,68 m/s (0,26) ; au pas, le pied arrière (et
     le pied avant du chaton) **se pose immobile par rapport au sol** (`land`) : il arrive un peu au-delà de sa pose aux
     80 % du lever (93 % pour le pied avant du chaton), puis revient en arrière en prenant la vitesse de l'appui. Avant,
     sur le squelette des races aux longues pattes, la sole touchait le sol avant la fin du lever, le pied encore lancé
     en avant à 1,9 à 2,3 fois la vitesse d'appui (siamois ; abyssin 1 à 1,4 ; jeune siamois 1,3 à 1,8 ; pieds avant
     du chaton 2,4) ; maintenant de −0,6 à +0,7 ;
   - **positions et gestes** : `idle`, `sit`, `groom` (toilette, patte léchée puis passée sur la tête), `lie`
     (couché en sphinx), `sleep` (en boule, queue enroulée), `stretch` (étirement), `eat` (accroupi, tête à 3,5 cm
     du sol), `tail_up` (queue en point d'interrogation, calque), `ears` (calque), `highfive` (« tape-m'en cinq »),
     `jump`, transitions `sit_down`, `stand_up`, `lie_down`, `get_up`, `curl_up` ; chaton (poitrail profond, ses bras
     ne touchent pas le sol à plat) : couché **« en pain »** (`lie_loaf` : poignets sous le poitrail, pattes repliées
     vers l'arrière, coudes contre le flanc ; avant, assis comme une otarie, pattes tendues devant), **en boule
     couché sur le flanc** (`curl_side` : roulé sur le flanc droit de 83° (`curl_roll`), colonne enroulée autour de
     la verticale du sol, tête ramenée contre les pieds arrière puis tournée sur sa joue (`curl_head`,
     `curl_head_roll`), queue enroulée dans le plan du sol (`curl_tail`), pattes du dessous rentrées vers le ventre
     (`curl_splay`), boule posée sur le sol et recentrée au-dessus de la racine ; mesuré dans le jeu : roulis 0 → 83°,
     tête à 70 → 37-50 % de sa hauteur debout, à 0,54 → 0,24 longueur de corps des pieds arrière ; avant, debout
     tassé sur ses pattes, dos rond, tête entre les pattes) et son passage `curl_up` (le chaton roule sur le flanc,
     la tête tourne avant le corps ; à chaque image, le plus bas sommet posé sur le sol : il ne flotte plus de 4 cm à
     mi-chemin) ; **yeux peints portés par la seule tête** (`eye_rigid` : la chaleur leur donnait encolure et
     omoplate, le globe s'étirait de 25 à 36 % en boule) — réglages du chaton dans `cat_models.py`, les autres clips
     restent identiques à l'octet près ;
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
`cat_kitten.glb` **0,74 Mo** (15 530 triangles, 4 600 au loin, 41 os, 20 clips ; +4 Ko pour la boule sur le flanc).

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
  épaisseur, panache ; **pompon** du bobtail : le bout de la queue raccourcie est posé sur une boule de 2,7 cm
  (adulte ; moins de deux fois le rayon de la queue à sa base) qui touche la croupe, en touffes irrégulières, portée
  d'un bloc par le premier os de la queue et dont la robe est lue près de la croupe — `stubSkin`, poids et repères
  propres à la race ; avant, un tonneau de 4 cm au bout bombé, froissé par les huit os de la queue, au motif lu au bout
  de la queue d'origine : un bouchon sombre à bord net ; en haute qualité et de près, 3 couches de poil sur le pompon
  seulement, 3 appels de dessin de plus par bobtail proche), poil long poussé le long de la normale (collerette,
  culottes, panache ; presque pas dans le pli du genou, `W.knee`, et pattes épaissies à moitié seulement : assis,
  les culottes poussées de 1,2 cm s'y retournaient — maine coon 18,8 → 1,0 cm² de peau retournée visible pendant la
  toilette, norvégien 18,2 → 0,8, british 10,4 → 1,6) ou ras (siamois, sphynx). Sommets et têtes d'os sont déplacés ensemble : le squelette de chaque race
  garde les rotations de repos du GLB, les clips s'y appliquent tels quels ; pieds au sol. Une géométrie par race
  (et par stade), partagée entre les chats de cette race.
- **Chatons** : modèle du chaton, traits de la race adoucis ; le **jeune** prend le modèle adulte (tête un peu plus
  grosse, pattes un peu plus courtes) ; le chat change de modèle quand il grandit (`AnimalEntity.applyScale`). La
  peau des oreilles du chaton est réparée au chargement (`repairEarSkin`) : le dos du pavillon, la conque et une
  partie du bord suivaient la tête seule, les grandes oreilles (sphynx, siamois, devon rex) s'effilochaient en
  franges ; le pli du scottish fold garde les poids d'origine (`base.earRaw`). Iris du chaton peint par le shader
  des yeux (bleu des points, cuivre, vert…).
- **British et chartreux** : british rond et trapu (crâne et joues larges, museau court, petites oreilles rondes,
  poil en peluche), chartreux plus long (museau, pattes), gris bleu aux yeux orange. **Persan** : face plate en
  rampe douce, la peau autour des yeux suit la tête d'un bloc et le poil n'y pousse pas (yeux dégagés, aussi chez
  le chaton). **Devon rex** : ondulations régulières de la couleur du pelage, presque rien sur la face.
- **Moustaches** : vibrisses fines et claires (`addWhiskers`, `petReal.js`) liées à l'os de la tête, courtes et rares
  chez le sphynx, ondulées chez le devon rex ; cachées au loin (version allégée).
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
  couché, « tape-m'en cinq », révérence = étirement, saut) ; regard, clignements, **paupières** (bandeaux de peau
  propres à la race, tournés sur l'œil : mi-closes à la toilette et couché, fermées en boule), oreilles qui bougent et se couchent (peur, tristesse) et dont le bout ne passe jamais sous le sol (couché, en boule : l'oreille tourne à sa base autour de l'axe du chat tel qu'il est couché), queue dressée quand il suit
  quelqu'un, gonflée quand il a peur, respiration, embonpoint ; porté dans les bras (couché), sur la table du salon
  (assis), dans la caisse de transport (couché, pose figée), vignettes (pose figée).
- **Pieds posés** : au pas et au trot, pieds avant et arrière à la même hauteur (`levelPairs`, appui le plus bas de
  chaque paire sur la dernière foulée) et pieds en appui tenus sur place (`footLock`, prise à 12 mm, lâchée à 18 ;
  pied arrière pris seulement quand il ne va plus plus vite que le chat, et point d'appui du pied avant gardé tout
  l'appui par la reprise au sol `seatPlanted`). Mesuré au pas : siamois, abyssin, devon rex, sphynx et bobtail
  (adultes et jeunes, 0,5 à 0,7 m/s) avaient les quatre pieds en l'air 38 à 51 % du temps, maintenant jamais (chaque
  pied posé 29 à 58 % du temps, glissement 1,2 à 2,6 %) ; pieds avant du chaton au pas lent (0,3 m/s) : glissement 8 à
  23 % → 1,4 à 3,1 %, pieds arrière 3,5 à 4,8 % → 0,7 à 1,4 % ;
  jarrets du chaton au-dessus du sol aux allures. Après les mesures faites sur le premier chat de la race, le mixeur
  est forcé de tout réécrire (`resync`) : le premier chat marchait les pattes avant en l'air, les suivants non.
- **Équipement** : collier plat ajusté sur l'encolure **mesurée sur le chat debout** (là où le cou est le plus
  fin ; à moitié enfoncé dans la collerette des poils longs), mêmes mesures que le chien réaliste
  (`dogFit`/`accessoryFit` : `gearModels.js`, `salon.js`, `Beauty.js`) ; accessoires du salon (nœud, fleur,
  chapeau sur le crâne, bandana qui pend vers le sol, nœud de queue). Collier du chaton mesuré du poitrail vers la
  tête : sur l'encolure, plus un cerceau autour du crâne. La coupe du cou compte aussi la gorge (sa peau est portée
  surtout par les pattes avant : sans elle, l'avant du collier passait 3 à 6 cm dans le cou, caché sous le menton) ;
  la robe est serrée sous la bande dans le shader (`catCoat.js`, pose du moment retrouvée par l'os du cou). De face,
  dessous de la bande visible : 0/7 → 7/7 points (`catFin2.test.js`), pixels du collier sous le menton 0 → 360 à
  400 (maine coon, norvégien, ragdoll, persan). Nœud, grelot et foulard posés sur le bas de la bande, à leur taille
  d'avant (`span`). Reste : en mangeant (tête baissée), l'anneau porté par l'os du cou sort encore de la peau.
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
