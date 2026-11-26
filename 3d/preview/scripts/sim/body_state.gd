extends RefCounted

const InvariantsScript := preload("res://scripts/sim/invariants.gd")

## 尸体状态机（2.5D bodyPos / bodyNear / searchBody / lootBody / bodyHasLoot 逐行移植）。
## 2026-11-13 从 sim_state.gd 拆出：该文件有 3600 行棘轮预算（3d/spec/file-budgets.json），
## 尸体链是独立系统；写回仍是 sim.agents 的同一份 agent 字典，判定/数值语义不变。


## 2.5D bodyHasLoot（js/game.js:2125）：身上还有任何可带走的物资。
static func body_has_loot(b: Dictionary) -> bool:
	return int(b.get("bullet", 0)) > 0 or int(b.get("medkit", 0)) > 0 \
		or int(b.get("qual", 0)) > 0 or int(b.get("qualPending", 0)) > 0


## 2.5D bodyNear（js/game.js:8502）：活人要濒死才算"身体"，投票驱逐的尸体不存在。
static func body_near(sim, pos: Vector2, radius: float) -> Dictionary:
	for a: Dictionary in sim.agents:
		if bool(a.get("alive", false)) and not bool(a.get("downed", false)):
			continue
		if bool(a.get("bodyGone", false)) or String(a.get("deathCause", "")) == "vote":
			continue
		var bp: Vector2 = a.get("pos", Vector2.ZERO) if bool(a.get("alive", false)) \
			else a.get("bodyPos", Vector2.ZERO)
		if bp.distance_to(pos) <= radius:
			return a
	return {}


static func _body_valid(sim, b: Dictionary) -> bool:
	if b.is_empty():
		return false
	# searchBody 也允许搜**濒死者**（否则异形永远等不到天亮尸体就被清场）。
	if bool(b.get("alive", false)) and not bool(b.get("downed", false)):
		return false
	if bool(b.get("bodyGone", false)) or String(b.get("deathCause", "")) == "vote":
		return false
	# R20.5：尸体被拖动时不能搜查 / 领物资（AI 与玩家共用同一判据）
	if InvariantsScript._dragged_by(b) >= 0:
		return false
	return true


static func _transfer_loot(b: Dictionary, a: Dictionary) -> Dictionary:
	var got := {"bullet": 0, "medkit": 0, "qual": 0}
	if int(a.get("bullet", 0)) < 1 and int(b.get("bullet", 0)) > 0:
		got["bullet"] = 1
		b["bullet"] = int(b.get("bullet", 0)) - 1
		a["bullet"] = 1
	if int(a.get("medkit", 0)) < 1 and int(b.get("medkit", 0)) > 0:
		got["medkit"] = 1
		b["medkit"] = int(b.get("medkit", 0)) - 1
		a["medkit"] = 1
	var cap := 2 - int(a.get("qual", 0))
	var pool := int(b.get("qual", 0)) + int(b.get("qualPending", 0))
	if cap > 0 and pool > 0:
		var n := mini(cap, pool)
		var from_qual := mini(n, int(b.get("qual", 0)))
		b["qual"] = int(b.get("qual", 0)) - from_qual
		b["qualPending"] = maxi(0, int(b.get("qualPending", 0)) - (n - from_qual))
		got["qual"] = n
		a["qual"] = int(a.get("qual", 0)) + n
	return got


## 2.5D searchBody（js/game.js:8513）+ lootBody（js/game.js:2129）：
## 站桩结束后一次性结算；玩家查看取证与领取物资分离，AI 保持自动领取。
static func search(sim, body_i: int, by: int, with_loot: bool = true) -> bool:
	# 2.5D searchBody()：`if(G.over||G.meet||G.inspect)return`
	if sim.over or not sim.meeting.is_empty():
		return false
	var b: Dictionary = sim.agent(body_i)
	var a: Dictionary = sim.agent(by)
	if a.is_empty() or not _body_valid(sim, b):
		return false
	if with_loot:
		# 2.5D：没搜过，或死者身上还有可带走的物资（搜的人当时已满）→ 可以再搜
		if bool(b.get("searched", false)) \
				and (bool(b.get("alive", false)) or not body_has_loot(b)):
			return false
	else:
		if bool(b.get("searched", false)):
			return false
	var first := not bool(b.get("searched", false))
	b["searched"] = true
	var got := _transfer_loot(b, a) if with_loot else {"bullet": 0, "medkit": 0, "qual": 0}
	# 2.5D logEvent('search')：first / bullet / medkit / qual + 尸体的房间与坐标
	var bp: Vector2 = b.get("bodyPos", b.get("pos", Vector2.ZERO))
	sim._log("search", {"actor": by, "victim": body_i, "first": first,
		"bullet": got["bullet"], "medkit": got["medkit"], "qual": got["qual"],
		"room": sim.room_at(bp), "x": snappedf(bp.x, 0.1), "y": snappedf(bp.y, 0.1)})
	return true


## 2.5D takeBodyLoot（js/game.js:2701）：独立领取物资动作（需已取证、未被拖动）。
static func take_loot(sim, body_i: int, by: int) -> Dictionary:
	if sim.over or not sim.meeting.is_empty():
		return {"ok": false}
	var b: Dictionary = sim.agent(body_i)
	var a: Dictionary = sim.agent(by)
	if a.is_empty() or not bool(a.get("alive", false)) or bool(a.get("downed", false)) \
			or bool(a.get("detained", false)):
		return {"ok": false}
	if not _body_valid(sim, b) or not bool(b.get("searched", false)):
		return {"ok": false}
	var got := _transfer_loot(b, a)
	var bp: Vector2 = b.get("bodyPos", b.get("pos", Vector2.ZERO))
	sim._log("loot", {"actor": by, "victim": body_i,
		"room": sim.room_at(bp),
		"bullet": got["bullet"], "medkit": got["medkit"], "qual": got["qual"]})
	return {"ok": true, "bullet": got["bullet"], "medkit": got["medkit"], "qual": got["qual"]}
