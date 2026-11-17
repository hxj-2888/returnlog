extends Control
## 整船蓝图：直接读 map_v2.json 画（与对局、2.5D `js/ui/home.js#shipSVG` 同一份数据）。
## 只读，不写任何对局状态；高亮只改绘制颜色，不改数据。
##
## 坐标口径：map_v2 的 bounds 是格（98 × 94），图元都在格空间；
## 这里按 `min(w/bw, h/bh)` 等比内缩并居中，任何窗口比例都不裁切。

var map: Dictionary = {}
var accent := Color(0.5608, 0.6510, 0.7529)
var sel_rooms: Array = []
var sel_what := "point"
var has_sel := false
var font: Font

var _stars: Array = []          # [Vector2(0..1), radius, alpha]
var _star_size := Vector2.ZERO

## 2.5D 的配色，逐项对齐（index.html #home-ship .room / .cover / .pt / .pipe）
const C_ROOM_LIT := Color(0.0431, 0.0667, 0.0980)
const C_ROOM_DARK := Color(0.0314, 0.0510, 0.0784)
const C_ROOM_ON := Color(0.0745, 0.1255, 0.1686)
const C_EDGE := Color(0.1647, 0.2275, 0.2980)
const C_CORR := Color(0.0863, 0.1255, 0.1725)
const C_WALL := Color(0.0863, 0.1255, 0.1725)
const C_COVER := Color(0.1020, 0.1412, 0.1922)
const C_PT := Color(0.2902, 0.3373, 0.4000)
const C_PT_HARD := Color(0.4235, 0.4784, 0.5490)
const C_PIPE := Color(0.1490, 0.2588, 0.3059)
const C_LABEL := Color(0.2745, 0.3255, 0.4157)


func setup(p_map: Dictionary) -> void:
	map = p_map
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	queue_redraw()


func select_rooms(rooms: Array, what: String, p_accent: Color) -> void:
	sel_rooms = rooms
	sel_what = what
	accent = p_accent
	has_sel = true
	queue_redraw()


func _seed_stars() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 20261108
	for i in 90:
		_stars.append([Vector2(rng.randf(), rng.randf()), rng.randf_range(0.6, 1.9),
			rng.randf_range(0.12, 0.55)])


func _draw() -> void:
	var w := size.x
	var h := size.y
	if w < 4.0 or h < 4.0:
		return
	if _stars.is_empty() or _star_size != size:
		_stars.clear()
		_seed_stars()
		_star_size = size
	# 星点画在屏幕空间：不受地图 transform 影响，避免缩放后变糊
	for st: Array in _stars:
		var n: Vector2 = st[0]
		draw_circle(Vector2(n.x * w, n.y * h), float(st[1]), Color(1, 1, 1, float(st[2])))
	if map.is_empty():
		return

	var b: Dictionary = map.get("bounds", {})
	var bw := float(b.get("w", 98.0))
	var bh := float(b.get("h", 94.0))
	var s := minf(w / bw, h / bh)
	var off := Vector2((w - bw * s) * 0.5, (h - bh * s) * 0.5)
	draw_set_transform(off, 0.0, Vector2(s, s))

	var corridor_w := float((map.get("scale", {}) as Dictionary).get("corridor_w", 3.2))

	# 1) 走廊：先画，让舱室盖住接缝
	for c: Dictionary in map.get("corridors", []):
		var pts := PackedVector2Array()
		for p: Array in c.get("pts", []):
			pts.append(Vector2(float(p[0]), float(p[1])))
		if pts.size() >= 2:
			draw_polyline(pts, C_CORR, corridor_w, true)

	# 2) 舱室
	for r: Dictionary in map.get("rooms", []):
		var rid := String(r.get("id", ""))
		var on: bool = has_sel and sel_rooms.has(rid)
		var poly := PackedVector2Array()
		for p: Array in r.get("poly", []):
			poly.append(Vector2(float(p[0]), float(p[1])))
		if poly.size() < 3:
			continue
		var fill := C_ROOM_DARK if String(r.get("light", "bright")) == "dark" else C_ROOM_LIT
		var line := C_EDGE
		var lw := 0.22
		if has_sel:
			if on:
				fill = C_ROOM_ON
				line = accent
				lw = 0.34
			else:
				fill = Color(0.031, 0.047, 0.070, 0.34)
				line = Color(0.106, 0.141, 0.192, 0.34)
		draw_colored_polygon(poly, fill)
		var ring := poly.duplicate()
		ring.append(poly[0])
		draw_polyline(ring, line, lw, true)

	# 3) 斜切墙（rooms 的 poly 已经含斜角，walls 只是补断口，与 2.5D 同层）
	for seg: Array in map.get("walls", []):
		if seg.size() < 2:
			continue
		var a := Vector2(float(seg[0][0]), float(seg[0][1]))
		var c2 := Vector2(float(seg[1][0]), float(seg[1][1]))
		draw_line(a, c2, C_WALL, 0.36, true)

	# 4) 掩体
	for cv: Dictionary in map.get("cover", []):
		var rid := String(cv.get("room", ""))
		var on: bool = has_sel and sel_rooms.has(rid)
		var col := C_COVER
		var alpha := 0.85
		if has_sel:
			col = accent if on else Color(0.102, 0.141, 0.192, 0.28)
			alpha = 0.42 if on else 0.28
		col.a = alpha
		draw_rect(Rect2(float(cv.get("x", 0)), float(cv.get("y", 0)),
			float(cv.get("w", 1)), float(cv.get("h", 1))), col, true)

	# 5) 任务点（只在人类档亮）
	for pt: Dictionary in map.get("points", []):
		var rid := String(pt.get("room", ""))
		var on: bool = has_sel and sel_what == "point" and sel_rooms.has(rid)
		var col := C_PT_HARD if String(pt.get("kind", "")) == "hard" else C_PT
		if has_sel:
			col = accent if on else Color(col.r, col.g, col.b, 0.30)
		draw_circle(Vector2(float(pt.get("x", 0)), float(pt.get("y", 0))), 0.42, col)

	# 6) 管道口（只在异形档亮）
	for pp: Dictionary in map.get("pipes", []):
		var rid := String(pp.get("room", ""))
		var on: bool = has_sel and sel_what == "pipe" and sel_rooms.has(rid)
		var col := accent if on else C_PIPE
		if has_sel and not on:
			col = Color(col.r, col.g, col.b, 0.38)
		draw_arc(Vector2(float(pp.get("x", 0)), float(pp.get("y", 0))), 0.85,
			0.0, TAU, 28, col, 0.30 if not on else 0.42, true)

	# 7) 房名：必须在屏幕空间画 —— draw_string 的 font_size 是整数像素，
	#    在 9 倍缩放的 transform 下会被截断成 1px，等于看不见。
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	if font != null:
		var fs_px := clampi(int(8.0 + s * 0.68), 12, 17)
		for r: Dictionary in map.get("rooms", []):
			var rid := String(r.get("id", ""))
			var on: bool = has_sel and sel_rooms.has(rid)
			var lb: Array = r.get("label", [0, 0])
			var txt := String(r.get("name", ""))
			var scr := off + Vector2(float(lb[0]), float(lb[1]) + 1.2) * s
			var tw := font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs_px).x
			var at := scr - Vector2(tw * 0.5, 0.0)
			# 房名压在家具上：先描一圈黑边，否则深色掩体上的字读不出来
			draw_string_outline(font, at, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs_px, 3,
				Color(0.01, 0.02, 0.03, 0.85 if not has_sel or on else 0.35))
			var col := C_LABEL
			if has_sel:
				col = accent if on else Color(0.235, 0.278, 0.345, 0.50)
			draw_string(font, at, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs_px, col)
