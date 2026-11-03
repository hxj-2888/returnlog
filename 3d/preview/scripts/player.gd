extends CharacterBody3D

## 3D 预演的最小玩家控制器：真正的 WASD + 鼠标视角，不再点击地面。
## 这里只验证「空间感 / 碰撞 / 速度尺度」，复杂交互仍由 2.5D 主项目承担。

@export var speed: float = 4.2
@export var sprint_multiplier: float = 1.55
@export var mouse_sensitivity: float = 0.0022
@export var gravity: float = 18.0
@export var spawn_point: Vector3 = Vector3(31.0, 0.05, 33.5)

var camera: Camera3D
var flashlight: SpotLight3D
var _pitch: float = 0.0


func _ready() -> void:
	_build_collision()
	_build_camera()
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


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
	add_child(camera)

	flashlight = SpotLight3D.new()
	flashlight.position = Vector3(0.18, -0.08, -0.12)
	flashlight.spot_range = 24.0
	flashlight.spot_angle = 30.0
	flashlight.spot_angle_attenuation = 1.15
	flashlight.light_energy = 4.2
	flashlight.light_color = Color(1.0, 0.94, 0.82)
	camera.add_child(flashlight)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		rotate_y(-event.relative.x * mouse_sensitivity)
		_pitch = clampf(_pitch - event.relative.y * mouse_sensitivity, -1.35, 1.35)
		camera.rotation.x = _pitch
	elif event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	elif event is InputEventMouseButton and event.pressed and Input.mouse_mode == Input.MOUSE_MODE_VISIBLE:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _physics_process(delta: float) -> void:
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
	var target_speed := speed
	if Input.is_physical_key_pressed(KEY_SHIFT):
		target_speed *= sprint_multiplier

	velocity.x = direction.x * target_speed
	velocity.z = direction.z * target_speed
	if not is_on_floor():
		velocity.y -= gravity * delta
	else:
		velocity.y = -0.1
	move_and_slide()

	if global_position.y < -8.0:
		global_position = spawn_point
