"""美术方向三件套（门 / 保安机器人 / 工业天花板）的 Blender 共享库。

口径与 covers_lib / blender-export.py 一致：
  · 米制、+Z 上、+Y 前（导出后 Godot -Z 前）、pivot 脚下/中心由调用方决定
  · 贴图内嵌 glb（export_image_format='AUTO'），不新增运行时散图
  · 每个资产一个 .blend + 一个 .glb；动画走 NLA/动作导出
"""
import bpy
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEX = os.path.join(ROOT, '3d', 'assets', 'textures', 'art-direction')
MODEL_DIR = os.path.join(ROOT, '3d', 'assets', 'models')
EXPORT_DIR = os.path.join(ROOT, '3d', 'assets', 'export')
os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(EXPORT_DIR, exist_ok=True)

_IMGS = {}


def img(path, non_color=False):
    key = (path, non_color)
    if key not in _IMGS:
        if not os.path.exists(path):
            return None
        im = bpy.data.images.load(path, check_existing=True)
        if non_color:
            im.colorspace_settings.name = 'Non-Color'
        _IMGS[key] = im
    return _IMGS[key]


def tex_mat(name, albedo=None, normal=None, rough=None, emissive=None,
            metallic=0.35, roughness=0.62, emission_strength=0.0,
            base=(1.0, 1.0, 1.0, 1.0), normal_strength=0.8):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = base
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = roughness
    nodes, links = m.node_tree.nodes, m.node_tree.links
    if albedo:
        im = img(albedo)
        if im:
            t = nodes.new('ShaderNodeTexImage')
            t.image = im
            t.label = 'albedo'
            links.new(t.outputs['Color'], b.inputs['Base Color'])
    if rough:
        im = img(rough, True)
        if im:
            t = nodes.new('ShaderNodeTexImage')
            t.image = im
            t.label = 'rough'
            links.new(t.outputs['Color'], b.inputs['Roughness'])
    if normal:
        im = img(normal, True)
        if im:
            t = nodes.new('ShaderNodeTexImage')
            t.image = im
            t.label = 'normal'
            nm = nodes.new('ShaderNodeNormalMap')
            nm.inputs['Strength'].default_value = normal_strength
            links.new(t.outputs['Color'], nm.inputs['Color'])
            links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if emissive:
        im = img(emissive)
        if im:
            t = nodes.new('ShaderNodeTexImage')
            t.image = im
            t.label = 'emissive'
            links.new(t.outputs['Color'], b.inputs['Emission Color'])
            b.inputs['Emission Strength'].default_value = emission_strength
    return m


def solid_mat(name, color, metallic=0.3, rough=0.6, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = color
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    if emit > 0:
        b.inputs['Emission Color'].default_value = color
        b.inputs['Emission Strength'].default_value = emit
    return m


def join_meshes(coll, name):
    """同材质的多件合并成一个网格：门框/梁/管线/线槽每实例只占 1 个 primitive。"""
    meshes = [o for o in coll.objects if o.type == 'MESH']
    if len(meshes) <= 1:
        if meshes:
            meshes[0].name = name
        return meshes[0] if meshes else None
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    return obj


def export(coll, name, animations=False):
    import covers_lib as L
    objs = [o for o in coll.objects]
    if not objs:
        raise RuntimeError('empty collection ' + name)
    tris = L.tri_count(objs)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    blend = os.path.join(MODEL_DIR, name + '.blend')
    out = os.path.join(EXPORT_DIR, name + '.glb')
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    kw = dict(
        filepath=out, export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_texcoords=True,
        export_normals=True, export_tangents=False, export_cameras=False,
        export_lights=False, export_extras=True, export_materials='EXPORT',
        export_image_format='AUTO',
    )
    if animations:
        kw.update(
            export_animations=True, export_animation_mode='ACTIONS',
            export_nla_strips=False, export_frame_range=False,
            export_anim_slide_to_zero=True, export_force_sampling=True,
            export_anim_single_armature=True,
        )
    else:
        kw.update(export_animations=False)
    bpy.ops.export_scene.gltf(**kw)
    print('ART_ASSET %-18s tris=%5d %7.1f KB -> %s' % (
        name, tris, os.path.getsize(out) / 1024.0, out), flush=True)
    return {'name': name, 'tris': tris, 'kb': round(os.path.getsize(out) / 1024.0, 1)}
