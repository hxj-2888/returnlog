extends Node3D

const ArtStyle := preload("res://scripts/art_style.gd")
const MinigameData := preload("res://scripts/minigame/mg_data.gd")

## 一个任务点设备：3D 模型（优先 Blender GLB，缺失时程序化兜底）+ 交互锚点。
## 模型约定：Blender 底面中心为原点、正面 +Y；导入 Godot 后正面 -Z。
## 这里只负责“摆在场景里 / 给镜头一个落点”，玩法仍在 minigame/ 里。

const MODEL_BY_KIND := {
	"wire": "device_panel_fix",
	"sync": "device_panel_fix",
	"match": "device_panel_fix",
	"lever": "device_breaker",
	"pour": "device_oxygen",
	"swap": "device_transformer",
	"align": "device_medbay",
	"aim": "device_medbay",
	"place": "device_panel_fix",
	"level": "device_panel_fix",
	"plate": "device_panel_fix",
}
const SCREEN_HEIGHT := {
	"device_panel_fix": 0.66,
	"device_breaker": 0.62,
	"device_oxygen": 0.92,
	"device_transformer": 1.00,
	"device_medbay": 1.10,
	"device_pod": 1.20,
}
const RING_COLOR := {
	"wire": Color("#F0C674"), "place": Color("#73A7FF"), "lever": Color("#E0574F"),
	"sync": Color("#5AD1C0"), "pour": Color("#00E5B0"), "swap": Color("#B07CFF"),
	"align": Color("#00E5B0"), "aim": Color("#E0574F"), "match": Color("#73A7FF"),
	"level": Color("#F0C674"), "plate": Color("#73A7FF"),
}

var task_label := ""
var kind := "place"
var tier := "normal"
var point_index := -1
var room_id := ""

var _face_dir := Vector3(0, 0, -1)
var _screen_height := 0.9
var _scale := 1.0
var _from_glb := false
var _screen_material: StandardMaterial3D = null

static var _panel_map: Dictionary = {}
static var _mg_data: Dictionary = {}


static func _ensure_mg_data() -> Dictionary:
	if _mg_data.is_empty():
		_mg_data = MinigameData.load_data()
	return _mg_data


## 任务名 → 面板贴图。映射读 res://data/panels.json（由 3d/tools/bake-refs.py 生成），
## 不在 GDScript 里抄第二份 slug 规则 —— 那份规则只存在于生成器与清单里。
static func panel_texture(label: String) -> String:
	if _panel_map.is_empty():
		var file := FileAccess.open("res://data/panels.json", FileAccess.READ)
		if file == null:
			return ""
		var parsed: Variant = JSON.parse_string(file.get_as_text())
		if not (parsed is Dictionary):
			return ""
		_panel_map = parsed.get("panels", {})
	var path := String(_panel_map.get(label, ""))
	if path != "" and ResourceLoader.exists(path):
		return path
	return ""


func setup(point: Dictionary, p_kind: String, p_tier: String, point_id: int, room_center: Vector2) -> void:
	point_index = point_id
	task_label = String(point.get("label", "任务"))
	kind = p_kind
	tier = p_tier
	room_id = String(point.get("room", ""))
	position = Vector3(float(point.get("x", 0)), float(point.get("base_y", 0.02)),
		float(point.get("y", 0)))
	var delta := room_center - Vector2(position.x, position.z)
	if delta.length_squared() < 0.01:
		delta = Vector2(0, 1)
	delta = delta.normalized()
	_face_dir = Vector3(delta.x, 0, delta.y)
	rotation.y = atan2(-_face_dir.x, -_face_dir.z)
	# 放在掩体顶面的设备缩到 72%，避免 2m 级设备顶到 3.2m 天花板。
	_scale = 0.72 if position.y > 0.4 else 1.0
	scale = Vector3.ONE * _scale
	_build_model()
	_add_faceplate()
	_build_ring()
	if position.y < 0.25:
		ArtStyle.attach_contact_shadow(self, Vector3(0.0, 0.004, 0.0), 0.78, 0.58)


func _model_id_for_device() -> String:
	if kind == "plate":
		var plate := MinigameData.plate_for_label(_ensure_mg_data(), task_label)
		var pid := String(plate.get("id", ""))
		match pid:
			"breaker", "panel-breaker":
				return "device_breaker"
			"tank-gauge", "pipe-port-ecosys":
				return "device_oxygen"
			"transformer":
				return "device_transformer"
			"surgery", "supply-med":
				return "device_medbay"
			_:
				return "device_panel_fix"
	return String(MODEL_BY_KIND.get(kind, "device_panel_fix"))


func _build_model() -> void:
	var model_id := _model_id_for_device()
	var path := "res://assets/models/%s.glb" % model_id
	if ResourceLoader.exists(path):
		var packed := load(path) as PackedScene
		if packed != null:
			var inst := packed.instantiate()
			add_child(inst)
			_from_glb = true
			_screen_height = float(SCREEN_HEIGHT.get(model_id, 0.9)) * _scale
			return
	_build_fallback()


## GLB 机身上没有放图的面，这里在正面贴一块面板图。
## 位置按实例化后的实际包围盒算（正面是 -Z），不能猜固定偏移 ——
## 猜的 -0.20 会让面板飘在机柜前面，看起来像贴了张照片。
## 保底渲染（_build_fallback）那支屏幕 quad 已经走 _screen_path()，会自动换图，不再叠第二块。
func _add_faceplate() -> void:
	if not _from_glb:
		return
	var tex_path := panel_texture(task_label)
	if tex_path == "":
		return
	var bounds := _model_bounds()
	if bounds.size.x < 0.05:
		return
	var w := clampf(bounds.size.x * 0.82, 0.24, 1.05)
	var h := clampf(bounds.size.y * 0.62, 0.24, 1.05)
	var mid := bounds.get_center()
	var fy := mid.y + bounds.size.y * 0.06

	# 深色金属边框
	var bezel := MeshInstance3D.new()
	var bmesh := BoxMesh.new()
	bmesh.size = Vector3(w + 0.05, h + 0.05, 0.014)
	bezel.mesh = bmesh
	bezel.position = Vector3(mid.x, fy, bounds.position.z - 0.006)
	var bmat := StandardMaterial3D.new()
	bmat.albedo_color = Color(0.14, 0.16, 0.20)
	bmat.metallic = 0.75
	bmat.roughness = 0.36
	bezel.material_override = bmat
	add_child(bezel)

	var plate := MeshInstance3D.new()
	var quad := QuadMesh.new()
	quad.size = Vector2(w, h)
	plate.mesh = quad
	# 贴在机身正面外 1.4 厘米，避免与边框及机身表面 z-fighting
	plate.position = Vector3(mid.x, fy, bounds.position.z - 0.014)
	plate.rotation.y = PI
	_screen_material = _screen_mat(tex_path)
	_screen_material.emission_energy_multiplier = 0.6
	plate.material_override = _screen_material
	add_child(plate)

	# 屏幕玻璃反光层
	var glass := MeshInstance3D.new()
	glass.mesh = quad
	glass.position = Vector3(mid.x, fy, bounds.position.z - 0.017)
	glass.rotation.y = PI
	glass.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var gmat := StandardMaterial3D.new()
	gmat.albedo_color = Color(0.85, 0.94, 1.0, 0.08)
	gmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	gmat.metallic = 0.15
	gmat.roughness = 0.08
	gmat.metallic_specular = 0.92
	glass.material_override = gmat
	add_child(glass)


## 交互距离：按**占地矩形的钳位距离**算，不是到节点中心的直线距离。
## 口径来自 2.5D —— 圆桌交互用的就是「到矩形的钳位距离」（main.gd 的圆桌自测写着领取点=圆桌下沿外 1.2）。
## 货架 1.4×6.9 这种长条设备，量到中心会让贴着货架站着的人按 E 毫无反应（实测 3 个任务点够不着）。
var _foot_half := Vector2.ZERO
var _foot_center := Vector3.ZERO
var _foot_ready := false


func reach_dist(p: Vector3) -> float:
	if not _foot_ready:
		var gb: AABB = global_transform * _model_bounds()
		if gb.size.x < 0.05 or gb.size.z < 0.05:
			# 包围盒还没刷新（同一帧内刚 add_child）：退回中心直线距离
			return Vector2(p.x - global_position.x, p.z - global_position.z).length()
		_foot_center = gb.get_center()
		_foot_half = Vector2(gb.size.x * 0.5, gb.size.z * 0.5)
		_foot_ready = true
	var dx := maxf(0.0, absf(p.x - _foot_center.x) - _foot_half.x)
	var dz := maxf(0.0, absf(p.z - _foot_center.z) - _foot_half.y)
	return Vector2(dx, dz).length()


## 合并所有子网格的包围盒，换算到本节点局部坐标。## 不用 global_transform：设备刚 add_child、同一帧内子节点全局变换还没刷新；
## 这里沿父链累乘局部 transform，纯本地数学，当帧就有效。
func _model_bounds() -> AABB:
	var merged := AABB()
	var first := true
	for mi in _collect_meshes(self):
		var rel := Transform3D()
		var n: Node = mi
		while n != null and n != self:
			rel = rel * n.transform
			n = n.get_parent()
		var ab: AABB = rel * mi.get_aabb()
		if first:
			merged = ab
			first = false
		else:
			merged = merged.merge(ab)
	return merged


func _collect_meshes(node: Node) -> Array:
	var out: Array = []
	for c in node.get_children():
		if c is MeshInstance3D and (c as MeshInstance3D).mesh != null:
			out.append(c)
		out.append_array(_collect_meshes(c))
	return out


## 供 scene_extras 登记：断电时设备屏幕要跟着暗，否则 27 块发光面板会把熄灯效果抵消掉。
func screen_material() -> StandardMaterial3D:
	return _screen_material


func _build_fallback() -> void:
	# 没有 GLB 时的保底：柜体 + 发光屏，保证交互点仍然成立。
	var body := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(1.2, 1.2, 0.26)
	body.mesh = box
	body.position = Vector3(0, 0.6, 0)
	body.material_override = _mat("res://assets/textures/panel-metal.png", Color(0.64, 0.7, 0.8))
	add_child(body)

	var screen := MeshInstance3D.new()
	var quad := QuadMesh.new()
	quad.size = Vector2(0.9, 0.7)
	screen.mesh = quad
	screen.position = Vector3(0, 0.72, -0.14)
	_screen_material = _screen_mat(_screen_path())
	screen.material_override = _screen_material
	add_child(screen)
	_screen_height = 0.72


func _build_ring() -> void:
	var ring := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.66
	torus.outer_radius = 0.71
	torus.rings = 40
	torus.ring_segments = 8
	ring.mesh = torus
	ring.position = Vector3(0, 0.014, 0)
	ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var col: Color = RING_COLOR.get(kind, Color("#F0C674"))
	var cfg := MinigameData.task_cfg(_ensure_mg_data(), task_label)
	if (kind == "plate" or cfg.has("color")) and String(cfg.get("color", "")) != "":
		col = Color(String(cfg.get("color", "")))
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(col.r, col.g, col.b, 0.45)
	mat.emission_enabled = true
	mat.emission = col
	mat.emission_energy_multiplier = 0.75
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ring.material_override = mat
	add_child(ring)


func _screen_path() -> String:
	## 优先用该任务自己的面板图（26 张分张），没有再退回按玩法的三张共用图
	var per_task := panel_texture(task_label)
	if per_task != "":
		return per_task
	if kind == "wire":
		return "res://assets/plates/panel-fix.png"
	if kind == "lever":
		return "res://assets/textures/panel-breaker.png"
	return "res://assets/textures/panel-task.png"


func _screen_mat(path: String) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	if ResourceLoader.exists(path):
		var tex := load(path) as Texture2D
		mat.albedo_texture = tex
		mat.emission_enabled = true
		mat.emission_texture = tex
		mat.emission_energy_multiplier = 0.45
	mat.roughness = 0.38
	mat.metallic = 0.15
	return mat


func _mat(path: String, tint: Color) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	if ResourceLoader.exists(path):
		mat.albedo_texture = load(path) as Texture2D
	mat.albedo_color = tint
	mat.roughness = 0.48
	mat.metallic = 0.42
	ArtStyle.apply_shared_pbr(mat, path, 0.70, true)
	return mat


func distance_to(pos: Vector3) -> float:
	return Vector2(global_position.x - pos.x, global_position.z - pos.z).length()


func face_dir() -> Vector3:
	return _face_dir


func focus_position() -> Vector3:
	return global_position + _face_dir * 1.25 + Vector3(0, _screen_height + 0.18, 0)


func focus_look_at() -> Vector3:
	return global_position + Vector3(0, _screen_height, 0)
