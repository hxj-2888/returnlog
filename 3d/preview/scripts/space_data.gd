extends RefCounted

## 空间数值契约（3d/preview/data/space.json）
## 由 3d/tools/export-space.cjs 从 2.5D 真源导出（sanity.js / space.js / game.js 三处）。
## 这里**不抄任何数值**：缺分段就 push_error，不用默认值兜底 ——
## COVER_HEIGHT 事故就是因为表被抄了一份且从没对账（39 件家具落到默认值）。

const PATH := "res://data/space.json"


static func load_data() -> Dictionary:
	var file := FileAccess.open(PATH, FileAccess.READ)
	if file == null:
		push_error("space.json 缺失：先跑 node 3d/tools/export-space.cjs")
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		return parsed
	push_error("space.json 解析失败")
	return {}


static func section(data: Dictionary, name: String) -> Dictionary:
	var s: Variant = data.get(name, {})
	if not (s is Dictionary):
		push_error("space.json 缺少分段 " + name)
		return {}
	return s


static func num(data: Dictionary, sec: String, key: String) -> float:
	var s := section(data, sec)
	if not s.has(key):
		push_error("space.json 缺少 %s.%s" % [sec, key])
		return 0.0
	return float(s[key])


## 1 格 = 1 米（3d/ARCHITECTURE.md §4），所以 2.5D 的"格"在这里直接当米用。
static func meters(data: Dictionary, sec: String, key: String) -> float:
	return num(data, sec, key)
