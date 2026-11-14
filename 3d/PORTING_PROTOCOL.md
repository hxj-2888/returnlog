# 2.5D → 3D 移植规程（现行）

> 2026-11-11 用户裁定：**3D 版直接沿用 2.5D**。3D 不是第二套规则，是同一套规则的 3D 表现层。
> 本文件是硬规程，违反即回退。
>
> **动手前先读 `3d/CORE_RULES.md`**：用自然语言把 2.5D 现行规则讲清楚（含数值与触发条件），
> 先在这里确认语义、避免「看起来像」的错配，再按本协议逐函数对照 `js/` 行号移植。
> 该文档是 `docs/CORE_RULES.md` 的只读镜像，**不是第二真源**，冲突以 `js/` 为准。

## 1. 唯一真源

| 内容 | 真源 | 3D 侧允许的形态 |
|---|---|---|
| 判定 / 状态机 / 数值 | `新返航录/js/`（`game.js`、`ai/*.js`、`t2/*.js`） | 逐函数移植 + `@src` 注释 |
| 空间 / 交互半径 / 站桩时长 | `js/ai/sanity.js`、`js/t2/space.js` | 由 `export-space.cjs` 导出到 `preview/data/space.json`，GDScript 只读 |
| 规则表 / AI 权重 / 语料 | `js/ai/*.js` | 由 `export-rules.cjs` / `export-lines.cjs` / `export-sim.cjs` 导出 |
| 美术 / 输入 | 无（3D 自有） | 只允许「输入映射」与「表现层」差异 |

## 2. 只允许三类差异（红线 11）

1. **输入映射**：2.5D 的 A/B/D 等键位 → 3D 的鼠标左右键、E/F/R/G/Q/V/B/C。
   目标选择必须仍然是 2.5D 的规则（例如 `stab()` / `shoot()` 都是「最近 + LOS」，
   **不是准星锥**）。
2. **维度产物**：A* 网格、第一人称相机、碰撞、LOD 等 2.5D 不需要的维度实现；
   每项必须登记 `3d/spec/parity-map.json#allowed_differences` 并写明理由。
3. **部分美术素材**：模型、材质、粒子、镜头、HUD 布局。表现可以不同，但不得反过来影响判定。

性能优化（距离预筛、缓存、批量更新）**不是**允许差异：必须与逐条判定等价，且不得改变结果。

除此之外的一切差异都算**自造规则**，禁止。

### 2.1 排除项（单处定义）

不照搬只允许四类：输入映射 / 维度产物 / 美术素材 / 2D-DOM-Canvas 运行时；判定与清单见
`3d/ARCHITECTURE.md` §2 与本文件附录 A。机制缺口必须 `pending` 或
`adapter` + 行为夹具（要求见 §3.1），不得标 `not-applicable`。

## 3. 逐函数移植流程（先复制，再改）

> 文件级无法直接复制：2.5D 是 JS + DOM + Canvas，3D 是 GDScript + Godot 场景。
> 可控的复制单位是**函数**：原文逐字保留，桩先占位，翻译只做语法转换。

```bash
# 1) 生成原文桩（含 js 行号与逐字原文）
node 3d/tools/gen-port-stubs.cjs --only knife,fireShot,die,dawn

# 2) 在桩里逐行翻译；每个函数头保留 @src
#    # @src js/game.js:4226 knife(killer,victim)

# 3) 在 spec/mapping-ledger.json 登记映射
#    { "src": "js/game.js:knife", "target": "sim/sim_state.gd:knife", "status": "ported" }

# 4) 跑审阅：缺口必须逐条清零
npm run audit:parity

# 5) 提交前跑严格门禁
npm run audit:parity:strict
```

### 状态定义（`spec/mapping-ledger.json`）

| 状态 | 含义 | 要求 |
|---|---|---|
| `ported` | 逐行移植 | 守卫 / 字段写入不得有缺口 |
| `adapter` | 拆分到多个函数，或输入层适配 | 必须在 `note` 写清拆分点与差异 |
| `pending` | 尚未移植 | 禁止在 `--strict` 下提交 |
| `not-applicable` | 2.5D 的 DOM / Canvas / 主循环等不可 1:1 | 必须写理由 |

### 3.1 adapter 的行为夹具（2026-11-12 起强制）

- 每个 `adapter` 必须有 `@src` + 至少一组**行为夹具**：同一输入（角色状态 / 位置 / 任务 / `tIdx` / 模式）下，
  2.5D 与 3D 的**输出集合、顺序、提示文案、过滤条件**一致。
- 只靠 guard/write 对账不算通过；`collectInteractions` 这类返回列表的函数必须比对列表。
- 夹具放 `3d/spec/fixtures/`，由 2.5D `_t` 导出、3D 无头自测回放；新增 adapter 未带夹具不得提交。
- 2026-11-12 先以 `--tasktest` 的「非自己任务不出提示 / 自己的任务有提示」作为 `collectInteractions`
  的第一组行为夹具；后续 adapter 按同一格式补。

## 4. 审阅器做什么

`node 3d/tools/check-gameplay-parity.cjs`（`npm run audit:parity`）：

1. **函数映射**：扫描 2.5D 全部函数（当前 385 个）与 3D 实现，按 spec 表 → 同名归一化匹配。
2. **守卫对账**：抽 2.5D 的 `if (...) return`，检查 3D 实现里有没有对应标识符。
3. **状态写入对账**：抽 `.alive/.downed/.ghost/...` 的赋值，检查 3D 有没有写这个字段。
4. **3D 独有扫描**：有状态写入、但没有任何 2.5D 来源的函数 → 可疑自造规则。
5. **真源漂移**：`space.json` / `rules.json` 的 `sources` 指纹必须与当前 `js/` 一致。
6. **硬编码**：`GHOST_TASK_CAP` 等常量必须来自 `space.json`，不许在 GDScript 写死。
7. **行为夹具**：adapter 的输出集合 / 顺序 / 提示文案与 2.5D 一致；只查 guard/write 不算通过。

输出：`3d/reports/parity-report.md` + `parity-report.csv`（逐函数明细；生成物不入 `docs/`）。

积压用 `budget` 预算制：允许当前缺口存在，但不许变差；每清一批就跑 `--update-baseline` 把预算压下去。

## 5. 已发生的事故（反例，必须记住）

| 事故 | 3D 自造的东西 | 2.5D 原文 |
|---|---|---|
| 濒死 12 秒必死 | `downedT = 12` + tick 里 `die()` | 没有倒地计时；天亮 `dawn()` 才判 `bled` |
| 第二刀必死 | `if downed: return die(v)` | `knife()` 直接 `return`（濒死者不能再刀） |
| 死亡弹「你已阵亡」 | 全屏结算面板 + `R` 重开 | `alive=false; ghost=true`，穿墙全视继续做任务（额度 1 分） |
| 刀不到脸前的人 | 相机点积 `> 0.55` | `stab()` 只取最近 + `losNow`，没有锥 |
| 枪贴脸打不中 | 相机点积 `> 0.90` | `shoot()` 只取最近 + `losNow` + `visibleAt` |
| 破坏可重复 | `sabUsed` 只在玩家入口记 | `damageRoom()` 自己记 `sabUsed`（AI 同一条） |

## 6. 提交前检查清单

- [ ] `npm run audit:parity:strict` → 不差于 `spec/mapping-layers.json#parity_budget`（缺口下降后 `--update-baseline` 收紧）
- [ ] 新增或修改的规则函数有 `@src`，并在 `spec/mapping-ledger.json` 登记
- [ ] 新增/修改的 `adapter` 有行为夹具（输入 → 输出集合/顺序/文案），且 `audit:parity` 回放通过
- [ ] 任何 `adapter` 的 `note` 写清了「拆到哪里」与「为什么不是逐行」
- [ ] 没有新增计时器、阈值、阵营过滤、状态分支（除非 `@deviation` + 用户裁定）
- [ ] `npm run guard` PASS、`npm run baseline:check` OK

## 附录 A：红线在本工程的适用性映射

> 2026-11-12 分类收缩：原 `docs/agent/applicability-3d.md` 并入本附录，解释层不改 §一。
> 第 13、14 条按 `AGENTS.md` §一原文执行，不得自行放宽。

| 条 | 在本工程如何落地 | 校验 |
|---|---|---|
| 1 | `file://` 不适用于 Godot 运行时；精神保留：**零插件、零外部服务、无构建步骤**，`--headless` 可直跑自测 | Godot 无头冒烟 |
| 2 | 「`index.html` 唯一加载清单」映射为 **`project.godot` + `scenes/main.tscn` 是唯一入口**；不动态注入脚本、不加载 `res://` 之外的文件；依赖顺序按 `3d/ARCHITECTURE.md` §3 | `npm run 3d:import:check` |
| 3 | 3D 版本真源是 `3d/version.json`；改版本同批改 `package.json` 基线标识与 `3d/CHANGELOG.md`；界面只读 `Config.label()` | `npm run 3d:export:version` |
| 4 | 门禁必须全绿，报告写**本次实跑**的「X 通过 / Y 失败」，不得沿用旧读数 | `npm run check` |
| 5 | 无 DOM，`window.SKV3._t` 不适用；映射为 Godot 无头自测参数（`--walktest` / `--mgtest` / `--e2e` / `--speechtest` 等）：可新增，不得删除/改名/改变语义 | 对应自测参数 |
| 6 | **完全适用**：CC-BY / CC0 署名随仓保留；千问本地为唯一出图模型，SDXL 退役；Qwen-Image 2.1 非商用 | 人工 + `3d/ASSETS.md` |
| 7 | **完全适用并扩展**：规则 / 数值 / 语料只读 `3d/preview/data/*.json`（由 `js/` 导出），GDScript 不抄表；地图只在 `js/data/map.js` → `map.json` 一条链 | `npm run 3d:parity:check` |
| 8 | **完全适用**：Godot 0 插件、0 运行时第三方依赖；`playwright-core` 只服务本机自测 | 人工 |
| 9 | 「DOM id 双处同步」映射为 **`.tscn` 节点路径与 GDScript 引用双处同步** | 自测 |
| 10 | **完全适用**：中文记录，格式 `type(scope): 摘要`；命令行统一 PowerShell 7 | 人工 |
| 11 | **完全适用**：动 3D 前先在 `js/` 找源头；找得到照抄语义、数值读 `rules.json`；维度产物登记 `parity-map#allowed_differences`；否则先改 2.5D 真源再同步 | `3d:parity:check` + `3d:port:check` |
| 12 | **完全适用**：素材优先公开素材站 / 开源社区并留痕；本地生成走千问且先取公开设计参照 | 人工 |

## 附录 B：映射裁决与已知差距

> 2026-11-12 分类收缩：原 `docs/agent/PARITY_DECISIONS.md` 并入本附录；逐批落地清单见
> `3d/CHANGELOG-2026-11.md`，不在本文件重复。

### B.1 守卫与结构性差异（等价实现，非缺口）

- `G.noReport`（`js/game.js:2575` 唯一读取、全仓无写入）：恒 `undefined`；审阅器按「死守卫」识别，不迁。
- `envNotice`：2.5D 写 `a.mem` 环境记录；3D 等价信息由事件流 + 维修 offers 呈现（adapter）。
- `attention` 三态：3D 只保留玩法语义「做事=看不见」；`ui/suspend` 两态属表现层。
- `hear` 与事件流分离：`doorAutoSound` 不写事件流，3D 同样只进 `hear`。
- `_cast_ai_votes` 受 `ai_enabled` 门禁（3D 自测开关；2.5D 语义=AI 全关时投票也关）。
- `medbotTick` 救起写 `searched=false/stunT/draggedBy=null`，复用单一 `sim.revive` 链。

### B.2 已知差距（adapter 覆盖不全）

**2026-11-12 已全部补齐**：`findHideBody` / `disguiseOptions` / `audienceHotRooms` / `alienPlan`
均按 §3 逐行移植到 `sim/ai_alien.gd`，并由 `_plan` 效用表统一接管拉闸 / 破坏 / 拆机器人 /
狩猎 / 伪装（`_decide` 里对应的四段 if 入口已删除，`_exec_plan` 只执行 plan，不重算分数）。
前置缺口 `SKTeam` 表同期补进 `export-rules.cjs`（4 → 5 模块 / 53 表）。
`audit:parity:strict` 现值：未映射 0 / 守卫 0 / 写入 0 / 3D 独有 0 / 漂移 0。

数值来源：`SKSanity.DISGUISE`（21 键）/ `CRED`（7 键）在 `rules.json#tables.SKSanity`，
`SKTeam` 在 `rules.json#tables.SKTeam`（旧注记「未导出」是过期信息，已更正）。
`audienceHotRooms` 另需 `a.mind.mem` 的 `saw_agent` 同夜热度；3D 用 `a.why[]` 等价来源
（`parity-map#allowed_differences` 第 5 条），属 adapter 拆分点，不是 not-applicable。

**同日第三批（2026-11-12）再收三处**：

| 项 | 真源 | 3D 落点 | 行为夹具 |
|---|---|---|---|
| 对局不变量断言 | `js/engine/invariants.js`（A1-A23 / G1-G4 / D1-D6 / M1-M6 / W1-W2） | `sim/invariants.gd` + `sim.run_invariants()`；`sim.sim_run` 对应真源 `SIM_RUN` | `--invtest`：开局 280 项 / 三夜 845 项 0 失败，且 A11（刀数 9）与 D2（单向拖拽）两个破坏态必须被抓到 |
| 机器人刀击 | `stab():8300` / `knifeBot():8356` / `damageBot():8390` | `main._nearest_knife_any()` + `can_act("knife_bot")` + `sim.knife_bot()`（1.8 格 / LOS / redT / 保安转向） | `--knifebottest`：6 条拒绝守卫 + 命中副作用 |
| 会议开场 | `openMeeting:6205-6260` / `openingLine:5625` / `planFirstAccuse:7202` | `speech._opening_broadcast()` / `_opening_line()` / `plan_first_accusation()`（语料池 + 附议者） | `--meetopentest`：AI 报案句 / 玩家报案播报 / 无死亡播报 / 定调+2 附议 / 反硬编码 |

另更正两条失实注记：`doorBlockedSegment` 的「3D nav.los 不含门」不成立（`los_now` 已逐门判
`open>pass`，寻路侧走 `door_blocked_segment`）；`damageRoom` 的「异形幽灵破坏分支未接」不成立
（在 `_ghost_tick`，全局一次、不写目击证据）。`X-AUDIO` 的 BGM 也已由 ffmpeg 转 ogg 接入。
`port-manifest` 状态随之对齐：ported 13 → 21，partial 23 → 15；剩余 15 项里
`S-LOOP`（逐相位对账未签）、`D-PLATES`（panel-breaker 图内化）、`UI-REPLAY`（外部回放载入）、
`S-SABOTAGE`（故障视觉）是真差距，其余为台账口径未收口。

### B.3 玩家能力链路裁决（2026-11-11）

| 裁决 | 依据 / 落点 |
|---|---|
| 新增 `sim.can_act(kind, ctx)` 只读判定 | 2.5D 无同名函数：动作键无条件直达 `attack()/toggleDrag()/sabotage()/tryReport()`，守卫散在函数内。3D 收口为只判定不写状态的单一真源，逐条 `@src`，玩家与 AI 共用；执行仍走原入口。已在 `mapping-ledger.json#extras` 登记 |
| 删掉 `role` 双源 | 管道 / 刀 viewmodel / 出刀门槛统一读 `sim.me().alien`；旧夹具只改 `role` 就能解锁管道的洞已修 |
| 不新增 `friendly_fire` 配置 | 2.5D `knife()` / `fireShot()` 都不查目标阵营；只能删 3D 自造限制，不能往 3D 加真源没有的新状态 |
| 交互键位 | 属红线 11 允许的「输入映射」差异；8 个键收敛进 InputMap，代码只读 action |
| 卡墙兜底 | 玩家物理与 AI 网格不同源属维度产物；`nav.nearest_free` / `is_free` 投影收口，未新增规则 |

### B.4 交互提示过滤（2026-11-12 用户现场）

- 3D 旧实现给所有任务设备生成 offer，非自己任务只改文案「（不是你的任务）」，按 E 只得到拒绝提示。
- 照抄 2.5D `collectInteractions`：先求 `nearest_task_dev`，正常玩法只保留最近且 `sim.can_do_task()` 为真的任务点；
  `_sim_gate=false` 仅 `devicetest` / `e2e` / `tasktest` 全开。
- 回归：`--tasktest` 断言「非自己任务 2 不出提示 / 自己的任务 0 有提示」，26 点 0 失败。

### B.5 排除项纠正（2026-11-12）

| 2.5D | 原状态 | 改为 | 理由 |
|---|---|---|---|
| `sabTick` | not-applicable | pending → 已移植 | 站桩破坏 vs 交互即结算，等价性已用行为夹具证明 |
| `recordFrame` | not-applicable | pending → 已移植 | 复盘帧快照（0.5s 全员坐标）已迁 |
| `replayData` | not-applicable | pending → 已移植 | 回放导出结构已迁 |
| `envNotice` | not-applicable | pending → 已移植 | `a.mind.mem` → `agent.ev_mem` 容器不同构，adapter 已证 |

`not-applicable` 只允许输入 / 维度 / 美术 / 2D-DOM-Canvas 四类；机制缺口必须 `pending` 或
`adapter` + 行为夹具。`budget.pending` 现为 **0**（`audit:parity:strict` 五项全 0）。

## 附录 C：`buildMeetCtx` 字段映射

> 2026-11-12 分类收缩：原 `docs/audit/PORT-DIFF-AUDIT.md` §J 并入本附录。3D 为等价实现，不另造对象。

| 2.5D `buildMeetCtx` 字段 | 3D 存储 / 消费方 |
|---|---|
| `kind` / `reporter` / `victim` / `room` | `meeting.kind/reporter/victim/room/in_corr` |
| `seq` | `meeting.seq`（`meet_seq` 每场 +1） |
| `ctx.lead` | `meeting.lead`（`note_accuse`，只有 solid 指控写） |
| `ctx.frames` / `ctx.opening` | `accuse` + `accuseWhy`（`opening/fake/bus`） |
| `ctx.testimony` | 排期时直接 `mind.note_testimony`，无独立队列 |
| `ctx.playerSays/playerVote/playerClaimRoom` | `meeting.player_intent` + `speech` 的 `alibi`；不建 ctx |
| `ctx.victimInfo` | `meeting.victim` + `bodyPos` |
| `remainMs` | 夜钟暂停，会议结束原样恢复（`_after_meeting`） |
| `votes` / `voteMeta` / `tally` / `matrix` | `meeting.votes/voteMeta/result` |
| `lines` | `speech.feed` + `sim.events#chat` |
| `reveal` | `meeting.t = reveal_sec` + `phase=result` |
| `startAt` | `meeting.t`（剩余秒） |
