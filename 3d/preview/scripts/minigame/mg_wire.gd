extends "res://scripts/minigame/mg_base.gd"

## 接线 · 图内要素（对应 2.5D 的 buildPlate）
## 直接显示 panel-fix.png 的真实电线：断口是压在电线上的深色小块，
## 接通时把小块移走，让原图像素自己长回来 —— 不新增一根线。
## 板坐标真源：js/data/plates.js → 3d/preview/data/minigames.json（图片像素）。

var _plate: Dictionary = {}
var _tex: Texture2D
var _crop := Rect2()
var _wires: Array = []
var _state: Array = []
var _held_wire := -1
var _peek := false
var _pulses: Array = []

var _scale := 1.0
var _origin := Vector2.ZERO
var _peek_btn: Button


func build() -> void:
	set_process(true)
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(0, 300)

	_plate = MinigameDataRef.plate_for_label(game_data, task_label)
	if _plate.is_empty():
		var all: Dictionary = game_data.get("plates", {}).get("plates", {})
		if not all.is_empty():
			_plate = all.values()[0]
	if _plate.is_empty():
		set_tip("缺少板数据：先跑 node 3d/tools/export-minigames.cjs", true)
		return

	_crop = Rect2(
		float(_plate.get("crop", [0, 0, _plate.get("size", [768, 768])[0], _plate.get("size", [768, 768])[1]])[0]),
		float(_plate.get("crop", [0, 0, 768, 768])[1]),
		float(_plate.get("crop", [0, 0, 768, 768])[2]),
		float(_plate.get("crop", [0, 0, 768, 768])[3]))
	_tex = load(String(_plate.get("image", ""))) as Texture2D
	if _tex == null:
		set_tip("板图加载失败：" + String(_plate.get("image", "")), true)
		return

	var all_wires: Array = _plate.get("wires", [])
	var order: Array = []
	for i in all_wires.size():
		order.append(i)
	order = shuffled(order)
	var count: int = maxi(1, mini(all_wires.size(), int(cfg("n", tier_n(2, 3, 3)))))
	for k in count:
		var w: Dictionary = all_wires[order[k]]
		_wires.append(w)
		_state.append({"held": -1, "done": false})

	_peek_btn = button("按住看原图")
	_peek_btn.anchor_left = 0.5
	_peek_btn.anchor_right = 0.5
	_peek_btn.anchor_top = 1.0
	_peek_btn.anchor_bottom = 1.0
	_peek_btn.offset_left = -68
	_peek_btn.offset_right = 68
	_peek_btn.offset_top = -34
	_peek_btn.offset_bottom = -4
	_peek_btn.button_down.connect(func() -> void: _peek = true; queue_redraw())
	_peek_btn.button_up.connect(func() -> void: _peek = false; queue_redraw())
	add_child(_peek_btn)

	set_progress(0, _wires.size(),
		"共 %d 处断口：点这头 → 再点那头；接错线不重置" % _wires.size())


func _process(_delta: float) -> void:
	for p in _pulses:
		p.t -= _delta
	_pulses = _pulses.filter(func(p: Dictionary) -> bool: return p.t > 0.0)
	if not is_finished():
		queue_redraw()


func _draw() -> void:
	if _tex == null or _wires.is_empty():
		return
	var view := _draw_view()
	_scale = view.size.x / _crop.size.x
	_origin = view.position
	draw_texture_rect_region(_tex, view, _crop, Color.WHITE)

	for i in _wires.size():
		var w: Dictionary = _wires[i]
		var st: Dictionary = _state[i]
		if not st.done and not _peek:
			var cut: Dictionary = w.get("cut", {})
			var c := _to_view(Vector2(float(cut.get("x", 0)), float(cut.get("y", 0))))
			var cw := float(cut.get("w", _plate.get("cut", {}).get("w", 16))) * _scale
			var ch := float(cut.get("h", _plate.get("cut", {}).get("h", 30))) * _scale
			draw_set_transform(c, deg_to_rad(float(cut.get("angle", 0))), Vector2.ONE)
			draw_rect(Rect2(-cw * 0.5, -ch * 0.5, cw, ch), Color(0.008, 0.014, 0.022, 0.97))
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		if st.done:
			continue
		var col := Color(String(w.get("color", "#F0C674")))
		var ends := _ends_of(w)
		var pulse := 0.5 + 0.5 * sin(Time.get_ticks_msec() / 360.0 + i * 1.3)
		for k in 2:
			var p := _to_view(ends[k])
			var held := int(st.held) == k
			var halo := col
			halo.a = 0.10 + 0.10 * pulse
			draw_circle(p, (float(_plate.get("ember", {}).get("r", 4.6)) + 4.0) * _scale
				* (1.0 + 0.10 * pulse), halo)
			draw_circle(p, 6.0 * _scale, Color(0.02, 0.03, 0.045, 0.86))
			draw_arc(p, (7.0 if held else 6.0) * _scale, 0.0, TAU, 28,
				Color(1.0, 0.95, 0.82) if held else col, 2.2 if held else 1.4, true)
			draw_circle(p, (3.0 if held else 2.2) * _scale,
				Color(1.0, 0.95, 0.82) if held else Color("#F0C674"))

	for p in _pulses:
		var a := _to_view(p.a)
		var b := _to_view(p.b)
		var col := Color(p.color)
		col.a = clampf(p.t / 0.6, 0.0, 1.0)
		draw_line(a, b, col, 3.0 * _scale, true)


func _gui_input(event: InputEvent) -> void:
	if is_finished():
		return
	if not (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed):
		return
	var view := _draw_view()
	if not view.has_point(event.position):
		return
	var img: Vector2 = (event.position - _origin) / maxf(_scale, 0.0001) + _crop.position
	var hit_r := float(_plate.get("ember", {}).get("hit", 18))
	var best := -1
	var best_k := -1
	var best_d := hit_r
	for i in _wires.size():
		if _state[i].done:
			continue
		var ends := _ends_of(_wires[i])
		for k in 2:
			var d: float = img.distance_to(ends[k])
			if d < best_d:
				best_d = d
				best = i
				best_k = k
	if best >= 0:
		_on_end(best, best_k)
		accept_event()


func _on_end(i: int, k: int) -> void:
	var st: Dictionary = _state[i]
	if st.done:
		return
	if _held_wire >= 0 and _held_wire != i:
		# 2.5D 2026-11-09 取消「接错线整组重来」：只松开当前线头，已接的保留
		# （js/t2/minigame.js:515-518）。
		var prev: Dictionary = _state[_held_wire]
		prev.held = -1
		_held_wire = -1
		set_tip("接错线 · 已接的保留，重新捏这头", true)
		queue_redraw()
		return
	if int(st.held) == k:
		st.held = -1
		_held_wire = -1
		set_tip("松开线头 · 这头那头都行")
		queue_redraw()
		return
	if int(st.held) >= 0:
		_repair(i)
		return
	st.held = k
	_held_wire = i
	set_tip("已捏住这头 · 点另一头接上（接错线不重置）")
	queue_redraw()


func _repair(i: int) -> void:
	var st: Dictionary = _state[i]
	st.done = true
	st.held = -1
	_held_wire = -1
	var ends := _ends_of(_wires[i])
	_pulses.append({"a": ends[0], "b": ends[1], "t": 0.6,
		"color": String(_wires[i].get("color", "#F0C674"))})
	var done := 0
	for s in _state:
		if s.done:
			done += 1
	set_progress(done, _wires.size(),
		"全部接通" if done == _wires.size() else "接上了 · 还有 %d 处断口" % (_wires.size() - done))
	queue_redraw()
	if done == _wires.size():
		finish_ok()


func _ends_of(w: Dictionary) -> Array:
	var cut: Dictionary = w.get("cut", {})
	var a := deg_to_rad(float(cut.get("angle", 0)))
	var dx := cos(a)
	var dy := sin(a)
	var ch := float(_plate.get("cut", {}).get("h", 30))
	var d := ch * 0.5 + 2.5
	var c := Vector2(float(cut.get("x", 0)), float(cut.get("y", 0)))
	return [c - Vector2(dx, dy) * d, c + Vector2(dx, dy) * d]


func _draw_view() -> Rect2:
	var area := Rect2(Vector2(8, 4), Vector2(maxf(size.x - 16.0, 10.0), maxf(size.y - 42.0, 10.0)))
	var s: float = minf(area.size.x / _crop.size.x, area.size.y / _crop.size.y)
	var draw_size := _crop.size * s
	return Rect2(area.position + (area.size - draw_size) * 0.5, draw_size)


func _to_view(p: Vector2) -> Vector2:
	return _origin + (p - _crop.position) * _scale


func debug_solve() -> void:
	if _wires.is_empty():
		finish_fail("板数据缺失，无法接线")
		return
	for i in _wires.size():
		_state[i].done = true
		_state[i].held = -1
	_held_wire = -1
	set_progress(_wires.size(), _wires.size(), "全部接通")
	queue_redraw()
	finish_ok()


const MinigameDataRef := preload("res://scripts/minigame/mg_data.gd")
