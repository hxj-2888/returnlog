extends RefCounted
## 版本读取：3d/preview/data/version.json 由 3d/tools/export-version.cjs 生成。
## 真源在 3d/version.json（3D 自己的版本号）+ js/config/version.js（移植基线）。
## 3D 侧不允许再写版本字符串。

const PATH := "res://data/version.json"


static func load_data() -> Dictionary:
	var f := FileAccess.open(PATH, FileAccess.READ)
	if f == null:
		return {}
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	return parsed as Dictionary if parsed is Dictionary else {}


static func version() -> String:
	return String(load_data().get("version", "V1P-0.0"))


static func label() -> String:
	return version()
