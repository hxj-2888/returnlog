extends RefCounted
## 2.5D / 3D 共用的「推理 + 发言」规则真源读取器。
##
## 数据来自 `data/rules.json`（由 `3d/tools/export-rules.cjs` 从
## js/ai/sanity.js + js/ai/traits.js + js/t2/ai.js + js/t2/decision.js + js/game.js
## 具名导出）。GDScript 侧**不得再写死任何推理/发言阈值**：
##   - n / i / b / t        → SKSanity 的规则表
##   - disp / disp_sub      → pickLine / startChatter / sayStreakOK 的调度系数
##   - fn                  → 2.5D 纯函数的源码指纹与数值字面量清单
##   - constant             → MEM_MAX / EV_W / ID_EVIDENCE 等模块内常量
##
## 与地形相关的东西（网格 / A* / 碰撞 / LOS）不在这里，见 grid_nav.gd / space.json。

const PATH := "res://data/rules.json"

## 1000 局批量模拟会 new_game 上千次；规则是只读的，用类级缓存避免重复解析 31KB。
static var _cache: Dictionary = {}

var data: Dictionary = {}


func setup() -> bool:
	if not _cache.is_empty():
		data = _cache
		return true
	var f := FileAccess.open(PATH, FileAccess.READ)
	if f == null:
		return false
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if not (parsed is Dictionary):
		return false
	data = parsed as Dictionary
	_cache = data
	return not (data.get("tables", {}) as Dictionary).is_empty()


func t(sec: String) -> Dictionary:
	var sk: Dictionary = (data.get("tables", {}) as Dictionary).get("SKSanity", {}) as Dictionary
	return sk.get(sec, {}) as Dictionary


func v(sec: String, key: String, fallback: Variant = 0.0) -> Variant:
	var tbl := t(sec)
	if tbl.has(key):
		return tbl[key]
	return fallback


## 规则表里的数值；fallback 只在契约缺失时兜底（check-parity 会把它判成 FAIL）。
func n(sec: String, key: String, fallback: float = 0.0) -> float:
	var x: Variant = v(sec, key, null)
	return float(x) if (x is int or x is float) else fallback


func i(sec: String, key: String, fallback: int = 0) -> int:
	var x: Variant = v(sec, key, null)
	return int(x) if (x is int or x is float) else fallback


func b(sec: String, key: String, fallback: bool = false) -> bool:
	var x: Variant = v(sec, key, null)
	return bool(x) if (x is bool) else fallback


## 发言调度系数（dispatch 顶层或 talkScore 子表）。
func disp(key: String, fallback: float = 0.0) -> float:
	var d: Dictionary = data.get("dispatch", {}) as Dictionary
	var x: Variant = d.get(key, null)
	return float(x) if (x is int or x is float) else fallback


func disp_sub(group: String, key: String, fallback: float = 0.0) -> float:
	var d: Dictionary = data.get("dispatch", {}) as Dictionary
	var sub: Dictionary = d.get(group, {}) as Dictionary
	var x: Variant = sub.get(key, null)
	return float(x) if (x is int or x is float) else fallback


## 2.5D 纯函数指纹：{sha, nums}。3D 实现同一语义时可拿它自检。
func fn(full_name: String) -> Dictionary:
	var fps: Dictionary = data.get("fn_fingerprints", {}) as Dictionary
	return fps.get(full_name, {}) as Dictionary


func constant(key: String) -> Variant:
	return (data.get("constants", {}) as Dictionary).get(key, null)


func source_sha(rel: String) -> String:
	return String((data.get("sources", {}) as Dictionary).get(rel, ""))
