extends RefCounted
## 会议界面模块：独立三栏深炭卡片（1 : 1.05 : 0.95）、无内框透明发言流与流式席位投票。

const UIStyle := preload("res://scripts/ui/ui_style.gd")
const SAY_CD_MS := 2000


static func template_defs() -> Array:
	return [
		["accuse", "怀疑"], ["vote", "投他"], ["support", "作证"],
		["wronglead", "他反复带节奏"], ["grateful", "我为他背过书"],
		["pipe", "看见钻管道"], ["red", "看见红光"], ["knife", "看见出刀"],
		["sabotage", "看见破坏设备"], ["bot", "看见机器人停摆"], ["breaker", "看见拉闸"],
		["where", "我在…"], ["deny", "不是我"],
	]


static func build(m) -> void:
	if m.meeting_panel != null:
		return
	var parent: Node = m.modal_layer if m.modal_layer != null else m.hud_layer
	m.meeting_panel = ColorRect.new()
	m.meeting_panel.color = UIStyle.BG_OVERLAY
	m.meeting_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	m.meeting_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	m.meeting_panel.visible = false
	parent.add_child(m.meeting_panel)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	m.meeting_panel.add_child(center)

	var cols := HBoxContainer.new()
	cols.custom_minimum_size = Vector2(1160, 616)
	cols.add_theme_constant_override("separation", 14)
	center.add_child(cols)

	_build_say_col(m, cols)
	_build_mid_col(m, cols)
	_build_vote_col(m, cols)


static func _build_say_col(m, cols: HBoxContainer) -> void:
	var say_card := PanelContainer.new()
	say_card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	say_card.size_flags_stretch_ratio = 1.0
	say_card.add_theme_stylebox_override("panel",
		UIStyle.card_style_xy(UIStyle.BG_CARD, UIStyle.BORDER_CARD, 14, 18, 16, 1))
	cols.add_child(say_card)

	var left := VBoxContainer.new()
	left.add_theme_constant_override("separation", 8)
	say_card.add_child(left)

	left.add_child(UIStyle.label("发言", 12, UIStyle.TEXT_SUB))

	var feed_wrap := Control.new()
	feed_wrap.size_flags_vertical = Control.SIZE_EXPAND_FILL
	feed_wrap.custom_minimum_size = Vector2(0, 170)
	left.add_child(feed_wrap)

	m.meeting_feed = RichTextLabel.new()
	m.meeting_feed.bbcode_enabled = true
	m.meeting_feed.scroll_following = false
	m.meeting_feed.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	m.meeting_feed.add_theme_font_override("normal_font", UIFont.get_font())
	m.meeting_feed.add_theme_font_size_override("normal_font_size", 13)
	m.meeting_feed.add_theme_color_override("default_color", UIStyle.TEXT_CHAT)
	m.meeting_feed.add_theme_stylebox_override("normal", StyleBoxEmpty.new())
	m.meeting_feed.get_v_scroll_bar().value_changed.connect(func(_v: float) -> void: on_feed_scroll(m))
	feed_wrap.add_child(m.meeting_feed)

	m.meeting_new_btn = UIStyle.make_button("↓ 0 条新发言", func() -> void: jump_feed_bottom(m),
		12, Color(0.071, 0.086, 0.118, 0.96), UIStyle.BORDER_GOLD, Vector2(136, 26), UIStyle.TEXT_GOLD)
	UIStyle.apply_button(m.meeting_new_btn, Color(0.071, 0.086, 0.118, 0.96),
		UIStyle.BORDER_GOLD, 12, 13, 12, 4, UIStyle.TEXT_GOLD, true)
	m.meeting_new_btn.anchor_left = 0.5
	m.meeting_new_btn.anchor_right = 0.5
	m.meeting_new_btn.anchor_top = 1.0
	m.meeting_new_btn.anchor_bottom = 1.0
	m.meeting_new_btn.offset_left = -68.0
	m.meeting_new_btn.offset_right = 68.0
	m.meeting_new_btn.offset_top = -34.0
	m.meeting_new_btn.offset_bottom = -8.0
	m.meeting_new_btn.visible = false
	feed_wrap.add_child(m.meeting_new_btn)

	_build_templates(m, left)

	var input_row := HBoxContainer.new()
	input_row.add_theme_constant_override("separation", 8)
	left.add_child(input_row)
	m.meeting_input = LineEdit.new()
	m.meeting_input.placeholder_text = "自由发言，回车发送"
	m.meeting_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	m.meeting_input.custom_minimum_size = Vector2(0, 34)
	UIStyle.apply_line_edit(m.meeting_input, 13)
	m.meeting_input.text_submitted.connect(func(txt: String) -> void: on_player_say(m, txt))
	input_row.add_child(m.meeting_input)

	m.meeting_send = UIStyle.make_button("发送",
		func() -> void: on_player_say(m, m.meeting_input.text),
		13, UIStyle.BG_BTN, UIStyle.BORDER_BTN, Vector2(72, 34))
	input_row.add_child(m.meeting_send)


static func _build_templates(m, left: VBoxContainer) -> void:
	m.meeting_tpl = VBoxContainer.new()
	m.meeting_tpl.add_theme_constant_override("separation", 6)
	left.add_child(m.meeting_tpl)

	m.meeting_tpl.add_child(UIStyle.hr())

	var sel_row := HBoxContainer.new()
	sel_row.add_theme_constant_override("separation", 6)
	m.meeting_tpl.add_child(sel_row)

	m.meeting_tpl_target = OptionButton.new()
	m.meeting_tpl_target.custom_minimum_size = Vector2(96, 28)
	m.meeting_tpl_target.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	m.meeting_tpl_target.clip_text = true
	UIStyle.apply_button(m.meeting_tpl_target, UIStyle.BG_DEEP, UIStyle.BORDER_BTN, 12, 6, 6, 4)
	sel_row.add_child(m.meeting_tpl_target)

	m.meeting_tpl_room = OptionButton.new()
	m.meeting_tpl_room.custom_minimum_size = Vector2(96, 28)
	m.meeting_tpl_room.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	m.meeting_tpl_room.clip_text = true
	UIStyle.apply_button(m.meeting_tpl_room, UIStyle.BG_DEEP, UIStyle.BORDER_BTN, 12, 6, 6, 4)
	sel_row.add_child(m.meeting_tpl_room)

	m.meeting_tpl_when = OptionButton.new()
	m.meeting_tpl_when.custom_minimum_size = Vector2(88, 28)
	m.meeting_tpl_when.clip_text = true
	UIStyle.apply_button(m.meeting_tpl_when, UIStyle.BG_DEEP, UIStyle.BORDER_BTN, 12, 6, 6, 4)
	m.meeting_tpl_when.add_item("不指定时段")
	m.meeting_tpl_when.set_item_metadata(0, "")
	m.meeting_tpl_when.add_item("刚才")
	m.meeting_tpl_when.set_item_metadata(1, "recent")
	m.meeting_tpl_when.add_item("整晚")
	m.meeting_tpl_when.set_item_metadata(2, "night")
	sel_row.add_child(m.meeting_tpl_when)
	build_room_options(m)

	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 5)
	grid.add_theme_constant_override("v_separation", 5)
	m.meeting_tpl.add_child(grid)
	for pair: Array in template_defs():
		var kind := String(pair[0])
		var tb := UIStyle.make_button(String(pair[1]),
			func() -> void: on_template(m, kind),
			11, UIStyle.BG_TPL, UIStyle.BORDER_TPL, Vector2(0, 25), UIStyle.TEXT_TPL)
		UIStyle.apply_button(tb, UIStyle.BG_TPL, UIStyle.BORDER_TPL, 11, 6, 4, 3, UIStyle.TEXT_TPL, true)
		tb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(tb)

	var hint := UIStyle.label(
		"先选对象/舱室再点模板；「看见钻管道」仅在有管道的舱室附带地点；「我在…/不是我」不选舱室时用当前舱室。",
		10, Color.html("#5E7280"))
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	m.meeting_tpl.add_child(hint)


static func _build_mid_col(m, cols: HBoxContainer) -> void:
	var mid_card := PanelContainer.new()
	mid_card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mid_card.size_flags_stretch_ratio = 1.05
	mid_card.add_theme_stylebox_override("panel",
		UIStyle.card_style_xy(UIStyle.BG_CARD, UIStyle.BORDER_CARD, 14, 18, 16, 1))
	cols.add_child(mid_card)

	var mid := VBoxContainer.new()
	mid.add_theme_constant_override("separation", 8)
	mid_card.add_child(mid)

	m.meeting_title = UIStyle.label("发现尸体 · 投票", 16, Color.WHITE)
	m.meeting_title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	mid.add_child(m.meeting_title)

	m.meeting_hint = UIStyle.label("", 12, UIStyle.TEXT_DIM)
	m.meeting_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	mid.add_child(m.meeting_hint)

	var info_card := PanelContainer.new()
	info_card.name = "InfoCard"
	info_card.add_theme_stylebox_override("panel", UIStyle.row_line_style(UIStyle.DIVIDER, 8, 4))
	mid.add_child(info_card)
	m.meeting_info = UIStyle.label("", 13, UIStyle.TEXT_MAIN)
	m.meeting_info.add_theme_constant_override("line_spacing", 5)
	m.meeting_info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	info_card.add_child(m.meeting_info)

	var stage_row := PanelContainer.new()
	stage_row.add_theme_stylebox_override("panel", UIStyle.row_line_style(UIStyle.DIVIDER, 8, 4))
	mid.add_child(stage_row)
	var stage_hb := HBoxContainer.new()
	stage_row.add_child(stage_hb)
	var stage_lbl := UIStyle.label("阶段", 13, UIStyle.TEXT_SUB)
	stage_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stage_hb.add_child(stage_lbl)
	m.meeting_time = UIStyle.label("", 13, UIStyle.TEXT_GOLD)
	stage_hb.add_child(m.meeting_time)

	var skip_row := HBoxContainer.new()
	skip_row.add_theme_constant_override("separation", 10)
	mid.add_child(skip_row)
	m.meeting_skip = UIStyle.make_button("跳过讨论", func() -> void: m.sim.skip_discussion(),
		13, UIStyle.BG_BTN, UIStyle.BORDER_BTN, Vector2(128, 34), UIStyle.TEXT_MAIN)
	skip_row.add_child(m.meeting_skip)


static func _build_vote_col(m, cols: HBoxContainer) -> void:
	var right_card := PanelContainer.new()
	right_card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_card.size_flags_stretch_ratio = 0.95
	right_card.add_theme_stylebox_override("panel",
		UIStyle.card_style_xy(UIStyle.BG_CARD, UIStyle.BORDER_CARD, 14, 18, 16, 1))
	cols.add_child(right_card)

	var right := VBoxContainer.new()
	right.add_theme_constant_override("separation", 8)
	right_card.add_child(right)

	right.add_child(UIStyle.label("投票", 12, UIStyle.TEXT_SUB))

	var list_scroll := ScrollContainer.new()
	list_scroll.custom_minimum_size = Vector2(0, 260)
	list_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	list_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	right.add_child(list_scroll)
	m.meeting_list_scroll = list_scroll

	m.meeting_list = VBoxContainer.new()
	m.meeting_list.add_theme_constant_override("separation", 8)
	m.meeting_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list_scroll.add_child(m.meeting_list)

	m.meeting_skip_vote = UIStyle.make_button("跳过投票（保留已选 · 结束倒计时）",
		func() -> void: m.sim.skip_vote(),
		12, UIStyle.BG_BTN, UIStyle.BORDER_BTN, Vector2(0, 32), UIStyle.TEXT_MAIN)
	right.add_child(m.meeting_skip_vote)

	var res_box := PanelContainer.new()
	res_box.name = "ResultBox"
	res_box.add_theme_stylebox_override("panel", UIStyle.row_line_style(UIStyle.DIVIDER, 8, 0))
	right.add_child(res_box)
	var res_scroll := ScrollContainer.new()
	res_scroll.custom_minimum_size = Vector2(0, 96)
	res_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	res_box.add_child(res_scroll)
	m.meeting_result = UIStyle.label("", 12, UIStyle.TEXT_CHAT)
	m.meeting_result.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	m.meeting_result.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	res_scroll.add_child(m.meeting_result)


static func build_room_options(m) -> void:
	if m.meeting_tpl_room == null or m.sim == null:
		return
	m.meeting_tpl_room.clear()
	m.meeting_tpl_room.add_item("不指定舱室")
	m.meeting_tpl_room.set_item_metadata(0, "")
	for r: Dictionary in (m.sim.map.get("rooms", []) as Array):
		var rid := String(r.get("id", ""))
		var idx: int = m.meeting_tpl_room.item_count
		m.meeting_tpl_room.add_item(String(r.get("name", rid)))
		m.meeting_tpl_room.set_item_metadata(idx, rid)
	var cor: int = m.meeting_tpl_room.item_count
	m.meeting_tpl_room.add_item("走廊")
	m.meeting_tpl_room.set_item_metadata(cor, "corridor")


static func build_tpl_targets(m) -> void:
	if m.meeting_tpl_target == null or m.sim == null:
		return
	m.meeting_tpl_target.clear()
	m.meeting_tpl_target.add_item("— 选择对象 —")
	m.meeting_tpl_target.set_item_metadata(0, -1)
	for a: Dictionary in m.sim.agents:
		var i := int(a.get("i", -1))
		if i == int(m.sim.me_idx) or not bool(a.get("alive", false)):
			continue
		var idx: int = m.meeting_tpl_target.item_count
		m.meeting_tpl_target.add_item("%02d %s" % [i + 1, String(a.get("name", "?"))])
		m.meeting_tpl_target.set_item_metadata(idx, i)
	m.meeting_tpl_target.select(0)


static func reset_tpl_room_and_when(m) -> void:
	if m.meeting_tpl_room != null and m.meeting_tpl_room.item_count > 0:
		m.meeting_tpl_room.select(0)
	if m.meeting_tpl_when != null and m.meeting_tpl_when.item_count > 0:
		m.meeting_tpl_when.select(0)


static func _selected_meta_int(ob: OptionButton, fallback: int = -1) -> int:
	if ob == null or ob.selected < 0:
		return fallback
	var md: Variant = ob.get_item_metadata(ob.selected)
	return int(md) if md != null else fallback


static func _selected_meta_str(ob: OptionButton) -> String:
	if ob == null or ob.selected < 0:
		return ""
	var md: Variant = ob.get_item_metadata(ob.selected)
	return String(md) if md != null else ""


static func _is_pipe_room(m, rid: String) -> bool:
	if rid == "" or m.sim == null:
		return false
	for p: Dictionary in (m.sim.map.get("pipes", []) as Array):
		if String(p.get("room", "")) == rid:
			return true
	return false


static func template_text(m, kind: String, t: Dictionary, rid: String, when: String = "") -> String:
	var tag := ""
	if not t.is_empty():
		tag = "%02d %s" % [int(t.get("i", 0)) + 1, String(t.get("name", ""))]
	var rn := ""
	if rid == "corridor":
		rn = "走廊"
	elif rid != "":
		rn = m.sim.room_name(rid)
	var when_word: String = m.sim.speech._when_word() if m.sim.speech != null else "今晚"
	var lead := "我刚才在"
	if when == "night":
		lead = "我一整晚都在"
	elif when != "recent":
		lead = "我%s在" % when_word
	if kind == "where":
		return lead + (rn if rn != "" else "走廊") + "干活" \
			+ ("，手都没停过" if when == "night" else "")
	if kind == "deny":
		if rn == "":
			return "不是我"
		return "不是我，" + lead + rn + ("，哪儿也没去" if when == "night" else "")
	if t.is_empty():
		return ""
	match kind:
		"accuse":
			return "我怀疑%s，先说给大伙听" % tag
		"vote":
			return "这票我投%s" % tag
		"support":
			return "我可以为%s作证，他干的是正经事" % tag
		"wronglead":
			return "我怀疑%s，他反复带节奏，话不能信" % tag
		"grateful":
			return "上次我为%s作证，这次他的说法对不上" % tag
		"pipe":
			var at := ("，就在%s" % rn) if (rn != "" and _is_pipe_room(m, rid)) else ""
			return "我亲眼看见%s 钻管道%s" % [tag, at]
		"red":
			return "我亲眼看见%s 身上有红光%s" % [tag, ("，就在%s" % rn) if rn != "" else ""]
		"knife":
			return "我亲眼看见%s 出刀%s" % [tag, ("，就在%s" % rn) if rn != "" else ""]
		"sabotage":
			return "我亲眼看见%s 破坏设备%s" % [tag, ("，就在%s" % rn) if rn != "" else ""]
		"bot":
			return "我亲眼看见%s 把机器人停摆%s" % [tag, ("，就在%s" % rn) if rn != "" else ""]
		"breaker":
			return "我亲眼看见%s 拉闸%s" % [tag, ("，就在%s" % rn) if rn != "" else ""]
	return ""


static func on_template(m, kind: String) -> void:
	if m.sim == null or m.sim.speech == null or m.sim.meeting.is_empty():
		return
	if String(m.sim.meeting.get("phase", "")) != "discuss":
		return
	if not can_act_now(m):
		return
	var need_t := kind != "where" and kind != "deny"
	var ti := _selected_meta_int(m.meeting_tpl_target, -1)
	if need_t and ti < 0:
		m._toast("先选对象")
		return
	var rid := _selected_meta_str(m.meeting_tpl_room)
	if rid == "" and (kind == "where" or kind == "deny"):
		var me: Dictionary = m.sim.me()
		if not me.is_empty():
			rid = m.sim.room_at(me.get("pos", Vector2.ZERO))
	if kind == "where" and rid == "":
		rid = "corridor"
	var when := _selected_meta_str(m.meeting_tpl_when)
	var text := template_text(m, kind, m.sim.agent(ti), rid, when)
	if text != "":
		on_player_say(m, text)


static func can_act_now(m) -> bool:
	if m.sim == null:
		return false
	var a: Dictionary = m.sim.me()
	return not a.is_empty() and bool(a.get("alive", true)) \
		and not bool(a.get("downed", false)) and not bool(a.get("detained", false)) \
		and not bool(m.sim.spectator)


static func _feed_at_bottom(m) -> bool:
	if m.meeting_feed == null:
		return true
	var sb: VScrollBar = m.meeting_feed.get_v_scroll_bar()
	return sb == null or sb.value + sb.page >= sb.max_value - 24.0


static func on_feed_scroll(m) -> void:
	if _feed_at_bottom(m) and m._meeting_unread != 0:
		m._meeting_unread = 0
		update_new_btn(m)


static func update_new_btn(m) -> void:
	if m.meeting_new_btn == null:
		return
	m.meeting_new_btn.visible = m._meeting_unread > 0
	m.meeting_new_btn.text = "↓ %d 条新发言" % m._meeting_unread


static func jump_feed_bottom(m) -> void:
	if m.meeting_feed == null:
		return
	m._meeting_unread = 0
	update_new_btn(m)
	m.meeting_feed.scroll_to_line(maxi(0, m.meeting_feed.get_line_count() - 1))


static func _escape_bbcode(s: String) -> String:
	return s.replace("[", "[lb]")


static func append_feed_new(m) -> void:
	if m.meeting_feed == null or m.sim == null or m.sim.speech == null:
		return
	if m._meeting_feed_synced < m._meeting_feed_start:
		m._meeting_feed_synced = m._meeting_feed_start
	var total: int = m.sim.speech.feed.size()
	if total <= m._meeting_feed_synced:
		return
	var at_bottom := _feed_at_bottom(m)
	var added := 0
	var mine_added := false
	var me_a: Dictionary = m.sim.me()
	var me_name := String(me_a.get("name", ""))
	var me_tag := "%02d %s" % [int(m.sim.me_idx) + 1, me_name]
	for k in range(m._meeting_feed_synced, total):
		var l: Dictionary = m.sim.speech.feed[k]
		var who := _escape_bbcode(String(l.get("who", "")))
		var txt := _escape_bbcode(String(l.get("text", "")))
		var is_sys := bool(l.get("sys", false))
		var is_me := bool(l.get("me", false))
		var hit := not is_sys and not is_me and me_name != "" \
			and (txt.find(me_name) >= 0 or txt.find(me_tag) >= 0)
		var who_col := "#8FA6C0"
		var txt_col := "#C9D1DB"
		if is_sys:
			who_col = "#7C8798"
			txt_col = "#7C8798"
		elif is_me:
			who_col = "#F0C674"
			mine_added = true
		elif hit:
			txt_col = "#FFE0A3"
		var prefix := "[color=#F0C674]▌[/color] " if hit else ""
		m.meeting_feed.append_text("%s[color=%s]%s[/color]  [color=%s]%s[/color]\n" % [
			prefix, who_col, who, txt_col, txt])
		added += 1
	m._meeting_feed_synced = total
	if at_bottom or mine_added:
		jump_feed_bottom(m)
		if mine_added:
			m._meeting_unread = 0
			update_new_btn(m)
	else:
		m._meeting_unread += added
		update_new_btn(m)


static func _say_cd_left_sec(m) -> float:
	var until := int(m._say_cd_until_ms)
	if until <= 0:
		return 0.0
	var now := Time.get_ticks_msec()
	if now >= until:
		return 0.0
	return float(until - now) / 1000.0


static func refresh(m) -> void:
	if m.sim == null or (m.meeting_panel == null and m.sim.meeting.is_empty()):
		return
	var active: bool = not m.sim.meeting.is_empty()
	if not active:
		if m._meeting_open:
			m._meeting_open = false
			m._say_cd_until_ms = 0
			if m.meeting_panel != null:
				m.meeting_panel.visible = false
			m._meeting_unread = 0
			if m.player != null:
				m.player.ui_locked = false
		return
	if not m._meeting_open:
		build(m)
		m._meeting_open = true
		m._say_cd_until_ms = 0
		m.meeting_panel.visible = true
		if m.player != null:
			m.player.ui_locked = true
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		build_tpl_targets(m)
		reset_tpl_room_and_when(m)
		build_buttons(m)
		m.meeting_feed.clear()
		m._meeting_feed_start = m.sim.speech.meeting_feed_start if m.sim.speech != null else 0
		m._meeting_feed_synced = m._meeting_feed_start
		m._meeting_unread = 0
		update_new_btn(m)
		if not can_act_now(m) and m.sim.speech != null:
			var who := "旁观者" if m.sim.spectator else String(m.sim.me().get("name", "你"))
			var txt := "（旁观）只读观战，不参与讨论与投票。" if m.sim.spectator else "（幽灵）我在看着。"
			m.sim.speech.sys_say(who, txt)
		append_feed_new(m)
	_refresh_controls(m)
	_refresh_vote_buttons(m)
	_refresh_header_labels(m)
	append_feed_new(m)


static func _refresh_controls(m) -> void:
	var phase := String(m.sim.meeting.get("phase", "vote"))
	var can_act := can_act_now(m)
	var mkind := String(m.sim.meeting.get("kind", "night"))
	m.meeting_skip.visible = phase == "discuss" and (can_act or m.sim.spectator)
	m.meeting_skip.text = "跳过讨论（旁观）" if m.sim.spectator else "跳过讨论"
	var cd_left := _say_cd_left_sec(m)
	var can_say := can_act and phase == "discuss" and cd_left <= 0.0
	m.meeting_input.editable = can_say
	m.meeting_send.disabled = not can_say
	m.meeting_send.text = "发送"
	if phase == "discuss":
		if not can_act:
			m.meeting_input.placeholder_text = "旁观者只读" if m.sim.spectator else "幽灵只能旁观"
		elif cd_left > 0.0:
			m.meeting_input.placeholder_text = "发言冷却 %.1fs…" % cd_left
		else:
			m.meeting_input.placeholder_text = "自由发言，回车发送"
	elif phase == "vote":
		m.meeting_input.placeholder_text = "投票中…"
	else:
		m.meeting_input.placeholder_text = "投票已结束"
	m.meeting_tpl.visible = phase == "discuss" and can_act
	m.meeting_list.visible = mkind != "pre" and can_act and (phase == "discuss" or phase == "vote")
	m.meeting_skip_vote.visible = mkind != "pre" and can_act and phase == "vote"
	var show_info := int(m.sim.meeting.get("victim", -1)) >= 0
	m.meeting_info.visible = show_info
	var info_card := m.meeting_info.get_parent() as Control
	if info_card != null:
		info_card.visible = show_info
	var itxt := info_text(m) if show_info else ""
	if m.meeting_info.text != itxt:
		m.meeting_info.text = itxt


static func _is_mate_visible(m, target_i: int) -> bool:
	if m.sim == null:
		return false
	var me_a: Dictionary = m.sim.me()
	if not bool(me_a.get("alien", false)):
		return false
	if m.sim.mind != null:
		return bool(m.sim.mind._is_mate(me_a, target_i))
	var mates: Dictionary = me_a.get("mates", {}) as Dictionary
	return mates.has(target_i)


static func _refresh_vote_buttons(m) -> void:
	var phase := String(m.sim.meeting.get("phase", "vote"))
	var can_act := can_act_now(m)
	var votes: Dictionary = m.sim.meeting.get("votes", {})
	var cur := int(votes.get(m.sim.me_idx, -2))
	var voting := can_act and (phase == "discuss" or phase == "vote")
	var reveal := bool(m.sim.reveal_all)
	var dev_view := bool(m.sim.dev) or bool(m.sim.spectator)
	for k: int in m.meeting_buttons.keys():
		var b: Button = m.meeting_buttons[k]
		var ma: Dictionary = m.sim.agent(k)
		var is_mate := _is_mate_visible(m, k)
		var tag := ("[内鬼] " if bool(ma.get("alien", false)) else "[人类] ") if dev_view else ""
		var suffix := ""
		if reveal and not dev_view:
			suffix = " · 内鬼" if bool(ma.get("alien", false)) else " · 人类"
		if is_mate:
			suffix += " ◆同族"
		var bt := "%02d %s%s%s" % [k + 1, tag, String(ma.get("name", "?")), suffix]
		if b.text != bt:
			b.text = bt
		_paint_vote_btn(b, k == cur, is_mate)
		b.disabled = not voting
	if m.meeting_abstain != null:
		_paint_vote_btn(m.meeting_abstain, cur == -1, false)
		m.meeting_abstain.disabled = not voting


static func _paint_vote_btn(b: Button, selected: bool, is_mate: bool) -> void:
	var bg := Color(0.24, 0.18, 0.06, 0.95) if selected else (
		Color(0.18, 0.047, 0.047, 0.94) if is_mate else UIStyle.BG_BTN)
	var bd := UIStyle.BORDER_GOLD if selected else (
		Color.html("#7A2A2A") if is_mate else UIStyle.BORDER_BTN)
	var tc := UIStyle.TEXT_GOLD if selected else (
		UIStyle.TEXT_RED if is_mate else UIStyle.TEXT_MAIN)
	var sb := b.get_theme_stylebox("normal") as StyleBoxFlat
	if sb == null or sb.border_color != bd or sb.bg_color != bg:
		UIStyle.apply_button(b, bg, bd, 12, 8, 11, 6, tc, true)


static func _refresh_header_labels(m) -> void:
	var phase := String(m.sim.meeting.get("phase", "vote"))
	var left := maxf(0.0, float(m.sim.meeting.get("t", 0.0)))
	var mkind := String(m.sim.meeting.get("kind", "night"))
	var votes: Dictionary = m.sim.meeting.get("votes", {})
	var mtitle := "第 %d 夜 · 发现尸体 · 讨论" % int(m.sim.night)
	var vtitle := "第 %d 夜 · 投票" % int(m.sim.night)
	if mkind == "pre":
		mtitle = "第 1 天 · 开局公开讨论"
		vtitle = "第 1 天 · 投票"
	elif mkind == "day":
		mtitle = "第 %d 天 · 全员会议 · 讨论" % int(m.sim.night)
		vtitle = "第 %d 天 · 投票" % int(m.sim.night)
	if phase == "discuss":
		m.meeting_title.text = mtitle
		m.meeting_time.text = "讨论 %.0fs · %d 条发言" % [left,
			(m.sim.speech.feed.size() if m.sim.speech != null else 0)]
		m.meeting_hint.text = "开局航行简报 · 点击『跳过讨论』立即进入第 1 夜" if mkind == "pre" else "可自由发言或选模板，也可直接预设投票目标"
		m.meeting_result.text = ""
	elif phase == "vote":
		m.meeting_title.text = vtitle
		m.meeting_time.text = "投票 %.1fs" % left
		m.meeting_hint.text = "点击席位投票（可改票），到点按票数驱逐"
		m.meeting_result.text = "当前已投 %d 票" % votes.size()
	else:
		m.meeting_title.text = "投票结果"
		m.meeting_time.text = "公布 %.0fs" % left
		m.meeting_hint.text = ""
		m.meeting_result.text = result_text(m)
	var res_box := m.meeting_result.get_parent().get_parent() as Control
	if res_box != null and res_box.name == "ResultBox":
		res_box.visible = m.meeting_result.text != ""


static func info_text(m) -> String:
	if m.sim == null or m.sim.meeting.is_empty():
		return ""
	var victim_i := int(m.sim.meeting.get("victim", -1))
	if victim_i < 0:
		return ""
	var rid := String(m.sim.meeting.get("room", ""))
	var room_label := "未知位置"
	if rid != "":
		room_label = m.sim.room_name(rid)
	elif bool(m.sim.meeting.get("in_corr", false)):
		room_label = "走廊"
	var rep_i := int(m.sim.meeting.get("reporter", -1))
	var v: Dictionary = m.sim.agent(victim_i)
	var alive := bool(v.get("alive", false))
	return "报告地点：%s\n发起报告：%s\n伤者：%s · %s" % [
		room_label, m._tag_name(rep_i), m._tag_name(victim_i),
		"濒死者" if alive else "死者"]


static func on_player_say(m, text: String) -> void:
	if m.sim == null or m.sim.speech == null or m.sim.meeting.is_empty():
		return
	if String(m.sim.meeting.get("phase", "")) != "discuss":
		return
	if m.sim.spectator:
		return
	var me: Dictionary = m.sim.me()
	if me.is_empty():
		return
	if not bool(me.get("alive", true)) or bool(me.get("downed", false)) \
			or bool(me.get("detained", false)):
		m._toast("你现在不能发言")
		return
	var left := _say_cd_left_sec(m)
	if left > 0.0:
		m._toast("发言冷却 %.1fs，请稍候" % left)
		return
	if text.strip_edges() == "":
		return
	if m.meeting_input != null:
		m.meeting_input.clear()
	m.sim.speech.player_say(text)
	m._say_cd_until_ms = Time.get_ticks_msec() + SAY_CD_MS
	append_feed_new(m)


static func result_text(m) -> String:
	var r: Dictionary = m.sim.meeting.get("result", {}) as Dictionary
	if r.is_empty():
		return ""
	var tally: Dictionary = r.get("votes", {}) as Dictionary
	var matrix: Dictionary = r.get("matrix", {}) as Dictionary
	var abstain := 0
	for k in matrix.keys():
		if int(matrix[k]) < 0:
			abstain += 1
	var rows: Array = []
	for k in tally.keys():
		rows.append([int(k), int(tally[k])])
	rows.sort_custom(func(x, y): return int(x[1]) > int(y[1]))
	var lines: Array = ["投票结果（过程不可见）"]
	for row: Array in rows:
		lines.append("%s  %d 票" % [m._tag_name(int(row[0])), int(row[1])])
	lines.append("弃权  %d 票" % abstain)
	var top := int(r.get("ejected", -1))
	var mx := int(r.get("max", 0))
	var need := int(r.get("need", 4))
	if bool(r.get("devSaved", false)):
		lines.append("DEV 无敌：最高票 %d 指向你，驱逐无效" % mx)
	elif top >= 0:
		lines.append("驱逐 %s —— %d 票，唯一最高票且达到 %d 票门槛" % [
			m._tag_name(top), mx, need])
		lines.append("身份：%s" % ("内鬼" if bool(r.get("alien", false)) else "人类"))
	elif mx < need:
		lines.append("最高票 %d 票，未达 %d 票门槛 ⇒ 无人出局" % [mx, need])
	else:
		lines.append("最高票 %d 票但有平票 ⇒ 无人出局" % mx)
	return "\n".join(lines)


static func build_buttons(m) -> void:
	if m.meeting_list == null:
		return
	for c in m.meeting_list.get_children():
		c.queue_free()
	m.meeting_buttons.clear()
	m.meeting_abstain = null
	if m.sim == null:
		return
	var flow := HFlowContainer.new()
	flow.add_theme_constant_override("h_separation", 8)
	flow.add_theme_constant_override("v_separation", 8)
	flow.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	m.meeting_list.add_child(flow)
	for a: Dictionary in m.sim.agents:
		if not bool(a.get("alive", false)):
			continue
		var i := int(a.get("i", -1))
		if i == int(m.sim.me_idx):
			continue
		var b := UIStyle.make_button("%02d %s" % [i + 1, String(a.get("name", "?"))],
			func() -> void: m.sim.cast_vote(int(m.sim.me_idx), i),
			12, UIStyle.BG_BTN, UIStyle.BORDER_BTN)
		UIStyle.apply_button(b, UIStyle.BG_BTN, UIStyle.BORDER_BTN, 12, 8, 11, 6, UIStyle.TEXT_MAIN, true)
		flow.add_child(b)
		m.meeting_buttons[i] = b
	m.meeting_abstain = UIStyle.make_button("弃权（不投任何人）",
		func() -> void: m.sim.cast_vote(int(m.sim.me_idx), -1),
		12, UIStyle.BG_BTN, UIStyle.BORDER_BTN, Vector2(0, 32), UIStyle.TEXT_SUB)
	m.meeting_abstain.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	m.meeting_list.add_child(m.meeting_abstain)
