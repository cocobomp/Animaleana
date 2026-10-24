#!/bin/sh
# Refait public/models/horse_real.glb à partir des sources (voir LISEZMOI.md), étapes 1 à 7.
# Variables : BLENDER (exécutable Blender 4.2), SRC (dossier des sources téléchargées), WORK (dossier de travail),
# GT (dossier où @gltf-transform, meshoptimizer et sharp sont installés : node_modules/ ; par exemple
# « npx @gltf-transform/cli » en laisse un dans le cache de npm), DEBUT (étape où commencer, 1 par défaut : les
# fichiers des étapes d'avant doivent être dans WORK ; à partir de 4, ni Blender ni les sources ne sont demandés).
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
: "${DEBUT:=1}"
: "${WORK:=$HERE/work}"
: "${GT:?dossier avec node_modules de @gltf-transform}"
if [ "$DEBUT" -le 3 ]; then
  : "${BLENDER:?chemin de Blender 4.2}"
  : "${SRC:?dossier des sources (riggedHorse.blend et horse/)}"
fi
mkdir -p "$WORK/tex"
B="$BLENDER -b --factory-startup --disable-autoexec --python"
if [ "$DEBUT" -le 1 ]; then
  # 1. Préparation : matières, crins et yeux liés au squelette, garrot 1,6 m, sabots au sol.
  $B "$HERE/lyndon_prep.py" -- "$SRC/riggedHorse.blend" "$SRC/horse" "$WORK/lyndon_prep.blend"
fi
if [ "$DEBUT" -le 2 ]; then
  # 2. Squelette du jeu (paturons, côtes, crinière), poids, textures de modelé.
  $B "$HERE/prep2.py" -- "$WORK/lyndon_prep.blend" "$SRC/horse" "$WORK/prep2.blend" "$WORK/tex"
fi
if [ "$DEBUT" -le 3 ]; then
  # 3. Allures, vérification des sabots, export brut.
  $B "$HERE/anim2.py" -- "$WORK/prep2.blend" "$WORK/horse_raw.glb" "$WORK/rapport.json"
  # 3 bis. Carte de relief de la robe : taches isolées de la texture source bouchées (fente de la croupe…).
  cp "$HERE/normfix.mjs" "$GT/normfix.mjs"
  node "$GT/normfix.mjs" "$WORK/horse_raw.glb" "$WORK/horse_raw_fix.glb"
fi
if [ "$DEBUT" -le 4 ]; then
  # 4. Compression (meshopt, WebP).
  cp "$HERE/pack.mjs" "$GT/pack.mjs"
  node "$GT/pack.mjs" "$WORK/horse_raw_fix.glb" "$WORK/horse_packed.glb"
fi
if [ "$DEBUT" -le 5 ]; then
  # 5. Version allégée : index simplifiés (LOD) et carte des crins en 512².
  cp "$HERE/lod.mjs" "$GT/lod.mjs"
  node "$GT/lod.mjs" "$WORK/horse_packed.glb" "$WORK/horse_lod.glb"
fi
if [ "$DEBUT" -le 6 ]; then
  # 6. Coutures de la robe : îlots d'UV dilatés, gris raccordés d'un îlot à l'autre, côtes adoucies (une seule fois :
  # jamais sur sa propre sortie).
  cp "$HERE/dilate.mjs" "$GT/dilate.mjs"
  node "$GT/dilate.mjs" "$WORK/horse_lod.glb" "$WORK/horse_dilate.glb"
fi
# 7. Bord des îlots de la carte de relief refait depuis l'intérieur (plus de tirets clairs sous la gorge).
cp "$HERE/bords.mjs" "$GT/bords.mjs"
node "$GT/bords.mjs" "$WORK/horse_dilate.glb" "$HERE/../../public/models/horse_real.glb"
