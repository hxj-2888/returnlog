extends RefCounted

## 异形 AI（B3 最小版）：找人 → 走到刀程 → 出刀；偶尔去非会议室舱破坏。
## 不做完整的计划/伪装/管道，这些留给后续批次；先把“夜里真的会死人”跑起来。
## 口径：异形互不知道身份，这里也不读队友表；目标只按“最近的活人”选。

const SpaceData := preload("res://scripts/space_data.gd")

var sim
var space: Dictionary = {}
## 决策遥测：只计数，不参与判定；--sim1000 汇总用
var stats: Dictionary = {}
## 预计算的门口世界坐标（2.5D exitDistAt 的逃逸成本原料）
var _doors: Array = []


func _bump(k: String) -> void:
	stats[k] = int(stats.get(k, 0)) + 1


func setup(p_sim, p_space: Dictionary) -> void:
	sim = p_sim
	space = p_space
	# 2.5D exitDistAt：出刀点离最近的门/管道口越远，红身期间越走不干净。
	# 3D 用 map_v2 的房间门表预计算同一批点。
	_doors = []
	for r: Dictionary in (sim.map.get("rooms", []) as Array):
		var rect: Array = r.get("rect", []) as Array
		if rect.size() < 4:
			continue
		var rx := float(rect[0])
		var ry := float(rect[1])
		var rw := float(rect[2])
		var rh := float(rect[3])
		for d: Array in (r.get("doors", []) as Array):
			var side := String(d[0])
			var off := float(d[1])
			match side:
				"t":
					_doors.append(Vector2(rx + off, ry))
				"b":
					_doors.append(Vector2(rx + off, ry + rh))
				"l":
					_doors.append(Vector2(rx, ry + off))
				"r":
					_doors.append(Vector2(rx + rw, ry + off))


## 出刀点离最近出口的距离（2.5D exitDistAt）
func _exit_dist(p: Vector2) -> float:
	var best := 1.0e9
	for d: Vector2 in _doors:
		best = minf(best, p.distance_to(d))
	return best


func tick(dt: float) -> void:
	if sim == null or sim.over:
		return
	for a: Dictionary in sim.agents:
		if not bool(a.get("alien", false)):
			continue
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		if float(a.get("_avoid_t", 0.0)) > 0.0:
			a["_avoid_t"] = float(a.get("_avoid_t", 0.0)) - dt
		var sab_night := int(a.get("_sabNight", -1))
		if sab_night != int(sim.night):
			a["_sabNight"] = int(sim.night)
			a["_sabDone"] = false
			a["_sabT"] = sim.rules.n("DISGUISE", "cooldown", 18.0) + sim._rng.randf() * 10.0
		else:
			a["_sabT"] = float(a.get("_sabT", 0.0)) - dt
		if float(a.get("doing", 0.0)) > 0.0:
			continue
		var path: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
		if path.size() > 0:
			continue
		var wait := float(a.get("_aiT", 0.0)) - dt
		a["_aiT"] = wait
		if wait > 0.0:
			continue
		_decide(a)


func _decide(a: Dictionary) -> void:
	var i := int(a.get("i", -1))

	# ---- 补给链（2.5D aiAlien 3505-3528，与人类同一条规则）----
	# 有申请单先回圆桌领取；有申请单且缺子弹 → 军械补给点。
	# 2.5D 异形场均 alienShots 1.0 次 —— 子弹就是从这条链来的；
	# 3D 之前异形完全没有补给行为，"异形开枪"因此无从发生。
	var qual_pending := int(a.get("qualPending", 0))
	var qual := int(a.get("qual", 0))
	if qual_pending > 0 and qual < 2:
		var spot: Vector2 = sim.claim_spot()
		if sim.distance_to(i, spot) <= SpaceData.num(space, "reach", "round_table"):
			sim.start_doing(i, "claim", SpaceData.num(space, "stand", "qual"))
		elif sim.set_path(i, spot):
			return
	if qual > 0 and int(a.get("bullet", 0)) < 1:
		var sp: Vector2 = sim.supply_spot("ammo")
		if sim.distance_to(i, sp) <= SpaceData.num(space, "reach", "fix"):
			sim.start_doing(i, "supply", SpaceData.num(space, "stand", "ammo"), -1, "ammo")
		elif sim.set_path(i, sp):
			return

	# 翻尸体（2.5D lootRun）：缺子弹/申请单时搜身边没搜过的尸体。
	# 2.5D 场均 alienLoots ≈ 2 —— 异形的子弹大部分来自这里。
	if int(a.get("bullet", 0)) < 1 or int(a.get("qual", 0)) < 2:
		var body2: Dictionary = sim.body_near(a.get("pos", Vector2.ZERO),
			SpaceData.num(space, "reach", "body"))
		if not body2.is_empty() and not bool(body2.get("searched", false)) \
				and (int(body2.get("bullet", 0)) > 0 or int(body2.get("qual", 0)) > 0):
			if sim.search_body(int(body2.get("i", -1)), i):
				a["_aiT"] = 1.0
				return

	# 每夜最多一次破坏；冷却在 tick 里逐帧减，只有空闲时才真的去。
	if not bool(a.get("_sabDone", false)) and float(a.get("_sabT", 999.0)) <= 0.0:
		if sim._rng.randf() < 0.35 and _try_sabotage(a):
			return

	var best := -1
	var bd := 1.0e9
	var bpos := Vector2.ZERO
	var bvic: Dictionary = {}
	for v: Dictionary in sim.agents:
		if bool(v.get("alien", false)) or not bool(v.get("alive", false)):
			continue
		if float(a.get("_avoid_t", 0.0)) > 0.0 and int(v.get("i", -1)) == int(a.get("_avoid_i", -1)):
			continue
		if bool(v.get("downed", false)):
			continue
		# B4 起玩家也能还手（左键出刀 / 右键开枪），所以这里不再对玩家留手。
		# 保安机器人会抓现行：在它 6 格 + 180° 视野内动手，出刀就会被追。
		var vp: Vector2 = v.get("pos", Vector2.ZERO)
		# 2.5D HUNT：按目击风险挑落单的人，别无脑往人群里扎。
		var near := 0
		for w: Dictionary in sim.agents:
			if w == v or bool(w.get("alien", false)) or not bool(w.get("alive", false)):
				continue
			if bool(w.get("downed", false)) or bool(w.get("detained", false)):
				continue
			if float(w.get("doing", 0.0)) > 0.0:
				continue
			if (w.get("pos", Vector2.ZERO) as Vector2).distance_to(vp) <= sim.rules.n("KNIFE", "crowdR", 9):
				near += 1
		var score: float = sim.distance_to(i, vp) + float(sim.rules.i("AVOID", "nearR", 6)) * float(near)
		if score < bd:
			bd = score
			best = int(v.get("i", -1))
			bpos = vp
			bvic = v
	if best < 0:
		_bump("no_target")
		a["_aiT"] = 1.0
		return
	var real_d: float = sim.distance_to(i, bpos)
	# 2.5D aiAlien 的开枪分支（js/game.js:3877）：异形有子弹也会开枪 ——
	# 远距离/没刀时优先用枪，而不是永远只贴脸出刀。
	# 条件：有弹 + 不是队友 + (没进刀程 或 没刀) + 枪程内 + LOS + alienFireP 概率。
	if int(a.get("bullet", 0)) > 0 and real_d > SpaceData.num(space, "reach", "knife"):
		var shoot_range: float = SpaceData.num(space, "shoot", "range")
		if real_d <= shoot_range and sim.nav != null \
				and sim.nav.los(a.get("pos", Vector2.ZERO), bpos):
			var fire_p := 0.7
			var shot_cfg: Dictionary = (sim.cfg.get("rules", {}) as Dictionary).get("SHOT", {}) as Dictionary
			fire_p = float(shot_cfg.get("alienFireP", 0.7))
			if sim._rng.randf() < fire_p:
				if sim.shoot(i, best):
					_bump("shot_ok")
					a["_aiT"] = 1.5
					return
	if real_d <= SpaceData.num(space, "reach", "knife"):
		# 2.5D 理智兜底（js/game.js 4108-4128 / SKSanity.KNIFE）：
		# 先过三条与性格无关的硬线，过了才轮到性格冒险率。
		# 数值全部读 sim.json#rules.KNIFE，不在 GDScript 里抄。
		var K: Dictionary = (sim.cfg.get("rules", {}) as Dictionary).get("KNIFE", {}) as Dictionary
		var cap := int(K.get("witnessCap", 3))
		var min_conceal := float(K.get("minConceal", 0.34))
		var crowd_r := float(K.get("crowdR", 9))
		var crowd_n := int(K.get("crowdN", 3))
		var bold_base := float(K.get("boldBase", 0.5))
		var bold_span := float(K.get("boldSpan", 0.16))
		# 2.5D watchersAt/exposureAt：可见半径 R = max(rad, 7, sightRangeAt(受害者)) ——
		# 亮舱整间可见、亮走廊整条可见、暗处只剩近身圆。3D 用光感半径同一口径。
		var sight_r: float = sim.sight_range_at(bpos)
		if sight_r < SpaceData.num(space, "sight", "human_light_r"):
			sight_r = SpaceData.num(space, "sight", "human_light_r")
		var witnesses := 0
		var crowd := 0
		var w_list: Array = []
		for w: Dictionary in sim.agents:
			if w == bvic or bool(w.get("alien", false)):
				continue
			if not bool(w.get("alive", false)) or bool(w.get("downed", false)) \
					or bool(w.get("detained", false)):
				continue
			var busy: bool = float(w.get("doing", 0.0)) > 0.0
			var wp: Vector2 = w.get("pos", Vector2.ZERO)
			var wd: float = wp.distance_to(bpos)
			# 2.5D crowdAt：只看"周围有没有人"，不看注意力 —— 做事的人也算人数
			if wd <= crowd_r:
				crowd += 1
			# 2.5D watchersAt / exposureAt：attention != 'online' 的人**完全排除**
			# （低头做事的人看不见，既不计目击数也不计暴露度 —— 2026-11-05 A 批口径）
			if busy:
				continue
			if wd <= sight_r and sim.nav != null and sim.nav.los(wp, bpos):
				witnesses += 1
				# 2.5D witnessWeight 纯函数：贴脸 1.0 → 视野边缘 0.3
				# （busy 只在"被计入的人"身上生效，被排除的人根本不进表）
				if sim.mind != null:
					w_list.append(sim.mind.witness_weight(wd, sight_r, false))
				else:
					w_list.append(clampf(1.0 - wd / maxf(0.01, sight_r), 0.0, 1.0))
		# 2.5D exposureAt：逃逸成本按「出刀点离最近门/管道口的距离」算 ——
		# 深居房间中央的刀更难逃干净（escapeCost 纯函数）。
		var esc := 0.0
		if sim.mind != null:
			esc = sim.mind.escape_cost(_exit_dist(bpos))
		var conceal: float = 1.0
		if sim.mind != null:
			conceal = 1.0 - sim.mind.exposure(w_list, esc)
		else:
			conceal = 1.0 - w_list.size() / float(maxi(1, cap))
		if witnesses >= cap or conceal < min_conceal or crowd >= crowd_n:
			_bump("block_cap" if witnesses >= cap else ("block_conceal" if conceal < min_conceal else "block_crowd"))
			# 2.5D：被拦下时把该目标记 12 秒不再追，避免原地反复判定
			a["_avoid_i"] = best
			a["_avoid_t"] = sim.rules.disp("avoidSec", 12.0)
			a["_aiT"] = 2.0
			return
		if witnesses >= 1:
			# 性格冒险率区间 boldBase ± boldSpan（0.34~0.66），不是"七成收手"
			var bold: float = bold_base + bold_span * (sim._rng.randf() * 2.0 - 1.0)
			if sim._rng.randf() >= bold:
				_bump("block_bold")
				a["_avoid_i"] = best
				a["_avoid_t"] = 4.0
				a["_aiT"] = 1.0
				return
		if int(a.get("knife", 1)) <= 0:
			a["_aiT"] = 2.0
			return
		_bump("knife_try")
		if sim.knife(i, best):
			_bump("knife_ok")
			# 2.5D 没有 25~35 秒全局冷却：限制是"每夜 1 把刀" + RUSH 逃逸，
			# 早先为截图擅自加的长冷却已移除（它把异形削到 79/17.5 的主因之一）。
			a["_aiT"] = 2.0
		return
	if not sim.set_path(i, bpos):
		_bump("path_fail")
		a["_aiT"] = 1.0


func _try_sabotage(a: Dictionary) -> bool:
	var i := int(a.get("i", -1))
	var rooms: Array = []
	for rid: String in sim.rooms_by_id.keys():
		if rid == "bridge":
			continue
		var pts: Array = []
		for pi in sim.points.size():
			var p: Dictionary = sim.points[pi]
			if String(p.get("room", "")) == rid:
				pts.append(pi)
		if pts.size() > 0:
			rooms.append(rid)
	if rooms.is_empty():
		return false
	var rid := String(rooms[sim._rng.randi_range(0, rooms.size() - 1)])
	var pi := -1
	for k in sim.points.size():
		var p: Dictionary = sim.points[k]
		if String(p.get("room", "")) == rid:
			pi = k
			break
	if pi < 0:
		return false
	var p2: Dictionary = sim.points[pi]
	var target := Vector2(float(p2.get("x", 0)), float(p2.get("y", 0)))
	if sim.distance_to(i, target) <= SpaceData.num(space, "reach", "fix"):
		sim.start_doing(i, "sabotage", 2.0, -1, rid)
		a["_sabDone"] = true
		return true
	if sim.set_path(i, target):
		return true
	return false
