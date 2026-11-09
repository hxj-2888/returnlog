extends Node
## 3D 音效层：复用 2.5D `audio/*.ogg`（CC0，见 audio/CREDITS.md）。
## 由 sim 的事件流驱动，不自己判定规则；音量来自设置面板（AudioServer 总线 + 本机持久化）。
##
## 只做事件 → 采样的一层薄映射。2.5D 的 SND.volAt 按距离衰减在 3D 里换成
## 简单的线性音量（预演阶段不做 3D 空间音频），不引入新的数值口径。
##
## 背景音乐：Godot 不解码 m4a/AAC，所以 `audio/music-bgm.m4a`（用户自有录音）
## 由 ffmpeg 本地转成 `assets/audio/music-bgm.ogg` 再用，见 audio/CREDITS.md。

const DIR := "res://assets/audio/"
const MUSIC_PATH := "res://assets/audio/music-bgm.ogg"

const MAP := {
	"knife": "sfx-knife-01", "shoot": "sfx-gun", "kill": "sfx-death",
	"revive": "sfx-ui", "sabotage": "sfx-metal", "fix": "sfx-submit",
	"task": "sfx-submit", "qual": "sfx-submit", "supply": "sfx-submit",
	"report": "sfx-notify", "meeting": "sfx-notify",
	"vote": "sfx-vote", "vote_change": "sfx-click", "eject": "sfx-vote",
	"drag_start": "sfx-step-01", "drag_end": "sfx-step-02",
	"search": "sfx-click", "bot_hit": "sfx-metal", "bot_down": "sfx-metal",
	"breaker": "sfx-door", "pipe": "sfx-door", "detain": "sfx-notify",
	"chat": "sfx-click", "game_end": "sfx-lose",
}

var _streams: Dictionary = {}
var _volume := 0.8
var _cooldown: Dictionary = {}
var _music: AudioStreamPlayer = null
var _music_volume := 0.35


## 背景音乐音量走和 2.5D 同一条感知曲线（pow(v, 0.7)）：
## 线性 0.35 在满档音效旁边等于 −12dB，听不响不是 bug 是量纲。
func _music_gain() -> float:
	return minf(1.0, pow(maxf(0.0, _music_volume), 0.7))


func play_music() -> void:
	if _music == null:
		if not ResourceLoader.exists(MUSIC_PATH):
			return
		_music = AudioStreamPlayer.new()
		_music.stream = load(MUSIC_PATH)
		_music.bus = "Master"
		## 循环不在这里设：Godot 4.6 的 AudioStreamOggVorbis 没有 loop_mode，
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


## 循环开关读导入参数（ogg 的循环是导入期决定的，运行时没有 loop_mode 可查）。
func music_loop_param() -> String:
	var f := FileAccess.open("res://assets/audio/music-bgm.ogg.import", FileAccess.READ)
	if f == null:
		return "无 .import"
	for line in f.get_as_text().split("\n"):
		if String(line).begins_with("loop="):
			return String(line).trim_prefix("loop=")
	return "未声明"


func setup() -> void:
	for kind: String in MAP.keys():
		var p := DIR + String(MAP[kind]) + ".ogg"
		if ResourceLoader.exists(p):
			_streams[kind] = load(p)
	# 同名采样复用一个播放器池，避免每帧 new 一堆节点
	set_process(false)


func set_volume(v: float) -> void:
	_volume = clampf(v, 0.0, 1.0)


func play(kind: String) -> void:
	if _volume <= 0.0 or not _streams.has(kind):
		return
	# 同一种音效 0.12 秒内不重复触发（会议里连续 chat 会叠成噪音）
	var now := Time.get_ticks_msec()
	if now - int(_cooldown.get(kind, 0)) < 120:
		return
	_cooldown[kind] = now
	var p := AudioStreamPlayer.new()
	p.stream = _streams[kind]
	p.bus = "Master"
	p.volume_db = linear_to_db(maxf(0.001, _volume))
	add_child(p)
	p.finished.connect(func() -> void: p.queue_free())
	p.play()
