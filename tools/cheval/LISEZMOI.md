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

**Appuis calés** (`lockedGaits`, une fois par gabarit, au premier pas d'un cheval de ce gabarit, ≈ 25 ms) :
chaque allure est rééchantillonnée à 100 images/s sur les membres de la race ; pendant l'appui (sole à
moins de 1 cm du sol, sabot qui flotte un peu au bout de l'appui compris), la pince suit une droite à la vitesse
de l'allure (moindres carrés, même pente pour les quatre membres) et la sole est au sol ; un peu avant la pose et
après le lever, le sabot est tenu à sa place d'autant plus qu'il est près du sol (il descend sur sa place au
lieu d'arriver en avançant encore avec le corps). Cinématique inverse amortie (`solveLeg` : coude ou grasset,
genou ou jarret, un peu l'épaule ou la hanche), sabot gardant l'orientation du clip. Mesuré sur les 33 races à
60 im/s (glissement de la pince posée par appui) : galop 2,06 → 0,13 cm en moyenne (pire appui 5,8 → 0,8 cm),
petit galop 1,38 → 0,10, trot 0,66 → 0,09, pas 0,84 → 0,22 cm ; aucune sole sous le sol.

Poses imposées par les activités (`realLegPose`) : saut d'obstacle selon sa phase (`jumpLegs` : appel,
bascule, réception, fondus avec l'allure ; le cheval et le cavalier basculent autour du centre du cheval,
`Activities.pitchAbout`), « donner le sabot » fondu depuis l'allure, sole jamais sous le sol (`legLow`).
Couverture : les trois dernières rangées de la nappe tombent droit (`gearModels.shell`, `drape`) au lieu de se
refermer sur la pointe des fesses (la peau de la hanche passait par-dessus le bord).
`tests/horseReal.test.js` vérifie le fichier (os, clips, compression) et que chaque race garde ses sabots au sol.

Ce qu'il coûte, et comment on le garde bas :

- **élimination hors du champ** : chaque maillage du cheval (`HorseMesh`) a une boîte englobante refaite sur
  la pose à chaque image (une boîte par os, mesurée sur la géométrie de la race, emmenée par la matrice de
  peau de son os : ≈ 3 µs), valable pour la caméra, les ombres, le lancer de rayon et le cadrage des photos.
  Elle contient toujours le maillage déformé (galop, broutage, saut, embonpoint, cartes de crins, couverture
  liée au squelette : `tests/horseRealPerf.test.js`) sans le dépasser de plus de quelques dizaines de cm ;
- **version réduite** (index de `lod.mjs`) au-delà de 7 m en qualité basse et de 22 m en qualité haute
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
