extends RefCounted
## 视觉截图 / 压测 / 基准 / 批量模拟运行器（从 main.gd 迁出，仅供 CLI 参数入口调用）。

const STUDY_DIR := "res://screenshots/study"


static func _run_bench(m) -> void:
	if OS.get_cmdline_user_args().has("--dev") and m.sim != null:
		m.sim.dev = true
	var fps := []
	for i in 120:
		await m.get_tree().process_frame
		if OS.get_cmdline_user_args().has("--devmove") and m.player != null:
			m.player.global_position.x += 0.02
		if i >= 30:
			fps.append(Engine.get_frames_per_second())
	var avg := 0.0
	for f in fps:
		avg += f
	if not fps.is_empty():
		avg /= float(fps.size())
	var covers: Array = m.builder.data.get("cover", [])
	var room_nodes: Dictionary = m.builder.get("_room_nodes")
	var hidden_nodes := 0
	var shown_nodes := 0
	for rid in room_nodes.keys():
		for n in room_nodes[rid]:
			if n is Node3D and not (n as Node3D).visible:
				hidden_nodes += 1
			else:
				shown_nodes += 1
	var mode := "all" if OS.get_cmdline_user_args().has("--bench-all") else "cull"
	var out := {
		"mode": mode, "fps_avg": avg,
		"time_process": Performance.get_monitor(Performance.TIME_PROCESS),
		"draw_calls": Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
		"objects_in_frame": Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),
		"texture_mem_bytes": Performance.get_monitor(Performance.RENDER_TEXTURE_MEM_USED),
		"covers": covers.size(),
		"shared_cover_mats": m.builder.call("_cover_mat_count"),
		"visible_cover_nodes": shown_nodes,
		"hidden_cover_nodes": hidden_nodes,
		"note": "GPU monitor（draw call / 帧内对象 / 纹理显存）需非 headless 运行，headless 下为 0；FPS 受窗口启动与采样时长影响，仅作参考，优化结论以 draw call / 帧内对象 / 静默节点数为准。",
	}
	var fh := FileAccess.open("res://bench-result.json", FileAccess.WRITE)
	if fh != null:
		fh.store_string(JSON.stringify(out, "\t"))
		fh.close()
	print("BENCH " + JSON.stringify(out))
	m.get_tree().quit()


static func _run_mgshot(m, spec: String) -> void:
	m._finish_meeting(m.sim)
	await m.get_tree().create_timer(0.3).timeout
	var kinds: Array = m.KINDS.duplicate()
	if spec != "all" and m.KINDS.has(spec):
		kinds = [spec]
	var dir := ProjectSettings.globalize_path("res://screenshots")
	DirAccess.make_dir_recursive_absolute(dir)
	for kind in kinds:
		m.mg_layer.open(kind, "测试任务", "normal", "测试 · " + kind,
			func() -> void: pass, func() -> void: pass)
		await m.get_tree().create_timer(0.5).timeout
		await RenderingServer.frame_post_draw
		var image: Image = m.get_viewport().get_texture().get_image()
		var path := "res://screenshots/mg-%s.png" % kind
		image.save_png(path)
		print("MG_SHOT_PATH=", ProjectSettings.globalize_path(path))
		m.mg_layer.cancel()
		await m.get_tree().create_timer(0.25).timeout


static func _run_e2e(m) -> void:
	m._sim_gate = false
	if m.sim != null and not m.sim.meeting.is_empty():
		m.sim.skip_discussion()
		var guard := 0
		while not m.sim.meeting.is_empty() and guard < 240:
			await m.get_tree().create_timer(0.1).timeout
			guard += 1
		print("E2E 会议已收束 · 等待 %.1fs · night=%d" % [guard * 0.1, int(m.sim.night)])
	var dev = null
	var best_gap := -1.0
	for d in m.extras.devices:
		if d.kind != "wire" or d.point_index < 0:
			continue
		var nearest := 999.0
		for o in m.extras.devices:
			if o == d or o.point_index < 0:
				continue
			nearest = minf(nearest, Vector2(
				o.global_position.x - d.global_position.x,
				o.global_position.z - d.global_position.z).length())
		if nearest > best_gap:
			best_gap = nearest
			dev = d
	if dev == null and not m.extras.devices.is_empty():
		dev = m.extras.devices[0]
	if dev == null:
		print("E2E FAIL no device")
		return
	var face: Vector3 = dev.face_dir()
	m.player.global_position = Vector3(dev.global_position.x, 0.05, dev.global_position.z) + face * 1.6
	m.player.rotation.y = atan2(face.x, face.z)
	await m.get_tree().create_timer(0.5).timeout
	var dbg_offers: Array = m._collect_offers()
	print("E2E offers=%s" % str(dbg_offers.map(func(o): return String(o["id"]))))
	var down := InputEventKey.new()
	down.physical_keycode = KEY_E
	down.pressed = true
	Input.parse_input_event(down)
	await m.get_tree().create_timer(0.25).timeout
	var up := InputEventKey.new()
	up.physical_keycode = KEY_E
	up.pressed = false
	Input.parse_input_event(up)
	await m.get_tree().create_timer(0.4).timeout
	print("E2E open=%s label=%s kind=%s" % [
		str(m.mg_layer.is_open()), dev.task_label, dev.kind])
	var dir := ProjectSettings.globalize_path("res://screenshots")
	DirAccess.make_dir_recursive_absolute(dir)
	await RenderingServer.frame_post_draw
	var image: Image = m.get_viewport().get_texture().get_image()
	var path := "res://screenshots/e2e-device-minigame.png"
	image.save_png(path)
	print("E2E_SHOT_PATH=", ProjectSettings.globalize_path(path))
	m.mg_layer.debug_solve()
	await m.get_tree().create_timer(1.0).timeout
	print("E2E closed=%s unlocked=%s" % [
		str(not m.mg_layer.is_open()), str(not m.player.ui_locked)])


static func _run_pipeshot(m) -> void:
	var pipes: Array = m.map_data.get("pipes", [])
	if pipes.is_empty():
		print("PIPESHOT FAIL no pipes")
		return
	var p: Dictionary = pipes[0]
	var cam := Camera3D.new()
	cam.fov = 58.0
	m.add_child(cam)
	cam.global_position = Vector3(float(p["x"]) + 1.7, 1.45, float(p["y"]) + 1.7)
	cam.look_at(Vector3(float(p["x"]), 0.12, float(p["y"])), Vector3.UP)
	cam.current = true
	await m.get_tree().create_timer(0.35).timeout
	await RenderingServer.frame_post_draw
	var dir := ProjectSettings.globalize_path("res://screenshots")
	DirAccess.make_dir_recursive_absolute(dir)
	var path := "res://screenshots/pipe-port-3d.png"
	m.get_viewport().get_texture().get_image().save_png(path)
	print("PIPESHOT ", ProjectSettings.globalize_path(path), " room=", p.get("room"))


static func _run_crewshot(m) -> void:
	m.started = false
	print("CREW_MOUSE mode=%d（0=VISIBLE，2=CAPTURED）" % Input.mouse_mode)
	if m.player != null:
		m.player.ui_locked = true
		m.player.camera.current = false
	if m.hud_layer != null:
		m.hud_layer.visible = false
	if m.crew_view != null:
		m.crew_view.visible = false
	if m.minimap != null:
		m.minimap.visible = false
	var cam := Camera3D.new()
	cam.fov = 50.0
	cam.near = 0.03
	cam.far = 60.0
	m.add_child(cam)
	cam.global_position = Vector3(31.0, 1.55, 37.6)
	cam.look_at(Vector3(31.0, 0.95, 33.5), Vector3.UP)
	cam.current = true

	var font := UIFont.get_font()
	var tex := load("res://assets/crew/crew-01.png") as Texture2D
	if tex != null:
		var atlas := AtlasTexture.new()
		atlas.atlas = tex
		atlas.region = Rect2(0, 0, 96, 160)
		var sp := Sprite3D.new()
		sp.texture = atlas
		sp.pixel_size = 0.012
		sp.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		sp.shaded = false
		sp.double_sided = true
		sp.position = Vector3(30.15, 0.96, 33.5)
		m.add_child(sp)
	_crewshot_label(m, "2.5D billboard", Vector3(30.15, 2.18, 33.5), font,
		Color(0.82, 0.90, 1.0))

	var shot_glb := "res://assets/models/char_crew_lowpoly.glb"
	if not ResourceLoader.exists(shot_glb):
		shot_glb = "res://assets/models/char_crew_blockout.glb"
	var packed := load(shot_glb) as PackedScene
	var model: Node3D = null
	if packed != null:
		model = packed.instantiate() as Node3D
	if model != null:
		model.position = Vector3(31.85, 0.0, 33.5)
		m.add_child(model)
		model.look_at(Vector3(31.85, 0.0, 37.0), Vector3.UP)
		var ap := model.find_child("AnimationPlayer", true, false) as AnimationPlayer
		if ap != null:
			for n in ap.get_animation_list():
				if String(n).to_lower().contains("walk"):
					ap.play(String(n))
					ap.seek(0.3, true)
					break
		var meshes: Array = model.find_children("*", "MeshInstance3D", true, false)
		for n: Node in meshes:
			var mi := n as MeshInstance3D
			if mi.mesh == null:
				continue
			var mats: Array = []
			for s in mi.mesh.get_surface_count():
				var mt := mi.mesh.surface_get_material(s)
				mats.append("?" if mt == null else String(mt.resource_name))
			print("CREW_MESH %s aabb=%s surfaces=%d mats=%s" % [
				String(mi.name), str(mi.get_aabb()), mats.size(), str(mats)])
		print("CREW_MODEL root=%s meshes=%d" % [String(model.name), meshes.size()])
		_crewshot_label(m, "3D lowpoly · walk", Vector3(31.85, 2.18, 33.5), font,
			Color(0.82, 0.96, 0.86))
		var m2: Node3D = packed.instantiate() as Node3D
		if m2 != null:
			m2.position = Vector3(33.20, 0.0, 33.5)
			m.add_child(m2)
			m2.look_at(Vector3(33.20, 0.0, 37.0), Vector3.UP)
			var ap2 := m2.find_child("AnimationPlayer", true, false) as AnimationPlayer
			if ap2 != null:
				for n in ap2.get_animation_list():
					if String(n).to_lower().contains("walk"):
						ap2.play(String(n))
						ap2.seek(0.3, true)
						break
			if m.crew_view != null:
				m.crew_view._tint_model(m2, Color("#5E7A6A"))
			_crewshot_label(m, "换色 · 15 共用", Vector3(33.20, 2.18, 33.5), font,
				Color(0.82, 0.96, 0.86))
	else:
		_crewshot_label(m, "3D blockout 缺失", Vector3(31.85, 2.18, 33.5), font,
			Color(1.0, 0.55, 0.50))

	var bar := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.025, 1.75, 0.025)
	bar.mesh = bm
	var wm := StandardMaterial3D.new()
	wm.albedo_color = Color(0.95, 0.95, 0.95)
	wm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	bar.material_override = wm
	bar.position = Vector3(31.0, 0.875, 32.40)
	m.add_child(bar)
	_crewshot_label(m, "1.75 m", Vector3(31.0, 1.92, 32.40), font, Color(0.95, 0.95, 0.95))

	await m.get_tree().create_timer(0.8).timeout
	await RenderingServer.frame_post_draw
	var img: Image = m.get_viewport().get_texture().get_image()
	var dir := "res://screenshots"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	var path := dir.path_join("crew-lowpoly.png")
	img.save_png(path)
	print("CREWSHOT_PATH=", ProjectSettings.globalize_path(path))


static func _run_doorshot(m) -> void:
	m.started = false
	print("DOOR_MOUSE mode=%d（0=VISIBLE，2=CAPTURED）" % Input.mouse_mode)
	if m.player != null:
		m.player.ui_locked = true
		m.player.camera.current = false
	if m.hud_layer != null:
		m.hud_layer.visible = false
	if m.crew_view != null:
		m.crew_view.visible = false
	if m.minimap != null:
		m.minimap.visible = false
	if m.extras == null or m.extras.doors.is_empty():
		print("DOORSHOT FAIL 没有门")
		return
	var door: Dictionary = m.extras.doors[0]
	var center: Vector3 = door["center"]
	var normal := Vector3(0, 0, 1) if bool(door["along_x"]) else Vector3(1, 0, 0)
	var to_player: Vector3 = m.player.global_position - center
	var side := signf(to_player.dot(normal))
	if absf(side) < 0.01:
		side = 1.0
	var cam := Camera3D.new()
	cam.fov = 48.0
	cam.near = 0.03
	cam.far = 40.0
	m.add_child(cam)
	cam.global_position = center + normal * (2.8 * side) + Vector3(0, 1.55, 0)
	cam.look_at(center + Vector3(0, 1.15, 0), Vector3.UP)
	cam.current = true
	var pass_r: float = m.SpaceData.num(m.space, "door", "pass")
	var scan_sec: float = m.SpaceData.num(m.space, "door", "scan_sec")
	var dir := "res://screenshots"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	for state: Array in [[0.0, "door-closed.png"], [1.0, "door-open.png"]]:
		var open := float(state[0])
		m.extras._apply_door_state(door, open, pass_r, true, scan_sec)
		await m.get_tree().create_timer(0.35).timeout
		await RenderingServer.frame_post_draw
		var img: Image = m.get_viewport().get_texture().get_image()
		var path := dir.path_join(String(state[1]))
		img.save_png(path)
		print("DOORSHOT %s open=%.1f" % [ProjectSettings.globalize_path(path), open])


static func _crewshot_label(m, txt: String, pos: Vector3, font: Font, col: Color) -> void:
	var lb := Label3D.new()
	lb.text = txt
	lb.font = font
	lb.font_size = 32
	lb.outline_size = 8
	lb.pixel_size = 0.0032
	lb.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lb.modulate = col
	lb.position = pos
	m.add_child(lb)


static func _run_devshot(m, spec: String) -> void:
	var indices: Array = []
	if spec == "all":
		for i in m.extras.devices.size():
			indices.append(i)
	elif spec.contains(","):
		for s in spec.split(","):
			indices.append(int(s))
	else:
		indices = [int(spec)]
	var dir := ProjectSettings.globalize_path("res://screenshots")
	DirAccess.make_dir_recursive_absolute(dir)
	for idx in indices:
		if idx < 0 or idx >= m.extras.devices.size():
			continue
		var dev = m.extras.devices[idx]
		var cam := Camera3D.new()
		cam.fov = 58.0
		cam.near = 0.03
		cam.far = 220.0
		m.add_child(cam)
		cam.global_position = dev.focus_position()
		cam.look_at(dev.focus_look_at(), Vector3.UP)
		cam.current = true
		await m.get_tree().create_timer(0.35).timeout
		await RenderingServer.frame_post_draw
		var image: Image = m.get_viewport().get_texture().get_image()
		var path := "res://screenshots/device-%02d-%s.png" % [idx, dev.kind]
		image.save_png(path)
		print("DEV_SHOT_PATH=", ProjectSettings.globalize_path(path), " label=", dev.task_label)
		cam.queue_free()
		await m.get_tree().create_timer(0.1).timeout


static func _study_shot(m, tag: String) -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(STUDY_DIR))
	await RenderingServer.frame_post_draw
	var img: Image = m.get_viewport().get_texture().get_image()
	img.save_png(STUDY_DIR + "/" + tag + ".png")


static func _study_state(m, tag: String) -> void:
	var me: Dictionary = m.sim.me()
	var mp: Vector2 = me.get("pos", Vector2.ZERO) as Vector2
	var offers: Array = m._collect_offers() if m.sim != null else []
	var ids: Array = []
	for o: Dictionary in offers:
		ids.append(String(o.get("id", "")).split("-")[0])
	var toast_txt := ""
	if m.toast_label != null:
		toast_txt = m.toast_label.text
	print("STUDY %s | t=%.1f night=%d prog=%d meet=%s | pos=(%.1f,%.1f) alive=%s downed=%s alien=%s drag=%d qual=%d bullet=%d medkit=%d | dmg=%d light=%d | offers=%s | toast=%s" % [
		tag, float(m.sim.t), int(m.sim.night), int(m.sim.prog),
		str(not m.sim.meeting.is_empty()), mp.x, mp.y,
		str(me.get("alive", false)), str(me.get("downed", false)),
		str(me.get("alien", false)), int(me.get("drag", -1)),
		int(me.get("qual", 0)), int(me.get("bullet", 0)),
		int(me.get("medkit", 0)), m.sim.dmg.size(), int(m.sim.light_state),
		",".join(PackedStringArray(ids)), toast_txt])


static func _study_hold(m, key: Key, frames: int) -> void:
	var d := InputEventKey.new()
	d.keycode = key
	d.physical_keycode = key
	d.pressed = true
	Input.parse_input_event(d)
	for i in frames:
		await m.get_tree().physics_frame
	var u := InputEventKey.new()
	u.keycode = key
	u.physical_keycode = key
	u.pressed = false
	Input.parse_input_event(u)
	await m.get_tree().process_frame


static func _run_study(m) -> bool:
	if m.sim == null or m.sim.agents.is_empty():
		push_error("STUDY 未进局：请带 --role human")
		return false
	m._finish_meeting(m.sim)
	await m.get_tree().process_frame
	await m.get_tree().process_frame
	_study_state(m, "00-ingame")
	await _study_shot(m, "3d-01-ingame")

	var p0: Vector2 = m.sim.me().get("pos", Vector2.ZERO)
	await _study_hold(m, KEY_W, 40)
	var p1: Vector2 = m.sim.me().get("pos", Vector2.ZERO)
	_study_state(m, "01-move-W")
	await _study_shot(m, "3d-02-move-w")
	print("STUDY move-W distance=%.2f" % p0.distance_to(p1))

	var mm := InputEventMouseMotion.new()
	mm.relative = Vector2(260, 0)
	Input.parse_input_event(mm)
	await m.get_tree().process_frame
	await _study_shot(m, "3d-03-look")

	await m._tap_key(KEY_E)
	_study_state(m, "02-key-E")
	await _study_shot(m, "3d-04-key-e")
	await m._tap_key(KEY_F)
	_study_state(m, "03-key-F")
	await m._tap_key(KEY_R)
	_study_state(m, "04-key-R")
	await m._tap_key(KEY_G)
	_study_state(m, "05-key-G")
	await m._tap_key(KEY_Q)
	_study_state(m, "06-key-Q")
	await m._tap_key(KEY_V)
	_study_state(m, "07-key-V")
	await _study_shot(m, "3d-05-key-v")
	await m._tap_key(KEY_H)
	_study_state(m, "08-key-H")
	await m._tap_key(KEY_B)
	_study_state(m, "09-key-B")
	await _study_shot(m, "3d-06-key-b")
	await m._tap_mouse(MOUSE_BUTTON_LEFT)
	_study_state(m, "10-mouse-left")
	await m._tap_mouse(MOUSE_BUTTON_RIGHT)
	_study_state(m, "11-mouse-right")
	await m._tap_key(KEY_ESCAPE)
	_study_state(m, "12-escape-pause")
	await _study_shot(m, "3d-07-escape")
	await m._tap_key(KEY_ESCAPE)
	_study_state(m, "12b-escape-resume")

	var body_i := -1
	var wounded_i := -1
	for a: Dictionary in m.sim.agents:
		if int(a.get("i", -1)) == int(m.sim.me_idx):
			continue
		if body_i < 0:
			a["alive"] = false
			a["downed"] = false
			a["deathCause"] = "knife"
			a["bodyGone"] = false
			a["bodyReported"] = false
			var mp: Vector2 = m.sim.me().get("pos", Vector2.ZERO)
			a["pos"] = mp + Vector2(0.8, 0.8)
			a["bodyPos"] = a["pos"]
			body_i = int(a.get("i", -1))
		elif wounded_i < 0:
			a["alive"] = true
			a["downed"] = true
			a["pos"] = m.sim.me().get("pos", Vector2.ZERO) + Vector2(0.6, 0.6)
			wounded_i = int(a.get("i", -1))
	m.sim.me()["medkit"] = 1
	await m.get_tree().process_frame
	_study_state(m, "13-inject")
	await _study_shot(m, "3d-08-inject-body")
	await m._tap_key(KEY_E)
	_study_state(m, "13b-E-offers")
	await _study_shot(m, "3d-08b-e-offers")
	await m._tap_key(KEY_ESCAPE)
	_study_state(m, "13c-esc-cancel")
	await m._tap_key(KEY_G)
	_study_state(m, "14-G-drag")
	await _study_shot(m, "3d-09-drag")
	await m._tap_key(KEY_G)
	_study_state(m, "15-G-drop")
	await m._tap_key(KEY_F)
	_study_state(m, "16-F-revive")
	await m._tap_key(KEY_R)
	_study_state(m, "17-R-report")
	await _study_shot(m, "3d-10-report")

	m.sim.me()["alien"] = true
	m.sim.me()["sabUsed"] = false
	m.sim.dev = false
	await m._tap_key(KEY_H)
	_study_state(m, "18-H-sabotage")
	await _study_shot(m, "3d-11-sabotage")
	return true


static func _run_endshot(m) -> void:
	m._finish_meeting(m.sim)
	m.sim.meeting = {}
	if m.sim.open_meeting_kind(m.SimStateScript.MEET_DAY, -1, -1):
		m.sim.meeting["phase"] = "vote"
		m.sim.meeting["votes"] = {}
		m.sim.cast_vote(0, 2)
		m.sim.cast_vote(1, 2)
		m.sim.cast_vote(2, -1)
		m.sim.cast_vote(3, 5)
		m.sim._close_meeting()
	m.sim.meeting = {}
	var alien_i := -1
	var humans: Array = []
	for a: Dictionary in m.sim.agents:
		if bool(a.get("alien", false)) and alien_i < 0:
			alien_i = int(a.get("i", -1))
		elif not bool(a.get("alien", false)):
			humans.append(int(a.get("i", -1)))
	if alien_i >= 0 and humans.size() >= 2:
		var k: Dictionary = m.sim.agent(alien_i)
		k["alive"] = true
		k["downed"] = false
		k["knife"] = 2
		var h1: Dictionary = m.sim.agent(int(humans[0]))
		h1["alive"] = true
		h1["downed"] = false
		h1["pos"] = m.sim.room_center("bridge")
		m.sim.knife(alien_i, int(humans[0]))
		m.sim.die(h1)
		var h2: Dictionary = m.sim.agent(int(humans[1]))
		h2["alive"] = true
		h2["downed"] = false
		h2["pos"] = m.sim.room_center("engine")
		m.sim.knife(alien_i, int(humans[1]))
		m.sim.die(h2)
	m.sim.over = true
	m.sim.over_win = true
	m.sim.over_why = "异形全部出局"
	m._show_end()
	await m.get_tree().create_timer(0.6).timeout
	await RenderingServer.frame_post_draw
	var path := "user://end.png"
	m.get_viewport().get_texture().get_image().save_png(path)
	print("ENDSHOT_PATH=", ProjectSettings.globalize_path(path))


static func _run_meetshot(m) -> void:
	m._finish_meeting(m.sim)
	var alien := {}
	var victim := {}
	for a: Dictionary in m.sim.agents:
		if bool(a.get("alien", false)) and alien.is_empty():
			alien = a
		elif not bool(a.get("alien", false)) and int(a.get("i", -1)) != int(m.sim.me_idx) and victim.is_empty():
			victim = a
	if alien.is_empty() or victim.is_empty():
		print("MEETSHOT FAIL no alien/victim")
		return
	m.sim.knife(int(alien.get("i", -1)), int(victim.get("i", -1)))
	m.sim.open_meeting(int(m.sim.me_idx), int(victim.get("i", -1)))
	m._refresh_meeting_ui()
	await m.get_tree().process_frame
	var a2 := OS.get_cmdline_user_args()
	if a2.has("--meetresult"):
		m.sim.skip_discussion()
		m.sim.tick(0.01)
		for k in 80:
			if String(m.sim.meeting.get("phase", "")) == "result":
				break
			m.sim.tick(0.1)
	elif a2.has("--meetvote"):
		m.sim.skip_discussion()
		m.sim.tick(0.01)
	else:
		for k in 90:
			if String(m.sim.meeting.get("phase", "")) != "discuss":
				break
			m.sim.tick(0.1)
	await m.get_tree().create_timer(0.6).timeout
	await RenderingServer.frame_post_draw
	var path := "user://meeting.png"
	m.get_viewport().get_texture().get_image().save_png(path)
	print("MEETSHOT_PATH=", ProjectSettings.globalize_path(path))


static func _run_simdiff(m, file_path: String) -> void:
	var abs_p := ProjectSettings.globalize_path(file_path) if file_path.begins_with("res://") else file_path
	var f := FileAccess.open(abs_p, FileAccess.READ)
	if f == null:
		print("SIMDIFF FAIL 打不开 " + abs_p)
		return
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if not (parsed is Dictionary):
		print("SIMDIFF FAIL JSON 解析失败")
		return
	var d := parsed as Dictionary
	var seed_val := int(d.get("seed", 20261108))
	var dt := float(d.get("dt", 0.1))
	var max_nights := int(d.get("max_nights", 15))
	var js_events: Array = d.get("events", []) as Array

	var s = m.SimStateScript.new()
	if not s.new_game(seed_val, 0, m.map_data, m.space):
		print("SIMDIFF FAIL 3D 开局失败")
		return
	for k in 40000:
		if bool(s.over) or int(s.night) > max_nights:
			break
		s.tick(dt)

	var js_kinds: Dictionary = {}
	var gd_kinds: Dictionary = {}
	var js_fields: Dictionary = {}
	var gd_fields: Dictionary = {}
	for e: Dictionary in js_events:
		js_kinds[String(e.get("kind", ""))] = true
		for k: String in e.keys():
			js_fields[k] = true
	for e2: Dictionary in s.events:
		gd_kinds[String(e2.get("kind", ""))] = true
		for k2: String in e2.keys():
			gd_fields[k2] = true
	var only_js: Array = []
	var only_gd: Array = []
	for k3: String in js_kinds.keys():
		if not gd_kinds.has(k3):
			only_js.append(k3)
	for k4: String in gd_kinds.keys():
		if not js_kinds.has(k4):
			only_gd.append(k4)
	only_js.sort()
	only_gd.sort()
	var missing_fields: Array = []
	for k5: String in js_fields.keys():
		if not gd_fields.has(k5):
			missing_fields.append(k5)
	var first_diff := -1
	var n := mini(js_events.size(), s.events.size())
	for i in n:
		var a := String((js_events[i] as Dictionary).get("kind", ""))
		var b := String((s.events[i] as Dictionary).get("kind", ""))
		if a != b:
			first_diff = i
			break
	if first_diff < 0 and js_events.size() != s.events.size():
		first_diff = n
	print("SIMDIFF seed=%d dt=%.2f maxNights=%d · 2.5D %d 条 / 3D %d 条" % [
		seed_val, dt, max_nights, js_events.size(), s.events.size()])
	print("  信封字段 2.5D=%d 3D=%d · 3D 缺字段：%s" % [
		js_fields.size(), gd_fields.size(), ", ".join(missing_fields) if not missing_fields.is_empty() else "无"])
	print("  kind 2.5D=%d 3D=%d · 2.5D 独有：%s · 3D 独有：%s" % [
		js_kinds.size(), gd_kinds.size(),
		", ".join(only_js) if not only_js.is_empty() else "无",
		", ".join(only_gd) if not only_gd.is_empty() else "无"])
	print("  kind 序列首个分歧：第 %d 条（逐条不同是预期，两套独立实现）" % first_diff)
	print("  结局 2.5D=%s / 3D=%s（%s）" % [String(d.get("winner", "?")),
		"人类" if bool(s.over_win) else "异形", String(s.over_why)])
	var report := "# 同 seed 对照（%d）\n\n" % seed_val
	report += "- 2.5D：`tools/simdump.cjs` → %d 条事件；3D：`--simdiff` → %d 条事件。\n" % [js_events.size(), s.events.size()]
	report += "- 信封字段：2.5D %d 个 / 3D %d 个；3D 缺 %s。\n" % [
		js_fields.size(), gd_fields.size(), ", ".join(missing_fields) if not missing_fields.is_empty() else "无"]
	report += "- kind：2.5D %d / 3D %d；2.5D 独有 %s；3D 独有 %s。\n" % [
		js_kinds.size(), gd_kinds.size(),
		", ".join(only_js) if not only_js.is_empty() else "无",
		", ".join(only_gd) if not only_gd.is_empty() else "无"]
	report += "- kind 序列首个分歧：第 %d 条。**两套是独立实现，逐条对齐不是验收标准**；本夹具只卡契约漂移。\n" % first_diff
	var dir := DirAccess.open("res://")
	if dir != null and not dir.dir_exists("reports"):
		dir.make_dir("reports")
	var rf := FileAccess.open("res://reports/simdiff-%d.md" % seed_val, FileAccess.WRITE)
	if rf != null:
		rf.store_string(report)
		rf.close()
		print("SIMDIFF_REPORT=res://reports/simdiff-%d.md" % seed_val)


static func _run_sim1000(m) -> void:
	var games := 1000
	var garg: String = m._arg_value(OS.get_cmdline_user_args(), "--games")
	if garg != "":
		games = clampi(int(garg), 1, 1000)
	var max_nights := 15
	var max_ticks := 17250
	var human_wins := 0
	var alien_wins := 0
	var timeouts := 0
	var sum_chat := 0
	var sum_knife := 0
	var sum_meet := 0
	var sum_nights := 0.0
	var why_stat: Dictionary = {"维修 45 分达成": 0, "异形全部出局": 0, "人类全灭": 0, "超时": 0}
	var eject_all := 0
	var eject_alien := 0
	var eject_human := 0
	var sum_prog := 0.0
	var sum_alien_alive := 0.0
	var sum_human_alive := 0.0
	var sum_kill := 0
	var sum_revive := 0
	var timeout_humans := 0.0
	var diag: Dictionary = {}
	var ev_stat: Dictionary = {}
	var t0 := Time.get_ticks_msec()
	for g in games:
		var s = m.SimStateScript.new()
		s.sim_run = true
		if not s.new_game(20261108 + g, 0, m.map_data, m.space):
			continue
		s.spectator = true
		for k in max_ticks:
			if bool(s.over) or int(s.night) > max_nights:
				break
			s.tick(0.1)
		if not bool(s.over):
			timeouts += 1
			why_stat["超时"] = int(why_stat.get("超时", 0)) + 1
		elif bool(s.over_win):
			human_wins += 1
		else:
			alien_wins += 1
		var win_why := String(s.over_why)
		if why_stat.has(win_why):
			why_stat[win_why] = int(why_stat.get(win_why, 0)) + 1
		sum_nights += float(s.night)
		sum_prog += float(s.prog)
		var aa := 0
		for a: Dictionary in s.agents:
			if bool(a.get("alien", false)) and bool(a.get("alive", false)):
				aa += 1
			if bool(a.get("alien", false)):
				diag["hides"] = int(diag.get("hides", 0)) + int(a.get("_hides", 0))
		sum_alien_alive += float(aa)
		var ha := 0
		for a2: Dictionary in s.agents:
			if not bool(a2.get("alien", false)) and bool(a2.get("alive", false)):
				ha += 1
		sum_human_alive += float(ha)
		if not bool(s.over):
			timeout_humans += float(ha)
		if s._ai_alien != null:
			for k: String in s._ai_alien.stats.keys():
				diag[k] = int(diag.get(k, 0)) + int(s._ai_alien.stats[k])
		for e: Dictionary in s.events:
			var k := String(e.get("kind", ""))
			ev_stat[k] = int(ev_stat.get(k, 0)) + 1
			if k == "chat":
				sum_chat += 1
			elif k == "knife":
				sum_knife += 1
			elif k == "meeting":
				sum_meet += 1
			elif k == "kill":
				sum_kill += 1
			elif k == "revive":
				sum_revive += 1
			elif k == "eject":
				eject_all += 1
				if bool(e.get("alien", false)):
					eject_alien += 1
				else:
					eject_human += 1
	var sec := (Time.get_ticks_msec() - t0) / 1000.0
	var hr := 100.0 * float(human_wins) / float(games)
	var ar := 100.0 * float(alien_wins) / float(games)
	print("SIM1000 人类 %.1f%% / 异形 %.1f%% / 超时 %d · 平均夜 %.2f · 场均 发言 %.1f 刀 %.1f 会 %.1f · 用时 %.1fs" % [
		hr, ar, timeouts, sum_nights / float(games),
		float(sum_chat) / float(games), float(sum_knife) / float(games),
		float(sum_meet) / float(games), sec])
	print("SIM1000 败因：维修 %d / 异形出局 %d / 人类全灭 %d / 超时 %d · 驱逐 %d（异形 %d / 人类 %d，命中率 %.1f%%） · 末进度 %.1f / 存活异形 %.2f" % [
		int(why_stat.get("维修 45 分达成", 0)), int(why_stat.get("异形全部出局", 0)),
		int(why_stat.get("人类全灭", 0)), int(why_stat.get("超时", 0)),
		eject_all, eject_alien, eject_human,
		(100.0 * float(eject_alien) / float(eject_all)) if eject_all > 0 else 0.0,
		sum_prog / float(games), sum_alien_alive / float(games)])
	print("SIM1000 存活：人类 %.2f / 异形 %.2f · 死亡 %d / 救起 %d · 超时局人类 %.2f · 异形决策 %s" % [
		sum_human_alive / float(games), sum_alien_alive / float(games),
		sum_kill, sum_revive,
		timeout_humans / float(maxi(1, timeouts)), str(diag)])
	var report := "# 3D 批量模拟基线（%s）\n\n" % Time.get_datetime_string_from_system()
	report += "- 引擎：Godot 4.6 / `scripts/sim/sim_state.gd`，seed 20261108 起 %d 局，dt=0.1，上限 %d 夜（%d tick，2.5D simGame 口径）。\n" % [games, max_nights, max_ticks]
	report += "- **人类 %.1f%% / 异形 %.1f%% / 超时 %d**（n=%d）。2.5D 同口径读数只认 CHANGELOG 最新批次；3D 剩余偏差见 `HANDOFF.md` §0.4 与 `spec/mapping-layers.json#parity_budget`。\n" % [hr, ar, timeouts, games]
	report += "- 平均夜 %.2f；场均发言 %.1f 条 / 出刀 %.1f 次 / 会议 %.1f 次 / 末进度 %.1f。\n" % [
		sum_nights / float(games), float(sum_chat) / float(games),
		float(sum_knife) / float(games), float(sum_meet) / float(games),
		sum_prog / float(games)]
	report += "- 败因：维修 %d / 异形全部出局 %d / 人类全灭 %d / 超时 %d。\n" % [
		int(why_stat.get("维修 45 分达成", 0)), int(why_stat.get("异形全部出局", 0)),
		int(why_stat.get("人类全灭", 0)), int(why_stat.get("超时", 0))]
	report += "- 驱逐 %d 次（异形 %d / 人类 %d，命中率 %.1f%%），末局存活异形 %.2f。\n" % [
		eject_all, eject_alien, eject_human,
		(100.0 * float(eject_alien) / float(eject_all)) if eject_all > 0 else 0.0,
		sum_alien_alive / float(games)]
	report += "- 存活：人类 %.2f / 异形 %.2f；死亡 %d / 救起 %d；超时局人类 %.2f。\n" % [
		sum_human_alive / float(games), sum_alien_alive / float(games), sum_kill, sum_revive,
		timeout_humans / float(maxi(1, timeouts))]
	report += "- 异形决策遥测：`%s`。\n" % str(diag)
	report += "- 行动事件（%d 局合计）：`%s`。\n" % [games, str(ev_stat)]
	report += "- 用时 %.1f 秒。发言 S 轨已接入，讨论段按 `MEET.discussNight` 真实推进。\n" % sec
	var dir := DirAccess.open("res://")
	if dir != null and not dir.dir_exists("reports"):
		dir.make_dir("reports")
	var rname := "3d-sim1000.md" if games == 1000 else "3d-simbatch-%d.md" % games
	var f := FileAccess.open("res://reports/" + rname, FileAccess.WRITE)
	if f != null:
		f.store_string(report)
		f.close()
		print("SIM1000_REPORT=res://reports/" + rname)


static func _run_ceilshot(m, room_id: String) -> void:
	m._finish_meeting(m.sim)
	var rect := Rect2(0, 0, 8, 8)
	for r: Dictionary in m.map_data.get("rooms", []):
		if String(r.get("id", "")) != room_id:
			continue
		var a: Array = r.get("rect", [0, 0, 8, 8])
		rect = Rect2(float(a[0]), float(a[1]), float(a[2]), float(a[3]))
		break
	var c := Vector3(rect.position.x + rect.size.x * 0.5, 0.0, rect.position.y + rect.size.y * 0.5)
	var cam := Camera3D.new()
	m.add_child(cam)
	cam.position = Vector3(c.x, 1.35, c.z + rect.size.y * 0.30)
	cam.look_at(Vector3(c.x - rect.size.x * 0.18, 3.05, c.z - rect.size.y * 0.18), Vector3.UP)
	cam.fov = 82.0
	cam.near = 0.05
	cam.far = 300.0
	cam.current = true
	await m.get_tree().create_timer(1.4).timeout
	await RenderingServer.frame_post_draw
	var image: Image = m.get_viewport().get_texture().get_image()
	var dir := ProjectSettings.globalize_path("res://screenshots")
	DirAccess.make_dir_recursive_absolute(dir)
	var path := dir.path_join("ceil-%s.png" % room_id)
	image.save_png(path)
	print("COVERSHOT_PATH=", path)


static func _run_covershot(m, room_id: String, eye: bool = false) -> void:
	var rect := Rect2(0, 0, 8, 8)
	for r: Dictionary in m.map_data.get("rooms", []):
		if String(r.get("id", "")) != room_id:
			continue
		var a: Array = r.get("rect", [0, 0, 8, 8])
		rect = Rect2(float(a[0]), float(a[1]), float(a[2]), float(a[3]))
		break
	var c := Vector3(rect.position.x + rect.size.x * 0.5, 0.0, rect.position.y + rect.size.y * 0.5)
	var cam := Camera3D.new()
	m.add_child(cam)
	if eye:
		cam.position = Vector3(c.x, 1.62, c.z + rect.size.y * 0.5 - 1.2)
		cam.look_at(Vector3(c.x, 1.55, c.z - rect.size.y * 0.35), Vector3.UP)
	else:
		cam.position = Vector3(c.x, 2.2, c.z + rect.size.y * 0.5 - 1.2)
		cam.look_at(Vector3(c.x, 1.0, c.z - rect.size.y * 0.15), Vector3.UP)
	cam.fov = 72.0
	cam.near = 0.05
	cam.far = 300.0
	cam.current = true
	await m.get_tree().create_timer(1.4).timeout
	await RenderingServer.frame_post_draw
	var image: Image = m.get_viewport().get_texture().get_image()
	var dir := ProjectSettings.globalize_path("res://screenshots")
	DirAccess.make_dir_recursive_absolute(dir)
	var stem := ("covers-eye-%s.png" if eye else "covers-%s.png") % room_id
	var path := dir.path_join(stem)
	image.save_png(path)
	print("COVERSHOT_PATH=", path)
