extends "res://scripts/minigame/mg_base.gd"

## 分拣（对应 2.5D 的 buildSort，js/t2/minigame.js:978-1019）
## 先点物品，再点它应该去的筐；分错只提示，已分拣的保留。

const BINS := ["合格", "废料"]
const ITEMS := ["A", "B", "C", "D", "E"]

var _assign: Array = []
var _items: Array = []
var _sel := -1
var _placed := 0
var _item_buttons: Array = []


func build() -> void:
	var bins: Array = cfg("bins", BINS)
	_items = cfg("items", ITEMS)
	_assign = cfg("assign", [])
	if _assign.is_empty():
		for i in _items.size():
			_assign.append(i % maxi(1, bins.size()))
	var n: int = mini(_items.size(), _assign.size())

	var wrap := center_box()
	add_child(wrap)
	wrap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	wrap.add_child(label("先点物品，再点筐", 11, COL_DIM))

	var row_center := CenterContainer.new()
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row_center.add_child(row)
	wrap.add_child(row_center)

	for i in n:
		var b := button(String(_items[i]))
		b.custom_minimum_size = Vector2(70, 38)
		b.add_theme_font_size_override("font_size", 15)
		b.pressed.connect(_on_pick.bind(b, i))
		row.add_child(b)
		_item_buttons.append(b)

	var bin_center := CenterContainer.new()
	var bin_row := HBoxContainer.new()
	bin_row.add_theme_constant_override("separation", 14)
	bin_center.add_child(bin_row)
	wrap.add_child(bin_center)

	for bi in bins.size():
		var b := button(String(bins[bi]))
		b.custom_minimum_size = Vector2(104, 42)
		b.add_theme_stylebox_override("normal", stylebox(Color("#1B2432"), COL_GOLD.darkened(0.35), 8))
		b.set_meta("bi", bi)
		b.pressed.connect(_on_bin.bind(bi))
		bin_row.add_child(b)

	set_progress(0, n, "把 %d 件物品分进「%s」" % [n, " / ".join(bins)])


func _on_pick(b: Button, i: int) -> void:
	if is_finished() or b.disabled:
		return
	for x in _item_buttons:
		x.add_theme_stylebox_override("normal", stylebox(COL_BTN, Color("#313B4B"), 8))
	b.add_theme_stylebox_override("normal", stylebox(Color("#2A2113"), COL_GOLD, 8))
	_sel = i
	set_tip("已选中「%s」：点它应该去的筐" % String(_items[i]))


func _on_bin(bi: int) -> void:
	if is_finished() or _sel < 0:
		return
	if int(_assign[_sel]) != bi:
		set_tip("分错了 · 已分拣的保留，再想想它该去哪筐", true)
		return
	var b: Button = _item_buttons[_sel]
	b.disabled = true
	b.add_theme_stylebox_override("disabled", stylebox(Color(0.0, 0.9, 0.69, 0.06), Color("#1F5A49"), 8))
	b.add_theme_stylebox_override("normal", stylebox(COL_BTN, COL_LINE, 8))
	_sel = -1
	_placed += 1
	set_progress(_placed, _assign.size(),
		"全部分拣完成" if _placed == _assign.size() else "已分拣 %d / %d" % [_placed, _assign.size()])
	if _placed == _assign.size():
		finish_ok()


func debug_solve() -> void:
	for b in _item_buttons:
		b.disabled = true
		b.add_theme_stylebox_override("disabled", stylebox(Color(0.0, 0.9, 0.69, 0.06), Color("#1F5A49"), 8))
	_sel = -1
	_placed = _assign.size()
	set_progress(_placed, _assign.size(), "全部分拣完成")
	finish_ok()
