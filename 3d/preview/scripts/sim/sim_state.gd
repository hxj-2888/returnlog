extends RefCounted

## 3D 模拟核心 · 入口与主循环骨架
## ------------------------------------------------------------------
## 分层硬规则（3d/ARCHITECTURE.md §3）：不读节点/输入/鼠标；数值只从 sim.json /
## map_v2.json / rules.json 进；事件流只追加不参与判定；随机只用本文件 rng。
## 会议/投票/终结者见 sim_meeting.gd；船体系统/门/电闸/破坏/拖拽/扫描/幽灵见 sim_systems.gd；
## 战斗/能力/机器人反制/视野/听觉/目击见 sim_combat.gd；尸体链见 body_state.gd。

const SIM_PATH := "res://data/sim.json"
const MAP_PATH := "res://data/map_v2.json"
const GridNavScript := preload("res://scripts/sim/grid_nav.gd")
const AIHumanScript := preload("res://scripts/sim/ai_human.gd")
const AIAlienScript := preload("res://scripts/sim/ai_alien.gd")
const BotsScript := preload("res://scripts/sim/bots.gd")
const LinesDataScript := preload("res://scripts/sim/lines_data.gd")
const RulesDataScript := preload("res://scripts/sim/rules_data.gd")
const BodyStateScript := preload("res://scripts/sim/body_state.gd")
const MindScript := preload("res://scripts/sim/mind.gd")
const SpeechScript := preload("res://scripts/sim/speech.gd")
const InvariantsScript := preload("res://scripts/sim/invariants.gd")
const SimMeetingScript := preload("res://scripts/sim/sim_meeting.gd")
const SimSystemsScript := preload("res://scripts/sim/sim_systems.gd")
const SimCombatScript := preload("res://scripts/sim/sim_combat.gd")
const SpaceData := preload("res://scripts/space_data.gd")

## 复盘 / 证据采样常量，逐字来自真源（@src js/game.js:1400 / js/t2/ai.js:192）。
const EV_CAP := 8000
const FRAME_CAP := 12000
const FRAME_DT := 0.5
const MEM_MAX := 64

## 会议种类（2.5D openMeeting 的 kind）：pre / day / night
const MEET_PRE := "pre"
const MEET_DAY := "day"
const MEET_NIGHT := "night"

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
## 2.5D G.lightState：0 常态 / 1 电路修好全亮 / 2 拉闸断电
var light_state := 0
var breaker_pulls := 0
var _breaker_pos := Vector2.ZERO
var spectator := false
## 2.5D G.dev（调试用无敌 + 全知）；拦截记录只写 dev_log 不进 events。
var dev := false
var dev_log: Array = []
var bot_hp: Dictionary = {"secbot": 2, "medbot": 1}
var terminator_on := false
var reveal_all := false
var supply_cd: Dictionary = {"ammo": 0.0, "med": 0.0}
var room_out: Dictionary = {}

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
var frames: Array = []
var _frame_acc: float = 0.0
var sab_target: Dictionary = {}
var ev_seq: int = 0
var stats: Dictionary = {}
var sim_run := false
var _track_t: float = 0.0
var point_done: Dictionary = {}
var dmg: Array = []
var _sab_spots: Dictionary = {}
var doors: Array = []
var alien_ghost_sab_used := false
var meeting: Dictionary = {}
var meet_seq := 0
var night_meets := 0
var ai_enabled := true

var seed_used := 0
var inv_checks := 0
var inv_fails: Array = []
var inv_last_tag := ""
var _inv_t := 0.0
var _rng := RandomNumberGenerator.new()
var _room_polys: Array = []


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
		_cache_room_polys()
	if points.size() != int((cfg.get("points", {}) as Dictionary).get("count", -1)):
		push_error("sim.json 与 map_v2.json 的任务点数不一致：%d vs %d"
			% [points.size(), int((cfg.get("points", {}) as Dictionary).get("count", -1))])
		return false
	return true


## 开一局。p_map 可由运行中的 map_builder 注入，避免同一份地图在内存里存两份。
func new_game(p_seed: int, p_me: int = 0, p_map: Dictionary = {}, p_space: Dictionary = {},
		p_player_alien: bool = false, p_mode: String = "classic") -> bool:
	map = {}
	points = []
	rooms_by_id = {}
	_room_polys = []
	if not p_map.is_empty():
		map = p_map
		points = map.get("points", []) as Array
		for room: Dictionary in (map.get("rooms", []) as Array):
			rooms_by_id[String(room.get("id", ""))] = room
		_cache_room_polys()
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
	t = 0.0
	elapsed = 0.0
	prog = 0
	over = false
	over_win = false
	over_why = ""
	power_fixed = false
	events = []
	frames = []
	_frame_acc = 0.0
	sab_target = {}
	ev_seq = 0
	point_done = {}
	agents = []
	dmg = []
	meeting = {}
	meet_seq = 0
	night_meets = 0
	power_on = true
	light_state = 0
	breaker_pulls = 0
	bot_hp = {"secbot": 2, "medbot": 1}
	terminator_on = false
	reveal_all = false
	supply_cd = {"ammo": 0.0, "med": 0.0}
	room_out = {}
	alien_ghost_sab_used = false

	var names: Array = cfg.get("names", []) as Array
	var n: int = int((cfg.get("roles", {}) as Dictionary).get("agents", 0))
	if names.size() != n or n != 15:
		push_error("sim.json 名单不是 15 项：names=%d roles.agents=%d" % [names.size(), n])
		return false

	me_idx = clampi(p_me, 0, n - 1)
	var alien_n: int = 3 if p_mode == "trio" else int((cfg.get("roles", {}) as Dictionary).get("aliens", 0))
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
			"stunT": 0.0,
			"sabUsed": false,
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
			"_delay": 2.0 + _rng.randf() * 6.0,
			"_stuckN": 0,
			"deathCause": "",
			"killedBy": -1,
			"deathAt": 0.0,
			"downedT": 0.0,
			"downedBy": -1,
			"downRoom": "",
			"deathRoom": "",
			"suspect": {},
			"bodyReported": false,
			"detained": false,
			"medTried": false,
			"reportLeft": int((cfg.get("rules", {}) as Dictionary).get("MEET", {}).get("reportsPerAgent", 2)),
			"drag": -1,
			"draggedBy": null,
			"aimAng": 0.0,
			"hidden": false,
			"bodyPos": spawn_pos,
			"bodyMoved": false,
		})

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
			if p_mode == "trio" and bool(a.get("alien", false)):
				var mset: Dictionary = a.get("mates", {}) as Dictionary
				for ai: int in aliens.keys():
					if ai != int(a.get("i", -1)):
						mset[ai] = true
				a["mates"] = mset
		speech.roll_leader()

	_ai_human = AIHumanScript.new()
	_ai_human.setup(self, space)
	_ai_alien = AIAlienScript.new()
	_ai_alien.setup(self, space)
	bots = BotsScript.new()
	bots.setup(self, space)
	_build_doors()
	_log("game_start", {"night": 1, "seed": p_seed, "me": me_idx})
	record_frame()
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


## 预缓存各舱室 AABB 与 PackedVector2Array，消除 room_at() 每帧动态分配。
func _cache_room_polys() -> void:
	_room_polys = []
	for r: Dictionary in (map.get("rooms", []) as Array):
		var poly := PackedVector2Array()
		for q: Array in (r.get("poly", []) as Array):
			poly.append(Vector2(float(q[0]), float(q[1])))
		if poly.size() < 3:
			continue
		var rect := Rect2(poly[0], Vector2.ZERO)
		for k in range(1, poly.size()):
			rect = rect.expand(poly[k])
		_room_polys.append({"id": String(r.get("id", "")), "rect": rect.grow(0.01), "poly": poly})


## 位置 → 舱室 id（房间 poly 优先，落在走廊返回空串）。
func room_at(p: Vector2) -> String:
	if _room_polys.is_empty() and not map.is_empty():
		_cache_room_polys()
	for item: Dictionary in _room_polys:
		if (item["rect"] as Rect2).has_point(p) and Geometry2D.is_point_in_polygon(p, item["poly"] as PackedVector2Array):
			return item["id"] as String
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


func ghost_cap() -> int:
	return int(SpaceData.num(space, "move", "ghost_task_cap"))

func can_do_task(point_i: int, agent_i: int = -1) -> bool:
	var a: Dictionary = me() if agent_i < 0 else agent(agent_i)
	if a.is_empty() or over:
		return false
	var is_ghost := bool(a.get("ghost", false))
	if not bool(a.get("alive", false)) and not is_ghost:
		return false
	if is_ghost and int(a.get("ghostPts", 0)) + task_pts(point_i) > ghost_cap():
		return false
	return remaining_tasks(agent_i).has(point_i)


## 完成一个任务点：进度、个人任务位、申请单、电路修复、事件、胜负。
func complete_task(agent_i: int, point_i: int) -> Dictionary:
	var fail := {"ok": false, "reason": ""}
	if over:
		fail["reason"] = "对局已结束"
		return fail
	var a := agent(agent_i)
	if a.is_empty():
		fail["reason"] = "角色不存在"
		return fail
	if not bool(a.get("alive", false)) and not bool(a.get("ghost", false)):
		fail["reason"] = "角色已死亡"
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

	if at != t_idx:
		var cur: int = int(list[t_idx])
		list[t_idx] = point_i
		list[at] = cur
		a["tasks"] = list

	var v := task_pts(point_i)
	if v <= 0:
		fail["reason"] = "任务分值取不到（sim.json win.task_pts）"
		return fail
	if bool(a.get("ghost", false)):
		if int(a.get("ghostPts", 0)) + v > ghost_cap():
			fail["reason"] = "幽灵任务额度已用尽（最多 %d 分）" % ghost_cap()
			return fail
		a["ghostPts"] = int(a.get("ghostPts", 0)) + v

	prog = mini(win_pts(), prog + v)
	a["progress"] = int(a.get("progress", 0)) + v
	a["tIdx"] = t_idx + 1
	point_done[point_i] = elapsed

	var got_qual := false
	if int(a.get("progress", 0)) >= 3 and not bool(a.get("_q3", false)):
		a["_q3"] = true
		a["qualPending"] = int(a.get("qualPending", 0)) + 1
		got_qual = true
	if int(a.get("progress", 0)) >= 5 and not bool(a.get("_q5", false)):
		a["_q5"] = true
		a["qualPending"] = int(a.get("qualPending", 0)) + 1
		got_qual = true

	var power_fix := false
	if String(p.get("room", "")) == "power" and String(p.get("label", "")) == "电路维修" and not power_fixed:
		power_fixed = true
		power_fix = true
		if light_state != 2: light_state = 1

	_log("task", {
		"actor": agent_i, "label": String(p.get("label", "")), "room": String(p.get("room", "")),
		"pts": v, "ghost": bool(a.get("ghost", false)), "prog": prog,
	})
	var won := check_win()
	return {
		"ok": true, "pts": v, "prog": prog, "qual": got_qual,
		"power_fix": power_fix, "win": won, "why": over_why,
	}


func tick(dt: float) -> void:
	if over or dt <= 0.0:
		return
	for a: Dictionary in agents:
		if int(a.get("drag", -1)) >= 0:
			sync_drag_of(a)
	if not meeting.is_empty():
		_tick_meeting(dt)
		return
	elapsed += dt
	door_tick(dt)
	if ai_enabled:
		if _ai_human != null:
			_ai_human.tick(dt)
		if _ai_alien != null:
			_ai_alien.tick(dt)
	tick_agents(dt)
	_tick_invariants(dt)
	if bots != null:
		bots.tick(dt)
	supply_cd_tick(dt)
	room_out_tick(dt)
	_tick_dmg(dt)
	_frame_acc += dt
	if _frame_acc >= FRAME_DT:
		_frame_acc = 0.0
		record_frame()
	sab_tick()
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
			if int(a.get("i", -1)) != me_idx or spectator:
				_ghost_tick(a, dt)
			continue
		if bool(a.get("detained", false)):
			continue
		var aim_path: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
		if aim_path.size() > 0:
			var ai := clampi(int(a.get("pathI", 0)), 0, aim_path.size() - 1)
			var nxt: Vector2 = aim_path[ai]
			var cur: Vector2 = a.get("pos", Vector2.ZERO)
			var step := nxt - cur
			if step.length_squared() > 0.000001:
				a["aimAng"] = atan2(step.y, step.x)
		if float(a.get("stunT", 0.0)) > 0.0:
			a["stunT"] = maxf(0.0, float(a.get("stunT", 0.0)) - dt)
			a["path"] = PackedVector2Array()
			a["moving"] = false
		if float(a.get("rushT", 0.0)) > 0.0:
			a["rushT"] = maxf(0.0, float(a.get("rushT", 0.0)) - dt)
		if float(a.get("redT", 0.0)) > 0.0:
			a["redT"] = maxf(0.0, float(a.get("redT", 0.0)) - dt)
		if bool(a.get("downed", false)):
			continue
		if float(a.get("doing", 0.0)) > 0.0:
			if out_blocks_doing(a):
				continue
			a["doing"] = float(a.get("doing", 0.0)) - dt
			if float(a.get("doing", 0.0)) <= 0.0:
				a["doing"] = 0.0
				_finish_doing(a)
			continue
		if int(a.get("drag", -1)) >= 0:
			a["_dragAiT"] = float(a.get("_dragAiT", 0.0)) + dt
			if float(a.get("_dragAiT", 0.0)) >= 1.6:
				a["_dragAiT"] = 0.0
				hear("drag", a.get("pos", Vector2.ZERO), 8.0, {"actor": int(a.get("i", -1))})
		var path: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
		if path.size() == 0:
			continue
		var mul := 1.0
		if int(a.get("drag", -1)) < 0 and float(a.get("rushT", 0.0)) > 0.0:
			var rcfg: Dictionary = (cfg.get("rules", {}) as Dictionary).get("RUSH", {}) as Dictionary
			if not bool(rcfg.get("alienOnly", true)) or bool(a.get("alien", false)):
				var frac := clampf(float(a.get("rushT", 0.0)) / maxf(0.01, float(rcfg.get("dur", 1.0))), 0.0, 1.0) \
					if bool(rcfg.get("decay", true)) else 1.0
				mul = 1.0 + (float(rcfg.get("mul", 2.0)) - 1.0) * frac
		var sp := drag_speed if int(a.get("drag", -1)) >= 0 else speed * mul
		var remain := sp * dt
		var pi := int(a.get("pathI", 0))
		var pos: Vector2 = a.get("pos", Vector2.ZERO)
		var from_pos := pos
		var free_fly := bool(a.get("ghost", false)) and not bool(a.get("alive", false))
		while remain > 0.0 and pi < path.size():
			var tgt: Vector2 = path[pi]
			var d := pos.distance_to(tgt)
			if d <= remain:
				if not free_fly and door_blocked_segment(pos.x, pos.y, tgt.x, tgt.y):
					a["moving"] = false
					break
				pos = tgt
				pi += 1
				remain -= d
			else:
				var nx := pos + (tgt - pos).normalized() * remain
				if not free_fly and door_blocked_segment(pos.x, pos.y, nx.x, nx.y):
					a["moving"] = false
					remain = 0.0
					break
				pos = nx
				remain = 0.0
		if not free_fly and nav != null and not nav.is_free(pos):
			pos = nav.nearest_free(pos)
		if not free_fly and pi < path.size() and nav != null:
			if pos.distance_to(from_pos) < 0.004:
				a["_stuckT"] = float(a.get("_stuckT", 0.0)) + dt
			else:
				a["_stuckT"] = 0.0
			if float(a.get("_stuckT", 0.0)) > 0.7:
				var dest: Vector2 = path[path.size() - 1]
				pos = nav.nearest_free(pos)
				a["_stuckT"] = 0.0
				var np: PackedVector2Array = nav.path(pos, dest)
				a["path"] = np
				a["pathI"] = 0
				a["pos"] = pos
				a["moving"] = np.size() > 0
				continue
		else:
			a["_stuckT"] = 0.0
		a["pos"] = pos
		a["pathI"] = pi
		if pos.distance_to(from_pos) > 0.002:
			a["aimAng"] = atan2(pos.y - from_pos.y, pos.x - from_pos.x)
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
	elif kind == "fake":
		var fk := String(a.get("_fakeKind", ""))
		if fk == "repair" or fk == "task":
			if speech_enabled and mind != null:
				mind.cred_broadcast(ai, "fakeRepair" if fk == "repair" else "fakeWork",
					a.get("pos", Vector2.ZERO))
			a["_fakeCD"] = rules.n("DISGUISE", "cooldown", 18.0)
		a["_fakeKind"] = ""
	elif kind == "breaker":
		if not power_on:
			toggle_power(ai)
			power_fixed = true
			if speech_enabled and mind != null:
				mind.cred_broadcast(ai, "breakerOn", a.get("pos", Vector2.ZERO))
		if bool(a.get("alien", false)) and String(a.get("_fakeKind", "")) == "breaker":
			a["_fakeCD"] = rules.n("DISGUISE", "cooldown", 18.0)
			a["_fakeKind"] = ""
	elif kind == "revive":
		var rv := int(a.get("_rv", -1))
		if rv >= 0 and int(a.get("medkit", 0)) > 0 and revive(rv):
			a["medkit"] = int(a.get("medkit", 0)) - 1
			if speech_enabled and mind != null:
				mind.cred_broadcast(ai, "revive", a.get("pos", Vector2.ZERO))
	elif kind == "search":
		var sv := int(a.get("_sv", -1))
		if sv >= 0:
			search_body(sv, ai)
	a["_doing"] = ""
	a["_item"] = ""
	a["_sv"] = -1
	a["taskPt"] = -1
	a["_rv"] = -1
	a["_aiT"] = 0.25

func distance_to(agent_i: int, target: Vector2) -> float:
	var a := agent(agent_i)
	if a.is_empty():
		return 9999.0
	return (a.get("pos", Vector2.ZERO) as Vector2).distance_to(target)


func _dawn() -> void:
	dawn()
	if over:
		return
	if meeting.is_empty():
		_start_night(true)


## 白天会议：2.5D dawn() 的等价物。
func dawn() -> void:
	for a: Dictionary in agents:
		if bool(a.get("alive", false)) and bool(a.get("downed", false)):
			die(a)
	dmg = []
	sab_target = {}
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
	for a3: Dictionary in agents:
		a3["drag"] = -1
		a3["draggedBy"] = -1
	open_meeting_kind(MEET_DAY, -1, -1)

func _rand_in_bridge() -> Vector2:
	return rand_in_room("bridge")


## 进入一个夜晚（2.5D startNight 的等价物）。
func _start_night(inc: bool) -> void:
	if inc:
		night += 1
	night_meets = 0
	if speech_enabled and mind != null:
		mind.reset_night()
	t = night_len()
	_log("night_start", {"night": night})
	bots.reset_night()
	var bc: Dictionary = space.get("bot", {}) as Dictionary
	bot_hp = {"secbot": int(bc.get("hp_secbot", 2)), "medbot": int(bc.get("hp_medbot", 1))}
	dmg = []
	_sab_spots = {}
	power_fixed = false
	light_state = 0
	power_on = true
	for a: Dictionary in agents:
		_reset_agent_night(a)
	var was_term := terminator_on
	check_terminator()
	if was_term and terminator_on:
		var bullets := int(rules.t("TERMINATOR").get("bullets", 1)) if rules != null else 1
		for a2: Dictionary in agents:
			if bool(a2.get("alive", false)):
				var want := bullets + 1 if bool(a2.get("alien", false)) else bullets
				a2["bullet"] = maxi(int(a2.get("bullet", 0)), want)
	_log("dawn", {"night": night, "prog": prog})
	check_win()


## 逐人夜间复位。只清「当夜」字段。
func _reset_agent_night(a: Dictionary) -> void:
	a["knife"] = 1
	a["sabUsed"] = false
	a["path"] = PackedVector2Array()
	a["pathI"] = 0
	a["moving"] = false
	a["doing"] = 0.0
	a["_doing"] = ""
	a["target"] = -1
	a["_item"] = ""
	a["detained"] = false
	a["detainedT"] = 0.0
	if bool(a.get("alive", false)):
		a["reported"] = false
	a["drag"] = -1
	a["draggedBy"] = -1
	a["redT"] = 0.0
	a["rushT"] = 0.0
	a["stunT"] = 0.0
	a["_reportT"] = 0.0
	a["_reportBody"] = -1
	a["_reportMemo"] = {}
	a["_killBody"] = -1
	a["_killDecided"] = true
	a["_reportPlan"] = {}
	a["_supportGoal"] = {}
	a["_alienReports"] = 0
	a["_hideCD"] = 0.0
	a["_hides"] = 0
	a["_dragTo"] = ""
	a["_credMed"] = false
	a["_dragAway"] = false
	a["_dragMedD0"] = 0.0
	a["_botCD"] = 0.0
	a["_pipeCD"] = 0.0
	a["_pipePlan"] = {}
	a["_pipeSeeks"] = 0
	a["_fakeCD"] = 0.0
	a["_fakeKind"] = ""
	a["_sabDone"] = false
	a["_sabT"] = 0.0
	a["_sabNight"] = -1
	a["_killAt"] = 0.0
	a["_lightGo"] = false
	a["_fleeT"] = 0.0
	a["_aiT"] = 0.0
	a["_lootMem"] = {}
	a["_look"] = {}
	a["noise"] = {}
	a["alert"] = 0.0
	var dscale := 1.0
	if mind != null:
		dscale = mind.trait_c("delayScale", a)
	a["_delay"] = (2.0 + _rng.randf() * 6.0) * dscale
	a["_rv"] = null
	a["_lie"] = {}
	a["_retract"] = null
	a["_busTarget"] = -1
	a["_stuckN"] = 0
	a["_lastSaw"] = {}
	a["_avoid_i"] = -1
	a["_avoid_t"] = 0.0
	a["_avoid"] = {}
	a["_chaseCD"] = {}
	a["_chaseId"] = -1
	a["_chaseT"] = 0.0
	a["_escapeT"] = 0.0
	a["_escapePathT"] = 0.0
	a["_breakerWant"] = false
	a["_breakerRollN"] = ""
	a["accuse"] = -1
	a["accuseWhy"] = {}
	a["_abstain"] = false
	a["detainSeen"] = {}


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


func _end(win: bool, why: String) -> void:
	if over:
		return
	over = true
	over_win = win
	over_why = why
	_log("game_end", {"win": win, "why": why, "prog": prog, "night": night})


func _stat(key: String, n: int = 1) -> void:
	stats[key] = int(stats.get(key, 0)) + n

func _stat_by(group: String, key: String, n: int = 1) -> void:
	var g: Dictionary = stats.get(group, {}) as Dictionary
	g[key] = int(g.get(key, 0)) + n
	stats[group] = g


func rand_in_room(room_id: String) -> Vector2:
	var r: Dictionary = rooms_by_id.get(room_id, {}) as Dictionary
	if r.is_empty() or nav == null:
		return room_center(room_id)
	var rect: Array = r.get("rect", []) as Array
	if rect.size() < 4:
		return room_center(room_id)
	for k in 200:
		var p := Vector2(float(rect[0]) + _rng.randf() * float(rect[2]),
			float(rect[1]) + _rng.randf() * float(rect[3]))
		if nav.is_free(p):
			return p
	return room_center(room_id)

func room_center(room_id: String) -> Vector2:
	var r: Dictionary = rooms_by_id.get(room_id, {}) as Dictionary
	var rect: Array = r.get("rect", []) as Array
	if rect.size() >= 4:
		return Vector2(float(rect[0]) + float(rect[2]) / 2.0,
			float(rect[1]) + float(rect[3]) / 2.0)
	var label: Array = r.get("label", [0.0, 0.0]) as Array
	return Vector2(float(label[0]), float(label[1]))

func bot_pos_of(kind: String) -> Vector2:
	if bots == null:
		return Vector2.ZERO
	return bots.pos_of(kind)


# ---------------- 尸体链转发（body_state.gd） ----------------

func body_has_loot(b: Dictionary) -> bool:
	return BodyStateScript.body_has_loot(b)

func search_body(body_i: int, by: int, with_loot: Variant = null) -> bool:
	var auto_loot: bool = (by != me_idx) if with_loot == null else bool(with_loot)
	return BodyStateScript.search(self, body_i, by, auto_loot)

func take_body_loot(body_i: int, by: int) -> Dictionary:
	return BodyStateScript.take_loot(self, body_i, by)

func body_near(pos: Vector2, radius: float) -> Dictionary:
	return BodyStateScript.body_near(self, pos, radius)


# ---------------- 会议 / 投票 / 终结者薄转发（sim_meeting.gd） ----------------

func night_meet_left() -> int:
	return SimMeetingScript.night_meet_left(self)

func open_meeting_kind(kind: String, reporter_i: int, victim_i: int) -> bool:
	return SimMeetingScript.open_meeting_kind(self, kind, reporter_i, victim_i)

func _quick_report_sus(reporter_i: int, victim_i: int) -> void:
	SimMeetingScript.quick_report_sus(self, reporter_i, victim_i)

func note_body(witness_i: int, victim_i: int) -> void:
	SimMeetingScript.note_body(self, witness_i, victim_i)

func note_accuse(accuser_i: int, target_i: int) -> void:
	SimMeetingScript.note_accuse(self, accuser_i, target_i)

func open_meeting(reporter_i: int, victim_i: int) -> bool:
	return open_meeting_kind(MEET_NIGHT, reporter_i, victim_i)

func skip_discussion() -> bool:
	return SimMeetingScript.skip_discussion(self)

func skip_vote() -> bool:
	return SimMeetingScript.skip_vote(self)

func cast_vote(voter_i: int, target_i: int) -> void:
	SimMeetingScript.cast_vote(self, voter_i, target_i)

func _public_accuse_target(a: Dictionary) -> int:
	return SimMeetingScript.public_accuse_target(self, a)

func _leading_accused(a: Dictionary) -> int:
	return SimMeetingScript.leading_accused(self, a)

func _has_real_evidence(a: Dictionary, tgt: int) -> bool:
	return SimMeetingScript.has_real_evidence(a, tgt)

func _is_almost_friend(a: Dictionary, ti: int) -> bool:
	return SimMeetingScript.is_almost_friend(a, ti)

func _alien_pack_lead() -> Dictionary:
	return SimMeetingScript.alien_pack_lead(self)

func _mate_follow_chance(a: Dictionary, lead: Dictionary) -> float:
	return SimMeetingScript.mate_follow_chance(self, a, lead)

func _weighted_hostile_target(a: Dictionary, pool: Array) -> int:
	return SimMeetingScript.weighted_hostile_target(self, a, pool)

func _ai_vote_target(a: Dictionary) -> int:
	return SimMeetingScript.ai_vote_target(self, a)

func vote_lean(a: Dictionary) -> Dictionary:
	return SimMeetingScript.vote_lean(self, a)

func cast_early_votes() -> int:
	return SimMeetingScript.cast_early_votes(self)

func vote_pressure(a: Dictionary, tgt: int) -> float:
	return SimMeetingScript.vote_pressure(self, a, tgt)

func best_vote_target(a: Dictionary) -> Dictionary:
	return SimMeetingScript.best_vote_target(self, a)

func reconsider_votes(by_id: int) -> int:
	return SimMeetingScript.reconsider_votes(self, by_id)

func _cast_ai_votes() -> void:
	var intents: Dictionary = {}
	var meta0: Dictionary = (meeting.get("voteMeta", {}) as Dictionary)
	for a: Dictionary in agents:
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		var ai := int(a.get("i", -1))
		if ai == me_idx and not spectator:
			continue
		var mm0: Dictionary = (meta0.get(ai, {}) as Dictionary)
		if not mm0.is_empty() and int(mm0.get("early", 0)) == 1 \
				and int(mm0.get("rev", 0)) == int(a.get("rev", 0)):
			_stat("earlyKept", 1)
			continue
		intents[ai] = _ai_vote_target(a)
	for k2: int in intents.keys():
		cast_vote(k2, int(intents[k2]))
	SimMeetingScript.apply_vote_shields(self)

func _apply_vote_shields() -> void:
	SimMeetingScript.apply_vote_shields(self)

func _soft_hot_target(a: Dictionary) -> int:
	return SimMeetingScript.soft_hot_target(self, a)

func _is_mate(a: Dictionary, other_i: int) -> bool:
	return SimMeetingScript.is_mate(a, other_i)

func _tick_meeting(dt: float) -> void:
	SimMeetingScript.tick_meeting(self, dt)

func _after_meeting(kind: String) -> void:
	SimMeetingScript.after_meeting(self, kind)

func _close_meeting() -> void:
	SimMeetingScript.close_meeting(self)

func log_account(agent_i: int) -> void:
	SimMeetingScript.log_account(self, agent_i)

func _reveal_all_identities() -> void:
	SimMeetingScript.reveal_all_identities(self)

func check_terminator() -> void:
	var tc: Dictionary = rules.t("TERMINATOR") if rules != null else {}
	var term_night := int(tc.get("night", 10))
	if terminator_on or int(night) < term_night:
		return
	SimMeetingScript.check_terminator(self)


# ---------------- 船体系统薄转发（sim_systems.gd） ----------------

func claim_qual(agent_i: int = -1) -> bool:
	return SimSystemsScript.claim_qual(self, agent_i)

func supply_cool_left(item: String) -> float:
	return SimSystemsScript.supply_cool_left(self, item)

func supply_cd_tick(dt: float) -> void:
	SimSystemsScript.supply_cd_tick(self, dt)

func apply_room_out() -> void:
	SimSystemsScript.apply_room_out(self)

func out_blocks_doing(a: Dictionary) -> bool:
	return SimSystemsScript.out_blocks_doing(self, a)

func room_out_tick(dt: float) -> void:
	SimSystemsScript.room_out_tick(self, dt)

func exchange_supply(item: String, agent_i: int = -1) -> bool:
	return SimSystemsScript.exchange_supply(self, item, agent_i)

func claim_spot() -> Vector2:
	return SimSystemsScript.claim_spot(self)

func supply_spot(item: String) -> Vector2:
	return SimSystemsScript.supply_spot(self, item)

func player_revive(body_i: int) -> bool:
	return SimSystemsScript.player_revive(self, body_i)

func player_sabotage(room_id: String) -> bool:
	return SimSystemsScript.player_sabotage(self, room_id)

func sab_spot_for(rid: String) -> Vector2:
	return SimSystemsScript.sab_spot_for(self, rid)

func sabotage_room(room_id: String, by: int, ghost: bool = false) -> bool:
	return SimSystemsScript.sabotage_room(self, room_id, by, ghost)

func fix_damage(room_id: String, by: int = -1) -> bool:
	return SimSystemsScript.fix_damage(self, room_id, by)

func _tick_dmg(dt: float) -> void:
	SimSystemsScript.tick_dmg(self, dt)

func _build_doors() -> void:
	SimSystemsScript.build_doors(self)

func door_tick(dt: float) -> void:
	SimSystemsScript.door_tick(self, dt)

func door_blocked_segment(x1: float, y1: float, x2: float, y2: float) -> bool:
	return SimSystemsScript.door_blocked_segment(self, x1, y1, x2, y2)

func los_now(x1: float, y1: float, x2: float, y2: float) -> bool:
	return SimSystemsScript.los_now(self, x1, y1, x2, y2)

func sab_room_ok(rid: String) -> bool:
	return SimSystemsScript.sab_room_ok(self, rid)

func scan_bodies(a: Dictionary, dt: float) -> void:
	SimSystemsScript.scan_bodies(self, a, dt)

func ai_wants_loot(a: Dictionary, b: Dictionary) -> bool:
	return SimSystemsScript.ai_wants_loot(self, a, b)

func can_report_body(a: Dictionary, v: Dictionary) -> bool:
	return SimSystemsScript.can_report_body(self, a, v)

func alien_report_worth(a: Dictionary, v: Dictionary) -> float:
	return SimSystemsScript.alien_report_worth(self, a, v)

func _ghost_tick(a: Dictionary, dt: float) -> void:
	SimSystemsScript.ghost_tick(self, a, dt)

func _ghost_roam(a: Dictionary, dt: float, sp: float) -> void:
	SimSystemsScript.ghost_roam(self, a, dt, sp)

func _ghost_move(a: Dictionary, dt: float, sp: float) -> void:
	SimSystemsScript.ghost_move(a, dt, sp)

func start_drag(agent_i: int, body_i: int) -> bool:
	return SimSystemsScript.start_drag(self, agent_i, body_i)

func sync_drag_of(a: Dictionary) -> void:
	SimSystemsScript.sync_drag_of(self, a)

func _drag_away_notice(a: Dictionary, v: Dictionary) -> void:
	SimSystemsScript.drag_away_notice(self, a, v)

func release_drag(agent_i: int) -> bool:
	return SimSystemsScript.release_drag(self, agent_i)

func toggle_power(by: int) -> bool:
	return SimSystemsScript.toggle_power(self, by)

func breaker_pull_time() -> float:
	return SimSystemsScript.breaker_pull_time(self)

func breaker_pos() -> Vector2:
	return SimSystemsScript.breaker_pos(self)

func breaker_on_time() -> float:
	return SimSystemsScript.breaker_on_time(self)

func sab_tick() -> void:
	SimSystemsScript.sab_tick(self)


# ---------------- 战斗 / 视野 / 听觉薄转发（sim_combat.gd） ----------------

func gun_threat_from(a: Dictionary) -> Dictionary:
	return SimCombatScript.gun_threat_from(self, a)

func gun_dodge_step(a: Dictionary, dt: float) -> bool:
	return SimCombatScript.gun_dodge_step(self, a, dt)

func kill(agent_i: int, cause: String, by: int = -1) -> bool:
	return SimCombatScript.kill(self, agent_i, cause, by)

func knife(killer_i: int, victim_i: int) -> bool:
	return SimCombatScript.knife(self, killer_i, victim_i)

func _kill_rush_start(a: Dictionary) -> void:
	SimCombatScript.kill_rush_start(self, a)

func shoot(shooter_i: int, target_i: int) -> bool:
	return SimCombatScript.shoot(self, shooter_i, target_i)

func revive(agent_i: int, method: String = "manual", stun: float = 0.0) -> bool:
	return SimCombatScript.revive(self, agent_i, method, stun)

func die(v: Dictionary) -> bool:
	return SimCombatScript.die(self, v)

func sight_range_at(p: Vector2) -> float:
	return SimCombatScript.sight_range_at(self, p)

func ai_can_see(observer: Dictionary, p: Vector2) -> bool:
	return SimCombatScript.ai_can_see(self, observer, p)

func agent_aim_ang(a: Dictionary) -> float:
	return SimCombatScript.agent_aim_ang(a)

func lit_zone_at(p: Vector2) -> String:
	return SimCombatScript.lit_zone_at(self, p)

func corridor_by_id(cid: String) -> Dictionary:
	return SimCombatScript.corridor_by_id(self, cid)

func corr_joins_room(rid: String, c: Dictionary) -> bool:
	return SimCombatScript.corr_joins_room(rid, c)

func nearest_downed(pos: Vector2, radius: float, observer: Dictionary = {}) -> Dictionary:
	return SimCombatScript.nearest_downed(self, pos, radius, observer)

func _witness_action(actor: Dictionary, kind: String, at: Vector2, victim_i: int = -1) -> void:
	SimCombatScript.witness_action(self, actor, kind, at, victim_i)

func _track_pass() -> void:
	SimCombatScript.track_pass(self)

func watchers_at(a: Dictionary, at: Vector2, rad: float, except_i: int = -1) -> Array:
	return SimCombatScript.watchers_at(self, a, at, rad, except_i)

func recent_witness(a: Dictionary, sec: float) -> bool:
	return SimCombatScript.recent_witness(self, a, sec)

func secbot_raid_ok(a: Dictionary, sec_pos: Vector2) -> bool:
	return SimCombatScript.secbot_raid_ok(self, a, sec_pos)

func hear(kind: String, at: Vector2, rad: float, extra: Dictionary = {}) -> void:
	SimCombatScript.hear(self, kind, at, rad, extra)

func can_act(kind: String, ctx: Dictionary = {}) -> Dictionary:
	match kind:
		"knife", "knife_bot", "shoot", "drag", "drop", "report", "sabotage", "pipe", \
		"task", "fix", "breaker", "cams", "search", "revive", "supply", "claim", "bot", "inspect":
			return SimCombatScript.can_act(self, kind, ctx)
		_:
			return SimCombatScript.can_act(self, kind, ctx)

func _act_no(reason: String) -> Dictionary:
	return SimCombatScript._act_no(reason)

func _act_ok(target: int = -1, action: String = "") -> Dictionary:
	return SimCombatScript._act_ok(target, action)

func hit_bot(shooter_i: int, kind: String) -> bool:
	return SimCombatScript.hit_bot(self, shooter_i, kind)

func knife_bot(kind: String, by: int) -> bool:
	return SimCombatScript.knife_bot(self, kind, by)

func sabotage_bot(kind: String, by: int) -> bool:
	return SimCombatScript.sabotage_bot(self, kind, by)


# ---------------- 复盘 / 环境广播 / 不变量 / 日志工具 ----------------

## @src js/game.js:2342 envNotice(kind,x,y,conf)
func env_notice(kind: String, at: Vector2, conf: float = 0.5) -> void:
	if over:
		return
	var ev_kind := "env_" + kind
	for a: Dictionary in agents:
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
				or bool(a.get("detained", false)):
			continue
		ev_seq += 1
		var ev := {
			"kind": ev_kind, "x": at.x, "y": at.y, "room": room_at(at),
			"conf": conf, "src": "env", "t": snappedf(elapsed, 0.01),
			"night": night, "id": ev_seq,
		}
		if not a.has("ev_mem"):
			a["ev_mem"] = []
		var mem: Array = a["ev_mem"] as Array
		mem.append(ev)
		if mem.size() > MEM_MAX:
			mem.pop_front()
		if conf > 0.25 and (ev_kind == "env_lights" or ev_kind == "env_fault" \
				or ev_kind == "env_robot"):
			a["alert"] = minf(1.0, float(a.get("alert", 0.0)) + conf * 0.35)
			a["noise"] = {"x": at.x, "y": at.y,
				"t": snappedf(elapsed, 0.01), "kind": ev_kind}


## @src js/game.js:1742 recordFrame()
func record_frame() -> void:
	if over:
		return
	var p: Array = []
	for a: Dictionary in agents:
		var px := 0.0
		var py := 0.0
		if not bool(a.get("alive", false)):
			if bool(a.get("bodyGone", false)) \
					or String(a.get("deathCause", "")) == "vote" \
					or not a.has("bodyPos"):
				continue
			var bp: Vector2 = a.get("bodyPos", Vector2.ZERO) as Vector2
			px = bp.x
			py = bp.y
		else:
			var pos: Vector2 = a.get("pos", Vector2.ZERO) as Vector2
			px = pos.x
			py = pos.y
		var f := 0
		if bool(a.get("alive", false)):
			f |= 1
		if bool(a.get("downed", false)):
			f |= 2
		if bool(a.get("detained", false)):
			f |= 4
		var dv: Variant = a.get("drag", -1)
		if dv != null and int(dv) >= 0:
			f |= 8
		p.append([int(a.get("i", -1)), snappedf(px, 0.1), snappedf(py, 0.1), f])
	if frames.size() < FRAME_CAP:
		frames.append({"pt": snappedf(elapsed, 0.1), "n": night, "p": p})


func run_invariants(tag: String) -> Dictionary:
	if sim_run:
		return {}
	var r: Dictionary = InvariantsScript.check(self)
	inv_checks = int(r.get("checks", 0))
	inv_fails = r.get("fails", [])
	inv_last_tag = tag
	return r

func replay_data() -> Dictionary:
	var roster: Array = []
	for a: Dictionary in agents:
		var dc: Variant = null
		var dr: Variant = null
		if String(a.get("deathCause", "")) != "":
			dc = String(a.get("deathCause", ""))
		if String(a.get("deathRoom", "")) != "":
			dr = String(a.get("deathRoom", ""))
		roster.append({
			"i": int(a.get("i", -1)), "name": String(a.get("name", "")),
			"alien": bool(a.get("alien", false)), "alive": bool(a.get("alive", false)),
			"deathCause": dc, "deathRoom": dr,
		})
	var game_ver := "返航录V3"
	var ver_v: Variant = _read_json("res://data/version.json")
	if ver_v is Dictionary:
		var base_v: Dictionary = (ver_v as Dictionary).get("base", {}) as Dictionary
		if not base_v.is_empty():
			game_ver = String(base_v.get("version", "返航录V3"))
	var bounds: Dictionary = map.get("bounds", {}) as Dictionary
	var win: Dictionary = cfg.get("win", {}) as Dictionary
	return {
		"v": 1,
		"game": game_ver,
		"savedAt": Time.get_datetime_string_from_system(true, false),
		"map": {
			"w": float(bounds.get("w", 0)), "h": float(bounds.get("h", 0)),
			"rooms": (map.get("rooms", []) as Array).size(),
			"pipes": (map.get("pipes", []) as Array).size(),
		},
		"result": {
			"win": over_win, "why": over_why, "prog": prog,
			"winPts": int(win.get("pts", 0)), "nights": night,
		},
		"roster": roster,
		"events": events.duplicate(true),
		"frames": frames.duplicate(true),
	}


func _dev_note(text: String, data: Dictionary = {}) -> void:
	var e := data.duplicate()
	e["text"] = text
	e["night"] = night
	e["pt"] = snappedf(elapsed, 0.01)
	dev_log.append(e)
	if dev_log.size() > 30:
		dev_log.pop_front()

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
	if events.size() < EV_CAP:
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

func _tick_invariants(dt: float) -> void:
	if not dev:
		return
	_inv_t += dt
	if _inv_t < 2.0:
		return
	_inv_t = 0.0
	if agents.size() != 15:
		_log("invariant", {"what": "agents", "n": agents.size()})
	for a: Dictionary in agents:
		var ai := int(a.get("i", -1))
		if int(a.get("knife", 0)) < 0:
			_log("invariant", {"what": "knife_negative", "i": ai})
		if int(a.get("bullet", 0)) < 0:
			_log("invariant", {"what": "bullet_negative", "i": ai})
		if not bool(a.get("alive", true)) and bool(a.get("moving", false)):
			_log("invariant", {"what": "dead_moving", "i": ai})
