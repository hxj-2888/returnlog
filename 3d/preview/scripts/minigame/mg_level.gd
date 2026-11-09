extends "res://scripts/minigame/mg_base.gd"

## 层高对齐（对应 2.5D 的 buildLevel）
## 拖动货架层，全部对齐到同一条虚线（±3%）。

const TARGET := 42.0
const TOL := 3.0

var _bars: Array = []
var _drag := -1


func build() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(0, 300)
	var n := tier_n(4, 5, 5)
	var base := [14.0, 30.0, 48.0, 66.0, 84.0] if n == 5 else [20.0, 34.0, 58.0, 72.0]
	for i in base.size():
		_bars.append(base[i])
	set_progress(0, _bars.size(), "把 %d 层货架拖到同一条虚线（±3%%）" % _bars.size())


func _draw() -> void:
	var area := _shelf_rect()
	draw_rect(area, Color("#0D1117"))
	draw_rect(area, Color("#2A3240"), false, 1.0)
	var ty := area.position.y + area.size.y * TARGET / 100.0
	for k in 26:
		var x := area.position.x + area.size.x * k / 26.0
		draw_line(Vector2(x, ty), Vector2(x + area.size.x / 52.0, ty),
			Color(0.94, 0.78, 0.45, 0.55), 1.2, true)

	for i in _bars.size():
		var y: float = area.position.y + area.size.y * float(_bars[i]) / 100.0
		var r := Rect2(area.position.x + 8, y, area.size.x - 16, 14)
		draw_rect(r, Color("#1B2432"))
		draw_line(Vector2(r.position.x, r.position.y), Vector2(r.end.x, r.position.y),
			Color("#8FA6C0"), 2.0, true)
		draw_string(ui_font(), Vector2(r.end.x - 22, r.position.y - 3), "L%d" % (i + 1),
			HORIZONTAL_ALIGNMENT_LEFT, -1, 10, COL_DIM)


func _gui_input(event: InputEvent) -> void:
	if is_finished():
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			var area := _shelf_rect()
			_drag = -1
			for i in _bars.size():
				var y: float = area.position.y + area.size.y * float(_bars[i]) / 100.0
				if absf(event.position.y - y) <= 14.0 and event.position.x >= area.position.x:
					_drag = i
					break
			if _drag >= 0:
				accept_event()
		else:
			_drag = -1
	elif event is InputEventMouseMotion and _drag >= 0:
		var area := _shelf_rect()
		_bars[_drag] = clampf((event.position.y - area.position.y) / area.size.y * 100.0, 0.0, 92.0)
		_check()
		queue_redraw()
		accept_event()


func _check() -> void:
	var got := 0
	for v in _bars:
		if absf(float(v) - TARGET) <= TOL:
			got += 1
	set_progress(got, _bars.size(), "齐平 %d / %d 层 —— 拖到同一条虚线" % [got, _bars.size()])
	if got == _bars.size():
		finish_ok()


func _shelf_rect() -> Rect2:
	return Rect2(Vector2(18, 8), Vector2(maxf(size.x - 36.0, 40.0), maxf(size.y - 16.0, 40.0)))


func debug_solve() -> void:
	for i in _bars.size():
		_bars[i] = TARGET
	set_progress(_bars.size(), _bars.size(), "%d 层齐平" % _bars.size())
	queue_redraw()
	finish_ok()
