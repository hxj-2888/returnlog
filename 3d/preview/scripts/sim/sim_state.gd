extends RefCounted

## 3D 模拟核心 · B1（无发言 / 无美术）
## ------------------------------------------------------------------
## 口径：把 2.5D 的**非发言**规则搬进 3D，先只搬“开局 → 做任务 → 天亮 → 胜负”
## 这条主回路。台词、口供、证言、说服、会议发言一律不在这里；会议的**结构**
## （报告 → 投票 → 驱逐）留到 B5，且投票只用“亲眼看见”的证据。
##
## 分层硬规则（照 3d/ARCHITECTURE.md §3）：
##   · 本文件不读节点、不读输入、不读鼠标；
##   · 所有数值只从 data/sim.json 与 data/map_v2.json 进，不在这里写魔法数；
##   · 事件流只追加，不参与判定；
##   · 随机只用本文件的 rng，调用方给显式 seed。
##
## 与 2.5D 的字段命名刻意保持一致（tIdx / qual / qualPending / pointDone），
## 方便下一步逐函数对照移植，而不是“看起来像”的重写。

const SIM_PATH := "res://data/sim.json"
const MAP_PATH := "res://data/map_v2.json"
const GridNavScript := preload("res://scripts/sim/grid_nav.gd")
const AIHumanScript := preload("res://scripts/sim/ai_human.gd")
const AIAlienScript := preload("res://scripts/sim/ai_alien.gd")
const BotsScript := preload("res://scripts/sim/bots.gd")
const LinesDataScript := preload("res://scripts/sim/lines_data.gd")
const RulesDataScript := preload("res://scripts/sim/rules_data.gd")
const MindScript := preload("res://scripts/sim/mind.gd")
const SpeechScript := preload("res://scripts/sim/speech.gd")
const SpaceData := preload("res://scripts/space_data.gd")

var cfg: Dictionary = {}
var map: Dictionary = {}
var points: Array = []
var rooms_by_id: Dictionary = {}
var space: Dictionary = {}
var nav
var _ai_human
var _ai_alien
var bots
var lines_data
var rules
var mind
var speech
var speech_enabled := false
## B6′：供电 / 拖尸 / 机器人 HP / 旁观
var power_on := true
var breaker_pulls := 0
var spectator := false
var bot_hp: Dictionary = {"secbot": 2, "medbot": 1}
var terminator_on := false

var agents: Array = []
var me_idx := 0
var night := 1
var t := 0.0
var elapsed := 0.0
var prog := 0
var over := false
var over_win := false
var over_why := ""
var power_fixed := false
var events: Array = []
## 批量模拟遥测（2.5D G.simStats 等价物）：只计数不判定。
var stats: Dictionary = {}
## 红身/seenBy 追踪的节流计时
var _track_t: float = 0.0
var point_done: Dictionary = {}
var dmg: Array = []
var meeting: Dictionary = {}
var night_meets := 0
var ai_enabled := true

var seed_used := 0
var _rng := RandomNumberGenerator.new()


## 读一次配置；失败返回 false，调用方必须停下（不做默认值兜底）。
func load_data() -> bool:
	if cfg.is_empty():
		var sim_parsed: Variant = _read_json(SIM_PATH)
		if not (sim_parsed is Dictionary):
			push_error("sim.json 读取失败：%s" % SIM_PATH)
			return false
		cfg = sim_parsed as Dictionary
		for key: String in ["roles", "win", "night", "rules", "names", "points"]:
			if not cfg.has(key):
				push_error("sim.json 缺字段：%s（先跑 node 3d/tools/export-sim.cjs）" % key)
				return false
	if map.is_empty():
		var map_parsed: Variant = _read_json(MAP_PATH)
		if not (map_parsed is Dictionary):
			push_error("map_v2.json 读取失败：%s" % MAP_PATH)
			return false
		map = map_parsed as Dictionary
		points = map.get("points", []) as Array
		for room: Dictionary in (map.get("rooms", []) as Array):
			rooms_by_id[String(room.get("id", ""))] = room
	if points.size() != int((cfg.get("points", {}) as Dictionary).get("count", -1)):
		push_error("sim.json 与 map_v2.json 的任务点数不一致：%d vs %d"
			% [points.size(), int((cfg.get("points", {}) as Dictionary).get("count", -1))])
		return false
	return true


## 开一局。p_map 可由运行中的 map_builder 注入，避免同一份地图在内存里存两份。
## p_me 目前只接受 0..14（B1 只跑人类席位）；旁观席位留给后续批次。
func new_game(p_seed: int, p_me: int = 0, p_map: Dictionary = {}, p_space: Dictionary = {},
		p_player_alien: bool = false) -> bool:
	## 每次开局都重建地图索引：cfg 可以复用，地图不能留上一局的 points 引用。
	map = {}
	points = []
	rooms_by_id = {}
	if not p_map.is_empty():
		map = p_map
		points = map.get("points", []) as Array
		for room: Dictionary in (map.get("rooms", []) as Array):
			rooms_by_id[String(room.get("id", ""))] = room
	if not load_data():
		return false
	space = p_space if not p_space.is_empty() else SpaceData.load_data()
	if space.is_empty():
		push_error("space.json 缺失：先跑 node 3d/tools/export-space.cjs")
		return false
	nav = GridNavScript.new()
	if not nav.build(map):
		push_error("网格构建失败：map_v2.json 不可用")
		return false

	seed_used = p_seed
	_rng.seed = p_seed
	night = 1
	# 2.5D：开局先开一场 pre 公开讨论（不投票），讨论完才进第 1 夜。
	# 3D 之前直接 t = night_len() 开始夜 1，等于少了这一场会议 ——
	# 这是 2.5D 每局 9.64 场会议 vs 3D 3.0 场的最大缺口之一。
	t = 0.0
	elapsed = 0.0
	prog = 0
	over = false
	over_win = false
	over_why = ""
	power_fixed = false
	events = []
	point_done = {}
	agents = []
	dmg = []
	meeting = {}
	night_meets = 0
	power_on = true
	breaker_pulls = 0
	bot_hp = {"secbot": 2, "medbot": 1}
	terminator_on = false

	var names: Array = cfg.get("names", []) as Array
	var n: int = int((cfg.get("roles", {}) as Dictionary).get("agents", 0))
	if names.size() != n or n != 15:
		push_error("sim.json 名单不是 15 项：names=%d roles.agents=%d" % [names.size(), n])
		return false

	me_idx = clampi(p_me, 0, n - 1)
	var alien_n: int = int((cfg.get("roles", {}) as Dictionary).get("aliens", 0))

	# 异形席位：玩家是人类时从其余 14 人抽 4 个；
	# 玩家是异形时先把自己钉进异形集合，再从其余人抽 3 个（总数仍是 4）。
	var pool: Array = []
	for i in n:
		if i != me_idx:
			pool.append(i)
	_shuffle(pool)
	var aliens: Dictionary = {}
	if p_player_alien:
		aliens[me_idx] = true
		for i in alien_n - 1:
			aliens[int(pool[i])] = true
	else:
		for i in alien_n:
			aliens[int(pool[i])] = true

	var hard: Array = []
	var normal: Array = []
	for i in points.size():
		var kind := String((points[i] as Dictionary).get("kind", ""))
		if kind == "hard":
			hard.append(i)
		elif kind == "normal":
			normal.append(i)
	if hard.is_empty() or normal.size() < 3:
		push_error("任务池不足：hard=%d normal=%d" % [hard.size(), normal.size()])
		return false

	var bridge: Dictionary = rooms_by_id.get("bridge", {}) as Dictionary
	var spawn: Array = bridge.get("label", [31.0, 33.5]) as Array
	var spawn_center := Vector2(float(spawn[0]), float(spawn[1]))

	for i in n:
		var task_list: Array = [int(hard[_rng.randi_range(0, hard.size() - 1)])]
		var norm: Array = normal.duplicate()
		_shuffle(norm)
		for k in 3:
			task_list.append(int(norm[k]))
		# 15 个人不能全叠在会议室中心：在 6 格半径内找一个可行走点。
		var ang := _rng.randf_range(0.0, TAU)
		var rad := _rng.randf_range(0.0, 6.0)
		var spawn_pos: Vector2 = nav.nearest_free(spawn_center + Vector2(cos(ang), sin(ang)) * rad)
		agents.append({
			"i": i,
			"name": String(names[i]),
			"alien": aliens.has(i),
			"alive": true,
			"downed": false,
			"ghost": false,
			"ghostPts": 0,
			"tasks": task_list,
			"tIdx": 0,
			"progress": 0,
			"qual": 0,
			"qualPending": 0,
			"_q3": false,
			"_q5": false,
			"bullet": 0,
			"medkit": 0,
			"knife": 1,
			"pos": spawn_pos,
			"path": PackedVector2Array(),
			"pathI": 0,
			"moving": false,
			"doing": 0.0,
			"_dur": 0.0,
			"_doing": "",
			"_item": "",
			"taskPt": -1,
			"_aiT": _rng.randf_range(0.2, 2.5),
			"_stuckN": 0,
			"deathCause": "",
			"killedBy": -1,
			"deathAt": 0.0,
			"downedT": 0.0,
			"downedBy": -1,
			"suspect": {},
			"bodyReported": false,
			"detained": false,
			"medTried": false,
			"reportLeft": int((cfg.get("rules", {}) as Dictionary).get("MEET", {}).get("reportsPerAgent", 2)),
			"drag": -1,
			"hidden": false,
			"bodyPos": spawn_pos,
		})

	# S 轨：语料 / 认知 / 发言调度。lines.json 缺失时降级为"无发言"但不崩模拟。
	rules = RulesDataScript.new()
	rules.setup()
	lines_data = LinesDataScript.new()
	speech_enabled = lines_data.setup()
	mind = MindScript.new()
	mind.setup(self, lines_data)
	speech = SpeechScript.new()
	speech.setup(self, lines_data, mind)
	speech.clear_game()
	if speech_enabled:
		for a: Dictionary in agents:
			mind.init_agent(a)

	_ai_human = AIHumanScript.new()
	_ai_human.setup(self, space)
	_ai_alien = AIAlienScript.new()
	_ai_alien.setup(self, space)
	bots = BotsScript.new()
	bots.setup(self, space)
	_log("game_start", {"night": 1, "seed": p_seed, "me": me_idx})
	# 2.5D：开局公开讨论（pre 会议，不投票），讨论完直接进第 1 夜。
	open_meeting_kind(MEET_PRE, -1, -1)
	check_win()
	return true


func night_len() -> float:
	return float((cfg.get("night", {}) as Dictionary).get("len", 0.0))


func win_pts() -> int:
	return int((cfg.get("win", {}) as Dictionary).get("pts", 0))


func me() -> Dictionary:
	if agents.is_empty():
		return {}
	return agents[me_idx] as Dictionary


func agent(i: int) -> Dictionary:
	if i < 0 or i >= agents.size():
		return {}
	return agents[i] as Dictionary


func point(i: int) -> Dictionary:
	if i < 0 or i >= points.size():
		return {}
	return points[i] as Dictionary


## 任务分值只查 sim.json 的 win.task_pts（hard=2 / normal=1），不在代码里写 2/1。
func task_pts(point_i: int) -> int:
	var p := point(point_i)
	if p.is_empty():
		return 0
	var kind := String(p.get("kind", ""))
	var table: Dictionary = (cfg.get("win", {}) as Dictionary).get("task_pts", {}) as Dictionary
	return int(table.get(kind, 0))


## 位置 → 舱室 id（发言自述 / 证词现场要用）。房间 poly 优先，落在走廊返回空串。
func room_at(p: Vector2) -> String:
	for r: Dictionary in (map.get("rooms", []) as Array):
		var poly := PackedVector2Array()
		for q: Array in (r.get("poly", []) as Array):
			poly.append(Vector2(float(q[0]), float(q[1])))
		if poly.size() >= 3 and Geometry2D.is_point_in_polygon(p, poly):
			return String(r.get("id", ""))
	return ""


func room_name(room_id: String) -> String:
	var room: Dictionary = rooms_by_id.get(room_id, {}) as Dictionary
	return String(room.get("name", room_id))


## 玩家当前还剩哪些任务（返回 point 索引数组，按 tIdx 起算，顺序即游戏内顺序）。
func remaining_tasks(agent_i: int = -1) -> Array:
	var a: Dictionary = me() if agent_i < 0 else agent(agent_i)
	if a.is_empty():
		return []
	var out: Array = []
	var list: Array = a.get("tasks", []) as Array
	for k in range(int(a.get("tIdx", 0)), list.size()):
		out.append(int(list[k]))
	return out


## 这个点是不是该 agent「现在可以修」的任务。2.5D 的判定是
## `ml.indexOf(point) >= 0`，即只认 tIdx 之后的剩余任务；乱序修也会在结算时换位。
func can_do_task(point_i: int, agent_i: int = -1) -> bool:
	var a: Dictionary = me() if agent_i < 0 else agent(agent_i)
	if a.is_empty() or over:
		return false
	if not bool(a.get("alive", false)) or bool(a.get("ghost", false)):
		return false
	return remaining_tasks(agent_i).has(point_i)


## 完成一个任务点：进度、个人任务位、申请单、电路修复、事件、胜负。
## 返回 {ok, pts, prog, qual, power_fix, win, why}；失败时 ok=false 且 reason 有话说。
func complete_task(agent_i: int, point_i: int) -> Dictionary:
	var fail := {"ok": false, "reason": ""}
	if over:
		fail["reason"] = "对局已结束"
		return fail
	var a := agent(agent_i)
	if a.is_empty() or not bool(a.get("alive", false)):
		fail["reason"] = "角色不存在或已死亡"
		return fail
	var p := point(point_i)
	if p.is_empty():
		fail["reason"] = "任务点不存在"
		return fail
	var list: Array = a.get("tasks", []) as Array
	var t_idx := int(a.get("tIdx", 0))
	var at := -1
	for k in range(t_idx, list.size()):
		if int(list[k]) == point_i:
			at = k
			break
	if at < 0:
		fail["reason"] = "不是该角色剩余任务"
		return fail

	# 乱序完成时把该点换到 tIdx 槽位，保持 [0,tIdx) 全是已完成任务。
	if at != t_idx:
		var cur: int = int(list[t_idx])
		list[t_idx] = point_i
		list[at] = cur
		a["tasks"] = list

	var v := task_pts(point_i)
	if v <= 0:
		fail["reason"] = "任务分值取不到（sim.json win.task_pts）"
		return fail

	prog = mini(win_pts(), prog + v)
	a["progress"] = int(a.get("progress", 0)) + v
	a["tIdx"] = t_idx + 1
	point_done[point_i] = elapsed

	# 物资申请单：个人进度到 3 / 5 各生成一张「待领取」，回圆桌领取（B3 接）。
	var got_qual := false
	if int(a.get("progress", 0)) >= 3 and not bool(a.get("_q3", false)):
		a["_q3"] = true
		a["qualPending"] = int(a.get("qualPending", 0)) + 1
		got_qual = true
	if int(a.get("progress", 0)) >= 5 and not bool(a.get("_q5", false)):
		a["_q5"] = true
		a["qualPending"] = int(a.get("qualPending", 0)) + 1
		got_qual = true

	# 配电室「电路维修」完成 ⇒ 全船照明恢复（与 2.5D finishDoing 同一条）。
	var power_fix := false
	if String(p.get("room", "")) == "power" and String(p.get("label", "")) == "电路维修" and not power_fixed:
		power_fixed = true
		power_fix = true

	_log("task", {
		"actor": agent_i, "label": String(p.get("label", "")), "room": String(p.get("room", "")),
		"pts": v, "ghost": bool(a.get("ghost", false)), "prog": prog,
	})
	var won := check_win()
	return {
		"ok": true, "pts": v, "prog": prog, "qual": got_qual,
		"power_fix": power_fix, "win": won, "why": over_why,
	}


## 圆桌领申请单：B1 只做结算函数，交互在 B3 接圆桌站桩。
func claim_qual(agent_i: int = -1) -> bool:
	var a: Dictionary = me() if agent_i < 0 else agent(agent_i)
	if a.is_empty() or int(a.get("qualPending", 0)) <= 0:
		return false
	a["qualPending"] = int(a.get("qualPending", 0)) - 1
	a["qual"] = mini(2, int(a.get("qual", 0)) + 1)
	_log("qual", {"actor": int(a.get("i", -1)), "n": int(a.get("qual", 0))})
	return true


## 补给点兑换：消耗 1 张申请单换 1 份子弹 / 医疗包。
func exchange_supply(item: String, agent_i: int = -1) -> bool:
	var a: Dictionary = me() if agent_i < 0 else agent(agent_i)
	if a.is_empty() or int(a.get("qual", 0)) <= 0:
		return false
	if item != "ammo" and item != "medkit":
		return false
	a["qual"] = int(a.get("qual", 0)) - 1
	var key := "bullet" if item == "ammo" else "medkit"
	a[key] = int(a.get(key, 0)) + 1
	_log("supply", {"actor": int(a.get("i", -1)), "item": item})
	return true


func tick(dt: float) -> void:
	if over or dt <= 0.0:
		return
	if not meeting.is_empty():
		_tick_meeting(dt)
		return
	elapsed += dt
	if ai_enabled:
		if _ai_human != null:
			_ai_human.tick(dt)
		if _ai_alien != null:
			_ai_alien.tick(dt)
	tick_agents(dt)
	if bots != null:
		bots.tick(dt)
	_tick_dmg(dt)
	# 红身 / seenBy 追踪：0.5 秒一次（2.5D trackNight 的节流版）
	_track_t += dt
	if _track_t >= 0.5:
		_track_t = 0.0
		_track_pass()
	t -= dt
	if t <= 0.0:
		_dawn()


## 推进所有 agent 的移动与站桩计时。AI 只负责“下一步做什么”，这里只执行。
func tick_agents(dt: float) -> void:
	var speed := SpaceData.num(space, "move", "speed")
	var drag_speed := SpaceData.num(space, "move", "drag_speed")
	for a: Dictionary in agents:
		if not bool(a.get("alive", false)):
			continue
		if bool(a.get("detained", false)):
			continue
		# RUSH 逃逸计时（独立于红身）：2.5D RUSH 是"放倒人之后的体力状态"
		if float(a.get("rushT", 0.0)) > 0.0:
			a["rushT"] = maxf(0.0, float(a.get("rushT", 0.0)) - dt)
		# 红身计时（RED_BODY.dur）：只决定"目击者能否一眼认出刚出刀的人"
		if float(a.get("redT", 0.0)) > 0.0:
			a["redT"] = maxf(0.0, float(a.get("redT", 0.0)) - dt)
		if bool(a.get("downed", false)):
			a["downedT"] = float(a.get("downedT", 0.0)) - dt
			if float(a.get("downedT", 0.0)) <= 0.0:
				die(a)
			continue
		if float(a.get("doing", 0.0)) > 0.0:
			a["doing"] = float(a.get("doing", 0.0)) - dt
			if float(a.get("doing", 0.0)) <= 0.0:
				a["doing"] = 0.0
				_finish_doing(a)
			continue
		if int(a.get("drag", -1)) >= 0:
			var body: Dictionary = agent(int(a.get("drag", -1)))
			if not body.is_empty():
				body["bodyPos"] = a.get("pos", Vector2.ZERO)
		var path: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
		if path.size() == 0:
			continue
		# 2.5D moveSpeed 的次序固定为 **拖尸 > 加速 > 基础**：
		# 拖着尸体还提速 50% 会毁掉藏尸的紧张感（SKSanity.RUSH 注释原文）。
		var mul := 1.0
		if int(a.get("drag", -1)) < 0 and float(a.get("rushT", 0.0)) > 0.0 \
				and bool(a.get("alien", false)):
			mul = float((cfg.get("rules", {}) as Dictionary).get("RUSH", {}).get("mul", 1.5))
		var remain := (drag_speed if int(a.get("drag", -1)) >= 0 else speed * mul) * dt
		var pi := int(a.get("pathI", 0))
		var pos: Vector2 = a.get("pos", Vector2.ZERO)
		while remain > 0.0 and pi < path.size():
			var tgt: Vector2 = path[pi]
			var d := pos.distance_to(tgt)
			if d <= remain:
				pos = tgt
				pi += 1
				remain -= d
			else:
				pos += (tgt - pos).normalized() * remain
				remain = 0.0
		a["pos"] = pos
		a["pathI"] = pi
		if pi >= path.size():
			a["path"] = PackedVector2Array()
			a["pathI"] = 0
			a["moving"] = false


## 给 agent 规划一条路径；返回是否有路可走。清掉当前站桩（移动即打断）。
func set_path(agent_i: int, target: Vector2) -> bool:
	var a := agent(agent_i)
	if a.is_empty() or nav == null:
		return false
	a["doing"] = 0.0
	a["_doing"] = ""
	a["taskPt"] = -1
	var pts: PackedVector2Array = nav.path(a.get("pos", Vector2.ZERO), target)
	if pts.size() == 0:
		return false
	a["path"] = pts
	a["pathI"] = 0
	a["moving"] = true
	return true


## 开始站桩；kind = task / claim / supply。point_i 只对 task 有意义。
func start_doing(agent_i: int, kind: String, dur: float, point_i: int = -1, item: String = "") -> void:
	var a := agent(agent_i)
	if a.is_empty() or dur <= 0.0:
		return
	a["path"] = PackedVector2Array()
	a["pathI"] = 0
	a["moving"] = false
	a["doing"] = dur
	a["_dur"] = dur
	a["_doing"] = kind
	a["taskPt"] = point_i
	a["_item"] = item


func _finish_doing(a: Dictionary) -> void:
	var kind := String(a.get("_doing", ""))
	var ai := int(a.get("i", -1))
	if kind == "task":
		complete_task(ai, int(a.get("taskPt", -1)))
	elif kind == "claim":
		claim_qual(ai)
	elif kind == "supply":
		exchange_supply(String(a.get("_item", "")), ai)
	elif kind == "sabotage":
		sabotage_room(String(a.get("_item", "")), ai)
	elif kind == "fix":
		fix_damage(String(a.get("_item", "")), ai)
	a["_doing"] = ""
	a["_item"] = ""
	a["taskPt"] = -1
	a["_aiT"] = 0.25


func distance_to(agent_i: int, target: Vector2) -> float:
	var a := agent(agent_i)
	if a.is_empty():
		return 9999.0
	return (a.get("pos", Vector2.ZERO) as Vector2).distance_to(target)


## 圆桌领申请单的站位：圆桌下沿外 1.2 格（与 2.5D roundTableClaimSpot 同口径）。
func claim_spot() -> Vector2:
	for c: Dictionary in (map.get("cover", []) as Array):
		if String(c.get("label", "")) == "圆桌":
			return Vector2(float(c.get("x", 0)) + float(c.get("w", 0)) * 0.5,
				float(c.get("y", 0)) + float(c.get("h", 0)) + 1.2)
	var r: Dictionary = rooms_by_id.get("bridge", {}) as Dictionary
	var lab: Array = r.get("label", [31.0, 33.5]) as Array
	return Vector2(float(lab[0]), float(lab[1]))


## 补给点坐标：军械 ammo / 医疗 medkit。
func supply_spot(item: String) -> Vector2:
	for f: Dictionary in (map.get("facility", []) as Array):
		if String(f.get("kind", "")) != "supply":
			continue
		if String(f.get("item", "")) == item:
			return Vector2(float(f.get("x", 0)), float(f.get("y", 0)))
	return claim_spot()


func _dawn() -> void:
	# 2.5D dawn()：濒死失血死亡 → 清故障（不扣分）→ 全员回会议室 → 开白天全员会议。
	# 下一夜（start_night）在白天会议**结束**时由 _after_meeting(MEET_DAY) 触发，
	# 与 2.5D finishMeeting 的 kind==='day' → startNight(true) 一致。
	# ⚠ 不能在这里直接 _start_night：那是把"开会"和"进夜"并行，夜数会双计。
	dawn()
	if over:
		return
	if meeting.is_empty():
		# 白天会议没开成（理论上只有 meeting 已被占用时）：直接进下一夜，避免 t=0 卡死。
		_start_night(true)


## 进入一个夜晚（2.5D startNight 的等价物）。
## inc=false 用于开局：pre 会结束后直接开第 1 夜，夜数不额外 +1。
func _start_night(inc: bool) -> void:
	if inc:
		night += 1
	night_meets = 0
	if speech_enabled and mind != null:
		mind.reset_night()
	t = night_len()
	_log("night_start", {"night": night})
	# 2.5D：天亮给每只异形补 1 把刀（不是时间冷却，是每夜额度）
	for a: Dictionary in agents:
		if bool(a.get("alive", false)):
			a["knife"] = 1
	check_terminator()
	_log("dawn", {"night": night, "prog": prog})
	check_win()


## 胜负口径与 2.5D checkWin 逐条一致：先看维修分，再看异形是否出局，最后看人类是否全灭。
func check_win() -> bool:
	if over:
		return over_win
	var humans := 0
	var aliens := 0
	for a: Dictionary in agents:
		if not bool(a.get("alive", false)):
			continue
		if bool(a.get("alien", false)):
			aliens += 1
		else:
			humans += 1
	if prog >= win_pts():
		_end(true, "维修 %d 分达成" % win_pts())
	elif aliens == 0:
		_end(true, "异形全部出局")
	elif humans == 0:
		_end(false, "人类全灭")
	return over_win


## 只给门禁 / 后续战斗结算用：把一个角色标记为死亡（B1 还没有战斗入口）。
func kill(agent_i: int, cause: String, by: int = -1) -> bool:
	var a := agent(agent_i)
	if a.is_empty() or not bool(a.get("alive", false)):
		return false
	a["alive"] = false
	a["downed"] = false
	a["deathCause"] = cause
	a["killedBy"] = by
	_log("kill", {"actor": agent_i, "cause": cause, "by": by})
	check_win()
	return true


## 出刀：先把人放倒（12 秒流血窗口），已倒地的直接死。
func knife(killer_i: int, victim_i: int) -> bool:
	var k := agent(killer_i)
	var v := agent(victim_i)
	if k.is_empty() or v.is_empty():
		return false
	if not bool(k.get("alive", false)) or bool(k.get("downed", false)):
		return false
	if not bool(v.get("alive", false)) or bool(v.get("alien", false)):
		return false
	# 2.5D 真源是「每夜 1 把刀 + RUSH 逃逸 + 目标承诺 + 管道突袭 + 异形开枪」的
	# 组合，实测每夜约 1.93 刀。3D 异形只迁了贴脸出刀，进攻链补齐前不启用
	# 每夜额度（只搬限制不搬能力会 0 胜）；出手频率由 KNIFE 理智线控制。
	# 这是 port-manifest 里标注的 partial，不是新增规则。
	k["knifeUsed"] = int(k.get("knifeUsed", 0)) + 1
	if bool(v.get("downed", false)):
		return die(v)
	v["downed"] = true
	v["downedT"] = 12.0
	v["downedBy"] = killer_i
	v["medTried"] = false
	v["bodyPos"] = v.get("pos", Vector2.ZERO)
	v["deathCause"] = "knife"
	v["killedBy"] = killer_i
	# 目击者：7m 内、真实视线不被墙/掩体挡住的人记一笔"我看见他动手"。
	# 这是 B3 的最小理智线；B5 再换成完整的 sus/mind。
	_witness_action(k, "saw_knife", v.get("pos", Vector2.ZERO))
	# 刀者红身（2.5D RED_BODY.dur=1.5）：刚出刀的人身上带红光，
	# 1.5 秒内被看见 → saw_red（EV_W 最高权重 0.85）。
	k["redT"] = float((cfg.get("rules", {}) as Dictionary).get("RED_BODY", {}).get("dur", 1.5))
	_witness_action(k, "saw_red", k.get("pos", Vector2.ZERO))
	_log("knife", {"actor": killer_i, "victim": victim_i, "cause": "knife"})
	# RUSH 逃逸加速：绑"放倒"不绑致死（2.5D killRushStart，只给异形）
	_kill_rush_start(k)
	if bots != null:
		bots.on_crime(killer_i, k.get("pos", Vector2.ZERO))
	return true


## 击杀加速的唯一授予入口（2.5D killRushStart，js/game.js:767）：
## 只由"把人放倒"的结算调用（knife / shoot）；绑放倒不绑致死 ——
## 刀枪都只把人打成濒死，真死常在天亮失血/驱逐，绑致死等于没有这个机制。
## 绝不从红身推导：红身是目击证据，rushT 是体力状态，时长相等只是巧合。
func _kill_rush_start(a: Dictionary) -> void:
	if a.is_empty() or not bool(a.get("alive", false)):
		return
	var R: Dictionary = (cfg.get("rules", {}) as Dictionary).get("RUSH", {}) as Dictionary
	if bool(R.get("alienOnly", true)) and not bool(a.get("alien", false)):
		return
	a["rushT"] = float(R.get("dur", 2.0))


## 开枪：与出刀同一个结算入口（放倒 12 秒 → 流血死），只是消耗子弹、射程 9 格。
## 2.5D 的 SHOT.range = 9；这里只做「命中/未命中」两态，不做弹道散布。
func shoot(shooter_i: int, target_i: int) -> bool:
	var k := agent(shooter_i)
	var v := agent(target_i)
	if k.is_empty() or v.is_empty():
		return false
	if not bool(k.get("alive", false)) or bool(k.get("downed", false)) or bool(k.get("detained", false)):
		return false
	if not bool(v.get("alive", false)) or bool(v.get("downed", false)):
		return false
	if int(k.get("bullet", 0)) <= 0:
		return false
	var kp: Vector2 = k.get("pos", Vector2.ZERO)
	var vp: Vector2 = v.get("pos", Vector2.ZERO)
	if kp.distance_to(vp) > SpaceData.num(space, "shoot", "range"):
		return false
	if nav != null and not nav.los(kp, vp):
		return false
	k["bullet"] = int(k.get("bullet", 0)) - 1
	v["downed"] = true
	v["downedT"] = 12.0
	v["downedBy"] = shooter_i
	v["medTried"] = false
	v["bodyPos"] = vp
	v["deathCause"] = "shot"
	v["killedBy"] = shooter_i
	# 2.5D fireShot：目击者按 noticeAction(7 格) 记 **saw_shot**（目击证据 0.55），
	# 不是听来的传闻；枪声另走 aiHear(20 格) 的 heard 通道（权重 0.16）。
	_witness_action(k, "saw_shot", vp)
	# 开枪者红身：与出刀同一个 RED_BODY 窗口
	k["redT"] = float((cfg.get("rules", {}) as Dictionary).get("RED_BODY", {}).get("dur", 1.5))
	_witness_action(k, "saw_red", kp)
	_log("shoot", {"actor": shooter_i, "victim": target_i})
	# RUSH：开枪放倒人同样给异形加速（2.5D fireShot 里的 killRushStart）
	_kill_rush_start(k)
	if bots != null:
		bots.on_crime(shooter_i, kp)
	return true


## 医疗无人机把人救起：取消流血倒计时，保留"这一局被救过一次"的标记
## （同一轮里不重复救同一个人，避免无人机贴着人反复刷次数）。
func revive(agent_i: int) -> bool:
	var a := agent(agent_i)
	if a.is_empty() or not bool(a.get("alive", false)) or not bool(a.get("downed", false)):
		return false
	a["downed"] = false
	a["downedT"] = 0.0
	a["deathCause"] = ""
	a["medTried"] = true
	_log("revive", {"actor": agent_i})
	return true


func die(v: Dictionary) -> bool:
	if v.is_empty() or not bool(v.get("alive", false)):
		return false
	v["alive"] = false
	v["downed"] = false
	v["deathAt"] = elapsed
	v["bodyPos"] = v.get("pos", Vector2.ZERO)
	if String(v.get("deathCause", "")) == "":
		v["deathCause"] = "bleed"
	_log("kill", {"actor": int(v.get("i", -1)), "cause": String(v.get("deathCause", "")),
		"by": int(v.get("killedBy", -1))})
	check_win()
	return true


## 批量模拟遥测计数（2.5D G.simStats 的等价物）：只计数，不参与判定。
func _stat(key: String, n: int = 1) -> void:
	stats[key] = int(stats.get(key, 0)) + n


func _stat_by(group: String, key: String, n: int = 1) -> void:
	var g: Dictionary = stats.get(group, {}) as Dictionary
	g[key] = int(g.get(key, 0)) + n
	stats[group] = g


## 可见半径（2.5D sightRangeAt，js/game.js:3095 的同源口径）：
##   · 亮舱室 → 房间最长边 × SIGHT.litRoomMul（整间可见）
##   · 亮走廊 → SIGHT.corrR（整条可见）
##   · 暗舱室 / 断电 → SIGHT.humanDarkR（近身圆）
## 3D 用 power_on 近似 2.5D 的 lightState（常态 / 断电两态）。
func sight_range_at(p: Vector2) -> float:
	var S: Dictionary = (cfg.get("rules", {}) as Dictionary).get("SIGHT", {}) as Dictionary
	var dark_r := float(S.get("humanDarkR", 2.3))
	if not power_on:
		return dark_r
	var rid := room_at(p)
	if rid == "":
		return float(S.get("corrR", 12.0))
	var r: Dictionary = rooms_by_id.get(rid, {}) as Dictionary
	if String(r.get("light", "")) == "bright":
		var rect: Array = r.get("rect", []) as Array
		if rect.size() >= 4:
			return maxf(float(rect[2]), float(rect[3])) * float(S.get("litRoomMul", 1.15))
	return dark_r


## 目击通知（2.5D noticeAction 的最小实现）：
## kind 属于异形专属行为（ID_EVIDENCE）→ 亲眼者写确证；否则只按 EV_W 加嫌疑。
func _witness_action(actor: Dictionary, kind: String, at: Vector2) -> void:
	if not speech_enabled or mind == null:
		return
	var ai := int(actor.get("i", -1))
	var sight_r: float = SpaceData.num(space, "sight", "human_light_r")
	for w: Dictionary in agents:
		if int(w.get("i", -1)) == ai or bool(w.get("alien", false)):
			continue
		if not bool(w.get("alive", false)) or bool(w.get("downed", false)):
			continue
		# 2.5D watchersAt / A 批：站桩做事的人注意力不在线，不计入目击者
		if float(w.get("doing", 0.0)) > 0.0:
			continue
		var wp: Vector2 = w.get("pos", Vector2.ZERO)
		if wp.distance_to(at) > sight_r:
			continue
		if nav != null and not nav.los(wp, at):
			continue
		mind.note_sight(int(w.get("i", -1)), ai, kind, at)


## 红身 / seenBy 追踪（2.5D trackNight 的节流版）：每 0.5 秒一次，
## 记录"谁刚看见过谁"（HUNT 记忆与 audSusEstimate 的原料），
## 并给红身窗口内被看见的刀者补 saw_red。
func _track_pass() -> void:
	if not speech_enabled or mind == null:
		return
	var sight_r: float = SpaceData.num(space, "sight", "human_light_r")
	var now := elapsed
	for a: Dictionary in agents:
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		var ai := int(a.get("i", -1))
		for w: Dictionary in agents:
			if w == a:
				continue
			if not bool(w.get("alive", false)) or bool(w.get("downed", false)):
				continue
			var wp: Vector2 = w.get("pos", Vector2.ZERO)
			var d := wp.distance_to(ap)
			if d > sight_r:
				continue
			if nav != null and not nav.los(wp, ap):
				continue
			# seenBy：w 看见了 a（供 audSusEstimate / HUNT 记忆用）
			var sb: Dictionary = (w.get("seenBy", {}) as Dictionary).duplicate()
			sb[ai] = {"t": now}
			w["seenBy"] = sb
			# 红身目击：刚出刀的人被看见
			if float(a.get("redT", 0.0)) > 0.0 and not bool(w.get("alien", false)):
				mind.note_sight(int(w.get("i", -1)), ai, "saw_red", ap)


## 破坏：登记一处 30 秒故障；到点未修则全船进度 -faultPenalty。
## 搜尸：把死者身上的子弹 / 医疗包 / 申请单转给搜的人，一具尸体只搜一次。
## 对应 2.5D `lootBody`（js/game.js），口径是"只转移、不凭空生成"。
func search_body(body_i: int, by: int) -> bool:
	var b := agent(body_i)
	var a := agent(by)
	if b.is_empty() or a.is_empty():
		return false
	if bool(b.get("alive", false)) or bool(b.get("bodyGone", false)) \
			or bool(b.get("searched", false)):
		return false
	b["searched"] = true
	var got: Array = []
	for k in ["bullet", "medkit", "qual"]:
		var n := int(b.get(k, 0))
		if n > 0:
			a[k] = int(a.get(k, 0)) + n
			b[k] = 0
			got.append("%s×%d" % [String(k), n])
	_log("search", {"actor": by, "victim": body_i, "got": ", ".join(got)})
	return true


func sabotage_room(room_id: String, by: int) -> bool:
	if room_id == "" or room_id == "bridge":
		return false
	for d: Dictionary in dmg:
		if String(d.get("room", "")) == room_id:
			return false
	var px := 0.0
	var py := 0.0
	for p: Dictionary in points:
		if String(p.get("room", "")) == room_id:
			px = float(p.get("x", 0.0))
			py = float(p.get("y", 0.0))
			break
	dmg.append({"room": room_id, "by": by, "left": 30.0, "x": px, "y": py})
	_log("sabotage", {"actor": by, "room": room_id})
	return true


func fix_damage(room_id: String, by: int = -1) -> bool:
	for i in range(dmg.size() - 1, -1, -1):
		var d: Dictionary = dmg[i]
		if String(d.get("room", "")) == room_id:
			dmg.remove_at(i)
			_log("fix", {"room": room_id, "ok": true})
			# 2.5D credBroadcast：修好故障是"最像人"的动作 —— 目击者给**修的人**加信誉，
			# 异形目击者加等值敌对分（一体两面）。
			if speech_enabled and mind != null and by >= 0:
				var bp: Vector2 = agent(by).get("pos", Vector2.ZERO)
				mind.cred_broadcast(by, "fixDone", bp)
			return true
	return false


func _tick_dmg(dt: float) -> void:
	for i in range(dmg.size() - 1, -1, -1):
		var d: Dictionary = dmg[i]
		d["left"] = float(d.get("left", 0.0)) - dt
		if float(d.get("left", 0.0)) <= 0.0:
			prog = maxi(0, prog - int((cfg.get("win", {}) as Dictionary).get("fault_penalty", 5)))
			_log("fix", {"room": String(d.get("room", "")), "ok": false, "prog": prog})
			dmg.remove_at(i)


## 会议种类（2.5D openMeeting 的 kind）：
##   pre  = 开局公开讨论（discussPre 50 秒，**本轮不投票**）
##   day  = 天亮后的全员会议（discussDay 60 秒 + voteDay 5 秒）
##   night= 夜晚报告尸体触发的紧急会议（discussNight 35 秒 + voteNight 5 秒）
## 2.5D 每局有 1 场 pre + 每夜 1 场 day + 至多 2 场 night；
## 3D 之前只有 night，导致场均会议 3.0 场 vs 2.5D 9.64 场、驱逐 2.48 vs 4.64。
const MEET_PRE := "pre"
const MEET_DAY := "day"
const MEET_NIGHT := "night"


## 报告尸体 → 静默投票（无发言）：5 秒后按票数驱逐，公布身份。
func body_near(pos: Vector2, radius: float) -> Dictionary:
	for a: Dictionary in agents:
		if bool(a.get("alive", false)):
			continue
		if bool(a.get("bodyGone", false)) or bool(a.get("bodyReported", false)):
			continue
		if (a.get("bodyPos", Vector2.ZERO) as Vector2).distance_to(pos) <= radius:
			return a
	return {}


## 开一场会议。kind ∈ {pre, day, night}。
## 2.5D openMeeting 的等价实现：讨论秒数 / 投票秒数全部读 sim.json#rules.MEET，
## GDScript 里不写死秒数。pre 会**不投票**（vote_sec = 0）。
func open_meeting_kind(kind: String, reporter_i: int, victim_i: int) -> bool:
	if over or not meeting.is_empty():
		return false
	var meet_cfg: Dictionary = (cfg.get("rules", {}) as Dictionary).get("MEET", {}) as Dictionary
	if kind == MEET_NIGHT:
		var cap := int(meet_cfg.get("perNight", 2))
		if night_meets >= cap:
			return false
		var reporter := agent(reporter_i)
		# 2.5D 口径：报告是有限资源（每人全局 2 次），玩家与 AI 同一额度。
		if not reporter.is_empty() and int(reporter.get("reportLeft", 0)) <= 0:
			return false
		night_meets += 1
		if not reporter.is_empty():
			reporter["reportLeft"] = int(reporter.get("reportLeft", 0)) - 1
	var v := agent(victim_i)
	if kind == MEET_NIGHT and v.is_empty():
		return false
	# 会议**不打断任务流程**（2.5D 2026-11-02 裁定）：清掉所有人的移动路径，
	# 但保留 doing / _doing / _dur —— 否则会后玩家被判成"移动打断了维修"。
	for a: Dictionary in agents:
		a["path"] = PackedVector2Array()
		a["pathI"] = 0
		a["moving"] = false
	if kind == MEET_NIGHT and not v.is_empty():
		v["bodyReported"] = true
		v["bodyGone"] = true
	var discuss_sec := 0.0
	var vote_sec := 0.0
	match kind:
		MEET_DAY:
			discuss_sec = float(meet_cfg.get("discussDay", 60.0))
			vote_sec = float(meet_cfg.get("voteDay", 5.0))
		MEET_PRE:
			discuss_sec = float(meet_cfg.get("discussPre", 50.0))
			vote_sec = 0.0
		_:
			discuss_sec = float(meet_cfg.get("discussNight", 35.0))
			vote_sec = float(meet_cfg.get("voteNight", 5.0))
	var reveal_sec := float(meet_cfg.get("reveal", 3.0))
	meeting = {
		"kind": kind, "phase": "discuss", "t": discuss_sec,
		"vote_sec": vote_sec, "reveal_sec": reveal_sec,
		"reporter": reporter_i, "victim": victim_i, "votes": {}, "result": {},
		"discuss_sec": discuss_sec,
	}
	_log("meeting", {"mkind": kind, "reporter": reporter_i, "victim": victim_i})
	if kind == MEET_NIGHT:
		_log("report", {"actor": reporter_i, "victim": victim_i})
	if speech_enabled and speech != null:
		speech.on_meeting_open(reporter_i, victim_i, kind)
	return true


## 夜晚会议入口（保留旧签名，供 main.gd 与 ai_human.gd 调用）。
func open_meeting(reporter_i: int, victim_i: int) -> bool:
	return open_meeting_kind(MEET_NIGHT, reporter_i, victim_i)


## 白天会议：2.5D dawn() 的等价物。
## 口径（2.5D js/game.js:4450-4465，用户 2026-11-02 裁定）：
##   · 全员被刷新到中央会议室；
##   · 打断此前的一切任务流程（清路径 / 站桩进度 / 动作 / 拖拽）；
##   · 夜晚故障随夜结束消失，**不扣分**（只罚"夜里超时"）。
func dawn() -> void:
	# 濒死者天亮失血死亡（2.5D dawn 第一行）。
	for a: Dictionary in agents:
		if bool(a.get("alive", false)) and bool(a.get("downed", false)):
			die(a)
	# 天亮：没修完的故障随夜结束一起消失，不扣分。
	dmg = []
	# 白天会议要回会议室：全员刷新到中央会议室，打断此前的一切任务流程。
	var bridge: Dictionary = rooms_by_id.get("bridge", {}) as Dictionary
	if not bridge.is_empty():
		for a2: Dictionary in agents:
			if not bool(a2.get("alive", false)):
				continue
			a2["pos"] = nav.nearest_free(_rand_in_bridge())
			a2["path"] = PackedVector2Array()
			a2["pathI"] = 0
			a2["moving"] = false
			a2["doing"] = 0.0
			a2["_doing"] = ""
			a2["drag"] = -1
	# 开白天全员会议。
	open_meeting_kind(MEET_DAY, -1, -1)


## 在 bridge 房间里随机取一个可行走点（2.5D randIn(br) 的等价物）。
func _rand_in_bridge() -> Vector2:
	var bridge: Dictionary = rooms_by_id.get("bridge", {}) as Dictionary
	var poly: Array = bridge.get("poly", []) as Array
	for _k in 200:
		if poly.is_empty():
			break
		var p: Array = poly[_rng.randi_range(0, poly.size() - 1)]
		var pos := Vector2(float(p[0]), float(p[1]))
		if nav != null and nav.is_free(pos):
			return pos
	var lab: Array = bridge.get("label", [31.0, 33.5]) as Array
	return Vector2(float(lab[0]), float(lab[1]))


## 玩家（或旁观快进）可以提前结束讨论，讨论秒数仍取自真源，不写死。
func skip_discussion() -> bool:
	if meeting.is_empty() or String(meeting.get("phase", "")) != "discuss":
		return false
	meeting["t"] = 0.0
	return true


func cast_vote(voter_i: int, target_i: int) -> void:
	if meeting.is_empty() or String(meeting.get("phase", "")) != "vote":
		return
	var v := agent(voter_i)
	if v.is_empty() or not bool(v.get("alive", false)) or bool(v.get("downed", false)):
		return
	var votes: Dictionary = meeting.get("votes", {})
	var tgt := target_i
	if tgt >= 0:
		var t := agent(tgt)
		if t.is_empty() or not bool(t.get("alive", false)):
			tgt = -1
	votes[voter_i] = tgt
	var changed := votes.has(voter_i)
	meeting["votes"] = votes
	if changed:
		_log("vote_change", {"actor": voter_i, "target": tgt})
	else:
		_log("vote", {"actor": voter_i, "target": tgt})


## 本场会议里该角色公开点过名的目标（2.5D：「说了却不投等于打自己脸」）。
## 只读 chat 事件的 cat/target/actor，不读阵营表。
func rule_f(sec: String, key: String) -> float:
	return rules.n(sec, key, 0.0) if rules != null else 0.0


func _public_accuse_target(a: Dictionary) -> int:
	var who := int(a.get("i", -1))
	for k in range(events.size() - 1, maxi(-1, events.size() - 60), -1):
		var e: Dictionary = events[k]
		# 2.5D 事件信封允许 actor/victim 为 null，GDScript 的 int(null) 会直接报错
		var av: Variant = e.get("actor", -1)
		if not (av is int) or int(av) != who:
			continue
		var cat := String(e.get("cat", ""))
		if cat == "accuse" or cat == "known_accuse_hard" or cat == "almost" \
				or cat == "evidence" or cat == "confront":
			var tv: Variant = e.get("target", -1)
			if tv is int and int(tv) >= 0:
				return int(tv)
	return -1


func _ai_vote_target(a: Dictionary) -> int:
	var pool: Array = []
	for t: Dictionary in agents:
		if int(t.get("i", -1)) == int(a.get("i", -1)):
			continue
		if not bool(t.get("alive", false)) or bool(t.get("downed", false)):
			continue
		if bool(a.get("alien", false)) and bool(t.get("alien", false)):
			continue
		pool.append(int(t.get("i", -1)))
	if pool.is_empty():
		return -1
	if bool(a.get("alien", false)):
		return int(pool[_rng.randi_range(0, pool.size() - 1)])
	# S 轨起：票是「综合嫌疑 + 听来的证词 − 关系/信任护盾」算出来的，
	# 不再是"目击计数 / 纯随机"。异形仍然乱投人类带节奏。
	if speech_enabled and mind != null:
		# 2.5D 口径：确证（亲眼见过异形专属行为）优先，不看假说权重。
		var known: Dictionary = a.get("known", {}) as Dictionary
		for k: int in known.keys():
			var kt := agent(int(k))
			if not kt.is_empty() and bool(kt.get("alive", false)) and pool.has(int(k)):
				return int(k)
		# 2.5D 票权层级：确证 → 准-确证 / 公开指认 → 明确 suspect → 假说竞争弃权。
		var am: Dictionary = mind.best_almost_target(a)
		if not am.is_empty() and pool.has(int(am.get("i", -1))):
			return int(am.get("i", -1))
		var pub_target := int(a.get("accuse", -1))
		if pub_target < 0:
			pub_target = _public_accuse_target(a)
		if pub_target >= 0 and pool.has(pub_target):
			return pub_target
		# 2.5D bestSusTarget：综合嫌疑（a.sus），不再读 3D 自造的 suspect 计数字典
		var bs: Dictionary = mind.best_sus_target(a, rule_f("ALMOST", "foeSus"))
		if not bs.is_empty() and pool.has(int(bs.get("i", -1))):
			return int(bs.get("i", -1))
		var scores: Array = []
		for i: int in pool:
			scores.append({"i": i, "s": mind.vote_score(a, i)})
		scores.sort_custom(func(x, y): return float(x["s"]) > float(y["s"]))
		var top_s := float(scores[0]["s"])
		var second_s := -1.0e9
		if scores.size() > 1:
			second_s = float(scores[1]["s"])
		# 2.5D SKT2AI.hypothesisSpread：两条假说权重接近 + 双方都有独立实证 → 弃权
		var spread: Dictionary = mind.hypothesis_spread(a)
		if bool(spread.get("competing", false)):
			return -1
		return int(scores[0]["i"])
	var sus: Dictionary = a.get("suspect", {})
	var best2 := -1
	var bs2 := 0
	for k: int in sus.keys():
		var t := agent(int(k))
		if t.is_empty() or not bool(t.get("alive", false)):
			continue
		if int(sus[k]) > bs2:
			bs2 = int(sus[k])
			best2 = int(k)
	if best2 >= 0:
		return best2
	return int(pool[_rng.randi_range(0, pool.size() - 1)])


## 2.5D 投票是"讨论期陆续投 + 跟票"，3D 在进 vote 相位时一次结算。
## 分两轮：先各自独立形成意向，再让无主张者按 WARM.followChance 跟领先者、
## 异形按 SOCIAL.pileOn 顺势踩一脚，最后才真正落票。这样票能形成 4 票集中，
## 同时保留"跟错票"造成的误逐（2.5D 误逐率约 20%，是平衡阀之一）。
func _cast_ai_votes() -> void:
	var intents: Dictionary = {}
	var tally: Dictionary = {}
	for a: Dictionary in agents:
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		if int(a.get("i", -1)) == me_idx and not spectator:
			continue
		var v := _ai_vote_target(a)
		intents[int(a.get("i", -1))] = v
		if v >= 0 and not bool(a.get("alien", false)):
			tally[v] = int(tally.get(v, 0)) + 1
	var lead := -1
	var lead_n := 0
	for k: int in tally.keys():
		if int(tally[k]) > lead_n:
			lead_n = int(tally[k])
			lead = int(k)
	var wc: Dictionary = (lines_data.data.get("rules", {}) as Dictionary).get("WARM", {}) as Dictionary
	var sc: Dictionary = (lines_data.data.get("rules", {}) as Dictionary).get("SOCIAL", {}) as Dictionary
	var follow_p := float(wc.get("followChance", 0.45))
	var pile_p := float(sc.get("pileOn", 0.4))
	for k2: int in intents.keys():
		var v2 := int(intents[k2])
		var voter := agent(k2)
		if bool(voter.get("alien", false)):
			if lead >= 0 and lead_n >= 1 and _rng.randf() < pile_p:
				v2 = lead
		elif v2 < 0 and lead >= 0 and lead_n >= 1 and _rng.randf() < follow_p:
			v2 = lead
		cast_vote(k2, v2)


func _tick_meeting(dt: float) -> void:
	if String(meeting.get("phase", "")) == "discuss" and speech_enabled and speech != null:
		speech.tick(dt)
	meeting["t"] = float(meeting.get("t", 0.0)) - dt
	if float(meeting.get("t", 0.0)) > 0.0:
		return
	var phase := String(meeting.get("phase", ""))
	var kind := String(meeting.get("kind", MEET_NIGHT))
	if phase == "discuss":
		_log("meeting_overtime", {"left": 0})
		# pre 会**不投票**（2.5D voteT=0 → 直接 finishMeeting）。
		if float(meeting.get("vote_sec", 0.0)) <= 0.0:
			meeting = {}
			_after_meeting(kind)
			return
		# 讨论结束才开票：AI 在开场投票会造成"还没讨论就已经投完"的假象
		meeting["phase"] = "vote"
		meeting["t"] = float(meeting.get("vote_sec", 5.0))
		# 玩家在讨论期说"我投 X"只是意向，进投票相位时自动落票
		if meeting.has("player_intent"):
			cast_vote(me_idx, int(meeting.get("player_intent", -1)))
		_cast_ai_votes()
	elif phase == "vote":
		_close_meeting()
		if meeting.is_empty():
			return
	else:
		meeting = {}
		_after_meeting(kind)
		check_win()


## 会议结束后的分流（2.5D finishMeeting 的等价物）：
##   pre  → 开第 1 夜（夜数不 +1）
##   day  → 开下一夜（夜数 +1）
##   night→ 回到夜晚剩余时间继续（会议期间夜晚时钟暂停）
func _after_meeting(kind: String) -> void:
	match kind:
		MEET_PRE:
			_start_night(false)
		MEET_DAY:
			_start_night(true)
		_:
			# night 会：夜晚时钟本就暂停（MEET.pauseClock），t 不变，直接继续。
			pass
	check_win()


func _close_meeting() -> void:
	var votes: Dictionary = meeting.get("votes", {})
	var tally: Dictionary = {}
	for k: int in votes.keys():
		var tgt := int(votes[k])
		if tgt < 0:
			continue
		tally[tgt] = int(tally.get(tgt, 0)) + 1
	var top := -1
	var tn := 0
	var tie := false
	for k: int in tally.keys():
		var c := int(tally[k])
		if c > tn:
			tn = c
			top = int(k)
			tie = false
		elif c == tn:
			tie = true
	# 2.5D 判定：唯一最高票 且 达到 VOTE.need / lateNeed（按可投票人数切换）才驱逐。
	# 3D 之前是"简单多数 + 平票随机挑一个"，导致每会必逐、异形撑不到第 4 夜。
	var vcfg: Dictionary = (cfg.get("rules", {}) as Dictionary).get("VOTE", {}) as Dictionary
	var voters := 0
	for a: Dictionary in agents:
		if bool(a.get("alive", false)) and not bool(a.get("downed", false)):
			voters += 1
	var need := int(vcfg.get("need", 4))
	if voters <= int(vcfg.get("lateAt", 7)):
		need = int(vcfg.get("lateNeed", 3))
	var ejected_ok: bool = top >= 0 and tn >= need and not tie
	if ejected_ok:
		var t := agent(top)
		if not t.is_empty():
			t["alive"] = false
			t["downed"] = false
			t["deathCause"] = "vote"
			t["bodyGone"] = true
			_log("eject", {"actor": top, "alien": bool(t.get("alien", false)),
				"votes": int(tally.get(top, 0))})
			# 追责：结果公布后清算带节奏的人（必须在身份已定之后）
			# 2.5D settleAccountability（js/game.js:1529）。
			if speech_enabled and mind != null:
				var lead := int(meeting.get("lead", -1))
				mind.settle_accountability(top, votes, lead)
	var matrix: Dictionary = (meeting.get("votes", {}) as Dictionary).duplicate()
	meeting["result"] = {
		"ejected": (top if ejected_ok else -1),
		"name": (agent(top).get("name", "") if ejected_ok else ""),
		"alien": (bool(agent(top).get("alien", false)) if ejected_ok else false),
		"votes": tally.duplicate(), "matrix": matrix,
		"need": need, "max": tn, "tie": tie, "voters": voters,
	}
	meeting["phase"] = "result"
	meeting["t"] = float(meeting.get("reveal_sec", 3.0))
	check_win()
	if over:
		# 胜负已定：不让 3 秒身份公布把结算面板卡在后面
		meeting = {}


## ---- B6′：拖尸 / 藏尸 / 收尸 ----
## 对应 2.5D `js/game.js` 2421 / 2445 / 3044 的 drag_start / drag_end / drag_away。
## 拖动期间速度降到 move.drag_speed，尸体位置跟着人走；放下时按落点结算。
func start_drag(agent_i: int, body_i: int) -> bool:
	var a := agent(agent_i)
	var b := agent(body_i)
	if a.is_empty() or b.is_empty():
		return false
	if not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
			or bool(a.get("detained", false)):
		return false
	if bool(b.get("alive", false)) or bool(b.get("bodyGone", false)) \
			or bool(b.get("bodyReported", false)):
		return false
	if int(a.get("drag", -1)) >= 0:
		return false
	# 一具尸体只能被一个人拖
	for x: Dictionary in agents:
		if int(x.get("drag", -1)) == body_i:
			return false
	a["drag"] = body_i
	a["path"] = PackedVector2Array()
	_log("drag_start", {"actor": agent_i, "victim": body_i, "downed": bool(b.get("downed", false))})
	return true


func release_drag(agent_i: int) -> bool:
	var a := agent(agent_i)
	if a.is_empty() or int(a.get("drag", -1)) < 0:
		return false
	var body_i := int(a.get("drag", -1))
	var b := agent(body_i)
	a["drag"] = -1
	if not b.is_empty():
		var rid: String = room_at(b.get("bodyPos", Vector2.ZERO))
		# 拖到医疗间：濒死者被救起（2.5D dragToMed）
		if rid == "med" and bool(b.get("downed", false)):
			revive(body_i)
			if speech_enabled and mind != null:
				# 2.5D credBroadcast：拖到医疗间是 lr 6 的强信号 —— 目击者加信誉。
				mind.cred_broadcast(agent_i, "dragToMed",
					a.get("pos", Vector2.ZERO))
		elif rid != "" and rid != "bridge":
			# 拖进非公共舱室 = 藏尸，尸体从场上消失
			b["bodyGone"] = true
			b["bodyReported"] = true
			b["hidden"] = true
			_log("drag_away", {"actor": agent_i, "victim": body_i, "room": rid})
	_log("drag_end", {"actor": agent_i, "victim": body_i, "downed": bool(b.get("downed", false))})
	return true


## ---- B6′：机器人 HP 与反制（bot_hit / bot_down）----
func hit_bot(shooter_i: int, kind: String) -> bool:
	var a := agent(shooter_i)
	if a.is_empty() or int(a.get("bullet", 0)) <= 0:
		return false
	if not bot_hp.has(kind) or int(bot_hp.get(kind, 0)) <= 0:
		return false
	var fac := {}
	for f: Dictionary in (map.get("facility", []) as Array):
		if String(f.get("kind", "")) == kind:
			fac = f
			break
	if fac.is_empty():
		return false
	var fp := Vector2(float(fac.get("x", 0)), float(fac.get("y", 0)))
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	if ap.distance_to(fp) > SpaceData.num(space, "shoot", "range"):
		return false
	if nav != null and not nav.los(ap, fp):
		return false
	a["bullet"] = int(a.get("bullet", 0)) - 1
	bot_hp[kind] = int(bot_hp.get(kind, 0)) - 1
	_log("bot_hit", {"actor": shooter_i, "bot": kind, "hp": int(bot_hp.get(kind, 0))})
	if int(bot_hp.get(kind, 0)) <= 0:
		if bots != null:
			bots.kill(kind)
		_log("bot_down", {"actor": shooter_i, "bot": kind})
	if bots != null:
		bots.on_crime(shooter_i, ap)
	return true


## ---- B6′：供电（breaker）----
func toggle_power(by: int) -> bool:
	power_on = not power_on
	if not power_on:
		breaker_pulls += 1
	_log("breaker", {"actor": by, "on": power_on, "pulls": breaker_pulls})
	return true


## ---- B6′：报账（account）----
## 会议开场每个人报自己这一夜做了什么；是 S 轨口供的"账目"入口。
func log_account(agent_i: int) -> void:
	var a := agent(agent_i)
	if a.is_empty():
		return
	_log("account", {"actor": agent_i, "tasks": int(a.get("tIdx", 0)),
		"room": room_at(a.get("pos", Vector2.ZERO))})


## ---- B6′：终结者（第 10 夜全员发 1 发子弹）----
func check_terminator() -> void:
	if terminator_on or int(night) < 10:
		return
	terminator_on = true
	for a: Dictionary in agents:
		if bool(a.get("alive", false)) and not bool(a.get("alien", false)):
			a["bullet"] = int(a.get("bullet", 0)) + 1
	_log("terminator", {"night": int(night), "bullets": 1})


func _end(win: bool, why: String) -> void:
	if over:
		return
	over = true
	over_win = win
	over_why = why
	_log("game_end", {"win": win, "why": why, "prog": prog, "night": night})

## 事件流：只追加，不参与判定。信封与 2.5D logEvent 完全对齐：
##   {kind, night, pt(已过秒), t(本夜剩余秒), actor, victim, room, x, y} + 业务字段。
## 注意 2.5D 的 Object.assign 顺序：data 可以覆盖信封字段（meeting 事件就被 data.kind
## 覆盖成 pre/day/night）。3D 端不要复制这个坑；B5 用 meeting + mkind，diff 时做映射。
func _log(kind: String, data: Dictionary) -> void:
	var e: Dictionary = {
		"kind": kind,
		"night": night,
		"pt": snappedf(elapsed, 0.01),
		"t": snappedf(maxf(0.0, t), 0.1),
		"actor": null,
		"victim": null,
		"room": null,
		"x": null,
		"y": null,
	}
	for k: String in data.keys():
		e[k] = data[k]
	events.append(e)


func _shuffle(arr: Array) -> void:
	for i in range(arr.size() - 1, 0, -1):
		var j := _rng.randi_range(0, i)
		var tmp: Variant = arr[i]
		arr[i] = arr[j]
		arr[j] = tmp


func _read_json(path: String) -> Variant:
	var fh := FileAccess.open(path, FileAccess.READ)
	if fh == null:
		return null
	var text := fh.get_as_text()
	fh.close()
	return JSON.parse_string(text)
