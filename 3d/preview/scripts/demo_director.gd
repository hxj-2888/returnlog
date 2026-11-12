extends Node

## 演示片导演：加载真实 main.tscn 后接管玩家位置/朝向，不改 sim、不写玩法状态。
## 画面里的 HUD、AI、门、保安机器人、灯光全部是游戏本身在跑。
## `--reel-sec` 可覆盖时长；默认 88 秒（1 分 28 秒）。

var main: Node
var player: CharacterBody3D
var t := 0.0
var dur := 68.0

var _fade: ColorRect
var _title: Label
var _sub: Label
var _tag: Label


func setup(m: Node) -> void:
	main = m
	player = m.player
	player.ui_locked = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	m.mouse_released = true
	m._screenshot_mode = true
	var args := OS.get_cmdline_user_args()
	var d := _arg(args, "--reel-sec")
	if d != "":
		dur = maxf(1.0, float(d))
	_build_overlay()
	set_process(true)


func _arg(args: PackedStringArray, key: String) -> String:
	var i := args.find(key)
	if i >= 0 and i + 1 < args.size():
		return args[i + 1]
	return ""


func _k(a: float, b: float) -> float:
	var x := clampf((t - a) / maxf(0.001, b - a), 0.0, 1.0)
	return x * x * (3.0 - 2.0 * x)


func _view(pos: Vector3, target: Vector3, fov: float = 75.0) -> void:
	if player == null:
		return
	player.global_position = Vector3(pos.x, 0.05, pos.z)
	var dx := target.x - pos.x
	var dz := target.z - pos.z
	var dy := target.y - pos.y
	player.rotation.y = atan2(-dx, -dz)
	var horiz := sqrt(dx * dx + dz * dz)
	player._pitch = clampf(atan2(dy, maxf(horiz, 0.001)), -1.35, 1.35)
	player.camera.rotation.x = player._pitch
	player.camera.rotation.z = 0.0
	player.camera.fov = fov


func _bot_pos() -> Vector3:
	if main == null or main.extras == null:
		return Vector3(86.6, 0.75, 69.4)
	var bot: Node3D = main.extras.bot_nodes.get("secbot")
	if bot == null:
		return Vector3(86.6, 0.75, 69.4)
	return Vector3(bot.position.x, 0.75, bot.position.z)


func _camera() -> void:
	if t < 6.0:
		var k := _k(0.0, 6.0)
		_view(Vector3(54.0 + 1.0 * k, 1.62, 37.0), Vector3(44.0, 1.45, 33.0))
	elif t < 16.0:
		if t < 11.0:
			_view(Vector3(54.0, 1.62, 37.0), Vector3(44.0, 3.10, 33.0))
		else:
			var k := _k(11.0, 16.0)
			_view(Vector3(54.0, 1.62, 37.0), Vector3(44.0, 1.45 - 0.08 * k, 33.0))
	elif t < 26.0:
		var k := _k(16.0, 26.0)
		var z := 38.4 + 3.8 * k
		var look := Vector3(28.0, 1.35, 41.0).lerp(Vector3(28.0, 1.45, 50.0),
			_k(21.0, 24.0))
		_view(Vector3(28.0, 1.62, z), look)
	elif t < 36.0:
		var k := _k(26.0, 31.0)
		var look := Vector3(28.0, 1.50, 55.0)
		if t >= 31.0:
			look = look.lerp(Vector3(28.0, 1.35, 41.0), _k(31.0, 32.5))
		_view(Vector3(28.0, 1.62, 42.2 + 3.0 * k), look)
	elif t < 50.0:
		var k := _k(36.0, 50.0)
		var bot := _bot_pos()
		var cam := Vector3(bot.x + 3.2 - 0.6 * k, 1.62, bot.z + 0.8)
		_view(cam, bot, 72.0)
	elif t < 62.0:
		var k := _k(50.0, 62.0)
		_view(Vector3(54.0 + 1.5 * k, 1.62, 36.5),
			Vector3(44.0, 1.30, 33.0))
	else:
		if t < 65.0:
			var k := _k(62.0, 65.0)
			_view(Vector3(54.5 + 0.5 * k, 1.62, 36.5),
				Vector3(44.0, 1.50, 33.0))
		else:
			var k := _k(65.0, 68.0)
			_view(Vector3(55.0, 1.62, 36.5),
				Vector3(44.0, 1.50 + 1.55 * k, 33.0))


func _overlay_text() -> Array:
	var segs := [
		[0.0, 6.0, "返航录 · 3D 预演", "2.5D 的延伸，不是第二条产品线"],
		[6.0, 16.0, "工业天花板", "压型钢板 · 主梁 · 管线 · 线槽"],
		[16.0, 26.0, "门", "3D 滑门结构 + 2.5D 门板"],
		[26.0, 36.0, "自动门", "扫描 · 开合 · 真实碰撞"],
		[36.0, 50.0, "保安机器人", "双足 · 红目镜 · 肩部警示条"],
		[50.0, 62.0, "任务与断电", "HUD · 手电 · 全船 10 舱"],
		[62.0, 68.0, "规则同源", "判定 / 数值 / 语料全部来自 2.5D"],
	]
	for s: Array in segs:
		if t >= float(s[0]) and t < float(s[1]):
			return s
	return segs[segs.size() - 1]


func _build_overlay() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 20
	add_child(layer)
	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])

	var panel := ColorRect.new()
	panel.color = Color(0.0, 0.0, 0.0, 0.42)
	panel.position = Vector2(12, 430)
	panel.size = Vector2(660, 140)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(panel)

	_title = Label.new()
	_title.position = Vector2(30, 438)
	_title.size = Vector2(620, 40)
	_title.add_theme_font_override("font", font)
	_title.add_theme_font_size_override("font_size", 28)
	_title.add_theme_color_override("font_color", Color(1.0, 0.86, 0.52))
	_title.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.95))
	_title.add_theme_constant_override("outline_size", 6)
	_title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(_title)

	_sub = Label.new()
	_sub.position = Vector2(30, 480)
	_sub.size = Vector2(620, 36)
	_sub.add_theme_font_override("font", font)
	_sub.add_theme_font_size_override("font_size", 18)
	_sub.add_theme_color_override("font_color", Color(0.88, 0.93, 1.0))
	_sub.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.95))
	_sub.add_theme_constant_override("outline_size", 5)
	_sub.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(_sub)

	_tag = Label.new()
	_tag.position = Vector2(30, 524)
	_tag.size = Vector2(620, 28)
	_tag.add_theme_font_override("font", font)
	_tag.add_theme_font_size_override("font_size", 13)
	_tag.add_theme_color_override("font_color", Color(0.62, 0.72, 0.82))
	_tag.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.9))
	_tag.add_theme_constant_override("outline_size", 4)
	_tag.text = "实机场景演示 · 2026-11-11 · 3D 预演"
	_tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(_tag)

	_fade = ColorRect.new()
	_fade.color = Color(0.0, 0.0, 0.0, 1.0)
	_fade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(_fade)


func _overlay() -> void:
	var seg := _overlay_text()
	_title.text = String(seg[2])
	_sub.text = String(seg[3])
	var fade_in := clampf(t / 1.6, 0.0, 1.0)
	var fade_out := clampf((dur - t) / 2.2, 0.0, 1.0)
	var vis := minf(fade_in, fade_out)
	_title.modulate.a = vis
	_sub.modulate.a = vis
	_tag.modulate.a = vis * 0.9
	if t < 1.6:
		_fade.color.a = 1.0 - fade_in
	elif t > dur - 2.8:
		_fade.color.a = clampf((t - (dur - 2.8)) / 2.8, 0.0, 1.0)
	else:
		_fade.color.a = 0.0


func _process(delta: float) -> void:
	t += delta
	if t >= dur:
		get_tree().quit()
		return
	_camera()
	_overlay()
