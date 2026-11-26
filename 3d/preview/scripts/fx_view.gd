extends RefCounted
## 战斗声画表现总控门面（纯表现层，不写任何规则与数值）：
## 整合 CombatHudFx（动态准星/Hitmarker/受击暗角）、CombatFx3D（世界 3D 特效与连线）、
## CrewCombatFx（红身/闪白/击退/机器人战损）及暗房遮罩。

const CombatHudFxScript := preload("res://scripts/ui/combat_hud_fx.gd")
const CombatFx3DScript := preload("res://scripts/view/combat_fx_3d.gd")
const CrewCombatFxScript := preload("res://scripts/view/crew_combat_fx.gd")
const SpaceData := preload("res://scripts/space_data.gd")


static func build(m) -> void:
	m.fx_layer = CanvasLayer.new()
	m.fx_layer.layer = 2
	m.add_child(m.fx_layer)

	var hud := CombatHudFxScript.new()
	m.fx_layer.add_child(hud)
	m.combat_hud = hud

	var fx3d := CombatFx3DScript.new()
	m.add_child(fx3d)
	m.combat_fx_3d = fx3d

	var crew_fx := CrewCombatFxScript.new()
	m.add_child(crew_fx)
	m.crew_combat_fx = crew_fx

	m.dark_layer = CanvasLayer.new()
	m.dark_layer.layer = 0
	m.add_child(m.dark_layer)
	var grad := Gradient.new()
	grad.set_color(0, Color(0.0, 0.0, 0.0, 0.0))
	grad.set_color(1, Color(0.0, 0.0, 0.0, 1.0))
	var gtex := GradientTexture2D.new()
	gtex.gradient = grad
	gtex.fill = GradientTexture2D.FILL_RADIAL
	gtex.fill_from = Vector2(0.5, 0.5)
	gtex.fill_to = Vector2(1.0, 0.5)
	gtex.width = 256
	gtex.height = 256
	m.dark_rect = TextureRect.new()
	m.dark_rect.texture = gtex
	m.dark_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	m.dark_rect.stretch_mode = TextureRect.STRETCH_SCALE
	m.dark_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.dark_rect.modulate = Color(1.0, 1.0, 1.0, 0.0)
	m.dark_layer.add_child(m.dark_rect)


static func knife_hit_fx(m, hit: bool, at: Vector3 = Vector3.ZERO,
		is_bot: bool = false, _actor_pos: Vector3 = Vector3.ZERO) -> void:
	if hit:
		if m.combat_hud != null:
			m.combat_hud.trigger_hitmarker("armor" if is_bot else "human")
			m.combat_hud.trigger_hit_flash()
			m.combat_hud.trigger_crosshair_kick(0.9)
		if m.player != null:
			m.player.punch(1.0, 0.036, 0.024)
			if m.player.has_method("hitstop"):
				m.player.hitstop(0.055)
		if at != Vector3.ZERO and not is_bot:
			spawn_blood(m, at)
	else:
		if m.combat_hud != null:
			m.combat_hud.trigger_crosshair_kick(0.55)
		if m.player != null:
			m.player.punch(0.28, -0.015, 0.018)
		if m.audio != null:
			m.audio.play("whoosh_air", 0.55)


static func shot_fx(m, hit: bool, from_pos: Vector3, to_pos: Vector3, is_bot: bool = false) -> void:
	if m.player != null:
		if m.player.has_method("play_pistol_fire"):
			m.player.play_pistol_fire()
		m.player.punch(0.88 if hit else 0.45, 0.048, 0.014)
	if m.combat_hud != null:
		m.combat_hud.trigger_crosshair_kick(1.1)
		if hit:
			m.combat_hud.trigger_hitmarker("armor" if is_bot else "human")
			m.combat_hud.trigger_hit_flash()
	if m.combat_fx_3d != null and is_bot and from_pos != to_pos:
		m.combat_fx_3d.spawn_tracer(from_pos, to_pos, true)


static func spawn_blood(m, pos: Vector3, dir: Vector3 = Vector3.UP) -> void:
	if m.combat_fx_3d != null:
		m.combat_fx_3d.spawn_blood(pos, dir)
		return
	var p := CPUParticles3D.new()
	p.amount = 16
	p.lifetime = 0.5
	p.one_shot = true
	p.explosiveness = 0.95
	p.direction = dir.normalized() if dir.length_squared() > 0.001 else Vector3(0.0, 0.55, 0.0)
	p.spread = 55.0
	p.initial_velocity_min = 1.1
	p.initial_velocity_max = 3.0
	p.gravity = Vector3(0.0, -6.5, 0.0)
	var mesh := SphereMesh.new()
	mesh.radius = 0.022
	mesh.height = 0.044
	mesh.radial_segments = 4
	mesh.rings = 2
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.55, 0.045, 0.045)
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mesh.material = mat
	p.mesh = mesh
	m.add_child(p)
	p.global_position = pos
	p.emitting = true
	m.get_tree().create_timer(1.0, false).timeout.connect(p.queue_free)


static func on_combat_event(m, e: Dictionary) -> void:
	if m.sim == null:
		return
	var kind := String(e.get("kind", ""))
	match kind:
		"dawn", "night_start", "game_start":
			if m.combat_fx_3d != null:
				m.combat_fx_3d.clear_pools()
		"knife", "shoot":
			var ai := int(e.get("actor", -1))
			var vi := int(e.get("victim", -1))
			var ap := _agent_pos3(m, ai, 1.15)
			var vp := _agent_pos3(m, vi, 1.05)
			var dir := vp - ap
			if kind == "knife":
				if m.combat_fx_3d != null:
					m.combat_fx_3d.spawn_slash_arc(ap, vp)
					m.combat_fx_3d.spawn_blood(vp, dir)
					m.combat_fx_3d.spawn_blood_pool(Vector3(vp.x, 0.0, vp.z))
			else:
				if m.combat_fx_3d != null:
					m.combat_fx_3d.spawn_tracer(_muzzle_or_eye(m, ai, ap), vp, false)
					m.combat_fx_3d.spawn_blood(vp, dir)
					m.combat_fx_3d.spawn_blood_pool(Vector3(vp.x, 0.0, vp.z))
			if m.crew_combat_fx != null:
				m.crew_combat_fx.on_hit(vi, dir)
			if vi == int(m.sim.me_idx) and m.combat_hud != null:
				m.combat_hud.trigger_player_hurt()
		"revive":
			var vi2 := int(e.get("victim", -1))
			if vi2 == int(m.sim.me_idx) and m.combat_hud != null:
				m.combat_hud.trigger_revive_flash()
		"bot_hit", "bot_down":
			var bkind := String(e.get("bot", ""))
			var bp2: Vector2 = m.sim.bot_pos_of(bkind)
			if m.combat_fx_3d != null and bp2 != Vector2.ZERO:
				m.combat_fx_3d.spawn_mech_sparks(Vector3(bp2.x, 0.95, bp2.y), kind == "bot_down")
			if m.crew_combat_fx != null and bkind != "":
				m.crew_combat_fx.on_bot_hit(bkind)
		"sabotage":
			var rid := String(e.get("room", ""))
			var rc: Vector2 = m.sim.room_center(rid)
			if m.combat_fx_3d != null and rc != Vector2.ZERO:
				m.combat_fx_3d.spawn_mech_sparks(Vector3(rc.x, 1.1, rc.y), true)
		"breaker":
			var br: Vector2 = m.sim.breaker_pos()
			if m.combat_fx_3d != null and br != Vector2.ZERO:
				m.combat_fx_3d.spawn_mech_sparks(Vector3(br.x, 1.2, br.y), not bool(e.get("on", true)))


static func _agent_pos3(m, idx: int, y: float) -> Vector3:
	if m.sim == null or idx < 0:
		return Vector3.ZERO
	if idx == int(m.sim.me_idx) and m.player != null:
		return Vector3(m.player.global_position.x, y, m.player.global_position.z)
	var a: Dictionary = m.sim.agent(idx)
	if a.is_empty():
		return Vector3.ZERO
	var p: Vector2 = a.get("pos", Vector2.ZERO)
	return Vector3(p.x, y, p.y)


static func _muzzle_or_eye(m, actor_i: int, fallback: Vector3) -> Vector3:
	if m.sim != null and actor_i == int(m.sim.me_idx) and m.player != null and m.player.camera != null:
		var cam: Camera3D = m.player.camera
		return cam.global_position + cam.global_transform.basis.x * 0.20 \
			- cam.global_transform.basis.y * 0.16 - cam.global_transform.basis.z * 0.45
	return fallback


static func tick_fx(m, delta: float) -> void:
	if m.combat_fx_3d != null:
		m.combat_fx_3d.tick(delta)
		m.combat_fx_3d.sync_beams(m.sim, m.extras, delta)
	if m.crew_combat_fx != null:
		m.crew_combat_fx.sync(m.sim, m.crew_view, m.extras, delta, m.combat_fx_3d)
	if m.combat_hud != null:
		var hide := _is_modal_open(m)
		var spd := Vector2(m.player.velocity.x, m.player.velocity.z).length() if m.player != null else 0.0
		var downed := false
		if m.sim != null and not m.sim.agents.is_empty():
			downed = bool(m.sim.me().get("downed", false))
		var target_hit := false if hide else _has_target_in_crosshair(m)
		m.combat_hud.tick(delta, spd, target_hit, downed, hide)


static func _is_modal_open(m) -> bool:
	if not bool(m.started) or bool(m.paused):
		return true
	if m.sim != null and (not m.sim.meeting.is_empty() or bool(m.sim.over)):
		return true
	if bool(m._pipe_open) or bool(m._info_open):
		return true
	if m.mg_layer != null and bool(m.mg_layer.is_open()):
		return true
	if m.wheel != null and bool(m.wheel.is_open()):
		return true
	if m.ui_panels != null and bool(m.ui_panels.any_open()):
		return true
	if m.settle_panel != null and m.settle_panel.visible:
		return true
	return false


static func _has_target_in_crosshair(m) -> bool:
	if m.sim == null or m.sim.agents.is_empty() or m.player == null or m.player.camera == null:
		return false
	if bool(m.sim.spectator):
		return false
	var me: Dictionary = m.sim.me()
	if me.is_empty() or not bool(me.get("alive", true)) \
			or bool(me.get("downed", false)) or bool(me.get("detained", false)):
		return false
	var can_knife := bool(me.get("alien", false)) and int(me.get("knife", 0)) > 0
	var can_shoot := int(me.get("bullet", 0)) > 0
	if not can_knife and not can_shoot:
		return false
	var cam: Camera3D = m.player.camera
	var eye := cam.global_position
	var fwd := -cam.global_transform.basis.z
	var max_r := SpaceData.num(m.space, "shoot", "range") if can_shoot else SpaceData.num(m.space, "reach", "knife")
	var me_p: Vector2 = me.get("pos", Vector2.ZERO)
	for a: Dictionary in m.sim.agents:
		if int(a.get("i", -1)) == int(m.sim.me_idx):
			continue
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)) or bool(a.get("detained", false)):
			continue
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		var d2 := me_p.distance_to(ap)
		if d2 > max_r:
			continue
		var p3 := Vector3(ap.x, 1.05, ap.y)
		var to := p3 - eye
		var l := to.length()
		if l > 0.05 and fwd.dot(to / l) > 0.90 and m.sim.los_now(me_p.x, me_p.y, ap.x, ap.y):
			return true
	if m.sim.bots != null:
		var bot_r := SpaceData.num(m.space, "shoot", "range") if can_shoot else 1.8
		for bk: String in ["secbot", "medbot"]:
			if m.sim.bots.is_dead(bk):
				continue
			var bp: Vector2 = m.sim.bots.pos_of(bk)
			if me_p.distance_to(bp) <= bot_r:
				var bp3 := Vector3(bp.x, 0.95, bp.y)
				var to2 := bp3 - eye
				var l2 := to2.length()
				if l2 > 0.05 and fwd.dot(to2 / l2) > 0.88 and m.sim.los_now(me_p.x, me_p.y, bp.x, bp.y):
					return true
	return false


static func tick_darkness(m, delta: float) -> void:
	if m.dark_rect == null or m.sim == null:
		return
	var st := int(m.sim.light_state)
	if st != m._light_applied:
		m._light_applied = st
		m.power_on = st != 2
		if m.builder != null:
			m.builder.set_light_state(st)
		if m.extras != null:
			m.extras.set_power(m.power_on)
		m._refresh_power_hud()
	var target := 0.0
	if not bool(m.sim.dev) and not bool(m.sim.spectator) \
			and not bool(m.sim.me().get("ghost", false)) and not m._player_room_lit():
		target = 0.62
	m._dark_alpha = lerpf(m._dark_alpha, target, clampf(delta * 4.0, 0.0, 1.0))
	m.dark_rect.modulate.a = m._dark_alpha
