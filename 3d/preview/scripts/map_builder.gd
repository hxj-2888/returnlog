extends Node3D

## 把 2.5D 导出的 map.json 升维成可走场景。
## 复用边界：房间 poly / 走廊 pts / 墙体线段 / 掩体矩形 / 现有表面贴图。
## 不把 2.5D 的 DOM、迷雾、点击寻路带进来；碰撞与移动全部是 3D 的。

const SpaceData := preload("res://scripts/space_data.gd")
const MAP_PATH := "res://data/map_v2.json"
const WALL_HEIGHT := 3.0
const CEILING_Y := 3.2
## 非地板表面的世界尺度（墙、装饰板）。地板走 floor_spec 的 per-room repeat_m。
const UV_WORLD_SCALE := 4.0
## 天花板贴图重复边长（米）。天花板是舱室面积最大的连续面，贴图尺度太大会看不出纹理。
const CEIL_TILE_M := 2.4

## 走廊顶灯的照度半径：这是 3D 表现参数，2.5D 没有对应量（2.5D 的走廊"亮"是判定 + 遮罩），
## 所以不进 space.json，但必须和走廊宽度成比例，不能目测乱填。
const CORR_LAMP_RANGE := 8.0
## 断电后仍保留的极弱底光（不是"能看见人"，只是不让玩家失去地图结构）。
const BLACKOUT_AMBIENT := 0.055
const LIT_AMBIENT := 0.55
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

## 2026-11-07 高分辨率外饰 + 可见性优化（见 docs/调研报告_3D帧率优化_20261107.md）。
## 外饰贴图只存一份 1024²，61 件 GLB 共享同一批 Material / Texture2D；
## GLB 内嵌的 256² 图退为远处 / 静默档（贴图流送），不再靠降画质换帧率。
const COVER_SKIN_DIR := "res://assets/textures/cover/"
## 距离剔除：超过该距离不提交渲染；margin 提供迟滞，避免边界反复跳变。
const CULL_DIST := 32.0
const CULL_MARGIN := 4.0
## 房间级静默加载：玩家所在房间 + 附近房间保留，其余 visible=false（节点常驻内存，不卸载）。
const ROOM_KEEP_RADIUS := 26.0
## 与 3d/tools/covers_lib.py 的 PBR_MAP 对齐；glow/mark/red/water 是各舱主题纯色，不注入。
const COVER_ROLE_PBR := {
	"metal": "metal_panel", "dark": "metal_panel",
	"steel": "brushed_steel", "shell": "shell_white", "white": "shell_white",
	"glass": "glass", "fabric": "fabric", "rubber": "rubber",
	"wood": "wood", "card": "wood", "bark": "wood", "soil": "rubber",
	"leaf": "leaf", "leaf2": "leaf", "hazard": "hazard", "screen": "screen",
}
var _cover_mats: Dictionary = {}
var _room_nodes: Dictionary = {}
var _cull_enabled := false
var _cull_tick := 0.0


## 自测入口：读同一份 floor_spec（不缓存，保证测的是当前文件）。
static func load_floor_spec() -> Dictionary:
	var fh := FileAccess.open(FLOOR_SPEC_PATH, FileAccess.READ)
	if fh == null:
		return {}
	var parsed: Variant = JSON.parse_string(fh.get_as_text())
	if parsed is Dictionary:
		return parsed
	return {}


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

## 掩体名义高度（米）。**上游真源是 `tools/blender-ship.py` 的 `furniture()` 各分支顶面 z1**，
## 键必须与 `js/data/map.js` 的 `cover[].kind` 一一对应（当前 24 种 / 59 件）。
## 烘焙端每件还乘 `hz = 0.90~1.10` 的实例变体，这里是 hs=1 的名义值。
## 改底图家具高度后同步这张表；`scene_extras.gd` 直接引用本表，不得再抄第二份。
const COVER_HEIGHT := {
	# 舱室家具
	"table": 0.82,          # 圆桌 0.85（含全息芯），散件 0.72+0.10
	"servicecounter": 1.24, # 台面 0.93 + 收银屏；挡板玻璃 1.46 不算主体
	"console": 0.86,
	"chair": 0.94,          # 靠背顶
	"sofa": 0.86,
	"medbed": 0.74,         # 床垫 0.62 / 枕头 0.74；输液杆 1.52 是细杆不抬主体
	"fridge": 1.46,
	"shelftall": 2.05,
	"gunrack": 1.46,
	"pallet": 0.85,         # 托盘 0.09 + 2~4 层货堆（n=3 时 0.85）
	"crate": 0.84,
	# 电气 / 机械
	"machine": 1.06,
	"switchgear": 1.34,
	"transformer": 1.10,
	"breaker": 1.22,
	"servercab": 1.55,
	"reactor": 1.72,
	"engineblock": 1.24,
	# 显示 / 结构
	"holoscreen": 1.62,
	"screenwall": 1.78,
	"pillar": 1.30,
	# 生态舱
	"tank": 1.95,           # 玻璃段 1.80 + 顶盖 LED 1.95
	"tree": 1.60,
	"pond": 0.10,           # 水面 0.05 / 围边 0.10 —— 不能当墙用
	# === v2 房间专属 kind（由 3d/tools/build-map-v2.cjs 生成）BEGIN ===
	"armory_ammocrate": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"armory_gunrack": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"armory_issuedesk": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"armory_targetlane": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"armory_vise": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"armory_workbench": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"bridge_chair": 1.71,  # GLB 实测（≥1.70 视线遮挡下限）
	"bridge_column": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"bridge_holoscreen": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"bridge_navconsole": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"bridge_recorddesk": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"bridge_sideboard": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"bridge_table": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"cam_archivebox": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"cam_codecrack": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"cam_opsdesk": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"cam_screenwall": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"cam_servercab": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"ecosys_climate": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"ecosys_growrack": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"ecosys_irrigation": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"ecosys_oxygen": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"ecosys_pond": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"ecosys_shrub": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"ecosys_tank": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"ecosys_tree": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"engine_compressor": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"engine_cylinder": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"engine_fusepanel": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"engine_partscart": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"engine_reactor": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"engine_toolbench": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"fun_arcade": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"fun_coffeetable": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"fun_gametable": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"fun_jukebox": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"fun_racer": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"fun_sofa": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"fun_stool": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"med_bed": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"med_medcab": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"med_monitor": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"med_sterilizer": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"med_supplycart": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"med_surgery": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"med_ventilator": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"power_breakerbank": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"power_gauge": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"power_switchgear": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"power_transformer": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"transit_diningtable": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"transit_drinkbar": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"transit_platecart": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"transit_servicecounter": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"transit_trayreturn": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"warehouse_packbench": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"warehouse_pallet": 1.74,  # GLB 实测（≥1.70 视线遮挡下限）
	"warehouse_rack_east": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"warehouse_rack_west": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"warehouse_receiving": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	"warehouse_terminal": 1.70,  # GLB 实测（≥1.70 视线遮挡下限）
	# === v2 房间专属 kind END ===
}

## 墙面贴图按舱室分张：`res://assets/textures/cabin/<room>.png`
## 由 3d/tools/bake-refs.py 从千问参考图烘焙（裁中心去透视 + 四向镜像成无缝）。
## 缺图时回退到原来的共享 wall-panel + theme.wall 染色，不影响出包。
const CABIN_TEX_DIR := "res://assets/textures/cabin/"
## 一张 512 贴图覆盖的墙面尺寸（米）。身份色在图里，这里只管重复密度。
const CABIN_TILE_M := 2.4
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
var _room_lights: Array = []      # [{light, energy, range}]
var _corr_lights: Array = []      # [{light, energy, range}]
var _emit_mats: Array = []        # [StandardMaterial3D] 天花板/墙顶一类常亮材质
var _env: Environment = null
var _ambient_base := LIT_AMBIENT
var _fill: DirectionalLight3D = null
## 天花板补光（朝上），照天花板背光面
var _ceil_fill: DirectionalLight3D = null
var _ceil_fill_base := 0.16
var _fill_base := 0.28
var power_on := true
## 天花板整层（舱室顶面 / 走廊顶面 / 灯带）：旁观者飞到天花板以上时整层隐藏，
## 从上面俯视就是一个完整剖面。2.5D 是 2D 俯视，不需要这套，属维度产物。
var _ceil_nodes: Array = []


func build() -> void:
	data = _load_map()
	if data.is_empty():
		push_error("map.json 加载失败")
		return
	space = SpaceData.load_data()
	if space.is_empty():
		push_error("space.json 缺失：断电与门的口径会退回默认值")
	_load_floor_spec()
	_build_rooms()
	_build_corridors()
	_build_walls()
	_build_cover()
	_build_wall_decor_v2()
	_build_device_pedestals()
	_build_lights()
	_build_corridor_lamps()
	_build_preview_actor()
	_build_environment()


## 供电三态（2.5D refreshLight）：0 常态（只亮亮舱）· 1 电路修好（全舱全亮）· 2 拉闸（只剩会议室灯）。
## 舱灯、走廊顶灯、常亮材质、环境光、补光一起切。
func set_light_state(st: int) -> void:
	power_on = st != 2
	for rec: Dictionary in _room_lights:
		var lit: bool = st == 1 or (st == 0 and bool(rec.get("bright", true)))
		(rec["light"] as OmniLight3D).visible = lit
	for rec2: Dictionary in _corr_lights:
		(rec2["light"] as OmniLight3D).visible = st != 2
	var on: bool = st != 2
	for mat: StandardMaterial3D in _emit_mats:
		mat.emission_energy_multiplier = float(mat.get_meta("base_emit")) if on else 0.05
	if _env != null:
		_env.ambient_light_energy = _ambient_base if on else BLACKOUT_AMBIENT
	## 补光必须一起切：它是预演期为"别让画面全黑"加的 DirectionalLight，
	## 2.5D 没有对应物。不切的话拉闸后仍然看得清整间房，熄灯等于没做。
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
	for mi: MeshInstance3D in _ceil_nodes:
		if is_instance_valid(mi):
			mi.visible = v


func ceiling_height() -> float:
	return CEILING_Y


func _load_map() -> Dictionary:
	var file := FileAccess.open(MAP_PATH, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		return parsed
	return {}


## 地板口径单一真源（见文件头注释）。缺文件时退回旧的全局尺度，
## 不能因为 JSON 缺失就让地板变成另一种样子。
func _load_floor_spec() -> void:
	var file := FileAccess.open(FLOOR_SPEC_PATH, FileAccess.READ)
	if file == null:
		push_error("floor_spec.json 缺失：地板退回旧口径（与底图不一致）")
		return
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		floor_spec = parsed


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
		## 底图用 Object 坐标 + Mapping Scale（贴图每 N 米重复一次）。
		## 3D 侧等价做法：UV = 世界坐标 / repeat_m。
		var repeat_m := float(fs.get("repeat_m", 4.0))
		## 天花板：2026-11-07 换成 panel-white（原 panel-metal 平均亮度只有 53/255，
		## 拍出来整片发闷）。天花板是**非交互面**，用贴图提质是性价比最高的一处。
		## 不用 triplanar —— triplanar 的 uv1_scale=0.35 会把贴图放到 2.9m 一循环，
		## 加上朝下的法线选不到 Y 轴投影，结果就是一片纯色。改用平面 UV + 真实尺度。
		var ceil_mat := _material("panel-white", Color(0.80, 0.84, 0.90), false)
		ceil_mat.emission_enabled = true
		ceil_mat.emission = Color(0.1, 0.12, 0.16)
		ceil_mat.emission_energy_multiplier = 0.8
		_register_emit(ceil_mat, 0.8)
		_add_polygon_surface(poly, 0.02, Vector3.UP, floor_mat, repeat_m)
		_add_polygon_surface(poly, CEILING_Y, Vector3.DOWN, ceil_mat, CEIL_TILE_M)
		## 天花板灯带：2026-11-07。房间顶灯在 2.6m、天花板在 3.2m，
		## 灯只照亮天花板背面 —— 仰视时天花板是一片死黑。
		## 加一圈贴墙的发光灯带（沿房间边界内侧），既是照明也是视觉引导。
		_add_ceiling_strip(room)
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
	mat.emission_energy_multiplier = 1.6
	mat.roughness = 0.4
	_register_emit(mat, 1.6)
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
	if float(cs.get("emit", 0.0)) > 0.0:
		floor_mat.emission_enabled = true
		floor_mat.emission = Color(0.16, 0.22, 0.3)
		floor_mat.emission_energy_multiplier = float(cs["emit"])
	var corr_repeat := float(cs.get("repeat_m", 2.6))
	var ceil_mat := _material("panel-metal", Color(0.62, 0.66, 0.72), false)
	for corridor: Dictionary in data.get("corridors", []):
		var pts: Array = corridor.get("pts", [])
		for i in range(pts.size() - 1):
			var a := Vector2(float(pts[i][0]), float(pts[i][1]))
			var b := Vector2(float(pts[i + 1][0]), float(pts[i + 1][1]))
			_add_corridor_quad(a, b, width, 0.02, Vector3.UP, floor_mat, corr_repeat)
			_add_corridor_quad(a, b, width, CEILING_Y, Vector3.DOWN, ceil_mat, CEIL_TILE_M)


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
	mat.albedo_color = WALL_TINT_BASE
	mat.metallic = 0.5
	mat.roughness = 0.45
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.uv1_triplanar = true
	mat.uv1_scale = Vector3.ONE * (1.0 / CABIN_TILE_M)
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
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



var _cover_models := {}
var _cover_refs := {}
var _sight_shell_hidden := 0


## 铁板（1.70m 补高背板）显示开关。**2026-11-09 用户裁定暂时关掉**：
## 2026-11-07 那批用 `covers_lib.sight_extend()` 给 61 件掩体在占地后缘焊了
## 背板 + 立柱 + 顶梁（GLB 节点 `sight_shell` / `sightglow`），为的是对齐
## 2.5D `geo.js` 的 los()（每件 cover 无条件挡光）。结果画面里所有家具都成了
## 等高铁板，美术上不可接受。
##
## 这一版**不动资产**：GLB、cover_refs.json、COVER_HEIGHT、碰撞盒全部保持原样，
## 只在实例化时把这两类节点隐藏 ⇒ 家具按自己的比例露出来，通行与遮挡判定不变。
## 恢复显示：这里改回 true。彻底不再焊背板：`COVERS_SIGHT_MIN_H=0`（现默认）重跑
## `3d/tools/build-covers-*.py`，再跑 measure-cover-refs.py + sync-cover-height.cjs。
##
## ⚠ 已知代价：关掉后「判定挡、画面不挡」的不一致重新出现（0.95m 的柜子在 LOS 里
## 仍然挡光）。正解是按实际顶面高度做 LOS，那是下一步，不在本批。
const COVER_SIGHT_SHELL := false


## 隐藏实例里的铁板结构，返回隐藏节点数（自测读数用）。
func _hide_sight_shell(n: Node) -> int:
	if COVER_SIGHT_SHELL:
		return 0
	var hidden := 0
	for c in n.get_children():
		var cn := String(c.name)
		if (c is GeometryInstance3D) and (cn == "sight_shell" or cn == "sightglow"):
			(c as GeometryInstance3D).visible = false
			hidden += 1
		hidden += _hide_sight_shell(c)
	return hidden


## 铁板隐藏读数：`sight_shell_stats()["hidden"]` 应为 cover 件数 ×2
## （每件一个 sight_shell + 一条 sightglow）；0 表示开关被打开或资产里没有背板。
func sight_shell_stats() -> Dictionary:
	return {"hidden": _sight_shell_hidden, "show": COVER_SIGHT_SHELL}


## 掩体本体的**建模尺寸**（3d/preview/data/cover_refs.json，由 measure-cover-refs.py 实测）。
## 生态舱那批建的是 1×1×1 的归一化模型，仓库/医疗这批建的是真实尺寸（货架就是 1.4×6.9 米）——
## 两种口径靠这张表统一：Godot 只按「地图尺寸 / 建模尺寸」缩放，高度不会再被压扁。
func _cover_ref(kind: String) -> Vector3:
	if _cover_refs.is_empty():
		var p := "res://data/cover_refs.json"
		if FileAccess.file_exists(p):
			var j: Variant = JSON.parse_string(FileAccess.get_file_as_string(p))
			if j is Dictionary:
				_cover_refs = j
	var r: Variant = _cover_refs.get(kind, null)
	if r is Array and (r as Array).size() >= 3:
		# 表里是 Blender 口径 [宽, 进深, 高]；Godot 的 Y 朝上，所以要换轴
		return Vector3(float(r[0]), float(r[2]), float(r[1]))
	return Vector3.ONE


## 2026-11-06 掩体本体：生态舱 8 类 + 仓库 6 类 + 医疗 7 类。
## 模型口径：底面中心为原点；尺寸见 cover_refs.json。
## 找不到对应 GLB 时静默回退盒体：其余舱室的 40 个 kind 完全不受影响。
func _cover_model(kind: String) -> PackedScene:
	if _cover_models.has(kind):
		return _cover_models[kind] as PackedScene
	var ps: PackedScene = null
	var path := "res://assets/models/%s.glb" % kind
	if ResourceLoader.exists(path):
		ps = load(path) as PackedScene
	_cover_models[kind] = ps
	return ps


## 共享高分辨率外饰：整船只创建 ~10 个 StandardMaterial3D，贴图只加载一次。
func _cover_mat(pbr_key: String) -> StandardMaterial3D:
	if _cover_mats.has(pbr_key):
		return _cover_mats[pbr_key] as StandardMaterial3D
	var m := StandardMaterial3D.new()
	var base := COVER_SKIN_DIR + pbr_key
	if ResourceLoader.exists(base + "_albedo.jpg"):
		m.albedo_texture = load(base + "_albedo.jpg") as Texture2D
	if ResourceLoader.exists(base + "_normal.jpg"):
		m.normal_enabled = true
		m.normal_texture = load(base + "_normal.jpg") as Texture2D
		m.normal_scale = 0.65
	m.roughness = 0.62
	m.metallic = 0.22
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	_cover_mats[pbr_key] = m
	return m


func _cover_mat_count() -> int:
	return _cover_mats.size()


## 按 surface 注入共享材质；不能用 material_override（会把整个 GLB 刷成单色、丢失分件层次）。
## 纯色主题材质不在 COVER_ROLE_PBR 里，保持各舱原色不变。
func _inject_cover_mats(n: Node) -> void:
	if n is GeometryInstance3D and _cull_enabled:
		var gi := n as GeometryInstance3D
		gi.visibility_range_end = CULL_DIST
		gi.visibility_range_end_margin = CULL_MARGIN
		gi.visibility_range_fade_mode = 0   # GL Compatibility 忽略淡出，用迟滞硬切换
	if n is MeshInstance3D:
		var mi := n as MeshInstance3D
		var mesh := mi.mesh
		if mesh != null:
			for i in range(mesh.get_surface_count()):
				var src: Material = mi.get_surface_override_material(i)
				if src == null:
					src = mesh.surface_get_material(i)
				if src == null:
					continue
				var nm := String(src.resource_name)
				var role := nm.substr(nm.rfind("_") + 1)
				if COVER_ROLE_PBR.has(role):
					mi.set_surface_override_material(i, _cover_mat(String(COVER_ROLE_PBR[role])))
	for c in n.get_children():
		_inject_cover_mats(c)


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


func _add_cover_model(kind: String, center: Vector3, size: Vector3, rid: String = "") -> bool:
	var ps := _cover_model(kind)
	if ps == null:
		return false
	var inst := ps.instantiate()
	var node := inst as Node3D
	if node == null:
		return false
	_inject_cover_mats(inst)
	_sight_shell_hidden += _hide_sight_shell(inst)
	node.position = center
	node.scale = size
	add_child(node)
	if rid != "":
		_register_room_node(rid, node)
	return true


func _add_collision(center: Vector3, size: Vector3, rotation_y: float) -> void:
	var body := StaticBody3D.new()
	body.position = center
	body.rotation.y = rotation_y
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collision.shape = shape
	body.add_child(collision)
	add_child(body)


func _build_cover() -> void:
	var shifts: Array = SpaceData.section(data, "art").get("tint_shifts", [])
	for item: Dictionary in data.get("cover", []):
		var kind := String(item.get("kind", ""))
		var w := float(item.get("w", 1.0))
		var h := float(item.get("h", 1.0))
		if w <= 0.05 or h <= 0.05:
			continue
		## 实例变体来自 map.json 的 cover[].v（配方在 export-map.cjs，与 blender-ship.py 逐位一致）：
		## hz = 高度 ±10%、tint = 5 档色调。这样 3D 里同 kind 的家具不再是克隆体，
		## 而且和 2.5D 底图**同一件家具同一档变体**（对账过 91 件，0 处不符）。
		var v: Dictionary = item.get("v", {})
		var hz := float(v.get("hz", 1.0))
		var height := float(COVER_HEIGHT.get(kind, 1.0)) * hz
		var tex := "panel-metal"
		if kind in ["crate", "rack", "locker", "fridge", "barrel"]:
			tex = "crate-steel"
		elif kind in ["table", "desk"]:
			tex = "table-composite"
		var base := Color(0.72, 0.76, 0.82)
		var tint_i := int(v.get("tint", 0))
		if tint_i >= 0 and tint_i < shifts.size():
			var shift: Array = shifts[tint_i]
			if shift.size() >= 3:
				base = Color(base.r * float(shift[0]), base.g * float(shift[1]), base.b * float(shift[2]))
		## v2 掩体专属色：颜色只取该舱 rooms[].theme.mark，
		## 不同舱的 tint 必然不同 → _material 缓存出各自独立的材质，不跨舱复用。
		var rid := String(item.get("room", ""))
		if rid != "":
			for rr: Dictionary in data.get("rooms", []):
				if String(rr.get("id", "")) != rid:
					continue
				var th: Dictionary = rr.get("theme", {})
				var mk: Array = th.get("mark", [])
				if mk.size() >= 3:
					base = Color(clampf(float(mk[0]), 0.0, 1.0), clampf(float(mk[1]), 0.0, 1.0), clampf(float(mk[2]), 0.0, 1.0))
				break
		var mat := _material(tex, base, true)
		var x := float(item.get("x", 0.0))
		var y := float(item.get("y", 0.0))
		## 有本体的 kind 先走 GLB；碰撞仍然按盒体加（视觉换皮不改通行判定）
		var ref := _cover_ref(kind)
		var mscale := Vector3(w / maxf(ref.x, 0.01), height / maxf(ref.y, 0.01), h / maxf(ref.z, 0.01))
		if _add_cover_model(kind, Vector3(x + w * 0.5, 0.0, y + h * 0.5), mscale, rid):
			_add_collision(Vector3(x + w * 0.5, height * 0.5, y + h * 0.5),
				Vector3(w, maxf(height, 0.08), h), 0.0)
			continue
		if kind == "table" and absf(w - h) <= 0.6:
			_add_cylinder(
				Vector3(x + w * 0.5, height * 0.5, y + h * 0.5),
				w * 0.5, height, mat, true
			)
			continue
		_add_box(
			Vector3(x + w * 0.5, height * 0.5, y + h * 0.5),
			Vector3(w, max(height, 0.08), h),
			0.0, mat, true
		)
		# 碰撞与视觉高度无关：2.5D 里凡是 `cover` 都是硬阻挡（geo.js 还会四周外扩 0.12），
		# 旧写法 `height > 0.2` 是替不存在的 "rug" 留的，修对表后会误让 pond(0.10) 变成可穿。


func _build_lights() -> void:
	for room: Dictionary in data.get("rooms", []):
		var rect: Array = room.get("rect", [0, 0, 1, 1])
		var label: Array = room.get("label", [rect[0] + rect[2] * 0.5, rect[1] + rect[3] * 0.5])
		var light := OmniLight3D.new()
		var span: float = max(float(rect[2]), float(rect[3]))
		var bright := String(room.get("light", "bright")) == "bright"
		light.position = Vector3(float(label[0]), 2.6, float(label[1]))
		light.omni_range = clampf(span * 1.6, 9.0, 38.0)
		light.light_energy = 2.4 if bright else 1.15
		light.light_color = Color(1.0, 0.93, 0.82) if bright else Color(0.62, 0.76, 1.0)
		light.shadow_enabled = false
		add_child(light)
		_room_lights.append({"light": light, "room": String(room.get("id", "")), "bright": bright})


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
			light.light_energy = 1.6
			light.light_color = Color(0.86, 0.92, 1.0)
			light.shadow_enabled = false
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


func _build_preview_actor() -> void:
	var atlas := AtlasTexture.new()
	atlas.atlas = load("res://assets/crew/crew-01.png")
	atlas.region = Rect2(0, 0, 96, 160)

	var sprite := Sprite3D.new()
	sprite.texture = atlas
	sprite.pixel_size = 0.012
	sprite.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	sprite.shaded = false
	sprite.double_sided = true
	sprite.position = Vector3(36.0, 0.96, 34.5)
	add_child(sprite)

	var label := Label3D.new()
	label.text = "02 银翼"
	label.font = _system_font()
	label.font_size = 48
	label.outline_size = 10
	label.outline_modulate = Color(0.0, 0.0, 0.0, 1.0)
	label.modulate = Color(1.0, 1.0, 1.0, 1.0)
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.position = Vector3(0.0, 1.5, 0.0)
	sprite.add_child(label)


func _build_environment() -> void:
	var we := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.012, 0.016, 0.026)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.42, 0.48, 0.6)
	env.ambient_light_energy = 0.55
	_ambient_base = env.ambient_light_energy
	_env = env
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.15
	env.fog_enabled = true
	env.fog_light_color = Color(0.02, 0.03, 0.05)
	env.fog_density = 0.007
	we.environment = env
	add_child(we)

	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-55.0, -35.0, 0.0)
	fill.light_energy = 0.28
	fill.light_color = Color(0.55, 0.66, 0.85)
	fill.shadow_enabled = false
	add_child(fill)
	_fill = fill
	_fill_base = fill.light_energy

	## 天花板补光：2026-11-07。
	## 天花板在 3.2m、法线朝下，而所有灯都在 2.6m 以下 —— 天花板是**背光面**，
	## 仰视时一片死黑，贴图细节全被压掉。加一盏朝上的弱平行光专门照它。
	## 能量刻意压低（0.16）：这是补面光，不能把舱室照亮成白天。
	var ceil_fill := DirectionalLight3D.new()
	ceil_fill.rotation_degrees = Vector3(58.0, 20.0, 0.0)
	ceil_fill.light_energy = 0.16
	ceil_fill.light_color = Color(0.62, 0.70, 0.82)
	ceil_fill.shadow_enabled = false
	add_child(ceil_fill)
	_ceil_fill = ceil_fill
	_ceil_fill_base = ceil_fill.light_energy


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
	var mesh := st.commit()
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	add_child(mi)
	if y >= CEILING_Y - 0.01:
		_ceil_nodes.append(mi)


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
	var mesh := st.commit()
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	add_child(mi)
	if y >= CEILING_Y - 0.01:
		_ceil_nodes.append(mi)


func _add_cylinder(center: Vector3, radius: float, height: float,
		mat: Material, collide: bool) -> void:
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.height = height
	mesh.radial_segments = 32
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = center
	add_child(mi)

	if not collide:
		return
	var body := StaticBody3D.new()
	body.position = center
	var collision := CollisionShape3D.new()
	var shape := CylinderShape3D.new()
	shape.radius = radius
	shape.height = height
	collision.shape = shape
	body.add_child(collision)
	add_child(body)


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
	mat.albedo_color = tint
	mat.roughness = 0.9
	mat.metallic = 0.08
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.uv1_triplanar = triplanar
	if triplanar:
		mat.uv1_scale = Vector3(0.35, 0.35, 0.35)
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	_materials[key] = mat
	return mat


## v2：40 件墙面装饰 —— 外饰用千问本地成品贴图（SDXL 已退役），几何一件不动。
## 数据是 map_v2.json 的 decor[]（唯一来源 tools/ship-layout-plan.json 的 3D 墙面美术，
## 掩体不在这条链上）；旧 scene_extras._build_decor 对新 kind 无匹配分支，
## 不会重复建模，也不会破坏原有 floor_mark / camera 的行为。
## 每舱一组贴图（med / fun 的首张即 room-wall-art.py 出的已 grade 真图），
## 配合 theme.glow 微发光区分房间；不跨舱复制同一组顺序。
const WALL_SKIN := {
	"bridge": ["qwen/bridge/skin1", "qwen/bridge/skin2", "qwen/bridge/floor", "qwen/bridge/skin4"],
	"cam": ["qwen/cam/skin1", "qwen/cam/skin2", "qwen/cam/floor", "qwen/cam/skin4"],
	"ecosys": ["qwen/ecosys/skin1", "qwen/ecosys/skin2", "qwen/ecosys/floor", "qwen/ecosys/skin4"],
	"power": ["qwen/power/skin1", "qwen/power/skin2", "qwen/power/floor", "qwen/power/skin4"],
	"transit": ["qwen/transit/skin1", "qwen/transit/skin2", "qwen/transit/floor", "qwen/transit/skin4"],
	"fun": ["qwen/fun/skin1", "qwen/fun/skin2", "qwen/fun/floor", "qwen/fun/skin4"],
	"engine": ["qwen/engine/skin1", "qwen/engine/skin2", "qwen/engine/floor", "qwen/engine/skin4"],
	"med": ["qwen/med/skin1", "qwen/med/skin2", "qwen/med/floor", "qwen/med/skin4"],
	"armory": ["qwen/armory/skin1", "qwen/armory/skin2", "qwen/armory/floor", "qwen/armory/skin4"],
	"warehouse": ["qwen/warehouse/skin1", "qwen/warehouse/skin2", "qwen/warehouse/floor", "qwen/warehouse/skin4"],
}
func _build_wall_decor_v2() -> void:
	var glows := {}
	var per_room := {}
	for r: Dictionary in data.get("rooms", []):
		var th: Dictionary = r.get("theme", {})
		var g: Array = th.get("glow", [])
		if g.size() >= 3:
			glows[String(r.get("id", ""))] = Color(
				clampf(float(g[0]), 0.0, 1.0), clampf(float(g[1]), 0.0, 1.0), clampf(float(g[2]), 0.0, 1.0))
	for d: Dictionary in data.get("decor", []):
		var rid := String(d.get("room", ""))
		if rid == "" or not d.has("side"):
			continue
		var w := float(d.get("w", 0.3))
		var h := float(d.get("h", 0.3))
		var span := maxf(w, h)
		var size: Vector3 = Vector3(span, 1.25, 0.08) if w >= h else Vector3(0.08, 1.25, span)
		var col: Color = Color(0.70, 0.80, 0.90)
		if glows.has(rid):
			col = glows[rid] as Color
		var skin := ""
		if WALL_SKIN.has(rid):
			var arr: Array = WALL_SKIN[rid]
			var n: int = int(per_room.get(rid, 0))
			skin = String(arr[n % arr.size()])
			per_room[rid] = n + 1
		# 近白 tint 保留千问材质本色；主题色只留一层微发光，不再刷满整块板
		var mat := _material(skin, Color(0.92, 0.95, 1.0), false)
		mat.emission = col
		mat.emission_energy_multiplier = 0.12
		_add_box(
			Vector3(float(d.get("x", 0.0)) + w * 0.5, 1.95, float(d.get("y", 0.0)) + h * 0.5),
			size, 0.0, mat, false)

## v2：任务点不再都压在掩体顶面 —— 给「无掩体可用」的设备补一个纯表现台座。
## 台座高 0.55m、无碰撞（不占通行、不进门净空判定），设备高度由
## scene_extras._cover_top 兜底 0.57（= 0.55 + 0.02 间隙）对齐。
## 不写进 map_v2.json 的 cover —— 掩体唯一真源是 js/data/map.js（现 120 件），
## 台座只是表现层，不参与碰撞与 coverAudit。
func _build_device_pedestals() -> void:
	var marks := {}
	for r: Dictionary in data.get("rooms", []):
		var th: Dictionary = r.get("theme", {})
		var mk: Array = th.get("mark", [])
		if mk.size() >= 3:
			marks[String(r.get("id", ""))] = Color(
				clampf(float(mk[0]), 0.0, 1.0), clampf(float(mk[1]), 0.0, 1.0), clampf(float(mk[2]), 0.0, 1.0))
	var targets: Array = []
	for p: Dictionary in data.get("points", []):
		targets.append(p)
	for f: Dictionary in data.get("facility", []):
		if String(f.get("kind", "")) == "breaker":
			targets.append(f)
	for t: Dictionary in targets:
		var px := float(t.get("x", 0.0))
		var py := float(t.get("y", 0.0))
		var covered := false
		for c: Dictionary in data.get("cover", []):
			var cx := float(c.get("x", 0.0))
			var cy := float(c.get("y", 0.0))
			if px >= cx - 0.2 and px <= cx + float(c.get("w", 0.0)) + 0.2 \
					and py >= cy - 0.2 and py <= cy + float(c.get("h", 0.0)) + 0.2:
				covered = true
				break
		if covered:
			continue
		var rid := String(t.get("room", ""))
		var col: Color = Color(0.70, 0.78, 0.86)
		if marks.has(rid):
			col = marks[rid] as Color
		## 2026-11-07：设备点原来是一整块**房间主题色**立方体（仓库/配电是刺眼的纯黄），
		## 和掩体本体的「浅色外壳 + 深色压边 + 主题色发光缝」完全脱节。
		## 改成同一套语言：中性外壳 + 内收踢脚 + 顶面压边 + 一条主题色发光缝 + 顶部小屏。
		## 2026-11-07：台座外壳/压边原来是无贴图纯色（塑料感的来源之一）。
		## 台座是**非交互件**，直接上已有贴图：外壳 panel-white、压边 panel-metal。
		var shell_mat := _material("panel-white", Color(0.66, 0.70, 0.74), false)
		var trim_mat := _material("panel-metal", Color(0.62, 0.66, 0.72), false)
		var accent_mat := StandardMaterial3D.new()
		accent_mat.albedo_color = col
		accent_mat.emission_enabled = true
		accent_mat.emission = col
		accent_mat.emission_energy_multiplier = 0.55
		accent_mat.roughness = 0.4
		_add_box(Vector3(px, 0.275, py), Vector3(0.90, 0.55, 0.90), 0.0, shell_mat, false)
		_add_box(Vector3(px, 0.04, py), Vector3(0.74, 0.08, 0.74), 0.0, trim_mat, false)
		_add_box(Vector3(px, 0.535, py), Vector3(0.98, 0.05, 0.98), 0.0, trim_mat, false)
		_add_box(Vector3(px, 0.42, py - 0.462), Vector3(0.70, 0.025, 0.02), 0.0, accent_mat, false)
		_add_box(Vector3(px, 0.575, py), Vector3(0.34, 0.03, 0.20), 0.0, trim_mat, false)

func _system_font() -> SystemFont:
	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])
	return font
