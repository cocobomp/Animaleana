#!/bin/sh
# Refait public/models/cow.glb (vache de Lyndon Daniels, CC0) et public/models/bull.glb (taureau Rocketbox, MIT) à
# partir des sources (voir LISEZMOI.md).
# Variables :
#   BLENDER : exécutable Blender 4.2 ;
#   DL : dossier des sources de la vache (oga_lyndon_cow/cowTM08New00RTime02.blend et oga_lyndon_cow/zip/cow/*.png,
#        tirés de cow.zip, « Realtime Rancher's 3D Model Pack » sur OpenGameArt) ;
#   SRC : dossier Assets/Animals du dépôt microsoft/Microsoft-Rocketbox (Bull_Brown_01/Export/Bull_Brown_01.fbx,
#         Bull_Brown_01/Textures/*.tga) ;
#   WORK : dossier de travail (défaut : tools/vache/work) ;
#   GT : dossier où @gltf-transform/core, extensions, functions, meshoptimizer et sharp sont installés (node_modules/).
# STEP=blender|measure|tex|pack pour ne refaire qu'une étape ; ONLY=cow|bull pour un seul des deux modèles.
# Les outils de membres et de poids du taureau sont ceux du mouton et de la chèvre (tools/mouton, tools/chevre).
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
: "${BLENDER:?chemin de Blender 4.2}"
: "${WORK:=$HERE/work}"
: "${GT:?dossier avec node_modules de @gltf-transform}"
mkdir -p "$WORK"
OUT="$HERE/../../public/models"
B="$BLENDER -b --factory-startup --disable-autoexec"
cow() { [ -z "$ONLY" ] || [ "$ONLY" = cow ]; }
bull() { [ -z "$ONLY" ] || [ "$ONLY" = bull ]; }
step() { [ -z "$STEP" ] || [ "$STEP" = "$1" ]; }

# 1. Blender : squelette créé (la vache n'a que les groupes de sommets d'un ancien squelette ; le taureau : os Biped
#    renommés), os des cornes, de la mamelle (scrotum), des oreilles et de la queue, poids, 16 clips (allures, brouter,
#    se coucher à genoux devant, se relever l'arrière d'abord, couchée, ruminer, dormir, meugler, traite, queue, tétée…),
#    sabots jamais sous le sol, aucun os étiré.
if step blender; then
  if cow; then
    : "${DL:?dossier des sources de la vache (DL)}"
    export DL
    (cd "$WORK" && $B --python "$HERE/make_cow.py" -- lyndon "$WORK/lyndon.glb" "$WORK/lyndon.json")
  fi
  if bull; then
    : "${SRC:?dossier Assets/Animals de Microsoft-Rocketbox (SRC)}"
    export SRC
    export TEX="$WORK/tex"
    $B --python "$HERE/taureau/prep_tex.py" -- "$SRC/Bull_Brown_01/Textures" "$TEX" bull_brown
    (cd "$WORK" && $B --python "$HERE/taureau/make_bull.py" -- rb_taureau "$WORK/rb_taureau.glb" "$WORK/rb_taureau.json")
  fi
fi
# 2. Mesures sur le maillage déformé, clip par clip (arêtes et os étirés, sabots sous le sol, glissement).
if step measure; then
  cow && $B --python "$HERE/measure_cow.py" -- "$WORK/lyndon.glb" "$WORK/lyndon_measure.json" tous "$WORK/lyndon.json"
  bull && $B "$WORK/rb_taureau.blend" --python "$HERE/taureau/measure.py" -- "$WORK/rb_taureau_mesures.json" tous "$WORK/rb_taureau.json"
fi
cp "$HERE/tex.mjs" "$HERE/pack.mjs" "$HERE/lod.mjs" "$GT/"
# 3. Robe propre : carte de grain (chaque texel rapporté à la moyenne de sa classe de poil : plus de taches ni d'ombres
#    de la photo) et masque (taches, peau rose, bouche et cils gardés) ; yeux du taureau notés (peints sur la texture).
if step tex; then
  cow && node "$GT/tex.mjs" "$WORK/lyndon.glb" "$WORK/cow_grain.png" "$WORK/cow_mask.png" --kind cow
  bull && node "$GT/tex.mjs" "$WORK/rb_taureau.glb" "$WORK/bull_grain.png" "$WORK/bull_mask.png" --kind bull --eyeuv 0.113,0.427,0.113,0.572
fi
# 4. Paquet : canaux inutiles retirés, textures WebP, meshopt ; puis version réduite (LOD) dans le même fichier.
if step pack; then
  if cow; then
    node "$GT/pack.mjs" "$WORK/lyndon.glb" "$WORK/cow_packed.glb" --kind cow --report "$WORK/lyndon.json" --measures "$WORK/lyndon_measure.json" \
      --color "$WORK/cow_grain.png" --mask "$WORK/cow_mask.png" --texinfo "$WORK/cow_grain.json"
    node "$GT/lod.mjs" "$WORK/cow_packed.glb" "$OUT/cow.glb" 0.3
  fi
  if bull; then
    node "$GT/pack.mjs" "$WORK/rb_taureau.glb" "$WORK/bull_packed.glb" --kind bull --report "$WORK/rb_taureau.json" --measures "$WORK/rb_taureau_mesures.json" \
      --color "$WORK/bull_grain.png" --mask "$WORK/bull_mask.png" --texinfo "$WORK/bull_grain.json"
    node "$GT/lod.mjs" "$WORK/bull_packed.glb" "$OUT/bull.glb" 0.35
  fi
  ls -l "$OUT/cow.glb" "$OUT/bull.glb"
fi
