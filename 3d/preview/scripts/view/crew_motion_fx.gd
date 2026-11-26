extends RefCounted
## 船员 3D 表现层运动平滑与空间脚步声：只驱动节点表现与音效，不反向改 sim。

const POS_RATE := 16.0
const YAW_RATE := 12.0
const TELEPORT_DIST := 3.5
const STOP_HYSTERESIS := 0.14
const AI_STRIDE := 1.55
const HEAR_RADIUS := 13.5
const STEP_THROTTLE_MS := 70

var _yaw: Dictionary = {}
var _walk_hold: Dictionary = {}
var _stride: Dictionary = {}
var _step_left: Dictionary = {}
var _last_step_ms: int = 0
var _audio: Variant = null


## 注入音频节点，供附近船员播发 3D 空间脚步声。
func set_audio(audio_node: Variant) -> void:
	_audio = audio_node


## 重置全部缓存状态（重建船员视图时调用）。
func reset() -> void:
	_yaw.clear()
	_walk_hold.clear()
	_stride.clear()
	_step_left.clear()
	_last_step_ms = 0


## 清理单个船员的运动与步距缓存（尸体消失或远距裁剪时调用）。
func clear_agent(i: int) -> void:
	_walk_hold.erase(i)
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
	if prev.distance_to(tgt) > TELEPORT_DIST:
		m.position = tgt
		_stride[i] = 0.0
		_walk_hold[i] = 0.0
		return Vector2.ZERO
	var alpha: float = 1.0 - exp(-POS_RATE * maxf(delta, 0.0))
	m.position = prev.lerp(tgt, alpha)
	return Vector2(m.position.x - prev.x, m.position.z - prev.z)


## 更新活体船员的平滑转向、抗抖动步态与 3D 空间脚步声。
func sync_alive(a: Dictionary, m: Node3D, i: int, delta: float, disp: Vector2,
		ap: AnimationPlayer, anim_state: Dictionary, action_t: Dictionary, can_step: bool) -> void:
	var dt: float = maxf(delta, 0.0)
	var spd: float = disp.length() / dt if dt > 0.0001 else 0.0
	_update_yaw(a, m, i, dt, disp, spd)
	_update_locomotion_anim(a, i, dt, spd, ap, anim_state, action_t)
	if can_step and _audio != null and not bool(a.get("detained", false)):
		_tick_ai_footstep(a, m, i, disp.length())


func _update_yaw(a: Dictionary, m: Node3D, i: int, dt: float, disp: Vector2, spd: float) -> void:
	var dir: Vector2 = disp if spd > 0.35 else Vector2(cos(float(a.get("aimAng", 0.0))), sin(float(a.get("aimAng", 0.0))))
	if dir.length_squared() <= 0.000001:
		return
	# Godot 模型局部前向为 -Z，与 look_at(+dir) 对齐的角度为 atan2(-dir.x, -dir.z)。
	var target_yaw: float = atan2(-dir.x, -dir.y)
	if not _yaw.has(i):
		_yaw[i] = target_yaw
	else:
		var turn_alpha: float = 1.0 - exp(-YAW_RATE * dt)
		_yaw[i] = lerp_angle(float(_yaw[i]), target_yaw, turn_alpha)
	m.rotation = Vector3(0.0, float(_yaw[i]), 0.0)


func _update_locomotion_anim(a: Dictionary, i: int, dt: float, spd: float,
		ap: AnimationPlayer, anim_state: Dictionary, action_t: Dictionary) -> void:
	if spd > 0.30:
		_walk_hold[i] = STOP_HYSTERESIS
	else:
		_walk_hold[i] = maxf(0.0, float(_walk_hold.get(i, 0.0)) - dt)
	var is_walking: bool = bool(a.get("moving", false)) or spd > 0.30 or float(_walk_hold.get(i, 0.0)) > 0.0
	if ap == null:
		return
	if action_t.has(i):
		action_t[i] = maxf(0.0, float(action_t[i]) - dt)
		if float(action_t[i]) > 0.0:
			return
		action_t.erase(i)
		anim_state[i] = ""
	var want: String = "walk" if is_walking else "idle"
	if String(anim_state.get(i, "")) != want:
		anim_state[i] = want
		var anim_name: String = _anim_name(ap, want)
		if anim_name != "":
			ap.play(anim_name, 0.15)
	ap.speed_scale = clampf(spd / 1.4, 0.8, 4.5) if want == "walk" else 1.0


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
