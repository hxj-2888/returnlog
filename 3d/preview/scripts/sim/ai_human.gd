extends RefCounted

## 人类 AI（B2）：选任务 → A* 走路 → 站桩 → 完成 → 领申请单 → 换补给。
## ------------------------------------------------------------------
## 只做“非发言、非战斗”的部分；异形行为在 B3。
## 所有数值从 space.json 进；AI 不读节点，只改 sim 里的 agent 状态。
## 站位/时长口径：
##   · 任务：距任务点 <= REACH.fix 开始站桩，时长 = 任务点 dur；
##   · 申请单：圆桌边缘外 1.2 格，站桩 STAND.qual；
##   · 补给：军械/医疗补给点，站桩 STAND.ammo / STAND.med。

const SpaceData := preload("res://scripts/space_data.gd")

var sim
var space: Dictionary = {}


func setup(p_sim, p_space: Dictionary) -> void:
	sim = p_sim
	space = p_space


func tick(dt: float) -> void:
	if sim == null or sim.over:
		return
	if not sim.meeting.is_empty():
		return
	for a: Dictionary in sim.agents:
		if int(a.get("i", -1)) == int(sim.me_idx) and not bool(sim.spectator):
			continue
		if bool(a.get("detained", false)):
			continue
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		if bool(a.get("alien", false)):
			continue
		if float(a.get("doing", 0.0)) > 0.0:
			continue
		# 看到尸体先报告：这是 3D 里触发会议的唯一入口（玩家也可以按 E 报告）。
		var body: Dictionary = sim.body_near(a.get("pos", Vector2.ZERO),
			SpaceData.num(space, "reach", "body"))
		if not body.is_empty():
			# 报告额度用完 / 本夜会议开满时继续做任务，别卡在尸体旁
			if sim.open_meeting(int(a.get("i", -1)), int(body.get("i", -1))):
				return
		# 2.5D：有子弹且对某人形成确证 / 高嫌疑时，人类 AI 会开枪（不是玩家专属）。
		# 3D 之前完全没接，异形只需要躲目击线，不需要怕远处的一枪。
		# 枪程 + LOS 是 O(n²)，每帧算会把批量模拟拖慢 10 倍；
		# 2.5D 也有 _rest 决策节流，这里按 1 秒一次（不参与判定，只降采样）。
		var shoot_cd := float(a.get("_shootCD", 0.0)) - dt
		a["_shootCD"] = shoot_cd
		if int(a.get("bullet", 0)) > 0 and shoot_cd <= 0.0:
			a["_shootCD"] = 1.0
			var si := _shoot_target(a)
			if si >= 0 and sim.shoot(int(a.get("i", -1)), si):
				a["_aiT"] = 3.0
				continue
		var path: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
		if path.size() > 0:
			continue
		var wait := float(a.get("_aiT", 0.0)) - dt
		a["_aiT"] = wait
		if wait > 0.0:
			continue
		_decide(a)


## 选一个"敢开枪"的目标：确证优先 → 准-确证 affordableAlmostShot → 综合嫌疑。
## 嫌疑读**夜间折价**（sus_of_night，跨夜存量 ×0.7）；必须在枪程 + 视线内。
## 数值全部读 space.json#shoot 与 rules.json，不写死。
func _shoot_target(a: Dictionary) -> int:
	var scfg: Dictionary = space.get("shoot", {}) as Dictionary
	var shoot_r := float(scfg.get("range", 9.0))
	var thr: float = sim.rules.n("ALMOST", "foeSus", 0.5)
	# 2.5D：准-确证把开枪门槛 ×0.7（ALMOST.foeShootMul，更容易开枪）
	thr *= sim.rules.n("ALMOST", "foeShootMul", 0.7)
	var known: Dictionary = a.get("known", {}) as Dictionary
	var best := -1
	var bs := thr
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	for t: Dictionary in sim.agents:
		var ti := int(t.get("i", -1))
		if ti == int(a.get("i", -1)) or not bool(t.get("alive", false)):
			continue
		if bool(t.get("downed", false)) or bool(t.get("detained", false)):
			continue
		var tp: Vector2 = t.get("pos", Vector2.ZERO)
		if ap.distance_to(tp) > shoot_r:
			continue
		if sim.nav != null and not sim.nav.los(ap, tp):
			continue
		var score := 0.0
		if sim.mind != null:
			score = sim.mind.sus_of_night(a, ti)
		if known.has(ti):
			score += 2.0
		if score > bs:
			bs = score
			best = ti
	# 确证的人直接开枪，不走门槛
	if best < 0 and sim.mind != null and not known.is_empty():
		var kn: Dictionary = sim.mind.best_known_target(a)
		if not kn.is_empty():
			var ki := int(kn.get("i", -1))
			var kp: Vector2 = sim.agent(ki).get("pos", Vector2.ZERO)
			if ap.distance_to(kp) <= shoot_r and \
					(sim.nav == null or sim.nav.los(ap, kp)):
				return ki
	return best


func _decide(a: Dictionary) -> void:
	var i := int(a.get("i", -1))
	var qual_pending := int(a.get("qualPending", 0))
	var qual := int(a.get("qual", 0))

	# 1) 有待领申请单：回圆桌领（个人进度 3 / 5 各生成一张）。
	if qual_pending > 0 and qual < 2:
		var spot: Vector2 = sim.claim_spot()
		if sim.distance_to(i, spot) <= SpaceData.num(space, "reach", "round_table"):
			sim.start_doing(i, "claim", SpaceData.num(space, "stand", "qual"))
		elif not sim.set_path(i, spot):
			_stuck(a)
		return

	# 2) 有申请单且缺物资：去对应补给点兑换。优先补没有的那一样。
	var item := ""
	if int(a.get("bullet", 0)) <= 0 and int(a.get("medkit", 0)) <= 0:
		item = "ammo"
	elif int(a.get("bullet", 0)) <= 0:
		item = "ammo"
	elif int(a.get("medkit", 0)) <= 0:
		item = "medkit"
	if qual > 0 and item != "":
		var sp: Vector2 = sim.supply_spot(item)
		if sim.distance_to(i, sp) <= SpaceData.num(space, "reach", "fix"):
			var dur := SpaceData.num(space, "stand", "ammo" if item == "ammo" else "med")
			sim.start_doing(i, "supply", dur, -1, item)
		elif not sim.set_path(i, sp):
			_stuck(a)
		return

	# 3) 有故障先修：30 秒窗口，修不掉全船 -5 分。
	if sim.dmg.size() > 0:
		var d: Dictionary = sim.dmg[0]
		var dp := Vector2(float(d.get("x", 0.0)), float(d.get("y", 0.0)))
		if sim.distance_to(i, dp) <= SpaceData.num(space, "reach", "fix"):
			sim.start_doing(i, "fix", SpaceData.num(space, "stand", "fix"), -1, String(d.get("room", "")))
		elif not sim.set_path(i, dp):
			_stuck(a)
		return

	# 4) 做任务：按 tIdx 顺序取下一个剩余任务。
	var rem: Array = sim.remaining_tasks(i)
	if rem.is_empty():
		a["_aiT"] = 1.0
		return
	var pi := int(rem[0])
	var p: Dictionary = sim.point(pi)
	var target := Vector2(float(p.get("x", 0.0)), float(p.get("y", 0.0)))
	if sim.distance_to(i, target) <= SpaceData.num(space, "reach", "fix"):
		sim.start_doing(i, "task", float(p.get("dur", 0.0)), pi)
	elif not sim.set_path(i, target):
		_stuck(a)


func _stuck(a: Dictionary) -> void:
	var n := int(a.get("_stuckN", 0)) + 1
	a["_stuckN"] = n
	a["_aiT"] = 0.5
	if n >= 3:
		# 连续三次寻路失败：把 agent 落到最近可行走点，避免永久卡死。
		# 只改位置，不改任何判定状态。
		a["_stuckN"] = 0
		a["_aiT"] = 1.0
		a["pos"] = sim.nav.nearest_free(a.get("pos", Vector2.ZERO))
