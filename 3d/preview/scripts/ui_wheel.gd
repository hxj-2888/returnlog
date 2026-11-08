extends CanvasLayer

## 交互轮盘（对应 2.5D 的 #wheel）：E 收集到多个可交互项时列出来，按 1-9 或点击选择。
## 2.5D 是环形布局（left/top 百分比），3D 先做竖排列表 —— 信息结构一致，画法不同，
## 因为这里要验的是"多项不被固定优先级吞掉"，不是像素级复刻。
## 口径来源：js/game.js 的 collectInteractions / openWheel / pickWheel / closeWheel。

const MAX_SLOTS := 9

var _panel: Panel
var _title: Label
var _box: VBoxContainer
var _items: Array = []
var _on_pick: Callable
var _on_cancel: Callable


func _ready() -> void:
	layer = 12
	_build()


func _build() -> void:
	_panel = Panel.new()
	_panel.visible = false
	_panel.anchor_left = 0.5
	_panel.anchor_right = 0.5
	_panel.offset_left = -260.0
	_panel.offset_right = 260.0
	_panel.offset_top = -150.0
	_panel.offset_bottom = 150.0
	add_child(_panel)

	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])

	_title = Label.new()
	_title.text = "选择交互"
	_title.add_theme_font_override("font", font)
	_title.add_theme_font_size_override("font_size", 18)
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_panel.add_child(_title)

	_box = VBoxContainer.new()
	_box.position = Vector2(16, 34)
	_box.size = Vector2(488, 200)
	_box.add_theme_constant_override("separation", 6)
	_panel.add_child(_box)

	for i in MAX_SLOTS:
		var b := Button.new()
		b.visible = false
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.add_theme_font_override("font", font)
		b.add_theme_font_size_override("font_size", 15)
		var idx := i
		b.pressed.connect(func() -> void: _choose(idx))
		_box.add_child(b)


func is_open() -> bool:
	return _panel.visible


## items: [{label, hint, accent}]
func open(items: Array, on_pick: Callable, on_cancel: Callable) -> void:
	_items = items.slice(0, MAX_SLOTS)
	_on_pick = on_pick
	_on_cancel = on_cancel
	_title.text = "选择交互 · %d 项（1-%d 或点击，ESC 取消）" % [_items.size(), _items.size()]
	var children: Array = _box.get_children()
	for i in children.size():
		var b := children[i] as Button
		if i >= _items.size():
			b.visible = false
			continue
		var it: Dictionary = _items[i]
		b.visible = true
		b.text = "%d. %s   %s" % [i + 1, String(it.get("label", "")), String(it.get("hint", ""))]
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


func _unhandled_input(event: InputEvent) -> void:
	if not is_open():
		return
	if event is InputEventKey and event.pressed:
		var k := event as InputEventKey
		if k.keycode == KEY_ESCAPE:
			get_viewport().set_input_as_handled()
			cancel()
			return
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
