extends Node3D

## 把 2.5D 导出的 map.json 升维成可走场景。
## 复用边界：房间 poly / 走廊 pts / 墙体线段 / 掩体矩形 / 现有表面贴图。
## 不把 2.5D 的 DOM、迷雾、点击寻路带进来；碰撞与移动全部是 3D 的。

const SpaceData := preload("res://scripts/space_data.gd")
const ArtStyle := preload("res://scripts/art_style.gd")
const RoomLighting := preload("res://scripts/view/room_lighting.gd")
const ArchTrim := preload("res://scripts/view/arch_trim.gd")
const CoverBuilder := preload("res://scripts/view/cover_builder.gd")
const MAP_PATH := "res://data/map_v2.json"
const WALL_HEIGHT := 3.0
const CEILING_Y := 3.2
## 非地板表面的世界尺度（墙、装饰板）。地板走 floor_spec 的 per-room repeat_m。
const UV_WORLD_SCALE := 4.0
## 天花板贴图重复边长（米）。天花板是舱室面积最大的连续面，贴图尺度太大会看不出纹理。
const CEIL_TILE_M := 3.0

## 走廊顶灯的照度半径：这是 3D 表现参数，2.5D 没有对应量（2.5D 的走廊"亮"是判定 + 遮罩），
## 所以不进 space.json，但必须和走廊宽度成比例，不能目测乱填。
const CORR_LAMP_RANGE := 8.0
## 断电后仍保留的极弱底光（不是"能看见人"，只是不让玩家失去地图结构）。
const BLACKOUT_AMBIENT := 0.045
const LIT_AMBIENT := 0.24
## 墙面全局曝光补偿：3D 实时光与烘焙端 Cycles 不同，需要一个绝对基准。
## 房间之间的色差完全由 rooms[].theme.wall 决定，这个系数不参与区分。
const WALL_TINT_BASE := Color(0.74, 0.78, 0.84)

## 地板口径 **不再抄第二份**：真源在 res://data/floor_spec.json
## （由 3d/tools/export-floor-spec.cjs 生成，tools/blender-ship.py 读同一份）。
## 2026-11-07：以前这里硬编码一套 ROOM_TEXTURES + 全局 UV_WORLD_SCALE=4.0，
## 与底图（blender-ship.py 的 FLOOR_SCALE/FLOOR_TINT）不一致 ——
## 底图 med 是 3.0m 一循环的大瓷砖，3D 却是 4.0m 密格+青灯条，
## 观感上就是「地板被换掉了」。现在两边共用一份表。
const FLOOR_SPEC_PATH := "res://data/floor_spec.json"
var floor_spec: Dictionary = {}

## 房间级静默加载：玩家所在房间 + 附近房间保留，其余 visible=false（节点常驻内存，不卸载）。
const ROOM_KEEP_RADIUS := 20.0
var _room_nodes: Dictionary = {}
var _cull_enabled := false
var _cull_tick := 0.0
var _covers: CoverBuilder = CoverBuilder.new()


static func _load_json_dict(path: String) -> Dictionary:
	var fh := FileAccess.open(path, FileAccess.READ)
	if fh == null:
		return {}
	var parsed: Variant = JSON.parse_string(fh.get_as_text())
	if parsed is Dictionary:
		return parsed
	return {}


## 自测入口：读同一份 floor_spec（不缓存，保证测的是当前文件）。
static func load_floor_spec() -> Dictionary:
	return _load_json_dict(FLOOR_SPEC_PATH)


## 某个舱的地面染色（与真源一致）。自测与调参都走这里，避免再抄一份。
func floor_tint_for(rid: String) -> Color:
	var spec: Dictionary = floor_spec if not floor_spec.is_empty() else load_floor_spec()
	var rooms: Dictionary = spec.get("rooms", {})
	if not rooms.has(rid):
		return Color(1, 1, 1)
	return _spec_tint(rooms[rid])


## 某个舱的地面贴图重复边长（米）。自测与调参都走这里，避免再抄一份。
func floor_repeat_for(rid: String) -> float:
	var spec: Dictionary = floor_spec if not floor_spec.is_empty() else load_floor_spec()
	var rooms: Dictionary = spec.get("rooms", {})
	if not rooms.has(rid):
		return UV_WORLD_SCALE
	return float((rooms[rid] as Dictionary).get("repeat_m", UV_WORLD_SCALE))

## 掩体名义高度（米），真源迁至 scripts/view/cover_builder.gd，此处保留别名兼容引用。
const COVER_HEIGHT := CoverBuilder.COVER_HEIGHT

## 墙面贴图按舱室分张：`res://assets/textures/cabin/<room>.png`
## 由 3d/tools/bake-refs.py 从千问参考图烘焙（裁中心去透视 + 四向镜像成无缝）。
## 缺图时回退到原来的共享 wall-panel + theme.wall 染色，不影响出包。
const CABIN_TEX_DIR := "res://assets/textures/cabin/"
## 一张 512 贴图覆盖的墙面尺寸（米）。身份色在图里，这里只管重复密度。
const CABIN_TILE_M := 3.4
## 千问覆盖的 10 舱（2026-11-09 SDXL 退役、铁板舱 exclusion 解除）：墙面贴图与
## WALL_SKIN 的首张同字节。改走同一条 ResourceLoader 路径后，同一张 1536² 纹理
## 只上传一次显存；贴图缺失时 _wall_material() 自动退回共享 wall-panel + 染色。
const CABIN_QWEN_ROOMS := ["bridge", "cam", "ecosys", "transit", "fun", "med",
	"power", "engine", "armory", "warehouse"]

var data: Dictionary = {}
var space: Dictionary = {}
var _materials: Dictionary = {}
var _cabin_mats: Dictionary = {}

## 断电表现要作用的对象：全船灯 + 自发光材质 + 环境光
var _room_lights: Array = []
## 会议室专属灯（不随供电熄灭，但正常供电时收敛功率，避免过曝）
var _keynote: OmniLight3D = null      # [{light, energy, range}]
var _corr_lights: Array = []      # [{light, energy, range}]
var _emit_mats: Array = []        # [StandardMaterial3D] 天花板/墙顶一类常亮材质
var _env: Environment = null
var _ambient_base := LIT_AMBIENT
var _fill: DirectionalLight3D = null
## 天花板补光（朝上），照天花板背光面
var _ceil_fill: DirectionalLight3D = null
## 正常供电基础层补光：提升天花板梁架、墙面法线与船员背光面通透度（断电时仍回落至极弱档）。
var _ceil_fill_base := 0.12
var _fill_base := 0.14
var power_on := true
var _lighting: RoomLighting = RoomLighting.new()
## 天花板整层（舱室顶面 / 走廊顶面 / 灯带）：旁观者飞到天花板以上时整层隐藏，
## 从上面俯视就是一个完整剖面。2.5D 是 2D 俯视，不需要这套，属维度产物。
var _ceil_nodes: Array = []
## 2026-11-11 美术裁定：天花板采用工业材质。
## 顶板材质只建一份；梁/管线/线槽是 Blender 套件，缺失时只保留工业顶板。
var _ceil_deck_mat: StandardMaterial3D = null
var _ceil_room_mats: Dictionary = {}   # rid -> StandardMaterial3D 分舱千问顶板
var _ceil_kit: Dictionary = {}


func build() -> void:
	data = _load_map()
	if data.is_empty():
		push_error("map.json 加载失败")
		return
	space = SpaceData.load_data()
	if space.is_empty():
		push_error("space.json 缺失：断电与门的口径会退回默认值")
	_load_floor_spec()
	_load_ceil_kit()
	_build_rooms()
	_build_corridors()
	_build_walls()
	ArchTrim.build(self, data)
	_covers.build_covers(self, data, _cull_enabled)
	_covers.build_wall_decor_v2(self, data)
	_covers.build_device_pedestals(self, data)
	_build_lights()
	_build_corridor_lamps()
	_build_environment()


## 供电三态（2.5D refreshLight）：0 常态（只亮亮舱）· 1 电路修好（全舱全亮）· 2 拉闸（只剩会议室灯）。
## 舱灯、走廊顶灯、常亮材质、环境光、补光一起切。
func set_light_state(st: int) -> void:
	power_on = st != 2
	_lighting.set_light_state(st)
	for rec2: Dictionary in _corr_lights:
		(rec2["light"] as OmniLight3D).visible = st != 2
	var on: bool = st != 2
	for mat: StandardMaterial3D in _emit_mats:
		mat.emission_energy_multiplier = float(mat.get_meta("base_emit")) if on else 0.05
	if _env != null:
		_env.ambient_light_energy = _ambient_base if on else BLACKOUT_AMBIENT
	## 补光必须一起切：它是预演期为"别让画面全黑"加的 DirectionalLight，
	## 2.5D 没有对应物。不切的话拉闸后仍然看得清整间房，熄灯等于没做。
	## 会议室专属灯永不熄灭（R5.4「会议室除外」），但正常供电时收敛到 5，
	## 否则叠加在本就明亮的场景上会过曝（实测亮像素占比 1.3% → 7.4%）；
	## 断电档也不宜高于正常档，否则会出现「黑天比亮天更亮」的怪相（实测 22.9 vs 18.1）。
	if _keynote != null:
		_keynote.light_energy = 2.2 if st == 2 else 1.8
	if _fill != null:
		_fill.light_energy = _fill_base if on else 0.02
	if _ceil_fill != null:
		_ceil_fill.light_energy = _ceil_fill_base if on else 0.01


## 兼容旧调用（布尔）：true = 常态，false = 断电。
func set_power(on: bool) -> void:
	set_light_state(0 if on else 2)


## 旁观者俯视透视：天花板整层（含灯带）显隐。
## 用户 2026-11-10：旁观者向上穿时，要能从上面看到完整的剖面；
## 上层/下层只是"贴板"，作用是不让人掉进虚空，不是封死的盒子。
func set_ceiling_visible(v: bool) -> void:
	## _ceil_nodes 里既有顶板 MeshInstance3D，也有梁/管/线槽 GLB 实例化的 Node3D；
	## 迭代变量写成 MeshInstance3D 会在走到套件节点时报类型断言错，整层显隐半途而废。
	for node: Node3D in _ceil_nodes:
		if is_instance_valid(node):
			node.visible = v


func ceiling_height() -> float:
	return CEILING_Y


func _load_map() -> Dictionary:
	return _load_json_dict(MAP_PATH)


## 地板口径单一真源（见文件头注释）。缺文件时退回旧的全局尺度，
## 不能因为 JSON 缺失就让地板变成另一种样子。
func _load_floor_spec() -> void:
	floor_spec = load_floor_spec()
	if floor_spec.is_empty():
		push_error("floor_spec.json 缺失：地板退回旧口径（与底图不一致）")


## 工业天花板套件：梁 / 管线 / 线槽。三件都是 3m 段，原点在底/长度中心。
func _load_ceil_kit() -> void:
	for name in ["ceiling_beam", "ceiling_pipe", "ceiling_tray"]:
		var path := "res://assets/models/%s.glb" % name
		if ResourceLoader.exists(path):
			_ceil_kit[name] = load(path)


## 工业顶板材质组装：冲压钢板 albedo + normal + rough，低强度自发光只为暗舱可读。
## albedo_color：分舱千问图的亮度在派生脚本里已调到目标档（power/engine 为
## 默认拉闸亮度），只乘近白曝光；共享 ceiling-deck 保留旧乘色（回退口径不变）。
func _build_ceil_deck_mat(albedo_path: String, tint: Color) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = tint
	## 公开依据：Godot 官方 standard_material_3d —— Metallic 越高，漫射 / 环境光影响越小，
	## 表面靠反射周围环境取亮；本项目 WorldEnvironment 是 BG_COLOR 纯色、无 sky / ReflectionProbe，
	## 金属面没有可反射的环境，0.42 会把顶板压成死黑（2026-11-12 ceil-bridge 实测）。
	## 项目 ART_DIRECTION §1.1 亦要求「金属度只给真正的金属件」：顶板是涂漆压型钢，
	## 漆面属电介质，故降到 0.10；裸金属件（梁 / 管线）仍走各自 glb 材质，不受此改。
	mat.metallic = 0.10
	mat.roughness = 0.62
	if ResourceLoader.exists(albedo_path):
		mat.albedo_texture = load(albedo_path)
	var normal := albedo_path.replace(".png", "-normal.png")
	if ResourceLoader.exists(normal):
		mat.normal_enabled = true
		mat.normal_texture = load(normal)
		mat.normal_scale = 0.6
	var rough := albedo_path.replace(".png", "-rough.png")
	if ResourceLoader.exists(rough):
		mat.roughness_texture = load(rough)
		mat.roughness_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_RED
		mat.roughness = 1.0
	mat.emission_enabled = true
	mat.emission = Color(0.05, 0.06, 0.08)
	mat.emission_energy_multiplier = 0.35
	_register_emit(mat, 0.35)
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	## 公开依据（社区已验证实践，见 docs/ASSET_GOVERNANCE.md §14 登记表）：
	## 「For a plate seen from behind, set Cull Mode to Disabled」——
	## _add_polygon_surface 只把法线设成 DOWN，三角形绕序仍是地板那套（从 +Y 看为正面），
	## 仰视时顶板是背面，默认背面剔除会把整片剔掉，露出 BG_COLOR 的纯黑背景。
	## 这就是贴图/补光/金属度都调过仍读不到纹理的根因；顶板是非交互薄面，双面渲染无副作用。
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	return mat


## 顶板材质入口：rid 有分舱千问贴图（res://assets/textures/qwen/<rid>/ceiling.png）
## 就用分舱图，缺图回退共享 ceiling-deck（行为等价保险）；走廊 rid 为空走共享。
func _ceiling_material(rid: String = "") -> StandardMaterial3D:
	if rid != "" and _ceil_room_mats.has(rid):
		return _ceil_room_mats[rid]
	if rid != "":
		var path := "res://assets/textures/qwen/%s/ceiling.png" % rid
		if ResourceLoader.exists(path):
			var mat := _build_ceil_deck_mat(path, Color(0.94, 0.95, 0.97))
			_ceil_room_mats[rid] = mat
			return mat
	if _ceil_deck_mat != null:
		return _ceil_deck_mat
	_ceil_deck_mat = _build_ceil_deck_mat("res://assets/textures/ceiling-deck.png", Color(0.76, 0.80, 0.86))
	return _ceil_deck_mat


func _place_kit(name: String, pos: Vector3, along_x: bool, total_len: float) -> void:
	var packed: PackedScene = _ceil_kit.get(name)
	if packed == null or total_len <= 0.1:
		return
	## 按 3m~4m 整数段分段摆放 3m 套件，避免长跨度直接拉伸（单段 scale.x 控制在 0.8~1.35）
	var segs := maxi(1, roundi(total_len / 3.2))
	var len_scale := clampf((total_len / float(segs)) / 3.0, 0.8, 1.35)
	var axis := Vector3(1.0, 0.0, 0.0) if along_x else Vector3(0.0, 0.0, 1.0)
	for i in segs:
		var offset := ((float(i) + 0.5) / float(segs) - 0.5) * total_len
		var node := packed.instantiate() as Node3D
		node.position = pos + axis * offset
		node.rotation.y = 0.0 if along_x else PI * 0.5
		node.scale = Vector3(len_scale, 1.0, 1.0)
		add_child(node)
		_ceil_nodes.append(node)


## 一个舱的工业天花板：主梁 3m 一档、次梁 6m 一档、2 条管线 + 1 条线槽。
## 只用 room.rect 的世界尺度，不新增碰撞，也不改任何玩法面。
func _add_ceiling_kit(room: Dictionary) -> void:
	if _ceil_kit.is_empty():
		return
	var rect: Array = room.get("rect", [])
	if rect.size() < 4:
		return
	var x0 := float(rect[0])
	var z0 := float(rect[1])
	var w := float(rect[2])
	var d := float(rect[3])
	if w < 2.5 or d < 2.5:
		return
	var long_x := w >= d
	var length := w if long_x else d
	var span := d if long_x else w
	var beam_y := CEILING_Y - 0.18
	var n_main := maxi(1, int(floor(span / 3.0)))
	for i in n_main:
		var off := (float(i) + 0.5) * span / float(n_main)
		var pos := Vector3(x0 + w * 0.5, beam_y, z0 + off) if long_x else Vector3(x0 + off, beam_y, z0 + d * 0.5)
		_place_kit("ceiling_beam", pos, long_x, length)
	var n_cross := maxi(1, int(floor(length / 6.0)))
	for i in n_cross:
		var off := (float(i) + 0.5) * length / float(n_cross)
		var pos := Vector3(x0 + off, beam_y, z0 + d * 0.5) if long_x else Vector3(x0 + w * 0.5, beam_y, z0 + off)
		_place_kit("ceiling_beam", pos, not long_x, span)
	var pipe_y := CEILING_Y - 0.27
	for frac in [0.30, 0.45]:
		var off := span * float(frac)
		var pos := Vector3(x0 + w * 0.5, pipe_y, z0 + off) if long_x else Vector3(x0 + off, pipe_y, z0 + d * 0.5)
		_place_kit("ceiling_pipe", pos, long_x, length)
	var tray_off := span * 0.70
	var tray_pos := Vector3(x0 + w * 0.5, CEILING_Y - 0.26, z0 + tray_off) if long_x else Vector3(x0 + tray_off, CEILING_Y - 0.26, z0 + d * 0.5)
	_place_kit("ceiling_tray", tray_pos, long_x, length)


## floor_spec 的 tint 是底图用的 MULTIPLY 染色（可 >1 表示提亮）。
## 没有 tint 时用白色（原样），不再用统一灰蓝 —— 那正是「地板看起来被换过」的另一半原因。
func _spec_tint(spec: Dictionary) -> Color:
	var t: Variant = spec.get("tint", null)
	if t is Array and (t as Array).size() >= 3:
		var a: Array = t
		return Color(float(a[0]), float(a[1]), float(a[2]))
	return Color(1, 1, 1)


func _build_rooms() -> void:
	for room: Dictionary in data.get("rooms", []):
		var rid := String(room.get("id", ""))
		var poly: Array = room.get("poly", [])
		if poly.size() < 3:
			continue
		var fs: Dictionary = floor_spec.get("rooms", {}).get(rid, {})
		if fs.is_empty():
			push_error("floor_spec 缺舱室 %s" % rid)
		var tex := String(fs.get("tex", "floor-steel.png")).replace(".png", "")
		var ftint := _spec_tint(fs)
		var floor_mat := _material(tex, ftint)
		floor_mat.metallic = float(fs.get("metallic", 0.22))
		floor_mat.roughness = float(fs.get("roughness", 0.62))
		ArtStyle.apply_floor_pbr(floor_mat, tex)
		## 底图用 Object 坐标 + Mapping Scale（贴图每 N 米重复一次）。
		## 3D 侧等价做法：UV = 世界坐标 / repeat_m。
		var repeat_m := float(fs.get("repeat_m", 4.0))
		## 天花板：2026-11-07 换成 panel-white（原 panel-metal 平均亮度只有 53/255，
		## 拍出来整片发闷）。天花板是**非交互面**，用贴图提质是性价比最高的一处。
		## 不用 triplanar —— triplanar 的 uv1_scale=0.35 会把贴图放到 2.9m 一循环，
		## 加上朝下的法线选不到 Y 轴投影，结果就是一片纯色。改用平面 UV + 真实尺度。
		## 2026-11-11：工业顶板（冲压钢板 + 法线/粗糙度），梁/管线/线槽在下面单独挂套件。
		## 2026-11-12：分舱千问顶板（用户裁定十舱各一张；power/engine 按默认拉闸
		## 亮度调色，灯光口径不动），缺图回退共享 ceiling-deck。
		var ceil_mat := _ceiling_material(rid)
		_add_polygon_surface(poly, 0.02, Vector3.UP, floor_mat, repeat_m)
		_add_polygon_surface(poly, CEILING_Y, Vector3.DOWN, ceil_mat, CEIL_TILE_M)
		## 天花板灯带：2026-11-07。房间顶灯在 2.6m、天花板在 3.2m，
		## 灯只照亮天花板背面 —— 仰视时天花板是一片死黑。
		## 加一圈贴墙的发光灯带（沿房间边界内侧），既是照明也是视觉引导。
		_add_ceiling_strip(room)
		_add_ceiling_kit(room)
		## 墙顶边框：2.5D 里房间身份主要靠这条连续色带传达（12° 俯角下墙面只剩顶面一条框）。
		## 颜色与强度全部来自 rooms[].theme（烘焙端 ROOM_THEME 原样导出）。
		_add_wall_top(room)


## 天花板灯带：沿房间 poly 的每条边，在靠内侧 0.35m 处贴一条发光板。
## 贴边而不是贴中间：真实舱室的光带在墙顶接缝处，也顺便给天花板边缘打出层次。
## 断电时跟着 set_power 一起暗（登记进 _emit_mats）。
func _add_ceiling_strip(room: Dictionary) -> void:
	var poly: Array = room.get("poly", [])
	if poly.size() < 3:
		return
	var theme: Variant = room.get("theme", null)
	var glow_col := Color(0.55, 0.78, 0.95)
	if theme is Dictionary:
		glow_col = _rgb((theme as Dictionary).get("glow", [0.5, 0.72, 0.9]))
	var mat := StandardMaterial3D.new()
	mat.albedo_color = glow_col
	mat.emission_enabled = true
	mat.emission = glow_col
	## 公开依据：Godot 官方 standard_material_3d —— Emission 直接叠加到最终图像，
	## 不受场景光照影响；取值过高在 Filmic 色调映射下会过曝成亮条，且不会照亮房间
	## （照亮房间要靠真实光源或 GI，见 _build_environment 的 ceil_fill）。
	mat.emission_energy_multiplier = 0.72
	mat.roughness = 0.4
	_register_emit(mat, 0.72)
	## 贴边收缩：把每条边的中点往房间中心收 0.45m，灯带就贴在墙顶接缝内侧
	var c := Vector2.ZERO
	for p: Array in poly:
		c += Vector2(float(p[0]), float(p[1]))
	c /= float(poly.size())
	for i in poly.size():
		var a: Array = poly[i]
		var b: Array = poly[(i + 1) % poly.size()]
		var va := Vector2(float(a[0]), float(a[1]))
		var vb := Vector2(float(b[0]), float(b[1]))
		var length := va.distance_to(vb)
		if length < 1.0:
			continue
		var mid := (va + vb) * 0.5
		var inward := (c - mid).normalized()
		if inward.length_squared() < 0.001:
			continue
		mid += inward * 0.45
		var box := BoxMesh.new()
		box.size = Vector3(length * 0.86, 0.06, 0.22)
		var mi := MeshInstance3D.new()
		mi.mesh = box
		mi.position = Vector3(mid.x, CEILING_Y - 0.06, mid.y)
		mi.rotation.y = -atan2(vb.y - va.y, vb.x - va.x)
		mi.material_override = mat
		add_child(mi)
		_ceil_nodes.append(mi)


## 沿房间 poly 画一圈发光墙顶线。断电时它是照明件，跟着 set_power 一起暗下去。
func _add_wall_top(room: Dictionary) -> void:
	var theme: Variant = room.get("theme", null)
	if not (theme is Dictionary):
		return
	var t: Dictionary = theme
	var poly: Array = room.get("poly", [])
	if poly.size() < 3:
		return
	var top_col := _rgb(t.get("top", [0.3, 0.35, 0.42]))
	var glow_col := _rgb(t.get("glow", [0.1, 0.14, 0.18]))
	var mat := StandardMaterial3D.new()
	mat.albedo_color = top_col
	mat.metallic = 0.65
	mat.roughness = 0.32
	mat.emission_enabled = true
	mat.emission = glow_col
	mat.emission_energy_multiplier = float(t.get("gs", 0.35))
	_register_emit(mat, float(t.get("gs", 0.35)))
	for i in poly.size():
		var a: Array = poly[i]
		var b: Array = poly[(i + 1) % poly.size()]
		var va := Vector2(float(a[0]), float(a[1]))
		var vb := Vector2(float(b[0]), float(b[1]))
		var length := va.distance_to(vb)
		if length < 0.2:
			continue
		var mid := (va + vb) * 0.5
		var box := BoxMesh.new()
		box.size = Vector3(length, 0.16, 0.30)
		var mi := MeshInstance3D.new()
		mi.mesh = box
		mi.position = Vector3(mid.x, WALL_HEIGHT - 0.10, mid.y)
		mi.rotation.y = -atan2(vb.y - va.y, vb.x - va.x)
		mi.material_override = mat
		add_child(mi)


func _rgb(raw: Variant) -> Color:
	if raw is Array and (raw as Array).size() >= 3:
		var a := raw as Array
		return Color(float(a[0]), float(a[1]), float(a[2]))
	return Color(0.6, 0.65, 0.72)



func _build_corridors() -> void:
	var width := float(data.get("scale", {}).get("corridor_w", 3.2))
	var cs: Dictionary = floor_spec.get("corridor", {})
	var ctex := String(cs.get("tex", "floor-grate.png")).replace(".png", "")
	var floor_mat := _material(ctex, _spec_tint(cs))
	floor_mat.metallic = float(cs.get("metallic", 0.42))
	floor_mat.roughness = float(cs.get("roughness", 0.5))
	ArtStyle.apply_floor_pbr(floor_mat, ctex)
	if float(cs.get("emit", 0.0)) > 0.0:
		floor_mat.emission_enabled = true
		floor_mat.emission = Color(0.16, 0.22, 0.3)
		floor_mat.emission_energy_multiplier = float(cs["emit"])
	var corr_repeat := float(cs.get("repeat_m", 2.6))
	var ceil_mat := _ceiling_material()
	# 走廊顶部细灯带材质（柔和发光并随断电统一熄灭）
	var strip_mat := StandardMaterial3D.new()
	strip_mat.albedo_color = Color(0.66, 0.82, 0.96)
	strip_mat.emission_enabled = true
	strip_mat.emission = Color(0.66, 0.82, 0.96)
	strip_mat.emission_energy_multiplier = 0.65
	strip_mat.roughness = 0.4
	_register_emit(strip_mat, 0.65)
	for corridor: Dictionary in data.get("corridors", []):
		var pts: Array = corridor.get("pts", [])
		for i in range(pts.size() - 1):
			var a := Vector2(float(pts[i][0]), float(pts[i][1]))
			var b := Vector2(float(pts[i + 1][0]), float(pts[i + 1][1]))
			_add_corridor_quad(a, b, width, 0.02, Vector3.UP, floor_mat, corr_repeat)
			_add_corridor_quad(a, b, width, CEILING_Y, Vector3.DOWN, ceil_mat, CEIL_TILE_M)
			var seg_len := a.distance_to(b)
			if seg_len >= 0.4:
				var box := BoxMesh.new()
				box.size = Vector3(seg_len, 0.05, 0.16)
				var mi := MeshInstance3D.new()
				mi.mesh = box
				mi.position = Vector3((a.x + b.x) * 0.5, CEILING_Y - 0.05, (a.y + b.y) * 0.5)
				mi.rotation.y = -atan2(b.y - a.y, b.x - a.x)
				mi.material_override = strip_mat
				add_child(mi)
				_ceil_nodes.append(mi)


func _build_walls() -> void:
	## 墙面 tint 用 rooms[].theme.wall（烘焙端 ROOM_THEME），房间之间的相对色差是真源给的；
	## WALL_TINT_BASE 只是 3D 实时曝光对 Cycles 的全局补偿，不参与房间区分。
	for segment: Array in data.get("walls", []):
		if segment.size() < 2:
			continue
		var a := Vector2(float(segment[0][0]), float(segment[0][1]))
		var b := Vector2(float(segment[1][0]), float(segment[1][1]))
		var length := a.distance_to(b)
		if length < 0.15:
			continue
		var mid := (a + b) * 0.5
		var angle := -atan2(b.y - a.y, b.x - a.x)
		var normal := Vector2(-(b.y - a.y), (b.x - a.x)).normalized()
		var room := _wall_room(mid, normal)
		var rid := String(room.get("id", ""))
		var tint := WALL_TINT_BASE
		var theme: Variant = room.get("theme", null)
		if theme is Dictionary:
			tint = _rgb((theme as Dictionary).get("wall", [1, 1, 1])) * WALL_TINT_BASE
		var wall_mat := _wall_material(rid, tint)
		_add_box(
			Vector3(mid.x, WALL_HEIGHT * 0.5, mid.y),
			Vector3(length, WALL_HEIGHT, 0.22),
			angle, wall_mat, true
		)


## 舱室墙面材质：有烘焙好的分张贴图就用它（身份色在图里，只乘全局曝光），
## 没有就退回共享 wall-panel + theme.wall 染色。
func _wall_material(rid: String, fallback_tint: Color) -> StandardMaterial3D:
	if rid != "" and _cabin_mats.has(rid):
		return _cabin_mats[rid]
	var path := CABIN_TEX_DIR + rid + ".png"
	if CABIN_QWEN_ROOMS.has(rid):
		path = "res://assets/textures/qwen/%s/skin1.png" % rid
	if rid == "" or not ResourceLoader.exists(path):
		return _material("wall-panel", fallback_tint, true)
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = load(path) as Texture2D
	# 对 Qwen 墙面温和融合 35% 舱室色温，保留分区辨识度
	mat.albedo_color = WALL_TINT_BASE.lerp(fallback_tint, 0.35)
	ArtStyle.apply_wall_pbr(mat, path, CABIN_TILE_M)
	_cabin_mats[rid] = mat
	return mat


## 这段墙属于哪间房：把线段中点沿法线两侧各探 0.5 米，落在谁的 poly 里就取谁的主题色。
func _wall_room(mid: Vector2, normal: Vector2) -> Dictionary:
	for room: Dictionary in data.get("rooms", []):
		var poly := PackedVector2Array()
		for p: Array in room.get("poly", []):
			poly.append(Vector2(float(p[0]), float(p[1])))
		if poly.size() < 3:
			continue
		if Geometry2D.is_point_in_polygon(mid + normal * 0.5, poly):
			return room
		if Geometry2D.is_point_in_polygon(mid - normal * 0.5, poly):
			return room
	return {}



## 铁板隐藏读数：由 CoverBuilder 统计。
func sight_shell_stats() -> Dictionary:
	return _covers.sight_shell_stats()


func _cover_mat(pbr_key: String) -> StandardMaterial3D:
	return _covers.cover_mat(pbr_key)


func _cover_mat_count() -> int:
	return _covers.mat_count()


func _register_room_node(rid: String, node: Node3D) -> void:
	if not _room_nodes.has(rid):
		_room_nodes[rid] = []
	_room_nodes[rid].append(node)


func _point_in_poly(x: float, z: float, poly: Array) -> bool:
	var inside := false
	var j := poly.size() - 1
	for i in poly.size():
		var a: Array = poly[i]
		var b: Array = poly[j]
		if ((a[1] > z) != (b[1] > z)) and x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]:
			inside = not inside
		j = i
	return inside


func _poly_center(poly: Array) -> Vector2:
	if poly.is_empty():
		return Vector2.ZERO
	var sx := 0.0
	var sy := 0.0
	for p in poly:
		sx += float(p[0])
		sy += float(p[1])
	return Vector2(sx / poly.size(), sy / poly.size())


## 正常游玩时每 0.25 秒更新一次房间可见性；自测 / 截图参数下关闭，避免验收读数缺几何。
func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	_cull_enabled = true
	for a in args:
		var s := String(a)
		if s.begins_with("--") and s != "--bench":
			_cull_enabled = false
			break


func _process(delta: float) -> void:
	_lighting.tick_emergency(delta, power_on)
	if not _cull_enabled:
		return
	_cull_tick += delta
	if _cull_tick < 0.25:
		return
	_cull_tick = 0.0
	var host := get_parent()
	if host == null:
		return
	var pl: Variant = host.get("player")
	if pl == null or not (pl is Node3D):
		return
	var pos: Vector3 = (pl as Node3D).global_position
	_lighting.update_shadows(pos)
	var active := {}
	for r: Dictionary in data.get("rooms", []):
		var rid := String(r.get("id", ""))
		var poly: Array = r.get("poly", [])
		var c := _poly_center(poly)
		if _point_in_poly(pos.x, pos.z, poly) or c.distance_to(Vector2(pos.x, pos.z)) < ROOM_KEEP_RADIUS:
			active[rid] = true
	for rid in _room_nodes.keys():
		var on: bool = active.has(rid)
		for n in _room_nodes[rid]:
			if n is Node3D:
				(n as Node3D).visible = on
	var p2 := Vector2(pos.x, pos.z)
	for rec2: Dictionary in _corr_lights:
		var cl := rec2["light"] as OmniLight3D
		if cl != null:
			cl.visible = power_on and p2.distance_to(Vector2(cl.position.x, cl.position.z)) < 26.0


func _build_lights() -> void:
	var res := _lighting.build_rooms(self, data)
	_room_lights = res["room_lights"]
	_keynote = res["keynote"]


## 走廊顶灯位来自真源：SKT2Space.corridorLampPos（每条走廊两盏，0.28 / 0.72 分位），
## 由 3d/tools/export-space.cjs 导进 space.json。2.5D 注释写明断电时整条走廊全熄，
## 所以这 22 盏灯必须跟着供电状态切，否则"拉闸"在 3D 里根本没有画面变化。
func _build_corridor_lamps() -> void:
	if space.is_empty():
		return
	var lamps: Array = SpaceData.section(space, "lamps").get("corridor", [])
	for corridor: Variant in lamps:
		for lamp: Dictionary in (corridor as Array):
			var light := OmniLight3D.new()
			light.position = Vector3(float(lamp.get("x", 0)), 2.75, float(lamp.get("y", 0)))
			light.omni_range = CORR_LAMP_RANGE
			light.light_energy = 1.25
			light.omni_attenuation = 1.25
			light.light_color = Color(0.86, 0.92, 1.0)
			light.shadow_enabled = false
			light.distance_fade_enabled = true
			light.distance_fade_begin = 16.0
			light.distance_fade_length = 6.0
			add_child(light)
			_corr_lights.append({"light": light})


func _register_emit(mat: StandardMaterial3D, base: float) -> void:
	if not mat.has_meta("base_emit"):
		mat.set_meta("base_emit", base)
		_emit_mats.append(mat)


## 断电自测要读的读数（不让测试脚本伸手进私有数组）
func light_stats() -> Dictionary:
	var rooms_on := 0
	for rec: Dictionary in _room_lights:
		if (rec["light"] as OmniLight3D).visible:
			rooms_on += 1
	var corr_on := 0
	for rec: Dictionary in _corr_lights:
		if (rec["light"] as OmniLight3D).visible:
			corr_on += 1
	return {
		"rooms": _room_lights.size(), "rooms_on": rooms_on,
		"corridor": _corr_lights.size(), "corridor_on": corr_on,
		"ambient": _env.ambient_light_energy if _env != null else -1.0,
		"fill": _fill.light_energy if _fill != null else -1.0,
	}


func _build_environment() -> void:
	var we := WorldEnvironment.new()
	var env := Environment.new()
	ArtStyle.apply_environment(env)
	env.ambient_light_energy = LIT_AMBIENT
	_ambient_base = env.ambient_light_energy
	_env = env
	we.environment = env
	add_child(we)

	## 分层照明「基础层」：微弱冷色全局补光，避免暗舱出现绝对死角。
	## 公开依据：Godot 官方 3D lights and shadows（环境光/方向光职责）+ 社区分层照明实践。
	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-55.0, -35.0, 0.0)
	fill.light_energy = 0.14
	fill.light_color = Color(0.55, 0.66, 0.85)
	fill.shadow_enabled = false
	add_child(fill)
	_fill = fill
	_fill_base = fill.light_energy

	## 全船单静态反射探针（UPDATE_ONCE）：相比 10 舱独立探针减少 90% 立方体贴图烘焙与 GL Compatibility 切状态卡顿。
	var probe := ReflectionProbe.new()
	probe.size = Vector3(110.0, 6.0, 90.0)
	probe.position = Vector3(45.0, 1.8, 35.0)
	probe.update_mode = ReflectionProbe.UPDATE_ONCE
	probe.ambient_mode = ReflectionProbe.AMBIENT_DISABLED
	probe.intensity = 0.65
	add_child(probe)

	## 天花板背光补光（Godot GL Compatibility 下自发光不照亮周围，需弱朝上平行光）。
	var ceil_fill := DirectionalLight3D.new()
	ceil_fill.rotation_degrees = Vector3(58.0, 20.0, 0.0)
	ceil_fill.light_energy = 0.12
	ceil_fill.light_color = Color(0.62, 0.70, 0.82)
	ceil_fill.shadow_enabled = false
	add_child(ceil_fill)
	_ceil_fill = ceil_fill
	_ceil_fill_base = ceil_fill.light_energy


func _commit_surface(st: SurfaceTool, y: float, mat: Material) -> void:
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	mi.material_override = mat
	add_child(mi)
	if y >= CEILING_Y - 0.01:
		_ceil_nodes.append(mi)


func _add_polygon_surface(poly: Array, y: float, normal: Vector3, mat: Material,
		uv_scale: float = UV_WORLD_SCALE) -> void:
	var points := PackedVector2Array()
	for point: Array in poly:
		points.append(Vector2(float(point[0]), float(point[1])))
	var indices := Geometry2D.triangulate_polygon(points)
	if indices.size() < 3:
		return
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for index: int in indices:
		var p := points[index]
		st.set_normal(normal)
		st.set_uv(Vector2(p.x / uv_scale, p.y / uv_scale))
		st.add_vertex(Vector3(p.x, y, p.y))
	_commit_surface(st, y, mat)


func _add_corridor_quad(a: Vector2, b: Vector2, width: float, y: float,
		normal: Vector3, mat: Material, uv_scale: float = UV_WORLD_SCALE) -> void:
	var direction := (b - a).normalized()
	if direction.length_squared() < 0.0001:
		return
	var perp := Vector2(-direction.y, direction.x) * (width * 0.5)
	var corners := [a - perp, a + perp, b + perp, b - perp]
	var order := [0, 1, 2, 0, 2, 3]
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for index: int in order:
		var p: Vector2 = corners[index]
		st.set_normal(normal)
		st.set_uv(Vector2(p.x / uv_scale, p.y / uv_scale))
		st.add_vertex(Vector3(p.x, y, p.y))
	_commit_surface(st, y, mat)


func _add_box(center: Vector3, size: Vector3, rotation_y: float,
		mat: Material, collide: bool) -> void:
	var box := BoxMesh.new()
	box.size = size
	var mi := MeshInstance3D.new()
	mi.mesh = box
	mi.material_override = mat
	mi.position = center
	mi.rotation.y = rotation_y
	add_child(mi)

	if not collide:
		return
	var body := StaticBody3D.new()
	body.position = center
	body.rotation.y = rotation_y
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collision.shape = shape
	body.add_child(collision)
	add_child(body)


func _material(texture_name: String, tint: Color, triplanar: bool = false) -> StandardMaterial3D:
	var key := "%s|%s|%s" % [texture_name, tint.to_html(), str(triplanar)]
	if _materials.has(key):
		return _materials[key]
	var mat := StandardMaterial3D.new()
	if texture_name != "":
		var path := "res://assets/textures/%s.png" % texture_name
		if ResourceLoader.exists(path):
			mat.albedo_texture = load(path)
			ArtStyle.apply_shared_pbr(mat, path, 0.70, true)
	mat.albedo_color = tint
	if mat.roughness_texture == null:
		mat.roughness = 0.85
	else:
		mat.roughness = 1.0
	mat.metallic = 0.08
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.uv1_triplanar = triplanar
	if triplanar:
		mat.uv1_scale = Vector3(0.35, 0.35, 0.35)
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	_materials[key] = mat
	return mat


