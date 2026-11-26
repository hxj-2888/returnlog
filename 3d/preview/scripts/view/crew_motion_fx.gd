extends RefCounted
## 船员 3D 表现层运动平滑、自然步态、拖尸动作驱动与空间脚步声：只驱动节点表现与音效，不反向改 sim。

const POS_RATE := 16.0
const YAW_RATE := 12.0
const TELEPORT_DIST := 3.5
const STOP_HYSTERESIS := 0.14
const WALK_START_SPD := 0.38
const WALK_KEEP_SPD := 0.20
const STILL_STOP_SPD := 0.08
const STILL_CUTOFF_TIME := 0.12
const AI_STRIDE := 1.55
const HEAR_RADIUS := 13.5
const STEP_THROTTLE_MS := 70

var _yaw: Dictionary = {}
var _walk_hold: Dictionary = {}
var _walking: Dictionary = {}
var _still_t: Dictionary = {}
var _bob_phase: Dictionary = {}
var _lean_x: Dictionary = {}
var _bank_z: Dictionary = {}
var _y_off: Dictionary = {}
var _drag_mods: Dictionary = {}
var _stride: Dictionary = {}
var _step_left: Dictionary = {}
var _last_step_ms: int = 0
var _audio: Variant = null


## 拖尸时若模型暂无原生 drag 动画，通过 SkeletonModifier3D 在动画管线后叠加双臂后下伸展姿态。
class DragArmModifier extends SkeletonModifier3D:
	var drag_active: bool = false
	var _bones_ready: bool = false
	var _ua_l: int = -1
	var _ua_r: int = -1
	var _fa_l: int = -1
	var _fa_r: int = -1

	func _process_modification() -> void:
		if not drag_active:
			return
		var skel: Skeleton3D = get_skeleton()
		if skel == null:
			return
		if not _bones_ready:
			_bones_ready = true
			_ua_l = _find_bone(skel, ["upper_arm.L", "upper_arm_L"])
			_ua_r = _find_bone(skel, ["upper_arm.R", "upper_arm_R"])
			_fa_l = _find_bone(skel, ["forearm.L", "forearm_L"])
			_fa_r = _find_bone(skel, ["forearm.R", "forearm_R"])
		_blend_bone_pitch(skel, _ua_l, -0.68, 0.85)
		_blend_bone_pitch(skel, _ua_r, -0.68, 0.85)
		_blend_bone_pitch(skel, _fa_l, 0.22, 0.75)
		_blend_bone_pitch(skel, _fa_r, 0.22, 0.75)

	func _find_bone(skel: Skeleton3D, names: Array[String]) -> int:
		for bn in names:
			var idx := skel.find_bone(bn)
			if idx >= 0:
				return idx
		return -1

	func _blend_bone_pitch(skel: Skeleton3D, idx: int, pitch: float, weight: float) -> void:
		if idx < 0:
			return
		var rest_q := skel.get_bone_rest(idx).basis.get_rotation_quaternion()
		var cur_q := skel.get_bone_pose_rotation(idx)
		var target_q := rest_q * Quaternion(Vector3.RIGHT, pitch)
		skel.set_bone_pose_rotation(idx, cur_q.slerp(target_q, weight))


## 注入音频节点，供附近船员播发 3D 空间脚步声。
func set_audio(audio_node: Variant) -> void:
	_audio = audio_node


## 重置全部缓存状态（重建船员视图时调用）。
func reset() -> void:
	_yaw.clear()
	_walk_hold.clear()
	_walking.clear()
	_still_t.clear()
	_bob_phase.clear()
	_lean_x.clear()
	_bank_z.clear()
	_y_off.clear()
	_drag_mods.clear()
	_stride.clear()
	_step_left.clear()
	_last_step_ms = 0


## 清理单个船员的运动、朝向与步态缓存（尸体消失或远距裁剪时调用，防止复用旧朝向瞬转）。
func clear_agent(i: int) -> void:
	_yaw.erase(i)
	_walk_hold.erase(i)
	_walking.erase(i)
	_still_t.erase(i)
	_bob_phase.erase(i)
	_lean_x.erase(i)
	_bank_z.erase(i)
	_y_off.erase(i)
	_drag_mods.erase(i)
	_stride.erase(i)


## 帧率无关指数平滑位置（通用矢量辅助）。
func smooth_pos(cur: Vector3, tgt: Vector3, delta: float) -> Vector3:
	if cur.distance_to(tgt) > TELEPORT_DIST:
		return tgt
	var alpha: float = 1.0 - exp(-POS_RATE * maxf(delta, 0.0))
	return cur.lerp(tgt, alpha)


## 推进模型位移平滑；超距瞬移直接吸附并返回零位移，否则返回本帧水平位移。
func step_move(m: Node3D, i: int, tgt: Vector3, delta: float) -> Vector2:
	var prev: Vector3 = m.position
	if Vector2(prev.x, prev.z).distance_to(Vector2(tgt.x, tgt.z)) > TELEPORT_DIST:
		m.position = tgt
		_stride[i] = 0.0
		_walk_hold[i] = 0.0
		_walking[i] = false
		return Vector2.ZERO
	var alpha: float = 1.0 - exp(-POS_RATE * maxf(delta, 0.0))
	var next_x := lerpf(prev.x, tgt.x, alpha)
	var next_z := lerpf(prev.z, tgt.z, alpha)
	m.position = Vector3(next_x, prev.y, next_z)
	return Vector2(next_x - prev.x, next_z - prev.z)


## 更新活体船员的平滑转向、自然步态起伏/前倾/侧倾、拖尸姿态与 3D 空间脚步声。
func sync_alive(a: Dictionary, m: Node3D, i: int, delta: float, disp: Vector2,
		ap: AnimationPlayer, anim_state: Dictionary, action_t: Dictionary, can_step: bool) -> void:
	var dt: float = maxf(delta, 0.0)
	var spd: float = disp.length() / dt if dt > 0.0001 else 0.0
	var dragging: bool = int(a.get("drag", -1)) >= 0
	var is_walking: bool = _update_walk_state(a, i, dt, spd)
	var yaw_diff: float = _update_yaw(a, i, dt, disp, spd, is_walking)
	var has_drag_anim := _update_locomotion_anim(i, dt, spd, is_walking, dragging, ap, anim_state, action_t)
	_apply_gait_pose(m, i, dt, spd, is_walking, dragging, has_drag_anim, yaw_diff)
	if can_step and _audio != null and not bool(a.get("detained", false)):
		_tick_ai_footstep(a, m, i, disp.length())


## 带滞回与静止防空踏步的行走状态判定（兼容测试首帧 moving=true 即切 walk）。
func _update_walk_state(a: Dictionary, i: int, dt: float, spd: float) -> bool:
	var moving_flag: bool = bool(a.get("moving", false))
	var prev_walk: bool = bool(_walking.get(i, false))
	if spd < STILL_STOP_SPD:
		_walk_hold[i] = 0.0
		if moving_flag:
			_still_t[i] = float(_still_t.get(i, 0.0)) + dt
		else:
			_still_t[i] = 0.0
	else:
		_still_t[i] = 0.0
	var vel_walk: bool = spd > WALK_START_SPD or (prev_walk and spd > WALK_KEEP_SPD)
	if vel_walk:
		_walk_hold[i] = STOP_HYSTERESIS
	else:
		_walk_hold[i] = maxf(0.0, float(_walk_hold.get(i, 0.0)) - dt)
	var flag_walk: bool = moving_flag and (spd >= STILL_STOP_SPD or float(_still_t.get(i, 0.0)) <= STILL_CUTOFF_TIME)
	var is_walking: bool = flag_walk or vel_walk or (spd >= STILL_STOP_SPD and float(_walk_hold.get(i, 0.0)) > 0.0)
	_walking[i] = is_walking
	return is_walking


func _update_yaw(a: Dictionary, i: int, dt: float, disp: Vector2, spd: float, is_walking: bool) -> float:
	var use_disp: bool = spd > WALK_START_SPD or (is_walking and spd > WALK_KEEP_SPD)
	var dir: Vector2 = disp if use_disp else Vector2(cos(float(a.get("aimAng", 0.0))), sin(float(a.get("aimAng", 0.0))))
	if dir.length_squared() <= 0.000001:
		return 0.0
	# Godot 模型局部前向为 -Z，与 look_at(+dir) 对齐的角度为 atan2(-dir.x, -dir.z)。
	var target_yaw: float = atan2(-dir.x, -dir.y)
	if not _yaw.has(i):
		_yaw[i] = target_yaw
		return 0.0
	var prev_yaw := float(_yaw[i])
	var turn_alpha: float = 1.0 - exp(-YAW_RATE * dt)
	var next_yaw := lerp_angle(prev_yaw, target_yaw, turn_alpha)
	_yaw[i] = next_yaw
	return wrapf(target_yaw - prev_yaw, -PI, PI)


func _update_locomotion_anim(i: int, dt: float, spd: float, is_walking: bool, dragging: bool,
		ap: AnimationPlayer, anim_state: Dictionary, action_t: Dictionary) -> bool:
	if ap == null:
		return false
	if action_t.has(i):
		action_t[i] = maxf(0.0, float(action_t[i]) - dt)
		if float(action_t[i]) > 0.0:
			return false
		action_t.erase(i)
		anim_state[i] = ""

	var want: String = "walk" if is_walking else "idle"
	var use_drag_clip := false
	if dragging:
		var drag_clip := "drag_walk" if is_walking else "drag_idle"
		if _anim_name(ap, drag_clip) != "":
			want = drag_clip
			use_drag_clip = true

	if String(anim_state.get(i, "")) != want:
		anim_state[i] = want
		var anim_name: String = _anim_name(ap, want)
		if anim_name != "":
			ap.play(anim_name, 0.15)
	if want == "drag_walk":
		ap.speed_scale = clampf(spd / 2.25, 0.65, 1.85)
	elif want == "walk":
		ap.speed_scale = clampf(spd / 2.8, 0.55, 1.35) if dragging else clampf(spd / 2.25, 0.72, 2.25)
	else:
		ap.speed_scale = 0.85 if dragging else 1.0
	return use_drag_clip


## 叠加自然步态垂直起伏、速度前倾、转弯侧倾与程序化拖尸降重/前倾/双臂后伸姿态。
func _apply_gait_pose(m: Node3D, i: int, dt: float, spd: float, is_walking: bool,
		dragging: bool, has_drag_anim: bool, yaw_diff: float) -> void:
	var active_step: bool = is_walking and spd >= STILL_STOP_SPD
	if active_step:
		var phase_rate: float = clampf(spd * 4.2, 3.0, 9.5) * (0.78 if dragging else 1.0)
		_bob_phase[i] = fmod(float(_bob_phase.get(i, 0.0)) + dt * phase_rate, TAU)
	var bob_amp: float = 0.016 if dragging else 0.032
	var target_y: float = (-0.08 if (dragging and not has_drag_anim) else 0.0) + (absf(sin(float(_bob_phase.get(i, 0.0)))) * bob_amp if active_step else 0.0)
	var target_lean: float = 0.0
	if dragging and not has_drag_anim:
		target_lean = -0.26
	elif active_step:
		target_lean = -lerpf(0.04, 0.10, clampf((spd - 0.3) / 2.2, 0.0, 1.0))
	var target_bank: float = clampf(yaw_diff * 0.16 * clampf(spd / 1.5, 0.0, 1.0), -0.08, 0.08) if active_step else 0.0

	var pose_alpha: float = 1.0 - exp(-12.0 * dt)
	_y_off[i] = lerpf(float(_y_off.get(i, 0.0)), target_y, pose_alpha)
	_lean_x[i] = lerpf(float(_lean_x.get(i, 0.0)), target_lean, pose_alpha)
	_bank_z[i] = lerpf(float(_bank_z.get(i, 0.0)), target_bank, pose_alpha)

	m.position.y = float(_y_off[i])
	m.rotation = Vector3(float(_lean_x[i]), float(_yaw.get(i, m.rotation.y)), float(_bank_z[i]))

	var need_arm_mod := dragging and not has_drag_anim
	var mod := _ensure_drag_modifier(m, i, need_arm_mod)
	if mod != null:
		mod.drag_active = need_arm_mod


func _ensure_drag_modifier(m: Node3D, i: int, create_if_missing: bool) -> DragArmModifier:
	if _drag_mods.has(i):
		var cached: Variant = _drag_mods[i]
		if is_instance_valid(cached):
			return cached as DragArmModifier
		_drag_mods.erase(i)
	if not create_if_missing:
		return null
	var skel := m.find_child("Skeleton3D", true, false) as Skeleton3D
	if skel == null:
		return null
	var mod := DragArmModifier.new()
	mod.name = "drag_arm_mod"
	skel.add_child(mod)
	_drag_mods[i] = mod
	return mod


func _tick_ai_footstep(a: Dictionary, m: Node3D, i: int, dist: float) -> void:
	if dist <= 0.0001:
		return
	var acc: float = float(_stride.get(i, 0.0)) + dist
	if acc < AI_STRIDE:
		_stride[i] = acc
		return
	_stride[i] = fmod(acc, AI_STRIDE)
	var left: bool = not bool(_step_left.get(i, false))
	_step_left[i] = left
	var pos2: Vector2 = Vector2(m.position.x, m.position.z)
	if pos2.distance_to(_listener_pos(m)) > HEAR_RADIUS:
		return
	var now_ms: int = Time.get_ticks_msec()
	if now_ms - _last_step_ms < STEP_THROTTLE_MS:
		return
	_last_step_ms = now_ms
	var dragging: bool = int(a.get("drag", -1)) >= 0
	var step_scale: float = 0.40 if dragging else 0.65
	if _audio.has_method("play_step"):
		_audio.play_step(pos2, step_scale, left)
	else:
		_audio.play_at("step", pos2, step_scale)


func _listener_pos(m: Node3D) -> Vector2:
	if _audio != null:
		var lp: Variant = _audio.get("_listener_pos")
		if lp is Vector2:
			return lp
	var cam: Camera3D = m.get_viewport().get_camera_3d()
	if cam != null:
		return Vector2(cam.global_position.x, cam.global_position.z)
	return Vector2.ZERO


func _anim_name(ap: AnimationPlayer, want: String) -> String:
	for n in ap.get_animation_list():
		if String(n).to_lower().contains(want):
			return String(n)
	return ""
