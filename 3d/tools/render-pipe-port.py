# =============================================================
# render-pipe-port.py · 2.5D 管道舱盖精灵（Blender 5.2.2 渲染）
# -------------------------------------------------------------
# 打开 3d/assets/models/prop_pipe_port.blend，按舱室主题色染 edge rim，
# 用正交俯视相机渲染 8 个舱室的 2.5D 精灵：
#   assets/scene/v4/facility/pipe-port-<room>.png  (512², RGBA, 透明底)
# 另出一张 3/4 预览：3d/assets/renders/pipe-port-preview.png
# 颜色真源：js/t2/space.js#PIPE_TINT（本脚本解析，不另抄一份）。
# 用法：
#   "E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b -P 3d/tools/render-pipe-port.py
# =============================================================
import bpy
import math
import os
import re
import sys
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BLEND = os.path.join(ROOT, '3d', 'assets', 'models', 'prop_pipe_port.blend')
OUT = os.path.join(ROOT, 'assets', 'scene', 'v4', 'facility')
PREVIEW_DIR = os.path.join(ROOT, '3d', 'assets', 'renders')
ROOMS = ['cam', 'ecosys', 'transit', 'fun', 'engine', 'med', 'armory', 'warehouse']

if tuple(bpy.app.version[:2]) < (5, 2):
    raise SystemExit('[pipe-port] 需要 Blender 5.2+，当前 %s' % bpy.app.version_string)
if not os.path.exists(BLEND):
    raise SystemExit('[pipe-port] 缺少模型：' + BLEND)


def pipe_tints():
    src = open(os.path.join(ROOT, 'js', 't2', 'space.js'), encoding='utf-8').read()
    block = re.search(r'const PIPE_TINT=\{([^}]*)\}', src, re.S)
    if not block:
        raise SystemExit('[pipe-port] 解析不到 PIPE_TINT')
    out = {}
    for name, r, g, b in re.findall(r'(\w+):\[(\d+),(\d+),(\d+)\]', block.group(1)):
        out[name] = (int(r) / 255.0, int(g) / 255.0, int(b) / 255.0)
    return out


def look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def setup(scene):
    # 5.2.2 的 Steam 构建里枚举名仍可能是 BLENDER_EEVEE（5.x 文档写 NEXT）；
    # 和 tools/blender-ship.py 一样两种都试，实际只允许 5.2 出图。
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            scene.render.engine = eng
            break
        except Exception:
            continue
    scene.eevee.taa_render_samples = 64
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = True
    # 2.5D 精灵需要保留舱室主题色，AgX 会把高亮边圈洗成白色；这里用 Standard。
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.2

    world = scene.world or bpy.data.worlds.new('world')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value = (0.02, 0.025, 0.035, 1)
        bg.inputs['Strength'].default_value = 0.45

    cam_data = bpy.data.cameras.new('pipe_cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 2.15
    cam = bpy.data.objects.new('pipe_cam', cam_data)
    scene.collection.objects.link(cam)
    cam.location = (0, 0, 4.0)
    cam.rotation_euler = (0, 0, 0)
    scene.camera = cam

    key = bpy.data.lights.new('pipe_key', 'AREA')
    key.energy = 130
    key.shape = 'DISK'
    key.size = 3.0
    ko = bpy.data.objects.new('pipe_key', key)
    scene.collection.objects.link(ko)
    ko.location = (1.2, -1.4, 3.2)
    look_at(ko, (0, 0, 0))

    fill = bpy.data.lights.new('pipe_fill', 'AREA')
    fill.energy = 45
    fill.size = 3.0
    fo = bpy.data.objects.new('pipe_fill', fill)
    scene.collection.objects.link(fo)
    fo.location = (-1.6, 1.2, 2.5)
    look_at(fo, (0, 0, 0))
    return cam


def set_rim(color):
    mat = bpy.data.materials.get('pipe_rim')
    if not mat or not mat.use_nodes:
        return
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf:
        return
    col = (color[0] * 0.75, color[1] * 0.75, color[2] * 0.75, 1.0)
    for key in ('Emission Color', 'Base Color'):
        try:
            bsdf.inputs[key].default_value = col
        except KeyError:
            pass
    try:
        bsdf.inputs['Emission Strength'].default_value = 0.35
    except KeyError:
        pass


def main():
    tints = pipe_tints()
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    scene = bpy.context.scene
    cam = setup(scene)
    scene.render.filepath = os.path.join(PREVIEW_DIR, 'pipe-port-preview.png')
    cam.location = (1.2, -1.6, 2.3)
    look_at(cam, (0, 0, 0.1))
    cam.data.ortho_scale = 2.4
    set_rim(tints['engine'])
    bpy.ops.render.render(write_still=True)
    print('PIPE_PREVIEW ' + scene.render.filepath, flush=True)

    cam.location = (0, 0, 4.0)
    cam.rotation_euler = (0, 0, 0)
    cam.data.ortho_scale = 2.15
    for room in ROOMS:
        if room not in tints:
            continue
        set_rim(tints[room])
        scene.render.filepath = os.path.join(OUT, 'pipe-port-%s.png' % room)
        bpy.ops.render.render(write_still=True)
        print('PIPE_SPRITE %s %s' % (room, scene.render.filepath), flush=True)


if __name__ == '__main__':
    main()
