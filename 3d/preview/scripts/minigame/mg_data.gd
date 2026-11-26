extends RefCounted

## 小游戏数据契约（3d/preview/data/minigames.json）
## 由 3d/tools/export-minigames.cjs 从 2.5D 真源导出，不在这里抄常量。

const PATH := "res://data/minigames.json"


static func load_data() -> Dictionary:
	var file := FileAccess.open(PATH, FileAccess.READ)
	if file == null:
		push_error("minigames.json 缺失：先跑 node 3d/tools/export-minigames.cjs")
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		return parsed
	push_error("minigames.json 解析失败")
	return {}


static func plate_for_label(data: Dictionary, label: String) -> Dictionary:
	var plates: Dictionary = data.get("plates", {})
	var by_label: Dictionary = plates.get("byLabel", {})
	var id := String(by_label.get(label, ""))
	if id == "":
		return {}
	var all: Dictionary = plates.get("plates", {})
	var plate: Variant = all.get(id)
	return plate if plate is Dictionary else {}


static func task_cfg(data: Dictionary, label: String) -> Dictionary:
	var tasks: Dictionary = data.get("tasks", {})
	var cfg: Variant = tasks.get(label)
	return cfg if cfg is Dictionary else {}


static func hint_for(data: Dictionary, label: String, kind: String) -> String:
	var cfg := task_cfg(data, label)
	var h := String(cfg.get("hint", ""))
	if h != "":
		return h
	return String(data.get("hint", {}).get(kind, ""))


static func kind_for(data: Dictionary, action: String, label: String) -> String:
	var by_label: Dictionary = data.get("byLabel", {})
	if label != "" and by_label.has(label):
		return String(by_label[label])
	var arch: Dictionary = data.get("arch", {})
	return String(arch.get(action, "place"))


static func fallback_for(data: Dictionary, tier: String) -> float:
	var fb: Dictionary = data.get("fallback", {})
	return float(fb.get(tier, fb.get("normal", 10.0)))
