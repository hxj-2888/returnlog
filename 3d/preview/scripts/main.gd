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
const PauseLayerScript := preload("res://scripts/ui/pause_layer.gd")
const DevPanelUi := preload("res://scripts/ui/dev_panel.gd")
const HudView := preload("res://scripts/ui/hud_view.gd")
const UIStyle := preload("res://scripts/ui/ui_style.gd")
const MeetingView := preload("res://scripts/ui/meeting_view.gd")
const ModalPanels := preload("res://scripts/ui/modal_panels.gd")
const FxView := preload("res://scripts/fx_view.gd")
const Keymap := preload("res://scripts/keymap.gd")
const MinimapScript := preload("res://scripts/minimap.gd")
const MinigameData := preload("res://scripts/minigame/mg_data.gd")
const AudioScript := preload("res://scripts/audio.gd")
const InteractionCtrl := preload("res://scripts/interaction_ctrl.gd")
const CombatCtrl := preload("res://scripts/combat_ctrl.gd")
const TestDispatch := preload("res://scripts/test_dispatch.gd")

const KINDS := ["wire", "place", "lever", "plate"]


## F2 的 FPS 式 DEV 透视（PLAN §五）：屏幕空间方框 + 名牌，穿墙可见，>25m 不画。
## 只读 sim 与相机，不参与任何判定；F3 仍保留旧的文字总览。
class EspCanvas extends Control:
	var host: Node
	var f: FontFile

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		f = UIFont.get_font()

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
var modal_layer: CanvasLayer
var toast_layer: CanvasLayer
var hud_bg: PanelContainer
var prog_bar: ProgressBar
var role_label: Label
var task_rows: VBoxContainer
var dmg_panel: PanelContainer
var dmg_label: Label
var tip_panel: PanelContainer
var station_panel: PanelContainer
var station_bar: ProgressBar
var station_label: Label
var drag_btn: Button
var cd_panel: PanelContainer
var cd_label: Label

## ---- 战斗声画表现层 ----
var fx_layer: CanvasLayer
var combat_hud: Control
var combat_fx_3d: Node3D
var crew_combat_fx: Node3D
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
var _say_cd_until_ms := 0
## 门禁用：devicetest / e2e 要打开任意设备，不受“只做自己的任务”限制。
var _sim_gate := true
## 玩家攻击冷却（出刀 / 开枪各自一份，避免一帧连点把全船打空）
var _knife_cd := 0.0
var _shot_cd := 0.0
var _detained_toast := false
## 管道冷却与出口选择 UI
var _pipe_cd := 0.0
var pipe_panel: ColorRect
var pipe_buttons: Container
var pipe_hint: Label
var _pipe_open := false
var _pipe_dests: Array = []

## 幽灵态：死亡后不弹结算面板，改为提示一次并继续以幽灵身份玩。
var _ghost_toast := false
## 正在进行的故障维修小游戏对应舱室（队友修完或超时时自动取消）
var _active_fix_room := ""
## 上一帧存活标记：捕获刚死亡一瞬的小游戏打断，不阻止幽灵后续开启幽灵任务
var _was_alive_for_mg := true
## 交互键位拆分的按键边沿状态（F/R/G/Q/V/B/C + 1-9 直选）
var _keys_down: Dictionary = {}
## --inputlog：打印每一次按键落到哪个分支 / 被谁挡住（PLAN §六 的埋点）。
var input_log := false
## 能力兜底调用计数（--abilitytest 断言「按键确实进了能力入口」，不是被静默吞掉）。
var _fallback_count := 0

var power_on := true
## 视图层已应用的灯态；sim.light_state 变化时安静重刷场景灯（跨夜/电路修复）。
var _light_applied := 0

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
## 2026-11-16：ESC 暂停（R4.2）。2.5D togglePause 冻结世界并显示暂停层；
## 3D 之前 ESC 只释放鼠标、没有暂停，等同少了一个玩家能力。
var paused := false
var pause_layer
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
var info_sub: Label
var info_rows: VBoxContainer
var info_text: RichTextLabel
var info_loot_btn: Button
var _info_open := false
var spectator_mode := false
var audio
var _last_event_n := 0
## 2.5D SND.work 的节流
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
	var args := OS.get_cmdline_user_args()
	_screenshot_mode = TestDispatch.has_screenshot_arg(args)
	input_log = args.has("--inputlog")
	_init_world()
	_init_sim_and_player(args)
	if args.has("--devicelist"):
		TestDispatch.print_devicelist(self)
		return
	_build_hud()
	_build_fx()
	if await TestDispatch.dispatch_early_shots(self, args):
		return
	_init_panels_and_audio()
	_boot_mode(args)
	await TestDispatch.dispatch(self, args)


func _init_world() -> void:
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


func _init_sim_and_player(args: PackedStringArray) -> void:
	var crew_model_mode := not args.has("--crew-billboard")
	sim = SimStateScript.new()
	var seed_arg := _arg_value(args, "--seed")
	var seed_val := int(seed_arg) if seed_arg != "" else 20261108
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
		player.ui_locked = true
		mouse_released = true
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func _init_panels_and_audio() -> void:
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
	ui_panels.music_changed.connect(func(v: float) -> void: audio.set_music_volume(v))
	ui_panels.sfx_changed.connect(func(v: float) -> void: audio.set_volume(v))
	audio.set_music_volume(ui_panels.get_music())
	audio.set_listener(Vector2(player.global_position.x, player.global_position.z))
	if crew_view != null:
		crew_view.set_audio(audio)
	player.stepped.connect(_on_player_stepped)
	if extras != null:
		extras.door_auto.connect(_on_door_auto)


func _boot_mode(args: PackedStringArray) -> void:
	if not TestDispatch.has_gate_arg(args):
		_show_home()
	else:
		var role_arg := _arg_value(args, "--role")
		if role_arg != "":
			_on_start(role_arg)


func _arg_value(args: PackedStringArray, key: String) -> String:
	return TestDispatch.arg_value(args, key)


func _update_spectator_view() -> void:
	if builder == null or player == null:
		return
	var hide: bool = player.spectator \
		and player.global_position.y > builder.ceiling_height() - 0.15
	if hide != _ceil_hidden:
		_ceil_hidden = hide
		builder.set_ceiling_visible(not hide)


func _tap_key(key: Key) -> void:
	await TestDispatch.tap_key(self, key)


func _tap_mouse(btn: MouseButton) -> void:
	await TestDispatch.tap_mouse(self, btn)


func _click_ctrl(b: Control) -> bool:
	return TestDispatch.click_ctrl(self, b)


func _count_why(w: Dictionary, target_i: int, kind: String) -> int:
	var n := 0
	for e: Variant in ((w.get("why", {}) as Dictionary).get(target_i, []) as Array):
		if String((e as Dictionary).get("kind", "")) == kind:
			n += 1
	return n


func _press_escape() -> void:
	TestDispatch.press_escape()


func _why_has(w: Dictionary, target_i: int, reason: String) -> bool:
	var why: Dictionary = (w.get("why", {}) as Dictionary)
	for e: Variant in (why.get(target_i, []) as Array):
		if String((e as Dictionary).get("reason", "")) == reason:
			return true
	return false


func _finish_meeting(s) -> void:
	TestDispatch.finish_meeting(s)


func _ability_reset() -> int:
	return TestDispatch.ability_reset(self)


func _add_floor_collision() -> void:
	var body := StaticBody3D.new()
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = Vector3(120.0, 1.0, 120.0)
	collision.shape = shape
	body.position = Vector3(49.0, -0.5, 47.0)
	body.add_child(collision)
	add_child(body)


func _build_fx() -> void:
	FxView.build(self)


func _knife_hit_fx(hit: bool, at: Vector3 = Vector3.ZERO,
		is_bot: bool = false, actor_pos: Vector3 = Vector3.ZERO) -> void:
	FxView.knife_hit_fx(self, hit, at, is_bot, actor_pos)


func _tick_fx(delta: float) -> void:
	FxView.tick_fx(self, delta)


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
	FxView.tick_darkness(self, delta)


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
	var font := UIFont.get_font()
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
	CombatCtrl.tick_knife_view(self)


func _build_hud() -> void:
	HudView.build(self)


func _build_dev_panel() -> void:
	DevPanelUi.build(self)


func _refresh_dev_panel() -> void:
	DevPanelUi.refresh(self)


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


func _label(text: String, pos: Vector2, size: int, _font: Font) -> Label:
	var label := UIStyle.label(text, size, Color.WHITE, true)
	label.position = pos
	return label


func _has_kind(sim_obj, kind: String) -> bool:
	for e: Dictionary in sim_obj.events:
		if String(e.get("kind", "")) == kind:
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
	var gmode: String = home.selected_mode if home != null else "classic"
	if home != null:
		home.get_parent().queue_free()
		home = null
	started = true
	audio.play_music()
	spectator_mode = p_role == "spect" or p_role == "design"
	role = "alien" if p_role == "alien" else "human"
	if not sim.new_game(_cur_seed, 0, map_data, space, role == "alien" and not spectator_mode, gmode):
		push_error("开始页开局失败：先跑 node 3d/tools/export-sim.cjs")
		return
	HomeViewScript.apply_roster(sim)
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
	_active_fix_room = ""
	_was_alive_for_mg = true
	if end_panel != null:
		end_panel.visible = false
	if settle_panel != null:
		settle_panel.visible = false
	if crew_view != null:
		crew_view.build(sim)
	if combat_fx_3d != null:
		combat_fx_3d.clear_pools()
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


## 会议面板（实现已迁至 scripts/ui/meeting_view.gd，这里仅保留薄转发与测试契约）。
func _build_meeting_ui() -> void:
	MeetingView.build(self)


func _meeting_template_defs() -> Array:
	return MeetingView.template_defs()


func _meet_template_text(kind: String, t: Dictionary, rid: String, when := "") -> String:
	return MeetingView.template_text(self, kind, t, rid, when)


func _meeting_can_act_now() -> bool:
	return MeetingView.can_act_now(self)


func _refresh_meeting_ui() -> void:
	MeetingView.refresh(self)


## 席位标签：补零席位号 + 空格 + 名字。
func _tag_name(i: int) -> String:
	if i < 0:
		return "—"
	var a: Dictionary = sim.agent(i)
	if a.is_empty():
		return "—"
	return "%02d %s" % [i + 1, String(a.get("name", "?"))]


func _process(delta: float) -> void:
	# @src js/game.js:2831 loop：真源 `dt=Math.min(0.05,…)`。3D 旧版把未钳制的 delta
	# 直接灌进 sim.tick / 站桩 / 会议，切窗口或掉帧后单帧会顶掉整夜时间（人机偶现卡死）。
	delta = minf(delta, 0.05)
	if player == null:
		return
	# 开始页还开着：不推进模拟、不刷 HUD，画面停在开局那一帧。
	if not started:
		return
	# 2.5D togglePause：暂停时世界完全冻结（时钟 / AI / 站桩 / 事件全不推进），
	# 只保留渲染与暂停层。输入在 _input 里被暂停分支挡住。
	if paused:
		return
	if minimap != null:
		minimap.player_pos = Vector2(player.global_position.x, player.global_position.z)
		minimap.player_yaw = player.rotation.y
		minimap.player_spectator = player.spectator
	if builder != null and builder.has_method("update_shadows"):
		builder.update_shadows(player.global_position)
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
		if not sim.meeting.is_empty() or (meeting_panel != null and meeting_panel.visible):
			_refresh_meeting_ui()
		_sim_hud_timer -= delta
		if _sim_hud_timer <= 0.0:
			_sim_hud_timer = 0.25
			_refresh_sim_hud()
	_update_interaction(delta)
	HudView.tick_live(self)
	_poll_dev_log()
	# F2 透视按 4 帧节流（官方：无需每帧重绘）；F3 文字总览仍按 0.5s 刷新。
	if esp_canvas != null:
		esp_canvas.visible = sim != null and (bool(sim.dev) or bool(sim.spectator))
		if esp_canvas.visible and Engine.get_process_frames() % 4 == 0:
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
	var cur_room := _room_name_at(player.global_position)
	room_label.text = cur_room
	if minimap != null:
		minimap.room_name_text = cur_room
	if fps_label != null:
		fps_label.text = "%d FPS" % Engine.get_frames_per_second()
		fps_label.visible = sim != null and bool(sim.dev)


func _build_info_panel() -> void:
	ModalPanels.build_info(self)


func _open_info(title: String, lines: Array) -> void:
	ModalPanels.open_info(self, title, lines)


func _close_info() -> void:
	ModalPanels.close_info(self)


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


func _update_interaction(delta: float) -> void:
	InteractionCtrl.update_interaction(self, delta)


func _fallback_action(k: String, offers: Array) -> void:
	InteractionCtrl.fallback_action(self, k, offers)


func _act_reason(reason: String) -> String:
	return InteractionCtrl.act_reason(reason)


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


func _offer_key(id: String) -> String:
	return InteractionCtrl.offer_key(id)


func _ranked_offers(offers: Array) -> Array:
	return InteractionCtrl.ranked_offers(offers)


func _nearest_knife_any() -> Dictionary:
	return CombatCtrl.nearest_knife_any(self)


func _collect_offers() -> Array:
	return InteractionCtrl.collect_offers(self)


func _open_body_card(body_i: int) -> void:
	ModalPanels.open_body_card(self, body_i)


func _open_cams() -> void:
	ModalPanels.open_cams(self)


func _breaker_offer(dev) -> Dictionary:
	return InteractionCtrl.breaker_offer(self, dev)


func _round_table_cover() -> Dictionary:
	return InteractionCtrl.round_table_cover(self)


func _start_station(label: String, dur: float, done: Callable) -> void:
	InteractionCtrl.start_station(self, label, dur, done)


func _tick_station(delta: float) -> void:
	InteractionCtrl.tick_station(self, delta)


func _on_breaker_done() -> void:
	set_power(not power_on)


func _claim_qual_now() -> void:
	InteractionCtrl.claim_qual_now(self)


func _on_claim_done() -> void:
	InteractionCtrl.on_claim_done(self)


func _on_drag_drop() -> void:
	InteractionCtrl.on_drag_drop(self)


func _on_hit_bot(kind: String) -> void:
	CombatCtrl.on_hit_bot(self, kind)


func _on_take_body_loot(body_i: int) -> void:
	InteractionCtrl.on_take_body_loot(self, body_i)


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
	ModalPanels.build_pipe(self)


func _open_pipe_ui(from: Dictionary) -> void:
	ModalPanels.open_pipe(self, from)


func _close_pipe_ui() -> void:
	ModalPanels.close_pipe(self)


func _travel_pipe(to: Dictionary) -> void:
	ModalPanels.travel_pipe(self, to)


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
	_light_applied = st
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
		_toast("配电已修复 · 全船照明恢复")
	else:
		_toast("已合闸 · 全船恢复照明")


func _refresh_power_hud() -> void:
	HudView.refresh_power(self)


func _toast(text: String) -> void:
	if toast_label == null:
		return
	toast_label.text = text
	toast_label.visible = true
	_toast_t = 2.6


func _open_device(dev) -> void:
	if sim != null and float(sim.room_out.get(dev.room_id, 0.0)) > 0.0:
		_toast("该舱室断电：小游戏无法启动")
		return
	if _sim_gate and sim != null and not sim.agents.is_empty() and not sim.can_do_task(dev.point_index):
		_toast("「%s」不是你现在的任务（看任务列表）" % String(dev.task_label))
		return
	player.ui_locked = true
	_focus_cam_on(dev)
	mg_layer.open(dev.kind, dev.task_label, dev.tier, dev.task_label,
		func() -> void: _on_device_done(dev),
		func() -> void: _close_device())


## 维修故障小游戏入口：取故障绑定点或该舱室首个任务点决定玩法与难度档
func _open_fix_minigame(dmg: Dictionary) -> void:
	var rid := String(dmg.get("room", ""))
	var pts: Array = map_data.get("points", [])
	var pt: Dictionary = {}
	var pt_idx := int(dmg.get("pt", -1))
	if pt_idx >= 0 and pt_idx < pts.size():
		pt = pts[pt_idx]
	else:
		for p: Dictionary in pts:
			if String(p.get("room", "")) == rid:
				pt = p
				break
	var pt_label := String(pt.get("label", ""))
	var pt_kind := String(pt.get("kind", ""))
	var mg_data := MinigameData.load_data()
	var kind := MinigameData.kind_for(mg_data, "fix", pt_label)
	var tier := "circuit" if pt_label == "电路维修" else ("hard" if pt_kind == "hard" else "normal")
	var room_title: String = String(sim.room_name(rid)) if sim != null else rid
	player.ui_locked = true
	_active_fix_room = rid
	mg_layer.open(kind, pt_label, tier, "维修故障 · " + room_title,
		func() -> void:
			_active_fix_room = ""
			_close_device()
			if sim != null and sim.fix_damage(rid, int(sim.me_idx)):
				_refresh_sim_hud()
				_toast("故障已修复：" + sim.room_name(rid)),
		func() -> void:
			_active_fix_room = ""
			_close_device())


## 拉闸 / 合闸小游戏入口：统一走 lever 拉杆玩法
func _open_breaker_minigame(dev, label: String) -> void:
	player.ui_locked = true
	_focus_cam_on(dev)
	mg_layer.open("lever", "", "normal", label,
		func() -> void:
			_close_device()
			_on_breaker_done(),
		func() -> void:
			_close_device())


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
	# 真源 finishDoing 在**未断电**时也要把灯切到全亮（light_state=1）；
	# 旧版只在断电时调 set_power，常态下修好电路画面始终是暗的。
	if bool(res.get("power_fix", false)):
		apply_light_state(int(sim.light_state))
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
	CombatCtrl.handle_attack(self, btn)


func _player_knife(me: Dictionary, forced: Dictionary = {}, forced_bot: String = "") -> void:
	CombatCtrl.player_knife(self, me, forced, forced_bot)


func _player_fire(me: Dictionary) -> void:
	CombatCtrl.player_fire(self, me)


func _aim_target(max_d: float, min_dot: float) -> Dictionary:
	return CombatCtrl.aim_target(self, max_d, min_dot)


func _play_new_events() -> void:
	CombatCtrl.play_new_events(self)


## 更新听者坐标并触发做任务时的 SND.work 音效；脚步声已迁至 player.stepped 与 crew_motion_fx。
func _audio_tick(delta: float) -> void:
	if audio == null or player == null:
		return
	var me_pos := Vector2(player.global_position.x, player.global_position.z)
	audio.set_listener(me_pos)
	if sim == null or not sim.meeting.is_empty() or sim.over:
		return
	_work_cd -= delta
	if _work_cd <= 0.0:
		_work_cd = 0.9
		if not station.is_empty() or (mg_layer != null and mg_layer.is_open()):
			audio.play_at("work", me_pos, 0.55)


func _on_player_stepped(_pos: Vector2, scale: float, is_left: bool) -> void:
	if audio == null or not started or paused:
		return
	if sim != null and (not sim.meeting.is_empty() or sim.over):
		return
	var sc: float = scale
	if sim != null and int(sim.me().get("drag", -1)) >= 0:
		sc = minf(sc, 0.30)
	audio.play_step(null, sc, is_left)


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
	## 小游戏/轮盘/信息/设置面板开着都锁输入，否则每帧被写回 false 会边走边解题。
	## @src js/game.js:2883 update：倒地/被押/死亡立刻收掉遮罩，避免卡在面板里（偶现卡死）。
	var ui_open: bool = _pipe_open or _info_open \
		or (mg_layer != null and bool(mg_layer.is_open())) \
		or (wheel != null and wheel.is_open()) \
		or (ui_panels != null and ui_panels.any_open())
	player.ui_locked = held or bool(me.get("downed", false)) \
		or (not sim.meeting.is_empty()) or ui_open or sim.over
	var alive_now := bool(me.get("alive", false))
	var downed_now := bool(me.get("downed", false))
	# 中断边界：倒地 / 被拘留 / 对局结束 / 刚死亡瞬间立即取消当前小游戏（不阻止幽灵后续自开任务）；
	# 维修期间若故障已被队友修完或超时消失，也立即取消并提示。
	if mg_layer != null and mg_layer.is_open():
		var just_died := _was_alive_for_mg and not alive_now
		if downed_now or held or sim.over or just_died:
			mg_layer.cancel()
		elif _active_fix_room != "":
			var dmg_still := false
			for d: Dictionary in sim.dmg:
				if String(d.get("room", "")) == _active_fix_room:
					dmg_still = true
					break
			if not dmg_still:
				_active_fix_room = ""
				mg_layer.cancel()
				_toast("故障已结束，停止维修")
	_was_alive_for_mg = alive_now
	# 逐帧清场：带着遮罩被打倒/被拘/阵亡会永远卡在面板里。
	if not alive_now or downed_now or held:
		if wheel != null and wheel.is_open(): wheel.cancel()
		if _info_open: _close_info()
		if _pipe_open: _close_pipe_ui()
	if held:
		if not _detained_toast:
			_detained_toast = true
			_toast("被保安机器人押送拘留 · 30 秒")
	else:
		_detained_toast = false


func _refresh_sim_hud() -> void:
	HudView.refresh_sim(self)


func _alive_count() -> int:
	return HudView.alive_count(self)


func _show_end() -> void:
	HudView.show_end(self)


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
		return
	# 2.5D togglePause 在 G.over 时直接返回：结算页 Esc 只放鼠标，不弹暂停层。
	if sim != null and sim.over:
		mouse_released = not mouse_released
		_refresh_mouse_mode()
		return
	# 2.5D togglePause：没有面板可关时，Esc = 暂停/继续（不是只放鼠标）。
	_toggle_pause()


## 2.5D togglePause（js/game.js:845）：冻结世界 + 显示暂停层；再按 Esc 继续。
func _toggle_pause() -> void:
	_ensure_pause_ui()
	paused = not paused
	if paused:
		mouse_released = true
		pause_layer.set_from_sim(sim)
		pause_layer.visible = true
		_toast("已暂停 · Esc 继续")
	else:
		pause_layer.visible = false
		mouse_released = false
	_refresh_mouse_mode()



## 暂停层（3D 自有表现；2.5D 的 #pause 是 DOM 层）。只做遮罩与提示，不改判定。
func _ensure_pause_ui() -> void:
	if pause_layer != null:
		return
	pause_layer = PauseLayerScript.new()
	pause_layer.resume_requested.connect(_toggle_pause)
	pause_layer.settings_requested.connect(func() -> void:
		if ui_panels != null:
			ui_panels.open_settings())
	pause_layer.restart_requested.connect(func() -> void:
		_restart_sim())
	pause_layer.exit_to_home_requested.connect(func() -> void:
		paused = false
		pause_layer.visible = false
		_exit_to_home())
	add_child(pause_layer)


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
	# 暂停时只认 Esc（上面已处理）；其余按键不落到对局，也不触发面板。
	if paused:
		if event is InputEventKey:
			get_viewport().set_input_as_handled()
		return
	## 信息面板（尸检记录 / 全船监控）/ 管道出口列表在最上层：管道支持 1-9 直选。
	if _pipe_open:
		if event is InputEventKey and (event as InputEventKey).pressed \
				and not (event as InputEventKey).echo:
			if ModalPanels.handle_pipe_digit(self, (event as InputEventKey).physical_keycode):
				get_viewport().set_input_as_handled()
		return
	if _info_open:
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
			# 2026-11-16：左右键在 InputMap 里是 attack / shoot 两个 action（唯一真源）。
			if event.is_action_pressed("attack"):
				_handle_attack(MOUSE_BUTTON_LEFT)
			elif event.is_action_pressed("shoot"):
				_handle_attack(MOUSE_BUTTON_RIGHT)
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
	_active_fix_room = ""
	_was_alive_for_mg = true
	_keys_down.clear()
	_down_toast = false
	# 新一局从「鼠标已被捕获」开始：结算页可能按过 Esc 释放，不能带进下一局。
	mouse_released = false
	if crew_view != null:
		crew_view.build(sim)
	if combat_fx_3d != null:
		combat_fx_3d.clear_pools()
	player.global_position = Vector3(31.0, 0.05, 33.5)
	player.rotation.y = -PI * 0.5
	# 重开必须清暂停态：否则结算页按过 Esc 后，新一局会停在冻结的暂停层。
	paused = false
	if pause_layer != null:
		pause_layer.visible = false
	_refresh_sim_hud()
	_toast("新一局 · seed %d" % next_seed)


func _sim_check(r: Dictionary, cond: bool, name: String) -> void:
	if cond:
		r["pass"] = int(r["pass"]) + 1
	else:
		r["fail"] = int(r["fail"]) + 1
		(r["fails"] as Array).append(name)
		print("SIMTEST FAIL ", name)

