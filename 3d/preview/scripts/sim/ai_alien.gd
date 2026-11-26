extends RefCounted

## 异形 AI：找人 → 刀程 → 出刀；效用表管拉闸/破坏/拆机器人/伪装/管道。
## 目标只按「现在看得见 / 本夜最后目击（≤HUNT.memorySec）」选（2.5D 取消全图锁敌）。

const SpaceData := preload("res://scripts/space_data.gd")
const AlienRoutines := preload("res://scripts/sim/alien_routines.gd")
const AlienHunt := preload("res://scripts/sim/alien_hunt.gd")

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


## @src js/game.js:4364 audienceHotRooms(a)
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


## @src js/game.js:4336 alienAudienceInfo(a)
## 返回 {n, weight, idle, sus, inf}：全视野判断「他看得见我」（取消 8 格截断）。
func audience_info(a: Dictionary, _rad: float = 0.0) -> Dictionary:
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
		if float(w.get("doing", 0.0)) > 0.0:
			continue
		if not sim.ai_can_see(w, ap):
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


## @src js/ai/sanity.js:727 LENS.lr(key)：human / max(floor, alien)；knownOnly → INF。
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


## @src js/game.js:1342 sabSpot：均匀随机抽设备、每夜缓存；与 damageRoom 共用同一落点。
func sab_spot(rid: String) -> Vector2:
	return sim.sab_spot_for(rid)


## 2.5D huntSpotFor（js/game.js:3616-3665）：无目标时去哪找人（最后目击 → 热门舱 → 点最多的舱）。
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


## 管道突袭（2.5D alienPipeMove, js:3613）：目标>15 格、没拖尸、冷却好；贴口且出口
## 显著更近（>5 格）就直接传送；两端 6 格目击写 saw_pipe；收益不足走向入口，每夜 2 趟。
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
	# @src js/game.js:4895 aiAlien：`if(G.meet||G.over)return`。主循环已提前 return，
	# 这里补齐与人类 AI 同一层的防御守卫，防直接调用（夹具 / 回放）在会议里跑决策。
	if not sim.meeting.is_empty():
		return
	for a: Dictionary in sim.agents:
		if not bool(a.get("alien", false)):
			continue
		# 2.5D aiScanBodies（js/game.js:2524）：扫描尸体 → 观察 → 搜查 → 按
		# canReportBody / alienReportWorth 决定拉铃。每帧都跑（不进 _decide 的节流）。
		sim.scan_bodies(a, dt)

		if not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
				or bool(a.get("detained", false)):
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
		# 2.5D aiAlien:4067：打机器人是独立的 10 秒小概率通道，冷却逐帧减；
		# 2.5D aiAlien:4070：被保安看见后的「躲开」计时，同样逐帧减。
		if float(a.get("_botShotCD", 0.0)) > 0.0:
			a["_botShotCD"] = maxf(0.0, float(a.get("_botShotCD", 0.0)) - dt)
		if float(a.get("_shotCheckCD", 0.0)) > 0.0:
			a["_shotCheckCD"] = maxf(0.0, float(a.get("_shotCheckCD", 0.0)) - dt)
		if float(a.get("_secAvoidT", 0.0)) > 0.0:
			a["_secAvoidT"] = maxf(0.0, float(a.get("_secAvoidT", 0.0)) - dt)
		# 出刀后撤离（_escapeT 期间远离尸体至少 7 格）
		if AlienHunt.run_escape(sim, a, dt):
			continue
		# 追击硬上限（HUNT.chaseCap / chaseGiveUp）
		AlienHunt.tick_chase_cap(sim, a, dt)
		if sim.gun_dodge_step(a, dt):
			continue
		if float(a.get("doing", 0.0)) > 0.0:
			continue
		# @src js/game.js:3773-3782：开局错峰（掷骰 0.35，比人类的 0.45 更早开工）。
		var delay := float(a.get("_delay", 0.0))
		if delay > 0.0:
			a["_delay"] = delay - dt
			var dpath: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
			if dpath.is_empty() and sim._rng.randf() < dt * 0.35:
				var rooms0: Array = sim.map.get("rooms", []) as Array
				if not rooms0.is_empty():
					var r0: Dictionary = rooms0[sim._rng.randi_range(0, rooms0.size() - 1)]
					sim.set_path(int(a.get("i", -1)), sim.rand_in_room(String(r0.get("id", ""))))
			continue
		# @src js/game.js:3604-3612：真做任务只为换申请单（每只异形整局最多 1 次）
		if int(a.get("_alienTaskTotal", 0)) < 1 and int(a.get("knife", 0)) <= 0 \
				and int(a.get("bullet", 0)) < 1 and int(a.get("qual", 0)) < 1 \
				and sim.prog < 38 and int(a.get("_alienTaskN", -1)) != int(sim.night) \
				and (a.get("_supportGoal", {}) as Dictionary).is_empty() \
				and sim._rng.randf() < dt * 0.02:
			var tl0: Array = a.get("tasks", []) as Array
			var ti0 := int(a.get("tIdx", 0))
			if ti0 < tl0.size():
				var tp0: Dictionary = sim.point(int(tl0[ti0]))
				a["_supportGoal"] = {"kind": "task", "x": float(tp0.get("x", 0.0)),
					"y": float(tp0.get("y", 0.0)), "dur": float(tp0.get("dur", 0.0)),
					"pt": int(tl0[ti0])}
		var rp: Dictionary = a.get("_reportPlan", {}) as Dictionary
		if not rp.is_empty() and float(rp.get("wait", 0.0)) > 0.0:
			rp["wait"] = float(rp.get("wait", 0.0)) - dt
			a["_reportPlan"] = rp
		# 保留完整 _aiT 冷却（开枪 1.5s / 出刀 2.0s / 避让 2.0s），不再强截断为 0.5s
		var wait := float(a.get("_aiT", 0.0)) - dt
		a["_aiT"] = wait
		if wait > 0.0:
			continue
		if (a.get("path", PackedVector2Array()) as PackedVector2Array).size() > 0:
			a["_aiT"] = 0.5
		_decide(a)


## @src js/game.js:4386 disguiseOptions：一次返回全部候选，由 `_plan` 统一算分。
## ① realFix 真修（没刀/本夜未真修/非自炸） ② realRevive 真救非队友 ③ breakerOn 当众合闸
## ④ fake 假装修理 ⑤ fakeTask 假装做事；排序：常客舱优先 → LENS.lr 降序。
func disguise_options(a: Dictionary, aud: Dictionary) -> Array:
	var D: Dictionary = sim.rules.t("DISGUISE")
	var CRED: Dictionary = sim.rules.t("CRED")
	var gains: Dictionary = sim.rules.t("WITNESS")
	if gains.is_empty():
		gains = CRED.get("gains", {}) as Dictionary
	var kind_map: Dictionary = CRED.get("kindMap", {}) as Dictionary
	var base := float(gains.get("fakeWork", 25.0))
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


## @src js/game.js:4476 disguiseRiskParts(a,aud,spot)
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


## @src js/game.js:997 moveSpeed(a)：拖尸 → drag_speed；击杀加速 → speed*RUSH.mul；否则 speed。
## 3D 之前没有这个函数，`_plan` 的 walk 估算需要它；数值全部来自 space.json / rules.json。
func _move_speed(a: Dictionary) -> float:
	if int(a.get("drag", -1)) >= 0:
		return SpaceData.num(space, "move", "drag_speed")
	var sp := SpaceData.num(space, "move", "speed")
	if float(a.get("rushT", 0.0)) > 0.0:
		var rcfg: Dictionary = sim.rules.t("RUSH") as Dictionary
		var frac := clampf(float(a.get("rushT", 0.0)) / maxf(0.01, float(rcfg.get("dur", 1.0))), 0.0, 1.0) \
			if bool(rcfg.get("decay", true)) else 1.0
		sp *= 1.0 + (float(rcfg.get("mul", 2.0)) - 1.0) * frac
	return sp


## A9（2.5D aiAlien:4084-4087）：效用表每 0.5 秒重算一次，用秒级 CD 而不是事件时钟。
## 3D 旧实现每次 _decide 现算，且走路时不决策 —— 计划永远不换。这里按 0.5 秒缓存。
func _plan(a: Dictionary, td: float) -> Dictionary:
	var at := float(a.get("_planAt", -1.0))
	if at >= 0.0 and sim.elapsed - at < 0.5:
		var cached: Variant = a.get("_planCache", null)
		if cached is Dictionary:
			return cached
	var out := _plan_calc(a, td)
	a["_planAt"] = sim.elapsed
	a["_planCache"] = out
	return out


## @src js/game.js:4502 alienPlan：拉闸/破坏/拆机器人/狩猎/伪装同台比分取 max。
## td=到猎杀目标距离（无目标 1e9）；数值只读 rules.json / space.json，不另立常量。
func _plan_calc(a: Dictionary, td: float) -> Dictionary:
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
		var aud: Dictionary = audience_info(a)
		if int(aud.get("n", 0)) > 0:
			for spot: Dictionary in disguise_options(a, aud):
				var rk: float = sim.mind.disguise_risk(disguise_risk_parts(a, aud, spot))
				var sc: float = sim.mind.disguise_score(float(aud.get("weight", 0.0)), rk,
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


func _report_plan(a: Dictionary) -> bool:
	return AlienHunt.report_plan(self, a)


func _decide(a: Dictionary) -> void:
	if float(a.get("_escapeT", 0.0)) > 0.0:
		return
	var i := int(a.get("i", -1))
	var ap0: Vector2 = a.get("pos", Vector2.ZERO)

	# 2.5D aiAlien:3786-3848：杀完人的「重返现场报案」计划，优先级仅次于错峰延迟。
	if _report_plan(a):
		return

	# A5：队友濒死优先救（2.5D game.js:3972，位次在选猎物之前）
	if AlienRoutines.mate_revive(sim, space, a):
		return

	var ev_t: float = sim.mind.ev_now() if sim.mind != null else (sim.night_len() - maxf(0.0, float(sim.t)))
	var stale: float = sim.rules.n("HUNT", "memorySec", 25.0)
	var picked := AlienHunt.pick_hunt_target(self, a, ev_t, stale)
	var best := int(picked.get("best", -1))
	var bpos: Vector2 = picked.get("bpos", Vector2.ZERO)
	var bvic: Dictionary = picked.get("bvic", {})
	if best < 0:
		AlienHunt.handle_no_target(self, a)
		return
	# 2.5D aiAlien:3900-3915：刚看见我的人若在 12 格内且比现目标近 2 格以上 → 先处理他。
	if int(a.get("knife", 0)) > 0 and sim.mind != null:
		var wit: int = sim.mind.recent_witness_id(a, 12.0, stale)
		if wit >= 0 and ap0.distance_to(sim.agent(wit).get("pos", Vector2.ZERO)) \
				< ap0.distance_to(sim.agent(best).get("pos", Vector2.ZERO)) + 2.0:
			best = wit
			bpos = sim.agent(wit).get("pos", Vector2.ZERO)
			bvic = sim.agent(wit)
			a["_targetT"] = ev_t
			a["_tgtPos"] = {"x": bpos.x, "y": bpos.y, "t": ev_t}
	a["target"] = best
	var real_d: float = sim.distance_to(i, bpos)
	AlienHunt.exec_combat(self, a, best, bpos, bvic, real_d, ev_t)


func _exec_plan(a: Dictionary, plan: Dictionary) -> bool:
	return AlienHunt.exec_plan(self, a, plan)


func find_hide_body(a: Dictionary) -> Dictionary:
	return AlienHunt.find_hide_body(sim, a)


func knife_discovery_risk(a: Dictionary, tgt: Dictionary) -> Dictionary:
	return AlienHunt.knife_discovery_risk(sim, space, a, tgt)


func knife_would_hit_mate(a: Dictionary, tgt: Dictionary) -> bool:
	return AlienHunt.knife_would_hit_mate(sim, a, tgt)


func knife_blocked(a: Dictionary, tgt: Dictionary) -> bool:
	return AlienHunt.knife_blocked(sim, space, a, tgt)


func ambush_spot_for(rid: String, sp: Vector2) -> Vector2:
	return AlienHunt.ambush_spot_for(self, rid, sp)


