extends RefCounted

## 玩家战斗与事件声画同步控制器（从 main.gd 拆出）。
## 负责玩家出刀、开枪、打机器人、武器视角同步及事件流音效/特效播放。

const SpaceData := preload("res://scripts/space_data.gd")
const FxView := preload("res://scripts/fx_view.gd")


static func handle_attack(m, btn: int) -> void:
	if m.sim == null or m.sim.over or not m.sim.meeting.is_empty():
		return
	if m.mg_layer != null and m.mg_layer.is_open():
		return
	var me: Dictionary = m.sim.me()
	if me.is_empty() or not bool(me.get("alive", true)):
		return
	if bool(me.get("downed", false)) or bool(me.get("detained", false)):
		return
	if btn == MOUSE_BUTTON_LEFT:
		m._probe("左键 · 出刀请求")
		player_knife(m, me)
	elif btn == MOUSE_BUTTON_RIGHT:
		m._probe("右键 · 开枪请求")
		player_fire(m, me)


static func player_knife(m, me: Dictionary, forced: Dictionary = {}, forced_bot: String = "") -> void:
	if not bool(me.get("alien", false)):
		m._probe("出刀 × 人类没有刀")
		m._toast("人类没有刀 —— 右键开枪，子弹在军械库换")
		return
	if m._knife_cd > 0.0:
		m._probe("出刀 × 冷却 %.1fs" % m._knife_cd)
		m._toast("出刀冷却中（%.1fs）" % m._knife_cd)
		return
	if m.player != null:
		m.player.play_knife_swing()
	var tgt: Dictionary = forced
	var bot_kind := forced_bot
	if tgt.is_empty() and bot_kind == "":
		var pick := nearest_knife_any(m)
		tgt = pick.get("agent", {})
		bot_kind = String(pick.get("bot", ""))
	if bot_kind != "":
		_knife_bot_target(m, bot_kind)
		return
	var chk: Dictionary = m.sim.can_act("knife", {"actor": int(m.sim.me_idx),
		"victim": int(tgt.get("i", -1))})
	var reason := String(chk.get("reason", ""))
	if not bool(chk.get("ok", false)):
		m._probe("出刀 × can_act 拒绝 " + reason)
		m._toast("刀锋够不到 —— 再靠近" if reason == "no_target" \
			else String(m._act_reason(reason)))
		m._knife_hit_fx(false)
		return
	if not m.sim.knife(int(m.sim.me_idx), int(tgt.get("i", -1))):
		m._probe("出刀 × 结算拒绝（目标已倒下 / 刀数不足）")
		m._toast("出刀没有生效（目标已倒下 / 刀数不足）")
		m._knife_hit_fx(false)
		return
	m._knife_cd = 1.2
	m._probe("出刀 → %s · 濒死 · 剩余刀 %d" % [String(tgt.get("name", "")),
		int(me.get("knife", 0))])
	m._toast("出刀 · " + String(tgt.get("name", "")) + " 濒死")
	m._knife_hit_fx(true)


static func _knife_bot_target(m, bot_kind: String) -> void:
	var bchk: Dictionary = m.sim.can_act("knife_bot", {"actor": int(m.sim.me_idx),
		"bot": bot_kind})
	var breason := String(bchk.get("reason", ""))
	if not bool(bchk.get("ok", false)):
		m._probe("出刀 × can_act(knife_bot) 拒绝 " + breason)
		m._toast("刀锋够不到 —— 再靠近" if breason == "no_target" \
			else String(m._act_reason(breason)))
		m._knife_hit_fx(false)
		return
	if not m.sim.knife_bot(bot_kind, int(m.sim.me_idx)):
		m._probe("出刀 × 机器人结算拒绝")
		m._toast("这一刀没有砍到机器人")
		m._knife_hit_fx(false)
		return
	m._knife_cd = 1.2
	var bname := "保安机器人" if bot_kind == "secbot" else "医疗无人机"
	var bp_hit: Vector2 = m.sim.bot_pos_of(bot_kind)
	m._probe("出刀 → " + bname + " · 装甲受击")
	m._toast("出刀 · " + bname + " 装甲受击 · 刀数 -1")
	m._knife_hit_fx(true, Vector3(bp_hit.x, 0.95, bp_hit.y), true,
		m.player.global_position if m.player != null else Vector3.ZERO)


static func player_fire(m, me: Dictionary) -> void:
	if m._shot_cd > 0.0:
		m._probe("开枪 × 冷却 %.1fs" % m._shot_cd)
		m._toast("开枪冷却中（%.1fs）" % m._shot_cd)
		return
	var max_r := SpaceData.num(m.space, "shoot", "range")
	# 优先锁定准星前向锥内（点积 > 0.88）且视线畅通的目标（含保安/医疗机器人）
	var aim_pick := _aim_pick(m, max_r, max_r, 0.88, false)
	var bot_kind := String(aim_pick.get("bot", ""))
	if bot_kind != "":
		if int(me.get("bullet", 0)) <= 0:
			m._probe("开枪 × can_act 拒绝 no_bullet")
			m._toast(String(m._act_reason("no_bullet")))
			return
		on_hit_bot(m, bot_kind)
		return
	var tgt: Dictionary = aim_pick.get("agent", {})
	if tgt.is_empty():
		tgt = nearest_shot_target(m, max_r)
	var chk: Dictionary = m.sim.can_act("shoot", {"actor": int(m.sim.me_idx),
		"victim": int(tgt.get("i", -1))})
	var reason := String(chk.get("reason", ""))
	if not bool(chk.get("ok", false)):
		m._probe("开枪 × can_act 拒绝 " + reason)
		m._toast("射程内没有对准的目标" if reason == "no_target" \
			else String(m._act_reason(reason)))
		return
	if not m.sim.shoot(int(m.sim.me_idx), int(tgt.get("i", -1))):
		m._probe("开枪 × 结算拒绝（视线被挡 / 目标已倒下）")
		m._toast("这一枪没打中（视线被挡住或目标已倒下）")
		return
	m._shot_cd = 0.8
	var vp2: Vector2 = tgt.get("pos", Vector2.ZERO)
	var muzzle2: Vector3 = m.player.camera.global_position if m.player != null and m.player.camera != null else Vector3.ZERO
	FxView.shot_fx(m, true, muzzle2, Vector3(vp2.x, 1.05, vp2.y), false)
	m._probe("开枪 → %s · 濒死 · 剩余弹 %d" % [String(tgt.get("name", "")),
		int(me.get("bullet", 0))])
	m._toast("开枪击中 " + String(tgt.get("name", "")))


static func on_hit_bot(m, kind: String) -> void:
	if m.sim != null and m.sim.hit_bot(int(m.sim.me_idx), kind):
		var bp: Vector2 = m.sim.bot_pos_of(kind)
		var muzzle: Vector3 = m.player.camera.global_position if m.player != null and m.player.camera != null else Vector3.ZERO
		var s2 := Vector2(muzzle.x, muzzle.z) if muzzle != Vector3.ZERO else Vector2(m.sim.me().get("pos", Vector2.ZERO))
		if m.audio != null:
			m.audio.play_at("shoot", s2, 0.95)
			m.audio.play_delayed("shell_casing", 0.18, 0.62, s2)
		FxView.shot_fx(m, true, muzzle, Vector3(bp.x, 0.95, bp.y), true)
		m._shot_cd = 0.8
		m._probe("开枪 → %s · 剩余 HP %d" % [kind, int(m.sim.bot_hp.get(kind, 0))])
		m._toast("命中 %s · 剩余 HP %d" % [kind, int(m.sim.bot_hp.get(kind, 0))])
	else:
		m._toast("打不中（没有子弹 / 视线被挡 / 已拆掉）")


## 出刀目标选择：优先准星前向锥内（点积 > 0.65）在刀程且视线畅通的人/机器人；
## 仅当正前方无目标时，在极贴身（< 0.85m）范围内兜底最近目标，避免追前砍后。
static func nearest_knife_any(m) -> Dictionary:
	if m.sim == null or m.sim.agents.is_empty():
		return {}
	var knife_r := SpaceData.num(m.space, "reach", "knife")
	var aim_pick := _aim_pick(m, knife_r, 1.799, 0.65, true)
	if not (aim_pick.get("agent", {}) as Dictionary).is_empty() \
			or String(aim_pick.get("bot", "")) != "":
		return aim_pick
	var me: Dictionary = m.sim.me()
	var p: Vector2 = me.get("pos", Vector2.ZERO)
	var has_cam: bool = m.player != null and m.player.camera != null
	var bd: float = 0.85 if has_cam else knife_r
	var best: Dictionary = {}
	var bot_kind := ""
	for a: Dictionary in m.sim.agents:
		if int(a.get("i", -1)) == int(m.sim.me_idx):
			continue
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
				or bool(a.get("detained", false)):
			continue
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		var d := p.distance_to(ap)
		if d < bd and m.sim.los_now(p.x, p.y, ap.x, ap.y):
			bd = d
			best = a
			bot_kind = ""
	if m.sim.bots != null:
		for kind: String in ["secbot", "medbot"]:
			if m.sim.bots.is_dead(kind):
				continue
			var bp: Vector2 = m.sim.bots.pos_of(kind)
			var d2 := p.distance_to(bp)
			if d2 < bd and m.sim.los_now(p.x, p.y, bp.x, bp.y):
				bd = d2
				best = {}
				bot_kind = kind
	return {"agent": best, "bot": bot_kind}


## 开枪兜底目标选择（2.5D shoot()）：射程内最近、无遮挡、且看得见的活人。
static func nearest_shot_target(m, max_d: float) -> Dictionary:
	if m.sim == null or m.sim.agents.is_empty():
		return {}
	var me: Dictionary = m.sim.me()
	var p: Vector2 = me.get("pos", Vector2.ZERO)
	var best: Dictionary = {}
	var best_d := max_d
	for a: Dictionary in m.sim.agents:
		if int(a.get("i", -1)) == int(m.sim.me_idx):
			continue
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		var d := p.distance_to(ap)
		if d >= best_d:
			continue
		if not m.sim.los_now(p.x, p.y, ap.x, ap.y):
			continue
		if not m.sim.ai_can_see(me, ap):
			continue
		best_d = d
		best = a
	return best


static func aim_target(m, max_d: float, min_dot: float) -> Dictionary:
	return _aim_pick(m, max_d, 0.0, min_dot, true).get("agent", {})


## 统一准星前向锥选靶：按 2D 射程 + los_now 过滤，按相机前向 3D 点积择优（可选含机器人）。
static func _aim_pick(m, agent_max_d: float, bot_max_d: float,
		min_dot: float, skip_detained: bool) -> Dictionary:
	if m.sim == null or m.player == null or m.player.camera == null:
		return {"agent": {}, "bot": ""}
	var cam: Camera3D = m.player.camera
	var fwd := -cam.global_transform.basis.z
	var me: Dictionary = m.sim.me()
	var p: Vector2 = me.get("pos", Vector2.ZERO)
	var eye := cam.global_position
	# 单元测试有时只改 sim 的 me["pos"] 不搬动 player 节点，此时以逻辑坐标对齐视角原点
	if Vector2(eye.x, eye.z).distance_to(p) > 0.6:
		eye = Vector3(p.x, eye.y, p.y)
	var best: Dictionary = {}
	var best_bot := ""
	var best_dot := min_dot
	for a: Dictionary in m.sim.agents:
		if int(a.get("i", -1)) == int(m.sim.me_idx):
			continue
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)):
			continue
		if skip_detained and bool(a.get("detained", false)):
			continue
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		if p.distance_to(ap) > agent_max_d:
			continue
		if not m.sim.los_now(p.x, p.y, ap.x, ap.y):
			continue
		var to := Vector3(ap.x, 1.0, ap.y) - eye
		var dot := fwd.dot(to.normalized()) if to.length_squared() > 0.0001 else 1.0
		if dot > best_dot:
			best_dot = dot
			best = a
			best_bot = ""
	if bot_max_d > 0.0 and m.sim.bots != null:
		for kind: String in ["secbot", "medbot"]:
			if m.sim.bots.is_dead(kind) or int(m.sim.bot_hp.get(kind, 0)) <= 0:
				continue
			var bp: Vector2 = m.sim.bots.pos_of(kind)
			if p.distance_to(bp) > bot_max_d:
				continue
			if not m.sim.los_now(p.x, p.y, bp.x, bp.y):
				continue
			var to_b := Vector3(bp.x, 0.95, bp.y) - eye
			var dot_b := fwd.dot(to_b.normalized()) if to_b.length_squared() > 0.0001 else 1.0
			if dot_b > best_dot:
				best_dot = dot_b
				best = {}
				best_bot = kind
	return {"agent": best, "bot": best_bot}


static func tick_knife_view(m) -> void:
	if m.player == null or m.sim == null:
		return
	var me: Dictionary = m.sim.me()
	if me.is_empty() or bool(m.sim.spectator) or not m.started:
		if m.player.has_method("set_weapon_state"):
			m.player.set_weapon_state(false, 0, 0, false, false, false, 0.0, true)
		else:
			m.player.set_knife_visible(false)
		return
	var alien := bool(me.get("alien", false))
	var knife_cnt := int(me.get("knife", 0))
	var bullet_cnt := int(me.get("bullet", 0))
	var alive := bool(me.get("alive", true))
	var is_downed := bool(me.get("downed", false))
	var detained := bool(me.get("detained", false))
	var rush_t := float(me.get("rushT", 0.0))
	var meeting_open: bool = not m.sim.meeting.is_empty()
	if m.player.has_method("set_weapon_state"):
		m.player.set_weapon_state(alien, knife_cnt, bullet_cnt, alive,
			is_downed, detained, rush_t, meeting_open)
	else:
		m.player.set_knife_visible(alive and not is_downed and not detained \
			and alien and knife_cnt > 0 and not meeting_open)


## 事件流驱动音效：只播新增的那几条，不重复播整局历史。
static func play_new_events(m) -> void:
	if m.audio == null:
		return
	var evs: Array = m.sim.events
	if evs.size() < m._last_event_n:
		m._last_event_n = 0
	for i in range(m._last_event_n, evs.size()):
		var e: Dictionary = evs[i]
		FxView.on_combat_event(m, e)
		_play_event_audio(m, e, event_pos(m, e))
	m._last_event_n = evs.size()


static func _play_event_audio(m, e: Dictionary, pos: Vector2) -> void:
	var kind := String(e.get("kind", ""))
	match kind:
		"knife":
			m.audio.play_at("knife", pos, 0.95)
			m.audio.play_at("flesh", pos, 0.42)
			m.audio.play_at("sub_punch", pos, 0.85)
			m.audio.play_at("hit_confirm", pos, 0.65)
			m.audio.play_at("scream", pos, 0.85)
		"shoot":
			m.audio.play_at("shoot", pos, 0.95)
			m.audio.play_at("sub_punch", pos, 0.85)
			m.audio.play_at("flesh", pos, 0.52)
			m.audio.play_at("hit_confirm", pos, 0.65)
			m.audio.play_at("scream", pos, 0.85)
			m.audio.play_delayed("shell_casing", 0.18, 0.62, pos)
		"kill": m.audio.play_at("kill", pos, 0.80)
		"revive": m.audio.play_at("revive", pos, 0.90)
		"fix", "task", "qual", "supply": m.audio.play_at("fix", pos, 0.85)
		"sabotage": m.audio.play_at("sabotage", pos, 0.90)
		"report", "meeting": m.audio.play("report", 0.75)
		"vote": m.audio.play("vote", 0.55)
		"vote_change": m.audio.play("vote_change", 0.55)
		"eject": m.audio.play("eject", 0.90)
		"drag_start", "drag_end": m.audio.play_at(kind, pos, 0.75)
		"search": m.audio.play_at("search", pos, 0.60)
		"bot_hit":
			m.audio.play_at("bot_hit", pos, 0.85)
			m.audio.play_at("mech_spark", pos, 0.78)
			m.audio.play_at("hit_confirm", pos, 0.60)
		"bot_down":
			m.audio.play_at("bot_down", pos, 0.90)
			m.audio.play_at("mech_spark", pos, 0.90)
			m.audio.play("detain", 0.55)
		"breaker":
			m.audio.play_at("breaker", pos, 0.82)
			m.audio.play_at("mech_spark", pos, 0.75)
		"pipe": m.audio.play_at("pipe", pos, 0.50)
		"detain": m.audio.play("detain", 0.75)
		"chat": m.audio.play("chat", 0.60)
		"game_end": m.audio.play("win" if bool(e.get("win", false)) else "lose", 0.90)
		_: m.audio.play(kind)


static func event_pos(m, e: Dictionary) -> Vector2:
	if m.sim == null:
		return Vector2(m.player.global_position.x, m.player.global_position.z)
	var xv: Variant = e.get("x", null)
	var yv: Variant = e.get("y", null)
	if (xv is float or xv is int) and (yv is float or yv is int):
		return Vector2(float(xv), float(yv))
	var vi: Variant = e.get("victim", null)
	if vi is int and int(vi) >= 0:
		var v: Dictionary = m.sim.agent(int(vi))
		if not v.is_empty():
			var p: Variant = v.get("bodyPos", null)
			if p is Vector2 and (p as Vector2) != Vector2.ZERO:
				return p as Vector2
			p = v.get("pos", null)
			if p is Vector2:
				return p as Vector2
	var ai: Variant = e.get("actor", null)
	if ai is int and int(ai) >= 0:
		var a: Dictionary = m.sim.agent(int(ai))
		if not a.is_empty():
			var p2: Variant = a.get("pos", null)
			if p2 is Vector2:
				return p2 as Vector2
	return Vector2(m.player.global_position.x, m.player.global_position.z)
