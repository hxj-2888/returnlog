# =============================================================
# cover-shot.py · 单件掩体特写（排查用）
# -------------------------------------------------------------
# 检查板上 26° 视角看不清某一件时，用它单独出两张：3/4 前视 18° + 正俯视。
# 用法：
#   blender -b -P 3d/tools/cover-shot.py -- armory_ammocrate
# 输出：3d/assets/renders/_shot-<kind>-a.png / -b.png
# =============================================================
import bpy
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import covers_lib as L  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
kind = argv[0]
mod = argv[1] if len(argv) > 1 else 'build-covers-' + kind.split('_')[0]

import importlib.util
_spec = importlib.util.spec_from_file_location(
    'cover_builder', os.path.join(os.path.dirname(os.path.abspath(__file__)), mod + '.py'))
builder_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(builder_mod)
fn = builder_mod.BUILDERS[kind]
rid = kind.split('_')[0]

two = [('a', 18.0), ('b', 78.0)]
for tag, tilt in two:
    L.clear_scene()
    coll = L.new_coll(kind)
    fn(coll, L.palette(rid))
    L.normalize(coll)
    mn, mx = L.bbox(coll)
    cx, cy = (mn.x + mx.x) / 2, (mn.y + mx.y) / 2
    w, d, h = mx.x - mn.x, mx.y - mn.y, mx.z
    bpy.ops.mesh.primitive_plane_add(size=max(w, d) * 3 + 6, location=(cx, cy, -0.004))
    g = bpy.context.object
    g.data.materials.append(L.mat('shot_ground', (0.05, 0.06, 0.07, 1), 0.0, 0.92))
    th = math.radians(tilt)
    dist = max(w, d, h) * 3 + 6
    bpy.ops.object.camera_add(location=(cx, cy - dist * math.sin(th), h * 0.4 + dist * math.cos(th)),
                              rotation=(th, 0, 0))
    cam = bpy.context.object
    cam.rotation_euler = (th, 0, 0)
    cam.data.type = 'ORTHO'
    cam.data.clip_start = 0.1
    cam.data.clip_end = 300
    cam.data.ortho_scale = max(w, d * math.sin(th) + h * math.cos(th)) * 1.25
    bpy.context.scene.camera = cam
    bpy.ops.object.light_add(type='AREA', location=(cx - w, cy - d - 4, h + 5))
    k = bpy.context.object
    k.data.energy = 1800
    k.data.size = max(w, d) * 1.5
    bpy.ops.object.light_add(type='AREA', location=(cx + w, cy + d + 3, h + 3))
    f = bpy.context.object
    f.data.energy = 700
    f.data.size = max(w, d) * 1.2
    sc = bpy.context.scene
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            continue
    sc.view_settings.view_transform = 'Standard'
    sc.eevee.taa_render_samples = 48
    sc.render.resolution_x = 960
    sc.render.resolution_y = 720
    sc.render.image_settings.file_format = 'PNG'
    out = os.path.join(L.RENDER_DIR, '_shot-%s-%s.png' % (kind, tag))
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('SHOT', out, 'w=%.2f d=%.2f h=%.2f' % (w, d, h))
