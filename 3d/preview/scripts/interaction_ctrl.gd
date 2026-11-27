extends RefCounted

## 玩家交互与站桩控制器（从 main.gd 拆出）。
## 负责收集交互候选项、分发专用键/轮盘/E键、能力兜底及站桩计时。

const SpaceData := preload("res://scripts/space_data.gd")
const SimStateScript := preload("res://scripts/sim/sim_state.gd")
const Keymap := preload("res://scripts/keymap.gd")
const CombatCtrl := preload("res://scripts/combat_ctrl.gd")

const OFFER_KEY_KEYS := ["F", "R", "G", "Q", "V", "H"]
const TASK_NEAR_R := 2.6
const PIPE_NEAR_R := 1.6
const SUPPLY_NEAR_R := 1.7
const MONITOR_NEAR_R := 1.8

const OFFER_RANK := {
	"revive": 0, "task": 1, "report": 2, "search": 3, "fix": 4, "drag": 5,
	"inspect": 6, "attack": 7, "supply": 8, "req": 9, "pipe": 10, "breaker": 11,
	"cams": 12, "sabotage": 13, "bot": 14,
}

# 静态掩体与设施查询缓存，避免每帧线性扫描全船数据
static var _cached_round_table: Dictionary = {}
static var _cached_cover_arr: Array = []
static var _cached_fac_arr: Array = []
static var _cached_fac_by_kind: Dictionary = {}


static func offer_key(id: String) -> String:
	if id.begins_with("revive"): return "F"
	if id.begins_with("report"): return "R"
	if id.begins_with("drag"): return "G"
	if id.begins_with("pipe-"): return "Q"
	if id.begins_with("sabotage"): return "H"
	if id.begins_with("cams"): return "V"
	if id.begins_with("attack"): return "左键"
	return "E"


static func offer_by_key(offers: Array, key: String) -> Dictionary:
	for o: Dictionary in offers:
		if offer_key(String(o.get("id", ""))) == key:
			return o
	return {}


static func _offer_rank(id: String) -> int:
	for k: String in OFFER_RANK:
		if id.begins_with(k):
			return int(OFFER_RANK[k])
	return 15


static func ranked_offers(offers: Array) -> Array:
	var out := offers.duplicate()
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return _offer_rank(String(a.get("id", ""))) < _offer_rank(String(b.get("id", ""))))
	return out


static func update_interaction(m, _delta: float) -> void:
	var edges: Dictionary = {}
	for kk: String in OFFER_KEY_KEYS:
		edges[kk] = Keymap.edge(kk, m._keys_down)
	var digits: Array = []
	for ni in 9:
		digits.append(Keymap.num_edge(ni, m._keys_down))
	var e_now: bool = Input.is_action_pressed("interact") if InputMap.has_action("interact") \
		else Input.is_physical_key_pressed(Keymap.keycode("E"))
	var pressed: bool = e_now and not bool(m._e_down)
	m._e_down = e_now

	if pressed and m.wheel != null and m.wheel.is_open() \
			and (m.sim == null or (not m.sim.over and m.sim.meeting.is_empty())):
		# 轮盘已打开时再按 E 直接取消关闭，不再弹阻塞提示
		m._probe_input("E", "轮盘 → 取消")
		m.wheel.cancel()
		return

	var blocked := _blocked_reason(m)
	if not blocked.is_empty():
		m.prompt_label.text = ""
		for kk3: String in OFFER_KEY_KEYS:
			if bool(edges[kk3]):
				m._probe_input(kk3, blocked)
				m._toast(blocked)
		if pressed:
			m._probe_input("E", blocked)
		return
	pressed = pressed and m.station.is_empty()

	var offers := ranked_offers(collect_offers(m))
	_update_prompt(m, offers, pressed)
	_dispatch_picked_offer(m, offers, edges, digits, pressed)


static func _blocked_reason(m) -> String:
	if m.sim != null and m.sim.over:
		return "对局已结束"
	if m.sim != null and not m.sim.meeting.is_empty():
		return "会议进行中 · 操作暂不可用"
	if m._pipe_open or m._info_open or (m.mg_layer != null and m.mg_layer.is_open()) \
			or (m.wheel != null and m.wheel.is_open()) \
			or (m.ui_panels != null and m.ui_panels.any_open()):
		return "先关闭当前面板（Esc）"
	return ""


static func _update_prompt(m, offers: Array, pressed: bool) -> void:
	if offers.is_empty():
		m.prompt_label.text = "" if m.station.is_empty() else "站桩中 · %s（移动即中断）" % String(m.station.get("label", ""))
		if pressed and m.station.is_empty():
			m._probe("E · 交互项 0")
			m._toast(no_offer_hint(m))
		return
	# 提示栏、数字键 1-9 与轮盘统一使用 update_interaction 传入的 ranked_offers 序列
	m._near = offers[0].get("dev", null)
	if not m.station.is_empty():
		return
	var parts: Array = []
	var shown := mini(offers.size(), 4)
	for i in shown:
		var key_lbl := offer_key(String(offers[i].get("id", "")))
		var lbl := String(offers[i].get("label", ""))
		parts.append("%d.[%s] %s" % [i + 1, key_lbl, lbl] if offers.size() > 1 else "[%s] %s" % [key_lbl, lbl])
	var line := " · ".join(PackedStringArray(parts))
	if offers.size() > shown:
		line += " · 共 %d 项（E 展开）" % offers.size()
	m.prompt_label.text = line


static func _dispatch_picked_offer(m, offers: Array, edges: Dictionary,
		digits: Array, pressed: bool) -> void:
	var picked: Dictionary = {}
	var used_key := ""
	for kk2: String in OFFER_KEY_KEYS:
		if not bool(edges[kk2]):
			continue
		used_key = kk2
		picked = offer_by_key(offers, kk2)
		break
	if used_key != "":
		m._probe_input(used_key, "交互项 %d · 命中=%s" % [offers.size(), str(not picked.is_empty())])
		if picked.is_empty():
			fallback_action(m, used_key, offers)
			return
	if picked.is_empty():
		for ni2 in 9:
			if bool(digits[ni2]) and ni2 < offers.size():
				picked = offers[ni2]
				break
	if picked.is_empty() and pressed and not offers.is_empty():
		if offers.size() == 1:
			picked = offers[0]
		else:
			m._probe("E → 轮盘 %d 项" % offers.size())
			m.player.ui_locked = true
			m.wheel.open(offers,
				func(it: Dictionary) -> void:
					m.player.ui_locked = false
					m._probe("轮盘 → " + String(it.get("label", "")))
					(it["act"] as Callable).call(),
				func() -> void:
					m.player.ui_locked = false
					m._probe("轮盘 → 取消"))
			return
	if not picked.is_empty():
		m._probe("交互 → [%s] %s" % [offer_key(String(picked.get("id", ""))),
			String(picked.get("label", ""))])
		(picked["act"] as Callable).call()


static func fallback_action(m, k: String, offers: Array) -> void:
	if m.sim == null or m.sim.agents.is_empty() or m.player == null:
		return
	m._fallback_count += 1
	m._probe_input(k, "能力兜底入口")
	var p: Vector3 = m.player.global_position
	var pos := Vector2(p.x, p.z)
	var ctx := {"actor": int(m.sim.me_idx), "pos": pos}
	match k:
		"G":
			var d: Dictionary = m.sim.can_act("drag", ctx)
			if not bool(d.get("ok", false)):
				m._toast(act_reason(String(d.get("reason", ""))))
				return
			if String(d.get("action", "")) == "drop":
				on_drag_drop(m)
			else:
				on_drag_start(m, int(d.get("target", -1)))
		"R":
			var r: Dictionary = m.sim.can_act("report", ctx)
			if not bool(r.get("ok", false)):
				m._toast(act_reason(String(r.get("reason", ""))))
				return
			m.sim.open_meeting(int(m.sim.me_idx), int(r.get("target", -1)))
		"Q":
			var q: Dictionary = m.sim.can_act("pipe", ctx)
			if not bool(q.get("ok", false)):
				m._toast(act_reason(String(q.get("reason", ""))))
				return
			if String(q.get("action", "")) == "release_drag":
				m.sim.release_drag(int(m.sim.me_idx))
			var port := nearest_pipe_port(m, pos)
			if port.is_empty():
				m._toast("附近没有管道口")
				return
			var pp: Vector3 = port["pos"] as Vector3
			var pd := Vector2(pp.x - pos.x, pp.z - pos.y).length()
			if pd > PIPE_NEAR_R:
				m._toast("离管道口还有 %.1f m（交互半径 %.1f m）" % [pd, PIPE_NEAR_R])
				return
			m._use_pipe(port)
		"H":
			var b: Dictionary = m.sim.can_act("sabotage", ctx)
			if not bool(b.get("ok", false)):
				m._toast(act_reason(String(b.get("reason", ""))))
				return
			on_sabotage(m, String(b.get("action", "")))
		"F":
			for fo: Dictionary in offers:
				if String(fo.get("id", "")).begins_with("revive-"):
					m._probe("F → 施救恒入口")
					(fo["act"] as Callable).call()
					return
			m._toast("附近没有可施救的人（带医疗包，走近濒死者再按 F）")
		"B":
			m._probe("B · 开枪请求")
			CombatCtrl.handle_attack(m, MOUSE_BUTTON_RIGHT)
		"V":
			if m.sim != null and bool(m.sim.me().get("ghost", false)):
				m._toast("幽灵状态只能做自己的剩余任务")
				return
			var mon := nearest_facility(m, pos, "monitor")
			if mon.is_empty():
				m._toast("附近没有监控台")
				return
			var mp := Vector2(float(mon.get("x", 0)), float(mon.get("y", 0)))
			if mp.distance_to(pos) > MONITOR_NEAR_R:
				m._toast("离监控台还有 %.1f m" % mp.distance_to(pos))
				return
			m._open_cams()
		_:
			m._toast("附近没有 [%s] 对应的操作" % k)


static func act_reason(reason: String) -> String:
	match reason:
		"meeting": return "会议进行中 · 操作暂不可用"
		"dead": return "你已经出局 · 幽灵只能做自己的剩余任务"
		"downed": return "你正濒死，无法操作（等人救 / 等天亮）"
		"detained": return "你正被保安押送拘留，无法操作"
		"ghost": return "幽灵状态只能做自己的剩余任务"
		"not_alien": return "这是内鬼专属能力（人类没有刀 / 不能钻管道 / 不能破坏）"
		"no_knife": return "本夜的刀已用完（每夜 1 把，天亮补）"
		"no_bullet": return "没有子弹 —— 圆桌领申请单，再去军械库换"
		"no_target": return "附近没有可作用的目标"
		"target_down": return "目标已经倒下 / 出局"
		"out_of_reach": return "距离太远，再靠近一点"
		"no_los": return "中间有墙 / 掩体挡着"
		"no_body": return "附近没有可拖 / 可报告的尸体或伤员（走近一点）"
		"not_dragging": return "你手上没有拖着尸体"
		"no_report_quota": return "报告次数已用完 / 本夜夜会已达上限"
		"sab_used": return "本夜已经破坏过一次了"
		"sab_room": return "这里不能破坏（中央会议室 / 已有故障）"
		"unknown_action": return "这个操作当前不可用"
		_: return "操作没有生效（%s）" % reason


static func nearest_pipe_port(m, pos: Vector2) -> Dictionary:
	if m.extras == null:
		return {}
	var best: Dictionary = {}
	var best_d := INF
	for pp in m.extras.pipe_ports:
		var v: Vector3 = pp["pos"] as Vector3
		var d := Vector2(v.x - pos.x, v.z - pos.y).length()
		if d < best_d:
			best_d = d
			best = pp
	return best


## 按类型缓存 facility 列表，避免每帧重复线性扫描全船设施。
static func _facility_list(m, kind: String) -> Array:
	var raw: Array = m.map_data.get("facility", [])
	if raw.is_empty():
		return []
	if not is_same(raw, _cached_fac_arr):
		_cached_fac_arr = raw
		_cached_fac_by_kind = {}
		for f: Dictionary in raw:
			var k := String(f.get("kind", ""))
			if not _cached_fac_by_kind.has(k):
				_cached_fac_by_kind[k] = []
			(_cached_fac_by_kind[k] as Array).append(f)
	return _cached_fac_by_kind.get(kind, []) as Array


static func nearest_facility(m, pos: Vector2, kind: String) -> Dictionary:
	var best: Dictionary = {}
	var best_d := INF
	for f: Dictionary in _facility_list(m, kind):
		var fp := Vector2(float(f.get("x", 0)), float(f.get("y", 0)))
		var d := fp.distance_to(pos)
		if d < best_d:
			best_d = d
			best = f
	return best


static func body_visible_to_player(m, b: Dictionary) -> bool:
	if m.sim == null or m.player == null or b.is_empty():
		return false
	var bp: Vector2 = b.get("pos", Vector2.ZERO) if bool(b.get("alive", false)) \
		else b.get("bodyPos", Vector2.ZERO)
	var p: Vector3 = m.player.global_position
	return m.sim.los_now(p.x, p.z, bp.x, bp.y)


static func no_offer_hint(m) -> String:
	if m.sim == null or m.sim.agents.is_empty():
		return "附近没有可交互的东西 —— 走近设备 / 尸体 / 电闸 / 圆桌再按 E"
	var me: Dictionary = m.sim.me()
	if not bool(me.get("alien", false)):
		return "人类没有刀 —— 右键或 B 开枪（子弹在军械库领）；F 施救 / R 报告 / G 拖拽 / E 任务与其他交互"
	var reach := SpaceData.num(m.space, "reach", "knife")
	var me_pos: Vector2 = me.get("pos", Vector2.ZERO)
	var in_reach := _nearest_living_agent(m, reach)
	if not in_reach.is_empty():
		if int(me.get("knife", 0)) < 1:
			return "本夜的刀已用完（每夜 1 把，天亮补）"
		return "中间有墙 / 掩体挡着，刀够不到"
	var p := _nearest_living_agent(m, reach + 1.6)
	if p.is_empty():
		return "附近没有可交互的东西 —— 走近设备 / 尸体 / 电闸 / 圆桌再按 E"
	var p_pos: Vector2 = p.get("pos", Vector2.ZERO)
	var d := me_pos.distance_to(p_pos)
	if int(me.get("knife", 0)) < 1:
		return "本夜的刀已用完（每夜 1 把，天亮补）"
	return "再靠近一点（刀程 %.1f 米，当前 %.1f 米）" % [reach, d]


static func _nearest_living_agent(m, max_d: float) -> Dictionary:
	if m.sim == null or m.sim.agents.is_empty():
		return {}
	var p: Vector2 = m.sim.me().get("pos", Vector2.ZERO)
	var best: Dictionary = {}
	var best_d := max_d
	for a: Dictionary in m.sim.agents:
		if int(a.get("i", -1)) == int(m.sim.me_idx):
			continue
		if not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
				or bool(a.get("detained", false)):
			continue
		var ap: Vector2 = a.get("pos", Vector2.ZERO)
		var d := p.distance_to(ap)
		if d < best_d:
			best_d = d
			best = a
	return best


static func collect_offers(m) -> Array:
	var out: Array = []
	if m.extras == null or m.player == null:
		return out
	var pos: Vector3 = m.player.global_position
	_offers_attack(m, out)
	_offers_tasks_and_fix(m, pos, out)
	_offers_bodies(m, pos, out)
	_offers_bots(m, pos, out)
	_offers_facilities(m, pos, out)
	if m.sim != null and not m.sim.agents.is_empty() and bool(m.sim.me().get("ghost", false)):
		var ghost_out: Array = []
		for o2: Dictionary in out:
			if String(o2.get("id", "")).begins_with("task-"):
				ghost_out.append(o2)
		out = ghost_out
	return out


static func _offers_attack(m, out: Array) -> void:
	if m.sim == null or m.sim.agents.is_empty() or bool(m.sim.spectator):
		return
	var me_a: Dictionary = m.sim.me()
	if not bool(me_a.get("alien", false)) or not bool(me_a.get("alive", true)) \
			or bool(me_a.get("downed", false)) or bool(me_a.get("detained", false)):
		return
	var atk_pick := CombatCtrl.nearest_knife_any(m)
	var atk_tgt: Dictionary = atk_pick.get("agent", {})
	var atk_bot := String(atk_pick.get("bot", ""))
	if atk_tgt.is_empty() and atk_bot == "":
		return
	var atk_name := String(atk_tgt.get("name", "")) if atk_bot == "" \
		else ("保安机器人" if atk_bot == "secbot" else "医疗无人机")
	var has_knife := int(me_a.get("knife", 0)) > 0
	out.append({
		"id": "attack",
		"label": ("出刀 · " + atk_name) if has_knife else ("出刀（本夜刀已用完） · " + atk_name),
		"hint": ("左键同效 · 剩余刀 %d" % int(me_a.get("knife", 0))) if has_knife else "天亮补 1 把",
		"accent": Color("#FF9E96"),
		"act": func() -> void: CombatCtrl.player_knife(m, me_a, atk_tgt, atk_bot),
	})


static func _offers_tasks_and_fix(m, pos: Vector3, out: Array) -> void:
	var dev_r := SpaceData.num(m.space, "reach", "fix")
	var nearest_task_dev = null
	var nearest_task_d := INF
	for cand in m.extras.devices:
		if not is_instance_valid(cand) or cand.point_index < 0:
			continue
		var cand_d := float(cand.reach_dist(pos))
		if cand_d <= TASK_NEAR_R and cand_d < nearest_task_d:
			nearest_task_d = cand_d
			nearest_task_dev = cand
	for dev in m.extras.devices:
		if not is_instance_valid(dev):
			continue
		if dev.point_index < 0:
			if dev.distance_to(pos) <= SpaceData.num(m.space, "reach", "breaker"):
				out.append(breaker_offer(m, dev))
			continue
		if dev.reach_dist(pos) > TASK_NEAR_R:
			continue
		if m._sim_gate:
			if dev != nearest_task_dev:
				continue
			if m.sim == null or m.sim.agents.is_empty() or not m.sim.can_do_task(dev.point_index):
				continue
		var room_out := m.sim != null and float(m.sim.room_out.get(dev.room_id, 0.0)) > 0.0
		out.append({
			"id": "task-%d" % dev.point_index,
			"label": "做任务 · " + String(dev.task_label),
			"hint": "该舱室断电 · 无法启动" if room_out else "%.1fm" % dev.reach_dist(pos),
			"dev": dev,
			"act": func() -> void:
				if room_out:
					m._toast("该舱室断电：小游戏无法启动")
					return
				m._open_device(dev),
		})
	# 人类幽灵禁止维修故障（对齐 2D sabotage.js:170）
	if m.sim != null and not bool(m.sim.me().get("ghost", false)):
		for d: Dictionary in m.sim.dmg:
			var dx := float(d.get("x", 0.0))
			var dy := float(d.get("y", 0.0))
			if Vector2(dx, dy).distance_to(Vector2(pos.x, pos.z)) > dev_r:
				continue
			var rid := String(d.get("room", ""))
			var dmg_item: Dictionary = d
			out.push_front({
				"id": "fix-" + rid,
				"label": "维修故障 · " + m.sim.room_name(rid),
				"hint": "小游戏维修 · 剩余 %.0fs" % maxf(0.0, float(d.get("left", 0.0))),
				"accent": Color("#FFB3AC"),
				"act": func() -> void: m._open_fix_minigame(dmg_item),
			})


static func _offers_bodies(m, pos: Vector3, out: Array) -> void:
	if m.sim == null or m.sim.agents.is_empty():
		return
	var p2 := Vector2(pos.x, pos.z)
	var body_r := SpaceData.num(m.space, "reach", "body")
	var body: Dictionary = m.sim.body_near(p2, body_r)
	if not body.is_empty() and not bool(body.get("bodyReported", false)) and body_visible_to_player(m, body):
		out.append({
			"id": "report", "label": "报告尸体 · " + String(body.get("name", "?")),
			"hint": "立即开会 · 5 秒投票", "accent": Color("#FFB3AC"),
			"act": func() -> void: m.sim.open_meeting(int(m.sim.me_idx), int(body.get("i", -1))),
		})
	_offers_drag(m, p2, body_r, out)
	_offers_search_and_inspect(m, p2, body_r, out)
	var me: Dictionary = m.sim.me()
	if int(me.get("medkit", 0)) > 0:
		var downed: Dictionary = m.sim.nearest_downed(p2, body_r)
		if not downed.is_empty() and body_visible_to_player(m, downed):
			var rv_i := int(downed.get("i", -1))
			out.append({
				"id": "revive-%d" % rv_i, "label": "施救 · " + String(downed.get("name", "?")),
				"hint": "站桩 %.0fs · 消耗 1 个医疗包" % SpaceData.num(m.space, "stand", "revive"),
				"accent": Color("#B9F5DA"),
				"act": func() -> void: start_station(m, "施救",
					SpaceData.num(m.space, "stand", "revive"), func() -> void: on_revive_done(m, rv_i)),
			})


static func _offers_drag(m, p2: Vector2, body_r: float, out: Array) -> void:
	var me_drag := int(m.sim.me().get("drag", -1))
	if me_drag >= 0:
		var carried: Dictionary = m.sim.agent(me_drag)
		var is_dead := not bool(carried.get("alive", false)) and not bool(carried.get("downed", false))
		var drop_rid := String(m.sim.room_at(carried.get("bodyPos", p2)))
		# 在非 bridge / 非 med 舱室放下已死亡尸体会直接隐藏/销毁尸体，明确提示防止误触
		var will_hide := is_dead and drop_rid != "" and drop_rid != "bridge" and drop_rid != "med"
		var drop_lbl := "放下并隐藏尸体 · 移出视野" if will_hide else ("放下尸体 · " + String(carried.get("name", "?")))
		var drop_hint := "此操作会隐藏尸体，人类将无法报告" if will_hide else "在医疗间救起 · 在其它舱室藏尸"
		out.append({
			"id": "drag-drop", "label": drop_lbl,
			"hint": drop_hint, "accent": Color("#FFB3AC") if will_hide else Color("#C7B6E8"),
			"act": func() -> void: on_drag_drop(m),
		})
		return
	for dead2: Dictionary in m.sim.agents:
		if int(dead2.get("i", -1)) == int(m.sim.me_idx):
			continue
		var is_downed: bool = bool(dead2.get("alive", false)) and bool(dead2.get("downed", false))
		if not is_downed and (bool(dead2.get("alive", false)) or bool(dead2.get("bodyGone", false))):
			continue
		var bp2: Vector2 = dead2.get("pos", Vector2.ZERO) if is_downed else dead2.get("bodyPos", Vector2.ZERO)
		if bp2.distance_to(p2) > body_r or not body_visible_to_player(m, dead2):
			continue
		var db2: Variant = dead2.get("draggedBy", null)
		if db2 != null and int(db2) >= 0:
			continue
		var body_i2 := int(dead2.get("i", -1))
		out.append({
			"id": "drag-%d" % body_i2,
			"label": ("拖走伤员 · " if is_downed else "拖走尸体 · ") + String(dead2.get("name", "?")),
			"hint": ("拖进医疗间可救活 · 移动变慢" if is_downed else "移动变慢 · 再按 G 放下"),
			"accent": Color("#C7B6E8"),
			"act": func() -> void: on_drag_start(m, body_i2),
		})


static func _offers_search_and_inspect(m, p2: Vector2, body_r: float, out: Array) -> void:
	for dead: Dictionary in m.sim.agents:
		if bool(dead.get("alive", false)) and not bool(dead.get("downed", false)):
			continue
		if bool(dead.get("bodyGone", false)) or String(dead.get("deathCause", "")) == "vote":
			continue
		if SimStateScript.InvariantsScript._dragged_by(dead) >= 0:
			continue
		var bp: Vector2 = dead.get("pos", Vector2.ZERO) if bool(dead.get("alive", false)) \
			else dead.get("bodyPos", Vector2.ZERO)
		if bp.distance_to(p2) > body_r or not body_visible_to_player(m, dead):
			continue
		var body_i := int(dead.get("i", -1))
		if not bool(dead.get("searched", false)):
			out.append({
				"id": "search-%d" % body_i,
				"label": ("查看伤情 · " if bool(dead.get("alive", false)) else "搜尸取证 · ") + String(dead.get("name", "?")),
				"hint": "站桩 %.0fs · 查看尸检/伤情" % SpaceData.num(m.space, "stand", "search"),
				"accent": Color("#B9F5DA"),
				"act": func() -> void: start_station(m, "搜尸",
					SpaceData.num(m.space, "stand", "search"), func() -> void: on_search_done(m, body_i)),
			})
		elif m.sim.body_has_loot(dead):
			out.append({
				"id": "loot-%d" % body_i, "label": "领取物资 · " + String(dead.get("name", "?")),
				"hint": "取得随身弹药 / 医疗包 / 申请单", "accent": Color("#F5DFB9"),
				"act": func() -> void: on_take_body_loot(m, body_i),
			})
	for b: Dictionary in m.sim.agents:
		if not bool(b.get("searched", false)):
			continue
		var bp3: Vector2 = b.get("bodyPos", Vector2.ZERO)
		if bp3 == Vector2.ZERO and bool(b.get("alive", false)):
			bp3 = b.get("pos", Vector2.ZERO)
		if bp3.distance_to(p2) > body_r or not body_visible_to_player(m, b):
			continue
		var bi := int(b.get("i", -1))
		out.append({
			"id": "inspect-%d" % bi, "label": "查看记录 · " + String(b.get("name", "?")),
			"hint": "尸检 / 伤情记录", "accent": Color("#C9D1DB"),
			"act": func() -> void: m._open_body_card(bi),
		})


static func _offers_bots(m, pos: Vector3, out: Array) -> void:
	var p2 := Vector2(pos.x, pos.z)
	for bkind: String in ["secbot", "medbot"]:
		var bfac := _find_facility(m, bkind)
		if bfac.is_empty():
			continue
		var bpos := Vector2(float(bfac.get("x", 0)), float(bfac.get("y", 0)))
		if bpos.distance_to(p2) <= SpaceData.num(m.space, "shoot", "range") and int(m.sim.bot_hp.get(bkind, 0)) > 0:
			var bk := bkind
			out.append({
				"id": "bot-" + bkind,
				"label": "射击%s · HP %d" % [String(bfac.get("label", bkind)), int(m.sim.bot_hp.get(bkind, 0))],
				"hint": "消耗 1 发子弹 · 拆掉后不再巡逻/救人", "accent": Color("#FFB3AC"),
				"act": func() -> void: CombatCtrl.on_hit_bot(m, bk),
			})
	if m.sim != null and not m.sim.agents.is_empty():
		var sab_me: Dictionary = m.sim.me()
		if bool(sab_me.get("alien", false)) and bool(sab_me.get("alive", true)) \
				and not bool(sab_me.get("downed", false)) and not bool(sab_me.get("detained", false)) \
				and not bool(sab_me.get("sabUsed", false)):
			for bkind3: String in ["secbot", "medbot"]:
				if int(m.sim.bot_hp.get(bkind3, 0)) <= 0:
					continue
				var bp3: Vector2 = m.sim.bot_pos_of(bkind3)
				if bp3 != Vector2.ZERO and bp3.distance_to(p2) <= SpaceData.num(m.space, "reach", "sabotage"):
					var bfac3 := _find_facility(m, bkind3)
					var bname3 := String(bfac3.get("label", "保安机器人" if bkind3 == "secbot" else "医疗无人机"))
					var bk4 := bkind3
					out.append({
						"id": "sabotagebot-" + bkind3, "label": "停摆 · " + bname3,
						"hint": "每夜一次 · 不耗刀 · 之后不能再破坏舱室", "accent": Color("#FFB3AC"),
						"act": func() -> void: on_sabotage_bot(m, bk4),
					})
	for bk: String in ["secbot", "medbot"]:
		var bfac2 := _find_facility(m, bk)
		if bfac2.is_empty():
			continue
		var bpt := Vector2(float(bfac2.get("x", 0)), float(bfac2.get("y", 0)))
		if bpt.distance_to(p2) > SpaceData.num(m.space, "reach", "sabotage"):
			continue
		var bk2 := bk
		var blabel := String(bfac2.get("label", bk2))
		out.append({
			"id": "botinfo-" + bk2, "label": "查看机器人状态 · " + blabel,
			"hint": "HP %d · 本夜额度 %d 次" % [int(m.sim.bot_hp.get(bk2, 0)),
				int(SpaceData.num(m.space, "bot", "sec_uses" if bk2 == "secbot" else "med_uses"))],
			"accent": Color("#C9D1DB"),
			"act": func() -> void: m._toast("%s · HP %d · %s" % [blabel,
				int(m.sim.bot_hp.get(bk2, 0)), "在线" if int(m.sim.bot_hp.get(bk2, 0)) > 0 else "已停摆"]),
		})


static func _find_facility(m, kind: String) -> Dictionary:
	var list := _facility_list(m, kind)
	return list[0] as Dictionary if not list.is_empty() else {}


static func _offers_facilities(m, pos: Vector3, out: Array) -> void:
	var p2 := Vector2(pos.x, pos.z)
	if m.sim != null and not m.sim.agents.is_empty() and bool(m.sim.me().get("alien", false)):
		for pp in m.extras.pipe_ports:
			var d := Vector2((pp["pos"] as Vector3).x - pos.x, (pp["pos"] as Vector3).z - pos.z).length()
			if d <= PIPE_NEAR_R:
				out.append({
					"id": "pipe-%s" % String(pp["room"]), "label": "钻管道 · 选择出口",
					"hint": ("%.1fm · 冷却中 %.0fs" % [d, m._pipe_cd]) if m._pipe_cd > 0.0 else ("%.1fm · 内鬼专用" % d),
					"accent": Color("#D6CCFF"), "act": func() -> void: m._use_pipe(pp),
				})
	var table := round_table_cover(m)
	if m.qual_pending > 0 and table != {}:
		var dx := maxf(maxf(float(table["x"]) - pos.x, 0.0), pos.x - (float(table["x"]) + float(table["w"])))
		var dy := maxf(maxf(float(table["y"]) - pos.z, 0.0), pos.z - (float(table["y"]) + float(table["h"])))
		if sqrt(dx * dx + dy * dy) <= SpaceData.num(m.space, "reach", "round_table"):
			out.append({
				"id": "req", "label": "领物资申请单",
				"hint": "交互即领 · 待领 %d" % m.qual_pending if SpaceData.num(m.space, "stand", "qual") <= 0.0
					else "站桩 %.0fs · 待领 %d" % [SpaceData.num(m.space, "stand", "qual"), m.qual_pending],
				"accent": Color("#FFE8B0"), "act": func() -> void: claim_qual_now(m),
			})
	for fac: Dictionary in _facility_list(m, "supply"):
		var ds := Vector2(float(fac.get("x", 0)) - pos.x, float(fac.get("y", 0)) - pos.z).length()
		if ds <= SUPPLY_NEAR_R:
			var is_ammo := String(fac.get("label", "")).contains("军械") or String(fac.get("label", "")).contains("弹")
			var dur := SpaceData.num(m.space, "stand", "ammo" if is_ammo else "med")
			var item := "ammo" if is_ammo else "medkit"
			out.append({
				"id": "supply-%s" % String(fac.get("label", "")),
				"label": ("领子弹" if is_ammo else "领医疗包") + " · " + String(fac.get("label", "")),
				"hint": "站桩 %.0fs · %s" % [dur, "消耗 1 张申请单" if m.qual > 0 else "需要物资申请单"],
				"accent": Color("#FFE0A3") if is_ammo else Color("#B9F5DA"),
				"act": func() -> void: start_station(m, "补给领取", dur, func() -> void: on_supply_done(m, item)),
			})
	for fac: Dictionary in _facility_list(m, "monitor"):
		if Vector2(float(fac.get("x", 0)), float(fac.get("y", 0))).distance_to(p2) <= MONITOR_NEAR_R:
			out.append({
				"id": "cams", "label": "全船监控 · " + String(fac.get("label", "监控台")),
				"hint": "%d 路在线 · C / ESC 退出" % (m.map_data.get("rooms", []) as Array).size(),
				"accent": Color("#B9F5DA"), "act": func() -> void: m._open_cams(),
			})
	if m.sim != null and not m.sim.agents.is_empty() and bool(m.sim.me().get("alien", false)):
		var rid := String(m.sim.room_at(p2))
		var occupied := false
		for d2: Dictionary in m.sim.dmg:
			if String(d2.get("room", "")) == rid:
				occupied = true
				break
		if rid != "" and rid != "bridge" and not occupied and not bool(m.sim.me().get("sabUsed", false)):
			var sabrid: String = rid
			out.append({
				"id": "sabotage-" + sabrid, "label": "破坏舱室 · " + m.sim.room_name(sabrid),
				"hint": "每夜一次 · 30 秒内未修复则倒扣维修进度", "accent": Color("#FFB3AC"),
				"act": func() -> void: on_sabotage(m, sabrid),
			})


static func breaker_offer(m, dev) -> Dictionary:
	var label := "拉闸断电" if m.power_on else "合闸复电"
	return {
		"id": "breaker", "label": label,
		"hint": "拉闸小游戏 · 当前%s" % ("断电" if not m.power_on else
			("全亮（配电已修）" if m.sim != null and int(m.sim.light_state) == 1 else "照明")),
		"accent": Color("#BFE9F7"), "dev": dev,
		"act": func() -> void: m._open_breaker_minigame(dev, label),
	}


static func round_table_cover(m) -> Dictionary:
	var covers: Array = m.map_data.get("cover", [])
	if covers.is_empty():
		return {}
	if is_same(covers, _cached_cover_arr):
		return _cached_round_table
	_cached_cover_arr = covers
	_cached_round_table = {}
	for c: Dictionary in covers:
		if String(c.get("label", "")) == "圆桌":
			_cached_round_table = c
			return _cached_round_table
	push_warning("map.json 里找不到 label=圆桌 的掩体，领取申请单交互不成立")
	return _cached_round_table


static func start_station(m, label: String, dur: float, done: Callable) -> void:
	if dur <= 0.0:
		push_error("站桩时长取不到（space.json 缺字段？）：%s" % label)
		return
	m.player.ui_locked = false
	m.station = {"label": label, "dur": dur, "t": 0.0, "done": done}
	m._toast("%s %.1fs" % [label, dur])


static func tick_station(m, delta: float) -> void:
	if m.station.is_empty():
		return
	if m.sim != null and (not m.sim.meeting.is_empty() or m._info_open or m._pipe_open \
			or (m.mg_layer != null and m.mg_layer.is_open()) \
			or (m.wheel != null and m.wheel.is_open()) \
			or (m.ui_panels != null and m.ui_panels.any_open())):
		return
	if m.sim != null:
		var me_st: Dictionary = m.sim.me()
		if me_st.is_empty() or bool(me_st.get("downed", false)) \
				or bool(me_st.get("detained", false)):
			m.station = {}
			return
	if _moving_input():
		m.station = {}
		m._toast("站桩中断（移动）")
		return
	m.station["t"] = float(m.station["t"]) + delta
	if float(m.station["t"]) >= float(m.station["dur"]):
		var done: Callable = m.station["done"]
		m.station = {}
		done.call()


static func _moving_input() -> bool:
	return Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_A) \
		or Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_D)


static func claim_qual_now(m) -> void:
	var dur := SpaceData.num(m.space, "stand", "qual")
	if dur > 0.0:
		start_station(m, "领取物资申请单", dur, func() -> void: on_claim_done(m))
		return
	on_claim_done(m)


static func on_claim_done(m) -> void:
	if m.sim != null and m.sim.claim_qual(int(m.sim.me_idx)):
		m.qual_pending = int(m.sim.me().get("qualPending", 0))
		m.qual = int(m.sim.me().get("qual", 0))
		m._toast("已领取 1 张物资申请单（现有 %d 张）" % m.qual)
	else:
		m._toast("没有待领取的物资申请单")


static func on_drag_start(m, body_i: int) -> void:
	if m.sim != null and m.sim.start_drag(int(m.sim.me_idx), body_i):
		m._toast("正在拖动尸体 · 移动变慢，再按 G 放下")
	else:
		m._toast("这具尸体拖不了（已消失或正被别人拖）")


static func on_drag_drop(m) -> void:
	if m.sim == null:
		return
	var carried: Dictionary = m.sim.agent(int(m.sim.me().get("drag", -1)))
	var was_downed := bool(carried.get("downed", false))
	if m.sim.release_drag(int(m.sim.me_idx)):
		if not was_downed:
			m._toast("已放下尸体")
		elif bool(carried.get("downed", false)):
			m._toast("已放下伤员（还在濒死 —— 拖进医疗间才能救活）")
		else:
			m._toast("伤员已送进医疗间 · 已被救起")


static func on_revive_done(m, body_i: int) -> void:
	if m.sim != null and m.sim.player_revive(body_i):
		m._toast("施救成功 · 剩余医疗包 %d" % int(m.sim.me().get("medkit", 0)))
	else:
		m._toast("施救失败（医疗包不足 / 目标已不在濒死状态）")


static func on_sabotage_bot(m, kind: String) -> void:
	if m.sim != null and m.sim.sabotage_bot(kind, int(m.sim.me_idx)):
		m._toast("已停摆 %s（本夜破坏额度已用）" % ("保安机器人" if kind == "secbot" else "医疗无人机"))
	else:
		m._toast("停摆失败（今晚已用过 / 距离太远 / 已停摆 / 不是异形）")


static func on_sabotage(m, room_id: String) -> void:
	if m.sim != null and m.sim.player_sabotage(room_id):
		if m.sim.sab_target.is_empty():
			m._toast("已破坏 " + m.sim.room_name(room_id) + " · 30 秒内未修复将倒扣维修进度")
		else:
			m._toast("破坏目标：" + m.sim.room_name(room_id) + " · 进入舱室自动下手")
	else:
		m._toast("破坏失败（本夜已用过 / 该舱已有故障 / 中央会议室不可破坏）")


static func on_search_done(m, body_i: int) -> void:
	if m.sim != null and m.sim.search_body(body_i, int(m.sim.me_idx)):
		m._toast("取证完成 · 已记录尸检/伤情")
		m._open_body_card(body_i)
	else:
		m._toast("无法搜查（已取证或正被拖动）")


static func on_take_body_loot(m, body_i: int) -> void:
	if m.sim == null:
		return
	var got: Dictionary = m.sim.take_body_loot(body_i, int(m.sim.me_idx))
	if not bool(got.get("ok", false)):
		m._toast("无法领取物资（正被拖动或未取证）")
		return
	m._toast("领取物资 · 弹 +%d / 包 +%d / 单 +%d" % [
		int(got.get("bullet", 0)), int(got.get("medkit", 0)), int(got.get("qual", 0))])


static func on_supply_done(m, item: String = "ammo") -> void:
	if m.sim != null and m.sim.exchange_supply(item, int(m.sim.me_idx)):
		m.qual = int(m.sim.me().get("qual", 0))
		m._toast("消耗 1 张申请单 · 剩余 %d 张" % m.qual)
	else:
		m._toast("没有申请单，补给点拒绝发放")
