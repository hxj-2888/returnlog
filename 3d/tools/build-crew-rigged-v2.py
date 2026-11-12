# =============================================================
# build-crew-rigged-v2.py · 船员 3D 低模（2026-11-11 重做版）
# -------------------------------------------------------------
# 依据：docs/qwen21/crew-refs/crew-turnaround_768.png / crew-detail_768.png
# 重做原因：旧版躯干/四肢是方块拼贴、头是 12×8 球体贴照片脸，近看“伪人”。
# 本版：
#   · 躯干/四肢改为截面放样，肩/肘/膝用球体过渡，服饰细节进 768² UV 图集；
#   · 头是独立 20 段放样头型（下颌、颧骨、后脑），脸用正面平面 UV 贴图，
#     头发是独立几何（低模发盖 + 碎发），不再把发际线画在球面上；
#   · 保留 17 根形变骨与 idle / walk / knife / down 四个动作（行走手感不变）。
# 产物：
#   3d/assets/models/char_crew_lowpoly.blend
#   3d/assets/export/char_crew_lowpoly.glb
# 用法：
#   "E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b \
#     -P 3d/tools/build-crew-rigged-v2.py
# =============================================================
import bpy
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS = os.path.join(ROOT, '3d', 'assets', 'models')
EXPORTS = os.path.join(ROOT, '3d', 'assets', 'export')
CREW_TEX = os.path.join(ROOT, '3d', 'assets', 'textures', 'crew')
ASSET_ID = 'char_crew_lowpoly'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import crew_atlas as AT  # noqa: E402

if tuple(bpy.app.version[:2]) < (5, 2):
    raise SystemExit('[crew-rigged] 需要 Blender 5.2+（权威版 5.2.2 LTS）')

TAU = math.pi * 2.0


def _img(path, non_color=False):
    if not path or not os.path.exists(path):
        return None
    im = bpy.data.images.load(path, check_existing=True)
    if non_color:
        im.colorspace_settings.name = 'Non-Color'
    return im


def material(name, albedo, normal=None, metallic=0.0, rough=0.7):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = False
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = rough
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    alb = _img(albedo)
    if alb is not None:
        t = nodes.new('ShaderNodeTexImage')
        t.image = alb
        t.label = 'albedo'
        links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    nrm = _img(normal, True)
    if nrm is not None:
        t = nodes.new('ShaderNodeTexImage')
        t.image = nrm
        t.label = 'normal'
        nm = nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = 0.55
        links.new(t.outputs['Color'], nm.inputs['Color'])
        links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def deselect():
    bpy.ops.object.select_all(action='DESELECT')


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def mesh_obj(name, verts, faces, mat, uvs, weights):
    """uvs: 每顶点 (u,v)；weights: {bone: {vi: w}} 或 {bone: 1.0}。"""
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    me.update()
    ob = bpy.data.objects.new(name, me)
    link(ob)
    me.materials.append(mat)
    uv = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        poly.use_smooth = True
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            uv.data[li].uv = uvs[vi]
    for bone, spec in weights.items():
        vg = ob.vertex_groups.new(name=bone)
        if isinstance(spec, dict):
            for vi, w in spec.items():
                if w > 0.0001:
                    vg.add([vi], float(w), 'REPLACE')
        else:
            vg.add(list(range(len(verts))), float(spec), 'REPLACE')
    return ob


def tube(name, rings, segments, region, mat, weight, cap=True, fv0=0.0, fv1=1.0):
    """rings: [(z, rx, ry, cx, cy)]；UV 正前方 u=0.5、背后接缝。"""
    verts, uvs, faces = [], [], []
    n = len(rings)
    for ri, (z, rx, ry, cx, cy) in enumerate(rings):
        fv = fv0 + (fv1 - fv0) * ri / float(n - 1)
        for j in range(segments + 1):
            th = -math.pi + TAU * j / segments
            verts.append((cx + rx * math.sin(th), cy + ry * math.cos(th), z))
            uvs.append(AT.region_uv(region, j / float(segments), fv))
    for ri in range(n - 1):
        for j in range(segments):
            a = ri * (segments + 1) + j
            faces.append((a, a + 1, a + segments + 2, a + segments + 1))
    if cap:
        bottom = len(verts)
        verts.append((rings[0][3], rings[0][4], rings[0][0]))
        uvs.append(AT.region_uv(region, 0.5, fv0))
        for j in range(segments):
            faces.append((bottom, j + 1, j))
        top = len(verts)
        verts.append((rings[-1][3], rings[-1][4], rings[-1][0]))
        uvs.append(AT.region_uv(region, 0.5, fv1))
        base = (n - 1) * (segments + 1)
        for j in range(segments):
            faces.append((top, base + j, base + j + 1))
    return mesh_obj(name, verts, faces, mat, uvs, weight)


def cap_uvs(ob, region, weights):
    """球体/方块类零件：投影到图集某个区域，避免默认 UV 落到 0..1 满图。"""
    me = ob.data
    if me.uv_layers.active is None:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers.active
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    z0, z1 = min(zs), max(zs)
    for poly in me.polygons:
        n = poly.normal
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if abs(n.z) >= max(abs(n.x), abs(n.y)):
                a = (co.x - x0) / max(1e-6, x1 - x0)
                b = (co.y - y0) / max(1e-6, y1 - y0)
            elif abs(n.x) >= abs(n.y):
                a = (co.y - y0) / max(1e-6, y1 - y0)
                b = (co.z - z0) / max(1e-6, z1 - z0)
            else:
                a = (co.x - x0) / max(1e-6, x1 - x0)
                b = (co.z - z0) / max(1e-6, z1 - z0)
            uv.data[li].uv = AT.region_uv(region, 0.04 + 0.92 * a, 0.04 + 0.92 * b)
    for bone, spec in weights.items():
        vg = ob.vertex_groups.new(name=bone)
        vg.add(list(range(len(me.vertices))), float(spec), 'REPLACE')
    for poly in me.polygons:
        poly.use_smooth = True
    return ob


def rounded_box(name, size, loc, mat, bone, region, bevel=0.015, seg=3):
    deselect()
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(mat)
    if bevel > 0.0:
        mod = ob.modifiers.new('bev', 'BEVEL')
        mod.width = bevel
        mod.segments = seg
        mod.limit_method = 'ANGLE'
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    cap_uvs(ob, region, {bone: 1.0})
    return ob


def sphere_part(name, loc, scale, mat, bone, region, seg=16, rings=10):
    deselect()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings,
                                        radius=1.0, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(mat)
    cap_uvs(ob, region, {bone: 1.0})
    return ob


# ---- 躯干截面（z, 半宽, 半深, 中心x, 中心y） ----
TORSO = [
    (0.86, 0.130, 0.095, 0.0, 0.000),
    (0.90, 0.155, 0.105, 0.0, 0.000),
    (0.95, 0.160, 0.108, 0.0, 0.002),
    (1.00, 0.154, 0.103, 0.0, 0.002),
    (1.06, 0.149, 0.100, 0.0, 0.003),
    (1.12, 0.157, 0.105, 0.0, 0.005),
    (1.18, 0.169, 0.114, 0.0, 0.006),
    (1.26, 0.181, 0.121, 0.0, 0.007),
    (1.34, 0.188, 0.119, 0.0, 0.004),
    (1.40, 0.183, 0.111, 0.0, 0.001),
    (1.44, 0.168, 0.104, 0.0, 0.000),
    (1.47, 0.132, 0.094, 0.0, 0.000),
    (1.50, 0.083, 0.074, 0.0, 0.000),
]


def torso_at(z):
    for i in range(len(TORSO) - 1):
        z0, rx0, ry0, cx0, cy0 = TORSO[i]
        z1, rx1, ry1, cx1, cy1 = TORSO[i + 1]
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return (rx0 + (rx1 - rx0) * t, ry0 + (ry1 - ry0) * t,
                    cx0 + (cx1 - cx0) * t, cy0 + (cy1 - cy0) * t)
    return TORSO[-1][1], TORSO[-1][2], TORSO[-1][3], TORSO[-1][4]


def torso_weights(z):
    if z <= 1.00:
        return {'hips': 1.0}
    if z <= 1.18:
        t = (z - 1.00) / 0.18
        return {'hips': 1.0 - t, 'spine': t}
    if z <= 1.40:
        t = (z - 1.18) / 0.22
        return {'spine': 1.0 - t, 'chest': t}
    return {'chest': 1.0}


def build_torso(suit):
    verts, uvs, faces = [], [], []
    n = len(TORSO)
    seg = 24
    for z, rx, ry, cx, cy in TORSO:
        fv = (z - AT.TORSO_Z0) / (AT.TORSO_Z1 - AT.TORSO_Z0)
        for j in range(seg + 1):
            th = -math.pi + TAU * j / seg
            verts.append((cx + rx * math.sin(th), cy + ry * math.cos(th), z))
            uvs.append(AT.region_uv('torso', j / float(seg), fv))
    for ri in range(n - 1):
        for j in range(seg):
            a = ri * (seg + 1) + j
            faces.append((a, a + 1, a + seg + 2, a + seg + 1))
    bottom = len(verts)
    verts.append((0, 0, 0.86))
    uvs.append(AT.region_uv('torso', 0.5, 0.0))
    for j in range(seg):
        faces.append((bottom, j + 1, j))
    top = len(verts)
    verts.append((0, 0, 1.50))
    uvs.append(AT.region_uv('torso', 0.5, 1.0))
    base = (n - 1) * (seg + 1)
    for j in range(seg):
        faces.append((top, base + j, base + j + 1))

    w = {'hips': {}, 'spine': {}, 'chest': {}}
    for vi in range(len(verts)):
        for bone, val in torso_weights(verts[vi][2]).items():
            w[bone][vi] = val
    return mesh_obj('torso', verts, faces, suit, uvs, w)


def build_neck(skin):
    return tube('neck', [(1.49, 0.060, 0.058, 0, 0.002),
                          (1.53, 0.057, 0.055, 0, 0.004),
                          (1.565, 0.052, 0.050, 0, 0.006)],
                16, 'skin', skin, {'neck': 1.0}, cap=True)


def build_head(skin, face_mat):
    """20 段放样头型；正面多边形改用脸材质 + 平面 UV。"""
    prof = [
        (1.545, 0.050, 0.050, 0.000, 0.010),
        (1.565, 0.056, 0.060, 0.000, 0.014),
        (1.585, 0.070, 0.076, 0.000, 0.010),
        (1.610, 0.080, 0.089, 0.000, 0.006),
        (1.638, 0.085, 0.096, 0.000, 0.002),
        (1.666, 0.087, 0.098, 0.000, -0.003),
        (1.694, 0.084, 0.094, 0.000, -0.007),
        (1.718, 0.076, 0.085, 0.000, -0.012),
        (1.740, 0.058, 0.067, 0.000, -0.016),
        (1.754, 0.030, 0.036, 0.000, -0.018),
        (1.760, 0.000, 0.000, 0.000, -0.018),
    ]
    seg = 20
    verts, uvs, faces = [], [], []
    for z, rx, ry, cx, cy in prof[:-1]:
        for j in range(seg + 1):
            th = -math.pi + TAU * j / seg
            verts.append((cx + rx * math.sin(th), cy + ry * math.cos(th), z))
            uvs.append(AT.region_uv('skin', 0.5, 0.5))
    for ri in range(len(prof) - 2):
        for j in range(seg):
            a = ri * (seg + 1) + j
            faces.append((a, a + 1, a + seg + 2, a + seg + 1))
    top = len(verts)
    z, _, _, cx, cy = prof[-1]
    verts.append((cx, cy, z))
    uvs.append(AT.region_uv('skin', 0.5, 0.5))
    base = (len(prof) - 2) * (seg + 1)
    for j in range(seg):
        faces.append((top, base + j, base + j + 1))
    bottom = len(verts)
    z, _, _, cx, cy = prof[0]
    verts.append((cx, cy, z))
    uvs.append(AT.region_uv('skin', 0.5, 0.5))
    for j in range(seg):
        faces.append((bottom, j + 1, j))

    me = bpy.data.meshes.new('head')
    me.from_pydata(verts, [], faces)
    me.validate()
    me.update()
    ob = bpy.data.objects.new('head', me)
    link(ob)
    me.materials.append(skin)
    me.materials.append(face_mat)
    uv = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        poly.use_smooth = True
        c = poly.center
        is_face = c.y > -0.005 and 1.565 <= c.z <= 1.700 and abs(c.x) < 0.092
        poly.material_index = 1 if is_face else 0
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            if is_face:
                co = me.vertices[vi].co
                u = 0.5 + co.x / 0.180
                v = (co.z - 1.565) / 0.135
                uv.data[li].uv = (max(0.0, min(1.0, u)), max(0.0, min(1.0, v)))
            else:
                uv.data[li].uv = uvs[vi]
    vg = ob.vertex_groups.new(name='head')
    vg.add(list(range(len(verts))), 1.0, 'REPLACE')
    return ob


def build_hair(hair_mat):
    """低模发盖：发际线随角度变化，前额碎发，后脑盖到枕部。"""
    seg = 24
    rings = 5
    verts, uvs, faces = [], [], []
    z_top = 1.770
    for ri in range(rings):
        t = ri / float(rings - 1)
        for j in range(seg + 1):
            th = -math.pi + TAU * j / seg
            c = math.cos(th)
            z_low = 1.686 - 0.043 * (1.0 - max(0.0, c)) - 0.018 * max(0.0, -c)
            # 前额碎发：三个向下的发尖，避免整顶“游泳帽”式硬边
            fringe = max(0.0, math.cos(th * 6.0)) * max(0.0, c)
            z_low -= 0.014 * fringe
            z_low += 0.008 * math.cos(th * 9.0)
            z = z_low + (z_top - z_low) * (t ** 0.72)
            if z >= 1.74:
                rx, ry, cy = 0.035, 0.043, -0.016
            elif z >= 1.718:
                rx, ry, cy = 0.076, 0.085, -0.012
            elif z >= 1.694:
                rx, ry, cy = 0.084, 0.094, -0.007
            elif z >= 1.666:
                rx, ry, cy = 0.087, 0.098, -0.003
            else:
                rx, ry, cy = 0.085, 0.095, 0.000
            off = 0.012 + 0.005 * math.sin(th * 3.0 + t * 2.0) \
                + 0.003 * math.sin(th * 7.0 - t * 4.0)
            verts.append(((rx + off) * math.sin(th),
                          cy + (ry + off) * math.cos(th), z))
            uvs.append((j / float(seg), t))
    for ri in range(rings - 1):
        for j in range(seg):
            a = ri * (seg + 1) + j
            faces.append((a, a + 1, a + seg + 2, a + seg + 1))
    top = len(verts)
    verts.append((0, -0.018, z_top + 0.003))
    uvs.append((0.5, 1.0))
    base = (rings - 1) * (seg + 1)
    for j in range(seg):
        faces.append((top, base + j, base + j + 1))
    return mesh_obj('hair', verts, faces, hair_mat, uvs, {'head': 1.0})


def build_nose(face_mat):
    ob = sphere_part('nose', (0, 0.082, 1.636), (0.026, 0.026, 0.045),
                     face_mat, 'head', 'skin', seg=12, rings=8)
    me = ob.data
    uv = me.uv_layers.active
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = ob.matrix_world @ me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (max(0.0, min(1.0, 0.5 + co.x / 0.160)),
                              max(0.0, min(1.0, (co.z - 1.565) / 0.135)))
    return ob


def build_ear(side, sx, skin):
    return sphere_part('ear_' + side, (0.086 * sx, -0.002, 1.642),
                       (0.012, 0.020, 0.030), skin, 'head', 'skin', seg=10, rings=6)


def build_fringe(hair_mat):
    """前额刘海：一片连续、下缘起伏的薄发片，盖住发盖的硬直边。"""
    verts, uvs, faces = [], [], []
    seg = 20
    th0, th1 = -0.95, 0.95
    for j in range(seg + 1):
        th = th0 + (th1 - th0) * j / seg
        zb = 1.672 + 0.010 * math.cos(th * 5.0) + 0.005 * math.sin(th * 11.0)
        for zz, off in ((1.705, 0.013), (zb, 0.016)):
            verts.append(((0.082 + off) * math.sin(th),
                          -0.006 + (0.092 + off) * math.cos(th), zz))
            uvs.append((0.5 + th / TAU, 0.95 if zz > 1.69 else 0.70))
    for j in range(seg):
        a = j * 2
        faces.append((a, a + 1, a + 3, a + 2))
    return mesh_obj('fringe', verts, faces, hair_mat, uvs, {'head': 1.0})


def build_arm(side, sx, suit, gear):
    ua, fa, hd = 'upper_arm.' + side, 'forearm.' + side, 'hand.' + side
    region = 'arm_l' if sx > 0 else 'arm_r'
    parts = []
    parts.append(sphere_part('shoulder_' + side, (0.176 * sx, 0, 1.428),
                             (0.073, 0.070, 0.073), suit, ua, region))
    parts.append(tube('upper_arm_' + side, [
        (1.430, 0.058, 0.058, 0.190 * sx, 0.0),
        (1.330, 0.057, 0.056, 0.198 * sx, 0.0),
        (1.230, 0.053, 0.052, 0.203 * sx, 0.0),
        (1.150, 0.050, 0.049, 0.206 * sx, 0.0),
    ], 14, region, suit, {ua: 1.0}))
    parts.append(sphere_part('elbow_' + side, (0.206 * sx, 0, 1.142),
                             (0.049, 0.049, 0.050), suit, fa, region,
                             seg=12, rings=8))
    parts.append(tube('forearm_' + side, [
        (1.145, 0.050, 0.049, 0.206 * sx, 0.0),
        (1.050, 0.049, 0.047, 0.210 * sx, 0.0),
        (0.950, 0.045, 0.043, 0.212 * sx, 0.0),
        (0.875, 0.040, 0.038, 0.214 * sx, 0.0),
    ], 14, region, suit, {fa: 1.0}))
    parts.append(sphere_part('palm_' + side, (0.214 * sx, 0.006, 0.807),
                             (0.044, 0.032, 0.058), gear, hd,
                             'hand_l' if sx > 0 else 'hand_r', seg=14, rings=8))
    parts.append(sphere_part('thumb_' + side, (0.185 * sx, 0.026, 0.805),
                             (0.018, 0.020, 0.030), gear, hd,
                             'hand_l' if sx > 0 else 'hand_r', seg=10, rings=6))
    parts.append(tube('cuff_' + side, [(0.842, 0.043, 0.041, 0.214 * sx, 0.0),
                                        (0.868, 0.045, 0.043, 0.214 * sx, 0.0),
                                        (0.892, 0.042, 0.040, 0.214 * sx, 0.0)],
                      12, 'hand_l' if sx > 0 else 'hand_r', gear,
                      {fa: 1.0}, cap=False))
    return parts


def build_leg(side, sx, suit, gear, accent):
    th, sh, ft = 'thigh.' + side, 'shin.' + side, 'foot.' + side
    region = 'leg_l' if sx > 0 else 'leg_r'
    boot_region = 'boot_l' if sx > 0 else 'boot_r'
    parts = []
    parts.append(sphere_part('hip_' + side, (0.096 * sx, 0, 0.935),
                             (0.079, 0.078, 0.082), suit, th, region,
                             seg=14, rings=8))
    parts.append(tube('thigh_' + side, [
        (0.955, 0.083, 0.081, 0.096 * sx, 0.0),
        (0.860, 0.081, 0.079, 0.096 * sx, 0.0),
        (0.760, 0.075, 0.073, 0.096 * sx, 0.0),
        (0.660, 0.069, 0.067, 0.096 * sx, 0.0),
        (0.560, 0.064, 0.062, 0.096 * sx, 0.0),
    ], 14, region, suit, {th: 1.0}))
    parts.append(sphere_part('knee_' + side, (0.096 * sx, 0, 0.525),
                             (0.064, 0.064, 0.066), suit, sh, region,
                             seg=12, rings=8))
    parts.append(tube('shin_' + side, [
        (0.535, 0.064, 0.062, 0.096 * sx, 0.0),
        (0.440, 0.061, 0.059, 0.096 * sx, 0.0),
        (0.340, 0.056, 0.054, 0.096 * sx, 0.0),
        (0.245, 0.051, 0.050, 0.096 * sx, 0.0),
        (0.165, 0.049, 0.049, 0.096 * sx, 0.0),
    ], 14, region, suit, {sh: 1.0}))
    parts.append(sphere_part('knee_trim_' + side, (0.096 * sx, 0.066, 0.528),
                             (0.078, 0.023, 0.101), accent, sh,
                             'accent', seg=14, rings=8))
    parts.append(sphere_part('knee_pad_' + side, (0.096 * sx, 0.079, 0.528),
                             (0.074, 0.031, 0.097), gear, sh,
                             'gear', seg=14, rings=8))
    parts.append(rounded_box('boot_sole_' + side, (0.120, 0.280, 0.038),
                             (0.096 * sx, 0.025, 0.026), gear, ft,
                             boot_region, bevel=0.016, seg=3))
    parts.append(rounded_box('boot_foot_' + side, (0.108, 0.255, 0.105),
                             (0.096 * sx, 0.020, 0.093), gear, ft,
                             boot_region, bevel=0.028, seg=3))
    parts.append(rounded_box('boot_toe_' + side, (0.094, 0.080, 0.060),
                             (0.096 * sx, 0.120, 0.070), gear, ft,
                             boot_region, bevel=0.022, seg=3))
    parts.append(tube('boot_shaft_' + side, [
        (0.105, 0.056, 0.058, 0.096 * sx, 0.002),
        (0.190, 0.054, 0.056, 0.096 * sx, 0.000),
        (0.275, 0.054, 0.056, 0.096 * sx, 0.000),
        (0.300, 0.057, 0.059, 0.096 * sx, 0.000),
    ], 14, boot_region, gear, {ft: 1.0}, cap=False))
    parts.append(rounded_box('boot_lace_' + side, (0.058, 0.014, 0.170),
                             (0.096 * sx, 0.059, 0.204), gear, ft,
                             boot_region, bevel=0.007, seg=2))
    return parts


def torso_front_y(z, th):
    rx, ry, cx, cy = torso_at(z)
    return cy + ry * math.cos(th)


def ribbon(name, pts, width, mat, region, bone, weight=1.0):
    """沿截面点列做一条贴体织带；pts: [(x,y,z)]。"""
    verts, uvs, faces = [], [], []
    for i, (x, y, z) in enumerate(pts):
        ln = max(1e-5, math.hypot(x, y))
        nx, ny = x / ln, y / ln
        px, py = -ny, nx
        verts.append((x + px * width * 0.5, y + py * width * 0.5, z))
        verts.append((x - px * width * 0.5, y - py * width * 0.5, z))
        uvs.append(AT.region_uv(region, i / float(len(pts) - 1), 1.0))
        uvs.append(AT.region_uv(region, i / float(len(pts) - 1), 0.0))
    for i in range(len(pts) - 1):
        a = i * 2
        faces.append((a, a + 1, a + 3, a + 2))
    return mesh_obj(name, verts, faces, mat, uvs, {bone: weight})


def build_harness(accent):
    parts = []
    for sx in (-1.0, 1.0):
        pts = []
        for k in range(9):
            z = 1.005 + k * (1.435 - 1.005) / 8.0
            th = sx * 0.40
            rx, ry, cx, cy = torso_at(z)
            pts.append((cx + (rx + 0.006) * math.sin(th),
                        cy + (ry + 0.006) * math.cos(th), z))
        parts.append(ribbon('harness_' + ('L' if sx > 0 else 'R'), pts, 0.040,
                            accent, 'accent', 'chest'))
    pts = []
    for k in range(13):
        th = -0.78 + k * 1.56 / 12.0
        z = 1.295
        rx, ry, cx, cy = torso_at(z)
        pts.append((cx + (rx + 0.006) * math.sin(th),
                    cy + (ry + 0.006) * math.cos(th), z))
    parts.append(ribbon('harness_bar', pts, 0.038, accent, 'accent', 'chest'))
    parts.append(rounded_box('harness_buckle', (0.070, 0.032, 0.055),
                             (0, torso_front_y(1.295, 0.0) + 0.012, 1.295),
                             accent, 'chest', 'accent', bevel=0.009, seg=2))
    return parts


def build_gear(gear, accent):
    parts = []
    parts.append(tube('belt', [(0.925, 0.168, 0.119, 0, 0.002),
                                (0.955, 0.170, 0.121, 0, 0.002),
                                (0.980, 0.166, 0.117, 0, 0.002)],
                      22, 'gear', gear, {'hips': 1.0}, cap=False))
    parts.append(rounded_box('buckle', (0.060, 0.028, 0.050), (0, 0.122, 0.950),
                             gear, 'hips', 'detail', bevel=0.008, seg=2))
    for sx in (-1, 1):
        parts.append(rounded_box('pouch_%d' % sx, (0.075, 0.055, 0.105),
                                 (0.112 * sx, 0.115, 0.918), gear, 'hips',
                                 'gear', bevel=0.014, seg=3))
        parts.append(rounded_box('pouch_flap_%d' % sx, (0.072, 0.012, 0.040),
                                 (0.112 * sx, 0.145, 0.955), accent, 'hips',
                                 'accent', bevel=0.006, seg=2))
    parts.append(rounded_box('backpack', (0.235, 0.115, 0.300),
                             (0, -0.170, 1.300), gear, 'chest', 'gear',
                             bevel=0.030, seg=3))
    parts.append(rounded_box('backpack_lid', (0.210, 0.020, 0.100),
                             (0, -0.230, 1.385), gear, 'chest', 'gear',
                             bevel=0.012, seg=2))
    for sx in (-1, 1):
        pts = []
        for k in range(7):
            t = k / 6.0
            z = 1.455 - t * 0.155
            y = 0.045 + t * 0.070
            x = sx * (0.098 + 0.012 * math.sin(t * math.pi))
            pts.append((x, y, z))
        parts.append(ribbon('pack_strap_' + ('L' if sx > 0 else 'R'), pts, 0.030,
                            gear, 'gear', 'chest'))
    parts.append(tube('collar', [(1.468, 0.078, 0.075, 0, 0.002),
                                  (1.500, 0.080, 0.077, 0, 0.003),
                                  (1.520, 0.074, 0.071, 0, 0.004)],
                      18, 'gear', gear, {'chest': 1.0}, cap=False))
    return parts


def build_shoulder_patch(side, sx, accent):
    return rounded_box('patch_' + side, (0.026, 0.006, 0.055),
                       (0.255 * sx, 0.016, 1.360), accent, 'upper_arm.' + side,
                       'accent', bevel=0.004, seg=2)


def make_armature():
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm = bpy.context.active_object
    arm.name = 'crew_rig'
    arm.data.name = 'crew_rig'
    eb = arm.data.edit_bones
    for b in list(eb):
        eb.remove(b)

    def add(name, head, tail, parent=None, deform=True):
        b = eb.new(name)
        b.head = head
        b.tail = tail
        b.use_deform = deform
        if parent:
            b.parent = eb[parent]
        return b

    add('root', (0, 0, 0), (0, 0, 0.1), None, False)
    add('hips', (0, 0, 0.90), (0, 0, 1.00), 'root')
    add('spine', (0, 0, 1.00), (0, 0, 1.22), 'hips')
    add('chest', (0, 0, 1.22), (0, 0, 1.48), 'spine')
    add('neck', (0, 0, 1.48), (0, 0, 1.54), 'chest')
    add('head', (0, 0, 1.54), (0, 0, 1.74), 'neck')
    for side, sx in (('L', 1.0), ('R', -1.0)):
        add('upper_arm.' + side, (0.18 * sx, 0, 1.44), (0.205 * sx, 0, 1.14), 'chest')
        add('forearm.' + side, (0.205 * sx, 0, 1.14), (0.215 * sx, 0, 0.86),
            'upper_arm.' + side)
        add('hand.' + side, (0.215 * sx, 0, 0.86), (0.215 * sx, 0, 0.76),
            'forearm.' + side)
        add('thigh.' + side, (0.095 * sx, 0, 0.94), (0.095 * sx, 0, 0.52), 'hips')
        add('shin.' + side, (0.095 * sx, 0, 0.52), (0.095 * sx, 0, 0.12),
            'thigh.' + side)
        add('foot.' + side, (0.095 * sx, 0, 0.12), (0.095 * sx, 0.18, 0.04),
            'shin.' + side)
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


ANIM_BONES = ['root', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R', 'foot.L', 'foot.R',
              'upper_arm.L', 'upper_arm.R', 'forearm.L', 'forearm.R']


def key_pose(arm, frame, pose):
    for bone in ANIM_BONES:
        pb = arm.pose.bones[bone]
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = pose.get(bone, (0.0, 0.0, 0.0))
        pb.keyframe_insert('rotation_euler', frame=frame)


def make_actions(arm):
    arm.animation_data_create()

    idle = bpy.data.actions.new('idle')
    idle.use_fake_user = True
    arm.animation_data.action = idle
    key_pose(arm, 1, {})
    key_pose(arm, 48, {'chest': (0.0, 0.0, 0.0)})

    walk = bpy.data.actions.new('walk')
    walk.use_fake_user = True
    arm.animation_data.action = walk
    key_pose(arm, 1, {
        'thigh.L': (0.45, 0, 0), 'shin.L': (-0.08, 0, 0), 'foot.L': (0.10, 0, 0),
        'thigh.R': (-0.40, 0, 0), 'shin.R': (-0.58, 0, 0), 'foot.R': (0.20, 0, 0),
        'upper_arm.L': (-0.32, 0, 0), 'upper_arm.R': (0.32, 0, 0),
        'forearm.L': (0.16, 0, 0), 'forearm.R': (0.16, 0, 0),
    })
    key_pose(arm, 7, {
        'thigh.L': (0.05, 0, 0), 'shin.L': (-0.30, 0, 0), 'foot.L': (0.14, 0, 0),
        'thigh.R': (-0.05, 0, 0), 'shin.R': (-0.30, 0, 0), 'foot.R': (0.14, 0, 0),
        'upper_arm.L': (0, 0, 0), 'upper_arm.R': (0, 0, 0),
        'forearm.L': (0.10, 0, 0), 'forearm.R': (0.10, 0, 0),
    })
    key_pose(arm, 13, {
        'thigh.L': (-0.40, 0, 0), 'shin.L': (-0.58, 0, 0), 'foot.L': (0.20, 0, 0),
        'thigh.R': (0.45, 0, 0), 'shin.R': (-0.08, 0, 0), 'foot.R': (0.10, 0, 0),
        'upper_arm.L': (0.32, 0, 0), 'upper_arm.R': (-0.32, 0, 0),
        'forearm.L': (0.16, 0, 0), 'forearm.R': (0.16, 0, 0),
    })
    key_pose(arm, 19, {
        'thigh.L': (-0.05, 0, 0), 'shin.L': (-0.30, 0, 0), 'foot.L': (0.14, 0, 0),
        'thigh.R': (0.05, 0, 0), 'shin.R': (-0.30, 0, 0), 'foot.R': (0.14, 0, 0),
        'upper_arm.L': (0, 0, 0), 'upper_arm.R': (0, 0, 0),
        'forearm.L': (0.10, 0, 0), 'forearm.R': (0.10, 0, 0),
    })
    key_pose(arm, 25, {
        'thigh.L': (0.45, 0, 0), 'shin.L': (-0.08, 0, 0), 'foot.L': (0.10, 0, 0),
        'thigh.R': (-0.40, 0, 0), 'shin.R': (-0.58, 0, 0), 'foot.R': (0.20, 0, 0),
        'upper_arm.L': (-0.32, 0, 0), 'upper_arm.R': (0.32, 0, 0),
        'forearm.L': (0.16, 0, 0), 'forearm.R': (0.16, 0, 0),
    })

    knife = bpy.data.actions.new('knife')
    knife.use_fake_user = True
    arm.animation_data.action = knife
    key_pose(arm, 1, {})
    key_pose(arm, 4, {
        'thigh.L': (0.14, 0, 0), 'thigh.R': (-0.14, 0, 0),
        'shin.L': (-0.10, 0, 0), 'shin.R': (-0.30, 0, 0),
        'upper_arm.R': (-0.95, 0, 0), 'forearm.R': (-0.55, 0, 0),
        'upper_arm.L': (0.18, 0, 0), 'forearm.L': (0.25, 0, 0),
    })
    key_pose(arm, 8, {
        'thigh.L': (0.25, 0, 0), 'thigh.R': (-0.25, 0, 0),
        'shin.L': (-0.06, 0, 0), 'shin.R': (-0.38, 0, 0),
        'upper_arm.R': (0.95, 0, 0), 'forearm.R': (-0.20, 0, 0),
        'upper_arm.L': (-0.25, 0, 0), 'forearm.L': (0.30, 0, 0),
    })
    key_pose(arm, 12, {
        'thigh.L': (0.22, 0, 0), 'thigh.R': (-0.22, 0, 0),
        'shin.L': (-0.08, 0, 0), 'shin.R': (-0.35, 0, 0),
        'upper_arm.R': (1.15, 0, 0), 'forearm.R': (-0.15, 0, 0),
        'upper_arm.L': (-0.20, 0, 0), 'forearm.L': (0.25, 0, 0),
    })
    key_pose(arm, 16, {})

    down = bpy.data.actions.new('down')
    down.use_fake_user = True
    arm.animation_data.action = down
    key_pose(arm, 1, {})
    key_pose(arm, 6, {
        'root': (0.55, 0, 0),
        'thigh.L': (0.18, 0, 0), 'thigh.R': (-0.18, 0, 0),
        'shin.L': (-0.25, 0, 0), 'shin.R': (-0.25, 0, 0),
        'upper_arm.L': (-0.35, 0, 0), 'upper_arm.R': (0.35, 0, 0),
        'forearm.L': (0.25, 0, 0), 'forearm.R': (0.25, 0, 0),
    })
    key_pose(arm, 14, {
        'root': (1.57, 0, 0),
        'thigh.L': (0.22, 0, 0), 'thigh.R': (-0.22, 0, 0),
        'shin.L': (-0.35, 0, 0), 'shin.R': (-0.35, 0, 0),
        'upper_arm.L': (-0.45, 0, 0), 'upper_arm.R': (0.45, 0, 0),
        'forearm.L': (0.30, 0, 0), 'forearm.R': (0.30, 0, 0),
    })
    key_pose(arm, 32, {
        'root': (1.57, 0, 0),
        'thigh.L': (0.22, 0, 0), 'thigh.R': (-0.22, 0, 0),
        'shin.L': (-0.35, 0, 0), 'shin.R': (-0.35, 0, 0),
        'upper_arm.L': (-0.45, 0, 0), 'upper_arm.R': (0.45, 0, 0),
        'forearm.L': (0.30, 0, 0), 'forearm.R': (0.30, 0, 0),
    })

    arm.animation_data.action = None
    for act in (idle, walk, knife, down):
        track = arm.animation_data.nla_tracks.new()
        track.name = act.name
        strip = track.strips.new(act.name, 1, act)
        strip.name = act.name
    return idle, walk, knife, down


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0

    suit = material('crew_suit', os.path.join(CREW_TEX, 'crew-body_albedo.png'),
                    os.path.join(CREW_TEX, 'crew-body_normal.png'),
                    metallic=0.0, rough=0.82)
    accent = material('crew_accent', os.path.join(CREW_TEX, 'crew-body_albedo.png'),
                      os.path.join(CREW_TEX, 'crew-body_normal.png'),
                      metallic=0.0, rough=0.72)
    gear = material('crew_gear', os.path.join(CREW_TEX, 'crew-body_albedo.png'),
                    os.path.join(CREW_TEX, 'crew-body_normal.png'),
                    metallic=0.08, rough=0.74)
    skin = material('crew_skin', os.path.join(CREW_TEX, 'crew-body_albedo.png'),
                    os.path.join(CREW_TEX, 'crew-body_normal.png'),
                    metallic=0.0, rough=0.62)
    face = material('crew_face', os.path.join(CREW_TEX, 'crew-face_albedo.png'),
                    os.path.join(CREW_TEX, 'crew-face_normal.png'),
                    metallic=0.0, rough=0.62)
    hair = material('crew_hair', os.path.join(CREW_TEX, 'crew-hair_albedo.png'),
                    os.path.join(CREW_TEX, 'crew-hair_normal.png'),
                    metallic=0.0, rough=0.90)

    parts = [build_torso(suit), build_neck(skin)]
    parts.append(tube('pelvis', [(0.795, 0.085, 0.070, 0, 0.0),
                                  (0.840, 0.110, 0.085, 0, 0.002),
                                  (0.880, 0.135, 0.098, 0, 0.002),
                                  (0.920, 0.150, 0.103, 0, 0.002)],
                      24, 'torso', suit, {'hips': 1.0}, cap=True,
                      fv0=0.0, fv1=0.10))
    parts.append(build_head(skin, face))
    parts.append(build_hair(hair))
    parts.append(build_fringe(hair))
    for side, sx in (('L', 1.0), ('R', -1.0)):
        parts += build_arm(side, sx, suit, gear)
        parts += build_leg(side, sx, suit, gear, accent)
    parts += build_harness(accent)
    parts += build_gear(gear, accent)

    deselect()
    for ob in parts:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    body = bpy.context.active_object
    body.name = 'crew_body'
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')

    arm = make_armature()
    body.parent = arm
    mod = body.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    mod.use_vertex_groups = True

    make_actions(arm)

    deps = bpy.context.evaluated_depsgraph_get()
    me = body.evaluated_get(deps).to_mesh()
    me.calc_loop_triangles()
    tris = len(me.loop_triangles)
    lo, hi = 1e9, -1e9
    for v in me.vertices:
        w = body.matrix_world @ v.co
        lo = min(lo, w.z)
        hi = max(hi, w.z)
    deform_bones = len([b for b in arm.data.bones if b.use_deform])
    print('CREW_RIGGED tris=%d height=%.3f bones=%d actions=%s' % (
        tris, hi - lo, deform_bones,
        ','.join(sorted(a.name for a in bpy.data.actions))), flush=True)
    print('CREW_MATERIALS %s' % ','.join(m.name for m in body.data.materials), flush=True)

    os.makedirs(MODELS, exist_ok=True)
    os.makedirs(EXPORTS, exist_ok=True)
    blend_path = os.path.join(MODELS, ASSET_ID + '.blend')
    glb_path = os.path.join(EXPORTS, ASSET_ID + '.glb')
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_animations=True,
        export_animation_mode='NLA_TRACKS',
        export_nla_strips=True,
        export_frame_range=False,
        export_anim_slide_to_zero=True,
        export_force_sampling=True,
        export_anim_single_armature=True,
    )
    print('CREW_RIGGED_OUT %s %s' % (blend_path, glb_path), flush=True)


if __name__ == '__main__':
    build()
