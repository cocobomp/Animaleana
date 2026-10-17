#!/bin/sh
# Refait public/models/horse_real.glb à partir des sources (voir LISEZMOI.md).
# Variables : BLENDER (exécutable Blender 4.2), SRC (dossier des sources téléchargées), WORK (dossier de travail),
# GT (dossier où @gltf-transform, meshoptimizer et sharp sont installés : node_modules/).
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
: "${BLENDER:?chemin de Blender 4.2}"
: "${SRC:?dossier des sources (riggedHorse.blend et horse/)}"
: "${WORK:=$HERE/work}"
: "${GT:?dossier avec node_modules de @gltf-transform}"
mkdir -p "$WORK/tex"
B="$BLENDER -b --factory-startup --disable-autoexec --python"
# 1. Préparation : matières, crins et yeux liés au squelette, garrot 1,6 m, sabots au sol.
$B "$HERE/lyndon_prep.py" -- "$SRC/riggedHorse.blend" "$SRC/horse" "$WORK/lyndon_prep.blend"
# 2. Squelette du jeu (paturons, côtes, crinière), poids, textures de modelé.
$B "$HERE/prep2.py" -- "$WORK/lyndon_prep.blend" "$SRC/horse" "$WORK/prep2.blend" "$WORK/tex"
# 3. Allures, vérification des sabots, export brut.
$B "$HERE/anim2.py" -- "$WORK/prep2.blend" "$WORK/horse_raw.glb" "$WORK/rapport.json"
# 4. Compression (meshopt, WebP).
cp "$HERE/pack.mjs" "$GT/pack.mjs"
node "$GT/pack.mjs" "$WORK/horse_raw.glb" "$HERE/../../public/models/horse_real.glb"
