extends RefCounted

## 会议全生命周期、AI 投票决策与终结者时刻（从 sim_state.gd 拆分）。
## 只读/写传入的 s（sim_state 实例）字段，判定与数值口径 100% 保持同源。


## 2.5D nightMeetLeft（js/t2/decision.js:154）：本夜还能开几场会。
## 在消耗报告额度之前必须先问这一句。
static func night_meet_left(s) -> int:
	if s.over or not s.meeting.is_empty():
		return 0
	var cfg: Dictionary = s.cfg
	return maxi(0, int((cfg.get("rules", {}) as Dictionary).get("MEET", {})
		.get("perNight", 2)) - int(s.night_meets))


## 开一场会议。kind ∈ {pre, day, night}。
## 2.5D openMeeting 的等价实现：讨论秒数 / 投票秒数全部读 sim.json#rules.MEET，
## GDScript 里不写死秒数。pre 会**不投票**（vote_sec = 0）。
static func open_meeting_kind(s, kind: String, reporter_i: int, victim_i: int) -> bool:
	if s.over or not s.meeting.is_empty() or (bool(s.terminator_on) and kind != s.MEET_PRE):
		return false
	var cfg: Dictionary = s.cfg
	var meet_cfg: Dictionary = (cfg.get("rules", {}) as Dictionary).get("MEET", {}) as Dictionary
	if kind == s.MEET_NIGHT:
		var cap := int(meet_cfg.get("perNight", 2))
		if int(s.night_meets) >= cap:
			return false
		var reporter: Dictionary = s.agent(reporter_i)
		# 2.5D 口径：报告是有限资源（每人全局 2 次），玩家与 AI 同一额度。
		if not reporter.is_empty() and int(reporter.get("reportLeft", 0)) <= 0:
			return false
		s.night_meets += 1
		if not reporter.is_empty():
			reporter["reportLeft"] = int(reporter.get("reportLeft", 0)) - 1
		s._stat("reportsUsed", 1)
	var v: Dictionary = s.agent(victim_i)
	if kind == s.MEET_NIGHT and v.is_empty():
		return false
	# 会议**不打断任务流程**（2.5D 2026-11-02 裁定）：清掉所有人的移动路径，
	# 但保留 doing / _doing / _dur —— 否则会后玩家被判成"移动打断了维修"。
	var agents: Array = s.agents
	for a: Dictionary in agents:
		a["path"] = PackedVector2Array()
		a["pathI"] = 0
		a["moving"] = false
	# 2.5D openMeeting（js/game.js:6959）紧跟清路径之后是 `releaseAllDrags(true)`：
	# 开会时**松手所有拖拽**。
	for a3: Dictionary in agents:
		var dv: Variant = a3.get("drag", -1)
		if dv != null and int(dv) >= 0:
			s.release_drag(int(a3.get("i", -1)))
	# 2.5D openMeeting：案发地点按**尸体 / 濒死者当前身体位置**算（清场前），
	# 会议信息行要显示「报告地点」；走廊与未知区域分开标（js/game.js:6908-6911）。
	var meet_room := ""
	var meet_in_corr := false
	if not v.is_empty():
		var bp: Vector2 = v.get("bodyPos", v.get("pos", Vector2.ZERO))
		meet_room = s.room_at(bp)
		if meet_room == "" and s.nav != null and s.nav.corridor_at(bp) != null:
			meet_in_corr = true
	if kind == s.MEET_NIGHT and not v.is_empty():
		# 2.5D markBodyReported（js/t2/decision.js:149）：只记「这一夜这具尸体报过了」。
		# **濒死者（还活着）留在原地**，会后仍可拖拽/施救。
		v["bodyReported"] = true
	# @src js/game.js:6984：会议开始时清掉的是**死者尸体**（`!a.alive`），
	# 濒死者还活着、继续躺着（与上一条不矛盾：刀/枪都只把人打成濒死）。
	for a2: Dictionary in agents:
		if not bool(a2.get("alive", false)) and not bool(a2.get("bodyGone", false)):
			a2["bodyGone"] = true
	var discuss_sec := 0.0
	var vote_sec := 0.0
	match kind:
		s.MEET_DAY:
			discuss_sec = float(meet_cfg.get("discussDay", 60.0))
			vote_sec = float(meet_cfg.get("voteDay", 5.0))
		s.MEET_PRE:
			discuss_sec = float(meet_cfg.get("discussPre", 50.0))
			vote_sec = 0.0
		_:
			discuss_sec = float(meet_cfg.get("discussNight", 35.0))
			vote_sec = float(meet_cfg.get("voteNight", 5.0))
	var reveal_sec := float(meet_cfg.get("reveal", 3.0))
	s.meet_seq += 1
	s.meeting = {
		"kind": kind, "phase": "discuss", "t": discuss_sec,
		"vote_sec": vote_sec, "reveal_sec": reveal_sec,
		"reporter": reporter_i, "victim": victim_i, "votes": {}, "result": {},
		"room": meet_room, "in_corr": meet_in_corr, "seq": int(s.meet_seq),
		"discuss_sec": discuss_sec,
		"lead": {}, "testimony": [], "vouches": [], "playerClaims": [],
	}
	s._log("meeting", {"mkind": kind, "reporter": reporter_i, "victim": victim_i, "seq": int(s.meet_seq)})
	if kind == s.MEET_NIGHT:
		s._log("report", {"actor": reporter_i, "victim": victim_i})
		quick_report_sus(s, reporter_i, victim_i)
	if bool(s.speech_enabled) and s.speech != null:
		s.speech.on_meeting_open(reporter_i, victim_i, kind)
	if bool(s.speech_enabled) and s.mind != null:
		cast_early_votes(s)
	return true


## 报案太快（2.5D js/game.js:5030-5041）：夜会、死者刚倒下 ≤10 秒时，
## **先看见过这具尸体**的人类会怀疑报案人「是不是他干的」。
## 权重 0.24，reason/kind 都是 quick_report；不写 known。
static func quick_report_sus(s, reporter_i: int, victim_i: int) -> void:
	if s.mind == null or reporter_i < 0 or victim_i < 0:
		return
	var reporter: Dictionary = s.agent(reporter_i)
	var victim: Dictionary = s.agent(victim_i)
	if reporter.is_empty() or victim.is_empty():
		return
	if not bool(reporter.get("alive", false)):
		return
	var t_death := float(victim.get("downAt", victim.get("deathAt", 0.0)))
	var age := maxf(0.0, float(s.elapsed) - t_death)
	if age > 10.0:
		return
	var rules = s.rules
	for w: Dictionary in (s.agents as Array):
		if int(w.get("i", -1)) == reporter_i or bool(w.get("alien", false)) \
				or not bool(w.get("alive", false)) or bool(w.get("downed", false)):
			continue
		if not (w.get("bodySeen", {}) as Dictionary).has(victim_i):
			continue
		var qr_w: float = absf(float(rules.n("MAPPING", "quickReport", -10.0))) * float(rules.n("AXIS", "scoreMul", 0.6)) / maxf(1.0, float(rules.n("AXIS", "cap", 200.0)))
		s.mind.sus_add(w, reporter_i, qr_w, "quick_report", {"kind": "quick_report", "src": "vote"})


## 尸体观察（2.5D observeBody）：看见尸体的人类记一条「见过」。
static func note_body(s, witness_i: int, victim_i: int) -> void:
	if s.mind == null or witness_i < 0 or victim_i < 0 or witness_i == victim_i:
		return
	var w: Dictionary = s.agent(witness_i)
	var v: Dictionary = s.agent(victim_i)
	if w.is_empty() or v.is_empty() or bool(v.get("alive", false)):
		return
	s.mind.note_body_seen(w, victim_i)


## 带头追责登记（2.5D ctx.lead）：只记**第一个**带节奏的人，后来的不覆盖。
static func note_accuse(s, accuser_i: int, target_i: int) -> void:
	var meeting: Dictionary = s.meeting
	if meeting.is_empty() or accuser_i < 0 or target_i < 0 or accuser_i == target_i:
		return
	var lead: Dictionary = (meeting.get("lead", {}) as Dictionary)
	if lead.has(target_i):
		return
	lead[target_i] = accuser_i
	meeting["lead"] = lead


## 玩家（或旁观快进）可以提前结束讨论，讨论秒数仍取自真源，不写死。
static func skip_discussion(s) -> bool:
	var meeting: Dictionary = s.meeting
	if meeting.is_empty() or String(meeting.get("phase", "")) != "discuss":
		return false
	meeting["t"] = 0.0
	return true


## 「跳过投票」（2.5D #m-skip-vote，js/game.js:10898-10903）：
## 只结束剩余投票时间；**已经投给谁就保留那一票**，没投才记弃权（-1）。
## 不修改任何 AI 票，也不是第二种票。仅可行动者（活着且未濒死）能用。
static func skip_vote(s) -> bool:
	var meeting: Dictionary = s.meeting
	if meeting.is_empty() or String(meeting.get("phase", "")) != "vote":
		return false
	if bool(s.spectator):
		return false
	var me: Dictionary = s.agent(int(s.me_idx))
	if me.is_empty() or not bool(me.get("alive", false)) or bool(me.get("downed", false)):
		return false
	var votes: Dictionary = meeting.get("votes", {}) as Dictionary
	if not votes.has(int(s.me_idx)):
		votes[int(s.me_idx)] = -1
		meeting["votes"] = votes
	close_meeting(s)
	return true


static func cast_vote(s, voter_i: int, target_i: int) -> void:
	# 2.5D 2026-11-05 用户裁定：**讨论阶段就可以投，投票结束前都可以改**
	# （js/game.js:7436-7439）。m.votes 从会议开始就存在，只有 closeVote 才结算，
	# 所以早投不会提前锁定。
	var meeting: Dictionary = s.meeting
	if meeting.is_empty():
		return
	var phase := String(meeting.get("phase", ""))
	if phase != "vote" and phase != "discuss":
		return
	var v: Dictionary = s.agent(voter_i)
	if v.is_empty() or not bool(v.get("alive", false)) or bool(v.get("downed", false)):
		return
	var votes: Dictionary = meeting.get("votes", {}) as Dictionary
	var had_vote: bool = votes.has(voter_i)
	var prev_vote: int = int(votes.get(voter_i, -1))
	var tgt := target_i
	if tgt >= 0:
		var t: Dictionary = s.agent(tgt)
		if t.is_empty() or not bool(t.get("alive", false)):
			tgt = -1
	votes[voter_i] = tgt
	meeting["votes"] = votes
	# 2.5D logEvent('vote_change')（js/game.js:7398）只在**真的改票**时记，并带 from。
	# 首投不在这里记：终票由 _close_meeting 统一按 seq 落账（js/game.js:7669-7672）。
	if had_vote and prev_vote != tgt:
		s._log("vote_change", {"actor": voter_i, "from": prev_vote, "target": tgt,
			"seq": int(meeting.get("seq", 0))})


## 本场会议里该角色公开点过名的目标（2.5D：「说了却不投等于打自己脸」）。
## 只读 chat 事件的 cat/target/actor，不读阵营表。
static func public_accuse_target(s, a: Dictionary) -> int:
	var who := int(a.get("i", -1))
	var cur_seq := int((s.meeting as Dictionary).get("seq", 0))
	var events: Array = s.events
	for k in range(events.size() - 1, -1, -1):
		var e: Dictionary = events[k] as Dictionary
		if String(e.get("kind", "")) == "meeting" or (cur_seq > 0 and e.has("seq") and int(e.get("seq", 0)) != cur_seq):
			break
		var av: Variant = e.get("actor", -1)
		if not (av is int) or int(av) != who:
			continue
		var cat := String(e.get("cat", ""))
		var ev_k := String(e.get("ev", ""))
		if cat == "accuse" or cat == "known_accuse_hard" or cat == "almost" or cat == "evidence" or cat == "confront" or cat == "known_echo" or ev_k == "known_echo":
			var tv: Variant = e.get("target", -1)
			if tv is int and int(tv) >= 0:
				return int(tv)
	return -1


## 2.5D leadingAccused（js/game.js:7714）：被公开指控最多的那个人，且至少 2 人咬；
## 只有这种"声势"才值得考虑跟票。不读任何人的私有 mind，只看说出口的 accuse。
static func leading_accused(s, a: Dictionary) -> int:
	var tally: Dictionary = {}
	var self_i := int(a.get("i", -1))
	for w: Dictionary in (s.agents as Array):
		if not bool(w.get("alive", false)) or int(w.get("i", -1)) == self_i:
			continue
		var k := int(w.get("accuse", -1))
		if k < 0 or k == self_i:
			continue
		var t: Dictionary = s.agent(k)
		if t.is_empty() or not bool(t.get("alive", false)):
			continue
		tally[k] = int(tally.get(k, 0)) + 1
	var best := -1
	var bn := 0
	for k2: int in tally.keys():
		if int(tally[k2]) > bn:
			bn = int(tally[k2])
			best = k2
	return best if bn >= 2 else -1


## 2.5D WEAK_FOLLOW（js/game.js:7644）：沉默/空口/听说/领袖点名/抢先报案都不算"自己的依据"。
static func has_real_evidence(a: Dictionary, tgt: int) -> bool:
	var weak := {"silent": true, "empty_accuse": true, "heard_accuse": true,
		"heard_frame": true, "leader_order": true, "quick_report": true}
	var arr: Array = ((a.get("why", {}) as Dictionary).get(tgt, []) as Array)
	for r: Variant in arr:
		if r is Dictionary and not weak.has(String((r as Dictionary).get("kind", ""))):
			return true
	return false


static func is_almost_friend(a: Dictionary, ti: int) -> bool:
	return ((a.get("almost", {}) as Dictionary).get("friend", {}) as Dictionary).has(ti)


static func alien_pack_lead(s) -> Dictionary:
	for x: Dictionary in (s.agents as Array):
		if not bool(x.get("alien", false)) or not bool(x.get("alive", false)) or bool(x.get("downed", false)):
			continue
		var acc := int(x.get("accuse", -1))
		if acc < 0 or int(x.get("_busTarget", -1)) >= 0:
			continue
		var t: Dictionary = s.agent(acc)
		if not t.is_empty() and bool(t.get("alive", false)) and not bool(t.get("downed", false)) and t != x and not is_mate(x, acc):
			return x
	return {}


static func mate_follow_chance(s, a: Dictionary, lead: Dictionary) -> float:
	var tr: float = maxf(0.0, float(s.mind.emotion_of(a, int(lead.get("i", -1)))))
	return 1.0 if tr >= 0.25 else minf(0.9, 0.45 + 0.35 * float(s.mind.trait_c("followChance", a)))


static func weighted_hostile_target(s, a: Dictionary, pool: Array) -> int:
	if pool.is_empty():
		return -1
	var clean: Array = []
	for ti: int in pool:
		var ta: Dictionary = s.agent(ti)
		if not bool(ta.get("detained", false)):
			clean.append(ti)
	var cands: Array = clean if not clean.is_empty() else pool
	var mind = s.mind
	var cfg_id: Dictionary = mind.identity_cfg() if mind != null else {}
	var explore := float(cfg_id.get("alienExplore", 0.08))
	var pow_k := float(cfg_id.get("alienPow", 2.0))
	var is_al := bool(a.get("alien", false))
	var total := 0.0
	var pick := -1
	var rng: RandomNumberGenerator = s._rng
	for ti2: int in cands:
		var t: Dictionary = s.agent(ti2)
		if t.is_empty():
			continue
		var p: float = float(mind.hostile_prob(a, t)) if mind != null else 0.5
		var w: float = (explore + pow(p, pow_k)) if is_al else maxf(0.01, p)
		total += w
		if rng.randf() * total < w:
			pick = ti2
	return pick


static func ai_vote_target(s, a: Dictionary) -> int:
	var is_alien := bool(a.get("alien", false))
	var kh: Dictionary = a.get("knownHuman", {}) as Dictionary
	var pool: Array = []
	for t: Dictionary in (s.agents as Array):
		var ti := int(t.get("i", -1))
		if t == a or not bool(t.get("alive", false)) or bool(t.get("downed", false)):
			continue
		if (is_alien and is_mate(a, ti)) or (not is_alien and kh.has(ti)):
			continue
		pool.append(ti)
	if pool.is_empty():
		return -1
	var speech_enabled := bool(s.speech_enabled)
	var mind = s.mind
	var rules = s.rules
	var rng: RandomNumberGenerator = s._rng
	if speech_enabled and mind != null:
		if not is_alien:
			var bk: Dictionary = mind.best_known_target(a)
			var ki := int(bk.get("i", -1))
			if ki >= 0 and pool.has(ki) and not is_mate(a, ki):
				return ki
		var emo: Dictionary = mind.best_grudge(a)
		var ei := int(emo.get("i", -1))
		if ei >= 0 and pool.has(ei) and float(emo.get("score", 0.0)) >= 0.6 and rng.randf() < float(mind.trait_c("voteGrudgePull", a)) / 10.0:
			s._stat("grudgeVotes", 1)
			return ei
	if is_alien:
		if speech_enabled and mind != null:
			var pack_lead: Dictionary = alien_pack_lead(s)
			var pt_i := int(pack_lead.get("accuse", -1))
			if pt_i >= 0 and pack_lead != a and is_mate(a, int(pack_lead.get("i", -1))) and pool.has(pt_i) and not mind.is_patron(a, pt_i) and rng.randf() < mate_follow_chance(s, a, pack_lead):
				s._stat("mateFollowVotes", 1)
				return pt_i
		var my_acc := int(a.get("accuse", -1))
		if my_acc >= 0 and pool.has(my_acc) and (mind == null or not mind.is_patron(a, my_acc)):
			return my_acc
		if speech_enabled and mind != null:
			var hot: int = soft_hot_target(s, a)
			if hot >= 0 and pool.has(hot) and not mind.is_patron(a, hot) and rng.randf() < float(mind.trait_c("pileOn", a)):
				s._stat("alienPileOns", 1)
				return hot
		return weighted_hostile_target(s, a, pool)
	if speech_enabled and mind != null:
		var pub_target := int(a.get("accuse", -1)) if int(a.get("accuse", -1)) >= 0 else public_accuse_target(s, a)
		if pub_target >= 0 and pool.has(pub_target) and not mind.is_patron(a, pub_target):
			return pub_target
		if rules != null and rules.b("ALMOST", "foeVoteTier", false):
			var ba: Dictionary = mind.best_almost_target(a)
			var ami := int(ba.get("i", -1))
			if ami >= 0 and pool.has(ami) and not mind.is_patron(a, ami) and not is_almost_friend(a, ami):
				return ami
		var hspread: Dictionary = mind.hypothesis_spread(a)
		if bool(hspread.get("competing", false)):
			return -1
		var bs_d: Dictionary = mind.best_sus_target(a, 0.5)
		var bsi := int(bs_d.get("i", -1))
		if bsi >= 0 and pool.has(bsi) and not mind.is_patron(a, bsi) and not is_almost_friend(a, bsi):
			return bsi
		if rng.randf() < float(mind.trait_c("voteAbstain", a)):
			return -1
		var lead: int = leading_accused(s, a)
		if lead >= 0 and pool.has(lead) and not mind.is_patron(a, lead) and not is_almost_friend(a, lead):
			var pack := 0
			for x: Dictionary in (s.agents as Array):
				if bool(x.get("alive", false)) and int(x.get("accuse", -1)) == lead:
					pack += 1
			var need := 0.10 if pack >= 2 else 0.18
			var grudge: float = maxf(maxf(0.0, -float(mind.emotion_of(a, lead))), float((a.get("grudge", {}) as Dictionary).get(lead, 0.0)))
			if (float(mind.sus_of(a, lead)) >= need and (need >= 0.18 or has_real_evidence(a, lead))) or grudge >= 0.4:
				return lead
		var bs2_d: Dictionary = mind.best_sus_target(a, float(mind.trait_c("shootSus", a)) * 0.9)
		var bs2i := int(bs2_d.get("i", -1))
		if bs2i >= 0 and pool.has(bs2i) and not mind.is_patron(a, bs2i) and not is_almost_friend(a, bs2i):
			return bs2i
		return -1
	var sus: Dictionary = a.get("suspect", {}) as Dictionary
	var best2 := -1
	var bs2v := 0
	for k: int in sus.keys():
		if pool.has(int(k)) and int(sus[k]) > bs2v:
			bs2v = int(sus[k])
			best2 = int(k)
	return best2 if best2 >= 0 else int(pool[rng.randi_range(0, pool.size() - 1)])


static func vote_lean(s, a: Dictionary) -> Dictionary:
	var mind = s.mind
	if mind == null:
		return {"v": -1, "s": 0.0, "why": "none"}
	var is_al := bool(a.get("alien", false))
	var kh: Dictionary = a.get("knownHuman", {}) as Dictionary
	var bk: Dictionary = mind.best_known_target(a)
	var ki := int(bk.get("i", -1))
	if ki >= 0 and not is_mate(a, ki):
		return {"v": ki, "s": 3.0, "why": "known"}
	var ba: Dictionary = mind.best_almost_target(a)
	var afi := int(ba.get("i", -1))
	if afi >= 0 and not mind.is_patron(a, afi) and not is_almost_friend(a, afi) and not (is_al and is_mate(a, afi)) and (is_al or not kh.has(afi)):
		return {"v": afi, "s": 2.5, "why": "almost"}
	var hs: Dictionary = mind.hypothesis_spread(a)
	if bool(hs.get("competing", false)):
		return {"v": -1, "s": 0.0, "why": "competing"}
	var bs: Dictionary = mind.best_sus_target(a, 0.55)
	var bsi := int(bs.get("i", -1))
	if bsi >= 0 and not mind.is_patron(a, bsi) and not is_almost_friend(a, bsi) and not (is_al and is_mate(a, bsi)) and (is_al or not kh.has(bsi)):
		return {"v": bsi, "s": 1.0, "why": "sus"}
	return {"v": -1, "s": 0.0, "why": "none"}


## 手里有确证 / 准-确证的人，会议一开始就把票压上（js/game.js:6967）。
## 这是「可改票」的另一半：先投，才有「听完改票」这回事。
static func cast_early_votes(s) -> int:
	var meeting: Dictionary = s.meeting
	if meeting.is_empty() or float(meeting.get("vote_sec", 0.0)) <= 0.0:
		return 0
	var meta: Dictionary = (meeting.get("voteMeta", {}) as Dictionary).duplicate()
	var n := 0
	for a: Dictionary in (s.agents as Array):
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		if int(a.get("i", -1)) == int(s.me_idx) and not bool(s.spectator):
			continue
		var lean: Dictionary = vote_lean(s, a)
		if float(lean.get("s", 0.0)) < 2.0:
			continue
		var vi := int(a.get("i", -1))
		cast_vote(s, vi, int(lean.get("v", -1)))
		meta[vi] = {"v": int(lean.get("v", -1)), "s": float(lean.get("s", 0.0)),
			"why": String(lean.get("why", "")), "chg": 0, "early": 1,
			"rev": int(a.get("rev", 0)), "t": float(meeting.get("t", 0.0))}
		n += 1
	meeting["voteMeta"] = meta
	meeting["earlyVotes"] = n
	s._stat("earlyVotes", n)
	return n


static func vote_pressure(s, a: Dictionary, tgt: int) -> float:
	var mind = s.mind
	if tgt < 0 or mind == null:
		return 0.0
	var p := 0.0
	for w: Dictionary in (s.agents as Array):
		if int(w.get("i", -1)) == int(a.get("i", -1)):
			continue
		if not bool(w.get("alive", false)) or bool(w.get("downed", false)):
			continue
		if public_accuse_target(s, w) != tgt:
			continue
		p += 0.10 * clampf(float(mind.cred_of(a, int(w.get("i", -1)))), 0.5, 1.0)
	var meeting: Dictionary = s.meeting
	var rel: Dictionary = mind.statement_relation(
		meeting.get("testimony", []) as Array, meeting.get("vouches", []) as Array, tgt)
	var damp := float(rel.get("damp", 1.0))
	if damp < 1.0:
		s._stat("statementDamp", 1)
	return minf(0.30, p * damp)


static func best_vote_target(s, a: Dictionary) -> Dictionary:
	var best := -1
	var bs := -1.0
	var is_al := bool(a.get("alien", false))
	var kh: Dictionary = a.get("knownHuman", {}) as Dictionary
	var mind = s.mind
	for t: Dictionary in (s.agents as Array):
		var ti := int(t.get("i", -1))
		if ti == int(a.get("i", -1)) or not bool(t.get("alive", false)) or bool(t.get("downed", false)):
			continue
		if is_al and is_mate(a, ti):
			continue
		if not is_al and kh.has(ti):
			continue
		if mind != null and mind.is_patron(a, ti):
			continue
		var score: float = float(mind.sus_of(a, ti)) + vote_pressure(s, a, ti)
		if is_almost_friend(a, ti):
			score *= 0.5
		if score > bs:
			bs = score
			best = ti
	if best < 0:
		return {"v": -1, "s": 0.0, "why": "none"}
	return {"v": best, "s": bs, "why": "score"}


## 听进新证词后改票（js/game.js:7411）：确信不松绑；公开声势要盖过原判断 0.10，
## 再按「我对说话人有多信」掷一次（0.35 + 0.34 × cred）。
static func reconsider_votes(s, by_id: int) -> int:
	var meeting: Dictionary = s.meeting
	if meeting.is_empty() or String(meeting.get("phase", "")) != "discuss":
		return 0
	var mind = s.mind
	if mind == null or not meeting.has("voteMeta"):
		return 0
	var meta: Dictionary = (meeting.get("voteMeta", {}) as Dictionary).duplicate()
	var sp: Dictionary = s.agent(by_id)
	var changed := 0
	var rng: RandomNumberGenerator = s._rng
	for a: Dictionary in (s.agents as Array):
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		var vi := int(a.get("i", -1))
		if vi == int(s.me_idx) and not bool(s.spectator):
			continue
		if not meta.has(vi):
			continue
		var mm: Dictionary = meta[vi] as Dictionary
		if String(mm.get("why", "")) == "known":
			continue
		var lean: Dictionary = best_vote_target(s, a)
		var lv := int(lean.get("v", -1))
		if lv < 0 or lv == int(mm.get("v", -1)):
			continue
		var now := float(lean.get("s", 0.0))
		var old_v := int(mm.get("v", -1))
		var old: float = (float(mind.sus_of(a, old_v)) + vote_pressure(s, a, old_v)) if old_v >= 0 else 0.0
		if now <= old + 0.10:
			continue
		var cred: float = float(mind.cred_of(a, by_id)) if not sp.is_empty() else 0.5
		if rng.randf() > 0.35 + 0.34 * clampf(cred, 0.0, 1.0):
			continue
		cast_vote(s, vi, lv)
		meta[vi] = {"v": lv, "s": now, "why": String(lean.get("why", "")),
			"chg": int(mm.get("chg", 0)) + 1, "early": mm.get("early", 0),
			"rev": int(a.get("rev", 0)), "t": float(meeting.get("t", 0.0))}
		changed += 1
		s._stat("voteChanges", 1)
	meeting["voteMeta"] = meta
	return changed


## 投票后置护盾：嘴上背书互斥、cred 信任护盾、准朋友护盾。
static func apply_vote_shields(s) -> void:
	var meeting: Dictionary = s.meeting
	var votes: Dictionary = meeting.get("votes", {}) as Dictionary
	var mind = s.mind
	var rules = s.rules
	var use_social := bool(s.speech_enabled) and mind != null
	var shield: float = float(rules.n("ALMOST", "friendVoteShield", 0.45)) if rules != null else 0.45
	var rng: RandomNumberGenerator = s._rng
	for a: Dictionary in (s.agents as Array):
		var ai := int(a.get("i", -1))
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)) or (ai == int(s.me_idx) and not bool(s.spectator)):
			continue
		var v := int(votes.get(ai, -1))
		if v < 0:
			continue
		if (a.get("_sup", {}) as Dictionary).has(v):
			votes[ai] = -1
			s._stat("stanceBlocks", 1)
			s._stat("abstains", 1)
			continue
		if not use_social or bool(a.get("alien", false)) or (a.get("known", {}) as Dictionary).has(v):
			continue
		var cr: float = float(mind.cred_of(a, v))
		if cr > 0.0 and rng.randf() < float(mind.cred_vote_shield(cr)):
			votes[ai] = -1
			s._stat("credShieldVotes", 1)
			s._stat("abstains", 1)
			continue
		if ((a.get("almost", {}) as Dictionary).get("foe", {}) as Dictionary).has(v):
			s._stat("almostVotes", 1)
		elif is_almost_friend(a, v) and rng.randf() < shield:
			votes[ai] = -1
			s._stat("friendShield", 1)
	meeting["votes"] = votes


## 软热靶（2.5D alienSocialPick 的公开指控口径）：
## 数"没有确证的公开指控者"，最多人的那个为目标；跳过自己的认出队友。
static func soft_hot_target(s, a: Dictionary) -> int:
	var heat: Dictionary = {}
	for w: Dictionary in (s.agents as Array):
		if not bool(w.get("alive", false)) or bool(w.get("downed", false)):
			continue
		var acc := int(w.get("accuse", -1))
		if acc < 0 or int(w.get("i", -1)) == int(a.get("i", -1)):
			continue
		# 软指控：指控者自己没有对该目标的确证
		if (w.get("known", {}) as Dictionary).has(acc):
			continue
		heat[acc] = int(heat.get(acc, 0)) + 1
	var best := -1
	var bn := 0
	for k: int in heat.keys():
		if int(heat[k]) > bn and not is_mate(a, k):
			bn = int(heat[k])
			best = int(k)
	var ld = s.lines_data
	var hot_min := int((ld.data.get("rules", {}) as Dictionary) \
		.get("SOCIAL", {}).get("hotMin", 1))
	return best if bn >= hot_min else -1


## 异形是否已认出对方是队友（只用亲眼目击推断的 mates，不读系统阵营表）
static func is_mate(a: Dictionary, other_i: int) -> bool:
	return (a.get("mates", {}) as Dictionary).has(other_i)


static func tick_meeting(s, dt: float) -> void:
	var meeting: Dictionary = s.meeting
	if String(meeting.get("phase", "")) == "discuss" and bool(s.speech_enabled) and s.speech != null:
		s.speech.tick(dt)
	meeting["t"] = float(meeting.get("t", 0.0)) - dt
	if float(meeting.get("t", 0.0)) > 0.0:
		return
	var phase := String(meeting.get("phase", ""))
	var kind := String(meeting.get("kind", s.MEET_NIGHT))
	if phase == "discuss":
		s._log("meeting_overtime", {"left": 0})
		if float(meeting.get("vote_sec", 0.0)) <= 0.0:
			s.meeting = {}
			after_meeting(s, kind)
			return
		if bool(s.speech_enabled) and s.speech != null:
			s.speech.flush_pending_testimonies()
		meeting["phase"] = "vote"
		meeting["t"] = float(meeting.get("vote_sec", 5.0))
		if bool(s.ai_enabled):
			s._cast_ai_votes()
	elif phase == "vote":
		close_meeting(s)
		if (s.meeting as Dictionary).is_empty():
			return
	else:
		s.meeting = {}
		after_meeting(s, kind)
		s.check_win()


## 会议结束后的分流（2.5D finishMeeting 的等价物）：
##   pre  → 开第 1 夜（夜数不 +1）
##   day  → 开下一夜（夜数 +1）
##   night→ 回到夜晚剩余时间继续（会议期间夜晚时钟暂停）
static func after_meeting(s, kind: String) -> void:
	match kind:
		s.MEET_PRE:
			s._start_night(false)
		s.MEET_DAY:
			s._start_night(true)
		_:
			# night 会：夜晚时钟本就暂停（MEET.pauseClock），t 不变，直接继续。
			pass
	s.check_win()


static func close_meeting(s) -> void:
	var meeting: Dictionary = s.meeting
	var votes: Dictionary = meeting.get("votes", {}) as Dictionary
	for vk0: int in votes.keys():
		var tv := int(votes[vk0])
		if tv >= 0:
			var va: Dictionary = s.agent(vk0)
			if not va.is_empty() and not bool(va.get("alien", false)) \
					and (va.get("knownHuman", {}) as Dictionary).has(tv):
				votes[vk0] = -1
				s._stat("knownHumanBlockVotes", 1)
	meeting["votes"] = votes
	var mseq := int(meeting.get("seq", 0))
	for vk: int in votes.keys():
		s._log("vote", {"actor": vk, "target": int(votes[vk]), "seq": mseq})
	var tally: Dictionary = {}
	for k: int in votes.keys():
		var tgt := int(votes[k])
		if tgt < 0:
			continue
		tally[tgt] = int(tally.get(tgt, 0)) + 1
	var top := -1
	var tn := 0
	var tie := false
	for k: int in tally.keys():
		var c := int(tally[k])
		if c > tn:
			tn = c
			top = int(k)
			tie = false
		elif c == tn:
			tie = true
	# 2.5D 判定：唯一最高票 且 达到 VOTE.need / lateNeed（按可投票人数切换）才驱逐。
	var cfg: Dictionary = s.cfg
	var vcfg: Dictionary = (cfg.get("rules", {}) as Dictionary).get("VOTE", {}) as Dictionary
	var voters := 0
	for a: Dictionary in (s.agents as Array):
		if bool(a.get("alive", false)) and not bool(a.get("downed", false)):
			voters += 1
	var need := int(vcfg.get("need", 4))
	if voters <= int(vcfg.get("lateAt", 7)):
		need = int(vcfg.get("lateNeed", 3))
	var ejected_ok: bool = top >= 0 and tn >= need and not tie
	# 2.5D closeVote（js/game.js:7673-7679）：DEV 玩家被投出去时「驱逐无效」，
	# 结果里带 devSaved，结算页/会议结果必须写明，不能假装无人出局。
	var dev_saved: bool = ejected_ok and bool(s.dev) and not bool(s.spectator) and top == int(s.me_idx)
	if dev_saved:
		s._dev_note("DEV 无敌：驱逐无效（%d 票）" % tn)
	if ejected_ok and not dev_saved:
		var t: Dictionary = s.agent(top)
		if not t.is_empty():
			t["alive"] = false
			t["downed"] = false
			t["deathCause"] = "vote"
			t["bodyGone"] = true
			s._log("eject", {"actor": top, "alien": bool(t.get("alien", false)),
				"votes": int(tally.get(top, 0))})
			# 追责：结果公布后清算带节奏的人（必须在身份已定之后）
			# 2.5D settleAccountability（js/game.js:1529）。
			if bool(s.speech_enabled) and s.mind != null:
				var lead_map: Dictionary = (meeting.get("lead", {}) as Dictionary)
				var lead := int(lead_map.get(top, -1))
				s.mind.settle_accountability(top, votes, lead)
	var matrix: Dictionary = (meeting.get("votes", {}) as Dictionary).duplicate()
	var top_agent: Dictionary = s.agent(top)
	meeting["result"] = {
		"ejected": (top if ejected_ok and not dev_saved else -1),
		"name": (top_agent.get("name", "") if ejected_ok else ""),
		"alien": (bool(top_agent.get("alien", false)) if ejected_ok else false),
		"votes": tally.duplicate(), "matrix": matrix,
		"need": need, "max": tn, "tie": tie, "voters": voters,
		"devSaved": dev_saved,
	}
	meeting["phase"] = "result"
	meeting["t"] = float(meeting.get("reveal_sec", 3.0))
	s.check_win()
	if bool(s.over):
		# 胜负已定：不让 3 秒身份公布把结算面板卡在后面
		s.meeting = {}


## ---- B6′：报账（account）----
## 会议开场每个人报自己这一夜做了什么；是 S 轨口供的"账目"入口。
static func log_account(s, agent_i: int) -> void:
	var a: Dictionary = s.agent(agent_i)
	if a.is_empty():
		return
	s._log("account", {"actor": agent_i, "tasks": int(a.get("tIdx", 0)),
		"room": s.room_at(a.get("pos", Vector2.ZERO))})


## ---- B6′：终结者（第 TERMINATOR.night 夜起全场身份公开 + 活人子弹补到 bullets）----
static func reveal_all_identities(s) -> void:
	var agents: Array = s.agents
	var mind = s.mind
	var now_t: float = float(s.night_len()) - maxf(0.0, float(s.t))
	for a: Dictionary in agents:
		if not bool(a.get("alive", false)):
			continue
		var known: Dictionary = (a.get("known", {}) as Dictionary).duplicate()
		var known_human: Dictionary = (a.get("knownHuman", {}) as Dictionary).duplicate()
		for dk: String in ["sus", "why", "cred", "credWhy", "T", "redSeen", "accuseWhy"]:
			a[dk] = {}
		a["almost"] = {"foe": {}, "friend": {}}
		a["suspect"] = -1
		a["accuse"] = -1
		var a_alien := bool(a.get("alien", false))
		var mates: Dictionary = (a.get("mates", {}) as Dictionary).duplicate()
		for t_agent: Dictionary in agents:
			if t_agent == a:
				continue
			var ti := int(t_agent.get("i", -1))
			var t_alien := bool(t_agent.get("alien", false))
			var rec := {"kind": "terminator", "room": "", "t": now_t, "reason": "身份公开", "public": true}
			if a_alien and t_alien:
				if not mates.has(ti):
					mates[ti] = {"t": now_t}
			elif bool(t_agent.get("alive", false)):
				if not a_alien and t_alien:
					known[ti] = rec
					if mind != null:
						mind.trust_cert(a, ti, true)
				else:
					known_human[ti] = rec
					if mind != null:
						mind.trust_cert(a, ti, false)
		a["known"] = known
		a["knownHuman"] = known_human
		if a_alien:
			a["mates"] = mates


static func check_terminator(s) -> void:
	var tc: Dictionary = s.rules.t("TERMINATOR") if s.rules != null else {}
	var term_night := int(tc.get("night", 10))
	var bullets := int(tc.get("bullets", 1))
	var rev := bool(tc.get("reveal", true))
	if bool(s.terminator_on) or int(s.night) < term_night:
		return
	s.terminator_on = true
	s.reveal_all = rev
	var armed := 0
	for a: Dictionary in (s.agents as Array):
		if not bool(a.get("alive", false)):
			continue
		var want := bullets + 1 if bool(a.get("alien", false)) else bullets
		if int(a.get("bullet", 0)) < want:
			a["bullet"] = want
			armed += 1
	if bool(s.reveal_all):
		reveal_all_identities(s)
	s._log("terminator", {"night": int(s.night), "bullets": bullets, "armed": armed, "reveal": bool(s.reveal_all)})
