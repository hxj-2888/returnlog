extends RefCounted
## 程序合成战斗音效层：内存生成 AudioStreamWAV，补足外部采样缺失的胸腔重击、
## 命中确认、弹壳落甲板、电流破坏、挥空风声与拖行摩擦音效。

const RATE := 22050


static func build_all() -> Dictionary:
	return {
		"sub_punch": _make_sub_punch(),
		"hit_confirm": _make_hit_confirm(),
		"shell_casing": _make_shell_casing(),
		"mech_spark": _make_mech_spark(),
		"whoosh_air": _make_whoosh_air(),
		"drag_scrape": _make_drag_scrape(),
	}


static func _pack(samples: PackedFloat32Array) -> AudioStreamWAV:
	var pcm := PackedByteArray()
	pcm.resize(samples.size() * 2)
	for i in samples.size():
		var v := clampi(int(round(samples[i] * 32767.0)), -32768, 32767)
		pcm.encode_s16(i * 2, v)
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = RATE
	wav.stereo = false
	wav.data = pcm
	return wav


static func _make_sub_punch() -> AudioStreamWAV:
	var n := int(RATE * 0.18)
	var s := PackedFloat32Array()
	s.resize(n)
	var phase := 0.0
	for i in n:
		var t := float(i) / float(RATE)
		var freq := lerpf(118.0, 36.0, minf(1.0, t / 0.11))
		phase += TAU * freq / float(RATE)
		var env := exp(-t * 21.0) * minf(1.0, t / 0.004)
		var click := (randf() * 2.0 - 1.0) * exp(-t * 110.0) * 0.35
		s[i] = clampf(sin(phase) * env * 0.92 + click, -1.0, 1.0)
	return _pack(s)


static func _make_hit_confirm() -> AudioStreamWAV:
	var n := int(RATE * 0.11)
	var s := PackedFloat32Array()
	s.resize(n)
	for i in n:
		var t := float(i) / float(RATE)
		var env := exp(-t * 42.0) * minf(1.0, t / 0.002)
		var tone := sin(TAU * 1520.0 * t) * 0.55 + sin(TAU * 2380.0 * t) * 0.40
		var snap := (randf() * 2.0 - 1.0) * exp(-t * 140.0) * 0.25
		s[i] = clampf((tone * env + snap) * 0.80, -1.0, 1.0)
	return _pack(s)


static func _make_shell_casing() -> AudioStreamWAV:
	var n := int(RATE * 0.28)
	var s := PackedFloat32Array()
	s.resize(n)
	var bounces := [0.0, 0.105, 0.19]
	var amps := [0.70, 0.42, 0.20]
	for i in n:
		var t := float(i) / float(RATE)
		var sum := 0.0
		for bi in bounces.size():
			var dt := t - float(bounces[bi])
			if dt < 0.0:
				continue
			var env := exp(-dt * 52.0) * float(amps[bi])
			var ping := sin(TAU * 3720.0 * dt) * 0.5 + sin(TAU * 5240.0 * dt) * 0.35 + sin(TAU * 6980.0 * dt) * 0.20
			sum += ping * env
		s[i] = clampf(sum, -1.0, 1.0)
	return _pack(s)


static func _make_mech_spark() -> AudioStreamWAV:
	var n := int(RATE * 0.26)
	var s := PackedFloat32Array()
	s.resize(n)
	var hold := 0.0
	for i in n:
		var t := float(i) / float(RATE)
		var env := exp(-t * 11.5) * minf(1.0, t / 0.003)
		if i % 9 == 0:
			hold = randf() * 2.0 - 1.0
		var zap := sin(TAU * (175.0 + 320.0 * exp(-t * 18.0)) * t) * 0.40
		var crackle := hold * (0.85 if randf() < 0.45 else 0.25)
		s[i] = clampf((zap + crackle * 0.72) * env, -1.0, 1.0)
	return _pack(s)


static func _make_whoosh_air() -> AudioStreamWAV:
	var n := int(RATE * 0.20)
	var s := PackedFloat32Array()
	s.resize(n)
	var lp := 0.0
	var prev := 0.0
	for i in n:
		var t := float(i) / float(RATE)
		var u := t / 0.20
		var env := pow(sin(PI * clampf(u, 0.0, 1.0)), 1.4)
		var white := randf() * 2.0 - 1.0
		var alpha := lerpf(0.28, 0.08, u)
		lp = lp + alpha * (white - lp)
		var bp := lp - prev * 0.65
		prev = lp
		s[i] = clampf(bp * env * 1.35, -1.0, 1.0)
	return _pack(s)


static func _make_drag_scrape() -> AudioStreamWAV:
	var n := int(RATE * 0.30)
	var s := PackedFloat32Array()
	s.resize(n)
	var lp := 0.0
	for i in n:
		var t := float(i) / float(RATE)
		var u := t / 0.30
		var env := sin(PI * clampf(u, 0.0, 1.0)) * exp(-t * 2.5)
		var white := randf() * 2.0 - 1.0
		lp = lp + 0.09 * (white - lp)
		var rumble := sin(TAU * 62.0 * t) * 0.25
		s[i] = clampf((lp * 1.4 + rumble) * env, -1.0, 1.0)
	return _pack(s)
