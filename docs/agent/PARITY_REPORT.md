# 2.5D ↔ 3D 玩法规则对齐审阅

> 自动生成：`node 3d/tools/check-gameplay-parity.cjs`。逐文件明细见 `parity-report.csv`。

## 总览

| 指标 | 数值 |
|---|---:|
| 2.5D 函数（纳入审阅） | 385 |
| 显式映射（spec 表） | 26 |
| 自动同名匹配 | 81 |
| 未映射（pending） | 278 |
| 映射目标不存在 | 0 |
| 守卫有缺口 | 12 |
| 状态写入有缺口 | 6 |
| 3D 独有（疑似自造） | 9 |

## 真源漂移

无：space.json / rules.json 的源文件指纹与当前 2.5D 一致。

## 硬编码检查

无：幽灵额度等常量均来自 space.json。

## 守卫/字段缺口（按缺口数排序）

| 2.5D 函数 | 3D 目标 | 守卫缺 | 写入缺 | 缺什么 |
|---|---|---:|---:|---|
| `js/game.js:finishDoing:4335` | `sim/sim_state.gd:_finish_doing` | 0 | 5 | write.searched=false \| write.bullet=1 \| write.draggedBy=null \| write.downed=false \| write.ghostPts=(a.ghostPts\|\|0)+v |
| `js/game.js:medbotTick:4695` | `sim/bots.gd:_tick_med` | 1 | 3 | guard(G.medbotT<MEDBOT_HEAL_TIME) \| write.stunT=MEDBOT_REVIVE_STUN \| write.draggedBy=null \| write.searched=false |
| `js/game.js:agentAimAng:1807` | `sim/sim_state.gd:agent_aim_ang` | 3 | 0 | guard(a===G.me&&!G.simMode&&!G.spectMode&&G.aimX) \| guard(a.target&&a.target.alive) \| guard(a._aimAng!=null) |
| `js/game.js:shoot:8451` | `main.gd:_player_fire` | 2 | 0 | guard(G.over\|\|G.meet\|\|G.inspect) \| guard(!me.alive\|\|me.downed\|\|me.detained) |
| `js/game.js:openCams:999` | `main.gd:_open_cams` | 1 | 0 | guard(!G\|\|G.over\|\|G.meet\|\|G.inspect\|\|G.pipePick\|) |
| `js/game.js:recordClaim:1624` | `sim/mind.gd:record_claim` | 1 | 0 | guard(!a\|\|!al\|\|!G) |
| `js/game.js:update:2202` | `minigame/mg_valve.gd:_update` | 0 | 1 | write.detained=false |
| `js/game.js:hideRoomFor:3057` | `sim/ai_alien.gd:_hide_room` | 1 | 0 | guard(!cands.length) |
| `js/game.js:sabotageBot:8208` | `sim/sim_state.gd:hit_bot` | 0 | 1 | write.sabUsed=true |
| `js/game.js:sabotage:8223` | `main.gd:_on_sabotage` | 1 | 0 | guard(G.sabPick) |
| `js/game.js:rescue:8252` | `sim/sim_state.gd:player_revive` | 0 | 1 | write.draggedBy=null |
| `js/game.js:searchBody:8490` | `sim/sim_state.gd:search_body` | 1 | 0 | guard(me.doing>0) |
| `js/game.js:play:8646` | `audio.gd:play` | 1 | 0 | guard(!FILE[name]) |
| `js/game.js:draw:10191` | `home_ship_map.gd:_draw` | 0 | 1 | write.drag==null)continue |
| `js/ai/sanity.js:checkAlibi:731` | `sim/mind.gd:check_alibi` | 1 | 0 | guard(t0 == null \|\| t1 == null \|\| t1 < t0) |
| `js/ai/traits.js:pick:41` | `sim/speech.gd:_pick` | 1 | 0 | guard(r <= acc) |
| `js/t2/decision.js:parseSpeech:65` | `sim/lines_data.gd:parse_speech` | 1 | 0 | guard(i==null\|\|i===meI) |

## 未映射函数（按文件分组）

- `js/game.js`：255 个 —— start, stop, boot, buildSeatNames, randIn, bodyPos, roomNameById, roomIdOfName, pipeRoomIds, causeName, walkableNear, nearPipeXY …
- `js/ai/sanity.js`：1 个 —— rollCharisma
- `js/ai/traits.js`：1 个 —— roll
- `js/t2/space.js`：11 个 —— ghostTaskPts, ghostTaskCap, ghostTaskAllowed, botDead, botHp, corridorLampPos, rowForAng, dirAng, workStyle, pipeTint, k1
- `js/t2/decision.js`：10 个 —— seatNo, tagByName, nameOf, seatIndex, bodyReported, markBodyReported, nightMeetLeft, stopChatter, meetLater, sayStreakOK

## 3D 独有状态写入（需标注为表现/输入层或补映射）

- `sim/ai_alien.gd:_decide:297`
- `sim/sim_state.gd:tick_agents:513`
- `sim/sim_state.gd:_reset_agent_night:731`
- `sim/sim_state.gd:kill:813`
- `sim/sim_state.gd:revive:968`
- `sim/sim_state.gd:player_sabotage:1345`
- `sim/sim_state.gd:sabotage_room:1357`
- `sim/sim_state.gd:_close_meeting:2034`
- `sim/sim_state.gd:hit_bot:2180`

## 下一步（由审阅表驱动，不靠抽查）

1. 每条 `守卫缺 / 写入缺`：打开 2.5D 原文逐行核对，补进 3D 或写 `@deviation` 说明。
2. 每个 `pending`：要么映射到实现，要么在 `spec/gameplay-parity.json` 标 `not-applicable` 并写理由。
3. 每个 3D 独有写入：确认它是表现/输入映射；不是就删。
4. 每次改完跑 `npm run audit:parity:strict`，缺口必须为 0 才能提交。
