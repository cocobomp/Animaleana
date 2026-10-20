#!/bin/sh
# Refait public/models/dog_shiba.glb et public/models/dog_jack.glb à partir des sources (voir LISEZMOI.md).
# Variables : BLENDER (exécutable Blender 4.2), SRC (dossier des sources : quander_shiba.glb, faino_jack.glb),
# WORK (dossier de travail), GT (dossier où @gltf-transform, meshoptimizer et sharp sont installés : node_modules/).
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
: "${BLENDER:?chemin de Blender 4.2}"
: "${SRC:?dossier des sources (quander_shiba.glb, faino_jack.glb)}"
: "${WORK:=$HERE/work}"
: "${GT:?dossier avec node_modules de @gltf-transform}"
export SRC
mkdir -p "$WORK"
B="$BLENDER -b --factory-startup --disable-autoexec --python $HERE/make_dog.py --"
OUT="$HERE/../../public/models"
# 1. Shiba : os réparés et fusionnés, clips d'origine gardés, allures et poses générées ; ses poses faites main sont
#    écrites pour le jack.
$B shiba "$WORK/dog_shiba_raw.glb" "$WORK/shiba_rapport.json" --dump-retarget "$WORK/shiba_poses.json"
# 2. Jack : corps complet soudé, squelette automatique (oreilles comprises), repos et roulade du shiba repris,
#    le reste généré.
$B jack "$WORK/dog_jack_raw.glb" "$WORK/jack_rapport.json" --retarget "$WORK/shiba_poses.json"
# 3. Compression (canaux inutiles, WebP, meshopt), puis version réduite (LOD).
cp "$HERE/pack.mjs" "$HERE/lod.mjs" "$GT/"
node "$GT/pack.mjs" "$WORK/dog_shiba_raw.glb" "$WORK/dog_shiba_packed.glb" --report "$WORK/shiba_rapport.json" --simplify 0.55 --tex 1024 --quality 84
node "$GT/lod.mjs" "$WORK/dog_shiba_packed.glb" "$OUT/dog_shiba.glb" 0.3
node "$GT/pack.mjs" "$WORK/dog_jack_raw.glb" "$WORK/dog_jack_packed.glb" --report "$WORK/jack_rapport.json" --tex 1024 --quality 84
node "$GT/lod.mjs" "$WORK/dog_jack_packed.glb" "$OUT/dog_jack.glb" 0.3
ls -l "$OUT/dog_shiba.glb" "$OUT/dog_jack.glb"
