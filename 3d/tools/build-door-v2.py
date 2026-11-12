"""门资产 v2：真实门洞内衬 + 止口 + 顶部滑轨 + 门板凹槽（2026-11-11）。

裁定不变：3D 滑门结构 + 2.5D 门板。
v1 的门框只是贴在墙洞上的方盒，近看像“贴图模型顶掉”；v2 补齐：
  · 贯穿墙厚的门洞内衬（jamb liner）与双面止口压条；
  · 门楣上方的实体填充 + 顶部滑轨/吊挂件；
  · 门扇改为「核心板 + 双面凹槽面板 + 周边压框」，不再是一块平板；
  · 地面门槛与导向槽。
产物（仍为原文件名，场景无需改路径）：
  door_frame.glb / door_leaf_l.glb / door_leaf_r.glb
用法：blender -b -P 3d/tools/build-door-v2.py
"""
import bpy
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import covers_lib as L  # noqa: E402
import art_direction_lib as A  # noqa: E402

TEX = A.TEX
DOOR_TEX = os.path.join(TEX, 'door')
PANEL_W = 0.78
PANEL_H = 2.30
LEAF_W = 0.90
LEAF_H = 2.44


def frame_mat():
    return A.tex_mat(
        'door_frame',
        albedo=os.path.join(TEX, 'door_frame_albedo.jpg'),
        normal=os.path.join(TEX, 'door_frame_normal.jpg'),
        metallic=0.15, roughness=0.70, normal_strength=0.7,
    )


def dark_mat():
    return A.tex_mat(
        'door_track',
        albedo=os.path.join(TEX, 'door_frame_albedo.jpg'),
        normal=os.path.join(TEX, 'door_frame_normal.jpg'),
        metallic=0.45, roughness=0.52, normal_strength=0.5,
        base=(0.40, 0.42, 0.46, 1.0),
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


def bev(obj, width=0.006, seg=2):
    mod = obj.modifiers.new('bev', 'BEVEL')
    mod.width = width
    mod.segments = seg
    mod.limit_method = 'ANGLE'
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def panel_uvs(obj, fm):
    """面板只让前/后面吃 2.5D 门板图；边缘交给门框材质。UV 落在贴图中央 384×768 区。"""
    me = obj.data
    me.materials.append(fm)
    if me.uv_layers.active is None:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers.active
    for poly in me.polygons:
        n = poly.normal
        if abs(n.y) > 0.5:
            poly.material_index = 0
            for li in poly.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                fu = (co.x + PANEL_W * 0.5) / PANEL_W
                fv = (co.z + PANEL_H * 0.5) / PANEL_H
                if n.y > 0.0:
                    u = 0.25 + 0.5 * fu
                else:
                    u = 0.75 - 0.5 * fu
                uv.data[li].uv = (u, fv)
        else:
            poly.material_index = 1
            for li in poly.loop_indices:
                uv.data[li].uv = (0.5, 0.5)
    return obj


def build_frame(coll):
    fm = frame_mat()
    dm = dark_mat()
    # 门洞内衬：贯穿 0.22m 墙厚，两侧各一根；门洞净宽 1.80
    for sx in (-1.0, 1.0):
        L.box(coll, 'jamb%d' % (sx > 0), 0.06, 0.34, 2.50, sx * 0.92, 0.0, 0.0, fm)
    # 止口压条：双面，两层台阶，比门洞外沿各宽 0.12
    for sy in (-1.0, 1.0):
        for sx in (-1.0, 1.0):
            L.box(coll, 'trim_post_%d_%d' % (sx > 0, sy > 0),
                  0.12, 0.035, 3.00, sx * 1.02, sy * 0.145, 0.0, fm)
            L.box(coll, 'trim_step_%d_%d' % (sx > 0, sy > 0),
                  0.055, 0.025, 2.90, sx * 0.965, sy * 0.170, 0.03, fm)
        L.box(coll, 'trim_head_%d' % (sy > 0), 2.22, 0.035, 0.14,
              0.0, sy * 0.145, 2.495, fm)
    # 门楣上方实体：填到墙顶 3.0，避免门上一条缝
    L.box(coll, 'header', 2.22, 0.34, 0.50, 0.0, 0.0, 2.50, fm)
    # 门楣正面凹板，和柱子分层次
    for sy in (-1.0, 1.0):
        L.box(coll, 'header_inset_%d' % (sy > 0), 1.86, 0.012, 0.30,
              0.0, sy * 0.176, 2.61, dm)
    # 顶部滑轨：藏在门楣下方，门开时可见；两端有端挡
    L.box(coll, 'track', 1.90, 0.10, 0.055, 0.0, -0.06, 2.440, dm)
    for sx in (-1.0, 1.0):
        L.box(coll, 'track_stop_%d' % (sx > 0), 0.06, 0.12, 0.09,
              sx * 0.96, -0.06, 2.415, dm)
    # 门槛 + 导向槽
    L.box(coll, 'threshold', 1.88, 0.34, 0.045, 0.0, 0.0, 0.0, dm)
    L.box(coll, 'guide_slot', 1.80, 0.018, 0.010, 0.0, 0.0, 0.045, dm)
    # 螺栓：只在前/后压条上，近看有实体凸起
    for sy in (-1.0, 1.0):
        for sx in (-1.0, 1.0):
            for z in (0.55, 1.15, 1.75, 2.35):
                L.hcyl(coll, 'bolt', 0.022, 0.020, sx * 1.02, sy * 0.168, z, fm,
                       axis='y', seg=8)
    L.normalize(coll)


def build_leaf(coll, side):
    pm = panel_mat(side)
    fm = frame_mat()
    dm = dark_mat()
    # 核心板（门框材质）——薄但真实存在，不再是一块贴图平板
    core = L.box(coll, 'leaf_core', LEAF_W, 0.070, LEAF_H, 0, 0, -LEAF_H * 0.5, fm)
    bev(core, 0.005, 2)
    # 双面面板：中央凹槽，四周压框
    for sy in (-1.0, 1.0):
        p = L.box(coll, 'panel_%d' % (sy > 0), PANEL_W, 0.020, PANEL_H,
                  0, sy * 0.045, -PANEL_H * 0.5, pm)
        bev(p, 0.003, 1)
        panel_uvs(p, fm)
        # 周边压框（上下左右四条）
        L.box(coll, 'rail_top_%d' % (sy > 0), LEAF_W, 0.030, 0.070,
              0, sy * 0.055, LEAF_H * 0.5 - 0.070, fm)
        L.box(coll, 'rail_bot_%d' % (sy > 0), LEAF_W, 0.030, 0.070,
              0, sy * 0.055, -LEAF_H * 0.5, fm)
        for sx in (-1.0, 1.0):
            L.box(coll, 'rail_side_%d_%d' % (sx > 0, sy > 0),
                  0.070, 0.030, LEAF_H - 0.14, sx * (LEAF_W * 0.5 - 0.035),
                  sy * 0.055, -LEAF_H * 0.5 + 0.07, fm)
    # 顶部吊挂：两个吊架 + 滚轮，滑轨在门楣下
    for sx in (-1.0, 1.0):
        L.box(coll, 'hanger_%d' % (sx > 0), 0.060, 0.090, 0.090,
              sx * 0.25, -0.040, LEAF_H * 0.5 - 0.060, fm)
        L.box(coll, 'hanger_arm_%d' % (sx > 0), 0.040, 0.120, 0.040,
              sx * 0.25, -0.085, LEAF_H * 0.5 - 0.020, dm)
        L.hcyl(coll, 'roller_%d' % (sx > 0), 0.024, 0.050,
               sx * 0.25, -0.125, LEAF_H * 0.5 - 0.005, dm, axis='x', seg=10)
    # 底部导向块 + 中缝密封条
    L.box(coll, 'guide_shoe', 0.110, 0.060, 0.040, 0.0, 0.0, -LEAF_H * 0.5 - 0.015, dm)
    for sx in (-1.0, 1.0):
        L.box(coll, 'seal_%d' % (sx > 0), 0.012, 0.036, PANEL_H,
              sx * (LEAF_W * 0.5 - 0.006), 0.0, -PANEL_H * 0.5, dm)


def main():
    L.clear_scene()
    coll = L.new_coll('door_frame')
    build_frame(coll)
    L.normalize(coll)
    frame = A.join_meshes(coll, 'door_frame')
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.select_all(action='DESELECT')
    frame.select_set(True)
    bpy.context.view_layer.objects.active = frame
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    A.export(coll, 'door_frame')

    for side in ('l', 'r'):
        L.clear_scene()
        coll = L.new_coll('door_leaf_' + side)
        build_leaf(coll, side)
        leaf = A.join_meshes(coll, 'door_leaf_' + side)
        # 门扇原点保持在中心：场景会把它抬到 1.25 m，再沿滑轨左右移动。
        bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
        bpy.ops.object.select_all(action='DESELECT')
        leaf.select_set(True)
        bpy.context.view_layer.objects.active = leaf
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        A.export(coll, 'door_leaf_' + side)


if __name__ == '__main__':
    main()
