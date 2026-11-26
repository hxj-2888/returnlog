extends RefCounted

## 船体系统子模块：自动门、电闸三态照明、破坏与故障、补给与申请单、
## 拖拽/施救、尸体扫描与报案评估、幽灵行动（从 sim_state.gd 拆分）。
## 只读/写传入的 s（sim_state 实例）字段，判定与数值口径 100% 保持同源。

const SpaceData := preload("res://scripts/space_data.gd")


## 圆桌领申请单：结算函数。
static func claim_qual(s, agent_i: int = -1) -> bool:
	var a: Dictionary = s.me() if agent_i < 0 else s.agent(agent_i)
	if a.is_empty() or int(a.get("qualPending", 0)) <= 0:
		return false
	a["qualPending"] = int(a.get("qualPending", 0)) - 1
	a["qual"] = mini(2, int(a.get("qual", 0)) + 1)
	s._log("qual", {"actor": int(a.get("i", -1)), "n": int(a.get("qual", 0))})
	return true


## 补给点兑换：消耗 1 张申请单换 1 份子弹 / 医疗包。
static func supply_cool_left(s, item: String) -> float:
	var k := "med" if item == "medkit" else item
	var scd: Dictionary = s.supply_cd
	return maxf(0.0, float(scd.get(k, 0.0)))


static func supply_cd_tick(s, dt: float) -> void:
	var scd: Dictionary = s.supply_cd
	if float(scd.get("ammo", 0.0)) > 0.0:
		scd["ammo"] = maxf(0.0, float(scd.get("ammo", 0.0)) - dt)
	if float(scd.get("med", 0.0)) > 0.0:
		scd["med"] = maxf(0.0, float(scd.get("med", 0.0)) - dt)


## 2.5D applyRoomOut / outBlocksDoing / roomOutTick（js/game.js:874-897）
static func apply_room_out(_s) -> void:
	pass


static func out_blocks_doing(s, a: Dictionary) -> bool:
	var room_out: Dictionary = s.room_out
	if a.is_empty() or room_out.is_empty():
		return false
	if String(a.get("_doing", "")) != "task":
		return false
	var tp := int(a.get("taskPt", -1))
	var p: Dictionary = s.point(tp)
	if p.is_empty():
		return false
	var rid := String(p.get("room", ""))
	return rid != "" and float(room_out.get(rid, 0.0)) > 0.0


static func room_out_tick(s, dt: float) -> void:
	var room_out: Dictionary = s.room_out
	if room_out.is_empty():
		return
	var ch := false
	for k: String in room_out.keys():
		var left := float(room_out.get(k, 0.0)) - dt
		if left <= 0.0:
			room_out.erase(k)
			ch = true
		else:
			room_out[k] = left
	if ch:
		apply_room_out(s)


static func exchange_supply(s, item: String, agent_i: int = -1) -> bool:
	var a: Dictionary = s.me() if agent_i < 0 else s.agent(agent_i)
	if a.is_empty() or int(a.get("qual", 0)) <= 0:
		return false
	if item != "ammo" and item != "medkit":
		return false
	if supply_cool_left(s, item) > 0.0:
		return false
	a["qual"] = int(a.get("qual", 0)) - 1
	var key := "bullet" if item == "ammo" else "medkit"
	a[key] = int(a.get(key, 0)) + 1
	var cd_key := "med" if item == "medkit" else "ammo"
	var cd_sec := float(s.rules.n("SUPPLY", "cooldown", 20.0)) if s.rules != null else 20.0
	var scd: Dictionary = s.supply_cd
	scd[cd_key] = cd_sec
	s._log("supply", {"actor": int(a.get("i", -1)), "item": item})
	return true


## 圆桌领申请单的站位：圆桌下沿外 1.2 格（与 2.5D roundTableClaimSpot 同口径）。
static func claim_spot(s) -> Vector2:
	var map: Dictionary = s.map
	for c: Dictionary in (map.get("cover", []) as Array):
		if String(c.get("label", "")) == "圆桌":
			return Vector2(float(c.get("x", 0)) + float(c.get("w", 0)) * 0.5,
				float(c.get("y", 0)) + float(c.get("h", 0)) + 1.2)
	var rooms_by_id: Dictionary = s.rooms_by_id
	var r: Dictionary = rooms_by_id.get("bridge", {}) as Dictionary
	var lab: Array = r.get("label", [31.0, 33.5]) as Array
	return Vector2(float(lab[0]), float(lab[1]))


## 补给点坐标：军械 ammo / 医疗 medkit。
static func supply_spot(s, item: String) -> Vector2:
	var map: Dictionary = s.map
	for f: Dictionary in (map.get("facility", []) as Array):
		if String(f.get("kind", "")) != "supply":
			continue
		if String(f.get("item", "")) == item:
			return Vector2(float(f.get("x", 0)), float(f.get("y", 0)))
	return claim_spot(s)


## 玩家施救入口（2.5D rescue()）
static func player_revive(s, body_i: int) -> bool:
	var me: Dictionary = s.agent(int(s.me_idx))
	if me.is_empty() or not bool(me.get("alive", false)) or bool(me.get("downed", false)):
		return false
	if int(me.get("medkit", 0)) <= 0:
		return false
	var v: Dictionary = s.agent(body_i)
	if v.is_empty() or not bool(v.get("alive", false)) or not bool(v.get("downed", false)):
		return false
	if not s.revive(body_i):
		return false
	me["medkit"] = int(me.get("medkit", 0)) - 1
	## 与 _finish_doing 的 "revive" 分支同口径：救人是公开的可信信号。
	if bool(s.speech_enabled) and s.mind != null:
		s.mind.cred_broadcast(int(s.me_idx), "revive", me.get("pos", Vector2.ZERO))
	return true


## @src js/game.js:1394 pickSabRoom（选目标）+ :1611 sabTick（抵达自动引爆）
static func player_sabotage(s, room_id: String) -> bool:
	var me: Dictionary = s.agent(int(s.me_idx))
	if me.is_empty() or not bool(me.get("alive", false)) or not bool(me.get("alien", false)):
		return false
	if bool(me.get("sabUsed", false)):
		return false
	if not sab_room_ok(s, room_id):
		return false
	var px := 0.0
	var py := 0.0
	for p: Dictionary in (s.points as Array):
		if String(p.get("room", "")) == room_id:
			px = float(p.get("x", 0.0))
			py = float(p.get("y", 0.0))
			break
	var pos: Vector2 = me.get("pos", Vector2.ZERO) as Vector2
	var reach := SpaceData.num(s.space as Dictionary, "reach", "sabotage")
	if String(s.room_at(pos)) == room_id or pos.distance_to(Vector2(px, py)) < reach:
		return sabotage_room(s, room_id, int(s.me_idx))
	s.sab_target = {"room": room_id, "x": px, "y": py}
	return true


## 2.5D sabSpot（js/game.js:1098-1113）：在该舱室的任务点里均匀随机抽一台设备，
## 没有任务点则退回舱室中心。同一夜同舱室缓存同一个落点；开夜在 _start_night 清空。
static func sab_spot_for(s, rid: String) -> Vector2:
	var sab_spots: Dictionary = s._sab_spots
	var hit: Variant = sab_spots.get(rid, null)
	if hit is Vector2:
		return hit as Vector2
	var cands: Array = []
	for p: Dictionary in (s.points as Array):
		if String(p.get("room", "")) == rid:
			cands.append(p)
	var pt := Vector2.ZERO
	var rng: RandomNumberGenerator = s._rng
	var rooms_by_id: Dictionary = s.rooms_by_id
	if not cands.is_empty():
		var pick: Dictionary = cands[rng.randi_range(0, cands.size() - 1)] as Dictionary
		pt = Vector2(float(pick.get("x", 0.0)), float(pick.get("y", 0.0)))
	elif rooms_by_id.has(rid):
		pt = s.room_center(rid)
	var f: Vector2 = s.nav.nearest_free(pt) if s.nav != null else pt
	sab_spots[rid] = f
	return f


static func sabotage_room(s, room_id: String, by: int, ghost: bool = false) -> bool:
	if room_id == "" or room_id == "bridge":
		return false
	var dmg: Array = s.dmg
	for d: Dictionary in dmg:
		if String(d.get("room", "")) == room_id:
			return false
	var sp: Vector2 = sab_spot_for(s, room_id)
	var px := sp.x
	var py := sp.y
	# 2.5D damageRoom()：`if(!G.designMode)a.sabUsed=true;` —— 每夜一次的账记在破坏入口本身。
	var sab_by: Dictionary = s.agent(by)
	if not sab_by.is_empty() and not bool(s.dev):
		sab_by["sabUsed"] = true
	dmg.append({"room": room_id, "by": by, "left": 30.0, "x": px, "y": py})
	s._log("sabotage", {"actor": by, "room": room_id})
	# 2.5D damageRoom：aiHear('sabotage',sp,20,{actor})
	s.hear("sabotage", Vector2(px, py), 20.0, {"actor": by})
	# 2.5D damageRoom：活人破坏写目击（witnessAlienAction 6 格）；幽灵不可被活人看见
	if not ghost and not sab_by.is_empty():
		s._witness_action(sab_by, "saw_sabotage", Vector2(px, py))
	var out_sec := float(s.rules.n("SABOTAGE", "outSec", 30.0)) if s.rules != null else 30.0
	var room_out: Dictionary = s.room_out
	room_out[room_id] = out_sec
	apply_room_out(s)
	# @src js/game.js:1404 damageRoom：`envNotice('fault',sp.x,sp.y,0.55)`
	s.env_notice("fault", Vector2(px, py), 0.55)
	return true


static func fix_damage(s, room_id: String, by: int = -1) -> bool:
	var dmg: Array = s.dmg
	var room_out: Dictionary = s.room_out
	for i in range(dmg.size() - 1, -1, -1):
		var d: Dictionary = dmg[i] as Dictionary
		if String(d.get("room", "")) == room_id:
			dmg.remove_at(i)
			var r_out := String(d.get("room", ""))
			if room_out.has(r_out):
				room_out.erase(r_out)
				apply_room_out(s)
			# 2.5D finishFix（js/game.js:7947-7960）：修好的一瞬间全部松手
			for x: Dictionary in (s.agents as Array):
				if String(x.get("_doing", "")) == "fix" \
						and String(x.get("_item", "")) == room_id:
					x["doing"] = 0.0
					x["_doing"] = ""
					x["path"] = PackedVector2Array()
					x["moving"] = false
				var fg: Variant = x.get("_fixGo", null)
				if fg is Dictionary and String((fg as Dictionary).get("room", "")) == room_id:
					x["_fixGo"] = {}
			s._log("fix", {"room": room_id, "ok": true})
			# 2.5D credBroadcast：修好故障是"最像人"的动作
			if bool(s.speech_enabled) and s.mind != null and by >= 0:
				var ba: Dictionary = s.agent(by)
				var bp: Vector2 = ba.get("pos", Vector2.ZERO)
				s.mind.cred_broadcast(by, "fixDone", bp)
			return true
	return false


static func tick_dmg(s, dt: float) -> void:
	var dmg: Array = s.dmg
	var room_out: Dictionary = s.room_out
	var cfg: Dictionary = s.cfg
	for i in range(dmg.size() - 1, -1, -1):
		var d: Dictionary = dmg[i] as Dictionary
		d["left"] = float(d.get("left", 0.0)) - dt
		if float(d.get("left", 0.0)) <= 0.0:
			s.prog = maxi(0, int(s.prog) - int((cfg.get("win", {}) as Dictionary).get("fault_penalty", 5)))
			s._log("fix", {"room": String(d.get("room", "")), "ok": false, "prog": int(s.prog)})
			dmg.remove_at(i)
			var r_out := String(d.get("room", ""))
			if room_out.has(r_out):
				room_out.erase(r_out)
				apply_room_out(s)


# ---------------- 门（2.5D buildDoors / doorTick / doorBlockedSegment / losNow） ----------------

## 2.5D buildDoors（js/game.js:415）：只给「走廊端点正对的那扇舱门」生成门，
## id 是 `走廊id:舱室id`。
static func build_doors(s) -> void:
	var doors: Array = []
	s.doors = doors
	var space: Dictionary = s.space
	var map: Dictionary = s.map
	var rooms_by_id: Dictionary = s.rooms_by_id
	var width := SpaceData.num(space, "door", "width")
	for c: Dictionary in (map.get("corridors", []) as Array):
		var pts: Array = c.get("pts", []) as Array
		if pts.size() < 2:
			continue
		var cid := String(c.get("id", ""))
		for e: Array in [[0, String(c.get("a", ""))], [pts.size() - 1, String(c.get("b", ""))]]:
			var rid := String(e[1])
			var r: Dictionary = rooms_by_id.get(rid, {}) as Dictionary
			if r.is_empty():
				continue
			var p: Array = pts[int(e[0])] as Array
			var rect: Array = r.get("rect", []) as Array
			if rect.size() < 4 or p.size() < 2:
				continue
			var best: Array = []
			var bd := 1.0e9
			for d: Array in (r.get("doors", []) as Array):
				var side := String(d[0])
				var v := float(d[1])
				if side == "t" or side == "b":
					var wy := float(rect[1]) if side == "t" else float(rect[1]) + float(rect[3])
					if absf(float(p[1]) - wy) > 0.01:
						continue
					var dd := absf(v - float(p[0]))
					if dd < bd:
						bd = dd
						best = d
				else:
					var wx := float(rect[0]) if side == "l" else float(rect[0]) + float(rect[2])
					if absf(float(p[0]) - wx) > 0.01:
						continue
					var dd2 := absf(v - float(p[1]))
					if dd2 < bd:
						bd = dd2
						best = d
			if best.is_empty():
				continue
			var side2 := String(best[0])
			var horiz := side2 == "t" or side2 == "b"
			var x := float(best[1]) if horiz else \
				(float(rect[0]) if side2 == "l" else float(rect[0]) + float(rect[2]))
			var y := (float(rect[1]) if side2 == "t" else float(rect[1]) + float(rect[3])) \
				if horiz else float(best[1])
			doors.append({
				"id": cid + ":" + rid,
				"key": "%s|%s|%.3f" % [rid, side2, float(best[1])],
				"room": rid, "x": x, "y": y, "horiz": horiz, "w": width,
				"open": 0.0, "scan_t": 0.0,
				"x1": x - width * 0.5 if horiz else x,
				"y1": y if horiz else y - width * 0.5,
				"x2": x + width * 0.5 if horiz else x,
				"y2": y if horiz else y + width * 0.5,
			})


## 2.5D doorTick（js/game.js:448）：断电时全船每扇门都要 2 秒安检扫描才放行；
## 人离开重新上锁；恢复供电立即解除。滞回半径（open_r 3.0 / close_r 3.6）照抄。
static func door_tick(s, dt: float) -> void:
	var doors: Array = s.doors
	if doors.is_empty() or not (s.meeting as Dictionary).is_empty() or bool(s.over):
		return
	var space: Dictionary = s.space
	var blackout := int(s.light_state) == 2
	var open_r := SpaceData.num(space, "door", "open_r")
	var close_r := SpaceData.num(space, "door", "close_r")
	var speed := SpaceData.num(space, "door", "speed")
	var scan_sec := SpaceData.num(space, "door", "scan_sec")
	var agents: Array = s.agents
	for d: Dictionary in doors:
		var scan_rule := blackout
		var range_r := close_r if scan_rule else (close_r if float(d["open"]) > 0.02 else open_r)
		var busy := false
		for a: Dictionary in agents:
			if not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
					or bool(a.get("detained", false)):
				continue
			if (a.get("pos", Vector2.ZERO) as Vector2).distance_to(
					Vector2(float(d["x"]), float(d["y"]))) < range_r:
				busy = true
				break
		var target := 0.0
		if not scan_rule:
			d["scan_t"] = 0.0
			target = 1.0 if busy else 0.0
		elif not busy:
			d["scan_t"] = 0.0
		else:
			d["scan_t"] = minf(scan_sec, float(d["scan_t"]) + dt)
			target = 1.0 if float(d["scan_t"]) >= scan_sec else 0.0
		var prev := float(d["open"])
		if float(d["open"]) < target:
			d["open"] = minf(target, float(d["open"]) + dt * speed)
		elif float(d["open"]) > target:
			d["open"] = maxf(target, float(d["open"]) - dt * speed)
		if (prev < 1.0 and float(d["open"]) >= 1.0) or (prev > 0.0 and float(d["open"]) <= 0.0):
			s.hear("door", Vector2(float(d["x"]), float(d["y"])), 7.0)


## 2.5D doorBlockedSegment（js/game.js:484）：这一步会不会穿门。
static func door_blocked_segment(s, x1: float, y1: float, x2: float, y2: float) -> bool:
	var doors: Array = s.doors
	var nav = s.nav
	if doors.is_empty() or nav == null:
		return false
	var a := Vector2(x1, y1)
	var b := Vector2(x2, y2)
	var space: Dictionary = s.space
	var pass_r := SpaceData.num(space, "door", "pass")
	var scan_sec := SpaceData.num(space, "door", "scan_sec")
	var blackout := int(s.light_state) == 2
	for d: Dictionary in doors:
		var da := Vector2(float(d["x1"]), float(d["y1"]))
		var db := Vector2(float(d["x2"]), float(d["y2"]))
		if not nav.seg_x(a, b, da, db):
			continue
		if blackout and float(d["scan_t"]) < scan_sec:
			return true
		if float(d["open"]) > pass_r:
			continue
		return true
	return false


## 2.5D losNow（js/game.js:495）：墙/掩体视线 **且** 没有关着的门。
static func los_now(s, x1: float, y1: float, x2: float, y2: float) -> bool:
	var nav = s.nav
	if nav == null:
		return true
	var a := Vector2(x1, y1)
	var b := Vector2(x2, y2)
	if not nav.los(a, b):
		return false
	var doors: Array = s.doors
	if doors.is_empty():
		return true
	var pass_r := SpaceData.num(s.space as Dictionary, "door", "pass")
	for d: Dictionary in doors:
		if float(d["open"]) > pass_r:
			continue
		if nav.seg_x(a, b, Vector2(float(d["x1"]), float(d["y1"])),
				Vector2(float(d["x2"]), float(d["y2"]))):
			return false
	return true


## 2.5D sabRoomOk（js/game.js:1065）：可破坏的舱室 = 存在 + 不是会议室 + 没有未修复故障。
static func sab_room_ok(s, rid: String) -> bool:
	var rooms_by_id: Dictionary = s.rooms_by_id
	if rid == "" or rid == "bridge" or not rooms_by_id.has(rid):
		return false
	for d: Dictionary in (s.dmg as Array):
		if String(d.get("room", "")) == rid:
			return false
	return true


# ---------------- 尸体扫描 / 报告（2.5D aiScanBodies，js/game.js:2524） ----------------

static func scan_bodies(s, a: Dictionary, dt: float) -> void:
	var ai := int(a.get("i", -1))
	if not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
			or bool(a.get("detained", false)) or bool(s.over):
		return
	if int(a.get("drag", -1)) >= 0 or not (a.get("_reportPlan", {}) as Dictionary).is_empty():
		return
	var rt := float(a.get("_reportT", 0.0))
	if rt > 0.0:
		a["_reportT"] = rt - dt
		if float(a.get("_reportT", 0.0)) > 0.0:
			return
		var vi := int(a.get("_reportBody", -1))
		a["_reportBody"] = -1
		if vi < 0 or bool(s.over) or not (s.meeting as Dictionary).is_empty():
			return
		var v: Dictionary = s.agent(vi)
		if v.is_empty() or bool(v.get("bodyReported", false)):
			return
		var bp: Vector2 = v.get("bodyPos", Vector2.ZERO)
		if (a.get("pos", Vector2.ZERO) as Vector2).distance_to(bp) <= 5.8 \
				and s.ai_can_see(a, bp) and can_report_body(s, a, v):
			v["bodyReported"] = true
			s.open_meeting_kind(s.MEET_NIGHT, ai, vi)
		return
	a["_scanT"] = float(a.get("_scanT", 0.0)) + dt
	if float(a.get("_scanT", 0.0)) < 0.5:
		return
	a["_scanT"] = 0.0
	var best: Dictionary = {}
	var bd := 5.4
	var agents: Array = s.agents
	for v: Dictionary in agents:
		if v == a:
			continue
		if bool(v.get("bodyGone", false)) or bool(v.get("bodyReported", false)):
			continue
		if bool(v.get("alive", false)) and not bool(v.get("downed", false)):
			continue
		var bp: Vector2 = v.get("bodyPos", v.get("pos", Vector2.ZERO))
		var d := (a.get("pos", Vector2.ZERO) as Vector2).distance_to(bp)
		if d < bd and s.ai_can_see(a, bp):
			bd = d
			best = v
	if best.is_empty():
		a["_sawBody"] = -1
		return
	if s.mind != null:
		s.mind.note_body_seen(a, int(best.get("i", -1)))
	var want_loot := ai_wants_loot(s, a, best)
	var want_evidence: bool = not bool(a.get("alien", false)) \
		and not bool(best.get("searched", false))
	var busy_search := false
	for x: Dictionary in agents:
		if x != a and String(x.get("_doing", "")) == "search" \
				and int(x.get("_sv", -1)) == int(best.get("i", -1)):
			busy_search = true
			break
	var rescue: bool = int(a.get("medkit", 0)) > 0 and bool(best.get("alive", false)) \
		and bool(best.get("downed", false))
	var best_db: Variant = best.get("draggedBy", null)
	var best_free: bool = best_db == null or int(best_db) < 0
	var space: Dictionary = s.space
	if not rescue and not busy_search and int(a.get("drag", -1)) < 0 \
			and best_free and bd < SpaceData.num(space, "reach", "body") \
			and float(a.get("doing", 0.0)) <= 0.0 \
			and (a.get("_fixGo", {}) as Dictionary).is_empty() \
			and not bool(a.get("_lightGo", false)) and (want_evidence or want_loot):
		s.start_doing(ai, "search", SpaceData.num(space, "stand", "search"), -1, "")
		a["_sv"] = int(best.get("i", -1))
		return
	if rescue:
		return
	if can_report_body(s, a, best):
		var alien := bool(a.get("alien", false))
		var rng: RandomNumberGenerator = s._rng
		a["_sawBody"] = int(best.get("i", -1))
		a["_reportT"] = (2.0 if alien else 1.4) + rng.randf() * (2.0 if alien else 1.6)
		a["_reportBody"] = int(best.get("i", -1))


## 2.5D aiWantsLoot（js/game.js:2144）逐行：目标必须是死者或濒死者；
## 缺弹 / 缺医疗包 / 缺申请单三者其一；异形不搜已认出的队友。
static func ai_wants_loot(s, a: Dictionary, b: Dictionary) -> bool:
	if a.is_empty() or b.is_empty():
		return false
	if bool(a.get("alien", false)) and s.mind != null \
			and s.mind._is_mate(a, int(b.get("i", -1))):
		return false
	if bool(b.get("alive", false)) and not bool(b.get("downed", false)):
		return false
	if int(a.get("bullet", 0)) < 1 and int(b.get("bullet", 0)) > 0:
		return true
	if int(a.get("medkit", 0)) < 1 and int(b.get("medkit", 0)) > 0:
		return true
	if int(a.get("qual", 0)) < 2 and (int(b.get("qual", 0)) > 0 \
			or int(b.get("qualPending", 0)) > 0):
		return true
	return false


## 2.5D canReportBody（js/game.js:2621）：额度 / 夜场名额 / 濒死与尸体分开判。
static func can_report_body(s, a: Dictionary, v: Dictionary) -> bool:
	if int(a.get("reportLeft", 0)) <= 0 or int(s.night_meet_left()) <= 0:
		return false
	var mind = s.mind
	if bool(v.get("alive", false)) and bool(v.get("downed", false)):
		if bool(a.get("alien", false)):
			return not bool(s.recent_witness(a, 20.0))
		if mind != null:
			var bk: Dictionary = mind.best_known_target(a)
			if not bk.is_empty():
				return true
			if float(a.get("alert", 0.0)) >= 0.4:
				return true
			var ts: Array = mind.top_sus(a, 0.45)
			return not ts.is_empty()
		return false
	if bool(a.get("alien", false)):
		var memo: Dictionary = a.get("_reportMemo", {}) as Dictionary
		var vi := int(v.get("i", -1))
		if not memo.has(vi):
			memo[vi] = alien_report_worth(s, a, v) >= float(s.rules.n("MISLEAD", "threshold", 0.3))
			a["_reportMemo"] = memo
		return bool(memo[vi])
	return true


## 2.5D alienReportWorth（js/game.js:2591）：异形报告的误导收益。
static func alien_report_worth(s, a: Dictionary, v: Dictionary) -> float:
	var hot := 0
	var clean := 0
	var mind = s.mind
	var rules = s.rules
	if mind != null:
		for w: Dictionary in (s.agents as Array):
			var wi := int(w.get("i", -1))
			if w == a or not bool(w.get("alive", false)) or bool(w.get("downed", false)) \
					or bool(w.get("alien", false)):
				continue
			var heat: float = float(mind.public_heat(wi))
			if heat >= float(rules.n("MISLEAD", "hotSus", 0.35)):
				hot += 1
			elif heat <= 0.12:
				clean += 1
	var self_sus: float = float(mind.public_heat(int(a.get("i", -1)))) if mind != null else 0.0
	var wit := 0
	var watchers: Array = s.watchers_at(a, v.get("bodyPos", Vector2.ZERO), 7.0,
			int(v.get("i", -1)))
	for w: Dictionary in watchers:
		if mind == null or not mind._is_mate(a, int(w.get("i", -1))):
			wit += 1
	var risk := 1.0
	if wit >= 2:
		risk = float(rules.n("MISLEAD", "riskWatch2", 0.3))
	elif wit == 1:
		risk = float(rules.n("MISLEAD", "riskWatch1", 0.6))
	var seen: float = float(rules.n("MISLEAD", "seenPenalty", 0.45)) if bool(s.recent_witness(a, 25.0)) else 1.0
	var bias: float = float(a.get("_stallBias", 1.0))
	var left := maxi(0, int(a.get("reportLeft", 0)))
	var scarce := 1.0 if left >= 2 else (0.55 if left == 1 else 0.0)
	var meet_scarce := 0.7 if int(s.night_meet_left()) <= 1 else 1.0
	var frame: float = float(rules.n("MISLEAD", "base", 0.4)) \
		+ float(rules.n("MISLEAD", "hotGain", 0.2)) * minf(float(rules.n("MISLEAD", "hotMax", 3)), float(hot)) \
		+ float(rules.n("MISLEAD", "cleanGain", 0.08)) * minf(float(rules.n("MISLEAD", "cleanMax", 4)), float(clean)) \
		- float(rules.n("MISLEAD", "selfRisk", 0.3)) * minf(1.0, self_sus)
	return maxf(0.0, frame) * risk * seen * bias * scarce * meet_scarce


# ---------------- 幽灵（2.5D aiGhost，js/game.js:2371） ----------------

static func ghost_tick(s, a: Dictionary, dt: float) -> void:
	var i := int(a.get("i", -1))
	if float(a.get("doing", 0.0)) > 0.0:
		if out_blocks_doing(s, a):
			return
		a["doing"] = float(a.get("doing", 0.0)) - dt
		if float(a.get("doing", 0.0)) <= 0.0:
			a["doing"] = 0.0
			s._finish_doing(a)
		return
	var rng: RandomNumberGenerator = s._rng
	if bool(a.get("alien", false)):
		if not bool(s.over) and (s.meeting as Dictionary).is_empty() and not bool(s.alien_ghost_sab_used) \
				and not bool(a.get("sabUsed", false)):
			var rooms: Array = []
			for rid: String in (s.rooms_by_id as Dictionary).keys():
				if sab_room_ok(s, rid):
					rooms.append(rid)
			if not rooms.is_empty():
				var rid: String = String(rooms[rng.randi_range(0, rooms.size() - 1)])
				if sabotage_room(s, rid, i, true):
					s.alien_ghost_sab_used = true
					s._stat("ghostSabotages", 1)
		ghost_roam(s, a, dt, 2.4)
		return
	var tasks: Array = a.get("tasks", []) as Array
	if float(a.get("_pathCD", 0.0)) > 0.0:
		a["_pathCD"] = maxf(0.0, float(a.get("_pathCD", 0.0)) - dt)
	if int(a.get("ghostPts", 0)) < int(s.ghost_cap()) and int(a.get("tIdx", 0)) < tasks.size():
		var pi := int(tasks[int(a.get("tIdx", 0))])
		var p: Dictionary = s.point(pi)
		if not p.is_empty():
			var tp := Vector2(float(p.get("x", 0.0)), float(p.get("y", 0.0)))
			var ap: Vector2 = a.get("pos", Vector2.ZERO)
			if ap.distance_to(tp) < 2.8:
				if bool(s.can_do_task(pi, i)):
					s.start_doing(i, "task", float(p.get("dur", 6.0)) * 1.6, pi)
					return
			else:
				if (a.get("path", PackedVector2Array()) as PackedVector2Array).is_empty() \
						and float(a.get("_pathCD", 0.0)) <= 0.0:
					if not bool(s.set_path(i, tp)):
						a["_pathCD"] = 1.2
				ghost_move(a, dt, 6.5)
				return
	ghost_roam(s, a, dt, 2.4)


static func ghost_roam(s, a: Dictionary, dt: float, sp: float) -> void:
	if float(a.get("_pathCD", 0.0)) > 0.0:
		a["_pathCD"] = maxf(0.0, float(a.get("_pathCD", 0.0)) - dt)
		ghost_move(a, dt, sp)
		return
	if (a.get("path", PackedVector2Array()) as PackedVector2Array).is_empty():
		var map: Dictionary = s.map
		var rooms: Array = map.get("rooms", []) as Array
		if rooms.is_empty():
			return
		var rng: RandomNumberGenerator = s._rng
		var rr: Dictionary = rooms[rng.randi_range(0, rooms.size() - 1)] as Dictionary
		var dest: Vector2 = s.rand_in_room(String(rr.get("id", "")))
		if not bool(s.set_path(int(a.get("i", -1)), dest)):
			a["_pathCD"] = 1.2
	ghost_move(a, dt, sp)


## 幽灵位移：freeFly（不查门、不查墙），其余与 stepMove 同构。
static func ghost_move(a: Dictionary, dt: float, sp: float) -> void:
	var path: PackedVector2Array = a.get("path", PackedVector2Array()) as PackedVector2Array
	if path.is_empty():
		return
	var remain := sp * dt
	var pi := int(a.get("pathI", 0))
	var pos: Vector2 = a.get("pos", Vector2.ZERO)
	while remain > 0.0 and pi < path.size():
		var tgt: Vector2 = path[pi]
		var d := pos.distance_to(tgt)
		if d <= remain:
			pos = tgt
			pi += 1
			remain -= d
		else:
			pos += (tgt - pos).normalized() * remain
			remain = 0.0
	a["pos"] = pos
	a["pathI"] = pi
	if pi >= path.size():
		a["path"] = PackedVector2Array()
		a["pathI"] = 0
		a["moving"] = false


## ---- B6′：拖尸 / 藏尸 / 收尸 ----
static func start_drag(s, agent_i: int, body_i: int) -> bool:
	var a: Dictionary = s.agent(agent_i)
	var b: Dictionary = s.agent(body_i)
	if a.is_empty() or b.is_empty():
		return false
	if not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
			or bool(a.get("detained", false)):
		return false
	if bool(b.get("alive", false)) and not bool(b.get("downed", false)):
		return false
	if bool(b.get("bodyGone", false)):
		return false
	var dragged_by: Variant = b.get("draggedBy", null)
	if dragged_by != null and int(dragged_by) >= 0:
		return false
	if int(a.get("drag", -1)) >= 0:
		return false
	for x: Dictionary in (s.agents as Array):
		if int(x.get("drag", -1)) == body_i:
			return false
	a["drag"] = body_i
	b["draggedBy"] = agent_i
	if bool(b.get("downed", false)):
		b["bodyPos"] = b.get("pos", Vector2.ZERO)
	b["_dragFrom"] = b.get("bodyPos", b.get("pos", Vector2.ZERO))
	a["path"] = PackedVector2Array()
	s._log("drag_start", {"actor": agent_i, "victim": body_i, "downed": bool(b.get("downed", false))})
	a["_dragAway"] = false
	a["_dragMedD0"] = 0.0
	return true


## 2.5D syncDragOf（js/game.js:2425）：拖行拉到身后 0.62 格；异常状态立刻强制松手。
static func sync_drag_of(s, a: Dictionary) -> void:
	var di := int(a.get("drag", -1))
	if di < 0:
		return
	var v: Dictionary = s.agent(di)
	if v.is_empty() or not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
			or bool(a.get("detained", false)) or not (s.meeting as Dictionary).is_empty() or bool(s.over):
		release_drag(s, int(a.get("i", -1)))
		return
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var bp: Vector2 = v.get("bodyPos", v.get("pos", Vector2.ZERO))
	var d := ap.distance_to(bp)
	var want := 0.62
	if d > want:
		var tgt := ap + (bp - ap) / d * want
		if s.nav != null:
			tgt = s.nav.nearest_free(tgt)
		if bool(v.get("alive", false)):
			v["pos"] = tgt
			v["bodyPos"] = tgt
		else:
			v["bodyPos"] = tgt
		if not bool(v.get("bodyMoved", false)):
			var origin: Variant = v.get("_dragFrom", null)
			if origin != null and tgt.distance_to(origin as Vector2) > 1.2:
				v["bodyMoved"] = true
	if bool(v.get("alive", false)) and not bool(a.get("_credMed", false)) \
			and String(s.room_at(ap)) == "med":
		a["_credMed"] = true
		if s.mind != null and bool(s.speech_enabled):
			s.mind.cred_broadcast(int(a.get("i", -1)), "dragToMed", ap)
	if not bool(v.get("alive", false)) and not bool(a.get("_dragAway", false)):
		var med_c: Vector2 = s.room_center("med")
		if med_c != Vector2.ZERO:
			var dm := ap.distance_to(med_c)
			var d0 := float(a.get("_dragMedD0", 0.0))
			if d0 <= 0.0:
				a["_dragMedD0"] = dm
			elif dm > d0 + 2.2:
				a["_dragAway"] = true
				drag_away_notice(s, a, v)


static func drag_away_notice(s, a: Dictionary, v: Dictionary) -> void:
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	s._log("drag_away", {"actor": int(a.get("i", -1)), "victim": int(v.get("i", -1)),
		"room": s.room_at(ap)})
	s._witness_action(a, "saw_drag_away", ap)


static func release_drag(s, agent_i: int) -> bool:
	var a: Dictionary = s.agent(agent_i)
	if a.is_empty() or int(a.get("drag", -1)) < 0:
		return false
	var body_i := int(a.get("drag", -1))
	var b: Dictionary = s.agent(body_i)
	a["drag"] = -1
	if not b.is_empty():
		b["draggedBy"] = null
		var from: Variant = b.get("_dragFrom", null)
		if from != null:
			var moved: float = (b.get("bodyPos", Vector2.ZERO) as Vector2).distance_to(from as Vector2)
			if moved > 1.2:
				b["bodyMoved"] = true
		var rid: String = s.room_at(b.get("bodyPos", Vector2.ZERO))
		if rid == "med" and bool(b.get("downed", false)):
			s.revive(body_i)
			if bool(s.speech_enabled) and s.mind != null:
				s.mind.cred_broadcast(agent_i, "dragToMed",
					a.get("pos", Vector2.ZERO))
		elif rid != "" and rid != "bridge":
			b["bodyGone"] = true
			b["bodyReported"] = true
			b["hidden"] = true
			s._log("drag_away", {"actor": agent_i, "victim": body_i, "room": rid})
	s._log("drag_end", {"actor": agent_i, "victim": body_i, "downed": bool(b.get("downed", false))})
	return true


## ---- B6′：供电（breaker）----
## 三态灯（2.5D refreshLight，js/game.js:678-690）：
##   0 常态（只亮 light==bright 的舱）· 1 电路修好（全舱全亮）· 2 拉闸（只剩会议室）。
static func toggle_power(s, by: int) -> bool:
	var was_off: bool = int(s.light_state) == 2
	s.light_state = (1 if bool(s.power_fixed) else 0) if was_off else 2
	s.power_on = int(s.light_state) != 2
	if not was_off and int(s.light_state) == 2:
		s.breaker_pulls += 1
	s._log("breaker", {"actor": by, "on": int(s.light_state) != 2, "state": int(s.light_state),
		"pulls": int(s.breaker_pulls)})
	var br: Vector2 = breaker_pos(s)
	s.hear("power", br, 30.0, {"actor": by})
	s.env_notice("lights", br, 0.85 if int(s.light_state) == 2 else 0.45)
	var mind = s.mind
	if mind != null and br != Vector2.ZERO:
		if int(s.light_state) == 2:
			for w: Dictionary in (s.agents as Array):
				var wi := int(w.get("i", -1))
				if wi == by or not bool(w.get("alive", false)) or bool(w.get("downed", false)):
					continue
				if (w.get("pos", Vector2.ZERO) as Vector2).distance_to(br) <= 6.0 \
						and bool(s.ai_can_see(w, br)):
					mind.note_sight(wi, by, "saw_breaker", br)
		else:
			mind.cred_broadcast(by, "breakerOn", br)
			for w: Dictionary in (s.agents as Array):
				var wi := int(w.get("i", -1))
				if wi == by or not bool(w.get("alien", false)) \
						or not bool(w.get("alive", false)) or bool(w.get("downed", false)) \
						or bool(w.get("detained", false)):
					continue
				if (w.get("pos", Vector2.ZERO) as Vector2).distance_to(br) > 6.0:
					continue
				if not bool(s.ai_can_see(w, br)):
					continue
				if mind._is_mate(w, by):
					continue
				mind.humanish_add(w, by, s.rules.n("HUMANISH", "onSight", 0.28))
	return true


static func breaker_pull_time(s) -> float:
	if int(s.light_state) == 2:
		return breaker_on_time(s)
	return minf(9.0, 3.0 * float(maxi(0, int(s.breaker_pulls)) + 1))


static func breaker_pos(s) -> Vector2:
	if s._breaker_pos == Vector2.ZERO:
		var map: Dictionary = s.map
		for f: Dictionary in (map.get("facility", []) as Array):
			if String(f.get("kind", "")) == "breaker":
				s._breaker_pos = Vector2(float(f.get("x", 0.0)), float(f.get("y", 0.0)))
				break
	return s._breaker_pos


static func breaker_on_time(s) -> float:
	var B: Dictionary = (s.space as Dictionary).get("breaker", {}) as Dictionary
	return float(B.get("on_fixed", 3.0)) if bool(s.power_fixed) else float(B.get("on_default", 4.5))


## @src js/game.js:1611 sabTick()
static func sab_tick(s) -> void:
	var me: Dictionary = s.agent(int(s.me_idx))
	if me.is_empty():
		return
	var dev := bool(s.dev)
	if float(s.t) <= 0.0 or (not bool(me.get("alien", false)) and not dev) \
			or not bool(me.get("alive", false)) or bool(me.get("downed", false)) \
			or bool(me.get("detained", false)) \
			or (bool(me.get("sabUsed", false)) and not dev):
		return
	var sab_target: Dictionary = s.sab_target
	if sab_target.is_empty():
		return
	var rid := String(sab_target.get("room", ""))
	if not sab_room_ok(s, rid):
		s.sab_target = {}
		return
	var pos: Vector2 = me.get("pos", Vector2.ZERO) as Vector2
	var tp := Vector2(float(sab_target.get("x", 0.0)), float(sab_target.get("y", 0.0)))
	var reach := SpaceData.num(s.space as Dictionary, "reach", "sabotage")
	if String(s.room_at(pos)) == rid or pos.distance_to(tp) < reach:
		if sabotage_room(s, rid, int(s.me_idx)):
			s.sab_target = {}
