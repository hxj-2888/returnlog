extends "res://scripts/minigame/mg_base.gd"

## 顺序记忆（对应 2.5D 的 buildSequence，js/t2/minigame.js:944-976）
## 亮起的顺序就是答案；按错只提示，已按的保留。

const SYMBOLS := ["◈", "◇", "▣", "▤", "◐", "◑"]

var _seq: Array = []
var _idx := 0
var _marks: Array = []


func build() -> void:
	var pool: Array = cfg("symbols", SYMBOLS)
	var n: int = clampi(int(cfg("n", tier_n(4, 5, 5))), 2, pool.size())
	_seq = shuffled(pool.slice(0, n))

	var wrap := center_box()
	add_child(wrap)
	wrap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	wrap.add_child(label("亮起的顺序就是答案", 11, COL_DIM))

	var show_center := CenterContainer.new()
	var show := HBoxContainer.new()
	show.add_theme_constant_override("separation", 10)
	show_center.add_child(show)
	wrap.add_child(show_center)

	for s in _seq:
		var cell := PanelContainer.new()
		cell.custom_minimum_size = Vector2(50, 50)
		cell.add_theme_stylebox_override("panel", slot_style(false))
		var l := label(String(s), 20, COL_GOLD)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		cell.add_child(l)
		show.add_child(cell)
		_marks.append(cell)

	var row_center := CenterContainer.new()
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row_center.add_child(row)
	wrap.add_child(row_center)

	for s in shuffled(pool.slice(0, n)):
		var b := button(String(s))
		b.custom_minimum_size = Vector2(58, 40)
		b.add_theme_font_size_override("font_size", 18)
		b.set_meta("sym", String(s))
		b.pressed.connect(_on_press.bind(b))
		row.add_child(b)

	set_progress(0, n, "按提示顺序依次按下 %d 个符号" % n)


func _on_press(b: Button) -> void:
	if is_finished():
		return
	if String(b.get_meta("sym")) != String(_seq[_idx]):
		set_tip("顺序错了 · 已按的保留，再按当前这格", true)
		return
	_marks[_idx].add_theme_stylebox_override("panel", slot_style(true))
	_idx += 1
	set_progress(_idx, _seq.size(),
		"顺序正确" if _idx == _seq.size() else "已按 %d / %d" % [_idx, _seq.size()])
	if _idx >= _seq.size():
		finish_ok()


func debug_solve() -> void:
	for cell in _marks:
		cell.add_theme_stylebox_override("panel", slot_style(true))
	_idx = _seq.size()
	set_progress(_idx, _seq.size(), "顺序正确")
	finish_ok()
