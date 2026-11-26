extends RefCounted
## 会议发言调度 —— 玩家自由发言解析、声称记账与 AI 分支回应。
## 从 `speech.gd` 拆出，纯静态工具集，不持有状态；通过 `s` 访问调度实例与 `sim`/`mind`。


## 玩家自由发言：解析槽位 → 广播听众 → 分支回应。
static func player_say(s, text: String) -> Dictionary:
	var result := {"ok": false, "slots": {}, "responses": 0}
	if not s.enabled:
		return result
	var msg := text.substr(0, 80)
	if msg.strip_edges() == "":
		return result
	var slots: Dictionary = s.lines.parse_speech(msg, s.sim)
	result["slots"] = slots
	var me: Dictionary = s.sim.me()
	var me_i := int(s.sim.me_idx)
	var me_name := String(me.get("name", "你"))
	s.feed.append({"who": me_name, "text": msg, "cat": "player",
		"sys": false, "me": true, "alien": bool(me.get("alien", false)),
		"target": -1, "kind": "player"})
	s.sim._log("chat", {"actor": me_i, "text": msg, "cat": "player"})
	me["talkN"] = int(me.get("talkN", 0)) + 1
	if _apply_player_slots(s, msg, slots, me, me_i):
		result["ok"] = true
		return result
	result["ok"] = true
	_dispatch_player_reply(s, msg, slots, me_i, me_name, result)
	return result


## 解析玩家台词中的声明、指控、支持、投票、自述位置与当众保人；返回 true 表示提前结束。
static func _apply_player_slots(s, msg: String, slots: Dictionary,
		me: Dictionary, me_i: int) -> bool:
	var claim: Dictionary = slots.get("claim", {}) as Dictionary
	var accuse := int(slots.get("accuse", -1))
	var support := int(slots.get("support", -1))
	var vote := int(slots.get("vote", -1))
	var where := String(slots.get("where", ""))
	var claim_target := int(claim.get("target", -1)) if not claim.is_empty() else -1
	if not claim.is_empty():
		if not player_alive(s, claim_target):
			return true
		var ckind := String(claim.get("kind", "heard_claim"))
		var croom := String(claim.get("room", ""))
		if not s.sim.meeting.is_empty():
			var pclaims: Array = (s.sim.meeting.get("playerClaims", []) as Array).duplicate()
			for pc: Variant in pclaims:
				if pc is Dictionary and int((pc as Dictionary).get("target", -1)) == claim_target \
						and String((pc as Dictionary).get("kind", "")) == ckind:
					return true
			pclaims.append({"t": float(s.mind.ev_now()), "target": claim_target, "kind": ckind, "room": croom})
			s.sim.meeting["playerClaims"] = pclaims
			s.sim.note_accuse(me_i, claim_target)
		for l: Dictionary in s.sim.agents:
			if int(l.get("i", -1)) == me_i or not bool(l.get("alive", false)):
				continue
			s.mind.note_testimony(int(l.get("i", -1)), me_i, claim_target, ckind, -1.0, croom)
	elif accuse >= 0:
		var at: Dictionary = s.sim.agent(accuse)
		if not at.is_empty() and bool(at.get("alive", false)):
			s.mind.grudge_add(at, me_i, 0.45)
	elif support >= 0:
		if player_alive(s, support):
			s.mind.warm_add(me, support, float(s._r("WARM", "defended", 0.12)))
	if vote >= 0:
		var vt: Dictionary = s.sim.agent(vote)
		if not vt.is_empty() and bool(vt.get("alive", false)):
			s.mind.grudge_add(vt, me_i, 0.30)
		if String(s.sim.meeting.get("phase", "")) == "vote":
			s.sim.cast_vote(me_i, vote)
		else:
			s.sim.meeting["player_intent"] = vote
	if where != "":
		for l3: Dictionary in s.sim.agents:
			if int(l3.get("i", -1)) == me_i:
				continue
			var m3: Dictionary = {}
			if l3.get("alibi", {}) is Dictionary:
				m3 = (l3.get("alibi", {}) as Dictionary).duplicate()
			m3[me_i] = where
			l3["alibi"] = m3
		s.mind.check_alibi(me_i, where)
	if msg.find("不是异形") >= 0 or msg.find("别投") >= 0 or msg.find("我保") >= 0 \
			or msg.find("他没错") >= 0 or msg.find("不可能是他") >= 0:
		for a2: Dictionary in s.sim.agents:
			if int(a2.get("i", -1)) == me_i or not bool(a2.get("alive", false)) \
					or bool(a2.get("downed", false)) or bool(a2.get("alien", false)):
				continue
			var nm := String(a2.get("name", ""))
			if nm != "" and msg.find(nm) >= 0:
				s.mind.trust_add(a2, me_i, 0.40)
	return false


## 按槽位优先级派发 AI 现场回应。
static func _dispatch_player_reply(s, msg: String, slots: Dictionary,
		me_i: int, me_name: String, result: Dictionary) -> void:
	var claim: Dictionary = slots.get("claim", {}) as Dictionary
	if not claim.is_empty():
		_reply_claim(s, claim, me_i, me_name, result)
		return
	var support := int(slots.get("support", -1))
	if support >= 0 and player_alive(s, support):
		_reply_support(s, support, me_i, me_name, result)
		return
	var accuse := int(slots.get("accuse", -1))
	if accuse >= 0 and player_alive(s, accuse):
		_reply_accuse(s, accuse, me_i, me_name, result)
		return
	if bool(slots.get("deny", false)):
		_reply_deny(s, me_i, result)
		return
	var where := String(slots.get("where", ""))
	if where != "":
		_reply_where(s, where, me_i, me_name, result)
		return
	var vote := int(slots.get("vote", -1))
	if vote >= 0 and player_alive(s, vote):
		_reply_vote(s, vote, me_i, me_name, result)
		return
	_reply_fallback(s, msg, me_i, result)


static func _reply_claim(s, claim: Dictionary, me_i: int, me_name: String, result: Dictionary) -> void:
	var claim_target := int(claim.get("target", -1))
	var ct: Dictionary = s.sim.agent(claim_target)
	var act := String(s.lines.claim_act.get(String(claim.get("kind", "")), "动手"))
	if claim_target < 0 or claim_target == me_i or not player_alive(s, claim_target):
		return
	var ctx: Dictionary = s._ctx_for(ct, -1)
	ctx["u"] = me_name
	ctx["k"] = act
	ctx["r"] = s._rname(s.sim.room_at(ct.get("pos", Vector2.ZERO)))
	s._emit(claim_target, "player_claim_deny", ctx, -1, "deny_claim")
	result["responses"] = int(result["responses"]) + 1
	var solid: Array = s.mind.pub_solid_accusers(claim_target)
	for wi: int in solid:
		if wi == me_i or wi == claim_target or not player_alive(s, wi):
			continue
		var w: Dictionary = s.sim.agent(wi)
		if bool(w.get("alien", false)):
			continue
		var ctx2: Dictionary = s._ctx_for(w, claim_target)
		ctx2["u"] = me_name
		ctx2["t"] = String(ct.get("name", "他"))
		var cr := String(claim.get("room", ""))
		ctx2["r"] = s._rname(cr) if cr != "" else s._rname(s.sim.room_at(ct.get("pos", Vector2.ZERO)))
		ctx2["k"] = act
		s._emit(wi, "known_endorse_player", ctx2, claim_target, "heard_claim")
		result["responses"] = int(result["responses"]) + 1
		break


static func _reply_support(s, support: int, me_i: int, me_name: String, result: Dictionary) -> void:
	var st: Dictionary = s.sim.agent(support)
	var skeptic := -1
	for i: int in s.cands:
		if i == me_i or i == support or not player_alive(s, i):
			continue
		var a: Dictionary = s.sim.agent(i)
		if bool(a.get("alien", false)):
			continue
		if float(s.mind.env_estimate(a, support).get("score", 0.0)) >= 0.3:
			skeptic = i
			break
	if skeptic >= 0:
		var ctx: Dictionary = s._ctx_for(s.sim.agent(skeptic), support)
		ctx["u"] = me_name
		ctx["t"] = String(st.get("name", "他"))
		ctx["r"] = s._rname(s.sim.room_at(st.get("pos", Vector2.ZERO)))
		s._emit(skeptic, "skeptic_ask", ctx, -1, "support_reply")
	else:
		var ctx: Dictionary = s._ctx_for(st, -1)
		ctx["u"] = me_name
		ctx["r"] = s._rname(s.sim.room_at(st.get("pos", Vector2.ZERO)))
		s._emit(support, "player_support_thanks", ctx, -1, "support_reply")
	result["responses"] = 1


static func _reply_accuse(s, accuse: int, me_i: int, me_name: String, result: Dictionary) -> void:
	var at: Dictionary = s.sim.agent(accuse)
	var def_ctx: Dictionary = s._ctx_for(at, -1)
	def_ctx["u"] = me_name
	def_ctx["t"] = me_name
	s._emit(accuse, "defend", def_ctx, -1, "defend")
	result["responses"] = int(result["responses"]) + 1
	for i: int in s.cands:
		if i == me_i or i == accuse or not player_alive(s, i):
			continue
		var a: Dictionary = s.sim.agent(i)
		if bool(a.get("alien", false)):
			continue
		if float(s.mind.env_estimate(a, accuse).get("score", 0.0)) >= 0.4:
			var c2: Dictionary = s._ctx_for(a, accuse)
			c2["u"] = me_name
			c2["t"] = String(at.get("name", "他"))
			s._emit(i, "call", c2, accuse, "heard_accuse")
			result["responses"] = int(result["responses"]) + 1
			break


static func _reply_deny(s, me_i: int, result: Dictionary) -> void:
	var press := -1
	for i: int in s.cands:
		if i == me_i or not player_alive(s, i):
			continue
		var a: Dictionary = s.sim.agent(i)
		if bool(a.get("alien", false)) \
				or float(s.mind.env_estimate(a, me_i).get("score", 0.0)) >= 0.3:
			press = i
			break
	if press >= 0:
		var ctx: Dictionary = s._ctx_for(s.sim.agent(press), -1)
		var mroom := String(s.sim.meeting.get("room", ""))
		ctx["r"] = s._rname(mroom) if mroom != "" else "案发那会儿"
		s._emit(press, "press_deny", ctx, -1, "press_deny")
	else:
		var ri := first_player_responder(s, me_i, -1)
		if ri >= 0:
			s._emit(ri, "ack_short", s._ctx_for(s.sim.agent(ri), -1), -1, "ack_short")
	result["responses"] = 1


static func _reply_where(s, where: String, me_i: int, me_name: String, result: Dictionary) -> void:
	var there := -1
	for i: int in s.cands:
		if i == me_i or not player_alive(s, i):
			continue
		var a: Dictionary = s.sim.agent(i)
		if bool(a.get("alien", false)):
			continue
		if s.sim.room_at(a.get("pos", Vector2.ZERO)) == where:
			there = i
			break
	if there >= 0:
		var ctx: Dictionary = s._ctx_for(s.sim.agent(there), -1)
		ctx["t"] = me_name
		ctx["r"] = s._rname(where)
		s._emit(there, "ask", ctx, -1, "where_reply")
	else:
		var ri := first_player_responder(s, me_i, -1)
		if ri >= 0:
			s._emit(ri, "identity", s._ctx_for(s.sim.agent(ri), -1), -1, "where_reply")
	result["responses"] = 1


static func _reply_vote(s, vote: int, me_i: int, me_name: String, result: Dictionary) -> void:
	var vt2: Dictionary = s.sim.agent(vote)
	var follower := -1
	for i: int in s.cands:
		if i == me_i or i == vote or not player_alive(s, i):
			continue
		var a: Dictionary = s.sim.agent(i)
		if bool(a.get("alien", false)) or int(a.get("accuse", -1)) >= 0:
			continue
		if float(s.mind.env_estimate(a, vote).get("score", 0.0)) >= 0.25:
			follower = i
			break
	if follower >= 0:
		var fa: Dictionary = s.sim.agent(follower)
		fa["accuse"] = vote
		s.sim.note_accuse(follower, vote)
		var ctx: Dictionary = s._ctx_for(fa, vote)
		ctx["u"] = me_name
		ctx["t"] = String(vt2.get("name", "他"))
		s._emit(follower, "follow_accuse", ctx, vote, "follow_accuse")
	else:
		var ri := first_player_responder(s, me_i, vote)
		if ri >= 0:
			var ctx: Dictionary = s._ctx_for(s.sim.agent(ri), -1)
			ctx["u"] = me_name
			ctx["t"] = String(vt2.get("name", "他"))
			ctx["r"] = s._rname(s.sim.room_at(vt2.get("pos", Vector2.ZERO)))
			s._emit(ri, "skeptic_ask", ctx, -1, "vote_reply")
	result["responses"] = 1


static func _reply_fallback(s, msg: String, me_i: int, result: Dictionary) -> void:
	var ri := first_player_responder(s, me_i, -1)
	if ri < 0:
		return
	var a: Dictionary = s.sim.agent(ri)
	var f_room: String = s._rname(s.sim.room_at(a.get("pos", Vector2.ZERO)))
	var tasks: Array = a.get("tasks", []) as Array
	var f_task := "任务"
	if not tasks.is_empty():
		var ti := mini(int(a.get("tIdx", 0)), tasks.size() - 1)
		f_task = String(s.sim.point(int(tasks[ti])).get("label", "任务"))
	var line := ""
	if msg.find("在哪") >= 0 or msg.find("哪里") >= 0 or msg.find("位置") >= 0 or msg.find("哪边") >= 0:
		line = "我在%s，把%s搞定了。" % [f_room, f_task]
	elif msg.find("谁") >= 0 or msg.find("怀疑") >= 0 or msg.find("投") >= 0 or msg.find("凶手") >= 0:
		var ac := int(a.get("accuse", -1))
		line = ("我怀疑%s。" % String(s.sim.agent(ac).get("name", "他"))) if ac >= 0 else "我还没定。你先说说你看到了什么。"
	elif msg.find("任务") >= 0 or msg.find("修") >= 0 or msg.find("进度") >= 0:
		line = "我修了%d个，还剩%d个。" % [int(a.get("tIdx", 0)), maxi(0, 4 - int(a.get("tIdx", 0)))]
	elif msg.find("看见") >= 0 or msg.find("看到") >= 0 or msg.find("发现") >= 0:
		line = "我这一路没碰上人。"
	else:
		line = "「%s」我记下了。你继续说，我听着。" % msg.substr(0, 20)
	s._emit(ri, "identity", s._ctx_for(a, -1), -1, "chat_reply", line)
	result["responses"] = 1


static func player_alive(s, i: int) -> bool:
	var a: Dictionary = s.sim.agent(i)
	return i >= 0 and not a.is_empty() and bool(a.get("alive", false)) and not bool(a.get("downed", false))


static func first_player_responder(s, me_i: int, skip: int) -> int:
	for i: int in s.cands:
		if i == me_i or i == skip or not player_alive(s, i):
			continue
		return i
	return -1
