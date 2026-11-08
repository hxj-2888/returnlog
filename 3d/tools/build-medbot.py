"""医疗无人机 medbot · 高细节 GLB（2026-11-07）。

替换 scene_extras.gd::_drone() 里「一个球 + 一个圆环」的占位体。
语言取自本地 SDXL 医疗参考图：白色喷漆外壳 + 青色发光玻璃医疗舱 +
悬浮环推进器 + 红十字 + 扫描灯；材质走 covers_lib 的 PBR 贴图。

注意：**不走 L.run()** —— 那个会自动跑 shell_pass / sight_extend / 补到 1.70m，
无人机是悬浮体，不该有落地背板。这里只建 + 倒角 + 归一化 + 导出。

用法：blender -b -P 3d/tools/build-medbot.py
"""
import bpy
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import covers_lib as L  # noqa: E402

from mathutils import Vector  # noqa: E402

KIND = 'medbot'
BLEND = os.path.join(L.MODEL_DIR, KIND + '.blend')
OUT = os.path.join(L.EXPORT_DIR, KIND + '.glb')


def build(coll, P):
    # ---- 主体：上下两片压扁椭球，中间一道深色腰带 ----
    L.ico(coll, 'hull_upper', 0.44, 0, 0, 0.30, P['shell'], sub=3, scale=(1, 1, 0.52))
    L.ico(coll, 'hull_lower', 0.40, 0, 0, 0.17, P['white'], sub=3, scale=(1, 1, 0.42))
    L.cyl(coll, 'waist', 0.415, 0.045, 0, 0, 0.245, P['dark'], seg=32)
    L.torus(coll, 'waist_glow', 0.418, 0.012, 0, 0, 0.268, P['glow'], maj=32, mino=6)
    L.cyl(coll, 'underbelly', 0.30, 0.05, 0, 0, 0.02, P['metal'], seg=28)

    # ---- 中央医疗舱：玻璃罩 + 内部药包 + 顶盖 ----
    L.cyl(coll, 'medbay', 0.235, 0.16, 0, 0, 0.44, P['glass'], seg=28)
    L.cyl(coll, 'medbay_rim', 0.248, 0.025, 0, 0, 0.44, P['metal'], seg=28)
    L.cyl(coll, 'medbay_lid', 0.245, 0.035, 0, 0, 0.60, P['shell'], seg=28)
    L.box(coll, 'medkit', 0.24, 0.18, 0.09, 0, 0, 0.47, P['white'])
    L.box(coll, 'medkit_cross_h', 0.16, 0.045, 0.012, 0, -0.093, 0.52, P['red'])
    L.box(coll, 'medkit_cross_v', 0.045, 0.16, 0.012, 0, -0.093, 0.52, P['red'])
    L.cyl(coll, 'medbay_led', 0.24, 0.012, 0, 0, 0.615, P['glow'], seg=28)

    # ---- 四组悬浮推进器 ----
    for k, (sx, sy) in enumerate([(1, 1), (-1, 1), (-1, -1), (1, -1)]):
        cx, cy = sx * 0.52, sy * 0.52
        arm = L.box(coll, 'arm%d' % k, 0.56, 0.075, 0.06,
                    cx * 0.50, cy * 0.50, 0.245, P['metal'])
        arm.rotation_euler.z = math.atan2(cy, cx)
        L.cyl(coll, 'hub%d' % k, 0.10, 0.07, cx, cy, 0.22, P['shell'], seg=20)
        L.torus(coll, 'ring%d' % k, 0.165, 0.032, cx, cy, 0.25,
                P['metal'], maj=24, mino=8)
        L.cyl(coll, 'rotor%d' % k, 0.125, 0.012, cx, cy, 0.245, P['glow'], seg=20)
        for j in range(3):
            blade = L.box(coll, 'blade%d_%d' % (k, j), 0.20, 0.035, 0.008,
                          cx, cy, 0.253, P['steel'])
            blade.rotation_euler.z = j * math.pi / 3
        L.cyl(coll, 'thruster%d' % k, 0.055, 0.06, cx, cy, 0.16,
              P['dark'], seg=14)
        L.cyl(coll, 'thrustglow%d' % k, 0.045, 0.012, cx, cy, 0.155,
              P['glow'], seg=14)

    # ---- 前脸：状态屏、红十字、散热格栅 ----
    fy = -0.415
    L.box(coll, 'screen_bezel', 0.20, 0.03, 0.12, 0, fy, 0.34, P['dark'])
    L.box(coll, 'screen', 0.17, 0.012, 0.095, 0, fy - 0.02, 0.345, P['glow'])
    for k in range(4):
        L.box(coll, 'vent%d' % k, 0.26, 0.012, 0.012,
              0, fy + 0.005, 0.16 + 0.028 * k, P['metal'])
    L.box(coll, 'cross_h', 0.16, 0.02, 0.045, 0.27, -0.30, 0.30, P['red'])
    L.box(coll, 'cross_v', 0.045, 0.02, 0.16, 0.27, -0.30, 0.30, P['red'])

    # ---- 顶部扫描灯与天线 ----
    L.cyl(coll, 'scanner_base', 0.09, 0.05, 0, 0, 0.635, P['metal'], seg=18)
    L.cyl(coll, 'scanner', 0.065, 0.035, 0, 0, 0.685, P['glow'], seg=18)
    L.cyl(coll, 'antenna', 0.012, 0.22, -0.30, 0.20, 0.48, P['steel'], seg=8)
    L.ico(coll, 'antenna_tip', 0.035, -0.30, 0.20, 0.71, P['glow'], sub=1)

    # ---- 底部扫描锥与机械臂 ----
    L.cone(coll, 'scan_cone', 0.13, 0.18, 0, 0, -0.16, P['glow'], seg=16)
    for k, sx in enumerate((-1, 1)):
        L.hcyl(coll, 'claw_arm%d' % k, 0.018, 0.18, sx * 0.20, 0, 0.06,
               P['steel'], axis='x', seg=8)
        L.box(coll, 'claw%d' % k, 0.045, 0.05, 0.09,
              sx * 0.30, 0, 0.01, P['metal'])

    # ---- 尾部推进灯 ----
    for k, sx in enumerate((-1, 1)):
        L.box(coll, 'tail%d' % k, 0.09, 0.02, 0.035,
              sx * 0.16, 0.40, 0.28, P['glow'])


def main():
    L.clear_scene()
    coll = L.new_coll(KIND)
    build(coll, L.palette('med'))
    L.normalize(coll)
    L.bevel_main(coll, width=0.012, max_dim_min=0.16, min_dim_min=0.018,
                 cap_ratio=0.98, segments=3)
    objs = list(coll.objects)
    tris = L.tri_count(objs)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
        export_extras=True, export_materials='EXPORT', export_image_format='AUTO')
    print('[medbot] objects=%d tris=%d %.1f KB -> %s'
          % (len(objs), tris, os.path.getsize(OUT) / 1024.0, OUT))


if __name__ == '__main__':
    main()
