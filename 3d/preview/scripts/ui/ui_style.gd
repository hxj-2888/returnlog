extends RefCounted
## 统一深炭工业 UI 样式工厂：精确对齐原版色板、圆角卡片、极简分割线与四态按钮。

const BG_PANEL := Color(0.055, 0.071, 0.098, 0.88)
const BG_OVERLAY := Color(0.024, 0.031, 0.047, 0.86)
const BG_DEEP := Color(0.0510, 0.0667, 0.0902)        # #0D1117
const BG_CARD := Color(0.0706, 0.0863, 0.1176)        # #12161E
const BG_SUB := Color(0.0784, 0.1020, 0.1333)         # #141A22
const BG_BTN := Color(0.1137, 0.1451, 0.1882)         # #1D2530
const BG_BTN_HOVER := Color(0.1490, 0.1922, 0.2471)   # #26313F
const BG_BTN_PRESS := Color(0.0824, 0.1098, 0.1451)   # #151C25
const BG_BTN_DISABLED := Color(0.085, 0.105, 0.135, 0.55)
const BG_PRIMARY := Color(0.1647, 0.2902, 0.4196)     # #2A4A6B
const BG_TPL := Color(0.0941, 0.1333, 0.1804)         # #18222E

const BORDER_CARD := Color(0.1647, 0.1961, 0.2510)    # #2A3240
const BORDER_HUD := Color(0.1608, 0.1882, 0.2392)     # #29303D
const BORDER_DIM := Color(0.1922, 0.2314, 0.2941)     # #313B4B
const BORDER_BTN := Color(0.1922, 0.2314, 0.2941)     # #313B4B
const BORDER_BTN_HOVER := Color(0.2627, 0.3255, 0.4196) # #43536B
const BORDER_PRIMARY := Color(0.2353, 0.4000, 0.5647) # #3C6690
const BORDER_TPL := Color(0.1686, 0.2314, 0.2980)     # #2B3B4C
const BORDER_CYAN := Color(0.2000, 0.2745, 0.3608)    # #33465C
const DIVIDER := Color(0.1216, 0.1529, 0.2000)        # #1F2733
const BORDER_GOLD := Color(0.9412, 0.7765, 0.4549)    # #F0C674
const BORDER_RED := Color(0.8784, 0.3412, 0.3098)     # #E0574F
const BORDER_PURPLE := Color(0.3608, 0.3059, 0.5412)  # #5C4E8A

const TEXT_MAIN := Color(0.8667, 0.8902, 0.9255)      # #DDE3EC
const TEXT_CHAT := Color(0.7882, 0.8196, 0.8588)      # #C9D1DB
const TEXT_SUB := Color(0.5412, 0.5804, 0.6392)       # #8A94A3
const TEXT_DIM := Color(0.4863, 0.5294, 0.5961)       # #7C8798
const TEXT_FAINT := Color(0.3686, 0.4196, 0.4863)     # #5E6B7C
const TEXT_TPL := Color(0.6863, 0.7529, 0.8235)       # #AFC0D2
const TEXT_GOLD := Color(0.9412, 0.7765, 0.4549)      # #F0C674
const TEXT_CYAN := Color(0.5608, 0.8275, 0.9412)      # #8FD3F0
const TEXT_GREEN := Color(0.2471, 0.7490, 0.5490)     # #3FBF8C
const TEXT_RED := Color(1.0000, 0.5412, 0.5020)       # #FF8A80
const TEXT_PURPLE := Color(0.6588, 0.5882, 1.0000)    # #A896FF


## 等边距圆角卡片样式盒。
static func card_style(bg: Color = BG_CARD, border: Color = BORDER_CARD,
		radius: int = 10, pad: int = 10, border_w: int = 1) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(border_w)
	sb.set_corner_radius_all(radius)
	if pad > 0:
		sb.set_content_margin_all(pad)
	return sb


## 分轴内边距圆角卡片样式盒。
static func card_style_xy(bg: Color = BG_CARD, border: Color = BORDER_CARD,
		radius: int = 10, pad_x: int = 12, pad_y: int = 9, border_w: int = 1) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(border_w)
	sb.set_corner_radius_all(radius)
	sb.content_margin_left = pad_x
	sb.content_margin_right = pad_x
	sb.content_margin_top = pad_y
	sb.content_margin_bottom = pad_y
	return sb


## 1px 顶部细线透明行容器样式，替代嵌套子框。
static func row_line_style(col: Color = DIVIDER, pad_top: int = 7, pad_bottom: int = 7) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.0, 0.0, 0.0, 0.0)
	sb.border_color = col
	sb.border_width_top = 1
	sb.border_width_left = 0
	sb.border_width_right = 0
	sb.border_width_bottom = 0
	sb.content_margin_left = 0
	sb.content_margin_right = 0
	sb.content_margin_top = pad_top
	sb.content_margin_bottom = pad_bottom
	return sb


## 1px 横向分割线。
static func hr(col: Color = DIVIDER) -> ColorRect:
	var line := ColorRect.new()
	line.color = col
	line.custom_minimum_size = Vector2(0, 1)
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return line


## 圆角胶囊/按钮基础样式盒。
static func pill_style(bg: Color = BG_PANEL, border: Color = BORDER_CYAN,
		radius: int = 14, pad_x: int = 12, pad_y: int = 5) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(radius)
	sb.content_margin_left = pad_x
	sb.content_margin_right = pad_x
	sb.content_margin_top = pad_y
	sb.content_margin_bottom = pad_y
	return sb


## 为 normal / hover / pressed / disabled 分别创建独立 StyleBoxFlat。
static func button_styles(bg: Color = BG_BTN, border: Color = BORDER_BTN,
		radius: int = 8, pad_x: int = 14, pad_y: int = 8) -> Dictionary:
	var hover_bg := BG_BTN_HOVER if bg == BG_BTN else bg.lightened(0.08)
	var hover_border := BORDER_BTN_HOVER if border == BORDER_BTN else border.lightened(0.14)
	var press_bg := BG_BTN_PRESS if bg == BG_BTN else bg.darkened(0.16)
	var press_border := hover_border
	var n := pill_style(bg, border, radius, pad_x, pad_y)
	var h := pill_style(hover_bg, hover_border, radius, pad_x, pad_y)
	var p := pill_style(press_bg, press_border, radius, pad_x, pad_y)
	var d := pill_style(BG_BTN_DISABLED, Color(0.15, 0.19, 0.24, 0.55), radius, pad_x, pad_y)
	return {"normal": n, "hover": h, "pressed": p, "disabled": d}


## 为已有按钮套用深炭工业四态外观与文字色。
static func apply_button(btn: Button, bg: Color = BG_BTN, border: Color = BORDER_BTN,
		font_size: int = 13, radius: int = 8, pad_x: int = 14, pad_y: int = 6,
		text_color: Color = TEXT_MAIN, no_focus: bool = true) -> void:
	var font: Font = UIFont.get_font()
	var styles: Dictionary = button_styles(bg, border, radius, pad_x, pad_y)
	btn.add_theme_font_override("font", font)
	btn.add_theme_font_size_override("font_size", font_size)
	btn.add_theme_stylebox_override("normal", styles["normal"] as StyleBoxFlat)
	btn.add_theme_stylebox_override("hover", styles["hover"] as StyleBoxFlat)
	btn.add_theme_stylebox_override("pressed", styles["pressed"] as StyleBoxFlat)
	btn.add_theme_stylebox_override("disabled", styles["disabled"] as StyleBoxFlat)
	btn.add_theme_color_override("font_color", text_color)
	btn.add_theme_color_override("font_hover_color", Color.WHITE if text_color == TEXT_MAIN else text_color.lightened(0.12))
	btn.add_theme_color_override("font_pressed_color", text_color)
	btn.add_theme_color_override("font_disabled_color", TEXT_FAINT)
	if no_focus:
		btn.focus_mode = Control.FOCUS_NONE


## 创建绑定回调函数与统一样式的按钮。
static func make_button(text: String, cb: Callable, font_size: int = 13,
		bg: Color = BG_BTN, border: Color = BORDER_BTN,
		min_size: Vector2 = Vector2.ZERO, text_color: Color = TEXT_MAIN) -> Button:
	var b := Button.new()
	b.text = text
	if min_size != Vector2.ZERO:
		b.custom_minimum_size = min_size
	apply_button(b, bg, border, font_size, 8, 12, 6, text_color, true)
	if cb.is_valid():
		b.pressed.connect(cb)
	return b


## 创建标签：卡片内文字清晰无描边；3D 画面浮字仅加 2px 轻描边。
static func label(text: String, font_size: int = 13,
		color: Color = TEXT_MAIN, floating: bool = false) -> Label:
	var lb := Label.new()
	lb.text = text
	lb.add_theme_font_override("font", UIFont.get_font())
	lb.add_theme_font_size_override("font_size", font_size)
	lb.add_theme_color_override("font_color", color)
	if floating:
		lb.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.88))
		lb.add_theme_constant_override("outline_size", 2)
	lb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return lb


## 构建进度条的无边框底槽与填充样式盒。
static func apply_progress(bar: ProgressBar, fill_col: Color = TEXT_GREEN,
		bg_col: Color = Color(0.1333, 0.1569, 0.2000), radius: int = 3) -> void:
	var bg := StyleBoxFlat.new()
	bg.bg_color = bg_col
	bg.set_border_width_all(0)
	bg.set_corner_radius_all(radius)
	var fill := StyleBoxFlat.new()
	fill.bg_color = fill_col
	fill.set_corner_radius_all(radius)
	bar.add_theme_stylebox_override("background", bg)
	bar.add_theme_stylebox_override("fill", fill)
	bar.show_percentage = false


## 为输入框应用深炭边框与背景。
static func apply_line_edit(le: LineEdit, font_size: int = 13) -> void:
	le.add_theme_font_override("font", UIFont.get_font())
	le.add_theme_font_size_override("font_size", font_size)
	le.add_theme_stylebox_override("normal", card_style_xy(BG_DEEP, BORDER_BTN, 8, 10, 6, 1))
	le.add_theme_stylebox_override("focus", card_style_xy(BG_DEEP, BORDER_GOLD, 8, 10, 6, 1))
	le.add_theme_stylebox_override("read_only", card_style_xy(Color(0.0392, 0.0549, 0.0745), Color(0.1647, 0.2078, 0.2588), 8, 10, 6, 1))
	le.add_theme_color_override("font_color", TEXT_MAIN)
	le.add_theme_color_override("font_placeholder_color", TEXT_DIM)
	le.add_theme_color_override("font_uneditable_color", TEXT_SUB)
