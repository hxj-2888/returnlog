# =============================================================
# covers_lib.py · 掩体本体程序化建模的共享库（Blender 5.2.2）
# -------------------------------------------------------------
# 为什么要有这个文件：
#   第一批（生态舱）把「清场 / 材质 / 图元 / 导出 / 检查板」全写在 build-covers-ecosys.py 里；
#   扩产到 10 个舱时每舱复制一遍 500 行会失控。这里把**不变的机器**收拢，
#   每个舱只留自己的 BUILDERS（几何）。
#
# 口径（与 blender-export.py / map_builder.gd 一致，改一处要同步）：
#   · 米制 / +Z 上 / 底面中心为原点（run() 会强制归一化，保证导出物真的是这个原点）
#   · **按真实尺寸建模**：footprint 取 map_v2 里该 kind 的最常见 (w,h)，高度取档位高
#     ⇒ 同 kind 的其它件在 Godot 侧按 (w/refW, hz, h/refD) 缩放，形状只被小幅拉伸，
#        不再像 1×1 口径那样把 6.9 米长的货架拉成一条面片
#   · refs 表由 3d/tools/measure-cover-refs.py 从**导出物实测**，不手写、不猜
import bpy
import json
import math
import os
from collections import Counter
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, '3d', 'preview', 'data', 'map_v2.json')
MODEL_DIR = os.path.join(ROOT, '3d', 'assets', 'models')
EXPORT_DIR = os.path.join(ROOT, '3d', 'assets', 'export')
RENDER_DIR = os.path.join(ROOT, '3d', 'assets', 'renders')

TIER_H = {'anchor': 1.30, 'mid': 0.95, 'accent': 0.55}
# 面数预算（2026-11-07 用户裁定「允许建模加面数」）：1500 → 2800。
# 上限受 3d/tools/validate-assets.cjs 的 prop 类 3000 约束，别越过那条线。
BUDGET_TRIS = 6000   # 2026-11-07 用户明确「没有存储和面数限制」；倒角 3 段 + PBR 细节

# 视线遮挡下限（2026-11-07 用户裁定）：
# 「原来能遮挡手电筒和近身视野光亮的物件，都得把高度调整到人眼视角往上」。
# 2.5D 的 los() 是纯 2D 矩形判定，**每一件 cover 都无条件挡光**，没有高度概念；
# 3D 相机在 player.gd 里是 1.62m（胶囊 1.70m），所以 3D 里所有掩体都必须 ≥1.70m，
# 否则玩家能从家具上方看过去 —— 判定说挡、画面说不挡，这就是不一致的根源。
# 取 1.70：等于玩家胶囊高，留 8cm 余量，也让「挡住人眼」有明确数值可验收。
SIGHT_MIN_H = 1.70

with open(SRC, encoding='utf-8') as _f:
    MAP = json.load(_f)


def room(rid):
    return next(r for r in MAP['rooms'] if r['id'] == rid)


def ref_footprint(kind):
    """该 kind 在 map_v2 里最常见的 (w, h)。货架 1.4×6.9、手术台 3.6×2 都按这个建。"""
    sizes = [(round(c['w'], 2), round(c['h'], 2)) for c in MAP['cover'] if c['kind'] == kind]
    if not sizes:
        return 1.0, 1.0
    (w, d), _n = Counter(sizes).most_common(1)[0]
    return w, d


def tier_of(kind):
    for c in MAP['cover']:
        if c['kind'] == kind:
            return c.get('tier', 'mid')
    return 'mid'


# ---------------- 材质 ----------------
# 2026-11-07 用户「没有存储和面数限制」，要求材质向本地 SDXL 参考图靠拢。
# 纯色 Principled 是「塑料感」主因；加面数解决不了，必须上 albedo/roughness/normal。
# 贴图由 gen-pbr-textures.py 程序化生成（周期噪声，真正 tileable），
# 不是拿 SDXL 概念图直接贴 —— 那张带光照、UV 边界会断。
# COVERS_PBR=0 可一键退回纯色，便于 A/B。
# 2026-11-07 用户「建模外形换贴图，本机已有 SDXL 资产可直接作为外饰」：
# albedo 优先读 3d/assets/textures/sdxl/（由 gen-sdxl-skins.py 把本机 SDXL
# 成品降采样成 256² JPEG），normal 仍用程序化法线，纹理资源数不变。
# COVERS_SDXL=0 回退纯程序化 PBR；COVERS_PBR=0 回退纯色。
SDXL_ON = os.environ.get('COVERS_SDXL', '1') == '1'
SDXL_DIR = os.path.join(ROOT, '3d', 'assets', 'textures', 'sdxl')
# 2026-11-07：sdxl/ 已改成跟随重新出图的高清源（1536²），但 61 件 GLB 内嵌的
# 贴图在运行时已被 map_builder.gd 的共享材质覆盖、完全不参与渲染。
# 重导时若把高清大图塞进 GLB，会重演「上千纹理 / 10 FPS」的老问题。
# 因此内嵌前统一缩档（只影响 GLB 内的死贴图，不影响 Godot 侧看到的高清外饰）。
EMBED_MAX = int(os.environ.get('COVERS_EMBED_MAX', '512'))
PBR_ON = os.environ.get('COVERS_PBR', '1') == '1'
PBR_MAP = {
    'metal': 'metal_panel', 'dark': 'metal_panel',
    'steel': 'brushed_steel', 'shell': 'shell_white', 'white': 'shell_white',
    'glass': 'glass', 'fabric': 'fabric', 'rubber': 'rubber',
    'wood': 'wood', 'card': 'wood', 'bark': 'wood', 'soil': 'rubber',
    'leaf': 'leaf', 'leaf2': 'leaf',
}
# glow / mark / red / water 保持纯色发光与主题色，不接贴图。
_TEX = {}


def _pbr_image(key, kind):
    # albedo 先用本机 SDXL 成品（只换内容，不增加图片数量 / 不改变 256² JPEG 档位）
    cands = []
    if SDXL_ON and kind == 'albedo':
        cands.append(os.path.join(SDXL_DIR, '%s_albedo.jpg' % key))
    cands.append(os.path.join(ROOT, '3d', 'assets', 'textures', 'pbr', '%s_%s.jpg' % (key, kind)))
    path = next((p for p in cands if os.path.exists(p)), None)
    if not path:
        return None
    k = (key, kind)
    if k not in _TEX:
        _TEX[k] = bpy.data.images.load(path, check_existing=True)
    img = _TEX[k]
    if path.startswith(SDXL_DIR) and EMBED_MAX > 0:
        w, h = img.size[0], img.size[1]
        if max(w, h) > EMBED_MAX:
            img.scale(EMBED_MAX, EMBED_MAX)   # 仅缩 GLB 内嵌副本，磁盘源图不动
    if kind != 'albedo':
        img.colorspace_settings.name = 'Non-Color'
    return img


def _attach_pbr(m, key):
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    nodes, links = nt.nodes, nt.links
    a = _pbr_image(key, 'albedo')
    if a:
        t = nodes.new('ShaderNodeTexImage'); t.image = a; t.label = 'pbr_albedo'
        links.new(t.outputs['Color'], b.inputs['Base Color'])
    r = _pbr_image(key, 'rough')
    if r:
        t = nodes.new('ShaderNodeTexImage'); t.image = r; t.label = 'pbr_rough'
        links.new(t.outputs['Color'], b.inputs['Roughness'])
    n = _pbr_image(key, 'normal')
    if n:
        t = nodes.new('ShaderNodeTexImage'); t.image = n; t.label = 'pbr_normal'
        nm = nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = 0.65
        links.new(t.outputs['Color'], nm.inputs['Color'])
        links.new(nm.outputs['Normal'], b.inputs['Normal'])


_MATS = {}


def mat(name, color, metallic=0.2, rough=0.6, emit=0.0):
    key = (name, color, metallic, rough, emit)
    if key in _MATS:
        return _MATS[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = color
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    if emit > 0:
        b.inputs['Emission Color'].default_value = color
        b.inputs['Emission Strength'].default_value = emit
    if PBR_ON:
        pkey = PBR_MAP.get(name.split('_')[-1])
        if pkey:
            _attach_pbr(m, pkey)
    _MATS[key] = m
    return m


def palette(rid):
    """每个舱一套：底色靠 theme.mark / theme.glow，金属与塑料是共用的中性档。"""
    th = room(rid)['theme']
    g = tuple(th['glow']) + (1.0,)
    mk = tuple(th['mark']) + (1.0,)
    p = rid + '_'
    return {
        'metal': mat(p + 'metal', (0.34, 0.37, 0.40, 1), 0.85, 0.36),
        'dark': mat(p + 'dark', (0.15, 0.17, 0.19, 1), 0.50, 0.55),
        # 0.62 + 0.90 的钢在棚灯下会糊成白片，压到 0.46 / 0.75 才看得出是金属件
        'steel': mat(p + 'steel', (0.46, 0.50, 0.54, 1), 0.75, 0.34),
        'glass': mat(p + 'glass', (0.62, 0.80, 0.86, 1), 0.00, 0.10, 0.10),
        # 大面积面板会把 1.0 的发光打到爆白，0.6 既能当屏幕又不刺眼
        'glow': mat(p + 'glow', g, 0.00, 0.40, 0.60),
        'mark': mat(p + 'mark', mk, 0.30, 0.45, 0.45),
        'white': mat(p + 'white', (0.84, 0.87, 0.89, 1), 0.15, 0.50),
        # 参考图（本地 SDXL，2026-11-07）里最一致的一条：**浅色外壳 + 深色内嵌面板**。
        # 不是纯白（棚灯下会爆），偏冷的 0.76/0.80/0.83 才像喷漆金属壳。
        'shell': mat(p + 'shell', (0.76, 0.80, 0.83, 1), 0.25, 0.42),
        'fabric': mat(p + 'fabric', (0.30, 0.40, 0.50, 1), 0.00, 0.90),
        'red': mat(p + 'red', (0.62, 0.14, 0.14, 1), 0.20, 0.50),
        'rubber': mat(p + 'rubber', (0.09, 0.10, 0.11, 1), 0.00, 0.85),
        'wood': mat(p + 'wood', (0.50, 0.36, 0.21, 1), 0.00, 0.80),
        'card': mat(p + 'card', (0.58, 0.46, 0.30, 1), 0.00, 0.90),
        # 生态舱专用（其它舱不用；多建几个未使用材质对 .blend 体积无实质影响）
        'leaf': mat(p + 'leaf', (0.20, 0.44, 0.24, 1), 0.00, 0.72),
        'leaf2': mat(p + 'leaf2', (0.30, 0.58, 0.30, 1), 0.00, 0.66),
        'bark': mat(p + 'bark', (0.28, 0.21, 0.15, 1), 0.00, 0.85),
        'soil': mat(p + 'soil', (0.20, 0.16, 0.12, 1), 0.00, 0.95),
        'water': mat(p + 'water', (0.16, 0.50, 0.62, 1), 0.10, 0.08, 0.22),
    }


# ---------------- 场景 ----------------
def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


def new_coll(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def _finish(obj, coll, m):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    obj.data.materials.append(m)
    return obj


# ---------------- 图元（z 一律是「底」；hcyl 是「中心」） ----------------
def box(coll, name, sx, sy, sz, x, y, z, m):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + sz / 2))
    o = bpy.context.object
    o.name = name
    o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(o, coll, m)


def cyl(coll, name, r, h, x, y, z, m, seg=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=h,
                                        location=(x, y, z + h / 2))
    o = bpy.context.object
    o.name = name
    return _finish(o, coll, m)


def hcyl(coll, name, r, length, x, y, z, m, axis='x', seg=10):
    """卧放的圆柱：x/y/z 是**中心**。axis='x' 时沿 X 躺（像滚轮 / 滚筒）。"""
    rot = (0, math.pi / 2, 0) if axis == 'x' else (math.pi / 2, 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=length,
                                        location=(x, y, z), rotation=rot)
    o = bpy.context.object
    o.name = name
    return _finish(o, coll, m)


def ico(coll, name, r, x, y, z, m, sub=2, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=r, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(o, coll, m)


def cone(coll, name, r, h, x, y, z, m, seg=10):
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r, radius2=0, depth=h,
                                    location=(x, y, z + h / 2))
    o = bpy.context.object
    o.name = name
    return _finish(o, coll, m)


def torus(coll, name, R, r, x, y, z, m, maj=16, mino=6, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r,
                                     major_segments=maj, minor_segments=mino,
                                     location=(x, y, z), rotation=rot)
    o = bpy.context.object
    o.name = name
    return _finish(o, coll, m)


def pivot_rotate(objs, pivot, axis='Z', deg=0.0):
    """把一组零件绕**同一个**支点转 deg 度。
    逐个绕自身中心转会把屏幕和它的发光面拆开（第一版终端就是这样错的）。"""
    bpy.context.view_layer.update()
    rot = math.radians(deg)
    for o in objs:
        v = o.location - pivot
        c, sn = math.cos(rot), math.sin(rot)
        if axis.upper() == 'Z':
            o.location = pivot + Vector((v.x * c - v.y * sn, v.x * sn + v.y * c, v.z))
        else:
            o.location = pivot + Vector((v.x, v.y * c - v.z * sn, v.y * sn + v.z * c))
        o.rotation_euler.rotate_axis(axis.upper(), rot)
    bpy.context.view_layer.update()


def slat(coll, name, sx, sy, sz, x, y, z, m, n, gap, axis='y'):
    """一排栅条 / 滚轮 / 栏杆：做货架层板下的支撑、传送带、护栏都靠它。"""
    out = []
    for i in range(n):
        off = (i - (n - 1) / 2.0) * gap
        if axis == 'y':
            out.append(box(coll, '%s%d' % (name, i), sx, sy, sz, x, y + off, z, m))
        else:
            out.append(box(coll, '%s%d' % (name, i), sx, sy, sz, x + off, y, z, m))
    return out


# ---------------- 尺寸 / 归一化 ----------------
def bbox(coll):
    # 关键：location / rotation_euler 改完不会立刻进 matrix_world，
    # 不强制更新的话 bbox 拿到的是上一帧的矩阵（第一版就因此把 7 米货架判成 1.4 宽）。
    bpy.context.view_layer.update()
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in coll.objects:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
            mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
    if mn.x > 1e8:
        return mn, mx
    return mn, mx


def normalize(coll):
    """把集合摆到「底面中心 = 世界原点」。导出前必须过这一步：
    否则建模时随手写的偏移会变成 Godot 里的悬空 / 错位。"""
    mn, mx = bbox(coll)
    if mn.x > 1e8:
        return
    dx = -(mn.x + mx.x) / 2.0
    dy = -(mn.y + mx.y) / 2.0
    dz = -mn.z
    for o in coll.objects:
        o.location += Vector((dx, dy, dz))


def bevel_main(coll, width=0.020, max_dim_min=0.26, min_dim_min=0.035,
               cap_ratio=0.96, segments=3):
    """给「主体积」加一道 1 段倒角，**带面数预算**。

    为什么是倒角而不是贴图：这套场景的美术特征是金属边缘有一道亮线，
    硬 90° 的方盒子在引擎里读起来就是"没做完"。12mm 斜边不改轮廓，但高光立刻不一样。

    预算：按体积从大到小挑，每件先用 `2 × 边数` 估算增量（1 段倒角≈每条边多 2 个三角），
    超过 `BUDGET_TRIS × cap_ratio` 就停手 —— 货架/反应堆那种几十根梁的模型，
    全倒一遍会从 840 涨到 2400（实测），只倒最大的几件收益一样、面数只有一半。
    """
    bpy.context.view_layer.update()
    total = tri_count(list(coll.objects))
    # 给 shell_pass 的 6 个新 box（约 72 tris）留余量，否则会擦着预算线超出去
    cap = BUDGET_TRIS * cap_ratio - 400   # 给 shell_pass + sight_extend 留面数
    cand = []
    for o in list(coll.objects):
        if o.type != 'MESH':
            continue
        dims = o.dimensions
        if max(dims) < max_dim_min or min(dims) < min_dim_min:
            continue
        cand.append((dims.x * dims.y * dims.z, o))
    cand.sort(key=lambda x: -x[0])
    n = 0
    for _vol, o in cand:
        est = 2 * len(o.data.edges)
        if total + est > cap:
            continue
        m = o.modifiers.new('bev', 'BEVEL')
        m.width = width
        m.segments = segments
        m.limit_method = 'ANGLE'
        m.angle_limit = math.radians(40)
        m.miter_outer = 'MITER_ARC'
        for ob in bpy.context.selected_objects:
            ob.select_set(False)
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        before = tri_count([o])
        bpy.ops.object.modifier_apply(modifier=m.name)
        o.select_set(False)
        total += tri_count([o]) - before
        n += 1
    return n


def tri_count(objs):
    n = 0
    for o in objs:
        if o.type != 'MESH':
            continue
        o.data.calc_loop_triangles()
        n += len(o.data.loop_triangles)
    return n


# ---------------- 进深补齐 ----------------
def depth_ext(coll, P, kind, limit=1.30):
    """薄型家具（屏幕墙 / 柜台 / 床 / 压缩机）在地图里占的**进深**往往比建模大，
    Godot 会把它们纵深拉 1.4~2.2 倍，屏框、把手全被拉长。

    这里补一组「后机架」把进深撑到 `map_d / limit`，比值就落回 1.30 以内。
    机架是参考图里本来就有的语言（设备背后有支架/机柜），不是硬凑的方块：
    两根立柱 + 横梁 + 背板 + 一条嵌入发光缝。床用整块床头板替代。
    """
    bpy.context.view_layer.update()
    mn, mx = bbox(coll)
    if mn.x > 1e8:
        return 0
    W, D = ref_footprint(kind)
    w, d, h = mx.x - mn.x, mx.y - mn.y, mx.z - mn.z
    need = D / limit - d
    if need <= 0.15:
        return 0
    y = d / 2 + need - 0.11
    zmax = min(h * 0.86, TIER_H[tier_of(kind)] * 0.95)
    n = 0
    if 'bed' in kind:
        box(coll, 'depthhead', w * 0.92, 0.10, zmax * 0.62,
            (mn.x + mx.x) / 2, y + 0.05, 0.0, P['dark'])
        box(coll, 'depthheadtrim', w * 0.96, 0.05, 0.05,
            (mn.x + mx.x) / 2, y + 0.10, zmax * 0.62, P['mark'])
        n += 2
    else:
        cx = (mn.x + mx.x) / 2
        for sx in (-1, 1):
            box(coll, 'depthpost%d' % (sx + 1), 0.08, 0.10, zmax,
                cx + sx * w * 0.38, y, 0.0, P['dark'])
            n += 1
        box(coll, 'depthbeam', w * 0.82, 0.10, 0.08, cx, y, zmax - 0.08, P['metal'])
        box(coll, 'depthpanel', w * 0.72, 0.06, zmax * 0.52, cx, y + 0.02,
            zmax * 0.18, P['dark'])
        box(coll, 'depthglow', w * 0.60, 0.015, 0.015, cx, y - 0.04,
            zmax * 0.56, P['glow'])
        n += 3
    return n


# ---------------- 视线遮挡高度 ----------------
def sight_extend(coll, P, kind):
    """把掩体补到 `SIGHT_MIN_H`，**不拉伸原几何**。

    做法：在占地的后缘立一块从「家具顶面」到 1.70 的暗色背板（分上下两段，
    中间留一条主题色发光缝），两侧各一根落地立柱，顶部一根梁。
    这样任意水平方向看过去都有一块 ≥1.70 的不透明面，和 2.5D 的 los() 一致；
    家具本体（茶几 / 水池 / 吧凳 / 货架）保持原来的比例与细节，不会被纵向拉长。

    背板语言与 `shell_pass()` / 设备点一致：暗色金属 + 主题色发光缝，
    参考图里本来就有「设备工位背后一块高背板」这种结构。
    """
    if SIGHT_MIN_H <= 0:
        return 0
    bpy.context.view_layer.update()
    mn, mx = bbox(coll)
    if mn.x > 1e8:
        return 0
    top = mx.z
    if top >= SIGHT_MIN_H - 0.01:
        return 0
    rise = SIGHT_MIN_H - top
    w, d = mx.x - mn.x, mx.y - mn.y
    cx, cy = (mn.x + mx.x) / 2.0, (mn.y + mx.y) / 2.0
    yb = cy + d / 2.0 - 0.05          # 后缘内侧，不扩大占地
    # 结构件全部用暗色金属，最后 join 成**一个**网格：
    # 127 件 cover 每件少 5 个绘制节点，眼高视角的帧率不再被补高结构拖垮。
    parts = []
    lo_h = rise * 0.46
    hi_z = top + rise * 0.58
    parts.append(box(coll, 'sightpanel_lo', w * 0.86, 0.07, lo_h, cx, yb, top, P['dark']))
    parts.append(box(coll, 'sightpanel_hi', w * 0.86, 0.07, SIGHT_MIN_H - hi_z, cx, yb, hi_z, P['dark']))
    for sx in (-1, 1):
        parts.append(box(coll, 'sightpost%d' % (sx + 1), 0.07, 0.08, SIGHT_MIN_H,
                         cx + sx * w * 0.42, yb, 0.0, P['dark']))
    parts.append(box(coll, 'sightbeam', w * 0.92, 0.09, 0.06, cx, yb,
                     SIGHT_MIN_H - 0.06, P['dark']))
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    parts[0].name = 'sight_shell'
    # 发光缝独立一个对象（唯一需要不同材质的件）
    box(coll, 'sightglow', w * 0.76, 0.02, rise * 0.09, cx, yb - 0.045,
        top + rise * 0.49, P['glow'])
    return 2


# ---------------- 参考图语言的通用工序 ----------------
# 四张本地参考图（驾驶舱/仓库/医疗/军械）给出的共同规律，按重要性排序：
#   ① 浅色外壳 + 深色内嵌面板（不是通体深灰的"黑铁块"）
#   ② 顶面外凸压边，压暗一档，让轮廓有层次
#   ③ 嵌入式发光缝，藏在压边下面而不是贴在表面
#   ④ 底部内收踢脚，家具不是整块杵在地上
# 这道工序对全部 61 件生效；生态舱是植物/水体为主，已手工做过，跳过。
SKIP_SHELL_ROOMS = {'ecosys'}
# 已经自带八边形切角外壳的件，方形压边反而会破坏轮廓
SKIP_SHELL_KINDS = {'bridge_table'}
SHELL_PARTS = ('body', 'base', 'cabinet', 'console', 'case', 'plinth',
               'core', 'hull', 'housing', 'frame')
# 这些是面板/液体/植被，绝不能被当成主体刷白
NO_SHELL = ('glow', 'led', 'screen', 'glass', 'water', 'liquid', 'leaf',
            'canopy', 'bush', 'sprout', 'soil', 'lamp', 'planter', 'rim',
            'tray', 'shelf', 'post', 'leg', 'root', 'trunk', 'reed', 'lily',
            'spore', 'flower', 'toe', 'kick', 'piping', 'pipe')


def shell_pass(coll, P, kind):
    """给一个 kind 补上「外壳 / 压边 / 发光缝 / 踢脚」四层，返回新增零件数。"""
    if kind.split('_')[0] in SKIP_SHELL_ROOMS:
        return 0
    bpy.context.view_layer.update()
    gmn, gmx = bbox(coll)
    if gmn.x > 1e8:
        return 0
    meshes = [o for o in coll.objects if o.type == 'MESH']
    if not meshes:
        return 0

    def vol(o):
        d = o.dimensions
        return d.x * d.y * d.z

    named = [o for o in meshes
             if any(t in o.name.lower() for t in SHELL_PARTS)
             and not any(t in o.name.lower() for t in NO_SHELL)
             and max(o.dimensions) >= 0.45]
    if not named:
        named = [o for o in meshes
                 if not any(t in o.name.lower() for t in NO_SHELL)
                 and max(o.dimensions) >= 0.60 and o.dimensions.z >= 0.20]
    if not named:
        return 0
    main = max(named, key=vol)

    # ① 主体积换浅色外壳（只换第 0 个材质槽，保留其余槽位）
    if main.data.materials:
        main.data.materials[0] = P['shell']
    else:
        main.data.materials.append(P['shell'])

    # ② 顶面四条外凸压边（沿主体自己的包围盒，不沿全场）
    bpy.context.view_layer.update()
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for c in main.bound_box:
        w = main.matrix_world @ Vector(c)
        mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
        mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
    w, d = mx.x - mn.x, mx.y - mn.y
    cx, cy = (mn.x + mx.x) / 2, (mn.y + mx.y) / 2
    top = mx.z
    # 压边比主体探出 2cm；仓库/军械用警示色，其余用暗色
    # 压边统一压暗一档。试过用各舱主题色做整圈压边，结果仓库/配电的
    # 琥珀色顶框连成一片黄块，比模型本身还抢眼；主题色只交给**发光缝**（glow）。
    trim = P['dark']
    n = 0
    for sy in (-1, 1):
        box(coll, 'shellrim%d' % (sy + 1), w + 0.04, 0.05, 0.045,
                    cx, cy + sy * (d / 2 - 0.01), top - 0.045, trim)
        n += 1
    for sx in (-1, 1):
        box(coll, 'shellrims%d' % (sx + 1), 0.05, d - 0.04, 0.045,
            cx + sx * (w / 2 - 0.01), cy, top - 0.045, trim)
        n += 1

    # ③ 嵌入式发光缝：藏在正面压边之下，不贴表面
    box(coll, 'shellglow', w * 0.80, 0.014, 0.012,
        cx, cy - d / 2 - 0.018, top - 0.055, P['glow'])
    n += 1

    # ④ 底部暗色压边：贴**全场**包围盒底缘外凸 2cm。
    # 不垫在底面之下 —— 那会让整件长高 7cm，连带 cover_refs 与 Godot 高度表失配，
    # 纵向被压 6~9%。四条边条只增加 X/Y 各 2cm，高度完全不变。
    gw, gd = gmx.x - gmn.x, gmx.y - gmn.y
    gx, gy = (gmn.x + gmx.x) / 2, (gmn.y + gmx.y) / 2
    for sy in (-1, 1):
        box(coll, 'shelltoe%d' % (sy + 1), gw + 0.04, 0.05, 0.07,
            gx, gy + sy * (gd / 2 - 0.01), gmn.z, P['rubber'])
        n += 1
    for sx in (-1, 1):
        box(coll, 'shelltoes%d' % (sx + 1), 0.05, gd - 0.04, 0.07,
            gx + sx * (gw / 2 - 0.01), gy, gmn.z, P['rubber'])
        n += 1
    return n


# ---------------- 导出 ----------------
def export_one(kind, coll):
    normalize(coll)
    bevel_main(coll)
    shell_pass(coll, palette(kind.split('_')[0]), kind)
    sight_extend(coll, palette(kind.split('_')[0]), kind)
    normalize(coll)          # 补完遮挡结构后再贴一次地
    objs = list(coll.objects)
    tris = tri_count(objs)
    blend = os.path.join(MODEL_DIR, kind + '.blend')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    out = os.path.join(EXPORT_DIR, kind + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=out, export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
        export_extras=True, export_materials='EXPORT', export_image_format='AUTO')
    return {'kind': kind, 'tier': tier_of(kind), 'objects': len(objs), 'tris': tris,
            'kb': round(os.path.getsize(out) / 1024.0, 1), 'over_budget': tris > BUDGET_TRIS}


# ---------------- 检查板 ----------------
def _label(text, x, y, size):
    """平躺在地面上的资产名（默认文字就在 XY 平面、朝 +Z，不要转）。"""
    cu = bpy.data.curves.new(type='FONT', name='lbl_' + text)
    cu.body = text
    cu.size = size
    cu.align_x = 'CENTER'
    o = bpy.data.objects.new('lbl_' + text, cu)
    bpy.context.scene.collection.objects.link(o)
    o.location = (x, y, 0.012)
    o.data.materials.append(mat('cover_label', (0.70, 0.78, 0.86, 1), 0.0, 0.6, 0.6))
    return o


def _rotate_z90(coll):
    """把集合整体绕原点转 90°：让**长边躺到 X 轴**。
    检查板是从 -Y 方向看的，长边留在 Y 上就会变成一根竖塔（货架 6.9 米那次就是这样）。"""
    for o in coll.objects:
        x, y = o.location.x, o.location.y
        o.location.x, o.location.y = -y, x
        o.rotation_euler.z += math.pi / 2


def checker_board(rid, builders, png, max_row_w=17.0, gap=2.0, tilt=58.0, aspect=1.9):
    """tilt 是相机绕 X 轴的旋转角，**俯角 = 90° - tilt**。
    之前写成 26° 实际是 64° 俯视，所有柜子/桌子被拍成扁平矩形，
    白白误判了好几轮「模型像白板」；62°（俯角 28°）才是参考图的 3/4 侧视。
    所有 kind 按行排开、加地面与灯、出正交 3/4 检查板。"""
    clear_scene()
    P = palette(rid)
    cells = []
    for kind, fn in builders.items():
        coll = new_coll(kind)
        fn(coll, P)
        normalize(coll)
        bevel_main(coll)
        shell_pass(coll, P, kind)
        sight_extend(coll, P, kind)
        normalize(coll)
        mn, mx = bbox(coll)
        if (mx.y - mn.y) > (mx.x - mn.x) + 0.05:
            _rotate_z90(coll)
            normalize(coll)
            mn, mx = bbox(coll)
        cells.append({'kind': kind, 'coll': coll,
                      'w': mx.x - mn.x, 'd': mx.y - mn.y, 'h': mx.z})
        print('[board] %-24s w=%.2f d=%.2f h=%.2f' % (kind, mx.x - mn.x, mx.y - mn.y, mx.z))

    x = 0.0
    row_y = 0.0
    row_d = 0.0
    row = 0
    for c in cells:
        if x > 0 and x + c['w'] > max_row_w:
            row_y += row_d + gap
            x = 0.0
            row_d = 0.0
            row += 1
        c['x'] = x + c['w'] / 2.0
        c['y'] = row_y + c['d'] / 2.0
        c['row'] = row
        print('[board] place %-24s x=%.2f y=%.2f' % (c['kind'], c['x'], c['y']))
        x += c['w'] + gap
        row_d = max(row_d, c['d'])

    row_front = {}
    for c in cells:
        row_front[c['row']] = min(row_front.get(c['row'], 1e9), c['y'] - c['d'] / 2.0)

    left = min(c['x'] - c['w'] / 2.0 for c in cells)
    right = max(c['x'] + c['w'] / 2.0 for c in cells)
    front = min(c['y'] - c['d'] / 2.0 for c in cells)
    back = max(c['y'] + c['d'] / 2.0 for c in cells)
    total_w = right - left
    total_d = back - front
    max_h = max(c['h'] for c in cells)
    ox = -(left + right) / 2.0
    oy = -(front + back) / 2.0

    for c in cells:
        for o in c['coll'].objects:
            o.location += Vector((c['x'] + ox, c['y'] + oy, 0.0))
        _label(c['kind'], c['x'] + ox, row_front[c['row']] + oy - 0.42,
               min(0.30, max(0.15, c['w'] / (len(c['kind']) * 0.62))))

    span = max(total_w, total_d) + 30.0
    bpy.ops.mesh.primitive_plane_add(size=span, location=(0, 0, -0.004))
    g = bpy.context.object
    g.name = 'checker_ground'
    g.data.materials.append(mat('cover_ground', (0.050, 0.060, 0.070, 1), 0.0, 0.92))

    th = math.radians(tilt)
    zc = max_h * 0.55
    dist = 40.0
    # 真正的 3/4：除了俯角，还要有**横向偏角**（相机往 +X 挪），
    # 否则薄型柜体从正前方看永远是一条横条，看不到侧面厚度与倒角。
    bpy.ops.object.camera_add(location=(total_w * 0.24, -dist * math.sin(th),
                                        zc + dist * math.cos(th)))
    cam = bpy.context.object
    cam.rotation_euler = (Vector((0, 0, zc)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.type = 'ORTHO'
    cam.data.clip_start = 0.1
    cam.data.clip_end = 400.0
    # 标签压在每排前沿之外 0.42 米、字高 0.3，取景必须把它算进去，否则最后一行会被裁掉
    scene_h = total_d * math.sin(th) + max_h * math.cos(th) + 1.3
    cam.data.ortho_scale = max(total_w + 1.4, scene_h * aspect) * 1.03
    bpy.context.scene.camera = cam

    bpy.ops.object.light_add(type='AREA', location=(-total_w * 0.22, -total_d * 0.5 - 6, 9))
    key = bpy.context.object
    key.data.energy = 1500
    key.data.size = 12
    bpy.ops.object.light_add(type='AREA', location=(total_w * 0.25, total_d * 0.3, 7))
    fill = bpy.context.object
    fill.data.energy = 520
    fill.data.size = 10
    bpy.ops.object.light_add(type='AREA', location=(total_w * 0.1, total_d * 0.55 + 8, 5))
    rim = bpy.context.object
    rim.data.energy = 700
    rim.data.size = 14
    bpy.ops.object.light_add(type='SUN', location=(4, 6, 14))
    sun = bpy.context.object
    sun.data.energy = 1.1

    scene = bpy.context.scene
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    world = scene.world or bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value = (0.032, 0.042, 0.052, 1)
        bg.inputs['Strength'].default_value = 0.9
    scene.eevee.taa_render_samples = 48
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = png
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(MODEL_DIR, 'covers_%s.blend' % rid))
    bpy.ops.render.render(write_still=True)


def run(rid, builders, tag=None):
    """一个舱一次跑完：逐类导出（各自 .blend + .glb），再出一张检查板。"""
    tag = tag or rid
    os.makedirs(MODEL_DIR, exist_ok=True)
    os.makedirs(EXPORT_DIR, exist_ok=True)
    os.makedirs(RENDER_DIR, exist_ok=True)
    results = []
    for kind, fn in builders.items():
        clear_scene()
        coll = new_coll(kind)
        fn(coll, palette(rid))
        results.append(export_one(kind, coll))
        print('[covers] %-24s tier=%-6s objects=%2d tris=%5d %6.1f KB %s'
              % (kind, results[-1]['tier'], results[-1]['objects'], results[-1]['tris'],
                 results[-1]['kb'], 'OVER' if results[-1]['over_budget'] else ''))
    png = os.path.join(RENDER_DIR, 'covers-%s.png' % tag)
    if os.environ.get('COVERS_SKIPBOARD') == '1':
        # GPU 被别的活占着时（比如同时跑 SDXL 参考图）只导出、不出检查板
        print('[covers] SKIPBOARD %s' % png)
    else:
        checker_board(rid, builders, png)
    print('[covers] RESULT ' + json.dumps({
        'room': rid, 'png': os.path.relpath(png, ROOT).replace('\\', '/'),
        'assets': results, 'over_budget': [r['kind'] for r in results if r['over_budget']],
    }, ensure_ascii=False))
