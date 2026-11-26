extends RefCounted

## 掩体、墙面装饰与设备台座构建器（从 map_builder.gd 拆出）。
## 保持与 map_builder.gd 相同的几何、材质缓存与隐藏背板逻辑。

const ArtStyle := preload("res://scripts/art_style.gd")
const SpaceData := preload("res://scripts/space_data.gd")

const COVER_SKIN_DIR := "res://assets/textures/cover/"
const CULL_DIST := 32.0
const CULL_MARGIN := 4.0
const COVER_SIGHT_SHELL := false

## 与 3d/tools/covers_lib.py 的 PBR_MAP 对齐；补齐 soil / bark / card / water 独立语义角色，避免错映成地毯或木桌。
const COVER_ROLE_PBR := {
	"metal": "metal_panel", "dark": "metal_panel",
	"steel": "brushed_steel", "shell": "shell_white", "white": "shell_white",
	"glass": "glass", "fabric": "fabric", "rubber": "rubber",
	"wood": "wood", "card": "card", "bark": "bark", "soil": "soil",
	"leaf": "leaf", "leaf2": "leaf", "water": "water",
	"hazard": "hazard", "screen": "screen",
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

## 墙面装饰画回退贴图（移除 floor 与 skin4，避免把地板贴图贴上墙）。
const WALL_SKIN := {
	"bridge": ["qwen/bridge/skin2", "qwen/bridge/skin1"],
	"cam": ["qwen/cam/skin2", "qwen/cam/skin1"],
	"ecosys": ["qwen/ecosys/skin2", "qwen/ecosys/skin1"],
	"power": ["qwen/power/skin2", "qwen/power/skin1"],
	"transit": ["qwen/transit/skin2", "qwen/transit/skin1"],
	"fun": ["qwen/fun/skin2", "qwen/fun/skin1"],
	"engine": ["qwen/engine/skin2", "qwen/engine/skin1"],
	"med": ["qwen/med/skin2", "qwen/med/skin1"],
	"armory": ["qwen/armory/skin2", "qwen/armory/skin1"],
	"warehouse": ["qwen/warehouse/skin2", "qwen/warehouse/skin1"],
}

var _cover_mats: Dictionary = {}
var _cover_models: Dictionary = {}
var _cover_refs: Dictionary = {}
var _sight_shell_hidden := 0


func sight_shell_stats() -> Dictionary:
	return {"hidden": _sight_shell_hidden, "show": COVER_SIGHT_SHELL}


func mat_count() -> int:
	return _cover_mats.size()


## 共享高分辨率外饰：按 PBR 角色与舱室色温缓存材质，避免全船家具同色与贴图重复加载。
func cover_mat(pbr_key: String, rid: String = "", theme: Dictionary = {}) -> StandardMaterial3D:
	var use_tint := (pbr_key == "metal_panel" or pbr_key == "shell_white") and rid != "" and not theme.is_empty()
	var cache_key := "%s|%s" % [pbr_key, rid] if use_tint else pbr_key
	if _cover_mats.has(cache_key):
		return _cover_mats[cache_key] as StandardMaterial3D
	var m := StandardMaterial3D.new()
	ArtStyle.apply_cover_pbr(m, pbr_key)
	_apply_cover_role_overrides(m, pbr_key)
	if use_tint:
		var tc := _theme_tint_color(theme)
		m.albedo_color = Color.WHITE.lerp(tc, 0.18)
	_cover_mats[cache_key] = m
	return m


## 针对 glass / soil / bark / card / leaf / water 修正语义与 PBR 参数。
func _apply_cover_role_overrides(m: StandardMaterial3D, pbr_key: String) -> void:
	match pbr_key:
		"glass":
			m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			m.albedo_color = Color(0.68, 0.84, 0.90, 0.34)
			m.roughness = 0.20
			m.metallic_specular = 0.50
		"soil":
			m.metallic = 0.0
			m.roughness = 0.95
			m.metallic_specular = 0.15
			m.albedo_color = Color(0.24, 0.17, 0.12)
			var soil_path := COVER_SKIN_DIR + "soil_albedo.jpg"
			if ResourceLoader.exists(soil_path):
				m.albedo_texture = load(soil_path) as Texture2D
		"bark":
			m.metallic = 0.0
			m.roughness = 0.92
			m.metallic_specular = 0.18
			m.albedo_color = Color(0.32, 0.22, 0.15)
		"card":
			m.metallic = 0.0
			m.roughness = 0.88
			m.metallic_specular = 0.20
			m.albedo_color = Color(0.56, 0.44, 0.30)
		"leaf":
			m.metallic = 0.0
			m.roughness = 0.78
			var leaf_path := COVER_SKIN_DIR + "leaf_albedo.jpg"
			if ResourceLoader.exists(leaf_path):
				m.albedo_texture = load(leaf_path) as Texture2D
				m.albedo_color = Color(0.52, 0.86, 0.54)
			else:
				m.albedo_color = Color(0.22, 0.42, 0.24)
		"water":
			m.metallic = 0.05
			m.roughness = 0.16
			m.metallic_specular = 0.75
			m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			m.albedo_color = Color(0.18, 0.56, 0.62, 0.58)


func _theme_tint_color(theme: Dictionary) -> Color:
	var raw: Variant = theme.get("mark", theme.get("glow", theme.get("wall", [])))
	if raw is Array and (raw as Array).size() >= 3:
		var a := raw as Array
		return Color(clampf(float(a[0]), 0.0, 1.0), clampf(float(a[1]), 0.0, 1.0), clampf(float(a[2]), 0.0, 1.0))
	return Color.WHITE


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


func _inject_cover_mats(n: Node, cull_enabled: bool, rid: String = "", theme: Dictionary = {}) -> void:
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
					mi.set_surface_override_material(i, cover_mat(String(COVER_ROLE_PBR[role]), rid, theme))
	for c in n.get_children():
		_inject_cover_mats(c, cull_enabled, rid, theme)


func _add_cover_model(builder: Node3D, kind: String, center: Vector3,
		size: Vector3, cull_enabled: bool, rid: String = "", theme: Dictionary = {}) -> bool:
	var ps := _cover_model(kind)
	if ps == null:
		return false
	var inst := ps.instantiate()
	var node := inst as Node3D
	if node == null:
		return false
	_inject_cover_mats(inst, cull_enabled, rid, theme)
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
	var room_themes := {}
	for rr: Dictionary in data.get("rooms", []):
		room_themes[String(rr.get("id", ""))] = rr.get("theme", {})
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
		var th: Dictionary = room_themes.get(rid, {}) as Dictionary
		if not th.is_empty():
			var mk: Array = th.get("mark", [])
			if mk.size() >= 3:
				base = Color(clampf(float(mk[0]), 0.0, 1.0), clampf(float(mk[1]), 0.0, 1.0), clampf(float(mk[2]), 0.0, 1.0))
		var mat: StandardMaterial3D = builder.call("_material", tex, base, true)
		var x := float(item.get("x", 0.0))
		var y := float(item.get("y", 0.0))
		var ref := _cover_ref(kind)
		var mscale := Vector3(w / maxf(ref.x, 0.01), height / maxf(ref.y, 0.01), h / maxf(ref.z, 0.01))
		if _add_cover_model(builder, kind, Vector3(x + w * 0.5, 0.0, y + h * 0.5), mscale, cull_enabled, rid, th):
			_add_collision(builder, Vector3(x + w * 0.5, height * 0.5, y + h * 0.5),
				Vector3(w, maxf(height, 0.08), h), 0.0)
			continue
		if kind == "table" and absf(w - h) <= 0.6:
			_add_cylinder(builder, Vector3(x + w * 0.5, height * 0.5, y + h * 0.5),
				w * 0.5, height, mat, true)
			continue
		builder.call("_add_box", Vector3(x + w * 0.5, height * 0.5, y + h * 0.5),
			Vector3(w, max(height, 0.08), h), 0.0, mat, true)


## v2：40 件墙面装饰 —— 优先加载分舱 decor.png（回退 skin2/skin1），加装 3D 深金属相框并激活柔和自发光。
func build_wall_decor_v2(builder: Node3D, data: Dictionary) -> void:
	var glows := {}
	var per_room := {}
	for r: Dictionary in data.get("rooms", []):
		var th: Dictionary = r.get("theme", {})
		var g: Array = th.get("glow", [])
		if g.size() >= 3:
			glows[String(r.get("id", ""))] = Color(
				clampf(float(g[0]), 0.0, 1.0), clampf(float(g[1]), 0.0, 1.0), clampf(float(g[2]), 0.0, 1.0))
	var frame_mat := StandardMaterial3D.new()
	frame_mat.albedo_color = Color(0.16, 0.18, 0.22)
	frame_mat.metallic = 0.72
	frame_mat.roughness = 0.42
	ArtStyle.apply_shared_pbr(frame_mat, "res://assets/textures/panel-metal.png", 0.55, false)
	for d: Dictionary in data.get("decor", []):
		var rid := String(d.get("room", ""))
		if rid == "" or not d.has("side"):
			continue
		var w := float(d.get("w", 0.3))
		var h := float(d.get("h", 0.3))
		var span := maxf(w, h)
		var size: Vector3 = Vector3(span, 1.25, 0.05) if w >= h else Vector3(0.05, 1.25, span)
		var frame_size: Vector3 = Vector3(span + 0.08, 1.33, 0.04) if w >= h else Vector3(0.04, 1.33, span + 0.08)
		var col: Color = glows.get(rid, Color(0.70, 0.80, 0.90)) as Color
		var n: int = int(per_room.get(rid, 0))
		per_room[rid] = n + 1
		var skin := ""
		var bespoke := false
		var decor_path := "res://assets/textures/qwen/%s/decor.png" % rid
		if n == 0 and ResourceLoader.exists(decor_path):
			skin = "qwen/%s/decor" % rid
			bespoke = true
		elif WALL_SKIN.has(rid):
			var arr: Array = WALL_SKIN[rid]
			skin = String(arr[n % arr.size()])
		var base_mat: StandardMaterial3D = builder.call("_material", skin, Color(0.92, 0.95, 1.0), false)
		var mat := base_mat.duplicate() as StandardMaterial3D
		mat.uv1_triplanar = false
		mat.uv1_scale = Vector3.ONE if bespoke else Vector3(clampf(span / 1.5, 0.8, 2.2), 1.0, 1.0)
		mat.emission_enabled = true
		mat.emission = col
		mat.emission_energy_multiplier = 0.08
		var pos := Vector3(float(d.get("x", 0.0)) + w * 0.5, 1.95, float(d.get("y", 0.0)) + h * 0.5)
		var inward := _decor_inward(String(d.get("side", "")))
		builder.call("_add_box", pos - inward * 0.01, frame_size, 0.0, frame_mat, false)
		builder.call("_add_box", pos + inward * 0.015, size, 0.0, mat, false)


func _decor_inward(side: String) -> Vector3:
	match side:
		"l":
			return Vector3(1.0, 0.0, 0.0)
		"r":
			return Vector3(-1.0, 0.0, 0.0)
		"t":
			return Vector3(0.0, 0.0, 1.0)
		"b":
			return Vector3(0.0, 0.0, -1.0)
	return Vector3.ZERO


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
