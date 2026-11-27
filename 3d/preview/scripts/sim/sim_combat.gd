extends RefCounted

## 战斗结算、能力判定、机器人反制、视野与听觉/目击追踪（从 sim_state.gd 拆分）。
## 只读/写传入的 s（sim_state 实例）字段，判定与数值口径 100% 保持同源。

const SpaceData := preload("res://scripts/space_data.gd")


## 2.5D gunThreatFrom / gunDodgeStep（js/game.js:3701-3787）：AI 走位躲枪
static func gun_threat_from(s, a: Dictionary) -> Dictionary:
	if bool(s.over) or a.is_empty() or not bool(a.get("alive", false)) \
			or bool(a.get("downed", false)) or bool(a.get("detained", false)) \
			or int(a.get("drag", -1)) >= 0:
		return {}
	var max_r := (float(s.rules.n("SHOT", "range", 8.0)) if s.rules != null else 8.0) + 1.5
	var max_r2 := max_r * max_r
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var a_alien := bool(a.get("alien", false))
	var best: Dictionary = {}
	var bd := 1.0e9
	var mind = s.mind
	var reveal_all := bool(s.reveal_all)
	for o: Dictionary in (s.agents as Array):
		if o.is_empty() or o == a or not bool(o.get("alive", false)) \
				or bool(o.get("downed", false)) or bool(o.get("detained", false)):
			continue
		var op: Vector2 = o.get("pos", Vector2.ZERO)
		var d2 := ap.distance_squared_to(op)
		if d2 > max_r2 or d2 < 1.44:
			continue
		if a_alien and mind != null and mind._is_mate(a, int(o.get("i", -1))):
			continue
		if not bool(s.los_now(op.x, op.y, ap.x, ap.y)):
			continue
		if not reveal_all and not ai_can_see(s, a, op):
			continue
		var d := sqrt(d2)
		var armed_cue := false
		if reveal_all:
			armed_cue = (a_alien != bool(o.get("alien", false)))
		elif mind != null:
			var hp: float = float(mind.hostile_prob(a, o))
			if a_alien:
				armed_cue = hp >= 0.58
			else:
				var oi := int(o.get("i", -1))
				var kn: bool = (a.get("known", {}) as Dictionary).has(oi)
				var susp_v: Variant = a.get("suspect", -1)
				var susp := int(susp_v) if (susp_v is int or susp_v is float) else -1
				armed_cue = kn or susp == oi \
					or float(mind.belief_of(a, oi)) >= 0.30 or hp >= 0.45
		if armed_cue and d < bd:
			bd = d
			best = o
	return best


static func gun_dodge_step(s, a: Dictionary, dt: float) -> bool:
	var nav = s.nav
	if a.is_empty() or nav == null:
		return false
	if float(a.get("_dodgeCD", 0.0)) > 0.0:
		a["_dodgeCD"] = maxf(0.0, float(a.get("_dodgeCD", 0.0)) - dt)
	var sp := SpaceData.num(s.space as Dictionary, "move", "speed")
	var step := sp * dt
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	if float(a.get("_dodgeT", 0.0)) > 0.0 and a.get("_dodgeVec", null) is Vector2:
		a["_dodgeT"] = maxf(0.0, float(a.get("_dodgeT", 0.0)) - dt)
		if float(a.get("_dodgeT", 0.0)) <= 0.0:
			a["_dodgeCD"] = 0.65
		var dv: Vector2 = a.get("_dodgeVec", Vector2.ZERO)
		var np := ap + dv * step
		if nav.is_free(np) and not bool(s.door_blocked_segment(ap.x, ap.y, np.x, np.y)):
			a["pos"] = np
			a["moving"] = true
			a["path"] = PackedVector2Array()
			a["aimAng"] = atan2(dv.y, dv.x)
			return true
		a["_dodgeT"] = 0.0
		a["_dodgeCD"] = 0.65
	if float(a.get("_dodgeCD", 0.0)) > 0.0:
		return false
	var o: Dictionary = gun_threat_from(s, a)
	if o.is_empty():
		return false
	var op: Vector2 = o.get("pos", Vector2.ZERO)
	var dv_base := (ap - op)
	var d := maxf(1.0, dv_base.length())
	var dir_v := dv_base / d
	var perp := Vector2(-dir_v.y, dir_v.x)
	var side := float(a.get("_dodgeSide", 1.0))
	var cands: Array = [
		[perp * side, side],
		[-perp * side, -side],
		[(perp * side * 0.7 + dir_v * 0.7).normalized(), side],
		[(-perp * side * 0.7 + dir_v * 0.7).normalized(), -side],
	]
	for c: Array in cands:
		var v: Vector2 = c[0]
		var sd: float = float(c[1])
		var np := ap + v * step
		if nav.is_free(np) and not bool(s.door_blocked_segment(ap.x, ap.y, np.x, np.y)):
			a["pos"] = np
			a["moving"] = true
			a["_dodgeSide"] = sd
			a["_dodgeVec"] = v
			a["_dodgeT"] = 0.35
			a["path"] = PackedVector2Array()
			a["aimAng"] = atan2(v.y, v.x)
			return true
	return false


## 门禁 / 批量模拟用的死亡快捷入口。必须走 die()。
static func kill(s, agent_i: int, cause: String, by: int = -1) -> bool:
	var a: Dictionary = s.agent(agent_i)
	if a.is_empty() or not bool(a.get("alive", false)):
		return false
	a["deathCause"] = cause
	a["killedBy"] = by
	return die(s, a)


## 出刀：把人放倒（濒死持续到天亮 / 被救），已倒地的人不能再被刀。
static func knife(s, killer_i: int, victim_i: int) -> bool:
	var k: Dictionary = s.agent(killer_i)
	var v: Dictionary = s.agent(victim_i)
	if k.is_empty() or v.is_empty():
		return false
	if not bool(k.get("alive", false)) or bool(k.get("downed", false)):
		return false
	if not bool(v.get("alive", false)):
		return false
	if int(k.get("knife", 0)) < 1:
		return false
	k["knife"] = int(k.get("knife", 0)) - 1
	k["knifeUsed"] = int(k.get("knifeUsed", 0)) + 1
	var cfg: Dictionary = s.cfg
	k["redT"] = float((cfg.get("rules", {}) as Dictionary).get("RED_BODY", {}).get("dur", 1.5))
	var dev_me: bool = bool(s.dev) and not bool(s.spectator) and victim_i == int(s.me_idx)
	if dev_me:
		if s.bots != null:
			s.bots.on_crime(killer_i, k.get("pos", Vector2.ZERO))
		s._dev_note("DEV 无敌：%s 的出刀没有生效" % String(k.get("name", "?")),
			{"actor": killer_i, "victim": victim_i})
		return false
	if bool(v.get("downed", false)):
		return false
	v["downed"] = true
	v["downedT"] = 0.0
	v["downedBy"] = killer_i
	v["medTried"] = false
	v["bodyPos"] = v.get("pos", Vector2.ZERO)
	v["downRoom"] = s.room_at(v.get("pos", Vector2.ZERO))
	v["deathCause"] = "knife"
	v["killedBy"] = killer_i
	v["searched"] = false
	witness_action(s, k, "saw_knife", v.get("pos", Vector2.ZERO))
	hear(s, "knife", v.get("pos", Vector2.ZERO), 14.0, {"actor": killer_i, "victim": victim_i})
	hear(s, "scream", v.get("pos", Vector2.ZERO), 16.0, {"victim": victim_i})
	witness_action(s, k, "saw_red", k.get("pos", Vector2.ZERO))
	s._log("knife", {"actor": killer_i, "victim": victim_i, "cause": "knife"})
	kill_rush_start(s, k)
	if bool(k.get("alien", false)):
		k["_killAt"] = float(s.elapsed)
		k["_killBody"] = victim_i
		k["_killDecided"] = false
		k["_escapeT"] = 2.2
		k["_escapeFrom"] = v.get("pos", Vector2.ZERO)
		k["_escapePathT"] = 0.0
	if s.bots != null and not (bool(s.dev) and not bool(s.spectator) and killer_i == int(s.me_idx)):
		s.bots.on_crime(killer_i, k.get("pos", Vector2.ZERO))
	return true


## 击杀加速的唯一授予入口（2.5D killRushStart，js/game.js:767）
static func kill_rush_start(s, a: Dictionary) -> void:
	if a.is_empty() or not bool(a.get("alive", false)):
		return
	var cfg: Dictionary = s.cfg
	var R: Dictionary = (cfg.get("rules", {}) as Dictionary).get("RUSH", {}) as Dictionary
	if bool(R.get("alienOnly", true)) and not bool(a.get("alien", false)):
		return
	a["rushT"] = float(R.get("dur", 2.0))


## 开枪：与出刀同一个结算入口（放倒 → 天亮前没人救则失血死），消耗子弹、射程 9 格。
static func shoot(s, shooter_i: int, target_i: int) -> bool:
	var k: Dictionary = s.agent(shooter_i)
	var v: Dictionary = s.agent(target_i)
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
	if kp.distance_to(vp) > SpaceData.num(s.space as Dictionary, "shoot", "range"):
		return false
	if not bool(s.los_now(kp.x, kp.y, vp.x, vp.y)):
		return false
	k["bullet"] = int(k.get("bullet", 0)) - 1
	if bool(s.dev) and not bool(s.spectator) and target_i == int(s.me_idx):
		if s.bots != null:
			s.bots.on_crime(shooter_i, kp)
		s._dev_note("DEV 无敌：%s 的一枪没有生效" % String(k.get("name", "?")),
			{"actor": shooter_i, "victim": target_i})
		return false
	v["downed"] = true
	v["downedT"] = 0.0
	v["downedBy"] = shooter_i
	v["medTried"] = false
	v["bodyPos"] = vp
	v["downRoom"] = s.room_at(vp)
	v["deathCause"] = "shot"
	v["killedBy"] = shooter_i
	v["searched"] = false
	witness_action(s, k, "saw_shot", kp, target_i)
	hear(s, "shot", kp, 20.0, {"actor": shooter_i, "victim": target_i})
	s._log("shoot", {"actor": shooter_i, "victim": target_i})
	kill_rush_start(s, k)
	if s.bots != null and not (bool(s.dev) and not bool(s.spectator) and shooter_i == int(s.me_idx)):
		s.bots.on_crime(shooter_i, kp)
	return true


## 把濒死者救起：取消流血倒计时，保留"这一局被救过一次"的标记
static func revive(s, agent_i: int, method: String = "manual", stun: float = 0.0) -> bool:
	var a: Dictionary = s.agent(agent_i)
	if a.is_empty() or not bool(a.get("alive", false)) or not bool(a.get("downed", false)):
		return false
	a["downed"] = false
	a["downedT"] = 0.0
	a["deathCause"] = ""
	a["medTried"] = true
	a["searched"] = false
	if stun > 0.0:
		a["stunT"] = stun
	a["path"] = PackedVector2Array()
	a["moving"] = false
	var dragger: Variant = a.get("draggedBy", null)
	if dragger != null and int(dragger) >= 0:
		s.release_drag(int(dragger))
	a["draggedBy"] = null
	var p: Vector2 = a.get("pos", Vector2.ZERO)
	s._log("revive", {"actor": agent_i, "victim": agent_i, "method": method,
		"stun": stun, "room": s.room_at(p),
		"x": snappedf(p.x, 0.1), "y": snappedf(p.y, 0.1)})
	return true


static func die(s, v: Dictionary) -> bool:
	if v.is_empty() or not bool(v.get("alive", false)):
		return false
	if bool(s.dev) and not bool(s.spectator) and int(v.get("i", -1)) == int(s.me_idx):
		s._dev_note("DEV 无敌：死亡被拦截")
		return false
	v["alive"] = false
	v["downed"] = false
	v["ghost"] = true
	v["deathAt"] = float(s.elapsed)
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
		s.release_drag(int(dragged_by))
	v["draggedBy"] = -1
	var dragging: Variant = v.get("drag", -1)
	if dragging != null and int(dragging) >= 0:
		s.release_drag(int(v.get("i", -1)))
	v["drag"] = -1
	v["deathRoom"] = String(v.get("downRoom", ""))
	if String(v.get("deathRoom", "")) == "":
		v["deathRoom"] = s.room_at(v.get("bodyPos", Vector2.ZERO))
	if String(v.get("deathCause", "")) == "":
		v["deathCause"] = "bleed"
	s._log("kill", {"actor": int(v.get("i", -1)), "cause": String(v.get("deathCause", "")),
		"by": int(v.get("killedBy", -1))})
	s.check_win()
	return true


## 视野半径（2.5D sightRangeAt）：亮舱受视口上限封顶，亮走廊 corrR，暗区 humanDarkR。
static func sight_range_at(s, p: Vector2) -> float:
	var cfg: Dictionary = s.cfg
	var S: Dictionary = (cfg.get("rules", {}) as Dictionary).get("SIGHT", {}) as Dictionary
	var dark_r := float(S.get("humanDarkR", 2.0))
	if int(s.light_state) == 2:
		return dark_r
	var rid: String = s.room_at(p)
	if rid == "":
		return float(S.get("corrR", 12.0))
	var rooms_by_id: Dictionary = s.rooms_by_id
	var r: Dictionary = rooms_by_id.get(rid, {}) as Dictionary
	if int(s.light_state) == 1 or String(r.get("light", "")) == "bright":
		var rect: Array = r.get("rect", []) as Array
		if rect.size() >= 4:
			var vcap := maxf(float(S.get("litViewHalfW", 10.5)), float(S.get("litViewHalfH", 6.5)))
			return minf(maxf(float(rect[2]), float(rect[3])) * float(S.get("litRoomMul", 1.15)), vcap)
	return dark_r


## AI 视野判据 = 2.5D observerVisionAt（js/ai/cognition.js:553）：亮区受视口 litViewHalfW/H 约束。
static func ai_can_see(s, observer: Dictionary, p: Vector2) -> bool:
	var wp: Vector2 = observer.get("pos", Vector2.ZERO)
	var alien := bool(observer.get("alien", false))
	var aim := agent_aim_ang(observer)
	var cfg: Dictionary = s.cfg
	var S: Dictionary = (cfg.get("rules", {}) as Dictionary).get("SIGHT", {}) as Dictionary
	var dark_r: float = float(S.get("alienDarkR", 4.0)) if alien else float(S.get("humanDarkR", 2.0))
	var light_r := float(S.get("humanLightR", 5.5))
	var oz := lit_zone_at(s, wp)
	if oz != "":
		var tz := lit_zone_at(s, p)
		var in_view := absf(p.x - wp.x) <= float(S.get("litViewHalfW", 10.5)) \
			and absf(p.y - wp.y) <= float(S.get("litViewHalfH", 6.5))
		if tz == oz:
			return in_view
		if oz.begins_with("r:") and tz.begins_with("c:"):
			var rid := oz.substr(2)
			var c := corridor_by_id(s, tz.substr(2))
			if not c.is_empty() and corr_joins_room(rid, c) and in_view \
					and bool(s.los_now(wp.x, wp.y, p.x, p.y)):
				return true
	var d := wp.distance_to(p)
	var los_ok: bool = bool(s.los_now(wp.x, wp.y, p.x, p.y))
	if d <= dark_r and los_ok:
		return true
	if d > light_r or not los_ok:
		return false
	var ang := atan2(p.y - wp.y, p.x - wp.x)
	var dd := absf(ang - aim)
	if dd > PI:
		dd = 2.0 * PI - dd
	return dd <= PI / 6.0


## 2.5D agentAimAng（js/game.js:1805）
static func agent_aim_ang(a: Dictionary) -> float:
	var path: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
	if path.size() > 0:
		var pi := clampi(int(a.get("pathI", 0)), 0, path.size() - 1)
		var p0: Vector2 = path[pi]
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		var step := p0 - ap
		if step.length_squared() > 0.000001:
			return atan2(step.y, step.x)
	return float(a.get("aimAng", 0.0))


## 2.5D litZoneAt（js/game.js:10644）：亮区标识 r:<room> / c:<corridor>。
static func lit_zone_at(s, p: Vector2) -> String:
	var rid: String = s.room_at(p)
	if rid != "":
		var rooms_by_id: Dictionary = s.rooms_by_id
		var r: Dictionary = rooms_by_id.get(rid, {}) as Dictionary
		if String(r.get("light", "")) == "bright":
			return "r:" + rid
		return ""
	if not bool(s.power_on) or s.nav == null:
		return ""
	var c: Variant = s.nav.corridor_at(p)
	if c == null:
		return ""
	return "c:" + String((c as Dictionary).get("id", ""))


static func corridor_by_id(s, cid: String) -> Dictionary:
	var map: Dictionary = s.map
	for c: Dictionary in (map.get("corridors", []) as Array):
		if String(c.get("id", "")) == cid:
			return c
	return {}


static func corr_joins_room(rid: String, c: Dictionary) -> bool:
	return String(c.get("a", "")) == rid or String(c.get("b", "")) == rid


## 最近的濒死者（2.5D nearestDowned）
static func nearest_downed(s, pos: Vector2, radius: float, observer: Dictionary = {}) -> Dictionary:
	var best: Dictionary = {}
	var bd := radius
	for a: Dictionary in (s.agents as Array):
		if not bool(a.get("alive", false)) or not bool(a.get("downed", false)):
			continue
		if bool(a.get("detained", false)):
			continue
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		var d := ap.distance_to(pos)
		if d >= bd:
			continue
		if not observer.is_empty() and not ai_can_see(s, observer, ap):
			continue
		bd = d
		best = a
	return best


## 目击通知（2.5D noticeAction 的最小实现）
static func witness_action(s, actor: Dictionary, kind: String, at: Vector2, victim_i: int = -1) -> void:
	var mind = s.mind
	if not bool(s.speech_enabled) or mind == null:
		return
	var ai := int(actor.get("i", -1))
	var id_ev: Dictionary = mind.id_evidence()
	var agents: Array = s.agents
	for w: Dictionary in agents:
		if int(w.get("i", -1)) == ai or bool(w.get("alien", false)):
			continue
		if not bool(w.get("alive", false)) or bool(w.get("downed", false)):
			continue
		if float(w.get("doing", 0.0)) > 0.0:
			continue
		if not ai_can_see(s, w, at):
			continue
		mind.note_sight(int(w.get("i", -1)), ai, kind, at, victim_i)
	if id_ev.has(kind):
		for w2: Dictionary in agents:
			if int(w2.get("i", -1)) == ai or not bool(w2.get("alien", false)):
				continue
			if not bool(w2.get("alive", false)) or bool(w2.get("downed", false)):
				continue
			if not ai_can_see(s, w2, at):
				continue
			var mates: Dictionary = (w2.get("mates", {}) as Dictionary).duplicate()
			mates[ai] = {"t": float(s.elapsed), "kind": kind}
			w2["mates"] = mates


## 红身 / seenBy 追踪（2.5D trackNight 的节流版）：每 0.5 秒一次
static func track_pass(s) -> void:
	var mind = s.mind
	if not bool(s.speech_enabled) or mind == null:
		return
	var now := float(s.elapsed)
	var agents: Array = s.agents
	var rules = s.rules
	var night := int(s.night)
	var near_r := float(rules.n("AVOID", "nearR", 6.0))
	var near_r2 := near_r * near_r
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
			if not ai_can_see(s, w, ap):
				continue
			# 原地更新 seenBy / _lastSaw / redSeen / mates，避免 0.5s 周期内反复 .duplicate() 分配
			var sb: Variant = w.get("seenBy", null)
			if not (sb is Dictionary):
				sb = {}
				w["seenBy"] = sb
			var sbd := sb as Dictionary
			if sbd.has(ai) and sbd[ai] is Dictionary:
				(sbd[ai] as Dictionary)["t"] = now
			else:
				sbd[ai] = {"t": now}
			var ls: Variant = w.get("_lastSaw", null)
			var last_t := float((ls as Dictionary).get(ai, 0.0)) if ls is Dictionary else 0.0
			if now - last_t >= 3.5:
				if not (ls is Dictionary):
					ls = {}
					w["_lastSaw"] = ls
				(ls as Dictionary)[ai] = now
				var rid: String = s.room_at(ap)
				mind.note_track(int(w.get("i", -1)), ai, ap, rid)
			if float(a.get("redT", 0.0)) > 0.0:
				var rs: Variant = w.get("redSeen", null)
				var rs_t := float((rs as Dictionary).get(ai, -999.0)) if rs is Dictionary else -999.0
				if now - rs_t > 5.0:
					if not (rs is Dictionary):
						rs = {}
						w["redSeen"] = rs
					(rs as Dictionary)[ai] = now
					if not bool(w.get("alien", false)):
						mind.note_sight(int(w.get("i", -1)), ai, "saw_red", ap)
					else:
						var m2: Variant = w.get("mates", null)
						if not (m2 is Dictionary):
							m2 = {}
							w["mates"] = m2
						(m2 as Dictionary)[ai] = {"t": now, "kind": "saw_red"}
			if int(w.get("_avoidHuman", -1)) == ai:
				var wi := int(w.get("i", -1))
				var av: Variant = a.get("avoidSeen", null)
				var av_n := int((av as Dictionary).get(wi, -1)) if av is Dictionary else -1
				if av_n != night:
					if wp.distance_squared_to(ap) <= near_r2:
						if not (av is Dictionary):
							av = {}
							a["avoidSeen"] = av
						(av as Dictionary)[wi] = night
						mind.sus_add(a, wi, float(rules.n("AVOID", "sus", 0.10)),
							"他刚才在躲我",
							{"kind": "saw_avoid", "src": "sight", "night": night})
						s._stat("avoidSus", 1)


## 2.5D watchersAt（js/game.js:3183）
static func watchers_at(s, a: Dictionary, at: Vector2, rad: float, except_i: int = -1) -> Array:
	var out: Array = []
	var r := maxf(maxf(rad, SpaceData.num(s.space as Dictionary, "sight", "human_light_r")),
		sight_range_at(s, at))
	for w: Dictionary in (s.agents as Array):
		var wi := int(w.get("i", -1))
		if w == a or wi == except_i or not bool(w.get("alive", false)) \
				or bool(w.get("downed", false)) or bool(w.get("detained", false)):
			continue
		if float(w.get("doing", 0.0)) > 0.0:
			continue
		if (w.get("pos", Vector2.ZERO) as Vector2).distance_to(at) > r:
			continue
		if not ai_can_see(s, w, at):
			continue
		out.append(w)
	return out


## 2.5D recentWitness（js/game.js:3121）：最近 sec 秒内有没有活人看见过我。
static func recent_witness(s, a: Dictionary, sec: float) -> bool:
	var ai := int(a.get("i", -1))
	var elapsed := float(s.elapsed)
	for w: Dictionary in (s.agents as Array):
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
static func secbot_raid_ok(s, a: Dictionary, sec_pos: Vector2) -> bool:
	if a.is_empty() or not bool(a.get("alive", false)) or bool(a.get("downed", false)):
		return false
	var mates := 0
	for k: Variant in (a.get("mates", {}) as Dictionary).keys():
		var m: Dictionary = s.agent(int(k))
		if m.is_empty() or not bool(m.get("alive", false)) or bool(m.get("downed", false)) \
				or bool(m.get("detained", false)):
			continue
		if (m.get("pos", Vector2.ZERO) as Vector2).distance_to(sec_pos) <= 8.0:
			mates += 1
	if mates < 2:
		return false
	var rng: RandomNumberGenerator = s._rng
	for v: Dictionary in (s.agents as Array):
		if v == a or not bool(v.get("alive", false)) or bool(v.get("downed", false)) \
				or bool(v.get("detained", false)) or bool(v.get("alien", false)):
			continue
		if (v.get("pos", Vector2.ZERO) as Vector2).distance_to(sec_pos) > 8.0:
			continue
		for k2: Variant in (a.get("mates", {}) as Dictionary).keys():
			var m2: Dictionary = s.agent(int(k2))
			if m2.is_empty() or not bool(m2.get("alive", false)) or bool(m2.get("downed", false)) \
					or bool(m2.get("detained", false)):
				continue
			var m2p: Vector2 = m2.get("pos", Vector2.ZERO)
			if m2p.distance_to(sec_pos) > 8.0:
				continue
			if m2p.distance_to(v.get("pos", Vector2.ZERO)) <= 7.0:
				return rng.randf() < 0.45
	return false


## 听觉（2.5D aiHear，js/game.js:1827）
static func hear(s, kind: String, at: Vector2, rad: float, extra: Dictionary = {}) -> void:
	if bool(s.over) or not (s.meeting as Dictionary).is_empty():
		return
	if kind == "knife" or kind == "pipe" or kind == "sabotage" or kind == "bot":
		var cfg: Dictionary = s.cfg
		var snd_cfg: Dictionary = (cfg.get("rules", {}) as Dictionary).get("SOUND", {}) as Dictionary
		rad *= float(snd_cfg.get("alienActMul", 0.5))
	var actor: Variant = extra.get("actor", null)
	var subj := int(extra.get("subj", -1))
	var victim: Variant = extra.get("victim", null)
	var rules = s.rules
	var mind = s.mind
	var ev_w: Dictionary = rules.constant("EV_W") as Dictionary if rules != null else {}
	var ax_cap: float = maxf(1.0, float(rules.n("AXIS", "cap", 200.0))) if rules != null else 200.0
	var s_mul: float = float(rules.n("AXIS", "scoreMul", 0.6)) if rules != null else 0.6
	var h_cap: float = float(rules.n("HEARD", "cap", 20.0)) * s_mul / ax_cap if rules != null else 0.06
	var elapsed := float(s.elapsed)
	var night := int(s.night)
	for a: Dictionary in (s.agents as Array):
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
		var los_ok: bool = bool(s.los_now(ap.x, ap.y, at.x, at.y))
		var conf := maxf(0.12, 1.0 - d / rad) * (1.0 if los_ok else 0.72)
		if conf > 0.25 and at.x > 0.0 and at.y > 0.0:
			a["alert"] = minf(1.0, float(a.get("alert", 0.0)) + conf * 0.35)
			a["noise"] = {"x": at.x, "y": at.y, "t": elapsed, "night": night,
				"kind": "heard_" + kind, "conf": snappedf(conf, 0.01)}
		if mind == null or subj < 0:
			continue
		var w := float(ev_w.get("heard_" + kind, 0.0)) if not ev_w.is_empty() else 0.0
		if w <= 0.0:
			continue
		var ev := {"kind": "heard_" + kind, "x": at.x, "y": at.y, "room": s.room_at(at),
			"subj": subj, "conf": snappedf(conf, 0.01), "src": "sound",
			"victim": victim, "night": night}
		mind.sus_add(a, subj, minf(h_cap, w * 80.0 * conf * s_mul / ax_cap), "heard_" + kind, ev)


## 玩家能力判定单一真源
static func can_act(s, kind: String, ctx: Dictionary = {}) -> Dictionary:
	var ai := int(ctx.get("actor", int(s.me_idx)))
	var a: Dictionary = s.agent(ai)
	if a.is_empty():
		return _act_no("no_actor")
	if bool(s.over) or not (s.meeting as Dictionary).is_empty():
		return _act_no("meeting")
	if not bool(a.get("alive", false)) and not bool(a.get("ghost", false)):
		return _act_no("dead")
	if bool(a.get("downed", false)):
		return _act_no("downed")
	if bool(a.get("detained", false)):
		return _act_no("detained")
	var ghost := bool(a.get("ghost", false))
	var pos: Vector2 = ctx.get("pos", a.get("pos", Vector2.ZERO))
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var space: Dictionary = s.space
	match kind:
		"knife":
			if not bool(a.get("alien", false)):
				return _act_no("not_alien")
			if int(a.get("knife", 0)) < 1:
				return _act_no("no_knife")
			var vi := int(ctx.get("victim", -1))
			var v: Dictionary = s.agent(vi)
			if v.is_empty():
				return _act_no("no_target")
			if not bool(v.get("alive", false)) or bool(v.get("downed", false)) \
					or bool(v.get("detained", false)):
				return _act_no("target_down")
			var vp: Vector2 = v.get("pos", Vector2.ZERO)
			if ap.distance_to(vp) > SpaceData.num(space, "reach", "knife"):
				return _act_no("out_of_reach")
			if not bool(s.los_now(ap.x, ap.y, vp.x, vp.y)):
				return _act_no("no_los")
			return _act_ok(vi)
		"knife_bot":
			if not bool(a.get("alien", false)):
				return _act_no("not_alien")
			if int(a.get("knife", 0)) < 1:
				return _act_no("no_knife")
			var bk := String(ctx.get("bot", ""))
			if bk != "secbot" and bk != "medbot":
				return _act_no("no_target")
			if s.bots == null or s.bots.is_dead(bk):
				return _act_no("target_down")
			var bp: Vector2 = s.bots.pos_of(bk)
			if ap.distance_to(bp) >= 1.8:
				return _act_no("out_of_reach")
			if not bool(s.los_now(ap.x, ap.y, bp.x, bp.y)):
				return _act_no("no_los")
			return _act_ok(-1, "knife_bot:" + bk)
		"shoot":
			if int(a.get("bullet", 0)) <= 0:
				return _act_no("no_bullet")
			var si := int(ctx.get("victim", -1))
			var tgt: Dictionary = s.agent(si)
			if tgt.is_empty() or not bool(tgt.get("alive", false)) or bool(tgt.get("downed", false)):
				return _act_no("no_target")
			var sp: Vector2 = tgt.get("pos", Vector2.ZERO)
			if ap.distance_to(sp) > SpaceData.num(space, "shoot", "range"):
				return _act_no("out_of_reach")
			if not bool(s.los_now(ap.x, ap.y, sp.x, sp.y)):
				return _act_no("no_los")
			return _act_ok(si)
		"drag":
			if ghost:
				return _act_no("ghost")
			if int(a.get("drag", -1)) >= 0:
				return _act_ok(int(a.get("drag", -1)), "drop")
			var radius := SpaceData.num(space, "reach", "body")
			var best := -1
			var best_d := radius
			for x: Dictionary in (s.agents as Array):
				if int(x.get("i", -1)) == ai:
					continue
				var downed := bool(x.get("alive", false)) and bool(x.get("downed", false))
				if bool(x.get("alive", false)) and not downed:
					continue
				if bool(x.get("bodyGone", false)):
					continue
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
			if bool(s.terminator_on):
				return _act_no("terminator")
			if ghost:
				return _act_no("ghost")
			var best_body: Dictionary = {}
			var best_bd := 2.4
			for v: Dictionary in (s.agents as Array):
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
			if int(a.get("reportLeft", 0)) <= 0 or int(s.night_meet_left()) <= 0:
				return _act_no("no_report_quota")
			return _act_ok(int(best_body.get("i", -1)))
		"sabotage":
			if not bool(a.get("alien", false)):
				return _act_no("not_alien")
			if ghost:
				return _act_no("ghost")
			if bool(a.get("sabUsed", false)):
				return _act_no("sab_used")
			var rid: String = String(ctx.get("room", s.room_at(pos)))
			if rid == "" or rid == "bridge":
				return _act_no("sab_room")
			for d: Dictionary in (s.dmg as Array):
				if String(d.get("room", "")) == rid:
					return _act_no("sab_room")
			return _act_ok(-1, rid)
		"pipe":
			if not bool(a.get("alien", false)):
				return _act_no("not_alien")
			if ghost:
				return _act_no("ghost")
			if int(a.get("drag", -1)) >= 0:
				return _act_ok(-1, "release_drag")
			return _act_ok(-1, "open")
		"task", "fix", "breaker", "cams", "search", "revive", "supply", "claim", "bot", "inspect":
			if ghost and kind != "task":
				return _act_no("ghost")
			return _act_ok()
		_:
			return _act_no("unknown_action")


static func _act_no(reason: String) -> Dictionary:
	return {"ok": false, "reason": reason, "target": -1, "action": ""}


static func _act_ok(target: int = -1, action: String = "") -> Dictionary:
	return {"ok": true, "reason": "", "target": target, "action": action}


## ---- B6′：机器人 HP 与反制（bot_hit / bot_down）----
static func hit_bot(s, shooter_i: int, kind: String) -> bool:
	var a: Dictionary = s.agent(shooter_i)
	if a.is_empty() or int(a.get("bullet", 0)) <= 0:
		return false
	if bool(s.over) or not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
			or bool(a.get("detained", false)):
		return false
	var bot_hp: Dictionary = s.bot_hp
	if not bot_hp.has(kind) or int(bot_hp.get(kind, 0)) <= 0:
		return false
	var fac: Dictionary = {}
	var map: Dictionary = s.map
	for f: Dictionary in (map.get("facility", []) as Array):
		if String(f.get("kind", "")) == kind:
			fac = f
			break
	if fac.is_empty():
		return false
	var fp := Vector2(float(fac.get("x", 0)), float(fac.get("y", 0)))
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	if ap.distance_to(fp) > SpaceData.num(s.space as Dictionary, "shoot", "range"):
		return false
	if not bool(s.los_now(ap.x, ap.y, fp.x, fp.y)):
		return false
	a["bullet"] = int(a.get("bullet", 0)) - 1
	bot_hp[kind] = int(bot_hp.get(kind, 0)) - 1
	s._log("bot_hit", {"actor": shooter_i, "bot": kind, "hp": int(bot_hp.get(kind, 0))})
	if s.bots != null:
		s.bots.face_point(ap)
	if int(bot_hp.get(kind, 0)) <= 0:
		if s.bots != null:
			s.bots.kill(kind)
		s._log("bot_down", {"actor": shooter_i, "bot": kind})
	if s.bots != null:
		s.bots.on_crime(shooter_i, ap)
	return true


## 用刀拆机器人（2.5D knifeBot）
static func knife_bot(s, kind: String, by: int) -> bool:
	var a: Dictionary = s.agent(by)
	if a.is_empty() or s.bots == null:
		return false
	if bool(s.over) or not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
			or bool(a.get("detained", false)):
		return false
	if kind != "secbot" and kind != "medbot":
		return false
	var bot_hp: Dictionary = s.bot_hp
	if int(a.get("knife", 0)) < 1 or s.bots.is_dead(kind):
		return false
	if not bot_hp.has(kind) or int(bot_hp.get(kind, 0)) <= 0:
		return false
	var bp: Vector2 = s.bot_pos_of(kind)
	if float(s.distance_to(by, bp)) >= 1.8:
		return false
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	if not bool(s.los_now(ap.x, ap.y, bp.x, bp.y)):
		return false
	a["knife"] = int(a.get("knife", 0)) - 1
	bot_hp[kind] = int(bot_hp.get(kind, 0)) - 1
	var cfg: Dictionary = s.cfg
	a["redT"] = float((cfg.get("rules", {}) as Dictionary).get("RED_BODY", {}).get("dur", 1.5))
	s._log("bot_hit", {"actor": by, "bot": kind, "hp": int(bot_hp.get(kind, 0))})
	witness_action(s, a, "saw_bot", bp)
	s.bots.face_point(ap)
	if int(bot_hp.get(kind, 0)) <= 0:
		s.bots.kill(kind)
		s._log("bot_down", {"actor": by, "bot": kind})
	s.bots.on_crime(by, ap)
	return true


## 2.5D sabotageBot()：异形用「破坏」把机器人直接停摆（每夜一次，不耗刀/弹）。
static func sabotage_bot(s, kind: String, by: int) -> bool:
	var a: Dictionary = s.agent(by)
	if a.is_empty() or s.bots == null:
		return false
	if not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
			or bool(a.get("detained", false)):
		return false
	if not bool(a.get("alien", false)):
		return false
	if bool(a.get("sabUsed", false)) and not bool(s.dev):
		return false
	var bot_hp: Dictionary = s.bot_hp
	if s.bots.is_dead(kind) or not bot_hp.has(kind) or int(bot_hp.get(kind, 0)) <= 0:
		return false
	var bp: Vector2 = s.bot_pos_of(kind)
	if (a.get("pos", Vector2.ZERO) as Vector2).distance_to(bp) > 1.8:
		return false
	if not bool(s.dev):
		a["sabUsed"] = true
	bot_hp[kind] = 0
	s.bots.kill(kind)
	s._log("bot_down", {"actor": by, "bot": kind, "method": "sabotage"})
	witness_action(s, a, "saw_bot", bp)
	hear(s, "robot_down", bp, 18.0, {"actor": by})
	s.env_notice("robot", bp, 0.5)
	s.bots.on_crime(by, a.get("pos", Vector2.ZERO))
	return true
