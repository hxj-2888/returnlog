# =============================================================
# build-covers-armory.py · 军械库 6 类的掩体本体（Blender 5.2.2）
# -------------------------------------------------------------
# 用法：
#   "E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b \
#     -P 3d/tools/build-covers-armory.py
#
# 口径同仓库/医疗批：按 map_v2 里该 kind 的最常见 w×h 建真实尺寸，高度取档位。
# 军械库的辨识点是**枪 + 弹药 + 琥珀色警示条**：枪架必须有枪，弹药箱必须有箱盖与标条，
# 否则和仓库货架看不出区别（这一舱和仓库最容易“串味”，所以每件都带一件标志物）。
# =============================================================
import bpy
import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import covers_lib as L  # noqa: E402


def _rifle(coll, P, name, x, y, z, length=0.92, rot=0.0):
    """一把低模步枪：机匣 + 枪管 + 弹匣 + 枪托 + 瞄具。沿 X 躺、枪口朝 +X。
    单独成函数是因为枪架/工作台/发放台三处都要用，尺寸稍改就会“像一根棍”。"""
    parts = [
        L.box(coll, name + '_recv', length * 0.34, 0.055, 0.075, x, y, z, P['dark']),
        L.hcyl(coll, name + '_barrel', 0.016, length * 0.46, x + length * 0.30, y,
               z + 0.062, P['steel'], axis='x', seg=6),
        L.box(coll, name + '_mag', 0.07, 0.045, 0.13, x - length * 0.02, y, z - 0.05, P['metal']),
        L.box(coll, name + '_stock', length * 0.22, 0.05, 0.065, x - length * 0.28, y, z + 0.005,
              P['metal']),
        L.box(coll, name + '_sight', 0.10, 0.03, 0.03, x + length * 0.02, y, z + 0.085, P['mark']),
    ]
    if abs(rot) > 1e-6:
        L.pivot_rotate(parts, Vector((x, y, z)), 'Z', rot)
    return parts


def gunrack(coll, P):
    """枪架：背板 + 立柱 + 三层枪位（步枪斜靠）+ 下层弹药箱 + 顶部警示灯带。"""
    W, D = L.ref_footprint('armory_gunrack')
    H = L.TIER_H['anchor']
    # 框架：两根边柱 + 顶梁 + 背板（背板只到 0.9，留出上方的通透感）
    for sx in (-1, 1):
        L.box(coll, 'post%d' % (sx + 1), 0.08, D * 0.9, H, sx * (W / 2 - 0.05), 0, 0.0, P['metal'])
    L.box(coll, 'back', W - 0.12, 0.05, H * 0.62, 0, D / 2 - 0.04, 0.20, P['dark'])
    # 顶梁只做两根（整块顶板从上方看会把三层枪全挡住 —— 仓库货架踩过同一个坑）
    for sy in (-1, 1):
        L.box(coll, 'toprail%d' % (sy + 1), W, 0.08, 0.08, 0, sy * (D * 0.40), H - 0.08, P['metal'])
    L.box(coll, 'strip', W - 0.20, 0.04, 0.03, 0, -D / 2 + 0.06, H - 0.14, P['glow'])
    # 三层枪位：每层 7 把，枪口朝 -Y（朝玩家），靠背板斜放
    levels = [0.30, 0.66, 1.00]
    for li, z in enumerate(levels):
        L.box(coll, 'shelf%d' % li, W - 0.14, D * 0.52, 0.04, 0, -D * 0.10, z, P['metal'])
        for k in range(5):
            x = -W / 2 + 0.34 + k * (W - 0.68) / 4
            _rifle(coll, P, 'r%d_%d' % (li, k), x, -D * 0.12, z + 0.10, length=0.80, rot=0)
        # 枪位隔条：让“格位”看得出是分开的
        for k in range(4):
            x = -W / 2 + 0.34 + (k + 0.5) * (W - 0.68) / 4
            L.box(coll, 'div%d_%d' % (li, k), 0.02, D * 0.22, 0.10, x, -D * 0.10, z + 0.04, P['metal'])
    # 下层：两只弹药箱 + 标条
    for k in range(2):
        L.box(coll, 'ammo%d' % k, 0.42, 0.34, 0.22, -W * 0.30 + k * 0.48, -D * 0.12, 0.02, P['dark'])
        L.box(coll, 'ammotape%d' % k, 0.44, 0.06, 0.03, -W * 0.30 + k * 0.48, -D * 0.12, 0.18, P['mark'])
    # 端头标牌
    L.box(coll, 'tag', 0.30, 0.02, 0.14, -W / 2 + 0.22, -D / 2 - 0.01, 1.06, P['mark'])


def workbench(coll, P):
    """军械工作台：厚台面 + 台钳 + 背板挂具 + 拆解中的枪 + 零件盘 + 弹药箱。"""
    W, D = L.ref_footprint('armory_workbench')
    H = L.TIER_H['anchor']
    top = H - 0.34
    L.box(coll, 'top', W, D * 0.80, 0.10, 0, -D * 0.06, top, P['steel'])
    L.box(coll, 'apron', W, 0.05, 0.12, 0, -D * 0.46, top - 0.12, P['dark'])
    for sx in (-1, 1):
        for sy in (-1, 1):
            L.box(coll, 'leg%d%d' % (sx + 1, sy + 1), 0.09, 0.09, top,
                  sx * (W / 2 - 0.12), sy * (D * 0.34 - 0.12), 0.0, P['metal'])
    L.box(coll, 'under', W - 0.30, D * 0.60, 0.05, 0, -D * 0.06, 0.24, P['dark'])
    for k in range(3):
        L.box(coll, 'parts%d' % k, 0.30, 0.24, 0.14, -W * 0.34 + k * 0.34, -D * 0.06, 0.29, P['metal'])
    # 台钳（左端）+ 拆解中的枪（台面中央）+ 零件盘（右端）
    L.box(coll, 'visebase', 0.20, 0.20, 0.10, -W * 0.40, -D * 0.10, top + 0.10, P['dark'])
    L.box(coll, 'visejaw0', 0.22, 0.10, 0.12, -W * 0.40, -D * 0.16, top + 0.20, P['metal'])
    L.box(coll, 'visejaw1', 0.22, 0.10, 0.12, -W * 0.40, -D * 0.04, top + 0.20, P['metal'])
    L.hcyl(coll, 'visescrew', 0.03, 0.26, -W * 0.40, -D * 0.26, top + 0.24, P['steel'], axis='y', seg=8)
    L.box(coll, 'visehandle', 0.03, 0.34, 0.03, -W * 0.40, -D * 0.30, top + 0.22, P['mark'])
    _rifle(coll, P, 'strip', -W * 0.02, -D * 0.10, top + 0.14, length=0.80)
    L.box(coll, 'tray', 0.44, 0.28, 0.03, W * 0.32, -D * 0.14, top + 0.10, P['steel'])
    for k in range(4):
        L.box(coll, 'screw%d' % k, 0.03, 0.03, 0.05, W * 0.24 + 0.06 * k, -D * 0.18, top + 0.13, P['steel'])
    # 背板挂具（+Y 侧）
    L.box(coll, 'peg', W - 0.20, 0.05, 0.24, 0, D / 2 - 0.10, top + 0.04, P['metal'])
    for k in range(5):
        L.cyl(coll, 'pin%d' % k, 0.014, 0.07, -W * 0.36 + k * 0.36, D / 2 - 0.15,
              top + 0.18, P['steel'], seg=6)
    for k, (dx, hh) in enumerate([(-W * 0.36, 0.20), (-W * 0.18, 0.14), (0.0, 0.17)]):
        L.box(coll, 'hang%d' % k, 0.05, 0.04, hh, dx, D / 2 - 0.17, top + 0.06, P['dark'])


def vise(coll, P):
    """台钳工位（accent 档 0.55）：铸铁台座 + 钳体 + 两块钳口 + 丝杆 + T 形手柄 + 碎屑盘。

    地图给的是 1.2×1.2 的占地，所以不能只做一只 0.46 宽的台钳 ——
    那样 Godot 会按 (1.2/0.46) 横向拉 2.6 倍，钳口直接变成一条横杠。
    这里做成「一张 1.1 米的钳工台 + 台钳本体」，撑满占地。"""
    W, D = L.ref_footprint('armory_vise')
    H = L.TIER_H['accent']
    sw, sd = W * 0.92, D * 0.92
    stand_h = H * 0.52
    # 台座：厚板 + 四条腿 + 下层托板（放零件）
    L.box(coll, 'top', sw, sd, 0.06, 0, 0, stand_h - 0.06, P['steel'])
    for sx in (-1, 1):
        for sy in (-1, 1):
            L.box(coll, 'leg%d%d' % (sx + 1, sy + 1), 0.08, 0.08, stand_h - 0.06,
                  sx * (sw / 2 - 0.10), sy * (sd / 2 - 0.10), 0.0, P['metal'])
    L.box(coll, 'shelf', sw * 0.80, sd * 0.70, 0.04, 0, 0, 0.10, P['dark'])
    # 钳体：底座 + 两块钳口 + 丝杆 + 手柄
    L.box(coll, 'visebase', 0.30, 0.24, 0.10, 0, -0.02, stand_h, P['dark'])
    L.box(coll, 'jaw0', 0.34, 0.09, 0.14, 0, -0.13, stand_h + 0.10, P['steel'])
    L.box(coll, 'jaw1', 0.34, 0.09, 0.14, 0, 0.07, stand_h + 0.10, P['steel'])
    L.hcyl(coll, 'screw', 0.025, 0.30, 0, 0.22, stand_h + 0.15, P['steel'], axis='y', seg=8)
    L.box(coll, 'handle', 0.34, 0.03, 0.03, 0, 0.34, stand_h + 0.15, P['mark'])
    for sx in (-1, 1):
        L.cyl(coll, 'knob%d' % (sx + 1), 0.032, 0.05, sx * 0.17, 0.34, stand_h + 0.13, P['mark'], seg=8)
    # 台面两侧：碎屑盘 + 零件盒
    L.box(coll, 'pan', 0.26, 0.20, 0.03, -sw * 0.34, -sd * 0.28, stand_h, P['dark'])
    L.box(coll, 'parts', 0.22, 0.18, 0.10, sw * 0.34, -sd * 0.26, stand_h, P['metal'])
    L.box(coll, 'partstape', 0.24, 0.04, 0.02, sw * 0.34, -sd * 0.26, stand_h + 0.08, P['mark'])


def targetlane(coll, P):
    """射击位：半高隔断 + 靶架 + 靶纸 + 沙袋 + 地面弹壳。"""
    W, D = L.ref_footprint('armory_targetlane')
    H = L.TIER_H['mid']
    # 隔断（-Y 侧）：挡板 + 压条
    L.box(coll, 'barrier', W, 0.10, H * 0.72, 0, -D / 2 + 0.06, 0.0, P['dark'])
    L.box(coll, 'capping', W + 0.04, 0.14, 0.05, 0, -D / 2 + 0.06, H * 0.72, P['metal'])
    for k in range(3):
        L.box(coll, 'stripe%d' % k, W * 0.22, 0.02, 0.05, -W * 0.28 + k * W * 0.28,
              -D / 2 + 0.005, H * 0.40, P['mark'])
    # 靶架：立柱 + 靶纸 + 同心环
    # 环必须**面向玩家**（沿 Y 躺的圆盘）；立式圆柱会变成一张平放的红饼（第一版就是这样）。
    px = W * 0.28
    py = D * 0.24
    L.box(coll, 'post', 0.07, 0.07, H, px, py + 0.04, 0.0, P['metal'])
    L.box(coll, 'paper', W * 0.46, 0.02, H * 0.42, px, py - 0.02, H * 0.50, P['white'])
    for r in range(3):
        L.hcyl(coll, 'ring%d' % r, 0.16 - 0.05 * r, 0.012, px, py - 0.035,
               H * 0.71, P['red'], axis='y', seg=14)
    L.box(coll, 'paperclip', 0.05, 0.02, 0.03, px, py - 0.03, H * 0.89, P['steel'])
    # 沙袋（两个）+ 弹壳
    for k in range(2):
        L.box(coll, 'sandbag%d' % k, 0.44, 0.22, 0.16, -W * 0.26 + k * 0.10, -D * 0.10,
              0.0 + 0.16 * k, P['card'])
    for k in range(5):
        L.cyl(coll, 'shell%d' % k, 0.014, 0.05, -W * 0.10 + 0.09 * k, -D * 0.30, 0.0,
              P['mark'], seg=6)


def ammocrate(coll, P):
    """弹药箱堆：两只大箱（一关一开）+ 一只小箱压顶 + 前脸标带 + 弹链。

    尺寸按 0.95 档算：堆到 0.85 左右，Godot 侧只小幅缩放。
    第一版两只箱子在 X 上重叠了 0.5 米、盖子比箱体还大，远看就是一大块白方箱。"""
    W, D = L.ref_footprint('armory_ammocrate')
    H = L.TIER_H['mid']
    c0x = -W * 0.24
    c1x = W * 0.26
    h0 = H * 0.58
    h1 = H * 0.50
    # 左：关着的整箱 + 压顶小箱
    L.box(coll, 'crate0', W * 0.46, D * 0.70, h0, c0x, 0, 0.0, P['dark'])
    L.box(coll, 'lid0', W * 0.48, D * 0.72, 0.04, c0x, 0, h0, P['metal'])
    L.box(coll, 'tape0', 0.08, 0.02, h0 * 0.92, c0x, -D * 0.355, 0.02, P['mark'])
    L.box(coll, 'latch0', 0.10, 0.03, 0.06, c0x, -D * 0.36, h0 * 0.62, P['steel'])
    L.box(coll, 'crate2', W * 0.28, D * 0.46, H * 0.30, c0x + 0.05, -0.04, h0 + 0.04, P['metal'])
    L.box(coll, 'tape2', 0.06, 0.02, H * 0.28, c0x + 0.05, -0.04 - D * 0.23, h0 + 0.05, P['mark'])
    # 右：箱盖掀开 14°（绕后缘铰链），露出弹链
    L.box(coll, 'crate1', W * 0.42, D * 0.62, h1, c1x, 0, 0.0, P['dark'])
    L.box(coll, 'tape1', 0.08, 0.02, h1 * 0.90, c1x, -D * 0.315, 0.02, P['mark'])
    lid = L.box(coll, 'lid1', W * 0.40, D * 0.56, 0.04, c1x, D * 0.26, h1, P['dark'])
    L.pivot_rotate([lid], Vector((c1x, D * 0.26 + D * 0.56 / 2.0, h1)), 'X', -14)
    for k in range(3):
        L.cyl(coll, 'belt%d' % k, 0.02, 0.10, c1x - W * 0.10 + 0.07 * k, 0.02, h1, P['mark'], seg=6)
    L.box(coll, 'stencil', 0.26, 0.02, 0.10, c1x, -D * 0.315, h1 * 0.45, P['white'])


def issuedesk(coll, P):
    """发放台：柜台 + 上方铁栅窗 + 登记簿 + 台面上的待发枪 + 挂墙弹药架。"""
    W, D = L.ref_footprint('armory_issuedesk')
    H = L.TIER_H['mid']
    L.box(coll, 'counter', W, D * 0.62, H * 0.80, 0, -D * 0.10, 0.0, P['dark'])
    L.box(coll, 'top', W + 0.06, D * 0.66, 0.06, 0, -D * 0.10, H * 0.80, P['steel'])
    L.box(coll, 'kick', W - 0.10, 0.04, 0.08, 0, -D * 0.41, 0.02, P['metal'])
    # 铁栅：三根立柱 + 五根竖条（截断到 H 以内）
    for sx in (-1, 1):
        L.box(coll, 'gpost%d' % (sx + 1), 0.07, 0.07, H * 0.18, sx * (W / 2 - 0.06),
              D * 0.22, H - H * 0.18, P['metal'])
    L.box(coll, 'grail', W, 0.07, 0.05, 0, D * 0.22, H - 0.05, P['metal'])
    for k in range(7):
        L.box(coll, 'bar%d' % k, 0.025, 0.025, H * 0.16, -W / 2 + 0.16 + k * (W - 0.32) / 6,
              D * 0.22, H - H * 0.18, P['steel'])
    # 台面：登记簿 + 待发枪 + 印章
    L.box(coll, 'book', 0.28, 0.20, 0.03, -W * 0.30, -D * 0.16, H * 0.86, P['white'])
    L.box(coll, 'bookline', 0.24, 0.02, 0.01, -W * 0.30, -D * 0.18, H * 0.89, P['dark'])
    _rifle(coll, P, 'issue', W * 0.06, -D * 0.14, H * 0.90, length=0.76)
    L.cyl(coll, 'stamp', 0.05, 0.07, -W * 0.16, -D * 0.24, H * 0.86, P['red'], seg=8)
    # 背面挂墙弹药架
    L.box(coll, 'rack', W * 0.80, 0.10, 0.06, 0, D * 0.34, H * 0.58, P['metal'])
    for k in range(3):
        L.box(coll, 'mag%d' % k, 0.10, 0.06, 0.20, -W * 0.24 + k * 0.24, D * 0.36,
              H * 0.62, P['dark'])


BUILDERS = {
    'armory_gunrack': gunrack,
    'armory_workbench': workbench,
    'armory_targetlane': targetlane,
    'armory_ammocrate': ammocrate,
    'armory_issuedesk': issuedesk,
    'armory_vise': vise,
}

if __name__ == '__main__':
    L.run('armory', BUILDERS, tag='armory')
