extends CanvasLayer

## 交互轮盘（对应 2.5D 的 #wheel 环形布局）：E 收集到多个可交互项时，
## 以屏幕中心的 8 扇区环列出，按 1-9 / 点击 / ESC 选择。
## 口径来源：js/game.js 的 collectInteractions / openWheel / pickWheel / closeWheel。
## 2026-11-11：旧版是竖排列表，且面板锚在屏幕顶部（offset_top=-150），
## 一半按钮落在屏外 —— 实机「按钮合法却点不到」。现改为居中环形 + 常显提示。

const MAX_SLOTS := 8
const RADIUS := 168.0
const BTN_W := 180.0
const BTN_H := 46.0


class Ring extends Control:
	func _draw() -> void:
		var c := size * 0.5
		var r := 168.0
		draw_arc(c, r, 0.0, TAU, 96, Color(0.42, 0.52, 0.68, 0.32), 2.0, true)
		draw_arc(c, r - 62.0, 0.0, TAU, 96, Color(0.42, 0.52, 0.68, 0.16), 1.0, true)
		for i in 8:
			var a := -PI * 0.5 + TAU * float(i) / 8.0
			var d := Vector2(cos(a), sin(a))
			draw_line(c + d * (r - 12.0), c + d * (r + 12.0),
				Color(0.52, 0.62, 0.78, 0.30), 1.0, true)


var _panel: Control
var _title: Label
var _hint: Label
var _box: Control
var _buttons: Array = []
var _items: Array = []
var _on_pick: Callable
var _on_cancel: Callable
var _font: SystemFont


func _ready() -> void:
	layer = 12
	_build()


func _build() -> void:
	_font = SystemFont.new()
	_font.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])
	_panel = Control.new()
	_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_panel.visible = false
	add_child(_panel)
	var bg := ColorRect.new()
	bg.color = Color(0.01, 0.02, 0.04, 0.55)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_STOP
	_panel.add_child(bg)

	_box = Control.new()
	_box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_panel.add_child(_box)
	var ring := Ring.new()
	ring.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_box.add_child(ring)

	_title = Label.new()
	_title.add_theme_font_override("font", _font)
	_title.add_theme_font_size_override("font_size", 20)
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title.add_theme_color_override("font_color", Color(0.88, 0.91, 1.0))
	_box.add_child(_title)

	_hint = Label.new()
	_hint.add_theme_font_override("font", _font)
	_hint.add_theme_font_size_override("font_size", 13)
	_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hint.add_theme_color_override("font_color", Color(0.62, 0.68, 0.80))
	_box.add_child(_hint)

	for i in MAX_SLOTS:
		var b := Button.new()
		b.visible = false
		b.custom_minimum_size = Vector2(BTN_W, BTN_H)
		b.size = Vector2(BTN_W, BTN_H)
		b.alignment = HORIZONTAL_ALIGNMENT_CENTER
		b.add_theme_font_override("font", _font)
		b.add_theme_font_size_override("font_size", 14)
		var idx := i
		b.pressed.connect(func() -> void: _choose(idx))
		_box.add_child(b)
		_buttons.append(b)
	_layout()


func _layout() -> void:
	var vp: Vector2 = get_viewport().get_visible_rect().size
	var c := vp * 0.5
	_title.position = Vector2(c.x - 260.0, c.y - 118.0)
	_title.size = Vector2(520.0, 34.0)
	_hint.position = Vector2(c.x - 260.0, c.y + 84.0)
	_hint.size = Vector2(520.0, 26.0)
	for i in _buttons.size():
		var b: Button = _buttons[i]
		var ang := -PI * 0.5 + TAU * float(i) / float(MAX_SLOTS)
		var p := c + Vector2(cos(ang), sin(ang)) * RADIUS
		b.position = p - Vector2(BTN_W * 0.5, BTN_H * 0.5)


func is_open() -> bool:
	return _panel.visible


## items: [{label, hint, accent, id, act}]
func open(items: Array, on_pick: Callable, on_cancel: Callable) -> void:
	_items = items.slice(0, MAX_SLOTS)
	_on_pick = on_pick
	_on_cancel = on_cancel
	_layout()
	_title.text = "选择交互 · %d 项" % _items.size()
	_hint.text = "点击或按 1-%d 直选 · ESC 取消 · 松开不执行" % _items.size()
	for i in _buttons.size():
		var b: Button = _buttons[i]
		if i >= _items.size():
			b.visible = false
			continue
		var it: Dictionary = _items[i]
		b.visible = true
		b.text = "%d. %s" % [i + 1, String(it.get("label", ""))]
		b.tooltip_text = String(it.get("hint", ""))
		var accent: Variant = it.get("accent", null)
		if accent is Color:
			b.add_theme_color_override("font_color", accent as Color)
		else:
			b.remove_theme_color_override("font_color")
	_panel.visible = true


func close() -> void:
	_panel.visible = false


func _choose(index: int) -> void:
	if index < 0 or index >= _items.size():
		return
	var it: Dictionary = _items[index]
	close()
	if _on_pick.is_valid():
		_on_pick.call(it)


## ESC 由 main.gd 的 _close_topmost() 统一处理；这里只留数字键直选。
func _unhandled_input(event: InputEvent) -> void:
	if not is_open():
		return
	if event is InputEventKey and event.pressed:
		var k := event as InputEventKey
		var digit := -1
		if k.physical_keycode >= KEY_1 and k.physical_keycode <= KEY_9:
			digit = int(k.physical_keycode) - int(KEY_1)
		if digit >= 0 and digit < _items.size():
			get_viewport().set_input_as_handled()
			_choose(digit)


func cancel() -> void:
	close()
	if _on_cancel.is_valid():
		_on_cancel.call()
