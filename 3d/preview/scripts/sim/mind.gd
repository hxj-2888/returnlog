extends RefCounted
## AI 认知层 —— 与 2.5D `js/t2/ai.js`（SKT2AI）+ `js/ai/sanity.js` 同源。
##
## 口径（2026-11-08 用户裁定）：2.5D / 3D 只有维度、美术、玩家输入映射三处差异，
## AI 推理与发言判定必须一致。因此这里的数据结构与 2.5D 对齐：
##   sus     : int → float            综合嫌疑
##   known   : int → {t, kind}        确证（**只来自亲眼看见异形专属行为**）
##   almost  : {foe, friend}         准-确证
##   why     : int → Array[证据记录]  每条含 kind / night / x / y / src
##   heard   : 听来的证词滑动窗口（ATTN.heardMax）
##   hyps    : hypotheses() 缓存
##
## 所有阈值读 `data/rules.json`（由 export-rules.cjs 从 2.5D 具名导出），
## GDScript 里不写死推理数值。函数对应关系见 `3d/spec/parity-map.json`。

var sim
var lines


func setup(p_sim, p_lines) -> void:
	sim = p_sim
	lines = p_lines


func rule(sec: String, key: String, fallback: float = 0.0) -> float:
	# 2.5D / 3D 同源：读 rules.json（SKSanity 全量 42 张表）
	if sim != null and sim.rules != null:
		return sim.rules.n(sec, key, fallback)
	return fallback


## 异形专属行为表（2.5D ID_EVIDENCE，rules.json#constants.ID_EVIDENCE）
func id_evidence() -> Dictionary:
	if sim != null and sim.rules != null:
		return sim.rules.constant("ID_EVIDENCE") as Dictionary
	return {}


## 2.5D IDENTITY（js/game.js:7040，rules.json#constants.IDENTITY）
func identity_cfg() -> Dictionary:
	if sim != null and sim.rules != null:
		var c: Variant = sim.rules.constant("IDENTITY")
		if c is Dictionary:
			return c
	return {}


## 2.5D hasIdEvidence（js/game.js:7054）：almost.foe 的 kinds 里有“人类做不到”的证据。
func has_id_evidence(entry: Dictionary) -> bool:
	var id_ev := id_evidence()
	for k: Variant in (entry.get("kinds", []) as Array):
		if id_ev.has(String(k)):
			return true
	return false


## 2.5D identityPrior（js/game.js:7057）：H 的先验，按 15 席 / 4 异形的公开配置
## 条件化已认出的队友（异形）或已确证的异形（人类）；不读系统阵营表。
func identity_prior(a: Dictionary) -> float:
	if a.is_empty() or sim == null:
		return 0.5
	var alive_others := 0
	for x: Dictionary in sim.agents:
		if x != a and bool(x.get("alive", false)):
			alive_others += 1
	if alive_others <= 0:
		return 0.5
	var cfg := identity_cfg()
	var roles: Dictionary = sim.cfg.get("roles", {}) as Dictionary
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
		var x: Dictionary = sim.agent(k)
		if x.is_empty() or x == a:
			continue
		if bool(x.get("alive", false)):
			known_a += 1
		elif String(x.get("deathCause", "")) != "vote":
			known_dead_a += 1
	var hx := 0
	var ax := 0
	var unknown := 0
	for x2: Dictionary in sim.agents:
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


## 2.5D identityAxis（js/game.js:7085）：h = P(目标是人类 | 先验 + 贵信号)。
## known / mates → 0；almost.foe（含身份级证据）→ 0.05；almost.friend → 0.95；
## 其余 = prior + evidenceW × min(0.5, cred)。普通 sus 不进身份轴。
func identity_axis(a: Dictionary, t: Dictionary) -> float:
	if a.is_empty() or t.is_empty() or sim == null:
		return 0.5
	var ti := int(t.get("i", -1))
	if (a.get("known", {}) as Dictionary).has(ti):
		return 0.0
	if bool(a.get("alien", false)) and (a.get("mates", {}) as Dictionary).has(ti):
		return 0.0
	var al: Dictionary = a.get("almost", {}) as Dictionary
	var foe: Dictionary = al.get("foe", {}) as Dictionary
	var friend: Dictionary = al.get("friend", {}) as Dictionary
	var cfg := identity_cfg()
	if foe.has(ti) and has_id_evidence(foe[ti] as Dictionary):
		return float(cfg.get("almostAlien", 0.05))
	if friend.has(ti):
		return float(cfg.get("almostHuman", 0.95))
	var cred := float((a.get("cred", {}) as Dictionary).get(ti, 0.0))
	return clampf(identity_prior(a)
		+ float(cfg.get("evidenceW", 1.0)) * minf(0.5, cred), 0.01, 0.99)


## 2.5D hostileProb（js/game.js:7102）：异形看 h（越像人越敌对），人类看 1-h。
func hostile_prob(a: Dictionary, t: Dictionary) -> float:
	var h := identity_axis(a, t)
	return h if bool(a.get("alien", false)) else (1.0 - h)


## 2.5D targetDistMul（js/game.js:7111）：h=1 → 0.5× 风险分，h=0 → 1.25×。
func target_dist_mul(h: float) -> float:
	var cfg := identity_cfg()
	var mx := float(cfg.get("targetMulMax", 1.25))
	var mn := float(cfg.get("targetMulMin", 0.5))
	return mx - (mx - mn) * h


## 2.5D traits.js 的 b(a,axis)：性格轴相对中性的偏移（已乘 TRAIT_GAIN）。
func trait_b(a: Dictionary, axis: String) -> float:
	var tr: Dictionary = (sim.rules.data.get("tables", {}) as Dictionary).get("SKTrait", {}) as Dictionary
	var neutral := float(tr.get("NEUTRAL", 50))
	var gain := 0.45
	var sk: Dictionary = (sim.rules.data.get("tables", {}) as Dictionary).get("SKSanity", {}) as Dictionary
	gain = float(sk.get("TRAIT_GAIN", gain))
	var v := float((a.get("trait", {}) as Dictionary).get(axis, neutral))
	return ((v - neutral) / 50.0) * gain


## 2.5D SKTrait.C 具名系数：公式按 traits.js 移植，数值读 rules.json#tables.SKTrait.C[*].nums
## （nums 就是该函数里的字面量序列，避免在 GDScript 里另抄一份阈值）。
func trait_c(name: String, a: Dictionary) -> float:
	var tr: Dictionary = (sim.rules.data.get("tables", {}) as Dictionary).get("SKTrait", {}) as Dictionary
	var c: Dictionary = (tr.get("C", {}) as Dictionary).get(name, {}) as Dictionary
	var nums: Array = c.get("nums", []) as Array
	if nums.is_empty():
		return 1.0
	var ba := trait_b(a, "aggr")
	var bc := trait_b(a, "caut")
	var bs := trait_b(a, "soc")
	match name:
		"knifeWatcherPenalty":
			return float(nums[0]) * (float(nums[1]) - float(nums[2]) * ba + float(nums[3]) * bc)
		"knifeBusyBonus":
			return -float(nums[0]) * (float(nums[1]) + float(nums[2]) * ba)
		"grudgeGain":
			return float(nums[0]) + float(nums[1]) * ba + float(nums[2]) * bc
		"trustGain":
			return float(nums[0]) + float(nums[1]) * bs
		"voteGrudgePull":
			return float(nums[0]) * (float(nums[1]) + float(nums[2]) * ba)
	return 1.0


## 开局心智档案：性格轴按 SKTrait.AXES / BANDS 三档抽（28/50/72，30/40/30）。
func init_agent(a: Dictionary) -> void:
	var axes: Array = ["aggr", "caut", "soc", "cur"]
	var bands: Array = [[28, 0.3], [50, 0.4], [72, 0.3]]
	var neutral := 50
	if sim != null and sim.rules != null:
		var tr: Dictionary = (sim.rules.data.get("tables", {}) as Dictionary).get("SKTrait", {}) as Dictionary
		axes = tr.get("AXES", axes) as Array
		bands = tr.get("BANDS", bands) as Array
		neutral = int(tr.get("NEUTRAL", neutral))
	var t := {}
	for axis: String in axes:
		var band := neutral
		var roll: float = sim._rng.randf()
		var acc := 0.0
		for b: Array in bands:
			acc += float(b[1])
			if roll <= acc:
				band = int(b[0])
				break
		t[axis] = band
	a["trait"] = t
	a["sus"] = {}
	# 2.5D 口径：cred / reliability 都是**按目标索引**的字典，不是标量 ——
	# 「我信他」「他说的话值不值钱」都是相对某个人的评价。
	#   cred[i]        = 我认为 i 干正经事的程度（credOf(a,i) 读它）
	#   reliability[i] = i 的话在我这里值多少钱（reliaAdd 写它）
	# 3D 之前用标量 a.cred / a.reliability，追责（settleAccountability）
	# 需要按投票对象分别记账，标量结构装不下。
	a["cred"] = {}
	a["credWhy"] = {}
	a["reliability"] = {}
	a["warm"] = {}
	a["trust"] = {}
	a["grudge"] = {}
	a["ally"] = {}
	a["claimHist"] = []
	a["heard"] = []
	a["known"] = {}
	a["almost"] = {"foe": {}, "friend": {}}
	a["why"] = {}
	a["hyps"] = []
	a["reliability"] = {}
	a["talkN"] = 0
	a["silent"] = false
	a["exposure"] = 0.0
	a["alibi"] = {}
	a["susNight"] = {}
	a["rev"] = 0
	# 2.5D mindReset 字段（2026-11-10 第 13 批补）：
	#   humanT   = 异形眼里「这人像人类」的倾向（合闸目击 +0.28，跨夜 ×0.8）
	#   redSeen  = 红身去重时间戳（同一段红光 5 秒内只写一次证据）
	#   avoidSeen= 「他刚才在躲我」每夜一次的去重表（值 = 夜号）
	#   lastBody = 尸体观察单槽 {i, sig}：状态变了才重写 saw_body
	a["humanT"] = {}
	a["redSeen"] = {}
	a["avoidSeen"] = {}
	a["lastBody"] = {}
	a["target"] = -1


func sus_of(a: Dictionary, target_i: int) -> float:
	return float((a.get("sus", {}) as Dictionary).get(target_i, 0.0))


## 嫌疑读值（2.5D susOf 的 forNight 分支）：跨夜存量对**夜间行动**打 0.7 折 ——
## 否则天亮第一分钟就有人凭昨晚的旧印象去开枪。会议指控/投票读全额。
func sus_of_night(a: Dictionary, target_i: int) -> float:
	var v := sus_of(a, target_i)
	if v <= 0.0:
		return 0.0
	var sn: Dictionary = a.get("susNight", {}) as Dictionary
	if sn.has(target_i) and int(sn[target_i]) >= int(sim.night):
		return v
	return v * rule("CARRY", "nightReadSec", 0.70)


## ============ 2.5D 纯函数区（parity-map.json 的 pending 对账项） ============
## 每个函数与 js/ai/sanity.js / js/t2/ai.js 逐行同源；数值全部读 rules.json。

## witnessWeight（js/ai/sanity.js:45）：单目击者权重 —— 贴脸 1.0 → 视野边缘 0.3，
## 站桩做事的人注意力更集中（+0.12）。
func witness_weight(d: float, sight_r: float, busy: bool) -> float:
	var t: float = clampf(d / maxf(0.5, sight_r), 0.0, 1.0)
	return maxf(0.0, (1.0 - 0.70 * t) + (0.12 if busy else 0.0))


## escapeCost（sanity.js:50）：出刀后红身期间离门/管道口越远越走不干净。
func escape_cost(dist: float) -> float:
	return maxf(0.0, 1.6 - dist / 3.0) * 0.25


## exposure（sanity.js:54）：汇总暴露度 —— 2 个贴脸目击者 = 完全暴露。
func exposure(weights: Array, esc: float = 0.0) -> float:
	var s := 0.0
	for w: Variant in weights:
		s += float(w)
	return clampf((s + esc) / 2.0, 0.0, 1.0)


## trustEndorseAt（sanity.js:522）：敢公开背书 = 不再当众指控他的那条线。
func trust_endorse_at() -> float:
	return rule("CRED", "accuseShieldAt", 0.35)


## trustObeyGate（sanity.js:523）：服从指令的信任分母 = "基本是好人"。
func trust_obey_gate() -> float:
	return rule("ALMOST", "friendCred", 0.5)


## alibiTimeWord（sanity.js:720）：证据新鲜度 → 口语时间词。
func alibi_time_word(age: float) -> String:
	var s: float = maxf(0.0, age)
	if s <= rule("ALIBI", "stale", 15.0):
		return "刚才"
	if s < 40.0:
		return "十几秒前"
	return "半分钟前"


## reliaMul（sanity.js:999）：传闻权重放大系数 (0.5 + reliability) → 0.5~1.5 倍。
func relia_mul(rel: Variant) -> float:
	var v: float = rule("RELIA", "base", 0.5) if rel == null else float(rel)
	return rule("RELIA", "mixBase", 0.5) + clampf(v, 0.0, 1.0)


## beliefEntropy（sanity.js:1033）：把 sus 归一化成分布后求香农熵（nats）。
## 高熵 = 谁都像 → 犹豫语气不点名；低熵 = 一人独高 → 敢点名。
func belief_entropy(a: Dictionary, skip_i: int = -1) -> float:
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


## credVoteShield（sanity.js:1049）：信誉 → 投票回避概率。
func cred_vote_shield(cred: float) -> float:
	return clampf(cred * rule("CRED", "voteShield", 0.55), 0.0, 0.85)


## credTestimony（sanity.js:1053）：信誉 → 证言权重倍率（1.0 ~ 1.6）。
func cred_testimony(cred: float) -> float:
	return 1.0 + clampf(cred * rule("CRED", "testimony", 0.6), 0.0, 0.6)


## alibiReach（sanity.js:1062）：不在场证明的**可达性反事实** ——
## 从 A 走到 B 在 Δt 秒内来得及吗？来不及 ⇒ 口供不可能成立。
## 墙与门的绕行由调用方留 2 秒余量吸收（+2 写在判据里）。
func alibi_reach(dist: float, dt_sec: Variant, speed: float) -> Dictionary:
	var v := speed if speed > 0.0 else 4.0
	var need: float = dist / v
	var dt: float = INF if dt_sec == null else float(dt_sec)
	return {"possible": need <= dt + 2.0, "needSec": snappedf(need, 0.01),
		"shortfall": snappedf(maxf(0.0, need - dt), 0.01)}


## disguiseRisk（sanity.js:263）：风险纯函数 —— 只做加总与夹取。
## p 的键：redHot / donePoint / repeatSpot / breakerLoss / realCost / idle /
## audience / dark（2.5D DISGUISE.risk 的全部字段）。
func disguise_risk(p: Dictionary) -> float:
	var R: Dictionary = sim.rules.t("DISGUISE").get("risk", {}) as Dictionary
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


## disguiseScore（sanity.js:278）：伪装收益 = 观众权重 × 不被识破概率 − 时间 − 风险。
## 没观众 = 一分不值；valueMul 由调用方按 CRED.gains 比值传入（缺省 1 = 与伪装同值）。
func disguise_score(audience: int, risk: float, duration: float,
		value_mul: float = 1.0) -> float:
	if audience <= 0:
		return 0.0
	var D: Dictionary = sim.rules.t("DISGUISE")
	var rk := clampf(risk, 0.0, 1.0)
	var gain: float = float(D.get("base", 1.0)) * value_mul \
		* minf(float(D.get("maxAudience", 4.0)), float(audience)) * (1.0 - rk)
	var cost: float = float(D.get("timeCost", 0.02)) * duration \
		+ float(D.get("riskCost", 1.20)) * rk
	return gain - cost


## evNow（t2/ai.js:194）：夜内已过秒数（NIGHT.len - 剩余 t）。
func ev_now() -> float:
	return maxf(0.0, sim.night_len() - maxf(0.0, float(sim.t)))


## crimeWindow（t2/ai.js:179）：案发口径的时间窗 —— 死亡/倒地时刻 ±ALIBI.core 秒。
func crime_window(victim_i: int) -> Dictionary:
	var v: Dictionary = sim.agent(victim_i)
	if v.is_empty():
		return {}
	var t: Variant = null
	if bool(v.get("alive", false)):
		t = v.get("downAt", null)
	else:
		t = v.get("deathAt", null)
	if t == null:
		return {}
	var ref: float = sim.night_len() - maxf(0.0, float(t))
	var core := rule("ALIBI", "core", 8.0)
	return {"t0": maxf(0.0, ref - core), "t1": ref + core, "tRef": ref}


## claimWindow（t2/ai.js:469）：口供时间窗 —— night（整夜）/ recent（ALIBI.recent）/ 默认回看。
func claim_window(when: String) -> Dictionary:
	var now := ev_now()
	if when == "night":
		return {"t0": 0.0, "t1": now, "tRef": now}
	if when == "recent":
		return {"t0": maxf(0.0, now - rule("ALIBI", "recent", 20.0)), "t1": now, "tRef": now}
	return {"t0": maxf(0.0, now - rule("ALIBI", "window", 45.0)), "t1": now, "tRef": now}


## susCut（t2/ai.js:444）：嫌疑削减 —— 洗白侧的对称操作。
## known 的人不可削减（亲眼确证洗不掉）；削减量记进 alibi 备忘。
func sus_cut(a: Dictionary, target_i: int, w: float, reason: String,
		ev: Dictionary = {}) -> void:
	if a.is_empty() or target_i < 0 or int(a.get("i", -1)) == target_i:
		return
	if (a.get("known", {}) as Dictionary).has(target_i):
		return
	var old := sus_of(a, target_i)
	if old <= 0.0:
		return
	var cut := minf(old, w)
	var s: Dictionary = (a.get("sus", {}) as Dictionary).duplicate()
	s[target_i] = maxf(0.0, old - cut)
	a["sus"] = s
	var al: Dictionary = (a.get("alibi", {}) as Dictionary).duplicate()
	al[target_i] = {"t": float(ev.get("t", ev_now())),
		"room": ev.get("room", null), "reason": reason}
	a["alibi"] = al


## susAddContradiction（t2/ai.js:476）：拆谎成立的嫌疑记账 + 遥测计数。
func sus_add_contradiction(a: Dictionary, target_i: int, weight: float,
		reason: String, ev: Dictionary = {}) -> void:
	sus_add(a, target_i, weight, reason, ev)
	sim._stat("contradictions", 1)
	sim._stat_by("contradictionsBy", reason, 1)


## oldQuantifierWouldFire（t2/ai.js:485）：诊断函数 —— 旧量词（∃ 不匹配 → 定罪）
## 在这份记忆上会不会冤枉人。只统计，不改行为。
func old_quantifier_would_fire(w: Dictionary, subj: int, claim_room: String) -> bool:
	if w.is_empty() or subj < 0 or claim_room == "":
		return false
	var why: Dictionary = w.get("why", {}) as Dictionary
	var mem: Array = (why.get(subj, []) as Array)
	var now := ev_now()
	var tail := mini(24, mem.size())
	for k in range(mem.size() - 1, mem.size() - 1 - tail, -1):
		var e: Dictionary = mem[k]
		if String(e.get("kind", "")) != "saw_agent" or int(e.get("actor", -1)) != subj:
			continue
		if int(e.get("night", -1)) != int(sim.night):
			continue
		var room := String(e.get("room", ""))
		if room == "":
			continue
		if room == claim_room:
			continue
		if now - float(e.get("t", 0.0)) > 45.0:
			continue
		return true
	return false


## knownOverride（t2/ai.js:428）：确证硬覆盖 —— 亲眼确证洗掉 almost.friend 与 cred。
func known_override(w: Dictionary, target_i: int) -> void:
	if w.is_empty() or target_i < 0:
		return
	var al: Dictionary = (w.get("almost", {}) as Dictionary).duplicate()
	var foe: Dictionary = (al.get("foe", {}) as Dictionary).duplicate()
	var friend: Dictionary = (al.get("friend", {}) as Dictionary).duplicate()
	var had_friend: bool = friend.has(target_i)
	friend.erase(target_i)
	# cred 洗不掉确证
	var cred: Dictionary = (w.get("cred", {}) as Dictionary).duplicate()
	if cred.has(target_i):
		cred[target_i] = 0.0
		w["cred"] = cred
	var cw: Dictionary = (w.get("credWhy", {}) as Dictionary).duplicate()
	cw.erase(target_i)
	w["credWhy"] = cw
	if not foe.has(target_i):
		foe[target_i] = {"t": ev_now(), "sus": 1.0, "kinds": ["known"],
			"since": int(sim.night), "conf": 1.0}
	al["foe"] = foe
	al["friend"] = friend
	w["almost"] = al
	if had_friend:
		sim._stat("overriddenFriends", 1)


## affordableAlmostShot（t2/ai.js:547）：准-确证够不够开枪 ——
## 门槛打 0.85 折（比"完全确定"松一点，比"怀疑"紧）。
func affordable_almost_shot(a: Dictionary, thr: float) -> Dictionary:
	var af := best_almost_target(a)
	if af.is_empty():
		return {}
	var i := int(af.get("i", -1))
	if not live_target(i, int(a.get("i", -1))):
		return {}
	if not ((a.get("almost", {}) as Dictionary).get("friend", {}) as Dictionary).is_empty() \
			and ((a.get("almost", {}) as Dictionary).get("friend", {}) as Dictionary).has(i):
		return {}
	var v := sus_of_night(a, i)
	if v >= thr * 0.85:
		var why: Array = ((a.get("why", {}) as Dictionary).get(i, []) as Array) \
			.slice(maxi(0, ((a.get("why", {}) as Dictionary).get(i, []) as Array).size() - 4))
		return {"i": i, "score": v, "why": why}
	return {}


## sequenceCue（t2/ai.js:140）：行为序列 —— 同一人先后两种可疑动作才算"一串行为"。
## 只认自己记下的观测（why 里 src='sight' 的记录），间隔 ≤ MIND.seqWindowSec。
func sequence_cue(a: Dictionary, target_i: int) -> Dictionary:
	var why: Dictionary = a.get("why", {}) as Dictionary
	var mem: Array = (why.get(target_i, []) as Array)
	var hostile := {"saw_red": true, "saw_drag_away": true, "saw_body_moved": true,
		"saw_avoid": true}
	var win := rule("MIND", "seqWindowSec", 25.0)
	var first_t: Variant = null
	var kinds: Dictionary = {}
	for e: Variant in mem:
		if not (e is Dictionary):
			continue
		var rec := e as Dictionary
		if int(rec.get("actor", -1)) != target_i:
			continue
		var kd := String(rec.get("kind", ""))
		if not hostile.has(kd):
			continue
		var t := float(rec.get("t", 0.0))
		if first_t != null and t - float(first_t) > win:
			first_t = t
			kinds = {kd: true}
			continue
		if first_t == null:
			first_t = t
		kinds[kd] = true
		if kinds.size() >= 2:
			return {"kind": "sequence", "w": 0.30,
				"why": "先后看见他做过两种不一样的可疑动作",
				"alt": "两件事也可能只是恰好发生在同一个人附近"}
	return {}


## statementRelation（t2/ai.js:164）：证言间关系 —— 同一目标既被指控又被背书时，
## 公开声势不该照样滚雪球。返回压声系数 damp ∈ [0.4, 1]。
## testimony/vouches 是 [ {by, tgt, said, reason} ] 形态（said=已说出口）。
func statement_relation(testimony: Array, vouches: Array, tgt: int) -> Dictionary:
	var a_set: Dictionary = {}
	var v_set: Dictionary = {}
	for it: Variant in testimony:
		if not (it is Dictionary):
			continue
		var rec := it as Dictionary
		if not bool(rec.get("said", false)) or int(rec.get("tgt", -1)) != tgt:
			continue
		var reason := String(rec.get("reason", ""))
		if reason == "heard_accuse" or reason == "empty_accuse":
			a_set[int(rec.get("by", -1))] = true
	for v: Variant in vouches:
		if not (v is Dictionary):
			continue
		var vr := v as Dictionary
		if int(vr.get("tgt", -1)) == tgt:
			v_set[int(vr.get("by", -1))] = true
	var both := 0
	for by: int in a_set.keys():
		if v_set.has(by):
			a_set.erase(by)
			v_set.erase(by)
			both += 1
	var n_a := a_set.size()
	var n_v := v_set.size()
	var damp := 1.0
	if n_a > 0 and n_v > 0:
		damp = maxf(0.4, float(n_a) / float(n_a + n_v))
	return {"accusers": n_a, "vouchers": n_v, "selfConflict": both, "damp": damp}


## envEstimate（t2/ai.js:613）：a 估「i 有多像异形」。只读 a 自己的记忆 + 公开事件
## + 世界状态，**不读别人的私有 mind**（读心清零，2026-11-05 用户裁定）。
## 返回 {score, conf, whyKind, cues}：score 允许错，conf 随线索间接度降低。
func env_estimate(a: Dictionary, target_i: int) -> Dictionary:
	var empty := {"score": 0.0, "conf": 0.0, "whyKind": "none", "cues": []}
	if a.is_empty() or target_i < 0 or target_i == int(a.get("i", -1)):
		return empty
	var t: Dictionary = sim.agent(target_i)
	if t.is_empty():
		return empty
	var cues: Array = []
	var seen_word := {"saw_knife": "出刀", "saw_pipe": "钻管道", "saw_sabotage": "破坏设备",
		"saw_breaker": "拉闸断电", "saw_bot": "停摆机器人", "saw_red": "身上带着红光",
		"saw_drag": "拖尸体", "saw_detain": "被保安拘留", "saw_agent": "出现在那里"}
	# ① 自己的确证：最硬，但仍写清"可能看错人"
	var own: Variant = (a.get("known", {}) as Dictionary).get(target_i, null)
	if own != null:
		var okd := String((own as Dictionary).get("kind", "known"))
		return {"score": 1.0, "conf": 1.0, "whyKind": "seen",
			"cues": [{"kind": okd, "w": 1.0,
			"why": "我亲眼看见他" + String(seen_word.get(okd, "动手")),
			"alt": "也可能是我把同舱室的另一个人看成了他"}]}
	# ② 自己记着的目击 / 听来的指认（why 倒序扫，最多 6 条线索）
	var why: Dictionary = a.get("why", {}) as Dictionary
	var mem: Array = (why.get(target_i, []) as Array)
	var counted := 0
	for k in range(mem.size() - 1, -1, -1):
		if counted >= 6:
			break
		var e: Dictionary = mem[k]
		if int(e.get("actor", -1)) != target_i:
			continue
		var kd := String(e.get("kind", ""))
		if kd.begins_with("saw_") and String(e.get("src", "")) == "sight":
			cues.append({"kind": kd, "w": 0.72,
				"why": "我在" + String(e.get("room", "现场")) + "看见他"
					+ String(seen_word.get(kd, "动手")),
				"alt": "近距离看见的也可能是同舱室的另一个人"})
			counted += 1
		elif kd == "heard_accuse" or kd == "heard_claim":
			cues.append({"kind": "heard", "w": 0.28, "why": "我听见有人当众指认他",
				"alt": "指认他的人也可能在构陷"})
			counted += 1
	# ③ 公开事件
	var acc := pub_accusers(target_i)
	if not acc.is_empty():
		cues.append({"kind": "public", "w": minf(0.60, 0.22 + 0.12 * acc.size()),
			"why": "有 %d 个人当众指认他" % acc.size(),
			"alt": "公开指认也可能是跟风或构陷"})
	# ③b 行为序列
	var seq := sequence_cue(a, target_i)
	if not seq.is_empty():
		cues.append(seq)
	# ④ 世界状态：红光 / 拖尸看得见，但不指向具体是谁
	if float(t.get("redT", 0.0)) > 0.0:
		cues.append({"kind": "red", "w": 0.55, "why": "他身上还带着刚出刀的红光",
			"alt": "红光只说明他刚动过刀，不说明刀的是谁"})
	if int(t.get("drag", -1)) >= 0:
		cues.append({"kind": "drag", "w": 0.32, "why": "他正在拖尸体",
			"alt": "拖尸体也可能是想把伤者送进医疗间"})
	# 合并：取最强一条，多类线索小幅上浮；不写连续权重公式
	var kind_set: Dictionary = {}
	var score := 0.0
	var best_kind := "none"
	for c: Variant in cues:
		var cue := c as Dictionary
		kind_set[String(cue["kind"])] = true
		if float(cue["w"]) > score:
			score = float(cue["w"])
			best_kind = String(cue["kind"])
	var nk := kind_set.size()
	if nk >= 2:
		score = minf(1.0, score + 0.12)
	var conf := 0.0 if cues.is_empty() else minf(1.0, 0.35 + 0.18 * nk)
	var why_kind := "none"
	if best_kind != "none":
		why_kind = "heard" if best_kind == "heard" else ("public" if best_kind == "public" else "seen")
	return {"score": score, "conf": conf, "whyKind": why_kind, "cues": cues}


## audSusEstimate（t2/ai.js:676）：a 估「w 现在有多怀疑我」——
## 只用 a 自己知道的：w 有没有当众指认我、w 刚看见我在现场、我还带不带红光。
## 绝不读 w.mind.sus。
func aud_sus_estimate(a: Dictionary, w: Dictionary) -> Dictionary:
	if a.is_empty() or w.is_empty():
		return {"score": 0.0, "conf": 0.0, "why": ""}
	var score := 0.0
	var why := ""
	var wi := int(w.get("i", -1))
	var ai := int(a.get("i", -1))
	# 2.5D（js/t2/ai.js:680）：**他**当众指认过**我**（w.accuse === a.i）。
	# 3D 原先读成 a.accuse === w.i（我指认他），方向反了 —— 这条函数此前没有
	# 调用方，所以一直没暴露；第 13 批接 idle roam 时一并拨正。
	if int(w.get("accuse", -1)) == ai:
		score = 0.85
		why = "他当众指认过我"
	# 会上他点过我，我自己记着那一句（3D 的 heard 窗口就是 2.5D mind.mem 的 heard_*）。
	if score < 0.7:
		for h: Dictionary in (a.get("heard", []) as Array):
			if int(h.get("speaker", -1)) != wi or int(h.get("target", -1)) != ai:
				continue
			var kd := String(h.get("kind", ""))
			if kd == "heard_accuse" or kd == "heard_frame" or kd == "heard_claim":
				score = 0.7
				why = "我听见他当众点过我"
				break
	# 他刚才看见我在现场附近：3D 的 seenBy 存在**观察者**身上（w.seenBy = 我看见过谁），
	# 所以这里读 w.seenBy[a.i]；2.5D 存在 actor 身上（方向相反，语义等价）。
	var seen_by: Dictionary = w.get("seenBy", {}) as Dictionary
	if seen_by.has(ai):
		var age := ev_now() - float((seen_by[ai] as Dictionary).get("t", 0.0))
		if age < 20.0 and score < 0.55:
			score = 0.55
			if why == "":
				why = "他刚才看见我在现场附近"
	if float(a.get("redT", 0.0)) > 0.0 and score < 0.45:
		score = 0.45
		if why == "":
			why = "我身上还带着红光"
	return {"score": score, "conf": 0.7 if score > 0.0 else 0.15, "why": why}


func _add_sus(a: Dictionary, target_i: int, delta: float) -> void:
	var s: Dictionary = (a.get("sus", {}) as Dictionary).duplicate()
	s[target_i] = clampf(float(s.get(target_i, 0.0)) + delta, 0.0, 2.0)
	a["sus"] = s


## 嫌疑记账（2.5D susAdd，js/t2/ai.js:340）：
##   · 递减增益：gain = w × (1 - old × 0.55) —— 同一对象越可疑越难再涨
##   · 封顶 1.0；记 susNight（跨夜新鲜度判据）
##   · rev 计数器：信念动过 —— 会议里「听到发言 → 改票」靠它判断
##   · 记完立刻重算准-确证（可能升级，也可能因被洗清而降级）
func sus_add(a: Dictionary, target_i: int, w: float, reason: String,
		ev: Dictionary = {}) -> void:
	if a.is_empty() or target_i < 0 or int(a.get("i", -1)) == target_i:
		return
	var old := sus_of(a, target_i)
	var gain := w * (1.0 - old * 0.55)
	var s: Dictionary = (a.get("sus", {}) as Dictionary).duplicate()
	s[target_i] = minf(1.0, old + gain)
	a["sus"] = s
	var sn: Dictionary = (a.get("susNight", {}) as Dictionary).duplicate()
	sn[target_i] = int(sim.night)
	a["susNight"] = sn
	var rec: Dictionary = {
		"w": gain, "reason": reason, "kind": String(ev.get("kind", "")),
		"night": int(sim.night), "src": String(ev.get("src", "")),
	}
	if ev.has("room"):
		rec["room"] = ev["room"]
	_push_why(a, target_i, rec)
	# 信念动过了：会议里「听到发言 → 改票」靠这个计数器判断。
	a["rev"] = int(a.get("rev", 0)) + 1
	refresh_hyps(a)
	eval_almost(a, target_i)


## 看见尸体（2.5D observeBody 的 saw_body 记忆，js/game.js:2164-2188）。
## 3D 没有 mem 时间线，落到「见过这具尸体没有」的一张按夜的表上。
## 只记事实：不加嫌疑、不写 known —— 尸体本身不指向任何人；
## 唯一的消费方是会议里的 quick_report（报案太快 → 先看见过尸体的人怀疑报案人）。
func note_body_seen(a: Dictionary, victim_i: int) -> void:
	if a.is_empty() or victim_i < 0:
		return
	var v: Dictionary = sim.agent(victim_i)
	if v.is_empty():
		return
	var bp: Vector2 = v.get("bodyPos", v.get("pos", Vector2.ZERO))
	var rid: String = sim.room_at(bp)
	# 2.5D observeBody（js/game.js:2175）：单槽 lastBody + 状态签名。
	# 只有 alive/downed/伤口/移动/搜过/舱室 任一变化才重写 —— 每 0.5 秒刷屏会把
	# mem / why 挤爆（2.5D 注释原文：只有状态变化才记一条）。
	var sig := "%s|%s|%s|%s|%s|%s" % [
		bool(v.get("alive", false)), bool(v.get("downed", false)),
		String(v.get("woundCause", v.get("deathCause", ""))),
		bool(v.get("bodyMoved", false)), bool(v.get("searched", false)), rid,
	]
	var last: Dictionary = a.get("lastBody", {}) as Dictionary
	if int(last.get("i", -1)) == victim_i and String(last.get("sig", "")) == sig:
		return
	a["lastBody"] = {"i": victim_i, "sig": sig}
	var seen: Dictionary = (a.get("bodySeen", {}) as Dictionary).duplicate()
	seen[victim_i] = int(sim.night)
	a["bodySeen"] = seen
	# 2.5D：尸体被移动过 → 追加一条 saw_body_moved（sequenceCue 的弱线索原料）
	if bool(v.get("bodyMoved", false)):
		_push_why(a, victim_i, {"kind": "saw_body_moved", "src": "sight",
			"night": int(sim.night), "x": bp.x, "y": bp.y})
	# 2.5D：同一舱室 8 秒内见过的人各记一笔 near_body（只能说明"他在附近"，
	# 不能定罪）—— 权重 0.16，进 sus 的 saw_* 通道。
	if rid != "":
		var now: float = sim.night_len() - maxf(0.0, float(sim.t))
		var core := rule("ALIBI", "core", 8.0)
		var why_map: Dictionary = (a.get("why", {}) as Dictionary).duplicate()
		for subj: int in why_map.keys():
			var arr: Array = why_map[subj] as Array
			for e: Variant in arr:
				var rec := e as Dictionary
				if String(rec.get("kind", "")) != "saw_agent":
					continue
				if int(rec.get("night", -1)) != int(sim.night):
					continue
				if String(rec.get("room", "")) != rid:
					continue
				if absf(now - float(rec.get("t", 0.0))) > core:
					continue
				sus_add(a, subj, 0.16, "near_body",
					{"kind": "near_body", "src": "sight", "night": int(sim.night)})


## 异形看见有人**合闸**：给他记一笔「像人类」（2.5D humanishAdd，js/game.js:2037）。
## 只服务「先处理更像对手的人」这一个用途；不写 known / mates，不做身份结论。
func humanish_add(a: Dictionary, target_i: int, amount: float) -> void:
	if a.is_empty() or not bool(a.get("alien", false)) or target_i < 0:
		return
	var ht: Dictionary = (a.get("humanT", {}) as Dictionary).duplicate()
	ht[target_i] = minf(1.0, float(ht.get(target_i, 0.0)) + amount)
	a["humanT"] = ht


## 2.5D humanishOf（js/game.js:2043）：读 0..1 的「像人类」倾向。
func humanish_of(a: Dictionary, target_i: int) -> float:
	return clampf(float((a.get("humanT", {}) as Dictionary).get(target_i, 0.0)), 0.0, 1.0)


## 2.5D grudgeAdd（js/game.js:1461）：他咬过我 → 情绪记仇。
## 幅度乘 SKTrait.C.grudgeGain（性格系数，数值读 rules.json）。
func grudge_add(a: Dictionary, target_i: int, amount: float) -> void:
	if a.is_empty() or target_i < 0 or target_i == int(a.get("i", -1)):
		return
	if sim == null or sim.rules == null:
		return
	var g: Dictionary = (a.get("grudge", {}) as Dictionary).duplicate()
	g[target_i] = clampf(float(g.get(target_i, 0.0))
		+ amount * trait_c("grudgeGain", a), 0.0, 2.0)
	a["grudge"] = g


## 2.5D trustAdd（js/game.js:1467）：他帮过我 → 情绪记恩。
func trust_add(a: Dictionary, target_i: int, amount: float) -> void:
	if a.is_empty() or target_i < 0 or target_i == int(a.get("i", -1)):
		return
	if sim == null or sim.rules == null:
		return
	var t: Dictionary = (a.get("trust", {}) as Dictionary).duplicate()
	t[target_i] = clampf(float(t.get(target_i, 0.0))
		+ amount * trait_c("trustGain", a), 0.0, 2.0)
	a["trust"] = t


## 2.5D isPatron（js/game.js:1474）：被某人当众保过（trust≥0.8）就不过他的票。
func is_patron(a: Dictionary, target_i: int) -> bool:
	return float((a.get("trust", {}) as Dictionary).get(target_i, 0.0)) >= 0.8


## 2.5D startVote 情绪分支（js/game.js:7487-7499）：最恨谁（活着、非队友）。
func best_grudge(a: Dictionary) -> Dictionary:
	if a.is_empty():
		return {}
	var g: Dictionary = a.get("grudge", {}) as Dictionary
	var alien := bool(a.get("alien", false))
	var mates: Dictionary = a.get("mates", {}) as Dictionary
	var best := -1
	var bv := 0.0
	for k: int in g.keys():
		var t: Dictionary = sim.agent(k)
		if t.is_empty() or t == a or not bool(t.get("alive", false)) \
				or bool(t.get("downed", false)):
			continue
		if alien and mates.has(k):
			continue
		var v := float(g[k])
		if v > bv:
			bv = v
			best = k
	return {"i": best, "score": bv} if best >= 0 else {}


## 2.5D recordClaim（js/game.js:1624）：口供史只留最近 3 场，只进语料、不产生嫌疑。
func record_claim(a: Dictionary, room_id: String) -> void:
	if a.is_empty():
		return
	var rid := room_id
	var rname: String = sim.room_name(rid) if rid != "" else "走廊"
	var h: Array = (a.get("claimHist", []) as Array).duplicate()
	h.append({"night": int(sim.night), "room": rname, "roomId": rid})
	while h.size() > 3:
		h.remove_at(0)
	a["claimHist"] = h


## 亲眼目击：不进 heard 窗口；why 按目标累积证据记录（2.5D evPush 口径）。
## 证据分级（2.5D CONFIRM，2026-11-02 用户裁定"AI 判定太神"）：
##   · d ≤ CONFIRM.nearR(4.5) → 写 known（确证，会议里敢说"我确定"）
##   · d > nearR → **不写 known**，只按原权重加嫌疑（喂给 almost.foe 当原料）
## 目击认错人（2.5D MISID，2026-11-07 用户裁定）：确证写入有 20% 概率指到
## 目击范围内**看得见的另一个人**（候选池 = 此刻真看得见的人，不含行为人）。
func note_sight(witness_i: int, actor_i: int, kind: String, at: Vector2) -> void:
	var w: Dictionary = sim.agent(witness_i)
	if w.is_empty() or witness_i == actor_i:
		return
	var ev_w: Dictionary = sim.rules.constant("EV_W") as Dictionary
	var weight := float(ev_w.get(kind, 0.0))
	# 远距离目击打标（2.5D farSight 遥测口径：>4.5 格不确证）。
	var wp: Vector2 = w.get("pos", Vector2.ZERO)
	var d := wp.distance_to(at)
	var far: bool = d > rule("CONFIRM", "nearR", 4.5)
	var evrec := {"kind": kind, "src": "sight", "actor": actor_i,
		"x": at.x, "y": at.y, "night": int(sim.night)}
	if far:
		evrec["far"] = true
	# 一次目击只记**一条** why（2.5D evPush 一次）；3D 原先 sus_add 与 _push_why
	# 各写一条，记忆窗口与 almost 的原料都被翻倍（第 13 批修）。
	sus_add(w, actor_i, weight, "亲眼目击", evrec)
	var actor: Dictionary = sim.agent(actor_i)
	if not actor.is_empty():
		actor["exposure"] = float(actor.get("exposure", 0.0)) + 1.0
	var id_ev: Dictionary = sim.rules.constant("ID_EVIDENCE") as Dictionary
	if not id_ev.has(kind) or far:
		return
	# MISID：20% 概率认错人 —— 候选池 = 目击者此刻真看得见的人（排除自己与行为人）
	var final_i := actor_i
	var misid := rule("MISID", "chance", 0.20)
	if misid > 0.0 and sim._rng.randf() < misid:
		var sight_r: float = sim.sight_range_at(at)
		var pool: Array = []
		for o: Dictionary in sim.agents:
			var oi := int(o.get("i", -1))
			if oi == witness_i or oi == actor_i:
				continue
			if not bool(o.get("alive", false)) or bool(o.get("downed", false)):
				continue
			var op: Vector2 = o.get("pos", Vector2.ZERO)
			if op.distance_to(at) > sight_r:
				continue
			if sim.nav != null and not sim.nav.los(wp, op):
				continue
			pool.append(oi)
		if not pool.is_empty():
			final_i = int(pool[sim._rng.randi_range(0, pool.size() - 1)])
			if final_i != actor_i:
				# 认错：给错的人写 known；对真凶只保留残余印象（不动已落的 sus）
				sim._stat("misIdWrites", 1)
				if bool(sim.agent(final_i).get("alien", false)):
					sim._stat("misIdToAlien", 1)
				else:
					sim._stat("misIdToHuman", 1)
				_push_why(w, final_i, {"kind": kind, "src": "sight", "actor": final_i,
					"x": at.x, "y": at.y, "night": int(sim.night), "misid": true})
	var kn: Dictionary = (w.get("known", {}) as Dictionary).duplicate()
	kn[final_i] = {"t": float(sim.elapsed), "kind": kind}
	w["known"] = kn
	# 2.5D knownOverride：确证硬覆盖 almost.friend 与 cred（亲眼所见洗不掉）
	known_override(w, final_i)


func _push_why(a: Dictionary, target_i: int, rec: Dictionary) -> void:
	var why_map: Dictionary = (a.get("why", {}) as Dictionary).duplicate()
	var arr: Array = (why_map.get(target_i, []) as Array).duplicate()
	arr.append(rec)
	var cap := 0
	if sim != null and sim.rules != null:
		cap = int(sim.rules.constant("MEM_MAX"))
	if cap > 0:
		while arr.size() > cap:
			arr.remove_at(0)
	why_map[target_i] = arr
	a["why"] = why_map


## 位置时间线（2.5D trackNight 的 saw_agent 记录）：拆谎与不在场证明的原料。
## 只记"我在某时某地看见过某人"，不加任何嫌疑（2.5D 同口径）。
func note_track(witness_i: int, actor_i: int, at: Vector2, room_id: String) -> void:
	var w: Dictionary = sim.agent(witness_i)
	if w.is_empty() or witness_i == actor_i:
		return
	_push_why(w, actor_i, {"kind": "saw_agent", "src": "sight", "actor": actor_i,
		"x": at.x, "y": at.y, "room": room_id, "night": int(sim.night),
		"t": sim.night_len() - maxf(0.0, float(sim.t))})


## 听来的证词：滑动窗口 + 可信度权重 + 独立指控者加成 + 描述失真（DESC）。
## claim_room = 说话人声称目标所在的房间（指控/转述携带，自述类为空）。
func note_testimony(listener_i: int, speaker_i: int, target_i: int,
		kind: String, strength: float = -1.0, claim_room: String = "") -> void:
	var l: Dictionary = sim.agent(listener_i)
	var sp: Dictionary = sim.agent(speaker_i)
	if l.is_empty() or sp.is_empty() or listener_i == speaker_i or target_i < 0:
		return
	var cap := int(rule("ATTN", "heardMax", 10))
	var heard: Array = (l.get("heard", []) as Array).duplicate()
	var independent := false
	for h: Dictionary in heard:
		if int(h.get("target", -1)) == target_i and int(h.get("speaker", -1)) != speaker_i:
			independent = true
	var base := strength if strength >= 0.0 else rule("TESTIFY", "dirtySus", 0.3)
	var rel := relia_of(sp, speaker_i)
	var w := base * relia_mul(rel)
	if sus_of(l, speaker_i) >= rule("TESTIFY", "dirtySus", 0.3):
		w *= rule("TESTIFY", "dirtyMul", 0.85)
	if independent:
		w *= rule("TESTIFY", "corrobMul", 1.25)
	# 描述准确率（2.5D DESC，2026-11-07 用户裁定"压低人类 AI 的描述准确率"）：
	# 转述/传闻类证据在进入听众记忆前按 DESC 做一次可解释偏差 ——
	# 房间记成同船另一间真实舱室 / 动作记混 / 置信度与嫌疑权重打折。
	# 亲眼目击（src:'sight'）不动 —— 看错人由 MISID 单独负责。
	var rec := {"kind": kind, "src": "speech", "actor": target_i,
		"speaker": speaker_i, "night": int(sim.night)}
	var desc_on: bool = bool(sim.rules.t("DESC").get("on", true))
	if desc_on:
		var D: Dictionary = sim.rules.t("DESC")
		var touched := false
		if claim_room != "" and sim._rng.randf() < float(D.get("roomErr", 0.22)):
			var pool: Array = []
			for r: Dictionary in (sim.map.get("rooms", []) as Array):
				var rid := String(r.get("id", ""))
				if rid != "" and rid != claim_room:
					pool.append(rid)
			if not pool.is_empty():
				claim_room = String(pool[sim._rng.randi_range(0, pool.size() - 1)])
				touched = true
		var swap := {"saw_knife": "saw_pipe", "saw_pipe": "saw_red", "saw_red": "saw_knife",
			"saw_sabotage": "saw_knife", "heard_accuse": "heard_frame",
			"heard_frame": "heard_accuse"}
		if swap.has(kind) and sim._rng.randf() < float(D.get("kindErr", 0.18)):
			kind = String(swap[kind])
			rec["kind"] = kind
			touched = true
		if touched:
			var loss := float(D.get("confLoss", 0.78))
			w *= loss
			rec["descErr"] = true
			sim._stat("descErrors", 1)
	if claim_room != "":
		rec["room"] = claim_room
	# 听众的 heard 窗口记 DESC 后的最终种类（2.5D deliverTestimony 的 ev 副本）。
	heard.append({"speaker": speaker_i, "target": target_i, "kind": kind,
		"night": int(sim.night)})
	while heard.size() > cap:
		heard.remove_at(0)
	l["heard"] = heard
	# 一次证言只写**一条** why（2.5D susAdd 一次）：3D 原先 sus_add + _push_why
	# 双写，且 sus_add 那条的 kind 固定成 heard_testimony（会被 evalAlmost 当成实证）。
	sus_add(l, target_i, w, "heard_testimony", rec)


## 自述与听众记忆对不上 → 说话人可信度扣 caughtLie（2.5D checkAlibi 量词）。
## 正规量词（2026-11-01 修量词，js/ai/sanity.js#checkAlibi）：
##   ① ∃ 匹配 → 口供成立，**不可定罪**（窗口内有一条对得上就算）；
##   ② 只比**本夜**窗口内（ALIBI.window 45 秒）的 saw_agent 记录；
##   ③ 走廊/未知不算「在某个舱室」—— 走过走廊不能反驳口供；
##   ④ 窗口内没有任何记录（checked=0）→ 无信息，闭嘴。
## room_id 是**机器口径**（舱室 id），与 saw_agent 记录的 room 同源比对。
func check_alibi(speaker_i: int, room_id: String) -> int:
	if room_id == "":
		return 0
	var caught := 0
	var now := ev_now()
	var win := rule("ALIBI", "window", 45.0)
	for l: Dictionary in sim.agents:
		if int(l.get("i", -1)) == speaker_i or not bool(l.get("alive", false)):
			continue
		var mem: Array = ((l.get("why", {}) as Dictionary).get(speaker_i, []) as Array)
		var checked := 0
		var matched := false
		for e: Variant in mem:
			if not (e is Dictionary):
				continue
			var rec := e as Dictionary
			if String(rec.get("kind", "")) != "saw_agent":
				continue
			if int(rec.get("night", -1)) != int(sim.night):
				continue
			var t := float(rec.get("t", 0.0))
			if now - t > win:
				continue
			var room := String(rec.get("room", ""))
			if room == "" or room == "corridor" or room == "unknown":
				continue
			checked += 1
			if room == room_id:
				matched = true
				break
		if checked == 0 or matched:
			continue
		relia_add(l, speaker_i, -rule("RELIA", "caughtLie", 0.2))
		caught += 1
	return caught


## 信誉记账（2.5D credAdd，js/game.js:1451）：
##   cred[i] = 我认为 i 干正经事的程度
##  · key 非空且在 CRED.gains 里 ⇒ 计入 almost.friend 的种类（投票对错**不算**正经行为）
##  · 硬覆盖：已经自己确证的人，洗白一律失效
##  · 追责会给负权重，所以双向夹紧到 [0, CRED.cap]
func cred_add(a: Dictionary, target_i: int, key: String, amount: float = -1.0) -> void:
	if a.is_empty() or target_i < 0 or int(a.get("i", -1)) == target_i:
		return
	if sim == null or sim.rules == null:
		return
	var known: Dictionary = (a.get("known", {}) as Dictionary)
	if known.has(target_i):
		return
	var gains: Dictionary = (sim.rules.t("CRED").get("gains", {}) as Dictionary)
	var w := amount
	if w < 0.0:
		if not gains.has(key):
			return
		w = float(gains[key])
	if w == 0.0:
		return
	var cap := rule("CRED", "cap", 1.2)
	var cred: Dictionary = (a.get("cred", {}) as Dictionary).duplicate()
	cred[target_i] = clampf(float(cred.get(target_i, 0.0)) + w, 0.0, cap)
	a["cred"] = cred
	# 只有「正经行为」才计入 almost.friend 的种类
	if key != "" and gains.has(key):
		var cw: Dictionary = (a.get("credWhy", {}) as Dictionary).duplicate()
		var arr: Array = (cw.get(target_i, []) as Array).duplicate()
		arr.append({"kind": key, "night": int(sim.night), "w": w})
		while arr.size() > 8:
			arr.remove_at(0)
		cw[target_i] = arr
		a["credWhy"] = cw
		eval_almost(a, target_i)


## 信誉（相对某人的）：2.5D credOf(a,i)
func cred_of(a: Dictionary, target_i: int) -> float:
	if a.is_empty():
		return 0.0
	return float((a.get("cred", {}) as Dictionary).get(target_i, 0.0))


## 可信度记账（2.5D reliaAdd，js/game.js:1411）：
## reliability[i] = i 说的话在我这里值多少钱
func relia_add(a: Dictionary, target_i: int, delta: float) -> void:
	if a.is_empty() or target_i < 0 or int(a.get("i", -1)) == target_i or delta == 0.0:
		return
	var rel: Dictionary = (a.get("reliability", {}) as Dictionary).duplicate()
	var old := float(rel.get(target_i, rule("RELIA", "base", 0.5)))
	rel[target_i] = clampf(old + delta, rule("RELIA", "min", 0.05), rule("RELIA", "max", 1.0))
	a["reliability"] = rel


## 证人可信度（相对某人的）：2.5D reliaOf
func relia_of(a: Dictionary, target_i: int) -> float:
	if a.is_empty():
		return rule("RELIA", "base", 0.5)
	return float((a.get("reliability", {}) as Dictionary).get(target_i, rule("RELIA", "base", 0.5)))


func warm_add(a: Dictionary, other: int, delta: float) -> void:
	if a.is_empty():
		return
	var w: Dictionary = (a.get("warm", {}) as Dictionary).duplicate()
	w[other] = float(w.get(other, 0.0)) + delta
	a["warm"] = w


## ---- 以下为 SKT2AI 认知链函数的 3D 等价实现（逐项见 parity-map.json） ----

func live_target(i: int, self_i: int) -> bool:
	if i == self_i:
		return false
	var t: Dictionary = sim.agent(i)
	return not t.is_empty() and bool(t.get("alive", false)) and not bool(t.get("downed", false))


func top_sus(a: Dictionary, min_v: float = 0.0) -> Dictionary:
	var best := -1
	var bv := min_v
	for k in (a.get("sus", {}) as Dictionary).keys():
		var i := int(k)
		if not live_target(i, int(a.get("i", -1))):
			continue
		var v := sus_of(a, i)
		if v > bv:
			bv = v
			best = i
	return {"i": best, "v": bv} if best >= 0 else {}


func best_sus_target(a: Dictionary, min_v: float = 0.0) -> Dictionary:
	return top_sus(a, min_v)


func best_known_target(a: Dictionary) -> Dictionary:
	var best := -1
	var bt := -1.0
	for k in (a.get("known", {}) as Dictionary).keys():
		var i := int(k)
		if not live_target(i, int(a.get("i", -1))):
			continue
		var rec: Dictionary = (a.get("known", {}) as Dictionary)[k] as Dictionary
		var t := float(rec.get("t", 0.0)) if rec is Dictionary else 0.0
		if t > bt:
			bt = t
			best = i
	return {"i": best, "score": 1.0} if best >= 0 else {}


func best_almost_target(a: Dictionary) -> Dictionary:
	var al: Dictionary = a.get("almost", {}) as Dictionary
	var foe: Dictionary = al.get("foe", {}) as Dictionary
	var best := -1
	var bs := -1.0
	for k in foe.keys():
		var i := int(k)
		if not live_target(i, int(a.get("i", -1))):
			continue
		if (a.get("known", {}) as Dictionary).has(i):
			continue
		var v: Variant = foe[k]
		var s := float(v.get("sus", 0.0)) if v is Dictionary else float(v)
		if s > bs:
			bs = s
			best = i
	return {"i": best, "score": bs} if best >= 0 else {}


func evidence_reason(a: Dictionary, i: int) -> Dictionary:
	var arr: Array = (a.get("why", {}) as Dictionary).get(i, []) as Array
	return arr[arr.size() - 1] as Dictionary if not arr.is_empty() else {}


## 准-确证 evalAlmost（2.5D js/t2/ai.js:364-436）：
## foe = sus≥foeSus + real≥1 + counted≥foeKinds + 至少一种新鲜；
## friend = cred≥friendCred + credWhy 种类≥friendKinds + 新鲜；
## WEAK（沉默/空口指控/领袖点名/不可能口供/快报案/错告）不算证据；
## heard_* 最多补 heardKinds 个；saw_agent / saw_body_moved 是时间线，不算种类。
func eval_almost(a: Dictionary, i: int) -> void:
	var al: Dictionary = (a.get("almost", {}) as Dictionary).duplicate()
	var foe: Dictionary = (al.get("foe", {}) as Dictionary).duplicate()
	var friend: Dictionary = (al.get("friend", {}) as Dictionary).duplicate()
	var known := (a.get("known", {}) as Dictionary).has(i)
	var fresh_night := int(sim.night) - int(rule("ALMOST", "freshNights", 2))
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
		if k == "":
			continue
		if k == "saw_agent" or k == "saw_body_moved":
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
	var heard_use := mini(heard_n, int(rule("ALMOST", "heardKinds", 1)))
	var counted := real_n + heard_use
	var foe_kinds := int(rule("ALMOST", "foeKinds", 2))
	var had_foe := foe.has(i)
	if not known and sus_of(a, i) >= rule("ALMOST", "foeSus", 0.5) \
			and real_n >= 1 and counted >= foe_kinds and fresh.size() >= 1:
		var since := int(sim.night)
		if had_foe and (foe[i] as Dictionary).get("since") != null:
			since = int((foe[i] as Dictionary).get("since", since))
		foe[i] = {"t": ev_now(), "sus": sus_of(a, i), "kinds": kinds.keys(),
			"heardUsed": heard_use, "since": since,
			"conf": rule("ALMOST", "foeConf", 0.8)}
		if not had_foe:
			sim._stat("almostCount", 1)
			if bool(sim.agent(i).get("alien", false)):
				sim._stat("almostAlien", 1)
			else:
				sim._stat("almostHuman", 1)
			if real_n < foe_kinds:
				sim._stat("almostHeard", 1)
		friend.erase(i)
	else:
		foe.erase(i)
	# friend：正向证据（credWhy 的 kind）+ 新鲜 + 不在 foe / known
	var cred := cred_of(a, i)
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
	if not known and not foe.has(i) \
			and cred >= rule("ALMOST", "friendCred", 0.5) \
			and ck.size() >= int(rule("ALMOST", "friendKinds", 2)) and cf.size() >= 1:
		var since2 := int(sim.night)
		if had_friend and (friend[i] as Dictionary).get("since") != null:
			since2 = int((friend[i] as Dictionary).get("since", since2))
		friend[i] = {"t": ev_now(), "cred": cred, "kinds": ck.keys(),
			"since": since2, "conf": rule("ALMOST", "friendConf", 0.7)}
		if not had_friend:
			sim._stat("almostFriendCount", 1)
	else:
		friend.erase(i)
	al["foe"] = foe
	al["friend"] = friend
	a["almost"] = al


func pub_accusers(i: int) -> Array:
	var out: Array = []
	for w: Dictionary in sim.agents:
		if int(w.get("i", -1)) == i or not bool(w.get("alive", false)):
			continue
		if int(w.get("accuse", -1)) == i:
			out.append(int(w.get("i", -1)))
	return out


func pub_solid_accusers(i: int) -> Array:
	var out: Array = []
	for k: int in pub_accusers(i):
		var w: Dictionary = sim.agent(k)
		var why: Variant = w.get("accuseWhy", null)
		if why is Dictionary and bool((why as Dictionary).get("solid", false)):
			out.append(k)
	return out


func public_heat(i: int) -> float:
	var n := pub_accusers(i).size()
	if n == 0:
		return 0.0
	# 2.5D publicHeat：min(1, 0.30 + 0.16*(n-1))，系数由函数指纹对账
	var fp: Dictionary = sim.rules.fn("SKT2AI.publicHeat")
	var nums: Array = fp.get("nums", []) as Array
	var base := float(nums[1]) if nums.size() > 1 else 0.30
	var step := float(nums[2]) if nums.size() > 2 else 0.16
	return minf(1.0, base + step * float(n - 1))


func public_influence(w: Dictionary) -> float:
	var acc: Variant = w.get("accuse", -1)
	if acc == null or int(acc) < 0:
		return 0.0
	var follow := 0
	for o: Dictionary in sim.agents:
		if o == w or not bool(o.get("alive", false)) or bool(o.get("downed", false)):
			continue
		if int(o.get("accuse", -1)) == int(acc):
			follow += 1
	var fp: Dictionary = sim.rules.fn("SKT2AI.publicInfluence")
	var nums: Array = fp.get("nums", []) as Array
	var k := float(nums[nums.size() - 1]) if nums.size() > 0 else 0.34
	return minf(1.0, float(follow) * k)


func hypotheses(a: Dictionary, max_n: int = 3) -> Array:
	var xs: Array = []
	var sum := 0.0
	for k in (a.get("sus", {}) as Dictionary).keys():
		var i := int(k)
		var v := sus_of(a, i)
		if v <= 0.0 or not live_target(i, int(a.get("i", -1))):
			continue
		xs.append({"i": i, "v": v})
		sum += v
	if xs.is_empty():
		return []
	xs.sort_custom(func(x, y): return float(x["v"]) > float(y["v"]))
	var out: Array = []
	for j in mini(max_n, xs.size()):
		var x: Dictionary = xs[j]
		out.append({"i": int(x["i"]), "w": float(x["v"]) / sum if sum > 0.0 else 0.0,
			"raw": float(x["v"])})
	return out


func refresh_hyps(a: Dictionary) -> Array:
	var h := hypotheses(a, 3)
	a["hyps"] = h
	return h


## 一条假说背后有没有实证（heard_* / empty_accuse / silent / doubt 不算）。
func hypothesis_evidence(a: Dictionary, i: int) -> Dictionary:
	var arr: Array = (a.get("why", {}) as Dictionary).get(i, []) as Array
	var kinds: Dictionary = {}
	var nights: Dictionary = {}
	var n := 0
	var direct := 0
	for r: Variant in arr:
		if not (r is Dictionary):
			continue
		var rec := r as Dictionary
		var k := String(rec.get("kind", ""))
		if k == "" or k.begins_with("heard_") or k == "empty_accuse" or \
				k == "silent" or k == "doubt":
			continue
		n += 1
		kinds[k] = true
		nights[int(rec.get("night", -1))] = true
		if rec.has("x") and rec.has("y") and \
				Vector2(float(rec["x"]), float(rec["y"])).length() > 0.01:
			direct += 1
	return {"n": n, "kinds": kinds.keys(), "nights": nights.keys(), "direct": direct}


## 2.5D hypothesisSpread：两条假说权重接近 + 双方都有独立实证才判"竞争 → 弃权"。
func hypothesis_spread(a: Dictionary) -> Dictionary:
	var h := hypotheses(a, 3)
	var gap := float(h[0]["w"]) - float(h[1]["w"]) if h.size() >= 2 else 1.0
	var thr := rule("MIND", "hypGap", 0.08)
	var min_top := rule("MIND", "hypMinTop", 0.34)
	var min_ev := int(rule("MIND", "hypMinEvidence", 2))
	var need_direct := int(rule("MIND", "hypRequireDirect", 1)) > 0
	var need_indep := int(rule("MIND", "hypRequireIndependent", 1)) > 0
	var e0: Dictionary = hypothesis_evidence(a, int(h[0]["i"])) if h.size() >= 2 else {}
	var e1: Dictionary = hypothesis_evidence(a, int(h[1]["i"])) if h.size() >= 2 else {}
	var independent := true
	if need_indep and not e0.is_empty() and not e1.is_empty():
		var only: Array = []
		for k: String in (e0.get("kinds", []) as Array):
			if not (e1.get("kinds", []) as Array).has(k):
				only.append(k)
		for k2: String in (e1.get("kinds", []) as Array):
			if not (e0.get("kinds", []) as Array).has(k2):
				only.append(k2)
		independent = not only.is_empty()
	var evidence_ok: bool = not e0.is_empty() and not e1.is_empty() and \
		int(e0.get("n", 0)) >= min_ev and int(e1.get("n", 0)) >= min_ev and \
		(not need_direct or (int(e0.get("direct", 0)) >= 1 and int(e1.get("direct", 0)) >= 1)) and \
		independent
	var top_ok: bool = h.size() >= 2 and float(h[0]["w"]) >= min_top
	return {"hyps": h, "gap": gap, "evidence": {"a": e0, "b": e1,
		"independent": independent, "ok": evidence_ok},
		"thr": thr, "minTop": min_top,
		"competing": top_ok and gap <= thr and evidence_ok}


## 投票分：综合嫌疑 + 公开热度 − 关系/信任护盾 + 沉默噪声。
## cred / warm 都是**相对目标**的；护盾走 credVoteShield 纯函数。
func vote_score(voter: Dictionary, target_i: int) -> float:
	var score := sus_of(voter, target_i)
	var warm: Dictionary = voter.get("warm", {}) as Dictionary
	score -= float(warm.get(target_i, 0.0)) * rule("WARM", "friendVoteShield", 0.45)
	score -= cred_vote_shield(cred_of(voter, target_i))
	if bool(voter.get("silent", false)):
		score += rule("MIND", "silentTalkMul", 0.6) * rule("MIND", "silentSus", 0.1)
	return score


## 信誉广播（2.5D credBroadcast，js/game.js:1655）：
## 有人做了一件"正经事"（修好故障 / 救人 / 拖到医疗间 / 合闸 / 做完任务），
## 在场的人分两路记账：
##   · 人类目击者 → 对**那个人**的信誉 +w0（洗白）
##   · 异形目击者 → 对那个人的**等值敌对分**（一体两面：同��件事，换个视角看就是两套账）
## 已认出的队友不计（异形知道自己人）。
## 权重按可见情境抽样（witnessCtxMul 的同源口径）：人越多、断电、附近刚出过事
## ⇒ 每个人记得越浅。
func cred_broadcast(actor_i: int, kind: String, at: Vector2) -> void:
	if sim == null or sim.rules == null:
		return
	var actor: Dictionary = sim.agent(actor_i)
	if actor.is_empty():
		return
	var gains: Dictionary = (sim.rules.t("CRED").get("gains", {}) as Dictionary)
	if not gains.has(kind):
		return
	var w0 := float(gains[kind])
	if w0 == 0.0:
		return
	var sight_r: float = 14.0
	var seen: Array = []
	var foes: Array = []
	for w: Dictionary in sim.agents:
		if w == actor or not bool(w.get("alive", false)):
			continue
		if bool(w.get("downed", false)) or bool(w.get("detained", false)):
			continue
		# attention：站桩 / 会议中的人注意力不在线（2.5D attention()）
		if float(w.get("doing", 0.0)) > 0.0:
			continue
		var wp: Vector2 = w.get("pos", Vector2.ZERO)
		if wp.distance_to(at) > sight_r:
			continue
		if sim.nav != null and not sim.nav.los(wp, at):
			continue
		if bool(w.get("alien", false)):
			# 已认出的队友不计入（异形知道自己人，这不是读心）
			if not _is_mate(w, actor_i):
				foes.append(w)
		else:
			seen.append(w)
	var n_all := seen.size() + foes.size()
	var base := _witness_ctx_mul(at, n_all)
	for w2: Dictionary in seen:
		var jit: float = maxf(0.72, minf(1.10, base * (0.94 + sim._rng.randf() * 0.12)))
		cred_add(w2, actor_i, kind, w0 * jit)
	for w3: Dictionary in foes:
		var jit2: float = maxf(0.72, minf(1.10, base * (0.94 + sim._rng.randf() * 0.12)))
		# 2.5D:1840：假工作是异形专属行为 —— 异形目击者认出队友
		if kind == "fakeWork" or kind == "fakeRepair":
			var mm: Dictionary = (w3.get("mates", {}) as Dictionary).duplicate()
			mm[actor_i] = {"t": ev_now(), "kind": "saw_fake_task"}
			w3["mates"] = mm
		sus_add(w3, actor_i, w0 * jit2, "seen_work",
			{"kind": kind, "src": "sight", "actor": actor_i,
			"x": at.x, "y": at.y, "room": sim.room_at(at), "night": int(sim.night)})


## 情境系数（2.5D witnessCtxMul，js/game.js:1676 的同源口径）：
## 人越多记得越浅 / 断电再降 / 附近 8 秒内刚出过事再降。
func _witness_ctx_mul(at: Vector2, n_seen: int) -> float:
	var m := 1.0
	var n := maxi(1, n_seen)
	if n > 1:
		m -= minf(0.16, float(n - 1) * 0.04)
	if not bool(sim.power_on):
		m -= 0.14
	# 事件流从尾部往前扫，超过 8 秒就停（2.5D 同一口径，避免每帧扫全量事件）
	var L: float = sim.night_len()
	var now: float = L - maxf(0.0, float(sim.t))
	var near := 0
	for k in range(sim.events.size() - 1, -1, -1):
		var e: Dictionary = sim.events[k]
		if int(e.get("night", -1)) != int(sim.night):
			continue
		var ev_t: Variant = e.get("t", null)
		if not (ev_t is int or ev_t is float):
			continue
		var at_t: float = L - float(ev_t)
		if at_t > now:
			continue
		if now - at_t > 8.0:
			break
		var ex: Variant = e.get("x", null)
		var ey: Variant = e.get("y", null)
		if not (ex is int or ex is float) or not (ey is int or ey is float):
			continue
		var kind := String(e.get("kind", ""))
		if kind != "knife" and kind != "bot_hit" and kind != "bot_down" \
				and kind != "breaker" and kind != "sabotage":
			continue
		if Vector2(float(ex), float(ey)).distance_to(at) > 8.0:
			continue
		near += 1
	if near > 0:
		m -= minf(0.12, float(near) * 0.04)
	return m


## 异形是否已认出对方是队友（2.5D isMate：只认**自己亲眼见过**的队友）。
## 3D 之前没有这套记忆 —— 异形互相完全不认人，协同能力因此为零。
func _is_mate(w: Dictionary, other_i: int) -> bool:
	var mates: Dictionary = w.get("mates", {}) as Dictionary
	return mates.has(other_i)


## 追责（2.5D settleAccountability，js/game.js:1529）：
## 投票结果公布后清算"带节奏"的人：
##   · 被驱逐的**真是异形** → 投对的人信誉上升（别人更信他的判断）
##   · 被驱逐的是**人类**   → 投错的人信誉下降，带头的人还被记一笔嫌疑
## 第一个指控 / 第一个投的人权重最高（leadMul），跟票的按 voterMul 计。
## 数值全部读 ACCOUNT / RELIA / META 表。
func settle_accountability(cand_i: int, votes: Dictionary, lead: int = -1) -> void:
	if cand_i < 0 or votes.is_empty():
		return
	var cand: Dictionary = sim.agent(cand_i)
	if cand.is_empty():
		return
	var was_alien := bool(cand.get("alien", false))
	var voters: Array = []
	for k: int in votes.keys():
		if int(votes[k]) == cand_i:
			voters.append(int(k))
	if voters.is_empty():
		return
	var lead_i := lead if lead >= 0 else int(voters[0])
	var acc: Dictionary = sim.rules.t("ACCOUNT")
	var correct: Dictionary = acc.get("correct", {}) as Dictionary
	var wrong: Dictionary = acc.get("wrong", {}) as Dictionary
	var lead_mul := float(acc.get("leadMul", 2.2))
	var voter_mul := float(acc.get("voterMul", 0.55))
	for vi: int in voters:
		var src: Dictionary = sim.agent(vi)
		if src.is_empty():
			continue
		var is_lead := vi == lead_i
		var mul := lead_mul if is_lead else voter_mul
		for w: Dictionary in sim.agents:
			if w == src or w == cand:
				continue
			if not bool(w.get("alive", false)) or bool(w.get("downed", false)):
				continue
			if was_alien:
				# 投对：信誉上升 + 证言可信度上升（他带对了 → 以后他说的话更值钱）
				cred_add(w, vi, "", float(correct.get("cred", 0.1)) * mul)
				relia_add(w, vi, rule("RELIA", "leadRight", 0.35) if is_lead
					else rule("RELIA", "voteRight", 0.15))
			else:
				# 投错：信誉下降 + 证言可信度下降
				cred_add(w, vi, "", float(wrong.get("cred", -0.14)) * mul)
				relia_add(w, vi, -(rule("RELIA", "leadWrong", 0.30) if is_lead
					else rule("RELIA", "voteWrong", 0.12)))
				# 只有带头的人会被"记仇"式追责，跟票的只掉信誉 —— 否则一票之差错杀全队
				if is_lead:
					sus_add(w, vi, float(wrong.get("sus", 0.09)) * mul, "wrong_accuse",
						{"kind": "wrong_accuse", "src": "vote", "actor": vi})
	# 元推理 F2 回溯（2.5D settleAccountability 尾段）：被驱逐的真是异形 →
	# 当初公开替他辩护的人被回溯算账 + 获得「我上次看走眼了」的发言标记。
	# 软联盟（META）：反复替同一人说话（ally ≥ allyCount）的比只保过一次的更可疑。
	if was_alien:
		var defense_log: Dictionary = sim.meeting.get("defenseLog", {}) as Dictionary
		var meta: Dictionary = sim.rules.t("META")
		var ally_count := int(meta.get("allyCount", 2))
		var ally_sus := float(meta.get("allySus", 0.16))
		var ally_mul := float(meta.get("allyMul", 1.7))
		for k: int in defense_log.keys():
			var def_a: Dictionary = sim.agent(k)
			if def_a.is_empty() or k == cand_i:
				continue
			if not bool(def_a.get("alive", false)) or bool(def_a.get("downed", false)):
				continue
			var v: Dictionary = defense_log[k] as Dictionary
			if not v.has(cand_i):
				continue
			var ally_n := int((def_a.get("ally", {}) as Dictionary).get(cand_i, 0))
			var strong := ally_n >= ally_count
			var wgt := ally_sus * ally_mul if strong else 0.18
			var kind := "ally_revealed" if strong else "defended_revealed"
			for w: Dictionary in sim.agents:
				if w == def_a or w == cand:
					continue
				if not bool(w.get("alive", false)) or bool(w.get("downed", false)):
					continue
				sus_add(w, k, wgt, kind,
					{"kind": kind, "src": "vote", "actor": k})
			def_a["_retract"] = cand_i
			sim._stat("retractCount", 1)
			if strong:
				sim._stat("allyRevealed", 1)
	sim._log("account", {"victim": cand_i, "alien": was_alien,
		"lead": lead_i, "voters": voters.size()})


## 天亮：情绪/关系/可信度按真源系数回归，嫌疑不硬清（保留跨夜记忆）。
## 2.5D 口径（js/t2/ai.js#mindReset）：
##   · known 是**长期记忆**（亲眼确认的身份结论不随夜晚清空）；
##   · sus 分类型衰减（目击 0.72 / 传闻 0.45），本夜无新证据再 ×0.55，封顶 CARRY.cap；
##   · cred 跨夜保留、按 CRED.decay 慢衰减；reliability ×0.9 回归 base；
##   · warm 每夜 ×0.85；情绪记忆每夜 ×0.8。
func reset_night() -> void:
	var warm_decay := rule("WARM", "decay", 0.85)
	var cred_decay := rule("CRED", "decay", 0.92)
	var cred_cap := rule("CRED", "cap", 1.2)
	var rel_base := rule("RELIA", "base", 0.5)
	var rel_carry := rule("RELIA", "carry", 0.9)
	var rel_min := rule("RELIA", "min", 0.05)
	var rel_max := rule("RELIA", "max", 1.0)
	# CARRY：嫌疑跨夜衰减的三条护栏
	var decay_sight := rule("CARRY", "decaySight", 0.72)
	var decay_hear := rule("CARRY", "decayHear", 0.45)
	var stale_mul := rule("CARRY", "staleMul", 0.55)
	var carry_cap := rule("CARRY", "cap", 0.55)
	var carry_floor := rule("CARRY", "floor", 0.05)
	var why_keep := int(rule("CARRY", "whyKeep", 4))
	var gn := int(sim.night)
	for a: Dictionary in sim.agents:
		# ① warm 每夜衰减
		var w: Dictionary = (a.get("warm", {}) as Dictionary).duplicate()
		for k: int in w.keys():
			w[k] = float(w[k]) * warm_decay
		a["warm"] = w
		# ② cred 跨夜慢衰减（洗白是长期投资）
		var cred_old: Dictionary = (a.get("cred", {}) as Dictionary).duplicate()
		var cred_out: Dictionary = {}
		for k2: int in cred_old.keys():
			var v := float(cred_old[k2]) * cred_decay
			if v > 0.04:
				cred_out[k2] = minf(cred_cap, v)
		a["cred"] = cred_out
		# ③ reliability 跨夜回归 base
		var rel_old: Dictionary = (a.get("reliability", {}) as Dictionary).duplicate()
		var rel_out: Dictionary = {}
		for k3: int in rel_old.keys():
			rel_out[k3] = clampf(rel_base + (float(rel_old[k3]) - rel_base) * rel_carry,
				rel_min, rel_max)
		a["reliability"] = rel_out
		# ④ sus 分类型跨夜衰减：目击留得久、传闻掉得快；本夜无新证据再 ×0.55
		var sus_old: Dictionary = (a.get("sus", {}) as Dictionary).duplicate()
		var why_old: Dictionary = (a.get("why", {}) as Dictionary).duplicate()
		var sus_night: Dictionary = (a.get("susNight", {}) as Dictionary).duplicate()
		var sus_out: Dictionary = {}
		var why_out: Dictionary = {}
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
			var nv := sv * (decay_sight if sight else decay_hear)
			if not fresh:
				nv *= stale_mul
			nv = minf(carry_cap, nv)
			if nv >= carry_floor:
				sus_out[k4] = nv
				var keep: Array = why_arr.slice(maxi(0, why_arr.size() - why_keep))
				if not keep.is_empty():
					why_out[k4] = keep
		a["sus"] = sus_out
		a["why"] = why_out
		# susNight 只保留**还活着的那批嫌疑**的夜戳（2.5D keepSusNight）。
		# 3D 原来一律清空，于是第二天所有存量都判成"本夜无新证据"，
		# 每夜都多挨一次 staleMul ×0.55 —— 跨夜嫌疑衰减比真源陡得多。
		var sn_out: Dictionary = {}
		for k6: int in sus_out.keys():
			if sus_night.has(k6):
				sn_out[k6] = int(sus_night[k6])
		a["susNight"] = sn_out
		# ⑤ known 是长期记忆：**不清**
		# ⑥ almost 跨夜保留，条件不成立时由 evalAlmost 就地推翻
		#    （2.5D mindReset, js/t2/ai.js:270 `almost:{foe:Object.assign({},oldM.almost.foe),...}`）。
		#    3D 此前每夜清空重算，与真源不符，第七批按真源恢复。
		var almost_old: Dictionary = (a.get("almost", {}) as Dictionary).duplicate(true)
		a["almost"] = {
			"foe": (almost_old.get("foe", {}) as Dictionary).duplicate(),
			"friend": (almost_old.get("friend", {}) as Dictionary).duplicate(),
		}
		for k5: int in sus_out.keys():
			eval_almost(a, k5)
		# 2.5D mindReset(js/t2/ai.js:253)：heard 是**整局**滑动窗口，不跨夜清零；
		# 真源注释明确记载「试过每场重置 10 条，1000 局 0 次触发，机制空转，所以只能是整局口径」，
		# 且只收听来的证词（窗口长度 ATTN.heardMax 由 note_testimony 维护，见本文件:697）。
		# 3D 此前每夜 `a["heard"] = []` 实现了真源明确否决过的方案，第七批拨正。
		a["heard"] = (a.get("heard", []) as Array).duplicate()
		a["hyps"] = []
		a["talkN"] = 0
		a["silent"] = false
		a["exposure"] = float(a.get("exposure", 0.0)) * decay_sight
		a["alibi"] = {}
		# 情绪记忆跨会议保留、每场 ×0.8 衰减，低于 0.05 才忘（2.5D mindReset keepEmo）。
		# 「被谁咬过、被谁护过」不是只活在当夜的东西。
		var emo_decay := 0.8
		for key in ["trust", "grudge"]:
			var old_emo: Dictionary = (a.get(key, {}) as Dictionary).duplicate()
			var emo_out: Dictionary = {}
			for ke: int in old_emo.keys():
				var ev2 := float(old_emo[ke]) * emo_decay
				if ev2 > 0.05:
					emo_out[ke] = ev2
			a[key] = emo_out
		# ally（谁替谁说过话）跨夜保留；credWhy 跟着 cred 一起裁掉已衰减的条目。
		a["ally"] = (a.get("ally", {}) as Dictionary).duplicate()
		var cw_old: Dictionary = (a.get("credWhy", {}) as Dictionary).duplicate()
		var cw_out: Dictionary = {}
		for kc: int in cw_old.keys():
			if (a.get("cred", {}) as Dictionary).has(kc):
				cw_out[kc] = cw_old[kc]
		a["credWhy"] = cw_out
		# 信念版本号每夜归零；「看见尸体」的记忆按夜清空（quick_report 只认当夜）。
		a["rev"] = 0
		a["bodySeen"] = {}
		# 2.5D mindReset（js/t2/ai.js:257/258/283）：按夜清空的观察闸门
		a["lastBody"] = {}
		a["redSeen"] = {}
		a["avoidSeen"] = {}
		# 2.5D mindReset（js/t2/ai.js:275）：口供史只留最近 3 场，只进语料、不产生嫌疑。
		a["claimHist"] = ((a.get("claimHist", []) as Array).slice(-3)).duplicate()
		# 2.5D mindReset(js/t2/ai.js:280)：humanT 走 keepEmo（×0.8，<0.05 遗忘）。
		var ht_old: Dictionary = (a.get("humanT", {}) as Dictionary).duplicate()
		var ht_out: Dictionary = {}
		for kh: int in ht_old.keys():
			var hv := float(ht_old[kh]) * 0.8
			if hv > 0.05:
				ht_out[kh] = hv
		a["humanT"] = ht_out
		# 2.5D startNight 每夜重置：作案记账 / 假口供 / 修订标记 / 伙同目标
		a["_killAt"] = 0.0
		a["_lie"] = {}
		a["_retract"] = null
		a["_busTarget"] = -1
		a["order"] = {}
