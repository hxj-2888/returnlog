extends RefCounted
## 版本单一真源读取（3d/tools/export-version.cjs 从 js/config/version.js + package.json 导出）。
## 3D 侧不允许再写一份版本字符串。

const PATH := "res://data/version.json"


static func load_data() -> Dictionary:
	var f := FileAccess.open(PATH, FileAccess.READ)
	if f == null:
		return {}
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	return parsed as Dictionary if parsed is Dictionary else {}


static func version() -> String:
	return String(load_data().get("version", "返航录V3"))


static func label() -> String:
	var d := load_data()
	return "%s · %s" % [String(d.get("version", "返航录V3")), String(d.get("semver", ""))]
