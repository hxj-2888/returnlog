extends RefCounted
## AI 认知层 —— 身份先验、T/E 双轴读写、性格系数、准-确证与跨夜衰减。
## 从 `mind.gd` 拆出，纯静态工具集，不持有状态；所有阈值仍从 `m.rule` / `rules.json` 读取。


static func id_evidence(m) -> Dictionary:
	if m.sim != null and m.sim.rules != null:
		return m.sim.rules.constant("ID_EVIDENCE") as Dictionary
	return {}


static func identity_cfg(m) -> Dictionary:
	if m.sim != null and m.sim.rules != null:
		var c: Variant = m.sim.rules.constant("IDENTITY")
		if c is Dictionary:
			return c
	return {}


static func has_id_evidence(m, entry: Dictionary) -> bool:
	var id_ev: Dictionary = id_evidence(m)
	for k: Variant in (entry.get("kinds", []) as Array):
		if id_ev.has(String(k)):
			return true
	return false


static func identity_prior(m, a: Dictionary) -> float:
	if a.is_empty() or m.sim == null:
		return 0.5
	var alive_others := 0
	for x: Dictionary in m.sim.agents:
		if x != a and bool(x.get("alive", false)):
			alive_others += 1
	if alive_others <= 0:
		return 0.5
	var cfg: Dictionary = identity_cfg(m)
	var roles: Dictionary = m.sim.cfg.get("roles", {}) as Dictionary
	var total := int(roles.get("agents", 15))
	var alien_total := int(roles.get("aliens", 4))
	var humans_total := total - alien_total
	var alien_self := bool(a.get("alien", false))
	var h0 := humans_total if alien_self else humans_total - 1
	var a0 := alien_total - 1 if alien_self else alien_total
	var kn: Dictionary = {}
	if alien_self:
		kn = (a.get("mates", {}) as Dictionary)
	else:
		kn = (a.get("known", {}) as Dictionary)
	var known_a := 0
	var known_dead_a := 0
	for k: int in kn.keys():
		var x: Dictionary = m.sim.agent(k)
		if x.is_empty() or x == a:
			continue
		if bool(x.get("alive", false)):
			known_a += 1
		elif String(x.get("deathCause", "")) != "vote":
			known_dead_a += 1
	var hx := 0
	var ax := 0
	var unknown := 0
	for x2: Dictionary in m.sim.agents:
		if x2 == a or bool(x2.get("alive", false)):
			continue
		if String(x2.get("deathCause", "")) == "vote":
			if bool(x2.get("alien", false)):
				ax += 1
			else:
				hx += 1
		elif not kn.has(int(x2.get("i", -1))):
			unknown += 1
	var H := maxf(0.0, float(h0 - hx))
	var A := maxf(0.0, float(a0 - ax - known_a - known_dead_a))
	var denom := maxf(1e-6, H + A)
	var h_alive := maxf(0.0, H - float(unknown) * H / denom)
	var pool := maxf(1.0, float(alive_others - known_a))
	return clampf(h_alive / pool,
		float(cfg.get("priorMin", 0.02)), float(cfg.get("priorMax", 0.98)))


static func current_prior(m) -> float:
	if m.sim == null or m.sim.rules == null:
		return 100.0 * (10.0 / 13.0)
	var pool: float = m.rule("AXIS", "priorPool", 100.0)
	var alive_h := 0
	var alive_all := 0
	for x: Dictionary in m.sim.agents:
		if bool(x.get("alive", false)):
			alive_all += 1
			if not bool(x.get("alien", false)):
				alive_h += 1
	if alive_all <= 0:
		return pool * (10.0 / 13.0)
	return pool * (float(alive_h) / float(alive_all))


static func trust_raw(m, a: Dictionary, ti: int) -> float:
	if a.is_empty() or ti < 0 or ti == int(a.get("i", -1)):
		return 0.0
	var tmap: Dictionary = a.get("T", {}) as Dictionary
	if tmap.has(ti):
		return float(tmap[ti])
	if (a.get("known", {}) as Dictionary).has(ti):
		return m.rule("AXIS", "certAlien", -999.0)
	if not bool(a.get("alien", false)) and (a.get("knownHuman", {}) as Dictionary).has(ti):
		return m.rule("AXIS", "certHuman", 999.0)
	if bool(a.get("alien", false)) and (a.get("mates", {}) as Dictionary).has(ti):
		return m.rule("AXIS", "certHuman", 999.0)
	return current_prior(m)


static func eff_t(m, a: Dictionary, ti: int) -> float:
	var emap: Dictionary = a.get("E", {}) as Dictionary
	return trust_raw(m, a, ti) + float(emap.get(ti, 0.0))


static func belief_of(m, a: Dictionary, ti: int, for_night: bool = false) -> float:
	var cap: float = maxf(1.0, float(m.rule("AXIS", "cap", 200.0)))
	var s := clampf((current_prior(m) - eff_t(m, a, ti)) / cap, 0.0, 1.0)
	if for_night and s > 0.0 and m.sim != null:
		var sn: Dictionary = a.get("susNight", {}) as Dictionary
		if int(sn.get(ti, 0)) < int(m.sim.night):
			s *= float(m.rule("CARRY", "nightReadSec", 0.72))
	return s


static func cred_raw(m, a: Dictionary, ti: int) -> float:
	var cap: float = m.rule("AXIS", "cap", 200.0)
	return clampf(trust_raw(m, a, ti) - current_prior(m), -cap, cap)


static func axis_add_t(m, a: Dictionary, ti: int, w: float) -> float:
	if a.is_empty() or ti < 0 or ti == int(a.get("i", -1)) or w == 0.0:
		return 0.0
	var tmap: Dictionary = (a.get("T", {}) as Dictionary).duplicate()
	var old: float = float(tmap[ti]) if tmap.has(ti) else current_prior(m)
	var ecap: float = m.rule("AXIS", "eventCap", 200.0)
	var floor_v: float = m.rule("AXIS", "floor", -999.0)
	var cap_v: float = m.rule("AXIS", "cap", 200.0)
	var wc := clampf(w, -ecap, ecap)
	var nv := clampf(old + wc, floor_v, cap_v)
	tmap[ti] = 0.0 if absf(nv) < 0.001 else snappedf(nv, 0.1)
	a["T"] = tmap
	if w < 0.0 and m.sim != null:
		var cnn: Dictionary = (a.get("certNegNight", {}) as Dictionary).duplicate()
		cnn[ti] = int(m.sim.night)
		a["certNegNight"] = cnn
		var cd: Dictionary = (a.get("certDirty", {}) as Dictionary).duplicate()
		cd[ti] = false
		a["certDirty"] = cd
	return float(tmap[ti])


static func trust_cert(m, a: Dictionary, ti: int, is_alien: bool) -> void:
	if a.is_empty() or ti < 0 or ti == int(a.get("i", -1)):
		return
	var tmap: Dictionary = (a.get("T", {}) as Dictionary).duplicate()
	tmap[ti] = m.rule("AXIS", "certAlien", -999.0) if is_alien else m.rule("AXIS", "certHuman", 999.0)
	a["T"] = tmap
	if m.sim != null:
		var cnn: Dictionary = (a.get("certNegNight", {}) as Dictionary).duplicate()
		cnn[ti] = int(m.sim.night)
		a["certNegNight"] = cnn
		var cd: Dictionary = (a.get("certDirty", {}) as Dictionary).duplicate()
		cd[ti] = true
		a["certDirty"] = cd


static func budget_t(m, a: Dictionary, ti: int, delta: float, reason: String = "") -> float:
	if m.sim == null or delta == 0.0:
		return delta
	var ev_n: Dictionary = a.get("_evN", {}) as Dictionary
	if ev_n.is_empty() or int(ev_n.get("night", -1)) != int(m.sim.night):
		ev_n = {"night": int(m.sim.night), "list": []}
	var list: Array = (ev_n.get("list", []) as Array).duplicate()
	if list.size() < 4:
		list.append({"i": ti, "d": delta, "r": reason})
		ev_n["list"] = list
		a["_evN"] = ev_n
		return delta
	var mi := 0
	for k in range(1, 4):
		if absf(float((list[k] as Dictionary).get("d", 0.0))) < absf(float((list[mi] as Dictionary).get("d", 0.0))):
			mi = k
	if absf(delta) > absf(float((list[mi] as Dictionary).get("d", 0.0))):
		var old: Dictionary = list[mi] as Dictionary
		axis_add_t(m, a, int(old.get("i", -1)), -float(old.get("d", 0.0)))
		list[mi] = {"i": ti, "d": delta, "r": reason}
		ev_n["list"] = list
		a["_evN"] = ev_n
		return delta
	return 0.0


static func identity_axis(m, a: Dictionary, t: Dictionary) -> float:
	if a.is_empty() or t.is_empty() or m.sim == null:
		return 0.5
	var ti := int(t.get("i", -1))
	if (a.get("known", {}) as Dictionary).has(ti):
		return 0.0
	if not bool(a.get("alien", false)) and (a.get("knownHuman", {}) as Dictionary).has(ti):
		return 1.0
	if bool(a.get("alien", false)) and (a.get("mates", {}) as Dictionary).has(ti):
		return 0.0
	var al: Dictionary = a.get("almost", {}) as Dictionary
	var foe: Dictionary = al.get("foe", {}) as Dictionary
	var friend: Dictionary = al.get("friend", {}) as Dictionary
	var cfg: Dictionary = identity_cfg(m)
	if foe.has(ti) and has_id_evidence(m, foe[ti] as Dictionary):
		return float(cfg.get("almostAlien", 0.05))
	if friend.has(ti):
		return float(cfg.get("almostHuman", 0.95))
	if bool(m.sim.reveal_all):
		return 0.0 if bool(t.get("alien", false)) else 0.99
	var cap: float = maxf(1.0, float(m.rule("AXIS", "cap", 200.0)))
	var te := eff_t(m, a, ti)
	var w := clampf(te / cap, 0.0, 1.0)
	var neg := clampf(-te / cap, 0.0, 1.0)
	return clampf(0.5 * (1.0 + w - neg), 0.01, 0.99)


static func identity_alien(m, a: Dictionary, t: Dictionary) -> Variant:
	if a.is_empty() or t.is_empty() or m.sim == null:
		return null
	return 1.0 - identity_axis(m, a, t)


static func hostile_prob(m, a: Dictionary, t: Dictionary) -> float:
	var h := identity_axis(m, a, t)
	return h if bool(a.get("alien", false)) else (1.0 - h)


static func axis_threat(m, a: Dictionary, ti: int) -> float:
	if a.is_empty() or ti < 0:
		return 0.0
	if (a.get("known", {}) as Dictionary).has(ti):
		return 0.0
	if not bool(a.get("alien", false)) and (a.get("knownHuman", {}) as Dictionary).has(ti):
		return 0.0
	if bool(a.get("alien", false)) and (a.get("mates", {}) as Dictionary).has(ti):
		return 0.0
	var cap: float = maxf(1.0, float(m.rule("AXIS", "cap", 200.0)))
	var d := trust_raw(m, a, ti) - current_prior(m)
	return maxf(0.0, d) / cap if bool(a.get("alien", false)) else maxf(0.0, -d) / cap


static func emo_add(m, a: Dictionary, ti: int, w: float, _reason: String = "") -> void:
	if a.is_empty() or ti < 0 or ti == int(a.get("i", -1)) or w == 0.0:
		return
	var emap: Dictionary = (a.get("E", {}) as Dictionary).duplicate()
	var mul_e: float = m.rule("AXIS", "scoreMul", 0.6)
	emap[ti] = clampf(float(emap.get(ti, 0.0)) + w * mul_e, -100.0, 100.0)
	a["E"] = emap


static func emotion_of(a: Dictionary, ti: int) -> float:
	if a.is_empty() or ti < 0:
		return 0.0
	var emap: Dictionary = a.get("E", {}) as Dictionary
	var cur := float(emap.get(ti, 0.0))
	if cur == 0.0:
		var tr := float((a.get("trust", {}) as Dictionary).get(ti, 0.0))
		var gr := float((a.get("grudge", {}) as Dictionary).get(ti, 0.0))
		if tr != 0.0 or gr != 0.0:
			return clampf(tr - gr, -1.0, 1.0)
	return clampf(cur / 100.0, -1.0, 1.0)


static func target_dist_mul(m, h: float) -> float:
	var cfg: Dictionary = identity_cfg(m)
	var mx := float(cfg.get("targetMulMax", 1.25))
	var mn := float(cfg.get("targetMulMin", 0.5))
	return mx - (mx - mn) * h


static func trait_b(m, a: Dictionary, axis: String) -> float:
	var tr: Dictionary = (m.sim.rules.data.get("tables", {}) as Dictionary).get("SKTrait", {}) as Dictionary
	var neutral := float(tr.get("NEUTRAL", 50))
	var gain := 0.45
	var sk: Dictionary = (m.sim.rules.data.get("tables", {}) as Dictionary).get("SKSanity", {}) as Dictionary
	gain = float(sk.get("TRAIT_GAIN", gain))
	var v := float((a.get("trait", {}) as Dictionary).get(axis, neutral))
	return ((v - neutral) / 50.0) * gain


static func trait_c(m, name: String, a: Dictionary) -> float:
	var tr: Dictionary = (m.sim.rules.data.get("tables", {}) as Dictionary).get("SKTrait", {}) as Dictionary
	var c: Dictionary = (tr.get("C", {}) as Dictionary).get(name, {}) as Dictionary
	var nums: Array = c.get("nums", []) as Array
	if nums.is_empty():
		return 1.0
	var ba := trait_b(m, a, "aggr")
	var bc := trait_b(m, a, "caut")
	var bs := trait_b(m, a, "soc")
	match name:
		"knifeWatcherPenalty":
			return float(nums[0]) * (float(nums[1]) - float(nums[2]) * ba + float(nums[3]) * bc)
		"knifeBusyBonus":
			return -float(nums[0]) * (float(nums[1]) + float(nums[2]) * ba)
		"knifeReach":
			return float(nums[0]) * (float(nums[1]) + float(nums[2]) * ba)
		"knifeBold":
			return clampf(float(nums[0]) + float(nums[1]) * ba - float(nums[1]) * bc, float(nums[2]), float(nums[3]))
		"shootSus":
			return float(nums[0]) - float(nums[1]) * ba + float(nums[2]) * bc
		"voteAbstain":
			return maxf(float(nums[0]), float(nums[1]) - float(nums[2]) * ba + float(nums[3]) * bc)
		"delayScale":
			return maxf(float(nums[0]), float(nums[1]) - float(nums[2]) * ba + float(nums[3]) * bc)
		"fleeThreshold":
			return float(nums[0]) + float(nums[1]) * ba
		"followChance":
			return minf(float(nums[0]), float(nums[1]) + float(nums[2]) * bs + float(nums[3]) * ba)
		"pileOn":
			var base_po: float = m.rule("SOCIAL", "pileOn", 0.4)
			return clampf(base_po * (1.0 + float(nums[4]) * bs + float(nums[5]) * ba - float(nums[6]) * bc),
				float(nums[1]), float(nums[2]))
		"grudgeGain":
			return float(nums[0]) + float(nums[1]) * ba + float(nums[2]) * bc
		"trustGain":
			return float(nums[0]) + float(nums[1]) * bs
		"voteGrudgePull":
			return float(nums[0]) * (float(nums[1]) + float(nums[2]) * ba)
	return 1.0


static func init_agent(m, a: Dictionary) -> void:
	a["_stallBias"] = 0.8 + m.sim._rng.randf() * 0.4
	var axes: Array = ["aggr", "caut", "soc", "cur"]
	var bands: Array = [[28, 0.3], [50, 0.4], [72, 0.3]]
	var neutral := 50
	if m.sim != null and m.sim.rules != null:
		var tr: Dictionary = (m.sim.rules.data.get("tables", {}) as Dictionary).get("SKTrait", {}) as Dictionary
		axes = tr.get("AXES", axes) as Array
		bands = tr.get("BANDS", bands) as Array
		neutral = int(tr.get("NEUTRAL", neutral))
	var t := {}
	for axis: String in axes:
		var band := neutral
		var roll: float = m.sim._rng.randf()
		var acc := 0.0
		for b: Array in bands:
			acc += float(b[1])
			if roll <= acc:
				band = int(b[0])
				break
		t[axis] = band
	if bool(a.get("alien", false)):
		var af_v: Variant = m.sim.rules.constant("AGGR_FLOOR") if m.sim != null and m.sim.rules != null else null
		t["aggr"] = maxi(int(t.get("aggr", neutral)), int(af_v) if (af_v is int or af_v is float) else 60)
	a["trait"] = t
	for dk: String in ["sus", "T", "E", "cred", "credWhy", "reliability", "warm", "trust", "grudge",
			"ally", "known", "knownHuman", "certNegNight", "certDirty", "why", "alibi",
			"susNight", "humanT", "redSeen", "avoidSeen", "lastBody"]:
		a[dk] = {}
	a["claimHist"] = []
	a["heard"] = []
	a["almost"] = {"foe": {}, "friend": {}}
	a["hyps"] = []
	a["talkN"] = 0
	a["silent"] = false
	a["exposure"] = 0.0
	a["rev"] = 0
	a["target"] = -1


static func sus_of_night(m, a: Dictionary, target_i: int) -> float:
	var v: float = m.sus_of(a, target_i)
	if v <= 0.0:
		return 0.0
	var sn: Dictionary = a.get("susNight", {}) as Dictionary
	if sn.has(target_i) and int(sn[target_i]) >= int(m.sim.night):
		return v
	return v * float(m.rule("CARRY", "nightReadSec", 0.70))


static func belief_entropy(a: Dictionary, skip_i: int = -1) -> float:
	var xs: Array = []
	var s := 0.0
	var sus: Dictionary = a.get("sus", {}) as Dictionary
	for k: int in sus.keys():
		if skip_i >= 0 and k == skip_i:
			continue
		var v := float(sus[k])
		if v <= 0.0:
			continue
		xs.append(v)
		s += v
	if xs.size() < 2 or s <= 0.0:
		return 0.0
	var h := 0.0
	for v2: Variant in xs:
		var p: float = float(v2) / s
		h -= p * log(p)
	return h


static func cred_vote_shield(m, cred: float) -> float:
	return clampf(cred * float(m.rule("CRED", "voteShield", 0.55)) * 1.55, 0.0, 0.85)


static func cred_testimony(m, cred: float) -> float:
	return 1.0 + clampf(cred * float(m.rule("CRED", "testimony", 0.6)), 0.0, 0.6)


static func disguise_risk(m, p: Dictionary) -> float:
	var R: Dictionary = m.sim.rules.t("DISGUISE").get("risk", {}) as Dictionary
	var r := 0.0
	if not p.is_empty():
		if bool(p.get("redHot", false)):
			r += float(R.get("redHot", 0.35))
		if bool(p.get("donePoint", false)):
			r += float(R.get("donePoint", 0.25))
		if bool(p.get("repeatSpot", false)):
			r += float(R.get("repeatSpot", 0.20))
		if bool(p.get("breakerLoss", false)):
			r += float(R.get("breakerLoss", 0.45))
		if bool(p.get("realCost", false)):
			r += float(R.get("realCost", 0.45))
		r += minf(float(R.get("idleCap", 0.36)),
			float(p.get("idle", 0.0)) * float(R.get("idleEyes", 0.12)))
		if float(p.get("audience", 0.0)) >= 3.0:
			r += float(R.get("manyEyes", 0.10))
		if bool(p.get("dark", false)):
			r -= float(R.get("dark", 0.12))
	return clampf(r, 0.0, float(R.get("cap", 0.80)))


static func disguise_score(m, audience: float, risk: float, duration: float,
		value_mul: float = 1.0) -> float:
	if audience <= 0:
		return 0.0
	var D: Dictionary = m.sim.rules.t("DISGUISE")
	var rk := clampf(risk, 0.0, 1.0)
	var gain: float = float(D.get("base", 1.0)) * value_mul \
		* minf(float(D.get("maxAudience", 4.0)), audience) * (1.0 - rk)
	var cost: float = float(D.get("timeCost", 0.02)) * duration \
		+ float(D.get("riskCost", 1.20)) * rk
	return gain - cost


## 准-确证 evalAlmost：主轴按 AXIS.almostFoe / AXIS.almostFriend，保留 sus/cred 兼容回退。
static func eval_almost(m, a: Dictionary, i: int) -> void:
	var al: Dictionary = (a.get("almost", {}) as Dictionary).duplicate()
	var foe: Dictionary = (al.get("foe", {}) as Dictionary).duplicate()
	var friend: Dictionary = (al.get("friend", {}) as Dictionary).duplicate()
	var known := (a.get("known", {}) as Dictionary).has(i)
	var fresh_night := int(m.sim.night) - int(m.rule("ALMOST", "freshNights", 2))
	var weak := {"silent": true, "empty_accuse": true, "leader_order": true,
		"impossible_claim": true, "quick_report": true, "wrong_accuse": true}
	var arr: Array = (a.get("why", {}) as Dictionary).get(i, []) as Array
	var kinds: Dictionary = {}
	var fresh: Dictionary = {}
	for r: Variant in arr:
		if not (r is Dictionary):
			continue
		var rec := r as Dictionary
		var k := String(rec.get("kind", ""))
		if k == "" or k == "saw_agent" or k == "saw_body_moved":
			continue
		kinds[k] = true
		if int(rec.get("night", -1)) >= fresh_night:
			fresh[k] = true
	var real_n := 0
	var heard_n := 0
	for k2: String in kinds.keys():
		if k2.begins_with("heard_"):
			if k2 != "heard_vouch":
				heard_n += 1
			continue
		if weak.has(k2):
			continue
		real_n += 1
	var heard_use := mini(heard_n, int(m.rule("ALMOST", "heardKinds", 1)))
	var counted := real_n + heard_use
	var foe_kinds := int(m.rule("ALMOST", "foeKinds", 2))
	var tmap: Dictionary = a.get("T", {}) as Dictionary
	var has_t := tmap.has(i)
	var t_val := trust_raw(m, a, i)
	var foe_score_ok: bool = (has_t and t_val <= float(m.rule("AXIS", "almostFoe", -30.0))) or float(m.sus_of(a, i)) >= 0.5
	var had_foe := foe.has(i)
	if not known and foe_score_ok and real_n >= 1 and counted >= foe_kinds and fresh.size() >= 1:
		var since := int(m.sim.night)
		if had_foe and (foe[i] as Dictionary).get("since") != null:
			since = int((foe[i] as Dictionary).get("since", since))
		foe[i] = {"t": float(m.ev_now()), "sus": float(m.sus_of(a, i)), "kinds": kinds.keys(),
			"heardUsed": heard_use, "since": since,
			"conf": float(m.rule("ALMOST", "foeConf", 0.8))}
		if not had_foe:
			m.sim._stat("almostCount", 1)
			if bool(m.sim.agent(i).get("alien", false)):
				m.sim._stat("almostAlien", 1)
			else:
				m.sim._stat("almostHuman", 1)
			if real_n < foe_kinds:
				m.sim._stat("almostHeard", 1)
		friend.erase(i)
	else:
		foe.erase(i)
	var cred: float = m.cred_of(a, i)
	var cw: Array = (a.get("credWhy", {}) as Dictionary).get(i, []) as Array
	var ck: Dictionary = {}
	var cf: Dictionary = {}
	for r2: Variant in cw:
		if not (r2 is Dictionary):
			continue
		var rec2 := r2 as Dictionary
		var k4 := String(rec2.get("kind", ""))
		if k4 == "":
			continue
		ck[k4] = true
		if int(rec2.get("night", -1)) >= fresh_night:
			cf[k4] = true
	var had_friend := friend.has(i)
	var friend_score_ok: bool = t_val >= float(m.rule("AXIS", "almostFriend", 200.0)) if has_t else cred >= 0.5
	if not known and not foe.has(i) and friend_score_ok \
			and ck.size() >= int(m.rule("ALMOST", "friendKinds", 2)) and cf.size() >= 1:
		var since2 := int(m.sim.night)
		if had_friend and (friend[i] as Dictionary).get("since") != null:
			since2 = int((friend[i] as Dictionary).get("since", since2))
		friend[i] = {"t": float(m.ev_now()), "cred": cred, "kinds": ck.keys(),
			"since": since2, "conf": float(m.rule("ALMOST", "friendConf", 0.7))}
		if not had_friend:
			m.sim._stat("almostFriendCount", 1)
	else:
		friend.erase(i)
	al["foe"] = foe
	al["friend"] = friend
	a["almost"] = al


## 跨夜回归：保留 known / 滑窗 heard，T/E/sus/cred/reliability/warm 按规则衰减。
static func reset_night(m) -> void:
	var cfg := {
		"warm_decay": float(m.rule("WARM", "decay", 0.85)),
		"cred_decay": float(m.rule("CRED", "decay", 0.92)),
		"cred_cap": float(m.rule("CRED", "cap", 1.2)),
		"rel_base": float(m.rule("RELIA", "base", 0.5)),
		"rel_carry": float(m.rule("RELIA", "carry", 0.9)),
		"rel_min": float(m.rule("RELIA", "min", 0.05)),
		"rel_max": float(m.rule("RELIA", "max", 1.0)),
		"decay_sight": float(m.rule("CARRY", "decaySight", 0.72)),
		"decay_hear": float(m.rule("CARRY", "decayHear", 0.45)),
		"stale_mul": float(m.rule("CARRY", "staleMul", 0.55)),
		"carry_cap": float(m.rule("CARRY", "cap", 0.55)),
		"carry_floor": float(m.rule("CARRY", "floor", 0.05)),
		"why_keep": int(m.rule("CARRY", "whyKeep", 4)),
		"t_floor_d": float(m.rule("AXIS", "decayFloor", 0.16)),
		"t_span_d": float(m.rule("AXIS", "decaySpan", 0.29)),
		"t_anchor": maxf(1.0, float(m.rule("AXIS", "decayAnchor", 100.0))),
		"ax_floor": float(m.rule("AXIS", "floor", -999.0)),
		"ax_cap": float(m.rule("AXIS", "cap", 200.0)),
		"cert_floor": float(m.rule("AXIS", "certFloor", 500.0)),
		"emo_decay_e": float(m.rule("AXIS", "emoDecay", 0.32)),
		"cur_prior": current_prior(m),
		"gn": int(m.sim.night),
	}
	for a: Dictionary in m.sim.agents:
		_reset_agent_night(m, a, cfg)


static func _reset_agent_night(m, a: Dictionary, cfg: Dictionary) -> void:
	var ax_cap := float(cfg["ax_cap"])
	var cert_floor := float(cfg["cert_floor"])
	var cur_prior := float(cfg["cur_prior"])
	var w: Dictionary = (a.get("warm", {}) as Dictionary).duplicate()
	for k: int in w.keys():
		w[k] = float(w[k]) * float(cfg["warm_decay"])
	a["warm"] = w
	var t_out: Dictionary = {}
	for kt: int in (a.get("T", {}) as Dictionary).keys():
		var tv := float((a["T"] as Dictionary)[kt])
		var net := tv - cur_prior
		var s := clampf((absf(net) - ax_cap) / maxf(1.0, cert_floor - ax_cap), 0.0, 1.0)
		var ntv := tv * s + (cur_prior + net * (float(cfg["t_floor_d"]) + float(cfg["t_span_d"]) * minf(1.0, absf(net) / float(cfg["t_anchor"])))) * (1.0 - s)
		t_out[kt] = snappedf(clampf(ntv, float(cfg["ax_floor"]), ax_cap), 0.1)
	a["T"] = t_out
	var e_out: Dictionary = {}
	for ke2: int in (a.get("E", {}) as Dictionary).keys():
		var nev := float((a["E"] as Dictionary)[ke2]) * float(cfg["emo_decay_e"])
		if absf(nev) > 2.0:
			e_out[ke2] = snappedf(nev, 0.1)
	a["E"] = e_out
	var cred_old: Dictionary = (a.get("cred", {}) as Dictionary).duplicate()
	var cred_out: Dictionary = {}
	for k2: int in cred_old.keys():
		var v := float(cred_old[k2]) * float(cfg["cred_decay"])
		if v > 0.04:
			cred_out[k2] = minf(float(cfg["cred_cap"]), v)
	a["cred"] = cred_out
	var rel_base := float(cfg["rel_base"])
	var rel_old: Dictionary = (a.get("reliability", {}) as Dictionary).duplicate()
	var rel_out: Dictionary = {}
	for k3: int in rel_old.keys():
		rel_out[k3] = clampf(rel_base + (float(rel_old[k3]) - rel_base) * float(cfg["rel_carry"]),
			float(cfg["rel_min"]), float(cfg["rel_max"]))
	a["reliability"] = rel_out
	var sus_old: Dictionary = (a.get("sus", {}) as Dictionary).duplicate()
	var why_old: Dictionary = (a.get("why", {}) as Dictionary).duplicate()
	var sus_night: Dictionary = (a.get("susNight", {}) as Dictionary).duplicate()
	var sus_out: Dictionary = {}
	var why_out: Dictionary = {}
	var gn := int(cfg["gn"])
	var decay_sight := float(cfg["decay_sight"])
	for k4: int in sus_old.keys():
		var sv := float(sus_old[k4])
		if not (sv > 0.0):
			continue
		var why_arr: Array = (why_old.get(k4, []) as Array)
		var sight := false
		for r: Variant in why_arr:
			if r is Dictionary and String((r as Dictionary).get("kind", "")).begins_with("saw_"):
				sight = true
				break
		var fresh: bool = sus_night.has(k4) and int(sus_night[k4]) >= gn - 1
		var nv := sv * (decay_sight if sight else float(cfg["decay_hear"]))
		if not fresh:
			nv *= float(cfg["stale_mul"])
		nv = minf(float(cfg["carry_cap"]), nv)
		if nv >= float(cfg["carry_floor"]):
			sus_out[k4] = nv
			var keep: Array = why_arr.slice(maxi(0, why_arr.size() - int(cfg["why_keep"])))
			if not keep.is_empty():
				why_out[k4] = keep
	a["sus"] = sus_out
	a["why"] = why_out
	var sn_out: Dictionary = {}
	for k6: int in sus_out.keys():
		if sus_night.has(k6):
			sn_out[k6] = int(sus_night[k6])
	a["susNight"] = sn_out
	var almost_old: Dictionary = (a.get("almost", {}) as Dictionary).duplicate(true)
	a["almost"] = {
		"foe": (almost_old.get("foe", {}) as Dictionary).duplicate(),
		"friend": (almost_old.get("friend", {}) as Dictionary).duplicate(),
	}
	for k5: int in sus_out.keys():
		eval_almost(m, a, k5)
	a["heard"] = (a.get("heard", []) as Array).duplicate()
	a["hyps"] = []
	a["talkN"] = 0
	a["silent"] = false
	a["exposure"] = float(a.get("exposure", 0.0)) * decay_sight
	a["alibi"] = {}
	for key in ["trust", "grudge"]:
		var old_emo: Dictionary = (a.get(key, {}) as Dictionary).duplicate()
		var emo_out: Dictionary = {}
		for ke: int in old_emo.keys():
			var ev2 := float(old_emo[ke]) * 0.8
			if ev2 > 0.05:
				emo_out[ke] = ev2
		a[key] = emo_out
	a["ally"] = (a.get("ally", {}) as Dictionary).duplicate()
	var cw_old: Dictionary = (a.get("credWhy", {}) as Dictionary).duplicate()
	var cw_out: Dictionary = {}
	for kc: int in cw_old.keys():
		if (a.get("cred", {}) as Dictionary).has(kc):
			cw_out[kc] = cw_old[kc]
	a["credWhy"] = cw_out
	a["rev"] = 0
	a["bodySeen"] = {}
	a["lastBody"] = {}
	a["redSeen"] = {}
	a["avoidSeen"] = {}
	a["claimHist"] = ((a.get("claimHist", []) as Array).slice(-3)).duplicate()
	var ht_old: Dictionary = (a.get("humanT", {}) as Dictionary).duplicate()
	var ht_out: Dictionary = {}
	for kh: int in ht_old.keys():
		var hv := float(ht_old[kh]) * 0.8
		if hv > 0.05:
			ht_out[kh] = hv
	a["humanT"] = ht_out
	a["_killAt"] = 0.0
	a["_lie"] = {}
	a["_retract"] = null
	a["_busTarget"] = -1
	a["order"] = {}
