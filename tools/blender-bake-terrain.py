"""
PYRA Phase 3b — Blender headless terrain bake
Bakes the terrain/dune lightmap: sand color + directional shading + AO.
Uses the same light rig as the pyramid bake for visual coherence.
Output: /tmp/pyra-terrain-bake.png (4096x4096)
"""
import bpy, math, time
from mathutils import Vector

GLB = '/tmp/pyra-terrain.glb'
OUT = '/tmp/pyra-terrain-bake.png'
RES = 4096
SAMPLES = 96   # slightly fewer than pyramid (terrain is smoother, less detail)

t0 = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
terrain = [o for o in bpy.data.objects if o.type == 'MESH'][0]
terrain.select_set(True)
bpy.context.view_layer.objects.active = terrain

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
sc.cycles.use_denoising = True
try:
    sc.cycles.denoiser = 'OPENIMAGEDENOISE'
except TypeError:
    pass
sc.cycles.max_bounces = 4
sc.cycles.diffuse_bounces = 2
sc.cycles.glossy_bounces = 2
sc.render.resolution_x = RES
sc.render.resolution_y = RES
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGB'
sc.render.filepath = OUT

# ---------- world (same ambient as pyramid) ----------
w = bpy.data.worlds.new('pyra_world')
w.use_nodes = True
wn = w.node_tree.nodes
wl = w.node_tree.links
for n in list(wn):
    wn.remove(n)
n_out = wn.new('ShaderNodeOutputWorld')
n_bg = wn.new('ShaderNodeBackground')
def srgb_lin(c):
    return tuple(pow(v / 255.0, 2.2) for v in c) + (1.0,)
amb = srgb_lin((0x3a, 0x2f, 0x24))
n_bg.inputs['Color'].default_value = amb
n_bg.inputs['Strength'].default_value = 0.42
wl.new(n_bg.outputs['Background'], n_out.inputs['Surface'])
sc.world = w

# ---------- lights (same as pyramid bake) ----------
def add_sun(name, rgb, energy, pos):
    ld = bpy.data.lights.new(name, 'SUN')
    ld.energy = energy
    ld.color = tuple(pow(v / 255.0, 2.2) for v in rgb)
    lo = bpy.data.objects.new(name, ld)
    bpy.context.collection.objects.link(lo)
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

PYR_H = 14.35
add_sun('key', (0xf0, 0xc8, 0x98), 3.8, (-50, -38, 18))
add_sun('moon', (0x90, 0xa8, 0xd0), 0.5, (40, -30, 60))
add_sun('fill', (0xd0, 0xa8, 0x78), 1.2, (45, 30, 20))
add_point('core', (0xff, 0xd8, 0xb0), 900, (0, 0, PYR_H * 0.45), 1.2)
add_point('corelow', (0xff, 0xc8, 0x90), 350, (0, 0, 2.2), 1.0)

# ---------- terrain material: sandy procedural ----------
mat = bpy.data.materials.new('pyra_sand_bake')
mat.use_nodes = True
mn = mat.node_tree.nodes
ml = mat.node_tree.links
for n in list(mn):
    mn.remove(n)
n_out = mn.new('ShaderNodeOutputMaterial')
n_bsdf = mn.new('ShaderNodeBsdfPrincipled')
n_bsdf.inputs['Roughness'].default_value = 0.98
n_bsdf.inputs['Metallic'].default_value = 0.0

# sand color: noise -> warm sand ramp
n_tex = mn.new('ShaderNodeTexNoise')
n_tex.inputs['Scale'].default_value = 0.8    # large-scale variation (dunes are big)
n_tex.inputs['Detail'].default_value = 4.0
n_tex.inputs['Roughness'].default_value = 0.7
n_ramp = mn.new('ShaderNodeValToRGB')
def L(r, g, b): return (pow(r, 2.2), pow(g, 2.2), pow(b, 2.2), 1.0)
n_ramp.color_ramp.elements[0].position = 0.2
n_ramp.color_ramp.elements[0].color = L(0.52, 0.40, 0.28)   # shadow sand
n_ramp.color_ramp.elements[1].position = 0.8
n_ramp.color_ramp.elements[1].color = L(0.82, 0.70, 0.52)   # lit sand
mid = n_ramp.color_ramp.elements.new(0.5)
mid.color = L(0.68, 0.56, 0.40)
ml.new(n_tex.outputs['Fac'], n_ramp.inputs['Fac'])
ml.new(n_ramp.outputs['Color'], n_bsdf.inputs['Base Color'])

# subtle bump for dune texture
n_bump = mn.new('ShaderNodeBump')
n_bump.inputs['Strength'].default_value = 0.2
n_bump.inputs['Distance'].default_value = 0.3
ml.new(n_tex.outputs['Fac'], n_bump.inputs['Height'])
ml.new(n_bump.outputs['Normal'], n_bsdf.inputs['Normal'])
ml.new(n_bsdf.outputs['BSDF'], n_out.inputs['Surface'])
terrain.data.materials.clear()
terrain.data.materials.append(mat)

# ---------- bake image ----------
img = bpy.data.images.new('pyra_terrain_bake', width=RES, height=RES, alpha=False, float_buffer=False)
img.colorspace_settings.name = 'sRGB'
n_img = mn.new('ShaderNodeTexImage')
n_img.image = img
mn.active = n_img
for nd in mn:
    nd.select = False
n_img.select = True

bpy.ops.object.select_all(action='DESELECT')
terrain.select_set(True)
bpy.context.view_layer.objects.active = terrain

sc.render.bake.use_clear = True
sc.render.bake.margin = 16   # bigger margin for terrain (uv edges)
print('TERRAIN BAKE START | verts:', len(terrain.data.vertices), '| lights:', len([o for o in bpy.data.objects if o.type=='LIGHT']))
bpy.ops.object.bake(type='COMBINED')
img.save_render(OUT)
print('TERRAIN BAKE DONE in %.1fs -> %s' % (time.time() - t0, OUT))
