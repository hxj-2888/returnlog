extends SceneTree
## 场景夹具执行器（2026-11-14）
##
## 为什么独立于 main.gd：main.gd 已到 5,550 行预算上限（棘轮只许下调），
## 新增 --rulestest 参数与分发必然破门禁。这里走 `--script` 直接拉起 sim，
## 不依赖任何场景节点 —— sim 是纯模拟层（3d/ARCHITECTURE.md §3 硬规则 1）。
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

func _initialize() -> void:
	_map = _load_json(MAP_PATH)
	_space = _load_json(SPACE_PATH)
	if _map.is_empty() or _space.is_empty():
		print("RULETEST FAIL 数据缺失")
		quit(1)
		return
	print("RULETEST 开始：", 4, " 个 case")
	var cases: Array = [
		["R5.4", Callable(self, "_case_r5_4")],
		["R2.7", Callable(self, "_case_r2_7")],
		["R8.5", Callable(self, "_case_r8_5")],
		["R9.1", Callable(self, "_case_r9_1")],
	]
	for row: Array in cases:
		var cid: String = String(row[0])
		var fn: Callable = row[1] as Callable
		var sim: Variant = _new_sim()
		fn.call(sim)
	print("RULETEST ", _pass, " 通过 / ", _fails.size(), " 失败")
	for f: String in _fails:
		print("  - ", f)
	quit(0 if _fails.is_empty() else 1)
