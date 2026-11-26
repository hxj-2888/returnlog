extends RefCounted
## 会议发言调度（S 轨，对应 2.5D startChatter / buildMeetCtx / playerTalk / parseSpeech）。

const SpeechDeception := preload("res://scripts/sim/speech_deception.gd")
const SpeechPlayer := preload("res://scripts/sim/speech_player.gd")
const SPEAK_CATS := ["identity", "accuse", "defend", "evidence", "ask", "call"]

var sim
var lines
var mind
var enabled := false
var feed: Array = []              # 发言流：UI 只读
var line_used: Dictionary = {}    # 整局模板降权 1/(1+3n)
var meet_used: Dictionary = {}    # 同场同人硬去重
var cands: Array = []             # 按 talkScore 排好的席位
var agenda: Array = []            # [{t, i, cat, ctx, target, kind}]
var leader_i := -1                # 本局领袖（-1 = 无）
var leader_charisma := 0.0        # 号召力（LEADER.bands 重尾抽样）
var orders_left := 0              # 本场会议剩余指令数
var meeting_feed_start: int = 0
var _t := 0.0
var _alien_lines := 0
var _last_who := -1
var _streak := 0
var _hard_lines := 0
var _alibi_callouts := 0
var _accuse_lines := 0


func _when_word() -> String:
	return lines.when_word(String(sim.meeting.get("kind", "")) == "day")


func setup(p_sim, p_lines, p_mind) -> void:
	sim = p_sim
	lines = p_lines
	mind = p_mind
	enabled = lines != null and mind != null and not lines.pools.is_empty()


func _rname(rid: String) -> String:
	if rid == "" or rid == "corridor" or rid == "unknown":
		return "走廊"
	return sim.room_name(rid)


func _r(sec: String, key: String, fallback: float = 0.0) -> float:
	if sim != null and sim.rules != null:
		return sim.rules.n(sec, key, fallback)
	return fallback


func _d(key: String, fallback: float = 0.0) -> float:
	## pickLine / startChatter / sayStreakOK 的调度系数（rules.json#dispatch）
	if sim != null and sim.rules != null:
		return sim.rules.disp(key, fallback)
	return fallback


func clear_game() -> void:
	line_used.clear()
	meet_used.clear()
	feed.clear()
	agenda.clear()
	cands.clear()
	_t = 0.0
	leader_i = -1
	leader_charisma = 0.0


## 领袖_roll（2.5D newGame:252）：每局 LEADER.chance 抽领袖，号召力按重尾四档抽样。
func roll_leader() -> void:
	SpeechDeception.roll_leader(self)


## 构陷编排（2.5D planAlienDeception，js/game.js:5759）：反咬 / FRAME 构陷 / COFRAME 协同诬陷。
func plan_alien_deception(kind: String, victim_i: int) -> Dictionary:
	return SpeechDeception.plan_alien_deception(self, kind, victim_i)


## 大义灭亲（2.5D planMateBus，js/game.js:6001）：
## MISLEAD.busChance 0.20 / 会议：异形指控一个**已认出的队友**换取听众信任。
## 只用 mates（亲眼确认），绝不写 known；听众只限人类。
func plan_mate_bus(deception: Dictionary) -> void:
	SpeechDeception.plan_mate_bus(self, deception)


## 领袖指令（2.5D scheduleLeaderOrders）：下 1~2 条安排，听众 warm +0.06。
func schedule_leader_orders(kind: String) -> void:
	SpeechDeception.schedule_leader_orders(self, kind)


## 服从预估（2.5D aiHuman 的服从判据同一套）：obeyP = 号召力 × (cred(领袖)/trustObeyGate)
func _will_obey(tgt: Dictionary, rid: String) -> bool:
	return SpeechDeception._will_obey(self, tgt, rid)


## 说谎者声称的房间与听众目击记忆对不上 → 返回对不上的房间（拆谎）
## 2.5D checkAlibi 量词：窗口内**有一条对得上就不算说谎**；没记录（checked=0）闭嘴。
func _alibi_caught(listener: Dictionary, liar: int, claim_room: String) -> String:
	return SpeechDeception.alibi_caught(self, listener, liar, claim_room)


## 人类互相辩护（2.5D decideHumanDefend）：替被普通指控的人类开口，被保者 +0.45 情绪信任。
func decide_human_defend() -> Dictionary:
	if not enabled or mind == null:
		return {}
	for a0: Dictionary in sim.agents:
		var acc := int(a0.get("accuse", -1))
		if acc < 0 or bool(a0.get("alien", false)):
			continue
		var tgt: Dictionary = sim.agent(acc)
		if tgt.is_empty() or not bool(tgt.get("alive", false)) or bool(tgt.get("downed", false)):
			continue
		var pool: Array = []
		for x: Dictionary in sim.agents:
			if bool(x.get("alien", false)) or x == a0 or int(x.get("i", -1)) == acc:
				continue
			if not bool(x.get("alive", false)) or bool(x.get("downed", false)):
				continue
			if (x.get("known", {}) as Dictionary).has(acc):
				continue
			if ((x.get("almost", {}) as Dictionary).get("foe", {}) as Dictionary).has(acc):
				continue
			if int(x.get("accuse", -1)) == acc or (x.get("_sup", {}) as Dictionary).has(acc):
				continue
			pool.append(x)
		if pool.is_empty():
			continue
		var defender: Dictionary = pool[sim._rng.randi_range(0, pool.size() - 1)]
		var soc: float = float((defender.get("trait", {}) as Dictionary).get("soc", 50))
		var aggr: float = float((defender.get("trait", {}) as Dictionary).get("aggr", 50))
		var b_soc := (soc - 50.0) / 50.0 * 0.45
		var b_aggr := (aggr - 50.0) / 50.0 * 0.45
		var defend_p: float = minf(0.92, 0.55 + 0.30 * b_soc + 0.10 * b_aggr)
		if sim._rng.randf() > defend_p:
			continue
		sim._stat("humanDefends", 1)
		var by_i := int(defender.get("i", -1))
		mind.trust_add(tgt, by_i, 0.45)
		var sup_m: Dictionary = (defender.get("_sup", {}) as Dictionary).duplicate()
		sup_m[acc] = true
		defender["_sup"] = sup_m
		var dl: Dictionary = sim.meeting.get("defenseLog", {}) as Dictionary
		var rec: Dictionary = dl.get(by_i, {}) as Dictionary
		rec[acc] = {"night": int(sim.night)}
		dl[by_i] = rec
		sim.meeting["defenseLog"] = dl
		var ally: Dictionary = (defender.get("ally", {}) as Dictionary).duplicate()
		ally[acc] = minf(float(sim.rules.n("META", "noteCap", 3.0)),
			float(ally.get(acc, 0.0)) + 1.0)
		defender["ally"] = ally
		var tname := String(tgt.get("name", "他"))
		var drn := _rname(sim.room_at(defender.get("pos", Vector2.ZERO)))
		_emit_raw(by_i, "我不觉得%s有问题，我%s在%s，别急着定罪。" % [tname, _when_word(), drn])
		return {"by": by_i, "target": acc}
	return {}


## 裸台词（只进发言流与事件，不走 note_testimony）
func _emit_raw(speaker_i: int, text: String) -> void:
	var a: Dictionary = sim.agent(speaker_i)
	if a.is_empty() or text == "":
		return
	feed.append({"who": String(a.get("name", "?")), "text": text, "cat": "frame",
		"sys": false, "me": false, "alien": bool(a.get("alien", false)),
		"target": -1, "kind": "frame"})
	sim._log("chat", {"actor": speaker_i, "text": text, "cat": "frame", "ev": "frame"})


## 当众背书（2.5D pushEndorse）：写入 _sup 与 meeting["vouches"] 供投票互斥检查。
func push_endorse(kind: String) -> void:
	if kind == "pre" or not enabled or mind == null:
		return
	for a: Dictionary in sim.agents:
		if bool(a.get("alien", false)) or not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		var ai := int(a.get("i", -1))
		var known: Dictionary = a.get("known", {}) as Dictionary
		var sup: Dictionary = a.get("_sup", {}) as Dictionary
		var cred: Dictionary = a.get("cred", {}) as Dictionary
		for k: int in cred.keys():
			if float(cred[k]) < mind.trust_endorse_at():
				continue
			if known.has(k) or int(a.get("accuse", -1)) == k or sup.has(k):
				continue
			var t: Dictionary = sim.agent(k)
			if t.is_empty() or not bool(t.get("alive", false)) or bool(t.get("downed", false)):
				continue
			var sup2: Dictionary = sup.duplicate()
			sup2[k] = true
			a["_sup"] = sup2
			var tname := String(t.get("name", "他"))
			_emit_raw(ai, "我信得过%s，%s一直在干正经事。" % [tname, tname])
			if not sim.meeting.is_empty():
				var vouches: Array = (sim.meeting.get("vouches", []) as Array).duplicate()
				vouches.append({"by": ai, "tgt": k})
				sim.meeting["vouches"] = vouches
			sim._stat("endorses", 1)
			for l: Dictionary in sim.agents:
				if int(l.get("i", -1)) == ai or not bool(l.get("alive", false)) or bool(l.get("downed", false)):
					continue
				mind.warm_add(l, k, sim.rules.n("WARM", "defended", 0.12))
			return


## 2.5D causeName（js/game.js:389）：死因 → 播报用语。
func _cause_name(c: String) -> String:
	match c:
		"knife": return "刀伤"
		"shot": return "枪伤"
		"bled": return "失血过多"
		"vote": return "被驱逐出舱"
	return "未知"


## 2.5D bodyWound（js/game.js:2091）：尸体/伤员的伤情描述。
## 3D 没有 woundCause 字段（濒死原因没落库），所以活着的濒死者统一走「重伤」档；
## 这一档在真源里本来就存在，不是自造文案。
func _wound_text(b: Dictionary) -> String:
	if b.is_empty():
		return "未知"
	if bool(b.get("alive", false)) and bool(b.get("downed", false)):
		return "重伤 · 仍在渗血"
	if not bool(b.get("alive", false)):
		return _cause_name(String(b.get("deathCause", "")))
	return "无伤"


## 2.5D victimInfo（js/game.js:5000）：报案播报与开场台词共用的受害者视图。
func _victim_info(victim_i: int) -> Dictionary:
	if victim_i < 0 or victim_i >= sim.agents.size():
		return {}
	var v: Dictionary = sim.agent(victim_i)
	if v.is_empty():
		return {}
	var bp: Vector2 = v.get("bodyPos", v.get("pos", Vector2.ZERO))
	var rid := String(v.get("deathRoom", ""))
	if rid == "":
		rid = sim.room_at(bp)
	return {"i": victim_i, "name": String(v.get("name", "")),
		"room": _rname(rid), "dead": not bool(v.get("alive", false)),
		"cause": _wound_text(v).replace(" · 仍在渗血", ""),
		"moved": bool(v.get("bodyMoved", false)),
		"searched": bool(v.get("searched", false))}


## 2.5D openingLine（js/game.js:5625）：报案句 / 无死亡句走语料池，
## 末尾按尸体状态补「尸体被移动过」「我已经检查过伤口」。
func _opening_line(speaker_i: int, vi: Dictionary, kind: String) -> String:
	var a: Dictionary = sim.agent(speaker_i)
	if a.is_empty():
		return ""
	var cat := "open_body_dead" if bool(vi.get("dead", false)) else "open_body_alive"
	if vi.is_empty():
		cat = "open_nobody" if kind == "day" else "open_nobody_night"
	var tpl := _pick(cat, speaker_i)
	if tpl == "":
		return ""
	line_used[tpl] = int(line_used.get(tpl, 0)) + 1
	var mine: Dictionary = (meet_used.get(speaker_i, {}) as Dictionary).duplicate()
	mine[tpl] = true
	meet_used[speaker_i] = mine
	var ctx := {"r": String(vi.get("room", "")), "t": String(vi.get("name", "")),
		"k": String(vi.get("cause", "")), "when": lines.when_word(kind == "day")}
	var out: String = lines.fill(tpl, a, ctx, sim._rng)
	if not vi.is_empty():
		if bool(vi.get("moved", false)):
			out += " 尸体被移动过。"
		if bool(vi.get("searched", false)):
			out += " 我已经检查过伤口。"
	return out


## 2.5D openMeeting 开场播报（报案人台词 / 玩家报案系统播报 / 无死亡播报）。
func _opening_broadcast(reporter_i: int, victim_i: int, kind: String) -> void:
	var vi := _victim_info(victim_i)
	var has_rep: bool = reporter_i >= 0 and reporter_i < int(sim.agents.size())
	var rep: Dictionary = sim.agent(reporter_i) if has_rep else {}
	var rep_ok: bool = has_rep and bool(rep.get("alive", false)) \
		and not bool(rep.get("downed", false))
	if rep_ok and reporter_i != int(sim.me_idx):
		var line: String = _opening_line(reporter_i, vi, kind)
		if line != "":
			_emit(reporter_i, "open", {}, -1, "open", line)
		return
	if vi.is_empty():
		if kind == "pre":
			sys_say("系统", "航行简报：全员核对任务分工，讨论结束后进入第 1 夜。")
		elif kind == "day":
			sys_say("系统", "天亮了，全员回中央会议室集合。")
		else:
			sys_say("系统", "没有尸体，但有人按下了会议铃。")
		return
	var who: String = "在" + String(vi.get("room", "")) + "发现" + String(vi.get("name", ""))
	if reporter_i == int(sim.me_idx) and not bool(sim.spectator):
		who = String(rep.get("name", "我")) + " " + who
	var tail := "，人已经没了。" if bool(vi.get("dead", false)) \
		else "，还有呼吸——先救人，但动手的人就在我们中间。"
	sys_say("系统", who + "，" + String(vi.get("cause", "")) + tail)


## 先发制人（2.5D FIRST）：按 FIRST.chance 抢先定调，与 plan_alien_deception 互斥。
func plan_first_accusation(kind: String) -> void:
	SpeechDeception.plan_first_accusation(self, kind)


## 2.5D alibiOf 的 roomId 口径：异形本夜作案 → 用编造的房间；否则用真实所在。
func _claimed_room(a: Dictionary) -> String:
	var lie: Dictionary = a.get("_lie", {}) as Dictionary
	if not lie.is_empty() and String(lie.get("roomId", "")) != "":
		return String(lie["roomId"])
	return sim.room_at(a.get("pos", Vector2.ZERO))


func _is_mate(a: Dictionary, other_i: int) -> bool:
	return (a.get("mates", {}) as Dictionary).has(other_i)


## 会议开场：排发言权、建排期。讨论时长从 MEET.discussNight 读，不写死。
## kind ∈ {pre, day, night}：2.5D openMeeting 的三种会议。
func on_meeting_open(reporter_i: int, victim_i: int, kind: String = "night") -> void:
	if not enabled:
		return
	meeting_feed_start = feed.size()
	_alibi_callouts = 0
	meet_used.clear()
	# 异形假口供（2.5D buildMeetCtx:5128）：仅本夜动过手才编，65% 说真舱室。
	var used_rooms: Dictionary = {}
	for a: Dictionary in sim.agents:
		if not bool(a.get("alien", false)) or not bool(a.get("alive", false)) or float(a.get("_killAt", 0.0)) <= 0.0:
			a["_lie"] = {}
			continue
		var here: String = sim.room_at(a.get("pos", Vector2.ZERO))
		var pick := ""
		if here != "" and not used_rooms.has(here) and sim._rng.randf() < 0.65:
			pick = here
		else:
			var pool: Array = []
			for r: Dictionary in (sim.map.get("rooms", []) as Array):
				var rid := String(r.get("id", ""))
				if rid != "bridge" and not used_rooms.has(rid): pool.append(rid)
			pick = String(pool[sim._rng.randi_range(0, pool.size() - 1)]) if not pool.is_empty() else here
		if pick != "":
			used_rooms[pick] = true
			a["_lie"] = {"room": _rname(pick), "roomId": pick}
		else:
			a["_lie"] = {}
	agenda.clear()
	for a: Dictionary in sim.agents:
		a["accuse"] = -1
		a["_sup"] = {}
	_alien_lines = 0
	_hard_lines = 0
	_accuse_lines = 0
	_last_who = -1
	_streak = 0
	_t = 0.0
	var alive: Array = []
	for a: Dictionary in sim.agents:
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
				or (int(a.get("i", -1)) == int(sim.me_idx) and not bool(sim.spectator)):
			continue
		alive.append(int(a.get("i", -1)))
	var scored: Array = []
	for i: int in alive:
		var a: Dictionary = sim.agent(i)
		var sc: float = sim._rng.randf()
		if not (a.get("known", {}) as Dictionary).is_empty(): sc += sim.rules.disp_sub("talkScore", "known", 2.0)
		if not (a.get("almost", {}) as Dictionary).is_empty(): sc += sim.rules.disp_sub("talkScore", "almost", 1.2)
		if a.get("_retract") != null: sc += sim.rules.disp_sub("talkScore", "retract", 1.5)
		if _top_suspect(a) >= 0: sc += sim.rules.disp_sub("talkScore", "accuse", 1.0)
		sc += minf(1.0, float((a.get("why", {}) as Dictionary).size()) * sim.rules.disp_sub("talkScore", "why", 0.12))
		sc += sim.rules.disp_sub("talkScore", "talkN", 0.6) * minf(1.0, float(a.get("talkN", 0)) / maxf(1.0, sim.rules.disp_sub("talkScore", "talkScoreN", 6.0)))
		if bool(a.get("alien", false)): sc -= sim.rules.disp_sub("talkScore", "alienBias", 1.15)
		scored.append([sc, i])
	scored.sort_custom(func(x, y): return float(x[0]) > float(y[0]))
	cands = []
	for s: Array in scored: cands.append(int(s[1]))
	var min_h := int(_r("SPEECH", "minHumanSpeakers", 2))
	var head: Array = cands.slice(0, 3)
	var humans := 0
	for i: int in head:
		if not bool(sim.agent(i).get("alien", false)): humans += 1
	if humans < min_h:
		for i: int in cands:
			if head.has(i) or bool(sim.agent(i).get("alien", false)): continue
			cands.erase(i)
			cands.insert(mini(2, cands.size()), i)
			break
	var discuss := float(sim.meeting.get("t", 0.0))
	var span := maxf(_r("MEET", "minPlan", 5.2), discuss - _r("MEET", "endPad", 2.2))
	var gap := span / float(maxi(1, cands.size()))
	var at: float = _d("agendaStart", 0.4)
	for i: int in cands:
		agenda.append({"t": at, "i": i})
		at += gap
	for i: int in cands: sim.log_account(i)
	_opening_broadcast(reporter_i, victim_i, kind)
	if kind != "pre":
		var recalled := false
		for i: int in cands:
			var ca: Dictionary = sim.agent(i)
			if ca.is_empty(): continue
			var rid: String = _claimed_room(ca)
			var h: Array = ca.get("claimHist", []) as Array
			if not recalled and not h.is_empty():
				var prev: Dictionary = h[h.size() - 1] as Dictionary
				if String(prev.get("roomId", "")) != rid:
					var other := -1
					for x: int in cands:
						if x != i:
							other = x
							break
					if other >= 0:
						var ctx2: Dictionary = _ctx_for(sim.agent(other), i)
						ctx2["r"] = _rname(rid)
						ctx2["r2"] = String(prev.get("room", "上次"))
						var tpl := _pick("claim_recall", other)
						if tpl != "":
							_emit_raw(other, lines.fill(tpl, sim.agent(other), ctx2, sim._rng))
							recalled = true
						sim._stat("claimRecall", 1)
			sim.mind.record_claim(ca, rid)
		plan_first_accusation(kind)
		var deception := plan_alien_deception(kind, victim_i)
		plan_mate_bus(deception)
	decide_human_defend()
	push_endorse(kind)
	schedule_leader_orders(kind)
	var title := "第 %d 夜 · 发现尸体 · 公开讨论" % int(sim.night)
	if kind == "pre": title = "第 1 天 · 开局公开讨论"
	elif kind == "day": title = "第 %d 天 · 全员会议" % int(sim.night)
	feed.append({"who": "系统", "text": title, "sys": true, "cat": "sys", "me": false, "alien": false})


## 讨论相位每帧推进；到点发一条。返回本次新增了几条发言（UI 用它判断是否要滚动）。
func tick(dt: float) -> int:
	if not enabled or sim.meeting.is_empty():
		return 0
	if String(sim.meeting.get("phase", "")) != "discuss":
		return 0
	_t += dt
	var n := 0
	while not agenda.is_empty() and float((agenda[0] as Dictionary).get("t", 0.0)) <= _t:
		var item: Dictionary = agenda.pop_front() as Dictionary
		_ai_line(int(item.get("i", -1)))
		n += 1
	return n


func _top_suspect(a: Dictionary) -> int:
	var best := -1
	var bs := _r("SPEECH", "humanAccuseSus", 0.35)
	var self_i := int(a.get("i", -1))
	var known: Dictionary = a.get("known", {}) as Dictionary
	var kh: Dictionary = a.get("knownHuman", {}) as Dictionary
	var tmap: Dictionary = a.get("T", {}) as Dictionary
	var afriend: Dictionary = (a.get("almost", {}) as Dictionary).get("friend", {}) as Dictionary
	var susp_v: Variant = a.get("suspect", -1)
	var susp := int(susp_v) if (susp_v is int or susp_v is float) else -1
	var ax_cap: float = float(mind.rule("AXIS", "cap", 200.0)) if mind != null else 200.0
	var f_shield := _r("ALMOST", "friendShieldAdd", 0.25)
	for k: int in (a.get("sus", {}) as Dictionary).keys():
		var ti := int(k)
		if mind != null and not mind.live_target(ti, self_i):
			continue
		if not bool(a.get("alien", false)) and kh.has(ti):
			continue
		if not known.has(ti) and ti != susp:
			if tmap.has(ti) and float(tmap[ti]) >= ax_cap:
				continue
			if afriend.has(ti) and sim._rng.randf() < f_shield:
				continue
		var v := float((a.get("sus", {}) as Dictionary)[k])
		if v >= bs and (best < 0 or v > bs):
			bs = v
			best = ti
	return best


func _ctx_for(a: Dictionary, target_i: int) -> Dictionary:
	var pos: Vector2 = a.get("pos", Vector2.ZERO)
	var rid: String = sim.room_at(pos)
	var rname: String = _rname(rid)
	var tasks: Array = a.get("tasks", []) as Array
	var ti := mini(int(a.get("tIdx", 0)), maxi(0, tasks.size() - 1))
	var kname := "任务"
	if not tasks.is_empty():
		kname = String(sim.point(int(tasks[ti])).get("label", "任务"))
	var tname := "他"
	if target_i >= 0:
		tname = String(sim.agent(target_i).get("name", "他"))
	return {
		"t": tname, "r": rname, "r2": "现场", "u": String(sim.me().get("name", "他")),
		"k": kname, "when": _when_word(),
		"why": lines.evidence("unknown", sim._rng),
	}


## 选一条模板：hot/cold 按性格；三成概率走 combo；同场硬去重 + 整局降权。
func _pick(cat: String, speaker_i: int) -> String:
	var a: Dictionary = sim.agent(speaker_i)
	var tn: String = lines.tone_of(a, 0.0)
	var pool: Array = lines.pool(cat, tn)
	if pool.is_empty():
		pool = lines.pool(cat, "cold")
	if pool.is_empty():
		return ""
	var combo: Array = lines.pool(cat, "combo")
	if not combo.is_empty() and sim._rng.randf() < _d("comboChance", 0.3):
		pool = combo
	var mine: Dictionary = meet_used.get(speaker_i, {}) as Dictionary
	var fallback := ""
	for tries in int(_d("linePickTries", 6)):
		var cand := String(pool[sim._rng.randi_range(0, pool.size() - 1)])
		if bool(mine.get(cand, false)):
			if fallback == "":
				fallback = cand
			continue
		var used := int(line_used.get(cand, 0))
		# 2.5D pickLine：同场同人硬去重（上面的 mine 已做），整局按 1/(1+K·n) 降权，
		# 没有"同模板最多 2 次"这条 3D 自造规则 —— 已删除。
		var w: float = 1.0 / (1.0 + _d("lineDecayK", 3.0) * float(used))
		if used > 0 and sim._rng.randf() > w:
			if fallback == "":
				fallback = cand
			continue
		return cand
	return fallback


func _apply_accuse_effects(a: Dictionary, speaker_i: int, target_i: int, cat: String) -> void:
	if target_i < 0:
		return
	if cat == "accuse" or cat == "known_accuse_hard" or cat == "almost" \
			or cat == "evidence" or cat == "confront" or cat == "known_echo":
		a["accuse"] = target_i
		var gt: Dictionary = sim.agent(target_i)
		if not gt.is_empty() and bool(gt.get("alive", false)) and mind != null:
			mind.grudge_add(gt, speaker_i, 0.40)
		var why: Dictionary = (a.get("accuseWhy", {}) as Dictionary).duplicate()
		var solid: bool = bool(why.get("solid", false)) \
			or cat == "known_accuse_hard" or cat == "almost" or cat == "evidence" \
			or cat == "confront" or cat == "known_echo"
		if solid:
			if not bool(why.get("solid", false)):
				why["solid"] = true
				a["accuseWhy"] = why
			if not bool(a.get("alien", false)) or sim._rng.randf() < _r("SPEECH", "alienLeadRate", 0.12):
				sim.note_accuse(speaker_i, target_i)
		if not sim.meeting.is_empty():
			var tlist: Array = (sim.meeting.get("testimony", []) as Array).duplicate()
			tlist.append({"by": speaker_i, "tgt": target_i, "said": true, "reason": "heard_accuse"})
			sim.meeting["testimony"] = tlist


func _deliver_listeners(speaker_i: int, target_i: int, kind: String) -> void:
	if target_i < 0 or mind == null:
		return
	var claim_room: String = sim.room_at(sim.agent(target_i).get("pos", Vector2.ZERO))
	for l: Dictionary in sim.agents:
		if int(l.get("i", -1)) == speaker_i or not bool(l.get("alive", false)) or bool(l.get("downed", false)):
			continue
		mind.note_testimony(int(l.get("i", -1)), speaker_i, target_i, kind, -1.0, claim_room)


func _emit(speaker_i: int, cat: String, ctx: Dictionary, target_i: int,
		kind: String, text: String = "") -> void:
	var a: Dictionary = sim.agent(speaker_i)
	if a.is_empty():
		return
	var raw := text
	if raw == "":
		var tpl := _pick(cat, speaker_i)
		if tpl == "":
			return
		line_used[tpl] = int(line_used.get(tpl, 0)) + 1
		var mine: Dictionary = (meet_used.get(speaker_i, {}) as Dictionary).duplicate()
		mine[tpl] = true
		meet_used[speaker_i] = mine
		raw = lines.fill(tpl, a, ctx, sim._rng)
	a["talkN"] = int(a.get("talkN", 0)) + 1
	if speaker_i == _last_who:
		_streak += 1
	else:
		_streak = 1
		_last_who = speaker_i
	if _streak > int(_d("streakCap", 2)):
		return
	if bool(a.get("alien", false)):
		_alien_lines += 1
	_apply_accuse_effects(a, speaker_i, target_i, cat)
	var entry := {"who": String(a.get("name", "?")), "text": raw, "cat": cat,
		"sys": false, "me": false, "alien": bool(a.get("alien", false)),
		"target": target_i, "kind": kind}
	feed.append(entry)
	sim._log("chat", {"actor": speaker_i, "text": raw, "cat": cat,
		"target": target_i, "ev": kind, "seq": int(sim.meeting.get("seq", 0))})
	# 先让听众吸收证词更新 rev，再触发改票判断
	_deliver_listeners(speaker_i, target_i, kind)
	if target_i >= 0 and not sim.meeting.is_empty():
		sim.reconsider_votes(speaker_i)
	if cat == "identity" or cat == "selfcite" or cat == "extra_self":
		var rid: String = _claimed_room(a)
		for l2: Dictionary in sim.agents:
			if int(l2.get("i", -1)) == speaker_i:
				continue
			var m2: Dictionary = (l2.get("alibi", {}) as Dictionary).duplicate() if l2.get("alibi", {}) is Dictionary else {}
			m2[speaker_i] = rid
			l2["alibi"] = m2
		if mind.check_alibi(speaker_i, rid) > 0 and _alibi_callouts < 2 and String(sim.meeting.get("kind", "")) != "pre":
			for l3: Dictionary in sim.agents:
				var li := int(l3.get("i", -1))
				if li == speaker_i or not bool(l3.get("alive", false)) or bool(l3.get("downed", false)):
					continue
				if bool(l3.get("alien", false)) and _is_mate(l3, speaker_i):
					continue
				var seen_rm := _alibi_caught(l3, speaker_i, rid)
				if seen_rm != "":
					_alibi_callouts += 1
					_emit_raw(li, "等等，我%s在%s看见%s了。你说你在%s？对不上。" % [
						_when_word(), _rname(seen_rm), String(a.get("name", "?")), _rname(rid)])
					break


func _plan_ai_speech(i: int) -> Dictionary:
	var a: Dictionary = sim.agent(i)
	if a.is_empty() or not bool(a.get("alive", false)):
		return {}
	var is_alien := bool(a.get("alien", false))
	if is_alien and _alien_lines >= int(_r("SPEECH", "alienLineCap", 6)):
		return {}
	var known: Dictionary = a.get("known", {}) as Dictionary
	var almost: Dictionary = (a.get("almost", {}) as Dictionary).get("foe", {}) as Dictionary
	var top := _top_suspect(a)
	if is_alien and top >= 0 and _is_mate(a, top):
		top = -1
	var mob_on_me := _was_accused(i)
	if is_alien and not bool(sim.terminator_on):
		for x: Dictionary in sim.agents:
			if x != a and bool(x.get("alive", false)) and int(x.get("accuse", -1)) == i:
				mob_on_me = true
				break
		var awhy: Dictionary = a.get("accuseWhy", {}) as Dictionary
		var p_acc := _r("SPEECH", "alienHitBackRate", 0.32) if mob_on_me else _r("SPEECH", "alienAccuseRate", 0.06)
		if bool(awhy.get("opening", false)) or bool(awhy.get("fake", false)) or sim._rng.randf() >= p_acc:
			known = {}
			almost = {}
			top = -1
	var can_accuse := _accuse_lines < int(_r("SPEECH", "accuseSpeakers", 3))
	var target := top
	var cat := "identity"
	var kind := "identity"
	var kn_pick := -1
	for ki: int in known.keys():
		if not (is_alien and _is_mate(a, ki)):
			kn_pick = ki
			break
	if can_accuse and kn_pick >= 0:
		target = kn_pick
		var krec: Variant = known.get(target, {})
		var kkind := String((krec as Dictionary).get("kind", "saw_knife")) if krec is Dictionary else "saw_knife"
		if kkind == "terminator":
			var tn := String(sim.agent(target).get("name", "?"))
			return {"cat": "known_accuse_hard", "ctx": _ctx_for(a, target), "target": target,
				"kind": "known", "text": "身份已经公开：%s是内鬼。我投%s。" % [tn, tn]}
		if _hard_lines < 2:
			cat = "known_accuse_hard"
			kind = "known"
			_hard_lines += 1
		else:
			var alts: Array = ["evidence", "confront", "endorse", "follow_accuse", "ask"]
			cat = String(alts[sim._rng.randi_range(0, alts.size() - 1)])
			kind = "known_echo"
	elif can_accuse and not almost.is_empty() and not (is_alien and _is_mate(a, int(almost.keys()[0]))):
		target = int(almost.keys()[0])
		cat = "almost"
		kind = "almost"
	elif can_accuse and top >= 0:
		cat = "accuse"
		kind = "accuse"
	elif _was_accused(i):
		cat = "defend"
		kind = "defend"
		target = -1
	else:
		var is_pre := String(sim.meeting.get("kind", "")) == "pre"
		var pool: Array = ["identity", "ask", "hedge"] if is_pre else ["identity", "selfcite", "ask", "call", "hedge"]
		cat = String(pool[sim._rng.randi_range(0, pool.size() - 1)])
		kind = "identity"
		target = -1
		if cat == "ask" or cat == "call":
			var others: Array = []
			for oa: Dictionary in sim.agents:
				var oi := int(oa.get("i", -1))
				if oi != i and bool(oa.get("alive", false)) and not bool(oa.get("downed", false)):
					others.append(oi)
			if not others.is_empty():
				target = int(others[sim._rng.randi_range(0, others.size() - 1)])
	if is_alien and (cat == "accuse" or cat == "almost"):
		if not ((mob_on_me and sim._rng.randf() < 0.75) or sim._rng.randf() < _r("MISLEAD", "hardLine", 0.55)):
			cat = "accuse"
			kind = "accuse"
	var ctx := _ctx_for(a, target)
	var ev: Dictionary = mind.evidence_reason(a, target) if target >= 0 else {}
	var ev_kind := String(ev.get("kind", ""))
	if ev.has("x") and ev.has("y"):
		var ev_rm: String = sim.room_at(Vector2(float(ev["x"]), float(ev["y"])))
		if ev_rm != "": ctx["r"] = _rname(ev_rm)
	elif String(ev.get("room", "")) != "":
		ctx["r"] = _rname(String(ev.get("room", "")))
	if cat == "known_accuse_hard":
		var krec2: Variant = known.get(target, {})
		var kk := String((krec2 as Dictionary).get("kind", ev_kind if ev_kind != "" else "saw_knife")) if krec2 is Dictionary else "saw_knife"
		ctx["k"] = String(lines.claim_act.get(kk, "出刀"))
		ctx["why"] = lines.evidence(kk, sim._rng)
	elif cat == "accuse" or cat == "evidence" or cat == "almost":
		if ev_kind != "" and ev_kind != "saw_agent":
			ctx["k"] = String(lines.claim_act.get(ev_kind, "异常行为"))
			ctx["why"] = lines.evidence(ev_kind, sim._rng)
		elif target >= 0 and mind.emotion_of(a, target) <= -0.5:
			ctx["why"] = lines.evidence("wrong_lead", sim._rng)
		elif target >= 0 and mind.trust_score(a, target) <= -0.3:
			ctx["why"] = lines.evidence("low_cred", sim._rng)
		else:
			ctx["why"] = lines.evidence("unknown", sim._rng)
	return {"cat": cat, "ctx": ctx, "target": target, "kind": kind, "text": ""}


func _ai_line(i: int) -> void:
	var plan := _plan_ai_speech(i)
	if plan.is_empty():
		return
	var cat := String(plan.get("cat", ""))
	if cat in ["accuse", "known_accuse_hard", "almost", "known_echo"]:
		_accuse_lines += 1
	_emit(i, cat, plan.get("ctx", {}) as Dictionary,
		int(plan.get("target", -1)), String(plan.get("kind", "")), String(plan.get("text", "")))


## 跳过讨论或讨论结束时补发未说出口的证词到听众记忆中
func flush_pending_testimonies() -> void:
	if not enabled or sim == null or not sim.ai_enabled or sim.meeting.is_empty():
		agenda.clear()
		return
	while not agenda.is_empty():
		var item: Dictionary = agenda.pop_front() as Dictionary
		var si := int(item.get("i", -1))
		var plan := _plan_ai_speech(si)
		if plan.is_empty():
			continue
		var tgt := int(plan.get("target", -1))
		var cat := String(plan.get("cat", ""))
		var kind := String(plan.get("kind", ""))
		if tgt >= 0 and (cat == "accuse" or cat == "known_accuse_hard" or cat == "almost" \
				or cat == "evidence" or cat == "confront" or cat == "known_echo"):
			_accuse_lines += 1
			_apply_accuse_effects(sim.agent(si), si, tgt, cat)
			_deliver_listeners(si, tgt, kind)
			sim.reconsider_votes(si)


func _was_accused(i: int) -> bool:
	for e: Dictionary in feed:
		if int(e.get("target", -1)) == i and String(e.get("kind", "")) == "accuse":
			return true
	return false


## 玩家自由发言：解析槽位 → 广播听众 → 分支回应。
func player_say(text: String) -> Dictionary:
	return SpeechPlayer.player_say(self, text)


func _player_alive(i: int) -> bool:
	return SpeechPlayer.player_alive(self, i)


func _first_player_responder(me_i: int, skip: int) -> int:
	return SpeechPlayer.first_player_responder(self, me_i, skip)


func feed_tail(n: int = 12) -> Array:
	return feed.duplicate() if feed.size() <= n else feed.slice(feed.size() - n, feed.size())


func sys_say(who: String, text: String) -> void:
	if not enabled:
		return
	feed.append({"who": who, "text": text, "cat": "sys", "sys": true, "me": false, "alien": false, "target": -1, "kind": "sys"})
	if sim != null:
		sim._log("chat", {"actor": -1, "text": text, "cat": "sys"})
