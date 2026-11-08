extends "res://scripts/minigame/mg_base.gd"

## 注液 / 注气（对应 2.5D 的 buildPour）
## 按住注液，落在 52~68 之间再松手；溢出或不足都重来。

const LO := 52.0
const HI := 68.0

class Vessel extends Control:
	var fill := 0.0

	func _draw() -> void:
		var r := Rect2(Vector2(size.x * 0.5 - 34, 6), Vector2(68, size.y - 12))
		draw_rect(r, Color("#0D1117"))
		draw_rect(r, Color("#313B4B"), false, 1.0)
		var zone_y := r.position.y + r.size.y * (1.0 - 0.68)
		var zone_h := r.size.y * (0.68 - 0.52)
		draw_rect(Rect2(r.position.x, zone_y, r.size.x, zone_h), Color(0.94, 0.78, 0.45, 0.07))
		draw_line(Vector2(r.position.x, zone_y), Vector2(r.end.x, zone_y),
			Color(0.94, 0.78, 0.45, 0.7), 1.0, true)
		draw_line(Vector2(r.position.x, zone_y + zone_h), Vector2(r.end.x, zone_y + zone_h),
			Color(0.94, 0.78, 0.45, 0.7), 1.0, true)
		var fh := r.size.y * clampf(fill / 100.0, 0.0, 1.0)
		draw_rect(Rect2(r.position.x, r.end.y - fh, r.size.x, fh), Color(0.94, 0.78, 0.45, 0.55))
		draw_rect(r, Color("#313B4B"), false, 1.0)


var _vessel: Vessel
var _fill := 0.0
var _held := false
var _hold_btn: Button
var _pct: Label


func build() -> void:
	set_process(true)
	var wrap := center_box()
	add_child(wrap)
	wrap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 24)
	wrap.add_child(row)

	_vessel = Vessel.new()
	_vessel.custom_minimum_size = Vector2(110, 210)
	row.add_child(_vessel)

	var ticks := VBoxContainer.new()
	ticks.custom_minimum_size = Vector2(30, 200)
	for t in ["100", "75", "50", "25", "0"]:
		var l := label(t, 10, COL_DIM)
		l.size_flags_vertical = Control.SIZE_EXPAND_FILL
		ticks.add_child(l)
	row.add_child(ticks)

	var side := VBoxContainer.new()
	side.alignment = BoxContainer.ALIGNMENT_CENTER
	side.add_theme_constant_override("separation", 14)
	row.add_child(side)

	_pct = label("0%", 22, COL_GOLD)
	_pct.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	side.add_child(_pct)

	_hold_btn = button("按住注液 · 松开确认")
	_hold_btn.custom_minimum_size = Vector2(190, 40)
	_hold_btn.button_down.connect(func() -> void: _held = true)
	_hold_btn.button_up.connect(_on_release)
	side.add_child(_hold_btn)

	set_progress(0, 1, "按住注液，落在 52~68 之间再松手")


func _process(delta: float) -> void:
	if is_finished():
		return
	if _held and _fill < 100.0:
		_fill = minf(100.0, _fill + delta * 38.0)
		_vessel.fill = _fill
		_vessel.queue_redraw()
		_pct.text = "%d%%" % int(_fill)


func _on_release() -> void:
	if is_finished() or not _held:
		return
	_held = false
	if _fill > HI:
		finish_fail("注过头了 → 整组重来")
	elif _fill < LO:
		finish_fail("注得不够 → 整组重来")
	else:
		set_progress(1, 1, "配比到位")
		finish_ok()


func debug_solve() -> void:
	_fill = (LO + HI) * 0.5
	_vessel.fill = _fill
	_vessel.queue_redraw()
	_pct.text = "%d%%" % int(_fill)
	set_progress(1, 1, "配比到位")
	finish_ok()
