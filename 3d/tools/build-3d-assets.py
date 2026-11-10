# =============================================================
# build-3d-assets.py · 3D 场景设备 / 道具程序化建模
# -------------------------------------------------------------
# 产物：3d/assets/models/<id>.blend + 3d/assets/export/<id>.glb
# 约定：米制 / +Y 前 / +Z 上 / 底面中心为原点；面数低于清单预算。
# 贴图：沿用 assets/scene/v4/tex（SDXL 生成）与 assets/minigame/panel-*.png；
#       新增 3d/assets/textures/device_screen_*.png（SDXL 生成，可缺省）。
# 用法：
#   "E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b -P 3d/tools/build-3d-assets.py
#   加 -- --only device_panel_fix prop_crate 只做指定资产。
# =============================================================
import bpy
import math
import os
import sys
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS = os.path.join(ROOT, '3d', 'assets', 'models')
EXPORTS = os.path.join(ROOT, '3d', 'assets', 'export')
TEX = os.path.join(ROOT, 'assets', 'scene', 'v4', 'tex')
MINI = os.path.join(ROOT, 'assets', 'minigame')
PREVIEW_TEX = os.path.join(ROOT, '3d', 'preview', 'assets', 'textures')
NEW_TEX = os.path.join(ROOT, '3d', 'assets', 'textures')
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

if tuple(bpy.app.version[:2]) < (5, 2):
    raise SystemExit('[3d-assets] 需要 Blender 5.2+（权威版 5.2.2 LTS），当前 %s'
                     % bpy.app.version_string)

_IMAGES = {}
_MATS = {}


def img(path):
    if path in _IMAGES:
        return _IMAGES[path]
    if not os.path.exists(path):
        return None
    image = bpy.data.images.load(path, check_existing=True)
    image.colorspace_settings.name = 'sRGB'
    _IMAGES[path] = image
    return image


def _principled(mat):
    for node in mat.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            return node
    return None


def material(name, tex_path=None, color=(0.5, 0.55, 0.62, 1.0), metallic=0.35,
             rough=0.55, emit=0.0, emit_color=(1.0, 1.0, 1.0, 1.0)):
    key = '%s|%s|%s|%s|%s' % (name, tex_path, color, metallic, rough)
    if key in _MATS:
        return _MATS[key]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = _principled(mat)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Base Color'].default_value = color
    image = img(tex_path) if tex_path else None
    if image is not None:
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = image
        tex.interpolation = 'Linear'
        mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if emit > 0.0:
        try:
            bsdf.inputs['Emission Color'].default_value = emit_color
            bsdf.inputs['Emission Strength'].default_value = emit
        except KeyError:
            pass
        if image is not None:
            try:
                mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
            except Exception:
                pass
    _MATS[key] = mat
    return mat


def _finish(obj, mat, uv=True, bevel=0.0):
    obj.data.materials.append(mat)
    if bevel > 0.0:
        mod = obj.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if uv:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        try:
            bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.02)
        except Exception:
            pass
        bpy.ops.object.mode_set(mode='OBJECT')
    return obj


def box(name, size, center, mat, bevel=0.02, uv=True):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(obj, mat, uv=uv, bevel=bevel)


def cyl(name, radius, depth, center, mat, axis='Z', verts=20, bevel=0.0):
    rot = (0, 0, 0)
    if axis == 'X':
        rot = (0, math.pi / 2, 0)
    elif axis == 'Y':
        rot = (math.pi / 2, 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, vertices=verts,
                                        location=center, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return _finish(obj, mat, uv=True, bevel=bevel)


def task_screen():
    """通用任务屏：优先用 SDXL 生成的 device_screen_task.png，缺失时退回 panel-task。"""
    path = os.path.join(NEW_TEX, 'device_screen_task.png')
    return path if os.path.exists(path) else os.path.join(PREVIEW_TEX, 'panel-task.png')


def screen(name, size, center, tex_path, emit=0.18):
    # 模型正面是 +Y；平面默认法线 +Z，绕 X 转 -90° 才朝 +Y。
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=center, rotation=(-math.pi / 2, 0, 0))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0], size[1], 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # 屏幕要“自己在发光”，不是镜子：低金属 + 高粗糙，避免手电打出一团白斑。
    mat = material('screen_' + os.path.basename(tex_path), tex_path,
                   metallic=0.0, rough=0.86, emit=emit)
    obj.data.materials.append(mat)
    return obj


def torus(name, major, minor, center, mat, axis='Z'):
    rot = (0, 0, 0)
    if axis == 'X':
        rot = (0, math.pi / 2, 0)
    elif axis == 'Y':
        rot = (math.pi / 2, 0, 0)
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=24, minor_segments=6,
                                     location=center, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return _finish(obj, mat, uv=True)


def tube(name, a, b, radius, mat, verts=12):
    a = Vector(a)
    b = Vector(b)
    d = b - a
    mid = (a + b) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=d.length, vertices=verts,
                                        location=mid)
    obj = bpy.context.active_object
    obj.name = name
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = d.to_track_quat('Z', 'Y')
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return _finish(obj, mat, uv=True, bevel=0.0)


def root(name):
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
    obj = bpy.context.active_object
    obj.name = name
    return obj


def parent_all(empty):
    for obj in list(bpy.context.scene.objects):
        if obj is not empty and obj.parent is None:
            obj.parent = empty


def tri_count():
    total = 0
    deps = bpy.context.evaluated_depsgraph_get()
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        mesh = obj.evaluated_get(deps).to_mesh()
        mesh.calc_loop_triangles()
        total += len(mesh.loop_triangles)
    return total


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATS.clear()
    _IMAGES.clear()


# ---------------------------------------------------------------- 设备

def device_panel(asset_id, body_tex, screen_tex, width=1.2, height=1.2, depth=0.25):
    body = material('body', os.path.join(TEX, body_tex), metallic=0.55, rough=0.45)
    dark = material('dark', os.path.join(TEX, 'panel-metal.png'), color=(0.25, 0.28, 0.34, 1),
                    metallic=0.5, rough=0.5)
    amber = material('amber', None, color=(0.94, 0.62, 0.12, 1), metallic=0.4, rough=0.35,
                     emit=0.5, emit_color=(1.0, 0.6, 0.12, 1))
    box('cabinet', (width, depth, height), (0, 0, height * 0.5), body, bevel=0.025)
    box('bezel_top', (width - 0.04, 0.05, 0.06), (0, depth * 0.5 + 0.012, height - 0.12), dark, bevel=0.01)
    box('bezel_bottom', (width - 0.04, 0.05, 0.06), (0, depth * 0.5 + 0.012, 0.16), dark, bevel=0.01)
    box('bezel_left', (0.06, 0.05, height - 0.34), (-width * 0.5 + 0.05, depth * 0.5 + 0.012, height * 0.5 - 0.02), dark, bevel=0.01)
    box('bezel_right', (0.06, 0.05, height - 0.34), (width * 0.5 - 0.05, depth * 0.5 + 0.012, height * 0.5 - 0.02), dark, bevel=0.01)
    screen('display', (width - 0.22, height - 0.46),
           (0, depth * 0.5 + 0.045, height * 0.5 + 0.03), screen_tex, emit=0.18)
    for i in range(3):
        box('btn_%d' % i, (0.075, 0.035, 0.045),
            (-0.18 + i * 0.18, depth * 0.5 + 0.04, 0.10), amber, bevel=0.008)
    box('stripe', (width - 0.10, 0.02, 0.035), (0, depth * 0.5 + 0.03, height - 0.04),
        amber, bevel=0.005)
    for sx in (-1, 1):
        for i in range(4):
            box('vent_%d_%d' % (sx, i), (0.05, 0.02, 0.035),
                (sx * (width * 0.5 - 0.12), depth * 0.5 + 0.03, 0.34 + i * 0.12), dark, bevel=0.004)
    return 1.2


def build_device_panel_fix():
    device_panel('device_panel_fix', 'panel-metal.png', os.path.join(MINI, 'panel-fix.png'))


def build_device_breaker():
    body = material('breaker_body', os.path.join(TEX, 'facility-panel.png'), metallic=0.55, rough=0.45)
    dark = material('breaker_dark', os.path.join(TEX, 'panel-metal.png'), color=(0.22, 0.25, 0.30, 1),
                    metallic=0.5, rough=0.5)
    red = material('breaker_red', None, color=(0.72, 0.16, 0.12, 1), metallic=0.3, rough=0.35)
    box('cabinet', (0.5, 0.3, 0.8), (0, 0, 0.4), body, bevel=0.02)
    screen('display', (0.34, 0.22), (0, 0.16, 0.60), os.path.join(MINI, 'panel-breaker.png'), emit=0.18)
    cyl('pivot', 0.045, 0.10, (0, 0.19, 0.35), dark, axis='Y')
    box('handle', (0.07, 0.05, 0.24), (0, 0.23, 0.47), red, bevel=0.012)
    box('handle_grip', (0.11, 0.04, 0.05), (0, 0.255, 0.58), dark, bevel=0.008)
    box('stripe', (0.42, 0.02, 0.035), (0, 0.16, 0.12),
        material('breaker_amber', None, color=(0.94, 0.62, 0.12, 1), emit=0.5,
                 emit_color=(1.0, 0.6, 0.12, 1)), bevel=0.005)


def build_device_oxygen():
    body = material('oxy_body', os.path.join(TEX, 'panel-white.png'), metallic=0.25, rough=0.5)
    metal = material('oxy_metal', os.path.join(TEX, 'panel-metal.png'), metallic=0.65, rough=0.35)
    glass = material('oxy_glass', None, color=(0.30, 0.72, 0.78, 0.55), metallic=0.1, rough=0.15,
                     emit=0.35, emit_color=(0.25, 0.65, 0.72, 1))
    box('base', (1.6, 0.8, 0.35), (0, 0, 0.175), metal, bevel=0.03)
    for sx in (-1, 1):
        cyl('tank_%d' % sx, 0.20, 1.2, (sx * 0.42, 0, 0.95), body, axis='Z', verts=24, bevel=0.01)
        cyl('tank_glass_%d' % sx, 0.205, 0.12, (sx * 0.42, 0, 1.18), glass, axis='Z', verts=24)
        cyl('cap_%d' % sx, 0.10, 0.10, (sx * 0.42, 0, 1.58), metal, axis='Z', verts=16)
    box('console', (0.55, 0.30, 0.85), (0, 0.36, 0.78), metal, bevel=0.02)
    screen('display', (0.46, 0.32), (0, 0.515, 0.90), task_screen(), emit=0.18)
    tube('pipe_l', (-0.42, 0.20, 1.50), (-0.42, 0.42, 1.30), 0.035, metal)
    tube('pipe_r', (0.42, 0.20, 1.50), (0.42, 0.42, 1.30), 0.035, metal)


def build_device_pod():
    body = material('pod_body', os.path.join(TEX, 'panel-white.png'), metallic=0.3, rough=0.45)
    metal = material('pod_metal', os.path.join(TEX, 'panel-metal.png'), metallic=0.65, rough=0.3)
    glass = material('pod_glass', None, color=(0.24, 0.55, 0.72, 0.45), metallic=0.05, rough=0.1,
                     emit=0.4, emit_color=(0.20, 0.55, 0.75, 1))
    box('base', (1.0, 1.0, 0.28), (0, 0, 0.14), metal, bevel=0.035)
    box('back', (0.92, 0.30, 1.55), (0, -0.30, 1.05), body, bevel=0.05)
    box('mattress', (0.72, 0.62, 0.12), (0, 0.02, 0.36), body, bevel=0.02)
    box('canopy', (0.84, 0.72, 0.62), (0, 0.02, 1.12), glass, bevel=0.06)
    for sx in (-1, 1):
        box('rail_%d' % sx, (0.06, 0.75, 0.08), (sx * 0.48, 0.02, 1.48), metal, bevel=0.01)
    screen('display', (0.55, 0.30), (0, -0.14, 1.72), task_screen(), emit=0.18)


def build_device_transformer():
    body = material('tx_body', os.path.join(TEX, 'panel-metal.png'), metallic=0.6, rough=0.4)
    dark = material('tx_dark', os.path.join(TEX, 'facility-panel.png'), metallic=0.5, rough=0.45)
    copper = material('tx_copper', None, color=(0.72, 0.38, 0.16, 1), metallic=0.8, rough=0.3)
    box('cabinet', (1.4, 1.0, 1.2), (0, 0, 0.6), body, bevel=0.03)
    box('front', (1.18, 0.04, 0.90), (0, 0.51, 0.62), dark, bevel=0.012)
    for i in range(3):
        cyl('coil_%d' % i, 0.13, 0.55, (-0.38 + i * 0.38, 0.27, 0.62), copper, axis='Z', verts=18)
    screen('display', (0.62, 0.30), (0, 0.54, 0.98), task_screen(), emit=0.18)
    for i in range(5):
        box('vent_%d' % i, (0.62, 0.03, 0.035), (0, 0.52, 0.24 + i * 0.075), copper, bevel=0.004)


def build_device_medbay():
    body = material('med_body', os.path.join(TEX, 'panel-white.png'), metallic=0.2, rough=0.42)
    metal = material('med_metal', os.path.join(TEX, 'panel-metal.png'), metallic=0.6, rough=0.35)
    green = material('med_green', None, color=(0.20, 0.80, 0.62, 1), metallic=0.2, rough=0.3,
                     emit=0.4, emit_color=(0.2, 0.8, 0.62, 1))
    box('base', (2.0, 1.0, 0.75), (0, 0, 0.375), body, bevel=0.03)
    box('top', (2.04, 1.02, 0.08), (0, 0, 0.79), metal, bevel=0.015)
    for i in range(3):
        box('drawer_%d' % i, (0.52, 0.04, 0.18), (-0.62 + i * 0.62, 0.52, 0.25), metal, bevel=0.01)
        box('handle_%d' % i, (0.18, 0.05, 0.025), (-0.62 + i * 0.62, 0.56, 0.25), green, bevel=0.005)
    screen('display', (0.86, 0.38), (0.55, 0.12, 1.08), os.path.join(NEW_TEX, 'device_screen_med.png'),
           emit=0.3) if os.path.exists(os.path.join(NEW_TEX, 'device_screen_med.png')) else \
        screen('display', (0.86, 0.38), (0.55, 0.12, 1.08), task_screen(), emit=0.18)
    box('screen_stand', (0.10, 0.10, 0.30), (0.55, 0.12, 0.93), metal, bevel=0.01)


# ---------------------------------------------------------------- 道具

def build_prop_crate():
    steel = material('crate', os.path.join(TEX, 'crate-steel.png'), metallic=0.55, rough=0.45)
    dark = material('crate_dark', os.path.join(TEX, 'panel-metal.png'), metallic=0.55, rough=0.4)
    amber = material('crate_amber', None, color=(0.94, 0.62, 0.12, 1), emit=0.25,
                     emit_color=(1.0, 0.6, 0.12, 1))
    box('body', (1.0, 1.0, 1.0), (0, 0, 0.5), steel, bevel=0.035)
    for i in range(3):
        box('rib_%d' % i, (1.03, 0.06, 0.10), (0, -0.5, 0.16 + i * 0.34), dark, bevel=0.008)
    box('band', (1.03, 1.03, 0.10), (0, 0, 0.86), amber, bevel=0.008)
    box('label', (0.34, 0.02, 0.18), (0.26, 0.51, 0.55), dark, bevel=0.004)


def build_prop_table():
    top = material('table_top', os.path.join(TEX, 'table-composite.png'), metallic=0.25, rough=0.55)
    metal = material('table_leg', os.path.join(TEX, 'panel-metal.png'), metallic=0.6, rough=0.4)
    box('top', (2.4, 1.0, 0.08), (0, 0, 0.74), top, bevel=0.02)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box('leg_%d_%d' % (sx, sy), (0.08, 0.08, 0.70),
                (sx * 1.05, sy * 0.38, 0.35), metal, bevel=0.012)
    box('rail', (2.2, 0.05, 0.05), (0, 0, 0.20), metal, bevel=0.008)


def build_prop_shelf():
    metal = material('shelf', os.path.join(TEX, 'warehouse-rack.png'), metallic=0.55, rough=0.45)
    dark = material('shelf_dark', os.path.join(TEX, 'panel-metal.png'), metallic=0.55, rough=0.4)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box('post_%d_%d' % (sx, sy), (0.07, 0.07, 2.2),
                (sx * 0.95, sy * 0.26, 1.1), metal, bevel=0.008)
    for i in range(4):
        box('shelf_%d' % i, (2.0, 0.58, 0.05), (0, 0, 0.35 + i * 0.56), metal, bevel=0.008)
    for sx in (-1, 1):
        box('brace_%d' % sx, (0.04, 0.54, 1.9), (sx * 0.94, 0, 1.1), dark, bevel=0.004)


def build_prop_pipe_run():
    metal = material('pipe', os.path.join(TEX, 'panel-metal.png'), metallic=0.75, rough=0.32)
    dark = material('pipe_dark', os.path.join(TEX, 'facility-panel.png'), metallic=0.6, rough=0.4)
    cyl('main', 0.10, 4.0, (0, 0, 0), metal, axis='X', verts=20)
    cyl('upper', 0.06, 3.8, (0, 0.22, 0.18), dark, axis='X', verts=16)
    for i in range(4):
        x = -1.5 + i
        cyl('flange_%d' % i, 0.14, 0.08, (x, 0, 0), dark, axis='X', verts=18)
        cyl('bracket_%d' % i, 0.045, 0.35, (x, 0.10, 0.12), dark, axis='Z', verts=10)


def build_prop_pipe_port():
    """地板通风管道口（2026-11-10 写实版）：顶面贴千问写实百叶风口贴图
    （assets/qwen-lib/vent-grille_768.png）+ 可染色外圈 pipe_rim + 侧短管。
    不再矢量直接画；2.5D 精灵由 render-pipe-port.py 从本模型渲染。"""
    grille_tex = os.path.join(ROOT, 'assets', 'qwen-lib', 'vent-grille_768.png')
    body = material('pipe_hatch', grille_tex, metallic=0.75, rough=0.38)
    dark = material('pipe_dark', os.path.join(TEX, 'facility-panel.png'), metallic=0.6, rough=0.42)
    rim = material('pipe_rim', None, color=(0.30, 0.75, 0.85, 1), metallic=0.25, rough=0.30,
                   emit=2.0, emit_color=(0.30, 0.75, 0.85, 1))
    box('duct', (1.5, 1.1, 0.08), (0, 0, 0.04), dark, bevel=0.01)
    box('face', (1.5, 1.1, 0.02), (0, 0, 0.09), body, bevel=0.005)
    # 2026-11-10：不再加发光彩色外圈（用户否决"突兀色框"）；口体由 grade-pipe-ports.py
    # 按舱室地板色调着色，使其与地面同图层。pipe_rim 材质保留供旧渲染脚本兼容但无几何使用。
    for sx in (-1, 1):
        cyl('stub_%d' % sx, 0.085, 0.42, (sx * 0.98, 0, 0.18), dark, axis='X', verts=16)
        torus('flange_%d' % sx, 0.10, 0.028, (sx * 0.80, 0, 0.18), body, axis='X')


# ---------------------------------------------------------------- 导出

def export(asset_id, builder):
    reset()
    builder()
    empty = root(asset_id)
    parent_all(empty)
    os.makedirs(MODELS, exist_ok=True)
    os.makedirs(EXPORTS, exist_ok=True)
    blend_path = os.path.join(MODELS, asset_id + '.blend')
    glb_path = os.path.join(EXPORTS, asset_id + '.glb')
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
    )
    print('ASSET %s tris=%d blend=%s glb=%s' % (
        asset_id, tri_count(), os.path.basename(blend_path), os.path.basename(glb_path)), flush=True)


ASSETS = {
    'device_panel_fix': build_device_panel_fix,
    'device_breaker': build_device_breaker,
    'device_oxygen': build_device_oxygen,
    'device_pod': build_device_pod,
    'device_transformer': build_device_transformer,
    'device_medbay': build_device_medbay,
    'prop_crate': build_prop_crate,
    'prop_table': build_prop_table,
    'prop_shelf': build_prop_shelf,
    'prop_pipe_run': build_prop_pipe_run,
    'prop_pipe_port': build_prop_pipe_port,
}


def main():
    only = []
    if '--only' in ARGS:
        i = ARGS.index('--only')
        only = ARGS[i + 1:]
    names = [n for n in (only or list(ASSETS)) if n in ASSETS]
    if not names:
        raise SystemExit('[3d-assets] 没有匹配的资产 id')
    for name in names:
        export(name, ASSETS[name])
    print('DONE %d assets' % len(names), flush=True)


if __name__ == '__main__':
    main()
