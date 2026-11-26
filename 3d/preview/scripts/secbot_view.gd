extends Node

## 保安机器人的纯表现层：根节点由 main 移动，这里只按“这一帧有没有位移”
## 在 idle / walk 之间切换。不改 sim、不改巡逻、不改任何规则。

var _anim: AnimationPlayer = null
var _last_pos := Vector3.ZERO
var _moving := false


func setup(inst: Node) -> void:
	_anim = inst.find_child("AnimationPlayer", true, false) as AnimationPlayer
	_last_pos = (get_parent() as Node3D).position
	if _anim != null:
		_anim.play("idle")


func _process(_dt: float) -> void:
	var p := (get_parent() as Node3D).position
	var moving := p.distance_squared_to(_last_pos) > 0.000001
	if moving != _moving:
		_moving = moving
		if _anim != null:
			var name := "walk" if moving else "idle"
			if _anim.has_animation(name):
				_anim.play(name)
	_last_pos = p
