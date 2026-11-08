extends RefCounted
## 两台机器人的 3D 状态机（对应 2.5D `js/game.js` 4442–4726 的 botTick / secCatchTick）。
##
## 保安机器人：4 点巡逻（1.6 格/秒）→ 6 格 + 前方 180° + 真实视线发现犯罪
##            → 7.5 格/秒追逐 → 押送到军械库角落 → 拘留 30 秒（每夜 2 次）。
## 医疗无人机：坞位待命 → 有濒死者就飞过去救起（每夜 2 次）。
##
## 只写位置 / 拘留 / 救人，不改 sus / 投票 / 胜负；犯罪事实由 sim 在
## knife() / shoot() 里主动调 `on_crime()` 告知，不自己扫事件流。

const SpaceData := preload("res://scripts/space_data.gd")

## 数值全部来自 space.json#bot（由 3d/tools/export-space.cjs 从 js/game.js 具名常量导出），
## 这里只放"不在 2.5D 表里"的表现常量。
const MED_SPEED := 4.2
const CATCH_REACH := 1.2

var SEC_RANGE := 6.0
var SEC_ARC := PI * 0.5
var DETAIN_TIME := 30.0
var SEC_USES_MAX := 2
var MED_USES_MAX := 2
var SEC_SPEED := 1.6
var SEC_CHASE_SPEED := 7.5

var sim
var space: Dictionary = {}

var sec_pos := Vector2.ZERO
var sec_wps: Array = []
var sec_wp := 0
var sec_ang := 0.0
var sec_uses := 0
var sec_home := Vector2.ZERO

var med_pos := Vector2.ZERO
var med_home := Vector2.ZERO
var med_uses := 0
var med_target := -1

var jail := Vector2.ZERO
## {i, phase: chase|escort|jail, t}
var catch_state: Dictionary = {}
var dead: Dictionary = {}


func setup(p_sim, p_space: Dictionary) -> void:
	sim = p_sim
	space = p_space
	sec_wps = []
	sec_wp = 0
	sec_uses = 0
	sec_ang = 0.0
	med_uses = 0
	med_target = -1
	catch_state = {}
	dead = {}
	if sim == null:
		return
	var bc: Dictionary = space.get("bot", {}) as Dictionary
	if not bc.is_empty():
		SEC_RANGE = float(bc.get("sec_range", SEC_RANGE))
		SEC_ARC = PI / float(bc.get("sec_arc_div", 2.0))
		DETAIN_TIME = float(bc.get("detain_sec", DETAIN_TIME))
		SEC_USES_MAX = int(bc.get("sec_uses", SEC_USES_MAX))
		MED_USES_MAX = int(bc.get("med_uses", MED_USES_MAX))
		SEC_SPEED = float(bc.get("speed", SEC_SPEED))
		SEC_CHASE_SPEED = float(bc.get("catch_speed", SEC_CHASE_SPEED))
	for fac: Dictionary in (sim.map.get("facility", []) as Array):
		var kind := String(fac.get("kind", ""))
		var p := Vector2(float(fac.get("x", 0.0)), float(fac.get("y", 0.0)))
		if kind == "secbot":
			sec_home = _free(p)
			sec_pos = sec_home
			for q: Array in (fac.get("patrol", []) as Array):
				sec_wps.append(_free(Vector2(float(q[0]), float(q[1]))))
			if sec_wps.is_empty():
				sec_wps = [sec_home]
			jail = _free(p + Vector2(1.7, 1.3))
		elif kind == "medbot":
			med_home = _free(p)
			med_pos = med_home


func _free(p: Vector2) -> Vector2:
	if sim != null and sim.nav != null:
		return sim.nav.nearest_free(p)
	return p


func tick(dt: float) -> void:
	if sim == null or sim.over:
		return
	# 会议期间两台机器人停摆：2.5D 也是会议里不跑 botTick，否则押送会和投票打架
	if not sim.meeting.is_empty():
		return
	_tick_sec(dt)
	_tick_med(dt)


## 犯罪上报：sim.knife / sim.shoot 里调。只有"看得见 + 角度内 + 额度没用完"才抓。
func on_crime(actor_i: int, at: Vector2) -> bool:
	if sim == null or sim.over:
		return false
	if not catch_state.is_empty() or sec_uses >= SEC_USES_MAX:
		return false
	if at.distance_to(sec_pos) > SEC_RANGE:
		return false
	if sim.nav != null and not sim.nav.los(sec_pos, at):
		return false
	var diff := wrapf((at - sec_pos).angle() - sec_ang, -PI, PI)
	if absf(diff) > SEC_ARC:
		return false
	_start_catch(actor_i)
	return true


func _start_catch(i: int) -> void:
	catch_state = {"i": i, "phase": "chase", "t": 0.0}
	sec_uses += 1
	if sim != null:
		sim._log("detain", {"actor": i, "phase": "chase",
			"x": snappedf(sec_pos.x, 0.1), "y": snappedf(sec_pos.y, 0.1)})


func _patrol(dt: float) -> void:
	if sec_wps.is_empty():
		return
	var w: Vector2 = sec_wps[sec_wp % sec_wps.size()]
	var d := w.distance_to(sec_pos)
	if d < 0.3:
		sec_wp = (sec_wp + 1) % sec_wps.size()
		return
	sec_pos = sec_pos.move_toward(w, SEC_SPEED * dt)
	sec_ang = (w - sec_pos).angle() if d > 0.001 else sec_ang


func is_dead(kind: String) -> bool:
	return bool(dead.get(kind, false))


func kill(kind: String) -> void:
	dead[kind] = true
	# 保安被拆时立刻释放被押的人
	if kind == "secbot" and not catch_state.is_empty():
		_release()


func _tick_sec(dt: float) -> void:
	if is_dead("secbot"):
		return
	if catch_state.is_empty():
		_patrol(dt)
	else:
		_tick_catch(dt)


func _tick_catch(dt: float) -> void:
	var i := int(catch_state.get("i", -1))
	var killer: Dictionary = {}
	if sim != null:
		killer = sim.agent(i)
	if killer.is_empty() or not bool(killer.get("alive", false)):
		_release()
		return
	var phase := String(catch_state.get("phase", "chase"))
	catch_state["t"] = float(catch_state.get("t", 0.0)) + dt
	var kp: Vector2 = killer.get("pos", Vector2.ZERO)

	if phase == "chase":
		sec_pos = sec_pos.move_toward(kp, SEC_CHASE_SPEED * dt)
		sec_ang = (kp - sec_pos).angle() if sec_pos.distance_to(kp) > 0.001 else sec_ang
		if sec_pos.distance_to(kp) <= CATCH_REACH or float(catch_state.get("t", 0.0)) > 7.0:
			catch_state["phase"] = "escort"
			catch_state["t"] = 0.0
			killer["detained"] = true
			killer["doing"] = 0.0
			killer["path"] = PackedVector2Array()
			sim._log("detain", {"actor": i, "phase": "escort"})
		return

	if phase == "escort":
		sec_pos = sec_pos.move_toward(jail, SEC_CHASE_SPEED * dt)
		# 被押的人贴着机器人走，不能自己动
		killer["pos"] = sec_pos + Vector2(0.55, 0.0)
		killer["doing"] = 0.0
		killer["path"] = PackedVector2Array()
		if sec_pos.distance_to(jail) <= 0.6:
			catch_state["phase"] = "jail"
			catch_state["t"] = DETAIN_TIME
			killer["pos"] = jail
			sim._log("detain", {"actor": i, "phase": "jail", "dur": DETAIN_TIME})
		return

	# jail：硬控 30 秒，人锁在拘留位
	killer["pos"] = jail
	killer["doing"] = 0.0
	killer["path"] = PackedVector2Array()
	if float(catch_state.get("t", DETAIN_TIME)) >= DETAIN_TIME:
		sim._log("detain", {"actor": i, "phase": "release"})
		_release()


func _release() -> void:
	var i := int(catch_state.get("i", -1))
	var a: Dictionary = {}
	if sim != null:
		a = sim.agent(i)
	if not a.is_empty():
		a["detained"] = false
		a["pos"] = _free(jail + Vector2(0.0, 1.4))
	catch_state = {}


func detained(i: int) -> bool:
	if catch_state.is_empty():
		return false
	if String(catch_state.get("phase", "")) == "chase":
		return false
	return int(catch_state.get("i", -1)) == i


func _tick_med(dt: float) -> void:
	if is_dead("medbot"):
		return
	if med_uses >= MED_USES_MAX:
		return
	if med_target >= 0 and not _downed(med_target):
		med_target = -1
	if med_target < 0:
		med_target = _find_downed()
	if med_target < 0:
		med_pos = med_pos.move_toward(med_home, MED_SPEED * dt)
		return
	var t: Dictionary = sim.agent(med_target)
	var tp: Vector2 = t.get("pos", Vector2.ZERO)
	med_pos = med_pos.move_toward(tp, MED_SPEED * dt)
	if med_pos.distance_to(tp) <= 1.2:
		sim.revive(med_target)
		med_uses += 1
		t["medTried"] = true
		med_target = -1


func _downed(i: int) -> bool:
	var a: Dictionary = sim.agent(i)
	return not a.is_empty() and bool(a.get("alive", false)) and bool(a.get("downed", false)) \
		and not bool(a.get("medTried", false))


func _find_downed() -> int:
	var best := -1
	var bd := 1.0e9
	for a: Dictionary in sim.agents:
		if not bool(a.get("alive", false)) or not bool(a.get("downed", false)):
			continue
		if bool(a.get("medTried", false)):
			continue
		var d: float = med_pos.distance_to(a.get("pos", Vector2.ZERO))
		if d < bd:
			bd = d
			best = int(a.get("i", -1))
	return best
