#!/bin/sh
# Refait public/models/sheep.glb à partir des sources (voir LISEZMOI.md).
# Variables : BLENDER (exécutable Blender 4.2), SRC (dossier Assets/Animals/Sheep_White_01 du dépôt
# microsoft/Microsoft-Rocketbox : Export/Sheep_White_01.fbx, Textures/*.tga), WORK (dossier de travail),
# GT (dossier où @gltf-transform/core, extensions, functions, meshoptimizer et sharp sont installés : node_modules/).
# STEP=tex|blender|pack pour ne refaire qu'une étape.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
: "${BLENDER:?chemin de Blender 4.2}"
: "${SRC:?dossier Sheep_White_01 de Microsoft-Rocketbox}"
: "${WORK:=$HERE/work}"
: "${GT:?dossier avec node_modules de @gltf-transform}"
export SRC
export TEX="$WORK/tex"
mkdir -p "$WORK"
OUT="$HERE/../../public/models"
B="$BLENDER -b --factory-startup --disable-autoexec"
# 1. Textures : TGA → PNG, carte de normales passée en convention OpenGL (vert inversé).
if [ -z "$STEP" ] || [ "$STEP" = tex ]; then
  $B --python "$HERE/prep_tex.py" -- "$SRC/Textures" "$TEX"
fi
# 2. Blender : os renommés, poids de l'aisselle et de la cuisse, laine (masques, forme tondue), cornes, 14 clips,
#    sabots au sol, vérifications ; puis mesures sur le maillage déformé (arêtes et os étirés, sabots, glissement).
if [ -z "$STEP" ] || [ "$STEP" = blender ]; then
  $B --python "$HERE/make_sheep.py" -- rocketbox_blanc "$WORK/sheep_raw.glb" "$WORK/sheep_rapport.json"
  $B "$WORK/sheep_raw.blend" --python "$HERE/measure.py" -- "$WORK/sheep_mesures.json" tous "$WORK/sheep_rapport.json"
fi
# 3. Compression (canaux inutiles, WebP, meshopt), puis version réduite (LOD) dans le même fichier.
if [ -z "$STEP" ] || [ "$STEP" = pack ]; then
  cp "$HERE/pack.mjs" "$HERE/lod.mjs" "$GT/"
  node "$GT/pack.mjs" "$WORK/sheep_raw.glb" "$WORK/sheep_packed.glb" --report "$WORK/sheep_rapport.json" --measures "$WORK/sheep_mesures.json" --tex 1024 --quality 84
  node "$GT/lod.mjs" "$WORK/sheep_packed.glb" "$OUT/sheep.glb" 0.35
  ls -l "$OUT/sheep.glb"
fi
