extends RefCounted
## 战斗与追猎自测：出刀、机器人、B4/B6 系统
##
## 2026-11-12 从 main.gd 迁出（大文件拆分：main.gd 9,580 → 5,5xx 行）。
## 约定：全部 static，宿主实例经 __h 传入；本文件不持有任何状态，不直接读 Engine 单例。
## 调用：TestCombat._run_xxx(self)  —— 见 main.gd 的参数分发。

const SimStateScript := preload("res://scripts/sim/sim_state.gd")
const SpaceData := preload("res://scripts/space_data.gd")

static func _run_knifetest(__h) -> void:
	## 玩家侧真实攻击链（用户 2026-11-10 反馈「作为异形无法出手」）：
	## 以异形身份开局 → 目标站到刀程内正前方 → 派发**真实左键** → 必须把人放倒。
	var fails: Array = []
	__h.role = "alien"
	if not __h.sim.new_game(__h._cur_seed, 0, __h.map_data, __h.space, true):
		print("KNIFETEST FAIL new_game")
		__h._knifetest_ok = false
		return
	__h.sim.ai_enabled = true
	__h._finish_meeting(__h.sim)
	await __h.get_tree().create_timer(0.3).timeout
	var me: Dictionary = __h.sim.me()
	if not bool(me.get("alien", false)):
		fails.append("玩家没被设成异形")
	var vic: Dictionary = {}
	for a: Dictionary in __h.sim.agents:
		if int(a.get("i", -1)) != int(__h.sim.me_idx):
			vic = a
			break
	# 目标放在正前方 1.0m（刀程默认 1.4），并把朝向真正对准它。
	# Godot 的前方是 -Z：rotation.y=θ 时 forward=(-sinθ,0,-cosθ)，
	# 所以 θ = atan2(-dir.x, -dir.z)。写成 atan2(dir.x, dir.z) 会正好朝反。
	var base: Vector3 = __h.player.global_position
	var dir := Vector3(0, 0, -1)
	__h.player.rotation.y = atan2(-dir.x, -dir.z)
	var p: Vector3 = base + dir * 1.0
	vic["pos"] = Vector2(p.x, p.z)
	vic["alive"] = true
	vic["downed"] = false
	me["knife"] = 1
	me["alive"] = true
	me["downed"] = false
	me["detained"] = false
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	# 夹具口径：真实游玩从「已捕获」开始；测试里 mouse_released 还是开始页的 true，
	# 不重置的话第一下左键会被当成「从 UI 夺回鼠标」，攻击链根本不会被调用。
	__h.mouse_released = false
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame

	# 真实左键（不带坐标，走 _input 的 CAPTURED 分支）
	var dn: Variant = InputEventMouseButton.new()
	dn.button_index = MOUSE_BUTTON_LEFT
	dn.pressed = true
	Input.parse_input_event(dn)
	var up: Variant = InputEventMouseButton.new()
	up.button_index = MOUSE_BUTTON_LEFT
	up.pressed = false
	Input.parse_input_event(up)
	await __h.get_tree().create_timer(0.3).timeout

	var downed := bool(vic.get("downed", false))
	var knife_after := int(me.get("knife", -1))
	var aimed: Variant = __h._aim_target(SpaceData.num(__h.space, "reach", "knife"), 0.55)
	print("KNIFETEST 异形=%s 目标=%s 命中=%s 剩余刀=%d 瞄到=%s" % [
		str(bool(me.get("alien", false))), String(vic.get("name", "")), str(downed),
		knife_after, String(aimed.get("name", ""))])
	if not downed:
		fails.append("左键出刀没放倒目标")
	if knife_after != 0:
		fails.append("刀数没有扣（=%d）" % knife_after)
	# 右键开枪链（人类也能用；这里只验入口不被吞）
	print("KNIFETEST %s %d 项失败 %s" % ["OK" if fails.is_empty() else "FAIL", fails.size(), str(fails)])
	__h._knifetest_ok = fails.is_empty()


## 真实按键/鼠标注入（玩家探针用）：按下 → 至少跨一帧 → 松开。
## 不能用直接调 sim / 内部动作函数代替——那验不出「输入链有没有接上」。


static func _run_bottest(__h) -> bool:
	var pass_n := 0
	var fail_n := 0
	var s = SimStateScript.new()
	if not s.new_game(20261111, 0, __h.map_data, __h.space):
		print("BOTTEST FAIL 开局失败")
		return false
	s.ai_enabled = false
	__h._finish_meeting(s)
	var b = s.bots
	if b == null:
		print("BOTTEST FAIL bots 没有初始化")
		return false
	pass_n += 1
	# ① 巡逻
	var p0: Vector2 = b.sec_pos
	for k in 30:
		s.tick(0.1)
	var moved: float = p0.distance_to(b.sec_pos)
	if moved > 0.5:
		pass_n += 1
	else:
		fail_n += 1
		print("BOTTEST FAIL 保安没有巡逻 moved=%.2f" % moved)
	# ② 保安正前方 2 格出刀 → 必须被盯上
	var killer: Dictionary = {}
	var victim: Dictionary = {}
	for a: Dictionary in s.agents:
		if bool(a.get("alien", false)) and killer.is_empty():
			killer = a
		elif not bool(a.get("alien", false)) and int(a.get("i", -1)) != int(s.me_idx) \
				and victim.is_empty():
			victim = a
	if killer.is_empty() or victim.is_empty():
		print("BOTTEST FAIL 找不到异形/受害者")
		return false
	var fwd := Vector2(cos(b.sec_ang), sin(b.sec_ang))
	killer["pos"] = b.sec_pos + fwd * 2.0
	victim["pos"] = (killer["pos"] as Vector2) + Vector2(0.4, 0.0)
	s.knife(int(killer.get("i", -1)), int(victim.get("i", -1)))
	if not b.catch_state.is_empty():
		pass_n += 1
	else:
		fail_n += 1
		print("BOTTEST FAIL 保安没抓到现行（视野 %.1f 格）" % b.SEC_RANGE)
	# ③ 押送到拘留位 + 拘留
	var held := false
	var jailed := false
	for k in 260:
		s.tick(0.1)
		if bool(killer.get("detained", false)):
			held = true
			if String(b.catch_state.get("phase", "")) == "jail":
				jailed = true
				break
	if held and jailed:
		pass_n += 1
	else:
		fail_n += 1
		print("BOTTEST FAIL 没有进入拘留状态 held=%s phase=%s" % [
			str(held), String(b.catch_state.get("phase", "none"))])
	# ④ 30 秒后释放
	var freed := false
	for k in 400:
		s.tick(0.1)
		if not bool(killer.get("detained", false)) and b.catch_state.is_empty():
			freed = true
			break
	if freed:
		pass_n += 1
	else:
		fail_n += 1
		print("BOTTEST FAIL 拘留没有到期释放")

	# ⑤ 医疗无人机救濒死者（重开一局，把人放倒在医疗间坞位旁边）
	if not s.new_game(20261112, 0, __h.map_data, __h.space):
		print("BOTTEST FAIL 第二局开局失败")
		return false
	s.ai_enabled = false
	__h._finish_meeting(s)
	var v2: Dictionary = {}
	var k2: Dictionary = {}
	for a: Dictionary in s.agents:
		if bool(a.get("alien", false)) and k2.is_empty():
			k2 = a
		elif not bool(a.get("alien", false)) and int(a.get("i", -1)) != int(s.me_idx) \
				and v2.is_empty():
			v2 = a
	v2["pos"] = s.bots.med_home + Vector2(1.5, 0.0)
	s.knife(int(k2.get("i", -1)), int(v2.get("i", -1)))
	var was_downed := bool(v2.get("downed", false))
	# 2.5D MEDBOT_HEAL_TIME=7 秒近身读条 + 飞到 MEDBOT_TOUCH_R 内的时间；
	# 6 秒（旧夹具）不够，濒死倒计时 12 秒内留足余量。
	for k in 110:
		s.tick(0.1)
	var revived := false
	for e: Dictionary in s.events:
		if String(e.get("kind", "")) == "revive":
			revived = true
	if was_downed and revived and not bool(v2.get("downed", false)):
		pass_n += 1
	else:
		fail_n += 1
		print("BOTTEST FAIL 医疗无人机没救人 was_downed=%s revived=%s downed=%s" % [
			str(was_downed), str(revived), str(v2.get("downed", false))])
	# 追捕超时 7 秒 → 放弃（2.5D：贴不到人就 G.secCatch=null，不是硬拖走）。
	# 把目标放到很远的地方，模拟"追不上"，tick 满 8 秒后必须已释放。
	var far: Dictionary = s.agent(9)
	if not far.is_empty():
		b.sec_uses = 0
		b.catch_state = {}
		far["alive"] = true
		far["downed"] = false
		b._start_catch(9)
		far["pos"] = b.sec_pos + Vector2(60.0, 0.0)
		for k3 in 90:
			s.tick(0.1)
		if s.bots.catch_state.is_empty() and not bool(far.get("detained", false)):
			pass_n += 1
		else:
			fail_n += 1
			print("BOTTEST FAIL 追捕超时没放弃 phase=%s detained=%s" % [
				str(s.bots.catch_state.get("phase", "")), str(far.get("detained", false))])
		b.sec_uses = 0
	else:
		fail_n += 1
		print("BOTTEST FAIL 追捕超时夹具没能起手")
	print("BOTTEST pass=%d fail=%d 保安(%.1f,%.1f) 巡逻位移=%.2f 视野=%.1fm 拘留=%.0fs 每夜=%d" % [
		pass_n, fail_n, b.sec_pos.x, b.sec_pos.y, moved, b.SEC_RANGE, b.DETAIN_TIME, b.SEC_USES_MAX])
	return fail_n == 0


## ---- 角色门禁（--roletest）----
## 选人类 → 0 号席位不是异形、全船仍是 4 个异形；
## 选异形 → 0 号席位就是异形、全船仍是 4 个（不能变成 5 个）。


static func _run_b4test(__h) -> bool:
	var pass_n := 0
	var fail_n := 0
	# _sync_player_pos 在会议期间不写位置（2.5D pauseClock 同源）；先收掉开局 pre 会。
	__h._finish_meeting(__h.sim)
	# ① 玩家真实位置进入 sim
	__h.player.global_position = Vector3(40.0, 0.05, 30.0)
	__h._sync_player_pos()
	var pp: Vector2 = __h.sim.me().get("pos", Vector2.ZERO)
	if pp.distance_to(Vector2(40.0, 30.0)) < 0.1:
		pass_n += 1
	else:
		fail_n += 1
		print("B4TEST FAIL 玩家位置没同步 pos=%s" % str(pp))
	# ② 管道出口选择 + 真传送
	# 2026-11-11 机制对齐：管道门禁真源是 sim.me().alien，旧夹具只改 role，
	# 正好掩盖了「开始页解锁、模拟层没能力」的双源漏洞。
	var was_alien_b4 := bool(__h.sim.me().get("alien", false))
	__h.role = "alien"
	__h.sim.me()["alien"] = true
	__h._pipe_cd = 0.0
	var from_port: Dictionary = __h.extras.pipe_ports[0]
	var to_port: Dictionary = __h.extras.pipe_ports[1]
	__h._use_pipe(from_port)
	if __h._pipe_open and __h.pipe_panel != null and __h.pipe_panel.visible:
		pass_n += 1
	else:
		fail_n += 1
		print("B4TEST FAIL 出口面板没打开")
	var want: Vector3 = to_port["pos"] as Vector3
	__h._travel_pipe(to_port)
	var got: Variant = __h.player.global_position
	var pipe_ev := false
	for e: Dictionary in __h.sim.events:
		if String(e.get("kind", "")) == "pipe":
			pipe_ev = true
	if got.distance_to(Vector3(want.x, 0.05, want.z)) < 2.0 and pipe_ev \
			and __h._pipe_cd >= SpaceData.num(__h.space, "pipe", "cooldown") - 0.01 \
			and not __h._pipe_open:
		pass_n += 1
	else:
		fail_n += 1
		print("B4TEST FAIL 传送/事件/冷却 pos=%s ev=%s cd=%.1f" % [str(got), str(pipe_ev), __h._pipe_cd])
	# ③ 冷却内不能再开面板 + 人类禁用
	__h._use_pipe(from_port)
	if not __h._pipe_open:
		pass_n += 1
	else:
		fail_n += 1
		print("B4TEST FAIL 冷却没挡住第二次钻管道")
	__h.role = "human"
	__h.sim.me()["alien"] = false
	__h._pipe_cd = 0.0
	__h._use_pipe(from_port)
	if not __h._pipe_open:
		pass_n += 1
	else:
		fail_n += 1
		print("B4TEST FAIL 人类居然能钻管道")
	__h.role = "alien"
	__h.sim.me()["alien"] = was_alien_b4
	# ④ 开枪：给一发子弹，把目标放到近处，走真源射程 / LOS
	var shooter: Dictionary = __h.sim.me()
	var target: Dictionary = {}
	for a: Dictionary in __h.sim.agents:
		if int(a.get("i", -1)) != int(__h.sim.me_idx) and bool(a.get("alive", false)) \
				and not bool(a.get("downed", false)):
			target = a
			break
	shooter["pos"] = Vector2(40.0, 30.0)
	target["pos"] = Vector2(42.0, 30.0)
	shooter["bullet"] = 1
	var shot_ok: bool = __h.sim.shoot(int(__h.sim.me_idx), int(target.get("i", -1)))
	if shot_ok and bool(target.get("downed", false)) and int(shooter.get("bullet", 0)) == 0:
		pass_n += 1
	else:
		fail_n += 1
		print("B4TEST FAIL 开枪没生效 ok=%s downed=%s" % [str(shot_ok), str(target.get("downed", false))])
	# ⑤ 搜尸：造一具带 2 发子弹的尸体，搜一次得物资、第二次被拒
	target["alive"] = false
	target["downed"] = false
	target["bodyGone"] = false
	target["bodyPos"] = Vector2(40.5, 30.0)
	target["bullet"] = 2
	var before := int(shooter.get("bullet", 0))
	var s1: bool = __h.sim.search_body(int(target.get("i", -1)), int(__h.sim.me_idx))
	var after := int(shooter.get("bullet", 0))
	var s2: bool = __h.sim.search_body(int(target.get("i", -1)), int(__h.sim.me_idx))
	if s1 and not s2 and after == before + 2:
		pass_n += 1
	else:
		fail_n += 1
		print("B4TEST FAIL 搜尸 s1=%s s2=%s 弹 %d→%d" % [str(s1), str(s2), before, after])
	# ⑥ 会议三段：discuss → vote → result → 关闭，结果里要有投票矩阵
	var m = SimStateScript.new()
	m.new_game(20261113, 0, __h.map_data, __h.space)
	m.ai_enabled = false
	__h._finish_meeting(m)
	var v: Variant = m.agent(3)
	v["alive"] = false
	v["bodyPos"] = Vector2(31.0, 33.5)
	m.open_meeting(0, 3)
	var ph1 := String(m.meeting.get("phase", ""))
	m.skip_discussion()
	m.tick(0.01)
	var ph2 := String(m.meeting.get("phase", ""))
	# ai_enabled=false（AI 全关）下 _cast_ai_votes 不会替 AI 落票 ——
	# 投票矩阵由显式投票构造（与 b6test 的 vote_change 断言同一口径）。
	m.cast_vote(0, 2)
	m.cast_vote(1, 2)
	var votes_n: int = (m.meeting.get("votes", {}) as Dictionary).size()
	for k in 60:
		m.tick(0.1)
	var ph3 := String(m.meeting.get("phase", ""))
	var matrix_n: int = (((m.meeting.get("result", {}) as Dictionary).get("matrix", {})) as Dictionary).size()
	for k in 40:
		if m.meeting.is_empty():
			break
		m.tick(0.1)
	if ph1 == "discuss" and ph2 == "vote" and votes_n > 0 and ph3 == "result" \
			and matrix_n > 0 and m.meeting.is_empty():
		pass_n += 1
	else:
		fail_n += 1
		print("B4TEST FAIL 会议相位 %s→%s→%s 票数=%d 矩阵=%d empty=%s" % [
			ph1, ph2, ph3, votes_n, matrix_n, str(m.meeting.is_empty())])
	print("B4TEST pass=%d fail=%d 管道口=%d 射程=%.0fm 冷却=%.0fs" % [
		pass_n, fail_n, __h.extras.pipe_ports.size(), SpaceData.num(__h.space, "shoot", "range"),
		SpaceData.num(__h.space, "pipe", "cooldown")])
	return fail_n == 0


## ---- 机器人门禁（--bottest）----
## ① 保安真的在巡逻（位置会变）② 视野内出刀会被抓 ③ 抓到后 30 秒才放
## ④ 医疗无人机能把濒死者救起来。全部只读 sim 状态与事件流。


static func _run_b6test(__h) -> bool:
	var pass_n := 0
	var fail_n := 0
	var s = SimStateScript.new()
	if not s.new_game(20261116, 0, __h.map_data, __h.space):
		print("B6TEST FAIL 开局失败")
		return false
	s.ai_enabled = false
	__h._finish_meeting(s)
	# ① 拖尸 → 藏尸（非会议室）
	var v: Variant = s.agent(3)
	v["alive"] = false
	v["bodyPos"] = Vector2(31.0, 33.5)
	var carrier: Variant = s.agent(1)
	carrier["pos"] = Vector2(31.0, 33.5)
	var d1: bool = s.start_drag(1, 3)
	carrier["pos"] = Vector2(55.0, 85.6)      # 医疗间
	s.tick(0.05)
	# 2.5D syncDragOf：尸体被拉到拖拽者身后 **0.62 格**（目标点被掩体挡住时
	# 由 nearestFree 就近落地，实测 1.8 格）。旧断言按「瞬移到脚下」写（<0.01），
	# 移植后必须按「跟着走 + 不会离太远」验收，而不是要求坐标相等。
	var follow_d: Variant = (v["bodyPos"] as Vector2).distance_to(Vector2(55.0, 85.6))
	var followed: Variant = follow_d > 0.25 and follow_d < 2.5
	# 放回非医疗舱再拖一次，落到藏尸分支
	var v2: Variant = s.agent(4)
	v2["alive"] = false
	v2["bodyPos"] = Vector2(31.0, 33.5)
	s.release_drag(1)
	s.start_drag(1, 4)
	s.agent(1)["pos"] = Vector2(80.0, 75.0)   # 军械库
	s.tick(0.05)
	s.release_drag(1)
	var hidden := bool(v2.get("bodyGone", false))
	var drag_ev: Variant = __h._has_kind(s, "drag_start") and __h._has_kind(s, "drag_end") \
		and __h._has_kind(s, "drag_away")
	if d1 and followed and hidden and drag_ev:
		pass_n += 1
	else:
		fail_n += 1
		print("B6TEST FAIL 拖尸 d1=%s follow=%s(%.2f) hidden=%s ev=%s" % [
			str(d1), str(followed), follow_d, str(hidden), str(drag_ev)])
	# ② 机器人 HP：保安 2 发拆掉
	# 站位由 map_v2 的 facility.secbot 推出来（正下方 4.6m），不再写死坐标：
	# 地图换布局后写死的点会被新掩体挡住射线，hit_bot 直接返回 false
	# （2026-11-10 实测旧坐标 80,75 已被 armory_workbench 挡住）。
	var sec_fac := {}
	for f0: Dictionary in (s.map.get("facility", []) as Array):
		if String(f0.get("kind", "")) == "secbot":
			sec_fac = f0
			break
	var me: Dictionary = s.me()
	if sec_fac.is_empty():
		me["pos"] = Vector2(80.0, 75.0)
	else:
		me["pos"] = Vector2(float(sec_fac.get("x", 0)), float(sec_fac.get("y", 0)) + 4.6)
	me["bullet"] = 3
	var h1: bool = s.hit_bot(0, "secbot")
	var h2: bool = s.hit_bot(0, "secbot")
	var dead_sec: bool = s.bots.is_dead("secbot")
	var bot_ev: Variant = __h._has_kind(s, "bot_hit") and __h._has_kind(s, "bot_down")
	if h1 and h2 and dead_sec and bot_ev:
		pass_n += 1
	else:
		fail_n += 1
		print("B6TEST FAIL 机器人 HP h1=%s h2=%s dead=%s ev=%s" % [
			str(h1), str(h2), str(dead_sec), str(bot_ev)])
	# ③ 供电同步到 sim
	var pw0: bool = bool(s.power_on)
	s.toggle_power(0)
	var pw1: bool = bool(s.power_on)
	if pw0 != pw1 and __h._has_kind(s, "breaker"):
		pass_n += 1
	else:
		fail_n += 1
		print("B6TEST FAIL 供电 %s→%s" % [str(pw0), str(pw1)])
	# ④ 旁观：0 号由 AI 接管、会移动
	var sp = SimStateScript.new()
	sp.new_game(20261117, 0, __h.map_data, __h.space)
	sp.spectator = true
	__h._finish_meeting(sp)
	var p0: Vector2 = sp.agent(0).get("pos", Vector2.ZERO)
	for k in 250:
		sp.tick(0.1)
	var p1: Vector2 = sp.agent(0).get("pos", Vector2.ZERO)
	if bool(sp.spectator) and p0.distance_to(p1) > 0.5:
		pass_n += 1
	else:
		fail_n += 1
		print("B6TEST FAIL 旁观 0 号没被 AI 接管 moved=%.2f" % p0.distance_to(p1))
	# ⑤ 设置 / 复盘面板
	__h.ui_panels.open_replay(s.events)
	var rt: String = __h.ui_panels.replay_list.text
	__h.ui_panels.close_all()
	if rt.contains("game_start") and (rt.contains("drag") or rt.contains("chat")):
		pass_n += 1
	else:
		fail_n += 1
		print("B6TEST FAIL 复盘没渲染事件流")
	# ⑥ 会议报账 / 天亮 / 改票 / 讨论超时都进了事件流
	var s3 = SimStateScript.new()
	s3.new_game(20261118, 0, __h.map_data, __h.space)
	s3.ai_enabled = false
	var v3: Variant = s3.agent(5)
	v3["alive"] = false
	v3["bodyPos"] = Vector2(31.0, 33.5)
	s3.open_meeting(0, 5)
	for k in 2200:
		if bool(s3.over):
			break
		s3.tick(0.1)
	# 2.5D logEvent('vote_change')（js/game.js:7398）只在**真改票**时记。
	# 第七批修复了 cast_vote 把 `votes.has()` 写在赋值之后、导致每票都被记成改票的 bug；
	# 此前本断言是靠那个 bug 通过的（AI 两轮投票覆盖时刷出一串假 vote_change）。
	# 现在按真源显式构造 vote 相位，让 0 号先投 2 号、再改投 3 号，验证真改票才记事件。
	s3.meeting = {"phase": "vote", "votes": {}, "t": 5.0}
	s3.cast_vote(0, 2)
	s3.cast_vote(0, 3)
	var needed := ["account", "night_start", "meeting_overtime", "vote_change"]
	var all_ev := true
	for k2: String in needed:
		if not __h._has_kind(s3, k2):
			all_ev = false
			print("B6TEST 缺事件 " + k2)
	if all_ev:
		pass_n += 1
	else:
		fail_n += 1
	print("B6TEST pass=%d fail=%d" % [pass_n, fail_n])
	return fail_n == 0
