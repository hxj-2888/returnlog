extends RefCounted
## 社交与会议自测：发言、领袖、构陷、投票、开场播报
##
## 2026-11-12 从 main.gd 迁出（大文件拆分：main.gd 9,580 → 5,5xx 行）。
## 约定：全部 static，宿主实例经 __h 传入；本文件不持有任何状态，不直接读 Engine 单例。
## 调用：TestSocial._run_xxx(self)  —— 见 main.gd 的参数分发。

const SimStateScript := preload("res://scripts/sim/sim_state.gd")

static func _run_socialtest(__h) -> void:
	var pass_n := 0
	var fail_n := 0
	var fails: Array = []
	__h._finish_meeting(__h.sim)
	__h.sim.meeting = {}
	var h: Dictionary = {}
	var t: Dictionary = {}
	var l: Dictionary = {}
	for a: Dictionary in __h.sim.agents:
		var i := int(a.get("i", -1))
		if i == int(__h.sim.me_idx) or bool(a.get("alien", false)):
			continue
		if h.is_empty():
			h = a
		elif t.is_empty():
			t = a
		elif l.is_empty():
			l = a
	if h.is_empty() or t.is_empty() or l.is_empty():
		print("SOCIALTEST FAIL 席位缺失")
		__h._socialtest_ok = false
		return
	var hi := int(h.get("i", -1))
	var ti := int(t.get("i", -1))
	var li := int(l.get("i", -1))
	# ① grudge / trust / is_patron（中立性格系数 = 1）
	h["trait"] = {"aggr": 50, "caut": 50, "soc": 50, "cur": 50}
	h["grudge"] = {}
	h["trust"] = {}
	h["alive"] = true
	h["downed"] = false
	t["alive"] = true
	t["downed"] = false
	__h.sim.mind.grudge_add(h, ti, 0.45)
	var g1 := float((h.get("grudge", {}) as Dictionary).get(ti, 0.0))
	__h.sim.mind.trust_add(h, ti, 0.40)
	var tr1 := float((h.get("trust", {}) as Dictionary).get(ti, 0.0))
	var patron0: bool = __h.sim.mind.is_patron(h, ti)
	__h.sim.mind.trust_add(h, ti, 0.40)
	var patron1: bool = __h.sim.mind.is_patron(h, ti)
	if absf(g1 - 0.45) < 0.001 and absf(tr1 - 0.40) < 0.001 \
			and not patron0 and patron1:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("grudge/trust 错：g=%.2f t=%.2f patron=%s/%s" % [
			g1, tr1, str(patron0), str(patron1)])
	# ② best_grudge + 投票砸票（grudge 0.7，20 次至少中一次）
	h["grudge"] = {ti: 0.7}
	var bg: Dictionary = __h.sim.mind.best_grudge(h)
	var hit := 0
	for k in 20:
		if __h.sim._ai_vote_target(h) == ti:
			hit += 1
	if int(bg.get("i", -1)) == ti and hit > 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("grudge 投票错：best=%d hit=%d" % [int(bg.get("i", -1)), hit])
	# ③ patron 不过票：trust=1，sus 最高也不投他
	h["trust"] = {ti: 1.0}
	h["grudge"] = {}
	h["sus"] = {ti: 0.95}
	h["susNight"] = {ti: int(__h.sim.night)}
	h["known"] = {}
	h["almost"] = {"foe": {}, "friend": {}}
	h["accuse"] = -1
	h["why"] = {}
	var patron_hits := 0
	for k2 in 10:
		if __h.sim._ai_vote_target(h) == ti:
			patron_hits += 1
	if patron_hits == 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("patron 被投了 %d 次" % patron_hits)
	# ④ claimHist 只留 3 场 + claim_recall
	__h.sim.mind.record_claim(h, "bridge")
	__h.sim.mind.record_claim(h, "engine")
	__h.sim.mind.record_claim(h, "med")
	__h.sim.mind.record_claim(h, "power")
	var ch: Array = h.get("claimHist", []) as Array
	var hist_ok: Variant = ch.size() == 3 and String((ch[2] as Dictionary).get("roomId", "")) == "power"
	# 造一场会：h 上一场在 bridge，本场在 engine → 另一个 AI 说 claim_recall
	h["claimHist"] = [{"night": int(__h.sim.night), "room": "中央会议室", "roomId": "bridge"}]
	h["_lie"] = {}
	h["pos"] = __h.sim.room_center("engine")
	h["alive"] = true
	h["downed"] = false
	__h.sim.stats["claimRecall"] = 0
	__h.sim.open_meeting_kind(SimStateScript.MEET_DAY, -1, -1)
	var recall_n := int(__h.sim.stats.get("claimRecall", 0))
	__h.sim.meeting = {}
	if hist_ok and recall_n > 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("claimHist 错：hist=%d recall=%d" % [ch.size(), recall_n])
	# ⑤ evalAlmost 全量
	var cur := int(__h.sim.night)
	h["known"] = {}
	h["almost"] = {"foe": {}, "friend": {}}
	h["cred"] = {}
	h["credWhy"] = {}
	h["sus"] = {ti: 0.6}
	h["susNight"] = {ti: cur}
	h["why"] = {ti: [
		{"kind": "empty_accuse", "night": cur},
		{"kind": "quick_report", "night": cur},
	]}
	__h.sim.mind.eval_almost(h, ti)
	var weak_ok: bool = not (h.get("almost", {}) as Dictionary).get("foe", {}).has(ti)
	h["why"] = {ti: [
		{"kind": "saw_knife", "night": cur},
		{"kind": "saw_pipe", "night": cur},
	]}
	__h.sim.mind.eval_almost(h, ti)
	var foe_ok: bool = (h.get("almost", {}) as Dictionary).get("foe", {}).has(ti)
	h["almost"] = {"foe": {}, "friend": {}}
	h["why"] = {ti: [
		{"kind": "saw_knife", "night": cur - 5},
		{"kind": "saw_pipe", "night": cur - 5},
	]}
	__h.sim.mind.eval_almost(h, ti)
	var stale_ok: bool = not (h.get("almost", {}) as Dictionary).get("foe", {}).has(ti)
	h["almost"] = {"foe": {}, "friend": {}}
	h["why"] = {ti: [
		{"kind": "saw_knife", "night": cur},
		{"kind": "heard_accuse", "night": cur},
	]}
	__h.sim.mind.eval_almost(h, ti)
	var heard_ok: bool = (h.get("almost", {}) as Dictionary).get("foe", {}).has(ti)
	# friend：cred + credWhy 两种新鲜
	h["almost"] = {"foe": {}, "friend": {}}
	h["why"] = {}
	h["cred"] = {ti: 0.6}
	h["credWhy"] = {ti: [
		{"kind": "task", "night": cur},
		{"kind": "fix", "night": cur},
	]}
	__h.sim.mind.eval_almost(h, ti)
	var friend_ok: bool = (h.get("almost", {}) as Dictionary).get("friend", {}).has(ti)
	if weak_ok and foe_ok and stale_ok and heard_ok and friend_ok:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("evalAlmost 错：weak=%s foe=%s stale=%s heard=%s friend=%s" % [
			str(weak_ok), str(foe_ok), str(stale_ok), str(heard_ok), str(friend_ok)])
	# ⑥ DESC + 单条 why
	h["why"] = {ti: []}
	h["almost"] = {"foe": {}, "friend": {}}
	h["sus"] = {}
	l["why"] = {ti: []}
	l["heard"] = []
	l["sus"] = {}
	l["alive"] = true
	l["downed"] = false
	__h.sim.stats["descErrors"] = 0
	for k3 in 60:
		__h.sim.mind.note_testimony(li, hi, ti, "saw_knife", 0.3, "bridge")
	var why_arr: Array = (l.get("why", {}) as Dictionary).get(ti, []) as Array
	var last_kind := ""
	if not why_arr.is_empty():
		last_kind = String((why_arr[why_arr.size() - 1] as Dictionary).get("kind", ""))
	var desc_n := int(__h.sim.stats.get("descErrors", 0))
	if (l.get("heard", []) as Array).size() > 0 and why_arr.size() == 60 \
			and last_kind != "heard_testimony" and desc_n > 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("DESC/单写错：heard=%d why=%d kind=%s desc=%d" % [
			(l.get("heard", []) as Array).size(), why_arr.size(), last_kind, desc_n])
	print("SOCIALTEST pass=%d fail=%d %s" % [pass_n, fail_n, str(fails)])
	__h._socialtest_ok = fail_n == 0


static func _run_leadtest(__h) -> void:
	## 第 3 批的两条新判定各自钉一条：
	## ① meeting.lead 只记**第一个**带节奏的人（2.5D ctx.lead）；
	## ② quick_report：夜会报案 ≤10 秒且目击者见过尸体 → 怀疑报案人；超过 10 秒不记。
	__h._finish_meeting(__h.sim)
	var s = __h.sim
	var pass_n := 0
	var fail_n := 0

	s.open_meeting_kind(SimStateScript.MEET_DAY, -1, -1)
	s.note_accuse(3, 5)
	s.note_accuse(9, 5)
	var lead_map: Dictionary = s.meeting.get("lead", {}) as Dictionary
	if int(lead_map.get(5, -1)) == 3:
		pass_n += 1
	else:
		fail_n += 1
		print("LEADTEST FAIL 带头追责 lead=%s（期望 3）" % str(lead_map.get(5, -1)))
	s.meeting = {}

	# ② 快报案
	var rep: Dictionary = s.agent(4)
	var vic: Dictionary = s.agent(7)
	# 目击者必须是**人类**：quick_report 只写给人类（异形不因报案快而怀疑人）。
	var wit: Dictionary = {}
	for cand: Dictionary in s.agents:
		var ci := int(cand.get("i", -1))
		if ci == 4 or ci == 7 or bool(cand.get("alien", false)):
			continue
		wit = cand
		break
	if rep.is_empty() or wit.is_empty() or vic.is_empty():
		print("LEADTEST FAIL 席位缺失")
		__h._leadtest_ok = false
		return
	var wit_i := int(wit.get("i", -1))
	rep["alive"] = true
	rep["downed"] = false
	rep["reportLeft"] = 2
	wit["alive"] = true
	wit["downed"] = false
	wit["bodySeen"] = {}
	wit["why"] = {}
	vic["alive"] = false
	vic["downed"] = false
	vic["bodyReported"] = false
	vic["deathAt"] = s.elapsed - 3.0
	s.night_meets = 0
	s.note_body(wit_i, 7)
	if s.open_meeting_kind(SimStateScript.MEET_NIGHT, 4, 7) and __h._why_has(wit, 4, "quick_report"):
		pass_n += 1
	else:
		fail_n += 1
		print("LEADTEST FAIL quick_report 未写入（wit=%d bodySeen=%s）" % [
			wit_i, str(wit.get("bodySeen", {}))])
	s.meeting = {}

	# ③ 反例：报案太慢（>10 秒）不记
	wit["why"] = {}
	vic["deathAt"] = s.elapsed - 30.0
	s.night_meets = 0
	s.open_meeting_kind(SimStateScript.MEET_NIGHT, 4, 7)
	if not __h._why_has(wit, 4, "quick_report"):
		pass_n += 1
	else:
		fail_n += 1
		print("LEADTEST FAIL 慢报案也记了 quick_report")
	s.meeting = {}

	# ④ 讨论期先投：手里有确证的人会议一开始就把票压上
	s.open_meeting_kind(SimStateScript.MEET_DAY, -1, -1)
	var e: Dictionary = s.agent(6)
	var kn_t: Dictionary = s.agent(8)
	if e.is_empty() or kn_t.is_empty():
		fail_n += 2
		print("LEADTEST FAIL 席位缺失（早投）")
	else:
		e["alive"] = true
		e["downed"] = false
		kn_t["alive"] = true
		kn_t["downed"] = false
		e["known"] = {8: {"t": s.elapsed}}
		var n_early: int = s.cast_early_votes()
		var votes0: Dictionary = (s.meeting.get("votes", {}) as Dictionary).duplicate()
		var vm: Dictionary = (s.meeting.get("voteMeta", {}) as Dictionary).get(6, {}) as Dictionary
		if n_early >= 1 and int(votes0.get(6, -1)) == 8 \
				and int(vm.get("early", 0)) == 1 and String(vm.get("why", "")) == "known":
			pass_n += 1
		else:
			fail_n += 1
			print("LEADTEST FAIL 早投 n=%d votes=%s meta=%s" % [n_early, str(votes0), str(vm)])
		# ⑤ 确信不松绑：why==known 的早投票不被改票闸改动
		s.reconsider_votes(0)
		if int((s.meeting.get("votes", {}) as Dictionary).get(6, -1)) == 8:
			pass_n += 1
		else:
			fail_n += 1
			print("LEADTEST FAIL known 早投票被改掉")
	s.meeting = {}
	print("LEADTEST pass=%d fail=%d" % [pass_n, fail_n])
	__h._leadtest_ok = fail_n == 0 and pass_n == 5


static func _run_speechtest(__h) -> bool:
	var pass_n := 0
	var fail_n := 0
	var s = SimStateScript.new()
	if not s.new_game(20261114, 0, __h.map_data, __h.space):
		print("SPEECHTEST FAIL 开局失败")
		return false
	s.ai_enabled = false
	__h._finish_meeting(s)
	if not bool(s.speech_enabled):
		print("SPEECHTEST FAIL lines.json 没加载")
		return false
	pass_n += 1
	# 造一具尸体开会（discuss 相位）
	var v: Variant = s.agent(3)
	v["alive"] = false
	v["bodyPos"] = Vector2(31.0, 33.5)
	if not s.open_meeting(0, 3):
		print("SPEECHTEST FAIL 开会失败")
		return false
	if String(s.meeting.get("phase", "")) != "discuss":
		fail_n += 1
		print("SPEECHTEST FAIL 开场不是 discuss")
	else:
		pass_n += 1
	# 跑满讨论（35s = 350 tick），发言应该排满
	for k in 360:
		if String(s.meeting.get("phase", "")) != "discuss":
			break
		s.tick(0.1)
	var chat_n := 0
	var bad_slot := 0
	var dup := 0
	var seen: Dictionary = {}
	for e: Dictionary in s.events:
		if String(e.get("kind", "")) != "chat":
			continue
		chat_n += 1
		var txt := String(e.get("text", ""))
		if txt.contains("{") or txt.contains("}"):
			bad_slot += 1
		var key := "%d:%s" % [int(e.get("actor", -1)), txt]
		if seen.has(key):
			dup += 1
		seen[key] = true
	if chat_n >= 8:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 讨论只产生 %d 条台词（应 ≥8）" % chat_n)
	if bad_slot == 0:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL %d 条台词残留在占位符" % bad_slot)
	if dup == 0:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 同人同场复读 %d 次" % dup)
	var feed_n: int = s.speech.feed.size()
	if feed_n >= chat_n:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL feed %d < chat %d" % [feed_n, chat_n])

	# 玩家自由发言：亲眼看见 + 舱室 + 人名
	var s2 = SimStateScript.new()
	if not s2.new_game(20261115, 0, __h.map_data, __h.space):
		print("SPEECHTEST FAIL 第二局开局失败")
		return false
	s2.ai_enabled = false
	var v2: Variant = s2.agent(4)
	v2["alive"] = false
	v2["bodyPos"] = Vector2(31.0, 33.5)
	s2.open_meeting(0, 4)
	var target: Dictionary = s2.agent(2)
	var tname := String(target.get("name", ""))
	var line := "我亲眼看见%s在监控室出刀" % tname
	var before_sus: float = s2.mind.sus_of(s2.agent(1), 2)
	var res: Dictionary = s2.speech.player_say(line)
	var slots: Dictionary = res.get("slots", {}) as Dictionary
	var claim: Dictionary = slots.get("claim", {}) as Dictionary
	if bool(res.get("ok", false)) and not claim.is_empty() and int(claim.get("target", -1)) == 2:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 玩家发言没抽出 claim：%s" % str(slots))
	var after_sus: float = s2.mind.sus_of(s2.agent(1), 2)
	if after_sus > before_sus:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 证词没进听众 sus %.2f→%.2f" % [before_sus, after_sus])
	if int(res.get("responses", 0)) >= 0:
		pass_n += 1
	# 回应池：证据必须由被指者用 player_claim_deny 否认，且不能记成对目标的证词。
	var claim_line: Dictionary = s2.speech.feed[-1] as Dictionary if not s2.speech.feed.is_empty() else {}
	if String(claim_line.get("cat", "")) == "player_claim_deny" \
			and int(claim_line.get("target", -2)) == -1:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 证据回应池/目标错：%s" % str(claim_line))
	# 作证回应不能写成对目标的证词（2.5D playerTalk 的 support 分支不加 sus）。
	var sup_name := String(s2.agent(1).get("name", ""))
	s2.speech.player_say("我可以为%02d %s作证" % [2, sup_name])
	var sup_line: Dictionary = s2.speech.feed[-1] as Dictionary if not s2.speech.feed.is_empty() else {}
	if String(sup_line.get("cat", "")) in ["player_support_thanks", "skeptic_ask"] \
			and int(sup_line.get("target", -2)) == -1:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 作证回应池/目标错：%s" % str(sup_line))
	# 「不是我 + 我在X」必须接到否认回应，而不是被自述位置分支截走。
	s2.speech.player_say("不是我，我一整晚都在医疗间")
	var deny_line: Dictionary = s2.speech.feed[-1] as Dictionary if not s2.speech.feed.is_empty() else {}
	if String(deny_line.get("cat", "")) in ["press_deny", "ack_short"] \
			and int(deny_line.get("target", -2)) == -1:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 否认+位置回应池错：%s" % str(deny_line))
	# 投票意向
	var res2: Dictionary = s2.speech.player_say("我投 2号")
	if s2.meeting.has("player_intent") and int(s2.meeting.get("player_intent", -1)) >= 0:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 玩家投票意向没记下：%s" % str(res2))
	# 同场去重状态
	if not s2.speech.meet_used.is_empty():
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 同场去重没生效")
	# 席位号解析（2.5D decision.js:96-99）：补零 / 「第 N 席」/ 中文数字都要认得出。
	# 3D 原先只匹配「%d号」，玩家写「07号」「第七号」全被当成没点名。
	var seat_cases := ["7号 是异形", "07号 是异形", "第七号 是异形", "第7席 是异形"]
	var seat_hit := 0
	for c in seat_cases:
		var ps: Dictionary = s2.lines_data.parse_speech(String(c), s2)
		if (ps.get("people", []) as Array).has(6):
			seat_hit += 1
		else:
			print("SPEECHTEST FAIL 席位号没认出：%s → %s" % [c, str(ps.get("people", []))])
	if seat_hit != seat_cases.size():
		fail_n += 1
	# 模板 → parse_speech 契约（2026-11-11）：按钮/生成器/解析器同一份清单。
	# 逐条生成并解析，失败必须点名，不能只看按钮数量。
	var tpl_defs: Variant = __h._meeting_template_defs()
	var tpl_hit := 0
	var tpl_bad: Array = []
	var claim_want := {"pipe": "saw_pipe", "red": "saw_red", "knife": "saw_knife",
		"sabotage": "saw_sabotage", "bot": "saw_bot", "breaker": "saw_breaker"}
	var tpl_target: Dictionary = s2.agent(2)
	for pair: Array in tpl_defs:
		var k := String(pair[0])
		var has_t: Variant = k != "where" and k != "deny"
		var rid := "engine" if k == "pipe" else ("power" if k == "breaker" else "med")
		var txt: Variant = __h._meet_template_text(k, tpl_target if has_t else {}, rid, "")
		var ps: Dictionary = s2.lines_data.parse_speech(txt, s2)
		var good := false
		if k == "accuse":
			good = int(ps.get("accuse", -1)) == 2
		elif k == "vote":
			good = int(ps.get("vote", -1)) == 2
		elif k == "support":
			good = int(ps.get("support", -1)) == 2
		elif k == "where":
			good = String(ps.get("where", "")) == "med" and String(ps.get("when", "")) == ""
		elif k == "deny":
			good = bool(ps.get("deny", false)) and String(ps.get("where", "")) == "med"
		elif claim_want.has(k):
			var c: Dictionary = ps.get("claim", {}) as Dictionary
			good = not c.is_empty() and String(c.get("kind", "")) == String(claim_want[k]) \
				and int(c.get("target", -1)) == 2 and String(c.get("room", "")) == rid \
				and String(ps.get("where", "")) == ""
		if good:
			tpl_hit += 1
		else:
			tpl_bad.append("%s→%s" % [k, str(ps)])
	if tpl_hit != tpl_defs.size():
		fail_n += 1
		print("SPEECHTEST FAIL 模板解析 %d/%d：%s" % [tpl_hit, tpl_defs.size(), " | ".join(PackedStringArray(tpl_bad))])
	var nr_txt: Variant = __h._meet_template_text("knife", tpl_target, "", "")
	var nr_ps: Dictionary = s2.lines_data.parse_speech(nr_txt, s2)
	var nr_c: Dictionary = nr_ps.get("claim", {}) as Dictionary
	if not nr_c.is_empty() and String(nr_c.get("room", "")) == "" and not nr_txt.contains("就在"):
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 空舱室仍注入地点：%s → %s" % [nr_txt, str(nr_ps)])
	var tmpl_when_bad := 0
	for w: String in ["recent", "night"]:
		var wp: Dictionary = s2.lines_data.parse_speech(
			__h._meet_template_text("where", {}, "med", w), s2)
		if String(wp.get("where", "")) != "med" or String(wp.get("when", "")) != w:
			tmpl_when_bad += 1
	if tmpl_when_bad == 0:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 时段模板解析失败 %d/2" % tmpl_when_bad)
	if tpl_defs.size() == 11:
		pass_n += 1
	else:
		fail_n += 1
		print("SPEECHTEST FAIL 模板数量 %d（应 11）" % tpl_defs.size())
	print("SPEECHTEST pass=%d fail=%d 讨论台词=%d feed=%d 残留=%d 复读=%d 玩家解析=%s 席位号=%d/%d 模板=%d/%d" % [
		pass_n, fail_n, chat_n, feed_n, bad_slot, dup,
		String(claim.get("kind", "none")), seat_hit, seat_cases.size(),
		tpl_hit, tpl_defs.size()])
	return fail_n == 0


## ---- B4 综合门禁（--b4test）----
## 玩家位置同步 / 钻管道出口选择与冷却 / 人类管道禁用 / 开枪 / 搜尸 / 会议三段相位。


static func _run_meetingtest(__h) -> bool:
	var s = SimStateScript.new()
	if not s.new_game(20261109, 0, __h.map_data, __h.space):
		print("MEETINGTEST FAIL 开局失败")
		return false
	s.ai_enabled = false
	__h._finish_meeting(s)
	var alien := {}
	var victim := {}
	for a: Dictionary in s.agents:
		if bool(a.get("alien", false)) and alien.is_empty():
			alien = a
		elif not bool(a.get("alien", false)) and int(a.get("i", -1)) != 0 and victim.is_empty():
			victim = a
	if alien.is_empty() or victim.is_empty():
		print("MEETINGTEST FAIL 没有异形/受害者")
		return false
	s.knife(int(alien.get("i", -1)), int(victim.get("i", -1)))
	s.die(victim)
	var body: Dictionary = s.body_near(victim.get("pos", Vector2.ZERO), 2.2)
	if body.is_empty():
		print("MEETINGTEST FAIL body_near 找不到尸体")
		return false
	if not s.open_meeting(0, int(body.get("i", -1))):
		print("MEETINGTEST FAIL open_meeting 失败")
		return false
	# 三段相位：讨论 → 投票 → 身份公布。门禁里快进讨论，玩家票只在投票阶段有效。
	s.skip_discussion()
	s.tick(0.01)
	var vote_phase := String(s.meeting.get("phase", ""))
	var old_sim = __h.sim
	__h.sim = s
	__h._refresh_meeting_ui()
	var btn_n: Variant = __h.meeting_buttons.size()
	if __h.meeting_buttons.has(int(alien.get("i", -1))):
		(__h.meeting_buttons[int(alien.get("i", -1))] as Button).pressed.emit()
	__h.sim = old_sim
	s.cast_vote(0, int(alien.get("i", -1)))
	for k in 160:
		if s.meeting.is_empty():
			break
		s.tick(0.1)
	var ejected := 0
	for e: Dictionary in s.events:
		if String(e.get("kind", "")) == "eject":
			ejected += 1
	var ok: bool = s.meeting.is_empty() and ejected >= 1 and bool(body.get("bodyReported", false)) \
		and btn_n > 0 and vote_phase == "vote"
	print("MEETINGTEST ok=%s ejected=%d buttons=%d phase=%s meeting_empty=%s" % [
		str(ok), ejected, btn_n, vote_phase, str(s.meeting.is_empty())])
	return ok


## ---- AI 任务门禁（--aittest）----
## 11 个人类 AI 自己跑 300 秒：必须真的完成任务、有人领申请单/换补给；
## 不要求一定赢（异形还没接入），但 prog 必须动。
## ---- 拖尸全链路自测（--dragtest）----
## 现场两个症状：①「拖了但尸体不动」②「一堆人挤在一个任务点」。
## ① 的根因是**视图**读 pos 而不是 bodyPos；② 的根因是抢修没有 FIX_CREW_CAP。
## 这条测试同时卡逻辑位置、视图位置、强制松手和抢修人数上限。


static func _run_meetopentest(__h) -> bool:
	var fails: Array = []
	# ① 报案人是 AI：开场必须是语料池的报案句（含死者名/舱室），不是硬编码
	var s1 = SimStateScript.new()
	if not s1.new_game(20261108, 0, __h.map_data, __h.space):
		print("MEETOPEN FAIL 开局失败")
		return false
	__h._finish_meeting(s1)
	var rep := 6
	var vic := 5
	if rep == int(s1.me_idx) or vic == int(s1.me_idx):
		rep = 7
		vic = 8
	var v1: Dictionary = s1.agent(vic)
	v1["alive"] = false
	v1["downed"] = false
	v1["deathCause"] = "knife"
	v1["bodyPos"] = v1.get("pos", Vector2.ZERO)
	if not s1.open_meeting_kind("night", rep, vic):
		fails.append("① 夜间会议没开成")
	else:
		var open_line := ""
		for e: Dictionary in s1.speech.feed:
			if String(e.get("cat", "")) == "open":
				open_line = String(e.get("text", ""))
		if open_line == "":
			fails.append("① 报案人没有开场台词（cat=open）")
		else:
			var vname := String(v1.get("name", ""))
			if not open_line.contains(vname):
				fails.append("① 报案句没带死者名：" + open_line)

	# ② 报案人是玩家本人：不替玩家编台词，改系统播报事实
	var s2 = SimStateScript.new()
	if not s2.new_game(20261109, 0, __h.map_data, __h.space):
		print("MEETOPEN FAIL 开局失败")
		return false
	__h._finish_meeting(s2)
	var me2 := int(s2.me_idx)
	var vic2: Variant = me2 + 1 if me2 + 1 < 15 else me2 - 1
	var v2: Dictionary = s2.agent(vic2)
	v2["alive"] = false
	v2["deathCause"] = "shot"
	v2["bodyPos"] = v2.get("pos", Vector2.ZERO)
	var sys_all := ""
	if s2.open_meeting_kind("night", me2, vic2):
		for e: Dictionary in s2.speech.feed:
			if String(e.get("cat", "")) == "sys":
				sys_all += String(e.get("text", "")) + "\n"
	else:
		fails.append("② 玩家报案会议没开成")
	# 会议标题行也是 cat=sys，所以按「死者名 + 死因」定位播报行，不按第一条
	if not sys_all.contains("枪伤"):
		fails.append("② 系统播报没带死因：" + sys_all.replace("\n", " / "))

	# ③ 无死亡（白天会）：系统播报「天亮了」，不是空白
	var s3 = SimStateScript.new()
	if not s3.new_game(20261110, 0, __h.map_data, __h.space):
		print("MEETOPEN FAIL 开局失败")
		return false
	__h._finish_meeting(s3)
	var day_text := ""
	if s3.open_meeting_kind("day", -1, -1):
		for e: Dictionary in s3.speech.feed:
			if String(e.get("cat", "")) == "sys":
				day_text += String(e.get("text", "")) + "\n"
	else:
		fails.append("③ 白天会没开成")
	if not day_text.contains("天亮"):
		fails.append("③ 无死亡播报缺失：" + day_text.replace("\n", " / "))

	# ④ 开场定调：FIRST.chance=1 时必须有人抢话、并且有附议者
	var s4 = SimStateScript.new()
	if not s4.new_game(20261111, 0, __h.map_data, __h.space):
		print("MEETOPEN FAIL 开局失败")
		return false
	__h._finish_meeting(s4)
	var first_tbl: Dictionary = s4.rules.t("FIRST")
	var chance_saved := float(first_tbl.get("chance", 0.45))
	first_tbl["chance"] = 1.0
	var vic4 := 4 if int(s4.me_idx) != 4 else 6
	var v4: Dictionary = s4.agent(vic4)
	v4["alive"] = false
	v4["deathCause"] = "knife"
	v4["bodyPos"] = v4.get("pos", Vector2.ZERO)
	var open_n := 0
	var echo_n := 0
	if s4.open_meeting_kind("night", 3, vic4):
		for e: Dictionary in s4.speech.feed:
			var cat := String(e.get("cat", ""))
			if cat == "alien_open_accuse":
				open_n += 1
			elif cat == "alien_open_echo":
				echo_n += 1
	var framed := 0
	for a: Dictionary in s4.agents:
		var why: Dictionary = a.get("accuseWhy", {}) as Dictionary
		if bool(why.get("opening", false)):
			framed += 1
	first_tbl["chance"] = chance_saved
	if open_n < 1:
		fails.append("④ 定调台词没进发言流（cat=alien_open_accuse）")
	if echo_n < 1:
		fails.append("④ 没有附议者台词（cat=alien_open_echo）")
	if framed < 2:
		fails.append("④ 定调席位 < 2（实际 %d）" % framed)

	# ⑤ 反向：旧硬编码句不得回来
	for e: Dictionary in s4.speech.feed:
		if String(e.get("text", "")).begins_with("我先说一句"):
			fails.append("⑤ 开场句回到硬编码：" + String(e.get("text", "")))

	if fails.is_empty():
		print("MEETOPEN OK 0 项失败（open=%d echo=%d framed=%d）" % [open_n, echo_n, framed])
		return true
	for f: String in fails:
		print("MEETOPEN FAIL " + f)
	print("MEETOPEN FAIL 共 %d 项" % fails.size())
	return false


## ---- 不变量断言自测（--invtest，2.5D js/engine/invariants.js 移植）----
## 与 2.5D 同频：只在显式调用时跑（2.5D 也只有 _t.inv('api') 这一处），零帧开销。
