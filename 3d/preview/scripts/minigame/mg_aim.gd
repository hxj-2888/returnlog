extends "res://scripts/minigame/mg_base.gd"

## 准星保持（对应 2.5D 的 buildAim）
## 准星进亮带时点击；脱靶只提示，已中的保留。

var _hits := 0
var _dir := 1.0
var _x := 0.0
var _need := 3
var _speed := 46.0
var _zone := 8.0


func build() -> void:
	set_process(true)
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(0, 300)
	_need = maxi(1, int(cfg("hits", 3)))
	_speed = float(cfg("speed", 46.0))
	_zone = float(cfg("zone", 8.0))
	set_progress(0, _need, "准星进亮带时点击，连中 %d 次" % _need)


func _process(delta: float) -> void:
	if is_finished():
		return
	_x += _dir * delta * _speed
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
	var zlo := 50.0 - _zone * 0.5
	var zx := area.position.x + area.size.x * zlo / 100.0
	var zw := area.size.x * _zone / 100.0
	draw_rect(Rect2(zx, area.position.y, zw, area.size.y), Color(0.94, 0.78, 0.45, 0.16))
	draw_line(Vector2(zx, area.position.y), Vector2(zx, area.end.y), Color("#4A3C1E"), 1.0)
	draw_line(Vector2(zx + zw, area.position.y), Vector2(zx + zw, area.end.y), Color("#4A3C1E"), 1.0)
	var mx := area.position.x + area.size.x * _x / 100.0
	draw_line(Vector2(mx, area.position.y + 6), Vector2(mx, area.end.y - 6), COL_GOLD, 2.0)
	draw_circle(Vector2(mx, area.position.y + 6), 4.0, COL_GOLD)
	draw_string(ui_font(), Vector2(area.position.x + 10, area.position.y + 22),
		"命中 %d / %d" % [_hits, _need], HORIZONTAL_ALIGNMENT_LEFT, -1, 13, COL_GOLD)


func _gui_input(event: InputEvent) -> void:
	if is_finished():
		return
	if not (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed):
		return
	if not _range_rect().has_point(event.position):
		return
	var zlo := 50.0 - _zone * 0.5
	if _x >= zlo and _x <= zlo + _zone:
		_hits += 1
		set_progress(_hits, _need, "命中 %d / %d" % [_hits, _need])
		if _hits >= _need:
			finish_ok()
	else:
		# 2.5D 2026-11-09 取消「脱靶清零」：已中的保留（js/t2/minigame.js 的
		# 脱靶分支只 tip，不动 hits）。
		set_tip("脱靶 · 已中的保留，等准星进带再点", true)
	queue_redraw()
	accept_event()


func _range_rect() -> Rect2:
	return Rect2(Vector2(18, 26), Vector2(maxf(size.x - 36.0, 40.0), maxf(size.y - 54.0, 40.0)))


func debug_solve() -> void:
	_hits = _need
	set_progress(_need, _need, "靶道校准完成")
	queue_redraw()
	finish_ok()
