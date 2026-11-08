extends "res://scripts/minigame/mg_base.gd"

## 准星保持（对应 2.5D 的 buildAim）
## 准星进亮带时点击，连中 3 次；脱靶清零。

var _hits := 0
var _dir := 1.0
var _x := 0.0


func build() -> void:
	set_process(true)
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(0, 300)
	set_progress(0, 3, "准星进亮带时点击，连中 3 次")


func _process(delta: float) -> void:
	if is_finished():
		return
	_x += _dir * delta * 46.0
	if _x > 96.0:
		_x = 96.0
		_dir = -1.0
	if _x < 0.0:
		_x = 0.0
		_dir = 1.0
	queue_redraw()


func _draw() -> void:
	var area := _range_rect()
	draw_rect(area, Color("#0D1117"))
	draw_rect(area, Color("#2A3240"), false, 1.0)
	var zx := area.position.x + area.size.x * 0.46
	var zw := area.size.x * 0.08
	draw_rect(Rect2(zx, area.position.y, zw, area.size.y), Color(0.94, 0.78, 0.45, 0.16))
	draw_line(Vector2(zx, area.position.y), Vector2(zx, area.end.y), Color("#4A3C1E"), 1.0)
	draw_line(Vector2(zx + zw, area.position.y), Vector2(zx + zw, area.end.y), Color("#4A3C1E"), 1.0)
	var mx := area.position.x + area.size.x * _x / 100.0
	draw_line(Vector2(mx, area.position.y + 6), Vector2(mx, area.end.y - 6), COL_GOLD, 2.0)
	draw_circle(Vector2(mx, area.position.y + 6), 4.0, COL_GOLD)
	draw_string(ui_font(), Vector2(area.position.x + 10, area.position.y + 22),
		"命中 %d / 3" % _hits, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, COL_GOLD)


func _gui_input(event: InputEvent) -> void:
	if is_finished():
		return
	if not (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed):
		return
	if not _range_rect().has_point(event.position):
		return
	if _x >= 46.0 and _x <= 54.0:
		_hits += 1
		set_progress(_hits, 3, "命中 %d / 3" % _hits)
		if _hits >= 3:
			finish_ok()
	else:
		_hits = 0
		set_progress(0, 3, "脱靶 → 计数清零，等准星进带再点")
	queue_redraw()
	accept_event()


func _range_rect() -> Rect2:
	return Rect2(Vector2(18, 26), Vector2(maxf(size.x - 36.0, 40.0), maxf(size.y - 54.0, 40.0)))


func debug_solve() -> void:
	_hits = 3
	set_progress(3, 3, "靶道校准完成")
	queue_redraw()
	finish_ok()
