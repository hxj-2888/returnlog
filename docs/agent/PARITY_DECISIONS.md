# 映射裁决记录（2026-11-11 全量批次）

> 本文记录 `spec/gameplay-parity.json` 里**不是逐行移植**的裁决与已知差距。
> 规则只有一处真源：2.5D 仓（`C:\Users\ASUS\Desktop\新返航录`，main @ 1549a9d）。
> 审阅门禁：`npm run audit:parity:strict`（385 函数，未映射 0 / 守卫缺口 0 / 写入缺口 0 / 3D 独有 0 / 漂移 0，预算全部归零）。

## 1. 本批逐行移植（新写入 sim）

| 2.5D | 3D | 说明 |
|---|---|---|
| doorTick (448) / doorBlockedSegment (484) / losNow (495) | `sim_state.door_tick / door_blocked_segment / los_now` | 门是模拟层状态：挡人、挡视线、挡枪线；断电 2s 扫描全船一致。scene_extras.sync_doors 只做表现 |
| aiHear (1827) 及 13 处调用点 | `sim_state.hear` | 距离衰减 × 视线（隔墙 0.72）、最低 0.12；door/power/pipe/sabotage/drag/knife/scream/alarm/detain/robot/robot_down/shot 按 2.5D 半径接线 |
| aiGhost (2371) | `sim_state._ghost_tick` | 异形幽灵全局一次破坏（ghost 模式不写目击）+ 2.4 游荡；人类幽灵额度内 6.5 做任务 |
| aiScanBodies (2524) | `sim_state.scan_bodies` | 扫描→观察→搜查→canReportBody 延迟拉铃；**替换掉此前 3D 自造的 35%/20% 报告概率** |
| alienReportWorth (2591) | `sim_state.alien_report_worth` | MISLEAD 效用表全部读 rules.json（含 _stallBias 0.8~1.2，mind.init_agent 掷） |
| secbotRaidOk (8365) | `sim_state.secbot_raid_ok` | ≥2 名 8 格内队友 + 共同目标 ≤7 格 + 0.45 掷骰；ai_alien 机器人分支接入（此前 3D 只打医疗机） |
| alienMateRevive (3590) | `ai_alien._decide` | 有医疗包且认出队友 → 8 格内濒死队友，<1.7 站桩 STAND.revive |
| aiWantsLoot (2144) | `sim_state.ai_wants_loot` | 逐行：死者/濒死限定 + 弹/医疗包/申请单三动机 |
| watchersAt (3183) / recentWitness (3121) / sabRoomOk (1065) / nightMeetLeft (decision.js:154) / dmgTick (1272) | sim_state 同名 snake | 逐行 |
| stepMove (828) / moveSpeed (782) / walkTo (798) | `tick_agents / set_path` | 门阻挡、围墙兜底、0.7s 卡死重寻路、_aimAng；拖尸>加速>基础 次序保留 |

## 2. 死代码守卫（不迁，证明保留）

- `G.noReport`（js/game.js:2575 唯一一处读取，**全仓无写入点**）：恒 undefined。审阅器已内置「死守卫」识别（条件标识符在 2.5D 全仓无左值 → 跳过），防止以后再把它当缺口。

## 3. 已知差距（映射表标 adapter，但覆盖不全 —— 下批候选）

| 2.5D | 缺什么 |
|---|---|
| findHideBody (3108) | 「顺手藏别人尸体」分支：3D 只在自家出刀后即时拖尸（_decide drag 分支 + _hide_room 评分） |
| disguiseOptions (3266) | 演出种类只有 fakeRepair/fakeTask；东张西望等未迁 |
| audienceHotRooms (3244) | 按 mem 热度选演出舱室未迁（3D 就地演出） |
| alienPlan (3382) | 效用表主结构同序，但 walk 估距、BOT_SEC_VALUE 等细分打分未逐项迁 |
| recordFrame/replayData (1410/1426) | 2.5D 复盘帧快照未迁；3D 复盘页用 events 流（P2） |

## 4. 结构性差异（等价改写，非缺口）

- `envNotice`：2.5D 写 a.mem 环境记录；3D 无 mem 时间线，等价信息由事件流 + 维修 offers 呈现。
- `attention` 三态：3D 只保留玩法语义「做事=看不见」（watchers_at/_witness_action），ui/suspend 两态属表现层。
- `hear` 与事件流分离：2.5D doorAutoSound 不写事件流，3D 同样只进 hear 不进 _log。
- `_cast_ai_votes` 受 `ai_enabled` 门禁（3D 自测开关；2.5D 无此开关，语义=AI 全关时投票也关）。
- `medbotTick` 的救起写 `searched=false/stunT/draggedBy=null` 复用 `sim.revive`（单入口，与 2.5D revive 同链）。
