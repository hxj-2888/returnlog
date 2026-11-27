extends Control
## 设置 / 复盘两个覆盖层：深炭工业卡片、1px 分割线与原版复盘分栏布局。
## 只做 UI 与本机配置持久化；对局状态一律只读 sim.events / sim.replay_data()，不回写规则。

signal exit_to_home()
signal music_changed(v: float)
signal sfx_changed(v: float)

const CFG_PATH := "user://settings.cfg"
const ReplayMapScript := preload("res://scripts/ui/replay_map.gd")
const UIStyle := preload("res://scripts/ui/ui_style.gd")
const ConfigRef := preload("res://scripts/config.gd")
const FPS_OPTIONS := [
	{"val": 60, "label": "60 FPS"},
	{"val": 120, "label": "120 FPS"},
	{"val": 0, "label": "无上限"},
]
const REPLAY_FILTERS := [
	{"id": "all", "label": "全部", "kinds": []},
	{"id": "fight", "label": "击杀", "kinds": ["knife", "shoot", "kill", "eject", "detain", "bot_hit", "bot_down"]},
	{"id": "task", "label": "任务", "kinds": ["task", "fix", "sabotage", "revive"]},
	{"id": "move", "label": "管道", "kinds": ["pipe", "breaker", "drag_start", "drag_end"]},
	{"id": "meet", "label": "会议", "kinds": ["meeting", "report", "vote"]},
	{"id": "chat", "label": "聊天", "kinds": ["chat"]},
]

var font: Font
var settings_panel: ColorRect
var replay_panel: ColorRect
var replay_list: RichTextLabel
var _replay_items: ItemList
var _replay_map
var _replay_slider: HSlider
var _replay_time_lbl: Label
var _replay_meta_lbl: Label
var _replay_play_btn: Button
var _replay_speed_btn: Button
var _filter_btns: Dictionary = {}
var music_slider: HSlider
var sfx_slider: HSlider
var sens_slider: HSlider
var _fps_btns: Dictionary = {}
var _cfg_data: Dictionary = ConfigRef.DEFAULT_CFG.duplicate()
var _events: Array = []
var _filtered_events: Array = []
var _map_data: Dictionary = {}
var _payload: Dictionary = {}
var _roster_names: Dictionary = {}
var _room_centers: Dictionary = {}
var _filter_id := "all"
var _playing := false
var _play_speed := 1.0
var _cur_pt := 0.0
var _end_pt := 0.0


func setup() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	font = UIFont.get_font()
	_cfg_data = ConfigRef.load_cfg()
	_build()


func get_sens() -> float:
	return float(_cfg_data.get("mouse_sens", 0.0022))


func get_music() -> float:
	return float(_cfg_data.get("music", 0.35))


func get_sfx() -> float:
	return float(_cfg_data.get("sfx", 0.80))


func get_max_fps() -> int:
	return ConfigRef.normalize_max_fps(int(_cfg_data.get("max_fps", 60)))


func apply_audio() -> void:
	AudioServer.set_bus_volume_db(0, 0.0)
	music_changed.emit(get_music())
	sfx_changed.emit(get_sfx())


## 同步界面控件与帧率档位并持久化到本机配置文件。
func save_cfg() -> void:
	if music_slider != null:
		_cfg_data["music"] = music_slider.value / 100.0
	if sfx_slider != null:
		_cfg_data["sfx"] = sfx_slider.value / 100.0
	if sens_slider != null:
		_cfg_data["mouse_sens"] = sens_slider.value
	_cfg_data["max_fps"] = get_max_fps()
	ConfigRef.save_cfg(_cfg_data)
	apply_audio()


func _save() -> void:
	save_cfg()


func _panel(title: String, min_w: float = 460.0) -> Dictionary:
	var bg := ColorRect.new()
	bg.color = UIStyle.BG_OVERLAY
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_STOP
	bg.visible = false
	add_child(bg)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.add_child(center)
	var card := PanelContainer.new()
	card.custom_minimum_size = Vector2(min_w, 0)
	card.add_theme_stylebox_override("panel",
		UIStyle.card_style_xy(UIStyle.BG_CARD, UIStyle.BORDER_CARD, 14, 24, 20, 1))
	center.add_child(card)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	card.add_child(box)
	var t := _label(title, 16, Color.WHITE)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	box.add_child(t)
	return {"bg": bg, "box": box}


func _label(txt: String, fs: int, col: Color) -> Label:
	return UIStyle.label(txt, fs, col)


func _button(txt: String, cb: Callable, min_w: float = 0.0) -> Button:
	return UIStyle.make_button(txt, cb, 13, UIStyle.BG_BTN, UIStyle.BORDER_BTN, Vector2(min_w, 34))


func _slider_row(box: VBoxContainer, name: String, minv: float, maxv: float,
		step: float, value: float, is_pct: bool = true) -> HSlider:
	var wrap := PanelContainer.new()
	wrap.add_theme_stylebox_override("panel", UIStyle.row_line_style(UIStyle.DIVIDER, 9, 9))
	box.add_child(wrap)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	wrap.add_child(row)
	var n := _label(name, 13, UIStyle.TEXT_SUB)
	n.custom_minimum_size = Vector2(76, 0)
	row.add_child(n)
	var h := HSlider.new()
	h.min_value = minv
	h.max_value = maxv
	h.step = step
	h.value = value
	h.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.custom_minimum_size = Vector2(240, 0)
	row.add_child(h)
	var val_lbl := _label(str(int(round(value))) if is_pct else ("%.4f" % value), 13, UIStyle.TEXT_GOLD)
	val_lbl.custom_minimum_size = Vector2(46, 0)
	val_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(val_lbl)
	h.value_changed.connect(func(v: float) -> void:
		val_lbl.text = str(int(round(v))) if is_pct else ("%.4f" % v))
	return h


## 构建帧率上限切换行（60 FPS / 120 FPS / 无上限）。
func _fps_row(box: VBoxContainer) -> void:
	var wrap := PanelContainer.new()
	wrap.add_theme_stylebox_override("panel", UIStyle.row_line_style(UIStyle.DIVIDER, 9, 9))
	box.add_child(wrap)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	wrap.add_child(row)
	var n := _label("帧率上限", 13, UIStyle.TEXT_SUB)
	n.custom_minimum_size = Vector2(76, 0)
	row.add_child(n)
	var btns_box := HBoxContainer.new()
	btns_box.add_theme_constant_override("separation", 8)
	btns_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(btns_box)
	_fps_btns.clear()
	for opt: Dictionary in FPS_OPTIONS:
		var val := int(opt["val"])
		var btn := _button(String(opt["label"]), func() -> void: _on_fps_selected(val), 0.0)
		btn.custom_minimum_size = Vector2(0, 32)
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		btns_box.add_child(btn)
		_fps_btns[val] = btn
	_sync_fps_btns()


## 同步帧率按钮选中高亮状态。
func _sync_fps_btns() -> void:
	var cur := get_max_fps()
	for val: int in _fps_btns.keys():
		var btn := _fps_btns[val] as Button
		var active := val == cur
		UIStyle.apply_button(btn,
			Color.html("#1D1A12") if active else UIStyle.BG_BTN,
			UIStyle.BORDER_GOLD if active else UIStyle.BORDER_BTN,
			12, 8, 10, 5,
			UIStyle.TEXT_GOLD if active else UIStyle.TEXT_MAIN, true)


## 切换帧率上限并立即生效与持久化。
func _on_fps_selected(val: int) -> void:
	var fps := ConfigRef.normalize_max_fps(val)
	_cfg_data["max_fps"] = fps
	ConfigRef.apply_max_fps(fps)
	save_cfg()
	_sync_fps_btns()


func _build() -> void:
	var sp := _panel("设置", 460.0)
	settings_panel = sp["bg"] as ColorRect
	var sbox := sp["box"] as VBoxContainer
	var ssub := _label("音量与对局控制 · 自动保存在本机", 12, UIStyle.TEXT_DIM)
	ssub.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	sbox.add_child(ssub)
	var s_inner := VBoxContainer.new()
	s_inner.add_theme_constant_override("separation", 0)
	sbox.add_child(s_inner)
	music_slider = _slider_row(s_inner, "音乐音量", 0, 100, 1, get_music() * 100.0, true)
	sfx_slider = _slider_row(s_inner, "音效音量", 0, 100, 1, get_sfx() * 100.0, true)
	sens_slider = _slider_row(s_inner, "鼠标灵敏度", 0.0005, 0.0060, 0.0001, get_sens(), false)
	_fps_row(s_inner)
	for h in [music_slider, sfx_slider, sens_slider]:
		h.value_changed.connect(func(_v): save_cfg())
	var sbtns_wrap := MarginContainer.new()
	sbtns_wrap.add_theme_constant_override("margin_top", 10)
	sbox.add_child(sbtns_wrap)
	var sbtns := HBoxContainer.new()
	sbtns.alignment = BoxContainer.ALIGNMENT_BEGIN
	sbtns.add_theme_constant_override("separation", 10)
	var resume_b := UIStyle.make_button("继续", func(): close_all(),
		13, UIStyle.BG_PRIMARY, UIStyle.BORDER_PRIMARY, Vector2(96, 34), UIStyle.TEXT_MAIN)
	sbtns.add_child(resume_b)
	sbtns.add_child(_button("退出到开始页", func(): close_all(); exit_to_home.emit(), 124.0))
	sbtns_wrap.add_child(sbtns)

	var rp := _panel("对局复盘 · 蓝图轨迹回放", 1100.0)
	replay_panel = rp["bg"] as ColorRect
	var rbox := rp["box"] as VBoxContainer
	_replay_meta_lbl = _label("时间轴与坐标帧回放 · 点击事件定位或拖动下方进度条", 12, UIStyle.TEXT_DIM)
	_replay_meta_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	rbox.add_child(_replay_meta_lbl)

	var split := HBoxContainer.new()
	split.add_theme_constant_override("separation", 14)
	rbox.add_child(split)

	var left_card := PanelContainer.new()
	left_card.add_theme_stylebox_override("panel",
		UIStyle.card_style_xy(Color.html("#05080D"), UIStyle.DIVIDER, 10, 8, 8, 1))
	split.add_child(left_card)
	_replay_map = ReplayMapScript.new()
	_replay_map.custom_minimum_size = Vector2(560, 440)
	left_card.add_child(_replay_map)

	var right_card := PanelContainer.new()
	right_card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_card.add_theme_stylebox_override("panel",
		UIStyle.card_style_xy(Color.html("#0D121A"), UIStyle.DIVIDER, 10, 10, 8, 1))
	split.add_child(right_card)
	var right := VBoxContainer.new()
	right.add_theme_constant_override("separation", 6)
	right_card.add_child(right)

	var fbar := HBoxContainer.new()
	fbar.add_theme_constant_override("separation", 5)
	for f: Dictionary in REPLAY_FILTERS:
		var fid := String(f["id"])
		var fb := UIStyle.make_button(String(f["label"]), func() -> void: _set_filter(fid),
			11, UIStyle.BG_BTN, Color.html("#232C39"), Vector2(0, 26), UIStyle.TEXT_SUB)
		UIStyle.apply_button(fb, UIStyle.BG_BTN, Color.html("#232C39"), 11, 13, 8, 3, UIStyle.TEXT_SUB, true)
		fb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		fbar.add_child(fb)
		_filter_btns[fid] = fb
	right.add_child(fbar)

	right.add_child(UIStyle.hr())
	_replay_items = ItemList.new()
	_replay_items.custom_minimum_size = Vector2(460, 408)
	_replay_items.add_theme_font_override("font", font)
	_replay_items.add_theme_font_size_override("font_size", 12)
	_replay_items.add_theme_color_override("font_color", UIStyle.TEXT_MAIN)
	_replay_items.add_theme_stylebox_override("panel", StyleBoxEmpty.new())
	_replay_items.item_selected.connect(_on_event_selected)
	right.add_child(_replay_items)

	replay_list = RichTextLabel.new()
	replay_list.visible = false
	rbox.add_child(replay_list)

	var ctrl := HBoxContainer.new()
	ctrl.add_theme_constant_override("separation", 10)
	_replay_play_btn = _button("播放", _toggle_play, 68.0)
	ctrl.add_child(_replay_play_btn)
	_replay_speed_btn = _button("1x", _cycle_speed, 46.0)
	ctrl.add_child(_replay_speed_btn)
	_replay_slider = HSlider.new()
	_replay_slider.min_value = 0.0
	_replay_slider.max_value = 1.0
	_replay_slider.step = 0.1
	_replay_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_replay_slider.value_changed.connect(_on_slider_changed)
	ctrl.add_child(_replay_slider)
	_replay_time_lbl = _label("0:00 / 0:00", 12, UIStyle.TEXT_SUB)
	_replay_time_lbl.custom_minimum_size = Vector2(88, 0)
	_replay_time_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	ctrl.add_child(_replay_time_lbl)
	ctrl.add_child(_button("关闭", func(): close_all(), 88.0))
	rbox.add_child(ctrl)


func _process(delta: float) -> void:
	if not _playing or replay_panel == null or not replay_panel.visible:
		return
	_cur_pt += delta * _play_speed * 4.0
	if _cur_pt >= _end_pt:
		_cur_pt = _end_pt
		_playing = false
		if _replay_play_btn != null:
			_replay_play_btn.text = "播放"
	_replay_slider.set_value_no_signal(_cur_pt)
	_sync_time_view()


func open_settings() -> void:
	close_all()
	_sync_fps_btns()
	settings_panel.visible = true
	mouse_filter = Control.MOUSE_FILTER_STOP
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func open_replay(events: Array, map_data: Dictionary = {}, payload: Dictionary = {}) -> void:
	close_all()
	_events = events
	_map_data = map_data
	_payload = payload
	_playing = false
	if _replay_play_btn != null:
		_replay_play_btn.text = "播放"
	_roster_names.clear()
	for r: Dictionary in payload.get("roster", []):
		_roster_names[int(r.get("i", -1))] = String(r.get("name", ""))
	_room_centers.clear()
	for rm: Dictionary in map_data.get("rooms", []):
		var lb: Array = rm.get("label", [0, 0]) as Array
		_room_centers[String(rm.get("id", ""))] = Vector2(float(lb[0]), float(lb[1]))
	var frames: Array = payload.get("frames", []) as Array
	_end_pt = 0.0
	for fr: Dictionary in frames:
		_end_pt = maxf(_end_pt, float(_num(fr, "pt", 0.0)))
	for e: Dictionary in _events:
		_end_pt = maxf(_end_pt, float(_num(e, "pt", 0.0)))
	_cur_pt = 0.0
	_replay_slider.max_value = maxf(_end_pt, 1.0)
	_replay_slider.set_value_no_signal(0.0)
	_replay_map.setup(_map_data, payload.get("roster", []), frames)
	var res: Dictionary = payload.get("result", {}) as Dictionary
	if not res.is_empty():
		var win_txt := "人类胜" if bool(res.get("win", false)) else "内鬼胜"
		_replay_meta_lbl.text = "%s · 维修 %d/%d · 第 %d 夜 · 事件 %d 条 · 轨迹帧 %d" % [
			win_txt, int(res.get("prog", 0)), int(res.get("winPts", 48)),
			int(res.get("nights", 1)), _events.size(), frames.size()]
	else:
		_replay_meta_lbl.text = "事件 %d 条 · 轨迹帧 %d · 点击事件定位或拖动下方进度条" % [_events.size(), frames.size()]
	replay_panel.visible = true
	mouse_filter = Control.MOUSE_FILTER_STOP
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	_set_filter("all")
	replay_list.text = _replay_text()
	_sync_time_view()


func _set_filter(fid: String) -> void:
	_filter_id = fid
	for k: String in _filter_btns.keys():
		var b := _filter_btns[k] as Button
		var active := k == fid
		UIStyle.apply_button(b,
			Color.html("#1D1A12") if active else UIStyle.BG_BTN,
			UIStyle.BORDER_GOLD if active else Color.html("#232C39"),
			11, 13, 8, 3, UIStyle.TEXT_GOLD if active else UIStyle.TEXT_SUB, true)
	_rebuild_event_items()


func _rebuild_event_items() -> void:
	_replay_items.clear()
	_filtered_events.clear()
	var kinds: Array = []
	for f: Dictionary in REPLAY_FILTERS:
		if String(f["id"]) == _filter_id:
			kinds = f["kinds"] as Array
			break
	for e: Dictionary in _events:
		var k := String(e.get("kind", ""))
		if not kinds.is_empty() and not (k in kinds):
			continue
		_filtered_events.append(e)
		var night := int(_num(e, "night", 0))
		var pt := float(_num(e, "pt", 0.0))
		var line := "夜%d %s  %s" % [night, _fmt_sec(pt), _event_summary(e)]
		var idx := _replay_items.add_item(line)
		_replay_items.set_item_custom_fg_color(idx, _event_color(k))
	if _filtered_events.is_empty():
		_replay_items.add_item("（该分类下暂无事件）")


func _on_event_selected(idx: int) -> void:
	if idx < 0 or idx >= _filtered_events.size():
		return
	var e: Dictionary = _filtered_events[idx] as Dictionary
	_cur_pt = float(_num(e, "pt", 0.0))
	_replay_slider.set_value_no_signal(_cur_pt)
	var focus := Vector2(-1, -1)
	if e.has("x") and e.has("y"):
		focus = Vector2(float(_num(e, "x", -1)), float(_num(e, "y", -1)))
	else:
		var rid := String(e.get("room", ""))
		if _room_centers.has(rid):
			focus = _room_centers[rid] as Vector2
	_replay_map.set_time(_cur_pt, focus)
	_replay_time_lbl.text = "%s / %s" % [_fmt_sec(_cur_pt), _fmt_sec(_end_pt)]


func _on_slider_changed(v: float) -> void:
	_cur_pt = v
	_sync_time_view()


func _toggle_play() -> void:
	if _end_pt <= 0.0:
		return
	if _cur_pt >= _end_pt:
		_cur_pt = 0.0
	_playing = not _playing
	_replay_play_btn.text = "暂停" if _playing else "播放"


func _cycle_speed() -> void:
	if _play_speed < 1.5:
		_play_speed = 2.0
	elif _play_speed < 3.0:
		_play_speed = 4.0
	else:
		_play_speed = 1.0
	_replay_speed_btn.text = "%dx" % int(_play_speed)


func _sync_time_view() -> void:
	if _replay_map != null:
		_replay_map.set_time(_cur_pt)
	if _replay_time_lbl != null:
		_replay_time_lbl.text = "%s / %s" % [_fmt_sec(_cur_pt), _fmt_sec(_end_pt)]


func _fmt_sec(sec: float) -> String:
	var s := maxi(0, int(sec))
	return "%d:%02d" % [s / 60, s % 60]


func _who(seat: int) -> String:
	if seat < 0:
		return "—"
	return String(_roster_names.get(seat, "#%d" % seat))


func _event_color(kind: String) -> Color:
	if kind in ["kill", "knife", "shoot", "sabotage", "bot_down"]:
		return Color(0.92, 0.42, 0.38)
	if kind in ["task", "revive", "fix"]:
		return Color(0.56, 0.89, 0.69)
	if kind in ["meeting", "vote", "eject", "chat", "report"]:
		return Color(0.94, 0.78, 0.45)
	return Color(0.68, 0.76, 0.86)


func _event_summary(e: Dictionary) -> String:
	var kind := String(e.get("kind", ""))
	var a := _who(int(_num(e, "actor", -1)))
	var v := _who(int(_num(e, "victim", -1)))
	var rm := String(e.get("room", ""))
	match kind:
		"knife": return "%s 出刀击倒 %s (%s)" % [a, v, rm]
		"shoot": return "%s 开枪击倒 %s (%s)" % [a, v, rm]
		"kill": return "%s 死亡 (%s)" % [v, rm]
		"task": return "%s 完成 %s" % [a, String(e.get("label", ""))]
		"sabotage": return "%s 破坏 %s" % [a, rm]
		"fix": return "%s 修好 %s" % [a, rm]
		"pipe": return "%s 钻管道 %s→%s" % [a, String(e.get("from", "")), String(e.get("to", ""))]
		"report": return "%s 报案 %s (%s)" % [a, v, rm]
		"meeting": return "开启会议 (%s)" % String(e.get("mkind", rm))
		"vote": return "%s 投票 → %s" % [a, "弃权" if int(_num(e, "target", -1)) < 0 else _who(int(_num(e, "target", -1)))]
		"eject": return "%s 被驱逐 (%s)" % [v if v != "—" else a, "内鬼" if bool(e.get("alien", false)) else "人类"]
		"chat": return "%s: %s" % [String(e.get("who", a)), String(e.get("text", "")).substr(0, 36)]
		_: return "%s %s %s" % [kind, a, rm]


## 事件信封允许 actor/victim 为 null，避免 int(null) 报错
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
		lines.append("%3d  第%d夜 %6.1fs  %s" % [n, int(_num(e, "night", 0)), float(_num(e, "pt", 0.0)), _event_summary(e)])
	if lines.is_empty():
		lines.append("（本局还没有事件）")
	return "\n".join(lines)


func close_all() -> void:
	_playing = false
	if settings_panel != null:
		settings_panel.visible = false
	if replay_panel != null:
		replay_panel.visible = false
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func any_open() -> bool:
	return (settings_panel != null and settings_panel.visible) \
		or (replay_panel != null and replay_panel.visible)
