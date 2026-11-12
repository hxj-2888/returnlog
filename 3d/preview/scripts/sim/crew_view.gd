extends Node3D

## 15 个 crew 的 3D 表现：billboard 兜底 / blockout GLB 两种模式。
## ------------------------------------------------------------------
## billboard 模式：复用 2.5D 的 crew-01.png 第一帧，行为与之前完全一致。
## blockout 模式：加载 char_crew_blockout.glb（2026-11-11 用户裁定的体块验证件），
## 只做表现，不参与 sim / 碰撞 / 判定。模型缺失时逐人回退到 billboard。
##
## 只读 sim.agents；不反向改 sim。

const CREW_TEX := "res://assets/crew/crew-01.png"
const CREW_GLB := "res://assets/models/char_crew_lowpoly.glb"
const CREW_FALLBACK_GLB := "res://assets/models/char_crew_blockout.glb"
const FRAME_W := 96
const FRAME_H := 160
const PIXEL := 0.012
## walk 动作是 1 秒循环（步幅约 1.4m）；2.5D 移速 4.2 m/s，
## 播 2.9 倍才能让脚底移动跟得上身体，避免“腿在走、人在地面滑”。
const WALK_SPEED_SCALE := 2.9

## 15 个席位的低饱和制服色；不承载阵营信息（异形不能靠外观被认出来）。
const CREW_COLORS := [
	Color("#6E7C8C"), Color("#7A6A5A"), Color("#5E7A6A"), Color("#6A6E8C"),
	Color("#8C6E6A"), Color("#5A7A8C"), Color("#8C7A5A"), Color("#6A5A7A"),
	Color("#7A8C6A"), Color("#5A6A7A"), Color("#8C5A6A"), Color("#6A8C7A"),
	Color("#7A7A7A"), Color("#8C6A5A"), Color("#5A6A8C"),
]

var _sprites: Dictionary = {}
var _models: Dictionary = {}
var _labels: Dictionary = {}
var _anims: Dictionary = {}
var _anim_state: Dictionary = {}
var _action_t: Dictionary = {}
var _event_n := 0
var _font: Font
var _use_models := false
var _anim_reported := false


func _ready() -> void:
	_font = SystemFont.new()
	(_font as SystemFont).font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])


## 由 main 在 build 之前设置；正常游玩默认体块（2026-11-11），
## --crew-billboard 或模型缺失时回退 billboard。
func set_model_mode(on: bool) -> void:
	_use_models = on


func build(sim) -> void:
	for child in get_children():
		child.queue_free()
	_sprites.clear()
	_models.clear()
	_labels.clear()
	_anims.clear()
	_anim_state.clear()
	_action_t.clear()
	_event_n = sim.events.size() if sim != null else 0
	if sim == null:
		return
	var glb_path := CREW_GLB
	if not ResourceLoader.exists(glb_path):
		glb_path = CREW_FALLBACK_GLB
	var use_glb := _use_models and ResourceLoader.exists(glb_path)
	var packed: PackedScene = null
	if use_glb:
		packed = load(glb_path) as PackedScene
		if packed == null:
			use_glb = false
			push_warning("char_crew_lowpoly.glb 加载失败，回退 billboard")
	var tex := load(CREW_TEX) as Texture2D
	if not use_glb and tex == null:
		push_error("crew-01.png 缺失，crew 无法显示")
		return
	for a: Dictionary in sim.agents:
		var i := int(a.get("i", -1))
		if i == int(sim.me_idx) and not bool(sim.spectator):
			continue
		if use_glb:
			var m := packed.instantiate() as Node3D
			if m != null:
				m.name = "crew_model_%d" % i
				m.position = _pos3_floor(a)
				add_child(m)
				_tint_model(m, CREW_COLORS[i % CREW_COLORS.size()])
				var lb := _make_label(String(a.get("name", "?")))
				lb.position = Vector3(0, 1.95, 0)
				m.add_child(lb)
				_models[i] = m
				_labels[i] = lb
				var ap := m.find_child("AnimationPlayer", true, false) as AnimationPlayer
				if ap != null:
					_anims[i] = ap
					_anim_state[i] = "idle"
					# glTF 不记录循环；walk/idle 必须显式设循环，否则播一次就停在半途。
					for n in ap.get_animation_list():
						var an := String(n).to_lower()
						var anim := ap.get_animation(String(n))
						if anim != null:
							anim.loop_mode = Animation.LOOP_LINEAR if (an.contains("idle") or an.contains("walk")) else Animation.LOOP_NONE
					if not _anim_reported:
						_anim_reported = true
						print("CREW_ANIM %s -> %s" % [glb_path, str(ap.get_animation_list())])
					var idle_name := _anim_name(ap, "idle")
					if idle_name != "":
						ap.play(idle_name)
				continue
			push_warning("crew %d 的 blockout 实例化失败，回退 billboard" % i)
		var atlas := AtlasTexture.new()
		atlas.atlas = tex
		atlas.region = Rect2(0, 0, FRAME_W, FRAME_H)
		var sp := Sprite3D.new()
		sp.texture = atlas
		sp.pixel_size = PIXEL
		sp.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		sp.shaded = false
		sp.double_sided = true
		sp.position = _pos3(a)
		add_child(sp)
		_sprites[i] = sp
		var lb2 := _make_label(String(a.get("name", "?")))
		lb2.position = Vector3(0, 1.08, 0)
		sp.add_child(lb2)
		_labels[i] = lb2


func _make_label(txt: String) -> Label3D:
	var lb := Label3D.new()
	lb.text = txt
	lb.font = _font
	lb.font_size = 26
	lb.outline_size = 6
	lb.pixel_size = 0.0032
	lb.outline_modulate = Color(0, 0, 0, 1)
	lb.modulate = Color(0.82, 0.92, 1.0, 1.0)
	lb.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	return lb


## 出刀一次性动作：视图层从 sim.events 触发，时长取动画本身。
func _trigger_action(i: int, want: String) -> void:
	if not _anims.has(i):
		return
	var ap: AnimationPlayer = _anims[i]
	var anim_name := _anim_name(ap, want)
	if anim_name == "":
		return
	var anim := ap.get_animation(anim_name)
	_action_t[i] = anim.length if anim != null else 0.6
	_anim_state[i] = want
	ap.play(anim_name, 0.08)
	ap.speed_scale = 1.0


## 动画名兼容 Blender 导出的 "Armature|walk" 之类前缀。
func _anim_name(ap: AnimationPlayer, want: String) -> String:
	for n in ap.get_animation_list():
		if String(n).to_lower().contains(want):
			return String(n)
	return ""


## 2026-11-11 第二版：身体贴图是 768² 整图集，UV 已按图集分区排好；
## 运行时只给 crew_suit 乘席位色，不换贴图、不改 uv1_scale（改了会破坏图集）。
## 其余材质（胸带/装备/皮肤/脸/头发）直接使用 glb 内嵌材质。
func _tint_model(root: Node, color: Color) -> void:
	var stack: Array = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n is MeshInstance3D:
			var mi := n as MeshInstance3D
			if mi.mesh != null:
				for s in mi.mesh.get_surface_count():
					var mat := mi.mesh.surface_get_material(s)
					if mat is StandardMaterial3D:
						var m := mat as StandardMaterial3D
						if m.resource_name.to_lower().contains("suit"):
							var dup := m.duplicate() as StandardMaterial3D
							# 图集本身是浅灰；提亮一档再乘席位色，避免 15 人糊成黑块。
							dup.albedo_color = color.lightened(0.42)
							mi.set_surface_override_material(s, dup)
		for c in n.get_children():
			stack.append(c)


func sync(sim, delta: float) -> void:
	if sim == null:
		return
	## DEV / 旁观全知（2.5D canSee / drawNameTag）：名字旁直接标阵营。
	## 不开 DEV 时保持原样，不把「谁是异形」泄露给正常对局。
	var omniscient: bool = bool(sim.dev) or bool(sim.spectator)
	# 视图层只读事件：出刀事件触发一次 knife，不往 sim 加状态。
	if sim.events.size() < _event_n:
		_event_n = 0
	for k in range(_event_n, sim.events.size()):
		var ev: Dictionary = sim.events[k]
		if String(ev.get("kind", "")) == "knife":
			_trigger_action(int(ev.get("actor", -1)), "knife")
	_event_n = sim.events.size()
	for a: Dictionary in sim.agents:
		var i := int(a.get("i", -1))
		if _models.has(i):
			_sync_model(a, i, delta, omniscient)
			continue
		if not _sprites.has(i):
			continue
		var sp: Sprite3D = _sprites[i]
		if bool(a.get("bodyGone", false)):
			sp.visible = false
			if _labels.has(i):
				(_labels[i] as Label3D).visible = false
			continue
		sp.visible = true
		if _labels.has(i):
			(_labels[i] as Label3D).visible = true
		var tgt := _pos3(a)
		sp.position = sp.position.lerp(tgt, clampf(delta * 12.0, 0.0, 1.0))
		var alive := bool(a.get("alive", true))
		var downed := bool(a.get("downed", false))
		sp.modulate = Color(1, 1, 1, 1) if alive and not downed else Color(0.45, 0.42, 0.42, 0.9)
		if _labels.has(i):
			_sync_label(a, i, alive, downed, omniscient)


func _sync_model(a: Dictionary, i: int, delta: float, omniscient: bool) -> void:
	var m: Node3D = _models[i]
	var alive := bool(a.get("alive", true))
	var downed := bool(a.get("downed", false))
	if bool(a.get("bodyGone", false)):
		m.visible = false
		if _labels.has(i):
			(_labels[i] as Label3D).visible = false
		return
	m.visible = true
	if _labels.has(i):
		(_labels[i] as Label3D).visible = true
	var tgt := _pos3_floor(a)
	m.position = m.position.lerp(tgt, clampf(delta * 12.0, 0.0, 1.0))
	if downed or not alive:
		## down 动作会把根骨后仰放倒；没有 down 才退回整体旋转。
		if _anims.has(i):
			var dap: AnimationPlayer = _anims[i]
			var dname := _anim_name(dap, "down")
			if dname != "":
				if String(_anim_state.get(i, "")) != "down":
					_anim_state[i] = "down"
					_action_t.erase(i)
					dap.play(dname, 0.08)
					dap.speed_scale = 1.0
				m.position.y = 0.0
			else:
				dap.stop()
				m.rotation = Vector3(-PI * 0.5, float(a.get("aimAng", 0.0)), 0.0)
				m.position.y = 0.12
		else:
			m.rotation = Vector3(-PI * 0.5, float(a.get("aimAng", 0.0)), 0.0)
			m.position.y = 0.12
	else:
		## Blender +Y 前 → glTF/Godot -Z 前；look_at 正好把 -Z 指向目标。
		var ang := float(a.get("aimAng", 0.0))
		var f := Vector3(cos(ang), 0.0, sin(ang))
		if f.length_squared() > 0.0001:
			m.look_at(m.global_position + f, Vector3.UP)
		if _anims.has(i):
			var ap: AnimationPlayer = _anims[i]
			# 出刀是一次性覆盖；播完再回到 walk/idle。
			if _action_t.has(i):
				_action_t[i] = maxf(0.0, float(_action_t[i]) - delta)
				if float(_action_t[i]) > 0.0:
					return
				_action_t.erase(i)
				_anim_state[i] = ""
			# 只在状态切换时 play，避免每帧重置动画导致“原地漂移”。
			var want := "walk" if bool(a.get("moving", false)) else "idle"
			if String(_anim_state.get(i, "")) != want:
				_anim_state[i] = want
				var anim_name := _anim_name(ap, want)
				if anim_name != "":
					ap.play(anim_name, 0.15)
			ap.speed_scale = WALK_SPEED_SCALE if want == "walk" else 1.0
	if _labels.has(i):
		_sync_label(a, i, alive, downed, omniscient)


func _sync_label(a: Dictionary, i: int, alive: bool, downed: bool, omniscient: bool) -> void:
	var lb: Label3D = _labels[i]
	if omniscient:
		var role := "异形" if bool(a.get("alien", false)) else "人类"
		if not alive:
			role += " · 尸体"
		elif downed:
			role += " · 濒死"
		var tag := "%s · %s" % [String(a.get("name", "?")), role]
		if lb.text != tag:
			lb.text = tag
		lb.modulate = Color(0.898, 0.341, 0.310) if bool(a.get("alien", false)) \
			else (Color(0.867, 0.890, 0.925) if alive else Color(0.55, 0.58, 0.62, 0.85))
	else:
		if lb.text != String(a.get("name", "?")):
			lb.text = String(a.get("name", "?"))
		lb.modulate = Color(0.82, 0.92, 1.0, 1.0) if alive else Color(0.55, 0.55, 0.55, 0.8)


func _pos3(a: Dictionary) -> Vector3:
	var p: Vector2 = a.get("pos", Vector2.ZERO)
	return Vector3(p.x, 0.96, p.y)


func _pos3_floor(a: Dictionary) -> Vector3:
	# 2.5D bodyPos()：死者用**尸体坐标**（bodyX/bodyY），活人/濒死者用本人坐标。
	# 3D 之前一律读 pos —— 拖尸时 sim 只写 bodyPos，模型却钉在死亡位置，
	# 玩家看到的就是「按住拖了、尸体一动不动」（2026-11-12 现场）。
	var alive := bool(a.get("alive", true))
	var p: Vector2 = a.get("pos", Vector2.ZERO)
	if not alive:
		p = a.get("bodyPos", p)
	return Vector3(p.x, 0.0, p.y)
