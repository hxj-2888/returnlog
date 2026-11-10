# =============================================================
# build-covers-med.py · 医疗间 7 类的掩体本体（Blender 5.2.2）
# -------------------------------------------------------------
# 用法：
#   "E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b \
#     -P 3d/tools/build-covers-med.py
#
# 口径同仓库批：按 map_v2 里该 kind 的最常见 w×h 建真实尺寸，高度取档位。
# 医疗间的辨识点是**冷白 + 青色灯带**（theme.glow 0.42/0.86/0.98），
# 所以发光面只在“设备在报数”的地方（监护屏、门观察窗、指示灯），不要满铺。
# =============================================================
import bpy
import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import covers_lib as L  # noqa: E402


def surgery(coll, P):
    """手术台：基座 + 立柱 + 床体 + 双侧护栏 + 头端监护屏 + 侧挂器械盘。

    高度只有 1.30（anchor 档），装不下真正的吊顶无影灯 —— 第一版把灯盘放到 0.98，
    正好嵌进床垫里（实机截图一眼看出）。这一版改成「床 + 监护 + 器械盘」，
    所有部件都在 1.30 以内，且床面必须**坐在立柱上**，不能悬空。"""
    W, D = L.ref_footprint('med_surgery')
    H = L.TIER_H['anchor']
    cx = -0.20
    table_top = 0.86
    L.box(coll, 'plinth', W * 0.30, D * 0.38, 0.10, cx, 0, 0.0, P['dark'])
    for sx in (-1, 1):
        for sy in (-1, 1):
            L.box(coll, 'pad%d%d' % (sx + 1, sy + 1), 0.24, 0.24, 0.04,
                  cx + sx * (W * 0.30 / 2 - 0.14), sy * (D * 0.38 / 2 - 0.14), 0.0, P['rubber'])
    L.box(coll, 'column', W * 0.20, D * 0.26, table_top - 0.10, cx, 0, 0.10, P['metal'])
    L.box(coll, 'frame', W * 0.74, D * 0.54, 0.08, cx, 0, table_top, P['steel'])
    L.box(coll, 'mattress', W * 0.70, D * 0.50, 0.10, cx, 0, table_top + 0.08, P['white'])
    L.box(coll, 'headrest', W * 0.12, D * 0.30, 0.05, cx - W * 0.30, 0, table_top + 0.18, P['fabric'])
    # 双侧护栏：立柱 + 两根横杆，全部高于床面
    for sy in (-1, 1):
        y = sy * (D * 0.28)
        for sx in (-1, 1):
            L.cyl(coll, 'rpost%d%d' % (sy + 1, sx + 1), 0.022, 0.30,
                  cx + sx * W * 0.28, y, table_top + 0.06, P['steel'], seg=6)
        for k in range(2):
            L.box(coll, 'rail%d_%d' % (sy + 1, k), W * 0.58, 0.025, 0.025, cx, y,
                  table_top + 0.16 + 0.10 * k, P['steel'])
    # 头端监护屏：立杆从地面起，屏在 1.02~1.28
    px = cx - W * 0.42
    L.cyl(coll, 'vitalpole', 0.032, H - 0.04, px, -D * 0.20, 0.0, P['metal'], seg=8)
    L.box(coll, 'vital', 0.36, 0.05, 0.26, px + 0.16, -D * 0.20, H - 0.28, P['dark'])
    L.box(coll, 'vitalglow', 0.30, 0.02, 0.20, px + 0.16, -D * 0.225, H - 0.26, P['glow'])
    # 侧挂器械盘：短臂 + 盘 + 三件器械
    L.box(coll, 'trayarm', 0.06, 0.34, 0.05, cx + W * 0.34, -D * 0.34, table_top + 0.14, P['metal'])
    L.box(coll, 'tray', 0.46, 0.30, 0.04, cx + W * 0.34, -D * 0.46, table_top + 0.14, P['steel'])
    for i in range(3):
        L.box(coll, 'tool%d' % i, 0.035, 0.14, 0.02, cx + W * 0.26 + 0.08 * i,
              -D * 0.46, table_top + 0.18, P['steel'])


def monitor(coll, P):
    """床旁监护仪（0.55 档）：底盘 + 短立柱 + 显示屏 + 绕线。"""
    W, D = L.ref_footprint('med_monitor')
    H = L.TIER_H['accent']
    L.box(coll, 'base', W * 0.80, D * 0.70, 0.04, 0, 0, 0.0, P['dark'])
    for sx in (-1, 1):
        L.cyl(coll, 'wheel%d' % (sx + 1), 0.045, 0.04, sx * W * 0.30, 0, 0.0, P['rubber'], seg=10)
    L.cyl(coll, 'pole', 0.035, H - 0.20, 0, 0, 0.04, P['metal'], seg=8)
    L.box(coll, 'body', W * 0.86, 0.16, H * 0.52, 0, 0, H * 0.40, P['dark'])
    L.box(coll, 'screen', W * 0.70, 0.02, H * 0.34, 0, -0.085, H * 0.47, P['glow'])
    L.box(coll, 'bezel', W * 0.90, 0.04, 0.04, 0, -0.07, H * 0.36, P['steel'])
    for i in range(3):
        L.box(coll, 'btn%d' % i, 0.05, 0.02, 0.03, -0.10 + 0.10 * i, -0.09, H * 0.12, P['mark'])
    L.torus(coll, 'cable', 0.09, 0.012, W * 0.20, 0.06, H * 0.55, P['rubber'],
            maj=12, mino=5, rot=(math.pi / 2, 0, 0))
    L.depth_ext(coll, P, 'med_monitor')

def ventilator(coll, P):
    """呼吸机（0.55 档）：推车 + 斜屏 + 双气瓶 + 管路 + 脚轮。"""
    W, D = L.ref_footprint('med_ventilator')
    H = L.TIER_H['accent']
    L.box(coll, 'cart', W * 0.92, D * 0.74, H * 0.58, 0, 0, 0.06, P['dark'])
    L.box(coll, 'top', W * 0.96, D * 0.78, 0.05, 0, 0, H * 0.64, P['steel'])
    for sx in (-1, 1):
        for sy in (-1, 1):
            L.cyl(coll, 'wheel%d%d' % (sx + 1, sy + 1), 0.05, 0.05,
                  sx * W * 0.36, sy * D * 0.28, 0.0, P['rubber'], seg=10)
    plate = L.box(coll, 'screenbody', W * 0.60, 0.06, H * 0.34, -0.06, -D * 0.20, H * 0.70, P['dark'])
    glow = L.box(coll, 'screenglow', W * 0.50, 0.02, H * 0.26, -0.06, -D * 0.235, H * 0.735, P['glow'])
    L.pivot_rotate([plate, glow], Vector((-0.06, -D * 0.20, H * 0.70)), 'X', -12)
    for i in range(2):
        L.cyl(coll, 'bottle%d' % i, 0.09, H * 0.62, W * 0.34, (i - 0.5) * D * 0.34,
              0.08, P['metal'], seg=12)
        L.cyl(coll, 'bottletop%d' % i, 0.05, 0.05, W * 0.34, (i - 0.5) * D * 0.34,
              H * 0.70, P['mark'], seg=8)
    L.torus(coll, 'tube', 0.14, 0.018, -W * 0.18, D * 0.30, H * 0.45, P['white'],
            maj=14, mino=5, rot=(math.pi / 2, 0, 0))
    L.box(coll, 'arm', 0.06, 0.06, H * 0.34, -W * 0.34, D * 0.24, H * 0.30, P['metal'])


def bed(coll, P):
    """病床：床架 + 床垫 + 头尾板 + 两侧护栏 + 折叠毯 + 输液架。"""
    W, D = L.ref_footprint('med_bed')
    H = L.TIER_H['mid']
    # 床沿 2.2 长、1.4 宽，两侧留 0.5 给护栏与床头柜位
    bw, bd = W * 0.80, D * 0.58
    L.box(coll, 'frame', bw, bd, 0.14, 0, 0, H - 0.44, P['metal'])
    for sx in (-1, 1):
        for sy in (-1, 1):
            L.box(coll, 'leg%d%d' % (sx + 1, sy + 1), 0.07, 0.07, H - 0.44,
                  sx * (bw / 2 - 0.08), sy * (bd / 2 - 0.08), 0.0, P['metal'])
    L.box(coll, 'mattress', bw - 0.10, bd - 0.06, 0.16, 0, 0, H - 0.30, P['white'])
    L.box(coll, 'pillow', 0.42, bd * 0.62, 0.10, -bw / 2 + 0.30, 0, H - 0.14, P['fabric'])
    L.box(coll, 'blanket', 0.62, bd * 0.56, 0.06, bw / 2 - 0.42, 0, H - 0.12, P['fabric'])
    # 头尾板
    for sx in (-1, 1):
        L.box(coll, 'board%d' % (sx + 1), 0.06, bd * 0.92, 0.30,
              sx * (bw / 2 + 0.03), 0, H - 0.30, P['dark'])
    # 护栏：每侧两根横杆 + 两端立柱
    # 护栏立在床沿上、高于床垫（床垫顶 H-0.14）：第一版从 H-0.42 起，
    # 整排栏杆埋在床垫里，实机上等于没有护栏。
    for sy in (-1, 1):
        y = sy * (bd / 2 + 0.09)
        for sx in (-1, 1):
            L.cyl(coll, 'railpost%d%d' % (sy + 1, sx + 1), 0.022, 0.26,
                  sx * bw * 0.28, y, H - 0.22, P['steel'], seg=6)
        for k in range(2):
            L.box(coll, 'rail%d_%d' % (sy + 1, k), bw * 0.62, 0.025, 0.025, 0,
                  y, H - 0.10 + 0.09 * k, P['steel'])
    # 输液架（头端外侧）+ 药袋
    px = -bw / 2 - 0.22
    L.cyl(coll, 'ivpole', 0.022, H - 0.02, px, -bd * 0.30, 0.0, P['steel'], seg=8)
    L.box(coll, 'ivarm', 0.20, 0.03, 0.03, px + 0.09, -bd * 0.30, H - 0.08, P['steel'])
    L.box(coll, 'ivbag', 0.16, 0.06, 0.20, px + 0.17, -bd * 0.30, H - 0.30, P['glass'])
    L.box(coll, 'ivglow', 0.10, 0.02, 0.05, px + 0.17, -bd * 0.33, H - 0.24, P['glow'])
    # 床下抽屉
    L.box(coll, 'drawer', bw * 0.40, bd * 0.50, 0.14, bw * 0.20, 0, H - 0.60, P['dark'])
    L.depth_ext(coll, P, 'med_bed')

def medcab(coll, P):
    """药品柜：柜体 + 双开玻璃门 + 三层药瓶 + 侧抽屉组 + 台面。"""
    W, D = L.ref_footprint('med_medcab')
    H = L.TIER_H['mid']
    L.box(coll, 'body', W * 0.72, D * 0.86, H - 0.06, -W * 0.12, 0, 0.0, P['dark'])
    L.box(coll, 'top', W * 0.74, D * 0.90, 0.05, -W * 0.12, 0, H - 0.06, P['steel'])
    # 玻璃门 + 门框
    for sy in (-1, 1):
        L.box(coll, 'door%d' % (sy + 1), W * 0.68, 0.03, H - 0.16, -W * 0.12,
              sy * (D * 0.86 / 2 + 0.005), 0.05, P['glass'])
        L.box(coll, 'frame%d' % (sy + 1), W * 0.68, 0.02, 0.05, -W * 0.12,
              sy * (D * 0.86 / 2 + 0.02), 0.05, P['metal'])
        L.box(coll, 'handle%d' % (sy + 1), 0.03, 0.04, 0.22, -W * 0.12,
              sy * (D * 0.86 / 2 + 0.03), H * 0.52, P['steel'])
    # 柜内三层（从玻璃透出来的药瓶）
    for li in range(3):
        z = 0.10 + (H - 0.24) / 3 * li
        L.box(coll, 'shelf%d' % li, W * 0.64, D * 0.70, 0.03, -W * 0.12, 0, z, P['steel'])
        for k in range(6):
            L.cyl(coll, 'vial%d_%d' % (li, k), 0.028, 0.10,
                  -W * 0.12 - W * 0.26 + k * W * 0.10, 0, z + 0.03,
                  P['mark'] if (li + k) % 3 == 0 else P['white'], seg=6)
        L.box(coll, 'shelfglow%d' % li, W * 0.62, 0.015, 0.012, -W * 0.12,
              -D * 0.30, z + 0.035, P['glow'])
    # 侧抽屉组
    for i in range(3):
        L.box(coll, 'drawer%d' % i, W * 0.24, D * 0.80, (H - 0.20) / 3 - 0.03,
              W * 0.30, 0, 0.06 + ((H - 0.20) / 3) * i, P['metal'])
        L.box(coll, 'pull%d' % i, 0.14, 0.03, 0.03, W * 0.30, -D * 0.42,
              0.06 + ((H - 0.20) / 3) * i + 0.10, P['steel'])
    L.box(coll, 'label', W * 0.20, 0.02, 0.05, W * 0.30, -D * 0.44, H - 0.14, P['mark'])


def sterilizer(coll, P):
    """灭菌柜：柜体 + 圆形舱门 + 观察窗 + 双表 + 排气管 + 取物托盘。"""
    W, D = L.ref_footprint('med_sterilizer')
    H = L.TIER_H['mid']
    L.box(coll, 'body', W * 0.90, D * 0.86, H - 0.10, -W * 0.04, 0, 0.0, P['dark'])
    L.box(coll, 'top', W * 0.92, D * 0.90, 0.06, -W * 0.04, 0, H - 0.10, P['metal'])
    # 圆形舱门：沿 Y 躺的圆柱，压在柜体正面
    L.hcyl(coll, 'door', 0.34, 0.10, -W * 0.16, -D * 0.44, H * 0.58, P['steel'], axis='y', seg=20)
    L.hcyl(coll, 'window', 0.22, 0.03, -W * 0.16, -D * 0.49, H * 0.58, P['glow'], axis='y', seg=20)
    L.box(coll, 'handle', 0.05, 0.06, 0.26, -W * 0.16 + 0.40, -D * 0.47, H * 0.46, P['mark'])
    for sx in (-1, 1):
        L.cyl(coll, 'hinge%d' % (sx + 1), 0.035, 0.10, -W * 0.16 + sx * 0.36,
              -D * 0.47, H * 0.58 - 0.24, P['metal'], seg=8, )
    # 双表 + 面板（门右侧）
    for i in range(2):
        L.hcyl(coll, 'gauge%d' % i, 0.09, 0.03, W * 0.28, -D * 0.45,
               H * 0.66 - 0.22 * i, P['white'], axis='y', seg=12)
        L.hcyl(coll, 'needle%d' % i, 0.012, 0.04, W * 0.28, -D * 0.465,
               H * 0.66 - 0.22 * i, P['red'], axis='y', seg=6)
    L.box(coll, 'panel', 0.26, 0.02, 0.16, W * 0.28, -D * 0.455, H * 0.20, P['glow'])
    # 排气管：从顶面折向舱壁
    L.cyl(coll, 'vent', 0.05, 0.10, -W * 0.36, D * 0.24, H - 0.13, P['metal'], seg=8)
    L.hcyl(coll, 'ventel', 0.05, 0.26, -W * 0.36 + 0.13, D * 0.24, H - 0.05, P['metal'], axis='x', seg=8)
    # 取物托盘
    L.box(coll, 'outtray', W * 0.30, D * 0.34, 0.05, W * 0.30, -D * 0.36, H * 0.52, P['steel'])
    L.box(coll, 'outglow', W * 0.26, D * 0.30, 0.01, W * 0.30, -D * 0.36, H * 0.52 + 0.05, P['glow'])


def supplycart(coll, P):
    """耗材车：三层台面 + 四立柱 + 抽屉 + 推手 + 脚轮 + 码放的耗材盒。"""
    W, D = L.ref_footprint('med_supplycart')
    H = L.TIER_H['mid']
    levels = [0.18, 0.50, H - 0.20]
    for sx in (-1, 1):
        for sy in (-1, 1):
            L.cyl(coll, 'post%d%d' % (sx + 1, sy + 1), 0.028, H,
                  sx * (W / 2 - 0.10), sy * (D / 2 - 0.10), 0.0, P['steel'], seg=8)
    for i, z in enumerate(levels):
        L.box(coll, 'shelf%d' % i, W - 0.14, D - 0.14, 0.04, 0, 0, z, P['metal'])
        L.box(coll, 'lip%d' % i, W - 0.14, 0.03, 0.05, 0, -(D / 2 - 0.07), z + 0.04, P['dark'])
    # 顶层：两摞耗材盒 + 一个托盘
    for i in range(2):
        for j in range(2):
            L.box(coll, 'box%d%d' % (i, j), 0.40, 0.34, 0.12,
                  -W * 0.24 + i * 0.46, -0.12 + j * 0.36, levels[2] + 0.04,
                  P['white'] if (i + j) % 2 == 0 else P['card'])
    L.box(coll, 'tray', 0.52, 0.40, 0.04, W * 0.28, 0.10, levels[2] + 0.04, P['steel'])
    for i in range(3):
        L.cyl(coll, 'bottle%d' % i, 0.05, 0.14, W * 0.16 + 0.10 * i, 0.10,
              levels[2] + 0.08, P['glass'], seg=8)
    # 中层：抽屉组
    for i in range(2):
        L.box(coll, 'drawer%d' % i, W * 0.44, D * 0.80, 0.12,
              -W * 0.24, 0, levels[1] + 0.04 + 0.14 * i, P['dark'])
        L.box(coll, 'pull%d' % i, 0.16, 0.03, 0.02, -W * 0.24, -D * 0.42,
              levels[1] + 0.10 + 0.14 * i, P['steel'])
    # 推手 + 脚轮
    L.hcyl(coll, 'push', 0.025, W * 0.80, 0, -(D / 2 - 0.02), H - 0.06, P['steel'], axis='x', seg=8)
    for sx in (-1, 1):
        L.cyl(coll, 'pushleg%d' % (sx + 1), 0.022, 0.12, sx * W * 0.38, -(D / 2 - 0.03),
              H - 0.18, P['steel'], seg=6)
    for sx in (-1, 1):
        for sy in (-1, 1):
            L.cyl(coll, 'wheel%d%d' % (sx + 1, sy + 1), 0.055, 0.04,
                  sx * (W / 2 - 0.10), sy * (D / 2 - 0.10), 0.0, P['rubber'], seg=10)


BUILDERS = {
    'med_surgery': surgery,
    'med_monitor': monitor,
    'med_ventilator': ventilator,
    'med_bed': bed,
    'med_medcab': medcab,
    'med_sterilizer': sterilizer,
    'med_supplycart': supplycart,
}

if __name__ == '__main__':
    L.run('med', BUILDERS, tag='med')
