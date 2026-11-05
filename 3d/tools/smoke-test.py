# =============================================================
# smoke-test.py · 导出预演自检（在 Blender 里跑）
# -------------------------------------------------------------
# 目的：不依赖任何真实资产，验证 3d/tools/blender-export.py 这条管线能跑通：
#   单位检查 / 修改器应用 / 变换应用 / GLB 落地 / 面数统计。
# 真资产到位前，用它来确认 Blender 版本、glTF 插件、脚本参数都还有效。
#
# 用法：
#   blender -b -P 3d/tools/smoke-test.py
# 成功时打印 [3d-export] RESULT {...} 并退出码 0。
# =============================================================
import bpy
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

# 造一个「缩放不为一 + 带修改器」的立方体，专门验证 prep_objects 会不会把它压平
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_cube_add(size=2.0, location=(0, 0, 1))
cube = bpy.context.object
cube.name = 'smoke_cube'
cube.scale = (0.5, 2.0, 1.0)
sub = cube.modifiers.new('smoke_bevel', 'BEVEL')
sub.width = 0.05
sub.segments = 1

scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

out = os.path.join(tempfile.gettempdir(), 'returnlog-3d-smoke.glb')
sys.argv = [sys.argv[0], '--', '--out', out]

# 直接执行导出脚本（它会读 sys.argv 里的 --）
with open(os.path.join(HERE, 'blender-export.py'), 'r', encoding='utf-8') as f:
    code = f.read()
exec(compile(code, 'blender-export.py', 'exec'), {'__name__': '__main__', '__file__': os.path.join(HERE, 'blender-export.py')})

if not os.path.exists(out):
    print('[3d-smoke] ERROR 没有生成 GLB')
    raise SystemExit(1)
size = os.path.getsize(out)
print('[3d-smoke] OK %s (%d bytes)' % (out, size))
