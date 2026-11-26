extends RefCounted

## 掩体、墙面装饰与设备台座构建器（从 map_builder.gd 拆出）。
## 保持与 map_builder.gd 相同的几何、材质缓存与隐藏背板逻辑。

const ArtStyle := preload("res://scripts/art_style.gd")
const SpaceData := preload("res://scripts/space_data.gd")

const COVER_SKIN_DIR := "res://assets/textures/cover/"
const CULL_DIST := 32.0
const CULL_MARGIN := 4.0
const COVER_SIGHT_SHELL := false

## 与 3d/tools/covers_lib.py 的 PBR_MAP 对齐；glow/mark/red/water 是各舱主题纯色，不注入。
const COVER_ROLE_PBR := {
	"metal": "metal_panel", "dark": "metal_panel",
	"steel": "brushed_steel", "shell": "shell_white", "white": "shell_white",
	"glass": "glass", "fabric": "fabric", "rubber": "rubber",
	"wood": "wood", "card": "wood", "bark": "wood", "soil": "rubber",
	"leaf": "leaf", "leaf2": "leaf", "hazard": "hazard", "screen": "screen",
}

## 掩体名义高度（米）。上游真源是 tools/blender-ship.py 的 furniture() 各分支顶面 z1。
const COVER_HEIGHT := {
	# 舱室家具
	"table": 0.82,
	"servicecounter": 1.24,
	"console": 0.86,
	"chair": 0.94,
	"sofa": 0.86,
	"medbed": 0.74,
	"fridge": 1.46,
	"shelftall": 2.05,
	"gunrack": 1.46,
	"pallet": 0.85,
	"crate": 0.84,
	# 电气 / 机械
	"machine": 1.06,
	"switchgear": 1.34,
	"transformer": 1.10,
	"breaker": 1.22,
	"servercab": 1.55,
	"reactor": 1.72,
	"engineblock": 1.24,
	# 显示 / 结构
	"holoscreen": 1.62,
	"screenwall": 1.78,
	"pillar": 1.30,
	# 生态舱
	"tank": 1.95,
	"tree": 1.60,
	"pond": 0.10,
	# === v2 房间专属 kind（由 3d/tools/build-map-v2.cjs 生成）BEGIN ===
	"armory_ammocrate": 1.70,
	"armory_gunrack": 1.70,
	"armory_issuedesk": 1.70,
	"armory_targetlane": 1.70,
	"armory_vise": 1.70,
	"armory_workbench": 1.70,
	"bridge_chair": 1.71,
	"bridge_column": 1.70,
	"bridge_holoscreen": 1.70,
	"bridge_navconsole": 1.70,
	"bridge_recorddesk": 1.70,
	"bridge_sideboard": 1.70,
	"bridge_table": 1.70,
	"cam_archivebox": 1.70,
	"cam_codecrack": 1.70,
	"cam_opsdesk": 1.70,
	"cam_screenwall": 1.70,
	"cam_servercab": 1.70,
	"ecosys_climate": 1.70,
	"ecosys_growrack": 1.70,
	"ecosys_irrigation": 1.70,
	"ecosys_oxygen": 1.70,
	"ecosys_pond": 1.70,
	"ecosys_shrub": 1.70,
	"ecosys_tank": 1.70,
	"ecosys_tree": 1.70,
	"engine_compressor": 1.70,
	"engine_cylinder": 1.70,
	"engine_fusepanel": 1.70,
	"engine_partscart": 1.70,
	"engine_reactor": 1.70,
	"engine_toolbench": 1.70,
	"fun_arcade": 1.70,
	"fun_coffeetable": 1.70,
	"fun_gametable": 1.70,
	"fun_jukebox": 1.70,
	"fun_racer": 1.70,
	"fun_sofa": 1.70,
	"fun_stool": 1.70,
	"med_bed": 1.70,
	"med_medcab": 1.70,
	"med_monitor": 1.70,
	"med_sterilizer": 1.70,
	"med_supplycart": 1.70,
	"med_surgery": 1.70,
	"med_ventilator": 1.70,
	"power_breakerbank": 1.70,
	"power_gauge": 1.70,
	"power_switchgear": 1.70,
	"power_transformer": 1.70,
	"transit_diningtable": 1.70,
	"transit_drinkbar": 1.70,
	"transit_platecart": 1.70,
	"transit_servicecounter": 1.70,
	"transit_trayreturn": 1.70,
	"warehouse_packbench": 1.70,
	"warehouse_pallet": 1.74,
	"warehouse_rack_east": 1.70,
	"warehouse_rack_west": 1.70,
	"warehouse_receiving": 1.70,
	"warehouse_terminal": 1.70,
	# === v2 房间专属 kind END ===
}

const WALL_SKIN := {
	"bridge": ["qwen/bridge/skin1", "qwen/bridge/skin2", "qwen/bridge/floor", "qwen/bridge/skin4"],
	"cam": ["qwen/cam/skin1", "qwen/cam/skin2", "qwen/cam/floor", "qwen/cam/skin4"],
	"ecosys": ["qwen/ecosys/skin1", "qwen/ecosys/skin2", "qwen/ecosys/floor", "qwen/ecosys/skin4"],
	"power": ["qwen/power/skin1", "qwen/power/skin2", "qwen/power/floor", "qwen/power/skin4"],
	"transit": ["qwen/transit/skin1", "qwen/transit/skin2", "qwen/transit/floor", "qwen/transit/skin4"],
	"fun": ["qwen/fun/skin1", "qwen/fun/skin2", "qwen/fun/floor", "qwen/fun/skin4"],
	"engine": ["qwen/engine/skin1", "qwen/engine/skin2", "qwen/engine/floor", "qwen/engine/skin4"],
	"med": ["qwen/med/skin1", "qwen/med/skin2", "qwen/med/floor", "qwen/med/skin4"],
	"armory": ["qwen/armory/skin1", "qwen/armory/skin2", "qwen/armory/floor", "qwen/armory/skin4"],
	"warehouse": ["qwen/warehouse/skin1", "qwen/warehouse/skin2", "qwen/warehouse/floor", "qwen/warehouse/skin4"],
}

var _cover_mats: Dictionary = {}
var _cover_models: Dictionary = {}
var _cover_refs: Dictionary = {}
var _sight_shell_hidden := 0


func sight_shell_stats() -> Dictionary:
	return {"hidden": _sight_shell_hidden, "show": COVER_SIGHT_SHELL}


func mat_count() -> int:
	return _cover_mats.size()


## 共享高分辨率外饰：整船只创建 ~10 个 StandardMaterial3D，贴图只加载一次。
func cover_mat(pbr_key: String) -> StandardMaterial3D:
	if _cover_mats.has(pbr_key):
		return _cover_mats[pbr_key] as StandardMaterial3D
	var m := StandardMaterial3D.new()
	ArtStyle.apply_cover_pbr(m, pbr_key)
	_cover_mats[pbr_key] = m
	return m


func _hide_sight_shell(n: Node) -> int:
	if COVER_SIGHT_SHELL:
		return 0
	var hidden := 0
	for c in n.get_children():
		var cn := String(c.name)
		if (c is GeometryInstance3D) and (cn == "sight_shell" or cn == "sightglow"):
			(c as GeometryInstance3D).visible = false
			hidden += 1
		hidden += _hide_sight_shell(c)
	return hidden


func _cover_ref(kind: String) -> Vector3:
	if _cover_refs.is_empty():
		var p := "res://data/cover_refs.json"
		if FileAccess.file_exists(p):
			var j: Variant = JSON.parse_string(FileAccess.get_file_as_string(p))
			if j is Dictionary:
				_cover_refs = j
	var r: Variant = _cover_refs.get(kind, null)
	if r is Array and (r as Array).size() >= 3:
		return Vector3(float(r[0]), float(r[2]), float(r[1]))
	return Vector3.ONE


func _cover_model(kind: String) -> PackedScene:
	if _cover_models.has(kind):
		return _cover_models[kind] as PackedScene
	var ps: PackedScene = null
	var path := "res://assets/models/%s.glb" % kind
	if ResourceLoader.exists(path):
		ps = load(path) as PackedScene
	_cover_models[kind] = ps
	return ps


func _inject_cover_mats(n: Node, cull_enabled: bool) -> void:
	if n is GeometryInstance3D and cull_enabled:
		var gi := n as GeometryInstance3D
		gi.visibility_range_end = CULL_DIST
		gi.visibility_range_end_margin = CULL_MARGIN
		gi.visibility_range_fade_mode = 0
	if n is MeshInstance3D:
		var mi := n as MeshInstance3D
		var mesh := mi.mesh
		if mesh != null:
			for i in range(mesh.get_surface_count()):
				var src: Material = mi.get_surface_override_material(i)
				if src == null:
					src = mesh.surface_get_material(i)
				if src == null:
					continue
				var nm := String(src.resource_name)
				var role := nm.substr(nm.rfind("_") + 1)
				if COVER_ROLE_PBR.has(role):
					mi.set_surface_override_material(i, cover_mat(String(COVER_ROLE_PBR[role])))
	for c in n.get_children():
		_inject_cover_mats(c, cull_enabled)


func _add_cover_model(builder: Node3D, kind: String, center: Vector3,
		size: Vector3, cull_enabled: bool, rid: String = "") -> bool:
	var ps := _cover_model(kind)
	if ps == null:
		return false
	var inst := ps.instantiate()
	var node := inst as Node3D
	if node == null:
		return false
	_inject_cover_mats(inst, cull_enabled)
	_sight_shell_hidden += _hide_sight_shell(inst)
	node.position = center
	node.scale = size
	builder.add_child(node)
	if rid != "":
		builder.call("_register_room_node", rid, node)
	return true


func _add_collision(builder: Node3D, center: Vector3, size: Vector3, rotation_y: float) -> void:
	var body := StaticBody3D.new()
	body.position = center
	body.rotation.y = rotation_y
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collision.shape = shape
	body.add_child(collision)
	builder.add_child(body)


func _add_cylinder(builder: Node3D, center: Vector3, radius: float, height: float,
		mat: Material, collide: bool) -> void:
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.height = height
	mesh.radial_segments = 32
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = center
	builder.add_child(mi)
	if not collide:
		return
	var body := StaticBody3D.new()
	body.position = center
	var collision := CollisionShape3D.new()
	var shape := CylinderShape3D.new()
	shape.radius = radius
	shape.height = height
	collision.shape = shape
	body.add_child(collision)
	builder.add_child(body)


func build_covers(builder: Node3D, data: Dictionary, cull_enabled: bool) -> void:
	var shifts: Array = SpaceData.section(data, "art").get("tint_shifts", [])
	for item: Dictionary in data.get("cover", []):
		var kind := String(item.get("kind", ""))
		var w := float(item.get("w", 1.0))
		var h := float(item.get("h", 1.0))
		if w <= 0.05 or h <= 0.05:
			continue
		var v: Dictionary = item.get("v", {})
		var hz := float(v.get("hz", 1.0))
		var height := float(COVER_HEIGHT.get(kind, 1.0)) * hz
		var tex := "panel-metal"
		if kind in ["crate", "rack", "locker", "fridge", "barrel"]:
			tex = "crate-steel"
		elif kind in ["table", "desk"]:
			tex = "table-composite"
		var base := Color(0.72, 0.76, 0.82)
		var tint_i := int(v.get("tint", 0))
		if tint_i >= 0 and tint_i < shifts.size():
			var shift: Array = shifts[tint_i]
			if shift.size() >= 3:
				base = Color(base.r * float(shift[0]), base.g * float(shift[1]), base.b * float(shift[2]))
		var rid := String(item.get("room", ""))
		if rid != "":
			for rr: Dictionary in data.get("rooms", []):
				if String(rr.get("id", "")) != rid:
					continue
				var th: Dictionary = rr.get("theme", {})
				var mk: Array = th.get("mark", [])
				if mk.size() >= 3:
					base = Color(clampf(float(mk[0]), 0.0, 1.0), clampf(float(mk[1]), 0.0, 1.0), clampf(float(mk[2]), 0.0, 1.0))
				break
		var mat: StandardMaterial3D = builder.call("_material", tex, base, true)
		var x := float(item.get("x", 0.0))
		var y := float(item.get("y", 0.0))
		var ref := _cover_ref(kind)
		var mscale := Vector3(w / maxf(ref.x, 0.01), height / maxf(ref.y, 0.01), h / maxf(ref.z, 0.01))
		if _add_cover_model(builder, kind, Vector3(x + w * 0.5, 0.0, y + h * 0.5), mscale, cull_enabled, rid):
			_add_collision(builder, Vector3(x + w * 0.5, height * 0.5, y + h * 0.5),
				Vector3(w, maxf(height, 0.08), h), 0.0)
			continue
		if kind == "table" and absf(w - h) <= 0.6:
			_add_cylinder(builder, Vector3(x + w * 0.5, height * 0.5, y + h * 0.5),
				w * 0.5, height, mat, true)
			continue
		builder.call("_add_box", Vector3(x + w * 0.5, height * 0.5, y + h * 0.5),
			Vector3(w, max(height, 0.08), h), 0.0, mat, true)


## v2：40 件墙面装饰 —— 外饰用本地成品贴图，几何一件不动。
func build_wall_decor_v2(builder: Node3D, data: Dictionary) -> void:
	var glows := {}
	var per_room := {}
	for r: Dictionary in data.get("rooms", []):
		var th: Dictionary = r.get("theme", {})
		var g: Array = th.get("glow", [])
		if g.size() >= 3:
			glows[String(r.get("id", ""))] = Color(
				clampf(float(g[0]), 0.0, 1.0), clampf(float(g[1]), 0.0, 1.0), clampf(float(g[2]), 0.0, 1.0))
	for d: Dictionary in data.get("decor", []):
		var rid := String(d.get("room", ""))
		if rid == "" or not d.has("side"):
			continue
		var w := float(d.get("w", 0.3))
		var h := float(d.get("h", 0.3))
		var span := maxf(w, h)
		var size: Vector3 = Vector3(span, 1.25, 0.08) if w >= h else Vector3(0.08, 1.25, span)
		var col: Color = Color(0.70, 0.80, 0.90)
		if glows.has(rid):
			col = glows[rid] as Color
		var skin := ""
		if WALL_SKIN.has(rid):
			var arr: Array = WALL_SKIN[rid]
			var n: int = int(per_room.get(rid, 0))
			skin = String(arr[n % arr.size()])
			per_room[rid] = n + 1
		var mat: StandardMaterial3D = builder.call("_material", skin, Color(0.92, 0.95, 1.0), false)
		mat.emission = col
		mat.emission_energy_multiplier = 0.12
		builder.call("_add_box",
			Vector3(float(d.get("x", 0.0)) + w * 0.5, 1.95, float(d.get("y", 0.0)) + h * 0.5),
			size, 0.0, mat, false)


## v2：给「无掩体可用」的设备补一个纯表现台座（高 0.55m、无碰撞）。
func build_device_pedestals(builder: Node3D, data: Dictionary) -> void:
	var marks := {}
	for r: Dictionary in data.get("rooms", []):
		var th: Dictionary = r.get("theme", {})
		var mk: Array = th.get("mark", [])
		if mk.size() >= 3:
			marks[String(r.get("id", ""))] = Color(
				clampf(float(mk[0]), 0.0, 1.0), clampf(float(mk[1]), 0.0, 1.0), clampf(float(mk[2]), 0.0, 1.0))
	var targets: Array = []
	for p: Dictionary in data.get("points", []):
		targets.append(p)
	for f: Dictionary in data.get("facility", []):
		if String(f.get("kind", "")) == "breaker":
			targets.append(f)
	for t: Dictionary in targets:
		var px := float(t.get("x", 0.0))
		var py := float(t.get("y", 0.0))
		var covered := false
		for c: Dictionary in data.get("cover", []):
			var cx := float(c.get("x", 0.0))
			var cy := float(c.get("y", 0.0))
			if px >= cx - 0.2 and px <= cx + float(c.get("w", 0.0)) + 0.2 \
					and py >= cy - 0.2 and py <= cy + float(c.get("h", 0.0)) + 0.2:
				covered = true
				break
		if covered:
			continue
		var rid := String(t.get("room", ""))
		var col: Color = Color(0.70, 0.78, 0.86)
		if marks.has(rid):
			col = marks[rid] as Color
		var shell_mat: StandardMaterial3D = builder.call("_material", "panel-white", Color(0.66, 0.70, 0.74), false)
		var trim_mat: StandardMaterial3D = builder.call("_material", "panel-metal", Color(0.62, 0.66, 0.72), false)
		var accent_mat := StandardMaterial3D.new()
		accent_mat.albedo_color = col
		accent_mat.emission_enabled = true
		accent_mat.emission = col
		accent_mat.emission_energy_multiplier = 0.55
		accent_mat.roughness = 0.4
		builder.call("_add_box", Vector3(px, 0.275, py), Vector3(0.90, 0.55, 0.90), 0.0, shell_mat, false)
		builder.call("_add_box", Vector3(px, 0.04, py), Vector3(0.74, 0.08, 0.74), 0.0, trim_mat, false)
		builder.call("_add_box", Vector3(px, 0.535, py), Vector3(0.98, 0.05, 0.98), 0.0, trim_mat, false)
		builder.call("_add_box", Vector3(px, 0.42, py - 0.462), Vector3(0.70, 0.025, 0.02), 0.0, accent_mat, false)
		builder.call("_add_box", Vector3(px, 0.575, py), Vector3(0.34, 0.03, 0.20), 0.0, trim_mat, false)
