extends Node3D

## 3D 预演入口：搭场景、放玩家、做 HUD。
## 这是「能不能复用」的验证件，不是正式 3D 客户端。

const MapBuilderScript := preload("res://scripts/map_builder.gd")
const PlayerScript := preload("res://scripts/player.gd")

var builder
var player: CharacterBody3D
var map_data: Dictionary = {}

var room_label: Label
var fps_label: Label
var _hud_timer: float = 0.0


func _ready() -> void:
	builder = MapBuilderScript.new()
	add_child(builder)
	builder.build()
	map_data = builder.data

	_add_floor_collision()

	var args := OS.get_cmdline_user_args()
	player = PlayerScript.new()
	if args.has("--corridor"):
		player.position = Vector3(28.0, 0.05, 42.2)
		player.rotation.y = PI
	else:
		player.position = Vector3(27.0, 0.05, 34.8)
		player.rotation.y = -PI * 0.5 + 0.05
	if args.has("--wall"):
		player.rotation.y = PI * 0.5
	add_child(player)

	_build_hud()

	if args.has("--walktest"):
		await get_tree().create_timer(0.4).timeout
		var start := player.global_position
		var down := InputEventKey.new()
		down.physical_keycode = KEY_W
		down.pressed = true
		Input.parse_input_event(down)
		await get_tree().create_timer(1.0).timeout
		var up := InputEventKey.new()
		up.physical_keycode = KEY_W
		up.pressed = false
		Input.parse_input_event(up)
		var finish := player.global_position
		print("WALK_TEST distance=", start.distance_to(finish),
			" start=", start, " end=", finish)
		get_tree().quit()
		return

	if args.has("--shot") and DisplayServer.get_name() != "headless":
		await get_tree().create_timer(2.5).timeout
		await RenderingServer.frame_post_draw
		var image := get_viewport().get_texture().get_image()
		var shot_name := "preview-corridor.png" if args.has("--corridor") else "preview.png"
		var path := "user://" + shot_name
		image.save_png(path)
		print("SHOT_PATH=", ProjectSettings.globalize_path(path))
		get_tree().quit()


func _add_floor_collision() -> void:
	var body := StaticBody3D.new()
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = Vector3(120.0, 1.0, 120.0)
	collision.shape = shape
	body.position = Vector3(49.0, -0.5, 47.0)
	body.add_child(collision)
	add_child(body)


func _build_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)

	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])

	var title := _label("新返航录 · 3D 预演", Vector2(22, 16), 22, font)
	title.add_theme_color_override("font_color", Color(1.0, 0.86, 0.52))
	layer.add_child(title)

	var help := _label("WASD 移动 · Shift 加速 · 鼠标视角 · Esc 释放鼠标", Vector2(22, 50), 15, font)
	help.add_theme_color_override("font_color", Color(0.78, 0.84, 0.92))
	layer.add_child(help)

	room_label = _label("中央会议室", Vector2(1000, 18), 20, font)
	room_label.add_theme_color_override("font_color", Color(0.82, 0.92, 1.0))
	layer.add_child(room_label)

	fps_label = _label("", Vector2(22, 682), 13, font)
	fps_label.add_theme_color_override("font_color", Color(0.55, 0.62, 0.72))
	layer.add_child(fps_label)

	var cross := ColorRect.new()
	cross.color = Color(1.0, 1.0, 1.0, 0.82)
	cross.anchor_left = 0.5
	cross.anchor_top = 0.5
	cross.anchor_right = 0.5
	cross.anchor_bottom = 0.5
	cross.offset_left = -2.0
	cross.offset_top = -2.0
	cross.offset_right = 2.0
	cross.offset_bottom = 2.0
	cross.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(cross)


func _label(text: String, pos: Vector2, size: int, font: Font) -> Label:
	var label := Label.new()
	label.text = text
	label.position = pos
	label.add_theme_font_override("font", font)
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.9))
	label.add_theme_constant_override("outline_size", 5)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label


func _process(delta: float) -> void:
	if player == null:
		return
	_hud_timer -= delta
	if _hud_timer > 0.0:
		return
	_hud_timer = 0.2
	room_label.text = _room_name_at(player.global_position)
	fps_label.text = "3D 预演 · %d FPS · 地图数据来自 js/data/map.js（导出 JSON）" % Engine.get_frames_per_second()


func _room_name_at(pos: Vector3) -> String:
	var point := Vector2(pos.x, pos.z)
	for room: Dictionary in map_data.get("rooms", []):
		var poly := PackedVector2Array()
		for p: Array in room.get("poly", []):
			poly.append(Vector2(float(p[0]), float(p[1])))
		if poly.size() >= 3 and Geometry2D.is_point_in_polygon(point, poly):
			return String(room.get("name", room.get("id", "")))
	return "走廊 / 船体"
