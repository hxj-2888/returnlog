# =============================================================
# blender-fx.py · 补给点道具 + 特效序列帧（Blender 渲染 + SDXL 材质）
# -------------------------------------------------------------
# 为什么单独一个脚本：整船底图（blender-ship.py）是 4704px 的大烘焙，
# 为两个小道具重烘整张图不划算；但道具又必须和底图**同一台相机、同一套灯、同一批材质**，
# 否则贴上去就是"另一套渲染"——这正是之前 Canvas 手画版突兀的根因。
# 所以这里复用底图的相机参数（正交 / 俯角 12° / 北侧南看）和灯光色温，
# 只把场景缩到 2×2 格，单独渲成 512² 的 RGBA 精灵。
#
# 分工（和 gen-materials.py + blender-ship.py 完全一致）：
#   SDXL 出材质  →  assets/scene/v4/tex/*.png（crate-steel / panel-white / hazard-stripe…）
#   Blender 渲染 →  几何 + 光照 + 阴影 + 序列帧
#
# 产出（assets/scene/v4/facility/）：
#   supply-ammo.png / supply-med.png   512² RGBA，已含接地阴影
#   fx-weld.png / fx-arc.png           1024² RGB 图集（2×2 帧，黑底，游戏里加色混合）
#
# 用法：
#   "E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b -P tools/blender-fx.py
#   ... -- --test          只渲 256² 预览到 tools/_fxpreview/
#   ... -- --only supply   只渲道具
#   ... -- --only fx       只渲特效
# =============================================================
import bpy
import math
import os
import random
import sys

from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'scene', 'v4', 'facility')
TEX = os.path.join(ROOT, 'assets', 'scene', 'v4', 'tex')
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
TEST = '--test' in ARGS


def argval(name, default):
    if name in ARGS:
        i = ARGS.index(name)
        if i + 1 < len(ARGS):
            return ARGS[i + 1]
    return default


ONLY = argval('--only', 'all')
RES = int(argval('--res', '256' if TEST else '512'))
THETA = math.radians(12.0)          # 与 blender-ship.py 的俯角一致
# 渲染原始帧统一落到 _raw_fx/，由 fx-post.py 做翻转/阴影/图集
OUTDIR = os.path.join(ROOT, 'tools', '_fxpreview') if TEST else os.path.join(OUT, '_raw_fx')
FRAMES = 4                          # 特效帧数（2×2 图集）


# ---------------- 场景骨架 ----------------
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            continue
    sc.render.film_transparent = True
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    # 色彩管理与底图**完全一致**（AgX + Medium High Contrast + exposure 1.34）：
    # 不一致的话，同一个白色医疗箱在底图上偏暖、贴图偏冷，一眼就能看出是两套渲染。
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.view_settings.exposure = 1.34
    return sc


def world_dark(strength=0.35, color=(0.012, 0.016, 0.024)):
    """和底图同一个世界色（近黑的冷蓝），保证暗部色温一致。"""
    w = bpy.data.worlds.new('w')
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value = (*color, 1)
        bg.inputs['Strength'].default_value = strength
    return w


def link(ob):
    bpy.context.collection.objects.link(ob)
    return ob


def area_light(name, loc, size, energy, color):
    d = bpy.data.lights.new(name, 'AREA')
    d.energy = energy
    d.shape = 'SQUARE'
    d.size = size
    d.color = color
    ob = link(bpy.data.objects.new(name, d))
    ob.location = loc
    return ob


def lights(scale=1.0):
    """与底图同一套三点光（冷主光 / 暖补光 / 蓝轮廓光），能量按物体尺寸缩放。

    底图是 98×60 的船，灯在 6~9 格高、1500W；这里物体只有 1.4 格，
    能量按距离平方缩放到 1/40 左右才等价（1500 → 40 量级）。
    """
    k = scale
    area_light('key', (-1.6 * k, -1.4 * k, 3.2 * k), 3.0 * k, 95.0 * k, (0.78, 0.88, 1.0))
    area_light('fill', (1.8 * k, 1.2 * k, 2.4 * k), 2.6 * k, 52.0 * k, (1.0, 0.84, 0.62))
    area_light('rim', (-1.2 * k, 1.9 * k, 2.0 * k), 2.2 * k, 44.0 * k, (0.55, 0.75, 1.0))


def camera(ortho=2.1, dist=14.0):
    cd = bpy.data.cameras.new('cam')
    cd.type = 'ORTHO'
    cd.ortho_scale = ortho
    cd.sensor_fit = 'HORIZONTAL'
    cd.clip_start = 0.1
    cd.clip_end = 200
    ob = link(bpy.data.objects.new('cam', cd))
    ob.location = (0, math.sin(THETA) * dist, math.cos(THETA) * dist)
    ob.rotation_euler = (-THETA, 0, 0)
    bpy.context.scene.camera = ob
    return ob


# ---------------- 材质（贴图来自 SDXL） ----------------
def mat_tex(name, tex, scale=1.0, rough=0.62, metal=0.15, tint=(1, 1, 1), emit=None, emit_str=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    path = os.path.join(TEX, tex)
    if os.path.exists(path):
        img = bpy.data.images.load(path)
        tx = nt.nodes.new('ShaderNodeTexImage')
        tx.image = img
        tx.interpolation = 'Smart'
        mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (scale, scale, scale)
        co = nt.nodes.new('ShaderNodeTexCoord')
        nt.links.new(co.outputs['Object'], mp.inputs['Vector'])
        nt.links.new(mp.outputs['Vector'], tx.inputs['Vector'])
        nt.links.new(tx.outputs['Color'], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = (*tint, 1)
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1)
        bsdf.inputs['Emission Strength'].default_value = emit_str
    return m


def mat_flat(name, color, rough=0.5, metal=0.0, emit=None, emit_str=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit is not None:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = emit_str
    return m


# ---------------- 几何 ----------------
def box(name, cx, cy, w, d, z0, z1, mat, bevel=0.0):
    me = bpy.data.meshes.new(name)
    bm = __import__('bmesh').new()
    __import__('bmesh').ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = v.co.x * w + cx
        v.co.y = v.co.y * d + cy
        v.co.z = (v.co.z + 0.5) * (z1 - z0) + z0
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    ob.data.materials.append(mat)
    if bevel > 0:
        md = ob.modifiers.new('bev', 'BEVEL')
        md.width = bevel
        md.segments = 2
        md.limit_method = 'ANGLE'
    return ob


def rod(name, cx, cy, cz, r, length, mat, axis='z', seg=14):
    """沿指定轴放一根圆柱（中心在 cx,cy,cz）。

    **必须在 bmesh 里转顶点，不能给 object 加 rotation_euler**：
    box/rod 的顶点是绝对坐标、object 原点固定在 (0,0,0)，
    直接转 object 会绕世界原点甩出去（第一版弹壳就是这么消失的）。
    """
    import bmesh
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                          radius1=r, radius2=r, depth=length)
    for v in bm.verts:
        x, y, z = v.co.x, v.co.y, v.co.z
        if axis == 'y':
            v.co.x, v.co.y, v.co.z = x, z, -y
        elif axis == 'x':
            v.co.x, v.co.y, v.co.z = z, y, -x
        v.co.x += cx
        v.co.y += cy
        v.co.z += cz
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    ob.data.materials.append(mat)
    return ob


def rod_between(name, p0, p1, r, mat, seg=6):
    """在两点之间放一根圆柱。

    和 rod() 同一个坑：**方向必须在 bmesh 里算**（用四元数把 +Z 转到 p1-p0），
    给 object 加 rotation_euler 会绕世界原点甩出去 —— 第一版电弧渲出来是
    一堆飘在空中的短线，就是这条。
    """
    import bmesh
    from mathutils import Vector
    a, b = Vector(p0), Vector(p1)
    d = b - a
    ln = d.length
    if ln < 1e-6:
        return None
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    mid = (a + b) / 2
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                          radius1=r, radius2=r, depth=ln)
    for v in bm.verts:
        v.co = q @ v.co + mid
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    ob.data.materials.append(mat)
    return ob


def cylinder(name, cx, cy, r, z0, z1, mat, seg=16):
    return rod(name, cx, cy, (z0 + z1) / 2, r, z1 - z0, mat, 'z', seg)


def render_to(path):
    sc = bpy.context.scene
    sc.render.resolution_x = RES
    sc.render.resolution_y = RES
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


# ---------------- 道具 1：军械补给箱 ----------------
def build_ammo():
    """开盖弹药箱。**弹壳平躺**而不是竖立：
    12° 俯角下竖着的圆柱只能看到一个圆帽（读成"金色圆点"），
    平躺才能露出整根弹壳的长度 —— 这个角度下"看得见形状"比"物理正确"重要。"""
    body = mat_tex('m_ammo_body', 'panel-metal.png', scale=2.4, rough=0.58, metal=0.45)
    dark = mat_flat('m_ammo_dark', (0.115, 0.125, 0.110), rough=0.85)
    brass = mat_flat('m_brass', (0.60, 0.40, 0.12), rough=0.30, metal=0.9)
    copper = mat_flat('m_copper', (0.62, 0.28, 0.10), rough=0.34, metal=0.85)
    amber = mat_flat('m_amber', (0.50, 0.28, 0.05), rough=0.4,
                     emit=(1.0, 0.62, 0.16), emit_str=0.7)
    W, D = 1.36, 1.02
    box('body', 0, 0, W, D, 0.0, 0.34, body, bevel=0.035)
    # 内腔：比箱沿低一档，读得出"打开的箱子"
    box('cavity', 0, 0, W - 0.14, D - 0.14, 0.34, 0.372, dark)
    # 内腔底板：比箱沿低一档，弹壳才有"躺在箱底"的着落
    box('floor', 0, 0, W - 0.16, D - 0.16, 0.336, 0.352, dark)
    # 箱沿四条边（露出厚度）
    box('rim_n', 0, -D / 2 + 0.035, W, 0.07, 0.375, 0.395, body, bevel=0.01)
    box('rim_s', 0, D / 2 - 0.035, W, 0.07, 0.375, 0.395, body, bevel=0.01)
    box('rim_w', -W / 2 + 0.035, 0, 0.07, D - 0.14, 0.375, 0.395, body, bevel=0.01)
    box('rim_e', W / 2 - 0.035, 0, 0.07, D - 0.14, 0.375, 0.395, body, bevel=0.01)
    # 6 发平躺的弹壳：弹体沿 y，弹头在前端（上屏方向）
    for i in range(6):
        x = -0.47 + i * 0.188
        rod('case%d' % i, x, -0.02, 0.385, 0.043, 0.40, brass, 'y', 12)
        rod('tip%d' % i, x, 0.225, 0.385, 0.040, 0.10, copper, 'y', 12)
    # 顶面危险色模板条（贴在箱沿上，不占内腔）
    # 危险条放在**近端**（+Y）：fx-post 会上下翻转，翻转后它落在贴图底部，
    # 也就是游戏里朝向玩家的那一面。放在 -Y 会跑到贴图上边，看着像"贴纸贴反了"。
    box('haz', 0, D / 2 - 0.035, W - 0.30, 0.052, 0.395, 0.405, amber)
    # 状态灯：低强度，别爆成白点
    cylinder('led', W / 2 - 0.11, -D / 2 + 0.11, 0.028, 0.395, 0.412, amber, seg=10)


# ---------------- 道具 2：医疗补给箱 ----------------
def build_med():
    shell = mat_tex('m_med_shell', 'panel-white.png', scale=0.30, rough=0.40, metal=0.05,
                    tint=(0.92, 0.96, 0.99))
    teal = mat_flat('m_med_teal', (0.04, 0.26, 0.28), rough=0.42, metal=0.25)
    green = mat_flat('m_med_green', (0.10, 0.52, 0.36), rough=0.35,
                     emit=(0.16, 0.85, 0.52), emit_str=0.7)
    W, D = 1.22, 0.96
    box('body', 0, 0, W, D, 0.0, 0.28, shell, bevel=0.045)
    box('seam', 0, 0, W + 0.025, D + 0.025, 0.28, 0.305, teal, bevel=0.015)
    box('lid', 0, 0, W - 0.05, D - 0.05, 0.305, 0.42, shell, bevel=0.055)
    # 顶面下沉面板 + 绿十字
    box('panel', 0, 0, W * 0.44, D * 0.40, 0.42, 0.432,
        mat_flat('m_dark', (0.028, 0.045, 0.055), 0.9))
    box('cross_v', 0, 0, 0.078, D * 0.28, 0.432, 0.450, green)
    box('cross_h', 0, 0, W * 0.25, 0.078, 0.432, 0.450, green)
    # 顶面两条封条
    for yy in (-D * 0.36, D * 0.36):
        box('seal%+.0f' % (yy * 100), 0, yy, W - 0.16, 0.045, 0.42, 0.428, teal)
    # 前面两个锁扣（12° 下只剩一条窄边，但能看出"有扣"）
    for sx in (-0.30, 0.30):
        box('latch%+.0f' % (sx * 100), sx * W, -D / 2 - 0.012, 0.10, 0.030, 0.05, 0.19, teal)


# ---------------- 手持工具：扳手 ----------------
def build_wrench():
    """维修动画里那把扳手。

    为什么走 Blender 而不是扩散模型：SDXL 三次出图全是"多联图/带文字/灰底"，
    `one single` + 构图描述都压不住它画成产品目录的样子。
    扳手是纯几何体，Blender 反而一步到位 —— 材质仍然用 SDXL 出的 panel-metal.png，
    所以还是"SDXL 出材质 + Blender 渲染"这条既定管线。

    朝向：手柄沿 -X、开口朝 +X。游戏里以**手柄末端**为轴做往复拧动，
    所以贴图左边留一点余量，drawImage 时把左边中点对准握持点。
    """
    steel = mat_tex('m_wrench', 'panel-metal.png', scale=3.0, rough=0.46, metal=0.62)
    grip = mat_flat('m_wrench_grip', (0.10, 0.11, 0.12), rough=0.72, metal=0.3)
    # 手柄
    box('handle', -0.22, 0, 0.56, 0.088, 0.0, 0.052, steel, bevel=0.012)
    # 握把（末端一小段深色橡胶，读得出"握在哪一头"）
    box('grip', -0.46, 0, 0.14, 0.098, 0.0, 0.058, grip, bevel=0.016)
    # 头部：背 + 上下两个钳口，形成朝 +X 的开口
    # 头部：圆盘 + 上下钳口（钳口要**咬进圆盘**，否则会渲染成两个飘着的方块）
    cylinder('head_r', 0.09, 0, 0.132, 0.0, 0.056, steel, seg=20)
    box('head_back', 0.10, 0, 0.16, 0.26, 0.0, 0.056, steel, bevel=0.012)
    box('jaw_up', 0.23, 0.132, 0.30, 0.082, 0.0, 0.052, steel, bevel=0.010)
    box('jaw_dn', 0.23, -0.132, 0.30, 0.082, 0.0, 0.052, steel, bevel=0.010)


# ---------------- 特效：焊花 / 电弧 ----------------
def build_weld(seed):
    """焊接火花：中心高亮球 + 若干条从中心向外飞散的发光条。

    为什么不用粒子系统：EEVEE 粒子在无头渲染里每帧要重新评估，
    4 帧要 bake 4 次、随机性也不好复现。按 seed 直接生成几何 —— 快、可复现、每帧真的不一样。
    """
    rnd = random.Random(seed)
    core = mat_flat('m_core', (1, 1, 1), emit=(1.0, 0.92, 0.75), emit_str=26.0)
    hot = mat_flat('m_hot', (1, 0.75, 0.35), emit=(1.0, 0.62, 0.18), emit_str=14.0)
    warm = mat_flat('m_warm', (1, 0.55, 0.20), emit=(1.0, 0.45, 0.10), emit_str=8.0)
    cylinder('core', 0, 0, 0.055, 0.02, 0.10, core, seg=12)
    for i in range(30):
        a = rnd.uniform(0, math.tau)
        tilt = rnd.uniform(0.25, 1.15)
        r0 = rnd.uniform(0.05, 0.16)
        L = rnd.uniform(0.10, 0.34)
        z0 = rnd.uniform(0.03, 0.12)
        p0 = (math.cos(a) * r0, math.sin(a) * r0, z0)
        p1 = (p0[0] + math.cos(a) * L * math.cos(tilt),
              p0[1] + math.sin(a) * L * math.cos(tilt),
              p0[2] + L * math.sin(tilt))
        m = core if rnd.random() < 0.28 else (hot if rnd.random() < 0.6 else warm)
        rod_between('sp%d' % i, p0, p1, rnd.uniform(0.006, 0.016), m, 5)


def build_arc(seed):
    """电弧：中心一点 + 几条折线（每段随机抖动），蓝白色发光。

    折线用 rod_between 连成一条，比"每段单独旋转"稳得多。
    """
    rnd = random.Random(seed)
    # 亮度不能太高：AgX 会把高强度高光洗成纯白，蓝色就没了（第一版实测白成一片）。
    # 压低强度、提高色饱和度，才是"蓝白电弧"而不是"白线"。
    hot = mat_flat('m_arc_hot', (0.55, 0.82, 1.0), emit=(0.30, 0.70, 1.0), emit_str=9.0)
    cool = mat_flat('m_arc_cool', (0.20, 0.48, 0.95), emit=(0.14, 0.42, 1.0), emit_str=5.0)
    cylinder('core', 0, 0, 0.05, 0.02, 0.09, hot, seg=10)
    for b in range(6):
        base = rnd.uniform(0, math.tau)
        p = (0.0, 0.0, 0.06)
        for seg in range(7):
            ang = base + rnd.uniform(-0.7, 0.7)
            step = rnd.uniform(0.09, 0.19)
            nxt = (p[0] + math.cos(ang) * step,
                   p[1] + math.sin(ang) * step * 0.85,
                   max(0.015, p[2] + rnd.uniform(-0.045, 0.045)))
            rod_between('arc%d_%d' % (b, seg), p, nxt,
                        rnd.uniform(0.030, 0.052), hot if seg % 2 == 0 else cool, 6)
            p = nxt


# ---------------- 主流程 ----------------
def do_prop(name, builder, ortho):
    reset()
    world_dark(0.30)
    lights(1.0)
    camera(ortho=ortho)
    builder()
    bpy.context.view_layer.update()
    path = os.path.join(OUTDIR, name + '.png')
    render_to(path)
    print('[fx] %s → %s' % (name, os.path.basename(path)))


def do_fx(name, builder, ortho=2.0):
    """特效渲到纯黑底（不透明），游戏里用 globalCompositeOperation='lighter' 叠加。"""
    frames = []
    for i in range(FRAMES):
        reset()
        world_dark(0.0, (0, 0, 0))
        bpy.context.scene.render.film_transparent = False
        lights(1.0)
        camera(ortho=ortho)
        builder(1000 + i * 137)
        bpy.context.view_layer.update()
        p = os.path.join(OUTDIR, '_%s_%d.png' % (name, i))
        render_to(p)
        frames.append(p)
        print('[fx] %s 帧 %d/%d' % (name, i + 1, FRAMES))
    return frames


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    if ONLY in ('all', 'supply'):
        do_prop('supply-ammo', build_ammo, 2.05)
        do_prop('supply-med', build_med, 1.95)
    if ONLY in ('all', 'tool'):
        do_prop('tool-wrench', build_wrench, 1.30)
    if ONLY in ('all', 'fx'):
        do_fx('fx-weld', build_weld)
        do_fx('fx-arc', build_arc)
    print('[fx] 完成 → %s' % OUTDIR)


main()
