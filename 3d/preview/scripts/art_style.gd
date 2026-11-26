extends RefCounted
## 写实风格统一材质与环境口径（单一真源，供 map_builder / scene_extras / device / crew_view 共用）。
## 依据：3d/docs/art/ART_DIRECTION.md §1–§2 + Godot 4 ACES Filmic PBR 室内光照口径。

const DETAIL_NORMAL_PATH := "res://assets/textures/detail-micro-normal.png"
const CONTACT_SHADOW_PATH := "res://assets/textures/contact-shadow.png"
const COVER_SKIN_DIR := "res://assets/textures/cover/"

const PRESETS := {
	"painted_steel": {"metallic": 0.28, "roughness": 0.58},
	"bare_metal": {"metallic": 0.78, "roughness": 0.38},
	"rubber_grip": {"metallic": 0.0, "roughness": 0.88},
	"fabric_suit": {"metallic": 0.04, "roughness": 0.78},
	"screen_glass": {"metallic": 0.10, "roughness": 0.24},
}

const COVER_PRESETS := {
	"brushed_steel": {"metallic": 0.85, "roughness": 0.36, "specular": 0.65, "normal": 0.72},
	"metal_panel": {"metallic": 0.45, "roughness": 0.50, "specular": 0.52, "normal": 0.72},
	"shell_white": {"metallic": 0.06, "roughness": 0.54, "specular": 0.42, "normal": 0.65},
	"fabric": {"metallic": 0.0, "roughness": 0.90, "specular": 0.22, "normal": 0.78},
	"rubber": {"metallic": 0.0, "roughness": 0.88, "specular": 0.20, "normal": 0.75},
	"wood": {"metallic": 0.0, "roughness": 0.72, "specular": 0.32, "normal": 0.70},
	"glass": {"metallic": 0.08, "roughness": 0.12, "specular": 0.85, "normal": 0.35},
	"hazard": {"metallic": 0.18, "roughness": 0.55, "specular": 0.45, "normal": 0.70},
	"leaf": {"metallic": 0.0, "roughness": 0.62, "specular": 0.35, "normal": 0.65},
	"screen": {"metallic": 0.12, "roughness": 0.22, "specular": 0.80, "normal": 0.35},
}


static func apply_environment(env: Environment) -> void:
	if env == null:
		return
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.008, 0.011, 0.018)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.56, 0.63, 0.74)
	env.ambient_light_energy = 0.24
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.18
	env.tonemap_white = 5.2
	env.adjustment_enabled = true
	env.adjustment_brightness = 1.04
	env.adjustment_contrast = 1.05
	env.adjustment_saturation = 1.06
	env.glow_enabled = true
	env.glow_intensity = 0.30
	env.glow_bloom = 0.06
	env.glow_hdr_threshold = 0.88
	env.fog_enabled = true
	env.fog_light_color = Color(0.014, 0.020, 0.034)
	env.fog_density = 0.007
	env.fog_depth_begin = 12.0


static func apply_pbr(mat: StandardMaterial3D, preset: String) -> StandardMaterial3D:
	if mat == null:
		return mat
	var p: Dictionary = PRESETS.get(preset, PRESETS["painted_steel"])
	mat.metallic = float(p["metallic"])
	mat.roughness = float(p["roughness"])
	return mat


## 墙面工业烤漆 PBR：修正旧版金属度过高的塑料反光，挂载法线、粗糙度与微表面细节法线。
static func apply_wall_pbr(mat: StandardMaterial3D, albedo_path: String, tile_m: float) -> void:
	if mat == null:
		return
	mat.metallic = 0.12
	mat.metallic_specular = 0.45
	mat.roughness = 0.62
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.uv1_triplanar = true
	mat.uv1_scale = Vector3.ONE * (1.0 / tile_m)
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	apply_shared_pbr(mat, albedo_path, 0.85, true)
	if ResourceLoader.exists(DETAIL_NORMAL_PATH):
		mat.detail_enabled = true
		mat.detail_normal = load(DETAIL_NORMAL_PATH) as Texture2D
		mat.detail_blend_mode = BaseMaterial3D.BLEND_MODE_MUL
		mat.detail_uv_layer = BaseMaterial3D.DETAIL_UV_1


## 地板 PBR：严格保留原 albedo_texture / albedo_color / UV repeat_m，仅叠加法线与粗糙度贴图。
static func apply_floor_pbr(mat: StandardMaterial3D, tex_name: String) -> void:
	if mat == null or tex_name == "":
		return
	var albedo_path := "res://assets/textures/%s.png" % tex_name
	apply_shared_pbr(mat, albedo_path, 0.75, true)


## 通用共享贴图派生 PBR（*-normal.png / *-rough.png）。
static func apply_shared_pbr(mat: StandardMaterial3D, albedo_path: String, normal_scale: float = 0.70, override_rough: bool = false) -> void:
	if mat == null or albedo_path == "" or not albedo_path.ends_with(".png"):
		return
	var n_path := albedo_path.replace(".png", "-normal.png")
	if ResourceLoader.exists(n_path):
		mat.normal_enabled = true
		mat.normal_texture = load(n_path) as Texture2D
		mat.normal_scale = normal_scale
	var r_path := albedo_path.replace(".png", "-rough.png")
	if ResourceLoader.exists(r_path):
		mat.roughness_texture = load(r_path) as Texture2D
		mat.roughness_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_RED
		if override_rough:
			mat.roughness = 1.0


## 掩体 10 套材质差异化分档（金属 / 烤漆 / 织物 / 橡胶 / 木材 / 玻璃）。
static func apply_cover_pbr(mat: StandardMaterial3D, role: String) -> void:
	if mat == null:
		return
	var cfg: Dictionary = COVER_PRESETS.get(role, COVER_PRESETS["metal_panel"])
	var base := COVER_SKIN_DIR + role
	if ResourceLoader.exists(base + "_albedo.jpg"):
		mat.albedo_texture = load(base + "_albedo.jpg") as Texture2D
	if ResourceLoader.exists(base + "_normal.jpg"):
		mat.normal_enabled = true
		mat.normal_texture = load(base + "_normal.jpg") as Texture2D
		mat.normal_scale = float(cfg["normal"])
	if ResourceLoader.exists(base + "_rough.jpg"):
		mat.roughness_texture = load(base + "_rough.jpg") as Texture2D
		mat.roughness_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_RED
	mat.metallic = float(cfg["metallic"])
	mat.roughness = float(cfg["roughness"])
	mat.metallic_specular = float(cfg["specular"])
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC


static func tune_crew_material(mat: StandardMaterial3D) -> void:
	if mat == null:
		return
	var rname := String(mat.resource_name).to_lower()
	var has_orm := mat.roughness_texture != null
	if mat.ao_texture != null:
		mat.ao_enabled = true
		mat.ao_light_affect = 0.45
	if rname.contains("face") or rname.contains("skin") or rname.contains("head"):
		mat.metallic = 0.0
		mat.roughness = 0.52
		mat.metallic_specular = 0.32
		mat.rim_enabled = true
		mat.rim = 0.22
		mat.rim_tint = 0.65
	elif rname.contains("suit") or rname.contains("cloth") or rname.contains("fabric"):
		if has_orm:
			mat.roughness = 1.0
			mat.metallic = 1.0 if mat.metallic_texture != null else 0.0
		else:
			apply_pbr(mat, "fabric_suit")
		mat.rim_enabled = true
		mat.rim = 0.16
		mat.rim_tint = 0.30
	elif rname.contains("hair"):
		mat.metallic = 0.0
		mat.roughness = 0.92
		mat.metallic_specular = 0.15
	elif has_orm:
		mat.roughness = 1.0
		mat.metallic = 1.0 if mat.metallic_texture != null else 0.0
	elif rname.contains("boot") or rname.contains("glove") or rname.contains("belt") or rname.contains("rubber"):
		apply_pbr(mat, "rubber_grip")
	elif rname.contains("metal") or rname.contains("visor") or rname.contains("buckle"):
		apply_pbr(mat, "bare_metal")
	else:
		mat.roughness = maxf(mat.roughness, 0.65)
		mat.metallic = minf(mat.metallic, 0.15)


## 在地面上方挂载软接触阴影贴花，消除家具/设备/机器人悬浮感。
static func attach_contact_shadow(parent: Node3D, local_pos: Vector3, radius: float = 0.65, opacity: float = 0.62) -> MeshInstance3D:
	if parent == null or not ResourceLoader.exists(CONTACT_SHADOW_PATH):
		return null
	var mi := MeshInstance3D.new()
	var quad := QuadMesh.new()
	quad.size = Vector2(radius * 2.0, radius * 2.0)
	mi.mesh = quad
	mi.position = local_pos
	mi.rotation.x = -PI * 0.5
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = load(CONTACT_SHADOW_PATH) as Texture2D
	mat.albedo_color = Color(1.0, 1.0, 1.0, clampf(opacity, 0.0, 1.0))
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	mi.material_override = mat
	parent.add_child(mi)
	return mi
