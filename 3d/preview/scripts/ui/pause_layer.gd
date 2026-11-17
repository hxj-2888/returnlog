extends CanvasLayer

## 暂停层（2026-11-16 从 main.gd 拆出）：只做遮罩与提示，不改判定。
## 2.5D 的 #pause 是 DOM 层；3D 用 Control 重做，布局/字号属表现层差异。

var info: Label


func _ready() -> void:
	layer = 90
	var dim := ColorRect.new()
	dim.color = Color(0.015, 0.02, 0.035, 0.62)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	var panel := PanelContainer.new()
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 12)
	var title := Label.new()
	title.text = "已暂停"
	title.add_theme_font_size_override("font_size", 34)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(title)
	info = Label.new()
	info.add_theme_font_size_override("font_size", 16)
	info.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(info)
	var hint := Label.new()
	hint.text = "Esc 继续 · P 设置"
	hint.add_theme_font_size_override("font_size", 15)
	hint.add_theme_color_override("font_color", Color(0.62, 0.72, 0.82))
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(hint)
	panel.add_child(vb)
	center.add_child(panel)
	visible = false


func set_info(text: String) -> void:
	if info != null:
		info.text = text


## 2.5D 的暂停面板显示「第 N 夜 · 剩余秒数 · 任务进度」；读 sim 只读。
func set_from_sim(sim) -> void:
	if info == null or sim == null:
		return
	var me: Dictionary = sim.me()
	var done := int(me.get("tIdx", 0))
	var total := (me.get("tasks", []) as Array).size()
	set_info("第 %d 夜 · 剩余 %d 秒 · 任务 %d/%d" % [
		int(sim.night), int(maxf(0.0, float(sim.t))), done, total])
