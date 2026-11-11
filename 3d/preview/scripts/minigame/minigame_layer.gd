extends CanvasLayer

## 3D 任务小游戏遮罩：卡片壳 + 玩法内容 + 保底计时。
## 对应 2.5D 的 js/t2/minigame.js#open / tick / settle：
##   · 遮罩盖住大半屏（attention='ui'），只看得到卡片，看不到有人靠近；
##   · 没有限时：计时是**保底**，到点自动完成，不是到点清零；
##   · 中断 / 失败 = 进度清零，由 main.gd 取消站桩动作。

signal opened(kind: String)
signal closed(ok: bool)

const MinigameData := preload("res://scripts/minigame/mg_data.gd")
const MGBase := preload("res://scripts/minigame/mg_base.gd")
## 14 型与 2.5D 的 BUILD（js/t2/minigame.js:1097-1101）一一对应。
## 2026-11-10 撤掉 BASE_FALLBACK（sequence→match / sort→place / valve→lever / code→sync
## 的四型降级）—— 四种玩法已按真源补齐，再降级就是拿别的玩法冒充。
const BUILDERS := {
	"wire": preload("res://scripts/minigame/mg_wire.gd"),
	"place": preload("res://scripts/minigame/mg_place.gd"),
	"lever": preload("res://scripts/minigame/mg_lever.gd"),
	"sync": preload("res://scripts/minigame/mg_sync.gd"),
	"pour": preload("res://scripts/minigame/mg_pour.gd"),
	"swap": preload("res://scripts/minigame/mg_swap.gd"),
	"align": preload("res://scripts/minigame/mg_align.gd"),
	"aim": preload("res://scripts/minigame/mg_aim.gd"),
	"match": preload("res://scripts/minigame/mg_match.gd"),
	"level": preload("res://scripts/minigame/mg_level.gd"),
	"sequence": preload("res://scripts/minigame/mg_sequence.gd"),
	"sort": preload("res://scripts/minigame/mg_sort.gd"),
	"valve": preload("res://scripts/minigame/mg_valve.gd"),
	"code": preload("res://scripts/minigame/mg_code.gd"),
}

const COL_TEXT := Color("#DDE3EC")
const COL_DIM := Color("#8FA6C0")
const COL_GOLD := Color("#F0C674")
const COL_LINE := Color("#2A3240")
const COL_BG := Color("#12161E")
const COL_BAD := Color("#E08A86")
const COL_BTN := Color("#1D2530")

var _root: Control
var _card: PanelContainer
var _title: Label
var _counter: Label
var _clock: Label
var _progress: ProgressBar
var _tip: Label
var _hint: Label
var _cancel_btn: Button
var _body: VBoxContainer
var _content: Control

var _builder: Control
var _data: Dictionary = {}
var _kind := ""
var _limit := 10.0
var _elapsed := 0.0
var _settling := false
var _failed := false
var _cancel_fired := false
var _on_done: Callable
var _on_cancel: Callable


func _ready() -> void:
	layer = 20
	visible = false
	set_process(false)
	_build_shell()


func _build_shell() -> void:
	_root = Control.new()
	_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(_root)

	var dim := ColorRect.new()
	dim.color = Color(0.01, 0.02, 0.04, 0.62)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	_root.add_child(dim)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.add_child(center)

	_card = PanelContainer.new()
	_card.custom_minimum_size = Vector2(760, 520)
	_card.add_theme_stylebox_override("panel", _card_style())
	center.add_child(_card)

	var outer := VBoxContainer.new()
	outer.add_theme_constant_override("separation", 0)
	_card.add_child(outer)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 12)
	header.custom_minimum_size = Vector2(0, 42)
	outer.add_child(header)

	var pad := MarginContainer.new()
	pad.add_theme_constant_override("margin_left", 14)
	pad.add_theme_constant_override("margin_right", 14)
	header.add_child(pad)

	var head_row := HBoxContainer.new()
	head_row.add_theme_constant_override("separation", 10)
	pad.add_child(head_row)

	_title = _label("任务", 15, COL_GOLD)
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head_row.add_child(_title)

	_counter = _label("—", 11, COL_DIM)
	head_row.add_child(_counter)

	_clock = _label("保底 —", 11, COL_GOLD)
	head_row.add_child(_clock)

	_progress = ProgressBar.new()
	_progress.show_percentage = false
	_progress.custom_minimum_size = Vector2(0, 4)
	_progress.max_value = 100.0
	_progress.value = 0.0
	_progress.add_theme_stylebox_override("background", _flat(Color("#222833"), 0))
	_progress.add_theme_stylebox_override("fill", _flat(COL_GOLD, 0))
	outer.add_child(_progress)

	_body = VBoxContainer.new()
	_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.add_theme_constant_override("separation", 8)
	var body_pad := MarginContainer.new()
	body_pad.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body_pad.add_theme_constant_override("margin_left", 14)
	body_pad.add_theme_constant_override("margin_right", 14)
	body_pad.add_theme_constant_override("margin_top", 8)
	body_pad.add_theme_constant_override("margin_bottom", 8)
	body_pad.add_child(_body)
	outer.add_child(body_pad)

	_tip = _label("", 12, COL_DIM)
	_tip.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_tip.custom_minimum_size = Vector2(0, 18)
	_body.add_child(_tip)

	# 必须是容器：普通 Control 不会给子节点分配尺寸，玩法会缩成 0×0。
	_content = PanelContainer.new()
	_content.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_content.add_theme_stylebox_override("panel", StyleBoxEmpty.new())
	_body.add_child(_content)

	var footer := HBoxContainer.new()
	footer.custom_minimum_size = Vector2(0, 38)
	footer.add_theme_constant_override("separation", 10)
	var foot_pad := MarginContainer.new()
	foot_pad.add_theme_constant_override("margin_left", 14)
	foot_pad.add_theme_constant_override("margin_right", 14)
	foot_pad.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	foot_pad.add_child(footer)
	outer.add_child(foot_pad)

	_hint = _label("", 11, COL_DIM)
	_hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_hint.clip_text = true
	footer.add_child(_hint)

	_cancel_btn = _button("中断（进度清零）")
	_cancel_btn.pressed.connect(_on_cancel_pressed)
	footer.add_child(_cancel_btn)


func open(kind: String, label: String, tier: String, title: String,
		on_done: Callable, on_cancel: Callable) -> void:
	_data = MinigameData.load_data()
	if _data.is_empty():
		return
	var real_kind := kind
	if not BUILDERS.has(real_kind):
		# 未知 kind 只可能来自数据错误（tasks / arch 里出现了 14 型以外的值）。
		# 回落 place 保底能玩，但要吵出来，别让它静默变成别的玩法。
		push_warning("未知小游戏 kind「%s」→ 回落 place" % kind)
		real_kind = "place"
	_close_builder()
	_kind = real_kind
	_on_done = on_done
	_on_cancel = on_cancel
	_settling = false
	_failed = false
	_cancel_fired = false
	_elapsed = 0.0
	_limit = MinigameData.fallback_for(_data, tier)

	_title.text = title if title != "" else label
	_counter.text = "—"
	_clock.text = "保底 %ds" % int(ceil(_limit))
	_progress.value = 0.0
	_tip.text = " "
	_tip.add_theme_color_override("font_color", COL_DIM)
	_hint.text = MinigameData.hint_for(_data, label, real_kind)
	_cancel_btn.text = "中断（进度清零）"
	_cancel_btn.visible = true
	if _cancel_btn.pressed.is_connected(_hide):
		_cancel_btn.pressed.disconnect(_hide)
	if not _cancel_btn.pressed.is_connected(_on_cancel_pressed):
		_cancel_btn.pressed.connect(_on_cancel_pressed)

	_builder = BUILDERS[real_kind].new()
	_builder.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_builder.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_builder.solved.connect(_on_builder_solved)
	_builder.failed.connect(_on_builder_failed)
	_builder.progress_changed.connect(_on_builder_progress)
	_builder.tip_changed.connect(_on_builder_tip)
	_content.add_child(_builder)
	_builder.setup(tier, _data, label)

	visible = true
	set_process(true)
	if DisplayServer.get_name() != "headless":
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	opened.emit(real_kind)


func cancel() -> void:
	if not visible:
		return
	# 已经结算完成（成功 / 保底）时，Esc 只是关卡片，不能再触发一次取消。
	if _settling:
		_hide()
		return
	if _cancel_fired:
		_hide()
		return
	_fire_cancel()
	_hide()


func debug_solve() -> void:
	if _builder != null and not _settling:
		_builder.debug_solve()


func debug_fail(reason: String = "测试失败") -> void:
	if not _settling:
		_on_builder_failed(reason)


func is_open() -> bool:
	return visible


func _process(delta: float) -> void:
	if not visible or _settling:
		return
	_elapsed += delta
	var left := _limit - _elapsed
	if left <= 0.0:
		_clock.text = "保底 0s"
		_succeed("保底时间到 · 任务自动完成")
		return
	_clock.text = "保底 %ds" % int(ceil(left))
	_progress.value = clampf(_elapsed / _limit * 100.0, 0.0, 100.0)


func _input(event: InputEvent) -> void:
	if not visible:
		return
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		get_viewport().set_input_as_handled()
		cancel()


func _on_builder_progress(done: int, total: int, msg: String) -> void:
	_counter.text = ("%d / %d" % [mini(done, total), total]) if total > 0 else "—"
	if msg != "":
		_tip.text = msg
		_tip.add_theme_color_override("font_color", COL_DIM)


func _on_builder_tip(text: String, bad: bool) -> void:
	_tip.text = text
	_tip.add_theme_color_override("font_color", COL_BAD if bad else COL_DIM)


func _on_builder_solved() -> void:
	_succeed("任务成功")


func _on_builder_failed(reason: String) -> void:
	if _settling:
		return
	_settling = true
	_failed = true
	_tip.text = reason
	_tip.add_theme_color_override("font_color", COL_BAD)
	_clock.text = "失败"
	_progress.value = 0.0
	# 失败后先把玩法冻结，等玩家点“关闭”再交回“取消”并恢复相机；
	# 否则卡片还挡着屏幕，玩家已经能走动、镜头也已经拉回去了。
	_close_builder()
	_cancel_btn.text = "关闭"
	_cancel_btn.visible = true
	_cancel_btn.pressed.disconnect(_on_cancel_pressed)
	_cancel_btn.pressed.connect(_hide)


func _succeed(message: String) -> void:
	if _settling:
		return
	_settling = true
	_tip.text = message
	_tip.add_theme_color_override("font_color", COL_GOLD)
	_clock.text = "完成"
	_progress.value = 100.0
	await get_tree().create_timer(0.65).timeout
	_fire_done()
	_hide()


func _fire_done() -> void:
	var cb := _on_done
	_on_done = Callable()
	_on_cancel = Callable()
	if cb.is_valid():
		cb.call()


func _fire_cancel() -> void:
	if _cancel_fired:
		return
	_cancel_fired = true
	var cb := _on_cancel
	_on_done = Callable()
	_on_cancel = Callable()
	if cb.is_valid():
		cb.call()


func _hide() -> void:
	if _failed and not _cancel_fired:
		_fire_cancel()
	visible = false
	set_process(false)
	_close_builder()
	# 关闭小游戏不直接 CAPTURED：main.gd 的 `_refresh_mouse_mode()` 会按
	# 「是否有覆盖层 / 用户是否按过 Esc 释放」统一决定，避免把刚释放的光标锁回去。
	closed.emit(_settling and not _cancel_fired)


func _on_cancel_pressed() -> void:
	cancel()


func _close_builder() -> void:
	if _builder != null:
		_builder.queue_free()
		_builder = null


func _label(text: String, size: int, color: Color) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_override("font", _font())
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


func _button(text: String) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_override("font", _font())
	b.add_theme_font_size_override("font_size", 12)
	b.add_theme_color_override("font_color", COL_TEXT)
	b.add_theme_color_override("font_hover_color", COL_GOLD)
	b.add_theme_stylebox_override("normal", _button_style(COL_BTN, Color("#313B4B")))
	b.add_theme_stylebox_override("hover", _button_style(Color("#232C39"), COL_GOLD))
	b.add_theme_stylebox_override("pressed", _button_style(Color("#2A2113"), COL_GOLD))
	return b


func _font() -> SystemFont:
	return MGBase.ui_font()


func _card_style() -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = COL_BG
	s.border_color = COL_LINE
	s.set_border_width_all(1)
	s.set_corner_radius_all(14)
	s.shadow_color = Color(0, 0, 0, 0.55)
	s.shadow_size = 18
	return s


func _flat(c: Color, radius: int) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = c
	s.set_corner_radius_all(radius)
	return s


func _button_style(bg: Color, border: Color) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(1)
	s.set_corner_radius_all(8)
	s.content_margin_left = 12
	s.content_margin_right = 12
	s.content_margin_top = 6
	s.content_margin_bottom = 6
	return s
