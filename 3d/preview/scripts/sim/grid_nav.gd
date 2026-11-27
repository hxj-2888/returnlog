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
const LOS_BUCKET := 8.0

var map: Dictionary = {}
var gw := 0
var gh := 0
var walkable := 0
var _walk: PackedByteArray = PackedByteArray()
var _astar: AStarGrid2D = null
var _rooms: Array = []
var _corridors: Array = []
var _cw := 3.2
var _los_segs := PackedVector2Array()
var _los_buckets: Dictionary = {}
var _wall_buckets: Dictionary = {}
var _los_stamp := PackedInt32Array()
var _los_gen := 0
var _room_cache: Array = []

func build(map_data: Dictionary) -> bool:
	map = map_data
	if map.is_empty():
		push_error("GRID_NAV: 地图为空")
		return false
	var bounds: Dictionary = map.get("bounds", {}) as Dictionary
	gw = int(ceil(float(bounds.get("w", 98.0)) / CELL))
	gh = int(ceil(float(bounds.get("h", 94.0)) / CELL))
	_rooms = map.get("rooms", []) as Array
	_corridors = map.get("corridors", []) as Array
	var covers: Array = map.get("cover", []) as Array
	var walls: Array = map.get("walls", []) as Array
	_cw = float((map.get("scale", {}) as Dictionary).get("corridor_w", 3.2))
	_room_cache = []
	for room: Dictionary in _rooms:
		var poly := PackedVector2Array()
		for q: Array in (room.get("poly", []) as Array):
			poly.append(Vector2(float(q[0]), float(q[1])))
		var rect := Rect2(poly[0], Vector2.ZERO) if poly.size() > 0 else Rect2()
		for k in range(1, poly.size()):
			rect = rect.expand(poly[k])
		_room_cache.append({"room": room, "rect": rect.grow(0.01) if poly.size() >= 3 else rect, "poly": poly})
	_astar = AStarGrid2D.new()
	_astar.region = Rect2i(0, 0, gw, gh)
	_astar.cell_size = Vector2(CELL, CELL)
	_astar.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	_astar.update()
	_walk = PackedByteArray()
	_walk.resize(gw * gh)
	walkable = 0
	var cover_rects: Array = []
	for c: Dictionary in covers:
		cover_rects.append(Rect2(float(c.get("x", 0)) - COVER_PAD, float(c.get("y", 0)) - COVER_PAD,
			float(c.get("w", 0)) + COVER_PAD * 2.0, float(c.get("h", 0)) + COVER_PAD * 2.0))
	for gy in gh:
		for gx in gw:
			var p := Vector2((gx + 0.5) * CELL, (gy + 0.5) * CELL)
			var ok := false
			for rc: Dictionary in _room_cache:
				var rp := rc["poly"] as PackedVector2Array
				if rp.size() >= 3 and (rc["rect"] as Rect2).has_point(p) and Geometry2D.is_point_in_polygon(p, rp):
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
				for seg: Array in walls:
					var a: Array = seg[0] as Array
					var b: Array = seg[1] as Array
					if _d2seg(p, float(a[0]), float(a[1]), float(b[0]), float(b[1])) < WALL_PAD:
						ok = false
						break
			if ok:
				_walk[gy * gw + gx] = 1
				walkable += 1
			else:
				_astar.set_point_solid(Vector2i(gx, gy), true)
	_astar.update()
	_build_los_buckets(walls, covers)
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
	# 2.5D geo.smoothPath（js/engine/geo.js:81）：能直达就跳过中间点。
	# 判据必须是 pathClear（网格可行走 + 0.16 格贴墙余量），**不是 los()** ——
	# los() 只判墙/掩体相交，会把"贴墙角擦过去"的直线判成可走，
	# AI 贴着墙角走时下一格判成不可走 → 原地卡死（2.5D 注释原文：*会从墙角擦过去*）。
	if pts.size() > 2:
		var out := PackedVector2Array()
		var i := 0
		while i < pts.size():
			out.append(pts[i])
			var j := pts.size() - 1
			while j > i + 1:
				if path_clear(pts[i], pts[j]):
					break
				j -= 1
			i = i + 1 if j <= i else j
		pts = out
	return pts

## 2.5D geo.pathClear（js/engine/geo.js:74）逐行：沿路径每 0.12 格采样一次，
## 每次同时判「中线点」与「垂直方向 ±0.16 格的两个点」都可走 —— 后者就是贴墙余量。
## 采样步长 0.12、余量 0.16 都写死在这里，与 2.5D 同值（真源里也是字面量）。
func path_clear(a: Vector2, b: Vector2) -> bool:
	var d := a.distance_to(b)
	var n := maxi(2, int(ceil(d / 0.12)))
	var px := -(b.y - a.y) / d * 0.16 if d > 0.0 else 0.0
	var py := (b.x - a.x) / d * 0.16 if d > 0.0 else 0.0
	for i in range(1, n):
		var t := float(i) / float(n)
		var x := a.x + (b.x - a.x) * t
		var y := a.y + (b.y - a.y) * t
		if not is_free(Vector2(x, y)) or not is_free(Vector2(x + px, y + py)) or not is_free(Vector2(x - px, y - py)):
			return false
	return true

func world_to_cell(p: Vector2) -> Vector2i:
	return Vector2i(clampi(int(floor(p.x / CELL)), 0, maxi(0, gw - 1)), clampi(int(floor(p.y / CELL)), 0, maxi(0, gh - 1)))

func cell_to_world(c: Vector2i) -> Vector2:
	return Vector2((float(c.x) + 0.5) * CELL, (float(c.y) + 0.5) * CELL)

func room_at(p: Vector2) -> Dictionary:
	for rc: Dictionary in _room_cache:
		var rp := rc["poly"] as PackedVector2Array
		if rp.size() >= 3 and (rc["rect"] as Rect2).has_point(p) and Geometry2D.is_point_in_polygon(p, rp):
			return rc["room"] as Dictionary
	return {}

## 视线：墙 + 掩体都挡。保安/远程 AI 用；B2 暂时只给测试。
func los(a: Vector2, b: Vector2) -> bool:
	return _los_query(a, b, _los_buckets)

## 只算墙体，不算掩体（2.5D geo.js:155 losWalls）：保安机位在掩体内。
func los_walls(a: Vector2, b: Vector2) -> bool:
	return _los_query(a, b, _wall_buckets)

## 在 build() 后按 8.0m × 8.0m 网格构建墙+掩体桶与纯墙桶，加速 los()/los_walls()。
func _build_los_buckets(walls: Array, covers: Array) -> void:
	_los_segs = PackedVector2Array()
	_los_buckets.clear()
	_wall_buckets.clear()
	for seg: Array in walls:
		var wa: Array = seg[0] as Array
		var wb: Array = seg[1] as Array
		_los_segs.append(Vector2(float(wa[0]), float(wa[1])))
		_los_segs.append(Vector2(float(wb[0]), float(wb[1])))
	var wall_n := _los_segs.size() >> 1
	for c: Dictionary in covers:
		var x := float(c.get("x", 0))
		var y := float(c.get("y", 0))
		var x2 := x + float(c.get("w", 0))
		var y2 := y + float(c.get("h", 0))
		_los_segs.append_array(PackedVector2Array([
			Vector2(x, y), Vector2(x2, y), Vector2(x2, y), Vector2(x2, y2),
			Vector2(x2, y2), Vector2(x, y2), Vector2(x, y2), Vector2(x, y)]))
	var seg_n := _los_segs.size() >> 1
	_los_stamp = PackedInt32Array()
	_los_stamp.resize(seg_n)
	_los_gen = 0
	for idx in seg_n:
		var c := _los_segs[idx << 1]
		var d := _los_segs[(idx << 1) + 1]
		for gy in range(int(floor(minf(c.y, d.y) / LOS_BUCKET)), int(floor(maxf(c.y, d.y) / LOS_BUCKET)) + 1):
			for gx in range(int(floor(minf(c.x, d.x) / LOS_BUCKET)), int(floor(maxf(c.x, d.x) / LOS_BUCKET)) + 1):
				var key := Vector2i(gx, gy)
				var arr: PackedInt32Array = _los_buckets.get(key, PackedInt32Array())
				arr.append(idx)
				_los_buckets[key] = arr
				if idx < wall_n:
					var warr: PackedInt32Array = _wall_buckets.get(key, PackedInt32Array())
					warr.append(idx)
					_wall_buckets[key] = warr

## 仅遍历射线 AABB 覆盖的格子桶，并通过版本号去重长线段。
func _los_query(a: Vector2, b: Vector2, buckets: Dictionary) -> bool:
	if _los_stamp.is_empty():
		return true
	_los_gen += 1
	if _los_gen >= 2000000000:
		_los_stamp.fill(0)
		_los_gen = 1
	for gy in range(int(floor(minf(a.y, b.y) / LOS_BUCKET)), int(floor(maxf(a.y, b.y) / LOS_BUCKET)) + 1):
		for gx in range(int(floor(minf(a.x, b.x) / LOS_BUCKET)), int(floor(maxf(a.x, b.x) / LOS_BUCKET)) + 1):
			var cell: Variant = buckets.get(Vector2i(gx, gy), null)
			if cell == null:
				continue
			for idx: int in (cell as PackedInt32Array):
				if _los_stamp[idx] == _los_gen:
					continue
				_los_stamp[idx] = _los_gen
				var si := idx << 1
				if _seg_x(a, b, _los_segs[si], _los_segs[si + 1]):
					return false
	return true

func in_poly(p: Vector2, poly: Array) -> bool:
	if poly.size() < 3:
		return false
	var pv := PackedVector2Array()
	for pt: Array in poly:
		pv.append(Vector2(float(pt[0]), float(pt[1])))
	return Geometry2D.is_point_in_polygon(p, pv)

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
	var t := clampf(((p.x - ax) * dx + (p.y - ay) * dy) / l2, 0.0, 1.0) if l2 > 0.0 else 0.0
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

## 2.5D geo.js:139 segX 的公开入口：门的线段判定要复用它，
## 不许在 sim_state 里再写一份相交测试（两份实现迟早在边界条件上分叉）。
func seg_x(a: Vector2, b: Vector2, c: Vector2, d: Vector2) -> bool:
	return _seg_x(a, b, c, d)
