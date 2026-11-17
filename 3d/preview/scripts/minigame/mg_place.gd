extends "res://scripts/minigame/mg_base.gd"

## 放置（对应 2.5D 的 buildPlace）
## 零件 → 形状相符的槽位；槽位永远多一个诱饵；放错只提示，已放的保留。

const SHAPES := ["▲", "●", "■", "◆", "✦", "✚"]

var _need: Array = []
var _slot_buttons: Array = []
var _tray_buttons: Array = []
var _sel: Button
var _placed := 0


func build() -> void:
	var shapes: Array = cfg("shapes", SHAPES)
	var n: int = maxi(2, mini(int(cfg("n", tier_n(4, 5, 5))), shapes.size() - 1))
	_need = shuffled(shapes.slice(0, n))
	var decoy := ""
	for s in shapes:
		if not _need.has(s):
			decoy = s
			break
	var slots := shuffled(_need + [decoy])

	var wrap := center_box()
	add_child(wrap)
	wrap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	var grid_center := CenterContainer.new()
	grid_center.add_child(grid)
	wrap.add_child(grid_center)

	for s in slots:
		var b := button(s)
		b.custom_minimum_size = Vector2(86, 52)
		b.add_theme_font_size_override("font_size", 20)
		b.set_meta("shape", s)
		b.pressed.connect(_on_slot.bind(b))
		grid.add_child(b)
		_slot_buttons.append(b)

	var tray_center := CenterContainer.new()
	var tray := HBoxContainer.new()
	tray.add_theme_constant_override("separation", 8)
	tray_center.add_child(tray)
	wrap.add_child(tray_center)

	for s in shuffled(_need):
		var b := button(s)
		b.custom_minimum_size = Vector2(62, 34)
		b.add_theme_font_size_override("font_size", 16)
		b.set_meta("shape", s)
		b.pressed.connect(_on_pick.bind(b))
		tray.add_child(b)
		_tray_buttons.append(b)

	set_progress(0, n, "共 %d 个零件：先点下方零件，再点形状相符的槽位（有一个槽是诱饵）" % n)


func _on_pick(b: Button) -> void:
	if is_finished() or b.disabled:
		return
	_sel = b
	for x in _tray_buttons:
		x.add_theme_stylebox_override("normal", stylebox(COL_BTN, Color("#313B4B"), 8))
	b.add_theme_stylebox_override("normal", stylebox(Color("#2A2113"), COL_GOLD, 8))
	set_tip("已选零件「%s」：点形状相符的槽位" % String(b.get_meta("shape")))


func _on_slot(slot_btn: Button) -> void:
	if is_finished() or _sel == null:
		return
	if slot_btn.disabled:
		return
	if String(slot_btn.get_meta("shape")) != String(_sel.get_meta("shape")):
		# 2.5D 2026-11-09 取消「放错整组重来」：只清当前选中，已放的保留
		# （js/t2/minigame.js:616-619 形状不符 → 取消选中 + 提示，不重置）。
		_sel.add_theme_stylebox_override("normal", stylebox(COL_BTN, Color("#313B4B"), 8))
		_sel = null
		set_tip("形状不符 · 已放的保留，每个零件只认一个槽", true)
		return
	slot_btn.text = String(_sel.get_meta("shape"))
	slot_btn.disabled = true
	slot_btn.add_theme_stylebox_override("disabled", slot_style(true))
	_sel.disabled = true
	_sel.add_theme_stylebox_override("disabled", stylebox(Color(0.94, 0.78, 0.45, 0.06), COL_LINE, 8))
	_sel = null
	_placed += 1
	set_progress(_placed, _need.size(),
		"全部归位" if _placed == _need.size() else "已放置 %d / %d，继续" % [_placed, _need.size()])
	if _placed == _need.size():
		finish_ok()


func debug_solve() -> void:
	var left := _need.duplicate()
	for b in _slot_buttons:
		var s := String(b.get_meta("shape"))
		if left.has(s):
			left.erase(s)
			b.text = s
			b.disabled = true
			b.add_theme_stylebox_override("disabled", slot_style(true))
	_placed = _need.size()
	set_progress(_placed, _need.size(), "全部归位")
	finish_ok()
