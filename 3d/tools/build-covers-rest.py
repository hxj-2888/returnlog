# =============================================================
# build-covers-rest.py · 余下 6 舱 34 类的掩体本体（Blender 5.2.2）
# -------------------------------------------------------------
# 用法（按舱跑，避免一次跑 34 件把 Blender 拖住）：
#   blender -b -P 3d/tools/build-covers-rest.py -- bridge
#   可选：bridge / cam / engine / fun / power / transit
#
# 口径与前三批一致：真实尺寸（map_v2 里该 kind 最常见 w×h）+ 档位高度 + 底面中心原点。
# 每件都要有**一眼可辨的标志物**：驾驶舱是环屏与操舵台，监控是屏幕墙与机柜灯，
# 引擎是反应堆与管路，娱乐是街机与点唱机，配电是开关柜与母线，餐厅是餐台与饮料机。
# =============================================================
import bpy
import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import covers_lib as L  # noqa: E402


# ---------------- 小工具 ----------------
def screen(coll, P, name, w, h, x, y, z, tilt=0.0, m=None):
    """一块朝 -Y 的屏幕：暗色边框 + 发光面。tilt 为正时屏面向后仰。"""
    plate = L.box(coll, name, w, 0.05, h, x, y, z, P['dark'])
    glow = L.box(coll, name + '_g', w - 0.07, 0.02, h - 0.07, x, y - 0.036, z + 0.035,
                 m or P['glow'])
    if abs(tilt) > 1e-6:
        piv = Vector((x, y, z + h / 2.0))
        L.pivot_rotate([plate, glow], piv, 'X', tilt)
    return plate


def knob_row(coll, P, name, n, x0, y, z, gap, r=0.03, m=None):
    for i in range(n):
        L.cyl(coll, '%s%d' % (name, i), r, 0.02, x0 + i * gap, y, z, m or P['mark'], seg=8)


def pipes(coll, P, name, n, x0, y, z, gap, r, length, axis='z', seg=8):
    out = []
    for i in range(n):
        p = (x0 + i * gap, y, z)
        if axis == 'z':
            out.append(L.cyl(coll, '%s%d' % (name, i), r, length, p[0], p[1], p[2], P['metal'], seg=seg))
        else:
            out.append(L.hcyl(coll, '%s%d' % (name, i), r, length, p[0], p[1], p[2], P['metal'],
                              axis=axis, seg=seg))
    return out


# ================= 驾驶舱 =================
def bridge_table(coll, P):
    """指挥桌（参考图版）：八边形切角厚边 + 浅色外壳 + 深色内嵌面板 +
    一圈主题色发光边线 + 中央全息柱，**四条独立支腿**（不是实心圆柱落地）。

    本地 SDXL 的驾驶舱参考图里最抓眼的就是这个「白框 + 深色内板 + 切角」
    三层结构；旧的 24 边形实心圆桌读起来只有一块灰饼。"""
    W, D = L.ref_footprint('bridge_table')
    H = L.TIER_H['anchor']
    r = min(W, D) * 0.49
    leg_z = H * 0.46
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * r * 0.48, sy * r * 0.48
            L.box(coll, 'leg%d%d' % (sx + 1, sy + 1), 0.34, 0.34, leg_z,
                  x, y, 0.06, P['dark'])
            L.box(coll, 'foot%d%d' % (sx + 1, sy + 1), 0.50, 0.50, 0.06,
                  x, y, 0.0, P['metal'])
            L.box(coll, 'footlight%d%d' % (sx + 1, sy + 1), 0.36, 0.02, 0.012,
                  x, y - 0.26, 0.10, P['glow'])
    deck_z = 0.06 + leg_z
    L.cyl(coll, 'deck', r, 0.16, 0, 0, deck_z, P['shell'], seg=8)
    # 三层同心：白框(r~0.94r) → 主题色发光环(0.86~0.94r) → 深色内板(<0.86r)
    L.cyl(coll, 'edgeline', r * 0.94, 0.012, 0, 0, deck_z + 0.16, P['mark'], seg=8)
    L.cyl(coll, 'panel', r * 0.86, 0.02, 0, 0, deck_z + 0.172, P['dark'], seg=8)
    # 内板上的八组操作块
    for i in range(8):
        a = math.pi * 2 * i / 8 + math.pi / 8
        x, y = math.cos(a) * r * 0.66, math.sin(a) * r * 0.66
        L.box(coll, 'pad%d' % i, 0.52, 0.34, 0.03, x, y, deck_z + 0.192, P['metal'])
        L.box(coll, 'padglow%d' % i, 0.38, 0.02, 0.012, x, y - 0.12,
              deck_z + 0.222, P['glow'])
    # 中央全息柱 + 投影盘
    top = deck_z + 0.192
    L.cyl(coll, 'holocol', r * 0.18, H * 0.26, 0, 0, top, P['metal'], seg=12)
    L.cyl(coll, 'holodisc', r * 0.34, 0.03, 0, 0, top + H * 0.26, P['glow'], seg=16)
    L.torus(coll, 'holoring', r * 0.38, 0.022, 0, 0, top + H * 0.26 + 0.03,
            P['mark'], maj=16, mino=5)


def bridge_column(coll, P):
    """结构柱：八角柱身 + 柱脚 + 柱头 + 竖向灯带。"""
    W, D = L.ref_footprint('bridge_column')
    H = L.TIER_H['mid']
    s = min(W, D)
    L.cyl(coll, 'foot', s * 0.48, 0.10, 0, 0, 0.0, P['dark'], seg=8)
    L.cyl(coll, 'shaft', s * 0.34, H - 0.18, 0, 0, 0.10, P['metal'], seg=8)
    L.cyl(coll, 'capital', s * 0.46, 0.08, 0, 0, H - 0.08, P['steel'], seg=8)
    for i in range(4):
        a = math.pi / 2 * i
        L.box(coll, 'glow%d' % i, 0.03, 0.03, H * 0.62,
              math.cos(a) * s * 0.30, math.sin(a) * s * 0.30, 0.18, P['glow'])
    L.torus(coll, 'collar', s * 0.38, 0.02, 0, 0, H * 0.55, P['mark'], maj=8, mino=5)


def bridge_sideboard(coll, P):
    """边柜：柜体 + 三扇门 + 顶部格栅 + 一盏小灯。"""
    W, D = L.ref_footprint('bridge_sideboard')
    H = L.TIER_H['accent']
    L.box(coll, 'body', W, D * 0.82, H - 0.08, 0, 0, 0.0, P['dark'])
    L.box(coll, 'top', W + 0.04, D * 0.42, 0.04, 0, 0, H - 0.08, P['dark'])
    for i in range(3):
        L.box(coll, 'door%d' % i, W / 3 - 0.05, 0.03, H - 0.20,
              -W / 3 + i * W / 3, -D * 0.415, 0.06, P['metal'])
        L.box(coll, 'pull%d' % i, 0.10, 0.02, 0.02, -W / 3 + i * W / 3, -D * 0.44, H * 0.55,
              P['mark'])
    L.box(coll, 'grille', W * 0.90, 0.02, 0.05, 0, -D * 0.42, H - 0.14, P['dark'])
    L.cyl(coll, 'lamp', 0.07, 0.05, W * 0.34, 0, H - 0.03, P['glow'], seg=10)


def bridge_chair(coll, P):
    """指挥座椅（0.55 档）：底座 + 座垫 + 靠背 + 两侧扶手 + 安全带。"""
    W, D = L.ref_footprint('bridge_chair')
    H = L.TIER_H['accent']
    s = min(W, D)
    L.cyl(coll, 'base', s * 0.42, 0.05, 0, 0, 0.0, P['dark'], seg=16)
    L.cyl(coll, 'post', s * 0.10, H * 0.42, 0, 0, 0.05, P['metal'], seg=10)
    L.box(coll, 'seat', s * 0.80, s * 0.76, 0.10, 0, 0, H * 0.47, P['fabric'])
    L.box(coll, 'back', s * 0.80, 0.10, H * 0.42, 0, D * 0.32, H * 0.52, P['fabric'])
    L.box(coll, 'head', s * 0.54, 0.09, H * 0.14, 0, D * 0.33, H * 0.86, P['dark'])
    for sx in (-1, 1):
        L.box(coll, 'arm%d' % (sx + 1), 0.07, s * 0.52, 0.06, sx * s * 0.42, 0, H * 0.66,
              P['metal'])
        L.box(coll, 'armpost%d' % (sx + 1), 0.05, 0.05, H * 0.14, sx * s * 0.42, -s * 0.18,
              H * 0.52, P['metal'])
    L.box(coll, 'belt', s * 0.62, 0.02, 0.03, 0, -s * 0.30, H * 0.58, P['mark'])


def bridge_navconsole(coll, P):
    """导航台：弧形台体 + 三块斜屏 + 按钮排 + 脚下踏板。"""
    W, D = L.ref_footprint('bridge_navconsole')
    H = L.TIER_H['mid']
    L.box(coll, 'body', W, D * 0.60, H * 0.62, 0, D * 0.10, 0.0, P['dark'])
    L.box(coll, 'desk', W + 0.06, D * 0.66, 0.06, 0, D * 0.08, H * 0.62, P['steel'])
    L.box(coll, 'kick', W - 0.20, 0.05, 0.10, 0, -D * 0.22, 0.0, P['metal'])
    for i in range(3):
        screen(coll, P, 'scr%d' % i, W / 3 - 0.24, H * 0.30, -W / 3 + i * W / 3,
               D * 0.02, H * 0.68, tilt=-10)
    knob_row(coll, P, 'btn', 6, -W * 0.30, -D * 0.16, H * 0.68, W * 0.12, r=0.035)
    L.box(coll, 'slider', W * 0.30, 0.05, 0.02, W * 0.26, -D * 0.20, H * 0.68, P['mark'])
    L.box(coll, 'pedal', W * 0.20, 0.16, 0.03, 0, -D * 0.44, 0.02, P['metal'])


def bridge_recorddesk(coll, P):
    """记录台：长桌 + 两屏 + 抽屉组 + 纸张与杯托。"""
    W, D = L.ref_footprint('bridge_recorddesk')
    H = L.TIER_H['mid']
    top = H * 0.66
    L.box(coll, 'top', W, D * 0.72, 0.07, 0, 0, top, P['steel'])
    L.box(coll, 'modesty', W, 0.05, top * 0.80, 0, D * 0.30, 0.06, P['dark'])
    for sx in (-1, 1):
        L.box(coll, 'side%d' % (sx + 1), 0.05, D * 0.68, top, sx * (W / 2 - 0.04), 0, 0.0,
              P['metal'])
    for i in range(3):
        L.box(coll, 'drawer%d' % i, W * 0.26, D * 0.62, (top - 0.16) / 3 - 0.02,
              -W * 0.30, 0, 0.08 + ((top - 0.16) / 3) * i, P['dark'])
        L.box(coll, 'dpull%d' % i, 0.16, 0.03, 0.02, -W * 0.30, -D * 0.33,
              0.14 + ((top - 0.16) / 3) * i, P['steel'])
    for i in range(2):
        screen(coll, P, 'mon%d' % i, W * 0.24, H * 0.26, W * 0.06 + i * W * 0.28,
               -D * 0.10, top + 0.08, tilt=-6)
    L.box(coll, 'paper', W * 0.16, D * 0.22, 0.01, -W * 0.34, -D * 0.10, top + 0.07, P['white'])
    L.cyl(coll, 'cup', 0.045, 0.09, -W * 0.06, -D * 0.24, top + 0.07, P['white'], seg=10)
    knob_row(coll, P, 'key', 5, -W * 0.12, -D * 0.26, top + 0.07, 0.06, r=0.02)
    L.depth_ext(coll, P, 'bridge_recorddesk')

def bridge_holoscreen(coll, P):
    """驾驶舱环屏：底座 + 三段发光面板 + 立柱。5×1.5 的立屏。"""
    W, D = L.ref_footprint('bridge_holoscreen')
    H = L.TIER_H['mid']
    L.box(coll, 'base', W, D * 0.42, 0.10, 0, 0, 0.0, P['dark'])
    L.box(coll, 'rail', W, 0.06, 0.05, 0, 0, 0.10, P['metal'])
    for sx in (-1, 1):
        L.box(coll, 'post%d' % (sx + 1), 0.07, 0.10, H - 0.10, sx * (W / 2 - 0.06), 0, 0.10,
              P['metal'])
    for i in range(3):
        w = W / 3 - 0.10
        L.box(coll, 'frame%d' % i, w, 0.04, H - 0.22, -W / 3 + i * W / 3, 0, 0.14, P['dark'])
        L.box(coll, 'glow%d' % i, w - 0.10, 0.02, H - 0.34, -W / 3 + i * W / 3, -0.032,
              0.20, P['glow'])
        L.box(coll, 'tick%d' % i, w - 0.10, 0.02, 0.02, -W / 3 + i * W / 3, -0.04,
              H * 0.66, P['mark'])
    L.box(coll, 'topbar', W, 0.08, 0.06, 0, 0, H - 0.06, P['metal'])


# ================= 监控室 =================
    L.depth_ext(coll, P, 'bridge_holoscreen')

def cam_codecrack(coll, P):
    """编解码机架（0.55 档）：框架 + 六台设备 + 指示灯 + 风扇。"""
    W, D = L.ref_footprint('cam_codecrack')
    H = L.TIER_H['accent']
    L.box(coll, 'frame', W, D, H, 0, 0, 0.0, P['dark'])
    for i in range(6):
        z = 0.05 + i * (H - 0.10) / 6
        L.box(coll, 'unit%d' % i, W - 0.12, 0.05, (H - 0.14) / 6 - 0.02, 0, -D / 2 - 0.03, z,
              P['metal'])
        for k in range(3):
            L.cyl(coll, 'led%d_%d' % (i, k), 0.012, 0.01,
                  -W / 2 + 0.16 + k * 0.06, -D / 2 - 0.065, z + 0.03,
                  P['glow'] if (i + k) % 2 else P['mark'], seg=6)
    L.cyl(coll, 'fan', 0.10, 0.03, W * 0.30, -D / 2 - 0.02, H * 0.55, P['steel'], seg=12)
    L.box(coll, 'strip', W - 0.10, 0.02, 0.03, 0, -D / 2 - 0.02, H - 0.05, P['glow'])


def cam_archivebox(coll, P):
    """档案箱（0.55 档）：两只叠放的资料箱 + 标签 + 绑带。"""
    W, D = L.ref_footprint('cam_archivebox')
    H = L.TIER_H['accent']
    L.box(coll, 'box0', W * 0.92, D * 0.88, H * 0.52, 0, 0, 0.0, P['card'])
    L.box(coll, 'lid0', W * 0.94, D * 0.90, 0.03, 0, 0, H * 0.52, P['dark'])
    L.box(coll, 'label0', W * 0.30, 0.02, H * 0.16, -W * 0.18, -D * 0.45, H * 0.22, P['white'])
    L.box(coll, 'box1', W * 0.70, D * 0.66, H * 0.34, W * 0.06, -0.02, H * 0.55, P['card'])
    L.box(coll, 'label1', W * 0.24, 0.02, H * 0.12, W * 0.06, -D * 0.36, H * 0.66, P['mark'])


def cam_screenwall(coll, P):
    """监控墙：3×3 屏阵 + 框架 + 底部线槽。"""
    W, D = L.ref_footprint('cam_screenwall')
    H = L.TIER_H['anchor']
    L.box(coll, 'frame', W, D * 0.30, H, 0, 0, 0.0, P['dark'])
    cw = W / 3 - 0.06
    ch = (H - 0.62) / 3 - 0.03
    for r in range(3):
        for c in range(3):
            x = -W / 3 + c * W / 3
            z = 0.56 + r * ((H - 0.62) / 3)
            L.box(coll, 'bezel%d_%d' % (r, c), cw, 0.03, ch, x, -D * 0.16 - 0.02, z, P['dark'])
            L.box(coll, 'scr%d_%d' % (r, c), cw - 0.06, 0.02, ch - 0.06, x, -D * 0.16 - 0.04,
                  z + 0.03, P['glow'] if (r + c) % 3 else P['mark'])
    # 墙下操作台：把进深撑到 1.3（第一版只有 0.47，会被纵深拉 2.8 倍）
    L.box(coll, 'desk', W * 0.94, D * 0.46, 0.06, 0, -D * 0.26, 0.50, P['dark'])
    for sx in (-1, 1):
        L.box(coll, 'ped%d' % (sx + 1), 0.06, D * 0.42, 0.50, sx * W * 0.44, -D * 0.26, 0.0,
              P['metal'])
    L.box(coll, 'kbd', W * 0.30, 0.14, 0.03, 0, -D * 0.44, 0.56, P['metal'])
    L.box(coll, 'tray', W, 0.14, 0.06, 0, -D * 0.10, 0.0, P['metal'])
    for i in range(4):
        L.cyl(coll, 'led%d' % i, 0.014, 0.01, W * 0.36 + 0.05 * i, -D * 0.16 - 0.05, 0.05,
              P['mark'], seg=6)
    L.depth_ext(coll, P, 'cam_screenwall')

def cam_servercab(coll, P):
    """服务器柜：柜体 + 百叶门 + 顶部风扇 + 竖向状态灯。"""
    W, D = L.ref_footprint('cam_servercab')
    H = L.TIER_H['mid']
    L.box(coll, 'body', W, D * 0.88, H - 0.04, 0, 0, 0.0, P['dark'])
    L.box(coll, 'top', W + 0.03, D * 0.40, 0.03, 0, 0, H - 0.04, P['dark'])
    for i in range(7):
        L.box(coll, 'louver%d' % i, W - 0.16, 0.02, 0.035, 0, -D * 0.45, 0.12 + i * 0.10,
              P['metal'])
    L.box(coll, 'ledstrip', 0.03, 0.02, H * 0.62, W / 2 - 0.10, -D * 0.46, 0.14, P['glow'])
    for i in range(2):
        L.cyl(coll, 'fan%d' % i, 0.11, 0.03, -W * 0.18 + i * W * 0.36, -D * 0.46, H * 0.80,
              P['steel'], seg=12)
    for i in range(3):
        L.cyl(coll, 'foot%d' % i, 0.04, 0.03, -W * 0.35 + i * W * 0.35, -D * 0.35, 0.0,
              P['rubber'], seg=8)


def cam_opsdesk(coll, P):
    """操作台：台体 + 两块屏 + 键盘 + 耳机钩 + 台面设备。"""
    W, D = L.ref_footprint('cam_opsdesk')
    H = L.TIER_H['mid']
    top = H * 0.64
    L.box(coll, 'body', W, D * 0.66, top, 0, 0, 0.0, P['dark'])
    L.box(coll, 'top', W + 0.04, D * 0.72, 0.06, 0, 0, top, P['steel'])
    L.box(coll, 'kick', W - 0.16, 0.04, 0.08, 0, -D * 0.33, 0.01, P['metal'])
    for i in range(2):
        screen(coll, P, 'mon%d' % i, W * 0.34, H * 0.28, -W * 0.20 + i * W * 0.40,
               -D * 0.04, top + 0.08, tilt=-8)
    L.box(coll, 'kbd', W * 0.34, 0.14, 0.03, 0, -D * 0.22, top + 0.07, P['metal'])
    L.box(coll, 'pad', W * 0.10, 0.10, 0.02, W * 0.28, -D * 0.24, top + 0.07, P['dark'])
    L.cyl(coll, 'hook', 0.02, 0.10, -W * 0.46, -D * 0.30, top - 0.16, P['steel'], seg=6)
    L.torus(coll, 'headset', 0.09, 0.02, -W * 0.46, -D * 0.30, top - 0.26, P['dark'],
            maj=12, mino=5, rot=(math.pi / 2, 0, 0))


# ================= 引擎舱 =================
def engine_reactor(coll, P):
    """反应堆：基座环 + 堆芯 + 冷却管 + 发光环带 + 顶盖。"""
    W, D = L.ref_footprint('engine_reactor')
    H = L.TIER_H['anchor']
    r = min(W, D) * 0.34
    L.cyl(coll, 'base', r * 1.35, 0.16, 0, 0, 0.0, P['dark'], seg=24)
    L.cyl(coll, 'core', r, H * 0.74, 0, 0, 0.16, P['metal'], seg=24)
    L.cyl(coll, 'band0', r * 1.04, 0.10, 0, 0, H * 0.26, P['glow'], seg=24)
    L.cyl(coll, 'band1', r * 1.04, 0.10, 0, 0, H * 0.60, P['glow'], seg=24)
    L.cyl(coll, 'cap', r * 1.10, 0.12, 0, 0, H * 0.90, P['steel'], seg=24)
    L.torus(coll, 'capring', r * 1.10, 0.03, 0, 0, H * 0.99, P['mark'], maj=24, mino=6)
    for i in range(3):
        a = math.pi * 2 * i / 3 + 0.4
        px, py = math.cos(a) * r * 1.35, math.sin(a) * r * 1.35
        L.cyl(coll, 'pipe%d' % i, 0.09, H * 0.86, px, py, 0.10, P['metal'], seg=8)
        L.cyl(coll, 'joint%d' % i, 0.13, 0.10, px, py, H * 0.70, P['mark'], seg=8)
    L.box(coll, 'plate', W * 0.34, 0.03, H * 0.16, 0, -r * 1.16, H * 0.42, P['dark'])
    L.box(coll, 'plateglow', W * 0.28, 0.02, H * 0.10, 0, -r * 1.18, H * 0.45, P['glow'])


def engine_cylinder(coll, P):
    """气缸组：四只立式气缸 + 缸盖 + 歧管 + 底座。"""
    W, D = L.ref_footprint('engine_cylinder')
    H = L.TIER_H['mid']
    L.box(coll, 'base', W * 0.94, D * 0.86, 0.12, 0, 0, 0.0, P['dark'])
    n = 4
    for i in range(n):
        x = -W * 0.33 + i * (W * 0.66 / (n - 1))
        L.cyl(coll, 'cyl%d' % i, W * 0.075, H * 0.58, x, 0, 0.12, P['metal'], seg=14)
        L.cyl(coll, 'head%d' % i, W * 0.085, H * 0.10, x, 0, 0.12 + H * 0.58, P['steel'], seg=14)
        L.cyl(coll, 'valve%d' % i, W * 0.03, H * 0.08, x, 0, 0.12 + H * 0.68, P['mark'], seg=8)
    L.hcyl(coll, 'manifold', W * 0.05, W * 0.72, 0, D * 0.30, H * 0.68, P['steel'], axis='x',
           seg=10)
    for i in range(n):
        x = -W * 0.33 + i * (W * 0.66 / (n - 1))
        L.hcyl(coll, 'runner%d' % i, 0.035, D * 0.30, x, D * 0.14, H * 0.68, P['metal'],
               axis='y', seg=8)
    L.box(coll, 'plate', W * 0.22, 0.02, H * 0.12, -W * 0.34, -D * 0.44, H * 0.30, P['mark'])


def engine_compressor(coll, P):
    """压缩机：机体 + 卧式储气罐 + 管路 + 压力表。"""
    W, D = L.ref_footprint('engine_compressor')
    H = L.TIER_H['mid']
    L.box(coll, 'body', W * 0.62, D * 0.70, H * 0.70, -W * 0.16, 0, 0.0, P['dark'])
    L.box(coll, 'head', W * 0.36, D * 0.50, H * 0.16, -W * 0.16, 0, H * 0.70, P['metal'])
    L.hcyl(coll, 'tank', D * 0.26, W * 0.34, W * 0.30, 0, H * 0.36, P['steel'], axis='y', seg=16)
    L.hcyl(coll, 'pipe', 0.05, W * 0.30, W * 0.02, 0, H * 0.62, P['metal'], axis='x', seg=8)
    L.hcyl(coll, 'gauge', 0.09, 0.03, W * 0.30, -D * 0.30, H * 0.58, P['white'], axis='y', seg=14)
    L.hcyl(coll, 'needle', 0.012, 0.04, W * 0.30, -D * 0.32, H * 0.58, P['red'], axis='y', seg=6)
    for i in range(3):
        L.box(coll, 'fin%d' % i, W * 0.56, 0.02, 0.04, -W * 0.16, -D * 0.36, 0.14 + i * 0.10,
              P['metal'])
    for sx in (-1, 1):
        L.box(coll, 'foot%d' % (sx + 1), 0.10, D * 0.60, 0.06, -W * 0.16 + sx * W * 0.22, 0, 0.0,
              P['rubber'])
    L.depth_ext(coll, P, 'engine_compressor')

def engine_fusepanel(coll, P):
    """保险面板（0.55 档）：面板 + 两排保险 + 警示条 + 侧线槽。"""
    W, D = L.ref_footprint('engine_fusepanel')
    H = L.TIER_H['accent']
    # 落地柜体撑满 1.2 的进深：第一版只是一块 0.2 米厚的立板，纵深会被拉 6 倍
    L.box(coll, 'cab', W * 0.92, D * 0.80, H * 0.72, 0, D * 0.08, 0.0, P['dark'])
    L.box(coll, 'panel', W, 0.08, H, 0, -D * 0.34, 0.0, P['dark'])
    for r in range(2):
        for c in range(5):
            L.box(coll, 'fuse%d_%d' % (r, c), W * 0.10, 0.03, H * 0.10,
                  -W * 0.32 + c * W * 0.16, -0.06, H * 0.30 + r * H * 0.26, P['metal'])
            L.cyl(coll, 'dot%d_%d' % (r, c), 0.012, 0.01, -W * 0.32 + c * W * 0.16, -0.08,
                  H * 0.30 + r * H * 0.26 + H * 0.05, P['mark'], seg=6)
    L.box(coll, 'warn', W * 0.86, 0.02, 0.05, 0, -0.05, H * 0.84, P['mark'])
    L.box(coll, 'label', W * 0.40, 0.02, H * 0.08, 0, -0.05, H * 0.12, P['white'])
    for sx in (-1, 1):
        L.box(coll, 'duct%d' % (sx + 1), 0.06, 0.06, H * 0.88, sx * (W / 2 - 0.06), 0.06,
              H * 0.06, P['metal'])


def engine_partscart(coll, P):
    """零件车：三层台面 + 轮子 + 零件盒 + 推手。"""
    W, D = L.ref_footprint('engine_partscart')
    H = L.TIER_H['mid']
    levels = [0.16, 0.50, H - 0.26]
    for sx in (-1, 1):
        for sy in (-1, 1):
            L.cyl(coll, 'post%d%d' % (sx + 1, sy + 1), 0.03, H - 0.26,
                  sx * (W / 2 - 0.10), sy * (D / 2 - 0.10), 0.0, P['steel'], seg=8)
    for i, z in enumerate(levels):
        L.box(coll, 'shelf%d' % i, W - 0.16, D - 0.16, 0.04, 0, 0, z, P['metal'])
    for i in range(3):
        L.box(coll, 'bin%d' % i, W * 0.24, D * 0.40, H * 0.20, -W * 0.30 + i * W * 0.30, 0,
              levels[2] + 0.04, P['dark'])
        L.box(coll, 'bintape%d' % i, W * 0.24, 0.02, 0.03, -W * 0.30 + i * W * 0.30,
              -D * 0.21, levels[2] + 0.18, P['mark'])
    L.hcyl(coll, 'push', 0.025, W * 0.80, 0, -D / 2 + 0.02, H - 0.20, P['steel'], axis='x', seg=8)
    for sx in (-1, 1):
        for sy in (-1, 1):
            L.cyl(coll, 'wheel%d%d' % (sx + 1, sy + 1), 0.055, 0.04,
                  sx * (W / 2 - 0.10), sy * (D / 2 - 0.10), 0.0, P['rubber'], seg=10)


def engine_toolbench(coll, P):
    """工具台（0.55 档）：矮台面 + 台钳座 + 工具排 + 抽屉。"""
    W, D = L.ref_footprint('engine_toolbench')
    H = L.TIER_H['accent']
    top = H - 0.10
    L.box(coll, 'top', W, D * 0.86, 0.07, 0, 0, top, P['steel'])
    for sx in (-1, 1):
        for sy in (-1, 1):
            L.box(coll, 'leg%d%d' % (sx + 1, sy + 1), 0.07, 0.07, top,
                  sx * (W / 2 - 0.10), sy * (D / 2 - 0.14), 0.0, P['metal'])
    L.box(coll, 'drawer', W * 0.44, D * 0.70, H * 0.20, -W * 0.24, 0, top - H * 0.26,
          P['dark'])
    L.box(coll, 'pull', 0.18, 0.03, 0.02, -W * 0.24, -D * 0.36, top - H * 0.14, P['mark'])
    for i in range(4):
        L.box(coll, 'tool%d' % i, 0.04, W * 0.18, 0.03, W * 0.10 + i * 0.12, 0, top + 0.07,
              P['steel'])
    L.box(coll, 'rack', W * 0.30, 0.05, H * 0.16, W * 0.26, D * 0.20, top + 0.07, P['dark'])


# ================= 娱乐舱 =================
def fun_jukebox(coll, P):
    """点唱机（参考图版）：拱顶 + 四角霓虹管 + 圆形喇叭格栅 + 下柜玻璃门。

    参考图给的三个特征，缺一个就变成"带灯的柜子"：
      ① 顶部是**圆弧**（半圆筒），不是平顶；
      ② 两侧各一根**竖向霓虹管**，从底座通到拱肩；
      ③ 正中是**圆形喇叭格栅**（环形框 + 竖条），不是一块发光屏。"""
    W, D = L.ref_footprint('fun_jukebox')
    H = L.TIER_H['anchor']
    body_h = H * 0.70
    # 落地：踢脚内收 + 四角脚
    L.box(coll, 'kick', W * 0.78, D * 0.62, 0.06, 0, 0, 0.0, P['dark'])
    L.box(coll, 'body', W * 0.86, D * 0.70, body_h, 0, 0, 0.06, P['dark'])
    # 拱顶：**压扁的圆顶**（立式整圆会把高度顶到 1.7 米，档位只有 1.30）
    L.ico(coll, 'dome', W * 0.43, 0, 0, body_h + 0.02, P['metal'], sub=2,
          scale=(1.0, D * 0.70 / (W * 0.86), 0.32))
    L.box(coll, 'cap', W * 0.88, D * 0.70, 0.03, 0, 0, body_h, P['dark'])
    # 四角立柱 + 竖向霓虹管
    for sx in (-1, 1):
        for sy in (-1, 1):
            L.box(coll, 'post%d%d' % (sx + 1, sy + 1), 0.06, 0.06, body_h,
                  sx * (W * 0.42), sy * (D * 0.33), 0.06, P['metal'])
        L.box(coll, 'neon%d' % (sx + 1), 0.03, 0.03, body_h * 0.82,
              sx * (W * 0.30), -D * 0.36, body_h * 0.12, P['glow'])
    # 圆形喇叭格栅：外环 + 内盘 + 五根竖条
    cy = -D * 0.37
    L.hcyl(coll, 'grillring', W * 0.26, 0.05, 0, cy, body_h * 0.46, P['metal'], axis='y', seg=20)
    L.hcyl(coll, 'grilldisc', W * 0.21, 0.03, 0, cy - 0.02, body_h * 0.46, P['steel'],
           axis='y', seg=20)
    for i in range(5):
        L.box(coll, 'slat%d' % i, 0.03, 0.02, W * 0.34, -W * 0.16 + i * W * 0.08,
              cy - 0.03, body_h * 0.46 - W * 0.17, P['dark'])
    # 下部玻璃门 + 曲目条 + 顶部提手
    L.box(coll, 'glass', W * 0.52, 0.03, body_h * 0.30, 0, -D * 0.36, 0.10, P['glass'])
    L.box(coll, 'track', W * 0.54, 0.02, 0.03, 0, -D * 0.37, body_h * 0.30, P['mark'])
    # 提手：半径要留出高度余量（0.18 半径会把整体顶到 1.59）
    L.torus(coll, 'handle', W * 0.10, 0.016, 0, 0, H - 0.18, P['steel'],
            maj=12, mino=5, rot=(0, math.pi / 2, 0))


def fun_gametable(coll, P):
    """游戏桌：桌面 + 绒面 + 筹码 + 骰子 + 四腿。"""
    W, D = L.ref_footprint('fun_gametable')
    H = L.TIER_H['mid']
    top = H * 0.72
    L.box(coll, 'top', W, D, 0.08, 0, 0, top, P['wood'])
    # 参考图：桌面四周有一圈外凸护栏，四角包角，栏下藏一条灯带
    for sy in (-1, 1):
        L.box(coll, 'rail%d' % (sy + 1), W, 0.12, 0.09, 0, sy * (D / 2 - 0.06),
              top + 0.08, P['metal'])
    for sx in (-1, 1):
        L.box(coll, 'siderail%d' % (sx + 1), 0.12, D, 0.09, sx * (W / 2 - 0.06), 0,
              top + 0.08, P['metal'])
    for sx in (-1, 1):
        for sy in (-1, 1):
            L.cyl(coll, 'cap%d%d' % (sx + 1, sy + 1), 0.10, 0.03,
                  sx * (W / 2 - 0.04), sy * (D / 2 - 0.04), top + 0.17, P['dark'], seg=12)
    L.box(coll, 'felt', W - 0.24, D - 0.24, 0.02, 0, 0, top + 0.06, P['fabric'])
    L.box(coll, 'neon', W - 0.12, 0.02, 0.01, 0, -D / 2 + 0.01, top + 0.07, P['glow'])
    for sx in (-1, 1):
        for sy in (-1, 1):
            L.box(coll, 'leg%d%d' % (sx + 1, sy + 1), 0.09, 0.09, top,
                  sx * (W / 2 - 0.14), sy * (D / 2 - 0.14), 0.0, P['dark'])
    for i in range(6):
        a = math.pi * 2 * i / 6
        L.cyl(coll, 'chips%d' % i, 0.05, 0.03, math.cos(a) * W * 0.28,
              math.sin(a) * D * 0.28, top + 0.10, P['mark'] if i % 2 else P['white'], seg=10)
    L.box(coll, 'card0', 0.12, 0.18, 0.01, 0, 0, top + 0.10, P['white'])
    L.box(coll, 'card1', 0.12, 0.18, 0.01, 0.06, 0.04, top + 0.11, P['white'])


def fun_stool(coll, P):
    """吧凳（0.55 档）：圆座 + 中心柱 + 三脚 + 脚环。"""
    W, D = L.ref_footprint('fun_stool')
    H = L.TIER_H['accent']
    # 底座用圆盘撑满 0.8×0.8 的占地：第一版三条腿都朝 Y 伸，X 向只有 0.57，会被横向拉 1.4 倍
    r = min(W, D) * 0.52
    L.cyl(coll, 'foot', r, 0.04, 0, 0, 0.0, P['dark'], seg=18)
    L.cyl(coll, 'seat', min(W, D) * 0.30, 0.08, 0, 0, H - 0.08, P['fabric'], seg=16)
    L.cyl(coll, 'post', 0.04, H - 0.12, 0, 0, 0.04, P['metal'], seg=8)
    for k, z in enumerate((H * 0.30, H * 0.36)):
        L.torus(coll, 'ring%d' % k, min(W, D) * (0.28 - 0.02 * k), 0.016, 0, 0, z,
                P['steel'] if k == 0 else P['mark'], maj=14, mino=5)


def fun_coffeetable(coll, P):
    """茶几（0.55 档）：矮面 + 四腿 + 杂志 + 杯子。"""
    W, D = L.ref_footprint('fun_coffeetable')
    H = L.TIER_H['accent']
    top = H - 0.06
    # 参考图：茶几是一圈厚边 + 下沉台面
    for sy in (-1, 1):
        L.box(coll, 'rim%d' % (sy + 1), W, 0.10, 0.10, 0, sy * (D / 2 - 0.05), top, P['metal'])
    for sx in (-1, 1):
        L.box(coll, 'rims%d' % (sx + 1), 0.10, D, 0.10, sx * (W / 2 - 0.05), 0, top, P['metal'])
    L.box(coll, 'top', W - 0.16, D - 0.16, 0.04, 0, 0, top, P['wood'])
    for sx in (-1, 1):
        for sy in (-1, 1):
            L.box(coll, 'leg%d%d' % (sx + 1, sy + 1), 0.06, 0.06, top,
                  sx * (W / 2 - 0.10), sy * (D / 2 - 0.10), 0.0, P['metal'])
    L.box(coll, 'mag', W * 0.24, D * 0.30, 0.02, -W * 0.22, 0, top + 0.05, P['white'])
    L.box(coll, 'mag2', W * 0.22, D * 0.28, 0.02, -W * 0.20, 0.03, top + 0.07, P['mark'])
    L.cyl(coll, 'cup', 0.04, 0.08, W * 0.26, 0, top + 0.05, P['white'], seg=10)


def fun_arcade(coll, P):
    """街机柜（参考图版）：斜切侧板 + 内凹屏 + **外凸斜控制台** + 灯箱 + 踢脚。

    参考图里最能拉开差距的是控制台：它从机身**探出来并向前倾**，
    手放上去才有地方；第一版把按键直接贴在机身表面，看着就是一台带屏的柜子。"""
    W, D = L.ref_footprint('fun_arcade')
    H = L.TIER_H['mid']
    # 踢脚 + 机身 + 顶部斜切
    L.box(coll, 'kick', W * 0.76, D * 0.62, 0.08, 0, D * 0.04, 0.0, P['dark'])
    L.box(coll, 'body', W * 0.86, D * 0.74, H * 0.72, 0, D * 0.04, 0.08, P['dark'])
    L.box(coll, 'head', W * 0.82, D * 0.66, H * 0.22, 0, D * 0.06, H * 0.80, P['metal'])
    # 灯箱（向前倾 12°）
    marq = L.box(coll, 'marquee', W * 0.74, 0.06, H * 0.13, 0, -D * 0.31, H * 0.80, P['glow'])
    mframe = L.box(coll, 'marqframe', W * 0.80, 0.04, H * 0.19, 0, -D * 0.295, H * 0.77, P['metal'])
    L.pivot_rotate([marq, mframe], Vector((0, -D * 0.31, H * 0.80)), 'X', -12)
    # 屏幕：外框 + 内凹发光面
    L.box(coll, 'bezel', W * 0.70, 0.05, H * 0.30, 0, -D * 0.31, H * 0.44, P['metal'])
    L.box(coll, 'scr', W * 0.62, 0.02, H * 0.24, 0, -D * 0.35, H * 0.47, P['glow'])
    # 控制台：从机身探出 0.16 米、前倾 18°
    deck = L.box(coll, 'deck', W * 0.88, D * 0.34, H * 0.07, 0, -D * 0.36, H * 0.34, P['metal'])
    lip = L.box(coll, 'decklip', W * 0.88, 0.04, H * 0.04, 0, -D * 0.53, H * 0.31, P['dark'])
    L.pivot_rotate([deck, lip], Vector((0, -D * 0.30, H * 0.37)), 'X', -18)
    # 摇杆 + 三个按键 + 投币口
    L.cyl(coll, 'stick', 0.026, 0.11, -W * 0.22, -D * 0.38, H * 0.37, P['steel'], seg=8)
    L.ico(coll, 'ball', 0.035, -W * 0.22, -D * 0.38, H * 0.48, P['mark'], sub=1)
    for i in range(3):
        L.cyl(coll, 'btn%d' % i, 0.033, 0.03, W * 0.06 + i * 0.10, -D * 0.40, H * 0.40,
              P['glow'], seg=8)
    L.box(coll, 'coin', W * 0.10, 0.02, H * 0.07, W * 0.28, -D * 0.335, H * 0.18, P['mark'])
    # 侧板收边
    for sx in (-1, 1):
        L.box(coll, 'cheek%d' % (sx + 1), 0.04, D * 0.72, H * 0.70,
              sx * (W * 0.43), D * 0.04, 0.08, P['metal'])


def fun_racer(coll, P):
    """赛车座椅：桶椅 + 支架 + 方向盘 + 踏板。"""
    W, D = L.ref_footprint('fun_racer')
    H = L.TIER_H['mid']
    L.box(coll, 'base', W * 0.92, D * 0.98, 0.09, 0, 0, 0.0, P['dark'])
    L.box(coll, 'seat', W * 0.72, D * 0.44, 0.14, 0, D * 0.06, H * 0.30, P['fabric'])
    L.box(coll, 'back', W * 0.72, 0.10, H * 0.50, 0, D * 0.30, H * 0.42, P['fabric'])
    L.box(coll, 'head', W * 0.40, 0.09, H * 0.14, 0, D * 0.31, H * 0.86, P['dark'])
    for sx in (-1, 1):
        L.box(coll, 'side%d' % (sx + 1), 0.06, D * 0.36, H * 0.20, sx * W * 0.37, D * 0.14,
              H * 0.40, P['mark'])
    L.cyl(coll, 'col', 0.035, 0.26, 0, -D * 0.16, H * 0.42, P['metal'], seg=8)
    L.torus(coll, 'wheel', 0.15, 0.02, 0, -D * 0.16, H * 0.66, P['dark'], maj=14, mino=5,
            rot=(math.radians(70), 0, 0))
    L.box(coll, 'pedals', W * 0.40, D * 0.16, 0.05, 0, -D * 0.44, 0.03, P['metal'])
    for sx in (-1, 1):
        L.box(coll, 'beam%d' % (sx + 1), 0.07, D * 0.92, 0.06, sx * W * 0.40, 0, 0.09, P['metal'])


def fun_sofa(coll, P):
    """沙发：底座 + 两块坐垫 + 靠背 + 扶手。2.4×2.2 的占地。"""
    W, D = L.ref_footprint('fun_sofa')
    H = L.TIER_H['mid']
    # 参考图：落地处内收一圈踢脚，坐垫边缘有压线，扶手顶面一条灯带
    L.box(coll, 'toe', W * 0.90, D * 0.90, 0.10, 0, 0, 0.0, P['rubber'])
    L.box(coll, 'base', W, D, H * 0.34, 0, 0, 0.10, P['dark'])
    for i in range(2):
        L.box(coll, 'cushion%d' % i, W * 0.44, D * 0.62, H * 0.18,
              -W * 0.24 + i * W * 0.48, -D * 0.12, H * 0.44, P['fabric'])
        L.box(coll, 'backc%d' % i, W * 0.44, D * 0.22, H * 0.52,
              -W * 0.24 + i * W * 0.48, D * 0.36, H * 0.46, P['fabric'])
        L.box(coll, 'pipe%d' % i, W * 0.44, D * 0.62, 0.015,
              -W * 0.24 + i * W * 0.48, -D * 0.12, H * 0.62, P['steel'])
    for sx in (-1, 1):
        L.box(coll, 'arm%d' % (sx + 1), W * 0.12, D * 0.90, H * 0.30,
              sx * (W / 2 - W * 0.06), -D * 0.02, H * 0.34, P['metal'])
    L.box(coll, 'strip', W * 0.96, 0.03, 0.03, 0, -D * 0.51, H * 0.86, P['mark'])
    for sx in (-1, 1):
        L.box(coll, 'armglow%d' % (sx + 1), W * 0.05, D * 0.86, 0.02,
              sx * (W / 2 - W * 0.10), -D * 0.02, H * 0.66, P['glow'])


# ================= 配电舱 =================
def power_gauge(coll, P):
    """仪表架（0.55 档）：立架 + 双表 + 管路 + 阀。"""
    W, D = L.ref_footprint('power_gauge')
    H = L.TIER_H['accent']
    # 落地支架要占满 0.8 的进深：第一版只有 0.32，会被 Godot 纵深拉 2.5 倍
    L.box(coll, 'stand', W * 0.84, D * 0.90, 0.06, 0, D * 0.06, 0.0, P['dark'])
    for sy in (-1, 1):
        L.box(coll, 'post%d' % (sy + 1), 0.07, 0.07, H * 0.92, 0, D * 0.06 + sy * D * 0.36,
              0.06, P['metal'])
    L.box(coll, 'panel', W * 0.86, 0.07, H * 0.80, 0, -D * 0.30, H * 0.12, P['metal'])
    for i in range(2):
        L.hcyl(coll, 'dial%d' % i, H * 0.18, 0.03, -W * 0.18 + i * W * 0.36, -0.05,
               H * 0.62, P['white'], axis='y', seg=14)
        L.hcyl(coll, 'hand%d' % i, 0.012, 0.04, -W * 0.18 + i * W * 0.36, -0.07,
               H * 0.62, P['red'], axis='y', seg=6)
    L.hcyl(coll, 'pipe', 0.05, W * 0.90, 0, D * 0.10, H * 0.30, P['steel'], axis='x', seg=10)
    L.cyl(coll, 'valve', 0.07, 0.06, W * 0.34, D * 0.10, H * 0.30, P['mark'], seg=10)


def power_switchgear(coll, P):
    """开关柜：柜体 + 三扇门 + 手柄 + 顶部母线 + 警示条。"""
    W, D = L.ref_footprint('power_switchgear')
    H = L.TIER_H['anchor']
    L.box(coll, 'body', W, D * 0.84, H - 0.12, 0, 0, 0.0, P['dark'])
    L.box(coll, 'top', W + 0.04, D * 0.40, 0.05, 0, 0, H - 0.12, P['dark'])
    for i in range(3):
        L.box(coll, 'door%d' % i, W / 3 - 0.06, 0.03, H * 0.66, -W / 3 + i * W / 3,
              -D * 0.43, H * 0.16, P['metal'])
        L.box(coll, 'handle%d' % i, 0.04, 0.05, H * 0.16, -W / 3 + i * W / 3 + W * 0.12,
              -D * 0.46, H * 0.40, P['steel'])
        L.cyl(coll, 'lamp%d' % i, 0.03, 0.02, -W / 3 + i * W / 3 - W * 0.12, -D * 0.46,
              H * 0.74, P['glow'], seg=8)
    for i in range(3):
        L.hcyl(coll, 'bus%d' % i, 0.035, W * 0.90, 0, D * 0.12, H - 0.02 - i * 0.05,
               P['steel'], axis='x', seg=8)
    L.box(coll, 'warn', W * 0.90, 0.02, 0.06, 0, -D * 0.44, H * 0.06, P['mark'])


def power_transformer(coll, P):
    """变压器：铁芯 + 两组线圈 + 散热片 + 绝缘子。"""
    W, D = L.ref_footprint('power_transformer')
    H = L.TIER_H['mid']
    L.box(coll, 'core', W * 0.62, D * 0.46, H * 0.74, 0, 0, 0.0, P['dark'])
    for i in range(2):
        L.cyl(coll, 'coil%d' % i, W * 0.20, H * 0.62, -W * 0.18 + i * W * 0.36, 0, H * 0.08,
              P['metal'], seg=16)
        L.cyl(coll, 'band%d' % i, W * 0.21, 0.05, -W * 0.18 + i * W * 0.36, 0, H * 0.38,
              P['mark'], seg=16)
    for i in range(4):
        L.box(coll, 'fin%d' % i, 0.03, D * 0.86, H * 0.52, -W * 0.36 + i * W * 0.24,
              D * 0.10, H * 0.10, P['steel'])
    for i in range(2):
        L.cyl(coll, 'insul%d' % i, 0.05, H * 0.18, -W * 0.18 + i * W * 0.36, 0, H * 0.74,
              P['white'], seg=10)
    L.box(coll, 'plate', W * 0.26, 0.02, H * 0.10, W * 0.28, -D * 0.30, H * 0.40, P['mark'])


def power_breakerbank(coll, P):
    """断路器排：长柜 + 12 个手柄 + 标签条 + 顶部母线。"""
    W, D = L.ref_footprint('power_breakerbank')
    H = L.TIER_H['mid']
    L.box(coll, 'body', W, D * 0.80, H - 0.06, 0, 0, 0.0, P['dark'])
    L.box(coll, 'top', W + 0.03, D * 0.38, 0.04, 0, 0, H - 0.06, P['dark'])
    for i in range(12):
        x = -W * 0.44 + i * (W * 0.88 / 11)
        L.box(coll, 'brk%d' % i, W * 0.05, 0.04, H * 0.16, x, -D * 0.42, H * 0.30, P['metal'])
        L.box(coll, 'lever%d' % i, W * 0.03, 0.05, H * 0.08, x, -D * 0.44, H * 0.34,
              P['mark'] if i % 3 else P['red'])
    L.box(coll, 'label', W * 0.86, 0.02, H * 0.08, 0, -D * 0.41, H * 0.14, P['white'])
    L.box(coll, 'bus', W * 0.90, 0.05, 0.04, 0, D * 0.10, H - 0.02, P['steel'])


# ================= 餐厅 =================
def transit_drinkbar(coll, P):
    """饮料台：柜台 + 两台饮料机 + 龙头 + 杯塔 + 接水盘。"""
    W, D = L.ref_footprint('transit_drinkbar')
    H = L.TIER_H['anchor']
    L.box(coll, 'counter', W, D * 0.80, H * 0.62, 0, 0, 0.0, P['dark'])
    L.box(coll, 'top', W + 0.04, D * 0.86, 0.06, 0, 0, H * 0.62, P['steel'])
    for i in range(2):
        x = -W * 0.24 + i * W * 0.48
        L.box(coll, 'machine%d' % i, W * 0.34, D * 0.34, H * 0.30, x, D * 0.06, H * 0.68,
              P['metal'])
        screen(coll, P, 'mglow%d' % i, W * 0.28, H * 0.12, x, D * 0.06 - D * 0.18, H * 0.76)
        L.box(coll, 'tap%d' % i, 0.05, 0.05, H * 0.10, x, -D * 0.14, H * 0.56, P['mark'])
        L.box(coll, 'tray%d' % i, W * 0.26, D * 0.16, 0.02, x, -D * 0.12, H * 0.63, P['steel'])
    for i in range(3):
        for k in range(2):
            L.cyl(coll, 'cup%d_%d' % (i, k), 0.04, 0.08, W * 0.36 + i * 0.02,
                  -D * 0.26 + k * 0.09, H * 0.65, P['white'], seg=8)


def transit_trayreturn(coll, P):
    """餐盘回收（0.55 档）：斜架 + 三层导轨 + 两只餐盘 + 轮子。"""
    W, D = L.ref_footprint('transit_trayreturn')
    H = L.TIER_H['accent']
    L.box(coll, 'frame', W * 0.92, D * 0.80, H * 0.90, 0, 0, 0.02, P['dark'])
    for i in range(3):
        L.box(coll, 'rail%d' % i, W * 0.84, D * 0.60, 0.03, 0, -D * 0.04,
              H * 0.20 + i * H * 0.22, P['steel'])
        L.cyl(coll, 'plate%d' % i, W * 0.20, 0.02, -W * 0.16 + i * W * 0.20, -D * 0.04,
              H * 0.23 + i * H * 0.22, P['white'], seg=12)
    L.box(coll, 'slot', W * 0.60, 0.05, H * 0.06, 0, -D * 0.40, H * 0.78, P['mark'])
    for sx in (-1, 1):
        L.cyl(coll, 'wheel%d' % (sx + 1), 0.045, 0.04, sx * W * 0.34, -D * 0.30, 0.0,
              P['rubber'], seg=8)


def transit_diningtable(coll, P):
    """餐桌：圆台面 + 中心柱 + 底盘 + 调味架 + 两只碗。"""
    W, D = L.ref_footprint('transit_diningtable')
    H = L.TIER_H['mid']
    r = min(W, D) * 0.44
    L.cyl(coll, 'base', r * 0.55, 0.06, 0, 0, 0.0, P['dark'], seg=20)
    L.cyl(coll, 'post', r * 0.14, H * 0.66, 0, 0, 0.06, P['metal'], seg=12)
    L.cyl(coll, 'top', r, 0.08, 0, 0, H * 0.72, P['wood'], seg=28)
    L.cyl(coll, 'rim', r * 0.98, 0.03, 0, 0, H * 0.80, P['mark'], seg=28)
    for i in range(3):
        a = math.pi * 2 * i / 3
        L.cyl(coll, 'bowl%d' % i, 0.10, 0.05, math.cos(a) * r * 0.52,
              math.sin(a) * r * 0.52, H * 0.80, P['white'], seg=12)
    L.box(coll, 'condiment', 0.16, 0.10, 0.10, 0, 0, H * 0.80, P['steel'])
    # 连体圆凳：把占地撑到 2.2×1.8（否则会被横向拉 1.4 倍）
    for sx in (-1, 1):
        L.cyl(coll, 'stool%d' % (sx + 1), 0.26, 0.06, sx * (W / 2 - 0.26), 0, H * 0.42,
              P['mark'], seg=14)
        L.cyl(coll, 'stoolpost%d' % (sx + 1), 0.06, H * 0.42, sx * (W / 2 - 0.26), 0, 0.0,
              P['metal'], seg=8)


def transit_servicecounter(coll, P):
    """服务台：柜台 + 挡板玻璃 + 菜单牌 + 取餐口 + 托盘轨。"""
    W, D = L.ref_footprint('transit_servicecounter')
    H = L.TIER_H['mid']
    L.box(coll, 'body', W, D * 0.62, H * 0.72, 0, 0, 0.0, P['dark'])
    L.box(coll, 'top', W + 0.05, D * 0.68, 0.06, 0, 0, H * 0.72, P['steel'])
    L.box(coll, 'guard', W * 0.90, 0.02, H * 0.22, 0, -D * 0.20, H * 0.78, P['glass'])
    for i in range(3):
        L.box(coll, 'gpost%d' % i, 0.03, 0.03, H * 0.26, -W * 0.42 + i * W * 0.42,
              -D * 0.20, H * 0.74, P['metal'])
    L.box(coll, 'menu', W * 0.42, 0.04, H * 0.16, W * 0.22, D * 0.18, H * 0.86, P['glow'])
    L.box(coll, 'rail', W * 0.80, 0.06, 0.04, 0, -D * 0.34, H * 0.62, P['steel'])
    L.box(coll, 'niche', W * 0.20, 0.04, H * 0.16, -W * 0.30, -D * 0.32, H * 0.44, P['dark'])
    L.box(coll, 'strip', W, 0.02, 0.04, 0, -D * 0.32, 0.06, P['mark'])
    L.depth_ext(coll, P, 'transit_servicecounter')

def transit_platecart(coll, P):
    """餐盘车：两层台面 + 盘堆 + 推手 + 脚轮。"""
    W, D = L.ref_footprint('transit_platecart')
    H = L.TIER_H['mid']
    levels = [0.14, H - 0.30]
    for sx in (-1, 1):
        for sy in (-1, 1):
            L.cyl(coll, 'post%d%d' % (sx + 1, sy + 1), 0.025, H - 0.30,
                  sx * (W / 2 - 0.08), sy * (D / 2 - 0.08), 0.0, P['steel'], seg=8)
    for i, z in enumerate(levels):
        L.box(coll, 'shelf%d' % i, W - 0.12, D - 0.12, 0.03, 0, 0, z, P['metal'])
    for i in range(4):
        L.cyl(coll, 'stack%d' % i, 0.13, 0.14, -W * 0.24 + (i % 2) * W * 0.44,
              -D * 0.16 + (i // 2) * D * 0.32, levels[1] + 0.03, P['white'], seg=16)
    L.hcyl(coll, 'push', 0.022, W * 0.70, 0, -D / 2 + 0.02, H - 0.22, P['steel'], axis='x', seg=8)
    for sx in (-1, 1):
        L.cyl(coll, 'wheel%d' % (sx + 1), 0.05, 0.04, sx * (W / 2 - 0.08), -D * 0.30, 0.0,
              P['rubber'], seg=8)


# ================= 装配 =================
ROOMS = {
    'bridge': {
        'bridge_table': bridge_table, 'bridge_column': bridge_column,
        'bridge_sideboard': bridge_sideboard, 'bridge_chair': bridge_chair,
        'bridge_navconsole': bridge_navconsole, 'bridge_recorddesk': bridge_recorddesk,
        'bridge_holoscreen': bridge_holoscreen,
    },
    'cam': {
        'cam_codecrack': cam_codecrack, 'cam_archivebox': cam_archivebox,
        'cam_screenwall': cam_screenwall, 'cam_servercab': cam_servercab,
        'cam_opsdesk': cam_opsdesk,
    },
    'engine': {
        'engine_reactor': engine_reactor, 'engine_cylinder': engine_cylinder,
        'engine_compressor': engine_compressor, 'engine_fusepanel': engine_fusepanel,
        'engine_partscart': engine_partscart, 'engine_toolbench': engine_toolbench,
    },
    'fun': {
        'fun_jukebox': fun_jukebox, 'fun_gametable': fun_gametable,
        'fun_stool': fun_stool, 'fun_coffeetable': fun_coffeetable,
        'fun_arcade': fun_arcade, 'fun_racer': fun_racer, 'fun_sofa': fun_sofa,
    },
    'power': {
        'power_gauge': power_gauge, 'power_switchgear': power_switchgear,
        'power_transformer': power_transformer, 'power_breakerbank': power_breakerbank,
    },
    'transit': {
        'transit_drinkbar': transit_drinkbar, 'transit_trayreturn': transit_trayreturn,
        'transit_diningtable': transit_diningtable,
        'transit_servicecounter': transit_servicecounter,
        'transit_platecart': transit_platecart,
    },
}

if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    targets = argv or list(ROOMS)
    for rid in targets:
        L.run(rid, ROOMS[rid], tag=rid)
