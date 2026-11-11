extends "res://scripts/minigame/mg_base.gd"

## 拉闸 / 合闸（对应 2.5D 的 buildLever）
## 按住不放直到充满；松手保持已充进度，可以分多次按住（2026-11-09 取消衰减）。

class LeverView extends Control:
	var charge := 0.0
	var fired := false

	func _draw() -> void:
		var cx := size.x * 0.5
		var base_y := size.y - 22.0
		draw_rect(Rect2(cx - 46, base_y, 92, 14), Color("#0D1117"))
		draw_rect(Rect2(cx - 46, base_y, 92, 14), Color("#313B4B"), false, 1.0)
		var pivot := Vector2(cx, base_y - 8.0)
		var angle := deg_to_rad(-70.0 * charge)
		var tip := pivot + Vector2(sin(angle), -cos(angle)) * 104.0
		draw_line(pivot, tip, Color("#1B2432"), 12.0, true)
		draw_line(pivot, tip, Color(0.94, 0.78, 0.45, 0.55), 2.0, true)
		draw_circle(tip, 13.0, Color("#0D1117"))
		draw_arc(tip, 13.0, 0.0, TAU, 28,
			Color("#F0C674") if not fired else Color("#00E5B0"), 2.0, true)
		draw_circle(pivot, 6.0, Color("#313B4B"))
		if fired:
			var spark := Color("#FFB020")
			draw_line(tip + Vector2(-8, -10), tip + Vector2(2, 2), spark, 2.4, true)
			draw_line(tip + Vector2(2, 2), tip + Vector2(-2, 16), spark, 2.4, true)


var _view: LeverView
var _charge := 0.0
var _held := false
var _fill: ProgressBar
var _pct: Label
var _hold_btn: Button
var _hold_need := 1.2


func build() -> void:
	set_process(true)
	_hold_need = maxf(0.2, float(cfg("hold", 1.2)))
	var wrap := center_box()
	add_child(wrap)
	wrap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 28)
	wrap.add_child(row)

	_view = LeverView.new()
	_view.custom_minimum_size = Vector2(150, 190)
	row.add_child(_view)

	var side := VBoxContainer.new()
	side.alignment = BoxContainer.ALIGNMENT_CENTER
	side.add_theme_constant_override("separation", 12)
	row.add_child(side)

	_fill = ProgressBar.new()
	_fill.show_percentage = false
	_fill.custom_minimum_size = Vector2(180, 16)
	_fill.max_value = 100.0
	_fill.add_theme_stylebox_override("background", stylebox(COL_WELL, Color("#313B4B"), 8))
	_fill.add_theme_stylebox_override("fill", stylebox(COL_GOLD, COL_GOLD, 8, 0))
	side.add_child(_fill)

	_pct = label("0%", 20, COL_GOLD)
	_pct.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	side.add_child(_pct)

	_hold_btn = button("按住不放 · 拉到底")
	_hold_btn.custom_minimum_size = Vector2(190, 40)
	_hold_btn.button_down.connect(func() -> void: _held = true)
	_hold_btn.button_up.connect(func() -> void: _held = false)
	side.add_child(_hold_btn)

	set_progress(0, 1, "按住按钮不放，直到拉杆转到底")


func _process(delta: float) -> void:
	if is_finished():
		return
	if _held and _charge < 1.0:
		_charge = minf(1.0, _charge + delta / _hold_need)
	# 松手不再回落：真源 2026-11-09 取消「松手保持进度」，改成分多次按住也能攒满
	# （js/t2/minigame.js:665-667 松手时不动 charge）。
	_view.charge = _charge
	_view.queue_redraw()
	_fill.value = _charge * 100.0
	_pct.text = "%d%%" % int(_charge * 100.0)
	if _charge >= 1.0:
		_view.fired = true
		_view.queue_redraw()
		set_progress(1, 1, "电闸已到位")
		finish_ok()


func debug_solve() -> void:
	_charge = 1.0
	_view.charge = 1.0
	_view.fired = true
	_view.queue_redraw()
	_fill.value = 100.0
	_pct.text = "100%"
	set_progress(1, 1, "电闸已到位")
	finish_ok()
