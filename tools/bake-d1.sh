#!/bin/bash
# PYRA Phase D1 — full bake pipeline: exports -> pyramid bake -> terrain bake
# (with pyramid shadow caster) -> KTX2 encode. Run via the heavy lane.
set -euo pipefail
cd /home/clawd/.openclaw/workspace-coder/projects/pyromdx
TOKTX=/home/clawd/opt/ktx/KTX-Software-4.4.2-Linux-x86_64/bin/toktx

echo "== exports =="
node tools/export-pyramid-glb.mjs
node tools/export-terrain-glb.mjs
ls -la /tmp/pyra-pyramid.glb /tmp/pyra-terrain.glb

echo "== pyramid bake =="
blender -b -P tools/blender-bake.py
echo "== terrain bake =="
blender -b -P tools/blender-bake-terrain.py

echo "== encode =="
"$TOKTX" --t2 --encode etc1s --qlevel 192 --genmipmap --assign_oetf srgb \
  assets/tex-ktx2/pyra_lightmap_4k.ktx2 /tmp/pyra-bake.png
"$TOKTX" --t2 --encode etc1s --qlevel 192 --genmipmap --assign_oetf srgb \
  assets/tex-ktx2/pyra_terrain_4k.ktx2 /tmp/pyra-terrain-bake.png
ls -la assets/tex-ktx2/pyra_lightmap_4k.ktx2 assets/tex-ktx2/pyra_terrain_4k.ktx2

echo "D1_BAKE_PIPELINE_DONE"
