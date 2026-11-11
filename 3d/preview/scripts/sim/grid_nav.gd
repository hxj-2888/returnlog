extends RefCounted

## 网格寻路（B2）：把 js/engine/geo.js 的 0.6m 可行走网格迁到 Godot。
## ------------------------------------------------------------------
## 口径（与 2.5D 一致，不另造一套）：
##   · 1 格 = 1 米；烘焙步长 0.6 米；
##   · 可行走 = 在任一舱室 poly 内，或在走廊中心线 CW/2 内；
##   · 掩体是硬阻挡，外扩 0.12 格；墙线段 0.36 格内不可走；
##   · 船体外不可达。
##
## 实现用 AStarGrid2D（引擎内置、带堆），但**可行走格仍由本文件按 2.5D 规则烘焙**，
## 不把判定交给 3D 物理 —— 否则 AI 与玩家会看到两套世界。
##
## 坐标：本文件用 Vector2(x, y) 表示地图平面；3D 侧 x→x、y→z。

const CELL := 0.6
const COVER_PAD := 0.12
const WALL_PAD := 0.36

var map: Dictionary = {}
var gw := 0
var gh := 0
var walkable := 0
var _walk: PackedByteArray = PackedByteArray()
var _astar: AStarGrid2D = null
var _rooms: Array = []
var _corridors: Array = []
var _covers: Array = []
var _walls: Array = []
var _cw := 3.2


func build(map_data: Dictionary) -> bool:
	map = map_data
	if map.is_empty():
		push_error("GRID_NAV: 地图为空")
		return false
	var bounds: Dictionary = map.get("bounds", {}) as Dictionary
	var w := float(bounds.get("w", 98.0))
	var h := float(bounds.get("h", 94.0))
	gw = int(ceil(w / CELL))
	gh = int(ceil(h / CELL))
	_rooms = map.get("rooms", []) as Array
	_corridors = map.get("corridors", []) as Array
	_covers = map.get("cover", []) as Array
	_walls = map.get("walls", []) as Array
	var scale: Dictionary = map.get("scale", {}) as Dictionary
	_cw = float(scale.get("corridor_w", 3.2))

	_astar = AStarGrid2D.new()
	_astar.region = Rect2i(0, 0, gw, gh)
	_astar.cell_size = Vector2(CELL, CELL)
	_astar.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	_astar.update()

	_walk = PackedByteArray()
	_walk.resize(gw * gh)
	walkable = 0
	var cover_rects: Array = []
	for c: Dictionary in _covers:
		cover_rects.append(Rect2(
			float(c.get("x", 0)) - COVER_PAD, float(c.get("y", 0)) - COVER_PAD,
			float(c.get("w", 0)) + COVER_PAD * 2.0, float(c.get("h", 0)) + COVER_PAD * 2.0))
	for gy in gh:
		for gx in gw:
			var p := Vector2((gx + 0.5) * CELL, (gy + 0.5) * CELL)
			var ok := false
			for room: Dictionary in _rooms:
				if in_poly(p, room.get("poly", []) as Array):
					ok = true
					break
			if not ok and _in_corridor(p) != null:
				ok = true
			if ok:
				for cr: Rect2 in cover_rects:
					if cr.has_point(p):
						ok = false
						break
			if ok:
				for seg: Array in _walls:
					var a: Array = seg[0] as Array
					var b: Array = seg[1] as Array
					if _d2seg(p, float(a[0]), float(a[1]), float(b[0]), float(b[1])) < WALL_PAD:
						ok = false
						break
			var idx := gy * gw + gx
			if ok:
				_walk[idx] = 1
				walkable += 1
			else:
				_astar.set_point_solid(Vector2i(gx, gy), true)
	_astar.update()
	return walkable > 0


func is_free(p: Vector2) -> bool:
	var c := world_to_cell(p)
	return c.x >= 0 and c.y >= 0 and c.x < gw and c.y < gh and _walk[c.y * gw + c.x] == 1


func nearest_free(p: Vector2, max_rings: int = 8) -> Vector2:
	if is_free(p):
		return p
	for r in range(1, max_rings + 1):
		for a in 16:
			var ang := float(a) / 16.0 * TAU
			var q := p + Vector2(cos(ang), sin(ang)) * (float(r) * CELL)
			if is_free(q):
				return q
	return p


## 返回世界坐标路径（每点约 0.6m 间隔）；不可达时返回只含目标的单点路径。
func path(from: Vector2, to: Vector2) -> PackedVector2Array:
	if _astar == null:
		return PackedVector2Array([to])
	var s := nearest_free(from)
	var t := nearest_free(to)
	var sc := world_to_cell(s)
	var tc := world_to_cell(t)
	if sc == tc:
		return PackedVector2Array([t])
	var pts := _astar.get_point_path(sc, tc)
	if pts.is_empty():
		return PackedVector2Array([t])
	pts[pts.size() - 1] = t
	return pts


func world_to_cell(p: Vector2) -> Vector2i:
	return Vector2i(
		clampi(int(floor(p.x / CELL)), 0, maxi(0, gw - 1)),
		clampi(int(floor(p.y / CELL)), 0, maxi(0, gh - 1)))


func cell_to_world(c: Vector2i) -> Vector2:
	return Vector2((float(c.x) + 0.5) * CELL, (float(c.y) + 0.5) * CELL)


func room_at(p: Vector2) -> Dictionary:
	for room: Dictionary in _rooms:
		if in_poly(p, room.get("poly", []) as Array):
			return room
	return {}


## 视线：墙 + 掩体都挡。保安/远程 AI 用；B2 暂时只给测试。
func los(a: Vector2, b: Vector2) -> bool:
	for seg: Array in _walls:
		var wa: Array = seg[0] as Array
		var wb: Array = seg[1] as Array
		if _seg_x(a, b, Vector2(float(wa[0]), float(wa[1])), Vector2(float(wb[0]), float(wb[1]))):
			return false
	for c: Dictionary in _covers:
		var x := float(c.get("x", 0))
		var y := float(c.get("y", 0))
		var cw := float(c.get("w", 0))
		var ch := float(c.get("h", 0))
		var p: Array[Vector2] = [Vector2(x, y), Vector2(x + cw, y),
			Vector2(x + cw, y + ch), Vector2(x, y + ch)]
		for i in 4:
			if _seg_x(a, b, p[i], p[(i + 1) % 4]):
				return false
	return true


## 只算墙体，不算掩体（2.5D geo.js:155 losWalls）：
## 保安机器人坐在安保位的家具里，用 los() 会被自己的机位挡住，
## 于是「看得见才抓」永远不成立。
func los_walls(a: Vector2, b: Vector2) -> bool:
	for seg: Array in _walls:
		var wa: Array = seg[0] as Array
		var wb: Array = seg[1] as Array
		if _seg_x(a, b, Vector2(float(wa[0]), float(wa[1])), Vector2(float(wb[0]), float(wb[1]))):
			return false
	return true


func in_poly(p: Vector2, poly: Array) -> bool:
	if poly.size() < 3:
		return false
	var inside := false
	var j := poly.size() - 1
	for i in poly.size():
		var pi: Array = poly[i] as Array
		var pj: Array = poly[j] as Array
		var xi := float(pi[0])
		var yi := float(pi[1])
		var xj := float(pj[0])
		var yj := float(pj[1])
		if ((yi > p.y) != (yj > p.y)) and (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi):
			inside = not inside
		j = i
	return inside


## 给 sim 层用的只读查询（2.5D inCorr(x,y)）：几何判定仍只在本文件，
## 不把走廊坐标复制到规则层（3d/ARCHITECTURE.md §3 硬规则 3）。
func corridor_at(p: Vector2) -> Variant:
	return _in_corridor(p)


func _in_corridor(p: Vector2) -> Variant:
	for c: Dictionary in _corridors:
		var pts: Array = c.get("pts", []) as Array
		for i in range(0, maxi(0, pts.size() - 1)):
			var a: Array = pts[i] as Array
			var b: Array = pts[i + 1] as Array
			if _d2seg(p, float(a[0]), float(a[1]), float(b[0]), float(b[1])) <= _cw * 0.5:
				return c
	return null


func _d2seg(p: Vector2, ax: float, ay: float, bx: float, by: float) -> float:
	var dx := bx - ax
	var dy := by - ay
	var l2 := dx * dx + dy * dy
	var t := 0.0
	if l2 > 0.0:
		t = clampf(((p.x - ax) * dx + (p.y - ay) * dy) / l2, 0.0, 1.0)
	return p.distance_to(Vector2(ax + t * dx, ay + t * dy))


func _seg_x(a: Vector2, b: Vector2, c: Vector2, d: Vector2) -> bool:
	var r := b - a
	var s := d - c
	var den := r.x * s.y - r.y * s.x
	if absf(den) < 1e-9:
		return false
	var t := ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den
	var u := ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den
	return t > 0.001 and t < 0.999 and u >= 0.0 and u <= 1.0
