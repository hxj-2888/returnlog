extends RefCounted
## 会议发言调度（S 轨，对应 2.5D `js/game.js` 4959–6738 的 startChatter / buildMeetCtx /
## playerTalk / pickLine 与 `js/t2/decision.js#parseSpeech`）。
##
## 落点：sim 的 meeting.discuss 相位。AI 按 talkScore 排发言权 → 每间隔说一句 →
## 听众用 mind.note_testimony 收证词；玩家自由发言走 lines.parse_speech 抽槽位，
## 再让 AI 质疑 / 附议 / 否认。台词、证据短语、规则阈值全部来自 lines.json。
##
## 与 2.5D 的边界：这里实现的是"六类说服策略 + 去重 + 可信度 + 注意力窗口"的完整链路，
## 但没有逐条复刻 2.5D 的构陷编排（planAlienDeception / planMateBus）与领袖型玩家剧本
## ——那两块依赖完整的 mind 假设层，见 MIGRATION.md 的 S 轨剩余项。

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
var _t := 0.0
var _alien_lines := 0
var _last_who := -1
var _streak := 0
var _hard_lines := 0


func setup(p_sim, p_lines, p_mind) -> void:
	sim = p_sim
	lines = p_lines
	mind = p_mind
	enabled = lines != null and mind != null and not lines.pools.is_empty()


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


## 会议开场：排发言权、建排期。讨论时长从 MEET.discussNight 读，不写死。
## kind ∈ {pre, day, night}：2.5D openMeeting 的三种会议。
## pre 会是开局公开讨论，day 会是天亮后的全员会议 —— 两者都要发言。
func on_meeting_open(reporter_i: int, victim_i: int, kind: String = "night") -> void:
	if not enabled:
		return
	meet_used.clear()
	agenda.clear()
	for a: Dictionary in sim.agents:
		a["accuse"] = -1
	_alien_lines = 0
	_hard_lines = 0
	_last_who = -1
	_streak = 0
	_t = 0.0
	var alive: Array = []
	for a: Dictionary in sim.agents:
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		if int(a.get("i", -1)) == int(sim.me_idx) and not bool(sim.spectator):
			continue
		alive.append(int(a.get("i", -1)))
	# talkScore：有料的人先开口，异形整体降权（2026-11-08 用户裁定）
	var scored: Array = []
	for i: int in alive:
		var a: Dictionary = sim.agent(i)
		# 2.5D startChatter#talkScore 逐项同源（rules.json#dispatch.talkScore）
		var sc: float = sim._rng.randf()
		if not (a.get("known", {}) as Dictionary).is_empty():
			sc += sim.rules.disp_sub("talkScore", "known", 2.0)
		if not (a.get("almost", {}) as Dictionary).is_empty():
			sc += sim.rules.disp_sub("talkScore", "almost", 1.2)
		if a.get("_retract") != null:
			sc += sim.rules.disp_sub("talkScore", "retract", 1.5)
		var top := _top_suspect(a)
		if top >= 0:
			sc += sim.rules.disp_sub("talkScore", "accuse", 1.0)
		sc += minf(1.0, float((a.get("why", {}) as Dictionary).size()) *
			sim.rules.disp_sub("talkScore", "why", 0.12))
		sc += sim.rules.disp_sub("talkScore", "talkN", 0.6) * minf(1.0,
			float(a.get("talkN", 0)) / maxf(1.0, sim.rules.disp_sub("talkScore", "talkScoreN", 6.0)))
		if bool(a.get("alien", false)):
			sc -= sim.rules.disp_sub("talkScore", "alienBias", 1.15)
		scored.append([sc, i])
	scored.sort_custom(func(x, y): return float(x[0]) > float(y[0]))
	cands = []
	for s: Array in scored:
		cands.append(int(s[1]))
	# minHumanSpeakers：前 3 个自述者里至少 2 个人类
	var min_h := int(_r("SPEECH", "minHumanSpeakers", 2))
	var head: Array = cands.slice(0, 3)
	var humans := 0
	for i: int in head:
		if not bool(sim.agent(i).get("alien", false)):
			humans += 1
	if humans < min_h:
		for i: int in cands:
			if head.has(i) or bool(sim.agent(i).get("alien", false)):
				continue
			# 把这个人类提到第 3 位
			cands.erase(i)
			var at := mini(2, cands.size())
			cands.insert(at, i)
			break

	var discuss := float(sim.meeting.get("t", 0.0))
	var end_pad := _r("MEET", "endPad", 2.2)
	var span := maxf(_r("MEET", "minPlan", 5.2), discuss - end_pad)
	var n := maxi(1, cands.size())
	var gap := span / float(n)
	var at: float = _d("agendaStart", 0.4)
	for i: int in cands:
		agenda.append({"t": at, "i": i})
		at += gap
	for i: int in cands:
		sim.log_account(i)
	# 开场系统行（2.5D openMeeting 的标题口径）
	var title := "第 %d 夜 · 发现尸体 · 公开讨论" % int(sim.night)
	if kind == "pre":
		title = "第 1 天 · 开局公开讨论"
	elif kind == "day":
		title = "第 %d 天 · 全员会议" % int(sim.night)
	feed.append({"who": "系统", "text": title,
		"sys": true, "cat": "sys", "me": false, "alien": false})


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
	var bs := _r("MIND", "hypMinTop", 0.34)
	for k: int in (a.get("sus", {}) as Dictionary).keys():
		var v := float((a.get("sus", {}) as Dictionary)[k])
		if v > bs:
			bs = v
			best = int(k)
	return best


func _ctx_for(a: Dictionary, target_i: int) -> Dictionary:
	var pos: Vector2 = a.get("pos", Vector2.ZERO)
	var rid: String = sim.room_at(pos)
	var rname: String = sim.room_name(rid)
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
		"k": kname, "when": lines.when_word(false),
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
	# 连说让位：同一个人连到第 3 句起不播（2.5D sayStreakOK）
	if speaker_i == _last_who:
		_streak += 1
	else:
		_streak = 1
		_last_who = speaker_i
	if _streak > int(_d("streakCap", 2)):
		return
	if bool(a.get("alien", false)):
		_alien_lines += 1
	# 2.5D：公开点过名就留下票权，"说了却不投等于打自己脸"。
	# 之前只写进发言流，投票时读不到，导致人人弃权、4 票门槛形同虚设。
	if target_i >= 0 and (cat == "accuse" or cat == "known_accuse_hard" or cat == "almost" \
			or cat == "evidence" or cat == "confront" or cat == "known_echo"):
		a["accuse"] = target_i
	var entry := {"who": String(a.get("name", "?")), "text": raw, "cat": cat,
		"sys": false, "me": false, "alien": bool(a.get("alien", false)),
		"target": target_i, "kind": kind}
	feed.append(entry)
	# 注意：data 里绝不能再放 "kind" —— 2.5D logEvent 的 data.kind 会覆盖事件信封，
	# 这条坑在 MIGRATION.md §8.1 记过一次。业务种类改叫 ev。
	sim._log("chat", {"actor": speaker_i, "text": raw, "cat": cat,
		"target": target_i, "ev": kind})
	# 说出去的话会被活人听见：走 mind 的注意力窗口与可信度权重。
	# 指控/证据类发言携带"目标所在房间"作为声称房间（供 DESC 描述失真与拆谎用）。
	var claim_room := ""
	if target_i >= 0:
		var tpos: Vector2 = sim.agent(target_i).get("pos", Vector2.ZERO)
		claim_room = sim.room_at(tpos)
	for l: Dictionary in sim.agents:
		if int(l.get("i", -1)) == speaker_i or not bool(l.get("alive", false)):
			continue
		if bool(l.get("downed", false)):
			continue
		mind.note_testimony(int(l.get("i", -1)), speaker_i, target_i, kind, -1.0, claim_room)
	# 自述位置要进听众的口供记忆，供 check_alibi 拆谎
	if cat == "identity" or cat == "selfcite" or cat == "extra_self":
		var rid: String = sim.room_at(a.get("pos", Vector2.ZERO))
		for l2: Dictionary in sim.agents:
			if int(l2.get("i", -1)) == speaker_i:
				continue
			var m2: Dictionary = {}
			if l2.get("alibi", {}) is Dictionary:
				m2 = (l2.get("alibi", {}) as Dictionary).duplicate()
			m2[speaker_i] = rid
			l2["alibi"] = m2
		mind.check_alibi(speaker_i, rid)


## 一条 AI 台词：按"确证 / 准-确证 / 有嫌疑 / 被指 / 自述"挑类别。
func _ai_line(i: int) -> void:
	var a: Dictionary = sim.agent(i)
	if a.is_empty() or not bool(a.get("alive", false)):
		return
	if bool(a.get("alien", false)) and _alien_lines >= int(_r("SPEECH", "alienLineCap", 6)):
		return
	var known: Dictionary = a.get("known", {}) as Dictionary
	var almost: Dictionary = (a.get("almost", {}) as Dictionary).get("foe", {}) as Dictionary
	var top := _top_suspect(a)
	var target := top
	var cat := "identity"
	var kind := "identity"
	if not known.is_empty():
		target = int(known.keys()[sim._rng.randi_range(0, known.size() - 1)])
		if _hard_lines < 2:
			cat = "known_accuse_hard"
			kind = "known"
			_hard_lines += 1
		else:
			var alts: Array = ["evidence", "confront", "endorse", "follow_accuse", "ask"]
			cat = String(alts[sim._rng.randi_range(0, alts.size() - 1)])
			kind = "known_echo"
	elif not almost.is_empty():
		target = int(almost.keys()[0])
		cat = "almost"
		kind = "almost"
	elif top >= 0:
		cat = "accuse"
		kind = "accuse"
	elif _was_accused(i):
		cat = "defend"
		kind = "defend"
		target = -1
	else:
		var pool: Array = ["identity", "selfcite", "ask", "call", "hedge"]
		cat = String(pool[sim._rng.randi_range(0, pool.size() - 1)])
		kind = "identity"
		target = -1
	var ctx := _ctx_for(a, target)
	if cat == "known_accuse_hard":
		ctx["k"] = String(lines.claim_act.get("saw_knife", "出刀"))
		ctx["why"] = lines.evidence("saw_knife", sim._rng)
	elif cat == "accuse" or cat == "evidence":
		ctx["why"] = lines.evidence("unknown", sim._rng)
	_emit(i, cat, ctx, target, kind)


func _was_accused(i: int) -> bool:
	for e: Dictionary in feed:
		if int(e.get("target", -1)) == i and String(e.get("kind", "")) == "accuse":
			return true
	return false


## ---- 玩家自由发言 ----
## 解析槽位 → 记自己的证词 → 广播给听众 → AI 用质疑/附议/否认池回应。
func player_say(text: String) -> Dictionary:
	var result := {"ok": false, "slots": {}, "responses": 0}
	if not enabled:
		return result
	var s := text.substr(0, 80)
	if s.strip_edges() == "":
		return result
	var slots: Dictionary = lines.parse_speech(s, sim)
	result["slots"] = slots
	var me: Dictionary = sim.me()
	feed.append({"who": String(me.get("name", "你")), "text": s, "cat": "player",
		"sys": false, "me": true, "alien": bool(me.get("alien", false)),
		"target": -1, "kind": "player"})
	sim._log("chat", {"actor": int(sim.me_idx), "text": s, "cat": "player"})
	me["talkN"] = int(me.get("talkN", 0)) + 1

	var claim: Dictionary = slots.get("claim", {}) as Dictionary
	var accuse := int(slots.get("accuse", -1))
	var support := int(slots.get("support", -1))
	var vote := int(slots.get("vote", -1))
	var where := String(slots.get("where", ""))
	var target := accuse
	var kind := "empty_accuse"
	if not claim.is_empty():
		target = int(claim.get("target", -1))
		kind = String(claim.get("kind", "heard_claim"))
		var croom := String(claim.get("room", ""))
		var pos: Vector2 = me.get("pos", Vector2.ZERO)
		mind.note_sight(int(sim.me_idx), target, kind, pos)
		# 玩家声称亲眼看见：对听众只是**听来的证词**，不是他们的目击
		for l: Dictionary in sim.agents:
			if int(l.get("i", -1)) == int(sim.me_idx) or not bool(l.get("alive", false)):
				continue
			mind.note_testimony(int(l.get("i", -1)), int(sim.me_idx), target, kind)
	elif accuse >= 0:
		for l2: Dictionary in sim.agents:
			if int(l2.get("i", -1)) == int(sim.me_idx) or not bool(l2.get("alive", false)):
				continue
			mind.note_testimony(int(l2.get("i", -1)), int(sim.me_idx), accuse, "empty_accuse")
	elif support >= 0:
		mind.warm_add(int(sim.me_idx), support, _r("WARM", "defended", 0.12))
		target = support
		kind = "support"
	if vote >= 0:
		if String(sim.meeting.get("phase", "")) == "vote":
			sim.cast_vote(int(sim.me_idx), vote)
		else:
			sim.meeting["player_intent"] = vote
	if where != "":
		for l3: Dictionary in sim.agents:
			if int(l3.get("i", -1)) == int(sim.me_idx):
				continue
			var m3: Dictionary = {}
			if l3.get("alibi", {}) is Dictionary:
				m3 = (l3.get("alibi", {}) as Dictionary).duplicate()
			m3[int(sim.me_idx)] = where
			l3["alibi"] = m3
		mind.check_alibi(int(sim.me_idx), where)
	if bool(slots.get("deny", false)):
		# 零证据指控 → 说话人自己的可信度掉（相对每个听众记账）。
		for l4: Dictionary in sim.agents:
			if int(l4.get("i", -1)) == int(sim.me_idx):
				continue
			mind.relia_add(l4, int(sim.me_idx), -_r("RELIA", "emptyAccuse", 0.05))
	result["ok"] = true

	# AI 回应：最多 2 人，分别走质疑 / 附议 / 否认
	var responders: Array = []
	for i: int in cands:
		if responders.size() >= 2:
			break
		var a: Dictionary = sim.agent(i)
		if a.is_empty() or not bool(a.get("alive", false)):
			continue
		responders.append(i)
	for i2: int in responders:
		var a2: Dictionary = sim.agent(i2)
		var rcat := "skeptic_ask"
		if not claim.is_empty():
			rcat = "challenge_player"
		elif support >= 0:
			rcat = "player_support_thanks"
		elif bool(slots.get("deny", false)):
			rcat = "player_claim_deny"
		var ctx := _ctx_for(a2, target)
		ctx["t"] = String(me.get("name", "你"))
		_emit(i2, rcat, ctx, target, kind)
		result["responses"] = int(result["responses"]) + 1
	return result


func feed_tail(n: int = 12) -> Array:
	if feed.size() <= n:
		return feed.duplicate()
	return feed.slice(feed.size() - n, feed.size())
