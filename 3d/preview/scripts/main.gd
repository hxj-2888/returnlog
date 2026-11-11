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
const MinimapScript := preload("res://scripts/minimap.gd")
const MinigameData := preload("res://scripts/minigame/mg_data.gd")
const AudioScript := preload("res://scripts/audio.gd")

const KINDS := ["wire", "place", "lever", "sync", "pour", "swap", "align", "aim",
	"match", "level", "sequence", "sort", "valve", "code"]


## 命中标记：屏幕中心四条斜线，命中瞬间向外弹一下再淡出。
## 2.5D 的击中有「红身 + 音效」，3D 之前只剩音效，手上和屏幕上都没有确认。
class HitMark extends Control:
	var t := 0.0

	func _draw() -> void:
		if t <= 0.0:
			return
		var k := clampf(t / 0.28, 0.0, 1.0)
		var col := Color(1.0, 0.36, 0.28, k)
		var ctr := size * 0.5
		var r := lerpf(20.0, 13.0, k)
		for i in 4:
			var ang := PI * 0.25 + float(i) * PI * 0.5
			var d := Vector2(cos(ang), sin(ang))
			draw_line(ctr + d * (r * 0.45), ctr + d * r, col, 2.5, true)


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
## 结算页（2.5D #end）：只在 sim.over 时显示，身份表 + 谁投了谁。
var settle_panel: ColorRect
var settle_title: Label
var settle_sub: Label
var settle_stats: Label
var settle_ids: RichTextLabel
var settle_votes: RichTextLabel
var _sim_hud_timer: float = 0.0
var _player_dead := false
var _down_toast := false
var hud_layer: CanvasLayer

## ---- 出刀反馈层（2026-11-11）----
## 命中：屏幕中心命中标记 + 红色边缘闪 + 镜头 FOV 收缩 + 受害者血花。
## 之前只有音效和一行 toast，玩家「出了刀却不知道自己有没有打到」。
var fx_layer: CanvasLayer
var red_flash: ColorRect
var hit_mark: HitMark
var _hit_t := 0.0
var _red_t := 0.0
## 白天会议「全员回会议室」的视图侧同步（2026-11-11）。
## 2.5D dawn() 先把全员 randIn(bridge) 再 openMeeting('day')；3D 的 sim.dawn()
## 只改了 agent.pos，玩家相机没搬 —— 会议结束 _sync_player_pos 还会把位置反写回原地。
var _last_meet_seq := 0
## 暗房遮罩（2.5D refreshLight + SIGHT）：未点亮房间整块压暗，只留中心手电圈。
var dark_layer: CanvasLayer
var dark_rect: TextureRect
var _dark_alpha := 0.0
## 故障点世界标记：room_id -> Node3D（红色警示 + 点光）
var _fault_marks: Dictionary = {}

var meeting_panel: ColorRect
var meeting_title: Label
var meeting_time: Label
var meeting_info: Label
var meeting_list: VBoxContainer
var meeting_list_scroll: ScrollContainer
var meeting_buttons: Dictionary = {}
var meeting_abstain: Button
var meeting_hint: Label
var meeting_result: Label
var meeting_skip: Button
var meeting_skip_vote: Button
var meeting_feed: RichTextLabel
var meeting_new_btn: Button
var meeting_input: LineEdit
var meeting_send: Button
var meeting_tpl: VBoxContainer
var meeting_tpl_target: OptionButton
var meeting_tpl_room: OptionButton
var meeting_tpl_when: OptionButton
var _meeting_feed_start := 0
var _meeting_feed_synced := 0
var _meeting_unread := 0
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

## 幽灵态：死亡后不弹结算面板，改为提示一次并继续以幽灵身份玩。
var _ghost_toast := false
## 交互键位拆分的按键边沿状态（F/R/G/Q/V/B/C + 1-9 直选）
var _keys_down: Dictionary = {}

var power_on := true

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
## 用户按 Esc 主动释放鼠标：`_refresh_mouse_mode()` 每帧都会跑，如果只把
## mouse_mode 设成 VISIBLE、不记这个状态，下一帧就会被重新 CAPTURED —— 表现
## 就是「鼠标被框在窗口里、怎么都放不出去」。点击画面收回鼠标时清零。
var mouse_released := false
var _cur_seed := 20261108
## --mgtest / --devicetest 的判定结果；让自测失败时退出码非 0
## （旧夹具恒打印失败读数却 exit 0）。
var _mgtest_ok := false
var _devicetest_ok := false
var _leadtest_ok := false
var _uitest_ok := false
var _meetuitest_ok := false
var _aiporttest_ok := false
var _mousetest_ok := false
var _settletest_ok := false
var _minimaptest_ok := false
var _socialtest_ok := false
var _knifetest_ok := false
var _specttest_ok := false
var _ceil_hidden := false
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
## 2.5D SND.step / SND.work 的节流
var _step_cd := 0.0
var _work_cd := 0.0
## 截图/机位自测：不捕获系统鼠标、不响应鼠标视角；正常游玩保持原捕获行为。
var _screenshot_mode := false

## ---- DEV（2.5D F2，js/game.js:594-676）：全知卡片栏 + 无敌开关 ----
## 开关状态放在 sim.dev（判定层要读），这里只做表现与探针记录。
var dev_layer: CanvasLayer
var dev_panel: PanelContainer
var dev_title: Label
var dev_sub: Label
var dev_rows: VBoxContainer
var dev_stats: Label
var dev_probe: Label
var _dev_row_labels: Array = []
var _dev_timer := 0.0
var _dev_log_n := 0
## 玩家探针：最近 8 条「按了什么 / 交互项 / 结果」，DEV 面板底部实时显示。
var _probe_lines: Array = []
var _probetest_ok := false
var _crewanimtest_ok := false

var room_label: Label
var fps_label: Label
var prompt_label: Label
var power_label: Label
var toast_label: Label
var report_label: Label
var minimap
var _hud_timer: float = 0.0
var _toast_t: float = 0.0


func _exit_tree() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func _notification(what: int) -> void:
	# CAPTURED 会把光标裁在游戏窗口里：切去截图工具 / 别的窗口时必须自动释放，
	# 否则用户在截图工具里根本拖不出选区（现场反馈「鼠标被框在游戏栏」）。
	if what == NOTIFICATION_WM_WINDOW_FOCUS_OUT \
			or what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		if started and player != null and not _want_mouse_visible():
			mouse_released = true
			_refresh_mouse_mode()


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
	_screenshot_mode = _has_screenshot_arg(args)
	# 2026-11-11 用户裁定：人物默认走 3D 体块；--crew-billboard 只作回退/对比。
	var crew_model_mode := not args.has("--crew-billboard")
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
	crew_view.set_model_mode(crew_model_mode)
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
	player.capture_mouse_on_ready = not _screenshot_mode
	add_child(player)
	player.apply_space_cfg(space)
	if _screenshot_mode:
		# 截图期间把系统鼠标还给用户：不捕获、不转视角、不误触攻击。
		player.ui_locked = true
		mouse_released = true
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

	if args.has("--devicelist"):
		for i in extras.devices.size():
			var d = extras.devices[i]
			print("DEV %02d %s at %s kind=%s" % [i, d.task_label, str(d.global_position), d.kind])
		get_tree().quit()
		return

	_build_hud()
	_build_fx()

	## 人物 blockout 同框验收：真实会议室里并排摆 2.5D billboard / 3D 体块 + 1.75m 标尺。
	if args.has("--crewshot"):
		await _run_crewshot()
		get_tree().quit()
		return
	if args.has("--doorshot"):
		await _run_doorshot()
		get_tree().quit()
		return

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
	audio.set_listener(Vector2(player.global_position.x, player.global_position.z))
	if extras != null:
		extras.door_auto.connect(_on_door_auto)

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
		get_tree().quit(0 if _mgtest_ok else 1)
		return

	if args.has("--specttest"):
		await _run_specttest()
		get_tree().quit(0 if _specttest_ok else 1)
		return

	if args.has("--knifetest"):
		await _run_knifetest()
		get_tree().quit(0 if _knifetest_ok else 1)
		return

	## 玩家探针（2026-11-10 用户现场「异形按 E 打不倒人」）：
	## 用真实 InputEvent 走 E / 数字键 / 左键 / F2，断言玩家实际能完成什么，
	## 不直接调 sim 或内部动作函数当“按过键”。详见 _run_probetest。
	if args.has("--probetest"):
		await _run_probetest()
		get_tree().quit(0 if _probetest_ok else 1)
		return

	## 无鼠标、无窗口的动作自测：knife / down / walk / idle 四个 clip 的触发。
	if args.has("--crewanimtest"):
		var ca_ok := _run_crewanimtest()
		get_tree().quit(0 if ca_ok else 1)
		return

	if args.has("--uitest"):
		await _run_uitest()
		get_tree().quit(0 if _uitest_ok else 1)
		return

	## 会议 UI 功能自测（真实鼠标点模板 / 投票 / 改票 / 弃权 / 跳过投票 / 只读会议）。
	if args.has("--meetuitest"):
		await _run_meetuitest()
		get_tree().quit(0 if _meetuitest_ok else 1)
		return

	## A 档判定层自测：取消全图锁敌 / humanT / saw_red 节流 / saw_avoid / 空闲游荡。
	if args.has("--aiporttest"):
		_run_aiporttest()
		get_tree().quit(0 if _aiporttest_ok else 1)
		return

	## 鼠标口径自测：Esc 释放必须能维持，不被下一帧重新捕获。
	if args.has("--mousetest"):
		await _run_mousetest()
		get_tree().quit(0 if _mousetest_ok else 1)
		return

	## 结算页自测：终票按 seq 落账 / 投票矩阵 / 身份表结局与死亡地点。
	if args.has("--settletest"):
		_run_settletest()
		get_tree().quit(0 if _settletest_ok else 1)
		return

	## 局内小地图自测：尺寸/点击穿透/灯态三态/任务点与地图数据。
	if args.has("--minimaptest"):
		await _run_minimaptest()
		get_tree().quit(0 if _minimaptest_ok else 1)
		return

	## 证据/情绪/口供自测：evalAlmost 全量 / trust-grudge / claimHist / DESC。
	if args.has("--socialtest"):
		_run_socialtest()
		get_tree().quit(0 if _socialtest_ok else 1)
		return

	if args.has("--leadtest"):
		await _run_leadtest()
		get_tree().quit(0 if _leadtest_ok else 1)
		return

	if args.has("--devicetest"):
		await _run_devicetest()
		get_tree().quit(0 if _devicetest_ok else 1)
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
		## 夹具修正（2026-11-10）：new_game 会开 MEET_PRE，会议期间 player.ui_locked
		## 把 velocity 钉成 0 —— 旧写法在开局讨论里按 W，恒打印 distance=0.0 且 exit 0，
		## 是一条静默失败的验收。先把会正常走完（_finish_meeting 与其他自测同一口径），
		## 再量真实按键位移，并对「有没有动 / 有没有超过真源移速」双向断言。
		_finish_meeting(sim)
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
		var dist := start.distance_to(finish)
		var want := SpaceData.num(space, "move", "speed")
		var ok := dist > 0.05 and dist <= want * 1.0 + 0.35
		print("WALK_TEST distance=", dist, " 期望≤", want, "m/1.0s",
			" ui_locked=", player.ui_locked, " start=", start, " end=", finish)
		print("WALKTEST ", "OK" if ok else "FAIL", " 1/1" if ok else " 0/1")
		get_tree().quit(0 if ok else 1)
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

	if args.has("--endshot") and DisplayServer.get_name() != "headless":
		await _run_endshot()
		get_tree().quit()
		return

	if args.has("--minishot") and DisplayServer.get_name() != "headless":
		# 局内小地图实拍：先关掉开局会，让 HUD/小地图露出来。
		_finish_meeting(sim)
		sim.meeting = {}
		await get_tree().create_timer(0.7).timeout
		await RenderingServer.frame_post_draw
		var mimg := get_viewport().get_texture().get_image()
		var mpath := "user://mini.png"
		mimg.save_png(mpath)
		print("MINISHOT_PATH=", ProjectSettings.globalize_path(mpath))
		get_tree().quit()
		return

	if args.has("--shot") and DisplayServer.get_name() != "headless":
		# --blackout 用来出"拉闸后"的对照图（熄灯必须在画面上真的看得出来）
		if args.has("--blackout"):
			set_power(false)
		# --above：旁观者飞到天花板以上，验"俯视剖面"（天花板整层隐藏）
		if args.has("--above") and player != null:
			_finish_meeting(sim)
			player.spectator = true
			player.global_position.y = builder.ceiling_height() + 11.0
			_update_spectator_view()
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
	## 夹具修正（2026-11-10）：new_game 会开 MEET_PRE，而 _process 里
	## 「会议开着就收掉小游戏卡片」会把每张刚打开的卡在下一帧 cancel 掉，
	## 于是旧夹具恒定 MGTEST 0/10（dbg: cancel=true、open=false）。
	## 与 --walktest 同一处理：先把会正常走完，再逐型验。
	_finish_meeting(sim)
	await get_tree().create_timer(0.3).timeout
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
	var fail_ok: bool = still_open and not mg_layer.is_open() and bool(fail_state.cancel)
	print("MGTEST_FAIL held_open=%s closed=%s canceled=%s ok=%s" % [
		str(still_open), str(not mg_layer.is_open()), str(fail_state.cancel), str(fail_ok)])
	print("MGTEST_RESULT %d/%d pass" % [passed, KINDS.size()])

	## 26 个真实任务标签各开一次：证明「按 label 取到自己的 cfg」这条路真的通
	## （n / shapes / icons / lo / hi / hold / targets 全部来自 minigames.json#tasks）。
	var data: Dictionary = MinigameData.load_data()
	var task_labels: Array = data.get("tasks", {}).keys()
	var labels_ok := 0
	for label in task_labels:
		var want := String(MinigameData.task_cfg(data, String(label)).get("k", ""))
		var mark := {"kind": ""}
		var cb := func(k: String) -> void: mark.kind = k
		mg_layer.opened.connect(cb, CONNECT_ONE_SHOT)
		mg_layer.open(want, String(label), "normal", String(label),
			func() -> void: pass, func() -> void: pass)
		await get_tree().process_frame
		var opened: bool = mg_layer.is_open()
		var got := String(mark.kind)
		mg_layer.cancel()
		await get_tree().process_frame
		if opened and got == want:
			labels_ok += 1
		else:
			print("MGTEST_LABEL FAIL %s 期望 %s 实得 %s open=%s" % [
				label, want, got, str(opened)])
	print("MGTEST_LABELS %d/%d" % [labels_ok, task_labels.size()])
	_mgtest_ok = passed == KINDS.size() and fail_ok and labels_ok == task_labels.size()


func _run_mgshot(spec: String) -> void:
	## 同 --mgtest：会议开着时 _process 会把卡片收掉，拍出来的是会议面板而不是小游戏。
	_finish_meeting(sim)
	await get_tree().create_timer(0.3).timeout
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


## 旁观者飞到天花板以上 → 天花板整层（含灯带）隐藏，从上面看是完整剖面；
## 回到舱内 → 恢复。非旁观者永远保持可见。
func _update_spectator_view() -> void:
	if builder == null or player == null:
		return
	var hide: bool = player.spectator \
		and player.global_position.y > builder.ceiling_height() - 0.15
	if hide != _ceil_hidden:
		_ceil_hidden = hide
		builder.set_ceiling_visible(not hide)


func _run_specttest() -> void:
	## 旁观者三条（用户 2026-11-10）：
	## ① 舱内天花板正常；② 飞到天花板以上 → 整层隐藏（俯视剖面）；
	## ③ 向下穿不出地板（下层只是贴板，不允许掉进虚空）。
	var fails: Array = []
	player.spectator = true
	await get_tree().process_frame
	var ceil_y: float = builder.ceiling_height()

	player.global_position.y = 1.0
	_update_spectator_view()
	var in_ship: bool = not _ceil_hidden
	player.global_position.y = ceil_y + 2.0
	_update_spectator_view()
	var above: bool = _ceil_hidden
	print("SPECTTEST 天花板%.1f 舱内保持=%s 飞越隐藏=%s" % [ceil_y, str(in_ship), str(above)])
	if not in_ship:
		fails.append("舱内就隐藏了天花板")
	if not above:
		fails.append("飞越天花板后没有透视")

	player.global_position.y = -5.0
	player._physics_process(0.016)
	var y_after: float = player.global_position.y
	print("SPECTTEST 下穿夹取 y=-5 → %.2f（下限 %.2f）" % [y_after, player.SPECT_MIN_Y])
	if y_after < player.SPECT_MIN_Y - 0.001:
		fails.append("旁观者可以穿到地板以下（y=%.2f）" % y_after)

	player.global_position.y = 1.2
	_update_spectator_view()
	if _ceil_hidden:
		fails.append("回到舱内后天花板没恢复")
	print("SPECTTEST %s %d 项失败 %s" % ["OK" if fails.is_empty() else "FAIL", fails.size(), str(fails)])
	_specttest_ok = fails.is_empty()


## 无窗口动作自测：AI 出刀 → knife，受害者倒地 → down；不依赖鼠标。
func _run_crewanimtest() -> bool:
	var fails: Array = []
	started = false
	if sim == null or crew_view == null:
		print("CREWANIMTEST FAIL sim/crew_view 缺失")
		return false
	sim.meeting = {}
	crew_view.set_model_mode(true)
	crew_view.build(sim)
	var actor_i := -1
	var victim_i := -1
	for a: Dictionary in sim.agents:
		var i := int(a.get("i", -1))
		if i == int(sim.me_idx):
			continue
		if bool(a.get("alien", false)) and actor_i < 0:
			actor_i = i
		elif not bool(a.get("alien", false)) and victim_i < 0:
			victim_i = i
	if actor_i < 0 or victim_i < 0 or not crew_view._anims.has(actor_i) 			or not crew_view._anims.has(victim_i):
		print("CREWANIMTEST FAIL 没有可用的 AI 动作模型")
		return false
	var a: Dictionary = sim.agent(actor_i)
	var v: Dictionary = sim.agent(victim_i)
	a["alive"] = true
	a["downed"] = false
	a["knife"] = 1
	v["alive"] = true
	v["downed"] = false
	if not sim.knife(actor_i, victim_i):
		fails.append("sim.knife 没有成功")
	crew_view.sync(sim, 0.016)
	var ap_a := crew_view._anims[actor_i] as AnimationPlayer
	var ap_v := crew_view._anims[victim_i] as AnimationPlayer
	var knife_now := String(ap_a.current_animation)
	var down_now := String(ap_v.current_animation)
	var names := ap_a.get_animation_list()
	print("CREWANIMTEST clips=%s knife=%s down=%s" % [str(names), knife_now, down_now])
	for need: String in ["idle", "walk", "knife", "down"]:
		var has := false
		for n in names:
			if String(n).to_lower().contains(need):
				has = true
				break
		if not has:
			fails.append("缺动画 " + need)
	if not knife_now.to_lower().contains("knife"):
		fails.append("knife 没有触发（=%s）" % knife_now)
	if not down_now.to_lower().contains("down"):
		fails.append("down 没有触发（=%s）" % down_now)
	print("CREWANIMTEST %s %d 项失败 %s" % ["OK" if fails.is_empty() else "FAIL",
		fails.size(), str(fails)])
	return fails.is_empty()


## 人物 blockout 同框验收（2026-11-11）：在真实会议室并排摆
## 2.5D billboard / 3D blockout / 1.75 m 标尺，只做表现核对，不参与判定。
func _run_crewshot() -> void:
	started = false
	print("CREW_MOUSE mode=%d（0=VISIBLE，2=CAPTURED）" % Input.mouse_mode)
	if player != null:
		player.ui_locked = true
		player.camera.current = false
	if hud_layer != null:
		hud_layer.visible = false
	if crew_view != null:
		crew_view.visible = false
	if minimap != null:
		minimap.visible = false
	var cam := Camera3D.new()
	cam.fov = 50.0
	cam.near = 0.03
	cam.far = 60.0
	add_child(cam)
	cam.global_position = Vector3(31.0, 1.55, 37.6)
	cam.look_at(Vector3(31.0, 0.95, 33.5), Vector3.UP)
	cam.current = true

	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])

	# 左：2.5D billboard（与 crew_view 完全相同的纹理/像素尺寸）
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
		add_child(sp)
	_crewshot_label("2.5D billboard", Vector3(30.15, 2.18, 33.5), font,
		Color(0.82, 0.90, 1.0))

	# 右：3D lowpoly（参考图建模 + idle/walk）
	var shot_glb := "res://assets/models/char_crew_lowpoly.glb"
	if not ResourceLoader.exists(shot_glb):
		shot_glb = "res://assets/models/char_crew_blockout.glb"
	var packed := load(shot_glb) as PackedScene
	var model: Node3D = null
	if packed != null:
		model = packed.instantiate() as Node3D
	if model != null:
		model.position = Vector3(31.85, 0.0, 33.5)
		add_child(model)
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
				var m := mi.mesh.surface_get_material(s)
				mats.append("?" if m == null else String(m.resource_name))
			print("CREW_MESH %s aabb=%s surfaces=%d mats=%s" % [
				String(mi.name), str(mi.get_aabb()), mats.size(), str(mats)])
		print("CREW_MODEL root=%s meshes=%d" % [String(model.name), meshes.size()])
		_crewshot_label("3D lowpoly · walk", Vector3(31.85, 2.18, 33.5), font,
			Color(0.82, 0.96, 0.86))
		# 第二个体块只换制服色，验证 15 人共用骨架/网格的配色路径
		var m2: Node3D = packed.instantiate() as Node3D
		if m2 != null:
			m2.position = Vector3(33.20, 0.0, 33.5)
			add_child(m2)
			m2.look_at(Vector3(33.20, 0.0, 37.0), Vector3.UP)
			var ap2 := m2.find_child("AnimationPlayer", true, false) as AnimationPlayer
			if ap2 != null:
				for n in ap2.get_animation_list():
					if String(n).to_lower().contains("walk"):
						ap2.play(String(n))
						ap2.seek(0.3, true)
						break
			if crew_view != null:
				crew_view._tint_model(m2, Color("#5E7A6A"))
			_crewshot_label("换色 · 15 共用", Vector3(33.20, 2.18, 33.5), font,
				Color(0.82, 0.96, 0.86))
	else:
		_crewshot_label("3D blockout 缺失", Vector3(31.85, 2.18, 33.5), font,
			Color(1.0, 0.55, 0.50))

	# 1.75 m 标尺（放在两人后方，不挡剪影）
	var bar := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.025, 1.75, 0.025)
	bar.mesh = bm
	var wm := StandardMaterial3D.new()
	wm.albedo_color = Color(0.95, 0.95, 0.95)
	wm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	bar.material_override = wm
	bar.position = Vector3(31.0, 0.875, 32.40)
	add_child(bar)
	_crewshot_label("1.75 m", Vector3(31.0, 1.92, 32.40), font, Color(0.95, 0.95, 0.95))

	await get_tree().create_timer(0.8).timeout
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var dir := "res://screenshots"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	var path := dir.path_join("crew-lowpoly.png")
	img.save_png(path)
	print("CREWSHOT_PATH=", ProjectSettings.globalize_path(path))


## 门扇闭合对照图（2026-11-11）：同一机位拍 open=0 / open=1，
## 验收「关闭时两扇中线合拢、打开时让出整段门洞」，不是半开。
func _run_doorshot() -> void:
	started = false
	print("DOOR_MOUSE mode=%d（0=VISIBLE，2=CAPTURED）" % Input.mouse_mode)
	if player != null:
		player.ui_locked = true
		player.camera.current = false
	if hud_layer != null:
		hud_layer.visible = false
	if crew_view != null:
		crew_view.visible = false
	if minimap != null:
		minimap.visible = false
	if extras == null or extras.doors.is_empty():
		print("DOORSHOT FAIL 没有门")
		return
	var door: Dictionary = extras.doors[0]
	var center: Vector3 = door["center"]
	var normal := Vector3(0, 0, 1) if bool(door["along_x"]) else Vector3(1, 0, 0)
	var to_player: Vector3 = player.global_position - center
	var side := signf(to_player.dot(normal))
	if absf(side) < 0.01:
		side = 1.0
	var cam := Camera3D.new()
	cam.fov = 48.0
	cam.near = 0.03
	cam.far = 40.0
	add_child(cam)
	cam.global_position = center + normal * (2.8 * side) + Vector3(0, 1.55, 0)
	cam.look_at(center + Vector3(0, 1.15, 0), Vector3.UP)
	cam.current = true
	var pass_r := SpaceData.num(space, "door", "pass")
	var scan_sec := SpaceData.num(space, "door", "scan_sec")
	var dir := "res://screenshots"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	for state: Array in [[0.0, "door-closed.png"], [1.0, "door-open.png"]]:
		var open := float(state[0])
		extras._apply_door_state(door, open, pass_r, true, scan_sec)
		await get_tree().create_timer(0.35).timeout
		await RenderingServer.frame_post_draw
		var img := get_viewport().get_texture().get_image()
		var path := dir.path_join(String(state[1]))
		img.save_png(path)
		print("DOORSHOT %s open=%.1f" % [ProjectSettings.globalize_path(path), open])


func _crewshot_label(txt: String, pos: Vector3, font: Font, col: Color) -> void:
	var lb := Label3D.new()
	lb.text = txt
	lb.font = font
	lb.font_size = 32
	lb.outline_size = 8
	lb.pixel_size = 0.0032
	lb.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lb.modulate = col
	lb.position = pos
	add_child(lb)


func _run_knifetest() -> void:
	## 玩家侧真实攻击链（用户 2026-11-10 反馈「作为异形无法出手」）：
	## 以异形身份开局 → 目标站到刀程内正前方 → 派发**真实左键** → 必须把人放倒。
	var fails: Array = []
	role = "alien"
	if not sim.new_game(_cur_seed, 0, map_data, space, true):
		print("KNIFETEST FAIL new_game")
		_knifetest_ok = false
		return
	sim.ai_enabled = true
	_finish_meeting(sim)
	await get_tree().create_timer(0.3).timeout
	var me: Dictionary = sim.me()
	if not bool(me.get("alien", false)):
		fails.append("玩家没被设成异形")
	var vic: Dictionary = {}
	for a: Dictionary in sim.agents:
		if int(a.get("i", -1)) != int(sim.me_idx):
			vic = a
			break
	# 目标放在正前方 1.0m（刀程默认 1.4），并把朝向真正对准它。
	# Godot 的前方是 -Z：rotation.y=θ 时 forward=(-sinθ,0,-cosθ)，
	# 所以 θ = atan2(-dir.x, -dir.z)。写成 atan2(dir.x, dir.z) 会正好朝反。
	var base: Vector3 = player.global_position
	var dir := Vector3(0, 0, -1)
	player.rotation.y = atan2(-dir.x, -dir.z)
	var p: Vector3 = base + dir * 1.0
	vic["pos"] = Vector2(p.x, p.z)
	vic["alive"] = true
	vic["downed"] = false
	me["knife"] = 1
	me["alive"] = true
	me["downed"] = false
	me["detained"] = false
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	# 夹具口径：真实游玩从「已捕获」开始；测试里 mouse_released 还是开始页的 true，
	# 不重置的话第一下左键会被当成「从 UI 夺回鼠标」，攻击链根本不会被调用。
	mouse_released = false
	await get_tree().process_frame
	await get_tree().process_frame

	# 真实左键（不带坐标，走 _input 的 CAPTURED 分支）
	var dn := InputEventMouseButton.new()
	dn.button_index = MOUSE_BUTTON_LEFT
	dn.pressed = true
	Input.parse_input_event(dn)
	var up := InputEventMouseButton.new()
	up.button_index = MOUSE_BUTTON_LEFT
	up.pressed = false
	Input.parse_input_event(up)
	await get_tree().create_timer(0.3).timeout

	var downed := bool(vic.get("downed", false))
	var knife_after := int(me.get("knife", -1))
	var aimed := _aim_target(SpaceData.num(space, "reach", "knife"), 0.55)
	print("KNIFETEST 异形=%s 目标=%s 命中=%s 剩余刀=%d 瞄到=%s" % [
		str(bool(me.get("alien", false))), String(vic.get("name", "")), str(downed),
		knife_after, String(aimed.get("name", ""))])
	if not downed:
		fails.append("左键出刀没放倒目标")
	if knife_after != 0:
		fails.append("刀数没有扣（=%d）" % knife_after)
	# 右键开枪链（人类也能用；这里只验入口不被吞）
	print("KNIFETEST %s %d 项失败 %s" % ["OK" if fails.is_empty() else "FAIL", fails.size(), str(fails)])
	_knifetest_ok = fails.is_empty()


## 真实按键/鼠标注入（玩家探针用）：按下 → 至少跨一帧 → 松开。
## 不能用直接调 sim / 内部动作函数代替——那验不出「输入链有没有接上」。
func _tap_key(key: Key) -> void:
	var d := InputEventKey.new()
	d.keycode = key
	d.physical_keycode = key
	d.pressed = true
	Input.parse_input_event(d)
	await get_tree().process_frame
	await get_tree().process_frame
	var u := InputEventKey.new()
	u.keycode = key
	u.physical_keycode = key
	u.pressed = false
	Input.parse_input_event(u)
	await get_tree().process_frame


func _tap_mouse(btn: MouseButton) -> void:
	var d := InputEventMouseButton.new()
	d.button_index = btn
	d.pressed = true
	Input.parse_input_event(d)
	await get_tree().process_frame
	var u := InputEventMouseButton.new()
	u.button_index = btn
	u.pressed = false
	Input.parse_input_event(u)
	await get_tree().process_frame


## 玩家探针（--probetest）：复现用户现场「作为异形按 E 打不倒人」。
## 全程真实 InputEvent：E / 数字键 / 左键 / F2，不直接调动作函数。
## 断言：① E 在活人身上给出出刀并真的放倒；② 左键出刀；③ E 多项轮盘选 1；
##       ④ F2 DEV 面板出现 + 枪/刀/死亡/驱逐对玩家无效。
func _run_probetest() -> void:
	var fails: Array = []
	role = "alien"
	sim.ai_enabled = false
	if not sim.new_game(_cur_seed, 0, map_data, space, true):
		print("PROBETEST FAIL new_game")
		_probetest_ok = false
		return
	sim.spectator = false
	_finish_meeting(sim)
	sim.meeting = {}
	if crew_view != null:
		crew_view.build(sim)
		print("CREW_VIEW models=%d billboards=%d" % [
			crew_view._models.size(), crew_view._sprites.size()])
		# 漂移回归：moving=true 必须切 walk，回到静止必须切 idle。
		var anim_i := -1
		for a: Dictionary in sim.agents:
			var ai := int(a.get("i", -1))
			if ai != int(sim.me_idx) and crew_view._anims.has(ai):
				anim_i = ai
				break
		if anim_i >= 0:
			var aa: Dictionary = sim.agent(anim_i)
			aa["moving"] = true
			crew_view.sync(sim, 0.016)
			var walk_now := String((crew_view._anims[anim_i] as AnimationPlayer).current_animation)
			aa["moving"] = false
			crew_view.sync(sim, 0.016)
			var idle_now := String((crew_view._anims[anim_i] as AnimationPlayer).current_animation)
			print("CREW_ANIM_SWITCH walk=%s idle=%s" % [walk_now, idle_now])
			if not walk_now.to_lower().contains("walk"):
				fails.append("moving=true 没有切 walk（=%s）" % walk_now)
			if not idle_now.to_lower().contains("idle"):
				fails.append("moving=false 没有切 idle（=%s）" % idle_now)
	var me: Dictionary = sim.me()
	if not bool(me.get("alien", false)):
		fails.append("玩家没被设成异形")
	# 其他人先挪到远处：AI 关了但 tick 仍会跑，避免目标被别的逻辑拖走。
	var victim: Dictionary = {}
	for a: Dictionary in sim.agents:
		if int(a.get("i", -1)) == int(sim.me_idx):
			continue
		a["pos"] = Vector2(6.0, 6.0)
		a["path"] = PackedVector2Array()
		a["moving"] = false
		a["doing"] = 0.0
		if victim.is_empty() and not bool(a.get("alien", false)):
			victim = a
	if victim.is_empty():
		print("PROBETEST FAIL 夹具没找到人类目标")
		_probetest_ok = false
		return
	player.global_position = Vector3(31.0, 0.05, 33.5)
	player.rotation.y = 0.0   # 前方 -Z
	player.ui_locked = false
	mouse_released = false
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	_e_down = false
	if wheel != null and wheel.is_open():
		wheel.close()
	await get_tree().process_frame
	await get_tree().process_frame

	var place_pair := func() -> void:
		me["alive"] = true
		me["downed"] = false
		me["detained"] = false
		me["knife"] = 1
		victim["pos"] = Vector2(player.global_position.x, player.global_position.z - 1.0)
		victim["alive"] = true
		victim["downed"] = false
		victim["detained"] = false
		victim["killedBy"] = -1
		victim["deathCause"] = ""

	# ① 交互扫描：站位正前方 1.0m 有人，E 的候选里必须有 attack
	place_pair.call()
	await get_tree().process_frame
	var offers := _collect_offers()
	var ids: Array = []
	var has_attack := false
	for o: Dictionary in offers:
		var oid := String(o.get("id", ""))
		ids.append(oid)
		if oid == "attack":
			has_attack = true
	print("PROBE ① 交互项=%d [%s] 有出刀=%s" % [offers.size(),
		", ".join(PackedStringArray(ids)), str(has_attack)])
	if not has_attack:
		fails.append("E 的候选里没有 attack（旁边有人却打不了）")

	# ② 真实 E：单项直接执行 → 目标濒死、刀数 -1
	_e_down = false
	await _tap_key(KEY_E)
	await get_tree().process_frame
	var e_downed := bool(victim.get("downed", false))
	print("PROBE ② 真实 E → 濒死=%s 剩余刀=%d" % [str(e_downed), int(me.get("knife", -1))])
	if not e_downed:
		fails.append("真实 E 没有放倒目标")
	if int(me.get("knife", -1)) != 0:
		fails.append("E 出刀后刀数不是 0（=%d）" % int(me.get("knife", -1)))

	# ③ 真实左键：同一套结算
	place_pair.call()
	_knife_cd = 0.0
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	await get_tree().process_frame
	var aim_dbg := _aim_target(SpaceData.num(space, "reach", "knife"), 0.55)
	print("PROBE ③ 前置 mouse=%d released=%s cd=%.2f 瞄到=%s 目标pos=%s 我pos=%s" % [
		Input.mouse_mode, str(mouse_released), _knife_cd, String(aim_dbg.get("name", "")),
		str(victim.get("pos", Vector2.ZERO)), str(me.get("pos", Vector2.ZERO))])
	await _tap_mouse(MOUSE_BUTTON_LEFT)
	await get_tree().process_frame
	print("PROBE ③ 真实左键 → 濒死=%s 剩余刀=%d 探针=%s" % [
		str(bool(victim.get("downed", false))), int(me.get("knife", -1)), str(_probe_lines)])
	if not bool(victim.get("downed", false)):
		fails.append("真实左键没有放倒目标")

	# ④ 多项轮盘：站在设备旁、目标仍在刀程内 → E 打开轮盘，按 1 选「出刀」
	var dev = null
	for d in extras.devices:
		if is_instance_valid(d) and d.point_index >= 0:
			dev = d
			break
	if dev == null:
		fails.append("夹具没找到任务设备")
	else:
		var face: Vector3 = dev.face_dir()
		player.global_position = Vector3(dev.global_position.x, 0.05, dev.global_position.z) + face * 1.6
		player.rotation.y = atan2(face.x, face.z)
		place_pair.call()
		victim["pos"] = Vector2(player.global_position.x - sin(player.rotation.y) * 1.0,
			player.global_position.z - cos(player.rotation.y) * 1.0)
		_knife_cd = 0.0
		_e_down = false
		await get_tree().process_frame
		var multi := _collect_offers()
		var multi_ids: Array = []
		for o2: Dictionary in multi:
			multi_ids.append(String(o2.get("id", "")))
		print("PROBE ④ 设备旁交互项=%d [%s]" % [multi.size(),
			", ".join(PackedStringArray(multi_ids))])
		if multi.size() < 2:
			fails.append("设备旁没有形成多项轮盘（只有 %d 项）" % multi.size())
		else:
			await _tap_key(KEY_E)
			await get_tree().process_frame
			if wheel == null or not wheel.is_open():
				fails.append("多项交互按 E 没打开轮盘")
			else:
				await _tap_key(KEY_1)
				await get_tree().process_frame
				print("PROBE ④ 轮盘选 1 → 濒死=%s 轮盘关闭=%s" % [
					str(bool(victim.get("downed", false))), str(not wheel.is_open())])
				if not bool(victim.get("downed", false)):
					fails.append("轮盘选 1 没有放倒目标")
				if wheel.is_open():
					fails.append("轮盘选 1 后没有关闭")

	# ⑤ F2 DEV：面板 / 无敌
	# 先保证玩家活着、回到会议室开阔处（设备旁边可能有掩体挡枪线）
	player.global_position = Vector3(31.0, 0.05, 33.5)
	player.rotation.y = 0.0
	me["alive"] = true
	me["downed"] = false
	me["knife"] = 1
	await get_tree().process_frame
	await _tap_key(KEY_F2)
	await get_tree().process_frame
	var dev_on := bool(sim.dev)
	var panel_on: bool = dev_panel != null and dev_panel.visible
	var row0 := String((_dev_row_labels[0] as Label).text) if not _dev_row_labels.is_empty() else ""
	print("PROBE ⑤ F2 → dev=%s 面板=%s 首行=%s" % [str(dev_on), str(panel_on), row0])
	if not dev_on:
		fails.append("F2 没有打开 DEV")
	if not panel_on:
		fails.append("DEV 面板没有显示")
	if not row0.contains("异形") or not row0.contains("（你）"):
		fails.append("DEV 首行没有显示玩家身份（%s）" % row0)
	# 真实窗口下留一张 DEV 实拍，方便人工核对排版（headless 没有渲染目标）。
	if DisplayServer.get_name() != "headless":
		await RenderingServer.frame_post_draw
		var img := get_viewport().get_texture().get_image()
		var shot_path := "user://probe-dev.png"
		img.save_png(shot_path)
		print("PROBESHOT_PATH=", ProjectSettings.globalize_path(shot_path))
	# 无敌：人类开枪打玩家 → 不濒死、子弹照扣
	victim["downed"] = false
	victim["alive"] = true
	victim["bullet"] = 1
	victim["pos"] = Vector2(player.global_position.x + 2.0, player.global_position.z)
	var shot: bool = sim.shoot(int(victim.get("i", -1)), int(sim.me_idx))
	var shot_blocked: bool = (not shot) and not bool(me.get("downed", false)) \
		and int(victim.get("bullet", -1)) == 0
	print("PROBE ⑤ DEV 挨枪 → 生效=%s 玩家濒死=%s 子弹=%d" % [
		str(shot), str(bool(me.get("downed", false))), int(victim.get("bullet", -1))])
	if not shot_blocked:
		fails.append("DEV 没有拦住 AI 开枪（shot=%s downed=%s bullet=%d）" % [
			str(shot), str(bool(me.get("downed", false))), int(victim.get("bullet", -1))])
	if sim.die(me):
		fails.append("DEV 没有拦住死亡")
	# 无敌：驱逐
	sim.meeting = {"kind": "day", "phase": "vote", "seq": 900,
		"votes": {0: int(sim.me_idx), 1: int(sim.me_idx), 2: int(sim.me_idx),
			3: int(sim.me_idx), 4: int(sim.me_idx)}}
	sim._close_meeting()
	var res: Dictionary = sim.meeting.get("result", {}) as Dictionary
	print("PROBE ⑤ DEV 被投 → 存活=%s devSaved=%s" % [
		str(bool(me.get("alive", false))), str(bool(res.get("devSaved", false)))])
	if not bool(me.get("alive", false)) or not bool(res.get("devSaved", false)):
		fails.append("DEV 没有拦住驱逐")
	sim.meeting = {}
	await _tap_key(KEY_F2)
	await get_tree().process_frame
	if bool(sim.dev):
		fails.append("F2 第二次没有关闭 DEV")
	if dev_panel != null and dev_panel.visible:
		fails.append("DEV 关闭后面板还在")

	# ⑥ knife / down 动作：AI 出刀 → actor 播 knife；受害者倒地 → 播 down。
	var actor_i := -1
	var victim2 := -1
	for a: Dictionary in sim.agents:
		var ai := int(a.get("i", -1))
		if ai == int(sim.me_idx):
			continue
		if bool(a.get("alien", false)) and actor_i < 0:
			actor_i = ai
		elif not bool(a.get("alien", false)) and victim2 < 0:
			victim2 = ai
	if actor_i >= 0 and victim2 >= 0 and crew_view != null 			and crew_view._anims.has(actor_i) and crew_view._anims.has(victim2):
		var aa: Dictionary = sim.agent(actor_i)
		var vv: Dictionary = sim.agent(victim2)
		aa["alive"] = true
		aa["downed"] = false
		aa["knife"] = 1
		vv["alive"] = true
		vv["downed"] = false
		sim.knife(actor_i, victim2)
		crew_view.sync(sim, 0.016)
		var knife_now := String((crew_view._anims[actor_i] as AnimationPlayer).current_animation)
		var down_now := String((crew_view._anims[victim2] as AnimationPlayer).current_animation)
		print("PROBE ⑥ knife=%s down=%s" % [knife_now, down_now])
		if not knife_now.to_lower().contains("knife"):
			fails.append("出刀事件没有触发 knife 动作（=%s）" % knife_now)
		if not down_now.to_lower().contains("down"):
			fails.append("倒地没有触发 down 动作（=%s）" % down_now)
	else:
		fails.append("knife/down 夹具没找到可用模型")

	print("PROBETEST %s %d 项失败 %s" % ["OK" if fails.is_empty() else "FAIL", fails.size(),
		str(fails)])
	_probetest_ok = fails.is_empty()


func _run_uitest() -> void:
	## 真实 UI 输入链（不是直接调 sim.skip_discussion）：
	##   ① 开局会议的「跳过讨论」按钮必须在视口内；
	##   ② 真实鼠标点击必须真的推进会议；
	##   ③ 会议结束后 ui_locked 解除、W 键真的能走。
	## 触发：2026-11-10 用户现场反馈「玩家无法正常操作、跳不过界面」。
	var fails: Array = []
	_finish_meeting(sim)
	sim.new_game(_cur_seed, 0, map_data, space, false)
	sim.ai_enabled = true
	await get_tree().create_timer(0.4).timeout
	_refresh_meeting_ui()
	await get_tree().process_frame
	if sim.meeting.is_empty():
		fails.append("开局没有会议（夹具前提不成立）")
	else:
		var skip_btn := meeting_skip
		if skip_btn == null or not skip_btn.is_visible_in_tree():
			fails.append("讨论期「跳过讨论」按钮不可见")
		else:
			var r: Rect2 = skip_btn.get_global_rect()
			var vp: Vector2 = get_viewport().get_visible_rect().size
			var inside: bool = r.size.y > 0.0 and r.position.y >= -0.5 \
				and r.end.y <= vp.y + 0.5 and r.end.x <= vp.x + 0.5
			print("UITEST 跳过按钮 rect=%s 视口=%s 在屏内=%s" % [str(r), str(vp), str(inside)])
			if not inside:
				fails.append("「跳过讨论」超出视口：%s / %s" % [str(r), str(vp)])
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
			for i in 24:
				await get_tree().process_frame
			var phase := String(sim.meeting.get("phase", ""))
			var advanced: bool = sim.meeting.is_empty() or phase != "discuss"
			print("UITEST 点击后 phase=%s 推进=%s" % [phase, str(advanced)])
			if not advanced:
				fails.append("点「跳过讨论」没推进会议（phase=%s）" % phase)
	_finish_meeting(sim)
	await get_tree().create_timer(0.3).timeout
	if player.ui_locked:
		fails.append("会议结束后 ui_locked 仍为 true")
	var p0: Vector3 = player.global_position
	var kd := InputEventKey.new()
	kd.physical_keycode = KEY_W
	kd.pressed = true
	Input.parse_input_event(kd)
	await get_tree().create_timer(0.8).timeout
	var ku := InputEventKey.new()
	ku.physical_keycode = KEY_W
	ku.pressed = false
	Input.parse_input_event(ku)
	var dist := p0.distance_to(player.global_position)
	print("UITEST 会议后位移=%.2f ui_locked=%s" % [dist, str(player.ui_locked)])
	if dist < 0.5:
		fails.append("会议结束后 WASD 走不动（位移 %.2f）" % dist)
	print("UITEST %s %d 项失败 %s" % ["OK" if fails.is_empty() else "FAIL", fails.size(), str(fails)])
	_uitest_ok = fails.is_empty()


## 真实鼠标点击一个控件（与 --uitest 同一套 InputEvent 派发）。
## 控件不在视口内时返回 false，让自测报「点不到」而不是静默失败。
func _click_ctrl(b: Control) -> bool:
	if b == null or not b.is_visible_in_tree():
		return false
	var r: Rect2 = b.get_global_rect()
	var vp: Vector2 = get_viewport().get_visible_rect().size
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


## 会议 UI 功能自测（2.5D 会议面板的功能层，2026-11-10 第 12 批）：
## 真实鼠标点模板 / 席位投票 / 改票 / 弃权 / 跳过讨论 / 跳过投票，
## 并验证夜会信息行、幽灵与旁观者的只读口径。
func _run_meetuitest() -> void:
	var pass_n := 0
	var fail_n := 0
	var fails: Array = []
	_finish_meeting(sim)
	sim.new_game(_cur_seed, 0, map_data, space, false)
	sim.ai_enabled = true
	await get_tree().create_timer(0.3).timeout
	_finish_meeting(sim)
	sim.meeting = {}
	if not sim.open_meeting_kind(SimStateScript.MEET_DAY, -1, -1):
		print("MEETUITEST FAIL 白会开不起来")
		_meetuitest_ok = false
		return
	_refresh_meeting_ui()
	await get_tree().process_frame
	await get_tree().process_frame
	var me_i := int(sim.me_idx)
	# ① 11 个模板 + 对象/舱室/时段下拉在讨论期可见，对象默认「未选择」
	var grid: GridContainer = null
	for c in meeting_tpl.get_children():
		if c is GridContainer:
			grid = c
	var tpl_n: int = grid.get_child_count() if grid != null else 0
	if meeting_tpl.visible and tpl_n == 11 and meeting_tpl_target.item_count >= 2:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("模板区 可见=%s 按钮=%d 对象项=%d" % [
			str(meeting_tpl.visible), tpl_n, meeting_tpl_target.item_count])
	# ② 没选对象点「怀疑」→ 不发言 + 「先选对象」提示
	var feed_n: int = sim.speech.feed.size()
	if _click_ctrl(grid.get_child(0) as Control):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("「怀疑」按钮点不到")
	await get_tree().process_frame
	await get_tree().process_frame
	if sim.speech.feed.size() == feed_n and toast_label.text.find("先选对象") >= 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("空对象没拦住 feed=%d→%d toast=%s" % [
			feed_n, sim.speech.feed.size(), toast_label.text])
	# ②b 发言流新消息提示（2.5D markNewLines）：先把内容撑满并滚到顶部，
	# 新行只累计条数、不强行跟底；点提示回到底部并清零。
	for k in 20:
		sim.speech.sys_say("系统", "填充行 %d" % k)
	await get_tree().process_frame
	await get_tree().process_frame
	meeting_feed.get_v_scroll_bar().value = 0.0
	await get_tree().process_frame
	var before_unread := _meeting_unread
	sim.speech.sys_say("系统", "测试新消息")
	await get_tree().process_frame
	await get_tree().process_frame
	if meeting_new_btn.visible and _meeting_unread > before_unread:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("新消息提示没出现 unread=%d btn=%s" % [
			_meeting_unread, str(meeting_new_btn.visible)])
	if _click_ctrl(meeting_new_btn as Control):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("新消息按钮点不到")
	await get_tree().process_frame
	if _meeting_unread == 0 and not meeting_new_btn.visible:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("新消息清零失败 unread=%d" % _meeting_unread)
	# ③ 选对象 → 「投他」只记公开意向，不替玩家落票（2.5D ctx.playerVote）
	var pick := 1
	var ti := -1
	for k in meeting_tpl_target.item_count:
		var md: Variant = meeting_tpl_target.get_item_metadata(k)
		if md != null and int(md) >= 0 and int(md) != me_i:
			pick = k
			ti = int(md)
			break
	meeting_tpl_target.select(pick)
	# 真实点击前让下拉/新消息按钮的布局稳定两帧：否则按钮 rect 可能还在上一帧的位置，
	# 点击会落到旁边的控件上（2026-11-10 偶发一次「投他模板 intent=-1」）。
	await get_tree().process_frame
	await get_tree().process_frame
	var had_vote_before := (sim.meeting.get("votes", {}) as Dictionary).has(me_i)
	if _click_ctrl(grid.get_child(1) as Control):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("「投他」按钮点不到")
	await get_tree().process_frame
	await get_tree().process_frame
	var intent := int(sim.meeting.get("player_intent", -1))
	if intent == ti and not had_vote_before \
			and not (sim.meeting.get("votes", {}) as Dictionary).has(me_i):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("投他模板 intent=%d ti=%d 落票=%s" % [
			intent, ti, str((sim.meeting.get("votes", {}) as Dictionary).has(me_i))])
	# ④ 讨论期点席位 → 真落票；再点另一个 → 改票；点弃权 → -1
	var seat_keys: Array = meeting_buttons.keys()
	seat_keys.sort()
	if seat_keys.size() >= 2 and _click_ctrl(meeting_buttons[seat_keys[0]] as Control):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("席位投票按钮点不到（%d 个）" % seat_keys.size())
	await get_tree().process_frame
	await get_tree().process_frame
	var v1 := int((sim.meeting.get("votes", {}) as Dictionary).get(me_i, -99))
	if v1 == int(seat_keys[0]):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("讨论期投票没落账 v=%d 期望 %d" % [v1, int(seat_keys[0])])
	if _click_ctrl(meeting_buttons[seat_keys[1]] as Control):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("第二个席位点不到")
	await get_tree().process_frame
	await get_tree().process_frame
	var v2 := int((sim.meeting.get("votes", {}) as Dictionary).get(me_i, -99))
	if v2 == int(seat_keys[1]) and v2 != v1:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("改票没生效 v=%d→%d" % [v1, v2])
	if meeting_list_scroll != null and meeting_abstain != null:
		meeting_list_scroll.ensure_control_visible(meeting_abstain)
		await get_tree().process_frame
	if _click_ctrl(meeting_abstain as Control):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("弃权按钮点不到")
	await get_tree().process_frame
	await get_tree().process_frame
	var v3 := int((sim.meeting.get("votes", {}) as Dictionary).get(me_i, -99))
	if v3 == -1:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("弃权没写 -1（v=%d）" % v3)
	# ⑤ 跳过讨论 → 投票期 → 跳过投票（已选保留；未选才记弃权）
	if _click_ctrl(meeting_skip as Control):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("跳过讨论点不到")
	for i in 16:
		await get_tree().process_frame
	var ph := String(sim.meeting.get("phase", ""))
	if ph == "vote":
		pass_n += 1
	else:
		fail_n += 1
		fails.append("跳过讨论后没进投票期 phase=%s" % ph)
	_refresh_meeting_ui()
	await get_tree().process_frame
	if meeting_skip_vote != null and meeting_skip_vote.is_visible_in_tree():
		pass_n += 1
	else:
		fail_n += 1
		fails.append("投票期没有「跳过投票」")
	if _click_ctrl(meeting_skip_vote as Control):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("跳过投票点不到")
	for i in 4:
		await get_tree().process_frame
	var ph2 := String(sim.meeting.get("phase", ""))
	if ph2 == "result":
		pass_n += 1
	else:
		fail_n += 1
		fails.append("跳过投后没进公布 phase=%s" % ph2)
	_refresh_meeting_ui()
	await get_tree().process_frame
	if meeting_result.text.find("弃权") >= 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("结果没显示弃权票：%s" % meeting_result.text)
	# ⑥ 夜会信息行：报告地点 / 发起人 / 伤者（死者）
	_finish_meeting(sim)
	var rep: Dictionary = sim.agent(4)
	var vic: Dictionary = sim.agent(7)
	rep["alive"] = true
	rep["downed"] = false
	rep["reportLeft"] = 2
	vic["alive"] = false
	vic["downed"] = false
	vic["bodyGone"] = false
	vic["bodyReported"] = false
	vic["bodyPos"] = sim.room_center("med")
	sim.night_meets = 0
	if sim.open_meeting_kind(SimStateScript.MEET_NIGHT, 4, 7):
		_refresh_meeting_ui()
		await get_tree().process_frame
		await get_tree().process_frame
		var info := meeting_info.text
		if meeting_info.visible and info.find("报告地点") >= 0 and info.find("死者") >= 0 \
				and info.find("医疗间") >= 0:
			pass_n += 1
		else:
			fail_n += 1
			fails.append("夜会信息行不全：%s" % info)
	else:
		fail_n += 1
		fails.append("夜会开不起来（信息行）")
	# ⑦ 幽灵只读：面板保留可读，输入/模板/投票/跳过全部关掉
	sim.me()["alive"] = false
	_refresh_meeting_ui()
	await get_tree().process_frame
	await get_tree().process_frame
	if meeting_panel.visible and not meeting_input.editable \
			and not meeting_tpl.visible and not meeting_list.visible and not meeting_skip.visible:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("幽灵只读口径错：panel=%s edit=%s tpl=%s list=%s skip=%s" % [
			str(meeting_panel.visible), str(meeting_input.editable),
			str(meeting_tpl.visible), str(meeting_list.visible), str(meeting_skip.visible)])
	sim.me()["alive"] = true
	# ⑧ 旁观者只读：可跳过讨论（文案带「旁观」），不能投票/发言
	sim.spectator = true
	_refresh_meeting_ui()
	await get_tree().process_frame
	await get_tree().process_frame
	if meeting_panel.visible and meeting_skip.visible \
			and meeting_skip.text.find("旁观") >= 0 and not meeting_list.visible:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("旁观只读口径错：skip=%s/%s list=%s" % [
			str(meeting_skip.visible), meeting_skip.text, str(meeting_list.visible)])
	sim.spectator = false
	sim.meeting = {}
	_finish_meeting(sim)
	print("MEETUITEST pass=%d fail=%d %s" % [pass_n, fail_n, str(fails)])
	_meetuitest_ok = fail_n == 0


func _count_why(w: Dictionary, target_i: int, kind: String) -> int:
	var n := 0
	for e: Variant in ((w.get("why", {}) as Dictionary).get(target_i, []) as Array):
		if String((e as Dictionary).get("kind", "")) == kind:
			n += 1
	return n


## A 档判定层自测（2026-11-10 第 13 批）：
## ① 异形挑目标只认「现在看得见 / 本夜 25 秒内亲眼见过」，不许全图锁敌；
## ② humanT 合闸目击 +0.28、封顶 1、跨夜 ×0.8；③ saw_red 5 秒节流；
## ④ saw_avoid 每夜一次且记在观察者身上；⑤ 人类 AI 任务做完会巡舱/躲人。
func _run_aiporttest() -> void:
	var pass_n := 0
	var fail_n := 0
	var fails: Array = []
	_finish_meeting(sim)
	sim.ai_enabled = false
	sim.meeting = {}
	var a: Dictionary = {}
	var h1: Dictionary = {}
	var h2: Dictionary = {}
	for x: Dictionary in sim.agents:
		if bool(x.get("alien", false)) and a.is_empty():
			a = x
		elif not bool(x.get("alien", false)) and h1.is_empty():
			h1 = x
		elif not bool(x.get("alien", false)) and h2.is_empty():
			h2 = x
	if a.is_empty() or h1.is_empty() or h2.is_empty():
		print("AIPORTTEST FAIL 席位缺失")
		_aiporttest_ok = false
		return
	var ai0 := int(a.get("i", -1))
	var h1i := int(h1.get("i", -1))
	var h2i := int(h2.get("i", -1))
	var bridge: Vector2 = sim.room_center("bridge")
	var engine: Vector2 = sim.room_center("engine")
	# 只留 h1/h2 作为候选：其余人类全部拘留（挑目标会排除 detained）。
	for x: Dictionary in sim.agents:
		var xi := int(x.get("i", -1))
		x["detained"] = xi != ai0 and xi != h1i and xi != h2i
		x["downed"] = false
		x["redT"] = 0.0
		x["_avoidHuman"] = -1
		x["accuse"] = -1
		x["target"] = -1
		x["path"] = PackedVector2Array()
	a["mates"] = {}
	a["alive"] = true
	a["knife"] = 1
	a["bullet"] = 0
	a["qual"] = 0
	a["qualPending"] = 0
	a["_sabDone"] = true
	a["drag"] = -1
	a["_fakeCD"] = 999.0
	a["_breakerRollN"] = str(int(sim.night))
	a["_breakerWant"] = false
	a["_avoid_i"] = -1
	a["_avoid_t"] = 0.0
	a["why"] = {}
	a["path"] = PackedVector2Array()
	a["target"] = -1
	a["pos"] = bridge
	h1["alive"] = true
	h1["downed"] = false
	h1["detained"] = false
	h1["pos"] = bridge + Vector2(4, 0)
	h2["alive"] = true
	h2["downed"] = false
	h2["detained"] = false
	h2["pos"] = bridge + Vector2(0, 6)
	# ① 看得见的更近者优先
	sim._ai_alien._decide(a)
	if int(a.get("target", -1)) == h1i:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("看得见的目标没选中：%d（期望 %d）" % [int(a.get("target", -1)), h1i])
	# ② 看不见且没有记忆 → 不进候选（取消全图锁敌）
	h2["detained"] = true
	h1["pos"] = engine
	a["why"] = {}
	a["path"] = PackedVector2Array()
	a["target"] = -1
	sim._ai_alien._decide(a)
	if int(a.get("target", -1)) < 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("没记忆的远处目标仍被选中：%d" % int(a.get("target", -1)))
	# ③ 本夜亲眼见过 → 用最后目击位置（25 秒内）
	sim.mind.note_track(ai0, h1i, bridge + Vector2(2, 0), "bridge")
	a["path"] = PackedVector2Array()
	a["target"] = -1
	sim._ai_alien._decide(a)
	if int(a.get("target", -1)) == h1i:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("25 秒内的记忆目标没选中：%d" % int(a.get("target", -1)))
	# ④ 超过 HUNT.memorySec(25s) → 跟丢
	var mem: Array = (a.get("why", {}) as Dictionary).get(h1i, []) as Array
	if not mem.is_empty():
		var last: Dictionary = mem[mem.size() - 1]
		last["t"] = (sim.night_len() - maxf(0.0, float(sim.t))) - 30.0
		(a["why"] as Dictionary)[h1i] = mem
	a["path"] = PackedVector2Array()
	a["target"] = -1
	sim._ai_alien._decide(a)
	if int(a.get("target", -1)) < 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("过期记忆仍被使用：%d" % int(a.get("target", -1)))
	# ⑤ humanT：远 2 格但合过闸的人优先（HUMANISH.pull 6 格当量）
	a["why"] = {}
	h2["detained"] = false
	h1["pos"] = bridge + Vector2(6, 0)
	h2["pos"] = bridge + Vector2(4, 0)
	a["path"] = PackedVector2Array()
	a["target"] = -1
	sim._ai_alien._decide(a)
	var no_ht := int(a.get("target", -1))
	sim.mind.humanish_add(a, h1i, 1.0)
	a["path"] = PackedVector2Array()
	a["target"] = -1
	sim._ai_alien._decide(a)
	var with_ht := int(a.get("target", -1))
	if no_ht == h2i and with_ht == h1i:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("humanT 拉近失效：无=%d 有=%d（期望 %d→%d）" % [
			no_ht, with_ht, h2i, h1i])
	# ⑥ 合闸目击：异形 observer 写 humanT +0.28，上限 1
	var br: Vector2 = sim.breaker_pos()
	sim.light_state = 2
	sim.power_on = false
	h1["pos"] = br
	a["pos"] = br + Vector2(1.2, 0)
	a["humanT"] = {}
	a["mates"] = {}
	sim.toggle_power(h1i)
	var ht1: float = sim.mind.humanish_of(a, h1i)
	sim.mind.humanish_add(a, h1i, 1.0)
	var ht_cap: float = sim.mind.humanish_of(a, h1i)
	if absf(ht1 - 0.28) < 0.001 and absf(ht_cap - 1.0) < 0.001:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("humanT 写入/封顶错：%0.2f / %0.2f" % [ht1, ht_cap])
	# ⑦ saw_red 5 秒节流：同一段红光只写一条证据
	h2["alive"] = true
	h2["downed"] = false
	h2["detained"] = false
	h2["pos"] = bridge + Vector2(3, 0)
	h2["why"] = {}
	h2["redSeen"] = {}
	a["pos"] = bridge
	a["redT"] = 1.0
	var e0: float = sim.elapsed
	sim._track_pass()
	var n1 := _count_why(h2, ai0, "saw_red")
	sim._track_pass()
	var n2 := _count_why(h2, ai0, "saw_red")
	sim.elapsed = e0 + 6.0
	a["redT"] = 1.0
	sim._track_pass()
	var n3 := _count_why(h2, ai0, "saw_red")
	a["redT"] = 0.0
	if n1 == 1 and n2 == 1 and n3 == 2:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("saw_red 节流错：%d/%d/%d（期望 1/1/2）" % [n1, n2, n3])
	# ⑧ saw_avoid：每夜一次，记在**观察者**身上
	h2["why"] = {}
	h2["avoidSeen"] = {}
	h2["pos"] = bridge + Vector2(3, 0)
	h1["pos"] = bridge
	h1["_avoidHuman"] = h2i
	sim._track_pass()
	var av1 := _count_why(h2, h1i, "saw_avoid")
	sim._track_pass()
	var av2 := _count_why(h2, h1i, "saw_avoid")
	var av_seen := int((h2.get("avoidSeen", {}) as Dictionary).get(h1i, -1))
	if av1 == 1 and av2 == 1 and av_seen == int(sim.night):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("saw_avoid 错：%d/%d seen=%d" % [av1, av2, av_seen])
	# ⑨ 空闲游荡 + 躲避：任务做完不再站桩
	h1["_avoidHuman"] = -1
	h1["tasks"] = [0]
	h1["tIdx"] = 1
	h1["path"] = PackedVector2Array()
	h1["doing"] = 0.0
	h1["qualPending"] = 0
	h1["warm"] = {}
	h1["cred"] = {}
	h1["known"] = {}
	h1["alive"] = true
	h1["downed"] = false
	h1["detained"] = false
	sim.dmg = []
	h2["accuse"] = -1
	sim._ai_human._idle_roam(h1)
	var roam_ok := (h1.get("path", PackedVector2Array()) as PackedVector2Array).size() > 0
	h1["path"] = PackedVector2Array()
	h2["accuse"] = h1i
	sim._ai_human._idle_roam(h1)
	var avoid_ok := int(h1.get("_avoidHuman", -1)) == h2i \
		and (h1.get("path", PackedVector2Array()) as PackedVector2Array).size() > 0
	if roam_ok and avoid_ok:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("idle roam 错：roam=%s avoid=%s/%d" % [
			str(roam_ok), str(avoid_ok), int(h1.get("_avoidHuman", -1))])
	# ⑩ 身份轴 / 目标距离乘子 / trait 系数
	a["almost"] = {"foe": {}, "friend": {}}
	a["known"] = {}
	a["mates"] = {}
	a["cred"] = {}
	(a["almost"] as Dictionary)["foe"] = {h1i: {"kinds": ["saw_knife"]}}
	var h_id: float = sim.mind.identity_axis(a, h1)
	(a["almost"] as Dictionary)["foe"] = {h1i: {"kinds": ["heard_accuse"]}}
	var h_soft: float = sim.mind.identity_axis(a, h1)
	(a["mates"] as Dictionary)[h2i] = {"t": 1.0}
	var h_mate: float = sim.mind.identity_axis(a, h2)
	a["mates"] = {}
	a["almost"] = {"foe": {}, "friend": {}}
	if absf(h_id - 0.05) < 0.001 and h_soft > 0.5 and absf(h_mate) < 0.001 \
			and absf(sim.mind.target_dist_mul(1.0) - 0.5) < 0.001 \
			and absf(sim.mind.target_dist_mul(0.0) - 1.25) < 0.001:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("身份轴错：id=%.2f soft=%.2f mate=%.2f mul=%.2f/%.2f" % [
			h_id, h_soft, h_mate, sim.mind.target_dist_mul(1.0),
			sim.mind.target_dist_mul(0.0)])
	# ⑪ 暴露度：亮舱有目击者 >0；目击者做事 / 是目标本人 → 0
	var wit := h2
	wit["alive"] = true
	wit["downed"] = false
	wit["detained"] = false
	wit["doing"] = 0.0
	wit["pos"] = bridge + Vector2(2, 0)
	h1["detained"] = true
	h1["doing"] = 0.0
	var exp_seen: float = sim._ai_alien._exposure_at(a, bridge, {})
	wit["doing"] = 3.0
	var exp_busy: float = sim._ai_alien._exposure_at(a, bridge, {})
	wit["doing"] = 0.0
	var exp_except: float = sim._ai_alien._exposure_at(a, bridge, wit)
	h1["detained"] = false
	if exp_seen > 0.0 and exp_busy == 0.0 and exp_except == 0.0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("暴露度错：seen=%.2f busy=%.2f except=%.2f" % [
			exp_seen, exp_busy, exp_except])
	# ⑫ 无目标寻人点 + 特征系数
	a["why"] = {}
	sim.mind.note_track(ai0, h1i, engine, "engine")
	var hunt: Vector2 = sim._ai_alien._hunt_spot(a)
	var hunt_ok := hunt.distance_to(engine) < 1.0
	a["why"] = {}
	var hunt2: Vector2 = sim._ai_alien._hunt_spot(a)
	var here_room: String = sim.room_at(a.get("pos", Vector2.ZERO))
	var tally: Dictionary = {}
	for p: Dictionary in (sim.map.get("points", []) as Array):
		var pr := String(p.get("room", ""))
		if pr == "" or pr == here_room:
			continue
		tally[pr] = int(tally.get(pr, 0)) + 1
	var best_room := ""
	var best_n := 0
	for k2: String in tally.keys():
		if int(tally[k2]) > best_n:
			best_n = int(tally[k2])
			best_room = k2
	var hunt_room: String = sim.room_at(hunt2)
	var saved_trait: Dictionary = (a.get("trait", {}) as Dictionary).duplicate()
	a["trait"] = {"aggr": 50, "caut": 50, "soc": 50, "cur": 50}
	var p1: float = sim.mind.trait_c("knifeWatcherPenalty", a)
	var p2: float = sim.mind.trait_c("knifeBusyBonus", a)
	var p3: float = sim.mind.trait_c("grudgeGain", a)
	var p4: float = sim.mind.trait_c("trustGain", a)
	var p5: float = sim.mind.trait_c("voteGrudgePull", a)
	a["trait"] = saved_trait
	if hunt_ok and hunt_room == best_room and absf(p1 - 12.0) < 0.01 \
			and absf(p2 + 12.0) < 0.01 and absf(p3 - 1.0) < 0.01 \
			and absf(p4 - 1.0) < 0.01 and absf(p5 - 6.0) < 0.01:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("寻人点/系数错：hunt=%s room=%s/%s coef=%.1f/%.1f/%.1f/%.1f/%.1f" % [
			str(hunt_ok), hunt_room, best_room, p1, p2, p3, p4, p5])
	# ⑬ humanT 跨夜 ×0.8（1.0 → 0.8）
	sim.mind.humanish_add(a, h1i, 1.0)
	sim.mind.reset_night()
	var ht_decay: float = sim.mind.humanish_of(a, h1i)
	if absf(ht_decay - 0.8) < 0.01:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("humanT 跨夜衰减错：%0.2f" % ht_decay)
	print("AIPORTTEST pass=%d fail=%d %s" % [pass_n, fail_n, str(fails)])
	_aiporttest_ok = fail_n == 0


func _press_escape() -> void:
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


## 鼠标口径自测（2026-11-10 现场反馈「开截图工具时鼠标被框在游戏窗口里」）：
##   ① 自由游玩 CAPTURED；
##   ② Esc → VISIBLE，并且**多帧之后仍然 VISIBLE**（旧版下一帧被重新捕获，Esc 等于无效）；
##   ③ 点击画面 → CAPTURED；
##   ④ 会议打开 → VISIBLE，关闭 → CAPTURED（未释放时）；
##   ⑤ 先 Esc 释放再开/关会议 → 关闭后仍 VISIBLE（不吞掉用户释放的状态）。
func _run_mousetest() -> void:
	var pass_n := 0
	var fail_n := 0
	var fails: Array = []
	_finish_meeting(sim)
	sim.meeting = {}
	mouse_released = false
	_refresh_mouse_mode()
	await get_tree().process_frame
	if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("自由游玩不是 CAPTURED：%d" % Input.mouse_mode)
	_press_escape()
	for i in 20:
		await get_tree().process_frame
	if mouse_released and Input.mouse_mode == Input.MOUSE_MODE_VISIBLE:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("Esc 释放无效：released=%s mode=%d" % [
			str(mouse_released), Input.mouse_mode])
	var dn := InputEventMouseButton.new()
	dn.button_index = MOUSE_BUTTON_LEFT
	dn.pressed = true
	Input.parse_input_event(dn)
	await get_tree().process_frame
	await get_tree().process_frame
	if not mouse_released and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("点击收回无效：released=%s mode=%d" % [
			str(mouse_released), Input.mouse_mode])
	# 会议打开 / 关闭
	sim.open_meeting_kind(SimStateScript.MEET_DAY, -1, -1)
	_refresh_meeting_ui()
	await get_tree().process_frame
	await get_tree().process_frame
	var meet_open_mode := Input.mouse_mode
	_finish_meeting(sim)
	_refresh_meeting_ui()
	await get_tree().process_frame
	await get_tree().process_frame
	if meet_open_mode == Input.MOUSE_MODE_VISIBLE \
			and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("会议鼠标口径错：开=%d 关=%d" % [meet_open_mode, Input.mouse_mode])
	# 先 Esc 释放，再开 / 关会议：关闭后仍保持 VISIBLE
	_press_escape()
	await get_tree().process_frame
	sim.open_meeting_kind(SimStateScript.MEET_DAY, -1, -1)
	_refresh_meeting_ui()
	await get_tree().process_frame
	_finish_meeting(sim)
	_refresh_meeting_ui()
	for i in 6:
		await get_tree().process_frame
	if mouse_released and Input.mouse_mode == Input.MOUSE_MODE_VISIBLE:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("会议吞掉了 Esc 释放：released=%s mode=%d" % [
			str(mouse_released), Input.mouse_mode])
	# 收尾
	mouse_released = false
	_refresh_mouse_mode()
	print("MOUSETEST pass=%d fail=%d %s" % [pass_n, fail_n, str(fails)])
	_mousetest_ok = fail_n == 0


## 结算页自测（2026-11-10 第 14 批）：
## ① 终票在 close 时按 seq 落「vote」事件（中途改票只记 vote_change）；
## ② 投票矩阵按场次分组、含弃权；③ 身份表 15 行、含阵营/结局/死亡地点/刀在；
## ④ 阵亡态（sim.over=false）不显示结算身份表。
func _run_settletest() -> void:
	var pass_n := 0
	var fail_n := 0
	var fails: Array = []
	_finish_meeting(sim)
	sim.meeting = {}
	settle_panel.visible = false
	# ① 一场干净投票：0→2、1→2、2→弃权；0 先改 3 再改回 2
	sim.open_meeting_kind(SimStateScript.MEET_DAY, -1, -1)
	var seq0 := int(sim.meeting.get("seq", 0))
	sim.meeting["phase"] = "vote"
	sim.meeting["votes"] = {}
	sim.cast_vote(0, 2)
	sim.cast_vote(1, 2)
	sim.cast_vote(2, -1)
	sim.cast_vote(0, 3)
	sim.cast_vote(0, 2)
	sim._close_meeting()
	var votes: Array = []
	var changes: Array = []
	for e: Dictionary in sim.events:
		if String(e.get("kind", "")) == "vote":
			votes.append(e)
		elif String(e.get("kind", "")) == "vote_change":
			changes.append(e)
	var mine: Dictionary = {}
	for e: Dictionary in votes:
		if int(e.get("seq", -1)) == seq0:
			mine[int(e.get("actor", -1))] = int(e.get("target", -2))
	if mine.size() == 3 and int(mine.get(0, -9)) == 2 \
			and int(mine.get(1, -9)) == 2 and int(mine.get(2, 9)) == -1 \
			and not changes.is_empty():
		pass_n += 1
	else:
		fail_n += 1
		fails.append("终票落账错：seq=%d votes=%s changes=%d" % [
			seq0, str(mine), changes.size()])
	var vtxt := _settle_votes_text()
	if vtxt.find("场投票") >= 0 and vtxt.find("弃权") >= 0 and vtxt.find("→") >= 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("投票矩阵缺内容：%s" % vtxt)
	sim.meeting = {}
	# ② knife 倒地 / 死亡地点
	var alien_i := -1
	var human_i := -1
	for a: Dictionary in sim.agents:
		if bool(a.get("alien", false)) and alien_i < 0:
			alien_i = int(a.get("i", -1))
		elif not bool(a.get("alien", false)) and human_i < 0:
			human_i = int(a.get("i", -1))
	if alien_i >= 0 and human_i >= 0:
		var k: Dictionary = sim.agent(alien_i)
		var h: Dictionary = sim.agent(human_i)
		k["alive"] = true
		k["downed"] = false
		k["knife"] = 1
		h["alive"] = true
		h["downed"] = false
		h["pos"] = sim.room_center("bridge")
		sim.knife(alien_i, human_i)
		var down_room := String(h.get("downRoom", ""))
		sim.die(h)
		var death_room := String(h.get("deathRoom", ""))
		if down_room == "bridge" and death_room == "bridge" \
				and String(h.get("deathCause", "")) == "knife":
			pass_n += 1
		else:
			fail_n += 1
			fails.append("死亡地点错：down=%s death=%s cause=%s" % [
				down_room, death_room, String(h.get("deathCause", ""))])
	else:
		fail_n += 1
		fails.append("席位缺失（结算）")
	# ③ 结算页：15 行身份表 + 结局/地点
	sim.over = true
	sim.over_win = true
	sim.over_why = "自测结算"
	_show_end()
	var rows := settle_ids.text.split("\n").size()
	var ids := settle_ids.text
	if settle_panel.visible and rows == sim.agents.size() \
			and ids.find("异形") >= 0 and ids.find("人类") >= 0 \
			and ids.find("被出刀") >= 0 and ids.find("中央会议室") >= 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("身份表错：visible=%s rows=%d/%d" % [
			str(settle_panel.visible), rows, sim.agents.size()])
	# ④ 阵亡态（局未结束）不显示结算身份表
	sim.over = false
	settle_panel.visible = false
	_refresh_sim_hud()
	if not settle_panel.visible:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("阵亡态泄露了结算身份表")
	# 收尾
	sim.over = false
	sim.over_win = false
	sim.over_why = ""
	settle_panel.visible = false
	print("SETTLETEST pass=%d fail=%d %s" % [pass_n, fail_n, str(fails)])
	_settletest_ok = fail_n == 0


## 局内小地图自测（2026-11-10 第 15 批）：
## ① 尺寸固定、鼠标穿透；② 灯态 0/1/2 三态；③ 自己的任务点与 sim.remaining_tasks 同源；
## ④ 静态地图数据齐全（10 舱 / 走廊 / 8 管道 / 设施 / 26 任务点）。
func _run_minimaptest() -> void:
	var pass_n := 0
	var fail_n := 0
	var fails: Array = []
	_finish_meeting(sim)
	sim.meeting = {}
	await get_tree().process_frame
	if minimap != null and minimap.size.x >= 200.0 and minimap.size.y > minimap.size.x \
			and minimap.mouse_filter == Control.MOUSE_FILTER_IGNORE:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("小地图尺寸/穿透错：%s" % (
			str(minimap.size) if minimap != null else "null"))
	var old := int(sim.light_state)
	sim.light_state = 0
	var b0: bool = minimap._room_lit("bridge", "bright")
	var p0: bool = minimap._room_lit("power", "dark")
	sim.light_state = 1
	var p1: bool = minimap._room_lit("power", "dark")
	sim.light_state = 2
	var b2: bool = minimap._room_lit("bridge", "bright")
	var p2: bool = minimap._room_lit("power", "dark")
	sim.light_state = old
	if b0 and not p0 and p1 and b2 and not p2:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("灯态错：0=%s/%s 1=%s 2=%s/%s" % [
			str(b0), str(p0), str(p1), str(b2), str(p2)])
	if bool(sim.spectator):
		pass_n += 1
	else:
		var mine: Array = sim.remaining_tasks()
		var me: Dictionary = sim.me()
		var total: int = (me.get("tasks", []) as Array).size()
		if mine.size() > 0 and mine.size() <= total:
			pass_n += 1
		else:
			fail_n += 1
			fails.append("任务点集合错：mine=%d total=%d" % [mine.size(), total])
	var map_ok: bool = (sim.map.get("rooms", []) as Array).size() >= 10 \
		and (sim.map.get("corridors", []) as Array).size() > 0 \
		and (sim.map.get("pipes", []) as Array).size() == 8 \
		and (sim.map.get("facility", []) as Array).size() >= 4 \
		and (sim.map.get("points", []) as Array).size() == 26
	if map_ok:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("地图数据不全")
	print("MINIMAPTEST pass=%d fail=%d %s" % [pass_n, fail_n, str(fails)])
	_minimaptest_ok = fail_n == 0


## 证据/情绪/口供自测（2026-11-10 第 16 批）：
## ① grudge/trust 写值 + isPatron；② best_grudge + 投票砸票；③ patron 不过票；
## ④ claimHist 只留 3 场 + claim_recall 台词；⑤ evalAlmost 的 WEAK/heard/fresh/friend；
## ⑥ note_testimony 一次只写一条 why（DESC 后的种类），DESC 会真的制造描述失真。
func _run_socialtest() -> void:
	var pass_n := 0
	var fail_n := 0
	var fails: Array = []
	_finish_meeting(sim)
	sim.meeting = {}
	var h: Dictionary = {}
	var t: Dictionary = {}
	var l: Dictionary = {}
	for a: Dictionary in sim.agents:
		var i := int(a.get("i", -1))
		if i == int(sim.me_idx) or bool(a.get("alien", false)):
			continue
		if h.is_empty():
			h = a
		elif t.is_empty():
			t = a
		elif l.is_empty():
			l = a
	if h.is_empty() or t.is_empty() or l.is_empty():
		print("SOCIALTEST FAIL 席位缺失")
		_socialtest_ok = false
		return
	var hi := int(h.get("i", -1))
	var ti := int(t.get("i", -1))
	var li := int(l.get("i", -1))
	# ① grudge / trust / is_patron（中立性格系数 = 1）
	h["trait"] = {"aggr": 50, "caut": 50, "soc": 50, "cur": 50}
	h["grudge"] = {}
	h["trust"] = {}
	h["alive"] = true
	h["downed"] = false
	t["alive"] = true
	t["downed"] = false
	sim.mind.grudge_add(h, ti, 0.45)
	var g1 := float((h.get("grudge", {}) as Dictionary).get(ti, 0.0))
	sim.mind.trust_add(h, ti, 0.40)
	var tr1 := float((h.get("trust", {}) as Dictionary).get(ti, 0.0))
	var patron0: bool = sim.mind.is_patron(h, ti)
	sim.mind.trust_add(h, ti, 0.40)
	var patron1: bool = sim.mind.is_patron(h, ti)
	if absf(g1 - 0.45) < 0.001 and absf(tr1 - 0.40) < 0.001 \
			and not patron0 and patron1:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("grudge/trust 错：g=%.2f t=%.2f patron=%s/%s" % [
			g1, tr1, str(patron0), str(patron1)])
	# ② best_grudge + 投票砸票（grudge 0.7，20 次至少中一次）
	h["grudge"] = {ti: 0.7}
	var bg: Dictionary = sim.mind.best_grudge(h)
	var hit := 0
	for k in 20:
		if sim._ai_vote_target(h) == ti:
			hit += 1
	if int(bg.get("i", -1)) == ti and hit > 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("grudge 投票错：best=%d hit=%d" % [int(bg.get("i", -1)), hit])
	# ③ patron 不过票：trust=1，sus 最高也不投他
	h["trust"] = {ti: 1.0}
	h["grudge"] = {}
	h["sus"] = {ti: 0.95}
	h["susNight"] = {ti: int(sim.night)}
	h["known"] = {}
	h["almost"] = {"foe": {}, "friend": {}}
	h["accuse"] = -1
	h["why"] = {}
	var patron_hits := 0
	for k2 in 10:
		if sim._ai_vote_target(h) == ti:
			patron_hits += 1
	if patron_hits == 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("patron 被投了 %d 次" % patron_hits)
	# ④ claimHist 只留 3 场 + claim_recall
	sim.mind.record_claim(h, "bridge")
	sim.mind.record_claim(h, "engine")
	sim.mind.record_claim(h, "med")
	sim.mind.record_claim(h, "power")
	var ch: Array = h.get("claimHist", []) as Array
	var hist_ok := ch.size() == 3 and String((ch[2] as Dictionary).get("roomId", "")) == "power"
	# 造一场会：h 上一场在 bridge，本场在 engine → 另一个 AI 说 claim_recall
	h["claimHist"] = [{"night": int(sim.night), "room": "中央会议室", "roomId": "bridge"}]
	h["_lie"] = {}
	h["pos"] = sim.room_center("engine")
	h["alive"] = true
	h["downed"] = false
	sim.stats["claimRecall"] = 0
	sim.open_meeting_kind(SimStateScript.MEET_DAY, -1, -1)
	var recall_n := int(sim.stats.get("claimRecall", 0))
	sim.meeting = {}
	if hist_ok and recall_n > 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("claimHist 错：hist=%d recall=%d" % [ch.size(), recall_n])
	# ⑤ evalAlmost 全量
	var cur := int(sim.night)
	h["known"] = {}
	h["almost"] = {"foe": {}, "friend": {}}
	h["cred"] = {}
	h["credWhy"] = {}
	h["sus"] = {ti: 0.6}
	h["susNight"] = {ti: cur}
	h["why"] = {ti: [
		{"kind": "empty_accuse", "night": cur},
		{"kind": "quick_report", "night": cur},
	]}
	sim.mind.eval_almost(h, ti)
	var weak_ok: bool = not (h.get("almost", {}) as Dictionary).get("foe", {}).has(ti)
	h["why"] = {ti: [
		{"kind": "saw_knife", "night": cur},
		{"kind": "saw_pipe", "night": cur},
	]}
	sim.mind.eval_almost(h, ti)
	var foe_ok: bool = (h.get("almost", {}) as Dictionary).get("foe", {}).has(ti)
	h["almost"] = {"foe": {}, "friend": {}}
	h["why"] = {ti: [
		{"kind": "saw_knife", "night": cur - 5},
		{"kind": "saw_pipe", "night": cur - 5},
	]}
	sim.mind.eval_almost(h, ti)
	var stale_ok: bool = not (h.get("almost", {}) as Dictionary).get("foe", {}).has(ti)
	h["almost"] = {"foe": {}, "friend": {}}
	h["why"] = {ti: [
		{"kind": "saw_knife", "night": cur},
		{"kind": "heard_accuse", "night": cur},
	]}
	sim.mind.eval_almost(h, ti)
	var heard_ok: bool = (h.get("almost", {}) as Dictionary).get("foe", {}).has(ti)
	# friend：cred + credWhy 两种新鲜
	h["almost"] = {"foe": {}, "friend": {}}
	h["why"] = {}
	h["cred"] = {ti: 0.6}
	h["credWhy"] = {ti: [
		{"kind": "task", "night": cur},
		{"kind": "fix", "night": cur},
	]}
	sim.mind.eval_almost(h, ti)
	var friend_ok: bool = (h.get("almost", {}) as Dictionary).get("friend", {}).has(ti)
	if weak_ok and foe_ok and stale_ok and heard_ok and friend_ok:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("evalAlmost 错：weak=%s foe=%s stale=%s heard=%s friend=%s" % [
			str(weak_ok), str(foe_ok), str(stale_ok), str(heard_ok), str(friend_ok)])
	# ⑥ DESC + 单条 why
	h["why"] = {ti: []}
	h["almost"] = {"foe": {}, "friend": {}}
	h["sus"] = {}
	l["why"] = {ti: []}
	l["heard"] = []
	l["sus"] = {}
	l["alive"] = true
	l["downed"] = false
	sim.stats["descErrors"] = 0
	for k3 in 60:
		sim.mind.note_testimony(li, hi, ti, "saw_knife", 0.3, "bridge")
	var why_arr: Array = (l.get("why", {}) as Dictionary).get(ti, []) as Array
	var last_kind := ""
	if not why_arr.is_empty():
		last_kind = String((why_arr[why_arr.size() - 1] as Dictionary).get("kind", ""))
	var desc_n := int(sim.stats.get("descErrors", 0))
	if (l.get("heard", []) as Array).size() > 0 and why_arr.size() == 60 \
			and last_kind != "heard_testimony" and desc_n > 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("DESC/单写错：heard=%d why=%d kind=%s desc=%d" % [
			(l.get("heard", []) as Array).size(), why_arr.size(), last_kind, desc_n])
	print("SOCIALTEST pass=%d fail=%d %s" % [pass_n, fail_n, str(fails)])
	_socialtest_ok = fail_n == 0


func _run_leadtest() -> void:
	## 第 3 批的两条新判定各自钉一条：
	## ① meeting.lead 只记**第一个**带节奏的人（2.5D ctx.lead）；
	## ② quick_report：夜会报案 ≤10 秒且目击者见过尸体 → 怀疑报案人；超过 10 秒不记。
	_finish_meeting(sim)
	var s = sim
	var pass_n := 0
	var fail_n := 0

	s.open_meeting_kind(SimStateScript.MEET_DAY, -1, -1)
	s.note_accuse(3, 5)
	s.note_accuse(9, 5)
	var lead_map: Dictionary = s.meeting.get("lead", {}) as Dictionary
	if int(lead_map.get(5, -1)) == 3:
		pass_n += 1
	else:
		fail_n += 1
		print("LEADTEST FAIL 带头追责 lead=%s（期望 3）" % str(lead_map.get(5, -1)))
	s.meeting = {}

	# ② 快报案
	var rep: Dictionary = s.agent(4)
	var vic: Dictionary = s.agent(7)
	# 目击者必须是**人类**：quick_report 只写给人类（异形不因报案快而怀疑人）。
	var wit: Dictionary = {}
	for cand: Dictionary in s.agents:
		var ci := int(cand.get("i", -1))
		if ci == 4 or ci == 7 or bool(cand.get("alien", false)):
			continue
		wit = cand
		break
	if rep.is_empty() or wit.is_empty() or vic.is_empty():
		print("LEADTEST FAIL 席位缺失")
		_leadtest_ok = false
		return
	var wit_i := int(wit.get("i", -1))
	rep["alive"] = true
	rep["downed"] = false
	rep["reportLeft"] = 2
	wit["alive"] = true
	wit["downed"] = false
	wit["bodySeen"] = {}
	wit["why"] = {}
	vic["alive"] = false
	vic["downed"] = false
	vic["bodyReported"] = false
	vic["deathAt"] = s.elapsed - 3.0
	s.night_meets = 0
	s.note_body(wit_i, 7)
	if s.open_meeting_kind(SimStateScript.MEET_NIGHT, 4, 7) and _why_has(wit, 4, "quick_report"):
		pass_n += 1
	else:
		fail_n += 1
		print("LEADTEST FAIL quick_report 未写入（wit=%d bodySeen=%s）" % [
			wit_i, str(wit.get("bodySeen", {}))])
	s.meeting = {}

	# ③ 反例：报案太慢（>10 秒）不记
	wit["why"] = {}
	vic["deathAt"] = s.elapsed - 30.0
	s.night_meets = 0
	s.open_meeting_kind(SimStateScript.MEET_NIGHT, 4, 7)
	if not _why_has(wit, 4, "quick_report"):
		pass_n += 1
	else:
		fail_n += 1
		print("LEADTEST FAIL 慢报案也记了 quick_report")
	s.meeting = {}

	# ④ 讨论期先投：手里有确证的人会议一开始就把票压上
	s.open_meeting_kind(SimStateScript.MEET_DAY, -1, -1)
	var e: Dictionary = s.agent(6)
	var kn_t: Dictionary = s.agent(8)
	if e.is_empty() or kn_t.is_empty():
		fail_n += 2
		print("LEADTEST FAIL 席位缺失（早投）")
	else:
		e["alive"] = true
		e["downed"] = false
		kn_t["alive"] = true
		kn_t["downed"] = false
		e["known"] = {8: {"t": s.elapsed}}
		var n_early: int = s.cast_early_votes()
		var votes0: Dictionary = (s.meeting.get("votes", {}) as Dictionary).duplicate()
		var vm: Dictionary = (s.meeting.get("voteMeta", {}) as Dictionary).get(6, {}) as Dictionary
		if n_early >= 1 and int(votes0.get(6, -1)) == 8 \
				and int(vm.get("early", 0)) == 1 and String(vm.get("why", "")) == "known":
			pass_n += 1
		else:
			fail_n += 1
			print("LEADTEST FAIL 早投 n=%d votes=%s meta=%s" % [n_early, str(votes0), str(vm)])
		# ⑤ 确信不松绑：why==known 的早投票不被改票闸改动
		s.reconsider_votes(0)
		if int((s.meeting.get("votes", {}) as Dictionary).get(6, -1)) == 8:
			pass_n += 1
		else:
			fail_n += 1
			print("LEADTEST FAIL known 早投票被改掉")
	s.meeting = {}
	print("LEADTEST pass=%d fail=%d" % [pass_n, fail_n])
	_leadtest_ok = fail_n == 0 and pass_n == 5


func _why_has(w: Dictionary, target_i: int, reason: String) -> bool:
	var why: Dictionary = (w.get("why", {}) as Dictionary)
	for e: Variant in (why.get(target_i, []) as Array):
		if String((e as Dictionary).get("reason", "")) == reason:
			return true
	return false


func _run_devicetest() -> void:
	_sim_gate = false
	## 与 --mgtest 同一条坑：会议开着时 _process 会把小游戏卡片收掉，
	## 旧夹具因此在开局讨论里恒报 open=false。先把会正常走完。
	_finish_meeting(sim)
	await get_tree().create_timer(0.3).timeout
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
	var opened: bool = mg_layer.is_open() and player.ui_locked
	print("DEVICE_TEST open=%s kind=%s locked=%s" % [
		str(mg_layer.is_open()), dev.kind, str(player.ui_locked)])
	mg_layer.debug_solve()
	await get_tree().create_timer(0.9).timeout
	var closed: bool = not mg_layer.is_open() and not player.ui_locked
	print("DEVICE_TEST closed=%s unlocked=%s" % [
		str(not mg_layer.is_open()), str(not player.ui_locked)])
	_devicetest_ok = opened and closed
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

	# 门：开合/扫描是**模拟层状态**（sim.door_tick ← 2.5D doorTick）。
	# 断电时靠近，未满扫描秒数必须拦人；扫满才放行；离开重新上锁。
	var scan_sec := SpaceData.num(space, "door", "scan_sec")
	var pass_r := SpaceData.num(space, "door", "pass")
	var vis_door: Dictionary = extras.doors[0]
	var door_key := String(vis_door.get("key", ""))
	var door: Dictionary = {}
	for sd: Dictionary in sim.doors:
		if String(sd.get("key", "")) == door_key:
			door = sd
			break
	if door.is_empty():
		print("POWERTEST FAIL sim 与场景的门键对不上：%s" % door_key)
		return
	# 开局 pre 会议还挂着（2.5D doorTick 同样在会议期冻结）——测试里清掉它，
	# 只为了门能推进；真实对局里会议期间门就该冻着。
	sim.meeting = {}
	var at2 := Vector2(float(door["x"]), float(door["y"]))
	var me_agent: Dictionary = sim.agent(sim.me_idx)
	var saved_pos: Vector2 = me_agent.get("pos", Vector2.ZERO)
	sim.light_state = 2
	sim.power_on = false
	# 2.5D doorTick 的 busy 只看 agent 位置：把人放到门口，才有"有人要过门"这件事。
	me_agent["pos"] = at2
	door["open"] = 0.0
	door["scan_t"] = 0.0
	sim.door_tick(0.1)
	print("POWERTEST 门 0.1s scan=%.2f open=%.2f 拦人=%s（期望 scan<%.1f 且拦）" % [
		float(door["scan_t"]), float(door["open"]), str(float(door["open"]) <= pass_r), scan_sec])
	# 穿门方向的线段必须**垂直穿过**门缝（与门同向的线是平行线，segX 恒 false）
	var seg_a := Vector2(float(door["x"]), float(door["y"]) - 3.0) if bool(door["horiz"]) \
		else Vector2(float(door["x"]) - 3.0, float(door["y"]))
	var seg_b := Vector2(float(door["x"]), float(door["y"]) + 3.0) if bool(door["horiz"]) \
		else Vector2(float(door["x"]) + 3.0, float(door["y"]))
	var blocked_mid: bool = sim.door_blocked_segment(seg_a.x, seg_a.y, seg_b.x, seg_b.y)
	var los_closed: bool = not sim.los_now(seg_a.x, seg_a.y, seg_b.x, seg_b.y)
	print("POWERTEST 门 未扫满 doorBlockedSegment=%s los被门挡=%s（期望 true true）"
		% [str(blocked_mid), str(los_closed)])
	var steps := int(ceil(scan_sec / 0.1)) + 6
	for i in steps:
		sim.door_tick(0.1)
	var los_open: bool = sim.los_now(seg_a.x, seg_a.y, seg_b.x, seg_b.y)
	print("POWERTEST 门 %.1fs scan=%.2f open=%.2f 放行=%s los通=%s（期望 true true）" % [
		scan_sec, float(door["scan_t"]), float(door["open"]),
		str(float(door["open"]) > pass_r), str(los_open)])
	# 人离开 → 重新上锁（2.5D：离开后 scanT 归零）
	me_agent["pos"] = at2 + Vector2(14.0, 0.0)
	for i in 40:
		sim.door_tick(0.1)
	print("POWERTEST 门 离开后 scan=%.2f open=%.2f 重新拦人=%s" % [
		float(door["scan_t"]), float(door["open"]), str(float(door["open"]) <= pass_r)])
	me_agent["pos"] = saved_pos
	sim.light_state = 0
	sim.power_on = true
	door = vis_door
	# 门扇几何：关闭时两扇必须在中线合拢（gap=0），完全打开时让出整段门洞（gap=2*half）。
	var half := float(door["half"])
	var off: Vector3 = door["offset"]
	var leaves: Array = door["leaves"]
	var blockers: Array = door["blockers"]
	extras._apply_door_state(door, 0.0, pass_r, true, scan_sec)
	var c0: Vector3 = (leaves[0] as Node3D).position
	var c1: Vector3 = (leaves[1] as Node3D).position
	var gap_closed := absf(((c1 - off * (half * 0.5)) - (c0 + off * (half * 0.5))).dot(off))
	var closed_blocked := not (blockers[0]["shape"] as CollisionShape3D).disabled
	extras._apply_door_state(door, 1.0, pass_r, true, scan_sec)
	c0 = (leaves[0] as Node3D).position
	c1 = (leaves[1] as Node3D).position
	var gap_open := absf(((c1 - off * (half * 0.5)) - (c0 + off * (half * 0.5))).dot(off))
	var open_blocked := not (blockers[0]["shape"] as CollisionShape3D).disabled
	print("POWERTEST 门扇 closed_gap=%.3f closed_blocked=%s open_gap=%.3f open_blocked=%s" % [
		gap_closed, str(closed_blocked), gap_open, str(open_blocked)])
	extras._apply_door_state(door, 0.0, pass_r, true, scan_sec)
	set_power(true)
	var s2: Dictionary = builder.light_stats()
	print("POWERTEST 复电 rooms_on=%d corridor_on=%d ambient=%.3f" % [
		s2.rooms_on, s2.corridor_on, s2.ambient])
	# 三态：电路修好后合闸是 1（全舱全亮），不是常态 0（只亮亮舱）。
	# 2.5D refreshLight：st===1 → G.lit[r.id]=true for all rooms。
	var all_rooms: int = (map_data.get("rooms", []) as Array).size()
	if sim != null:
		sim.power_fixed = true
		sim.light_state = 2
		apply_light_state(2)
		sim.light_state = 1
		apply_light_state(1)
	var s3: Dictionary = builder.light_stats()
	print("POWERTEST 三态 全亮 rooms_on=%d/%d 通过=%s" % [
		s3.rooms_on, all_rooms, str(int(s3.rooms_on) == all_rooms)])
	if sim != null:
		sim.power_fixed = false
		sim.light_state = 0
		apply_light_state(0)

	# 电闸时长：拉闸 min(off_max, off_step×n)，合闸 on_default
	var br = null
	for dev in extras.devices:
		if dev.point_index < 0:
			br = dev
			break
	if br == null:
		print("POWERTEST FAIL 找不到电闸设备")
		return
	if sim != null:
		sim.breaker_pulls = 0
		sim.light_state = 0
	var seq: Array = []
	for i in 4:
		seq.append(String(_breaker_offer(br).get("hint", "")))
		if sim != null:
			sim.breaker_pulls += 1
	print("POWERTEST 拉闸时长序列 %s" % str(seq))
	if sim != null:
		sim.light_state = 2
	power_on = false
	print("POWERTEST 合闸时长 %s" % String(_breaker_offer(br).get("hint", "")))
	if sim != null:
		sim.light_state = 0
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
	audio.set_listener(Vector2.ZERO)
	print("AUDIOTEST volAt d=0→%.2f d=9→%.2f d=18→%.2f（2.5D: 1.00 / 0.57 / 0.14）" % [
		audio.vol_at(Vector2.ZERO), audio.vol_at(Vector2(9, 0)), audio.vol_at(Vector2(18, 0))])
	print("AUDIOTEST 音效开关 M=%s（2.5D SND.setOn 同义）" % str(audio.is_on()))
	print("AUDIOTEST 采样 work=%s step=%s scream=%s door=%s（与 2.5D FILE 表对齐）" % [
		str(audio.has_kind("work")), str(audio.has_kind("step")),
		str(audio.has_kind("scream")), str(audio.has_kind("door"))])


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
			if dur <= 0.0:
				# 2.5D 2026-11-10：交互即领，没有站桩
				_claim_qual_now()
				done.v = true
			else:
				_start_station("领取物资申请单", dur,
					func() -> void:
						_on_claim_done()
						done.v = true)
				for i in int(ceil(dur / 0.1)) + 2:
					_tick_station(0.1)
			print("INTERACT 领取 done=%s qual_pending=%d qual=%d" % [str(done.v), qual_pending, qual])
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


func _run_endshot() -> void:
	## 结算页实拍夹具：一场投票 + 两具不同地点的尸体，强制 sim.over 后截图。
	_finish_meeting(sim)
	sim.meeting = {}
	if sim.open_meeting_kind(SimStateScript.MEET_DAY, -1, -1):
		sim.meeting["phase"] = "vote"
		sim.meeting["votes"] = {}
		sim.cast_vote(0, 2)
		sim.cast_vote(1, 2)
		sim.cast_vote(2, -1)
		sim.cast_vote(3, 5)
		sim._close_meeting()
	sim.meeting = {}
	var alien_i := -1
	var humans: Array = []
	for a: Dictionary in sim.agents:
		if bool(a.get("alien", false)) and alien_i < 0:
			alien_i = int(a.get("i", -1))
		elif not bool(a.get("alien", false)):
			humans.append(int(a.get("i", -1)))
	if alien_i >= 0 and humans.size() >= 2:
		var k: Dictionary = sim.agent(alien_i)
		k["alive"] = true
		k["downed"] = false
		k["knife"] = 2
		var h1: Dictionary = sim.agent(int(humans[0]))
		h1["alive"] = true
		h1["downed"] = false
		h1["pos"] = sim.room_center("bridge")
		sim.knife(alien_i, int(humans[0]))
		sim.die(h1)
		var h2: Dictionary = sim.agent(int(humans[1]))
		h2["alive"] = true
		h2["downed"] = false
		h2["pos"] = sim.room_center("engine")
		sim.knife(alien_i, int(humans[1]))
		sim.die(h2)
	sim.over = true
	sim.over_win = true
	sim.over_why = "异形全部出局"
	_show_end()
	await get_tree().create_timer(0.6).timeout
	await RenderingServer.frame_post_draw
	var path := "user://end.png"
	get_viewport().get_texture().get_image().save_png(path)
	print("ENDSHOT_PATH=", ProjectSettings.globalize_path(path))


func _run_meetshot() -> void:
	# 开局会（pre）还开着时，下面这场夜会根本开不出来 —— 截图会一直停在第 1 天的
	# 开局讨论，夜会的「报告地点 / 伤者」信息行永远看不到。先正常走完它。
	_finish_meeting(sim)
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
	# 夹具必须**先**把面板打开再排台词：否则 9 秒的 tick 全发生在面板打开之前，
	# _meeting_feed_start 会把已经说过的发言整段跳过，截图里发言流永远是空的。
	_refresh_meeting_ui()
	await get_tree().process_frame
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


## 出刀反馈层：命中标记 + 红色边缘闪。放在 hud_layer 之上，不拦鼠标。
func _build_fx() -> void:
	fx_layer = CanvasLayer.new()
	fx_layer.layer = 2
	add_child(fx_layer)

	red_flash = ColorRect.new()
	red_flash.color = Color(0.72, 0.05, 0.05, 0.0)
	red_flash.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	red_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fx_layer.add_child(red_flash)

	hit_mark = HitMark.new()
	hit_mark.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hit_mark.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fx_layer.add_child(hit_mark)

	# 暗房遮罩单独放在 layer 0（HUD 之下），径向渐变：中心透明、四周全黑。
	dark_layer = CanvasLayer.new()
	dark_layer.layer = 0
	add_child(dark_layer)
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
	dark_rect = TextureRect.new()
	dark_rect.texture = gtex
	dark_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dark_rect.stretch_mode = TextureRect.STRETCH_SCALE
	dark_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dark_rect.modulate = Color(1.0, 1.0, 1.0, 0.0)
	dark_layer.add_child(dark_rect)


## 出刀反馈总入口：hit=true 走命中（标记 + 红闪 + 镜头冲击 + 血花），
## false 只做轻微镜头回弹（挥空也要有手感，但不能假装命中）。
func _knife_hit_fx(hit: bool, at: Vector3 = Vector3.ZERO) -> void:
	if hit:
		_hit_t = 0.28
		_red_t = 0.30
		if player != null:
			player.punch(1.0)
		if at != Vector3.ZERO:
			_spawn_blood(at)
	else:
		if player != null:
			player.punch(0.3)
		# 挥空也要有刀风：命中时音效由事件层播，这里只补「空挥」这一下。
		if audio != null:
			audio.play("knife", 0.45)


## 受害者血花：一次性粒子，0.5 秒散完。用 CPUParticles3D 而不是贴图，
## 保证不给发布包加资产，也不依赖渲染后端。
func _spawn_blood(pos: Vector3) -> void:
	var p := CPUParticles3D.new()
	p.amount = 16
	p.lifetime = 0.5
	p.one_shot = true
	p.explosiveness = 0.95
	p.direction = Vector3(0.0, 0.55, 0.0)
	p.spread = 55.0
	p.initial_velocity_min = 1.1
	p.initial_velocity_max = 3.0
	p.gravity = Vector3(0.0, -6.5, 0.0)
	p.scale_amount_min = 0.6
	p.scale_amount_max = 1.4
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
	add_child(p)
	p.global_position = pos
	p.emitting = true
	get_tree().create_timer(1.0, false).timeout.connect(p.queue_free)


## 每帧衰减命中标记与红闪；不给每个效果单独建 Tween，避免状态互相打架。
func _tick_fx(delta: float) -> void:
	if _hit_t > 0.0:
		_hit_t = maxf(0.0, _hit_t - delta)
		if hit_mark != null:
			hit_mark.t = _hit_t
			hit_mark.queue_redraw()
	if _red_t > 0.0:
		_red_t = maxf(0.0, _red_t - delta)
		if red_flash != null:
			red_flash.color.a = 0.26 * (_red_t / 0.30)


## 手上的刀只在「异形 + 本夜还有刀 + 活着且没倒地 + 不在会议」时出现。
## 人类拿刀会直接泄露身份，所以这里必须严格跟着 sim 状态走。
## 2.5D refreshLight 的三态 + SIGHT：判断玩家所在房间是否点亮。
func _player_room_lit() -> bool:
	if sim == null or player == null:
		return true
	var st := int(sim.light_state)
	if st == 1:
		return true
	var p := Vector2(player.global_position.x, player.global_position.z)
	var rid: String = sim.room_at(p)
	if rid == "":
		# 走廊：常态亮，拉闸全黑（2.5D corrLit = st!==2）
		return st != 2
	if st == 2:
		return rid == "bridge"
	for r: Dictionary in (map_data.get("rooms", []) as Array):
		if String(r.get("id", "")) == rid:
			return String(r.get("light", "bright")) == "bright"
	return true


## 暗房遮罩：DEV / 旁观者不遮；进暗房 0.62，出暗房 0。
## 2.5D die() 之后：alive=false 且 ghost=true —— 穿墙、全视、仍可做自己的剩余任务。
## 3D 之前只把 alive 置 false 就弹「你已阵亡 / 按 R 重开」，等于把幽灵态整段丢了。
func _tick_player_state() -> void:
	if player == null or sim == null or sim.agents.is_empty():
		return
	var me: Dictionary = sim.me()
	var dead := not bool(me.get("alive", true))
	player.set_ghost(dead)
	player.set_downed(bool(me.get("downed", false)))
	if dead and not _ghost_toast:
		_ghost_toast = true
		var left := maxi(0, sim.ghost_cap() - int(me.get("ghostPts", 0)))
		_toast("你已阵亡 · 幽灵态：穿墙、全视，仍可做自己剩下的任务（额度 %d 分）" % left)
		_probe("幽灵态 · 穿墙/全视 · 任务额度 %d" % left)


func _tick_darkness(delta: float) -> void:
	if dark_rect == null or sim == null:
		return
	var target := 0.0
	if not bool(sim.dev) and not bool(sim.spectator) \
			and not bool(sim.me().get("ghost", false)) and not _player_room_lit():
		target = 0.62
	_dark_alpha = lerpf(_dark_alpha, target, clampf(delta * 4.0, 0.0, 1.0))
	dark_rect.modulate.a = _dark_alpha


## 故障点世界标记：sim.dmg 是唯一数据源，标记只是表现，随修复自动消失。
func _tick_fault_marks() -> void:
	if sim == null:
		return
	var live := {}
	for d: Dictionary in sim.dmg:
		var rid := String(d.get("room", ""))
		if rid == "":
			continue
		live[rid] = true
		if _fault_marks.has(rid):
			continue
		var node := _make_fault_mark(d)
		add_child(node)
		_fault_marks[rid] = node
	for rid2 in _fault_marks.keys():
		if live.has(rid2):
			continue
		var old = _fault_marks[rid2]
		if is_instance_valid(old):
			old.queue_free()
		_fault_marks.erase(rid2)
	var pulse := 0.85 + 0.15 * sin(Time.get_ticks_msec() / 200.0)
	for rid3 in _fault_marks.keys():
		var n = _fault_marks[rid3]
		if is_instance_valid(n):
			(n as Node3D).scale = Vector3.ONE * pulse


func _make_fault_mark(d: Dictionary) -> Node3D:
	var root := Node3D.new()
	var x := float(d.get("x", 0.0))
	var y := float(d.get("y", 0.0))
	if absf(x) < 0.01 and absf(y) < 0.01:
		var c: Vector2 = sim.room_center(String(d.get("room", "")))
		x = c.x
		y = c.y
	root.position = Vector3(x, 1.55, y)
	var lb := Label3D.new()
	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])
	lb.text = "⚠ 故障"
	lb.font = font
	lb.font_size = 48
	lb.pixel_size = 0.004
	lb.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lb.modulate = Color(1.0, 0.38, 0.30)
	lb.outline_size = 8
	lb.outline_modulate = Color(0.0, 0.0, 0.0, 0.9)
	root.add_child(lb)
	var light := OmniLight3D.new()
	light.light_color = Color(1.0, 0.28, 0.22)
	light.light_energy = 1.4
	light.omni_range = 2.4
	light.omni_attenuation = 1.4
	root.add_child(light)
	return root


func _tick_knife_view() -> void:
	if player == null or sim == null:
		return
	var me: Dictionary = sim.me()
	var show := false
	if not me.is_empty() and bool(me.get("alive", true)) \
			and not bool(me.get("downed", false)) and not bool(me.get("detained", false)) \
			and (role == "alien" or bool(me.get("alien", false))) \
			and int(me.get("knife", 0)) > 0 and sim.meeting.is_empty():
		show = true
	player.set_knife_visible(show)


func _build_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	hud_layer = layer

	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])

	var title := _label("新返航录 · 3D 预演", Vector2(22, 16), 22, font)
	title.add_theme_color_override("font_color", Color(1.0, 0.86, 0.52))
	layer.add_child(title)

	## 操作提示必须把**攻击键**写出来：3D 用鼠标左右键出刀/开枪，
	## 不写的话从 2.5D 过来的玩家（按 A/B）会以为「异形不能出手」。
	var help := _label("WASD 移动 · E 交互 · F 任务/设施 · R 报告 · G 拖拽 · Q 管道 · V 电闸 · B 破坏 · C 监控 · 左键出刀 · 右键开枪 · F2 DEV · P 设置",
		Vector2(22, 50), 15, font)
	help.add_theme_color_override("font_color", Color(0.78, 0.84, 0.92))
	layer.add_child(help)

	room_label = _label("中央会议室", Vector2(1000, 18), 20, font)
	room_label.add_theme_color_override("font_color", Color(0.82, 0.92, 1.0))
	# 右上角让给局内小地图（2.5D HUD 同位置）：房间名/供电读数挪到地图下方。
	room_label.anchor_left = 1.0
	room_label.anchor_right = 1.0
	room_label.offset_left = -240.0
	room_label.offset_right = -16.0
	room_label.offset_top = 292.0
	room_label.offset_bottom = 316.0
	room_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	layer.add_child(room_label)

	## 供电读数：文案与 2.5D 监控台同源（● N 路在线 / ● 信号中断 · 电闸断开）
	power_label = _label("", Vector2(1000, 46), 15, font)
	power_label.anchor_left = 1.0
	power_label.anchor_right = 1.0
	power_label.offset_left = -240.0
	power_label.offset_right = -16.0
	power_label.offset_top = 316.0
	power_label.offset_bottom = 340.0
	power_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	layer.add_child(power_label)

	## 局内小地图（2.5D drawMini）：只读地图 + sim；不画其他活人/尸体。
	minimap = MinimapScript.new()
	minimap.setup(map_data, sim)
	minimap.anchor_left = 1.0
	minimap.anchor_right = 1.0
	minimap.offset_left = -256.0
	minimap.offset_right = -16.0
	minimap.offset_top = 16.0
	minimap.offset_bottom = 16.0 + minimap.custom_minimum_size.y
	layer.add_child(minimap)

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

	alive_label = _label("", Vector2(22, 286), 14, font)
	alive_label.add_theme_color_override("font_color", Color(0.92, 0.78, 0.62))
	layer.add_child(alive_label)

	## 2.5D 规则：报告是稀缺资源（每人全局 2 次 / 每夜最多 2 场夜会），HUD 必须显示。
	report_label = _label("", Vector2(22, 262), 13, font)
	report_label.add_theme_color_override("font_color", Color(0.62, 0.70, 0.80))
	layer.add_child(report_label)

	feed_label = _label("", Vector2(22, 312), 12, font)
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

	## 结算页（2.5D #end：本局身份 + 谁投了谁）。
	## 玩家阵亡但局还没结束时仍用上面的 end_panel（**不泄露身份**）；
	## 只有 sim.over 才显示这一层，两套口径不要混。
	settle_panel = ColorRect.new()
	settle_panel.color = Color(0.01, 0.02, 0.04, 0.90)
	settle_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	settle_panel.visible = false
	settle_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	layer.add_child(settle_panel)
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 36)
	settle_panel.add_child(margin)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 7)
	margin.add_child(col)
	settle_title = _label("", Vector2.ZERO, 30, font)
	settle_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	settle_title.add_theme_color_override("font_color", Color(1.0, 0.86, 0.52))
	col.add_child(settle_title)
	settle_sub = _label("", Vector2.ZERO, 16, font)
	settle_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(settle_sub)
	settle_stats = _label("", Vector2.ZERO, 13, font)
	settle_stats.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	settle_stats.add_theme_color_override("font_color", Color(0.62, 0.70, 0.80))
	col.add_child(settle_stats)
	var settle_scroll := ScrollContainer.new()
	settle_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	settle_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(settle_scroll)
	var settle_center := CenterContainer.new()
	settle_center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	settle_center.size_flags_vertical = Control.SIZE_EXPAND_FILL
	settle_scroll.add_child(settle_center)
	var content := VBoxContainer.new()
	content.custom_minimum_size = Vector2(880, 0)
	content.add_theme_constant_override("separation", 5)
	settle_center.add_child(content)
	content.add_child(_label("本局身份", Vector2.ZERO, 14, font))
	settle_ids = RichTextLabel.new()
	settle_ids.bbcode_enabled = true
	settle_ids.fit_content = true
	settle_ids.scroll_active = false
	settle_ids.custom_minimum_size = Vector2(880, 0)
	settle_ids.add_theme_font_size_override("normal_font_size", 13)
	settle_ids.add_theme_color_override("default_color", Color(0.78, 0.84, 0.92))
	content.add_child(settle_ids)
	content.add_child(_label("谁投了谁", Vector2.ZERO, 14, font))
	settle_votes = RichTextLabel.new()
	settle_votes.bbcode_enabled = true
	settle_votes.fit_content = true
	settle_votes.scroll_active = false
	settle_votes.custom_minimum_size = Vector2(880, 0)
	settle_votes.add_theme_font_size_override("normal_font_size", 13)
	settle_votes.add_theme_color_override("default_color", Color(0.78, 0.84, 0.92))
	content.add_child(settle_votes)
	var btns := HBoxContainer.new()
	btns.alignment = BoxContainer.ALIGNMENT_CENTER
	btns.add_theme_constant_override("separation", 10)
	col.add_child(btns)
	var again := Button.new()
	again.text = "再来一局"
	again.custom_minimum_size = Vector2(140, 36)
	again.add_theme_font_size_override("font_size", 15)
	again.pressed.connect(_restart_sim)
	btns.add_child(again)
	var rep := Button.new()
	rep.text = "查看复盘"
	rep.custom_minimum_size = Vector2(140, 36)
	rep.add_theme_font_size_override("font_size", 15)
	rep.pressed.connect(func() -> void: ui_panels.open_replay(sim.events))
	btns.add_child(rep)

	_build_dev_panel()
	_refresh_sim_hud()


## DEV 侧栏（2.5D renderDevPanel，js/game.js:594-623）：一人一行，
## 名字 / 阵营 / 状态 / 舱室 / 随身资源。3D 用右侧可滚动栏，不压左上角 HUD。
## 只读 sim，不反向写规则；开关状态在 sim.dev。
func _build_dev_panel() -> void:
	dev_layer = CanvasLayer.new()
	dev_layer.layer = 13
	add_child(dev_layer)
	dev_panel = PanelContainer.new()
	dev_panel.visible = false
	dev_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dev_panel.anchor_left = 1.0
	dev_panel.anchor_right = 1.0
	dev_panel.anchor_top = 0.0
	dev_panel.anchor_bottom = 1.0
	dev_panel.offset_left = -390.0
	dev_panel.offset_right = -16.0
	dev_panel.offset_top = 352.0   # 让开小地图 + 舱室/供电读数（2.5D DEV 横栏同样下移 HUD）
	dev_panel.offset_bottom = -24.0
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.027, 0.047, 0.071, 0.93)
	sb.border_color = Color(0.20, 0.275, 0.361, 0.95)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(3)
	dev_panel.add_theme_stylebox_override("panel", sb)
	dev_layer.add_child(dev_panel)
	var margin := MarginContainer.new()
	for side: String in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 9)
	dev_panel.add_child(margin)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 4)
	margin.add_child(col)

	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])
	dev_title = Label.new()
	dev_title.text = "DEV · 全知总览"
	dev_title.add_theme_font_override("font", font)
	dev_title.add_theme_font_size_override("font_size", 15)
	dev_title.add_theme_color_override("font_color", Color(0.498, 0.827, 0.941))
	col.add_child(dev_title)
	dev_sub = Label.new()
	dev_sub.text = "F2 关闭 · 攻击与驱逐对你无效 · 尸体卡显示凶手"
	dev_sub.add_theme_font_override("font", font)
	dev_sub.add_theme_font_size_override("font_size", 9)
	dev_sub.add_theme_color_override("font_color", Color(0.478, 0.529, 0.596))
	dev_sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(dev_sub)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(scroll)
	dev_rows = VBoxContainer.new()
	dev_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	dev_rows.add_theme_constant_override("separation", 2)
	scroll.add_child(dev_rows)
	for i in 15:
		var lb := Label.new()
		lb.add_theme_font_override("font", font)
		lb.add_theme_font_size_override("font_size", 10)
		lb.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		lb.mouse_filter = Control.MOUSE_FILTER_IGNORE
		dev_rows.add_child(lb)
		_dev_row_labels.append(lb)

	dev_stats = Label.new()
	dev_stats.add_theme_font_override("font", font)
	dev_stats.add_theme_font_size_override("font_size", 10)
	dev_stats.add_theme_color_override("font_color", Color(0.647, 0.702, 0.776))
	dev_stats.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(dev_stats)

	dev_probe = Label.new()
	dev_probe.add_theme_font_override("font", font)
	dev_probe.add_theme_font_size_override("font_size", 9)
	dev_probe.add_theme_color_override("font_color", Color(0.498, 0.698, 0.780))
	dev_probe.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	dev_probe.custom_minimum_size = Vector2(0, 96)
	dev_probe.text = "探针 · 最近 8 条\n（按 E / 左键 / 右键 / F2 会记在这里）"
	col.add_child(dev_probe)


## 状态文案与资源行照 2.5D renderDevPanel（js/game.js:601-620）。
func _refresh_dev_panel() -> void:
	if dev_panel == null:
		return
	var on: bool = sim != null and not sim.agents.is_empty() \
		and (bool(sim.dev) or bool(sim.spectator))
	dev_panel.visible = on
	if not on:
		return
	dev_title.text = "DEV · 全知总览" if bool(sim.dev) else "旁观者 · 全知总览"
	dev_sub.text = ("F2 关闭 · 攻击与驱逐对你无效 · 尸体卡显示凶手" if bool(sim.dev)
		else "旁观者不参与对局 · 名字与阵营全知")
	var i := 0
	for a: Dictionary in sim.agents:
		if i >= _dev_row_labels.size():
			break
		var lb: Label = _dev_row_labels[i]
		var st := "待机"
		if not bool(a.get("alive", false)):
			st = "幽灵" if bool(a.get("ghost", false)) else "出局"
		elif bool(a.get("downed", false)):
			st = "濒死"
		elif bool(a.get("detained", false)):
			st = "被擒"
		elif float(a.get("doing", 0.0)) > 0.0:
			match String(a.get("_doing", "")):
				"task": st = "做任务"
				"fix": st = "修故障"
				"revive": st = "施救"
				"qual": st = "领申请单"
				"ammo": st = "取子弹"
				"med": st = "取医疗包"
				"breaker": st = "拉闸"
				"fake": st = "假装做任务"
				_: st = "行动"
		elif bool(a.get("moving", false)):
			st = "移动"
		var where_pos: Vector2 = a.get("pos", Vector2.ZERO)
		if not bool(a.get("alive", false)):
			var bp: Variant = a.get("bodyPos", null)
			if bp is Vector2:
				var bpv: Vector2 = bp
				if bpv != Vector2.ZERO:
					where_pos = bpv
		var where: String = sim.room_name(sim.room_at(where_pos))
		var extra := ""
		if bool(a.get("detained", false)):
			extra = " · 被锁"
		elif int(a.get("draggedBy", -1)) >= 0:
			extra = " · 被拖"
		elif int(a.get("drag", -1)) >= 0:
			extra = " · 拖尸"
		var res := "弹%d 包%d 单%d%s" % [int(a.get("bullet", 0)), int(a.get("medkit", 0)),
			int(a.get("qual", 0)),
			("+%d" % int(a.get("qualPending", 0))) if int(a.get("qualPending", 0)) > 0 else ""]
		res += " · 任务%d/%d" % [int(a.get("tIdx", 0)), (a.get("tasks", []) as Array).size()]
		if bool(a.get("alien", false)):
			res += " · 刀%d" % int(a.get("knife", 0))
		var who := String(a.get("name", "?"))
		if int(a.get("i", -1)) == int(sim.me_idx) and not bool(sim.spectator):
			who += "（你）"
		lb.text = "%02d %s · %s · %s · %s%s\n   %s" % [int(a.get("i", 0)) + 1, who,
			"异形" if bool(a.get("alien", false)) else "人类", st, where, extra, res]
		var col := Color(0.898, 0.341, 0.310) if bool(a.get("alien", false)) \
			else Color(0.867, 0.890, 0.925)
		if not bool(a.get("alive", false)):
			col = Color(0.55, 0.58, 0.62, 0.85)
		elif int(a.get("i", -1)) == int(sim.me_idx):
			col = Color(0.941, 0.776, 0.455)
		lb.add_theme_color_override("font_color", col)
		lb.visible = true
		i += 1
	for j in range(i, _dev_row_labels.size()):
		(_dev_row_labels[j] as Label).visible = false
	var downed_n := 0
	for a2: Dictionary in sim.agents:
		if bool(a2.get("alive", false)) and bool(a2.get("downed", false)):
			downed_n += 1
	dev_stats.text = "存活 %d/%d · 濒死 %d · 维修 %d/%d · 夜 %d · %.0fs · 探针 %d" % [
		_alive_count(), sim.agents.size(), downed_n, int(sim.prog), int(sim.win_pts()),
		int(sim.night), maxf(0.0, float(sim.t)), _probe_lines.size()]
	dev_probe.text = "探针 · 最近 8 条\n" + "\n".join(PackedStringArray(_probe_lines))


## 探针记录：只读、不判定。DEV 开着时同时打到 stdout，方便无头复现。
func _probe(text: String) -> void:
	var line := text
	if sim != null:
		line = "[第%d夜 %5.1fs] %s" % [int(sim.night), float(sim.t), text]
	_probe_lines.append(line)
	if _probe_lines.size() > 8:
		_probe_lines.pop_front()
	if sim != null and bool(sim.dev):
		print("PROBE " + line)
	if dev_probe != null:
		dev_probe.text = "探针 · 最近 8 条\n" + "\n".join(PackedStringArray(_probe_lines))


## DEV 拦截消息（sim.dev_log 不进 events）：只在 DEV 开着时提示并记入探针。
func _poll_dev_log() -> void:
	if sim == null:
		return
	if _dev_log_n > sim.dev_log.size():
		_dev_log_n = 0
	if sim.dev_log.size() > _dev_log_n:
		for i in range(_dev_log_n, sim.dev_log.size()):
			var txt := String((sim.dev_log[i] as Dictionary).get("text", ""))
			if txt != "" and bool(sim.dev):
				_toast(txt)
				_probe(txt)
	_dev_log_n = sim.dev_log.size()


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
	# 站位由 map_v2 的 facility.secbot 推出来（正下方 4.6m），不再写死坐标：
	# 地图换布局后写死的点会被新掩体挡住射线，hit_bot 直接返回 false
	# （2026-11-10 实测旧坐标 80,75 已被 armory_workbench 挡住）。
	var sec_fac := {}
	for f0: Dictionary in (s.map.get("facility", []) as Array):
		if String(f0.get("kind", "")) == "secbot":
			sec_fac = f0
			break
	var me: Dictionary = s.me()
	if sec_fac.is_empty():
		me["pos"] = Vector2(80.0, 75.0)
	else:
		me["pos"] = Vector2(float(sec_fac.get("x", 0)), float(sec_fac.get("y", 0)) + 4.6)
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
	# 2.5D logEvent('vote_change')（js/game.js:7398）只在**真改票**时记。
	# 第七批修复了 cast_vote 把 `votes.has()` 写在赋值之后、导致每票都被记成改票的 bug；
	# 此前本断言是靠那个 bug 通过的（AI 两轮投票覆盖时刷出一串假 vote_change）。
	# 现在按真源显式构造 vote 相位，让 0 号先投 2 号、再改投 3 号，验证真改票才记事件。
	s3.meeting = {"phase": "vote", "votes": {}, "t": 5.0}
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
	# 2.5D simGame（js/game.js:11054-11058）：maxNights=15，
	# maxSteps = ceil(15*NIGHT/dt)+6000 = 17250，条件 `!over && night<=15 && steps<maxSteps`。
	# 第七批拨乱反正：此前 3D 放宽成 26 夜 / 20000 tick，理由是「残局收尾慢、避免把
	# 还能分出胜负的局误记成超时」—— 属于为读数好看放宽验收口径；且 pre/day/night
	# 会议链与进攻链现已接入，该理由不再成立。按真源恢复，不改任何判定。
	var max_nights := 15
	var max_ticks := 17250
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
			# 2.5D `while(!G.over && G.night<=maxNights && steps<maxSteps)`（js/game.js:11058）
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
	report += "- 引擎：Godot 4.6 / `scripts/sim/sim_state.gd`，seed 20261108 起 %d 局，dt=0.1，上限 %d 夜（%d tick，2.5D simGame 口径）。\n" % [games, max_nights, max_ticks]
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
	# 回应池：证据必须由被指者用 player_claim_deny 否认，且不能记成对目标的证词。
	var claim_line: Dictionary = s2.speech.feed[-1] as Dictionary if not s2.speech.feed.is_empty() else {}
	if String(claim_line.get("cat", "")) == "player_claim_deny" \
			and int(claim_line.get("target", -2)) == -1:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 证据回应池/目标错：%s" % str(claim_line))
	# 作证回应不能写成对目标的证词（2.5D playerTalk 的 support 分支不加 sus）。
	var sup_name := String(s2.agent(1).get("name", ""))
	s2.speech.player_say("我可以为%02d %s作证" % [2, sup_name])
	var sup_line: Dictionary = s2.speech.feed[-1] as Dictionary if not s2.speech.feed.is_empty() else {}
	if String(sup_line.get("cat", "")) in ["player_support_thanks", "skeptic_ask"] \
			and int(sup_line.get("target", -2)) == -1:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 作证回应池/目标错：%s" % str(sup_line))
	# 「不是我 + 我在X」必须接到否认回应，而不是被自述位置分支截走。
	s2.speech.player_say("不是我，我一整晚都在医疗间")
	var deny_line: Dictionary = s2.speech.feed[-1] as Dictionary if not s2.speech.feed.is_empty() else {}
	if String(deny_line.get("cat", "")) in ["press_deny", "ack_short"] \
			and int(deny_line.get("target", -2)) == -1:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 否认+位置回应池错：%s" % str(deny_line))
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
	# 席位号解析（2.5D decision.js:96-99）：补零 / 「第 N 席」/ 中文数字都要认得出。
	# 3D 原先只匹配「%d号」，玩家写「07号」「第七号」全被当成没点名。
	var seat_cases := ["7号 是异形", "07号 是异形", "第七号 是异形", "第7席 是异形"]
	var seat_hit := 0
	for c in seat_cases:
		var ps: Dictionary = s2.lines_data.parse_speech(String(c), s2)
		if (ps.get("people", []) as Array).has(6):
			seat_hit += 1
		else:
			print("SPEECHTEST FAIL 席位号没认出：%s → %s" % [c, str(ps.get("people", []))])
	if seat_hit != seat_cases.size():
		fail_n += 1
	# 模板 → parse_speech 契约（2026-11-11）：按钮/生成器/解析器同一份清单。
	# 逐条生成并解析，失败必须点名，不能只看按钮数量。
	var tpl_defs := _meeting_template_defs()
	var tpl_hit := 0
	var tpl_bad: Array = []
	var claim_want := {"pipe": "saw_pipe", "red": "saw_red", "knife": "saw_knife",
		"sabotage": "saw_sabotage", "bot": "saw_bot", "breaker": "saw_breaker"}
	var tpl_target: Dictionary = s2.agent(2)
	for pair: Array in tpl_defs:
		var k := String(pair[0])
		var has_t := k != "where" and k != "deny"
		var rid := "engine" if k == "pipe" else ("power" if k == "breaker" else "med")
		var txt := _meet_template_text(k, tpl_target if has_t else {}, rid, "")
		var ps: Dictionary = s2.lines_data.parse_speech(txt, s2)
		var good := false
		if k == "accuse":
			good = int(ps.get("accuse", -1)) == 2
		elif k == "vote":
			good = int(ps.get("vote", -1)) == 2
		elif k == "support":
			good = int(ps.get("support", -1)) == 2
		elif k == "where":
			good = String(ps.get("where", "")) == "med" and String(ps.get("when", "")) == ""
		elif k == "deny":
			good = bool(ps.get("deny", false)) and String(ps.get("where", "")) == "med"
		elif claim_want.has(k):
			var c: Dictionary = ps.get("claim", {}) as Dictionary
			good = not c.is_empty() and String(c.get("kind", "")) == String(claim_want[k]) \
				and int(c.get("target", -1)) == 2 and String(c.get("room", "")) == rid \
				and String(ps.get("where", "")) == ""
		if good:
			tpl_hit += 1
		else:
			tpl_bad.append("%s→%s" % [k, str(ps)])
	if tpl_hit != tpl_defs.size():
		fail_n += 1
		print("SPEECHTEST FAIL 模板解析 %d/%d：%s" % [tpl_hit, tpl_defs.size(), " | ".join(PackedStringArray(tpl_bad))])
	var nr_txt := _meet_template_text("knife", tpl_target, "", "")
	var nr_ps: Dictionary = s2.lines_data.parse_speech(nr_txt, s2)
	var nr_c: Dictionary = nr_ps.get("claim", {}) as Dictionary
	if not nr_c.is_empty() and String(nr_c.get("room", "")) == "" and not nr_txt.contains("就在"):
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 空舱室仍注入地点：%s → %s" % [nr_txt, str(nr_ps)])
	var tmpl_when_bad := 0
	for w: String in ["recent", "night"]:
		var wp: Dictionary = s2.lines_data.parse_speech(
			_meet_template_text("where", {}, "med", w), s2)
		if String(wp.get("where", "")) != "med" or String(wp.get("when", "")) != w:
			tmpl_when_bad += 1
	if tmpl_when_bad == 0:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 时段模板解析失败 %d/2" % tmpl_when_bad)
	if tpl_defs.size() == 11:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 模板数量 %d（应 11）" % tpl_defs.size())
	print("SPEECHTEST pass=%d fail=%d 讨论台词=%d feed=%d 残留=%d 复读=%d 玩家解析=%s 席位号=%d/%d 模板=%d/%d" % [
		pass_n, fail_n, chat_n, feed_n, bad_slot, dup,
		String(claim.get("kind", "none")), seat_hit, seat_cases.size(),
		tpl_hit, tpl_defs.size()])
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
	# ai_enabled=false（AI 全关）下 _cast_ai_votes 不会替 AI 落票 ——
	# 投票矩阵由显式投票构造（与 b6test 的 vote_change 断言同一口径）。
	m.cast_vote(0, 2)
	m.cast_vote(1, 2)
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
	# 追捕超时 7 秒 → 放弃（2.5D：贴不到人就 G.secCatch=null，不是硬拖走）。
	# 把目标放到很远的地方，模拟"追不上"，tick 满 8 秒后必须已释放。
	var far: Dictionary = s.agent(9)
	if not far.is_empty():
		b.sec_uses = 0
		b.catch_state = {}
		far["alive"] = true
		far["downed"] = false
		b._start_catch(9)
		far["pos"] = b.sec_pos + Vector2(60.0, 0.0)
		for k3 in 90:
			s.tick(0.1)
		if s.bots.catch_state.is_empty() and not bool(far.get("detained", false)):
			pass_n += 1
		else:
			fail_n += 1
			print("BOTTEST FAIL 追捕超时没放弃 phase=%s detained=%s" % [
				str(s.bots.catch_state.get("phase", "")), str(far.get("detained", false))])
		b.sec_uses = 0
	else:
		fail_n += 1
		print("BOTTEST FAIL 追捕超时夹具没能起手")
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
func _has_screenshot_arg(args: PackedStringArray) -> bool:
	for a in args:
		if a in ["--shot", "--crewshot", "--doorshot", "--mgshot", "--devshot",
				"--covershot", "--ceilshot", "--pipeshot", "--meetshot",
				"--endshot", "--minishot", "--homeshot", "--reel"]:
			return true
	return false


func _has_gate_arg(args: PackedStringArray) -> bool:
	for a in args:
		if a.begins_with("--") and a != "--seed" \
				and a != "--homeshot" and a != "--hometest" \
				and a != "--crew-model" and a != "--crew-billboard":
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
	if settle_panel != null:
		settle_panel.visible = false
	if end_panel != null:
		end_panel.visible = false
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
	qual_pending = 0
	qual = 0
	station = {}
	_player_dead = false
	_down_toast = false
	if end_panel != null:
		end_panel.visible = false
	if settle_panel != null:
		settle_panel.visible = false
	if crew_view != null:
		crew_view.build(sim)
	var p: Vector2 = sim.me().get("pos", Vector2(27.0, 34.8))
	player.global_position = Vector3(p.x, 0.05, p.y)
	player.rotation.y = -PI * 0.5 + 0.05
	player.process_mode = Node.PROCESS_MODE_INHERIT
	# 新一局从「鼠标已被捕获」开始；截图模式则保持可见，不能抢用户鼠标。
	mouse_released = _screenshot_mode
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if _screenshot_mode else Input.MOUSE_MODE_CAPTURED
	_refresh_sim_hud()
	_toast("你是 %s · %s · 第 %d 夜" % [
		String(sim.me().get("name", "")),
		"异形" if role == "alien" else "人类", int(sim.night)])


func _meeting_mk_button(text: String, cb: Callable, fs: int = 14) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, 30)
	b.add_theme_font_size_override("font_size", fs)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.07, 0.09, 0.13, 0.94)
	sb.border_color = Color(0.20, 0.26, 0.34, 1.0)
	sb.set_border_width_all(1)
	b.add_theme_stylebox_override("normal", sb)
	b.add_theme_stylebox_override("hover", sb)
	b.add_theme_stylebox_override("pressed", sb)
	b.add_theme_color_override("font_color", Color(0.86, 0.92, 1.0))
	b.pressed.connect(cb)
	return b


## 会议面板（2.5D 三栏的功能层：左发言+模板 / 中标题+跳过 / 右投票）。
## 3D 保留单面板，但左右分两列，保证 1280×720 下「跳过讨论」与投票区都够得着；
## 像素排布属表现层，功能项逐条对齐 js/ui/templates.js:286-328。
func _build_meeting_ui() -> void:
	if meeting_panel != null:
		return
	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])
	meeting_panel = ColorRect.new()
	meeting_panel.color = Color(0.01, 0.02, 0.04, 0.90)
	meeting_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	meeting_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	meeting_panel.visible = false
	hud_layer.add_child(meeting_panel)

	# 会议内容必须**永远够得着**：外面的 ScrollContainer 兜底，内容再长也能滚到。
	var scroll := ScrollContainer.new()
	scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	meeting_panel.add_child(scroll)
	var center := CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	center.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.add_child(center)
	var box := VBoxContainer.new()
	box.custom_minimum_size = Vector2(980, 0)
	box.add_theme_constant_override("separation", 7)
	center.add_child(box)

	meeting_title = _label("发现尸体 · 投票", Vector2.ZERO, 26, font)
	meeting_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	meeting_title.add_theme_color_override("font_color", Color(1.0, 0.86, 0.52))
	box.add_child(meeting_title)
	meeting_time = _label("", Vector2.ZERO, 17, font)
	meeting_time.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	meeting_time.add_theme_color_override("font_color", Color(0.78, 0.86, 0.95))
	box.add_child(meeting_time)
	# 逃逸阀必须在标题正下方：讨论期同时显示投票区时，放在最底部会被挤出 720p。
	meeting_skip = _meeting_mk_button("跳过讨论", func() -> void: sim.skip_discussion())
	meeting_skip.custom_minimum_size = Vector2(360, 30)
	meeting_skip.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	box.add_child(meeting_skip)
	# 会议信息三行（2.5D #m-rows：报告地点 / 发起报告 / 伤者）
	meeting_info = _label("", Vector2.ZERO, 13, font)
	meeting_info.add_theme_color_override("font_color", Color(0.72, 0.80, 0.90))
	meeting_info.add_theme_constant_override("line_spacing", 2)
	box.add_child(meeting_info)

	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation", 12)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(body)
	var left := VBoxContainer.new()
	left.custom_minimum_size = Vector2(540, 0)
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_theme_constant_override("separation", 5)
	body.add_child(left)
	var right := VBoxContainer.new()
	right.custom_minimum_size = Vector2(420, 0)
	right.add_theme_constant_override("separation", 5)
	body.add_child(right)

	# ---- 左栏：发言流 → 新消息提示 → 一键模板 → 自由发言 ----
	left.add_child(_label("发言", Vector2.ZERO, 15, font))
	meeting_feed = RichTextLabel.new()
	meeting_feed.bbcode_enabled = true
	# 2.5D 2026-11-08：**不再无条件滚到底** —— 玩家往上翻读旧发言时只提示条数
	# （js/game.js:4954-4960）。自动跟底改由 _append_feed_new 按「是否在底部」决定。
	meeting_feed.scroll_following = false
	meeting_feed.custom_minimum_size = Vector2(540, 220)
	meeting_feed.add_theme_font_size_override("normal_font_size", 14)
	meeting_feed.add_theme_color_override("default_color", Color(0.78, 0.84, 0.92))
	# 发言区必须有深色底：会议遮罩是半透明的，纯文字直接压在三 D 场景上读不清
	# （2.5D 的 .say 也是深底面板）。
	var feed_bg := StyleBoxFlat.new()
	feed_bg.bg_color = Color(0.015, 0.025, 0.045, 0.92)
	feed_bg.border_color = Color(0.14, 0.18, 0.24, 1.0)
	feed_bg.set_border_width_all(1)
	feed_bg.set_content_margin_all(6)
	meeting_feed.add_theme_stylebox_override("normal", feed_bg)
	meeting_feed.get_v_scroll_bar().value_changed.connect(func(_v: float) -> void: _on_feed_scroll())
	left.add_child(meeting_feed)
	meeting_new_btn = _meeting_mk_button("↓ 0 条新发言", func() -> void: _jump_feed_bottom(), 13)
	meeting_new_btn.visible = false
	left.add_child(meeting_new_btn)

	meeting_tpl = VBoxContainer.new()
	meeting_tpl.add_theme_constant_override("separation", 5)
	left.add_child(meeting_tpl)
	var sel_row := HBoxContainer.new()
	sel_row.add_theme_constant_override("separation", 6)
	meeting_tpl.add_child(sel_row)
	meeting_tpl_target = OptionButton.new()
	meeting_tpl_target.custom_minimum_size = Vector2(210, 30)
	meeting_tpl_target.add_theme_font_size_override("font_size", 14)
	sel_row.add_child(meeting_tpl_target)
	meeting_tpl_room = OptionButton.new()
	meeting_tpl_room.custom_minimum_size = Vector2(210, 30)
	meeting_tpl_room.add_theme_font_size_override("font_size", 14)
	sel_row.add_child(meeting_tpl_room)
	meeting_tpl_when = OptionButton.new()
	meeting_tpl_when.custom_minimum_size = Vector2(110, 30)
	meeting_tpl_when.add_theme_font_size_override("font_size", 14)
	meeting_tpl_when.add_item("不指定时段")
	meeting_tpl_when.set_item_metadata(0, "")
	meeting_tpl_when.add_item("刚才")
	meeting_tpl_when.set_item_metadata(1, "recent")
	meeting_tpl_when.add_item("整晚")
	meeting_tpl_when.set_item_metadata(2, "night")
	sel_row.add_child(meeting_tpl_when)
	_build_room_options()
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 5)
	grid.add_theme_constant_override("v_separation", 5)
	meeting_tpl.add_child(grid)
	# 11 个一键模板（2.5D #m-tpl-btns 的 data-tpl，顺序逐条对齐 templates.js:298-307）
	# 六类直接证据是 parseSpeech 实际能认的 claim 清单；按钮/生成器/门测同源。
	for pair: Array in _meeting_template_defs():
		var kind := String(pair[0])
		var tb := _meeting_mk_button(String(pair[1]),
			func() -> void: _on_meeting_template(kind), 13)
		tb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(tb)

	var input_row := HBoxContainer.new()
	input_row.add_theme_constant_override("separation", 7)
	left.add_child(input_row)
	meeting_input = LineEdit.new()
	meeting_input.placeholder_text = "自由发言，回车发送"
	meeting_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	meeting_input.custom_minimum_size = Vector2(0, 34)
	meeting_input.add_theme_font_size_override("font_size", 14)
	meeting_input.text_submitted.connect(_on_player_say)
	input_row.add_child(meeting_input)
	meeting_send = Button.new()
	meeting_send.text = "发送"
	meeting_send.custom_minimum_size = Vector2(80, 34)
	meeting_send.add_theme_font_size_override("font_size", 14)
	meeting_send.pressed.connect(func() -> void: _on_player_say(meeting_input.text))
	input_row.add_child(meeting_send)

	# ---- 右栏：席位投票（讨论期即可投、可改）→ 跳过投票 → 结果 ----
	right.add_child(_label("投票", Vector2.ZERO, 15, font))
	var list_scroll := ScrollContainer.new()
	list_scroll.custom_minimum_size = Vector2(0, 300)
	list_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	list_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	right.add_child(list_scroll)
	meeting_list_scroll = list_scroll
	meeting_list = VBoxContainer.new()
	meeting_list.add_theme_constant_override("separation", 4)
	meeting_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list_scroll.add_child(meeting_list)
	meeting_skip_vote = _meeting_mk_button("跳过投票（结束剩余时间）",
		func() -> void: sim.skip_vote(), 13)
	right.add_child(meeting_skip_vote)
	meeting_result = _label("", Vector2.ZERO, 13, font)
	meeting_result.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	meeting_result.custom_minimum_size = Vector2(420, 0)
	meeting_result.add_theme_color_override("font_color", Color(0.72, 0.80, 0.90))
	right.add_child(meeting_result)

	meeting_hint = _label("", Vector2.ZERO, 14, font)
	meeting_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	meeting_hint.add_theme_color_override("font_color", Color(0.55, 0.62, 0.72))
	box.add_child(meeting_hint)


## 模板清单：按钮 / 生成器 / --speechtest 共用一份。顺序与 2.5D templates.js 一致，
## 六类直接证据全部来自 js/t2/decision.js#parseSpeech 的 claimKind 词表。
func _meeting_template_defs() -> Array:
	return [
		["accuse", "怀疑"], ["vote", "投他"], ["support", "作证"],
		["pipe", "看见钻管道"], ["red", "看见红光"], ["knife", "看见出刀"],
		["sabotage", "看见破坏设备"], ["bot", "看见机器人停摆"], ["breaker", "看见拉闸"],
		["where", "我在…"], ["deny", "不是我"],
	]


func _build_room_options() -> void:
	if meeting_tpl_room == null or sim == null:
		return
	meeting_tpl_room.clear()
	meeting_tpl_room.add_item("不指定舱室")
	meeting_tpl_room.set_item_metadata(0, "")
	for r: Dictionary in (sim.map.get("rooms", []) as Array):
		var rid := String(r.get("id", ""))
		var idx := meeting_tpl_room.item_count
		meeting_tpl_room.add_item(String(r.get("name", rid)))
		meeting_tpl_room.set_item_metadata(idx, rid)
	var cor := meeting_tpl_room.item_count
	meeting_tpl_room.add_item("走廊")
	meeting_tpl_room.set_item_metadata(cor, "corridor")


## 对象下拉：2.5D syncMeetTemplates（js/game.js:6837-6857）。
## 默认必须是「未选择」—— 手快点「怀疑」不能凭空指控 02。
func _build_tpl_targets() -> void:
	if meeting_tpl_target == null or sim == null:
		return
	meeting_tpl_target.clear()
	meeting_tpl_target.add_item("— 选择对象 —")
	meeting_tpl_target.set_item_metadata(0, -1)
	for a: Dictionary in sim.agents:
		var i := int(a.get("i", -1))
		if i == int(sim.me_idx) or not bool(a.get("alive", false)):
			continue
		var idx := meeting_tpl_target.item_count
		meeting_tpl_target.add_item("%02d %s" % [i + 1, String(a.get("name", "?"))])
		meeting_tpl_target.set_item_metadata(idx, i)
	meeting_tpl_target.select(0)


## 舱室 / 时段默认必须是「不指定」：2.5D syncMeetTemplates 2026-11-11 同口径。
## 旧写法默认填玩家当前舱室，「看见出刀」会悄悄生成"就在玩家现在这间"——
## 玩家没声称的地点被写进证词，AI 拆谎时就成了自己给自己挖的坑。
func _reset_tpl_room_and_when() -> void:
	if meeting_tpl_room != null and meeting_tpl_room.item_count > 0:
		meeting_tpl_room.select(0)
	if meeting_tpl_when != null and meeting_tpl_when.item_count > 0:
		meeting_tpl_when.select(0)


func _selected_tpl_target() -> int:
	if meeting_tpl_target == null or meeting_tpl_target.selected < 0:
		return -1
	var md: Variant = meeting_tpl_target.get_item_metadata(meeting_tpl_target.selected)
	return int(md) if md != null else -1


func _selected_tpl_room() -> String:
	if meeting_tpl_room == null or meeting_tpl_room.selected < 0:
		return ""
	var md: Variant = meeting_tpl_room.get_item_metadata(meeting_tpl_room.selected)
	return String(md) if md != null else ""


func _is_pipe_room(rid: String) -> bool:
	if rid == "":
		return false
	for p: Dictionary in (sim.map.get("pipes", []) as Array):
		if String(p.get("room", "")) == rid:
			return true
	return false


## 2.5D meetTemplateText（js/game.js:6830-6857）：生成一句一定能被 parseSpeech
## 识别的标准句。槽位/时间词/管道口限制逐条对齐；六类直接证据全部覆盖。
## `when` 只作用于口供类（where / deny）：recent=刚才，night=一整晚。
func _meet_template_text(kind: String, t: Dictionary, rid: String, when := "") -> String:
	var tag := ""
	if not t.is_empty():
		tag = "%02d %s" % [int(t.get("i", 0)) + 1, String(t.get("name", ""))]
	var rn := ""
	if rid == "corridor":
		rn = "走廊"
	elif rid != "":
		rn = sim.room_name(rid)
	var when_word: String = sim.speech._when_word() if sim.speech != null else "今晚"
	var lead := "我刚才在"
	if when == "night":
		lead = "我一整晚都在"
	elif when != "recent":
		lead = "我%s在" % when_word
	if kind == "where":
		return lead + (rn if rn != "" else "走廊") + "干活" \
			+ ("，手都没停过" if when == "night" else "")
	if kind == "deny":
		if rn == "":
			return "不是我"
		return "不是我，" + lead + rn + ("，哪儿也没去" if when == "night" else "")
	if t.is_empty():
		return ""
	match kind:
		"accuse":
			return "我怀疑%s，先说给大伙听" % tag
		"vote":
			return "这票我投%s" % tag
		"support":
			return "我可以为%s作证，他干的是正经事" % tag
		"pipe":
			var at := ("，就在%s" % rn) if (rn != "" and _is_pipe_room(rid)) else ""
			return "我亲眼看见%s 钻管道%s" % [tag, at]
		"red":
			return "我亲眼看见%s 身上有红光%s" % [tag, ("，就在%s" % rn) if rn != "" else ""]
		"knife":
			return "我亲眼看见%s 出刀%s" % [tag, ("，就在%s" % rn) if rn != "" else ""]
		"sabotage":
			return "我亲眼看见%s 破坏设备%s" % [tag, ("，就在%s" % rn) if rn != "" else ""]
		"bot":
			return "我亲眼看见%s 把机器人停摆%s" % [tag, ("，就在%s" % rn) if rn != "" else ""]
		"breaker":
			return "我亲眼看见%s 拉闸%s" % [tag, ("，就在%s" % rn) if rn != "" else ""]
	return ""


## 模板点击（2.5D js/game.js:10919-10937）：讨论期、非旁观、非幽灵；
## 「怀疑/投他/作证/六类亲眼」必须先选对象，空值不能变成 0 号。
## 只有口供类才回落到"我现在这间"；证据类留空 = 不声称地点。
func _on_meeting_template(kind: String) -> void:
	if sim == null or sim.speech == null or sim.meeting.is_empty():
		return
	if String(sim.meeting.get("phase", "")) != "discuss":
		return
	if not _meeting_can_act_now():
		return
	var need_t := kind != "where" and kind != "deny"
	var ti := _selected_tpl_target()
	if need_t and ti < 0:
		_toast("先选对象")
		return
	var rid := _selected_tpl_room()
	if rid == "" and (kind == "where" or kind == "deny"):
		var me: Dictionary = sim.me()
		if not me.is_empty():
			rid = sim.room_at(me.get("pos", Vector2.ZERO))
	if kind == "where" and rid == "":
		rid = "corridor"
	var when := _selected_tpl_when()
	var text := _meet_template_text(kind, sim.agent(ti), rid, when)
	if text != "":
		_on_player_say(text)


func _selected_tpl_when() -> String:
	if meeting_tpl_when == null or meeting_tpl_when.selected < 0:
		return ""
	var md: Variant = meeting_tpl_when.get_item_metadata(meeting_tpl_when.selected)
	return String(md) if md != null else ""


func _meeting_can_act_now() -> bool:
	if sim == null:
		return false
	var a: Dictionary = sim.me()
	return not a.is_empty() and bool(a.get("alive", true)) \
		and not bool(a.get("downed", false)) and not sim.spectator


func _feed_at_bottom() -> bool:
	if meeting_feed == null:
		return true
	var sb := meeting_feed.get_v_scroll_bar()
	return sb == null or sb.value + sb.page >= sb.max_value - 24.0


func _on_feed_scroll() -> void:
	if _feed_at_bottom() and _meeting_unread != 0:
		_meeting_unread = 0
		_update_new_btn()


func _update_new_btn() -> void:
	if meeting_new_btn == null:
		return
	meeting_new_btn.visible = _meeting_unread > 0
	meeting_new_btn.text = "↓ %d 条新发言" % _meeting_unread


func _jump_feed_bottom() -> void:
	if meeting_feed == null:
		return
	_meeting_unread = 0
	_update_new_btn()
	meeting_feed.scroll_to_line(maxi(0, meeting_feed.get_line_count() - 1))


## 发言流增量追加：只把「本场会议新产生的行」追加进去，保留玩家当前滚动位置；
## 不在底部时只累计条数（2.5D markNewLines，js/game.js:4964-4974）。
func _append_feed_new() -> void:
	if meeting_feed == null or sim == null or sim.speech == null:
		return
	if _meeting_feed_synced < _meeting_feed_start:
		_meeting_feed_synced = _meeting_feed_start
	var total: int = sim.speech.feed.size()
	if total <= _meeting_feed_synced:
		return
	var at_bottom := _feed_at_bottom()
	var added := 0
	for k in range(_meeting_feed_synced, total):
		var l: Dictionary = sim.speech.feed[k]
		var who := String(l.get("who", ""))
		var txt := String(l.get("text", ""))
		var col := "#8FA6C0"
		if bool(l.get("sys", false)):
			col = "#6B7686"
		elif bool(l.get("me", false)):
			col = "#F0C674"
		meeting_feed.append_text("[color=%s]%s：%s[/color]\n" % [col, who, txt])
		added += 1
	_meeting_feed_synced = total
	if at_bottom:
		_jump_feed_bottom()
	else:
		_meeting_unread += added
		_update_new_btn()


func _refresh_meeting_ui() -> void:
	if sim == null or (meeting_panel == null and sim.meeting.is_empty()):
		return
	var active: bool = not sim.meeting.is_empty()
	if not active:
		if _meeting_open:
			_meeting_open = false
			if meeting_panel != null:
				meeting_panel.visible = false
			_meeting_unread = 0
			if player != null:
				player.ui_locked = false
			# 鼠标模式由 `_refresh_mouse_mode()` 统一决定：不能在这里无条件 CAPTURED，
			# 否则玩家先按 Esc 释放的光标会在会议结束时被锁回去。
		return
	if not _meeting_open:
		_build_meeting_ui()
		_meeting_open = true
		meeting_panel.visible = true
		if player != null:
			player.ui_locked = true
		# 会议面板要能点按钮、能打字：鼠标必须释放，否则 CAPTURED 状态下点不到任何控件
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		_build_tpl_targets()
		_reset_tpl_room_and_when()
		_build_meeting_buttons()
		meeting_feed.clear()
		_meeting_feed_start = sim.speech.feed.size() if sim.speech != null else 0
		_meeting_feed_synced = _meeting_feed_start
		_meeting_unread = 0
		_update_new_btn()
		# 2.5D openMeeting 的只读系统行（js/game.js:6971）：幽灵与旁观者**照常看会议**，
		# 只是不能发言/投票。3D 原先直接隐藏整个面板，把复盘信息也一起藏了。
		if not _meeting_can_act_now() and sim.speech != null:
			var who := "旁观者" if sim.spectator else String(sim.me().get("name", "你"))
			var txt := "（旁观）只读观战，不参与讨论与投票。" if sim.spectator else "（幽灵）我在看着。"
			sim.speech.sys_say(who, txt)
		_append_feed_new()
	var phase := String(sim.meeting.get("phase", "vote"))
	var left := maxf(0.0, float(sim.meeting.get("t", 0.0)))
	var can_act := _meeting_can_act_now()
	var votes: Dictionary = sim.meeting.get("votes", {})
	# 可见性：跳过讨论 = 可行动者或旁观者（旁观只看能快进）；幽灵只能等计时器
	# （2.5D canSkip=canAct||spectMode，js/game.js:6951-6955）。
	meeting_skip.visible = phase == "discuss" and (can_act or sim.spectator)
	meeting_skip.text = "跳过讨论（旁观）" if sim.spectator else "跳过讨论"
	meeting_input.editable = can_act and phase == "discuss"
	meeting_send.disabled = not (can_act and phase == "discuss")
	if phase == "discuss":
		meeting_input.placeholder_text = ("自由发言，回车发送" if can_act else
			("旁观者只读" if sim.spectator else "幽灵只能旁观"))
	elif phase == "vote":
		meeting_input.placeholder_text = "投票中…"
	else:
		meeting_input.placeholder_text = "投票已结束"
	# 11 模板 + 对象/舱室/时段下拉只在「讨论期 + 可行动」显示（2.5D syncMeetTemplates）
	meeting_tpl.visible = phase == "discuss" and can_act
	# 投票区讨论期与投票期共用（2.5D renderVoteButtons，js/game.js:7413-7447）
	meeting_list.visible = can_act and (phase == "discuss" or phase == "vote")
	meeting_skip_vote.visible = can_act and phase == "vote"
	meeting_info.visible = int(sim.meeting.get("victim", -1)) >= 0
	meeting_info.text = _meeting_info_text() if meeting_info.visible else ""
	# 当前票目标金框高亮；弃权 = -1 单独一颗按钮。改票直接覆盖，close 前不锁定。
	var cur := int(votes.get(sim.me_idx, -2))
	for k: int in meeting_buttons.keys():
		var b: Button = meeting_buttons[k]
		var sb := b.get_theme_stylebox("normal") as StyleBoxFlat
		if sb != null:
			sb.border_color = Color(0.94, 0.78, 0.45) if k == cur else Color(0.20, 0.26, 0.34)
		b.disabled = not can_act or not (phase == "discuss" or phase == "vote")
	if meeting_abstain != null:
		var sb2 := meeting_abstain.get_theme_stylebox("normal") as StyleBoxFlat
		if sb2 != null:
			sb2.border_color = Color(0.94, 0.78, 0.45) if cur == -1 else Color(0.20, 0.26, 0.34)
		meeting_abstain.disabled = not can_act or not (phase == "discuss" or phase == "vote")
	var mkind := String(sim.meeting.get("kind", "night"))
	# 标题 / 计时 / 提示
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
	_append_feed_new()


## 席位标签（2.5D tagName，js/t2/decision.js:40-41）：补零席位号 + 空格 + 名字。
## 模板句、投票按钮与会议信息行共用同一个口径，避免「02」与「2号」混用。
func _tag_name(i: int) -> String:
	if i < 0:
		return "—"
	var a: Dictionary = sim.agent(i)
	if a.is_empty():
		return "—"
	return "%02d %s" % [i + 1, String(a.get("name", "?"))]


## 会议信息三行（2.5D #m-rows，js/ui/templates.js:315-319 / js/game.js:6944-6949）：
## 报告地点 / 发起报告 / 伤者（区分死者与濒死者）。只在有受害者的夜会显示。
func _meeting_info_text() -> String:
	if sim == null or sim.meeting.is_empty():
		return ""
	var victim_i := int(sim.meeting.get("victim", -1))
	if victim_i < 0:
		return ""
	var rid := String(sim.meeting.get("room", ""))
	var room_label := "未知位置"
	if rid != "":
		room_label = sim.room_name(rid)
	elif bool(sim.meeting.get("in_corr", false)):
		room_label = "走廊"
	var rep_i := int(sim.meeting.get("reporter", -1))
	var v: Dictionary = sim.agent(victim_i)
	var alive := bool(v.get("alive", false))
	return "报告地点：%s\n发起报告：%s\n伤者：%s · %s" % [
		room_label, _tag_name(rep_i), _tag_name(victim_i),
		"濒死者" if alive else "死者"]


func _on_player_say(text: String) -> void:
	if meeting_input != null:
		meeting_input.clear()
	if sim == null or sim.speech == null or sim.meeting.is_empty():
		return
	# 2.5D sendPlayerSpeech（js/game.js:6874-6882）：只有讨论期能发言；
	# 旁观直接返回，幽灵/濒死给提示。输入框禁用只是第一道闸，函数这里再守一次。
	if String(sim.meeting.get("phase", "")) != "discuss":
		return
	if sim.spectator:
		return
	var me: Dictionary = sim.me()
	if me.is_empty():
		return
	if not bool(me.get("alive", true)) or bool(me.get("downed", false)):
		_toast("你现在不能发言")
		return
	if text.strip_edges() == "":
		return
	sim.speech.player_say(text)
	_append_feed_new()


## 投票结果（2.5D renderTally，js/game.js:7719-7736）：**只公布聚合票数**，
## 逐人矩阵属结算页（2.5D #e-votes），会议里「过程不可见」。
func _meeting_result_text() -> String:
	var r: Dictionary = sim.meeting.get("result", {}) as Dictionary
	if r.is_empty():
		return ""
	var tally: Dictionary = r.get("votes", {}) as Dictionary
	var matrix: Dictionary = r.get("matrix", {}) as Dictionary
	var abstain := 0
	for k in matrix.keys():
		if int(matrix[k]) < 0:
			abstain += 1
	var rows: Array = []
	for k in tally.keys():
		rows.append([int(k), int(tally[k])])
	rows.sort_custom(func(x, y): return int(x[1]) > int(y[1]))
	var lines: Array = ["投票结果（过程不可见）"]
	for row: Array in rows:
		lines.append("%s  %d 票" % [_tag_name(int(row[0])), int(row[1])])
	lines.append("弃权  %d 票" % abstain)
	var top := int(r.get("ejected", -1))
	var mx := int(r.get("max", 0))
	var need := int(r.get("need", 4))
	if bool(r.get("devSaved", false)):
		lines.append("DEV 无敌：最高票 %d 指向你，驱逐无效" % mx)
	elif top >= 0:
		lines.append("驱逐 %s —— %d 票，唯一最高票且达到 %d 票门槛" % [
			_tag_name(top), mx, need])
		lines.append("身份：%s" % ("异形" if bool(r.get("alien", false)) else "人类"))
	elif mx < need:
		lines.append("最高票 %d 票，未达 %d 票门槛 ⇒ 无人出局" % [mx, need])
	else:
		lines.append("最高票 %d 票但有平票 ⇒ 无人出局" % mx)
	return "\n".join(lines)


func _build_meeting_buttons() -> void:
	if meeting_list == null:
		return
	for c in meeting_list.get_children():
		c.queue_free()
	meeting_buttons.clear()
	meeting_abstain = null
	if sim == null:
		return
	# 2.5D renderVoteButtons（js/game.js:7422-7446）：排除自己与死者；
	# 濒死者 alive=true 仍可被投 —— 3D 原先把他一起排除了。
	for a: Dictionary in sim.agents:
		if not bool(a.get("alive", false)):
			continue
		var i := int(a.get("i", -1))
		if i == int(sim.me_idx):
			continue
		var b := _meeting_mk_button("%02d %s" % [i + 1, String(a.get("name", "?"))],
			func() -> void: sim.cast_vote(int(sim.me_idx), i), 15)
		meeting_list.add_child(b)
		meeting_buttons[i] = b
	meeting_abstain = _meeting_mk_button("弃权",
		func() -> void: sim.cast_vote(int(sim.me_idx), -1), 15)
	meeting_list.add_child(meeting_abstain)


func _process(delta: float) -> void:
	if player == null:
		return
	# 开始页还开着：不推进模拟、不刷 HUD，画面停在开局那一帧。
	if not started:
		return
	if minimap != null:
		minimap.player_pos = Vector2(player.global_position.x, player.global_position.z)
		minimap.player_spectator = player.spectator
	if extras != null and sim != null:
		# 门的开合与扫描由 sim.tick → door_tick 决定（2.5D doorTick）；
		# 这里是**单向表现同步**，不许在场景层再算一套开合状态。
		extras.sync_doors(sim)
	_knife_cd = maxf(0.0, _knife_cd - delta)
	_shot_cd = maxf(0.0, _shot_cd - delta)
	_pipe_cd = maxf(0.0, _pipe_cd - delta)
	_tick_fx(delta)
	_tick_knife_view()
	_tick_detained()
	_tick_station(delta)
	if sim != null and not sim.agents.is_empty():
		_sync_player_pos()
		sim.tick(delta)
		_tick_player_state()
		# 白天会议开场（dawn）后必须把相机搬回会议室，否则玩家留在原地开会。
		_sync_day_meeting_teleport()
		_tick_darkness(delta)
		_tick_fault_marks()
		if crew_view != null:
			crew_view.sync(sim, delta)
		_sync_bots()
		_audio_tick(delta)
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
	_poll_dev_log()
	if sim != null and (bool(sim.dev) or bool(sim.spectator)):
		_dev_timer -= delta
		if _dev_timer <= 0.0:
			_dev_timer = 0.5
			_refresh_dev_panel()
	_update_spectator_view()
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
	# 结算 / 阵亡面板上有「查看复盘」按钮：光标必须能点，不能锁在窗口里。
	if sim != null and (sim.over or _player_dead):
		return true
	return false


func _refresh_mouse_mode() -> void:
	if player == null or not started:
		return
	if _screenshot_mode:
		if Input.mouse_mode != Input.MOUSE_MODE_VISIBLE:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		return
	var want := Input.MOUSE_MODE_VISIBLE if (mouse_released or _want_mouse_visible()) else Input.MOUSE_MODE_CAPTURED
	if Input.mouse_mode != want:
		Input.mouse_mode = want


func _update_interaction(_delta: float) -> void:
	if sim != null and not sim.meeting.is_empty():
		prompt_label.text = ""
		_e_down = Input.is_physical_key_pressed(KEY_E)
		_keys_down.clear()
		return
	if _pipe_open or (mg_layer != null and mg_layer.is_open()) or (wheel != null and wheel.is_open()):
		prompt_label.text = ""
		_e_down = Input.is_physical_key_pressed(KEY_E)
		_keys_down.clear()
		return
	var e_now := Input.is_physical_key_pressed(KEY_E)
	var pressed := e_now and not _e_down
	_e_down = e_now
	var offers := _collect_offers()
	if offers.is_empty():
		prompt_label.text = "" if station.is_empty() else "站桩中 · %s（移动即中断）" % String(station.get("label", ""))
		# 2.5D 的用户裁定「点错要有反馈」同样适用于按键：没有可交互项时按 E
		# 不能毫无反应，否则玩家会以为是"交互坏了"（2026-11-10 现场）。
		if pressed and station.is_empty():
			_probe("E · 交互项 0")
			_toast(_no_offer_hint())
		_keys_down.clear()
		return
	_near = offers[0].get("dev", null)
	if station.is_empty():
		# 键位拆分后的提示：每项前面写它自己的键，E 只做兜底 / 轮盘。
		var parts: Array = []
		var shown := mini(offers.size(), 4)
		for i in shown:
			parts.append("[%s] %s" % [_offer_key(String(offers[i].get("id", ""))),
				String(offers[i].get("label", ""))])
		var line := " · ".join(PackedStringArray(parts))
		if offers.size() > shown:
			line += " · 共 %d 项（E 展开）" % offers.size()
		prompt_label.text = line
	# 每帧都把全部拆分键的边沿更新一遍，避免"只读了命中的那个键"导致下一帧假触发。
	var edges: Dictionary = {}
	for kk: String in _OFFER_KEY_KEYS:
		edges[kk] = _key_edge(kk)
	var digits: Array = []
	for ni in 9:
		digits.append(_num_edge(ni))
	var picked: Dictionary = {}
	# 1) 专用键：F 设施/任务、R 报告、G 拖拽、Q 管道、V 电闸、B 破坏、C 监控
	for kk2: String in _OFFER_KEY_KEYS:
		if not bool(edges[kk2]):
			continue
		picked = _offer_by_key(offers, kk2)
		if picked.is_empty():
			_toast("附近没有 [%s] 对应的操作" % kk2)
		break
	# 2) 数字 1-9 直选（与轮盘里的编号一致）
	if picked.is_empty():
		for ni2 in 9:
			if bool(digits[ni2]) and ni2 < offers.size():
				picked = offers[ni2]
				break
	# 3) E：唯一项直接执行，多项展开轮盘（兜底，避免功能丢失）
	if picked.is_empty() and pressed:
		if offers.size() == 1:
			picked = offers[0]
		else:
			_probe("E → 轮盘 %d 项" % offers.size())
			player.ui_locked = true
			wheel.open(offers,
				func(it: Dictionary) -> void:
					player.ui_locked = false
					_probe("轮盘 → " + String(it.get("label", "")))
					(it["act"] as Callable).call(),
				func() -> void:
					player.ui_locked = false
					_probe("轮盘 → 取消"))
			return
	if not picked.is_empty():
		_probe("交互 → [%s] %s" % [_offer_key(String(picked.get("id", ""))),
			String(picked.get("label", ""))])
		(picked["act"] as Callable).call()


## 键位拆分真源：一个交互项只认一个专用键，E 只兜底。
## 2.5D 的现实是「交互不多但全塞在 E 上」，3D 按距离手边最近的语义拆开。
const _OFFER_KEY_KEYS := ["F", "R", "G", "Q", "V", "B", "C"]


func _offer_key(id: String) -> String:
	if id.begins_with("task-") or id.begins_with("fix-"):
		return "F"
	if id.begins_with("report"):
		return "R"
	if id.begins_with("drag"):
		return "G"
	if id.begins_with("pipe-"):
		return "Q"
	if id.begins_with("breaker"):
		return "V"
	if id.begins_with("sabotage"):
		return "B"
	if id.begins_with("cams"):
		return "C"
	if id.begins_with("attack"):
		return "左键"
	return "E"


func _offer_by_key(offers: Array, key: String) -> Dictionary:
	for o: Dictionary in offers:
		if _offer_key(String(o.get("id", ""))) == key:
			return o
	return {}


func _key_edge(k: String) -> bool:
	var code := 0
	match k:
		"F": code = KEY_F
		"R": code = KEY_R
		"G": code = KEY_G
		"Q": code = KEY_Q
		"V": code = KEY_V
		"B": code = KEY_B
		"C": code = KEY_C
		_:
			return false
	var now := Input.is_physical_key_pressed(code)
	var was := bool(_keys_down.get(k, false))
	_keys_down[k] = now
	return now and not was


func _num_edge(n: int) -> bool:
	var key := "N%d" % n
	var now := Input.is_physical_key_pressed(KEY_1 + n)
	var was := bool(_keys_down.get(key, false))
	_keys_down[key] = now
	return now and not was


## 按 E 却没有任何交互项时的具体解释。2.5D 也要求「点错要有反馈」；
## 这里优先回答「旁边有人为什么打不倒」，而不是一律说“附近没有可交互的东西”。
func _no_offer_hint() -> String:
	if sim == null or sim.agents.is_empty():
		return "附近没有可交互的东西 —— 走近设备 / 尸体 / 电闸 / 圆桌再按 E"
	var me: Dictionary = sim.me()
	if not bool(me.get("alien", false)):
		return "人类没有刀 —— 右键开枪（子弹在军械库领）；F 做任务 / R 报告 / G 拖拽 / E 其它交互"
	var reach := SpaceData.num(space, "reach", "knife")
	var me_pos: Vector2 = me.get("pos", Vector2.ZERO)
	# 刀程内有人却没有交互项：只可能是墙/掩体挡住了（2.5D stab() 的 losNow）。
	var in_reach := _nearest_living_agent(reach)
	if not in_reach.is_empty():
		if int(me.get("knife", 0)) < 1:
			return "本夜的刀已用完（每夜 1 把，天亮补）"
		return "中间有墙 / 掩体挡着，刀够不到"
	var p := _nearest_living_agent(reach + 1.6)
	if p.is_empty():
		return "附近没有可交互的东西 —— 走近设备 / 尸体 / 电闸 / 圆桌再按 E"
	var p_pos: Vector2 = p.get("pos", Vector2.ZERO)
	var d := me_pos.distance_to(p_pos)
	if int(me.get("knife", 0)) < 1:
		return "本夜的刀已用完（每夜 1 把，天亮补）"
	return "再靠近一点（刀程 %.1f 米，当前 %.1f 米）" % [reach, d]


## 2.5D stab()（js/game.js:8243-8248）：刀程内最近、且 losNow 有视线的活人。
## 这是 E 的选人口径；左键仍走准星（输入映射差异）。
func _nearest_knife_target() -> Dictionary:
	if sim == null or sim.agents.is_empty():
		return {}
	var me: Dictionary = sim.me()
	var p: Vector2 = me.get("pos", Vector2.ZERO)
	var reach := SpaceData.num(space, "reach", "knife")
	var best: Dictionary = {}
	var best_d := reach
	for a: Dictionary in sim.agents:
		if int(a.get("i", -1)) == int(sim.me_idx):
			continue
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
				or bool(a.get("detained", false)):
			continue
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		var d := p.distance_to(ap)
		if d > best_d:
			continue
		if not sim.los_now(p.x, p.y, ap.x, ap.y):
			continue
		best_d = d
		best = a
	return best


## 最近的活人（不含自己、濒死、被擒、出局）；只用于提示，不参与命中判定。
func _nearest_living_agent(max_d: float) -> Dictionary:
	if sim == null or sim.agents.is_empty():
		return {}
	var p: Vector2 = sim.me().get("pos", Vector2.ZERO)
	var best: Dictionary = {}
	var best_d := max_d
	for a: Dictionary in sim.agents:
		if int(a.get("i", -1)) == int(sim.me_idx):
			continue
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
				or bool(a.get("detained", false)):
			continue
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		var d := p.distance_to(ap)
		if d < best_d:
			best_d = d
			best = a
	return best


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
	## 3D 输入映射（允许的差异）：2.5D 出刀是 A 键（js/game.js:7986），3D 映射到左键；
	## E 轮盘也列同一个动作，避免「旁边有人、按 E 却像什么都没发生」。
	## 只调用同一个 _player_knife（reach.knife / sim.knife 全不变），不新增规则。
	if sim != null and not sim.agents.is_empty() and not bool(sim.spectator):
		var me_a: Dictionary = sim.me()
		if bool(me_a.get("alien", false)) and bool(me_a.get("alive", true)) \
				and not bool(me_a.get("downed", false)) \
				and not bool(me_a.get("detained", false)):
			var atk_tgt := _nearest_knife_target()
			if not atk_tgt.is_empty():
				var atk_name := String(atk_tgt.get("name", "?"))
				var has_knife := int(me_a.get("knife", 0)) > 0
				out.append({
					"id": "attack",
					"label": ("出刀 · " + atk_name) if has_knife \
						else ("出刀（本夜刀已用完） · " + atk_name),
					"hint": ("左键同效 · 剩余刀 %d" % int(me_a.get("knife", 0))) if has_knife \
						else "天亮补 1 把",
					"accent": Color("#FF9E96"),
					"act": func() -> void: _player_knife(me_a, atk_tgt),
				})
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
				if int(dead2.get("i", -1)) == int(sim.me_idx):
					continue
				# 2.5D bodyPos()：濒死（还活着）用本人坐标，死亡用固定尸体坐标 —— 两种都能拖。
				var is_downed: bool = bool(dead2.get("alive", false)) \
					and bool(dead2.get("downed", false))
				if not is_downed:
					if bool(dead2.get("alive", false)) or bool(dead2.get("bodyGone", false)) \
							or bool(dead2.get("bodyReported", false)):
						continue
				var bp2: Vector2 = dead2.get("pos", Vector2.ZERO) if is_downed \
					else dead2.get("bodyPos", Vector2.ZERO)
				if bp2.distance_to(Vector2(pos.x, pos.z)) > SpaceData.num(space, "reach", "body"):
					continue
				var body_i2 := int(dead2.get("i", -1))
				out.append({
					"id": "drag-%d" % body_i2,
					"label": ("拖走伤员 · " if is_downed else "拖走尸体 · ") \
						+ String(dead2.get("name", "?")),
					"hint": ("拖进医疗间可救活 · 移动变慢" if is_downed else "移动变慢 · 再按 G 放下"),
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

	# 停摆机器人（2.5D sabotage()：贴身 1.8 格、每夜一次、不耗刀/弹）
	if sim != null and not sim.agents.is_empty():
		var sab_me: Dictionary = sim.me()
		if bool(sab_me.get("alien", false)) and bool(sab_me.get("alive", true)) \
				and not bool(sab_me.get("downed", false)) \
				and not bool(sab_me.get("detained", false)) \
				and not bool(sab_me.get("sabUsed", false)):
			for bkind3: String in ["secbot", "medbot"]:
				if int(sim.bot_hp.get(bkind3, 0)) <= 0:
					continue
				var bp3: Vector2 = sim.bot_pos_of(bkind3)
				if bp3 == Vector2.ZERO:
					continue
				if bp3.distance_to(Vector2(pos.x, pos.z)) > SpaceData.num(space, "reach", "sabotage"):
					continue
				var bname3 := "保安机器人" if bkind3 == "secbot" else "医疗无人机"
				for f3: Dictionary in (map_data.get("facility", []) as Array):
					if String(f3.get("kind", "")) == bkind3:
						bname3 = String(f3.get("label", bname3))
						break
				var bk4 := bkind3
				out.append({
					"id": "sabotagebot-" + bkind3,
					"label": "停摆 · " + bname3,
					"hint": "每夜一次 · 不耗刀 · 之后不能再破坏舱室",
					"accent": Color("#FFB3AC"),
					"act": func() -> void: _on_sabotage_bot(bk4),
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
				# 2.5D 2026-11-10 改成**交互即领**（grantQual，无站桩、无小游戏），
				# STAND.qual 已归 0；这里跟着走，dur<=0 时直接结算不站桩。
				"hint": "交互即领 · 待领 %d" % qual_pending
					if SpaceData.num(space, "stand", "qual") <= 0.0
					else "站桩 %.0fs · 待领 %d" % [SpaceData.num(space, "stand", "qual"), qual_pending],
				"accent": Color("#FFE8B0"),
				"act": func() -> void: _claim_qual_now(),
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
			"hint": "%d 路在线 · C / ESC 退出" % (map_data.get("rooms", []) as Array).size(),
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
	# 2.5D 幽灵口径：不能修故障 / 报告 / 搜尸 / 拖尸 / 破坏 / 领补给，只能做自己的剩余任务。
	if sim != null and not sim.agents.is_empty() and bool(sim.me().get("ghost", false)):
		var ghost_out: Array = []
		for o2: Dictionary in out:
			var oid := String(o2.get("id", ""))
			if oid.begins_with("task-"):
				ghost_out.append(o2)
		out = ghost_out
	return out


func _on_revive_done(body_i: int) -> void:
	if sim != null and sim.player_revive(body_i):
		_toast("施救成功 · 剩余医疗包 %d" % int(sim.me().get("medkit", 0)))
	else:
		_toast("施救失败（医疗包不足 / 目标已不在濒死状态）")


func _on_sabotage_bot(kind: String) -> void:
	if sim != null and sim.sabotage_bot(kind, int(sim.me_idx)):
		_toast("已停摆 %s（本夜破坏额度已用）" % ("保安机器人" if kind == "secbot" else "医疗无人机"))
	else:
		_toast("停摆失败（今晚已用过 / 距离太远 / 已停摆 / 不是异形）")


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
	var kb := int(b.get("killedBy", -1))
	var killer_text := "无法判断"
	if bool(sim.dev) and kb >= 0 and kb != int(b.get("i", -1)):
		killer_text = _tag_name(kb) + "（DEV 全知）"
	var lines: Array = [
		"状态：" + ("濒死 · 还有呼吸，拖进医疗间可由机器人救活" if alive else "已死亡"),
		"发现地点：" + sim.room_name(sim.room_at(bp)),
		"检查：" + ("已检查 · 伤口与拖拽痕迹完整" if bool(b.get("searched", false)) else "未检查"),
		"凶手：" + killer_text,
		"随身物资：弹 %d / 包 %d / 单 %d" % [int(b.get("bullet", 0)),
			int(b.get("medkit", 0)), int(b.get("qual", 0))],
		"第 %d 夜 · 剩余 %.0fs" % [int(sim.night), maxf(0.0, float(sim.t))],
	]
	_open_info(("伤情记录 · " if alive else "尸检记录 · ") + String(b.get("name", "?")), lines)


## 2.5D openCams：路数、断电中断、夜次与剩余时间；不暴露异形身份。
func _open_cams() -> void:
	if sim == null:
		return
	# 2.5D openCams()：`if(!G||G.over||G.meet||G.inspect||G.pipePick...)return`
	if sim.over or not sim.meeting.is_empty():
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
	## 时长口径照 2.5D breakerPullTime：断电 → 合闸时间（修好电路 3s / 否则 4.5s）；
	## 供电 → min(off_max, off_step × 本夜第 n 次)。计数只在 sim 里。
	var dur: float
	var label: String
	if power_on:
		dur = sim.breaker_pull_time() if sim != null else minf(
			SpaceData.num(space, "breaker", "off_max"),
			SpaceData.num(space, "breaker", "off_step"))
		label = "拉闸断电"
	else:
		dur = sim.breaker_on_time() if sim != null else \
			SpaceData.num(space, "breaker", "on_default")
		label = "合闸复电"
	return {
		"id": "breaker", "label": label,
		"hint": "站桩 %.1fs · 当前%s" % [dur, "断电" if not power_on else
			("全亮（配电已修）" if sim != null and int(sim.light_state) == 1 else "照明")],
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
	set_power(not power_on)


## 领申请单：2.5D 2026-11-10 起是**交互即领**（`grantQual`，无站桩、无小游戏）。
## 只有旧数据（`stand.qual > 0`）才退回站桩，避免把老地图卡住。
func _claim_qual_now() -> void:
	var dur := SpaceData.num(space, "stand", "qual")
	if dur > 0.0:
		_start_station("领取物资申请单", dur, _on_claim_done)
		return
	_on_claim_done()


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
	if sim == null:
		return
	var carried: Dictionary = sim.agent(int(sim.me().get("drag", -1)))
	var was_downed := bool(carried.get("downed", false))
	if sim.release_drag(int(sim.me_idx)):
		if not was_downed:
			_toast("已放下尸体")
		elif bool(carried.get("downed", false)):
			_toast("已放下伤员（还在濒死 —— 拖进医疗间才能救活）")
		else:
			_toast("伤员已送进医疗间 · 已被救起")


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
	# 不直接 CAPTURED：用户可能按过 Esc 释放鼠标，交给统一口径判断。
	_refresh_mouse_mode()


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
## 三态的唯一真源在 sim（light_state）；这里只把场景与 HUD 跟上。
func set_power(on: bool) -> void:
	if sim != null:
		if (int(sim.light_state) != 2) != on:
			sim.toggle_power(int(sim.me_idx))
		apply_light_state(int(sim.light_state))
	else:
		apply_light_state(0 if on else 2)


func apply_light_state(st: int) -> void:
	power_on = st != 2
	if builder != null:
		builder.set_light_state(st)
	if extras != null:
		extras.set_power(power_on)
	_refresh_power_hud()
	# 2.5D 的 toast 分三态：常态 / 电路修好全亮 / 拉闸断电。
	if st == 2:
		_toast("已拉闸 · 全船断电（本夜第 %d 次）" % int(sim.breaker_pulls)
			if sim != null else "已拉闸 · 全船断电")
	elif st == 1:
		_toast("已合闸 · 配电已修复 · 全船照明恢复")
	else:
		_toast("已合闸 · 全船恢复照明")


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
		_probe("左键 · 出刀请求")
		_player_knife(me)
	elif btn == MOUSE_BUTTON_RIGHT:
		_probe("右键 · 开枪请求")
		_player_fire(me)


func _player_knife(me: Dictionary, forced: Dictionary = {}) -> void:
	if role != "alien" and not bool(me.get("alien", false)):
		_probe("出刀 × 人类没有刀")
		_toast("人类没有刀 —— 右键开枪，子弹在军械库换")
		return
	if _knife_cd > 0.0:
		_probe("出刀 × 冷却 %.1fs" % _knife_cd)
		_toast("出刀冷却中（%.1fs）" % _knife_cd)
		return
	# 没刀了要明说：2.5D 是每夜 1 把（点击没反应最容易被当成「不能出手」）
	if int(me.get("knife", 0)) < 1:
		_probe("出刀 × 本夜刀已用完")
		_toast("本夜的刀已用完（每夜 1 把，天亮补）")
		return
	# 刀数校验通过就先把手上动作播出去：挥空也要有动作，
	# 否则玩家从自己视角看就是「按了左键什么也没发生」（2026-11-11 反馈）。
	if player != null:
		player.play_knife_swing()
	# E 轮盘带的是「2.5D stab() 的最近目标」；左键没带目标才走准星。
	# 2.5D stab()：射程内取**最近**且 losNow 的活人，没有任何准星锥。
	# 3D 之前用相机点积 0.55 当额外门槛，贴脸（<0.4m）时垂直分量把点积压下去，
	# 就是「明明在脸上却刀不到」的根因 —— 这条限制是 3D 自加的，删掉。
	var tgt: Dictionary = forced
	if tgt.is_empty():
		tgt = _nearest_knife_target()
	if tgt.is_empty():
		_probe("出刀 × 刀程内没有目标")
		_toast("刀锋够不到 —— 再靠近、把人对准屏幕中央")
		_knife_hit_fx(false)
		return
	# 轮盘可能停留了几秒：目标已经倒下/出局就不要再补刀（2.5D stab 也排除 downed）。
	if not bool(tgt.get("alive", false)) or bool(tgt.get("downed", false)) \
			or bool(tgt.get("detained", false)):
		_probe("出刀 × 目标已倒下/出局")
		_toast("目标已经不在了")
		return
	# 2.5D stab() 的 losNow 同源：墙/掩体挡着就不出刀（3D sim.knife 不自己查）。
	var me_pos: Vector2 = me.get("pos", Vector2.ZERO)
	var tgt_pos: Vector2 = tgt.get("pos", Vector2.ZERO)
	if me_pos.distance_to(tgt_pos) > SpaceData.num(space, "reach", "knife"):
		_probe("出刀 × 目标已离开刀程")
		_toast("目标离开了刀程 —— 再靠近")
		_knife_hit_fx(false)
		return
	if not sim.los_now(me_pos.x, me_pos.y, tgt_pos.x, tgt_pos.y):
		_probe("出刀 × 中间有墙/掩体")
		_toast("中间有墙 / 掩体挡着，刀够不到")
		_knife_hit_fx(false)
		return
	if not sim.knife(int(sim.me_idx), int(tgt.get("i", -1))):
		_probe("出刀 × 结算拒绝（目标已倒下 / 刀数不足）")
		_toast("出刀没有生效（目标已倒下 / 刀数不足）")
		_knife_hit_fx(false)
		return
	_knife_cd = 1.2
	_probe("出刀 → %s · 濒死 · 剩余刀 %d" % [String(tgt.get("name", "")),
		int(me.get("knife", 0))])
	_toast("出刀 · " + String(tgt.get("name", "")) + " 濒死")
	# 血花由事件层统一生成（AI 出刀 / 自己出刀同一条路径），这里不做第二次。
	_knife_hit_fx(true)


func _player_fire(me: Dictionary) -> void:
	if int(me.get("bullet", 0)) <= 0:
		_probe("开枪 × 没有子弹")
		_toast("没有子弹 —— 去军械库领（圆桌领申请单 → 军械补给点）")
		return
	if _shot_cd > 0.0:
		_probe("开枪 × 冷却 %.1fs" % _shot_cd)
		_toast("开枪冷却中（%.1fs）" % _shot_cd)
		return
	# 2.5D shoot()：射程内取最近、losNow、且 visibleAt 的目标 —— 同样是「最近」，
	# 不是准星锥。3D 之前的 dot>0.90 让贴脸目标（垂直分量）打不中。
	var tgt := _nearest_shot_target(SpaceData.num(space, "shoot", "range"))
	if tgt.is_empty():
		_probe("开枪 × 射程内没有对准的目标")
		_toast("射程内没有对准的目标")
		return
	if not sim.shoot(int(sim.me_idx), int(tgt.get("i", -1))):
		_probe("开枪 × 结算拒绝（视线被挡 / 目标已倒下）")
		_toast("这一枪没打中（视线被挡住或目标已倒下）")
		return
	_shot_cd = 0.8
	_probe("开枪 → %s · 濒死 · 剩余弹 %d" % [String(tgt.get("name", "")),
		int(me.get("bullet", 0))])
	_toast("开枪击中 " + String(tgt.get("name", "")))


## 2.5D shoot() 的目标选择：射程内最近、无遮挡、且「看得见」的活人。
## visibleAt 与 aiCanSee 同源（observerVisionAt），所以这里复用 sim.ai_can_see。
func _nearest_shot_target(max_d: float) -> Dictionary:
	if sim == null or sim.agents.is_empty():
		return {}
	var me: Dictionary = sim.me()
	var p: Vector2 = me.get("pos", Vector2.ZERO)
	var best: Dictionary = {}
	var best_d := max_d
	for a: Dictionary in sim.agents:
		if int(a.get("i", -1)) == int(sim.me_idx):
			continue
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		var d := p.distance_to(ap)
		if d >= best_d:
			continue
		if not sim.los_now(p.x, p.y, ap.x, ap.y):
			continue
		if not sim.ai_can_see(me, ap):
			continue
		best_d = d
		best = a
	return best


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
		var e: Dictionary = evs[i]
		var kind := String(e.get("kind", ""))
		var pos := _event_pos(e)
		match kind:
			"knife":
				# 2.5D knife(): 刀风 + 血肉 + 受害者喊叫，各响一次。
				audio.play_at("knife", pos, 0.95)
				audio.play_at("flesh", pos, 0.34)
				audio.play_at("scream", pos, 0.85)
				# 击倒特效：受害者位置溅一次血。走事件而不是出刀函数，
				# 这样 AI 互杀、玩家出刀、E 轮盘出刀都只有一条实现。
				var vi := int(e.get("victim", -1))
				if vi >= 0 and sim != null:
					var va: Dictionary = sim.agent(vi)
					if not va.is_empty():
						var vp: Vector2 = va.get("pos", Vector2.ZERO)
						_spawn_blood(Vector3(vp.x, 1.0, vp.y))
			"shoot":
				audio.play_at("shoot", pos, 0.95)
				audio.play_at("flesh", pos, 0.50)
				audio.play_at("scream", pos, 0.85)
			"kill":
				audio.play_at("kill", pos, 0.80)
			"revive":
				audio.play_at("revive", pos, 0.90)
			"fix", "task", "qual", "supply":
				audio.play_at("fix", pos, 0.85)
			"sabotage":
				audio.play_at("sabotage", pos, 0.85)
			"report", "meeting":
				audio.play("report", 0.75)
			"vote":
				audio.play("vote", 0.55)
			"vote_change":
				audio.play("vote_change", 0.55)
			"eject":
				audio.play("eject", 0.90)
			"drag_start", "drag_end":
				audio.play_at(kind, pos, 0.70)
			"search":
				audio.play_at("search", pos, 0.60)
			"bot_hit":
				audio.play_at("bot_hit", pos, 0.80)
			"bot_down":
				audio.play_at("bot_down", pos, 0.90)
				audio.play("detain", 0.55)
			"breaker":
				audio.play_at("breaker", pos, 0.80)
				audio.play_at("bot_hit", pos, 0.55)
			"pipe":
				audio.play_at("pipe", pos, 0.50)
			"detain":
				audio.play("detain", 0.75)
			"chat":
				audio.play("chat", 0.60)
			"game_end":
				audio.play("win" if bool(e.get("win", false)) else "lose", 0.90)
			_:
				audio.play(kind)
	_last_event_n = evs.size()


## 2.5D volAt 的听者：玩家位置；事件没有 x/y 时按 victim/actor 当前位置回退。
func _event_pos(e: Dictionary) -> Vector2:
	if sim == null:
		return Vector2(player.global_position.x, player.global_position.z)
	var xv: Variant = e.get("x", null)
	var yv: Variant = e.get("y", null)
	if (xv is float or xv is int) and (yv is float or yv is int):
		return Vector2(float(xv), float(yv))
	var vi: Variant = e.get("victim", null)
	if vi is int and int(vi) >= 0:
		var v: Dictionary = sim.agent(int(vi))
		if not v.is_empty():
			var p: Variant = v.get("bodyPos", null)
			if p is Vector2:
				var bpv: Vector2 = p
				if bpv != Vector2.ZERO:
					return bpv
			p = v.get("pos", null)
			if p is Vector2:
				var ppv: Vector2 = p
				return ppv
	var ai: Variant = e.get("actor", null)
	if ai is int and int(ai) >= 0:
		var a: Dictionary = sim.agent(int(ai))
		if not a.is_empty():
			var p2: Variant = a.get("pos", null)
			if p2 is Vector2:
				return p2
	return Vector2(player.global_position.x, player.global_position.z)


## 2.5D SND.step（所有近处移动的人）与玩家做任务时的 SND.work。
func _audio_tick(delta: float) -> void:
	if audio == null or player == null:
		return
	var me_pos := Vector2(player.global_position.x, player.global_position.z)
	audio.set_listener(me_pos)
	if sim == null or not sim.meeting.is_empty() or sim.over:
		return
	_step_cd -= delta
	if _step_cd <= 0.0:
		_step_cd = 0.36
		if player.velocity.length() > 0.5:
			audio.play_at("step", me_pos, 0.42)
		for a: Dictionary in sim.agents:
			if int(a.get("i", -1)) == int(sim.me_idx):
				continue
			if not bool(a.get("alive", false)) or bool(a.get("downed", false)) 					or bool(a.get("detained", false)) or not bool(a.get("moving", false)):
				continue
			var ap: Vector2 = a.get("pos", Vector2.ZERO)
			if ap.distance_to(me_pos) < 8.0:
				audio.play_at("step", ap, 0.60)
	_work_cd -= delta
	if _work_cd <= 0.0:
		_work_cd = 0.9
		if not station.is_empty() or (mg_layer != null and mg_layer.is_open()):
			audio.play_at("work", me_pos, 0.55)


func _on_door_auto(pos: Vector3) -> void:
	if audio != null:
		audio.play_at("door", Vector2(pos.x, pos.z), 0.65)

## 2.5D dawn()：白天会议先把全员刷到 bridge 再开会（js/game.js:4513-4526）。
## sim 侧已改 pos，这里把玩家节点同步过去；夜里的远程会议不搬人（只清路径）。
func _sync_day_meeting_teleport() -> void:
	if sim == null or player == null:
		return
	var seq := int(sim.meet_seq)
	if seq == _last_meet_seq:
		return
	_last_meet_seq = seq
	if sim.meeting.is_empty():
		return
	if String(sim.meeting.get("kind", "")) != SimStateScript.MEET_DAY:
		return
	var me: Dictionary = sim.me()
	if me.is_empty() or not bool(me.get("alive", true)):
		return
	var p: Vector2 = me.get("pos", Vector2.ZERO)
	player.global_position = Vector3(p.x, 0.05, p.y)
	var c: Vector2 = sim.room_center("bridge")
	var d: Vector2 = c - p
	if d.length() > 0.15:
		# Node3D 前方是 -Z：yaw = atan2(-dx, -dz)
		player.rotation.y = atan2(-d.x, -d.y)
	me["aimAng"] = atan2(c.y - p.y, c.x - p.x)
	_probe("白天会议 · 全员回会议室 (%0.1f, %0.1f)" % [p.x, p.y])


func _sync_player_pos() -> void:
	if player == null:
		return
	var me: Dictionary = sim.me()
	if me.is_empty() or not bool(me.get("alive", true)):
		return
	if bool(me.get("downed", false)):
		# 濒死：本人不能走，但会被别人拖 —— 镜头必须跟着 sim 里的身体位置，
		# 否则「被拖进医疗间」在玩家视角是完全看不出来的。
		var bp: Vector2 = me.get("pos", Vector2.ZERO)
		player.global_position = Vector3(bp.x, player.global_position.y, bp.y)
		return
	if bool(me.get("detained", false)) or not sim.meeting.is_empty():
		return
	me["pos"] = Vector2(player.global_position.x, player.global_position.z)
	## 2.5D agentAimAng 对玩家取鼠标朝向（js/game.js:1805）；3D 由 view 层把朝向
	## 写进 sim 作为 intent，sim 自己不读鼠标（3d/ARCHITECTURE.md §3 硬规则 1）。
	var aim_fwd := -player.global_transform.basis.z
	me["aimAng"] = atan2(aim_fwd.z, aim_fwd.x)


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
	## 小游戏卡片开着也算锁输入：2.5D 里 #mg 遮罩把 attention 归零、点击地面失效；
	## 3D 若不算这一项，_tick_detained 每帧会把它重新写回 false，
	## 玩家就能一边解题一边用 WASD 走开（卡片挡着画面）。
	var ui_open: bool = _pipe_open or (mg_layer != null and bool(mg_layer.is_open()))
	player.ui_locked = held or bool(me.get("downed", false)) \
		or (not sim.meeting.is_empty()) or ui_open
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
	# 2.5D 报告稀缺资源：个人额度 + 每夜夜会上限，HUD 常驻。
	var meet_cfg: Dictionary = (sim.cfg.get("rules", {}) as Dictionary).get("MEET", {}) as Dictionary
	report_label.text = "报告 %d · 夜会 %d/%d" % [
		int(a.get("reportLeft", 0)), int(sim.night_meets),
		int(meet_cfg.get("perNight", 2))]
	var role_text := "旁观 · 全知视角" if bool(sim.spectator) else \
		("异形 · 假装维修不给进度" if bool(a.get("alien", false)) else "人类")
	role_text += " · 弹 %d · 包 %d" % [int(a.get("bullet", 0)), int(a.get("medkit", 0))]
	if bool(a.get("ghost", false)):
		role_text = "幽灵 · 穿墙全视 · 任务额度 %d 分" % maxi(0,
			sim.ghost_cap() - int(a.get("ghostPts", 0)))
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
		# 2.5D：死亡=幽灵，不弹「你已阵亡」结算面板（面板只在对局结束时出现）。
		# 之前这里把 _player_dead 置 true 并全屏盖住，玩家以为对局结束了。
		_player_dead = false
		if end_panel != null and end_panel.visible and not sim.over:
			end_panel.visible = false
	elif bool(a.get("downed", false)) and not _down_toast:
		_down_toast = true
		_toast("你已濒死 · 天亮前没人救就会死（可被拖进医疗间 / 医疗包 / 无人机救起）")


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
		# 2.5D 局内 HUD 不播报任务完成 / 驱逐 / 补给（那些只在复盘页）。
		# 这里只留"全船都能感知"的事件：开会、故障、修复。
		if kind == "meeting":
			txt = "发现尸体 · 开会"
		elif kind == "sabotage":
			txt = "设备故障 · %s" % sim.room_name(String(e.get("room", "")))
		elif kind == "fix":
			txt = "故障修复" if bool(e.get("ok", false)) else "故障未修 · 进度 -5"
		if txt != "":
			lines.append(txt)
	return "\n".join(lines)


## 结算页（2.5D endGame + renderEnd）：只在 sim.over 时调用，只填一次。
## 身份表 / 投票矩阵都是只读数据；按钮固定在最下面，表格自己滚。
func _show_end() -> void:
	if settle_panel == null or sim == null:
		return
	if end_panel != null:
		end_panel.visible = false
	var first := not settle_panel.visible
	settle_panel.visible = true
	if not first:
		return
	settle_title.text = "人类胜利" if bool(sim.over_win) else "异形胜利"
	settle_sub.text = String(sim.over_why)
	settle_stats.text = "维修 %d/%d · 第 %d 夜 · 按 R 重开一局（新种子 %d）" % [
		int(sim.prog), int(sim.win_pts()), int(sim.night), int(sim.seed_used) + 1]
	settle_ids.text = _settle_ids_text()
	settle_votes.text = _settle_votes_text()


## 2.5D #e-ids（js/game.js:4802-4817）：席位 + 阵营 + 结局 + 死亡地点 + 刀在谁。
## 只在 sim.over 后显示，不涉及任何判定。
func _settle_ids_text() -> String:
	var lines: Array = []
	for a: Dictionary in sim.agents:
		var i := int(a.get("i", -1))
		var alien := bool(a.get("alien", false))
		var role := "异形" if alien else "人类"
		var fate := ""
		if bool(a.get("alive", false)):
			fate = "濒死存活" if bool(a.get("downed", false)) else "存活"
		else:
			match String(a.get("deathCause", "")):
				"vote":
					fate = "被驱逐"
				"knife":
					fate = "被出刀"
				"shot":
					fate = "被枪杀"
				"bleed":
					fate = "天亮失血"
				_:
					fate = "死亡"
		var extra := ""
		var rid := String(a.get("deathRoom", ""))
		if rid != "" and String(a.get("deathCause", "")) != "vote":
			extra = " · " + sim.room_name(rid)
		var killer := ""
		var kb := int(a.get("killedBy", -1))
		if kb >= 0 and kb != i:
			killer = " · 刀在 " + _tag_name(kb)
		var col := "#E0574F" if alien else "#7FB0E6"
		lines.append("[color=%s]%s · %s[/color]  [color=#B8C6D8]%s%s[/color]%s" % [
			col, _tag_name(i), role, fate, extra,
			("[color=#F0C674]%s[/color]" % killer) if killer != "" else ""])
	return "\n".join(lines) if not lines.is_empty() else "（无席位数据）"


## 2.5D #e-votes（js/game.js:4819-4838）：按会议 seq 分组，列每场的终票。
## 终票由 _close_meeting 统一落「vote」事件（带 seq），中途改票另有 vote_change。
func _settle_votes_text() -> String:
	var by_seq: Dictionary = {}
	for e: Dictionary in sim.events:
		if String(e.get("kind", "")) != "vote":
			continue
		var seq := int(e.get("seq", 0))
		if not by_seq.has(seq):
			by_seq[seq] = []
		(by_seq[seq] as Array).append(e)
	if by_seq.is_empty():
		return "本局没有进行到投票"
	var keys: Array = by_seq.keys()
	keys.sort()
	var lines: Array = []
	for key: int in keys:
		var arr: Array = by_seq[key]
		var night := int((arr[0] as Dictionary).get("night", 0))
		lines.append("[color=#F0C674]第 %d 夜 · 第 %d 场投票[/color]" % [night, key])
		for e: Variant in arr:
			var ev := e as Dictionary
			var actor := int(ev.get("actor", -1))
			var tgt := int(ev.get("target", -1))
			var an := String(sim.agent(actor).get("name", "?"))
			var tn := "弃权" if tgt < 0 else String(sim.agent(tgt).get("name", "?"))
			lines.append("  %s → %s" % [an, tn])
	return "\n".join(lines)


func _input(event: InputEvent) -> void:
	if _screenshot_mode:
		return
	if sim == null or not started:
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
	## F2 = DEV（2.5D js/game.js:7928）：设置面板之外一律可用，会议/轮盘/信息面板都不挡。
	if event is InputEventKey and (event as InputEventKey).pressed \
			and not (event as InputEventKey).echo \
			and (event as InputEventKey).keycode == KEY_F2:
		sim.dev = not bool(sim.dev)
		# 打开时把旧拦截记录视为已读：不要一开 DEV 就吐一屏历史 toast。
		_dev_log_n = sim.dev_log.size() if bool(sim.dev) else 0
		_refresh_dev_panel()
		_toast("DEV：无敌 + 全知（F2 关闭）" if bool(sim.dev) else "DEV：已关闭")
		_probe("F2 → DEV %s" % ("开" if bool(sim.dev) else "关"))
		get_viewport().set_input_as_handled()
		return
	## 信息面板（尸检记录 / 全船监控）在最上层：只剩 ESC 关闭，其余按键不落到对局。
	## 对应 2.5D 的 G.inspect / G.camView 输入屏蔽（js/game.js:7932 起）。
	if _info_open:
		if event is InputEventKey and (event as InputEventKey).pressed \
				and (event as InputEventKey).keycode == KEY_ESCAPE:
			_close_info()
			get_viewport().set_input_as_handled()
		return
	if event is InputEventKey and (event as InputEventKey).pressed:
		if (event as InputEventKey).keycode == KEY_M 				and not (event as InputEventKey).echo and audio != null:
			audio.set_on(not audio.is_on())
			_toast("音效：开" if audio.is_on() else "音效：关")
			get_viewport().set_input_as_handled()
			return
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
		# Esc 释放 / 收回鼠标（自由游玩时）。面板 / 小游戏 / 轮盘各自处理 Esc，
		# 这里只在没有任何模态时生效 —— 旧版 player.gd 设了 VISIBLE，但
		# `_refresh_mouse_mode()` 下一帧又把它 CAPTURED，等于 Esc 完全无效。
		if (event as InputEventKey).keycode == KEY_ESCAPE and not (event as InputEventKey).echo:
			if _want_mouse_visible():
				return
			mouse_released = not mouse_released
			_refresh_mouse_mode()
			get_viewport().set_input_as_handled()
			return
	# 点击画面收回鼠标（自由游玩时）。UI 面板的点击由 GUI 处理，不能在这里抢。
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed \
			and mouse_released and not _want_mouse_visible():
		mouse_released = false
		_refresh_mouse_mode()
		get_viewport().set_input_as_handled()
		return
	# 攻击输入：左键出刀（异形）/ 右键开枪（人类），都要在鼠标已被捕获时才生效，
	# 否则第一次点击是"从 UI 夺回鼠标"，不该顺带打一枪。
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
		# headless 下 DisplayServer 不支持捕获鼠标（Input.mouse_mode 恒为 VISIBLE），
		# 门禁/自测会因此永远走不进攻击分支 —— 只在 headless 放行，真实游玩仍要求捕获。
		if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED \
				or DisplayServer.get_name() == "headless":
			_handle_attack((event as InputEventMouseButton).button_index)
		return
	# R 只在对局结束时重开。幽灵（alive=false 但局没结束）还要继续做任务，
	# 之前这条判定用 alive，导致阵亡后按 R 直接把幽灵态的新局重开了。
	if not bool(sim.over):
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
	qual_pending = 0
	qual = 0
	station = {}
	if end_panel != null:
		end_panel.visible = false
	if settle_panel != null:
		settle_panel.visible = false
	_player_dead = false
	_ghost_toast = false
	_keys_down.clear()
	_down_toast = false
	# 新一局从「鼠标已被捕获」开始：结算页可能按过 Esc 释放，不能带进下一局。
	mouse_released = false
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
	## 夹具修正（2026-11-10）：与 --mgtest / --devicetest 同一条坑 ——
	## 会议开着时 _process 会把小游戏卡片收掉，旧夹具因此在开局讨论里恒报 open=false，
	## 任务进度自然一动不动。先把会正常走完，再验「打开 → 解题 → 结算」。
	_finish_meeting(sim)
	await get_tree().create_timer(0.3).timeout
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
