"""生态舱 8 类掩体本体 · 真实尺寸版（2026-11-07）。

历史：第一批（2026-11-06）用「1×1 归一化模型 + Godot 按地图尺寸缩放」。
      实测拉伸比 **2.25×~4.32×**（2.8×2.8 的巨树只有 0.657 米宽），
      树冠被拉成扁片、水池被拉成一条 —— 这是「看着粗糙」最实在的一个来源。

本版：迁到 covers_lib.py，按 `ref_footprint()` 的**真实占地**建模，
      高度取档位，和仓库/医疗/军械/后六舱同一口径。Godot 侧缩放回到 ≈1.0。
      造型语言保留（树/罐/池/灌木/制氧机/种植架/灌溉台/温控台），
      并按参考图三条规则补：底部内收、外凸边条、嵌入式灯带。

用法：blender -b -P 3d/tools/build-covers-ecosys.py
     （GPU 被占用时设 COVERS_SKIPBOARD=1 只导出、不出检查板）
"""
import bpy
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import covers_lib as L  # noqa: E402

from mathutils import Vector  # noqa: E402


def _footprint(coll, P, W, D, h=0.10, inset=0.88):
    """内收踢脚 + 主体基座：所有落地件共用，避免「一个盒子杵在地上」。"""
    L.box(coll, 'toe', W * inset, D * inset, h, 0, 0, 0.0, P['rubber'])
    L.box(coll, 'plinth', W, D, 0.04, 0, 0, h, P['dark'])


def tree(coll, P):
    """巨树（anchor 1.30）：八边形树池 + 板根 + 三层树冠 + 发光孢子。"""
    H = L.TIER_H['anchor']
    # 树冠要撑满 2.8×2.8 的占地：第一版半径 0.92 只做到 1.84 宽，会被拉 1.6 倍。
    # 纵向用 scale 压扁，保证顶不超过 anchor 档 1.30。
    L.box(coll, 'toe', 1.90, 1.90, 0.08, 0, 0, 0.0, P['rubber'])
    L.cyl(coll, 'planter', 1.02, 0.16, 0, 0, 0.08, P['dark'], seg=8)
    L.cyl(coll, 'soil', 0.94, 0.03, 0, 0, 0.24, P['soil'], seg=8)
    for k in range(6):
        a = math.pi * 2 * k / 6
        L.box(coll, 'root%d' % k, 0.62, 0.14, 0.10,
              math.cos(a) * 0.32, math.sin(a) * 0.32, 0.24, P['bark'])
    L.cyl(coll, 'trunk', 0.24, 0.58, 0, 0, 0.26, P['bark'], seg=10)
    # 树冠用**球簇**而不是一个压扁的 ico：单层大球为了守 1.30 的档位高度
    # 只能把 z 压到 0.30，实机里就是一只绿色飞碟。九个低面数球堆起来，
    # 既有体积感又守住高度（顶 ~1.31），面数反而比原来更低。
    L.ico(coll, 'crown_core', 0.58, 0, 0, 0.86, P['leaf'], sub=1, scale=(1, 1, 0.78))
    for k in range(6):
        a = math.pi * 2 * k / 6
        L.ico(coll, 'crown%d' % k, 0.50, math.cos(a) * 0.82, math.sin(a) * 0.82,
              0.78 + (k % 3) * 0.045,
              P['leaf2'] if k % 2 == 0 else P['leaf'], sub=1, scale=(1, 1, 0.72))
    for k in range(2):
        L.ico(coll, 'crowntop%d' % k, 0.36, (k - 0.5) * 0.52, 0.06, 1.00,
              P['leaf'] if k == 0 else P['leaf2'], sub=1, scale=(1, 1, 0.70))
    for k in range(6):
        a = math.pi * 2 * k / 6
        L.ico(coll, 'spore%d' % k, 0.065, math.cos(a) * 0.98,
              math.sin(a) * 0.98, 0.42, P['glow'], sub=1)
    L.torus(coll, 'edgeglow', 1.00, 0.018, 0, 0, 0.235, P['glow'], maj=24, mino=5)


def tank(coll, P):
    """培养罐（mid 0.95）：双罐并排 + 共用底座 + 中间控制台。"""
    W, D = L.ref_footprint('ecosys_tank')
    H = L.TIER_H['mid']
    _footprint(coll, P, W, D, h=0.09)
    base = 0.13
    for k, sx in enumerate((-1, 1)):
        cx = sx * W * 0.235
        L.box(coll, 'pedestal%d' % k, 1.02, 1.02, 0.08, cx, 0, base, P['metal'])
        L.cyl(coll, 'glass%d' % k, 0.42, H * 0.62, cx, 0, base + 0.08,
              P['glass'], seg=20)
        for tag, z in (('lo', base + 0.13), ('hi', base + 0.08 + H * 0.62 - 0.07)):
            L.cyl(coll, 'ring%s%d' % (tag, k), 0.445, 0.05, cx, 0, z, P['metal'], seg=20)
        L.cyl(coll, 'cap%d' % k, 0.43, 0.07, cx, 0, base + 0.08 + H * 0.62,
              P['dark'], seg=20)
        L.cyl(coll, 'liquid%d' % k, 0.395, H * 0.36, cx, 0, base + 0.14,
              P['water'], seg=20)
        L.cyl(coll, 'led%d' % k, 0.43, 0.02, cx, 0, base + 0.08 + H * 0.62 - 0.005,
              P['glow'], seg=20)
        for j in range(3):
            L.ico(coll, 'bud%d_%d' % (k, j), 0.10,
                  cx + (-0.18 + 0.18 * j), 0.08, base + 0.48,
                  P['leaf'] if j % 2 == 0 else P['leaf2'], sub=1, scale=(1, 1, 1.4))
    L.box(coll, 'console', 0.34, 0.62, 0.56, 0, -D * 0.24, base, P['dark'])
    L.box(coll, 'screen', 0.28, 0.02, 0.20, 0, -D * 0.24 - 0.32, base + 0.34, P['glow'])
    for k in range(2):
        L.cyl(coll, 'pipe%d' % k, 0.028, 0.40, (k - 0.5) * 0.20, D * 0.30,
              base + 0.10, P['metal'], seg=8)


def pond(coll, P):
    """水池（accent 0.55）：4×2 的长池 + 池沿座 + 水下灯 + 水草。"""
    W, D = L.ref_footprint('ecosys_pond')
    L.box(coll, 'toe', W * 0.92, D * 0.88, 0.06, 0, 0, 0.0, P['rubber'])
    L.box(coll, 'floor', W, D, 0.12, 0, 0, 0.06, P['dark'])
    for sy in (-1, 1):
        L.box(coll, 'rim%d' % (sy + 1), W + 0.04, 0.12, 0.12, 0,
              sy * (D / 2 - 0.02), 0.18, P['metal'])
    for sx in (-1, 1):
        L.box(coll, 'rims%d' % (sx + 1), 0.12, D - 0.12, 0.12,
              sx * (W / 2 - 0.02), 0, 0.18, P['metal'])
    L.box(coll, 'water', W - 0.20, D - 0.20, 0.02, 0, 0, 0.14, P['water'])
    for k in range(4):
        x = -W * 0.34 + k * W * 0.225
        y = (0.16 if k % 2 == 0 else -0.16)
        for j in range(3):
            L.cyl(coll, 'reed%d_%d' % (k, j), 0.016, 0.24 + 0.04 * j,
                  x + (j - 1) * 0.08, y, 0.16, P['leaf2'], seg=6)
        L.ico(coll, 'lily%d' % k, 0.16, x + 0.20, -y, 0.17, P['leaf'],
              sub=1, scale=(1, 1, 0.18))
    for k in range(3):
        L.ico(coll, 'lamp%d' % k, 0.055, -W * 0.30 + k * W * 0.30,
              0.0, 0.17, P['glow'], sub=1)


def shrub(coll, P):
    """灌木花箱（accent 0.55）：1.6 见方花箱 + 三丛灌木 + 发光花。"""
    W, D = L.ref_footprint('ecosys_shrub')
    H = L.TIER_H['accent']
    L.box(coll, 'toe', W * 0.82, D * 0.82, 0.06, 0, 0, 0.0, P['rubber'])
    L.box(coll, 'planter', W * 0.94, D * 0.94, 0.18, 0, 0, 0.06, P['dark'])
    for sy in (-1, 1):
        L.box(coll, 'edge%d' % (sy + 1), W * 0.98, 0.06, 0.05, 0,
              sy * (D * 0.47 - 0.02), 0.24, P['metal'])
    L.box(coll, 'soil', W * 0.86, D * 0.86, 0.03, 0, 0, 0.24, P['soil'])
    for i, (x, y, r) in enumerate([(-0.34, 0.08, 0.34), (0.34, -0.12, 0.31),
                                   (0.02, 0.34, 0.27)]):
        L.ico(coll, 'bush%d' % i, r, x, y, 0.27 + r * 0.60,
              P['leaf'] if i % 2 == 0 else P['leaf2'], sub=2, scale=(1, 1, 0.88))
    for k in range(4):
        a = math.pi * 2 * k / 4 + 0.4
        L.ico(coll, 'flower%d' % k, 0.045, math.cos(a) * 0.42,
              math.sin(a) * 0.42, H - 0.10, P['glow'], sub=1)


def oxygen(coll, P):
    """制氧机（mid 0.95）：机身 + 双气瓶 + 散热片 + 顶部管道。"""
    W, D = L.ref_footprint('ecosys_oxygen')
    H = L.TIER_H['mid']
    L.box(coll, 'toe', W * 0.70, D * 0.70, 0.07, 0, 0, 0.0, P['rubber'])
    L.box(coll, 'body', W * 0.62, D * 0.54, H * 0.74, -W * 0.10, -D * 0.10,
          0.07, P['dark'])
    fy = -D * 0.10 - D * 0.27 - 0.01
    L.box(coll, 'bezel', W * 0.56, 0.04, H * 0.42, -W * 0.10, fy, 0.34, P['metal'])
    L.box(coll, 'screen', W * 0.46, 0.02, H * 0.30, -W * 0.10, fy - 0.03, 0.40, P['glow'])
    for k in range(4):
        L.box(coll, 'vent%d' % k, W * 0.44, 0.02, 0.022, -W * 0.10,
              fy - 0.02, 0.13 + 0.045 * k, P['steel'])
    for k in range(2):
        x = W * 0.20 + k * 0.32
        L.cyl(coll, 'bottle%d' % k, 0.15, H * 0.60, x, D * 0.20, 0.07,
              P['metal'], seg=14)
        L.cyl(coll, 'bottlecap%d' % k, 0.09, 0.07, x, D * 0.20,
              0.07 + H * 0.60, P['glow'], seg=10)
        L.cyl(coll, 'band%d' % k, 0.158, 0.035, x, D * 0.20, 0.36,
              P['mark'], seg=14)
    L.hcyl(coll, 'duct', 0.045, W * 0.62, -W * 0.06, D * 0.20, H * 0.72,
           P['metal'], axis='x', seg=10)
    # 进深撑到 1.8：第一版只有 1.35（会被拉 1.33 倍）。后部加机架、前部加检修踏板。
    L.box(coll, 'rearframe', W * 0.66, 0.09, H * 0.66, -W * 0.06,
          D * 0.46, 0.07, P['metal'])
    for sx in (-1, 1):
        L.box(coll, 'rearpost%d' % (sx + 1), 0.07, 0.10, H * 0.66,
              sx * W * 0.30, D * 0.46, 0.07, P['dark'])
    L.box(coll, 'step', W * 0.62, 0.36, 0.05, -W * 0.10,
          -D * 0.42, 0.07, P['steel'])
    L.box(coll, 'toplight', W * 0.44, 0.02, 0.015, -W * 0.10,
          fy - 0.02, 0.13, P['glow'])


def growrack(coll, P):
    """种植架（mid 0.95）：四柱 + 三层托盘 + 每层六株 + 顶部灯带。"""
    W, D = L.ref_footprint('ecosys_growrack')
    H = L.TIER_H['mid']
    for sx in (-1, 1):
        for sy in (-1, 1):
            L.box(coll, 'post%d%d' % (sx + 1, sy + 1), 0.07, 0.07, H,
                  sx * (W / 2 - 0.10), sy * (D / 2 - 0.10), 0.0, P['metal'])
    for s in range(3):
        z = 0.14 + 0.27 * s
        L.box(coll, 'tray%d' % s, W - 0.16, D - 0.16, 0.05, 0, 0, z, P['metal'])
        for sy in (-1, 1):
            L.box(coll, 'lip%d_%d' % (s, sy + 1), W - 0.10, 0.05, 0.06, 0,
                  sy * (D / 2 - 0.07), z + 0.05, P['dark'])
        L.box(coll, 'soil%d' % s, W - 0.32, D - 0.32, 0.02, 0, 0, z + 0.05, P['soil'])
        for k in range(6):
            L.ico(coll, 'sprout%d_%d' % (s, k), 0.095,
                  -W * 0.34 + k * W * 0.136, 0, z + 0.13,
                  P['leaf'] if k % 2 == 0 else P['leaf2'], sub=1, scale=(1, 1, 1.1))
        L.box(coll, 'led%d' % s, W - 0.30, 0.02, 0.012, 0,
              -(D / 2 - 0.12), z + 0.245, P['glow'])


def irrigation(coll, P):
    """灌溉台（mid 0.95）：控制柜 + 侧挂水箱 + 泵组 + 出水臂。"""
    W, D = L.ref_footprint('ecosys_irrigation')
    H = L.TIER_H['mid']
    L.box(coll, 'toe', W * 0.88, D * 0.84, 0.07, 0, 0, 0.0, P['rubber'])
    cw = W * 0.42
    L.box(coll, 'cabinet', cw, D * 0.62, H * 0.78, -W * 0.26, 0, 0.07, P['dark'])
    cy = -D * 0.31 - 0.01
    L.box(coll, 'bezel', cw * 0.78, 0.04, H * 0.34, -W * 0.26, cy, 0.36, P['metal'])
    L.box(coll, 'screen', cw * 0.66, 0.02, H * 0.26, -W * 0.26, cy - 0.03,
          0.40, P['glow'])
    for k in range(3):
        L.box(coll, 'btn%d' % k, 0.07, 0.02, 0.05,
              -W * 0.38 + 0.12 * k, cy - 0.03, 0.18, P['mark'])
    tx = W * 0.14
    L.cyl(coll, 'tank', 0.34, H * 0.62, tx, D * 0.10, 0.07, P['glass'], seg=18)
    L.cyl(coll, 'tankcap', 0.36, 0.05, tx, D * 0.10, 0.07 + H * 0.62,
          P['metal'], seg=18)
    L.cyl(coll, 'waterlevel', 0.325, 0.02, tx, D * 0.10, 0.36, P['water'], seg=18)
    L.hcyl(coll, 'arm', 0.035, 0.62, tx - 0.24, -D * 0.20, H * 0.74,
           P['metal'], axis='x', seg=8)
    L.cyl(coll, 'nozzle', 0.026, 0.14, tx - 0.52, -D * 0.20, H * 0.62,
          P['glow'], seg=8)
    px = W * 0.36
    L.box(coll, 'pumpbase', W * 0.22, D * 0.52, 0.10, px, 0, 0.07, P['metal'])
    L.hcyl(coll, 'pump', 0.20, 0.44, px, 0, 0.30, P['dark'], axis='x', seg=14)
    L.cyl(coll, 'gauge', 0.10, 0.04, px, -D * 0.20, 0.56, P['glow'], seg=12)


def climate(coll, P):
    """温控台（mid 0.95）：台体 + 斜操作面 + 屏幕 + 格栅 + 背部冷媒盘管。"""
    W, D = L.ref_footprint('ecosys_climate')
    H = L.TIER_H['mid']
    L.box(coll, 'toe', W * 0.88, D * 0.84, 0.07, 0, 0, 0.0, P['rubber'])
    L.box(coll, 'base', W * 0.94, D * 0.72, H * 0.60, 0, 0, 0.07, P['dark'])
    for sy in (-1, 1):
        L.box(coll, 'lip%d' % (sy + 1), W * 0.98, 0.07, 0.06, 0,
              sy * (D * 0.36 - 0.02), 0.07 + H * 0.60, P['metal'])
    deck = L.box(coll, 'deck', W * 0.54, D * 0.40, 0.06, -W * 0.10, 0,
                 0.07 + H * 0.60 + 0.06, P['steel'])
    scr = L.box(coll, 'screen', W * 0.40, D * 0.30, 0.02, -W * 0.10, 0,
                0.07 + H * 0.60 + 0.13, P['glow'])
    L.pivot_rotate([deck, scr], Vector((-W * 0.10, 0, 0.07 + H * 0.60)), 'X', -18)
    for k in range(3):
        L.box(coll, 'grille%d' % k, W * 0.86, 0.02, 0.03, 0,
              -D * 0.36 - 0.02, 0.18 + 0.07 * k, P['metal'])
    for k in range(2):
        L.hcyl(coll, 'coolant%d' % k, 0.042, D * 0.66, W * 0.30 + k * 0.20,
               0, 0.10 + k * 0.12, P['metal'], axis='y', seg=10)
        L.cyl(coll, 'dial%d' % k, 0.11, 0.03, W * 0.30 + k * 0.20,
              -D * 0.34, H * 0.52, P['glow'], seg=12)
    L.box(coll, 'toplight', W * 0.86, 0.02, 0.015, 0,
          -D * 0.36 - 0.03, 0.44, P['glow'])


BUILDERS = {
    'ecosys_tree': tree,
    'ecosys_tank': tank,
    'ecosys_pond': pond,
    'ecosys_shrub': shrub,
    'ecosys_oxygen': oxygen,
    'ecosys_growrack': growrack,
    'ecosys_irrigation': irrigation,
    'ecosys_climate': climate,
}


if __name__ == '__main__':
    L.run('ecosys', BUILDERS)
