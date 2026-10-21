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
     (0,21 %, ≈ 0,6 cm ; les crins du GLB ne sont plus dessinés depuis les cartes de crins, voir plus bas) ; en tout
     **14 986 → 6 324 triangles** ;
   - la **carte des crins** (`horse_hair_detail`) ramenée à **512²** comme sa carte de relief (354 → 103 Kio) :
     elle pesait plus que celle de la robe.

   Fichier final : **751 048 octets** (733 Kio, dont 376 Kio d'images WebP), contre 994 432 avant l'étape 5.
   (Le fichier du jeu a reçu la carte de relief corrigée sans refaire la chaîne : `normfix.mjs` sur l'image du
   GLB brut, encodée en WebP comme `pack.mjs` — qualité 82, effort maximal, qui redonne l'ancienne image au
   bit près sans la correction — puis remise dans le GLB ; géométrie, allures et autres images identiques.)
   `lod.mjs` peut être relancé sur sa propre sortie (il refait les index).
6. **`dilate.mjs`** (meshoptimizer, sharp ; `node dilate.mjs horse_real.glb sortie.glb`, sur le GLB de `lod.mjs`,
   jamais deux fois) : coutures de la robe.
   - les **îlots d'UV** de la carte de modelé et de la carte de relief sont retrouvés en dessinant les triangles de
     la robe dans l'espace des UV, puis **dilatés de 48 px** (chaque texel hors d'un îlot prend la moyenne de ses
     voisins déjà remplis ; au-delà, la moyenne des îlots) : hors des îlots, le modelé gardait la mosaïque de gris
     de la texture source et le relief du noir, que le filtrage et les mipmaps mêlaient au bord des îlots (fin
     trait sombre le long de la ganache d'un bai, petits triangles sombres à la nuque) ;
   - **niveaux de gris raccordés** le long des 329 coutures (arêtes dont les deux triangles ont des UV
     différentes) : écart des gris moyens (flou de 5 texels, îlot seul) mesuré des deux côtés, décalage de ∓ la
     moitié fixé sur la couture et étendu à tout l'îlot par une interpolation de Laplace (du grossier au fin) : le
     grain du poil ne change pas. Écart moyen 24,3 → 5,2 sur 255 ;
   - **côtes adoucies** sur le corps (u > 0,3 ; pas sur la tête, où yeux, naseaux et ganache ont cette taille) :
     la carte de relief porte l'essentiel des côtes (sans elle, plus aucune sur le flanc ; sans le modelé, elles
     restent) — des rayures de 10 à 14 texels de période ; 80 % de sa bande moyenne (flou de 1 texel moins flou de
     20 texels, sur les pentes x et y, îlots seuls) sont retirés et les normales renormalisées (écart type de la
     bande 0,115 → 0,024) ; le grain du relief et les grandes masses (épaule, croupe, coude) restent. Le modelé perd
     la moitié de sa bande 3-20 texels (les ombres peintes des côtes : écart type 18,8 → 9,5 sur 255).

   Fichier final : **749 992 octets**.

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
creux à l'arrêt (il était 5,6 à 7,5 cm dans le siège) ; semelle (la vraie : le pied est incliné talon bas,
-0,22 rad) sur la grille de l'étrier, à -1 à 0 mm (elle était à 7 à 29 cm, puis 1,8 cm au-dessus tant que la
cheville était posée 5 cm au-dessus de la grille sans compter l'inclinaison du pied). Pied écarté du flanc de
15 cm au plus, ramené à portée de la jambe, l'étrier posé sous lui (avec 5 cm, au saut d'un Falabella en selle
poney, cuisses et tibias entraient de 4 à 5 cm). Selle western : 0 dans le pelage, semelle à 2 à 4 mm du fond de
l'étrier en bois (1,8 cm quand l'étrier n'était décalé qu'en x). Au pied à terre, étriers et étrivières à leur
place (la bombe est ôtée une fois descendu : ôtée encore en selle, elle refaisait l'avatar, remis en selle, et
les étriers restaient à la jambe). À cru : jambes 12 à 24 cm dans le cheval → 0 à l'arrêt, au pas et au trot,
au plus 1,2 cm une ou deux images sur cinquante au petit galop et au saut (Shetland, Selle Français).
Vérifié dans le jeu (mesure indépendante : tous les sommets des jambes et du bassin, parité latérale et
verticale contre le pelage déformé, à chaque image dessinée) : 20 couples race × selle (Selle Français, Shetland,
Percheron, Frison, arabe, akhal-teke, Falabella, trait breton, islandais, welsh, boulonnais, quarter, haflinger,
fjord ; selles mixte, dressage, saut, randonnée, western, poney, course, à cru, couverture ou tapis sous la
selle) × arrêt, pas, trot, petit galop, galop : 0, sauf pied du Falabella ≤ 3 mm et cuisse à cru (Shetland,
Falabella) ≤ 0,9 cm, une ou deux images sur 16 ; en western sur Shetland et Falabella, la cuisse touche la jupe
de la selle (≤ 1,2 cm). Coût :
`afterSessions` 0,08 → 0,16 à 0,19 ms par image (Shetland 0,5 → 0,64 ms, machine lente ; dans le jeu sur une
machine surchargée, médiane 0,2 → 0,4 ms, Shetland 0,5 → 0,9 ms), mise en selle 3 à 20 ms. La bombe est mise
avant de monter (`Game.ride`) : l'avatar refait par `setHelmet` n'est ajusté au cheval qu'une fois (il l'était
deux fois, la première pour un avatar aussitôt jeté). `tests/riderFit.test.js`.
`tests/horseReal.test.js` vérifie le fichier (os, clips, compression) et que chaque race garde ses sabots au sol.

**Beauté** (plan « cheval beau », étapes 1, 3, 4 et 5 ; `tests/horseGround.test.js`, `horseHead.test.js`,
`horseCoatShine.test.js`, `horsePortrait.test.js`, `cameraFraming.test.js`) :

- *posé au sol* : le sable des carrières (paddock, concours, carrières construites) est au ras du terrain
  (`buildings.sandGeometry`, 0,4 cm, maille de 1,25 m, décalage de profondeur) ; il était 3 à 5 cm plus haut et
  cachait l'ombre de contact, les sabots et les pieds s'y enfonçaient. Ombre de contact à 0,75 en qualité basse.
  En basse (pas d'ombre du soleil), quatre petites ombres sous les sabots (`soleShadows` : un maillage par
  cheval, placé dans le shader juste avant le dessin d'après les matrices locales des membres : pleine sabot posé,
  nulle levé de 25 cm, poses des activités comprises), qui porte aussi l'ombre de contact (5e carré, fixe sous le
  corps, 0,75) : 10 triangles et **un seul appel de dessin** par cheval, comme avant les ombres des sabots (qui en
  coûtaient un de plus) ; en haute, l'ombre de contact reste à part (0,5) ;
- *net sur téléphone* : en qualité basse sur un écran fin, 1,25 pixel par point **avec MSAA** (avant : sans
  anticrénelage) ; si les premières secondes dépassent 22 ms par image (`src/game/pixelBudget.js`), 1 pixel par
  point pour la partie en cours (le MSAA ne peut plus changer) et l'appareil est retenu (`animaleana.pixelSlow`) :
  aux parties suivantes, un téléphone lent reprend l'ancien réglage, 1,25 sans MSAA. (1,5 pixel par point avec
  MSAA, essayé d'abord, coûtait 2 à 2,6 fois l'ancien temps d'image sur SwiftShader : voir plus bas ; sur un
  processeur graphique de téléphone, qui dessine par tuiles, le MSAA coûte bien moins que des pixels en plus.)
  Crins en alphaToCoverage dès que l'anticrénelage est là ; version réduite au-delà de 15 m (et non 7) ;
- *port de tête* : `HEAD_UP` (encolure 0,12 rad, nuque 0,18 rad) ajouté par `overlay` à l'arrêt et au pas, rien au
  broutage ni en somnolence : chanfrein 68° → 48 à 50° sous l'horizontale, nuque 12 cm plus haut ; oreilles
  calmes (±0,06 rad, ensemble, un peu vers l'avant). `model.photoPose()` : la même pose attentive pour les photos ;
- *robe* : modelé peint du GLB adouci (`hDetail`) ; marges noires de la carte de relief traitées dans le shader
  (texel peu bleu = en partie vide, divisé par sa part de vraie normale) ; relief à 0,7 ; terme de bord satiné en
  basse comme en haute, éclairé par le ciel (`gfx.skyRim`) et le soleil (doré le soir, fort en contre-jour), petit
  appoint du soir (`gfx.horseFill`) ; Akhal-Teké sans métal ; robes noires à reflet brun chaud ;
- *bien le montrer* : essayage de la sellerie sur un double neuf de l'animal (`thumbScenes.photoDouble`), cheval
  entier pour la selle et la couverture ; vignettes en pose de photo, cadrées sur le maillage dans sa pose ;
  vignettes des races deux fois plus grandes ; portrait de la fiche (sur un téléphone en hauteur, à droite des
  étiquettes : au-dessus, il repoussait les boutons de soins sous le bas de l'écran) ; au box, le cheval se tourne
  vers le joueur — une fois arrivé dans son box seulement (`inStall`, 1,2 m) : « Rentrer au box » ne s'arrête plus
  en chemin quand l'enfant est à côté ; caméra du concours de beauté cadrant l'animal mené, qui passe devant un grand
  décor (arche, panneau du terrain : `rig.occluders`, posé par `Beauty.js`) au lieu de reculer derrière ; à cheval
  sur un écran en hauteur, caméra décalée de 0,85 × 1,8 m de côté (`MOUNT_SIDE`) mais visant le cheval
  (`MOUNT_AIM` 0), plus bas et moins loin devant (`MOUNT_DROP` 1,1 m, `MOUNT_AHEAD` 0,1 m, tangage + 0,2) : le
  cheval entier au milieu de l'écran, croupe, queue et postérieurs au-dessus de « Descendre » et des boutons ronds ;
  le décalage de côté est testé contre les murs (réduit au premier mur, lissé : la caméra n'entre plus dans
  l'écurie quand on longe son mur côté montoir) ; « Saut automatique » dans la barre du haut.

  Mesuré (téléphone 390×844 DPR 3, 10 chevaux au paddock, Chromium SwiftShader sur une machine chargée : les
  temps d'image ne valent qu'en comparaison de mesures faites l'une après l'autre) : en basse, 297 k → 315 k
  triangles (les deux chevaux les plus proches en version complète), 99 → 106 appels de dessin (ombres des
  sabots, revenus depuis à un appel par cheval), mémoire inchangée (≈ 112 Mo), 26 → 27 programmes. Temps
  d'image : le « + 14 à 21 % » écrit ici d'abord était faux — la contre-vérification (6 paires en alternance) a
  trouvé × 2,0 à × 2,6 à 1,5 pixel par point avec MSAA contre l'ancien réglage (SwiftShader dessine sur le
  processeur : 1,44 fois plus de pixels et le MSAA payé en entier), + 7 à + 22 % pour le reste des changements au
  réglage de repli (1,25 sans MSAA). D'où le réglage actuel, 1,25 avec MSAA (mesures de la correction
  ci-dessous). En haute : + 0,6 k triangles, mêmes appels, même temps d'image.

  Correction après la contre-vérification (ombres de contact et des sabots en un maillage, crins refaits, robes,
  tresses, caméra ; même vue, avant/après en alternance ×2, machine chargée — charge 9 à 12 sur 4 cœurs) :
  - *à définition et anticrénelage égaux*, temps d'un rendu seul (médiane de 10) dans le bruit : 1 471-2 657 →
    1 525-1 947 ms (MSAA, 1,25 et 1,5 pixel par point, tour chargé), 711-1 074 → 781-1 123 ms (tour moins
    chargé), 456-949 → 459-552 ms (sans MSAA, 1,25) ; processeur (image sans rendu) ≈ 1 ms des deux côtés ;
  - appels de dessin 116 → 104 (contexte MSAA) et 112 → 104-106 (sans MSAA) : un de moins par cheval ;
    triangles 318 263 → 319 621 (+ 0,4 %, crins plus larges) ; programmes 26 → 25 ; mémoire JS 135-137 →
    130-132 Mo ; en haute (2 pixels par point, MSAA, ombres) 530 692 → 532 968 triangles, 104 appels et 4
    géométries par cheval des deux côtés ;
  - *définition*, mêmes tours : 1,25 sans MSAA (ancien réglage) 456-552 ms, 1,25 avec MSAA 711-855 ms (× 1,6),
    1,5 avec MSAA 892-1 123 ms (× 2) — le nouveau réglage par défaut (1,25 avec MSAA) coûte 20 à 35 % de moins
    que 1,5 avec MSAA sur SwiftShader ; à mesurer encore sur un vrai téléphone Android milieu de gamme (pas
    disponible ici), le repli des premières secondes protège les appareils lents.

**Crins en cartes** (plan « cheval beau », étape 2 ; `src/game/models/horseHair.js`, `tests/horseHair.test.js`) :
les crins du GLB (primitive `horse_mane`, 5 676 triangles, texture « Hair12 » de fourrure frisée rangée en étoile)
ne sont plus dessinés — plaque de caoutchouc sur l'encolure, perruque sur le front, queue en sac. À leur place,
des cartes de crins générées pour chaque gabarit (`hairShape`, géométrie partagée par les chevaux de la race,
ton gris par sommet, couleur dans la matière de chaque cheval). La crinière, son rouleau, le toupet et la queue
décrits ci-dessous (étape 2) ont depuis été refaits « en volume » (masse + cartes, plus bas) ; la texture des cartes,
la matière, les fanons, la brosse et les tresses restent :

- *crinière* (`maneCards`) : 72 à 120 rubans de 5 ou 6 points le long de la crête, partis juste à gauche de la
  ligne du dessus et couchés sur l'encolure du côté droit (vue de dessus, plus de raie de peau entre les mèches),
  posés par la pesanteur (`drape`) : la mèche part un peu vers le haut, retombe en travers de la crête puis droit
  vers le bas, glisse sur la peau sans y entrer (distance approchée `hairBody` : tronc, encolure en coupes
  perpendiculaires à son axe, tête) et reste couchée sur une peau tournée vers le haut ; `MANE_LEN` 34 cm (24 avant :
  elle ne pendait que de 10 cm et se lisait comme une crête de lamelles) × `B.mane` × le style (`MANE_STYLE` :
  `long` en rideau ondulé, un cinquième des mèches de l'autre côté ; `thick`, plus de mèches, un quart de l'autre
  côté ; `short`), au plus `MANE_MAX` 62 cm, plus courte au garrot et à la nuque, rubans plus larges ; racine liée
  à la peau de la crête, pointe aux os `Mane1-4` (elle pend quand l'encolure descend) ;
- *rouleau de la crête* (sorte 4 de `hairRoot.w`) : mèches courtes (26 % de `MANE_LEN`, 17 % pour `short`) qui
  montent à peine de la crête et retombent du côté de la crinière, hauteurs régulières — un liseré bas et continu
  vu de gauche (la crête de lamelles dressées, de hauteurs tirées au sort, faisait une « iroquoise » crénelée en
  basse) ; mèches de l'autre côté seulement pour les styles qui en ont ;
- *toupet* (`forelockCards`) : 20 à 34 rubans larges partis entre les oreilles, posés sur la tête seule (la distance
  de l'encolure, qui couvre la nuque, les dressait à la verticale ; racines devant le sommet de la nuque), couchés
  sur le chanfrein, plus longs au milieu (bords − 60 %) et resserrés vers le bas en une pointe aux rubans plus fins,
  racine pleine et sombre (plus de bande grise translucide en dents de scie en basse, plus de mèches vues par la
  tranche au pied des oreilles) ; couché face au ciel et au regard, ses crins parallèles s'allumaient en traits gris :
  sur le toupet seul (sorte 1, `vHairK`), reflet de Kajiya-Kay × 0,35 et éclaircissement des crins foncés × 0,4, tons
  proches d'un ruban à l'autre (il reste noir sur des crins noirs) ;
  sous un bonnet anti-mouches (`gearModels.js`, emplacement `head` : `model.setForelockTucked`), ses mèches se
  replient vers leur racine (uniform `hairTuck`, comme la crinière tressée) au lieu de traverser le voile ;
- *queue* (`tailCards`) : 60 à 80 rubans plus larges (44 pour un poulain), groupés par quatre (ondulation et
  profondeur communes : des mèches, pas un rideau de fils), longueurs inégales, partis de la peau du tronçon (coupes : centre et rayon ; 4 cm au-dessus
  des racines du GLB, plus de bosse de peau nue), plus serrés au milieu, qui suivent le tronçon puis pendent, plus
  larges à mi-longueur, effilés au bout, plus longs au milieu, 2,5 cm derrière les fesses et les cuisses (profil
  arrière du pelage : au trot, le postérieur recule sous la queue) ; longueur de la queue du GLB × le gabarit,
  jamais sous `TAIL_CLEAR` ; du tronçon vers `Tail2` sur la première moitié (la queue portée haut de l'arabe
  retombe en arc) ;
- *fanons* : rubans plus fins (3 cm au bout au lieu de 6) et plus nombreux ; *brosse* du Fjord et du poulain : les
  mêmes rubans dressés, sur la nouvelle texture ;
- *version réduite* : les mèches principales seulement (un ruban sur deux, rangées d'abord : un autre index sur les
  mêmes sommets) ;
- *texture* (`hairTexture`) : bande de 512 × 128 générée en code (graine fixe), quatre mèches de 64 crins droits ;
  chaque mèche faite de 5 à 7 petites mèches qui ont chacune leur ton, leur décalage de reflet, leur longueur et
  leur ondulation, crins resserrés vers la pointe (jours entre les petites mèches à partir de mi-longueur) : sur
  les niveaux réduits (téléphone, de loin) les crins fondent mais pas les petites mèches, qui gardent des traînées
  le long des crins et un reflet cassé au lieu d'un ruban de satin uni ; racines pleines aux bords irréguliers (le
  décalage du reflet y change aussi d'un crin à l'autre), pointes effilées ; canaux : ton, décalage du reflet,
  pente du crin en travers, couverture ; niveaux réduits qui gardent la même part de pixels opaques (sinon la
  moyenne de l'alpha passe sous le seuil et les crins fondent au loin) ;
- *matière* (`hairMaterial`) : normales « de volume » ; pointes qui ondulent vers l'extérieur (jamais dans
  l'encolure) ; diffus enveloppant et reflet de Kajiya-Kay le long des crins (0,06 × soleil en haute, 0,045 en
  basse, bande étroite et décalage étalé : sur des crins parallèles comme le toupet couché, un sur cinq environ
  s'allume, pas toute la mèche en gris ; racines plus mates), ombre du soleil comprise (`RE_Direct` de three.js
  remplacé) ; en haute, second reflet teinté et relief du crin ; contre-jour qui
  traverse les pointes ; reflet du ciel atténué (la crinière noire était un aplat gris) ; crins foncés éclaircis crin
  par crin (on lit les mèches en basse, sans reflet), crins clairs plafonnés (plus de blanc brûlé) ;
- *tresses du concours de beauté* : sept boutons sur la peau de la crête (`measureBraids`, du début des racines de
  la crinière à t = 0,86 vers la nuque ; posés au-dessus des mèches, ils flottaient avec un jour dessous une fois la
  crinière rentrée), enfoncés d'un tiers et reliés par un bourrelet bas de crins tressés centré sur la peau à
  mi-chemin (`braidSpots.crest` : 3e élément ; pris sur la crête, pas sur la corde : l'encolure du Frison se creuse
  devant le garrot) — plus de « perles » posées sur une crête ronde avec le ciel autour ; tant que le cheval est
  tressé, les mèches de la crinière et de la crête rentrent dans les boutons (`model.setBraided`) et la crinière
  suit l'encolure sans ressort ni flottement (les boutons, portés par l'encolure, restaient sinon en l'air quand la
  tête bougeait) ; face arrière des mèches de la queue, la tresse de queue suit les crins pendant un coup de queue
  (`tests/horseRealGame.test.js` : bouton et bourrelet sur la peau pour les 33 races).
- *crins « en volume »* (masse + cartes ; sortes 8, 9 et 10 de `hairRoot.w` = 0, 1, 2 + 8 ; intégration des
  prototypes « volume », « cartes » et « tubes », voir plus bas) : sous les cartes, une **masse** lissée, liée au
  squelette comme elles, donne le volume et la silhouette ; elle est peinte en crins dans la bande du bas de la
  texture (512 × 256 : cartes en haut, `HAIR_V` ; masse en bas, `hairMassPixels`), opaque entre ses deux rangées de
  pointes (le cou ne se voit jamais au travers) ; les cartes, moins nombreuses (`MANE_CARDS`, `FORE_CARDS`,
  `TAIL_CARDS`) et plus étroites, font les bords et les pointes qui bougent. Dans l'index, les masses d'abord
  (toujours dessinées ; version réduite : une rangée et une colonne sur deux, puis les cartes principales — une sur
  deux). Les sortes 8 à 10 (`mod 8` dans le shader) : tresses, bonnet, vent et ressorts valent aussi pour la masse ;
  - *crinière* (`maneCards`) : une rangée de points par station le long de la crête (24 à 36 : 2 à 2,5 cm entre deux
    stations suffisent à une masse lisse), posée par `drape` puis écartée de la peau d'une épaisseur (`thick` :
    rouleau de `MANE_ROLL` 5,5 cm sur la crête, × style), 5 points à gauche jusqu'à la crête et 10 ou 11 à droite (la
    crête est toujours la même colonne de la grille : la surface ne se tord pas) ; à gauche, un rouleau plein qui
    retombe en arrondi jusqu'à 9,5 cm sous la crête, bord en pointes (texture) ; à droite, une nappe de 80 % de la
    crinière, au bas inégal, bombée en mèches de 6,5 cm (relief ajouté après le lissage, pas sur le dessus du
    rouleau : sa silhouette reste lisse et arrondie). Le rouleau s'amincit au garrot et vers la nuque ;
  - *mèches de gauche* : 4 mèches de la masse (6 pour `long` et `thick`, aucune pour `short`), chacune une petite
    grille à part (5 rangées × 8 points, 10 à 16 cm de large) qui suit le flanc gauche du rouleau puis pend le long de
    la peau sur 25 à 50 % de la crinière (`leftPath`), pleine sur le rouleau, bombée et resserrée en pointe dessous
    (toutes les rangées d'autant : resserrées chacune à sa mesure, elles se croisaient et la pointe se repliait en
    taches sombres), texture prise dès son bord en pointes. Posées par la pesanteur sur le champ « corps +
    épaisseur », elles glissaient sur le rouleau comme sur un toit et sortaient de 10 cm en travers de l'encolure ;
    ses racines sont juste sous celles de la nappe (une grille par racine, pour les tests) ;
  - *cartes de la crinière* : elles partent de la nappe, 3 à 6 cm sous la crête du côté où elles tombent, en pointe
    (`rootTaper`), et ne montent jamais au-dessus de la silhouette du rouleau (`cap`, à 65 % de son épaisseur) ; leur
    racine (`root` : tresses, ondulation) est sur la peau de la crête. Parties de la crête par-dessus la masse, leurs
    bords droits dépassaient en marches rectangulaires vues de gauche ; vers la nuque, la pesanteur « peignée »
    d'une crête qui remonte les dressait au-dessus des oreilles (les « mèches folles » de face et derrière le
    bonnet) ; parties de dedans, elles traversaient la masse en lames plates. Quelques cartes courtes à gauche,
    parties du milieu du flanc du rouleau (`MANE_LEFT` 20 %), et trois ou quatre sur chaque mèche de gauche, à la
    même part des crins qu'elle (elles bougent avec elle). Plus de rubans de crête (sorte 4) : le rouleau est la
    masse ; tressée, toute la crinière rentre dans les boutons ;
  - *toupet* (`forelockCards`) : la ligne du milieu est posée par la pesanteur sur le front ; la largeur (8 à 9 cm en
    haut, entre les oreilles, un peu évasée dessous, resserrée en pointe à 85 %) est réglée dans le repère de la tête
    et chaque point redescendu sur la peau le long de la verticale de la tête (posées une à une, les colonnes
    glissaient de part et d'autre du chanfrein : une plaque coupée droit au lieu d'une pointe) ; masse de 9 colonnes
    bombée en haut, cartes étroites dans le même V, racines sous la peau (rentrées sous le bonnet comme avant) ;
  - *queue* (`tailCards`) : un fuseau autour d'un axe (coupes du tronçon, puis une ligne qui pend, en fontaine pour
    une queue portée haut), 18 anneaux × 20 points ; rayon : la peau du tronçon + les crins, puis plein en éventail
    sous le tronçon (`TAIL_WIDTH` 13 cm de demi-largeur : vue de dos, plus large qu'un postérieur ; `TAIL_DEPTH` 0,8 :
    de profil, encore de l'épaisseur), à moitié large en bas ; cinq lobes de plus en plus marqués vers le bas qui
    ondulent de côté, la queue entière un peu ondulée ; jamais sous sa hauteur limite (`Lh`) ; cartes en groupes de
    quatre, groupes en treillis de Fibonacci sur le tronçon (ni trou ni paquet d'un côté), bords tenus hors du corps
    et derrière les fesses (`pushCardOut` avec `keep`). Au repos elle pend d'aplomb ; de dos, son bout bouge de
    ± 2 cm (± 10 cm pour une queue portée haut qui chasse les mouches) ;
  - *texture de la masse* (`hairMassPixels`) : neuf mèches par bande, de largeurs très inégales (6 à 20 px), tons bien
    écartés d'une mèche à l'autre, à peine bombées (canal B), deux jours par mèche, pointes inégales aux deux bouts
    (bord gauche de la crinière en pointes jusqu'à u = 0,09) ; une bande sur deux retournée en travers (le motif ne se
    répète pas tel quel le long de la crête). Avant : sept mèches de même largeur, bombées et creusées toutes
    pareil — des rayures régulières, un « papier plissé » de près ; crins clairs : contraste réduit, plus encore sur
    la masse (`hHairContrast`, `hHairContrastM` : plaques grises sur une crinière claire) ;
  - *matière* : reflet décalé carte par carte (`vHairS`, tiré d'après la racine : chaque mèche a sa bande claire à sa
    hauteur), au trot et au galop crinière et queue flottent à la cadence de la foulée (onde de la racine vers la
    pointe, la masse moins que les cartes), reflet du ciel et reflet de la masse plus discrets (`hHairSky`, reflet de
    Kajiya-Kay × 0,65 sur la masse : moins de gris satiné sur les crins foncés). Les normales des cartes sont déjà
    « de volume » (les mêmes des deux côtés : l'ondulation déplace la carte d'un bloc, sans attribut de plus) ; celles
    de la masse sont tirées vers celle du volume là où les rangées se rejoignent. Couverture par l'alpha sans écrire
    l'alpha dans l'image (`keepFrameAlpha`, gfx.js, aussi pour le cheval simple) : la toile du jeu a un canal alpha,
    et au bord de chaque carte un alpha < 1 laissait passer le fond de la page en points clairs le long des mèches
    (la « pluie de points » sous la queue en basse) ;
  - *tests* (`tests/horseHair.test.js`) : cartes jamais au-dessus du rouleau ni dressées à la nuque, rouleau de
    quelques centimètres visible des deux côtés, mèches de gauche effilées sous le bord du rouleau (aucune pour une
    crinière courte), masse du toupet resserrée en pointe au milieu du chanfrein, queue pleine de dos, d'aplomb et
    épaisse de profil, toupet rentré sous le bonnet, crins hors du corps dans toutes les poses, mélange qui garde
    l'alpha, triangles bornés.
  Mesuré : voir « Coût des crins en volume » plus bas.

  Mesuré (avant : juste avant l'étape 2 ; après : crins en cartes ; mêmes graines) :
  - *triangles par cheval* (33 races, moyenne, `node` sur le GLB) : 15 098 → 11 769 en version complète (crins
    5 676 → 2 298, au plus 2 690), 6 436 → 4 798 en version réduite ; mêmes appels de dessin (5 en basse avec les
    ombres des sabots, 4 en haute) ;
  - *10 chevaux au paddock, caméra normale* (Chromium SwiftShader, 390×844 DPR 3 en basse, 1280×800 en haute) :
    triangles à l'écran 315 k → 300 k (basse), 573 k → 542 k (haute) ; appels 106 et 158, inchangés ; un
    programme de moins (une seule matière de crins) ; une texture de moins en haute (les deux cartes du GLB ne
    sont plus envoyées au processeur graphique : environ − 2,8 Mo en haute, − 1,4 Mo en basse, + 0,33 Mo pour
    la bande générée et ses niveaux réduits) ; temps de rendu seul de la même vue (médiane de 40 rendus, trois
    tours en alternance, machine très chargée : seule la comparaison vaut) 1 288 → 1 236 ms en basse, et au tour
    le moins chargé 1 444 → 1 412 ms en haute : inchangé à la précision de la mesure (le recouvrement des cartes
    alpha est compensé par les 3 400 triangles de moins) ;
  - *processeur* : la bande de crins est faite une fois par partie, en ≈ 30 ms de code froid (250 ms avant de
    sortir le tracé d'un crin dans sa propre fonction), dans sa propre tâche dès l'arrivée du modèle
    (`Game.onRealHorse`) ; les crins d'un gabarit neuf (premier cheval d'une race) se posent en ≈ 25 ms de plus
    (médiane, ≈ 35 → 59 ms pour le gabarit entier sur cette machine chargée ; en cache, rien : ≈ 1 ms).


**Coût des crins en volume** (avant : main, crins en cartes seules ; après : masse + cartes ; mêmes graines,
machine très chargée, mesures l'une après l'autre) :

- *triangles des crins par cheval* (33 races, `node` sur le GLB) : 2 597 → 3 349 en moyenne (au plus 2 942 → 3 896) ;
  version réduite 1 300 → 1 219 (la masse à un quart, une carte sur deux : moins qu'avant) ; poulain 728 → 1 368 (masse
  du toupet et de la queue ; brosse inchangée) ; mêmes maillages, donc mêmes appels de dessin. (Le prototype « volume »
  en était à 4 031 : nappe de 64 stations, queue de 24 anneaux, cartes plus nombreuses.) Pose des crins d'un gabarit
  neuf : médiane 70 → 60-76 ms selon le tour (dans le bruit) ;
- *10 chevaux au paddock, caméra normale* (Chromium SwiftShader ; basse : 390×844 DPR 3, haute : 1280×800) :
  PERF_ICI

**Allures vivantes** (plan « cheval beau », étape 6 ; `RealHorseAnim.stretchGallop`, `hairSprings`, `overlay` ;
`tests/horseGaitLife.test.js`) :

- *galop allongé* : `lockedGaits` recale aussi `gallopX`, le clip du galop dont la pince posée suit une droite
  `GALLOP_REACH` = 1,45 fois plus rapide — antérieurs posés plus loin devant, postérieurs levés plus loin
  derrière, même cadence. Au-dessus de la vitesse naturelle du galop (8,4 m/s pour un selle français de taille 1),
  le poids du galop est partagé entre le galop et le galop allongé (même instant du clip), joués à la cadence
  (v ÷ naturelle)^0,35, au plus 1,22 ; la foulée du mélange fait le reste, et au-delà du galop allongé la cadence
  reprend le relais. Monté à 14 m/s (joystick au bord) : cadence 1,67 → 1,20, part du galop allongé 0,88 (fini
  le moulinet de dessin animé accéléré). Sabots posés : centre de la sole en appui à plat < 2 cm, moyenne des
  points de la sole < 0,5 cm (pince en bascule < 4 cm) à 8,5, 11 et 14 m/s. Un poney monté va plus vite que sa
  taille (Shetland : 14,8 m/s ramenés à la taille 1) : galop allongé entier, cadence 1,45 au lieu de 1,8 ;
- *queue et crinière souples* : ressorts amortis (`springTo`, repère du cheval, pas de 1/60 s au plus) sur Tail1
  (k 70, c 10), Tail2 (k 38, c 6,5 : elle fouette après le couard) et Mane1-4 (k 60 → 48, c 11). Ils suivent la
  pose voulue (clip, port de queue, coup de queue, arc du galop) avec du retard, secoués par le rebond de l'allure
  (quand le corps retombe, les crins s'allègent et se soulèvent) et par les virages (la queue part vers
  l'extérieur) ; `springLimit` les tient hors des fesses et de l'encolure. Au galop, le bout de la queue retombe en
  arc ; la queue portée haut (arabe, saddlebred, welsh) retombe en panache depuis le couard (0,4 → 0,75 rad).
  Courbure des cartes de crins dans le shader (`hairDrag`, uniforms par cheval) : vent de la course vers
  l'arrière (queue 0,45, crinière 0,3 par mètre de mèche), pointes de la queue en retard quand elle fouette,
  toujours en travers de la mèche et jamais vers le bas ; la boîte de Tail1 et Tail2 suit (tous ces écarts sont
  dans la sphère de diamètre longueur × courbure) ;
- *tête qui hoche* au pas (encolure 0,05 → 0,09 rad, en phase avec le clip : deux fois par foulée) ; au galop,
  pompe de l'encolure calmée (0,13 → 0,09 rad, plus de coup de tête en l'air vu de 3/4) et nez en avant ;
- *respiration* : 12 par minute au repos (flanc ± 2 %, inspiration plus courte que l'expiration) ; après une
  galopade il souffle (effort qui monte en 12 s et retombe en 40 s : jusqu'à 60 par minute, ± 4 %, l'encolure suit
  le souffle) ;
- *mouches* : coups d'oreille brefs (0,3 s, toutes les 5 s environ une demi-minute sur deux : le pavillon pivote
  vers l'arrière, l'oreille ne se couche pas), coups de queue plus amples qui fouettent ;
- pose de photo inchangée et toujours la même (ressorts remis à leur place, ni souffle ni mouches).

**Proportions** (plan « cheval beau », étape 7 ; `deformer`, `src/sim/horseLook.js`, `src/sim/species.js` ;
`tests/horseProportions.test.js`, mesures dans `tests/helpers/horseProportions.js` : coupes du tronc, garrot =
haut du dessus derrière l'encolure, poitrine = garrot → dessous de la sangle) : le modèle d'origine est un cheval
de trait, simplement rétréci pour les chevaux de selle (corps long, poitrine peu profonde, membres longs, dos
ensellé sans garrot). Désormais : profondeur du tronc moins liée à sa largeur (`girth`^0,25 au lieu de ^0,6, plus
`depth` par type) ; corps raccourci autour de la selle (gabarit natif `back` 1,08) ; ligne du dessus sculptée
(`TOPLINE` : bosse étroite de 3,5 cm au garrot, creux du dos comblé de 1,8 cm devant la selle) ; sang chaud aux
membres d'un cheval de selle (1,05 → 1), poneys plus ronds aux membres courts et aux petites oreilles (`ears`),
Haflinger trapu (encolure courte et épaisse, petite tête). Garrot = 1 :

| race | poitrine (réel ≈ 0,50) | vide sous la poitrine | longueur du corps (réel 1,00-1,05) |
|---|---|---|---|
| selle français | 0,47 → 0,50 | 0,53 → 0,50 | 1,15 → 1,05 |
| pur-sang | 0,43 → 0,48 | 0,57 → 0,52 | 1,17 → 1,03 |
| arabe | 0,44 → 0,49 | 0,56 → 0,51 | 1,10 → 1,02 |
| Haflinger | 0,52 → 0,54 | 0,48 → 0,46 | 1,15 → 1,05 |
| Shetland | 0,53 → 0,58 | 0,47 → 0,42 | 1,20 → 1,11 |
| percheron | 0,55 → 0,55 | 0,45 → 0,45 | 1,16 → 1,10 |

Poulain : membres plus longs (× 1,22), tronc court et peu profond (vide sous la poitrine 0,62 du garrot, corps
0,90), grosse tête (× 1,32) au chanfrein court et front bombé (`headProfile` 'foal'), modelé de la robe presque
effacé (`hDetail` 0,25 : pas de muscles d'adulte). Selles, couvertures et cavalier se règlent sur les coupes
mesurées : ils suivent. Les coupes du tronc près de la hanche reprennent leur haut des côtés de la croupe (le
milieu, lié à l'attache de la queue, en est exclu) : la couverture d'un poney s'arrêtait sinon à la hanche.

Coût mesuré des étapes 6 et 7 (Chromium SwiftShader sur une machine chargée, 10 chevaux au paddock, caméra
normale, avant/après en alternance ×2) : triangles, appels de dessin, géométries, programmes et mémoire
inchangés (basse, téléphone 390×844 DPR 3 : ≈ 300 k triangles, 106 à 108 appels, 117 à 119 Mo ; haute,
1280×800 : 541 842 triangles, 158 appels, 121 Mo) ; images/s identiques à la précision de la mesure (basse 1,5 et
1,6 → 1,5 et 1,2 ; haute 0,8 et 0,7 → 0,7 et 0,8 : le bruit de la machine). Processeur, une mise à jour
d'animation à chaud (µs, node) : arrêt 14,6 → 18,2, pas 21 → 27, trot 38 → 35, galop 39 → 46 (ressorts, galop
allongé mêlé) : ≈ 0,05 ms de plus par image pour 10 chevaux. Une allure de plus à caler par gabarit (galop
allongé, ≈ 6 à 15 ms pendant les temps morts) ; proportions faites au chargement du gabarit (mises en cache).

**Robes et finitions de près** (plan « cheval beau », étapes 8 et 9 ; `COAT_FRAGMENT` et `coatMaterial` dans
`src/game/models/horseCoat.js`, `earCup`, `openNostrils`, `openEyelids` dans `horseReal.js` ;
`tests/horseFinish.test.js`) :

- *gris pommelé* : pommelures claires et rondes qui se touchent, séparées par un réseau de fond gris aux lignes fines
  et irrégulières (rapport F1 / F2 des distances aux deux centres de cellule les plus proches, `COAT_LOOKS.dapple` :
  fond × 0,7, centre + 12 %, cellules de 13 cm), un peu déformées ; deux tailles mêlées en qualité haute (une cellule
  sur deux redivisée) ; nettes sur le corps, la croupe et l'épaule, fondues vers le ventre et le bas des membres, en
  leur moyenne quand un pixel couvre plusieurs centimètres (pas de scintillement). D'abord des pois ronds, réguliers
  et très contrastés, isolés sur un fond × 0,55 ;
- *pie* : pour une graine donnée, les plaques sont celles d'avant l'étape 8 (même champ de bruit, même seuil) : le
  cheval d'une partie sauvegardée garde ses marques et tout son blanc — le bruit étiré en hauteur de l'étape 8 en
  retirait l'essentiel (un Shetland pie presque noir) ; seuls les bords changent, un peu déformés (`COAT_LOOKS.pinto`)
  et déchiquetés, au bord net (antialiasé par `fwidth`) ; tête foncée d'après le poids de la tête (`hHead`) ;
- *léopard et couverture* : mêmes cellules et même seuil qu'avant l'étape 8 (toutes les taches d'un cheval déjà là
  gardées à leur place), quelques-unes de plus vers l'arrière, de tailles inégales (2 à 6 cm de rayon), un peu
  allongées, cernées d'un halo marbré ; plus petites sur la tête et le bas des membres
  (`tests/horseMarks.test.js` : le bruit du shader recopié en JavaScript, 20 graines) ; bas de la couverture d'après la hauteur (et non
  plus l'orientation de la peau ni la partie du corps, constante par triangle : des dents de scie sur la cuisse),
  bord givré ;
- *noir* : rugosité 0,46 en haute, 0,48 en basse (0,36-0,40 faisait des reflets blancs durs, « latex »), reflet
  `specularIntensity` 0,6, base relevée à moitié vers un noir brun (`BLACK_FLOOR` 0x26211f), ventre sans voile gris
  (l'éclaircissement du dessous suit la luminance de la robe) ; *grain du poil* dans la rugosité de toutes les robes (traînées le long du corps, ± 22 %) : le reflet se casse
  au lieu d'un latex lisse ;
- *robes dorées* (`coatGold` : teinte de 16 à 55°, saturée, ni grise, ni blanche, ni presque noire : alezan, palomino,
  isabelle, crins lavés, bai) : reflet de bord doré, satiné (haute) = robe × 1,4 tirée vers l'or, plus marqué ;
  les parties presque noires (bas des membres d'un bai, `hDarkV`) gardent un reflet neutre ; terme de bord 30 % plus
  fort (le reflet doré se voit aussi sur téléphone en basse) ; ton plus chaud et pommelures de santé discrètes (fond
  × 0,84 au plus), marqués sur le palomino (robe dorée claire, `hGoldDap`), moins sur l'isabelle, les crins lavés et
  l'alezan, pas sur le bai ; palomino un peu moins effacé (modelé 0,45) ;
- *isabelle* : raie de mulet nette de 3 à 5 cm, zébrures plus marquées, tête plus foncée ; *rouan* : tête et bas des
  membres de la couleur de base, plus foncés ;
- *peau des gris et des appaloosas* : marbrures petites et serrées, rose foncé et gris (plus de grandes plaques
  blanches et roses, lisibles comme une maladie de peau de près), au bord des naseaux, aux lèvres et en un fin
  cercle autour de l'œil ;
- *Akhal-Teké* : base réchauffée vers l'or orangé (`SHEEN_WARM`) ; lumière d'ambiance de la robe (`AMBIENT_FIX`) :
  le reflet de l'herbe garde sa force mais perd l'excès de vert (ramené au rouge ou au bleu, luminance gardée), sans
  toucher au ciel — teinte du haut du flanc au pré, téléphone basse, 49,9° → 45,2° (palomino), 46,4° → 42,1°
  (isabelle), 49,6° → 44,8° en haute (olive avant) ;
- *jonction tête-encolure* : tout ce qui ne vaut que pour le corps (réseau des pommelures, ventre éclairci, robes
  dorées, raie de mulet, rouan) suit un poids du corps continu (`bodyS`, tiré de `hHead`) et non le numéro de partie,
  constant par triangle, qui découpait des plaques grises en dents de scie derrière l'œil, sous l'oreille et le long
  de la ganache des chevaux gris (avec les coutures de `dilate.mjs`, plus de marche visible de trois quarts) ;
  *sabots rayés* de l'appaloosa (bandes verticales autour du centre du sabot) ;
- *œil* : globe × 1,12 (`EYE_SCALE`) autour de son centre, pelage autour écarté d'autant au bord des paupières, de moins
  en moins jusqu'à 2,4 rayons (rien n'entre dans le globe, aucune paupière retournée) ; bord des paupières foncé, plus
  épais au-dessus (paupière et cils) ; reflet du soleil deux fois plus petit (fini le gros point blanc de dessin animé) ;
- *naseau ouvert* : la fente du modèle (repérée sur la photo d'origine : x ± 0,072, y 0,112, z 0,882 en longueurs de
  tête, replacée sur le profil de chaque race) creusée de 9 mm au centre et peinte en virgule sombre (le modelé adouci
  à l'étape 4 l'avait effacée) ; bout du nez plus foncé et plus lisse (rugosité × 0,62) ;
- *oreilles creusées* : la feuille pliée en gouttière, milieu de la face avant reculé de 8 mm (× la taille de
  l'oreille), seulement là où l'oreille est libre (la peau de sa base, à demi liée à la tête, ne bouge pas) ;
  intérieur plus foncé que la robe, poils clairs en mèches (plus nombreux vers les bords et en bas), mat ;
- *liste et marques* : la largeur ondule le long du chanfrein, pas pareil des deux côtés, avec une dentelure fine ;
- *sabots* : couronne qui descend de la pince vers les talons (0,55 de la hauteur aux talons : les glomes ne sont plus
  peints en corne, fini les « ergots » gris derrière le paturon) ; corne claire propre (modelé 0,3 au lieu de 0,6, qui
  la salissait de gris-vert), stries verticales plus marquées, corne plus lisse (rugosité × 0,8).

Aucun triangle, appel de dessin, texture ni programme de plus (les cils en cartes ont été essayés puis retirés : sur
un globe de 4 cm, au bord d'une paupière de quelques sommets, ils se lisaient comme des taches). Les motifs coûteux
(pommelé, pie, taches, peau marbrée, corne rayée) ne sont calculés que pour les robes qui les ont (branche sur une
uniform, la même pour tout le dessin). Pas fait : sabots à 16 côtés et 3 rangées, pointe du jarret, tendons du canon
et relief du genou — le GLB n'a que 8 sommets par tour de membre (sabot octogonal à une rangée, jarret de 8 sommets
tous les 4 cm) : à sculpter et retopologiser dans Blender (`lyndon_prep.py` ou `prep2.py`), puis toute la chaîne
(`anim2.py`, `gait2.py`, `normfix.mjs`, `pack.mjs`, `lod.mjs`) et revérifier les appuis calés, les couvertures et le
cavalier.

  Mesuré (téléphone 390×844 DPR 3 en basse, 1280×800 en haute, 10 chevaux au paddock, caméra normale du jeu, avant /
  après en alternance ×2, Chromium SwiftShader sur une machine très chargée — charge 7 à 9 sur 4 cœurs : seule la
  comparaison vaut) : triangles (299 720 en basse, 541 842 en haute), appels de dessin (106 et 158), programmes (26 et
  43) et textures (30 et 46) identiques ; mémoire 117 → 118 Mo en basse, 121-122 → 122-131 Mo en haute ; temps d'image
  996 et 1 549 → 1 363 et 1 517 ms en basse (images/s 1,0 et 0,6 → 0,7 et 0,7), 2 664 et 2 611 → 2 693 et 2 467 ms en
  haute (0,4 → 0,4) : dans le bruit de la machine (la même vue sans cheval varie de 10 % d'un tour à l'autre). Par
  cheval (node, 10 races) : mêmes géométries, mêmes triangles (11 368 pour un selle français, 3 103 pour le pelage
  réduit). Ajouté au pixel : un bruit pour le grain du poil (toutes les robes), quelques opérations pour l'œil, le
  naseau et l'oreille ; le bruit cellulaire des pommelures de santé seulement sur les robes dorées claires.

Ce qu'il coûte, et comment on le garde bas :

- **élimination hors du champ** : chaque maillage du cheval (`HorseMesh`) a une boîte englobante refaite sur
  la pose à chaque image (une boîte par os, mesurée sur la géométrie de la race, emmenée par la matrice de
  peau de son os : ≈ 3 µs), valable pour la caméra, les ombres, le lancer de rayon et le cadrage des photos.
  Elle contient toujours le maillage déformé (galop, broutage, saut, embonpoint, cartes de crins, couverture
  liée au squelette : `tests/horseRealPerf.test.js`) sans le dépasser de plus de quelques dizaines de cm ;
- **version réduite** (index de `lod.mjs`) au-delà de 15 m en qualité basse et de 22 m en qualité haute
  (distance divisée par la taille du cheval, hystérésis de 10 %) ; en qualité basse, crins sans second reflet ni
  relief du crin ;
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
