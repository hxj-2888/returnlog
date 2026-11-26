extends SceneTree
## V1.0 增量移植回归夹具（补给冷却 / 断电阻塞 / 躲枪 / 出刀风控 / 信任与情绪轴）

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
		return {}
	var v: Variant = JSON.parse_string(f.get_as_text())
	return v if v is Dictionary else {}


func _new_sim(seed_v: int = 20261122) -> Variant:
	var sim_script: Variant = load(SIM_PATH)
	var sim: Variant = sim_script.new()
	sim.new_game(seed_v, 0, _map, _space)
	sim.ai_enabled = false
	sim.speech_enabled = false
	sim.meeting = {}
	sim.t = 75.0
	return sim


func _ok(name: String) -> void:
	_pass += 1
	print("  PASS %s" % name)


func _bad(name: String, why: String) -> void:
	_fails.append("%s: %s" % [name, why])
	print("  FAIL %s  %s" % [name, why])


func _room_center(rid: String) -> Vector2:
	for r: Dictionary in (_map.get("rooms", []) as Array):
		if String(r.get("id", "")) == rid:
			var lab: Array = r.get("label", []) as Array
			if lab.size() >= 2:
				return Vector2(float(lab[0]), float(lab[1]))
	return Vector2(31.0, 33.5)


func _test_supply_cd() -> void:
	var sim = _new_sim(201)
	var a: Dictionary = sim.agent(0)
	a["qual"] = 2
	a["bullet"] = 0
	if not sim.exchange_supply("ammo", 0):
		_bad("V1-补给冷却", "首次兑换应成功")
		return
	if sim.supply_cool_left("ammo") <= 0.0:
		_bad("V1-补给冷却", "兑换后应进入冷却")
		return
	if sim.exchange_supply("ammo", 0):
		_bad("V1-补给冷却", "冷却中不应允许再次兑换")
		return
	sim.supply_cd_tick(25.0)
	if sim.supply_cool_left("ammo") != 0.0 or not sim.exchange_supply("ammo", 0):
		_bad("V1-补给冷却", "冷却归零后应恢复兑换")
		return
	_ok("V1-supply_cd")


func _test_room_out_blocks_task() -> void:
	var sim = _new_sim(202)
	var a: Dictionary = sim.agent(1)
	var pts: Array = a.get("tasks", []) as Array
	var pt_i := -1
	var rid := ""
	for pi: Variant in pts:
		var p: Dictionary = sim.point(int(pi))
		var r := String(p.get("room", ""))
		if r != "" and r != "bridge":
			pt_i = int(pi)
			rid = r
			break
	if pt_i < 0:
		_bad("V1-断电阻塞", "未找到非舰桥任务点")
		return
	a["doing"] = 5.0
	a["_doing"] = "task"
	a["taskPt"] = pt_i
	sim.sabotage_room(rid, 2, false)
	if not sim.out_blocks_doing(a):
		_bad("V1-断电阻塞", "破坏后同舱任务应被阻塞")
		return
	sim.tick(1.0)
	if absf(float(a.get("doing", 0.0)) - 5.0) > 0.01:
		_bad("V1-断电阻塞", "断电期间 doing 不应倒计时，实得 %.2f" % float(a.get("doing", 0.0)))
		return
	sim.fix_damage(rid, 1)
	if sim.out_blocks_doing(a):
		_bad("V1-断电阻塞", "修好故障后应解除阻塞")
		return
	_ok("V1-room_out")


func _test_gun_dodge() -> void:
	var sim = _new_sim(203)
	var pos: Vector2 = _room_center("bridge")
	var a: Dictionary = sim.agent(0)
	var o: Dictionary = sim.agent(1)
	a["alien"] = false
	a["alive"] = true
	a["downed"] = false
	a["pos"] = pos
	o["alien"] = true
	o["alive"] = true
	o["downed"] = false
	o["pos"] = pos + Vector2(3.0, 0.0)
	sim.mind.trust_cert(a, 1, true)
	var th: Dictionary = sim.gun_threat_from(a)
	if int(th.get("i", -1)) != 1:
		_bad("V1-躲枪威胁", "应识别已确证威胁 1，实得 %s" % str(th.get("i", -1)))
		return
	var dodged: bool = sim.gun_dodge_step(a, 0.1)
	if not dodged or (a.get("pos", Vector2.ZERO) as Vector2).distance_to(pos) <= 0.01:
		_bad("V1-躲枪位移", "应产生侧向闪避位移")
		return
	_ok("V1-gun_dodge")


func _test_knife_risk_and_mate() -> void:
	var sim = _new_sim(204)
	var pos: Vector2 = _room_center("bridge")
	var a: Dictionary = {}
	var m: Dictionary = {}
	var h: Dictionary = {}
	for x: Dictionary in sim.agents:
		if bool(x.get("alien", false)):
			if a.is_empty():
				a = x
			elif m.is_empty():
				m = x
			else:
				x["alive"] = false
		elif h.is_empty():
			h = x
		else:
			x["alive"] = false
	a["pos"] = pos
	h["pos"] = pos + Vector2(1.2, 0.0)
	m["pos"] = pos + Vector2(1.0, 0.2)
	a["mates"] = {int(m.get("i", -1)): {"t": 0.0}}
	if not sim._ai_alien.knife_would_hit_mate(a, h):
		_bad("V1-出刀防误伤", "队友在刀弧内应被拦截")
		return
	m["alive"] = false
	var w: Dictionary = sim.agent(0) if sim.agent(0) != h else sim.agent(1)
	w["alien"] = false
	w["alive"] = true
	w["downed"] = false
	w["pos"] = pos + Vector2(-2.0, 0.0)
	if not sim._ai_alien.knife_blocked(a, h):
		_bad("V1-出刀目击风险", "有非队友目击时应拦截出刀")
		return
	w["alive"] = false
	if sim._ai_alien.knife_blocked(a, h):
		_bad("V1-出刀安全", "无目击者时应允许出刀")
		return
	_ok("V1-knife_risk")


func _test_trust_and_emo() -> void:
	var sim = _new_sim(205)
	var a: Dictionary = sim.agent(0)
	a["alien"] = false
	sim.mind.axis_add_t(a, 1, -150.0)
	if sim.mind.hostile_prob(a, sim.agent(1)) <= 0.5:
		_bad("V1-信任轴", "大幅扣分后 hostile_prob 应 > 0.5")
		return
	sim.mind.emo_add(a, 2, -50.0, "test")
	if sim.mind.emotion_of(a, 2) >= 0.0:
		_bad("V1-情绪轴", "负向情绪后 emotion_of 应为负")
		return
	_ok("V1-trust_emo")


func _initialize() -> void:
	_map = _load_json(MAP_PATH)
	_space = _load_json(SPACE_PATH)
	if _map.is_empty() or _space.is_empty():
		quit(1)
		return
	print("V1_PORT_TEST 开始")
	_test_supply_cd()
	_test_room_out_blocks_task()
	_test_gun_dodge()
	_test_knife_risk_and_mate()
	_test_trust_and_emo()
	print("V1_PORT_TEST %d 通过 / %d 失败" % [_pass, _fails.size()])
	quit(0 if _fails.is_empty() else 1)
