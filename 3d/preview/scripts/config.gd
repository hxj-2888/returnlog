extends RefCounted
## 版本读取：3d/preview/data/version.json 由 3d/tools/export-version.cjs 生成。
## 真源在 3d/version.json（3D 自己的版本号）+ js/config/version.js（移植基线）。
## 3D 侧不允许再写版本字符串。

const PATH := "res://data/version.json"
const CFG_PATH := "user://settings.cfg"
const VALID_MAX_FPS := [60, 120, 0]
const DEFAULT_CFG := {
	"music": 0.35,
	"sfx": 0.80,
	"mouse_sens": 0.0022,
	"max_fps": 60,
}


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


## 规范化帧率上限档位，非法值回落到 60 FPS。
static func normalize_max_fps(val: int) -> int:
	return val if val in VALID_MAX_FPS else 60


## 应用帧率上限（0 为无上限）；headless 测试模式不限帧，避免拖慢测试。
static func apply_max_fps(val: int) -> void:
	if DisplayServer.get_name() != "headless":
		Engine.max_fps = normalize_max_fps(val)


## 读取本机设置并立即应用帧率上限。
static func load_cfg() -> Dictionary:
	var cf := ConfigFile.new()
	cf.load(CFG_PATH)
	var cfg := DEFAULT_CFG.duplicate()
	cfg["music"] = float(cf.get_value("audio", "music", DEFAULT_CFG["music"]))
	cfg["sfx"] = float(cf.get_value("audio", "sfx", DEFAULT_CFG["sfx"]))
	cfg["mouse_sens"] = float(cf.get_value("input", "mouse_sens", DEFAULT_CFG["mouse_sens"]))
	cfg["max_fps"] = normalize_max_fps(int(cf.get_value("display", "max_fps", DEFAULT_CFG["max_fps"])))
	apply_max_fps(int(cfg.get("max_fps", 60)))
	return cfg


## 持久化本机设置（含音频、灵敏度与帧率上限）。
static func save_cfg(cfg: Dictionary) -> void:
	var cf := ConfigFile.new()
	cf.load(CFG_PATH)
	cf.set_value("audio", "music", float(cfg.get("music", DEFAULT_CFG["music"])))
	cf.set_value("audio", "sfx", float(cfg.get("sfx", DEFAULT_CFG["sfx"])))
	cf.set_value("input", "mouse_sens", float(cfg.get("mouse_sens", DEFAULT_CFG["mouse_sens"])))
	cf.set_value("display", "max_fps", normalize_max_fps(int(cfg.get("max_fps", DEFAULT_CFG["max_fps"]))))
	cf.save(CFG_PATH)
