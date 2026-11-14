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
const BodyStateScript := preload("res://scripts/sim/body_state.gd")
const MindScript := preload("res://scripts/sim/mind.gd")
const SpeechScript := preload("res://scripts/sim/speech.gd")
const InvariantsScript := preload("res://scripts/sim/invariants.gd")
const SpaceData := preload("res://scripts/space_data.gd")

## 复盘 / 证据采样常量，逐字来自真源（@src js/game.js:1400）：
##   const EV_CAP=8000, FRAME_CAP=12000, FRAME_DT=0.5;
## @src js/t2/ai.js:192  const MEM_MAX = 64;  （evPush 的记忆窗口上限）
## 这些不是 3D 自造阈值，是 2.5D 原文常量；保留同名以便逐函数对账。
const EV_CAP := 8000
const FRAME_CAP := 12000
const FRAME_DT := 0.5
const MEM_MAX := 64

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
var spectator := false
## 2.5D G.dev（js/game.js:671 toggleDev / 4238 / 4287 / 7675 / 8275）：
## 调试用「无敌 + 全知」。只影响玩家本人受击/被驱逐，不改变 AI 判定与数值。
## 全知属表现层，读 dev 的视图（main.gd / crew_view.gd / minimap.gd）自己实现。
var dev := false
## DEV 拦截记录：**不进 events**（事件流要和 2.5D 对账，调试信息不能污染它）。
## 只给 DEV 面板与探针显示；条目超过 30 条丢最旧的。
var dev_log: Array = []
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
## @src js/game.js:287  events:[],frames:[],playT:0,_frameAcc:0
## G.playT 在 3D 由 elapsed 承担（tick 在会议期间提前 return，与 2.5D「会议不增长」一致）。
var frames: Array = []
var _frame_acc: float = 0.0
## @src js/game.js:276  dmg:[],sabPick:null,sabTarget:null,...,evSeq:0
var sab_target: Dictionary = {}
var ev_seq: int = 0
## 批量模拟遥测（2.5D G.simStats 等价物）：只计数不判定。
var stats: Dictionary = {}
## 2.5D SIM_RUN（js/game.js:557）：批量模拟模式。该模式下不跑不变量断言
## （1000 局 × 每帧断言没有意义，2.5D 也是 `if(SIM_RUN)return null`）。
var sim_run := false
## 红身/seenBy 追踪的节流计时
var _track_t: float = 0.0
var point_done: Dictionary = {}
var dmg: Array = []
## 2.5D SAB_SPOT_CACHE（js/game.js:1093-1113）：同一夜的同一舱室必须返回同一个设备，
## 否则「计划报的是手术台、坏的是药柜」，AI 的 _sabSpot 也会来回改目标。开夜清空。
var _sab_spots: Dictionary = {}
## 2.5D G.doors（js/game.js:415 buildDoors）：门是**模拟层状态**，不是场景装饰。
## 开合 / 断电 2 秒扫描都会改变移动与视线（doorBlockedSegment / losNow），
## 所以必须和 2.5D 一样放在 sim 里；scene_extras 只按这里的 open/scan_t 摆门扇。
var doors: Array = []
## 2.5D G.alienGhostSabUsed（js/game.js:2380）：异形幽灵的全局一次性破坏已发动。
var alien_ghost_sab_used := false
var meeting: Dictionary = {}
## 2.5D G.meetSeq：每场会议一个全局序号，结算页的投票矩阵按它分组。
var meet_seq := 0
var night_meets := 0
var ai_enabled := true

var seed_used := 0
## 2.5D G.inv（js/game.js:556-583）：不变量断言的最近一次结果。
## 只读诊断，不参与任何判定；--invtest 与 _t.inv 等价入口读这三个字段。
var inv_checks := 0
var inv_fails: Array = []
var inv_last_tag := ""
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
	alien_ghost_sab_used = false

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
			"stunT": 0.0,
			## 2.5D 的 me.sabUsed：异形每夜只能破坏一次（js/game.js openSabPick）。
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
		# 2.5D newGame:252：每局按 LEADER.chance 抽一位领袖（不预设阵营）+ 号召力重尾
		speech.roll_leader()

	_ai_human = AIHumanScript.new()
	_ai_human.setup(self, space)
	_ai_alien = AIAlienScript.new()
	_ai_alien.setup(self, space)
	bots = BotsScript.new()
	bots.setup(self, space)
	_build_doors()
	_log("game_start", {"night": 1, "seed": p_seed, "me": me_idx})
	# @src js/game.js:294 newGame：logEvent('game_start') 之后立即采首帧。
	record_frame()
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
## 幽灵任务额度：单一真源是 space.json#move.ghost_task_cap
## （由 3d/tools/export-space.cjs 从 SKT2Space.GHOST_TASK_CAP 导出，不在 GDScript 里写死）。
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
## 返回 {ok, pts, prog, qual, power_fix, win, why}；失败时 ok=false 且 reason 有话说。
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
	if bool(a.get("ghost", false)):
		if int(a.get("ghostPts", 0)) + v > ghost_cap():
			fail["reason"] = "幽灵任务额度已用尽（最多 %d 分）" % ghost_cap()
			return fail
		a["ghostPts"] = int(a.get("ghostPts", 0)) + v

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
	# 2.5D update:2259：拖拽同步**独立于 AI tick** —— 会议开始 / 拖拽者濒死或死亡
	# 必须当帧强制松手，不能等会议结束才结算（否则玩家会拖着一具尸体进会场）。
	for a: Dictionary in agents:
		if int(a.get("drag", -1)) >= 0:
			sync_drag_of(a)
	if not meeting.is_empty():
		_tick_meeting(dt)
		# 2.5D doorTick 的守卫是 `if(!G||!G.doors||G.meet||G.over)return`：
		# 会议期间门冻结（不扫、不开、不关），所以这里直接 return，不推进门。
		return
	elapsed += dt
	# 2.5D doorTick 在每帧 AI 之前：门先决定开/关，AI 与移动再读同一份状态。
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
	_tick_dmg(dt)
	# @src js/game.js:2218-2225 update：playT/_frameAcc 累加 → 0.5s 采帧 → sabTick 逐帧轮询。
	# 两者都排在 dmgTick 之后，与 2.5D 主循环顺序一致；会议期间本函数提前 return，
	# 因此 elapsed / 帧采样 / 目标引爆都和 2.5D 一样在会议期间冻结。
	_frame_acc += dt
	if _frame_acc >= FRAME_DT:
		_frame_acc = 0.0
		record_frame()
	sab_tick()
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
			# 2.5D aiGhost：AI 死者变幽灵继续做事/游荡；玩家幽灵由 player.gd 自己驱动
			if int(a.get("i", -1)) != me_idx or spectator:
				_ghost_tick(a, dt)
			continue
		if bool(a.get("detained", false)):
			continue
		# 2.5D agentAimAng：把「下一段路径方向」记成上一次朝向，
		# path 走完后手电锥仍朝最后的移动方向（js/game.js:1805 _aimAng）。
		var aim_path: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
		if aim_path.size() > 0:
			# 必须取「当前正在走的那一段」= path[pathI]，不是 path[0]。
			# 2026-11-11 用户反馈「人倒着走出去」：pathI 已推进到第 2、3 段时，
			# 朝向仍指着起点，走过第一个路点后整段路都是背对行进方向。
			var ai := clampi(int(a.get("pathI", 0)), 0, aim_path.size() - 1)
			var nxt: Vector2 = aim_path[ai]
			var cur: Vector2 = a.get("pos", Vector2.ZERO)
			var step := nxt - cur
			if step.length_squared() > 0.000001:
				a["aimAng"] = atan2(step.y, step.x)
		# 2.5D MEDBOT_REVIVE_STUN：救起后短时间只禁移动，
		# 不跳过站桩 / 濒死结算（"只禁移动，不禁交互/发言"）。
		if float(a.get("stunT", 0.0)) > 0.0:
			a["stunT"] = maxf(0.0, float(a.get("stunT", 0.0)) - dt)
			a["path"] = PackedVector2Array()
			a["moving"] = false
		# RUSH 逃逸计时（独立于红身）：2.5D RUSH 是"放倒人之后的体力状态"
		if float(a.get("rushT", 0.0)) > 0.0:
			a["rushT"] = maxf(0.0, float(a.get("rushT", 0.0)) - dt)
		# 红身计时（RED_BODY.dur）：只决定"目击者能否一眼认出刚出刀的人"
		if float(a.get("redT", 0.0)) > 0.0:
			a["redT"] = maxf(0.0, float(a.get("redT", 0.0)) - dt)
		if bool(a.get("downed", false)):
			# 2.5D 没有「12 秒失血」这条规则：濒死一直持续到天亮（dawn 统一判 bled），
			# 期间可以被医疗包 / 医疗无人机 / 拖进医疗间救起。
			continue
		if float(a.get("doing", 0.0)) > 0.0:
			a["doing"] = float(a.get("doing", 0.0)) - dt
			if float(a.get("doing", 0.0)) <= 0.0:
				a["doing"] = 0.0
				_finish_doing(a)
			continue
		if int(a.get("drag", -1)) >= 0:
			# 2.5D dragTick：拖尸每 1.6 秒 aiHear('drag',a,8,{actor}) —— 拖行是藏不住的
			a["_dragAiT"] = float(a.get("_dragAiT", 0.0)) + dt
			if float(a.get("_dragAiT", 0.0)) >= 1.6:
				a["_dragAiT"] = 0.0
				hear("drag", a.get("pos", Vector2.ZERO), 8.0, {"actor": int(a.get("i", -1))})
		var path: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
		if path.size() == 0:
			continue
		# 2.5D moveSpeed 的次序固定为 **拖尸 > 加速 > 基础**：
		# 拖着尸体还提速 50% 会毁掉藏尸的紧张感（SKSanity.RUSH 注释原文）。
		var mul := 1.0
		if int(a.get("drag", -1)) < 0 and float(a.get("rushT", 0.0)) > 0.0 \
				and bool(a.get("alien", false)):
			mul = float((cfg.get("rules", {}) as Dictionary).get("RUSH", {}).get("mul", 1.5))
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
				# 2.5D stepMove（js/game.js:828）：门挡住就**停在原地**并结束本帧移动，
				# 路径保留（下一拍 AI 重规划 / 等门开），不穿门也不绕路。
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
		# 2.5D 围墙兜底：活人永远留在可行走面内（幽灵才允许穿墙）
		if not free_fly and nav != null and not nav.is_free(pos):
			pos = nav.nearest_free(pos)
		# 2.5D 拐角卡死兜底：路径还在但连续 0.7 秒没有位移 ⇒ 从最近可走点重寻路。
		# 3D 之前只有 ai_human 里有 _stuck()，被门/拐角卡住的 AI 会一直原地踏步。
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
		# 2.5D：记住最后一次真实位移方向，停下后仍作为"手电朝向"
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
		# 2.5D fakeWork/fakeRepair：真假同价（CRED.gains 键直接取）
		if speech_enabled and mind != null:
			mind.cred_broadcast(ai, String(a.get("_fakeKind", "fakeWork")),
				a.get("pos", Vector2.ZERO))
	elif kind == "breaker":
		# 2.5D breakerOn：把电闸合上（只有断电时才需要做）；最像人的贵信号之一
		if not power_on:
			toggle_power(ai)
			power_fixed = true
			if speech_enabled and mind != null:
				mind.cred_broadcast(ai, "breakerOn", a.get("pos", Vector2.ZERO))
	elif kind == "revive":
		# 医疗包施救（2.5D STAND.revive：玩家与 AI 同一条入口）
		var rv := int(a.get("_rv", -1))
		if rv >= 0 and int(a.get("medkit", 0)) > 0 and revive(rv):
			a["medkit"] = int(a.get("medkit", 0)) - 1
			if speech_enabled and mind != null:
				mind.cred_broadcast(ai, "revive", a.get("pos", Vector2.ZERO))
	elif kind == "search":
		# 2.5D finishDoing('search')：站桩结束才 lootBody 并写目击证据
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
	# 2.5D startNight（js/game.js:7829）：机器人每夜复位（电量 / HP / 死亡标记 / 押送），
	# 故障不跨夜追罚、电闸修复标记清零。3D 之前从不复位，医疗无人机整局只能救 2 次。
	bots.reset_night()
	var bc: Dictionary = space.get("bot", {}) as Dictionary
	bot_hp = {"secbot": int(bc.get("hp_secbot", 2)), "medbot": int(bc.get("hp_medbot", 1))}
	dmg = []
	# 2.5D startNight：`for(const k in SAB_SPOT_CACHE)delete SAB_SPOT_CACHE[k];`
	# 破坏落点每夜重抽，同一台设备不能连续几夜都坏在同一个位置。
	_sab_spots = {}
	power_fixed = false
	# 2.5D startNight 的逐人复位（js/game.js:7800-7827）：只属于这一夜的状态清干净。
	# 3D 原先只复位刀数与 sabUsed，其余（报告计划 / 藏尸冷却 / 伪装冷却 / 躲人计时 /
	# 拖尸 / 红身 / 击杀加速 / 眩晕 / 假动作名额）都会跨夜残留。
	for a: Dictionary in agents:
		_reset_agent_night(a)
	check_terminator()
	_log("dawn", {"night": night, "prog": prog})
	check_win()


## 逐人夜间复位。只清「当夜」字段；known / cred / trust / grudge / almost /
## reliability 这些跨夜记忆由 mind.reset_night 处理，不在这里动。
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
	# 拖拽 / 红身 / 击杀加速 / 眩晕（2.5D: a.drag/draggedBy/redT/rushT/stunT 全清）
	a["drag"] = -1
	a["draggedBy"] = -1
	a["redT"] = 0.0
	a["rushT"] = 0.0
	a["stunT"] = 0.0
	# 报告 / 搜尸 / 藏尸 / 破坏 / 伪装 / 管道 / 躲人
	a["_reportT"] = 0.0
	a["_reportBody"] = -1
	a["_reportMemo"] = {}
	# 2.5D startNight:7886：行凶记账 / 报案计划不跨夜
	a["_killBody"] = -1
	a["_killDecided"] = true
	a["_reportPlan"] = {}
	# 2.5D startNight:7888 `a._supportGoal=null;`（每夜重掷；_alienTaskTotal 按局累计）
	a["_supportGoal"] = {}
	a["_alienReports"] = 0
	a["_hideCD"] = 0.0
	a["_hides"] = 0
	a["_dragTo"] = ""
	# 拖行副作用（2.5D：_credMed 每夜一次；_dragAway/_dragMedD0 每次起拖重置）
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
	# 2.5D startNight：`a._lootMem={};a._look=null;` + mindReset 把 alert 归零。
	# 3D 之前这些字段跨夜残留，alert 只涨不落，「循声查探」的门永远开着却没人用。
	a["_lootMem"] = {}
	a["_look"] = {}
	a["noise"] = {}
	a["alert"] = 0.0
	# 2.5D startNight:7893：`(2+Math.random()*6)*SKTrait.C.delayScale(a)` —— 开局错峰。
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
	a["_breakerWant"] = false
	# 这个字段存的是**夜号的字符串**（ai_alien.gd:279 用 String() 比对），
	# 置空串才会在新夜重掷；写成整数会让 String() 构造失败。
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


## 只给门禁 / 后续战斗结算用：把一个角色标记为死亡（B1 还没有战斗入口）。
## 门禁 / 批量模拟用的死亡快捷入口。
## 必须走 die()：否则会漏掉 ghost=true、bodyPos/deathRoom、拖拽解除与状态清理
## （2.5D 只有 die() 一个死亡入口，不存在第二条路径）。
func kill(agent_i: int, cause: String, by: int = -1) -> bool:
	var a := agent(agent_i)
	if a.is_empty() or not bool(a.get("alive", false)):
		return false
	a["deathCause"] = cause
	a["killedBy"] = by
	return die(a)


## 出刀：把人放倒（濒死持续到天亮 / 被救），已倒地的人不能再被刀。
func knife(killer_i: int, victim_i: int) -> bool:
	var k := agent(killer_i)
	var v := agent(victim_i)
	if k.is_empty() or v.is_empty():
		return false
	if not bool(k.get("alive", false)) or bool(k.get("downed", false)):
		return false
	if not bool(v.get("alive", false)):
		return false
	# 2026-11-11 用户纠正：2.5D knife()（js/game.js:4226）只判目标存活且未倒地，
	# **没有任何阵营限制** —— 异形可以互刀。此前这里多写的 `or v.alien` 是移植时
	# 凭空加的规则，已删。同阵营命中照常记危险行为 / 红身 / 目击。
	# 2.5D knife()（js/game.js:4225 `if(killer.knife<1)return` / :4232 `killer.knife--`）：
	# 每夜 1 把刀是硬 gate，先扣刀再结算；额度由 startNight(:7801 `a.knife=1`) 每夜补发。
	# 第七批拨乱反正：此前 3D 以「进攻链未齐、只搬限制会 0 胜」为由人为不启用该 gate，
	# 但逐条核实 RUSH 逃逸(sim_state.gd:500/_kill_rush_start)、目标承诺(ai_alien.gd:290)、
	# 管道突袭(ai_alien.gd:60)、异形开枪(ai_alien.gd:338) 均已接入 —— 该理由已不成立，
	# 按真源恢复额度。改动依据是 js/game.js 行号，不是任何平衡读数。
	if int(k.get("knife", 0)) < 1:
		return false
	k["knife"] = int(k.get("knife", 0)) - 1
	k["knifeUsed"] = int(k.get("knifeUsed", 0)) + 1
	# 2.5D knife()（js/game.js:4230-4243）：先记危险行为、先扣刀，再进 DEV 免伤。
	# 刀数照样消耗，否则 AI 对 DEV 玩家能无限连刀（2.5D 同一口径）。
	k["redT"] = float((cfg.get("rules", {}) as Dictionary).get("RED_BODY", {}).get("dur", 1.5))
	if dev and not spectator and victim_i == me_idx:
		if bots != null:
			bots.on_crime(killer_i, k.get("pos", Vector2.ZERO))
		_dev_note("DEV 无敌：%s 的出刀没有生效" % String(k.get("name", "?")),
			{"actor": killer_i, "victim": victim_i})
		return false
	# 2.5D knife()：`if(!victim||!victim.alive||victim.downed)return;`
	# 濒死者不能再被刀。3D 之前这里直接 die()，等于「第二刀必死」——
	# 这就是「被刀就说死亡」的来源，与 2.5D 的濒死口径完全相反。
	if bool(v.get("downed", false)):
		return false
	v["downed"] = true
	# 2.5D 没有倒地计时：濒死持续到天亮（dawn 才判 bled），期间可被拖/被救。
	v["downedT"] = 0.0
	v["downedBy"] = killer_i
	v["medTried"] = false
	v["bodyPos"] = v.get("pos", Vector2.ZERO)
	# 2.5D downRoom：倒地地点（结算身份表用；拖尸不会改它）
	v["downRoom"] = room_at(v.get("pos", Vector2.ZERO))
	v["deathCause"] = "knife"
	v["killedBy"] = killer_i
	# 2.5D knife()：`victim.searched=false`（每次倒下都是新一次可搜）
	v["searched"] = false
	# 目击者：7m 内、真实视线不被墙/掩体挡住的人记一笔"我看见他动手"。
	# 这是 B3 的最小理智线；B5 再换成完整的 sus/mind。
	_witness_action(k, "saw_knife", v.get("pos", Vector2.ZERO))
	# 2.5D aiHear('knife',victim,14,{actor,victim}) + screamFor → aiHear('scream',16,{victim})
	hear("knife", v.get("pos", Vector2.ZERO), 14.0, {"actor": killer_i, "victim": victim_i})
	hear("scream", v.get("pos", Vector2.ZERO), 16.0, {"victim": victim_i})
	# 刀者红身（2.5D RED_BODY.dur=1.5）：刚出刀的人身上带红光，
	# 1.5 秒内被看见 → saw_red（EV_W 最高权重 0.85）。
	_witness_action(k, "saw_red", k.get("pos", Vector2.ZERO))
	_log("knife", {"actor": killer_i, "victim": victim_i, "cause": "knife"})
	# RUSH 逃逸加速：绑"放倒"不绑致死（2.5D killRushStart，只给异形）
	_kill_rush_start(k)
	# 2.5D knife():4211 —— 异形作案记账（当晚要编自己的假口供 _lie）
	if bool(k.get("alien", false)):
		# @src js/game.js:4280：行凶记账 —— 45 秒内会回尸体旁收物资 / 演一场报案。
		k["_killAt"] = elapsed
		k["_killBody"] = victim_i
		k["_killDecided"] = false
	# 2.5D js/game.js:4782：DEV 玩家作案时保安机器人「没有看见你」
	if bots != null and not (dev and not spectator and killer_i == me_idx):
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


## 开枪：与出刀同一个结算入口（放倒 → 天亮前没人救则失血死），只是消耗子弹、射程 9 格。
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
	if not los_now(kp.x, kp.y, vp.x, vp.y):
		return false
	k["bullet"] = int(k.get("bullet", 0)) - 1
	# 2.5D fireShot()（js/game.js:8270-8282）：先扣子弹、先记危险行为，再进 DEV 免伤。
	if dev and not spectator and target_i == me_idx:
		if bots != null:
			bots.on_crime(shooter_i, kp)
		_dev_note("DEV 无敌：%s 的一枪没有生效" % String(k.get("name", "?")),
			{"actor": shooter_i, "victim": target_i})
		return false
	v["downed"] = true
	v["downedT"] = 0.0
	v["downedBy"] = shooter_i
	v["medTried"] = false
	v["bodyPos"] = vp
	v["downRoom"] = room_at(vp)
	v["deathCause"] = "shot"
	v["killedBy"] = shooter_i
	# 2.5D fireShot()：target.searched=false（与刀同一个「每次倒下可重搜」口径）
	v["searched"] = false
	# 2.5D fireShot：目击者按 noticeAction(7 格) 记 **saw_shot**（目击证据 0.55），
	# 不是听来的传闻；枪声另走 aiHear(20 格) 的 heard 通道（权重 0.16）。
	_witness_action(k, "saw_shot", vp)
	# 2.5D fireShot：枪声在**射手**位置广播（aiHear('shot',shooter,20,{actor,victim})）
	hear("shot", kp, 20.0, {"actor": shooter_i, "victim": target_i})
	# 开枪者红身：与出刀同一个 RED_BODY 窗口
	k["redT"] = float((cfg.get("rules", {}) as Dictionary).get("RED_BODY", {}).get("dur", 1.5))
	_witness_action(k, "saw_red", kp)
	_log("shoot", {"actor": shooter_i, "victim": target_i})
	# RUSH：开枪放倒人同样给异形加速（2.5D fireShot 里的 killRushStart）
	_kill_rush_start(k)
	if bool(k.get("alien", false)):
		# @src js/game.js:4280：枪倒同样记 _killBody（报案计划与刀共用一条链）。
		k["_killAt"] = elapsed
		k["_killBody"] = target_i
		k["_killDecided"] = false
	if bots != null and not (dev and not spectator and shooter_i == me_idx):
		bots.on_crime(shooter_i, kp)
	return true


## 把濒死者救起：取消流血倒计时，保留"这一局被救过一次"的标记
## （同一轮里不重复救同一个人，避免无人机贴着人反复刷次数）。
## method / stun 按 2.5D medbotTick 的事件口径（js/game.js:4755）；
## 玩家施救、AI 施救、医疗无人机共用这一条入口，method 默认 "manual"。
func revive(agent_i: int, method: String = "manual", stun: float = 0.0) -> bool:
	var a := agent(agent_i)
	if a.is_empty() or not bool(a.get("alive", false)) or not bool(a.get("downed", false)):
		return false
	a["downed"] = false
	a["downedT"] = 0.0
	a["deathCause"] = ""
	a["medTried"] = true
	# 2.5D medbotTick / finishDoing(revive)：救起后清 searched（每次倒下都是新一次可搜）
	a["searched"] = false
	# 2.5D：救起后短时间内站不稳（只禁移动，不禁交互 / 发言）；拖拽关系一并解除。
	if stun > 0.0:
		a["stunT"] = stun
	a["path"] = PackedVector2Array()
	a["moving"] = false
	var dragger: Variant = a.get("draggedBy", null)
	if dragger != null and int(dragger) >= 0:
		release_drag(int(dragger))
	a["draggedBy"] = null
	var p: Vector2 = a.get("pos", Vector2.ZERO)
	_log("revive", {"actor": agent_i, "victim": agent_i, "method": method,
		"stun": stun, "room": room_at(p),
		"x": snappedf(p.x, 0.1), "y": snappedf(p.y, 0.1)})
	return true


func die(v: Dictionary) -> bool:
	if v.is_empty() or not bool(v.get("alive", false)):
		return false
	# 2.5D die()（js/game.js:4287）：DEV 玩家的死亡被拦截（失血 / 处决 / 驱逐共用）。
	if dev and not spectator and int(v.get("i", -1)) == me_idx:
		_dev_note("DEV 无敌：死亡被拦截")
		return false
	v["alive"] = false
	v["downed"] = false
	# 2.5D die()：`a.alive=false; a.ghost=true;` —— 死亡即幽灵（穿墙 / 全视 /
	# 仍可做自己剩下的任务，额度 ghost_cap() 分），不是直接踢出对局。
	v["ghost"] = true
	v["deathAt"] = elapsed
	# 2.5D die() 的状态清理，逐条对齐：
	# bodyGone=(cause==='vote') / searched=false / detained=false / redT=0 / stunT=0
	# 以及两个方向的拖拽关系解除。
	v["bodyGone"] = false
	v["searched"] = false
	v["detained"] = false
	v["detainedT"] = 0.0
	v["redT"] = 0.0
	v["stunT"] = 0.0
	v["path"] = PackedVector2Array()
	v["pathI"] = 0
	v["moving"] = false
	v["doing"] = 0.0
	v["_doing"] = ""
	v["bodyPos"] = v.get("pos", Vector2.ZERO)
	var dragged_by: Variant = v.get("draggedBy", -1)
	if dragged_by != null and int(dragged_by) >= 0:
		release_drag(int(dragged_by))
	v["draggedBy"] = -1
	var dragging: Variant = v.get("drag", -1)
	if dragging != null and int(dragging) >= 0:
		release_drag(int(v.get("i", -1)))
	v["drag"] = -1
	# 2.5D deathRoom：优先用倒地房间；没有就按尸体位置补。
	v["deathRoom"] = String(v.get("downRoom", ""))
	if String(v.get("deathRoom", "")) == "":
		v["deathRoom"] = room_at(v.get("bodyPos", Vector2.ZERO))
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
## 3D 用 light_state 对齐 2.5D 的三态（0 常态 / 1 全亮 / 2 断电）。
func sight_range_at(p: Vector2) -> float:
	var S: Dictionary = (cfg.get("rules", {}) as Dictionary).get("SIGHT", {}) as Dictionary
	var dark_r := float(S.get("humanDarkR", 2.3))
	if light_state == 2:
		return dark_r
	var rid := room_at(p)
	if rid == "":
		return float(S.get("corrR", 12.0))
	var r: Dictionary = rooms_by_id.get(rid, {}) as Dictionary
	if light_state == 1 or String(r.get("light", "")) == "bright":
		var rect: Array = r.get("rect", []) as Array
		if rect.size() >= 4:
			return maxf(float(rect[2]), float(rect[3])) * float(S.get("litRoomMul", 1.15))
	return dark_r


## AI 视野判据 = 2.5D observerVisionAt（js/game.js:1784），玩家与 AI 共用同一套规则：
##   ① 同亮区（同一亮舱 / 同一亮走廊）整片可见 —— 不看距离、朝向、LOS
##   ② 亮舱 ↔ **相连**走廊：要 LOS（js/t2/space.js:71 corrJoinsRoom）
##   ③ 近身圆（人类 humanDarkR 2.3 / 异形 alienDarkR 3.5）→ 要 LOS
##   ④ 手电锥 humanLightR 7 格、半角 30° → 要 LOS
## 3D 之前只做近身圆近似，还给所有分支加了全局 LOS，与真源不符（MIGRATION §10.4
## 记的「口径差」本批按真源消除）。数值全读 sim.json#rules.SIGHT，不在此硬编码。
## 朝向来自 agentAimAng（js/game.js:1805）：AI 取 path 首点，玩家由 view 层写 aimAng，
## sim 不读鼠标（3d/ARCHITECTURE.md §3 硬规则 1）。
func ai_can_see(observer: Dictionary, p: Vector2) -> bool:
	var wp: Vector2 = observer.get("pos", Vector2.ZERO)
	var alien := bool(observer.get("alien", false))
	var aim := agent_aim_ang(observer)
	var S: Dictionary = (cfg.get("rules", {}) as Dictionary).get("SIGHT", {}) as Dictionary
	var dark_r: float = float(S.get("alienDarkR", 3.5)) if alien else float(S.get("humanDarkR", 2.3))
	var light_r := float(S.get("humanLightR", 7.0))
	var oz := lit_zone_at(wp)
	if oz != "":
		var tz := lit_zone_at(p)
		if tz == oz:
			return true
		if oz.begins_with("r:") and tz.begins_with("c:"):
			var rid := oz.substr(2)
			var c := corridor_by_id(tz.substr(2))
			if not c.is_empty() and corr_joins_room(rid, c) \
					and los_now(wp.x, wp.y, p.x, p.y):
				return true
	var d := wp.distance_to(p)
	var los_ok: bool = los_now(wp.x, wp.y, p.x, p.y)
	if d <= dark_r and los_ok:
		return true
	if d > light_r or not los_ok:
		return false
	var ang := atan2(p.y - wp.y, p.x - wp.x)
	var dd := absf(ang - aim)
	if dd > PI:
		dd = 2.0 * PI - dd
	return dd <= PI / 6.0


## 2.5D agentAimAng（js/game.js:1805）：动作 > 当前目标 > 下一段路径 > 上一次朝向。
## 3D sim 层没有 act / target 对象，取 path 首点；path 为空时用 aimAng 兜底
## （AI 由移动写入、玩家由 view 层写入，退化值与真源一样是 0）。
func agent_aim_ang(a: Dictionary) -> float:
	var path: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
	if path.size() > 0:
		# 与 tick_agents 同一口径：朝向 = 下一段路点的方向（path[pathI]），
		# 不是路径起点 path[0]（否则人一过首个路点就倒着走）。
		var pi := clampi(int(a.get("pathI", 0)), 0, path.size() - 1)
		var p0: Vector2 = path[pi]
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		var step := p0 - ap
		if step.length_squared() > 0.000001:
			return atan2(step.y, step.x)
	return float(a.get("aimAng", 0.0))


## 2.5D litZoneAt（js/game.js:10644）：亮区标识 r:<room> / c:<corridor>。
## 3D 用 rooms[].light（静态亮暗）+ power_on（断电走廊全灭，js/game.js:686 G.corrLit），
## 与 sight_range_at 同一口径，不另造第二套照明状态。
func lit_zone_at(p: Vector2) -> String:
	var rid := room_at(p)
	if rid != "":
		var r: Dictionary = rooms_by_id.get(rid, {}) as Dictionary
		if String(r.get("light", "")) == "bright":
			return "r:" + rid
		return ""
	if not power_on or nav == null:
		return ""
	var c: Variant = nav.corridor_at(p)
	if c == null:
		return ""
	return "c:" + String((c as Dictionary).get("id", ""))


func corridor_by_id(cid: String) -> Dictionary:
	for c: Dictionary in (map.get("corridors", []) as Array):
		if String(c.get("id", "")) == cid:
			return c
	return {}


## 2.5D corrJoinsRoom（js/t2/space.js:71）
func corr_joins_room(rid: String, c: Dictionary) -> bool:
	return String(c.get("a", "")) == rid or String(c.get("b", "")) == rid


## 最近的濒死者（2.5D nearestDowned：还活着但已倒地的人，可被医疗包救起）
## 2.5D nearestDowned（js/game.js:2843）：距离 + **看得见**（aiCanSee）双条件。
## observer 为空时只按距离（玩家交互项由 main.gd 自己再判一次可见）。
func nearest_downed(pos: Vector2, radius: float, observer: Dictionary = {}) -> Dictionary:
	var best: Dictionary = {}
	var bd := radius
	for a: Dictionary in agents:
		if not bool(a.get("alive", false)) or not bool(a.get("downed", false)):
			continue
		if bool(a.get("detained", false)):
			continue
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		var d := ap.distance_to(pos)
		if d >= bd:
			continue
		if not observer.is_empty() and not ai_can_see(observer, ap):
			continue
		bd = d
		best = a
	return best


## 目击通知（2.5D noticeAction 的最小实现）：
## kind 属于异形专属行为（ID_EVIDENCE）→ 亲眼者写确证；否则只按 EV_W 加嫌疑。
## 异形目击者看到异形专属行为 → markMate（2.5D js/game.js:2053：只用亲眼目击
## 推断队友，不读系统队友表 —— 大义灭亲 / 伙同投票的原料）。
func _witness_action(actor: Dictionary, kind: String, at: Vector2) -> void:
	if not speech_enabled or mind == null:
		return
	var ai := int(actor.get("i", -1))
	var sight_r: float = SpaceData.num(space, "sight", "human_light_r")
	var id_ev: Dictionary = mind.id_evidence()
	for w: Dictionary in agents:
		if int(w.get("i", -1)) == ai or bool(w.get("alien", false)):
			continue
		if not bool(w.get("alive", false)) or bool(w.get("downed", false)):
			continue
		# 2.5D watchersAt / A 批：站桩做事的人注意力不在线，不计入目击者
		if float(w.get("doing", 0.0)) > 0.0:
			continue
		var wp: Vector2 = w.get("pos", Vector2.ZERO)
		if not ai_can_see(w, at):
			continue
		mind.note_sight(int(w.get("i", -1)), ai, kind, at)
	# 异形目击者单独走一遍：看到异形专属行为 = 认出队友
	if id_ev.has(kind):
		for w2: Dictionary in agents:
			if int(w2.get("i", -1)) == ai or not bool(w2.get("alien", false)):
				continue
			if not bool(w2.get("alive", false)) or bool(w2.get("downed", false)):
				continue
			var wp2: Vector2 = w2.get("pos", Vector2.ZERO)
			if not ai_can_see(w2, at):
				continue
			var mates: Dictionary = (w2.get("mates", {}) as Dictionary).duplicate()
			mates[ai] = {"t": elapsed, "kind": kind}
			w2["mates"] = mates


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
			if not ai_can_see(w, ap):
				continue
			# seenBy：w 看见了 a（供 audSusEstimate / HUNT 记忆用）
			var sb: Dictionary = (w.get("seenBy", {}) as Dictionary).duplicate()
			sb[ai] = {"t": now}
			w["seenBy"] = sb
			# 2.5D trackNight：位置时间线 saw_agent（拆谎 / alibi 的原料）。
			# 同一个人每 0.5 秒记一条太快，节流到 ~3.5 秒一条（2.5D 同口径）。
			if now - float((w.get("_lastSaw", {}) as Dictionary).get(ai, 0.0)) >= 3.5:
				var ls: Dictionary = (w.get("_lastSaw", {}) as Dictionary).duplicate()
				ls[ai] = now
				w["_lastSaw"] = ls
				var rid := room_at(ap)
				mind.note_track(int(w.get("i", -1)), ai, ap, rid)
			# 红身目击：刚出刀的人被看见。
			# 2.5D trackNight:1352-1360：同一段红光 **5 秒内只写一次**证据
			# （redSeen 闸门）。3D 原先每 0.5 秒写一次，1.5 秒红身会写 3 条
			# saw_red（每条约 0.85 sus），证据被凭空放大 3 倍。
			if float(a.get("redT", 0.0)) > 0.0:
				var rs: Dictionary = w.get("redSeen", {}) as Dictionary
				if now - float(rs.get(ai, -999.0)) > 5.0:
					var rs2: Dictionary = rs.duplicate()
					rs2[ai] = now
					w["redSeen"] = rs2
					if not bool(w.get("alien", false)):
						mind.note_sight(int(w.get("i", -1)), ai, "saw_red", ap)
					else:
						# 2.5D trackNight:1322：红身只可能来自刚出的刀 ——
						# 异形看见红身异形 = 认出队友（markMate）
						var mates2: Dictionary = (w.get("mates", {}) as Dictionary).duplicate()
						mates2[ai] = {"t": now, "kind": "saw_red"}
						w["mates"] = mates2
			# 2.5D trackNight:1325-1340「回避可观察」：被回避者（w）在 6 格内
			# 看见「他躲我」→ saw_avoid 0.10，每夜每人只记一次。
			# _avoidHuman 是**粘性**字段（2.5D 的 startNight 也不清它）。
			if int(w.get("_avoidHuman", -1)) == ai:
				var wi := int(w.get("i", -1))
				# 记账在**观察者**身上（2.5D a.mind.avoidSeen[w.i]）：a 看见 w 在躲自己。
				var av: Dictionary = a.get("avoidSeen", {}) as Dictionary
				if int(av.get(wi, -1)) != int(night):
					if wp.distance_to(ap) <= rules.n("AVOID", "nearR", 6.0):
						var av2: Dictionary = av.duplicate()
						av2[wi] = int(night)
						a["avoidSeen"] = av2
						mind.sus_add(a, wi, rules.n("AVOID", "sus", 0.10),
							"他刚才在躲我",
							{"kind": "saw_avoid", "src": "sight",
								"night": int(night)})
						_stat("avoidSus", 1)


## 破坏：登记一处 30 秒故障；到点未修则全船进度 -faultPenalty。
## 尸体链（bodyNear / searchBody / lootBody / bodyHasLoot）已拆到 sim/body_state.gd
## （sim_state.gd 有 3600 行棘轮）；这里只保留同名入口，调用方不变。
func body_has_loot(b: Dictionary) -> bool:
	return BodyStateScript.body_has_loot(b)


func search_body(body_i: int, by: int) -> bool:
	return BodyStateScript.search(self, body_i, by)


## 玩家动作入口：2.5D 的 rescue() / sabotage() 由玩家按键触发，AI 走
## start_doing → _finish_doing 的完成链。这里把玩家的判定与记账收口到 sim，
## 免得 main.gd 再复制一份「医疗包够不够 / 今晚破坏过没」的状态（红线 11）。
func player_revive(body_i: int) -> bool:
	var me := agent(me_idx)
	if me.is_empty() or not bool(me.get("alive", false)) or bool(me.get("downed", false)):
		return false
	if int(me.get("medkit", 0)) <= 0:
		return false
	var v := agent(body_i)
	if v.is_empty() or not bool(v.get("alive", false)) or not bool(v.get("downed", false)):
		return false
	if not revive(body_i):
		return false
	me["medkit"] = int(me.get("medkit", 0)) - 1
	## 与 _finish_doing 的 "revive" 分支同口径：救人是公开的可信信号。
	if speech_enabled and mind != null:
		mind.cred_broadcast(me_idx, "revive", me.get("pos", Vector2.ZERO))
	return true


## @src js/game.js:1131 pickSabRoom（选目标）+ :1297 sabTick（抵达自动引爆）
## 3D 输入层适配（PORTING_PROTOCOL §2 允许「输入映射」差异）：
##   2.5D 是「轮盘选舱 → 走进去自动下手」两阶段；3D 是「靠近设备的交互项」单阶段。
##   这里保留 3D 的交互手感，但把两阶段语义接回来：已在目标房间 / 交互半径内 → 立即结算；
##   否则记下 sab_target，交给逐帧 sab_tick() 在抵达时引爆。
## 守卫与门槛照真源，不新增距离、次数、冷却或阵营过滤；sabUsed 仍由 sabotage_room
## 在真正下手那一刻写（@src js/game.js:1154 damageRoom `if(!designMode)a.sabUsed=true`）。
func player_sabotage(room_id: String) -> bool:
	var me := agent(me_idx)
	if me.is_empty() or not bool(me.get("alive", false)) or not bool(me.get("alien", false)):
		return false
	if bool(me.get("sabUsed", false)):
		return false
	if not sab_room_ok(room_id):
		return false
	var px := 0.0
	var py := 0.0
	for p: Dictionary in points:
		if String(p.get("room", "")) == room_id:
			px = float(p.get("x", 0.0))
			py = float(p.get("y", 0.0))
			break
	var pos: Vector2 = me.get("pos", Vector2.ZERO) as Vector2
	var reach := SpaceData.num(space, "reach", "sabotage")
	if room_at(pos) == room_id or pos.distance_to(Vector2(px, py)) < reach:
		return sabotage_room(room_id, me_idx)
	sab_target = {"room": room_id, "x": px, "y": py}
	return true


## 2.5D sabSpot（js/game.js:1098-1113）：在该舱室的**任务点**里均匀随机抽一台设备
## （2026-11-01 用户裁定，不再给硬点加权），没有任务点则退回舱室中心。
## 同一夜同舱室缓存同一个落点；开夜在 _start_night 清空。
func sab_spot_for(rid: String) -> Vector2:
	# 2.5D 的 SAB_SPOT_CACHE[rid]：命中缓存直接返回，保证同夜同舱室同一台设备。
	var hit: Variant = _sab_spots.get(rid, null)
	if hit is Vector2:
		return hit as Vector2
	var cands: Array = []
	for p: Dictionary in points:
		if String(p.get("room", "")) == rid:
			cands.append(p)
	var pt := Vector2.ZERO
	if not cands.is_empty():
		var pick: Dictionary = cands[_rng.randi_range(0, cands.size() - 1)]
		pt = Vector2(float(pick.get("x", 0.0)), float(pick.get("y", 0.0)))
	elif rooms_by_id.has(rid):
		pt = room_center(rid)
	var f: Vector2 = nav.nearest_free(pt) if nav != null else pt
	_sab_spots[rid] = f
	return f


func sabotage_room(room_id: String, by: int, ghost: bool = false) -> bool:
	if room_id == "" or room_id == "bridge":
		return false
	for d: Dictionary in dmg:
		if String(d.get("room", "")) == room_id:
			return false
	var sp: Vector2 = sab_spot_for(room_id)
	var px := sp.x
	var py := sp.y
	# 2.5D damageRoom()：`if(!G.designMode)a.sabUsed=true;` —— 每夜一次的账
	# 记在破坏入口本身，而不是调用方；否则 AI 走 sabotage_room 时不会记账。
	var sab_by := agent(by)
	if not sab_by.is_empty() and not dev:
		sab_by["sabUsed"] = true
	dmg.append({"room": room_id, "by": by, "left": 30.0, "x": px, "y": py})
	_log("sabotage", {"actor": by, "room": room_id})
	# 2.5D damageRoom：aiHear('sabotage',sp,20,{actor})
	hear("sabotage", Vector2(px, py), 20.0, {"actor": by})
	# 2.5D damageRoom：活人破坏写目击（witnessAlienAction 6 格）；
	# 幽灵不可被活人看见 → 不写目击证据（故障/警报/声音/统计照常）
	if not ghost and not sab_by.is_empty():
		_witness_action(sab_by, "saw_sabotage", Vector2(px, py))
	# @src js/game.js:1164 damageRoom：`envNotice('fault',sp.x,sp.y,0.55)`
	# 破坏 = 免费全船警铃；幽灵破坏同样广播（真源不按 ghost 过滤）。
	env_notice("fault", Vector2(px, py), 0.55)
	return true


func fix_damage(room_id: String, by: int = -1) -> bool:
	for i in range(dmg.size() - 1, -1, -1):
		var d: Dictionary = dmg[i]
		if String(d.get("room", "")) == room_id:
			dmg.remove_at(i)
			# 2.5D finishFix（js/game.js:7947-7960）：同一座故障有好几个人在赶/在修，
			# 修好的一瞬间全部松手 —— 不用把剩下的 10 秒站完，也别再往已修好的设备跑。
			for x: Dictionary in agents:
				if String(x.get("_doing", "")) == "fix" \
						and String(x.get("_item", "")) == room_id:
					x["doing"] = 0.0
					x["_doing"] = ""
					x["path"] = PackedVector2Array()
					x["moving"] = false
				var fg: Variant = x.get("_fixGo", null)
				if fg is Dictionary and String((fg as Dictionary).get("room", "")) == room_id:
					x["_fixGo"] = {}
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


#  ---------------- 门（2.5D buildDoors / doorTick / doorBlockedSegment / losNow） ----------------
# 2.5D 的门是模拟状态：它挡人（doorBlockedSegment）、挡视线与枪线（losNow）、
# 断电时要完成 2 秒扫描才放行。3D 之前门只在 scene_extras 里当装饰动画，
# sim 完全不知道门的存在 —— 于是关着的门既不挡人也不挡视线/枪线。
# 这里按 2.5D 逐行搬：几何来自 map 的 room.doors × 走廊端点匹配，数值读 space.json#door。
#

## 2.5D buildDoors（js/game.js:415）：只给「走廊端点正对的那扇舱门」生成门，
## id 是 `走廊id:舱室id`。全 22 扇门规格与 22 个走廊端点一一对应（无遗漏无重复）。
func _build_doors() -> void:
	doors = []
	var width := SpaceData.num(space, "door", "width")
	for c: Dictionary in (map.get("corridors", []) as Array):
		var pts: Array = c.get("pts", []) as Array
		if pts.size() < 2:
			continue
		var cid := String(c.get("id", ""))
		for e: Array in [[0, String(c.get("a", ""))], [pts.size() - 1, String(c.get("b", ""))]]:
			var rid := String(e[1])
			var r: Dictionary = rooms_by_id.get(rid, {}) as Dictionary
			if r.is_empty():
				continue
			var p: Array = pts[int(e[0])] as Array
			var rect: Array = r.get("rect", []) as Array
			if rect.size() < 4 or p.size() < 2:
				continue
			var best: Array = []
			var bd := 1.0e9
			for d: Array in (r.get("doors", []) as Array):
				var side := String(d[0])
				var v := float(d[1])
				if side == "t" or side == "b":
					var wy := float(rect[1]) if side == "t" else float(rect[1]) + float(rect[3])
					if absf(float(p[1]) - wy) > 0.01:
						continue
					var dd := absf(v - float(p[0]))
					if dd < bd:
						bd = dd
						best = d
				else:
					var wx := float(rect[0]) if side == "l" else float(rect[0]) + float(rect[2])
					if absf(float(p[0]) - wx) > 0.01:
						continue
					var dd2 := absf(v - float(p[1]))
					if dd2 < bd:
						bd = dd2
						best = d
			if best.is_empty():
				continue
			var side2 := String(best[0])
			var horiz := side2 == "t" or side2 == "b"
			var x := float(best[1]) if horiz else \
				(float(rect[0]) if side2 == "l" else float(rect[0]) + float(rect[2]))
			var y := (float(rect[1]) if side2 == "t" else float(rect[1]) + float(rect[3])) \
				if horiz else float(best[1])
			doors.append({
				"id": cid + ":" + rid,
				# 表现层按这个键找回自己那扇门（房间|边|坐标），不靠数组下标，
				# 避免两边遍历顺序一变就错位。
				"key": "%s|%s|%.3f" % [rid, side2, float(best[1])],
				"room": rid, "x": x, "y": y, "horiz": horiz, "w": width,
				"open": 0.0, "scan_t": 0.0,
				"x1": x - width * 0.5 if horiz else x,
				"y1": y if horiz else y - width * 0.5,
				"x2": x + width * 0.5 if horiz else x,
				"y2": y if horiz else y + width * 0.5,
			})


## 2.5D doorTick（js/game.js:448）：断电时全船每扇门都要 2 秒安检扫描才放行；
## 人离开重新上锁；恢复供电立即解除。滞回半径（open_r 3.0 / close_r 3.6）照抄。
func door_tick(dt: float) -> void:
	if doors.is_empty() or not meeting.is_empty() or over:
		return
	var blackout := light_state == 2
	var open_r := SpaceData.num(space, "door", "open_r")
	var close_r := SpaceData.num(space, "door", "close_r")
	var speed := SpaceData.num(space, "door", "speed")
	var scan_sec := SpaceData.num(space, "door", "scan_sec")
	for d: Dictionary in doors:
		var scan_rule := blackout
		var range_r := close_r if scan_rule else (close_r if float(d["open"]) > 0.02 else open_r)
		var busy := false
		for a: Dictionary in agents:
			if not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
					or bool(a.get("detained", false)):
				continue
			if (a.get("pos", Vector2.ZERO) as Vector2).distance_to(
					Vector2(float(d["x"]), float(d["y"]))) < range_r:
				busy = true
				break
		var target := 0.0
		if not scan_rule:
			d["scan_t"] = 0.0
			target = 1.0 if busy else 0.0
		elif not busy:
			d["scan_t"] = 0.0
		else:
			d["scan_t"] = minf(scan_sec, float(d["scan_t"]) + dt)
			target = 1.0 if float(d["scan_t"]) >= scan_sec else 0.0
		var prev := float(d["open"])
		if float(d["open"]) < target:
			d["open"] = minf(target, float(d["open"]) + dt * speed)
		elif float(d["open"]) > target:
			d["open"] = maxf(target, float(d["open"]) - dt * speed)
		# 2.5D doorAutoSound：完全开 / 完全关各响一次，滑动中途不响。
		# 声音是**玩法输入**（附近 AI 听得见），不是纯表现，所以放在 sim。
		# 2.5D doorAutoSound 不写事件流（复盘里没有门事件），所以这里也不 _log：
		# AI 听觉（hear）是玩法输入，事件流是只读旁路，两者不混。
		if (prev < 1.0 and float(d["open"]) >= 1.0) or (prev > 0.0 and float(d["open"]) <= 0.0):
			hear("door", Vector2(float(d["x"]), float(d["y"])), 7.0)


## 2.5D doorBlockedSegment（js/game.js:484）：这一步会不会穿门。
## 断电期间只要扫描没满就一定拦（会议室也不再豁免）；否则门没开过 pass 也拦。
func door_blocked_segment(x1: float, y1: float, x2: float, y2: float) -> bool:
	if doors.is_empty() or nav == null:
		return false
	var a := Vector2(x1, y1)
	var b := Vector2(x2, y2)
	var pass_r := SpaceData.num(space, "door", "pass")
	var scan_sec := SpaceData.num(space, "door", "scan_sec")
	for d: Dictionary in doors:
		var da := Vector2(float(d["x1"]), float(d["y1"]))
		var db := Vector2(float(d["x2"]), float(d["y2"]))
		if not nav.seg_x(a, b, da, db):
			continue
		if light_state == 2 and float(d["scan_t"]) < scan_sec:
			return true
		if float(d["open"]) > pass_r:
			continue
		return true
	return false


## 2.5D losNow（js/game.js:495）：墙/掩体视线 **且** 没有关着的门。
## 玩家 (visibleAt)、AI (aiCanSee)、枪线 (fireShot)、听觉置信 (aiHear) 共用这一条。
func los_now(x1: float, y1: float, x2: float, y2: float) -> bool:
	if nav == null:
		return true
	var a := Vector2(x1, y1)
	var b := Vector2(x2, y2)
	if not nav.los(a, b):
		return false
	if doors.is_empty():
		return true
	var pass_r := SpaceData.num(space, "door", "pass")
	for d: Dictionary in doors:
		if float(d["open"]) > pass_r:
			continue
		if nav.seg_x(a, b, Vector2(float(d["x1"]), float(d["y1"])),
				Vector2(float(d["x2"]), float(d["y2"]))):
			return false
	return true


# ---------------- 通用小工具（2.5D 同名函数的逐行移植） ----------------

## 2.5D nightMeetLeft（js/t2/decision.js:154）：本夜还能开几场会。
## 在消耗报告额度之前必须先问这一句。
func night_meet_left() -> int:
	if over or not meeting.is_empty():
		return 0
	return maxi(0, int((cfg.get("rules", {}) as Dictionary).get("MEET", {})
		.get("perNight", 2)) - night_meets)


## 2.5D sabRoomOk（js/game.js:1065）：可破坏的舱室 = 存在 + 不是会议室 + 没有未修复故障。
func sab_room_ok(rid: String) -> bool:
	if rid == "" or rid == "bridge" or not rooms_by_id.has(rid):
		return false
	for d: Dictionary in dmg:
		if String(d.get("room", "")) == rid:
			return false
	return true


## 2.5D watchersAt（js/game.js:3183）：数"有几个人能看见这一下"。
## 半径取 max(调用方 rad, HUMAN_LIGHT_R, sightRangeAt) —— 亮舱整间可见，
## 调用方的 rad 只是"我至少关心这么远"；注意力不在网上的人不计入。
func watchers_at(a: Dictionary, at: Vector2, rad: float, except_i: int = -1) -> Array:
	var out: Array = []
	var r := maxf(maxf(rad, SpaceData.num(space, "sight", "human_light_r")),
		sight_range_at(at))
	for w: Dictionary in agents:
		var wi := int(w.get("i", -1))
		if w == a or wi == except_i or not bool(w.get("alive", false)) \
				or bool(w.get("downed", false)) or bool(w.get("detained", false)):
			continue
		# 2.5D attention(w) != 'online'：站桩做事的人看不见，不计入观众表
		if float(w.get("doing", 0.0)) > 0.0:
			continue
		if (w.get("pos", Vector2.ZERO) as Vector2).distance_to(at) > r:
			continue
		if not ai_can_see(w, at):
			continue
		out.append(w)
	return out


## 2.5D recentWitness（js/game.js:3121）：最近 sec 秒内有没有活人看见过我。
## 3D 的 seenBy 存在观察者身上（w.seenBy = 我看见过谁），语义与 2.5D 方向相反但等价。
func recent_witness(a: Dictionary, sec: float) -> bool:
	var ai := int(a.get("i", -1))
	for w: Dictionary in agents:
		if not bool(w.get("alive", false)) or bool(w.get("downed", false)):
			continue
		var seen: Dictionary = w.get("seenBy", {}) as Dictionary
		if not seen.has(ai):
			continue
		var rec: Dictionary = seen[ai] as Dictionary
		if elapsed - float(rec.get("t", 0.0)) < sec:
			return true
	return false


## 2.5D secbotRaidOk（js/game.js:8365）：拆保安的前置条件。
##   · 认出 ≥2 名 8 格内的活队友；· 保安 8 格内有活人（非队友）目标；
##   · 至少一名队友也在朝目标靠（≤7 格）；· 围攻成立也只有 0.45 概率动手。
func secbot_raid_ok(a: Dictionary, sec_pos: Vector2) -> bool:
	if a.is_empty() or not bool(a.get("alive", false)) or bool(a.get("downed", false)):
		return false
	var mates := 0
	for k: Variant in (a.get("mates", {}) as Dictionary).keys():
		var m: Dictionary = agent(int(k))
		if m.is_empty() or not bool(m.get("alive", false)) or bool(m.get("downed", false)) \
				or bool(m.get("detained", false)):
			continue
		if (m.get("pos", Vector2.ZERO) as Vector2).distance_to(sec_pos) <= 8.0:
			mates += 1
	if mates < 2:
		return false
	for v: Dictionary in agents:
		var vi := int(v.get("i", -1))
		if v == a or not bool(v.get("alive", false)) or bool(v.get("downed", false)) \
				or bool(v.get("detained", false)) or bool(v.get("alien", false)):
			continue
		if (v.get("pos", Vector2.ZERO) as Vector2).distance_to(sec_pos) > 8.0:
			continue
		for k2: Variant in (a.get("mates", {}) as Dictionary).keys():
			var m2: Dictionary = agent(int(k2))
			if m2.is_empty() or not bool(m2.get("alive", false)) or bool(m2.get("downed", false)) \
					or bool(m2.get("detained", false)):
				continue
			var m2p: Vector2 = m2.get("pos", Vector2.ZERO)
			if m2p.distance_to(sec_pos) > 8.0:
				continue
			# 0.45（2.5D 2026-11-02：围攻成立也有一半以上概率放弃，拆保安是偶发事件）
			if m2p.distance_to(v.get("pos", Vector2.ZERO)) <= 7.0:
				return _rng.randf() < 0.45
	return false


# ---------------- 尸体扫描 / 报告（2.5D aiScanBodies，js/game.js:2524） ----------------
# 对所有活着的 AI（人类 + 异形）共用一条扫描链：
#   每 0.5s 找 5.4 格内看得见的未报告尸体 -> observeBody 记忆 ->
#   缺物资/要取证就先搜（STAND.search）-> 否则按 reportT 延迟拉铃
#   （拉铃前还要过 canReportBody：额度 / 夜场名额 / 异形的误导收益）。
# 3D 之前异形用的是自造的 35%/20% 概率报告，本函数按 2.5D 逐行替换。
func scan_bodies(a: Dictionary, dt: float) -> void:
	var ai := int(a.get("i", -1))
	if not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
			or bool(a.get("detained", false)) or over:
		return
	# 正在拖尸 / 正按计划"绕一圈再回来报告"时，不让扫描抢先拉铃
	# （2.5D `if(a.drag!=null||a._reportPlan)return;`）
	if int(a.get("drag", -1)) >= 0 or not (a.get("_reportPlan", {}) as Dictionary).is_empty():
		return
	var rt := float(a.get("_reportT", 0.0))
	if rt > 0.0:
		a["_reportT"] = rt - dt
		if float(a.get("_reportT", 0.0)) > 0.0:
			return
		var vi := int(a.get("_reportBody", -1))
		a["_reportBody"] = -1
		if vi < 0 or over or not meeting.is_empty():
			return
		var v: Dictionary = agent(vi)
		if v.is_empty() or bool(v.get("bodyReported", false)):
			return
		var bp: Vector2 = v.get("bodyPos", Vector2.ZERO)
		# 2.5D：5.8 格内 + 还看得见才真的拉铃；额度/夜场名额在 canReportBody 已筛过
		if (a.get("pos", Vector2.ZERO) as Vector2).distance_to(bp) <= 5.8 \
				and ai_can_see(a, bp) and can_report_body(a, v):
			a["reportLeft"] = maxi(0, int(a.get("reportLeft", 0)) - 1)
			v["bodyReported"] = true
			_stat("reportsUsed", 1)
			open_meeting_kind(MEET_NIGHT, ai, vi)
		return
	a["_scanT"] = float(a.get("_scanT", 0.0)) + dt
	if float(a.get("_scanT", 0.0)) < 0.5:
		return
	a["_scanT"] = 0.0
	var best: Dictionary = {}
	var bd := 5.4
	for v: Dictionary in agents:
		if v == a:
			continue
		if bool(v.get("bodyGone", false)) or bool(v.get("bodyReported", false)):
			continue
		if bool(v.get("alive", false)) and not bool(v.get("downed", false)):
			continue
		var bp: Vector2 = v.get("bodyPos", v.get("pos", Vector2.ZERO))
		var d := (a.get("pos", Vector2.ZERO) as Vector2).distance_to(bp)
		if d < bd and ai_can_see(a, bp):
			bd = d
			best = v
	if best.is_empty():
		# 2.5D `if(!best){a._sawBody=null;return;}`
		a["_sawBody"] = -1
		return
	if mind != null:
		mind.note_body_seen(a, int(best.get("i", -1)))
	# 搜查 / 翻尸（2.5D：要取证的人类、缺物资的任何 AI 都会停下来搜一次）
	var want_loot := ai_wants_loot(a, best)
	var want_evidence: bool = not bool(a.get("alien", false)) \
		and not bool(best.get("searched", false))
	var busy_search := false
	for x: Dictionary in agents:
		if x != a and String(x.get("_doing", "")) == "search" \
				and int(x.get("_sv", -1)) == int(best.get("i", -1)):
			busy_search = true
			break
	var rescue: bool = int(a.get("medkit", 0)) > 0 and bool(best.get("alive", false)) \
		and bool(best.get("downed", false))
	# 3D 的 draggedBy 有 null 与 -1 两种空值（历史遗留）；2.5D `best.draggedBy==null` 两者都算空。
	var best_db: Variant = best.get("draggedBy", null)
	var best_free: bool = best_db == null or int(best_db) < 0
	# 2.5D 同一条件还要求 `!a._fixGo&&!a._lightGo`：正在去修故障/合闸的人
	# 不会被路边尸体拽住（3D 之前缺这两条，抢修的人会被搜尸打断）。
	if not rescue and not busy_search and int(a.get("drag", -1)) < 0 \
			and best_free and bd < SpaceData.num(space, "reach", "body") \
			and float(a.get("doing", 0.0)) <= 0.0 \
			and (a.get("_fixGo", {}) as Dictionary).is_empty() \
			and not bool(a.get("_lightGo", false)) and (want_evidence or want_loot):
		start_doing(ai, "search", SpaceData.num(space, "stand", "search"), -1, "")
		a["_sv"] = int(best.get("i", -1))
		return
	if can_report_body(a, best):
		var alien := bool(a.get("alien", false))
		a["_sawBody"] = int(best.get("i", -1))
		a["_reportT"] = (2.0 if alien else 1.4) + _rng.randf() * (2.0 if alien else 1.6)
		a["_reportBody"] = int(best.get("i", -1))


## 2.5D aiWantsLoot（js/game.js:2144）逐行：目标必须是死者或濒死者；
## 缺弹 / 缺医疗包 / 缺申请单（qual<2 且目标身上或其未领申请单有货）三者其一；
## 异形不搜已认出的队友。
func ai_wants_loot(a: Dictionary, b: Dictionary) -> bool:
	if a.is_empty() or b.is_empty():
		return false
	if bool(a.get("alien", false)) and mind != null \
			and mind._is_mate(a, int(b.get("i", -1))):
		return false
	if bool(b.get("alive", false)) and not bool(b.get("downed", false)):
		return false
	if int(a.get("bullet", 0)) < 1 and int(b.get("bullet", 0)) > 0:
		return true
	if int(a.get("medkit", 0)) < 1 and int(b.get("medkit", 0)) > 0:
		return true
	if int(a.get("qual", 0)) < 2 and (int(b.get("qual", 0)) > 0 \
			or int(b.get("qualPending", 0)) > 0):
		return true
	return false


## 2.5D canReportBody（js/game.js:2621）：额度 / 夜场名额 / 濒死与尸体分开判。
func can_report_body(a: Dictionary, v: Dictionary) -> bool:
	if int(a.get("reportLeft", 0)) <= 0 or night_meet_left() <= 0:
		return false
	if bool(v.get("alive", false)) and bool(v.get("downed", false)):
		# 濒死者不是尸体：人类只有掌握线索/高警觉才拉铃，异形只在没人看着时拉
		if bool(a.get("alien", false)):
			return not recent_witness(a, 20.0)
		if mind != null:
			if not mind.best_known_target(a).is_empty():
				return true
			if float(a.get("alert", 0.0)) >= 0.4:
				return true
			return not mind.top_sus(a, 0.45).is_empty()
		return false
	# 尸体：异形按误导收益算一次并记 memo（每具尸体只采样一次）；人类照常报告
	if bool(a.get("alien", false)):
		var memo: Dictionary = a.get("_reportMemo", {}) as Dictionary
		var vi := int(v.get("i", -1))
		if not memo.has(vi):
			memo[vi] = alien_report_worth(a, v) >= rules.n("MISLEAD", "threshold", 0.3)
			a["_reportMemo"] = memo
		return bool(memo[vi])
	return true


## 2.5D alienReportWorth（js/game.js:2591）：异形报告的误导收益。
## 收益 = 现成靶子 + 可栽赃的人 - 自己的牵连风险；风险 = 现场有人看着 / 刚被看见；
## 稀缺 = 报告额度与夜场名额。公开热度只看**当众指认**（2026-11-05 反读心裁定）。
func alien_report_worth(a: Dictionary, v: Dictionary) -> float:
	var hot := 0
	var clean := 0
	if mind != null:
		for w: Dictionary in agents:
			var wi := int(w.get("i", -1))
			if w == a or not bool(w.get("alive", false)) or bool(w.get("downed", false)) \
					or bool(w.get("alien", false)):
				continue
			var heat: float = mind.public_heat(wi)
			if heat >= rules.n("MISLEAD", "hotSus", 0.35):
				hot += 1
			elif heat <= 0.12:
				clean += 1
	var self_sus: float = mind.public_heat(int(a.get("i", -1))) if mind != null else 0.0
	# 暴露风险：案发 7 格内非队友的观众数（watchersAt 同口径）
	var wit := 0
	for w: Dictionary in watchers_at(a, v.get("bodyPos", Vector2.ZERO), 7.0,
			int(v.get("i", -1))):
		if mind == null or not mind._is_mate(a, int(w.get("i", -1))):
			wit += 1
	var risk := 1.0
	if wit >= 2:
		risk = rules.n("MISLEAD", "riskWatch2", 0.3)
	elif wit == 1:
		risk = rules.n("MISLEAD", "riskWatch1", 0.6)
	# 刚被人看见过（25 秒内）就先别抛头露面
	var seen: float = rules.n("MISLEAD", "seenPenalty", 0.45) if recent_witness(a, 25.0) else 1.0
	# 每只异形一个固定倾向（开局抽好，避免同一只永远同一套打法）
	var bias: float = float(a.get("_stallBias", 1.0))
	var left := maxi(0, int(a.get("reportLeft", 0)))
	var scarce := 1.0 if left >= 2 else (0.55 if left == 1 else 0.0)
	var meet_scarce := 0.7 if night_meet_left() <= 1 else 1.0
	var frame: float = rules.n("MISLEAD", "base", 0.4) \
		+ rules.n("MISLEAD", "hotGain", 0.2) * minf(rules.n("MISLEAD", "hotMax", 3), hot) \
		+ rules.n("MISLEAD", "cleanGain", 0.08) * minf(rules.n("MISLEAD", "cleanMax", 4), clean) \
		- rules.n("MISLEAD", "selfRisk", 0.3) * minf(1.0, self_sus)
	return maxf(0.0, frame) * risk * seen * bias * scarce * meet_scarce


# ---------------- 幽灵（2.5D aiGhost，js/game.js:2371） ----------------
# 死者不是出局：
#   · 异形幽灵 = 全局仅限一次的正统破坏（ghost 模式：故障真实、不写目击证据），
#     之后 2.4 格/秒游荡；
#   · 人类幽灵 = 额度内继续做自己的任务（6.5 格/秒），做完/额度尽 -> 2.4 格/秒巡舱。
# 玩家幽灵由 view 层（player.gd set_ghost）自己驱动，这里只跑 AI。
func _ghost_tick(a: Dictionary, dt: float) -> void:
	var i := int(a.get("i", -1))
	# 站桩照常推进（人类幽灵可以站着做任务；幽灵破坏没有站桩）
	if float(a.get("doing", 0.0)) > 0.0:
		a["doing"] = float(a.get("doing", 0.0)) - dt
		if float(a.get("doing", 0.0)) <= 0.0:
			a["doing"] = 0.0
			_finish_doing(a)
			return
	if bool(a.get("alien", false)):
		if not over and meeting.is_empty() and not alien_ghost_sab_used \
				and not bool(a.get("sabUsed", false)):
			var rooms: Array = []
			for rid: String in rooms_by_id.keys():
				if sab_room_ok(rid):
					rooms.append(rid)
			if not rooms.is_empty():
				var rid: String = rooms[_rng.randi_range(0, rooms.size() - 1)]
				if sabotage_room(rid, i, true):
					alien_ghost_sab_used = true
					_stat("ghostSabotages", 1)
		# 2.5D：破坏之后继续游荡，不再原地待机
		_ghost_roam(a, dt, 2.4)
		return
	# 人类幽灵：额度内继续做任务（2.5D aiGhost：赶路 6.5 格/秒，额度尽/做完才 2.4 游荡）
	var tasks: Array = a.get("tasks", []) as Array
	if float(a.get("_pathCD", 0.0)) > 0.0:
		a["_pathCD"] = maxf(0.0, float(a.get("_pathCD", 0.0)) - dt)
	if int(a.get("ghostPts", 0)) < ghost_cap() and int(a.get("tIdx", 0)) < tasks.size():
		var pi := int(tasks[int(a.get("tIdx", 0))])
		var p: Dictionary = point(pi)
		if not p.is_empty():
			var tp := Vector2(float(p.get("x", 0.0)), float(p.get("y", 0.0)))
			var ap: Vector2 = a.get("pos", Vector2.ZERO)
			if ap.distance_to(tp) < 2.8:
				if can_do_task(pi, i):
					# 2.5D startTask(a,p,true)：幽灵站桩 = 任务时长 ×1.6，结算走同一条链
					start_doing(i, "task", float(p.get("dur", 6.0)) * 1.6, pi)
					return
			else:
				if (a.get("path", PackedVector2Array()) as PackedVector2Array).is_empty() \
						and float(a.get("_pathCD", 0.0)) <= 0.0:
					if not set_path(i, tp):
						a["_pathCD"] = 1.2
				# 2.5D aiGhost：`stepMove(a,dt,6.5)` —— 赶去做自己的剩余任务
				_ghost_move(a, dt, 6.5)
				return
	_ghost_roam(a, dt, 2.4)


func _ghost_roam(a: Dictionary, dt: float, sp: float) -> void:
	# 2.5D walkTo 的冷却（js/game.js:798）：不可达目标不要每帧重跑 A* ——
	# 幽灵死在掩体/墙里时 set_path 可能永远失败，没有冷却就是每帧一次全图 A*。
	if float(a.get("_pathCD", 0.0)) > 0.0:
		a["_pathCD"] = maxf(0.0, float(a.get("_pathCD", 0.0)) - dt)
		_ghost_move(a, dt, sp)
		return
	if (a.get("path", PackedVector2Array()) as PackedVector2Array).is_empty():
		var rooms: Array = map.get("rooms", []) as Array
		if rooms.is_empty():
			return
		var rr: Dictionary = rooms[_rng.randi_range(0, rooms.size() - 1)]
		if not set_path(int(a.get("i", -1)), room_center(String(rr.get("id", "")))):
			a["_pathCD"] = 1.2
	_ghost_move(a, dt, sp)


## 幽灵位移：freeFly（不查门、不查墙），其余与 stepMove 同构。
func _ghost_move(a: Dictionary, dt: float, sp: float) -> void:
	var path: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
	if path.is_empty():
		return
	var remain := sp * dt
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


#  ---------------- 听觉（2.5D aiHear，js/game.js:1827） ----------------
# 3D 之前只往 a.noise 写一个点、**不写任何证据**：
# 隔墙听见有人出刀 / 拉闸 / 钻管道，在 3D 里完全不留痕迹（2.5D 会记 heard_# 并加嫌疑）。
# 这里按 2.5D 原样：距离衰减 × 视线（听得见 = 1.0，隔墙 0.72），
# 最低 0.12；EV_W 里有对应权重且给了 subj 才 susAdd。
#
func hear(kind: String, at: Vector2, rad: float, extra: Dictionary = {}) -> void:
	if over or not meeting.is_empty():
		return
	var actor: Variant = extra.get("actor", null)
	var subj := int(extra.get("subj", -1))
	var victim: Variant = extra.get("victim", null)
	var ev_w: Dictionary = rules.constant("EV_W") as Dictionary if rules != null else {}
	for a: Dictionary in agents:
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
				or bool(a.get("detained", false)):
			continue
		if actor is Dictionary and actor == a:
			continue
		if actor is int and int(actor) == int(a.get("i", -1)):
			continue
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		var d := ap.distance_to(at)
		if d > rad:
			continue
		var los_ok := los_now(ap.x, ap.y, at.x, at.y)
		var conf := maxf(0.12, 1.0 - d / rad) * (1.0 if los_ok else 0.72)
		# @src js/t2/ai.js:333-337 evPush：**conf>0.25 的 heard_# 才**提警觉并写 noise 槽。
		# 3D 之前不分 conf 一律写，等于把 0.12 的远处门声也当成"值得去看一眼的动静"。
		if conf > 0.25:
			a["alert"] = minf(1.0, float(a.get("alert", 0.0)) + conf * 0.35)
			a["noise"] = {"x": at.x, "y": at.y, "t": elapsed, "night": int(night),
				"kind": "heard_" + kind, "conf": snappedf(conf, 0.01)}
		if mind == null or subj < 0:
			continue
		var w := float(ev_w.get("heard_" + kind, 0.0)) if not ev_w.is_empty() else 0.0
		if w <= 0.0:
			continue
		var ev := {"kind": "heard_" + kind, "x": at.x, "y": at.y, "room": room_at(at),
			"subj": subj, "conf": snappedf(conf, 0.01), "src": "sound",
			"victim": victim, "night": int(night)}
		mind.sus_add(a, subj, w * conf, "heard_" + kind, ev)


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
	return BodyStateScript.body_near(self, pos, radius)


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
	# 2.5D openMeeting：案发地点按**尸体 / 濒死者当前身体位置**算（清场前），
	# 会议信息行要显示「报告地点」；走廊与未知区域分开标（js/game.js:6908-6911）。
	var meet_room := ""
	var meet_in_corr := false
	if not v.is_empty():
		var bp: Vector2 = v.get("bodyPos", v.get("pos", Vector2.ZERO))
		meet_room = room_at(bp)
		if meet_room == "" and nav != null and nav.corridor_at(bp) != null:
			meet_in_corr = true
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
	meet_seq += 1
	meeting = {
		"kind": kind, "phase": "discuss", "t": discuss_sec,
		"vote_sec": vote_sec, "reveal_sec": reveal_sec,
		"reporter": reporter_i, "victim": victim_i, "votes": {}, "result": {},
		"room": meet_room, "in_corr": meet_in_corr, "seq": meet_seq,
		"discuss_sec": discuss_sec,
		# 带头追责（2.5D ctx.lead，js/game.js:5181/5252/5294/5321）：
		# 目标 → **第一个带节奏的席位**。3D 之前从不写这张表，
		# 结算时 settle_accountability 只能退回「第一个投票的人」，追责打错人。
		"lead": {},
	}
	_log("meeting", {"mkind": kind, "reporter": reporter_i, "victim": victim_i})
	if kind == MEET_NIGHT:
		_log("report", {"actor": reporter_i, "victim": victim_i})
		_quick_report_sus(reporter_i, victim_i)
	if speech_enabled and speech != null:
		speech.on_meeting_open(reporter_i, victim_i, kind)
	# 手里有确证 / 准-确证的人，会议一开始就把票压上（2.5D castEarlyVotes）。
	if speech_enabled and mind != null:
		cast_early_votes()
	return true


## 报案太快（2.5D js/game.js:5030-5041）：夜会、死者刚倒下 ≤10 秒时，
## **先看见过这具尸体**的人类会怀疑报案人「是不是他干的」。
## 权重 0.24，reason/kind 都是 quick_report；不写 known。
func _quick_report_sus(reporter_i: int, victim_i: int) -> void:
	if mind == null or reporter_i < 0 or victim_i < 0:
		return
	var reporter := agent(reporter_i)
	var victim := agent(victim_i)
	if reporter.is_empty() or victim.is_empty():
		return
	if not bool(reporter.get("alive", false)):
		return
	var t_death := float(victim.get("downAt", victim.get("deathAt", 0.0)))
	var age := maxf(0.0, elapsed - t_death)
	if age > 10.0:
		return
	for w: Dictionary in agents:
		if int(w.get("i", -1)) == reporter_i or bool(w.get("alien", false)) \
				or not bool(w.get("alive", false)) or bool(w.get("downed", false)):
			continue
		if not (w.get("bodySeen", {}) as Dictionary).has(victim_i):
			continue
		mind.sus_add(w, reporter_i, 0.24, "quick_report",
			{"kind": "quick_report", "src": "vote"})


## 尸体观察（2.5D observeBody）：看见尸体的人类记一条「见过」。
func note_body(witness_i: int, victim_i: int) -> void:
	if mind == null or witness_i < 0 or victim_i < 0 or witness_i == victim_i:
		return
	var w := agent(witness_i)
	var v := agent(victim_i)
	if w.is_empty() or v.is_empty() or bool(v.get("alive", false)):
		return
	mind.note_body_seen(w, victim_i)


## 带头追责登记（2.5D ctx.lead）：只记**第一个**带节奏的人，后来的不覆盖。
func note_accuse(accuser_i: int, target_i: int) -> void:
	if meeting.is_empty() or accuser_i < 0 or target_i < 0 or accuser_i == target_i:
		return
	var lead: Dictionary = (meeting.get("lead", {}) as Dictionary)
	if lead.has(target_i):
		return
	lead[target_i] = accuser_i
	meeting["lead"] = lead


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
	# @src js/game.js:4509 dawn：`G.sabTarget=null` —— 未引爆的目标随夜结束作废。
	sab_target = {}
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
			a2["draggedBy"] = -1
	# 开白天全员会议。
	open_meeting_kind(MEET_DAY, -1, -1)


## 在 bridge 房间里随机取一个可行走点（2.5D randIn(br) 的等价物）。
## 2.5D 采样的是 **rect 内的随机点**（js/game.js:340-347），旧实现只采 poly 顶点：
## 顶点全在墙线上、is_free 永假，200 次后必然落到同一个 label 点 ——
## 天亮时所有活人叠在一格上，看起来就是「AI 全卡住了」。
func _rand_in_bridge() -> Vector2:
	var bridge: Dictionary = rooms_by_id.get("bridge", {}) as Dictionary
	var rect: Array = bridge.get("rect", []) as Array
	if rect.size() < 4:
		var lab: Array = bridge.get("label", [31.0, 33.5]) as Array
		return Vector2(float(lab[0]), float(lab[1]))
	var x0 := float(rect[0])
	var y0 := float(rect[1])
	var w := float(rect[2])
	var h := float(rect[3])
	for _k in 200:
		var pos := Vector2(x0 + _rng.randf() * w, y0 + _rng.randf() * h)
		if nav != null and nav.is_free(pos):
			return pos
	var center := Vector2(x0 + w * 0.5, y0 + h * 0.5)
	return nav.nearest_free(center) if nav != null else center


## 玩家（或旁观快进）可以提前结束讨论，讨论秒数仍取自真源，不写死。
func skip_discussion() -> bool:
	if meeting.is_empty() or String(meeting.get("phase", "")) != "discuss":
		return false
	meeting["t"] = 0.0
	return true


## 「跳过投票」（2.5D #m-skip-vote，js/game.js:10898-10903）：
## 只结束剩余投票时间；**已经投给谁就保留那一票**，没投才记弃权（-1）。
## 不修改任何 AI 票，也不是第二种票。仅可行动者（活着且未濒死）能用。
func skip_vote() -> bool:
	if meeting.is_empty() or String(meeting.get("phase", "")) != "vote":
		return false
	if spectator:
		return false
	var me := agent(me_idx)
	if me.is_empty() or not bool(me.get("alive", false)) or bool(me.get("downed", false)):
		return false
	var votes: Dictionary = meeting.get("votes", {})
	if not votes.has(me_idx):
		votes[me_idx] = -1
		meeting["votes"] = votes
	_close_meeting()
	return true


func cast_vote(voter_i: int, target_i: int) -> void:
	# 2.5D 2026-11-05 用户裁定：**讨论阶段就可以投，投票结束前都可以改**
	# （js/game.js:7436-7439）。m.votes 从会议开始就存在，只有 closeVote 才结算，
	# 所以早投不会提前锁定。3D 原先只在 vote 相位收票，等于没有「听完再改票」。
	if meeting.is_empty():
		return
	var phase := String(meeting.get("phase", ""))
	if phase != "vote" and phase != "discuss":
		return
	var v := agent(voter_i)
	if v.is_empty() or not bool(v.get("alive", false)) or bool(v.get("downed", false)):
		return
	var votes: Dictionary = meeting.get("votes", {})
	var had_vote: bool = votes.has(voter_i)
	var prev_vote: int = int(votes.get(voter_i, -1))
	var tgt := target_i
	if tgt >= 0:
		var t := agent(tgt)
		if t.is_empty() or not bool(t.get("alive", false)):
			tgt = -1
	votes[voter_i] = tgt
	meeting["votes"] = votes
	# 2.5D logEvent('vote_change')（js/game.js:7398）只在**真的改票**时记，并带 from。
	# 3D 此前把 `votes.has(voter_i)` 写在赋值之后，恒为 true —— 每一票都被记成改票；
	# 第七批按真源修正。讨论期陆续投 + 跟票的完整时序仍是已知缺口，见 PORT-DIFF-AUDIT.md。
	if had_vote and prev_vote != tgt:
		# 2.5D logEvent('vote_change')（js/game.js:7398）只在**真的改票**时记，并带 from。
		# 首投不在这里记：终票由 _close_meeting 统一按 seq 落账（js/game.js:7669-7672）。
		_log("vote_change", {"actor": voter_i, "from": prev_vote, "target": tgt,
			"seq": int(meeting.get("seq", 0))})


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
	# 2.5D 情绪先于从众（js/game.js:7487-7499）：被当众咬狠了（grudge≥0.6），
	# 激进的人大概率把票砸回去。只读自己的 grudge，不读对方内心。
	if speech_enabled and mind != null:
		var emo: Dictionary = mind.best_grudge(a)
		var ei := int(emo.get("i", -1))
		if ei >= 0 and pool.has(ei) and float(emo.get("score", 0.0)) >= 0.6 \
				and _rng.randf() < mind.trait_c("voteGrudgePull", a) / 10.0:
			_stat("grudgeVotes", 1)
			return ei
	if bool(a.get("alien", false)):
		# 2.5D startVote 异形分支（js/game.js:7409 起）：
		# ① 票跟公开口供一致（构陷/反咬/大义灭亲都写 accuse —— 嘴上说是 A、票上写 B 会穿帮）
		var my_accuse := int(a.get("accuse", -1))
		var acc_t := agent(my_accuse) if my_accuse >= 0 else {}
		if my_accuse >= 0 and not acc_t.is_empty() and bool(acc_t.get("alive", false)) \
				and not bool(acc_t.get("downed", false)) and not _is_mate(a, my_accuse) \
				and int(a.get("_busTarget", -1)) != my_accuse:
			return my_accuse
		# ② 顺势踩软靶（SOCIAL.pileOn 0.40，2026-11-08 第三批重装）：
		#    只数**软指控**（指控者对该目标没有 known）—— 被确证咬的基本是真异形，
		#    跟上去等于送队友；被"没硬证"咬的热靶才是可以放大成冤案的对象。
		if speech_enabled and mind != null:
			var hot := _soft_hot_target(a)
			var sc2: Dictionary = (lines_data.data.get("rules", {}) as Dictionary).get("SOCIAL", {}) as Dictionary
			if hot >= 0 and _rng.randf() < float(sc2.get("pileOn", 0.4)):
				_stat("alienPileOns", 1)
				return hot
		# ③ 退回随机人类（保留 8% 探索口径的等价行为：不 argmax）
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
		if not am.is_empty() and pool.has(int(am.get("i", -1))) \
				and not mind.is_patron(a, int(am.get("i", -1))):
			return int(am.get("i", -1))
		var pub_target := int(a.get("accuse", -1))
		if pub_target < 0:
			pub_target = _public_accuse_target(a)
		if pub_target >= 0 and pool.has(pub_target) \
				and not mind.is_patron(a, pub_target):
			return pub_target
		# 2.5D bestSusTarget：综合嫌疑（a.sus），不再读 3D 自造的 suspect 计数字典
		var bs: Dictionary = mind.best_sus_target(a, rule_f("ALMOST", "foeSus"))
		if not bs.is_empty() and pool.has(int(bs.get("i", -1))) \
				and not mind.is_patron(a, int(bs.get("i", -1))):
			return int(bs.get("i", -1))
		var scores: Array = []
		for i: int in pool:
			if mind.is_patron(a, i):
				continue
			scores.append({"i": i, "s": mind.vote_score(a, i)})
		scores.sort_custom(func(x, y): return float(x["s"]) > float(y["s"]))
		if scores.is_empty():
			return -1
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


## 2.5D voteLean（js/game.js:7239）：会前先投谁 + 这条依据有多硬（s）。
## s ≥ 2 才允许「讨论期先投」；s == 3 是确信，之后不再松绑（改票闸读 why == known）。
## 3D 没有 a.suspect 这个字段（第七批已删），所以真源里的 suspect 档在这里不存在。
func vote_lean(a: Dictionary) -> Dictionary:
	if mind == null:
		return {"v": -1, "s": 0.0, "why": "none"}
	var kn: Dictionary = mind.best_known_target(a)
	if not kn.is_empty():
		return {"v": int(kn.get("i", -1)), "s": 3.0, "why": "known"}
	var af: Dictionary = mind.best_almost_target(a)
	if not af.is_empty():
		var afi := int(af.get("i", -1))
		if afi >= 0 and not (bool(a.get("alien", false)) and _is_mate(a, afi)):
			return {"v": afi, "s": 2.5, "why": "almost"}
	var spread: Dictionary = mind.hypothesis_spread(a)
	if bool(spread.get("competing", false)):
		return {"v": -1, "s": 0.0, "why": "competing"}
	var bs: Dictionary = mind.best_sus_target(a, 0.55)
	if not bs.is_empty():
		return {"v": int(bs.get("i", -1)), "s": 1.0, "why": "sus"}
	return {"v": -1, "s": 0.0, "why": "none"}


## 手里有确证 / 准-确证的人，会议一开始就把票压上（js/game.js:6967）。
## 这是「可改票」的另一半：先投，才有「听完改票」这回事。
func cast_early_votes() -> int:
	if meeting.is_empty() or float(meeting.get("vote_sec", 0.0)) <= 0.0:
		return 0
	var meta: Dictionary = (meeting.get("voteMeta", {}) as Dictionary).duplicate()
	var n := 0
	for a: Dictionary in agents:
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		if int(a.get("i", -1)) == me_idx and not spectator:
			continue
		var lean := vote_lean(a)
		if float(lean.get("s", 0.0)) < 2.0:
			continue
		var vi := int(a.get("i", -1))
		cast_vote(vi, int(lean.get("v", -1)))
		meta[vi] = {"v": int(lean.get("v", -1)), "s": float(lean.get("s", 0.0)),
			"why": String(lean.get("why", "")), "chg": 0, "early": 1,
			"rev": int(a.get("rev", 0)), "t": float(meeting.get("t", 0.0))}
		n += 1
	meeting["voteMeta"] = meta
	meeting["earlyVotes"] = n
	_stat("earlyVotes", n)
	return n


## 公共声势：**已经说出口**的指控分量（封顶 0.30，js/game.js:7351）。
## 真人改票很少因为嫌疑分动了 0.02，而是「三个人都这么说」。
func vote_pressure(a: Dictionary, tgt: int) -> float:
	if tgt < 0 or mind == null:
		return 0.0
	var p := 0.0
	for w: Dictionary in agents:
		if int(w.get("i", -1)) == int(a.get("i", -1)):
			continue
		if not bool(w.get("alive", false)) or bool(w.get("downed", false)):
			continue
		if _public_accuse_target(w) != tgt:
			continue
		p += 0.10 * clampf(mind.cred_of(a, int(w.get("i", -1))), 0.5, 1.0)
	return minf(0.30, p)


## 改票时的目标选择：自己的嫌疑 + 已经说出口的公开声势（js/game.js:7367）。
func best_vote_target(a: Dictionary) -> Dictionary:
	var best := -1
	var bs := -1.0
	for t: Dictionary in agents:
		var ti := int(t.get("i", -1))
		if ti == int(a.get("i", -1)):
			continue
		if not bool(t.get("alive", false)) or bool(t.get("downed", false)):
			continue
		if bool(a.get("alien", false)) and _is_mate(a, ti):
			continue
		var s: float = mind.sus_of(a, ti) + vote_pressure(a, ti)
		if s > bs:
			bs = s
			best = ti
	if best < 0:
		return {"v": -1, "s": 0.0, "why": "none"}
	return {"v": best, "s": bs, "why": "score"}


## 听进新证词后改票（js/game.js:7411）：确信不松绑；公开声势要盖过原判断 0.10，
## 再按「我对说话人有多信」掷一次（0.35 + 0.34 × cred）。
func reconsider_votes(by_id: int) -> int:
	if meeting.is_empty() or String(meeting.get("phase", "")) != "discuss":
		return 0
	if mind == null or not meeting.has("voteMeta"):
		return 0
	var meta: Dictionary = (meeting.get("voteMeta", {}) as Dictionary).duplicate()
	var sp := agent(by_id)
	var changed := 0
	for a: Dictionary in agents:
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		var vi := int(a.get("i", -1))
		if vi == me_idx and not spectator:
			continue
		if not meta.has(vi):
			continue
		var mm: Dictionary = meta[vi]
		if String(mm.get("why", "")) == "known":
			continue
		var lean := best_vote_target(a)
		var lv := int(lean.get("v", -1))
		if lv < 0 or lv == int(mm.get("v", -1)):
			continue
		var now := float(lean.get("s", 0.0))
		var old_v := int(mm.get("v", -1))
		var old: float = (mind.sus_of(a, old_v) + vote_pressure(a, old_v)) if old_v >= 0 else 0.0
		if now <= old + 0.10:
			continue
		var cred: float = float(mind.cred_of(a, by_id)) if not sp.is_empty() else 0.5
		if _rng.randf() > 0.35 + 0.34 * clampf(cred, 0.0, 1.0):
			continue
		cast_vote(vi, lv)
		meta[vi] = {"v": lv, "s": now, "why": String(lean.get("why", "")),
			"chg": int(mm.get("chg", 0)) + 1, "early": mm.get("early", 0),
			"rev": int(a.get("rev", 0)), "t": float(meeting.get("t", 0.0))}
		changed += 1
		_stat("voteChanges", 1)
	meeting["voteMeta"] = meta
	return changed


## 2.5D 投票是"讨论期陆续投 + 跟票"，3D 原先只在进 vote 相位时一次结算。
## 分两轮：先各自独立形成意向，再让无主张者按 WARM.followChance 跟领先者、
## 异形按 SOCIAL.pileOn 顺势踩一脚，最后才真正落票。这样票能形成 4 票集中，
## 同时保留"跟错票"造成的误逐（2.5D 误逐率约 20%，是平衡阀之一）。
func _cast_ai_votes() -> void:
	var intents: Dictionary = {}
	var tally: Dictionary = {}
	var meta0: Dictionary = (meeting.get("voteMeta", {}) as Dictionary)
	for a: Dictionary in agents:
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		if int(a.get("i", -1)) == me_idx and not spectator:
			continue
		# 早投且之后信念没动过（mind.rev 未变）→ 保留那一票，不重新猜
		# （js/game.js:7539-7542 earlyKept）。
		var mm0: Dictionary = (meta0.get(int(a.get("i", -1)), {}) as Dictionary)
		if not mm0.is_empty() and int(mm0.get("early", 0)) == 1 \
				and int(mm0.get("rev", 0)) == int(a.get("rev", 0)):
			_stat("earlyKept", 1)
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
	var follow_p := float(wc.get("followChance", 0.45))
	for k2: int in intents.keys():
		var v2 := int(intents[k2])
		var voter := agent(k2)
		# 异形的顺势踩人已在 _ai_vote_target 内按 SOCIAL.pileOn 结算，这里不再覆盖
		if not bool(voter.get("alien", false)) and v2 < 0 and lead >= 0 \
				and lead_n >= 1 and _rng.randf() < follow_p:
			v2 = lead
		cast_vote(k2, v2)


## 软热靶（2.5D alienSocialPick 的公开指控口径）：
## 数"没有确证的公开指控者"，最多人的那个为目标；跳过自己的认出队友。
func _soft_hot_target(a: Dictionary) -> int:
	var heat: Dictionary = {}
	for w: Dictionary in agents:
		if not bool(w.get("alive", false)) or bool(w.get("downed", false)):
			continue
		var acc := int(w.get("accuse", -1))
		if acc < 0 or int(w.get("i", -1)) == int(a.get("i", -1)):
			continue
		# 软指控：指控者自己没有对该目标的确证
		if (w.get("known", {}) as Dictionary).has(acc):
			continue
		heat[acc] = int(heat.get(acc, 0)) + 1
	var best := -1
	var bn := 0
	for k: int in heat.keys():
		if int(heat[k]) > bn and not _is_mate(a, k):
			bn = int(heat[k])
			best = int(k)
	var hot_min := int((lines_data.data.get("rules", {}) as Dictionary) \
		.get("SOCIAL", {}).get("hotMin", 1))
	return best if bn >= hot_min else -1


## 异形是否已认出对方是队友（只用亲眼目击推断的 mates，不读系统阵营表）
func _is_mate(a: Dictionary, other_i: int) -> bool:
	return (a.get("mates", {}) as Dictionary).has(other_i)


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
		# 2.5D 里玩家说"我投 X"只是**公开意向**（m.ctx.playerVote，js/game.js:6566），
		# 不会替他落票；真正落票只有点席位按钮这一条路。3D 原先在这里自动 caste，
		# 等于多了一条 2.5D 没有的机制，本批按真源去掉。
		# ai_enabled=false 是 3D 自测用的"AI 全关"开关：投票也是 AI 行为，一并关闭。
		if ai_enabled:
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
	# 2.5D closeVote（js/game.js:7669-7672）：**终票**在这里逐人落事件，带会议 seq；
	# 结算页的「谁投了谁」就按这个分组。中途改票另走 vote_change。
	var mseq := int(meeting.get("seq", 0))
	for vk: int in votes.keys():
		_log("vote", {"actor": vk, "target": int(votes[vk]), "seq": mseq})
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
	# 2.5D closeVote（js/game.js:7673-7679）：DEV 玩家被投出去时「驱逐无效」，
	# 结果里带 devSaved，结算页/会议结果必须写明，不能假装无人出局。
	var dev_saved: bool = ejected_ok and dev and not spectator and top == me_idx
	if dev_saved:
		_dev_note("DEV 无敌：驱逐无效（%d 票）" % tn)
	if ejected_ok and not dev_saved:
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
				var lead_map: Dictionary = (meeting.get("lead", {}) as Dictionary)
				var lead := int(lead_map.get(top, -1))
				mind.settle_accountability(top, votes, lead)
	var matrix: Dictionary = (meeting.get("votes", {}) as Dictionary).duplicate()
	meeting["result"] = {
		"ejected": (top if ejected_ok and not dev_saved else -1),
		"name": (agent(top).get("name", "") if ejected_ok else ""),
		"alien": (bool(agent(top).get("alien", false)) if ejected_ok else false),
		"votes": tally.duplicate(), "matrix": matrix,
		"need": need, "max": tn, "tie": tie, "voters": voters,
		"devSaved": dev_saved,
	}
	meeting["phase"] = "result"
	meeting["t"] = float(meeting.get("reveal_sec", 3.0))
	check_win()
	if over:
		# 胜负已定：不让 3 秒身份公布把结算面板卡在后面
		meeting = {}


## ---- 玩家能力判定单一真源（2026-11-11 机制对齐）----
## 2.5D 没有 canAct 这个名字：它的动作键（W/A/S/D/F/R/B/H/V）**无条件直达**
## attack()/toggleDrag()/sabotage()/tryReport()，前置判定写在动作函数内部。
## 3D 之前把这些动作做成「靠近才生成的交互项」，offers 为空时按键被静默吞掉 ——
## 用户现场即「按键全合法，能力一点都没有，拖拽完全拖不了」。
## 这里把散在 UI 层的前置条件收回 sim：只判定、不写状态，返回精确 reason；
## 执行仍走原有单一入口（knife / shoot / start_drag / player_sabotage / ...），
## 玩家与 AI 共用同一份口径，不新增规则、不新增数值。
## @src: js/game.js:8266 attack / 8280 stab / 8552 toggleDrag / 2458 startDrag
##       / 8228 sabotage / 894 openPipePick / 8072 collectInteractions / 7961 keydown
func can_act(kind: String, ctx: Dictionary = {}) -> Dictionary:
	var ai := int(ctx.get("actor", me_idx))
	var a: Dictionary = agent(ai)
	if a.is_empty():
		return _act_no("no_actor")
	# 2.5D 全局守卫：会议中 / 对局结束 / 死亡 / 濒死 / 被押送都不能动作
	# （js/game.js:8009 `if(G.meet||G.over)return`、:8266 attack、:8552 toggleDrag）
	if bool(over) or not meeting.is_empty():
		return _act_no("meeting")
	if not bool(a.get("alive", false)) and not bool(a.get("ghost", false)):
		return _act_no("dead")
	if bool(a.get("downed", false)):
		return _act_no("downed")
	if bool(a.get("detained", false)):
		return _act_no("detained")
	# 2.5D 幽灵口径（js/game.js:8077）：幽灵只能做自己的剩余任务。
	var ghost := bool(a.get("ghost", false))
	var pos: Vector2 = ctx.get("pos", a.get("pos", Vector2.ZERO))
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	match kind:
		"knife":
			# 2.5D attack():8271 只有异形能出刀；knife():4226 只判刀数与目标存活/未倒地，
			# **不判目标阵营**（3D 移植时凭空加的 `or v.alien` 已删）。
			if not bool(a.get("alien", false)):
				return _act_no("not_alien")
			if int(a.get("knife", 0)) < 1:
				return _act_no("no_knife")
			var vi := int(ctx.get("victim", -1))
			var v: Dictionary = agent(vi)
			if v.is_empty():
				return _act_no("no_target")
			if not bool(v.get("alive", false)) or bool(v.get("downed", false)) \
					or bool(v.get("detained", false)):
				return _act_no("target_down")
			var vp: Vector2 = v.get("pos", Vector2.ZERO)
			if ap.distance_to(vp) > SpaceData.num(space, "reach", "knife"):
				return _act_no("out_of_reach")
			if not los_now(ap.x, ap.y, vp.x, vp.y):
				return _act_no("no_los")
			return _act_ok(vi)
		"knife_bot":
			# 2.5D stab():8300 的机器人分支：人/机器人同一次「最近目标」挑选，
			# 命中后交 knifeBot():8356 结算。守卫逐条照搬 knifeBot + damageBot。
			if not bool(a.get("alien", false)):
				return _act_no("not_alien")
			if int(a.get("knife", 0)) < 1:
				return _act_no("no_knife")
			var bk := String(ctx.get("bot", ""))
			if bk != "secbot" and bk != "medbot":
				return _act_no("no_target")
			if bots == null or bots.is_dead(bk):
				return _act_no("target_down")
			var bp: Vector2 = bots.pos_of(bk)
			if ap.distance_to(bp) >= 1.8:
				return _act_no("out_of_reach")
			if not los_now(ap.x, ap.y, bp.x, bp.y):
				return _act_no("no_los")
			return _act_ok(-1, "knife_bot:" + bk)
		"shoot":
			# 2.5D fireShot():8307 无阵营门槛、无 alien 门槛，只判子弹/目标/射程/视线。
			if int(a.get("bullet", 0)) <= 0:
				return _act_no("no_bullet")
			var si := int(ctx.get("victim", -1))
			var s: Dictionary = agent(si)
			if s.is_empty() or not bool(s.get("alive", false)) or bool(s.get("downed", false)):
				return _act_no("no_target")
			var sp: Vector2 = s.get("pos", Vector2.ZERO)
			if ap.distance_to(sp) > SpaceData.num(space, "shoot", "range"):
				return _act_no("out_of_reach")
			if not los_now(ap.x, ap.y, sp.x, sp.y):
				return _act_no("no_los")
			return _act_ok(si)
		"drag":
			# 2.5D startDrag():2458 / toggleDrag():8552：拖尸**不限阵营**，
			# 濒死者（还活着）与尸体都能拖；只排除已搜完/已被拖/已报告/已藏。
			if ghost:
				return _act_no("ghost")
			if int(a.get("drag", -1)) >= 0:
				return _act_ok(int(a.get("drag", -1)), "drop")
			var radius := SpaceData.num(space, "reach", "body")
			var best := -1
			var best_d := radius
			for x: Dictionary in agents:
				if int(x.get("i", -1)) == ai:
					continue
				var downed := bool(x.get("alive", false)) and bool(x.get("downed", false))
				if bool(x.get("alive", false)) and not downed:
					continue
				if bool(x.get("bodyGone", false)) or bool(x.get("bodyReported", false)):
					continue
				## 2.5D 真源 js/game.js:217 / :2487 —— draggedBy 的空值只有 null。
				## 3D 移植时自造了 -1 作空值（本文件 :805 跨夜、:1082 死亡、:2210），
				## 而 start_drag():2903 已兼容两种空值；旧写法 != null 会把 -1
				## 误判成「已被别人拖」→ 跳过全部候选 → no_body → 恒入口 G 键静默失效。
				## 夹具 --abilitytest 曾把 draggedBy 设为 null，故自测全绿、实机拖不了。
				## 按真源统一：null 与 -1 都表示「无人拖」，与 start_drag 口径一致。
				var dragged_by: Variant = x.get("draggedBy", null)
				if dragged_by != null and int(dragged_by) >= 0:
					continue
				var bp: Vector2 = x.get("pos", Vector2.ZERO) if downed \
					else x.get("bodyPos", Vector2.ZERO)
				var d := bp.distance_to(pos)
				if d < best_d:
					best_d = d
					best = int(x.get("i", -1))
			if best < 0:
				return _act_no("no_body")
			return _act_ok(best)
		"drop":
			if int(a.get("drag", -1)) < 0:
				return _act_no("not_dragging")
			return _act_ok(int(a.get("drag", -1)))
		"report":
			# 2.5D tryReport()（js/game.js:4901）：2.4 格内**最近的未报告**身体；
			# 额度/夜场先判，避免"按了 R 但会开不起来"白掉一次报告额度。
			if ghost:
				return _act_no("ghost")
			var best_body: Dictionary = {}
			var best_bd := 2.4
			for v: Dictionary in agents:
				if v == a or bool(v.get("bodyReported", false)) \
						or bool(v.get("bodyGone", false)) \
						or String(v.get("deathCause", "")) == "vote":
					continue
				if bool(v.get("alive", false)) and not bool(v.get("downed", false)):
					continue
				var bp: Vector2 = v.get("pos", Vector2.ZERO) if bool(v.get("alive", false)) \
					else v.get("bodyPos", Vector2.ZERO)
				var d := bp.distance_to(pos)
				if d < best_bd:
					best_bd = d
					best_body = v
			if best_body.is_empty():
				return _act_no("no_body")
			if int(a.get("reportLeft", 0)) <= 0 or night_meet_left() <= 0:
				return _act_no("no_report_quota")
			return _act_ok(int(best_body.get("i", -1)))
		"sabotage":
			# 2.5D sabotage():8228-8229 异形专用、每夜一次、bridge 不可破坏。
			if not bool(a.get("alien", false)):
				return _act_no("not_alien")
			if ghost:
				return _act_no("ghost")
			if bool(a.get("sabUsed", false)):
				return _act_no("sab_used")
			var rid: String = String(ctx.get("room", room_at(pos)))
			if rid == "" or rid == "bridge":
				return _act_no("sab_room")
			for d: Dictionary in dmg:
				if String(d.get("room", "")) == rid:
					return _act_no("sab_room")
			return _act_ok(-1, rid)
		"pipe":
			# 2.5D openPipePick():898 / pickPipe():932 `!me.alien&&!designMode` 拒绝；
			# 判定真源是 me().alien，**不是开始页的 role 字符串**。
			if not bool(a.get("alien", false)):
				return _act_no("not_alien")
			if ghost:
				return _act_no("ghost")
			if int(a.get("drag", -1)) >= 0:
				return _act_ok(-1, "release_drag")
			return _act_ok(-1, "open")
		"task", "fix", "breaker", "cams", "search", "revive", "supply", "claim", "bot", "inspect":
			# 2.5D collectInteractions():8077-8143：幽灵只允许自己的任务。
			if ghost and kind != "task":
				return _act_no("ghost")
			return _act_ok()
		_:
			return _act_no("unknown_action")
	return _act_ok()


func _act_no(reason: String) -> Dictionary:
	return {"ok": false, "reason": reason, "target": -1, "action": ""}


func _act_ok(target: int = -1, action: String = "") -> Dictionary:
	return {"ok": true, "reason": "", "target": target, "action": action}


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
	# 2.5D startDrag（js/game.js:2456）：拖的对象可以是尸体，也可以是**还活着的濒死者**
	# （把伤员拖进医疗间交给无人机救活，即 dragToMed）；只有活着且没濒死的人不能拖。
	# 3D 之前一句 `if b.alive: return false` 把整条拖救链堵死了。
	if bool(b.get("alive", false)) and not bool(b.get("downed", false)):
		return false
	if bool(b.get("bodyGone", false)) or bool(b.get("bodyReported", false)):
		return false
	var dragged_by: Variant = b.get("draggedBy", null)
	if dragged_by != null and int(dragged_by) >= 0:
		return false
	if int(a.get("drag", -1)) >= 0:
		return false
	# 一具尸体只能被一个人拖
	for x: Dictionary in agents:
		if int(x.get("drag", -1)) == body_i:
			return false
	a["drag"] = body_i
	b["draggedBy"] = agent_i
	# 2.5D bodyPos()：濒死者用当前坐标当身体位置，拖行时由 tick_agents 同步。
	if bool(b.get("downed", false)):
		b["bodyPos"] = b.get("pos", Vector2.ZERO)
	# 2.5D startDrag：记下拖行起点，松手时移动 >1.2 格才置 bodyMoved
	# （js/game.js:2438-2440：现场被布置过才算"尸体被移动"）。
	b["_dragFrom"] = b.get("bodyPos", b.get("pos", Vector2.ZERO))
	a["path"] = PackedVector2Array()
	_log("drag_start", {"actor": agent_i, "victim": body_i, "downed": bool(b.get("downed", false))})
	# 每次起拖重置拖行副作用的"本次"标记（2.5D：_dragAway 每拖一次只报一次）
	a["_dragAway"] = false
	a["_dragMedD0"] = 0.0
	return true


## 2.5D syncDragOf（js/game.js:2425）：拖行不是「把尸体瞬移到脚下」，而是
## **拉到身后 0.62 格**；活着的伤员写 pos（他自己也要跟着走），尸体写 bodyPos。
## 拖拽者死亡 / 濒死 / 被拘、会议开始、对局结束 → 立刻强制松手（真源同一处）。
func sync_drag_of(a: Dictionary) -> void:
	var di := int(a.get("drag", -1))
	if di < 0:
		return
	var v := agent(di)
	if v.is_empty() or not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
			or bool(a.get("detained", false)) or not meeting.is_empty() or over:
		release_drag(int(a.get("i", -1)))
		return
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var bp: Vector2 = v.get("bodyPos", v.get("pos", Vector2.ZERO))
	var d := ap.distance_to(bp)
	var want := 0.62
	if d > want:
		var tgt := ap + (bp - ap) / d * want
		if nav != null:
			tgt = nav.nearest_free(tgt)
		if bool(v.get("alive", false)):
			v["pos"] = tgt
			v["bodyPos"] = tgt
		else:
			v["bodyPos"] = tgt
		if not bool(v.get("bodyMoved", false)):
			var origin: Variant = v.get("_dragFrom", null)
			if origin != null and tgt.distance_to(origin as Vector2) > 1.2:
				v["bodyMoved"] = true
	# 2.5D：把**还活着的伤员**拖进医疗间是明确的好事（和拖尸体去藏尸相反），同一夜只记一次。
	if bool(v.get("alive", false)) and not bool(a.get("_credMed", false)) \
			and room_at(ap) == "med":
		a["_credMed"] = true
		if mind != null and speech_enabled:
			mind.cred_broadcast(int(a.get("i", -1)), "dragToMed", ap)
	# 2.5D：尸体被拖离医疗间 2.2 格以上 → 附近活人目击一次「反常拖尸」（只加嫌疑）。
	if not bool(v.get("alive", false)) and not bool(a.get("_dragAway", false)):
		var med_c := room_center("med")
		if med_c != Vector2.ZERO:
			var dm := ap.distance_to(med_c)
			var d0 := float(a.get("_dragMedD0", 0.0))
			if d0 <= 0.0:
				a["_dragMedD0"] = dm
			elif dm > d0 + 2.2:
				a["_dragAway"] = true
				_drag_away_notice(a, v)


## 2.5D dragAwayNotice（js/game.js:3088）：写一条 drag_away 事件，并给 6 格内
## 注意力在线、看得见的活人各记一条 saw_drag_away（EV_W 0.45，只进嫌疑不写确证）。
func _drag_away_notice(a: Dictionary, v: Dictionary) -> void:
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	_log("drag_away", {"actor": int(a.get("i", -1)), "victim": int(v.get("i", -1)),
		"room": room_at(ap)})
	_witness_action(a, "saw_drag_away", ap)


func release_drag(agent_i: int) -> bool:
	var a := agent(agent_i)
	if a.is_empty() or int(a.get("drag", -1)) < 0:
		return false
	var body_i := int(a.get("drag", -1))
	var b := agent(body_i)
	a["drag"] = -1
	if not b.is_empty():
		b["draggedBy"] = null
		# 2.5D releaseDrag（js/game.js:2438）：拖行距离 >1.2 格 → bodyMoved。
		var from: Variant = b.get("_dragFrom", null)
		if from != null:
			var moved: float = (b.get("bodyPos", Vector2.ZERO) as Vector2).distance_to(from as Vector2)
			if moved > 1.2:
				b["bodyMoved"] = true
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
	# 2.5D damageBot():8390：开枪者同样要过活体/未倒地/未拘留守卫（fireShotBot 只在入口判子弹）。
	if over or not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
			or bool(a.get("detained", false)):
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
	if not los_now(ap.x, ap.y, fp.x, fp.y):
		return false
	a["bullet"] = int(a.get("bullet", 0)) - 1
	bot_hp[kind] = int(bot_hp.get(kind, 0)) - 1
	_log("bot_hit", {"actor": shooter_i, "bot": kind, "hp": int(bot_hp.get(kind, 0))})
	# 2.5D damageBot():8407：保安被枪打中同样转向袭击者（`cause==='shot'` 也走这段）。
	if bots != null:
		bots.face_point(ap)
	if int(bot_hp.get(kind, 0)) <= 0:
		if bots != null:
			bots.kill(kind)
		_log("bot_down", {"actor": shooter_i, "bot": kind})
	if bots != null:
		bots.on_crime(shooter_i, ap)
	return true


## ---- B6′：供电（breaker）----
## 三态灯（2.5D refreshLight，js/game.js:678-690）：
##   0 常态（只亮 light==bright 的舱）· 1 电路修好（全舱全亮）· 2 拉闸（只剩会议室）。
## power_on 只是"没断电"的派生值，判定一律读 light_state。
func toggle_power(by: int) -> bool:
	var was_off: bool = light_state == 2
	light_state = (1 if power_fixed else 0) if was_off else 2
	power_on = light_state != 2
	# 本夜拉闸次数只在**真正拉黑**那一次 +1（站桩被打断不消耗名额）
	if not was_off and light_state == 2:
		breaker_pulls += 1
	_log("breaker", {"actor": by, "on": light_state != 2, "state": light_state,
		"pulls": breaker_pulls})
	var br := breaker_pos()
	# 2.5D pullBreaker：aiHear('power',br,30,{actor}) —— 电闸的嗡鸣声传得很远
	hear("power", br, 30.0, {"actor": by})
	# @src js/game.js:734 pullBreaker：
	#   `envNotice('lights',br.x,br.y,G.lightState===2?0.85:0.45)`
	# 拉黑 0.85 / 合闸 0.45；light_state 已在上面更新，与真源同一时点。
	env_notice("lights", br, 0.85 if light_state == 2 else 0.45)
	# 证据链两种语义相反（2.5D noticeAction + credBroadcast）：
	#   拉闸断电 = 身份级，目击者写 known；合闸复电 = 正向信任，只给 cred，不洗清任何人。
	if mind != null and br != Vector2.ZERO:
		if light_state == 2:
			for w: Dictionary in agents:
				var wi := int(w.get("i", -1))
				if wi == by or not bool(w.get("alive", false)) or bool(w.get("downed", false)):
					continue
				if (w.get("pos", Vector2.ZERO) as Vector2).distance_to(br) <= 6.0 \
						and ai_can_see(w, br):
					mind.note_sight(wi, by, "saw_breaker", br)
		else:
			mind.cred_broadcast(by, "breakerOn", br)
			# 2.5D noticeAction breakerOn（js/game.js:1969-1977）：异形目击合闸
			# → humanT +0.28。只是「这人更像对手」的倾向，不写 known/mates；
			# 已认出的队友不加（合闸伪装不该反噬队友）。
			for w: Dictionary in agents:
				var wi := int(w.get("i", -1))
				if wi == by or not bool(w.get("alien", false)) \
						or not bool(w.get("alive", false)) or bool(w.get("downed", false)) \
						or bool(w.get("detained", false)):
					continue
				if (w.get("pos", Vector2.ZERO) as Vector2).distance_to(br) > 6.0:
					continue
				if not ai_can_see(w, br):
					continue
				if mind._is_mate(w, by):
					continue
				mind.humanish_add(w, by, rules.n("HUMANISH", "onSight", 0.28))
	return true


## 站桩秒数（2.5D breakerPullTime）：断电 → 合闸时间；供电 → 本夜第 n 次的拉闸时间。
func breaker_pull_time() -> float:
	if light_state == 2:
		return breaker_on_time()
	return minf(9.0, 3.0 * float(maxi(0, breaker_pulls) + 1))


## 电闸设施坐标（map_v2.facility kind=breaker，2.5D M.facility 同源）
var _breaker_pos := Vector2.ZERO


func breaker_pos() -> Vector2:
	if _breaker_pos == Vector2.ZERO:
		for f: Dictionary in (map.get("facility", []) as Array):
			if String(f.get("kind", "")) == "breaker":
				_breaker_pos = Vector2(float(f.get("x", 0.0)), float(f.get("y", 0.0)))
				break
	return _breaker_pos


## 合闸站桩秒数（2.5D breakerOnTime：断电当夜 on_default 4.5，修好电路后 on_fixed 3）
func breaker_on_time() -> float:
	var B: Dictionary = space.get("breaker", {}) as Dictionary
	return float(B.get("on_fixed", 3.0)) if power_fixed else float(B.get("on_default", 4.5))


## 舱室中心（2.5D 舱室 rect 中心；拖尸目的地 / 领袖指令目的地用）
func room_center(room_id: String) -> Vector2:
	var r: Dictionary = rooms_by_id.get(room_id, {}) as Dictionary
	var rect: Array = r.get("rect", []) as Array
	if rect.size() >= 4:
		return Vector2(float(rect[0]) + float(rect[2]) / 2.0,
			float(rect[1]) + float(rect[3]) / 2.0)
	var label: Array = r.get("label", [0.0, 0.0]) as Array
	return Vector2(float(label[0]), float(label[1]))


## 机器人位置（2.5D botPos）
func bot_pos_of(kind: String) -> Vector2:
	if bots == null:
		return Vector2.ZERO
	return bots.pos_of(kind)


## 用刀拆机器人（2.5D knifeBot：与玩家 Q 同一条入口，消耗刀数按装甲 HP 结算）
func knife_bot(kind: String, by: int) -> bool:
	var a := agent(by)
	if a.is_empty() or bots == null:
		return false
	# 2.5D damageBot():8390 的袭击者状态守卫 —— 死/濒死/被拘留的人打不动机器人。
	if over or not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
			or bool(a.get("detained", false)):
		return false
	if kind != "secbot" and kind != "medbot":
		return false
	if int(a.get("knife", 0)) < 1 or bots.is_dead(kind):
		return false
	if not bot_hp.has(kind) or int(bot_hp.get(kind, 0)) <= 0:
		return false
	var bp: Vector2 = bot_pos_of(kind)
	# 2.5D knifeBot():8356：机器人贴身判据是 1.8 格（不是人的 reach.knife 1.35）。
	if distance_to(by, bp) >= 1.8:
		return false
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	if not los_now(ap.x, ap.y, bp.x, bp.y):
		return false
	a["knife"] = int(a.get("knife", 0)) - 1
	bot_hp[kind] = int(bot_hp.get(kind, 0)) - 1
	# 2.5D damageBot():8401：出刀打机器人也留下「刀者红身」，和打人一刀表现/判定对齐。
	a["redT"] = float((cfg.get("rules", {}) as Dictionary).get("RED_BODY", {}).get("dur", 1.5))
	_log("bot_hit", {"actor": by, "bot": kind, "hp": int(bot_hp.get(kind, 0))})
	_witness_action(a, "saw_bot", bp)
	# 2.5D damageBot():8407：保安存活时转向袭击者 —— 直接改变下一次 would_see 的 180° 扇形。
	bots.face_point(ap)
	if int(bot_hp.get(kind, 0)) <= 0:
		bots.kill(kind)
		_log("bot_down", {"actor": by, "bot": kind})
	bots.on_crime(by, ap)
	return true


## 2.5D sabotageBot()：异形用「破坏」把机器人直接停摆（每夜一次，不耗刀/弹）。
## 与 knife_bot 的区别：刀拆是逐点削 HP；停摆是一次性、只属于活着的异形。
func sabotage_bot(kind: String, by: int) -> bool:
	var a := agent(by)
	if a.is_empty() or bots == null:
		return false
	if not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
			or bool(a.get("detained", false)):
		return false
	if not bool(a.get("alien", false)):
		return false
	if bool(a.get("sabUsed", false)) and not dev:
		return false
	if bots.is_dead(kind) or not bot_hp.has(kind) or int(bot_hp.get(kind, 0)) <= 0:
		return false
	var bp := bot_pos_of(kind)
	if (a.get("pos", Vector2.ZERO) as Vector2).distance_to(bp) > 1.8:
		return false
	if not dev:
		a["sabUsed"] = true
	bot_hp[kind] = 0
	bots.kill(kind)
	_log("bot_down", {"actor": by, "bot": kind, "method": "sabotage"})
	_witness_action(a, "saw_bot", bp)
	# 2.5D sabPick 结算：aiHear('robot_down',me,18,{actor})
	hear("robot_down", bp, 18.0, {"actor": by})
	# @src js/game.js:8221 sabotageBot：`envNotice('robot',tp.x,tp.y,0.5)`
	env_notice("robot", bp, 0.5)
	bots.on_crime(by, a.get("pos", Vector2.ZERO))
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

## ---- 四个非排除项机制（2026-11-12 逐函数移植，@src 见各函数头） ----
## 这四个在 audit:parity 里是唯一的 pending：既无同名 GDScript 实现，
## 函数体又不含 DOM/Canvas 标记，因此不能降级为 not-applicable。
## 3D 侧容器与 2.5D 不同构（mind.mem → agent.ev_mem、G.* → sim 字段），
## 故按 PORTING_PROTOCOL §3 登记为 adapter；判定、守卫、顺序逐条照真源。


## @src js/game.js:1848 envNotice(kind,x,y,conf)
## @src js/t2/ai.js:325-338 evPush（内联：3D 无 a.mind 对象，等价容器是 a.ev_mem）
## 原文守卫：`if(!G||G.over)return;` / `if(!a.alive||a.downed||a.detained)continue;`
## 注意：全船广播、无距离衰减、无注意力过滤 —— 不许加 3D 自造的筛子。
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
		# @src js/t2/ai.js:333-337：conf>0.25 且三类环境事件 → 提警觉 + 记噪声。
		# 3D 的 alert 已被 AI 判定消费（sim_state.gd 夜间警觉），noise 与 hear() 同结构。
		if conf > 0.25 and (ev_kind == "env_lights" or ev_kind == "env_fault" \
				or ev_kind == "env_robot"):
			a["alert"] = minf(1.0, float(a.get("alert", 0.0)) + conf * 0.35)
			# @src js/t2/ai.js:336  `a.mind.noise={x,y,t,kind}` —— 只这 4 个字段。
			a["noise"] = {"x": at.x, "y": at.y,
				"t": snappedf(elapsed, 0.01), "kind": ev_kind}


## @src js/game.js:1410 recordFrame()
## 原文守卫：`if(!G||G.simMode||G.over)return;`
## 死者过滤：`if(a.bodyGone||a.deathCause==='vote'||a.bodyX==null)continue;`
## 3D 的 bodyX/bodyY 合为 Vector2 bodyPos；drag 空值是 -1（含历史 null），
## 与 can_act / start_drag 同口径，不复用 `!= null` 那个已经修过的坑。
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
	# @src js/game.js:1423 `if(arr.length<FRAME_CAP)arr.push({pt,n,p})`
	if frames.size() < FRAME_CAP:
		frames.append({"pt": snappedf(elapsed, 0.1), "n": night, "p": p})


## @src js/game.js:1426 replayData()
## 纯构造、无守卫、只读；8 个字段逐字对齐（v/game/savedAt/map/result/roster/events/frames）。
## game 取 version.json#base.version（2.5D SKConfig.version 的同一份语义），
## winPts 取 sim.json#win.pts（2.5D SKSanity.WIN.pts=45），均不写死。
## 2.5D runInvariants(tag)（js/game.js:556）：跑一遍 SKInvariants 并记录最近结果。
## 2.5D 只在 `_t.inv('api')` 里按需调用（不在 update 循环里），3D 保持同频：
## 由 --invtest / 调试入口显式调用，零帧开销。返回 {checks, fails}。
func run_invariants(tag: String) -> Dictionary:
	# 2.5D runInvariants 第一行：`if(SIM_RUN)return null;` —— 批量模拟不跑断言。
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


## @src js/game.js:1297 sabTick()
## 原文守卫逐条照搬：t<=0 / 非异形且非 designMode / 死 / 濒死 / 拘留 / 本夜已用。
## 命中条件：`roomIdAt(me.x,me.y)===t.room || hypot(me-t)<SAB_RANGE`；
## SAB_RANGE 读 space.json#reach.sabotage（真源 SKSanity.REACH.sabotage=1.7），不写死。
func sab_tick() -> void:
	var me := agent(me_idx)
	if me.is_empty():
		return
	if t <= 0.0 or (not bool(me.get("alien", false)) and not dev) \
			or not bool(me.get("alive", false)) or bool(me.get("downed", false)) \
			or bool(me.get("detained", false)) \
			or (bool(me.get("sabUsed", false)) and not dev):
		return
	if sab_target.is_empty():
		return
	var rid := String(sab_target.get("room", ""))
	# @src js/game.js:1302 `if(!sabRoomOk(t.room)){G.sabTarget=null;return;}`
	if not sab_room_ok(rid):
		sab_target = {}
		return
	var pos: Vector2 = me.get("pos", Vector2.ZERO) as Vector2
	var tp := Vector2(float(sab_target.get("x", 0.0)), float(sab_target.get("y", 0.0)))
	var reach := SpaceData.num(space, "reach", "sabotage")
	if room_at(pos) == rid or pos.distance_to(tp) < reach:
		if sabotage_room(rid, me_idx):
			sab_target = {}


## 事件流：只追加，不参与判定。信封与 2.5D logEvent 完全对齐：
##   {kind, night, pt(已过秒), t(本夜剩余秒), actor, victim, room, x, y} + 业务字段。
## 注意 2.5D 的 Object.assign 顺序：data 可以覆盖信封字段（meeting 事件就被 data.kind
## 覆盖成 pre/day/night）。3D 端不要复制这个坑；B5 用 meeting + mkind，diff 时做映射。
## DEV 面板/探针专用记录（不写进 events；见 dev_log 声明处）。
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
	# @src js/game.js:1407 logEvent：`if(arr.length<EV_CAP)arr.push(e)`。
	# 3D 之前无上限，长局事件流会与 2.5D 对账漂移。
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

## DEV 不变量（2.5D engine/invariants.js 的最小集）：只在 DEV 下跑，
## 只写 dev_log、不阻断对局 —— 用来发现"数值被写坏"而不是替代门禁。
var _inv_t := 0.0

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
