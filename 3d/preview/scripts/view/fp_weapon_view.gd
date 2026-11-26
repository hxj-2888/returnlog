extends Node3D
## 第一人称武器与动作表现层：升级战术匕首、新增战术手枪、摇摆/步态/狩猎姿态、
## 挥刀弯月拖尾与命中局部顿帧、开枪滑膛后座与枪口瞬时火光。

const ArtStyle := preload("res://scripts/art_style.gd")

const KNIFE_SWING_LEN := 0.42
const PISTOL_FIRE_LEN := 0.35
const KNIFE_REST := Vector3(0.25, -0.23, -0.38)
const KNIFE_REST_ROT := Vector3(-0.28, 0.16, -0.15)
const PISTOL_REST := Vector3(0.24, -0.21, -0.37)
const PISTOL_REST_ROT := Vector3(0.02, 0.04, 0.0)

var knife_root: Node3D
var pistol_root: Node3D
var _slide: Node3D
var _slash_arc: MeshInstance3D
var _slash_mat: StandardMaterial3D
var _muzzle_flash: Node3D
var _muzzle_light: OmniLight3D

var _knife_swing := 0.0
var _hitstop_t := 0.0
var _pistol_fire_t := 0.0
var _pistol_tail := 0.0
var _flash_t := 0.0
var _bob := 0.0
var _sway := Vector2.ZERO
var _sway_vel := Vector2.ZERO
var _rush_blend := 0.0

var _show_knife := false
var _show_pistol := false


func _ready() -> void:
	_build_knife()
	_build_pistol()
	_build_slash_arc()


func _build_knife() -> void:
	knife_root = Node3D.new()
	knife_root.name = "knife_view"
	knife_root.visible = false
	knife_root.position = KNIFE_REST
	knife_root.rotation = KNIFE_REST_ROT
	add_child(knife_root)

	var steel := _make_blade_mat(false)
	var edge_mat := _make_blade_mat(true)
	var fuller_mat := StandardMaterial3D.new()
	fuller_mat.albedo_color = Color(0.16, 0.18, 0.22)
	fuller_mat.metallic = 0.72
	fuller_mat.roughness = 0.48

	var grip := StandardMaterial3D.new()
	grip.albedo_color = Color(0.11, 0.12, 0.14)
	grip.metallic = 0.06
	grip.roughness = 0.88
	var grip_tex := _load_tex("res://assets/weapons/knife-grip.png")
	if grip_tex != null:
		grip.albedo_texture = grip_tex
		grip.uv1_scale = Vector3(3.0, 3.0, 1.0)
		grip.albedo_color = Color(0.75, 0.76, 0.80)
		grip.roughness = 0.90

	# 主刀身脊背
	_add_box(knife_root, Vector3(0.022, 0.009, 0.195), Vector3(0.0, 0.002, -0.155), Vector3.ZERO, steel)
	# 高光开刃锋面（两侧斜收形成多面刀锋感）
	_add_box(knife_root, Vector3(0.016, 0.004, 0.190), Vector3(-0.012, -0.001, -0.155), Vector3(0.0, 0.0, -0.24), edge_mat)
	_add_box(knife_root, Vector3(0.016, 0.004, 0.190), Vector3(0.012, -0.001, -0.155), Vector3(0.0, 0.0, 0.24), edge_mat)
	# 血槽暗槽对比
	_add_box(knife_root, Vector3(0.008, 0.010, 0.125), Vector3(0.0, 0.002, -0.135), Vector3.ZERO, fuller_mat)
	# 锐角刀尖
	_add_box(knife_root, Vector3(0.018, 0.005, 0.058), Vector3(0.0, 0.001, -0.265), Vector3(0.0, 0.14, 0.0), edge_mat)
	# 金属护手与防滑刀柄、尾锤
	_add_box(knife_root, Vector3(0.062, 0.016, 0.018), Vector3(0.0, 0.0, -0.048), Vector3.ZERO, fuller_mat)
	_add_box(knife_root, Vector3(0.030, 0.036, 0.112), Vector3(0.0, -0.002, 0.020), Vector3.ZERO, grip)
	_add_box(knife_root, Vector3(0.034, 0.038, 0.018), Vector3(0.0, -0.002, 0.082), Vector3.ZERO, fuller_mat)


func _build_pistol() -> void:
	pistol_root = Node3D.new()
	pistol_root.name = "pistol_view"
	pistol_root.visible = false
	pistol_root.position = PISTOL_REST
	pistol_root.rotation = PISTOL_REST_ROT
	add_child(pistol_root)

	var frame_mat := StandardMaterial3D.new()
	frame_mat.albedo_color = Color(0.14, 0.15, 0.18)
	frame_mat.metallic = 0.18
	frame_mat.roughness = 0.80

	var slide_mat := StandardMaterial3D.new()
	slide_mat.albedo_color = Color(0.32, 0.36, 0.42)
	slide_mat.metallic = 0.84
	slide_mat.roughness = 0.26
	slide_mat.metallic_specular = 0.78

	var sight_mat := StandardMaterial3D.new()
	sight_mat.albedo_color = Color(0.28, 1.0, 0.72)
	sight_mat.emission_enabled = true
	sight_mat.emission = Color(0.25, 1.0, 0.68)
	sight_mat.emission_energy_multiplier = 2.6
	sight_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED

	# 枪身下机匣 + 倾斜握把 + 扳机护圈
	_add_box(pistol_root, Vector3(0.032, 0.026, 0.195), Vector3(0.0, 0.0, -0.085), Vector3.ZERO, frame_mat)
	_add_box(pistol_root, Vector3(0.030, 0.105, 0.044), Vector3(0.0, -0.056, -0.002), Vector3(0.24, 0.0, 0.0), frame_mat)
	_add_box(pistol_root, Vector3(0.012, 0.024, 0.046), Vector3(0.0, -0.022, -0.050), Vector3.ZERO, frame_mat)

	# 滑膛套筒（开火时后座滑移）
	_slide = Node3D.new()
	_slide.position = Vector3(0.0, 0.026, -0.085)
	pistol_root.add_child(_slide)
	_add_box(_slide, Vector3(0.034, 0.030, 0.205), Vector3.ZERO, Vector3.ZERO, slide_mat)
	# 氚光机械准星（后二前一点）
	_add_box(_slide, Vector3(0.005, 0.006, 0.006), Vector3(-0.008, 0.018, 0.090), Vector3.ZERO, sight_mat)
	_add_box(_slide, Vector3(0.005, 0.006, 0.006), Vector3(0.008, 0.018, 0.090), Vector3.ZERO, sight_mat)
	_add_box(_slide, Vector3(0.005, 0.008, 0.008), Vector3(0.0, 0.019, -0.090), Vector3.ZERO, sight_mat)

	# 枪口管口与瞬时火光组件
	_add_box(pistol_root, Vector3(0.018, 0.018, 0.030), Vector3(0.0, 0.024, -0.192), Vector3.ZERO, slide_mat)
	_muzzle_flash = Node3D.new()
	_muzzle_flash.position = Vector3(0.0, 0.024, -0.225)
	_muzzle_flash.visible = false
	pistol_root.add_child(_muzzle_flash)

	var flash_mat := StandardMaterial3D.new()
	flash_mat.albedo_color = Color(1.0, 0.85, 0.42, 0.92)
	flash_mat.emission_enabled = true
	flash_mat.emission = Color(1.0, 0.68, 0.22)
	flash_mat.emission_energy_multiplier = 4.2
	flash_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	flash_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	flash_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	flash_mat.cull_mode = BaseMaterial3D.CULL_DISABLED

	for rot_z in [0.0, PI * 0.5]:
		var petal := MeshInstance3D.new()
		var qm := QuadMesh.new()
		qm.size = Vector2(0.16, 0.16)
		petal.mesh = qm
		petal.rotation.z = float(rot_z)
		petal.material_override = flash_mat
		_muzzle_flash.add_child(petal)

	_muzzle_light = OmniLight3D.new()
	_muzzle_light.position = Vector3(0.0, 0.024, -0.24)
	_muzzle_light.light_color = Color(1.0, 0.78, 0.36)
	_muzzle_light.light_energy = 4.2
	_muzzle_light.omni_range = 4.8
	_muzzle_light.omni_attenuation = 1.4
	_muzzle_light.visible = false
	pistol_root.add_child(_muzzle_light)


func _build_slash_arc() -> void:
	_slash_arc = MeshInstance3D.new()
	_slash_arc.visible = false
	_slash_arc.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_slash_arc.position = Vector3(0.0, -0.05, -0.45)
	_slash_arc.rotation = Vector3(0.15, 0.0, -0.58)
	var mesh := ArrayMesh.new()
	var verts := PackedVector3Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()
	var segs := 14
	for i in range(segs + 1):
		var u := float(i) / float(segs)
		var ang := lerpf(-1.05, 1.05, u)
		var w := sin(u * PI) * 0.085
		var r_in := 0.24 - w * 0.35
		var r_out := 0.24 + w
		var cx := sin(ang)
		var cy := cos(ang) * 0.35
		verts.append(Vector3(cx * r_in, cy * r_in, 0.0))
		verts.append(Vector3(cx * r_out, cy * r_out, -0.05 * sin(u * PI)))
		uvs.append(Vector2(u, 0.0))
		uvs.append(Vector2(u, 1.0))
		if i < segs:
			var b := i * 2
			indices.append_array([b, b + 1, b + 2, b + 1, b + 3, b + 2])
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_TEX_UV] = uvs
	arr[Mesh.ARRAY_INDEX] = indices
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	_slash_arc.mesh = mesh
	_slash_mat = StandardMaterial3D.new()
	_slash_mat.albedo_color = Color(1.0, 0.42, 0.36, 0.85)
	_slash_mat.emission_enabled = true
	_slash_mat.emission = Color(1.0, 0.26, 0.22)
	_slash_mat.emission_energy_multiplier = 3.2
	_slash_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_slash_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_slash_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_slash_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_slash_arc.material_override = _slash_mat
	add_child(_slash_arc)


func _make_blade_mat(bright_edge: bool) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.86, 0.89, 0.94) if bright_edge else Color(0.62, 0.66, 0.72)
	mat.metallic = 0.94 if bright_edge else 0.80
	mat.roughness = 0.14 if bright_edge else 0.30
	mat.metallic_specular = 0.85
	var blade_tex := _load_tex("res://assets/weapons/knife-blade.png")
	if blade_tex != null:
		mat.albedo_texture = blade_tex
		mat.uv1_scale = Vector3(2.0, 2.0, 1.0)
	if ResourceLoader.exists(ArtStyle.DETAIL_NORMAL_PATH):
		mat.normal_enabled = true
		mat.normal_texture = load(ArtStyle.DETAIL_NORMAL_PATH) as Texture2D
		mat.normal_scale = 0.35
	return mat


func _add_box(parent: Node3D, sz: Vector3, pos: Vector3, rot: Vector3, mat: Material) -> void:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = sz
	mi.mesh = bm
	mi.position = pos
	mi.rotation = rot
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)


func _load_tex(path: String) -> Texture2D:
	if not ResourceLoader.exists(path):
		return null
	return load(path) as Texture2D


func add_look_delta(rel: Vector2) -> void:
	_sway_vel += Vector2(-rel.x, -rel.y) * 0.00045
	_sway_vel.x = clampf(_sway_vel.x, -0.045, 0.045)
	_sway_vel.y = clampf(_sway_vel.y, -0.045, 0.045)


func set_knife_visible(on: bool) -> void:
	_show_knife = on
	_sync_visibility()


func set_weapon_state(alien: bool, knife_cnt: int, bullet_cnt: int, alive: bool,
		downed: bool, detained: bool, rush_t: float, meeting_open: bool) -> void:
	var usable := alive and not downed and not detained and not meeting_open
	_show_knife = usable and ((alien and knife_cnt > 0) or _knife_swing > 0.0)
	_show_pistol = usable and (bullet_cnt > 0 or _pistol_tail > 0.0) and (not _show_knife or _pistol_tail > 0.0)
	if _show_pistol and _knife_swing <= 0.0 and _pistol_tail > 0.0:
		_show_knife = false
	_rush_blend = lerpf(_rush_blend, 1.0 if (usable and rush_t > 0.0) else 0.0, 0.25)
	_sync_visibility()


func _sync_visibility() -> void:
	if knife_root != null:
		knife_root.visible = _show_knife
	if pistol_root != null:
		pistol_root.visible = _show_pistol


func play_knife_swing() -> void:
	_knife_swing = KNIFE_SWING_LEN
	_hitstop_t = 0.0
	_show_knife = true
	_pistol_tail = 0.0
	_sync_visibility()


func play_pistol_fire() -> void:
	_pistol_fire_t = PISTOL_FIRE_LEN
	_pistol_tail = PISTOL_FIRE_LEN
	_flash_t = 0.05
	_show_pistol = true
	_show_knife = false
	if _muzzle_flash != null:
		_muzzle_flash.visible = true
		_muzzle_flash.rotation.z = randf() * TAU
		_muzzle_flash.scale = Vector3.ONE
	if _muzzle_light != null:
		_muzzle_light.visible = true
	_sync_visibility()


func trigger_hitstop(dur: float = 0.055) -> void:
	_hitstop_t = maxf(_hitstop_t, dur)


func tick(delta: float, horiz_speed: float) -> void:
	# 鼠标甩动惯性弹簧复位
	_sway = _sway.lerp(_sway + _sway_vel, clampf(delta * 16.0, 0.0, 1.0))
	_sway_vel = _sway_vel.lerp(Vector2.ZERO, clampf(delta * 14.0, 0.0, 1.0))
	_sway = _sway.lerp(Vector2.ZERO, clampf(delta * 10.0, 0.0, 1.0))
	_sway.x = clampf(_sway.x, -0.032, 0.032)
	_sway.y = clampf(_sway.y, -0.032, 0.032)

	# 8 字形步态摆动
	if horiz_speed > 0.4:
		var spd_mul := 1.25 if _rush_blend > 0.2 else 1.0
		_bob += delta * 8.8 * spd_mul
	else:
		_bob = lerpf(_bob, 0.0, clampf(delta * 5.0, 0.0, 1.0))
	var bob_off := Vector3.ZERO
	if horiz_speed > 0.4:
		bob_off = Vector3(sin(_bob) * 0.009, sin(_bob * 2.0) * 0.006, 0.0)
	var sway_off := Vector3(_sway.x, _sway.y, 0.0)
	var rush_pos := Vector3(-0.018, -0.032, -0.035) * _rush_blend
	var rush_rot := Vector3(-0.14, 0.04, 0.12) * _rush_blend

	if _pistol_tail > 0.0:
		_pistol_tail = maxf(0.0, _pistol_tail - delta)
	_tick_flash(delta)
	_tick_knife(delta, bob_off + sway_off + rush_pos, rush_rot)
	_tick_pistol(delta, bob_off + sway_off + rush_pos, rush_rot)


func _tick_flash(delta: float) -> void:
	if _flash_t > 0.0:
		_flash_t = maxf(0.0, _flash_t - delta)
		var k := clampf(_flash_t / 0.05, 0.0, 1.0)
		if _muzzle_flash != null:
			_muzzle_flash.visible = k > 0.0
			_muzzle_flash.scale = Vector3.ONE * (0.55 + 0.65 * k)
		if _muzzle_light != null:
			_muzzle_light.visible = k > 0.0
			_muzzle_light.light_energy = 4.2 * k
	else:
		if _muzzle_flash != null:
			_muzzle_flash.visible = false
		if _muzzle_light != null:
			_muzzle_light.visible = false


func _tick_knife(delta: float, dyn_pos: Vector3, dyn_rot: Vector3) -> void:
	if knife_root == null or not knife_root.visible:
		if _slash_arc != null:
			_slash_arc.visible = false
		return
	var rest_pos := KNIFE_REST + dyn_pos
	var rest_rot := KNIFE_REST_ROT + dyn_rot + Vector3(0.0, _sway.x * 1.4, -_sway.x * 2.2)
	if _knife_swing <= 0.0:
		knife_root.position = knife_root.position.lerp(rest_pos, clampf(delta * 13.0, 0.0, 1.0))
		knife_root.rotation = knife_root.rotation.lerp(rest_rot, clampf(delta * 13.0, 0.0, 1.0))
		if _slash_arc != null:
			_slash_arc.visible = false
		return

	if _hitstop_t > 0.0:
		_hitstop_t = maxf(0.0, _hitstop_t - delta)
		# 局部视觉顿帧：仅冻武器插值并伴随微震颤，不阻塞移动与逻辑
		knife_root.position += Vector3(randf_range(-0.004, 0.004), randf_range(-0.004, 0.004), 0.0)
		return

	_knife_swing = maxf(0.0, _knife_swing - delta)
	var elapsed := KNIFE_SWING_LEN - _knife_swing
	var pos := rest_pos
	var rot := rest_rot
	if elapsed < 0.06:
		var k := ease(elapsed / 0.06, 0.45)
		pos = rest_pos.lerp(rest_pos + Vector3(0.06, 0.14, 0.09), k)
		rot = rest_rot.lerp(rest_rot + Vector3(0.55, -0.32, 0.15), k)
	elif elapsed < 0.18:
		var k := ease((elapsed - 0.06) / 0.12, 0.50)
		pos = (rest_pos + Vector3(0.06, 0.14, 0.09)).lerp(rest_pos + Vector3(-0.16, -0.02, -0.17), k)
		rot = (rest_rot + Vector3(0.55, -0.32, 0.15)).lerp(rest_rot + Vector3(-0.42, 0.72, -0.78), k)
	else:
		var k := ease((elapsed - 0.18) / (KNIFE_SWING_LEN - 0.18), 0.30)
		pos = (rest_pos + Vector3(-0.16, -0.02, -0.17)).lerp(rest_pos, k)
		rot = (rest_rot + Vector3(-0.42, 0.72, -0.78)).lerp(rest_rot, k)
	knife_root.position = pos
	knife_root.rotation = rot

	if _slash_arc != null and _slash_mat != null:
		var show_arc := elapsed >= 0.055 and elapsed <= 0.24
		_slash_arc.visible = show_arc
		if show_arc:
			var ak := clampf((elapsed - 0.055) / 0.185, 0.0, 1.0)
			_slash_arc.scale = Vector3.ONE * lerpf(0.85, 1.25, ak)
			_slash_mat.albedo_color.a = (1.0 - ak) * 0.88


func _tick_pistol(delta: float, dyn_pos: Vector3, dyn_rot: Vector3) -> void:
	if pistol_root == null or not pistol_root.visible:
		return
	var rest_pos := PISTOL_REST + dyn_pos
	var rest_rot := PISTOL_REST_ROT + dyn_rot + Vector3(0.0, _sway.x * 1.2, -_sway.x * 1.8)
	if _pistol_fire_t <= 0.0:
		pistol_root.position = pistol_root.position.lerp(rest_pos, clampf(delta * 14.0, 0.0, 1.0))
		pistol_root.rotation = pistol_root.rotation.lerp(rest_rot, clampf(delta * 14.0, 0.0, 1.0))
		if _slide != null:
			_slide.position.z = lerpf(_slide.position.z, -0.085, clampf(delta * 20.0, 0.0, 1.0))
		return

	_pistol_fire_t = maxf(0.0, _pistol_fire_t - delta)
	var elapsed := PISTOL_FIRE_LEN - _pistol_fire_t
	var recoil := exp(-elapsed * 12.0) * sin(minf(1.0, elapsed / 0.05) * PI * 0.5)
	pistol_root.position = rest_pos + Vector3(0.0, 0.015 * recoil, 0.052 * recoil)
	pistol_root.rotation = rest_rot + Vector3(0.24 * recoil, 0.0, 0.04 * recoil)
	if _slide != null:
		var slide_kick := maxf(0.0, 1.0 - elapsed / 0.13)
		_slide.position.z = -0.085 + 0.046 * slide_kick
