extends CanvasLayer

## 交互轮盘（对齐 2D 原版 #wheel 实体径向暗灰圆盘与 150x36 紧凑按钮）。

const UIStyle := preload("res://scripts/ui/ui_style.gd")

const MAX_SLOTS := 8
const RADIUS := 162.0
const BTN_W := 150.0
const BTN_H := 36.0


class Ring extends Control:
	func _draw() -> void:
		var c := size * 0.5
		var outer_r := 248.0
		var inner_col := Color(0.102, 0.133, 0.176, 0.98)
		var outer_col := Color(0.035, 0.051, 0.075, 0.97)
		var steps := 18
		for s in range(steps, 0, -1):
			var t := float(s) / float(steps)
			var r := outer_r * t
			var k := clampf(t / 0.7, 0.0, 1.0)
			draw_circle(c, r, inner_col.lerp(outer_col, k))
		draw_arc(c, outer_r, 0.0, TAU, 120, Color.html("#33465C"), 1.0, true)


var _panel: Control
var _title: Label
var _hint: Label
var _box: Control
var _buttons: Array = []
var _badges: Array = []
var _labels: Array = []
var _items: Array = []
var _on_pick: Callable
var _on_cancel: Callable


func _ready() -> void:
	layer = 12
	_build()


func _build() -> void:
	_panel = Control.new()
	_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_panel.visible = false
	add_child(_panel)

	var bg := ColorRect.new()
	bg.color = Color(0.024, 0.031, 0.047, 0.62)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_STOP
	bg.gui_input.connect(_on_bg_gui_input)
	_panel.add_child(bg)

	_box = Control.new()
	_box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_panel.add_child(_box)

	var ring := Ring.new()
	ring.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_box.add_child(ring)

	_title = UIStyle.label("", 14, UIStyle.TEXT_GOLD)
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_box.add_child(_title)

	_hint = UIStyle.label("", 11, Color.html("#6D7C8D"))
	_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_box.add_child(_hint)

	for i in MAX_SLOTS:
		var b := UIStyle.make_button("", Callable(), 12, UIStyle.BG_BTN, UIStyle.BORDER_BTN,
			Vector2(BTN_W, BTN_H))
		b.visible = false
		b.size = Vector2(BTN_W, BTN_H)
		b.focus_mode = Control.FOCUS_NONE
		var idx := i
		b.pressed.connect(func() -> void: _choose(idx))

		var margin := MarginContainer.new()
		margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
		margin.add_theme_constant_override("margin_left", 9)
		margin.add_theme_constant_override("margin_right", 9)
		margin.add_theme_constant_override("margin_top", 6)
		margin.add_theme_constant_override("margin_bottom", 6)
		b.add_child(margin)

		var hb := HBoxContainer.new()
		hb.add_theme_constant_override("separation", 7)
		hb.mouse_filter = Control.MOUSE_FILTER_IGNORE
		margin.add_child(hb)

		var badge := PanelContainer.new()
		badge.custom_minimum_size = Vector2(17, 17)
		badge.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var b_sb := StyleBoxFlat.new()
		b_sb.bg_color = Color(0.941, 0.776, 0.455, 0.18)
		b_sb.set_border_width_all(0)
		b_sb.set_corner_radius_all(9)
		b_sb.set_content_margin_all(0)
		badge.add_theme_stylebox_override("panel", b_sb)
		hb.add_child(badge)

		var num_lbl := UIStyle.label(str(i + 1), 10, UIStyle.TEXT_GOLD)
		num_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		num_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		badge.add_child(num_lbl)

		var txt_lbl := UIStyle.label("", 12, UIStyle.TEXT_MAIN)
		txt_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		txt_lbl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		txt_lbl.clip_text = true
		hb.add_child(txt_lbl)

		_box.add_child(b)
		_buttons.append(b)
		_badges.append(badge)
		_labels.append(txt_lbl)
	_layout()


func _layout() -> void:
	var vp: Vector2 = get_viewport().get_visible_rect().size
	var c := vp * 0.5
	_title.position = Vector2(c.x - 120.0, c.y - 12.0)
	_title.size = Vector2(240.0, 24.0)
	_hint.position = Vector2(c.x - 140.0, c.y + 214.0)
	_hint.size = Vector2(280.0, 20.0)
	for i in _buttons.size():
		var b: Button = _buttons[i]
		var ang := -PI * 0.5 + TAU * float(i) / float(MAX_SLOTS)
		var p := c + Vector2(cos(ang), sin(ang)) * RADIUS
		b.position = p - Vector2(BTN_W * 0.5, BTN_H * 0.5)


func is_open() -> bool:
	return _panel.visible


## items: [{label, hint, accent, id, act}]
func open(items: Array, on_pick: Callable, on_cancel: Callable) -> void:
	if items.is_empty():
		return
	_items = items.slice(0, MAX_SLOTS)
	_on_pick = on_pick
	_on_cancel = on_cancel
	_layout()
	_title.text = "选择交互 · %d 项" % _items.size()
	_hint.text = "数字键 / 点击选择 · 右键 / 点空白 / ESC 取消"
	for i in _buttons.size():
		var b: Button = _buttons[i]
		var lbl: Label = _labels[i]
		if i >= _items.size():
			b.visible = false
			continue
		var it: Dictionary = _items[i]
		b.visible = true
		lbl.text = String(it.get("label", ""))
		b.tooltip_text = String(it.get("hint", ""))
		var accent: Variant = it.get("accent", null)
		if accent is Color:
			var ac: Color = accent as Color
			lbl.add_theme_color_override("font_color", ac)
			UIStyle.apply_button(b, UIStyle.BG_BTN, ac, 12, 8, 8, 6, ac, true)
		else:
			lbl.add_theme_color_override("font_color", UIStyle.TEXT_MAIN)
			UIStyle.apply_button(b, UIStyle.BG_BTN, UIStyle.BORDER_BTN, 12, 8, 8, 6, UIStyle.TEXT_MAIN, true)
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


## 点击暗区空白（左键）或右键直接关闭轮盘，降低操作摩擦。
func _on_bg_gui_input(event: InputEvent) -> void:
	if not is_open():
		return
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.pressed and (mb.button_index == MOUSE_BUTTON_LEFT or mb.button_index == MOUSE_BUTTON_RIGHT):
			get_viewport().set_input_as_handled()
			cancel()


## ESC 由 main.gd 的 _close_topmost() 统一处理；这里处理右键直关与数字键 1-8 直选。
func _input(event: InputEvent) -> void:
	if not is_open():
		return
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.pressed and mb.button_index == MOUSE_BUTTON_RIGHT:
			get_viewport().set_input_as_handled()
			cancel()
			return
	if event is InputEventKey and (event as InputEventKey).pressed and not (event as InputEventKey).echo:
		var k := event as InputEventKey
		var digit := -1
		if k.physical_keycode >= KEY_1 and k.physical_keycode <= KEY_9:
			digit = int(k.physical_keycode) - int(KEY_1)
		elif k.physical_keycode >= KEY_KP_1 and k.physical_keycode <= KEY_KP_9:
			digit = int(k.physical_keycode) - int(KEY_KP_1)
		if digit >= 0 and digit < _items.size():
			get_viewport().set_input_as_handled()
			_choose(digit)


func cancel() -> void:
	close()
	if _on_cancel.is_valid():
		_on_cancel.call()
