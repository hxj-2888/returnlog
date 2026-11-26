extends RefCounted

## 异形常规流程（2026-11-16 从 ai_alien.gd 拆出）。
## 只装「与具体决策比分无关」的流程：补给链 / 队友救援 / 藏尸目的地 / 三道理智线。
## 判定与数值仍然只读 sim / rules.json；本模块不持有状态，全部 static。
## 拆出原因：ai_alien.gd 触到 1359 行棘轮，且这四段可独立做行为夹具。

const SpaceData := preload("res://scripts/space_data.gd")


## 2.5D bodyPos(v) 非空 = 死者或有倒地标记的活人。
static func has_body(v: Dictionary) -> bool:
	return not v.is_empty() \
		and (not bool(v.get("alive", false)) or bool(v.get("downed", false)))


## 2.5D alienSupport（js/game.js:3652）：补给链。真源只在「没刀」或「目标 >12 格」时调用，
## 位置在计划与藏尸之后；贴脸有猎物时连调用都会被函数自身挡掉。
static func support(sim, space: Dictionary, a: Dictionary) -> bool:
	var i := int(a.get("i", -1))
	var ap0: Vector2 = a.get("pos", Vector2.ZERO)
	if a.is_empty() or not bool(a.get("alien", false)) \
			or float(a.get("doing", 0.0)) > 0.0 or int(a.get("drag", -1)) >= 0:
		return false
	var tgt_i := int(a.get("target", -1))
	if int(a.get("knife", 0)) > 0 and tgt_i >= 0:
		var tv: Dictionary = sim.agent(tgt_i)
		if not tv.is_empty() and bool(tv.get("alive", false)) \
				and not bool(tv.get("downed", false)) \
				and (a.get("pos", Vector2.ZERO) as Vector2).distance_to(tv.get("pos", Vector2.ZERO)) < 5.0:
			return false
	# ---- 补给链（2.5D aiAlien 3505-3528，与人类同一条规则）----
	# @src js/game.js:3555-3572：已锁定的「真做任务」目标 —— 这是异形**赚申请单**的唯一入口
	# （3/5 进度各发一张）；到 2.0 格内站桩，做完记一次。
	var sup: Dictionary = a.get("_supportGoal", {}) as Dictionary
	if not sup.is_empty():
		if String(sup.get("kind", "")) != "task" \
				or int(a.get("_alienTaskN", -1)) == int(sim.night):
			a["_supportGoal"] = {}
		else:
			var sup_p := Vector2(float(sup.get("x", 0.0)), float(sup.get("y", 0.0)))
			if ap0.distance_to(sup_p) < 2.0:
				a["_supportGoal"] = {}
				a["_alienTaskN"] = int(sim.night)
				a["_alienTaskTotal"] = int(a.get("_alienTaskTotal", 0)) + 1
				sim.start_doing(i, "task", float(sup.get("dur", 0.0)), int(sup.get("pt", -1)))
				return true
			if sim.set_path(i, sup_p):
				return true
	var qual_pending := int(a.get("qualPending", 0))
	var qual := int(a.get("qual", 0))
	# @src js/game.js:3574-3585：领申请单是交互即领（无 qual<2 门、无站桩，STAND.qual=0）。
	# 旧写法 start_doing(dur=0) 空转且不 return，随后 set_path 又取消动作 → 整局拿不到单。
	if qual_pending > 0:
		var spot: Vector2 = sim.claim_spot()
		if sim.distance_to(i, spot) <= SpaceData.num(space, "reach", "round_table"):
			var qdur := SpaceData.num(space, "stand", "qual")
			if qdur <= 0.0:
				sim.claim_qual(i)
				a["_aiT"] = 0.6
			else:
				sim.start_doing(i, "claim", qdur)
			return true
		if sim.set_path(i, spot):
			return true
	# @src js/game.js:3586-3598：有申请单且缺子弹 → 军械点兑换；旧实现少 return，站桩被后续 set_path 取消。
	if qual > 0 and int(a.get("bullet", 0)) < 1:
		var sp: Vector2 = sim.supply_spot("ammo")
		if sim.distance_to(i, sp) <= SpaceData.num(space, "reach", "fix"):
			sim.start_doing(i, "supply", SpaceData.num(space, "stand", "ammo"), -1, "ammo")
			return true
		if sim.set_path(i, sp):
			return true

	# 2.5D alienSupport:3538-3552：自己放倒的人 45 秒内仍带缺的物资 → 绕回去收。
	if int(a.get("_killBody", -1)) >= 0 and sim.elapsed - float(a.get("_killAt", 0.0)) < 45.0:
		var kv: Dictionary = sim.agent(int(a.get("_killBody", -1)))
		var kdb: Variant = kv.get("draggedBy", null)
		if has_body(kv) and (kdb == null or int(kdb) < 0) and sim.ai_wants_loot(a, kv):
			var kp: Vector2 = kv.get("bodyPos", kv.get("pos", Vector2.ZERO))
			if ap0.distance_to(kp) < SpaceData.num(space, "reach", "body"):
				sim.start_doing(i, "search", SpaceData.num(space, "stand", "search"), -1, "")
				a["_sv"] = int(kv.get("i", -1))
				a["_aiT"] = 1.0
				return true
			if sim.set_path(i, kp):
				return true

	# 翻尸体（2.5D lootRun）：缺子弹/申请单时搜身边没搜过的尸体。
	# 2.5D 场均 alienLoots ≈ 2 —— 异形的子弹大部分来自这里。
	if int(a.get("bullet", 0)) < 1 or int(a.get("qual", 0)) < 2:
		var body2: Dictionary = sim.body_near(a.get("pos", Vector2.ZERO),
			SpaceData.num(space, "reach", "body"))
		if not body2.is_empty() and not bool(body2.get("searched", false)) \
				and (int(body2.get("bullet", 0)) > 0 or int(body2.get("qual", 0)) > 0):
			if sim.search_body(int(body2.get("i", -1)), i):
				a["_aiT"] = 1.0
				return true

	# 破坏已并入 `_plan` 效用表（2.5D alienPlan），不再在这里 if 硬排。
	return false


## 2.5D alienMateRevive（js/game.js:3729）：队友濒死优先救，位次在选猎物之前。
static func mate_revive(sim, space: Dictionary, a: Dictionary) -> bool:
	var i := int(a.get("i", -1))
	var ap0: Vector2 = a.get("pos", Vector2.ZERO)
	if int(a.get("medkit", 0)) <= 0 or sim.mind == null:
		return false
	var mv: Dictionary = {}
	var mvd := 8.0
	for w4: Dictionary in sim.agents:
		var wi4 := int(w4.get("i", -1))
		if w4 == a or not bool(w4.get("alive", false)) or not bool(w4.get("downed", false)) \
				or not sim.mind._is_mate(a, wi4):
			continue
		var wd4 := ap0.distance_to(w4.get("pos", Vector2.ZERO))
		if wd4 < mvd and sim.ai_can_see(a, w4.get("pos", Vector2.ZERO)):
			mvd = wd4
			mv = w4
	if mv.is_empty():
		return false
	if mvd < 1.7:
		sim.start_doing(i, "revive", SpaceData.num(space, "stand", "revive"), -1, "")
		a["_rv"] = int(mv.get("i", -1))
		return true
	return sim.set_path(i, mv.get("pos", Vector2.ZERO))


## @src js/game.js:4110-4116 / 4163-4170：拉闸与破坏的理智线（witnessCap / minConceal，废弃 crowdN）。
static func sanity_blocked(sim, a: Dictionary, at: Vector2, table: String,
		radius: float, conceal: float) -> String:
	var C: Dictionary = sim.rules.t(table)
	var wc := 0
	for w: Dictionary in sim.watchers_at(a, at, radius):
		if sim.mind == null or not sim.mind._is_mate(a, int(w.get("i", -1))):
			wc += 1
	if wc >= int(C.get("witnessCap", 1)):
		return "block_cap"
	if conceal < float(C.get("minConceal", 0.5)):
		return "block_conceal"
	return ""


## @src js/game.js:4174 hideRoomFor(rid,x,y)：藏尸目的地。
## 排除医疗间 / 会议室 / 尸体当前所在舱；评分 = 离医疗间越远越好、离尸体越近越好、
## 附近有人看着要重罚，再叠 ±7 的随机扰动；优先「没人看着」的舱，再从前 3 名里随机。
static func hide_room(sim, body_pos: Vector2, from_room: String = "") -> String:
	var med_c: Vector2 = sim.room_center("med")
	var cands: Array = []
	for r: Dictionary in (sim.map.get("rooms", []) as Array):
		var rid := String(r.get("id", ""))
		if rid == "" or rid == "med" or rid == "bridge" or rid == from_room:
			continue
		var c: Vector2 = sim.room_center(rid)
		var d_body: float = c.distance_to(body_pos)
		var d_med: float = c.distance_to(med_c)
		var crowd := 0
		var near := 9999.0
		for w: Dictionary in sim.agents:
			if not bool(w.get("alive", false)) or bool(w.get("downed", false)) \
					or bool(w.get("detained", false)):
				continue
			var dd: float = (w.get("pos", Vector2.ZERO) as Vector2).distance_to(c)
			if dd < 10.0:
				crowd += 1
				near = minf(near, dd)
		var risk: float = 0.0
		if crowd > 0:
			risk = float(crowd) * 10.0 / (1.0 + near)
		var score: float = d_med - d_body * 0.55 - risk * 6.0 + sim._rng.randf() * 7.0
		cands.append({"id": rid, "score": score, "crowd": crowd})
	if cands.is_empty():
		return from_room
	var empty: Array = cands.filter(func(x: Dictionary) -> bool: return int(x.get("crowd", 0)) == 0)
	var pool: Array = empty if not empty.is_empty() else cands
	pool.sort_custom(func(x: Dictionary, y: Dictionary) -> bool:
		return float(x.get("score", 0.0)) > float(y.get("score", 0.0)))
	pool = pool.slice(0, mini(3, pool.size()))
	return String(pool[sim._rng.randi_range(0, pool.size() - 1)].get("id", from_room))
