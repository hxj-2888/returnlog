extends RefCounted
## 局内常驻 HUD 与结算页构建/刷新（对齐 2D 原版单盒左上 #hud、暖琥珀 #tip 与紧凑结算卡）。

const UIStyle := preload("res://scripts/ui/ui_style.gd")


static func build(m) -> void:
	var layer := CanvasLayer.new()
	layer.layer = 1
	m.add_child(layer)
	m.hud_layer = layer

	var modal := CanvasLayer.new()
	modal.layer = 8
	m.add_child(modal)
	m.modal_layer = modal

	var tlayer := CanvasLayer.new()
	tlayer.layer = 50
	m.add_child(tlayer)
	m.toast_layer = tlayer

	_build_left_card(m, layer)
	_build_minimap_corner(m, layer)
	_build_bottom_widgets(m, layer, tlayer)
	_build_settle(m, modal)
	m._build_dev_panel()
	refresh_sim(m)


static func _build_left_card(m, layer: CanvasLayer) -> void:
	var card := PanelContainer.new()
	card.anchor_left = 0.0
	card.anchor_top = 0.0
	card.offset_left = 14.0
	card.offset_top = 12.0
	card.offset_right = 296.0
	card.custom_minimum_size = Vector2(248, 0)
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.add_theme_stylebox_override("panel",
		UIStyle.card_style_xy(UIStyle.BG_PANEL, UIStyle.BORDER_HUD, 10, 12, 9, 1))
	layer.add_child(card)
	m.hud_bg = card

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 3)
	vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.add_child(vb)

	var prog_row := HBoxContainer.new()
	prog_row.add_theme_constant_override("separation", 4)
	prog_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vb.add_child(prog_row)
	prog_row.add_child(UIStyle.label("维修", 13, UIStyle.TEXT_MAIN))
	m.prog_label = UIStyle.label("0 / 48", 13, UIStyle.TEXT_GOLD)
	prog_row.add_child(m.prog_label)

	m.prog_bar = ProgressBar.new()
	m.prog_bar.custom_minimum_size = Vector2(0, 6)
	m.prog_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	m.prog_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# 预创建绿/金两种进度条填充 StyleBox 供刷新时复用，避免反复 new()
	UIStyle.apply_progress(m.prog_bar, UIStyle.TEXT_GREEN)
	var sb_green := m.prog_bar.get_theme_stylebox("fill") as StyleBoxFlat
	var sb_gold := sb_green.duplicate() as StyleBoxFlat
	sb_gold.bg_color = UIStyle.TEXT_GOLD
	m.prog_bar.set_meta("_sb_green", sb_green)
	m.prog_bar.set_meta("_sb_gold", sb_gold)
	m.prog_bar.set_meta("_near_win", false)
	vb.add_child(m.prog_bar)

	var time_row := HBoxContainer.new()
	time_row.add_theme_constant_override("separation", 0)
	time_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vb.add_child(time_row)
	m.night_label = UIStyle.label("剩余 120s · 第 1 夜 · ", 12, UIStyle.TEXT_MAIN)
	time_row.add_child(m.night_label)
	m.power_label = UIStyle.label("照明正常", 12, UIStyle.TEXT_GOLD)
	time_row.add_child(m.power_label)

	var alive_row := HBoxContainer.new()
	alive_row.name = "AliveRow"
	alive_row.add_theme_constant_override("separation", 0)
	alive_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vb.add_child(alive_row)
	m.alive_label = UIStyle.label("存活 15", 12, UIStyle.TEXT_GOLD)
	alive_row.add_child(m.alive_label)
	alive_row.add_child(UIStyle.label(" · ", 12, UIStyle.TEXT_SUB))
	var hum_lb := UIStyle.label("人类 11", 12, UIStyle.TEXT_CYAN)
	hum_lb.name = "HumLabel"
	alive_row.add_child(hum_lb)
	m.hud_bg.set_meta("_hum_lb", hum_lb)
	alive_row.add_child(UIStyle.label(" · ", 12, UIStyle.TEXT_SUB))
	var ali_lb := UIStyle.label("内鬼 4", 12, UIStyle.TEXT_RED)
	ali_lb.name = "AliLabel"
	alive_row.add_child(ali_lb)
	m.hud_bg.set_meta("_ali_lb", ali_lb)

	m.role_label = UIStyle.label("", 12, UIStyle.TEXT_GOLD)
	m.role_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vb.add_child(m.role_label)

	m.report_label = UIStyle.label("", 12, UIStyle.TEXT_SUB)
	m.report_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vb.add_child(m.report_label)

	var sep := UIStyle.hr(Color.html("#2B3442"))
	vb.add_child(sep)

	m.tasks_label = UIStyle.label("本局任务 · 目标舱室", 11, UIStyle.TEXT_SUB)
	vb.add_child(m.tasks_label)

	m.task_rows = VBoxContainer.new()
	m.task_rows.add_theme_constant_override("separation", 2)
	m.task_rows.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vb.add_child(m.task_rows)

	m.dmg_panel = PanelContainer.new()
	m.dmg_panel.visible = false
	m.dmg_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.dmg_panel.add_theme_stylebox_override("panel",
		UIStyle.row_line_style(Color.html("#4A2320"), 6, 0))
	vb.add_child(m.dmg_panel)
	m.dmg_label = UIStyle.label("", 12, Color.html("#FF9A90"))
	m.dmg_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	m.dmg_panel.add_child(m.dmg_label)

	# 保留 feed_label 节点引用以兼容旧逻辑，不在左上角卡片渲染冗余黑框
	m.feed_label = UIStyle.label("", 11, UIStyle.TEXT_DIM)
	m.feed_label.visible = false
	layer.add_child(m.feed_label)


static func _build_minimap_corner(m, layer: CanvasLayer) -> void:
	m.minimap = m.MinimapScript.new()
	m.minimap.setup(m.map_data, m.sim)
	m.minimap.anchor_left = 1.0
	m.minimap.anchor_right = 1.0
	m.minimap.offset_left = -252.0
	m.minimap.offset_right = -12.0
	m.minimap.offset_top = 12.0
	m.minimap.offset_bottom = 12.0 + m.minimap.custom_minimum_size.y
	layer.add_child(m.minimap)

	m.room_label = UIStyle.label("中央会议室", 12, UIStyle.TEXT_CYAN)
	m.room_label.visible = false
	layer.add_child(m.room_label)


static func _build_bottom_widgets(m, layer: CanvasLayer, tlayer: CanvasLayer) -> void:
	# 左下角暖琥珀操作提示条（对齐 2D #tip）
	m.tip_panel = PanelContainer.new()
	m.tip_panel.anchor_left = 0.0
	m.tip_panel.anchor_top = 1.0
	m.tip_panel.anchor_bottom = 1.0
	m.tip_panel.offset_left = 14.0
	m.tip_panel.offset_right = 680.0
	m.tip_panel.offset_top = -46.0
	m.tip_panel.offset_bottom = -12.0
	m.tip_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var tip_sb := StyleBoxFlat.new()
	tip_sb.bg_color = Color(0.19, 0.12, 0.03, 0.94)
	tip_sb.border_color = Color.html("#B9892F")
	tip_sb.set_border_width_all(1)
	tip_sb.set_corner_radius_all(8)
	tip_sb.set_content_margin_all(0)
	m.tip_panel.add_theme_stylebox_override("panel", tip_sb)
	layer.add_child(m.tip_panel)

	var tip_shell := HBoxContainer.new()
	tip_shell.add_theme_constant_override("separation", 0)
	tip_shell.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.tip_panel.add_child(tip_shell)

	var left_bar := ColorRect.new()
	left_bar.color = Color.html("#FFB020")
	left_bar.custom_minimum_size = Vector2(4, 0)
	left_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tip_shell.add_child(left_bar)

	var tip_pad := MarginContainer.new()
	tip_pad.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tip_pad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tip_pad.add_theme_constant_override("margin_left", 8)
	tip_pad.add_theme_constant_override("margin_right", 12)
	tip_pad.add_theme_constant_override("margin_top", 6)
	tip_pad.add_theme_constant_override("margin_bottom", 6)
	tip_shell.add_child(tip_pad)

	var tip_hb := HBoxContainer.new()
	tip_hb.add_theme_constant_override("separation", 8)
	tip_hb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tip_pad.add_child(tip_hb)

	var op_badge := PanelContainer.new()
	op_badge.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var op_sb := StyleBoxFlat.new()
	op_sb.bg_color = Color.html("#FFB020")
	op_sb.set_border_width_all(0)
	op_sb.set_corner_radius_all(4)
	op_sb.content_margin_left = 6
	op_sb.content_margin_right = 6
	op_sb.content_margin_top = 1
	op_sb.content_margin_bottom = 1
	op_badge.add_theme_stylebox_override("panel", op_sb)
	tip_hb.add_child(op_badge)
	op_badge.add_child(UIStyle.label("操作", 11, Color.html("#1A1306")))

	var help := UIStyle.label("WASD 移动 · E 交互 · F 施救 · R 报告 · G 拖拽 · B/右键 开枪 · Esc 暂停",
		12, Color.html("#FFE0A3"))
	help.name = "HelpLabel"
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	help.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	help.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	tip_hb.add_child(help)
	m.tip_panel.set_meta("_help_lb", help)

	m.fps_label = UIStyle.label("", 11, UIStyle.TEXT_DIM)
	m.fps_label.anchor_left = 1.0
	m.fps_label.anchor_right = 1.0
	m.fps_label.anchor_top = 1.0
	m.fps_label.anchor_bottom = 1.0
	m.fps_label.offset_left = -90.0
	m.fps_label.offset_right = -12.0
	m.fps_label.offset_top = -28.0
	m.fps_label.offset_bottom = -10.0
	m.fps_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	layer.add_child(m.fps_label)

	m.prompt_label = UIStyle.label("", 13, UIStyle.TEXT_GOLD)
	m.prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	m.prompt_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	m.prompt_label.anchor_left = 0.5
	m.prompt_label.anchor_right = 0.5
	m.prompt_label.anchor_top = 1.0
	m.prompt_label.anchor_bottom = 1.0
	m.prompt_label.offset_left = -280.0
	m.prompt_label.offset_right = 280.0
	m.prompt_label.offset_top = -86.0
	m.prompt_label.offset_bottom = -56.0
	m.prompt_label.add_theme_stylebox_override("normal",
		UIStyle.pill_style(UIStyle.BG_PANEL, UIStyle.BORDER_HUD, 8, 14, 4))
	m.prompt_label.visible = false
	layer.add_child(m.prompt_label)

	m.station_panel = PanelContainer.new()
	m.station_panel.anchor_left = 0.5
	m.station_panel.anchor_right = 0.5
	m.station_panel.anchor_top = 1.0
	m.station_panel.anchor_bottom = 1.0
	m.station_panel.offset_left = -150.0
	m.station_panel.offset_right = 150.0
	m.station_panel.offset_top = -132.0
	m.station_panel.offset_bottom = -92.0
	m.station_panel.visible = false
	m.station_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.station_panel.add_theme_stylebox_override("panel",
		UIStyle.card_style_xy(UIStyle.BG_PANEL, UIStyle.BORDER_HUD, 8, 10, 7, 1))
	layer.add_child(m.station_panel)
	var st_vb := VBoxContainer.new()
	st_vb.add_theme_constant_override("separation", 4)
	m.station_panel.add_child(st_vb)
	m.station_label = UIStyle.label("操作中…", 12, UIStyle.TEXT_MAIN)
	m.station_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	st_vb.add_child(m.station_label)
	m.station_bar = ProgressBar.new()
	m.station_bar.custom_minimum_size = Vector2(270, 6)
	UIStyle.apply_progress(m.station_bar, UIStyle.TEXT_GREEN)
	st_vb.add_child(m.station_bar)

	# 拖拽按钮移至 -90..-58，与 station_panel(-132..-92) 错开避免重叠
	m.drag_btn = UIStyle.make_button("拖拽中 · 按 G 或点击放下", func() -> void: m._on_drag_drop(),
		12, Color(0.039, 0.055, 0.078, 0.88), Color.html("#4A3C1E"), Vector2(220, 28), UIStyle.TEXT_GOLD)
	m.drag_btn.anchor_left = 0.5
	m.drag_btn.anchor_right = 0.5
	m.drag_btn.anchor_top = 1.0
	m.drag_btn.anchor_bottom = 1.0
	m.drag_btn.offset_left = -110.0
	m.drag_btn.offset_right = 110.0
	m.drag_btn.offset_top = -90.0
	m.drag_btn.offset_bottom = -58.0
	m.drag_btn.visible = false
	layer.add_child(m.drag_btn)

	m.cd_panel = PanelContainer.new()
	m.cd_panel.anchor_left = 0.5
	m.cd_panel.anchor_right = 0.5
	m.cd_panel.anchor_top = 1.0
	m.cd_panel.anchor_bottom = 1.0
	m.cd_panel.offset_left = -160.0
	m.cd_panel.offset_right = 160.0
	m.cd_panel.offset_top = -162.0
	m.cd_panel.offset_bottom = -136.0
	m.cd_panel.visible = false
	m.cd_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.cd_panel.add_theme_stylebox_override("panel",
		UIStyle.pill_style(Color(0.16, 0.03, 0.03, 0.92), Color.html("#7A2A2A"), 8, 12, 3))
	layer.add_child(m.cd_panel)
	m.cd_label = UIStyle.label("", 12, UIStyle.TEXT_RED)
	m.cd_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	m.cd_panel.add_child(m.cd_label)

	# 提示条上移至 -208..-172，与 cd_panel(-162..-136) 错开避免重叠
	m.toast_label = UIStyle.label("", 14, UIStyle.TEXT_GOLD)
	m.toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	m.toast_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	m.toast_label.anchor_left = 0.5
	m.toast_label.anchor_right = 0.5
	m.toast_label.anchor_top = 1.0
	m.toast_label.anchor_bottom = 1.0
	m.toast_label.offset_left = -310.0
	m.toast_label.offset_right = 310.0
	m.toast_label.offset_top = -208.0
	m.toast_label.offset_bottom = -172.0
	m.toast_label.add_theme_stylebox_override("normal",
		UIStyle.pill_style(UIStyle.BG_CARD, UIStyle.BORDER_CARD, 8, 16, 6))
	m.toast_label.visible = false
	tlayer.add_child(m.toast_label)


static func _build_settle(m, modal: CanvasLayer) -> void:
	m.end_panel = ColorRect.new()
	m.end_panel.color = UIStyle.BG_OVERLAY
	m.end_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	m.end_panel.visible = false
	m.end_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	modal.add_child(m.end_panel)

	m.end_label = UIStyle.label("", 28, UIStyle.TEXT_GOLD)
	m.end_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	m.end_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	m.end_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	m.end_panel.add_child(m.end_label)

	m.settle_panel = ColorRect.new()
	m.settle_panel.color = UIStyle.BG_OVERLAY
	m.settle_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	m.settle_panel.visible = false
	m.settle_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	modal.add_child(m.settle_panel)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	m.settle_panel.add_child(center)

	var card := PanelContainer.new()
	card.custom_minimum_size = Vector2(560, 0)
	card.add_theme_stylebox_override("panel",
		UIStyle.card_style_xy(UIStyle.BG_CARD, UIStyle.BORDER_CARD, 14, 26, 22, 1))
	center.add_child(card)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	card.add_child(col)

	m.settle_title = UIStyle.label("", 18, Color.WHITE)
	m.settle_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	col.add_child(m.settle_title)
	m.settle_sub = UIStyle.label("", 12, UIStyle.TEXT_DIM)
	m.settle_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	m.settle_sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(m.settle_sub)
	m.settle_stats = UIStyle.label("", 12, UIStyle.TEXT_SUB)
	m.settle_stats.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	col.add_child(m.settle_stats)

	var settle_scroll := ScrollContainer.new()
	settle_scroll.custom_minimum_size = Vector2(508, 390)
	settle_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	settle_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(settle_scroll)

	var content := VBoxContainer.new()
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_theme_constant_override("separation", 6)
	settle_scroll.add_child(content)

	content.add_child(UIStyle.label("本局身份", 12, Color.html("#8EA0B5")))
	content.add_child(UIStyle.hr())
	m.settle_ids = RichTextLabel.new()
	m.settle_ids.bbcode_enabled = true
	m.settle_ids.fit_content = true
	m.settle_ids.scroll_active = false
	m.settle_ids.add_theme_font_override("normal_font", UIFont.get_font())
	m.settle_ids.add_theme_font_size_override("normal_font_size", 12)
	m.settle_ids.add_theme_color_override("default_color", UIStyle.TEXT_MAIN)
	m.settle_ids.add_theme_stylebox_override("normal", StyleBoxEmpty.new())
	content.add_child(m.settle_ids)

	content.add_child(UIStyle.label("谁投了谁", 12, Color.html("#8EA0B5")))
	content.add_child(UIStyle.hr())
	m.settle_votes = RichTextLabel.new()
	m.settle_votes.bbcode_enabled = true
	m.settle_votes.fit_content = true
	m.settle_votes.scroll_active = false
	m.settle_votes.add_theme_font_override("normal_font", UIFont.get_font())
	m.settle_votes.add_theme_font_size_override("normal_font_size", 12)
	m.settle_votes.add_theme_color_override("default_color", UIStyle.TEXT_MAIN)
	m.settle_votes.add_theme_stylebox_override("normal", StyleBoxEmpty.new())
	content.add_child(m.settle_votes)

	col.add_child(UIStyle.hr())
	var btns := HBoxContainer.new()
	btns.alignment = BoxContainer.ALIGNMENT_BEGIN
	btns.add_theme_constant_override("separation", 10)
	col.add_child(btns)
	btns.add_child(UIStyle.make_button("再来一局", m._restart_sim,
		13, UIStyle.BG_PRIMARY, UIStyle.BORDER_PRIMARY, Vector2(116, 34), UIStyle.TEXT_MAIN))
	btns.add_child(UIStyle.make_button("查看复盘",
		func() -> void: m.ui_panels.open_replay(m.sim.events, m.map_data, m.sim.replay_data()),
		13, UIStyle.BG_BTN, UIStyle.BORDER_BTN, Vector2(104, 34), UIStyle.TEXT_MAIN))


static func refresh_power(m) -> void:
	if m.power_label == null:
		return
	var st: int = int(m.sim.light_state) if m.sim != null else (0 if m.power_on else 2)
	var txt := "全船断电" if st == 2 else ("照明已修复" if st == 1 else "照明正常")
	if m.power_label.text != txt:
		m.power_label.text = txt
	if not m.power_label.has_meta("_last_st") or int(m.power_label.get_meta("_last_st")) != st:
		m.power_label.set_meta("_last_st", st)
		var col: Color = Color.html("#FF6B61") if st == 2 else (
			Color.html("#7FE3B4") if st == 1 else UIStyle.TEXT_GOLD)
		m.power_label.add_theme_color_override("font_color", col)


static func refresh_sim(m) -> void:
	if m.sim == null or m.sim.agents.is_empty() or m.night_label == null:
		return
	if m.audio != null:
		m.audio.set_volume(m.ui_panels.get_sfx())
	_refresh_top_bar(m)
	var a: Dictionary = m.sim.me()
	if a.is_empty():
		return
	_refresh_tip(m, a)
	m.qual_pending = int(a.get("qualPending", 0))
	m.qual = int(a.get("qual", 0))
	_refresh_left_card(m, a)
	if m.sim.over:
		show_end(m)
	elif not bool(a.get("alive", true)):
		m._player_dead = false
		if m.end_panel != null and m.end_panel.visible:
			m.end_panel.visible = false
	elif bool(a.get("downed", false)) and not m._down_toast:
		m._down_toast = true
		m._toast("你已濒死 · 天亮前没人救就会死（可被拖进医疗间 / 医疗包 / 无人机救起）")
	tick_live(m)


static func _refresh_top_bar(m) -> void:
	var term_n: int = int(((m.sim.cfg.get("rules", {}) as Dictionary).get("TERMINATOR", {}) as Dictionary).get("night", 9))
	var is_term: bool = int(m.sim.night) >= term_n or bool(m.sim.terminator_on)
	var n_txt := "剩余 %.0fs · 第 %d 夜%s · " % [
		maxf(0.0, float(m.sim.t)), int(m.sim.night), " 终结" if is_term else ""]
	if m.night_label.text != n_txt:
		m.night_label.text = n_txt
	if not m.night_label.has_meta("_is_term") or bool(m.night_label.get_meta("_is_term")) != is_term:
		m.night_label.set_meta("_is_term", is_term)
		m.night_label.add_theme_color_override("font_color", UIStyle.TEXT_RED if is_term else UIStyle.TEXT_MAIN)
	var cur_p: int = int(m.sim.prog)
	var win_p: int = maxi(1, int(m.sim.win_pts()))
	var near_win: bool = cur_p * 4 >= win_p * 3
	if m.prog_bar != null:
		m.prog_bar.max_value = float(win_p)
		m.prog_bar.value = float(mini(cur_p, win_p))
		if not m.prog_bar.has_meta("_near_win") or bool(m.prog_bar.get_meta("_near_win")) != near_win:
			m.prog_bar.set_meta("_near_win", near_win)
			var sb_key := "_sb_gold" if near_win else "_sb_green"
			var sb: StyleBoxFlat = m.prog_bar.get_meta(sb_key) as StyleBoxFlat if m.prog_bar.has_meta(sb_key) else null
			if sb != null:
				m.prog_bar.add_theme_stylebox_override("fill", sb)
			else:
				UIStyle.apply_progress(m.prog_bar, UIStyle.TEXT_GOLD if near_win else UIStyle.TEXT_GREEN)
	var p_txt := "%d / %d" % [cur_p, win_p]
	if m.prog_label.text != p_txt:
		m.prog_label.text = p_txt
	var hum := 0
	var ali := 0
	for x: Dictionary in m.sim.agents:
		if not bool(x.get("alive", false)):
			continue
		if bool(x.get("alien", false)):
			ali += 1
		else:
			hum += 1
	var a_txt := "存活 %d" % [hum + ali]
	if m.alive_label.text != a_txt:
		m.alive_label.text = a_txt
	if m.hud_bg != null:
		var hum_lb: Label = m.hud_bg.get_meta("_hum_lb") as Label if m.hud_bg.has_meta("_hum_lb") else null
		if hum_lb == null:
			hum_lb = m.hud_bg.find_child("HumLabel", true, false) as Label
			m.hud_bg.set_meta("_hum_lb", hum_lb)
		var ali_lb: Label = m.hud_bg.get_meta("_ali_lb") as Label if m.hud_bg.has_meta("_ali_lb") else null
		if ali_lb == null:
			ali_lb = m.hud_bg.find_child("AliLabel", true, false) as Label
			m.hud_bg.set_meta("_ali_lb", ali_lb)
		var h_txt := "人类 %d" % hum
		if hum_lb != null and hum_lb.text != h_txt:
			hum_lb.text = h_txt
		var l_txt := "内鬼 %d" % ali
		if ali_lb != null and ali_lb.text != l_txt:
			ali_lb.text = l_txt
	refresh_power(m)


static func _refresh_tip(m, a: Dictionary) -> void:
	if m.tip_panel == null:
		return
	var help_lbl: Label = m.tip_panel.get_meta("_help_lb") as Label if m.tip_panel.has_meta("_help_lb") else null
	if help_lbl == null:
		help_lbl = m.tip_panel.find_child("HelpLabel", true, false) as Label
		m.tip_panel.set_meta("_help_lb", help_lbl)
	if help_lbl == null:
		return
	var txt := ""
	if bool(m.sim.spectator):
		txt = "WASD 移动 · 空格/Ctrl 升降 · 鼠标环视 · Esc 暂停 · P 设置"
	elif float(a.get("stunT", 0.0)) > 0.0:
		txt = "刚被无人机救起：%.0fs 内不可移动 · E 仍可交互" % ceilf(float(a.get("stunT", 0.0)))
	elif bool(a.get("detained", false)):
		txt = "被保安机器人拘留：%.0fs 后自动释放 · 当前无法移动" % ceilf(float(a.get("detainedT", 0.0)))
	elif bool(a.get("downed", false)):
		txt = "你已濒死：等待队友按 F 施救，或被拖进医疗间救起"
	elif bool(a.get("ghost", false)):
		txt = "幽灵态 · WASD 穿墙移动 · E 维修任务（剩余额度 %d 分）· Esc 暂停" % maxi(0, m.sim.ghost_cap() - int(a.get("ghostPts", 0)))
	elif not m.sim.sab_target.is_empty() and bool(a.get("alien", false)):
		var srid := String(m.sim.sab_target.get("room", ""))
		txt = "破坏目标：%s · 进入舱室自动下手 · 30s 内可被修复" % m.sim.room_name(srid)
	elif bool(a.get("alien", false)):
		txt = "WASD 移动 · E 交互 · 左键出刀 · Q 管道 · H 破坏 · R 报告 · G 拖拽 · B/右键 开枪"
	else:
		txt = "WASD 移动 · E 交互/任务 · F 施救 · R 报告 · G 拖拽 · B/右键 开枪 · Esc 暂停"
	if help_lbl.text != txt:
		help_lbl.text = txt


static func _refresh_left_card(m, a: Dictionary) -> void:
	if bool(m.sim.spectator):
		if m.role_label.text != "你是 旁观者 · 第 16 人（全知视角）":
			m.role_label.text = "你是 旁观者 · 第 16 人（全知视角）"
		if not m.role_label.has_meta("_role_mode") or String(m.role_label.get_meta("_role_mode")) != "spec":
			m.role_label.set_meta("_role_mode", "spec")
			m.role_label.add_theme_color_override("font_color", UIStyle.TEXT_CYAN)
		if m.report_label.text != "自由穿墙漫游 · 不参与任务与投票":
			m.report_label.text = "自由穿墙漫游 · 不参与任务与投票"
		if m.tasks_label.text != "旁观模式":
			m.tasks_label.text = "旁观模式"
		_rebuild_task_rows(m, [], 0, true)
	else:
		var seat := int(m.sim.me_idx) + 1
		var nm := String(a.get("name", "?"))
		var is_alien := bool(a.get("alien", false))
		var camp := "内鬼" if is_alien else "人类"
		var state_tag := ""
		if not bool(a.get("alive", true)):
			state_tag = " · 幽灵"
		elif bool(a.get("downed", false)):
			state_tag = " · 濒死"
		elif bool(a.get("detained", false)):
			state_tag = " · 被拘留 %.0fs" % ceilf(float(a.get("detainedT", 0.0)))
		var role_txt := "你是 %02d %s · %s%s" % [seat, nm, camp, state_tag]
		if m.role_label.text != role_txt:
			m.role_label.text = role_txt
		var rmode := "alien" if is_alien else "human"
		if not m.role_label.has_meta("_role_mode") or String(m.role_label.get_meta("_role_mode")) != rmode:
			m.role_label.set_meta("_role_mode", rmode)
			m.role_label.add_theme_color_override("font_color",
				UIStyle.TEXT_RED if is_alien else UIStyle.TEXT_GOLD)

		var meet_cfg: Dictionary = (m.sim.cfg.get("rules", {}) as Dictionary).get("MEET", {}) as Dictionary
		var per_night := int(meet_cfg.get("perNight", 2))
		var nm_cnt := int(m.sim.night_meets)
		var pend := int(a.get("qualPending", 0))
		var pend_txt := " · 回圆桌领取" if pend > 0 else ""
		var tasks_arr: Array = a.get("tasks", []) as Array
		var done_cnt: int = mini(int(a.get("tIdx", 0)), tasks_arr.size())
		var rep_txt := "任务 %d/%d · 申请单 %d · 待领 %d · 弹 %d · 包 %d · 报告 %d/2 · 会议 %d/%d%s" % [
			done_cnt, tasks_arr.size(), int(a.get("qual", 0)), pend,
			int(a.get("bullet", 0)), int(a.get("medkit", 0)),
			int(a.get("reportLeft", 0)), nm_cnt, per_night, pend_txt]
		if m.report_label.text != rep_txt:
			m.report_label.text = rep_txt
		var rep_col_key := 2 if nm_cnt >= per_night else (1 if pend > 0 else 0)
		if not m.report_label.has_meta("_rep_col") or int(m.report_label.get_meta("_rep_col")) != rep_col_key:
			m.report_label.set_meta("_rep_col", rep_col_key)
			m.report_label.add_theme_color_override("font_color",
				UIStyle.TEXT_RED if rep_col_key == 2 else (UIStyle.TEXT_GOLD if rep_col_key == 1 else UIStyle.TEXT_MAIN))
		if m.tasks_label.text != "本局任务 · 目标舱室":
			m.tasks_label.text = "本局任务 · 目标舱室"
		_rebuild_task_rows(m, tasks_arr, int(a.get("tIdx", 0)), false)

	if m.dmg_panel != null:
		if m.sim.dmg.is_empty():
			m.dmg_panel.visible = false
		else:
			var parts: Array = []
			for d: Dictionary in m.sim.dmg:
				parts.append("⚠ 故障 · %s「%s」 %ds" % [
					m.sim.room_name(String(d.get("room", ""))),
					String(d.get("label", "")),
					maxi(0, int(ceilf(float(d.get("left", 0.0)))))])
			var d_txt := "\n".join(parts)
			if m.dmg_label.text != d_txt:
				m.dmg_label.text = d_txt
			m.dmg_panel.visible = true

	var ftxt := event_feed(m)
	if m.feed_label.text != ftxt:
		m.feed_label.text = ftxt


static func _rebuild_task_rows(m, tasks: Array, t_idx: int, spectator: bool) -> void:
	if m.task_rows == null:
		return
	# 签名脏检查：仅 tIdx / 旁观态 / 任务列表变化时才销毁重建任务行
	var th := 0
	for tk: Variant in tasks:
		th = th * 31 + int(tk) + 1
	var sig := "%d|%s|%d|%d" % [t_idx, str(spectator), tasks.size(), th]
	if m.task_rows.has_meta("_task_sig") and String(m.task_rows.get_meta("_task_sig")) == sig and m.task_rows.get_child_count() > 0:
		return
	m.task_rows.set_meta("_task_sig", sig)

	for c in m.task_rows.get_children():
		c.queue_free()
	if spectator:
		m.task_rows.add_child(UIStyle.label("WASD + 空格/Ctrl 升降", 12, UIStyle.TEXT_SUB))
		return
	for k in tasks.size():
		var p: Dictionary = m.sim.point(int(tasks[k]))
		var done := k < t_idx
		var now := k == t_idx
		var hard := String(p.get("kind", "")) == "hard"
		var hb := HBoxContainer.new()
		hb.add_theme_constant_override("separation", 5)
		if done:
			hb.modulate.a = 0.42
		hb.add_child(UIStyle.label("%02d" % (k + 1), 11, UIStyle.TEXT_FAINT))

		var tag := PanelContainer.new()
		var tag_sb := StyleBoxFlat.new()
		tag_sb.bg_color = Color(0.35, 0.11, 0.10, 0.35) if hard else Color(0.09, 0.20, 0.30, 0.35)
		tag_sb.border_color = Color.html("#7A3530") if hard else Color.html("#2E587A")
		tag_sb.set_border_width_all(1)
		tag_sb.set_corner_radius_all(3)
		tag_sb.content_margin_left = 4
		tag_sb.content_margin_right = 4
		tag_sb.content_margin_top = 0
		tag_sb.content_margin_bottom = 0
		tag.add_theme_stylebox_override("panel", tag_sb)
		tag.add_child(UIStyle.label("高难" if hard else "普通", 10,
			Color.html("#FF9A90") if hard else Color.html("#8CC6F0")))
		hb.add_child(tag)

		var room_lb := UIStyle.label(m.sim.room_name(String(p.get("room", ""))), 12, UIStyle.TEXT_GOLD)
		hb.add_child(room_lb)
		var nm_fmt := ("%s ✓" if done else ("▶ %s" if now else "%s")) % String(p.get("label", ""))
		var nm_lb := UIStyle.label(nm_fmt, 12, UIStyle.TEXT_MAIN)
		nm_lb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		nm_lb.clip_text = true
		hb.add_child(nm_lb)
		m.task_rows.add_child(hb)


static func tick_live(m) -> void:
	var modal_open := false
	if m.sim != null and not m.sim.meeting.is_empty():
		modal_open = true
	if m._pipe_open or m._info_open:
		modal_open = true
	if m.settle_panel != null and m.settle_panel.visible:
		modal_open = true
	if m.hud_layer != null:
		m.hud_layer.visible = not modal_open
	if modal_open:
		return

	if m.prompt_label != null:
		m.prompt_label.visible = not m.prompt_label.text.is_empty()

	if m.station_panel != null:
		if m.station.is_empty():
			m.station_panel.visible = false
		else:
			var dur := maxf(0.1, float(m.station.get("dur", 1.0)))
			var el := clampf(float(m.station.get("t", 0.0)), 0.0, dur)
			m.station_bar.max_value = dur
			m.station_bar.value = el
			var st_txt := "%s · %.1fs" % [String(m.station.get("label", "")), maxf(0.0, dur - el)]
			if m.station_label.text != st_txt:
				m.station_label.text = st_txt
			m.station_panel.visible = true

	if m.drag_btn != null and m.sim != null and not m.sim.agents.is_empty():
		var drag_i := int(m.sim.me().get("drag", -1))
		m.drag_btn.visible = drag_i >= 0 and m.station.is_empty()

	if m.cd_panel != null:
		var cds: Array = []
		if m._knife_cd > 0.0:
			cds.append("出刀冷却 %.1fs" % m._knife_cd)
		if m._shot_cd > 0.0:
			cds.append("开枪冷却 %.1fs" % m._shot_cd)
		if m._pipe_cd > 0.0:
			cds.append("管道冷却 %.0fs" % ceilf(m._pipe_cd))
		m.cd_panel.visible = not cds.is_empty()
		if not cds.is_empty():
			var cd_txt := " · ".join(PackedStringArray(cds))
			if m.cd_label.text != cd_txt:
				m.cd_label.text = cd_txt


static func alive_count(m) -> int:
	var n := 0
	for x: Dictionary in m.sim.agents:
		if bool(x.get("alive", false)):
			n += 1
	return n


static func event_feed(m) -> String:
	var lines: Array = []
	var evs: Array = m.sim.events
	for i in range(maxi(0, evs.size() - 8), evs.size()):
		var e: Dictionary = evs[i]
		var kind := String(e.get("kind", ""))
		var txt := ""
		if kind == "meeting":
			txt = "· 发现尸体 · 召开会议"
		elif kind == "sabotage":
			txt = "· 设备故障 · %s" % m.sim.room_name(String(e.get("room", "")))
		elif kind == "fix":
			txt = "· 故障已修复" if bool(e.get("ok", false)) else "· 故障超时 · 进度 -5"
		if txt != "":
			lines.append(txt)
	if lines.size() > 2:
		lines = lines.slice(lines.size() - 2, lines.size())
	return "\n".join(lines)


static func show_end(m) -> void:
	if m.settle_panel == null or m.sim == null:
		return
	if m.end_panel != null:
		m.end_panel.visible = false
	var first: bool = not m.settle_panel.visible
	m.settle_panel.visible = true
	if m.hud_layer != null:
		m.hud_layer.visible = false
	if not first:
		return
	m.settle_title.text = "人类胜利" if bool(m.sim.over_win) else "内鬼胜利"
	m.settle_title.add_theme_color_override("font_color", Color.WHITE)
	m.settle_sub.text = String(m.sim.over_why)
	m.settle_stats.text = "维修 %d/%d · 第 %d 夜 · 按 R 重开一局（新种子 %d）" % [
		int(m.sim.prog), int(m.sim.win_pts()), int(m.sim.night), int(m.sim.seed_used) + 1]
	m.settle_ids.text = _settle_ids_text(m)
	m.settle_votes.text = _settle_votes_text(m)


static func _settle_ids_text(m) -> String:
	var lines: Array = []
	for a: Dictionary in m.sim.agents:
		var i := int(a.get("i", -1))
		var alien := bool(a.get("alien", false))
		var role := "内鬼" if alien else "人类"
		var fate := ""
		if bool(a.get("alive", false)):
			fate = "濒死存活" if bool(a.get("downed", false)) else "存活"
		else:
			match String(a.get("deathCause", "")):
				"vote": fate = "被驱逐"
				"knife": fate = "被出刀"
				"shot": fate = "被枪杀"
				"bleed": fate = "天亮失血"
				_: fate = "死亡"
		var extra := ""
		var rid := String(a.get("deathRoom", ""))
		if rid != "" and String(a.get("deathCause", "")) != "vote":
			extra = " · " + m.sim.room_name(rid)
		var killer := ""
		var kb := int(a.get("killedBy", -1))
		if kb >= 0 and kb != i:
			killer = " · 刀在 " + m._tag_name(kb)
		var col := "#FF9A90" if alien else "#9FD8EF"
		lines.append("[color=%s]%s · %s[/color]  [color=#C8D4E2]%s%s[/color]%s" % [
			col, m._tag_name(i), role, fate, extra,
			("[color=#F0C674]%s[/color]" % killer) if killer != "" else ""])
	return "\n".join(lines) if not lines.is_empty() else "（无席位数据）"


static func _settle_votes_text(m) -> String:
	var by_seq: Dictionary = {}
	for e: Dictionary in m.sim.events:
		if String(e.get("kind", "")) != "vote":
			continue
		var seq := int(e.get("seq", 0))
		if not by_seq.has(seq):
			by_seq[seq] = []
		(by_seq[seq] as Array).append(e)
	if by_seq.is_empty():
		return "本局没有进行到投票"
	var keys: Array = by_seq.keys()
	keys.sort()
	var lines: Array = []
	for key: int in keys:
		var arr: Array = by_seq[key]
		var night := int((arr[0] as Dictionary).get("night", 0))
		lines.append("[color=#F0C674]第 %d 夜 · 第 %d 场投票[/color]" % [night, key])
		for e: Variant in arr:
			var ev := e as Dictionary
			var actor := int(ev.get("actor", -1))
			var tgt := int(ev.get("target", -1))
			var an := String(m.sim.agent(actor).get("name", "?"))
			var tn := "弃权" if tgt < 0 else String(m.sim.agent(tgt).get("name", "?"))
			lines.append("  %s → %s" % [an, tn])
	return "\n".join(lines)
