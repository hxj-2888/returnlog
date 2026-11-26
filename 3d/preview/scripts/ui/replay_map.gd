extends Control
## 复盘蓝图轨迹画布（对照 2.5D js/ui/replay.js + home_ship_map.gd）。
## 只读 map_data、roster、frames 与当前回放时刻 cur_pt，在整船蓝图上画出 15 名船员坐标与状态，
## 以及当前选中事件的脉冲定位圈。

var map: Dictionary = {}
var roster: Array = []          # [{i, name, alien, ...}]
var frames: Array = []          # [{pt, n, p: [[seat, x, y, flags], ...]}]
var cur_pt := 0.0
var focus_pos := Vector2(-1, -1)
var has_focus := false
var font: Font

const C_ROOM_LIT := Color(0.0431, 0.0667, 0.0980)
const C_ROOM_DARK := Color(0.0314, 0.0510, 0.0784)
const C_EDGE := Color(0.1647, 0.2275, 0.2980)
const C_CORR := Color(0.0863, 0.1255, 0.1725)
const C_HUMAN := Color(0.5608, 0.7255, 0.8784)
const C_ALIEN := Color(0.8784, 0.3412, 0.3098)
const C_DEAD := Color(0.52, 0.24, 0.24, 0.72)
const C_DOWN := Color(0.95, 0.72, 0.26)
const C_GOLD := Color(0.9412, 0.7765, 0.4549)


func setup(p_map: Dictionary, p_roster: Array, p_frames: Array) -> void:
	map = p_map
	roster = p_roster
	frames = p_frames
	cur_pt = 0.0
	has_focus = false
	font = UIFont.get_font()
	queue_redraw()


func set_time(pt: float, p_focus: Vector2 = Vector2(-1, -1)) -> void:
	cur_pt = pt
	has_focus = p_focus.x >= 0.0 and p_focus.y >= 0.0
	focus_pos = p_focus
	queue_redraw()


func _find_frame() -> Dictionary:
	if frames.is_empty():
		return {}
	var lo := 0
	var hi := frames.size() - 1
	while lo < hi:
		var mid := (lo + hi + 1) >> 1
		if float((frames[mid] as Dictionary).get("pt", 0.0)) <= cur_pt:
			lo = mid
		else:
			hi = mid - 1
	return frames[lo] as Dictionary


func _seat_info(seat: int) -> Dictionary:
	for r: Dictionary in roster:
		if int(r.get("i", -1)) == seat:
			return r
	return {"i": seat, "name": "#%d" % seat, "alien": false}


func _draw() -> void:
	var w := size.x
	var h := size.y
	if w < 8.0 or h < 8.0:
		return
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.02, 0.03, 0.05, 0.96), true)
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.16, 0.22, 0.30, 0.9), false, 1.0)
	if map.is_empty():
		if font != null:
			draw_string(font, Vector2(18, 28), "（无地图数据）", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(0.55, 0.62, 0.72))
		return

	var b: Dictionary = map.get("bounds", {}) as Dictionary
	var bw := float(b.get("w", 98.0))
	var bh := float(b.get("h", 94.0))
	var pad := 10.0
	var s := minf((w - pad * 2.0) / bw, (h - pad * 2.0) / bh)
	var off := Vector2((w - bw * s) * 0.5, (h - bh * s) * 0.5)
	draw_set_transform(off, 0.0, Vector2(s, s))

	var corridor_w := float((map.get("scale", {}) as Dictionary).get("corridor_w", 3.2))
	for c: Dictionary in map.get("corridors", []):
		var pts := PackedVector2Array()
		for p: Array in c.get("pts", []):
			pts.append(Vector2(float(p[0]), float(p[1])))
		if pts.size() >= 2:
			draw_polyline(pts, C_CORR, corridor_w, true)

	for r: Dictionary in map.get("rooms", []):
		var poly := PackedVector2Array()
		for p: Array in r.get("poly", []):
			poly.append(Vector2(float(p[0]), float(p[1])))
		if poly.size() < 3:
			continue
		var fill := C_ROOM_DARK if String(r.get("light", "bright")) == "dark" else C_ROOM_LIT
		draw_colored_polygon(poly, fill)
		var ring := poly.duplicate()
		ring.append(poly[0])
		draw_polyline(ring, C_EDGE, 0.26, true)

	if has_focus:
		draw_arc(focus_pos, 2.8, 0.0, TAU, 28, C_GOLD, 0.45, true)
		draw_arc(focus_pos, 4.6, 0.0, TAU, 28, Color(C_GOLD.r, C_GOLD.g, C_GOLD.b, 0.42), 0.25, true)

	var fr := _find_frame()
	var plist: Array = fr.get("p", []) as Array

	# 切回屏幕空间画房名与船员圆点/姓名，保证文字与圆点锐利清晰
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	if font != null:
		for r: Dictionary in map.get("rooms", []):
			var lb: Array = r.get("label", [0, 0]) as Array
			var sp := off + Vector2(float(lb[0]), float(lb[1])) * s
			draw_string(font, sp + Vector2(-14, 4), String(r.get("name", "")),
				HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(0.32, 0.39, 0.48, 0.82))

	for ent in plist:
		if not (ent is Array) or (ent as Array).size() < 4:
			continue
		var arr := ent as Array
		var seat := int(arr[0])
		var pos := off + Vector2(float(arr[1]), float(arr[2])) * s
		var flags := int(arr[3])
		var alive := (flags & 1) != 0
		var downed := (flags & 2) != 0
		var drag := (flags & 8) != 0
		var info := _seat_info(seat)
		var is_alien := bool(info.get("alien", false))
		var nm := String(info.get("name", "#%d" % seat))
		if alive:
			var col := C_ALIEN if is_alien else C_HUMAN
			draw_circle(pos, 4.8, col)
			if downed:
				draw_arc(pos, 7.0, 0.0, TAU, 16, C_DOWN, 1.8, true)
			elif drag:
				draw_arc(pos, 7.0, 0.0, TAU, 16, Color(1, 1, 1, 0.85), 1.4, true)
		else:
			draw_line(pos + Vector2(-3.5, -3.5), pos + Vector2(3.5, 3.5), C_DEAD, 1.8, true)
			draw_line(pos + Vector2(-3.5, 3.5), pos + Vector2(3.5, -3.5), C_DEAD, 1.8, true)
		if font != null:
			var tcol := (Color(0.95, 0.72, 0.70) if is_alien else Color(0.84, 0.90, 0.96)) if alive else Color(0.45, 0.48, 0.52, 0.75)
			draw_string(font, pos + Vector2(6, 4), nm.substr(0, 3), HORIZONTAL_ALIGNMENT_LEFT, -1, 10, tcol)

	if font != null:
		var leg := "蓝=人类  红=内鬼  黄圈=倒地  ×=死亡  · 帧数 %d" % frames.size()
		draw_string(font, Vector2(10, h - 8), leg, HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(0.55, 0.62, 0.70))
