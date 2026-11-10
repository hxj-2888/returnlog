# =============================================================
# build-covers-warehouse.py · 仓库 6 类的掩体本体（Blender 5.2.2）
# -------------------------------------------------------------
# 用法：
#   "E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b \
#     -P 3d/tools/build-covers-warehouse.py
#
# 尺寸口径：**按真实尺寸建模**（footprint 取 map_v2 里该 kind 的最常见 w×h），
#   高度取档位（anchor 1.30 / mid 0.95 / accent 0.55）。
#   货架 1.4×6.9 就是真的 1.4 米进深、6.9 米长 —— 不再用 1×1 拉伸。
#   归一化与导出由 covers_lib.run() 负责，这里只写几何。
#
# 两个货架 kind 必须长得不一样（玩家看得见）：西架是码好的箱货，东架是桶 + 缠绕膜托盘。
# =============================================================
import bpy
import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import covers_lib as L  # noqa: E402


def _rack(coll, P, side):
    """贯通式重型货架：立柱 + 四层横梁 + 层板 + 货位。"""
    W, D = L.ref_footprint('warehouse_rack_%s' % side)
    H = L.TIER_H['anchor']
    bays = max(3, int(round(D / 1.15)))
    span = D / bays
    px = W / 2.0 - 0.07

    # 立柱：每道隔板两侧各两根，底部垫脚板
    for i in range(bays + 1):
        y = -D / 2.0 + i * span
        for sx in (-1, 1):
            L.box(coll, 'post%d_%d' % (i, sx), 0.075, 0.075, H, sx * px, y, 0.0, P['metal'])
            if i in (0, bays):
                L.box(coll, 'foot%d_%d' % (i, sx), 0.16, 0.16, 0.03, sx * px, y, 0.0, P['dark'])

    # 三层货位：1.30 米的架高里塞四层会让顶层的货顶穿檐板（第一版实测 1.50/1.62）。
    # 货高上限 = H - z - 0.06；三层给到 0.30 刚好压得住。
    levels = [0.10, 0.47, 0.84]
    for li, z in enumerate(levels):
        # 层板 + 前后横梁 + 层板下的加强筋
        L.box(coll, 'deck%d' % li, W - 0.06, D - 0.02, 0.035, 0, 0, z, P['dark'])
        for sx in (-1, 1):
            L.box(coll, 'beam%d_%d' % (li, sx), 0.055, D - 0.02, 0.09,
                  sx * (px - 0.03), 0, z + 0.035, P['metal'])
        for k in range(0, bays, 2):
            y = -D / 2.0 + span * (k + 0.5)
            L.box(coll, 'rib%d_%d' % (li, k), W - 0.12, 0.035, 0.03, 0, y, z - 0.03, P['steel'])

        # 货位：按 (层, 位) 走固定图样，保证可复现、又不会看起来像克隆
        for k in range(bays):
            y = -D / 2.0 + span * (k + 0.5)
            mode = (li * 3 + k) % 5
            if mode == 0:
                continue  # 空位：货架不该是塞满的
            if side == 'west':
                if mode in (1, 4):
                    bw, bd, bh = 0.94, span * 0.72, 0.24 + 0.04 * (k % 3)
                    L.box(coll, 'crate%d_%d' % (li, k), bw, bd, bh, 0, y, z + 0.035, P['card'])
                    L.box(coll, 'tape%d_%d' % (li, k), bw * 0.98, 0.05, bh * 0.9, 0, y, z + 0.04, P['mark'])
                elif mode == 2:
                    L.box(coll, 'case%d_%d' % (li, k), 1.0, span * 0.8, 0.30, 0, y, z + 0.035, P['steel'])
                    L.box(coll, 'handle%d_%d' % (li, k), 0.28, 0.05, 0.05, 0, y - span * 0.3,
                          z + 0.20, P['metal'])
                else:
                    for j in range(2):
                        L.box(coll, 'small%d_%d_%d' % (li, k, j), 0.44, span * 0.42, 0.20,
                              -0.24 + 0.48 * j, y, z + 0.035, P['wood'])
            else:
                if mode in (1, 3):
                    L.cyl(coll, 'barrel%d_%d' % (li, k), 0.27, 0.40, -0.16, y, z + 0.035,
                          P['metal'], seg=10)
                    if mode == 1:
                        L.cyl(coll, 'ring%d_%d' % (li, k), 0.283, 0.035, -0.16, y,
                              z + 0.29, P['mark'], seg=10)
                    L.box(coll, 'can%d_%d' % (li, k), 0.30, span * 0.55, 0.22, 0.32, y,
                          z + 0.035, P['card'])
                elif mode == 2:
                    L.box(coll, 'wrap%d_%d' % (li, k), 0.96, span * 0.78, 0.34, 0, y, z + 0.035, P['white'])
                    L.box(coll, 'strap%d_%d' % (li, k), 1.0, 0.05, 0.36, 0, y, z + 0.032, P['dark'])
                else:
                    L.box(coll, 'crate2_%d_%d' % (li, k), 0.90, span * 0.66, 0.26, 0, y,
                          z + 0.035, P['card'])

    # 顶部：只做**边框**不做整块顶板 —— 整块板从上方看会把三层货全挡住（第一版就是这样）
    for sx in (-1, 1):
        L.box(coll, 'capRail%d' % (sx + 1), 0.09, D, 0.06, sx * (W / 2 - 0.05), 0, H - 0.06, P['metal'])
    for sy in (-1, 1):
        L.box(coll, 'capEnd%d' % (sy + 1), W, 0.09, 0.06, 0, sy * (D / 2 - 0.05), H - 0.06, P['metal'])
    L.box(coll, 'strip', 0.05, D - 0.2, 0.03, -px + 0.04, 0, H - 0.10, P['glow'])
    # 架端标牌：给“这排是什么货”一点视觉锚点
    L.box(coll, 'tag', 0.34, 0.02, 0.16, 0, -D / 2.0 - 0.012, 0.98, P['mark'])


def rack_west(coll, P):
    _rack(coll, P, 'west')


def rack_east(coll, P):
    _rack(coll, P, 'east')


def terminal(coll, P):
    """库管终端：主柜 + 双屏 + 键盘 + 扫码枪 + 脚下警示条。"""
    W, D = L.ref_footprint('warehouse_terminal')
    H = L.TIER_H['mid']
    L.box(coll, 'body', W, D * 0.62, H - 0.06, 0, D * 0.17, 0.0, P['dark'])
    L.box(coll, 'kick', W - 0.12, 0.05, 0.10, 0, D * 0.17 - D * 0.31, 0.0, P['metal'])
    L.box(coll, 'top', W + 0.04, D * 0.66, 0.06, 0, D * 0.17, H - 0.06, P['metal'])
    # 两个斜屏：0.9 米宽一个，各自向内扣 12°
    for i, sx in enumerate((-1, 1)):
        cx = sx * 0.62
        cy = D * 0.02
        plate = L.box(coll, 'screen%d' % i, 0.86, 0.05, 0.50, cx, cy, H + 0.16, P['dark'])
        glow = L.box(coll, 'glow%d' % i, 0.78, 0.02, 0.40, cx, cy - 0.04, H + 0.21, P['glow'])
        piv = Vector((cx, cy, H + 0.41))
        L.pivot_rotate([plate, glow], piv, 'Z', -14 * sx)
        L.pivot_rotate([plate, glow], piv, 'X', -10)
        L.box(coll, 'hanger%d' % i, 0.06, 0.06, 0.18, cx, cy + 0.02, H + 0.02, P['metal'])
    L.box(coll, 'stand', 0.10, 0.10, 0.24, 0, D * 0.04, H, P['metal'])
    # 键盘 / 扫描台 / 便签
    L.box(coll, 'kbd', 0.80, 0.28, 0.03, -0.30, -D * 0.10, H, P['dark'])
    L.box(coll, 'scanner', 0.16, 0.20, 0.06, 0.86, -D * 0.06, H, P['mark'])
    L.box(coll, 'note', 0.20, 0.02, 0.14, -0.94, -D * 0.16, H, P['white'])
    for i in range(4):
        L.box(coll, 'hazard%d' % i, W * 0.9 / 4 * 0.9, 0.02, 0.05,
              -W * 0.45 + i * W * 0.235, -D * 0.30, 0.05, P['mark'] if i % 2 == 0 else P['dark'])


def pallet(coll, P):
    """托盘 + 三层纸箱 + 打包带。accent 档只有 0.55 高，全部从 z=0 长起来。"""
    W, D = L.ref_footprint('warehouse_pallet')
    L.box(coll, 'base', W * 0.96, D * 0.96, 0.02, 0, 0, 0.0, P['wood'])
    for i in range(3):
        L.box(coll, 'runner%d' % i, W * 0.92, 0.10, 0.07, 0, (i - 1) * D * 0.36, 0.02, P['wood'])
    for i in range(5):
        L.box(coll, 'slat%d' % i, 0.12, D * 0.94, 0.025, (i - 2) * W * 0.21, 0, 0.09, P['wood'])
    L.box(coll, 'carton0', W * 0.80, D * 0.78, 0.26, 0, 0, 0.115, P['card'])
    L.box(coll, 'carton1', W * 0.60, D * 0.58, 0.14, 0, 0, 0.375, P['card'])
    L.box(coll, 'strap', W * 0.82, 0.05, 0.27, 0, -D * 0.10, 0.11, P['mark'])
    L.box(coll, 'label', 0.22, 0.02, 0.12, W * 0.14, -D * 0.395, 0.20, P['white'])


def packbench(coll, P):
    """打包台：台面 + 四腿 + 下层置物 + 背板挂具 + 胶带枪 + 台秤。"""
    W, D = L.ref_footprint('warehouse_packbench')
    H = L.TIER_H['mid']
    top = H - 0.08
    L.box(coll, 'top', W, D, 0.08, 0, 0, top, P['wood'])
    for i, (sx, sy) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)]):
        L.box(coll, 'leg%d' % i, 0.08, 0.08, top, sx * (W / 2 - 0.10), sy * (D / 2 - 0.10), 0.0, P['metal'])
    L.box(coll, 'shelf', W - 0.10, D - 0.10, 0.04, 0, 0, 0.22, P['dark'])
    for i in range(3):
        L.box(coll, 'stock%d' % i, 0.34, 0.30, 0.20, -0.90 + 0.34 * i, 0.02, 0.26, P['card'])
    # 背板（+Y 侧）与挂具
    L.box(coll, 'peg', W - 0.06, 0.05, 0.50, 0, D / 2 - 0.04, top + 0.06, P['metal'])
    for i in range(6):
        L.cyl(coll, 'pegpin%d' % i, 0.012, 0.06, -1.05 + i * 0.42, D / 2 - 0.10, top + 0.26,
              P['steel'], seg=6)
    L.box(coll, 'wrench', 0.05, 0.03, 0.26, -1.05, D / 2 - 0.13, top + 0.06, P['steel'])
    L.box(coll, 'screwdrv', 0.04, 0.03, 0.20, -0.63, D / 2 - 0.13, top + 0.06, P['mark'])
    L.box(coll, 'spool', 0.18, 0.18, 0.18, 0.20, D / 2 - 0.16, top + 0.06, P['wood'])
    # 台面：胶带枪 / 台秤 / 待封箱
    L.torus(coll, 'tape', 0.09, 0.045, 0.55, -0.20, top + 0.15, P['mark'],
            maj=14, mino=6, rot=(math.pi / 2, 0, 0))
    L.box(coll, 'tapearm', 0.06, 0.20, 0.04, 0.55, -0.02, top + 0.10, P['dark'])
    L.box(coll, 'scale', 0.36, 0.30, 0.06, -0.72, -0.18, top + 0.08, P['steel'])
    L.box(coll, 'scaleglow', 0.20, 0.02, 0.05, -0.72, -0.33, top + 0.10, P['glow'])
    L.box(coll, 'parcel', 0.52, 0.42, 0.26, 1.00, 0.05, top + 0.08, P['card'])
    L.box(coll, 'parceltape', 0.54, 0.06, 0.02, 1.00, 0.05, top + 0.34, P['mark'])


def receiving(coll, P):
    """收货台：滚筒输送线 + 扫码门 + 两件待检货。"""
    W, D = L.ref_footprint('warehouse_receiving')
    H = L.TIER_H['mid']
    for sx in (-1, 1):
        L.box(coll, 'rail%d' % (sx + 1), W, 0.07, 0.10, 0, sx * (D / 2 - 0.05), H - 0.12, P['metal'])
    for i in range(4):
        L.box(coll, 'legR%d' % i, 0.08, 0.08, H - 0.12,
              -W / 2 + 0.12 + i * (W - 0.24) / 3, D / 2 - 0.06, 0.0, P['metal'])
        L.box(coll, 'legL%d' % i, 0.08, 0.08, H - 0.12,
              -W / 2 + 0.12 + i * (W - 0.24) / 3, -D / 2 + 0.06, 0.0, P['metal'])
    # 滚筒：沿深度方向躺，一条输送线上 14 根
    n = 14
    for i in range(n):
        x = -W / 2 + 0.14 + i * (W - 0.28) / (n - 1)
        L.hcyl(coll, 'roller%d' % i, 0.042, D - 0.12, x, 0, H - 0.075, P['metal'], axis='y', seg=8)
    # 皮带床：滚筒下面垫一块暗板，远看才认得出是输送线而不是栏杆
    L.box(coll, 'bed', W - 0.16, D - 0.16, 0.03, 0, 0, H - 0.13, P['dark'])
    # 侧裙板：把滚筒下的空档封住，远看才像一台设备而不是一副架子
    for sy in (-1, 1):
        L.box(coll, 'skirt%d' % (sy + 1), W - 0.10, 0.04, 0.26, 0, sy * (D / 2 - 0.04),
              H - 0.36, P['dark'])
    # 扫码门：两根立柱 + 顶梁 + 红色扫描线
    for sx in (-1, 1):
        L.box(coll, 'gpost%d' % (sx + 1), 0.07, 0.07, H + 0.50, sx * (W / 2 - 0.12), 0, 0.0, P['metal'])
    L.box(coll, 'gbeam', W - 0.10, 0.09, 0.09, 0, 0, H + 0.41, P['metal'])
    L.box(coll, 'scan', W - 0.28, 0.03, 0.02, 0, 0, H + 0.395, P['mark'])
    L.box(coll, 'gpanel', 0.26, 0.03, 0.18, W / 2 - 0.12, -0.06, H + 0.16, P['glow'])
    # 待检货
    L.box(coll, 'box0', 0.46, 0.40, 0.30, -W * 0.32, 0, H + 0.03, P['card'])
    L.box(coll, 'box1', 0.38, 0.34, 0.22, -W * 0.32, 0, H + 0.33, P['card'])
    L.box(coll, 'tag0', 0.16, 0.02, 0.10, -W * 0.32, -0.205, H + 0.14, P['white'])


BUILDERS = {
    'warehouse_rack_west': rack_west,
    'warehouse_rack_east': rack_east,
    'warehouse_terminal': terminal,
    'warehouse_pallet': pallet,
    'warehouse_packbench': packbench,
    'warehouse_receiving': receiving,
}

if __name__ == '__main__':
    L.run('warehouse', BUILDERS, tag='warehouse')
