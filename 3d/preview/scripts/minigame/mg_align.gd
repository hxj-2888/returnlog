extends "res://scripts/minigame/mg_base.gd"

## 三点对准（对应 2.5D 的 buildAlign）
## 把三个探针拖进虚线圆圈，三个都进才算过。

const TOL := 0.026

var _targets: Array = []
var _probes: Array = []
var _drag := -1


func build() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(0, 300)
	for i in 3:
		_targets.append(Vector2(
			_rng.randi_range(16, 78) / 100.0,
			_rng.randi_range(14, 70) / 100.0))
		_probes.append(Vector2(
			(8 + i * 32) / 100.0,
			(72 - i * 16) / 100.0))
	set_progress(0, 3, "把三个金色探针拖进虚线圆圈，三个都进才算过")


func _draw() -> void:
	var area := _board_rect()
	draw_rect(area, Color("#0D1117"))
	draw_rect(area, Color("#2A3240"), false, 1.0)
	for gx in range(1, 8):
		var x := area.position.x + area.size.x * gx / 8.0
		draw_line(Vector2(x, area.position.y), Vector2(x, area.end.y), Color(1, 1, 1, 0.035), 1.0)
	for gy in range(1, 6):
		var y := area.position.y + area.size.y * gy / 6.0
		draw_line(Vector2(area.position.x, y), Vector2(area.end.x, y), Color(1, 1, 1, 0.035), 1.0)

	for t in _targets:
		var p := _to_px(t)
		var col := Color(0.0, 0.9, 0.69, 0.7)
		for k in 12:
			var a0 := TAU * k / 12.0
			draw_arc(p, 14.0, a0, a0 + TAU / 24.0, 6, col, 1.4, true)

	for i in _probes.size():
		var p := _to_px(_probes[i])
		draw_circle(p, 11.0, Color(0.94, 0.78, 0.45, 0.15))
		draw_arc(p, 11.0, 0.0, TAU, 24, COL_GOLD, 2.0, true)
		draw_circle(p, 4.0, COL_GOLD)
		draw_string(ui_font(), p + Vector2(14, 4), str(i + 1), HORIZONTAL_ALIGNMENT_LEFT,
			-1, 11, COL_DIM)


func _gui_input(event: InputEvent) -> void:
	if is_finished():
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			var best := -1
			var best_d := 26.0
			for i in _probes.size():
				var d := _to_px(_probes[i]).distance_to(event.position)
				if d < best_d:
					best_d = d
					best = i
			_drag = best
			if best >= 0:
				accept_event()
		else:
			_drag = -1
	elif event is InputEventMouseMotion and _drag >= 0:
		var area := _board_rect()
		var p: Vector2 = (event.position - area.position) / area.size
		_probes[_drag] = Vector2(clampf(p.x, 0.0, 1.0), clampf(p.y, 0.0, 1.0))
		_check()
		queue_redraw()
		accept_event()


func _check() -> void:
	var got := 0
	for i in _probes.size():
		if (_probes[i] - _targets[i]).length() <= TOL:
			got += 1
	set_progress(got, 3, "对准 %d / 3 —— 拖到虚线圆圈里" % got)
	if got == 3:
		finish_ok()


func _board_rect() -> Rect2:
	return Rect2(Vector2(10, 8), Vector2(maxf(size.x - 20.0, 20.0), maxf(size.y - 16.0, 20.0)))


func _to_px(p: Vector2) -> Vector2:
	var area := _board_rect()
	return area.position + p * area.size


func debug_solve() -> void:
	for i in _probes.size():
		_probes[i] = _targets[i]
	set_progress(3, 3, "三点评定通过")
	queue_redraw()
	finish_ok()
