# 2.5D ↔ 3D 玩法规则对齐审阅

> 自动生成：`node 3d/tools/check-gameplay-parity.cjs`。逐文件明细见 `parity-report.csv`。

## 总览

| 指标 | 数值 |
|---|---:|
| 2.5D 函数（纳入审阅） | 385 |
| 显式映射（spec 表） | 199 |
| 自动同名匹配 | 69 |
| 未映射（pending） | 0 |
| 映射目标不存在 | 0 |
| 守卫有缺口 | 0 |
| 状态写入有缺口 | 0 |
| 3D 独有（疑似自造） | 0 |

## 真源漂移

无：space.json / rules.json 的源文件指纹与当前 2.5D 一致。

## 硬编码检查

无：幽灵额度等常量均来自 space.json。

## 守卫/字段缺口（按缺口数排序）

> `adapter` 表示一个 2.5D 函数拆到多个 3D 函数（或输入层），其缺口是拆分导致，不计入预算；`ported/auto` 的缺口才是真缺口。

| 2.5D 函数 | 状态 | 3D 目标 | 守卫缺 | 写入缺 | 缺什么 |
|---|---|---|---:|---:|---|
| `js/game.js:finishDoing:4335` | adapter | `sim/sim_state.gd:_finish_doing` | 0 | 5 | write.searched=false \| write.bullet=1 \| write.draggedBy=null \| write.downed=false \| write.ghostPts=(a.ghostPts\|\|0)+v |
| `js/game.js:agentAimAng:1807` | adapter | `sim/sim_state.gd:agent_aim_ang` | 3 | 0 | guard(a===G.me&&!G.simMode&&!G.spectMode&&G.aimX) \| guard(a.target&&a.target.alive) \| guard(a._aimAng!=null) |
| `js/game.js:aiAlien:3722` | adapter | `sim/ai_alien.gd:_decide` | 2 | 1 | guard(G.meet\|\|G.over) \| guard(!tgt) \| write.sabUsed=true |
| `js/game.js:medbotTick:4695` | adapter | `sim/bots.gd:_tick_med` | 0 | 3 | write.stunT=MEDBOT_REVIVE_STUN \| write.draggedBy=null \| write.searched=false |
| `js/game.js:accuseLine:5775` | adapter | `sim/speech.gd:_emit` | 3 | 0 | guard(a.suspect!=null) \| guard(why0) \| guard(a._hedge) |
| `js/game.js:supplyTargetFor:985` | adapter | `sim/sim_state.gd:supply_spot` | 2 | 0 | guard(!a\|\|!a.qual\|\|a.qual<1) \| guard(a.bullet<1) |
| `js/game.js:observeBody:2166` | adapter | `main.gd:_open_body_card` | 2 | 0 | guard(!a\|\|!v\|\|!a.mind) \| guard(a.mind.lastBody&&a.mind.lastBody.i===v.i&&) |
| `js/game.js:alienPlan:3382` | adapter | `sim/ai_alien.gd:_decide` | 2 | 0 | guard(G.secbotDead) \| guard(G.medbotDead) |
| `js/game.js:counterfactualReach:5012` | adapter | `sim/mind.gd:alibi_reach` | 2 | 0 | guard(!fromRoom\|\|!toRoom\|\|fromRoom===toRoom) \| guard(!A\|\|!B\|\|!A.rect\|\|!B.rect) |
| `js/game.js:damageBot:8390` | adapter | `sim/sim_state.gd:knife_bot` | 1 | 1 | guard(!G\|\|G.over\|\|!attacker\|\|!attacker.alive\|\|at) \| write.redT=SKSanity.RED_BODY. |
| `js/game.js:shoot:8451` | adapter | `main.gd:_player_fire` | 2 | 0 | guard(G.over\|\|G.meet\|\|G.inspect) \| guard(!me.alive\|\|me.downed\|\|me.detained) |
| `js/game.js:startFix:1168` | adapter | `sim/sim_state.gd:start_doing` | 1 | 0 | guard(!a.alive&&!a.ghost) |
| `js/game.js:recordClaim:1624` | adapter | `sim/mind.gd:record_claim` | 1 | 0 | guard(!a\|\|!al\|\|!G) |
| `js/game.js:attention:1766` | adapter | `sim/sim_state.gd:watchers_at` | 1 | 0 | guard(!G\|\|G.over\|\|G.meet) |
| `js/game.js:observerVisionAt:1786` | adapter | `sim/sim_state.gd:ai_can_see` | 1 | 0 | guard(d>HUMAN_LIGHT_R) |
| `js/game.js:noticeTaskAbandon:1861` | adapter | `sim/ai_human.gd:_flee_from` | 1 | 0 | guard(!G\|\|G.over\|\|G.meet\|\|!actor) |
| `js/game.js:misIdBump:2068` | adapter | `sim/mind.gd:note_sight` | 1 | 0 | guard(!G\|\|!G.simStats) |
| `js/game.js:knownBump:2075` | adapter | `sim/sim_state.gd:_stat` | 1 | 0 | guard(!G\|\|!G.simStats) |
| `js/game.js:lootText:2134` | adapter | `main.gd:_on_search_done` | 1 | 0 | guard(!got\|\|got.none) |
| `js/game.js:bodyInfo:2153` | adapter | `main.gd:_open_body_card` | 0 | 1 | write.draggedBy==null?null:b.dragg |
| `js/game.js:canReportBody:2621` | adapter | `sim/sim_state.gd:body_near` | 1 | 0 | guard(a.mind.alert>=0.4) |
| `js/game.js:startLootSearch:2676` | adapter | `sim/sim_state.gd:search_body` | 1 | 0 | guard(v.draggedBy!=null) |
| `js/game.js:taskThreat:2752` | adapter | `sim/ai_human.gd:_decide` | 1 | 0 | guard(!closing&&d>3.5) |
| `js/game.js:dragAwayNotice:3088` | adapter | `sim/sim_state.gd:release_drag` | 1 | 0 | guard(!a\|\|!v\|\|v.alive) |
| `js/game.js:huntSpotFor:3616` | adapter | `sim/ai_alien.gd:_hunt_spot` | 1 | 0 | guard(last) |
| `js/game.js:alibiOf:4989` | adapter | `sim/mind.gd:check_alibi` | 1 | 0 | guard(a.alien&&a._lie) |
| `js/game.js:victimInfo:5000` | adapter | `sim/speech.gd:_ctx_for` | 1 | 0 | guard(!victim) |
| `js/game.js:collectInteractions:8072` | adapter | `main.gd:_collect_offers` | 0 | 1 | write.draggedBy==null)out.push({id |
| `js/game.js:interact:8181` | adapter | `main.gd:_collect_offers` | 1 | 0 | guard(G.wheel\|\|me.doing>0) |
| `js/game.js:sabotage:8223` | adapter | `main.gd:_on_sabotage` | 1 | 0 | guard(G.sabPick) |
| `js/game.js:rescue:8252` | adapter | `sim/sim_state.gd:player_revive` | 0 | 1 | write.draggedBy=null |
| `js/game.js:searchBody:8490` | adapter | `sim/sim_state.gd:search_body` | 1 | 0 | guard(me.doing>0) |
| `js/game.js:toggleDrag:8552` | adapter | `sim/sim_state.gd:start_drag` | 1 | 0 | guard(G.over\|\|G.meet\|\|G.inspect) |
| `js/game.js:prep:8633` | adapter | `sim/lines_data.gd:setup` | 1 | 0 | guard(POOL[name]) |
| `js/game.js:play:8646` | adapter | `audio.gd:play` | 1 | 0 | guard(!FILE[name]) |
| `js/game.js:visibleAt:10684` | adapter | `sim/sim_state.gd:ai_can_see` | 1 | 0 | guard(G.dev\|\|!G.fogOn\|\|!G.me.alive) |
| `js/game.js:canSee:10690` | adapter | `sim/sim_state.gd:ai_can_see` | 1 | 0 | guard(!G.me.alive\|\|G.dev) |
| `js/ai/sanity.js:checkAlibi:731` | adapter | `sim/mind.gd:check_alibi` | 1 | 0 | guard(t0 == null \|\| t1 == null \|\| t1 < t0) |
| `js/ai/traits.js:pick:41` | adapter | `sim/speech.gd:_pick` | 1 | 0 | guard(r <= acc) |
| `js/t2/decision.js:parseSpeech:65` | adapter | `sim/lines_data.gd:parse_speech` | 1 | 0 | guard(i==null\|\|i===meI) |
| `js/t2/decision.js:markBodyReported:149` | adapter | `sim/sim_state.gd:open_meeting_kind` | 0 | 1 | write.reported=true |
| `js/t2/decision.js:sayStreakOK:180` | adapter | `sim/speech.gd:tick` | 1 | 0 | guard(kind==='sys'\|\|kind===true\|\|kind==='me') |

## 未映射函数（按文件分组）


## 3D 独有状态写入（需标注为表现/输入层或补映射）


### 已登记的内部函数（不算自造规则）

- `sim/sim_state.gd:revive`：2.5D 没有独立 revive()：医疗包分支在 finishDoing、无人机在 medbotTick；3D 收口成 revive()
- `sim/sim_state.gd:player_sabotage`：2.5D sabotage() 的玩家动作段；3D 拆成输入包装 _on_sabotage + 动作 player_sabotage
- `sim/sim_state.gd:kill`：门禁/批量模拟的死亡快捷入口，已改为委托 die()，不是第二条死亡规则

## 下一步（由审阅表驱动，不靠抽查）

1. 每条 `守卫缺 / 写入缺`：打开 2.5D 原文逐行核对，补进 3D 或写 `@deviation` 说明。
2. 每个 `pending`：要么映射到实现，要么在 `spec/gameplay-parity.json` 标 `not-applicable` 并写理由。
3. 每个 3D 独有写入：确认它是表现/输入映射；不是就删。
4. 每次改完跑 `npm run audit:parity:strict`，缺口必须为 0 才能提交。
