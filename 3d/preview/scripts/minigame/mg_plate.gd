extends "res://scripts/minigame/mg_base.gd"

## 图内任务通用引擎（对应 2.5D 的 js/t2/plate-task.js）
## 支持 6 种图内动词：tap / tapSeq / hold / holdBand / drag / aim。
## 所有板坐标与任务数值均来自 res://data/minigames.json（经 mg_data.gd）。

const VERBS := ["tap", "tapSeq", "hold", "holdBand", "drag", "aim"]
const SKIN_COLORS := {
	"cut": Color(0.025, 0.045, 0.075, 0.80),
	"dirty": Color(0.08, 0.09, 0.11, 0.64),
	"off": Color(0.02, 0.03, 0.045, 0.86),
}

var _valid := false
var _plate: Dictionary = {}
var _spec: Dictionary = {}
var _verb := "tap"
var _tex: Texture2D
var _crop := Rect2()
var _accent := COL_GOLD
var _skin := "cut"

var _spots: Array = []
var _need := 1
var _done := 0
var _seq_next := 0
var _hold_idx := -1
var _drag_idx := -1
var _drag_start := Vector2.ZERO
var _drag_offset := Vector2.ZERO

var _aim_box := Rect2()
var _aim_lo := 0.44
var _aim_hi := 0.56
var _aim_period := 1.8
var _aim_pos := 0.0
var _aim_dir := 1.0
var _aim_hit_t := 0.0

var _peek := false
var _peek_btn: Button
var _pops: Array = []
var _scale := 1.0
var _origin := Vector2.ZERO


func is_valid() -> bool:
	return _valid


func build() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(0, 300)

	_plate = MinigameData.plate_for_label(game_data, task_label)
	_spec = MinigameData.task_cfg(game_data, task_label)
	_verb = String(_spec.get("verb", "tap"))
	if _plate.is_empty() or not VERBS.has(_verb):
		_valid = false
		return

	var img_path := String(_plate.get("image", ""))
	if img_path == "":
		_valid = false
		return
	_tex = load(img_path) as Texture2D
	if _tex == null:
		_valid = false
		return

	var sz: Array = _plate.get("size", [])
	if sz.size() < 2:
		_valid = false
		return
	var tex_w := float(sz[0])
	var tex_h := float(sz[1])
	var crop_arr: Array = _plate.get("crop", [0, 0, tex_w, tex_h])
	if crop_arr.size() != 4:
		crop_arr = [0, 0, tex_w, tex_h]
	_crop = Rect2(float(crop_arr[0]), float(crop_arr[1]), float(crop_arr[2]), float(crop_arr[3]))
	if _crop.size.x <= 0.0 or _crop.size.y <= 0.0:
		_valid = false
		return

	_accent = Color(String(_spec.get("color", "#F0C674")))
	_skin = String(_spec.get("skin", _plate.get("skin", "cut")))
	if not SKIN_COLORS.has(_skin):
		_skin = "cut"

	if _verb == "aim":
		if not _init_aim():
			_valid = false
			return
	else:
		if not _init_spots():
			_valid = false
			return

	_valid = true
	set_process(true)
	_build_peek_button()
	_emit_initial_progress()


func _init_aim() -> bool:
	var lanes: Array = _plate.get("lanes", [])
	if lanes.is_empty():
		return false
	var lane: Dictionary = lanes[0]
	_need = maxi(1, int(_spec.get("n", 4)))
	_aim_box = _box_of({
		"shape": "rect",
		"x": lane.get("x", 0.0),
		"y": lane.get("y", 0.0),
		"w": lane.get("w", 100.0),
		"h": lane.get("h", 100.0),
	})
	var band: Array = lane.get("band", [0.44, 0.56])
	var b0 := float(band[0]) if band.size() >= 1 else 0.44
	var b1 := float(band[1]) if band.size() >= 2 else 0.56
	_aim_lo = clampf(minf(b0, b1), 0.0, 1.0)
	_aim_hi = clampf(maxf(b0, b1), 0.0, 1.0)
	_aim_period = maxf(0.6, float(lane.get("period", 1.8)))
	_aim_pos = 0.0
	_aim_dir = 1.0
	return true


func _init_spots() -> bool:
	var raw_spots: Array = _plate.get("spots", []).duplicate()
	raw_spots.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return int(a.get("order", 0)) < int(b.get("order", 0))
	)
	var use_val: Variant = _spec.get("use", null)
	var use_roles: Array = []
	if use_val is String and String(use_val) != "":
		use_roles.append(String(use_val))
	elif use_val is Array:
		for item in use_val:
			use_roles.append(String(item))

	var filtered: Array = []
	for p in raw_spots:
		if use_roles.is_empty() or use_roles.has(String(p.get("role", ""))):
			filtered.append(p)
	if filtered.is_empty():
		return false

	_need = clampi(int(_spec.get("n", filtered.size())), 1, maxi(1, filtered.size()))
	var default_hold := float(_spec.get("hold", 0.9))
	var default_dur := float(_spec.get("dur", 2.2))
	var default_band: Variant = _spec.get("band", [55, 75])

	for i in filtered.size():
		var p: Dictionary = filtered[i].duplicate(true)
		p["order"] = i + 1
		var b := _box_of(p)
		var hole_b := _box_of(p["hole"]) if p.has("hole") and p["hole"] is Dictionary else b
		var band_arr: Array = p.get("band", default_band) if p.get("band", default_band) is Array else [55, 75]
		var b0 := float(band_arr[0]) if band_arr.size() >= 1 else 55.0
		var b1 := float(band_arr[1]) if band_arr.size() >= 2 else 75.0
		var lo := clampf(minf(b0, b1), 2.0, 98.0)
		var hi := clampf(maxf(b0, b1), 2.0, 98.0)
		var to_arr: Variant = p.get("to", null)
		var to_vec := Vector2(b.get_center().x + 90.0, b.get_center().y)
		if to_arr is Array and to_arr.size() >= 2:
			to_vec = Vector2(float(to_arr[0]), float(to_arr[1]))
		var dur := float(p.get("hold", default_hold)) if _verb == "hold" else float(p.get("dur", default_dur))
		_spots.append({
			"i": i,
			"order": i + 1,
			"p": p,
			"box": b,
			"hole_box": hole_b,
			"done": false,
			"idle": _verb == "tapSeq" and i >= _need,
			"holding": false,
			"v": 0.0,
			"dur": maxf(0.05, dur),
			"lo": lo,
			"hi": hi,
			"to": to_vec,
			"to_r": maxf(20.0, float(p.get("toR", 34.0))),
			"shake_t": 0.0,
		})
	return true


func _build_peek_button() -> void:
	_peek_btn = button("按住看原图")
	_peek_btn.anchor_left = 0.5
	_peek_btn.anchor_right = 0.5
	_peek_btn.anchor_top = 1.0
	_peek_btn.anchor_bottom = 1.0
	_peek_btn.offset_left = -68
	_peek_btn.offset_right = 68
	_peek_btn.offset_top = -34
	_peek_btn.offset_bottom = -4
	_peek_btn.button_down.connect(func() -> void:
		_peek = true
		_peek_btn.text = "原图"
		queue_redraw()
	)
	_peek_btn.button_up.connect(func() -> void:
		_peek = false
		_peek_btn.text = "按住看原图"
		queue_redraw()
	)
	add_child(_peek_btn)


func _emit_initial_progress() -> void:
	var fallback_hints := {
		"tap": "点按图上标出的位置，逐个处理；点错不重置",
		"tapSeq": "按图上的 1→2→3 顺序点；点错不重置",
		"hold": "按住不放，圆环充满即完成；松手会慢慢退回",
		"holdBand": "按住推进，松手落在亮带上即完成；过头会自己退回来",
		"drag": "按住零件拖到虚线缺口，对准就归位；拖歪不重置",
		"aim": "准星扫进亮带时点击；脱靶不扣进度",
	}
	var msg := String(_spec.get("hint", fallback_hints.get(_verb, "")))
	set_progress(0, _need, msg)


func _box_of(p: Dictionary) -> Rect2:
	var shape := String(p.get("shape", "rect"))
	var px := float(p.get("x", 0.0))
	var py := float(p.get("y", 0.0))
	if shape == "circle":
		var raw_r: Variant = p.get("r", 20.0)
		var r_num := 20.0 if raw_r == null or float(raw_r) <= 0.0 else float(raw_r)
		var r := maxf(14.0, r_num)
		return Rect2(px - r, py - r, r * 2.0, r * 2.0)
	var raw_w: Variant = p.get("w", 36.0)
	var raw_h: Variant = p.get("h", 36.0)
	var w := maxf(28.0, float(raw_w) if raw_w != null else 36.0)
	var h := maxf(28.0, float(raw_h) if raw_h != null else 36.0)
	if shape == "point":
		return Rect2(px - w * 0.5, py - h * 0.5, w, h)
	return Rect2(px, py, w, h)


func _process(delta: float) -> void:
	if not _valid:
		return
	for pop in _pops:
		pop["t"] = float(pop["t"]) - delta
	_pops = _pops.filter(func(pop: Dictionary) -> bool: return float(pop["t"]) > 0.0)

	if not is_finished():
		if _verb == "aim":
			_aim_pos += _aim_dir * delta / _aim_period
			if _aim_pos >= 1.0:
				_aim_pos = 1.0
				_aim_dir = -1.0
			elif _aim_pos <= 0.0:
				_aim_pos = 0.0
				_aim_dir = 1.0
			if _aim_hit_t > 0.0:
				_aim_hit_t = maxf(0.0, _aim_hit_t - delta)
		else:
			_process_spots(delta)
		queue_redraw()


func _process_spots(delta: float) -> void:
	for i in _spots.size():
		var st: Dictionary = _spots[i]
		if float(st["shake_t"]) > 0.0:
			st["shake_t"] = maxf(0.0, float(st["shake_t"]) - delta)
		if bool(st["done"]):
			continue
		if _verb == "hold":
			if bool(st["holding"]):
				st["v"] = minf(1.0, float(st["v"]) + delta / float(st["dur"]))
				if float(st["v"]) >= 1.0:
					st["holding"] = false
					if _hold_idx == i:
						_hold_idx = -1
					_mark_spot(st, "已处理")
			elif float(st["v"]) > 0.0:
				st["v"] = maxf(0.0, float(st["v"]) - delta * 0.9)
		elif _verb == "holdBand":
			if bool(st["holding"]):
				st["v"] = minf(1.0, float(st["v"]) + delta / float(st["dur"]))
			elif float(st["v"]) > 0.0:
				st["v"] = maxf(0.0, float(st["v"]) - delta * 0.45)


func _draw() -> void:
	if not _valid or _tex == null:
		return
	var view := _sync_view_transform()
	draw_texture_rect_region(_tex, view, _crop, Color.WHITE)

	if _verb == "aim":
		_draw_aim()
	else:
		for i in _spots.size():
			var st: Dictionary = _spots[i]
			if bool(st["done"]):
				_draw_spot_done(st)
			else:
				_draw_spot_pending(st, i)

	for pop in _pops:
		var t := float(pop["t"])
		var prog := 1.0 - clampf(t / 0.56, 0.0, 1.0)
		var vbox := _to_view_rect(pop["box"])
		var r0 := maxf(6.0, minf(vbox.size.x, vbox.size.y) * 0.5)
		var r := r0 * lerpf(0.55, 1.7, prog)
		draw_arc(vbox.get_center(), r, 0.0, TAU, 32,
			Color(_accent.r, _accent.g, _accent.b, 0.9 * (1.0 - prog)), 2.2, true)


func _draw_spot_pending(st: Dictionary, idx: int) -> void:
	var shake_x := 0.0
	if float(st["shake_t"]) > 0.0:
		shake_x = sin(float(st["shake_t"]) * 48.0) * 4.5
	var offset := Vector2(shake_x, 0.0)
	var vbox := _to_view_rect(st["box"])
	vbox.position += offset
	var vhole := _to_view_rect(st["hole_box"])
	vhole.position += offset

	if not _peek:
		_draw_hole_mask(vhole)

	if _verb == "drag":
		var vto := _to_view(st["to"])
		var vto_r := float(st["to_r"]) * _scale
		_draw_dashed_circle(vto, vto_r, Color(_accent.r, _accent.g, _accent.b, 0.8), 2.0)

	if _verb == "holdBand":
		var lo := float(st["lo"])
		var hi := float(st["hi"])
		var by := vbox.position.y + vbox.size.y * (1.0 - hi / 100.0)
		var bh := vbox.size.y * (hi - lo) / 100.0
		draw_rect(Rect2(vbox.position.x, by, vbox.size.x, bh),
			Color(_accent.r, _accent.g, _accent.b, 0.22))
		draw_line(Vector2(vbox.position.x, by), Vector2(vbox.end.x, by), _accent, 1.4)
		draw_line(Vector2(vbox.position.x, by + bh), Vector2(vbox.end.x, by + bh), _accent, 1.4)

	if (_verb == "hold" or _verb == "holdBand") and float(st["v"]) > 0.0:
		var v := float(st["v"])
		var fh := vbox.size.y * v
		draw_rect(Rect2(vbox.position.x, vbox.end.y - fh, vbox.size.x, fh),
			Color(_accent.r, _accent.g, _accent.b, 0.30))

	if bool(st["holding"]):
		draw_rect(vbox, Color(_accent.r, _accent.g, _accent.b, 0.16))

	if not bool(st["idle"]):
		_draw_dashed_rect(vbox, Color(_accent.r, _accent.g, _accent.b, 0.65), 1.6, 5.0)
		var pulse := 0.5 + 0.5 * sin(Time.get_ticks_msec() / 320.0 + idx * 1.1)
		var dot_r := maxf(3.0, minf(vbox.size.x, vbox.size.y) * 0.14) * (0.9 + 0.35 * pulse)
		draw_circle(vbox.get_center(), dot_r, Color(_accent.r, _accent.g, _accent.b, 0.35 + 0.35 * pulse))

	if _verb == "tapSeq" and idx < _need:
		_draw_seq_badge(vbox, idx + 1, 1.0)

	if _verb == "drag" and _drag_idx == idx:
		var dragged := Rect2(vbox.position + _drag_offset, vbox.size)
		draw_rect(dragged, Color(_accent.r, _accent.g, _accent.b, 0.22))
		draw_rect(dragged, _accent, false, 2.0)


func _draw_spot_done(st: Dictionary) -> void:
	var p: Dictionary = st["p"]
	if not p.has("fx") or not (p["fx"] is Dictionary):
		return
	var f: Dictionary = p["fx"]
	var box: Rect2 = st["box"]
	var vbox := _to_view_rect(box)

	# 原位置压暗底槽，表现零件被搬走/旋开/压下后的空位
	draw_rect(vbox, SKIN_COLORS[_skin])
	if bool(f.get("glow", false)):
		draw_circle(vbox.get_center(), maxf(vbox.size.x, vbox.size.y) * 0.62,
			Color(_accent.r, _accent.g, _accent.b, 0.34))

	var shift := Vector2(float(f.get("dx", 0.0)) * vbox.size.x, float(f.get("dy", 0.0)) * vbox.size.y)
	var rad := deg_to_rad(float(f.get("deg", 0.0)))
	var sc := float(f.get("s", 1.0))
	var mod := Color.WHITE
	if f.has("dim"):
		var d := float(f.get("dim", 1.0))
		mod = Color(d, d, d, 1.0)
	elif f.has("lit"):
		var l := float(f.get("lit", 1.0))
		mod = Color(l, l, l, 1.0)

	draw_set_transform(vbox.get_center() + shift, rad, Vector2(sc, sc))
	draw_texture_rect_region(_tex, Rect2(-vbox.size * 0.5, vbox.size), box, mod)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _draw_aim() -> void:
	var vbox := _to_view_rect(_aim_box)
	if not _peek and not is_finished():
		_draw_hole_mask(vbox)
	draw_rect(vbox, Color(_accent.r, _accent.g, _accent.b, 0.72), false, 1.6)

	var bx := vbox.position.x + vbox.size.x * _aim_lo
	var bw := vbox.size.x * (_aim_hi - _aim_lo)
	draw_rect(Rect2(bx, vbox.position.y, bw, vbox.size.y),
		Color(_accent.r, _accent.g, _accent.b, 0.22))
	draw_line(Vector2(bx, vbox.position.y), Vector2(bx, vbox.end.y), _accent, 1.5)
	draw_line(Vector2(bx + bw, vbox.position.y), Vector2(bx + bw, vbox.end.y), _accent, 1.5)

	if _aim_hit_t > 0.0:
		draw_rect(vbox, Color(_accent.r, _accent.g, _accent.b, 0.24 * (_aim_hit_t / 0.25)))

	var mx := vbox.position.x + vbox.size.x * _aim_pos
	draw_line(Vector2(mx, vbox.position.y - 3.0), Vector2(mx, vbox.end.y + 3.0),
		Color(_accent.r, _accent.g, _accent.b, 0.35), 6.0)
	draw_line(Vector2(mx, vbox.position.y - 3.0), Vector2(mx, vbox.end.y + 3.0), _accent, 2.2)


func _draw_hole_mask(rect: Rect2) -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = SKIN_COLORS[_skin]
	sb.set_corner_radius_all(int(minf(rect.size.x, rect.size.y) * 0.24))
	draw_style_box(sb, rect)


func _draw_seq_badge(vbox: Rect2, num: int, alpha: float) -> void:
	var br := Rect2(vbox.position + Vector2(2.0, 2.0), Vector2(18.0, 18.0))
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.04, 0.055, 0.08, 0.88 * alpha)
	sb.border_color = Color(_accent.r, _accent.g, _accent.b, alpha)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(9)
	draw_style_box(sb, br)
	draw_string(ui_font(), Vector2(br.position.x, br.position.y + 13.0), str(num),
		HORIZONTAL_ALIGNMENT_CENTER, br.size.x, 11, Color(_accent.r, _accent.g, _accent.b, alpha))


func _draw_dashed_rect(rect: Rect2, color: Color, width: float, dash: float) -> void:
	var tl := rect.position
	var tr := Vector2(rect.end.x, rect.position.y)
	var br := rect.end
	var bl := Vector2(rect.position.x, rect.end.y)
	draw_dashed_line(tl, tr, color, width, dash, true, true)
	draw_dashed_line(tr, br, color, width, dash, true, true)
	draw_dashed_line(br, bl, color, width, dash, true, true)
	draw_dashed_line(bl, tl, color, width, dash, true, true)


func _draw_dashed_circle(center: Vector2, radius: float, color: Color, width: float) -> void:
	var segs := 24
	for k in range(0, segs, 2):
		var a0 := TAU * float(k) / float(segs)
		var a1 := TAU * float(k + 1) / float(segs)
		draw_arc(center, radius, a0, a1, 4, color, width, true)


func _gui_input(event: InputEvent) -> void:
	if not _valid or is_finished():
		return
	var view := _sync_view_transform()
	if event is InputEventMouseMotion:
		_on_mouse_motion(event.position)
		return
	if not (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT):
		return
	if event.pressed:
		if not view.has_point(event.position):
			return
		_on_left_press(event.position)
		accept_event()
	else:
		_on_left_release(event.position)
		accept_event()


func _on_mouse_motion(pos: Vector2) -> void:
	if _verb == "drag" and _drag_idx >= 0:
		_drag_offset = pos - _drag_start
		queue_redraw()
	elif _verb == "hold" and _hold_idx >= 0:
		var img_pos := _to_img(pos)
		var st: Dictionary = _spots[_hold_idx]
		if not Rect2(st["box"]).has_point(img_pos):
			st["holding"] = false
			_hold_idx = -1


func _on_left_press(pos: Vector2) -> void:
	var img_pos := _to_img(pos)
	if _verb == "aim":
		if _aim_box.has_point(img_pos):
			_handle_aim_click()
		return

	var hit := _find_hit_spot(img_pos)
	if hit < 0:
		return
	var st: Dictionary = _spots[hit]
	match _verb:
		"tap":
			if bool(st["done"]):
				set_tip(String(_spec.get("againTip", "这处已经处理过了")))
			else:
				_mark_spot(st, "已处理")
		"tapSeq":
			if bool(st["done"]) or bool(st["idle"]):
				return
			if hit != _seq_next:
				st["shake_t"] = 0.3
				set_tip("顺序不对：先把 %d 号处理掉（编号就画在图上）" % (_seq_next + 1), true)
				queue_redraw()
			else:
				_seq_next += 1
				_mark_spot(st, "已处理")
		"hold", "holdBand":
			if not bool(st["done"]):
				_hold_idx = hit
				st["holding"] = true
		"drag":
			if not bool(st["done"]):
				_drag_idx = hit
				_drag_start = pos
				_drag_offset = Vector2.ZERO
				queue_redraw()


func _on_left_release(pos: Vector2) -> void:
	if _verb == "hold" and _hold_idx >= 0:
		_spots[_hold_idx]["holding"] = false
		_hold_idx = -1
	elif _verb == "holdBand" and _hold_idx >= 0:
		var idx := _hold_idx
		_hold_idx = -1
		var st: Dictionary = _spots[idx]
		st["holding"] = false
		if bool(st["done"]):
			return
		var val := float(st["v"]) * 100.0
		if val >= float(st["lo"]) and val <= float(st["hi"]):
			_mark_spot(st, "到位")
		elif val > 0.0:
			set_tip("还没到亮带，再按住一会儿" if val < float(st["lo"]) else "过头了，等它退回来再松手", true)
	elif _verb == "drag" and _drag_idx >= 0:
		var idx := _drag_idx
		_drag_idx = -1
		var st: Dictionary = _spots[idx]
		var manhattan := absf(pos.x - _drag_start.x) + absf(pos.y - _drag_start.y)
		_drag_offset = Vector2.ZERO
		var drop_img := _to_img(pos)
		if drop_img.distance_to(st["to"]) <= float(st["to_r"]):
			_mark_spot(st, "已归位")
		elif manhattan > 6.0:
			set_tip("没对准缺口，再拖一次", true)
		queue_redraw()


func _handle_aim_click() -> void:
	if _aim_pos >= _aim_lo and _aim_pos <= _aim_hi:
		_done += 1
		_aim_hit_t = 0.25
		_pops.append({"box": _aim_box, "t": 0.56})
		set_progress(_done, _need, "命中 %d / %d" % [_done, _need])
		queue_redraw()
		if _done >= _need:
			finish_ok()
	else:
		set_tip("脱靶了，等准星进亮带再点；不扣进度", true)


func _find_hit_spot(img_pos: Vector2) -> int:
	# 优先命中未完成且非 idle 的热点，避免重叠框被已完成项抢占
	for i in _spots.size():
		var st: Dictionary = _spots[i]
		if not bool(st["done"]) and not bool(st["idle"]) and Rect2(st["box"]).has_point(img_pos):
			return i
	if _verb == "tap":
		for i in _spots.size():
			var st: Dictionary = _spots[i]
			if bool(st["done"]) and Rect2(st["box"]).has_point(img_pos):
				return i
	return -1


func _mark_spot(st: Dictionary, prefix: String = "已处理") -> void:
	if st.is_empty() or bool(st["done"]) or is_finished():
		return
	st["done"] = true
	st["holding"] = false
	_done += 1
	_pops.append({"box": st["hole_box"], "t": 0.56})
	set_progress(_done, _need, "%s %d / %d" % [prefix, _done, _need])
	queue_redraw()
	if _done >= _need:
		finish_ok()


func _draw_view() -> Rect2:
	var area := Rect2(Vector2(8.0, 4.0),
		Vector2(maxf(size.x - 16.0, 10.0), maxf(size.y - 44.0, 10.0)))
	var s := minf(area.size.x / maxf(_crop.size.x, 1.0), area.size.y / maxf(_crop.size.y, 1.0))
	var draw_size := _crop.size * s
	return Rect2(area.position + (area.size - draw_size) * 0.5, draw_size)


func _sync_view_transform() -> Rect2:
	var view := _draw_view()
	_scale = view.size.x / maxf(_crop.size.x, 1.0)
	_origin = view.position
	return view


func _to_view(p: Vector2) -> Vector2:
	return _origin + (p - _crop.position) * _scale


func _to_view_rect(r: Rect2) -> Rect2:
	return Rect2(_to_view(r.position), r.size * _scale)


func _to_img(p: Vector2) -> Vector2:
	return (p - _origin) / maxf(_scale, 0.0001) + _crop.position


func debug_solve() -> void:
	if not _valid:
		finish_fail("板数据缺失或动词不支持")
		return
	if _verb == "aim":
		_done = _need
		set_progress(_done, _need, "校准完成")
		queue_redraw()
		finish_ok()
		return
	for i in mini(_need, _spots.size()):
		_spots[i]["done"] = true
		_spots[i]["holding"] = false
	_done = _need
	set_progress(_done, _need, "全部完成")
	queue_redraw()
	finish_ok()


func get_test_info() -> Dictionary:
	_sync_view_transform()
	var out_spots: Array = []
	for i in _spots.size():
		var st: Dictionary = _spots[i]
		var vrect := _to_view_rect(st["box"])
		out_spots.append({
			"i": i,
			"order": int(st["order"]),
			"done": bool(st["done"]),
			"idle": bool(st["idle"]),
			"center": vrect.get_center(),
			"rect": vrect,
			"to": _to_view(st["to"]),
			"to_r": float(st["to_r"]) * _scale,
			"dur": float(st["dur"]),
			"lo": float(st["lo"]),
			"hi": float(st["hi"]),
			"v": float(st["v"]),
		})
	var aim_info: Dictionary = {}
	if _verb == "aim":
		var avrect := _to_view_rect(_aim_box)
		aim_info = {
			"rect": avrect,
			"center": avrect.get_center(),
			"pos": _aim_pos,
			"lo": _aim_lo,
			"hi": _aim_hi,
			"in_band": _aim_pos >= _aim_lo and _aim_pos <= _aim_hi,
		}
	return {
		"verb": _verb,
		"need": _need,
		"done": _done,
		"plate_id": String(_plate.get("id", "")),
		"spots": out_spots,
		"aim": aim_info,
	}
