extends RefCounted

## 异形 AI（B3 最小版）：找人 → 走到刀程 → 出刀；偶尔去非会议室舱破坏。
## 不做完整的计划/伪装/管道，这些留给后续批次；先把“夜里真的会死人”跑起来。
## 口径：异形互不知道身份，这里也不读队友表；目标只按「现在看得见 / 本夜亲眼见过
## 的最后位置（≤HUNT.memorySec）」选，完全没印象的人不进候选（2.5D 取消全图锁敌）。

const SpaceData := preload("res://scripts/space_data.gd")

var sim
var space: Dictionary = {}
## 决策遥测：只计数，不参与判定；--sim1000 汇总用
var stats: Dictionary = {}
## 预计算的门口世界坐标（2.5D exitDistAt 的逃逸成本原料）
var _doors: Array = []
## 管道口（map_v2.pipes，2.5D M.pipes 同源）
var _pipes: Array = []

func _bump(k: String) -> void:
	stats[k] = int(stats.get(k, 0)) + 1


func setup(p_sim, p_space: Dictionary) -> void:
	sim = p_sim
	space = p_space
	# 2.5D exitDistAt：出刀点离最近的门/管道口越远，红身期间越走不干净。
	# 3D 用 map_v2 的房间门表预计算同一批点。
	_doors = []
	_pipes = (sim.map.get("pipes", []) as Array).duplicate()
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


## 2.5D exposureAt（js/game.js:3156）：异形此刻在 at 动手会被多少人看见。
## 目击者按 witnessWeight 加权；做事的人注意力不在线，完全排除；
## 逃逸成本按离最近门/管道口的距离算（escapeCost）。
func _exposure_at(a: Dictionary, at: Vector2, except_v: Dictionary) -> float:
	if sim.mind == null:
		return 0.0
	var R: float = maxf(SpaceData.num(space, "sight", "human_light_r"),
		sim.sight_range_at(at))
	var ws: Array = []
	for w: Dictionary in sim.agents:
		if w == a or w == except_v:
			continue
		if not bool(w.get("alive", false)) or bool(w.get("downed", false)) \
				or bool(w.get("detained", false)):
			continue
		if bool(w.get("alien", false)) and sim.mind._is_mate(a, int(w.get("i", -1))):
			continue
		if float(w.get("doing", 0.0)) > 0.0:
			continue
		var wp: Vector2 = w.get("pos", Vector2.ZERO)
		var d := wp.distance_to(at)
		if d > R or not sim.ai_can_see(w, at):
			continue
		ws.append(sim.mind.witness_weight(d, R, false))
	return sim.mind.exposure(ws, sim.mind.escape_cost(_exit_dist(at)))


## @src js/game.js:3244 audienceHotRooms(a)
## 2.5D 读 `a.mind.mem` 的 `saw_agent` 同夜记录；3D 没有 mem 时间线，
## 等价来源是 `a.why[]`（对某个人的证据数组，见 parity-map#allowed_differences 第 5 条）。
## 返回 room → 次数，供演出点排序（常客舱室优先）。
func audience_hot_rooms(a: Dictionary) -> Dictionary:
	var hot: Dictionary = {}
	var why: Dictionary = a.get("why", {}) as Dictionary
	for tgt: int in why.keys():
		for e: Variant in (why[tgt] as Array):
			var rec := e as Dictionary
			if String(rec.get("kind", "")) != "saw_agent":
				continue
			if int(rec.get("night", -1)) != int(sim.night):
				continue
			var rid := String(rec.get("room", ""))
			if rid == "" or rid == "corridor" or rid == "unknown":
				continue
			hot[rid] = int(hot.get(rid, 0)) + 1
	return hot


## @src js/game.js:3189 alienAudienceInfo(a,rad)
## 返回 {n, weight, idle, sus, inf}：权重 = 1 + audSus（他估对方怀疑 ≥ susMin）
## + audInf（本局领袖 / 公开影响力 ≥ 0.34）。不读对方私有 mind（读心清零）。
## 注意：判断的是「**他看得见我**」，不是「我看得见他」——用 ai_can_see(w, a.pos)。
func audience_info(a: Dictionary, rad: float) -> Dictionary:
	var D: Dictionary = sim.rules.t("DISGUISE")
	var n := 0
	var weight := 0.0
	var idle := 0
	var sus := 0
	var inf := 0
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	for w: Dictionary in sim.agents:
		if w == a or not bool(w.get("alive", false)) or bool(w.get("downed", false)) \
				or bool(w.get("detained", false)):
			continue
		if sim.mind != null and sim.mind._is_mate(a, int(w.get("i", -1))):
			continue
		# 做小游戏 / 开遮罩的人看不见（2.5D attention != online）
		if float(w.get("doing", 0.0)) > 0.0:
			continue
		var wp: Vector2 = w.get("pos", Vector2.ZERO)
		if ap.distance_to(wp) >= rad or not sim.ai_can_see(w, ap):
			continue
		n += 1
		idle += 1
		var v := 1.0
		if sim.mind != null and float(sim.mind.aud_sus_estimate(a, w).get("score", 0.0)) \
				>= float(D.get("susMin", 0.25)):
			v += float(D.get("audSus", 0.9))
			sus += 1
		if _is_leader(w) or (sim.mind != null and sim.mind.public_influence(w) >= 0.34):
			v += float(D.get("audInf", 0.6))
			inf += 1
		weight += v
	return {"n": n, "weight": weight, "idle": idle, "sus": sus, "inf": inf}


## 2.5D `G.leader === w.i`（alienAudienceInfo 里的领袖加权）。
func _is_leader(w: Dictionary) -> bool:
	if sim.speech == null:
		return false
	return int(sim.speech.leader_i) == int(w.get("i", -1))


## @src js/ai/sanity.js:490 LENS.lr(key)：human / max(floor, alien)；knownOnly → INF。
## 只用于候选**排序**，不参与任何权重（用户裁定 order only, no w=f(lr)）。
func _lens_lr(key: String) -> float:
	var L: Dictionary = sim.rules.t("LENS")
	var rows: Dictionary = L.get("rows", {}) as Dictionary
	var r: Variant = rows.get(key)
	if not (r is Dictionary):
		return 1.0
	var rd := r as Dictionary
	if bool(rd.get("knownOnly", false)):
		return INF
	return float(rd.get("human", 1.0)) \
		/ maxf(float(L.get("floor", 0.25)), float(rd.get("alien", 1.0)))


## @src js/game.js:1098 sabSpot(rid)：该舱室任务点里均匀随机抽一台设备，每夜缓存。
## 与 damageRoom 共用 sim.sab_spot_for，避免「计划一个点、坏的是另一个点」。
func sab_spot(rid: String) -> Vector2:
	return sim.sab_spot_for(rid)


## 2.5D huntSpotFor（js/game.js:3616-3665）：无目标时去哪找人。
## ① 本夜最后一条 saw_agent 的位置；② 本夜见过最多的舱室；
## ③ 任务点最多且不是当前舱的舱室（确定性，便于门禁断言）。
func _hunt_spot(a: Dictionary) -> Vector2:
	var why: Dictionary = a.get("why", {}) as Dictionary
	var best_t := -1.0
	var best_pos := Vector2.INF
	var cnt: Dictionary = {}
	for tgt: int in why.keys():
		for e: Variant in (why[tgt] as Array):
			var rec := e as Dictionary
			if String(rec.get("kind", "")) != "saw_agent":
				continue
			if int(rec.get("night", -1)) != int(sim.night):
				continue
			var t := float(rec.get("t", 0.0))
			if t > best_t:
				best_t = t
				best_pos = Vector2(float(rec.get("x", 0.0)), float(rec.get("y", 0.0)))
			var rid := String(rec.get("room", ""))
			if rid != "" and rid != "corridor":
				cnt[rid] = int(cnt.get(rid, 0)) + 1
	if best_pos != Vector2.INF:
		return best_pos
	var here: String = sim.room_at(a.get("pos", Vector2.ZERO))
	var room := ""
	var bc := 0
	for k: String in cnt.keys():
		if int(cnt[k]) > bc:
			bc = int(cnt[k])
			room = k
	if room == "":
		var tally: Dictionary = {}
		for p: Dictionary in (sim.map.get("points", []) as Array):
			var pr := String(p.get("room", ""))
			if pr == "" or pr == here:
				continue
			tally[pr] = int(tally.get(pr, 0)) + 1
		var bn := 0
		for k2: String in tally.keys():
			if int(tally[k2]) > bn:
				bn = int(tally[k2])
				room = k2
	if room == "":
		return Vector2.INF
	var c: Vector2 = sim.room_center(room)
	if sim.nav != null:
		var nf: Vector2 = sim.nav.nearest_free(c)
		return nf
	return c


## 管道突袭（2.5D alienPipeMove，js/game.js:3613）：
##   · 只在目标 >15 格、没拖尸、冷却完毕时考虑；
##   · 自己贴着某个管道口（<1.2 格）且**存在一个出口比走路显著更近**（收益 > 5 格）
##     → 直接传送过去（PIPE.cooldown 20 秒）；
## 入口/出口 6 格内目击写 saw_pipe；收益不足时走向入口（_pipePlan），每夜最多 2 趟。
func _pipe_move(a: Dictionary, tgt_pos: Vector2, td: float, dt: float) -> bool:
	if _pipes.is_empty() or td <= 15.0 or int(a.get("drag", -1)) >= 0:
		a["_pipePlan"] = {}
		return false
	if float(a.get("_pipeCD", 0.0)) > 0.0:
		a["_pipePlan"] = {}
		return false
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var from := Vector2.ZERO
	var have_from := false
	for q: Dictionary in _pipes:
		var qp := Vector2(float(q.get("x", 0.0)), float(q.get("y", 0.0)))
		if ap.distance_to(qp) < 1.2:
			from = qp
			have_from = true
			break
	var cd := 20.0
	var pipe_cfg: Dictionary = (sim.cfg.get("rules", {}) as Dictionary).get("PIPE", {}) as Dictionary
	cd = float(pipe_cfg.get("cooldown", 20.0))
	if have_from:
		var best := Vector2.ZERO
		var bd := 1.0e9
		for q2: Dictionary in _pipes:
			var qp2 := Vector2(float(q2.get("x", 0.0)), float(q2.get("y", 0.0)))
			if qp2 == from:
				continue
			var d := qp2.distance_to(tgt_pos)
			if d < bd:
				bd = d
				best = qp2
		if bd < td - 4.0:
			_teleport_pipe(a, from, best, cd)
			return true
		# 出口没有明显收益：原计划作废
		a["_pipePlan"] = {}
		return false
	# 不在管道口：估算"走到入口 + 出口到目标"是否比直走省 5 格以上
	var seeks := int(a.get("_pipeSeeks", 0))
	if seeks >= 2:
		return false
	var plan: Dictionary = a.get("_pipePlan", {}) as Dictionary
	if plan.is_empty():
		var gain := 5.0
		for pin: Dictionary in _pipes:
			var pinp := Vector2(float(pin.get("x", 0.0)), float(pin.get("y", 0.0)))
			var out_best := Vector2.ZERO
			var out_bd := 1.0e9
			for q3: Dictionary in _pipes:
				var qp3 := Vector2(float(q3.get("x", 0.0)), float(q3.get("y", 0.0)))
				if qp3 == pinp:
					continue
				var d3 := qp3.distance_to(tgt_pos)
				if d3 < out_bd:
					out_bd = d3
					out_best = qp3
			var g := td - (pinp.distance_to(ap) + out_bd)
			if g > gain:
				gain = g
				plan = {"in": pinp, "out": out_best}
				sim._stat("alienPipePlans", 1)
		a["_pipePlan"] = plan
	if not plan.is_empty():
		var pinp2: Vector2 = plan["in"]
		if ap.distance_to(pinp2) < 1.2:
			_teleport_pipe(a, pinp2, plan["out"], cd)
			return true
		if sim.set_path(int(a.get("i", -1)), pinp2):
			return true
	return false


## 传送落点 + 目击/声响（2.5D 的 logEvent pipe + witnessAlienAction）
func _teleport_pipe(a: Dictionary, from: Vector2, to: Vector2, cd: float) -> void:
	a["pos"] = to
	a["path"] = PackedVector2Array()
	a["pathI"] = 0
	a["_pipeCD"] = cd
	a["_pipePlan"] = {}
	a["_pipeSeeks"] = int(a.get("_pipeSeeks", 0)) + 1
	sim._stat("alienPipes", 1)
	sim._log("pipe", {"actor": int(a.get("i", -1)), "x": to.x, "y": to.y})
	# 2.5D aiPipeMove：落点 aiHear('pipe',out,12,{actor}) —— 管道两端都会漏声
	sim.hear("pipe", to, 12.0, {"actor": int(a.get("i", -1))})
	sim._witness_action(a, "saw_pipe", from)
	sim._witness_action(a, "saw_pipe", to)


func tick(dt: float) -> void:
	if sim == null or sim.over:
		return
	for a: Dictionary in sim.agents:
		if not bool(a.get("alien", false)):
			continue
		# 2.5D aiScanBodies（js/game.js:2524）：扫描尸体 → 观察 → 搜查 → 按
		# canReportBody / alienReportWorth 决定拉铃。每帧都跑（不进 _decide 的节流）。
		sim.scan_bodies(a, dt)

		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		if float(a.get("_avoid_t", 0.0)) > 0.0:
			a["_avoid_t"] = float(a.get("_avoid_t", 0.0)) - dt
		# 管道冷却（PIPE.cooldown）与 hunt 节流
		if float(a.get("_pipeCD", 0.0)) > 0.0:
			a["_pipeCD"] = maxf(0.0, float(a.get("_pipeCD", 0.0)) - dt)
		if float(a.get("_fakeCD", 0.0)) > 0.0:
			a["_fakeCD"] = maxf(0.0, float(a.get("_fakeCD", 0.0)) - dt)
		if float(a.get("_botCD", 0.0)) > 0.0:
			a["_botCD"] = maxf(0.0, float(a.get("_botCD", 0.0)) - dt)
		# @src js/game.js:4120 藏尸冷却：`a._hideCD` 逐帧减，冷却内不再找新尸体。
		if float(a.get("_hideCD", 0.0)) > 0.0:
			a["_hideCD"] = maxf(0.0, float(a.get("_hideCD", 0.0)) - dt)
		var sab_night := int(a.get("_sabNight", -1))
		if sab_night != int(sim.night):
			a["_sabNight"] = int(sim.night)
			a["_sabDone"] = false
			a["_sabT"] = sim.rules.n("DISGUISE", "cooldown", 18.0) + sim._rng.randf() * 10.0
		else:
			a["_sabT"] = float(a.get("_sabT", 0.0)) - dt
		if float(a.get("doing", 0.0)) > 0.0:
			continue
		# @src js/game.js:3773-3782：开局全员同舱，异形也必须遵守错峰延迟
		# （掷骰率 0.35，比人类的 0.45 更早开工），否则一进夜就贴脸出刀。
		var delay := float(a.get("_delay", 0.0))
		if delay > 0.0:
			a["_delay"] = delay - dt
			var dpath: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
			if dpath.is_empty() and sim._rng.randf() < dt * 0.35:
				var rooms0: Array = sim.map.get("rooms", []) as Array
				if not rooms0.is_empty():
					var r0: Dictionary = rooms0[sim._rng.randi_range(0, rooms0.size() - 1)]
					sim.set_path(int(a.get("i", -1)), sim.room_center(String(r0.get("id", ""))))
			continue
		# 2.5D `p.wait-=dt` 每帧都走（赶路时也走）；放 _decide 里会在路上停表。
		var rp: Dictionary = a.get("_reportPlan", {}) as Dictionary
		if not rp.is_empty() and float(rp.get("wait", 0.0)) > 0.0:
			rp["wait"] = float(rp.get("wait", 0.0)) - dt
			a["_reportPlan"] = rp
		var path: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
		if path.size() > 0:
			continue
		var wait := float(a.get("_aiT", 0.0)) - dt
		a["_aiT"] = wait
		if wait > 0.0:
			continue
		_decide(a)


## @src js/game.js:3266 disguiseOptions(a,aud)
## 一次返回全部候选，由 `_plan` 逐个算分取最优（不做 if 硬排）：
##   ① realFix 真修故障（没刀、本夜没真修过、不是自己炸的）
##   ② realRevive 真救非队友（有医疗包、本夜没真救过）
##   ③ breakerOn 当众合闸（断电、闸在 spotR 内）
##   ④ fake 假装修理（多人在场不演，要演就真修）
##   ⑤ fakeTask 假装做任务（常客舱室 > 没人做过的点 > 距离）
## 排序：常客舱室优先；打平按 LENS.lr 降序（只定顺序，不进权重）。
func disguise_options(a: Dictionary, aud: Dictionary) -> Array:
	var D: Dictionary = sim.rules.t("DISGUISE")
	var CRED: Dictionary = sim.rules.t("CRED")
	var gains: Dictionary = CRED.get("gains", {}) as Dictionary
	var kind_map: Dictionary = CRED.get("kindMap", {}) as Dictionary
	var base := float(gains.get("fakeWork", 0.10))
	var hot: Dictionary = audience_hot_rooms(a)
	var multi: bool = int(aud.get("n", 0)) >= int(D.get("multiAudience", 2))
	var now := float(sim.elapsed)
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var i := int(a.get("i", -1))
	var out: Array = []
	var push := func(o: Dictionary) -> void:
		var ck := String(kind_map.get(String(o.get("kind", "")), ""))
		o["credKey"] = ck if ck != "" else null
		o["valueMul"] = (float(gains.get(ck, 0.0)) / base) \
			if ck != "" and float(gains.get(ck, 0.0)) > 0.0 else 1.0
		o["hot"] = int(hot.get(String(o.get("room", "")), 0))
		out.append(o)

	# ① 真修故障
	if int(a.get("knife", 0)) <= 0 and int(a.get("_realFixN", -1)) != int(sim.night):
		for d: Dictionary in sim.dmg:
			if int(d.get("by", -1)) == i:
				continue
			var dp := Vector2(float(d.get("x", 0.0)), float(d.get("y", 0.0)))
			if ap.distance_to(dp) >= float(D.get("fakeRepairR", 12.0)):
				continue
			var f: Vector2 = sim.nav.nearest_free(dp)
			push.call({
				"kind": "realFix", "x": f.x, "y": f.y,
				"dur": float((sim.rules.t("STAND") as Dictionary).get("fix", 10.0)),
				"pt": -1, "real": true, "key": "realfix:" + String(d.get("room", "")),
				"dist": ap.distance_to(f), "room": String(d.get("room", "")), "fault": d,
			})
			break

	# ② 真救非队友
	if int(a.get("medkit", 0)) > 0 and int(a.get("_realReviveN", -1)) != int(sim.night):
		var v: Dictionary = {}
		var bd := 10.0
		for w: Dictionary in sim.agents:
			if w == a or not bool(w.get("alive", false)) or not bool(w.get("downed", false)):
				continue
			if sim.mind != null and sim.mind._is_mate(a, int(w.get("i", -1))):
				continue
			var wd: float = ap.distance_to(w.get("pos", Vector2.ZERO))
			if wd < bd and sim.ai_can_see(a, w.get("pos", Vector2.ZERO)):
				bd = wd
				v = w
		if not v.is_empty():
			var vp: Vector2 = v.get("pos", Vector2.ZERO)
			var f2: Vector2 = sim.nav.nearest_free(vp)
			push.call({
				"kind": "realRevive", "x": f2.x, "y": f2.y, "dur": 5.0,
				"pt": -1, "real": true, "key": "revive:" + str(int(v.get("i", -1))),
				"dist": ap.distance_to(f2), "room": sim.room_at(vp),
				"subj": int(v.get("i", -1)),
			})

	# ③ 当众合闸
	if int(sim.light_state) == 2:
		var br: Vector2 = sim.breaker_pos()
		if br != Vector2.ZERO:
			var f3: Vector2 = sim.nav.nearest_free(br)
			var dd3: float = ap.distance_to(f3)
			if dd3 <= float(D.get("spotR", 11.0)):
				push.call({
					"kind": "breakerOn", "x": f3.x, "y": f3.y,
					"dur": sim.breaker_on_time(), "pt": -1, "done": false,
					"key": "breaker", "dist": dd3, "room": sim.room_at(br),
				})

	# ④ 假装修理（多人在场不演）
	if not multi:
		for d4: Dictionary in sim.dmg:
			var dp4 := Vector2(float(d4.get("x", 0.0)), float(d4.get("y", 0.0)))
			if ap.distance_to(dp4) >= float(D.get("fakeRepairR", 12.0)):
				continue
			var f4: Vector2 = sim.nav.nearest_free(dp4)
			var dur4: Array = (D.get("dur", {}) as Dictionary).get("fake", [5, 4]) as Array
			push.call({
				"kind": "fake", "x": f4.x, "y": f4.y,
				"dur": float(dur4[0]) + sim._rng.randf() * float(dur4[1]),
				"pt": -1, "key": "fix:" + String(d4.get("room", "")), "done": false,
				"dist": ap.distance_to(f4), "room": String(d4.get("room", "")),
			})
			break

	# ⑤ 假装做任务（多人在场不演）
	if not multi:
		var spot_r := float(D.get("spotR", 11.0))
		var done_w := float(D.get("doneWindow", 150.0))
		var best_any: Dictionary = {}
		var bd5 := spot_r
		var fresh: Dictionary = {}
		var frd := spot_r
		var hot_fresh: Dictionary = {}
		var hfd := spot_r
		var pts: Array = sim.map.get("points", []) as Array
		for pi in range(pts.size()):
			var p: Dictionary = pts[pi]
			var f5: Vector2 = sim.nav.nearest_free(
				Vector2(float(p.get("x", 0.0)), float(p.get("y", 0.0))))
			var dd5: float = ap.distance_to(f5)
			if dd5 > spot_r:
				continue
			var done5 := false
			if sim.point_done.has(pi):
				done5 = (now - float(sim.point_done[pi])) < done_w
			if not done5:
				if fresh.is_empty() or dd5 < frd:
					fresh = {"i": pi, "f": f5, "dd": dd5, "room": String(p.get("room", ""))}
					frd = dd5
				if int(hot.get(String(p.get("room", "")), 0)) > 0 \
						and (hot_fresh.is_empty() or dd5 < hfd):
					hot_fresh = {"i": pi, "f": f5, "dd": dd5,
						"room": String(p.get("room", ""))}
					hfd = dd5
			if best_any.is_empty() or dd5 < bd5:
				best_any = {"i": pi, "f": f5, "dd": dd5, "room": String(p.get("room", ""))}
				bd5 = dd5
		var pick5: Dictionary = best_any
		if not hot_fresh.is_empty():
			pick5 = hot_fresh
		elif not fresh.is_empty():
			pick5 = fresh
		if not pick5.is_empty():
			var dur5: Array = (D.get("dur", {}) as Dictionary).get("fakeTask", [4, 4]) as Array
			var f6: Vector2 = pick5["f"]
			push.call({
				"kind": "fakeTask", "x": f6.x, "y": f6.y,
				"dur": float(dur5[0]) + sim._rng.randf() * float(dur5[1]),
				"pt": int(pick5["i"]), "key": "pt:" + str(int(pick5["i"])),
				"done": not (hot_fresh.is_empty() and fresh.is_empty()),
				"dist": float(pick5["dd"]), "room": String(pick5["room"]),
			})

	out.sort_custom(func(x: Dictionary, y: Dictionary) -> bool:
		var hx := int(x.get("hot", 0))
		var hy := int(y.get("hot", 0))
		if hx != hy:
			return hy < hx
		var kx: Variant = x.get("credKey", null)
		var ky: Variant = y.get("credKey", null)
		return _lens_lr("" if kx == null else String(kx)) \
			< _lens_lr("" if ky == null else String(ky)))
	return out


## @src js/game.js:3361 disguiseRiskParts(a,aud,spot)
## 把"这一下会不会被识破 / 会不会真亏"翻译成 disguise_risk 的输入。
func disguise_risk_parts(a: Dictionary, aud: Dictionary, spot: Dictionary) -> Dictionary:
	var D: Dictionary = sim.rules.t("DISGUISE")
	var now := float(sim.elapsed)
	var rep := false
	var lf: Variant = a.get("_lastFake", null)
	if lf is Dictionary:
		var lfd := lf as Dictionary
		if String(lfd.get("key", "")) == String(spot.get("key", "")) \
				and (now - float(lfd.get("t", 0.0))) < float(D.get("repeatWindow", 90.0)):
			rep = true
	return {
		"redHot": float(a.get("redT", 0.0)) > 0.0,
		"donePoint": bool(spot.get("done", false)),
		"repeatSpot": rep,
		"breakerLoss": String(spot.get("kind", "")) == "breakerOn",
		"realCost": bool(spot.get("real", false)),
		"idle": int(aud.get("idle", 0)),
		"audience": int(aud.get("n", 0)),
		"dark": sim.lit_zone_at(a.get("pos", Vector2.ZERO)) == "",
	}


## @src js/game.js:782 moveSpeed(a)：拖尸 → drag_speed；击杀加速 → speed*RUSH.mul；否则 speed。
## 3D 之前没有这个函数，`_plan` 的 walk 估算需要它；数值全部来自 space.json / rules.json。
func _move_speed(a: Dictionary) -> float:
	if int(a.get("drag", -1)) >= 0:
		return SpaceData.num(space, "move", "drag_speed")
	if float(a.get("rushT", 0.0)) > 0.0:
		return SpaceData.num(space, "move", "speed") \
			* float((sim.rules.t("RUSH") as Dictionary).get("mul", 1.5))
	return SpaceData.num(space, "move", "speed")


## @src js/game.js:3382 alienPlan(a,td)
## 2.5D 效用表**逐字移植**：拉闸 / 破坏 / 拆机器人 / 狩猎 / 伪装 同台比分取 max。
## td = 到当前猎杀目标的距离（无目标传 1e9）。
## 所有数值只从 rules.json（SKTeam / DISGUISE / CRED / RUSH）与 space.json 读，
## 本函数不写第二份常量，也不加真源没有的门槛。
func _plan(a: Dictionary, td: float) -> Dictionary:
	# 合闸目标锁：`if(a._breakerGoal)` 未过期且不贴脸就沿用（真源 :3385-3391）
	var bg: Variant = a.get("_breakerGoal", null)
	if bg is Dictionary:
		var bgd := bg as Dictionary
		var close_kill := int(a.get("knife", 0)) > 0 and td < 5.0
		if int(sim.light_state) == 2 and float(sim.elapsed) < float(bgd.get("until", 0.0)) \
				and not close_kill:
			return bgd
		a["_breakerGoal"] = null

	# `const left=Math.max(0.25,Math.min(1,(G.t||0)/NIGHT));`
	var left := clampf(float(sim.t) / sim.night_len(), 0.25, 1.0)
	var speed := maxf(1.0, _move_speed(a))
	var walk := func(d: float) -> float: return d / speed
	var team: Dictionary = sim.rules.module_table("SKTeam")
	var ap: Vector2 = a.get("pos", Vector2.ZERO)

	# 拉闸：`BREAKER_VALUE*left - breakerOffTime()*1.5 - walk(dist)`
	var sc_br := -1.0
	var br_pos: Vector2 = sim.breaker_pos()
	if br_pos != Vector2.ZERO and int(sim.light_state) != 2 \
			and not bool(a.get("sabUsed", false)) \
			and int(a.get("_breakerSkip", -1)) != int(sim.night):
		sc_br = float(team["BREAKER_VALUE"]) * left \
			- sim.breaker_pull_time() * 1.5 - walk.call(ap.distance_to(br_pos))

	# 破坏：`SABOTAGE_VALUE*left - walk(dist) - 1`；配电室未断电再 -4
	var sc_sb := -1.0
	var sb_room := ""
	if not bool(a.get("sabUsed", false)):
		for r: Dictionary in (sim.map.get("rooms", []) as Array):
			var rid := String(r.get("id", ""))
			if rid == "bridge" or not sim.sab_room_ok(rid):
				continue
			if String(a.get("_sabSkipRoom", "")) == rid \
					and float(sim.elapsed) < float(a.get("_sabSkipUntil", 0.0)):
				continue
			var sp: Vector2 = sab_spot(rid)
			if sp == Vector2.ZERO:
				continue
			var s: float = float(team["SABOTAGE_VALUE"]) * left \
				- walk.call(ap.distance_to(sp)) - 1.0
			if rid == "power" and int(sim.light_state) != 2:
				s -= 4.0
			if s > sc_sb:
				sc_sb = s
				sb_room = rid

	# 拆机器人：只能刀/枪 → 没刀不列（真源 :3415-3425）
	var sc_bot := -1.0
	var bot_kind := ""
	if int(a.get("knife", 0)) > 0 and sim.bots != null:
		if not sim.bots.is_dead("secbot"):
			var sq: Vector2 = sim.bot_pos_of("secbot")
			if sq != Vector2.ZERO and sim.secbot_raid_ok(a, sq):
				var s2: float = float(team["BOT_SEC_VALUE"]) * left \
					- walk.call(ap.distance_to(sq))
				if s2 > sc_bot:
					sc_bot = s2
					bot_kind = "secbot"
		if not sim.bots.is_dead("medbot"):
			var mq: Vector2 = sim.bot_pos_of("medbot")
			if mq != Vector2.ZERO:
				var s3: float = float(team["BOT_MED_VALUE"]) * left \
					- walk.call(ap.distance_to(mq))
				if s3 > sc_bot:
					sc_bot = s3
					bot_kind = "medbot"

	# 狩猎：`(a.knife>0&&knifeLockLeft()<=0) ? (td<knifeReach?12:(td<5?9:2)) : 0`
	# KNIFE.lockAtStart=0（真源亦然），此处按公式保留该因子形状。
	var chase := 0.0
	if int(a.get("knife", 0)) > 0:
		var reach: float = sim.mind.trait_c("knifeReach", a)
		chase = 12.0 if td < reach else (9.0 if td < 5.0 else 2.0)

	# 伪装：`DG.planValue*disguiseScore - walk(dist)`，门槛 `sc>=minScore && s>0`
	var sc_dis := -1.0
	var dis_plan: Dictionary = {}
	var br_plan: Dictionary = {}
	var DG: Dictionary = sim.rules.t("DISGUISE")
	var kill_window := int(a.get("knife", 0)) > 0 and td < 5.0
	if not kill_window and not bool(a.get("_noFake", false)) \
			and float(a.get("_fakeCD", 0.0)) <= 0.0 \
			and a.get("_supportGoal", null) == null and int(a.get("drag", -1)) < 0:
		var aud: Dictionary = audience_info(a, float(DG.get("audienceR", 8.0)))
		if int(aud.get("n", 0)) > 0:
			for spot: Dictionary in disguise_options(a, aud):
				var rk: float = sim.mind.disguise_risk(disguise_risk_parts(a, aud, spot))
				var sc: float = sim.mind.disguise_score(int(aud.get("weight", 0.0)), rk,
					float(spot.get("dur", 4.0)), float(spot.get("valueMul", 1.0)))
				var s4: float = float(DG.get("planValue", 6.0)) * sc \
					- walk.call(float(spot.get("dist", 0.0)))
				# 小概率通道要能拿到"分数不够"的合闸候选：先存一份再走门槛
				if String(spot.get("kind", "")) == "breakerOn" and br_plan.is_empty():
					br_plan = spot.duplicate(true)
					br_plan["id"] = "disguise"
					br_plan["score"] = s4
					br_plan["forced"] = true
					br_plan["aud"] = int(aud.get("n", 0))
					br_plan["audW"] = float(aud.get("weight", 0.0))
					br_plan["risk"] = rk
					br_plan["sc"] = sc
				if sc < float(DG.get("minScore", 0.25)) or s4 <= 0.0:
					continue
				if s4 > sc_dis:
					sc_dis = s4
					dis_plan = spot.duplicate(true)
					dis_plan["id"] = "disguise"
					dis_plan["score"] = s4
					dis_plan["aud"] = int(aud.get("n", 0))
					dis_plan["audW"] = float(aud.get("weight", 0.0))
					dis_plan["risk"] = rk
					dis_plan["sc"] = sc

	var best := maxf(maxf(sc_br, sc_sb), maxf(sc_bot, maxf(chase, sc_dis)))

	# 当众合闸小概率通道（真源 :3429-3449）：每只异形每夜只掷一次
	if not br_plan.is_empty() and int(a.get("_breakerRollN", -1)) != int(sim.night):
		a["_breakerRollN"] = int(sim.night)
		a["_breakerRoll"] = sim._rng.randf() < float(DG.get("breakerChance", 0.1))
	if not br_plan.is_empty() and bool(a.get("_breakerRoll", false)) \
			and not kill_window and best <= maxf(chase, 6.0):
		a["_breakerRoll"] = false
		br_plan["until"] = float(sim.elapsed) + 25.0
		a["_breakerGoal"] = br_plan
		return br_plan

	if not dis_plan.is_empty() and best == sc_dis:
		return dis_plan
	if best <= chase:
		return {"id": "chase", "room": "", "score": chase}
	if best == sc_bot:
		return {"id": "bot", "kind": bot_kind, "score": sc_bot}
	if best == sc_br:
		return {"id": "breaker", "room": "", "score": sc_br}
	return {"id": "sabotage", "room": sb_room, "score": sc_sb}


## 2.5D aiAlien:3786-3848：行凶后「先离开做不在场 → 再回尸体旁报案」。
## 收益 alienReportWorth（没人看见下限 0.55；被看见过减半、直接拉铃 0.35→0.2）。
func _report_plan(a: Dictionary) -> bool:
	var i := int(a.get("i", -1))
	var plan: Dictionary = a.get("_reportPlan", {}) as Dictionary
	if plan.is_empty():
		# @src :3852 `if(a._killBody!=null&&!a._killDecided)`：每次行凶只掷一次骰子
		if int(a.get("_killBody", -1)) < 0 or bool(a.get("_killDecided", true)):
			return false
		a["_killDecided"] = true
		if int(a.get("reportLeft", 0)) <= 0 or sim.night_meet_left() <= 0:
			return false
		var v: Dictionary = sim.agent(int(a.get("_killBody", -1)))
		if not _has_body(v) or bool(v.get("bodyReported", false)):
			return false
		var wit: bool = sim.recent_witness(a, 20.0)
		var worth := maxf(sim.alien_report_worth(a, v), 0.0 if wit else 0.55)
		if sim._rng.randf() >= (worth * 0.5 if wit else worth):
			return false
		a["_reportT"] = 0.0
		a["_reportBody"] = -1
		var direct: bool = sim._rng.randf() < (0.2 if wit else 0.35)
		a["_reportPlan"] = {"body": int(v.get("i", -1)),
			"wait": (0.8 + sim._rng.randf() * 1.2) if direct else (5.0 + sim._rng.randf() * 7.0),
			"spot": Vector2.INF, "direct": direct}
		plan = a["_reportPlan"] as Dictionary
	var vi := int(plan.get("body", -1))
	var v2: Dictionary = sim.agent(vi)
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var db: Variant = v2.get("draggedBy", null)
	if not _has_body(v2) or bool(v2.get("bodyReported", false)) \
			or (db != null and int(db) >= 0 and int(db) != i):
		a["_reportPlan"] = {}
		return false
	var bp: Vector2 = v2.get("bodyPos", v2.get("pos", Vector2.ZERO))
	var direct2 := bool(plan.get("direct", false))
	if float(plan.get("wait", 0.0)) > 0.0:
		if direct2:
			# 直接报案：不绕去别处做不在场，原地稍等就拉铃
			if ap.distance_to(bp) > 2.2 \
					and (a.get("path", PackedVector2Array()) as PackedVector2Array).is_empty():
				sim.set_path(i, bp)
			return true
		if (a.get("path", PackedVector2Array()) as PackedVector2Array).is_empty():
			var spot: Variant = plan.get("spot", Vector2.INF)
			if not (spot is Vector2) or (spot as Vector2) == Vector2.INF:
				var sp2 := _alibi_spot(a)
				plan["spot"] = sp2
				a["_reportPlan"] = plan
				spot = sp2
			if (spot as Vector2) != Vector2.INF:
				sim.set_path(i, spot as Vector2)
		return true
	if ap.distance_to(bp) < 2.6 and sim.los_now(ap.x, ap.y, bp.x, bp.y):
		if sim.ai_wants_loot(a, v2) and sim.watchers_at(a, bp, 7.0, vi).is_empty():
			sim.start_doing(i, "search", SpaceData.num(space, "stand", "search"), -1, "")
			a["_sv"] = vi
			return true
		if int(a.get("reportLeft", 0)) <= 0 or sim.night_meet_left() <= 0:
			a["_reportPlan"] = {}
			return false
		a["reportLeft"] = int(a.get("reportLeft", 0)) - 1
		sim._stat("reportsUsed", 1)
		v2["bodyReported"] = true
		a["_reportPlan"] = {}
		sim.open_meeting_kind("night", i, vi)
		return true
	if (a.get("path", PackedVector2Array()) as PackedVector2Array).is_empty():
		sim.set_path(i, bp)
	return true


## 2.5D reportAlibiSpot（js/game.js:3841）：6~24 格外的随机舱室中心，用来做不在场。
func _alibi_spot(a: Dictionary) -> Vector2:
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var cands: Array = []
	for r: Dictionary in (sim.map.get("rooms", []) as Array):
		var rid := String(r.get("id", ""))
		if rid == "bridge":
			continue
		var c: Vector2 = sim.room_center(rid)
		var d := ap.distance_to(c)
		if d > 6.0 and d < 24.0:
			cands.append(c)
	if cands.is_empty():
		return Vector2.INF
	return cands[sim._rng.randi_range(0, cands.size() - 1)]


## 2.5D bodyPos(v) 非空 = 死者或有倒地标记的活人。
func _has_body(v: Dictionary) -> bool:
	return not v.is_empty() \
		and (not bool(v.get("alive", false)) or bool(v.get("downed", false)))


func _decide(a: Dictionary) -> void:
	var i := int(a.get("i", -1))
	var ap0: Vector2 = a.get("pos", Vector2.ZERO)

	# 2.5D aiAlien:3786-3848：杀完人的「重返现场报案」计划，优先级仅次于错峰延迟。
	if _report_plan(a):
		return

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

	# 2.5D alienSupport:3538-3552：自己放倒的人 45 秒内仍带自己缺的物资 → 绕回去收。
	if int(a.get("_killBody", -1)) >= 0 and sim.elapsed - float(a.get("_killAt", 0.0)) < 45.0:
		var kv: Dictionary = sim.agent(int(a.get("_killBody", -1)))
		var kdb: Variant = kv.get("draggedBy", null)
		if _has_body(kv) and (kdb == null or int(kdb) < 0) and sim.ai_wants_loot(a, kv):
			var kp: Vector2 = kv.get("bodyPos", kv.get("pos", Vector2.ZERO))
			if ap0.distance_to(kp) < SpaceData.num(space, "reach", "body"):
				sim.start_doing(i, "search", SpaceData.num(space, "stand", "search"), -1, "")
				a["_sv"] = int(kv.get("i", -1))
				a["_aiT"] = 1.0
				return
			if sim.set_path(i, kp):
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

	# 破坏已并入 `_plan` 效用表（2.5D alienPlan），不再在这里 if 硬排。

	# 救队友（2.5D alienMateRevive，js/game.js:3590）：有医疗包且认得出队友时，
	# 8 格内看得见的濒死队友 → 走过去站桩救（STAND.revive，结算走 _finish_doing revive 链）。
	if int(a.get("medkit", 0)) > 0 and sim.mind != null:
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
		if not mv.is_empty():
			if mvd < 1.7:
				sim.start_doing(i, "revive", SpaceData.num(space, "stand", "revive"), -1, "")
				a["_rv"] = int(mv.get("i", -1))
				return
			if sim.set_path(i, mv.get("pos", Vector2.ZERO)):
				return

	# ---- 拖尸中：先把尸体送到藏尸点再谈别的（2.5D dragAway 链）----
	if int(a.get("drag", -1)) >= 0:
		var hid2 := String(a.get("_dragTo", ""))
		if hid2 == "":
			a["drag"] = -1
		else:
			var hpos: Vector2 = sim.room_center(hid2)
			if ap0.distance_to(hpos) < 2.0:
				a["drag"] = -1
				a["_dragTo"] = ""
				# @src js/game.js:4102 到达藏尸点：`a._hideCD=25; a._hides=(a._hides||0)+1`
				a["_hideCD"] = 25.0
				a["_hides"] = int(a.get("_hides", 0)) + 1
				a["_aiT"] = 1.0
				return
			if sim.set_path(i, hpos):
				return
			a["drag"] = -1
			a["_dragTo"] = ""
	# 伪装 / 当众拉闸已并入 `_plan` 效用表（2.5D alienPlan），不再在这里 if 硬排。

	var best := -1
	var bd := 1.0e9
	var bpos := Vector2.ZERO
	var bvic: Dictionary = {}
	var fallback := -1
	var fb := 1.0e9
	var fpos := Vector2.ZERO
	# 2.5D aiAlien 挑目标（js/game.js:3849-3896，2026-11-03 用户裁定「取消全图锁敌」）：
	# 只有三档信息 ——
	#   ① 现在看得见 → 用实时位置；
	#   ② 看不见但**本夜亲眼见过** → 用最后目击位置，超过 HUNT.memorySec(25s) 跟丢；
	#   ③ 完全没印象 → 不进候选（只能巡逻 / 钻管道 / 破坏）。
	# 3D 之前直接遍历所有活人的实时坐标，等于给异形开全图挂；本批按真源收回。
	var now: float = sim.night_len() - maxf(0.0, float(sim.t))
	var stale: float = sim.rules.n("HUNT", "memorySec", 25.0)
	for v: Dictionary in sim.agents:
		if bool(v.get("alien", false)) or not bool(v.get("alive", false)):
			continue
		if bool(v.get("downed", false)) or bool(v.get("detained", false)):
			continue
		# B4 起玩家能还手；保安机器人 6 格 + 180° 内动手会被抓现行。
		var vi := int(v.get("i", -1))
		var vp: Vector2 = v.get("pos", Vector2.ZERO)
		var seen_now: bool = sim.ai_can_see(a, vp)
		var hpos := vp
		if not seen_now:
			# 2.5D ②：只看本夜 saw_agent 记忆，最后一条在 25 秒内才作数。
			var mem: Array = ((a.get("why", {}) as Dictionary).get(vi, []) as Array)
			var last: Dictionary = {}
			for k in range(mem.size() - 1, -1, -1):
				var e: Dictionary = mem[k]
				if String(e.get("kind", "")) != "saw_agent":
					continue
				if int(e.get("night", -1)) != int(sim.night):
					continue
				if now - float(e.get("t", 0.0)) > stale:
					continue
				last = e
				break
			if last.is_empty():
				continue
			hpos = Vector2(float(last.get("x", vp.x)), float(last.get("y", vp.y)))
		# 2.5D aiAlien 评分（js/game.js:3868-3888）：
		#   base = 距离 + 暴露度×knifeWatcherPenalty(a) + (队友已在追?8:0)
		#          + (正在做事?knifeBusyBonus:0)
		#   score = base × targetDistMul(hostileProb(a,v)) − HUMANISH.pull×humanT
		# 暴露度按 watchersAt/exposureAt 同口径：亮区整片可见、做事的人看不见；
		# 系数全部走 SKTrait.C / IDENTITY（rules.json），不在 GDScript 抄阈值。
		var exp := _exposure_at(a, hpos, v if seen_now else {})
		var mate_on := false
		for m: Dictionary in sim.agents:
			if m == a or not bool(m.get("alien", false)) or not bool(m.get("alive", false)):
				continue
			if int(m.get("target", -1)) == vi and sim.mind != null \
					and sim.mind._is_mate(a, int(m.get("i", -1))):
				mate_on = true
				break
		var busy: bool = seen_now and float(v.get("doing", 0.0)) > 0.0
		var base: float = sim.distance_to(i, hpos) \
			+ exp * sim.mind.trait_c("knifeWatcherPenalty", a) \
			+ (8.0 if mate_on else 0.0) \
			+ (sim.mind.trait_c("knifeBusyBonus", a) if busy else 0.0)
		var score: float = base * sim.mind.target_dist_mul(
			sim.mind.hostile_prob(a, v))
		# 他合过闸 → 在异形眼里更像对手（2.5D HUMANISH.pull，最多拉近 6 格）。
		var hi: float = sim.mind.humanish_of(a, vi)
		if hi > 0.0:
			score -= sim.rules.n("HUMANISH", "pull", 6.0) * hi
		# 2.5D _avoid：被晾过的目标只当兜底，不占正常候选。
		if float(a.get("_avoid_t", 0.0)) > 0.0 and vi == int(a.get("_avoid_i", -1)):
			if score < fb:
				fb = score
				fallback = vi
				fpos = hpos
			continue
		if score < bd:
			bd = score
			best = vi
			bpos = hpos
			bvic = v
	if best < 0 and fallback >= 0:
		best = fallback
		bpos = fpos
		bvic = sim.agent(fallback)
	if best < 0:
		_bump("no_target")
		# 2.5D aiAlien `if(a.knife>0&&td>12&&alienSupport(a,dt))return`：没目标时也会
		# 拉闸/破坏/拆机器人/伪装（td=无穷大 = 附近没人），不是握刀原地站着。
		if _exec_plan(a, _plan(a, 999.0)):
			return
		# 2.5D huntSpotFor（js/game.js:3616-3665）：没目标时也去“可能有人”的位置，
		# 只给管道机动用，不进任何攻击判定。
		var hunt := _hunt_spot(a)
		if hunt != Vector2.INF:
			var hd: float = sim.distance_to(i, hunt)
			if _pipe_move(a, hunt, hd, 0.0):
				a["_aiT"] = 1.0
				a["target"] = -1
				return
		# 2.5D js/game.js:4151-4155：刀用完且没有目标 → 随机游荡；
		# 有刀时原地等下一拍（真源同样不随机走动，避免"有刀还乱逛"）。
		if int(a.get("knife", 0)) <= 0:
			var rooms: Array = sim.map.get("rooms", []) as Array
			if not rooms.is_empty():
				var rr: Dictionary = rooms[sim._rng.randi_range(0, rooms.size() - 1)]
				var rc: Vector2 = sim.room_center(String(rr.get("id", "")))
				sim.set_path(i, rc)
		a["_aiT"] = 1.0
		a["target"] = -1
		return
	a["target"] = best
	var real_d: float = sim.distance_to(i, bpos)
	# ---- 2.5D alienPlan 效用表接管（拉闸 / 破坏 / 拆机器人 / 伪装）----
	# 同台比分取 max；chase 最高时 fallthrough 到下面的出刀段，不再用 if 顺序硬排。
	if _exec_plan(a, _plan(a, real_d)):
		return
	# 2.5D aiAlien 的开枪分支（js/game.js:3877）：异形有子弹也会开枪 ——
	# 远距离/没刀时优先用枪，而不是永远只贴脸出刀。
	# 条件：有弹 + 不是队友 + (没进刀程 或 没刀) + 枪程内 + LOS + alienFireP 概率。
	if int(a.get("bullet", 0)) > 0 and real_d > SpaceData.num(space, "reach", "knife"):
		var shoot_range: float = SpaceData.num(space, "shoot", "range")
		var shot_cfg: Dictionary = (sim.cfg.get("rules", {}) as Dictionary).get("SHOT", {}) as Dictionary
		if real_d <= shoot_range and sim.ai_can_see(a, bpos):
			var fire_p := 0.7
			fire_p = float(shot_cfg.get("alienFireP", 0.7))
			if sim._rng.randf() < fire_p:
				if sim.shoot(i, best):
					_bump("shot_ok")
					a["_aiT"] = 1.5
					return
		# 追猎（2.5D js/game.js:3877 chaseR）：枪程外但在追猎距离内 → 主动贴上去再开枪。
		# 距离是**意愿**不是能力：有确证 chaseKnown(14)、只有嫌疑 chaseSus(10)，
		# 与玩家同一个 SHOT.range 判定能不能打中。
		var sure: bool = (a.get("known", {}) as Dictionary).has(best)
		var chase_r: float = float(shot_cfg.get("chaseKnown", 14.0)) if sure \
			else float(shot_cfg.get("chaseSus", 10.0))
		if real_d > shoot_range and real_d < chase_r:
			var tpos: Vector2 = sim.agent(best).get("pos", Vector2.ZERO)
			if (a.get("path", PackedVector2Array()) as PackedVector2Array).is_empty():
				sim.set_path(i, tpos)
			a["_aiT"] = 0.3
			return
	if real_d <= SpaceData.num(space, "reach", "knife"):
		# AI 预判（2.5D js/game.js:4146）：这一刀会不会被保安看见。
		# 与 botTick 的判定同源（6m + 180° + 只看墙），看见就这一拍收手、2.5 秒后再来。
		if sim.bots != null and sim.bots.would_see(a.get("pos", Vector2.ZERO)):
			a["_avoid_t"] = 2.5
			a["target"] = -1
			a["path"] = PackedVector2Array()
			return
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
			if sim.ai_can_see(w, bpos):
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
		# 机制对齐（PLAN §4.2）：能否出刀只有 sim.can_act("knife") 一处硬规则判定，
		# 玩家与 AI 同源；AI 决策层的目击 / 隐蔽 / 性格 / 队友过滤仍在这之前。
		var knife_ok: Dictionary = sim.can_act("knife", {"actor": i, "victim": best})
		if bool(knife_ok.get("ok", false)) and sim.knife(i, best):
			_bump("knife_ok")
			# 藏尸（2.5D dragAway）：现场没目击者时把尸体拖向远离医疗间的房间。
			# 拖行降速暴露位置（drag_speed），目击者记 saw_drag（0.22，不加 known）。
			var wit2 := 0
			for w3: Dictionary in sim.agents:
				if w3 == a or bool(w3.get("alien", false)) or not bool(w3.get("alive", false)) \
						or bool(w3.get("downed", false)):
					continue
				if (w3.get("pos", Vector2.ZERO) as Vector2).distance_to(a.get("pos", Vector2.ZERO)) <= 8.0:
					wit2 += 1
			if wit2 == 0 and sim._rng.randf() < 0.5:
				var hid := _hide_room(bpos)
				if hid != "":
					a["drag"] = best
					bvic["draggedBy"] = i
					a["_dragTo"] = hid
					sim._witness_action(a, "saw_drag", bpos)
					return
			# 2.5D 无全局冷却：限刀数 + RUSH 逃逸；早先自加的长冷却已移除。
			a["_aiT"] = 2.0
		else:
			# can_act 按当前坐标复判距离/LOS；失败后旧实现原地重试（实测 160:1），改为追当前坐标。
			var live: Vector2 = sim.agent(best).get("pos", Vector2.ZERO) as Vector2
			if live != Vector2.ZERO: sim.set_path(i, live)
			a["_aiT"] = 0.5
		return
	# ---- 顺手藏别人尸体（2.5D findHideBody：没在拖 / 冷却好 / 每夜≤2 / 25 秒无目击 / 离猎杀目标够远）----
	if int(a.get("drag", -1)) < 0 and float(a.get("_hideCD", 0.0)) <= 0.0 \
			and int(a.get("_hides", 0)) < 2 and real_d > 6.0 \
			and not sim.recent_witness(a, 25.0):
		var hbv: Dictionary = find_hide_body(a)
		if not hbv.is_empty():
			var hbp: Vector2 = hbv.get("bodyPos", Vector2.ZERO)
			# 有人在看就不动手：藏尸本身不能制造目击者（真源 watchersAt 6.5，排除队友）。
			var hseen := false
			for w5: Dictionary in sim.watchers_at(a, hbp, 6.5):
				if sim.mind != null and not sim.mind._is_mate(a, int(w5.get("i", -1))):
					hseen = true
					break
			if hseen:
				a["_hideCD"] = 7.0
				return
			var hdest := _hide_room(hbp)
			if hdest != "":
				if ap0.distance_to(hbp) < 2.0:
					a["drag"] = int(hbv.get("i", -1))
					hbv["draggedBy"] = i
					a["_dragTo"] = hdest
					sim._witness_action(a, "saw_drag", hbp)
					return
				if sim.set_path(i, hbp):
					return

	# 拆机器人已并入 `_plan` 效用表（2.5D alienPlan 的 bot 候选），不再在这里 if 硬排。

	# 2.5D aiAlien:4095「管道是核心位移能力」：排在补给/伪装之后、没刀游荡之前 ——
	# 目标 >15 格且管道能省 5 格以上就走管道，而不是永远贴地跑。
	if real_d > 15.0 and _pipe_move(a, bpos, real_d, 0.1):
		return
	if sim.set_path(i, bpos):
		return
	_bump("path_fail")
	a["_aiT"] = 1.0


## 执行 2.5D alienPlan 返回的 plan。`chase` 返回 false（交给出刀段）。
## 分数与门槛全在 `_plan`，这里只负责"走到点位 → 站桩/结算"，不重算、不加门槛。
func _exec_plan(a: Dictionary, plan: Dictionary) -> bool:
	var pid := String(plan.get("id", ""))
	if pid == "" or pid == "chase":
		return false
	var i := int(a.get("i", -1))
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var tp := Vector2(float(plan.get("x", 0.0)), float(plan.get("y", 0.0)))

	if pid == "breaker":
		var br: Vector2 = sim.breaker_pos()
		if br == Vector2.ZERO:
			return false
		if ap.distance_to(br) < SpaceData.num(space, "reach", "breaker"):
			sim.start_doing(i, "breaker", sim.breaker_pull_time())
			return true
		return sim.set_path(i, br)

	if pid == "sabotage":
		var room := String(plan.get("room", ""))
		var sp: Vector2 = sab_spot(room)
		if room == "" or sp == Vector2.ZERO:
			return false
		# @src js/game.js:4104 `if(roomIdAt(a.x,a.y)===a._plan.room||Math.hypot(...)<SAB_RANGE)`
		# 2026-11-01 用户裁定：进舱即下手，不要求蹲到设备前；玩家 sabTick 同口径。
		if sim.room_at(ap) == room or ap.distance_to(sp) < SpaceData.num(space, "reach", "sabotage"):
			return sim.sabotage_room(room, i)
		return sim.set_path(i, sp)

	if pid == "bot":
		var kind := String(plan.get("kind", ""))
		if kind == "" or sim.bots == null:
			return false
		var bp: Vector2 = sim.bot_pos_of(kind)
		if bp == Vector2.ZERO:
			return false
		if ap.distance_to(bp) < 1.8:
			if sim.knife_bot(kind, i):
				a["_botCD"] = 10.0
				a["_aiT"] = 1.5
				return true
			return false
		return sim.set_path(i, bp)

	# disguise：plan 自带 kind / x / y / dur / pt
	if ap.distance_to(tp) >= 2.0:
		return sim.set_path(i, tp)
	var DG: Dictionary = sim.rules.t("DISGUISE")
	match String(plan.get("kind", "")):
		"realFix":
			var fd: Variant = plan.get("fault", null)
			var froom := ""
			if fd is Dictionary:
				froom = String((fd as Dictionary).get("room", ""))
			sim.start_doing(i, "fix", float(plan.get("dur", 10.0)), -1, froom)
			a["_realFixN"] = int(sim.night)
			return true
		"realRevive":
			sim.start_doing(i, "revive", float(plan.get("dur", 5.0)))
			a["_realReviveN"] = int(sim.night)
			return true
		"breakerOn":
			sim.start_doing(i, "breaker", float(plan.get("dur", 3.0)))
			return true
		"fake":
			sim.start_doing(i, "fake", float(plan.get("dur", 5.0)), -1,
				String(plan.get("room", "")))
			a["_fakeCD"] = float(DG.get("cooldown", 18.0))
			_bump("fake")
			a["_lastFake"] = {"key": String(plan.get("key", "")), "t": float(sim.elapsed)}
			return true
		"fakeTask":
			sim.start_doing(i, "fake", float(plan.get("dur", 4.0)), int(plan.get("pt", -1)))
			a["_fakeCD"] = float(DG.get("cooldown", 18.0))
			_bump("fake")
			a["_lastFake"] = {"key": String(plan.get("key", "")), "t": float(sim.elapsed)}
			return true
	return false


func find_hide_body(a: Dictionary) -> Dictionary:
	var best: Dictionary = {}
	var bd := 3.2
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	for v: Dictionary in sim.agents:
		if v == a:
			continue
		var bp: Vector2 = v.get("bodyPos", Vector2.ZERO)
		if bp == Vector2.ZERO:
			continue
		# 2.5D `v.draggedBy!=null`；3D 空值是 -1（含历史 null），与 can_act 同口径。
		var dv: Variant = v.get("draggedBy", -1)
		if dv != null and int(dv) >= 0:
			continue
		# @src js/game.js:3114 `if(aiWantsLoot(a,v))continue;`
		# 尸体上还有自己缺的物资：先搜尸再藏，别把子弹/医疗包一起埋了。
		if sim.ai_wants_loot(a, v):
			continue
		var d: float = ap.distance_to(bp)
		if d < bd and sim.ai_can_see(a, bp):
			bd = d
			best = v
	return best


func _hide_room(from_pos: Vector2 = Vector2.ZERO) -> String:
	var humans: Array = []
	for h: Dictionary in sim.agents:
		if bool(h.get("alive", false)) and not bool(h.get("alien", false)) \
				and not bool(h.get("downed", false)):
			humans.append(h.get("pos", Vector2.ZERO))
	var best := ""
	var best_s := -1.0e9
	for r: Dictionary in (sim.map.get("rooms", []) as Array):
		var rid := String(r.get("id", ""))
		if rid == "" or rid == "med" or rid == "bridge":
			continue
		var c: Vector2 = sim.room_center(rid)
		var min_d := 999.0
		for hp: Vector2 in humans:
			min_d = minf(min_d, c.distance_to(hp))
		if humans.is_empty():
			min_d = 0.0
		var carry := c.distance_to(from_pos)
		# 离人远 = 更难被发现；拖太远 = 暴露时间变长，按格扣分
		var s := min_d - maxf(0.0, carry - 25.0) * 0.8
		if s > best_s:
			best_s = s
			best = rid
	return best
