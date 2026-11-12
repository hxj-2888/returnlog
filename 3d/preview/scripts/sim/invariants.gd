extends RefCounted
## SKInvariants · GDScript 移植（真源 js/engine/invariants.js:12-168，批 V3.1 2026-10-28）
##
## 职责：只做**只读检查** —— 给定一局 sim 状态，返回 {"checks": int, "fails": [{code,msg}]}。
## 不修状态、不掷随机、不读 UI。任何调用都不会改变对局结果。
##
## 与 2.5D 的差异只有「输入/维度」四类，均为 §2.1 允许的 not-applicable，不是机制缺口：
##   · A24 `me` 必须是 0 号席位 —— 3D 的玩家席位由开局决定（me_idx），不固定为 0。
##   · G5 点灯房数 —— 3D 没有 2.5D 的 G.lit 逐舱表，照明按 lit_zone_at() 现算。
##   · M7 票数对账 —— 3D 的 tally 是 close_vote 的局部量，会议对象不留存；
##     只读约束下无法事后复核（要复核就得先写进 meeting，那是改状态）。
##   · D7 `G.drag === me.drag` —— 3D 没有全局 drag 字段，拖拽状态只在 agent.drag。
## 其余 A1-A23 / G1-G4 / D1-D6 / M1-M6 / W1-W2 全部逐条照搬。

const CAUSES := ["knife", "shot", "bled", "vote"]
const PHASES := ["discuss", "vote", "reveal"]
const DRAG_MAX_DIST := 3.2   # @src js/engine/invariants.js:118（≤3.2 格）
const PIPE_NEAR := 1.8       # @src js/game.js:404 nearPipeXY


static func _ok(acc: Dictionary, cond: bool, code: String, msg: String) -> void:
	acc["checks"] = int(acc["checks"]) + 1
	if not cond:
		(acc["fails"] as Array).append({"code": code, "msg": msg})


## 2.5D `a.drag != null` 的 3D 等价：3D 用 -1 表示「没拖」。
static func _drag_of(a: Dictionary) -> int:
	return int(a.get("drag", -1))


## 2.5D `a.draggedBy != null` 的 3D 等价：3D 有 null 与 -1 两种空值（历史遗留），都算没被拖。
static func _dragged_by(a: Dictionary) -> int:
	var raw = a.get("draggedBy", null)
	if raw == null:
		return -1
	return int(raw)


static func check(sim) -> Dictionary:
	var acc := {"checks": 0, "fails": []}
	if sim == null:
		_ok(acc, false, "G0", "缺少 sim 状态")
		return {"checks": int(acc["checks"]), "fails": acc["fails"]}

	var agents: Array = sim.agents
	var me: Dictionary = sim.me()
	var mp: Dictionary = sim.map
	var bounds: Dictionary = mp.get("bounds", {}) as Dictionary
	var n_points: int = (sim.points as Array).size()

	# ---------- 人 / 阵营 ----------
	_ok(acc, agents.size() == 15, "A1", "人数 %d ≠ 15" % agents.size())
	var names := {}
	var aliens := 0
	var humans := 0
	for a: Dictionary in agents:
		var nm := String(a.get("name", "?"))
		names[nm] = int(names.get(nm, 0)) + 1
		if bool(a.get("alien", false)):
			aliens += 1
		else:
			humans += 1
		var ai := int(a.get("i", -1))
		_ok(acc, ai >= 0 and ai < 15, "A2", nm + " 席位号越界 %d" % ai)
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		_ok(acc, is_finite(ap.x) and is_finite(ap.y), "A3", nm + " 坐标非有限数")
		if not bounds.is_empty():
			_ok(acc, ap.x >= -1.0 and ap.x <= float(bounds.get("w", 0)) + 1.0
				and ap.y >= -1.0 and ap.y <= float(bounds.get("h", 0)) + 1.0,
				"A4", nm + " 越出船体边界")
		var tasks: Array = a.get("tasks", []) as Array
		_ok(acc, tasks.size() == 4, "A5", nm + " 任务数 ≠ 4")
		var uniq := {}
		for t in tasks:
			uniq[int(t)] = true
		_ok(acc, uniq.size() == tasks.size(), "A6", nm + " 任务点重复")
		for t in tasks:
			_ok(acc, int(t) >= 0 and int(t) < n_points, "A7",
				nm + " 任务索引越界 %d" % int(t))
		var tidx := int(a.get("tIdx", 0))
		_ok(acc, tidx >= 0 and tidx <= tasks.size(), "A8",
			nm + " 任务进度越界 %d" % tidx)
		var doing := float(a.get("doing", 0.0))
		_ok(acc, doing <= 0.0 or (is_finite(doing) and doing < 400.0), "A9",
			nm + " 动作计时异常")

		# ---------- 生 / 死 / 濒死 ----------
		_ok(acc, not bool(a.get("downed", false)) or bool(a.get("alive", false)), "A10",
			nm + " 濒死但已不在场")
		var k := int(a.get("knife", 0))
		_ok(acc, k >= 0 and k <= 1, "A11", nm + " 刀数异常 %d" % k)
		var q := int(a.get("qual", 0))
		_ok(acc, q >= 0 and q <= 2, "A12", nm + " 资格异常 %d" % q)
		var bl := int(a.get("bullet", 0))
		_ok(acc, bl >= 0 and bl <= 1, "A13", nm + " 子弹异常 %d" % bl)
		var mk := int(a.get("medkit", 0))
		_ok(acc, mk >= 0 and mk <= 1, "A14", nm + " 医疗包异常 %d" % mk)
		if not bool(a.get("alive", false)):
			var cause := String(a.get("deathCause", ""))
			_ok(acc, CAUSES.has(cause), "A15", nm + " 死亡但无合法死因（" + cause + "）")
			if cause != "vote":
				_ok(acc, a.has("bodyPos"), "A16", nm + " 死亡但缺尸体坐标")
		if bool(a.get("alive", false)) and not bool(a.get("downed", false)) \
				and not bool(a.get("ghost", false)):
			var on_floor := false
			if sim.nav != null:
				on_floor = bool(sim.nav.is_free(ap))
			if not on_floor:
				for q2: Dictionary in (sim.pipes as Array):
					if ap.distance_to(Vector2(float(q2.get("x", 0.0)),
							float(q2.get("y", 0.0)))) < PIPE_NEAR:
						on_floor = true
						break
			_ok(acc, on_floor, "A17", nm + " 站在不可走位置")
		var path = a.get("path", PackedVector2Array())
		if bool(a.get("detained", false)):
			_ok(acc, (path as PackedVector2Array).is_empty(), "A18",
				nm + " 被擒拿但仍有路径")
		_ok(acc, typeof(path) == TYPE_PACKED_VECTOR2_ARRAY, "A19", nm + " 路径不是向量数组")
		if typeof(path) == TYPE_PACKED_VECTOR2_ARRAY and not (path as PackedVector2Array).is_empty():
			var last: Vector2 = (path as PackedVector2Array)[(path as PackedVector2Array).size() - 1]
			_ok(acc, is_finite(last.x) and is_finite(last.y), "A20",
				nm + " 路径终点非有限数")
	_ok(acc, names.size() == agents.size(), "A21", "存在重名席位")
	_ok(acc, aliens == 4, "A22", "异形 %d ≠ 4" % aliens)
	_ok(acc, humans == 11, "A23", "人类 %d ≠ 11" % humans)

	# ---------- 全局 ----------
	var prog := int(sim.prog)
	_ok(acc, prog >= 0 and prog <= int(sim.win_pts()), "G1", "维修进度越界 %d" % prog)
	_ok(acc, int(sim.night) >= 1, "G2", "夜数 < 1")
	var tt := float(sim.t)
	_ok(acc, is_finite(tt) and tt >= -1.0 and tt <= float(sim.night_len()) + 1.0, "G3",
		"夜间计时越界 %.2f" % tt)
	var ls := int(sim.light_state)
	_ok(acc, ls == 0 or ls == 1 or ls == 2, "G4", "灯光态非法 %d" % ls)

	# ---------- 拖拽（玩家与 AI 共用） ----------
	for a: Dictionary in agents:
		var drag_i := _drag_of(a)
		var nm2 := String(a.get("name", "?"))
		if drag_i >= 0:
			_ok(acc, drag_i < agents.size(), "D1", nm2 + " 拖拽目标不存在")
			if drag_i < agents.size():
				var b: Dictionary = agents[drag_i]
				_ok(acc, b != a, "D1b", nm2 + " 拖拽了自己")
				_ok(acc, _dragged_by(b) == int(a.get("i", -1)), "D2",
					nm2 + " 拖拽标记未与目标互指")
				_ok(acc, bool(a.get("alive", false)) and not bool(a.get("downed", false))
					and not bool(a.get("detained", false)), "D3",
					nm2 + " 当前状态不能拖拽")
				var has_body := not bool(b.get("alive", false)) or bool(b.get("downed", false))
				_ok(acc, has_body, "D4", nm2 + " 拖拽目标没有尸体/濒死者")
				if has_body:
					var bp: Vector2 = b.get("bodyPos", Vector2.ZERO)
					var ap2: Vector2 = a.get("pos", Vector2.ZERO)
					_ok(acc, ap2.distance_to(bp) <= DRAG_MAX_DIST, "D5",
						nm2 + " 拖拽距离过远 %.2f" % ap2.distance_to(bp))
		var by_i := _dragged_by(a)
		if by_i >= 0:
			_ok(acc, by_i < agents.size()
				and _drag_of(agents[by_i]) == int(a.get("i", -1)), "D6",
				nm2 + " 被拖标记没有对应拖拽者")

	# ---------- 会议 / 投票 ----------
	var meeting: Dictionary = sim.meeting
	if not meeting.is_empty():
		var phase := String(meeting.get("phase", ""))
		_ok(acc, PHASES.has(phase), "M1", "会议阶段非法 " + phase)
		_ok(acc, is_finite(float(meeting.get("t", 0.0))), "M2", "会议计时非有限数")
		if phase == "vote":
			var votes: Dictionary = meeting.get("votes", {}) as Dictionary
			for vk in votes.keys():
				var vi := int(vk)
				_ok(acc, vi >= 0 and vi < agents.size(), "M3", "未知投票人 %d" % vi)
				if vi >= 0 and vi < agents.size():
					var voter: Dictionary = agents[vi]
					_ok(acc, bool(voter.get("alive", false))
						and not bool(voter.get("downed", false)), "M4",
						String(voter.get("name", "?")) + " 已不能投票却投了票")
				var tgt := int(votes[vk])
				_ok(acc, tgt == -1 or (tgt >= 0 and tgt < agents.size()), "M5",
					"票目标越界 %d" % tgt)
				if tgt >= 0:
					_ok(acc, tgt != vi, "M6",
						"席位 %d 投了自己" % vi)

	# ---------- 结算 ----------
	if bool(sim.over):
		_ok(acc, String(sim.over_why) != "", "W1", "已结束但没有原因")
		_ok(acc, meeting.is_empty(), "W2", "已结束但会议仍开着")

	return {"checks": int(acc["checks"]), "fails": acc["fails"]}
