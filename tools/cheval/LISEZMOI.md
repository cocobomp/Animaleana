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
     glissent pas ; le jeu joue chaque clip à vitesse réelle ÷ vitesse naturelle (pour une race, mesurée au
     chargement sur ses propres sabots : ses membres n'ont pas la longueur du modèle) ;
   - en fin d'appui le sabot bascule sur la pince, en soutien il se replie ; les points de la sole ne passent
     jamais sous le sol (la cible est relevée), vérifié ensuite sur le maillage déformé (rapport JSON) ;
   - `idle`, `rest` (repos d'un postérieur, sabot sur la pince), `eat` (bout du nez à 3 cm de l'herbe, un
     antérieur un peu en avant).
4. **`pack.mjs`** (glTF-Transform 4, meshoptimizer, sharp) : animations ré-échantillonnées, textures en WebP
   (modelé 1024, relief 1024 / 512), maillage quantifié et compressé (meshopt) : ≈ 970 Ko.

Pour ne changer qu'une texture sans refaire les allures : relancer `lyndon_prep.py` et `prep2.py`, puis
**`retex.mjs`** remplace l'image dans le GLB brut d'origine (`node retex.mjs horse_raw.glb horse_body_detail
work/tex/horse_body_detail.png horse_raw_retex.glb`) et `pack.mjs` le compresse (géométrie et allures
identiques).

## Dans le jeu

`src/game/models/horseReal.js` construit le cheval derrière l'interface du cheval sculpté
(`horseModel.js`, gardé comme modèle de repli si le GLB ne charge pas) : proportions de chaque race par
déformation du maillage et du squelette (le gabarit natif est un cheval de trait : `NATIVE_BUILD`),
brosse du Fjord et des poulains, fanons, robe, mixeur d'allures, équipement posé sur des coupes mesurées.
`tests/horseReal.test.js` vérifie le fichier (os, clips, compression) et que chaque race garde ses sabots au sol.
