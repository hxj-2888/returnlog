extends Node3D
## 第一人称武器与动作表现层：升级战术匕首、新增战术手枪、摇摆/步态/狩猎姿态、
## 挥刀弯月拖尾与命中局部顿帧、开枪滑膛后座与枪口瞬时火光。

const ArtStyle := preload("res://scripts/art_style.gd")

const KNIFE_SWING_LEN := 0.42
const PISTOL_FIRE_LEN := 0.35
const KNIFE_REST := Vector3(0.24, -0.21, -0.36)
const KNIFE_REST_ROT := Vector3(0.22, 0.22, -0.14)
const PISTOL_REST := Vector3(0.24, -0.21, -0.37)
const PISTOL_REST_ROT := Vector3(0.02, 0.04, 0.0)

var knife_root: Node3D
var hand_rig: Node3D
var pistol_root: Node3D
var _wrist_pivot: Node3D
var _hand_pivot: Node3D
var _thumb_pivot: Node3D
var _finger_pivots: Array[Dictionary] = []
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
var _breath_t := 0.0
var _sway := Vector2.ZERO
var _sway_vel := Vector2.ZERO
var _rush_blend := 0.0

var _show_knife := false
var _show_pistol := false


func _ready() -> void:
	_build_knife()
	_build_pistol()
	_build_slash_arc()


## 构建立姿战术匕首与真实正手抓握右手模型（保留刀刃/刀柄贴图路径）。
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
	fuller_mat.albedo_color = Color(0.15, 0.17, 0.21)
	fuller_mat.metallic = 0.72
	fuller_mat.roughness = 0.46

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

	# 立姿刀身：窄背厚脊（Y 为高度、X 为厚度、-Z 为前向）
	_add_box(knife_root, Vector3(0.0054, 0.0075, 0.164), Vector3(0.0, 0.0115, -0.138), Vector3.ZERO, steel)
	# 血槽暗槽对比
	_add_box(knife_root, Vector3(0.0046, 0.0065, 0.128), Vector3(0.0, 0.0045, -0.128), Vector3.ZERO, fuller_mat)
	# 双侧斜削刀面 + 锋利下刃口
	_add_box(knife_root, Vector3(0.0028, 0.022, 0.164), Vector3(-0.0019, -0.0005, -0.138), Vector3(0.0, 0.0, 0.11), steel)
	_add_box(knife_root, Vector3(0.0028, 0.022, 0.164), Vector3(0.0019, -0.0005, -0.138), Vector3(0.0, 0.0, -0.11), steel)
	_add_box(knife_root, Vector3(0.0014, 0.0040, 0.165), Vector3(0.0, -0.0120, -0.138), Vector3.ZERO, edge_mat)

	# PrismMesh 锋利收尖三角刀尖（主刀尖 + 双侧斜削尖面，在高度与厚度双向收窄）
	_add_prism(knife_root, Vector3(0.026, 0.072, 0.0036), Vector3(0.0, 0.0015, -0.254), Vector3(0.0, -PI * 0.5, PI * 0.5), 0.72, steel)
	_add_prism(knife_root, Vector3(0.022, 0.070, 0.0018), Vector3(-0.0009, 0.0005, -0.255), Vector3(0.0, -PI * 0.5 - 0.022, PI * 0.5), 0.74, edge_mat)
	_add_prism(knife_root, Vector3(0.022, 0.070, 0.0018), Vector3(0.0009, 0.0005, -0.255), Vector3(0.0, -PI * 0.5 + 0.022, PI * 0.5), 0.74, edge_mat)

	# 刀背防滑滚花拇指坡 + 立体双翼护手
	for j in range(4):
		_add_box(knife_root, Vector3(0.0060, 0.0028, 0.0035), Vector3(0.0, 0.0160, -0.060 - float(j) * 0.0075), Vector3.ZERO, fuller_mat)
	_add_box(knife_root, Vector3(0.022, 0.056, 0.014), Vector3(0.0, 0.001, -0.047), Vector3.ZERO, fuller_mat)
	for g_off in [-0.019, 0.021]:
		_add_box(knife_root, Vector3(0.024, 0.004, 0.016), Vector3(0.0, float(g_off), -0.047), Vector3.ZERO, steel)

	# 人体工学刀柄 + 指槽滚花肋条 + 棱面配重尾锤
	_add_box(knife_root, Vector3(0.021, 0.032, 0.114), Vector3(0.0, -0.004, 0.020), Vector3.ZERO, grip)
	for r in range(3):
		_add_box(knife_root, Vector3(0.022, 0.005, 0.008), Vector3(0.0, -0.019, -0.016 + float(r) * 0.022), Vector3.ZERO, fuller_mat)
	_add_box(knife_root, Vector3(0.025, 0.035, 0.016), Vector3(0.0, -0.004, 0.084), Vector3.ZERO, fuller_mat)
	_add_prism(knife_root, Vector3(0.028, 0.016, 0.018), Vector3(0.0, -0.004, 0.098), Vector3(0.0, PI * 0.5, PI * 0.5), 0.5, steel)

	_build_hand_rig(fuller_mat)


## 构建第一人称右手与前臂抓握骨架（深炭战术手套 + 船员袖口 + 四指两节环握 + 拇指扣护手）。
func _build_hand_rig(cuff_metal_mat: Material) -> void:
	hand_rig = Node3D.new()
	hand_rig.name = "hand_rig"
	knife_root.add_child(hand_rig)

	var glove_mat := StandardMaterial3D.new()
	glove_mat.albedo_color = Color(0.10, 0.11, 0.13)
	glove_mat.metallic = 0.06
	glove_mat.roughness = 0.84
	if ResourceLoader.exists(ArtStyle.DETAIL_NORMAL_PATH):
		glove_mat.normal_enabled = true
		glove_mat.normal_texture = load(ArtStyle.DETAIL_NORMAL_PATH) as Texture2D
		glove_mat.normal_scale = 0.45

	var knuckle_mat := StandardMaterial3D.new()
	knuckle_mat.albedo_color = Color(0.17, 0.18, 0.21)
	knuckle_mat.metallic = 0.18
	knuckle_mat.roughness = 0.54

	var sleeve_mat := StandardMaterial3D.new()
	sleeve_mat.albedo_color = Color(0.24, 0.28, 0.34)
	sleeve_mat.metallic = 0.06
	sleeve_mat.roughness = 0.78
	if ResourceLoader.exists(ArtStyle.DETAIL_NORMAL_PATH):
		sleeve_mat.normal_enabled = true
		sleeve_mat.normal_texture = load(ArtStyle.DETAIL_NORMAL_PATH) as Texture2D
		sleeve_mat.normal_scale = 0.35

	var cuff_band_mat := StandardMaterial3D.new()
	cuff_band_mat.albedo_color = Color(0.13, 0.14, 0.17)
	cuff_band_mat.metallic = 0.10
	cuff_band_mat.roughness = 0.70

	# 手掌与手指节点（包裹刀柄右侧与后侧）
	_hand_pivot = Node3D.new()
	_hand_pivot.name = "hand_palm"
	hand_rig.add_child(_hand_pivot)
	_add_capsule(_hand_pivot, 0.016, 0.092, Vector3(0.015, -0.002, 0.022), Vector3(PI * 0.5, 0.0, 0.0), glove_mat)
	_add_box(_hand_pivot, Vector3(0.014, 0.032, 0.082), Vector3(0.016, -0.003, 0.022), Vector3(0.0, 0.0, -0.08), glove_mat)
	# 手背关节护板
	_add_box(_hand_pivot, Vector3(0.011, 0.014, 0.072), Vector3(0.021, -0.011, 0.008), Vector3(0.0, 0.0, -0.18), knuckle_mat)

	# 4 根弯曲手指（食指/中指/无名指/小指，每根 2 节指节）紧握环绕刀柄
	_finger_pivots.clear()
	var finger_specs := [
		{"z": -0.024, "rad": 0.0072, "l1": 0.030, "l2": 0.024},
		{"z": -0.004, "rad": 0.0074, "l1": 0.031, "l2": 0.025},
		{"z": 0.016, "rad": 0.0070, "l1": 0.029, "l2": 0.023},
		{"z": 0.035, "rad": 0.0062, "l1": 0.026, "l2": 0.020},
	]
	for spec in finger_specs:
		_add_finger(_hand_pivot, float(spec["z"]), float(spec["rad"]), float(spec["l1"]), float(spec["l2"]), glove_mat, knuckle_mat)

	# 拇指（2 节指骨，扣在护手/刀柄上侧）
	_add_thumb(_hand_pivot, glove_mat, knuckle_mat)

	# 右前臂与护腕袖口（从右下视角边缘自然伸入，连接手腕）
	_wrist_pivot = Node3D.new()
	_wrist_pivot.name = "wrist_forearm"
	_wrist_pivot.position = Vector3(0.018, -0.012, 0.086)
	hand_rig.add_child(_wrist_pivot)
	_add_aimed_cyl(_wrist_pivot, 0.025, 0.029, Vector3(0.0, 0.0, 0.0), Vector3(0.012, -0.010, 0.060), glove_mat)
	_add_aimed_cyl(_wrist_pivot, 0.030, 0.032, Vector3(0.008, -0.007, 0.042), Vector3(0.015, -0.013, 0.072), cuff_band_mat)
	_add_aimed_cyl(_wrist_pivot, 0.033, 0.034, Vector3(0.011, -0.009, 0.054), Vector3(0.013, -0.011, 0.062), cuff_metal_mat)
	_add_aimed_cyl(_wrist_pivot, 0.034, 0.050, Vector3(0.013, -0.011, 0.064), Vector3(0.070, -0.068, 0.300), sleeve_mat)


## 构建单根 2 节指节手指，环绕刀柄下侧与左侧压紧。
func _add_finger(parent: Node3D, z_pos: float, rad: float, l1: float, l2: float,
		glove_mat: Material, knuckle_mat: Material) -> void:
	var kp := Node3D.new()
	kp.position = Vector3(0.014, -0.014, z_pos)
	parent.add_child(kp)
	# 近节指节（从右侧指根向 -X 下包）
	_add_capsule(kp, rad, l1, Vector3(-l1 * 0.46, -0.004, 0.0), Vector3(0.0, 0.0, PI * 0.5 + 0.18), glove_mat)
	_add_capsule(kp, rad * 1.04, 0.012, Vector3(-0.002, 0.0, 0.0), Vector3(0.0, 0.0, PI * 0.5), knuckle_mat)
	# 远节指节（绕过底面沿刀柄左侧向上扣紧）
	var mp := Node3D.new()
	mp.position = Vector3(-l1 * 0.90, -0.006, 0.0)
	kp.add_child(mp)
	_add_capsule(mp, rad * 0.90, l2, Vector3(-0.001, l2 * 0.44, 0.0), Vector3(0.0, 0.0, -0.16), glove_mat)
	_finger_pivots.append({"kp": kp, "mp": mp})


## 构建正手抓握拇指（2 节指骨扣在刀柄上缘与护手后侧）。
func _add_thumb(parent: Node3D, glove_mat: Material, knuckle_mat: Material) -> void:
	var tb := Node3D.new()
	tb.position = Vector3(0.015, 0.010, 0.016)
	parent.add_child(tb)
	_add_aimed_cyl(tb, 0.0086, 0.0076, Vector3.ZERO, Vector3(-0.009, 0.008, -0.030), glove_mat)
	_add_capsule(tb, 0.0082, 0.014, Vector3(-0.001, 0.002, -0.002), Vector3(PI * 0.35, 0.0, 0.4), knuckle_mat)
	_thumb_pivot = Node3D.new()
	_thumb_pivot.position = Vector3(-0.009, 0.008, -0.030)
	tb.add_child(_thumb_pivot)
	_add_aimed_cyl(_thumb_pivot, 0.0074, 0.0062, Vector3.ZERO, Vector3(-0.005, 0.001, -0.022), glove_mat)


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
	mat.albedo_color = Color(0.82, 0.86, 0.91) if bright_edge else Color(0.54, 0.58, 0.65)
	mat.metallic = 0.88 if bright_edge else 0.78
	mat.roughness = 0.22 if bright_edge else 0.34
	mat.metallic_specular = 0.68 if bright_edge else 0.62
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


func _add_prism(parent: Node3D, sz: Vector3, pos: Vector3, rot: Vector3, lr: float, mat: Material) -> void:
	var mi := MeshInstance3D.new()
	var pm := PrismMesh.new()
	pm.size = sz
	pm.left_to_right = lr
	mi.mesh = pm
	mi.position = pos
	mi.rotation = rot
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)


func _add_capsule(parent: Node3D, rad: float, h: float, pos: Vector3, rot: Vector3, mat: Material) -> void:
	var mi := MeshInstance3D.new()
	var cm := CapsuleMesh.new()
	cm.radius = rad
	cm.height = h
	cm.radial_segments = 10
	cm.rings = 3
	mi.mesh = cm
	mi.position = pos
	mi.rotation = rot
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)


func _add_aimed_cyl(parent: Node3D, top_r: float, bot_r: float, p_from: Vector3, p_to: Vector3, mat: Material) -> void:
	var delta_v := p_to - p_from
	var len_v := delta_v.length()
	if len_v <= 0.0001:
		return
	var mi := MeshInstance3D.new()
	var cy := CylinderMesh.new()
	cy.top_radius = top_r
	cy.bottom_radius = bot_r
	cy.height = len_v
	cy.radial_segments = 12
	cy.rings = 1
	mi.mesh = cy
	mi.position = (p_from + p_to) * 0.5
	var up_dir := -delta_v / len_v
	var ref := Vector3.RIGHT if absf(up_dir.dot(Vector3.RIGHT)) < 0.92 else Vector3.FORWARD
	var x_ax := up_dir.cross(ref).normalized()
	var z_ax := x_ax.cross(up_dir).normalized()
	mi.basis = Basis(x_ax, up_dir, z_ax)
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
	_breath_t += delta
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
	var breath := sin(_breath_t * 2.1)
	var rest_pos := KNIFE_REST + dyn_pos + Vector3(0.0, breath * 0.003, 0.0)
	var rest_rot := KNIFE_REST_ROT + dyn_rot + Vector3(breath * 0.012, _sway.x * 1.4, -_sway.x * 2.2)
	if _knife_swing <= 0.0:
		knife_root.position = knife_root.position.lerp(rest_pos, clampf(delta * 13.0, 0.0, 1.0))
		knife_root.rotation = knife_root.rotation.lerp(rest_rot, clampf(delta * 13.0, 0.0, 1.0))
		_apply_hand_grip(delta, 0.02 + 0.03 * maxf(0.0, breath), Vector3(breath * 0.03, 0.0, breath * 0.02))
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
	var grip_curl := 0.0
	var wrist_rot := Vector3.ZERO
	if elapsed < 0.065:
		# 蓄力阶段：手指微收紧、手腕上挑
		var k := ease(elapsed / 0.065, 0.45)
		pos = rest_pos.lerp(rest_pos + Vector3(0.06, 0.12, 0.08), k)
		rot = rest_rot.lerp(rest_rot + Vector3(0.42, -0.28, 0.20), k)
		grip_curl = lerpf(0.02, 0.16, k)
		wrist_rot = Vector3.ZERO.lerp(Vector3(0.18, -0.08, 0.10), k)
	elif elapsed < 0.19:
		# 挥劈阶段：前臂发力斜斩、手指紧锁
		var k := ease((elapsed - 0.065) / 0.125, 0.50)
		pos = (rest_pos + Vector3(0.06, 0.12, 0.08)).lerp(rest_pos + Vector3(-0.18, -0.04, -0.17), k)
		rot = (rest_rot + Vector3(0.42, -0.28, 0.20)).lerp(rest_rot + Vector3(-0.46, 0.74, -0.82), k)
		grip_curl = lerpf(0.16, 0.30, k)
		wrist_rot = Vector3(0.18, -0.08, 0.10).lerp(Vector3(-0.22, 0.14, -0.18), k)
	else:
		# 回正阶段：自然松弛回位
		var k := ease((elapsed - 0.19) / (KNIFE_SWING_LEN - 0.19), 0.30)
		pos = (rest_pos + Vector3(-0.18, -0.04, -0.17)).lerp(rest_pos, k)
		rot = (rest_rot + Vector3(-0.46, 0.74, -0.82)).lerp(rest_rot, k)
		grip_curl = lerpf(0.30, 0.02, k)
		wrist_rot = Vector3(-0.22, 0.14, -0.18).lerp(Vector3.ZERO, k)
	knife_root.position = pos
	knife_root.rotation = rot
	_apply_hand_grip(delta, grip_curl, wrist_rot)

	if _slash_arc != null and _slash_mat != null:
		var show_arc := elapsed >= 0.055 and elapsed <= 0.24
		_slash_arc.visible = show_arc
		if show_arc:
			var ak := clampf((elapsed - 0.055) / 0.185, 0.0, 1.0)
			_slash_arc.scale = Vector3.ONE * lerpf(0.85, 1.25, ak)
			_slash_mat.albedo_color.a = (1.0 - ak) * 0.88


## 联动右手手腕屈伸、四指卷曲锁紧与拇指压护手动作。
func _apply_hand_grip(delta: float, grip_curl: float, wrist_rot: Vector3) -> void:
	if hand_rig == null:
		return
	var a := clampf(delta * 20.0, 0.0, 1.0)
	if _wrist_pivot != null:
		_wrist_pivot.rotation = _wrist_pivot.rotation.lerp(wrist_rot, a)
	if _thumb_pivot != null:
		_thumb_pivot.rotation.z = lerpf(_thumb_pivot.rotation.z, grip_curl * 0.25, a)
	for f in _finger_pivots:
		var kp := f.get("kp") as Node3D
		var mp := f.get("mp") as Node3D
		if kp != null:
			kp.rotation.z = lerpf(kp.rotation.z, -grip_curl * 0.35, a)
		if mp != null:
			mp.rotation.z = lerpf(mp.rotation.z, -grip_curl * 0.55, a)


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
