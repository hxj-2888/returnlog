extends RefCounted
## 台词语料读取 + 模板填充 + 玩家自由发言槽位解析。
## 数据全部来自 res://data/lines.json（由 3d/tools/export-lines.cjs 从 2.5D 真源导出），
## 本文件不写死任何一句台词、任何一条中文关键词、任何一条证据短语。
##
## 对应关系：
##   js/data/lines.js#SKLines      → pool / why / tone_of / claim_act
##   js/game.js#fillTpl            → fill（词槽 + {a|b} 组合槽）
##   js/t2/decision.js#parseSpeech → parse_speech（房间 / 人名 / 席位号 / 意图）

const PATH := "res://data/lines.json"
## 1000 局批量模拟会 new_game 一千次；语料是只读的，用类级缓存避免重复读 84KB + 编译正则
static var _cache: Dictionary = {}

var data: Dictionary = {}
var pools: Dictionary = {}
var why: Dictionary = {}
var combos: Dictionary = {}
var rules: Dictionary = {}
var tags: Array = []
var claim_act: Dictionary = {}
var room_words: Array = []
var cn_seat: Dictionary = {}
var when_words: Dictionary = {}
var patterns: Dictionary = {}
var placeholders: Array = []
var tone: Dictionary = {}
var stats: Dictionary = {}
var _regex: Dictionary = {}
var _combo_re: RegEx


func setup() -> bool:
	if not _cache.is_empty():
		return _apply(_cache)
	var f := FileAccess.open(PATH, FileAccess.READ)
	if f == null:
		push_error("lines.json 缺失：先跑 node 3d/tools/export-lines.cjs")
		return false
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if not (parsed is Dictionary):
		push_error("lines.json 解析失败")
		return false
	data = parsed as Dictionary
	_cache = data
	return _apply(data)


func _apply(src: Dictionary) -> bool:
	data = src
	pools = data.get("pools", {}) as Dictionary
	why = data.get("why", {}) as Dictionary
	combos = data.get("combos", {}) as Dictionary
	rules = data.get("rules", {}) as Dictionary
	tags = data.get("tags", []) as Array
	claim_act = data.get("claim_act", {}) as Dictionary
	room_words = data.get("room_words", []) as Array
	cn_seat = data.get("cn_seat", {}) as Dictionary
	when_words = data.get("when_words", {}) as Dictionary
	patterns = data.get("speech_patterns", {}) as Dictionary
	placeholders = data.get("placeholders", []) as Array
	tone = data.get("tone", {}) as Dictionary
	stats = data.get("stats", {}) as Dictionary
	_combo_re = RegEx.new()
	_combo_re.compile("\\{([^{}]*\\|[^{}]*)\\}")
	for k: String in patterns.keys():
		if k == "claim_kinds":
			continue
		var re := RegEx.new()
		var err := re.compile(String(patterns[k]))
		if err != OK:
			push_error("speech_patterns.%s 正则编译失败：%s" % [k, String(patterns[k])])
			return false
		_regex[k] = re
	return not pools.is_empty() and not why.is_empty()


func rule(section: String, key: String, fallback: float = 0.0) -> float:
	var s: Dictionary = rules.get(section, {}) as Dictionary
	if not s.has(key):
		return fallback
	return float(s[key])


func pool(cat: String, tone_name: String) -> Array:
	var g: Dictionary = pools.get(cat, {}) as Dictionary
	if g.is_empty():
		return []
	var arr: Array = g.get(tone_name, []) as Array
	if arr.is_empty():
		arr = g.get("cold", []) as Array
	return arr


func tone_of(a: Dictionary, bias: float = 0.0) -> String:
	var t: Dictionary = a.get("trait", {}) as Dictionary
	var neutral := float(tone.get("neutral", 50))
	var aggr := float(t.get("aggr", neutral))
	var caut := float(t.get("caut", neutral))
	var hot := (aggr - caut) / 100.0 + bias
	return "hot" if hot > float(tone.get("hot_threshold", 0.08)) else "cold"


func when_word(day: bool = false) -> String:
	return String(when_words.get("day" if day else "night", "今晚"))


## fillTpl 的等价实现：先展开 {a|b} 组合槽（最多 8 次），再替换具名词槽。
## rng 由调用方传入（sim._rng），保证同 seed 可复现。
func fill(tpl: String, speaker: Dictionary, ctx: Dictionary, rng: RandomNumberGenerator) -> String:
	var out := tpl
	for i in 8:
		var m := _combo_re.search(out)
		if m == null:
			break
		var parts := m.get_string(1).split("|")
		var pick := String(parts[rng.randi_range(0, parts.size() - 1)])
		out = out.substr(0, m.get_start()) + pick + out.substr(m.get_end())
	var vals := {
		"n": String(speaker.get("name", "")),
		"t": String(ctx.get("t", "他")),
		"r": String(ctx.get("r", "走廊")),
		"r2": String(ctx.get("r2", "现场")),
		"u": String(ctx.get("u", "他")),
		"k": String(ctx.get("k", "任务")),
		"when": String(ctx.get("when", when_word())),
		"prev": String(ctx.get("prev", "上一轮")),
		"why": String(ctx.get("why", "他的说法对不上")),
	}
	for k: String in vals.keys():
		out = out.replace("{%s}" % k, String(vals[k]))
	return out


func has_pattern(key: String, text: String) -> bool:
	if not _regex.has(key):
		return false
	return (_regex[key] as RegEx).search(text) != null


func claim_kinds() -> Array:
	return patterns.get("claim_kinds", []) as Array


## ---- 玩家自由发言 → 槽位 ----
## 与 2.5D parseSpeech 同口径：名字按长度降序占位（避免「星尘」被认成「星」），
## 席位号 1..15 / 中文席位号，意图只做槽位抽取，不做语义理解。
func parse_speech(text: String, sim) -> Dictionary:
	var s := text.substr(0, 80)
	var out := {
		"raw": s, "rooms": [], "people": [], "accuse": -1, "vote": -1,
		"deny": false, "where": "", "when": "", "claim": {}, "support": -1,
	}
	# 舱室词
	for pair: Array in room_words:
		if s.find(String(pair[0])) >= 0 and not (out["rooms"] as Array).has(String(pair[1])):
			(out["rooms"] as Array).append(String(pair[1]))
	# 人名 / 席位号
	var spans: Array = []
	var at: Dictionary = {}
	var names: Array = []
	for a: Dictionary in sim.agents:
		if int(a.get("i", -1)) == int(sim.me_idx):
			continue
		if not bool(a.get("alive", false)):
			continue
		names.append([String(a.get("name", "")), int(a.get("i", -1))])
	names.sort_custom(func(x, y): return String(x[0]).length() > String(y[0]).length())
	for pair: Array in names:
		var nm := String(pair[0])
		var idx := int(pair[1])
		var pos := s.find(nm)
		if pos >= 0 and _free_span(spans, pos, nm.length()):
			at[idx] = pos
			spans.append([pos, pos + nm.length()])
		var seat := "%d号" % (idx + 1)
		var sp := s.find(seat)
		if sp >= 0 and _free_span(spans, sp, seat.length()):
			if not at.has(idx) or int(at[idx]) > sp:
				at[idx] = sp
			spans.append([sp, sp + seat.length()])
	var keys: Array = at.keys()
	keys.sort_custom(func(x, y): return int(at[x]) < int(at[y]))
	out["people"] = keys
	var first := int(keys[0]) if not keys.is_empty() else -1
	var has_people := first >= 0

	# 意图
	var support := has_people and has_pattern("support", s)
	var neg_vote := has_pattern("neg_vote", s)
	var neg_acc := has_pattern("neg_acc", s)
	var neg_see := has_pattern("neg_see", s)
	if support:
		out["support"] = first
	var claim_kind := ""
	if not support:
		for c: Dictionary in claim_kinds():
			var re := RegEx.new()
			re.compile(String(c.get("pattern", "")))
			if re.search(s) != null:
				claim_kind = String(c.get("kind", ""))
				break
	var saw := has_pattern("saw", s)
	if claim_kind != "" and saw and not neg_see and has_people and not support:
		var rooms: Array = out["rooms"] as Array
		out["claim"] = {"target": first, "kind": claim_kind,
			"room": String(rooms[0]) if not rooms.is_empty() else ""}
	if not support and (out["claim"] as Dictionary).is_empty():
		if has_people and has_pattern("accuse", s) and not neg_acc:
			out["accuse"] = first
		if has_people and has_pattern("vote", s) and not neg_vote:
			out["vote"] = first
	if has_pattern("deny", s):
		out["deny"] = true
	var rooms2: Array = out["rooms"] as Array
	if not rooms2.is_empty() and has_pattern("where", s):
		out["where"] = String(rooms2[0])
	if has_pattern("when_recent", s):
		out["when"] = "recent"
	elif has_pattern("when_night", s):
		out["when"] = "night"
	return out


func _free_span(spans: Array, start: int, len_: int) -> bool:
	for sp: Array in spans:
		if start < int(sp[1]) and start + len_ > int(sp[0]):
			return false
	return true


## 证据短语：按 kind 取一条（找不到回落 unknown，绝不返回空串）
func evidence(kind: String, rng: RandomNumberGenerator) -> String:
	var arr: Array = why.get(kind, []) as Array
	if arr.is_empty():
		arr = why.get("unknown", []) as Array
	if arr.is_empty():
		return "他的说法对不上"
	return String(arr[rng.randi_range(0, arr.size() - 1)])
