extends RefCounted

## 异形 AI（B3 最小版）：找人 → 走到刀程 → 出刀；偶尔去非会议室舱破坏。
## 不做完整的计划/伪装/管道，这些留给后续批次；先把“夜里真的会死人”跑起来。
## 口径：异形互不知道身份，这里也不读队友表；目标只按“最近的活人”选。

const SpaceData := preload("res://scripts/space_data.gd")

var sim
var space: Dictionary = {}
## 决策遥测：只计数，不参与判定；--sim1000 汇总用
var stats: Dictionary = {}
## 预计算的门口世界坐标（2.5D exitDistAt 的逃逸成本原料）
var _doors: Array = []
## 管道口（map_v2.pipes，2.5D M.pipes 同源）
var _pipes: Array = []


func _bump(k: String) -> void:
	stats[k] = int(stats.get(k, 0)) + 1


func setup(p_sim, p_space: Dictionary) -> void:
	sim = p_sim
	space = p_space
	# 2.5D exitDistAt：出刀点离最近的门/管道口越远，红身期间越走不干净。
	# 3D 用 map_v2 的房间门表预计算同一批点。
	_doors = []
	_pipes = (sim.map.get("pipes", []) as Array).duplicate()
	for r: Dictionary in (sim.map.get("rooms", []) as Array):
		var rect: Array = r.get("rect", []) as Array
		if rect.size() < 4:
			continue
		var rx := float(rect[0])
		var ry := float(rect[1])
		var rw := float(rect[2])
		var rh := float(rect[3])
		for d: Array in (r.get("doors", []) as Array):
			var side := String(d[0])
			var off := float(d[1])
			match side:
				"t":
					_doors.append(Vector2(rx + off, ry))
				"b":
					_doors.append(Vector2(rx + off, ry + rh))
				"l":
					_doors.append(Vector2(rx, ry + off))
				"r":
					_doors.append(Vector2(rx + rw, ry + off))


## 出刀点离最近出口的距离（2.5D exitDistAt）
func _exit_dist(p: Vector2) -> float:
	var best := 1.0e9
	for d: Vector2 in _doors:
		best = minf(best, p.distance_to(d))
	return best


## 管道突袭（2.5D alienPipeMove，js/game.js:3613）：
##   · 只在目标 >15 格、没拖尸、冷却完毕时考虑；
##   · 自己贴着某个管道口（<1.2 格）且**存在一个出口比走路显著更近**（收益 > 5 格）
##     → 直接传送过去（PIPE.cooldown 20 秒）；
##   · 入口与出口 6 格内的目击者写 saw_pipe（ID_EVIDENCE 确证级）。
## 收益不足时按计划走向入口（_pipePlan），每夜最多走 2 趟（_pipeSeeks）。
func _pipe_move(a: Dictionary, tgt_pos: Vector2, td: float, dt: float) -> bool:
	if _pipes.is_empty() or td <= 15.0 or int(a.get("drag", -1)) >= 0:
		a["_pipePlan"] = {}
		return false
	if float(a.get("_pipeCD", 0.0)) > 0.0:
		a["_pipePlan"] = {}
		return false
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var from := Vector2.ZERO
	var have_from := false
	for q: Dictionary in _pipes:
		var qp := Vector2(float(q.get("x", 0.0)), float(q.get("y", 0.0)))
		if ap.distance_to(qp) < 1.2:
			from = qp
			have_from = true
			break
	var cd := 20.0
	var pipe_cfg: Dictionary = (sim.cfg.get("rules", {}) as Dictionary).get("PIPE", {}) as Dictionary
	cd = float(pipe_cfg.get("cooldown", 20.0))
	if have_from:
		var best := Vector2.ZERO
		var bd := 1.0e9
		for q2: Dictionary in _pipes:
			var qp2 := Vector2(float(q2.get("x", 0.0)), float(q2.get("y", 0.0)))
			if qp2 == from:
				continue
			var d := qp2.distance_to(tgt_pos)
			if d < bd:
				bd = d
				best = qp2
		if bd < td - 4.0:
			_teleport_pipe(a, from, best, cd)
			return true
		# 出口没有明显收益：原计划作废
		a["_pipePlan"] = {}
		return false
	# 不在管道口：估算"走到入口 + 出口到目标"是否比直走省 5 格以上
	var seeks := int(a.get("_pipeSeeks", 0))
	if seeks >= 2:
		return false
	var plan: Dictionary = a.get("_pipePlan", {}) as Dictionary
	if plan.is_empty():
		var gain := 5.0
		for pin: Dictionary in _pipes:
			var pinp := Vector2(float(pin.get("x", 0.0)), float(pin.get("y", 0.0)))
			var out_best := Vector2.ZERO
			var out_bd := 1.0e9
			for q3: Dictionary in _pipes:
				var qp3 := Vector2(float(q3.get("x", 0.0)), float(q3.get("y", 0.0)))
				if qp3 == pinp:
					continue
				var d3 := qp3.distance_to(tgt_pos)
				if d3 < out_bd:
					out_bd = d3
					out_best = qp3
			var g := td - (pinp.distance_to(ap) + out_bd)
			if g > gain:
				gain = g
				plan = {"in": pinp, "out": out_best}
				sim._stat("alienPipePlans", 1)
		a["_pipePlan"] = plan
	if not plan.is_empty():
		var pinp2: Vector2 = plan["in"]
		if ap.distance_to(pinp2) < 1.2:
			_teleport_pipe(a, pinp2, plan["out"], cd)
			return true
		if sim.set_path(int(a.get("i", -1)), pinp2):
			return true
	return false


## 传送落点 + 目击/声响（2.5D 的 logEvent pipe + witnessAlienAction）
func _teleport_pipe(a: Dictionary, from: Vector2, to: Vector2, cd: float) -> void:
	a["pos"] = to
	a["path"] = PackedVector2Array()
	a["pathI"] = 0
	a["_pipeCD"] = cd
	a["_pipePlan"] = {}
	a["_pipeSeeks"] = int(a.get("_pipeSeeks", 0)) + 1
	sim._stat("alienPipes", 1)
	sim._log("pipe", {"actor": int(a.get("i", -1)), "x": to.x, "y": to.y})
	sim._witness_action(a, "saw_pipe", from)
	sim._witness_action(a, "saw_pipe", to)


func tick(dt: float) -> void:
	if sim == null or sim.over:
		return
	for a: Dictionary in sim.agents:
		if not bool(a.get("alien", false)):
			continue
		# 异形报告（2.5D alienReportWorth 简化）：看到未报告尸体 35% 概率排误导报告。
		# 报告把人类聚到现场、把票压向好栽赃的人 —— 收益由会议链结算。
		if bool(a.get("alive", false)) and not bool(a.get("downed", false)) \
				and float(a.get("_reportT", 0.0)) <= 0.0 and int(a.get("reportLeft", 0)) > 0:
			var apx: Vector2 = a.get("pos", Vector2.ZERO)
			for v: Dictionary in sim.agents:
				if bool(v.get("alive", false)) or bool(v.get("bodyReported", false)):
					continue
				var bpx: Vector2 = v.get("bodyPos", Vector2.ZERO)
				# 5.4 = 2.5D js/game.js:2505/2513 的硬编码尸体发现半径（真源同样没有进
				# rules.json，此处按行号同源，改动必须两边一起动）。
				if apx.distance_to(bpx) < 5.4 and sim.ai_can_see(apx, bpx):
					if int(a.get("_alienReports", 0)) < 1 and sim._rng.randf() < 0.20:
						a["_alienReports"] = 1
						a["_reportBody"] = int(v.get("i", -1))
						a["_reportT"] = 2.0 + sim._rng.randf() * 2.0
					break
		var rt := float(a.get("_reportT", 0.0))
		if rt > 0.0:
			a["_reportT"] = rt - dt
			if float(a.get("_reportT", 0.0)) <= 0.0:
				var rbi := int(a.get("_reportBody", -1))
				a["_reportBody"] = -1
				var rb: Dictionary = sim.agent(rbi)
				if not rb.is_empty() and not bool(rb.get("bodyReported", false)):
					var rbp: Vector2 = rb.get("bodyPos", Vector2.ZERO)
					# 5.8 = 2.5D js/game.js:2489 的远程拉铃半径（同源硬编码，见上一条）
					if (a.get("pos", Vector2.ZERO) as Vector2).distance_to(rbp) <= 5.8 \
							and sim.ai_can_see(a.get("pos", Vector2.ZERO), rbp):
						sim.open_meeting(int(a.get("i", -1)), rbi)
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		if float(a.get("_avoid_t", 0.0)) > 0.0:
			a["_avoid_t"] = float(a.get("_avoid_t", 0.0)) - dt
		# 管道冷却（PIPE.cooldown）与 hunt 节流
		if float(a.get("_pipeCD", 0.0)) > 0.0:
			a["_pipeCD"] = maxf(0.0, float(a.get("_pipeCD", 0.0)) - dt)
		if float(a.get("_fakeCD", 0.0)) > 0.0:
			a["_fakeCD"] = maxf(0.0, float(a.get("_fakeCD", 0.0)) - dt)
		if float(a.get("_botCD", 0.0)) > 0.0:
			a["_botCD"] = maxf(0.0, float(a.get("_botCD", 0.0)) - dt)
		var sab_night := int(a.get("_sabNight", -1))
		if sab_night != int(sim.night):
			a["_sabNight"] = int(sim.night)
			a["_sabDone"] = false
			a["_sabT"] = sim.rules.n("DISGUISE", "cooldown", 18.0) + sim._rng.randf() * 10.0
		else:
			a["_sabT"] = float(a.get("_sabT", 0.0)) - dt
		if float(a.get("doing", 0.0)) > 0.0:
			continue
		var path: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
		if path.size() > 0:
			continue
		var wait := float(a.get("_aiT", 0.0)) - dt
		a["_aiT"] = wait
		if wait > 0.0:
			continue
		_decide(a)


func _decide(a: Dictionary) -> void:
	var i := int(a.get("i", -1))
	var ap0: Vector2 = a.get("pos", Vector2.ZERO)

	# ---- 补给链（2.5D aiAlien 3505-3528，与人类同一条规则）----
	# 有申请单先回圆桌领取；有申请单且缺子弹 → 军械补给点。
	# 2.5D 异形场均 alienShots 1.0 次 —— 子弹就是从这条链来的；
	# 3D 之前异形完全没有补给行为，"异形开枪"因此无从发生。
	var qual_pending := int(a.get("qualPending", 0))
	var qual := int(a.get("qual", 0))
	if qual_pending > 0 and qual < 2:
		var spot: Vector2 = sim.claim_spot()
		if sim.distance_to(i, spot) <= SpaceData.num(space, "reach", "round_table"):
			sim.start_doing(i, "claim", SpaceData.num(space, "stand", "qual"))
		elif sim.set_path(i, spot):
			return
	if qual > 0 and int(a.get("bullet", 0)) < 1:
		var sp: Vector2 = sim.supply_spot("ammo")
		if sim.distance_to(i, sp) <= SpaceData.num(space, "reach", "fix"):
			sim.start_doing(i, "supply", SpaceData.num(space, "stand", "ammo"), -1, "ammo")
		elif sim.set_path(i, sp):
			return

	# 翻尸体（2.5D lootRun）：缺子弹/申请单时搜身边没搜过的尸体。
	# 2.5D 场均 alienLoots ≈ 2 —— 异形的子弹大部分来自这里。
	if int(a.get("bullet", 0)) < 1 or int(a.get("qual", 0)) < 2:
		var body2: Dictionary = sim.body_near(a.get("pos", Vector2.ZERO),
			SpaceData.num(space, "reach", "body"))
		if not body2.is_empty() and not bool(body2.get("searched", false)) \
				and (int(body2.get("bullet", 0)) > 0 or int(body2.get("qual", 0)) > 0):
			if sim.search_body(int(body2.get("i", -1)), i):
				a["_aiT"] = 1.0
				return

	# 每夜最多一次破坏；冷却在 tick 里逐帧减，只有空闲时才真的去。
	if not bool(a.get("_sabDone", false)) and float(a.get("_sabT", 999.0)) <= 0.0:
		if sim._rng.randf() < 0.35 and _try_sabotage(a):
			return

	# ---- 拖尸中：先把尸体送到藏尸点再谈别的（2.5D dragAway 链）----
	if int(a.get("drag", -1)) >= 0:
		var hid2 := String(a.get("_dragTo", ""))
		if hid2 == "":
			a["drag"] = -1
		else:
			var hpos: Vector2 = sim.room_center(hid2)
			if ap0.distance_to(hpos) < 2.0:
				a["drag"] = -1
				a["_dragTo"] = ""
				a["_aiT"] = 1.0
				return
			if sim.set_path(i, hpos):
				return
			a["drag"] = -1
			a["_dragTo"] = ""
	# ---- 伪装效用表（2.5D alienPlan disguise 分支简化忠实版）----
	# 2.5D 原始门槛：刀用完了才轮到"演一下"（效用表原缝：knife<=0 + 有观众）。
	# 冷却好了且 disguiseScore ≥ minScore → 本拍去演；否则继续狩猎。
	if int(a.get("knife", 0)) <= 0 and float(a.get("_fakeCD", 0.0)) <= 0.0 \
			and _try_disguise(a):
		return
	# 当众拉闸（每夜每异形一掷，DISGUISE.breakerChance 0.10）
	if String(a.get("_breakerRollN", "")) != str(int(sim.night)):
		a["_breakerRollN"] = str(int(sim.night))
		a["_breakerWant"] = sim._rng.randf() < float(
			(sim.cfg.get("rules", {}) as Dictionary).get("DISGUISE", {}).get("breakerChance", 0.1))
	if bool(a.get("_breakerWant", false)) and _try_breaker_off(a):
		return

	var best := -1
	var bd := 1.0e9
	var bpos := Vector2.ZERO
	var bvic: Dictionary = {}
	# 目标承诺（2.5D a.target 的粘性）：上一夜目标仍活着就优先继续追，
	# 不再每秒重选最近的人 —— 真人猎手不会因为别人更近就立刻换目标。
	var prev_i := int(a.get("_tgtI", -1))
	var prev: Dictionary = sim.agent(prev_i)
	var have_prev := false
	if not prev.is_empty() and bool(prev.get("alive", false)) \
			and not bool(prev.get("downed", false)) and not bool(prev.get("alien", false)) \
			and not (float(a.get("_avoid_t", 0.0)) > 0.0 and prev_i == int(a.get("_avoid_i", -1))):
		have_prev = true
	for v: Dictionary in sim.agents:
		if bool(v.get("alien", false)) or not bool(v.get("alive", false)):
			continue
		if float(a.get("_avoid_t", 0.0)) > 0.0 and int(v.get("i", -1)) == int(a.get("_avoid_i", -1)):
			continue
		if bool(v.get("downed", false)):
			continue
		# B4 起玩家也能还手（左键出刀 / 右键开枪），所以这里不再对玩家留手。
		# 保安机器人会抓现行：在它 6 格 + 180° 视野内动手，出刀就会被追。
		var vp: Vector2 = v.get("pos", Vector2.ZERO)
		# 2.5D HUNT：按目击风险挑落单的人，别无脑往人群里扎。
		var near := 0
		for w: Dictionary in sim.agents:
			if w == v or bool(w.get("alien", false)) or not bool(w.get("alive", false)):
				continue
			if bool(w.get("downed", false)) or bool(w.get("detained", false)):
				continue
			if float(w.get("doing", 0.0)) > 0.0:
				continue
			if (w.get("pos", Vector2.ZERO) as Vector2).distance_to(vp) <= sim.rules.n("KNIFE", "crowdR", 9):
				near += 1
		var score: float = sim.distance_to(i, vp) + float(sim.rules.i("AVOID", "nearR", 6)) * float(near)
		# 承诺中的目标获得距离当量折价（HUNT.memorySec 内不轻易换目标）
		if have_prev and int(v.get("i", -1)) == prev_i:
			score -= float(sim.rules.n("HUNT", "memorySec", 25.0)) * 0.2
		if score < bd:
			bd = score
			best = int(v.get("i", -1))
			bpos = vp
			bvic = v
	if best < 0:
		_bump("no_target")
		a["_aiT"] = 1.0
		a["_tgtI"] = -1
		return
	a["_tgtI"] = best
	var real_d: float = sim.distance_to(i, bpos)
	# 2.5D aiAlien 的开枪分支（js/game.js:3877）：异形有子弹也会开枪 ——
	# 远距离/没刀时优先用枪，而不是永远只贴脸出刀。
	# 条件：有弹 + 不是队友 + (没进刀程 或 没刀) + 枪程内 + LOS + alienFireP 概率。
	if int(a.get("bullet", 0)) > 0 and real_d > SpaceData.num(space, "reach", "knife"):
		var shoot_range: float = SpaceData.num(space, "shoot", "range")
		if real_d <= shoot_range and sim.ai_can_see(a.get("pos", Vector2.ZERO), bpos):
			var fire_p := 0.7
			var shot_cfg: Dictionary = (sim.cfg.get("rules", {}) as Dictionary).get("SHOT", {}) as Dictionary
			fire_p = float(shot_cfg.get("alienFireP", 0.7))
			if sim._rng.randf() < fire_p:
				if sim.shoot(i, best):
					_bump("shot_ok")
					a["_aiT"] = 1.5
					return
	if real_d <= SpaceData.num(space, "reach", "knife"):
		# 2.5D 理智兜底（js/game.js 4108-4128 / SKSanity.KNIFE）：
		# 先过三条与性格无关的硬线，过了才轮到性格冒险率。
		# 数值全部读 sim.json#rules.KNIFE，不在 GDScript 里抄。
		var K: Dictionary = (sim.cfg.get("rules", {}) as Dictionary).get("KNIFE", {}) as Dictionary
		var cap := int(K.get("witnessCap", 3))
		var min_conceal := float(K.get("minConceal", 0.34))
		var crowd_r := float(K.get("crowdR", 9))
		var crowd_n := int(K.get("crowdN", 3))
		var bold_base := float(K.get("boldBase", 0.5))
		var bold_span := float(K.get("boldSpan", 0.16))
		# 2.5D watchersAt/exposureAt：可见半径 R = max(rad, 7, sightRangeAt(受害者)) ——
		# 亮舱整间可见、亮走廊整条可见、暗处只剩近身圆。3D 用光感半径同一口径。
		var sight_r: float = sim.sight_range_at(bpos)
		if sight_r < SpaceData.num(space, "sight", "human_light_r"):
			sight_r = SpaceData.num(space, "sight", "human_light_r")
		var witnesses := 0
		var crowd := 0
		var w_list: Array = []
		for w: Dictionary in sim.agents:
			if w == bvic or bool(w.get("alien", false)):
				continue
			if not bool(w.get("alive", false)) or bool(w.get("downed", false)) \
					or bool(w.get("detained", false)):
				continue
			var busy: bool = float(w.get("doing", 0.0)) > 0.0
			var wp: Vector2 = w.get("pos", Vector2.ZERO)
			var wd: float = wp.distance_to(bpos)
			# 2.5D crowdAt：只看"周围有没有人"，不看注意力 —— 做事的人也算人数
			if wd <= crowd_r:
				crowd += 1
			# 2.5D watchersAt / exposureAt：attention != 'online' 的人**完全排除**
			# （低头做事的人看不见，既不计目击数也不计暴露度 —— 2026-11-05 A 批口径）
			if busy:
				continue
			if sim.ai_can_see(wp, bpos):
				witnesses += 1
				# 2.5D witnessWeight 纯函数：贴脸 1.0 → 视野边缘 0.3
				# （busy 只在"被计入的人"身上生效，被排除的人根本不进表）
				if sim.mind != null:
					w_list.append(sim.mind.witness_weight(wd, sight_r, false))
				else:
					w_list.append(clampf(1.0 - wd / maxf(0.01, sight_r), 0.0, 1.0))
		# 2.5D exposureAt：逃逸成本按「出刀点离最近门/管道口的距离」算 ——
		# 深居房间中央的刀更难逃干净（escapeCost 纯函数）。
		var esc := 0.0
		if sim.mind != null:
			esc = sim.mind.escape_cost(_exit_dist(bpos))
		var conceal: float = 1.0
		if sim.mind != null:
			conceal = 1.0 - sim.mind.exposure(w_list, esc)
		else:
			conceal = 1.0 - w_list.size() / float(maxi(1, cap))
		if witnesses >= cap or conceal < min_conceal or crowd >= crowd_n:
			_bump("block_cap" if witnesses >= cap else ("block_conceal" if conceal < min_conceal else "block_crowd"))
			# 2.5D：被拦下时把该目标记 12 秒不再追，避免原地反复判定
			a["_avoid_i"] = best
			a["_avoid_t"] = sim.rules.disp("avoidSec", 12.0)
			a["_aiT"] = 2.0
			return
		if witnesses >= 1:
			# 性格冒险率区间 boldBase ± boldSpan（0.34~0.66），不是"七成收手"
			var bold: float = bold_base + bold_span * (sim._rng.randf() * 2.0 - 1.0)
			if sim._rng.randf() >= bold:
				_bump("block_bold")
				a["_avoid_i"] = best
				a["_avoid_t"] = 4.0
				a["_aiT"] = 1.0
				return
		if int(a.get("knife", 1)) <= 0:
			a["_aiT"] = 2.0
			return
		_bump("knife_try")
		if sim.knife(i, best):
			_bump("knife_ok")
			# 藏尸（2.5D dragAway）：现场没目击者时把尸体拖向远离医疗间的房间。
			# 拖行降速暴露位置（drag_speed），目击者记 saw_drag（0.22，不加 known）。
			var wit2 := 0
			for w3: Dictionary in sim.agents:
				if w3 == a or bool(w3.get("alien", false)) or not bool(w3.get("alive", false)) \
						or bool(w3.get("downed", false)):
					continue
				if (w3.get("pos", Vector2.ZERO) as Vector2).distance_to(a.get("pos", Vector2.ZERO)) <= 8.0:
					wit2 += 1
			if wit2 == 0 and sim._rng.randf() < 0.5:
				var hid := _hide_room()
				if hid != "":
					a["drag"] = best
					bvic["draggedBy"] = i
					a["_dragTo"] = hid
					sim._witness_action(a, "saw_drag", bpos)
					return
			# 2.5D 没有 25~35 秒全局冷却：限制是"每夜 1 把刀" + RUSH 逃逸，
			# 早先为截图擅自加的长冷却已移除（它把异形削到 79/17.5 的主因之一）。
			a["_aiT"] = 2.0
		return
	# 拆机器人（2.5D aiAlien 的 bot 分支）：有刀且贴身 → 用刀（消耗刀数按 HP 结算）。
	# 保安机器人只在 secbotRaidOk（认出 2+ 队友围捕）时才列为候选 —— 简化版只打医疗机。
	if int(a.get("knife", 0)) > 0 and float(a.get("_botCD", 0.0)) <= 0.0:
		var mb: Vector2 = sim.bot_pos_of("medbot")
		if not sim.bots.is_dead("medbot") and (a.get("pos", Vector2.ZERO) as Vector2).distance_to(mb) < 1.8:
			if sim.knife_bot("medbot", i):
				a["_botCD"] = 10.0
				a["_aiT"] = 1.5
				return
	# 2.5D aiAlien:4095「管道是核心位移能力」：排在补给/伪装之后、没刀游荡之前 ——
	# 目标 >15 格且管道能省 5 格以上就走管道，而不是永远贴地跑。
	if real_d > 15.0 and _pipe_move(a, bpos, real_d, 0.1):
		return
	if sim.set_path(i, bpos):
		return
	_bump("path_fail")
	a["_aiT"] = 1.0


func _try_sabotage(a: Dictionary) -> bool:
	var i := int(a.get("i", -1))
	var rooms: Array = []
	for rid: String in sim.rooms_by_id.keys():
		if rid == "bridge":
			continue
		var pts: Array = []
		for pi in sim.points.size():
			var p: Dictionary = sim.points[pi]
			if String(p.get("room", "")) == rid:
				pts.append(pi)
		if pts.size() > 0:
			rooms.append(rid)
	if rooms.is_empty():
		return false
	var rid := String(rooms[sim._rng.randi_range(0, rooms.size() - 1)])
	var pi := -1
	for k in sim.points.size():
		var p: Dictionary = sim.points[k]
		if String(p.get("room", "")) == rid:
			pi = k
			break
	if pi < 0:
		return false
	var p2: Dictionary = sim.points[pi]
	var target := Vector2(float(p2.get("x", 0)), float(p2.get("y", 0)))
	if sim.distance_to(i, target) <= SpaceData.num(space, "reach", "fix"):
		sim.start_doing(i, "sabotage", 2.0, -1, rid)
		a["_sabDone"] = true
		return true
	if sim.set_path(i, target):
		return true
	return false

## 伪装演出（2.5D alienPlan disguise 分支 / alienSupport 的同源简化）：
## 观众 ≥1 且 disguiseScore ≥ minScore → 选一种演出站桩。
## 演出不吃真实效果，只通过 credBroadcast 按「真假同价」记账。
func _try_disguise(a: Dictionary) -> bool:
	if sim == null or sim.mind == null:
		return false
	var D: Dictionary = (sim.cfg.get("rules", {}) as Dictionary).get("DISGUISE", {}) as Dictionary
	var aud_r := float(D.get("audienceR", 8.0))
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var audience := 0
	for w: Dictionary in sim.agents:
		if w == a or bool(w.get("alien", false)):
			continue
		if not bool(w.get("alive", false)) or bool(w.get("downed", false)):
			continue
		if float(w.get("doing", 0.0)) > 0.0:
			continue
		if (w.get("pos", Vector2.ZERO) as Vector2).distance_to(ap) <= aud_r:
			audience += 1
	if audience <= 0:
		return false
	# 风险：观众 ≥3 加 manyEyes；暗处减分（dark）——其余项走缺省 0
	var risk_in := {"audience": float(audience),
		"dark": not sim.power_on}
	var risk: float = sim.mind.disguise_risk(risk_in)
	var score: float = sim.mind.disguise_score(mini(audience,
		int(D.get("maxAudience", 4.0))), risk, float(D.get("dur", {}).get("fakeTask", [4, 4])[0]))
	if score < float(D.get("minScore", 0.25)):
		return false
	var i := int(a.get("i", -1))
	# 演哪种：附近 12 格有故障就假装修理（fakeRepair），否则假做任务（fakeTask）
	var dur := 4.0
	var fkind := "fakeWork"
	if not sim.dmg.is_empty():
		var d0: Dictionary = sim.dmg[0]
		var dp := Vector2(float(d0.get("x", 0.0)), float(d0.get("y", 0.0)))
		if ap.distance_to(dp) <= float(D.get("fakeRepairR", 12.0)):
			dur = 5.0 + sim._rng.randf() * 4.0
			fkind = "fakeRepair"
			sim.start_doing(i, "fake", dur, -1, String(d0.get("room", "")))
			a["_fakeKind"] = "fakeRepair"
			a["_fakeCD"] = float(D.get("cooldown", 18.0))
			sim._stat("fakeRepairs", 1)
			return true
	# 假做任务：贴着某个任务点才演（2.5D fakeTask 4~8 秒站桩），否则不演
	var rem: Array = sim.remaining_tasks(i)
	for pi: int in rem:
		var pt: Dictionary = sim.point(int(pi))
		var tp := Vector2(float(pt.get("x", 0.0)), float(pt.get("y", 0.0)))
		if ap.distance_to(tp) <= 2.0:
			sim.start_doing(i, "fake", 4.0 + sim._rng.randf() * 4.0, -1, "")
			a["_fakeKind"] = "fakeWork"
			a["_fakeCD"] = float(D.get("cooldown", 18.0))
			sim._stat("fakeTasks", 1)
			return true
	return false


## 当众拉闸（2.5D alienPlan breakerOff 分支 / DISGUISE.breakerChance 0.10 掷骰）：
## 断电、闸在附近、没观众才动手 —— 拉闸是战略动作，不是随便拉。
func _try_breaker_off(a: Dictionary) -> bool:
	if sim == null or sim.power_on == false:
		return false
	var i := int(a.get("i", -1))
	var bp: Vector2 = sim.breaker_pos()
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	if ap.distance_to(bp) > 12.0:
		return false
	# 理智线（BREAKER.witnessCap 1 / minConceal 0.45 / crowd 10-3）
	var B: Dictionary = (sim.cfg.get("rules", {}) as Dictionary).get("BREAKER", {}) as Dictionary
	var witnesses := 0
	for w: Dictionary in sim.agents:
		if w == a or bool(w.get("alien", false)) or not bool(w.get("alive", false)) \
				or bool(w.get("downed", false)):
			continue
		if (w.get("pos", Vector2.ZERO) as Vector2).distance_to(bp) <= 7.0 \
				and sim.ai_can_see(w.get("pos", Vector2.ZERO), bp):
			witnesses += 1
	if witnesses >= int(B.get("witnessCap", 1)):
		return false
	# 每夜一次掷骰（DISGUISE.breakerChance 0.10）
	if sim._rng.randf() > float((sim.cfg.get("rules", {}) as Dictionary).get("DISGUISE", {}).get("breakerChance", 0.1)):
		return false
	if ap.distance_to(bp) <= SpaceData.num(space, "reach", "breaker"):
		sim.toggle_power(i)
		sim._witness_action(a, "saw_breaker", bp)
		a["_aiT"] = 2.0
		return true
	return sim.set_path(i, bp)

## 藏尸目的地（2.5D hideRoomFor 的简化）：随机挑一间非 med/bridge 的房间
func _hide_room() -> String:
	var pool: Array = []
	for r: Dictionary in (sim.map.get("rooms", []) as Array):
		var rid := String(r.get("id", ""))
		if rid != "med" and rid != "bridge" and rid != "":
			pool.append(rid)
	if pool.is_empty():
		return ""
	return String(pool[sim._rng.randi_range(0, pool.size() - 1)])
