extends Control
## 战斗 HUD 表现层：动态准星（移动微扩、开火回弹、瞄准目标高亮）、
## 分级 Hitmarker（白红致命 / 蓝金护甲）、受击红晕与四季血溅暗角、被救回神闪光。

var _cross_kick := 0.0
var _move_spread := 0.0
var _has_target := false

var _hit_t := 0.0
var _hit_dur := 0.28
var _hit_tier := "human"

var _kill_flash_t := 0.0
var _hurt_t := 0.0
var _revive_t := 0.0
var _downed_pulse := 0.0
var _is_downed := false


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)


func trigger_crosshair_kick(amount: float = 1.0) -> void:
	_cross_kick = minf(1.5, _cross_kick + amount)
	queue_redraw()


func trigger_hitmarker(tier: String = "human") -> void:
	_hit_tier = tier
	_hit_dur = 0.28 if tier == "human" else 0.24
	_hit_t = _hit_dur
	queue_redraw()


func trigger_hit_flash() -> void:
	_kill_flash_t = 0.14
	queue_redraw()


func trigger_player_hurt() -> void:
	_hurt_t = 0.65
	queue_redraw()


func trigger_revive_flash() -> void:
	_revive_t = 0.55
	_hurt_t = 0.0
	queue_redraw()


func tick(delta: float, horiz_speed: float, target_in_sight: bool, downed: bool, hide_ui: bool) -> void:
	visible = not hide_ui
	if not visible:
		return
	var dirty := false
	var target_spread := clampf(horiz_speed / 4.5, 0.0, 1.0) * 4.5
	if absf(_move_spread - target_spread) > 0.05:
		_move_spread = lerpf(_move_spread, target_spread, clampf(delta * 10.0, 0.0, 1.0))
		dirty = true
	if _has_target != target_in_sight:
		_has_target = target_in_sight
		dirty = true
	if _cross_kick > 0.0:
		_cross_kick = maxf(0.0, _cross_kick - delta * 4.5)
		dirty = true
	if _hit_t > 0.0:
		_hit_t = maxf(0.0, _hit_t - delta)
		dirty = true
	if _kill_flash_t > 0.0:
		_kill_flash_t = maxf(0.0, _kill_flash_t - delta)
		dirty = true
	if _hurt_t > 0.0:
		_hurt_t = maxf(0.0, _hurt_t - delta)
		dirty = true
	if _revive_t > 0.0:
		_revive_t = maxf(0.0, _revive_t - delta)
		dirty = true
	if _is_downed != downed:
		_is_downed = downed
		dirty = true
	if _is_downed:
		_downed_pulse += delta * 3.4
		dirty = true
	if dirty:
		queue_redraw()


func _draw() -> void:
	var ctr := size * 0.5
	_draw_vignettes(ctr)
	_draw_crosshair(ctr)
	_draw_hitmarker(ctr)


func _draw_crosshair(ctr: Vector2) -> void:
	var gap := 5.5 + _move_spread + _cross_kick * 8.0
	var tick_len := 6.5
	var fg := Color(1.0, 0.42, 0.34, 0.94) if _has_target else Color(0.96, 0.98, 1.0, 0.88)
	var bg := Color(0.0, 0.0, 0.0, 0.65)
	draw_circle(ctr, 2.4, bg)
	draw_circle(ctr, 1.5, fg)
	var dirs := [Vector2.UP, Vector2.DOWN, Vector2.LEFT, Vector2.RIGHT]
	for d: Vector2 in dirs:
		var p0 := ctr + d * gap
		var p1 := ctr + d * (gap + tick_len)
		draw_line(p0, p1, bg, 3.2, true)
		draw_line(p0, p1, fg, 1.6, true)


func _draw_hitmarker(ctr: Vector2) -> void:
	if _hit_t <= 0.0:
		return
	var k := clampf(_hit_t / maxf(0.01, _hit_dur), 0.0, 1.0)
	var r := lerpf(21.0, 11.0, k)
	var inner := r * 0.42
	var outer_col := Color(1.0, 0.24, 0.20, k) if _hit_tier == "human" else Color(0.45, 0.88, 1.0, k)
	var inner_col := Color(1.0, 0.96, 0.92, k) if _hit_tier == "human" else Color(1.0, 0.84, 0.36, k)
	for i in 4:
		var ang := PI * 0.25 + float(i) * PI * 0.5
		var d := Vector2(cos(ang), sin(ang))
		draw_line(ctr + d * inner, ctr + d * r, Color(0.0, 0.0, 0.0, 0.6 * k), 4.5, true)
		draw_line(ctr + d * inner, ctr + d * r, outer_col, 2.8, true)
		draw_line(ctr + d * inner, ctr + d * (r * 0.82), inner_col, 1.4, true)


func _draw_vignettes(_ctr: Vector2) -> void:
	if _kill_flash_t > 0.0:
		var kf := clampf(_kill_flash_t / 0.14, 0.0, 1.0)
		_draw_edge_frame(Color(1.0, 0.92, 0.72, 0.09 * kf), 42.0)
	if _revive_t > 0.0:
		var rf := clampf(_revive_t / 0.55, 0.0, 1.0)
		draw_rect(Rect2(Vector2.ZERO, size), Color(0.22, 0.92, 0.72, 0.18 * rf), true)
	var red_alpha := 0.0
	if _hurt_t > 0.0:
		red_alpha = maxf(red_alpha, 0.42 * clampf(_hurt_t / 0.65, 0.0, 1.0))
	if _is_downed:
		var breath := 0.5 + 0.5 * sin(_downed_pulse)
		red_alpha = maxf(red_alpha, 0.20 + 0.14 * breath)
	if red_alpha > 0.005:
		_draw_edge_frame(Color(0.75, 0.04, 0.04, red_alpha), 95.0)
		_draw_corner_splatter(red_alpha)


func _draw_edge_frame(col: Color, depth: float) -> void:
	var w := size.x
	var h := size.y
	draw_rect(Rect2(0.0, 0.0, w, depth), col, true)
	draw_rect(Rect2(0.0, h - depth, w, depth), col, true)
	draw_rect(Rect2(0.0, depth, depth, maxf(0.0, h - depth * 2.0)), col, true)
	draw_rect(Rect2(w - depth, depth, depth, maxf(0.0, h - depth * 2.0)), col, true)


func _draw_corner_splatter(alpha: float) -> void:
	var col := Color(0.55, 0.02, 0.03, clampf(alpha * 1.15, 0.0, 0.72))
	var corners := [
		Vector2(36.0, 36.0),
		Vector2(size.x - 36.0, 36.0),
		Vector2(36.0, size.y - 36.0),
		Vector2(size.x - 36.0, size.y - 36.0),
	]
	var offsets := [Vector2(0, 0), Vector2(22, 10), Vector2(-12, 24), Vector2(18, -16)]
	for ci in corners.size():
		var c := corners[ci] as Vector2
		for oi in offsets.size():
			var o := offsets[oi] as Vector2
			var sx := -1.0 if ci % 2 == 1 else 1.0
			var sy := -1.0 if ci >= 2 else 1.0
			var pos := c + Vector2(o.x * sx, o.y * sy)
			var rad := 16.0 - float(oi) * 3.0
			draw_circle(pos, rad, col)
