extends RefCounted
## AI 移植自测：选敌记忆、humanT、目击节流、游荡躲避、身份轴、暴露度、寻人点与衰减
##
## 2026-11-26 从 test_world.gd 迁出拆段，供 TestWorld._run_aiporttest 薄转发调用。


static func _aiport_setup(__h) -> Dictionary:
	__h._finish_meeting(__h.sim)
	__h.sim.ai_enabled = false
	__h.sim.meeting = {}
	var a: Dictionary = {}
	var h1: Dictionary = {}
	var h2: Dictionary = {}
	for x: Dictionary in __h.sim.agents:
		if bool(x.get("alien", false)) and a.is_empty():
			a = x
		elif not bool(x.get("alien", false)) and h1.is_empty():
			h1 = x
		elif not bool(x.get("alien", false)) and h2.is_empty():
			h2 = x
	if a.is_empty() or h1.is_empty() or h2.is_empty():
		return {}
	var ai0 := int(a.get("i", -1))
	var h1i := int(h1.get("i", -1))
	var h2i := int(h2.get("i", -1))
	var bridge: Vector2 = __h.sim.room_center("bridge")
	var engine: Vector2 = __h.sim.room_center("engine")
	# 只留 h1/h2 作为候选：其余人类全部拘留（挑目标会排除 detained）。
	for x: Dictionary in __h.sim.agents:
		var xi := int(x.get("i", -1))
		x["detained"] = xi != ai0 and xi != h1i and xi != h2i
		x["downed"] = false
		x["redT"] = 0.0
		x["_avoidHuman"] = -1
		x["accuse"] = -1
		x["target"] = -1
		x["path"] = PackedVector2Array()
	a["mates"] = {}
	a["alive"] = true
	a["knife"] = 1
	a["bullet"] = 0
	a["qual"] = 0
	a["qualPending"] = 0
	a["_sabDone"] = true
	a["drag"] = -1
	a["_fakeCD"] = 999.0
	a["_breakerRollN"] = str(int(__h.sim.night))
	a["_breakerWant"] = false
	a["_avoid_i"] = -1
	a["_avoid_t"] = 0.0
	a["why"] = {}
	a["path"] = PackedVector2Array()
	a["target"] = -1
	a["pos"] = bridge
	h1["alive"] = true
	h1["downed"] = false
	h1["detained"] = false
	h1["pos"] = bridge + Vector2(4, 0)
	h2["alive"] = true
	h2["downed"] = false
	h2["detained"] = false
	h2["pos"] = bridge + Vector2(0, 6)
	return {"a": a, "h1": h1, "h2": h2, "ai0": ai0, "h1i": h1i, "h2i": h2i,
		"bridge": bridge, "engine": engine}


static func _aiport_hunt_memory(__h, ctx: Dictionary, st: Dictionary) -> void:
	var a: Dictionary = ctx["a"]
	var h1: Dictionary = ctx["h1"]
	var h2: Dictionary = ctx["h2"]
	var ai0 := int(ctx["ai0"])
	var h1i := int(ctx["h1i"])
	var h2i := int(ctx["h2i"])
	var bridge: Vector2 = ctx["bridge"]
	var engine: Vector2 = ctx["engine"]
	var fails: Array = st["fails"]

	# ① 看得见的更近者优先
	__h.sim._ai_alien._decide(a)
	if int(a.get("target", -1)) == h1i:
		st["pass"] = int(st["pass"]) + 1
	else:
		st["fail"] = int(st["fail"]) + 1
		fails.append("看得见的目标没选中：%d（期望 %d）" % [int(a.get("target", -1)), h1i])
	# ② 看不见且没有记忆 → 不进候选（取消全图锁敌）
	h2["detained"] = true
	h1["pos"] = engine
	a["why"] = {}
	a["path"] = PackedVector2Array()
	a["target"] = -1
	__h.sim._ai_alien._decide(a)
	if int(a.get("target", -1)) < 0:
		st["pass"] = int(st["pass"]) + 1
	else:
		st["fail"] = int(st["fail"]) + 1
		fails.append("没记忆的远处目标仍被选中：%d" % int(a.get("target", -1)))
	# ③ 本夜亲眼见过 → 用最后目击位置（25 秒内）
	__h.sim.mind.note_track(ai0, h1i, bridge + Vector2(2, 0), "bridge")
	a["path"] = PackedVector2Array()
	a["target"] = -1
	__h.sim._ai_alien._decide(a)
	if int(a.get("target", -1)) == h1i:
		st["pass"] = int(st["pass"]) + 1
	else:
		st["fail"] = int(st["fail"]) + 1
		fails.append("25 秒内的记忆目标没选中：%d" % int(a.get("target", -1)))
	# ④ 超过 HUNT.memorySec(25s) → 跟丢
	var mem: Array = (a.get("why", {}) as Dictionary).get(h1i, []) as Array
	if not mem.is_empty():
		var last: Dictionary = mem[mem.size() - 1]
		last["t"] = (__h.sim.night_len() - maxf(0.0, float(__h.sim.t))) - 30.0
		(a["why"] as Dictionary)[h1i] = mem
	a["path"] = PackedVector2Array()
	a["target"] = -1
	__h.sim._ai_alien._decide(a)
	if int(a.get("target", -1)) < 0:
		st["pass"] = int(st["pass"]) + 1
	else:
		st["fail"] = int(st["fail"]) + 1
		fails.append("过期记忆仍被使用：%d" % int(a.get("target", -1)))
	# ⑤ humanT：远 2 格但合过闸的人优先（HUMANISH.pull 6 格当量）
	a["why"] = {}
	h2["detained"] = false
	h1["pos"] = bridge + Vector2(6, 0)
	h2["pos"] = bridge + Vector2(4, 0)
	a["path"] = PackedVector2Array()
	a["target"] = -1
	__h.sim._ai_alien._decide(a)
	var no_ht := int(a.get("target", -1))
	__h.sim.mind.humanish_add(a, h1i, 1.0)
	a["path"] = PackedVector2Array()
	a["target"] = -1
	__h.sim._ai_alien._decide(a)
	var with_ht := int(a.get("target", -1))
	if no_ht == h2i and with_ht == h1i:
		st["pass"] = int(st["pass"]) + 1
	else:
		st["fail"] = int(st["fail"]) + 1
		fails.append("humanT 拉近失效：无=%d 有=%d（期望 %d→%d）" % [
			no_ht, with_ht, h2i, h1i])


static func _aiport_sight_and_roam(__h, ctx: Dictionary, st: Dictionary) -> void:
	var a: Dictionary = ctx["a"]
	var h1: Dictionary = ctx["h1"]
	var h2: Dictionary = ctx["h2"]
	var ai0 := int(ctx["ai0"])
	var h1i := int(ctx["h1i"])
	var h2i := int(ctx["h2i"])
	var bridge: Vector2 = ctx["bridge"]
	var fails: Array = st["fails"]

	# ⑥ 合闸目击：异形 observer 写 humanT +0.28，上限 1
	var br: Vector2 = __h.sim.breaker_pos()
	__h.sim.light_state = 2
	__h.sim.power_on = false
	h1["pos"] = br
	a["pos"] = br + Vector2(1.2, 0)
	a["humanT"] = {}
	a["mates"] = {}
	__h.sim.toggle_power(h1i)
	var ht1: float = __h.sim.mind.humanish_of(a, h1i)
	__h.sim.mind.humanish_add(a, h1i, 1.0)
	var ht_cap: float = __h.sim.mind.humanish_of(a, h1i)
	if absf(ht1 - 0.28) < 0.001 and absf(ht_cap - 1.0) < 0.001:
		st["pass"] = int(st["pass"]) + 1
	else:
		st["fail"] = int(st["fail"]) + 1
		fails.append("humanT 写入/封顶错：%0.2f / %0.2f" % [ht1, ht_cap])
	# ⑦ saw_red 5 秒节流：同一段红光只写一条证据
	h2["alive"] = true
	h2["downed"] = false
	h2["detained"] = false
	h2["pos"] = bridge + Vector2(3, 0)
	h2["why"] = {}
	h2["redSeen"] = {}
	a["pos"] = bridge
	a["redT"] = 1.0
	var e0: float = __h.sim.elapsed
	__h.sim._track_pass()
	var n1: int = int(__h._count_why(h2, ai0, "saw_red"))
	__h.sim._track_pass()
	var n2: int = int(__h._count_why(h2, ai0, "saw_red"))
	__h.sim.elapsed = e0 + 6.0
	a["redT"] = 1.0
	__h.sim._track_pass()
	var n3: int = int(__h._count_why(h2, ai0, "saw_red"))
	a["redT"] = 0.0
	if n1 == 1 and n2 == 1 and n3 == 2:
		st["pass"] = int(st["pass"]) + 1
	else:
		st["fail"] = int(st["fail"]) + 1
		fails.append("saw_red 节流错：%d/%d/%d（期望 1/1/2）" % [n1, n2, n3])
	# ⑧ saw_avoid：每夜一次，记在**观察者**身上
	h2["why"] = {}
	h2["avoidSeen"] = {}
	h2["pos"] = bridge + Vector2(3, 0)
	h1["pos"] = bridge
	h1["_avoidHuman"] = h2i
	__h.sim._track_pass()
	var av1: int = int(__h._count_why(h2, h1i, "saw_avoid"))
	__h.sim._track_pass()
	var av2: int = int(__h._count_why(h2, h1i, "saw_avoid"))
	var av_seen := int((h2.get("avoidSeen", {}) as Dictionary).get(h1i, -1))
	if av1 == 1 and av2 == 1 and av_seen == int(__h.sim.night):
		st["pass"] = int(st["pass"]) + 1
	else:
		st["fail"] = int(st["fail"]) + 1
		fails.append("saw_avoid 错：%d/%d seen=%d" % [av1, av2, av_seen])
	# ⑨ 空闲游荡 + 躲避：任务做完不再站桩
	h1["_avoidHuman"] = -1
	h1["tasks"] = [0]
	h1["tIdx"] = 1
	h1["path"] = PackedVector2Array()
	h1["doing"] = 0.0
	h1["qualPending"] = 0
	h1["warm"] = {}
	h1["cred"] = {}
	h1["known"] = {}
	h1["alive"] = true
	h1["downed"] = false
	h1["detained"] = false
	__h.sim.dmg = []
	h2["accuse"] = -1
	__h.sim._ai_human._idle_roam(h1)
	var roam_ok: bool = (h1.get("path", PackedVector2Array()) as PackedVector2Array).size() > 0
	h1["path"] = PackedVector2Array()
	h2["accuse"] = h1i
	__h.sim._ai_human._idle_roam(h1)
	var avoid_ok := int(h1.get("_avoidHuman", -1)) == h2i \
		and (h1.get("path", PackedVector2Array()) as PackedVector2Array).size() > 0
	if roam_ok and avoid_ok:
		st["pass"] = int(st["pass"]) + 1
	else:
		st["fail"] = int(st["fail"]) + 1
		fails.append("idle roam 错：roam=%s avoid=%s/%d" % [
			str(roam_ok), str(avoid_ok), int(h1.get("_avoidHuman", -1))])


static func _aiport_mind_and_exposure(__h, ctx: Dictionary, st: Dictionary) -> void:
	var a: Dictionary = ctx["a"]
	var h1: Dictionary = ctx["h1"]
	var h2: Dictionary = ctx["h2"]
	var ai0 := int(ctx["ai0"])
	var h1i := int(ctx["h1i"])
	var h2i := int(ctx["h2i"])
	var bridge: Vector2 = ctx["bridge"]
	var engine: Vector2 = ctx["engine"]
	var fails: Array = st["fails"]

	# ⑩ 身份轴 / 目标距离乘子 / trait 系数
	a["almost"] = {"foe": {}, "friend": {}}
	a["known"] = {}
	a["mates"] = {}
	a["cred"] = {}
	(a["almost"] as Dictionary)["foe"] = {h1i: {"kinds": ["saw_knife"]}}
	var h_id: float = __h.sim.mind.identity_axis(a, h1)
	(a["almost"] as Dictionary)["foe"] = {h1i: {"kinds": ["heard_accuse"]}}
	var h_soft: float = __h.sim.mind.identity_axis(a, h1)
	(a["mates"] as Dictionary)[h2i] = {"t": 1.0}
	var h_mate: float = __h.sim.mind.identity_axis(a, h2)
	a["mates"] = {}
	a["almost"] = {"foe": {}, "friend": {}}
	if absf(h_id - 0.05) < 0.001 and h_soft > 0.5 and absf(h_mate) < 0.001 \
			and absf(__h.sim.mind.target_dist_mul(1.0) - 0.5) < 0.001 \
			and absf(__h.sim.mind.target_dist_mul(0.0) - 1.25) < 0.001:
		st["pass"] = int(st["pass"]) + 1
	else:
		st["fail"] = int(st["fail"]) + 1
		fails.append("身份轴错：id=%.2f soft=%.2f mate=%.2f mul=%.2f/%.2f" % [
			h_id, h_soft, h_mate, __h.sim.mind.target_dist_mul(1.0),
			__h.sim.mind.target_dist_mul(0.0)])
	# ⑪ 暴露度：亮舱有目击者 >0；目击者做事 / 是目标本人 → 0
	var wit: Dictionary = h2
	wit["alive"] = true
	wit["downed"] = false
	wit["detained"] = false
	wit["doing"] = 0.0
	wit["pos"] = bridge + Vector2(2, 0)
	h1["detained"] = true
	h1["doing"] = 0.0
	var exp_seen: float = __h.sim._ai_alien._exposure_at(a, bridge, {})
	wit["doing"] = 3.0
	var exp_busy: float = __h.sim._ai_alien._exposure_at(a, bridge, {})
	wit["doing"] = 0.0
	var exp_except: float = __h.sim._ai_alien._exposure_at(a, bridge, wit)
	h1["detained"] = false
	if exp_seen > 0.0 and exp_busy == 0.0 and exp_except == 0.0:
		st["pass"] = int(st["pass"]) + 1
	else:
		st["fail"] = int(st["fail"]) + 1
		fails.append("暴露度错：seen=%.2f busy=%.2f except=%.2f" % [
			exp_seen, exp_busy, exp_except])
	# ⑫ 无目标寻人点 + 特征系数
	a["why"] = {}
	__h.sim.mind.note_track(ai0, h1i, engine, "engine")
	var hunt: Vector2 = __h.sim._ai_alien._hunt_spot(a)
	var hunt_ok: bool = hunt.distance_to(engine) < 1.0
	a["why"] = {}
	var hunt2: Vector2 = __h.sim._ai_alien._hunt_spot(a)
	var here_room: String = __h.sim.room_at(a.get("pos", Vector2.ZERO))
	var tally: Dictionary = {}
	for p: Dictionary in (__h.sim.map.get("points", []) as Array):
		var pr := String(p.get("room", ""))
		if pr == "" or pr == here_room:
			continue
		tally[pr] = int(tally.get(pr, 0)) + 1
	var best_room := ""
	var best_n := 0
	for k2: String in tally.keys():
		if int(tally[k2]) > best_n:
			best_n = int(tally[k2])
			best_room = k2
	var hunt_room: String = __h.sim.room_at(hunt2)
	var saved_trait: Dictionary = (a.get("trait", {}) as Dictionary).duplicate()
	a["trait"] = {"aggr": 50, "caut": 50, "soc": 50, "cur": 50}
	var p1: float = __h.sim.mind.trait_c("knifeWatcherPenalty", a)
	var p2: float = __h.sim.mind.trait_c("knifeBusyBonus", a)
	var p3: float = __h.sim.mind.trait_c("grudgeGain", a)
	var p4: float = __h.sim.mind.trait_c("trustGain", a)
	var p5: float = __h.sim.mind.trait_c("voteGrudgePull", a)
	a["trait"] = saved_trait
	if hunt_ok and hunt_room == best_room and absf(p1 - 12.0) < 0.01 \
			and absf(p2 + 12.0) < 0.01 and absf(p3 - 1.0) < 0.01 \
			and absf(p4 - 1.0) < 0.01 and absf(p5 - 6.0) < 0.01:
		st["pass"] = int(st["pass"]) + 1
	else:
		st["fail"] = int(st["fail"]) + 1
		fails.append("寻人点/系数错：hunt=%s room=%s/%s coef=%.1f/%.1f/%.1f/%.1f/%.1f" % [
			str(hunt_ok), hunt_room, best_room, p1, p2, p3, p4, p5])
	# ⑬ humanT 跨夜 ×0.8（1.0 → 0.8）
	__h.sim.mind.humanish_add(a, h1i, 1.0)
	__h.sim.mind.reset_night()
	var ht_decay: float = __h.sim.mind.humanish_of(a, h1i)
	if absf(ht_decay - 0.8) < 0.01:
		st["pass"] = int(st["pass"]) + 1
	else:
		st["fail"] = int(st["fail"]) + 1
		fails.append("humanT 跨夜衰减错：%0.2f" % ht_decay)


static func _run_aiporttest(__h) -> void:
	var ctx: Dictionary = _aiport_setup(__h)
	if ctx.is_empty():
		print("AIPORTTEST FAIL 席位缺失")
		__h._aiporttest_ok = false
		return
	var st: Dictionary = {"pass": 0, "fail": 0, "fails": []}
	_aiport_hunt_memory(__h, ctx, st)
	_aiport_sight_and_roam(__h, ctx, st)
	_aiport_mind_and_exposure(__h, ctx, st)
	var pass_n := int(st["pass"])
	var fail_n := int(st["fail"])
	var fails: Array = st["fails"]
	print("AIPORTTEST pass=%d fail=%d %s" % [pass_n, fail_n, str(fails)])
	__h._aiporttest_ok = fail_n == 0
