extends CharacterBody3D

## 3D 预演的最小玩家控制器：真正的 WASD + 鼠标视角，不再点击地面。
## 这里只验证「空间感 / 碰撞 / 速度尺度」，复杂交互仍由 2.5D 主项目承担。

const SpaceData := preload("res://scripts/space_data.gd")

## 以下三个数是 2.5D 真源经 space.json 覆盖的默认值，不是最终口径：
## speed ← SKT2Space.MOVE_SPEED，手电半径/锥角 ← SKSanity.SIGHT。
@export var speed: float = 4.2
@export var mouse_sensitivity: float = 0.0022
@export var gravity: float = 18.0
@export var spawn_point: Vector3 = Vector3(31.0, 0.05, 33.5)

## 小游戏遮罩打开时，玩家输入交给 UI；否则点击遮罩会被当成“重新捕获鼠标”。
var ui_locked := false
## 截图/机位自测不应抢系统鼠标；main 在 add_child 之前设置。
var capture_mouse_on_ready := true

var camera: Camera3D
var flashlight: SpotLight3D
var _pitch: float = 0.0
## 旁观者（第 16 人）：全知无碰撞、可上下飞，不占 15 席
var spectator := false
## 旁观者的高度夹取：地板只是"贴板"，不该让人穿到船底掉进虚空；
## 上空放开（天花板会在飞越时整层隐藏，从上面看是剖面）。
const SPECT_MIN_Y := 0.35
const SPECT_MAX_Y := 60.0
var _base_speed := 4.2

## ---- 第一人称出刀视图（2026-11-11 用户反馈「出刀时自己视角没有动作」）----
## 只用两个盒子（刀身 / 刀柄）挂在相机下，不引入外部模型；
## 挥刀动作是程序化的，不占资产、不影响发布包体积。
var knife_view: Node3D
var _knife_swing := 0.0
const KNIFE_SWING_LEN := 0.46
var _knife_rest := Vector3(0.30, -0.26, -0.52)
var _knife_rest_rot := Vector3(-0.18, 0.42, -0.22)
var _bob := 0.0
## 命中冲击：FOV 收一档 + 轻微抖动，比纯音效更能确认「打到了」。
var _punch := 0.0
var _base_fov := 75.0


## 手电必须按视野真源走：2.5D 亮舱手电是 `SIGHT.humanLightR = 7` 米 / 60° 锥，
## 原先这里写死 24 米 —— 表现比判定还宽容（玩家实际能读到的距离远超规则允许的距离）。
func apply_space_cfg(space: Dictionary) -> void:
	if space.is_empty():
		return
	speed = SpaceData.num(space, "move", "speed")
	if flashlight != null:
		flashlight.spot_range = SpaceData.num(space, "sight", "human_light_r")
		flashlight.spot_angle = SpaceData.num(space, "sight", "cone_deg") * 0.5


func _ready() -> void:
	_build_collision()
	_build_camera()
	if capture_mouse_on_ready:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	else:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func _build_collision() -> void:
	var collision := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.35
	capsule.height = 1.7
	collision.shape = capsule
	collision.position.y = 0.85
	add_child(collision)


func _build_camera() -> void:
	camera = Camera3D.new()
	camera.position = Vector3(0.0, 1.62, 0.0)
	camera.fov = 75.0
	camera.near = 0.05
	camera.far = 220.0
	camera.current = true
	_base_fov = camera.fov
	add_child(camera)
	_build_knife_view()

	flashlight = SpotLight3D.new()
	flashlight.position = Vector3(0.18, -0.08, -0.12)
	flashlight.spot_range = 24.0
	flashlight.spot_angle = 30.0
	flashlight.spot_angle_attenuation = 1.15
	flashlight.light_energy = 4.2
	flashlight.light_color = Color(1.0, 0.94, 0.82)
	camera.add_child(flashlight)


func _unhandled_input(event: InputEvent) -> void:
	if ui_locked:
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		rotate_y(-event.relative.x * mouse_sensitivity)
		_pitch = clampf(_pitch - event.relative.y * mouse_sensitivity, -1.35, 1.35)
		camera.rotation.x = _pitch
	# Esc 释放 / 点击收回鼠标统一由 main.gd 管理：这里只做视角。
	# （旧实现在这里设 VISIBLE，但 main 的 `_refresh_mouse_mode()` 每帧又会
	#  CAPTURED，Esc 实际无效 —— 用户反馈「鼠标被框在窗口里」的根因。）


func set_spectator(on: bool) -> void:
	spectator = on
	if not on:
		speed = _base_speed
	else:
		_base_speed = speed
		speed = 9.0
	collision_layer = 0 if on else 1
	collision_mask = 0 if on else 1
	gravity = 0.0 if on else 18.0
	if flashlight != null:
		flashlight.visible = not on


func _exit_tree() -> void:
	# 自测/截图进程退出时也释放全局鼠标，避免把系统光标留在捕获态。
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


## 第一人称刀：刀身 + 刀柄两个盒子，位置固定在右下，靠 _animate_view 做挥砍。
func _build_knife_view() -> void:
	knife_view = Node3D.new()
	knife_view.name = "knife_view"
	knife_view.visible = false
	camera.add_child(knife_view)

	var steel := StandardMaterial3D.new()
	steel.albedo_color = Color(0.80, 0.82, 0.86)
	steel.metallic = 0.85
	steel.roughness = 0.26
	var grip := StandardMaterial3D.new()
	grip.albedo_color = Color(0.11, 0.11, 0.13)
	grip.roughness = 0.88

	var blade := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.020, 0.007, 0.26)
	blade.mesh = bm
	blade.material_override = steel
	blade.position = Vector3(0.0, 0.0, -0.16)
	knife_view.add_child(blade)

	var handle := MeshInstance3D.new()
	var hm := BoxMesh.new()
	hm.size = Vector3(0.026, 0.030, 0.10)
	handle.mesh = hm
	handle.material_override = grip
	handle.position = Vector3(0.0, 0.0, 0.02)
	knife_view.add_child(handle)

	knife_view.position = _knife_rest
	knife_view.rotation = _knife_rest_rot


## 只有「异形 + 本夜还有刀」才显示；死了 / 濒死 / 缴械都收起来。
func set_knife_visible(on: bool) -> void:
	if knife_view != null:
		knife_view.visible = on


## 出刀：不管有没有打到人，手上必须有动作（这是用户反馈的核心）。
func play_knife_swing() -> void:
	_knife_swing = KNIFE_SWING_LEN
	if knife_view != null:
		knife_view.visible = true


## 命中冲击：strength 1.0 = 命中，0.3 左右 = 挥空。
func punch(strength: float = 1.0) -> void:
	_punch = clampf(0.16 * strength, 0.05, 0.30)


## 每帧维护：镜头冲击/回弹、走路摆动、挥刀三段式（抬刀 → 斜劈 → 收回）。
func _animate_view(delta: float) -> void:
	if camera == null:
		return
	if _punch > 0.0:
		_punch = maxf(0.0, _punch - delta)
		var k := clampf(_punch / 0.16, 0.0, 1.0)
		camera.fov = _base_fov - 4.5 * k
		camera.rotation.x = _pitch + sin(_punch * 120.0) * 0.012 * k
		camera.rotation.z = cos(_punch * 90.0) * 0.010 * k
	else:
		camera.fov = lerpf(camera.fov, _base_fov, clampf(delta * 10.0, 0.0, 1.0))
		camera.rotation.x = lerpf(camera.rotation.x, _pitch, clampf(delta * 18.0, 0.0, 1.0))
		camera.rotation.z = lerpf(camera.rotation.z, 0.0, clampf(delta * 18.0, 0.0, 1.0))
	if knife_view == null or not knife_view.visible:
		return
	var spd := Vector2(velocity.x, velocity.z).length()
	if spd > 0.5:
		_bob += delta * 9.0
	else:
		_bob = lerpf(_bob, 0.0, clampf(delta * 4.0, 0.0, 1.0))
	var bob_off := Vector3.ZERO
	if spd > 0.5:
		bob_off = Vector3(sin(_bob) * 0.006, absf(cos(_bob)) * 0.008, 0.0)
	var rest_pos := _knife_rest + bob_off
	if _knife_swing <= 0.0:
		knife_view.position = knife_view.position.lerp(rest_pos, clampf(delta * 12.0, 0.0, 1.0))
		knife_view.rotation = knife_view.rotation.lerp(_knife_rest_rot, clampf(delta * 12.0, 0.0, 1.0))
		return
	_knife_swing = maxf(0.0, _knife_swing - delta)
	var p := 1.0 - (_knife_swing / KNIFE_SWING_LEN)
	var pos := rest_pos
	var rot := _knife_rest_rot
	if p < 0.28:
		# 抬刀蓄力：往右下后方拉一点，刀尖朝上
		var k := ease(p / 0.28, 0.35)
		pos = rest_pos.lerp(rest_pos + Vector3(0.05, 0.15, 0.10), k)
		rot = _knife_rest_rot.lerp(_knife_rest_rot + Vector3(0.55, -0.25, 0.0), k)
	elif p < 0.58:
		# 斜劈：从右上扫到左下，同时刀身翻转
		var k := ease((p - 0.28) / 0.30, 0.55)
		pos = (rest_pos + Vector3(0.05, 0.15, 0.10)).lerp(rest_pos + Vector3(-0.10, 0.02, -0.14), k)
		rot = (_knife_rest_rot + Vector3(0.55, -0.25, 0.0)).lerp(_knife_rest_rot + Vector3(-0.35, 0.55, -0.55), k)
	else:
		# 收回：慢一点，避免收刀像瞬移
		var k := ease((p - 0.58) / 0.42, 0.25)
		pos = (rest_pos + Vector3(-0.10, 0.02, -0.14)).lerp(rest_pos, k)
		rot = (_knife_rest_rot + Vector3(-0.35, 0.55, -0.55)).lerp(_knife_rest_rot, k)
	knife_view.position = pos
	knife_view.rotation = rot


func _physics_process(delta: float) -> void:
	_animate_view(delta)
	if ui_locked:
		velocity = Vector3.ZERO
		return
	if spectator:
		# 用相机 basis（含抬头/低头）而不是 body 朝向，才能真的"往看到的方向飞"
		var fly := Vector3.ZERO
		var cb := camera.global_transform.basis
		if Input.is_physical_key_pressed(KEY_W):
			fly -= cb.z
		if Input.is_physical_key_pressed(KEY_S):
			fly += cb.z
		if Input.is_physical_key_pressed(KEY_D):
			fly += cb.x
		if Input.is_physical_key_pressed(KEY_A):
			fly -= cb.x
		if Input.is_physical_key_pressed(KEY_SPACE):
			fly.y += 1.0
		if Input.is_physical_key_pressed(KEY_CTRL):
			fly.y -= 1.0
		global_position += fly.normalized() * speed * delta
		# 不允许钻到地板以下（下层没有东西，只会穿过船底看见虚空）
		global_position.y = clampf(global_position.y, SPECT_MIN_Y, SPECT_MAX_Y)
		return
	var direction := Vector3.ZERO
	if Input.is_physical_key_pressed(KEY_W):
		direction.z -= 1.0
	if Input.is_physical_key_pressed(KEY_S):
		direction.z += 1.0
	if Input.is_physical_key_pressed(KEY_A):
		direction.x -= 1.0
	if Input.is_physical_key_pressed(KEY_D):
		direction.x += 1.0

	direction = direction.normalized().rotated(Vector3.UP, rotation.y)
	# 统一移速：2.5D 只有 MOVE_SPEED 一档（没有玩家冲刺），3D 不再做 Shift 加速。
	var target_speed := speed

	velocity.x = direction.x * target_speed
	velocity.z = direction.z * target_speed
	if not is_on_floor():
		velocity.y -= gravity * delta
	else:
		velocity.y = -0.1
	move_and_slide()

	if global_position.y < -8.0:
		global_position = spawn_point
