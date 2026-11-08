# =============================================================
# measure-cover-refs.py · 从**导出物实测**生成 cover_refs.json
# -------------------------------------------------------------
# 为什么不用手写/不信建模脚本里的常数：
#   Godot 侧要把「同一 kind 的不同尺寸件」缩放到各自的地图尺寸，
#   必须知道模型自己是按多大建的。手写常数会跟模型漂移（改了脚本忘了改表），
#   所以这里直接导入每个 GLB、量一遍包围盒，写进 res://data/cover_refs.json。
#
# 用法：
#   "E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b \
#     -P 3d/tools/measure-cover-refs.py
#
# 输出：3d/preview/data/cover_refs.json
#   { "<kind>": [宽, 进深, 高] }   —— Blender 口径（X/Y/Z），Godot 侧读出来要换轴：
#   Godot scale = (w/宽, 高度/高, h/进深)
# =============================================================
import bpy
import json
import os
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXPORT = os.path.join(ROOT, '3d', 'assets', 'export')
OUT = os.path.join(ROOT, '3d', 'preview', 'data', 'cover_refs.json')
SRC = os.path.join(ROOT, '3d', 'preview', 'data', 'map_v2.json')

with open(SRC, encoding='utf-8') as f:
    MAP = json.load(f)
kinds = sorted({c['kind'] for c in MAP['cover']})


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)


refs = {}
missing = []
for kind in kinds:
    path = os.path.join(EXPORT, kind + '.glb')
    if not os.path.exists(path):
        missing.append(kind)
        continue
    clear()
    bpy.ops.import_scene.gltf(filepath=path)
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    n = 0
    for o in bpy.context.scene.objects:
        if o.type != 'MESH':
            continue
        n += 1
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
            mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
    if n == 0:
        missing.append(kind)
        continue
    refs[kind] = [round(mx.x - mn.x, 3), round(mx.y - mn.y, 3), round(mx.z - mn.z, 3)]
    print('[refs] %-24s %6.2f x %6.2f x %6.2f' % (kind, refs[kind][0], refs[kind][1], refs[kind][2]))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(refs, f, ensure_ascii=False, indent=2, sort_keys=True)
    f.write('\n')
print('[refs] wrote %s（%d 个 kind，缺模型 %d 个：%s）'
      % (os.path.relpath(OUT, ROOT).replace('\\', '/'), len(refs), len(missing), ','.join(missing) or '—'))
