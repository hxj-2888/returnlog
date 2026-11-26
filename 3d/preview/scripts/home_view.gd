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

## 身份 → 高亮舱室 / 高亮图元 / 主题色 / 说明。与 2.5D V1.0 home.js#ANCHOR 一致。
var ROLES := [
	{
		"id": "human", "title": "人 类", "where": "26 个任务点",
		"desc": "做任务推维修进度 · 搜尸取证 · 会议上投票",
		"acc": Color(0.5608, 0.6510, 0.7529),
		"rooms": ["ecosys", "engine", "power", "med", "armory", "cam", "warehouse", "transit", "fun"],
		"what": "point",
		"note": "每人派发 1 高难 + 3 普通共 4 个任务点，站桩维修（普通 8 秒 / 高难 12 秒 / 电路 15 秒）。\n发现尸体按 R 拉铃开会，凭目击证据投票把人驱逐出舱。人类修满 48 分即返航。",
	},
	{
		"id": "alien", "title": "内 鬼", "where": "8 个管道口",
		"desc": "出刀 · 钻管道 · 破坏舱室 · 伪装成人在开会",
		"acc": Color(0.8784, 0.3412, 0.3098),
		"rooms": ["engine", "cam", "armory", "warehouse", "transit", "med", "ecosys", "fun"],
		"what": "pipe",
		"note": "每夜一次出刀、一次破坏；可以钻管道口瞬移。\n同类之间没有队友名单——只有亲眼看见对方出刀 / 钻管道 / 破坏，才会认出他是队友。",
	},
	{
		"id": "spect", "title": "旁观者", "where": "中央会议室",
		"desc": "第 16 人：全知视角的高速幽灵，不参与对局",
		"acc": Color(0.4980, 0.8275, 0.9412),
		"rooms": ["bridge"], "what": "none", "util": true,
		"note": "第 16 人：全知无碰撞的自由相机（WASD + 空格/Ctrl 升降），不发言、不投票、不做任务。",
	},
	{
		"id": "design", "title": "设计者 · 纯净", "where": "静态沙盒",
		"desc": "静态沙盒：穿墙漫游全船，检视 26 任务点与管道",
		"acc": Color(0.3882, 0.8784, 0.6588),
		"rooms": ["bridge", "cam", "ecosys", "power", "transit", "fun", "engine", "med", "armory", "warehouse"],
		"what": "point", "util": true,
		"note": "纯净沙盒视角：自由穿墙全知漫游，检视舱室布局、任务点、门禁与管道口。",
	},
]

const MODES := [
	{"id": "trio", "title": "经 典 局", "desc": "15 人 · 3 内鬼 · 三名内鬼互相认脸", "acc": Color(0.9412, 0.6353, 0.4196)},
	{"id": "classic", "title": "盲 鬼 局", "desc": "15 人 · 4 内鬼 · 开局互不相识", "acc": Color(0.5608, 0.6510, 0.7529)},
]
const ROSTER_CFG := "user://roster.cfg"
const DEFAULT_NAMES := ["星尘", "银翼", "北极", "磷火", "铁砧", "罗盘", "苍鹭", "玄武岩",
	"游隼", "回声", "子夜", "砂岩", "灯塔", "青霜", "归零"]
const EXTRA_NAMES := ["望舒", "启明", "天枢", "摇光", "长庚", "霜降", "白露", "惊蛰",
	"谷雨", "重明", "烛龙", "羲和", "望海", "孤星", "夜航", "远山", "潮汐", "风雪", "灯影", "断章"]

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
var _mode_btns: Dictionary = {}
var _mode_bar: HBoxContainer
var _roster_panel: PanelContainer
var _roster_me_edit: LineEdit
var _roster_ai_edits: Array = []
var _selected := "human"
var selected_mode := "trio"
var _built := false


func setup(p_map: Dictionary) -> void:
	map = p_map
	if is_inside_tree():
		_build()


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	font = UIFont.get_font()
	if not map.is_empty():
		_build()


func _build_backdrop() -> void:
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
	ship.anchor_left = 0.40
	ship.anchor_right = 1.0
	ship.anchor_top = 0.0
	ship.anchor_bottom = 1.0
	ship.offset_left = 10
	ship.offset_right = -18
	ship.offset_top = 16
	ship.offset_bottom = -16
	ship.font = font
	add_child(ship)
	ship.setup(map)

	# ---- 左侧面板遮罩与 #232C39 右细线（对齐原版 #pick .panel） ----
	var panel_bg := TextureRect.new()
	panel_bg.anchor_left = 0.0
	panel_bg.anchor_right = 0.40
	panel_bg.anchor_top = 0.0
	panel_bg.anchor_bottom = 1.0
	panel_bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	panel_bg.stretch_mode = TextureRect.STRETCH_SCALE
	var pgrad := Gradient.new()
	pgrad.offsets = PackedFloat32Array([0.0, 0.62, 0.88, 1.0])
	pgrad.colors = PackedColorArray([
		Color.html("#080B11"),
		Color.html("#080B11"),
		Color(0.031, 0.043, 0.067, 0.74),
		Color(0.031, 0.043, 0.067, 0.0),
	])
	var ptex := GradientTexture2D.new()
	ptex.gradient = pgrad
	ptex.fill = GradientTexture2D.FILL_LINEAR
	ptex.fill_from = Vector2(0.0, 0.5)
	ptex.fill_to = Vector2(1.0, 0.5)
	ptex.width = 256
	ptex.height = 16
	panel_bg.texture = ptex
	panel_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(panel_bg)

	var panel_border := ColorRect.new()
	panel_border.color = C_BORDER
	panel_border.anchor_left = 0.40
	panel_border.anchor_right = 0.40
	panel_border.anchor_top = 0.0
	panel_border.anchor_bottom = 1.0
	panel_border.offset_left = 0
	panel_border.offset_right = 1
	panel_border.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(panel_border)

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


func _build() -> void:
	if _built:
		return
	_built = true
	_build_backdrop()

	# ---- 左侧面板 ----
	var panel := MarginContainer.new()
	panel.anchor_bottom = 1.0
	panel.offset_left = 36
	panel.offset_right = 500
	panel.offset_top = 20
	panel.offset_bottom = -18
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(panel)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(box)

	# 品牌行（对齐 2.5D V1.0）
	var brand_row := HBoxContainer.new()
	brand_row.add_theme_constant_override("separation", 8)
	brand_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var bdot := Panel.new()
	bdot.custom_minimum_size = Vector2(7, 7)
	bdot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var bdsb := StyleBoxFlat.new()
	bdsb.bg_color = C_GOLD
	bdsb.set_corner_radius_all(4)
	bdot.add_theme_stylebox_override("panel", bdsb)
	brand_row.add_child(bdot)
	brand_row.add_child(_label("RETURN LOG · 3D 版 · 返航录V1.0 (" + Config.label() + ")", 11, Color(0.486, 0.529, 0.596)))
	box.add_child(brand_row)

	# 标题（2.5D V1.0 同款暖金色）
	var title := _label("新 返 航 录", 34, C_GOLD)
	title.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
	title.add_theme_constant_override("shadow_offset_y", 2)
	box.add_child(title)

	var sub := _label("同一艘船上，人类与内鬼共处 —— 经典局 15 人 3 鬼（三名内鬼互相认脸）、" +
		"盲鬼局 15 人 4 鬼（互不相识）。白天凭证据投票，夜里暗处出刀，修满 48 分返航。", 11, C_DIM)
	sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sub.custom_minimum_size = Vector2(440, 0)
	box.add_child(sub)

	# 对局模式切换（2.5D V1.0 modebar）
	box.add_child(_label("对 局 模 式", 10, Color(0.306, 0.353, 0.412)))
	_mode_bar = HBoxContainer.new()
	_mode_bar.add_theme_constant_override("separation", 8)
	for ms: Dictionary in MODES:
		_mode_bar.add_child(_make_mode_btn(ms))
	box.add_child(_mode_bar)

	# 身份卡 + 观战与沙盒工具分组
	var util_added := false
	for spec: Dictionary in ROLES:
		if bool(spec.get("util", false)) and not util_added:
			util_added = true
			box.add_child(_label("观 战 与 沙 盒 工 具", 10, Color(0.333, 0.376, 0.435)))
		box.add_child(_make_role_card(spec))

	box.add_child(_spacer(2))

	# 进入按钮 + 玩法说明 + 名单 + 设置（对齐 2.5D V1.0 CTA 栏）
	box.add_child(_build_cta_row())

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
		[48, "分返航"],
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
	var foot := _label("地图 / 任务 / 规则数值与 2.5D V1.0 同源", 10, C_FAINT)
	box.add_child(foot)

	_build_roster_panel()
	_select_mode("trio")
	_select("human")


func _build_cta_row() -> HBoxContainer:
	go_button = Button.new()
	go_button.text = "进 入 舱 段"
	go_button.custom_minimum_size = Vector2(0, 42)
	go_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	go_button.focus_mode = Control.FOCUS_NONE
	go_button.add_theme_font_override("font", font)
	go_button.add_theme_font_size_override("font_size", 14)
	go_button.add_theme_color_override("font_color", C_GOLD)
	go_button.add_theme_color_override("font_hover_color", Color(1.0, 0.88, 0.62))
	_style(go_button, Color(0.165, 0.141, 0.086), C_GOLD, 11)
	go_button.pressed.connect(_on_go)
	var cta := HBoxContainer.new()
	cta.add_theme_constant_override("separation", 8)
	cta.add_child(go_button)
	for spec: Array in [
		["玩法说明", 76, Callable(self, "_show_rules_note")],
		["名 单", 60, Callable(self, "_toggle_roster_panel")],
		["设 置", 60, func() -> void: settings_requested.emit()],
	]:
		var b := Button.new()
		b.text = String(spec[0])
		b.custom_minimum_size = Vector2(int(spec[1]), 42)
		b.focus_mode = Control.FOCUS_NONE
		b.add_theme_font_override("font", font)
		b.add_theme_font_size_override("font_size", 12)
		b.add_theme_color_override("font_color", Color(0.86, 0.90, 0.96))
		_style(b, C_PANEL, C_BORDER, 11)
		b.pressed.connect(spec[2] as Callable)
		cta.add_child(b)
	return cta


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


func _make_mode_btn(spec: Dictionary) -> Button:
	var acc: Color = spec.get("acc", C_GOLD)
	var mid := String(spec.get("id", "trio"))
	var btn := Button.new()
	btn.toggle_mode = true
	btn.focus_mode = Control.FOCUS_NONE
	btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn.custom_minimum_size = Vector2(0, 48)
	btn.add_theme_stylebox_override("normal", _frame(Color(0.051, 0.071, 0.102, 0.72), C_BORDER, 10))
	btn.add_theme_stylebox_override("hover", _frame(Color(0.067, 0.102, 0.141, 0.92), acc, 10))
	btn.add_theme_stylebox_override("pressed", _frame(Color(0.067, 0.102, 0.141, 0.95), acc, 10))
	btn.add_theme_stylebox_override("focus", _frame(Color(0.051, 0.071, 0.102, 0.72), C_BORDER, 10))
	var col := VBoxContainer.new()
	col.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	col.offset_left = 11
	col.offset_right = -10
	col.offset_top = 6
	col.offset_bottom = -6
	col.add_theme_constant_override("separation", 1)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(_label(String(spec.get("title", "")), 12, acc))
	col.add_child(_label(String(spec.get("desc", "")), 9, C_DIM))
	btn.add_child(col)
	btn.pressed.connect(func() -> void: _select_mode(mid))
	_mode_btns[mid] = btn
	return btn


func _select_mode(mid: String) -> void:
	selected_mode = mid
	for k: String in _mode_btns.keys():
		(_mode_btns[k] as Button).button_pressed = (k == mid)


func _show_rules_note() -> void:
	if note_label != null:
		note_label.text = "昼夜循环：白天会议（发言→投票→驱逐）→ 夜晚行动 → 结算进度。\n" + \
			"WASD 移动，E 交互，左键出刀（内鬼），右键开枪，R 报告尸体，F 施救，V 监控，修满 48 分或清出全部内鬼即胜。"
		note_label.add_theme_color_override("font_color", Color(0.70, 0.78, 0.88))


func _make_role_card(spec: Dictionary) -> Button:
	var acc: Color = spec.get("acc", C_GOLD)
	var card := Button.new()
	card.toggle_mode = true
	card.focus_mode = Control.FOCUS_NONE
	card.custom_minimum_size = Vector2(0, 48 if bool(spec.get("util", false)) else 52)
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

	var where_txt := String(spec.get("where", ""))
	if String(spec.get("id", "")) == "human" and map.has("points"):
		where_txt = "%d 个任务点" % map.get("points", []).size()
	elif String(spec.get("id", "")) == "alien" and map.has("pipes"):
		where_txt = "%d 个管道口" % map.get("pipes", []).size()
	var w := _label(where_txt, 10, Color(0.333, 0.376, 0.435))
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
	var is_util := rid == "spect" or rid == "design"
	if _mode_bar != null:
		_mode_bar.modulate = Color(1, 1, 1, 0.42 if is_util else 1.0)
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
	if _roster_panel != null and _roster_panel.visible:
		_collect_and_save_roster()
	start_requested.emit(_selected)


static func _clean_name(s: String) -> String:
	var out := ""
	for i in s.length():
		var c := s.substr(i, 1)
		if c.strip_edges() != "" and not (c in ["/", "\\", ":", "*", "?", "\"", "<", ">", "|", "\n", "\r", "\t"]):
			out += c
		if out.length() >= 6:
			break
	return out


static func load_roster() -> Dictionary:
	var cfg := ConfigFile.new()
	cfg.load(ROSTER_CFG)
	var me := _clean_name(String(cfg.get_value("roster", "me", DEFAULT_NAMES[0])))
	if me == "":
		me = DEFAULT_NAMES[0]
	var raw_ai: Variant = cfg.get_value("roster", "ai", [])
	var ai: Array = []
	var used: Dictionary = {me: true}
	var pool: Array = []
	for n: String in DEFAULT_NAMES:
		pool.append(n)
	for n: String in EXTRA_NAMES:
		pool.append(n)
	if raw_ai is Array:
		for k in mini((raw_ai as Array).size(), 14):
			var nm := _clean_name(String((raw_ai as Array)[k]))
			if nm != "" and not used.has(nm):
				used[nm] = true
				ai.append(nm)
			else:
				ai.append("")
	while ai.size() < 14:
		ai.append("")
	for k in 14:
		if String(ai[k]) == "":
			var pick := ""
			for cand: String in pool:
				if not used.has(cand):
					pick = cand
					break
			if pick == "":
				pick = "席位%d" % (k + 2)
			used[pick] = true
			ai[k] = pick
	return {"me": me, "ai": ai}


static func save_roster(me: String, ai: Array) -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("roster", "me", me)
	cfg.set_value("roster", "ai", ai)
	cfg.save(ROSTER_CFG)


static func apply_roster(sim_obj) -> void:
	if sim_obj == null or not (sim_obj.agents is Array) or sim_obj.agents.size() < 15:
		return
	var r := load_roster()
	var me_name := String(r.get("me", DEFAULT_NAMES[0]))
	var ai_names: Array = r.get("ai", []) as Array
	var ai_k := 0
	for i in sim_obj.agents.size():
		var a: Dictionary = sim_obj.agents[i] as Dictionary
		if i == int(sim_obj.me_idx):
			a["name"] = me_name
		elif ai_k < ai_names.size():
			a["name"] = String(ai_names[ai_k])
			ai_k += 1


func _build_roster_panel() -> void:
	_roster_panel = PanelContainer.new()
	_roster_panel.anchor_left = 0.42
	_roster_panel.anchor_right = 0.96
	_roster_panel.anchor_top = 0.12
	_roster_panel.anchor_bottom = 0.88
	_roster_panel.visible = false
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.035, 0.051, 0.078, 0.96)
	sb.border_color = C_GOLD
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(12)
	sb.content_margin_left = 18
	sb.content_margin_right = 18
	sb.content_margin_top = 14
	sb.content_margin_bottom = 14
	_roster_panel.add_theme_stylebox_override("panel", sb)
	add_child(_roster_panel)

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 10)
	_roster_panel.add_child(vb)

	vb.add_child(_label("本 局 名 单  ·  你 + 14 AI", 18, C_GOLD))
	vb.add_child(_label("自定义本局 15 名船员姓名（最多 6 字，自动去重并持久化到本机 user://roster.cfg）", 11, C_DIM))

	var me_row := HBoxContainer.new()
	me_row.add_theme_constant_override("separation", 10)
	var me_lbl := _label("你的名字", 12, C_TEXT)
	me_lbl.custom_minimum_size = Vector2(72, 0)
	me_row.add_child(me_lbl)
	_roster_me_edit = _make_name_edit()
	_roster_me_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	me_row.add_child(_roster_me_edit)
	vb.add_child(me_row)

	vb.add_child(_label("14 名 AI 船员", 11, C_DIM))
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_roster_ai_edits.clear()
	for k in 14:
		var ed := _make_name_edit()
		ed.placeholder_text = "AI %d" % (k + 1)
		ed.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(ed)
		_roster_ai_edits.append(ed)
	vb.add_child(grid)

	var btns := HBoxContainer.new()
	btns.add_theme_constant_override("separation", 8)
	var rand_b := Button.new()
	rand_b.text = "随机名字"
	rand_b.custom_minimum_size = Vector2(0, 34)
	rand_b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rand_b.add_theme_font_override("font", font)
	rand_b.add_theme_font_size_override("font_size", 12)
	rand_b.add_theme_color_override("font_color", C_TEXT)
	_style(rand_b, C_PANEL, C_BORDER, 8)
	rand_b.pressed.connect(_random_roster)
	btns.add_child(rand_b)
	var reset_b := Button.new()
	reset_b.text = "恢复默认"
	reset_b.custom_minimum_size = Vector2(0, 34)
	reset_b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	reset_b.add_theme_font_override("font", font)
	reset_b.add_theme_font_size_override("font_size", 12)
	reset_b.add_theme_color_override("font_color", C_TEXT)
	_style(reset_b, C_PANEL, C_BORDER, 8)
	reset_b.pressed.connect(_reset_roster)
	btns.add_child(reset_b)
	var save_b := Button.new()
	save_b.text = "保存并关闭"
	save_b.custom_minimum_size = Vector2(0, 34)
	save_b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	save_b.add_theme_font_override("font", font)
	save_b.add_theme_font_size_override("font_size", 12)
	save_b.add_theme_color_override("font_color", C_GOLD)
	_style(save_b, Color(0.165, 0.141, 0.086), C_GOLD, 8)
	save_b.pressed.connect(func() -> void:
		_collect_and_save_roster()
		_roster_panel.visible = false)
	btns.add_child(save_b)
	vb.add_child(btns)
	_fill_roster_inputs(load_roster())


func _make_name_edit() -> LineEdit:
	var ed := LineEdit.new()
	ed.max_length = 6
	ed.custom_minimum_size = Vector2(0, 32)
	ed.add_theme_font_override("font", font)
	ed.add_theme_font_size_override("font_size", 12)
	ed.add_theme_color_override("font_color", C_TEXT)
	ed.add_theme_stylebox_override("normal", _frame(Color(0.06, 0.085, 0.125), C_BORDER, 6))
	ed.add_theme_stylebox_override("focus", _frame(Color(0.08, 0.115, 0.165), C_GOLD, 6))
	return ed


func _fill_roster_inputs(r: Dictionary) -> void:
	if _roster_me_edit != null:
		_roster_me_edit.text = String(r.get("me", DEFAULT_NAMES[0]))
	var ai: Array = r.get("ai", []) as Array
	for k in mini(_roster_ai_edits.size(), ai.size()):
		(_roster_ai_edits[k] as LineEdit).text = String(ai[k])


func _collect_and_save_roster() -> void:
	var me := _clean_name(_roster_me_edit.text if _roster_me_edit != null else "")
	if me == "":
		me = DEFAULT_NAMES[0]
	var used: Dictionary = {me: true}
	var ai: Array = []
	var pool: Array = []
	for n: String in DEFAULT_NAMES:
		pool.append(n)
	for n: String in EXTRA_NAMES:
		pool.append(n)
	for k in _roster_ai_edits.size():
		var nm := _clean_name((_roster_ai_edits[k] as LineEdit).text)
		if nm == "" or used.has(nm):
			for cand: String in pool:
				if not used.has(cand):
					nm = cand
					break
		used[nm] = true
		ai.append(nm)
	save_roster(me, ai)
	_fill_roster_inputs({"me": me, "ai": ai})


func _random_roster() -> void:
	var pool: Array = []
	for n: String in DEFAULT_NAMES:
		pool.append(n)
	for n: String in EXTRA_NAMES:
		pool.append(n)
	pool.shuffle()
	var me := String(pool[0])
	var ai: Array = []
	for k in 14:
		ai.append(String(pool[k + 1]))
	save_roster(me, ai)
	_fill_roster_inputs({"me": me, "ai": ai})


func _reset_roster() -> void:
	var ai: Array = []
	for k in range(1, 15):
		ai.append(DEFAULT_NAMES[k])
	save_roster(DEFAULT_NAMES[0], ai)
	_fill_roster_inputs({"me": DEFAULT_NAMES[0], "ai": ai})


func _toggle_roster_panel() -> void:
	if _roster_panel == null:
		return
	if _roster_panel.visible:
		_collect_and_save_roster()
		_roster_panel.visible = false
	else:
		_fill_roster_inputs(load_roster())
		_roster_panel.visible = true


func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and torch != null:
		var mp := (event as InputEventMouseMotion).position
		torch.position = mp - torch.size * 0.5
	elif event is InputEventKey and (event as InputEventKey).pressed:
		var k := (event as InputEventKey).keycode
		if k == KEY_ENTER or k == KEY_KP_ENTER:
			_on_go()
			get_viewport().set_input_as_handled()
