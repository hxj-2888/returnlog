extends RefCounted
## 界面自测：HUD、轮盘、会议界面、小地图、结算、开始页
##
## 2026-11-12 从 main.gd 迁出（大文件拆分：main.gd 9,580 → 5,5xx 行）。
## 约定：全部 static，宿主实例经 __h 传入；本文件不持有任何状态，不直接读 Engine 单例。
## 调用：TestUI._run_xxx(self)  —— 见 main.gd 的参数分发。

const KINDS := ["wire", "place", "lever", "sync", "pour", "swap", "align", "aim",
	"match", "level", "sequence", "sort", "valve", "code"]
const MinigameData := preload("res://scripts/minigame/mg_data.gd")
const SimStateScript := preload("res://scripts/sim/sim_state.gd")

static func _run_mgtest(__h) -> void:
	## 夹具修正（2026-11-10）：new_game 会开 MEET_PRE，而 _process 里
	## 「会议开着就收掉小游戏卡片」会把每张刚打开的卡在下一帧 cancel 掉，
	## 于是旧夹具恒定 MGTEST 0/10（dbg: cancel=true、open=false）。
	## 与 --walktest 同一处理：先把会正常走完，再逐型验。
	__h._finish_meeting(__h.sim)
	await __h.get_tree().create_timer(0.3).timeout
	var passed := 0
	for kind in KINDS:
		var state := {"ok": false, "cancel": false}
		__h.mg_layer.open(kind, "测试任务", "normal", "测试 · " + kind,
			func() -> void: state.ok = true,
			func() -> void: state.cancel = true)
		await __h.get_tree().process_frame
		await __h.get_tree().process_frame
		__h.mg_layer.debug_solve()
		await __h.get_tree().create_timer(0.9).timeout
		var ok: bool = bool(state.ok) and not __h.mg_layer.is_open()
		print("MGTEST kind=%s ok=%s" % [kind, str(ok)])
		if ok:
			passed += 1
	var fail_state := {"cancel": false}
	__h.mg_layer.open("pour", "失败路径", "normal", "失败路径",
		func() -> void: pass,
		func() -> void: fail_state.cancel = true)
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame
	__h.mg_layer.debug_fail("测试失败")
	await __h.get_tree().process_frame
	var still_open: bool = __h.mg_layer.is_open()
	__h.mg_layer.cancel()
	await __h.get_tree().create_timer(0.2).timeout
	var fail_ok: bool = still_open and not __h.mg_layer.is_open() and bool(fail_state.cancel)
	print("MGTEST_FAIL held_open=%s closed=%s canceled=%s ok=%s" % [
		str(still_open), str(not __h.mg_layer.is_open()), str(fail_state.cancel), str(fail_ok)])
	print("MGTEST_RESULT %d/%d pass" % [passed, KINDS.size()])

	## 26 个真实任务标签各开一次：证明「按 label 取到自己的 cfg」这条路真的通
	## （n / shapes / icons / lo / hi / hold / targets 全部来自 minigames.json#tasks）。
	var data: Dictionary = MinigameData.load_data()
	var task_labels: Array = data.get("tasks", {}).keys()
	var labels_ok := 0
	for label in task_labels:
		var want := String(MinigameData.task_cfg(data, String(label)).get("k", ""))
		var mark := {"kind": ""}
		var cb: Variant = func(k: String) -> void: mark.kind = k
		__h.mg_layer.opened.connect(cb, CONNECT_ONE_SHOT)
		__h.mg_layer.open(want, String(label), "normal", String(label),
			func() -> void: pass, func() -> void: pass)
		await __h.get_tree().process_frame
		var opened: bool = __h.mg_layer.is_open()
		var got := String(mark.kind)
		__h.mg_layer.cancel()
		await __h.get_tree().process_frame
		if opened and got == want:
			labels_ok += 1
		else:
			print("MGTEST_LABEL FAIL %s 期望 %s 实得 %s open=%s" % [
				label, want, got, str(opened)])
	print("MGTEST_LABELS %d/%d" % [labels_ok, task_labels.size()])
	__h._mgtest_ok = passed == KINDS.size() and fail_ok and labels_ok == task_labels.size()


static func _run_uitest(__h) -> void:
	## 真实 UI 输入链（不是直接调 sim.skip_discussion）：
	##   ① 开局会议的「跳过讨论」按钮必须在视口内；
	##   ② 真实鼠标点击必须真的推进会议；
	##   ③ 会议结束后 ui_locked 解除、W 键真的能走。
	## 触发：2026-11-10 用户现场反馈「玩家无法正常操作、跳不过界面」。
	var fails: Array = []
	__h._finish_meeting(__h.sim)
	__h.sim.new_game(__h._cur_seed, 0, __h.map_data, __h.space, false)
	__h.sim.ai_enabled = true
	await __h.get_tree().create_timer(0.4).timeout
	__h._refresh_meeting_ui()
	await __h.get_tree().process_frame
	if __h.sim.meeting.is_empty():
		fails.append("开局没有会议（夹具前提不成立）")
	else:
		var skip_btn: Variant = __h.meeting_skip
		if skip_btn == null or not skip_btn.is_visible_in_tree():
			fails.append("讨论期「跳过讨论」按钮不可见")
		else:
			var r: Rect2 = skip_btn.get_global_rect()
			var vp: Vector2 = __h.get_viewport().get_visible_rect().size
			var inside: bool = r.size.y > 0.0 and r.position.y >= -0.5 \
				and r.end.y <= vp.y + 0.5 and r.end.x <= vp.x + 0.5
			print("UITEST 跳过按钮 rect=%s 视口=%s 在屏内=%s" % [str(r), str(vp), str(inside)])
			if not inside:
				fails.append("「跳过讨论」超出视口：%s / %s" % [str(r), str(vp)])
			var c: Variant = r.get_center()
			var mv: Variant = InputEventMouseMotion.new()
			mv.position = c
			Input.parse_input_event(mv)
			var dn: Variant = InputEventMouseButton.new()
			dn.button_index = MOUSE_BUTTON_LEFT
			dn.pressed = true
			dn.position = c
			Input.parse_input_event(dn)
			var up: Variant = InputEventMouseButton.new()
			up.button_index = MOUSE_BUTTON_LEFT
			up.pressed = false
			up.position = c
			Input.parse_input_event(up)
			for i in 24:
				await __h.get_tree().process_frame
			var phase := String(__h.sim.meeting.get("phase", ""))
			var advanced: bool = __h.sim.meeting.is_empty() or phase != "discuss"
			print("UITEST 点击后 phase=%s 推进=%s" % [phase, str(advanced)])
			if not advanced:
				fails.append("点「跳过讨论」没推进会议（phase=%s）" % phase)
	__h._finish_meeting(__h.sim)
	await __h.get_tree().create_timer(0.3).timeout
	if __h.player.ui_locked:
		fails.append("会议结束后 ui_locked 仍为 true")
	var p0: Vector3 = __h.player.global_position
	var kd: Variant = InputEventKey.new()
	kd.physical_keycode = KEY_W
	kd.pressed = true
	Input.parse_input_event(kd)
	await __h.get_tree().create_timer(0.8).timeout
	var ku: Variant = InputEventKey.new()
	ku.physical_keycode = KEY_W
	ku.pressed = false
	Input.parse_input_event(ku)
	var dist: Variant = p0.distance_to(__h.player.global_position)
	print("UITEST 会议后位移=%.2f ui_locked=%s" % [dist, str(__h.player.ui_locked)])
	if dist < 0.5:
		fails.append("会议结束后 WASD 走不动（位移 %.2f）" % dist)
	print("UITEST %s %d 项失败 %s" % ["OK" if fails.is_empty() else "FAIL", fails.size(), str(fails)])
	__h._uitest_ok = fails.is_empty()


## 真实鼠标点击一个控件（与 --uitest 同一套 InputEvent 派发）。
## 控件不在视口内时返回 false，让自测报「点不到」而不是静默失败。


static func _run_meetuitest(__h) -> void:
	var pass_n := 0
	var fail_n := 0
	var fails: Array = []
	__h._finish_meeting(__h.sim)
	__h.sim.new_game(__h._cur_seed, 0, __h.map_data, __h.space, false)
	__h.sim.ai_enabled = true
	await __h.get_tree().create_timer(0.3).timeout
	__h._finish_meeting(__h.sim)
	__h.sim.meeting = {}
	if not __h.sim.open_meeting_kind(SimStateScript.MEET_DAY, -1, -1):
		print("MEETUITEST FAIL 白会开不起来")
		__h._meetuitest_ok = false
		return
	__h._refresh_meeting_ui()
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame
	var me_i := int(__h.sim.me_idx)
	# ① 11 个模板 + 对象/舱室/时段下拉在讨论期可见，对象默认「未选择」
	var grid: GridContainer = null
	for c in __h.meeting_tpl.get_children():
		if c is GridContainer:
			grid = c
	var tpl_n: int = grid.get_child_count() if grid != null else 0
	if __h.meeting_tpl.visible and tpl_n == 11 and __h.meeting_tpl_target.item_count >= 2:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("模板区 可见=%s 按钮=%d 对象项=%d" % [
			str(__h.meeting_tpl.visible), tpl_n, __h.meeting_tpl_target.item_count])
	# ② 没选对象点「怀疑」→ 不发言 + 「先选对象」提示
	var feed_n: int = __h.sim.speech.feed.size()
	if __h._click_ctrl(grid.get_child(0) as Control):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("「怀疑」按钮点不到")
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame
	if __h.sim.speech.feed.size() == feed_n and __h.toast_label.text.find("先选对象") >= 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("空对象没拦住 feed=%d→%d toast=%s" % [
			feed_n, __h.sim.speech.feed.size(), __h.toast_label.text])
	# ②b 发言流新消息提示（2.5D markNewLines）：先把内容撑满并滚到顶部，
	# 新行只累计条数、不强行跟底；点提示回到底部并清零。
	for k in 20:
		__h.sim.speech.sys_say("系统", "填充行 %d" % k)
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame
	__h.meeting_feed.get_v_scroll_bar().value = 0.0
	await __h.get_tree().process_frame
	var before_unread: Variant = __h._meeting_unread
	__h.sim.speech.sys_say("系统", "测试新消息")
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame
	if __h.meeting_new_btn.visible and __h._meeting_unread > before_unread:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("新消息提示没出现 unread=%d btn=%s" % [
			__h._meeting_unread, str(__h.meeting_new_btn.visible)])
	if __h._click_ctrl(__h.meeting_new_btn as Control):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("新消息按钮点不到")
	await __h.get_tree().process_frame
	if __h._meeting_unread == 0 and not __h.meeting_new_btn.visible:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("新消息清零失败 unread=%d" % __h._meeting_unread)
	# ③ 选对象 → 「投他」只记公开意向，不替玩家落票（2.5D ctx.playerVote）
	var pick := 1
	var ti: Variant = -1
	for k in __h.meeting_tpl_target.item_count:
		var md: Variant = __h.meeting_tpl_target.get_item_metadata(k)
		if md != null and int(md) >= 0 and int(md) != me_i:
			pick = k
			ti = int(md)
			break
	__h.meeting_tpl_target.select(pick)
	# 真实点击前让下拉/新消息按钮的布局稳定两帧：否则按钮 rect 可能还在上一帧的位置，
	# 点击会落到旁边的控件上（2026-11-10 偶发一次「投他模板 intent=-1」）。
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame
	var had_vote_before: Variant = (__h.sim.meeting.get("votes", {}) as Dictionary).has(me_i)
	if __h._click_ctrl(grid.get_child(1) as Control):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("「投他」按钮点不到")
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame
	var intent := int(__h.sim.meeting.get("player_intent", -1))
	if intent == ti and not had_vote_before \
			and not (__h.sim.meeting.get("votes", {}) as Dictionary).has(me_i):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("投他模板 intent=%d ti=%d 落票=%s" % [
			intent, ti, str((__h.sim.meeting.get("votes", {}) as Dictionary).has(me_i))])
	# ④ 讨论期点席位 → 真落票；再点另一个 → 改票；点弃权 → -1
	var seat_keys: Array = __h.meeting_buttons.keys()
	seat_keys.sort()
	if seat_keys.size() >= 2 and __h._click_ctrl(__h.meeting_buttons[seat_keys[0]] as Control):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("席位投票按钮点不到（%d 个）" % seat_keys.size())
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame
	var v1 := int((__h.sim.meeting.get("votes", {}) as Dictionary).get(me_i, -99))
	if v1 == int(seat_keys[0]):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("讨论期投票没落账 v=%d 期望 %d" % [v1, int(seat_keys[0])])
	if __h._click_ctrl(__h.meeting_buttons[seat_keys[1]] as Control):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("第二个席位点不到")
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame
	var v2 := int((__h.sim.meeting.get("votes", {}) as Dictionary).get(me_i, -99))
	if v2 == int(seat_keys[1]) and v2 != v1:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("改票没生效 v=%d→%d" % [v1, v2])
	if __h.meeting_list_scroll != null and __h.meeting_abstain != null:
		__h.meeting_list_scroll.ensure_control_visible(__h.meeting_abstain)
		await __h.get_tree().process_frame
	if __h._click_ctrl(__h.meeting_abstain as Control):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("弃权按钮点不到")
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame
	var v3 := int((__h.sim.meeting.get("votes", {}) as Dictionary).get(me_i, -99))
	if v3 == -1:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("弃权没写 -1（v=%d）" % v3)
	# ⑤ 跳过讨论 → 投票期 → 跳过投票（已选保留；未选才记弃权）
	if __h._click_ctrl(__h.meeting_skip as Control):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("跳过讨论点不到")
	for i in 16:
		await __h.get_tree().process_frame
	var ph := String(__h.sim.meeting.get("phase", ""))
	if ph == "vote":
		pass_n += 1
	else:
		fail_n += 1
		fails.append("跳过讨论后没进投票期 phase=%s" % ph)
	__h._refresh_meeting_ui()
	await __h.get_tree().process_frame
	if __h.meeting_skip_vote != null and __h.meeting_skip_vote.is_visible_in_tree():
		pass_n += 1
	else:
		fail_n += 1
		fails.append("投票期没有「跳过投票」")
	if __h._click_ctrl(__h.meeting_skip_vote as Control):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("跳过投票点不到")
	for i in 4:
		await __h.get_tree().process_frame
	var ph2 := String(__h.sim.meeting.get("phase", ""))
	if ph2 == "result":
		pass_n += 1
	else:
		fail_n += 1
		fails.append("跳过投后没进公布 phase=%s" % ph2)
	__h._refresh_meeting_ui()
	await __h.get_tree().process_frame
	if __h.meeting_result.text.find("弃权") >= 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("结果没显示弃权票：%s" % __h.meeting_result.text)
	# ⑥ 夜会信息行：报告地点 / 发起人 / 伤者（死者）
	__h._finish_meeting(__h.sim)
	var rep: Dictionary = __h.sim.agent(4)
	var vic: Dictionary = __h.sim.agent(7)
	rep["alive"] = true
	rep["downed"] = false
	rep["reportLeft"] = 2
	vic["alive"] = false
	vic["downed"] = false
	vic["bodyGone"] = false
	vic["bodyReported"] = false
	vic["bodyPos"] = __h.sim.room_center("med")
	__h.sim.night_meets = 0
	if __h.sim.open_meeting_kind(SimStateScript.MEET_NIGHT, 4, 7):
		__h._refresh_meeting_ui()
		await __h.get_tree().process_frame
		await __h.get_tree().process_frame
		var info: Variant = __h.meeting_info.text
		if __h.meeting_info.visible and info.find("报告地点") >= 0 and info.find("死者") >= 0 \
				and info.find("医疗间") >= 0:
			pass_n += 1
		else:
			fail_n += 1
			fails.append("夜会信息行不全：%s" % info)
	else:
		fail_n += 1
		fails.append("夜会开不起来（信息行）")
	# ⑦ 幽灵只读：面板保留可读，输入/模板/投票/跳过全部关掉
	__h.sim.me()["alive"] = false
	__h._refresh_meeting_ui()
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame
	if __h.meeting_panel.visible and not __h.meeting_input.editable \
			and not __h.meeting_tpl.visible and not __h.meeting_list.visible and not __h.meeting_skip.visible:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("幽灵只读口径错：panel=%s edit=%s tpl=%s list=%s skip=%s" % [
			str(__h.meeting_panel.visible), str(__h.meeting_input.editable),
			str(__h.meeting_tpl.visible), str(__h.meeting_list.visible), str(__h.meeting_skip.visible)])
	__h.sim.me()["alive"] = true
	# ⑧ 旁观者只读：可跳过讨论（文案带「旁观」），不能投票/发言
	__h.sim.spectator = true
	__h._refresh_meeting_ui()
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame
	if __h.meeting_panel.visible and __h.meeting_skip.visible \
			and __h.meeting_skip.text.find("旁观") >= 0 and not __h.meeting_list.visible:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("旁观只读口径错：skip=%s/%s list=%s" % [
			str(__h.meeting_skip.visible), __h.meeting_skip.text, str(__h.meeting_list.visible)])
	__h.sim.spectator = false
	__h.sim.meeting = {}
	__h._finish_meeting(__h.sim)
	print("MEETUITEST pass=%d fail=%d %s" % [pass_n, fail_n, str(fails)])
	__h._meetuitest_ok = fail_n == 0


static func _run_mousetest(__h) -> void:
	var pass_n := 0
	var fail_n := 0
	var fails: Array = []
	__h._finish_meeting(__h.sim)
	__h.sim.meeting = {}
	__h.mouse_released = false
	__h._refresh_mouse_mode()
	await __h.get_tree().process_frame
	if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("自由游玩不是 CAPTURED：%d" % Input.mouse_mode)
	__h._press_escape()
	for i in 20:
		await __h.get_tree().process_frame
	if __h.mouse_released and Input.mouse_mode == Input.MOUSE_MODE_VISIBLE:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("Esc 释放无效：released=%s mode=%d" % [
			str(__h.mouse_released), Input.mouse_mode])
	var dn: Variant = InputEventMouseButton.new()
	dn.button_index = MOUSE_BUTTON_LEFT
	dn.pressed = true
	Input.parse_input_event(dn)
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame
	if not __h.mouse_released and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("点击收回无效：released=%s mode=%d" % [
			str(__h.mouse_released), Input.mouse_mode])
	# 会议打开 / 关闭
	__h.sim.open_meeting_kind(SimStateScript.MEET_DAY, -1, -1)
	__h._refresh_meeting_ui()
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame
	var meet_open_mode: Variant = Input.mouse_mode
	__h._finish_meeting(__h.sim)
	__h._refresh_meeting_ui()
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame
	if meet_open_mode == Input.MOUSE_MODE_VISIBLE \
			and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("会议鼠标口径错：开=%d 关=%d" % [meet_open_mode, Input.mouse_mode])
	# 先 Esc 释放，再开 / 关会议：关闭后仍保持 VISIBLE
	__h._press_escape()
	await __h.get_tree().process_frame
	__h.sim.open_meeting_kind(SimStateScript.MEET_DAY, -1, -1)
	__h._refresh_meeting_ui()
	await __h.get_tree().process_frame
	__h._finish_meeting(__h.sim)
	__h._refresh_meeting_ui()
	for i in 6:
		await __h.get_tree().process_frame
	if __h.mouse_released and Input.mouse_mode == Input.MOUSE_MODE_VISIBLE:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("会议吞掉了 Esc 释放：released=%s mode=%d" % [
			str(__h.mouse_released), Input.mouse_mode])
	# 收尾
	__h.mouse_released = false
	__h._refresh_mouse_mode()
	print("MOUSETEST pass=%d fail=%d %s" % [pass_n, fail_n, str(fails)])
	__h._mousetest_ok = fail_n == 0


## 结算页自测（2026-11-10 第 14 批）：
## ① 终票在 close 时按 seq 落「vote」事件（中途改票只记 vote_change）；
## ② 投票矩阵按场次分组、含弃权；③ 身份表 15 行、含阵营/结局/死亡地点/刀在；
## ④ 阵亡态（sim.over=false）不显示结算身份表。


static func _run_minimaptest(__h) -> void:
	var pass_n := 0
	var fail_n := 0
	var fails: Array = []
	__h._finish_meeting(__h.sim)
	__h.sim.meeting = {}
	await __h.get_tree().process_frame
	if __h.minimap != null and __h.minimap.size.x >= 200.0 and __h.minimap.size.y > __h.minimap.size.x \
			and __h.minimap.mouse_filter == Control.MOUSE_FILTER_IGNORE:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("小地图尺寸/穿透错：%s" % (
			str(__h.minimap.size) if __h.minimap != null else "null"))
	var old := int(__h.sim.light_state)
	__h.sim.light_state = 0
	var b0: bool = __h.minimap._room_lit("bridge", "bright")
	var p0: bool = __h.minimap._room_lit("power", "dark")
	__h.sim.light_state = 1
	var p1: bool = __h.minimap._room_lit("power", "dark")
	__h.sim.light_state = 2
	var b2: bool = __h.minimap._room_lit("bridge", "bright")
	var p2: bool = __h.minimap._room_lit("power", "dark")
	__h.sim.light_state = old
	if b0 and not p0 and p1 and b2 and not p2:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("灯态错：0=%s/%s 1=%s 2=%s/%s" % [
			str(b0), str(p0), str(p1), str(b2), str(p2)])
	if bool(__h.sim.spectator):
		pass_n += 1
	else:
		var mine: Array = __h.sim.remaining_tasks()
		var me: Dictionary = __h.sim.me()
		var total: int = (me.get("tasks", []) as Array).size()
		if mine.size() > 0 and mine.size() <= total:
			pass_n += 1
		else:
			fail_n += 1
			fails.append("任务点集合错：mine=%d total=%d" % [mine.size(), total])
	var map_ok: bool = (__h.sim.map.get("rooms", []) as Array).size() >= 10 \
		and (__h.sim.map.get("corridors", []) as Array).size() > 0 \
		and (__h.sim.map.get("pipes", []) as Array).size() == 8 \
		and (__h.sim.map.get("facility", []) as Array).size() >= 4 \
		and (__h.sim.map.get("points", []) as Array).size() == 26
	if map_ok:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("地图数据不全")
	print("MINIMAPTEST pass=%d fail=%d %s" % [pass_n, fail_n, str(fails)])
	__h._minimaptest_ok = fail_n == 0


## 证据/情绪/口供自测（2026-11-10 第 16 批）：
## ① grudge/trust 写值 + isPatron；② best_grudge + 投票砸票；③ patron 不过票；
## ④ claimHist 只留 3 场 + claim_recall 台词；⑤ evalAlmost 的 WEAK/heard/fresh/friend；
## ⑥ note_testimony 一次只写一条 why（DESC 后的种类），DESC 会真的制造描述失真。


static func _run_hometest(__h) -> bool:
	var pass_n := 0
	var fail_n := 0
	if __h.home == null:
		print("HOMETEST FAIL 开始页没有创建")
		return false
	pass_n += 1
	if __h.home._cards.size() != 3:
		fail_n += 1
		print("HOMETEST FAIL 身份卡数量=%d（应为 3）" % __h.home._cards.size())
	else:
		pass_n += 1
	var sm = __h.home.ship
	if sm == null or sm.map.is_empty():
		fail_n += 1
		print("HOMETEST FAIL 整船图没拿到地图数据")
	else:
		var rooms_n: int = (sm.map.get("rooms", []) as Array).size()
		var pts_n: int = (sm.map.get("points", []) as Array).size()
		var pipes_n: int = (sm.map.get("pipes", []) as Array).size()
		if rooms_n == (__h.map_data.get("rooms", []) as Array).size() \
				and pts_n == (__h.map_data.get("points", []) as Array).size() \
				and pipes_n == (__h.map_data.get("pipes", []) as Array).size():
			pass_n += 1
		else:
			fail_n += 1
			print("HOMETEST FAIL 图元数量不一致 rooms=%d pts=%d pipes=%d" % [rooms_n, pts_n, pipes_n])
	# 人类档：亮任务点
	__h.home._select("human")
	var h_rooms: int = (__h.home.ship.sel_rooms as Array).size()
	var h_what := String(__h.home.ship.sel_what)
	if h_rooms >= 8 and h_what == "point":
		pass_n += 1
	else:
		fail_n += 1
		print("HOMETEST FAIL 人类高亮 rooms=%d what=%s" % [h_rooms, h_what])
	# 异形档：亮管道口
	__h.home._select("alien")
	var a_rooms: int = (__h.home.ship.sel_rooms as Array).size()
	var a_what := String(__h.home.ship.sel_what)
	if a_rooms >= 5 and a_what == "pipe":
		pass_n += 1
	else:
		fail_n += 1
		print("HOMETEST FAIL 异形高亮 rooms=%d what=%s" % [a_rooms, a_what])
	# 选中的身份必须真的能开局（signal 已接）
	if not __h.home.start_requested.is_connected(__h._on_start):
		fail_n += 1
		print("HOMETEST FAIL start_requested 没接到 _on_start")
	else:
		pass_n += 1
	print("HOMETEST pass=%d fail=%d cards=%d rooms=%d points=%d pipes=%d" % [
		pass_n, fail_n, __h.home._cards.size(),
		(__h.map_data.get("rooms", []) as Array).size(),
		(__h.map_data.get("points", []) as Array).size(),
		(__h.map_data.get("pipes", []) as Array).size()])
	return fail_n == 0


## ---- 开始页（2.5D 版式照搬）----
## 任何 `--xxx` 门禁参数都跳过开始页；`--seed` / `--role` 属于正常游玩参数，不算门禁。


static func _run_specttest(__h) -> void:
	## 旁观者三条（用户 2026-11-10）：
	## ① 舱内天花板正常；② 飞到天花板以上 → 整层隐藏（俯视剖面）；
	## ③ 向下穿不出地板（下层只是贴板，不允许掉进虚空）。
	var fails: Array = []
	__h.player.spectator = true
	await __h.get_tree().process_frame
	var ceil_y: float = __h.builder.ceiling_height()

	__h.player.global_position.y = 1.0
	__h._update_spectator_view()
	var in_ship: bool = not __h._ceil_hidden
	__h.player.global_position.y = ceil_y + 2.0
	__h._update_spectator_view()
	var above: bool = __h._ceil_hidden
	print("SPECTTEST 天花板%.1f 舱内保持=%s 飞越隐藏=%s" % [ceil_y, str(in_ship), str(above)])
	if not in_ship:
		fails.append("舱内就隐藏了天花板")
	if not above:
		fails.append("飞越天花板后没有透视")

	__h.player.global_position.y = -5.0
	__h.player._physics_process(0.016)
	var y_after: float = __h.player.global_position.y
	print("SPECTTEST 下穿夹取 y=-5 → %.2f（下限 %.2f）" % [y_after, __h.player.SPECT_MIN_Y])
	if y_after < __h.player.SPECT_MIN_Y - 0.001:
		fails.append("旁观者可以穿到地板以下（y=%.2f）" % y_after)

	__h.player.global_position.y = 1.2
	__h._update_spectator_view()
	if __h._ceil_hidden:
		fails.append("回到舱内后天花板没恢复")
	print("SPECTTEST %s %d 项失败 %s" % ["OK" if fails.is_empty() else "FAIL", fails.size(), str(fails)])
	__h._specttest_ok = fails.is_empty()


## 无窗口动作自测：AI 出刀 → knife，受害者倒地 → down；不依赖鼠标。


static func _run_settletest(__h) -> void:
	var pass_n := 0
	var fail_n := 0
	var fails: Array = []
	__h._finish_meeting(__h.sim)
	__h.sim.meeting = {}
	__h.settle_panel.visible = false
	# ① 一场干净投票：0→2、1→2、2→弃权；0 先改 3 再改回 2
	__h.sim.open_meeting_kind(SimStateScript.MEET_DAY, -1, -1)
	var seq0 := int(__h.sim.meeting.get("seq", 0))
	__h.sim.meeting["phase"] = "vote"
	__h.sim.meeting["votes"] = {}
	__h.sim.cast_vote(0, 2)
	__h.sim.cast_vote(1, 2)
	__h.sim.cast_vote(2, -1)
	__h.sim.cast_vote(0, 3)
	__h.sim.cast_vote(0, 2)
	__h.sim._close_meeting()
	var votes: Array = []
	var changes: Array = []
	for e: Dictionary in __h.sim.events:
		if String(e.get("kind", "")) == "vote":
			votes.append(e)
		elif String(e.get("kind", "")) == "vote_change":
			changes.append(e)
	var mine: Dictionary = {}
	for e: Dictionary in votes:
		if int(e.get("seq", -1)) == seq0:
			mine[int(e.get("actor", -1))] = int(e.get("target", -2))
	if mine.size() == 3 and int(mine.get(0, -9)) == 2 \
			and int(mine.get(1, -9)) == 2 and int(mine.get(2, 9)) == -1 \
			and not changes.is_empty():
		pass_n += 1
	else:
		fail_n += 1
		fails.append("终票落账错：seq=%d votes=%s changes=%d" % [
			seq0, str(mine), changes.size()])
	var vtxt: Variant = __h._settle_votes_text()
	if vtxt.find("场投票") >= 0 and vtxt.find("弃权") >= 0 and vtxt.find("→") >= 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("投票矩阵缺内容：%s" % vtxt)
	__h.sim.meeting = {}
	# ② knife 倒地 / 死亡地点
	var alien_i: Variant = -1
	var human_i: Variant = -1
	for a: Dictionary in __h.sim.agents:
		if bool(a.get("alien", false)) and alien_i < 0:
			alien_i = int(a.get("i", -1))
		elif not bool(a.get("alien", false)) and human_i < 0:
			human_i = int(a.get("i", -1))
	if alien_i >= 0 and human_i >= 0:
		var k: Dictionary = __h.sim.agent(alien_i)
		var h: Dictionary = __h.sim.agent(human_i)
		k["alive"] = true
		k["downed"] = false
		k["knife"] = 1
		h["alive"] = true
		h["downed"] = false
		h["pos"] = __h.sim.room_center("bridge")
		__h.sim.knife(alien_i, human_i)
		var down_room := String(h.get("downRoom", ""))
		__h.sim.die(h)
		var death_room := String(h.get("deathRoom", ""))
		if down_room == "bridge" and death_room == "bridge" \
				and String(h.get("deathCause", "")) == "knife":
			pass_n += 1
		else:
			fail_n += 1
			fails.append("死亡地点错：down=%s death=%s cause=%s" % [
				down_room, death_room, String(h.get("deathCause", ""))])
	else:
		fail_n += 1
		fails.append("席位缺失（结算）")
	# ③ 结算页：15 行身份表 + 结局/地点
	__h.sim.over = true
	__h.sim.over_win = true
	__h.sim.over_why = "自测结算"
	__h._show_end()
	var rows: Variant = __h.settle_ids.text.split("\n").size()
	var ids: Variant = __h.settle_ids.text
	if __h.settle_panel.visible and rows == __h.sim.agents.size() \
			and ids.find("异形") >= 0 and ids.find("人类") >= 0 \
			and ids.find("被出刀") >= 0 and ids.find("中央会议室") >= 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("身份表错：visible=%s rows=%d/%d" % [
			str(__h.settle_panel.visible), rows, __h.sim.agents.size()])
	# ④ 阵亡态（局未结束）不显示结算身份表
	__h.sim.over = false
	__h.settle_panel.visible = false
	__h._refresh_sim_hud()
	if not __h.settle_panel.visible:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("阵亡态泄露了结算身份表")
	# 收尾
	__h.sim.over = false
	__h.sim.over_win = false
	__h.sim.over_why = ""
	__h.settle_panel.visible = false
	print("SETTLETEST pass=%d fail=%d %s" % [pass_n, fail_n, str(fails)])
	__h._settletest_ok = fail_n == 0


## 局内小地图自测（2026-11-10 第 15 批）：
## ① 尺寸固定、鼠标穿透；② 灯态 0/1/2 三态；③ 自己的任务点与 sim.remaining_tasks 同源；
## ④ 静态地图数据齐全（10 舱 / 走廊 / 8 管道 / 设施 / 26 任务点）。
