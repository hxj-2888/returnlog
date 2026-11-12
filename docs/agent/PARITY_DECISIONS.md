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

## 5. 2026-11-11 玩家能力链路批次（用户现场「按键合法但能力没有」）

| 裁决 | 依据 / 落点 |
|---|---|
| 新增 `sim.can_act(kind, ctx)` 只读判定 | 2.5D 无同名函数：动作键 W/A/S/D/F/R/B/H/V 无条件直达 `attack()/toggleDrag()/sabotage()/tryReport()`，判定散在函数内部。3D 收口为**只判定不写状态**的单一真源，逐个照抄 2.5D 守卫（@src 见 `sim_state.gd` 函数注释），玩家与 AI 共用；执行仍走原有单一入口。已在 `spec/gameplay-parity.json#extras_allow` 登记。 |
| 删掉 `role` 双源 | 管道 / 刀 viewmodel / 出刀门槛原用开始页字符串 `role`，真源应是 `sim.me().alien`（2.5D `openPipePick():898` / `attack():8271`）。旧 `--b4test` / `--interacttest` 夹具恰恰只改 `role` 就能"解锁"管道，掩盖了这个洞；两处夹具已改为按真源设置。 |
| 不新增 `friendly_fire` 配置 | PLAN §4.3 建议把 `friendly_fire_knife/gun` 写进 `space.json`；但 2.5D `knife():4226` / `fireShot():8307` **都不查目标阵营**，`space.json` 是 2.5D 导出物。按红线 11/14 只能删 3D 自造限制（旧版 `sim.knife` 的 `if v.alien` 已于前批删除），不能往 3D 加真源没有的新状态/阈值。裁决：**保持与 2.5D 一致，不新增配置**。 |
| 交互键位 | 键位表本身是红线 11 明确允许的「玩家输入映射」差异；本轮把 8 个键收敛进 `project.godot` 的 InputMap，代码只读 action，不再散落 KEY_* 字面量。 |
| 卡墙兜底 | 玩家物理与 AI 网格不同源属维度产物，按交接 P0 根因 2 用 `nav.nearest_free` / `nav.is_free` 投影收口；未新增计时器阈值之外的新规则（0.3s/0.05 是接交文档给出的 2.5D `nearestFree` 兜底口径）。 |

### 仍欠（不在本批，逐条登记，勿当缺口"补造"）

- `findHideBody` (3108) 顺手藏别人尸体、`disguiseOptions` (3266) 演出种类、`audienceHotRooms` (3244) 热度选舱、`alienPlan` (3382) 细分打分：都依赖 2.5D `SKSanity.DISGUISE/CRED` 与 `a.mind.mem` 时间线；3D 的 `rules.json` 未导出这些表，按红线 11 不得在 GDScript 里写死第二份常量。**需上游导出后再逐行移植**。
- `recordFrame/replayData` (1410/1426)：`FRAME_CAP=12000 / FRAME_DT=0.5` 是 2.5D 硬编码常量，同样未导出；P2 待上游补导出。
- 人类持枪 viewmodel（PLAN §七）、人物材质三平面投影（§八-B）：表现层，需美术资产验收，未做。
- 千局基线重跑、美术批提交、隔离区资产清理：分别受小时级算力、实机美术验收、用户逐项确认约束，未做（见 `3d/HANDOFF_2026-11-11.md` §2）。
