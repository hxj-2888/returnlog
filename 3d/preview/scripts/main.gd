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

## 调试夹具（2026-11-12 迁出 main.gd，实现见 scripts/tests/）：分发只调用，不放实现。
const TestFixture := preload("res://scripts/tests/test_fixture.gd")
const TestSim := preload("res://scripts/tests/test_sim.gd")
const TestCombat := preload("res://scripts/tests/test_combat.gd")
const TestSocial := preload("res://scripts/tests/test_social.gd")
const TestUI := preload("res://scripts/tests/test_ui.gd")
const TestWorld := preload("res://scripts/tests/test_world.gd")

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


## F2 的 FPS 式 DEV 透视（PLAN §五）：屏幕空间方框 + 名牌，穿墙可见，>25m 不画。
## 只读 sim 与相机，不参与任何判定；F3 仍保留旧的文字总览。
class EspCanvas extends Control:
	var host: Node
	var f: SystemFont

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		f = SystemFont.new()
		f.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])

	func _draw() -> void:
		if host == null:
			return
		var s = host.get("sim")
		var pl = host.get("player")
		if s == null or pl == null:
			return
		var cam := pl.get("camera") as Camera3D
		if cam == null:
			return
		var eye := cam.global_position
		var vp: Vector2 = get_viewport().get_visible_rect().size
		for a: Dictionary in s.agents:
			var alive := bool(a.get("alive", false))
			if not alive and bool(a.get("bodyGone", false)):
				continue
			var p2: Vector2 = a.get("bodyPos", Vector2.ZERO) if not alive \
				else a.get("pos", Vector2.ZERO)
			var foot := Vector3(p2.x, 0.05, p2.y)
			var head := Vector3(p2.x, 1.75, p2.y)
			var dist := eye.distance_to(foot)
			if dist > 25.0 or cam.is_position_behind(head):
				continue
			var sh := cam.unproject_position(head)
			var sf := cam.unproject_position(foot)
			if sh.x < -100.0 or sh.x > vp.x + 100.0 or sh.y < -100.0 or sh.y > vp.y + 100.0:
				continue
			var top := minf(sh.y, sf.y)
			var bot := maxf(sh.y, sf.y)
			var h := maxf(bot - top, 20.0)
			var w := clampf(h * 0.44, 16.0, 76.0)
			var cx := (sh.x + sf.x) * 0.5
			var col := Color(0.42, 0.88, 0.95)
			if not alive:
				col = Color(0.60, 0.62, 0.68)
			elif bool(a.get("alien", false)):
				col = Color(1.0, 0.42, 0.42)
			if alive and bool(a.get("downed", false)):
				col = Color(1.0, 0.66, 0.28)
			var box := Rect2(cx - w * 0.5, top, w, h)
			draw_rect(box, Color(col.r, col.g, col.b, 0.12), true)
			draw_rect(box, col, false, 2.0)
			var faction := "异形" if bool(a.get("alien", false)) else "人类"
			var act := "待机"
			if not alive:
				act = "尸体"
			elif bool(a.get("downed", false)):
				act = "濒死"
			elif bool(a.get("detained", false)):
				act = "被擒"
			elif int(a.get("drag", -1)) >= 0:
				act = "拖尸"
			elif float(a.get("doing", 0.0)) > 0.0:
				act = String(a.get("_doing", "做事"))
			var line := "%s · %s · %.1fm · %s" % [
				String(a.get("name", "?")), faction, dist, act]
			draw_string(f, Vector2(cx - w * 0.5, top - 6.0), line,
				HORIZONTAL_ALIGNMENT_LEFT, -1, 12, col)


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
## --inputlog：打印每一次按键落到哪个分支 / 被谁挡住（PLAN §六 的埋点）。
var input_log := false
## 能力兜底调用计数（--abilitytest 断言「按键确实进了能力入口」，不是被静默吞掉）。
var _fallback_count := 0

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
## F2 透视覆盖层 / F3 文字总览开关（PLAN §五：dev_panel 默认隐藏，不再占右下角）。
var esp_canvas: EspCanvas
var text_dev_open := false
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
	input_log = args.has("--inputlog")
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
		var home_ok := TestUI._run_hometest(self)
		get_tree().quit(0 if home_ok else 1)
		return

	if args.has("--roletest"):
		var role_ok: bool = await TestSim._run_roletest(self)
		get_tree().quit(0 if role_ok else 1)
		return

	if args.has("--bottest"):
		var bot_ok := TestCombat._run_bottest(self)
		get_tree().quit(0 if bot_ok else 1)
		return

	if args.has("--b4test"):
		var b4_ok := TestCombat._run_b4test(self)
		get_tree().quit(0 if b4_ok else 1)
		return

	if args.has("--speechtest"):
		var sp_ok := TestSocial._run_speechtest(self)
		get_tree().quit(0 if sp_ok else 1)
		return

	if args.has("--b6test"):
		var b6_ok := TestCombat._run_b6test(self)
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
		var nav_ok := TestSim._run_navtest(self)
		get_tree().quit(0 if nav_ok else 1)
		return

	if args.has("--aittest"):
		var ai_ok := TestSim._run_aittest(self)
		get_tree().quit(0 if ai_ok else 1)
		return

	if args.has("--meetingtest"):
		var meet_ok := TestSocial._run_meetingtest(self)
		get_tree().quit(0 if meet_ok else 1)
		return

	if args.has("--simtest"):
		var sim_ok := TestSim._run_simtest(self)
		get_tree().quit(0 if sim_ok else 1)
		return

	## 任务回路 E2E：必须是“玩家自己的任务”，走 E 打开 → 解题 → 写回 sim 的完整路径。
	if args.has("--taskflowtest"):
		var flow_ok := await TestSim._run_taskflowtest(self)
		get_tree().quit(0 if flow_ok else 1)
		return

	if args.has("--arttest"):
		TestWorld._run_arttest(self)
		get_tree().quit()
		return

	if args.has("--powertest"):
		await TestWorld._run_powertest(self)
		get_tree().quit()
		return

	if args.has("--interacttest"):
		await TestSim._run_interacttest(self)
		get_tree().quit()
		return

	## 玩家动作全集 + 真实输入链自测（不靠 skip_discussion 绕过会议）。
	if args.has("--actiontest"):
		var act_ok := TestSim._run_actiontest(self)
		get_tree().quit(0 if act_ok else 1)
		return

	## 玩家能力端到端自测：真实按键 → sim 状态真的写回（2026-11-11 用户现场）。
	if args.has("--abilitytest"):
		var ability_ok := await TestSim._run_abilitytest(self)
		get_tree().quit(0 if ability_ok else 1)
		return

	## 行为夹具回放（PORTING_PROTOCOL §3.1）：夹具由 2.5D SKV3._t 运行时导出，
	## 逐字段比对四个非排除项机制的输出集合 / 顺序 / 过滤条件。
	if args.has("--parityfixture"):
		var fx_ok := TestFixture._run_parity_fixture(self)
		get_tree().quit(0 if fx_ok else 1)
		return

	## 不变量断言层（2.5D SKInvariants / runInvariants 的 GDScript 移植）：
	## 开局 + 三夜 AI 自跑各跑一遍；再用两个**故意破坏的状态**做反向对照，
	## 证明检查器不是恒真（和 --abilitytest 的教训一致：只报 OK 的夹具没有价值）。
	if args.has("--invtest"):
		var inv_ok := TestFixture._run_invtest(self)
		get_tree().quit(0 if inv_ok else 1)
		return

	## 拖尸全链路 + 抢修人数上限（2.5D syncDragOf / dragAwayNotice / FIX_CREW_CAP）。
	if args.has("--dragtest"):
		var drag_ok := TestFixture._run_dragtest(self)
		get_tree().quit(0 if drag_ok else 1)
		return

	## 会议开场播报 + 开场定调（2.5D openMeeting:6205-6260 / openingLine / planFirstAccuse）。
	if args.has("--meetopentest"):
		var mo_ok := TestSocial._run_meetopentest(self)
		get_tree().quit(0 if mo_ok else 1)
		return

	## 机器人刀击（2.5D stab/knifeBot/damageBot）：守卫、红身、保安转向、HP/刀数。
	## 与既有 --bottest（巡逻/抓捕/医疗）分开，避免覆盖那条链的断言。
	if args.has("--knifebottest"):
		var bot_ok := TestFixture._run_knifebottest(self)
		get_tree().quit(0 if bot_ok else 1)
		return

	## 玩家视角调研（--study）：真实输入事件走 InputMap → _input → sim，
	## 每步内置截图；用于「按了有没有反应」的现场取证，不改任何玩法参数。
	if args.has("--study"):
		var study_ok := await _run_study()
		get_tree().quit(0 if study_ok else 1)
		return

	## 2026-11-07：逐个任务点验证「设备存在 / 不悬高 / 站位能收到交互项」。
	## 2026-11-07：地板口径自测 —— 3D 侧地面材质必须与 floor_spec.json
	## （与 2.5D 底图共用的单一真源）逐项一致：贴图名 / 重复尺度 / 染色。
	## 这条断言卡的是「底图换了地板、3D 没跟」这类漂移。
	if args.has("--floortest"):
		TestWorld._run_floortest(self)
		get_tree().quit()
		return

	if args.has("--tasktest"):
		TestSim._run_tasktest(self)
		get_tree().quit()
		return

	## 2026-11-09 站位可达性验收（--reachtest）：tasktest 是传送到位再收项，
	## 传进去的点如果落在墙/掩体几何里，真实走路永远到不了 —— 玩家体感是「任务点按 E 没反应」。
	if args.has("--reachtest"):
		TestSim._run_reachtest(self)
		get_tree().quit()
		return

	## 2026-11-09 音频链路验收：背景音乐文件在不在、循环开没开、两个滑杆各管各的。
	if args.has("--audiotest"):
		TestWorld._run_audiotest(self)
		get_tree().quit()
		return

	if args.has("--mgtest"):
		await TestUI._run_mgtest(self)
		get_tree().quit(0 if _mgtest_ok else 1)
		return

	if args.has("--specttest"):
		await TestUI._run_specttest(self)
		get_tree().quit(0 if _specttest_ok else 1)
		return

	if args.has("--knifetest"):
		await TestCombat._run_knifetest(self)
		get_tree().quit(0 if _knifetest_ok else 1)
		return

	## 玩家探针（2026-11-10 用户现场「异形按 E 打不倒人」）：
	## 用真实 InputEvent 走 E / 数字键 / 左键 / F2，断言玩家实际能完成什么，
	## 不直接调 sim 或内部动作函数当“按过键”。详见 _run_probetest。
	if args.has("--probetest"):
		await TestWorld._run_probetest(self)
		get_tree().quit(0 if _probetest_ok else 1)
		return

	## 无鼠标、无窗口的动作自测：knife / down / walk / idle 四个 clip 的触发。
	if args.has("--crewanimtest"):
		var ca_ok := TestWorld._run_crewanimtest(self)
		get_tree().quit(0 if ca_ok else 1)
		return

	if args.has("--uitest"):
		await TestUI._run_uitest(self)
		get_tree().quit(0 if _uitest_ok else 1)
		return

	## 会议 UI 功能自测（真实鼠标点模板 / 投票 / 改票 / 弃权 / 跳过投票 / 只读会议）。
	if args.has("--meetuitest"):
		await TestUI._run_meetuitest(self)
		get_tree().quit(0 if _meetuitest_ok else 1)
		return

	## A 档判定层自测：取消全图锁敌 / humanT / saw_red 节流 / saw_avoid / 空闲游荡。
	if args.has("--aiporttest"):
		TestWorld._run_aiporttest(self)
		get_tree().quit(0 if _aiporttest_ok else 1)
		return

	## 鼠标口径自测：Esc 释放必须能维持，不被下一帧重新捕获。
	if args.has("--mousetest"):
		await TestUI._run_mousetest(self)
		get_tree().quit(0 if _mousetest_ok else 1)
		return

	## 结算页自测：终票按 seq 落账 / 投票矩阵 / 身份表结局与死亡地点。
	if args.has("--settletest"):
		TestUI._run_settletest(self)
		get_tree().quit(0 if _settletest_ok else 1)
		return

	## 局内小地图自测：尺寸/点击穿透/灯态三态/任务点与地图数据。
	if args.has("--minimaptest"):
		await TestUI._run_minimaptest(self)
		get_tree().quit(0 if _minimaptest_ok else 1)
		return

	## 证据/情绪/口供自测：evalAlmost 全量 / trust-grudge / claimHist / DESC。
	if args.has("--socialtest"):
		TestSocial._run_socialtest(self)
		get_tree().quit(0 if _socialtest_ok else 1)
		return

	if args.has("--leadtest"):
		await TestSocial._run_leadtest(self)
		get_tree().quit(0 if _leadtest_ok else 1)
		return

	if args.has("--devicetest"):
		await TestWorld._run_devicetest(self)
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


func _count_why(w: Dictionary, target_i: int, kind: String) -> int:
	var n := 0
	for e: Variant in ((w.get("why", {}) as Dictionary).get(target_i, []) as Array):
		if String((e as Dictionary).get("kind", "")) == kind:
			n += 1
	return n


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


func _why_has(w: Dictionary, target_i: int, reason: String) -> bool:
	var why: Dictionary = (w.get("why", {}) as Dictionary)
	for e: Variant in (why.get(target_i, []) as Array):
		if String((e as Dictionary).get("reason", "")) == reason:
			return true
	return false


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


func _finish_meeting(s) -> void:
	if s == null:
		return
	var guard := 0
	while not s.meeting.is_empty() and guard < 1200:
		if String(s.meeting.get("phase", "")) == "discuss":
			s.skip_discussion()
		s.tick(0.1)
		guard += 1


const STUDY_DIR := "res://screenshots/study"

func _study_shot(tag: String) -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(STUDY_DIR))
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(STUDY_DIR + "/" + tag + ".png")


func _study_state(tag: String) -> void:
	var me: Dictionary = sim.me()
	var mp: Vector2 = me.get("pos", Vector2.ZERO) as Vector2
	var offers: Array = _collect_offers() if sim != null else []
	var ids: Array = []
	for o: Dictionary in offers:
		ids.append(String(o.get("id", "")).split("-")[0])
	var toast_txt := ""
	if toast_label != null:
		toast_txt = toast_label.text
	print("STUDY %s | t=%.1f night=%d prog=%d meet=%s | pos=(%.1f,%.1f) alive=%s downed=%s alien=%s drag=%d qual=%d bullet=%d medkit=%d | dmg=%d light=%d | offers=%s | toast=%s" % [
		tag, float(sim.t), int(sim.night), int(sim.prog),
		str(not sim.meeting.is_empty()), mp.x, mp.y,
		str(me.get("alive", false)), str(me.get("downed", false)),
		str(me.get("alien", false)), int(me.get("drag", -1)),
		int(me.get("qual", 0)), int(me.get("bullet", 0)),
		int(me.get("medkit", 0)), sim.dmg.size(), int(sim.light_state),
		",".join(PackedStringArray(ids)), toast_txt])


func _study_hold(key: Key, frames: int) -> void:
	var d := InputEventKey.new()
	d.keycode = key
	d.physical_keycode = key
	d.pressed = true
	Input.parse_input_event(d)
	for i in frames:
		await get_tree().physics_frame
	var u := InputEventKey.new()
	u.keycode = key
	u.physical_keycode = key
	u.pressed = false
	Input.parse_input_event(u)
	await get_tree().process_frame


func _run_study() -> bool:
	# --role human 已由 _ready 开局；这里只把会议收掉，进入可自由行动的夜晚。
	if sim == null or sim.agents.is_empty():
		push_error("STUDY 未进局：请带 --role human")
		return false
	_finish_meeting(sim)
	await get_tree().process_frame
	await get_tree().process_frame
	_study_state("00-ingame")
	await _study_shot("3d-01-ingame")

	# ① WASD 真实按住 → 位置变化
	var p0: Vector2 = sim.me().get("pos", Vector2.ZERO)
	await _study_hold(KEY_W, 40)
	var p1: Vector2 = sim.me().get("pos", Vector2.ZERO)
	_study_state("01-move-W")
	await _study_shot("3d-02-move-w")
	print("STUDY move-W distance=%.2f" % p0.distance_to(p1))

	# ② 鼠标视角：真实 MouseMotion
	var mm := InputEventMouseMotion.new()
	mm.relative = Vector2(260, 0)
	Input.parse_input_event(mm)
	await get_tree().process_frame
	await _study_shot("3d-03-look")

	# ③ 八个动作键 + 左右键：逐键真实按下
	await _tap_key(KEY_E)
	_study_state("02-key-E")
	await _study_shot("3d-04-key-e")
	await _tap_key(KEY_F)
	_study_state("03-key-F")
	await _tap_key(KEY_R)
	_study_state("04-key-R")
	await _tap_key(KEY_G)
	_study_state("05-key-G")
	await _tap_key(KEY_Q)
	_study_state("06-key-Q")
	await _tap_key(KEY_V)
	_study_state("07-key-V")
	await _study_shot("3d-05-key-v")
	await _tap_key(KEY_B)
	_study_state("08-key-B")
	await _tap_key(KEY_C)
	_study_state("09-key-C")
	await _study_shot("3d-06-key-c")
	await _tap_mouse(MOUSE_BUTTON_LEFT)
	_study_state("10-mouse-left")
	await _tap_mouse(MOUSE_BUTTON_RIGHT)
	_study_state("11-mouse-right")
	await _tap_key(KEY_ESCAPE)
	_study_state("12-escape")
	await _study_shot("3d-07-escape")

	# ④ 场景注入：尸体 / 伤员 / 异形身份，再走一次真实按键
	var body_i := -1
	var wounded_i := -1
	for a: Dictionary in sim.agents:
		if int(a.get("i", -1)) == int(sim.me_idx):
			continue
		if body_i < 0:
			a["alive"] = false
			a["downed"] = false
			a["deathCause"] = "knife"
			a["bodyGone"] = false
			a["bodyReported"] = false
			var mp: Vector2 = sim.me().get("pos", Vector2.ZERO)
			a["pos"] = mp + Vector2(0.8, 0.8)
			a["bodyPos"] = a["pos"]
			body_i = int(a.get("i", -1))
		elif wounded_i < 0:
			a["alive"] = true
			a["downed"] = true
			a["pos"] = sim.me().get("pos", Vector2.ZERO) + Vector2(0.6, 0.6)
			wounded_i = int(a.get("i", -1))
	sim.me()["medkit"] = 1
	await get_tree().process_frame
	_study_state("13-inject")
	await _study_shot("3d-08-inject-body")
	# 有交互项时按 E：轮盘应列出 report/drag/search/revive，截图留证后 ESC 取消。
	await _tap_key(KEY_E)
	_study_state("13b-E-offers")
	await _study_shot("3d-08b-e-offers")
	await _tap_key(KEY_ESCAPE)
	_study_state("13c-esc-cancel")
	await _tap_key(KEY_G)
	_study_state("14-G-drag")
	await _study_shot("3d-09-drag")
	await _tap_key(KEY_G)
	_study_state("15-G-drop")
	await _tap_key(KEY_F)
	_study_state("16-F-revive")
	await _tap_key(KEY_R)
	_study_state("17-R-report")
	await _study_shot("3d-10-report")

	# ⑤ 异形破坏（B）与电闸（V）的真实入口
	sim.me()["alien"] = true
	sim.me()["sabUsed"] = false
	sim.dev = false
	await _tap_key(KEY_B)
	_study_state("18-B-sabotage")
	await _study_shot("3d-11-sabotage")
	return true


func _ability_reset() -> int:
	sim.meeting = {}
	if wheel != null and wheel.is_open():
		wheel.close()
	_close_info()
	if mg_layer != null and mg_layer.is_open():
		mg_layer.cancel()
	if _pipe_open:
		_close_pipe_ui()
	station = {}
	_keys_down.clear()
	_e_down = false
	_knife_cd = 0.0
	_shot_cd = 0.0
	_pipe_cd = 0.0
	player.ui_locked = false
	mouse_released = false
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	var me0: Dictionary = sim.me()
	me0["alive"] = true
	me0["downed"] = false
	me0["detained"] = false
	me0["drag"] = -1
	me0["knife"] = 1
	me0["bullet"] = 2
	me0["medkit"] = 1
	me0["sabUsed"] = false
	me0["ghost"] = false
	player.global_position = Vector3(31.0, 0.05, 33.5)
	player.rotation.y = 0.0
	var body_i := -1
	for a: Dictionary in sim.agents:
		if int(a.get("i", -1)) == int(sim.me_idx):
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
	var body: Dictionary = sim.agent(body_i)
	var bp := Vector2(31.0, 34.0)
	body["alive"] = false
	body["downed"] = false
	body["pos"] = bp
	body["bodyPos"] = bp
	return body_i


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
			and bool(me.get("alien", false)) \
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
	var help := _label("WASD 移动 · E 交互 · F 任务/设施 · R 报告 · G 拖拽 · Q 管道 · V 电闸 · B 破坏 · C 监控 · 左键出刀 · 右键开枪 · F2 透视 · F3 文字总览 · Esc 关面板 · P 设置",
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
	_build_esp()


## F2 透视层：全屏覆盖、不吃鼠标事件，默认隐藏；F3 才显示右侧文字总览。
func _build_esp() -> void:
	esp_canvas = EspCanvas.new()
	esp_canvas.host = self
	esp_canvas.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	esp_canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE
	esp_canvas.visible = false
	dev_layer.add_child(esp_canvas)


## 状态文案与资源行照 2.5D renderDevPanel（js/game.js:601-620）。
func _refresh_dev_panel() -> void:
	if dev_panel == null:
		return
	var on: bool = sim != null and not sim.agents.is_empty() \
		and (bool(sim.dev) or bool(sim.spectator))
	# F2 只开透视；右侧文字总览要按 F3 才出现（不再常驻占屏幕右侧 1/3）。
	dev_panel.visible = on and text_dev_open
	if esp_canvas != null:
		esp_canvas.visible = on
	if not on:
		return
	if esp_canvas != null:
		esp_canvas.queue_redraw()
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
	var ev_stat: Dictionary = {}
	var t0 := Time.get_ticks_msec()
	for g in games:
		var s = SimStateScript.new()
		# 2.5D SIM_RUN：批量模拟模式，不跑不变量断言（1000 局逐帧断言无意义）。
		s.sim_run = true
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
			if bool(a.get("alien", false)): diag["hides"] = int(diag.get("hides", 0)) + int(a.get("_hides", 0))
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
		# DEV / 旁观时每行显示真实身份（F2 透视的会议侧配套，PLAN §五-2）。
		var ma: Dictionary = sim.agent(k)
		var tag := ""
		if bool(sim.dev) or bool(sim.spectator):
			tag = "[异形] " if bool(ma.get("alien", false)) else "[人类] "
		b.text = "%02d %s%s" % [k + 1, tag, String(ma.get("name", "?"))]
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
	# F2 透视每帧重画（相机在动）；F3 文字总览仍按 0.5s 刷新。
	if esp_canvas != null:
		esp_canvas.visible = sim != null and (bool(sim.dev) or bool(sim.spectator))
		if esp_canvas.visible:
			esp_canvas.queue_redraw()
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
	# 专用键的边沿**每帧都要更新**（不能只在 offers 非空时才算）：
	# 旧版在「附近没有交互项」时直接 return，按键被静默吞掉 ——
	# 用户现场「按键全合法、能力一点都没有、拖拽完全拖不了」正是这一条。
	# 2.5D 的动作键（W/A/S/D/F/R/B/H/V）是无条件入口，判定写在动作函数内，
	# 3D 把它们做成「靠近才出现的交互项」是移植时走偏，这里收回。
	var edges: Dictionary = {}
	for kk: String in _OFFER_KEY_KEYS:
		edges[kk] = _key_edge(kk)
	var digits: Array = []
	for ni in 9:
		digits.append(_num_edge(ni))
	var e_now := Input.is_physical_key_pressed(_action_keycode("E"))
	var pressed := e_now and not _e_down
	_e_down = e_now

	# 模态相位：按键不落到对局，但必须给一次明确反馈（旧版静默吞键）。
	# 这里不清 _keys_down：边沿状态仍要连续，否则会议结束后会假触发一次。
	# 2026-11-13：补上尸检/监控信息面板、设置/复盘面板与对局结束 —— 旧版只挡会议/
	# 管道/小游戏/轮盘，_input 虽已拦键盘，但这里走的是轮询，面板开着按 F/G/R 仍会执行。
	var blocked := ""
	if sim != null and sim.over:
		blocked = "对局已结束"
	elif sim != null and not sim.meeting.is_empty():
		blocked = "会议进行中 · 操作暂不可用"
	elif _pipe_open or _info_open or (mg_layer != null and mg_layer.is_open()) \
			or (wheel != null and wheel.is_open()) \
			or (ui_panels != null and ui_panels.any_open()):
		blocked = "先关闭当前面板（Esc）"
	elif not station.is_empty():
		# 2.5D interact(): `if(G.wheel||me.doing>0)return` —— 站桩中不接收新的交互。
		blocked = "站桩中 · 移动即中断"
	if not blocked.is_empty():
		prompt_label.text = ""
		for kk3: String in _OFFER_KEY_KEYS:
			if bool(edges[kk3]):
				_probe_input(kk3, blocked)
				_toast(blocked)
		if pressed:
			_probe_input("E", blocked)
		return

	var offers := _collect_offers()
	if offers.is_empty():
		prompt_label.text = "" if station.is_empty() else "站桩中 · %s（移动即中断）" % String(station.get("label", ""))
		# 2.5D 的用户裁定「点错要有反馈」同样适用于按键：没有可交互项时按 E
		# 不能毫无反应，否则玩家会以为是"交互坏了"（2026-11-10 现场）。
		if pressed and station.is_empty():
			_probe("E · 交互项 0")
			_toast(_no_offer_hint())
	else:
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

	var picked: Dictionary = {}
	# 1) 专用键：**恒入口**。有对应 offer 就执行它，没有就走 sim 能力兜底。
	var used_key := ""
	for kk2: String in _OFFER_KEY_KEYS:
		if not bool(edges[kk2]):
			continue
		used_key = kk2
		picked = _offer_by_key(offers, kk2)
		break
	if used_key != "":
		_probe_input(used_key, "交互项 %d · 命中=%s" % [offers.size(), str(not picked.is_empty())])
		if picked.is_empty():
			_fallback_action(used_key, offers)
			return
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
			wheel.open(_ranked_offers(offers),
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


## 专用键的能力兜底（2.5D 动作键口径）：附近没有对应交互项时，
## 能力依然直达模拟层，由 sim.can_act 给出精确失败原因；执行仍复用原有单一入口。
func _fallback_action(k: String, offers: Array) -> void:
	if sim == null or sim.agents.is_empty() or player == null:
		return
	_fallback_count += 1
	_probe_input(k, "能力兜底入口")
	var p := player.global_position
	var pos := Vector2(p.x, p.z)
	var ctx := {"actor": int(sim.me_idx), "pos": pos}
	var dev_r := SpaceData.num(space, "reach", "fix")
	match k:
		"G":
			# 2.5D toggleDrag（D 键，js/game.js:8552）无条件直达，拖尸不限阵营。
			var d: Dictionary = sim.can_act("drag", ctx)
			if not bool(d.get("ok", false)):
				_toast(_act_reason(String(d.get("reason", ""))))
				return
			if String(d.get("action", "")) == "drop":
				_on_drag_drop()
			else:
				_on_drag_start(int(d.get("target", -1)))
		"R":
			var r: Dictionary = sim.can_act("report", ctx)
			if not bool(r.get("ok", false)):
				_toast(_act_reason(String(r.get("reason", ""))))
				return
			sim.open_meeting(int(sim.me_idx), int(r.get("target", -1)))
		"Q":
			var q: Dictionary = sim.can_act("pipe", ctx)
			if not bool(q.get("ok", false)):
				_toast(_act_reason(String(q.get("reason", ""))))
				return
			# 2.5D pickPipe():933 钻管道强制先放下手里的尸体。
			if String(q.get("action", "")) == "release_drag":
				sim.release_drag(int(sim.me_idx))
			var port := _nearest_pipe_port(pos)
			if port.is_empty():
				_toast("附近没有管道口")
				return
			var pp: Vector3 = port["pos"] as Vector3
			var pd := Vector2(pp.x - pos.x, pp.z - pos.y).length()
			if pd > PIPE_NEAR_R:
				_toast("离管道口还有 %.1f m（交互半径 %.1f m）" % [pd, PIPE_NEAR_R])
				return
			_use_pipe(port)
		"B":
			var b: Dictionary = sim.can_act("sabotage", ctx)
			if not bool(b.get("ok", false)):
				_toast(_act_reason(String(b.get("reason", ""))))
				return
			_on_sabotage(String(b.get("action", "")))
		"F":
			# 先找「自己的、在交互半径内的」任务设备；最近的那个可能不是你的任务。
			var dev = _nearest_device(pos, true)
			if dev == null:
				var other = _nearest_device(pos)
				if other != null and float(other.reach_dist(p)) <= TASK_NEAR_R:
					_toast("「%s」不是你现在的任务（看任务列表）" % String(other.task_label))
				else:
					_toast("附近没有设备 / 故障点（走近再按 F）")
				return
			var dd := float(dev.reach_dist(p))
			if dd > TASK_NEAR_R:
				_toast("离设备还有 %.1f m（交互半径 %.1f m）" % [dd, TASK_NEAR_R])
				return
			_open_device(dev)
		"V":
			if sim != null and bool(sim.me().get("ghost", false)):
				_toast("幽灵状态只能做自己的剩余任务")
				return
			var brk = _nearest_breaker(pos)
			if brk == null:
				_toast("附近没有电闸（去配电室）")
				return
			var bd = brk.distance_to(p)
			if bd > SpaceData.num(space, "reach", "breaker"):
				_toast("离电闸还有 %.1f m" % bd)
				return
			(_breaker_offer(brk)["act"] as Callable).call()
		"C":
			if sim != null and bool(sim.me().get("ghost", false)):
				_toast("幽灵状态只能做自己的剩余任务")
				return
			var mon := _nearest_facility(pos, "monitor")
			if mon.is_empty():
				_toast("附近没有监控台")
				return
			var mp := Vector2(float(mon.get("x", 0)), float(mon.get("y", 0)))
			if mp.distance_to(pos) > MONITOR_NEAR_R:
				_toast("离监控台还有 %.1f m" % mp.distance_to(pos))
				return
			_open_cams()
		_:
			_toast("附近没有 [%s] 对应的操作" % k)


## sim.can_act 的失败原因 → 玩家可读文案（口径照 2.5D 的 toast，不新增规则）。
func _act_reason(reason: String) -> String:
	match reason:
		"meeting": return "会议进行中 · 操作暂不可用"
		"dead": return "你已经出局 · 幽灵只能做自己的剩余任务"
		"downed": return "你正濒死，无法操作（等人救 / 等天亮）"
		"detained": return "你正被保安押送拘留，无法操作"
		"ghost": return "幽灵状态只能做自己的剩余任务"
		"not_alien": return "这是异形专属能力（人类没有刀 / 不能钻管道 / 不能破坏）"
		"no_knife": return "本夜的刀已用完（每夜 1 把，天亮补）"
		"no_bullet": return "没有子弹 —— 圆桌领申请单，再去军械库换"
		"no_target": return "附近没有可作用的目标"
		"target_down": return "目标已经倒下 / 出局"
		"out_of_reach": return "距离太远，再靠近一点"
		"no_los": return "中间有墙 / 掩体挡着"
		"no_body": return "附近没有可拖 / 可报告的尸体或伤员（走近一点）"
		"not_dragging": return "你手上没有拖着尸体"
		"no_report_quota": return "报告次数已用完 / 本夜夜会已达上限"
		"sab_used": return "本夜已经破坏过一次了"
		"sab_room": return "这里不能破坏（中央会议室 / 已有故障）"
		"unknown_action": return "这个操作当前不可用"
		_: return "操作没有生效（%s）" % reason
	return "操作没有生效"


func _nearest_pipe_port(pos: Vector2) -> Dictionary:
	if extras == null:
		return {}
	var best: Dictionary = {}
	var best_d := INF
	for pp in extras.pipe_ports:
		var v: Vector3 = pp["pos"] as Vector3
		var d := Vector2(v.x - pos.x, v.z - pos.y).length()
		if d < best_d:
			best_d = d
			best = pp
	return best


func _nearest_device(pos: Vector2, owned_only: bool = false):
	if extras == null:
		return null
	var best = null
	var best_d := INF
	for dev in extras.devices:
		if not is_instance_valid(dev):
			continue
		# 电闸等非任务设备由 V 负责；F 只找任务设备（2.5D nearPoint 也只认任务点）。
		if dev.point_index < 0:
			continue
		if owned_only and (sim == null or not sim.can_do_task(dev.point_index)):
			continue
		var d := float(dev.reach_dist(Vector3(pos.x, 0.05, pos.y)))
		if d < best_d:
			best_d = d
			best = dev
	return best


func _nearest_breaker(pos: Vector2):
	if extras == null:
		return null
	var best = null
	var best_d := INF
	for dev in extras.devices:
		if not is_instance_valid(dev) or dev.point_index >= 0:
			continue
		var d := float(dev.distance_to(Vector3(pos.x, 0.05, pos.y)))
		if d < best_d:
			best_d = d
			best = dev
	return best


func _nearest_facility(pos: Vector2, kind: String) -> Dictionary:
	var best: Dictionary = {}
	var best_d := INF
	for f: Dictionary in map_data.get("facility", []):
		if String(f.get("kind", "")) != kind:
			continue
		var fp := Vector2(float(f.get("x", 0)), float(f.get("y", 0)))
		var d := fp.distance_to(pos)
		if d < best_d:
			best_d = d
			best = f
	return best


## 玩家与尸体/伤者之间的几何视线（2.5D collectInteractions 的 `visibleAt(bp)`）。
## 3D 没有迷雾锥，这里退到墙 + 掩体遮挡；至少在墙后不能隔墙搜尸/报告/施救。
func _body_visible_to_player(b: Dictionary) -> bool:
	if sim == null or player == null or b.is_empty():
		return false
	var bp: Vector2 = b.get("pos", Vector2.ZERO) if bool(b.get("alive", false)) \
		else b.get("bodyPos", Vector2.ZERO)
	var p := player.global_position
	return sim.los_now(p.x, p.z, bp.x, bp.y)


## --inputlog：每次按键打印「落在哪个分支 / 被谁挡住」，用于定位 E ≠ ESC 一类问题。
func _probe_input(k: String, note: String) -> void:
	if not input_log:
		return
	var st := "PLAY"
	if sim != null and not sim.meeting.is_empty():
		st = "MEETING"
	elif wheel != null and wheel.is_open():
		st = "WHEEL"
	elif _pipe_open:
		st = "PIPE"
	elif mg_layer != null and mg_layer.is_open():
		st = "MINIGAME"
	elif _info_open:
		st = "INFO"
	elif ui_panels != null and ui_panels.any_open():
		st = "PANEL"
	print("INPUTLOG key=%s state=%s mouse=%d ui_locked=%s note=%s" % [
		k, st, int(Input.mouse_mode),
		str(bool(player.ui_locked) if player != null else false), note])


## 键位拆分真源：一个交互项只认一个专用键，E 只兜底。
## 2.5D 的现实是「交互不多但全塞在 E 上」，3D 按距离手边最近的语义拆开。
const _OFFER_KEY_KEYS := ["F", "R", "G", "Q", "V", "B", "C"]

## 2.5D 各交互的半径是分开的（js/game.js nearPoint / nearPipe / nearSupply / nearMonitor）。
## 3D 旧版把它们全折成 reach.fix(2.0)：任务点实际 2.6 就能开，玩家站在 2.0–2.6m
## 按 F 会「毫无反应」—— 这是现场「交互键有问题」的主因之一。
const TASK_NEAR_R := 2.6      # js/game.js:1059 nearPoint
const PIPE_NEAR_R := 1.6      # js/game.js:911 nearPipe
const SUPPLY_NEAR_R := 1.7    # js/game.js:1000 nearSupply
const MONITOR_NEAR_R := 1.8   # js/game.js:1018 nearMonitor


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


## 轮盘最多 8 项（ui_wheel.MAX_SLOTS）。旧版按收集顺序截断：站在尸体 + 补给 +
## 机器人旁边时，排在后面的「施救 / 搜尸」会被静默丢掉（现场"没有施救选项"）。
## 这里按行动价值排序，保证关键项先占位；E 的键位匹配仍用原数组。
func _ranked_offers(offers: Array) -> Array:
	var out := offers.duplicate()
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return _offer_rank(String(a.get("id", ""))) < _offer_rank(String(b.get("id", ""))))
	return out


const _OFFER_RANK := {
	"revive": 0, "task": 1, "report": 2, "search": 3, "fix": 4, "drag": 5,
	"inspect": 6, "attack": 7, "supply": 8, "req": 9, "pipe": 10, "breaker": 11,
	"cams": 12, "sabotage": 13, "bot": 14,
}


func _offer_rank(id: String) -> int:
	for k: String in _OFFER_RANK:
		if id.begins_with(k):
			return int(_OFFER_RANK[k])
	return 15


## 键位 → InputMap action（project.godot 是唯一真源）。改键只改 project.godot，
## 代码不再散落 KEY_F / KEY_G 字样；ACTION_FALLBACK 仅在工程未声明时兜底。
const ACTION_BINDINGS := {
	"E": "interact", "F": "facility", "R": "report", "G": "drag",
	"Q": "pipe", "V": "power", "B": "sabotage", "C": "cams",
}
const ACTION_FALLBACK := {
	"E": 69, "F": 70, "R": 82, "G": 71, "Q": 81, "V": 86, "B": 66, "C": 67,
}


func _action_keycode(k: String) -> int:
	var act := String(ACTION_BINDINGS.get(k, ""))
	if act != "" and InputMap.has_action(act):
		for ev in InputMap.action_get_events(act):
			if ev is InputEventKey:
				var pk := int((ev as InputEventKey).physical_keycode)
				if pk != 0:
					return pk
	return int(ACTION_FALLBACK.get(k, 0))


func _key_edge(k: String) -> bool:
	var code := _action_keycode(k)
	if code == 0:
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


## 2.5D stab():8300 的目标选择：人和机器人放在**同一次**「最近 + 视线」挑选里。
## 顺序照搬真源 —— 先扫人（bd 从 reach.knife 起），再扫机器人；
## 机器人只能用比人更近的距离挤进来，所以平手时人优先。
func _nearest_knife_any() -> Dictionary:
	if sim == null or sim.agents.is_empty():
		return {}
	var me: Dictionary = sim.me()
	var p: Vector2 = me.get("pos", Vector2.ZERO)
	var bd := SpaceData.num(space, "reach", "knife")
	var best: Dictionary = {}
	var bot_kind := ""
	for a: Dictionary in sim.agents:
		if int(a.get("i", -1)) == int(sim.me_idx):
			continue
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
				or bool(a.get("detained", false)):
			continue
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		var d := p.distance_to(ap)
		if d < bd and sim.los_now(p.x, p.y, ap.x, ap.y):
			bd = d
			best = a
			bot_kind = ""
	if sim.bots != null:
		for kind: String in ["secbot", "medbot"]:
			if sim.bots.is_dead(kind):
				continue
			var bp: Vector2 = sim.bots.pos_of(kind)
			var d2 := p.distance_to(bp)
			if d2 < bd and sim.los_now(p.x, p.y, bp.x, bp.y):
				bd = d2
				best = {}
				bot_kind = kind
	return {"agent": best, "bot": bot_kind}


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
	## 2.5D nearPoint(a)：2.6 格内最近的任务点；3D 用设备脚点距离。
	## 正常玩法只对“最近且属于自己的剩余任务”出 offer；测试模式 _sim_gate=false 全开。
	var nearest_task_dev = null
	var nearest_task_d := INF
	for cand in extras.devices:
		if not is_instance_valid(cand) or cand.point_index < 0:
			continue
		var cand_d = float(cand.reach_dist(pos))
		if cand_d <= TASK_NEAR_R and cand_d < nearest_task_d:
			nearest_task_d = cand_d
			nearest_task_dev = cand
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
			var atk_pick: Dictionary = _nearest_knife_any()
			var atk_tgt: Dictionary = atk_pick.get("agent", {})
			var atk_bot := String(atk_pick.get("bot", ""))
			if not atk_tgt.is_empty() or atk_bot != "":
				var atk_name := String(atk_tgt.get("name", "")) if atk_bot == "" \
					else ("保安机器人" if atk_bot == "secbot" else "医疗无人机")
				var has_knife := int(me_a.get("knife", 0)) > 0
				out.append({
					"id": "attack",
					"label": ("出刀 · " + atk_name) if has_knife \
						else ("出刀（本夜刀已用完） · " + atk_name),
					"hint": ("左键同效 · 剩余刀 %d" % int(me_a.get("knife", 0))) if has_knife \
						else "天亮补 1 把",
					"accent": Color("#FF9E96"),
					"act": func() -> void: _player_knife(me_a, atk_tgt, atk_bot),
				})
	for dev in extras.devices:
		if not is_instance_valid(dev):
			continue
		if dev.point_index < 0:
			# 电闸用 2.5D 的 BREAKER_USE_R，不跟设备半径混用
			if dev.distance_to(pos) <= SpaceData.num(space, "reach", "breaker"):
				out.append(_breaker_offer(dev))
			continue
		if dev.reach_dist(pos) > TASK_NEAR_R:
			continue
		## 2.5D collectInteractions：先 nearPoint（最近的一个任务点），再判 mine
		## （me.tasks.slice(me.tIdx).indexOf(point) >= 0）。非自己的任务点不生成任何 offer。
		if _sim_gate:
			if dev != nearest_task_dev:
				continue
			if sim == null or sim.agents.is_empty() or not sim.can_do_task(dev.point_index):
				continue
		out.append({
			"id": "task-%d" % dev.point_index,
			"label": "做任务 · " + String(dev.task_label),
			"hint": "%.1fm" % dev.reach_dist(pos),
			"dev": dev,
			"act": func() -> void: _open_device(dev),
		})
	# 报告尸体：玩家靠近未报告的尸体时给 E 选项；AI 看到会自己报。
	if sim != null and not sim.agents.is_empty():
		var body: Dictionary = sim.body_near(Vector2(pos.x, pos.z),
			SpaceData.num(space, "reach", "body"))
		if not body.is_empty() and not bool(body.get("bodyReported", false)) \
				and _body_visible_to_player(body):
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
				if not _body_visible_to_player(dead2):
					continue
				# 2.5D：已经被别人拖着 / 自己正拖着时不重复生成拖拽项（自己那项在上面）。
				var db2: Variant = dead2.get("draggedBy", null)
				if db2 != null and int(db2) >= 0:
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

	# 搜尸：站桩 STAND.search 秒后转移随身物资。2.5D searchBody：濒死者也能搜；
	# 已搜过的死者只有身上还有剩余物资时才可再搜（搜的人当时子弹/包已满）。
	if sim != null:
		for dead: Dictionary in sim.agents:
			if bool(dead.get("alive", false)) and not bool(dead.get("downed", false)):
				continue
			if bool(dead.get("bodyGone", false)) or String(dead.get("deathCause", "")) == "vote":
				continue
			if bool(dead.get("searched", false)) \
					and (bool(dead.get("alive", false)) or not sim.body_has_loot(dead)):
				continue
			var bp: Vector2 = dead.get("pos", Vector2.ZERO) if bool(dead.get("alive", false)) \
				else dead.get("bodyPos", Vector2.ZERO)
			if bp.distance_to(Vector2(pos.x, pos.z)) > SpaceData.num(space, "reach", "body"):
				continue
			if not _body_visible_to_player(dead):
				continue
			var body_i := int(dead.get("i", -1))
			out.append({
				"id": "search-%d" % body_i,
				"label": ("查看伤情 · " if bool(dead.get("alive", false)) else "搜尸 · ") \
					+ String(dead.get("name", "?")),
				"hint": "站桩 %.0fs · 取得随身物资" % SpaceData.num(space, "stand", "search"),
				"accent": Color("#B9F5DA"),
				"act": func() -> void: _start_station("搜尸",
					SpaceData.num(space, "stand", "search"),
					func() -> void: _on_search_done(body_i)),
			})
	# 管道：2.5D 是异形专用（人类管道禁用）。判定真源是 sim.me().alien，
	# 不是开始页的 role 字符串 —— 双源会让「按键合法但能力没有」（PLAN §三）。
	if sim != null and not sim.agents.is_empty() and bool(sim.me().get("alien", false)):
		for pp in extras.pipe_ports:
			var d := Vector2((pp["pos"] as Vector3).x - pos.x, (pp["pos"] as Vector3).z - pos.z).length()
			if d > PIPE_NEAR_R:
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
		if ds > SUPPLY_NEAR_R:
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
			if not downed.is_empty() and _body_visible_to_player(downed):
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
			if not _body_visible_to_player(b):
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
		if mp.distance_to(Vector2(pos.x, pos.z)) > MONITOR_NEAR_R:
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
		# @src js/game.js:1134 pickSabRoom：选目标时提示「进入舱室自动下手」，
		# 由 sim.sab_tick() 抵达引爆；已在房间内则当场结算，保持 3D 交互手感。
		if sim.sab_target.is_empty():
			_toast("已破坏 " + sim.room_name(room_id) + " · 30 秒内未修复将倒扣维修进度")
		else:
			_toast("破坏目标：" + sim.room_name(room_id) + " · 进入舱室自动下手")
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
	if (bool(sim.dev) or bool(sim.spectator)) and kb >= 0 \
			and kb != int(b.get("i", -1)):
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
	var me_cam: Dictionary = sim.me()
	if not bool(me_cam.get("alive", false)) or bool(me_cam.get("downed", false)) \
			or bool(me_cam.get("detained", false)):
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
	# 2.5D：会议 / 信息面板打开时世界冻结，站桩不推进（也不会在会议里偷偷完成）；
	# 只有真实移动输入才中断站桩。
	if sim != null and (not sim.meeting.is_empty() or _info_open or _pipe_open \
			or (mg_layer != null and mg_layer.is_open()) \
			or (wheel != null and wheel.is_open()) \
			or (ui_panels != null and ui_panels.any_open())):
		return
	if sim != null:
		var me_st: Dictionary = sim.me()
		if me_st.is_empty() or bool(me_st.get("downed", false)) \
				or bool(me_st.get("detained", false)):
			station = {}
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
		_toast("正在拖动尸体 · 移动变慢，再按 G 放下")
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
	# 2.5D openPipePick():898 `!me.alien&&!designMode` 拒绝；判定真源是 sim.me().alien。
	if sim == null or not bool(sim.me().get("alien", false)):
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


func _player_knife(me: Dictionary, forced: Dictionary = {}, forced_bot: String = "") -> void:
	# 2.5D attack():8271 的门槛是 me.alien；旧版 `role != "alien" and not me.alien`
	# 让「开始页选异形但 sim 里不是异形」也能出刀，是双源漏洞。
	if not bool(me.get("alien", false)):
		_probe("出刀 × 人类没有刀")
		_toast("人类没有刀 —— 右键开枪，子弹在军械库换")
		return
	if _knife_cd > 0.0:
		_probe("出刀 × 冷却 %.1fs" % _knife_cd)
		_toast("出刀冷却中（%.1fs）" % _knife_cd)
		return
	# 刀数校验通过就先把手上动作播出去：挥空也要有动作，
	# 否则玩家从自己视角看就是「按了左键什么也没发生」（2026-11-11 反馈）。
	if player != null:
		player.play_knife_swing()
	# E 轮盘带的是「2.5D stab() 的最近目标」；左键没带目标才走准星。
	# 目标选择属输入映射差异（3D 第一人称），规则判定一律交给 sim.can_act。
	var tgt: Dictionary = forced
	var bot_kind := forced_bot
	if tgt.is_empty() and bot_kind == "":
		var pick: Dictionary = _nearest_knife_any()
		tgt = pick.get("agent", {})
		bot_kind = String(pick.get("bot", ""))
	# 2.5D stab():8300：机器人也是合法目标 —— 守卫交 can_act("knife_bot")，
	# 结算交 knife_bot（1.8 格 / LOS / 刀数 / 红身 / 保安转向全在 sim 里）。
	if bot_kind != "":
		var bchk: Dictionary = sim.can_act("knife_bot", {"actor": int(sim.me_idx),
			"bot": bot_kind})
		var breason := String(bchk.get("reason", ""))
		if not bool(bchk.get("ok", false)):
			_probe("出刀 × can_act(knife_bot) 拒绝 " + breason)
			_toast("刀锋够不到 —— 再靠近" if breason == "no_target" \
				else _act_reason(breason))
			_knife_hit_fx(false)
			return
		if not sim.knife_bot(bot_kind, int(sim.me_idx)):
			_probe("出刀 × 机器人结算拒绝")
			_toast("这一刀没有砍到机器人")
			_knife_hit_fx(false)
			return
		_knife_cd = 1.2
		var bname := "保安机器人" if bot_kind == "secbot" else "医疗无人机"
		_probe("出刀 → " + bname + " · 装甲受击")
		_toast("出刀 · " + bname + " 装甲受击 · 刀数 -1")
		_knife_hit_fx(true)
		return
	# 机制对齐（PLAN §4.2）：能否出刀只有 sim.can_act("knife") 一处判定，
	# 玩家与 AI 同源；旧版在 main.gd 又抄了一遍刀数/存活/距离/LOS，容易漂移。
	var chk: Dictionary = sim.can_act("knife", {"actor": int(sim.me_idx),
		"victim": int(tgt.get("i", -1))})
	var reason := String(chk.get("reason", ""))
	if not bool(chk.get("ok", false)):
		_probe("出刀 × can_act 拒绝 " + reason)
		_toast("刀锋够不到 —— 再靠近" if reason == "no_target" \
			else _act_reason(reason))
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
	if _shot_cd > 0.0:
		_probe("开枪 × 冷却 %.1fs" % _shot_cd)
		_toast("开枪冷却中（%.1fs）" % _shot_cd)
		return
	# 2.5D shoot()：射程内取最近、losNow、且 visibleAt 的目标 —— 同样是「最近」，
	# 不是准星锥。目标选择属输入映射差异，规则判定交给 sim.can_act("shoot")。
	var tgt := _nearest_shot_target(SpaceData.num(space, "shoot", "range"))
	var chk: Dictionary = sim.can_act("shoot", {"actor": int(sim.me_idx),
		"victim": int(tgt.get("i", -1))})
	var reason := String(chk.get("reason", ""))
	if not bool(chk.get("ok", false)):
		_probe("开枪 × can_act 拒绝 " + reason)
		_toast("射程内没有对准的目标" if reason == "no_target" \
			else _act_reason(reason))
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
	# 卡墙兜底需要网格真源：玩家物理与 AI 网格同读一份 nav（交接 P0 根因 2）。
	if player.nav == null and sim != null and sim.nav != null:
		player.nav = sim.nav
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
	## 2026-11-13：轮盘 / 尸检-监控信息面板 / 设置-复盘面板同样要算进来 ——
	## 旧版只算 pipe+minigame，打开轮盘或尸检卡后下一帧就被重写成 false，
	## 玩家能一边选交互项一边走动，交互手感像"按键失灵"。
	var ui_open: bool = _pipe_open or _info_open \
		or (mg_layer != null and bool(mg_layer.is_open())) \
		or (wheel != null and wheel.is_open()) \
		or (ui_panels != null and ui_panels.any_open())
	player.ui_locked = held or bool(me.get("downed", false)) \
		or (not sim.meeting.is_empty()) or ui_open or sim.over
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


## ESC 单一出口（PLAN §六）：只关最上层 UI / 释放鼠标，永不退出游戏、永不重开。
## 旧版 ESC 散在 5 个分支（设置面板 / 信息层 / 管道 / 轮盘 / 鼠标释放），
## 互相抢事件，实机出现「按 E 像 ESC 退出」。现在所有解释只此一处。
func _close_topmost() -> void:
	if ui_panels != null and ui_panels.any_open():
		ui_panels.close_all()
		return
	if _info_open:
		_close_info()
		return
	if wheel != null and wheel.is_open():
		wheel.cancel()
		return
	if _pipe_open:
		_close_pipe_ui()
		return
	if mg_layer != null and mg_layer.is_open():
		mg_layer.cancel()
		return
	if sim != null and not sim.meeting.is_empty():
		_toast("会议进行中 · Esc 只释放鼠标")
	mouse_released = not mouse_released
	_refresh_mouse_mode()


func _input(event: InputEvent) -> void:
	if _screenshot_mode:
		return
	if sim == null or not started:
		return
	## F2 = DEV（2.5D js/game.js:7928）：设置面板之外一律可用，会议/轮盘/信息面板都不挡。
	if event is InputEventKey and (event as InputEventKey).pressed \
			and not (event as InputEventKey).echo \
			and (event as InputEventKey).keycode == KEY_F2:
		sim.dev = not bool(sim.dev)
		# 打开时把旧拦截记录视为已读：不要一开 DEV 就吐一屏历史 toast。
		_dev_log_n = sim.dev_log.size() if bool(sim.dev) else 0
		_refresh_dev_panel()
		_toast("DEV 透视：开（F3 文字总览）" if bool(sim.dev) else "DEV 透视：已关闭")
		_probe("F2 → DEV %s" % ("开" if bool(sim.dev) else "关"))
		get_viewport().set_input_as_handled()
		return
	## F3 = 旧的右侧文字总览（默认隐藏，避免常驻面板占屏幕右侧 1/3）。
	if event is InputEventKey and (event as InputEventKey).pressed \
			and not (event as InputEventKey).echo \
			and (event as InputEventKey).keycode == KEY_F3:
		text_dev_open = not text_dev_open
		_refresh_dev_panel()
		_toast("DEV 文字总览：开" if text_dev_open else "DEV 文字总览：关（F2 透视仍在）")
		get_viewport().set_input_as_handled()
		return
	## ESC 只走单一出口；同一帧内打开 UI 的那个键不允许顺手关掉它。
	if event is InputEventKey and (event as InputEventKey).pressed \
			and not (event as InputEventKey).echo \
			and (event as InputEventKey).keycode == KEY_ESCAPE:
		_probe_input("ESC", "_close_topmost")
		_close_topmost()
		get_viewport().set_input_as_handled()
		return
	## 设置 / 复盘面板在最上层（2.5D 的 SKSettings.isOpen() 守卫）：
	## 只允许 P 关闭（ESC 已统一处理），其余按键一律不落到对局。
	if ui_panels != null and ui_panels.any_open():
		if event is InputEventKey and (event as InputEventKey).pressed \
				and (event as InputEventKey).keycode == KEY_P:
			ui_panels.close_all()
			get_viewport().set_input_as_handled()
		return
	## 信息面板（尸检记录 / 全船监控）/ 管道出口列表在最上层：只剩 ESC（已统一处理），
	## 其余按键不落到对局（对应 2.5D 的 G.inspect / G.camView / G.pipePick 输入屏蔽）。
	if _info_open or _pipe_open:
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


func _sim_check(r: Dictionary, cond: bool, name: String) -> void:
	if cond:
		r["pass"] = int(r["pass"]) + 1
	else:
		r["fail"] = int(r["fail"]) + 1
		(r["fails"] as Array).append(name)
		print("SIMTEST FAIL ", name)


func _run_ceilshot(room_id: String) -> void:
	## new_game 会开 MEET_PRE：不先走完，开局公开讨论面板会把整张截图挡住
	## （2026-11-12 实拍踩到，口径与其他自测 _finish_meeting 一致）。
	_finish_meeting(sim)
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
