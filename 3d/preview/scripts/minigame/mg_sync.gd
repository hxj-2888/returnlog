extends "res://scripts/minigame/mg_base.gd"

## 三通道同步（对应 2.5D 的 buildSync）
## 三条滑杆各自调进亮带，并同时保持 0.6 秒。

const TARGETS := [[18.0, 32.0], [48.0, 62.0], [34.0, 50.0]]

var _sliders: Array = []
var _hold := 0.0


func build() -> void:
	set_process(true)
	var wrap := center_box()
	add_child(wrap)
	wrap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var rows := VBoxContainer.new()
	rows.add_theme_constant_override("separation", 14)
	rows.custom_minimum_size = Vector2(560, 0)
	var holder := CenterContainer.new()
	holder.add_child(rows)
	wrap.add_child(holder)

	for i in 3:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		var lab := label("通道 %d" % (i + 1), 12, COL_DIM)
		lab.custom_minimum_size = Vector2(54, 0)
		row.add_child(lab)

		var track := Control.new()
		track.custom_minimum_size = Vector2(430, 28)
		track.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(track)

		var band := ColorRect.new()
		band.color = Color(0.94, 0.78, 0.45, 0.16)
		band.mouse_filter = Control.MOUSE_FILTER_IGNORE
		band.anchor_left = TARGETS[i][0] / 100.0
		band.anchor_right = TARGETS[i][1] / 100.0
		band.anchor_top = 0.0
		band.anchor_bottom = 1.0
		band.offset_top = 4
		band.offset_bottom = -4
		track.add_child(band)

		var slider := HSlider.new()
		slider.min_value = 0
		slider.max_value = 100
		slider.value = [12, 74, 26][i]
		slider.custom_minimum_size = Vector2(430, 28)
		slider.focus_mode = Control.FOCUS_NONE
		slider.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		track.add_child(slider)
		_sliders.append(slider)
		rows.add_child(row)

	set_progress(0, 3, "三条通道各自调进亮带，并同时保持 0.6 秒")


func _process(delta: float) -> void:
	if is_finished():
		return
	var inside := 0
	for i in _sliders.size():
		var v := float(_sliders[i].value)
		if v >= TARGETS[i][0] and v <= TARGETS[i][1]:
			inside += 1
	var all := inside == 3
	_hold = _hold + delta if all else 0.0
	if all:
		set_tip("保持 %.1f / 0.6 s" % _hold)
	set_progress(inside, 3, "")
	if _hold >= 0.6:
		set_progress(3, 3, "三条通道同步")
		finish_ok()


func debug_solve() -> void:
	for i in _sliders.size():
		_sliders[i].value = (TARGETS[i][0] + TARGETS[i][1]) * 0.5
	_hold = 0.6
	set_progress(3, 3, "三条通道同步")
	finish_ok()
