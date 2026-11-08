extends "res://scripts/minigame/mg_base.gd"

## 图标配对（对应 2.5D 的 buildMatch）
## 翻两张，图标相同即配对；错 3 次整组重来。

const ICONS := ["◈", "◇", "▣", "▤", "◐", "◑"]

var _open: Array = []
var _lock := false
var _pairs := 0
var _miss := 0
var _need := 0
var _cards: Array = []


func build() -> void:
	_need = tier_n(4, 5, 5)
	var pool: Array = ICONS.slice(0, _need)
	var deck: Array = shuffled(pool + pool)

	var wrap := center_box()
	add_child(wrap)
	wrap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	var holder := CenterContainer.new()
	holder.add_child(grid)
	wrap.add_child(holder)

	for ic in deck:
		var c := button("·")
		c.custom_minimum_size = Vector2(64, 64)
		c.add_theme_font_size_override("font_size", 20)
		c.set_meta("icon", ic)
		c.pressed.connect(_on_card.bind(c))
		grid.add_child(c)
		_cards.append(c)

	set_progress(0, _need, "共 %d 对：翻两张，图案相同即配对（错 3 次整组重来）" % _need)


func _on_card(c: Button) -> void:
	if is_finished() or _lock or c.disabled:
		return
	if c.get_meta("open", false):
		return
	c.set_meta("open", true)
	c.text = String(c.get_meta("icon"))
	c.add_theme_color_override("font_color", COL_GOLD)
	c.add_theme_stylebox_override("normal", stylebox(Color(0.94, 0.78, 0.45, 0.07), Color("#4A3C1E"), 8))
	_open.append(c)
	if _open.size() < 2:
		return

	var a: Button = _open[0]
	var b: Button = _open[1]
	if String(a.get_meta("icon")) == String(b.get_meta("icon")):
		a.disabled = true
		b.disabled = true
		a.add_theme_stylebox_override("disabled", stylebox(Color(0.0, 0.9, 0.69, 0.06), Color("#1F5A49"), 8))
		b.add_theme_stylebox_override("disabled", stylebox(Color(0.0, 0.9, 0.69, 0.06), Color("#1F5A49"), 8))
		a.add_theme_color_override("font_disabled_color", COL_GOOD)
		b.add_theme_color_override("font_disabled_color", COL_GOOD)
		_open.clear()
		_pairs += 1
		set_progress(_pairs, _need, "全部匹配" if _pairs == _need else "已配对 %d / %d，继续" % [_pairs, _need])
		if _pairs == _need:
			finish_ok()
		return

	_lock = true
	_miss += 1
	await get_tree().create_timer(0.42).timeout
	if not is_inside_tree() or is_finished():
		return
	for x in _open:
		if is_instance_valid(x):
			x.set_meta("open", false)
			x.text = "·"
			x.add_theme_color_override("font_color", COL_DIM)
			x.add_theme_stylebox_override("normal", stylebox(COL_WELL, Color("#313B4B"), 8))
	_open.clear()
	_lock = false
	if _miss >= 3:
		finish_fail("错配 3 次 → 整组重来")
	else:
		set_tip("配错了（%d / 3）—— 记一下位置重来" % _miss, true)


func debug_solve() -> void:
	for c in _cards:
		c.disabled = true
		c.text = String(c.get_meta("icon"))
		c.add_theme_stylebox_override("disabled", stylebox(Color(0.0, 0.9, 0.69, 0.06), Color("#1F5A49"), 8))
	_pairs = _need
	set_progress(_pairs, _need, "全部匹配")
	finish_ok()
