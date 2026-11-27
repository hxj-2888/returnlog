extends Node
## 3D 音效层：复用 2.5D `audio/*.ogg` 并融合 `AudioSynth` 程序合成音效。
## 空间音效在 4.0m 内满音量、4.0m..22.0m 平滑平方衰减、超过 22.0m 归零跳过；
## 并通过固定大小的 2D/3D 播放器对象池循环复用，避免高频增删节点。

const AudioSynth := preload("res://scripts/audio_synth.gd")

const DIR := "res://assets/audio/"
const MUSIC_PATH := "res://assets/audio/music-bgm.ogg"
const DIST_NEAR := 4.0
const DIST_RANGE := 22.0
const DIST_MIN := 0.0
const DIST_MAX := 1.0
const DOOR_NEAR_RANGE := 8.0
const POOL_2D_SIZE := 12
const POOL_3D_SIZE := 20

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
	"step": [
		"sfx-step-deck-01", "sfx-step-deck-02", "sfx-step-deck-03",
		"sfx-step-deck-04", "sfx-step-deck-05",
	],
	"scream": ["sfx-scream-01", "sfx-scream-02"],
}
const STEP_FALLBACK := ["sfx-step-01", "sfx-step-02"]

const TONE := {
	"knife": {"max": 0.62, "rate": [0.90, 1.02]},
	"shoot": {"max": 0.76, "rate": [0.95, 1.02]},
	"scream": {"max": 0.52, "rate": [0.94, 1.02]},
	"step": {"max": 0.42, "rate": [0.92, 1.10]},
	"flesh": {"max": 0.44, "rate": [0.90, 1.02]},
	"door": {"max": 0.34, "rate": [0.88, 0.94]},
	"work": {"max": 0.38, "rate": [0.92, 1.04]},
	"metal": {"max": 0.50, "rate": [0.75, 0.95]},
	"ui": {"max": 0.62, "rate": [1.0, 1.0]},
	"report": {"max": 0.55, "rate": [1.0, 1.0]},
	"sub_punch": {"max": 0.72, "rate": [0.92, 1.04]},
	"hit_confirm": {"max": 0.58, "rate": [0.98, 1.05]},
	"shell_casing": {"max": 0.40, "rate": [0.92, 1.12]},
	"mech_spark": {"max": 0.58, "rate": [0.88, 1.14]},
	"whoosh_air": {"max": 0.48, "rate": [0.92, 1.08]},
	"drag_scrape": {"max": 0.42, "rate": [0.90, 1.05]},
}

var _streams: Dictionary = {}
var _variants: Dictionary = {}
var _volume := 0.8
var _on := true
var _cooldown: Dictionary = {}
var _listener_pos := Vector2.ZERO
var _music: AudioStreamPlayer = null
var _music_volume := 0.35
var _pool_2d: Array[AudioStreamPlayer] = []
var _pool_3d: Array[AudioStreamPlayer3D] = []
var _pool_2d_cursor := 0
var _pool_3d_cursor := 0


func _music_gain() -> float:
	return minf(1.0, pow(maxf(0.0, _music_volume), 0.7))


func play_music() -> void:
	if _music == null:
		if not ResourceLoader.exists(MUSIC_PATH):
			return
		_music = AudioStreamPlayer.new()
		_music.stream = load(MUSIC_PATH)
		_music.bus = "Master"
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
		if arr.is_empty() and kind == "step":
			for fb: String in STEP_FALLBACK:
				var fp := DIR + fb + ".ogg"
				if ResourceLoader.exists(fp):
					arr.append(load(fp))
		if not arr.is_empty():
			_variants[kind] = arr
	var synth: Dictionary = AudioSynth.build_all()
	for sk: String in synth.keys():
		_streams[sk] = synth[sk]
	# 修复语义塌缩：拖尸改为低频摩擦声，破坏改用高压电弧劈啪声
	if synth.has("drag_scrape"):
		_streams["drag_start"] = synth["drag_scrape"]
		_streams["drag_end"] = synth["drag_scrape"]
	if synth.has("mech_spark"):
		_streams["sabotage"] = synth["mech_spark"]
	_ensure_pools()
	set_process(false)


## 预创建固定大小的 2D / 3D 播放器对象池，消除高频增删节点的开销。
func _ensure_pools() -> void:
	if _pool_2d.is_empty():
		for _i in POOL_2D_SIZE:
			var p := AudioStreamPlayer.new()
			p.bus = "Master"
			add_child(p)
			_pool_2d.append(p)
	if _pool_3d.is_empty():
		for _i in POOL_3D_SIZE:
			var p3 := AudioStreamPlayer3D.new()
			p3.bus = "Master"
			p3.attenuation_model = AudioStreamPlayer3D.ATTENUATION_DISABLED
			add_child(p3)
			_pool_3d.append(p3)


func _acquire_2d() -> AudioStreamPlayer:
	_ensure_pools()
	for offset in _pool_2d.size():
		var idx := (_pool_2d_cursor + offset) % _pool_2d.size()
		var p := _pool_2d[idx]
		if not p.playing:
			_pool_2d_cursor = (idx + 1) % _pool_2d.size()
			return p
	var evicted := _pool_2d[_pool_2d_cursor]
	evicted.stop()
	_pool_2d_cursor = (_pool_2d_cursor + 1) % _pool_2d.size()
	return evicted


func _acquire_3d() -> AudioStreamPlayer3D:
	_ensure_pools()
	for offset in _pool_3d.size():
		var idx := (_pool_3d_cursor + offset) % _pool_3d.size()
		var p3 := _pool_3d[idx]
		if not p3.playing:
			_pool_3d_cursor = (idx + 1) % _pool_3d.size()
			return p3
	var evicted := _pool_3d[_pool_3d_cursor]
	evicted.stop()
	_pool_3d_cursor = (_pool_3d_cursor + 1) % _pool_3d.size()
	return evicted


func set_volume(v: float) -> void:
	_volume = clampf(v, 0.0, 1.0)


func set_on(on: bool) -> void:
	_on = on
	if not _on:
		for child in get_children():
			if child != _music:
				if child is AudioStreamPlayer:
					(child as AudioStreamPlayer).stop()
				elif child is AudioStreamPlayer3D:
					(child as AudioStreamPlayer3D).stop()


func is_on() -> bool:
	return _on


func set_listener(pos: Vector2) -> void:
	_listener_pos = pos


## 空间距离衰减：4.0m 内满音量，4.0m..22.0m 平滑平方衰减，超过 22.0m 直接归零。
func vol_at(pos: Vector2, scale: float = 1.0) -> float:
	var d := _listener_pos.distance_to(pos)
	if d >= DIST_RANGE:
		return DIST_MIN
	var sc := clampf(scale, 0.0, 1.0)
	if d <= DIST_NEAR:
		return DIST_MAX * sc
	var t := clampf((d - DIST_NEAR) / (DIST_RANGE - DIST_NEAR), 0.0, 1.0)
	var atten := (1.0 - t) * (1.0 - t)
	return atten * sc


func has_kind(kind: String) -> bool:
	return _streams.has(kind) or _variants.has(kind)


func play(kind: String, volume_scale: float = 1.0, pos: Variant = null, pitch_mul: float = 1.0) -> bool:
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
	var has_pos := pos is Vector2
	var is_spatial := false
	var pv := Vector2.ZERO
	var dist := 0.0
	if has_pos:
		pv = pos as Vector2
		dist = pv.distance_to(_listener_pos)
		v = vol_at(pv, volume_scale)
		if v <= 0.001:
			return false
		is_spatial = dist > 0.25
	var tone: Dictionary = TONE.get(kind, {})
	if tone.has("max"):
		v = minf(v, float(tone["max"]))
	v = clampf(v, 0.0, 1.0)
	if v <= 0.001:
		return false

	if kind != "step" and kind != "scream":
		var cd_key := kind
		# 门声按近/远分槽冷却，确保 < 8m 近处门声不被远处门声抢占
		if kind == "door" and has_pos:
			cd_key = "door_near" if dist < DOOR_NEAR_RANGE else "door_far"
		var now := Time.get_ticks_msec()
		if now - int(_cooldown.get(cd_key, 0)) < 120:
			return false
		_cooldown[cd_key] = now

	var db := linear_to_db(maxf(0.001, v * _volume))
	var rate: Array = tone.get("rate", [1.0, 1.0])
	var pitch := randf_range(float(rate[0]), float(rate[1])) * pitch_mul

	if is_spatial:
		var p3 := _acquire_3d()
		p3.stream = stream
		p3.volume_db = db
		p3.pitch_scale = pitch
		p3.position = Vector3(pv.x, 1.1, pv.y)
		p3.play()
		return true

	var p := _acquire_2d()
	p.stream = stream
	p.volume_db = db
	p.pitch_scale = pitch
	p.play()
	return true


func play_at(kind: String, pos: Vector2, volume_scale: float = 1.0) -> bool:
	return play(kind, volume_scale, pos)


## 舱面脚步声：左右脚轻微错开音高，增强真实行走节奏感。
func play_step(pos: Variant = null, volume_scale: float = 0.72, is_left: bool = false) -> bool:
	var pitch_mul: float = 0.96 if is_left else 1.04
	return play("step", volume_scale, pos, pitch_mul)


func play_delayed(kind: String, delay_sec: float, volume_scale: float = 1.0, pos: Variant = null) -> void:
	if not _on or _volume <= 0.0:
		return
	var tree := get_tree()
	if tree == null:
		return
	tree.create_timer(delay_sec, false).timeout.connect(func() -> void:
		if is_inside_tree():
			play(kind, volume_scale, pos))
