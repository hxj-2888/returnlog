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
var leader_i := -1                # 本局领袖（-1 = 无）
var leader_charisma := 0.0        # 号召力（LEADER.bands 重尾抽样）
var orders_left := 0              # 本场会议剩余指令数
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
	leader_i = -1
	leader_charisma = 0.0


## 领袖_roll（2.5D newGame:252）：每局 LEADER.chance 概率出现一个领袖 ——
## 只在 soc 轴 ≥ minSoc 的人里挑；号召力按 LEADER.bands 重尾抽样
## （0=没人听 15% / 0.25=50% / 0.65=30% / 1=全场听 5%，两端都不截断）。
func roll_leader() -> void:
	leader_i = -1
	leader_charisma = 0.0
	if sim == null or sim._rng == null:
		return
	if sim._rng.randf() >= sim.rules.n("LEADER", "chance", 0.22):
		return
	var min_soc := int(sim.rules.n("LEADER", "minSoc", 45.0))
	var pool: Array = []
	for a: Dictionary in sim.agents:
		var soc: int = int((a.get("trait", {}) as Dictionary).get("soc", 50))
		if bool(a.get("alive", false)) and soc >= min_soc:
			pool.append(int(a.get("i", -1)))
	if pool.is_empty():
		return
	leader_i = int(pool[sim._rng.randi_range(0, pool.size() - 1)])
	# 号召力重尾：0 / 0.25 / 0.65 / 1 四档
	var bands: Array = [[0.0, 0.15], [0.25, 0.50], [0.65, 0.30], [1.0, 0.05]]
	var r: float = sim._rng.randf()
	var acc := 0.0
	for b: Array in bands:
		acc += float(b[1])
		if r <= acc:
			leader_charisma = float(b[0])
			return


## ============ 会议欺骗编排（2.5D planAlienDeception / planMateBus 同源） ============

## 构陷编排（js/game.js:5759）：
##   · 有确证的人类正在咬异形 → 该异形**反咬**（counter）；
##   · 否则按 FRAME.chance(0.85) 掷骰，随机一只异形当说谎者；
##   · 靶子：反咬 65% 打回指控者，否则按 SOCIAL.frameFollow(0.55) 顺水推舟泼向
##     场上软靶（SOCIAL.hotMin=1 个公开指控者起算），没有就随机挑非队友；
##   · COFRAME：人类占多数时 0.55 / 少数时 0.18 的概率发起**协同诬陷**——
##     最多 COFRAME.maxAccusers-1 个附议异形共享同一靶子、票型强制统一；
##   · 听众效应：没有确证的人才吃这一套 —— heard_frame 0.26×情境抽样；
##     被拆谎的听众反过来给说谎者 0.24 矛盾嫌疑；真目击者免疫。
func plan_alien_deception(kind: String, victim_i: int) -> Dictionary:
	var out := {"frames": 0, "caught": 0}
	if kind == "pre" or not enabled or mind == null:
		return out
	var pool: Array = []
	var aliens: Array = []
	for a: Dictionary in sim.agents:
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		pool.append(a)
		if bool(a.get("alien", false)):
			# 2.5D planAlienDeception(js/game.js:5767)：已经先发制人的异形不再参与本轮构陷/反咬
			# —— 它的靶子与口供已在会议开头定死，再被覆盖就成「嘴上说 A、票投 B」。
			if bool((a.get("accuseWhy", {}) as Dictionary).get("opening", false)):
				continue
			aliens.append(a)
	if aliens.is_empty():
		return out
	# sureAcc：第一个有确证的人类（他的确证目标若是异形 → 反咬）
	var sure_acc := -1
	var sure_kind := ""
	for c: int in cands:
		var ca: Dictionary = sim.agent(c)
		if ca.is_empty() or bool(ca.get("alien", false)):
			continue
		var kn: Dictionary = mind.best_known_target(ca)
		if not kn.is_empty():
			sure_acc = c
			sure_kind = String((sim.agent(int(kn["i"])) .get("known", {}) as Dictionary) \
				.get(c, {}).get("kind", ""))
			var kn2: Dictionary = (ca.get("known", {}) as Dictionary)
			if not kn2.is_empty():
				var first: Dictionary = kn2[kn2.keys()[0]] as Dictionary
				sure_kind = String(first.get("kind", ""))
			break
	var liar := -1
	var counter := false
	var sure_tgt_i := -1
	if sure_acc >= 0:
		var ka: Dictionary = mind.best_known_target(sim.agent(sure_acc))
		if not ka.is_empty():
			sure_tgt_i = int(ka["i"])
	if sure_tgt_i >= 0 and bool(sim.agent(sure_tgt_i).get("alien", false)):
		liar = sure_tgt_i
		counter = true
	elif sim._rng.randf() < sim.rules.n("FRAME", "chance", 0.85):
		liar = int(aliens[sim._rng.randi_range(0, aliens.size() - 1)].get("i", -1))
	if liar < 0:
		return out
	var liar_a: Dictionary = sim.agent(liar)
	# 靶子池：非队友、非 liar、非本夜受害者
	var targets: Array = []
	for t: Dictionary in pool:
		var ti := int(t.get("i", -1))
		if ti == liar or ti == victim_i:
			continue
		if _is_mate(liar_a, ti):
			continue
		targets.append(ti)
	if targets.is_empty():
		return out
	var tgt := -1
	if counter and sure_acc >= 0 and sim._rng.randf() < 0.65:
		tgt = sure_acc
	# 顺势构陷：往场上正在被咬的软靶身上泼（SOCIAL.frameFollow）
	if tgt < 0:
		var hot: Array = []
		var top_n := 0
		for t2: int in targets:
			var n: int = mind.pub_accusers(t2).size()
			if n < int(sim.rules.n("SOCIAL", "hotMin", 1.0)):
				continue
			if n > top_n:
				top_n = n
				hot = [t2]
			elif n == top_n:
				hot.append(t2)
		if not hot.is_empty() and sim._rng.randf() < sim.rules.n("SOCIAL", "frameFollow", 0.55):
			tgt = int(hot[sim._rng.randi_range(0, hot.size() - 1)])
			sim._stat("alienFrameFollow", 1)
	if tgt < 0:
		tgt = int(targets[sim._rng.randi_range(0, targets.size() - 1)])
	if tgt < 0:
		return out
	var tgt_a: Dictionary = sim.agent(tgt)
	# COFRAME 协同诬陷
	var humans_alive := 0
	for a2: Dictionary in pool:
		if not bool(a2.get("alien", false)):
			humans_alive += 1
	var co_rate: float = sim.rules.n("COFRAME", "chance", 0.55) \
		if humans_alive > aliens.size() else sim.rules.n("COFRAME", "minorityChance", 0.18)
	var co_on: bool = aliens.size() > 1 and sim._rng.randf() < co_rate
	# 伪证种类：反咬优先复述对方"看见的"（更像现场目击），主动构陷说红光
	var kd := "saw_red"
	if counter:
		if sure_kind == "saw_pipe":
			kd = "saw_pipe" if sim._rng.randf() < 0.7 else "saw_red"
		elif sure_kind == "saw_red":
			kd = "saw_red" if sim._rng.randf() < 0.7 else "saw_pipe"
		else:
			kd = "saw_pipe" if sim._rng.randf() < 0.5 else "saw_red"
	# 附议者
	var allies: Array = []
	if co_on:
		for x: Dictionary in aliens:
			var xi := int(x.get("i", -1))
			if xi == liar or xi == tgt:
				continue
			if allies.size() >= maxi(0, int(sim.rules.n("COFRAME", "maxAccusers", 3.0)) - 1):
				break
			allies.append(xi)
	else:
		for x2: Dictionary in aliens:
			var xi2 := int(x2.get("i", -1))
			if xi2 == liar or xi2 == tgt:
				continue
			if _is_mate(x2, liar):
				allies.append(xi2)
				break
	if co_on:
		for ai3: int in allies:
			var aa: Dictionary = sim.agent(ai3)
			aa["accuse"] = tgt
			aa["accuseWhy"] = {"kind": kd, "reason": "协同附议", "fake": true}
	# 假口供文案（声称房间：saw_pipe 必须真有管道口）
	var claim_room: String = sim.room_at(tgt_a.get("pos", Vector2.ZERO))
	var liar_room: String = _claimed_room(liar_a)
	if kd == "saw_pipe":
		var pipe_rooms: Array = []
		for q: Dictionary in (sim.map.get("pipes", []) as Array):
			var rid := String(q.get("room", ""))
			if rid != "" and not pipe_rooms.has(rid):
				pipe_rooms.append(rid)
		if not pipe_rooms.has(claim_room):
			claim_room = String(pipe_rooms[sim._rng.randi_range(0, pipe_rooms.size() - 1)]) \
				if not pipe_rooms.is_empty() else "走廊"
	if claim_room == "":
		claim_room = "走廊"
	var tname := String(tgt_a.get("name", "他"))
	var rebut := ""
	if kd == "saw_pipe":
		rebut = "我%s在%s，亲眼看见%s在%s钻进了管道。" % [lines.when_word(false), liar_room, tname, claim_room]
	else:
		rebut = "我%s在%s，亲眼看见%s身上带着刚出刀的红光。" % [lines.when_word(false), liar_room, tname]
	# 拆谎：听众自己的目击记忆与说谎者声称的房间对不上 → 矛盾
	var caught_i := -1
	var caught_room := ""
	for w: Dictionary in sim.agents:
		var wi := int(w.get("i", -1))
		if wi == liar or wi == tgt or wi == sure_acc or not bool(w.get("alive", false)):
			continue
		if bool(w.get("downed", false)) or bool(w.get("alien", false)):
			continue
		var r: String = _alibi_caught(w, liar, _claimed_room(liar_a))
		if r == "":
			continue
		caught_i = wi
		caught_room = r
		break
	# 听众效应
	var hearers: Array = []
	for w2: Dictionary in sim.agents:
		var wi2 := int(w2.get("i", -1))
		if wi2 == liar or wi2 == tgt or wi2 == sure_acc:
			continue
		if not bool(w2.get("alive", false)) or bool(w2.get("downed", false)):
			continue
		if not (w2.get("known", {}) as Dictionary).is_empty():
			continue
		hearers.append(wi2)
	var hbase: float = mind._witness_ctx_mul(liar_a.get("pos", Vector2.ZERO), hearers.size())
	for w3: int in hearers:
		var listener: Dictionary = sim.agent(w3)
		if caught_i == w3:
			mind.sus_add_contradiction(listener, liar, 0.24, "contradiction_lie",
				{"kind": "contradiction", "src": "speech", "actor": liar})
		else:
			var jit: float = maxf(0.72, minf(1.10, hbase * (0.94 + sim._rng.randf() * 0.12)))
			mind.sus_add(listener, tgt, 0.26 * jit, "heard_frame",
				{"kind": "heard_frame", "src": "speech", "actor": tgt, "by": liar})
			for k3: int in allies.size():
				var ally_i: int = allies[k3]
				var wgt := 0.08
				if k3 > 0:
					wgt = sim.rules.n("COFRAME", "extraWgt", 0.16) \
						* pow(sim.rules.n("COFRAME", "extraWgtDecay", 0.72), float(k3 - 1))
				var jit2: float = maxf(0.72, minf(1.10, hbase * (0.94 + sim._rng.randf() * 0.12)))
				mind.sus_add(listener, tgt, wgt * jit2,
					"heard_frame_ally" if k3 == 0 else "heard_frame_co",
					{"kind": "heard_frame", "src": "speech", "actor": tgt, "by": ally_i})
	# 说谎者与附议者的票跟假口供保持一致
	liar_a["accuse"] = tgt
	liar_a["accuseWhy"] = {"kind": kd, "reason": "反咬", "fake": true}
	# 台词：说谎者 → 附议者（各一句）→ 靶子否认 → 拆谎者 → 真目击者重申
	_emit_raw(liar, rebut)
	for ai4: int in allies:
		var an := String(sim.agent(ai4).get("name", "他"))
		var ar: String = sim.room_at(sim.agent(ai4).get("pos", Vector2.ZERO))
		var act := "钻进了管道" if kd == "saw_pipe" else "身上带着刚出刀的红光"
		_emit_raw(ai4, "我在%s，我也看见了：%s%s。%s没撒谎。" % [ar, tname, act, String(liar_a.get("name", "他"))])
	if caught_i >= 0:
		out["caught"] = 1
		var cw := String(sim.agent(caught_i).get("name", "有人"))
		_emit_raw(caught_i, "我%s在%s看见%s了。你说你在%s？对不上。" % [
			mind.alibi_time_word(absf(float(sim.t))),
			sim.room_name(caught_room), String(liar_a.get("name", "他")), liar_room])
	sim._stat("frames", 1)
	out["frames"] = 1
	return out


## 大义灭亲（2.5D planMateBus，js/game.js:6001）：
## MISLEAD.busChance 0.20 / 会议：异形指控一个**已认出的队友**换取听众信任。
## 只用 mates（亲眼确认），绝不写 known；听众只限人类。
func plan_mate_bus(deception: Dictionary) -> void:
	if not enabled or mind == null:
		return
	if sim._rng.randf() >= sim.rules.n("MISLEAD", "busChance", 0.20):
		return
	var alive_aliens: Array = []
	for a: Dictionary in sim.agents:
		if bool(a.get("alien", false)) and bool(a.get("alive", false)) \
				and not bool(a.get("downed", false)):
			alive_aliens.append(a)
	# 找一个本场还没被构陷占用、且有认出队友的异形
	var liar_a: Dictionary = {}
	for x: Dictionary in alive_aliens:
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
		var m: Dictionary = sim.agent(k)
		if not m.is_empty() and bool(m.get("alien", false)) and bool(m.get("alive", false)) \
				and not bool(m.get("downed", false)) and k != liar:
			mate_pool.append(k)
	if mate_pool.is_empty():
		return
	var mate := int(mate_pool[sim._rng.randi_range(0, mate_pool.size() - 1)])
	var mate_a: Dictionary = sim.agent(mate)
	var kd := "saw_pipe" if sim._rng.randf() < 0.5 else "saw_red"
	var claim_room: String = sim.room_at(mate_a.get("pos", Vector2.ZERO))
	var liar_room: String = _claimed_room(liar_a)
	if kd == "saw_pipe":
		var pipe_rooms: Array = []
		for q: Dictionary in (sim.map.get("pipes", []) as Array):
			var rid := String(q.get("room", ""))
			if rid != "" and not pipe_rooms.has(rid):
				pipe_rooms.append(rid)
		if not pipe_rooms.has(claim_room):
			claim_room = String(pipe_rooms[sim._rng.randi_range(0, pipe_rooms.size() - 1)]) \
				if not pipe_rooms.is_empty() else "走廊"
	if claim_room == "":
		claim_room = "走廊"
	var mname := String(mate_a.get("name", "他"))
	var text := ""
	if kd == "saw_pipe":
		text = "我在%s，亲眼看见%s在%s钻进了管道。" % [liar_room, mname, claim_room]
	else:
		text = "我在%s，亲眼看见%s身上带着刚出刀的红光。" % [liar_room, mname]
	# 传闻嫌疑：只给人类听众（2.5D bus 分支排除 alien）
	for w: Dictionary in sim.agents:
		var wi := int(w.get("i", -1))
		if wi == liar or wi == mate or bool(w.get("alien", false)):
			continue
		if not bool(w.get("alive", false)) or bool(w.get("downed", false)):
			continue
		if not (w.get("known", {}) as Dictionary).is_empty():
			continue
		mind.sus_add(w, mate, 0.22, "heard_frame",
			{"kind": "heard_frame", "src": "speech", "actor": mate, "by": liar, "bus": 1})
	liar_a["accuse"] = mate
	liar_a["accuseWhy"] = {"kind": kd, "reason": "队友洗白", "fake": true, "bus": true}
	liar_a["_busTarget"] = mate
	_emit_raw(liar, text)
	sim._stat("busAccusals", 1)


## 领袖指令（2.5D scheduleLeaderOrders，js/game.js:5367）：
## 领袖当众下 1~2 条安排（**不区分阵营** —— 可能是人类组织，也可能是异形带偏）；
## 听众对领袖 +LEADER.warmGain(0.06) warm；被点名者记 mind.order（本夜有效）。
## 预估不照办且掷中 refuseSpeakP(0.5) → 当场说"我去不了"（纯台词）。
func schedule_leader_orders(kind: String) -> void:
	if leader_i < 0 or not enabled:
		return
	var L: Dictionary = sim.agent(leader_i)
	if L.is_empty() or not bool(L.get("alive", false)) or bool(L.get("downed", false)):
		return
	var n_orders := 2 if (sim._rng.randf() < 0.4) else 1
	for k in n_orders:
		var rooms: Array = (sim.map.get("rooms", []) as Array)
		if rooms.is_empty():
			return
		var rm: Dictionary = rooms[sim._rng.randi_range(0, rooms.size() - 1)]
		var rid := String(rm.get("id", ""))
		var pool: Array = []
		for x: Dictionary in sim.agents:
			if int(x.get("i", -1)) == leader_i:
				continue
			if bool(x.get("alive", false)) and not bool(x.get("downed", false)):
				pool.append(int(x.get("i", -1)))
		if pool.is_empty():
			return
		var tgt_i := int(pool[sim._rng.randi_range(0, pool.size() - 1)])
		var tgt: Dictionary = sim.agent(tgt_i)
		var tname := String(tgt.get("name", "大家"))
		_emit_raw(leader_i, "我安排一下：%s，你去%s看看。" % [tname, sim.room_name(rid)])
		sim._stat("orders", 1)
		tgt["order"] = {"room": rid, "night": int(sim.night), "by": leader_i}
		# 预估服从（与夜里同一套判据）：不照办就说"我去不了"
		if not bool(tgt.get("alien", false)):
			var will := _will_obey(tgt, rid)
			if not will and sim._rng.randf() < sim.rules.n("LEADER", "refuseSpeakP", 0.5):
				_emit_raw(tgt_i, "我去不了%s，我手上还有任务。" % sim.room_name(rid))
		# 听众对领袖 warm +0.06（2.5D 2026-11-03 起不再给被点名者记嫌疑）
		for w: Dictionary in sim.agents:
			if int(w.get("i", -1)) == leader_i:
				continue
			if not bool(w.get("alive", false)) or bool(w.get("downed", false)):
				continue
			mind.warm_add(w, leader_i, sim.rules.n("LEADER", "warmGain", 0.06))


## 服从预估（2.5D aiHuman 的服从判据同一套）：obeyP = 号召力 × (cred(领袖)/trustObeyGate)
func _will_obey(tgt: Dictionary, rid: String) -> bool:
	var tasks: Array = tgt.get("tasks", []) as Array
	var tIdx := int(tgt.get("tIdx", 0))
	var idx := -1
	for k in range(tIdx, tasks.size()):
		var p: Dictionary = sim.point(int(tasks[k]))
		if String(p.get("room", "")) == rid:
			idx = k
			break
	if idx == tIdx:
		return true
	if idx < 0:
		return false
	var gate: float = maxf(0.01, mind.trust_obey_gate())
	var obey_p: float = leader_charisma * clampf(mind.cred_of(tgt, leader_i) / gate, 0.0, 1.0)
	return sim._rng.randf() < obey_p


## 说谎者声称的房间与听众目击记忆对不上 → 返回对不上的房间（拆谎）
## 2.5D checkAlibi 量词：窗口内**有一条对得上就不算说谎**；没记录（checked=0）闭嘴。
func _alibi_caught(listener: Dictionary, liar: int, claim_room: String) -> String:
	if claim_room == "":
		return ""
	var why: Dictionary = listener.get("why", {}) as Dictionary
	var mem: Array = (why.get(liar, []) as Array)
	var now: float = mind.ev_now()
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
		if int(rec.get("night", -1)) != int(sim.night):
			continue
		var room := String(rec.get("room", ""))
		if room == "" or room == claim_room:
			continue
		var t := float(rec.get("t", 0.0))
		if now - t > 45.0:
			continue
		checked += 1
		# 走廊/未知不算「在某个舱室」（2.5D checkAlibi 的排除项）
		if room == "corridor" or room == "unknown":
			continue
		if t < best_age:
			best_age = t
			best_room = room
	if checked == 0:
		return ""
	return best_room


## 人类互相辩护（2.5D decideHumanDefend，js/game.js:5958）：
## 只替「人类 + 正被普通指控」的人开口；自己手上有对该人确证 / 准-确证时绝不辩护。
## 意愿由性格决定：defendChance = min(0.92, 0.55 + 0.30×b(soc) + 0.10×b(aggr))。
## 效应：被保者对辩护者 +0.45 情绪信任（之后更愿意跟他的票）；
## defenseNote 记账（被保者日后翻出是异形 → 保人被回溯算账，见 settle_accountability F2）。
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
		# 情绪写入：被当众保下的人记辩护者一笔恩（3D 用 warm 通道承接 2.5D trust）
		mind.warm_add(tgt, by_i, 0.45)
		# 元推理记账：被保的人日后翻出是异形 → 保人被回溯算账（F2 / META 软联盟）
		var dl: Dictionary = sim.meeting.get("defenseLog", {}) as Dictionary
		var rec: Dictionary = dl.get(by_i, {}) as Dictionary
		rec[acc] = {"night": int(sim.night)}
		dl[by_i] = rec
		sim.meeting["defenseLog"] = dl
		var ally: Dictionary = (defender.get("ally", {}) as Dictionary).duplicate()
		ally[acc] = minf(float(sim.rules.n("META", "noteCap", 3.0)),
			float(ally.get(acc, 0.0)) + 1.0)
		defender["ally"] = ally
		var dname := String(defender.get("name", "有人"))
		var tname := String(tgt.get("name", "他"))
		_emit_raw(by_i, "我不觉得%s有问题，我%s还在旁边，别急着定罪。"
			% [tname, sim.room_at(defender.get("pos", Vector2.ZERO))])
		return {"by": by_i, "target": acc}
	return {}


## 裸台词（只进发言流与事件，不走 note_testimony —— 构陷的听众效应已单独结算）
func _emit_raw(speaker_i: int, text: String) -> void:
	var a: Dictionary = sim.agent(speaker_i)
	if a.is_empty() or text == "":
		return
	feed.append({"who": String(a.get("name", "?")), "text": text, "cat": "frame",
		"sys": false, "me": false, "alien": bool(a.get("alien", false)),
		"target": -1, "kind": "frame"})
	sim._log("chat", {"actor": speaker_i, "text": text, "cat": "frame", "ev": "frame"})


## 当众背书（2.5D pushEndorse，信任聚焦 2026-11-03）：
## cred ≥ trustEndorseAt 的人才敢公开背书；听众对被背书者 +WARM.defended。
## 背书是正向信任的"多做动作"出口（cred 只能少做坏事是旧病灶）。
func push_endorse(kind: String) -> void:
	if kind == "pre" or not enabled or mind == null:
		return
	for a: Dictionary in sim.agents:
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		var ai := int(a.get("i", -1))
		var cred: Dictionary = a.get("cred", {}) as Dictionary
		for k: int in cred.keys():
			if float(cred[k]) < mind.trust_endorse_at():
				continue
			var t: Dictionary = sim.agent(k)
			if t.is_empty() or not bool(t.get("alive", false)) or bool(t.get("downed", false)):
				continue
			if not (a.get("known", {}) as Dictionary).is_empty():
				continue
			var tname := String(t.get("name", "他"))
			_emit_raw(ai, "我信得过%s，%s一直在干正经事。" % [tname, tname])
			sim._stat("endorses", 1)
			# 听众收到背书：对被背书者 +warm（2.5D vouchHeard 的 warm 通道）
			for l: Dictionary in sim.agents:
				if int(l.get("i", -1)) == ai:
					continue
				if not bool(l.get("alive", false)) or bool(l.get("downed", false)):
					continue
				mind.warm_add(l, k, sim.rules.n("WARM", "defended", 0.12))
			return


## 先发制人（2.5D FIRST，2026-11-08 用户裁定）：
## 「异形会率先进行指控……甚至有可能是第一句话说出来的」。
## 每场会议 FIRST.chance(0.45) 概率由一只异形**抢在人类之前定调**；
## 假口供只进传闻嫌疑（FIRST.wgt 0.22），绝不写 known。
## 与 plan_alien_deception 互斥（同一场会议二者只走其一，避免双重构陷）。
func plan_first_accusation(kind: String) -> void:
	if kind == "pre" or not enabled or mind == null:
		return
	if sim._rng.randf() >= sim.rules.n("FIRST", "chance", 0.45):
		return
	var pool: Array = []
	for a: Dictionary in sim.agents:
		if bool(a.get("alien", false)) and bool(a.get("alive", false)) \
				and not bool(a.get("downed", false)):
			pool.append(a)
	if pool.is_empty():
		return
	var liar: Dictionary = pool[sim._rng.randi_range(0, pool.size() - 1)]
	var liar_i := int(liar.get("i", -1))
	# 靶子：非队友活人里随机（FIRST 不做顺势选择，定调优先）
	var targets: Array = []
	for t: Dictionary in sim.agents:
		var ti := int(t.get("i", -1))
		if ti == liar_i or not bool(t.get("alive", false)) or bool(t.get("downed", false)):
			continue
		if _is_mate(liar, ti):
			continue
		targets.append(ti)
	if targets.is_empty():
		return
	var tgt := int(targets[sim._rng.randi_range(0, targets.size() - 1)])
	var tgt_a: Dictionary = sim.agent(tgt)
	var tname := String(tgt_a.get("name", "他"))
	var kd := "saw_red" if sim._rng.randf() < 0.7 else "saw_pipe"
	var room: String = sim.room_at(tgt_a.get("pos", Vector2.ZERO))
	var act := "身上带着刚出刀的红光" if kd == "saw_red" else "钻进了管道"
	_emit_raw(liar_i, "我先说一句：我看见%s%s。" % [tname, act])
	liar["accuse"] = tgt
	liar["accuseWhy"] = {"kind": kd, "reason": "opening", "fake": true, "opening": true}
	sim._stat("firstAccusations", 1)
	# 听众（无确证者）+FIRST.wgt 传闻嫌疑
	for l: Dictionary in sim.agents:
		var li := int(l.get("i", -1))
		if li == liar_i or li == tgt or not bool(l.get("alive", false)) \
				or bool(l.get("downed", false)):
			continue
		if not (l.get("known", {}) as Dictionary).is_empty():
			continue
		mind.sus_add(l, tgt, sim.rules.n("FIRST", "wgt", 0.22), "heard_frame",
			{"kind": "heard_frame", "src": "speech", "actor": tgt, "by": liar_i,
			"opening": 1})


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
## pre 会是开局公开讨论，day 会是天亮后的全员会议 —— 两者都要发言。
func on_meeting_open(reporter_i: int, victim_i: int, kind: String = "night") -> void:
	if not enabled:
		return
	meet_used.clear()
	# 异形假口供决策（2.5D buildMeetCtx:5128，每场会议重算）：
	# 只有**本夜真的动过手**才需要编（_killAt > 0）——没杀人的那夜说真话。
	# 65% 说自己实际所在的舱室（别人也见过它在这，时间线对得上），
	# 撑不住时才随口编一间没去过的 —— 一旦自述进对质就可能穿帮。
	var used_rooms: Dictionary = {}
	for a: Dictionary in sim.agents:
		if not bool(a.get("alien", false)) or not bool(a.get("alive", false)):
			a["_lie"] = {}
			continue
		var kill_at := float(a.get("_killAt", 0.0))
		if kill_at > 0.0:
			# 2.5D：here=当前舱室且未被别人占用 → 65% 说真位置；否则编一间没被占用的
			var here: String = sim.room_at(a.get("pos", Vector2.ZERO))
			var pick := ""
			if here != "" and not used_rooms.has(here) and sim._rng.randf() < 0.65:
				pick = here
			else:
				var pool: Array = []
				for r: Dictionary in (sim.map.get("rooms", []) as Array):
					var rid := String(r.get("id", ""))
					if rid != "bridge" and not used_rooms.has(rid):
						pool.append(rid)
				pick = String(pool[sim._rng.randi_range(0, pool.size() - 1)]) \
					if not pool.is_empty() else here
			if pick != "":
				used_rooms[pick] = true
				a["_lie"] = {"room": sim.room_name(pick), "roomId": pick}
			else:
				a["_lie"] = {}
		else:
			a["_lie"] = {}
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
	# 2.5D startChatter 的先后顺序（js/game.js:5077 → 5098+）：**先**先发制人定调，
	# **再**算构陷/反咬 —— 构陷会跳过已 opening 的异形，两者因此天然互斥（不会一句话两张票）。
	if kind != "pre":
		plan_first_accusation(kind)
		var deception := plan_alien_deception(kind, victim_i)
		plan_mate_bus(deception)
	# 人类互相辩护（2.5D startChatter 同步段：决策 + 记账都在开会时定下来）
	decide_human_defend()
	push_endorse(kind)
	schedule_leader_orders(kind)
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
		var rid: String = _claimed_room(a)
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
