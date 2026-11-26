extends RefCounted
## AI 认知层 —— 追责清算、时间线拆谎、传闻滑窗、信誉广播与公开线索评估。
## 从 `mind.gd` 拆出，纯静态工具集，不持有状态；数值仍由 `m.rule` / `rules.json` 驱动。


static func alibi_time_word(m, age: float) -> String:
	var s: float = maxf(0.0, age)
	if s <= float(m.rule("ALIBI", "stale", 15.0)):
		return "刚才"
	if s < 40.0:
		return "十几秒前"
	return "半分钟前"


static func relia_mul(m, rel: Variant) -> float:
	var v: float = float(m.rule("RELIA", "base", 0.5)) if rel == null else float(rel)
	return float(m.rule("RELIA", "mixBase", 0.5)) + clampf(v, 0.0, 1.0)


static func alibi_reach(dist: float, dt_sec: Variant, speed: float) -> Dictionary:
	var v := speed if speed > 0.0 else 4.0
	var need: float = dist / v
	var dt: float = INF if dt_sec == null else float(dt_sec)
	return {"possible": need <= dt + 2.0, "needSec": snappedf(need, 0.01),
		"shortfall": snappedf(maxf(0.0, need - dt), 0.01)}


static func crime_window(m, victim_i: int) -> Dictionary:
	var v: Dictionary = m.sim.agent(victim_i)
	if v.is_empty():
		return {}
	var t: Variant = null
	if bool(v.get("alive", false)):
		t = v.get("downAt", null)
	else:
		t = v.get("deathAt", null)
	if t == null:
		return {}
	var ref: float = float(m.sim.night_len()) - maxf(0.0, float(t))
	var core: float = m.rule("ALIBI", "core", 8.0)
	return {"t0": maxf(0.0, ref - core), "t1": ref + core, "tRef": ref}


static func claim_window(m, when: String) -> Dictionary:
	var now: float = m.ev_now()
	if when == "night":
		return {"t0": 0.0, "t1": now, "tRef": now}
	if when == "recent":
		return {"t0": maxf(0.0, now - float(m.rule("ALIBI", "recent", 20.0))), "t1": now, "tRef": now}
	return {"t0": maxf(0.0, now - float(m.rule("ALIBI", "window", 45.0))), "t1": now, "tRef": now}


static func sus_cut(m, a: Dictionary, target_i: int, w: float, reason: String,
		ev: Dictionary = {}) -> void:
	if a.is_empty() or target_i < 0 or int(a.get("i", -1)) == target_i:
		return
	if (a.get("known", {}) as Dictionary).has(target_i):
		return
	var old: float = m.sus_of(a, target_i)
	if old <= 0.0:
		return
	var cut := minf(old, w)
	var s: Dictionary = (a.get("sus", {}) as Dictionary).duplicate()
	s[target_i] = maxf(0.0, old - cut)
	a["sus"] = s
	var al: Dictionary = (a.get("alibi", {}) as Dictionary).duplicate()
	al[target_i] = {"t": float(ev.get("t", m.ev_now())),
		"room": ev.get("room", null), "reason": reason}
	a["alibi"] = al


static func sus_add_contradiction(m, a: Dictionary, target_i: int, weight: float,
		reason: String, ev: Dictionary = {}) -> void:
	m.sus_add(a, target_i, weight, reason, ev)
	m.sim._stat("contradictions", 1)
	m.sim._stat_by("contradictionsBy", reason, 1)


static func old_quantifier_would_fire(m, w: Dictionary, subj: int, claim_room: String) -> bool:
	if w.is_empty() or subj < 0 or claim_room == "":
		return false
	var why: Dictionary = w.get("why", {}) as Dictionary
	var mem: Array = (why.get(subj, []) as Array)
	var now: float = m.ev_now()
	var tail := mini(24, mem.size())
	for k in range(mem.size() - 1, mem.size() - 1 - tail, -1):
		var e: Dictionary = mem[k]
		if String(e.get("kind", "")) != "saw_agent" or int(e.get("actor", -1)) != subj:
			continue
		if int(e.get("night", -1)) != int(m.sim.night):
			continue
		var room := String(e.get("room", ""))
		if room == "":
			continue
		if room == claim_room:
			continue
		if now - float(e.get("t", 0.0)) > 45.0:
			continue
		return true
	return false


static func known_override(m, w: Dictionary, target_i: int) -> void:
	if w.is_empty() or target_i < 0:
		return
	var al: Dictionary = (w.get("almost", {}) as Dictionary).duplicate()
	var foe: Dictionary = (al.get("foe", {}) as Dictionary).duplicate()
	var friend: Dictionary = (al.get("friend", {}) as Dictionary).duplicate()
	var had_friend: bool = friend.has(target_i)
	friend.erase(target_i)
	var cred: Dictionary = (w.get("cred", {}) as Dictionary).duplicate()
	if cred.has(target_i):
		cred[target_i] = 0.0
		w["cred"] = cred
	var cw: Dictionary = (w.get("credWhy", {}) as Dictionary).duplicate()
	cw.erase(target_i)
	w["credWhy"] = cw
	if not foe.has(target_i):
		foe[target_i] = {"t": float(m.ev_now()), "sus": 1.0, "kinds": ["known"],
			"since": int(m.sim.night), "conf": 1.0}
	al["foe"] = foe
	al["friend"] = friend
	w["almost"] = al
	if had_friend:
		m.sim._stat("overriddenFriends", 1)


static func sequence_cue(m, a: Dictionary, target_i: int) -> Dictionary:
	var why: Dictionary = a.get("why", {}) as Dictionary
	var mem: Array = (why.get(target_i, []) as Array)
	var hostile := {"saw_red": true, "saw_drag_away": true, "saw_body_moved": true,
		"saw_avoid": true}
	var win: float = m.rule("MIND", "seqWindowSec", 25.0)
	var first_t: Variant = null
	var kinds: Dictionary = {}
	for e: Variant in mem:
		if not (e is Dictionary):
			continue
		var rec := e as Dictionary
		if int(rec.get("actor", -1)) != target_i:
			continue
		var kd := String(rec.get("kind", ""))
		if not hostile.has(kd):
			continue
		var t := float(rec.get("t", 0.0))
		if first_t != null and t - float(first_t) > win:
			first_t = t
			kinds = {kd: true}
			continue
		if first_t == null:
			first_t = t
		kinds[kd] = true
		if kinds.size() >= 2:
			return {"kind": "sequence", "w": 0.30,
				"why": "先后看见他做过两种不一样的可疑动作",
				"alt": "两件事也可能只是恰好发生在同一个人附近"}
	return {}


static func statement_relation(testimony: Array, vouches: Array, tgt: int) -> Dictionary:
	var a_set: Dictionary = {}
	var v_set: Dictionary = {}
	for it: Variant in testimony:
		if not (it is Dictionary):
			continue
		var rec := it as Dictionary
		if not bool(rec.get("said", false)) or int(rec.get("tgt", -1)) != tgt:
			continue
		var reason := String(rec.get("reason", ""))
		if reason == "heard_accuse" or reason == "empty_accuse":
			a_set[int(rec.get("by", -1))] = true
	for v: Variant in vouches:
		if not (v is Dictionary):
			continue
		var vr := v as Dictionary
		if int(vr.get("tgt", -1)) == tgt:
			v_set[int(vr.get("by", -1))] = true
	var both := 0
	for by: int in a_set.keys():
		if v_set.has(by):
			a_set.erase(by)
			v_set.erase(by)
			both += 1
	var n_a := a_set.size()
	var n_v := v_set.size()
	var damp := 1.0
	if n_a > 0 and n_v > 0:
		damp = maxf(0.4, float(n_a) / float(n_a + n_v))
	return {"accusers": n_a, "vouchers": n_v, "selfConflict": both, "damp": damp}


static func env_estimate(m, a: Dictionary, target_i: int) -> Dictionary:
	var empty := {"score": 0.0, "conf": 0.0, "whyKind": "none", "cues": []}
	if a.is_empty() or target_i < 0 or target_i == int(a.get("i", -1)):
		return empty
	var t: Dictionary = m.sim.agent(target_i)
	if t.is_empty():
		return empty
	var cues: Array = []
	var seen_word := {"saw_knife": "出刀", "saw_pipe": "钻管道", "saw_sabotage": "破坏设备",
		"saw_breaker": "拉闸断电", "saw_bot": "停摆机器人", "saw_red": "身上带着红光",
		"saw_drag": "拖尸体", "saw_detain": "被保安拘留", "saw_agent": "出现在那里"}
	var own: Variant = (a.get("known", {}) as Dictionary).get(target_i, null)
	if own != null:
		var okd := String((own as Dictionary).get("kind", "known"))
		return {"score": 1.0, "conf": 1.0, "whyKind": "seen",
			"cues": [{"kind": okd, "w": 1.0,
			"why": "我亲眼看见他" + String(seen_word.get(okd, "动手")),
			"alt": "也可能是我把同舱室的另一个人看成了他"}]}
	var why: Dictionary = a.get("why", {}) as Dictionary
	var mem: Array = (why.get(target_i, []) as Array)
	var counted := 0
	for k in range(mem.size() - 1, -1, -1):
		if counted >= 6:
			break
		var e: Dictionary = mem[k]
		if int(e.get("actor", -1)) != target_i:
			continue
		var kd := String(e.get("kind", ""))
		if kd.begins_with("saw_") and String(e.get("src", "")) == "sight":
			cues.append({"kind": kd, "w": 0.72,
				"why": "我在" + String(e.get("room", "现场")) + "看见他"
					+ String(seen_word.get(kd, "动手")),
				"alt": "近距离看见的也可能是同舱室的另一个人"})
			counted += 1
		elif kd == "heard_accuse" or kd == "heard_claim":
			cues.append({"kind": "heard", "w": 0.28, "why": "我听见有人当众指认他",
				"alt": "指认他的人也可能在构陷"})
			counted += 1
	var acc: Array = m.pub_accusers(target_i)
	if not acc.is_empty():
		cues.append({"kind": "public", "w": minf(0.60, 0.22 + 0.12 * acc.size()),
			"why": "有 %d 个人当众指认他" % acc.size(),
			"alt": "公开指认也可能是跟风或构陷"})
	var seq: Dictionary = sequence_cue(m, a, target_i)
	if not seq.is_empty():
		cues.append(seq)
	if float(t.get("redT", 0.0)) > 0.0:
		cues.append({"kind": "red", "w": 0.55, "why": "他身上还带着刚出刀的红光",
			"alt": "红光只说明他刚动过刀，不说明刀的是谁"})
	if int(t.get("drag", -1)) >= 0:
		cues.append({"kind": "drag", "w": 0.32, "why": "他正在拖尸体",
			"alt": "拖尸体也可能是想把伤者送进医疗间"})
	var kind_set: Dictionary = {}
	var score := 0.0
	var best_kind := "none"
	for c: Variant in cues:
		var cue := c as Dictionary
		kind_set[String(cue["kind"])] = true
		if float(cue["w"]) > score:
			score = float(cue["w"])
			best_kind = String(cue["kind"])
	var nk := kind_set.size()
	if nk >= 2:
		score = minf(1.0, score + 0.12)
	var conf := 0.0 if cues.is_empty() else minf(1.0, 0.35 + 0.18 * nk)
	var why_kind := "none"
	if best_kind != "none":
		why_kind = "heard" if best_kind == "heard" else ("public" if best_kind == "public" else "seen")
	return {"score": score, "conf": conf, "whyKind": why_kind, "cues": cues}


static func aud_sus_estimate(m, a: Dictionary, w: Dictionary) -> Dictionary:
	if a.is_empty() or w.is_empty():
		return {"score": 0.0, "conf": 0.0, "why": ""}
	var score := 0.0
	var why := ""
	var wi := int(w.get("i", -1))
	var ai := int(a.get("i", -1))
	if int(w.get("accuse", -1)) == ai:
		score = 0.85
		why = "他当众指认过我"
	if score < 0.7:
		for h: Dictionary in (a.get("heard", []) as Array):
			if int(h.get("speaker", -1)) != wi or int(h.get("target", -1)) != ai:
				continue
			var kd := String(h.get("kind", ""))
			if kd == "heard_accuse" or kd == "heard_frame" or kd == "heard_claim":
				score = 0.7
				why = "我听见他当众点过我"
				break
	var seen_by: Dictionary = w.get("seenBy", {}) as Dictionary
	if seen_by.has(ai):
		var age: float = float(m.ev_now()) - float((seen_by[ai] as Dictionary).get("t", 0.0))
		if age < 20.0 and score < 0.55:
			score = 0.55
			if why == "":
				why = "他刚才看见我在现场附近"
	if float(a.get("redT", 0.0)) > 0.0 and score < 0.45:
		score = 0.45
		if why == "":
			why = "我身上还带着红光"
	return {"score": score, "conf": 0.7 if score > 0.0 else 0.15, "why": why}


static func record_claim(m, a: Dictionary, room_id: String) -> void:
	if a.is_empty():
		return
	var rid := room_id
	var rname: String = m.sim.room_name(rid) if rid != "" else "走廊"
	var h: Array = (a.get("claimHist", []) as Array).duplicate()
	h.append({"night": int(m.sim.night), "room": rname, "roomId": rid})
	while h.size() > 3:
		h.remove_at(0)
	a["claimHist"] = h


static func note_testimony(m, listener_i: int, speaker_i: int, target_i: int,
		kind: String, strength: float = -1.0, claim_room: String = "") -> void:
	var l: Dictionary = m.sim.agent(listener_i)
	var sp: Dictionary = m.sim.agent(speaker_i)
	if l.is_empty() or sp.is_empty() or listener_i == speaker_i or target_i < 0:
		return
	var cap := int(m.rule("ATTN", "heardMax", 10))
	var heard: Array = (l.get("heard", []) as Array).duplicate()
	var independent := false
	for h: Dictionary in heard:
		if int(h.get("target", -1)) == target_i and int(h.get("speaker", -1)) != speaker_i:
			independent = true
	var ax_cap: float = maxf(1.0, float(m.rule("AXIS", "cap", 200.0)))
	var s_mul: float = m.rule("AXIS", "scoreMul", 0.6)
	var heard_cap: float = float(m.rule("HEARD", "cap", 20.0)) * s_mul / ax_cap
	var base: float = strength if strength >= 0.0 else float(m.rule("MAPPING", "relay", 12.0)) * s_mul / ax_cap
	var rel: float = m.relia_of(l, speaker_i)
	var w := base * relia_mul(m, rel)
	if float(m.sus_of(l, speaker_i)) >= float(m.rule("TESTIFY", "dirtySus", 0.3)):
		w *= float(m.rule("TESTIFY", "dirtyMul", 0.85))
	if independent:
		w *= float(m.rule("TESTIFY", "corrobMul", 1.25))
	var rec := {"kind": kind, "src": "speech", "actor": target_i, "speaker": speaker_i, "night": int(m.sim.night)}
	if bool(m.sim.rules.t("DESC").get("on", true)):
		var D: Dictionary = m.sim.rules.t("DESC")
		var touched := false
		if claim_room != "" and m.sim._rng.randf() < float(D.get("roomErr", 0.22)):
			var pool: Array = []
			for r: Dictionary in (m.sim.map.get("rooms", []) as Array):
				var rid := String(r.get("id", ""))
				if rid != "" and rid != claim_room:
					pool.append(rid)
			if not pool.is_empty():
				claim_room = String(pool[m.sim._rng.randi_range(0, pool.size() - 1)])
				touched = true
		var swap := {"saw_knife": "saw_pipe", "saw_pipe": "saw_red", "saw_red": "saw_knife",
			"saw_sabotage": "saw_knife", "heard_accuse": "heard_frame", "heard_frame": "heard_accuse"}
		if swap.has(kind) and m.sim._rng.randf() < float(D.get("kindErr", 0.18)):
			kind = String(swap[kind])
			rec["kind"] = kind
			touched = true
		if touched:
			w *= float(D.get("confLoss", 0.78))
			rec["descErr"] = true
			m.sim._stat("descErrors", 1)
	if claim_room != "":
		rec["room"] = claim_room
	heard.append({"speaker": speaker_i, "target": target_i, "kind": kind, "night": int(m.sim.night)})
	while heard.size() > cap:
		heard.remove_at(0)
	l["heard"] = heard
	m.sus_add(l, target_i, minf(w, heard_cap), "heard_testimony", rec)


static func check_alibi(m, speaker_i: int, room_id: String) -> int:
	if room_id == "":
		return 0
	var caught := 0
	var now: float = m.ev_now()
	var win: float = m.rule("ALIBI", "window", 45.0)
	for l: Dictionary in m.sim.agents:
		if int(l.get("i", -1)) == speaker_i or not bool(l.get("alive", false)):
			continue
		var mem: Array = ((l.get("why", {}) as Dictionary).get(speaker_i, []) as Array)
		var checked := 0
		var matched := false
		for e: Variant in mem:
			if not (e is Dictionary):
				continue
			var rec := e as Dictionary
			if String(rec.get("kind", "")) != "saw_agent":
				continue
			if int(rec.get("night", -1)) != int(m.sim.night):
				continue
			var t := float(rec.get("t", 0.0))
			if now - t > win:
				continue
			var room := String(rec.get("room", ""))
			if room == "" or room == "corridor" or room == "unknown":
				continue
			checked += 1
			if room == room_id:
				matched = true
				break
		if checked == 0 or matched:
			continue
		relia_add(m, l, speaker_i, -float(m.rule("RELIA", "caughtLie", 0.2)))
		var c_w: float = absf(float(m.rule("MAPPING", "contradiction", -15.0))) * float(m.rule("AXIS", "scoreMul", 0.6)) / maxf(1.0, float(m.rule("AXIS", "cap", 200.0)))
		sus_add_contradiction(m, l, speaker_i, c_w, "contradiction", {"kind": "contradiction", "src": "alibi", "room": room_id})
		caught += 1
	return caught


static func cred_add(m, a: Dictionary, target_i: int, key: String, amount: float = NAN) -> void:
	if a.is_empty() or target_i < 0 or int(a.get("i", -1)) == target_i:
		return
	if m.sim == null or m.sim.rules == null:
		return
	var known: Dictionary = (a.get("known", {}) as Dictionary)
	if known.has(target_i):
		return
	var gains: Dictionary = m.sim.rules.t("WITNESS")
	if gains.is_empty():
		gains = (m.sim.rules.t("CRED").get("gains", {}) as Dictionary)
	var w := amount
	if is_nan(w):
		if not gains.has(key):
			return
		w = float(gains[key])
	if w == 0.0:
		return
	var cred: Dictionary = (a.get("cred", {}) as Dictionary).duplicate()
	if key != "" and gains.has(key):
		var mul: float = m.rule("AXIS", "scoreMul", 0.6)
		var applied: float = m.budget_t(a, target_i, w * mul, key)
		if applied == 0.0:
			return
		m.axis_add_t(a, target_i, applied)
		var ax_cap: float = maxf(1.0, float(m.rule("AXIS", "cap", 200.0)))
		cred[target_i] = clampf((float(m.trust_raw(a, target_i)) - float(m.current_prior())) / ax_cap, -1.0, 1.0)
		if applied > 0.0 and not bool(a.get("alien", false)):
			var s_old: float = m.sus_of(a, target_i)
			if s_old > 0.0:
				var s_map: Dictionary = (a.get("sus", {}) as Dictionary).duplicate()
				s_map[target_i] = maxf(0.0, s_old - applied / ax_cap)
				a["sus"] = s_map
	else:
		var cap: float = m.rule("CRED", "cap", 1.2)
		cred[target_i] = clampf(float(cred.get(target_i, 0.0)) + w, 0.0, cap)
	a["cred"] = cred
	if key != "" and gains.has(key):
		var cw: Dictionary = (a.get("credWhy", {}) as Dictionary).duplicate()
		var arr: Array = (cw.get(target_i, []) as Array).duplicate()
		arr.append({"kind": key, "night": int(m.sim.night), "w": w})
		while arr.size() > 8:
			arr.remove_at(0)
		cw[target_i] = arr
		a["credWhy"] = cw
		m.eval_almost(a, target_i)


static func relia_add(m, a: Dictionary, target_i: int, delta: float) -> void:
	if a.is_empty() or target_i < 0 or int(a.get("i", -1)) == target_i or delta == 0.0:
		return
	var rel: Dictionary = (a.get("reliability", {}) as Dictionary).duplicate()
	var old := float(rel.get(target_i, float(m.rule("RELIA", "base", 0.5))))
	rel[target_i] = clampf(old + delta, float(m.rule("RELIA", "min", 0.05)), float(m.rule("RELIA", "max", 1.0)))
	a["reliability"] = rel


static func cred_broadcast(m, actor_i: int, kind: String, at: Vector2) -> void:
	if m.sim == null or m.sim.rules == null:
		return
	var actor: Dictionary = m.sim.agent(actor_i)
	if actor.is_empty():
		return
	var gains: Dictionary = m.sim.rules.t("WITNESS")
	if gains.is_empty():
		gains = (m.sim.rules.t("CRED").get("gains", {}) as Dictionary)
	if not gains.has(kind):
		return
	var w0 := float(gains[kind])
	if w0 == 0.0:
		return
	var sight_r := 14.0
	var seen: Array = []
	var foes: Array = []
	for w: Dictionary in m.sim.agents:
		if w == actor or not bool(w.get("alive", false)):
			continue
		if bool(w.get("downed", false)) or bool(w.get("detained", false)):
			continue
		if float(w.get("doing", 0.0)) > 0.0:
			continue
		var wp: Vector2 = w.get("pos", Vector2.ZERO)
		if wp.distance_to(at) > sight_r:
			continue
		if not m.sim.los_now(wp.x, wp.y, at.x, at.y):
			continue
		if bool(w.get("alien", false)):
			if not m._is_mate(w, actor_i):
				foes.append(w)
		else:
			seen.append(w)
	var n_all := seen.size() + foes.size()
	var base := witness_ctx_mul(m, at, n_all)
	var ax_cap: float = maxf(1.0, float(m.rule("AXIS", "cap", 200.0)))
	for w2: Dictionary in seen:
		var jit: float = maxf(0.72, minf(1.10, base * (0.94 + m.sim._rng.randf() * 0.12)))
		if (kind == "fakeWork" or kind == "fakeRepair") and (w2.get("pos", Vector2.ZERO) as Vector2).distance_to(at) > 2.5:
			cred_add(m, w2, actor_i, "taskDoing", float(gains.get("taskDoing", 15.0)) * jit)
		elif w0 < 0.0:
			var sus_w: float = absf(w0 * jit) * float(m.rule("AXIS", "scoreMul", 0.6)) / ax_cap
			m.sus_add(w2, actor_i, sus_w, kind, {"kind": "saw_fake_task" if kind.begins_with("fake") else kind,
				"src": "sight", "actor": actor_i, "x": at.x, "y": at.y, "room": m.sim.room_at(at), "night": int(m.sim.night)})
		else:
			cred_add(m, w2, actor_i, kind, w0 * jit)
	for w3: Dictionary in foes:
		var jit2: float = maxf(0.72, minf(1.10, base * (0.94 + m.sim._rng.randf() * 0.12)))
		if kind == "fakeWork" or kind == "fakeRepair":
			var mm: Dictionary = (w3.get("mates", {}) as Dictionary).duplicate()
			mm[actor_i] = {"t": float(m.ev_now()), "kind": "saw_fake_task"}
			w3["mates"] = mm
			continue
		if w0 > 0.0:
			cred_add(m, w3, actor_i, kind, w0 * jit2)


static func witness_ctx_mul(m, at: Vector2, n_seen: int) -> float:
	var mul := 1.0
	var n := maxi(1, n_seen)
	if n > 1:
		mul -= minf(0.16, float(n - 1) * 0.04)
	if not bool(m.sim.power_on):
		mul -= 0.14
	var L: float = m.sim.night_len()
	var now: float = L - maxf(0.0, float(m.sim.t))
	var near := 0
	for k in range(m.sim.events.size() - 1, -1, -1):
		var e: Dictionary = m.sim.events[k]
		if int(e.get("night", -1)) != int(m.sim.night):
			continue
		var ev_t: Variant = e.get("t", null)
		if not (ev_t is int or ev_t is float):
			continue
		var at_t: float = L - float(ev_t)
		if at_t > now:
			continue
		if now - at_t > 8.0:
			break
		var ex: Variant = e.get("x", null)
		var ey: Variant = e.get("y", null)
		if not (ex is int or ex is float) or not (ey is int or ey is float):
			continue
		var kind := String(e.get("kind", ""))
		if kind != "knife" and kind != "bot_hit" and kind != "bot_down" \
				and kind != "breaker" and kind != "sabotage":
			continue
		if Vector2(float(ex), float(ey)).distance_to(at) > 8.0:
			continue
		near += 1
	if near > 0:
		mul -= minf(0.12, float(near) * 0.04)
	return mul


static func _sync_cred_shadow(m, a: Dictionary, target_i: int) -> void:
	var ax_cap: float = maxf(1.0, float(m.rule("AXIS", "cap", 200.0)))
	var cred: Dictionary = (a.get("cred", {}) as Dictionary).duplicate()
	cred[target_i] = clampf((float(m.trust_raw(a, target_i)) - float(m.current_prior())) / ax_cap, -1.0, 1.0)
	a["cred"] = cred


static func _spam_mul(w: Dictionary, vi: int, spam_at: int, spam_mul: float) -> float:
	var n := 0
	for h: Variant in (w.get("heard", []) as Array):
		if h is Dictionary:
			var hd := h as Dictionary
			if int(hd.get("speaker", hd.get("by", -1))) == vi:
				n += 1
	var over_n := n - spam_at
	return 1.0 + spam_mul * float(mini(3, over_n)) if over_n > 0 else 1.0


## 追责清算：只对带头人落 T 与煽动情绪，被冤者对投票者记仇 E。
static func settle_accountability(m, cand_i: int, votes: Dictionary, lead: int = -1) -> void:
	if cand_i < 0:
		return
	var cand: Dictionary = m.sim.agent(cand_i)
	if cand.is_empty():
		return
	var was_alien := bool(cand.get("alien", false))
	var voters: Array = []
	for k: int in votes.keys():
		if int(votes[k]) == cand_i:
			voters.append(int(k))
	var lead_i := lead if lead >= 0 else (int(voters[0]) if not voters.is_empty() else -1)
	if lead_i < 0:
		return
	if not voters.has(lead_i):
		voters.append(lead_i)
	var acc: Dictionary = m.sim.rules.t("ACCOUNT")
	var score_mul: float = m.rule("AXIS", "scoreMul", 0.6)
	var src: Dictionary = m.sim.agent(lead_i)
	if not src.is_empty():
		var spam_at := int(acc.get("spamAt", 3))
		var spam_mul := float(acc.get("spamMul", 1.6))
		for w: Dictionary in m.sim.agents:
			if w == src or w == cand or not bool(w.get("alive", false)) or bool(w.get("downed", false)):
				continue
			if was_alien:
				m.axis_add_t(w, lead_i, float(acc.get("correct", 50.0)) * float(acc.get("leadMul", 1.0)) * score_mul)
				_sync_cred_shadow(m, w, lead_i)
				relia_add(m, w, lead_i, float(m.rule("RELIA", "leadRight", 0.35)))
			else:
				m.axis_add_t(w, lead_i, float(acc.get("wrong", -12.0)) * _spam_mul(w, lead_i, spam_at, spam_mul) * score_mul)
				_sync_cred_shadow(m, w, lead_i)
				relia_add(m, w, lead_i, -float(m.rule("RELIA", "leadWrong", 0.30)))
				m.emo_add(w, lead_i, float(acc.get("wrongLeadEmo", -45.0)), "wrong_lead")
	if not was_alien:
		var voter_emo := float(acc.get("voterEmo", -30.0))
		for vi: int in voters:
			if not m.sim.agent(vi).is_empty():
				m.emo_add(cand, vi, voter_emo, "voted_me")
	if was_alien:
		var defense_log: Dictionary = m.sim.meeting.get("defenseLog", {}) as Dictionary
		var meta: Dictionary = m.sim.rules.t("META")
		var ally_count := int(meta.get("allyCount", 2))
		var ally_sus := float(meta.get("allySus", 0.16))
		var ally_mul := float(meta.get("allyMul", 1.7))
		for k: int in defense_log.keys():
			var def_a: Dictionary = m.sim.agent(k)
			if def_a.is_empty() or k == cand_i:
				continue
			if not bool(def_a.get("alive", false)) or bool(def_a.get("downed", false)):
				continue
			var v: Variant = defense_log[k]
			if not (v is Dictionary) or not (v as Dictionary).has(cand_i):
				continue
			var ally_n := int((def_a.get("ally", {}) as Dictionary).get(cand_i, 0))
			var strong := ally_n >= ally_count
			var wgt := ally_sus * ally_mul if strong else 0.18
			var kind := "ally_revealed" if strong else "defended_revealed"
			for w: Dictionary in m.sim.agents:
				if w == def_a or w == cand or not bool(w.get("alive", false)) or bool(w.get("downed", false)):
					continue
				m.sus_add(w, k, wgt, kind, {"kind": kind, "src": "vote", "actor": k})
			def_a["_retract"] = cand_i
			m.sim._stat("retractCount", 1)
			if strong:
				m.sim._stat("allyRevealed", 1)
	m.sim._log("account", {"victim": cand_i, "alien": was_alien,
		"lead": lead_i, "voters": voters.size()})
