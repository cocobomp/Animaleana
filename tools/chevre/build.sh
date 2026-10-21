#!/bin/sh
# Refait public/models/goat.glb à partir des sources (voir LISEZMOI.md).
# Variables : BLENDER (exécutable Blender 4.2), SRC (dossier Assets/Animals du dépôt microsoft/Microsoft-Rocketbox :
# Goat_White_01/Export/Goat_White_01.fbx, Goat_White_01/Textures/*.tga, Goat_Brown_01/Export/Goat_Brown_01.fbx), WORK
# (dossier de travail), GT (dossier où @gltf-transform/core, extensions, functions, meshoptimizer et sharp sont
# installés : node_modules/). STEP=tex|blender|pack pour ne refaire qu'une étape.
# Le moteur des membres et les outils Blender sont ceux du mouton (tools/mouton/sheep_gait.py, sheepkit.py,
# sheep_models.py : fix_weights).
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
: "${BLENDER:?chemin de Blender 4.2}"
: "${SRC:?dossier Assets/Animals de Microsoft-Rocketbox}"
: "${WORK:=$HERE/work}"
: "${GT:?dossier avec node_modules de @gltf-transform}"
export SRC
export TEX="$WORK/tex"
mkdir -p "$WORK"
OUT="$HERE/../../public/models"
B="$BLENDER -b --factory-startup --disable-autoexec"
# 1. Textures : TGA → PNG, carte de normales passée en convention OpenGL (vert inversé).
if [ -z "$STEP" ] || [ "$STEP" = tex ]; then
  $B --python "$HERE/prep_tex.py" -- "$SRC/Goat_White_01/Textures" "$TEX"
fi
# 2. Blender : os renommés, pièces (cornes, barbe, mamelle), cornes arquées de la brune (cible de forme), poids de
#    l'aisselle, du bréchet et des cuisses, 20 clips, sabots au sol, couchée posée ; puis mesures sur le maillage déformé
#    (arêtes et os étirés, sabots, glissement).
if [ -z "$STEP" ] || [ "$STEP" = blender ]; then
  $B --python "$HERE/make_goat.py" -- "$WORK/goat_raw.glb" "$WORK/goat_rapport.json"
  $B "$WORK/goat_raw.blend" --python "$HERE/measure.py" -- "$WORK/goat_mesures.json" tous "$WORK/goat_rapport.json"
fi
# 3. Compression (canaux inutiles, WebP, meshopt), puis version réduite (LOD) dans le même fichier.
if [ -z "$STEP" ] || [ "$STEP" = pack ]; then
  cp "$HERE/pack.mjs" "$HERE/lod.mjs" "$GT/"
  node "$GT/pack.mjs" "$WORK/goat_raw.glb" "$WORK/goat_packed.glb" --report "$WORK/goat_rapport.json" --measures "$WORK/goat_mesures.json" --tex 1024 --quality 84
  node "$GT/lod.mjs" "$WORK/goat_packed.glb" "$OUT/goat.glb" 0.35
  ls -l "$OUT/goat.glb"
fi
