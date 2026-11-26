extends SceneTree
## A1–A6 语义回归夹具（反例 + 正向对照）
##
## 用法：
##   godot_console --headless --path 3d/preview --script res://scripts/tests/test_a1_a6.gd

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


func _test_a1_cred_add() -> void:
	var sim = _new_sim(101)
	var a: Dictionary = sim.agent(1)
	var cred: Dictionary = (a.get("cred", {}) as Dictionary).duplicate()
	cred[2] = 0.5
	a["cred"] = cred
	sim.mind.cred_add(a, 2, "", -0.14)
	var after_neg: float = sim.mind.cred_of(a, 2)
	if absf(after_neg - 0.36) > 0.001:
		_bad("A1-负信誉", "期望 0.5+(-0.14)=0.36，实得 %.4f" % after_neg)
		return
	sim.mind.cred_add(a, 2, "", 0.20)
	var after_pos: float = sim.mind.cred_of(a, 2)
	if absf(after_pos - 0.56) > 0.001:
		_bad("A1-正加分", "期望 0.36+0.20=0.56，实得 %.4f" % after_pos)
		return
	sim.mind.cred_add(a, 2, "__missing_key__")
	if absf(sim.mind.cred_of(a, 2) - 0.56) > 0.001:
		_bad("A1-缺省无效键", "期望不变 0.56，实得 %.4f" % sim.mind.cred_of(a, 2))
		return
	_ok("A1-cred_add")


func _test_a2_ghost_tick() -> void:
	var sim = _new_sim(102)
	var g: Dictionary = sim.agent(1)
	g["alien"] = false
	g["alive"] = false
	g["downed"] = false
	g["ghost"] = true
	g["tIdx"] = 0
	g["ghostPts"] = 0
	g["doing"] = 6.4
	g["_doing"] = "task"
	var pts: Array = g.get("tasks", []) as Array
	if pts.is_empty():
		_bad("A2-准备", "幽灵无任务点")
		return
	for k in range(pts.size()):
		if sim.task_pts(int(pts[k])) <= sim.ghost_cap():
			g["tIdx"] = k
			g["taskPt"] = int(pts[k])
			break
	var init_idx := int(g.get("tIdx", 0))
	sim._ghost_tick(g, 1.0)
	var d1 := float(g.get("doing", 0.0))
	if absf(d1 - 5.4) > 0.01:
		_bad("A2-读条保持", "推进 1s 后期望 doing=5.4，实得 %.2f" % d1)
		return
	for _k in range(10):
		sim._ghost_tick(g, 1.0)
	if float(g.get("doing", 0.0)) > 0.0 or int(g.get("tIdx", 0)) != init_idx + 1 \
			or int(g.get("ghostPts", 0)) < 1:
		_bad("A2-完成结算", "doing=%.2f tIdx=%d->%d ghostPts=%d" % [
			float(g.get("doing", 0.0)), init_idx, int(g.get("tIdx", 0)), int(g.get("ghostPts", 0))])
		return
	_ok("A2-ghost_tick")


func _test_a3_terminator() -> void:
	var sim = _new_sim(103)
	var tc: Dictionary = sim.rules.t("TERMINATOR")
	var term_night := int(tc.get("night", 10))
	var bullets := int(tc.get("bullets", 1))
	var h0: Dictionary = sim.agent(0)
	var h1: Dictionary = sim.agent(1)
	var al: Dictionary = {}
	var dead_a: Dictionary = {}
	for x: Dictionary in sim.agents:
		if bool(x.get("alien", false)) and al.is_empty():
			al = x
		elif not bool(x.get("alien", false)) and int(x.get("i", -1)) > 1 and dead_a.is_empty():
			dead_a = x
	h0["alien"] = false
	h0["bullet"] = 0
	h1["alien"] = false
	h1["bullet"] = 2
	al["bullet"] = 0
	dead_a["alive"] = false
	dead_a["bullet"] = 0

	sim.night = term_night - 1
	sim.check_terminator()
	if sim.terminator_on or int(h0.get("bullet", 0)) != 0:
		_bad("A3-未到夜不触发", "night=%d 就触发了" % sim.night)
		return

	sim.night = term_night
	sim.check_terminator()
	if not sim.terminator_on:
		_bad("A3-到夜触发", "terminator_on 仍为 false")
		return
	if int(h0.get("bullet", 0)) != bullets or int(h1.get("bullet", 0)) != 2 \
			or int(al.get("bullet", 0)) != bullets or int(dead_a.get("bullet", 0)) != 0:
		_bad("A3-补弹口径", "h0=%d h1=%d al=%d dead=%d" % [
			int(h0.get("bullet", 0)), int(h1.get("bullet", 0)),
			int(al.get("bullet", 0)), int(dead_a.get("bullet", 0))])
		return
	if bool(tc.get("reveal", true)):
		var kh: Dictionary = h0.get("known", {}) as Dictionary
		if not kh.has(int(al.get("i", -1))):
			_bad("A3-公开身份", "人类未获知异形 known")
			return
	sim.check_terminator()
	if int(h0.get("bullet", 0)) != bullets:
		_bad("A3-幂等", "重复调用后子弹变为 %d" % int(h0.get("bullet", 0)))
		return
	_ok("A3-terminator")


func _test_a4_body_search_loot() -> void:
	var sim = _new_sim(104)
	var me: Dictionary = sim.agent(sim.me_idx)
	var b: Dictionary = sim.agent(3)
	var ai: Dictionary = sim.agent(4)
	b["alive"] = false
	b["downed"] = false
	b["bodyGone"] = false
	b["bullet"] = 2
	b["medkit"] = 1
	b["qual"] = 1
	b["searched"] = false
	b["draggedBy"] = 2
	me["bullet"] = 0
	ai["bullet"] = 0

	if sim.search_body(3, sim.me_idx):
		_bad("A4-拖搜互斥", "被拖尸体不应允许 search_body")
		return
	b["draggedBy"] = null

	if not sim.search_body(3, sim.me_idx):
		_bad("A4-玩家取证", "search_body 返回 false")
		return
	if int(me.get("bullet", 0)) != 0 or not bool(b.get("searched", false)):
		_bad("A4-取证不领物", "取证后 me.bullet=%d searched=%s" % [
			int(me.get("bullet", 0)), str(b.get("searched", false))])
		return

	b["draggedBy"] = 2
	var blocked_loot: Dictionary = sim.take_body_loot(3, sim.me_idx)
	if bool(blocked_loot.get("ok", false)) or int(me.get("bullet", 0)) != 0:
		_bad("A4-拖领互斥", "被拖尸体不应允许 take_body_loot")
		return
	b["draggedBy"] = null

	var l1: Dictionary = sim.take_body_loot(3, sim.me_idx)
	var l2: Dictionary = sim.take_body_loot(3, sim.me_idx)
	if not bool(l1.get("ok", false)) or int(me.get("bullet", 0)) != 1 \
			or not bool(l2.get("ok", false)) or int(l2.get("bullet", 0)) != 0:
		_bad("A4-独立领物", "me.bullet=%d l1=%s l2=%s" % [int(me.get("bullet", 0)), str(l1), str(l2)])
		return

	# AI 自动搜尸+领物对照
	var b2: Dictionary = sim.agent(5)
	b2["alive"] = false
	b2["downed"] = false
	b2["bodyGone"] = false
	b2["bullet"] = 1
	b2["searched"] = false
	b2["draggedBy"] = null
	if not sim.search_body(5, 4) or int(ai.get("bullet", 0)) != 1:
		_bad("A4-AI对照", "AI 自动搜尸后 ai.bullet=%d" % int(ai.get("bullet", 0)))
		return
	_ok("A4-body_search_loot")


func _test_a5_medbot_room() -> void:
	var sim = _new_sim(105)
	var v: Dictionary = sim.agent(3)
	var med_pos: Vector2 = _room_center("med")
	var bridge_pos: Vector2 = _room_center("bridge")
	v["alive"] = true
	v["downed"] = true
	v["medTried"] = false
	v["pos"] = med_pos
	sim.bots.med_pos = med_pos
	sim.bots._tick_med(0.1)
	if sim.bots.med_target != 3:
		_bad("A5-医疗间锁定", "期望锁定 3，实得 %d" % sim.bots.med_target)
		return
	v["pos"] = bridge_pos
	sim.bots._tick_med(0.1)
	if sim.bots.med_target != -1 or sim.bots.med_t != 0.0 or sim.bots.med_uses != 0:
		_bad("A5-追出医疗间", "移出后 target=%d t=%.2f uses=%d" % [
			sim.bots.med_target, sim.bots.med_t, sim.bots.med_uses])
		return
	v["pos"] = med_pos
	sim.bots.med_pos = med_pos
	sim.bots._tick_med(0.1)
	if sim.bots.med_target != 3:
		_bad("A5-回到医疗间", "移回后未重新锁定 target=%d" % sim.bots.med_target)
		return
	_ok("A5-medbot_room")


func _test_a6_alien_target() -> void:
	var sim = _new_sim(106)
	var a: Dictionary = {}
	var b: Dictionary = {}
	for x: Dictionary in sim.agents:
		if bool(x.get("alien", false)):
			if a.is_empty():
				a = x
			elif b.is_empty():
				b = x
			else:
				x["alive"] = false
		else:
			x["alive"] = false
	if a.is_empty() or b.is_empty():
		_bad("A6-准备", "缺少两个异形")
		return
	var pos: Vector2 = _room_center("bridge")
	a["alive"] = true
	a["downed"] = false
	a["pos"] = pos
	a["mates"] = {}
	b["alive"] = true
	b["downed"] = false
	b["pos"] = pos + Vector2(1.0, 0.0)
	a["target"] = -1
	sim._ai_alien._decide(a)
	var tgt_unrecognized: int = int(a.get("target", -1))
	if tgt_unrecognized != int(b.get("i", -1)):
		_bad("A6-未认队友", "未识别同类应进入候选，期望 %d，实得 %d" % [int(b.get("i", -1)), tgt_unrecognized])
		return
	a["mates"] = {int(b.get("i", -1)): {"t": 0.0}}
	a["target"] = -1
	sim._ai_alien._decide(a)
	var tgt_mate: int = int(a.get("target", -1))
	if tgt_mate != -1:
		_bad("A6-已认队友", "已识别队友应排除，期望 -1，实得 %d" % tgt_mate)
		return
	_ok("A6-alien_target")


func _initialize() -> void:
	_map = _load_json(MAP_PATH)
	_space = _load_json(SPACE_PATH)
	if _map.is_empty() or _space.is_empty():
		push_error("无法加载 map.json / space.json")
		quit(1)
		return
	print("A1_A6_TEST 开始")
	_test_a1_cred_add()
	_test_a2_ghost_tick()
	_test_a3_terminator()
	_test_a4_body_search_loot()
	_test_a5_medbot_room()
	_test_a6_alien_target()
	print("A1_A6_TEST %d 通过 / %d 失败" % [_pass, _fails.size()])
	quit(0 if _fails.is_empty() else 1)
