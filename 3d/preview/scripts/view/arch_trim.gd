extends RefCounted
## 纯视觉建筑层次组件：批量生成分舱踢脚线、结构肋柱与墙地接缝 AO 边条。
## 零碰撞、不修改导航与门洞几何，按 clean / tech / industrial 三档材质分批绘制。

const ArtStyle := preload("res://scripts/art_style.gd")
const WALL_H := 3.0
const BASEBOARD_H := 0.14
const BASEBOARD_THICK := 0.26
const PILASTER_W := 0.16
const PILASTER_THICK := 0.30
const PILASTER_STEP := 3.4
const AO_EXTENT := 0.24
const WALL_HALF_T := 0.11
const TRIM_UV_SCALE := 0.5

## 分舱材质归类：医疗/舰桥/中转走浅银灰拉丝铝，娱乐/监控/生态走深科技灰蓝，其余工业区与走廊走深涂漆钢。
const ROOM_TIER := {
	"med": "clean",
	"bridge": "clean",
	"transit": "clean",
	"fun": "tech",
	"cam": "tech",
	"ecosys": "tech",
	"engine": "industrial",
	"power": "industrial",
	"armory": "industrial",
	"warehouse": "industrial",
	"corridor": "industrial",
}

const TIER_SPEC := {
	"clean": {
		"base": Color(0.46, 0.50, 0.55),
		"pil": Color(0.58, 0.62, 0.68),
		"metallic": 0.35,
		"roughness": 0.58,
	},
	"tech": {
		"base": Color(0.20, 0.24, 0.30),
		"pil": Color(0.27, 0.32, 0.40),
		"metallic": 0.40,
		"roughness": 0.55,
	},
	"industrial": {
		"base": Color(0.17, 0.20, 0.24),
		"pil": Color(0.23, 0.27, 0.32),
		"metallic": 0.45,
		"roughness": 0.62,
	},
}


static func build(host: Node3D, data: Dictionary) -> void:
	if host == null or data.is_empty():
		return
	var root := Node3D.new()
	root.name = "ArchTrim"
	host.add_child(root)

	var room_polys := _build_room_polys(data)
	var st_bases := {}
	var st_pils := {}
	for tier: String in TIER_SPEC.keys():
		var sb := SurfaceTool.new()
		sb.begin(Mesh.PRIMITIVE_TRIANGLES)
		st_bases[tier] = sb
		var sp := SurfaceTool.new()
		sp.begin(Mesh.PRIMITIVE_TRIANGLES)
		st_pils[tier] = sp
	var st_ao := SurfaceTool.new()
	st_ao.begin(Mesh.PRIMITIVE_TRIANGLES)

	for segment: Array in data.get("walls", []):
		if segment.size() < 2:
			continue
		var a := Vector2(float(segment[0][0]), float(segment[0][1]))
		var b := Vector2(float(segment[1][0]), float(segment[1][1]))
		var length := a.distance_to(b)
		if length < 0.25:
			continue
		var dir := (b - a) / length
		var perp := Vector2(-dir.y, dir.x)
		var mid := (a + b) * 0.5
		var tier := _wall_tier(mid, perp, room_polys)
		var st_base := st_bases[tier] as SurfaceTool
		var st_pil := st_pils[tier] as SurfaceTool
		_append_box(st_base, Vector3(mid.x, 0.02 + BASEBOARD_H * 0.5, mid.y), dir, perp, length, BASEBOARD_H, BASEBOARD_THICK)
		_append_ao_strip(st_ao, a, b, perp)
		if length >= 2.0:
			var count := int(floor((length - 0.8) / PILASTER_STEP))
			for i in count:
				var d := 0.55 + (float(i) + 0.5) * (length - 1.1) / float(maxi(1, count))
				var p := a + dir * d
				_append_box(st_pil, Vector3(p.x, 0.02 + (WALL_H - 0.04) * 0.5, p.y), dir, perp, PILASTER_W, WALL_H - 0.04, PILASTER_THICK)

	for tier: String in TIER_SPEC.keys():
		var spec: Dictionary = TIER_SPEC[tier]
		var met := float(spec["metallic"])
		var rough := float(spec["roughness"])
		_commit_mesh(root, st_bases[tier] as SurfaceTool, _metal_mat(spec["base"] as Color, met, rough), true)
		_commit_mesh(root, st_pils[tier] as SurfaceTool, _metal_mat(spec["pil"] as Color, met, rough), true)
	_commit_mesh(root, st_ao, _ao_mat(), false)


static func _build_room_polys(data: Dictionary) -> Array:
	var out: Array = []
	for room: Dictionary in data.get("rooms", []):
		var poly_arr := PackedVector2Array()
		for p: Array in room.get("poly", []):
			poly_arr.append(Vector2(float(p[0]), float(p[1])))
		if poly_arr.size() < 3:
			continue
		var rid := String(room.get("id", ""))
		out.append({
			"tier": String(ROOM_TIER.get(rid, "industrial")),
			"poly": poly_arr,
		})
	return out


## 沿墙段法线两侧各探测 0.5m，匹配所属舱室的气质档位；未命中则归入走廊工业档。
static func _wall_tier(mid: Vector2, perp: Vector2, room_polys: Array) -> String:
	var p_pos := mid + perp * 0.5
	var p_neg := mid - perp * 0.5
	for entry: Dictionary in room_polys:
		var poly := entry["poly"] as PackedVector2Array
		if Geometry2D.is_point_in_polygon(p_pos, poly) or Geometry2D.is_point_in_polygon(p_neg, poly):
			return String(entry["tier"])
	return "industrial"


static func _commit_mesh(root: Node3D, st: SurfaceTool, mat: Material, cast_shadow: bool) -> void:
	var mesh := st.commit()
	if mesh == null or mesh.get_surface_count() == 0:
		return
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	if not cast_shadow:
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(mi)


static func _metal_mat(col: Color, metallic: float, roughness: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = col
	m.metallic = metallic
	m.roughness = roughness
	ArtStyle.apply_shared_pbr(m, "res://assets/textures/panel-metal.png", 0.55, false)
	return m


static func _ao_mat() -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(1.0, 1.0, 1.0, 1.0)
	m.vertex_color_use_as_albedo = true
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	return m


static func _append_box(st: SurfaceTool, center: Vector3, dir: Vector2, perp: Vector2, len_x: float, h_y: float, thick_z: float) -> void:
	var hx := dir * (len_x * 0.5)
	var hz := perp * (thick_z * 0.5)
	var y0 := center.y - h_y * 0.5
	var y1 := center.y + h_y * 0.5
	var p00 := Vector3(center.x - hx.x - hz.x, y0, center.z - hx.y - hz.y)
	var p10 := Vector3(center.x + hx.x - hz.x, y0, center.z + hx.y - hz.y)
	var p11 := Vector3(center.x + hx.x + hz.x, y0, center.z + hx.y + hz.y)
	var p01 := Vector3(center.x - hx.x + hz.x, y0, center.z - hx.y + hz.y)
	var q00 := Vector3(p00.x, y1, p00.z)
	var q10 := Vector3(p10.x, y1, p10.z)
	var q11 := Vector3(p11.x, y1, p11.z)
	var q01 := Vector3(p01.x, y1, p01.z)
	_quad(st, p00, p10, q10, q00, Vector3(-perp.x, 0.0, -perp.y), len_x, h_y)
	_quad(st, p11, p01, q01, q11, Vector3(perp.x, 0.0, perp.y), len_x, h_y)
	_quad(st, p01, p00, q00, q01, Vector3(-dir.x, 0.0, -dir.y), thick_z, h_y)
	_quad(st, p10, p11, q11, q10, Vector3(dir.x, 0.0, dir.y), thick_z, h_y)
	_quad(st, q00, q10, q11, q01, Vector3.UP, len_x, thick_z)


static func _quad(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, d: Vector3, n: Vector3, u_len: float, v_len: float) -> void:
	var verts := [a, b, c, a, c, d]
	# 按 0.5 倍率缩放 UV，避免踢脚线只采到 panel-metal-normal 顶部极窄的畸变条带
	var u := u_len * TRIM_UV_SCALE
	var v := v_len * TRIM_UV_SCALE
	var uvs := [Vector2(0, 0), Vector2(u, 0), Vector2(u, v), Vector2(0, 0), Vector2(u, v), Vector2(0, v)]
	for i in 6:
		st.set_normal(n)
		st.set_uv(uvs[i])
		st.add_vertex(verts[i])


static func _append_ao_strip(st: SurfaceTool, a: Vector2, b: Vector2, perp: Vector2) -> void:
	var y := 0.023
	var c_in := Color(0.01, 0.015, 0.025, 0.48)
	var c_out := Color(0.01, 0.015, 0.025, 0.0)
	for side: float in [-1.0, 1.0]:
		var n_in: Vector2 = perp * (side * WALL_HALF_T)
		var n_out: Vector2 = perp * (side * (WALL_HALF_T + AO_EXTENT))
		var v0 := Vector3(a.x + n_in.x, y, a.y + n_in.y)
		var v1 := Vector3(b.x + n_in.x, y, b.y + n_in.y)
		var v2 := Vector3(b.x + n_out.x, y, b.y + n_out.y)
		var v3 := Vector3(a.x + n_out.x, y, a.y + n_out.y)
		var verts := [v0, v1, v2, v0, v2, v3] if side > 0.0 else [v0, v2, v1, v0, v3, v2]
		var cols := [c_in, c_in, c_out, c_in, c_out, c_out] if side > 0.0 else [c_in, c_out, c_in, c_in, c_out, c_out]
		for i in 6:
			st.set_normal(Vector3.UP)
			st.set_color(cols[i])
			st.add_vertex(verts[i])
