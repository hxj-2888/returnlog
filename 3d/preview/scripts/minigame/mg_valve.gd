extends "res://scripts/minigame/mg_base.gd"

## 阀门（对应 2.5D 的 buildValve，js/t2/minigame.js:1021-1058）
## 点阀门每次转 15°，把指针转到顶部刻度线；三个都到位即完成。
## 越转越远也不会失败 —— 继续点就会转回来。

const DEFAULT_ANGLES := [45, 135, 225, 315]


class Valve extends Control:
	## 内嵌类拿不到外层脚本的常量，颜色就地写死（与 mg_pour.Vessel 同一写法）。
	const C_GOLD := Color("#F0C674")
	const C_DIM := Color("#8FA6C0")
	const C_LINE := Color("#313B4B")
	const C_WELL := Color("#0D1117")

	var angle := 0.0
	var target := 45.0
	var hit := false

	func _draw() -> void:
		var c := size * 0.5
		var r := minf(size.x, size.y) * 0.5 - 2.0
		draw_circle(c, r, C_WELL)
		draw_arc(c, r, 0.0, TAU, 48, C_GOLD if hit else C_LINE, 2.0, true)
		var ta := deg_to_rad(target - 90.0)
		var tick := Vector2(cos(ta), sin(ta))
		draw_line(c + tick * (r - 11.0), c + tick * (r - 3.0), C_DIM, 3.0, true)
		var na := deg_to_rad(angle - 90.0)
		var nd := Vector2(cos(na), sin(na))
		draw_line(c, c + nd * (r - 12.0), C_GOLD, 3.0, true)
		draw_circle(c, 3.5, C_GOLD)


var _valves: Array = []
var _cur: Array = []
var _angles: Array = []


func build() -> void:
	var n: int = clampi(int(cfg("n", 3)), 2, 4)
	_angles = cfg("angles", DEFAULT_ANGLES).slice(0, n)

	var wrap := center_box()
	add_child(wrap)
	wrap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	wrap.add_child(label("点阀门每次转 15°，把指针转到顶部刻度线", 11, COL_DIM))

	var row_center := CenterContainer.new()
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 26)
	row_center.add_child(row)
	wrap.add_child(row_center)

	for i in n:
		var v := Valve.new()
		v.custom_minimum_size = Vector2(92, 92)
		v.target = float(_angles[i])
		v.mouse_filter = Control.MOUSE_FILTER_STOP
		v.gui_input.connect(_on_valve_input.bind(i))
		row.add_child(v)
		_valves.append(v)
		_cur.append(0.0)

	set_progress(0, n, "校准 %d 个阀门" % n)


func _on_valve_input(event: InputEvent, i: int) -> void:
	if is_finished():
		return
	if not (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed):
		return
	_cur[i] = fmod(float(_cur[i]) + 15.0, 360.0)
	_valves[i].angle = float(_cur[i])
	_valves[i].queue_redraw()
	_update()


func _update() -> void:
	var ok := 0
	for i in _valves.size():
		var d: float = absf(fmod(float(_cur[i]) - float(_angles[i]) + 540.0, 360.0) - 180.0)
		var hit := d <= 12.0
		_valves[i].hit = hit
		_valves[i].queue_redraw()
		if hit:
			ok += 1
	set_progress(ok, _valves.size(), "阀门到位 %d / %d" % [ok, _valves.size()])
	if ok == _valves.size():
		finish_ok()


func debug_solve() -> void:
	for i in _cur.size():
		_cur[i] = float(_angles[i])
		_valves[i].angle = float(_angles[i])
		_valves[i].hit = true
		_valves[i].queue_redraw()
	set_progress(_valves.size(), _valves.size(), "阀门全部到位")
	finish_ok()
