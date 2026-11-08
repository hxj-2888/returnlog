extends Control

## 3D 小游戏基类：只负责「卡片内的玩法内容」，卡片壳由 minigame_layer.gd 提供。
## 与 2.5D 的对应关系：js/t2/minigame.js 的 BUILD[kind] 构建函数。
## 这里不读对局状态、不写分数；完成 / 失败通过信号交回遮罩层。

signal solved
signal failed(reason: String)
signal progress_changed(done: int, total: int, msg: String)
signal tip_changed(text: String, bad: bool)

const COL_TEXT := Color("#DDE3EC")
const COL_DIM := Color("#8FA6C0")
const COL_GOLD := Color("#F0C674")
const COL_LINE := Color("#2A3240")
const COL_BG := Color("#12161E")
const COL_WELL := Color("#0D1117")
const COL_BTN := Color("#1D2530")
const COL_GOOD := Color("#00E5B0")
const COL_BAD := Color("#E08A86")

static var _font: SystemFont

var tier := "normal"
var game_data: Dictionary = {}
var task_label := ""

var _rng := RandomNumberGenerator.new()
var _finished := false


func setup(p_tier: String, p_data: Dictionary, p_label: String = "") -> void:
	tier = p_tier
	game_data = p_data
	task_label = p_label
	_rng.randomize()
	build()


func build() -> void:
	pass


## 门禁 / --mgtest 用：走与真实交互相同的内部结算函数，不伪造 solved 信号。
func debug_solve() -> void:
	pass


static func ui_font() -> SystemFont:
	if _font == null:
		_font = SystemFont.new()
		_font.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])
	return _font


func finish_ok() -> void:
	if _finished:
		return
	_finished = true
	solved.emit()


func finish_fail(reason: String) -> void:
	if _finished:
		return
	_finished = true
	failed.emit(reason)


func is_finished() -> bool:
	return _finished


func set_progress(done: int, total: int, msg: String = "") -> void:
	progress_changed.emit(done, total, msg)


func set_tip(text: String, bad: bool = false) -> void:
	tip_changed.emit(text, bad)


func tier_n(normal: int, hard: int, circuit: int = -1) -> int:
	if tier == "circuit":
		return circuit if circuit >= 0 else hard
	if tier == "hard":
		return hard
	return normal


func rng_i(n: int) -> int:
	return _rng.randi_range(0, maxi(0, n - 1))


func shuffled(values: Array) -> Array:
	var a := values.duplicate()
	for i in range(a.size() - 1, 0, -1):
		var j := _rng.randi_range(0, i)
		var t: Variant = a[i]
		a[i] = a[j]
		a[j] = t
	return a


func stylebox(bg: Color, border: Color, radius: int = 8, width: int = 1) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(width)
	s.set_corner_radius_all(radius)
	s.content_margin_left = 10
	s.content_margin_right = 10
	s.content_margin_top = 6
	s.content_margin_bottom = 6
	return s


func label(text: String, size: int = 13, color: Color = COL_TEXT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_override("font", ui_font())
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


func button(text: String) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_override("font", ui_font())
	b.add_theme_font_size_override("font_size", 12)
	b.add_theme_color_override("font_color", COL_TEXT)
	b.add_theme_color_override("font_hover_color", COL_GOLD)
	b.add_theme_stylebox_override("normal", stylebox(COL_BTN, Color("#313B4B"), 8))
	b.add_theme_stylebox_override("hover", stylebox(Color("#232C39"), COL_GOLD, 8))
	b.add_theme_stylebox_override("pressed", stylebox(Color("#2A2113"), COL_GOLD, 8))
	b.add_theme_stylebox_override("disabled", stylebox(COL_BTN, COL_LINE, 8))
	return b


func slot_style(filled: bool) -> StyleBoxFlat:
	if filled:
		return stylebox(Color(0.94, 0.78, 0.45, 0.08), Color("#4A3C1E"), 7)
	return stylebox(COL_WELL, Color("#3A4454"), 7)


func spacer(height: float) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(0, height)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


func center_box() -> VBoxContainer:
	var v := VBoxContainer.new()
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_theme_constant_override("separation", 10)
	v.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return v
