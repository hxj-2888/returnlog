extends RefCounted
## 行为夹具：从 2.5D 运行时导出、或按真源断言状态机的硬性验收
##
## 2026-11-12 从 main.gd 迁出（大文件拆分：main.gd 9,580 → 5,5xx 行）。
## 约定：全部 static，宿主实例经 __h 传入；本文件不持有任何状态，不直接读 Engine 单例。
## 调用：TestFixture._run_xxx(self)  —— 见 main.gd 的参数分发。

const CrewViewScript := preload("res://scripts/sim/crew_view.gd")
const SimStateScript := preload("res://scripts/sim/sim_state.gd")

static func _run_parity_fixture(__h) -> bool:
	var fails: Array = []
	var fx_path: Variant = ProjectSettings.globalize_path("res://")
	fx_path = fx_path.path_join("../spec/fixtures/parity-mechanisms.json").simplify_path()
	if not FileAccess.file_exists(fx_path):
		push_error("PARITYFIX 夹具不存在：" + fx_path)
		return false
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(fx_path))
	if not (parsed is Dictionary):
		push_error("PARITYFIX 夹具 JSON 解析失败")
		return false
	var cases: Dictionary = (parsed as Dictionary).get("cases", {}) as Dictionary
	# 冻结 _process，避免 headless 每帧 sim.tick 在断言中间推进状态。
	var was_started: Variant = __h.started
	__h.started = false
	__h.sim.ai_enabled = false

	# ① replayData：8 字段集合 / 顺序 / v / game / map / result / roster 键与真源全等。
	var exp_rd: Dictionary = cases.get("replay_data", {}) as Dictionary
	var rd: Dictionary = __h.sim.replay_data()
	var exp_rd_keys: Array = exp_rd.get("keys", []) as Array
	if rd.keys() != exp_rd_keys:
		fails.append("replayData 字段集合/顺序 %s ≠ %s" % [str(rd.keys()), str(exp_rd_keys)])
	if int(rd.get("v", 0)) != int(exp_rd.get("v", 0)) \
			or String(rd.get("game", "")) != String(exp_rd.get("game", "")):
		fails.append("replayData v/game 与真源不一致")
	var exp_map: Dictionary = exp_rd.get("map", {}) as Dictionary
	var got_map: Dictionary = rd.get("map", {}) as Dictionary
	for k: String in ["w", "h", "rooms", "pipes"]:
		if float(got_map.get(k, -1)) != float(exp_map.get(k, -2)):
			fails.append("replayData map.%s 不一致" % k)
	var exp_res: Dictionary = exp_rd.get("result", {}) as Dictionary
	var got_res: Dictionary = rd.get("result", {}) as Dictionary
	for k2: String in ["win", "why", "prog", "winPts", "nights"]:
		var gv: Variant = got_res.get(k2, "")
		var ev: Variant = exp_res.get(k2, "")
		# JSON.parse_string 会把真源的整数读成 float（0 → 0.0），
		# 而 3D 侧是 int；数值按数值比，bool/字符串才按字面比。
		var same: bool
		if (gv is float or gv is int) and (ev is float or ev is int):
			same = absf(float(gv) - float(ev)) < 0.001
		else:
			same = str(gv) == str(ev)
		if not same:
			fails.append("replayData result.%s 不一致（%s ≠ %s）" % [k2, str(gv), str(ev)])
	var roster: Array = rd.get("roster", []) as Array
	var exp_roster_keys: Array = exp_rd.get("roster_keys", []) as Array
	if roster.size() != int(exp_rd.get("roster_len", 0)) or roster.is_empty() \
			or (roster[0] as Dictionary).keys() != exp_roster_keys:
		fails.append("replayData roster 长度/键不一致")
	if not ((rd.get("events") is Array) and (rd.get("frames") is Array)):
		fails.append("replayData events/frames 不是数组")
	print("PARITYFIX ① replayData %d 字段 / map / result / roster OK" % exp_rd_keys.size())

	# ② recordFrame：{pt,n,p} 三键、全员 15 条、每条 [i,x,y,flags] 四元、flags 位。
	var exp_rf: Dictionary = cases.get("record_frame", {}) as Dictionary
	if __h.sim.frames.is_empty():
		fails.append("recordFrame 开局首帧未采（frames 为空）")
	else:
		var f0: Dictionary = __h.sim.frames[0] as Dictionary
		var exp_fk: Array = exp_rf.get("frame_keys", []) as Array
		if f0.keys() != exp_fk:
			fails.append("recordFrame 帧键 %s ≠ %s" % [str(f0.keys()), str(exp_fk)])
		var p0: Array = f0.get("p", []) as Array
		if p0.size() != int(exp_rf.get("p_entry_count", 0)):
			fails.append("recordFrame 首帧人数 %d ≠ %d" \
				% [p0.size(), int(exp_rf.get("p_entry_count", 0))])
		if not p0.is_empty():
			var e0: Array = p0[0] as Array
			if e0.size() != int(exp_rf.get("p_entry_len", 0)):
				fails.append("recordFrame p 条目长度不一致")
			var exp_e0: Array = exp_rf.get("first_p_entry", []) as Array
			if exp_e0.size() >= 4 and (int(e0[0]) != int(exp_e0[0]) \
					or int(e0[3]) != int(exp_e0[3])):
				fails.append("recordFrame 首条 i/flags 与真源不一致")
	print("PARITYFIX ② recordFrame {pt,n,p} / %d 人 / 4 元 OK" \
		% int(exp_rf.get("p_entry_count", 0)))

	# ③ envNotice：全船广播的过滤条件（死/濒死/拘留排除）、证据字段、conf、alert 增量。
	var exp_env: Dictionary = cases.get("env_notice_fault", {}) as Dictionary
	var conf := float(exp_env.get("conf", 0.55))
	var gain := float(exp_env.get("alert_gain", 0.1925))
	for a: Dictionary in __h.sim.agents:
		a["ev_mem"] = []
		a["alert"] = 0.0
		a["noise"] = {}
	# 造 3 个不合格席位：1 濒死 / 2 死亡 / 3 拘留；其余 12 席全部合格。
	(__h.sim.agents[1] as Dictionary)["downed"] = true
	(__h.sim.agents[2] as Dictionary)["alive"] = false
	(__h.sim.agents[3] as Dictionary)["detained"] = true
	__h.sim.over = false
	__h.sim.env_notice("fault", Vector2(31.0, 33.5), conf)
	var written := 0
	for i in range(__h.sim.agents.size()):
		var a3: Dictionary = __h.sim.agents[i]
		var eligible: bool = i != 1 and i != 2 and i != 3
		var mem3: Array = a3.get("ev_mem", []) as Array
		if eligible:
			if mem3.size() != 1:
				fails.append("envNotice 席位 %d 应收到 1 条，实得 %d" % [i, mem3.size()])
				continue
			written += 1
			var ev3: Dictionary = mem3[0] as Dictionary
			if String(ev3.get("kind", "")) != "env_fault" \
					or absf(float(ev3.get("conf", 0.0)) - conf) > 0.001 \
					or String(ev3.get("src", "")) != "env" \
					or not ev3.has("room"):
				fails.append("envNotice 席位 %d 证据字段不一致：%s" % [i, str(ev3)])
			if absf(float(a3.get("alert", 0.0)) - gain) > 0.001:
				fails.append("envNotice 席位 %d alert 增量 ≠ %.4f" % [i, gain])
			var nz: Dictionary = a3.get("noise", {}) as Dictionary
			if String(nz.get("kind", "")) != "env_fault":
				fails.append("envNotice 席位 %d noise 未写" % i)
		elif not mem3.is_empty():
			fails.append("envNotice 不合格席位 %d 仍被写入" % i)
	if written != 12:
		fails.append("envNotice 合格席位应为 12，实得 %d" % written)
	print("PARITYFIX ③ envNotice 合格 %d / 过滤 3 / conf=%.2f / alert +%.4f OK" \
		% [written, conf, gain])
	# 恢复三态，避免污染 ④
	(__h.sim.agents[1] as Dictionary)["downed"] = false
	(__h.sim.agents[2] as Dictionary)["alive"] = true
	(__h.sim.agents[3] as Dictionary)["detained"] = false

	# ④ sabTick：目标引爆（同房间/半径内）→ dmg +1、sabUsed 写回、目标清空。
	var exp_sab: Dictionary = cases.get("sab_tick", {}) as Dictionary
	var me4: Dictionary = __h.sim.me()
	me4["alien"] = true
	me4["alive"] = true
	me4["downed"] = false
	me4["detained"] = false
	me4["sabUsed"] = false
	__h.sim.dev = false
	__h.sim.t = 100.0
	__h.sim.dmg = []
	var mp: Vector2 = me4.get("pos", Vector2.ZERO) as Vector2
	__h.sim.sab_target = {"room": "power", "x": mp.x, "y": mp.y}
	var dmg_before: int = __h.sim.dmg.size()
	__h.sim.sab_tick()
	if __h.sim.dmg.size() != dmg_before + 1:
		fails.append("sabTick 未引爆：dmg %d → %d" % [dmg_before, __h.sim.dmg.size()])
	if not bool(me4.get("sabUsed", false)):
		fails.append("sabTick 引爆后 sabUsed 未写回")
	if not __h.sim.sab_target.is_empty():
		fails.append("sabTick 引爆后目标未清（@src js/game.js:1156 非 spect 应清）")
	if int(exp_sab.get("dmg_after", 0)) - int(exp_sab.get("dmg_before", 0)) != 1:
		fails.append("夹具自身 sabTick 读数异常")
	print("PARITYFIX ④ sabTick dmg %d→%d / sabUsed / 清目标 OK" \
		% [dmg_before, __h.sim.dmg.size()])

	__h.started = was_started
	__h.sim.ai_enabled = true
	if fails.is_empty():
		print("PARITYFIX OK 0 项失败（4 机制）")
		return true
	for f in fails:
		print("PARITYFIX FAIL " + String(f))
	print("PARITYFIX FAIL %d 项" % fails.size())
	return false


## ---- 玩家能力端到端自测（--abilitytest，2026-11-11 用户现场）----
## 旧自测（--actiontest / --interacttest）只断言「_collect_offers 里有这个 id」，
## 也就是「按键 / 轮盘按钮合法」，从不验证真实按键按下去 sim 状态有没有写回。
## 用户现场正是「按键全合法，能力一点都没有，拖拽完全拖不了」。
## 本测试逐键注入真实 InputEvent，断言模拟层的能力状态确实变化。


static func _run_invtest(__h) -> bool:
	var fails: Array = []
	var s = SimStateScript.new()
	if not s.new_game(20261108, 0, __h.map_data, __h.space):
		print("INVTEST FAIL 开局失败")
		return false
	var r0: Dictionary = s.run_invariants("fresh")
	print("INVTEST fresh checks=%d fails=%d" % [int(r0.get("checks", 0)),
		(r0.get("fails", []) as Array).size()])
	for f: Dictionary in (r0.get("fails", []) as Array):
		fails.append("fresh %s %s" % [String(f.get("code", "")), String(f.get("msg", ""))])

	# —— 反向对照 1：刀数越界（A11）
	var saved_knife := int(s.agents[1].get("knife", 0))
	s.agents[1]["knife"] = 9
	var r1: Dictionary = s.run_invariants("neg-knife")
	var caught_a11 := false
	for f: Dictionary in (r1.get("fails", []) as Array):
		if String(f.get("code", "")) == "A11":
			caught_a11 = true
	s.agents[1]["knife"] = saved_knife

	# —— 反向对照 2：拖拽单向（D2）—— 这正是 2026-11-12 实机拖不动的那类状态
	var a2: Dictionary = s.agents[2]
	var a3: Dictionary = s.agents[3]
	var saved_down := bool(a3.get("downed", false))
	var saved_body: Vector2 = a3.get("bodyPos", Vector2.ZERO)
	a2["drag"] = 3
	a3["downed"] = true
	a3["bodyPos"] = a2.get("pos", Vector2.ZERO)
	# draggedBy 故意保持 -1：2.5D 里这是 null，3D 生产路径里会出现 -1
	a3["draggedBy"] = -1
	var r2: Dictionary = s.run_invariants("neg-drag")
	var caught_d2 := false
	for f: Dictionary in (r2.get("fails", []) as Array):
		if String(f.get("code", "")) == "D2":
			caught_d2 = true
	a2["drag"] = -1
	a3["downed"] = saved_down
	a3["bodyPos"] = saved_body
	a3["draggedBy"] = null

	print("INVTEST negative A11=%s D2=%s" % [str(caught_a11), str(caught_d2)])
	if not caught_a11:
		fails.append("反向对照失败：刀数 9 没被 A11 抓到")
	if not caught_d2:
		fails.append("反向对照失败：单向拖拽没被 D2 抓到")

	# —— 三夜 AI 自跑，每个天亮跑一遍（2.5D 在相位边界断言的同频做法）
	var last_night := int(s.night)
	var runs := 0
	var checks_total := int(r0.get("checks", 0))
	for k in 5000:
		if bool(s.over):
			break
		s.tick(0.1)
		if int(s.night) != last_night:
			last_night = int(s.night)
			var rn: Dictionary = s.run_invariants("dawn%d" % last_night)
			runs += 1
			checks_total += int(rn.get("checks", 0))
			for f: Dictionary in (rn.get("fails", []) as Array):
				fails.append("dawn%d %s %s" % [last_night,
					String(f.get("code", "")), String(f.get("msg", ""))])
	var rf: Dictionary = s.run_invariants("end")
	runs += 1
	checks_total += int(rf.get("checks", 0))
	for f: Dictionary in (rf.get("fails", []) as Array):
		fails.append("end %s %s" % [String(f.get("code", "")), String(f.get("msg", ""))])

	print("INVTEST run runs=%d checks=%d fails=%d night=%d over=%s" % [runs, checks_total,
		fails.size(), int(s.night), str(bool(s.over))])
	for msg: String in fails.slice(0, 12):
		print("INVTEST FAIL " + msg)
	if fails.is_empty():
		print("INVTEST OK 0 项失败（%d 次检查）" % checks_total)
		return true
	print("INVTEST FAIL 共 %d 项" % fails.size())
	return false


## ---- 机器人刀击自测（--knifebottest，2.5D stab():8300 / knifeBot():8356 / damageBot():8390）----
## 覆盖三件之前接不上的事：①玩家出刀能选中机器人；②knife_bot 的守卫逐条生效；
## ③命中后的机制副作用（红身 / 保安转向 / 刀数 / HP）。全部先断言"该拒绝的拒绝"。


static func _run_dragtest(__h) -> bool:
	var fails: Array = []
	var s = SimStateScript.new()
	if not s.new_game(20261112, 0, __h.map_data, __h.space):
		print("DRAGTEST FAIL 开局失败")
		return false
	__h._finish_meeting(s)
	s.ai_enabled = false
	__h.sim = s
	var me_i := int(s.me_idx)
	var me: Dictionary = s.agent(me_i)
	me["alive"] = true
	me["downed"] = false
	me["detained"] = false
	var body_i := 1 if me_i != 1 else 2
	var b: Dictionary = s.agent(body_i)
	b["alive"] = false
	b["downed"] = false
	b["deathCause"] = "knife"
	b["pos"] = (me.get("pos", Vector2.ZERO) as Vector2) + Vector2(1.0, 0.0)
	b["bodyPos"] = b["pos"]
	b["bodyGone"] = false
	b["bodyReported"] = false
	b["draggedBy"] = null
	b["bodyMoved"] = false

	# ① 起拖：can_act 必须认出这具尸体
	var chk: Dictionary = s.can_act("drag", {"actor": me_i, "pos": me.get("pos", Vector2.ZERO)})
	if not bool(chk.get("ok", false)) or int(chk.get("target", -1)) != body_i:
		fails.append("① can_act(drag) 没认出尸体：reason=%s target=%d"
			% [String(chk.get("reason", "")), int(chk.get("target", -1))])
	if not s.start_drag(me_i, body_i):
		fails.append("① start_drag 返回 false")
		return _dragtest_report(fails)

	# ② 拖行：把玩家挪 3 米 —— 尸体必须被拉到身后 0.62 格（不是瞬移、也不是不动）
	var origin: Vector2 = b.get("bodyPos", Vector2.ZERO)
	me["pos"] = origin + Vector2(3.0, 0.0)
	s.tick(0.1)
	var bp: Vector2 = b.get("bodyPos", Vector2.ZERO)
	var gap: float = (me.get("pos", Vector2.ZERO) as Vector2).distance_to(bp)
	if absf(gap - 0.62) > 0.15:
		fails.append("② 拖行距离不是 0.62 格：%.2f" % gap)
	if bp.distance_to(origin) < 1.0:
		fails.append("② 尸体没跟着走（仍离起点 %.2f 格）" % bp.distance_to(origin))
	if not bool(b.get("bodyMoved", false)):
		fails.append("② bodyMoved 没置位")

	# ③ 视图：死者的落点必须读 bodyPos（否则模型钉在死亡位置 = 玩家眼里的「拖不动」）
	var cv = CrewViewScript.new()
	var vp3: Vector3 = cv._pos3_floor(b)
	if absf(vp3.x - bp.x) > 0.01 or absf(vp3.z - bp.y) > 0.01:
		fails.append("③ 视图没用 bodyPos：模型(%0.2f,%0.2f) ≠ 尸体(%0.2f,%0.2f)"
			% [vp3.x, vp3.z, bp.x, bp.y])

	# ④ 活着的濒死者：pos 也要跟着走（AI 的目标选择读 pos），且会议中必须强制松手
	s.release_drag(me_i)
	var d_i := 2 if body_i != 2 else 3
	var d: Dictionary = s.agent(d_i)
	d["alive"] = true
	d["downed"] = true
	d["pos"] = (me.get("pos", Vector2.ZERO) as Vector2) + Vector2(0.8, 0.0)
	d["bodyPos"] = d["pos"]
	d["draggedBy"] = null
	if not s.start_drag(me_i, d_i):
		fails.append("④ 濒死者拖不起来")
	else:
		var d0: Vector2 = d.get("pos", Vector2.ZERO)
		me["pos"] = d0 + Vector2(2.5, 0.0)
		s.tick(0.1)
		if (d.get("pos", Vector2.ZERO) as Vector2).distance_to(me.get("pos", Vector2.ZERO)) > 1.2:
			fails.append("④ 濒死者的 pos 没跟着走")
		s.meeting = {"kind": "day", "phase": "discuss", "t": 10.0, "votes": {}}
		s.tick(0.1)
		if int(me.get("drag", -1)) >= 0:
			fails.append("⑤ 会议开始后仍在拖尸（没有强制松手）")
		s.meeting = {}

	# ⑥ 抢修人数上限：两名故障、六个人类 AI 在同一处 —— 单点不得超过 FIX_CREW_CAP=3
	var s2 = SimStateScript.new()
	if not s2.new_game(20261113, 0, __h.map_data, __h.space):
		print("DRAGTEST FAIL 开局失败")
		return false
	__h._finish_meeting(s2)
	s2.ai_enabled = true
	var cap := int(s2.rules.module_table("SKTeam").get("FIX_CREW_CAP", 3))
	s2.dmg = [
		{"room": "engine", "x": 5.7, "y": 49.9, "left": 30.0, "by": -1},
		{"room": "power", "x": 30.0, "y": 40.0, "left": 30.0, "by": -1},
	]
	for ai2 in range(1, 7):
		var h: Dictionary = s2.agent(ai2)
		h["alive"] = true
		h["downed"] = false
		h["detained"] = false
		h["qualPending"] = 0
		h["qual"] = 0
		h["bullet"] = 1
		h["medkit"] = 1
		h["pos"] = Vector2(10.0, 50.0) + Vector2(float(ai2) * 0.3, 0.0)
	for k2 in 40:
		s2.tick(0.1)
	var crew_a := 0
	var crew_b := 0
	for ai3 in range(1, 7):
		var h2: Dictionary = s2.agent(ai3)
		var fg: Variant = h2.get("_fixGo", null)
		if fg == null:
			continue
		var room := String((fg as Dictionary).get("room", ""))
		if room == "engine":
			crew_a += 1
		elif room == "power":
			crew_b += 1
	if crew_a > cap:
		fails.append("⑥ 单点抢修人数超上限：%d > %d" % [crew_a, cap])
	if crew_a + crew_b < 2:
		fails.append("⑥ 抢修分配没生效：engine=%d power=%d" % [crew_a, crew_b])
	return _dragtest_report(fails, " cap=%d engine=%d power=%d" % [cap, crew_a, crew_b])


static func _dragtest_report(fails: Array, extra: String = "") -> bool:
	if fails.is_empty():
		print("DRAGTEST OK 0 项失败" + extra)
		return true
	for f: String in fails:
		print("DRAGTEST FAIL " + f)
	print("DRAGTEST FAIL 共 %d 项" % fails.size())
	return false


## ---- 会议开场自测（--meetopentest）----
## 2.5D openMeeting:6205-6260 的三档开场（AI 报案人 / 玩家报案 / 无死亡）
## 与 planFirstAccuse 的定调+附议。断言的是「话真的进了发言流」，不是函数存在。


static func _run_knifebottest(__h) -> bool:
	var fails: Array = []
	var s = SimStateScript.new()
	if not s.new_game(20261108, 0, __h.map_data, __h.space):
		print("BOTTEST FAIL 开局失败")
		return false
	# _nearest_knife_any / can_act 都读 main 的 sim 成员，且开局有 pre 会议：
	# 先把会议走完、再把局部 s 挂到成员上，否则 can_act 会以 reason=meeting 全拒。
	__h._finish_meeting(s)
	__h.sim = s
	var me_idx := int(s.me_idx)
	var me: Dictionary = s.agent(me_idx)
	me["alien"] = true
	me["alive"] = true
	me["downed"] = false
	me["detained"] = false
	me["knife"] = 1
	var sec: Vector2 = s.bots.pos_of("secbot")
	me["pos"] = sec + Vector2(0.6, 0.0)
	var hp0 := int(s.bot_hp.get("secbot", 0))

	# ① 选中：刀程内、有视线 → _nearest_knife_any 必须把机器人交出来
	var pick: Dictionary = __h._nearest_knife_any()
	if String(pick.get("bot", "")) != "secbot":
		fails.append("① 选目标失败：bot=%s（期望 secbot）" % String(pick.get("bot", "")))

	# ② 守卫：逐个必须拒绝（返回 false 且不改状态）
	me["pos"] = sec + Vector2(5.0, 0.0)
	var far_chk: Dictionary = s.can_act("knife_bot", {"actor": me_idx, "bot": "secbot"})
	if bool(far_chk.get("ok", true)) or String(far_chk.get("reason", "")) != "out_of_reach":
		fails.append("② 距离守卫失败：reason=%s" % String(far_chk.get("reason", "")))
	if s.knife_bot("secbot", me_idx):
		fails.append("② 距离守卫失败：5 格外仍结算成功")
	me["pos"] = sec + Vector2(0.6, 0.0)
	me["knife"] = 0
	if s.knife_bot("secbot", me_idx):
		fails.append("② 刀数守卫失败：knife=0 仍结算")
	me["knife"] = 1
	me["downed"] = true
	if s.knife_bot("secbot", me_idx):
		fails.append("② 濒死守卫失败：downed=true 仍结算")
	me["downed"] = false
	me["detained"] = true
	if s.knife_bot("secbot", me_idx):
		fails.append("② 拘留守卫失败：detained=true 仍结算")
	me["detained"] = false
	if s.knife_bot("ghostbot", me_idx):
		fails.append("② 目标类型守卫失败：非法 kind 仍结算")

	# ③ 命中：HP -1 / 刀 -1 / 红身 / 保安转向袭击者
	var ang_before := float(s.bots.sec_ang)
	var hit_ok: bool = s.knife_bot("secbot", me_idx)
	if not hit_ok:
		fails.append("③ 命中失败：合法条件返回 false")
		return _knifebottest_report(fails)
	if int(s.bot_hp.get("secbot", 0)) != hp0 - 1:
		fails.append("③ HP 未递减：%d → %d" % [hp0, int(s.bot_hp.get("secbot", 0))])
	if int(me.get("knife", 1)) != 0:
		fails.append("③ 刀数未递减：%d" % int(me.get("knife", 1)))
	if float(me.get("redT", 0.0)) <= 0.0:
		fails.append("③ 红身未写：redT=%.2f" % float(me.get("redT", 0.0)))
	var want_ang: Variant = ((me.get("pos", Vector2.ZERO) as Vector2) - sec).angle()
	var diff := absf(wrapf(float(s.bots.sec_ang) - want_ang, -PI, PI))
	if diff > 0.02:
		fails.append("③ 保安未转向袭击者：ang %.3f ≠ %.3f（Δ%.3f）"
			% [float(s.bots.sec_ang), want_ang, diff])
	if is_equal_approx(ang_before, float(s.bots.sec_ang)) and diff <= 0.02:
		pass

	# ④ 已停摆的机器人不能再打
	s.bots.kill("secbot")
	if s.knife_bot("secbot", me_idx):
		fails.append("④ 已停摆机器人仍被结算")
	return _knifebottest_report(fails)


static func _knifebottest_report(fails: Array) -> bool:
	if fails.is_empty():
		print("BOTTEST OK 0 项失败")
		return true
	for f: String in fails:
		print("BOTTEST FAIL " + f)
	print("BOTTEST FAIL 共 %d 项" % fails.size())
	return false
