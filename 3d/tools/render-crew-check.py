"""人物近景验收渲染：脸 / 半身 / 全身。

用法：blender -b 3d/assets/models/char_crew_lowpoly.blend -P 3d/tools/render-crew-check.py
输出：3d/preview/screenshots/crew-face-check.png / crew-body-check.png / crew-full-check.png
"""
import bpy
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, '3d', 'preview', 'screenshots')
os.makedirs(OUT, exist_ok=True)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
if scene.world is None:
    scene.world = bpy.data.worlds.new('World')
scene.world.use_nodes = True
bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs['Color'].default_value = (0.055, 0.06, 0.07, 1.0)
bg.inputs['Strength'].default_value = 0.7
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = -0.8

# 灯光：正面柔光 + 侧后轮廓
for name, loc, energy, size in (
        ('key', (-2.2, 2.8, 2.4), 520, 3.0),
        ('fill', (2.4, 1.8, 1.8), 280, 2.5),
        ('rim', (0.6, -2.2, 2.6), 380, 2.0)):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.energy = energy
    ld.shape = 'DISK'
    ld.size = size
    ob = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (0, 0, 0)
    # 指向人物中心
    d = (-loc[0], -loc[1], 1.1 - loc[2])
    ob.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]),
                         math.atan2(d[1], d[0]) + math.pi / 2, 0)
    # 用 track quat 更稳
    from mathutils import Vector
    direction = Vector((0, 0, 1.05)) - Vector(loc)
    ob.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

cam_data = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam_data.lens = 85


def shoot(path, pos, target, lens):
    from mathutils import Vector
    cam.location = pos
    cam_data.lens = lens
    cam.rotation_euler = (Vector(target) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(OUT, path)
    bpy.ops.render.render(write_still=True)
    print('CREW_CHECK', scene.render.filepath)


shoot('crew-face-check.png', (0.0, 0.85, 1.66), (0.0, 0.0, 1.655), 100)
shoot('crew-body-check.png', (0.0, 2.6, 1.25), (0.0, 0.0, 1.12), 75)
shoot('crew-full-check.png', (0.0, 4.2, 1.05), (0.0, 0.0, 0.88), 60)
