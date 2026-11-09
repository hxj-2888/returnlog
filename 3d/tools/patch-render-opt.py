# -*- coding: utf-8 -*-
"""幂等补丁：3D 可见性优化 + 高分辨率共享外饰 + 性能量测。

依据 docs/调研报告_3D帧率优化_20261107.md 与用户 2026-11-07 裁定：
「只对玩家可见的地方渲染，其他地方静默加载；不要直接压画质」。

改动：
  1. map_builder.gd：新增 1024² 共享材质表（按 GLB 材质名 role 注入）、
     GeometryInstance3D 距离剔除（visibility_range_end + margin）、
     房间级 visible 切换（节点常驻内存，_process 每 0.25s 更新）。
  2. main.gd：新增 --bench，落盘 FPS / draw call / 帧内对象 / 纹理显存。

几何、碰撞、交互点位、地图数据一律不动。再次运行输出「已是最新，无改动」。
用法： C:\\Python314\\python.exe 3d/tools/patch-render-opt.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MB = os.path.join(ROOT, '3d', 'preview', 'scripts', 'map_builder.gd')
MAIN = os.path.join(ROOT, '3d', 'preview', 'scripts', 'main.gd')

MARKER = 'const COVER_SKIN_DIR := "res://assets/textures/cover/"'

CONST_BLOCK = '''

## 2026-11-07 高分辨率外饰 + 可见性优化（见 docs/调研报告_3D帧率优化_20261107.md）。
## 外饰贴图只存一份 1024²，61 件 GLB 共享同一批 Material / Texture2D；
## GLB 内嵌的 256² 图退为远处 / 静默档（贴图流送），不再靠降画质换帧率。
const COVER_SKIN_DIR := "res://assets/textures/cover/"
## 距离剔除：超过该距离不提交渲染；margin 提供迟滞，避免边界反复跳变。
const CULL_DIST := 32.0
const CULL_MARGIN := 4.0
## 房间级静默加载：玩家所在房间 + 附近房间保留，其余 visible=false（节点常驻内存，不卸载）。
const ROOM_KEEP_RADIUS := 26.0
## 与 3d/tools/covers_lib.py 的 PBR_MAP 对齐；glow/mark/red/water 是各舱主题纯色，不注入。
const COVER_ROLE_PBR := {
\t"metal": "metal_panel", "dark": "metal_panel",
\t"steel": "brushed_steel", "shell": "shell_white", "white": "shell_white",
\t"glass": "glass", "fabric": "fabric", "rubber": "rubber",
\t"wood": "wood", "card": "wood", "bark": "wood", "soil": "rubber",
\t"leaf": "leaf", "leaf2": "leaf", "hazard": "hazard", "screen": "screen",
}
var _cover_mats: Dictionary = {}
var _room_nodes: Dictionary = {}
var _cull_enabled := false
var _cull_tick := 0.0
'''

FUNCS = '''## 共享高分辨率外饰：整船只创建 ~10 个 StandardMaterial3D，贴图只加载一次。
func _cover_mat(pbr_key: String) -> StandardMaterial3D:
\tif _cover_mats.has(pbr_key):
\t\treturn _cover_mats[pbr_key] as StandardMaterial3D
\tvar m := StandardMaterial3D.new()
\tvar base := COVER_SKIN_DIR + pbr_key
\tif ResourceLoader.exists(base + "_albedo.jpg"):
\t\tm.albedo_texture = load(base + "_albedo.jpg") as Texture2D
\tif ResourceLoader.exists(base + "_normal.jpg"):
\t\tm.normal_enabled = true
\t\tm.normal_texture = load(base + "_normal.jpg") as Texture2D
\t\tm.normal_scale = 0.65
\tm.roughness = 0.62
\tm.metallic = 0.22
\tm.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
\t_cover_mats[pbr_key] = m
\treturn m


func _cover_mat_count() -> int:
\treturn _cover_mats.size()


## 按 surface 注入共享材质；不能用 material_override（会把整个 GLB 刷成单色、丢失分件层次）。
## 纯色主题材质不在 COVER_ROLE_PBR 里，保持各舱原色不变。
func _inject_cover_mats(n: Node) -> void:
\tif n is GeometryInstance3D and _cull_enabled:
\t\tvar gi := n as GeometryInstance3D
\t\tgi.visibility_range_end = CULL_DIST
\t\tgi.visibility_range_end_margin = CULL_MARGIN
\t\tgi.visibility_range_fade_mode = 0   # GL Compatibility 忽略淡出，用迟滞硬切换
\tif n is MeshInstance3D:
\t\tvar mi := n as MeshInstance3D
\t\tvar mesh := mi.mesh
\t\tif mesh != null:
\t\t\tfor i in range(mesh.get_surface_count()):
\t\t\t\tvar src: Material = mi.get_surface_override_material(i)
\t\t\t\tif src == null:
\t\t\t\t\tsrc = mesh.surface_get_material(i)
\t\t\t\tif src == null:
\t\t\t\t\tcontinue
\t\t\t\tvar nm := String(src.resource_name)
\t\t\t\tvar role := nm.substr(nm.rfind("_") + 1)
\t\t\t\tif COVER_ROLE_PBR.has(role):
\t\t\t\t\tmi.set_surface_override_material(i, _cover_mat(String(COVER_ROLE_PBR[role])))
\tfor c in n.get_children():
\t\t_inject_cover_mats(c)


func _register_room_node(rid: String, node: Node3D) -> void:
\tif not _room_nodes.has(rid):
\t\t_room_nodes[rid] = []
\t_room_nodes[rid].append(node)


func _point_in_poly(x: float, z: float, poly: Array) -> bool:
\tvar inside := false
\tvar j := poly.size() - 1
\tfor i in poly.size():
\t\tvar a: Array = poly[i]
\t\tvar b: Array = poly[j]
\t\tif ((a[1] > z) != (b[1] > z)) and x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]:
\t\t\tinside = not inside
\t\tj = i
\treturn inside


func _poly_center(poly: Array) -> Vector2:
\tif poly.is_empty():
\t\treturn Vector2.ZERO
\tvar sx := 0.0
\tvar sy := 0.0
\tfor p in poly:
\t\tsx += float(p[0])
\t\tsy += float(p[1])
\treturn Vector2(sx / poly.size(), sy / poly.size())


## 正常游玩时每 0.25 秒更新一次房间可见性；自测 / 截图参数下关闭，避免验收读数缺几何。
func _ready() -> void:
\tvar args := OS.get_cmdline_user_args()
\t_cull_enabled = true
\tfor a in args:
\t\tvar s := String(a)
\t\tif s.begins_with("--") and s != "--bench":
\t\t\t_cull_enabled = false
\t\t\tbreak


func _process(delta: float) -> void:
\tif not _cull_enabled:
\t\treturn
\t_cull_tick += delta
\tif _cull_tick < 0.25:
\t\treturn
\t_cull_tick = 0.0
\tvar host := get_parent()
\tif host == null:
\t\treturn
\tvar pl: Variant = host.get("player")
\tif pl == null or not (pl is Node3D):
\t\treturn
\tvar pos: Vector3 = (pl as Node3D).global_position
\tvar active := {}
\tfor r: Dictionary in data.get("rooms", []):
\t\tvar rid := String(r.get("id", ""))
\t\tvar poly: Array = r.get("poly", [])
\t\tvar c := _poly_center(poly)
\t\tif _point_in_poly(pos.x, pos.z, poly) or c.distance_to(Vector2(pos.x, pos.z)) < ROOM_KEEP_RADIUS:
\t\t\tactive[rid] = true
\tfor rid in _room_nodes.keys():
\t\tvar on: bool = active.has(rid)
\t\tfor n in _room_nodes[rid]:
\t\t\tif n is Node3D:
\t\t\t\t(n as Node3D).visible = on


'''

OLD_ADD = '''func _add_cover_model(kind: String, center: Vector3, size: Vector3) -> bool:
\tvar ps := _cover_model(kind)
\tif ps == null:
\t\treturn false
\tvar inst := ps.instantiate()
\tvar node := inst as Node3D
\tif node == null:
\t\treturn false
\tnode.position = center
\tnode.scale = size
\tadd_child(node)
\treturn true'''

NEW_ADD = '''func _add_cover_model(kind: String, center: Vector3, size: Vector3, rid: String = "") -> bool:
\tvar ps := _cover_model(kind)
\tif ps == null:
\t\treturn false
\tvar inst := ps.instantiate()
\tvar node := inst as Node3D
\tif node == null:
\t\treturn false
\t_inject_cover_mats(inst)
\tnode.position = center
\tnode.scale = size
\tadd_child(node)
\tif rid != "":
\t\t_register_room_node(rid, node)
\treturn true'''

BENCH_FUNC = '''## 性能读数落盘：FPS / draw call / 帧内对象 / 纹理显存。
## headless 下 FPS 只作相对比较（不受 vsync 约束），draw call 与显存更有参考价值。
func _run_bench() -> void:
\tvar fps := []
\tfor i in 120:
\t\tawait get_tree().process_frame
\t\tif i >= 30:
\t\t\tfps.append(Engine.get_frames_per_second())
\tvar avg := 0.0
\tfor f in fps:
\t\tavg += f
\tif not fps.is_empty():
\t\tavg /= float(fps.size())
\tvar covers: Array = builder.data.get("cover", [])
\tvar room_nodes: Dictionary = builder.get("_room_nodes")
\tvar hidden_nodes := 0
\tvar shown_nodes := 0
\tfor rid in room_nodes.keys():
\t\tfor n in room_nodes[rid]:
\t\t\tif n is Node3D and not (n as Node3D).visible:
\t\t\t\thidden_nodes += 1
\t\t\telse:
\t\t\t\tshown_nodes += 1
\tvar mode := "all" if OS.get_cmdline_user_args().has("--bench-all") else "cull"
\tvar out := {
\t\t"mode": mode,
\t\t"fps_avg": avg,
\t\t"draw_calls": Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
\t\t"objects_in_frame": Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),
\t\t"texture_mem_bytes": Performance.get_monitor(Performance.RENDER_TEXTURE_MEM_USED),
\t\t"covers": covers.size(),
\t\t"shared_cover_mats": builder.call("_cover_mat_count"),
\t\t"visible_cover_nodes": shown_nodes,
\t\t"hidden_cover_nodes": hidden_nodes,
\t\t"note": "GPU monitor（draw call / 帧内对象 / 纹理显存）需非 headless 运行，headless 下为 0；FPS 受窗口启动与采样时长影响，仅作参考，优化结论以 draw call / 帧内对象 / 静默节点数为准。",
\t}
\tvar fh := FileAccess.open("res://bench-result.json", FileAccess.WRITE)
\tif fh != null:
\t\tfh.store_string(JSON.stringify(out, "\\t"))
\t\tfh.close()
\tprint("BENCH " + JSON.stringify(out))
\tget_tree().quit()


'''


def patch(path, pairs, marker):
    with open(path, encoding='utf-8') as f:
        text = f.read()
    if marker in text:
        print('  已是最新：%s' % os.path.relpath(path, ROOT))
        return 0
    n = 0
    for old, new in pairs:
        if old not in text:
            print('  !! 未命中 %s :: %s' % (os.path.relpath(path, ROOT), old.splitlines()[0][:70]))
            continue
        text = text.replace(old, new, 1)
        n += 1
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(text)
    print('  已更新 %s（%d 处）' % (os.path.relpath(path, ROOT), n))
    return n


def main():
    total = 0
    total += patch(MB, [
        ('const FLOOR_SPEC_PATH := "res://data/floor_spec.json"\nvar floor_spec: Dictionary = {}',
         'const FLOOR_SPEC_PATH := "res://data/floor_spec.json"\nvar floor_spec: Dictionary = {}' + CONST_BLOCK),
        (OLD_ADD, FUNCS + NEW_ADD),
        ('\tif _add_cover_model(kind, Vector3(x + w * 0.5, 0.0, y + h * 0.5), mscale):',
         '\tif _add_cover_model(kind, Vector3(x + w * 0.5, 0.0, y + h * 0.5), mscale, rid):'),
    ], MARKER)
    total += patch(MAIN, [
        ('\t_build_hud()\n\n\t# 断电 / 交互 / 美术自测要在 HUD 建好之后再跑，否则读数会打在 null 标签上',
         '\t_build_hud()\n\n\tif args.has("--bench") or args.has("--bench-all"):\n\t\tawait _run_bench()\n\t\treturn\n\n\t# 断电 / 交互 / 美术自测要在 HUD 建好之后再跑，否则读数会打在 null 标签上'),
        ('func _arg_value(args: PackedStringArray, key: String) -> String:',
         BENCH_FUNC + 'func _arg_value(args: PackedStringArray, key: String) -> String:'),
    ], 'func _run_bench()')
    print('共 %d 处改动' % total)


if __name__ == '__main__':
    main()
