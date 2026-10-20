#!/bin/sh
# Refait public/models/rabbit.glb (lapin de Dakota.Hinkle : toutes les races sauf le bélier) et rabbit_lop.glb (bélier
# de FourthGreen) à partir des sources (voir LISEZMOI.md).
# Variables : BLENDER (exécutable Blender 4.2), SRC (dossier des sources : dakota_rabbit.glb, fourthgreen_rabbit.glb),
# WORK (dossier de travail), GT (dossier où @gltf-transform, meshoptimizer et sharp sont installés : node_modules/).
# Arguments facultatifs : dakota fourthgreen (les deux par défaut) ; STEP=blender ou STEP=pack pour une seule étape.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
: "${BLENDER:?chemin de Blender 4.2}"
: "${SRC:?dossier des sources (dakota_rabbit.glb, fourthgreen_rabbit.glb)}"
: "${WORK:=$HERE/work}"
: "${GT:?dossier avec node_modules de @gltf-transform}"
export SRC
mkdir -p "$WORK"
OUT="$HERE/../../public/models"
cp "$HERE/pack.mjs" "$HERE/lod.mjs" "$GT/"
for id in ${*:-dakota fourthgreen}; do
  case $id in dakota) name=rabbit;; fourthgreen) name=rabbit_lop;; *) echo "modèle inconnu : $id"; exit 1;; esac
  if [ "${STEP:-all}" != pack ]; then
    # 1. Blender : noms d'os, échelle, allures et poses générées (pattes jamais étirées, appuis sans glissement), corps
    #    relevé image par image (jamais sous le sol), mesures (sol, glissement, os) dans le rapport.
    "$BLENDER" -b --factory-startup --disable-autoexec --python "$HERE/make_rabbit.py" -- "$id" "$WORK/${name}_raw.glb" "$WORK/$name.json" > "$WORK/make_$id.log" 2>&1
    grep -E "Traceback|Error" -A 8 "$WORK/make_$id.log" | head -20 || true
  fi
  if [ "${STEP:-all}" != blender ]; then
    # 2. Compression (canaux inutiles, WebP, meshopt), puis version réduite (LOD) dans le même fichier.
    node "$GT/pack.mjs" "$WORK/${name}_raw.glb" "$WORK/${name}_packed.glb" --report "$WORK/$name.json" --tex 1024 --quality 84
    node "$GT/lod.mjs" "$WORK/${name}_packed.glb" "$OUT/$name.glb" 0.35
  fi
done
ls -l "$OUT"/rabbit*.glb 2>/dev/null || true
