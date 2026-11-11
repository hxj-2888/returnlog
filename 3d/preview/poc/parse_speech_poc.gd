extends SceneTree
## parseSpeech 差分 POC 的 Godot 端：读 fixtures，跑当前 lines_data.parse_speech，
## 逐条与 2.5D 期望槽位比对。只读运行时数据，不改任何游戏状态。
##
## 运行：
##   Godot --headless --path 3d/preview --script res://poc/parse_speech_poc.gd

class FakeSim:
	var agents: Array = []
	var me_idx: int = 0


func _initialize() -> void:
	var ld_script: GDScript = load("res://scripts/sim/lines_data.gd")
	if ld_script == null:
		print("POC FAIL 找不到 lines_data.gd")
		quit(1)
		return
	var lines = ld_script.new()
	if not lines.setup():
		print("POC FAIL lines.json 加载失败")
		quit(1)
		return
	var gen_script: GDScript = load("res://poc/generated_parse_speech.gd")
	if gen_script == null:
		print("POC FAIL 找不到 generated_parse_speech.gd（先跑 node 3d/tools/poc-gen-parse-speech.cjs）")
		quit(1)
		return
	var generated = gen_script.new()
	var f := FileAccess.open("res://poc/parse-speech-fixtures.json", FileAccess.READ)
	if f == null:
		print("POC FAIL 找不到 fixtures")
		quit(1)
		return
	var payload: Variant = JSON.parse_string(f.get_as_text())
	if not (payload is Dictionary):
		print("POC FAIL fixtures 解析失败")
		quit(1)
		return
	var sim := FakeSim.new()
	sim.me_idx = int(payload.get("me_idx", 0))
	for a: Dictionary in payload.get("agents", []) as Array:
		sim.agents.append({
			"i": int(a.get("i", -1)),
			"name": String(a.get("name", "")),
			"alive": bool(a.get("alive", true)),
			"downed": bool(a.get("downed", false)),
		})
	var pass_n := 0
	var fail_n := 0
	var gen_pass := 0
	var gen_fail := 0
	var shown := 0
	var gen_shown := 0
	for c: Dictionary in payload.get("cases", []) as Array:
		var text := String(c.get("text", ""))
		var expected: Dictionary = _norm(c.get("expected", {}) as Dictionary)
		var got: Dictionary = _norm(lines.parse_speech(text, sim))
		if got == expected:
			pass_n += 1
		else:
			fail_n += 1
			if shown < 20:
				shown += 1
				print("POC MISMATCH [%s] text=%s" % [String(c.get("label", "")), text])
				print("  expected=%s" % JSON.stringify(expected))
				print("  got     =%s" % JSON.stringify(got))
		var gen_got: Dictionary = _norm(generated.parse_speech(text, sim))
		if gen_got == expected:
			gen_pass += 1
		else:
			gen_fail += 1
			if gen_shown < 20:
				gen_shown += 1
				print("POC GEN MISMATCH [%s] text=%s" % [String(c.get("label", "")), text])
				print("  expected=%s" % JSON.stringify(expected))
				print("  got     =%s" % JSON.stringify(gen_got))
	print("POC RESULT runtime=%d/%d generated=%d/%d total=%d" % [
		pass_n, pass_n + fail_n, gen_pass, gen_pass + gen_fail, pass_n + fail_n])
	quit(0 if fail_n == 0 and gen_fail == 0 else 1)


func _norm(o: Dictionary) -> Dictionary:
	var claim: Dictionary = o.get("claim", {}) as Dictionary
	var claim_out: Dictionary = {}
	if not claim.is_empty():
		claim_out = {
			"target": int(claim.get("target", -1)),
			"kind": String(claim.get("kind", "")),
			"room": String(claim.get("room", "")),
		}
	var people: Array = []
	for p in (o.get("people", []) as Array):
		people.append(int(p))
	return {
		"raw": String(o.get("raw", "")),
		"rooms": (o.get("rooms", []) as Array).duplicate(),
		"people": people,
		"accuse": int(o.get("accuse", -1)),
		"vote": int(o.get("vote", -1)),
		"deny": bool(o.get("deny", false)),
		"where": String(o.get("where", "")),
		"when": String(o.get("when", "")),
		"claim": claim_out,
		"support": int(o.get("support", -1)),
	}
