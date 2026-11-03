extends Node3D

## 把 2.5D 导出的 map.json 升维成可走场景。
## 复用边界：房间 poly / 走廊 pts / 墙体线段 / 掩体矩形 / 现有表面贴图。
## 不把 2.5D 的 DOM、迷雾、点击寻路带进来；碰撞与移动全部是 3D 的。

const MAP_PATH := "res://data/map.json"
const WALL_HEIGHT := 3.0
const CEILING_Y := 3.2
const UV_WORLD_SCALE := 4.0

const ROOM_TEXTURES := {
	"bridge": "floor-carpet",
	"cam": "floor-monitor",
	"ecosys": "floor-eco",
	"power": "floor-power",
	"transit": "cafeteria-floor",
	"fun": "floor-lounge",
	"engine": "floor-engine",
	"med": "floor-lab",
	"armory": "floor-hazard",
	"warehouse": "warehouse-floor",
}

const COVER_HEIGHT := {
	"table": 0.9, "desk": 0.85, "crate": 1.2, "rack": 2.1, "console": 1.1,
	"screen": 1.0, "bed": 0.65, "locker": 2.0, "fridge": 1.9, "sofa": 0.8,
	"bookshelf": 1.8, "barrel": 1.0, "cryopod": 2.2, "vending": 1.9,
	"terminal": 1.4, "plant": 0.8, "tallplant": 1.8, "bin": 0.6,
	"sink": 0.8, "cooler": 1.0, "lamp": 1.4, "chair": 0.8, "rug": 0.05,
}

var data: Dictionary = {}
var _materials: Dictionary = {}


func build() -> void:
	data = _load_map()
	if data.is_empty():
		push_error("map.json 加载失败")
		return
	_build_rooms()
	_build_corridors()
	_build_walls()
	_build_cover()
	_build_lights()
	_build_preview_actor()
	_build_environment()


func _load_map() -> Dictionary:
	var file := FileAccess.open(MAP_PATH, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		return parsed
	return {}


func _build_rooms() -> void:
	for room: Dictionary in data.get("rooms", []):
		var rid := String(room.get("id", ""))
		var poly: Array = room.get("poly", [])
		if poly.size() < 3:
			continue
		var tex := String(ROOM_TEXTURES.get(rid, "floor-steel"))
		var floor_mat := _material(tex, Color(0.88, 0.9, 0.94))
		var ceil_mat := _material("panel-metal", Color(0.5, 0.55, 0.62), true)
		ceil_mat.emission_enabled = true
		ceil_mat.emission = Color(0.1, 0.12, 0.16)
		ceil_mat.emission_energy_multiplier = 0.8
		_add_polygon_surface(poly, 0.02, Vector3.UP, floor_mat)
		_add_polygon_surface(poly, CEILING_Y, Vector3.DOWN, ceil_mat)


func _build_corridors() -> void:
	var width := float(data.get("scale", {}).get("corridor_w", 3.2))
	var floor_mat := _material("floor-grate", Color(0.75, 0.8, 0.86))
	var ceil_mat := _material("panel-metal", Color(0.28, 0.3, 0.35), true)
	for corridor: Dictionary in data.get("corridors", []):
		var pts: Array = corridor.get("pts", [])
		for i in range(pts.size() - 1):
			var a := Vector2(float(pts[i][0]), float(pts[i][1]))
			var b := Vector2(float(pts[i + 1][0]), float(pts[i + 1][1]))
			_add_corridor_quad(a, b, width, 0.02, Vector3.UP, floor_mat)
			_add_corridor_quad(a, b, width, CEILING_Y, Vector3.DOWN, ceil_mat)


func _build_walls() -> void:
	var wall_mat := _material("wall-panel", Color(0.62, 0.68, 0.76), true)
	for segment: Array in data.get("walls", []):
		if segment.size() < 2:
			continue
		var a := Vector2(float(segment[0][0]), float(segment[0][1]))
		var b := Vector2(float(segment[1][0]), float(segment[1][1]))
		var length := a.distance_to(b)
		if length < 0.15:
			continue
		var mid := (a + b) * 0.5
		var angle := -atan2(b.y - a.y, b.x - a.x)
		_add_box(
			Vector3(mid.x, WALL_HEIGHT * 0.5, mid.y),
			Vector3(length, WALL_HEIGHT, 0.22),
			angle, wall_mat, true
		)


func _build_cover() -> void:
	for item: Dictionary in data.get("cover", []):
		var kind := String(item.get("kind", ""))
		var w := float(item.get("w", 1.0))
		var h := float(item.get("h", 1.0))
		var height := float(COVER_HEIGHT.get(kind, 1.0))
		if w <= 0.05 or h <= 0.05:
			continue
		var tex := "panel-metal"
		if kind in ["crate", "rack", "locker", "fridge", "barrel"]:
			tex = "crate-steel"
		elif kind in ["table", "desk"]:
			tex = "table-composite"
		var mat := _material(tex, Color(0.72, 0.76, 0.82), true)
		var x := float(item.get("x", 0.0))
		var y := float(item.get("y", 0.0))
		if kind == "table" and absf(w - h) <= 0.6:
			_add_cylinder(
				Vector3(x + w * 0.5, height * 0.5, y + h * 0.5),
				w * 0.5, height, mat, true
			)
			continue
		_add_box(
			Vector3(x + w * 0.5, height * 0.5, y + h * 0.5),
			Vector3(w, max(height, 0.08), h),
			0.0, mat, height > 0.2
		)


func _build_lights() -> void:
	for room: Dictionary in data.get("rooms", []):
		var rect: Array = room.get("rect", [0, 0, 1, 1])
		var label: Array = room.get("label", [rect[0] + rect[2] * 0.5, rect[1] + rect[3] * 0.5])
		var light := OmniLight3D.new()
		var span: float = max(float(rect[2]), float(rect[3]))
		light.position = Vector3(float(label[0]), 2.6, float(label[1]))
		light.omni_range = clampf(span * 1.6, 9.0, 38.0)
		light.light_energy = 2.4 if String(room.get("light", "bright")) == "bright" else 1.15
		light.light_color = Color(1.0, 0.93, 0.82) if String(room.get("light", "bright")) == "bright" else Color(0.62, 0.76, 1.0)
		light.shadow_enabled = false
		add_child(light)


func _build_preview_actor() -> void:
	var atlas := AtlasTexture.new()
	atlas.atlas = load("res://assets/crew/crew-01.png")
	atlas.region = Rect2(0, 0, 96, 160)

	var sprite := Sprite3D.new()
	sprite.texture = atlas
	sprite.pixel_size = 0.012
	sprite.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	sprite.shaded = false
	sprite.double_sided = true
	sprite.position = Vector3(36.0, 0.96, 34.5)
	add_child(sprite)

	var label := Label3D.new()
	label.text = "02 银翼"
	label.font = _system_font()
	label.font_size = 48
	label.outline_size = 10
	label.outline_modulate = Color(0.0, 0.0, 0.0, 1.0)
	label.modulate = Color(1.0, 1.0, 1.0, 1.0)
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.position = Vector3(0.0, 1.5, 0.0)
	sprite.add_child(label)


func _build_environment() -> void:
	var we := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.012, 0.016, 0.026)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.42, 0.48, 0.6)
	env.ambient_light_energy = 0.55
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.15
	env.fog_enabled = true
	env.fog_light_color = Color(0.02, 0.03, 0.05)
	env.fog_density = 0.007
	we.environment = env
	add_child(we)

	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-55.0, -35.0, 0.0)
	fill.light_energy = 0.28
	fill.light_color = Color(0.55, 0.66, 0.85)
	fill.shadow_enabled = false
	add_child(fill)


func _add_polygon_surface(poly: Array, y: float, normal: Vector3, mat: Material) -> void:
	var points := PackedVector2Array()
	for point: Array in poly:
		points.append(Vector2(float(point[0]), float(point[1])))
	var indices := Geometry2D.triangulate_polygon(points)
	if indices.size() < 3:
		return
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for index: int in indices:
		var p := points[index]
		st.set_normal(normal)
		st.set_uv(Vector2(p.x / UV_WORLD_SCALE, p.y / UV_WORLD_SCALE))
		st.add_vertex(Vector3(p.x, y, p.y))
	var mesh := st.commit()
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	add_child(mi)


func _add_corridor_quad(a: Vector2, b: Vector2, width: float, y: float,
		normal: Vector3, mat: Material) -> void:
	var direction := (b - a).normalized()
	if direction.length_squared() < 0.0001:
		return
	var perp := Vector2(-direction.y, direction.x) * (width * 0.5)
	var corners := [a - perp, a + perp, b + perp, b - perp]
	var order := [0, 1, 2, 0, 2, 3]
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for index: int in order:
		var p: Vector2 = corners[index]
		st.set_normal(normal)
		st.set_uv(Vector2(p.x / UV_WORLD_SCALE, p.y / UV_WORLD_SCALE))
		st.add_vertex(Vector3(p.x, y, p.y))
	var mesh := st.commit()
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	add_child(mi)


func _add_cylinder(center: Vector3, radius: float, height: float,
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
	add_child(mi)

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
	add_child(body)


func _add_box(center: Vector3, size: Vector3, rotation_y: float,
		mat: Material, collide: bool) -> void:
	var box := BoxMesh.new()
	box.size = size
	var mi := MeshInstance3D.new()
	mi.mesh = box
	mi.material_override = mat
	mi.position = center
	mi.rotation.y = rotation_y
	add_child(mi)

	if not collide:
		return
	var body := StaticBody3D.new()
	body.position = center
	body.rotation.y = rotation_y
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collision.shape = shape
	body.add_child(collision)
	add_child(body)


func _material(texture_name: String, tint: Color, triplanar: bool = false) -> StandardMaterial3D:
	var key := "%s|%s|%s" % [texture_name, tint.to_html(), str(triplanar)]
	if _materials.has(key):
		return _materials[key]
	var mat := StandardMaterial3D.new()
	if texture_name != "":
		var path := "res://assets/textures/%s.png" % texture_name
		if ResourceLoader.exists(path):
			mat.albedo_texture = load(path)
	mat.albedo_color = tint
	mat.roughness = 0.9
	mat.metallic = 0.08
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.uv1_triplanar = triplanar
	if triplanar:
		mat.uv1_scale = Vector3(0.35, 0.35, 0.35)
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	_materials[key] = mat
	return mat


func _system_font() -> SystemFont:
	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])
	return font
