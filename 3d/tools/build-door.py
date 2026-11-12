"""门资产：3D 滑门结构 + 2.5D 门板（2026-11-11 裁定）。

产物：
  door_frame.glb   门框（左右立柱 + 门楣 + 门头 + 螺栓），原点在门洞地面中心
  door_leaf_l.glb  左门扇（0.9 × 0.10 × 2.5 m，原点在门扇中心）
  door_leaf_r.glb  右门扇（同上，右侧半幅贴图）

坐标：Blender +Z 上、+Y 前；导出后 Godot Y 上、-Z 前。
门扇 UV：+Y 面 U=(x+0.45)/0.9、V=(z+1.25)/2.5；-Y 面 U 镜像。
用法：blender -b -P 3d/tools/build-door.py
"""
import bpy
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import covers_lib as L  # noqa: E402
import art_direction_lib as A  # noqa: E402

TEX = A.TEX
DOOR_TEX = os.path.join(TEX, 'door')


def frame_mat():
    return A.tex_mat(
        'door_frame',
        albedo=os.path.join(TEX, 'door_frame_albedo.jpg'),
        normal=os.path.join(TEX, 'door_frame_normal.jpg'),
        metallic=0.15, roughness=0.70, normal_strength=0.7,
    )


def panel_mat(side):
    return A.tex_mat(
        'door_panel_' + side,
        albedo=os.path.join(DOOR_TEX, 'door_panel_%s_albedo.jpg' % side),
        normal=os.path.join(DOOR_TEX, 'door_panel_%s_normal.jpg' % side),
        rough=os.path.join(DOOR_TEX, 'door_panel_%s_rough.jpg' % side),
        emissive=os.path.join(DOOR_TEX, 'door_panel_%s_emissive.png' % side),
        metallic=0.28, roughness=0.68, emission_strength=1.2,
        normal_strength=0.8,
    )


def build_frame(coll):
    m = frame_mat()
    # 立柱：洞宽 1.8 → 立柱中心 ±0.98；截面 0.16 × 0.30；高 3.0
    for sx in (-1.0, 1.0):
        L.box(coll, 'post%d' % (sx > 0), 0.16, 0.30, 3.0, sx * 0.98, 0.0, 0.0, m)
    # 门楣：2.2 × 0.30 × 0.26，底 2.49（门洞高 2.5）
    L.box(coll, 'lintel', 2.2, 0.30, 0.26, 0.0, 0.0, 2.49, m)
    # 门头：补到墙顶 3.0，避免门楣上方一条缝
    L.box(coll, 'header', 2.2, 0.30, 0.25, 0.0, 0.0, 2.75, m)
    # 螺栓：前后两面各 4 颗/柱。不靠贴图，近看有实体凸起。
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            for z in (0.55, 1.15, 1.75, 2.35):
                L.hcyl(coll, 'bolt', 0.025, 0.022, sx * 0.98, sy * 0.155, z, m,
                       axis='y', seg=8)
    L.normalize(coll)


def build_leaf(coll, side):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.active_object
    obj.name = 'door_leaf_' + side
    obj.scale = (0.90, 0.10, 2.50)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)

    pm = panel_mat(side)
    fm = frame_mat()
    obj.data.materials.append(pm)   # 0 = panel
    obj.data.materials.append(fm)   # 1 = edge / frame

    # UV layer
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name='UVMap')
    uv = obj.data.uv_layers.active.data
    for poly in obj.data.polygons:
        n = poly.normal
        if abs(n.y) > 0.5:
            poly.material_index = 0
        else:
            poly.material_index = 1
        for li in poly.loop_indices:
            v = obj.data.vertices[obj.data.loops[li].vertex_index].co
            u = (v.x + 0.45) / 0.90
            if n.y < -0.5:
                u = 1.0 - u
            vv = (v.z + 1.25) / 2.50
            uv[li].uv = (u, vv)

    # 细倒角：只做 4mm，保持薄板硬边但高光有转折
    mod = obj.modifiers.new('bev', 'BEVEL')
    mod.width = 0.004
    mod.segments = 1
    mod.limit_method = 'ANGLE'
    mod.angle_limit = 0.7
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    # 倒角面按相邻面材质保留；UV 由 Blender 插值
    return obj


def main():
    L.clear_scene()
    coll = L.new_coll('door_frame')
    build_frame(coll)
    A.join_meshes(coll, 'door_frame')
    A.export(coll, 'door_frame')

    for side in ('l', 'r'):
        L.clear_scene()
        coll = L.new_coll('door_leaf_' + side)
        build_leaf(coll, side)
        A.export(coll, 'door_leaf_' + side)


if __name__ == '__main__':
    main()
