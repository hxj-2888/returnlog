extends Node3D
## 角色与机器人躯体战斗态表现层（只读 sim 与 crew_view/extras，绝不修改 crew_view.gd）：
## 1) 补全 3D 刀者红身（redT > 0）脉动红光与脚底红圈；
## 2) 受击闪白（Hit Flash 0.10s）与击退微冲量（0.25m 阻尼回弹）；
## 3) 机器人受击闪白、战损微火花与停摆下沉/熄灯态。

var _hit_flash: Dictionary = {}
var _knock: Dictionary = {}
var _red_rings: Dictionary = {}
var _overlay_mats: Dictionary = {}
var _bot_flash: Dictionary = {}
var _bot_downed: Dictionary = {}
var _spark_cd := 0.8


func on_hit(agent_i: int, dir: Vector3) -> void:
	if agent_i < 0:
		return
	_hit_flash[agent_i] = 0.10
	var flat := Vector3(dir.x, 0.0, dir.z)
	if flat.length_squared() < 0.001:
		flat = Vector3(0.0, 0.0, -1.0)
	_knock[agent_i] = {"vec": flat.normalized() * 0.25, "t": 0.22}


func on_bot_hit(kind: String) -> void:
	_bot_flash[kind] = 0.12


func sync(sim, crew_view, extras, delta: float, combat_fx_3d = null) -> void:
	if sim == null:
		return
	_sync_crews(sim, crew_view, delta)
	_sync_bots(sim, extras, delta, combat_fx_3d)


func _sync_crews(sim, crew_view, delta: float) -> void:
	if crew_view == null:
		return
	var models: Dictionary = crew_view.get("_models") if crew_view.get("_models") is Dictionary else {}
	var sprites: Dictionary = crew_view.get("_sprites") if crew_view.get("_sprites") is Dictionary else {}

	for a: Dictionary in sim.agents:
		var i := int(a.get("i", -1))
		if i < 0:
			continue
		var red_t := float(a.get("redT", 0.0))
		var flash_t := float(_hit_flash.get(i, 0.0))
		if flash_t > 0.0:
			flash_t = maxf(0.0, flash_t - delta)
			_hit_flash[i] = flash_t

		if models.has(i):
			var m: Variant = models[i]
			if m is Node3D and is_instance_valid(m):
				var mn := m as Node3D
				_apply_model_overlay(i, mn, flash_t, red_t)
				_apply_red_ring(i, mn, red_t)
				_apply_knockback(i, mn, delta)
		elif sprites.has(i):
			var sp: Variant = sprites[i]
			if sp is Sprite3D and is_instance_valid(sp):
				var s := sp as Sprite3D
				if flash_t > 0.0:
					s.modulate = Color(2.2, 2.2, 2.2, 1.0)
				elif red_t > 0.0:
					var p := 0.65 + 0.35 * sin(Time.get_ticks_msec() * 0.018)
					s.modulate = Color(1.0 + 0.5 * p, 0.35, 0.35, 1.0)


func _apply_model_overlay(i: int, root: Node3D, flash_t: float, red_t: float) -> void:
	var active := flash_t > 0.0 or red_t > 0.0
	var mat: StandardMaterial3D = null
	if active:
		mat = _get_overlay_mat(i)
		if flash_t > 0.0:
			var fk := clampf(flash_t / 0.10, 0.0, 1.0)
			mat.albedo_color = Color(1.0, 1.0, 1.0, 0.78 * fk)
			mat.emission = Color(1.0, 1.0, 1.0)
			mat.emission_energy_multiplier = 2.6 * fk
		else:
			var rk := clampf(red_t / 1.5, 0.0, 1.0)
			var pulse := 0.55 + 0.45 * sin(Time.get_ticks_msec() * 0.018)
			mat.albedo_color = Color(1.0, 0.12, 0.10, (0.28 + 0.28 * pulse) * rk)
			mat.emission = Color(1.0, 0.14, 0.10)
			mat.emission_energy_multiplier = (1.6 + 1.4 * pulse) * rk

	var stack: Array = [root]
	while not stack.is_empty():
		var n: Variant = stack.pop_back()
		if n is MeshInstance3D:
			var mi := n as MeshInstance3D
			if not mi.has_meta("combat_ring"):
				mi.material_overlay = mat if active else null
		if n is Node:
			for c in (n as Node).get_children():
				stack.append(c)


func _get_overlay_mat(i: int) -> StandardMaterial3D:
	if _overlay_mats.has(i):
		return _overlay_mats[i] as StandardMaterial3D
	var mat := StandardMaterial3D.new()
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.emission_enabled = true
	_overlay_mats[i] = mat
	return mat


func _apply_red_ring(i: int, root: Node3D, red_t: float) -> void:
	var show := red_t > 0.0 and root.visible
	if not show:
		if _red_rings.has(i):
			var r_old: Variant = _red_rings[i]
			if r_old is MeshInstance3D and is_instance_valid(r_old):
				(r_old as MeshInstance3D).visible = false
		return
	var ring: MeshInstance3D = null
	if _red_rings.has(i) and is_instance_valid(_red_rings[i]):
		ring = _red_rings[i] as MeshInstance3D
	else:
		ring = MeshInstance3D.new()
		ring.set_meta("combat_ring", true)
		var torus := TorusMesh.new()
		torus.inner_radius = 0.42
		torus.outer_radius = 0.50
		torus.rings = 24
		torus.ring_segments = 6
		ring.mesh = torus
		ring.position = Vector3(0.0, 0.03, 0.0)
		ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var rmat := StandardMaterial3D.new()
		rmat.albedo_color = Color(1.0, 0.16, 0.12, 0.85)
		rmat.emission_enabled = true
		rmat.emission = Color(1.0, 0.16, 0.12)
		rmat.emission_energy_multiplier = 2.8
		rmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		rmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		ring.material_override = rmat
		root.add_child(ring)
		_red_rings[i] = ring
	ring.visible = true
	var rk := clampf(red_t / 1.5, 0.0, 1.0)
	var pulse := 0.90 + 0.14 * sin(Time.get_ticks_msec() * 0.020)
	ring.scale = Vector3.ONE * pulse
	var mat := ring.material_override as StandardMaterial3D
	if mat != null:
		mat.albedo_color.a = 0.85 * rk


func _apply_knockback(i: int, root: Node3D, delta: float) -> void:
	if not _knock.has(i):
		return
	var kd: Dictionary = _knock[i]
	var t := float(kd["t"]) - delta
	var off := Vector3.ZERO
	if t <= 0.0:
		_knock.erase(i)
	else:
		kd["t"] = t
		var k := ease(clampf(t / 0.22, 0.0, 1.0), 0.4)
		off = (kd["vec"] as Vector3) * k
	# 偏移挂载于模型根节点下的几何子节点，避免被 crew_view 的位置插值覆盖
	for c in root.get_children():
		if c is Node3D and not (c is Label3D) and not c.has_meta("combat_ring"):
			var cn := c as Node3D
			cn.position = Vector3(off.x, 0.0, off.z)
			break


func _sync_bots(sim, extras, delta: float, combat_fx_3d) -> void:
	if extras == null or sim.bots == null:
		return
	var bot_nodes: Dictionary = extras.get("bot_nodes") if extras.get("bot_nodes") is Dictionary else {}
	_spark_cd -= delta
	var emit_damaged := _spark_cd <= 0.0
	if emit_damaged:
		_spark_cd = randf_range(1.1, 1.9)

	for kind: String in ["secbot", "medbot"]:
		var bnode: Variant = bot_nodes.get(kind, null)
		if not (bnode is Node3D) or not is_instance_valid(bnode):
			continue
		var root := bnode as Node3D
		var flash_t := float(_bot_flash.get(kind, 0.0))
		if flash_t > 0.0:
			flash_t = maxf(0.0, flash_t - delta)
			_bot_flash[kind] = flash_t
		_apply_bot_flash(kind, root, flash_t)

		var dead: bool = sim.bots.is_dead(kind) or int(sim.bot_hp.get(kind, 0)) <= 0
		var hp := int(sim.bot_hp.get(kind, 0))
		if not dead and hp == 1 and kind == "secbot" and emit_damaged and combat_fx_3d != null:
			combat_fx_3d.spawn_mech_sparks(root.global_position + Vector3(0.0, 0.85, 0.0), false)

		var was_dead := bool(_bot_downed.get(kind, false))
		if dead != was_dead:
			_bot_downed[kind] = dead
			_apply_bot_pose(root, kind, dead)


func _apply_bot_flash(kind: String, root: Node3D, flash_t: float) -> void:
	var key := "bot_" + kind
	var mat: StandardMaterial3D = null
	if flash_t > 0.0:
		if not _overlay_mats.has(key):
			var nm := StandardMaterial3D.new()
			nm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			nm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			nm.emission_enabled = true
			_overlay_mats[key] = nm
		mat = _overlay_mats[key] as StandardMaterial3D
		var k := clampf(flash_t / 0.12, 0.0, 1.0)
		mat.albedo_color = Color(0.75, 0.94, 1.0, 0.80 * k)
		mat.emission = Color(0.65, 0.92, 1.0)
		mat.emission_energy_multiplier = 2.8 * k
	var stack: Array = [root]
	while not stack.is_empty():
		var n: Variant = stack.pop_back()
		if n is MeshInstance3D:
			(n as MeshInstance3D).material_overlay = mat if flash_t > 0.0 else null
		if n is Node:
			for c in (n as Node).get_children():
				stack.append(c)


func _apply_bot_pose(root: Node3D, kind: String, dead: bool) -> void:
	for c in root.get_children():
		if c is Label3D:
			var lb := c as Label3D
			lb.modulate = Color(0.45, 0.48, 0.52, 0.65) if dead else (
				Color("#E0574F") if kind == "secbot" else Color("#8FE3FF"))
		elif c is Node3D:
			var cn := c as Node3D
			if dead:
				cn.rotation = Vector3(0.38, 0.15, 0.30) if kind == "medbot" else Vector3(0.28, 0.0, 0.24)
				cn.position.y = -0.92 if kind == "medbot" else -0.14
			else:
				cn.rotation = Vector3.ZERO
				cn.position.y = 0.0
			break
