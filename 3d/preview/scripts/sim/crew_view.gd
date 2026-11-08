extends Node3D

## 15 个 crew 的 3D 占位表现（B2）。
## ------------------------------------------------------------------
## 美术资源下一批再优化：这里只复用 2.5D 的 crew-01.png 第一帧做 billboard，
## 验证“人真的在走、任务真的被做掉”。不新增任何美术素材。
## 只读 sim.agents；不反向改 sim。

const CREW_TEX := "res://assets/crew/crew-01.png"
const FRAME_W := 96
const FRAME_H := 160
const PIXEL := 0.012

var _sprites: Dictionary = {}
var _labels: Dictionary = {}
var _font: Font


func _ready() -> void:
	_font = SystemFont.new()
	(_font as SystemFont).font_names = PackedStringArray(["Microsoft YaHei", "Noto Sans CJK SC", "SimHei"])


func build(sim) -> void:
	for child in get_children():
		child.queue_free()
	_sprites.clear()
	_labels.clear()
	if sim == null:
		return
	var tex := load(CREW_TEX) as Texture2D
	if tex == null:
		push_error("crew-01.png 缺失，crew 无法显示")
		return
	for a: Dictionary in sim.agents:
		var i := int(a.get("i", -1))
		if i == int(sim.me_idx) and not bool(sim.spectator):
			continue
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

		var lb := Label3D.new()
		lb.text = String(a.get("name", "?"))
		lb.font = _font
		lb.font_size = 26
		lb.outline_size = 6
		lb.pixel_size = 0.0032
		lb.outline_modulate = Color(0, 0, 0, 1)
		lb.modulate = Color(0.82, 0.92, 1.0, 1.0)
		lb.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		lb.position = Vector3(0, 1.08, 0)
		sp.add_child(lb)
		_labels[i] = lb


func sync(sim, delta: float) -> void:
	if sim == null:
		return
	for a: Dictionary in sim.agents:
		var i := int(a.get("i", -1))
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
			var lb: Label3D = _labels[i]
			lb.modulate = Color(0.82, 0.92, 1.0, 1.0) if alive else Color(0.55, 0.55, 0.55, 0.8)


func _pos3(a: Dictionary) -> Vector3:
	var p: Vector2 = a.get("pos", Vector2.ZERO)
	return Vector3(p.x, 0.96, p.y)
