extends Control
## 设置 / 复盘两个覆盖层（对应 2.5D 的 #settings 与 #replay）。
## 只做 UI 与本机配置持久化；对局状态一律只读 sim.events，不回写规则。

signal exit_to_home()
signal music_changed(v: float)
signal sfx_changed(v: float)

const CFG_PATH := "user://settings.cfg"

var font: Font
var settings_panel: ColorRect
var replay_panel: ColorRect
var replay_list: RichTextLabel
var music_slider: HSlider
var sfx_slider: HSlider
var sens_slider: HSlider
var _cfg := ConfigFile.new()
var _events: Array = []


func setup() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	font = SystemFont.new()
	font.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])
	_cfg.load(CFG_PATH)   # 首次运行没有文件是正常情况，用默认值
	_build()


func get_sens() -> float:
	return float(_cfg.get_value("input", "mouse_sens", 0.0022))


func get_music() -> float:
	return float(_cfg.get_value("audio", "music", 0.35))


func get_sfx() -> float:
	return float(_cfg.get_value("audio", "sfx", 0.80))


func apply_audio() -> void:
	# 「音乐」滑杆过去直接写 Master 总线，而工程里当时没有音乐流 ——
	# 结果是它一移动就把**音效**一起压小，音乐却还是听不见。
	# 现在 Master 固定 0dB，两路各自走自己的音量：音乐 → audio.set_music_volume()，
	# 音效 → audio.set_volume()（由 main.gd 接这两个信号）。
	AudioServer.set_bus_volume_db(0, 0.0)
	music_changed.emit(get_music())
	sfx_changed.emit(get_sfx())


func _save() -> void:
	_cfg.set_value("audio", "music", music_slider.value / 100.0)
	_cfg.set_value("audio", "sfx", sfx_slider.value / 100.0)
	_cfg.set_value("input", "mouse_sens", sens_slider.value)
	_cfg.save(CFG_PATH)
	apply_audio()


func _panel(title: String) -> Dictionary:
	var bg := ColorRect.new()
	bg.color = Color(0.01, 0.02, 0.04, 0.88)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_STOP
	bg.visible = false
	add_child(bg)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.add_child(center)
	var box := VBoxContainer.new()
	box.custom_minimum_size = Vector2(560, 0)
	box.add_theme_constant_override("separation", 9)
	center.add_child(box)
	var t := _label(title, 24, Color(0.94, 0.78, 0.45))
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(t)
	return {"bg": bg, "box": box}


func _label(txt: String, fs: int, col: Color) -> Label:
	var l := Label.new()
	l.text = txt
	l.add_theme_font_override("font", font)
	l.add_theme_font_size_override("font_size", fs)
	l.add_theme_color_override("font_color", col)
	return l


func _button(txt: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = txt
	b.custom_minimum_size = Vector2(0, 34)
	b.add_theme_font_size_override("font_size", 14)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.08, 0.10, 0.14, 0.95)
	sb.border_color = Color(0.24, 0.29, 0.37)
	sb.set_border_width_all(1)
	b.add_theme_stylebox_override("normal", sb)
	b.add_theme_stylebox_override("hover", sb)
	b.add_theme_color_override("font_color", Color(0.88, 0.92, 0.98))
	b.pressed.connect(cb)
	return b


func _slider_row(box: VBoxContainer, name: String, minv: float, maxv: float,
		step: float, value: float) -> HSlider:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var n := _label(name, 13, Color(0.75, 0.80, 0.88))
	n.custom_minimum_size = Vector2(90, 0)
	row.add_child(n)
	var h := HSlider.new()
	h.min_value = minv
	h.max_value = maxv
	h.step = step
	h.value = value
	h.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.custom_minimum_size = Vector2(240, 0)
	row.add_child(h)
	box.add_child(row)
	return h


func _build() -> void:
	var sp := _panel("设 置")
	settings_panel = sp["bg"] as ColorRect
	var sbox := sp["box"] as VBoxContainer
	sbox.add_child(_label("音量与对局控制 · 自动保存在本机", 12, Color(0.55, 0.60, 0.68)))
	music_slider = _slider_row(sbox, "音乐", 0, 100, 1, get_music() * 100.0)
	sfx_slider = _slider_row(sbox, "音效", 0, 100, 1, get_sfx() * 100.0)
	sens_slider = _slider_row(sbox, "鼠标灵敏度", 0.0005, 0.0060, 0.0001, get_sens())
	for h in [music_slider, sfx_slider, sens_slider]:
		h.value_changed.connect(func(_v): _save())
	var sbtns := HBoxContainer.new()
	sbtns.add_theme_constant_override("separation", 8)
	sbtns.add_child(_button("继续", func(): close_all()))
	sbtns.add_child(_button("退出到开始页", func(): close_all(); exit_to_home.emit()))
	sbox.add_child(sbtns)

	var rp := _panel("对 局 复 盘")
	replay_panel = rp["bg"] as ColorRect
	var rbox := rp["box"] as VBoxContainer
	rbox.add_child(_label("事件流按时间顺序 · 只读 sim.events", 12, Color(0.55, 0.60, 0.68)))
	replay_list = RichTextLabel.new()
	replay_list.bbcode_enabled = true
	replay_list.custom_minimum_size = Vector2(720, 380)
	replay_list.add_theme_font_size_override("normal_font_size", 13)
	replay_list.add_theme_color_override("default_color", Color(0.80, 0.85, 0.92))
	rbox.add_child(replay_list)
	rbox.add_child(_button("关 闭", func(): close_all()))


func open_settings() -> void:
	close_all()
	settings_panel.visible = true
	mouse_filter = Control.MOUSE_FILTER_STOP
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func open_replay(events: Array) -> void:
	close_all()
	_events = events
	replay_panel.visible = true
	mouse_filter = Control.MOUSE_FILTER_STOP
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	replay_list.text = _replay_text()


## 2.5D 事件信封允许 actor/victim 为 null，GDScript 的 int(null) 会直接报错
func _num(d: Dictionary, key: String, fallback = 0):
	var v: Variant = d.get(key, null)
	if v is int or v is float:
		return v
	return fallback


func _replay_text() -> String:
	var lines: Array = []
	var n := 0
	for e: Dictionary in _events:
		n += 1
		var kind := String(e.get("kind", ""))
		var night := int(_num(e, "night", 0))
		var pt := float(_num(e, "pt", 0.0))
		var actor := int(_num(e, "actor", -1))
		var extra := ""
		if kind == "chat":
			extra = " " + String(e.get("text", "")).substr(0, 48)
		elif kind == "task":
			extra = " " + String(e.get("label", ""))
		elif kind in ["knife", "shoot", "report", "search", "drag_start", "drag_end"]:
			extra = " → %d" % int(_num(e, "victim", -1))
		elif kind == "eject":
			extra = " #%d %s" % [actor, "异形" if bool(e.get("alien", false)) else "人类"]
		elif kind in ["sabotage", "fix", "drag_away", "account"]:
			extra = " " + String(e.get("room", ""))
		var col := "#8FA6C0"
		if kind in ["kill", "knife", "shoot", "sabotage", "bot_down"]:
			col = "#E0574F"
		elif kind in ["task", "revive", "fix"]:
			col = "#8FE3B0"
		elif kind in ["meeting", "vote", "eject", "chat"]:
			col = "#F0C674"
		lines.append("[color=%s]%3d  第%d夜 %6.1fs  %-18s actor=%-2d%s[/color]" % [
			col, n, night, pt, kind, actor, extra])
	if lines.is_empty():
		lines.append("（本局还没有事件）")
	return "\n".join(lines)


func close_all() -> void:
	if settings_panel != null:
		settings_panel.visible = false
	if replay_panel != null:
		replay_panel.visible = false
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	# 鼠标口径统一由 main.gd 的 `_refresh_mouse_mode()` 决定（要尊重 Esc 释放状态
	# 与会议/小游戏等其它覆盖层）。这里再设 CAPTURED 会在关闭设置时把光标锁回去。


func any_open() -> bool:
	return (settings_panel != null and settings_panel.visible) \
		or (replay_panel != null and replay_panel.visible)
