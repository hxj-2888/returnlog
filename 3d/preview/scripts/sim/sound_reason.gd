extends RefCounted
## 开枪听觉 / 目击信任推理（2.5D `js/t2/ai.js` 逐函数移植，2026-11-15 同步批）。
## 从 mind.gd 拆出：三个函数都是「输入 → 输出」的纯推理，通过传入的 mind 实例复用
## rule() / ev_now() / _push_why() / sus_add()，避免心智层突破行数棘轮。
## 数值一律读 rules.json（SOUND / CRED.gains），GDScript 不抄表。


## @src js/t2/ai.js:559-578 soundSubject(a,x,y)
## 听觉受体：只在听者自己的位置时间线里找 8 秒 / 4 格内最近出现过的人；
## 不读开枪者真值、不读死者阵营，找不到返回 -1（只留噪声 / 去现场看）。
## 3D 容器差异（allowed_differences #5）：2.5D 读 a.mind.mem 的 saw_agent，
## 3D 读 a.why[actor] 的同名记录（mind.note_track 写入，kind/x/y/night/t 同源）。
static func sound_subject(mind, a: Dictionary, x: float, y: float) -> int:
	var sim = mind.sim
	if a.is_empty() or sim == null:
		return -1
	var now: float = mind.ev_now()
	var age: float = mind.rule("SOUND", "suspectAge", 8.0)
	var rad: float = mind.rule("SOUND", "suspectRadius", 4.0)
	var best := -1
	var bd := INF
	var why: Dictionary = a.get("why", {}) as Dictionary
	for k: Variant in why.keys():
		var ti := int(k)
		for rec: Dictionary in (why[k] as Array):
			if String(rec.get("kind", "")) != "saw_agent":
				continue
			if rec.has("night") and int(rec["night"]) != int(sim.night):
				continue
			if rec.has("t") and now - float(rec["t"]) > age:
				continue
			var d := Vector2(float(rec.get("x", 0.0)), float(rec.get("y", 0.0))) \
				.distance_to(Vector2(x, y))
			if d > rad or d >= bd:
				continue
			var t: Dictionary = sim.agent(ti)
			if t.is_empty() or ti == int(a.get("i", -1)) \
					or not bool(t.get("alive", false)) or bool(t.get("downed", false)) \
					or bool(t.get("detained", false)):
				continue
			bd = d
			best = ti
	return best


## @src js/t2/ai.js:582-588 playerHeard(a,tgt,room,by,x,y,w)
## 玩家「我听见枪声」：给人类听众一条弱听觉；有对象才加弱嫌疑，无对象只留方位。
static func player_heard(mind, a: Dictionary, tgt: int, room: String, by: Variant,
		x: float, y: float, w: float) -> void:
	var sim = mind.sim
	if a.is_empty() or bool(a.get("alien", false)) or sim == null:
		return
	var ev := {"kind": "heard_shot", "x": x, "y": y, "room": room,
		"conf": 0.4, "src": "speech", "subj": tgt, "by": by,
		"night": int(sim.night), "t": snappedf(sim.elapsed, 0.01)}
	if tgt >= 0:
		mind._push_why(a, tgt, ev)
		if w > 0.0:
			mind.sus_add(a, tgt, w, "heard_shot", ev)


## @src js/t2/ai.js:590-596 shotCred(w,actor,victim)
## 目击开枪的信任增量：动作本身弱正；已确知命中异形再加；已确知命中人类才减。
## 数值只读 rules.json#tables.SKSanity.CRED.gains，不在 GDScript 抄表。
static func shot_cred(mind, w: Dictionary, actor: Dictionary, victim: Dictionary) -> Array:
	var sim = mind.sim
	if w.is_empty() or actor.is_empty() or victim.is_empty() or sim == null:
		return []
	var gains: Dictionary = sim.rules.v("CRED", "gains", {}) as Dictionary
	var out: Array = [{"w": float(gains.get("shotAct", 0.0)), "reason": "shotAct"}]
	var known: Dictionary = w.get("known", {}) as Dictionary
	var known_human: Dictionary = w.get("knownHuman", {}) as Dictionary
	var vi := int(victim.get("i", -1))
	if known.has(vi):
		out.append({"w": float(gains.get("shotAlien", 0.0)), "reason": "shotAlien"})
	elif known_human.has(vi):
		out.append({"w": float(gains.get("shotHuman", 0.0)), "reason": "shotHuman"})
	return out
