# 3D 核心机制全量审阅（2026-11-11 · 全系统版）

> 本轮**按系统逐条审**，不再抽查。范围：核心游戏机制（规则 / 状态 / 流程 / AI / UI 信息面），**不含美术**。
> 真源：`新返航录/js/`（game.js 11,917 行 + t2 2,300 + ai 1,800 + data 2,100 + ui 1,100）。
> 方法：全量函数名映射（607 个 JS 函数）→ 无痕迹清单按系统人工核对 → 关键链路读码验证。
> 行号以两仓 2026-11-11 HEAD 为准。

## 一、覆盖与口径

`spec/port-manifest.json` 共 47 个系统：**excluded 7**（2.5D 渲染 / 入口 / 绑定 / DOM 模板 / 美术）不属机制，**reference 4**（时钟 / 不变量 / 模拟 / 门禁）只作口径，**实审 36 个**。

函数级映射结果：

| 类别 | 数量 | 说明 |
|---|---:|---|
| JS 函数总数 | 607 | game.js 328 + 其余模块 279 |
| 3D 有同名/近名实现 | 118 | 直接对应 |
| 3D 注释/调用中引用 | 204 | 名字不同但被引用或改写成 snake_case 片段 |
| 无任何痕迹 | 285 | 其中 63 个是 UI/渲染/启动；其余按系统人工核对 |

**结论：manifest 的 `partial` 状态普遍偏保守，且至少有 4 条 notes 已过期**（见 §四）。真实缺口比状态标签少，但有 4 处硬偏差必须修。

## 二、36 个系统逐条结论

图例：✅ 一致 · ◐ 有实现但有偏差 · ✗ 缺失 · ⚠ 静态未见（需运行验证）

### 数据与空间（9 项）

| 系统 | 2.5D 关键点 | 3D 实现 | 判定 |
|---|---|---|---|
| D-MAP | `js/data/map.js` 唯一真源 | `data/map_v2.json` 由 `build-map-v2.cjs` 生成；掩体取自 map.json（2026-11-10 裁定） | ✅ |
| D-NAMES | 15 席默认名 | `sim.json#names`，`new_game` 校验 15 项 | ✅ |
| D-VERSION | `js/config/version.js` | `3d/version.json` V1P-0.2 + `export-version.cjs` 导出 | ✅ |
| D-SPACE | 门/视野/站桩/电闸/管道/拖尸 | `data/space.json`（sources 带 2.5D 三文件哈希）；`speed=4` 对应 `MOVE_SPEED:4.0` | ✅ |
| D-TASKS | 26 任务 / 14 型玩法 | `data/minigames.json` + `scripts/minigame/` 10 型可玩 | ◐ 玩法型数少于 2.5D 的 14 型（4 型未搬） |
| D-PLATES | 图内要素板断口（电线坐标） | 3D 用渲染好的 `assets/plates/panel-fix.png`，未搬坐标数据 | ◐ 玩法等价、数据未搬 |
| D-LINES | 会议台词语料 | `data/lines.json` + `speech.gd` | ✅ |
| E-GEO | 网格 / A* / 视线 | `grid_nav.gd`：A* + LOS；**未搬 `smoothPath`/`pathClear`** | ◐ 路径不做平滑，AI 走折线 |
| E-DOORS | 自动门 + 断电 2 秒扫描锁 | `scene_extras.door_update()`：open/close 半径、scan_sec=2、三门不豁免 | ✅ |

### 状态与循环（6 项）

| 系统 | 2.5D 关键点 | 3D 实现 | 判定 |
|---|---|---|---|
| S-STATE | 15 席 / 4 异形 / 任务分配 / 申请单阈值 | `new_game()`：席位、异形抽取、任务点分配、`qual` 阈值 | ✅ |
| S-LOOP | update / 动作计时 / 帧采样 | `tick()` 顺序：agent → dmg → meeting → win；`_finish_doing` | ✅ |
| E-MOVE | 4.0 移速 / 2.5 拖尸 / 幽灵 1 分 / RUSH 加速 | `SpaceData` 读 space.json；`_kill_rush_start` / `ghostPts` | ✅ |
| E-POWER | 三态照明（常态 / 修复 / 拉闸） | `apply_light_state()` + `map_builder.set_light_state()` 三态正确 | ◐ **视觉不暗**（见 §三-3） |
| S-NIGHT | 夜长 75 / dawn / 会议暂停 / 终结者 | `night_len()` / `dawn()` / `_tick_meeting` 暂停 / `terminator_on` | ✅ |
| S-DEV | 全知 / 无敌 / 探针 | `sim.dev` + `dev_log` + `_probe`（63 处）；2.5D 的 `runInvariants` 未搬 | ◐ 断言层缺失 |

### 交互与动作（5 项）

| 系统 | 2.5D 关键点 | 3D 实现 | 判定 |
|---|---|---|---|
| S-INTERACT | 轮盘 / 管道 / 圆桌 / 补给 / 监控 / 故障 / 报告 / 搜尸 / 拖尸 / 打机器人 | `_collect_offers()` 覆盖 9 类；轮盘 `ui_wheel.gd` | ◐ 全挤在 E；轮盘是竖排列表不是环形 |
| S-ACTIONS | 领申请单 / 修任务 / 交互 / 攻击 / 搜尸 / 拖尸 | `_start_station` / `_on_*` / `_player_knife` / `_player_fire` | ✅ |
| S-BODY | 濒死 12 s / 拖拽 / 搜尸取物资 / 收尸 | `knife()` 设 `downedT=12`；`start_drag` / `search_body`；`revive` | ✅ |
| S-SABOTAGE | 破坏 / 30 s 窗口 / 维修 10 s | `sabotage_room()` + `dmg[]` + `fix_damage()` + `_tick_dmg` | ◐ 故障点无 3D 视觉标记 |
| S-REPORT | 报告 / 一次性标记 / 额度 2 | `reported` 字段 + `reportLeft` + `night_meets` 上限 | ◐ 播报文案未对齐（见 §三-4） |

### 战斗与机器人（3 项）

| 系统 | 2.5D 关键点 | 3D 实现 | 判定 |
|---|---|---|---|
| S-COMBAT | 刀 / 枪 / 濒死 / 死亡 / 击杀加速 / 红身 | `knife()` / `shoot()` / `die()` / `_kill_rush_start` / `redT` | ✅ （阵营过滤已按 §三-1 修正） |
| S-BOTS | 巡逻 / 前扇区抓捕 / 拘留 30 s / HP / 医疗无人机 | `bots.gd` 19 个函数：`_patrol` / `_start_catch` / `detained` / `_tick_med` / `hit_bot` | ✅ |
| S-WIN | 维修分 → 异形出局 → 人类全灭 | `check_win()` 三段顺序一致 | ✅ |

### AI 与社交（4 项）

| 系统 | 2.5D 关键点 | 3D 实现 | 判定 |
|---|---|---|---|
| A-COGNITION | 感知 / 记忆 / 嫌疑 / 关系 / 证言可信度 | `mind.gd` 80 个函数（`sus_add` / `witness_weight` / `alibi_reach` / `cred_*` / `humanish_*`） | ✅ |
| A-HUMAN | 做任务 / 领物资 / 搜尸 / 救人 / 躲异形 | `ai_human.gd` 11 个函数（`_decide` / `_shoot_target` / `_flee_from` / `_medbot_usable`） | ◐ **无 `chaseKnown/chaseSus`**（源码 220 行自述） |
| A-ALIEN | 计划 / 追踪 / 出刀 / 破坏 / 钻管道 / 伪装 | `ai_alien.gd` 13 个函数（`_decide` / `_try_sabotage` / `_try_disguise` / `_pipe_move` / `_hide_room`） | ✅ |
| A-SOCIAL | 藏尸 / 目击 / 伪装审计 / 暴露度 | `_hide_room()`（随机非 med/bridge）、`_exposure_at()`、`_witness_action` | ◐ 藏尸目的地是简化实现（2.5D 有 `hideSpotFor` 评分） |

### 会议与发言（4 项）

| 系统 | 2.5D 关键点 | 3D 实现 | 判定 |
|---|---|---|---|
| S-MEET | 报告 → 讨论 → 投票 → 驱逐 → 公布 | `open_meeting_kind` + `_tick_meeting` + `_after_meeting`；pre/day/night 三类；`skip_discussion` / `skip_vote` | ✅ |
| S-SPEECH | 台词调度 / 口供 / 质疑 / 作证 / 玩家自由发言 | `speech.gd` 30 个函数 + 11 模板 + 对象/舱室/时段下拉 | ✅ |
| S-DECISION | 额度 / 消耗 / 时序 | `reportLeft` / `night_meets` / `cast_early_votes` / `vote_pressure` / 弃权 | ✅ |
| S-DEV | 见状态与循环 | 同 S-DEV | ◐ |

### 表现与外围（5 项，仅列机制相关）

| 系统 | 2.5D 关键点 | 3D 实现 | 判定 |
|---|---|---|---|
| X-AUDIO | 15 条采样 + 事件映射 | `audio.gd` 事件 match（knife/shoot/kill/fix/sabotage/report/vote/eject…） | ✅ |
| V-HUD | 夜/进度/任务/存活/报告额度 | `_refresh_sim_hud` 全有；**多了一条事件播报** | ◐ 信息泄露（§三-4） |
| UI-HOME | 开始页 / 设置 / 音量 | `home_view.gd` + `ui_panels.gd` | ✅ |
| UI-REPLAY | 复盘页 / 时间轴 / 事件高亮 | 只有结算表，无复盘时间轴 | ✗ |
| V-MINIGAME | 14 型玩法 | 10 型 | ◐ 4 型未搬 |

## 三、确认的偏差（按严重度）

### P0-1 出刀阵营过滤（已修）

2.5D `knife()`（`js/game.js:4226`）只判「有刀 / 目标存活且未倒地」，**无阵营限制**。3D 曾多写 `or v.alien`，已于 2026-11-11 删除；headless 断言 `KNIFE_ALIEN_TEST ok=true` PASS。

### P0-2 白天会议玩家未回舱（已修）

2.5D 白天会议唯一入口 `dawn()`（`js/game.js:4513-4526`）先全员 `randIn(bridge)` 再开会。3D `sim.dawn()` 只改 `agent.pos`，玩家相机从未搬；会议结束 `_sync_player_pos` 还会反写。已新增 `main._sync_day_meeting_teleport()`，断言 (8,8)→(31,33.5) PASS。

### P0-3 暗房不暗（未修）

- 3D 三态逻辑正确：`map_builder.set_light_state(0)` 按 `rec.bright` 关房间灯。
- 但同一函数里 `_fill`（0.28）、`_ceil_fill`（0.16）、`env.ambient` **常态全开**，暗房被全船补光照亮。
- 2.5D 还有一层「画布遮黑 + 只剩手电」，3D 完全没有。
- 影响：照明、手电、潜行、视野规则（`ai_can_see` 有暗房判定，但玩家看不出暗）。

### P0-4 HUD 信息泄露（未修）

`main._event_feed()` 播报「X 完成 任务 / X 被驱逐 / X 领取补给」。2.5D 局内 HUD 只显示夜/进度/任务/存活/报告额度；这些事件只在复盘页。属信息泄露，破坏推理。

## 四、manifest 中已过期的 notes（本次核实）

| 系统 | 原 notes | 实际 |
|---|---|---|
| S-NIGHT | 「仍缺 startNight 的 20+ 字段清理」 | `_reset_agent_night()` 实际清 **45 个字段**（`sim_state.gd:714-773`），仅 `accuseWhy` 等少数需复核 |
| S-SABOTAGE | 「故障落点/视觉未接」 | `sabotage_room()` 已写 `dmg[]` 含 x/y；缺的只是**视觉标记**，不是落点 |
| S-DECISION | 旧 note 说额度未迁 | `reportLeft` / `night_meets` / 早投 / 改票均已实现 |
| S-COMBAT | 旧 note 说 RUSH/红身未接 | `_kill_rush_start` / `redT` 均在 |

> 建议：审阅完成后统一刷新 `port-manifest.json` 的 status/notes，避免以后又被过期描述误导（这也是这两轮我误判的来源之一）。

## 五、仍然缺失 / 半接（完整清单）

| # | 项 | 证据 | 影响 | 优先级 |
|---|---|---|---|---|
| 1 | 暗房遮罩 | §三-3 | 照明/潜行全失效 | P0 |
| 2 | HUD 事件播报 | §三-4 | 信息泄露 | P0 |
| 3 | 人类 AI 追猎（`chaseKnown/chaseSus`） | `ai_human.gd:220` 自述未接 | 人类 AI 不会主动接近已知目标开枪 | P1 |
| 4 | 路径平滑（`smoothPath` / `pathClear`） | `grid_nav.gd` 仅 A* | AI 走折线、贴墙 | P1 |
| 5 | 故障点 3D 视觉 | `_tick_dmg` 只有数据 | 看不见哪台设备坏了 | P1 |
| 6 | 报告播报文案 | `S-REPORT` | 信息面与 2.5D 不一致 | P1 |
| 7 | 4 型小游戏 | `V-MINIGAME` 10/14 | 任务种类少 | P2 |
| 8 | 复盘页 | `UI-REPLAY` | 无时间轴/事件回放 | P2 |
| 9 | 图板坐标数据 | `D-PLATES` | 玩法等价，数据未搬 | P3 |
| 10 | DEV 不变量断言 | `E-INVARIANTS` reference | 缺运行时自检 | P3 |
| 11 | 藏尸评分 | `_hide_room()` 随机 | 藏尸位置不如 2.5D 合理 | P3 |

## 六、静态审阅无法确认的部分（需运行验证）

以下 5 项代码存在但行为正确性必须实机/对局验证，本文**不**给出"一致"结论：

1. AI 认知层的权重数值是否与 `mind.gd` 注释里的 JS 行号一一对应（80 个函数只做了存在性与命名核对）。
2. 会议投票的 AI 决策在 15 人局中的分布（`_ai_vote_target` / `vote_pressure`）。
3. 机器人抓捕的扇区/视线在实际 3D 坐标下是否与 2.5D 等价。
4. 门扫描在断电时的通过时序（代码口径一致，未实测）。
5. 小游戏 10 型与 2.5D 的判定细节差异。

## 七、建议

1. **先修 P0-3 / P0-4**（暗房遮罩 + HUD 收口），这两项直接影响你说的"暗房不像暗房"和"信息泄露"。
2. **刷新 manifest**：把 S-NIGHT / S-SABOTAGE / S-DECISION / S-COMBAT 的 notes 改成实测状态，避免后续审阅再被误导。
3. P1 三项（人类追猎、路径平滑、故障视觉）打包成一批，每项配 headless 断言。
4. P2 之后（小游戏 4 型、复盘页）按需排期。

---

**本轮改动**：仅新增本文档；游戏代码零改动（P0-1/P0-2 已在上一提交修复）。
