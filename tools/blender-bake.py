"""
PYRA Phase 2b — Blender headless bake
Builds the bake scene from the exported pyramid GLB:
- Sandstone color via Noise+Voronoi procedural (or flat warm sandstone)
- Lights matched to three.js scene:
    ambient 0x3a2f24 * 1.1 (world)
    hemi 0x2a2620 sky / 0x4a3e2e ground * 0.55 (world gradient)
    key dir 0xe8d4b0 * 0.85 from (-38,46,34)
    moon dir 0xb0a890 * 0.22 from (40,60,30)
    core point 0xffd0a0 * 3.6 at (0, PYR_H*0.45, 0)
    coreLow point 0xffc080 * 1.3 at (0, 2.2, 0)
- Bakes DIFFUSE (direct+indirect, with color) + AO into one 4K image
- Cycles CPU, 128 samples + OIDN denoise
Output: /tmp/pyra-bake.png (4096x4096)
"""
import bpy, math, sys, time
from mathutils import Vector

GLB = '/tmp/pyra-pyramid.glb'
OUT = '/tmp/pyra-bake.png'
RES = 4096
SAMPLES = 128

PYR_H = 7 * 2.05  # 14.35

t0 = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
pyr = [o for o in bpy.data.objects if o.type == 'MESH'][0]
pyr.select_set(True)
bpy.context.view_layer.objects.active = pyr

# ---------- render engine ----------
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type = 'NONE'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    sc.cycles.device = 'CPU'
except Exception as e:
    print('device setup warn:', e)
sc.cycles.samples = SAMPLES
# This Blender build ships without OpenImageDenoise; enabling denoising makes
# the bake abort instantly with {'CANCELLED'} (no exception) -> black image.
sc.cycles.use_denoising = False
sc.cycles.max_bounces = 4
sc.cycles.diffuse_bounces = 2
sc.cycles.glossy_bounces = 2
try:
    sc.cycles.device = 'CPU'
except Exception:
    pass
sc.render.resolution_x = RES
sc.render.resolution_y = RES
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGB'
sc.render.filepath = OUT

# ---------- world (ambient + hemisphere approximation) ----------
w = bpy.data.worlds.new('pyra_world')
w.use_nodes = True
wn = w.node_tree.nodes
wl = w.node_tree.links
for n in list(wn):
    wn.remove(n)
n_out = wn.new('ShaderNodeOutputWorld')
n_bg = wn.new('ShaderNodeBackground')
# ambient 0x3a2f24 * 1.1, sRGB -> linear
def srgb_lin(c):
    return tuple(pow(v / 255.0, 2.2) for v in c) + (1.0,)
amb = srgb_lin((0x3a, 0x2f, 0x24))
n_bg.inputs['Color'].default_value = amb
n_bg.inputs['Strength'].default_value = 0.32  # D1: deeper shadow floor
wl.new(n_bg.outputs['Background'], n_out.inputs['Surface'])
sc.world = w

# ---------- lights ----------
def add_sun(name, rgb, energy, pos):
    ld = bpy.data.lights.new(name, 'SUN')
    ld.energy = energy
    ld.color = tuple(pow(v / 255.0, 2.2) for v in rgb)
    lo = bpy.data.objects.new(name, ld)
    bpy.context.collection.objects.link(lo)
    # sun shines along local -Z; align +Z with the position vector so -Z points back to origin
    d = Vector(pos).normalized()
    lo.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return lo

def add_point(name, rgb, energy_w, pos, radius=0.5):
    ld = bpy.data.lights.new(name, 'POINT')
    ld.energy = energy_w
    ld.color = tuple(pow(v / 255.0, 2.2) for v in rgb)
    ld.shadow_soft_size = radius
    lo = bpy.data.objects.new(name, ld)
    bpy.context.collection.objects.link(lo)
    lo.location = pos
    return lo

# Phase D1: single DOMINANT warm key from upper-right (matches the reference
# render's light direction), elevation ~25 deg for long readable shadows.
# The old rig (key 3.8 + fill 1.2 from the opposite side + ambient 0.42)
# filled in exactly what the key shadowed -> flat faces.
add_sun('key', (0xf0, 0xc8, 0x98), 5.2, (48, -30, 26))
add_sun('moon', (0x90, 0xa8, 0xd0), 0.4, (-30, 25, 55))   # cool rim, opposite high
add_sun('fill', (0xd0, 0xa8, 0x78), 0.35, (-45, 30, 20))  # faint bounce only  # three(40,60,30) -> blender
# core warm points (three intensity 3.6 decay ~1.8 -> blender watts rough match)
add_point('core', (0xff, 0xd8, 0xb0), 900, (0, 0, PYR_H * 0.45), 1.2)   # three y-up -> blender z-up
add_point('corelow', (0xff, 0xc8, 0x90), 350, (0, 0, 2.2), 1.0)

# ---------- ground plane (for AO/contact shadows in bake) ----------
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0))
gnd = bpy.context.active_object
gm = bpy.data.materials.new('sand_bake')
gm.use_nodes = True
gn = gm.node_tree.nodes
gb = gn.get('Principled BSDF')
gb.inputs['Base Color'].default_value = srgb_lin((0xd4, 0xc0, 0xa0))
gb.inputs['Roughness'].default_value = 1.0
gnd.data.materials.append(gm)

# ---------- pyramid material: sandstone procedural ----------
mat = bpy.data.materials.new('pyra_stone_bake')
mat.use_nodes = True
mn = mat.node_tree.nodes
ml = mat.node_tree.links
for n in list(mn):
    mn.remove(n)
n_out = mn.new('ShaderNodeOutputMaterial')
n_bsdf = mn.new('ShaderNodeBsdfPrincipled')
n_bsdf.inputs['Roughness'].default_value = 0.93
n_bsdf.inputs['Metallic'].default_value = 0.02
# sandstone: noise texture -> color ramp (warm sand tones)
n_tex = mn.new('ShaderNodeTexNoise')
n_tex.inputs['Scale'].default_value = 4.5
n_tex.inputs['Detail'].default_value = 6.0
n_tex.inputs['Roughness'].default_value = 0.75
n_ramp = mn.new('ShaderNodeValToRGB')
# warm sandstone palette (linear)
def L(r, g, b): return (pow(r, 2.2), pow(g, 2.2), pow(b, 2.2), 1.0)
n_ramp.color_ramp.elements[0].position = 0.18
n_ramp.color_ramp.elements[0].color = L(0.48, 0.36, 0.24)   # deep sandstone
n_ramp.color_ramp.elements[1].position = 0.85
n_ramp.color_ramp.elements[1].color = L(0.88, 0.76, 0.56)   # pale sandstone
mid1 = n_ramp.color_ramp.elements.new(0.42)
mid1.color = L(0.66, 0.52, 0.36)
mid2 = n_ramp.color_ramp.elements.new(0.62)
mid2.color = L(0.78, 0.64, 0.46)
ml.new(n_tex.outputs['Fac'], n_ramp.inputs['Fac'])
ml.new(n_ramp.outputs['Color'], n_bsdf.inputs['Base Color'])
# subtle bump from the same noise
n_bump = mn.new('ShaderNodeBump')
n_bump.inputs['Strength'].default_value = 0.35
n_bump.inputs['Distance'].default_value = 0.15
ml.new(n_tex.outputs['Fac'], n_bump.inputs['Height'])
ml.new(n_bump.outputs['Normal'], n_bsdf.inputs['Normal'])
ml.new(n_bsdf.outputs['BSDF'], n_out.inputs['Surface'])
pyr.data.materials.clear()
pyr.data.materials.append(mat)

# ---------- bake image ----------
img = bpy.data.images.new('pyra_bake', width=RES, height=RES, alpha=False, float_buffer=False)
img.colorspace_settings.name = 'sRGB'
# add image texture node (active) to material for bake target
n_img = mn.new('ShaderNodeTexImage')
n_img.image = img
mn.active = n_img
for nd in mn:
    nd.select = False
n_img.select = True

# make sure pyramid is the only selected for bake (ground contributes shadows/AO via cycles)
bpy.ops.object.select_all(action='DESELECT')
pyr.select_set(True)
bpy.context.view_layer.objects.active = pyr

# ---------- bake COMBINED (direct+indirect, all lights) ----------
sc.render.bake.use_clear = True
sc.render.bake.margin = 8
print('BAKE START | objs:', len(bpy.data.objects), '| lights:', len([o for o in bpy.data.objects if o.type=='LIGHT']))
res = bpy.ops.object.bake(type='COMBINED')
print('bake op result:', res)
if res != {'FINISHED'}:
    raise RuntimeError('bake did not finish: %s' % res)
# img.save() writes stored pixels (already sRGB) without the scene view
# transform; save_render would apply AgX and skew the lightmap.
img.filepath_raw = OUT
img.file_format = 'PNG'
img.save()
print('BAKE DONE in %.1fs -> %s' % (time.time() - t0, OUT))
