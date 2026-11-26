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

const MindAxes := preload("res://scripts/sim/mind_axes.gd")
const MindAccount := preload("res://scripts/sim/mind_account.gd")

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
	return MindAxes.id_evidence(self)


## 2.5D IDENTITY（js/game.js:7040，rules.json#constants.IDENTITY）
func identity_cfg() -> Dictionary:
	return MindAxes.identity_cfg(self)


## 2.5D hasIdEvidence（js/game.js:7054）：almost.foe 的 kinds 里有“人类做不到”的证据。
func has_id_evidence(entry: Dictionary) -> bool:
	return MindAxes.has_id_evidence(self, entry)


## 2.5D identityPrior（js/game.js:7057）：H 的先验，按 15 席 / 4 异形的公开配置
## 条件化已认出的队友（异形）或已确证的异形（人类）；不读系统阵营表。
func identity_prior(a: Dictionary) -> float:
	return MindAxes.identity_prior(self, a)


## 2.5D currentPrior / trustRaw / effT / axisAddT / trustCert / budgetT（js/t2/ai.js）
func current_prior() -> float:
	return MindAxes.current_prior(self)


func trust_raw(a: Dictionary, ti: int) -> float:
	return MindAxes.trust_raw(self, a, ti)


func trust_score(a: Dictionary, ti: int) -> float:
	return trust_raw(a, ti)


func eff_t(a: Dictionary, ti: int) -> float:
	return MindAxes.eff_t(self, a, ti)


func belief_of(a: Dictionary, ti: int, for_night: bool = false) -> float:
	return MindAxes.belief_of(self, a, ti, for_night)


func cred_raw(a: Dictionary, ti: int) -> float:
	return MindAxes.cred_raw(self, a, ti)


func axis_add_t(a: Dictionary, ti: int, w: float) -> float:
	return MindAxes.axis_add_t(self, a, ti, w)


func trust_cert(a: Dictionary, ti: int, is_alien: bool) -> void:
	MindAxes.trust_cert(self, a, ti, is_alien)


func budget_t(a: Dictionary, ti: int, delta: float, reason: String = "") -> float:
	return MindAxes.budget_t(self, a, ti, delta, reason)


## 2.5D identityAxis（js/t2/ai.js:156）：h = P(目标是人类 | 确证 + T+E 合成轴)。
func identity_axis(a: Dictionary, t: Dictionary) -> float:
	return MindAxes.identity_axis(self, a, t)


func identity_alien(a: Dictionary, t: Dictionary) -> Variant:
	return MindAxes.identity_alien(self, a, t)


## 2.5D hostileProb（js/t2/ai.js:188）：异形看 h（越像人越敌对），人类看 1-h。
func hostile_prob(a: Dictionary, t: Dictionary) -> float:
	return MindAxes.hostile_prob(self, a, t)


func trust_prob(a: Dictionary, t: Dictionary) -> float:
	return 1.0 - hostile_prob(a, t)


func hostile_to(a: Dictionary, t: Dictionary) -> bool:
	return hostile_prob(a, t) > 0.5


func axis_threat(a: Dictionary, ti: int) -> float:
	return MindAxes.axis_threat(self, a, ti)


## 2.5D emoAdd / emotionOf（js/game.js:1808, 1842）：短期情绪轴 E ∈ [-100, 100]。
func emo_add(a: Dictionary, ti: int, w: float, _reason: String = "") -> void:
	MindAxes.emo_add(self, a, ti, w, _reason)


func emotion_of(a: Dictionary, ti: int) -> float:
	return MindAxes.emotion_of(a, ti)


## 2.5D targetDistMul（js/game.js:7111）：h=1 → 0.5× 风险分，h=0 → 1.25×。
func target_dist_mul(h: float) -> float:
	return MindAxes.target_dist_mul(self, h)


## 2.5D traits.js 的 b(a,axis)：性格轴相对中性的偏移（已乘 TRAIT_GAIN）。
func trait_b(a: Dictionary, axis: String) -> float:
	return MindAxes.trait_b(self, a, axis)


## 2.5D SKTrait.C 具名系数：公式按 traits.js 移植，数值读 rules.json#tables.SKTrait.C[*].nums
## （nums 就是该函数里的字面量序列，避免在 GDScript 里另抄一份阈值）。
func trait_c(name: String, a: Dictionary) -> float:
	return MindAxes.trait_c(self, name, a)


## 开局心智档案：性格轴按 SKTrait.AXES / BANDS 三档抽（28/50/72，30/40/30）。
func init_agent(a: Dictionary) -> void:
	MindAxes.init_agent(self, a)


func sus_of(a: Dictionary, target_i: int) -> float:
	return float((a.get("sus", {}) as Dictionary).get(target_i, 0.0))


## 嫌疑读值（2.5D susOf 的 forNight 分支）：跨夜存量对**夜间行动**打 0.7 折 ——
## 否则天亮第一分钟就有人凭昨晚的旧印象去开枪。会议指控/投票读全额。
func sus_of_night(a: Dictionary, target_i: int) -> float:
	return MindAxes.sus_of_night(self, a, target_i)


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
	return 0.5


## alibiTimeWord（sanity.js:720）：证据新鲜度 → 口语时间词。
func alibi_time_word(age: float) -> String:
	return MindAccount.alibi_time_word(self, age)


## reliaMul（sanity.js:999）：传闻权重放大系数 (0.5 + reliability) → 0.5~1.5 倍。
func relia_mul(rel: Variant) -> float:
	return MindAccount.relia_mul(self, rel)


## beliefEntropy（sanity.js:1033）：把 sus 归一化成分布后求香农熵（nats）。
## 高熵 = 谁都像 → 犹豫语气不点名；低熵 = 一人独高 → 敢点名。
func belief_entropy(a: Dictionary, skip_i: int = -1) -> float:
	return MindAxes.belief_entropy(a, skip_i)


## credVoteShield（sanity.js:1424）：信誉 → 投票回避概率（上限 0.85）。
func cred_vote_shield(cred: float) -> float:
	return MindAxes.cred_vote_shield(self, cred)


## credTestimony（sanity.js:1053）：信誉 → 证言权重倍率（1.0 ~ 1.6）。
func cred_testimony(cred: float) -> float:
	return MindAxes.cred_testimony(self, cred)


## alibiReach（sanity.js:1062）：不在场证明的**可达性反事实** ——
## 从 A 走到 B 在 Δt 秒内来得及吗？来不及 ⇒ 口供不可能成立。
## 墙与门的绕行由调用方留 2 秒余量吸收（+2 写在判据里）。
func alibi_reach(dist: float, dt_sec: Variant, speed: float) -> Dictionary:
	return MindAccount.alibi_reach(dist, dt_sec, speed)


## disguiseRisk（sanity.js:263）：风险纯函数 —— 只做加总与夹取。
## p 的键：redHot / donePoint / repeatSpot / breakerLoss / realCost / idle /
## audience / dark（2.5D DISGUISE.risk 的全部字段）。
func disguise_risk(p: Dictionary) -> float:
	return MindAxes.disguise_risk(self, p)


## disguiseScore（sanity.js:278）：伪装收益 = 观众权重 × 不被识破概率 − 时间 − 风险。
## 没观众 = 一分不值；valueMul 由调用方按 CRED.gains 比值传入（缺省 1 = 与伪装同值）。
func disguise_score(audience: float, risk: float, duration: float,
		value_mul: float = 1.0) -> float:
	return MindAxes.disguise_score(self, audience, risk, duration, value_mul)


## evNow（t2/ai.js:194）：夜内已过秒数（NIGHT.len - 剩余 t）。
func ev_now() -> float:
	return maxf(0.0, sim.night_len() - maxf(0.0, float(sim.t)))


## crimeWindow（t2/ai.js:179）：案发口径的时间窗 —— 死亡/倒地时刻 ±ALIBI.core 秒。
func crime_window(victim_i: int) -> Dictionary:
	return MindAccount.crime_window(self, victim_i)


## claimWindow（t2/ai.js:469）：口供时间窗 —— night（整夜）/ recent（ALIBI.recent）/ 默认回看。
func claim_window(when: String) -> Dictionary:
	return MindAccount.claim_window(self, when)


## susCut（t2/ai.js:444）：嫌疑削减 —— 洗白侧的对称操作。
## known 的人不可削减（亲眼确证洗不掉）；削减量记进 alibi 备忘。
func sus_cut(a: Dictionary, target_i: int, w: float, reason: String,
		ev: Dictionary = {}) -> void:
	MindAccount.sus_cut(self, a, target_i, w, reason, ev)


## susAddContradiction（t2/ai.js:476）：拆谎成立的嫌疑记账 + 遥测计数。
func sus_add_contradiction(a: Dictionary, target_i: int, weight: float,
		reason: String, ev: Dictionary = {}) -> void:
	MindAccount.sus_add_contradiction(self, a, target_i, weight, reason, ev)


## oldQuantifierWouldFire（t2/ai.js:485）：诊断函数 —— 旧量词（∃ 不匹配 → 定罪）
## 在这份记忆上会不会冤枉人。只统计，不改行为。
func old_quantifier_would_fire(w: Dictionary, subj: int, claim_room: String) -> bool:
	return MindAccount.old_quantifier_would_fire(self, w, subj, claim_room)


## knownOverride（t2/ai.js:428）：确证硬覆盖 —— 亲眼确证洗掉 almost.friend 与 cred。
func known_override(w: Dictionary, target_i: int) -> void:
	MindAccount.known_override(self, w, target_i)


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
	return MindAccount.sequence_cue(self, a, target_i)


## statementRelation（t2/ai.js:164）：证言间关系 —— 同一目标既被指控又被背书时，
## 公开声势不该照样滚雪球。返回压声系数 damp ∈ [0.4, 1]。
## testimony/vouches 是 [ {by, tgt, said, reason} ] 形态（said=已说出口）。
func statement_relation(testimony: Array, vouches: Array, tgt: int) -> Dictionary:
	return MindAccount.statement_relation(testimony, vouches, tgt)


## envEstimate（t2/ai.js:613）：a 估「i 有多像异形」。只读 a 自己的记忆 + 公开事件
## + 世界状态，**不读别人的私有 mind**（读心清零，2026-11-05 用户裁定）。
## 返回 {score, conf, whyKind, cues}：score 允许错，conf 随线索间接度降低。
func env_estimate(a: Dictionary, target_i: int) -> Dictionary:
	return MindAccount.env_estimate(self, a, target_i)


## audSusEstimate（t2/ai.js:676）：a 估「w 现在有多怀疑我」——
## 只用 a 自己知道的：w 有没有当众指认我、w 刚看见我在现场、我还带不带红光。
## 绝不读 w.mind.sus。
func aud_sus_estimate(a: Dictionary, w: Dictionary) -> Dictionary:
	return MindAccount.aud_sus_estimate(self, a, w)


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
	# 2.5D observeBody:2193-2196：记住「这里有自己缺的物资」的尸体/倒地伤员，
	# 即使离开视野，30 秒内也会专门绕回来收（lootRun 的 _lootMem 那一半）。
	if sim.body_has_loot(v) and sim.ai_wants_loot(a, v):
		var mem: Dictionary = (a.get("_lootMem", {}) as Dictionary).duplicate()
		mem[victim_i] = {"t": sim.elapsed, "x": bp.x, "y": bp.y, "room": rid}
		a["_lootMem"] = mem
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
	if rid != "":
		var now: float = sim.night_len() - maxf(0.0, float(sim.t))
		var core := rule("ALIBI", "core", 8.0)
		var nb_w := absf(rule("MAPPING", "nearBody", -10.0)) * rule("AXIS", "scoreMul", 0.6) / maxf(1.0, rule("AXIS", "cap", 200.0))
		var why_map: Dictionary = (a.get("why", {}) as Dictionary).duplicate()
		for subj: int in why_map.keys():
			for e: Variant in (why_map[subj] as Array):
				var rec := e as Dictionary
				if String(rec.get("kind", "")) != "saw_agent" or int(rec.get("night", -1)) != int(sim.night) \
						or String(rec.get("room", "")) != rid or absf(now - float(rec.get("t", 0.0))) > core:
					continue
				sus_add(a, subj, nb_w, "near_body", {"kind": "near_body", "src": "sight", "night": int(sim.night)})
	# 看到尸体/伤者抬高警觉
	a["alert"] = minf(1.0, float(a.get("alert", 0.0)) + 0.45)


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


## 2.5D grudgeAdd / trustAdd：同步写入 E（±100）与兼容旧字段。
func grudge_add(a: Dictionary, target_i: int, amount: float) -> void:
	if a.is_empty() or target_i < 0 or target_i == int(a.get("i", -1)):
		return
	if sim == null or sim.rules == null:
		return
	var gain := amount * trait_c("grudgeGain", a)
	var g: Dictionary = (a.get("grudge", {}) as Dictionary).duplicate()
	g[target_i] = clampf(float(g.get(target_i, 0.0)) + gain, 0.0, 2.0)
	a["grudge"] = g
	var emap: Dictionary = (a.get("E", {}) as Dictionary).duplicate()
	emap[target_i] = clampf(float(emap.get(target_i, 0.0)) - gain * 100.0, -100.0, 100.0)
	a["E"] = emap


func trust_add(a: Dictionary, target_i: int, amount: float) -> void:
	if a.is_empty() or target_i < 0 or target_i == int(a.get("i", -1)):
		return
	if sim == null or sim.rules == null:
		return
	var gain := amount * trait_c("trustGain", a)
	var t: Dictionary = (a.get("trust", {}) as Dictionary).duplicate()
	t[target_i] = clampf(float(t.get(target_i, 0.0)) + gain, 0.0, 2.0)
	a["trust"] = t
	var emap: Dictionary = (a.get("E", {}) as Dictionary).duplicate()
	emap[target_i] = clampf(float(emap.get(target_i, 0.0)) + gain * 100.0, -100.0, 100.0)
	a["E"] = emap


func is_patron(a: Dictionary, target_i: int) -> bool:
	return emotion_of(a, target_i) >= 0.8 or float((a.get("trust", {}) as Dictionary).get(target_i, 0.0)) >= 0.8


func best_grudge(a: Dictionary) -> Dictionary:
	if a.is_empty():
		return {}
	var g: Dictionary = a.get("grudge", {}) as Dictionary
	var emap: Dictionary = a.get("E", {}) as Dictionary
	var alien := bool(a.get("alien", false))
	var mates: Dictionary = a.get("mates", {}) as Dictionary
	var keys: Dictionary = {}
	for k: int in g.keys():
		keys[k] = true
	for k2: int in emap.keys():
		keys[k2] = true
	var best := -1
	var bv := 0.0
	for k3: int in keys.keys():
		var t: Dictionary = sim.agent(k3)
		if t.is_empty() or t == a or not bool(t.get("alive", false)) or bool(t.get("downed", false)):
			continue
		if alien and mates.has(k3):
			continue
		var ev := maxf(0.0, -float(emap.get(k3, 0.0)) / 100.0)
		var gv := float(g.get(k3, 0.0))
		var v := maxf(ev, gv)
		if v > bv:
			bv = v
			best = k3
	return {"i": best, "score": bv} if best >= 0 else {}


## 2.5D recordClaim（js/game.js:1624）：口供史只留最近 3 场，只进语料、不产生嫌疑。
func record_claim(a: Dictionary, room_id: String) -> void:
	MindAccount.record_claim(self, a, room_id)


## 亲眼目击：不进 heard 窗口；why 按目标累积证据记录（2.5D evPush 口径）。
## 证据分级（2.5D CONFIRM，2026-11-02 用户裁定"AI 判定太神"）：
##   · d ≤ CONFIRM.nearR(4.5) → 写 known（确证，会议里敢说"我确定"）
##   · d > nearR → **不写 known**，只按原权重加嫌疑（喂给 almost.foe 当原料）
## 目击认错人（2.5D MISID，2026-11-07 用户裁定）：确证写入有 20% 概率指到
## 目击范围内**看得见的另一个人**（候选池 = 此刻真看得见的人，不含行为人）。
func note_sight(witness_i: int, actor_i: int, kind: String, at: Vector2, victim_i: int = -1) -> void:
	var w: Dictionary = sim.agent(witness_i)
	if w.is_empty() or witness_i == actor_i:
		return
	var ev_w: Dictionary = sim.rules.constant("EV_W") as Dictionary
	var weight := float(ev_w.get(kind, 0.0))
	# 远距离目击打标（2.5D farSight 遥测口径：>4.5 格不确证）。
	var wp: Vector2 = w.get("pos", Vector2.ZERO)
	var d := wp.distance_to(at)
	var use_dist: bool = sim.rules.b("CONFIRM", "useDist", false) if sim != null and sim.rules != null else false
	var far: bool = use_dist and d > rule("CONFIRM", "nearR", 4.5)
	var evrec := {"kind": kind, "src": "sight", "actor": actor_i,
		"x": at.x, "y": at.y, "night": int(sim.night)}
	if far:
		evrec["far"] = true
	# @src js/game.js:2388 noticeAction：目击者自己已确证死者是异形 → 这一枪是处决，不写凶手证据
	var kn_raw: Variant = w.get("known", {})
	var justified := kind == "saw_shot" and victim_i >= 0 and (kn_raw is Dictionary) and ((kn_raw as Dictionary).has(victim_i))
	if kind == "saw_shot" and victim_i >= 0:
		emo_add(w, actor_i, rule("EMOTE", "panicShot", -40.0), "panic_shot")
	if justified:
		evrec["justified"] = true
		_push_why(w, actor_i, evrec)
	else:
		var sw := minf(weight, 0.08) if kind == "saw_shot" else weight
		sus_add(w, actor_i, sw, "亲眼目击", evrec)
		if kind in ["saw_knife", "saw_pipe", "saw_bot", "saw_red", "saw_breaker", "saw_shot", "saw_detain"]:
			w["suspect"] = actor_i
	var actor: Dictionary = sim.agent(actor_i)
	if not actor.is_empty():
		actor["exposure"] = float(actor.get("exposure", 0.0)) + 1.0
	var id_ev: Dictionary = sim.rules.constant("ID_EVIDENCE") as Dictionary
	if not id_ev.has(kind) or far:
		return
	# MISID：读 MISID.base 与同范围可见候选池
	var final_i := actor_i
	var misid_base := rule("MISID", "base", 0.15)
	if misid_base > 0.0:
		var sight_r: float = sim.sight_range_at(at)
		var pool: Array = []
		for o: Dictionary in sim.agents:
			var oi := int(o.get("i", -1))
			if oi == witness_i or oi == actor_i:
				continue
			if not bool(o.get("alive", false)) or bool(o.get("downed", false)):
				continue
			var op: Vector2 = o.get("pos", Vector2.ZERO)
			if op.distance_to(at) > sight_r or not sim.los_now(wp.x, wp.y, op.x, op.y):
				continue
			pool.append(oi)
		var min_ppl := maxi(1, int(rule("MISID", "minPeople", 2)) - 1)
		var misid := 1.0 if misid_base >= 1.0 else minf(rule("MISID", "cap", 0.35),
			misid_base + float(maxi(0, pool.size() - 1)) * rule("MISID", "perExtra", 0.05))
		if pool.size() >= min_ppl and sim._rng.randf() < misid:
			final_i = int(pool[sim._rng.randi_range(0, pool.size() - 1)])
			if final_i != actor_i:
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
	trust_cert(w, final_i, true)
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
	MindAccount.note_testimony(self, listener_i, speaker_i, target_i, kind, strength, claim_room)


## 自述与听众记忆对不上 → 说话人可信度扣 caughtLie（2.5D checkAlibi 量词）。
## 正规量词（2026-11-01 修量词，js/ai/sanity.js#checkAlibi）：
## 2.5D checkAlibi 量词：窗口内 ∃ 匹配即成立；只比本夜 ALIBI.window(45s) 舱室 saw_agent。
func check_alibi(speaker_i: int, room_id: String) -> int:
	return MindAccount.check_alibi(self, speaker_i, room_id)


## 信誉记账（2.5D credAdd，js/game.js:1451）：
##   cred[i] = 我认为 i 干正经事的程度
##  · key 非空且在 CRED.gains 里 ⇒ 计入 almost.friend 的种类（投票对错**不算**正经行为）
##  · 硬覆盖：已经自己确证的人，洗白一律失效
##  · 追责会给负权重，所以双向夹紧到 [0, CRED.cap]
func cred_add(a: Dictionary, target_i: int, key: String, amount: float = NAN) -> void:
	MindAccount.cred_add(self, a, target_i, key, amount)


## 信誉（相对某人的）：2.5D credOf(a,i)
func cred_of(a: Dictionary, target_i: int) -> float:
	if a.is_empty():
		return 0.0
	return float((a.get("cred", {}) as Dictionary).get(target_i, 0.0))


## 可信度记账（2.5D reliaAdd，js/game.js:1411）：
## reliability[i] = i 说的话在我这里值多少钱
func relia_add(a: Dictionary, target_i: int, delta: float) -> void:
	MindAccount.relia_add(self, a, target_i, delta)


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


## 2.5D aiAlien:3900-3915 的现场目击者：谁在 HUNT.memorySec 内看见过我、还活着、
## 不是队友、且在 max_d 内 —— 返回最近的那个（3D 的 seenBy 存在目击者身上）。
func recent_witness_id(a: Dictionary, max_d: float, stale: float) -> int:
	var ai := int(a.get("i", -1))
	var ap: Vector2 = a.get("pos", Vector2.ZERO)
	var best := -1
	var bd := max_d
	for w: Dictionary in sim.agents:
		if w == a or not bool(w.get("alive", false)) or bool(w.get("downed", false)) \
				or bool(w.get("detained", false)):
			continue
		if _is_mate(a, int(w.get("i", -1))):
			continue
		var rec: Variant = (w.get("seenBy", {}) as Dictionary).get(ai, null)
		if rec == null or sim.elapsed - float((rec as Dictionary).get("t", 0.0)) > stale:
			continue
		var d := ap.distance_to(w.get("pos", Vector2.ZERO))
		if d < bd:
			bd = d
			best = int(w.get("i", -1))
	return best


func evidence_reason(a: Dictionary, i: int) -> Dictionary:
	var arr: Array = (a.get("why", {}) as Dictionary).get(i, []) as Array
	return arr[arr.size() - 1] as Dictionary if not arr.is_empty() else {}


## 准-确证 evalAlmost：主轴按 AXIS.almostFoe / AXIS.almostFriend，保留 sus/cred 兼容回退。
func eval_almost(a: Dictionary, i: int) -> void:
	MindAxes.eval_almost(self, a, i)


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
##   · 异形目击者 → 对那个人的**等值敌对分**（一体两面：同一件事，换个视角看就是两套账）
## 已认出的队友不计（异形知道自己人）。
## 权重按可见情境抽样（witnessCtxMul 的同源口径）：人越多、断电、附近刚出过事
## ⇒ 每个人记得越浅。
func cred_broadcast(actor_i: int, kind: String, at: Vector2) -> void:
	MindAccount.cred_broadcast(self, actor_i, kind, at)


## 情境系数（2.5D witnessCtxMul，js/game.js:1676 的同源口径）：
## 人越多记得越浅 / 断电再降 / 附近 8 秒内刚出过事再降。
func _witness_ctx_mul(at: Vector2, n_seen: int) -> float:
	return MindAccount.witness_ctx_mul(self, at, n_seen)


## 异形是否已认出对方是队友（2.5D isMate：只认**自己亲眼见过**的队友）。
## 3D 之前没有这套记忆 —— 异形互相完全不认人，协同能力因此为零。
func _is_mate(w: Dictionary, other_i: int) -> bool:
	var mates: Dictionary = w.get("mates", {}) as Dictionary
	return mates.has(other_i)


func _sync_cred_shadow(a: Dictionary, target_i: int) -> void:
	MindAccount._sync_cred_shadow(self, a, target_i)


func _spam_mul(w: Dictionary, vi: int, spam_at: int, spam_mul: float) -> float:
	return MindAccount._spam_mul(w, vi, spam_at, spam_mul)


## 追责清算（对齐 cognition.js:254-342）：只对带头人落 T 与煽动情绪，被冤者对投票者记仇 E。
func settle_accountability(cand_i: int, votes: Dictionary, lead: int = -1) -> void:
	MindAccount.settle_accountability(self, cand_i, votes, lead)


## 跨夜回归：保留 known / 滑窗 heard，T/E/sus/cred/reliability/warm 按规则衰减。
func reset_night() -> void:
	MindAxes.reset_night(self)
