extends "res://scripts/minigame/mg_base.gd"

## 换芯（对应 2.5D 的 buildSwap）
## 先取出旧芯，再插入同型号新芯；型号不对整组重来。

const CORES := [
	{"id": "c1", "name": "A 型", "color": "#00E5B0"},
	{"id": "c2", "name": "B 型", "color": "#E0574F"},
	{"id": "c3", "name": "C 型", "color": "#73A7FF"},
]

var _target := ""
var _removed := false
var _socket: PanelContainer
var _old_btn: Button
var _tray_buttons: Array = []


func build() -> void:
	var wrap := center_box()
	add_child(wrap)
	wrap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 30)
	wrap.add_child(row)

	_socket = PanelContainer.new()
	_socket.custom_minimum_size = Vector2(96, 126)
	_socket.add_theme_stylebox_override("panel", stylebox(COL_WELL, Color("#313B4B"), 8))
	row.add_child(_socket)

	_old_btn = button("旧芯")
	_old_btn.custom_minimum_size = Vector2(66, 88)
	_old_btn.add_theme_stylebox_override("normal", stylebox(Color("#6B7280"), Color("#9AA3B2"), 6))
	_old_btn.add_theme_color_override("font_color", Color("#0A0D13"))
	_old_btn.pressed.connect(_on_remove_old)
	_socket.add_child(_old_btn)

	var tray := HBoxContainer.new()
	tray.add_theme_constant_override("separation", 10)
	row.add_child(tray)

	var order := shuffled(CORES.duplicate())
	_target = String(order[0].id)
	for core in order:
		var b := button(String(core.name))
		b.custom_minimum_size = Vector2(70, 38)
		b.set_meta("id", String(core.id))
		var col := Color(String(core.color))
		b.add_theme_stylebox_override("normal", stylebox(col.darkened(0.55), col, 7))
		b.add_theme_stylebox_override("hover", stylebox(col.darkened(0.35), col, 7))
		b.pressed.connect(_on_pick_core.bind(b))
		tray.add_child(b)
		_tray_buttons.append(b)

	set_progress(0, 2, "第一步：点「旧芯」把它取出来")


func _on_remove_old() -> void:
	if is_finished() or _removed:
		return
	_removed = true
	_old_btn.queue_free()
	_old_btn = null
	set_progress(1, 2, "旧芯已取出，选一枚同型号新芯")


func _on_pick_core(b: Button) -> void:
	if is_finished() or not _removed:
		set_tip("先把旧芯取出来", true)
		return
	if String(b.get_meta("id")) != _target:
		finish_fail("型号不对 → 整组重来")
		return
	var core_col := Color("#00E5B0")
	for c in CORES:
		if String(c.id) == _target:
			core_col = Color(String(c.color))
	var new_core := label("新芯", 11, Color("#0A0D13"))
	new_core.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	new_core.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	new_core.custom_minimum_size = Vector2(66, 88)
	new_core.add_theme_stylebox_override("normal", stylebox(core_col, core_col, 6))
	new_core.add_theme_stylebox_override("panel", stylebox(core_col, core_col, 6))
	_socket.add_child(new_core)
	set_progress(2, 2, "换芯完成")
	finish_ok()


func debug_solve() -> void:
	_removed = true
	if _old_btn != null:
		_old_btn.queue_free()
		_old_btn = null
	set_progress(2, 2, "换芯完成")
	finish_ok()
