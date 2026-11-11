# =============================================================
# build-crew-rigged.py · 参考图 → 带骨架 / 行走动作的船员 low-poly
# -------------------------------------------------------------
# 设计依据：docs/qwen21/crew-refs/crew-turnaround_768.png 与 crew-detail_768.png
#   （浅灰勤务服、珊瑚红胸带/护膝、黑靴、短黑发、背包、无头盔）。
# 产物：3d/assets/models/char_crew_lowpoly.blend
#       3d/assets/export/char_crew_lowpoly.glb（idle / walk 两个动作）
# 约定：米制 / +Y 前 / +Z 上 / 底面中心 / 18 根形变骨 / 4 材质 / 无贴图。
# 用法：
#   "E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b \
#     -P 3d/tools/build-crew-rigged.py
# =============================================================
import bpy
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS = os.path.join(ROOT, '3d', 'assets', 'models')
EXPORTS = os.path.join(ROOT, '3d', 'assets', 'export')
ASSET_ID = 'char_crew_lowpoly'

if tuple(bpy.app.version[:2]) < (5, 2):
    raise SystemExit('[crew-rigged] 需要 Blender 5.2+（权威版 5.2.2 LTS）')


def material(name, color, metallic=0.0, rough=0.7):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    for node in mat.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            node.inputs['Base Color'].default_value = color
            node.inputs['Metallic'].default_value = metallic
            node.inputs['Roughness'].default_value = rough
            break
    return mat


def _finish(obj, mat, bevel=0.0):
    obj.data.materials.append(mat)
    if bevel > 0.0:
        mod = obj.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return obj


def assign(obj, bone):
    vg = obj.vertex_groups.new(name=bone)
    vg.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    return obj


def box(name, size, center, mat, bone, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    _finish(obj, mat, bevel)
    return assign(obj, bone)


def sphere(name, radius, center, mat, bone, segments=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings,
                                        radius=radius, location=center)
    obj = bpy.context.active_object
    obj.name = name
    _finish(obj, mat)
    return assign(obj, bone)


def cyl(name, radius, depth, center, mat, bone, verts=8):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=center)
    obj = bpy.context.active_object
    obj.name = name
    _finish(obj, mat)
    return assign(obj, bone)


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return obj


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


WALK_BONES = ['thigh.L', 'thigh.R', 'shin.L', 'shin.R', 'foot.L', 'foot.R',
              'upper_arm.L', 'upper_arm.R', 'forearm.L', 'forearm.R']


def key_pose(arm, frame, pose):
    for bone in WALK_BONES:
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
    # 一个 24fps / 1 秒循环：腿摆 + 反向摆臂；膝盖只向后弯。
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

    arm.animation_data.action = None
    for act in (idle, walk):
        track = arm.animation_data.nla_tracks.new()
        track.name = act.name
        strip = track.strips.new(act.name, 1, act)
        strip.name = act.name
    return idle, walk


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0

    suit = material('crew_suit', (0.70, 0.72, 0.75, 1.0), metallic=0.02, rough=0.78)
    accent = material('crew_accent', (0.78, 0.28, 0.24, 1.0), metallic=0.0, rough=0.62)
    gear = material('crew_gear', (0.09, 0.10, 0.12, 1.0), metallic=0.3, rough=0.5)
    skin = material('crew_skin', (0.62, 0.45, 0.34, 1.0), metallic=0.0, rough=0.62)
    parts = []

    # 躯干：骨盆(hips) / 腰(spine) / 胸(chest)；三段分开，走路不扯腰部。
    parts.append(box('pelvis', (0.32, 0.21, 0.16), (0, 0, 0.98), suit, 'hips', 0.012))
    parts.append(box('waist', (0.30, 0.20, 0.14), (0, 0, 1.10), suit, 'spine', 0.010))
    parts.append(box('torso', (0.34, 0.22, 0.34), (0, 0, 1.34), suit, 'chest', 0.016))
    parts.append(box('neck', (0.11, 0.11, 0.07), (0, 0, 1.515), skin, 'neck'))
    parts.append(box('collar', (0.20, 0.18, 0.05), (0, 0, 1.475), gear, 'chest'))

    # 头：皮肤球 + 深色短发 + 双眼 + 鼻；不做头盔
    parts.append(sphere('head', 0.105, (0, 0, 1.645), skin, 'head'))
    parts.append(box('hair', (0.19, 0.15, 0.07), (0, -0.015, 1.715), gear, 'head'))
    for sx in (-1, 1):
        parts.append(box('eye_%d' % sx, (0.030, 0.012, 0.018),
                         (0.036 * sx, 0.100, 1.665), gear, 'head'))
        parts.append(box('ear_%d' % sx, (0.018, 0.040, 0.055),
                         (0.106 * sx, 0.0, 1.645), skin, 'head'))
    parts.append(box('nose', (0.025, 0.038, 0.035), (0, 0.108, 1.635), skin, 'head'))

    # 胸带 / 扣具 / 背包（参考图的珊瑚红 H 型胸带）
    for sx in (-1, 1):
        parts.append(box('harness_%d' % sx, (0.045, 0.022, 0.34),
                         (0.095 * sx, 0.122, 1.33), accent, 'chest'))
    parts.append(box('harness_bar', (0.24, 0.022, 0.045), (0, 0.122, 1.30), accent, 'chest'))
    parts.append(box('buckle', (0.065, 0.030, 0.075), (0, 0.135, 1.30), gear, 'chest'))
    parts.append(box('backpack', (0.24, 0.12, 0.30), (0, -0.16, 1.30), gear, 'chest', 0.012))
    for sx in (-1, 1):
        parts.append(box('pack_strap_%d' % sx, (0.035, 0.025, 0.34),
                         (0.090 * sx, 0.122, 1.33), gear, 'chest'))
        parts.append(box('shoulder_patch_%d' % sx, (0.035, 0.018, 0.10),
                         (0.205 * sx, 0.095, 1.36), accent, 'upper_arm.' + ('L' if sx > 0 else 'R')))

    # 腰带 / 腰包 / 大腿口袋
    parts.append(box('belt', (0.32, 0.23, 0.06), (0, 0, 0.945), gear, 'hips', 0.006))
    for sx in (-1, 1):
        parts.append(box('pouch_%d' % sx, (0.075, 0.06, 0.10),
                         (0.105 * sx, 0.135, 0.925), gear, 'hips'))
        parts.append(box('thigh_pocket_%d' % sx, (0.065, 0.02, 0.13),
                         (0.115 * sx, 0.108, 0.70), suit, 'thigh.' + ('L' if sx > 0 else 'R')))

    # 四肢：圆柱 + 关节球，刚性权重让走路不撕面
    for side, sx in (('L', 1.0), ('R', -1.0)):
        ua = 'upper_arm.' + side
        fa = 'forearm.' + side
        hd = 'hand.' + side
        th = 'thigh.' + side
        sh = 'shin.' + side
        ft = 'foot.' + side
        parts.append(box('shoulder_' + side, (0.11, 0.17, 0.12),
                         (0.18 * sx, 0, 1.44), suit, ua, 0.012))
        parts.append(cyl('upper_arm_' + side, 0.052, 0.30,
                         (0.205 * sx, 0, 1.28), suit, ua))
        parts.append(sphere('elbow_' + side, 0.052, (0.205 * sx, 0, 1.14), suit, fa,
                            segments=10, rings=6))
        parts.append(cyl('forearm_' + side, 0.046, 0.28,
                         (0.215 * sx, 0, 1.00), suit, fa))
        parts.append(box('glove_' + side, (0.09, 0.11, 0.12),
                         (0.215 * sx, 0, 0.81), gear, hd))
        parts.append(sphere('hip_' + side, 0.072, (0.095 * sx, 0, 0.94), suit, th,
                            segments=10, rings=6))
        parts.append(cyl('thigh_' + side, 0.075, 0.42,
                         (0.095 * sx, 0, 0.73), suit, th))
        parts.append(box('pipe_thigh_' + side, (0.016, 0.012, 0.34),
                         (0.165 * sx, 0.035, 0.74), accent, th))
        parts.append(sphere('knee_' + side, 0.065, (0.095 * sx, 0, 0.52), suit, sh,
                            segments=10, rings=6))
        parts.append(cyl('shin_' + side, 0.060, 0.40,
                         (0.095 * sx, 0, 0.32), suit, sh))
        parts.append(box('knee_pad_' + side, (0.11, 0.075, 0.14),
                         (0.095 * sx, 0.085, 0.50), gear, sh, 0.008))
        parts.append(box('knee_trim_' + side, (0.08, 0.015, 0.025),
                         (0.095 * sx, 0.13, 0.52), accent, sh))
        parts.append(box('pipe_shin_' + side, (0.016, 0.012, 0.30),
                         (0.155 * sx, 0.035, 0.30), accent, sh))
        parts.append(box('boot_' + side, (0.15, 0.28, 0.12),
                         (0.095 * sx, 0.04, 0.06), gear, ft, 0.008))

    body = join(parts, 'crew_body')
    arm = make_armature()
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_NAME')

    make_actions(arm)

    deps = bpy.context.evaluated_depsgraph_get()
    tris = 0
    lo, hi = 1e9, -1e9
    me = body.evaluated_get(deps).to_mesh()
    me.calc_loop_triangles()
    tris = len(me.loop_triangles)
    for v in me.vertices:
        w = body.matrix_world @ v.co
        lo = min(lo, w.z)
        hi = max(hi, w.z)
    deform_bones = len([b for b in arm.data.bones if b.use_deform])
    print('CREW_RIGGED tris=%d height=%.3f bones=%d actions=%s' % (
        tris, hi - lo, deform_bones,
        ','.join(sorted(a.name for a in bpy.data.actions))), flush=True)

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
