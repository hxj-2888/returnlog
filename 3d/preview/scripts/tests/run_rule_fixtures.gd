extends SceneTree
## 场景夹具执行器（2026-11-14）
##
## 为什么独立于 main.gd：这些规则的判据都在 sim 层，走 `--script` 直接拉起 sim
## 不依赖任何场景节点，跑得比加载主场景快、也不受视图层状态影响
## （sim 是纯模拟层，3d/ARCHITECTURE.md §3 硬规则 1）。
## 注：`file-budgets.json` 是收紧用的棘轮，不是硬上限——确有必要时可以上调并登记理由，
## 所以「main.gd 行数」不构成把夹具放这里的理由；这里放的唯一理由是判定归属在 sim。
##
## 用法：
##   godot --headless --path 3d/preview --script res://scripts/tests/run_rule_fixtures.gd
## 退出码：0 全过；1 有失败
##
## 每个 case 都是「新开一局 → 摆位 → 断言」，断言失败只记一条，不中断后续 case。

const MAP_PATH := "res://data/map.json"
const SPACE_PATH := "res://data/space.json"
const SIM_PATH := "res://scripts/sim/sim_state.gd"

var _map: Dictionary = {}
var _space: Dictionary = {}
var _fails: Array = []
var _pass := 0

func _load_json(p: String) -> Dictionary:
	var f := FileAccess.open(p, FileAccess.READ)
	if f == null:
		push_error("缺文件 " + p)
		return {}
	var v: Variant = JSON.parse_string(f.get_as_text())
	return v if v is Dictionary else {}

func _new_sim(seed_v: int = 1) -> Variant:
	var sim_script: Variant = load(SIM_PATH)
	var sim: Variant = sim_script.new()
	if not sim.new_game(seed_v, 0, _map, _space, true):
		push_error("new_game 失败")
	return sim

func _ok(case_id: String) -> void:
	_pass += 1
	print("  PASS ", case_id)

func _bad(case_id: String, why: String) -> void:
	_fails.append(case_id + ": " + why)
	print("  FAIL ", case_id, "  ", why)

## R5.4 断电时舱室全暗（会议室除外）、走廊灯全熄。
func _case_r5_4(sim: Variant) -> void:
	var bridge: Vector2 = sim.room_center("bridge")
	var lit_before: String = sim.lit_zone_at(bridge)
	sim.toggle_power(0)
	if sim.light_state != 2:
		_bad("R5.4", "拉闸后 light_state=%d，应为 2" % sim.light_state)
		return
	var lit_bridge: String = sim.lit_zone_at(bridge)
	if lit_bridge == "":
		_bad("R5.4", "断电后会议室应仍亮（拉闸前=%s）" % lit_before)
		return
	var corr_pts: Array = (_map.get("corridors", []) as Array)
	if corr_pts.is_empty():
		_bad("R5.4", "map.json 没有走廊，无法验证走廊灯全熄")
		return
	# 走廊端点常被舱室矩形覆盖（room_at 会先命中房间），所以沿走廊折线采样，
	# 取第一个 room_at == "" 的点，才是真正的「走廊上」。
	var corr_lit := ""
	var sampled := false
	for c: Dictionary in corr_pts:
		var pts: Array = c.get("pts", []) as Array
		for i in range(pts.size() - 1):
			var a: Array = pts[i] as Array
			var b: Array = pts[i + 1] as Array
			var pa := Vector2(float(a[0]), float(a[1]))
			var pb := Vector2(float(b[0]), float(b[1]))
			var mid: Vector2 = (pa + pb) * 0.5
			if sim.room_at(mid) != "":
				continue
			corr_lit = sim.lit_zone_at(mid)
			sampled = true
			break
		if sampled:
			break
	if not sampled:
		_bad("R5.4", "找不到落在走廊上的采样点")
		return
	if corr_lit != "":
		_bad("R5.4", "断电后走廊仍亮：%s" % corr_lit)
		return
	_ok("R5.4")

## R2.7 会议开始时清掉所有死者尸体；濒死者还活着，继续躺在地上可交互。
func _case_r2_7(sim: Variant) -> void:
	if sim.agents.size() < 3:
		_bad("R2.7", "席位不足")
		return
	var dead: Dictionary = sim.agents[1]
	var downed: Dictionary = sim.agents[2]
	dead["alive"] = false
	dead["downed"] = false
	dead["bodyPos"] = dead.get("pos", Vector2.ZERO)
	dead["bodyGone"] = false
	downed["alive"] = true
	downed["downed"] = true
	downed["bodyPos"] = downed.get("pos", Vector2.ZERO)
	downed["bodyGone"] = false
	# 开局自带一场 public 讨论（new_game 后 meeting 非空）。这里直接把讨论置空而不是走流程：
	# 本 case 验的是「夜会清尸」，不是会议生命周期；走流程会引入计时依赖，让夹具变脆。
	sim.meeting = {}
	sim.night_meets = 0
	if not sim.meeting.is_empty():
		_bad("R2.7", "开局会议置空失败")
		return
	if not sim.open_meeting(0, 1):
		_bad("R2.7", "open_meeting 返回 false（前置不满足）")
		return
	if bool(dead.get("bodyGone", false)) != true:
		_bad("R2.7", "死者尸体未被清场（bodyGone=false）")
		return
	if bool(downed.get("bodyGone", false)) != false:
		_bad("R2.7", "濒死者被当成尸体清掉了（bodyGone=true）")
		return
	if bool(downed.get("alive", false)) != true:
		_bad("R2.7", "濒死者被改成不存活")
		return
	_ok("R2.7")

## R8.5 濒死没有倒计时：一直持续到被救或天亮；天亮时因失血死亡。
func _case_r8_5(sim: Variant) -> void:
	var v: Dictionary = sim.agents[1]
	v["alive"] = true
	v["downed"] = true
	for i in range(300):
		sim.tick(0.1)
	if not bool(v.get("alive", false)):
		_bad("R8.5", "30 秒内自行死亡（有倒计时）")
		return
	if not bool(v.get("downed", false)):
		_bad("R8.5", "30 秒后不再是濒死态")
		return
	sim.dawn()
	if bool(v.get("alive", true)):
		_bad("R8.5", "天亮后濒死者未因失血死亡")
		return
	_ok("R8.5")

## R9.1 异形每夜最多破坏 1 次（sabUsed 记账在破坏入口本身）。
func _case_r9_1(sim: Variant) -> void:
	var me: Dictionary = sim.agents[sim.me_idx]
	me["alien"] = true
	me["alive"] = true
	me["downed"] = false
	me["sabUsed"] = false
	var room_id := ""
	var room_pos := Vector2.ZERO
	for p: Dictionary in sim.points:
		if String(p.get("room", "")) == "engine":
			room_id = "engine"
			room_pos = Vector2(float(p.get("x", 0.0)), float(p.get("y", 0.0)))
			break
	if room_id == "":
		_bad("R9.1", "map 里找不到 engine 任务点")
		return
	me["pos"] = room_pos
	var first: bool = sim.player_sabotage(room_id)
	if not first:
		_bad("R9.1", "第一次破坏被拒（前置不满足）")
		return
	if not bool(me.get("sabUsed", false)):
		_bad("R9.1", "破坏后未记账 sabUsed")
		return
	if sim.player_sabotage(room_id):
		_bad("R9.1", "同一夜第二次破坏未被拒")
		return
	_ok("R9.1")

## R4.4 站桩动作在移动时被打断并清零。
func _case_r4_4(sim: Variant) -> void:
	var a: Dictionary = sim.agents[1]
	a["alive"] = true
	a["downed"] = false
	sim.start_doing(1, "fix", 5.0)
	if absf(float(a.get("doing", 0.0)) - 5.0) > 0.001:
		_bad("R4.4", "start_doing 后 doing=%s，应为 5" % str(a.get("doing", 0.0)))
		return
	var target: Vector2 = a.get("pos", Vector2.ZERO) + Vector2(2.0, 0.0)
	sim.set_path(1, target)
	if float(a.get("doing", 0.0)) != 0.0:
		_bad("R4.4", "移动后站桩未清零：doing=%s" % str(a.get("doing", 0.0)))
		return
	_ok("R4.4")

## R2.8 夜晚会议不打断站桩任务（清路径、保留 doing）；白天会议打断一切。
func _case_r2_8(sim: Variant) -> void:
	if sim.agents.size() < 3:
		_bad("R2.8", "席位不足")
		return
	var dead: Dictionary = sim.agents[1]
	dead["alive"] = false
	dead["downed"] = false
	dead["bodyPos"] = dead.get("pos", Vector2.ZERO)
	var a: Dictionary = sim.agents[2]
	a["alive"] = true
	a["downed"] = false
	sim.start_doing(2, "fix", 6.0)
	a["path"] = PackedVector2Array([a.get("pos", Vector2.ZERO), a.get("pos", Vector2.ZERO) + Vector2(3.0, 0.0)])
	sim.meeting = {}
	sim.night_meets = 0
	if not sim.open_meeting(0, 1):
		_bad("R2.8", "夜会开不起来")
		return
	if absf(float(a.get("doing", 0.0)) - 6.0) > 0.001:
		_bad("R2.8", "夜会打断了站桩：doing=%s，应保留 6" % str(a.get("doing", 0.0)))
		return
	if not (a.get("path", PackedVector2Array()) as PackedVector2Array).is_empty():
		_bad("R2.8", "夜会未清路径")
		return
	sim.dawn()
	if float(a.get("doing", 0.0)) != 0.0:
		_bad("R2.8", "白天会议未打断站桩：doing=%s" % str(a.get("doing", 0.0)))
		return
	_ok("R2.8")

## R10.5 白天会议全员被刷新到会议室；夜里会议是「远程」，人不移动。
func _case_r10_5(sim: Variant) -> void:
	if sim.agents.size() < 6:
		_bad("R10.5", "席位不足")
		return
	var dead: Dictionary = sim.agents[1]
	dead["alive"] = false
	dead["downed"] = false
	dead["bodyPos"] = dead.get("pos", Vector2.ZERO)
	var a: Dictionary = sim.agents[5]
	a["alive"] = true
	a["downed"] = false
	var before: Vector2 = a.get("pos", Vector2.ZERO)
	sim.meeting = {}
	sim.night_meets = 0
	if not sim.open_meeting(0, 1):
		_bad("R10.5", "夜会开不起来")
		return
	if (a.get("pos", Vector2.ZERO) as Vector2).distance_to(before) > 0.01:
		_bad("R10.5", "夜会把人挪动了（应保持远程）")
		return
	sim.dawn()
	var after: Vector2 = a.get("pos", Vector2.ZERO)
	if sim.room_at(after) != "bridge":
		_bad("R10.5", "白天会议后不在会议室：%s" % sim.room_at(after))
		return
	_ok("R10.5")

## 关掉开局自带的那场公开讨论：否则 night_meet_left() 恒为 0，
## 举报判定会先撞「额度不足」，测不到「同一具尸体只报一次」这一层。
func _close_pre_meeting(sim: Variant) -> void:
	sim.meeting = {}


## R10.3 同一具尸体同一夜只能报一次；活着的濒死者按本次倒下算一次。
## 判据在 can_act("report")：跳过 bodyReported / bodyGone / deathCause=vote 的目标。
func _case_r10_3(sim: Variant) -> void:
	if sim.agents.size() < 3:
		_bad("R10.3", "席位不足")
		return
	_close_pre_meeting(sim)
	var me: Dictionary = sim.agent(sim.me_idx)
	var body: Dictionary = sim.agent(1)
	body["alive"] = false
	body["downed"] = false
	body["deathCause"] = "knife"
	body["pos"] = (me["pos"] as Vector2) + Vector2(1.0, 0.0)
	body["bodyPos"] = body["pos"]
	body["bodyGone"] = false
	body["bodyReported"] = false
	var r1: Dictionary = sim.can_act("report")
	if not bool(r1.get("ok", false)) or int(r1.get("target", -1)) != 1:
		_bad("R10.3", "未报过的尸体应可报，实际 %s" % JSON.stringify(r1))
		return
	# 这一夜已经报过 → 同一具尸体不再进候选
	body["bodyReported"] = true
	var r2: Dictionary = sim.can_act("report")
	if bool(r2.get("ok", false)):
		_bad("R10.3", "已报过的尸体仍被选中（target=%d）" % int(r2.get("target", -1)))
		return
	# 濒死者（还活着）按「当前身体位置 pos」算，而不是 bodyPos
	body["bodyReported"] = true
	body["bodyGone"] = true
	var downed: Dictionary = sim.agent(2)
	downed["alive"] = true
	downed["downed"] = true
	downed["pos"] = (me["pos"] as Vector2) + Vector2(1.2, 0.0)
	downed["bodyPos"] = (me["pos"] as Vector2) + Vector2(40.0, 40.0)
	downed["bodyReported"] = false
	downed["bodyGone"] = false
	var r3: Dictionary = sim.can_act("report")
	if not bool(r3.get("ok", false)) or int(r3.get("target", -1)) != 2:
		_bad("R10.3", "濒死者应按 pos 判定可报，实际 %s" % JSON.stringify(r3))
		return
	_ok("R10.3")


## R8.6 死亡后尸体留在原地、幽灵可穿墙；被驱逐者没有尸体。
func _case_r8_6(sim: Variant) -> void:
	if sim.agents.size() < 3:
		_bad("R8.6", "席位不足")
		return
	var v: Dictionary = sim.agent(1)
	var p0: Vector2 = v["pos"]
	v["deathCause"] = ""
	sim.die(v)
	if bool(v.get("alive", true)):
		_bad("R8.6", "die() 后仍 alive")
		return
	if not bool(v.get("ghost", false)):
		_bad("R8.6", "死亡后未进入幽灵态（穿墙/全视依赖此标记）")
		return
	if (v["bodyPos"] as Vector2).distance_to(p0) > 0.01:
		_bad("R8.6", "bodyPos 未固定在死亡点：%s vs %s" % [v["bodyPos"], p0])
		return
	# 幽灵穿墙移动后，尸体位置不能跟着漂
	v["pos"] = p0 + Vector2(60.0, 60.0)
	if (v["bodyPos"] as Vector2).distance_to(p0) > 0.01:
		_bad("R8.6", "幽灵移动后 bodyPos 被带动：%s" % v["bodyPos"])
		return
	# 被驱逐者没有尸体：举报候选里必须跳过 deathCause=vote
	_close_pre_meeting(sim)
	var me: Dictionary = sim.agent(sim.me_idx)
	var w: Dictionary = sim.agent(2)
	w["deathCause"] = "vote"
	sim.die(w)
	w["bodyPos"] = (me["pos"] as Vector2) + Vector2(0.8, 0.0)
	w["bodyGone"] = false
	w["bodyReported"] = false
	var r: Dictionary = sim.can_act("report")
	if bool(r.get("ok", false)) and int(r.get("target", -1)) == 2:
		_bad("R8.6", "被驱逐者仍可作为尸体被举报")
		return
	_ok("R8.6")


## R2.10 每夜开始重置当夜状态：刀数、破坏、拖拽、红身、眩晕、站桩、押送、机器人电量。
func _case_r2_10(sim: Variant) -> void:
	if sim.agents.size() < 2:
		_bad("R2.10", "席位不足")
		return
	var a: Dictionary = sim.agent(1)
	a["knife"] = 0
	a["sabUsed"] = true
	a["drag"] = 2
	a["draggedBy"] = 3
	a["redT"] = 1.5
	a["rushT"] = 1.0
	a["stunT"] = 2.0
	a["doing"] = 2.5
	a["_doing"] = "fix"
	a["detained"] = true
	sim.bot_hp["medbot"] = 0
	var med_expect: int = int((_space.get("bot", {}) as Dictionary).get("hp_medbot", 1))
	sim._start_night(false)
	var bad := []
	if int(a.get("knife", -1)) != 1:
		bad.append("knife=%d" % int(a.get("knife", -1)))
	if bool(a.get("sabUsed", true)):
		bad.append("sabUsed 未清")
	if int(a.get("drag", 0)) != -1 or int(a.get("draggedBy", 0)) != -1:
		bad.append("拖拽关系未解")
	if float(a.get("redT", 1.0)) != 0.0 or float(a.get("rushT", 1.0)) != 0.0:
		bad.append("红身/击杀加速未清")
	if float(a.get("stunT", 1.0)) != 0.0:
		bad.append("眩晕未清")
	if float(a.get("doing", 1.0)) != 0.0 or String(a.get("_doing", "x")) != "":
		bad.append("站桩未清")
	if bool(a.get("detained", true)):
		bad.append("押送未解")
	if int(sim.bot_hp.get("medbot", -1)) != med_expect:
		bad.append("医疗无人机电量未复位（%d≠%d）" % [int(sim.bot_hp.get("medbot", -1)), med_expect])
	if not bad.is_empty():
		_bad("R2.10", "、".join(bad))
		return
	_ok("R2.10")


## R9.2 破坏落点：该舱室任务点里均匀随机抽一个，同一夜同舱室缓存同一个落点。
func _case_r9_2(sim: Variant) -> void:
	var rooms: Array = _map.get("rooms", []) as Array
	var rid := ""
	for r: Dictionary in rooms:
		var id := String(r.get("id", ""))
		if id == "bridge" or id == "":
			continue
		for p: Dictionary in (sim.points as Array):
			if String(p.get("room", "")) == id:
				rid = id
				break
		if rid != "":
			break
	if rid == "":
		_bad("R9.2", "找不到带任务点的舱室")
		return
	var p1: Vector2 = sim.sab_spot_for(rid)
	var p2: Vector2 = sim.sab_spot_for(rid)
	if p1.distance_to(p2) > 0.001:
		_bad("R9.2", "同夜同舱室两次取落点不一致：%s vs %s" % [p1, p2])
		return
	# 缓存只属于这一夜：startNight 必须清掉（2.5D delete SAB_SPOT_CACHE）
	sim._start_night(false)
	if not (sim._sab_spots as Dictionary).is_empty():
		_bad("R9.2", "跨夜未清落点缓存（_sab_spots=%s）" % JSON.stringify(sim._sab_spots))
		return
	_ok("R9.2")


func _initialize() -> void:
	_map = _load_json(MAP_PATH)
	_space = _load_json(SPACE_PATH)
	if _map.is_empty() or _space.is_empty():
		print("RULETEST FAIL 数据缺失")
		quit(1)
		return
	var cases: Array = [
		["R5.4", Callable(self, "_case_r5_4")],
		["R2.7", Callable(self, "_case_r2_7")],
		["R8.5", Callable(self, "_case_r8_5")],
		["R9.1", Callable(self, "_case_r9_1")],
		["R4.4", Callable(self, "_case_r4_4")],
		["R2.8", Callable(self, "_case_r2_8")],
		["R10.5", Callable(self, "_case_r10_5")],
		["R10.3", Callable(self, "_case_r10_3")],
		["R8.6", Callable(self, "_case_r8_6")],
		["R2.10", Callable(self, "_case_r2_10")],
		["R9.2", Callable(self, "_case_r9_2")],
	]
	print("RULETEST 开始：", cases.size(), " 个 case")
	for row: Array in cases:
		var cid: String = String(row[0])
		var fn: Callable = row[1] as Callable
		var sim: Variant = _new_sim()
		fn.call(sim)
	print("RULETEST ", _pass, " 通过 / ", _fails.size(), " 失败")
	for f: String in _fails:
		print("  - ", f)
	quit(0 if _fails.is_empty() else 1)
