# =============================================================
# build-crew-blockout.py · 船员 3D 体块（blockout）验证件
# -------------------------------------------------------------
# 目的：先验证 1.75 m 人物在真实舱室里的比例/剪影，不在体块阶段做绑定。
# 产物：3d/assets/models/char_crew_blockout.blend
#       3d/assets/export/char_crew_blockout.glb
# 约定：米制 / +Y 前 / +Z 上 / 底面中心为原点 / 三材质 / 无骨骼。
# 用法：
#   "E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b \
#     -P 3d/tools/build-crew-blockout.py
# =============================================================
import bpy
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS = os.path.join(ROOT, '3d', 'assets', 'models')
EXPORTS = os.path.join(ROOT, '3d', 'assets', 'export')
ASSET_ID = 'char_crew_blockout'

if tuple(bpy.app.version[:2]) < (5, 2):
    raise SystemExit('[crew-blockout] 需要 Blender 5.2+（权威版 5.2.2 LTS）')


def material(name, color, metallic=0.0, rough=0.7):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    for node in mat.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            node.inputs['Base Color'].default_value = color
            node.inputs['Metallic'].default_value = metallic
            node.inputs['Roughness'].default_value = rough
            break
    return mat


def _finish(obj, mat, bevel=0.0):
    obj.data.materials.append(mat)
    if bevel > 0.0:
        mod = obj.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return obj


def box(name, size, center, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    return _finish(obj, mat, bevel)


def sphere(name, radius, center, mat, segments=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings,
                                        radius=radius, location=center)
    obj = bpy.context.active_object
    obj.name = name
    return _finish(obj, mat)


def cyl(name, radius, depth, center, mat, verts=8):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=center)
    obj = bpy.context.active_object
    obj.name = name
    return _finish(obj, mat)


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return obj


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0

    suit = material('crew_suit', (0.30, 0.36, 0.44, 1.0), metallic=0.05, rough=0.72)
    gear = material('crew_gear', (0.10, 0.12, 0.16, 1.0), metallic=0.45, rough=0.42)
    skin = material('crew_skin', (0.62, 0.45, 0.34, 1.0), metallic=0.0, rough=0.62)

    s, g, k = [], [], []

    # 躯干 / 骨盆 / 颈：1.06–1.50 是胸腹，0.90–1.06 是骨盆
    s.append(box('torso', (0.34, 0.22, 0.44), (0.0, 0.0, 1.28), suit, 0.018))
    s.append(box('pelvis', (0.30, 0.20, 0.16), (0.0, 0.0, 0.98), suit, 0.012))
    k.append(box('neck', (0.11, 0.11, 0.06), (0.0, 0.0, 1.515), skin))
    # 头：底部 1.54 / 顶部 1.75；脸用皮肤材质，头发/眼带用装备材质
    k.append(sphere('head', 0.105, (0.0, 0.0, 1.645), skin))
    g.append(box('hair_cap', (0.19, 0.15, 0.07), (0.0, -0.015, 1.715), gear))
    g.append(box('eye_band', (0.13, 0.02, 0.028), (0.0, 0.100, 1.665), gear))
    k.append(box('nose', (0.025, 0.035, 0.035), (0.0, 0.108, 1.635), skin))
    g.append(box('collar', (0.20, 0.18, 0.05), (0.0, 0.0, 1.495), gear))

    # 肩 / 臂 / 手（正面 +Y，手臂自然下垂；圆柱四肢更像人）
    for sx in (-1.0, 1.0):
        side = 'L' if sx < 0 else 'R'
        s.append(box('shoulder_%s' % side, (0.12, 0.18, 0.12),
                     (0.18 * sx, 0.0, 1.44), suit, 0.012))
        s.append(cyl('upper_arm_%s' % side, 0.055, 0.30,
                     (0.205 * sx, 0.0, 1.28), suit))
        s.append(cyl('forearm_%s' % side, 0.048, 0.28,
                     (0.215 * sx, 0.0, 1.00), suit))
        g.append(box('glove_%s' % side, (0.09, 0.11, 0.12),
                     (0.215 * sx, 0.0, 0.81), gear))

    # 腿 / 靴（脚底 z=0）
    for sx in (-1.0, 1.0):
        side = 'L' if sx < 0 else 'R'
        s.append(cyl('thigh_%s' % side, 0.080, 0.42, (0.095 * sx, 0.0, 0.73), suit))
        s.append(cyl('shin_%s' % side, 0.062, 0.40, (0.095 * sx, 0.0, 0.32), suit))
        g.append(box('boot_%s' % side, (0.15, 0.28, 0.12),
                     (0.095 * sx, 0.04, 0.06), gear, 0.008))

    # 装备：腰带 / 胸板 / 背包 / 肩带
    g.append(box('belt', (0.34, 0.235, 0.06), (0.0, 0.0, 0.945), gear, 0.006))
    g.append(box('chest_plate', (0.15, 0.02, 0.10), (0.0, 0.122, 1.34), gear))
    g.append(box('backpack', (0.24, 0.12, 0.30), (0.0, -0.17, 1.28), gear, 0.012))
    for sx in (-1.0, 1.0):
        g.append(box('strap_%s' % ('L' if sx < 0 else 'R'),
                     (0.03, 0.02, 0.34), (0.085 * sx, 0.122, 1.30), gear))

    suit_obj = join(s, 'crew_suit')
    gear_obj = join(g, 'crew_gear')
    skin_obj = join(k, 'crew_skin')

    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
    root = bpy.context.active_object
    root.name = ASSET_ID
    for obj in (suit_obj, gear_obj, skin_obj):
        obj.parent = root

    # 统计与高度（导出前打印，便于和资产清单对账）
    deps = bpy.context.evaluated_depsgraph_get()
    tris = 0
    lo, hi = 1e9, -1e9
    for obj in (suit_obj, gear_obj, skin_obj):
        me = obj.evaluated_get(deps).to_mesh()
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        for v in me.vertices:
            w = obj.matrix_world @ v.co
            lo = min(lo, w.z)
            hi = max(hi, w.z)
    print('CREW_BLOCKOUT tris=%d height=%.3f materials=%d' % (
        tris, hi - lo, len(bpy.data.materials)), flush=True)

    os.makedirs(MODELS, exist_ok=True)
    os.makedirs(EXPORTS, exist_ok=True)
    blend_path = os.path.join(MODELS, ASSET_ID + '.blend')
    glb_path = os.path.join(EXPORTS, ASSET_ID + '.glb')
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
    )
    print('CREW_BLOCKOUT_OUT %s %s' % (blend_path, glb_path), flush=True)


if __name__ == '__main__':
    build()
