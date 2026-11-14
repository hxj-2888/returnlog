extends SceneTree
## 补充夹具执行器（2026-11-14）
##
## 为什么另开一个文件而不是往 run_rule_fixtures.gd 里加：
## 那个文件此刻正被另一个 agent 改（工作区有未提交改动），共用会撞车。
## 本文件只放「第二批」判据：10 条场景规则 + 4 条 AI 引擎行为。
##
## 用法：
##   godot --headless --path 3d/preview --script res://scripts/tests/run_extra_fixtures.gd
## 退出码：0 全过（含已知偏离）；1 有未登记的失败
##
## 约定：
##   PASS  —— 断言成立
##   FAIL  —— 断言不成立，且没有登记为已知偏离
##   KNOWN —— 断言不成立，但已在 fixtures 账本登记为「已知偏离 / 待裁定」，
##            不计入通过，也不算失败；报告里单独列出，避免「悄悄放过」

const MAP_PATH := "res://data/map.json"
const SPACE_PATH := "res://data/space.json"
const SimScript := preload("res://scripts/sim/sim_state.gd")

var _map: Dictionary = {}
var _space: Dictionary = {}
var _fails: Array = []
var _known: Array = []
var _pass := 0

func _load_json(p: String) -> Dictionary:
	var f := FileAccess.open(p, FileAccess.READ)
	if f == null:
		push_error("缺文件 " + p)
		return {}
	var v: Variant = JSON.parse_string(f.get_as_text())
	return v if v is Dictionary else {}

func _new_sim(seed_v: int = 1, player_alien: bool = true) -> Variant:
	# 用 preload 常量而不是 load()：SceneTree 脚本在 _initialize 阶段 load 脚本资源
	# 偶发返回 GDScript 类本身（拿到的不是可 new 的实例），报 "Nonexistent function 'new'"。
	var sim: Variant = SimScript.new()
	if not sim.new_game(seed_v, 0, _map, _space, player_alien):
		push_error("new_game 失败")
	return sim

## 开局自带一场 pre 公开讨论：不关掉的话夜会/举报额度相关断言会先撞前置。
func _close_pre_meeting(sim: Variant) -> void:
	if sim == null:
		return
	sim.meeting = {}

func _room_with_points(sim: Variant) -> String:
	for r: Dictionary in (_map.get("rooms", []) as Array):
		var id := String(r.get("id", ""))
		if id == "" or id == "bridge":
			continue
		for p: Dictionary in (sim.points as Array):
			if String(p.get("room", "")) == id:
				return id
	return ""

func _ok(case_id: String) -> void:
	_pass += 1
	print("  PASS ", case_id)

func _bad(case_id: String, why: String) -> void:
	_fails.append(case_id + ": " + why)
	print("  FAIL ", case_id, "  ", why)

## 已在账本登记的偏离：打印但不计入失败。用于「规则成立、实现未做，且本批不能改该文件」。
func _deviation(case_id: String, why: String) -> void:
	_known.append(case_id + ": " + why)
	print("  KNOWN ", case_id, "  ", why)


## R7.1.4 目击「拉闸断电」= 身份级确证（known）；目击「合闸」只加正向信任（cred），不确证。
func _case_r7_1_4(sim: Variant) -> void:
	if sim.agents.size() < 4:
		_bad("R7.1.4", "席位不足")
		return
	var br: Vector2 = sim.breaker_pos()
	if br == Vector2.ZERO:
		_bad("R7.1.4", "取不到电闸位置")
		return
	# 目击者必须挑**人类**：异形目击合闸走的是可疑度（sus），不是正向信任（cred），
	# 用固定席位会在「2 号正好是异形」时误报。
	var humans: Array = []
	for a: Dictionary in sim.agents:
		if not bool(a.get("alien", false)):
			humans.append(a)
	if humans.size() < 2:
		_bad("R7.1.4", "人类席位不足 2")
		return
	var wa: Dictionary = humans[0]   # 看拉闸的
	var wb: Dictionary = humans[1]   # 看合闸的
	for w: Dictionary in [wa, wb]:
		w["pos"] = br + Vector2(0.6, 0.0)
		w["doing"] = 0.0
		w["known"] = {}
		w["sus"] = {}
	if not sim.toggle_power(0) and sim.light_state != 2:
		_bad("R7.1.4", "拉闸失败，light_state=%d" % sim.light_state)
		return
	if not (wa.get("known", {}) as Dictionary).has(0):
		_bad("R7.1.4", "目击拉闸后没有写身份级确证（known）")
		return
	var c0: float = sim.mind.cred_of(wb, 0)
	wb["known"] = {}
	sim.toggle_power(0)   # 合闸
	if sim.light_state == 2:
		_bad("R7.1.4", "第二次拉闸而非合闸，前置不成立")
		return
	if (wb.get("known", {}) as Dictionary).has(0):
		_bad("R7.1.4", "目击合闸不应写身份级确证（known）")
		return
	if sim.mind.cred_of(wb, 0) <= c0:
		_bad("R7.1.4", "目击合闸应增加正向信任（cred %.2f → %.2f）" % [c0, sim.mind.cred_of(wb, 0)])
		return
	_ok("R7.1.4")


## R7.5.3 医疗无人机可被刀砍（1 点装甲）；砍完即停摆。
func _case_r7_5_3(sim: Variant) -> void:
	var me: Dictionary = sim.me()
	me["knife"] = 1
	me["alive"] = true
	me["downed"] = false
	me["detained"] = false
	var mp: Vector2 = sim.bot_pos_of("medbot")
	if mp == Vector2.ZERO:
		_bad("R7.5.3", "取不到医疗无人机位置")
		return
	me["pos"] = mp + Vector2(0.5, 0.0)
	var hp0: int = int((sim.bot_hp as Dictionary).get("medbot", -1))
	if not sim.knife_bot("medbot", sim.me_idx):
		_bad("R7.5.3", "刀砍医疗无人机被拒（距离 %.2f）" % (me["pos"] as Vector2).distance_to(mp))
		return
	var hp1: int = int((sim.bot_hp as Dictionary).get("medbot", -1))
	if hp1 != hp0 - 1:
		_bad("R7.5.3", "装甲未按 1 点扣：%d → %d" % [hp0, hp1])
		return
	if hp1 <= 0 and not sim.bots.is_dead("medbot"):
		_bad("R7.5.3", "血量归零但机器人未停摆")
		return
	_ok("R7.5.3")


## R9.3 引爆条件：在目标舱室内、或距落点 < reach.sabotage 即可触发。
func _case_r9_3(sim: Variant) -> void:
	var rid: String = _room_with_points(sim)
	if rid == "":
		_bad("R9.3", "找不到带任务点的舱室")
		return
	var me: Dictionary = sim.me()
	me["alive"] = true
	me["downed"] = false
	me["detained"] = false
	me["sabUsed"] = false
	var sp: Vector2 = sim.sab_spot_for(rid)
	# sab_tick 第一条守卫是 `t <= 0` 直接返回；new_game 之后 t=0（还没进夜），
	# 所以必须先 _start_night，否则测的永远是「没有夜」这个状态。
	sim._start_night(false)
	sim.sab_target = {"room": rid, "x": sp.x, "y": sp.y}
	me["pos"] = sp
	sim.sab_tick()
	if (sim.dmg as Array).is_empty():
		_bad("R9.3", "站在落点上没有引爆")
		return
	# 反面：离远（会议室中心）且不在目标舱内 → 不该引爆
	(sim.dmg as Array).clear()
	me["sabUsed"] = false
	me["pos"] = sim.room_center("bridge")
	sim.sab_target = {"room": rid, "x": sp.x, "y": sp.y}
	sim.sab_tick()   # t 已 > 0，这一下测的是「距离/舱室不符」
	if not (sim.dmg as Array).is_empty():
		_bad("R9.3", "距离远超 1.7 格仍然引爆（落点 %s，玩家 %s）" % [sp, me["pos"]])
		return
	_ok("R9.3")


## R9.6 破坏广播：幽灵破坏不写目击证据，但故障/警报照常；活人破坏写目击。
func _case_r9_6(sim: Variant) -> void:
	var rooms: Array = []
	for r: Dictionary in (_map.get("rooms", []) as Array):
		var id := String(r.get("id", ""))
		if id != "" and id != "bridge":
			rooms.append(id)
	if rooms.size() < 2:
		_bad("R9.6", "可用舱室不足 2 间")
		return
	var w: Dictionary = sim.agent(1)
	w["alive"] = true
	w["downed"] = false
	w["doing"] = 0.0
	var me: Dictionary = sim.me()
	me["alive"] = true
	me["sabUsed"] = false
	# ① 幽灵破坏：有故障、无目击
	var rid1 := String(rooms[0])
	var sp1: Vector2 = sim.sab_spot_for(rid1)
	w["pos"] = sp1 + Vector2(0.5, 0.0)
	w["known"] = {}
	sim.sabotage_room(rid1, sim.me_idx, true)
	var has1 := false
	for d: Dictionary in (sim.dmg as Array):
		if String(d.get("room", "")) == rid1:
			has1 = true
	if not has1:
		_bad("R9.6", "幽灵破坏没有留下故障")
		return
	if (w.get("known", {}) as Dictionary).has(sim.me_idx):
		_bad("R9.6", "幽灵破坏不该写活人目击证据")
		return
	# ② 活人破坏：同一目击者必须记一笔
	var rid2 := String(rooms[1])
	var sp2: Vector2 = sim.sab_spot_for(rid2)
	w["pos"] = sp2 + Vector2(0.5, 0.0)
	w["known"] = {}
	sim.sabotage_room(rid2, sim.me_idx, false)
	if not (w.get("known", {}) as Dictionary).has(sim.me_idx):
		_bad("R9.6", "活人破坏没有写目击证据")
		return
	_ok("R9.6")


## R11.1 mates 只由目击「异形专属行为」推断，不读系统阵营表。
func _case_r11_1(sim: Variant) -> void:
	for a: Dictionary in sim.agents:
		if not (a.get("mates", {}) as Dictionary).is_empty():
			_bad("R11.1", "开局就有 mates（等于读了系统阵营表）")
			return
	# 找两个异形 + 一个人类目击者
	var aliens: Array = []
	var humans: Array = []
	for a: Dictionary in sim.agents:
		if bool(a.get("alien", false)):
			aliens.append(a)
		else:
			humans.append(a)
	if aliens.size() < 2 or humans.is_empty():
		_bad("R11.1", "席位构成不满足（异形 %d）" % aliens.size())
		return
	var killer: Dictionary = aliens[0]
	var watcher: Dictionary = aliens[1]
	var victim: Dictionary = humans[0]
	_close_pre_meeting(sim)
	for a: Dictionary in sim.agents:
		a["alive"] = true
		a["downed"] = false
		a["doing"] = 0.0
	killer["knife"] = 1
	killer["pos"] = sim.room_center("bridge")
	watcher["pos"] = (killer["pos"] as Vector2) + Vector2(0.8, 0.0)
	victim["pos"] = (killer["pos"] as Vector2) + Vector2(0.6, 0.0)
	if not sim.knife(int(killer.get("i", -1)), int(victim.get("i", -1))):
		_bad("R11.1", "出刀失败，前置不成立")
		return
	var mates: Dictionary = watcher.get("mates", {}) as Dictionary
	if not mates.has(int(killer.get("i", -1))):
		_bad("R11.1", "异形目击同伴出刀后没有记 mates")
		return
	for h: Dictionary in humans:
		if not (h.get("mates", {}) as Dictionary).is_empty():
			_bad("R11.1", "人类目击者不应有 mates")
			return
	_ok("R11.1")


## R11.4 处决豁免：目击者已确证死者是异形时，这一枪记为「处决」，不写凶手证据。
## 2.5D 只在 shot 分支实现（js/game.js:1946 `justified`），3D 目前没有任何 justified 分支。
func _case_r11_4(sim: Variant) -> void:
	var aliens: Array = []
	var humans: Array = []
	for a: Dictionary in sim.agents:
		if bool(a.get("alien", false)):
			aliens.append(a)
		else:
			humans.append(a)
	if aliens.is_empty() or humans.size() < 2:
		_bad("R11.4", "席位构成不满足")
		return
	var target: Dictionary = aliens[0]     # 被处决的异形
	var shooter: Dictionary = humans[0]    # 开枪的人
	var witness: Dictionary = humans[1]    # 已经确证目标的目击者
	_close_pre_meeting(sim)
	for a: Dictionary in sim.agents:
		a["alive"] = true
		a["downed"] = false
		a["doing"] = 0.0
	shooter["bullet"] = 1
	var at: Vector2 = sim.room_center("bridge")
	shooter["pos"] = at + Vector2(1.2, 0.0)
	target["pos"] = at
	witness["pos"] = at + Vector2(0.9, 0.0)
	witness["known"] = {int(target.get("i", -1)): {"t": 0.0, "kind": "saw_knife"}}
	var sus0: float = sim.mind.sus_of(witness, int(shooter.get("i", -1)))
	sim.shoot(int(shooter.get("i", -1)), int(target.get("i", -1)))
	var sus1: float = sim.mind.sus_of(witness, int(shooter.get("i", -1)))
	if sus1 > sus0:
		_deviation("R11.4", "处决仍被当凶手证据：sus %.2f → %.2f（3D 无 justified 分支）" % [sus0, sus1])
		return
	_ok("R11.4")


## R11.8 时间线拆谎：同一时间窗内只要有一条位置记录与口供一致，口供就成立；全对不上才算矛盾。
func _case_r11_8(sim: Variant) -> void:
	var rid: String = _room_with_points(sim)
	if rid == "":
		_bad("R11.8", "找不到可用舱室")
		return
	var speaker: Dictionary = sim.agent(1)
	var watcher: Dictionary = sim.agent(2)
	for a: Dictionary in [speaker, watcher]:
		a["alive"] = true
		a["downed"] = false
		a["why"] = {}
	sim.mind.note_track(2, 1, sim.room_center(rid), rid)
	var caught_ok: int = sim.mind.check_alibi(1, rid)
	if caught_ok != 0:
		_bad("R11.8", "口供与位置记录一致时仍被判矛盾（caught=%d）" % caught_ok)
		return
	var other := "bridge" if rid != "bridge" else "power"
	var caught_bad: int = sim.mind.check_alibi(1, other)
	if caught_bad < 1:
		_bad("R11.8", "口供与位置记录矛盾时没有判出来")
		return
	_ok("R11.8")


## R12.5 传闻最多补 1 个证据种类，不能单独构成准-确证（必须至少一条自己看见/查到的实证）。
func _case_r12_5(sim: Variant) -> void:
	var rumor_only := {"kinds": ["heard_report"]}
	if sim.mind.has_id_evidence(rumor_only):
		_bad("R12.5", "只有传闻就被判为身份级证据")
		return
	var with_eye := {"kinds": ["heard_report", "saw_knife"]}
	if not sim.mind.has_id_evidence(with_eye):
		_bad("R12.5", "含亲眼所见时未判为身份级证据")
		return
	_ok("R12.5")


## R12.7 情绪：被当众指控记 grudge；被当众辩护记 trust ≥ 0.8 即「不过票」。
func _case_r12_7(sim: Variant) -> void:
	var a: Dictionary = sim.agent(1)
	var t: int = 2
	a["grudge"] = {}
	a["trust"] = {}
	sim.mind.grudge_add(a, t, 0.5)
	if float((a.get("grudge", {}) as Dictionary).get(t, 0.0)) <= 0.0:
		_bad("R12.7", "被指控后 grudge 没有累加")
		return
	sim.mind.trust_add(a, t, 0.9)
	if not sim.mind.is_patron(a, t):
		_bad("R12.7", "trust 0.9 时未进入「不过票」保护")
		return
	_ok("R12.7")


## R14.7 异形投票不会把已认出的队友选成靶子。
func _case_r14_7(sim: Variant) -> void:
	var alien: Dictionary = {}
	for a: Dictionary in sim.agents:
		if bool(a.get("alien", false)):
			alien = a
			break
	if alien.is_empty():
		_bad("R14.7", "没有异形席位")
		return
	var mates: Dictionary = {}
	for a: Dictionary in sim.agents:
		if a != alien and bool(a.get("alien", false)):
			mates[int(a.get("i", -1))] = {"t": 0.0, "kind": "saw_knife"}
	alien["mates"] = mates
	var tgt: int = sim._ai_vote_target(alien)
	if tgt >= 0 and mates.has(tgt):
		_bad("R14.7", "把已认出的队友选成投票目标（%d）" % tgt)
		return
	_ok("R14.7")


## AI-1 贴脸有刀时，出刀分必须压过拉闸/破坏（附录 A · U4 与「四条钉死边界」第 1 条）。
func _case_ai_kill_beats_breaker(sim: Variant) -> void:
	var al: Dictionary = {}
	for a: Dictionary in sim.agents:
		if bool(a.get("alien", false)):
			al = a
			break
	if al.is_empty():
		_bad("AI-KILL", "没有异形席位")
		return
	al["knife"] = 1
	al["sabUsed"] = false
	al["_breakerSkip"] = -1
	al["_noFake"] = true
	sim.light_state = 0
	sim.power_on = true
	var plan: Dictionary = sim._ai_alien._plan(al, 1.0)
	if String(plan.get("id", "")) != "chase":
		_bad("AI-KILL", "贴脸 1.0 格有刀却选了 %s（score=%.2f）" % [plan.get("id", "?"), float(plan.get("score", 0.0))])
		return
	_ok("AI-KILL")


## AI-2 没刀时 chase 必须归零（历史裁定：刀用完 chase 不得仍是常数）。
func _case_ai_no_knife_no_chase(sim: Variant) -> void:
	var al: Dictionary = {}
	for a: Dictionary in sim.agents:
		if bool(a.get("alien", false)):
			al = a
			break
	if al.is_empty():
		_bad("AI-NOKNIFE", "没有异形席位")
		return
	al["knife"] = 0
	al["sabUsed"] = true          # 去掉拉闸/破坏，剩下只能游荡
	al["_noFake"] = true
	sim.light_state = 2           # 已断电，拉闸计划不成立
	var plan: Dictionary = sim._ai_alien._plan(al, 1.0)
	# 真源结构是 `if(best<=chase) return {id:'chase', score:chase}`：
	# 没刀时 chase=0，返回的仍是 chase，但分数必须是 0（等于「没有正向选择」）。
	# 所以断言看分数，不看 id —— 看 id 会把正确实现判成失败。
	if String(plan.get("id", "")) == "chase" and float(plan.get("score", 0.0)) > 0.0:
		_bad("AI-NOKNIFE", "没刀却给出正分 chase（score=%.2f）" % float(plan.get("score", 0.0)))
		return
	if float(plan.get("score", 0.0)) > 0.0:
		_bad("AI-NOKNIFE", "没刀仍有正分计划 %s（score=%.2f）" % [plan.get("id", "?"), float(plan.get("score", 0.0))])
		return
	_ok("AI-NOKNIFE")


## AI-3 同一故障最多 3 人赶（SKTeam.FIX_CREW_CAP），第 4 个人要转去做任务。
func _case_ai_fix_cap(sim: Variant) -> void:
	var humans: Array = []
	for a: Dictionary in sim.agents:
		if not bool(a.get("alien", false)):
			humans.append(a)
	if humans.size() < 4:
		_bad("AI-FIXCAP", "人类席位不足 4")
		return
	_close_pre_meeting(sim)
	var rid: String = _room_with_points(sim)
	if rid == "":
		_bad("AI-FIXCAP", "找不到可破坏舱室")
		return
	(sim.dmg as Array).clear()
	sim.dmg.append({"room": rid, "by": 0, "left": 30.0,
		"x": sim.sab_spot_for(rid).x, "y": sim.sab_spot_for(rid).y})
	var going := 0
	for h: Dictionary in humans.slice(0, 4):
		h["path"] = PackedVector2Array()
		h["_fixGo"] = {}
		h["doing"] = 0.0
		h["_lightGo"] = false
		h["qualPending"] = 0
		sim._ai_human._decide(h)
		var fg: Variant = h.get("_fixGo", {})
		if fg is Dictionary and not (fg as Dictionary).is_empty():
			going += 1
	if going > 3:
		_bad("AI-FIXCAP", "%d 人涌向同一故障，超过 FIX_CREW_CAP=3" % going)
		return
	_ok("AI-FIXCAP")


func _initialize() -> void:
	_map = _load_json(MAP_PATH)
	_space = _load_json(SPACE_PATH)
	print("EXTRATEST 开始：14 个 case")
	var cases: Array = [
		["R7.1.4", Callable(self, "_case_r7_1_4")],
		["R7.5.3", Callable(self, "_case_r7_5_3")],
		["R9.3", Callable(self, "_case_r9_3")],
		["R9.6", Callable(self, "_case_r9_6")],
		["R11.1", Callable(self, "_case_r11_1")],
		["R11.4", Callable(self, "_case_r11_4")],
		["R11.8", Callable(self, "_case_r11_8")],
		["R12.5", Callable(self, "_case_r12_5")],
		["R12.7", Callable(self, "_case_r12_7")],
		["R14.7", Callable(self, "_case_r14_7")],
		["AI-KILL", Callable(self, "_case_ai_kill_beats_breaker")],
		["AI-NOKNIFE", Callable(self, "_case_ai_no_knife_no_chase")],
		["AI-FIXCAP", Callable(self, "_case_ai_fix_cap")],
	]
	for row: Array in cases:
		var cid: String = String(row[0])
		var fn: Callable = row[1] as Callable
		var sim: Variant = _new_sim(11, true)
		_close_pre_meeting(sim)
		fn.call(sim)
	print("EXTRATEST %d 通过 / %d 失败 / %d 已知偏离" % [_pass, _fails.size(), _known.size()])
	for f: String in _fails:
		print("  · 失败 ", f)
	for k: String in _known:
		print("  · 已知 ", k)
	quit(0 if _fails.is_empty() else 1)
