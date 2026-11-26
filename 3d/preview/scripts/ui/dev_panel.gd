extends RefCounted
## DEV 全知侧栏与 F2 透视层（从 main.gd 迁出，只读 sim，不反向写规则）。


static func build(m) -> void:
	m.dev_layer = CanvasLayer.new()
	m.dev_layer.layer = 13
	m.add_child(m.dev_layer)
	m.dev_panel = PanelContainer.new()
	m.dev_panel.visible = false
	m.dev_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.dev_panel.anchor_left = 1.0
	m.dev_panel.anchor_right = 1.0
	m.dev_panel.anchor_top = 0.0
	m.dev_panel.anchor_bottom = 1.0
	m.dev_panel.offset_left = -390.0
	m.dev_panel.offset_right = -16.0
	m.dev_panel.offset_top = 352.0
	m.dev_panel.offset_bottom = -24.0
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.027, 0.047, 0.071, 0.93)
	sb.border_color = Color(0.20, 0.275, 0.361, 0.95)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(3)
	m.dev_panel.add_theme_stylebox_override("panel", sb)
	m.dev_layer.add_child(m.dev_panel)
	var margin := MarginContainer.new()
	for side: String in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 9)
	m.dev_panel.add_child(margin)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 4)
	margin.add_child(col)

	var font := UIFont.get_font()
	m.dev_title = Label.new()
	m.dev_title.text = "DEV · 全知总览"
	m.dev_title.add_theme_font_override("font", font)
	m.dev_title.add_theme_font_size_override("font_size", 15)
	m.dev_title.add_theme_color_override("font_color", Color(0.498, 0.827, 0.941))
	col.add_child(m.dev_title)
	m.dev_sub = Label.new()
	m.dev_sub.text = "F2 关闭 · 攻击与驱逐对你无效 · 尸体卡显示凶手"
	m.dev_sub.add_theme_font_override("font", font)
	m.dev_sub.add_theme_font_size_override("font_size", 9)
	m.dev_sub.add_theme_color_override("font_color", Color(0.478, 0.529, 0.596))
	m.dev_sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(m.dev_sub)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(scroll)
	m.dev_rows = VBoxContainer.new()
	m.dev_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	m.dev_rows.add_theme_constant_override("separation", 2)
	scroll.add_child(m.dev_rows)
	for i in 15:
		var lb := Label.new()
		lb.add_theme_font_override("font", font)
		lb.add_theme_font_size_override("font_size", 10)
		lb.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		lb.mouse_filter = Control.MOUSE_FILTER_IGNORE
		m.dev_rows.add_child(lb)
		m._dev_row_labels.append(lb)

	m.dev_stats = Label.new()
	m.dev_stats.add_theme_font_override("font", font)
	m.dev_stats.add_theme_font_size_override("font_size", 10)
	m.dev_stats.add_theme_color_override("font_color", Color(0.647, 0.702, 0.776))
	m.dev_stats.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(m.dev_stats)

	m.dev_probe = Label.new()
	m.dev_probe.add_theme_font_override("font", font)
	m.dev_probe.add_theme_font_size_override("font_size", 9)
	m.dev_probe.add_theme_color_override("font_color", Color(0.498, 0.698, 0.780))
	m.dev_probe.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	m.dev_probe.custom_minimum_size = Vector2(0, 96)
	m.dev_probe.text = "探针 · 最近 8 条\n（按 E / 左键 / 右键 / F2 会记在这里）"
	col.add_child(m.dev_probe)
	build_esp(m)


static func build_esp(m) -> void:
	m.esp_canvas = m.EspCanvas.new()
	m.esp_canvas.host = m
	m.esp_canvas.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	m.esp_canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.esp_canvas.visible = false
	m.dev_layer.add_child(m.esp_canvas)


static func refresh(m) -> void:
	if m.dev_panel == null:
		return
	var on: bool = m.sim != null and not m.sim.agents.is_empty() \
		and (bool(m.sim.dev) or bool(m.sim.spectator))
	m.dev_panel.visible = on and m.text_dev_open
	if m.esp_canvas != null:
		m.esp_canvas.visible = on
		if on:
			m.esp_canvas.queue_redraw()
	if not on or not m.dev_panel.visible:
		return
	m.dev_title.text = "DEV · 全知总览" if bool(m.sim.dev) else "旁观者 · 全知总览"
	m.dev_sub.text = ("F2 关闭 · 攻击与驱逐对你无效 · 尸体卡显示凶手" if bool(m.sim.dev)
		else "旁观者不参与对局 · 名字与阵营全知")
	var i := 0
	for a: Dictionary in m.sim.agents:
		if i >= m._dev_row_labels.size():
			break
		var lb: Label = m._dev_row_labels[i]
		var st := _agent_state_text(a)
		var where_pos: Vector2 = a.get("pos", Vector2.ZERO)
		if not bool(a.get("alive", false)):
			var bp: Variant = a.get("bodyPos", null)
			if bp is Vector2:
				var bpv: Vector2 = bp
				if bpv != Vector2.ZERO:
					where_pos = bpv
		var where: String = m.sim.room_name(m.sim.room_at(where_pos))
		var extra := ""
		if bool(a.get("detained", false)):
			extra = " · 被锁"
		elif int(a.get("draggedBy", -1)) >= 0:
			extra = " · 被拖"
		elif int(a.get("drag", -1)) >= 0:
			extra = " · 拖尸"
		var res := "弹%d 包%d 单%d%s" % [int(a.get("bullet", 0)), int(a.get("medkit", 0)),
			int(a.get("qual", 0)),
			("+%d" % int(a.get("qualPending", 0))) if int(a.get("qualPending", 0)) > 0 else ""]
		res += " · 任务%d/%d" % [int(a.get("tIdx", 0)), (a.get("tasks", []) as Array).size()]
		if bool(a.get("alien", false)):
			res += " · 刀%d" % int(a.get("knife", 0))
		var who := String(a.get("name", "?"))
		if int(a.get("i", -1)) == int(m.sim.me_idx) and not bool(m.sim.spectator):
			who += "（你）"
		lb.text = "%02d %s · %s · %s · %s%s\n   %s" % [int(a.get("i", 0)) + 1, who,
			"异形" if bool(a.get("alien", false)) else "人类", st, where, extra, res]
		var col := Color(0.898, 0.341, 0.310) if bool(a.get("alien", false)) \
			else Color(0.867, 0.890, 0.925)
		if not bool(a.get("alive", false)):
			col = Color(0.55, 0.58, 0.62, 0.85)
		elif int(a.get("i", -1)) == int(m.sim.me_idx):
			col = Color(0.941, 0.776, 0.455)
		lb.add_theme_color_override("font_color", col)
		lb.visible = true
		i += 1
	for j in range(i, m._dev_row_labels.size()):
		(m._dev_row_labels[j] as Label).visible = false
	var downed_n := 0
	for a2: Dictionary in m.sim.agents:
		if bool(a2.get("alive", false)) and bool(a2.get("downed", false)):
			downed_n += 1
	m.dev_stats.text = "存活 %d/%d · 濒死 %d · 维修 %d/%d · 夜 %d · %.0fs · 探针 %d" % [
		m._alive_count(), m.sim.agents.size(), downed_n, int(m.sim.prog), int(m.sim.win_pts()),
		int(m.sim.night), maxf(0.0, float(m.sim.t)), m._probe_lines.size()]
	m.dev_probe.text = "探针 · 最近 8 条\n" + "\n".join(PackedStringArray(m._probe_lines))


static func _agent_state_text(a: Dictionary) -> String:
	if not bool(a.get("alive", false)):
		return "幽灵" if bool(a.get("ghost", false)) else "出局"
	if bool(a.get("downed", false)):
		return "濒死"
	if bool(a.get("detained", false)):
		return "被擒"
	if float(a.get("doing", 0.0)) > 0.0:
		match String(a.get("_doing", "")):
			"task": return "做任务"
			"fix": return "修故障"
			"revive": return "施救"
			"qual": return "领申请单"
			"ammo": return "取子弹"
			"med": return "取医疗包"
			"breaker": return "拉闸"
			"fake": return "假装做任务"
			_: return "行动"
	if bool(a.get("moving", false)):
		return "移动"
	return "待机"
