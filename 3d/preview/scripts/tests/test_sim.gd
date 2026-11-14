extends RefCounted
## 判定层自测：sim 主循环、寻路、任务流、可达性、动作结算
##
## 2026-11-12 从 main.gd 迁出（大文件拆分：main.gd 9,580 → 5,5xx 行）。
## 约定：全部 static，宿主实例经 __h 传入；本文件不持有任何状态，不直接读 Engine 单例。
## 调用：TestSim._run_xxx(self)  —— 见 main.gd 的参数分发。

const ACTION_BINDINGS := {
	"E": "interact", "F": "facility", "R": "report", "G": "drag",
	"Q": "pipe", "V": "power", "B": "sabotage", "C": "cams",
}
const SimStateScript := preload("res://scripts/sim/sim_state.gd")
const SpaceData := preload("res://scripts/space_data.gd")

static func _run_simtest(__h) -> bool:
	var r := {"pass": 0, "fail": 0, "fails": [] as Array}
	var s = SimStateScript.new()
	__h._sim_check(r, s.new_game(20261108, 0, __h.map_data, __h.space), "开局成功")
	s.ai_enabled = false
	__h._finish_meeting(s)

	var n_humans := 0
	var n_aliens := 0
	for a: Dictionary in s.agents:
		if bool(a.get("alien", false)):
			n_aliens += 1
		else:
			n_humans += 1
	__h._sim_check(r, s.agents.size() == 15, "15 个席位（实际 %d）" % s.agents.size())
	__h._sim_check(r, n_aliens == 4, "4 个异形（实际 %d）" % n_aliens)
	__h._sim_check(r, n_humans == 11, "11 个人类（实际 %d）" % n_humans)
	__h._sim_check(r, not bool(s.me().get("alien", true)), "玩家是人类席位")
	__h._sim_check(r, is_equal_approx(float(s.t), float(s.night_len())), "开局夜长 %.1fs" % s.t)
	__h._sim_check(r, int(s.prog) == 0, "开局维修进度 0")

	var task_shape_ok := true
	for a: Dictionary in s.agents:
		var list: Array = a.get("tasks", []) as Array
		var h := 0
		var n := 0
		for pi: int in list:
			if String(s.point(pi).get("kind", "")) == "hard":
				h += 1
			else:
				n += 1
		if list.size() != 4 or h != 1 or n != 3:
			task_shape_ok = false
	__h._sim_check(r, task_shape_ok, "每人 1 高难 + 3 普通")

	var my: Dictionary = s.me()
	var first := int((my.get("tasks", []) as Array)[0])
	var other: Variant = -1
	for i in s.points.size():
		if not (my.get("tasks", []) as Array).has(i):
			other = i
			break
	__h._sim_check(r, s.can_do_task(first), "自己的首个任务是可修的")
	__h._sim_check(r, other >= 0 and not s.can_do_task(other), "非自己任务不可修")

	var res: Dictionary = s.complete_task(int(s.me_idx), first)
	var v: int = int(s.task_pts(first))
	__h._sim_check(r, bool(res.get("ok", false)), "任务完成返回 ok")
	__h._sim_check(r, int(res.get("pts", -1)) == v, "任务分值与 sim.json 一致（%d）" % v)
	__h._sim_check(r, int(my.get("tIdx", 0)) == 1, "tIdx 前进 1")
	__h._sim_check(r, int(s.prog) == v, "全船进度 +%d" % v)

	# 乱序：直接修第 3 个任务，结算后它应被换到 tIdx 槽位
	var tasks_now: Array = my.get("tasks", []) as Array
	var third := int(tasks_now[2])
	var old_second := int(tasks_now[1])
	var res2: Dictionary = s.complete_task(int(s.me_idx), third)
	__h._sim_check(r, bool(res2.get("ok", false)), "乱序修第 3 个任务成功")
	__h._sim_check(r, int(tasks_now[1]) == third and int(tasks_now[2]) == old_second, "乱序任务换位记账")

	# 一路修到 45 分：所有席位按顺序做完自己的任务，必须在到达 45 时结束
	for a: Dictionary in s.agents:
		while not bool(s.over) and int(a.get("tIdx", 0)) < (a.get("tasks", []) as Array).size():
			var pi := int((a.get("tasks", []) as Array)[int(a.get("tIdx", 0))])
			var rr: Dictionary = s.complete_task(int(a.get("i", 0)), pi)
			if not bool(rr.get("ok", false)):
				break
	__h._sim_check(r, bool(s.over) and bool(s.over_win), "维修到 45 分 → 人类胜利")
	__h._sim_check(r, int(s.prog) == int(s.win_pts()), "进度封顶在 %d（实际 %d）" % [s.win_pts(), s.prog])
	var has_task_ev := false
	var has_end_ev := false
	for e: Dictionary in s.events:
		if String(e.get("kind", "")) == "task":
			has_task_ev = true
		elif String(e.get("kind", "")) == "game_end":
			has_end_ev = true
	__h._sim_check(r, has_task_ev and has_end_ev, "事件流有 task / game_end")

	# 天亮：75 秒后进入第 2 夜
	__h._sim_check(r, s.new_game(7, 0, __h.map_data, __h.space), "重开用于天亮测试")
	s.ai_enabled = false
	__h._finish_meeting(s)
	for i in 751:
		s.tick(0.1)
	## 2.5D：天亮先开白天全员会，会议结束才 _start_night(true) 进下一夜。
	__h._finish_meeting(s)
	__h._sim_check(r, int(s.night) == 2, "75 秒后天亮 → 第 2 夜（实际第 %d 夜）" % s.night)
	var has_dawn := false
	for e: Dictionary in s.events:
		if String(e.get("kind", "")) == "dawn":
			has_dawn = true
	__h._sim_check(r, has_dawn, "事件流有 dawn")

	# 异形胜利：人类全灭
	__h._sim_check(r, s.new_game(8, 0, __h.map_data, __h.space), "重开用于人类全灭测试")
	s.ai_enabled = false
	for a: Dictionary in s.agents:
		if not bool(a.get("alien", false)):
			s.kill(int(a.get("i", 0)), "test")
	__h._sim_check(r, bool(s.over) and not bool(s.over_win) and String(s.over_why) == "人类全灭",
		"人类全灭 → 异形胜利（%s）" % s.over_why)

	# 人类胜利：异形全部出局
	__h._sim_check(r, s.new_game(9, 0, __h.map_data, __h.space), "重开用于异形出局测试")
	s.ai_enabled = false
	for a: Dictionary in s.agents:
		if bool(a.get("alien", false)):
			s.kill(int(a.get("i", 0)), "test")
	__h._sim_check(r, bool(s.over) and bool(s.over_win) and String(s.over_why) == "异形全部出局",
		"异形全部出局 → 人类胜利（%s）" % s.over_why)

	# 无证据时人类 AI 不该把票堆给玩家（旧实现"无主张就跟领先者"会全场跟票）
	__h._sim_check(r, s.new_game(11, 0, __h.map_data, __h.space), "重开用于投票测试")
	s.ai_enabled = false
	__h._finish_meeting(s)
	s.open_meeting_kind("day", -1, -1)
	s._cast_ai_votes()
	var votes0: Dictionary = s.meeting.get("votes", {}) as Dictionary
	var pile := 0
	for k: int in votes0.keys():
		if bool(s.agent(k).get("alien", false)):
			continue
		if int(votes0[k]) == int(s.me_idx):
			pile += 1
	__h._sim_check(r, pile == 0, "无证据时人类 AI 不把票投给玩家（实际 %d 票）" % pile)

	# 报告后尸体必须留在地上，仍可拖拽（2.5D markBodyReported 只记夜号，不抹尸体）
	__h._sim_check(r, s.new_game(12, 0, __h.map_data, __h.space), "重开用于尸体保留测试")
	s.ai_enabled = false
	__h._finish_meeting(s)
	var vic2: Dictionary = {}
	for a2: Dictionary in s.agents:
		if int(a2.get("i", -1)) != int(s.me_idx):
			vic2 = a2
			break
	s.kill(int(vic2.get("i", -1)), "test")
	s.open_meeting_kind("night", int(s.me_idx), int(vic2.get("i", -1)))
	__h._sim_check(r, not bool(vic2.get("bodyGone", false)) \
		and bool(vic2.get("bodyReported", false)), "报告后尸体仍在地上（只记已报告）")
	__h._finish_meeting(s)
	var pme: Dictionary = s.me()
	pme["pos"] = vic2.get("bodyPos", Vector2.ZERO)
	var drag_ok: Dictionary = s.can_act("drag", {"actor": int(s.me_idx)})
	__h._sim_check(r, bool(drag_ok.get("ok", false)), "报告后尸体仍可拖拽")

	# 异形补给链：申请单必须能真的领到、且在军械点真的开始兑换
	# （STAND.qual=0 → 必须走 claim_qual；旧实现 start_doing(dur=0) 空转 + 补给缺 return）
	__h._sim_check(r, s.new_game(10, 0, __h.map_data, __h.space), "重开用于异形补给链测试")
	s.ai_enabled = false
	var al: Dictionary = {}
	for a: Dictionary in s.agents:
		if bool(a.get("alien", false)):
			al = a
			break
	al["qualPending"] = 1
	al["qual"] = 0
	al["pos"] = s.claim_spot()
	al["path"] = PackedVector2Array()
	al["doing"] = 0.0
	al["_doing"] = ""
	s._ai_alien._decide(al)
	__h._sim_check(r, int(al.get("qual", 0)) == 1 and int(al.get("qualPending", 0)) == 0,
		"异形回圆桌能领到申请单")
	al["bullet"] = 0
	al["pos"] = s.supply_spot("ammo")
	al["path"] = PackedVector2Array()
	al["doing"] = 0.0
	al["_doing"] = ""
	s._ai_alien._decide(al)
	__h._sim_check(r, String(al.get("_doing", "")) == "supply", "异形在军械点开始兑换子弹")

	print("SIMTEST pass=%d fail=%d" % [int(r["pass"]), int(r["fail"])])
	for f: String in (r["fails"] as Array):
		print("  FAILED: ", f)
	return int(r["fail"]) == 0


static func _run_navtest(__h) -> bool:
	if __h.sim == null or __h.sim.nav == null:
		print("NAVTEST FAIL sim/nav 未初始化")
		return false
	var pass_n := 0
	var fail_n := 0
	var fails: Array = []
	if int(__h.sim.nav.walkable) <= 0:
		print("NAVTEST FAIL walkable=0")
		return false
	pass_n += 1
	var start: Vector2 = __h.sim.me().get("pos", Vector2(31, 33.5))
	if not __h.sim.nav.is_free(start):
		fail_n += 1
		fails.append("出生点不可走 " + str(start))
	else:
		pass_n += 1
	for i in __h.sim.points.size():
		var p: Dictionary = __h.sim.points[i]
		var target := Vector2(float(p.get("x", 0)), float(p.get("y", 0)))
		var pts: PackedVector2Array = __h.sim.nav.path(start, target)
		var ok: Variant = pts.size() > 1 and pts[pts.size() - 1].distance_to(target) <= SpaceData.num(__h.space, "reach", "fix")
		if ok:
			pass_n += 1
		else:
			fail_n += 1
			fails.append("任务点不可达 %s(%d)" % [String(p.get("label", "")), i])
		# 2.5D smoothPath 的不变量：平滑后每一段都必须 path_clear（网格可行走 + 0.16 贴墙余量）。
		# 少了这条断言，AI 会贴着墙角走 → 下一格判成不可走 → 原地卡死（"偶现卡墙"）。
		for k in range(pts.size() - 1):
			var a2: Vector2 = pts[k]
			var b2: Vector2 = pts[k + 1]
			# 只查"跳格直线段"（>1.5 格）：相邻格/斜格是 A* 本身的步进，
			# 2.5D 也允许它们贴墙（smoothPath 只约束它主动跳的那几段）。
			if a2.distance_to(b2) < 0.9:
				continue
			# 最后一段单独放过：2.5D smoothPath 的兜底分支（j=i+1）会把最后一格
			# 换成精确目标点而不校验 pathClear —— 3D 同构，不算偏离。
			if k == pts.size() - 2:
				continue
			if not __h.sim.nav.path_clear(a2, b2):
				fail_n += 1
				fails.append("路径段不贴墙余量 %s(%d) 段%d (%.2f,%.2f)→(%.2f,%.2f) d=%.2f" % [
					String(p.get("label", "")), i, k, a2.x, a2.y, b2.x, b2.y,
					a2.distance_to(b2)])
				break
	print("NAVTEST pass=%d fail=%d walkable=%d cells=%dx%d" % [
		pass_n, fail_n, int(__h.sim.nav.walkable), int(__h.sim.nav.gw), int(__h.sim.nav.gh)])
	for f: String in fails:
		print("  FAILED: ", f)
	return fail_n == 0


## ---- 模拟核心门禁（--simtest）----
## 只验 B1 的规则面：开局 / 任务分值与乱序记账 / 申请单 / 天亮 / 三条胜负分支。


static func _run_tasktest(__h) -> void:
	__h._sim_gate = false
	var pts: Array = __h.map_data.get("points", [])
	var dev_r: Variant = SpaceData.num(__h.space, "reach", "fix")
	var fails: Array = []
	for i in pts.size():
		var dev = null
		for d in __h.extras.devices:
			if is_instance_valid(d) and d.point_index == i:
				dev = d
				break
		if dev == null:
			fails.append("%d 缺设备" % i)
			continue
		## 掩体统一 1.70m 后，被 cover 压住的点曾被顶到 1.72m（玩家眼高 1.62m）
		if dev.global_position.y > 1.0:
			fails.append("%d 悬高 %.2fm" % [i, dev.global_position.y])
		var face: Vector3 = dev.face_dir()
		__h.player.global_position = Vector3(dev.global_position.x, 0.05, dev.global_position.z) \
				+ face * (dev_r * 0.8)
		var want := "task-%d" % i
		var got := false
		for o in __h._collect_offers():
			if String(o["id"]) == want:
				got = true
		if not got:
			fails.append("%d %s 交互项缺失" % [i, String(pts[i].get("label", ""))])
	# 2.5D 过滤回归：正常玩法（_sim_gate=true）下，只有最近且属于自己的剩余任务出 offer。
	# 2026-11-12 用户现场：非自己任务仍显示“查看（不是你的任务）”，原版不会出提示。
	__h._sim_gate = true
	if __h.sim != null and not __h.sim.agents.is_empty() and not __h.sim.remaining_tasks().is_empty():
		var remain: Array = __h.sim.remaining_tasks()
		var non_mine: Variant = -1
		for i in pts.size():
			if not remain.has(i):
				non_mine = i
				break
		if non_mine >= 0:
			var nd = null
			for d in __h.extras.devices:
				if is_instance_valid(d) and d.point_index == non_mine:
					nd = d
					break
			if nd == null:
				fails.append("过滤：非自己任务点 %d 缺设备" % non_mine)
			else:
				__h.player.global_position = Vector3(nd.global_position.x, 0.05, nd.global_position.z)
				var seen_non := false
				for o in __h._collect_offers():
					if String(o["id"]) == "task-%d" % non_mine:
						seen_non = true
				if seen_non:
					fails.append("过滤：非自己任务点 %d 仍产生 task offer" % non_mine)
				else:
					print("TASKTEST 过滤 非自己任务 %d 不出提示" % non_mine)
		var mine_i := int(remain[0])
		var md = null
		for d in __h.extras.devices:
			if is_instance_valid(d) and d.point_index == mine_i:
				md = d
				break
		if md == null:
			fails.append("过滤：自己的任务点 %d 缺设备" % mine_i)
		else:
			__h.player.global_position = Vector3(md.global_position.x, 0.05, md.global_position.z)
			var seen_mine := false
			for o in __h._collect_offers():
				if String(o["id"]) == "task-%d" % mine_i:
					seen_mine = true
			if not seen_mine:
				fails.append("过滤：自己的任务点 %d 没有 task offer" % mine_i)
			else:
				print("TASKTEST 过滤 自己的任务 %d 有提示" % mine_i)
	print("TASKTEST 点=%d 失败=%d %s" % [pts.size(), fails.size(), str(fails)])


## 站位可达性：每个任务点都要能**走过去**站下，并且站得住的位置仍在交互半径内。
## tasktest 用传送验证，等于跳过了碰撞与掩体，所以它全绿也可能玩不了。
## 这里不用 nav.nearest_free —— 它按环返回的第一个自由格不一定最近，
## 直接把半径圈内的格子全扫一遍，取钳位距离最小的那个才是真读数。


static func _run_taskflowtest(__h) -> bool:
	if __h.sim == null or __h.sim.agents.is_empty():
		print("TASKFLOW FAIL sim 未初始化")
		return false
	## 夹具修正（2026-11-10）：与 --mgtest / --devicetest 同一条坑 ——
	## 会议开着时 _process 会把小游戏卡片收掉，旧夹具因此在开局讨论里恒报 open=false，
	## 任务进度自然一动不动。先把会正常走完，再验「打开 → 解题 → 结算」。
	__h._finish_meeting(__h.sim)
	await __h.get_tree().create_timer(0.3).timeout
	var remaining: Array = __h.sim.remaining_tasks()
	if remaining.is_empty():
		print("TASKFLOW FAIL 没有剩余任务")
		return false
	var target := int(remaining[0])
	var dev = null
	for d in __h.extras.devices:
		if is_instance_valid(d) and int(d.point_index) == target:
			dev = d
			break
	if dev == null:
		print("TASKFLOW FAIL 找不到任务点设备 %d" % target)
		return false
	var before_prog := int(__h.sim.prog)
	var before_idx := int(__h.sim.me().get("tIdx", 0))
	var face: Vector3 = dev.face_dir()
	__h.player.global_position = Vector3(dev.global_position.x, 0.05, dev.global_position.z) + face * 1.2
	__h.player.rotation.y = atan2(face.x, face.z)
	await __h.get_tree().create_timer(0.4).timeout
	__h._open_device(dev)
	await __h.get_tree().create_timer(0.3).timeout
	var opened: bool = __h.mg_layer.is_open()
	__h.mg_layer.debug_solve()
	await __h.get_tree().create_timer(1.1).timeout
	var after_idx := int(__h.sim.me().get("tIdx", 0))
	var after_prog := int(__h.sim.prog)
	var pts: int = int(__h.sim.task_pts(target))
	var ok: bool = opened and after_idx == before_idx + 1 and after_prog == before_prog + pts \
		and not __h.mg_layer.is_open() and not __h.player.ui_locked
	print("TASKFLOW ok=%s open=%s tIdx=%d→%d prog=%d→%d pts=%d closed=%s unlocked=%s" % [
		str(ok), str(opened), before_idx, after_idx, before_prog, after_prog, pts,
		str(not __h.mg_layer.is_open()), str(not __h.player.ui_locked)])
	return ok


## 仰视天花板：相机在舱心离地 1.5m，向上看天花板。
## 天花板材质/尺度有没有做对，只能这样看。


static func _run_reachtest(__h) -> void:
	var pts: Array = __h.map_data.get("points", [])
	var dev_r: Variant = SpaceData.num(__h.space, "reach", "fix")
	var missing: Array = []
	var far: Array = []
	if __h.sim == null or __h.sim.nav == null:
		print("REACHTEST FAIL 没有 nav（先跑 node 3d/tools/export-map.cjs / export-space.cjs）")
		return
	var nav = __h.sim.nav
	var span := int(ceil((dev_r + 1.5) / float(nav.CELL)))
	for i in pts.size():
		var dev = null
		for d in __h.extras.devices:
			if is_instance_valid(d) and d.point_index == i:
				dev = d
				break
		if dev == null:
			missing.append("%d 缺设备" % i)
			continue
		var c0: Vector2i = nav.world_to_cell(Vector2(dev.global_position.x, dev.global_position.z))
		var best := 999.0
		var best_at: Variant = Vector2.INF
		for dy in range(-span, span + 1):
			for dx in range(-span, span + 1):
				var c := Vector2i(c0.x + dx, c0.y + dy)
				if c.x < 0 or c.y < 0 or c.x >= int(nav.gw) or c.y >= int(nav.gh):
					continue
				var w: Vector2 = nav.cell_to_world(c)
				if not nav.is_free(w):
					continue
				var dist: float = dev.reach_dist(Vector3(w.x, 0.05, w.y))
				if dist < best:
					best = dist
					best_at = w
		if best > dev_r:
			far.append("%d %s 设备(%.2f,%.2f) 最近可站点(%.2f,%.2f) 钳位 %.2fm > %.1fm" % [
				i, String(pts[i].get("label", "")),
				dev.global_position.x, dev.global_position.z,
				best_at.x, best_at.y, best, dev_r])
	print("REACHTEST 点=%d 半径=%.1fm 走不到=%d 缺设备=%d" % [
		pts.size(), dev_r, far.size(), missing.size()])
	for s in far:
		print("  FAR    " + String(s))
	for s in missing:
		print("  NODEV  " + String(s))


## 音频链路读数：背景音乐文件在不在、循环开没开、两个滑杆是否各管各的。
## 2026-11-09 之前「音乐」滑杆写的是 Master 总线，而工程里根本没有音乐流 ——
## 结果是滑杆一动音效跟着变小、音乐却始终听不见。


static func _run_actiontest(__h) -> bool:
	var fails: Array = []
	## sim.new_game() 按 2.5D 口径会开一场 pre 公开讨论（MEET_PRE），
	## 所以自测里要先关掉这场会，才造得出「会议结束后的空闲态」。
	__h.sim.meeting = {}
	__h._close_info()
	if __h.wheel != null and __h.wheel.is_open():
		__h.wheel.close()
	__h.player.ui_locked = false
	if __h._want_mouse_visible():
		fails.append("空闲态误判为需要释放鼠标")
	__h.wheel.open([{"label": "A"}, {"label": "B"}],
		func(_it: Dictionary) -> void: return,
		func() -> void: return)
	__h.player.ui_locked = true
	if not __h._want_mouse_visible():
		fails.append("轮盘打开时没有释放鼠标（按钮会点不动）")
	__h._refresh_mouse_mode()
	__h.wheel.close()
	__h.player.ui_locked = false
	__h.sim.meeting = {"kind": "night", "phase": "discuss", "t": 35.0}
	if not __h._want_mouse_visible():
		fails.append("会议期间没有释放鼠标")
	__h.sim.meeting = {}
	__h._open_info("自测", ["x"])
	if not __h._want_mouse_visible():
		fails.append("信息面板打开时没有释放鼠标")
	__h._close_info()
	if __h._want_mouse_visible():
		fails.append("所有 UI 关闭后鼠标没回到捕获态")
	# 2.5D 动作全集：施救 / 查看记录 / 全船监控 / 异形破坏 / 机器人状态。
	var me: Dictionary = __h.sim.me()
	me["medkit"] = 1
	me["alien"] = true
	var v: Dictionary = __h.sim.agent(1)
	v["alive"] = true
	v["downed"] = true
	v["searched"] = true
	var seen := {}
	for f: Dictionary in __h.map_data.get("facility", []):
		var kind := String(f.get("kind", ""))
		if kind != "monitor" and kind != "secbot" and kind != "medbot":
			continue
		__h.player.global_position = Vector3(float(f.get("x", 0)), 0.05, float(f.get("y", 0)))
		v["pos"] = Vector2(__h.player.global_position.x, __h.player.global_position.z)
		v["bodyPos"] = v["pos"]
		for o: Dictionary in __h._collect_offers():
			var oid := String(o.get("id", ""))
			seen[oid.split("-")[0]] = true
	for need: String in ["cams", "botinfo", "revive", "inspect", "sabotage"]:
		if not seen.has(need):
			fails.append("缺 2.5D 动作入口：" + need)
	if fails.is_empty():
		print("ACTION OK 鼠标相位 5/5 · 2.5D 动作入口 5/5 齐备")
		return true
	for msg: String in fails:
		print("ACTION FAIL " + msg)
	return false


## ---- 玩家视角调研（--study）：真实输入事件 + 真实渲染截图 ----
## 目的不是断言对错，而是把「玩家按下去 → 画面/状态发生了什么」留成证据。
## 键盘/鼠标都走 Input.parse_input_event，与物理键同一条 InputMap → _input 链路。


static func _run_abilitytest(__h) -> bool:
	var fails: Array = []
	# ⓪ InputMap：键位声明必须在 project.godot 生效，改键不用改代码。
	var map_n := 0
	for ak: String in ACTION_BINDINGS.keys():
		if InputMap.has_action(String(ACTION_BINDINGS[ak])):
			map_n += 1
		else:
			fails.append("InputMap 缺 action：" + String(ACTION_BINDINGS[ak]))
	print("ABILITY ⓪ InputMap %d/%d action 生效" % [map_n, ACTION_BINDINGS.size()])
	__h.role = "alien"
	if not __h.sim.new_game(__h._cur_seed, 0, __h.map_data, __h.space, true):
		print("ABILITY FAIL new_game")
		return false
	__h.sim.ai_enabled = false
	__h.sim.spectator = false
	__h._finish_meeting(__h.sim)
	var body_i: Variant = __h._ability_reset()
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame
	var offers: Variant = __h._collect_offers()
	var ids: Array = []
	for o: Dictionary in offers:
		ids.append("%s[%s]" % [String(o.get("id", "")),
			__h._offer_key(String(o.get("id", "")))])
	print("ABILITY 夹具 offers=%d %s" % [offers.size(), ", ".join(PackedStringArray(ids))])

	# ⓪-bis 恒入口兜底口径（2026-11-12）：生产路径 draggedBy 空值是 -1，
	# can_act 必须与 start_drag 一致把它当「无人拖」；旧写法 != null 会把
	# 跨夜 / 死亡后的尸体全判成「已被别人拖」，G 键恒入口因此静默失效。
	# 旧夹具把 draggedBy 设成 null，所以「自测全绿、实机拖不了」可以同时成立。
	var probe_drag: Dictionary = __h.sim.can_act("drag", {
		"actor": int(__h.sim.me_idx), "pos": Vector2(31.0, 33.5)})
	print("ABILITY ⓪-bis can_act(drag) draggedBy=-1 → %s" % str(probe_drag))
	if not bool(probe_drag.get("ok", false)):
		fails.append("can_act(drag) 把 -1 误判为已被拖：%s" % str(probe_drag.get("reason", "")))

	# ① G 拖尸：真实按键 → sim.me().drag 必须写成尸体编号
	await __h._tap_key(KEY_G)
	await __h.get_tree().process_frame
	var drag1 := int(__h.sim.me().get("drag", -1))
	print("ABILITY ① G 拖尸 → drag=%d（期望 %d）" % [drag1, body_i])
	if drag1 != body_i:
		fails.append("G 拖尸无效（drag=%d）" % drag1)

	# ② G 放下：再按一次必须真的松手
	await __h._tap_key(KEY_G)
	await __h.get_tree().process_frame
	var drag2 := int(__h.sim.me().get("drag", -1))
	print("ABILITY ② G 放下 → drag=%d" % drag2)
	if drag2 >= 0:
		fails.append("G 放下无效")

	# ③ 左键出刀：刀程内活人必须被放倒
	body_i = __h._ability_reset()
	var knife_i: Variant = -1
	for a2: Dictionary in __h.sim.agents:
		var ai2 := int(a2.get("i", -1))
		if ai2 != int(__h.sim.me_idx) and ai2 != body_i:
			knife_i = ai2
			break
	var tgt: Dictionary = __h.sim.agent(knife_i)
	tgt["pos"] = Vector2(31.0, 32.5)
	tgt["alive"] = true
	tgt["downed"] = false
	tgt["detained"] = false
	await __h.get_tree().process_frame
	await __h._tap_mouse(MOUSE_BUTTON_LEFT)
	await __h.get_tree().process_frame
	var downed := bool(tgt.get("downed", false))
	print("ABILITY ③ 左键出刀 → 濒死=%s 剩余刀=%d" % [str(downed),
		int(__h.sim.me().get("knife", -1))])
	if not downed:
		fails.append("左键出刀无效")

	# ④ Q 钻管道：站在管道口必须弹出出口列表
	__h._ability_reset()
	if __h.extras != null and not __h.extras.pipe_ports.is_empty():
		var pp: Dictionary = __h.extras.pipe_ports[0]
		__h.player.global_position = (pp["pos"] as Vector3) + Vector3(0.4, 0.05, 0.4)
		await __h.get_tree().process_frame
		await __h._tap_key(KEY_Q)
		await __h.get_tree().process_frame
		print("ABILITY ④ Q 管道 → 出口面板=%s" % str(__h._pipe_open))
		if not __h._pipe_open:
			fails.append("Q 钻管道无效")
		__h._close_pipe_ui()

	# ⑤ B 破坏舱室：站在非 bridge 舱必须真的产生故障
	__h._ability_reset()
	for r: Dictionary in __h.map_data.get("rooms", []):
		if String(r.get("id", "")) == "bridge":
			continue
		var rect: Array = r.get("rect", []) as Array
		var lab: Array = r.get("label", []) as Array
		if rect.size() < 4 or lab.size() < 2:
			continue
		var cp := Vector2(float(lab[0]), float(lab[1]))
		if String(__h.sim.room_at(cp)) != String(r.get("id", "")):
			continue
		__h.player.global_position = Vector3(cp.x, 0.05, cp.y)
		break
	await __h.get_tree().process_frame
	await __h._tap_key(KEY_B)
	await __h.get_tree().process_frame
	var dmg_n: Variant = (__h.sim.dmg as Array).size()
	print("ABILITY ⑤ B 破坏 → 故障数=%d sabUsed=%s" % [dmg_n,
		str(bool(__h.sim.me().get("sabUsed", false)))])
	if dmg_n <= 0 and not bool(__h.sim.me().get("sabUsed", false)):
		fails.append("B 破坏舱室无效")

	# ⑥ 用户现场回归：附近一个交互项都没有时按 G，旧版会**静默吞掉**按键
	# （玩家体感「按键解锁了但能力一点都没有」）。现在必须进入能力入口并给反馈。
	body_i = __h._ability_reset()
	var far: Dictionary = __h.sim.agent(body_i)
	far["bodyPos"] = Vector2(6.0, 6.0)
	far["pos"] = Vector2(6.0, 6.0)
	await __h.get_tree().process_frame
	var empty_offers: Variant = __h._collect_offers()
	var fb_before: Variant = __h._fallback_count
	await __h._tap_key(KEY_G)
	await __h.get_tree().process_frame
	var hint := String(__h.toast_label.text) if __h.toast_label != null else ""
	print("ABILITY ⑥ 空场景 offers=%d 兜底调用=%d 反馈=%s" % [
		empty_offers.size(), __h._fallback_count - fb_before, hint])
	if __h._fallback_count <= fb_before:
		fails.append("无交互项时按 G 被静默吞掉（能力入口没接上）")
	if hint.is_empty():
		fails.append("能力失败没有给出原因提示")

	# ⑦ 卡墙兜底（交接 P0 根因 2）：玩家必须拿到同一份 nav；
	# 物理把人推进网格不可走区时钳回，想走却卡住 0.3s 时走 nearest_free。
	__h._ability_reset()
	await __h.get_tree().process_frame
	if __h.player.nav == null:
		fails.append("玩家没有拿到 nav（卡墙兜底不会生效）")
	else:
		var good: Variant = __h.player.global_position
		__h.player.global_position = Vector3(0.0, 0.05, 0.0)
		__h.player._clamp_to_nav(good, Vector3.ZERO, 0.016)
		var back: Variant = __h.player.global_position
		var clamped := Vector2(back.x, back.z).distance_to(Vector2(good.x, good.z)) < 1.0
		__h.player.global_position = good
		var before_rescue := int(__h.player.stuck_rescues)
		for si in 8:
			__h.player._clamp_to_nav(good, Vector3(1.0, 0.0, 0.0), 0.05)
		print("ABILITY ⑦ 卡墙兜底 nav=有 钳回=%s 卡住救援=%d→%d" % [
			str(clamped), before_rescue, int(__h.player.stuck_rescues)])
		if not clamped:
			fails.append("物理位移没有钳回网格可走区")
		if int(__h.player.stuck_rescues) <= before_rescue:
			fails.append("卡住 0.3s 没有触发 nearest_free 兜底")

	print("ABILITY %s %d 项失败 %s" % ["OK" if fails.is_empty() else "FAIL",
		fails.size(), str(fails)])
	return fails.is_empty()


static func _run_interacttest(__h) -> void:
	if __h.space.is_empty():
		print("INTERACT FAIL space.json 缺失")
		return
	var dev_r: Variant = SpaceData.num(__h.space, "reach", "fix")
	print("INTERACT 半径 设备=%.1f 电闸=%.1f 圆桌=%.1f 管道冷却=%.0f" % [
		dev_r, SpaceData.num(__h.space, "reach", "breaker"),
		SpaceData.num(__h.space, "reach", "round_table"), SpaceData.num(__h.space, "pipe", "cooldown")])
	var seen := {}
	for dev in __h.extras.devices:
		if not is_instance_valid(dev):
			continue
		var face: Vector3 = dev.face_dir()
		__h.player.global_position = Vector3(dev.global_position.x, 0.05, dev.global_position.z) + face * (dev_r * 0.8)
		var offers: Variant = __h._collect_offers()
		for o in offers:
			seen[String(o["id"])] = int(seen.get(String(o["id"]), 0)) + 1
		if dev.point_index < 0:
			# 电闸在配电室，站位同时够到「电路维修」任务点 —— 多项共存才是对的，
			# 断言只查"电闸这一项必须在列表里"，不查数量。
			var has_brk := false
			for o in offers:
				if String(o["id"]) == "breaker":
					has_brk = true
			if not has_brk:
				print("INTERACT FAIL 电闸站位没收到 breaker 项（共 %d 项）" % offers.size())
			else:
				print("INTERACT 电闸站位 %d 项共存 %s" % [
					offers.size(), str(offers.map(func(o): return String(o["id"])))])

	# 圆桌：2.5D 用的是到矩形的钳位距离，领取点 = 圆桌下沿外 1.2
	var t: Variant = __h._round_table_cover()
	if t != {}:
		# B2 起申请单以 sim 为真源：门禁给自己一张待领，验证领取链路。
		if __h.sim != null and not __h.sim.agents.is_empty():
			__h.sim.me()["qualPending"] = 1
			__h.sim.me()["qual"] = 0
			__h.qual_pending = 1
			__h.qual = 0
		var edge := Vector3(float(t["x"]) + float(t["w"]) * 0.5, 0.05, float(t["y"]) + float(t["h"]) + 1.2)
		__h.player.global_position = edge
		var has_req := false
		for o in __h._collect_offers():
			if String(o["id"]) == "req":
				has_req = true
		print("INTERACT 圆桌领取点 %s → 领申请单=%s（待领 %d）" % [str(edge), str(has_req), __h.qual_pending])
		if has_req:
			var done := {"v": false}
			var dur: Variant = SpaceData.num(__h.space, "stand", "qual")
			if dur <= 0.0:
				# 2.5D 2026-11-10：交互即领，没有站桩
				__h._claim_qual_now()
				done.v = true
			else:
				__h._start_station("领取物资申请单", dur,
					func() -> void:
						__h._on_claim_done()
						done.v = true)
				for i in int(ceil(dur / 0.1)) + 2:
					__h._tick_station(0.1)
			print("INTERACT 领取 done=%s qual_pending=%d qual=%d" % [str(done.v), __h.qual_pending, __h.qual])
	# 管道（2.5D 口径：人类管道禁用）。
	# 2026-11-11 机制对齐：判定真源是 sim.me().alien，旧夹具只改开始页的
	# role 字符串就能「解锁」管道，恰好掩盖了「按键合法但能力没有」这个真 bug。
	if __h.extras.pipe_ports.size() > 0:
		__h.player.global_position = (__h.extras.pipe_ports[0]["pos"] as Vector3) + Vector3(0.5, 0.05, 0.5)
		var me_pipe: Dictionary = __h.sim.me()
		var was_alien := bool(me_pipe.get("alien", false))
		me_pipe["alien"] = true
		var pipe_n := 0
		for o in __h._collect_offers():
			if String(o["id"]).begins_with("pipe"):
				pipe_n += 1
		me_pipe["alien"] = false
		var pipe_human := 0
		for o in __h._collect_offers():
			if String(o["id"]).begins_with("pipe"):
				pipe_human += 1
		me_pipe["alien"] = was_alien
		print("INTERACT 管道 异形=%d 人类=%d（期望异形>0 / 人类 0）" % [pipe_n, pipe_human])
		if pipe_n <= 0 or pipe_human != 0:
			push_warning("INTERACT 管道门禁断言失败")
	# 轮盘：多项时列出、按序号选中并触发
	for dev in __h.extras.devices:
		if not is_instance_valid(dev):
			continue
		var face2: Vector3 = dev.face_dir()
		__h.player.global_position = Vector3(dev.global_position.x, 0.05, dev.global_position.z) + face2 * (dev_r * 0.8)
		var many: Variant = __h._collect_offers()
		if many.size() < 2:
			continue
		var picked := {"v": ""}
		__h.wheel.open(many, func(it: Dictionary) -> void: picked.v = String(it["id"]), func() -> void: pass)
		print("INTERACT 轮盘 打开=%s 列出=%d/%d" % [str(__h.wheel.is_open()), mini(many.size(), 9), many.size()])
		__h.wheel._choose(1)
		print("INTERACT 轮盘 选中=%s 关闭=%s" % [picked.v, str(not __h.wheel.is_open())])
		break


## 美术变体对账：主题色覆盖、墙面色差档数、实例高度散布，以及
## "设备顶面 = 箱体顶面"这条一致性（变体一旦只改一处就会浮空/陷进去）。


static func _run_roletest(__h) -> bool:
	var pass_n := 0
	var fail_n := 0
	var s = SimStateScript.new()
	if not s.new_game(20261110, 0, __h.map_data, __h.space, false):
		print("ROLETEST FAIL 人类开局失败")
		return false
	pass_n += 1
	var alien_n := 0
	for a: Dictionary in s.agents:
		if bool(a.get("alien", false)):
			alien_n += 1
	if alien_n == 4 and not bool(s.me().get("alien", false)):
		pass_n += 1
	else:
		fail_n += 1
		print("ROLETEST FAIL 人类档 alien=%d me_alien=%s" % [alien_n, str(s.me().get("alien", false))])
	if not s.new_game(20261110, 0, __h.map_data, __h.space, true):
		print("ROLETEST FAIL 异形开局失败")
		return false
	pass_n += 1
	alien_n = 0
	for a: Dictionary in s.agents:
		if bool(a.get("alien", false)):
			alien_n += 1
	if alien_n == 4 and bool(s.me().get("alien", false)):
		pass_n += 1
	else:
		fail_n += 1
		print("ROLETEST FAIL 异形档 alien=%d me_alien=%s" % [alien_n, str(s.me().get("alien", false))])
	# 开始页 → 开局这条链路也要真跑一次（不点按钮，直接发信号）
	if __h.home != null:
		__h.home._select("alien")
		__h.home._on_go()
		await __h.get_tree().process_frame
		if __h.started and __h.role == "alien" and bool(__h.sim.me().get("alien", false)) and __h.home == null:
			pass_n += 1
		else:
			fail_n += 1
			print("ROLETEST FAIL 开始页进入后 started=%s role=%s me_alien=%s home=%s" % [
				str(__h.started), __h.role, str(__h.sim.me().get("alien", false)), str(__h.home)])
	print("ROLETEST pass=%d fail=%d" % [pass_n, fail_n])
	return fail_n == 0


## ---- 开始页门禁（--hometest）----
## 三张身份卡都要在；整船图元数量必须与 map_v2.json 一致；
## 换身份要真的换高亮（人类亮任务点 / 异形亮管道口），而不是只换文字。


static func _run_aittest(__h) -> bool:
	var s = SimStateScript.new()
	if not s.new_game(20261108, 0, __h.map_data, __h.space):
		print("AITEST FAIL 开局失败")
		return false
	# S 轨起讨论段会真的产生台词，不能再自动快进；拉长 tick 观察窗口。
	var steps := 5000
	for k in steps:
		if bool(s.over):
			break
		s.tick(0.1)
	var tasks := 0
	var quals := 0
	var supplies := 0
	var knives := 0
	var kills := 0
	var sabs := 0
	var meets := 0
	var ejects := 0
	var chats := 0
	for e: Dictionary in s.events:
		var kind := String(e.get("kind", ""))
		if kind == "task":
			tasks += 1
		elif kind == "qual":
			quals += 1
		elif kind == "supply":
			supplies += 1
		elif kind == "knife":
			knives += 1
		elif kind == "kill":
			kills += 1
		elif kind == "sabotage":
			sabs += 1
		elif kind == "meeting":
			meets += 1
		elif kind == "eject":
			ejects += 1
		elif kind == "chat":
			chats += 1
	print("AITEST prog=%d/%d tasks=%d qual=%d supply=%d knife=%d kill=%d sab=%d meet=%d eject=%d chat=%d over=%s win=%s why=%s nights=%d agents=%d" % [
		int(s.prog), int(s.win_pts()), tasks, quals, supplies, knives, kills, sabs,
		meets, ejects, chats, str(s.over), str(s.over_win), String(s.over_why),
		int(s.night), s.agents.size()])
	var ok: Variant = tasks > 0 and int(s.prog) > 0 and quals > 0
	if not ok:
		print("AITEST FAIL 任务/申请单没有真正跑起来")
	return ok


## ---- 网格门禁（--navtest）----
## 26 个任务点必须从出生点可达；路径终点要落在任务点 1.5m 内；不能有孤立点。
