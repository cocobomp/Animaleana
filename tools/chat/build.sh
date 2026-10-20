#!/bin/sh
# Refait public/models/cat_adult.glb et public/models/cat_kitten.glb à partir des sources (voir LISEZMOI.md).
# Variables : BLENDER (exécutable Blender 4.2), SRC (dossier des sources : claire_cat.glb, faino_kitten.glb),
# WORK (dossier de travail), GT (dossier où @gltf-transform, meshoptimizer et sharp sont installés : node_modules/).
# Arguments facultatifs : adult kitten (les deux par défaut).
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
: "${BLENDER:?chemin de Blender 4.2}"
: "${SRC:?dossier des sources (claire_cat.glb, faino_kitten.glb)}"
: "${WORK:=$HERE/work}"
: "${GT:?dossier avec node_modules de @gltf-transform}"
export SRC
mkdir -p "$WORK"
OUT="$HERE/../../public/models"
cp "$HERE/pack.mjs" "$HERE/lod.mjs" "$GT/"
for id in ${*:-adult kitten}; do
  # 1. Blender : maillage figé, squelette automatique, poids (cuisse fondue dans le bassin pour le chaton), allures,
  #    poses et gestes générés, corps relevé image par image (jamais sous le sol), rapport des mesures.
  "$BLENDER" -b --factory-startup --disable-autoexec --python "$HERE/make_cat.py" -- "$id" "$WORK/cat_${id}_raw.glb" "$WORK/cat_${id}.json" > "$WORK/make_$id.log" 2>&1
  grep -E "Traceback|Error" -A 8 "$WORK/make_$id.log" | head -20 || true
  # 2. Compression (canaux inutiles, WebP, meshopt), puis version réduite (LOD).
  node "$GT/pack.mjs" "$WORK/cat_${id}_raw.glb" "$WORK/cat_${id}_packed.glb" --report "$WORK/cat_${id}.json" --tex 1024 --quality 84
  node "$GT/lod.mjs" "$WORK/cat_${id}_packed.glb" "$OUT/cat_$id.glb" 0.3
done
ls -l "$OUT"/cat_*.glb
