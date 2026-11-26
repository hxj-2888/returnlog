extends RefCounted

## 异形追猎与战斗执行（从 sim/ai_alien.gd 拆出）。
## 负责刀击风险判定、追猎目标评分、刀后逃逸、战斗执行与计划落地。

const SpaceData := preload("res://scripts/space_data.gd")
const AlienRoutines := preload("res://scripts/sim/alien_routines.gd")


## 出刀后撤离（_escapeT 期间远离尸体至少 7 格），返回 true 表示本帧仅跑逃逸。
static func run_escape(sim, a: Dictionary, dt: float) -> bool:
	if float(a.get("_escapeT", 0.0)) <= 0.0:
		return false
	a["_escapeT"] = maxf(0.0, float(a.get("_escapeT", 0.0)) - dt)
	var ep_v: Variant = a.get("_escapeFrom", a.get("pos", Vector2.ZERO))
	var ep: Vector2 = ep_v as Vector2 if ep_v is Vector2 else (a.get("pos", Vector2.ZERO) as Vector2)
	var ap_esc: Vector2 = a.get("pos", Vector2.ZERO)
	if ap_esc.distance_to(ep) < 7.0:
		a["_escapePathT"] = float(a.get("_escapePathT", 0.0)) - dt
		var epath: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
		if epath.is_empty() or float(a.get("_escapePathT", 0.0)) <= 0.0:
			var ang: float = (ap_esc - ep).angle() if ap_esc.distance_to(ep) > 0.01 else sim._rng.randf() * TAU
			var dest := ap_esc + Vector2(cos(ang), sin(ang)) * 8.0
			if sim.nav != null:
				dest = sim.nav.nearest_free(dest)
			sim.set_path(int(a.get("i", -1)), dest)
			a["_escapePathT"] = 1.0
		return true
	a["_escapeT"] = 0.0
	return false


## 追击硬上限（HUNT.chaseCap / chaseGiveUp）。
static func tick_chase_cap(sim, a: Dictionary, dt: float) -> void:
	var cur_tgt := int(a.get("target", -1))
	if cur_tgt < 0:
		a["_chaseT"] = 0.0
		return
	if int(a.get("_chaseId", -1)) != cur_tgt:
		a["_chaseId"] = cur_tgt
		a["_chaseT"] = 0.0
	a["_chaseT"] = float(a.get("_chaseT", 0.0)) + dt
	var cap_s: float = sim.rules.n("HUNT", "chaseCap", 6.0) if sim.rules != null else 6.0
	if float(a.get("_chaseT", 0.0)) <= cap_s:
		return
	var give_s: float = sim.rules.n("HUNT", "chaseGiveUp", 14.0) if sim.rules != null else 14.0
	var ev_t: float = sim.mind.ev_now() if sim.mind != null else (sim.night_len() - maxf(0.0, float(sim.t)))
	var cd_map: Dictionary = (a.get("_chaseCD", {}) as Dictionary).duplicate()
	cd_map[cur_tgt] = ev_t + give_s
	a["_chaseCD"] = cd_map
	a["_chaseId"] = -1
	a["_chaseT"] = 0.0
	a["target"] = -1
	a["path"] = PackedVector2Array()
	a["_aiT"] = 0.0


## 追猎目标挑选（含缓存沿用、视野/同夜最后目击、暴露与性格加权）。
static func pick_hunt_target(ai, a: Dictionary, ev_t: float, stale: float) -> Dictionary:
	var sim = ai.sim
	var ap0: Vector2 = a.get("pos", Vector2.ZERO)
	var repick_sec: float = sim.rules.n("HUNT", "repickSec", 8.0)
	var cur_tgt := int(a.get("target", -1))
	var cur_v: Dictionary = sim.agent(cur_tgt) if cur_tgt >= 0 else {}
	var cur_ok: bool = not cur_v.is_empty() and bool(cur_v.get("alive", false)) \
		and not bool(cur_v.get("downed", false)) and not bool(cur_v.get("detained", false)) \
		and not (sim.mind != null and bool(sim.mind._is_mate(a, cur_tgt)))
	var need_pick: bool = not cur_ok or (ev_t - float(a.get("_targetT", -999.0))) > repick_sec
	if not need_pick:
		return _keep_current_target(sim, a, ap0, cur_tgt, cur_v, ev_t, stale)
	return _scan_hunt_target(ai, a, cur_ok, cur_tgt, ev_t, stale)


static func _keep_current_target(sim, a: Dictionary, ap0: Vector2, cur_tgt: int,
		cur_v: Dictionary, ev_t: float, stale: float) -> Dictionary:
	var best := cur_tgt
	var bvic: Dictionary = cur_v
	var vp2: Vector2 = cur_v.get("pos", Vector2.ZERO)
	var bpos := vp2
	if sim.ai_can_see(a, vp2):
		a["_tgtPos"] = {"x": vp2.x, "y": vp2.y, "t": ev_t}
		return {"best": best, "bpos": bpos, "bvic": bvic}
	var tp_rec: Dictionary = a.get("_tgtPos", {}) as Dictionary
	if not tp_rec.is_empty() and ev_t - float(tp_rec.get("t", -999.0)) <= stale:
		bpos = Vector2(float(tp_rec.get("x", vp2.x)), float(tp_rec.get("y", vp2.y)))
		if ap0.distance_to(bpos) < 1.2:
			var cd2: Dictionary = (a.get("_chaseCD", {}) as Dictionary).duplicate()
			cd2[cur_tgt] = ev_t + sim.rules.n("HUNT", "chaseGiveUp", 14.0)
			a["_chaseCD"] = cd2
			best = -1
	elif not tp_rec.is_empty():
		var cd3: Dictionary = (a.get("_chaseCD", {}) as Dictionary).duplicate()
		cd3[cur_tgt] = ev_t + sim.rules.n("HUNT", "chaseGiveUp", 14.0)
		a["_chaseCD"] = cd3
		best = -1
	return {"best": best, "bpos": bpos, "bvic": bvic}


static func _last_seen_pos(sim, a: Dictionary, vi: int, vp: Vector2,
		ev_t: float, stale: float) -> Dictionary:
	var mem: Array = ((a.get("why", {}) as Dictionary).get(vi, []) as Array)
	for k in range(mem.size() - 1, -1, -1):
		var e: Dictionary = mem[k]
		if String(e.get("kind", "")) != "saw_agent" or int(e.get("night", -1)) != int(sim.night):
			continue
		if ev_t - float(e.get("t", 0.0)) > stale:
			continue
		return {"ok": true, "pos": Vector2(float(e.get("x", vp.x)), float(e.get("y", vp.y)))}
	return {"ok": false, "pos": Vector2.ZERO}


static func _score_candidate(ai, a: Dictionary, v: Dictionary, hpos: Vector2,
		seen_now: bool, cur_ok: bool, cur_tgt: int) -> float:
	var sim = ai.sim
	var i := int(a.get("i", -1))
	var vi := int(v.get("i", -1))
	var exp: float = ai._exposure_at(a, hpos, v if seen_now else {})
	var mate_on := false
	for m: Dictionary in sim.agents:
		if m == a or not bool(m.get("alien", false)) or not bool(m.get("alive", false)):
			continue
		if int(m.get("target", -1)) == vi and sim.mind != null and sim.mind._is_mate(a, int(m.get("i", -1))):
			mate_on = true
			break
	var busy: bool = seen_now and float(v.get("doing", 0.0)) > 0.0
	var base: float = sim.distance_to(i, hpos) \
		+ exp * sim.mind.trait_c("knifeWatcherPenalty", a) \
		+ (8.0 if mate_on else 0.0) \
		+ (sim.mind.trait_c("knifeBusyBonus", a) if busy else 0.0)
	var score: float = base * sim.mind.target_dist_mul(sim.mind.hostile_prob(a, v))
	var hi: float = sim.mind.humanish_of(a, vi)
	if hi > 0.0:
		score -= sim.rules.n("HUMANISH", "pull", 6.0) * hi
	if cur_ok and vi == cur_tgt:
		score += sim.rules.n("HUNT", "incumbentPen", 6.0)
	if cur_ok:
		score += sim._rng.randf() * sim.rules.n("HUNT", "jitter", 4.0)
	return score


static func _scan_hunt_target(ai, a: Dictionary, cur_ok: bool, cur_tgt: int,
		ev_t: float, stale: float) -> Dictionary:
	var sim = ai.sim
	var best := -1
	var bpos := Vector2.ZERO
	var bvic: Dictionary = {}
	var bd := 1.0e9
	var fallback := -1
	var fb := 1.0e9
	var fpos := Vector2.ZERO
	var chase_cd: Dictionary = a.get("_chaseCD", {}) as Dictionary
	var av_map: Dictionary = a.get("_avoid", {}) as Dictionary
	for v: Dictionary in sim.agents:
		if v == a or not bool(v.get("alive", false)) \
				or bool(v.get("downed", false)) or bool(v.get("detained", false)):
			continue
		var vi := int(v.get("i", -1))
		if sim.mind != null and sim.mind._is_mate(a, vi):
			continue
		if float(chase_cd.get(vi, 0.0)) > ev_t:
			continue
		var vp: Vector2 = v.get("pos", Vector2.ZERO)
		var seen_now: bool = sim.ai_can_see(a, vp)
		var hpos := vp
		if not seen_now:
			var rec := _last_seen_pos(sim, a, vi, vp, ev_t, stale)
			if not bool(rec["ok"]):
				continue
			hpos = rec["pos"] as Vector2
		var score := _score_candidate(ai, a, v, hpos, seen_now, cur_ok, cur_tgt)
		var avoided := (float(a.get("_avoid_t", 0.0)) > 0.0 and vi == int(a.get("_avoid_i", -1))) \
			or float(av_map.get(vi, 0.0)) > ev_t
		if avoided:
			if score < fb:
				fb = score
				fallback = vi
				fpos = hpos
			continue
		if score < bd:
			bd = score
			best = vi
			bpos = hpos
			bvic = v
	if best < 0 and fallback >= 0:
		best = fallback
		bpos = fpos
		bvic = sim.agent(fallback)
	if best >= 0:
		if best != cur_tgt:
			a["path"] = PackedVector2Array()
		a["_targetT"] = ev_t
		a["_tgtPos"] = {"x": bpos.x, "y": bpos.y, "t": ev_t}
	else:
		a["_tgtPos"] = {}
	return {"best": best, "bpos": bpos, "bvic": bvic}


## 无有效猎杀目标时的兜底逻辑：效用计划 → 补给 → 管道找人 → 随机巡舱。
static func handle_no_target(ai, a: Dictionary) -> void:
	var sim = ai.sim
	var i := int(a.get("i", -1))
	ai._bump("no_target")
	if exec_plan(ai, a, ai._plan(a, 999.0)):
		return
	if AlienRoutines.support(sim, ai.space, a):
		return
	var hunt: Vector2 = ai._hunt_spot(a)
	if hunt != Vector2.INF:
		var hd: float = sim.distance_to(i, hunt)
		if ai._pipe_move(a, hunt, hd, 0.0):
			a["_aiT"] = 1.0
			a["target"] = -1
			return
	if int(a.get("knife", 0)) <= 0:
		var rooms: Array = sim.map.get("rooms", []) as Array
		if not rooms.is_empty():
			var rr: Dictionary = rooms[sim._rng.randi_range(0, rooms.size() - 1)]
			sim.set_path(i, sim.rand_in_room(String(rr.get("id", ""))))
	a["_aiT"] = 1.0
	a["target"] = -1


## 有猎杀目标时的战斗与计划执行链。
static func exec_combat(ai, a: Dictionary, best: int, bpos: Vector2,
		bvic: Dictionary, real_d: float, ev_t: float) -> void:
	var sim = ai.sim
	var i := int(a.get("i", -1))
	var ap0: Vector2 = a.get("pos", Vector2.ZERO)
	if _try_shoot(ai, a, best, bpos, real_d, ap0):
		return
	# 被保安看见后的「躲开」计时，优先于计划
	if float(a.get("_secAvoidT", 0.0)) > 0.0:
		if (a.get("path", PackedVector2Array()) as PackedVector2Array).is_empty():
			var rms: Array = sim.map.get("rooms", []) as Array
			if not rms.is_empty():
				var rv: Dictionary = rms[sim._rng.randi_range(0, rms.size() - 1)]
				sim.set_path(i, sim.rand_in_room(String(rv.get("id", ""))))
		a["_aiT"] = 0.5
		return
	if exec_plan(ai, a, ai._plan(a, real_d)):
		return
	if _try_drag_or_hide(ai, a, real_d, ap0):
		return
	if (int(a.get("knife", 0)) <= 0 or real_d > 12.0) and AlienRoutines.support(sim, ai.space, a):
		return
	if real_d > 15.0 and ai._pipe_move(a, bpos, real_d, 0.1):
		return
	if real_d <= SpaceData.num(ai.space, "reach", "knife"):
		_try_knife(ai, a, best, bvic, ev_t)
		return
	if sim.set_path(i, bpos):
		return
	ai._bump("path_fail")
	a["_aiT"] = 1.0


static func _try_shoot(ai, a: Dictionary, best: int, bpos: Vector2,
		real_d: float, ap0: Vector2) -> bool:
	var sim = ai.sim
	var space: Dictionary = ai.space
	var i := int(a.get("i", -1))
	if int(a.get("bullet", 0)) > 0 \
			and (real_d > SpaceData.num(space, "reach", "knife") or int(a.get("knife", 0)) <= 0):
		var shoot_range: float = SpaceData.num(space, "shoot", "range")
		var shot_cfg: Dictionary = (sim.cfg.get("rules", {}) as Dictionary).get("SHOT", {}) as Dictionary
		if real_d <= shoot_range and sim.ai_can_see(a, bpos) and float(a.get("_shotCheckCD", 0.0)) <= 0.0:
			a["_shotCheckCD"] = 0.35
			var fire_p := float(shot_cfg.get("alienFireP", 0.7))
			if sim._rng.randf() < fire_p and sim.shoot(i, best):
				ai._bump("shot_ok")
				a["_aiT"] = 1.5
				return true
	if int(a.get("bullet", 0)) > 0 and (best < 0 or real_d > SpaceData.num(space, "shoot", "range")) \
			and float(a.get("_botShotCD", 0.0)) <= 0.0:
		var shot_rules: Dictionary = (sim.cfg.get("rules", {}) as Dictionary).get("SHOT", {}) as Dictionary
		a["_botShotCD"] = float(shot_rules.get("botShotCheck", 10.0))
		for bk: String in ["medbot", "secbot"]:
			if sim.bots == null or sim.bots.is_dead(bk):
				continue
			var bq: Vector2 = sim.bot_pos_of(bk)
			if bq == Vector2.ZERO or ap0.distance_to(bq) >= SpaceData.num(space, "shoot", "range"):
				continue
			if not sim.ai_can_see(a, bq):
				continue
			var pk := "alienMedbotP" if bk == "medbot" else "alienSecbotP"
			if sim._rng.randf() < float(shot_rules.get(pk, 0.0)) and sim.hit_bot(i, bk):
				ai._bump("shot_bot")
				a["_aiT"] = 1.5
				return true
	return false


static func _try_drag_or_hide(ai, a: Dictionary, real_d: float, ap0: Vector2) -> bool:
	var sim = ai.sim
	var i := int(a.get("i", -1))
	if int(a.get("drag", -1)) >= 0:
		var hid2 := String(a.get("_dragTo", ""))
		if hid2 == "":
			sim.release_drag(i)
		else:
			var hpos: Vector2 = sim.room_center(hid2)
			if ap0.distance_to(hpos) < 2.0:
				sim.release_drag(i)
				a["_dragTo"] = ""
				a["_hideCD"] = 25.0
				a["_hides"] = int(a.get("_hides", 0)) + 1
				a["_aiT"] = 1.0
				return true
			if sim.set_path(i, hpos):
				return true
			sim.release_drag(i)
			a["_dragTo"] = ""
	if int(a.get("drag", -1)) < 0 and float(a.get("_hideCD", 0.0)) <= 0.0 \
			and int(a.get("_hides", 0)) < 2 and real_d > 6.0 and not sim.recent_witness(a, 25.0):
		var hbv := find_hide_body(sim, a)
		if not hbv.is_empty():
			var hbp: Vector2 = hbv.get("bodyPos", Vector2.ZERO)
			var hseen := false
			for w5: Dictionary in sim.watchers_at(a, hbp, 6.5):
				if sim.mind != null and not sim.mind._is_mate(a, int(w5.get("i", -1))):
					hseen = true
					break
			if hseen:
				a["_hideCD"] = 7.0
				return true
			var hdest := AlienRoutines.hide_room(sim, hbp, sim.room_at(hbp))
			if hdest != "":
				if ap0.distance_to(hbp) < 2.0:
					a["drag"] = int(hbv.get("i", -1))
					hbv["draggedBy"] = i
					a["_dragTo"] = hdest
					sim._witness_action(a, "saw_drag", hbp)
					return true
				if sim.set_path(i, hbp):
					return true
	return false


static func _try_knife(ai, a: Dictionary, best: int, bvic: Dictionary, ev_t: float) -> void:
	var sim = ai.sim
	var i := int(a.get("i", -1))
	if sim.bots != null and sim.bots.would_see(a.get("pos", Vector2.ZERO)):
		a["_secAvoidT"] = 2.5
		a["target"] = -1
		a["path"] = PackedVector2Array()
		return
	if knife_blocked(sim, ai.space, a, bvic):
		ai._bump("block_knife")
		var av2: Dictionary = (a.get("_avoid", {}) as Dictionary).duplicate()
		av2[best] = ev_t + sim.rules.disp("avoidSec", 12.0)
		a["_avoid"] = av2
		a["target"] = -1
		a["path"] = PackedVector2Array()
		var rms2: Array = sim.map.get("rooms", []) as Array
		if not rms2.is_empty():
			var rv2: Dictionary = rms2[sim._rng.randi_range(0, rms2.size() - 1)]
			sim.set_path(i, sim.rand_in_room(String(rv2.get("id", ""))))
		a["_aiT"] = 2.0
		return
	if int(a.get("knife", 1)) <= 0:
		a["_aiT"] = 2.0
		return
	ai._bump("knife_try")
	var knife_ok: Dictionary = sim.can_act("knife", {"actor": i, "victim": best})
	if bool(knife_ok.get("ok", false)) and sim.knife(i, best):
		ai._bump("knife_ok")
		a["_aiT"] = 2.0
	else:
		var live: Vector2 = sim.agent(best).get("pos", Vector2.ZERO) as Vector2
		if live != Vector2.ZERO:
			sim.set_path(i, live)
		a["_aiT"] = 0.5


## 执行 2.5D alienPlan 返回的 plan。`chase` 返回 false（交给出刀段）。
static func exec_plan(ai, a: Dictionary, plan: Dictionary) -> bool:
	var sim = ai.sim
	var space: Dictionary = ai.space
	var pid := String(plan.get("id", ""))
	if pid == "" or pid == "chase":
		return false
	var i := int(a.get("i", -1))
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	if pid == "breaker":
		var br: Vector2 = sim.breaker_pos()
		if br == Vector2.ZERO:
			return false
		if ap.distance_to(br) < SpaceData.num(space, "reach", "breaker"):
			var why_br := AlienRoutines.sanity_blocked(sim, a, br, "BREAKER", 8.0,
				1.0 - float(ai._exposure_at(a, br, {})))
			if why_br != "":
				ai._bump(why_br)
				a["_breakerSkip"] = int(sim.night)
				a["_planAt"] = -1.0
				return true
			sim.start_doing(i, "breaker", sim.breaker_pull_time())
			return true
		return sim.set_path(i, br)
	if pid == "sabotage":
		var room := String(plan.get("room", ""))
		var sp: Vector2 = ai.sab_spot(room)
		if room == "" or sp == Vector2.ZERO:
			return false
		var why_sb := AlienRoutines.sanity_blocked(sim, a, sp, "SABOTAGE", 7.0,
			1.0 - float(ai._exposure_at(a, sp, {})))
		if why_sb != "":
			ai._bump(why_sb)
			a["_sabSkipRoom"] = room
			a["_sabSkipUntil"] = sim.elapsed + 8.0
			a["_planAt"] = -1.0
			return true
		if sim.room_at(ap) == room or ap.distance_to(sp) < SpaceData.num(space, "reach", "sabotage"):
			return sim.sabotage_room(room, i)
		return sim.set_path(i, sp)
	if pid == "bot":
		var kind := String(plan.get("kind", ""))
		if kind == "" or sim.bots == null:
			return false
		var bp: Vector2 = sim.bot_pos_of(kind)
		if bp == Vector2.ZERO:
			return false
		if ap.distance_to(bp) < 1.8:
			if sim.knife_bot(kind, i):
				a["_botCD"] = 10.0
				a["_aiT"] = 1.5
				return true
			return false
		return sim.set_path(i, bp)
	return _exec_disguise(ai, a, plan, ap)


static func _exec_disguise(ai, a: Dictionary, plan: Dictionary, ap: Vector2) -> bool:
	var sim = ai.sim
	var i := int(a.get("i", -1))
	var tp := Vector2(float(plan.get("x", 0.0)), float(plan.get("y", 0.0)))
	if ap.distance_to(tp) >= 2.0:
		return sim.set_path(i, tp)
	match String(plan.get("kind", "")):
		"realFix":
			var fd: Variant = plan.get("fault", null)
			var froom := ""
			if fd is Dictionary:
				froom = String((fd as Dictionary).get("room", ""))
			sim.start_doing(i, "fix", float(plan.get("dur", 10.0)), -1, froom)
			a["_realFixN"] = int(sim.night)
			return true
		"realRevive":
			sim.start_doing(i, "revive", float(plan.get("dur", 5.0)))
			a["_realReviveN"] = int(sim.night)
			return true
		"breakerOn":
			a["_fakeKind"] = "breaker"
			sim.start_doing(i, "breaker", float(plan.get("dur", 3.0)))
			return true
		"fake":
			sim.start_doing(i, "fake", float(plan.get("dur", 5.0)), -1,
				String(plan.get("room", "")))
			a["_fakeKind"] = "repair"
			ai._bump("fake")
			a["_lastFake"] = {"key": String(plan.get("key", "")), "t": float(sim.elapsed)}
			return true
		"fakeTask":
			sim.start_doing(i, "fake", float(plan.get("dur", 4.0)), int(plan.get("pt", -1)))
			a["_fakeKind"] = "task"
			ai._bump("fake")
			a["_lastFake"] = {"key": String(plan.get("key", "")), "t": float(sim.elapsed)}
			return true
	return false


static func find_hide_body(sim, a: Dictionary) -> Dictionary:
	var best: Dictionary = {}
	var bd := 3.2
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	for v: Dictionary in sim.agents:
		if v == a:
			continue
		var bp: Vector2 = v.get("bodyPos", Vector2.ZERO)
		if bp == Vector2.ZERO:
			continue
		var dv: Variant = v.get("draggedBy", -1)
		if dv != null and int(dv) >= 0:
			continue
		if sim.ai_wants_loot(a, v):
			continue
		var d: float = ap.distance_to(bp)
		if d < bd and sim.ai_can_see(a, bp):
			bd = d
			best = v
	return best


## 2.5D knifeDiscoveryRisk / knifeWouldHitMate / knifeBlocked（js/game.js:3575-3612）
static func knife_discovery_risk(sim, space: Dictionary, a: Dictionary, tgt: Dictionary) -> Dictionary:
	var h := float(sim.rules.n("KNIFE", "discoverHorizon", 1.8)) if sim != null and sim.rules != null else 1.8
	var vis := 0.0
	var mate_vis := 0.0
	var tp: Vector2 = tgt.get("pos", Vector2.ZERO)
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var sp := SpaceData.num(space, "move", "speed")
	for w: Dictionary in sim.agents:
		if w == a or w == tgt or not bool(w.get("alive", false)) \
				or bool(w.get("downed", false)) or bool(w.get("detained", false)):
			continue
		var wp: Vector2 = w.get("pos", Vector2.ZERO)
		var ang := float(w.get("aimAng", 0.0))
		var px := wp + Vector2(cos(ang), sin(ang)) * sp * h
		var see: bool = sim.ai_can_see(w, tp) or sim.ai_can_see(w, ap)
		if not see:
			continue
		var d := px.distance_to(tp)
		var wt := clampf(1.4 - d / 12.0, 0.3, 1.0)
		if sim.mind != null and sim.mind._is_mate(a, int(w.get("i", -1))):
			mate_vis += wt
		else:
			vis += wt
	var invis := maxf(0.0, 1.0 - vis)
	var share := mate_vis / (vis + mate_vis) if (vis + mate_vis) > 0.0 else 1.0
	return {"risk": 1.0 - invis, "share": share}


static func knife_would_hit_mate(sim, a: Dictionary, tgt: Dictionary) -> bool:
	if a.is_empty() or not bool(a.get("alien", false)) or tgt.is_empty():
		return false
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var tp: Vector2 = tgt.get("pos", Vector2.ZERO)
	var reach := float(sim.rules.n("REACH", "knife", 1.85)) if sim != null and sim.rules != null else 1.85
	var ang := (tp - ap).angle()
	for m: Dictionary in sim.agents:
		if m == a or m == tgt or not bool(m.get("alive", false)) or bool(m.get("downed", false)):
			continue
		if sim.mind != null and sim.mind._is_mate(a, int(m.get("i", -1))):
			var mp: Vector2 = m.get("pos", Vector2.ZERO)
			if ap.distance_to(mp) <= reach and absf(wrapf((mp - ap).angle() - ang, -PI, PI)) <= PI * 0.55:
				return true
	return false


static func knife_blocked(sim, space: Dictionary, a: Dictionary, tgt: Dictionary) -> bool:
	if knife_would_hit_mate(sim, a, tgt):
		return true
	var r := knife_discovery_risk(sim, space, a, tgt)
	return float(r.get("risk", 0.0)) * (1.0 - float(r.get("share", 1.0))) > 1e-6


## 2.5D ambushSpotFor（js/game.js:4709）：围绕破坏点的伏击选点。
static func ambush_spot_for(ai, rid: String, sp: Vector2) -> Vector2:
	var sim = ai.sim
	if sim == null or sim.nav == null:
		return Vector2.ZERO
	var room: Dictionary = sim.rooms_by_id.get(rid, {}) as Dictionary
	if room.is_empty():
		return Vector2.ZERO
	var min_r := float(sim.rules.n("AMBUSH", "minR", 2.8)) if sim.rules != null else 2.8
	var max_r := float(sim.rules.n("AMBUSH", "maxR", 5.5)) if sim.rules != null else 5.5
	var best := Vector2.ZERO
	var bs := -1.0e9
	var lab: Array = room.get("label", [sp.x, sp.y]) as Array
	var cx := float(lab[0])
	var cy := float(lab[1])
	for _k in range(18):
		var p := Vector2(cx + (sim._rng.randf() - 0.5) * 8.0, cy + (sim._rng.randf() - 0.5) * 8.0)
		if not sim.nav.is_free(p) or sim.room_at(p) != rid:
			continue
		var d := p.distance_to(sp)
		if d < min_r or d > max_r:
			continue
		var sc: float = -float(ai._exposure_at({}, p, {})) * 2.0 + (d - min_r) * 0.2
		if sc > bs:
			bs = sc
			best = p
	return best


## 2.5D aiAlien:3786-3848：行凶后先离开做不在场，再回尸体旁报案。
static func report_plan(ai, a: Dictionary) -> bool:
	var sim = ai.sim
	var i := int(a.get("i", -1))
	var plan: Dictionary = a.get("_reportPlan", {}) as Dictionary
	if plan.is_empty():
		if not _init_report_plan(sim, a):
			return false
		plan = a["_reportPlan"] as Dictionary
	var vi := int(plan.get("body", -1))
	var v2: Dictionary = sim.agent(vi)
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var db: Variant = v2.get("draggedBy", null)
	if not AlienRoutines.has_body(v2) or bool(v2.get("bodyReported", false)) \
			or (db != null and int(db) >= 0 and int(db) != i):
		a["_reportPlan"] = {}
		return false
	var bp: Vector2 = v2.get("bodyPos", v2.get("pos", Vector2.ZERO))
	if float(plan.get("wait", 0.0)) > 0.0:
		return _wait_report_alibi(sim, a, plan, i, ap, bp)
	if ap.distance_to(bp) < 2.6 and sim.los_now(ap.x, ap.y, bp.x, bp.y):
		if sim.ai_wants_loot(a, v2) and sim.watchers_at(a, bp, 7.0, vi).is_empty():
			sim.start_doing(i, "search", SpaceData.num(ai.space, "stand", "search"), -1, "")
			a["_sv"] = vi
			return true
		if int(a.get("reportLeft", 0)) <= 0 or sim.night_meet_left() <= 0:
			a["_reportPlan"] = {}
			return false
		v2["bodyReported"] = true
		a["_reportPlan"] = {}
		sim.open_meeting_kind("night", i, vi)
		return true
	if (a.get("path", PackedVector2Array()) as PackedVector2Array).is_empty():
		sim.set_path(i, bp)
	return true


static func _init_report_plan(sim, a: Dictionary) -> bool:
	if int(a.get("_killBody", -1)) < 0 or bool(a.get("_killDecided", true)):
		return false
	a["_killDecided"] = true
	if int(a.get("reportLeft", 0)) <= 0 or sim.night_meet_left() <= 0:
		return false
	var v: Dictionary = sim.agent(int(a.get("_killBody", -1)))
	if not AlienRoutines.has_body(v) or bool(v.get("bodyReported", false)):
		return false
	var wit: bool = sim.recent_witness(a, 20.0)
	var worth: float = maxf(float(sim.alien_report_worth(a, v)), 0.0 if wit else 0.55)
	if sim._rng.randf() >= (worth * 0.5 if wit else worth):
		return false
	a["_reportT"] = 0.0
	a["_reportBody"] = -1
	var direct: bool = sim._rng.randf() < (0.2 if wit else 0.35)
	a["_reportPlan"] = {"body": int(v.get("i", -1)),
		"wait": (0.8 + sim._rng.randf() * 1.2) if direct else (5.0 + sim._rng.randf() * 7.0),
		"spot": Vector2.INF, "direct": direct}
	return true


static func _wait_report_alibi(sim, a: Dictionary, plan: Dictionary,
		i: int, ap: Vector2, bp: Vector2) -> bool:
	if bool(plan.get("direct", false)):
		if ap.distance_to(bp) > 2.2 \
				and (a.get("path", PackedVector2Array()) as PackedVector2Array).is_empty():
			sim.set_path(i, bp)
		return true
	if (a.get("path", PackedVector2Array()) as PackedVector2Array).is_empty():
		var spot: Variant = plan.get("spot", Vector2.INF)
		if not (spot is Vector2) or (spot as Vector2) == Vector2.INF:
			var sp2 := _alibi_spot(sim, a)
			plan["spot"] = sp2
			a["_reportPlan"] = plan
			spot = sp2
		if (spot as Vector2) != Vector2.INF:
			sim.set_path(i, spot as Vector2)
	return true


static func _alibi_spot(sim, a: Dictionary) -> Vector2:
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var cands: Array = []
	for r: Dictionary in (sim.map.get("rooms", []) as Array):
		var rid := String(r.get("id", ""))
		if rid == "bridge":
			continue
		var d := ap.distance_to(sim.room_center(rid))
		if d > 6.0 and d < 24.0:
			cands.append(rid)
	if cands.is_empty():
		return Vector2.INF
	return sim.rand_in_room(String(cands[sim._rng.randi_range(0, cands.size() - 1)]))
