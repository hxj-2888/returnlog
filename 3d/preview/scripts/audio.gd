extends Node
## 3D 音效层：复用 2.5D `audio/*.ogg`（CC0，见 audio/CREDITS.md）。
## 由 sim 的事件流驱动，不自己判定规则；音量来自设置面板（AudioServer 总线 + 本机持久化）。
##
## 与 2.5D SND 对齐的三件事（2026-11-11）：
##   ① volAt：距离 0 → 1.0，≥18 格 → 0.14，中间线性；UI 例外，保持全局音量。
##   ② 音色档 TONE：单条采样有音量上限和随机音高区间，金属/电/人声/脚步分频段。
##   ③ 同一声源 0.12s 去重；step 例外（脚步本来就是连续事件）。
##
## 背景音乐：Godot 不解码 m4a/AAC，所以 `audio/music-bgm.m4a`（用户自有录音）
## 由 ffmpeg 本地转成 `assets/audio/music-bgm.ogg` 再用，见 audio/CREDITS.md。

const DIR := "res://assets/audio/"
const MUSIC_PATH := "res://assets/audio/music-bgm.ogg"
const DIST_RANGE := 18.0
const DIST_MIN := 0.14
const DIST_MAX := 1.0

## 2.5D SND.FILE 的同源映射；同一事件有多个采样时随机挑一条。
const MAP := {
	"knife": "sfx-knife-01", "shoot": "sfx-gun", "kill": "sfx-death",
	"revive": "sfx-ui", "sabotage": "sfx-metal", "fix": "sfx-submit",
	"task": "sfx-submit", "qual": "sfx-submit", "supply": "sfx-submit",
	"report": "sfx-notify", "meeting": "sfx-notify",
	"vote": "sfx-vote", "vote_change": "sfx-click", "eject": "sfx-metal",
	"drag_start": "sfx-step-01", "drag_end": "sfx-step-02",
	"search": "sfx-work", "bot_hit": "sfx-metal", "bot_down": "sfx-metal",
	"breaker": "sfx-door", "pipe": "sfx-door", "detain": "sfx-notify",
	"chat": "sfx-click", "game_end": "sfx-lose",
	"step": "sfx-step-01", "scream": "sfx-scream-01", "flesh": "sfx-flesh",
	"door": "sfx-door", "work": "sfx-work", "win": "sfx-win", "lose": "sfx-lose",
}

const VARIANTS := {
	"knife": ["sfx-knife-01", "sfx-knife-02"],
	"step": ["sfx-step-01", "sfx-step-02"],
	"scream": ["sfx-scream-01", "sfx-scream-02"],
}

## 2.5D TONE：max 是单条采样音量上限；rate 是播放速率区间。
const TONE := {
	"knife": {"max": 0.60, "rate": [0.90, 1.00]},
	"shoot": {"max": 0.74, "rate": [0.95, 1.01]},
	"scream": {"max": 0.52, "rate": [0.94, 1.02]},
	"step": {"max": 0.30, "rate": [1.00, 1.12]},
	"flesh": {"max": 0.42, "rate": [0.90, 1.00]},
	"door": {"max": 0.34, "rate": [0.88, 0.94]},
	"work": {"max": 0.38, "rate": [0.92, 1.04]},
	"metal": {"max": 0.50, "rate": [0.70, 0.90]},
	"ui": {"max": 0.62, "rate": [1.0, 1.0]},
	"report": {"max": 0.55, "rate": [1.0, 1.0]},
}

var _streams: Dictionary = {}
var _variants: Dictionary = {}
var _volume := 0.8
var _on := true
var _cooldown: Dictionary = {}
var _listener_pos := Vector2.ZERO
var _music: AudioStreamPlayer = null
var _music_volume := 0.35


## 背景音乐音量走和 2.5D 同一条感知曲线（pow(v, 0.7)）。
func _music_gain() -> float:
	return minf(1.0, pow(maxf(0.0, _music_volume), 0.7))


func play_music() -> void:
	if _music == null:
		if not ResourceLoader.exists(MUSIC_PATH):
			return
		_music = AudioStreamPlayer.new()
		_music.stream = load(MUSIC_PATH)
		_music.bus = "Master"
		## ogg 的循环由导入参数决定（`music-bgm.ogg.import` 的 `loop=true`）。
		add_child(_music)
	set_music_volume(_music_volume)
	if _music != null and not _music.playing:
		_music.play()


func set_music_volume(v: float) -> void:
	_music_volume = clampf(v, 0.0, 1.0)
	if _music == null:
		return
	_music.volume_db = linear_to_db(maxf(0.001, _music_gain()))
	if _music_volume <= 0.001:
		_music.stop()
	elif not _music.playing:
		_music.play()


func music_state() -> Dictionary:
	var st := {"file": ResourceLoader.exists(MUSIC_PATH),
		"playing": _music != null and _music.playing,
		"volume": _music_volume, "gain": _music_gain(), "len": 0.0}
	if _music != null and _music.stream != null:
		st["len"] = _music.stream.get_length()
	return st


func music_loop_param() -> String:
	var f := FileAccess.open("res://assets/audio/music-bgm.ogg.import", FileAccess.READ)
	if f == null:
		return "无 .import"
	for line in f.get_as_text().split("\n"):
		if String(line).begins_with("loop="):
			return String(line).trim_prefix("loop=")
	return "未声明"


func setup() -> void:
	_streams.clear()
	_variants.clear()
	for kind: String in MAP.keys():
		var p := DIR + String(MAP[kind]) + ".ogg"
		if ResourceLoader.exists(p):
			_streams[kind] = load(p)
	for kind: String in VARIANTS.keys():
		var arr: Array = []
		for sample: String in VARIANTS[kind]:
			var p := DIR + sample + ".ogg"
			if ResourceLoader.exists(p):
				arr.append(load(p))
		if not arr.is_empty():
			_variants[kind] = arr
	set_process(false)


func set_volume(v: float) -> void:
	_volume = clampf(v, 0.0, 1.0)


func set_on(on: bool) -> void:
	_on = on
	if not _on:
		for child in get_children():
			if child is AudioStreamPlayer and child != _music:
				(child as AudioStreamPlayer).stop()


func is_on() -> bool:
	return _on


func set_listener(pos: Vector2) -> void:
	_listener_pos = pos


## 2.5D SND.volAt：距离 0 → 1.0，≥18 格 → 0.14，中间线性。
func vol_at(pos: Vector2, scale: float = 1.0) -> float:
	var d := _listener_pos.distance_to(pos)
	var t := clampf(d / DIST_RANGE, 0.0, 1.0)
	var v := DIST_MAX + (DIST_MIN - DIST_MAX) * t
	return clampf(v, DIST_MIN, DIST_MAX) * clampf(scale, 0.0, 1.0)


func has_kind(kind: String) -> bool:
	return _streams.has(kind) or _variants.has(kind)


func play(kind: String, volume_scale: float = 1.0, pos: Variant = null) -> bool:
	if not _on or _volume <= 0.0:
		return false
	var stream: AudioStream = null
	if _variants.has(kind):
		var arr: Array = _variants[kind]
		stream = arr[randi() % arr.size()] as AudioStream
	elif _streams.has(kind):
		stream = _streams[kind] as AudioStream
	if stream == null:
		return false

	var v := clampf(volume_scale, 0.0, 1.0)
	if pos is Vector2:
		var pv: Vector2 = pos
		v = vol_at(pv, volume_scale)
	var tone: Dictionary = TONE.get(kind, {})
	if tone.has("max"):
		v = minf(v, float(tone["max"]))
	v = clampf(v, 0.0, 1.0)

	# 同一种音效 0.12s 内不重复；step/scream 允许连续（脚步/多人同时喊）。
	if kind != "step" and kind != "scream":
		var now := Time.get_ticks_msec()
		if now - int(_cooldown.get(kind, 0)) < 120:
			return false
		_cooldown[kind] = now

	var p := AudioStreamPlayer.new()
	p.stream = stream
	p.bus = "Master"
	p.volume_db = linear_to_db(maxf(0.001, v * _volume))
	var rate: Array = tone.get("rate", [1.0, 1.0])
	p.pitch_scale = randf_range(float(rate[0]), float(rate[1]))
	add_child(p)
	p.finished.connect(func() -> void: p.queue_free())
	p.play()
	return true


func play_at(kind: String, pos: Vector2, volume_scale: float = 1.0) -> bool:
	return play(kind, volume_scale, pos)
