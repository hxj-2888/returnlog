# =============================================================
# build-scene-v2.py · 按 layout-v2.json 重构全船 3D 场景（Blender 5.2.2）
# -------------------------------------------------------------
# 用法：
#   "E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b \
#     -P 3d/tools/build-scene-v2.py
#
# 输入：3d/preview/data/layout-v2.json（方案层，不覆盖 map.json）
# 输出：3d/assets/models/ship_scene_v2.blend
#       3d/assets/renders/ship-scene-v2.png（正交俯视预览）
#
# 设计口径：
#   · 1 格 = 1 米，2.5D 的 (x,y) 映射到 Blender 的 (x,y)，高度走 Z
#   · 墙是有厚度实体（0.34 m / 高 3.0 m），墙段已在门洞处断开
#   · 掩体按 anchor/mid/accent 三档给高度，颜色取 rooms[].theme.mark
#   · 墙饰是贴墙竖直板，颜色取 theme.glow
#   · 每个舱室独立 Collection，便于 MCP 活会话里按舱室改写
#   · 主通道 / 门厅净空不做实体 —— 留空本身就是设计
# 边界：不改 js/data/map.js、不改 3d/preview/data/map.json、不改 Godot 脚本。
# =============================================================
import bpy
import json
import math
import os
import sys

if tuple(bpy.app.version[:2]) < (5, 2):
    raise SystemExit('[scene-v2] 需要 Blender 5.2+，当前 %s；权威路径 '
                     'E:\\SteamLibrary\\steamapps\\common\\Blender\\blender.exe' % bpy.app.version_string)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, '3d', 'preview', 'data', 'layout-v2.json')
MODEL_DIR = os.path.join(ROOT, '3d', 'assets', 'models')
RENDER_DIR = os.path.join(ROOT, '3d', 'assets', 'renders')
BLEND = os.path.join(MODEL_DIR, 'ship_scene_v2.blend')
PNG = os.path.join(RENDER_DIR, 'ship-scene-v2.png')

WALL_THICK = 0.34
WALL_HEIGHT = 3.0
TIER_HEIGHT = {'anchor': 1.30, 'mid': 0.95, 'accent': 0.55}
DECOR_HEIGHT = 1.25
DECOR_Z = 1.95

with open(SRC, encoding='utf-8') as f:
    D = json.load(f)

os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(RENDER_DIR, exist_ok=True)

# ---- 清场 ------------------------------------------------------
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name != 'Collection':
        bpy.data.collections.remove(c)
for m in list(bpy.data.materials):
    bpy.data.materials.remove(m)

scene = bpy.context.scene
root_col = bpy.data.collections.get('Collection') or bpy.data.collections.new('Collection')
if root_col.name not in scene.collection.children:
    scene.collection.children.link(root_col)


def clamp_rgb(a):
    return tuple(max(0.0, min(1.0, float(v))) for v in a)


def make_mat(name, rgb, emissive=0.0):
    key = name
    if key in bpy.data.materials:
        return bpy.data.materials[key]
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs['Roughness'].default_value = 0.78
    if emissive > 0:
        try:
            b.inputs['Emission Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
            b.inputs['Emission Strength'].default_value = emissive
        except Exception:
            pass
    m.diffuse_color = (rgb[0], rgb[1], rgb[2], 1.0)
    return m


def box(name, cx, cy, cz, sx, sy, sz, mat, col, rot_z=0.0):
    hx, hy, hz = sx / 2.0, sy / 2.0, sz / 2.0
    verts = [(-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz),
             (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz)]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
             (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = (cx, cy, cz)
    obj.rotation_euler[2] = rot_z
    obj.data.materials.append(mat)
    col.objects.link(obj)
    return obj


def flat_poly(name, poly, z, mat, col):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(p[0], p[1], z) for p in poly], [], [list(range(len(poly)))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    col.objects.link(obj)
    return obj


# ---- 房间集合 / 地面 / 主题材质 ---------------------------------
rooms = {}
for r in D['rooms']:
    col = bpy.data.collections.new('room_' + r['id'])
    scene.collection.children.link(col)
    theme = r.get('theme') or {}
    wall_rgb = clamp_rgb(theme.get('wall', [0.55, 0.6, 0.66]))
    mark_rgb = clamp_rgb(theme.get('mark', [0.7, 0.75, 0.8]))
    glow_rgb = clamp_rgb(theme.get('glow', [0.6, 0.7, 0.8]))
    rooms[r['id']] = {'data': r, 'col': col, 'wall': wall_rgb, 'mark': mark_rgb, 'glow': glow_rgb}
    floor_mat = make_mat('floor_' + r['id'], tuple(v * 0.32 + 0.06 for v in wall_rgb))
    flat_poly('floor_' + r['id'], r['poly'], -0.06, floor_mat, col)

# ---- 墙体（有厚度实体） ----------------------------------------
wall_col = bpy.data.collections.new('ship_walls')
scene.collection.children.link(wall_col)
wall_mat = make_mat('ship_wall', (0.30, 0.34, 0.40))
for i, seg in enumerate(D['walls']):
    (x1, y1), (x2, y2) = seg[0], seg[1]
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy)
    if length < 0.01:
        continue
    box('wall_%03d' % i, (x1 + x2) / 2.0, (y1 + y2) / 2.0, WALL_HEIGHT / 2.0,
        length, WALL_THICK, WALL_HEIGHT, wall_mat, wall_col, rot_z=math.atan2(dy, dx))

# ---- 掩体 127 件 ------------------------------------------------
for it in D['cover']:
    R = rooms[it['room']]
    h = TIER_HEIGHT.get(it['tier'], 0.9)
    # 深浅按层次：anchor 最实、accent 最淡，颜色始终是该舱专属 theme.mark
    k = {'anchor': 1.0, 'mid': 0.78, 'accent': 0.55}.get(it['tier'], 0.8)
    rgb = tuple(v * k + 0.04 for v in R['mark'])
    mat = make_mat('cov_%s_%s' % (it['room'], it['tier']), clamp_rgb(rgb))
    box(it['asset'], it['x'] + it['w'] / 2.0, it['y'] + it['h'] / 2.0, h / 2.0,
        it['w'], it['h'], h, mat, R['col'])

# ---- 墙面装饰 40 件（贴墙竖直板） --------------------------------
for w in D['wall_decor']:
    R = rooms[w['room']]
    length = max(w['w'], w['h'])
    if w['side'] in ('t', 'b'):
        sx, sy, rot = length, 0.08, 0.0
    else:
        sx, sy, rot = 0.08, length, 0.0
    mat = make_mat('decor_' + w['room'], R['glow'], emissive=0.35)
    box(w['asset'], w['x'] + w['w'] / 2.0, w['y'] + w['h'] / 2.0, DECOR_Z,
        sx, sy, DECOR_HEIGHT, mat, R['col'], rot_z=rot)

# ---- 相机 / 灯光 / 渲染 -----------------------------------------
bpy.ops.object.camera_add(location=(D['bounds']['w'] / 2.0, D['bounds']['h'] / 2.0, 90))
cam = bpy.context.object
cam.name = 'ship_topdown'
cam.data.type = 'ORTHO'
cam.data.ortho_scale = max(D['bounds']['w'], D['bounds']['h']) * 1.06
cam.rotation_euler = (0, 0, 0)
scene.camera = cam

bpy.ops.object.light_add(type='SUN', location=(D['bounds']['w'] / 2.0, D['bounds']['h'] / 2.0, 60))
sun = bpy.context.object
sun.name = 'ship_sun'
sun.data.energy = 2.2
sun.rotation_euler = (0, 0, 0)

scene.world.color = (0.035, 0.045, 0.06)
for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
    try:
        scene.render.engine = eng
        break
    except Exception:
        continue
scene.eevee.taa_render_samples = 64
scene.render.resolution_x = 1200
scene.render.resolution_y = 1150
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = PNG
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND)

# ---- 统计 -------------------------------------------------------
counts = {}
for r in D['rooms']:
    counts[r['id']] = len(rooms[r['id']]['col'].objects)
print('[scene-v2] 房间 %d · 掩体 %d · 墙饰 %d · 墙段 %d' %
      (len(D['rooms']), len(D['cover']), len(D['wall_decor']), len(D['walls'])))
print('[scene-v2] 对象总数 %d（含地面 / 墙段 / 掩体 / 墙饰 / 相机 / 灯）' % len(bpy.data.objects))
for rid in counts:
    print('  %-10s %3d 件' % (rid, counts[rid]))
print('[scene-v2] 场景：' + os.path.relpath(BLEND, ROOT))
print('[scene-v2] 预览：' + os.path.relpath(PNG, ROOT))
print('[scene-v2] Blender %s · EEVEE · 64 samples · 1200×1150' % bpy.app.version_string)
