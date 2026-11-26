extends RefCounted
## DEV 探针与交互输入自测：出刀、左键、轮盘、DEV 透视、动作、空轮盘、施救、站桩
##
## 2026-11-26 从 test_world.gd 迁出拆段，供 TestWorld._run_probetest 薄转发调用。

const SpaceData := preload("res://scripts/space_data.gd")


static func _place_pair(__h, me: Dictionary, victim: Dictionary) -> void:
	me["alive"] = true
	me["downed"] = false
	me["detained"] = false
	me["knife"] = 1
	victim["pos"] = Vector2(__h.player.global_position.x, __h.player.global_position.z - 1.0)
	victim["alive"] = true
	victim["downed"] = false
	victim["detained"] = false
	victim["killedBy"] = -1
	victim["deathCause"] = ""


static func _probe_setup(__h, fails: Array) -> Dictionary:
	__h.role = "alien"
	__h.sim.ai_enabled = false
	if not __h.sim.new_game(__h._cur_seed, 0, __h.map_data, __h.space, true):
		print("PROBETEST FAIL new_game")
		__h._probetest_ok = false
		return {"ok": false}
	__h.sim.spectator = false
	__h._finish_meeting(__h.sim)
	__h.sim.meeting = {}
	if __h.crew_view != null:
		__h.crew_view.build(__h.sim)
		print("CREW_VIEW models=%d billboards=%d" % [
			__h.crew_view._models.size(), __h.crew_view._sprites.size()])
		# 漂移回归：moving=true 必须切 walk，回到静止必须切 idle。
		var anim_i: int = -1
		for a: Dictionary in __h.sim.agents:
			var ai := int(a.get("i", -1))
			if ai != int(__h.sim.me_idx) and __h.crew_view._anims.has(ai):
				anim_i = ai
				break
		if anim_i >= 0:
			var aa: Dictionary = __h.sim.agent(anim_i)
			aa["moving"] = true
			__h.crew_view.sync(__h.sim, 0.016)
			var walk_now := String((__h.crew_view._anims[anim_i] as AnimationPlayer).current_animation)
			aa["moving"] = false
			__h.crew_view.sync(__h.sim, 0.016)
			var idle_now := String((__h.crew_view._anims[anim_i] as AnimationPlayer).current_animation)
			print("CREW_ANIM_SWITCH walk=%s idle=%s" % [walk_now, idle_now])
			if not walk_now.to_lower().contains("walk"):
				fails.append("moving=true 没有切 walk（=%s）" % walk_now)
			if not idle_now.to_lower().contains("idle"):
				fails.append("moving=false 没有切 idle（=%s）" % idle_now)
	var me: Dictionary = __h.sim.me()
	if not bool(me.get("alien", false)):
		fails.append("玩家没被设成异形")
	# 其他人先挪到远处：AI 关了但 tick 仍会跑，避免目标被别的逻辑拖走。
	var victim: Dictionary = {}
	for a: Dictionary in __h.sim.agents:
		if int(a.get("i", -1)) == int(__h.sim.me_idx):
			continue
		a["pos"] = Vector2(6.0, 6.0)
		a["path"] = PackedVector2Array()
		a["moving"] = false
		a["doing"] = 0.0
		if victim.is_empty() and not bool(a.get("alien", false)):
			victim = a
	if victim.is_empty():
		print("PROBETEST FAIL 夹具没找到人类目标")
		__h._probetest_ok = false
		return {"ok": false}
	__h.player.global_position = Vector3(31.0, 0.05, 33.5)
	__h.player.rotation.y = 0.0   # 前方 -Z
	__h.player.ui_locked = false
	__h.mouse_released = false
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	__h._e_down = false
	if __h.wheel != null and __h.wheel.is_open():
		__h.wheel.close()
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame
	return {"ok": true, "me": me, "victim": victim}


static func _probe_attack_phase(__h, me: Dictionary, victim: Dictionary, fails: Array) -> void:
	# ① 交互扫描：站位正前方 1.0m 有人，E 的候选里必须有 attack
	_place_pair(__h, me, victim)
	await __h.get_tree().process_frame
	var offers: Array = __h._collect_offers()
	var ids: Array = []
	var has_attack := false
	for o: Dictionary in offers:
		var oid := String(o.get("id", ""))
		ids.append(oid)
		if oid == "attack":
			has_attack = true
	print("PROBE ① 交互项=%d [%s] 有出刀=%s" % [offers.size(),
		", ".join(PackedStringArray(ids)), str(has_attack)])
	if not has_attack:
		fails.append("E 的候选里没有 attack（旁边有人却打不了）")

	# ② 真实 E：单项直接执行 → 目标濒死、刀数 -1
	__h._e_down = false
	await __h._tap_key(KEY_E)
	await __h.get_tree().process_frame
	var e_downed := bool(victim.get("downed", false))
	print("PROBE ② 真实 E → 濒死=%s 剩余刀=%d" % [str(e_downed), int(me.get("knife", -1))])
	if not e_downed:
		fails.append("真实 E 没有放倒目标")
	if int(me.get("knife", -1)) != 0:
		fails.append("E 出刀后刀数不是 0（=%d）" % int(me.get("knife", -1)))

	# ③ 真实左键：同一套结算
	_place_pair(__h, me, victim)
	__h._knife_cd = 0.0
	# 跑批时窗口可能失焦 → `mouse_released=true`；按设计那时第一次点击是「从 UI 夺回
	# 鼠标」，不会出刀（main.gd:5449）。夹具要验的是出刀，先把这面旗清掉再捕获鼠标，
	# 否则会读到「点了但没打」的假红（HEAD 上 6 次里抖 2 次）。
	__h.mouse_released = false
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	await __h.get_tree().process_frame
	var aim_dbg: Dictionary = __h._aim_target(SpaceData.num(__h.space, "reach", "knife"), 0.55)
	print("PROBE ③ 前置 mouse=%d released=%s cd=%.2f 瞄到=%s 目标pos=%s 我pos=%s" % [
		Input.mouse_mode, str(__h.mouse_released), __h._knife_cd, String(aim_dbg.get("name", "")),
		str(victim.get("pos", Vector2.ZERO)), str(me.get("pos", Vector2.ZERO))])
	await __h._tap_mouse(MOUSE_BUTTON_LEFT)
	await __h.get_tree().process_frame
	print("PROBE ③ 真实左键 → 濒死=%s 剩余刀=%d 探针=%s" % [
		str(bool(victim.get("downed", false))), int(me.get("knife", -1)), str(__h._probe_lines)])
	if not bool(victim.get("downed", false)):
		fails.append("真实左键没有放倒目标")


static func _probe_wheel_phase(__h, me: Dictionary, victim: Dictionary, fails: Array) -> void:
	# ④ 多项轮盘：站在设备旁、目标仍在刀程内 → E 打开轮盘，选「出刀」
	var dev: Variant = null
	for d in __h.extras.devices:
		if is_instance_valid(d) and d.point_index >= 0:
			dev = d
			break
	if dev == null:
		fails.append("夹具没找到任务设备")
		return
	var face: Vector3 = dev.face_dir()
	__h.player.global_position = Vector3(dev.global_position.x, 0.05, dev.global_position.z) + face * 1.6
	__h.player.rotation.y = atan2(face.x, face.z)
	_place_pair(__h, me, victim)
	victim["pos"] = Vector2(__h.player.global_position.x - sin(__h.player.rotation.y) * 1.0,
		__h.player.global_position.z - cos(__h.player.rotation.y) * 1.0)
	__h._knife_cd = 0.0
	__h._e_down = false
	await __h.get_tree().process_frame
	var multi: Array = __h._collect_offers()
	var multi_ids: Array = []
	for o2: Dictionary in multi:
		multi_ids.append(String(o2.get("id", "")))
	print("PROBE ④ 设备旁交互项=%d [%s]" % [multi.size(),
		", ".join(PackedStringArray(multi_ids))])
	if multi.size() < 2:
		fails.append("设备旁没有形成多项轮盘（只有 %d 项）" % multi.size())
		return
	await __h._tap_key(KEY_E)
	await __h.get_tree().process_frame
	if __h.wheel == null or not __h.wheel.is_open():
		fails.append("多项交互按 E 没打开轮盘")
		return
	# 轮盘槽位 = `_ranked_offers` 的顺序（按行动价值），**不是** `_collect_offers`
	# 的收集顺序：设备旁 task(rank 1) 排在 attack(rank 7) 前面，所以「按 1」
	# 选中的是任务小游戏。旧断言写死「按 1 = 出刀」，因此长期假红。
	# 这里按 id 找「出刀」的真实槽位，断言的才是「轮盘里选出刀能放倒目标」。
	var slot := -1
	var ranked: Array = __h._ranked_offers(multi)
	for si in ranked.size():
		if String((ranked[si] as Dictionary).get("id", "")).begins_with("attack"):
			slot = si
			break
	if slot < 0:
		fails.append("轮盘里没有「出刀」项")
		return
	await __h._tap_key(KEY_1 + slot)
	await __h.get_tree().process_frame
	print("PROBE ④ 轮盘按 %d（出刀槽位）→ 濒死=%s 轮盘关闭=%s" % [slot + 1,
		str(bool(victim.get("downed", false))), str(not __h.wheel.is_open())])
	if not bool(victim.get("downed", false)):
		fails.append("轮盘选出刀没有放倒目标")
	if __h.wheel.is_open():
		fails.append("轮盘选出刀后没有关闭")


static func _probe_dev_phase(__h, me: Dictionary, victim: Dictionary, fails: Array) -> void:
	# ⑤ F2 DEV 透视 / F3 文字总览 / 无敌（2026-11-11 PLAN §五）
	# ④ 真的出刀可能触发报案 → 夜会开着。夜会期间 `_sync_player_pos` **不回写**玩家位置
	# （2.5D 会议冻结玩家），于是「玩家在会议室、射手在 2 格内」的几何前置全部落空，
	# DEV 拦截会假红（shot=false 但子弹没扣）。先按夹具惯例把会议清掉。
	if not __h.sim.meeting.is_empty():
		__h.sim.meeting = {}
	# 先保证玩家活着、回到会议室开阔处（设备旁边可能有掩体挡枪线）
	__h.player.global_position = Vector3(31.0, 0.05, 33.5)
	__h.player.rotation.y = 0.0
	me["alive"] = true
	me["downed"] = false
	me["knife"] = 1
	await __h.get_tree().process_frame
	await __h._tap_key(KEY_F2)
	await __h.get_tree().process_frame
	await __h._tap_key(KEY_F3)
	await __h.get_tree().process_frame
	var dev_on := bool(__h.sim.dev)
	var esp_on: bool = __h.esp_canvas != null and __h.esp_canvas.visible
	var panel_on: bool = __h.dev_panel != null and __h.dev_panel.visible
	var row0 := String((__h._dev_row_labels[0] as Label).text) if not __h._dev_row_labels.is_empty() else ""
	print("PROBE ⑤ F2/F3 → dev=%s 透视=%s 文字总览=%s 首行=%s" % [
		str(dev_on), str(esp_on), str(panel_on), row0])
	if not dev_on:
		fails.append("F2 没有打开 DEV")
	if not esp_on:
		fails.append("F2 没有打开透视 ESP")
	if not panel_on:
		fails.append("F3 没有打开 DEV 文字总览")
	if not row0.contains("异形") or not row0.contains("（你）"):
		fails.append("DEV 首行没有显示玩家身份（%s）" % row0)
	# 真实窗口下留一张 DEV 实拍，方便人工核对排版（headless 没有渲染目标）。
	if DisplayServer.get_name() != "headless":
		await RenderingServer.frame_post_draw
		var img: Image = __h.get_viewport().get_texture().get_image()
		var shot_path := "user://probe-dev.png"
		img.save_png(shot_path)
		print("PROBESHOT_PATH=", ProjectSettings.globalize_path(shot_path))
	# 无敌：人类开枪打玩家 → 不濒死、子弹照扣
	victim["downed"] = false
	victim["alive"] = true
	victim["bullet"] = 1
	victim["pos"] = Vector2(__h.player.global_position.x + 2.0, __h.player.global_position.z)
	var shot: bool = __h.sim.shoot(int(victim.get("i", -1)), int(__h.sim.me_idx))
	var shot_blocked: bool = (not shot) and not bool(me.get("downed", false)) \
		and int(victim.get("bullet", -1)) == 0
	print("PROBE ⑤ DEV 挨枪 → 生效=%s 玩家濒死=%s 子弹=%d" % [
		str(shot), str(bool(me.get("downed", false))), int(victim.get("bullet", -1))])
	if not shot_blocked:
		fails.append("DEV 没有拦住 AI 开枪（shot=%s downed=%s bullet=%d）" % [
			str(shot), str(bool(me.get("downed", false))), int(victim.get("bullet", -1))])
	if __h.sim.die(me):
		fails.append("DEV 没有拦住死亡")
	# 无敌：驱逐
	__h.sim.meeting = {"kind": "day", "phase": "vote", "seq": 900,
		"votes": {0: int(__h.sim.me_idx), 1: int(__h.sim.me_idx), 2: int(__h.sim.me_idx),
			3: int(__h.sim.me_idx), 4: int(__h.sim.me_idx)}}
	__h.sim._close_meeting()
	var res: Dictionary = __h.sim.meeting.get("result", {}) as Dictionary
	print("PROBE ⑤ DEV 被投 → 存活=%s devSaved=%s" % [
		str(bool(me.get("alive", false))), str(bool(res.get("devSaved", false)))])
	if not bool(me.get("alive", false)) or not bool(res.get("devSaved", false)):
		fails.append("DEV 没有拦住驱逐")
	__h.sim.meeting = {}
	await __h._tap_key(KEY_F2)
	await __h.get_tree().process_frame
	if bool(__h.sim.dev):
		fails.append("F2 第二次没有关闭 DEV")
	if __h.esp_canvas != null and __h.esp_canvas.visible:
		fails.append("F2 关闭后透视 ESP 还在")
	if __h.dev_panel != null and __h.dev_panel.visible:
		fails.append("DEV 关闭后文字总览还在")


static func _probe_anim_phase(__h, fails: Array) -> void:
	# ⑥ knife / down 动作：AI 出刀 → actor 播 knife；受害者倒地 → 播 down。
	var actor_i: int = -1
	var victim2: int = -1
	for a: Dictionary in __h.sim.agents:
		var ai := int(a.get("i", -1))
		if ai == int(__h.sim.me_idx):
			continue
		if bool(a.get("alien", false)) and actor_i < 0:
			actor_i = ai
		elif not bool(a.get("alien", false)) and victim2 < 0:
			victim2 = ai
	if actor_i >= 0 and victim2 >= 0 and __h.crew_view != null \
			and __h.crew_view._anims.has(actor_i) and __h.crew_view._anims.has(victim2):
		var aa: Dictionary = __h.sim.agent(actor_i)
		var vv: Dictionary = __h.sim.agent(victim2)
		aa["alive"] = true
		aa["downed"] = false
		aa["knife"] = 1
		vv["alive"] = true
		vv["downed"] = false
		__h.sim.knife(actor_i, victim2)
		__h.crew_view.sync(__h.sim, 0.016)
		var knife_now := String((__h.crew_view._anims[actor_i] as AnimationPlayer).current_animation)
		var down_now := String((__h.crew_view._anims[victim2] as AnimationPlayer).current_animation)
		print("PROBE ⑥ knife=%s down=%s" % [knife_now, down_now])
		if not knife_now.to_lower().contains("knife"):
			fails.append("出刀事件没有触发 knife 动作（=%s）" % knife_now)
		if not down_now.to_lower().contains("down"):
			fails.append("倒地没有触发 down 动作（=%s）" % down_now)
	else:
		fails.append("knife/down 夹具没找到可用模型")


static func _probe_input_locks_phase(__h, fails: Array) -> void:
	# ⑦ 空候选按 E 不得进模态（2.5D interact():8209 / openWheel():8171）。
	# 3D 曾开出「选择交互 · 0 项」空轮盘，之后 F/R/G/Q/V/B/C 全被 blocked 吞掉，
	# 玩家必须按 ESC 才恢复 —— --study 真实按键 + 截图取证确认的长期吞键根因。
	__h._ability_reset()
	__h.player.global_position = Vector3(31.0, 0.05, 33.5)
	for a7: Dictionary in __h.sim.agents:
		if int(a7.get("i", -1)) == int(__h.sim.me_idx):
			continue
		a7["pos"] = Vector2(6.0, 6.0)
		a7["alive"] = true
		a7["downed"] = false
		a7["searched"] = false
		a7["bodyGone"] = true
		a7["bodyReported"] = true
		a7["draggedBy"] = null
		a7["drag"] = -1
	await __h.get_tree().process_frame
	var empty_cnt: int = __h._collect_offers().size()
	await __h._tap_key(KEY_E)
	await __h.get_tree().process_frame
	var empty_wheel: bool = __h.wheel != null and __h.wheel.is_open()
	print("PROBE ⑦ 空候选=%d · 按 E 轮盘=%s ui_locked=%s" % [empty_cnt,
		str(empty_wheel), str(bool(__h.player.ui_locked))])
	if empty_cnt != 0:
		fails.append("⑦ 前置没构造出空候选（%d 项）" % empty_cnt)
	if empty_wheel:
		fails.append("空候选按 E 打开了空轮盘（会吞掉之后所有动作键）")
	if bool(__h.player.ui_locked):
		fails.append("空候选按 E 后 ui_locked 仍为 true")
	await __h._tap_key(KEY_R)
	await __h.get_tree().process_frame
	if __h.wheel != null and __h.wheel.is_open():
		fails.append("空轮盘之后按 R 仍处于轮盘模态")

	# ⑧ F 施救恒入口（2.5D keydown:8059 `if(k==='f'){rescue();return;}`）。
	# 3D 把 F 定义成「任务/设施」后，revive 只挂在 E 轮盘里，按 F 救人只回「离设备还有 28.5m」。
	__h._ability_reset()
	__h.player.global_position = Vector3(31.0, 0.05, 33.5)
	var me8: Dictionary = __h.sim.me()
	me8["medkit"] = 1
	me8["alive"] = true
	me8["downed"] = false
	var wounded8: Dictionary = {}
	for a8: Dictionary in __h.sim.agents:
		if int(a8.get("i", -1)) == int(__h.sim.me_idx):
			continue
		if wounded8.is_empty():
			wounded8 = a8
			a8["pos"] = Vector2(31.6, 34.1)
			a8["bodyPos"] = a8["pos"]
			a8["alive"] = true
			a8["downed"] = true
			a8["draggedBy"] = null
			a8["searched"] = false
			a8["bodyGone"] = false
			a8["bodyReported"] = false
		else:
			a8["pos"] = Vector2(6.0, 6.0)
			a8["alive"] = true
			a8["downed"] = false
	await __h.get_tree().process_frame
	var offers8: Array = __h._collect_offers()
	var has_revive8 := false
	for o8: Dictionary in offers8:
		if String(o8.get("id", "")).begins_with("revive-"):
			has_revive8 = true
	await __h._tap_key(KEY_F)
	await __h.get_tree().process_frame
	var st8: Dictionary = __h.station
	var reviving8: bool = not st8.is_empty() and String(st8.get("label", "")).contains("施救")
	print("PROBE ⑧ F 施救 → 候选有施救=%s station=%s" % [str(has_revive8),
		str(st8.get("label", ""))])
	if not has_revive8:
		fails.append("⑧ 前置没生成施救候选")
	if not reviving8:
		fails.append("按 F 没有进入施救站桩（2.5D F 是无条件施救入口）")

	# ⑨ 站桩只挡 E 交互（2.5D interact():8206），专用键不能被一起吞掉。
	# 3D 旧版把 station 当全局模态，开始做任务后按 R 报告 / G 拖拽 / B 破坏全部无反应。
	__h._ability_reset()
	__h.player.global_position = Vector3(31.0, 0.05, 33.5)
	# 必须把 ⑧ 注入的濒死者复位：否则 R 会命中 report 候选而不走能力兜底，
	# 用 _fallback_count 当判据就会把「按键其实生效了」误判成被吞。
	for a9: Dictionary in __h.sim.agents:
		if int(a9.get("i", -1)) == int(__h.sim.me_idx):
			continue
		a9["pos"] = Vector2(6.0, 6.0)
		a9["alive"] = true
		a9["downed"] = false
		a9["bodyGone"] = true
		a9["bodyReported"] = true
		a9["draggedBy"] = null
		a9["drag"] = -1
		a9["searched"] = false
	await __h.get_tree().process_frame
	__h.station = {"label": "夹具站桩", "t": 0.0, "dur": 5.0, "done": func() -> void: pass}
	var offers9: int = __h._collect_offers().size()
	var fb0: int = __h._fallback_count
	await __h._tap_key(KEY_R)
	await __h.get_tree().process_frame
	var fb1: int = __h._fallback_count
	print("PROBE ⑨ 站桩中按 R → 候选=%d 能力兜底入口 %d→%d" % [offers9, fb0, fb1])
	if fb1 <= fb0:
		fails.append("站桩中按 R 被吞（2.5D 的 me.doing>0 只挡 W 交互）")
	__h.station = {}


static func _run_probetest(__h) -> void:
	var fails: Array = []
	var setup: Dictionary = await _probe_setup(__h, fails)
	if not bool(setup.get("ok", false)):
		return
	var me: Dictionary = setup["me"]
	var victim: Dictionary = setup["victim"]
	await _probe_attack_phase(__h, me, victim, fails)
	await _probe_wheel_phase(__h, me, victim, fails)
	await _probe_dev_phase(__h, me, victim, fails)
	_probe_anim_phase(__h, fails)
	await _probe_input_locks_phase(__h, fails)
	print("PROBETEST %s %d 项失败 %s" % ["OK" if fails.is_empty() else "FAIL", fails.size(),
		str(fails)])
	__h._probetest_ok = fails.is_empty()
