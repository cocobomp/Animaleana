# Cheval réaliste : fabrication de `public/models/horse_real.glb`

Le cheval du jeu vient de deux ressources d'OpenGameArt, toutes deux dans le domaine public (CC0 1.0) :

- **modèle et textures 2k** : Lyndon Daniels, pack *Realtime Ranchers 3D model pack*
  <https://opengameart.org/content/realtime-ranchers-3d-model-pack> (dossier `horse/`) ;
- **squelette** (le même cheval, riggé) : ChadM, *Rigged horse*
  <https://opengameart.org/content/rigged-horse> (`riggedHorse.blend`).

Le modèle d'origine n'a aucune animation : toutes les allures sont générées ici.

## Chaîne de fabrication (Blender 4.2 en mode `--background`, puis glTF-Transform)

`build.sh` enchaîne les quatre étapes (variables `BLENDER`, `SRC`, `WORK`, `GT`).

1. **`lyndon_prep.py`** : matières refaites (robe, crins en cartes alpha, yeux), crinière, queue et yeux liés
   au squelette puis fusionnés en un seul maillage, mise à l'échelle (garrot 1,6 m), sabots au sol.
2. **`prep2.py`** : squelette du jeu.
   - squelette recentré sur le plan de symétrie du maillage, os renommés (`Spine`, `Neck`, `Head`,
     `EarL`/`EarR`, `Tail1`/`Tail2`, `FL1…FL4`, `FR1…FR4`, `HL1…HL4`, `HR1…HR4` ; L = côté +x = gauche du cheval) ;
   - un **os de paturon** par membre (le canon s'arrête au boulet) : le sabot reste à plat pendant l'appui ;
   - `Ribs` (respiration) et `Mane1…Mane4` (crinière souple : le jeu les laisse pendre quand l'encolure descend) ;
   - occlusion ambiante par sommet (couleur de sommet R) ;
   - **textures** : la robe peinte (alezan, balzanes, liste, mouchetures claires) devient une carte de
     **modelé en niveaux de gris** (luminance ÷ luminance médiane de la robe, ÷ 2) ; les blancs et leur liseré
     sont bouchés par le modelé voisin lissé (luminance de la robe autour), avec le grain du poil recopié de
     la robe voisine (plus de taches orange sur les balzanes en alezan, plus de « liste fantôme » en
     mosaïque sur le chanfrein) ; la corne garde son propre modelé. Les crins deviennent une carte grise avec leur transparence. Le jeu recolore tout par
     shader (`src/game/models/horseCoat.js`) : toutes les robes et marques de `src/sim/horseLook.js`.
3. **`anim2.py`** + **`gait2.py`** : allures générées par trajectoires de sabots et cinématique inverse
   (membres à 4 os : sabot visé, angle du sabot, boulet, canon, avant-bras, épaule) :
   - `walk` (1,6 m/s), `trot` (3,0), `canter` petit galop à gauche et `canterR` à droite (4,6), `gallop` (8,5) :
     ce sont les vitesses « naturelles » (`NATURAL_SPEED` dans `horseReal.js`), celles où les sabots posés ne
     glissent pas ; le jeu joue chaque clip à vitesse réelle ÷ vitesse naturelle. Pour une race, les allures
     sont **recalées dans le jeu** (`lockedGaits`, voir plus bas) : ses membres n'ont pas la longueur du
     modèle, et 25 clés par seconde ne suffisent pas au galop (trois clés par appui) ;
   - en fin d'appui le sabot bascule sur la pince, en soutien il se replie ; les points de la sole ne passent
     jamais sous le sol (la cible est relevée), vérifié ensuite sur le maillage déformé (rapport JSON) ;
   - `idle`, `rest` (repos d'un postérieur, sabot sur la pince), `eat` (bout du nez à 3 cm de l'herbe, un
     antérieur un peu en avant).
   **`normfix.mjs`** (après `anim2.py`, sur le GLB brut) : la carte de relief de la robe de la source
   (`HorseMain2k00Norm00`) porte une vingtaine de petites taches de normales extrêmes, tournées vers l'intérieur
   de la peau (bleu < 128) : une fente sombre, bleutée de près, en haut de la croupe des deux côtés (pixels
   (832, 473) et (833, 547) en 1024²), des points sous les coudes, aux grassets et aux jarrets. Chaque tache
   (écart au médian 11×11 et cœur « impossible », hors de la tête : u > 0,4) est remplie par diffusion depuis la
   peau voisine, puis les normales sont renormalisées. `node normfix.mjs brut.glb sortie.glb --liste` les liste
   sans rien écrire.
4. **`pack.mjs`** (glTF-Transform 4, meshoptimizer, sharp) : animations ré-échantillonnées, textures en WebP
   (modelé 1024, relief 1024 / 512), maillage quantifié et compressé (meshopt).
5. **`lod.mjs`** (meshoptimizer) : version allégée, sans toucher à la géométrie ni aux allures (encodage
   meshopt sans filtre : identiques au bit près, vérifié) :
   - un **index simplifié par matière** (fusion d'arêtes sur les sommets existants), rangé dans un nœud
     `horse_lod` (`extras.lod`) dont les primitives partagent les attributs de la primitive d'origine :
     robe 7 390 → 3 103 triangles (écart 0,45 % de sa taille, ≈ 1,2 cm), yeux 1 920 → 384, crins 5 676 → 2 837
     (0,21 %, ≈ 0,6 cm) ; en tout
     **14 986 → 6 324 triangles** ;
   - la **carte des crins** (`horse_hair_detail`) ramenée à **512²** comme sa carte de relief (354 → 103 Kio) :
     elle pesait plus que celle de la robe.

   Fichier final : **751 048 octets** (733 Kio, dont 376 Kio d'images WebP), contre 994 432 avant l'étape 5.
   (Le fichier du jeu a reçu la carte de relief corrigée sans refaire la chaîne : `normfix.mjs` sur l'image du
   GLB brut, encodée en WebP comme `pack.mjs` — qualité 82, effort maximal, qui redonne l'ancienne image au
   bit près sans la correction — puis remise dans le GLB ; géométrie, allures et autres images identiques.)
   `lod.mjs` peut être relancé sur sa propre sortie (il refait les index).

Pour ne changer qu'une texture sans refaire les allures : relancer `lyndon_prep.py` et `prep2.py`, puis
**`retex.mjs`** remplace l'image dans le GLB brut d'origine (`node retex.mjs horse_raw.glb horse_body_detail
work/tex/horse_body_detail.png horse_raw_retex.glb`), `normfix.mjs` bouche les taches du relief, `pack.mjs` le
compresse et `lod.mjs` ajoute la version allégée (géométrie et allures identiques).

## Dans le jeu

`src/game/models/horseReal.js` construit le cheval derrière l'interface du cheval sculpté
(`horseModel.js`, gardé comme modèle de repli si le GLB ne charge pas) : proportions de chaque race par
déformation du maillage et du squelette (le gabarit natif est un cheval de trait : `NATIVE_BUILD`),
brosse du Fjord et des poulains, fanons, robe, mixeur d'allures, équipement posé sur des coupes mesurées.
Le modèle source a les paupières à demi fermées (regard somnolent en permanence) : au chargement,
`openEyelids` fait tourner les sommets autour de chaque œil sur la sphère du globe (paupière supérieure
relevée de 0,42 rad, inférieure abaissée de 0,12, coins en place), ce qui ouvre l'œil sans rien faire passer
dedans ; au-delà de ≈ 0,5 rad, des triangles de la paupière se replient.
**Œil vivant** : `mapEyes` cherche la partie du globe que les paupières laissent voir (rayons depuis chaque
sommet, le long de la normale, contre le pelage), son centre (axe du regard) et le grand axe de la fente, puis
projette des UV sur le plan du regard ; `eyeTexture` peint l'iris (brun foncé, fibres, pupille horizontale,
grains de suie) sur une toile 256² partagée ; `eyeMaterial` ajoute dans le shader un reflet net du soleil là où
la normale du globe est la bissectrice de la lumière et du regard, ramené dans l'ouverture quand ce point est
caché, et réduit à un pixel assombri d'autant quand l'œil est petit à l'écran (ni œil blanc ni œil gris de loin).
≈ 20 ms de plus à la préparation du GLB, quelques instructions sur les seuls pixels des yeux.

**Appuis calés** (`lockedGaits`, une fois par gabarit, une allure à la fois : `model.lockGaitStep`) :
chaque allure est rééchantillonnée à 100 images/s sur les membres de la race ; pendant l'appui (sole à
moins de 1 cm du sol, sabot qui flotte un peu au bout de l'appui compris), la pince suit une droite à la vitesse
de l'allure (moindres carrés, même pente pour les quatre membres) et la sole est au sol ; un peu avant la pose et
après le lever, le sabot est tenu à sa place d'autant plus qu'il est près du sol (fondu de 2 à 14 cm : il
descend sur sa place au lieu d'arriver en avançant encore avec le corps, et le genou ne rejoint pas le clip
d'un coup au lever). Cinématique inverse amortie dans le plan du membre (`solveLeg` : coude ou grasset,
genou ou jarret, un peu l'épaule ou la hanche ; hauteur et avancée seulement), sabot gardant l'orientation
du clip ; le côté est rattrapé par un petit écart du membre au coude ou au grasset (viser le côté avec des
rotations autour des seuls axes x faisait trembler le sabot). Mesuré sur les 33 races à 60 im/s, étendue de
chaque point de la sole pendant qu'il touche le sol (< 4 mm), vers l'avant / de côté, en cm, clips du GLB →
allures calées : pas 0,51 / 0,76 → 0,01 / 0,01 ; trot 0,27 / 0,10 → 0,02 / 0,02 ; petit galop 0,59 / 0,24 →
0,03 / 0,03 ; galop 0,76 / 0,59 → 0,05 / 0,06 (pire 0,28 / 0,19) ; aucune sole sous le sol.
**Sans coup de genou** : au galop, le genou (ou le jarret) rejoignait le clip d'un coup au lever du sabot (0,78 rad
en une image au trait breton : le sabot tenu à sa place, hors d'atteinte quand le corps est passé devant, tendait
le membre, puis le fondu en hauteur le lâchait en deux images). Désormais : boulet visé à portée du membre (au
plus 97 % de la longueur coude → boulet, jamais tendu : la pince avance un peu en fin d'appui), appui raccourci
aux allures rapides là où la pince n'est plus à portée (au plus un quart), sabot tenu puis lâché en 0,1 s au
moins avant la pose et après le lever, et après le lever un mélange des poses articulation par articulation (pose
du sabot tenu, partie de la correction de l'échantillon d'avant, et pose du clip) au lieu d'un mélange des places
visées ; la sole n'y descend jamais plus bas que dans le clip. Plus grand changement d'angle d'une articulation en
une image, 33 races, 60 im/s : galop 0,77 → 0,45 rad (au lever 0,77 → 0,42, à la pose 0,57 → 0,45), petit galop
0,54 → 0,41, trot 0,33 → 0,32, pas 0,34 → 0,28 (clip du GLB seul : 0,37 au galop) ; glissement, même mesure
qu'au-dessus refaite avant → après : galop 0,07 / 0,06 → 0,06 / 0,05 cm (pire 0,39 / 0,25 → 0,49 / 0,16), petit
galop 0,04 / 0,03 → 0,06 / 0,03, trot 0,03 / 0,02 → 0,04 / 0,01, pas 0,07 / 0,01 → 0,05 / 0,00. Calage : ≈ 30 %
de temps en plus.
Coût, navigateur (machine lente, logiciel) : 4,5 à 14 ms par allure, calées pendant les temps morts après la
construction du cheval (`requestIdleCallback`, au plus tard 1 s chacune) ; au premier pas, 0,3 à 0,5 ms
s'il ne reste rien à caler, 22 à 62 ms si le cheval part dès sa construction (tout est calé d'un coup).
Avant (tout au premier pas) : 27 à 64 ms par nouveau gabarit. Node : 28 ms en moyenne, d'un coup.

Poses imposées par les activités (`realLegPose`) : saut d'obstacle selon sa phase (`jumpLegs` : appel,
bascule, réception, fondus avec l'allure ; le cheval et le cavalier basculent autour du centre du cheval,
`Activities.pitchAbout`, pose complète dans `Activities.poseJump`), « donner le sabot » depuis l'allure, le
genou mène (sabot qui quitte le sol à plat), sole jamais sous sa hauteur de départ et au sol dès le premier
quart du geste (surplus de genou continu, `legLow`) : au plus 2,4 cm par image (33 races, debout et au repos).
Au saut, les mains du cavalier restent au-dessus de l'encolure (`Player.handsOverNeck`, après les séances :
dessus du pelage déformé lu sous chaque main, les bras relevés d'autant).
Couverture : les trois dernières rangées de la nappe tombent droit (`gearModels.shell`, `drape`) au lieu de se
refermer sur la pointe des fesses (la peau de la hanche passait par-dessus le bord). Les pièces liées au
squelette prennent les poids de la peau du tronc et des épaules à toute hauteur (`skinGear`) : chez un petit
poney, le bas du ventre est 15 cm sous le coude, et la sous-ventrière se liait sinon à l'avant-bras voisin.
La peau ne passe plus par-dessus la couverture : l'attache de la queue (os `Tail1`) compte dans la peau du tronc
dont la couverture prend les poids, mais seulement sur une bande de 12 cm au milieu du dos (sinon la queue,
portée haut chez l'arabe, soulevait le bas de la peau de la croupe au-dessus de la couverture, jusqu'à 5 cm,
même à l'arrêt) ; sur l'arrière de la cuisse, la couverture peut s'écarter jusqu'à 3 cm (1,5 cm ailleurs).
Sommets du pelage dehors (33 races × 3 couvertures × arrêt, pas, trot, petit galop, galop) : 3 661 (pire
5,0 cm, arabe ; saddlebred 4,7 ; akhal-teke 1,2 ; trotteur 1,1 ; pur-sang 0,9 ; welsh 0,5) → 0
(`tests/horseRealGame.test.js`).

Le cavalier (`src/game/models/riderFit.js`, appelé par `Player.seat` et `Player.afterSessions`) : à la mise
en selle, une carte des flancs (demi-largeur du pelage et de la selle pour chaque hauteur et chaque z, dans le
repère du tronc qui porte la selle, triangles remplis) et une carte du dessus ; le bassin posé au creux du
siège (un peu en avant ou en arrière si le bassin y descend plus bas : sur un poney la selle est courte pour le
cavalier), les étriers à sa jambe (genou plié de 65°, 50° en western, pied contre le flanc : étrivière
rallongée ou raccourcie, ou fender refait le long du flanc au-dessus de l'étrier en bois). À chaque image, après
les séances (le saut soulève et fait basculer cheval et cavalier) : bassin relevé s'il entre dans le siège,
pied à l'étrier, genou écarté juste ce qu'il faut (cuisse, genou, tibia et pied, avec leur rayon, hors de la
carte et de la peau des épaules, des hanches et de l'encolure relue à cette image), le pied écarté du flanc si
même très écarté le genou touche encore (de 5 cm au plus avec des étriers, qui le suivent). Le siège se lit sur les transformations locales du moment (les
matrices du monde datent de l'image d'avant : au saut, le cavalier s'envolait de la hauteur du saut).
Enfoncement dans le pelage (cm, distance vraie, banc node sur le vrai avatar, avec selle, avant → après) :
bassin 4,4 à 8,1 → 0 ; cuisses jusqu'à 5,8 → 0 ; tibias jusqu'à 5,4 → 0 (Shetland, Selle Français, Frison,
Percheron × arrêt, pas, trot, petit galop, galop, saut de 0,7 et 1,2 m) ; bassin 1,1 à 2,3 cm au-dessus du
creux à l'arrêt (il était 5,6 à 7,5 cm dans le siège) ; plante du pied à moins de 2 mm de la grille de l'étrier
(elle était à 7 à 29 cm), 5 mm au plus au saut. Selle western : 0 dans le pelage, pied à moins d'1 cm du fond
de l'étrier en bois. À cru : jambes 12 à 24 cm dans le cheval → 0 à l'arrêt, au pas et au trot, au plus
1,2 cm une ou deux images sur cinquante au petit galop et au saut (Shetland, Selle Français). Coût :
`afterSessions` 0,08 → 0,16 à 0,19 ms par image (Shetland 0,5 → 0,64 ms, machine lente), mise en selle 3 à
20 ms. `tests/riderFit.test.js`.
`tests/horseReal.test.js` vérifie le fichier (os, clips, compression) et que chaque race garde ses sabots au sol.

**Beauté** (plan « cheval beau », étapes 1, 3, 4 et 5 ; `tests/horseGround.test.js`, `horseHead.test.js`,
`horseCoatShine.test.js`, `horsePortrait.test.js`, `cameraFraming.test.js`) :

- *posé au sol* : le sable des carrières (paddock, concours, carrières construites) est au ras du terrain
  (`buildings.sandGeometry`, 0,4 cm, maille de 1,25 m, décalage de profondeur) ; il était 3 à 5 cm plus haut et
  cachait l'ombre de contact, les sabots et les pieds s'y enfonçaient. Ombre de contact à 0,75 en qualité basse.
  En basse (pas d'ombre du soleil), quatre petites ombres sous les sabots (`soleShadows` : un maillage de
  8 triangles par cheval, placé dans le shader juste avant le dessin d'après les matrices locales des membres :
  pleine sabot posé, nulle levé de 25 cm, poses des activités comprises) ;
- *net sur téléphone* : en qualité basse sur un écran fin, 1,5 pixel par point et MSAA au lieu de 1,25 sans
  anticrénelage, repli à 1,25 si les premières secondes dépassent 22 ms par image (`src/game/pixelBudget.js`) ;
  crins en alphaToCoverage dès que l'anticrénelage est là ; version réduite au-delà de 15 m (et non 7) ;
- *port de tête* : `HEAD_UP` (encolure 0,12 rad, nuque 0,18 rad) ajouté par `overlay` à l'arrêt et au pas, rien au
  broutage ni en somnolence : chanfrein 68° → 48 à 50° sous l'horizontale, nuque 12 cm plus haut ; oreilles
  calmes (±0,06 rad, ensemble, un peu vers l'avant). `model.photoPose()` : la même pose attentive pour les photos ;
- *robe* : modelé peint du GLB adouci (`hDetail`) ; marges noires de la carte de relief traitées dans le shader
  (texel peu bleu = en partie vide, divisé par sa part de vraie normale) ; relief à 0,7 ; terme de bord satiné en
  basse comme en haute, éclairé par le ciel (`gfx.skyRim`) et le soleil (doré le soir, fort en contre-jour), petit
  appoint du soir (`gfx.horseFill`) ; Akhal-Teké sans métal ; robes noires à reflet brun chaud ;
- *bien le montrer* : essayage de la sellerie sur un double neuf de l'animal (`thumbScenes.photoDouble`), cheval
  entier pour la selle et la couverture ; vignettes en pose de photo, cadrées sur le maillage dans sa pose ;
  vignettes des races deux fois plus grandes ; portrait en tête de la fiche ; au box, le cheval se tourne vers le
  joueur ; caméra du concours de beauté cadrant l'animal mené ; à cheval sur un écran en hauteur, caméra décalée de 1,5 m
  de côté, plus près ; « Saut automatique » dans la barre du haut.

Ce qu'il coûte, et comment on le garde bas :

- **élimination hors du champ** : chaque maillage du cheval (`HorseMesh`) a une boîte englobante refaite sur
  la pose à chaque image (une boîte par os, mesurée sur la géométrie de la race, emmenée par la matrice de
  peau de son os : ≈ 3 µs), valable pour la caméra, les ombres, le lancer de rayon et le cadrage des photos.
  Elle contient toujours le maillage déformé (galop, broutage, saut, embonpoint, cartes de crins, couverture
  liée au squelette : `tests/horseRealPerf.test.js`) sans le dépasser de plus de quelques dizaines de cm ;
- **version réduite** (index de `lod.mjs`) au-delà de 15 m en qualité basse et de 22 m en qualité haute
  (distance divisée par la taille du cheval, hystérésis de 10 %) ; en qualité basse, crins sans carte de relief ;
- **animation** : un cheval qui n'est ni dessiné ni dans une ombre n'est animé qu'une image sur trois (temps
  cumulé, jamais perdu), jamais quand on le monte, le mène ou qu'une séance le guide ; « vu ou pas » se décide
  une fois par image (`horseView.frame`), pas à chaque pas de simulation : en avance rapide (⏩, trois pas par
  image), un cheval à l'écran reçoit tout le temps simulé (ses sabots ne patinent pas) ; plus de matrices du monde refaites
  ni d'allocation dans la mise à jour (calage des sabots dans le repère du cheval, listes figées) ;
- **chargement** : la partie ne l'attend plus. Les petits modèles sont attendus, le cheval au plus 1,5 s après
  l'ouverture de la page (un fichier en cache arrive avant) ; sinon on joue avec le cheval sculpté et chaque
  cheval bascule sur le réaliste à son arrivée (`Game.onRealHorse`, un par image), vignettes comprises.

## Coût mesuré

Chromium + SwiftShader (rendu sur le processeur) sur une machine partagée, serveur de développement sauf
mention contraire. Les images/s n'ont de sens qu'en petite fenêtre (320×200 en qualité basse, 640×400 en
qualité haute) et **comparées dans la même session**, en alternance (avant, après, avant, après… ×3,
médianes) : d'une session à l'autre, la charge de la machine change les chiffres du simple au double.
« Avant » = élimination hors champ coupée, version complète, tous les chevaux animés à chaque image ;
le paddock est derrière la caméra au départ (« dos »), puis devant elle (« face »). Sans cheval : 8,5 im/s,
213 appels de dessin, 253 421 triangles en basse ; 1,5 im/s, 657 appels, 800 178 triangles en haute.

| qualité | chevaux | vue | im/s avant → après | appels de dessin | triangles |
|---|---|---|---|---|---|
| basse 320×200 | 10 | dos | 6,7 → 9,5 | 245 → 213 | 404 073 → 253 421 |
| basse 320×200 | 10 | face | 6,7 → 8,2 | 277 → 277 | 410 181 → 323 561 |
| basse 320×200 | 20 | dos | 5,3 → 9,2 | 278 → 213 | 555 565 → 253 421 |
| basse 320×200 | 20 | face | 5,2 → 6,8 | 324 → 322 | 562 013 → 388 769 |
| haute 640×400 | 10 | dos | 1,3 → 1,5 | 711 → 679 | 1 082 292 → 860 380 |
| haute 640×400 | 10 | face | 1,2 → 1,5 | 730 → 729 | 1 087 438 → 929 556 |
| haute 640×400 | 20 | dos | 1,2 → 1,5 | 770 → 705 | 1 366 384 → 942 778 |
| haute 640×400 | 20 | face | 0,8 → 1,2 | 805 → 805 | 1 371 794 → 1 056 044 |

- Par cheval : 15 400 triangles dessinés en basse avant, 6 800 après au paddock (version réduite) ; appels de
  dessin : 3,25 par cheval **hors champ** avant (dessiné quand même), 0 après ; ≈ 5 dans le champ en basse,
  ≈ 7,4 en haute avec la passe d'ombre. En haute, un cheval derrière la caméra mais dans le champ de la
  lumière reste dessiné dans la carte d'ombre (son ombre peut tomber dans l'image) : 2,4 appels par cheval.
- Processeur, une mise à jour d'animation à chaud (µs, ancien code contre nouveau, même machine) : au trot
  49 → 33 (mixeur 16 → 11, procédural 19 → 4,6) ; à l'arrêt, broutant, embonpoint 52 → 26 (procédural
  21 → 7,4) ; boîte englobante ≈ 2,5 µs. Dans le jeu (déplacements compris), par cheval et par image, 20 chevaux
  au paddock dos à eux : 0,095 → 0,052 ms (un cheval caché n'est animé qu'une image sur trois).
- Allocations (profil d'allocation échantillonné, pour 1 000 mises à jour) : celles de `horseReal.js`
  (listes, `Object.entries`, fermetures, littéraux) 1 541 → 363 Ko au trot, 1 270 → 350 Ko à l'arrêt ; le
  reste (≈ 6 Mo) est dans le mixeur de three.js, inchangé.
- Mémoire, 20 chevaux, six allers-retours Normandie ↔ Bretagne : tas après GC stable d'un tour à l'autre
  (112,5 Mo avant, 113,2 Mo après), mêmes géométries et textures à chaque retour ; carte des crins en 512² :
  ≈ 4 Mo de moins sur la carte graphique (1024² RGBA avec mipmaps ≈ 5,6 Mo ; 512² ≈ 1,4 Mo).
- Première visite (build de production, sans cache, 1,6 Mbit/s et 150 ms de latence) : partie ouvrable à
  6,7 s au lieu de 11,1 s, en jeu (parcours d'entrée joué par un robot) à 13,8 s au lieu de 18,0 s ; le GLB
  arrive à 9,9 s (au lieu de 11,0 s) et les chevaux basculent sur le réaliste ≈ 0,8 s après.
- Construction : données de repos tirées du GLB 300 à 400 ms une fois (désormais à l'arrivée du fichier, plus
  au premier cheval) ; une nouvelle race 20 à 75 ms ; un cheval d'une race déjà construite 1 à 5 ms.
- Fichier portable (`dist/ferme-madichelle.html`, GLB inclus en base64) : 4 376 066 → 4 059 116 octets
  (4,06 Mo, 3,87 Mio).
