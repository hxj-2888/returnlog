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

## 数值全部来自 space.json#bot（由 3d/tools/export-space.cjs 从 js/game.js 的
## BOT_* / MEDBOT_* 具名常量导出）；下方的初始值只是「导出缺字段」时的兜底。
var MED_SPEED := 4.6
var MED_HEAL_TIME := 7.0
var MED_TOUCH_R := 1.15
var MED_STUN := 3.0
var med_t := 0.0
const CATCH_REACH := 1.2
## 2.5D secCatch 状态机：追捕 7 秒还贴不到就**放弃**（不是硬拖走）；
## 贴到 → 压制 0.9 秒 → 押送 1.2 秒（人是被 lerp 带过去的，不是瞬移）。
const CHASE_TIMEOUT := 7.0
const PRESS_TIME := 0.9
const ESCORT_TIME := 1.2
## 拘留证据的目击半径：压制瞬间 10m、押送到位 8m（2.5D witnessDetain）
const DETAIN_WITNESS_PRESS := 10.0
const DETAIN_WITNESS_JAIL := 8.0

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
	med_t = 0.0
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
		MED_SPEED = float(bc.get("med_fly_speed", MED_SPEED))
		MED_HEAL_TIME = float(bc.get("med_heal_time", MED_HEAL_TIME))
		MED_TOUCH_R = float(bc.get("med_touch_r", MED_TOUCH_R))
		MED_STUN = float(bc.get("med_stun", MED_STUN))
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


## 2.5D startNight（js/game.js:7829）：医疗电量 / 保安擒拿次数 / 机器人死亡标记 /
## 押送状态 / 治疗计时**每夜**全部复位。3D 之前只在 setup() 归零，整局最多救 2 次
## （2.5D 是每夜 2 次），这是「救起 1.5/局 vs 2.5D 3.34/局」的主因。
func reset_night() -> void:
	sec_uses = 0
	med_uses = 0
	med_target = -1
	med_t = 0.0
	catch_state = {}
	dead = {}
	sec_pos = sec_home
	med_pos = med_home


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
	if not would_see(at):
		return false
	_start_catch(actor_i)
	return true


## 保安能不能看见某点（2.5D secbotWouldSee 同源）：6m + 180° 前方 + 只看墙。
## AI 出手前用它预判，和真正抓人共用同一判据，避免"AI 以为安全、结果被抓"。
func would_see(at: Vector2) -> bool:
	if is_dead("secbot") or sec_uses >= SEC_USES_MAX:
		return false
	if at.distance_to(sec_pos) > SEC_RANGE:
		return false
	if sim.nav != null and not sim.nav.los_walls(sec_pos, at):
		return false
	var diff := wrapf((at - sec_pos).angle() - sec_ang, -PI, PI)
	return absf(diff) <= SEC_ARC


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


## 机器人当前位置（2.5D botPos；sec_pos 在巡逻/追捕中更新）
func pos_of(kind: String) -> Vector2:
	if kind == "secbot":
		return sec_pos
	return med_pos


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
		if sec_pos.distance_to(kp) <= CATCH_REACH:
			# 贴到人 → 压制 0.9 秒（2.5D press），压制瞬间周围 10m 内看得见的人记一笔
			catch_state["phase"] = "press"
			catch_state["t"] = 0.0
			killer["doing"] = 0.0
			killer["path"] = PackedVector2Array()
			_witness_detain(i, kp, DETAIN_WITNESS_PRESS)
			sim._log("detain", {"actor": i, "phase": "press"})
		elif float(catch_state.get("t", 0.0)) > CHASE_TIMEOUT:
			# 追不到就放弃（2.5D：7 秒还没贴到人 → G.secCatch=null），不再硬押
			sim._log("detain", {"actor": i, "phase": "giveup"})
			_release()
		return

	if phase == "press":
		killer["pos"] = sec_pos + (kp - sec_pos).normalized() * 0.55 if \
			sec_pos.distance_to(kp) > 0.01 else kp
		killer["doing"] = 0.0
		killer["path"] = PackedVector2Array()
		if float(catch_state.get("t", 0.0)) >= PRESS_TIME:
			catch_state["phase"] = "escort"
			catch_state["t"] = 0.0
			catch_state["from"] = killer.get("pos", kp)
			killer["detained"] = true
			sim._log("detain", {"actor": i, "phase": "escort"})
		return

	if phase == "escort":
		# 1.2 秒定点押送：机器人朝拘留位走，人在起点与拘留位之间按进度插值
		var t_esc := clampf(float(catch_state.get("t", 0.0)) / ESCORT_TIME, 0.0, 1.0)
		var from: Vector2 = catch_state.get("from", kp)
		killer["pos"] = from.lerp(jail, t_esc)
		killer["doing"] = 0.0
		killer["path"] = PackedVector2Array()
		sec_pos = sec_pos.move_toward(jail, SEC_CHASE_SPEED * dt)
		sec_ang = (jail - sec_pos).angle() if sec_pos.distance_to(jail) > 0.001 else sec_ang
		if t_esc >= 1.0:
			catch_state["phase"] = "jail"
			catch_state["t"] = DETAIN_TIME
			killer["pos"] = jail
			_witness_detain(i, jail, DETAIN_WITNESS_JAIL)
			sim._log("detain", {"actor": i, "phase": "jail", "dur": DETAIN_TIME})
		return

	# jail：硬控 30 秒，人锁在拘留位
	killer["pos"] = jail
	killer["doing"] = 0.0
	killer["path"] = PackedVector2Array()
	if float(catch_state.get("t", DETAIN_TIME)) >= DETAIN_TIME:
		sim._log("detain", {"actor": i, "phase": "release"})
		_release()


## 拘留证据（2.5D witnessDetain）：压制瞬间 10m、押送到位 8m，看得见的人各记一条
## `saw_detain`。**绝不写 known** —— 被抓的可能是开枪的人类；
## 同一夜同一人只记一次（`detainSeen` 按夜清空，见 sim._reset_agent_night）。
func _witness_detain(actor_i: int, at: Vector2, radius: float) -> void:
	if sim == null or sim.mind == null:
		return
	for w: Dictionary in sim.agents:
		var wi := int(w.get("i", -1))
		if wi == actor_i or not bool(w.get("alive", false)) or bool(w.get("downed", false)):
			continue
		if (w.get("pos", Vector2.ZERO) as Vector2).distance_to(at) > radius:
			continue
		if not sim.ai_can_see(w, at):
			continue
		var seen: Dictionary = (w.get("detainSeen", {}) as Dictionary).duplicate()
		if seen.has(actor_i):
			continue
		seen[actor_i] = int(sim.night)
		w["detainSeen"] = seen
		sim.mind.note_sight(wi, actor_i, "saw_detain", at)


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


## 2.5D medbotTick（js/game.js:4688）：沿用上一帧目标 → 飞到 MEDBOT_TOUCH_R 内
## → 近身悬停读条 MEDBOT_HEAL_TIME 秒 → 才真正拉起；途中不计时，计时与目标一起清零。
## 3D 之前是「贴到 1.2 米立刻救」，少了整段治疗前摇，也少了救起后的眩晕。
func _tick_med(dt: float) -> void:
	if is_dead("medbot") or med_uses >= MED_USES_MAX:
		return
	if med_target >= 0 and not _downed(med_target):
		med_target = -1
		med_t = 0.0
	if med_target < 0:
		med_target = _find_downed()
		med_t = 0.0
	if med_target < 0:
		med_t = 0.0
		med_pos = med_pos.move_toward(med_home, MED_SPEED * 0.75 * dt)
		return
	var t: Dictionary = sim.agent(med_target)
	var tp: Vector2 = t.get("pos", Vector2.ZERO)
	if med_pos.distance_to(tp) > MED_TOUCH_R:
		med_t = 0.0
		med_pos = med_pos.move_toward(tp, MED_SPEED * dt)
		return
	med_t += dt
	if med_t < MED_HEAL_TIME:
		return
	sim.revive(med_target, "medbot", MED_STUN)
	med_uses += 1
	med_t = 0.0
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
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		# 2.5D medbotTick：只响应医疗间内的濒死者（inMedRoom），不做全船飞行。
		# 之前 3D 全船找目标 + 7 秒治疗前摇，无人机飞不到人就没了（20 局只救起 3 次）。
		if sim.room_at(ap) != "med":
			continue
		var d: float = med_pos.distance_to(ap)
		if d < bd:
			bd = d
			best = int(a.get("i", -1))
	return best
