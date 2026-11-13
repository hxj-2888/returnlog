extends Node3D

## 3D 场景补齐：任务点设备、设施、管道、装饰、门框。
## 几何优先用 3d/assets/export 里 Blender 生成的 GLB；缺失时程序化兜底。
## 只读 map.json，不碰对局状态；设备交互由 main.gd 调 nearest_device()。

## 自动门完全开/完全关时发一次；main 接成 2.5D SND.doorAuto 的音效。
signal door_auto(pos: Vector3)

const DeviceScript := preload("res://scripts/device.gd")
const MGData := preload("res://scripts/minigame/mg_data.gd")
const MapBuilder := preload("res://scripts/map_builder.gd")
const SpaceData := preload("res://scripts/space_data.gd")
const SecbotView := preload("res://scripts/secbot_view.gd")

const WALL_H := 3.0
const METAL := "res://assets/textures/panel-metal.png"
const SCREEN := "res://assets/textures/facility-screen.png"

## 与 2.5D 的 js/t2/space.js#PIPE_TINT 同色；3D 端只用于管道边圈。
const PIPE_COLORS := {
	"engine": Color("#F57533"), "cam": Color("#3DC7F2"), "armory": Color("#FAB833"),
	"warehouse": Color("#FAC73D"), "transit": Color("#FACC73"), "med": Color("#4DD1F0"),
	"ecosys": Color("#57DB70"), "fun": Color("#E052CC"),
}

## decor 每件占用的竖向区间 [底, 顶]（米），取自 `tools/blender-ship.py` 的 `furniture()`。
## 上游真源同上；`plate_stack` / `pot` 是**台面件**（底面 0.84），不是落地件。
## decor 在 2.5D 与 3D 都不参与碰撞与视线判定，纯表现层。
const DECOR_Z := {
	"floor_mark": [0.0, 0.012],
	"camera": [1.68, 2.04],      # 壁装，不是吸顶
	"holoscreen": [0.0, 1.62],
	"machine": [0.0, 1.06],
	"console": [0.0, 0.86],
	"chair": [0.0, 0.94],
	"ventilator": [0.0, 1.18],
	"ivstand": [0.0, 1.72],
	"plate_stack": [0.838, 0.915],
	"pot": [0.84, 1.20],
}

var devices: Array = []
var doors: Array = []
var pipe_ports: Array = []
## 两台机器人的场景节点：main 每帧按 sim.bots 的位置移动它们
var bot_nodes: Dictionary = {}
var _room_centers: Dictionary = {}
var _bob: Array = []
var _door_strip_mats: Array = []
var _screen_mats: Array = []
var space: Dictionary = {}
var _room_tints: Dictionary = {}


func build(data: Dictionary, space_data: Dictionary = {}) -> void:
	space = space_data
	for room: Dictionary in data.get("rooms", []):
		var rect: Array = room.get("rect", [0, 0, 1, 1])
		_room_centers[String(room.get("id", ""))] = Vector2(
			float(rect[0]) + float(rect[2]) * 0.5,
			float(rect[1]) + float(rect[3]) * 0.5)
		var th: Dictionary = room.get("theme", {})
		var mk: Array = th.get("mark", [])
		if mk.size() >= 3:
			_room_tints[String(room.get("id", ""))] = Color(
				clampf(float(mk[0]), 0.0, 1.0), clampf(float(mk[1]), 0.0, 1.0),
				clampf(float(mk[2]), 0.0, 1.0))
	_build_devices(data)
	_build_facilities(data)
	_build_pipes(data)
	_build_decor(data)
	_build_doors(data)
	_sync_door_visuals()
	set_process(true)


## 断电表现：门楣灯带跟着灭（灯带是照明件，不是设备指示件）。
func set_power(on: bool) -> void:
	for mat: StandardMaterial3D in _door_strip_mats:
		mat.emission_energy_multiplier = float(mat.get_meta("base_emit")) if on else 0.04
	# 设备屏幕也要压下去：否则断电时 27 块发光面板会把熄灯效果整个抵消掉
	for mat: StandardMaterial3D in _screen_mats:
		mat.emission_energy_multiplier = float(mat.get_meta("base_emit")) if on else 0.08


## 门的开合与断电扫描**只由 sim 决定**（sim_state.door_tick ← 2.5D js/game.js:448 doorTick）。
## 这里只把 sim 的 open / scan_t 映射到门扇与扫描线，并在完全开/关时播音。
## 3D 之前 door_update 自己算了一套开合，于是「看得见的门」和「挡人的门」是两套状态：
## sim 不知道门，关着的门既不挡人也不挡视线/枪线。
func sync_doors(p_sim) -> void:
	if p_sim == null or space.is_empty():
		return
	var pass_r := SpaceData.num(space, "door", "pass")
	var scan_sec := SpaceData.num(space, "door", "scan_sec")
	var by_key: Dictionary = {}
	for sd: Dictionary in p_sim.doors:
		by_key[String(sd.get("key", ""))] = sd
	for v: Dictionary in doors:
		var sd: Dictionary = by_key.get(String(v.get("key", "")), {}) as Dictionary
		if sd.is_empty():
			# sim 没生成这扇门（2.5D buildDoors 只给走廊端点生成门）：保持关闭，
			# 不自己开——避免表现层偷偷放行一条 sim 不认的通道。
			_apply_door_state(v, 0.0, pass_r, bool(p_sim.power_on), scan_sec)
			continue
		var open := float(sd.get("open", 0.0))
		var prev := float(v.get("open", 0.0))
		v["open"] = open
		v["scan_t"] = float(sd.get("scan_t", 0.0))
		_apply_door_state(v, open, pass_r, bool(p_sim.power_on), scan_sec)
		if (prev < 1.0 and open >= 1.0) or (prev > 0.0 and open <= 0.0):
			door_auto.emit(v["center"])


func door_stats() -> Dictionary:
	var pass_r := SpaceData.num(space, "door", "pass")
	var blocked := 0
	var open_n := 0
	var max_scan := 0.0
	for d: Dictionary in doors:
		if float(d["open"]) > pass_r:
			open_n += 1
		else:
			blocked += 1
		max_scan = maxf(max_scan, float(d["scan_t"]))
	return {"count": doors.size(), "blocked": blocked, "open": open_n, "max_scan": max_scan}


func _apply_door_state(d: Dictionary, open: float, pass_r: float, power_on: bool, scan_sec: float) -> void:
	var half := float(d["half"])
	var offset: Vector3 = d["offset"]
	var leaves: Array = d["leaves"]
	var blockers: Array = d["blockers"]
	# 2.5D drawDoors 的几何：两扇各半宽，关闭时在中线合拢（中心 ±half/2），
	# 完全打开时各滑出 half，正好让出整段门洞；旧写法中心 ±half + slide 2*half，
	# 关闭时中间留了 0.9m 缝，看起来永远是半开，人也能从缝里挤过去。
	var slide := half * open
	for i in leaves.size():
		var s := -1.0 if i == 0 else 1.0
		var base: Vector3 = d["center"] + offset * (s * half * 0.5) + Vector3(0, 1.25, 0)
		var leaf: Node3D = leaves[i] as Node3D
		leaf.position = base + offset * (s * slide)
		(blockers[i]["body"] as StaticBody3D).position = leaf.position
		(blockers[i]["shape"] as CollisionShape3D).disabled = open > pass_r
	var scan: MeshInstance3D = d["scan"]
	scan.visible = (not power_on) and open <= pass_r and float(d["scan_t"]) > 0.0
	if scan.visible:
		var t := clampf(float(d["scan_t"]) / scan_sec, 0.0, 1.0)
		scan.position = d["center"] + Vector3(0, 0.1 + t * 2.3, 0)
		var m := scan.material_override as StandardMaterial3D
		m.albedo_color.a = 0.35 + 0.5 * t


func _sync_door_visuals() -> void:
	var pass_r := SpaceData.num(space, "door", "pass")
	var scan_sec := SpaceData.num(space, "door", "scan_sec")
	for d: Dictionary in doors:
		_apply_door_state(d, float(d["open"]), pass_r, true, scan_sec)


func nearest_device(pos: Vector3, max_distance: float, forward: Vector3 = Vector3.ZERO):
	var fallback = null
	var fallback_d := max_distance
	var aligned = null
	var aligned_d := max_distance
	var ahead = null
	var ahead_d := max_distance
	var has_forward := forward.length_squared() > 0.01
	var fwd := forward.normalized() if has_forward else Vector3.ZERO
	for dev in devices:
		if not is_instance_valid(dev):
			continue
		var d: float = dev.distance_to(pos)
		if d >= max_distance:
			continue
		if fallback_d > d:
			fallback_d = d
			fallback = dev
		if not has_forward:
			if ahead_d > d:
				ahead_d = d
				ahead = dev
			continue
		var to := Vector3(dev.global_position.x - pos.x, 0, dev.global_position.z - pos.z)
		var dot := 1.0 if to.length_squared() < 0.0001 else to.normalized().dot(fwd)
		if dot >= 0.0 and d < ahead_d:
			ahead_d = d
			ahead = dev
		if dot >= 0.5 and d < aligned_d:
			aligned_d = d
			aligned = dev
	return aligned if aligned != null else (ahead if ahead != null else fallback)


func _build_devices(data: Dictionary) -> void:
	var mg := MGData.load_data()
	for i in data.get("points", []).size():
		var point: Dictionary = data["points"][i]
		var label := String(point.get("label", ""))
		var kind := MGData.kind_for(mg, "task", label)
		var tier := "circuit" if label == "电路维修" else ("hard" if String(point.get("kind", "")) == "hard" else "normal")
		var center: Vector2 = _room_centers.get(String(point.get("room", "")), Vector2(0, 0))
		var placed := point.duplicate()
		## 2026-11-07：任务点若被掩体压住，_cover_top() 会把设备顶到掩体顶面。
		## 掩体统一补到 1.70m 后，这 3 个设备悬在 1.72m（医疗舱「消毒循环」、
		## 监控室「监控墙重连 / 操作台」）—— 玩家眼高 1.62m，看不见也够不着。
		## 改为重定位到掩体外侧最近空位 + 自带 0.55m 台座，与其余 23 个点一致。
		var pl := _task_placement(point, data)
		placed["x"] = pl["x"]
		placed["y"] = pl["y"]
		placed["base_y"] = pl["base_y"]
		if bool(pl["relocated"]):
			_pedestal(float(pl["x"]), float(pl["y"]), _room_tint(String(point.get("room", ""))))
		var dev := DeviceScript.new()
		add_child(dev)
		dev.setup(placed, kind, tier, i, center)
		_register_screen(dev)
		devices.append(dev)


## 任务点站位：被 cover 压住时，沿并集 bbox 的四边找掩体外的空位。
## 不改动 map_v2.json 的 points（2.5D 的 nearPoint 仍用原坐标），
## 只调整 3D 设备的可交互位置与高度。
func _task_placement(point: Dictionary, data: Dictionary) -> Dictionary:
	var px := float(point.get("x", 0.0))
	var py := float(point.get("y", 0.0))
	var covers: Array = data.get("cover", [])
	var hits: Array = []
	var buried := false
	for c: Dictionary in covers:
		var cx := float(c.get("x", 0.0))
		var cy := float(c.get("y", 0.0))
		var cw := float(c.get("w", 0.0))
		var ch := float(c.get("h", 0.0))
		if px >= cx - 0.2 and px <= cx + cw + 0.2 and py >= cy - 0.2 and py <= cy + ch + 0.2:
			hits.append(c)
			## 2.5D 2026-11-13「任务点贴家具」：锚点落在柜体边线上时不能当"压在掩体里"搬走，
			## 只有真正埋进柜体 ≥0.1 格才算；否则设备离锚点 >2m，玩家够不到。
			if px >= cx + 0.1 and px <= cx + cw - 0.1 and py >= cy + 0.1 and py <= cy + ch - 0.1:
				buried = true
	if hits.is_empty():
		return {"x": px, "y": py, "base_y": _cover_top(point, data), "relocated": false}
	if not buried:
		## 贴边锚点：设备留在锚点、用 0.55m 台座抬离地面（高柜会吞掉设备高度）。
		return {"x": px, "y": py, "base_y": 0.57, "relocated": true}
	var x0 := 1e9; var y0 := 1e9; var x1 := -1e9; var y1 := -1e9
	for c: Dictionary in hits:
		x0 = minf(x0, float(c.get("x", 0.0)))
		y0 = minf(y0, float(c.get("y", 0.0)))
		x1 = maxf(x1, float(c.get("x", 0.0)) + float(c.get("w", 0.0)))
		y1 = maxf(y1, float(c.get("y", 0.0)) + float(c.get("h", 0.0)))
	var mx := (x0 + x1) * 0.5
	var my := (y0 + y1) * 0.5
	var gap := 0.85
	var cands: Array = [Vector2(mx, y0 - gap), Vector2(mx, y1 + gap),
		Vector2(x0 - gap, my), Vector2(x1 + gap, my)]
	var room_c: Vector2 = _room_centers.get(String(point.get("room", "")), Vector2(px, py))
	var best := Vector2(px, py)
	var best_d := 1e9
	for v: Vector2 in cands:
		var blocked := false
		for c: Dictionary in covers:
			var cx := float(c.get("x", 0.0)); var cy := float(c.get("y", 0.0))
			var cw := float(c.get("w", 0.0)); var ch := float(c.get("h", 0.0))
			if v.x >= cx - 0.35 and v.x <= cx + cw + 0.35 and v.y >= cy - 0.35 and v.y <= cy + ch + 0.35:
				blocked = true
				break
		if blocked:
			continue
		var d := v.distance_to(room_c)
		if d < best_d:
			best_d = d
			best = v
	if best_d > 1e8:  # 四边都被挡：沿远离房间中心的方向再退一格
		best = Vector2(mx, y1 + gap * 2.0)
	return {"x": best.x, "y": best.y, "base_y": 0.57, "relocated": true}


func _room_tint(rid: String) -> Color:
	return _room_tints.get(rid, Color(0.70, 0.78, 0.86))


## 与 map_builder._build_device_pedestals 同一套「浅壳 + 压边 + 发光缝」台座；
## 只给重定位的点补（原位点由 map_builder 生成，不会重复）。
func _pedestal(x: float, z: float, accent: Color) -> void:
	var body := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.90, 0.55, 0.90)
	body.mesh = bm
	body.position = Vector3(x, 0.275, z)
	## 2026-11-07：与 map_builder._build_device_pedestals 同一套语言 ——
	## 纯色外壳换成 panel-white 贴图（台座是非交互件，贴图提质即可）。
	body.material_override = _tex(Color(0.66, 0.70, 0.74), "panel-white")
	add_child(body)
	var rim := MeshInstance3D.new()
	var rm := BoxMesh.new()
	rm.size = Vector3(0.98, 0.05, 0.98)
	rim.mesh = rm
	rim.position = Vector3(x, 0.535, z)
	rim.material_override = _tex(Color(0.62, 0.66, 0.72), "panel-metal")
	add_child(rim)
	var glow := MeshInstance3D.new()
	var gm := BoxMesh.new()
	gm.size = Vector3(0.70, 0.025, 0.02)
	glow.mesh = gm
	glow.position = Vector3(x, 0.42, z - 0.462)
	glow.material_override = _flat(accent, true)
	add_child(glow)


## 设备屏幕要跟着供电暗下去：否则断电时 27 块发光面板会把熄灯效果整个抵消掉。
func _register_screen(dev) -> void:
	var sm: StandardMaterial3D = dev.screen_material()
	if sm == null:
		return
	if not sm.has_meta("base_emit"):
		sm.set_meta("base_emit", sm.emission_energy_multiplier)
	_screen_mats.append(sm)


## 任务点在 2.5D 里就是「掩体本体」：设备放到该掩体顶面，坐标不动。
## 高度只认 map_builder.gd 的那张表（不再抄第二份）。
## 旧实现在这里夹了 `minf(height, 1.25)`：那是照着「所有未知掩体都 1.0 米」的错表调出来的，
## 表修对之后夹取会把设备压进高柜机身里（培养罐 1.95 / 监控墙 1.78 整台吞掉设备），故去掉。
func _cover_top(point: Dictionary, data: Dictionary) -> float:
	var x := float(point.get("x", 0))
	var y := float(point.get("y", 0))
	for cover: Dictionary in data.get("cover", []):
		var cx := float(cover.get("x", 0))
		var cy := float(cover.get("y", 0))
		var w := float(cover.get("w", 0))
		var h := float(cover.get("h", 0))
		if x < cx - 0.2 or x > cx + w + 0.2 or y < cy - 0.2 or y > cy + h + 0.2:
			continue
		## 实例高度变体必须与 map_builder._build_cover 用同一个 v.hz，
		## 否则箱体按 ±10% 缩了、设备还按名义高度摆，会浮空或陷进机身。
		var v: Dictionary = cover.get("v", {})
		var height := float(MapBuilder.COVER_HEIGHT.get(String(cover.get("kind", "")), 1.0))
		return height * float(v.get("hz", 1.0)) + 0.02
	## v2 布局：任务点不再都压在掩体顶面。没有掩体可依附的设备，
	## 由 map_builder._build_device_pedestals() 补一个 0.55m 的无碰撞台座，
	## 这里对齐到 0.57（台座顶 0.55 + 0.02 间隙），避免设备直接贴地或悬空。
	return 0.57


func _build_facilities(data: Dictionary) -> void:
	for fac: Dictionary in data.get("facility", []):
		var kind := String(fac.get("kind", ""))
		var x := float(fac.get("x", 0))
		var y := float(fac.get("y", 0))
		match kind:
			"breaker":
				var dev := DeviceScript.new()
				add_child(dev)
				dev.setup({
					"label": "电闸（拉/合）", "x": x, "y": y, "room": fac.get("room", "power"),
					"base_y": _cover_top({"x": x, "y": y}, data)
				}, "lever", "hard", -1, _room_centers.get("power", Vector2(47.5, 54.2)))
				_register_screen(dev)
				devices.append(dev)
			"medbot":
				bot_nodes["medbot"] = _drone(Vector3(x, 1.25, y), Color("#8FE3FF"), "医疗无人机")
			"secbot":
				bot_nodes["secbot"] = _robot(Vector3(x, 0, y), "保安机器人")
			"supply":
				_prop("prop_crate", Vector3(x, 0.02, y), 0.62, 0.0)
				_marker(Vector3(x, 0.03, y), Color("#F0C674"))
				_label3d(Vector3(x, 1.15, y), String(fac.get("label", "补给点")), Color("#F0C674"))
			"monitor":
				_monitor(Vector3(x, 0, y))
				_label3d(Vector3(x, 1.85, y), "监控台", Color("#73A7FF"))


func _build_pipes(data: Dictionary) -> void:
	var tint_src: Dictionary = SpaceData.section(space, "pipe_tint") if not space.is_empty() else PIPE_COLORS
	for p: Dictionary in data.get("pipes", []):
		var x := float(p.get("x", 0))
		var y := float(p.get("y", 0))
		var room := String(p.get("room", ""))
		var color := _tint_color(tint_src.get(room, tint_src.get("default", "#F0C674")))
		var node := _prop("prop_pipe_port", Vector3(x, 0.02, y), 1.0, 0.0)
		if node != null:
			_tint_rim(node, color)
		var ring := _pipe_ring(Vector3(x, 0.13, y), color)
		pipe_ports.append({"pos": Vector3(x, 0.0, y), "room": room, "ring": ring, "node": node})


## PIPE_TINT 在 2.5D 是 js/t2/space.js 的表；space.json 导出成功时读导出值，
## 本地 PIPE_COLORS 只作离线兜底（不要拿它当第二真源）。
func _tint_color(raw: Variant) -> Color:
	if raw is Array:
		var a := raw as Array
		if a.size() >= 3:
			return Color(float(a[0]), float(a[1]), float(a[2]))
	return Color(String(raw))


func _tint_rim(node: Node, color: Color) -> void:
	for c in node.get_children():
		if c is MeshInstance3D and "rim" in c.name.to_lower():
			var m := StandardMaterial3D.new()
			m.albedo_color = color
			m.emission_enabled = true
			m.emission = color
			m.emission_energy_multiplier = 1.2
			c.material_override = m
		_tint_rim(c, color)


func _pipe_ring(pos: Vector3, color: Color) -> MeshInstance3D:
	var ring := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.74
	torus.outer_radius = 0.80
	torus.rings = 32
	torus.ring_segments = 8
	ring.mesh = torus
	ring.position = pos
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.emission_enabled = true
	mat.emission = color
	mat.emission_energy_multiplier = 1.0
	ring.material_override = mat
	add_child(ring)
	# 管道环是**设备标识**不是照明，断电时保持发光（2.5D 里管道口也不随拉闸消失）
	return ring


func _build_decor(data: Dictionary) -> void:
	for d: Dictionary in data.get("decor", []):
		var kind := String(d.get("kind", ""))
		var x := float(d.get("x", 0))
		var y := float(d.get("y", 0))
		var w := float(d.get("w", 0.4))
		var h := float(d.get("h", 0.4))
		var span: Array = DECOR_Z.get(kind, [0.0, 0.35])
		var z0 := float(span[0])
		var z1 := float(span[1])
		match kind:
			"floor_mark":
				var mark := MeshInstance3D.new()
				var box := BoxMesh.new()
				box.size = Vector3(w, z1 - z0, h)
				mark.mesh = box
				mark.position = Vector3(x + w * 0.5, (z0 + z1) * 0.5, y + h * 0.5)
				mark.material_override = _flat(Color(0.94, 0.78, 0.45, 0.16), true)
				add_child(mark)
			"camera":
				# 壁装摄像头：底座 + 球罩 + 镜头口，整体在 1.68~2.04 米（不是吸顶）
				var cam := MeshInstance3D.new()
				var box := BoxMesh.new()
				box.size = Vector3(0.18, 0.16, 0.26)
				cam.mesh = box
				cam.position = Vector3(x, (z0 + z1) * 0.5, y)
				cam.material_override = _mat(METAL, Color(0.35, 0.4, 0.5))
				add_child(cam)
				var lens := MeshInstance3D.new()
				var lc := CylinderMesh.new()
				lc.top_radius = 0.05
				lc.bottom_radius = 0.05
				lc.height = 0.06
				lc.radial_segments = 12
				lens.mesh = lc
				lens.position = Vector3(x, (z0 + z1) * 0.5, y + 0.16)
				lens.rotation.x = PI * 0.5
				lens.material_override = _flat(Color("#73A7FF"), true)
				add_child(lens)
			"holoscreen":
				var screen := MeshInstance3D.new()
				var box := BoxMesh.new()
				box.size = Vector3(w, z1 - z0, 0.05)
				screen.mesh = box
				screen.position = Vector3(x + w * 0.5, (z0 + z1) * 0.5, y + h * 0.5)
				screen.material_override = _screen_mat(SCREEN)
				add_child(screen)
			_:
				var prop := MeshInstance3D.new()
				var box := BoxMesh.new()
				box.size = Vector3(maxf(w, 0.2), maxf(z1 - z0, 0.02), maxf(h, 0.2))
				prop.mesh = box
				# plate_stack / pot 这类台面件落在 z0 之上，不贴地板
				prop.position = Vector3(x + w * 0.5, (z0 + z1) * 0.5, y + h * 0.5)
				prop.material_override = _mat(METAL, Color(0.55, 0.6, 0.7))
				add_child(prop)


func _build_doors(data: Dictionary) -> void:
	var frame_mat := _mat(METAL, Color(0.5, 0.56, 0.66))
	var glow := _flat(Color("#F0C674"), true)
	glow.set_meta("base_emit", 0.8)
	_door_strip_mats.append(glow)
	var leaf_mat := _mat(METAL, Color(0.34, 0.39, 0.47))
	leaf_mat.metallic = 0.6
	## 2026-11-11 美术裁定：门 = 3D 滑门结构 + 2.5D 门板。
	## 三件 glb 缺失时整套回退到旧 BoxMesh，门禁与开合契约不变。
	var frame_scene := _load_scene("res://assets/models/door_frame.glb")
	var leaf_l_scene := _load_scene("res://assets/models/door_leaf_l.glb")
	var leaf_r_scene := _load_scene("res://assets/models/door_leaf_r.glb")
	## 门扇与放行口径全部读 space.json（真源 SKT2Space.DOOR_* + game.js 的 2 秒扫描）
	var width := SpaceData.num(space, "door", "width")
	var height := 2.5
	for room: Dictionary in data.get("rooms", []):
		var rect: Array = room.get("rect", [0, 0, 1, 1])
		for door: Array in room.get("doors", []):
			var side := String(door[0])
			var coord := float(door[1])
			var center := Vector3.ZERO
			var along_x := true
			match side:
				"b":
					center = Vector3(coord, 0, float(rect[1]) + float(rect[3]))
				"t":
					center = Vector3(coord, 0, float(rect[1]))
				"l":
					center = Vector3(float(rect[0]), 0, coord)
					along_x = false
				"r":
					center = Vector3(float(rect[0]) + float(rect[2]), 0, coord)
					along_x = false
			var offset := Vector3(1.0, 0, 0) if along_x else Vector3(0, 0, 1)
			if frame_scene != null:
				var frame := frame_scene.instantiate() as Node3D
				frame.position = center
				frame.rotation.y = 0.0 if along_x else PI * 0.5
				add_child(frame)
			else:
				for s in [-1.0, 1.0]:
					var sv := float(s)
					var post := MeshInstance3D.new()
					var box := BoxMesh.new()
					box.size = Vector3(0.16, WALL_H, 0.30) if along_x else Vector3(0.30, WALL_H, 0.16)
					post.mesh = box
					post.position = center + offset * sv + Vector3(0, WALL_H * 0.5, 0)
					post.material_override = frame_mat
					add_child(post)
				var lintel := MeshInstance3D.new()
				var lb := BoxMesh.new()
				lb.size = Vector3(2.2, 0.26, 0.30) if along_x else Vector3(0.30, 0.26, 2.2)
				lintel.mesh = lb
				lintel.position = center + Vector3(0, 2.62, 0)
				lintel.material_override = frame_mat
				add_child(lintel)
			var strip := MeshInstance3D.new()
			var sb := BoxMesh.new()
			sb.size = Vector3(1.7, 0.05, 0.32) if along_x else Vector3(0.32, 0.05, 1.7)
			strip.mesh = sb
			strip.position = center + Vector3(0, 2.47, 0)
			strip.material_override = glow
			add_child(strip)

			# ---- 门扇 + 碰撞：断电时两扇合拢拦住人，扫描满 2 秒才滑开 ----
			var half := width * 0.5
			var leaf_size := Vector3(half, height, 0.10) if along_x else Vector3(0.10, height, half)
			var leaves: Array = []
			var blockers: Array = []
			for s in [-1.0, 1.0]:
				var sv := float(s)
				var leaf: Node3D
				var lscene: PackedScene = leaf_l_scene if sv < 0.0 else leaf_r_scene
				if lscene != null:
					leaf = lscene.instantiate() as Node3D
					leaf.rotation.y = 0.0 if along_x else PI * 0.5
				else:
					var mi := MeshInstance3D.new()
					var lmesh := BoxMesh.new()
					lmesh.size = leaf_size
					mi.mesh = lmesh
					mi.material_override = leaf_mat
					leaf = mi
				add_child(leaf)
				leaves.append(leaf)
				var body := StaticBody3D.new()
				var shape := CollisionShape3D.new()
				var bshape := BoxShape3D.new()
				bshape.size = leaf_size
				shape.shape = bshape
				body.add_child(shape)
				add_child(body)
				blockers.append({"body": body, "shape": shape})
			# 扫描线：断电期间随 scanT 从下往上刷，扫满才放行（与 2.5D drawDoors 同语义）
			var scan := MeshInstance3D.new()
			var scan_mesh := BoxMesh.new()
			scan_mesh.size = Vector3(width, 0.06, 0.34) if along_x else Vector3(0.34, 0.06, width)
			scan.mesh = scan_mesh
			var scan_mat := _flat(Color("#E0574F"), true)
			scan_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			scan.material_override = scan_mat
			scan.visible = false
			add_child(scan)
			doors.append({
				"center": center, "along_x": along_x, "offset": offset,
				"half": half, "open": 0.0, "scan_t": 0.0,
				# 与 sim_state._build_doors 的 key 同构（舱室|边|坐标）：
				# 两边的开合状态按这个键对齐，不靠数组下标（遍历顺序变了就会错位）。
				"key": "%s|%s|%.3f" % [String(room.get("id", "")), side, coord],
				"leaves": leaves, "blockers": blockers, "scan": scan,
			})


func _drone(pos: Vector3, color: Color, title: String) -> Node3D:
	## 2026-11-07：换成 Blender 生成的 medbot.glb（67 件 / 5610 tris / PBR 贴图）。
	## 旧实现只有一个 SphereMesh + 一个 TorusMesh，和 SDXL 医疗参考图完全不在一个层级。
	var node := Node3D.new()
	node.position = pos
	add_child(node)
	var path := "res://assets/models/medbot.glb"
	if ResourceLoader.exists(path):
		var packed := load(path) as PackedScene
		if packed != null:
			node.add_child(packed.instantiate())
	else:
		# 兜底：资产缺失时仍要有个能看见的东西
		var body := MeshInstance3D.new()
		var sphere := SphereMesh.new()
		sphere.radius = 0.26
		sphere.height = 0.42
		body.mesh = sphere
		body.material_override = _mat("res://assets/textures/panel-white.png", color)
		node.add_child(body)
	_label3d(Vector3(0, 0.62, 0), title, color, node)
	_bob.append({"node": node, "y": pos.y, "t": randf() * TAU})
	return node


func _robot(pos: Vector3, title: String) -> Node3D:
	## 巡逻要动起来，所以整台机器收进一个 Node3D 容器：子件用局部坐标，
	## main 只改容器的 position / rotation.y（原先三个 mesh 各自 add_child，没法整体移动）。
	var root := Node3D.new()
	root.position = pos
	add_child(root)
	var loaded := false
	var path := "res://assets/models/secbot.glb"
	if ResourceLoader.exists(path):
		var packed := load(path) as PackedScene
		if packed != null:
			var inst := packed.instantiate()
			root.add_child(inst)
			var view := SecbotView.new()
			root.add_child(view)
			view.setup(inst)
			loaded = true
	if not loaded:
		var body := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(0.62, 0.9, 0.5)
		body.mesh = box
		body.position = Vector3(0, 0.55, 0)
		body.material_override = _mat(METAL, Color(0.45, 0.5, 0.6))
		root.add_child(body)
		var head := MeshInstance3D.new()
		var hb := BoxMesh.new()
		hb.size = Vector3(0.34, 0.24, 0.30)
		head.mesh = hb
		head.position = Vector3(0, 1.15, 0)
		head.material_override = _mat(METAL, Color(0.55, 0.6, 0.7))
		root.add_child(head)
		var eye := MeshInstance3D.new()
		var es := SphereMesh.new()
		es.radius = 0.06
		es.height = 0.1
		eye.mesh = es
		eye.position = Vector3(0, 1.17, -0.22)
		eye.material_override = _flat(Color("#E0574F"), true)
		root.add_child(eye)
		# 视野指示灯：6 格 180° 扇形太抽象，用一条朝前的细光条表示朝向
		var lamp := MeshInstance3D.new()
		var lb := BoxMesh.new()
		lb.size = Vector3(0.10, 0.05, 0.42)
		lamp.mesh = lb
		lamp.position = Vector3(0, 1.02, -0.35)
		lamp.material_override = _flat(Color("#E0574F"), true)
		root.add_child(lamp)
	_label3d(Vector3(0, 1.62, 0), title, Color("#E0574F"), root)
	return root


func _load_scene(path: String) -> PackedScene:
	if not ResourceLoader.exists(path):
		return null
	return load(path) as PackedScene


func _monitor(pos: Vector3) -> void:
	var desk := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(1.2, 0.75, 0.55)
	desk.mesh = box
	desk.position = pos + Vector3(0, 0.38, 0)
	desk.material_override = _mat(METAL, Color(0.4, 0.45, 0.55))
	add_child(desk)
	var screen := MeshInstance3D.new()
	var quad := QuadMesh.new()
	quad.size = Vector2(0.9, 0.52)
	screen.mesh = quad
	screen.position = pos + Vector3(0, 0.88, -0.02)
	screen.rotation.x = -0.18
	screen.material_override = _screen_mat(SCREEN)
	add_child(screen)


func _prop(model: String, pos: Vector3, scale_factor: float, rot_y: float) -> Node3D:
	var path := "res://assets/models/%s.glb" % model
	if not ResourceLoader.exists(path):
		return null
	var packed := load(path) as PackedScene
	if packed == null:
		return null
	var node := packed.instantiate()
	node.position = pos
	node.scale = Vector3.ONE * scale_factor
	node.rotation.y = rot_y
	add_child(node)
	return node


func _marker(pos: Vector3, color: Color) -> void:
	var ring := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.45
	cyl.bottom_radius = 0.45
	cyl.height = 0.012
	cyl.radial_segments = 32
	ring.mesh = cyl
	ring.position = pos
	ring.material_override = _flat(color, true)
	add_child(ring)


func _label3d(pos: Vector3, text: String, color: Color, parent: Node = null) -> Label3D:
	var label := Label3D.new()
	label.text = text
	label.position = pos
	label.font = _font()
	label.font_size = 44
	label.outline_size = 8
	label.outline_modulate = Color(0, 0, 0, 0.9)
	label.modulate = color
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.no_depth_test = true
	label.pixel_size = 0.0025
	if parent != null:
		parent.add_child(label)
	else:
		add_child(label)
	return label


func _process(delta: float) -> void:
	for b in _bob:
		if not is_instance_valid(b.node):
			continue
		b.t += delta
		b.node.position.y = b.y + sin(b.t * 1.6) * 0.05


func _font() -> SystemFont:
	var f := SystemFont.new()
	f.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])
	return f


func _mat(path: String, tint: Color, emissive: bool = false) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	if path != "" and ResourceLoader.exists(path):
		mat.albedo_texture = load(path) as Texture2D
	mat.albedo_color = tint
	mat.roughness = 0.55
	mat.metallic = 0.35
	if emissive:
		mat.emission_enabled = true
		mat.emission = tint
		mat.emission_energy_multiplier = 0.6
	return mat


## 带贴图的材质：找不到贴图时退回纯色，保证出包不空。
func _tex(color: Color, tex_name: String) -> StandardMaterial3D:
	var path := "res://assets/textures/%s.png" % tex_name
	if not ResourceLoader.exists(path):
		return _flat(color)
	var m := StandardMaterial3D.new()
	m.albedo_texture = load(path) as Texture2D
	m.albedo_color = color
	m.roughness = 0.55
	m.metallic = 0.25
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	return m


func _flat(color: Color, emissive: bool = false) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.6
	if emissive:
		mat.emission_enabled = true
		mat.emission = color
		mat.emission_energy_multiplier = 0.8
	if color.a < 1.0:
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	return mat


func _screen_mat(path: String) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	if ResourceLoader.exists(path):
		var tex := load(path) as Texture2D
		mat.albedo_texture = tex
		mat.emission_enabled = true
		mat.emission_texture = tex
		mat.emission_energy_multiplier = 0.45
	mat.roughness = 0.35
	mat.metallic = 0.1
	return mat
