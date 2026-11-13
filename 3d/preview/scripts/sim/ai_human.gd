extends RefCounted

## 人类 AI（B2）：选任务 → A* 走路 → 站桩 → 完成 → 领申请单 → 换补给。
## ------------------------------------------------------------------
## 只做“非发言、非战斗”的部分；异形行为在 B3。
## 所有数值从 space.json 进；AI 不读节点，只改 sim 里的 agent 状态。
## 站位/时长口径：
##   · 任务：距任务点 <= REACH.fix 开始站桩，时长 = 任务点 dur；
##   · 申请单：圆桌边缘外 1.2 格，站桩 STAND.qual；
##   · 补给：军械/医疗补给点，站桩 STAND.ammo / STAND.med。

const SpaceData := preload("res://scripts/space_data.gd")

var sim
var space: Dictionary = {}


func setup(p_sim, p_space: Dictionary) -> void:
	sim = p_sim
	space = p_space


func tick(dt: float) -> void:
	if sim == null or sim.over:
		return
	if not sim.meeting.is_empty():
		return
	for a: Dictionary in sim.agents:
		if int(a.get("i", -1)) == int(sim.me_idx) and not bool(sim.spectator):
			continue
		if bool(a.get("detained", false)):
			continue
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		if bool(a.get("alien", false)):
			continue
		# 2.5D aiScanBodies（js/game.js:2524）：人类 AI 与异形共用同一条
		# 扫描 → 观察 → 搜查取证 → 拉铃链，每帧都跑（不进 _decide 节流）。
		sim.scan_bodies(a, dt)
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		# 2.5D aiHuman:2812-2814：站桩做任务时，已确证的异形在视野内快速靠近、且赶不上做完全
		# → 弃任务逃跑（弃任务写 saw_task_abandon，是可被看见的事实）。
		# 旧实现把这段放在 `doing>0 → continue` 之后，成了永远走不到的死分支。
		if float(a.get("doing", 0.0)) > 0.0:
			if String(a.get("_doing", "")) == "task":
				var th: Dictionary = _task_threat(a, float(a.get("doing", 0.0)))
				if not th.is_empty():
					_flee_from(a, th)
			continue
		# 逃跑中：只沿路径走，不做任何决策（2.5D aiHuman:2816-2820）
		if float(a.get("_fleeT", 0.0)) > 0.0:
			a["_fleeT"] = float(a.get("_fleeT", 0.0)) - dt
			continue
		# 2.5D aiHuman:2824-2834：开局先各自散开、错峰开工，避免所有人同一秒冲向任务点。
		var delay := float(a.get("_delay", 0.0))
		if delay > 0.0:
			a["_delay"] = delay - dt
			var dp: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
			if dp.is_empty() and sim._rng.randf() < dt * 0.45:
				var rooms: Array = sim.map.get("rooms", []) as Array
				if not rooms.is_empty():
					var rr: Dictionary = rooms[sim._rng.randi_range(0, rooms.size() - 1)]
					sim.set_path(int(a.get("i", -1)), sim.room_center(String(rr.get("id", ""))))
			continue
		# 2.5D aiHuman:2836-2850：拖尸途中——尸体失效 / 无人机不可用 / 人已进医疗间就松手，
		# 否则继续把人拖到无人机坞位（medDropSpot）再放。3D 旧实现只在「已到医疗间」松手，
		# 无人机半路报废时会把尸体一路拖到天亮。
		if int(a.get("drag", -1)) >= 0:
			var carried: Dictionary = sim.agent(int(a.get("drag", -1)))
			if carried.is_empty() or not bool(carried.get("alive", false)) \
					or not bool(carried.get("downed", false)):
				sim.release_drag(int(a.get("i", -1)))
			elif not _medbot_usable():
				sim.release_drag(int(a.get("i", -1)))
				a["_aiT"] = 1.0
				continue
			elif sim.room_at(carried.get("pos", Vector2.ZERO)) == "med" \
					or ap.distance_to(sim.bots.med_home) < 4.5:
				sim.release_drag(int(a.get("i", -1)))
				a["_aiT"] = 1.0
				continue
			else:
				if (a.get("path", PackedVector2Array()) as PackedVector2Array).is_empty() \
						and ap.distance_to(sim.bots.med_home) >= 1.0:
					sim.set_path(int(a.get("i", -1)), sim.bots.med_home)
				continue
		# 医疗包优先救人（2.5D aiHuman:2852-2862）：只在**没有在走路**时找濒死者，
		# 且别人已经在救/已经在拖的人不重复上手（busy）。
		var path_now: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
		if int(a.get("medkit", 0)) > 0 and path_now.is_empty():
			var v: Dictionary = sim.nearest_downed(ap, 7.5, a)
			if not v.is_empty():
				var busy := int(v.get("draggedBy", -1)) >= 0
				for x: Dictionary in sim.agents:
					if busy:
						break
					if x != a and String(x.get("_doing", "")) == "revive" \
							and int(x.get("_rv", -1)) == int(v.get("i", -1)):
						busy = true
				if not busy:
					var vp: Vector2 = v.get("pos", Vector2.ZERO)
					if ap.distance_to(vp) < 1.7:
						sim.start_doing(int(a.get("i", -1)), "revive",
							SpaceData.num(space, "stand", "revive"), -1, "")
						a["_rv"] = int(v.get("i", -1))
						continue
					elif sim.set_path(int(a.get("i", -1)), vp):
						continue
		# 2.5D aiHuman（js/game.js:2875）：没有医疗包但医疗无人机可用时，
		# 把视线内的濒死者拖进医疗间交给机器人复活。3D 之前缺这条，
		# 于是「无人机只救医疗间内」时根本没人被送进去。
		# 只排除"自己刚开枪打倒的人"，避免救活自己刚制服的嫌疑人。
		if int(a.get("medkit", 0)) <= 0 and _medbot_usable():
			var dv: Dictionary = sim.nearest_downed(ap, 8.5, a)
			if not dv.is_empty():
				var dragged_by: Variant = dv.get("draggedBy", null)
				var killer: Variant = dv.get("killedBy", null)
				var free_body: bool = dragged_by == null or int(dragged_by) < 0
				var self_killed: bool = killer != null and int(killer) == int(a.get("i", -1))
				if free_body and not self_killed \
						and sim.room_at(dv.get("pos", Vector2.ZERO)) != "med":
					var dvp: Vector2 = dv.get("pos", Vector2.ZERO)
					if ap.distance_to(dvp) < 1.9:
						if sim.start_drag(int(a.get("i", -1)), int(dv.get("i", -1))):
							# 2.5D medDropSpot：医疗间中心（无人机坞位）。
							sim.set_path(int(a.get("i", -1)), sim.bots.med_home)
							continue
					elif sim.set_path(int(a.get("i", -1)), dvp):
						continue
		# 2.5D aiHuman:2960 lootRun：视野内 / 30 秒记忆里带自己缺的物资的尸体，主动去翻。
		if _loot_run(a):
			continue
		# 2.5D aiHuman:2962-2977：高警觉（alert>=0.7）听到 8 秒内的动静 → 去现场看一眼。
		if _look_around(a):
			continue
		var path: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
		if path.size() > 0:
			continue
		var wait := float(a.get("_aiT", 0.0)) - dt
		a["_aiT"] = wait
		if wait > 0.0:
			continue
		_decide(a)


## 2.5D medbotUsable（js/game.js:2719）：无人机没被拆、且还有当夜电量。
func _medbot_usable() -> bool:
	if sim.bots == null or sim.bots.is_dead("medbot"):
		return false
	return sim.bots.med_uses < sim.bots.MED_USES_MAX


## 2.5D aiHuman:2864-2899 的开枪链（逐行）：
##   ① 已有确证（a.suspect / bestKnownTarget）→ 直接打；
##   ② 门槛 thr = SKTrait.C.shootSus(a)（激进 0.36 / 中性 0.50 / 谨慎 0.60）；
##   ③ 场上存在「准-确证敌人」时 thr ×= ALMOST.foeShootMul（更容易开枪）；
##   ④ bestSusTarget(thr, 夜间折价) 命中且不是 almostFriend → 选他；
##   ⑤ 否则 affordableAlmostShot：准-确证目标 sus≥0.85×thr 也敢打。
## 只在这里选人；射程/追猎距离由 _decide 按 space.json#shoot 判（那是意愿不是能力）。
func _shoot_target(a: Dictionary) -> int:
	if sim.mind == null:
		return -1
	# ① 2.5D `si=a.suspect` 的有效目标：本文件用 known（确证表）等价承载
	var si := int(sim.mind.best_known_target(a).get("i", -1))
	if si >= 0:
		return si
	# ②③ 门槛随性格；有准-确证敌人时打折
	var thr: float = sim.mind.trait_c("shootSus", a)
	if not sim.mind.best_almost_target(a).is_empty():
		thr *= sim.rules.n("ALMOST", "foeShootMul", 0.7)
	# ④ bestSusTarget(a,thr,true)：按夜间折价读存量嫌疑
	var best := -1
	var bv := thr
	for k: Variant in (a.get("sus", {}) as Dictionary).keys():
		var ti := int(k)
		if not sim.mind.live_target(ti, int(a.get("i", -1))):
			continue
		var v: float = sim.mind.sus_of_night(a, ti)
		if v >= bv:
			bv = v
			best = ti
	if best >= 0 and _almost_friend(a, best):
		best = -1
	# ⑤ affordableAlmostShot
	if best < 0:
		var af: Dictionary = sim.mind.best_almost_target(a)
		if not af.is_empty():
			var ai2 := int(af.get("i", -1))
			if not _almost_friend(a, ai2) \
					and sim.mind.sus_of_night(a, ai2) >= thr * 0.85:
				best = ai2
	return best


## 2.5D almostFriendOf（js/t2/ai.js:513）：这人已被我归到「基本是好人」。
func _almost_friend(a: Dictionary, i: int) -> bool:
	var al: Dictionary = a.get("almost", {}) as Dictionary
	return ((al.get("friend", {}) as Dictionary)).has(i)


## 2.5D taskThreat（js/game.js:2775-2788）逐行：已确证的异形在 7 格内、看得见，
## 且「正在靠近 或 已贴身到 3.5 格」，而剩余站桩时间 > 逃跑所需时间 × fleeThreshold
## （性格系数：激进的人剩 1 秒也要修完，谨慎的人早早就跑）→ 返回威胁。
func _task_threat(a: Dictionary, remain: float) -> Dictionary:
	if sim.mind == null or bool(a.get("alien", false)) or not bool(a.get("alive", false)) \
			or bool(a.get("downed", false)):
		return {}
	var kn: Dictionary = sim.mind.best_known_target(a)
	if kn.is_empty():
		return {}
	var t: Dictionary = sim.agent(int(kn.get("i", -1)))
	if t.is_empty() or t == a or not bool(t.get("alive", false)) or bool(t.get("downed", false)):
		return {}
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var tp: Vector2 = t.get("pos", Vector2.ZERO)
	var d := ap.distance_to(tp)
	if d > 7.0 or not sim.ai_can_see(a, tp):
		return {}
	var closing: bool = bool(t.get("moving", false)) \
		or (t.get("path", PackedVector2Array()) as PackedVector2Array).size() > 0
	if not closing and d > 3.5:
		return {}
	var travel := d / maxf(1.0, SpaceData.num(space, "move", "speed"))
	if remain > (travel - 0.6) * sim.mind.trait_c("fleeThreshold", a):
		return t
	return {}


## 2.5D lootRun（js/game.js:2720-2748）：缺弹 / 缺包 / 缺申请单时，
## ① 视野内 12 格有带这些物资的尸体/濒死者 → 直接去翻；
## ② 都没有 → 回到 30 秒内见过、仍然带自己缺的物资的目标（`_lootMem`）。
func _loot_run(a: Dictionary) -> bool:
	if float(a.get("doing", 0.0)) > 0.0 or int(a.get("drag", -1)) >= 0:
		return false
	if not (a.get("_fixGo", {}) as Dictionary).is_empty() or bool(a.get("_lightGo", false)):
		return false
	if not (int(a.get("bullet", 0)) < 1 or int(a.get("medkit", 0)) < 1
			or int(a.get("qual", 0)) < 2):
		return false
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var best: Dictionary = {}
	var bd := 12.0
	for v: Dictionary in sim.agents:
		if v == a:
			continue
		if bool(v.get("alive", false)) and not bool(v.get("downed", false)):
			continue
		if bool(a.get("alien", false)) and sim.mind != null \
				and sim.mind._is_mate(a, int(v.get("i", -1))):
			continue
		var db: Variant = v.get("draggedBy", null)
		if not (db == null or int(db) < 0):
			continue
		if not sim.body_has_loot(v) or not sim.ai_wants_loot(a, v):
			continue
		var bp: Vector2 = v.get("bodyPos", v.get("pos", Vector2.ZERO))
		var d := ap.distance_to(bp)
		if d < bd and sim.ai_can_see(a, bp):
			bd = d
			best = v
	if not best.is_empty():
		return _start_loot_search(a, best)
	var mem: Dictionary = (a.get("_lootMem", {}) as Dictionary).duplicate()
	var target: Dictionary = {}
	var md := 20.0
	for k: Variant in mem.keys():
		var rec: Dictionary = mem[k] as Dictionary
		var v2: Dictionary = sim.agent(int(k))
		var db2: Variant = v2.get("draggedBy", null)
		if v2.is_empty() or float(sim.elapsed) - float(rec.get("t", 0.0)) > 30.0 \
				or not sim.body_has_loot(v2) or not sim.ai_wants_loot(a, v2) \
				or not (db2 == null or int(db2) < 0):
			mem.erase(k)
			continue
		var bp2: Vector2 = v2.get("bodyPos", v2.get("pos", Vector2.ZERO))
		var d2 := ap.distance_to(bp2)
		if d2 < md:
			md = d2
			target = v2
	a["_lootMem"] = mem
	return not target.is_empty() and _start_loot_search(a, target)


## 2.5D startLootSearch（js/game.js:2699-2718）：到位就站桩翻尸，否则走过去。
func _start_loot_search(a: Dictionary, v: Dictionary) -> bool:
	var i := int(a.get("i", -1))
	var vi := int(v.get("i", -1))
	if bool(a.get("alien", false)) and sim.mind != null and sim.mind._is_mate(a, vi):
		return false
	for x: Dictionary in sim.agents:
		if x != a and String(x.get("_doing", "")) == "search" and int(x.get("_sv", -1)) == vi:
			return false
	var mem: Dictionary = (a.get("_lootMem", {}) as Dictionary).duplicate()
	mem.erase(vi)
	a["_lootMem"] = mem
	var bp: Vector2 = v.get("bodyPos", v.get("pos", Vector2.ZERO))
	if (a.get("pos", Vector2.ZERO) as Vector2).distance_to(bp) \
			< SpaceData.num(space, "reach", "body"):
		sim.start_doing(i, "search", SpaceData.num(space, "stand", "search"), -1, "")
		a["_sv"] = vi
		return true
	# 2.5D `if(!a.path||!a.path.length)walkTo(...)`：已经在走的路不因顺手看见尸体而改道，
	# 只有走不过去才忘掉这个目标。
	if not (a.get("path", PackedVector2Array()) as PackedVector2Array).is_empty():
		return true
	return sim.set_path(i, bp)


## 2.5D aiHuman:2962-2977：听到尖叫/枪声/刀声 → 高警觉（alert>=0.7）且没有更急的事，
## 去现场看一眼；到了（3 格）或超过 10 秒就收工并把警觉降回去。
func _look_around(a: Dictionary) -> bool:
	var i := int(a.get("i", -1))
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var look: Dictionary = a.get("_look", {}) as Dictionary
	if look.is_empty():
		if float(a.get("alert", 0.0)) < 0.7:
			return false
		var nz: Dictionary = a.get("noise", {}) as Dictionary
		if nz.is_empty():
			return false
		var np := Vector2(float(nz.get("x", 0.0)), float(nz.get("y", 0.0)))
		if float(sim.elapsed) - float(nz.get("t", 0.0)) < 8.0 and ap.distance_to(np) > 3.0:
			a["_look"] = {"x": np.x, "y": np.y, "t": float(sim.elapsed)}
			sim.set_path(i, np)
			return true
		a["alert"] = 0.0
		a["noise"] = {}
		return false
	var lp := Vector2(float(look.get("x", 0.0)), float(look.get("y", 0.0)))
	if ap.distance_to(lp) < 3.0 or float(sim.elapsed) - float(look.get("t", 0.0)) > 10.0:
		a["_look"] = {}
		a["alert"] = maxf(0.0, float(a.get("alert", 0.0)) - 0.5)
		a["noise"] = {}
		return false
	if (a.get("path", PackedVector2Array()) as PackedVector2Array).is_empty():
		sim.set_path(i, lp)
	return true


func _decide(a: Dictionary) -> void:
	var i := int(a.get("i", -1))
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var qual_pending := int(a.get("qualPending", 0))
	var qual := int(a.get("qual", 0))

	# 2.5D aiHuman（js/game.js:2838-2870）：有子弹 + 有确证/高置信目标 → 射程内开枪，
	# 结算与玩家共用 fireShot。目标选择/门槛见 _shoot_target；节流对应 fireShot 的 _rest。
	if int(a.get("bullet", 0)) > 0:
		var si: int = _shoot_target(a)
		if si >= 0:
			var scfg: Dictionary = space.get("shoot", {}) as Dictionary
			var sp2: Vector2 = sim.agent(si).get("pos", Vector2.ZERO)
			var d2 := ap.distance_to(sp2)
			# 2.5D：射程只决定"现在能不能打"，愿意追多远由 chaseKnown/chaseSus 决定。
			if d2 < float(scfg.get("range", 9.0)) and sim.ai_can_see(a, sp2) \
					and sim.shoot(i, si):
				a["_aiT"] = 2.5 + sim._rng.randf() * 2.0
				return
			var kn2: Dictionary = sim.mind.best_known_target(a) if sim.mind != null else {}
			var sure: bool = not kn2.is_empty() and int(kn2.get("i", -1)) == si
			var chase_r := float(scfg.get("chaseKnown", 14.0)) if sure \
				else float(scfg.get("chaseSus", 10.0))
			if d2 < chase_r:
				if (a.get("path", PackedVector2Array()) as PackedVector2Array).is_empty():
					sim.set_path(i, sp2)
				a["_aiT"] = 0.4
				return

	# 2.5D aiHuman:2847：全船断电时，指派 1 名人类 AI 去合闸（打断零散任务）
	if not sim.power_on:
		var light_go: bool = bool(a.get("_lightGo", false))
		if not light_go:
			var crew := 0
			for x: Dictionary in sim.agents:
				if x != a and bool(x.get("_lightGo", false)) and bool(x.get("alive", false)) \
						and not bool(x.get("downed", false)):
					crew += 1
			if crew < 1:
				a["_lightGo"] = true
				light_go = true
		if light_go:
			var bp: Vector2 = sim.breaker_pos()
			if ap.distance_to(bp) <= SpaceData.num(space, "reach", "breaker"):
				sim.start_doing(int(a.get("i", -1)), "breaker", sim.breaker_on_time())
				a["_lightGo"] = false
			elif sim.set_path(int(a.get("i", -1)), bp):
				return
			else:
				a["_lightGo"] = false
	elif bool(a.get("_lightGo", false)):
		# 2.5D `}else if(a._lightGo)a._lightGo=false;`：复电后把指派标记清掉，
		# 否则下一次断电时这个人仍被算作"已有合闸人"，别人不再接手。
		a["_lightGo"] = false

	# 3) 故障抢修（2.5D aiHuman:2911-2934）：**不是全员扑同一个点**。
	# 每人只在「已在修 / 正在赶」人数 < SKTeam.FIX_CREW_CAP 的故障里挑**最近**的一个，
	# 并锁定 _fixGo 直到它被修好；锁定后不被任务点打断（避免来回踱步）。
	# 3D 旧实现是 `dmg[0]` 一条写死、没有上限 —— 11 个人类 AI 会全部涌向同一处，
	# 而破坏点本身就落在一个任务点坐标上，玩家看到的就是「一堆人挤在一个任务点」。
	# 2.5D 只在有故障时更新 _fixGo，但**跨夜清故障后旧引用必须作废**：
	# 旧实现把它放在 `if(sim.dmg.size()>0)` 里，天亮 dmg=[] 时永远清不掉。
	var fix_go: Dictionary = a.get("_fixGo", {}) as Dictionary
	if not fix_go.is_empty() and sim.dmg.find(fix_go) < 0:
		a["_fixGo"] = {}
		fix_go = {}
	if sim.dmg.size() > 0:
		if fix_go.is_empty():
			var cap := int(sim.rules.module_table("SKTeam").get("FIX_CREW_CAP", 3))
			var best_fix: Dictionary = {}
			var best_fd := INF
			for d: Dictionary in sim.dmg:
				var crew := 0
				for x: Dictionary in sim.agents:
					if x == a:
						continue
					var fixing := String(x.get("_doing", "")) == "fix" \
						and String(x.get("_item", "")) == String(d.get("room", ""))
					var heading: bool = x.get("_fixGo", null) == d
					if fixing or heading:
						crew += 1
				if crew >= cap:
					continue
				var dd := ap.distance_to(Vector2(float(d.get("x", 0.0)),
					float(d.get("y", 0.0))))
				if dd < best_fd:
					best_fd = dd
					best_fix = d
			if not best_fix.is_empty():
				a["_fixGo"] = best_fix
				a["path"] = PackedVector2Array()
				fix_go = best_fix
		if not fix_go.is_empty():
			var dp := Vector2(float(fix_go.get("x", 0.0)), float(fix_go.get("y", 0.0)))
			# 2.5D 到达判据 1.5 格（不是任务点的 2.8，也不是 reach.fix）
			if ap.distance_to(dp) < 1.5:
				sim.start_doing(i, "fix", SpaceData.num(space, "stand", "fix"), -1,
					String(fix_go.get("room", "")))
			elif not sim.set_path(i, dp):
				_stuck(a)
			return

	# 4) 有待领申请单：回圆桌领（个人进度 3 / 5 各生成一张）。
	# @src js/game.js:2980 `if(a.qualPending>0)`：没有 qual<2 的附加条件。
	if qual_pending > 0:
		var spot: Vector2 = sim.claim_spot()
		if sim.distance_to(i, spot) <= SpaceData.num(space, "reach", "round_table"):
			# 2.5D 2026-11-10：领申请单改成**交互即领**（grantQual），STAND.qual 归 0。
			# 站桩时长 <=0 时直接结算 —— 否则 start_doing 会以 dur<=0 报错、AI 永远领不到单。
			var qdur := SpaceData.num(space, "stand", "qual")
			if qdur <= 0.0:
				sim.claim_qual(i)
				a["_aiT"] = 0.6
			else:
				sim.start_doing(i, "claim", qdur)
		elif not sim.set_path(i, spot):
			_stuck(a)
		return

	# 5) 有申请单且确实需要：去对应补给点兑换。
	# @src js/game.js:1007-1012 supplyTargetFor：有人濒死才买医疗包；否则缺弹才买弹。
	# @src js/game.js:2999 supplyPoints().find(q=>q.item===need)：补给点键是 ammo / med。
	var item := ""
	var someone_downed := false
	for v: Dictionary in sim.agents:
		if v != a and bool(v.get("alive", false)) and bool(v.get("downed", false)):
			someone_downed = true
			break
	if int(a.get("medkit", 0)) < 1 and someone_downed:
		item = "medkit"
	elif int(a.get("bullet", 0)) < 1:
		item = "ammo"
	if qual > 0 and item != "":
		var sp: Vector2 = sim.supply_spot("med" if item == "medkit" else item)
		if sim.distance_to(i, sp) <= SpaceData.num(space, "reach", "fix"):
			var dur := SpaceData.num(space, "stand", "ammo" if item == "ammo" else "med")
			sim.start_doing(i, "supply", dur, -1, item)
		elif not sim.set_path(i, sp):
			_stuck(a)
		return

	# 6) 做任务：按 tIdx 顺序取下一个剩余任务。
	var rem: Array = sim.remaining_tasks(i)
	if rem.is_empty():
		# 2.5D aiIdleRoam（js/game.js:2312-2363）：任务做完**不许站桩** ——
		# 修故障 / 领申请单 / 危险时跟信任的人 / 躲开咬我的人 / 巡舱。
		_idle_roam(a)
		a["_aiT"] = 0.8
		return
	# 领袖指令服从（2.5D aiHuman:2948-2967）：领袖当众说"你去某舱"，
	# 就把那个舱的任务换到当前位 —— obeyP = 号召力 × (cred(领袖)/trustObeyGate)。
	# 命令只在本夜有效（天亮重排）；没照办记 orderBroke（能被同舱的人看见）。
	var od: Dictionary = a.get("order", {}) as Dictionary
	if not od.is_empty() and int(od.get("night", -1)) == int(sim.night):
		a["order"] = {}
		var orid := String(od.get("room", ""))
		var leader_i := int(od.get("by", -1))
		# 2.5D：`idx===a.tIdx`（本来就要去那间）算**已经照办**，不是抗命
		var swapped := false
		var tasks_own: Array = a.get("tasks", []) as Array
		var tIdx := int(a.get("tIdx", 0))
		for k in range(tIdx, tasks_own.size()):
			var p2: Dictionary = sim.point(int(tasks_own[k]))
			if String(p2.get("room", "")) == orid:
				if k == tIdx:
					sim._stat("orderObey", 1)
				else:
					var gate: float = maxf(0.01, sim.mind.trust_obey_gate())
					var charisma := 0.0
					if sim.speech != null:
						charisma = sim.speech.leader_charisma
					var obey_p := charisma * clampf(sim.mind.cred_of(a, leader_i) / gate, 0.0, 1.0)
					if sim._rng.randf() < obey_p:
						# 真正换位：改 agent 自己的 tasks 序列（remaining_tasks 每次返回副本）
						var tmp: int = tasks_own[tIdx]
						tasks_own[tIdx] = tasks_own[k]
						tasks_own[k] = tmp
						a["tasks"] = tasks_own
						sim._stat("orderObey", 1)
					else:
						sim._stat("orderRefuse", 1)
				swapped = true
				break
		if not swapped:
			pass
	var pi := int(rem[0])
	var p: Dictionary = sim.point(pi)
	var target := Vector2(float(p.get("x", 0.0)), float(p.get("y", 0.0)))
	# @src js/game.js:3027 `Math.hypot(p.x-a.x,p.y-a.y)<2.8` —— 任务开始站桩的到达判据是 2.8，
	# 不是 reach.fix(2.0)。旧值让 AI 必须挤到同一个贴身点才开始做，视觉上更像「一堆人叠在一起」。
	if sim.distance_to(i, target) < 2.8:
		sim.start_doing(i, "task", float(p.get("dur", 0.0)), pi)
	elif not sim.set_path(i, target):
		_stuck(a)


## 2.5D topCred（js/game.js:1508）：我信得最多的那个人（cred ≥ accuseShieldAt，
## 且我没有亲眼确证他是异形）。只读 mind.cred / known，不读阵营。
func _top_cred(a: Dictionary) -> Dictionary:
	if sim.mind == null:
		return {}
	var cred: Dictionary = a.get("cred", {}) as Dictionary
	var known: Dictionary = a.get("known", {}) as Dictionary
	var th: float = sim.mind.trust_endorse_at()
	var bi := -1
	var bv := 0.0
	for k: int in cred.keys():
		var v := float(cred[k])
		if v < th or known.has(k):
			continue
		if bi < 0 or v > bv:
			bi = k
			bv = v
	if bi < 0:
		return {}
	var t: Dictionary = sim.agent(bi)
	if t.is_empty() or not bool(t.get("alive", false)) or bool(t.get("downed", false)) \
			or bool(t.get("detained", false)):
		return {}
	return t


## 2.5D warmMate（js/game.js:1541）：warm ≥ minWarm、14 格内、活着且没被拘留的人里
## 最聊得来的那个。warm 与 cred 是两条独立通道，不要合并。
func _warm_mate(a: Dictionary) -> Dictionary:
	var warm: Dictionary = a.get("warm", {}) as Dictionary
	var minv: float = sim.rules.n("WARM", "minWarm", 0.22)
	var rng: float = sim.rules.n("WARM", "range", 14.0)
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var bi := -1
	var bv: float = minv
	for k: int in warm.keys():
		var v := float(warm[k])
		if v < bv:
			continue
		var t: Dictionary = sim.agent(k)
		if t.is_empty() or k == int(a.get("i", -1)) \
				or not bool(t.get("alive", false)) or bool(t.get("downed", false)) \
				or bool(t.get("detained", false)):
			continue
		if (t.get("pos", Vector2.ZERO) as Vector2).distance_to(ap) > rng:
			continue
		bi = k
		bv = v
	if bi < 0:
		return {}
	return sim.agent(bi)


## 2.5D aiIdleRoam 的「躲避」：用 audSusEstimate 估谁最怀疑我。
## **不读对方 mind.sus**（2026-11-05 读心清零）：只认当众指认 / 看见我在现场 / 红身。
func _aud_hater(a: Dictionary) -> Dictionary:
	if sim.mind == null:
		return {}
	var best: Dictionary = {}
	var bs := 0.45
	for w: Dictionary in sim.agents:
		if w == a or not bool(w.get("alive", false)) or bool(w.get("downed", false)):
			continue
		var est: Dictionary = sim.mind.aud_sus_estimate(a, w)
		var s := float(est.get("score", 0.0))
		if s > bs:
			bs = s
			best = w
	return best


## 2.5D aiIdleRoam（js/game.js:2312-2363）：任务做完后的移动。
## 顺序：修故障 → 回圆桌领单 → 危险时跟信任的人 → 躲开咬我的人 → 随机巡舱。
## 只设路径，真正的移动由 sim 的移动结算统一做。
func _idle_roam(a: Dictionary) -> void:
	var i := int(a.get("i", -1))
	var path: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
	if path.size() > 0:
		return
	var tg := Vector2.INF
	# 故障 / 申请单兜底（正常流程在 _decide 前段已处理，这里防止"任务刚做完就站住"）。
	if sim.dmg.size() > 0:
		var d: Dictionary = sim.dmg[sim._rng.randi_range(0, sim.dmg.size() - 1)]
		tg = Vector2(float(d.get("x", 0.0)), float(d.get("y", 0.0)))
	elif int(a.get("qualPending", 0)) > 0:
		var cs: Vector2 = sim.claim_spot()
		tg = cs
	if tg == Vector2.INF:
		# 2.5D 正向信任：断电或场上有人倒下时，人本能地往"我信的那一个"靠。
		var danger: bool = int(sim.light_state) == 2
		if not danger:
			for x: Dictionary in sim.agents:
				if bool(x.get("alive", false)) and bool(x.get("downed", false)):
					danger = true
					break
		var lead: Dictionary = _top_cred(a) if danger else {}
		var lead_i := int(lead.get("i", -1))
		var mate: Dictionary = lead
		if mate.is_empty():
			mate = _warm_mate(a)
		if not mate.is_empty() \
				and sim._rng.randf() < sim.rules.n("WARM", "followChance", 0.45):
			var mp: Vector2 = mate.get("pos", Vector2.ZERO)
			tg = mp
			if lead_i >= 0 and int(mate.get("i", -1)) == lead_i:
				sim._stat("credFollow", 1)
	if tg == Vector2.INF:
		var hater := _aud_hater(a)
		if not hater.is_empty():
			var ap: Vector2 = a.get("pos", Vector2.ZERO)
			var hp: Vector2 = hater.get("pos", Vector2.ZERO)
			var dv := ap - hp
			var d2 := dv.length()
			if d2 < 0.001:
				dv = Vector2.RIGHT
				d2 = 1.0
			var r: float = 8.0 + sim._rng.randf() * 4.0
			var t2: Vector2 = ap + dv / d2 * r
			var nf: Vector2 = t2
			if not sim.nav.is_free(t2):
				nf = sim.nav.nearest_free(t2)
			tg = nf
			# 2.5D：_avoidHuman **不在 startNight 的重置清单里**（粘性），
			# 谁最后一次被我躲开，之后每夜他靠近 6 格都会被我看见"他在躲我"。
			a["_avoidHuman"] = int(hater.get("i", -1))
			sim._stat("avoidCount", 1)
	if tg == Vector2.INF:
		var rooms: Array = sim.map.get("rooms", []) as Array
		if rooms.is_empty():
			return
		var r2: Dictionary = rooms[sim._rng.randi_range(0, rooms.size() - 1)]
		var rc: Vector2 = sim.room_center(String(r2.get("id", "")))
		tg = rc
	if not sim.set_path(i, tg):
		_stuck(a)


func _stuck(a: Dictionary) -> void:
	var n := int(a.get("_stuckN", 0)) + 1
	a["_stuckN"] = n
	a["_aiT"] = 0.5
	if n >= 3:
		# 连续三次寻路失败：把 agent 落到最近可行走点，避免永久卡死。
		# 只改位置，不改任何判定状态。
		a["_stuckN"] = 0
		a["_aiT"] = 1.0
		a["pos"] = sim.nav.nearest_free(a.get("pos", Vector2.ZERO))

## 逃跑（2.5D fleeTask：背向威胁源跑 7~10 格，_fleeT 3.5~5 秒内不做别的决策）
func _flee_from(a: Dictionary, threat: Dictionary) -> void:
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	# 弃任务本身是能被看见的事实（2.5D noticeTaskAbandon → saw_task_abandon）
	if float(a.get("doing", 0.0)) > 0.0:
		sim._witness_action(a, "saw_task_abandon", ap)
	a["doing"] = 0.0
	a["_doing"] = ""
	a["taskPt"] = -1
	a["_fleeT"] = 3.5 + sim._rng.randf() * 1.5
	var tp: Vector2 = threat.get("pos", Vector2.ZERO)
	var ang := (ap - tp).angle()
	var dest: Vector2 = ap + Vector2(cos(ang), sin(ang)) * (7.0 + sim._rng.randf() * 3.0)
	if not sim.set_path(int(a.get("i", -1)), dest):
		sim.set_path(int(a.get("i", -1)), sim.nav.nearest_free(dest))
