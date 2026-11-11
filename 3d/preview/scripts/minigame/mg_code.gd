extends "res://scripts/minigame/mg_base.gd"

## 密码 / 编号（对应 2.5D 的 buildCode，js/t2/minigame.js:1060-1095）
## 按提示编号输入；输错只提示，已输入的保留。

var _code := "4271"
var _entered := ""
var _cells: Array = []


func build() -> void:
	_code = String(cfg("code", "4271"))
	_entered = ""

	var wrap := center_box()
	add_child(wrap)
	wrap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var clue := label(String(cfg("clue", "按提示编号输入")), 11, COL_DIM)
	clue.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	wrap.add_child(clue)

	var box_center := CenterContainer.new()
	var box := HBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	box_center.add_child(box)
	wrap.add_child(box_center)

	for i in _code.length():
		var cell := PanelContainer.new()
		cell.custom_minimum_size = Vector2(42, 48)
		cell.add_theme_stylebox_override("panel", slot_style(false))
		var l := label("·", 20, COL_GOLD)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		cell.add_child(l)
		box.add_child(cell)
		_cells.append(l)

	var pad_center := CenterContainer.new()
	var pad := GridContainer.new()
	pad.columns = 5
	pad.add_theme_constant_override("h_separation", 8)
	pad.add_theme_constant_override("v_separation", 8)
	pad_center.add_child(pad)
	wrap.add_child(pad_center)

	for d in 10:
		var b := button(str(d))
		b.custom_minimum_size = Vector2(52, 38)
		b.add_theme_font_size_override("font_size", 16)
		b.pressed.connect(_on_digit.bind(str(d)))
		pad.add_child(b)

	var clr := button("清空")
	clr.custom_minimum_size = Vector2(52, 38)
	clr.pressed.connect(_on_clear)
	pad.add_child(clr)

	set_progress(0, _code.length(), "输入 %d 位编号" % _code.length())


func _on_digit(d: String) -> void:
	if is_finished():
		return
	if not _code.begins_with(_entered + d):
		set_tip("编号不对 · 已输入的保留，再试这位", true)
		return
	_entered += d
	_cells[_entered.length() - 1].text = d
	set_progress(_entered.length(), _code.length(),
		"编号正确" if _entered.length() == _code.length()
		else "已输入 %d / %d" % [_entered.length(), _code.length()])
	if _entered.length() == _code.length():
		finish_ok()


func _on_clear() -> void:
	if is_finished():
		return
	_entered = ""
	for c in _cells:
		c.text = "·"
	set_progress(0, _code.length(), "已清空")


func debug_solve() -> void:
	_entered = _code
	for i in _cells.size():
		_cells[i].text = _code.substr(i, 1)
	set_progress(_code.length(), _code.length(), "编号正确")
	finish_ok()
