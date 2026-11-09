extends RefCounted

## 人类 AI（B2）：选任务 → A* 走路 → 站桩 → 完成 → 领申请单 → 换补给。
## ------------------------------------------------------------------
## 只做“非发言、非战斗”的部分；异形行为在 B3。
## 所有数值从 space.json 进；AI 不读节点，只改 sim 里的 agent 状态。
## 站位/时长口径：
##   · 任务：距任务点 <= REACH.fix 开始站桩，时长 = 任务点 dur；
##   · 申请单：圆桌边缘外 1.2 格，站桩 STAND.qual；
##   · 补给：军械/医疗补给点，站桩 STAND.ammo / STAND.med。

const SpaceData := preload("res://scripts/space_data.gd")

var sim
var space: Dictionary = {}


func setup(p_sim, p_space: Dictionary) -> void:
	sim = p_sim
	space = p_space


func tick(dt: float) -> void:
	if sim == null or sim.over:
		return
	if not sim.meeting.is_empty():
		return
	for a: Dictionary in sim.agents:
		if int(a.get("i", -1)) == int(sim.me_idx) and not bool(sim.spectator):
			continue
		if bool(a.get("detained", false)):
			continue
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		if bool(a.get("alien", false)):
			continue
		if float(a.get("doing", 0.0)) > 0.0:
			continue
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		# 2.5D dragToMed：拖着濒死者抵达医疗间就必须放下，交给无人机救活。
		# 3D 之前 AI 侧没有任何 release_drag 调用点，路径走完后一直把人拖着直到失血死亡，
		# 整条拖救链是断的（20 局只救起 1 次）。
		if int(a.get("drag", -1)) >= 0:
			var carried: Dictionary = sim.agent(int(a.get("drag", -1)))
			if not carried.is_empty() and bool(carried.get("downed", false)) \
					and sim.room_at(ap) == "med":
				sim.release_drag(int(a.get("i", -1)))
				continue
		# ---- taskThreat / fleeTask（2.5D aiHuman:2743）----
		# 站桩做事时，亲眼确证的异形正在逼近 → 弃任务逃跑。
		# 弃任务本身是**能被看见的事实**（saw_task_abandon，EV_W 0.14）。
		if float(a.get("doing", 0.0)) > 0.0 and sim.mind != null:
			var kd := String(a.get("_doing", ""))
			if kd == "task" or kd == "fix" or kd == "fake":
				var kn: Dictionary = sim.mind.best_known_target(a)
				if not kn.is_empty():
					var kt: Dictionary = sim.agent(int(kn["i"]))
					if not kt.is_empty() and bool(kt.get("alive", false)) \
							and not bool(kt.get("downed", false)):
						var kp: Vector2 = kt.get("pos", Vector2.ZERO)
						var dd := ap.distance_to(kp)
						if dd <= 7.0 and sim.ai_can_see(ap, kp):
							var closing: bool = bool(kt.get("moving", false)) \
								or ((kt.get("path", PackedVector2Array()) as PackedVector2Array).size() > 0)
							var travel := dd / maxf(1.0, SpaceData.num(space, "move", "speed"))
							var remain := float(a.get("doing", 0.0))
							if remain > (travel - 0.6) or (closing and dd <= 3.5):
								_flee_from(a, kt)
								continue
		# 逃跑中：只沿路径走，不做任何决策
		if float(a.get("_fleeT", 0.0)) > 0.0:
			a["_fleeT"] = float(a.get("_fleeT", 0.0)) - dt
			continue
		# 尸体扫描（2.5D aiScanBodies:2505）：看见未报告的尸体 → 搜尸 / 排报告
		var best_body: Dictionary = {}
		var best_bd := 5.4
		for v: Dictionary in sim.agents:
			if v == a or bool(v.get("alive", false)) or bool(v.get("bodyReported", false)):
				continue
			var bpos2: Vector2 = v.get("bodyPos", Vector2.ZERO)
			var dd2 := ap.distance_to(bpos2)
			if dd2 < best_bd and sim.ai_can_see(ap, bpos2):
				best_bd = dd2
				best_body = v
		if not best_body.is_empty() and float(a.get("_reportT", 0.0)) <= 0.0:
			var bi := int(best_body.get("i", -1))
			# 贴近且没搜过 → 先搜尸取证+拿物资（2.5D wantEvidence，1.2 秒站桩）
			if best_bd < 2.2 and not bool(best_body.get("searched", false)) \
					and float(a.get("doing", 0.0)) <= 0.0:
				sim.search_body(bi, int(a.get("i", -1)))
				a["_aiT"] = 0.5
				continue
			# 排报告（人类延迟 1.4~3.0 秒；额度/场次在 open_meeting 里再筛）
			if int(a.get("reportLeft", 0)) > 0:
				a["_reportBody"] = bi
				a["_reportT"] = 1.4 + sim._rng.randf() * 1.6
				continue
		# ---- 尸体扫描（2.5D aiScanBodies:2478 同源）----
		# 5.4 格内 + ai_can_see → 先搜尸（<2.2 格）→ 排 1.4~3.0 秒 → 远程拉铃（≤5.8 格）。
		# 同一夜每具尸体只能被报告一次；异形按误导价值也会报告（MISLEAD）。
		var report_body := int(a.get("_reportBody", -1))
		var report_t := float(a.get("_reportT", 0.0))
		if report_t > 0.0:
			a["_reportT"] = report_t - dt
			if float(a.get("_reportT", 0.0)) <= 0.0:
				a["_reportBody"] = -1
				var rb: Dictionary = sim.agent(report_body)
				if not rb.is_empty() and bool(rb.get("bodyReported", false)) == false:
					var rbp: Vector2 = rb.get("bodyPos", Vector2.ZERO)
					if ap.distance_to(rbp) <= 5.8 and sim.ai_can_see(ap, rbp):
						if sim.open_meeting(int(a.get("i", -1)), report_body):
							return
		# 医疗包优先救人：濒死者拖到天亮会失血而死（2.5D aiHuman:2782）
		if int(a.get("medkit", 0)) > 0:
			var v: Dictionary = sim.nearest_downed(a.get("pos", Vector2.ZERO), 7.5)
			if not v.is_empty():
				var vp: Vector2 = v.get("pos", Vector2.ZERO)
				if ap.distance_to(vp) < 1.7:
					sim.start_doing(int(a.get("i", -1)), "revive",
						SpaceData.num(space, "stand", "revive"), -1, "")
					a["_rv"] = int(v.get("i", -1))
					continue
				elif sim.set_path(int(a.get("i", -1)), vp):
					continue
		# 2.5D aiHuman（js/game.js:2875）：没有医疗包但医疗无人机可用时，
		# 把视线内的濒死者拖进医疗间交给机器人复活。3D 之前缺这条，
		# 于是「无人机只救医疗间内」时根本没人被送进去。
		# 只排除"自己刚开枪打倒的人"，避免救活自己刚制服的嫌疑人。
		if int(a.get("medkit", 0)) <= 0 and _medbot_usable():
			var dv: Dictionary = sim.nearest_downed(ap, 8.5)
			var dragged_by: Variant = dv.get("draggedBy", null)
			var killer: Variant = dv.get("killedBy", null)
			var free_body: bool = dragged_by == null or int(dragged_by) < 0
			var self_killed: bool = killer != null and int(killer) == int(a.get("i", -1))
			if not dv.is_empty() and free_body and not self_killed \
					and sim.room_at(dv.get("pos", Vector2.ZERO)) != "med":
				var dvp: Vector2 = dv.get("pos", Vector2.ZERO)
				if ap.distance_to(dvp) < 1.9:
					if sim.start_drag(int(a.get("i", -1)), int(dv.get("i", -1))):
						# 2.5D medDropSpot：医疗间中心（无人机坞位）。
						sim.set_path(int(a.get("i", -1)), sim.bots.med_home)
						continue
				elif sim.set_path(int(a.get("i", -1)), dvp):
					continue
		var path: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
		if path.size() > 0:
			continue
		var wait := float(a.get("_aiT", 0.0)) - dt
		a["_aiT"] = wait
		if wait > 0.0:
			continue
		_decide(a)


## 2.5D medbotUsable（js/game.js:2719）：无人机没被拆、且还有当夜电量。
func _medbot_usable() -> bool:
	if sim.bots == null or sim.bots.is_dead("medbot"):
		return false
	return sim.bots.med_uses < sim.bots.MED_USES_MAX


## 选一个"敢开枪"的目标：确证优先 → 准-确证 affordableAlmostShot → 综合嫌疑。
## 嫌疑读**夜间折价**（sus_of_night，跨夜存量 ×0.7）；必须在枪程 + 视线内。
## 数值全部读 space.json#shoot 与 rules.json，不写死。
func _shoot_target(a: Dictionary) -> int:
	var scfg: Dictionary = space.get("shoot", {}) as Dictionary
	var shoot_r := float(scfg.get("range", 9.0))
	var thr: float = sim.rules.n("ALMOST", "foeSus", 0.5)
	# 2.5D：准-确证把开枪门槛 ×0.7（ALMOST.foeShootMul，更容易开枪）
	thr *= sim.rules.n("ALMOST", "foeShootMul", 0.7)
	var known: Dictionary = a.get("known", {}) as Dictionary
	var best := -1
	var bs := thr
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	for t: Dictionary in sim.agents:
		var ti := int(t.get("i", -1))
		if ti == int(a.get("i", -1)) or not bool(t.get("alive", false)):
			continue
		if bool(t.get("downed", false)) or bool(t.get("detained", false)):
			continue
		var tp: Vector2 = t.get("pos", Vector2.ZERO)
		if ap.distance_to(tp) > shoot_r:
			continue
		if not sim.ai_can_see(ap, tp):
			continue
		var score := 0.0
		if sim.mind != null:
			score = sim.mind.sus_of_night(a, ti)
		if known.has(ti):
			score += 2.0
		if score > bs:
			bs = score
			best = ti
	# 确证的人直接开枪，不走门槛
	if best < 0 and sim.mind != null and not known.is_empty():
		var kn: Dictionary = sim.mind.best_known_target(a)
		if not kn.is_empty():
			var ki := int(kn.get("i", -1))
			var kp: Vector2 = sim.agent(ki).get("pos", Vector2.ZERO)
			if ap.distance_to(kp) <= shoot_r and \
					(sim.nav == null or sim.nav.los(ap, kp)):
				return ki
	return best


func _decide(a: Dictionary) -> void:
	var i := int(a.get("i", -1))
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var qual_pending := int(a.get("qualPending", 0))
	var qual := int(a.get("qual", 0))

	# 1) 有待领申请单：回圆桌领（个人进度 3 / 5 各生成一张）。
	if qual_pending > 0 and qual < 2:
		var spot: Vector2 = sim.claim_spot()
		if sim.distance_to(i, spot) <= SpaceData.num(space, "reach", "round_table"):
			sim.start_doing(i, "claim", SpaceData.num(space, "stand", "qual"))
		elif not sim.set_path(i, spot):
			_stuck(a)
		return

	# 2) 有申请单且缺物资：去对应补给点兑换。优先补没有的那一样。
	var item := ""
	if int(a.get("bullet", 0)) <= 0 and int(a.get("medkit", 0)) <= 0:
		item = "ammo"
	elif int(a.get("bullet", 0)) <= 0:
		item = "ammo"
	elif int(a.get("medkit", 0)) <= 0:
		item = "medkit"
	if qual > 0 and item != "":
		var sp: Vector2 = sim.supply_spot(item)
		if sim.distance_to(i, sp) <= SpaceData.num(space, "reach", "fix"):
			var dur := SpaceData.num(space, "stand", "ammo" if item == "ammo" else "med")
			sim.start_doing(i, "supply", dur, -1, item)
		elif not sim.set_path(i, sp):
			_stuck(a)
		return

	# 2.5D aiHuman:2847：全船断电时，指派 1 名人类 AI 去合闸（打断零散任务）
	if not sim.power_on:
		var light_go: bool = bool(a.get("_lightGo", false))
		if not light_go:
			var crew := 0
			for x: Dictionary in sim.agents:
				if x != a and bool(x.get("_lightGo", false)) and bool(x.get("alive", false)) \
						and not bool(x.get("downed", false)):
					crew += 1
			if crew < 1:
				a["_lightGo"] = true
				light_go = true
		if light_go:
			var bp: Vector2 = sim.breaker_pos()
			if ap.distance_to(bp) <= SpaceData.num(space, "reach", "breaker"):
				sim.start_doing(int(a.get("i", -1)), "breaker", sim.breaker_on_time())
				a["_lightGo"] = false
			elif sim.set_path(int(a.get("i", -1)), bp):
				return
			else:
				a["_lightGo"] = false

	# 3) 有故障先修：30 秒窗口，修不掉全船 -5 分。
	if sim.dmg.size() > 0:
		var d: Dictionary = sim.dmg[0]
		var dp := Vector2(float(d.get("x", 0.0)), float(d.get("y", 0.0)))
		if sim.distance_to(i, dp) <= SpaceData.num(space, "reach", "fix"):
			sim.start_doing(i, "fix", SpaceData.num(space, "stand", "fix"), -1, String(d.get("room", "")))
		elif not sim.set_path(i, dp):
			_stuck(a)
		return

	# 4) 做任务：按 tIdx 顺序取下一个剩余任务。
	var rem: Array = sim.remaining_tasks(i)
	if rem.is_empty():
		a["_aiT"] = 1.0
		return
	# 领袖指令服从（2.5D aiHuman:2948-2967）：领袖当众说"你去某舱"，
	# 就把那个舱的任务换到当前位 —— obeyP = 号召力 × (cred(领袖)/trustObeyGate)。
	# 命令只在本夜有效（天亮重排）；没照办记 orderBroke（能被同舱的人看见）。
	var od: Dictionary = a.get("order", {}) as Dictionary
	if not od.is_empty() and int(od.get("night", -1)) == int(sim.night):
		a["order"] = {}
		var orid := String(od.get("room", ""))
		var leader_i := int(od.get("by", -1))
		# 2.5D：`idx===a.tIdx`（本来就要去那间）算**已经照办**，不是抗命
		var swapped := false
		var tasks_own: Array = a.get("tasks", []) as Array
		var tIdx := int(a.get("tIdx", 0))
		for k in range(tIdx, tasks_own.size()):
			var p2: Dictionary = sim.point(int(tasks_own[k]))
			if String(p2.get("room", "")) == orid:
				if k == tIdx:
					sim._stat("orderObey", 1)
				else:
					var gate: float = maxf(0.01, sim.mind.trust_obey_gate())
					var charisma := 0.0
					if sim.speech != null:
						charisma = sim.speech.leader_charisma
					var obey_p := charisma * clampf(sim.mind.cred_of(a, leader_i) / gate, 0.0, 1.0)
					if sim._rng.randf() < obey_p:
						# 真正换位：改 agent 自己的 tasks 序列（remaining_tasks 每次返回副本）
						var tmp: int = tasks_own[tIdx]
						tasks_own[tIdx] = tasks_own[k]
						tasks_own[k] = tmp
						a["tasks"] = tasks_own
						sim._stat("orderObey", 1)
					else:
						sim._stat("orderRefuse", 1)
				swapped = true
				break
		if not swapped:
			pass
	var pi := int(rem[0])
	var p: Dictionary = sim.point(pi)
	var target := Vector2(float(p.get("x", 0.0)), float(p.get("y", 0.0)))
	if sim.distance_to(i, target) <= SpaceData.num(space, "reach", "fix"):
		sim.start_doing(i, "task", float(p.get("dur", 0.0)), pi)
	elif not sim.set_path(i, target):
		_stuck(a)


func _stuck(a: Dictionary) -> void:
	var n := int(a.get("_stuckN", 0)) + 1
	a["_stuckN"] = n
	a["_aiT"] = 0.5
	if n >= 3:
		# 连续三次寻路失败：把 agent 落到最近可行走点，避免永久卡死。
		# 只改位置，不改任何判定状态。
		a["_stuckN"] = 0
		a["_aiT"] = 1.0
		a["pos"] = sim.nav.nearest_free(a.get("pos", Vector2.ZERO))

## 逃跑（2.5D fleeTask：背向威胁源跑 7~10 格，_fleeT 3.5~5 秒内不做别的决策）
func _flee_from(a: Dictionary, threat: Dictionary) -> void:
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	# 弃任务本身是能被看见的事实（2.5D noticeTaskAbandon → saw_task_abandon）
	if float(a.get("doing", 0.0)) > 0.0:
		sim._witness_action(a, "saw_task_abandon", ap)
	a["doing"] = 0.0
	a["_doing"] = ""
	a["taskPt"] = -1
	a["_fleeT"] = 3.5 + sim._rng.randf() * 1.5
	var tp: Vector2 = threat.get("pos", Vector2.ZERO)
	var ang := (ap - tp).angle()
	var dest: Vector2 = ap + Vector2(cos(ang), sin(ang)) * (7.0 + sim._rng.randf() * 3.0)
	if not sim.set_path(int(a.get("i", -1)), dest):
		sim.set_path(int(a.get("i", -1)), sim.nav.nearest_free(dest))
