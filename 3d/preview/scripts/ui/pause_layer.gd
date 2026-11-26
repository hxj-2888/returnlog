extends CanvasLayer
## 暂停层：深炭工业卡片、1px 细线进度行与横排底部按钮条。

const UIStyle := preload("res://scripts/ui/ui_style.gd")

signal resume_requested()
signal settings_requested()
signal restart_requested()
signal exit_to_home_requested()

var info: Label


func _ready() -> void:
	layer = 90
	var dim := ColorRect.new()
	dim.color = UIStyle.BG_OVERLAY
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(dim)

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(440, 0)
	panel.add_theme_stylebox_override("panel",
		UIStyle.card_style_xy(UIStyle.BG_CARD, UIStyle.BORDER_CARD, 14, 26, 22, 1))
	center.add_child(panel)

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 0)
	panel.add_child(vb)

	var title := UIStyle.label("已暂停", 16, Color.WHITE)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	vb.add_child(title)

	var sub_wrap := MarginContainer.new()
	sub_wrap.add_theme_constant_override("margin_top", 4)
	sub_wrap.add_theme_constant_override("margin_bottom", 14)
	vb.add_child(sub_wrap)
	var sub := UIStyle.label("单机模式 · 夜里的倒计时和 AI 都已冻结", 12, UIStyle.TEXT_DIM)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	sub_wrap.add_child(sub)

	_add_row(vb, "继续游戏", "ESC / P")
	info = _add_row(vb, "当前进度", "—")

	var btn_wrap := MarginContainer.new()
	btn_wrap.add_theme_constant_override("margin_top", 16)
	vb.add_child(btn_wrap)
	var btns := HBoxContainer.new()
	btns.alignment = BoxContainer.ALIGNMENT_BEGIN
	btns.add_theme_constant_override("separation", 10)
	btn_wrap.add_child(btns)
	btns.add_child(UIStyle.make_button("继续", func() -> void: resume_requested.emit(),
		13, UIStyle.BG_PRIMARY, UIStyle.BORDER_PRIMARY, Vector2(0, 34), UIStyle.TEXT_MAIN))
	btns.add_child(UIStyle.make_button("设置", func() -> void: settings_requested.emit(),
		13, UIStyle.BG_BTN, UIStyle.BORDER_BTN, Vector2(0, 34), UIStyle.TEXT_MAIN))
	btns.add_child(UIStyle.make_button("重开本局", func() -> void: restart_requested.emit(),
		13, UIStyle.BG_BTN, UIStyle.BORDER_BTN, Vector2(0, 34), UIStyle.TEXT_MAIN))
	btns.add_child(UIStyle.make_button("退出到开始页", func() -> void: exit_to_home_requested.emit(),
		13, UIStyle.BG_BTN, UIStyle.BORDER_BTN, Vector2(0, 34), UIStyle.TEXT_MAIN))

	visible = false


func _add_row(parent: VBoxContainer, k: String, v: String) -> Label:
	var row := PanelContainer.new()
	row.add_theme_stylebox_override("panel", UIStyle.row_line_style(UIStyle.DIVIDER, 7, 7))
	parent.add_child(row)
	var hb := HBoxContainer.new()
	row.add_child(hb)
	var kl := UIStyle.label(k, 13, UIStyle.TEXT_SUB)
	kl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hb.add_child(kl)
	var vl := UIStyle.label(v, 13, UIStyle.TEXT_GOLD)
	hb.add_child(vl)
	return vl


func set_info(text: String) -> void:
	if info != null:
		info.text = text


## 读 sim 只读展示夜次、剩余秒数与任务进度。
func set_from_sim(sim) -> void:
	if info == null or sim == null:
		return
	var me: Dictionary = sim.me()
	var done := int(me.get("tIdx", 0))
	var total := (me.get("tasks", []) as Array).size()
	set_info("第 %d 夜 · 剩余 %d 秒 · 任务 %d/%d" % [
		int(sim.night), int(maxf(0.0, float(sim.t))), done, total])
