extends Node3D
## 世界空间 3D 战斗与环境特效：3D 刀光弧、定向血雾血滴、湿润血泊贴花、
## 弹道光束与命中瞬光、机器人电弧火花与黑烟、医疗/追捕/拖尸连续状态连线。

var _fx_items: Array = []
var _pools: Array = []

var _heal_beam: MeshInstance3D
var _heal_ring: MeshInstance3D
var _chase_beam: MeshInstance3D
var _chase_ring: MeshInstance3D
var _drag_beams: Array = []


func _ready() -> void:
	_build_status_beams()


func _build_status_beams() -> void:
	_heal_beam = _make_beam_mesh(Color(0.25, 0.96, 0.62, 0.85), 0.022)
	_heal_ring = _make_ground_ring(Color(0.25, 0.96, 0.62, 0.85), 0.52, 0.58)
	_chase_beam = _make_beam_mesh(Color(1.0, 0.24, 0.20, 0.88), 0.020)
	_chase_ring = _make_ground_ring(Color(1.0, 0.24, 0.20, 0.82), 0.54, 0.62)


func _make_beam_mesh(col: Color, radius: float) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = radius
	cyl.bottom_radius = radius
	cyl.height = 1.0
	cyl.radial_segments = 8
	mi.mesh = cyl
	mi.visible = false
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.material_override = _unshaded_mat(col, true)
	add_child(mi)
	return mi


func _make_ground_ring(col: Color, r_in: float, r_out: float) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = r_in
	torus.outer_radius = r_out
	torus.rings = 24
	torus.ring_segments = 6
	mi.mesh = torus
	mi.visible = false
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.material_override = _unshaded_mat(col, true)
	add_child(mi)
	return mi


func _unshaded_mat(col: Color, additive: bool = false) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = col
	mat.emission_enabled = true
	mat.emission = Color(col.r, col.g, col.b)
	mat.emission_energy_multiplier = 2.4
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	if additive:
		mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	return mat


func spawn_slash_arc(from_pos: Vector3, to_pos: Vector3) -> void:
	var diff := to_pos - from_pos
	var mid := from_pos.lerp(to_pos, 0.58)
	mid.y = maxf(mid.y, 1.05)
	var mi := MeshInstance3D.new()
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var mesh := ArrayMesh.new()
	var verts := PackedVector3Array()
	var indices := PackedInt32Array()
	var segs := 12
	for i in range(segs + 1):
		var u := float(i) / float(segs)
		var ang := lerpf(-1.25, 1.25, u)
		var w := sin(u * PI) * 0.16
		var r0 := 0.55 - w * 0.3
		var r1 := 0.55 + w
		verts.append(Vector3(sin(ang) * r0, 0.0, cos(ang) * r0 * 0.65))
		verts.append(Vector3(sin(ang) * r1, 0.0, cos(ang) * r1 * 0.65))
		if i < segs:
			var b := i * 2
			indices.append_array([b, b + 1, b + 2, b + 1, b + 3, b + 2])
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_INDEX] = indices
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	mi.mesh = mesh
	var mat := _unshaded_mat(Color(1.0, 0.34, 0.28, 0.9), true)
	mi.material_override = mat
	add_child(mi)
	mi.global_position = mid
	if Vector2(diff.x, diff.z).length_squared() > 0.001:
		mi.look_at(mid + Vector3(diff.x, 0.0, diff.z), Vector3.UP)
	mi.rotate_z(randf_range(-0.48, -0.22))
	_fx_items.append({"node": mi, "mat": mat, "t": 0.0, "dur": 0.24, "kind": "scale_fade"})


func spawn_blood(pos: Vector3, dir: Vector3 = Vector3.UP) -> void:
	var spray := dir.normalized() if dir.length_squared() > 0.001 else Vector3.UP
	var drop := CPUParticles3D.new()
	drop.amount = 20
	drop.lifetime = 0.55
	drop.one_shot = true
	drop.explosiveness = 0.94
	drop.direction = (spray * 0.85 + Vector3(0.0, 0.42, 0.0)).normalized()
	drop.spread = 38.0
	drop.initial_velocity_min = 1.8
	drop.initial_velocity_max = 4.4
	drop.gravity = Vector3(0.0, -8.5, 0.0)
	drop.scale_amount_min = 0.6
	drop.scale_amount_max = 1.5
	var sm := SphereMesh.new()
	sm.radius = 0.022
	sm.height = 0.044
	sm.radial_segments = 4
	sm.rings = 2
	var dmat := StandardMaterial3D.new()
	dmat.albedo_color = Color(0.58, 0.035, 0.035)
	dmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sm.material = dmat
	drop.mesh = sm
	add_child(drop)
	drop.global_position = pos
	drop.emitting = true
	_fx_items.append({"node": drop, "mat": null, "t": 0.0, "dur": 0.9, "kind": "particle"})

	# 扩散血雾
	var mist := CPUParticles3D.new()
	mist.amount = 8
	mist.lifetime = 0.42
	mist.one_shot = true
	mist.explosiveness = 0.9
	mist.direction = spray
	mist.spread = 52.0
	mist.initial_velocity_min = 0.6
	mist.initial_velocity_max = 1.6
	mist.gravity = Vector3(0.0, -0.4, 0.0)
	var mm := SphereMesh.new()
	mm.radius = 0.09
	mm.height = 0.18
	mm.radial_segments = 6
	mm.rings = 3
	var mmat := StandardMaterial3D.new()
	mmat.albedo_color = Color(0.45, 0.03, 0.03, 0.36)
	mmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mm.material = mmat
	mist.mesh = mm
	add_child(mist)
	mist.global_position = pos
	mist.emitting = true
	_fx_items.append({"node": mist, "mat": null, "t": 0.0, "dur": 0.75, "kind": "particle"})


func spawn_blood_pool(pos: Vector3) -> void:
	if _pools.size() >= 28:
		var old: Variant = _pools.pop_front()
		if old != null and is_instance_valid(old):
			(old as Node).queue_free()
	var root := Node3D.new()
	root.position = Vector3(pos.x, 0.015, pos.z)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.24, 0.012, 0.014, 0.90)
	mat.metallic = 0.14
	mat.roughness = 0.12
	mat.metallic_specular = 0.88
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	var lobes := [
		{"r": 0.42, "off": Vector3.ZERO},
		{"r": 0.26, "off": Vector3(0.24, 0.001, 0.14)},
		{"r": 0.22, "off": Vector3(-0.20, 0.001, -0.18)},
	]
	for lb: Dictionary in lobes:
		var mi := MeshInstance3D.new()
		var cm := CylinderMesh.new()
		cm.top_radius = float(lb["r"])
		cm.bottom_radius = float(lb["r"]) * 1.06
		cm.height = 0.004
		cm.radial_segments = 14
		mi.mesh = cm
		mi.position = lb["off"] as Vector3
		mi.material_override = mat
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		root.add_child(mi)
	add_child(root)
	_pools.append(root)


func clear_pools() -> void:
	for p: Variant in _pools:
		if p != null and is_instance_valid(p):
			(p as Node).queue_free()
	_pools.clear()


func spawn_tracer(from_pos: Vector3, to_pos: Vector3, is_mech: bool = false) -> void:
	var beam := _make_beam_mesh(Color(1.0, 0.88, 0.46, 0.95), 0.014)
	beam.visible = true
	_place_beam(beam, from_pos, to_pos)
	var bmat := beam.material_override as StandardMaterial3D
	_fx_items.append({"node": beam, "mat": bmat, "t": 0.0, "dur": 0.14, "kind": "fade"})

	# 命中瞬光 + 冲击环
	var light := OmniLight3D.new()
	light.light_color = Color(0.55, 0.88, 1.0) if is_mech else Color(1.0, 0.78, 0.36)
	light.light_energy = 3.2
	light.omni_range = 3.2
	light.position = to_pos
	add_child(light)
	_fx_items.append({"node": light, "mat": null, "t": 0.0, "dur": 0.07, "kind": "light"})

	var ring := _make_ground_ring(Color(1.0, 0.82, 0.42, 0.88), 0.14, 0.18)
	ring.visible = true
	ring.position = to_pos
	ring.rotation.x = PI * 0.5
	var rmat := ring.material_override as StandardMaterial3D
	_fx_items.append({"node": ring, "mat": rmat, "t": 0.0, "dur": 0.18, "kind": "scale_fade"})


func spawn_mech_sparks(pos: Vector3, intense: bool = false) -> void:
	var sparks := CPUParticles3D.new()
	sparks.amount = 22 if intense else 12
	sparks.lifetime = 0.38
	sparks.one_shot = true
	sparks.explosiveness = 0.96
	sparks.direction = Vector3(0.0, 0.65, 0.0)
	sparks.spread = 80.0
	sparks.initial_velocity_min = 2.4
	sparks.initial_velocity_max = 5.2
	sparks.gravity = Vector3(0.0, -9.0, 0.0)
	var sm := BoxMesh.new()
	sm.size = Vector3(0.026, 0.026, 0.06)
	var smat := _unshaded_mat(Color(0.62, 0.90, 1.0, 0.95), true)
	sm.material = smat
	sparks.mesh = sm
	add_child(sparks)
	sparks.global_position = pos
	sparks.emitting = true
	_fx_items.append({"node": sparks, "mat": null, "t": 0.0, "dur": 0.7, "kind": "particle"})

	if intense:
		var smoke := CPUParticles3D.new()
		smoke.amount = 10
		smoke.lifetime = 0.85
		smoke.one_shot = true
		smoke.explosiveness = 0.7
		smoke.direction = Vector3(0.0, 1.0, 0.0)
		smoke.spread = 35.0
		smoke.initial_velocity_min = 0.5
		smoke.initial_velocity_max = 1.4
		smoke.gravity = Vector3(0.0, 0.4, 0.0)
		var km := SphereMesh.new()
		km.radius = 0.12
		km.height = 0.24
		km.radial_segments = 6
		km.rings = 3
		var kmat := StandardMaterial3D.new()
		kmat.albedo_color = Color(0.14, 0.16, 0.20, 0.45)
		kmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		km.material = kmat
		smoke.mesh = km
		add_child(smoke)
		smoke.global_position = pos
		smoke.emitting = true
		_fx_items.append({"node": smoke, "mat": null, "t": 0.0, "dur": 1.1, "kind": "particle"})

		var ring := _make_ground_ring(Color(0.50, 0.88, 1.0, 0.85), 0.25, 0.32)
		ring.visible = true
		ring.position = pos
		var rmat := ring.material_override as StandardMaterial3D
		_fx_items.append({"node": ring, "mat": rmat, "t": 0.0, "dur": 0.24, "kind": "scale_fade"})


func tick(delta: float) -> void:
	for idx in range(_fx_items.size() - 1, -1, -1):
		var item: Dictionary = _fx_items[idx]
		var t := float(item["t"]) + delta
		item["t"] = t
		var dur := maxf(0.01, float(item["dur"]))
		var node: Variant = item.get("node", null)
		if node == null or not is_instance_valid(node) or t >= dur:
			if node != null and is_instance_valid(node):
				(node as Node).queue_free()
			_fx_items.remove_at(idx)
			continue
		var u := clampf(t / dur, 0.0, 1.0)
		var kind := String(item["kind"])
		var mat: Variant = item.get("mat", null)
		if kind == "scale_fade":
			(node as Node3D).scale = Vector3.ONE * lerpf(0.85, 1.85, u)
			if mat is StandardMaterial3D:
				(mat as StandardMaterial3D).albedo_color.a = (1.0 - u) * 0.90
		elif kind == "fade":
			if mat is StandardMaterial3D:
				(mat as StandardMaterial3D).albedo_color.a = (1.0 - u) * 0.95
		elif kind == "light":
			(node as OmniLight3D).light_energy = 3.2 * (1.0 - u)


func sync_beams(sim, _extras, delta: float) -> void:
	if sim == null or not sim.meeting.is_empty():
		_hide_all_beams()
		return
	_sync_med_beam(sim, delta)
	_sync_sec_beam(sim, delta)
	_sync_drag_beams(sim)


func _hide_all_beams() -> void:
	if _heal_beam != null:
		_heal_beam.visible = false
	if _heal_ring != null:
		_heal_ring.visible = false
	if _chase_beam != null:
		_chase_beam.visible = false
	if _chase_ring != null:
		_chase_ring.visible = false
	for b: Variant in _drag_beams:
		if b is MeshInstance3D:
			(b as MeshInstance3D).visible = false


func _sync_med_beam(sim, delta: float) -> void:
	if sim.bots == null or _heal_beam == null or _heal_ring == null:
		return
	var mt := int(sim.bots.med_target)
	var healing: bool = mt >= 0 and not sim.bots.is_dead("medbot") and float(sim.bots.med_t) > 0.01
	_heal_beam.visible = healing
	_heal_ring.visible = healing
	if not healing:
		return
	var tgt: Dictionary = sim.agent(mt)
	if tgt.is_empty():
		_heal_beam.visible = false
		_heal_ring.visible = false
		return
	var mp: Vector2 = sim.bots.med_pos
	var tp: Vector2 = tgt.get("pos", Vector2.ZERO)
	_place_beam(_heal_beam, Vector3(mp.x, 1.25, mp.y), Vector3(tp.x, 0.25, tp.y))
	_heal_ring.position = Vector3(tp.x, 0.03, tp.y)
	_heal_ring.rotate_y(delta * 2.4)
	var p := clampf(float(sim.bots.med_t) / maxf(0.1, float(sim.bots.MED_HEAL_TIME)), 0.0, 1.0)
	_heal_ring.scale = Vector3.ONE * lerpf(1.25, 0.65, p)


func _sync_sec_beam(sim, delta: float) -> void:
	if sim.bots == null or _chase_beam == null or _chase_ring == null:
		return
	var cs: Dictionary = sim.bots.catch_state
	var phase := String(cs.get("phase", ""))
	var chasing: bool = not cs.is_empty() and (phase == "chase" or phase == "press") and not sim.bots.is_dead("secbot")
	_chase_beam.visible = chasing
	_chase_ring.visible = chasing
	if not chasing:
		return
	var tgt: Dictionary = sim.agent(int(cs.get("i", -1)))
	if tgt.is_empty():
		_chase_beam.visible = false
		_chase_ring.visible = false
		return
	var sp: Vector2 = sim.bots.sec_pos
	var tp: Vector2 = tgt.get("pos", Vector2.ZERO)
	_place_beam(_chase_beam, Vector3(sp.x, 1.15, sp.y), Vector3(tp.x, 1.05, tp.y))
	_chase_ring.position = Vector3(tp.x, 0.03, tp.y)
	_chase_ring.rotate_y(-delta * 4.0)


func _sync_drag_beams(sim) -> void:
	var active := 0
	for a: Dictionary in sim.agents:
		var di := int(a.get("drag", -1))
		if di < 0 or not bool(a.get("alive", false)):
			continue
		var vic: Dictionary = sim.agent(di)
		if vic.is_empty() or bool(vic.get("bodyGone", false)):
			continue
		while _drag_beams.size() <= active:
			_drag_beams.append(_make_beam_mesh(Color(0.84, 0.72, 1.0, 0.65), 0.014))
		var beam := _drag_beams[active] as MeshInstance3D
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		var vp: Vector2 = vic.get("pos", Vector2.ZERO) if bool(vic.get("alive", false)) else vic.get("bodyPos", Vector2.ZERO)
		beam.visible = true
		_place_beam(beam, Vector3(ap.x, 0.88, ap.y), Vector3(vp.x, 0.22, vp.y))
		active += 1
	for j in range(active, _drag_beams.size()):
		(_drag_beams[j] as MeshInstance3D).visible = false


func _place_beam(beam: MeshInstance3D, a: Vector3, b: Vector3) -> void:
	var diff := b - a
	var len_v := diff.length()
	if len_v < 0.005:
		beam.visible = false
		return
	beam.position = (a + b) * 0.5
	beam.scale = Vector3(1.0, len_v, 1.0)
	var up := diff / len_v
	var ref := Vector3.FORWARD if absf(up.y) > 0.92 else Vector3.UP
	var right := up.cross(ref).normalized()
	var fwd := right.cross(up).normalized()
	beam.basis = Basis(right, up, fwd)
