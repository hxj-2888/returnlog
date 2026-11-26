extends RefCounted
## 管道选择与尸检/监控弹层模块：深炭工业卡片、1px 分割线行与双列管道按钮。

const UIStyle := preload("res://scripts/ui/ui_style.gd")


static func build_pipe(m) -> void:
	if m.pipe_panel != null:
		return
	var parent: Node = m.modal_layer if m.modal_layer != null else m.hud_layer
	m.pipe_panel = ColorRect.new()
	m.pipe_panel.color = UIStyle.BG_OVERLAY
	m.pipe_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	m.pipe_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	m.pipe_panel.visible = false
	parent.add_child(m.pipe_panel)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	m.pipe_panel.add_child(center)

	var card := PanelContainer.new()
	card.custom_minimum_size = Vector2(520, 0)
	card.add_theme_stylebox_override("panel",
		UIStyle.card_style_xy(UIStyle.BG_CARD, UIStyle.BORDER_CARD, 14, 24, 20, 1))
	center.add_child(card)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	card.add_child(box)

	var t := UIStyle.label("地道 · 选择出口", 16, Color.WHITE)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	box.add_child(t)

	m.pipe_hint = UIStyle.label("", 12, UIStyle.TEXT_DIM)
	m.pipe_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	box.add_child(m.pipe_hint)

	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	m.pipe_buttons = grid
	box.add_child(grid)

	var btns := HBoxContainer.new()
	btns.alignment = BoxContainer.ALIGNMENT_BEGIN
	box.add_child(btns)
	var cancel_btn := UIStyle.make_button("取消 (Esc)", func() -> void: close_pipe(m),
		13, UIStyle.BG_BTN, UIStyle.BORDER_BTN, Vector2(120, 34), UIStyle.TEXT_MAIN)
	btns.add_child(cancel_btn)


static func open_pipe(m, from: Dictionary) -> void:
	build_pipe(m)
	for c in m.pipe_buttons.get_children():
		c.queue_free()
	var n := 0
	var dests: Array = []
	for pp in m.extras.pipe_ports:
		if (pp["pos"] as Vector3).distance_to(from["pos"] as Vector3) < 0.6:
			continue
		dests.append(pp)
		var idx := n
		var dest: Dictionary = pp
		var rname: String = m.sim.room_name(String(dest["room"]))
		var b := UIStyle.make_button("",
			func() -> void: travel_pipe(m, dest),
			13, UIStyle.BG_BTN, UIStyle.BORDER_BTN, Vector2(228, 38), UIStyle.TEXT_MAIN)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var hb := HBoxContainer.new()
		hb.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		hb.offset_left = 11
		hb.offset_right = -11
		hb.add_theme_constant_override("separation", 9)
		hb.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(hb)
		hb.add_child(UIStyle.label("[%d]" % (idx + 1), 11, UIStyle.TEXT_PURPLE))
		var rl := UIStyle.label(rname, 13, UIStyle.TEXT_MAIN)
		rl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		hb.add_child(rl)
		m.pipe_buttons.add_child(b)
		n += 1
	m._pipe_dests = dests
	var cd_val: float = m.SpaceData.num(m.space, "pipe", "cooldown")
	m.pipe_hint.text = "从 %s 出发 · 按 1-%d 或点击直达 · 冷却 %.0fs" % [
		m.sim.room_name(String(from["room"])), maxi(1, n), cd_val]
	m._pipe_open = true
	m.pipe_panel.visible = true
	if m.player != null:
		m.player.ui_locked = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


static func handle_pipe_digit(m, key: Key) -> bool:
	if not m._pipe_open:
		return false
	if key < KEY_1 or key > KEY_9:
		return false
	var idx := int(key) - int(KEY_1)
	if idx >= 0 and idx < m._pipe_dests.size():
		travel_pipe(m, m._pipe_dests[idx] as Dictionary)
		return true
	return false


static func close_pipe(m) -> void:
	m._pipe_open = false
	m._pipe_dests = []
	if m.pipe_panel != null:
		m.pipe_panel.visible = false
	if m.player != null:
		m.player.ui_locked = false
	m._refresh_mouse_mode()


static func travel_pipe(m, to: Dictionary) -> void:
	var p3: Vector3 = to["pos"] as Vector3
	var dest: Vector2 = m.sim.nav.nearest_free(Vector2(p3.x, p3.z))
	close_pipe(m)
	m.player.global_position = Vector3(dest.x, 0.05, dest.y)
	var me: Dictionary = m.sim.me()
	me["pos"] = dest
	me["path"] = PackedVector2Array()
	me["pathI"] = 0
	me["doing"] = 0.0
	m._pipe_cd = m.SpaceData.num(m.space, "pipe", "cooldown")
	m.sim._log("pipe", {"actor": int(m.sim.me_idx), "room": String(to.get("room", "")),
		"x": snappedf(dest.x, 0.1), "y": snappedf(dest.y, 0.1)})
	m._toast("钻管道 → %s · 冷却 %.0fs" % [
		m.sim.room_name(String(to.get("room", ""))), m._pipe_cd])


static func build_info(m) -> void:
	if m.info_panel != null:
		return
	var parent: Node = m.modal_layer if m.modal_layer != null else m.hud_layer
	var bg := ColorRect.new()
	bg.color = UIStyle.BG_OVERLAY
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_STOP
	parent.add_child(bg)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.add_child(center)

	var card := PanelContainer.new()
	card.name = "InfoCardPanel"
	card.custom_minimum_size = Vector2(460, 0)
	card.add_theme_stylebox_override("panel",
		UIStyle.card_style_xy(UIStyle.BG_CARD, UIStyle.BORDER_CARD, 14, 24, 20, 1))
	center.add_child(card)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	card.add_child(box)

	m.info_title = UIStyle.label("", 16, Color.WHITE)
	m.info_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	box.add_child(m.info_title)

	m.info_sub = UIStyle.label("", 12, UIStyle.TEXT_DIM)
	m.info_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	box.add_child(m.info_sub)

	m.info_rows = VBoxContainer.new()
	m.info_rows.add_theme_constant_override("separation", 0)
	box.add_child(m.info_rows)

	m.info_text = RichTextLabel.new()
	m.info_text.bbcode_enabled = true
	m.info_text.fit_content = true
	m.info_text.custom_minimum_size = Vector2(440, 180)
	m.info_text.add_theme_font_override("normal_font", UIFont.get_font())
	m.info_text.add_theme_font_size_override("normal_font_size", 13)
	m.info_text.add_theme_color_override("default_color", UIStyle.TEXT_MAIN)
	m.info_text.add_theme_stylebox_override("normal",
		UIStyle.card_style_xy(Color.html("#04070B"), Color.html("#16222E"), 8, 12, 10, 1))
	box.add_child(m.info_text)

	var btns := HBoxContainer.new()
	btns.alignment = BoxContainer.ALIGNMENT_BEGIN
	btns.add_theme_constant_override("separation", 10)
	box.add_child(btns)

	m.info_loot_btn = UIStyle.make_button("一键拿取物资", Callable(),
		13, UIStyle.BG_BTN, UIStyle.BORDER_GOLD, Vector2(180, 34), UIStyle.TEXT_GOLD)
	m.info_loot_btn.visible = false
	btns.add_child(m.info_loot_btn)

	var close := UIStyle.make_button("关闭 (Esc)", func() -> void: close_info(m),
		13, UIStyle.BG_PRIMARY, UIStyle.BORDER_PRIMARY, Vector2(120, 34), UIStyle.TEXT_MAIN)
	btns.add_child(close)

	m.info_panel = bg
	m.info_panel.visible = false


static func _set_info_card_theme(m, cam_mode: bool) -> void:
	if m.info_panel == null:
		return
	var card := m.info_panel.find_child("InfoCardPanel", true, false) as PanelContainer
	if card == null:
		return
	if cam_mode:
		card.add_theme_stylebox_override("panel",
			UIStyle.card_style_xy(Color.html("#070C12"), Color.html("#24405A"), 14, 16, 14, 1))
		m.info_title.add_theme_color_override("font_color", Color.html("#BFE9F7"))
	else:
		card.add_theme_stylebox_override("panel",
			UIStyle.card_style_xy(UIStyle.BG_CARD, UIStyle.BORDER_CARD, 14, 24, 20, 1))
		m.info_title.add_theme_color_override("font_color", Color.WHITE)


static func open_info(m, title: String, lines: Array) -> void:
	build_info(m)
	_set_info_card_theme(m, false)
	m.info_title.text = title
	m.info_sub.visible = false
	_clear_rows(m)
	m.info_rows.visible = false
	m.info_loot_btn.visible = false
	m.info_text.visible = true
	m.info_text.text = "\n".join(PackedStringArray(lines))
	m.info_panel.visible = true
	m._info_open = true


static func close_info(m) -> void:
	if m.info_panel != null:
		m.info_panel.visible = false
	m._info_open = false


static func _clear_rows(m) -> void:
	if m.info_rows == null:
		return
	for c in m.info_rows.get_children():
		c.queue_free()


static func _add_row(m, k: String, v: String, val_col: Color = UIStyle.TEXT_GOLD) -> void:
	var row_box := PanelContainer.new()
	row_box.add_theme_stylebox_override("panel", UIStyle.row_line_style(UIStyle.DIVIDER, 7, 7))
	var hb := HBoxContainer.new()
	hb.add_theme_constant_override("separation", 18)
	row_box.add_child(hb)
	var kl := UIStyle.label(k, 13, UIStyle.TEXT_SUB)
	kl.custom_minimum_size = Vector2(88, 0)
	hb.add_child(kl)
	var vl := UIStyle.label(v, 13, val_col)
	vl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	vl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hb.add_child(vl)
	m.info_rows.add_child(row_box)


static func _wound_desc(b: Dictionary) -> String:
	var alive := bool(b.get("alive", false))
	if alive and bool(b.get("downed", false)):
		match String(b.get("woundCause", "")):
			"shot": return "枪伤 · 仍在渗血"
			"knife": return "刀伤 · 仍在渗血"
			_: return "重伤 · 仍在渗血"
	match String(b.get("deathCause", "")):
		"knife": return "利刃致命伤（被出刀）"
		"shot": return "枪械击杀"
		"bleed": return "失血过多（天亮未救）"
		"vote": return "投票驱逐"
		_: return "不明致命伤"


static func open_body_card(m, body_i: int) -> void:
	if m.sim == null:
		return
	var b: Dictionary = m.sim.agent(body_i)
	if b.is_empty():
		return
	build_info(m)
	_set_info_card_theme(m, false)
	var alive := bool(b.get("alive", false))
	var bp: Vector2 = b.get("bodyPos", Vector2.ZERO)
	if bp == Vector2.ZERO:
		bp = b.get("pos", Vector2.ZERO)
	var room_nm: String = m.sim.room_name(m.sim.room_at(bp))
	var kb := int(b.get("killedBy", -1))
	var killer_text := "无法判断"
	if (bool(m.sim.dev) or bool(m.sim.spectator)) and kb >= 0 and kb != int(b.get("i", -1)):
		killer_text = m._tag_name(kb) + "（全知）"

	m.info_title.text = ("伤情记录 · " if alive else "尸检记录 · ") + m._tag_name(body_i)
	m.info_sub.text = "当前位置：%s" % room_nm
	m.info_sub.visible = true
	_clear_rows(m)
	m.info_rows.visible = true
	m.info_text.visible = false

	_add_row(m, "状态", "濒死 · 拖进医疗间可救活" if alive else "已死亡",
		UIStyle.TEXT_GOLD if alive else UIStyle.TEXT_RED)
	_add_row(m, "伤口" if alive else "死因", _wound_desc(b), UIStyle.TEXT_RED)
	var d_room := String(b.get("deathRoom", ""))
	_add_row(m, "发现地点" if alive else "死亡地点",
		room_nm if (alive or d_room == "") else m.sim.room_name(d_room))
	var at_sec := float(b.get("downedT", 0.0)) if alive else float(b.get("deathAt", 0.0))
	_add_row(m, "时间", "第 %d 夜 · %.1fs" % [int(m.sim.night), at_sec], UIStyle.TEXT_CYAN)
	var moved := bool(b.get("bodyMoved", false))
	_add_row(m, "尸体位置", "被移动过 · 现场被布置" if moved else "未被移动",
		UIStyle.TEXT_RED if moved else UIStyle.TEXT_GREEN)
	var searched := bool(b.get("searched", false))
	_add_row(m, "检查状态", "已检查 · 伤口与拖拽痕迹完整" if searched else "未检查 · 搜尸后可取证",
		UIStyle.TEXT_GREEN if searched else UIStyle.TEXT_SUB)
	_add_row(m, "凶手推断", killer_text, UIStyle.TEXT_GOLD if killer_text != "无法判断" else UIStyle.TEXT_DIM)

	var bl := int(b.get("bullet", 0))
	var md := int(b.get("medkit", 0))
	var ql := int(b.get("qual", 0))
	_add_row(m, "随身物资", "弹 %d / 包 %d / 单 %d" % [bl, md, ql],
		UIStyle.TEXT_GOLD if (bl + md + ql) > 0 else UIStyle.TEXT_DIM)

	for c in m.info_loot_btn.pressed.get_connections():
		m.info_loot_btn.pressed.disconnect(c["callable"] as Callable)
	var can_loot: bool = bool(m.sim.body_has_loot(b)) and bool(m._meeting_can_act_now())
	m.info_loot_btn.visible = can_loot
	if can_loot:
		m.info_loot_btn.text = "一键拿取物资（弹%d 包%d 单%d）" % [bl, md, ql]
		m.info_loot_btn.pressed.connect(func() -> void:
			m._on_take_body_loot(body_i)
			open_body_card(m, body_i))
	m.info_panel.visible = true
	m._info_open = true


static func open_cams(m) -> void:
	if m.sim == null:
		return
	if m.sim.over or not m.sim.meeting.is_empty():
		return
	var me_cam: Dictionary = m.sim.me()
	if not bool(me_cam.get("alive", false)) or bool(me_cam.get("downed", false)) \
			or bool(me_cam.get("detained", false)):
		return
	var rooms: Array = m.map_data.get("rooms", [])
	var lines: Array = []
	if m.power_on:
		lines.append("[color=#5FE0A8]● %d 路监控在线[/color]" % rooms.size())
	else:
		lines.append("[color=#FF6B61]● 信号中断 · 电闸断开（先合上配电室的电闸）[/color]")
	lines.append("第 %d 夜 · 剩余 %.0fs" % [int(m.sim.night), maxf(0.0, float(m.sim.t))])
	if m.power_on:
		var seen := {}
		for a: Dictionary in m.sim.agents:
			if not bool(a.get("alive", false)):
				continue
			var rid: String = String(m.sim.room_at(a.get("pos", Vector2.ZERO)))
			seen[rid] = int(seen.get(rid, 0)) + 1
		for rid: String in seen.keys():
			lines.append("%s：%d 人" % [m.sim.room_name(rid), int(seen[rid])])
	open_info(m, "全船监控 · CCTV", lines)
	_set_info_card_theme(m, true)
