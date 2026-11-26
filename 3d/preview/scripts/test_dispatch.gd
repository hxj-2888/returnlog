extends RefCounted

## 自测与命令行分发控制器（从 main.gd 拆出）。
## 负责解析用户命令行参数、执行门禁测试 / 截图，并提供测试通用辅助入口。

const SpaceData := preload("res://scripts/space_data.gd")
const TestFixture := preload("res://scripts/tests/test_fixture.gd")
const TestSim := preload("res://scripts/tests/test_sim.gd")
const TestCombat := preload("res://scripts/tests/test_combat.gd")
const TestSocial := preload("res://scripts/tests/test_social.gd")
const TestUI := preload("res://scripts/tests/test_ui.gd")
const TestWorld := preload("res://scripts/tests/test_world.gd")
const TestVisual := preload("res://scripts/tests/test_visual_runner.gd")


static func arg_value(args: PackedStringArray, key: String) -> String:
	for i in args.size():
		var a := String(args[i])
		if a == key and i + 1 < args.size():
			return String(args[i + 1])
		if a.begins_with(key + "="):
			return a.substr(key.length() + 1)
	return ""


static func has_screenshot_arg(args: PackedStringArray) -> bool:
	for a in args:
		if a in ["--shot", "--crewshot", "--doorshot", "--mgshot", "--devshot",
				"--covershot", "--ceilshot", "--pipeshot", "--meetshot",
				"--endshot", "--minishot", "--homeshot", "--reel"]:
			return true
	return false


static func has_gate_arg(args: PackedStringArray) -> bool:
	for a in args:
		if a.begins_with("--") and a != "--seed" \
				and a != "--homeshot" and a != "--hometest" \
				and a != "--crew-model" and a != "--crew-billboard":
			return true
	return false


static func print_devicelist(m) -> void:
	for i in m.extras.devices.size():
		var d = m.extras.devices[i]
		print("DEV %02d %s at %s kind=%s" % [i, d.task_label, str(d.global_position), d.kind])
	m.get_tree().quit()


static func dispatch_early_shots(m, args: PackedStringArray) -> bool:
	if args.has("--crewshot"):
		await TestVisual._run_crewshot(m)
		m.get_tree().quit()
		return true
	if args.has("--doorshot"):
		await TestVisual._run_doorshot(m)
		m.get_tree().quit()
		return true
	return false


static func dispatch(m, args: PackedStringArray) -> void:
	if await _dispatch_home_and_sim(m, args):
		return
	if await _dispatch_world_and_ui(m, args):
		return
	await _dispatch_shots(m, args)


static func _dispatch_home_and_sim(m, args: PackedStringArray) -> bool:
	if args.has("--homeshot") and DisplayServer.get_name() != "headless":
		await m.get_tree().create_timer(0.7).timeout
		await RenderingServer.frame_post_draw
		var img: Image = m.get_viewport().get_texture().get_image()
		var hp := "user://home.png"
		img.save_png(hp)
		print("HOMESHOT_PATH=", ProjectSettings.globalize_path(hp))
		m.get_tree().quit()
		return true
	if args.has("--hometest"):
		m.get_tree().quit(0 if TestUI._run_hometest(m) else 1)
		return true
	if args.has("--roletest"):
		var role_ok: bool = await TestSim._run_roletest(m)
		m.get_tree().quit(0 if role_ok else 1)
		return true
	if args.has("--bottest"):
		m.get_tree().quit(0 if TestCombat._run_bottest(m) else 1)
		return true
	if args.has("--b4test"):
		m.get_tree().quit(0 if TestCombat._run_b4test(m) else 1)
		return true
	if args.has("--speechtest"):
		m.get_tree().quit(0 if TestSocial._run_speechtest(m) else 1)
		return true
	if args.has("--b6test"):
		m.get_tree().quit(0 if TestCombat._run_b6test(m) else 1)
		return true
	if args.has("--sim1000"):
		TestVisual._run_sim1000(m)
		m.get_tree().quit()
		return true
	var simdiff := arg_value(args, "--simdiff")
	if simdiff != "":
		TestVisual._run_simdiff(m, simdiff)
		m.get_tree().quit()
		return true
	if args.has("--bench") or args.has("--bench-all"):
		await TestVisual._run_bench(m)
		return true
	if args.has("--navtest"):
		m.get_tree().quit(0 if TestSim._run_navtest(m) else 1)
		return true
	if args.has("--aittest"):
		m.get_tree().quit(0 if TestSim._run_aittest(m) else 1)
		return true
	if args.has("--meetingtest"):
		m.get_tree().quit(0 if TestSocial._run_meetingtest(m) else 1)
		return true
	if args.has("--simtest"):
		m.get_tree().quit(0 if TestSim._run_simtest(m) else 1)
		return true
	if args.has("--taskflowtest"):
		var flow_ok: bool = await TestSim._run_taskflowtest(m)
		m.get_tree().quit(0 if flow_ok else 1)
		return true
	if args.has("--actiontest"):
		m.get_tree().quit(0 if TestSim._run_actiontest(m) else 1)
		return true
	if args.has("--abilitytest"):
		var ability_ok: bool = await TestSim._run_abilitytest(m)
		m.get_tree().quit(0 if ability_ok else 1)
		return true
	if args.has("--parityfixture"):
		m.get_tree().quit(0 if TestFixture._run_parity_fixture(m) else 1)
		return true
	if args.has("--invtest"):
		m.get_tree().quit(0 if TestFixture._run_invtest(m) else 1)
		return true
	if args.has("--dragtest"):
		m.get_tree().quit(0 if TestFixture._run_dragtest(m) else 1)
		return true
	if args.has("--meetopentest"):
		m.get_tree().quit(0 if TestSocial._run_meetopentest(m) else 1)
		return true
	if args.has("--knifebottest"):
		m.get_tree().quit(0 if TestFixture._run_knifebottest(m) else 1)
		return true
	return false


static func _dispatch_world_and_ui(m, args: PackedStringArray) -> bool:
	if args.has("--arttest"):
		TestWorld._run_arttest(m)
		m.get_tree().quit()
		return true
	if args.has("--powertest"):
		await TestWorld._run_powertest(m)
		m.get_tree().quit()
		return true
	if args.has("--interacttest"):
		await TestSim._run_interacttest(m)
		m.get_tree().quit()
		return true
	if args.has("--study"):
		var study_ok: bool = await TestVisual._run_study(m)
		m.get_tree().quit(0 if study_ok else 1)
		return true
	if args.has("--floortest"):
		TestWorld._run_floortest(m)
		m.get_tree().quit()
		return true
	if args.has("--tasktest"):
		TestSim._run_tasktest(m)
		m.get_tree().quit()
		return true
	if args.has("--reachtest"):
		TestSim._run_reachtest(m)
		m.get_tree().quit()
		return true
	if args.has("--audiotest"):
		TestWorld._run_audiotest(m)
		m.get_tree().quit()
		return true
	if args.has("--mgtest"):
		await TestUI._run_mgtest(m)
		m.get_tree().quit(0 if m._mgtest_ok else 1)
		return true
	if args.has("--specttest"):
		await TestUI._run_specttest(m)
		m.get_tree().quit(0 if m._specttest_ok else 1)
		return true
	if args.has("--knifetest"):
		await TestCombat._run_knifetest(m)
		m.get_tree().quit(0 if m._knifetest_ok else 1)
		return true
	if args.has("--probetest"):
		await TestWorld._run_probetest(m)
		m.get_tree().quit(0 if m._probetest_ok else 1)
		return true
	if args.has("--crewanimtest"):
		m.get_tree().quit(0 if TestWorld._run_crewanimtest(m) else 1)
		return true
	if args.has("--uitest"):
		await TestUI._run_uitest(m)
		m.get_tree().quit(0 if m._uitest_ok else 1)
		return true
	if args.has("--meetuitest"):
		await TestUI._run_meetuitest(m)
		m.get_tree().quit(0 if m._meetuitest_ok else 1)
		return true
	if args.has("--aiporttest"):
		TestWorld._run_aiporttest(m)
		m.get_tree().quit(0 if m._aiporttest_ok else 1)
		return true
	if args.has("--mousetest"):
		await TestUI._run_mousetest(m)
		m.get_tree().quit(0 if m._mousetest_ok else 1)
		return true
	if args.has("--settletest"):
		TestUI._run_settletest(m)
		m.get_tree().quit(0 if m._settletest_ok else 1)
		return true
	if args.has("--minimaptest"):
		await TestUI._run_minimaptest(m)
		m.get_tree().quit(0 if m._minimaptest_ok else 1)
		return true
	if args.has("--socialtest"):
		TestSocial._run_socialtest(m)
		m.get_tree().quit(0 if m._socialtest_ok else 1)
		return true
	if args.has("--leadtest"):
		await TestSocial._run_leadtest(m)
		m.get_tree().quit(0 if m._leadtest_ok else 1)
		return true
	if args.has("--devicetest"):
		await TestWorld._run_devicetest(m)
		m.get_tree().quit(0 if m._devicetest_ok else 1)
		return true
	if args.has("--walktest"):
		await run_walktest(m)
		return true
	return false


static func run_walktest(m) -> void:
	finish_meeting(m.sim)
	await m.get_tree().create_timer(0.4).timeout
	var start: Vector3 = m.player.global_position
	var down := InputEventKey.new()
	down.physical_keycode = KEY_W
	down.pressed = true
	Input.parse_input_event(down)
	await m.get_tree().create_timer(1.0).timeout
	var up := InputEventKey.new()
	up.physical_keycode = KEY_W
	up.pressed = false
	Input.parse_input_event(up)
	var finish: Vector3 = m.player.global_position
	var dist := start.distance_to(finish)
	var want := SpaceData.num(m.space, "move", "speed")
	var ok := dist > 0.05 and dist <= want * 1.0 + 0.35
	print("WALK_TEST distance=", dist, " 期望≤", want, "m/1.0s",
		" ui_locked=", m.player.ui_locked, " start=", start, " end=", finish)
	print("WALKTEST ", "OK" if ok else "FAIL", " 1/1" if ok else " 0/1")
	m.get_tree().quit(0 if ok else 1)


static func _dispatch_shots(m, args: PackedStringArray) -> void:
	if args.has("--e2e"):
		await TestVisual._run_e2e(m)
		m.get_tree().quit()
		return
	if args.has("--pipeshot"):
		await TestVisual._run_pipeshot(m)
		m.get_tree().quit()
		return
	var devshot := arg_value(args, "--devshot")
	if devshot != "":
		await TestVisual._run_devshot(m, devshot)
		m.get_tree().quit()
		return
	var shot_kind := arg_value(args, "--mgshot")
	if shot_kind != "":
		await TestVisual._run_mgshot(m, shot_kind)
		m.get_tree().quit()
		return
	if DisplayServer.get_name() == "headless":
		return
	var cover_room := arg_value(args, "--covershot")
	if cover_room != "":
		await TestVisual._run_covershot(m, cover_room, false)
		m.get_tree().quit()
		return
	var eye_room := arg_value(args, "--eyeshot")
	if eye_room != "":
		await TestVisual._run_covershot(m, eye_room, true)
		m.get_tree().quit()
		return
	var ceil_room := arg_value(args, "--ceilshot")
	if ceil_room != "":
		await TestVisual._run_ceilshot(m, ceil_room)
		m.get_tree().quit()
		return
	if args.has("--meetshot"):
		await TestVisual._run_meetshot(m)
		m.get_tree().quit()
		return
	if args.has("--endshot"):
		await TestVisual._run_endshot(m)
		m.get_tree().quit()
		return
	if args.has("--minishot"):
		finish_meeting(m.sim)
		m.sim.meeting = {}
		await m.get_tree().create_timer(0.7).timeout
		await RenderingServer.frame_post_draw
		var mimg: Image = m.get_viewport().get_texture().get_image()
		var mpath := "user://mini.png"
		mimg.save_png(mpath)
		print("MINISHOT_PATH=", ProjectSettings.globalize_path(mpath))
		m.get_tree().quit()
		return
	if args.has("--shot"):
		await _run_shot(m, args)


static func _run_shot(m, args: PackedStringArray) -> void:
	if args.has("--blackout"):
		finish_meeting(m.sim)
		m.set_power(false)
	if args.has("--dev") and m.sim != null:
		m.sim.dev = true
	if args.has("--above") and m.player != null:
		finish_meeting(m.sim)
		m.player.spectator = true
		m.player.global_position.y = m.builder.ceiling_height() + 11.0
		m._update_spectator_view()
	var wait_sec := 2.5
	var wait_arg := arg_value(args, "--wait")
	if wait_arg != "":
		wait_sec = maxf(0.2, float(wait_arg))
	await m.get_tree().create_timer(wait_sec).timeout
	await RenderingServer.frame_post_draw
	var image: Image = m.get_viewport().get_texture().get_image()
	var shot_name := "preview-corridor.png" if args.has("--corridor") else "preview.png"
	if args.has("--blackout"):
		shot_name = shot_name.replace(".png", "-blackout.png")
	var path := "user://" + shot_name
	image.save_png(path)
	print("SHOT_PATH=", ProjectSettings.globalize_path(path))
	m.get_tree().quit()


static func tap_key(m, key: Key) -> void:
	var d := InputEventKey.new()
	d.keycode = key
	d.physical_keycode = key
	d.pressed = true
	Input.parse_input_event(d)
	await m.get_tree().process_frame
	await m.get_tree().process_frame
	var u := InputEventKey.new()
	u.keycode = key
	u.physical_keycode = key
	u.pressed = false
	Input.parse_input_event(u)
	await m.get_tree().process_frame


static func tap_mouse(m, btn: MouseButton) -> void:
	var d := InputEventMouseButton.new()
	d.button_index = btn
	d.pressed = true
	Input.parse_input_event(d)
	await m.get_tree().process_frame
	var u := InputEventMouseButton.new()
	u.button_index = btn
	u.pressed = false
	Input.parse_input_event(u)
	await m.get_tree().process_frame


static func click_ctrl(m, b: Control) -> bool:
	if b == null or not b.is_visible_in_tree():
		return false
	var r: Rect2 = b.get_global_rect()
	var vp: Vector2 = m.get_viewport().get_visible_rect().size
	if r.size.y <= 0.0 or r.position.x < 0.0 or r.end.x > vp.x + 0.5 \
			or r.position.y < 0.0 or r.end.y > vp.y + 0.5:
		return false
	var c := r.get_center()
	var mv := InputEventMouseMotion.new()
	mv.position = c
	Input.parse_input_event(mv)
	var dn := InputEventMouseButton.new()
	dn.button_index = MOUSE_BUTTON_LEFT
	dn.pressed = true
	dn.position = c
	Input.parse_input_event(dn)
	var up := InputEventMouseButton.new()
	up.button_index = MOUSE_BUTTON_LEFT
	up.pressed = false
	up.position = c
	Input.parse_input_event(up)
	return true


static func press_escape() -> void:
	var e := InputEventKey.new()
	e.keycode = KEY_ESCAPE
	e.physical_keycode = KEY_ESCAPE
	e.pressed = true
	Input.parse_input_event(e)
	var u := InputEventKey.new()
	u.keycode = KEY_ESCAPE
	u.physical_keycode = KEY_ESCAPE
	u.pressed = false
	Input.parse_input_event(u)


static func finish_meeting(s) -> void:
	if s == null:
		return
	var guard := 0
	while not s.meeting.is_empty() and guard < 1200:
		if String(s.meeting.get("phase", "")) == "discuss":
			s.skip_discussion()
		s.tick(0.1)
		guard += 1


static func ability_reset(m) -> int:
	m.sim.meeting = {}
	if m.wheel != null and m.wheel.is_open():
		m.wheel.close()
	m._close_info()
	if m.mg_layer != null and m.mg_layer.is_open():
		m.mg_layer.cancel()
	if m._pipe_open:
		m._close_pipe_ui()
	m.station = {}
	m._keys_down.clear()
	m._e_down = false
	m._knife_cd = 0.0
	m._shot_cd = 0.0
	m._pipe_cd = 0.0
	m.player.ui_locked = false
	m.mouse_released = false
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	var me0: Dictionary = m.sim.me()
	me0["alive"] = true
	me0["downed"] = false
	me0["detained"] = false
	me0["drag"] = -1
	me0["knife"] = 1
	me0["bullet"] = 2
	me0["medkit"] = 1
	me0["sabUsed"] = false
	me0["ghost"] = false
	m.player.global_position = Vector3(31.0, 0.05, 33.5)
	m.player.rotation.y = 0.0
	var body_i := -1
	for a: Dictionary in m.sim.agents:
		if int(a.get("i", -1)) == int(m.sim.me_idx):
			continue
		a["pos"] = Vector2(6.0, 6.0)
		a["path"] = PackedVector2Array()
		a["moving"] = false
		a["doing"] = 0.0
		a["alive"] = true
		a["downed"] = false
		a["detained"] = false
		a["drag"] = -1
		a["draggedBy"] = -1
		a["bodyGone"] = false
		a["bodyReported"] = false
		a["searched"] = false
		a["bodyPos"] = Vector2(6.0, 6.0)
		if body_i < 0 and not bool(a.get("alien", false)):
			body_i = int(a.get("i", -1))
	if body_i < 0:
		return -1
	var body: Dictionary = m.sim.agent(body_i)
	var bp := Vector2(31.0, 34.0)
	body["alive"] = false
	body["downed"] = false
	body["pos"] = bp
	body["bodyPos"] = bp
	return body_i
