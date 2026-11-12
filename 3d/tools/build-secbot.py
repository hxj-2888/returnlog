"""保安机器人 secbot · 双足人形（2026-11-11 裁定）。

造型真源：2.5D assets/scene/v4/facility/secbot.png
  compact bipedal security guard robot, heavy gunmetal armor,
  red hazard stripe on shoulder, glowing red eye lens, stun baton on hip

口径：总高 1.25 m、最大宽 <= 0.60 m、最大深 <= 0.45 m；
      Blender +Y 前（导出后 Godot -Z）、脚底 pivot；idle + walk。
用法：blender -b -P 3d/tools/build-secbot.py
"""
import bpy
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import covers_lib as L  # noqa: E402
import art_direction_lib as A  # noqa: E402

TEX = A.TEX
ASSET = 'secbot'


def mats():
    paint = A.tex_mat('secbot_paint',
                      albedo=os.path.join(TEX, 'secbot-paint_albedo.jpg'),
                      normal=os.path.join(TEX, 'secbot-paint_normal.jpg'),
                      rough=os.path.join(TEX, 'secbot-paint_rough.jpg'),
                      metallic=0.20, roughness=0.72, normal_strength=0.7)
    accent = A.tex_mat('secbot_accent',
                       albedo=os.path.join(TEX, 'secbot-accent_albedo.jpg'),
                       normal=os.path.join(TEX, 'secbot-accent_normal.jpg'),
                       rough=os.path.join(TEX, 'secbot-accent_rough.jpg'),
                       metallic=0.15, roughness=0.55, emission_strength=0.80,
                       normal_strength=0.6)
    # 目镜带单独一张更高发光的材质，红色识别条保持低发光
    visor = A.tex_mat('secbot_visor',
                      albedo=os.path.join(TEX, 'secbot-accent_albedo.jpg'),
                      normal=os.path.join(TEX, 'secbot-accent_normal.jpg'),
                      rough=os.path.join(TEX, 'secbot-accent_rough.jpg'),
                      metallic=0.10, roughness=0.35, emission_strength=2.5,
                      normal_strength=0.4)
    metal = A.tex_mat('secbot_metal',
                      albedo=os.path.join(TEX, 'secbot-metal_albedo.jpg'),
                      normal=os.path.join(TEX, 'secbot-metal_normal.jpg'),
                      rough=os.path.join(TEX, 'secbot-metal_rough.jpg'),
                      metallic=0.45, roughness=0.58, normal_strength=0.7)
    white = A.solid_mat('secbot_white', (0.72, 0.74, 0.76, 1), 0.15, 0.55)
    return paint, accent, visor, metal, white


def assign(obj, bone):
    vg = obj.vertex_groups.new(name=bone)
    vg.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    return obj


def b(coll, name, sx, sy, sz, x, y, z, mat, bone):
    return assign(L.box(coll, name, sx, sy, sz, x, y, z, mat), bone)


def c(coll, name, r, h, x, y, z, mat, bone, seg=10):
    return assign(L.cyl(coll, name, r, h, x, y, z, mat, seg=seg), bone)


def hc(coll, name, r, length, x, y, z, mat, bone, axis='x', seg=10):
    return assign(L.hcyl(coll, name, r, length, x, y, z, mat, axis=axis, seg=seg), bone)


def build(coll, P):
    paint, accent, visor, metal, white = P

    # ---------------- 腿 ----------------
    for side, sx in (('L', 1.0), ('R', -1.0)):
        x = 0.12 * sx
        b(coll, 'foot.' + side, 0.16, 0.30, 0.10, x, -0.03, 0.0, paint, 'foot.' + side)
        b(coll, 'toe.' + side, 0.14, 0.10, 0.05, x, -0.175, 0.02, metal, 'foot.' + side)
        c(coll, 'ankle.' + side, 0.055, 0.08, x, 0.0, 0.10, metal, 'shin.' + side)
        b(coll, 'shin.' + side, 0.12, 0.14, 0.28, x, 0.0, 0.16, paint, 'shin.' + side)
        b(coll, 'shinplate.' + side, 0.10, 0.035, 0.22, x, -0.075, 0.19, paint, 'shin.' + side)
        b(coll, 'shinstrip.' + side, 0.022, 0.012, 0.18, x + 0.045 * sx, -0.096, 0.21,
          accent, 'shin.' + side)
        b(coll, 'knee.' + side, 0.14, 0.16, 0.07, x, 0.0, 0.42, metal, 'shin.' + side)
        b(coll, 'kneecap.' + side, 0.10, 0.035, 0.07, x, -0.085, 0.445, accent, 'shin.' + side)
        b(coll, 'thigh.' + side, 0.15, 0.17, 0.22, x + 0.01 * sx, 0.0, 0.48,
          paint, 'thigh.' + side)
        b(coll, 'thighstrip.' + side, 0.022, 0.012, 0.16, x + 0.06 * sx, -0.088, 0.51,
          accent, 'thigh.' + side)
        c(coll, 'hip.' + side, 0.055, 0.10, x, 0.0, 0.68, metal, 'thigh.' + side,
          seg=10)

    # 右小腿白色编号（2.5D 贴图的白色标识，不做胸牌）
    b(coll, 'id_white', 0.018, 0.012, 0.10, -0.165, -0.09, 0.24, white, 'shin.R')
    b(coll, 'id_white2', 0.018, 0.012, 0.06, -0.185, -0.09, 0.30, white, 'shin.R')

    # ---------------- 骨盆 / 腰 ----------------
    b(coll, 'pelvis', 0.34, 0.24, 0.10, 0.0, 0.0, 0.68, paint, 'hips')
    b(coll, 'belt', 0.30, 0.02, 0.035, 0.0, -0.125, 0.70, accent, 'hips')
    b(coll, 'crotch', 0.12, 0.16, 0.10, 0.0, 0.0, 0.62, metal, 'hips')

    # ---------------- 腹部 / 胸 ----------------
    b(coll, 'abdomen', 0.30, 0.22, 0.14, 0.0, 0.0, 0.78, paint, 'spine')
    for i, z in enumerate((0.80, 0.845, 0.89)):
        b(coll, 'rib%d' % i, 0.24, 0.02, 0.018, 0.0, -0.115, z, metal, 'spine')
    b(coll, 'chest', 0.44, 0.28, 0.20, 0.0, 0.0, 0.92, paint, 'chest')
    b(coll, 'chest_plate', 0.34, 0.03, 0.16, 0.0, -0.145, 0.94, paint, 'chest')
    b(coll, 'chest_center', 0.14, 0.02, 0.10, 0.0, -0.162, 0.96, metal, 'chest')
    # 红色目镜带：上胸横向，全机最抢眼的一条
    b(coll, 'visor_band', 0.38, 0.02, 0.055, 0.0, -0.163, 1.035, visor, 'chest')
    # 肩甲 + 肩部红色警示条（观察者左肩 = Blender +X）
    for side, sx in (('L', 1.0), ('R', -1.0)):
        x = 0.20 * sx
        b(coll, 'pauldron.' + side, 0.13, 0.19, 0.15, x, 0.0, 1.00, paint, 'chest')
        b(coll, 'pauldron_edge.' + side, 0.11, 0.04, 0.05, x, -0.095, 1.08, metal, 'chest')
    b(coll, 'shoulder_warn', 0.14, 0.015, 0.04, 0.225, -0.10, 1.085, accent, 'chest')
    b(coll, 'shoulder_warn2', 0.10, 0.012, 0.03, 0.235, -0.108, 1.045, accent, 'chest')

    # ---------------- 背包 / 天线 ----------------
    b(coll, 'backpack', 0.28, 0.12, 0.20, 0.0, 0.16, 0.90, paint, 'chest')
    b(coll, 'backpack_vent', 0.20, 0.02, 0.10, 0.0, 0.215, 0.95, metal, 'chest')
    c(coll, 'antenna', 0.012, 0.13, 0.10, 0.14, 1.10, metal, 'chest', seg=6)
    b(coll, 'antenna_tip', 0.035, 0.02, 0.02, 0.10, 0.14, 1.23, accent, 'chest')

    # ---------------- 头 ----------------
    c(coll, 'neck', 0.045, 0.08, 0.0, 0.0, 1.10, metal, 'head', seg=8)
    b(coll, 'head', 0.20, 0.20, 0.14, 0.0, 0.0, 1.10, paint, 'head')
    b(coll, 'head_visor', 0.16, 0.02, 0.035, 0.0, -0.108, 1.165, visor, 'head')
    b(coll, 'jaw', 0.14, 0.14, 0.045, 0.0, -0.01, 1.065, metal, 'head')
    b(coll, 'head_fin', 0.02, 0.12, 0.04, 0.0, 0.02, 1.20, metal, 'head')

    # ---------------- 手臂 ----------------
    for side, sx in (('L', 1.0), ('R', -1.0)):
        x = 0.250 * sx
        hc(coll, 'shoulder.' + side, 0.05, 0.08, x, 0.0, 1.02, metal,
           'upper_arm.' + side, axis='x', seg=10)
        b(coll, 'upper.' + side, 0.09, 0.11, 0.22, x, 0.0, 0.80, paint,
          'upper_arm.' + side)
        b(coll, 'upperstripe.' + side, 0.022, 0.012, 0.14, x + 0.035 * sx, -0.06, 0.83,
          accent, 'upper_arm.' + side)
        hc(coll, 'elbow.' + side, 0.045, 0.07, x, 0.0, 0.78, metal,
           'forearm.' + side, axis='x', seg=10)
        b(coll, 'forearm.' + side, 0.08, 0.10, 0.20, x, 0.0, 0.58, paint,
          'forearm.' + side)
        b(coll, 'forearmstripe.' + side, 0.02, 0.012, 0.13, x + 0.03 * sx, -0.055, 0.61,
          accent, 'forearm.' + side)
        c(coll, 'wrist.' + side, 0.035, 0.05, x, 0.0, 0.53, metal,
          'hand.' + side, seg=8)
        b(coll, 'hand.' + side, 0.07, 0.08, 0.08, x, 0.0, 0.45, metal,
          'hand.' + side)
        for k in range(3):
            b(coll, 'finger%d.%s' % (k, side), 0.016, 0.02, 0.07,
              x + (k - 1) * 0.022, -0.02, 0.38, metal, 'hand.' + side)

    # ---------------- 髋部电击棍（仅造型） ----------------
    c(coll, 'baton', 0.022, 0.26, -0.205, 0.10, 0.66, metal, 'hips', seg=8)
    c(coll, 'baton_band', 0.026, 0.03, -0.205, 0.10, 0.74, accent, 'hips', seg=8)


def make_armature(coll):
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm = bpy.context.active_object
    arm.name = 'secbot_rig'
    arm.data.name = 'secbot_rig'
    for c in list(arm.users_collection):
        c.objects.unlink(arm)
    coll.objects.link(arm)
    eb = arm.data.edit_bones
    for bone in list(eb):
        eb.remove(bone)

    def add(name, head, tail, parent=None, deform=True):
        bone = eb.new(name)
        bone.head = head
        bone.tail = tail
        bone.use_deform = deform
        if parent:
            bone.parent = eb[parent]
        return bone

    add('root', (0, 0, 0), (0, 0, 0.1), None, False)
    add('hips', (0, 0, 0.70), (0, 0, 0.82), 'root')
    add('spine', (0, 0, 0.82), (0, 0, 0.98), 'hips')
    add('chest', (0, 0, 0.98), (0, 0, 1.12), 'spine')
    add('head', (0, 0, 1.12), (0, 0, 1.25), 'chest')
    for side, sx in (('L', 1.0), ('R', -1.0)):
        x = 0.12 * sx
        add('thigh.' + side, (x, 0, 0.70), (x, 0, 0.48), 'hips')
        add('shin.' + side, (x, 0, 0.48), (x, 0, 0.12), 'thigh.' + side)
        add('foot.' + side, (x, 0, 0.12), (x, -0.18, 0.05), 'shin.' + side)
        ax = 0.250 * sx
        add('upper_arm.' + side, (ax, 0, 1.02), (ax, 0, 0.78), 'chest')
        add('forearm.' + side, (ax, 0, 0.78), (ax, 0, 0.56), 'upper_arm.' + side)
        add('hand.' + side, (ax, 0, 0.56), (ax, 0, 0.45), 'forearm.' + side)
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


ANIM_BONES = ['root', 'hips', 'spine', 'chest', 'head',
              'thigh.L', 'thigh.R', 'shin.L', 'shin.R', 'foot.L', 'foot.R',
              'upper_arm.L', 'upper_arm.R', 'forearm.L', 'forearm.R']


def key_pose(arm, frame, pose):
    for bone in ANIM_BONES:
        pb = arm.pose.bones[bone]
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = pose.get(bone, (0.0, 0.0, 0.0))
        pb.keyframe_insert('rotation_euler', frame=frame)


def make_actions(arm):
    bpy.context.scene.render.fps = 24
    arm.animation_data_create()

    idle = bpy.data.actions.new('idle')
    idle.use_fake_user = True
    arm.animation_data.action = idle
    key_pose(arm, 1, {})
    key_pose(arm, 24, {'head': (0.0, 0.0, 0.03), 'chest': (0.015, 0, 0)})
    key_pose(arm, 48, {})

    walk = bpy.data.actions.new('walk')
    walk.use_fake_user = True
    arm.animation_data.action = walk
    # 24fps / 1 秒循环；腿摆 + 反相摆臂，膝盖只向后弯
    key_pose(arm, 1, {
        'thigh.L': (0.38, 0, 0), 'shin.L': (-0.10, 0, 0), 'foot.L': (0.10, 0, 0),
        'thigh.R': (-0.34, 0, 0), 'shin.R': (-0.52, 0, 0), 'foot.R': (0.18, 0, 0),
        'upper_arm.L': (-0.28, 0, 0), 'upper_arm.R': (0.28, 0, 0),
        'forearm.L': (0.18, 0, 0), 'forearm.R': (0.18, 0, 0),
        'chest': (0.02, 0, 0),
    })
    key_pose(arm, 7, {
        'thigh.L': (0.04, 0, 0), 'shin.L': (-0.28, 0, 0), 'foot.L': (0.12, 0, 0),
        'thigh.R': (-0.04, 0, 0), 'shin.R': (-0.28, 0, 0), 'foot.R': (0.12, 0, 0),
        'forearm.L': (0.12, 0, 0), 'forearm.R': (0.12, 0, 0),
        'chest': (0.03, 0, 0),
    })
    key_pose(arm, 13, {
        'thigh.L': (-0.34, 0, 0), 'shin.L': (-0.52, 0, 0), 'foot.L': (0.18, 0, 0),
        'thigh.R': (0.38, 0, 0), 'shin.R': (-0.10, 0, 0), 'foot.R': (0.10, 0, 0),
        'upper_arm.L': (0.28, 0, 0), 'upper_arm.R': (-0.28, 0, 0),
        'forearm.L': (0.18, 0, 0), 'forearm.R': (0.18, 0, 0),
        'chest': (0.02, 0, 0),
    })
    key_pose(arm, 19, {
        'thigh.L': (-0.04, 0, 0), 'shin.L': (-0.28, 0, 0), 'foot.L': (0.12, 0, 0),
        'thigh.R': (0.04, 0, 0), 'shin.R': (-0.28, 0, 0), 'foot.R': (0.12, 0, 0),
        'forearm.L': (0.12, 0, 0), 'forearm.R': (0.12, 0, 0),
        'chest': (0.03, 0, 0),
    })
    key_pose(arm, 25, {
        'thigh.L': (0.38, 0, 0), 'shin.L': (-0.10, 0, 0), 'foot.L': (0.10, 0, 0),
        'thigh.R': (-0.34, 0, 0), 'shin.R': (-0.52, 0, 0), 'foot.R': (0.18, 0, 0),
        'upper_arm.L': (-0.28, 0, 0), 'upper_arm.R': (0.28, 0, 0),
        'forearm.L': (0.18, 0, 0), 'forearm.R': (0.18, 0, 0),
        'chest': (0.02, 0, 0),
    })


def join_and_bind(coll, arm):
    meshes = [o for o in coll.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    body = bpy.context.active_object
    body.name = 'secbot_body'
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    # 风格化写实：给整机 5mm 两段倒角，去掉“积木堆”的硬 90° 边
    bev = body.modifiers.new('bev', 'BEVEL')
    bev.width = 0.004
    bev.segments = 1
    bev.limit_method = 'ANGLE'
    bev.angle_limit = 0.7
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=bev.name)
    body.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_NAME')
    return body


def main():
    L.clear_scene()
    coll = L.new_coll(ASSET)
    P = mats()
    build(coll, P)
    arm = make_armature(coll)
    body = join_and_bind(coll, arm)
    make_actions(arm)
    # 身高/宽度读数
    bpy.context.view_layer.update()
    mn, mx = L.bbox(coll)
    print('SECBOT size w=%.3f d=%.3f h=%.3f' % (mx.x - mn.x, mx.y - mn.y, mx.z - mn.z))
    A.export(coll, ASSET, animations=True)


if __name__ == '__main__':
    main()
