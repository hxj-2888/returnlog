extends Control
## 局内小地图：只读地图静态数据 + sim 运行时状态（深炭透明底板 + 轻量舱室标题 + 朝向箭头）。

const W := 240.0
const PAD_T := 22.0
const LEG_H := 22.0
const SHORT := {
	"bridge": "会议室", "warehouse": "仓库", "ecosys": "生态舱", "engine": "引擎",
	"power": "配电", "transit": "食堂", "cam": "监控", "med": "医疗",
	"armory": "军械", "fun": "娱乐",
}

var map: Dictionary = {}
var sim
var player_pos := Vector2.ZERO
var player_yaw := 0.0
var player_spectator := false
var room_name_text := "船体蓝图"
var font: Font

var _t := 0.0
var _acc := 0.0


func setup(p_map: Dictionary, p_sim) -> void:
	map = p_map
	sim = p_sim
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	font = UIFont.get_font()
	var bw := float((map.get("bounds", {}) as Dictionary).get("w", 98))
	var bh := float((map.get("bounds", {}) as Dictionary).get("h", 94))
	custom_minimum_size = Vector2(W, W * bh / maxf(1.0, bw) + PAD_T + LEG_H)
	size = custom_minimum_size
	set_process(true)


func _process(delta: float) -> void:
	if not is_visible_in_tree():
		return
	_t += delta
	_acc += delta
	if _acc >= 0.1:
		_acc = 0.0
		queue_redraw()


func _draw() -> void:
	if map.is_empty() or sim == null:
		return
	var bounds: Dictionary = map.get("bounds", {}) as Dictionary
	var bw := float(bounds.get("w", 98))
	var bh := float(bounds.get("h", 94))
	var k := W / maxf(1.0, bw)
	var mh := bh * k
	var h := mh + PAD_T + LEG_H
	var T := _t

	# 2D 原版透明暗底板 + 细边框
	draw_rect(Rect2(Vector2.ZERO, Vector2(W, h)), Color(0.027, 0.047, 0.071, 0.92))
	draw_rect(Rect2(Vector2.ZERO, Vector2(W, h)), Color.html("#33465C"), false, 1.0)

	# 顶部轻量小字：左当前舱室名，右照明状态
	var rname := room_name_text if room_name_text != "" else "船体蓝图"
	draw_string(font, Vector2(8, 15), rname, HORIZONTAL_ALIGNMENT_LEFT, 148, 11,
		Color.html("#DDE3EC"))
	var st := int(sim.light_state)
	var ltxt := "全船断电" if st == 2 else ("照明全亮" if st == 1 else "照明正常")
	var lcol := Color.html("#FF6B61") if st == 2 else (
		Color.html("#7FE3B4") if st == 1 else Color.html("#8FD3F0"))
	draw_string(font, Vector2(0, 15), ltxt, HORIZONTAL_ALIGNMENT_RIGHT, W - 8, 10, lcol)

	var my := PAD_T
	_draw_grid_and_corridors(bw, bh, mh, k, my)
	_draw_rooms_and_marks(k, my, T)
	_draw_player_arrow(k, my, T)
	_draw_legend(h)


func _draw_grid_and_corridors(bw: float, bh: float, mh: float, k: float, my: float) -> void:
	var grid := Color(0.43, 0.58, 0.72, 0.08)
	var gx := 10.0
	while gx < bw:
		draw_line(Vector2(gx * k, my), Vector2(gx * k, my + mh), grid, 0.5)
		gx += 10.0
	var gy := 10.0
	while gy < bh:
		draw_line(Vector2(0, my + gy * k), Vector2(W, my + gy * k), grid, 0.5)
		gy += 10.0
	var corr_lit: bool = int(sim.light_state) != 2
	for c: Dictionary in (map.get("corridors", []) as Array):
		var pts := PackedVector2Array()
		for q: Array in (c.get("pts", []) as Array):
			pts.append(Vector2(float(q[0]) * k, my + float(q[1]) * k))
		if pts.size() < 2:
			continue
		draw_polyline(pts, Color(0.69, 0.75, 0.82, 0.42) if corr_lit
			else Color(0.36, 0.41, 0.46, 0.30), 4.0, true)
		draw_polyline(pts, Color(0.86, 0.92, 0.96, 0.55) if corr_lit
			else Color(0.51, 0.56, 0.61, 0.22), 1.0, true)


func _draw_rooms_and_marks(k: float, my: float, T: float) -> void:
	for r: Dictionary in (map.get("rooms", []) as Array):
		var rid := String(r.get("id", ""))
		var poly := PackedVector2Array()
		for q: Array in (r.get("poly", []) as Array):
			poly.append(Vector2(float(q[0]) * k, my + float(q[1]) * k))
		if poly.size() < 3:
			continue
		var lit := _room_lit(rid, String(r.get("light", "")))
		draw_colored_polygon(poly, Color(0.776, 0.820, 0.871, 0.86) if lit
			else Color(0.188, 0.224, 0.271, 0.90))
		var closed := poly.duplicate()
		closed.append(poly[0])
		draw_polyline(closed, Color(0.941, 0.969, 1.0, 0.75) if lit
			else Color(0.471, 0.533, 0.604, 0.55), 1.0, true)
		var lab: Array = r.get("label", []) as Array
		var lx := float(lab[0]) * k if lab.size() >= 2 else W * 0.5
		var ly := my + float(lab[1]) * k if lab.size() >= 2 else my + 60.0
		var nm := String(SHORT.get(rid, r.get("name", rid)))
		var fs := maxi(10, int(round(k * 2.8)))
		var pos := Vector2(lx - 28.0, ly + 4.0)
		draw_string_outline(font, pos, nm, HORIZONTAL_ALIGNMENT_CENTER, 56, fs, 2,
			Color(0.925, 0.953, 0.98, 0.92) if lit else Color(0.027, 0.047, 0.071, 0.88))
		draw_string(font, pos, nm, HORIZONTAL_ALIGNMENT_CENTER, 56, fs,
			Color(0.114, 0.149, 0.196) if lit else Color(0.80, 0.86, 0.92, 0.95))

	for q: Dictionary in (map.get("pipes", []) as Array):
		var p := Vector2(float(q.get("x", 0.0)) * k, my + float(q.get("y", 0.0)) * k)
		draw_colored_polygon(PackedVector2Array([
			p + Vector2(0, -2.0), p + Vector2(2.0, 0),
			p + Vector2(0, 2.0), p + Vector2(-2.0, 0)]),
			Color(0.68, 0.60, 1.0, 0.92))

	for f: Dictionary in (map.get("facility", []) as Array):
		var kind := String(f.get("kind", ""))
		var fp := Vector2(float(f.get("x", 0.0)), float(f.get("y", 0.0)))
		if (kind == "medbot" or kind == "secbot") and sim.bots != null:
			fp = sim.bots.pos_of(kind)
		draw_circle(Vector2(fp.x * k, my + fp.y * k), 1.9,
			Color(0.878, 0.663, 0.294) if kind == "breaker" else Color(0.247, 0.749, 0.549))

	var mine: Array = []
	if not bool(sim.spectator) and sim.mind != null:
		mine = sim.remaining_tasks()
	var points: Array = map.get("points", []) as Array
	for idx in points.size():
		var p: Dictionary = points[idx]
		var px := float(p.get("x", 0.0)) * k
		var py := my + float(p.get("y", 0.0)) * k
		var hard := String(p.get("kind", "")) == "hard"
		if not mine.has(idx):
			draw_circle(Vector2(px, py), 1.2, Color(0.878, 0.341, 0.310, 0.24) if hard
				else Color(0.302, 0.561, 0.820, 0.24))
			continue
		draw_circle(Vector2(px, py), 2.2, Color(0.878, 0.341, 0.310) if hard
			else Color(0.353, 0.655, 0.933))
		draw_arc(Vector2(px, py), 3.1, 0.0, TAU, 16, Color(1, 1, 1, 0.88), 0.9, true)

	if not bool(sim.spectator) and int(sim.me().get("qualPending", 0)) > 0:
		var qp: Vector2 = sim.claim_spot()
		var pu := 0.45 + 0.35 * (0.5 + 0.5 * sin(T * 5.0))
		draw_arc(Vector2(qp.x * k, my + qp.y * k), 3.6 + 1.2 * sin(T * 5.0),
			0.0, TAU, 20, Color(0.941, 0.776, 0.455, pu), 1.2, true)
		draw_circle(Vector2(qp.x * k, my + qp.y * k), 1.8, Color(0.941, 0.776, 0.455))

	for dm: Dictionary in sim.dmg:
		var dx := float(dm.get("x", 0.0)) * k
		var dy := my + float(dm.get("y", 0.0)) * k
		var pu2 := 0.55 + 0.35 * (0.5 + 0.5 * sin(T * 6.0))
		draw_circle(Vector2(dx, dy), 2.6, Color(1.0, 0.353, 0.306, pu2))
		draw_arc(Vector2(dx, dy), 4.0, 0.0, TAU, 16, Color(1.0, 0.745, 0.706, 0.92), 0.9, true)

	if bool(sim.dev):
		for a: Dictionary in sim.agents:
			if int(a.get("i", -1)) == int(sim.me_idx):
				continue
			var ap: Vector2 = a.get("pos", Vector2.ZERO)
			if not bool(a.get("alive", true)):
				var bpos: Vector2 = a.get("bodyPos", ap)
				if bpos != Vector2.ZERO:
					ap = bpos
			var acol := Color(0.498, 0.827, 0.941, 0.65) if not bool(a.get("alive", true)) \
				else (Color(0.878, 0.341, 0.310) if bool(a.get("alien", false)) \
				else Color(0.867, 0.890, 0.925))
			draw_circle(Vector2(ap.x * k, my + ap.y * k), 1.8, acol)


func _draw_player_arrow(k: float, my: float, T: float) -> void:
	var c := Vector2(player_pos.x * k, my + player_pos.y * k)
	var alive := bool(sim.me().get("alive", true))
	var main_col := Color(0.498, 0.827, 0.941) if (player_spectator or not alive) \
		else Color(0.96, 0.82, 0.48)
	var fwd := Vector2(-sin(player_yaw), -cos(player_yaw)).normalized()
	var cone_a := 0.44
	var cone_r := 14.0
	var p1 := c + fwd.rotated(-cone_a) * cone_r
	var p2 := c + fwd.rotated(cone_a) * cone_r
	draw_colored_polygon(PackedVector2Array([c, p1, p2]),
		Color(main_col.r, main_col.g, main_col.b, 0.24))
	var pulse := 0.45 + 0.3 * (0.5 + 0.5 * sin(T * 4.2))
	draw_arc(c, 5.8, 0.0, TAU, 20, Color(main_col.r, main_col.g, main_col.b, pulse), 1.0, true)
	var side := Vector2(-fwd.y, fwd.x)
	var tip := c + fwd * 5.2
	var bl := c - fwd * 2.8 + side * 3.0
	var br := c - fwd * 2.8 - side * 3.0
	draw_colored_polygon(PackedVector2Array([tip, bl, br]), main_col)


func _draw_legend(h: float) -> void:
	var ly := h - 10.0
	var lx := 8.0
	_dot_legend(lx, ly, Color(0.878, 0.341, 0.310))
	lx += 8.0
	lx = _text_legend(lx, ly, "高难 2分")
	_dot_legend(lx, ly, Color(0.353, 0.655, 0.933))
	lx += 8.0
	lx = _text_legend(lx, ly, "普通 1分")
	draw_colored_polygon(PackedVector2Array([
		Vector2(lx + 3, ly - 2.2), Vector2(lx + 5.2, ly),
		Vector2(lx + 3, ly + 2.2), Vector2(lx + 0.8, ly)]),
		Color(0.68, 0.60, 1.0))
	lx += 9.0
	_text_legend(lx, ly, "管道")


func _room_lit(rid: String, light: String) -> bool:
	var state := int(sim.light_state)
	if state == 1:
		return true
	if state == 2:
		return rid == "bridge"
	return light == "bright"


func _dot_legend(x: float, y: float, col: Color) -> void:
	draw_circle(Vector2(x + 2.0, y), 2.3, col)


func _text_legend(x: float, y: float, txt: String) -> float:
	draw_string(font, Vector2(x, y + 3.5), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 10,
		Color(0.74, 0.80, 0.88, 0.94))
	return x + font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x + 12.0
