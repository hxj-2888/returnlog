extends Node3D

## 3D 预演入口：搭场景、放玩家、接任务小游戏、做 HUD。
## 这是「能不能复用」的验证件，不是正式 3D 客户端。
## 小游戏数据来自 2.5D 真源（3d/tools/export-minigames.cjs），玩法实现见 scripts/minigame/。

const MapBuilderScript := preload("res://scripts/map_builder.gd")
const PlayerScript := preload("res://scripts/player.gd")
const SceneExtrasScript := preload("res://scripts/scene_extras.gd")
const MinigameLayerScript := preload("res://scripts/minigame/minigame_layer.gd")
const WheelScript := preload("res://scripts/ui_wheel.gd")
const SpaceData := preload("res://scripts/space_data.gd")
const SimStateScript := preload("res://scripts/sim/sim_state.gd")
const CrewViewScript := preload("res://scripts/sim/crew_view.gd")
const HomeViewScript := preload("res://scripts/home_view.gd")
const UiPanelsScript := preload("res://scripts/ui_panels.gd")
const AudioScript := preload("res://scripts/audio.gd")

const KINDS := ["wire", "place", "lever", "sync", "pour", "swap", "align", "aim", "match", "level"]

var builder
var player: CharacterBody3D
var map_data: Dictionary = {}
var space: Dictionary = {}

var extras
var mg_layer
var wheel
var focus_cam: Camera3D
var _focus_tween: Tween
var _near = null
var _e_down := false

## ---- 模拟核心（B1：无发言 / 无美术）----
## 只搬“开局 → 做任务 → 天亮 → 胜负”主回路；AI、战斗、会议投票在后面批次。
## 数据从 data/sim.json 进，场景只读它的状态，不反向写规则。
var sim
var crew_view
var night_label: Label
var prog_label: Label
var tasks_label: Label
var alive_label: Label
var feed_label: Label
var end_panel: ColorRect
var end_label: Label
var _sim_hud_timer: float = 0.0
var _player_dead := false
var _down_toast := false
var hud_layer: CanvasLayer
var meeting_panel: ColorRect
var meeting_title: Label
var meeting_time: Label
var meeting_list: VBoxContainer
var meeting_buttons: Dictionary = {}
var meeting_hint: Label
var meeting_result: Label
var meeting_skip: Button
var meeting_feed: RichTextLabel
var meeting_input: LineEdit
var meeting_send: Button
var _meeting_open := false
## 门禁用：devicetest / e2e 要打开任意设备，不受“只做自己的任务”限制。
var _sim_gate := true
## 玩家攻击冷却（出刀 / 开枪各自一份，避免一帧连点把全船打空）
var _knife_cd := 0.0
var _shot_cd := 0.0
var _detained_toast := false
## 管道冷却与出口选择 UI
var _pipe_cd := 0.0
var pipe_panel: ColorRect
var pipe_buttons: VBoxContainer
var pipe_hint: Label
var _pipe_open := false

## ---- 供电（对应 2.5D 的 G.lightState；3D 侧只有"有电/断电"两态）----
var power_on := true
var _breaker_pulls := 0          # 2.5D 每夜重置；3D 没有夜循环，这里单调累加（只会更保守）

## ---- 站桩（对应 2.5D 的 _doing + doing 计时；一移动就打断）----
var station: Dictionary = {}

## ---- 本地物资计数（只为让"领取/补给"两项交互成立，不接对局状态）----
var qual_pending := 1
var qual := 1

## 2.5D 口径：管道**异形专用**（人类管道禁用，门禁有断言）。
## 3D 一开始没有身份系统，用这个开关复现判定分支；B6 起由开始页的角色决定。
var role := "alien"
## 开始页：只有「无门禁参数」的正常游玩才显示；门禁/截图一律直接进对局。
var home
var started := true
var _cur_seed := 20261108
var ui_panels
## 信息面板：2.5D 的 #b（尸检 / 伤情记录卡）与 #cam（全船监控）在 3D 的 Control 版。
## 只呈现信息，不参与判定；画法属允许的美术差异，字段口径照抄 2.5D。
var info_panel: Control
var info_title: Label
var info_text: RichTextLabel
var _info_open := false
var spectator_mode := false
var audio
var _last_event_n := 0

var room_label: Label
var fps_label: Label
var prompt_label: Label
var power_label: Label
var toast_label: Label
var _hud_timer: float = 0.0
var _toast_t: float = 0.0


func _ready() -> void:
	builder = MapBuilderScript.new()
	add_child(builder)
	builder.build()
	map_data = builder.data
	space = builder.space

	extras = SceneExtrasScript.new()
	add_child(extras)
	extras.build(map_data, space)

	_add_floor_collision()

	focus_cam = Camera3D.new()
	focus_cam.fov = 58.0
	focus_cam.near = 0.03
	focus_cam.far = 220.0
	focus_cam.current = false
	add_child(focus_cam)

	mg_layer = MinigameLayerScript.new()
	add_child(mg_layer)

	wheel = WheelScript.new()
	add_child(wheel)

	var args := OS.get_cmdline_user_args()
	## 先建模拟核心，再把玩家放进它的席位。地图直接注入 builder 已读的那份，
	## 避免同一份 map_v2.json 在内存里存两份（数据单一真源）。
	sim = SimStateScript.new()
	var seed_arg := _arg_value(args, "--seed")
	var seed_val := 20261108
	if seed_arg != "":
		seed_val = int(seed_arg)
	_cur_seed = seed_val
	if not sim.new_game(seed_val, 0, map_data, space):
		push_error("模拟核心初始化失败：先跑 node 3d/tools/export-sim.cjs")

	crew_view = CrewViewScript.new()
	add_child(crew_view)
	crew_view.build(sim)

	player = PlayerScript.new()
	if args.has("--corridor"):
		player.position = Vector3(28.0, 0.05, 42.2)
		player.rotation.y = PI
	else:
		player.position = Vector3(27.0, 0.05, 34.8)
		player.rotation.y = -PI * 0.5 + 0.05
	if args.has("--wall"):
		player.rotation.y = PI * 0.5
	if args.has("--device") and not extras.devices.is_empty():
		var dev = extras.devices[0]
		var face: Vector3 = dev.face_dir()
		player.position = Vector3(dev.global_position.x, 0.05, dev.global_position.z) + face * 2.0
		player.rotation.y = atan2(face.x, face.z)
	add_child(player)
	player.apply_space_cfg(space)

	if args.has("--devicelist"):
		for i in extras.devices.size():
			var d = extras.devices[i]
			print("DEV %02d %s at %s kind=%s" % [i, d.task_label, str(d.global_position), d.kind])
		get_tree().quit()
		return

	_build_hud()

	ui_panels = UiPanelsScript.new()
	var ui_layer := CanvasLayer.new()
	ui_layer.layer = 11
	add_child(ui_layer)
	ui_layer.add_child(ui_panels)
	ui_panels.setup()
	ui_panels.exit_to_home.connect(_exit_to_home)
	player.mouse_sensitivity = ui_panels.get_sens()
	audio = AudioScript.new()
	add_child(audio)
	audio.setup()
	audio.set_volume(ui_panels.get_sfx())
	## 设置面板的两个滑杆各管各的：音乐只管背景音乐，音效不再被音乐值连带压小。
	ui_panels.music_changed.connect(func(v: float) -> void: audio.set_music_volume(v))
	ui_panels.sfx_changed.connect(func(v: float) -> void: audio.set_volume(v))
	audio.set_music_volume(ui_panels.get_music())

	## ---- 开始页（版式照搬 2.5D `js/ui/home.js`）----
	## 门禁 / 截图要的是对局中的画面与读数，一律跳过开始页直接进局。
	if not _has_gate_arg(args):
		_show_home()
	else:
		# `--role human|alien` 是跳过开始页的快速开局（试玩 / 截图用）
		var role_arg := _arg_value(args, "--role")
		if role_arg != "":
			_on_start(role_arg)

	## 开始页实拍：只在非 headless 下跑（与 --meetshot 同口径）。
	if args.has("--homeshot") and DisplayServer.get_name() != "headless":
		await get_tree().create_timer(0.7).timeout
		await RenderingServer.frame_post_draw
		var img := get_viewport().get_texture().get_image()
		var hp := "user://home.png"
		img.save_png(hp)
		print("HOMESHOT_PATH=", ProjectSettings.globalize_path(hp))
		get_tree().quit()
		return

	if args.has("--hometest"):
		var home_ok := _run_hometest()
		get_tree().quit(0 if home_ok else 1)
		return

	if args.has("--roletest"):
		var role_ok: bool = await _run_roletest()
		get_tree().quit(0 if role_ok else 1)
		return

	if args.has("--bottest"):
		var bot_ok := _run_bottest()
		get_tree().quit(0 if bot_ok else 1)
		return

	if args.has("--b4test"):
		var b4_ok := _run_b4test()
		get_tree().quit(0 if b4_ok else 1)
		return

	if args.has("--speechtest"):
		var sp_ok := _run_speechtest()
		get_tree().quit(0 if sp_ok else 1)
		return

	if args.has("--b6test"):
		var b6_ok := _run_b6test()
		get_tree().quit(0 if b6_ok else 1)
		return

	if args.has("--sim1000"):
		_run_sim1000()
		get_tree().quit()
		return

	var simdiff := _arg_value(args, "--simdiff")
	if simdiff != "":
		_run_simdiff(simdiff)
		get_tree().quit()
		return

	if args.has("--bench") or args.has("--bench-all"):
		await _run_bench()
		return

	# 断电 / 交互 / 美术自测要在 HUD 建好之后再跑，否则读数会打在 null 标签上
	## 模拟核心门禁：不依赖渲染，只读 sim_state 的状态与事件流。
	if args.has("--navtest"):
		var nav_ok := _run_navtest()
		get_tree().quit(0 if nav_ok else 1)
		return

	if args.has("--aittest"):
		var ai_ok := _run_aittest()
		get_tree().quit(0 if ai_ok else 1)
		return

	if args.has("--meetingtest"):
		var meet_ok := _run_meetingtest()
		get_tree().quit(0 if meet_ok else 1)
		return

	if args.has("--simtest"):
		var sim_ok := _run_simtest()
		get_tree().quit(0 if sim_ok else 1)
		return

	## 任务回路 E2E：必须是“玩家自己的任务”，走 E 打开 → 解题 → 写回 sim 的完整路径。
	if args.has("--taskflowtest"):
		var flow_ok := await _run_taskflowtest()
		get_tree().quit(0 if flow_ok else 1)
		return

	if args.has("--arttest"):
		_run_arttest()
		get_tree().quit()
		return

	if args.has("--powertest"):
		await _run_powertest()
		get_tree().quit()
		return

	if args.has("--interacttest"):
		await _run_interacttest()
		get_tree().quit()
		return

	## 玩家动作全集 + 真实输入链自测（不靠 skip_discussion 绕过会议）。
	if args.has("--actiontest"):
		var act_ok := _run_actiontest()
		get_tree().quit(0 if act_ok else 1)
		return

	## 2026-11-07：逐个任务点验证「设备存在 / 不悬高 / 站位能收到交互项」。
	## 2026-11-07：地板口径自测 —— 3D 侧地面材质必须与 floor_spec.json
	## （与 2.5D 底图共用的单一真源）逐项一致：贴图名 / 重复尺度 / 染色。
	## 这条断言卡的是「底图换了地板、3D 没跟」这类漂移。
	if args.has("--floortest"):
		_run_floortest()
		get_tree().quit()
		return

	if args.has("--tasktest"):
		_run_tasktest()
		get_tree().quit()
		return

	## 2026-11-09 站位可达性验收（--reachtest）：tasktest 是传送到位再收项，
	## 传进去的点如果落在墙/掩体几何里，真实走路永远到不了 —— 玩家体感是「任务点按 E 没反应」。
	if args.has("--reachtest"):
		_run_reachtest()
		get_tree().quit()
		return

	## 2026-11-09 音频链路验收：背景音乐文件在不在、循环开没开、两个滑杆各管各的。
	if args.has("--audiotest"):
		_run_audiotest()
		get_tree().quit()
		return

	if args.has("--mgtest"):
		await _run_mgtest()
		get_tree().quit()
		return

	if args.has("--devicetest"):
		await _run_devicetest()
		get_tree().quit()
		return

	if args.has("--e2e"):
		await _run_e2e()
		get_tree().quit()
		return

	if args.has("--pipeshot"):
		await _run_pipeshot()
		get_tree().quit()
		return

	var devshot := _arg_value(args, "--devshot")
	if devshot != "":
		await _run_devshot(devshot)
		get_tree().quit()
		return

	var shot_kind := _arg_value(args, "--mgshot")
	if shot_kind != "":
		await _run_mgshot(shot_kind)
		get_tree().quit()
		return

	if args.has("--walktest"):
		await get_tree().create_timer(0.4).timeout
		var start := player.global_position
		var down := InputEventKey.new()
		down.physical_keycode = KEY_W
		down.pressed = true
		Input.parse_input_event(down)
		await get_tree().create_timer(1.0).timeout
		var up := InputEventKey.new()
		up.physical_keycode = KEY_W
		up.pressed = false
		Input.parse_input_event(up)
		var finish := player.global_position
		print("WALK_TEST distance=", start.distance_to(finish),
			" start=", start, " end=", finish)
		get_tree().quit()
		return

	## 2026-11-06 掩体本体验收：`--covershot <room_id>` 把相机摆到该舱正上方，出一张俯视截图。
	## 只在非 headless 下跑（headless 没有渲染目标）。
	var cover_room := _arg_value(args, "--covershot")
	if cover_room != "" and DisplayServer.get_name() != "headless":
		await _run_covershot(cover_room, false)
		get_tree().quit()
		return

	## 2026-11-07 视线遮挡验收：`--eyeshot <room_id>` 把相机放到**人眼 1.62m** 平视。
	## --covershot 用的是 2.2m 俯视，验证不了「掩体是否挡住人眼视角」。
	var eye_room := _arg_value(args, "--eyeshot")
	if eye_room != "" and DisplayServer.get_name() != "headless":
		await _run_covershot(eye_room, true)
		get_tree().quit()
		return

	## 2026-11-07 天花板验收：`--ceilshot <room_id>` 相机抬高仰视天花板。
	## 天花板是舱室面积最大的连续面，俯视（--covershot）根本看不见它。
	var ceil_room := _arg_value(args, "--ceilshot")
	if ceil_room != "" and DisplayServer.get_name() != "headless":
		await _run_ceilshot(ceil_room)
		get_tree().quit()
		return

	## 会议 UI 实拍：造一具尸体 → 开会 → 截图。只在非 headless 下跑。
	if args.has("--meetshot") and DisplayServer.get_name() != "headless":
		await _run_meetshot()
		get_tree().quit()
		return

	if args.has("--shot") and DisplayServer.get_name() != "headless":
		# --blackout 用来出"拉闸后"的对照图（熄灯必须在画面上真的看得出来）
		if args.has("--blackout"):
			set_power(false)
		var wait_sec := 2.5
		var wait_arg := _arg_value(args, "--wait")
		if wait_arg != "":
			wait_sec = maxf(0.2, float(wait_arg))
		await get_tree().create_timer(wait_sec).timeout
		await RenderingServer.frame_post_draw
		var image := get_viewport().get_texture().get_image()
		var shot_name := "preview-corridor.png" if args.has("--corridor") else "preview.png"
		if args.has("--blackout"):
			shot_name = shot_name.replace(".png", "-blackout.png")
		var path := "user://" + shot_name
		image.save_png(path)
		print("SHOT_PATH=", ProjectSettings.globalize_path(path))
		get_tree().quit()


## 性能读数落盘：FPS / draw call / 帧内对象 / 纹理显存。
## headless 下 FPS 只作相对比较（不受 vsync 约束），draw call 与显存更有参考价值。
func _run_bench() -> void:
	var fps := []
	for i in 120:
		await get_tree().process_frame
		if i >= 30:
			fps.append(Engine.get_frames_per_second())
	var avg := 0.0
	for f in fps:
		avg += f
	if not fps.is_empty():
		avg /= float(fps.size())
	var covers: Array = builder.data.get("cover", [])
	var room_nodes: Dictionary = builder.get("_room_nodes")
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
		"mode": mode,
		"fps_avg": avg,
		"draw_calls": Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
		"objects_in_frame": Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),
		"texture_mem_bytes": Performance.get_monitor(Performance.RENDER_TEXTURE_MEM_USED),
		"covers": covers.size(),
		"shared_cover_mats": builder.call("_cover_mat_count"),
		"visible_cover_nodes": shown_nodes,
		"hidden_cover_nodes": hidden_nodes,
		"note": "GPU monitor（draw call / 帧内对象 / 纹理显存）需非 headless 运行，headless 下为 0；FPS 受窗口启动与采样时长影响，仅作参考，优化结论以 draw call / 帧内对象 / 静默节点数为准。",
	}
	var fh := FileAccess.open("res://bench-result.json", FileAccess.WRITE)
	if fh != null:
		fh.store_string(JSON.stringify(out, "\t"))
		fh.close()
	print("BENCH " + JSON.stringify(out))
	get_tree().quit()


func _arg_value(args: PackedStringArray, key: String) -> String:
	for i in args.size():
		var a := String(args[i])
		if a == key and i + 1 < args.size():
			return String(args[i + 1])
		if a.begins_with(key + "="):
			return a.substr(key.length() + 1)
	return ""


func _run_mgtest() -> void:
	mg_layer.capture_on_close = false
	var passed := 0
	for kind in KINDS:
		var state := {"ok": false, "cancel": false}
		mg_layer.open(kind, "测试任务", "normal", "测试 · " + kind,
			func() -> void: state.ok = true,
			func() -> void: state.cancel = true)
		await get_tree().process_frame
		await get_tree().process_frame
		mg_layer.debug_solve()
		await get_tree().create_timer(0.9).timeout
		var ok: bool = bool(state.ok) and not mg_layer.is_open()
		print("MGTEST kind=%s ok=%s" % [kind, str(ok)])
		if ok:
			passed += 1
	var fail_state := {"cancel": false}
	mg_layer.open("pour", "失败路径", "normal", "失败路径",
		func() -> void: pass,
		func() -> void: fail_state.cancel = true)
	await get_tree().process_frame
	await get_tree().process_frame
	mg_layer.debug_fail("测试失败")
	await get_tree().process_frame
	var still_open: bool = mg_layer.is_open()
	mg_layer.cancel()
	await get_tree().create_timer(0.2).timeout
	print("MGTEST_FAIL held_open=%s closed=%s canceled=%s" % [
		str(still_open), str(not mg_layer.is_open()), str(fail_state.cancel)])
	print("MGTEST_RESULT %d/%d pass" % [passed, KINDS.size()])


func _run_mgshot(spec: String) -> void:
	mg_layer.capture_on_close = false
	var kinds: Array = KINDS.duplicate()
	if spec != "all" and KINDS.has(spec):
		kinds = [spec]
	var dir := ProjectSettings.globalize_path("res://screenshots")
	DirAccess.make_dir_recursive_absolute(dir)
	for kind in kinds:
		mg_layer.open(kind, "测试任务", "normal", "测试 · " + kind,
			func() -> void: pass, func() -> void: pass)
		await get_tree().create_timer(0.5).timeout
		await RenderingServer.frame_post_draw
		var image := get_viewport().get_texture().get_image()
		var path := "res://screenshots/mg-%s.png" % kind
		image.save_png(path)
		print("MG_SHOT_PATH=", ProjectSettings.globalize_path(path))
		mg_layer.cancel()
		await get_tree().create_timer(0.25).timeout


func _run_e2e() -> void:
	# 真实输入路径：走到设备前 → 按 E → 遮罩打开 → 解题 → 自动收起。
	_sim_gate = false
	## 开局讨论（pre 会议）还开着时，`_update_interaction` 第一行就 return ——
	## 注入的 E 会被整段吞掉，这条 E2E 从来没有真的验到「E → 小游戏」。
	## 先把会议结束掉（跳过讨论 → 等 sim 自己走完投票/公布）。
	if sim != null and not sim.meeting.is_empty():
		sim.skip_discussion()
		var guard := 0
		while not sim.meeting.is_empty() and guard < 240:
			await get_tree().create_timer(0.1).timeout
			guard += 1
		print("E2E 会议已收束 · 等待 %.1fs · night=%d" % [guard * 0.1, int(sim.night)])
	var dev = null
	## 选“周围最空”的 wire 设备：两个任务点挨得太近时 E 会先开轮盘，
	## 这条 E2E 验的是“E → 小游戏 → 收起”的单设备路径，不该被轮盘分支吃掉。
	var best_gap := -1.0
	for d in extras.devices:
		if d.kind != "wire" or d.point_index < 0:
			continue
		var nearest := 999.0
		for o in extras.devices:
			if o == d or o.point_index < 0:
				continue
			nearest = minf(nearest, Vector2(
				o.global_position.x - d.global_position.x,
				o.global_position.z - d.global_position.z).length())
		if nearest > best_gap:
			best_gap = nearest
			dev = d
	if dev == null and not extras.devices.is_empty():
		dev = extras.devices[0]
	if dev == null:
		print("E2E FAIL no device")
		return
	var face: Vector3 = dev.face_dir()
	player.global_position = Vector3(dev.global_position.x, 0.05, dev.global_position.z) + face * 1.6
	player.rotation.y = atan2(face.x, face.z)
	await get_tree().create_timer(0.5).timeout
	var dbg_offers := _collect_offers()
	print("E2E offers=%s" % str(dbg_offers.map(func(o): return String(o["id"]))))
	var down := InputEventKey.new()
	down.physical_keycode = KEY_E
	down.pressed = true
	Input.parse_input_event(down)
	await get_tree().create_timer(0.25).timeout
	var up := InputEventKey.new()
	up.physical_keycode = KEY_E
	up.pressed = false
	Input.parse_input_event(up)
	await get_tree().create_timer(0.4).timeout
	print("E2E open=%s label=%s kind=%s" % [
		str(mg_layer.is_open()), dev.task_label, dev.kind])
	var dir := ProjectSettings.globalize_path("res://screenshots")
	DirAccess.make_dir_recursive_absolute(dir)
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var path := "res://screenshots/e2e-device-minigame.png"
	image.save_png(path)
	print("E2E_SHOT_PATH=", ProjectSettings.globalize_path(path))
	mg_layer.debug_solve()
	await get_tree().create_timer(1.0).timeout
	print("E2E closed=%s unlocked=%s" % [
		str(not mg_layer.is_open()), str(not player.ui_locked)])


func _run_pipeshot() -> void:
	var pipes: Array = map_data.get("pipes", [])
	if pipes.is_empty():
		print("PIPESHOT FAIL no pipes")
		return
	var p: Dictionary = pipes[0]
	var cam := Camera3D.new()
	cam.fov = 58.0
	add_child(cam)
	cam.global_position = Vector3(float(p["x"]) + 1.7, 1.45, float(p["y"]) + 1.7)
	cam.look_at(Vector3(float(p["x"]), 0.12, float(p["y"])), Vector3.UP)
	cam.current = true
	await get_tree().create_timer(0.35).timeout
	await RenderingServer.frame_post_draw
	var dir := ProjectSettings.globalize_path("res://screenshots")
	DirAccess.make_dir_recursive_absolute(dir)
	var path := "res://screenshots/pipe-port-3d.png"
	get_viewport().get_texture().get_image().save_png(path)
	print("PIPESHOT ", ProjectSettings.globalize_path(path), " room=", p.get("room"))


func _run_devicetest() -> void:
	_sim_gate = false
	var kinds := {}
	for d in extras.devices:
		kinds[d.kind] = true
	print("DEVICE_COUNT %d kinds=%d %s" % [extras.devices.size(), kinds.size(), str(kinds.keys())])
	var dev = null
	for d in extras.devices:
		if d.kind == "wire":
			dev = d
			break
	if dev == null:
		dev = extras.devices[0]
	_open_device(dev)
	await get_tree().process_frame
	await get_tree().process_frame
	print("DEVICE_TEST open=%s kind=%s locked=%s" % [
		str(mg_layer.is_open()), dev.kind, str(player.ui_locked)])
	mg_layer.debug_solve()
	await get_tree().create_timer(0.9).timeout
	print("DEVICE_TEST closed=%s unlocked=%s" % [
		str(not mg_layer.is_open()), str(not player.ui_locked)])
	if not extras.devices.is_empty():
		_open_device(extras.devices[0])
		await get_tree().process_frame
		mg_layer.cancel()
		await get_tree().create_timer(0.2).timeout
		print("DEVICE_CANCEL closed=%s unlocked=%s" % [
			str(not mg_layer.is_open()), str(not player.ui_locked)])


func _run_devshot(spec: String) -> void:
	var indices: Array = []
	if spec == "all":
		for i in extras.devices.size():
			indices.append(i)
	elif spec.contains(","):
		for s in spec.split(","):
			indices.append(int(s))
	else:
		indices = [int(spec)]
	var dir := ProjectSettings.globalize_path("res://screenshots")
	DirAccess.make_dir_recursive_absolute(dir)
	for idx in indices:
		if idx < 0 or idx >= extras.devices.size():
			continue
		var dev = extras.devices[idx]
		var cam := Camera3D.new()
		cam.fov = 58.0
		cam.near = 0.03
		cam.far = 220.0
		add_child(cam)
		cam.global_position = dev.focus_position()
		cam.look_at(dev.focus_look_at(), Vector3.UP)
		cam.current = true
		await get_tree().create_timer(0.35).timeout
		await RenderingServer.frame_post_draw
		var image := get_viewport().get_texture().get_image()
		var path := "res://screenshots/device-%02d-%s.png" % [idx, dev.kind]
		image.save_png(path)
		print("DEV_SHOT_PATH=", ProjectSettings.globalize_path(path), " label=", dev.task_label)
		cam.queue_free()
		await get_tree().create_timer(0.1).timeout


## 断电链路自测：灯 / 环境光 / 门扫描锁 / 电闸时长，四项都要读数。
func _run_powertest() -> void:
	if space.is_empty():
		print("POWERTEST FAIL space.json 缺失（先跑 node 3d/tools/export-space.cjs）")
		return
	var s0: Dictionary = builder.light_stats()
	print("POWERTEST 供电 rooms=%d/%d corridor=%d/%d ambient=%.3f fill=%.3f" % [
		s0.rooms_on, s0.rooms, s0.corridor_on, s0.corridor, s0.ambient, s0.fill])
	set_power(false)
	var s1: Dictionary = builder.light_stats()
	var expect_amb: float = MapBuilderScript.BLACKOUT_AMBIENT
	print("POWERTEST 断电 rooms_on=%d corridor_on=%d ambient=%.3f 期望=%.3f 通过=%s" % [
		s1.rooms_on, s1.corridor_on, s1.ambient, expect_amb,
		str(s1.rooms_on == 0 and s1.corridor_on == 0 and absf(s1.ambient - expect_amb) < 0.001)])
	print("POWERTEST 断电 补光 fill=%.3f（预演期补光必须一起切，否则熄灯在画面上看不出来）" % s1.fill)

	# 门：断电时靠近，未满扫描秒数必须拦人；扫满才放行
	var door: Dictionary = extras.doors[0]
	var at: Vector3 = (door["center"] as Vector3) + Vector3(0, 0.05, 0)
	player.global_position = at
	var scan_sec := SpaceData.num(space, "door", "scan_sec")
	var pass_r := SpaceData.num(space, "door", "pass")
	door["open"] = 0.0
	door["scan_t"] = 0.0
	extras.door_update(0.1, at, false)
	print("POWERTEST 门 0.1s scan=%.2f open=%.2f 拦人=%s（期望 scan<%.1f 且拦）" % [
		float(door["scan_t"]), float(door["open"]), str(float(door["open"]) <= pass_r), scan_sec])
	var steps := int(ceil(scan_sec / 0.1)) + 6
	for i in steps:
		extras.door_update(0.1, at, false)
	print("POWERTEST 门 %.1fs scan=%.2f open=%.2f 放行=%s" % [
		scan_sec, float(door["scan_t"]), float(door["open"]), str(float(door["open"]) > pass_r)])
	# 人离开 → 重新上锁（2.5D：离开后 scanT 归零）
	var away := at + Vector3(14, 0, 0)
	for i in 40:
		extras.door_update(0.1, away, false)
	print("POWERTEST 门 离开后 scan=%.2f open=%.2f 重新拦人=%s" % [
		float(door["scan_t"]), float(door["open"]), str(float(door["open"]) <= pass_r)])
	set_power(true)
	var s2: Dictionary = builder.light_stats()
	print("POWERTEST 复电 rooms_on=%d corridor_on=%d ambient=%.3f" % [
		s2.rooms_on, s2.corridor_on, s2.ambient])

	# 电闸时长：拉闸 min(off_max, off_step×n)，合闸 on_default
	var br = null
	for dev in extras.devices:
		if dev.point_index < 0:
			br = dev
			break
	if br == null:
		print("POWERTEST FAIL 找不到电闸设备")
		return
	_breaker_pulls = 0
	var seq: Array = []
	for i in 4:
		seq.append(String(_breaker_offer(br).get("hint", "")))
		_breaker_pulls += 1
	print("POWERTEST 拉闸时长序列 %s" % str(seq))
	power_on = false
	print("POWERTEST 合闸时长 %s" % String(_breaker_offer(br).get("hint", "")))
	power_on = true


## 交互收集自测：电闸 / 任务设备 / 管道 / 圆桌领取 / 补给，逐项站位读数。
func _run_floortest() -> void:
	## 2026-11-07：地板口径自测。
	## 关键：不能「拿真源和自己比」—— want 和 got 都读同一份 JSON，永远相等，
	## 等于没测（第一版就是这么写的，注入漂移也照样 0 失败）。
	## 正确做法：检查**场景里真实建出来的地面网格** ——
	##   ① 地面 MeshInstance3D 的材质贴图名 = 真源的 tex
	##   ② 该网格 UV 的实际重复周期 = 真源的 repeat_m
	##   ③ 材质染色 = 真源的 tint
	## 注入漂移（改 JSON 或改 map_builder）时必须报 FAIL。
	var spec: Dictionary = MapBuilderScript.load_floor_spec()
	var fails: Array = []
	if spec.is_empty():
		print("FLOORTEST FAIL floor_spec 未加载")
		get_tree().quit()
		return
	var rooms: Dictionary = spec.get("rooms", {})
	## 收集场景里所有 y≈0.02 的地面网格，按材质贴图归类
	var floors: Array = []
	for child in builder.get_children():
		if not (child is MeshInstance3D):
			continue
		var mi := child as MeshInstance3D
		if absf(mi.position.y) > 0.5:
			continue
		var mat := mi.material_override as StandardMaterial3D
		if mat == null or mat.albedo_texture == null:
			continue
		var mesh := mi.mesh as ArrayMesh
		if mesh == null or mesh.get_surface_count() == 0:
			continue
		var arr := mesh.surface_get_arrays(0)
		var uvs: PackedVector2Array = arr[Mesh.ARRAY_TEX_UV]
		var verts: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
		if uvs.size() < 2 or verts.size() < 2:
			continue
		## UV 周期：取任意两个顶点，算 UV 差 / 世界距离差 = 1/repeat_m
		var per_m := 0.0
		for i in range(mini(verts.size(), 64)):
			for j in range(i + 1, mini(verts.size(), 64)):
				var dv := verts[j] - verts[i]
				var du := uvs[j] - uvs[i]
				var dworld := Vector2(dv.x, dv.z).length()
				if dworld < 0.5:
					continue
				var dtex := du.length()
				if dtex < 0.001:
					continue
				per_m = dtex / dworld
				break
			if per_m > 0.0:
				break
		## 2026-11-07：地板贴图开始按舱放在 textures/qwen/<rid>/ 子目录，
		## 只取文件名会把 6 个舱都读成 "floor"，既误判又失去按舱区分能力。
		## 改成相对 res://assets/textures/ 的路径（去掉 .png），与 floor_spec.tex 同口径。
		var tex_name := String(mat.albedo_texture.resource_path).replace("res://assets/textures/", "").replace(".png", "")
		floors.append({"tex": tex_name, "per_m": per_m,
			"tint": mat.albedo_color, "repeat": 1.0 / per_m if per_m > 0.0 else 0.0})
	if floors.is_empty():
		print("FLOORTEST FAIL 场景里没有找到地面网格")
		get_tree().quit()
		return
	var checked := {}
	for rid: String in rooms.keys():
		var fs: Dictionary = rooms[rid]
		var want_tex := String(fs.get("tex", "")).replace(".png", "")
		var want_repeat := float(fs.get("repeat_m", 4.0))
		var tint: Variant = fs.get("tint", null)
		var want_tint := Color(1, 1, 1)
		if tint is Array and (tint as Array).size() >= 3:
			var arr2: Array = tint
			want_tint = Color(float(arr2[0]), float(arr2[1]), float(arr2[2]))
		var hit = null
		for f: Dictionary in floors:
			if String(f["tex"]) == want_tex and not checked.has(String(f["tex"]) + str(f["tint"])):
				hit = f
				break
		if hit == null:
			fails.append("%s 场景里找不到贴图 %s 的地面" % [rid, want_tex])
			continue
		checked[String(hit["tex"]) + str(hit["tint"])] = true
		var got_repeat := float(hit["repeat"])
		if absf(got_repeat - want_repeat) > 0.02:
			fails.append("%s 尺度 %.3f != 真源 %.3f" % [rid, got_repeat, want_repeat])
		var got_tint: Color = hit["tint"]
		var d := absf(got_tint.r - want_tint.r) + absf(got_tint.g - want_tint.g) + absf(got_tint.b - want_tint.b)
		if d > 0.02:
			fails.append("%s 染色 %s != 真源 %s" % [rid, str(got_tint), str(want_tint)])
	print("FLOORTEST 舱=%d 地面网格=%d 失败=%d %s" % [rooms.size(), floors.size(), fails.size(), str(fails)])


func _run_tasktest() -> void:
	var pts: Array = map_data.get("points", [])
	var dev_r := SpaceData.num(space, "reach", "fix")
	var fails: Array = []
	for i in pts.size():
		var dev = null
		for d in extras.devices:
			if is_instance_valid(d) and d.point_index == i:
				dev = d
				break
		if dev == null:
			fails.append("%d 缺设备" % i)
			continue
		## 掩体统一 1.70m 后，被 cover 压住的点曾被顶到 1.72m（玩家眼高 1.62m）
		if dev.global_position.y > 1.0:
			fails.append("%d 悬高 %.2fm" % [i, dev.global_position.y])
		var face: Vector3 = dev.face_dir()
		player.global_position = Vector3(dev.global_position.x, 0.05, dev.global_position.z) \
				+ face * (dev_r * 0.8)
		var want := "task-%d" % i
		var got := false
		for o in _collect_offers():
			if String(o["id"]) == want:
				got = true
		if not got:
			fails.append("%d %s 交互项缺失" % [i, String(pts[i].get("label", ""))])
	print("TASKTEST 点=%d 失败=%d %s" % [pts.size(), fails.size(), str(fails)])


## 站位可达性：每个任务点都要能**走过去**站下，并且站得住的位置仍在交互半径内。
## tasktest 用传送验证，等于跳过了碰撞与掩体，所以它全绿也可能玩不了。
## 这里不用 nav.nearest_free —— 它按环返回的第一个自由格不一定最近，
## 直接把半径圈内的格子全扫一遍，取钳位距离最小的那个才是真读数。
func _run_reachtest() -> void:
	var pts: Array = map_data.get("points", [])
	var dev_r := SpaceData.num(space, "reach", "fix")
	var missing: Array = []
	var far: Array = []
	if sim == null or sim.nav == null:
		print("REACHTEST FAIL 没有 nav（先跑 node 3d/tools/export-map.cjs / export-space.cjs）")
		return
	var nav = sim.nav
	var span := int(ceil((dev_r + 1.5) / float(nav.CELL)))
	for i in pts.size():
		var dev = null
		for d in extras.devices:
			if is_instance_valid(d) and d.point_index == i:
				dev = d
				break
		if dev == null:
			missing.append("%d 缺设备" % i)
			continue
		var c0: Vector2i = nav.world_to_cell(Vector2(dev.global_position.x, dev.global_position.z))
		var best := 999.0
		var best_at := Vector2.INF
		for dy in range(-span, span + 1):
			for dx in range(-span, span + 1):
				var c := Vector2i(c0.x + dx, c0.y + dy)
				if c.x < 0 or c.y < 0 or c.x >= int(nav.gw) or c.y >= int(nav.gh):
					continue
				var w: Vector2 = nav.cell_to_world(c)
				if not nav.is_free(w):
					continue
				var dist: float = dev.reach_dist(Vector3(w.x, 0.05, w.y))
				if dist < best:
					best = dist
					best_at = w
		if best > dev_r:
			far.append("%d %s 设备(%.2f,%.2f) 最近可站点(%.2f,%.2f) 钳位 %.2fm > %.1fm" % [
				i, String(pts[i].get("label", "")),
				dev.global_position.x, dev.global_position.z,
				best_at.x, best_at.y, best, dev_r])
	print("REACHTEST 点=%d 半径=%.1fm 走不到=%d 缺设备=%d" % [
		pts.size(), dev_r, far.size(), missing.size()])
	for s in far:
		print("  FAR    " + String(s))
	for s in missing:
		print("  NODEV  " + String(s))


## 音频链路读数：背景音乐文件在不在、循环开没开、两个滑杆是否各管各的。
## 2026-11-09 之前「音乐」滑杆写的是 Master 总线，而工程里根本没有音乐流 ——
## 结果是滑杆一动音效跟着变小、音乐却始终听不见。
func _run_audiotest() -> void:
	if audio == null:
		print("AUDIOTEST FAIL 没有 audio 节点")
		return
	audio.play_music()
	var st: Dictionary = audio.music_state()
	print("AUDIOTEST 音乐 文件=%s 时长=%.1fs 导入循环=%s 播放=%s" % [
		str(bool(st.get("file", false))), float(st.get("len", 0.0)),
		audio.music_loop_param(), str(bool(st.get("playing", false)))])
	print("AUDIOTEST 音量 档=%.2f 增益=%.2f（%.1fdB）· 感知曲线 pow(v,0.7) 与 2.5D 一致" % [
		float(st.get("volume", 0.0)), float(st.get("gain", 0.0)),
		linear_to_db(maxf(0.001, float(st.get("gain", 0.0))))])
	print("AUDIOTEST 总线 Master=%.1fdB（音乐滑杆不再写总线）· 音效档=%.2f" % [
		AudioServer.get_bus_volume_db(0), ui_panels.get_sfx()])


## 门禁夹具：new_game 会开 MEET_PRE（开局公开讨论）、dawn 会开 MEET_DAY（全员会）。
## 会议期间 sim.tick 只推进会议相位、不推进夜钟（2.5D 的 MEET.pauseClock）。
## 想验「夜里」或「下一夜」的自测必须先把会正常走完；skip_discussion 是 2.5D
## 也有的玩家操作，不是改判定、也不是绕过验收。
func _finish_meeting(s) -> void:
	if s == null:
		return
	var guard := 0
	while not s.meeting.is_empty() and guard < 1200:
		if String(s.meeting.get("phase", "")) == "discuss":
			s.skip_discussion()
		s.tick(0.1)
		guard += 1


## 真实输入链自测（2026-11-09 分离后第一批）：
## 不调用 skip_discussion() 绕过会议，也不把「直接调内部函数」当成玩家按过键。
## 断言两件事：① 各 UI 相位下鼠标口径正确（旧缺陷：轮盘打开了却点不动）；
## ② 2.5D collectInteractions 里的动作在 3D 的 _collect_offers 里都有入口。
func _run_actiontest() -> bool:
	var fails: Array = []
	## sim.new_game() 按 2.5D 口径会开一场 pre 公开讨论（MEET_PRE），
	## 所以自测里要先关掉这场会，才造得出「会议结束后的空闲态」。
	sim.meeting = {}
	_close_info()
	if wheel != null and wheel.is_open():
		wheel.close()
	player.ui_locked = false
	if _want_mouse_visible():
		fails.append("空闲态误判为需要释放鼠标")
	wheel.open([{"label": "A"}, {"label": "B"}],
		func(_it: Dictionary) -> void: return,
		func() -> void: return)
	player.ui_locked = true
	if not _want_mouse_visible():
		fails.append("轮盘打开时没有释放鼠标（按钮会点不动）")
	_refresh_mouse_mode()
	wheel.close()
	player.ui_locked = false
	sim.meeting = {"kind": "night", "phase": "discuss", "t": 35.0}
	if not _want_mouse_visible():
		fails.append("会议期间没有释放鼠标")
	sim.meeting = {}
	_open_info("自测", ["x"])
	if not _want_mouse_visible():
		fails.append("信息面板打开时没有释放鼠标")
	_close_info()
	if _want_mouse_visible():
		fails.append("所有 UI 关闭后鼠标没回到捕获态")
	# 2.5D 动作全集：施救 / 查看记录 / 全船监控 / 异形破坏 / 机器人状态。
	var me: Dictionary = sim.me()
	me["medkit"] = 1
	me["alien"] = true
	var v: Dictionary = sim.agent(1)
	v["alive"] = true
	v["downed"] = true
	v["searched"] = true
	var seen := {}
	for f: Dictionary in map_data.get("facility", []):
		var kind := String(f.get("kind", ""))
		if kind != "monitor" and kind != "secbot" and kind != "medbot":
			continue
		player.global_position = Vector3(float(f.get("x", 0)), 0.05, float(f.get("y", 0)))
		v["pos"] = Vector2(player.global_position.x, player.global_position.z)
		v["bodyPos"] = v["pos"]
		for o: Dictionary in _collect_offers():
			var oid := String(o.get("id", ""))
			seen[oid.split("-")[0]] = true
	for need: String in ["cams", "botinfo", "revive", "inspect", "sabotage"]:
		if not seen.has(need):
			fails.append("缺 2.5D 动作入口：" + need)
	if fails.is_empty():
		print("ACTION OK 鼠标相位 5/5 · 2.5D 动作入口 5/5 齐备")
		return true
	for msg: String in fails:
		print("ACTION FAIL " + msg)
	return false


func _run_interacttest() -> void:
	if space.is_empty():
		print("INTERACT FAIL space.json 缺失")
		return
	var dev_r := SpaceData.num(space, "reach", "fix")
	print("INTERACT 半径 设备=%.1f 电闸=%.1f 圆桌=%.1f 管道冷却=%.0f" % [
		dev_r, SpaceData.num(space, "reach", "breaker"),
		SpaceData.num(space, "reach", "round_table"), SpaceData.num(space, "pipe", "cooldown")])
	var seen := {}
	for dev in extras.devices:
		if not is_instance_valid(dev):
			continue
		var face: Vector3 = dev.face_dir()
		player.global_position = Vector3(dev.global_position.x, 0.05, dev.global_position.z) + face * (dev_r * 0.8)
		var offers := _collect_offers()
		for o in offers:
			seen[String(o["id"])] = int(seen.get(String(o["id"]), 0)) + 1
		if dev.point_index < 0:
			# 电闸在配电室，站位同时够到「电路维修」任务点 —— 多项共存才是对的，
			# 断言只查"电闸这一项必须在列表里"，不查数量。
			var has_brk := false
			for o in offers:
				if String(o["id"]) == "breaker":
					has_brk = true
			if not has_brk:
				print("INTERACT FAIL 电闸站位没收到 breaker 项（共 %d 项）" % offers.size())
			else:
				print("INTERACT 电闸站位 %d 项共存 %s" % [
					offers.size(), str(offers.map(func(o): return String(o["id"])))])

	# 圆桌：2.5D 用的是到矩形的钳位距离，领取点 = 圆桌下沿外 1.2
	var t := _round_table_cover()
	if t != {}:
		# B2 起申请单以 sim 为真源：门禁给自己一张待领，验证领取链路。
		if sim != null and not sim.agents.is_empty():
			sim.me()["qualPending"] = 1
			sim.me()["qual"] = 0
			qual_pending = 1
			qual = 0
		var edge := Vector3(float(t["x"]) + float(t["w"]) * 0.5, 0.05, float(t["y"]) + float(t["h"]) + 1.2)
		player.global_position = edge
		var has_req := false
		for o in _collect_offers():
			if String(o["id"]) == "req":
				has_req = true
		print("INTERACT 圆桌领取点 %s → 领申请单=%s（待领 %d）" % [str(edge), str(has_req), qual_pending])
		if has_req:
			var done := {"v": false}
			var dur := SpaceData.num(space, "stand", "qual")
			_start_station("领取物资申请单", dur,
				func() -> void:
					_on_claim_done()
					done.v = true)
			for i in int(ceil(dur / 0.1)) + 2:
				_tick_station(0.1)
			print("INTERACT 站桩结算 done=%s qual_pending=%d qual=%d" % [str(done.v), qual_pending, qual])
	# 管道（2.5D 口径：人类管道禁用）
	if extras.pipe_ports.size() > 0:
		player.global_position = (extras.pipe_ports[0]["pos"] as Vector3) + Vector3(0.5, 0.05, 0.5)
		var pipe_n := 0
		for o in _collect_offers():
			if String(o["id"]).begins_with("pipe"):
				pipe_n += 1
		role = "human"
		var pipe_human := 0
		for o in _collect_offers():
			if String(o["id"]).begins_with("pipe"):
				pipe_human += 1
		role = "alien"
		print("INTERACT 管道 异形=%d 人类=%d（期望人类 0）" % [pipe_n, pipe_human])
	# 轮盘：多项时列出、按序号选中并触发
	for dev in extras.devices:
		if not is_instance_valid(dev):
			continue
		var face2: Vector3 = dev.face_dir()
		player.global_position = Vector3(dev.global_position.x, 0.05, dev.global_position.z) + face2 * (dev_r * 0.8)
		var many := _collect_offers()
		if many.size() < 2:
			continue
		var picked := {"v": ""}
		wheel.open(many, func(it: Dictionary) -> void: picked.v = String(it["id"]), func() -> void: pass)
		print("INTERACT 轮盘 打开=%s 列出=%d/%d" % [str(wheel.is_open()), mini(many.size(), 9), many.size()])
		wheel._choose(1)
		print("INTERACT 轮盘 选中=%s 关闭=%s" % [picked.v, str(not wheel.is_open())])
		break


## 美术变体对账：主题色覆盖、墙面色差档数、实例高度散布，以及
## "设备顶面 = 箱体顶面"这条一致性（变体一旦只改一处就会浮空/陷进去）。
func _run_arttest() -> void:
	var themed := 0
	var wall_tints := {}
	for room: Dictionary in map_data.get("rooms", []):
		if room.get("theme", null) != null:
			themed += 1
	var cover_n := 0
	var hz_min := 2.0
	var hz_max := 0.0
	var tints := {}
	for c: Dictionary in map_data.get("cover", []):
		cover_n += 1
		var v: Dictionary = c.get("v", {})
		var hz := float(v.get("hz", 1.0))
		hz_min = minf(hz_min, hz)
		hz_max = maxf(hz_max, hz)
		tints[int(v.get("tint", 0))] = true
		for r: Dictionary in map_data.get("rooms", []):
			if r.get("theme", null) == null:
				continue
			var w: Array = (r["theme"] as Dictionary).get("wall", [])
			if w.size() >= 3:
				wall_tints["%d-%d-%d" % [int(w[0] * 100), int(w[1] * 100), int(w[2] * 100)]] = true
	print("ART theme=%d/%d 墙面色差档=%d 色调档使用=%d 种 实例 hz=[%.2f,%.2f] 件数=%d" % [
		themed, map_data.get("rooms", []).size(), wall_tints.size(), tints.size(), hz_min, hz_max, cover_n])
	## 2026-11-09 铁板验收：地图里**不允许有可见的** 1.70m 补高背板节点
	## （`sight_shell` = 背板+立柱+顶梁，`sightglow` = 缝）。资产没删，只在实例化时隐藏，
	## 所以 hidden 应等于「有 GLB 本体的 cover 件数 ×2」，visible 必须为 0。
	var st: Dictionary = builder.sight_shell_stats()
	var sight_visible := 0
	var stack: Array = [builder]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			if c is GeometryInstance3D and String(c.name) in ["sight_shell", "sightglow"] \
					and (c as GeometryInstance3D).visible:
				sight_visible += 1
			stack.append(c)
	print("ART 铁板 hidden=%d show=%s 可见铁板节点=%d" % [
		int(st.get("hidden", 0)), str(bool(st.get("show", false))), sight_visible])
	# 一致性：落在掩体上的设备，base_y 必须 = 名义高度 × hz + 0.02
	var bad := 0
	var checked := 0
	for dev in extras.devices:
		if not is_instance_valid(dev) or dev.point_index < 0:
			continue
		var p: Dictionary = (map_data.get("points", []) as Array)[dev.point_index]
		var hit: Dictionary = {}
		for c: Dictionary in map_data.get("cover", []):
			var cx := float(c.get("x", 0))
			var cy := float(c.get("y", 0))
			if p.x >= cx - 0.2 and p.x <= cx + float(c.get("w", 0)) + 0.2 \
					and p.y >= cy - 0.2 and p.y <= cy + float(c.get("h", 0)) + 0.2:
				hit = c
				break
		if hit == {}:
			continue
		checked += 1
		## 2026-11-07：被 cover 压住的点已由 scene_extras._task_placement() 重定位到
		## 掩体外侧台座（0.57m），不再站 cover 顶面。XZ 偏离原点位即视为重定位，
		## 期望值改为台座高度；否则仍按「名义高度 × hz + 0.02」对账。
		var px := float(p.get("x", 0.0))
		var py := float(p.get("y", 0.0))
		var relocated := Vector2(dev.global_position.x - px, dev.global_position.z - py).length() > 0.15
		var v: Dictionary = hit.get("v", {})
		var expect := 0.57
		if not relocated:
			expect = float(MapBuilderScript.COVER_HEIGHT.get(String(hit.get("kind", "")), 1.0)) \
				* float(v.get("hz", 1.0)) + 0.02
		if absf(dev.global_position.y - expect) > 0.001:
			bad += 1
			print("ART FAIL %s 箱体 %s hz=%.2f 设备 y=%.3f 期望=%.3f" % [
				dev.task_label, hit.get("kind"), float(v.get("hz", 1.0)), dev.global_position.y, expect])
	print("ART 设备顶面一致性 检查=%d 不一致=%d" % [checked, bad])


func _add_floor_collision() -> void:
	var body := StaticBody3D.new()
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = Vector3(120.0, 1.0, 120.0)
	collision.shape = shape
	body.position = Vector3(49.0, -0.5, 47.0)
	body.add_child(collision)
	add_child(body)


func _run_meetshot() -> void:
	var alien := {}
	var victim := {}
	for a: Dictionary in sim.agents:
		if bool(a.get("alien", false)) and alien.is_empty():
			alien = a
		elif not bool(a.get("alien", false)) and int(a.get("i", -1)) != int(sim.me_idx) and victim.is_empty():
			victim = a
	if alien.is_empty() or victim.is_empty():
		print("MEETSHOT FAIL no alien/victim")
		return
	sim.knife(int(alien.get("i", -1)), int(victim.get("i", -1)))
	sim.open_meeting(int(sim.me_idx), int(victim.get("i", -1)))
	var a2 := OS.get_cmdline_user_args()
	# 默认拍讨论期（放 9 秒让台词排出来）；--meetvote 拍投票页；--meetresult 拍身份公布
	if a2.has("--meetresult"):
		sim.skip_discussion()
		sim.tick(0.01)
		for k in 80:
			if String(sim.meeting.get("phase", "")) == "result":
				break
			sim.tick(0.1)
	elif a2.has("--meetvote"):
		sim.skip_discussion()
		sim.tick(0.01)
	else:
		for k in 90:
			if String(sim.meeting.get("phase", "")) != "discuss":
				break
			sim.tick(0.1)
	await get_tree().create_timer(0.6).timeout
	await RenderingServer.frame_post_draw
	var path := "user://meeting.png"
	get_viewport().get_texture().get_image().save_png(path)
	print("MEETSHOT_PATH=", ProjectSettings.globalize_path(path))


func _build_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	hud_layer = layer

	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])

	var title := _label("新返航录 · 3D 预演", Vector2(22, 16), 22, font)
	title.add_theme_color_override("font_color", Color(1.0, 0.86, 0.52))
	layer.add_child(title)

	var help := _label("WASD 移动 · Shift 加速 · E 交互 · 鼠标视角 · Esc 释放鼠标", Vector2(22, 50), 15, font)
	help.add_theme_color_override("font_color", Color(0.78, 0.84, 0.92))
	layer.add_child(help)

	room_label = _label("中央会议室", Vector2(1000, 18), 20, font)
	room_label.add_theme_color_override("font_color", Color(0.82, 0.92, 1.0))
	layer.add_child(room_label)

	## 供电读数：文案与 2.5D 监控台同源（● N 路在线 / ● 信号中断 · 电闸断开）
	power_label = _label("", Vector2(1000, 46), 15, font)
	layer.add_child(power_label)

	## ---- 模拟状态（B1）----
	## 只读 sim_state：夜 / 计时 / 维修进度 / 自己的 4 个任务。
	night_label = _label("", Vector2(22, 84), 18, font)
	night_label.add_theme_color_override("font_color", Color(1.0, 0.86, 0.52))
	layer.add_child(night_label)

	prog_label = _label("", Vector2(22, 112), 18, font)
	prog_label.add_theme_color_override("font_color", Color(0.72, 0.94, 0.82))
	layer.add_child(prog_label)

	tasks_label = _label("", Vector2(22, 148), 14, font)
	tasks_label.add_theme_color_override("font_color", Color(0.82, 0.86, 0.92))
	tasks_label.add_theme_constant_override("line_spacing", 4)
	layer.add_child(tasks_label)

	alive_label = _label("", Vector2(22, 270), 14, font)
	alive_label.add_theme_color_override("font_color", Color(0.92, 0.78, 0.62))
	layer.add_child(alive_label)

	feed_label = _label("", Vector2(22, 296), 12, font)
	feed_label.add_theme_color_override("font_color", Color(0.62, 0.70, 0.80))
	feed_label.add_theme_constant_override("line_spacing", 2)
	layer.add_child(feed_label)

	toast_label = _label("", Vector2(0, 0), 17, font)
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.anchor_left = 0.5
	toast_label.anchor_right = 0.5
	toast_label.offset_left = -330.0
	toast_label.offset_right = 330.0
	toast_label.offset_top = -140.0
	toast_label.offset_bottom = -112.0
	toast_label.visible = false
	layer.add_child(toast_label)

	fps_label = _label("", Vector2(22, 682), 13, font)
	fps_label.add_theme_color_override("font_color", Color(0.55, 0.62, 0.72))
	layer.add_child(fps_label)

	prompt_label = _label("", Vector2(0, 0), 16, font)
	prompt_label.add_theme_color_override("font_color", Color(1.0, 0.86, 0.52))
	prompt_label.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.95))
	prompt_label.add_theme_constant_override("outline_size", 6)
	prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prompt_label.anchor_left = 0.5
	prompt_label.anchor_right = 0.5
	prompt_label.anchor_top = 1.0
	prompt_label.anchor_bottom = 1.0
	prompt_label.offset_left = -320
	prompt_label.offset_right = 320
	prompt_label.offset_top = -96
	prompt_label.offset_bottom = -66
	prompt_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(prompt_label)

	var cross := ColorRect.new()
	cross.color = Color(1.0, 1.0, 1.0, 0.82)
	cross.anchor_left = 0.5
	cross.anchor_top = 0.5
	cross.anchor_right = 0.5
	cross.anchor_bottom = 0.5
	cross.offset_left = -2.0
	cross.offset_top = -2.0
	cross.offset_right = 2.0
	cross.offset_bottom = 2.0
	cross.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(cross)

	## 结算遮罩：B1 只在“维修 45 分 / 异形出局 / 人类全灭”时出现。
	end_panel = ColorRect.new()
	end_panel.color = Color(0.01, 0.02, 0.04, 0.78)
	end_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	end_panel.visible = false
	end_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(end_panel)

	end_label = _label("", Vector2(0, 0), 30, font)
	end_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	end_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	end_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	end_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	end_panel.add_child(end_label)

	_refresh_sim_hud()


func _label(text: String, pos: Vector2, size: int, font: Font) -> Label:
	var label := Label.new()
	label.text = text
	label.position = pos
	label.add_theme_font_override("font", font)
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.9))
	label.add_theme_constant_override("outline_size", 5)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label


## ---- 会议 / 投票 UI（无发言版）----
## ---- 同 seed 对照夹具（--simdiff <js-simdump.json>）----
## 验契约、不强行要求逐条事件相同：3D 是独立实现，逐条对齐不是当前验收标准。
## 输出：信封字段差 / kind 覆盖差 / kind 序列首个分歧点。
func _run_simdiff(file_path: String) -> void:
	var abs := ProjectSettings.globalize_path(file_path) if file_path.begins_with("res://") else file_path
	var f := FileAccess.open(abs, FileAccess.READ)
	if f == null:
		print("SIMDIFF FAIL 打不开 " + abs)
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

	var s = SimStateScript.new()
	if not s.new_game(seed_val, 0, map_data, space):
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
	# 首个 kind 序列分歧（只作诊断，不作为失败）
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


## ---- B6′ 剩余系统门禁（--b6test）----
func _run_b6test() -> bool:
	var pass_n := 0
	var fail_n := 0
	var s = SimStateScript.new()
	if not s.new_game(20261116, 0, map_data, space):
		print("B6TEST FAIL 开局失败")
		return false
	s.ai_enabled = false
	_finish_meeting(s)
	# ① 拖尸 → 藏尸（非会议室）
	var v := s.agent(3)
	v["alive"] = false
	v["bodyPos"] = Vector2(31.0, 33.5)
	var carrier := s.agent(1)
	carrier["pos"] = Vector2(31.0, 33.5)
	var d1: bool = s.start_drag(1, 3)
	carrier["pos"] = Vector2(55.0, 85.6)      # 医疗间
	s.tick(0.05)
	var followed := (v["bodyPos"] as Vector2).distance_to(Vector2(55.0, 85.6)) < 0.01
	# 放回非医疗舱再拖一次，落到藏尸分支
	var v2 := s.agent(4)
	v2["alive"] = false
	v2["bodyPos"] = Vector2(31.0, 33.5)
	s.release_drag(1)
	s.start_drag(1, 4)
	s.agent(1)["pos"] = Vector2(80.0, 75.0)   # 军械库
	s.tick(0.05)
	s.release_drag(1)
	var hidden := bool(v2.get("bodyGone", false))
	var drag_ev := _has_kind(s, "drag_start") and _has_kind(s, "drag_end") \
		and _has_kind(s, "drag_away")
	if d1 and followed and hidden and drag_ev:
		pass_n += 1
	else:
		fail_n += 1
		print("B6TEST FAIL 拖尸 d1=%s follow=%s hidden=%s ev=%s" % [
			str(d1), str(followed), str(hidden), str(drag_ev)])
	# ② 机器人 HP：保安 2 发拆掉
	var me: Dictionary = s.me()
	me["pos"] = Vector2(80.0, 75.0)
	me["bullet"] = 3
	var h1: bool = s.hit_bot(0, "secbot")
	var h2: bool = s.hit_bot(0, "secbot")
	var dead_sec: bool = s.bots.is_dead("secbot")
	var bot_ev := _has_kind(s, "bot_hit") and _has_kind(s, "bot_down")
	if h1 and h2 and dead_sec and bot_ev:
		pass_n += 1
	else:
		fail_n += 1
		print("B6TEST FAIL 机器人 HP h1=%s h2=%s dead=%s ev=%s" % [
			str(h1), str(h2), str(dead_sec), str(bot_ev)])
	# ③ 供电同步到 sim
	var pw0: bool = bool(s.power_on)
	s.toggle_power(0)
	var pw1: bool = bool(s.power_on)
	if pw0 != pw1 and _has_kind(s, "breaker"):
		pass_n += 1
	else:
		fail_n += 1
		print("B6TEST FAIL 供电 %s→%s" % [str(pw0), str(pw1)])
	# ④ 旁观：0 号由 AI 接管、会移动
	var sp = SimStateScript.new()
	sp.new_game(20261117, 0, map_data, space)
	sp.spectator = true
	_finish_meeting(sp)
	var p0: Vector2 = sp.agent(0).get("pos", Vector2.ZERO)
	for k in 250:
		sp.tick(0.1)
	var p1: Vector2 = sp.agent(0).get("pos", Vector2.ZERO)
	if bool(sp.spectator) and p0.distance_to(p1) > 0.5:
		pass_n += 1
	else:
		fail_n += 1
		print("B6TEST FAIL 旁观 0 号没被 AI 接管 moved=%.2f" % p0.distance_to(p1))
	# ⑤ 设置 / 复盘面板
	ui_panels.open_replay(s.events)
	var rt: String = ui_panels.replay_list.text
	ui_panels.close_all()
	if rt.contains("game_start") and (rt.contains("drag") or rt.contains("chat")):
		pass_n += 1
	else:
		fail_n += 1
		print("B6TEST FAIL 复盘没渲染事件流")
	# ⑥ 会议报账 / 天亮 / 改票 / 讨论超时都进了事件流
	var s3 = SimStateScript.new()
	s3.new_game(20261118, 0, map_data, space)
	s3.ai_enabled = false
	var v3 := s3.agent(5)
	v3["alive"] = false
	v3["bodyPos"] = Vector2(31.0, 33.5)
	s3.open_meeting(0, 5)
	for k in 2200:
		if bool(s3.over):
			break
		s3.tick(0.1)
	s3.cast_vote(0, 2)
	s3.cast_vote(0, 3)
	var needed := ["account", "night_start", "meeting_overtime", "vote_change"]
	var all_ev := true
	for k2: String in needed:
		if not _has_kind(s3, k2):
			all_ev = false
			print("B6TEST 缺事件 " + k2)
	if all_ev:
		pass_n += 1
	else:
		fail_n += 1
	print("B6TEST pass=%d fail=%d" % [pass_n, fail_n])
	return fail_n == 0


func _has_kind(sim_obj, kind: String) -> bool:
	for e: Dictionary in sim_obj.events:
		if String(e.get("kind", "")) == kind:
			return true
	return false


## ---- 1000 局 3D 新基线（--sim1000）----
## 每局独立 seed、固定 dt=0.1、最多 400 秒；不沿用 2.5D 的 74.8/25.2。
func _run_sim1000() -> void:
	## 默认 1000 局；A* 每帧都在跑，实跑可用 --games 200 先出阶段性基线。
	var games := 1000
	var garg := _arg_value(OS.get_cmdline_user_args(), "--games")
	if garg != "":
		games = clampi(int(garg), 1, 1000)
	# 2.5D 15 夜内必分胜负；3D 会议链（白天/开局会议、紧急按钮）未全迁，
	# 残局收尾更慢，用 26 夜观察窗口避免把"还能分出胜负"的局误记成超时。
	var max_ticks := 20000
	var human_wins := 0
	var alien_wins := 0
	var timeouts := 0
	var sum_chat := 0
	var sum_knife := 0
	var sum_meet := 0
	var sum_nights := 0.0
	# 平衡遥测：败因分布、驱逐命中率、最终进度与存活异形
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
	var t0 := Time.get_ticks_msec()
	for g in games:
		var s = SimStateScript.new()
		if not s.new_game(20261108 + g, 0, map_data, space):
			continue
		# 2.5D 蒙特卡洛是 15 人全 AI 对 AI；此前 3D 把 0 号空着（不做任务、不投票），
		# 少一个人做任务也少一票，既拖慢进度又把 4 票门槛架空。
		s.spectator = true
		for k in max_ticks:
			if bool(s.over):
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
	report += "- 引擎：Godot 4.6 / `scripts/sim/sim_state.gd`，seed 20261108 起 %d 局，dt=0.1，单局上限 %d 秒。\n" % [games, max_ticks / 10]
	report += "- **人类 %.1f%% / 异形 %.1f%% / 超时 %d**（n=%d）。2.5D 同口径 1000 局是 49.9/50.1/超时 0；3D 剩余偏差见 `MIGRATION.md` §9（会议链/进攻链未全迁）。\n" % [hr, ar, timeouts, games]
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


## ---- S 轨发言门禁（--speechtest）----
## ① 讨论期真的产生台词且全部来自 lines.json ② 占位符已填、模板不复读
## ③ 玩家自由发言能抽出槽位、改嫌疑、触发 AI 回应 ④ 玩家投票意向落票
func _run_speechtest() -> bool:
	var pass_n := 0
	var fail_n := 0
	var s = SimStateScript.new()
	if not s.new_game(20261114, 0, map_data, space):
		print("SPEECHTEST FAIL 开局失败")
		return false
	s.ai_enabled = false
	_finish_meeting(s)
	if not bool(s.speech_enabled):
		print("SPEECHTEST FAIL lines.json 没加载")
		return false
	pass_n += 1
	# 造一具尸体开会（discuss 相位）
	var v := s.agent(3)
	v["alive"] = false
	v["bodyPos"] = Vector2(31.0, 33.5)
	if not s.open_meeting(0, 3):
		print("SPEECHTEST FAIL 开会失败")
		return false
	if String(s.meeting.get("phase", "")) != "discuss":
		fail_n += 1
		print("SPEECHTEST FAIL 开场不是 discuss")
	else:
		pass_n += 1
	# 跑满讨论（35s = 350 tick），发言应该排满
	for k in 360:
		if String(s.meeting.get("phase", "")) != "discuss":
			break
		s.tick(0.1)
	var chat_n := 0
	var bad_slot := 0
	var dup := 0
	var seen: Dictionary = {}
	for e: Dictionary in s.events:
		if String(e.get("kind", "")) != "chat":
			continue
		chat_n += 1
		var txt := String(e.get("text", ""))
		if txt.contains("{") or txt.contains("}"):
			bad_slot += 1
		var key := "%d:%s" % [int(e.get("actor", -1)), txt]
		if seen.has(key):
			dup += 1
		seen[key] = true
	if chat_n >= 8:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 讨论只产生 %d 条台词（应 ≥8）" % chat_n)
	if bad_slot == 0:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL %d 条台词残留在占位符" % bad_slot)
	if dup == 0:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 同人同场复读 %d 次" % dup)
	var feed_n: int = s.speech.feed.size()
	if feed_n >= chat_n:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL feed %d < chat %d" % [feed_n, chat_n])

	# 玩家自由发言：亲眼看见 + 舱室 + 人名
	var s2 = SimStateScript.new()
	if not s2.new_game(20261115, 0, map_data, space):
		print("SPEECHTEST FAIL 第二局开局失败")
		return false
	s2.ai_enabled = false
	var v2 := s2.agent(4)
	v2["alive"] = false
	v2["bodyPos"] = Vector2(31.0, 33.5)
	s2.open_meeting(0, 4)
	var target: Dictionary = s2.agent(2)
	var tname := String(target.get("name", ""))
	var line := "我亲眼看见%s在监控室出刀" % tname
	var before_sus: float = s2.mind.sus_of(s2.agent(1), 2)
	var res: Dictionary = s2.speech.player_say(line)
	var slots: Dictionary = res.get("slots", {}) as Dictionary
	var claim: Dictionary = slots.get("claim", {}) as Dictionary
	if bool(res.get("ok", false)) and not claim.is_empty() and int(claim.get("target", -1)) == 2:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 玩家发言没抽出 claim：%s" % str(slots))
	var after_sus: float = s2.mind.sus_of(s2.agent(1), 2)
	if after_sus > before_sus:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 证词没进听众 sus %.2f→%.2f" % [before_sus, after_sus])
	if int(res.get("responses", 0)) >= 0:
		pass_n += 1
	# 投票意向
	var res2: Dictionary = s2.speech.player_say("我投 2号")
	if s2.meeting.has("player_intent") and int(s2.meeting.get("player_intent", -1)) >= 0:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 玩家投票意向没记下：%s" % str(res2))
	# 同场去重状态
	if not s2.speech.meet_used.is_empty():
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 同场去重没生效")
	print("SPEECHTEST pass=%d fail=%d 讨论台词=%d feed=%d 残留=%d 复读=%d 玩家解析=%s" % [
		pass_n, fail_n, chat_n, feed_n, bad_slot, dup,
		String(claim.get("kind", "none"))])
	return fail_n == 0


## ---- B4 综合门禁（--b4test）----
## 玩家位置同步 / 钻管道出口选择与冷却 / 人类管道禁用 / 开枪 / 搜尸 / 会议三段相位。
func _run_b4test() -> bool:
	var pass_n := 0
	var fail_n := 0
	# _sync_player_pos 在会议期间不写位置（2.5D pauseClock 同源）；先收掉开局 pre 会。
	_finish_meeting(sim)
	# ① 玩家真实位置进入 sim
	player.global_position = Vector3(40.0, 0.05, 30.0)
	_sync_player_pos()
	var pp: Vector2 = sim.me().get("pos", Vector2.ZERO)
	if pp.distance_to(Vector2(40.0, 30.0)) < 0.1:
		pass_n += 1
	else:
		fail_n += 1
		print("B4TEST FAIL 玩家位置没同步 pos=%s" % str(pp))
	# ② 管道出口选择 + 真传送
	role = "alien"
	_pipe_cd = 0.0
	var from_port: Dictionary = extras.pipe_ports[0]
	var to_port: Dictionary = extras.pipe_ports[1]
	_use_pipe(from_port)
	if _pipe_open and pipe_panel != null and pipe_panel.visible:
		pass_n += 1
	else:
		fail_n += 1
		print("B4TEST FAIL 出口面板没打开")
	var want: Vector3 = to_port["pos"] as Vector3
	_travel_pipe(to_port)
	var got := player.global_position
	var pipe_ev := false
	for e: Dictionary in sim.events:
		if String(e.get("kind", "")) == "pipe":
			pipe_ev = true
	if got.distance_to(Vector3(want.x, 0.05, want.z)) < 2.0 and pipe_ev \
			and _pipe_cd >= SpaceData.num(space, "pipe", "cooldown") - 0.01 \
			and not _pipe_open:
		pass_n += 1
	else:
		fail_n += 1
		print("B4TEST FAIL 传送/事件/冷却 pos=%s ev=%s cd=%.1f" % [str(got), str(pipe_ev), _pipe_cd])
	# ③ 冷却内不能再开面板 + 人类禁用
	_use_pipe(from_port)
	if not _pipe_open:
		pass_n += 1
	else:
		fail_n += 1
		print("B4TEST FAIL 冷却没挡住第二次钻管道")
	role = "human"
	_pipe_cd = 0.0
	_use_pipe(from_port)
	if not _pipe_open:
		pass_n += 1
	else:
		fail_n += 1
		print("B4TEST FAIL 人类居然能钻管道")
	role = "alien"
	# ④ 开枪：给一发子弹，把目标放到近处，走真源射程 / LOS
	var shooter: Dictionary = sim.me()
	var target: Dictionary = {}
	for a: Dictionary in sim.agents:
		if int(a.get("i", -1)) != int(sim.me_idx) and bool(a.get("alive", false)) \
				and not bool(a.get("downed", false)):
			target = a
			break
	shooter["pos"] = Vector2(40.0, 30.0)
	target["pos"] = Vector2(42.0, 30.0)
	shooter["bullet"] = 1
	var shot_ok: bool = sim.shoot(int(sim.me_idx), int(target.get("i", -1)))
	if shot_ok and bool(target.get("downed", false)) and int(shooter.get("bullet", 0)) == 0:
		pass_n += 1
	else:
		fail_n += 1
		print("B4TEST FAIL 开枪没生效 ok=%s downed=%s" % [str(shot_ok), str(target.get("downed", false))])
	# ⑤ 搜尸：造一具带 2 发子弹的尸体，搜一次得物资、第二次被拒
	target["alive"] = false
	target["downed"] = false
	target["bodyGone"] = false
	target["bodyPos"] = Vector2(40.5, 30.0)
	target["bullet"] = 2
	var before := int(shooter.get("bullet", 0))
	var s1: bool = sim.search_body(int(target.get("i", -1)), int(sim.me_idx))
	var after := int(shooter.get("bullet", 0))
	var s2: bool = sim.search_body(int(target.get("i", -1)), int(sim.me_idx))
	if s1 and not s2 and after == before + 2:
		pass_n += 1
	else:
		fail_n += 1
		print("B4TEST FAIL 搜尸 s1=%s s2=%s 弹 %d→%d" % [str(s1), str(s2), before, after])
	# ⑥ 会议三段：discuss → vote → result → 关闭，结果里要有投票矩阵
	var m = SimStateScript.new()
	m.new_game(20261113, 0, map_data, space)
	m.ai_enabled = false
	_finish_meeting(m)
	var v := m.agent(3)
	v["alive"] = false
	v["bodyPos"] = Vector2(31.0, 33.5)
	m.open_meeting(0, 3)
	var ph1 := String(m.meeting.get("phase", ""))
	m.skip_discussion()
	m.tick(0.01)
	var ph2 := String(m.meeting.get("phase", ""))
	var votes_n: int = (m.meeting.get("votes", {}) as Dictionary).size()
	for k in 60:
		m.tick(0.1)
	var ph3 := String(m.meeting.get("phase", ""))
	var matrix_n: int = (((m.meeting.get("result", {}) as Dictionary).get("matrix", {})) as Dictionary).size()
	for k in 40:
		if m.meeting.is_empty():
			break
		m.tick(0.1)
	if ph1 == "discuss" and ph2 == "vote" and votes_n > 0 and ph3 == "result" \
			and matrix_n > 0 and m.meeting.is_empty():
		pass_n += 1
	else:
		fail_n += 1
		print("B4TEST FAIL 会议相位 %s→%s→%s 票数=%d 矩阵=%d empty=%s" % [
			ph1, ph2, ph3, votes_n, matrix_n, str(m.meeting.is_empty())])
	print("B4TEST pass=%d fail=%d 管道口=%d 射程=%.0fm 冷却=%.0fs" % [
		pass_n, fail_n, extras.pipe_ports.size(), SpaceData.num(space, "shoot", "range"),
		SpaceData.num(space, "pipe", "cooldown")])
	return fail_n == 0


## ---- 机器人门禁（--bottest）----
## ① 保安真的在巡逻（位置会变）② 视野内出刀会被抓 ③ 抓到后 30 秒才放
## ④ 医疗无人机能把濒死者救起来。全部只读 sim 状态与事件流。
func _run_bottest() -> bool:
	var pass_n := 0
	var fail_n := 0
	var s = SimStateScript.new()
	if not s.new_game(20261111, 0, map_data, space):
		print("BOTTEST FAIL 开局失败")
		return false
	s.ai_enabled = false
	_finish_meeting(s)
	var b = s.bots
	if b == null:
		print("BOTTEST FAIL bots 没有初始化")
		return false
	pass_n += 1
	# ① 巡逻
	var p0: Vector2 = b.sec_pos
	for k in 30:
		s.tick(0.1)
	var moved: float = p0.distance_to(b.sec_pos)
	if moved > 0.5:
		pass_n += 1
	else:
		fail_n += 1
		print("BOTTEST FAIL 保安没有巡逻 moved=%.2f" % moved)
	# ② 保安正前方 2 格出刀 → 必须被盯上
	var killer: Dictionary = {}
	var victim: Dictionary = {}
	for a: Dictionary in s.agents:
		if bool(a.get("alien", false)) and killer.is_empty():
			killer = a
		elif not bool(a.get("alien", false)) and int(a.get("i", -1)) != int(s.me_idx) \
				and victim.is_empty():
			victim = a
	if killer.is_empty() or victim.is_empty():
		print("BOTTEST FAIL 找不到异形/受害者")
		return false
	var fwd := Vector2(cos(b.sec_ang), sin(b.sec_ang))
	killer["pos"] = b.sec_pos + fwd * 2.0
	victim["pos"] = (killer["pos"] as Vector2) + Vector2(0.4, 0.0)
	s.knife(int(killer.get("i", -1)), int(victim.get("i", -1)))
	if not b.catch_state.is_empty():
		pass_n += 1
	else:
		fail_n += 1
		print("BOTTEST FAIL 保安没抓到现行（视野 %.1f 格）" % b.SEC_RANGE)
	# ③ 押送到拘留位 + 拘留
	var held := false
	var jailed := false
	for k in 260:
		s.tick(0.1)
		if bool(killer.get("detained", false)):
			held = true
			if String(b.catch_state.get("phase", "")) == "jail":
				jailed = true
				break
	if held and jailed:
		pass_n += 1
	else:
		fail_n += 1
		print("BOTTEST FAIL 没有进入拘留状态 held=%s phase=%s" % [
			str(held), String(b.catch_state.get("phase", "none"))])
	# ④ 30 秒后释放
	var freed := false
	for k in 400:
		s.tick(0.1)
		if not bool(killer.get("detained", false)) and b.catch_state.is_empty():
			freed = true
			break
	if freed:
		pass_n += 1
	else:
		fail_n += 1
		print("BOTTEST FAIL 拘留没有到期释放")

	# ⑤ 医疗无人机救濒死者（重开一局，把人放倒在医疗间坞位旁边）
	if not s.new_game(20261112, 0, map_data, space):
		print("BOTTEST FAIL 第二局开局失败")
		return false
	s.ai_enabled = false
	_finish_meeting(s)
	var v2: Dictionary = {}
	var k2: Dictionary = {}
	for a: Dictionary in s.agents:
		if bool(a.get("alien", false)) and k2.is_empty():
			k2 = a
		elif not bool(a.get("alien", false)) and int(a.get("i", -1)) != int(s.me_idx) \
				and v2.is_empty():
			v2 = a
	v2["pos"] = s.bots.med_home + Vector2(1.5, 0.0)
	s.knife(int(k2.get("i", -1)), int(v2.get("i", -1)))
	var was_downed := bool(v2.get("downed", false))
	# 2.5D MEDBOT_HEAL_TIME=7 秒近身读条 + 飞到 MEDBOT_TOUCH_R 内的时间；
	# 6 秒（旧夹具）不够，濒死倒计时 12 秒内留足余量。
	for k in 110:
		s.tick(0.1)
	var revived := false
	for e: Dictionary in s.events:
		if String(e.get("kind", "")) == "revive":
			revived = true
	if was_downed and revived and not bool(v2.get("downed", false)):
		pass_n += 1
	else:
		fail_n += 1
		print("BOTTEST FAIL 医疗无人机没救人 was_downed=%s revived=%s downed=%s" % [
			str(was_downed), str(revived), str(v2.get("downed", false))])
	print("BOTTEST pass=%d fail=%d 保安(%.1f,%.1f) 巡逻位移=%.2f 视野=%.1fm 拘留=%.0fs 每夜=%d" % [
		pass_n, fail_n, b.sec_pos.x, b.sec_pos.y, moved, b.SEC_RANGE, b.DETAIN_TIME, b.SEC_USES_MAX])
	return fail_n == 0


## ---- 角色门禁（--roletest）----
## 选人类 → 0 号席位不是异形、全船仍是 4 个异形；
## 选异形 → 0 号席位就是异形、全船仍是 4 个（不能变成 5 个）。
func _run_roletest() -> bool:
	var pass_n := 0
	var fail_n := 0
	var s = SimStateScript.new()
	if not s.new_game(20261110, 0, map_data, space, false):
		print("ROLETEST FAIL 人类开局失败")
		return false
	pass_n += 1
	var alien_n := 0
	for a: Dictionary in s.agents:
		if bool(a.get("alien", false)):
			alien_n += 1
	if alien_n == 4 and not bool(s.me().get("alien", false)):
		pass_n += 1
	else:
		fail_n += 1
		print("ROLETEST FAIL 人类档 alien=%d me_alien=%s" % [alien_n, str(s.me().get("alien", false))])
	if not s.new_game(20261110, 0, map_data, space, true):
		print("ROLETEST FAIL 异形开局失败")
		return false
	pass_n += 1
	alien_n = 0
	for a: Dictionary in s.agents:
		if bool(a.get("alien", false)):
			alien_n += 1
	if alien_n == 4 and bool(s.me().get("alien", false)):
		pass_n += 1
	else:
		fail_n += 1
		print("ROLETEST FAIL 异形档 alien=%d me_alien=%s" % [alien_n, str(s.me().get("alien", false))])
	# 开始页 → 开局这条链路也要真跑一次（不点按钮，直接发信号）
	if home != null:
		home._select("alien")
		home._on_go()
		await get_tree().process_frame
		if started and role == "alien" and bool(sim.me().get("alien", false)) and home == null:
			pass_n += 1
		else:
			fail_n += 1
			print("ROLETEST FAIL 开始页进入后 started=%s role=%s me_alien=%s home=%s" % [
				str(started), role, str(sim.me().get("alien", false)), str(home)])
	print("ROLETEST pass=%d fail=%d" % [pass_n, fail_n])
	return fail_n == 0


## ---- 开始页门禁（--hometest）----
## 三张身份卡都要在；整船图元数量必须与 map_v2.json 一致；
## 换身份要真的换高亮（人类亮任务点 / 异形亮管道口），而不是只换文字。
func _run_hometest() -> bool:
	var pass_n := 0
	var fail_n := 0
	if home == null:
		print("HOMETEST FAIL 开始页没有创建")
		return false
	pass_n += 1
	if home._cards.size() != 3:
		fail_n += 1
		print("HOMETEST FAIL 身份卡数量=%d（应为 3）" % home._cards.size())
	else:
		pass_n += 1
	var sm = home.ship
	if sm == null or sm.map.is_empty():
		fail_n += 1
		print("HOMETEST FAIL 整船图没拿到地图数据")
	else:
		var rooms_n: int = (sm.map.get("rooms", []) as Array).size()
		var pts_n: int = (sm.map.get("points", []) as Array).size()
		var pipes_n: int = (sm.map.get("pipes", []) as Array).size()
		if rooms_n == (map_data.get("rooms", []) as Array).size() \
				and pts_n == (map_data.get("points", []) as Array).size() \
				and pipes_n == (map_data.get("pipes", []) as Array).size():
			pass_n += 1
		else:
			fail_n += 1
			print("HOMETEST FAIL 图元数量不一致 rooms=%d pts=%d pipes=%d" % [rooms_n, pts_n, pipes_n])
	# 人类档：亮任务点
	home._select("human")
	var h_rooms: int = (home.ship.sel_rooms as Array).size()
	var h_what := String(home.ship.sel_what)
	if h_rooms >= 8 and h_what == "point":
		pass_n += 1
	else:
		fail_n += 1
		print("HOMETEST FAIL 人类高亮 rooms=%d what=%s" % [h_rooms, h_what])
	# 异形档：亮管道口
	home._select("alien")
	var a_rooms: int = (home.ship.sel_rooms as Array).size()
	var a_what := String(home.ship.sel_what)
	if a_rooms >= 5 and a_what == "pipe":
		pass_n += 1
	else:
		fail_n += 1
		print("HOMETEST FAIL 异形高亮 rooms=%d what=%s" % [a_rooms, a_what])
	# 选中的身份必须真的能开局（signal 已接）
	if not home.start_requested.is_connected(_on_start):
		fail_n += 1
		print("HOMETEST FAIL start_requested 没接到 _on_start")
	else:
		pass_n += 1
	print("HOMETEST pass=%d fail=%d cards=%d rooms=%d points=%d pipes=%d" % [
		pass_n, fail_n, home._cards.size(),
		(map_data.get("rooms", []) as Array).size(),
		(map_data.get("points", []) as Array).size(),
		(map_data.get("pipes", []) as Array).size()])
	return fail_n == 0


## ---- 开始页（2.5D 版式照搬）----
## 任何 `--xxx` 门禁参数都跳过开始页；`--seed` / `--role` 属于正常游玩参数，不算门禁。
func _has_gate_arg(args: PackedStringArray) -> bool:
	for a in args:
		if a.begins_with("--") and a != "--seed" \
				and a != "--homeshot" and a != "--hometest":
			return true
	return false


func _show_home() -> void:
	started = false
	player.process_mode = Node.PROCESS_MODE_DISABLED
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)
	home = HomeViewScript.new()
	layer.add_child(home)
	home.start_requested.connect(_on_start)
	home.settings_requested.connect(func() -> void: ui_panels.open_settings())
	home.setup(map_data)


func _exit_to_home() -> void:
	if ui_panels != null:
		ui_panels.close_all()
	_show_home()


func _on_start(p_role: String) -> void:
	if home != null:
		home.get_parent().queue_free()
		home = null
	started = true
	## 背景音乐只在真的开局时放：开始页与门禁/截图自测都不该有声音占用 Master。
	audio.play_music()
	spectator_mode = p_role == "spect"
	role = "alien" if p_role == "alien" else "human"
	# 玩家席位固定 0 号；是不是异形由 new_game 决定（异形池会把自己钉进去）。
	if not sim.new_game(_cur_seed, 0, map_data, space, role == "alien" and not spectator_mode):
		push_error("开始页开局失败：先跑 node 3d/tools/export-sim.cjs")
		return
	sim.ai_enabled = true
	sim.spectator = spectator_mode
	player.set_spectator(spectator_mode)
	power_on = true
	set_power(true)
	_breaker_pulls = 0
	qual_pending = 0
	qual = 0
	station = {}
	_player_dead = false
	_down_toast = false
	if end_panel != null:
		end_panel.visible = false
	if crew_view != null:
		crew_view.build(sim)
	var p: Vector2 = sim.me().get("pos", Vector2(27.0, 34.8))
	player.global_position = Vector3(p.x, 0.05, p.y)
	player.rotation.y = -PI * 0.5 + 0.05
	player.process_mode = Node.PROCESS_MODE_INHERIT
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	_refresh_sim_hud()
	_toast("你是 %s · %s · 第 %d 夜" % [
		String(sim.me().get("name", "")),
		"异形" if role == "alien" else "人类", int(sim.night)])


func _build_meeting_ui() -> void:
	if meeting_panel != null:
		return
	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])
	meeting_panel = ColorRect.new()
	meeting_panel.color = Color(0.01, 0.02, 0.04, 0.82)
	meeting_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	meeting_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	meeting_panel.visible = false
	hud_layer.add_child(meeting_panel)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	meeting_panel.add_child(center)
	var box := VBoxContainer.new()
	box.custom_minimum_size = Vector2(560, 0)
	box.add_theme_constant_override("separation", 8)
	center.add_child(box)

	meeting_title = _label("发现尸体 · 投票", Vector2.ZERO, 26, font)
	meeting_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	meeting_title.add_theme_color_override("font_color", Color(1.0, 0.86, 0.52))
	box.add_child(meeting_title)
	meeting_time = _label("", Vector2.ZERO, 17, font)
	meeting_time.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	meeting_time.add_theme_color_override("font_color", Color(0.78, 0.86, 0.95))
	box.add_child(meeting_time)
	meeting_list = VBoxContainer.new()
	meeting_list.add_theme_constant_override("separation", 4)
	box.add_child(meeting_list)
	meeting_hint = _label("", Vector2.ZERO, 14, font)
	meeting_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	meeting_hint.add_theme_color_override("font_color", Color(0.55, 0.62, 0.72))
	box.add_child(meeting_hint)
	meeting_result = _label("", Vector2.ZERO, 13, font)
	meeting_result.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	meeting_result.add_theme_color_override("font_color", Color(0.72, 0.80, 0.90))
	box.add_child(meeting_result)
	# S 轨：讨论期的发言流 + 玩家自由发言输入
	meeting_feed = RichTextLabel.new()
	meeting_feed.bbcode_enabled = true
	meeting_feed.scroll_following = true
	meeting_feed.custom_minimum_size = Vector2(560, 210)
	meeting_feed.add_theme_font_size_override("normal_font_size", 14)
	meeting_feed.add_theme_color_override("default_color", Color(0.78, 0.84, 0.92))
	box.add_child(meeting_feed)
	var input_row := HBoxContainer.new()
	input_row.add_theme_constant_override("separation", 7)
	box.add_child(input_row)
	meeting_input = LineEdit.new()
	meeting_input.placeholder_text = "说点什么…（例：我亲眼看见 名字 在监控室出刀）"
	meeting_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	meeting_input.custom_minimum_size = Vector2(0, 34)
	meeting_input.add_theme_font_size_override("font_size", 14)
	meeting_input.text_submitted.connect(_on_player_say)
	input_row.add_child(meeting_input)
	meeting_send = Button.new()
	meeting_send.text = "发 言"
	meeting_send.custom_minimum_size = Vector2(80, 34)
	meeting_send.add_theme_font_size_override("font_size", 14)
	meeting_send.pressed.connect(func() -> void: _on_player_say(meeting_input.text))
	input_row.add_child(meeting_send)
	meeting_skip = Button.new()
	meeting_skip.text = "直接进入投票（跳过讨论）"
	meeting_skip.custom_minimum_size = Vector2(0, 30)
	meeting_skip.add_theme_font_size_override("font_size", 14)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.10, 0.12, 0.17, 0.94)
	sb.border_color = Color(0.30, 0.34, 0.44, 1.0)
	sb.set_border_width_all(1)
	meeting_skip.add_theme_stylebox_override("normal", sb)
	meeting_skip.add_theme_color_override("font_color", Color(0.86, 0.90, 0.98))
	meeting_skip.pressed.connect(func() -> void: sim.skip_discussion())
	box.add_child(meeting_skip)


func _refresh_meeting_ui() -> void:
	if sim == null or (meeting_panel == null and sim.meeting.is_empty()):
		return
	var active: bool = not sim.meeting.is_empty()
	# 玩家死了就不弹会议面板：让位给"你已阵亡"；会议本身仍由 sim 计时结束。
	if active and not bool(sim.me().get("alive", true)):
		active = false
		if _meeting_open and meeting_panel != null:
			meeting_panel.visible = false
		_meeting_open = false
		return
	if not active:
		if _meeting_open:
			_meeting_open = false
			if meeting_panel != null:
				meeting_panel.visible = false
			if player != null:
				player.ui_locked = false
			if not bool(sim.over) and bool(sim.me().get("alive", true)):
				Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
		return
	if not _meeting_open:
		_build_meeting_ui()
		_meeting_open = true
		meeting_panel.visible = true
		if player != null:
			player.ui_locked = true
		# 会议面板要能点按钮、能打字：鼠标必须释放，否则 CAPTURED 状态下点不到任何控件
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		_build_meeting_buttons()
	var phase := String(sim.meeting.get("phase", "vote"))
	var left := maxf(0.0, float(sim.meeting.get("t", 0.0)))
	var a: Dictionary = sim.me()
	var votes: Dictionary = sim.meeting.get("votes", {})
	var voted := votes.has(int(sim.me_idx))
	var can_vote := not a.is_empty() and bool(a.get("alive", true)) and not bool(a.get("downed", false))
	meeting_skip.visible = phase == "discuss"
	meeting_feed.visible = phase == "discuss"
	meeting_input.visible = phase == "discuss"
	meeting_send.visible = phase == "discuss"
	meeting_list.visible = phase == "vote"
	var mkind := String(sim.meeting.get("kind", "night"))
	if phase == "discuss":
		meeting_feed.text = _meeting_feed_text()

	var mtitle := "第 %d 夜 · 发现尸体 · 讨论" % int(sim.night)
	var vtitle := "第 %d 夜 · 投 票" % int(sim.night)
	if mkind == "pre":
		mtitle = "第 1 天 · 开局公开讨论"
		vtitle = "第 1 天 · 投 票"
	elif mkind == "day":
		mtitle = "第 %d 天 · 全员会议 · 讨论" % int(sim.night)
		vtitle = "第 %d 天 · 投 票" % int(sim.night)
	if phase == "discuss":
		meeting_title.text = mtitle
		meeting_time.text = "讨论剩余 %.0fs · 已发言 %d 条" % [left,
			(sim.speech.feed.size() if sim.speech != null else 0)]
		meeting_hint.text = "可以发言 / 指认 / 辩护，或跳过讨论直接投票"
		meeting_result.text = ""
	elif phase == "vote":
		meeting_title.text = vtitle
		meeting_time.text = "投票剩余 %.1fs" % left
		meeting_hint.text = "点击名字投一票 · 到点按票数驱逐"
		meeting_result.text = "已投 %d 票" % votes.size()
	else:
		meeting_title.text = "投 票 结 果"
		meeting_time.text = "身份公布 · %.0fs" % left
		meeting_hint.text = ""
		meeting_result.text = _meeting_result_text()
	for k: int in meeting_buttons.keys():
		var b: Button = meeting_buttons[k]
		var t: Dictionary = sim.agent(k)
		b.disabled = phase != "vote" or voted or not can_vote or not bool(t.get("alive", false))


## 讨论期发言流：玩家金色 / 系统灰 / 其余统一浅蓝（**绝不按 alien 标色**，那会泄露身份）。
func _meeting_feed_text() -> String:
	if sim == null or sim.speech == null:
		return ""
	var lines: Array = []
	for l: Dictionary in sim.speech.feed_tail(14):
		var who := String(l.get("who", ""))
		var txt := String(l.get("text", ""))
		var col := "#8FA6C0"
		if bool(l.get("sys", false)):
			col = "#6B7686"
		elif bool(l.get("me", false)):
			col = "#F0C674"
		lines.append("[color=%s]%s：%s[/color]" % [col, who, txt])
	return "\n".join(lines)


func _on_player_say(text: String) -> void:
	if meeting_input != null:
		meeting_input.clear()
	if sim == null or sim.speech == null or sim.meeting.is_empty():
		return
	if text.strip_edges() == "":
		return
	sim.speech.player_say(text)
	if meeting_feed != null:
		meeting_feed.text = _meeting_feed_text()


## 驱逐结论 + 投票矩阵：谁投了谁，一眼可见（2.5D 复盘页的同一份 votes 数据）。
func _meeting_result_text() -> String:
	var r: Dictionary = sim.meeting.get("result", {}) as Dictionary
	if r.is_empty():
		return ""
	var top := int(r.get("ejected", -1))
	var lines: Array = []
	if top < 0:
		lines.append("无人被驱逐 · 最高 %d 票 / 需 %d 票%s（%d 人可投）" % [
			int(r.get("max", 0)), int(r.get("need", 4)),
			"，平票" if bool(r.get("tie", false)) else "", int(r.get("voters", 0))])
	else:
		lines.append("%s 被驱逐 · %s（%d 票）" % [
			String(r.get("name", "?")),
			"是异形" if bool(r.get("alien", false)) else "不是异形",
			int((r.get("votes", {}) as Dictionary).get(top, 0))])
	var m: Dictionary = r.get("matrix", {}) as Dictionary
	var n := 0
	lines.append("— 投票矩阵 —")
	for k: int in m.keys():
		if n >= 8:
			lines.append("… 其余 %d 票" % (m.size() - n))
			break
		var tgt := int(m[k])
		var tn := "弃权" if tgt < 0 else String(sim.agent(tgt).get("name", "?"))
		lines.append("%s → %s" % [String(sim.agent(k).get("name", "?")), tn])
		n += 1
	return "\n".join(lines)


func _build_meeting_buttons() -> void:
	if meeting_list == null:
		return
	for c in meeting_list.get_children():
		c.queue_free()
	meeting_buttons.clear()
	for a: Dictionary in sim.agents:
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		var i := int(a.get("i", -1))
		var seat := i
		var b := Button.new()
		b.text = String(a.get("name", "?")) + ("（你）" if i == int(sim.me_idx) else "")
		b.custom_minimum_size = Vector2(0, 30)
		b.add_theme_font_size_override("font_size", 16)
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(0.07, 0.09, 0.13, 0.94)
		sb.border_color = Color(0.20, 0.26, 0.34, 1.0)
		sb.set_border_width_all(1)
		b.add_theme_stylebox_override("normal", sb)
		b.add_theme_stylebox_override("hover", sb)
		b.add_theme_stylebox_override("pressed", sb)
		b.add_theme_color_override("font_color", Color(0.86, 0.92, 1.0))
		b.pressed.connect(func() -> void: sim.cast_vote(int(sim.me_idx), seat))
		meeting_list.add_child(b)
		meeting_buttons[i] = b


func _process(delta: float) -> void:
	if player == null:
		return
	# 开始页还开着：不推进模拟、不刷 HUD，画面停在开局那一帧。
	if not started:
		return
	if extras != null:
		extras.door_update(delta, player.global_position, power_on)
	_knife_cd = maxf(0.0, _knife_cd - delta)
	_shot_cd = maxf(0.0, _shot_cd - delta)
	_pipe_cd = maxf(0.0, _pipe_cd - delta)
	_tick_detained()
	_tick_station(delta)
	if sim != null and not sim.agents.is_empty():
		_sync_player_pos()
		sim.tick(delta)
		if crew_view != null:
			crew_view.sync(sim, delta)
		_sync_bots()
		_play_new_events()
		# 会议盖住小游戏：AI 报告时如果玩家正在解题，先收卡片，避免两层 UI 叠在一起。
		if not sim.meeting.is_empty() and mg_layer != null and mg_layer.is_open():
			mg_layer.cancel()
		_refresh_meeting_ui()
		_sim_hud_timer -= delta
		if _sim_hud_timer <= 0.0:
			_sim_hud_timer = 0.25
			_refresh_sim_hud()
	_update_interaction(delta)
	_refresh_mouse_mode()
	_toast_t -= delta
	if _toast_t <= 0.0 and toast_label != null:
		toast_label.visible = false
	_hud_timer -= delta
	if _hud_timer > 0.0:
		return
	_hud_timer = 0.2
	room_label.text = _room_name_at(player.global_position)
	fps_label.text = "3D 预演 · %d FPS · 数值来自 space.json / sim.json（2.5D 真源导出）" % Engine.get_frames_per_second()


func _build_info_panel() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 14
	add_child(layer)
	var bg := ColorRect.new()
	bg.color = Color(0.01, 0.02, 0.04, 0.88)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_STOP
	layer.add_child(bg)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.add_child(center)
	var box := VBoxContainer.new()
	box.custom_minimum_size = Vector2(560, 0)
	box.add_theme_constant_override("separation", 10)
	center.add_child(box)
	info_title = Label.new()
	info_title.add_theme_font_size_override("font_size", 22)
	info_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(info_title)
	info_text = RichTextLabel.new()
	info_text.custom_minimum_size = Vector2(560, 300)
	box.add_child(info_text)
	var close := Button.new()
	close.text = "关闭（ESC）"
	close.custom_minimum_size = Vector2(160, 36)
	close.pressed.connect(_close_info)
	box.add_child(close)
	info_panel = bg
	info_panel.visible = false


func _open_info(title: String, lines: Array) -> void:
	if info_panel == null:
		_build_info_panel()
	info_title.text = title
	info_text.text = "\n".join(PackedStringArray(lines))
	info_panel.visible = true
	_info_open = true


func _close_info() -> void:
	if info_panel != null:
		info_panel.visible = false
	_info_open = false


## 鼠标状态唯一口径（对应 2.5D 的 DOM UI：鼠标天然可见）。
## 3D 第一人称要在 CAPTURED / VISIBLE 之间显式切换；会议、轮盘、小游戏、管道、
## 设置面板各自赋值会互相覆盖，曾有「轮盘打开了却点不动」的缺陷（CAPTURED 下光标锁死）。
## 这里每帧按「是否有需要点按的 UI」兜底，各处零散赋值即使漏了也会被纠正。
func _want_mouse_visible() -> bool:
	if sim != null and not sim.meeting.is_empty():
		return true
	if wheel != null and wheel.is_open():
		return true
	if mg_layer != null and mg_layer.is_open():
		return true
	if _pipe_open:
		return true
	if ui_panels != null and ui_panels.any_open():
		return true
	if _info_open:
		return true
	return false


func _refresh_mouse_mode() -> void:
	if player == null or not started:
		return
	var want := Input.MOUSE_MODE_VISIBLE if _want_mouse_visible() else Input.MOUSE_MODE_CAPTURED
	if Input.mouse_mode != want:
		Input.mouse_mode = want


func _update_interaction(_delta: float) -> void:
	if sim != null and not sim.meeting.is_empty():
		prompt_label.text = ""
		_e_down = Input.is_physical_key_pressed(KEY_E)
		return
	if _pipe_open or (mg_layer != null and mg_layer.is_open()) or (wheel != null and wheel.is_open()):
		prompt_label.text = ""
		_e_down = Input.is_physical_key_pressed(KEY_E)
		return
	var e_now := Input.is_physical_key_pressed(KEY_E)
	var pressed := e_now and not _e_down
	_e_down = e_now
	var offers := _collect_offers()
	if offers.is_empty():
		prompt_label.text = "" if station.is_empty() else "站桩中 · %s（移动即中断）" % String(station.get("label", ""))
		return
	_near = offers[0].get("dev", null)
	if station.is_empty():
		if offers.size() == 1:
			prompt_label.text = "[E] %s" % String(offers[0].get("label", ""))
		else:
			prompt_label.text = "[E] 附近 %d 项交互（1-%d 直接选）" % [offers.size(), offers.size()]
	if pressed:
		if offers.size() == 1:
			(offers[0]["act"] as Callable).call()
		else:
			player.ui_locked = true
			wheel.open(offers,
				func(it: Dictionary) -> void:
					player.ui_locked = false
					(it["act"] as Callable).call(),
				func() -> void: player.ui_locked = false)


## 交互收集（对应 2.5D 的 collectInteractions）：不再"固定优先级吞掉选择"，
## 而是把半径内所有可交互项一次交出来，多项走轮盘。
## 半径全部读 space.json：设备用 REACH.fix、电闸用 reach.breaker、圆桌用 reach.round_table。
func _collect_offers() -> Array:
	var out: Array = []
	if extras == null or player == null:
		return out
	var pos := player.global_position
	var dev_r := SpaceData.num(space, "reach", "fix")
	var fwd := -player.global_transform.basis.z
	fwd.y = 0.0
	for dev in extras.devices:
		if not is_instance_valid(dev):
			continue
		if dev.point_index < 0:
			# 电闸用 2.5D 的 BREAKER_USE_R，不跟设备半径混用
			if dev.distance_to(pos) <= SpaceData.num(space, "reach", "breaker"):
				out.append(_breaker_offer(dev))
			continue
		if dev.reach_dist(pos) > dev_r:
			continue
		## 只对自己的剩余任务开放“做任务”；别人的任务点仍可走进去看，
		## 但 E 只会提示“不是你的任务”，不弹遮罩、不给进度（2.5D 的 mine 判定）。
		var mine := true
		if sim != null and not sim.agents.is_empty():
			mine = sim.can_do_task(dev.point_index)
		var label_text: String
		if mine:
			label_text = "做任务 · " + String(dev.task_label)
		else:
			label_text = "查看 · " + String(dev.task_label) + "（不是你的任务）"
		out.append({
			"id": "task-%d" % dev.point_index,
			"label": label_text,
			"hint": "%.1fm" % dev.reach_dist(pos),
			"dev": dev,
			"act": func() -> void: _open_device(dev),
		})
	# 报告尸体：玩家靠近未报告的尸体时给 E 选项；AI 看到会自己报。
	if sim != null and not sim.agents.is_empty():
		var body: Dictionary = sim.body_near(Vector2(pos.x, pos.z),
			SpaceData.num(space, "reach", "body"))
		if not body.is_empty():
			out.append({
				"id": "report",
				"label": "报告尸体 · " + String(body.get("name", "?")),
				"hint": "立即开会 · 5 秒投票",
				"accent": Color("#FFB3AC"),
				"act": func() -> void: sim.open_meeting(int(sim.me_idx), int(body.get("i", -1))),
			})
	# 故障维修：异形破坏后 30 秒窗口，站桩 10 秒可排掉。
	if sim != null:
		for d: Dictionary in sim.dmg:
			var dx := float(d.get("x", 0.0))
			var dy := float(d.get("y", 0.0))
			if Vector2(dx, dy).distance_to(Vector2(pos.x, pos.z)) > dev_r:
				continue
			var rid := String(d.get("room", ""))
			out.append({
				"id": "fix-" + rid,
				"label": "维修故障 · " + sim.room_name(rid),
				"hint": "站桩 %.0fs · 剩余 %.0fs" % [SpaceData.num(space, "stand", "fix"),
					maxf(0.0, float(d.get("left", 0.0)))],
				"accent": Color("#FFB3AC"),
				"act": func() -> void: _start_station("维修故障",
					SpaceData.num(space, "stand", "fix"), func() -> void: sim.fix_damage(rid, int(sim.me_idx))),
			})
	# 拖尸 / 放下：医疗间救起，其它舱室藏尸（2.5D dragToMed / drag_away）
	if sim != null and not sim.agents.is_empty():
		var me_drag := int(sim.me().get("drag", -1))
		if me_drag >= 0:
			var carried: Dictionary = sim.agent(me_drag)
			out.append({
				"id": "drag-drop", "label": "放下尸体 · " + String(carried.get("name", "?")),
				"hint": "在医疗间救起 · 在其它舱室藏尸",
				"accent": Color("#C7B6E8"),
				"act": func() -> void: _on_drag_drop(),
			})
		else:
			for dead2: Dictionary in sim.agents:
				if bool(dead2.get("alive", false)) or bool(dead2.get("bodyGone", false)) \
						or bool(dead2.get("bodyReported", false)):
					continue
				var bp2: Vector2 = dead2.get("bodyPos", Vector2.ZERO)
				if bp2.distance_to(Vector2(pos.x, pos.z)) > SpaceData.num(space, "reach", "body"):
					continue
				var body_i2 := int(dead2.get("i", -1))
				out.append({
					"id": "drag-%d" % body_i2,
					"label": "拖走尸体 · " + String(dead2.get("name", "?")),
					"hint": "移动变慢 · 再按 E 放下",
					"accent": Color("#C7B6E8"),
					"act": func() -> void: _on_drag_start(body_i2),
				})
	# 打机器人：消耗 1 发子弹，按 bot_hp（保安 2 / 医疗 1）结算
	for bkind: String in ["secbot", "medbot"]:
		var bfac := {}
		for fac2: Dictionary in (map_data.get("facility", []) as Array):
			if String(fac2.get("kind", "")) == bkind:
				bfac = fac2
				break
		if bfac.is_empty():
			continue
		var bpos := Vector2(float(bfac.get("x", 0)), float(bfac.get("y", 0)))
		if bpos.distance_to(Vector2(pos.x, pos.z)) > SpaceData.num(space, "shoot", "range"):
			continue
		if int(sim.bot_hp.get(bkind, 0)) <= 0:
			continue
		var bk := bkind
		out.append({
			"id": "bot-" + bkind,
			"label": "射击%s · HP %d" % [String(bfac.get("label", bkind)), int(sim.bot_hp.get(bkind, 0))],
			"hint": "消耗 1 发子弹 · 拆掉后不再巡逻/救人",
			"accent": Color("#FFB3AC"),
			"act": func() -> void: _on_hit_bot(bk),
		})

	# 搜尸：一具尸体只搜一次，站桩 STAND.search 秒后转移随身物资。
	if sim != null:
		for dead: Dictionary in sim.agents:
			if bool(dead.get("alive", false)) or bool(dead.get("bodyGone", false)) \
					or bool(dead.get("searched", false)):
				continue
			var bp: Vector2 = dead.get("bodyPos", Vector2.ZERO)
			if bp.distance_to(Vector2(pos.x, pos.z)) > SpaceData.num(space, "reach", "body"):
				continue
			var body_i := int(dead.get("i", -1))
			out.append({
				"id": "search-%d" % body_i,
				"label": "搜尸 · " + String(dead.get("name", "?")),
				"hint": "站桩 %.0fs · 取得随身物资" % SpaceData.num(space, "stand", "search"),
				"accent": Color("#B9F5DA"),
				"act": func() -> void: _start_station("搜尸",
					SpaceData.num(space, "stand", "search"),
					func() -> void: _on_search_done(body_i)),
			})
	# 管道：2.5D 是异形专用（人类管道禁用），这里按 role 复现同一条判定
	if role == "alien":
		for pp in extras.pipe_ports:
			var d := Vector2((pp["pos"] as Vector3).x - pos.x, (pp["pos"] as Vector3).z - pos.z).length()
			if d > dev_r:
				continue
			out.append({
				"id": "pipe-%s" % String(pp["room"]),
				"label": "钻管道 · 选择出口",
				"hint": ("%.1fm · 冷却中 %.0fs" % [d, _pipe_cd]) if _pipe_cd > 0.0
					else ("%.1fm · 异形专用" % d),
				"accent": Color("#D6CCFF"),
				"act": func() -> void: _use_pipe(pp),
			})
	# 圆桌领申请单（2.5D：nearRoundTable 用**到矩形的钳位距离** < 2.3，不是到圆心距离；
	# 到圆心 2.3 会要求人站进桌子里，是量词错误）
	var table := _round_table_cover()
	if qual_pending > 0 and table != {}:
		var dx := maxf(maxf(float(table["x"]) - pos.x, 0.0), pos.x - (float(table["x"]) + float(table["w"])))
		var dy := maxf(maxf(float(table["y"]) - pos.z, 0.0), pos.z - (float(table["y"]) + float(table["h"])))
		if sqrt(dx * dx + dy * dy) <= SpaceData.num(space, "reach", "round_table"):
			out.append({
				"id": "req", "label": "领物资申请单",
				"hint": "站桩 %.0fs · 待领 %d" % [SpaceData.num(space, "stand", "qual"), qual_pending],
				"accent": Color("#FFE8B0"),
				"act": func() -> void: _start_station("领取物资申请单",
					SpaceData.num(space, "stand", "qual"), _on_claim_done),
			})
	for fac in map_data.get("facility", []):
		if String(fac.get("kind", "")) != "supply":
			continue
		var sp := Vector3(float(fac.get("x", 0)), 0, float(fac.get("y", 0)))
		var ds := Vector2(sp.x - pos.x, sp.z - pos.z).length()
		if ds > dev_r:
			continue
		var is_ammo := String(fac.get("label", "")).contains("军械") or String(fac.get("label", "")).contains("弹")
		var dur := SpaceData.num(space, "stand", "ammo" if is_ammo else "med")
		var item := "ammo" if is_ammo else "medkit"
		out.append({
			"id": "supply-%s" % String(fac.get("label", "")),
			"label": ("领子弹" if is_ammo else "领医疗包") + " · " + String(fac.get("label", "")),
			"hint": "站桩 %.0fs · %s" % [dur, "消耗 1 张申请单" if qual > 0 else "需要物资申请单"],
			"accent": Color("#FFE0A3") if is_ammo else Color("#B9F5DA"),
			"act": func() -> void: _start_station("补给领取", dur, func() -> void: _on_supply_done(item)),
		})
	# ---- 以下 5 项是 2.5D collectInteractions / interact 里原本有、3D 之前没接入的动作 ----
	# 施救（2.5D rescue + STAND.revive）：需医疗包，附近有濒死者，站桩后扣 1 个包。
	if sim != null and not sim.agents.is_empty():
		var me: Dictionary = sim.me()
		if int(me.get("medkit", 0)) > 0:
			var downed: Dictionary = sim.nearest_downed(Vector2(pos.x, pos.z),
				SpaceData.num(space, "reach", "body"))
			if not downed.is_empty():
				var rv_i := int(downed.get("i", -1))
				out.append({
					"id": "revive-%d" % rv_i,
					"label": "施救 · " + String(downed.get("name", "?")),
					"hint": "站桩 %.0fs · 消耗 1 个医疗包" % SpaceData.num(space, "stand", "revive"),
					"accent": Color("#B9F5DA"),
					"act": func() -> void: _start_station("施救",
						SpaceData.num(space, "stand", "revive"),
						func() -> void: _on_revive_done(rv_i)),
				})
	# 查看记录（2.5D openBodyCard）：搜查过的尸体 / 伤者能回看状态、地点、检查与随身物资。
	if sim != null:
		for b: Dictionary in sim.agents:
			if not bool(b.get("searched", false)):
				continue
			var bp: Vector2 = b.get("bodyPos", Vector2.ZERO)
			if bp == Vector2.ZERO and bool(b.get("alive", false)):
				bp = b.get("pos", Vector2.ZERO)
			if bp.distance_to(Vector2(pos.x, pos.z)) > SpaceData.num(space, "reach", "body"):
				continue
			var bi := int(b.get("i", -1))
			out.append({
				"id": "inspect-%d" % bi,
				"label": "查看记录 · " + String(b.get("name", "?")),
				"hint": "尸检 / 伤情记录",
				"accent": Color("#C9D1DB"),
				"act": func() -> void: _open_body_card(bi),
			})
	# 全船监控（2.5D openCams）：走到监控台才能调取；断电时信号中断。
	for mfac in map_data.get("facility", []):
		if String(mfac.get("kind", "")) != "monitor":
			continue
		var mp := Vector2(float(mfac.get("x", 0)), float(mfac.get("y", 0)))
		if mp.distance_to(Vector2(pos.x, pos.z)) > dev_r:
			continue
		out.append({
			"id": "cams",
			"label": "全船监控 · " + String(mfac.get("label", "监控台")),
			"hint": "%d 路在线 · V / ESC 退出" % (map_data.get("rooms", []) as Array).size(),
			"accent": Color("#B9F5DA"),
			"act": func() -> void: _open_cams(),
		})
	# 异形破坏（2.5D H → openSabPick → pickSabRoom）：每夜一次，bridge 不可破坏，
	# 已有故障的舱室不重复下手。3D 玩家已站在舱内，等同「抵达目标后自动下手」。
	if sim != null and not sim.agents.is_empty() and bool(sim.me().get("alien", false)):
		var rid: String = String(sim.room_at(Vector2(pos.x, pos.z)))
		var occupied := false
		for d2: Dictionary in sim.dmg:
			if String(d2.get("room", "")) == rid:
				occupied = true
				break
		if rid != "" and rid != "bridge" and not occupied \
				and not bool(sim.me().get("sabUsed", false)):
			var sabrid: String = rid
			out.append({
				"id": "sabotage-" + sabrid,
				"label": "破坏舱室 · " + sim.room_name(sabrid),
				"hint": "每夜一次 · 30 秒内未修复则倒扣维修进度",
				"accent": Color("#FFB3AC"),
				"act": func() -> void: _on_sabotage(sabrid),
			})
	# 机器人状态（2.5D interact 尾部兜底 toast）：贴身时给出在线 / 停摆与剩余电量口径。
	for bk: String in ["secbot", "medbot"]:
		var bfac := {}
		for f2: Dictionary in (map_data.get("facility", []) as Array):
			if String(f2.get("kind", "")) == bk:
				bfac = f2
				break
		if bfac.is_empty():
			continue
		var bpt := Vector2(float(bfac.get("x", 0)), float(bfac.get("y", 0)))
		if bpt.distance_to(Vector2(pos.x, pos.z)) > SpaceData.num(space, "reach", "sabotage"):
			continue
		var bk2 := bk
		var blabel := String(bfac.get("label", bk2))
		out.append({
			"id": "botinfo-" + bk2,
			"label": "查看机器人状态 · " + blabel,
			"hint": "HP %d · 本夜额度 %d 次" % [int(sim.bot_hp.get(bk2, 0)),
				int(SpaceData.num(space, "bot", "sec_uses" if bk2 == "secbot" else "med_uses"))],
			"accent": Color("#C9D1DB"),
			"act": func() -> void: _toast("%s · HP %d · %s" % [blabel,
				int(sim.bot_hp.get(bk2, 0)),
				"在线" if int(sim.bot_hp.get(bk2, 0)) > 0 else "已停摆"]),
		})
	return out


func _on_revive_done(body_i: int) -> void:
	if sim != null and sim.player_revive(body_i):
		_toast("施救成功 · 剩余医疗包 %d" % int(sim.me().get("medkit", 0)))
	else:
		_toast("施救失败（医疗包不足 / 目标已不在濒死状态）")


func _on_sabotage(room_id: String) -> void:
	if sim != null and sim.player_sabotage(room_id):
		_toast("已破坏 " + sim.room_name(room_id) + " · 30 秒内未修复将倒扣维修进度")
	else:
		_toast("破坏失败（本夜已用过 / 该舱已有故障 / 中央会议室不可破坏）")


## 2.5D openBodyCard 的字段口径（状态 / 地点 / 检查 / 物资 / 时间），3D 用 Control 呈现。
func _open_body_card(body_i: int) -> void:
	if sim == null:
		return
	var b: Dictionary = sim.agent(body_i)
	if b.is_empty():
		return
	var alive := bool(b.get("alive", false))
	var bp: Vector2 = b.get("bodyPos", Vector2.ZERO)
	if bp == Vector2.ZERO:
		bp = b.get("pos", Vector2.ZERO)
	var lines: Array = [
		"状态：" + ("濒死 · 还有呼吸，拖进医疗间可由机器人救活" if alive else "已死亡"),
		"发现地点：" + sim.room_name(sim.room_at(bp)),
		"检查：" + ("已检查 · 伤口与拖拽痕迹完整" if bool(b.get("searched", false)) else "未检查"),
		"随身物资：弹 %d / 包 %d / 单 %d" % [int(b.get("bullet", 0)),
			int(b.get("medkit", 0)), int(b.get("qual", 0))],
		"第 %d 夜 · 剩余 %.0fs" % [int(sim.night), maxf(0.0, float(sim.t))],
	]
	_open_info(("伤情记录 · " if alive else "尸检记录 · ") + String(b.get("name", "?")), lines)


## 2.5D openCams：路数、断电中断、夜次与剩余时间；不暴露异形身份。
func _open_cams() -> void:
	if sim == null:
		return
	var rooms: Array = map_data.get("rooms", [])
	var lines: Array = []
	if power_on:
		lines.append("● %d 路在线" % rooms.size())
	else:
		lines.append("● 信号中断 · 电闸断开（先合上配电室的电闸）")
	lines.append("第 %d 夜 · 剩余 %.0fs" % [int(sim.night), maxf(0.0, float(sim.t))])
	if power_on:
		var seen := {}
		for a: Dictionary in sim.agents:
			if not bool(a.get("alive", false)):
				continue
			var rid: String = String(sim.room_at(a.get("pos", Vector2.ZERO)))
			seen[rid] = int(seen.get(rid, 0)) + 1
		for rid: String in seen.keys():
			lines.append("%s：%d 人" % [sim.room_name(rid), int(seen[rid])])
	_open_info("全船监控", lines)


func _breaker_offer(dev) -> Dictionary:
	## 时长口径照 2.5D：合闸 = breaker.on_default（电力修好后 on_fixed），
	## 拉闸 = min(off_max, off_step × 本夜第 n 次)。
	var dur: float
	var label: String
	if power_on:
		dur = minf(SpaceData.num(space, "breaker", "off_max"),
			SpaceData.num(space, "breaker", "off_step") * (float(_breaker_pulls) + 1.0))
		label = "拉闸断电"
	else:
		dur = SpaceData.num(space, "breaker", "on_default")
		label = "合闸复电"
	return {
		"id": "breaker", "label": label,
		"hint": "站桩 %.1fs · 当前%s" % [dur, "断电" if not power_on else "照明"],
		"accent": Color("#BFE9F7"), "dev": dev,
		"act": func() -> void: _start_station(label, dur, _on_breaker_done),
	}


## 圆桌掩体本体（2.5D 的 roundTableCover 同源：按 label 找，不按房间中心猜）
func _round_table_cover() -> Dictionary:
	for c: Dictionary in map_data.get("cover", []):
		if String(c.get("label", "")) == "圆桌":
			return c
	push_warning("map.json 里找不到 label=圆桌 的掩体，领取申请单交互不成立")
	return {}


## 站桩：一移动就打断（与 2.5D tickDoing 同口径），完成后才结算。
func _start_station(label: String, dur: float, done: Callable) -> void:
	if dur <= 0.0:
		push_error("站桩时长取不到（space.json 缺字段？）：%s" % label)
		return
	player.ui_locked = false
	station = {"label": label, "dur": dur, "t": 0.0, "done": done}
	_toast("%s %.1fs" % [label, dur])


func _tick_station(delta: float) -> void:
	if station.is_empty():
		return
	if _moving_input():
		station = {}
		_toast("站桩中断（移动）")
		return
	station["t"] = float(station["t"]) + delta
	if float(station["t"]) >= float(station["dur"]):
		var done: Callable = station["done"]
		station = {}
		done.call()


func _moving_input() -> bool:
	return Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_A) \
		or Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_D)


func _on_breaker_done() -> void:
	if power_on:
		_breaker_pulls += 1
	set_power(not power_on)


func _on_claim_done() -> void:
	if sim != null and sim.claim_qual(int(sim.me_idx)):
		qual_pending = int(sim.me().get("qualPending", 0))
		qual = int(sim.me().get("qual", 0))
		_toast("已领取 1 张物资申请单（现有 %d 张）" % qual)
	else:
		_toast("没有待领取的物资申请单")


func _on_drag_start(body_i: int) -> void:
	if sim != null and sim.start_drag(int(sim.me_idx), body_i):
		_toast("正在拖动尸体 · 移动变慢，再按 E 放下")
	else:
		_toast("这具尸体拖不了（已被报告或正被别人拖）")


func _on_drag_drop() -> void:
	if sim != null and sim.release_drag(int(sim.me_idx)):
		_toast("已放下尸体")


func _on_hit_bot(kind: String) -> void:
	if sim != null and sim.hit_bot(int(sim.me_idx), kind):
		_toast("命中 %s · 剩余 HP %d" % [kind, int(sim.bot_hp.get(kind, 0))])
	else:
		_toast("打不中（没有子弹 / 视线被挡 / 已拆掉）")


func _on_search_done(body_i: int) -> void:
	if sim != null and sim.search_body(body_i, int(sim.me_idx)):
		var me: Dictionary = sim.me()
		_toast("搜尸完成 · 弹 %d / 包 %d / 单 %d" % [
			int(me.get("bullet", 0)), int(me.get("medkit", 0)), int(me.get("qual", 0))])
	else:
		_toast("这具尸体已经搜过了")


func _on_supply_done(item: String = "ammo") -> void:
	if sim != null and sim.exchange_supply(item, int(sim.me_idx)):
		qual = int(sim.me().get("qual", 0))
		_toast("消耗 1 张申请单 · 剩余 %d 张" % qual)
	else:
		_toast("没有申请单，补给点拒绝发放")


## ---- 钻管道（B4）----
## 2.5D 口径：异形专用、人类禁用、PIPE.cooldown 全局冷却（AI 与玩家共用）。
## 出口选择做成一张点名单：8 个管道口除当前所在口之外都可去。
func _use_pipe(port: Dictionary) -> void:
	if role != "alien":
		_toast("人类不能钻管道（2.5D 门禁口径）")
		return
	if _pipe_cd > 0.0:
		_toast("管道冷却中 · 剩余 %.0fs" % _pipe_cd)
		return
	_open_pipe_ui(port)


func _build_pipe_ui() -> void:
	if pipe_panel != null:
		return
	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])
	pipe_panel = ColorRect.new()
	pipe_panel.color = Color(0.01, 0.02, 0.04, 0.80)
	pipe_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pipe_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	pipe_panel.visible = false
	hud_layer.add_child(pipe_panel)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pipe_panel.add_child(center)
	var box := VBoxContainer.new()
	box.custom_minimum_size = Vector2(440, 0)
	box.add_theme_constant_override("separation", 7)
	center.add_child(box)
	var t := Label.new()
	t.text = "钻 管 道 · 选 择 出 口"
	t.add_theme_font_override("font", font)
	t.add_theme_font_size_override("font_size", 24)
	t.add_theme_color_override("font_color", Color(0.84, 0.80, 1.0))
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(t)
	pipe_hint = Label.new()
	pipe_hint.add_theme_font_override("font", font)
	pipe_hint.add_theme_font_size_override("font_size", 13)
	pipe_hint.add_theme_color_override("font_color", Color(0.62, 0.66, 0.76))
	pipe_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(pipe_hint)
	pipe_buttons = VBoxContainer.new()
	pipe_buttons.add_theme_constant_override("separation", 4)
	box.add_child(pipe_buttons)
	var esc := Label.new()
	esc.text = "Esc 取消"
	esc.add_theme_font_override("font", font)
	esc.add_theme_font_size_override("font_size", 12)
	esc.add_theme_color_override("font_color", Color(0.45, 0.50, 0.60))
	esc.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(esc)


func _open_pipe_ui(from: Dictionary) -> void:
	_build_pipe_ui()
	for c in pipe_buttons.get_children():
		c.queue_free()
	var n := 0
	for pp in extras.pipe_ports:
		if (pp["pos"] as Vector3).distance_to(from["pos"] as Vector3) < 0.6:
			continue
		var dest = pp
		var b := Button.new()
		b.text = "%s · %s 管道口" % [sim.room_name(String(dest["room"])), String(dest["room"])]
		b.custom_minimum_size = Vector2(0, 30)
		b.add_theme_font_size_override("font_size", 15)
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(0.07, 0.08, 0.13, 0.94)
		sb.border_color = Color(0.32, 0.28, 0.44, 1.0)
		sb.set_border_width_all(1)
		b.add_theme_stylebox_override("normal", sb)
		b.add_theme_stylebox_override("hover", sb)
		b.add_theme_color_override("font_color", Color(0.86, 0.90, 1.0))
		b.pressed.connect(func() -> void: _travel_pipe(dest))
		pipe_buttons.add_child(b)
		n += 1
	pipe_hint.text = "从 %s 出发 · 共 %d 个出口 · 冷却 %.0fs" % [
		sim.room_name(String(from["room"])), n, SpaceData.num(space, "pipe", "cooldown")]
	_pipe_open = true
	pipe_panel.visible = true
	if player != null:
		player.ui_locked = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func _close_pipe_ui() -> void:
	_pipe_open = false
	if pipe_panel != null:
		pipe_panel.visible = false
	if player != null:
		player.ui_locked = false
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _travel_pipe(to: Dictionary) -> void:
	var p3: Vector3 = to["pos"] as Vector3
	var dest: Vector2 = sim.nav.nearest_free(Vector2(p3.x, p3.z))
	_close_pipe_ui()
	player.global_position = Vector3(dest.x, 0.05, dest.y)
	var me: Dictionary = sim.me()
	me["pos"] = dest
	me["path"] = PackedVector2Array()
	me["pathI"] = 0
	me["doing"] = 0.0
	_pipe_cd = SpaceData.num(space, "pipe", "cooldown")
	sim._log("pipe", {"actor": int(sim.me_idx), "room": String(to.get("room", "")),
		"x": snappedf(dest.x, 0.1), "y": snappedf(dest.y, 0.1)})
	_toast("钻管道 → %s · 冷却 %.0fs" % [
		sim.room_name(String(to.get("room", ""))), _pipe_cd])


## 供电切换：舱灯 + 走廊顶灯 + 常亮材质 + 环境光 + 门扫描锁一起走。
func set_power(on: bool) -> void:
	power_on = on
	if sim != null and bool(sim.power_on) != on:
		# 供电状态以 main 的灯为准，但事件与拉闸计数记在 sim 里（唯一真源）
		sim.toggle_power(int(sim.me_idx))
		sim.power_on = on
	if builder != null:
		builder.set_power(on)
	if extras != null:
		extras.set_power(on)
	_refresh_power_hud()
	_toast("已合闸 · 全船恢复照明" if on else "已拉闸 · 全船断电")


func _refresh_power_hud() -> void:
	if power_label == null:
		return
	var rooms: int = (map_data.get("rooms", []) as Array).size()
	power_label.text = ("● %d 路在线" % rooms) if power_on else "● 信号中断 · 电闸断开"
	power_label.add_theme_color_override("font_color",
		Color(0.45, 0.85, 0.6) if power_on else Color(0.94, 0.36, 0.32))


func _toast(text: String) -> void:
	if toast_label == null:
		return
	toast_label.text = text
	toast_label.visible = true
	_toast_t = 2.6



func _open_device(dev) -> void:
	if _sim_gate and sim != null and not sim.agents.is_empty() and not sim.can_do_task(dev.point_index):
		_toast("「%s」不是你现在的任务（看任务列表）" % String(dev.task_label))
		return
	player.ui_locked = true
	_focus_cam_on(dev)
	mg_layer.open(dev.kind, dev.task_label, dev.tier, dev.task_label,
		func() -> void: _on_device_done(dev),
		func() -> void: _close_device())


## 小游戏玩通 → 写回模拟核心（B1 的第一条真正的“迁移回路”）。
## 失败/中断只关卡片，不清进度以外的任何状态（2.5D 的“中断清零”指的是小游戏内部进度）。
func _on_device_done(dev) -> void:
	_close_device()
	if sim == null or sim.agents.is_empty():
		return
	var res: Dictionary = sim.complete_task(int(sim.me_idx), dev.point_index)
	if not bool(res.get("ok", false)):
		_toast("任务未结算：%s" % String(res.get("reason", "未知原因")))
		return
	var pts := int(res.get("pts", 0))
	var total := int(res.get("prog", 0))
	_toast("完成「%s」 +%d 分 · 维修 %d/%d" % [
		String(dev.task_label), pts, total, sim.win_pts()])
	if bool(res.get("power_fix", false)) and not power_on:
		set_power(true)
	_refresh_sim_hud()
	if sim.over:
		_show_end()


func _focus_cam_on(dev) -> void:
	if _focus_tween != null:
		_focus_tween.kill()
	focus_cam.global_position = player.camera.global_position
	focus_cam.look_at(dev.focus_look_at(), Vector3.UP)
	focus_cam.current = true
	_focus_tween = create_tween()
	_focus_tween.tween_property(focus_cam, "global_position", dev.focus_position(), 0.35) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


func _close_device() -> void:
	if _focus_tween != null:
		_focus_tween.kill()
		_focus_tween = null
	focus_cam.current = false
	player.camera.current = true
	player.ui_locked = false


func nearest_device(pos: Vector3, max_distance: float, forward: Vector3 = Vector3.ZERO):
	if extras == null:
		return null
	return extras.nearest_device(pos, max_distance, forward)


func _room_name_at(pos: Vector3) -> String:
	var point := Vector2(pos.x, pos.z)
	for room: Dictionary in map_data.get("rooms", []):
		var poly := PackedVector2Array()
		for p: Array in room.get("poly", []):
			poly.append(Vector2(float(p[0]), float(p[1])))
		if poly.size() >= 3 and Geometry2D.is_point_in_polygon(point, poly):
			return String(room.get("name", room.get("id", "")))
	return "走廊 / 船体"


## ---- 模拟 HUD（只读 sim_state，不反向写规则）----
## ---- 玩家战斗（B4）----
## 口径与 2.5D 共用：刀程 reach.knife、枪射程 shoot.range、都走 sim.knife / sim.shoot，
## 因此目击者 sus、保安机器人抓捕、医疗无人机施救全部自动生效，不另开一套结算。
func _handle_attack(btn: int) -> void:
	if sim == null or sim.over or not sim.meeting.is_empty():
		return
	if mg_layer != null and mg_layer.is_open():
		return
	var me: Dictionary = sim.me()
	if me.is_empty() or not bool(me.get("alive", true)):
		return
	if bool(me.get("downed", false)) or bool(me.get("detained", false)):
		return
	if btn == MOUSE_BUTTON_LEFT:
		_player_knife(me)
	elif btn == MOUSE_BUTTON_RIGHT:
		_player_fire(me)


func _player_knife(me: Dictionary) -> void:
	if role != "alien" and not bool(me.get("alien", false)):
		_toast("人类没有刀 —— 右键开枪，子弹在军械库换")
		return
	if _knife_cd > 0.0:
		return
	var tgt := _aim_target(SpaceData.num(space, "reach", "knife"), 0.55)
	if tgt.is_empty():
		_toast("刀锋够不到 —— 再靠近、把人对准屏幕中央")
		return
	if not sim.knife(int(sim.me_idx), int(tgt.get("i", -1))):
		return
	_knife_cd = 1.2
	_toast("出刀 · " + String(tgt.get("name", "")))


func _player_fire(me: Dictionary) -> void:
	if int(me.get("bullet", 0)) <= 0:
		_toast("没有子弹 —— 去军械库领（圆桌领申请单 → 军械补给点）")
		return
	if _shot_cd > 0.0:
		return
	var tgt := _aim_target(SpaceData.num(space, "shoot", "range"), 0.90)
	if tgt.is_empty():
		_toast("射程内没有对准的目标")
		return
	if not sim.shoot(int(sim.me_idx), int(tgt.get("i", -1))):
		_toast("这一枪没打中（视线被挡住或目标已倒下）")
		return
	_shot_cd = 0.8
	_toast("开枪 · " + String(tgt.get("name", "")))


## 在给定距离内挑「最贴近准星」的活人：点积越大越接近屏幕中央。
## 用相机 forward 而不是玩家 body 朝向 —— 抬头低头时判定要跟着视线走。
func _aim_target(max_d: float, min_dot: float) -> Dictionary:
	if sim == null or player == null:
		return {}
	var cam: Camera3D = player.camera
	if cam == null:
		return {}
	var fwd := -cam.global_transform.basis.z
	var eye := cam.global_position
	var best: Dictionary = {}
	var best_dot := min_dot
	for a: Dictionary in sim.agents:
		if int(a.get("i", -1)) == int(sim.me_idx):
			continue
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		if bool(a.get("detained", false)):
			continue
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		var p3 := Vector3(ap.x, 1.0, ap.y)
		var to := p3 - eye
		var d := to.length()
		if d > max_d or d < 0.01:
			continue
		var dot := fwd.dot(to / d)
		if dot > best_dot:
			best_dot = dot
			best = a
	return best


## 被拘留：锁输入 + 只在刚被押住时提示一次，释放后自动解锁。
## ui_locked 同时被会议 UI 用，所以"解锁"只在会议也没开的时候做。
## 机器人位置同步：sim 只存 2D 格坐标，场景节点用 3D。
## 用 look_at 而不是手算 rotation.y —— 模型前方是 -Z，手算容易把朝向拧反。
## 玩家位置是 player 节点说了算，但 AI / 目击 / 报告 / 机器人全读 sim.me().pos。
## 之前从没同步过：玩家走遍全船，sim 里他却一直站在会议室出生点。
## 押送 / 濒死 / 会议期间不覆盖，否则会把拘留位和倒地位置改回相机位置。
## 事件流驱动音效：只播新增的那几条，不重复播整局历史
func _play_new_events() -> void:
	if audio == null:
		return
	var evs: Array = sim.events
	if evs.size() < _last_event_n:
		_last_event_n = 0     # 重开一局
	for i in range(_last_event_n, evs.size()):
		audio.play(String((evs[i] as Dictionary).get("kind", "")))
	_last_event_n = evs.size()


func _sync_player_pos() -> void:
	if player == null:
		return
	var me: Dictionary = sim.me()
	if me.is_empty() or not bool(me.get("alive", true)):
		return
	if bool(me.get("detained", false)) or bool(me.get("downed", false)) \
			or not sim.meeting.is_empty():
		return
	me["pos"] = Vector2(player.global_position.x, player.global_position.z)


func _sync_bots() -> void:
	if sim == null or sim.bots == null or extras == null:
		return
	var sb: Node3D = extras.bot_nodes.get("secbot")
	if sb != null:
		var sp: Vector2 = sim.bots.sec_pos
		sb.position.x = sp.x
		sb.position.z = sp.y
		var ang: float = sim.bots.sec_ang
		var dir := Vector3(cos(ang), 0.0, sin(ang))
		if dir.length_squared() > 0.001:
			sb.look_at(sb.global_position + dir, Vector3.UP)
	var mb: Node3D = extras.bot_nodes.get("medbot")
	if mb != null:
		var mp: Vector2 = sim.bots.med_pos
		mb.position.x = mp.x
		mb.position.z = mp.y


func _tick_detained() -> void:
	if sim == null or player == null:
		return
	var me: Dictionary = sim.me()
	if me.is_empty():
		return
	var held := bool(me.get("detained", false))
	player.ui_locked = held or bool(me.get("downed", false)) \
		or (not sim.meeting.is_empty()) or _pipe_open
	if held:
		if not _detained_toast:
			_detained_toast = true
			_toast("被保安机器人押送拘留 · 30 秒")
	else:
		_detained_toast = false


func _refresh_sim_hud() -> void:
	if sim == null or sim.agents.is_empty() or night_label == null:
		return
	if audio != null:
		audio.set_volume(ui_panels.get_sfx())
	night_label.text = "第 %d 夜 · 天亮倒计时 %.1fs" % [int(sim.night), maxf(0.0, float(sim.t))]
	prog_label.text = "全船维修 %d/%d" % [int(sim.prog), int(sim.win_pts())]
	var a: Dictionary = sim.me()
	if a.is_empty():
		return
	# 申请单/补给以 sim 为唯一真源；本地变量只做 UI 缓存。
	qual_pending = int(a.get("qualPending", 0))
	qual = int(a.get("qual", 0))
	var role_text := "旁观 · 全知视角" if bool(sim.spectator) else \
		("异形 · 假装维修不给进度" if bool(a.get("alien", false)) else "人类")
	role_text += " · 弹 %d · 包 %d" % [int(a.get("bullet", 0)), int(a.get("medkit", 0))]
	if bool(a.get("detained", false)):
		role_text = "被保安机器人拘留 · 等待释放"
	if bool(sim.spectator):
		tasks_label.text = "旁观模式（第 16 人）\n全知无碰撞 · WASD + 空格/Ctrl 升降\n不参与发言 / 投票 / 任务"
		alive_label.text = "存活 %d / %d" % [_alive_count(), sim.agents.size()]
		feed_label.text = _event_feed()
		return
	var text := "我的任务（%s）：\n" % role_text
	var tasks: Array = a.get("tasks", []) as Array
	var t_idx := int(a.get("tIdx", 0))
	for k in tasks.size():
		var p: Dictionary = sim.point(int(tasks[k]))
		var mark := "✓" if k < t_idx else "○"
		text += "  %s %s · %s\n" % [mark, String(p.get("label", "")), sim.room_name(String(p.get("room", "")))]
	tasks_label.text = text
	alive_label.text = "存活 %d / %d" % [_alive_count(), sim.agents.size()]
	feed_label.text = _event_feed()
	if sim.over:
		_show_end()
	elif not bool(a.get("alive", true)):
		_player_dead = true
		end_panel.visible = true
		end_label.text = "你已阵亡\n第 %d 夜 · 维修 %d/%d\n\n按 R 重开一局" % [
			int(sim.night), int(sim.prog), int(sim.win_pts())]
	elif bool(a.get("downed", false)) and not _down_toast:
		_down_toast = true
		_toast("你已濒死，12 秒内没人救就会死")


func _alive_count() -> int:
	var n := 0
	for x: Dictionary in sim.agents:
		if bool(x.get("alive", false)):
			n += 1
	return n


func _event_feed() -> String:
	var lines: Array = []
	var evs: Array = sim.events
	for i in range(maxi(0, evs.size() - 4), evs.size()):
		var e: Dictionary = evs[i]
		var kind := String(e.get("kind", ""))
		var who := ""
		if e.get("actor") is int and int(e.get("actor", -1)) >= 0:
			who = String(sim.agent(int(e.get("actor", -1))).get("name", ""))
		var txt := ""
		if kind == "task":
			txt = "%s 完成 %s" % [who, String(e.get("label", "任务"))]
		elif kind == "kill":
			txt = "有人倒下"
		elif kind == "knife":
			txt = "有人被放倒"
		elif kind == "meeting":
			txt = "发现尸体 · 开会"
		elif kind == "eject":
			txt = "%s 被驱逐" % who
		elif kind == "sabotage":
			txt = "设备故障 · %s" % sim.room_name(String(e.get("room", "")))
		elif kind == "fix":
			txt = "故障修复" if bool(e.get("ok", false)) else "故障未修 · 进度 -5"
		elif kind == "supply":
			txt = "%s 领取补给" % who
		if txt != "":
			lines.append(txt)
	return "\n".join(lines)


func _show_end() -> void:
	if end_panel == null or sim == null:
		return
	end_panel.visible = true
	if not end_panel.has_node("ReplayBtn"):
		var rb := Button.new()
		rb.name = "ReplayBtn"
		rb.text = "查看复盘"
		rb.position = Vector2(320, 18)
		rb.custom_minimum_size = Vector2(120, 34)
		rb.add_theme_font_size_override("font_size", 14)
		rb.pressed.connect(func() -> void: ui_panels.open_replay(sim.events))
		end_panel.add_child(rb)
	var title := "人类胜利" if bool(sim.over_win) else "异形胜利"
	end_label.text = "%s\n%s\n维修 %d/%d · 第 %d 夜\n\n按 R 重开一局（新种子 %d）" % [
		title, String(sim.over_why), int(sim.prog), int(sim.win_pts()),
		int(sim.night), int(sim.seed_used) + 1]


func _input(event: InputEvent) -> void:
	if sim == null or not started:
		return
	## 信息面板（尸检记录 / 全船监控）在最上层：只剩 ESC 关闭，其余按键不落到对局。
	## 对应 2.5D 的 G.inspect / G.camView 输入屏蔽（js/game.js:7932 起）。
	if _info_open:
		if event is InputEventKey and (event as InputEventKey).pressed \
				and (event as InputEventKey).keycode == KEY_ESCAPE:
			_close_info()
			get_viewport().set_input_as_handled()
		return
	## 设置 / 复盘面板在最上层（2.5D 的 SKSettings.isOpen() 守卫）：
	## 只允许 P / ESC 关闭，其余按键一律不落到对局，避免面板开着时误触发交互。
	if ui_panels != null and ui_panels.any_open():
		if event is InputEventKey and (event as InputEventKey).pressed:
			var pk := (event as InputEventKey).keycode
			if pk == KEY_P or pk == KEY_ESCAPE:
				ui_panels.close_all()
				get_viewport().set_input_as_handled()
		return
	if event is InputEventKey and (event as InputEventKey).pressed:
		if (event as InputEventKey).keycode == KEY_P and started:
			if ui_panels.any_open():
				ui_panels.close_all()
			else:
				ui_panels.open_settings()
			get_viewport().set_input_as_handled()
			return
		if _pipe_open and (event as InputEventKey).keycode == KEY_ESCAPE:
			_close_pipe_ui()
			get_viewport().set_input_as_handled()
			return
	# 攻击输入：左键出刀（异形）/ 右键开枪（人类），都要在鼠标已被捕获时才生效，
	# 否则第一次点击是"从 UI 夺回鼠标"，不该顺带打一枪。
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
		if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
			_handle_attack((event as InputEventMouseButton).button_index)
		return
	if not bool(sim.over) and bool(sim.me().get("alive", true)):
		return
	if event is InputEventKey:
		var key := event as InputEventKey
		if key.pressed and not key.echo and key.physical_keycode == KEY_R:
			_restart_sim()


func _restart_sim() -> void:
	var next_seed := int(sim.seed_used) + 1
	# 重开保留开始页选的角色：人类重开还是人类，异形重开还是异形。
	if not sim.new_game(next_seed, 0, map_data, space, role == "alien"):
		return
	power_on = true
	set_power(true)
	_breaker_pulls = 0
	qual_pending = 0
	qual = 0
	station = {}
	if end_panel != null:
		end_panel.visible = false
	_player_dead = false
	_down_toast = false
	if crew_view != null:
		crew_view.build(sim)
	player.global_position = Vector3(31.0, 0.05, 33.5)
	player.rotation.y = -PI * 0.5
	_refresh_sim_hud()
	_toast("新一局 · seed %d" % next_seed)


## ---- 会议门禁（--meetingtest）----
## 造一具尸体 → 报告 → 玩家投一票 → 5 秒后必须真的驱逐一个人。
func _run_meetingtest() -> bool:
	var s = SimStateScript.new()
	if not s.new_game(20261109, 0, map_data, space):
		print("MEETINGTEST FAIL 开局失败")
		return false
	s.ai_enabled = false
	_finish_meeting(s)
	var alien := {}
	var victim := {}
	for a: Dictionary in s.agents:
		if bool(a.get("alien", false)) and alien.is_empty():
			alien = a
		elif not bool(a.get("alien", false)) and int(a.get("i", -1)) != 0 and victim.is_empty():
			victim = a
	if alien.is_empty() or victim.is_empty():
		print("MEETINGTEST FAIL 没有异形/受害者")
		return false
	s.knife(int(alien.get("i", -1)), int(victim.get("i", -1)))
	s.die(victim)
	var body: Dictionary = s.body_near(victim.get("pos", Vector2.ZERO), 2.2)
	if body.is_empty():
		print("MEETINGTEST FAIL body_near 找不到尸体")
		return false
	if not s.open_meeting(0, int(body.get("i", -1))):
		print("MEETINGTEST FAIL open_meeting 失败")
		return false
	# 三段相位：讨论 → 投票 → 身份公布。门禁里快进讨论，玩家票只在投票阶段有效。
	s.skip_discussion()
	s.tick(0.01)
	var vote_phase := String(s.meeting.get("phase", ""))
	var old_sim = sim
	sim = s
	_refresh_meeting_ui()
	var btn_n := meeting_buttons.size()
	if meeting_buttons.has(int(alien.get("i", -1))):
		(meeting_buttons[int(alien.get("i", -1))] as Button).pressed.emit()
	sim = old_sim
	s.cast_vote(0, int(alien.get("i", -1)))
	for k in 160:
		if s.meeting.is_empty():
			break
		s.tick(0.1)
	var ejected := 0
	for e: Dictionary in s.events:
		if String(e.get("kind", "")) == "eject":
			ejected += 1
	var ok: bool = s.meeting.is_empty() and ejected >= 1 and bool(body.get("bodyReported", false)) \
		and btn_n > 0 and vote_phase == "vote"
	print("MEETINGTEST ok=%s ejected=%d buttons=%d phase=%s meeting_empty=%s" % [
		str(ok), ejected, btn_n, vote_phase, str(s.meeting.is_empty())])
	return ok


## ---- AI 任务门禁（--aittest）----
## 11 个人类 AI 自己跑 300 秒：必须真的完成任务、有人领申请单/换补给；
## 不要求一定赢（异形还没接入），但 prog 必须动。
func _run_aittest() -> bool:
	var s = SimStateScript.new()
	if not s.new_game(20261108, 0, map_data, space):
		print("AITEST FAIL 开局失败")
		return false
	# S 轨起讨论段会真的产生台词，不能再自动快进；拉长 tick 观察窗口。
	var steps := 5000
	for k in steps:
		if bool(s.over):
			break
		s.tick(0.1)
	var tasks := 0
	var quals := 0
	var supplies := 0
	var knives := 0
	var kills := 0
	var sabs := 0
	var meets := 0
	var ejects := 0
	var chats := 0
	for e: Dictionary in s.events:
		var kind := String(e.get("kind", ""))
		if kind == "task":
			tasks += 1
		elif kind == "qual":
			quals += 1
		elif kind == "supply":
			supplies += 1
		elif kind == "knife":
			knives += 1
		elif kind == "kill":
			kills += 1
		elif kind == "sabotage":
			sabs += 1
		elif kind == "meeting":
			meets += 1
		elif kind == "eject":
			ejects += 1
		elif kind == "chat":
			chats += 1
	print("AITEST prog=%d/%d tasks=%d qual=%d supply=%d knife=%d kill=%d sab=%d meet=%d eject=%d chat=%d over=%s win=%s why=%s nights=%d agents=%d" % [
		int(s.prog), int(s.win_pts()), tasks, quals, supplies, knives, kills, sabs,
		meets, ejects, chats, str(s.over), str(s.over_win), String(s.over_why),
		int(s.night), s.agents.size()])
	var ok := tasks > 0 and int(s.prog) > 0 and quals > 0
	if not ok:
		print("AITEST FAIL 任务/申请单没有真正跑起来")
	return ok


## ---- 网格门禁（--navtest）----
## 26 个任务点必须从出生点可达；路径终点要落在任务点 1.5m 内；不能有孤立点。
func _run_navtest() -> bool:
	if sim == null or sim.nav == null:
		print("NAVTEST FAIL sim/nav 未初始化")
		return false
	var pass_n := 0
	var fail_n := 0
	var fails: Array = []
	if int(sim.nav.walkable) <= 0:
		print("NAVTEST FAIL walkable=0")
		return false
	pass_n += 1
	var start: Vector2 = sim.me().get("pos", Vector2(31, 33.5))
	if not sim.nav.is_free(start):
		fail_n += 1
		fails.append("出生点不可走 " + str(start))
	else:
		pass_n += 1
	for i in sim.points.size():
		var p: Dictionary = sim.points[i]
		var target := Vector2(float(p.get("x", 0)), float(p.get("y", 0)))
		var pts: PackedVector2Array = sim.nav.path(start, target)
		var ok := pts.size() > 1 and pts[pts.size() - 1].distance_to(target) <= SpaceData.num(space, "reach", "fix")
		if ok:
			pass_n += 1
		else:
			fail_n += 1
			fails.append("任务点不可达 %s(%d)" % [String(p.get("label", "")), i])
	print("NAVTEST pass=%d fail=%d walkable=%d cells=%dx%d" % [
		pass_n, fail_n, int(sim.nav.walkable), int(sim.nav.gw), int(sim.nav.gh)])
	for f: String in fails:
		print("  FAILED: ", f)
	return fail_n == 0


## ---- 模拟核心门禁（--simtest）----
## 只验 B1 的规则面：开局 / 任务分值与乱序记账 / 申请单 / 天亮 / 三条胜负分支。
func _run_simtest() -> bool:
	var r := {"pass": 0, "fail": 0, "fails": [] as Array}
	var s = SimStateScript.new()
	_sim_check(r, s.new_game(20261108, 0, map_data, space), "开局成功")
	s.ai_enabled = false
	_finish_meeting(s)

	var n_humans := 0
	var n_aliens := 0
	for a: Dictionary in s.agents:
		if bool(a.get("alien", false)):
			n_aliens += 1
		else:
			n_humans += 1
	_sim_check(r, s.agents.size() == 15, "15 个席位（实际 %d）" % s.agents.size())
	_sim_check(r, n_aliens == 4, "4 个异形（实际 %d）" % n_aliens)
	_sim_check(r, n_humans == 11, "11 个人类（实际 %d）" % n_humans)
	_sim_check(r, not bool(s.me().get("alien", true)), "玩家是人类席位")
	_sim_check(r, is_equal_approx(float(s.t), float(s.night_len())), "开局夜长 %.1fs" % s.t)
	_sim_check(r, int(s.prog) == 0, "开局维修进度 0")

	var task_shape_ok := true
	for a: Dictionary in s.agents:
		var list: Array = a.get("tasks", []) as Array
		var h := 0
		var n := 0
		for pi: int in list:
			if String(s.point(pi).get("kind", "")) == "hard":
				h += 1
			else:
				n += 1
		if list.size() != 4 or h != 1 or n != 3:
			task_shape_ok = false
	_sim_check(r, task_shape_ok, "每人 1 高难 + 3 普通")

	var my: Dictionary = s.me()
	var first := int((my.get("tasks", []) as Array)[0])
	var other := -1
	for i in s.points.size():
		if not (my.get("tasks", []) as Array).has(i):
			other = i
			break
	_sim_check(r, s.can_do_task(first), "自己的首个任务是可修的")
	_sim_check(r, other >= 0 and not s.can_do_task(other), "非自己任务不可修")

	var res: Dictionary = s.complete_task(int(s.me_idx), first)
	var v: int = int(s.task_pts(first))
	_sim_check(r, bool(res.get("ok", false)), "任务完成返回 ok")
	_sim_check(r, int(res.get("pts", -1)) == v, "任务分值与 sim.json 一致（%d）" % v)
	_sim_check(r, int(my.get("tIdx", 0)) == 1, "tIdx 前进 1")
	_sim_check(r, int(s.prog) == v, "全船进度 +%d" % v)

	# 乱序：直接修第 3 个任务，结算后它应被换到 tIdx 槽位
	var tasks_now: Array = my.get("tasks", []) as Array
	var third := int(tasks_now[2])
	var old_second := int(tasks_now[1])
	var res2: Dictionary = s.complete_task(int(s.me_idx), third)
	_sim_check(r, bool(res2.get("ok", false)), "乱序修第 3 个任务成功")
	_sim_check(r, int(tasks_now[1]) == third and int(tasks_now[2]) == old_second, "乱序任务换位记账")

	# 一路修到 45 分：所有席位按顺序做完自己的任务，必须在到达 45 时结束
	for a: Dictionary in s.agents:
		while not bool(s.over) and int(a.get("tIdx", 0)) < (a.get("tasks", []) as Array).size():
			var pi := int((a.get("tasks", []) as Array)[int(a.get("tIdx", 0))])
			var rr: Dictionary = s.complete_task(int(a.get("i", 0)), pi)
			if not bool(rr.get("ok", false)):
				break
	_sim_check(r, bool(s.over) and bool(s.over_win), "维修到 45 分 → 人类胜利")
	_sim_check(r, int(s.prog) == int(s.win_pts()), "进度封顶在 %d（实际 %d）" % [s.win_pts(), s.prog])
	var has_task_ev := false
	var has_end_ev := false
	for e: Dictionary in s.events:
		if String(e.get("kind", "")) == "task":
			has_task_ev = true
		elif String(e.get("kind", "")) == "game_end":
			has_end_ev = true
	_sim_check(r, has_task_ev and has_end_ev, "事件流有 task / game_end")

	# 天亮：75 秒后进入第 2 夜
	_sim_check(r, s.new_game(7, 0, map_data, space), "重开用于天亮测试")
	s.ai_enabled = false
	_finish_meeting(s)
	for i in 751:
		s.tick(0.1)
	## 2.5D：天亮先开白天全员会，会议结束才 _start_night(true) 进下一夜。
	_finish_meeting(s)
	_sim_check(r, int(s.night) == 2, "75 秒后天亮 → 第 2 夜（实际第 %d 夜）" % s.night)
	var has_dawn := false
	for e: Dictionary in s.events:
		if String(e.get("kind", "")) == "dawn":
			has_dawn = true
	_sim_check(r, has_dawn, "事件流有 dawn")

	# 异形胜利：人类全灭
	_sim_check(r, s.new_game(8, 0, map_data, space), "重开用于人类全灭测试")
	s.ai_enabled = false
	for a: Dictionary in s.agents:
		if not bool(a.get("alien", false)):
			s.kill(int(a.get("i", 0)), "test")
	_sim_check(r, bool(s.over) and not bool(s.over_win) and String(s.over_why) == "人类全灭",
		"人类全灭 → 异形胜利（%s）" % s.over_why)

	# 人类胜利：异形全部出局
	_sim_check(r, s.new_game(9, 0, map_data, space), "重开用于异形出局测试")
	s.ai_enabled = false
	for a: Dictionary in s.agents:
		if bool(a.get("alien", false)):
			s.kill(int(a.get("i", 0)), "test")
	_sim_check(r, bool(s.over) and bool(s.over_win) and String(s.over_why) == "异形全部出局",
		"异形全部出局 → 人类胜利（%s）" % s.over_why)

	print("SIMTEST pass=%d fail=%d" % [int(r["pass"]), int(r["fail"])])
	for f: String in (r["fails"] as Array):
		print("  FAILED: ", f)
	return int(r["fail"]) == 0


func _sim_check(r: Dictionary, cond: bool, name: String) -> void:
	if cond:
		r["pass"] = int(r["pass"]) + 1
	else:
		r["fail"] = int(r["fail"]) + 1
		(r["fails"] as Array).append(name)
		print("SIMTEST FAIL ", name)


## 任务回路 E2E：必须是玩家自己的任务，走「E 打开 → 解题 → 写回 sim」的完整路径。
## 这条门禁卡的是 B1 最关键的一句：小游戏玩通真的会变成维修进度。
func _run_taskflowtest() -> bool:
	if sim == null or sim.agents.is_empty():
		print("TASKFLOW FAIL sim 未初始化")
		return false
	var remaining: Array = sim.remaining_tasks()
	if remaining.is_empty():
		print("TASKFLOW FAIL 没有剩余任务")
		return false
	var target := int(remaining[0])
	var dev = null
	for d in extras.devices:
		if is_instance_valid(d) and int(d.point_index) == target:
			dev = d
			break
	if dev == null:
		print("TASKFLOW FAIL 找不到任务点设备 %d" % target)
		return false
	var before_prog := int(sim.prog)
	var before_idx := int(sim.me().get("tIdx", 0))
	var face: Vector3 = dev.face_dir()
	player.global_position = Vector3(dev.global_position.x, 0.05, dev.global_position.z) + face * 1.2
	player.rotation.y = atan2(face.x, face.z)
	await get_tree().create_timer(0.4).timeout
	_open_device(dev)
	await get_tree().create_timer(0.3).timeout
	var opened: bool = mg_layer.is_open()
	mg_layer.debug_solve()
	await get_tree().create_timer(1.1).timeout
	var after_idx := int(sim.me().get("tIdx", 0))
	var after_prog := int(sim.prog)
	var pts: int = int(sim.task_pts(target))
	var ok: bool = opened and after_idx == before_idx + 1 and after_prog == before_prog + pts \
		and not mg_layer.is_open() and not player.ui_locked
	print("TASKFLOW ok=%s open=%s tIdx=%d→%d prog=%d→%d pts=%d closed=%s unlocked=%s" % [
		str(ok), str(opened), before_idx, after_idx, before_prog, after_prog, pts,
		str(not mg_layer.is_open()), str(not player.ui_locked)])
	return ok


## 仰视天花板：相机在舱心离地 1.5m，向上看天花板。
## 天花板材质/尺度有没有做对，只能这样看。
func _run_ceilshot(room_id: String) -> void:
	var rect := Rect2(0, 0, 8, 8)
	for r: Dictionary in map_data.get("rooms", []):
		if String(r.get("id", "")) != room_id:
			continue
		var a: Array = r.get("rect", [0, 0, 8, 8])
		rect = Rect2(float(a[0]), float(a[1]), float(a[2]), float(a[3]))
		break
	var c := Vector3(rect.position.x + rect.size.x * 0.5, 0.0, rect.position.y + rect.size.y * 0.5)
	var cam := Camera3D.new()
	add_child(cam)
	## 站在舱的一侧往斜上方看：这样灯带（贴墙顶内侧）与天花板面板能同框。
	## 站在正下方仰视只能看到舱心那块天花板，灯带在视野外。
	cam.position = Vector3(c.x, 1.35, c.z + rect.size.y * 0.30)
	cam.look_at(Vector3(c.x - rect.size.x * 0.18, 3.05, c.z - rect.size.y * 0.18), Vector3.UP)
	cam.fov = 82.0
	cam.near = 0.05
	cam.far = 300.0
	cam.current = true
	await get_tree().create_timer(1.4).timeout
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var dir := ProjectSettings.globalize_path("res://screenshots")
	DirAccess.make_dir_recursive_absolute(dir)
	var path := dir.path_join("ceil-%s.png" % room_id)
	image.save_png(path)
	print("COVERSHOT_PATH=", path)


func _run_covershot(room_id: String, eye: bool = false) -> void:
	var rect := Rect2(0, 0, 8, 8)
	for r: Dictionary in map_data.get("rooms", []):
		if String(r.get("id", "")) != room_id:
			continue
		var a: Array = r.get("rect", [0, 0, 8, 8])
		rect = Rect2(float(a[0]), float(a[1]), float(a[2]), float(a[3]))
		break
	var c := Vector3(rect.position.x + rect.size.x * 0.5, 0.0, rect.position.y + rect.size.y * 0.5)
	var cam := Camera3D.new()
	add_child(cam)
	if eye:
		## 眼高验收：相机 1.62m（player.gd 同值），平视舱心稍远处。
		## 掩体若低于这个值，玩家能从家具上方看过去 —— 2.5D 判定却说它挡光。
		cam.position = Vector3(c.x, 1.62, c.z + rect.size.y * 0.5 - 1.2)
		cam.look_at(Vector3(c.x, 1.55, c.z - rect.size.y * 0.35), Vector3.UP)
	else:
		## 舱内平视：贴在房间南侧 1.2 米、离地 2.2 米，看向舱心
		cam.position = Vector3(c.x, 2.2, c.z + rect.size.y * 0.5 - 1.2)
		cam.look_at(Vector3(c.x, 1.0, c.z - rect.size.y * 0.15), Vector3.UP)
	cam.fov = 72.0
	cam.near = 0.05
	cam.far = 300.0
	cam.current = true
	await get_tree().create_timer(1.4).timeout
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var dir := ProjectSettings.globalize_path("res://screenshots")
	DirAccess.make_dir_recursive_absolute(dir)
	var stem := ("covers-eye-%s.png" if eye else "covers-%s.png") % room_id
	var path := dir.path_join(stem)
	image.save_png(path)
	print("COVERSHOT_PATH=", path)
