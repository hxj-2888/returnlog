extends Node
## 3D 音效层：复用 2.5D `audio/*.ogg`（CC0，见 audio/CREDITS.md）。
## 由 sim 的事件流驱动，不自己判定规则；音量来自设置面板（AudioServer 总线 + 本机持久化）。
##
## 只做事件 → 采样的一层薄映射。2.5D 的 SND.volAt 按距离衰减在 3D 里换成
## 简单的线性音量（预演阶段不做 3D 空间音频），不引入新的数值口径。

const DIR := "res://assets/audio/"

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
