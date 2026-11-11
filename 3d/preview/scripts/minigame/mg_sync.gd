extends "res://scripts/minigame/mg_base.gd"

## 三通道同步（对应 2.5D 的 buildSync）
## 各通道调进自己的亮带，并同时保持 hold 秒（任务配置的 hold，默认 0.6）。

const DEFAULT_TARGETS := [[18.0, 32.0], [48.0, 62.0], [34.0, 50.0]]
const DEFAULT_INIT := [12.0, 74.0, 26.0]

var _sliders: Array = []
var _hold := 0.0
var _need := 3
var _targets: Array = []
var _hold_need := 0.6


func build() -> void:
	set_process(true)
	_targets = cfg("targets", DEFAULT_TARGETS)
	_need = mini(_targets.size(), maxi(1, int(cfg("n", _targets.size()))))
	_hold_need = float(cfg("hold", 0.6))
	var init: Array = cfg("init", DEFAULT_INIT)
	var wrap := center_box()
	add_child(wrap)
	wrap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var rows := VBoxContainer.new()
	rows.add_theme_constant_override("separation", 14)
	rows.custom_minimum_size = Vector2(560, 0)
	var holder := CenterContainer.new()
	holder.add_child(rows)
	wrap.add_child(holder)

	for i in _need:
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
		band.anchor_left = float(_targets[i][0]) / 100.0
		band.anchor_right = float(_targets[i][1]) / 100.0
		band.anchor_top = 0.0
		band.anchor_bottom = 1.0
		band.offset_top = 4
		band.offset_bottom = -4
		track.add_child(band)

		var slider := HSlider.new()
		slider.min_value = 0
		slider.max_value = 100
		slider.value = float(init[i % init.size()]) if not init.is_empty() else 20.0
		slider.custom_minimum_size = Vector2(430, 28)
		slider.focus_mode = Control.FOCUS_NONE
		slider.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		track.add_child(slider)
		_sliders.append(slider)
		rows.add_child(row)

	set_progress(0, _need, "把 %d 条通道调进亮带，并同时保持 %.1f 秒" % [_need, _hold_need])


func _process(delta: float) -> void:
	if is_finished():
		return
	var inside := 0
	for i in _sliders.size():
		var v := float(_sliders[i].value)
		if v >= float(_targets[i][0]) and v <= float(_targets[i][1]):
			inside += 1
	var all := inside == _need
	_hold = _hold + delta if all else 0.0
	if all:
		set_tip("保持 %.1f / %.1f s" % [_hold, _hold_need])
	set_progress(inside, _need, "")
	if _hold >= _hold_need:
		set_progress(_need, _need, "%d 条通道同步" % _need)
		finish_ok()


func debug_solve() -> void:
	for i in _sliders.size():
		_sliders[i].value = (float(_targets[i][0]) + float(_targets[i][1])) * 0.5
	_hold = _hold_need
	set_progress(_need, _need, "%d 条通道同步" % _need)
	finish_ok()
