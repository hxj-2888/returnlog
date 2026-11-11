extends Control
## 局内小地图：2.5D drawMini（js/game.js:10507-10632）的功能移植。
## 只读地图静态数据 + sim 运行时状态；**不画其他活人/尸体**（2.5D 正常对局
## 也不画，只有 DEV 才画 —— 防透视），不可点击、不受迷雾影响（2.5D 同口径）。
## 像素排布属表现层；这里用固定 240 宽，贴右上角。

const W := 240.0
const PAD_T := 18.0
const LEG_H := 22.0
## 2.5D SHORT 表（js/game.js:10541）：小地图空间有限，用短名。
const SHORT := {
	"bridge": "会议室", "warehouse": "仓库", "ecosys": "生态舱", "engine": "引擎",
	"power": "配电", "transit": "食堂", "cam": "监控", "med": "医疗",
	"armory": "军械", "fun": "娱乐",
}

var map: Dictionary = {}
var sim
var player_pos := Vector2.ZERO
var player_spectator := false
var font: Font

var _t := 0.0
var _acc := 0.0


func setup(p_map: Dictionary, p_sim) -> void:
	map = p_map
	sim = p_sim
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	font = SystemFont.new()
	font.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])
	var bw := float((map.get("bounds", {}) as Dictionary).get("w", 98))
	var bh := float((map.get("bounds", {}) as Dictionary).get("h", 94))
	custom_minimum_size = Vector2(W, W * bh / maxf(1.0, bw) + PAD_T + LEG_H)
	size = custom_minimum_size
	set_process(true)


func _process(delta: float) -> void:
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
	# 面板与标题
	draw_rect(Rect2(Vector2.ZERO, Vector2(W, h)), Color(0.027, 0.047, 0.071, 0.92))
	draw_rect(Rect2(Vector2.ZERO, Vector2(W, h)), Color(0.20, 0.275, 0.361), false, 1.0)
	draw_string(font, Vector2(2, 12), "船体蓝图", HORIZONTAL_ALIGNMENT_LEFT, -1, 9,
		Color(0.77, 0.84, 0.91, 0.7))
	draw_string(font, Vector2(0, 12), "%d × %d" % [int(bw), int(bh)],
		HORIZONTAL_ALIGNMENT_RIGHT, W - 2, 9, Color(0.47, 0.54, 0.62, 0.7))
	var my := PAD_T
	# 蓝图网格
	var grid := Color(0.43, 0.55, 0.67, 0.07)
	var gx := 10.0
	while gx < bw:
		draw_line(Vector2(gx * k, my), Vector2(gx * k, my + mh), grid, 0.5)
		gx += 10.0
	var gy := 10.0
	while gy < bh:
		draw_line(Vector2(0, my + gy * k), Vector2(W, my + gy * k), grid, 0.5)
		gy += 10.0
	# 通道：先粗后细（2.5D 双描边）
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
	# 房间轮廓 + 短名
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
		var ly := my + float(lab[1]) * k if lab.size() >= 2 else my + mh * 0.5
		var nm := String(SHORT.get(rid, r.get("name", rid)))
		var fs := maxi(7, int(round(k * 2.5)))
		var pos := Vector2(lx - 26.0, ly + 3.0)
		draw_string_outline(font, pos, nm, HORIZONTAL_ALIGNMENT_CENTER, 52, fs, 2,
			Color(0.925, 0.953, 0.98, 0.92) if lit else Color(0.027, 0.047, 0.071, 0.88))
		draw_string(font, pos, nm, HORIZONTAL_ALIGNMENT_CENTER, 52, fs,
			Color(0.114, 0.149, 0.196) if lit else Color(0.745, 0.80, 0.863, 0.92))
	# 管道口（紫色菱形）
	for q: Dictionary in (map.get("pipes", []) as Array):
		var p := Vector2(float(q.get("x", 0.0)) * k, my + float(q.get("y", 0.0)) * k)
		draw_colored_polygon(PackedVector2Array([
			p + Vector2(0, -1.8), p + Vector2(1.8, 0),
			p + Vector2(0, 1.8), p + Vector2(-1.8, 0)]),
			Color(0.659, 0.588, 1.0, 0.9))
	# 设施：电闸金色，其余绿色；机器人读运行时坐标
	for f: Dictionary in (map.get("facility", []) as Array):
		var kind := String(f.get("kind", ""))
		var fp := Vector2(float(f.get("x", 0.0)), float(f.get("y", 0.0)))
		if (kind == "medbot" or kind == "secbot") and sim.bots != null:
			fp = sim.bots.pos_of(kind)
		draw_circle(Vector2(fp.x * k, my + fp.y * k), 1.8,
			Color(0.878, 0.663, 0.294) if kind == "breaker" else Color(0.247, 0.749, 0.549))
	# 任务点：自己的剩余任务亮，其余暗点
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
			draw_circle(Vector2(px, py), 1.1, Color(0.878, 0.341, 0.310, 0.22) if hard
				else Color(0.302, 0.561, 0.820, 0.22))
			continue
		draw_circle(Vector2(px, py), 2.0, Color(0.878, 0.341, 0.310) if hard
			else Color(0.353, 0.655, 0.933))
		draw_arc(Vector2(px, py), 2.9, 0.0, TAU, 16, Color(1, 1, 1, 0.85), 0.8, true)
	# 待领申请单：圆桌金色脉冲
	if not bool(sim.spectator) and int(sim.me().get("qualPending", 0)) > 0:
		var qp: Vector2 = sim.claim_spot()
		var pu := 0.45 + 0.35 * (0.5 + 0.5 * sin(T * 5.0))
		draw_arc(Vector2(qp.x * k, my + qp.y * k), 3.4 + 1.2 * sin(T * 5.0),
			0.0, TAU, 20, Color(0.941, 0.776, 0.455, pu), 1.2, true)
		draw_circle(Vector2(qp.x * k, my + qp.y * k), 1.7, Color(0.941, 0.776, 0.455))
	# 故障：红点脉冲
	for dm: Dictionary in sim.dmg:
		var dx := float(dm.get("x", 0.0)) * k
		var dy := my + float(dm.get("y", 0.0)) * k
		var pu2 := 0.55 + 0.35 * (0.5 + 0.5 * sin(T * 6.0))
		draw_circle(Vector2(dx, dy), 2.4, Color(1.0, 0.353, 0.306, pu2))
		draw_arc(Vector2(dx, dy), 3.6, 0.0, TAU, 16, Color(1.0, 0.745, 0.706, 0.9), 0.8, true)
	# DEV 可见的其他席位（2.5D js/game.js:10605-10612）：死者用尸体位置，异形红、人类白。
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
			draw_circle(Vector2(ap.x * k, my + ap.y * k), 1.7, acol)
	# 自己 / 旁观相机：金色脉冲
	var myx := player_pos.x * k
	var myy := my + player_pos.y * k
	var pulse := 0.45 + 0.3 * (0.5 + 0.5 * sin(T * 4.2))
	draw_arc(Vector2(myx, myy), 5.5, 0.0, TAU, 20, Color(0.941, 0.776, 0.455, pulse), 1.0, true)
	var alive := bool(sim.me().get("alive", true))
	draw_circle(Vector2(myx, myy), 2.6, Color(0.498, 0.827, 0.941) if player_spectator
		else (Color(0.941, 0.776, 0.455) if alive else Color(0.498, 0.827, 0.941)))
	# 图例
	var ly := h - 7.0
	var lx := 2.0
	_dot_legend(lx, ly, Color(0.878, 0.341, 0.310))
	lx += 7.0
	lx = _text_legend(lx, ly, "高难 2分")
	_dot_legend(lx, ly, Color(0.353, 0.655, 0.933))
	lx += 7.0
	lx = _text_legend(lx, ly, "普通 1分")
	draw_colored_polygon(PackedVector2Array([
		Vector2(lx + 3, ly - 1.6), Vector2(lx + 4.6, ly),
		Vector2(lx + 3, ly + 1.6), Vector2(lx + 1.4, ly)]),
		Color(0.659, 0.588, 1.0))
	lx += 7.0
	_text_legend(lx, ly, "管道")


func _room_lit(rid: String, light: String) -> bool:
	var state := int(sim.light_state)
	if state == 1:
		return true
	if state == 2:
		return rid == "bridge"
	return light == "bright"


func _dot_legend(x: float, y: float, col: Color) -> void:
	draw_circle(Vector2(x + 2, y), 2.0, col)


func _text_legend(x: float, y: float, txt: String) -> float:
	draw_string(font, Vector2(x, y + 3), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 8,
		Color(0.667, 0.722, 0.784, 0.9))
	return x + font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 8).x + 10.0
