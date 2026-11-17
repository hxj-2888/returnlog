extends RefCounted

## 键位 → InputMap action（project.godot 是唯一真源）。
## 2026-11-16 从 main.gd 拆出：代码只读 action，不再散落 KEY_F / KEY_G。
## 对齐 2.5D R4：B 开枪、H 破坏、V 监控、F 施救；任务/设施/合闸/搜尸走 E。
## C 不再绑定（2.5D 已于 2026-11-15 移除 C 相机调试入口）。

const BINDINGS := {
	"E": "interact", "F": "revive", "R": "report", "G": "drag",
	"Q": "pipe", "V": "cams", "H": "sabotage", "B": "shoot",
}
const FALLBACK := {
	"E": 69, "F": 70, "R": 82, "G": 71, "Q": 81, "V": 86, "H": 72, "B": 66,
}


static func action_for(k: String) -> String:
	return String(BINDINGS.get(k, ""))


static func keycode(k: String) -> int:
	var act := action_for(k)
	if act != "" and InputMap.has_action(act):
		for ev in InputMap.action_get_events(act):
			if ev is InputEventKey:
				var pk := int((ev as InputEventKey).physical_keycode)
				if pk != 0:
					return pk
	return int(FALLBACK.get(k, 0))


## 边沿检测：有 action 就交给 InputMap（改键只改 project.godot）；
## 工程未声明 action 时退回物理键码，保证旧工程也能跑。
static func edge(k: String, state: Dictionary) -> bool:
	var act := action_for(k)
	if act != "" and InputMap.has_action(act):
		return Input.is_action_just_pressed(act)
	var code := keycode(k)
	if code == 0:
		return false
	var now := Input.is_physical_key_pressed(code)
	var was := bool(state.get(k, false))
	state[k] = now
	return now and not was


static func num_edge(n: int, state: Dictionary) -> bool:
	var key := "N%d" % n
	var now := Input.is_physical_key_pressed(KEY_1 + n)
	var was := bool(state.get(key, false))
	state[key] = now
	return now and not was
