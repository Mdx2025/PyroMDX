# PYRA — Visual Quality Plan (igloo.inc-grade finish)

Goal: close the gap between the current real-time scene and the approved
reference render (rounded carved blocks, warm filmic desert night, soft baked
lighting). Benchmark: https://www.igloo.inc (Awwwards SOTY 2024).

## What igloo.inc actually does (verified 2026-07-18)

Recon: headless load of the live site, 107 network requests captured, main 3D
bundle (`App3D-*.js`, 1.4 MB) analyzed.

- **Authored geometry, not procedural.** 22 Draco meshes (`.drc`) modeled in a
  DCC tool. Bevels and block irregularity are *in the mesh* — zero references
  to `RoundedBox` in code.
- **Offline-baked lighting.** 49 KTX2 textures (12.7 MB); color maps ship with
  light + AO baked (e.g. `ground_sansigloo_color.ktx2` = ground without the
  igloo's shadow, so the shadow can be faded).
- **IBL.** `cubes_env.exr` + PMREMGenerator → `scene.environment`.
- **Filmic grade.** `ACESFilmicToneMapping` + LUT color grading
  (`uLUTIntensity`) + dither (anti-banding).
- **Atmosphere.** `FogExp2` (density 25e-5) + utility noise KTX2s (perlin,
  blue-noise, wind, clouds, caustics) + bloom + DOF/bokeh + subtle chromatic
  aberration.

Takeaway: the "top" finish comes from **authored geometry with bevels + high
quality offline bakes + filmic grade**, not from clever runtime shaders.

## Gap analysis (current scene vs reference render)

| Aspect | Current | Reference |
|---|---|---|
| Blocks | sharp boxes, deep erosion gaps, strong shrink jitter | pillow-rounded bevels (~10% of block), tight joints, subtle chips |
| Lighting | flat-ish bake, NoToneMapping by default | warm prism key, soft contact AO in joints, filmic response |
| Environment | no IBL | warm sky fill / specular from environment |
| Atmosphere | FogExp2 only | horizon haze band, grain, vignette, sepia grade |
| Terrain | baked lightmap + sand PBR | + granular near-camera detail, scattered rocks |

## Phases

### A. Blocks (highest impact) — DONE 2026-07-18
1. Rounded-box projection in `pyramidGeo` (subdivided face grid projected onto
   a rounded box, bevel radius ≈ 0.10–0.14 of the unit cell) with recomputed
   normals — pillow silhouette like the reference.
2. Soften weathering: fewer eroded blocks, `shrinkF` → chips (0.85–0.96)
   instead of half-size blocks, reduced positional/scale jitter, smaller layer
   offsets → tight masonry joints ("carved", not "broken").
3. Lower vertex-shader erosion displacement amplitude to match.
4. Mirror every geometry change in `tools/export-pyramid-glb.mjs`
   (deterministic PRNG must stay in exact sync), then re-bake.

### B. Light + grade — DONE 2026-07-18
1. `ACESFilmicToneMapping` unconditional + exposure retune.
2. `scene.environment` from `PMREMGenerator.fromScene` on a small procedural
   warm-night env (dark zenith, warm horizon band, faint ground bounce).
3. Prism as a real warm light source; keep additive glow sprite.
4. Re-bake pyramid lightmap (Blender Cycles, `tools/blender-bake.py`) against
   the new rounded geometry; re-encode KTX2 (`toktx --t2 --encode etc1s
   --qlevel 192 --genmipmap --assign_oetf srgb`).

### C. Atmosphere — DONE 2026-07-18 (single-ACES fix + haze + grade + grain; CA already present)
1. Horizon haze band (noise-textured, additive, distance-keyed).
2. Film grain + vignette + very subtle chromatic aberration (single fullscreen
   pass; igloo-style dither to kill banding).
3. Warm up fog color; possibly height-graded fog.

### D. Terrain detail
1. More small instanced rocks scattered near camera.
2. Granular detail normal on sand close-up.
3. Optional: soften terrain lightmap bake with erosion-aware dune shapes.

## Validation

- Headless Playwright stills at 1496×769 (`?still`), compared against the
  reference render per phase.
- Bake parity: deterministic PRNG seeds shared by runtime + exporter; lightmap
  atlas layout unchanged (13×13 tiles, 3×2 face grid per tile).
- KTX2s verified with `ktx2check` + `ktx extract` channel means (a broken
  encode reads e.g. B=0 on a normal map).

## Constraints

- three.js r128 vendored (`vendor/three/three.module.js`) — r128 APIs only
  (`encoding`, not `colorSpace`).
- KTX2 is the default texture path; `?jpg` is the QA fallback. Cache-busted
  via `TEX_VERSION`.
- All block-geometry constants live in both `pyra-desierto-v13.html` and
  `tools/export-pyramid-glb.mjs` — never change one without the other.
