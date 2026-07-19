# Changelog

## 2026-07-19

### Changed
- **Marcelo's tuned look baked as defaults** (from the Ajustes panel's Copy
  JSON): heavier ruin deformity (jitter ×3.9, yaw ×3.4, tilt ×4.4, scale
  var ×4.2, layer drift ×1.05, mesh displacement 0.065), wider stone crop
  (U 0.61), more accumulated sand (0.52), stronger/denser/farther dune
  ripples (0.95 / 7.3 / 100), brighter fill (hemi 0.8, moon 0.34, ambient
  0.9), softer block normal (0.75) with more IBL (0.85 block / 0.3 ground),
  storm density 1.3 + grain opacity 0.98 (size 0.055) + storm peak 2.4,
  prism light 7.5 + halo 0.55 + glow 0.68. Panel Reset anchors to these
  values. NOTE: at this deformity the baked block-shadow atlas visibly
  misaligns — acceptable per direction; a re-bake with the same multipliers
  in the exporter is the fix if it starts to bother.

## 2026-07-18

### Added (live tuning panel, "Ajustes")
- **Tune panel** — left-side "Ajustes" panel (button in `#toolBtns`) with
  **48 live controls** across 7 sections (pyramid deformity, block texture,
  ground, lighting, prism, sandstorm, journey), every row with a short
  Spanish description. Copy JSON (current values) + Reset (build-time
  defaults) buttons.
- **Live deformity without rebuild** — weathering refactored to store the
  raw PRNG draws per block (`B.w`, byte-identical call order to
  `tools/export-pyramid-glb.mjs`, so survivors/atlas/lightmap mapping are
  unchanged); `applyWeathering()` recomputes jitter/yaw/tilt/scale/shrink
  from raws × `TUNE` multipliers and `updatePyramid` rewrites instance
  matrices per frame — deformity sliders apply instantly.
- **Pre-compile-safe shader sliders** — shared uniform registries `TUNEU`
  (block material: crop U/V, vertex displacement, lightmap mix/gain, AO,
  joints, carve, sand, detail normal, roughness variance) and `GNDU`
  (ground: lightmap mix, ripple strength/freq/fade) are `Object.assign`ed
  into `shader.uniforms` in onBeforeCompile, so slider writes work whether
  or not the shader has compiled yet.
- Per-frame animated values (prism emissive/halo, storm layer opacities,
  wind, journey speed/damping) routed through `TUNE` so animate() reads
  live values instead of stomping slider changes.
- Deliberately NOT exposed (would desync baked data): erosion probability
  (re-roll re-splices survivors → 13×13 atlas desync), dune amplitudes
  (terrain lightmap + rock/pebble placement), keyLight position (D1 bake
  rig), block stone `repeat` (custom vVarUv sampling bypasses uvTransform —
  crop U/V serve that role).
- QA: Playwright `?still` p=0/0.25/0.5/0.75/1 → **0 page errors**; panel
  DOM: 46 range + 2 color inputs, 7 sections, 49 descriptions, interaction
  (max sliders, Reset, Copy) error-free; deformity sliders visibly reshape
  the pyramid live; default-look identity vs previous commit: PSNR 33.5 dB
  ≈ noise floor 33.8 dB (same-build reload; storm particles are
  per-load random). GOTCHA: headless Chromium produces ~no compositor
  frames on this page (rAF ticked once in 1.2s), so the panel's CSS
  slide-in transition never advances in headless QA — verified by toggling
  with `transition:none` (panel lands at x=0); same mechanism as the
  shipped editor panel.

### Added (scroll narrative, phase E)
- **Journey system** — virtual scroll (wheel/touch/arrow keys, no scrollbar)
  drives damped progress `p ∈ [0,1]`; camera flies a Catmull-Rom path of 5
  waypoints whose first point IS the intro's final camera (seamless
  intro→journey handoff; `p=0` is pixel-equivalent to the old resting shot).
  Uses `getPoint` (uniform param), not `getPointAt` (arc length), so each
  waypoint lands exactly on its keyframe and stays in sync with the per-leg
  smootherstep look-target lerp.
- **Five chapters** keyed to `p` windows: 01 El Monumento (rest), 02 La
  Piedra (low close-up of the masonry), 03 La Tormenta (back side; the
  sandstorm `windMul` ramps ×2.6 via a `stormBoost()` bell around p≈0.5),
  04 El Prisma (high shot at prism level), 05 outro (wide pull-back, PYRA /
  MMXXVI title). Chapter text fades by distance-to-window-midpoint with a
  14px rise.
- **HUD** — right-edge progress rail (fill bar + `01…05` counter) and a
  bottom "SCROLL" hint that eases in after the intro and dies once the user
  moves (hint owned per-frame by `updateJourneyUI`, not gsap, to avoid the
  two writers fighting).
- **QA hooks** — `?p=N` pins journey progress in `?still` mode. Playwright
  run at p = 0/0.25/0.5/0.75/1: **0 page errors**, all chapter framings
  above terrain, chapter copy legible.
- Input guards: editor/timeline panels and INPUT elements don't feed the
  journey; scrub mode (`tl.open`) takes precedence over journey camera.

### Changed (visual quality plan, phases D1-D4)
- **Terrain lightmap re-bake with pyramid shadow caster (D1)** — new
  `tools/bake-d1.sh` pipeline (exports → pyramid bake → terrain bake →
  KTX2 encode) run on the heavy lane; `tools/blender-bake-terrain.py` now
  imports the pyramid GLB as a shadow caster so the terrain lightmap carries
  the pyramid's cast shadow. Runtime key light re-aimed from the upper right
  to match the baked rig. Both `pyra_lightmap_4k.ktx2` and
  `pyra_terrain_4k.ktx2` regenerated (etc1s qlevel 192), `TEX_VERSION` →
  `20260718d`. Terrain bake sanity: mean 93.4/255, std 31.3 (non-flat,
  shadow content present).
- **Sandstorm system (D2)** — seamless fbm dust texture (512² wrapped value
  noise); four layers: slow ground billows, big soft dust veils at staggered
  depths, fine wind-driven sand grain (900 pts desktop / 400 mobile / 200
  reduced-motion), and rare dim gust streaks demoted to an accent.
- **Near-camera wind ripples + pebble field (D3)** — world-keyed ripple
  crests perpendicular to the wind (+x) with granular breakup; dense small
  debris field near the pyramid (380 pebbles desktop / 160 mobile).
- **Prism halo (D4)** — wide faint additive halo around the prism
  (poor-man's bloom matching the reference's glow).
- QA: `?still` harness via Playwright, night + nofog, **0 page errors**;
  night grade mean 57.5 vs reference 58.7 (Phase C was 64.9).

### Changed (visual quality plan, phases A+B)
- **Rounded carved blocks (Phase A)** — `pyramidGeo` now projects the
  subdivided face grid onto a rounded box (bevel radius 0.11 unit space,
  ~0.25 wu) with edge-biased vertex distribution and true bevel normals;
  SUB 5→9. Mirrored byte-for-byte in `tools/export-pyramid-glb.mjs`.
- **Softened weathering (Phase A)** — tight masonry joints instead of broken
  ruin: layer offsets 0.5→0.22, jitter 0.18→0.08/0.05, yaw 0.08→0.045,
  tilts 0.05→0.03, scale jitter ~±2.5%, erosion now rare chips
  (shrink 0.84–0.96) instead of half-blocks; vertex-shader erosion
  displacement (0.42, 0.075)→(0.45, 0.04). Result: 169 blocks = full 13×13
  atlas. PRNG call structure unchanged in both files.
- **ACES filmic everywhere (Phase B)** — `ACESFilmicToneMapping`
  unconditional (was NOFOG-only), exposure 1.05; fog warmed slightly.
- **Lightmap re-baked for the rounded geometry** — Blender 4.0.2 Cycles CPU,
  COMBINED 128 samples, 4096², 169-block full atlas from the new exporter GLB;
  encoded `toktx --t2 --encode etc1s --qlevel 192 --genmipmap --assign_oetf
  srgb` → `assets/tex-ktx2/pyra_lightmap_4k.ktx2`; `TEX_VERSION` → 20260718c.
  GOTCHA: this Blender build ships without OpenImageDenoise — enabling
  denoising makes `bpy.ops.object.bake` return `{'CANCELLED'}` silently
  (no exception) and the bake image stays black. `tools/blender-bake.py` now
  forces `use_denoising = False`, asserts the bake result, and saves via
  `img.save()` (raw sRGB pixels) instead of `save_render` (AgX view
  transform would skew the lightmap).
- **IBL (Phase B)** — `scene.environment` from PMREM of a procedural
  warm-night equirect canvas (dark zenith, warm horizon, ground bounce).
  NOTE: `PMREMGenerator.fromScene` rendered every onBeforeCompile material
  black under r128 — `fromEquirectangular` works; keep that path.
  `envMapIntensity`: ground 0.25 (full spec streaked the dune ripples),
  blocks 0.6.
- **Prism is now a warm light** — holo point light 0xf2f6ff→0xffc98a,
  intensity 2.4→3.0, range 90→110; glow sprite warmed to match the
  reference render.

### Changed (visual quality plan, phase C)
- **Single ACES in the fog path** — r128 applies `renderer.toneMapping` in
  material shaders even when rendering into a render target, so the post
  shader's own Narkowicz ACES + pow(1/2.2) tone-mapped the frame twice
  (washed blacks: night-still p5 was 39 vs 15 in the reference; mean 137.6 vs
  58.7). Now `renderer.toneMapping = NoToneMapping` when the post pipeline is
  active — the scene reaches the HalfFloat target linear and the post shader
  applies the only ACES. NOFOG (QA/debug, direct-to-canvas) keeps
  renderer-side `ACESFilmicToneMapping` + exposure 1.05. With NoToneMapping
  `toneMappingExposure` is ignored, so fog-path exposure lives in the new
  `uExposure` uniform (0.35; `?exp=N` QA override).
- **Night grade in the post pass** — after the fog raymarch: warm horizon haze
  band (additive, fbm-broken, distance-keyed — far dunes/sky only), exposure,
  vignette 0.55, desaturate 0.28 + warm tint (0.93, 0.99, 1.18), ACES, sRGB,
  filmic S-curve mix 0.40 (crushes night blacks), highlight gain
  `smoothstep(0.28, 0.85, lum) * 0.45` (moonlit dune tops / prism pop), film
  grain 0.016 post-curve (doubles as anti-banding dither).
- **QA metrics vs reference render** — still mean 137.6 → 64.9 (ref 58.7),
  RGB [78.3, 64.9, 51.3] vs [68, 58.7, 49.3], p5 16 vs 15, p95 120 vs 152
  (remaining p95 gap is the reference's brighter baked faces, a lighting
  property, not grade).

### Fixed
- **Terrain lightmap sampled vertically flipped** — dune shadows landed on the
  wrong dunes and read as dirty stains. KTX2/CompressedTexture uploads with
  `flipY=false`; the pyramid lightmap sample had the manual `1.0 - v` flip,
  the terrain sample did not. One-line shader fix in the ground material.
- **`sand_normal.ktx2` broken encode (blue channel = 0)** — decoded to
  (127,127,0) vs (127,127,249) in the source JPG, so the normal-map z came out
  as −1 (normals pointing into the ground) → per-texel inverted lighting =
  dark greasy patches on the sand. Regenerated with the UASTC recipe
  (`toktx --t2 --encode uastc --uastc_quality 2 --genmipmap --assign_oetf
  linear`). Sand has no `?jpg` fallback, which is why the breakage persisted
  across texture modes.
- **stone2 KTX2 set regenerated** from the good source JPGs (installed
  KTX-Software 4.4.2 / `toktx`); fixed AO encode that carried luminance in the
  red channel only (salmon tint). KTX2 restored as the default texture path.
- **Interior core** — eroded holes now read as shadowed interior masonry
  (dark-tinted textured stone) instead of black voids.
- **Stale texture cache** — added `TEX_VERSION` cache-busting query to all
  `loadTex` URLs (static hosts without `Cache-Control` let browsers keep
  heuristically-cached stale KTX2s after asset regeneration).

### Added
- `docs/VISUAL_QUALITY_PLAN.md` — igloo.inc study + phased plan (A: rounded
  blocks, B: filmic grade + IBL, C: atmosphere, D: terrain detail).
- Source JPG textures under `assets/tex/` (stone2 set) committed as encode
  inputs for the KTX2 pipeline.
