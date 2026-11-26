extends RefCounted
## 会议发言调度 —— 领袖、先发制人、构陷编排、大义灭亲与时间线拆谎。
## 从 `speech.gd` 拆出，纯静态工具集，不持有状态；通过 `s` 访问调度状态与 `sim`/`mind`。


## 领袖抽样（2.5D newGame:252）：每局 LEADER.chance 抽领袖，号召力按重尾四档抽样。
static func roll_leader(s) -> void:
	s.leader_i = -1
	s.leader_charisma = 0.0
	if s.sim == null or s.sim._rng == null:
		return
	if s.sim._rng.randf() >= s.sim.rules.n("LEADER", "chance", 0.22):
		return
	var min_soc := int(s.sim.rules.n("LEADER", "minSoc", 45.0))
	var pool: Array = []
	for a: Dictionary in s.sim.agents:
		var soc: int = int((a.get("trait", {}) as Dictionary).get("soc", 50))
		if bool(a.get("alive", false)) and soc >= min_soc:
			pool.append(int(a.get("i", -1)))
	if pool.is_empty():
		return
	s.leader_i = int(pool[s.sim._rng.randi_range(0, pool.size() - 1)])
	var bands: Array = [[0.0, 0.15], [0.25, 0.50], [0.65, 0.30], [1.0, 0.05]]
	var r: float = s.sim._rng.randf()
	var acc := 0.0
	for b: Array in bands:
		acc += float(b[1])
		if r <= acc:
			s.leader_charisma = float(b[0])
			return


## 构陷编排（2.5D planAlienDeception）：反咬 / FRAME 构陷 / COFRAME 协同诬陷。
static func plan_alien_deception(s, kind: String, victim_i: int) -> Dictionary:
	var out := {"frames": 0, "caught": 0}
	if kind == "pre" or not s.enabled or s.mind == null:
		return out
	var pool: Array = []
	var aliens: Array = []
	for a: Dictionary in s.sim.agents:
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		pool.append(a)
		if bool(a.get("alien", false)) and not bool((a.get("accuseWhy", {}) as Dictionary).get("opening", false)):
			aliens.append(a)
	if aliens.is_empty():
		return out
	var actor_pick := _pick_frame_actor(s, aliens)
	var liar := int(actor_pick["liar"])
	if liar < 0:
		return out
	var counter := bool(actor_pick["counter"])
	var sure_acc := int(actor_pick["sure_acc"])
	var sure_kind := String(actor_pick["sure_kind"])
	var tgt := _pick_frame_target(s, pool, liar, victim_i, counter, sure_acc)
	if tgt < 0:
		return out
	var ally_info := _pick_frame_allies(s, aliens, pool, liar, tgt, counter, sure_kind)
	var kd := String(ally_info["kd"])
	var allies: Array = ally_info["allies"] as Array
	var quote := _prepare_frame_quote(s, liar, tgt, counter, sure_kind, kd)
	var fx := _apply_frame_effects(s, liar, tgt, sure_acc, allies)
	_emit_frame_lines(s, liar, tgt, sure_acc, counter, kd, quote, allies, fx)
	s.sim._stat("frames", 1)
	out["caught"] = int(fx["caught"])
	out["frames"] = 1
	out["by"] = liar
	out["co"] = allies.duplicate()
	return out


## 挑选构陷发起者与是否触发反咬。
static func _pick_frame_actor(s, aliens: Array) -> Dictionary:
	var sure_acc := -1
	var sure_kind := ""
	for c: int in s.cands:
		var ca: Dictionary = s.sim.agent(c)
		if ca.is_empty() or bool(ca.get("alien", false)):
			continue
		var kn: Dictionary = s.mind.best_known_target(ca)
		if not kn.is_empty():
			sure_acc = c
			var kn2: Dictionary = (ca.get("known", {}) as Dictionary)
			if not kn2.is_empty():
				var first: Dictionary = kn2[kn2.keys()[0]] as Dictionary
				sure_kind = String(first.get("kind", ""))
			break
	var liar := -1
	var counter := false
	var sure_tgt_i := -1
	if sure_acc >= 0:
		var ka: Dictionary = s.mind.best_known_target(s.sim.agent(sure_acc))
		if not ka.is_empty():
			sure_tgt_i = int(ka["i"])
	if sure_tgt_i >= 0 and bool(s.sim.agent(sure_tgt_i).get("alien", false)):
		liar = sure_tgt_i
		counter = true
	elif s.sim._rng.randf() < s.sim.rules.n("FRAME", "chance", 0.18):
		liar = int(aliens[s.sim._rng.randi_range(0, aliens.size() - 1)].get("i", -1))
	return {"liar": liar, "counter": counter, "sure_acc": sure_acc, "sure_kind": sure_kind}


## 选择构陷靶子：反咬优先指认确证者，否则优先跟热点或随机。
static func _pick_frame_target(s, pool: Array, liar: int, victim_i: int,
		counter: bool, sure_acc: int) -> int:
	var liar_a: Dictionary = s.sim.agent(liar)
	var targets: Array = []
	for t: Dictionary in pool:
		var ti := int(t.get("i", -1))
		if ti == liar or ti == victim_i or s._is_mate(liar_a, ti):
			continue
		targets.append(ti)
	if targets.is_empty():
		return -1
	var tgt := -1
	if counter and sure_acc >= 0 and s.sim._rng.randf() < 0.65:
		tgt = sure_acc
	if tgt < 0:
		var hot: Array = []
		var top_n := 0
		for t2: int in targets:
			var n: int = s.mind.pub_accusers(t2).size()
			if n < int(s.sim.rules.n("SOCIAL", "hotMin", 1.0)):
				continue
			if n > top_n:
				top_n = n
				hot = [t2]
			elif n == top_n:
				hot.append(t2)
		if not hot.is_empty() and s.sim._rng.randf() < s.sim.rules.n("SOCIAL", "frameFollow", 0.55):
			tgt = int(hot[s.sim._rng.randi_range(0, hot.size() - 1)])
			s.sim._stat("alienFrameFollow", 1)
	if tgt < 0:
		tgt = int(targets[s.sim._rng.randi_range(0, targets.size() - 1)])
	return tgt


## 编排协同附议异形与诬陷罪名（COFRAME）。
static func _pick_frame_allies(s, aliens: Array, pool: Array, liar: int, tgt: int,
		counter: bool, sure_kind: String) -> Dictionary:
	var humans_alive := 0
	for a2: Dictionary in pool:
		if not bool(a2.get("alien", false)):
			humans_alive += 1
	var co_rate: float = s.sim.rules.n("COFRAME", "chance", 0.25) \
		if humans_alive > aliens.size() else s.sim.rules.n("COFRAME", "minorityChance", 0.10)
	var co_on: bool = aliens.size() > 1 and s.sim._rng.randf() < co_rate
	var kd := "saw_red"
	if counter:
		if sure_kind == "saw_pipe":
			kd = "saw_pipe" if s.sim._rng.randf() < 0.7 else "saw_red"
		elif sure_kind == "saw_red":
			kd = "saw_red" if s.sim._rng.randf() < 0.7 else "saw_pipe"
		else:
			kd = "saw_pipe" if s.sim._rng.randf() < 0.5 else "saw_red"
	var allies: Array = []
	if co_on:
		for x: Dictionary in aliens:
			var xi := int(x.get("i", -1))
			if xi == liar or xi == tgt:
				continue
			if allies.size() >= maxi(0, int(s.sim.rules.n("COFRAME", "maxAccusers", 3.0)) - 1):
				break
			allies.append(xi)
	else:
		for x2: Dictionary in aliens:
			var xi2 := int(x2.get("i", -1))
			if xi2 == liar or xi2 == tgt:
				continue
			if s._is_mate(x2, liar):
				allies.append(xi2)
				break
	if co_on:
		for ai3: int in allies:
			var aa: Dictionary = s.sim.agent(ai3)
			aa["accuse"] = tgt
			aa["accuseWhy"] = {"kind": kd, "reason": "协同附议", "fake": true}
			s.sim.note_accuse(ai3, tgt)
	return {"kd": kd, "allies": allies}


## 生成构陷台词与声明房间（保持与原流程一致的随机数消费顺序）。
static func _prepare_frame_quote(s, liar: int, tgt: int, counter: bool,
		sure_kind: String, kd: String) -> Dictionary:
	var liar_a: Dictionary = s.sim.agent(liar)
	var tgt_a: Dictionary = s.sim.agent(tgt)
	var claim_room: String = s.sim.room_at(tgt_a.get("pos", Vector2.ZERO))
	var liar_room: String = s._claimed_room(liar_a)
	if kd == "saw_pipe":
		var pipe_rooms: Array = []
		for q: Dictionary in (s.sim.map.get("pipes", []) as Array):
			var rid := String(q.get("room", ""))
			if rid != "" and not pipe_rooms.has(rid):
				pipe_rooms.append(rid)
		if not pipe_rooms.has(claim_room):
			claim_room = String(pipe_rooms[s.sim._rng.randi_range(0, pipe_rooms.size() - 1)]) \
				if not pipe_rooms.is_empty() else ""
	var liar_rn: String = s._rname(liar_room)
	var tname := String(tgt_a.get("name", "他"))
	var denial := ""
	if counter:
		match sure_kind:
			"saw_pipe": denial = "我没钻过管道。"
			"saw_red": denial = "我没出过刀。"
			"saw_knife": denial = "我没杀过人。"
			"saw_sabotage": denial = "我没破坏过设备。"
			"saw_bot": denial = "我没碰过机器人。"
			_: denial = "我没动过手。"
	var hard_line: bool = counter or s.sim._rng.randf() < float(s._r("MISLEAD", "hardLine", 0.55))
	var rebut := ""
	var when_w: String = s._when_word()
	if not hard_line:
		rebut = denial + "我%s在%s，总觉得%s举止反常，大家多留意。" % [when_w, liar_rn, tname]
	elif kd == "saw_pipe":
		rebut = denial + "我%s在%s，亲眼看见%s在%s钻进了管道。" % [when_w, liar_rn, tname, s._rname(claim_room)]
	else:
		rebut = denial + "我%s在%s，亲眼看见%s身上带着刚出刀的红光。" % [when_w, liar_rn, tname]
	return {"rebut": rebut, "liar_rn": liar_rn, "hard_line": hard_line, "tname": tname}


## 结算构陷听众拆谎与传闻嫌疑记账。
static func _apply_frame_effects(s, liar: int, tgt: int, sure_acc: int, allies: Array) -> Dictionary:
	var liar_a: Dictionary = s.sim.agent(liar)
	var caught_i := -1
	var caught_room := ""
	for w: Dictionary in s.sim.agents:
		var wi := int(w.get("i", -1))
		if wi == liar or wi == tgt or wi == sure_acc or not bool(w.get("alive", false)) or bool(w.get("downed", false)) or bool(w.get("alien", false)):
			continue
		var r: String = alibi_caught(s, w, liar, s._claimed_room(liar_a))
		if r != "":
			caught_i = wi
			caught_room = r
			break
	var hearers: Array = []
	for w2: Dictionary in s.sim.agents:
		var wi2 := int(w2.get("i", -1))
		if wi2 == liar or wi2 == tgt or wi2 == sure_acc or not bool(w2.get("alive", false)) or bool(w2.get("downed", false)):
			continue
		if not (w2.get("known", {}) as Dictionary).is_empty():
			continue
		hearers.append(wi2)
	var hbase: float = s.mind._witness_ctx_mul(liar_a.get("pos", Vector2.ZERO), hearers.size())
	var ax_cap: float = maxf(1.0, float(s.mind.rule("AXIS", "cap", 200.0)))
	var s_mul: float = float(s.mind.rule("AXIS", "scoreMul", 0.6))
	var h_cap: float = float(s.mind.rule("HEARD", "cap", 20.0)) * s_mul / ax_cap
	var w_scale: float = 80.0 * s_mul / ax_cap
	var contra_w: float = absf(float(s.mind.rule("MAPPING", "contradiction", -15.0))) * s_mul / ax_cap
	for w3: int in hearers:
		var listener: Dictionary = s.sim.agent(w3)
		if caught_i == w3:
			s.mind.sus_add_contradiction(listener, liar, contra_w, "contradiction_lie", {"kind": "contradiction", "src": "speech", "actor": liar})
		else:
			var jit: float = maxf(0.72, minf(1.10, hbase * (0.94 + s.sim._rng.randf() * 0.12)))
			s.mind.sus_add(listener, tgt, minf(h_cap, 0.26 * jit * w_scale), "heard_frame", {"kind": "heard_frame", "src": "speech", "actor": tgt, "by": liar})
			for k3: int in allies.size():
				var ally_i: int = allies[k3]
				var wgt: float = 0.08 if k3 == 0 else float(s.sim.rules.n("COFRAME", "extraWgt", 0.16)) * pow(float(s.sim.rules.n("COFRAME", "extraWgtDecay", 0.72)), float(k3 - 1))
				var jit2: float = maxf(0.72, minf(1.10, hbase * (0.94 + s.sim._rng.randf() * 0.12)))
				s.mind.sus_add(listener, tgt, minf(h_cap, wgt * jit2 * w_scale), "heard_frame_ally" if k3 == 0 else "heard_frame_co", {"kind": "heard_frame", "src": "speech", "actor": tgt, "by": ally_i})
	return {"caught": 1 if caught_i >= 0 else 0, "caught_i": caught_i, "caught_room": caught_room, "w_scale": w_scale}


## 播报构陷发言、协同附议、靶子自辩、当场拆谎与确证反驳。
static func _emit_frame_lines(s, liar: int, tgt: int, sure_acc: int, counter: bool,
		kd: String, quote: Dictionary, allies: Array, fx: Dictionary) -> void:
	var liar_a: Dictionary = s.sim.agent(liar)
	var tgt_a: Dictionary = s.sim.agent(tgt)
	var hard_line := bool(quote["hard_line"])
	var tname := String(quote["tname"])
	var liar_rn := String(quote["liar_rn"])
	var w_scale := float(fx["w_scale"])
	var caught_i := int(fx["caught_i"])
	var caught_room := String(fx["caught_room"])
	liar_a["accuse"] = tgt
	liar_a["accuseWhy"] = {"kind": kd if hard_line else "sus_high", "reason": "反咬" if hard_line else "举止反常", "fake": true, "soft": not hard_line, "solid": true}
	if s.sim._rng.randf() < float(s._r("SPEECH", "alienLeadRate", 0.12)):
		s.sim.note_accuse(liar, tgt)
	s._emit_raw(liar, String(quote["rebut"]))
	for ai4: int in allies:
		var ar: String = s._rname(s.sim.room_at(s.sim.agent(ai4).get("pos", Vector2.ZERO)))
		var act := "钻进了管道" if kd == "saw_pipe" else "身上带着刚出刀的红光"
		s._emit_raw(ai4, "我在%s，我也看见了：%s%s。%s没撒谎。" % [ar, tname, act, String(liar_a.get("name", "他"))])
	if not allies.is_empty():
		var ally0 := int(allies[0])
		for w4: Dictionary in s.sim.agents:
			if bool(w4.get("alien", false)) or bool(w4.get("downed", false)) or not bool(w4.get("alive", false)):
				continue
			if (w4.get("known", {}) as Dictionary).has(tgt):
				s.mind.sus_add(w4, ally0, 0.1 * w_scale, "defended_suspect", {"kind": "defended_suspect", "src": "speech"})
	var tgt_is_me: bool = tgt == int(s.sim.me_idx) and not bool(s.sim.spectator)
	if tgt != sure_acc and not tgt_is_me:
		var trn: String = s._rname(s.sim.room_at(tgt_a.get("pos", Vector2.ZERO)))
		var resp := "我没钻过管道。那会儿我在%s，谁能给我作证？" % trn
		if kd != "saw_pipe":
			resp = "我身上没有红光。那会儿我在%s，别只凭一句话。" % trn
		s._emit_raw(tgt, resp)
	if caught_i >= 0:
		s._emit_raw(caught_i, "我%s在%s看见%s了。你说你在%s？对不上。" % [
			s.mind.alibi_time_word(absf(float(s.sim.t))),
			s._rname(caught_room), String(liar_a.get("name", "他")), liar_rn])
	if counter and sure_acc >= 0:
		var sa: Dictionary = s.sim.agent(sure_acc)
		if bool(sa.get("alive", false)) and not bool(sa.get("downed", false)) \
				and (sure_acc != int(s.sim.me_idx) or bool(s.sim.spectator)):
			var wroom: String = s._rname(s._claimed_room(sa))
			var act2 := "钻管道" if kd == "saw_pipe" else "带着红光"
			var tail := "。" if tgt == sure_acc else "，不是%s。" % tname
			s._emit_raw(sure_acc, "我没看错，%s。我%s在%s，亲眼看见%s的就是你%s" % [
				String(liar_a.get("name", "他")), s._when_word(), wroom, act2, tail])


## 大义灭亲（2.5D planMateBus）：异形指控已认出队友换取人类听众信任。
static func plan_mate_bus(s, deception: Dictionary) -> void:
	if not s.enabled or s.mind == null:
		return
	if s.sim._rng.randf() >= s.sim.rules.n("MISLEAD", "busChance", 0.20):
		return
	var alive_aliens: Array = []
	for a: Dictionary in s.sim.agents:
		if bool(a.get("alien", false)) and bool(a.get("alive", false)) \
				and not bool(a.get("downed", false)):
			alive_aliens.append(a)
	var used: Dictionary = {}
	if not deception.is_empty():
		used[int(deception.get("by", -1))] = true
		for x: int in (deception.get("co", []) as Array):
			used[x] = true
	var liar_a: Dictionary = {}
	for x: Dictionary in alive_aliens:
		if used.has(int(x.get("i", -1))):
			continue
		var mates: Dictionary = x.get("mates", {}) as Dictionary
		if mates.is_empty():
			continue
		liar_a = x
		break
	if liar_a.is_empty():
		return
	var liar := int(liar_a.get("i", -1))
	var mate_pool: Array = []
	for k: int in (liar_a.get("mates", {}) as Dictionary).keys():
		var m: Dictionary = s.sim.agent(k)
		if not m.is_empty() and bool(m.get("alien", false)) and bool(m.get("alive", false)) \
				and not bool(m.get("downed", false)) and k != liar:
			mate_pool.append(k)
	if mate_pool.is_empty():
		return
	var mate := int(mate_pool[s.sim._rng.randi_range(0, mate_pool.size() - 1)])
	var mate_a: Dictionary = s.sim.agent(mate)
	var kd := "saw_pipe" if s.sim._rng.randf() < 0.5 else "saw_red"
	var claim_room: String = s.sim.room_at(mate_a.get("pos", Vector2.ZERO))
	var liar_room: String = s._claimed_room(liar_a)
	if kd == "saw_pipe":
		var pipe_rooms: Array = []
		for q: Dictionary in (s.sim.map.get("pipes", []) as Array):
			var rid := String(q.get("room", ""))
			if rid != "" and not pipe_rooms.has(rid):
				pipe_rooms.append(rid)
		if not pipe_rooms.has(claim_room):
			claim_room = String(pipe_rooms[s.sim._rng.randi_range(0, pipe_rooms.size() - 1)]) \
				if not pipe_rooms.is_empty() else ""
	var liar_rn: String = s._rname(liar_room)
	var claim_rn: String = s._rname(claim_room)
	var mname := String(mate_a.get("name", "他"))
	var text := ""
	if kd == "saw_pipe":
		text = "我%s在%s，亲眼看见%s在%s钻进了管道。" % [
			s._when_word(), liar_rn, mname, claim_rn]
	else:
		text = "我%s在%s，亲眼看见%s身上带着刚出刀的红光。" % [
			s._when_word(), liar_rn, mname]
	var ax_cap: float = maxf(1.0, float(s.mind.rule("AXIS", "cap", 200.0)))
	var s_mul: float = float(s.mind.rule("AXIS", "scoreMul", 0.6))
	var h_cap: float = float(s.mind.rule("HEARD", "cap", 20.0)) * s_mul / ax_cap
	var bus_w: float = minf(h_cap, 0.22 * 80.0 * s_mul / ax_cap)
	for w: Dictionary in s.sim.agents:
		var wi := int(w.get("i", -1))
		if wi == liar or wi == mate or bool(w.get("alien", false)):
			continue
		if not bool(w.get("alive", false)) or bool(w.get("downed", false)):
			continue
		if not s.mind.best_known_target(w).is_empty():
			continue
		s.mind.sus_add(w, mate, bus_w, "heard_frame",
			{"kind": "heard_frame", "src": "speech", "actor": mate, "by": liar, "bus": 1})
	liar_a["accuse"] = mate
	liar_a["accuseWhy"] = {"kind": kd, "reason": "队友洗白", "fake": true, "bus": true}
	liar_a["_busTarget"] = mate
	s._emit_raw(liar, text)
	s.sim._stat("busAccusals", 1)


## 先发制人（2.5D FIRST）：按 FIRST.chance 抢先定调，与 plan_alien_deception 互斥。
static func plan_first_accusation(s, kind: String) -> void:
	if kind == "pre" or not s.enabled or s.mind == null:
		return
	if s.sim._rng.randf() >= s.sim.rules.n("FIRST", "chance", 0.075):
		return
	var pool: Array = []
	for a: Dictionary in s.sim.agents:
		if bool(a.get("alien", false)) and bool(a.get("alive", false)) \
				and not bool(a.get("downed", false)):
			pool.append(a)
	if pool.is_empty():
		return
	var liar: Dictionary = pool[s.sim._rng.randi_range(0, pool.size() - 1)]
	var liar_i := int(liar.get("i", -1))
	var targets: Array = []
	for t: Dictionary in s.sim.agents:
		var ti := int(t.get("i", -1))
		if ti == liar_i or not bool(t.get("alive", false)) or bool(t.get("downed", false)):
			continue
		if s._is_mate(liar, ti):
			continue
		targets.append(ti)
	if targets.is_empty():
		return
	var tgt := int(targets[s.sim._rng.randi_range(0, targets.size() - 1)])
	var tgt_a: Dictionary = s.sim.agent(tgt)
	var tname := String(tgt_a.get("name", "他"))
	var kd := "saw_red" if s.sim._rng.randf() < 0.7 else "saw_pipe"
	var kd_room: String = s._claimed_room(tgt_a)
	var ctx_o := {"r": s._rname(kd_room), "t": tname, "when": s.lines.when_word(false)}
	s._emit(liar_i, "alien_open_accuse", ctx_o, tgt, "opening")
	liar["accuse"] = tgt
	liar["accuseWhy"] = {"kind": kd, "reason": "opening", "fake": true, "opening": true, "solid": true}
	s.sim.note_accuse(liar_i, tgt)
	s.sim._stat("firstAccusations", 1)
	var ax_cap: float = maxf(1.0, float(s.mind.rule("AXIS", "cap", 200.0)))
	var s_mul: float = float(s.mind.rule("AXIS", "scoreMul", 0.6))
	var h_cap: float = float(s.mind.rule("HEARD", "cap", 20.0)) * s_mul / ax_cap
	var w_scale: float = 80.0 * s_mul / ax_cap
	var fw: float = minf(h_cap, float(s.sim.rules.n("FIRST", "wgt", 0.22)) * w_scale)
	for l: Dictionary in s.sim.agents:
		var li := int(l.get("i", -1))
		if li == liar_i or li == tgt or bool(l.get("alien", false)) or not bool(l.get("alive", false)) \
				or bool(l.get("downed", false)) or not (l.get("known", {}) as Dictionary).is_empty():
			continue
		s.mind.sus_add(l, tgt, fw, "heard_frame", {"kind": "heard_frame", "src": "speech", "actor": tgt, "by": liar_i, "opening": 1})
	var others: Array = []
	for a2: Dictionary in s.sim.agents:
		if int(a2.get("i", -1)) != liar_i and bool(a2.get("alien", false)) and bool(a2.get("alive", false)) and not bool(a2.get("downed", false)):
			others.append(a2)
	others.sort_custom(func(p: Dictionary, q: Dictionary) -> bool:
		return bool(s._is_mate(liar, int(p.get("i", -1)))) and not bool(s._is_mate(liar, int(q.get("i", -1)))))
	var max_allies := maxi(0, int(s.sim.rules.n("FIRST", "maxAccusers", 3)) - 1)
	var k := 0
	for x: Dictionary in others:
		if k >= max_allies:
			break
		k += 1
		var xi := int(x.get("i", -1))
		s._emit(xi, "alien_open_echo", {"r": s._rname(kd_room), "t": tname, "when": s.lines.when_word(false)}, -1, "open_echo")
		x["accuse"] = tgt
		x["accuseWhy"] = {"kind": kd, "reason": "协同附议", "fake": true, "opening": true}
		s.sim.note_accuse(xi, tgt)
		var ew: float = minf(h_cap, float(s.sim.rules.n("FIRST", "extraWgt", 0.14)) * pow(float(s.sim.rules.n("FIRST", "extraWgtDecay", 0.72)), float(k - 1)) * w_scale)
		for l2: Dictionary in s.sim.agents:
			var li2 := int(l2.get("i", -1))
			if li2 == xi or li2 == tgt or bool(l2.get("alien", false)) or not bool(l2.get("alive", false)) \
					or bool(l2.get("downed", false)) or not (l2.get("known", {}) as Dictionary).is_empty():
				continue
			s.mind.sus_add(l2, tgt, ew, "heard_frame", {"kind": "heard_frame", "src": "speech", "actor": tgt, "by": xi, "co": k})


## 领袖指令（2.5D scheduleLeaderOrders）：下 1~2 条安排，听众 warm +0.06。
static func schedule_leader_orders(s, _kind: String) -> void:
	if s.leader_i < 0 or not s.enabled:
		return
	var L: Dictionary = s.sim.agent(s.leader_i)
	if L.is_empty() or not bool(L.get("alive", false)) or bool(L.get("downed", false)):
		return
	var n_orders := 2 if (s.sim._rng.randf() < 0.4) else 1
	for k in n_orders:
		var rooms: Array = (s.sim.map.get("rooms", []) as Array)
		if rooms.is_empty():
			return
		var rm: Dictionary = rooms[s.sim._rng.randi_range(0, rooms.size() - 1)]
		var rid := String(rm.get("id", ""))
		var pool: Array = []
		for x: Dictionary in s.sim.agents:
			if int(x.get("i", -1)) == s.leader_i:
				continue
			if bool(x.get("alive", false)) and not bool(x.get("downed", false)):
				pool.append(int(x.get("i", -1)))
		if pool.is_empty():
			return
		var tgt_i := int(pool[s.sim._rng.randi_range(0, pool.size() - 1)])
		var tgt: Dictionary = s.sim.agent(tgt_i)
		var tname := String(tgt.get("name", "大家"))
		s._emit_raw(s.leader_i, "我安排一下：%s，你去%s看看。" % [tname, s._rname(rid)])
		s.sim._stat("orders", 1)
		tgt["order"] = {"room": rid, "night": int(s.sim.night), "by": s.leader_i}
		if not bool(tgt.get("alien", false)):
			var will := _will_obey(s, tgt, rid)
			if not will and s.sim._rng.randf() < s.sim.rules.n("LEADER", "refuseSpeakP", 0.5):
				s._emit_raw(tgt_i, "我去不了%s，我手上还有任务。" % s._rname(rid))
		for w: Dictionary in s.sim.agents:
			if int(w.get("i", -1)) == s.leader_i:
				continue
			if not bool(w.get("alive", false)) or bool(w.get("downed", false)):
				continue
			s.mind.warm_add(w, s.leader_i, s.sim.rules.n("LEADER", "warmGain", 0.06))


static func _will_obey(s, tgt: Dictionary, rid: String) -> bool:
	var tasks: Array = tgt.get("tasks", []) as Array
	var tIdx := int(tgt.get("tIdx", 0))
	var idx := -1
	for k in range(tIdx, tasks.size()):
		var p: Dictionary = s.sim.point(int(tasks[k]))
		if String(p.get("room", "")) == rid:
			idx = k
			break
	if idx == tIdx:
		return true
	if idx < 0:
		return false
	var gate: float = maxf(0.01, float(s.mind.trust_obey_gate()))
	var obey_p: float = float(s.leader_charisma) * clampf(float(s.mind.cred_of(tgt, s.leader_i)) / gate, 0.0, 1.0)
	return s.sim._rng.randf() < obey_p


## 说谎者声称的房间与听众目击记忆对不上 → 返回对不上的房间（拆谎）。
static func alibi_caught(s, listener: Dictionary, liar: int, claim_room: String) -> String:
	if claim_room == "":
		return ""
	var why: Dictionary = listener.get("why", {}) as Dictionary
	var mem: Array = (why.get(liar, []) as Array)
	var now: float = s.mind.ev_now()
	var best_room := ""
	var best_age := 1.0e9
	var checked := 0
	for e: Variant in mem:
		if not (e is Dictionary):
			continue
		var rec := e as Dictionary
		var kd := String(rec.get("kind", ""))
		if not kd.begins_with("saw_"):
			continue
		if int(rec.get("night", -1)) != int(s.sim.night):
			continue
		var room := String(rec.get("room", ""))
		if room == "":
			continue
		var t := float(rec.get("t", 0.0))
		if now - t > 45.0:
			continue
		if room == claim_room:
			return ""
		checked += 1
		if room == "corridor" or room == "unknown":
			continue
		if t < best_age:
			best_age = t
			best_room = room
	if checked == 0:
		return ""
	return best_room
