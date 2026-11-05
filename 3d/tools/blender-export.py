# =============================================================
# blender-export.py · 3D 资产导出预设（启航路 3D 版）
# -------------------------------------------------------------
# 目的：把「怎么从 .blend 变成 .glb」固定成脚本，而不是靠人手点导出。
#   · 米制单位 / +Y 上 / 应用修改器 / 应用变换 —— 三条错一条，进引擎就是歪的
#   · 只导网格与骨骼，不导相机、灯光、空物体（灯在引擎里布）
#   · 贴图打进 GLB，避免 Godot 里路径漂移
#
# 用法：
#   # 单文件
#   blender -b 3d/assets/models/device_panel_fix.blend \
#     -P 3d/tools/blender-export.py -- --out 3d/assets/export/device_panel_fix.glb
#
#   # 按清单批量（只导 status = wip / done 且源文件存在的）
#   blender -b -P 3d/tools/blender-export.py -- --manifest 3d/spec/assets.manifest.json --all
#
# 注意：批量模式每导一个文件会 open_mainfile，跑之前先把 Blender 里没存的东西存掉。
# =============================================================
import bpy
import json
import os
import sys

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    if name not in ARGS:
        return default
    i = ARGS.index(name)
    return ARGS[i + 1] if i + 1 < len(ARGS) else default


ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def die(msg):
    print('[3d-export] ERROR ' + msg)
    raise SystemExit(1)


def check_scene():
    """导出前的三条硬检查。宁可停在这里，也不要导出一个进引擎要返工的包。"""
    u = bpy.context.scene.unit_settings
    if u.system != 'METRIC' or abs(u.scale_length - 1.0) > 1e-6:
        die('场景单位不是 米/1.0（当前 %s / %.3f）—— 见 3d/spec/conventions.md §1'
            % (u.system, u.scale_length))
    if bpy.context.scene.render.engine == 'BLENDER_WORKBENCH':
        print('[3d-export] WARN 当前渲染引擎是 Workbench（不影响导出，但材质预览会失真）')


def prep_objects():
    """应用修改器 + 应用变换：引擎里不该再有"缩放 0.01"这种历史包袱。"""
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        die('场景里没有网格')
    for o in meshes:
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            try:
                bpy.ops.object.modifier_apply(modifier=m.name)
            except RuntimeError as e:
                print('[3d-export] WARN 修改器 %s 无法应用（%s）：%s' % (o.name, m.name, e))
        try:
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        except RuntimeError as e:
            print('[3d-export] WARN 变换无法应用（%s）：%s' % (o.name, e))
    bpy.ops.object.select_all(action='DESELECT')


def stats():
    tris = 0
    mats = set()
    for o in bpy.context.scene.objects:
        if o.type != 'MESH':
            continue
        me = o.data
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        for s in o.material_slots:
            if s.material:
                mats.add(s.material.name)
    return tris, len(mats)


def export_one(out_path):
    check_scene()
    prep_objects()
    tris, mats = stats()
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(out_path),
        export_format='GLB',
        use_selection=False,
        export_apply=True,          # 修改器已在上面应用过，这里兜底
        export_yup=True,            # Blender Z-up → glTF/Godot Y-up
        export_cameras=False,
        export_lights=False,
        export_extras=True,         # 自定义属性（资产 id / 交互 socket 名）带进引擎
        export_materials='EXPORT',
        export_image_format='AUTO',
    )
    size = os.path.getsize(out_path) / 1024.0
    return {'out': out_path, 'tris': tris, 'materials': mats, 'kb': round(size, 1)}


def run_manifest(man_path):
    with open(man_path, 'r', encoding='utf-8') as f:
        man = json.load(f)
    results = []
    skipped = []
    for a in man.get('assets', []):
        if a.get('status') not in ('wip', 'done'):
            skipped.append(a['id'] + ':' + a.get('status', '?'))
            continue
        src = os.path.join(ROOT, '3d', 'assets', a['source'])
        out = os.path.join(ROOT, '3d', 'assets', a['export'])
        if not os.path.exists(src):
            skipped.append(a['id'] + ':no-source')
            continue
        bpy.ops.wm.open_mainfile(filepath=src)
        r = export_one(out)
        r['id'] = a['id']
        if a.get('budget', {}).get('tris') and r['tris'] > a['budget']['tris']:
            r['over_budget'] = a['budget']['tris']
        results.append(r)
        print('[3d-export] %s → %s  (%d tris, %.1f KB)' % (a['id'], a['export'], r['tris'], r['kb']))
    print('[3d-export] RESULT ' + json.dumps({'exported': results, 'skipped': skipped}, ensure_ascii=False))
    if any('over_budget' in r for r in results):
        die('有资产超出清单预算，见上面的 over_budget')


def main():
    if '--all' in ARGS:
        run_manifest(arg('--manifest', os.path.join(ROOT, '3d', 'spec', 'assets.manifest.json')))
        return
    out = arg('--out')
    if not out:
        die('缺少 --out <path.glb>，或用 --all --manifest <json>')
    if not os.path.isabs(out):
        out = os.path.join(ROOT, out)
    r = export_one(out)
    print('[3d-export] RESULT ' + json.dumps(r, ensure_ascii=False))


main()
