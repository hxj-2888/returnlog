extends SceneTree

## 演示片入口：不直接跑 main.tscn，而是加载它并挂一个 DemoDirector。
## 用法（录制）：
##   Godot --path 3d/preview --write-movie <out.avi> --fixed-fps 30 \
##     --script res://scripts/demo_reel.gd -- --role human --reel --seed 20261111 --reel-sec 88
## `--reel` 让 main 进入截图模式（不捕获鼠标、玩家输入锁死），由导演接管相机。

var _main: Node


func _initialize() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	get_root().size = Vector2i(1280, 720)
	var packed := load("res://scenes/main.tscn") as PackedScene
	if packed == null:
		print("DEMO_FAIL main.tscn")
		quit(1)
		return
	_main = packed.instantiate()
	get_root().add_child(_main)
	for i in 8:
		await process_frame
	if _main.player == null:
		print("DEMO_FAIL no player")
		quit(1)
		return
	if not _main.started:
		_main._on_start("human")
		for i in 5:
			await process_frame
	# 2.5D new_game 会先开一场 pre 公开讨论；演示片直接收掉，进入夜间巡游。
	if _main.sim != null:
		if not _main.sim.meeting.is_empty():
			_main._finish_meeting(_main.sim)
		# 演示片是实机场景巡游：停掉 AI 决策，避免随机凶杀/夜会挡镜头；
		# 保安巡逻、自动门、灯光、HUD 仍然按真实 sim 跑。
		_main.sim.ai_enabled = false
		for i in 6:
			await process_frame
	_main._screenshot_mode = true
	_main.mouse_released = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	_main.player.ui_locked = true
	var director = load("res://scripts/demo_director.gd").new()
	_main.add_child(director)
	director.setup(_main)
	print("DEMO_READY started=%s role=%s dur=%.1f" % [
		str(_main.started), str(_main.role), director.dur])
