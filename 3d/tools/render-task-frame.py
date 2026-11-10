# =============================================================
# render-task-frame.py · 小游戏页面统一底图（Blender 5.2.2 + SDXL 屏）
# -------------------------------------------------------------
# 输出 assets/minigame/task-frame.png（1024×640，RGBA）
# 用途：js/t2/minigame.js 的 #mg .card 底图；26 个任务共用同一块
#       “Blender 渲染的控制台框”，任务色仍由 --mg-accent 区分。
# 贴图：3d/assets/textures/device_screen_task.png（SDXL）+ assets/scene/v4/tex/panel-metal.png。
# 用法：
#   "E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b -P 3d/tools/render-task-frame.py
# =============================================================
import bpy, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'minigame', 'task-frame.png')
SCREEN = os.path.join(ROOT, '3d', 'assets', 'textures', 'device_screen_task.png')
METAL = os.path.join(ROOT, 'assets', 'scene', 'v4', 'tex', 'panel-metal.png')

if tuple(bpy.app.version[:2]) < (5, 2):
    raise SystemExit('[task-frame] 需要 Blender 5.2+')

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
    try:
        scene.render.engine = eng
        break
    except Exception:
        continue
scene.eevee.taa_render_samples = 64
scene.render.resolution_x = 1024
scene.render.resolution_y = 640
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0.15
scene.render.filepath = OUT


def mat(name, tex=None, color=(0.3, 0.34, 0.4, 1), metallic=0.5, rough=0.45, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = color
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    if tex and os.path.exists(tex):
        im = bpy.data.images.load(tex)
        im.colorspace_settings.name = 'sRGB'
        t = m.node_tree.nodes.new('ShaderNodeTexImage')
        t.image = im
        m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
        if emit > 0:
            try:
                m.node_tree.links.new(t.outputs['Color'], b.inputs['Emission Color'])
                b.inputs['Emission Strength'].default_value = emit
            except KeyError:
                pass
    return m


def box(name, size, loc, m, bevel=0.02):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(m)
    if bevel > 0:
        md = o.modifiers.new('b', 'BEVEL')
        md.width = bevel
        md.segments = 2
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=md.name)
    return o


body = mat('body', METAL, (0.55, 0.62, 0.72, 1), 0.65, 0.4)
dark = mat('dark', METAL, (0.18, 0.21, 0.26, 1), 0.55, 0.4)
screen = mat('screen', SCREEN, (0.2, 0.3, 0.4, 1), 0.0, 0.8, 0.18)
amber = mat('amber', None, (0.94, 0.62, 0.12, 1), 0.3, 0.35, 0.6)

box('cabinet', (2.4, 0.24, 1.5), (0, 0, 0.75), body, 0.03)
box('screen_bezel', (2.05, 0.06, 1.12), (0, 0.14, 0.82), dark, 0.015)
box('screen_face', (1.86, 0.02, 0.94), (0, 0.18, 0.82), screen, 0.005)
box('top_strip', (2.2, 0.04, 0.045), (0, 0.16, 1.46), amber, 0.004)
for i in range(3):
    box('btn_%d' % i, (0.18, 0.04, 0.05), (-0.55 + i * 0.55, 0.15, 0.22), amber, 0.006)
# 两侧短管 / 散热口，给控制台一点船体质感
for sx in (-1, 1):
    box('vent_%d' % sx, (0.10, 0.10, 0.8), (sx * 1.12, 0.02, 0.75), dark, 0.01)
    for k in range(3):
        box('vent_slot_%d_%d' % (sx, k), (0.06, 0.05, 0.04),
            (sx * 1.13, 0.09, 0.45 + k * 0.18), amber, 0.003)

camd = bpy.data.cameras.new('cam')
camd.type = 'ORTHO'
camd.ortho_scale = 2.65
cam = bpy.data.objects.new('cam', camd)
scene.collection.objects.link(cam)
cam.location = (0, -4.0, 0.78)
cam.rotation_euler = (math.radians(90), 0, 0)
scene.camera = cam

for loc, energy, size in (((1.2, -2.0, 2.4), 180, 3.0), ((-1.4, -1.4, 1.4), 80, 3.0)):
    ld = bpy.data.lights.new('l', 'AREA')
    ld.energy = energy
    ld.size = size
    lo = bpy.data.objects.new('l', ld)
    scene.collection.objects.link(lo)
    lo.location = loc
    # 面向控制台
    from mathutils import Vector
    lo.rotation_euler = (Vector((0, 0, 0.75)) - lo.location).to_track_quat('-Z', 'Y').to_euler()

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.render.render(write_still=True)
print('TASK_FRAME ' + OUT)
