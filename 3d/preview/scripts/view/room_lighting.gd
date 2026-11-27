extends RefCounted
## 分舱写实布光、近距动态阴影与断电应急红光管理（由 map_builder 委托调用）。

const ROOM_PROFILES := {
	"med": {"color": Color(0.84, 0.96, 1.0), "energy": 2.15},
	"cam": {"color": Color(0.72, 0.88, 1.0), "energy": 1.95},
	"engine": {"color": Color(1.0, 0.72, 0.42), "energy": 1.85},
	"power": {"color": Color(1.0, 0.75, 0.44), "energy": 1.70},
	"bridge": {"color": Color(0.96, 0.98, 1.0), "energy": 1.95},
	"ecosys": {"color": Color(0.86, 0.98, 0.90), "energy": 2.15},
	"fun": {"color": Color(0.95, 0.48, 0.90), "energy": 2.00},
	"armory": {"color": Color(1.0, 0.86, 0.60), "energy": 2.10},
	"warehouse": {"color": Color(0.90, 0.94, 1.0), "energy": 1.95},
	"transit": {"color": Color(1.0, 0.91, 0.76), "energy": 2.10},
}

const SHADOW_BUDGET := 3
const SHADOW_MAX_DIST_SQ := 576.0  # 24m 平方

var _room_records: Array = []
var _emergency_lights: Array = []
var _bridge_spot: SpotLight3D = null
var _pulse_time := 0.0
## 当前启用实时阴影的光源集合（用于帧间脏检查，避免无变化时反复重绘阴影图集）
var _active_shadow_lights: Array = []


func build_rooms(host: Node3D, data: Dictionary) -> Dictionary:
	_room_records.clear()
	_emergency_lights.clear()
	_active_shadow_lights.clear()
	_bridge_spot = null
	var keynote: OmniLight3D = null

	for room: Dictionary in data.get("rooms", []):
		var rect: Array = room.get("rect", [0, 0, 1, 1])
		var x0 := float(rect[0])
		var z0 := float(rect[1])
		var w := float(rect[2])
		var d := float(rect[3])
		var label: Array = room.get("label", [x0 + w * 0.5, z0 + d * 0.5])
		var rid := String(room.get("id", ""))
		var bright := String(room.get("light", "bright")) == "bright"
		var is_bridge := rid == "bridge"
		var prof: Dictionary = ROOM_PROFILES.get(rid, {})
		var col: Color = prof.get("color", Color(1.0, 0.93, 0.82) if bright else Color(0.75, 0.84, 1.0))
		var base_energy: float = float(prof.get("energy", 3.3 if bright else 1.85))
		var span: float = maxf(w, d)

		var main_pos := Vector3(float(label[0]), 2.45 if is_bridge else 2.55, float(label[1]))
		var main_range := clampf(span * 1.69, 12.5, 40.0)
		var main_light := _make_omni(host, main_pos, col, base_energy, main_range, 1.15)

		var extras: Array = []
		if is_bridge or rid == "warehouse":
			# 大舱室沿长轴分布 3 盏顶灯，消除中心过曝与边角死黑
			main_light.position = Vector3(x0 + w * 0.5, 2.52, z0 + d * 0.5)
			main_light.omni_range = clampf(w * 0.56, 13.75, 25.0)
			if is_bridge:
				main_light.light_energy = 1.35
			for frac in [0.20, 0.80]:
				var px := x0 + w * float(frac) if w >= d else x0 + w * 0.5
				var pz := z0 + d * 0.5 if w >= d else z0 + d * float(frac)
				extras.append(_make_omni(host, Vector3(px, 2.52, pz), col, base_energy * 0.72, main_light.omni_range, 0.90))

		if is_bridge:
			keynote = _make_omni(host, Vector3(float(label[0]), 2.35, float(label[1])), Color(1.0, 0.97, 0.90), 1.8, 32.5, 0.85)
			_bridge_spot = _make_bridge_spot(host, Vector3(x0 + w * 0.5, 2.88, z0 + d * 0.5))
			extras.append(_bridge_spot)
		elif rid == "ecosys":
			extras.append(_make_omni(host, Vector3(x0 + w * 0.72, 2.25, z0 + d * 0.45), Color(0.32, 0.95, 0.48), 1.10, 14.0, 0.90))
		elif rid == "fun":
			extras.append(_make_omni(host, Vector3(x0 + w * 0.76, 2.42, z0 + d * 0.52), Color(0.28, 0.88, 0.98), 1.30, 17.5, 0.85))

		var rec := {
			"light": main_light, "extras": extras, "room": rid,
			"bright": bright, "bridge": is_bridge,
		}
		_room_records.append(rec)

	_build_emergency_lights(host, data)
	return {"room_lights": _room_records, "keynote": keynote}


func set_light_state(st: int) -> void:
	for rec: Dictionary in _room_records:
		var lit: bool = bool(rec.get("bridge", false)) or st == 1 \
			or (st == 0 and bool(rec.get("bright", true)))
		var main_l := rec["light"] as Light3D
		if main_l != null:
			main_l.visible = lit
		for ex: Light3D in rec.get("extras", []):
			if ex != null:
				ex.visible = lit
	var blackout := st == 2
	for em: Dictionary in _emergency_lights:
		var l := em["light"] as OmniLight3D
		if l != null:
			l.visible = blackout


func tick_emergency(delta: float, power_on: bool) -> void:
	if power_on:
		return
	_pulse_time += delta
	for em: Dictionary in _emergency_lights:
		var l := em["light"] as OmniLight3D
		if l != null and l.visible:
			var wave := 0.5 + 0.5 * sin(_pulse_time * 2.6 + float(em["phase"]))
			l.light_energy = 0.25 + 0.75 * wave


func update_shadows(player_pos: Vector3) -> void:
	var cands: Array = []
	for rec: Dictionary in _room_records:
		var l := rec["light"] as OmniLight3D
		if l == null or not l.visible:
			continue
		var d2 := l.global_position.distance_squared_to(player_pos)
		if d2 <= SHADOW_MAX_DIST_SQ:
			cands.append({"light": l, "d2": d2})
	if _bridge_spot != null and _bridge_spot.visible:
		var bd2 := _bridge_spot.global_position.distance_squared_to(player_pos)
		if bd2 <= SHADOW_MAX_DIST_SQ:
			cands.append({"light": _bridge_spot, "d2": bd2 * 0.85})
	cands.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["d2"]) < float(b["d2"]))
	var next_lights: Array = []
	for i in mini(SHADOW_BUDGET, cands.size()):
		next_lights.append(cands[i]["light"])
	## Top-3 阴影光源集合未变化时直接返回，避免每 0.25s 开关阴影导致阴影图集重分配卡顿
	if _same_light_set(next_lights, _active_shadow_lights):
		return
	for old_l in _active_shadow_lights:
		if is_instance_valid(old_l) and not next_lights.has(old_l):
			(old_l as Light3D).shadow_enabled = false
	for new_l in next_lights:
		if is_instance_valid(new_l) and not _active_shadow_lights.has(new_l):
			(new_l as Light3D).shadow_enabled = true
	_active_shadow_lights = next_lights


func _same_light_set(a: Array, b: Array) -> bool:
	if a.size() != b.size():
		return false
	for l in a:
		if not b.has(l):
			return false
	return true


func _make_omni(host: Node3D, pos: Vector3, col: Color, energy: float, rng: float, atten: float) -> OmniLight3D:
	var l := OmniLight3D.new()
	l.position = pos
	l.light_color = col
	l.light_energy = energy
	l.omni_range = rng
	l.omni_attenuation = atten
	l.shadow_enabled = false
	l.shadow_bias = 0.04
	l.shadow_normal_bias = 1.2
	l.shadow_blur = 1.4
	l.distance_fade_enabled = true
	l.distance_fade_begin = 25.0
	l.distance_fade_length = 10.0
	host.add_child(l)
	return l


func _make_bridge_spot(host: Node3D, pos: Vector3) -> SpotLight3D:
	var spot := SpotLight3D.new()
	spot.position = pos
	spot.rotation_degrees = Vector3(-90.0, 0.0, 0.0)
	spot.light_color = Color(1.0, 0.96, 0.88)
	spot.light_energy = 2.6
	spot.spot_range = 11.5
	spot.spot_angle = 48.0
	spot.spot_attenuation = 1.15
	spot.shadow_enabled = false
	spot.shadow_bias = 0.04
	spot.shadow_normal_bias = 1.2
	spot.shadow_blur = 1.4
	spot.distance_fade_enabled = true
	spot.distance_fade_begin = 22.0
	spot.distance_fade_length = 8.0
	host.add_child(spot)
	return spot


func _build_emergency_lights(host: Node3D, data: Dictionary) -> void:
	var idx := 0
	for room: Dictionary in data.get("rooms", []):
		if String(room.get("id", "")) == "bridge":
			continue
		var rect: Array = room.get("rect", [0, 0, 1, 1])
		var doors: Array = room.get("doors", [])
		if doors.is_empty():
			continue
		var door: Array = doors[0]
		var side := String(door[0])
		var coord := float(door[1])
		var pos := Vector3.ZERO
		match side:
			"b":
				pos = Vector3(coord, 2.55, float(rect[1]) + float(rect[3]))
			"t":
				pos = Vector3(coord, 2.55, float(rect[1]))
			"l":
				pos = Vector3(float(rect[0]), 2.55, coord)
			"r":
				pos = Vector3(float(rect[0]) + float(rect[2]), 2.55, coord)
		var em := OmniLight3D.new()
		em.position = pos
		em.light_color = Color(0.95, 0.14, 0.10)
		em.light_energy = 0.75
		em.omni_range = 7.5
		em.omni_attenuation = 1.15
		em.shadow_enabled = false
		em.visible = false
		host.add_child(em)
		_emergency_lights.append({"light": em, "phase": float(idx) * 0.9})
		idx += 1
