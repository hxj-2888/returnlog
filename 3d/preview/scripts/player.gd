extends CharacterBody3D

## 3D 预演的玩家控制器：WASD + 鼠标视角、物理网格防卡兜底、
## 第一人称武器视图、弹簧阻尼震屏、急迫奔袭视野与手电体积光锥。

const SpaceData := preload("res://scripts/space_data.gd")
const FpWeaponViewScript := preload("res://scripts/view/fp_weapon_view.gd")
const STEP_STRIDE := 1.45

signal stepped(pos: Vector2, scale: float, is_left: bool)

@export var speed: float = 4.2
@export var mouse_sensitivity: float = 0.0022
@export var gravity: float = 18.0
@export var spawn_point: Vector3 = Vector3(31.0, 0.05, 33.5)

var ui_locked := false
var capture_mouse_on_ready := true

var camera: Camera3D
var flashlight: SpotLight3D
var _spill_light: SpotLight3D
var _light_cone: MeshInstance3D
var _pitch: float = 0.0

var spectator := false
const SPECT_MIN_Y := 0.35
const SPECT_MAX_Y := 60.0
var _base_speed := 4.2
var ghost := false
var downed := false

var nav = null
var _stuck_t := 0.0
var stuck_rescues := 0
var _stuck_mark := Vector3.ZERO

## 第一人称武器（保留 knife_view 属性兼容现有测试与引用）
var fp_weapon: Node3D
var knife_view: Node3D

## 弹簧阻尼震屏、FOV 脉冲与狩猎广角
var _base_fov := 75.0
var _punch_t := 0.0
var _punch_dur := 0.22
var _punch_strength := 1.0
var _punch_pitch_kick := 0.03
var _punch_roll_kick := 0.018
var _fov_pulse := 0.0
var _rush_fov := 0.0
var _down_roll := 0.0
var _step_dist: float = 0.0
var _step_left: bool = false


func apply_space_cfg(space: Dictionary) -> void:
	if space.is_empty():
		return
	speed = SpaceData.num(space, "move", "speed")
	if flashlight != null:
		var rng := SpaceData.num(space, "sight", "human_light_r")
		var half_deg := SpaceData.num(space, "sight", "cone_deg") * 0.5
		flashlight.spot_range = rng
		flashlight.spot_angle = half_deg
		if _spill_light != null:
			_spill_light.spot_range = rng * 1.05
			_spill_light.spot_angle = minf(75.0, half_deg * 1.48)
		if _light_cone != null:
			var sc := clampf(rng / 7.0, 0.6, 1.8)
			_light_cone.scale = Vector3(sc, sc, sc)


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
	safe_margin = 0.04


func _build_camera() -> void:
	camera = Camera3D.new()
	camera.position = Vector3(0.0, 1.62, 0.0)
	camera.fov = 75.0
	camera.near = 0.05
	camera.far = 220.0
	camera.current = true
	_base_fov = camera.fov
	add_child(camera)

	fp_weapon = FpWeaponViewScript.new()
	camera.add_child(fp_weapon)
	knife_view = fp_weapon.get("knife_root") as Node3D

	flashlight = SpotLight3D.new()
	flashlight.position = Vector3(0.18, -0.08, -0.12)
	flashlight.spot_range = 20.0
	flashlight.spot_angle = 30.0
	flashlight.spot_angle_attenuation = 1.15
	flashlight.spot_attenuation = 1.45
	flashlight.light_energy = 2.2
	flashlight.light_color = Color(1.0, 0.94, 0.82)
	flashlight.shadow_enabled = true
	flashlight.shadow_bias = 0.04
	camera.add_child(flashlight)

	_spill_light = SpotLight3D.new()
	_spill_light.spot_range = 21.0
	_spill_light.spot_angle = 44.0
	_spill_light.spot_angle_attenuation = 1.65
	_spill_light.spot_attenuation = 1.6
	_spill_light.light_energy = 0.45
	_spill_light.light_color = Color(0.95, 0.92, 0.84)
	_spill_light.shadow_enabled = false
	flashlight.add_child(_spill_light)

	_build_light_cone()


func _build_light_cone() -> void:
	_light_cone = MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.045
	cyl.bottom_radius = 1.45
	cyl.height = 5.2
	cyl.radial_segments = 20
	cyl.rings = 1
	cyl.cap_top = false
	cyl.cap_bottom = false
	_light_cone.mesh = cyl
	_light_cone.position = Vector3(0.0, 0.0, -2.65)
	_light_cone.rotation.x = PI * 0.5
	_light_cone.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

	var sh := Shader.new()
	sh.code = """
shader_type spatial;
render_mode blend_add, unshaded, cull_disabled, depth_draw_never;
void fragment() {
	float edge = pow(abs(dot(normalize(NORMAL), normalize(VIEW))), 1.85);
	float len_fade = (1.0 - UV.y) * smoothstep(0.0, 0.14, UV.y);
	ALBEDO = vec3(1.0, 0.94, 0.80);
	ALPHA = edge * len_fade * 0.045;
}
"""
	var sm := ShaderMaterial.new()
	sm.shader = sh
	_light_cone.material_override = sm
	flashlight.add_child(_light_cone)


func _unhandled_input(event: InputEvent) -> void:
	if ui_locked:
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var mm := event as InputEventMouseMotion
		rotate_y(-mm.relative.x * mouse_sensitivity)
		_pitch = clampf(_pitch - mm.relative.y * mouse_sensitivity, -1.35, 1.35)
		camera.rotation.x = _pitch
		if fp_weapon != null and fp_weapon.has_method("add_look_delta"):
			fp_weapon.call("add_look_delta", mm.relative)


func set_ghost(on: bool) -> void:
	if ghost == on:
		return
	ghost = on
	collision_layer = 0 if on else 1
	collision_mask = 0 if on else 1
	gravity = 0.0 if on else 18.0
	if flashlight != null:
		flashlight.visible = not on
	if not on:
		global_position.y = maxf(global_position.y, spawn_point.y)


func set_downed(on: bool) -> void:
	downed = on


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
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func set_knife_visible(on: bool) -> void:
	if fp_weapon != null and fp_weapon.has_method("set_knife_visible"):
		fp_weapon.call("set_knife_visible", on)


func set_weapon_state(alien: bool, knife_cnt: int, bullet_cnt: int, alive: bool,
		is_downed: bool, detained: bool, rush_t: float, meeting_open: bool) -> void:
	set_rush(alive and not is_downed and not detained and rush_t > 0.0)
	if fp_weapon != null and fp_weapon.has_method("set_weapon_state"):
		fp_weapon.call("set_weapon_state", alien, knife_cnt, bullet_cnt, alive,
			is_downed, detained, rush_t, meeting_open)


func play_knife_swing() -> void:
	if fp_weapon != null and fp_weapon.has_method("play_knife_swing"):
		fp_weapon.call("play_knife_swing")


func play_pistol_fire() -> void:
	if fp_weapon != null and fp_weapon.has_method("play_pistol_fire"):
		fp_weapon.call("play_pistol_fire")


func hitstop(dur: float = 0.055) -> void:
	if fp_weapon != null and fp_weapon.has_method("trigger_hitstop"):
		fp_weapon.call("trigger_hitstop", dur)


func set_rush(on: bool) -> void:
	_rush_fov = 6.5 if on else 0.0


func punch(strength: float = 1.0, pitch_kick: float = 0.032, roll_kick: float = 0.020) -> void:
	_punch_strength = clampf(strength, 0.15, 1.5)
	_punch_dur = lerpf(0.14, 0.26, clampf(_punch_strength, 0.0, 1.0))
	_punch_t = _punch_dur
	_punch_pitch_kick = pitch_kick
	_punch_roll_kick = roll_kick
	_fov_pulse = 5.0 * _punch_strength


func _animate_view(delta: float) -> void:
	if camera == null:
		return
	var target_y := 0.48 if downed else 1.62
	camera.position.y = lerpf(camera.position.y, target_y, clampf(delta * 7.5, 0.0, 1.0))
	_down_roll = lerpf(_down_roll, 0.14 if downed else 0.0, clampf(delta * 6.5, 0.0, 1.0))

	var target_fov := _base_fov + _rush_fov
	var pitch_off := 0.0
	var roll_off := _down_roll
	if _punch_t > 0.0:
		_punch_t = maxf(0.0, _punch_t - delta)
		var u := 1.0 - (_punch_t / maxf(0.01, _punch_dur))
		var env := exp(-u * 6.5) * sin(u * PI * 2.2)
		var fov_wave := -sin(minf(1.0, u * 2.5) * PI) * _fov_pulse + (0.35 * _fov_pulse * sin(u * PI))
		target_fov += fov_wave
		pitch_off = _punch_pitch_kick * _punch_strength * env
		roll_off += _punch_roll_kick * _punch_strength * cos(u * PI * 3.0) * (1.0 - u)

	camera.fov = lerpf(camera.fov, target_fov, clampf(delta * 16.0, 0.0, 1.0))
	camera.rotation.x = lerpf(camera.rotation.x, _pitch + pitch_off, clampf(delta * 24.0, 0.0, 1.0))
	camera.rotation.z = lerpf(camera.rotation.z, roll_off, clampf(delta * 20.0, 0.0, 1.0))

	if fp_weapon != null and fp_weapon.has_method("tick"):
		var horiz := Vector2(velocity.x, velocity.z).length()
		fp_weapon.call("tick", delta, horiz)


func _physics_process(delta: float) -> void:
	_animate_view(delta)
	if ui_locked:
		velocity = Vector3.ZERO
		return
	if downed:
		velocity = Vector3.ZERO
		return
	if spectator or ghost:
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
	velocity.x = direction.x * speed
	velocity.z = direction.z * speed
	if not is_on_floor():
		velocity.y -= gravity * delta
	else:
		velocity.y = -0.1
	var before := global_position
	move_and_slide()
	_clamp_to_nav(before, direction, delta)
	_tick_footstep(before, delta)

	if global_position.y < -8.0:
		global_position = spawn_point


func _tick_footstep(before: Vector3, delta: float) -> void:
	if ghost or spectator or ui_locked or downed:
		return
	var dx: float = global_position.x - before.x
	var dz: float = global_position.z - before.z
	var moved_xz: float = sqrt(dx * dx + dz * dz)
	var horiz_spd: float = moved_xz / maxf(delta, 0.0001) if delta > 0.0001 else 0.0
	if horiz_spd <= 0.5:
		_step_dist = minf(_step_dist, STEP_STRIDE * 0.5)
		return
	_step_dist += moved_xz
	if _step_dist < STEP_STRIDE:
		return
	_step_dist = fmod(_step_dist, STEP_STRIDE)
	_step_left = not _step_left
	var vol_sc: float = 0.30 if speed < 3.0 else 0.72
	stepped.emit(Vector2(global_position.x, global_position.z), vol_sc, _step_left)


func _clamp_to_nav(before: Vector3, wants: Vector3, delta: float) -> void:
	if nav == null:
		return
	var bp := Vector2(before.x, before.z)
	var ap := Vector2(global_position.x, global_position.z)
	if nav.is_free(bp) and not nav.is_free(ap):
		var safe: Vector2 = nav.nearest_free(bp)
		global_position.x = safe.x
		global_position.z = safe.y
		velocity = Vector3.ZERO
		return
	var moved := Vector2(global_position.x - before.x,
		global_position.z - before.z).length()
	if wants.length_squared() < 0.0001 or moved > 0.005:
		_stuck_t = 0.0
		return
	if _stuck_t <= 0.0:
		_stuck_mark = global_position
	_stuck_t += delta
	if _stuck_t < 0.3:
		return
	if _stuck_mark.distance_to(global_position) < 0.05:
		var free_p: Vector2 = nav.nearest_free(ap)
		global_position.x = free_p.x
		global_position.z = free_p.y
		velocity = Vector3.ZERO
		stuck_rescues += 1
	_stuck_t = 0.0
