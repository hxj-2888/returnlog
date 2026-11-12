"""工业天花板套件（2026-11-11 裁定：天花板采用工业材质）。

产物（每个 3 m 一段，原点在底/长度中心，Godot 侧沿房间长轴实例化）：
  ceiling_beam.glb   工字钢主/次梁，3.0 × 0.12 × 0.18 m
  ceiling_pipe.glb   金属管 + 卡箍，3.0 m
  ceiling_tray.glb   开槽电缆桥架，3.0 × 0.24 × 0.07 m
用法：blender -b -P 3d/tools/build-ceiling-kit.py
"""
import bpy
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import covers_lib as L  # noqa: E402
import art_direction_lib as A  # noqa: E402

TEX = A.TEX


def mat_beam():
    return A.tex_mat('ceiling_beam',
                     albedo=os.path.join(TEX, 'ceiling-beam_albedo.jpg'),
                     normal=os.path.join(TEX, 'ceiling-beam_normal.jpg'),
                     metallic=0.35, roughness=0.65, normal_strength=0.7)


def mat_pipe():
    return A.tex_mat('ceiling_pipe',
                     albedo=os.path.join(TEX, 'ceiling-pipe_albedo.jpg'),
                     normal=os.path.join(TEX, 'ceiling-pipe_normal.jpg'),
                     metallic=0.45, roughness=0.60, normal_strength=0.6)


def build_beam(coll):
    m = mat_beam()
    # 3m 段沿房间跨度缩放使用：截面保持，长度方向不能有会被拉长的螺栓/端板。
    L.box(coll, 'flange_top', 3.0, 0.12, 0.03, 0.0, 0.0, 0.15, m)
    L.box(coll, 'flange_bottom', 3.0, 0.12, 0.03, 0.0, 0.0, 0.0, m)
    L.box(coll, 'web', 3.0, 0.03, 0.12, 0.0, 0.0, 0.03, m)
    L.normalize(coll)


def build_pipe(coll):
    m = mat_pipe()
    # 连续管沿长轴缩放；不挂卡箍，避免缩放后变成拉长的方块。
    L.hcyl(coll, 'pipe', 0.035, 3.0, 0.0, 0.0, 0.035, m, axis='x', seg=14)
    L.normalize(coll)


def build_tray(coll):
    m = mat_beam()
    # 连续桥架：两侧轨 + 底槽，沿长轴缩放；横档在缩放后会拉长，故不进网格。
    L.box(coll, 'rail_l', 3.0, 0.015, 0.07, 0.0, -0.12, 0.0, m)
    L.box(coll, 'rail_r', 3.0, 0.015, 0.07, 0.0, 0.12, 0.0, m)
    L.box(coll, 'bottom', 3.0, 0.24, 0.01, 0.0, 0.0, 0.0, m)
    L.normalize(coll)


def main():
    for name, fn in (('ceiling_beam', build_beam),
                     ('ceiling_pipe', build_pipe),
                     ('ceiling_tray', build_tray)):
        L.clear_scene()
        coll = L.new_coll(name)
        fn(coll)
        A.join_meshes(coll, name)
        A.export(coll, name)


if __name__ == '__main__':
    main()
