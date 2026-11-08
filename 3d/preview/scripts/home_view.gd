extends Control
## 3D 版开始页：版式 / 文案 / 配色逐项照搬 2.5D 的 `js/ui/home.js` + `index.html#pick`。
## - 左：品牌 / 标题 / 三张身份卡 / 进入 / 统计 / 身份说明 / 页脚
## - 右：整船蓝图（home_ship_map.gd，直接读 map_v2.json，与对局同一份数据）
## - 手电光斑跟随鼠标（2.5D 是 mix-blend-mode:screen 的径向光）
##
## 边界：本控件只发 `start_requested(role)`，不碰 sim / 玩家 / 场景；
## 选身份后的席位分配由 main.gd 做（和 2.5D 的 `#home-go` 由 main.js 驱动同构）。

signal start_requested(role: String)
signal settings_requested()

const ShipMapScript := preload("res://scripts/home_ship_map.gd")
const Config := preload("res://scripts/config.gd")

## 身份 → 高亮舱室 / 高亮图元 / 主题色 / 说明。与 2.5D home.js#ANCHOR 一致。
var ROLES := [
	{
		"id": "human", "title": "人 类", "where": "26 个任务点",
		"desc": "做任务推维修进度 · 搜尸取证 · 会议上投票",
		"acc": Color(0.5608, 0.6510, 0.7529),
		"rooms": ["ecosys", "engine", "power", "med", "armory", "cam", "warehouse", "transit", "fun"],
		"what": "point",
		"note": "每人派发 1 高难 + 3 普通共 4 个任务点，站桩维修（普通 8 秒 / 高难 12 秒）。\n发现尸体按 E 报告，凭目击证据投票把人驱逐出舱。人类修满 45 分即返航。",
	},
	{
		"id": "alien", "title": "异 形", "where": "8 个管道口",
		"desc": "出刀 · 钻管道 · 破坏舱室 · 伪装成人在开会",
		"acc": Color(0.8784, 0.3412, 0.3098),
		"rooms": ["engine", "cam", "armory", "warehouse", "transit", "med"],
		"what": "pipe",
		"note": "每夜一次出刀、一次破坏；可以钻管道口瞬移。\n同类之间没有队友名单——只有亲眼看见对方出刀 / 钻管道，才会认出他是队友。",
	},
	{
		"id": "spect", "title": "旁观者", "where": "3D 待接入",
		"desc": "第 16 人：全知视角的高速幽灵，不参与对局",
		"acc": Color(0.4980, 0.8275, 0.9412),
		"rooms": ["bridge"], "what": "none",
		"note": "第 16 人：全知无碰撞的自由相机（WASD + 空格/Ctrl 升降），不发言、不投票、不做任务。",
	},
]

const C_BG := Color(0.0157, 0.0235, 0.0392)
const C_PANEL := Color(0.0510, 0.0706, 0.1020, 0.86)
const C_BORDER := Color(0.1373, 0.1725, 0.2235)
const C_TEXT := Color(0.8588, 0.8980, 0.9412)
const C_DIM := Color(0.4863, 0.5294, 0.5961)
const C_FAINT := Color(0.2980, 0.3333, 0.3882)
const C_GOLD := Color(0.9412, 0.7765, 0.4549)

var map: Dictionary = {}
var font: Font
var ship
var torch: TextureRect
var note_label: Label
var go_button: Button
var _cards: Dictionary = {}
var _selected := "human"
var _built := false


func setup(p_map: Dictionary) -> void:
	map = p_map
	if is_inside_tree():
		_build()


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	font = SystemFont.new()
	font.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])
	if not map.is_empty():
		_build()


func _build() -> void:
	if _built:
		return
	_built = true

	# ---- 背景：深空径向渐变 ----
	var bg := TextureRect.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_SCALE
	var grad := Gradient.new()
	grad.set_color(0, Color(0.0549, 0.0824, 0.1333))
	grad.set_color(1, Color(0.0157, 0.0235, 0.0392))
	var tex := GradientTexture2D.new()
	tex.gradient = grad
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.64, 0.46)
	tex.fill_to = Vector2(1.10, 1.10)
	tex.width = 512
	tex.height = 512
	bg.texture = tex
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)

	# ---- 右侧：整船蓝图 ----
	ship = ShipMapScript.new()
	ship.anchor_left = 0.36
	ship.anchor_right = 1.0
	ship.anchor_top = 0.0
	ship.anchor_bottom = 1.0
	ship.offset_left = 4
	ship.offset_right = -18
	ship.offset_top = 16
	ship.offset_bottom = -16
	ship.font = font
	add_child(ship)
	ship.setup(map)

	# ---- 手电光斑 ----
	torch = TextureRect.new()
	torch.size = Vector2(560, 560)
	torch.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	torch.stretch_mode = TextureRect.STRETCH_SCALE
	var tg := Gradient.new()
	tg.set_color(0, Color(0.588, 0.843, 1.0, 0.20))
	tg.set_color(1, Color(0.588, 0.843, 1.0, 0.0))
	var ttex := GradientTexture2D.new()
	ttex.gradient = tg
	ttex.fill = GradientTexture2D.FILL_RADIAL
	ttex.fill_from = Vector2(0.5, 0.5)
	ttex.fill_to = Vector2(1.0, 0.5)
	ttex.width = 256
	ttex.height = 256
	torch.texture = ttex
	var mat := CanvasItemMaterial.new()
	mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	torch.material = mat
	torch.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(torch)
	# 默认落在船体中心偏右，避免没动鼠标时左上角一片黑
	torch.position = Vector2(1080, 420)

	# ---- 左侧面板 ----
	var panel := MarginContainer.new()
	panel.anchor_bottom = 1.0
	panel.offset_left = 44
	panel.offset_right = 500
	panel.offset_top = 30
	panel.offset_bottom = -26
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(panel)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 12)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(box)

	# 品牌行
	var brand := _label("RETURN LOG · 3D 预演 · " + Config.label(), 11, Color(0.42, 0.46, 0.52))
	box.add_child(brand)

	# 标题
	var title := _label("新 返 航 录", 40, C_TEXT)
	title.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
	title.add_theme_constant_override("shadow_offset_y", 2)
	box.add_child(title)

	var sub := _label("同一艘船上，11 名人类与 4 名异形共处。白天在会议桌前凭证据投票，" +
		"夜里在手电照不到的地方被出刀。修满 45 分返航，或者一个人都回不去。", 12, C_DIM)
	sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sub.custom_minimum_size = Vector2(430, 0)
	box.add_child(sub)

	box.add_child(_spacer(6))

	# 身份卡
	for spec: Dictionary in ROLES:
		box.add_child(_make_role_card(spec))

	box.add_child(_spacer(4))

	# 进入按钮
	go_button = Button.new()
	go_button.text = "进 入 舱 段"
	go_button.custom_minimum_size = Vector2(0, 46)
	go_button.focus_mode = Control.FOCUS_NONE
	go_button.add_theme_font_override("font", font)
	go_button.add_theme_font_size_override("font_size", 15)
	go_button.add_theme_color_override("font_color", C_GOLD)
	go_button.add_theme_color_override("font_hover_color", Color(1.0, 0.88, 0.62))
	_style(go_button, Color(0.165, 0.141, 0.086), C_GOLD, 11)
	go_button.pressed.connect(_on_go)
	var cta := HBoxContainer.new()
	cta.add_theme_constant_override("separation", 9)
	cta.add_child(go_button)
	var set_btn := Button.new()
	set_btn.text = "设 置"
	set_btn.custom_minimum_size = Vector2(90, 46)
	set_btn.add_theme_font_size_override("font_size", 13)
	set_btn.add_theme_color_override("font_color", Color(0.86, 0.90, 0.96))
	var ssb := StyleBoxFlat.new()
	ssb.bg_color = Color(0.051, 0.071, 0.102, 0.86)
	ssb.border_color = C_BORDER
	ssb.set_border_width_all(1)
	ssb.set_corner_radius_all(11)
	set_btn.add_theme_stylebox_override("normal", ssb)
	set_btn.pressed.connect(func() -> void: settings_requested.emit())
	cta.add_child(set_btn)
	box.add_child(cta)

	# 统计 chips
	var chips := HFlowContainer.new()
	chips.add_theme_constant_override("h_separation", 6)
	chips.add_theme_constant_override("v_separation", 6)
	chips.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var stats: Array = [
		[map.get("rooms", []).size(), "舱室"],
		[map.get("cover", []).size(), "硬掩体"],
		[map.get("points", []).size(), "任务点"],
		[_count_hard(), "高难"],
		[map.get("pipes", []).size(), "管道口"],
		[45, "分返航"],
	]
	for it: Array in stats:
		chips.add_child(_chip(int(it[0]), String(it[1])))
	box.add_child(chips)

	# 身份说明
	note_label = _label("", 11, Color(0.60, 0.65, 0.72))
	note_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	note_label.custom_minimum_size = Vector2(430, 56)
	box.add_child(note_label)

	var fill := Control.new()
	fill.size_flags_vertical = Control.SIZE_EXPAND_FILL
	fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(fill)

	# 页脚
	var line := ColorRect.new()
	line.color = C_BORDER
	line.custom_minimum_size = Vector2(0, 1)
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(line)
	var foot := _label("地图 / 任务 / 空间数值取自 2.5D 真源 · 美术下一批优化", 10, C_FAINT)
	box.add_child(foot)

	_select("human")


func _count_hard() -> int:
	var n := 0
	for p: Dictionary in map.get("points", []):
		if String(p.get("kind", "")) == "hard":
			n += 1
	return n


func _spacer(h: float) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(0, h)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


func _label(txt: String, fs: int, col: Color) -> Label:
	var l := Label.new()
	l.text = txt
	l.add_theme_font_override("font", font)
	l.add_theme_font_size_override("font_size", fs)
	l.add_theme_color_override("font_color", col)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


func _frame(bg: Color, border: Color, radius: int) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(radius)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 9
	sb.content_margin_bottom = 9
	return sb


func _style(b: Button, bg: Color, border: Color, radius: int) -> void:
	b.add_theme_stylebox_override("normal", _frame(bg, border, radius))
	b.add_theme_stylebox_override("hover", _frame(bg.lightened(0.08), border, radius))
	b.add_theme_stylebox_override("pressed", _frame(bg.lightened(0.12), border, radius))
	b.add_theme_stylebox_override("focus", _frame(bg, border, radius))


func _make_role_card(spec: Dictionary) -> Button:
	var acc: Color = spec.get("acc", C_GOLD)
	var card := Button.new()
	card.toggle_mode = true
	card.focus_mode = Control.FOCUS_NONE
	card.custom_minimum_size = Vector2(0, 58)
	card.add_theme_stylebox_override("normal", _frame(C_PANEL, C_BORDER, 11))
	card.add_theme_stylebox_override("hover", _frame(Color(0.067, 0.102, 0.141, 0.92), acc, 11))
	card.add_theme_stylebox_override("pressed", _frame(Color(0.067, 0.102, 0.141, 0.92), acc, 11))
	card.add_theme_stylebox_override("focus", _frame(C_PANEL, C_BORDER, 11))

	var row := HBoxContainer.new()
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	row.offset_left = 13
	row.offset_right = -12
	row.add_theme_constant_override("separation", 11)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.add_child(row)

	# 圆点
	var dot_host := CenterContainer.new()
	dot_host.custom_minimum_size = Vector2(12, 0)
	dot_host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var dot := Panel.new()
	dot.custom_minimum_size = Vector2(9, 9)
	dot.size = Vector2(9, 9)
	var dsb := StyleBoxFlat.new()
	dsb.bg_color = Color(acc.r, acc.g, acc.b, 0.55)
	dsb.set_corner_radius_all(5)
	dot.add_theme_stylebox_override("panel", dsb)
	dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dot_host.add_child(dot)
	row.add_child(dot_host)

	# 标题 + 描述
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 1)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var t := _label(String(spec.get("title", "")), 14, acc)
	col.add_child(t)
	var d := _label(String(spec.get("desc", "")), 11, Color(0.486, 0.529, 0.596))
	col.add_child(d)
	row.add_child(col)

	var w := _label(String(spec.get("where", "")), 10, Color(0.333, 0.376, 0.435))
	w.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(w)

	if bool(spec.get("disabled", false)):
		card.disabled = true
		card.modulate = Color(1, 1, 1, 0.55)
	else:
		var rid := String(spec.get("id", ""))
		card.pressed.connect(func() -> void: _select(rid))

	_cards[String(spec.get("id", ""))] = {"card": card, "dot": dot, "spec": spec}
	return card


func _chip(n: int, label: String) -> Control:
	var pc := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.047, 0.067, 0.094, 0.7)
	sb.border_color = C_BORDER
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(20)
	sb.content_margin_left = 9
	sb.content_margin_right = 9
	sb.content_margin_top = 4
	sb.content_margin_bottom = 4
	pc.add_theme_stylebox_override("panel", sb)
	pc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 5)
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_child(_label(str(n), 12, Color(0.725, 0.776, 0.839)))
	var t := _label(label, 10, Color(0.486, 0.529, 0.596))
	t.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	h.add_child(t)
	pc.add_child(h)
	return pc


func _select(rid: String) -> void:
	_selected = rid
	for key: String in _cards.keys():
		var ent: Dictionary = _cards[key]
		var card: Button = ent["card"]
		var spec: Dictionary = ent["spec"]
		var acc: Color = spec.get("acc", C_GOLD)
		var on := key == rid
		if not bool(spec.get("disabled", false)):
			card.button_pressed = on
		var dot: Panel = ent["dot"]
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(acc.r, acc.g, acc.b, 1.0 if on else 0.55)
		sb.set_corner_radius_all(5)
		dot.add_theme_stylebox_override("panel", sb)
		if on:
			dot.add_theme_color_override("self_modulate", acc)
	if note_label != null:
		for spec: Dictionary in ROLES:
			if String(spec.get("id", "")) == rid:
				note_label.text = String(spec.get("note", ""))
				note_label.add_theme_color_override("font_color",
					(Color(0.60, 0.65, 0.72) if not bool(spec.get("disabled", false))
					else Color(0.62, 0.44, 0.42)))
				break
	if ship != null:
		for spec: Dictionary in ROLES:
			if String(spec.get("id", "")) == rid:
				ship.select_rooms(spec.get("rooms", []), String(spec.get("what", "point")),
					spec.get("acc", C_GOLD))
				break


func _on_go() -> void:
	start_requested.emit(_selected)


func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and torch != null:
		var mp := (event as InputEventMouseMotion).position
		torch.position = mp - torch.size * 0.5
	elif event is InputEventKey and (event as InputEventKey).pressed:
		var k := (event as InputEventKey).keycode
		if k == KEY_ENTER or k == KEY_KP_ENTER:
			_on_go()
			get_viewport().set_input_as_handled()
