# 3D 修改记录

## 2026-11-13 · 行为映射补齐：人类搜尸/循声、异形报案、破坏落点

- **改动依据（逐条对 `js/` 行号，不看读数）**：
  ① `js/game.js:2720-2748 lootRun` + `:2193-2196 observeBody`：人类缺弹/缺包/缺申请单时，
  视野 12 格内带这些物资的尸体/濒死者要主动去翻；看过但离开的目标记 `_lootMem`，30 秒内绕回去收。
  3D 旧实现只在贴脸（2.2 格）时才搜，不会主动走过去。
  ② `js/game.js:2962-2977`：`alert>=0.7` 且 8 秒内有动静 → 去现场看一眼，到了（3 格）或 10 秒后
  警觉 −0.5。3D 的 `hear()` 一直在写 `noise`，但**没有任何读取方**，这条行为整条缺失。
  ③ `js/t2/ai.js:333-337 evPush`：`heard_#` 只有 `conf>0.25` 才提警觉/写 `noise`；3D 旧实现不分
  conf 一律写，0.12 的远处门声也算「值得去看一眼」。
  ④ `js/game.js:2205 observeBody`：看见尸体/伤者 `alert += 0.45`；3D 只有 `hear` 提警觉，看尸体不提。
  ⑤ `js/game.js:2852-2862`：救人要求「手上没有在走的路」且别人已在救/已拖着的人不重复上手（busy）。
  ⑥ `js/game.js:2836-2850`：拖尸途中尸体失效 / 无人机不可用 / 人已进医疗间就松手，否则拖到坞位。
  ⑦ `js/game.js:2812-2814 / 2775-2788 taskThreat`：站桩做任务时确证异形逼近 → 弃任务逃跑。
  3D 旧实现把这段放在 `doing>0 → continue` 之后，是永远走不到的死分支；且判定式写成
  `(closing and d<=3.5)`、漏了 `fleeThreshold` 性格系数，本批按原文回正。
  ⑧ `js/game.js:2824-2834`（人类，掷骰 0.45）/ `:3773-3782`（异形，掷骰 0.35）：开局错峰延迟。
  ⑨ `js/game.js:3786-3848`：异形行凶后「先离开做不在场 → 再回尸体旁，没人看着先摸物资 → 拉铃报案」；
  收益取 `alienReportWorth`，没人看见时下限 0.55，被看见过则减半、直接拉铃概率 0.35→0.2。
  3D 旧实现只有 `scan_bodies` 被动拉铃，没有这条主动策略。
  ⑩ `js/game.js:3538-3552`：异形 45 秒内仍会回去收自己放倒的人身上的物资。
  ⑪ `js/game.js:1098-1113 sabSpot`：破坏落点在舱内任务点里**均匀随机**、每夜缓存；
  3D 旧实现固定取第一个点，且 `damageRoom` 与 AI 计划各自取点（可能报一个点、坏另一个点）。
  ⑫ `js/game.js:4104`：破坏触发是「进舱即下手」或 1.7 格内，3D 旧实现只判 1.7 格。
  ⑬ `js/game.js:7947-7960 finishFix`：故障修好瞬间，同一故障的所有人立即松手。
  ⑭ `js/game.js:2566`：正在去修故障/合闸的人不会被路边尸体拽住（`!a._fixGo && !a._lightGo`）。
  ⑮ `js/game.js:2874-2879` 人类开枪门槛链：`thr=SKTrait.C.shootSus(a)`（激进 0.36 / 中性 0.50 / 谨慎 0.60），
  只有存在准-确证敌人才 ×0.7；`bestSusTarget` 走夜间折价，且 `almostFriendOf` 命中就不打，
  没有可疑目标时用 `affordableAlmostShot`（sus≥0.85×thr）。3D 旧实现是**固定 0.5×0.7=0.35**
  且把确证直接折成 +2 分 —— 谨慎/激进性格在开枪上完全失效，也没有"基本是好人"的保护。
  射程/追猎判定从 `_shoot_target` 挪回 `_decide`（真源里射程是"能不能打"、chase 是"愿不愿追"）。
  ⑯ `js/game.js:3874` 异形挑目标先 `isMate` 排除队友（3D 旧实现缺）；`:3947` 没刀时贴身也用枪。
  ⑰ `js/game.js:2843 nearestDowned`：救人目标也要 `aiCanSee`（3D 旧实现只按距离，能隔墙救人）。
- **改动**：`sim/ai_human.gd`（新增 `_task_threat / _loot_run / _start_loot_search / _look_around`）、
  `sim/ai_alien.gd`（新增 `_report_plan / _alibi_spot / _has_body`、错峰延迟、破坏落点委托）、
  `sim/sim_state.gd`（`sab_spot_for` + 每夜缓存、`fix_damage` 全員松手、`hear` 的 conf 门、
  击杀记账 `_killBody/_killDecided`、夜间字段复位）、`sim/mind.gd`（`_lootMem` 与 `alert +0.45`）、
  `tests/test_sim.gd` 未改动逻辑（诊断打印已撤）。
- **未改任何数值 / 未新增状态机 / 未按胜率调参**：所有常量在读出处（`rules.json` / `space.json`）或
  `check-parity.cjs#SOURCE_LITERALS` 登记（新增 `2.6 → js/game.js:3810`）。
- **文件预算**：sim_state 3600→3680、ai_alien 1200→1330（本批新增的是逐行移植的行为分支）；
  同时把此前走默认 1200 的 8 个小文件显式收紧（ai_human 760 / speech 1560 / bots 400 / crew_view 340 /
  grid_nav 300 / lines_data 300 / invariants 220 / body_state 90 / rules_data 120），净棘轮仍向下。
- **T3 记录（只作事后观测，不作改动依据）**：`--simtest` 26/0；`--aittest prog=8/45 qual=2`；
  `--parityfixture` 4 机制 0 失败；`npm run check` 9 通过 / 0 失败；`file:check` 52 文件 / 27,204 行；
  `map:check` 999 函数 · unmapped 0 / 反向未登记 0。

## 2026-11-13 · 执行层源码回正：人类 AI 领单与补给（依据 js 行号）

- **改动依据（只认真源语义，不看读数）**：
  ① `js/game.js:2980` `if(a.qualPending>0)`：2.5D 没有 `qual<2` 的附加条件；3D 旧实现多加了一道门，
  `qual=2` 时待领申请单永不结算。
  ② `js/game.js:1007-1012` `supplyTargetFor`：有人濒死才买医疗包，否则缺弹才买弹；
  3D 旧实现「缺包就买」，多跑补给点、挤占任务时间。
  ③ `js/game.js:2999` `supplyPoints().find(q=>q.item===need)`：补给点键是 `ammo` / `med`；
  3D 旧实现用 `"medkit"` 查点，查不到时回退圆桌 —— AI 会跑去圆桌「买医疗包」。
  ④ 上一批刀循环修复的真源依据同样是行号：`js/game.js:4199-4200`（不在刀程时 `walkTo(tgt.x,tgt.y)`），
  3D 旧实现判定失败后原地返回。
- **改动**：`sim/ai_human.gd` 按上述行号回正三处；未改任何数值、未新增状态 / 阈值 / 分支。
- **T3 记录（只作事后观测，不作改动依据）**：`--simtest` 26/0；`--aittest` 遥测 `prog=6/45`；
  `file:check` 52 文件 / 26,836 行；`npm run check` 9 通过 / 0 失败；
  `audit:parity:strict` 391 / 245 / 67 / 0 / 0 / 0 / 0。

## 2026-11-13 · AI 能力实测：修复异形贴墙空转（knife_try 10022 → 201）

- **背景**：用户反馈 3D 的 AI/玩家能力比 2.5D 少很多。用 12 局同 seed 批量遥测对照 2.5D 蒙特卡洛：
  3D 刀 5.17/局 vs 2.5D 8.58、开枪 1.33 vs 2.25、破坏 5.83 vs 9.5、搜尸 3.0 vs 4.67、
  进度 15.1 vs 20.9、平均夜 5.58 vs 4.33；异形决策 `knife_try 10022 / knife_ok 62`。
- **根因**：`can_act("knife")` 按**当前坐标**复判距离/LOS，而 AI 的目标可能来自 25 秒记忆位置；
  判定失败后旧实现直接 `return`，异形贴着掩体每帧重试，整晚不做别的事。
- **修复**：失败后改为 `sim.set_path` 追目标**当前**坐标，0.5 秒后再决策（不再原地空转）。
  同时把 `sabotage/bot` 计数并入事件流去重，新增批量遥测 `ev_stat`（按事件 kind 汇总）与 `hides` 求和。
- **读数变化**（12 局同 seed，修复前 → 后）：`knife_try 10022 → 201`、`knife_ok 62 → 78`、
  击杀 68 → 89、破坏 70 → 83、管道 19 → 33、拖拽 172 → 379、平均夜 5.58 → **4.33**（与 2.5D 4.333 一致）；
  胜率 人类 58.3% → 25% / 异形 33.3% → 75%（12 局小样本；2.5D 同 seed 为 41.7/58.3，需 200 局复核）。
- **夹具**：`--simtest` 26/0、`--parityfixture` 0 失败、`--aittest` 遥测正常；`npm run check` **9 通过 / 0 失败**；
  `file:check` main.gd 5,550 / ai_alien.gd 1,199（均在预算内）。
- **下一批立项依据**：3D 人类 AI 的任务进度仍低于 2.5D（15.1 vs 20.9，修复后因异形变强降到 5.6）；
  异形实际钻管道 2.75/局 vs 2.5D 9.83。两项需各自的批量对照，不要靠感觉调参。

## 2026-11-13 · 正向缺口收口：unmapped 31 → 0，只剩回放界面 32 条

- **本批改动**：把账本最后 31 条 `unmapped` 逐条定性。
  ① **11 条判允许差异**（红线 11）：DOM chip / 按钮样式 / 尸检信息行、Canvas 坐标变换、
  DEV 覆盖层几何、2.5D WebAudio 提示音（3D 由 `audio.gd` 统一承担）。
  ② **20 条找到 3D 承担者**：`LENS.lr → sim/ai_alien.gd:_lens_lr`；
  `order/rankedLr → _decide`（排序内联）；`talkScore/jit/hjit → sim/speech.gd:tick`（排期内联）；
  `heat → mind.public_heat`；`patron → mind.is_patron`；`onCancel/onDone → minigame_layer._fire_cancel/_fire_done`；
  `keepCred/keepEmo/keepSus/keepWhy → mind.reset_night`（跨夜衰减内联）；
  `clone/push → speech._ctx_for`；`denyReply → speech._ai_line`；`sec → ai_alien._decide`；
  `trait → mind.init_agent`；`decision.note → sim_state._tick_meeting`。
- **读数变化**（本次实跑）：账本 999 函数 **ported 115 / auto 112 / adapter 373 / not-applicable 367 /
  pending 32 / unmapped 0**，目标悬空 0，反向未登记 0；预算收紧 `unmapped 31 → 0`。
  `npm run check` **9 通过 / 0 失败**；`audit:parity:strict` 391 / 245 / 67 / 0 / 0 / 0 / 0；
  `3d:parity:check` 70 个纯函数 55/15/0。
- **下一批立项依据**：剩余 32 条 `pending` 全部是 `js/ui/replay.js`（回放界面）；3D 目前只有
  `ui_panels.open_replay` 与 `_replay_text` 两个入口，需补时间轴、地图回放、事件筛选与导出。
  这是独立特性批次，先做设计再动代码。

## 2026-11-13 · 归因批次：3D sim 反向未登记 102 → 0

- **本批改动**：
  ① **29 条同名实现补 `target`**：27 条 `sim/mind.gd` ↔ `js/t2/ai.js`（susOf / crimeWindow /
  bestSusTarget 等），2 条 `sim/lines_data.gd` ↔ `js/data/lines.js`（pool / toneOf）。
  ② **6 条改指真实实现**：`bodyNear` / `bodyHasLoot` → `sim/body_state.gd`，
  `roomAt` → `sim/grid_nav.gd`，`canReportBody` / `syncDragOf` / `findHideBody` → 自身；
  原目标 `sim_state.gd` 的薄转发改登记 `extras`。
  ③ **72 条登记 `ledger.extras` 并逐条写理由**：规则读取器（rules_data 11 条）、A* 网格维度（5 条）、
  认知内部辅助（mind 10 条）、状态机拆分（sim_state 15 条）、机器人/视图/台词/发言装配等。
  ④ `check-gameplay-parity.cjs` 的 GDScript 索引补 `static func`（此前 `body_state.gd` 整文件
  被判 `broken-target`，暴露了 2 条假缺口）。
  ⑤ `mapping-layers.json#reverse.budget_unregistered_sim` **102 → 0**。
- **读数变化**（本次实跑）：反向未登记 **0**；`map:check` 999 函数 / 目标悬空 0 / 反向 0；
  `audit:parity:strict` 391 / 映射 245 / 自动 67 / 未映射 0 / 守卫 0 / 写入 0 / 3D 独有 0 / 漂移 0；
  `npm run check` **9 通过 / 0 失败**；`3d:parity:check` PARITY OK（10 条结构性 WARN）。
- **下一批立项依据**：正向还剩 63 条缺口（pending 32 + unmapped 31），集中在回放界面与认知辅助；
  逐条补完后，账本才算 2.5D 全覆盖。

## 2026-11-13 · 独立性审计：反向覆盖进账本，sim_state 纳入硬编码扫描

- **本批改动**：
  ① `map:check` 增加**反向覆盖**：`sim/` 下每个函数必须要么是账本 `target`，要么在 `ledger.extras`
  登记理由；`private` 且不写 agent 状态的内部辅助不计。当前 **102** 个未登记，写入
  `mapping-layers.json#reverse.budget_unregistered_sim = 102`，此数只许下降。
  ② `3d:parity:check` 的硬编码扫描纳入 `sim_state.gd`（规则层最大文件此前漏扫）；
  登记 3 个已核对真源字面量：`2.4`（tryReport 半径 `js/game.js:4903`）、`16`（广播半径 `js:4298`）、
  `0.62`（拖尸距离 `js:2456`）。剩余 10 条 WARN 是结构性常数（数据兜底 `31/33.5`、`0.000001` epsilon、
  `0.004/0.002` 容差、`9999` 哨兵），保留 WARN 逐条确认，不静默放行。
- **读数变化**（本次实跑）：3D **872 函数 / 26,826 行**；账本 999 函数；被账本显式指向的 3D 函数 **248**
  （28.4%）；sim 层反向未登记 **102**；红线允许差异 **10 条**（`parity-map#allowed_differences`）。
  `npm run check` **9 通过 / 0 失败**；`3d:parity:check` PARITY OK（10 WARN）；`map:check` 999 / 悬空 0 / 反向 102。
- **下一批立项依据**：102 个反向未登记 sim 函数逐条归因——是 2.5D 换名实现就补账本 target，
  是 3D 自有就登记 `extras` 并写理由；归因完成后再下调 `reverse.budget_unregistered_sim`。

## 2026-11-13 · 真源收口第二批：parity-map 并入账本

- **本批改动**：
  ① `check-parity.cjs` 改读 `mapping-ledger.json`：70 个纯函数按「模块 → 2.5D 文件」查账本条目，
  状态白名单 `ported/auto/adapter/pending`，`not-applicable`/`unmapped` 直接 FAIL；不再读 `parity-map.modules`。
  ② `parity-map.json` 收缩为**政策文件**：只保留红线 11 引用的 `allowed_differences`（10 条）与 `truth_sources`，
  `modules` 移除（判决已并入账本）；`export-rules.cjs` / `simdump.cjs` / `portability-audit.cjs` 的引用文字同步。
  ③ 两条纯函数 `seatNo` / `bodyReported` 从 `not-applicable` 改判 `adapter`（UI 直渲染 `i+1` / 字段直取）。
- **读数变化**（本次实跑）：`3d:parity:check` 70 个纯函数 **synced 55 / adapter 15 / pending 0**
  （旧读数 63/7 是 parity-map 口径；其中 9 条经 gameplay-parity 复核后判 `adapter`，理由在账本 note）；
  `npm run check` **9 通过 / 0 失败**；`audit:parity:strict` 391 / 映射 245 / 自动 67 / 未映射 0 /
  守卫缺口 0 / 写入缺口 0 / 3D 独有 0 / 漂移 0；`map:check` 999 函数 / 目标悬空 0。
- **下一批立项依据**：账本剩 63 条缺口（pending 32 + unmapped 31），并开始用行为夹具把 112 条 `auto` 升级为 `ported`。

## 2026-11-13 · 总映射层：一张账本替掉四处映射源与门禁里的猜测

- **本批改动**：
  ① 新增 `3d/spec/mapping-layers.json`：12 层分层、系统 → 层映射、整系统状态政策（DOM/Canvas/入口/测试面
  判 `not-applicable`、按键映射判 `adapter`、回放判 `pending`）、`parity_budget`。
  ② 新增 `3d/spec/mapping-ledger.json`：**999 个 2.5D 函数逐条判决**，同名嵌套定义用 `occ` 序号区分；
  这是函数映射的唯一真源。
  ③ 新增 `3d/tools/build-mapping-ledger.cjs`：只做机械归位（算系统/层、校验目标存在、算汇总、对预算），
  **不再按函数名自动配对、不再按 DOM 正则猜状态**；新增函数默认 `unmapped`，缺口只许收敛。
  ④ 新增 `3d/tools/map-diff.cjs`：`--section` 并排打印 2.5D 原文与 3D 目标原文（带行号）、
  `--pending` 缺口清单、`--layer/--status/--stats/--json`。
  ⑤ `3d/tools/check-gameplay-parity.cjs` 改为只读账本：删除 `autoTarget()`、DOM/Canvas 正则推断、
  `ignore` 与 `--init`；预算迁到 `mapping-layers.json#parity_budget`。
  ⑥ `tools/check-all.cjs` 增加第 9 项 `map:check`。
  ⑦ 逐条判决了旧门禁里被「同名自动匹配」掩盖的 **66 条 pending**（Canvas/DOM 判 `not-applicable`，
  交互/会议/发言找到 3D 换名实现判 `ported`/`adapter`），另有 6 条 UI 换形守卫差异改判 `adapter`；
  再把判据明确的三个簇落账（性格公式 17 条 → `rules.json#tables.SKTrait` 导出期烘焙、几何 5 条 → `grid_nav`、
  小游戏 21 条 → `minigame/mg_*.gd`），`unmapped` 74 → **31**。
- **读数变化**（本次实跑）：账本 **999 函数**：ported 114 / auto 112 / adapter 352 / not-applicable 358 /
  pending 32 / unmapped 31，目标悬空 **0**；预算收紧 `pending 104 → 32`、`unmapped 74 → 31`。
  `npm run check` **9 通过 / 0 失败**；`npm run audit:parity:strict` 总函数 391 / 映射 243 / 自动 67 /
  未映射 0 / 守卫缺口 0 / 写入缺口 0 / 3D 独有 0 / 漂移 0。
- **下一批立项依据**：剩余 74 条 `unmapped` 集中在 `js/t2/ai.js`（认知辅助）与 `T3-VIEW`；
  逐条判决后再用 2.5D `_t` 导出行为夹具，把 `auto` 逐步升级为 `ported`。

## 2026-11-13 · 逐行审核批：交互键 / UI 锁 / AI 站桩

- **本批改动**（只改 3D 表现层与输入层；判定数值仍取自 2.5D 真源）：
  ① **交互半径回真源**：任务 `nearPoint` **2.6**（原 `reach.fix` 2.0）、管道 1.6、补给 1.7、
  监控 1.8；`R` 报告按 `tryReport` 2.4 + 只报未报告 + 先判额度/夜场。此前站在 2.0–2.6m
  按 F「毫无反应」。
  ② **`ui_locked` 单一重算补全**：`_tick_detained` 每帧重写时补上轮盘 / 尸检-监控面板 /
  设置-复盘面板 / 对局结束；`_update_interaction` 同步挡这些相位与站桩中；`_tick_station`
  在会议/面板期间不推进、濒死/拘留取消 —— 修「轮盘打开还能走 / 站桩在会议里偷偷完成」。
  ③ **尸体交互视线**：搜尸 / 报告 / 拖拽 / 施救 / 查看记录都要求玩家到身体的几何 LOS
  （2.5D `collectInteractions` 的 `visibleAt`）；已报告尸体不再出报告项，别人拖着的尸体
  不再出拖拽项；轮盘按行动价值排序，≤8 项时不再把施救/搜尸排在后面丢掉。
  ④ **F / V / C 收口**：F 只选**自己的**任务设备（先过 `can_do_task`），没有自己的任务时
  给「不是你现在的任务」；幽灵拒绝 V/C；监控补 alive/downed/detained 守卫。
  ⑤ **AI 站桩**：①天亮刷新点改回 `randIn` 的 rect 内随机（旧实现只采 poly 顶点，
  顶点全在墙线上 → 200 次全失败 → 所有活人叠在 label 点）；②无目标异形补 2.5D
  `alienSupport` 的效用表行动（拉闸/破坏/拆机器人/伪装），不再握刀站等；
  ③跨夜清 `_fixGo`、复电清 `_lightGo`（旧实现分别只在「有故障」「断电」分支内清理）。
  ⑥ HANDOFF §0.5 增第 ⑮ 条：交互半径不是一个数，逐项回 `js/game.js` 的 near* 查。
- **读数变化**（本次实跑）：
  `npm run check` **8 通过 / 0 失败**；`audit:parity:strict` **391 函数 / 映射 210 / 未映射 0 /
  守卫 0 / 写入 0 / 漂移 0**；`3d:parity:check` PARITY OK；`baseline:check` OK **407 文件**；
  `file:check` **52 文件 / 26,826 行 / 最大 main.gd 5,546 行**。
  Godot 无头：`navtest 28/0`、`tasktest 26 点 0 失败`、`reachtest 26 点 0 走不到`、
  `simtest 26/0`、`b4test 8/0`、`socialtest 6/0`、`meetingtest ok=true`、`dragtest 0 失败`、
  `abilitytest 0 失败`（InputMap 8/8、offers=3 report[R]/drag[G]/search[E]）、
  `taskflowtest ok=true`、`interacttest` 轮盘/管道/领取全过；
  `aittest prog=23/45 tasks=23 nights=3`（本批前 20/45）。
  另跑 8 局抽样（`--sim1000 --games 8`，seed 20261108 起，**样本太小不作基线**）：
  人类 75.0% / 异形 12.5% / 超时 1，场均末进度 8.9 → 14.4，`no_target` 410 → 1011
  （异形不再握刀站等，转去支持行动）；需要基线时按 1000 局重跑。
- **下一批立项依据**：`file-budgets.json` 的 10 条超长函数 WARN 待拆；`docs:check` 仍因
  本仓 AGENTS.md §一 的 3D 路径适配与上游不逐字一致（治理决定，未擅改）；
  `3d/preview/data/cover_refs.json` 缺 `schema_version`（legacy）。

## 2026-11-13 · 上游 11-13 同步（设施/任务点锚点）+ 幽灵/搜尸链回归修正

- **本批改动**：
  ① **基线同步**：`baseline:sync` 取上游 11-13 的 `js/data/map.js`（监控台 / 电闸锚点贴回家具，
  4 个任务点微调 ≤0.4 格）与 `js/game.js`（DEV 渲染性能批，净 +119 行）；重跑
  `export:all → build-map-v2 → 3d:export:sim`，12 个 `3d/preview/data` 快照与 `rules.json#sources` 同步。
  ② **行号对账**：`port-manifest.json` 全表 `js/game.js` 行段按插入位移重算（X-BIND → 11874–12065，
  文件末行 12065）；`check-parity.cjs#SOURCE_LITERALS` 15 条源码字面量重新登记并逐行回读校验。
  ③ **3D 设备落位回归**：上游把任务点贴到柜体边线后，`scene_extras._task_placement` 的 0.2 格
  「压掩体」判据把贴边锚点误判成埋进柜体，设备被搬到 2.54 m 外（`REACHTEST` FAR 1 项）。
  改为只对「真正埋进柜体 ≥0.1 格」的点重定位；贴边锚点留在原地、用 0.55 m 台座抬离地面。
  ④ **幽灵速度**：人类幽灵赶去做任务时按 `js/game.js#aiGhost` 用 6.5 格/秒（此前误用游荡的 2.4）。
  ⑤ **尸体/搜尸链**（按 `bodyHasLoot / bodyNear / searchBody / lootBody` 逐行）：
  - AI 站桩 `_doing='search'` 完成后补 `_finish_doing` 结算分支（此前 AI 搜尸无任何产出）；
  - AI 人类 AI 里重复的「即时搜尸」副本删除，统一走 `sim.scan_bodies`（STAND.search 1.2 s）；
  - 子弹/医疗包各只补到 1、申请单补到 2，并继承 `qualPending`；濒死者可被搜；
  - 已搜过的死者只有身上仍有物资时才可再搜；`draggedBy` 的 `null/-1` 双空值按真源归一；
  - 尸检链拆到 `scripts/sim/body_state.gd`（`sim_state.gd` 3600 行棘轮：3628 → 3573）。
  ⑥ **文档**：HANDOFF §0.4 的「幽灵未迁」、README §6 的「假设层/BGM 未接」等过时口径按实况更正。
- **读数变化**（本次实跑）：
  `npm run check` **8 通过 / 0 失败**；`audit:parity:strict` **总函数 391 / 映射 210 / 未映射 0 /
  守卫缺口 0 / 写入缺口 0 / 漂移 0**；`3d:port:check` **0 错误 / 1 既有 legacy WARN**；
  `3d:parity:check` PARITY OK；`baseline:check` OK **407 文件**；`file:check` **52 文件 / 26,819 行 /
  最大 main.gd 5,539 行 / 10 个历史超长函数待拆**；`guard` PASS、`agent:contract` PASS。
  Godot 无头自测：`navtest 28/0`、`tasktest 26 点 0 失败`、`reachtest 26 点 0 走不到 0 缺设备`、
  `simtest 26/0`、`b4test 8/0`、`socialtest 6/0`、`meetingtest ok=true`、`dragtest 0 失败`、
  `abilitytest 0 失败`、`powertest` 三态/门/时长全过、`interacttest` 轮盘/管道/领取全过、
  `taskflowtest ok=true`、`aittest prog=20/45 nights=3`。
  上游 2.5D 门禁同批复核：**920 通过 / 3 失败**（3 条均为上游已登记时序抖动，exit 0）。
- **下一批立项依据**：`file-budgets.json` 的 10 条超长函数 WARN 仍是待拆清单；
  `3d/preview/data/cover_refs.json` 缺 `schema_version`（legacy）；美术侧（人物/家具）照旧归美术栏。

## 2026-11-12 · 大文件工程化：调试夹具迁出 main.gd + 结构索引与预算棘轮

- **本批改动**（纯结构，不动任何玩法语义）：
  ① **41 个调试夹具迁出** `main.gd` → `3d/preview/scripts/tests/`，按域分 6 个模块：
  `test_fixture`（行为夹具 6）/ `test_sim`（判定 10）/ `test_combat`（战斗 4）/
  `test_social`（社交 5）/ `test_ui`（界面 8）/ `test_world`（世界 8）。
  全部改为 `static func _run_xxx(__h)`，宿主实例经 `__h` 传入；成员访问、宿主方法调用、
  信号回调 Callable 统一加 `__h.` 前缀，`:=` 在无法静态推断处降为 `: Variant`。
  `main.gd` 只保留 6 个 `preload` 常量与参数分发（`TestXxx._run_xxx(self)`），不再含任何夹具实现。
  ② **新增 `3d/tools/filemap.cjs`**：函数级结构索引，支持 `--top / --file / --section / --json / --check`。
  目的是让「找到要改的那 25 KB」不必先读 377 KB：`--section <片段>` 直接打印函数原文与行号。
  ③ **新增 `3d/spec/file-budgets.json` 预算棘轮**：单文件上限、单函数 200 行上限、
  `tests/` 目录外禁止出现 `_run_*test`；额度只许下调，上调须在本文件写明理由。
  已登记 10 个历史超长函数为 WARN（待拆清单），不隐藏、不豁免为 FAIL。
  ④ `npm run check` 由 7 项增至 **8 项**（新增 `file:check`）；新增 `npm run file:map` / `file:check`。
- **读数变化**（本次实跑）：
  `main.gd` **9,580 行 / 376,906 字节 → 5,437 行 / 212,220 字节**（−43%），
  顶层函数 199 → 158，调试夹具占比 41% → 0%；`filemap --check` **51 文件 / 26,646 行 /
  最大 main.gd 5,438 行 / 10 个历史超长函数待拆**。
  `npm run check` **8 通过 / 0 失败**；`baseline:check` OK 407、`docs:check` PASS、
  `agent:contract` PASS、`guard` PASS、`3d:port:check` 0 错误 / 1 条既有 legacy WARN、
  `3d:parity:check` PARITY OK、`audit:parity:strict` **映射 210 / 未映射 0 / 漂移 0**。
  行为回归（逐条实跑，与拆分前读数一致）：`simtest` 26/0、`bottest` 7/0、`b4test` 8/0、
  `b6test` 6/0、`tasktest` 26 点 0 失败、`reachtest` 26/0、`navtest` 28/0、
  `invtest` 0 失败（1,126 次检查）、`dragtest` 0 失败（cap=3 engine=3 power=1）、
  `knifebottest` 0 失败、`meetopentest` 0 失败（open=1 echo=2 framed=3）、
  `speechtest` 17/0、`socialtest` 6/0、`leadtest` 5/0、`meetingtest` ok=true、
  `aiporttest` 13/0、`minimaptest` 4/0、`hometest` 6/0、`settletest` 5/0、`roletest` 4/0、
  `taskflowtest` ok=true、`abilitytest` 0 失败、`arttest` / `floortest` / `probetest` 0 失败、
  `aittest` prog=26/45 tasks=26 sab=4 nights=3。
  **既有失败（拆分前后 A/B 对照完全一致，非本批引入）**：`uitest` 1 项（讨论期跳过不推进）、
  `mousetest` 2/3（headless 鼠标模式）、`meetuitest` 12 过 / 11 败（讨论期投票与跳过相位）。
- **下一批立项依据**：`file-budgets.json` 的 10 条 WARN 就是待拆清单——`main._ready`（504）、
  `main._collect_offers`（353）、`main._build_hud`（223）、`ai_alien._decide`（368）、
  `speech.plan_alien_deception`（270）、`speech.player_say`（267），
  以及本次原样迁出的 4 个长夹具（probetest / aiporttest / meetuitest / speechtest）。
  表现层下一步按 world / ui / view 三段切，切完再把 `main.gd` 上限从 5,550 下调。

## 2026-11-12 · 同步 2.5D 修复：搜尸策略 / 地道灯 / 走廊补角

- **本批改动**：同步 2.5D 的 `js/game.js` 变更（搜尸不弹小游戏、地道口暖黄呼吸灯、
  走廊底图补角）；`port-manifest` 的 X-BIND 行段末值更新到 **11946**，
  `3d:export:rules` 重导 `rules.json` 的 sources 指纹；`baseline:sync` 拉入共享
  `base-lit.png` / `test-v3.cjs` / `blender-ship.py`，基线仍 **407**。
  3D 侧 `sim.search_body()` 是直接调用，没有小游戏入口；本次不改 3D 判定。
- **读数变化**：`check` **7/0**（port 0 错误 / parity PASS）；T3 **13 PASS / 0 WARN / 0 FAIL**；
  `baseline` **407 OK**；`docs:check` PASS。
- **下一批立项依据**：3D 不需要复制 2.5D 的 corridor 底图补角（运行时不读该底图）；
  后续只在 2.5D 侧维护地道灯与拐角底图。

## 2026-11-12 · 现场修复：拖尸看不见 / AI 全员挤故障点

- **本批改动**（两条都按 2.5D 真源，先复现再修）：
  ① **拖尸"拖不动"**——根因不在判定，在**视图**：`crew_view._pos3_floor()` 对所有人一律读
  `agent.pos`，而拖行只写 `bodyPos`，于是逻辑上尸体跟着走了、模型钉在死亡位置。
  改为死者读 `bodyPos`。同时把拖行结算按 `syncDragOf`（js/game.js:2425）重写：
  拉到身后 **0.62 格**（不再瞬移到脚下）、活着的伤员同时写 `pos`/`bodyPos`、
  拖拽者死亡/濒死/被拘/会议开始/结算时**强制松手**（同步循环前置到 `tick` 顶部，
  会议期间也跑）、拖入医疗间记 `credBroadcast`、拖离医疗间 2.2 格触发
  `dragAwayNotice`（6 格内在线活人各记一条 `saw_drag_away`）。
  另外把 `_on_drag_start` 的提示从「再按 E 放下」改成真源键位 **G**。
  ② **AI 全员挤在一个点**——`ai_human` 的抢修分支写死 `dmg[0]`、没有人数上限，
  11 个人类 AI 全部涌向同一处（破坏点又正好落在任务点坐标上，看起来就是"挤在任务点"）。
  按 `aiHuman:2911-2934` 重写：每人只在「已在修 / 正在赶」人数 < `SKTeam.FIX_CREW_CAP=3`
  的故障里挑**最近**的一个，`_fixGo` 锁定到修好；任务到达判据从 `reach.fix(2.0)`
  改回真源 **2.8 格**（js/game.js:3017）。
- **读数变化**（本次实跑）：`--dragtest` 新增，**0 失败**（拖行距离 0.62 / 尸体跟着走 /
  视图读 bodyPos / 濒死者 pos 跟随 / 会议强制松手 / 单点抢修 ≤3，实测 engine=3 power=1）；
  反向对照：把 `_pos3_floor` 改回旧实现 → `DRAGTEST FAIL ③`，证明断言不是恒真。
  `--aittest` 3 夜 **prog 10→26 / tasks 12→26**（人类不再全挤在故障点，任务真的做完了）；
  `--b6test` 6/0（跟随断言按 0.62 重写，实测 1.82 格 = nearestFree 就近落地）；
  `--simtest` 26/0、`--abilitytest` 0 失败、`--invtest` 0 失败、`--parityfixture` 0 失败；
  `check` 7/0、`baseline` 407、`guard` PASS、`3d:port:check` 0 错（X-BIND 行段末值 11924）、
  `parity` OK、`audit:parity:strict` 未映射 0 / 漂移 0。
- **上游同步**（并行改动落地后按 §0.1 复跑）：`baseline:sync`（3 个文件更新 / 407）
  → `export:all` → `build-map-v2` → `export:sim`；`js/game.js` 因 `NO_MG_ACT` 前移 1 行，
  `check-parity` 的 15 条 `SOURCE_LITERALS` 行号全部重登记（否则 3d:parity:check FAIL）。

## 2026-11-12 · 产物出仓：截图 / Godot 缓存 / qwen-lib 镜像

- **本批改动**：`3d/preview/screenshots`（85 MB）、`3d/docs/audit/player-study-20261112`
  （24 MB）、`3d/preview/.godot`（544 MB）、`assets/qwen-lib` 的 41 张 PNG（79 MB）
  移入素材层 `screenshots/`、`caches/`、`unreferenced/qwen-lib-baseline-mirror/`。
  `.godot` 用 junction 指向 `caches/godot-3d`，运行时照常读取；`assets/qwen-lib` 只留
  README 与素材库清单，`baseline` 重建为 **407**；`PLAYER_STUDY` 截图路径改指素材层。
- **读数变化**：`npm run check` **7/0**；`simtest` **26/0**；`navtest` **28/0**；
  `tasktest` **26/0**；`baseline:check` **407 OK**；`docs:check` PASS；T3 13 PASS / 0 WARN / 0 FAIL；
  Godot 无头冒烟 exit 0。
- **下一批立项依据**：`caches/godot-3d` 不得直接清；`unreferenced/` 永久删除需用户逐项确认。

## 2026-11-12 · 判定层缺口收口第三批：不变量断言层 / 机器人刀击 / 会议开场播报

- **本批改动**（全部按 2.5D 真源逐条搬，删掉两处调用处硬编码）：
  ① **SKInvariants 断言层**：新增 `sim/invariants.gd`，逐条移植 `js/engine/invariants.js`
  的 A1-A23 / G1-G4 / D1-D6 / M1-M6 / W1-W2（44 条），`sim.run_invariants(tag)` 记录
  `inv_checks / inv_fails / inv_last_tag`，`sim.sim_run` 对应真源 `SIM_RUN`（`--sim1000` 置真）；
  A24 / G5 / M7 / D7 因 3D 无对应结构（me 席位不固定 / 无 lit 表 / tally 为局部量 / 无全局 drag）
  在文件头逐条写明不适用。
  ② **机器人刀击**：`knife_bot` 补齐 `damageBot` 的袭击者 alive/downed/detained 守卫、
  刀击写 `redT=RED_BODY.dur`、`bots.face_point()` 让保安转向袭击者（影响下一次 `would_see`
  的 180° 扇形），贴身判据从自造的 2.0 改回真源 1.8；`hit_bot` 同步补守卫与转向；
  新增 `can_act("knife_bot")`；玩家出刀改走 `_nearest_knife_any()`（人+机器人同一次最近挑选，
  顺序照搬真源：先人后机器人、平手人优先），E 轮盘同源列出机器人目标。
  ③ **会议开场**：新增 `speech._opening_broadcast()` / `_opening_line()` / `_victim_info()`——
  报案人是 AI 时由他说 `open_body_dead/alive` 池的报案句（含「尸体被移动过」「已检查伤口」后缀）；
  报案人是玩家时改**系统播报**事实（不替玩家编台词）；无死亡走 `open_nobody(_night)`。
  `plan_first_accusation` 的硬编码句改为 `alien_open_accuse` 池，并补上 2.5D 的**附议者**
  （最多 `FIRST.maxAccusers-1` 个、优先已认出队友、听众嫌疑按 `extraWgt × extraWgtDecay^(k-1)`）。
  ④ 清理 `_try_sabotage` / `_try_disguise` / `_try_breaker_off` 三段死代码（效用表接管后无调用点）。
- **读数变化**（本次实跑）：`--invtest` 开局 **280 项 0 失败**、三夜 **845 项 0 失败**；
  反向对照 **A11=true / D2=true**（刀数 9、单向拖拽必须被抓到）；
  `--knifebottest` **0 项失败**（6 条拒绝守卫 + 命中副作用：HP-1 / 刀-1 / redT / 保安转向）；
  `--meetopentest` **0 项失败（open=1 echo=2 framed=3）**；
  `--simtest` **26/0**、`--bottest` **7/0**、`--b6test` **6/0**、`--tasktest` **26 点 0 失败**、
  `--parityfixture` **0 失败**、`--abilitytest` **0 失败**；
  `audit:parity:strict` **总 385 / 映射 210 / 未映射 0 / 守卫 0 / 写入 0 / 3D 独有 0 / 漂移 0**；
  `--aittest` 3 夜自跑 chat 121→136（开场播报与附议台词进流）。
- **下一批立项依据**：`port-manifest` 状态对齐（ported 13→21 / partial 23→15），剩余真差距
  收敛为 4 项：`S-LOOP` 逐相位对账未签、`D-PLATES` panel-breaker 图内化、`UI-REPLAY` 外部回放载入、
  `S-SABOTAGE` 故障视觉；其余 partial 为台账口径未收口，不再重复接机制。

## 2026-11-12 · 判定层缺口收口第二批：alienPlan 效用表接管（B.2 清零）

- **本批改动**：按「能搬尽搬、不改机制」的要求，把 `PORTING_PROTOCOL` 附录 B.2 剩余 3 项补齐，
  并把 `_decide` 的 if 顺序决策换成 2.5D 的效用表：
  ① 前置缺口 `SKTeam` 补进 `export-rules.cjs`（**4 → 5 模块 / 53 表**，五值
  `FIX_CREW_CAP / BOT_SEC_VALUE / BOT_MED_VALUE / BREAKER_VALUE / SABOTAGE_VALUE`），
  `rules_data` 加 `module_table()`（`t()` 只覆盖 SKSanity 子表）；
  ② `audienceHotRooms` → `audience_hot_rooms()`（3D 无 mem，用 `a.why[]` 的 `saw_agent` 同夜记录）；
  ③ `alienAudienceInfo` → `audience_info()`（n/weight/idle/sus/inf，含领袖与公开影响力加权）；
  ④ `disguiseOptions` → `disguise_options()`（5 候选 realFix / realRevive / breakerOn / fake / fakeTask，
  常客舱室优先 + `LENS.lr` 降序）；
  ⑤ `disguiseRiskParts` → `disguise_risk_parts()`；
  ⑥ `alienPlan` → `_plan()` **逐字移植**：`left=G.t/NIGHT`、`walk=dist/moveSpeed(a)`、
  拉闸 `BREAKER_VALUE*left - breakerOffTime*1.5 - walk`、破坏 `SABOTAGE_VALUE*left - walk - 1`
  （配电室未断电再 -4）、机器人 `BOT_*_VALUE*left - walk`、
  狩猎 `td<knifeReach?12:(td<5?9:2)`、伪装 `planValue*sc - walk`（门槛 `sc>=minScore && s>0`）、
  合闸小概率通道 `best<=max(chase,6)`；另补 `moveSpeed(a)` 三态与 `LENS.lr`；
  ⑦ `_decide` 删除四段 if 入口（破坏 / 伪装 / 拉闸 / 拆机器人），改由
  `_exec_plan(a, _plan(a, real_d))` 统一分派，`chase` 最高时 fallthrough 到出刀段。
  **未改任何数值**：常数只从 `rules.json` / `space.json` 读，直接索引不设默认值兜底，
  `best===scX` 用直接相等、不用容差。
- **读数变化**：`--simtest` **26/0**；`--aittest` 3 夜自跑
  **prog 27→12 / tasks 22→14 / sab 1→5 / kill 6→4 / meet 7→6 / chat 100→121**
  （效用表生效：`SABOTAGE_VALUE=8` 在夜初压过远距 chase，异形先牵制再收头，
  与 2.5D 注释「先破坏牵制、再收头」一致）；`check` **7/0**；
  `3d:parity:check` **PARITY OK（WARN 0，53 表 / 70 函数）**；
  `audit:parity:strict` **未映射 0 / 守卫 0 / 写入 0 / 3D 独有 0 / 漂移 0**；
  `--b6test` **6/0**、`--parityfixture` **0 失败**、`--abilitytest` **0 失败**。
- **下一批立项依据**：`PORTING_PROTOCOL` 附录 B.2 已清空；后续只做
  `port-manifest` 的 status 标签对齐（23 个 partial 中多项 note 已写「已接通」），
  以及 `_try_sabotage` / `_try_disguise` / `_try_breaker_off` 三个已不被调用的旧入口清理。

## 2026-11-12 · 判定层缺口收口第一批：findHideBody（顺手藏尸）

- **本批改动**：按 `PORTING_PROTOCOL §3` 逐行移植 `js/game.js:3108 findHideBody` →
  `sim/ai_alien.gd:find_hide_body`：3.2 格内 / `ai_can_see` / `draggedBy` 空值 `-1` /
  `ai_wants_loot` 跳过。并在 `_decide` 补齐「顺手藏别人尸体」分支：
  `!drag && _hideCD<=0 && _hides<2 && !recent_witness(25) && real_d>6`；
  `watchers_at 6.5` 排除队友后为空才动手；到达藏尸点后 `_hides+1`、`_hideCD=25`
  （@src `js/game.js:4102/4120`）；`tick` 补 `_hideCD` 递减。
  **盘查结论同步**：`rules.json#tables.SKSanity` **已导出** `DISGUISE`(21 键) / `CRED`(7 键)，
  B.2 原「未导出」注记为过期信息，已更正；`port-manifest` 里 RUSH/红身/击杀加速、
  构陷编排（`speech.gd:111` / `:381`）、报告额度（`sim_state.gd:286/1804/2124`）
  均经代码核实**早已接入**，属 `status` 标签滞后，另批对齐（不改代码）。
- **读数变化**：`--simtest` **26/0**；`--aittest` **3 夜自跑无崩**
  （prog 24/45、tasks 19、qual 8、supply 5、knife 6、kill 7、sab 1、meet 6、eject 3、chat 81）；
  `npm run check` **7/0**；`audit:parity:strict` 未映射 0（见本批复跑）；
  `PORTING_PROTOCOL` 附录 B.2 已知差距 **4 → 3**。
- **下一批立项依据**：`disguiseOptions`（补 realFix / realRevive / breakerOn 三种真善行）、
  `audienceHotRooms`（3D 无 `mem`，需用 `why` / per-night 记录补 `saw_agent` 同夜热度等价源）、
  `alienPlan` 细分打分（walk 估距 / `BOT_SEC_VALUE`，要动 `_decide` 评分结构，风险最高）。
  另：`port-manifest` 的 23 个 `partial` 需按 note 逐条核实后对齐标签。

## 2026-11-12 · 文档收敛后同步：四步数据链复跑（无漂移）

- **本批改动**：文档分类收缩（`docs/agent` 并入 `PORTING_PROTOCOL` 附录、`ART_*` 移入
  `3d/docs/art/`）完成后，按 `HANDOFF.md §0.1` 的**四步数据链**复跑上游同步：
  ① `npm run baseline:sync` —— **0 个文件更新 / 396 个内容相同跳过**，清单 **448**；
  ② `npm run export:all` —— 重导 `map / minigames / space / sim / lines / rules / version` 七个快照；
  ③ `node 3d/tools/build-map-v2.cjs` —— `cover 123 / decor 40 / rooms 10 / walls 110 /
  points 26 / pipes 8 / facility 6`，与 18:25 批次逐值一致（**幂等**）；
  ④ `npm run 3d:export:sim` —— `sim.json` 重建，指向新 `map_v2.json` 指纹。
  文档侧补登记上一批新增的 `--parityfixture`（四机制行为夹具回放）：
  写入 `3d/README.md` 命令表与 `HANDOFF §0.8` 自测数组，自测项数 **34 → 35**（§0 三处数字同步）。
- **读数变化**：`npm run check` **7 通过 / 0 失败**；`baseline:check` **OK 448**；
  `docs:check` PASS；`agent:contract` PASS；`guard` PASS；
  `3d:port:check` **0 错误 / 1 既有 legacy WARN**（`cover_refs.json` 缺 `schema_version`）；
  `3d:parity:check` **PARITY OK**（6 个 js 文件 / 48 张表 / 70 个纯函数指纹一致，
  70 函数 synced 63 / adapter 7 / pending 0）；
  `audit:parity:strict` **总函数 385 / 映射 203 / 自动 69 / 未映射 0 / 守卫 0 / 写入 0 /
  3D 独有 0 / 漂移 0**，`budget` 五项全 0；
  `--parityfixture` **0 项失败（4 机制）**；`--abilitytest` **0 项失败**；
  主仓 `t3:check` **PASS 13 / WARN 0 / FAIL 0**（C7b 已由上一批收口）。
- **下一批立项依据**：数据链当前无漂移，后续只在「改 `js/` 真源」或「改 `js/data/map.js`」时
  重跑四步链（`build-map-v2` 之后必须重跑 `export:sim`，顺序不得颠倒）；
  `layout-v2.json` 是否退出方案层仍需单独裁定（不得接回运行时）；
  `cover_refs.json` 的 `schema_version` 是唯一遗留 WARN，补字段即可清账。

## 2026-11-12 · T3 收口：C7b 运行字段对账 / decor 允许差异

- **本批改动**：按红线 11，`map_v2.json` 从 `js/data/map.js` 重导出，运行字段
  `cover 123 / points 26/26 / facility 6/6` 与 2.5D 真源逐值一致（2.5D/3D 文件 hash 相同）。
  `parity-map#allowed_differences` 登记 `decor` 40 件为 3D 墙面美术（不参与碰撞/LOS/交互）；
  `layout-v2.json` 明确为方案层美术留档，Godot 运行时不读取、不参与 T3 运行字段对账。
- **读数变化**：T3 **13 PASS / 0 WARN / 0 FAIL**；`check` **7/0**；`simtest` **26/0**；
  `navtest` **28/0**；`tasktest` **26/0**；`baseline` **448 OK**；`docs:check` PASS。
- **下一批立项依据**：`layout-v2` 是否退出方案层，需单独裁定；不得把方案层数据接回运行时。

## 2026-11-12 · 素材库二次分类同步（referenced / unreferenced）

- **本批改动**：2.5D 素材层拆为 `referenced/` 与 `unreferenced/` 两个库；3D 侧同步工具路径：
  `tools/blender-ship.py` 读 `referenced/...`，`3d/tools/gen-{hires,sdxl}-skins.py` 读
  `referenced/scene-v4-tex`，`3d/tools/gen-art-refs.ps1` 写入 `unreferenced/qwen21/3d`；
  `baseline:sync` 拉入 4 个镜像文件，基线仍 448。
- **读数变化**：`npm run check` **7/0**；`3d:floor:check` **11 项**；`baseline:check` **448 OK**；
  `docs:check` PASS；`agent:contract` PASS（`6df0f075a21422b9`）。
- **下一批立项依据**：素材层后续只允许 `referenced/` 参与构建；`unreferenced/` 清理需用户逐项确认。
- **引用复核（2026-11-12）**：`--devicetest` / `--mgtest 14/14` / `--audiotest` /
  `--tasktest 26/0` / `--simtest 26/0` 全部 exit 0，无缺失资源报错；
  逐路径反查确认旧 `textures/panel/*` 与 6 张根图无运行时读取，`panels.json` 已全部指向 `qwen/<room>/panel-*`。
  复核发现 `panel-breaker.png` / `panel-task.png` **本就不存在**（`device.gd` 用 `ResourceLoader.exists` 回退，
  `port-manifest` 已登记 lever 图内化未做），不是本轮清理引入；`cabin/<room>` 缺失属未启用的 qwen 全覆盖回退分支。

## 2026-11-12 · 贴图出仓：参考图 + 零引用运行贴图移入素材层

- **本批改动**：`docs/qwen21/`（83 文件 / 104 MB）移入素材层 `returnlog_assets/qwen21/3d/`；
  3D 运行贴图中**脚本 / 场景 / 数据零引用**的 6 张根图（`ao-soft` / `cafeteria-top` /
  `fabric-weave` / `facility-panel` / `hazard-stripe` / `warehouse-rack`）与旧 `panel/` 目录
  （共 64 文件含 `.import`）移入 `returnlog_assets/textures/3d-unreferenced/`。
  **被引用的 131 张运行贴图保持原位**（qwen / cover / cabin / 根图；含 `door-panel` 与
  `ceiling-deck-normal/rough` 等动态加载项）。`gen-art-refs.ps1` 的留档目标同步改到素材层。
  同批 `baseline:sync` 拉入 2.5D 素材层路径改动（`tools/blender-ship.py` 等 6 个文件），基线仍 448。
- **读数变化**：`npm run check` **7/0**；`3d:floor:check` **11 项**；`baseline:check` **448 OK**；
  `docs:check` PASS；`agent:contract` PASS（`6df0f075a21422b9`）；无头冒烟 exit 0；
  `--simtest` **26/0**。
- **下一批立项依据**：2.5D `3d/spec/*` 过期副本与 `3d/preview/assets/{audio,plates,crew}` 剩余预览件；
  素材层逐文件 SHA256 见 `returnlog_assets/asset-layer-manifest.tsv`。

## 2026-11-12 · 文档分类收缩：合并 docs/agent 与历史专题

- **本批改动**：`applicability-3d` + `PARITY_DECISIONS` 并入 `3d/PORTING_PROTOCOL.md` 附录 A/B；
  `PORT-DIFF-AUDIT` §J 的 `buildMeetCtx` 字段映射并入附录 C 后归档；`process-3d` 并入
  `3d/HANDOFF.md` §0.10；`directory-roles` 并入 `3d/ARCHITECTURE.md` 附录；`commands-3d` 删除
  （命令以 `package.json` + `3d/README.md` 为准）；`REDLINES` 移到 `docs/REDLINES.md`；
  `SPLIT.md`、`3d/docs/README.md`、`docs/ASSET_LAYERS.md` 归档（层级表已进 2.5D 治理附录 B）。
  `3d/tools/sync-docs.cjs` 改为只生成 `docs/REDLINES.md` + `docs/ASSET_GOVERNANCE.md`；
  `baseline:sync` 拉入 2.5D 工具路径修复，基线 **448 文件**。
- **读数变化**：`npm run check` **7/0**；`baseline:check` **448 OK**；`docs:check` PASS；
  `agent:contract` PASS（`6df0f075a21422b9`）；`--simtest` 26/0（上一批）。
- **下一批立项依据**：`gameplay-parity` budget 五项全 0；剩余工作集中在美术验收与
  `PLAYER_STUDY_20261112.md` 记录的现场问题，不再新增文档分类。

## 2026-11-12 · 四个非排除项机制逐函数移植（budget 4 → 0）

- **本批改动**：按 `PORTING_PROTOCOL.md` §2/§3/§6 与红线 11（2.5D 是规则唯一真源），
  把 `audit:parity:strict` 里最后 4 个 `pending` 机制逐函数搬进 3D，全部带 `@src`：
  ① `sabTick`（`js/game.js:1297`）→ `sim/sim_state.gd:sab_tick`，6 条复合守卫、
  `sabRoomOk` 清目标、同房间或 `< SAB_RANGE` 命中；输入层按 §2 允许差异做适配，
  `player_sabotage` 保留交互即结算，未抵达时记 `sab_target` 交逐帧引爆，
  `sabUsed` 仍由 `sabotage_room` 在真正下手时写（`:1154`）；
  ② `recordFrame`（`:1410`）→ `record_frame`，`{pt,n,p}` / 0.5s 节流（`FRAME_DT`）/ `FRAME_CAP` /
  死者过滤 / flags 位，`playT` 由 `elapsed` 承担（会议期间冻结）；
  ③ `replayData`（`:1426`）→ `replay_data`，8 字段包，`game` 取 `version.json#base.version`、
  `winPts` 取 `sim.json#win.pts`，均不写死；
  ④ `envNotice`（`:1848` + `js/t2/ai.js:325-338` evPush）→ `env_notice`，
  3D 无 `a.mind` 对象，等价容器为 `agent.ev_mem`（`MEM_MAX=64`），
  `alert += conf*0.35` / `noise={x,y,t,kind}` 副作用照搬，三个调用点
  `damageRoom → fault(0.55)` / `sabotageBot → robot(0.5)` / `pullBreaker → lights(0.85/0.45)` 已接线。
  配套照真源补：`_log` 的 `EV_CAP=8000`（`:1407`）、`dawn` 清目标（`:4509`）、
  `new_game` 采首帧（`:294`）、`tick` 每帧采帧 + 引爆（`:2218-2225`）。
  新增 `3d/tools/export-parity-fixtures.cjs`（复用主仓 playwright-core + 本机 Edge，
  由 2.5D `SKV3._t` **运行时导出**夹具）→ `3d/spec/fixtures/parity-mechanisms.json`；
  新增 `--parityfixture` 无头回放，按 §3.1 比对输出集合 / 顺序 / 过滤条件。
  `gameplay-parity.json` 四条登记为 `ported`×2 / `adapter`×2 并写清拆分点，
  `budget` 经 `--update-baseline` 收紧为全 0。
  **口径**：本批是红线 11 的真源逐函数移植，不是自研技术方案或参数调参；
  依据为 2.5D 真源原文、`PORTING_PROTOCOL`、`acceptance.md`，实现手段仅为 GDScript 语法转换；
  **未下载、未采用任何公开素材文件**。
- **读数变化**：`--parityfixture` **OK 0 项失败（4 机制）**（① replayData 8 字段/顺序、
  ② recordFrame `{pt,n,p}` 15 人×4 元、③ envNotice 合格 12 / 过滤 3 / `alert +0.1925`、
  ④ sabTick dmg 0→1 / sabUsed / 清目标）；
  `audit:parity:strict` **总函数 385 / 映射 199→203 / 自动 69 / 未映射 4→0 /
  守卫 0 / 写入 0 / 3D 独有 0 / 漂移 0**，`budget.pending` **4→0**（五项全 0）；
  `npm run check` **7 通过 / 0 失败**；`baseline:check` **OK 448**；
  `docs:check` / `agent:contract` / `guard` PASS；`3d:port:check` 0 错误 / 1 既有 legacy WARN；
  `3d:parity:check` **70 函数 synced 63 / adapter 7 / pending 0**；
  回归 `--abilitytest` 0 失败、`--b6test` 6/0、`--tasktest` 26 点 0 失败；
  主仓 `t3:check` **PASS 10 / WARN 3 / FAIL 0**（与上批持平，本批未改主仓文件）。
  真源夹具实测读数：`sabTick` power 舱 dmg 0→1 / `sabUsed=true`、
  `env_fault` 15/15 全船广播 / `alert 0→0.1925`、`replay.game=返航录V3.7` / `winPts=45`。
- **下一批立项依据**：`budget` 已清零，后续新机制必须随移植同步登记 + 夹具，不许再攒 pending。
  仍待办：`agent.ev_mem` 的 AI 推理消费点（2.5D `hypothesisEvidence` 读带坐标实证，
  3D 目前只写不读）、复盘页接 `replay_data()` 的导出按钮（表现层，属允许差异）、
  鬼魂 / 医疗无人机链按 §3.1 逐项补 `@src` + 行为夹具；
  C7b `map_v2` / C5 历史读数仍属 §8 存量债，待用户裁定。
  合并提醒：本批与并行未提交改动有交集（`3d/README.md`、`check-gameplay-parity.cjs`、
  `docs/agent/PARITY_DECISIONS.md`、`3d/CHANGELOG.md`），提交前请分别核对。

## 2026-11-12 · 上游同步映射（baseline:sync → export:all → 全链门禁）

- **本批改动**：按 `PORTING_PROTOCOL.md` §3/§6、`HANDOFF.md` §0.1 与 `PORTING_CONTRACT.md` §1
  执行同步映射。先通读 14:13–14:19 收敛版全部规范，再动手：
  ① `npm run baseline:sync` 把上游只读基线同步进本仓（**6 个文件更新 / 436 个相同**，
  清单 `446 → 448`）；② `npm run export:all` 重导 `rules / space / sim / lines / version`
  五个 `3d/preview/data` 快照；③ `npm run docs:check` 校验共享规范镜像（14:13 已由
  `docs:sync` 生成，PASS，未重复覆盖）；④ 按 `PORTING_PROTOCOL §6` 复核映射：
  `audit:parity:strict` 与 `gameplay-parity.json#budget` 持平，未新增规则函数，
  **不新增映射条目、不跑 `--update-baseline`**。
  **未动** `map_v2.json` / `layout-v2.json`（主仓 T3 C7b 属 §8 已登记存量债 M2，需用户裁定）；
  两仓 `3d/spec` 与部分 data 的差异是 `SPLIT.md` 设计的「主仓 3d/ 冻结副本」，不是漂移，未强行对齐。
- **读数变化**：`npm run check` **7 通过 / 0 失败**；`baseline:check` **OK 448**；
  `docs:check` PASS；`agent:contract` PASS；`guard` PASS；
  `3d:port:check` **0 错误 / 1 既有 legacy WARN**（`cover_refs.json` 缺 schema_version），
  X-BIND 行段无漂移；`3d:parity:check` **PARITY OK**（70 函数 synced 63 / adapter 7 / pending 0）；
  `audit:parity:strict` **总函数 385 / 映射 199 / 自动 69 / 未映射 4 / 守卫 0 / 写入 0 /
  3D 独有 0 / 漂移 0**，与 budget 持平；主仓 `t3:check` **PASS 10 / WARN 3 / FAIL 0**。
- **下一批立项依据**：继续 `gameplay-parity.json#budget` 的 4 个 pending
  （`envNotice` / `sabTick` / `recordFrame` / `replayData`）与鬼魂 / 医疗无人机链路；
  每项须有 `@src` + 行为夹具（`PORTING_PROTOCOL §3.1`）。C7b / C5 存量债待用户裁定。

## 2026-11-12 · 文档收敛：唯一交接 + 悬空报告引用清理

- **本批改动**：`3d/docs/handoff/HANDOFF_2026-11-11.md` 的有效增量并入 `3d/HANDOFF.md` §0.9 后移入隔离区
  （先备份，未永久删除）；过期快照 `3d/docs/audit/REDLINE-AUDIT.md` 同时隔离（其「红线 11 未全过 / 23 partial」
  结论已被后续批次推翻），缺口口径改指 `HANDOFF.md` §0.4 与 `spec/gameplay-parity.json#budget`；
  迁移施工单 `3d/docs/migration/MIGRATION.md` 隔离（§9 / §10.5 为失效平衡读数；边界与批次已由
  红线 11 / `PORTING_PROTOCOL` / CHANGELOG 取代）；HANDOFF §0.7 改为读数指针（交接文档不再复制读数），
  §0.8 去掉硬编码旧读数；`3d/README` §6/§7 的旧胜率与「25 pending / SDXL 下一批」同步收回指针；
  `main.gd` sim1000 报告串去掉写死的 49.9/50.1，`speech.gd` / `simdump.cjs` 注释去掉 MIGRATION 悬空引用；
  `3d/README` / `3d/docs/README` / `docs/agent/PARITY_DECISIONS` 的引用同步。修掉已清理报告的悬空引用：
  `MIGRATION` 的 `portability-audit` / `core-ui-audit` 改为「现跑生成、不入库」，`spec/conventions` 的
  POC 报告指针同步。`docs:sync` 重新生成 `REDLINES` / `ASSET_GOVERNANCE` / `ASSET_LAYERS`。
- **读数变化**：`npm run check` **7/0**；`baseline:check` **446 OK**；`docs:check` PASS；
  `agent:contract` PASS（`6df0f075a21422b9`）；`--simtest` **26/0**；无头冒烟 exit 0。
- **下一批立项依据**：继续 4 个 pending（`envNotice` / `sabTick` / `recordFrame` / `replayData`）与
  鬼魂 / 医疗无人机链路；文档只保留 `HANDOFF` 单一交接，新的批次增量写入当月台账。

## 2026-11-12 · 报告清理（T3 保留，报告删除）

- **本批改动**：删除 19 件报告/审计（`3d/preview/reports/` 5、`3d/reports/` 10 份生成报告、
  `AUDIT_CORE_MECHANICS*` 2、`资产耦合图谱_20261112.md`、`baseline-history-3d.md`），另清 2 件历史/退役件
  （`3d/docs/art/WORKFLOW_SDXL_BLENDER.md`、`3d/docs/plan/PLAN_INPUT_COMBAT_UI_20261111.md`），合计 **21 件**；
  先备份再移入仓外隔离区，未永久删除。`AGENTS` 分册索引、`3d/README`、`3d/ARCHITECTURE`、
  `PORT-DIFF-AUDIT` 的引用同步改为「报告已清理，需要时重跑生成」；主仓 `check-t3.cjs` C3b 改为历史分册
  已清理 PASS。共享规范改为自动生成：`docs:sync` 从 2.5D 生成 `REDLINES.md` / `ASSET_GOVERNANCE.md`，
  `docs:check` 已接入 CI；`ASSET_LAYERS` 只保留 3D 本地附录。
  回退上一轮重复：红线 11 的两句行为等价/唯一机制来源、`PORTING_PROTOCOL §2.1` 矩阵、
  `gameplay-parity#exclusion_rules` 已撤；行为夹具要求只保留在 `PORTING_PROTOCOL §3.1`。
- **读数变化**：`npm run check` **7/0**；`baseline:check` **446 OK**；`agent:contract` PASS（`06808672577fe06d`）；
  `docs:check` PASS；`guard` PASS；报告可按需重生成（`3d:audit:port` / `3d:audit:coreui` /
  `3d:poc:speech` / `audit:parity`）。
- **下一批立项依据**：继续 4 个 pending + 鬼魂 / 医疗无人机；共享治理只改 2.5D，3D 跑 `docs:sync`。

## 2026-11-12 · 红线行为等价 + 任务提示照搬（接 P1/P3）

- **本批改动**：① 红线 11 增两条硬约束：**行为等价**（3D 输出集合 / 顺序 / 提示文案 / 过滤条件必须同
  2.5D；禁止新增提示、过滤、默认值、兜底文案；`adapter` 必须有 `@src` + 行为夹具）与**唯一机制来源**
  （2.5D `js/` 唯一；3D `docs/` / GDScript 不得另立第二份规则）。两仓 AGENTS + REDLINES 同步，
  契约哈希 `935f2f9741432e44`。
  ② `main.gd:_collect_offers` 照抄 2.5D `collectInteractions`：先求 `nearest_task_dev`，正常玩法只保留
  最近且 `sim.can_do_task()` 为真的任务点；非自己任务不再生成「查看（不是你的任务）」offer；
  `_sim_gate=false` 仅 devicetest / e2e / tasktest 全开。`--tasktest` 新增过滤回归。
  ③ 排除项审计：`sabTick` / `recordFrame` / `replayData` / `envNotice` 从 `not-applicable` 纠正为
  `pending`；`gameplay-parity.json` 加 `exclusion_rules`、`budget_note`，`budget.pending` 0→4；
  `PORTING_PROTOCOL` 加 §2.1 排除项矩阵、§3.1 行为夹具；`PARITY_DECISIONS` 加 §6 / §6.1。
- **读数变化**：`--tasktest` **26 点 / 0 失败**；`--devicetest` pass（27 设备 / 14 玩法）；
  `--interacttest` pass（电闸 / 圆桌 / 管道 / 轮盘）；`audit:parity --strict` **未映射 4 / 守卫 0 /
  写入 0 / 3D 独有 0 / 漂移 0**；`npm run check` **7/0**；`baseline:check` **446 OK**；
  `agent:contract` **PASS**（14 条 / `935f2f9741432e44`）；`guard` PASS。
- **下一批立项依据**：按红线 11 照搬剩余机制缺口：① 4 个 pending；② 鬼魂模式 + 医疗无人机救起；
  ③ AI 认知 / 社交 / 异形编排与会议白天链；④ 其余 partial。每项必须有 `@src` + 行为夹具；
  美术 / 输入 / 维度按 §2.1 排除，不混入。

## 2026-11-12 · P1 CI + P3 文档收敛（接 P0）

- **本批改动**：① 新增 `.github/workflows/check.yml`（push/PR master）：`npm run check` + `baseline:check` +
  `agent:contract` + `guard`。② 受控重导 `3d:export:rules` / `3d:export:space`（逐字段对比仅 `sources` / meta
  变化，规则值与常量未变），`3d:parity:check` FAIL → PASS、`audit:parity` 漂移 0、`npm run check` 6/1 → 7/0。
  ③ P3：`3d/` 根 md 18 → 8（4 核心 + 3 登记表 + 当月台账）；11 份专题件 `git mv` 到
  `3d/docs/{migration,handoff,audit,art,plan}/`（未删除），新增 `3d/docs/README.md`；
  `PARITY_REPORT.md` / `parity-report.csv` / `PARITY_SUGGEST.md` 移到 `3d/reports/` 并改生成器输出路径；
  CHANGELOG 切为 `3d/CHANGELOG.md`（索引）+ `3d/CHANGELOG-2026-11.md`。
  ④ 红线 11 落地检查路径改为 `3d/PORTING_PROTOCOL.md` §6；两仓 AGENTS + REDLINES 同步，契约哈希 `06808672577fe06d`。
- **读数变化**：`npm run check` **7 通过 / 0 失败**；`audit:parity` **漂移 0**；`baseline:check` **446 OK**；
  `agent:contract` **PASS**（14 条 / `06808672577fe06d`）；`guard` **PASS**（45.59 MB）；
  3D CI 已接入同样的只读门禁。
- **下一批立项依据**：待用户裁定 —— ① `map_v2` / `layout-v2` 重导消除 C7b；② GLB 去重；
  ③ Godot 无头自测聚合接入 CI。

## 2026-11-12 · P0 文档事实对齐（与 2.5D 同批）

- **本批改动**：同步 2.5D 的 P0 纠偏到 3D 文档与红线：`AGENTS.md` 删除 §六 断引用、红线 13 分支名改为
  「2.5D 仓 `3d`；独立仓 `returnlog-3d` 的 `master` 为镜像」；`docs/agent/REDLINES.md` 同步；
  `3d/README.md` 的「完整功能移植 / 7/0 / parity 0 WARN」改为指针 + 已知缺口，2.5D 版本 3.6.0 → 3.7.0，
  `v1-preview` → `3d`，掩体 59 → 123，`§五.8` → `docs/agent/process-3d.md` §8；
  `3d/HANDOFF.md` 的 7/0、77 个未提交、6 项门禁改为指针 / 7 项，§五.6/7/8 → `process-3d.md` §6/7/8；
  `3d/REDLINE-AUDIT.md` 加 2026-11-12 复核（当前 6/1、446 OK，红线 1–12 审查范围）；
  `docs/agent/commands-3d.md`、`applicability-3d.md` 的 §五.8/§六 断引用同步修正。
- **读数变化**：本批只改文档；`npm run check` **6 通过 / 1 失败**（`3d:parity:check`：
  `rules.json#sources` 与 `js/game.js` 漂移，待重导 `3d:export:rules`）；`baseline:check` **446 OK**
  （`js/data/map.js` 注释同步后 443 → 446，含新增只读工具 `tools/check-t3.cjs` / `publish-assets.*`）；
  `agent:contract` **PASS**（14 条 / `52beafb8ebff8a1f`）；`guard` **PASS**（45.59 MB）。
- **下一批立项依据**：待用户裁定 —— ① 重导 `rules.json` 与 `map_v2/layout-v2`，消除 parity FAIL 与 C7b；
  ② 把 `check-all` / `baseline:check` 接进 3D CI；③ `3d/assets/export` 与 `3d/preview/assets/models`
  的 GLB 去重（先审计引用）。

## 2026-11-11 · 玩家能力链路机制对齐（用户现场：按键合法但能力一点都没有）

- **根因**：3D 把 2.5D 的「无条件动作键」做成了「靠近才生成的上下文交互项」；
  `_update_interaction()` 在 `offers` 为空时直接 return，**专用键被静默吞掉**；
  管道 / 出刀 / 刀模型还各自读开始页 `role` 字符串，与 `sim.me().alien` 双源。
  旧自测只断言「offer 里有这个 id / 按钮合法」，从不验证按键下去 sim 状态是否写回 —— 验收盲区。
- **能力恒入口**：`_update_interaction()` 每帧更新全部键沿；专用键按下时若无对应 offer，
  走 `_fallback_action()` 直达模拟层，由 `sim.can_act()` 返回精确失败原因（不再静默）。
  新增 `sim.can_act(kind, ctx)` 只读判定单一真源（@src 见函数注释），玩家出刀/开枪与 AI 出刀都调它。
- **双源清零**：管道 offer、`_use_pipe()`、`_player_knife()`、`_tick_knife_view()` 全部改读
  `sim.me().alien`；`--b4test` / `--interacttest` 夹具同步改为按真源设置。
- **输入层**：`project.godot` 声明 8 个 InputMap action，代码只读 action（`ACTION_BINDINGS`）；
  ESC 收口成 `_close_topmost()` 单一出口，永不退出/重开；新增 `--inputlog` 埋点；
  轮盘改屏幕中心环形 8 扇区 + 常显提示（旧版竖排且一半按钮在屏外）。
- **DEV 透视**：新增 `EspCanvas`（F2，方框+名牌+穿墙可见+>25m 不画+异形红/人类青/濒死橙/尸体灰），
  右侧文字总览改 F3 默认隐藏；DEV/旁观时会议投票行显示 `[异形]/[人类]`、尸体卡显示凶手。
- **卡墙根因 2**：`player.gd` 接同一份 `nav`，`safe_margin=0.04` 补贴墙滑移；
  物理把人推进网格不可走区时钳回，想走却 0.3s 没动时走 `nav.nearest_free`。
- **验收**：新增 `--abilitytest`（真实 InputEvent 逐键验证拖拽/放下/出刀/管道/破坏/空场景反馈/
  InputMap/卡墙兜底），8 项全绿；`npm run check` 7/0、四项只读门禁全 PASS；
  16 项无头自测除 `--meetuitest`（需真实窗口，窗口下 23/0）外全 0 失败。
- **裁决**：不新增 `friendly_fire_*` 配置（2.5D 无此规则，红线 11/14）；
  PARITY_DECISIONS §3 的 AI 决策细项与复盘帧受上游常量未导出阻塞，逐条登记在 §5。

## 2026-11-11 · 人物重做（第三版）+ 门 v2 + 贴图统一 768²

- **人物**：用户否决第二版（1,740 tris，球体贴照片脸，近看“伪人”+方块拼接）后重做
  `char_crew_lowpoly`：躯干/四肢改为截面放样，肩/肘/膝/髋用球体过渡；头是 20 段放样头型，
  发盖/刘海为独立几何；8,544 tris / 6 材质 / 17 骨 / idle+walk+knife+down。
  身体一张 **768² UV 图集**（分区唯一真源 `3d/tools/crew_atlas.py`），脸与头发各 768²；
  `crew_view._tint_model()` 改为只给 `crew_suit` 乘席位色，不再替换贴图或改 `uv1_scale`。
  脚本：`build-crew-rigged-v2.py` + `build-crew-textures-v2.py` + `gen-qwen-crew-face-v2.ps1`
  （千问本地 img2img，参考图正面头，seed 20261160）。
- **门**：`build-door-v2.py` 重建门框/门扇：贯穿墙厚的门洞内衬、双面止口、门楣实体、
  顶部滑轨/端挡、门槛导向槽；门扇为核心板 + 双面凹槽 2.5D 门板 + 周边压框 + 吊挂滚轮。
  关闭合拢、打开让出整段门洞（`--doorshot` 验证），碰撞/扫描/音效契约不变。
- **分辨率**：人物、门框、门板、保安机器人、天花板运行时贴图统一 **768×768**；
  门板派生图改为 768² 画布中央 384×768；千问 512 原图只作源图保留。
- **验证**：`3d:assets` PASS（0 错误 / 3 既有提醒，合计 700,818 tris）；
  `3d:import:check` 0 差异；`baseline:check` OK 443；`audit:parity:strict` 全 0；
  `--crewshot` / `--doorshot` 实跑；近景 `crew-face-check.png` / `crew-body-check.png` /
  `crew-full-check.png`、门 `door-closed.png` / `door-open.png` 已更新。
- **编译修正**：`main.gd` 8 处 `:=` 改为显式类型（`d/r/q/b/chk` 为 `Dictionary`，`dev/brk/bd`
  去掉推断），不改变任何玩法语义；`--crewshot`/`--doorshot` 通过。
- **备注**：根目录 `返航录3D_演示_68s.mp4` 仍是重做前的实机录制；新一轮演示片待重录。
  旧 512² 平铺贴图/法线仍在磁盘上作历史对照，当前 glb 与运行时只引用 768² 图集。

## 2026-11-11 · 船员贴图上身（脸 + 身体法线）

- 重建 `char_crew_lowpoly`：1,740 tris / 5 材质 / 10 贴图 / 3.5 MB；17 形变骨 + idle/walk/knife/down 不变。
- 头部：去掉眼球/鼻子/耳朵方块；头球正面做等距圆柱脸 UV；千问正面中性脸（seed 20261141）+ 短发材质（seed 20261150），发际线 V≈0.70。
- 身体：四槽改为 512² 千问贴图 + 亮度派生法线（`3d/assets/textures/crew/*_normal.png`，glb 内嵌）；`crew_view` 继续覆盖运行时 albedo 并按席位 tint，但保留 glb 法线；`crew_face` 不参与 tint。
- 脚本：`3d/tools/build-crew-textures.py`、`gen-qwen-crew-face.ps1`；`--crewshot`、`crew-face-check.png`、`crew-body-check.png` 已验收。
- 欠账：身体完整 UV 展开 + 2048² 单图集仍未做；当前是头部脸 UV + 身体 512 平铺贴图。

## 2026-11-11 · 3D 演示片（68 秒 · 实机录制）

- 新增 `3d/preview/scripts/demo_reel.gd` + `demo_director.gd`：加载真实 `main.tscn`，跳过开局公开讨论，按时间线接管玩家相机；HUD/自动门/保安巡逻/灯光仍由真实 sim 驱动。
- `main.gd::_has_screenshot_arg` 增加 `--reel`：复用截图模式（不捕获鼠标、玩家输入锁定），避免录制时抢系统光标。
- 演示片停掉 AI 决策（`sim.ai_enabled=false`），只避免随机凶杀/夜会挡镜头；正式对局 AI 不受影响。
- 录制：Godot Movie Maker 1280×720@30fps，2054 帧 / 68.47s；ffmpeg 转 H.264/AAC，游戏原声 +8dB，淡入淡出。
- 产物：项目根目录 `返航录3D_演示_68s.mp4`（约 54 MB）。分镜：桥厅 → 工业天花板 → 自动门/走廊 → 双足保安机器人 → HUD/任务 → 收尾。

## 2026-11-11 · 机制同步批 3（严格函数映射：2.5D 为唯一规则真源）

- **映射清零**：`spec/gameplay-parity.json` 385 条全部落位（映射 199 / 自动 69 / 未映射 **0**），`audit:parity:strict` 预算收紧到全 0 并 PASS。裁决记录见 `docs/agent/PARITY_DECISIONS.md`；建议器 `3d/tools/suggest-parity-map.cjs` 与补丁器 `3d/tools/apply-parity-map.cjs` 入库（补丁器校验目标函数必须真实存在）。
- **门是模拟层状态**（js/game.js:448/484/495 逐行）：`sim_state.door_tick / door_blocked_segment / los_now`。此前关着的门不挡人、不挡视线/枪线；`scene_extras.door_update` 的第二套开合计算删除，改为 `sync_doors` 单向读 sim（key=舱室|边|坐标 对齐）。POWERTEST 门段改驱动 `sim.door_tick`：未扫满拦人+挡 LOS ✓ / 扫满放行+LOS 通 ✓ / 离开重新上锁 ✓。
- **听觉链**（js/game.js:1827 aiHear + 13 处调用点逐行）：新增 `sim_state.hear()`（conf=距离衰减×隔墙 0.72，最低 0.12；EV_W 权重×conf 进 sus）。接通：door 7 / power 30 / pipe 12 / sabotage 20 / drag 8（每 1.6s）/ knife 14 / scream 16 / alarm 22 / detain 26/18 / robot 18 / robot_down 18 / shot 20（在射手位置）。此前 3D 听见出刀/拉闸/钻管道不留任何证据。
- **LOS 收口**：shoot / knife(玩家 stab) / ai_can_see / mind MISID 池 / bots 视野判定全部改走 `los_now`（墙+掩体+门）；bots 的 secbotWouldSee 保持 los_walls（2.5D 同源）。
- **死亡不是出局**（js/game.js:2371 aiGhost 逐行）：`_ghost_tick`——异形幽灵全局一次正统破坏（`sabotage_room(ghost)`：故障/警报/统计照常、不写目击、仍计 sabUsed）+2.4 游荡；人类幽灵 6.5 额度内继续做任务（站桩 dur×1.6），做完 2.4 巡舱。幽灵寻路失败带 1.2s 冷却（2.5D walkTo 同规则）。
- **报告链按真源重写**（js/game.js:2524/2591/2621/2144 逐行）：`scan_bodies`（0.5s 扫 5.4 格→observeBody→搜查/翻尸→canReportBody→延迟拉铃）+ `alien_report_worth`（MISLEAD 效用表全读 rules.json + _stallBias）+ `ai_wants_loot`（弹/医疗包/申请单三动机）。**删除此前 3D 自造的 35%/20% 报告概率**；人类 AI 也接同一条链（此前完全没有）。
- **拆保安的围攻前置**（js/game.js:8365 逐行）：`secbot_raid_ok`（≥2 名 8 格内队友 + 共同目标 ≤7 格 + 0.45 掷骰）接入 ai_alien 机器人候选（保安过围攻门、医疗机照常、td>5 才候选、<1.8 用刀）。
- **救队友**（js/game.js:3590 逐行）：`alienMateRevive` 进 _decide。
- **移动健壮性**（js/game.js:828 逐行）：门挡住就停步、围墙兜底、0.7s 卡死从最近可走点重寻路（此前只有 ai_human 有 _stuck，被门/拐角卡死的 AI 会原地踏步）。
- **杂项对齐**：dead-guard 识别入审阅器（G.noReport 全仓无写入=死代码，不迁）；`_cast_ai_votes` 受 ai_enabled 门禁；移除自造 `_log("door")`（2.5D 无此事件），events.schema 补 `invariant`，`3d:events:check` OK；b4/b6 会议测试改为显式投票构造（ai_enabled=false 语义收紧后的确定性断言）。
- **验证**：B4 8/0、SIM 26/0、NAV 28/0、BOT 7/0、ROLE 4/0、B6 6/0、SPEECH 17/0、MEETING ok、POWERTEST 全项、INTERACT 全项；`agent:contract` PASS、`baseline:check` OK 443、`audit:parity:strict` PASS（全 0）、`3d:events:check` OK。批量模拟 2 局冒烟：会议 11.5 场/局（2.5D 9.64）、刀 5.0/局、超时 1/2 —— 节奏显著靠近 2.5D，等待千局分片基线复核。

## 2026-11-11 · 美术方向首批落地（门 / 双足保安机器人 / 工业天花板）

- **门**：新增 `door_frame.glb`（496 tris / 37 KB）、`door_leaf_l/r.glb`（各 44 tris / 约 706 KB）。门板直接采样 2.5D `door-panel.png`，派生 albedo/normal/rough/emissive（512×1024）；`scene_extras._build_doors()` 优先实例化，缺 glb 回退旧 BoxMesh；开合/碰撞/扫描/音效契约不变。
- **保安机器人**：新增 `secbot.glb`（3,776 tris / 542 KB / 0.592 × 0.45 × 1.25 m / 5 材质 / idle+walk）。按 2.5D `secbot.png` 做双足人形；`scene_extras._robot()` 优先加载，`secbot_view.gd` 按真实位移切 idle/walk；缺 glb 回退旧盒子。
- **工业天花板**：新增 `ceiling_beam/pipe/tray.glb`（36/52/36 tris），连续长件沿房间长轴缩放；bridge 42×16 约 572 tris/舱（≤1.8k）。`map_builder` 顶板改用 `ceiling-deck` 材质（512² + normal + rough），新增 `_add_ceiling_kit()`；`set_ceiling_visible()` / `set_power` 不变。
- **材质**：本地千问生成 6 张平铺材质（seeds 20261132–20261137）；`secbot-paint` 首版因 prompt 含 “robot” 出成机器人，已去词重跑。Qwen Research License 非商用。
- **文档**：`ART_DIRECTION.md` §10 落地清单；`ASSETS.md` 新增「2026-11-11 · 美术方向四件套」；manifest 新增 7 项 status=done。
- **验证**：`3d:assets` 0 错误 / 3 既有提醒；`3d:import:check` 0 差异；`baseline:check` OK 443；三份脚本 `--check-only` 通过；截图 `artcheck-*.png` 与真实舱 `artcheck-room-*.png`。
- **后续**：并行代理收尾后全项目编译已恢复；演示片 `返航录3D_演示_68s.mp4` 已实机录制。

## 2026-11-11 · 美术方向四条裁定（专属文档）

- 新增 `3d/ART_DIRECTION.md`：门 = **3D 滑门结构 + 2.5D 门板材质**；天花板 = **工业材质**；保安机器人 = **双足**（按 2.5D `secbot.png` 人形，旧盒子只是包络）；人物 = **风格化写实**。
- `ART_HANDOFF.md` 同步：§13 由“待拍板”改为“已拍板”；§3 阅读清单加入新文档；§8 补保安机器人 2.5D 造型真源；§9 P0-A/B/C 锁定裁定，P0-B 废止“履带或双足”“胸前编号牌”旧表述。
- 只改文档：未动 `3d/preview/assets/**`、`3d/assets/**`、`js/`、`assets/`、`audio/`、`tools/`、`index.html`；未跑资产构建。

## 2026-11-11 · 机制同步批 2（审阅驱动）

- **补齐停摆机器人**：2.5D `sabotageBot()` 在 3D 没有入口。新增 `sim.sabotage_bot()` + B 键交互项「停摆 · 保安/医疗」：活着的异形、1.8 格、每夜一次、不耗刀弹；`sabUsed` 记账、目击 `saw_bot`、18 格噪声、保安记案。
- **`kill()` 统一走 `die()`**：之前门禁用的 `kill()` 是第二条死亡路径，漏 `ghost=true`、`bodyPos/deathRoom`、拖拽解除与状态清理。现在委托 `die()`，2.5D 只有一条死亡入口。
- **`revive()` 清 `searched`**：对齐 2.5D 的 medbotTick / finishDoing(revive)。
- **监控守卫**：`_open_cams()` 补 `over / meeting` 守卫（2.5D openCams 同款）。
- **审阅器升级**：`adapter` 的拆分缺口不再计入预算；2.5D DOM/Canvas 函数自动标 `not-applicable`；`!arr.length` 与 `is_empty()` 视为等价；`not-applicable` 条目不再走自动同名匹配。
- **映射进度**：385 个 2.5D 函数 → 96 显式 + 67 自动，**守卫缺口 0 / 写入缺口 0 / 3D 独有 0 / 真源漂移 0**；`budget` 收紧到 `pending 133`。剩余 pending 多为工具/UI/模板句。
- **两个真缺口已登记，未实现**：① `doorBlockedSegment` —— 3D `nav.los` 不含门，关闭的门不挡视线/枪线；② `secbotRaidOk` —— 3D 没有「2+ 异形围攻保安」协同判定。
- **验证**：`B4TEST 8/0`、`INTERACT` 全项、`KNIFETEST OK`、`MEETINGTEST ok=true`、`baseline:check OK 443`、`guard PASS`、`audit:parity:strict PASS`。

## 2026-11-11 · 核心机制对齐批 + 自动化审阅

- **濒死口径改成 2.5D**：删掉 3D 自造的 `downedT=12` 失血计时与 tick 里的 `die()`；濒死持续到天亮，`dawn()` 统一判 `bled`。第二刀不再直接致死（2.5D `knife()` 对已倒地目标直接 return）。
- **死亡转幽灵**：`die()` 设 `ghost=true`，玩家穿墙 / 全视 / 可做剩余任务（额度 `space.json#move.ghost_task_cap`，由 `SKT2Space.GHOST_TASK_CAP` 导出）；不再弹「你已阵亡」全屏面板；`R` 只在对局结束时重开。
- **拖拽濒死者**：`_collect_offers` 允许拖 `alive && downed` 的伤员（2.5D `bodyPos` 口径），拖进医疗间由 `release_drag` 救起；放下提示区分伤员/尸体。
- **刀/枪目标选择改回 2.5D**：`stab()` / `shoot()` 都是「最近 + LOS（枪再加 visibleAt）」，删掉 3D 自加的相机准星锥（0.55 / 0.90）。这是「贴脸刀不到/打不中」的根因。
- **状态清理补齐**：枪击清 `searched`；`die()` 清 `searched/detained/redT/stunT` 并双向解除拖拽；`sabotage_room` 自己记 `sabUsed`（2.5D `damageRoom`）；`dawn()` 清 `draggedBy`；`search_body` 增加 over/会议守卫。
- **交互键拆分**：`E` 通用兜底、`F` 任务/设施、`R` 报告、`G` 拖拽、`Q` 管道、`V` 电闸、`B` 破坏、`C` 监控，`1-9` 直选；HUD 按项显示对应键。
- **自动化审阅（新增）**：`3d/tools/check-gameplay-parity.cjs` + `spec/gameplay-parity.json` + `npm run audit:parity(:strict)`；扫 385 个 2.5D 函数，检查映射、守卫、状态写入、3D 独有逻辑、数值真源漂移。首份报告：`3d/reports/parity-report.md`。
- **移植规程（新增）**：`3d/PORTING_PROTOCOL.md` + `3d/tools/gen-port-stubs.cjs`（2.5D 原文逐字桩）+ `3d/port/` 参照件；AGENTS §二 增加硬约束第 7 条「规则同源」。
- **验证**：`B4TEST 8/0`、`INTERACT` 全项、`KNIFETEST OK`、`baseline:check OK 443`、`guard PASS`；审阅读数 26 显式 + 81 自动 / 278 pending / 12 守卫缺口 / 6 写入缺口 / 9 个 3D 独有。

## 2026-11-11 · 核心机制修复批（P0×2 + P1×3 + P3×2）

- **暗房（P0）**：`LIT_AMBIENT 0.55→0.30`、`_fill 0.28→0.06`、`_ceil_fill 0.16→0.04`；`main._tick_darkness()` 按 `light_state` + 房间 `light` 给暗房叠 62% 径向遮罩（中心保留手电视野），DEV/旁观不遮。断言 `DARK_TEST power_lit=false bridge_lit=true PASS`。
- **HUD 播报收口（P0）**：删掉任务完成 / 驱逐 / 补给三类播报，只留开会 / 故障 / 修复。断言 `FEED_TEST leak=false PASS`。
- **人类 AI 追猎（P1）**：`ai_human._chase_target()`，按 `SHOT.chaseKnown(14) / chaseSus(10)` 在枪程外主动靠近；与异形同一口径。
- **路径平滑（P1）**：`grid_nav.path()` 加 string-pulling（2.5D `smoothPath`），相邻路点保证 LOS。断言 `PATH_TEST blocked_segments=0 PASS`。
- **故障点视觉（P1）**：`main._tick_fault_marks()` 在世界里给 `sim.dmg` 挂「⚠ 故障」标牌 + 红光，修复后自动消失。断言 `FAULT_TEST marks=1 / FAULT_CLEAR marks=0 PASS`。
- **DEV 不变量（P3）**：`sim._tick_invariants()` 每 2 秒检查人数 / 负刀 / 负弹 / 死人移动，只写 dev_log。
- **藏尸评分（P3）**：`ai_alien._hide_room(from_pos)` 改为按「离活人距离 − 拖尸超距扣分」评分，不再随机。
- 未动：小游戏 3 型（wire/sync/valve）、复盘页、图板坐标数据 —— 属 P2 内容层，另批处理。

## 2026-11-11 · 修 P0：白天会议回舱 + 异形互刀

- **白天会议回舱（`main.gd` 新增 `_sync_day_meeting_teleport()`）**：2.5D `dawn()`（`js/game.js:4513-4526`）先全员 `randIn(bridge)` 再 `openMeeting('day')`；3D 的 `sim.dawn()` 只改了 `agent.pos`，玩家相机从未搬过，会议结束 `_sync_player_pos` 还会反写回原地 → 玩家实际没回会议室。现按 `sim.meet_seq` 监听白天会议开场，把相机搬到 `sim.me().pos` 并朝向会议室中心。断言：从 (8,8) → (31,33.5)，`kind=day`，PASS。
- **异形互刀（`sim_state.knife()`）**：2.5D `knife()`（`js/game.js:4226`）只判「有刀 / 目标存活且未倒地」，**没有阵营限制**；3D 多写的 `or v.alien` 是移植时凭空加的规则，已删。断言：`KNIFE_ALIEN_TEST ok=true victim_downed=true killer_knife=0` → PASS。
- 同步更新 `AUDIT_CORE_MECHANICS_20261111.md` 的修复状态；`baseline:check` 仍 OK 443。

## 2026-11-11 · 材质改用千问本地模型（人物四槽 + 第一人称刀）

**用户口径**：不要 SDXL 出材质，人物与刀都用千问本地模型出图。

- **出图管线**：新增 `3d/tools/gen-qwen-materials.ps1`（sdcpp Vulkan + Qwen-Image 2.1 Turbo Q4_K_M + Qwen3-VL-8B，8 步 / CFG 1.0，512² 单张约 47 s）；新增 `3d/tools/crop-materials.gd`（取中心 70~78% 去白边/光照渐变，缩到 384²）。
- **产物**：`crew-fabric` / `crew-webbing` / `crew-leather` / `crew-skin` → `preview/assets/models/crew_tex/`；`knife-blade` / `knife-grip` → `preview/assets/weapons/`；原始图在 `3d/assets/renders/qwen-materials/`（已忽略）。
- **装配**：`crew_view.gd::_tint_model()` 从「纯色染色」改为「按材质名挂贴图 + tint 乘色」，缺图自动退回纯色；`player.gd::_build_knife_view()` 给刀身/刀柄挂千问贴图，并补护手与刀尖两段几何、调平持刀角度。
- **文档**：`CHARACTER_ART_PIPELINE.md` 的贴图来源由 SDXL 改为千问（含 prompt 尾缀要求与许可证口径）；`ASSETS.md` 登记 6 张贴图与生成脚本。
- **验证**：`--import` 生成 `.import`；对照渲染确认 4 槽贴图全部生效（`tex=true`）、模型正面 = -Z；第一人称刀渲染确认刀形/护手/防滑柄可见；headless 编译无错。
- **未做**：UV 展开与法线烘焙（P1），当前平铺贴图近看有拉伸。

## 2026-11-11 · 出刀反馈补齐 + 人物「倒着走」修复

**用户反馈**：① 人物建模粗糙，想走「骨骼驱动 + 贴图写实」；② 出刀没有反馈（无动作、无击倒特效、无红色提示）；③ 人物行走时会倒着走。

- **③ 根因修复（sim 真 bug）**：`tick_agents` / `agent_aim_ang` 取 `path[0]` 算朝向，但移动是按 `pathI` 推进的 —— 走过第一个路点后，人物整段路背对行进方向。改为取 `path[pathI]`，并跳过零长度步进（避免站定时角度抖动）。验证：`pathI=1` 时 aim 由 `0.0` 变为 `1.5708`（正对 +Z）。
- **② 出刀反馈**：
  - 第一人称刀视图（`player.gd`）：程序化刀身 + 刀柄挂在相机下，三段式挥砍（抬刀 → 斜劈 → 收回，0.46 s），走路时有轻微摆动；只在「异形 + 本夜有刀 + 活着未倒地 + 不在会议」时显示。
  - 命中反馈（`main.gd` 新增 `fx_layer`）：屏幕中心命中标记（四条斜线）+ 红色边缘闪 + 镜头 FOV 收缩/抖动；挥空也有刀风与轻微回弹，但不会假装命中。
  - 击倒特效：受害者位置溅一次性血花（`CPUParticles3D`，16 粒 / 0.5 s）；走事件层统一生成，玩家出刀与 AI 互杀同一条实现，不重复播。
- **① 人物写实**：新增 `3d/CHARACTER_ART_PIPELINE.md`，给出「保留 17 骨低模 + UV + PBR 图集」方案（1,812 面不加，只换表面），含贴图规格、验收标准与接线点。**本轮未改动任何模型资产**。
- **验证**：`godot --headless --quit-after 3` 无脚本错误；`player.gd` 探针确认刀视图构建、挥刀位移、FOV 回弹正常；GLB 探针确认模型正面 = -Z（与 `look_at` 一致）。

## 2026-11-11 · 3D 版本升至 V1P-0.2 / 0.2.0

- 版本真源 `3d/version.json`：`V1P-0.1` / `0.1.0` → `V1P-0.2` / `0.2.0`，build 2026-11-11。
- 移植基线同步到 2.5D `返航录V3.7` / `3.7.0`（`npm run baseline:sync`，基线清单 443 个文件，`baseline:check` OK）。
- 同步版本口径：`3d/README.md`、`BASELINE.md`、`SPLIT.md`、`AGENTS.md`、`3d/spec/port-manifest.json`、`3d/preview/project.godot`。

## 2026-11-11 · 第 23 批：game.js core/UI 审计 + 会议面板 UI spec POC

用户继续要求把行为逻辑和 UI 纳入自动移植；本轮做 `game.js` 函数级解耦审计与会议面板 UI spec。

### 1. game.js core/UI 解耦审计

- 新增 `3d/tools/core-ui-audit.cjs`（`npm run 3d:audit:coreui`），按函数体统计
  DOM / 定时器 / `G` 状态 / `say|logEvent|toast|SND` 副作用，写
  `3d/reports/core-ui-audit.md` / `.json`。
- 读数：341 个具名函数（不含容器 `boot`）；`core-state` 196 / 7206 行、
  `ui` 47 / 1734 行、`pure` 96 / 1028 行、`adapter` 1 / 7 行；**混用 DOM+G 39 个**。
- 最重债务：`startVote`（202 行 / 13 DOM / 75 state）、`update`、`syncHud`、
  `openMeeting`、`closeVote`、`say`；报告给出“先抽 sink → 再抽时钟 → 逐个 decide/render”的顺序。

### 2. 会议面板 UI spec

- 新增 **`3d/spec/ui/meeting-panel.spec.json`**：17 个元素、11 个模板、3 个状态
  （discuss / vote / readonly）、6 个事件；来源是 2.5D `js/ui/templates.js#meet`。
- 新增 `3d/tools/check-ui-spec.cjs`（`npm run 3d:ui:check`，已并入 `npm run check`）：
  - 2.5D DOM：17/17 元素、11/11 模板、时段选项全对；
  - 3D `main.gd`：17/17 Control 字段、11/11 模板、
    `_on_player_say` / `_on_meeting_template` / `sim.cast_vote` / `skip_*` 等 handler 均存在。
  - 对齐了一处文案：3D 发送按钮由“发 言”改为 2.5D 的“发送”。

### 3. UI spec → Godot POC

- 新增 `3d/tools/poc-gen-meeting-ui.cjs`：从 spec 生成
  `3d/preview/poc/generated_meeting_panel.gd`（17 个 Control、11 个模板按钮、3 个状态的
  可见性规则）；新增 `3d/preview/poc/meeting_ui_poc.gd` 验证结构/文本/模板父节点/状态。
- `npm run 3d:poc:ui` 实跑：**MEETING-UI-POC pass=7 fail=0 nodes=17 templates=11 states=3**。
- 边界：POC 只生成结构 / 文本 / 状态可见性，**不生成业务 handler，也不替换 main.gd**；
  2.5D DOM 仍是 spec 的来源，下一步才是让 2.5D 也消费 spec。

### 4. 实跑读数（2026-11-11）

| 项 | 结果 |
|---|---|
| `npm run check` | **7 通过 / 0 失败**（新增 `3d:ui:check`） |
| `--speechtest` | `17/0` |
| `--simtest` | `26/0` |
| `--meetuitest`（真实窗口） | `23/0` |
| `--actiontest` | `5/5` |
| `npm run 3d:poc:speech` | runtime 503/503 / generated 503/503 |
| `npm run 3d:poc:ui` | 17 nodes / 11 templates / 3 states，7/0 |
| `npm run 3d:audit:coreui` | 341 函数 / 混用 DOM+G 39 |

## 2026-11-11 · 第 22 批：可移植性审计 + parseSpeech 差分 POC

用户裁定：行为逻辑和 UI 也应当是自动移植的部分；先做只读审计与 parseSpeech POC。

### 1. 只读可移植性审计

- 新增 `3d/tools/portability-audit.cjs`（`npm run 3d:audit:port`）：扫描 22 个 JS 文件，
  按「数据表/配置 / 纯逻辑 / 逻辑+定时器适配 / DOM-UI / 运行时 DOM」分层，写
  `3d/reports/portability-audit.md` / `.json`。
- 读数：22 文件 / 19931 行；`js/game.js` **11917 行 / 438 处 DOM 引用 / 7 定时器**；
  纯逻辑 7 文件 2631 行；DOM-UI 7 文件 2716 行；数据表/配置 5 文件 2265 行。
- 结论：数据表已自动导出；纯逻辑可做 IR + codegen；`game.js` 与 UI 必须先上游解耦，
  不能把 HTML/CSS 直接翻译成 Godot Control。

### 2. parseSpeech 差分 POC

- 新增 `3d/tools/poc-parse-speech.cjs`（`npm run 3d:poc:speech`）：
  - 从 2.5D `js/t2/decision.js#parseSpeech` 生成 **503 条 fixtures**（名称重叠 / 死亡席位 /
    补零与中文席位 / 六类 claim / 否定 / 支持 / 投票 / 否认 / 时段 / 截断 / 300 条 fuzz）；
  - `3d/tools/poc-gen-parse-speech.cjs` 从 `lines.json` 自动生成独立 GDScript 解析器
    `3d/preview/poc/generated_parse_speech.gd`；
  - Godot runner `3d/preview/poc/parse_speech_poc.gd` 同时跑运行时手写解析器与生成解析器。
- **读数：runtime 503/503 / generated 503/503**（`3d/reports/parse-speech-poc.md`）。
- 修复前实测 **90/503 不一致**，5 个真实偏差全部修在 `lines_data.gd#parse_speech`：
  ① 3D 过滤死亡/濒死席位，2.5D 只排除玩家自己；
  ② 3D 不认 2.5D `seatNo()` 的裸补零席位（`07`）；
  ③ 3D 席位正则没排除玩家自己的 `1号`；
  ④ 3D 的 `%d号` 子串匹配让 `12号` 同时命中 `2号`；
  ⑤ 3D 把全文截到 80 字再解析，2.5D 只截 `raw`、解析用全文。
- 解析器能认出死者后，`speech.gd#player_say` 补 2.5D 同款早退：目标已死/濒死时
  不写听众证词，避免“给死者记 sus”。

### 3. 边界（不伪装成完成）

- POC 生成器只自动生成词表/正则，控制流仍是 `parseSpeech` 的固定算法模板；
  **不是通用 JS→GDScript 转译器**。
- 行为/UI 的真正自动移植仍需：上游拆 DOM-free core → IR → codegen；UI 共享 spec 双 renderer。
- 本轮不改 `js/`、不新增运行时依赖、不把 POC 文件挂进 `main.tscn`。

### 4. 实跑读数（2026-11-11）

| 项 | 结果 |
|---|---|
| `npm run check` | **6 通过 / 0 失败** |
| `--speechtest` | `17/0`（模板 11/11） |
| `--simtest` | `26/0` |
| `--meetuitest`（真实窗口） | `23/0` |
| `--actiontest` | `5/5` |
| `npm run 3d:poc:speech` | runtime **503/503** / generated **503/503** |
| `npm run 3d:audit:port` | 22 文件 / 19931 行分层报告 |

## 2026-11-11 · 第 21 批：玩家发言模板对齐 parseSpeech（2.5D + 3D）

用户要求把玩家发言模板与 AI 实际能识别的模板对齐并扩展，2D / 3D 同批。

### 1. 2.5D 真源（上游 `新返航录`）

- `js/game.js#meetTemplateText`：8 类 → **11 类**，补齐 `parseSpeech` 六类直接证据中
  缺的三类：`saw_sabotage`（破坏设备）、`saw_bot`（机器人停摆）、`saw_breaker`（拉闸）。
- 新增**时段**参数（`recent` / `night`）：只作用于「我在… / 不是我」两项口供，
  生成「我刚才在 X」/「我一整晚都在 X」，对应 `claimWindow` 的 recent / 整夜窗口；
  不指定时段仍走原来的 45 秒默认窗。
- **证据模板不选舱室就不声称地点**：点击层不再把玩家当前舱室回落到证据句；
  只有「我在… / 不是我」才回落到当前舱室。管道模板仍只在真有管道口的舱室附带地点。
- **「不是我，我在 X」不再被自述位置分支截走**：`playerTalk` 的 where 分支在
  `sl.deny` 时改走否认回应（`press_deny` / `ack_short`），时间线拆穿仍先执行。
- `js/ui/templates.js`：新增三颗证据按钮 + 「不指定时段 / 刚才 / 整晚」下拉与提示；
  `MEET_TPL_KINDS` 作为按钮 / 生成器 / 门禁唯一清单，`_t.tplKinds()` 暴露。
- `tools/test-v3.cjs`：模板契约逐条断言（11 类槽位、六类 claim、时段、空舱室、
  证据句不产生额外槽位、按钮集合一致、空舱室点击真实不注入地点）。

### 2. 3D 移植

- `main.gd`：镜像 11 模板 + 时段下拉；`_meeting_template_defs()` 作为按钮 /
  `--speechtest` 共用清单；`_meet_template_text(kind,t,rid,when)` 逐条对齐；
  空舱室不再注入当前房间（只有口供类回落）。
- `speech.gd#player_say`：回应池按 2.5D `playerTalk` 分支重排：
  - 证据 → 被指者 `player_claim_deny`（`{k}` = 动作，不再是任务名），
    有独立确证的人 `known_endorse_player`；
  - 作证 → 有疑心的人 `skeptic_ask`，否则被保者 `player_support_thanks`
    （**不再把作证回应写成对目标的证词**）；
  - 指控 → 被指者 `defend` + 旁人 `call`；投票 → 跟票 / 追问；
    自述 → 同舱室 `ask` / 他人 `identity`；否认 → `press_deny` / `ack_short`。
  - 删除 3D 自造的「玩家否认 → 全员可信度 −0.05」；2.5D `RELIA.emptyAccuse`
    至今是未接通配置，不在 3D 另造规则。
  - 删除普通「怀疑」模板附带的 `empty_accuse` 证词；2.5D 该分支不加目标嫌疑。
- `port-manifest.json#X-BIND` 行段随源码增长改为 `11755–11917`；
  `check-parity.cjs` 的 `0.01/0.99` 源行号 7095 → 7135。

### 3. 实跑读数（2026-11-11）

| 项 | 结果 |
|---|---|
| 2.5D `node tools/test-v3.cjs` | **918 通过 / 1 失败**；失败＝已登记时序偶发「领取物资申请单」 |
| 2.5D 未改动 HEAD 对照 | **911 通过 / 3 失败**（拖拽 0.00 格 / 藏尸 ×2）；同一机器同样失败，证明不是本批回归 |
| 2.5D 模板新增契约 | 连续 4 轮全过（11 类 / 六类 claim / 时段 / 空舱室） |
| `npm run check` | **6 通过 / 0 失败** |
| `--speechtest` | `pass=17 fail=0`，模板 **11/11**，席位号 4/4 |
| `--simtest` | `26/0` |
| `--meetuitest`（真实窗口） | `23/0` |
| `--actiontest` | `ACTION OK 鼠标相位 5/5 · 2.5D 动作入口 5/5` |
| `baseline:sync` | 3 个文件更新 / 451 相同；454 文件清单重建 |

> 说明：Godot 自测参数必须放在 `--` 之后（`godot --headless --path 3d/preview -- --speechtest`）；
> 不写 `--` 时 Godot 会把参数当引擎参数吞掉，表现为“测试没跑、进程不退”。

## 2026-11-11 · 第 20 批：knife/down + V-CREW full + 音频同步 + 鼠标/银翼清理

用户现场：会议室圆桌旁“银翼”贴图去掉；同步 2.5D 声音系统；全面审查红线继承；
截图时不能抢鼠标；补 knife/down 并把 V-CREW 标 full。

### 1. 圆桌“银翼”贴图

- 删除 `map_builder.gd` 的 `_build_preview_actor()`（36.0, 34.5 的 `Sprite3D` +
  “02 银翼”`Label3D`）及无用的 `_system_font()`；圆桌旁不再有 2.5D 预览人偶。

### 2. 2.5D 声音系统同步

- `audio.gd` 按 2.5D `SND` 对齐：
  - `volAt`：d=0→1.00、d=9→0.57、d=18→0.14（线性、保底 0.14）；
  - `TONE` 音量上限 / 随机音高；`knife/step/scream` 多采样随机；
  - `step / scream / flesh / door / work / win / lose` 采样接入；`M` 键开关音效；
- `main.gd`：事件按位置播放；刀/枪叠血肉+喊叫；脚步声遍历近处移动者；
  玩家站桩/小游戏时播 work；门完全开/关发 `door_auto`；`game_end` 按 win/lose 分流；
- 新增 `sfx-work.ogg`（恢复已登记但缺失的采样）。

### 3. knife / down 动作与 V-CREW full

- Blender 四动作：`idle / walk / knife / down`；`knife` 由 `sim.events#knife`
  一次性触发，`down` 由 `downed` 状态触发；down 根骨后仰躺地，不靠视图层旋转。
- 新增 `--crewanimtest`（无窗口、无鼠标）：断言 4 个 clip 存在且 knife/down 能触发。
- `port-manifest.json#V-CREW`：**partial → ported（full）**；
  `assets.manifest.json#char_crew_lowpoly`：**wip → done**。

### 4. 截图不再抢鼠标

- `player.capture_mouse_on_ready` + `main._screenshot_mode`：`--shot / --crewshot /
  --doorshot / --mgshot / --devshot / --covershot / --ceilshot / --pipeshot /
  --meetshot / --endshot / --minishot / --homeshot` 全部保持 `VISIBLE`；
  不转视角、不误触攻击；退出时 `_exit_tree()` 再次释放。
- 实测 `CREW_MOUSE mode=0（0=VISIBLE）`；遗留 Godot 测试进程已清理。

### 5. 红线审查

- 新增 `3d/REDLINE-AUDIT.md`：红线 1–10 通过；**红线 11 未全过**（鬼魂模式未迁、
  医疗无人机救起行为未闭环、1000 局基线过期）；**红线 12 流程缺口**（角色参考来自
  项目自绘 2.5D sprite，未留痕公开设计参照检索）。
- 本批不把“2.5D 全量玩法已迁完”写成结论。

### 6. 截图鼠标规范固化

- `AGENTS.md` §五.8（强制）+ §6.2.1：所有截图/机位参数必须 `MOUSE_MODE_VISIBLE`，
  禁止 `CAPTURED` / `warp_mouse`；`--probetest`/`--mousetest` 是输入链自测，不是截图。
- `3d/README.md` 截图段、`3d/HANDOFF.md` 接手陷阱 ⑬ / §0.6、`3d/ARCHITECTURE.md` §7、
  `3d/spec/conventions.md` §7、`3d/DECISIONS.md` ADR-0013 同步；
  `3d/REDLINE-AUDIT.md` §五 增加规范入口。
- 落地代码：`main.gd::_screenshot_mode`、`player.capture_mouse_on_ready`、
  `_exit_tree()` 释放；实跑 `CREW_MOUSE mode=0`。

### 7. 实跑读数（2026-11-11）

| 项 | 结果 |
|---|---|
| `npm run check` | **6 通过 / 0 失败** |
| `npm run baseline:check` | **454 文件 OK** |
| `--crewanimtest` | `clips=["down","idle","knife","walk"] knife=knife down=down` · **OK 0 项失败** |
| `--audiotest` | `volAt 0→1.00 / 9→0.57 / 18→0.14`；work/step/scream/door 采样全在 |
| `--simtest` / `--aittest` | `26/0` / 无失败 |
| `3d:assets` / `3d:import:check` | 0 错误 / 3 旧提醒；76 个 `.glb.import` 0 差异 |
| `3d:port:check` | 0 错误 / 1 legacy 警告；**ported 13 / partial 23**（V-CREW 已 full） |

## 2026-11-11 · 第 19 批：千问参考图 → 参考建模 → idle/walk

用户指令：先用本地生图模型生成示例图，再按示例图建模并加行走动作；当前人物是“漂移状态”。

### 1. 本地千问参考图（3 张）

- `3d/tools/gen-art-refs.ps1` 新增 `-Set crew`；本地 Qwen-Image 2.1 Turbo Q4_K_M
  （sd-cli Vulkan，8 步，768²，约 95s/张），生成：
  - `docs/qwen21/crew-refs/crew-turnaround_768.png`（正/侧/背三视图）
  - `docs/qwen21/crew-refs/crew-variants_768.png`（浅灰/珊瑚红、橄榄/琥珀、钢蓝/青三配色）
  - `docs/qwen21/crew-refs/crew-detail_768.png`（胸带 / 腰包 / 护膝 / 靴子细节）
- 设计基准：项目自己的 `assets/scene/crew/crew-01.png`（浅灰/珊瑚红、短黑发、背包、无头盔）。
  Qwen Research License（非商用），模型/seed/prompt 在同目录 `manifest.json`。

### 2. 按图建模：`char_crew_lowpoly`

- 新脚本 `3d/tools/build-crew-rigged.py`：1.75 m / **1812 tris** / 4 材质
  （`crew_suit` / `crew_accent` / `crew_gear` / `crew_skin`）/ **17 形变骨**。
- 外观按参考图：浅灰勤务服、珊瑚红 H 型胸带 + 护膝 + 腿侧红条、黑靴、短黑发、
  背包、腰包；无头盔。
- 动作：`idle` + `walk`（24fps / 1 秒循环），NLA 导出；`knife` / `down` 仍待补。
- `assets.manifest.json` 的 `char_crew_lowpoly` 从 todo 改为 wip；`ASSETS.md` 登记
  1812 tris / GLB SHA `b73e56d08f110369`。

### 3. 漂移修复

- `crew_view.gd` 默认加载 `char_crew_lowpoly.glb`，逐实例 `AnimationPlayer`；
  `moving=true` 切 `walk`、静止切 `idle`，只在状态切换时 play，避免每帧重置。
- 移速 4.2 m/s；walk 动作 1 秒循环（步幅约 1.4m），播放 **2.9×**，让脚底速度跟身体一致。
- 模型缺失 → `char_crew_blockout.glb` → billboard 逐级回退；`--crew-billboard` 强制旧贴图。
- `--probetest` 新增断言：`CREW_ANIM_SWITCH walk=walk idle=idle`。

### 4. 实跑读数（2026-11-11）

| 项 | 结果 |
|---|---|
| `--crewshot` | `CREW_ANIM ... ["idle","walk"]` · `CREW_MODEL 1 mesh / 4 mats` · 输出 `screenshots/crew-lowpoly.png` |
| `--probetest`（默认） | `CREW_VIEW models=14 billboards=0` · `CREW_ANIM_SWITCH walk=walk idle=idle` · **OK 0 项失败** |
| `--probetest --crew-billboard` | `CREW_VIEW models=0 billboards=14` · **OK 0 项失败** |
| `--powertest` | 门扇 `closed_gap=0.000 / open_gap=1.800`（第 18 批） |
| `npm run 3d:assets` / `3d:import:check` | 0 错误 / 3 提醒；76 个 `.glb.import` 0 差异 |
| `npm run check` | **6 通过 / 0 失败** |

## 2026-11-11 · 第 18 批：人物 blockout 默认化 + 门扇闭合修正

用户 2026-11-11 现场：人物「仍然是贴图」；门在无人时应完全关、有人通过时应完全开，
不能像现在半开。裁定：人物先做 blockout 验证，首批目标 15 crew + 4 动作；鬼魂模式后置。

### 1. 新资产 `char_crew_blockout`

- Blender 5.2.2 脚本：`3d/tools/build-crew-blockout.py`；1.75 m / **864 tris** /
  3 材质（`crew_suit` + `crew_gear` + `crew_skin`）/ 无骨骼 / 底面中心 / 无碰撞。
- 源文件 `3d/assets/models/char_crew_blockout.blend`，导出
  `3d/assets/export/char_crew_blockout.glb`；已登记 `assets.manifest.json`（wip）
  与 `ASSETS.md`。
- 体块不是最终角色：用于核对比例、剪影、舱室尺度；骨架/动画在确认后做。

### 2. 接入：默认 3D 体块，`--crew-billboard` 回退

- `crew_view.gd` 增加 blockout 模式：15 人按 `CREW_COLORS` 换制服色，模型缺失/实例化失败
  逐人回退 billboard；`bodyGone` 隐藏、濒死/死亡放倒、DEV 下仍标阵营。
- **默认已切到 3D 体块**（用户 2026-11-11 现场「仍然是贴图」）；`--crew-billboard`
  保留旧 billboard 作为回退/对比，`--crew-model` 保留为兼容别名。
- `--crewshot`：真实会议室同框摆 2.5D billboard / 3D blockout / 1.75 m 标尺，
  输出 `preview/screenshots/crew-blockout.png`。同框发现旧 billboard 的可见高度约 1.5 m，
  体块按 1.75 m 建；正式换模型时以 1.75 m 为准。

### 3. 门扇闭合 / 触发口径修正（2.5D doorTick）

- **根因**：3D 门扇基座在中心 ±half（0.9 m），每扇宽 0.9 m，关闭时两扇之间仍留
  0.9 m 缝；碰撞盒也一样 —— 看起来永远半开，人还能从“关着”的门缝里挤过去。
- **修法**：基座改 ±half/2，滑动量改 `half * open`；关闭时两扇在中线合拢，
  完全打开时各滑出 half，正好让出整段 1.8 m 门洞。初始 `open` 由 1.0 改 0.0。
- **触发**：照 2.5D `doorTick` 遍历**所有活人**（不只玩家）；会议 / 结算期间冻结。
- 数值：`POWERTEST 门扇 closed_gap=0.000 closed_blocked=true open_gap=1.800 open_blocked=false`。

### 4. 实跑读数（2026-11-11）

| 项 | 结果 |
|---|---|
| `npm run 3d:assets` | 92 项 · 0 错误 / 3 提醒（仍是旧 3 个 wip 源文件） |
| `npm run 3d:sync:models` / `3d:import:check` | 同步完成 · 75 个 .glb.import **0 差异** |
| `--crewshot` | `CREWSHOT_PATH=.../screenshots/crew-blockout.png`；3 meshes，mats=crew_suit/crew_gear/crew_skin |
| `--probetest`（默认 3D 体块） | `CREW_VIEW models=14 billboards=0` · **PROBETEST OK 0 项失败** |
| `--probetest --crew-billboard` | `CREW_VIEW models=0 billboards=14` · **PROBETEST OK 0 项失败**（回退路径未被破坏） |
| `--powertest` | 门扫描/放行原读数不变；新增门扇几何 `closed_gap=0.000 open_gap=1.800` 通过 |
| `--aittest` / `--navtest` / `--arttest` | 原读数不变（AI / 网格 / 美术回归） |

## 2026-11-10 · 第 17 批：异形 E 出刀 + DEV 移植 + 玩家探针

用户现场：「我自己作为异形进去的时候，点 E 交互仍然无法将人击倒，我都不知道交互了个啥；
3D 里没有把 2D 的 DEV 弄过来，DEV 很有必要」；并要求「你自己写玩家探针」。
本批不采任何平衡读数，改动依据全部是 `js/game.js` 语义与真实输入链。

### 1. E 现在能放倒人（输入映射差异，同一套结算）

- `_collect_offers` 新增 `attack` 项：异形在刀程内、视线内有活人时，E 轮盘直接出现
  「出刀 · 名字」；单项时 E 立即执行，多项时 `1-9` 选择。
- E 的选人照 2.5D `stab()`（`js/game.js:8243-8248`）：**刀程内最近 + `losNow` 有视线**；
  左键仍走准星，但 `_player_knife` 补了同源遮挡判定（3D 的 `sim.knife` 不自己查墙/掩体）。
- 失败不再静默：人类按 E / 刀用尽 / 目标离开刀程 / 墙或掩体挡住 / 结算拒绝
  各有 toast 与探针记录；「附近没有可交互的东西」只在真的什么都没有时说。

### 2. DEV（F2）从 `excluded` 改为 `partial`

- `sim.dev` + `sim.dev_log`（**不进 events**，不污染 2.5D 事件对账）。
- 无敌语义照 2.5D：先扣刀/子弹再免伤（`:4230-4243`、`:8270-8282`）、死亡拦截（`:4287`）、
  驱逐无效（`:7673-7679`）、保安看不见 DEV 玩家（`:4782`）；`knife / shoot / kill / die`
  与 `_close_meeting` 共用同一组守卫。
- UI：右侧可滚动卡片栏（名字 / 阵营 / 状态 / 舱室 / 弹包单 / 任务 / 刀），
  crew 头顶在 DEV 下显示阵营，小地图在 DEV 下画其他席位（死者用尸体位），
  尸体卡显示凶手，投票结果写「DEV 无敌：驱逐无效」。
- 2.5D 的 `SKInvariants` 运行时断言层**未迁**（3D 无对应实现），已在 port-manifest 写明。

### 3. 玩家探针（真实 InputEvent）

- `--probetest` / `npm run 3d:probe`：真实按 E → 看候选与结果；真实左键；真实数字键选轮盘；
  真实 F2 开 DEV，再验 AI 开枪 / 死亡 / 驱逐对玩家无效。禁止直接调 sim 冒充输入。
- DEV 面板底部常驻「探针 · 最近 8 条」：按 E / 左键 / 右键 / 轮盘 / F2 都留痕，
  解决「不知道交互了个啥」。
- 探针必须真实窗口：headless 下 `Input.MOUSE_MODE_CAPTURED` 不成立，左键会被
  「先夺回鼠标」分支吃掉（`--mousetest` / `--knifetest` 同一条限制）。

### 4. 本批实跑读数（2026-11-10）

| 项 | 结果 |
|---|---|
| `npm run check` | **6 通过 / 0 失败**（`S-DEV` 现为 partial，源行覆盖不变） |
| Godot 自测 | **33 项全部 exit 0 / 0 条 `SCRIPT ERROR`** |
| `npm run 3d:probe` | `PROBE ① [attack]` · E 濒死=true 刀=0 · 左键濒死=true · 轮盘选 1 濒死=true · F2 dev=true 面板=true · DEV 挨枪/死亡/驱逐全无效 · **PROBETEST OK 0 项失败** |
| `--knifetest` | `命中=true 剩余刀=0` |
| `--mgtest` | `14/14 pass`（旧文档写 10 型，已更正） |
| `--devicetest` | `open=true locked=true / closed=true unlocked=true`（旧的 open=false 坏账已清） |
| 其余回归 | `SIMTEST 26/0`、`ACTION OK`、`UITEST 0 失败`、`E2E open=true`、`SETTLETEST 5/0`、`MEETUITEST 23/0` |

## 2026-11-10 · 第 16 批：判定层完整性收尾（目标评分 / 证据 / 情绪 / 口供 / parity）

用户指令「把剩下来的全部完成」。上游 `baseline:sync` 复核：454 文件相同、0 更新。
本批把 `PORT-DIFF-AUDIT.md` §E/§G 里的判定层残项逐条结清。

### 1. 目标评分完整同源（`js/game.js:3849-3896 / 3868-3888 / 7030-7113`）

- 新增 `rules.json#constants.IDENTITY`（`export-rules.cjs` 从 `js/game.js` 抠，禁止手抄）：
  `evidenceW / almostAlien / almostHuman / targetMulMin / targetMulMax / alienPow /
  alienExplore / priorMin / priorMax`。
- `mind.gd` 补：
  - `identity_prior()`（15 席 / 4 异形公开配置 + mates/known 条件化 + 公开出局扣减）；
  - `identity_axis()`（known/mates→0；almost.foe 含身份级证据→0.05；almost.friend→0.95；
    其余 = prior + evidenceW×min(0.5, cred)；普通 sus 不进身份轴）；
  - `hostile_prob()` / `target_dist_mul()`；
  - `trait_b()` + `trait_c()`：公式按 `traits.js` 移植，数值读
    `rules.json#tables.SKTrait.C[*].nums`（不另抄阈值）；
  - `has_id_evidence()`（ID_EVIDENCE 白名单）。
- `ai_alien` 评分改成 2.5D 原式：
  `base = d + exposure×knifeWatcherPenalty(a) + (mateOnIt?8:0) + (busy?knifeBusyBonus:0)`；
  `score = base×targetDistMul(hostileProb(a,v)) − HUMANISH.pull×humanT`。
- 新增 `_exposure_at()`（`js/game.js:3156` exposureAt：witnessWeight + escapeCost +
  做事的人不算目击者）与 `_hunt_spot()`（`js/game.js:3616` huntSpotFor：
  最后目击点 → 本夜最常看见的舱 → 任务点最多的舱）。无目标时先试管道寻人，
  没刀再随机游荡（有刀原地等，2.5D 同口径）。

### 2. `evalAlmost` 全量（`js/t2/ai.js:364-436`）

- foe：`sus≥foeSus` + **至少 1 条 real** + `counted≥foeKinds` + 至少 1 条新鲜；
  `WEAK`（沉默/空口指控/领袖点名/不可能口供/快报案/错告）不算；
  `heard_*` 最多补 `heardKinds` 个；`heard_vouch` 是正向，不进敌性证据。
- friend：`cred≥friendCred` + `credWhy` 种类≥`friendKinds` + 新鲜，且不在 foe/known。
- 统计 `almostCount / almostAlien / almostHuman / almostHeard / almostFriendCount`。
- 3D 的 `why` 兼顾时间线与证据数组：`saw_agent / saw_body_moved` 继续排除。

### 3. 情绪通道 `trust` / `grudge`（`js/game.js:1461-1476 / 7487-7499`）

- `mind` 新增 `grudge_add / trust_add / is_patron / best_grudge`；系数
  `grudgeGain / trustGain / voteGrudgePull` 读 `SKTrait.C` 的 nums。
- 写入：AI 公开指控 → 目标记仇 0.40；AI 当众辩护 → 被保者记恩 0.45（不再用 warm 顶替）；
  玩家指控 0.45 / 说“我投 X” 0.30 / 说“不是异形·别投·我保·他没错·不可能是他” 0.40。
- 读取：`_ai_vote_target` 情绪先于从众（grudge≥0.6 时按 `voteGrudgePull/10` 砸票）；
  `isPatron`（trust≥0.8）在 almost / 公开指认 / bestSus / 综合评分四处都不过票。

### 4. 口供史 `claimHist` + 描述失真 `DESC`

- `claimHist`：`record_claim` 每场记 `{night, room, roomId}`，只留最近 3 场、跨夜 carry；
  `on_meeting_open` 对每位 AI 比较上一场口供，房间变了就让另一个 AI 说一句
  `claim_recall`（`{r}`=本次、`{r2}`=上次）—— **只说不判，不产生任何 sus**。
- `note_testimony`：DESC 失真原本已实现（房/动作/权重折扣），本批修两处：
  - 听众的 `heard` 窗口改用 **DESC 后**的种类；
  - 一次证言只写 **一条** `why`（原先 `sus_add` + `_push_why` 双写，且
    `heard_testimony` 被 `evalAlmost` 当成实证种类）。

### 5. 构陷 / 大义灭亲编排补齐（`js/game.js:5820-6112`）

- `plan_alien_deception`：反咬时补“我没钻过管道/没出过刀…”的否认前缀；补靶子回应、
  真目击者重申；补 `defended_suspect`（替已被确证者帮腔，人类听众反过来怀疑附议者）；
  假口供 `accuseWhy` **不再标 solid**，也不再直接 `note_accuse`（2.5D 不进 ctx.lead）；
  返回 `by/co` 供下一段去重。
- `plan_mate_bus`：补 `used`（本场构陷的说谎者/附议者不再卖队友）、时间词、按
  `bestKnownTarget(w)` 过滤听众；`accuseWhy` 去 `solid` 与 `note_accuse`（软构陷）。

### 6. parity 对账收口

- `check-parity.cjs` 新增 `SOURCE_LITERALS`：20 个 2.5D 源码字面量逐项带
  `js/game.js:行号`，扫描时**回读该行验证数字存在**；上游改行会直接 FAIL，
  不会把新阈值静默当成已核对。`3d:parity:check` 现在 **0 WARN**。
- `PORT-DIFF-AUDIT.md` 新增 §J：`buildMeetCtx` 字段 → 3D 存储/消费方逐字段映射
  （等价实现，不另造对象）。

### 7. 本批实跑读数（2026-11-10）

| 项 | 结果 |
|---|---|
| `npm run check` | **6 通过 / 0 失败**（parity **0 WARN**） |
| Godot 自测 | **32 项全部 exit 0 / 0 条 `SCRIPT ERROR`**（新增 `--socialtest`） |
| `--socialtest`（新增） | **6/0**：grudge/trust/patron · grudge 砸票 · patron 不过票 · claimHist/claim_recall · evalAlmost（WEAK/foe/stale/heard/friend） · DESC+单写 |
| `--aiporttest` | **13/0**（新增身份轴/距离乘子/暴露度/寻人点/特征系数） |
| `--speechtest` / `--meetingtest` / `--aittest` | `11/0` · `ok=true` · `prog=23/45 knife=7 kill=7`（只作记录，不作验收） |
| `baseline:check` | 454 文件 OK |

> 按 `AGENTS.md` §五.7：没有采新的平衡读数，改动依据全部是 `js/` 行号与真人行为。

## 2026-11-10 · 第 15 批：局内小地图（UI 收尾）

用户指令「继续」。上游 `baseline:sync` 复核：454 文件内容相同、0 更新。
真源：`js/game.js:10507-10632`（`drawMini`）。

### 1. 小地图（`js/game.js:10507-10632`）

- 新增 `scripts/minimap.gd`，贴 HUD 右上角（240 宽，`98×94` 等比）：
  - 房间轮廓 + **短名**（2.5D `SHORT`：bridge→会议室 等）；亮/暗按
    `lightState` 三态（0 常态 / 1 全亮 / 2 只会议室）与房间 `light` 字段。
  - 走廊双描边（断电变灰）；每 10 格蓝图网格；标题「船体蓝图」+ `98 × 94`。
  - 8 个管道口（紫色菱形）、电闸金色、补给/监控/机器人绿色（医疗/保安读运行时坐标）。
  - **自己的剩余任务**：高难红 / 普通蓝 + 白环；其他任务点 0.22 透明暗点。
  - 故障红脉冲、待领申请单圆桌金脉冲、玩家金色脉冲（旁观/死亡青色）。
  - 图例：高难 2分 / 普通 1分 / 管道。
- **不画其他活人/尸体**（2.5D 正常对局也不画，只有 DEV 才画 —— 防透视）；
  不可点击、不受迷雾影响（2.5D 同口径）。
- 房间名 / 供电读数挪到地图下方（右侧对齐），不再和小地图抢右上角。
- 每 0.1 秒重绘（2.5D 每帧；小地图不需要 60fps）。

### 2. HUD 补「报告余量 / 本夜夜会数」

2.5D 规则「报告是稀缺资源，HUD 必须显示」：新增 `报告 N · 夜会 N/2`
（个人 `reportLeft` + `night_meets` / `MEET.perNight`），不再只藏在交互里。

### 3. 本批实跑读数（2026-11-10）

| 项 | 结果 |
|---|---|
| `npm run check` | **6 通过 / 0 失败** |
| Godot 自测 | **31 项全部 exit 0 / 0 条 `SCRIPT ERROR`**（新增 `--minimaptest`、`--minishot`） |
| `--minimaptest`（新增） | **4/0**：尺寸+点击穿透 · 灯态三态 · 任务点与 `remaining_tasks` 同源 · 地图数据齐全 |
| `--minishot`（新增） | 实拍 `preview/screenshots/minimap3.png` |
| `--settletest` / `--mousetest` / `--meetuitest` / `--aiporttest` | `5/0` · `5/0` · `23/0` · `10/0` |
| `baseline:check` | 454 文件 OK |

> 按 `AGENTS.md` §五.7：没有采新的平衡读数。

## 2026-11-10 · 第 14 批：结算页身份表 + 逐人投票矩阵（UI 收尾）

用户指令「继续我们的同步项目」。上游 `baseline:sync` 复核：454 个文件内容相同、0 更新，
本轮只做 3D 侧移植。真源：`js/game.js:4802-4838`（#e-ids / #e-votes）、
`js/game.js:7669-7672`（closeVote 终票落事件）、`js/ui/templates.js:332-339`（#end 结构）。

### 1. 终票按会议 `seq` 落账（`js/game.js:7669-7672`）

- 新增 `sim.meet_seq`：每场会议 +1，`meeting.seq` 随会议对象走；每局 `new_game` 归零。
- `_close_meeting()` 逐人写 `vote` 事件（带 `seq`）；`cast_vote()` **不再**逐次写 `vote`
  （2.5D 只在关票时落终票），改票仍写 `vote_change`（带 `seq`）——`--b6test` 的改票断言保持。
- 这样结算页可以按场次分组还原「谁投了谁」，且与 2.5D 的事件口径一致。

### 2. 死亡地点 `downRoom` / `deathRoom`（`js/game.js:2153-2163` bodyInfo）

- `knife` / `shoot` 倒地时记 `downRoom`；`die()` 把它落到 `deathRoom`（空则按尸体位置补）。
- 结算身份表因此能显示「被出刀 · 中央会议室」，拖尸不会改死亡地点。

### 3. 结算页（`js/ui/templates.js:332-339` + `js/game.js:4802-4838`）

- 新增独立 `settle_panel`：标题 / 胜因 / 维修与夜数 + **本局身份** + **谁投了谁** +
  固定按钮「再来一局 / 查看复盘」；表格区独立滚动，按钮始终第一屏可见。
- 本局身份：15 席，阵营（异形红 / 人类蓝）、结局（存活 / 濒死存活 / 被驱逐 / 被出刀 /
  被枪杀 / 天亮失血）、死亡地点、`刀在 N 号`。
- 谁投了谁：按 `seq` 分组，逐场列出 `名字 → 目标` / `→ 弃权`；没有投票则显示
  「本局没有进行到投票」。
- **阵亡提示不泄露身份**：玩家死亡但局未结束时仍只显示原来的 `end_panel`（「你已阵亡」），
  只有 `sim.over` 才显示结算页；重开 / 退出主页时两层都隐藏。
- 实拍：`preview/screenshots/end-settle.png`（1280×720，15 行 + 矩阵 + 按钮全可见）。

### 4. 本批实跑读数（2026-11-10）

| 项 | 结果 |
|---|---|
| `npm run check` | **6 通过 / 0 失败** |
| Godot 自测 | **30 项全部 exit 0 / 0 条 `SCRIPT ERROR`**（新增 `--settletest`、`--endshot`） |
| `--settletest`（新增） | **5/0**：终票按 seq 落账 · 改票只记 vote_change · 矩阵含弃权 · 身份表 15 行含地点/刀在 · 阵亡态不泄露身份 |
| `--endshot`（新增） | 结算页实拍（见上） |
| `--uitest` / `--meetuitest` / `--mousetest` / `--aiporttest` | `OK` · `23/0` · `5/0` · `10/0` |
| `--simtest` / `--b6test` / `--meetingtest` | `26/0` · `6/0` · `ok=true` |

> 按 `AGENTS.md` §五.7：本批没有采新的平衡读数；门禁/自测只回答「有没有写坏」。

## 2026-11-10 · 修复：鼠标被框在游戏窗口里（Esc 释放无效 / 截图工具拖不出去）

**现场**：用户反馈「鼠标会被框在某个区域无法移动」「打开游戏截图时会被框在游戏栏」。

### 根因

- `player.gd` 在 Esc 时把 `Input.mouse_mode` 设成 `VISIBLE`，但 `main.gd` 的
  `_refresh_mouse_mode()` **每帧**都会跑，没有任何面板时又设回 `CAPTURED` ——
  Esc 的效果只维持一帧，玩家看到的就是「怎么都放不出去」。
- 另有四处**无条件 CAPTURED** 会在关闭界面时把光标锁回去，即使玩家先按过 Esc：
  `ui_panels.close_all()`、`_close_pipe_ui()`、小游戏 `_hide()`、会议关闭分支。
- `MOUSE_MODE_CAPTURED` 会把光标裁在游戏窗口内，所以打开截图工具时拖不出选区。

### 修法（鼠标口径统一由 `main.gd` 管理）

- 新增 `mouse_released` 状态：Esc 切换、点击画面收回；`_refresh_mouse_mode()`
  改为 `VISIBLE if (mouse_released or _want_mouse_visible()) else CAPTURED`。
- **窗口失焦自动释放**（`NOTIFICATION_WM_WINDOW_FOCUS_OUT` / `NOTIFICATION_APPLICATION_FOCUS_OUT`）：
  切到截图工具 / 别的窗口时光标立刻自由；点击游戏窗口再收回。
- 结算 / 阵亡面板加入 `_want_mouse_visible()`（「查看复盘」按钮必须点得到）。
- 删除 `player.gd` 的 Esc / 点击分支、`ui_panels.close_all()` / `_close_pipe_ui()` /
  小游戏 `_hide()` / 会议关闭分支里的无条件 CAPTURED；小游戏的 `capture_on_close`
  字段一并删除（没有人再读它）。
- 新一局 `_on_start` 重置 `mouse_released=false`；HUD 提示改为「Esc 释放/收回鼠标」。

### 实跑读数（2026-11-10）

| 项 | 结果 |
|---|---|
| `--mousetest`（新增，真实窗口） | **5/0**：自由游玩 CAPTURED · Esc 后 20 帧仍 VISIBLE · 点击收回 · 会议开关 · 释放状态不被会议吞掉 |
| `--uitest` / `--meetuitest` / `--actiontest` / `--knifetest` | `OK` · `23/0` · `OK` · `OK` |
| `--simtest` / `--aiporttest` | `26/0` · `10/0` |
| `npm run check` | **6 通过 / 0 失败** |

## 2026-11-10 · 第 13 批：异形挑目标回归真源 + 判定层残项（A 档）

用户指令「继续」；本轮执行上一轮登记的 A 档。所有改动以 `js/` 行号论证，
**未采新的平衡读数**（`AGENTS.md` §五.7）。

### 1. 取消全图锁敌（`js/game.js:3849-3896`，2026-11-03 用户裁定）

- 3D 原先遍历所有活人的**实时坐标**打分；现在只有三档：
  ① 现在看得见 → 实时位置；② 看不见但本夜 `saw_agent` 记忆 ≤ `HUNT.memorySec`(25s)
  → 用最后目击位置；③ 完全没印象 → **不进候选**（只能巡逻 / 钻管道 / 破坏）。
- 同步补 2.5D 同块的四条：被拘留者不进候选、队友已在追的目标 +8 格当量
  （`mateOnIt`）、`HUMANISH.pull` 拉近最多 6 格、被晾目标（`_avoid`）降为兜底。
- 去掉 3D 自加的「目标承诺 −5 格折价」与 `_tgtI` 字段（2.5D 没有这个机制）。
- 无目标 + 没刀 → 随机游荡（`js/game.js:4151-4155`）；有刀原地等下一拍（真源同）。

### 2. `humanT` + `HUMANISH`（`js/game.js:1969-1977 / 2037-2045 / 3879-3888`）

- 异形目击**合闸**：rad 6 + LOS + 非队友 → `humanT +0.28`（上限 1）；
  跨夜 `keepEmo` ×0.8、<0.05 遗忘（`js/t2/ai.js:280`）。
- 挑目标时 `−HUMANISH.pull × humanT`（最多拉近 6 格）；不写 `known` / `mates`。

### 3. `saw_red` 5 秒节流（`js/game.js:1352-1360`）

- 同一段红光（`redT` 1.5s）原先每 0.5s 写一条，1.5 秒写 **3 条** `saw_red`
  （每条约 0.85 sus）；现在每 5 秒最多一条，红身窗口正常只写 1 条。
- 同时修 `note_sight` 的**重复记账**：`sus_add` 与 `_push_why` 各写一条 `why`，
  一次目击变两条；现在一次目击只写一条（`far` 标记保留）。
- `eval_almost` 不再把时间线记录 `saw_agent` / `saw_body_moved` 当成证据种类
  （2.5D 这两类只进 `mind.mem`、不进 `why`，否则「见过他」本身就算一条敌性证据）。

### 4. `lastBody` / `saw_body_moved` / `near_body`（`js/game.js:2165-2190`）

- 尸体观察改单槽 `{i, sig}`：alive/downed/伤口/移动/搜过/舱室 任一变化才重写。
- 尸体被移动过 → 追加 `saw_body_moved`（`sequenceCue` 的弱线索原料）。
- 同舱 8 秒内见过的人各记一笔 `near_body` 0.16（只说明"他在附近"，不能定罪）。
- 新增 `bodyMoved` 字段：拖行 >1.2 格才置 true（`js/game.js:2438-2440`）。

### 5. `aiIdleRoam` + `avoidSeen`（`js/game.js:2312-2363 / trackNight:1325-1340`）

- 人类 AI 任务做完不再站桩：修故障 → 领申请单 → 危险时跟 cred/warm 最高的人
  （`WARM.followChance` 0.45）→ 躲开最怀疑我的人（`audSusEstimate > 0.45`，
  距离 8~12 格）→ 随机巡舱。
- `_avoidHuman` 粘性（2.5D `startNight` 不清它）；被回避者 6 格内看见 →
  `saw_avoid` 0.10，每夜一次，记在**观察者**身上。
- 拨正 `audSusEstimate` 的方向：2.5D 是「他指认我 / 他看见我」，3D 原实现读成
  「我指认他 / 我看见他」（该函数此前无调用方，接 idle roam 时才暴露）。

### 6. 未同源（如实登记，不是立项）

- 异形目标评分的剩余简化：trait 系数（`knifeWatcherPenalty` / `knifeBusyBonus`）、
  `exposureAt` 全量、`hostileProb` / `targetDistMul` 身份轴、无目标时的
  `huntSpotFor` 管道寻人。
- `claimHist`（口供史，纯台词消费）、`trust` / `grudge` 两条情绪通道
  （3D 用 `warm` 承接辩护；`grudge` 目前只衰减、不写入）。
- 其余见 `PORT-DIFF-AUDIT.md` §C/§G。

### 7. 本批实跑读数（2026-11-10）

| 项 | 结果 |
|---|---|
| `npm run check` | **6 通过 / 0 失败** |
| Godot 无头 + 真实窗口自测 | **28 项全部 exit 0 / 0 条 `SCRIPT ERROR`**（新增 `--aiporttest`） |
| `--aiporttest`（新增） | **10/0**：看得见优先 · 无记忆不选 · 25s 记忆 · 过期跟丢 · humanT 拉近 · 合闸 +0.28/封顶 · `saw_red` 1/1/2 · `saw_avoid` 每夜一次 · idle roam+躲避 · humanT 跨夜 ×0.8 |
| `--aittest` | `prog=17/45 tasks=14 qual=4 supply=1 knife=4 kill=3 sab=1 meet=7 eject=4`（只作记录，不作验收） |
| `--simtest` / `--meetingtest` / `--speechtest` / `--b4test` / `--leadtest` / `--b6test` | `26/0` · `ok=true` · `11/0` · `8/0` · `5/0` · `6/0` |
| `--uitest` / `--meetuitest` / `--actiontest` / `--knifetest` | `OK` · `23/0` · `OK` · `OK` |

## 2026-11-10 · 第 12 批：会议 UI 功能同源（模板 / 席位号 / 弃权 / 先投改票 / 跳过投票 / 只读）

用户指令：「2.5D 版本逐步移植到 3D 版本中来」；本轮按裁定只做**会议 UI 功能层**。
逐条对照 `js/game.js` / `js/ui/templates.js` / `js/t2/decision.js`，不改任何判定数值。

### 1. 投票区（2.5D renderVoteButtons，`js/game.js:7413-7447`）

- **讨论期就能投、投票结束前都能改**：3D 原先 `b.disabled = phase != "vote" or voted`，
  第 4 批已移植的 `sim.cast_vote`（支持 discuss + 改票）玩家根本点不到。
  现在两期共用同一个投票区，`close_vote` 前不锁定。
- 席位按钮带补零编号 `01–15`（`tagName`，`js/t2/decision.js:40-41`），排除自己与死者，
  **濒死者仍可被投**（2.5D 只过滤 `!a.alive`；3D 原先把 downed 一起排除了）。
- 末位「弃权」按钮写 `-1`；当前目标金框高亮；改票仍写 `vote_change` 事件。

### 2. 跳过投票（`js/game.js:10898-10903`）

- 新增 `sim.skip_vote()`：只结束剩余投票时间；**已经投给谁就保留那一票**，没投才记
  `-1`；不修改任何 AI 票，也不是第二种票。
- 仅投票期、仅可行动者（活着且未濒死、非旁观）可用。

### 3. 会议信息三行（`js/ui/templates.js:315-319` / `js/game.js:6944-6949`）

- 报告地点 / 发起报告 / 伤者（死者 / 濒死者）。
- 案发地点按尸体 / 濒死者**清场前**的身体位置算（`open_meeting_kind` 新增 `room`/`in_corr`，
  `js/game.js:6908-6911` 同口径），走廊与未知位置分开标。

### 4. 8 个一键模板 + 对象 / 舱室下拉（`js/game.js:6812-6873 / 10878-10891`）

- 怀疑 / 投他 / 作证 / 看见钻管道 / 看见红光 / 看见出刀 / 我在… / 不是我。
- 句式逐条照抄 `meetTemplateText`；管道句只在该舱有管道口时附地点；
  对象下拉默认「未选择」，空对象点「怀疑」只提示「先选对象」、不发言。
- 「投他」只记公开意向（`meeting.player_intent`），**不替玩家落票**：
  2.5D 里它对应 `ctx.playerVote`（`js/game.js:6566`），真正落票只有点席位一条路。
  3D 原先在进投票期时自动 `cast_vote(player_intent)` —— 这是 2.5D 没有的机制，本批去掉。
- 下拉数据源：对象 = 活着的其他席位；舱室 = map_v2 十舱 + 走廊，默认当前舱。

### 5. 幽灵 / 旁观只读会议（`js/game.js:6933 / 6951-6961 / 7417-7419 / 7468-7469`）

- 玩家死亡或旁观时**面板保留**（可读发言 / 标题 / 伤者 / 结果），输入、模板、投票区全部关闭；
  旁观者可「跳过讨论（旁观）」，幽灵只能等计时器。
- 3D 原先玩家一死就隐藏整个会议面板，把复盘信息也一起藏了。
- 会议开场补一行系统提示（新增 `speech.sys_say`，2.5D `js/game.js:6971`）。

### 6. 发言流「↓N 条新发言」（`js/game.js:4954-4974`）

- 玩家滚上去读旧发言时**不强行跟底**，只累计「↓ N 条新发言」；点一下回到底部并清零，
  手动滚回底部也清零。3D 原先 `scroll_following=true` 永远跟底。

### 7. 结果页按「过程不可见」收敛（`js/game.js:7719-7736`）

- 只公布**聚合票数 + 弃权数 + 门槛结论 + 身份**；逐人投票矩阵不再出现在会议里。
- 登记：2.5D 的 `#e-votes` 逐人矩阵属**结算页**，3D 结算页尚未迁（见下「未同源」）。

### 8. 未同源（如实登记，不是立项）

- 结算页身份表 `#e-ids` 与逐人投票矩阵 `#e-votes`（会议里已按 2.5D 隐藏过程）。
- 局内小地图（2.5D HUD 右上常驻船体蓝图）。
- `humanT` + `HUMANISH`、`claimHist`、`seenT/lastBody/redSeen/avoidSeen` 等判定层残项（本批未动）。
- 三栏像素布局保留为表现层差异（功能项已齐）。

### 9. 本批实跑读数（2026-11-10）

| 项 | 结果 |
|---|---|
| `npm run check` | **6 通过 / 0 失败** |
| Godot 无头 + 真实窗口自测 | **27 项全部 exit 0 / 0 条 `SCRIPT ERROR`**（新增 `--meetuitest`） |
| `--meetuitest`（新增） | **23/0**：模板 8 个 · 空对象拦截 · 投他只记意向 · 讨论期投票/改票/弃权 · 跳过投票 · 夜会信息行 · 幽灵/旁观只读 · 新消息提示 |
| `--uitest` | 跳过按钮在屏内（rect `(460,170) 360×30`）· 点击推进 · 会后位移 3.20 |
| `--speechtest` / `--meetingtest` / `--b4test` / `--leadtest` | `11/0` · `ok=true` · `8/0` · `5/0` |
| `--navtest` / `--simtest` / `--b6test` / `--bottest` | `28/0` · `26/0` · `6/0` · `7/0` |
| `--tasktest` / `--reachtest` / `--floortest` / `--mgtest` | `26/0` · `26/0` · `0 失败` · `14/14 + 26/26` |
| 实拍 | `preview/screenshots/meet-discuss.png` / `meet-vote.png` / `meet-result.png` |

> 按 `AGENTS.md` §五.7：本批**没有采新的平衡读数**，改动依据全部是 `js/` 行号与
> 「真人会不会这样」，门禁/自测只回答「有没有写坏」。

## 2026-11-10 · 第 11 批：同步最新 2.5D + 出手/交互/旁观者三处现场问题

### 1. 基线重同步（上游又动了 14 个文件）

`baseline:sync`：16 个文件更新，清单 454。语义变化只有三处：

| 上游改动 | 3D 跟随 |
|---|---|
| `SKSanity.STAND`：`qual 3→0`、`ammo 7→5`、`med 5→3` | `space.json` / `sim.json` 自动重导；补给站桩改读新值 |
| 领申请单改成 **`grantQual` 交互即领**（无站桩、无小游戏） | 新增 `_claim_qual_now()`：`stand.qual<=0` 直接结算；**AI 侧 `ai_human` 同步**（否则 `start_doing(dur=0)` 报错、AI 永远领不到单，`--aittest` 的 `qual` 直接掉到 0） |
| 管道口换成写实精灵、`map.js` 掩体 124→123 | 重导 `map_v2.json`（123 件）；管道口是美术，3D 用 `prop_pipe_port.glb`，不动 |

`port-manifest` 的 `X-BIND` 末行随 `js/game.js` 缩短（11873 → 11870）。

### 2. 异形无法出手：机制没坏，是**没告诉玩家按哪个键**

先把链路钉成可执行断言：新增 **`--knifetest`**（异形开局 → 目标放在正前方 1.0m →
派发**真实左键** → 必须放倒 + 扣刀）。实测 `命中=true 剩余刀=0`，**判定链是通的**。

真正的问题是可发现性：3D 的出刀是**鼠标左键**（2.5D 是 `A`，但 3D 的 `A` 是左平移，不能复用），
而 HUD 只写了「WASD / E / 鼠标视角」，**压根没写攻击键**；刀用完时点击也毫无反馈。

- HUD 提示改为：`WASD 移动 · E 交互 · 鼠标左键出刀 · 右键开枪 · 鼠标视角 · P 设置 · Esc 释放鼠标`
- `_player_knife` 补「本夜的刀已用完（每夜 1 把，天亮补）」提示

### 3. 移除 Shift 冲刺

2.5D 只有 `MOVE_SPEED` 一档，没有玩家冲刺。删掉 `sprint_multiplier` 与 `KEY_SHIFT` 分支，
HUD 同步去掉「Shift 加速」。

### 4. 交互：按 E 没反应时给反馈 + 申请单交互即领

- `_collect_offers()` 为空时按 E 原本**完全静默**，玩家会以为"交互坏了"
  （2.5D 的用户裁定「点错要有反馈」同样适用于按键）。现在 toast：
  「附近没有可交互的东西 —— 走近设备 / 尸体 / 电闸 / 圆桌再按 E」。
- 圆桌领申请单：`stand.qual<=0` 时交互即领，不站桩（旧数据仍退回站桩）。

### 5. 旁观者：向上飞可透视、向下穿被挡住

用户口径：上层/下层只是"贴板"，作用是别让人掉进虚空；旁观者向上穿时要能看到完整剖面。

- `map_builder` 把天花板整层（舱室顶面 / 走廊顶面 / 灯带）收进 `_ceil_nodes`，
  新增 `set_ceiling_visible()`；
- `main._update_spectator_view()`：旁观者飞到 `CEILING_Y(3.2)-0.15` 以上 → 整层隐藏，
  回到舱内 → 恢复；非旁观者永远可见；
- `player.gd` 旁观者高度夹取 `y ∈ [0.35, 60]` —— **不允许穿到地板以下**。

实测截图（`--shot --above`）：俯视是一整张剖面，各舱按主题色分区。
新增 **`--specttest`**：舱内保持 / 飞越隐藏 / 下穿夹取到 0.35，**3 项全过**。

### 6. 明确不做（美术栏）

角色目前是 billboard 贴图；改成实际建模属「部分美术素材」允许差异，**排在美术栏**，
不在本批判定层。已登记 `parity-map.json#allowed_differences`。

### 7. 本批实跑读数（2026-11-10）

| 项 | 结果 |
|---|---|
| `npm run check` | **6 通过 / 0 失败** |
| Godot 无头自测 | **26 项全部 exit 0 / 0 条 `SCRIPT ERROR`**（新增 `--knifetest`、`--specttest`） |
| `--knifetest` | `异形=true 命中=true 剩余刀=0` |
| `--specttest` | `舱内保持=true 飞越隐藏=true 下穿 y=-5 → 0.35` |
| `--interacttest` | `领取 done=true qual_pending=0 qual=1`（交互即领） |
| `--aittest` | `prog=32/45 tasks=23 qual=9 supply=7`（AI 恢复领单/补给） |
| `--tasktest` / `--reachtest` / `--navtest` / `--simtest` / `--floortest` | 26/0 · 26/0 · 28/0 · 26/0 · 0 失败 |

## 2026-11-10 · 修复：开局会议「跳过讨论」被挤出屏幕（玩家卡在界面里）

**现场**：用户从桌面快捷方式启动后反馈「玩家仍然无法正常操作，以及跳不过界面」。

### 原因一（本次改动引入的回归）

第 4 批按真源把**投票区也显示在讨论期**（`js/game.js:7436` 允许讨论期先投）。
但会议面板是一个**居中、不滚动**的 `VBoxContainer`：
14 个席位按钮 ≈ 472px，加上标题/计时/发言流/输入框，「跳过讨论」被推到 **y≈850**，
而视口只有 720 —— 按钮在屏幕外，玩家点不到、也走不了（会议期间移动是锁的）。
实测自证：面板总高 ≈ 908px > 720px。

- `meeting_list` 包进 **200px 高的 ScrollContainer**（内部滚动），面板高度回到 ~600px；
- 整块内容再包一层 **ScrollContainer 兜底**，以后再长也够得着；
- **「跳过讨论」提到标题正下方**（`box.move_child(..., 2)`），并重排成
  标题 → 跳过 → 提示 → 发言流 → 输入 → 投票区 → 结果。跳过按钮是逃逸阀，
  不能放在可能被挤出的位置，也不该要求玩家先想到滚动；
- 新增 **`--uitest`**（真实窗口 + 真实鼠标事件）：
  `跳过按钮 rect=[P:(360,74) S:(560,30)] 视口=(1280,720) 在屏内=true` →
  真实点击后 `phase=""`（会议推进）→ `位移=3.20 ui_locked=false`。

### 原因二（用户此前启动的是旧仓）

桌面快捷方式原先指向 `新返航录\3d\preview`（分离前的 3D）。
旧仓**没有** `_want_mouse_visible()` / `_refresh_mouse_mode()`（全场 0 处），
只有 3 处零散的 `MOUSE_MODE_VISIBLE` —— 也就是分离后第 4 批修的那个 P0
（会议/轮盘/小游戏打开时鼠标仍被捕获，按钮点不动）在旧仓里**根本没修**。
快捷方式已在第 10 批改指向本工程；本次用**快捷方式里的绝对路径**复跑 `--uitest`，
按钮在屏内、点击有效、会议后可走。

### 本批实跑读数（2026-11-10）

| 项 | 结果 |
|---|---|
| `--uitest`（新增，真实窗口 1280×720） | `OK 0 项失败`：按钮在屏内 · 点击推进会议 · 会议后位移 3.27 |
| `--e2e`（真实窗口） | `open=true label=电路维修 kind=wire` → `closed=true unlocked=true` |
| `--uitest`（快捷方式绝对路径） | 同上，`OK 0 项失败` |
| 运行期脚本错误 | 0 条 `SCRIPT ERROR` |

## 2026-11-10 · 第 9 批：差异登记 + 全量验收

### 1. `allowed_differences` 逐条登记（4 → 7 条）

新增三条「为什么 2.5D 不需要」，都是本批真正**只属于 3D** 的东西：
尸体记忆的存储形态（`bodySeen` vs 2.5D 的 `mem` 时间线）、
小游戏卡片开着的移动锁（2.5D 点击移动被遮罩天然挡住，3D 的 WASD 必须显式锁）、
照明三态的场景落地（2.5D 用 canvas 遮罩，3D 要逐灯切 visible/emission/环境光）。

### 2. `PORT-DIFF-AUDIT.md` §C 逐条结清

7 条「未做」里 6 条标记为已落地并写明批号；只剩 `humanT`+`HUMANISH` 整套、
`claimHist`、`seenT/lastBody/redSeen/avoidSeen`、`buildMeetCtx/remainMs`（等价实现，记录口径差）、
parity 的 19 条非真源小数 WARN（已核对是真源字面量，不导出以免造第二份定义）。

### 3. 又清掉两条既有坏账

- `--taskflowtest`：与 `--mgtest` / `--devicetest` 同一个坑（会议开着就把卡片收掉），
  旧夹具恒报 `open=false`。补 `_finish_meeting(sim)` 后
  **`TASKFLOW ok=true open=true tIdx=0→1 prog=0→2 pts=2`**。
- `--e2e`：加 `--quit-after` 后正常走完，**`E2E open=true label=电路维修 kind=wire`**。
  （真源输入链：E → 小游戏 → 收起，不靠 `skip_discussion()` 作弊绕开局会议。）

### 4. 全量验收（2026-11-10 实跑，Node + Godot 无头）

| 门禁 | 结果 |
|---|---|
| `npm run check` | **6 通过 / 0 失败**（assets / import / port / events / lines / parity） |
| `npm run 3d:floor:check` | `FLOOR-SPEC OK（11 项）` |
| `npm run baseline:check` | `BASELINE OK 452 个文件` |
| `sync-cover-height --check` | `61 项 · 需更新 0 · 低于 1.7m 0 件 · 一致` |

| Godot 自测 | 读数 |
|---|---|
| `--tasktest` | `点=26 失败=0` |
| `--reachtest` | `点=26 走不到=0 缺设备=0` |
| `--navtest` | `pass=28 fail=0 walkable=5936` |
| `--simtest` | `pass=26 fail=0` |
| `--floortest` | `舱=10 失败=0`（原 4） |
| `--walktest` | `OK 1/1`（原恒 0.0） |
| `--powertest` | 三态 10/10 · 拉闸 3/6/9/9s · 合闸 4.5s |
| `--interacttest` / `--actiontest` | 全项 · `5/5 + 5/5` |
| `--devicetest` | `open=true locked=true → closed=true unlocked=true` |
| `--mgtest` | **`14/14` + `26/26` 标签**（原 `0/10`） |
| `--bottest` | `pass=7 fail=0` |
| `--b6test` | `pass=6 fail=0`（原 5/1） |
| `--leadtest` | `pass=5 fail=0`（新增） |
| `--meetingtest` | `ok=true ejected=1 buttons=14` |
| `--speechtest` | `pass=11 fail=0 席位号=4/4` |
| `--aittest` | `prog=23/45 meet=7 eject=5` |
| `--arttest` / `--audiotest` / `--roletest` / `--hometest` / `--b4test` | 全通过 |
| `--taskflowtest` | `ok=true`（原 `ok=false`） |
| `--e2e` | `open=true kind=wire`（原有超时坏账） |
| 运行期脚本错误 | 全部自测 **0 条** `SCRIPT ERROR` |

> 平衡读数：**本批没有采新的 1000 局**（§五.7 验收层边界）。
> `3d-sim1000.md` 仍是第七批之前代码的读数，不代表当前代码。

## 2026-11-10 · 第 8 批：保安机器人判定回归（losWalls / 追捕超时 / 押送 / 目击）

### 1. `losWalls`：保安不能用自己的机位挡住自己

真源 `js/engine/geo.js:155` 有独立的 `losWalls`（**只算墙体**），注释写明原因：
「保安机器人坐在安保位家具里，用 los() 会被自己的机位挡住」。
3D 的 `on_crime` 一直用 `nav.los()`（含掩体），于是保安在自己岗位上几乎永远"看不见"。

- `grid_nav.los_walls()` 新增；
- `bots.on_crime` 与新的 `bots.would_see()` 都改用它。

### 2. `would_see`：AI 出手前的预判

真源 `secbotWouldSee`（`js/game.js:4540`）：死亡 / 额度用完 / 超 6m / 挡墙 / 超出 180° 扇形
任一成立就看不见。3D 补同名能力，并在异形进入出刀距离前接上
（`js/game.js:4146`：看见就 `_secAvoidT=2.5` 收手一拍）。

### 3. 追捕状态机

| 项 | 3D 旧行为 | 现在的行为（真源） |
|---|---|---|
| 追不上 | 7 秒后**照样转押送** | 7 秒 → 放弃，`catch_state` 清空（`:secCatch=null`） |
| 贴到人 | 直接进 escort | 先 **press 0.9s**（压制） |
| 押送 | 人瞬移到机器人旁边 | **1.2s 定点 lerp**：人在起点与拘留位之间按进度插值 |
| 拘留证据 | 无 | 压制瞬间 10m / 到位 8m 内看得见的人记 `saw_detain`（同一夜同一人一次，**不写 known**） |

`_witness_detain` 走 `mind.note_sight` → `saw_detain` 不在 `ID_EVIDENCE` 里，
所以只加嫌疑、不确证 —— 被抓的可能是开枪的人类。

### 4. 本批实跑读数（2026-11-10）

| 项 | 结果 |
|---|---|
| `npm run check` | **6 通过 / 0 失败** |
| `--bottest` | **`pass=7 fail=0`**（新增「追捕 7 秒贴不到 → 放弃」断言） |
| `--b6test` / `--simtest` / `--leadtest` / `--speechtest` | `6/0` · `26/0` · `5/0` · `11/0` |
| `--mgtest` / `--actiontest` / `--powertest` / `--aittest` | `14/14` · `5/5` · 全项 · 运行期 0 条 `SCRIPT ERROR` |

## 2026-11-10 · 第 7 批：追猎距离 + 中文席位解析 + 时间词

### 1. `chaseKnown / chaseSus`：枪程外主动贴上去

真源 `js/game.js:3877`：异形挑到目标后，`d < shootR` 且看得见就开枪，
否则 `d < chaseR` 就**走过去**再开。`chaseR = 有确证 ? SHOT.chaseKnown(14) : SHOT.chaseSus(10)`
—— 射程是能力（与玩家同一个 `SHOT.range`），追不追是**意愿**。

3D 原先只有「枪程内 + LOS → 按概率开枪」，枪程外就完全不追，等于异形比真源更懒。
现补上 `real_d ∈ (shootR, chaseR)` → `sim.set_path` 贴上去，`_aiT` 节流 0.3s。

### 2. 中文席位号（`CN_SEAT`）

`lines.json#cn_seat` 一直有表（一→1 … 十→10），但 `parse_speech` **从没读过它**，
只会匹配 `"%d号"`。照真源 `js/t2/decision.js:96-99` 补两条正则：
- `(?:第\s*)?0?([1-9]|1[0-5])\s*(?:号|席)` —— 「7号」「07号」「第7席」「12号」；
- `([一二三四五六七八九十]{1,3})\s*(?:号|席)` + `cn_seat` —— 「第七号」「十二席」。

`--speechtest` 增 4 条断言（`7号 / 07号 / 第七号 / 第7席`），**4/4**。

### 3. 时间词：白天会议必须说「昨晚」

真源 `whenWord()` 无参、自己读 `G.meet.kind==='day'`（`js/t2/decision.js:52`）。
3D 的 `when_word(day)` 三个调用点全写死 `false`，等于白天开会也在说「今晚」。
新增 `speech._when_word()` 统一按当前会议类型取值。

### 4. 本批实跑读数（2026-11-10）

| 项 | 结果 |
|---|---|
| `npm run check` | **6 通过 / 0 失败** |
| `--speechtest` | `pass=11 fail=0 … 席位号=4/4` |
| `--simtest` / `--leadtest` / `--meetingtest` | `26/0` · `5/0` · `ok=true` |
| `--aittest` / `--bottest` / `--b6test` | 运行期 0 条 `SCRIPT ERROR` |

## 2026-11-10 · 第 6 批：照明三态 + 电闸证据链

真源 `refreshLight`（`js/game.js:678-690`）是**三态**：
`0` 常态（只亮 `light==='bright'` 的舱）· `1` 电路修好（全舱全亮）· `2` 拉闸（只剩会议室）。
3D 只有一个 `power_on` 布尔，等于把「电路修好」这一态压没了。

### 1. `sim.light_state`（0/1/2）

- `toggle_power` 照 `pullBreaker`（`:712-713`）：断电后合闸 → `power_fixed ? 1 : 0`；
  供电时拉闸 → `2`。`breaker_pulls` **只在真的拉黑那一次** +1。
- `power_on` 降级成派生值（`light_state != 2`），门的扫描锁、走廊灯、监控中断仍读它。
- `sight_range_at` 认 `light_state == 1` → 任何舱都算亮舱（原先只有静态 `light==='bright'`）。

### 2. 站桩时长改读唯一入口

新增 `sim.breaker_pull_time()`：断电 → `breaker_on_time()`（修好 3s / 否则 4.5s）；
供电 → `min(9, 3 × 本夜第 n 次)`。`main._breaker_offer` 不再自己算、也不再维护一份
`_breaker_pulls`（那份计数已经跟着「3D 没有夜循环」而不复位，是错的口径）。

### 3. 电闸证据链

`toggle_power` 补两段语义相反的广播（2.5D `noticeAction` + `credBroadcast`）：
- **拉闸断电**：6m 内看得见的活人走 `mind.note_sight(..., "saw_breaker")`，
  `ID_EVIDENCE` 含 `saw_breaker` → 写 `known`（身份级）；
- **合闸复电**：`mind.cred_broadcast("breakerOn")`，只加正向信任，
  **不给任何人洗清**（人类也会合闸）。

### 4. 场景侧

`map_builder.set_light_state(st)` 替代 `set_power(bool)`：舱灯按 `bright` 与状态逐舱判，
走廊灯 `st != 2`，常亮材质 / 环境光 / 补光同口径。`set_power(bool)` 保留为薄包装。

### 5. 本批实跑读数（2026-11-10）

| 项 | 结果 |
|---|---|
| `npm run check` | **6 通过 / 0 失败** |
| `--powertest` | `供电 10/10 · 断电 rooms_on=0 ambient=0.055 · 复电 rooms_on=8（常态只亮亮舱）· 三态全亮 10/10 · 拉闸 3/6/9/9s · 合闸 4.5s` |
| `--simtest` / `--b6test` / `--leadtest` | `26/0` · `6/0` · `5/0` |
| `--aittest` / `--meetingtest` / `--actiontest` / `--interacttest` | 运行期 0 条 `SCRIPT ERROR` |

## 2026-11-10 · 第 5 批：逐人跨夜复位（startNight / mindReset）

真源 `startNight` 每夜给**每个角色**清掉 60 余项「只属于这一夜」的状态
（`js/game.js:7800-7827`），`mindReset` 再单独处理跨夜记忆（`js/t2/ai.js:199-296`）。
3D 的 `_start_night` 原先只复位刀数与 `sabUsed`，其余全部跨夜残留 ——
第二夜开场就带着「昨晚的藏尸冷却 / 躲人计时 / 假动作名额 / 尸体报告计划」。

### 1. 新增 `sim._reset_agent_night(a)`

清掉：移动与站桩（path/pathI/moving/doing/_doing/target/_item）、拘留、
拖拽与红身与击杀加速与眩晕（drag/draggedBy/redT/rushT/stunT）、
报告与搜尸（_reportT/_reportBody/_reportMemo/_alienReports）、
藏尸（_hideCD/_hides/_dragTo）、破坏与管道（_botCD/_pipeCD/_pipePlan/_pipeSeeks）、
伪装（_fakeCD/_fakeKind/_sabDone/_sabT/_sabNight）、
狩猎（_killAt/_lightGo/_fleeT/_aiT/_rv/_lie/_retract/_busTarget/_stuckN/_lastSaw/
_avoid_i/_avoid_t/_tgtI）、当众合闸掷骰（_breakerWant/_breakerRollN）、
会议残留（accuse/accuseWhy/_abstain）；活人清 `reported`。

两处类型坑（都实测报过错，已写进注释）：
- `_breakerRollN` 存的是**夜号字符串**，置 0 会让 `String()` 构造失败，必须置 `""`；
- `_pipePlan` 的消费者是 `as Dictionary`，置 null 会「Invalid cast」，必须置 `{}`。

### 2. `mind.reset_night()` 补齐跨夜记忆口径

- **susNight 不再清零**：只保留「还活着的那批嫌疑」的夜戳
  （`keepSusNight`）。原先一律清空 → 第二天所有存量都被判成「本夜无新证据」，
  每夜多挨一次 `staleMul ×0.55`，跨夜嫌疑衰减比真源陡得多。
- **trust / grudge 按场 ×0.8 衰减**（`keepEmo`，低于 0.05 才忘）。
  原先这两条永不衰减，「被谁咬过／被谁护过」会一路背到终局。
- **ally 跨夜保留**、**credWhy 跟着 cred 裁条目**、**rev 每夜归零**、
  **bodySeen（第 3 批新增的尸体记忆）按夜清空**。

### 3. 仍未同源（如实登记，不含糊）

真源 `mindReset` 里还有 `humanT`（异形眼里「这人像人类」）、`claimHist`（口供史）、
`seenT` / `lastBody` / `redSeen` / `detainSeen` / `avoidSeen` ——
3D **没有这些字段，也没有对应机制**，本批没有凭空造一份空壳状态来「对齐」。
它们连同 `HUMANISH` 整套判定一起记进 `PORT-DIFF-AUDIT.md` §C，第 9 批统一登记。

### 4. 本批实跑读数（2026-11-10）

| 项 | 结果 |
|---|---|
| `npm run check` | **6 通过 / 0 失败** |
| `--simtest` / `--meetingtest` / `--speechtest` | `26/0` · `ok=true` · `11/0` |
| `--leadtest` / `--mgtest` / `--devicetest` / `--actiontest` | `5/0` · `14/14` · `closed=true` · `5/5` |
| `--aittest` / `--b6test` | `prog=23/45 meet=7 eject=5` · `6/0` |
| 运行期脚本错误 | 全部自测 **0 条** `SCRIPT ERROR`（修前 aittest 11 条 / b6test 1 条） |

## 2026-11-10 · 第 4 批：讨论期先投 + 听完改票

真源 2026-11-05 用户裁定：「**讨论阶段就可以投，投票结束前都可以改**」
（`js/game.js:7436-7439`）。3D 原先只有「讨论结束 → 一次性算票」，
既没有先投，也就没有「听完改票」这回事。

### 1. 收票相位放开

`cast_vote` 原来只认 `phase == "vote"`，现在 `discuss` 也收（`m.votes` 从会议开始就存在，
只有 closeVote 才结算，早投不会提前锁定）。会议 UI 的投票区也从「只在 vote 相位显示」
改成「讨论与投票都显示」。

### 2. `voteLean` / `castEarlyVotes`（`js/game.js:7239 / 7253`）

新增 `sim.vote_lean(a)`：确证 → s=3（why=known）、准-确证 → 2.5、假说竞争 → 弃权、
最强嫌疑 → 1。会议打开时 `cast_early_votes()` 把 **s≥2** 的人的票直接压上，
并写 `voteMeta = {v, s, why, chg, early, rev, t}`。
真源里的 `a.suspect` 档在 3D 不存在（第七批已删该字段），所以这一档没有搬。

### 3. `votePressure` / `bestVoteTarget` / `reconsiderVotes`（`7351 / 7367 / 7411`）

有人被公开点名后，`speech._emit_raw` 调 `reconsider_votes(说话人)`：
- 声势 = 本场针对该目标的公开指控 ×（我对指控者的 cred，下限 0.5），**封顶 0.30**；
- 新目标要盖过原判断 **0.10** 才动，再按 `0.35 + 0.34×cred` 掷一次；
- `why == known` 的人**不松绑**（确信不因声势改票）；
- 真改票走 `cast_vote`，由它记带 `from` 的 `vote_change`。

### 4. 早投票的保留闸（`js/game.js:7539-7542`）

进投票相位重新算票时，`early == 1` 且 `mind.rev` 没变过的人**保留原票**
（`earlyKept` 计数），不重新猜。

### 5. 本批实跑读数（2026-11-10）

| 项 | 结果 |
|---|---|
| `npm run check` | **6 通过 / 0 失败** |
| `--leadtest` | `pass=5 fail=0`（原 3 项，新增「讨论期先投」「known 早投票不被改」） |
| `--meetingtest` | `ok=true ejected=1 buttons=14` |
| `--speechtest` | `pass=11 fail=0` |
| `--simtest` / `--aittest` / `--b6test` / `--mgtest` | `26/0` · `27/45` · `6/0` · `14/14` |

## 2026-11-10 · 第 3 批：会议带头追责 + 快报案怀疑

### 1. `meeting.lead` 从来没有被写过

`sim_state.gd` 结算时读 `meeting.get("lead", -1)`，但**全工程没有一处写入**，
于是 `settle_accountability(top, votes, lead)` 永远拿到 -1、退回「第一个投票的人」，
带节奏的人根本没被追责，被冤枉的是随便一个投了票的。

照真源补三处：
- `open_meeting_kind` 建表时 `meeting["lead"] = {}`（目标 → 第一个带节奏的席位）；
- 新增 `sim.note_accuse(accuser, target)`：只记**第一个**，后来的不覆盖
  （`js/game.js:5181/5252/5294/5321` 四处写入口径一致）；
- 结算改读 `lead[被逐席位]`。

喊话侧接上五个入口：先发制人（opening）、反咬、队友洗白（bus）、COFRAME 协同附议、
以及通用确证指控。真源里「只有有依据的指控才算带节奏」，所以通用段按
`cat ∈ {known_accuse_hard, almost, evidence, confront, known_echo}` 或
`accuseWhy.solid` 判定，纯情绪指控不进 lead。

顺带补 `accuseWhy.solid`：真源的假口供是**具体**伪证（saw_knife / saw_pipe），
听众眼里算硬证词，所以 `liar / opening / bus` 三处置 `solid: true`
（`js/game.js:5178/5248`）。这让 `pub_solid_accusers` 从恒空变成真的能用。

### 2. `quick_report`：报案太快的人会被怀疑

真源 `js/game.js:5030-5041`：夜会、死者刚倒下 ≤10 秒时，
**先看见过这具尸体**的人类给报案人记 0.24 嫌疑（reason/kind 都是 `quick_report`）。

3D 缺两样东西，一起补：
- **「看见尸体」这条记忆本来不存在**。真源是 `observeBody` 往 `mind.mem` 写 `saw_body`；
  3D 没有 mem 时间线，改为 `mind.note_body_seen()` 落一张 `bodySeen` 表
  （按夜记「见过这具尸体没有」），不加嫌疑、不写 `known`。
  写入点在 `ai_human` 的尸体扫描里（5.4m + `ai_can_see`）。
- `_quick_report_sus()` 在夜会打开时按 `age = now − deathAt ≤ 10` 结算。

### 3. 夹具：`--b6test` 的射击站位被新掩体挡住

地图回归 `map.js`（124 件）后，旧硬编码站位 `(80,75)` 与保安机器人 `(86.6,69.4)`
之间多了 `armory_workbench`（81.5,70.4 / 3.2×1.8），`hit_bot` 的 LOS 判定直接返回 false，
`B6TEST 机器人 HP h1=false h2=false`。改为从 `map_v2.facility.secbot` 推出站位
（正下方 4.6m），地图再换布局也不用改测试。

### 4. 新增 `--leadtest`（3 项）

① `lead` 只记第一个指控者；② 快报案（3 秒）给目击者写入 `quick_report`；
③ 反例：慢报案（30 秒）不写。**3/0 通过**。

### 5. 本批实跑读数（2026-11-10）

| 项 | 结果 |
|---|---|
| `npm run check` | **6 通过 / 0 失败** |
| `--leadtest` | `LEADTEST pass=3 fail=0`（新增） |
| `--meetingtest` | `ok=true ejected=1 buttons=14 phase=vote` |
| `--speechtest` | `pass=11 fail=0` |
| `--aittest` | `prog=27/45 tasks=18 meet=5 eject=3` |
| `--b6test` | `pass=6 fail=0`（原 `5/1`，机器人 HP 夹具修复） |
| `--simtest` / `--actiontest` / `--mgtest` | `26/0` · `5/5 + 5/5` · `14/14 + 26/26` |

## 2026-11-10 · 第 2 批：小游戏 14 型补齐 + 失败惩罚全部取消

**触发**：同一批移植（用户 2026-11-10）。2.5D 在 2026-11-09 取消了全部小游戏失败惩罚，
并把 14 型玩法写进 `js/t2/minigame.js`；3D 还停在 10 型 + 四型降级 + 整组重来。

### 1. 失败惩罚：真源里 `settle(false` 已为 0 次

| 文件 | 旧行为 | 现在的行为（照真源） | 真源 |
|---|---|---|---|
| `mg_match.gd` | 错配 3 次 → `finish_fail("整组重来")` | 只提示「已配对的保留」 | `js/t2/minigame.js:887-895` |
| `mg_place.gd` | 形状不符 → `_reset_all()` 整组复位 | 只取消当前选中，已放的保留 | `:616-619` |
| `mg_wire.gd` | 接错线 → `_reset_all()` 整组复位 | 只松开当前线头，已接的保留 | `:515-518` |
| `mg_pour.gd` | 溢出 / 不足 → `finish_fail` | 把这一杯倒掉重注，任务不重置 | `:741-742` |
| `mg_swap.gd` | 型号不对 → `finish_fail` | 旧芯已取出，另选同型号即可 | `:775` |
| `mg_aim.gd` | 脱靶 → `_hits = 0` 清零 | 已中的保留，只提示 | `buildAim` 脱靶分支 |
| `mg_lever.gd` | 松手 → 每秒回落 2.4 | 松手保持进度，可分多次按住 | `:665-667` |

`mg_place.gd` / `mg_wire.gd` 里已无人调用的 `_reset_all()` 一并删除。

### 2. 补齐 4 型玩法（10 → 14）

新增 `mg_sequence.gd`（顺序记忆）/ `mg_sort.gd`（分拣）/ `mg_valve.gd`（阀门）/
`mg_code.gd`（编号），规则逐条照 `js/t2/minigame.js:944-1095`；
`minigame_layer.gd` 撤掉 `BASE_FALLBACK`（sequence→match / sort→place / valve→lever / code→sync），
14 型与真源 `BUILD` 一一对应。未知 kind 现在只回落到 place 并 `push_warning`，不再静默换玩法。

### 3. 任务专属配置接进玩法（此前 10 个 builder 全部丢弃）

真源每个任务点都有自己的参数（`cfg('n')` / `shapes` / `icons` / `lo` / `hi` / `rate` /
`hold` / `targets` / `init` / `tol` / `hits` / `speed` / `zone`），3D 却只按难度档取数 ——
例如「氧气循环」真源是 58~72、「培养罐补液」是 44~56，3D 一律按默认 52~68。

新增 `mg_base.cfg(key, fallback)` 读 `minigames.json#tasks[label]`，并接进
`place / match / level / pour / align / aim / sync / lever / wire` 九个 builder。

### 4. 两条夹具的静默失败（`--mgtest 0/10` 与 `--walktest 0.0m`）

两个夹具都在 `new_game` 开的 MEET_PRE（开局讨论）里直接操作：

- `_process` 里有一条「会议开着就把小游戏卡片收掉」（防两层 UI 叠），
  于是 `--mgtest` 每张卡在下一帧就被 `cancel`，**恒报 0/10 却 exit 0**。
- `player.ui_locked` 在会议期间为真，`--walktest` 按 W 恒测得 `distance=0.0`。

修法一致：先 `_finish_meeting(sim)`（不靠 `skip_discussion()` 作弊绕过），再测量，
并对结果双向断言、失败退出码 1。`--mgtest` 追加「26 个真实任务标签各按自己的 kind 打开」一段。

### 5. 顺带修掉一个真实缺陷：解题时玩家能走

`_tick_detained()` 每帧重算 `player.ui_locked`，但只算「拘留 / 濒死 / 会议 / 管道」，
**没算小游戏卡片**。于是 `_open_device` 设的锁在下一帧就被写回 false，
卡片挡着画面玩家仍能用 WASD 走开（2.5D 里 `#mg` 遮罩会把 attention 归零）。
现把 `mg_layer.is_open()` 并入同一判据。

### 6. 本批实跑读数（2026-11-10）

| 项 | 结果 |
|---|---|
| `npm run check` | **6 通过 / 0 失败** |
| `--mgtest` | **`MGTEST_RESULT 14/14 pass` + `MGTEST_LABELS 26/26`**（原 `0/10 pass`） |
| `--devicetest` | `DEVICE_COUNT 27 kinds=14` · `open=true locked=true` · `closed=true unlocked=true`（原 `open=false locked=true`） |
| `--walktest` | `WALKTEST OK 1/1`（原恒 `distance=0.0`） |
| `--actiontest` | `ACTION OK 鼠标相位 5/5 · 动作入口 5/5` |
| `--tasktest` / `--simtest` / `--bottest` | `26/0` · `26/0` · `6/0` |
| `--floortest` / `--powertest` / `--interacttest` | `0 失败` · 门/电闸全项 · 半径与轮盘全项 |

## 2026-11-10 · 第 1 批：基线重同步 + 地图数据回归单一真源

**触发**：用户 2026-11-10「检查三者关系，把 2.5D 里非美术、非按键操作的东西全部移植到 3D，
严格按照红线里的指令遵循」。本批只做**数据单一真源**，不采平衡读数、不立项。

### 1. 基线重同步（`npm run baseline:sync`）

- 第一次：26 个文件更新，清单 452 个文件 / 2026-11-10。
- 第二次：上游在我工作期间又改了 3 个文件（`js/data/map.js` 掩体 120 → **124**、
  `tools/blender-ship.py`、`assets/scene/v4/base-lit.png`），重同步后 3 个文件更新、449 个跳过。
  **上游是活动靶**：动数据前后都要 `baseline:check` + 与上游 diff，不能只对一次。

### 2. 地图回归单一真源（用户裁定「掩体回归 map.js，墙面装饰保留」）

| 文件 | 改动 | 真源 |
|---|---|---|
| `3d/tools/build-map-v2.cjs` | `cover` 从 `tools/ship-layout-plan.json` 改回**原样取 `map.json`**（⇒ `js/data/map.js`），删掉本脚本里的 `TIER_HEIGHT` / `SIGHT_MIN_H` / 高度表写出 | `js/data/map.js`（红线 §一.7「地图数据只放 map.js」） |
| 同上 | `decor` 仍取 `plan.rooms[].walls`（40 件墙面美术），`layout_v2` 元数据写明两条来源 | 用户裁定：墙面装饰属允许的美术差异 |

**为什么必须改**：`ship-layout-plan.json` 是方案层，上游 11-10 的五舱布局重构
（127 → 124 件）没有同步到它，3D 一直在跑 11-06 的旧布局。这是**第二份地图真源**，
与红线 §一.7 / §一.11 直接冲突；`PORT-DIFF-AUDIT.md` 之前没记这条。

**高度表归属**：`build-map-v2.cjs` 曾写名义 1.70，会把 `sync-cover-height.cjs`
从 GLB 实测出来的值覆盖掉。现已移除，高度只由 `measure-cover-refs.py → sync-cover-height.cjs`
一条链产出。

**核对（与同步后的只读基线逐值比，忽略美术变体字段 `theme/theme_id/v/tint_shift`）**：
`cover 124/124`、`facility 6/6`、`points 26/26`、`pipes 8/8`、`rooms 10/10`、
`corridors 11/11`、`walls 110/110` —— **7 个判定用键全部 0 差异**。
未引入新 `cover.kind`（58 类全在 `cover_refs` 与 COVER_HEIGHT v2 段内），不需要重出 GLB。

### 3. 清单与门禁的口径修正（不是放宽认领）

- `port-manifest.json`：`X-BIND` 末行 11877 → 11873、`V-MINIGAME` 末行 1184 → 1169。
  上游删代码后文件变短，行段越界被整体判废（表现是「119 / 1059 行未被认领」），
  **认领语义没变，只改末值**，两处 `notes` 写明是行列漂移。
- `D-MAP` 的 `target` 去掉 `layout-v2.json`：它由 `export-layout-v2.cjs` 从方案层另生成，
  **Godot 运行时无人读**（只读 `map_v2.json`），留作方案层留档，不是 `map.js` 的移植目标。
- `map_builder.gd` 两处过期注释（「方案层 127 件」「SDXL 材质本色」）改为当前事实。

### 4. 地板口径：导出器把四个舱指到已删除的贴图

`export-floor-spec.cjs` 的 `ROOMS` 表还写着 `floor-power.png` / `floor-engine.png` /
`floor-hazard.png` / `warehouse-floor.png` —— 这四张 SDXL 图**已从磁盘删除**，
`bake-qwen-room-skins.py` 2026-11-09 起 10 舱全覆盖。重跑导出会把 `floor_spec.json`
指到不存在的文件。

- 四舱改为 `qwen/<rid>/floor.png`（与磁盘、与 bake 脚本一致）。
- 补 `qwen_rooms_override` 出处标记：bake 脚本会写这段、导出器原先不认，导致 `--check` 永远不一致。
- `--check` 从**比字节**改为**比规范化后的值**：同一文件有两个写入方
  （Node 出 LF + 末尾换行，Python 在 Windows 出 CRLF 且无末尾换行），按字节比会把纯换行差异报成真源漂移。
- `map_builder.gd` 注释里的 SDXL 表述清理（红线 §一.6：SDXL 已退役）。

### 5. 四条贴图没导入 → `--floortest` 的既有坏账清掉了

`--floortest` 原报 `失败=4`（power / engine / armory / warehouse「场景里找不到贴图」），
`AGENTS.md` §6.3 记为原仓同样失败的既有坏账。**根因不是判定**：四张 `qwen/<rid>/floor.png`
在磁盘上，但没有 `.import` 边车，Godot 从未导入，`_material()` 退回纯色。

- 跑 `GODOT --headless --path 3d/preview --editor --quit` 补齐导入（63 步）。
- 跑 `patch-tex-vram.py`：29 个 `.import` 归一到 BPTC/BC7 + mipmap；再导入一次后
  110 个 `.import` **已是最新**（幂等）。
- 结果：`FLOORTEST 舱=10 地面网格=48 失败=0`。

### 6. `--walktest` 是一条静默失败的验收

旧夹具在 `new_game` 开的 MEET_PRE（开局讨论）里按 W：会议期间 `player.ui_locked`
把 `velocity` 钉成 0，于是**恒打印 `distance=0.0` 且 exit 0**，`AGENTS.md` 却把它
当成「4.2 m/s」的验收。改成先 `_finish_meeting(sim)`（与其他自测同一口径，不靠
`skip_discussion()` 作弊绕过），再量真实按键位移，并对「有没有动」与「有没有超过真源移速」
双向断言、失败退出码 1。

> 顺带核实：`space.json` 的 `move.speed = 4.0` 与真源 `js/t2/space.js:106 MOVE_SPEED: 4.0` 一致；
> `AGENTS.md` 里写的 4.2 / 2.7 是过期文案（`js/` 只读，未改）。

### 7. 本批实跑读数（2026-11-10）

| 项 | 结果 |
|---|---|
| `npm run check` | **6 通过 / 0 失败**（port:check 0 错误 1 警告：`cover_refs.json` 缺 schema_version，legacy） |
| `npm run baseline:check` | `BASELINE OK 452 个文件 · 快照 2026-11-10` |
| `npm run 3d:floor:check` | `FLOOR-SPEC OK（11 项）` |
| `node 3d/tools/sync-cover-height.cjs --check` | `61 项 · 需更新 0 项 · 低于 1.7m 0 件 · 一致` |
| `--tasktest` | `TASKTEST 点=26 失败=0 []` |
| `--reachtest` | `REACHTEST 点=26 半径=2.0m 走不到=0 缺设备=0` |
| `--navtest` | `NAVTEST pass=28 fail=0 walkable=5936 cells=164x157` |
| `--simtest` | `SIMTEST pass=26 fail=0` |
| `--floortest` | `舱=10 地面网格=48 失败=0 []`（原 失败=4） |
| `--walktest` | `WALKTEST OK 1/1 · distance=4.00m/1.0s · ui_locked=false`（原恒 0.0） |
| `--powertest` | 门 2.0s scan 放行 / 离开重锁 / 复电 10 舱 22 廊 / 合闸站桩 4.5s |
| `--interacttest` | 半径 2.0/2.0/2.3、管道冷却 20、圆桌领申请单、轮盘 2/2 |
| `--actiontest` | `ACTION OK 鼠标相位 5/5 · 2.5D 动作入口 5/5 齐备` |
| `--mgtest` | **`MGTEST_RESULT 0/10 pass`**（既有坏账，第 2 批目标，未修） |

## 2026-11-09 · 清理：SDXL 舱室图与旧批次读数（不动执行层）

**只做清理：不改任何判定、不采新读数、不动运行时贴图。**

- 删 `assets/refs/*.png` 10 张（4.6 MB，本地 SDXL 舱室参考图）与
  `assets/renders/covers-*.png` 10 张（17 MB，由前者派生的掩体检查板）；
  保留 `refs/*.json`（模型 / seed / prompt），复现命令见 `ASSETS.md` 对应小节。
- 删 `preview/reports/3d-simbatch-{15,20,30,40,100,200}.md` 6 个旧批次读数；
  本文件与 `MIGRATION.md` 里的引用已改为内联读数并注明「报告已清理」。
  保留 `3d-sim1000.md`（当前基线）与 `simdiff-20261108.md`（同 seed 契约夹具）。
- **未动**：`preview/assets/textures/**`（运行时贴图，183 MB 千问 + 舱室 + 面板）、
  `preview/screenshots/`（本机开发截图，gitignore）、`preview/assets/models/`（运行时模型）。
- 基线侧 `docs/` 移出与清单 555 → 451 见根 `CHANGELOG.md`、`BASELINE.md` §6。

## 2026-11-09 · 第七批：拨乱反正（用户「逐条核实，先拨乱反正」）

**本批只做「回归 2.5D 真源」，不以任何读数论证改动、未采新平衡读数、未自行立项。**
核实清单见 `3d/PORT-DIFF-AUDIT.md`（逐条带真源行号）。

### 1. 核实结论（推翻前几批留下的失实记录）

- `COFRAME` 协同诬陷 / `MISLEAD.bus` 大义灭亲 / 构陷编排 / 领袖指令：**已接**（`speech.gd:191/318/106/394`）。
- RUSH 逃逸 / 击杀加速 / 目标承诺 / 管道突袭 / 异形开枪 / 红身：**全已接**
  （`ai_alien.gd:60/290/338`、`sim_state.gd:500`）。`port-manifest S-COMBAT` 说「未接」失实。
- `MEET.reveal` 结果公布 / pre/day/night 三类会议 / 紧急按钮 / `settleAccountability`：**已接**。
- `parity-map` 的 `SKT2AI` 是 38 synced / 0 pending；`rules.json#tables.SKSanity` 42 张表齐全。
- **决定性事实**：「进攻链没补齐所以不启用每夜 1 把刀」的前提被证伪 —— 能力都在，
  唯独限制被人为拿掉。
- 真正缺的：`VOTE.change` 讨论期改票时序、`chaseKnown/chaseSus` 追猎、`lightState` 三态、
  `startNight` 逐人重置、`CN_SEAT` 中文席位解析、`buildMeetCtx`/`remainMs`。

### 2. 执行层改动（每项写明真源）

| 文件 | 改动 | 2.5D 真源 |
|---|---|---|
| `sim_state.gd::knife()` | 恢复**每夜 1 把刀**硬 gate（先前只发 `knife=1` 从不消费） | `js/game.js:4225/4232/7801` |
| `ai_human.gd::_decide()` | 接通 `_shoot_target()` **死代码**：有子弹 + 射程内高置信目标 → `sim.shoot()`，用既有 `_aiT` 节流 | `js/game.js:2838-2870` |
| `mind.gd::reset_night()` | `heard` 改回**整局滑动窗口**（原每夜清空，正是真源明确否决过的方案）；`almost` 改回跨夜保留 + `eval_almost` 就地推翻 | `js/t2/ai.js:253/270` |
| `sim_state.gd::cast_vote()` | 修复 `votes.has()` 写在赋值之后恒为 true 的 bug；按真源只在**真改票**时记 `vote_change` 并带 `from` | `js/game.js:7398` |
| `main.gd::_run_sim1000()` | 观察窗口 26 夜 / 20000 tick → **15 夜 / 17250 tick**，报告口径同步 | `js/game.js:11054-11058` |

### 3. 测试夹具（不是改判定）

`--b6test` 原断言「`vote_change` 事件存在」是靠上面那个 bug 通过的（AI 两轮投票覆盖时
刷出一串假改票）。修复后按真源显式构造 vote 相位、让 0 号先投 2 号再改投 3 号。
`B6TEST 6/0` 通过。**没有为了自测变绿去回退任何判定。**

### 4. 契约与文档拨正

`port-manifest.json` 8 条 notes 更正（A-COGNITION 的「25 pending」、S-SPEECH/S-DECISION/
S-MEET/S-NIGHT 的「未迁」、S-COMBAT 的「人类 AI 会开枪」等）；`MIGRATION §9.3` 标注为
历史诊断并列出核实结果。失实清单见 `PORT-DIFF-AUDIT.md` §4。

### 5. 验收（回归防护，事后登记，非改动依据）

- `npm run check` **6 通过 / 0 失败**；`BASELINE OK 555`；§一 12 条红线与原仓逐字一致（3558 字符）。
- 19 项 Godot 无头自测中 **16 项 exit 0 且断言通过**：`SIMTEST 26/0`、`B6TEST 6/0`、
  `MEETINGTEST ok=true`、`SPEECHTEST 11/0`、`ACTION OK`、`BOTTEST 6/0`、`B4TEST 8/0`、
  `NAVTEST 28/0`、`TASKTEST 26/0`、`ROLETEST 4/0`、`HOMETEST 6/0`、`REACHTEST 走不到 0` 等。
- **4 项既有坏账仍在，未修**：`--mgtest` `0/10 pass`（exit 0 假绿）、`--taskflowtest` exit 1、
  `--floortest` 失败 4（exit 0 假绿）、`--e2e` 60s 超时 exit 124。
  另有 `--devicetest` / `--walktest` / `--aittest` 是无断言的遥测打印。
  这四项在**原仓分离基线上逐字同样失败**，不是本批回归；按 §一.4 如实列出，
  且**本批未为了让它们变绿去改任何判定**。
- `3d:parity:check` 通过，脚本自报 **18 个**非真源小数 WARN（列前 12）；文档旧写 16 个已更正。
- **未采新的平衡读数**：`3d-sim1000.md` 是第七批之前代码在 26 夜窗口下的读数，
  不代表本批代码；观察窗口已拨回 15 夜，与旧报告不再同口径。


## 2026-11-09 · 第六批：AI 视野按 2.5D `observerVisionAt` 正向移植

> 用户约束：「不要违反架构红线，不要让验收层反过来影响执行层」。
> 本批 **T2 每处改动的唯一依据是 `js/` 真源行号**；**未采新的平衡读数**，
> 不以读数 / 门禁结果论证「某项改动该做」；门禁与自测只回答「有没有写坏」。
> 跨批次反馈显式登记：第五批曾把 20 局读数写成改动依据（批内回写），本批已在其 §3 更正。

### 1. 依据（全部来自 2.5D 真源，无一处来自本工程读数）

| 真源 | 语义 |
|---|---|
| `js/game.js:1784` `observerVisionAt` | 同亮区整片可见（不看距离/朝向/LOS）；亮舱 ↔ **相连**走廊要 LOS；近身圆；7 格 60° 手电锥 |
| `js/game.js:1805` `agentAimAng` | 动作 > 当前目标 > 下一段路径 > 上一次朝向 |
| `js/game.js:10644` `litZoneAt` | 亮区标识 `r:<room>` / `c:<corridor>` |
| `js/game.js:686` `G.corrLit=(st!==2)` | 断电时走廊全灭 |
| `js/t2/space.js:71` `corrJoinsRoom` | 走廊 a / b 端点是否含该房间 |
| `sim.json#rules.SIGHT` | `humanLightR 7 / humanDarkR 2.3 / alienDarkR 3.5`（早已由 2.5D 导出，本批未新增常量） |

3D 修复前 `ai_can_see` 只是近身圆近似：给**所有**分支加了全局 LOS（同亮区本不该要 LOS）、
没有手电锥与朝向、亮舱 ↔ 走廊不检查是否相连、观察者是不是异形也不参与判定。
`MIGRATION.md` §10.4 当时把这个「口径差」留成注释，本批按真源消除。

### 2. 改动（T2 → 只搬语义）

- `grid_nav.gd` 公开 `corridor_at()` 只读查询；几何判定仍只放几何层，不复制到规则层（红线 7）。
- `sim_state.gd`：`ai_can_see(observer, p)` 按 `observerVisionAt` 重写；新增
  `agent_aim_ang / lit_zone_at / corridor_by_id / corr_joins_room`；
  `tick_agents` 记录 `aimAng`；agent 初始化加 `aimAng`。
- **12 个调用点全部改传观察者 agent**（旧签名只传坐标，拿不到 alien 标记与朝向），
  保持「唯一视野判据」，不留第二套兼容口径。
- `main.gd::_sync_player_pos` 由 view 层把朝向写进 `me.aimAng`（intent），sim 不读鼠标
  —— 符合 `3d/ARCHITECTURE.md` §3 硬规则 1「输入只进 intent，由 view 层翻译」。

### 3. 明确边界（本批**没有**做的事）

- 未采新的 20 局平衡读数；**没有任何一处改动是以读数为依据做出的**。
- 未为了让自测 / 门禁变绿而改任何判定；`_finish_meeting` 夹具属验收层自身对齐
  `MEET_PRE` 真源语义，不触及执行层。
- 未写「某读数 > 0 算通过」，未把读数当达标线。
- **未自行列出下一批立项**（原仓 `ARCHITECTURE.md` §8：提问清单是唯一建议通道）。

### 4. 回归防护读数（T3 事后登记，非改动依据）

`npm run check` **6 通过 / 0 失败** · 13 项 Godot 自测 exit 0 · `BASELINE OK 555 文件`。
平衡类读数沿用上批历史基线，仅作对照，**不作为本批输入**。

## 2026-11-09 · 第五批：行为层根因 ②「医疗无人机救起链」按 2.5D 完整移植

> 用户指令「继续」。按第四批末尾的顺序，先攻 `MIGRATION.md` §10.5.1 里证据最强、
> 与构陷量无关的那条长期缺口：2.5D 救起 3.34 次/局 vs 3D 1.50 次/局。
> 本批仍只在 `新返航录 3D 版/` 内改动，原仓零改动。

### 1. 诊断：五处判定与 2.5D 不一致

| 项 | 2.5D（`js/game.js`） | 3D 修复前 |
|---|---|---|
| 电量 | `MEDBOT_CHARGES=2`，`startNight` **每夜**复位（L7829） | `med_uses` 只在 `setup()` 归零 → **整局最多救 2 次** |
| 治疗 | 近身悬停 `MEDBOT_HEAL_TIME=7` 秒才拉起（L4732） | 贴到 1.2 米**立刻**救 |
| 目标范围 | 只响应**医疗间内**的濒死者 `inMedRoom()`（L4698） | 全船任意濒死者（远距离飞行） |
| 飞行 / 触摸半径 | `MEDBOT_FLY_SPEED=4.6` / `MEDBOT_TOUCH_R=1.15` | 4.2 / 1.2（硬编码） |
| 救起后 | `MEDBOT_REVIVE_STUN=3` 秒只禁移动；解除拖拽；`revive` 事件带 method/stun/room/x/y | 全无 |

另外两处**连带缺口**：2.5D 有「没医疗包但无人机可用 → 把视线内濒死者拖进医疗间」的
人类 AI 行为（L2875），3D 没有；而 3D `start_drag` 又用一句 `if b.alive: return false`
**禁止拖还活着的濒死者**，导致既有的 `release_drag#dragToMed` 分支是死代码。

### 2. 修复（数值全部走真源，不自造）

- `3d/tools/export-space.cjs` 新增 6 个具名常量导出：`med_heal_time / med_touch_r /
  med_fly_speed / med_stun / hp_secbot / hp_medbot`；重导 `space.json`（fail-loud）。
- `bots.gd`：新增 `reset_night()`（电量 / 次数 / 死亡标记 / 押送 / 治疗计时每夜复位）；
  `_tick_med` 按 `medbotTick` 重写（沿用目标 → 飞到 `touch_r` → 读条 `heal_time` → 才救）；
  `_find_downed` 只收医疗间内的濒死者。
- `sim_state.gd`：`revive(agent_i, method, stun)` 统一玩家 / AI / 无人机三条入口，补事件字段
  与「只禁移动」的 `stunT`；`_start_night` 复位 `bot_hp / dmg / power_fixed` 并调
  `bots.reset_night()`；`start_drag` 允许濒死者、写 `draggedBy`、同步 `bodyPos`。
- `ai_human.gd`：补 2.5D L2875 的拖救行为 + `_medbot_usable()`（排除自己刚打倒的人）。

### 3. 一次失败的 A/B（如实记录，没有粉饰）

第一次只做「每夜重置 + 7 秒读条」，**却保留了 3D 原有的全船目标范围**，同 seed 20 局：

| 指标 | 修复前（20 局小样本，报告已清理） | 第一次改动后 |
|---|---:|---:|
| 人类胜率 | 20.0% | **15.0%** |
| 救起 / 20 局 | 30 | **3** |
| `block_cap` / 20 局 | 1209 | 1661 |

无人机飞不到远处的濒死者，7 秒读条还没走完人就失血死了。补齐的三项
（只救医疗间 / 拖救 AI / 允许拖濒死者）依据是 `js/game.js` L4698 `inMedRoom`、
L2875 拖救、L2456 `startDrag`；随后同 seed 复跑 20 局，读数见 §5。
**更正（第六批）**：本段原文用「据此」把 A 批读数写成了改动的因果依据，
属原仓 `ARCHITECTURE.md` §8 禁止的批内回写；现改为「唯一依据是真源行号，读数只作事后记录」。

### 4. 自测

- 修 `--bottest` / `--b4test` / `--b6test` 三个**既有坏账**（`MEET_PRE` 接入后没更新，
  原仓同批逐字同样失败，非本批回归）：统一用 `_finish_meeting()` 夹具收掉开局会议；
  `--bottest` 医疗循环 60 → 110 帧，覆盖 7 秒读条；`--b4test` 的会议子夹具、
  `--b6test` 的旁观子夹具各自补收束。
- `--bottest / --b4test / --b6test / --simtest / --aittest / --actiontest` 全部 exit 0。

### 5. 实测读数（同 seed 20261108 起 20 局，dt=0.1）

| 批次 | 人类胜率 | 平均夜 | 救起 /20 局 | 存活人类 | `block_cap` |
|---|---:|---:|---:|---:|---:|
| 修复前（历史基线） | 20.0% | 5.45 | 30 | 1.30 | 1209 |
| A 每夜复位 + 7 秒读条 | 15.0% | 5.90 | 3 | 0.75 | 1661 |
| B + 只救医疗间 / 拖救 AI / 允许拖濒死者 | 35.0% | 4.60 | 1 | 1.45 | 1356 |
| **C + AI 到医疗间放下收口（最终）** | **35.0%** | **4.55** | **1** | **1.50** | **1358** |
| 2.5D 参考 | 49.9% | 4.72 | ≈67（3.34/局） | — | — |

**结论（不粉饰）**：

- 整体平衡明显向 2.5D 靠拢：胜率 **+15pp**、平均夜 **5.45 → 4.55**（2.5D 4.72）、
  存活人类 1.30 → 1.50、驱逐命中率 30.8% → 35.5%。
- 但 **救起次数从 30 掉到 1**。也就是说改善主要来自「每夜状态复位（电量 / 机器人 HP /
  故障不跨夜 / 电闸标记）」，**不是医疗救援链生效**。救援链的代码已按 2.5D 补齐，
  实测却几乎不触发，根因未定位 —— **本批不宣称根因 ② 已解决**。
- 下一批先加埋点量化三处：拖救 AI 触发次数、`_find_downed` 命中次数、
  濒死者从倒下到死亡的实际存活时长；再判断是路径 / 半径 / 注意力优先级哪一段断了。
- `npm run check` 6/0、12 项 Godot 自测 exit 0、`BASELINE OK 555 文件`。

## 2026-11-09 · 第四批：玩家动作全集接通 + 真实输入链闭环（用户「参照 2.5D 全部移植」）

> 用户指令：「开始修，参照物为 2.5D。除了美术和操作按键之外全部移植。」
> 本批只在**分离后的独立工程 `新返航录 3D 版/`** 内改动，原仓不动。

### 1. 输入链：UI 打开时鼠标必须释放（P0）

- 旧缺陷：交互轮盘 `ui_wheel.gd` 打开后 `Input.mouse_mode` 仍是 `CAPTURED`，光标锁在屏幕中心，
  轮盘按钮点不动；而 `--e2e` 用 `skip_discussion()` 绕过开局会议，于是「门禁绿、真人卡住」。
- 新增 `main.gd::_want_mouse_visible()`（纯函数，可断言）与 `_refresh_mouse_mode()` 每帧兜底：
  **会议 / 轮盘 / 小游戏 / 管道 / 设置 / 信息面板**任一打开 → `VISIBLE`，否则 `CAPTURED`。
  各处零散赋值即使漏写也会被纠正。
- `_input()` 补上 2.5D `SKSettings.isOpen()` / `G.inspect` / `G.camView` 的同款守卫：
  面板在最上层时只放行 `P` / `ESC`，其余按键不落到对局。

### 2. 补齐 2.5D `collectInteractions` 里 3D 缺的 5 类动作

以 `js/game.js` 为参照，全部复用已有 `sim` 判定与 `space.json` 数值，**不自造状态 / 计数器 / 阈值**：

| 2.5D 动作 | 出处 | 3D 落地 |
|---|---|---|
| 施救（医疗包 + 濒死者 + `STAND.revive`） | `rescue()` | `sim.player_revive()`，站桩后扣 1 包 |
| 查看尸检 / 伤情记录 | `openBodyCard()` | `_open_body_card()`，字段口径照抄 |
| 全船监控（断电时信号中断） | `openCams()` | `_open_cams()`，读监控台 facility |
| 异形破坏（每夜一次、bridge 禁破坏） | `openSabPick()` | `sim.player_sabotage()` + `sabUsed` |
| 机器人状态查询 | `interact()` 尾部 | 轮盘项，`bot_hp` / `bot.*_uses` |

- `sim_state.gd` 新增 `player_revive()` / `player_sabotage()`：把玩家判定与记账收口到 sim，
  与 AI 的 `_finish_doing` 完成链同口径（扣医疗包、`cred_broadcast("revive")`、
  `sabUsed` 每夜由 `_start_night` 重置）。
- 信息面板是 2.5D `#b` / `#cam` 的 Control 版，**只呈现、不参与判定**；画法属允许的美术差异。

### 3. 数据同源、门禁与自测

- `npm run 3d:export:rules` 重导 `rules.json`，消除 `sources` SHA 漂移；
  `spec/port-manifest.json` 的 `X-BIND` 补认领上游新增的 111 行 `_t` 调试查询接口。
- **npm 门禁：6 通过 / 0 失败**（分离时遗留的 2 项失败已清）。
- 新增 `--actiontest` 真实输入链自测：鼠标相位 5/5 + 2.5D 动作入口 5/5，
  **不调用 `skip_discussion()` 作弊**。
- 修 3 个既有坏掉的自测（`--simtest` / `--meetingtest` / `--speechtest`）：
  它们假设「开局直接进夜」，而 `new_game()` 按 2.5D 会先开 `MEET_PRE`、`dawn()` 会开 `MEET_DAY`；
  新增 `_finish_meeting()` 夹具把会议正常走完（用 2.5D 也有的 `skip_discussion`），不改判定。
  **原仓同批逐字同样失败**，确认不是本批回归。
- 修复后读数：`SIMTEST 26/0`、`ACTION OK`、`--interacttest` / `--mgtest` / `--tasktest` /
  `--devicetest` / `--navtest` / `--meetingtest` / `--speechtest` 全部 exit 0。

### 4. 仍未同源（下一批，按证据强度）

1. **行为层**：同 seed 人类胜率 2.5D 49.9% vs 3D 20.0%；三条根因见 `MIGRATION.md` §10.5.1
   （`known` 写入量 / 医疗无人机救起 1.5 vs 3.34 / `block_cap` 60.5）。
2. **机制缺口**：小游戏 14 型只做 10 型；`VOTE.change` 改票与早投、`MISLEAD.bus`、
   `COFRAME` 附议名额；报告额度与播报文案。
3. **事件层**：信封字段 3D 34 / 2.5D 40，kind 3D 18 / 2.5D 26（`simdiff-20261108.md`）。
4. **自造数值**：`check-parity` 仍有 16 个非真源小数 WARN（1.1 / 0.94 / 0.26 / 5.4 / 5.8 等）。

## 2026-11-09 · 第三批：构陷 / 领袖 / 位移链补齐（用户「继续把机制补齐」）

- **补齐内容**（全部读 `rules.json`，数值不在 GDScript 抄）：
  构陷编排 `plan_alien_deception` / `plan_mate_bus`（FRAME / COFRAME / SOCIAL.hotMin / 反咬 0.65）、
  先发制人 `plan_first_accusation`（FIRST.chance，saw_red 0.7 / saw_pipe 0.3）、
  领袖剧本（号召力重尾 + `schedule_leader_orders` + 服从/拒绝 + `push_endorse`）、
  目标承诺（HUNT.memorySec 粘性）、管道突袭（PIPE）、拖尸藏尸、拆医疗无人机、
  异形误导报告（1 次/异形 · 20%）、`_flee_from`、拖尸进医疗间、合闸指派、搜尸。
- **修了一处顺序错位**：2.5D 是「先先发制人定调 + 打 `accuseWhy.opening` → 再构陷，
  且构陷跳过已 opening 的异形」（js/game.js:5077 → 5767）。3D 之前反着写，
  同一只异形会在一场会里被二次改写口供（说 A 投 B）。已按真源顺序改正。
- **读数（同 seed 20261108+g）**：40 局 **人类 20.0% / 异形 70% / 超时 4**；
  修顺序后 20 局 **20.0% / 80% / 0**。构陷量本身与 2.5D 同源，胜率却从上一批的 68% 掉到 20%
  —— 瓶颈不在构陷频率，而在 3D 人类写不出足够的 `known` 反证 + 医疗无人机救起只有 1.5/局
  （2.5D 3.34）。逐项证据与下一批优先级见 `MIGRATION.md` §10.5 / §10.5.1。
- **门禁**：`npm test` 899/0；`3d:parity`（63 synced / 7 adapter / 0 pending）、
  `3d:lines`、`3d:port`、`3d:events` 全绿。剩余 16 个非真源小数是 parity 的 WARN 级
  （5.4 / 5.8 已注明同源行号 js/game.js:2489/2505/2513）。
- 另修 `main.gd:893` 的 `var dist := dev.reach_dist(...)` 类型推断报错（Variant 无类型）。

## 2026-11-09 · 第二批：任务点走不到 + 背景音乐没接（用户「只能移动、任务点交互不了、音乐听不到」）

> 用户指令：「优化一下音乐听不到的问题，以及无法除移动之外的操作。无法任务点交互。」
> 前置事实：2.5D 门禁本批复跑 **899 通过 / 0 失败**，所以按键与任务交互在 2.5D 是好的，
> 这三条都落在 **3D 预演** 上。

### 1. 任务点按 E 没反应：交互距离量错了

- **根因**：`main.gd::_collect_offers()` 用 `dev.distance_to(pos)` —— 到**设备节点中心**的直线距离。
  货架 `1.4×6.9`、手术台 `3.6×2` 这类长条设备，人贴着机身站著，中心却在 2 m 外，
  于是半径 2.0 m 永远不成立，E 静默无效。2.5D 侧对圆桌用的是**到矩形的钳位距离**
  （`INTERACT 圆桌领取点 = 圆桌下沿外 1.2`），3D 没照搬，这是漏移植不是设计。
- **实现**：`device.gd` 新增 `reach_dist(p)` —— 按 `global_transform * _model_bounds()` 的
  XZ 矩形算钳位距离（包围盒当帧没刷新时退回中心距离）；`_collect_offers()` 与交互提示
  `hint` 都改读它。**没有放宽任何半径数值**，`reach.fix` 仍然 2.0 m（读 space.json）。
- **新增 `--reachtest`**（`main.gd::_run_reachtest`）：逐点扫描交互半径圈内的**可走格子**，
  要求至少一格 `nav.is_free` 且钳位距离 ≤ 半径。
  ⚠ 不能用 `nav.nearest_free()` —— 它按环返回的第一个自由格不一定最近，第一版就被它骗出 1 个假阳性。
- **读数**：改前 **走不到 3 / 26**（13 手术台校准 2.03m、22 货架校准 2.80m、24 货箱封条 2.12m），
  改后 **走不到 0 / 26**；`--tasktest` 仍 26 点 0 失败、`--interacttest` 全绿。

### 2. `--e2e` 从来没有真的验到 E

`_run_e2e()` 在**开局讨论还开着**的时候注入 E，而 `_update_interaction()` 第一行
`if not sim.meeting.is_empty(): return` —— 注入的按键被整段吞掉，读数一直是 `E2E open=false`，
却被当成「E 路径通过」。现在先 `sim.skip_discussion()` 并等会议自己收束，再注 E。
读数：`E2E 会议已收束 · 等待 0.1s · night=1` → `E2E offers=["task-7"]` → **`E2E open=true`** → `closed=true unlocked=false`。

（顺带确认：会议期间 `player.ui_locked = true` 是**已经**冻结移动的，与 2.5D「会议冻结世界」一致，
所以「只能移动」不是会议期造成的，而是上面那条距离口径。）

### 3. 背景音乐：3D 根本没接，2.5D 接了但被压成听不见

- **3D**：`audio.gd` 只有事件音效，**没有任何音乐流**；而 `ui_panels.apply_audio()` 把
  「音乐」滑杆写进 **Master 总线** —— 结果是滑杆一动连音效一起变小，音乐却始终无声。
  现在：`audio.gd` 加 `play_music() / set_music_volume() / music_state() / music_loop_param()`，
  只在 `_on_start()` 真的开局时播；`ui_panels` 改成发 `music_changed` / `sfx_changed` 两个信号，
  由 `main.gd` 分别接到音乐与音效，**Master 固定 0dB**。
- **格式**：Godot 4.6 不解码 m4a/AAC，所以本机 `ffmpeg -c:a libvorbis -qscale:a 4`
  把 `audio/music-bgm.m4a`（用户自有录音）转成 `3d/preview/assets/audio/music-bgm.ogg`
  （151.2s / 2.26 MB）。循环是**导入期**决定的：`music-bgm.ogg.import` 的 `loop=true`
  （4.6 的 `AudioStreamOggVorbis` 没有 `loop_mode`，运行时设不了 —— 踩了 `AudioStreamLoop` /
  `LOOP_FORWARD` / `LOOP_LINEAR` 三次不存在成员）。署名见 `audio/CREDITS.md`。
- **2.5D**（`js/main.js`）：音量从 `S.music * 0.7` 改为感知曲线 `pow(S.music, 0.7)`
  （0.35 档 −12.2dB → −6.4dB，满档仍是 1.0，不加任何上限）；
  `pointerdown` 的「试一次就摘掉监听」改成**播成功才停**，被自动播放策略拒掉时后续手势会继续重试。
- **新增 `--audiotest`** 读数：
  `AUDIOTEST 音乐 文件=true 时长=151.2s 导入循环=true 播放=true`
  `AUDIOTEST 音量 档=0.35 增益=0.48（-6.4dB）· 感知曲线 pow(v,0.7) 与 2.5D 一致`
  `AUDIOTEST 总线 Master=0.0dB（音乐滑杆不再写总线）· 音效档=0.80`
  2.5D 侧实测 `bgm.volume=0.4796`、手势后 `paused=false / currentTime=1.14`。

### 本批没动 / 留给下一批

- **没动**：`reach.fix` 等任何 space.json 数值、2.5D 判定与平衡、掩体与铁板口径（第一批）、
  地图布局数据、`sim/*.gd`（另一会话在改）。
- ⚠ **本批发现但不属于本批**（都是另一会话在改的 `sim/*` 与设备链路）：
  ① `--devicetest` 现在读 `open=false locked=true`，`_run_devicetest()` 在 `_ready` 当帧就调
  `_open_device()`，疑似小游戏层未装配完；`3d/README.md` 此前写的 `open=true` 与现状不符，已就地标注。
  ② `--simtest` **pass=24 fail=2**：`s.t` 开局是 0 而不是 `night_len()`=75，
  于是「75 秒后天亮 → 第 2 夜」也失败（`sim_state.gd::new_game` 的夜钟起值口径）。


## 2026-11-09 · 铁板配置暂关（只从地图上清掉，资产与判定一律不动）

> 用户指令原话：「先把实际图备份。不要直接删，目前只是暂时清掉地图里面的这种铁板方块。」

- **先备份**（改动之前完成）：`_backup/20261109_铁板配置/`，已加进 `.gitignore` 不入库。
  `glb` 73 件 56.4 MB · `blend` 169 件 26.3 MB · 检查板渲染 14 张 18.9 MB ·
  验收截图 114 张 58.2 MB · `cover_refs.json` · `map_builder.gd` / `covers_lib.py` 等 6 个脚本 ·
  2.5D `base-lit.png` 15.7 MB —— 合计 **378 文件 175.7 MB**。
- **拔除方式：没有删任何东西。**
  ① `3d/tools/covers_lib.py`：`SIGHT_MIN_H` 由硬编码 `1.70` 改为
  `float(os.environ.get('COVERS_SIGHT_MIN_H', '0'))` ⇒ 默认不再焊背板；
  `sight_extend()` 函数体、两处调用点、口径说明**全部保留**（函数本来就有 `<=0` 直接 return）。
  ② `3d/preview/scripts/map_builder.gd`：新增 `const COVER_SIGHT_SHELL := false` 与
  `_hide_sight_shell()`，实例化 cover GLB 时把 `sight_shell`（背板 + 立柱 + 顶梁）和
  `sightglow`（发光缝）设为不可见。**碰撞盒、`COVER_HEIGHT`、`cover_refs.json`、GLB 文件全部原样。**
  ③ `main.gd --arttest`：新增铁板验收行，遍历场景树断言「可见铁板节点 = 0」。
- **实跑读数**：
  `ART 铁板 hidden=254 show=false 可见铁板节点=0`（127 件 × 2 个节点，全部隐藏）；
  同批 `ART theme=10/10 … 件数=127`、`ART 设备顶面一致性 检查=3 不一致=0`；
  `check-cover-scale.cjs`（61 kind · 纵向失配 0 · 横向超标 4 件，与改动前同一批）与
  `sync-cover-height.cjs --check`（需更新 0 项 · 一致）均无漂移 —— 因为表根本没动。
  本批复跑读数一致。日志里另有 `scripts/sim/speech.gd:579` 的类型推断报错
  （另一会话正在改的未提交文件），与本批无关，也不影响上面的 ART 读数。
- **出图**：`--covershot` / `--eyeshot` × med / bridge / warehouse / ecosys 共 8 张。
  眼高视角从「整屏一块黑铁板 + 一条发光缝」（备份 `shots/covers-eye-med.png`）
  变成看得见家具、通道与无人机。
- **已知代价（下一批要解决的）**：2.5D `js/engine/geo.js::los()` 仍把每件 cover 当作
  无条件挡光的矩形，而 3D 画面里 0.95 m 的柜子现在能看过去 ⇒
  **「判定挡、画面不挡」的不一致重新出现**。正解是按 cover 实际顶面高度做 LOS
  （动 2.5D 判定 = 动平衡，须跑 1000 局），**不是**再给家具焊背板。
- **恢复口径**：显示旧铁板 ⇒ `COVER_SIGHT_SHELL = true`；
  重建旧口径资产 ⇒ `COVERS_SIGHT_MIN_H=1.70` 重跑 `build-covers-*.py`
  → `measure-cover-refs.py` → `sync-cover-height.cjs`（顺序不能反）。
- **顺手标注的旧口径残留**（只加注释，逻辑与产物一字未改）：
  `3d/tools/build-map-v2.cjs` 里 `const SIGHT_MIN_H = 1.70` 上方注明它是**历史名义高度**、
  现行默认已 0，且重跑该脚本会重写全部布局坐标 —— 要动高度口径先定 LOS 方案；
  `3d/tools/build-medbot.py` 抬头说明 `sight_extend()` 现在默认直接 return，但 `shell_pass()` 照旧。
- **没有动**：2.5D 运行时与 `js/` 下任何文件、任何 GLB / 贴图 / 底图资产、
  `map_v2.json`、门禁与平衡数值。

## 2026-11-08 · 推理 / 发言全量同源（用户「其他均无差异」）

- **口径升级**：2.5D 与 3D 只允许**维度、美术、玩家输入映射**三处差异；
  AI 推理、发言、判定规则、语料、数值必须同源。此前"两套独立实现、逐条对齐不是
  验收标准"的表述已全部作废（`MIGRATION.md` 抬头 / §9、`simdump.cjs`、`export-sim.cjs`）。
- **新增 `3d/tools/export-rules.cjs` → `data/rules.json`**（31 KB）：
  `SKSanity` 48 张表（含 `SKTrait.AXES/BANDS/C` 指纹、`SKT2Decision` 词表）、
  **70 个纯函数的源码 SHA + 数值字面量清单**、`MEM_MAX/SEEN_WORD/EV_W/ID_EVIDENCE`、
  以及 `pickLine` 的 combo 概率 / 降权 K / 重挑次数、`startChatter#talkScore` 8 项系数、
  `sayStreakOK` 连说上限、`_avoid` 避开秒数。改 `js/` 不重导即漂移。
- **新增 `scripts/sim/rules_data.gd`**：类级缓存 + `n/i/b/t/disp/disp_sub/fn/constant`。
  `mind.gd#rule` 与 `speech.gd#_r` 全部改读 `rules.json`，不再读 `lines.json` 的 21 张子集。
- **发言同步**：`speech.gd` 的 talkScore、combo、`1/(1+K·n)`、重挑次数、连说上限
  全改真源；删除 3D 自造的「同模板最多 2 次」与三处随机分类比例，改回 2.5D 的
  证据驱动固定分支。`--speechtest` 仍 **11/0**、讨论台词 13 条不回归。
- **推理同步**：`mind.gd` 重写为 2.5D `SKT2AI` 等价结构 —— `known` 只来自亲眼确证、
  `why` 改为「目标 → 证据记录数组」、`almost={foe,friend}`、性格轴读 `SKTrait`；
  补齐 `hypotheses / refreshHyps / hypothesisEvidence / hypothesisSpread /
  publicHeat / publicInfluence / pubAccusers / pubSolidAccusers / evalAlmost /
  bestSusTarget / bestKnownTarget / bestAlmostTarget / evidenceReason / liveTarget`。
- **判定同步**：`sim_state.gd` 的票权层级、假说竞争弃权、跟票全部走 `mind` 等价函数；
  删除 `suspect` 计数字典（第二份嫌疑数据），枪声证人改走 `mind.note_testimony`。
- **新增 `3d/spec/parity-map.json`**：70 函数逐项对账，
  **38 synced / 7 adapter（运行时定时器→tick 排期）/ 25 pending，覆盖 100%**；
  pending 如实列出：构陷编排、领袖剧本、envEstimate、时间线拆谎、白天/开局会议、
  紧急按钮、身份公布追责、RUSH、目标承诺、管道突袭、异形开枪。
- **新增 `3d/tools/check-parity.cjs`**（`npm run 3d:parity:check`）：
  ① 重算真源与 `rules.json` 逐项比对（表/函数/指纹/常量/调度系数/源文件 SHA）
  ② `lines.json#rules` 21 张表与 `rules.json` 交叉一致，禁第二套数值
  ③ parity-map 覆盖与状态合法性 ④ 扫描 3D 推理/发言脚本的自造阈值。
  实跑 **PARITY OK / 0 WARN**。
- **18 项 3D 门禁 + `3d:lines:check` / `3d:port:check` / `3d:events:check` 全绿**；
  判定改动后 `--sim1000 --games 200` 已重跑（200 局报告已随 2026-11-09 清理移除）。
- **没有动**：2.5D 运行时、`js/` 下任何文件、任何美术素材。


## 2026-11-08 · 平衡对齐：修正 3D 基线偏离 2.5D 对半

- **起因**：3D 200 局基线 **79.0% / 17.5% / 超时 7**，而 2.5D 重跑 1000 局
  （seed 20261030，`tools/mc-report.md`）是 **49.9% / 50.1% / 超时 0**。用户指出
  「3D 基线不应该呀」。定位后确认**不是**"两套独立实现不能比"，而是 3D 有一串
  真源漂移：遥测显示 66% 的局以"异形全部出局"结束、场均驱逐 4.08 次且 80.9% 逐的是异形。
- **① 驱逐门槛**：3D 是简单多数 + 平票随机挑一个（每会必逐）；2.5D `closeVote`
  要求**唯一最高票且达到 `VOTE.need=4`（≤7 人时 `lateNeed=3`）**。已照搬，并把
  `need/max/tie/voters` 写进会议结果供身份公布页显示。
- **② 报告额度**：2.5D `MEET.reportsPerAgent=2`（每人全局），3D 不限。已接；
  AI 额度用尽时继续做任务，不卡在尸体旁。
- **③ AI 票权层级**：3D 原来人人必投、按综合分机械取最高。已接 2.5D 的
  `known → almost → accuse → suspect → hypothesisCompeting 弃权`（`MIND.hypGap 0.08 /
  hypMinTop 0.34`），并拆成"独立意向 → 跟票 → 落票"两轮：
  `WARM.followChance=0.45` 跟票、`SOCIAL.pileOn=0.4` 异形顺势，全部读 `lines.json#rules`。
- **④ 发言→票权**：3D 的 `speech.gd` 只把 point 写进发言流，没写回 `agent.accuse`。
  已接（2.5D："说了却不投等于打自己脸"），开会时清空。
- **⑤ 异形理智线**：此前是手写占位——**25~35 秒全局冷却 + 目击者>0 就 70% 收手**，
  而 `sim.json#rules.KNIFE` 的 `witnessCap 3 / minConceal 0.34 / crowdR 9 / crowdN 3 /
  boldBase 0.5 / boldSpan 0.16` 一直没被使用。已按真源重写（隐蔽度按距离加权、
  性格冒险率 0.34~0.66、被拦时避开该目标 12 秒），并按 `HUNT` 口径改挑落单目标。
- **⑥ 注意力过滤（决定性）**：2.5D `watchersAt` 排除 `attention()!=='online'` 的人
  （`js/game.js:1740 if(a.doing>0)return 'ui'`）；3D 把低头站桩修设备的人全算成目击者。
  遥测补上后一目了然：修复前 **3131 次被 witnessCap 拦下 / 仅 107 次出刀**，
  异形几乎整局出不了刀。
- **⑦ 枪声证人**：3D 把 20 格内听见枪响的人都 +1 嫌疑（等于确证级）；
  2.5D 听见权重 0.18、亲眼看见 0.75。改成 7 格 + LOS，误逐率从 ~50% 降到 ~36%。
- **⑧ 批量模拟口径**：2.5D 蒙特卡洛是 15 人全 AI 对 AI，3D 却把 0 号玩家席位空着
  （不做任务、不投票），既拖慢进度又架空 4 票门槛。已让 `--sim1000` 用旁观口径全 AI。
- **⑨ 人类 AI 开枪**：2.5D 有 `SHOT.chaseKnown/chaseSus` 反制，3D 只有玩家能开枪。
  已接（确证 / 综合嫌疑 + 枪程 + LOS，1 秒决策节流避免 O(n²) 拖慢批量模拟）。
- **仍在 partial 的口径**：2.5D 是「每夜 1 把刀 + RUSH 逃逸 + 目标承诺 + 管道突袭 +
  异形开枪」的组合，实测每夜约 1.93 刀；3D 异形只迁了贴脸出刀，**进攻链补齐前
  不启用每夜刀数额度**（只搬限制不搬能力会 0 胜），出手频率由 KNIFE 理智线控制。
- **观察窗口**：2.5D 15 夜内必分胜负；3D 的白天/开局会议与紧急按钮未迁，残局收尾慢，
  `--sim1000` 用 26 夜窗口，避免把还能分胜负的局误记成超时。
- **遥测**：`--sim1000` 新增败因分布、驱逐命中率、存活人数、死亡/救起数、
  超时局人类数，以及异形决策 `block_cap / block_conceal / block_bold / knife_ok` 计数。
- **18 项 3D 门禁 + `3d:lines:check` / `3d:port:check` / `3d:events:check` 全绿**；
  事件词表 31/31/31。**未动 2.5D 源码与任何美术素材。**
- **修复后基线**：200 局读数（报告已随 2026-11-09 清理移除）人类 36.5% / 异形 61.0% / 超时 5 局（2.5%）。
  与 2.5D 的 49.9/50.1 仍有差距，归因于上面列出的会议链 / 进攻链 partial，
  下一批专项补完后重跑，**不靠改判定凑数字**。


## 2026-11-08 · S 轨发言 + 除美术外全部系统接入

- **口径变更**：用户裁定「S 轨发言，除了美术全部完成」。`export-sim.cjs` 当初"发言不迁"
  的约束解除；本批把台词、发言调度、认知层与剩余系统全部接上。
- **语料契约**：`3d/tools/export-lines.cjs` 从 `js/data/lines.js` / `js/ai/sanity.js` /
  `js/ai/traits.js` / `js/t2/decision.js` 导出 `data/lines.json`（62 类 / 1,201 行台词 /
  74 条 WHY / 20 条 combo / 21 张规则表 / 38 组 ROOM_WORDS / CN_SEAT / whenWord /
  13 组 parseSpeech 正则 / 6 类 claim）。`3d/spec/lines.schema.json` +
  `check-lines.cjs` 逐字比对真源并校验真源 SHA，**改语料没重导直接 FAIL**。
- **发言链路**：`sim/lines_data.gd`（fillTpl 词槽 + `{a|b}` 组合槽、toneOf、parseSpeech 人名
  长度降序占位 / 席位号 / 意图）、`sim/mind.gd`（sus / cred / warm / reliability /
  ATTN.heardMax=10 滑动窗口 / known / almost / why / 口供拆谎）、`sim/speech.gd`
  （talkScore 排期、hot-cold、30% combo、整局降权 `1/(1+3n)`、同场硬去重、连说让位、
  异形台词上限、发言→证词→sus、玩家自由发言、AI 质疑/附议/否认）。
  **投票不再是目击计数/随机**，改走综合嫌疑分。
- **会议 UI**：discuss 段加发言流（不按阵营标色，避免泄露身份）+ 自由输入框；
  会议打开时释放鼠标（此前 CAPTURED 状态下按钮根本点不到，是实际游玩 bug）。
  讨论期说「我投 X」记为意向，进 vote 相位自动落票。
- **修坑**：`speech._log("chat", {..., "kind": ...})` 的业务 kind 覆盖了事件信封
  （2.5D logEvent 同款），改名 `ev`；`GDScript int(null)` 在复盘渲染里会崩，加安全转换。
- **剩余系统**：拖尸/藏尸/医疗救起、机器人 HP 与反制、供电与 sim 合并、改票、报账、
  讨论超时、天亮、第 10 夜终结者、旁观者第 16 人自由相机、设置面板（音量/灵敏度持久化）、
  复盘时间轴、20 条 `.ogg` 事件音效、版本号单一真源。
- **契约全覆盖**：`check-events.cjs` 扩展到扫 4 个产生事件的脚本，
  **schema 31 / 2.5D 31 / 3D 31**；`port-manifest.json` **prepared 归 0**
  （ported 9 / partial 26 / reference 4 / excluded 8）。
- **对照夹具**：`3d/tools/simdump.cjs` 导出 2.5D 同 seed 事件流，`--simdiff` 比对
  信封字段 / kind 覆盖 / 首个分歧点。实跑 seed 20261108：2.5D 227 条 / 3D 224 条，
  报告 `preview/reports/simdiff-20261108.md`。**逐条对齐不是验收标准**（两套独立实现）。
- **当时的 200 局基线**：人类 79.0% / 异形 17.5% / 超时 7 局（600 秒/局）。
  ⚠ 该读数后来被证实是 9 处规则漂移造成的失衡版，**已被本文件最上方
  「平衡对齐」章节取代，不要再引用**；见 `MIGRATION.md` §9
  （该 200 局报告已随 2026-11-09 清理移除，已被新基线覆盖）。
- **门禁**：新增 `--speechtest` **11/0**、`--b6test` **6/0**、`--sim1000`（可 `--games N`）、
  `--simdiff`；原有 15 项门禁全绿；`3d:lines:check` / `3d:port:check`（0 错误 1 警告）/
  `3d:events:check` 全绿。
- **实拍**：`preview/screenshots/meeting-discuss.png`（发言流）、`meeting.png`（投票）、
  `meeting-result.png`（身份公布 + 投票矩阵）、`home.png`。
- **没有动**：任何美术素材、2.5D 运行时、`js/` 下任何文件。


## 2026-11-08 · B6 开始页 + B4 机器人/战斗/管道/搜尸 + B5 会议三段

- **开始页（版式照搬 2.5D）**：`scripts/home_view.gd` + `home_ship_map.gd`。
  左侧品牌 / 标题 / 三张身份卡 / 统计 chips / 身份说明 / 页脚，右侧整船蓝图
  （10 舱 / 127 掩体 / 26 任务点 / 8 管道口）直接读 `map_v2.json` 自绘，
  选身份高亮对应舱室，手电光斑跟随鼠标；房名用屏幕空间绘制 + 黑描边
  （在缩放 transform 下 `font_size` 会被截断成 1px）。
  无门禁参数时显示，`--role human|alien` 跳过；旁观者卡暂时禁用。
  **选人类 / 异形真的影响开局**：`sim.new_game(..., p_player_alien)` 把 0 号席位钉进
  异形池，总数仍是 4（此前异形池永远排除玩家，玩家不可能当异形）。
- **机器人 B4**：`scripts/sim/bots.gd` 落地 2.5D `js/game.js` 4442–4726 的状态机 ——
  保安四点巡逻 1.6 格/秒、6 格 + 前方 180° + LOS 抓现行、7.5 格/秒追逐、
  押送到军械库角落拘留 30 秒（每夜 2 次）；医疗无人机飞向濒死者救起（每夜 2 次）。
  `scene_extras.gd` 把两台机器人收进可移动 Node3D，名牌跟着走。
- **玩家战斗**：左键出刀（异形 1.35m）/ 右键开枪（人类 9m + 1 发子弹），都走
  `sim.knife / sim.shoot`，目击 suspect、保安抓捕、无人机施救自动生效。
  **B3 的「异形不主动刀玩家」临时保护撤销**。
- **管道 / 搜尸**：`E` 打开出口面板（8 口去掉当前口）真传送，20 秒冷却、人类禁用；
  搜尸站桩 `STAND.search` 秒转移死者子弹/医疗包/申请单，一具只搜一次。
- **修隐性 bug 两处**：① 玩家走遍全船但 `sim.me().pos` 一直停在出生点 →
  每帧同步（押送/濒死/会议除外）；② `exchange_supply("ammo")` 写的是 `a["ammo"]`，
  而 agent 字段叫 `bullet` → 子弹永远领不到，已修。
- **会议 B5 三段相位**：`discuss(35s，可跳过) → vote(5s) → result(3s)`，秒数读
  `sim.json#rules.MEET`；AI 票在讨论结束才投，玩家票只在 vote 有效；
  result 显示「谁被驱逐 · 是/不是异形 · 几票」+ 投票矩阵。
- **真源纪律**：`3d/tools/export-space.cjs` 新增 `shoot`（`SKSanity.SHOT`）与
  `bot`（`SEC_RANGE / SEC_ARC / DETAIN_TIME / SEC_USES_MAX / BOT_SPEED /
  SEC_CATCH_SPEED / MEDBOT_CHARGES` 具名抠取）两段，GDScript 不抄数值。
  机器人事件统一到 2.5D 冻结词表的 `detain`；`check-events.cjs` 扩展到扫描
  `bots.gd` / `main.gd`，3D 覆盖 **19/31 kind**。
- **门禁**（15 项全绿）：`--navtest` 28/0、`--simtest` 26/0、`--meetingtest` ok=true、
  `--aittest` prog 39/45 人类胜、`--bottest` **6/0**、`--b4test` **8/0**、
  `--hometest` **6/0**、`--roletest` **4/0**、`--taskflowtest` ok=true、
  `--interacttest` / `--devicetest` / `--mgtest` 10/10 / `--arttest` 127/0 /
  `--tasktest` 26/0 / `--floortest` 48/0；`--e2e` open+closed=true；
  `3d:port:check` 0 错误 / 1 警告；`3d:events:check` 31/31/19。
- **实拍**：`preview/screenshots/home.png`、`meeting.png`、`meeting-result.png`。
- **清单**：47 系统 → ported 7 / partial 21 / prepared 7 / reference 4 / excluded 8。
- **未接**：美术优化（用户点名的铁板/方桌/地毯、保安机器人可见性）、S 轨发言、
  拖尸/藏尸、机器人 HP、AI 认知、供电与 sim 合并、旁观相机、设置/复盘。
- **没有动**：2.5D 运行时 / 美术素材 / `js/` 下任何文件。


## 2026-11-08 · B2/B3：网格 + AI（人类/异形）+ 任务交互 + 静默投票

- **B2 网格/AI 人类**：`scripts/sim/grid_nav.gd` 按 `js/engine/geo.js` 同规则烘焙 0.6m
  可行走网格（舱室 poly / 走廊 CW/2 / 掩体 0.12 / 墙 0.36），A* 用 `AStarGrid2D`；
  **walkable=5894，与 2.5D 通行体检一致**。`ai_human.gd` 让 11 个人类 AI
  选任务→走路→站桩→完成→领申请单→换补给；`sim_state` 增加 pos/path/doing；
  玩家申请单/补给改为 sim 真源。`crew_view.gd` 用 crew-01 第一帧做 15 个 billboard。
  读数：`--navtest` **28/0**（26 任务点全部可达）；`--aittest` 300 秒 **prog 30/45、
  tasks 23、qual 11、supply 10**。
- **B3 异形/尸体/投票最小版**：`ai_alien.gd` 找人→刀程→出刀，每夜一次非会议室破坏；
  `sim_state` 加濒死 12 秒、死亡、目击 suspect、破坏 30 秒窗口、故障维修、报告尸体、
  5 秒静默投票、驱逐/公布 alien 布尔；玩家靠近尸体按 E 报告，会议面板点名字投票。
  读数：`--meetingtest` **ok=true / 14 个投票按钮 / ejected=1**；`--aittest`
  knife 6 / kill 6 / meet 5 / eject 5，最终人类靠“异形全部出局”赢。
- **已知边界**：没有开枪、钻管道、拖尸/搜尸、伪装、完整 mind/sus；玩家近战未接前
  异形不主动刀玩家（否则第一夜 30 秒结束）；投票是 5 秒静默版，没有讨论窗口/身份 UI。
- **门禁**：`--navtest` 28/0、`--meetingtest` ok=true、`--aittest` 跑通、`--simtest` 26/0、
  `--taskflowtest` ok=true、`--interacttest` 全项、`--devicetest` 27 设备、`--mgtest` 10/10、
  `--arttest` 127/0、`--tasktest` 26/0、`--floortest` 48/0；`npm run 3d:port:check` 0 错误。
- 实拍：`preview/screenshots/meeting.png`、`preview/screenshots/preview.png`（`--shot --wait`）。


## 2026-11-08 · 移植准备：可校验的 port-manifest（不动 B2–B6）

- **口径更新**：用户确认后续会把 2.5D **除美术素材外**的全部内容移植到 3D；本轮**不做移植**，
  只做准备。发言系统保留在目标里，但单列 **S 轨**、执行顺序最后（本轮只留数据/接口占位）。
- **新增 `3d/spec/port-manifest.json`**（当时）：46 个系统逐项登记源文件/行段、目标、状态、依赖、
  验收门禁；`js/` 22 个文件 19,718 行 100% 被认领。当时状态：ported 6 / partial 10 /
  prepared 18 / reference 4 / excluded 8；之后 B2/B3 已推进到 47 系统、ported 7 / partial 19 / prepared 9。
- **新增 `3d/tools/check-port-manifest.cjs`**（`npm run 3d:port:check`）：校验未认领 js 文件、
  行覆盖缺口、重复认领、ported/partial 的 target 是否存在、依赖成环、契约 `schema_version`
  与 generator 是否存在。当前 **0 错误 / 1 警告**（`cover_refs.json` 无 schema_version，legacy）。
- **新增 `3d/preview/scripts/sim/README.md`**：sim 模块布局、依赖顺序（grid_nav → mind →
  ai_human → combat → bots → report/decision → vote → speech）与公开接口；明确“sim 不读节点/输入”。
- **新增 `3d/spec/events.schema.json` + `3d/tools/check-events.cjs`**（`npm run 3d:events:check`）：
  冻结事件信封 `{kind,night,pt,t,actor,victim,room,x,y}` 与 31 个 kind；当前 **schema 31 /
  2.5D 31 / 3D 7**，0 错误。顺带发现并记录 2.5D 的两条口径：`meeting` 事件的 data.kind 会覆盖
  信封 kind（实际落盘成 pre/day/night）；`t` 是本夜剩余秒、`pt` 才是已过秒。3D 的 `_log()`
  已改成同一信封。
- **契约盘点 8 个**：map_v2(2) / space(1) / minigames(1) / sim(1) / panels(1) / floor_spec(1) /
  layout-v2(2) 为 stable；`cover_refs.json` 为 legacy-no-schema。
- **准备阶段未完成 3 项**（写进 `MIGRATION.md` §8.2）：同 seed 对照夹具、发言 `lines.json`
  schema、`cover_refs.json` 补版本号。
- **没有改**：`js/` 任何文件、2.5D 运行时、美术；`npm test` 复跑 885/0 仅作基线确认。
- **同日后续**：按用户指令完成 2.5D 第 5/6 批（人类完整证言补完 + 语言对称），
  `npm test` **899/0**、`lines-audit --strict` **1457/0**；S 轨数据源已稳定，
  3D 侧仍是 `prepared`，没有开始 S 轨。清单里的 game.js 切片已按新函数行号同步。

## 2026-11-08 · 模拟核心 B1：无发言 / 无美术的迁移起点

- **口径**：用户裁定「除发言系统与美术，其他都可以尝试迁移」，施工单见 `MIGRATION.md`。
  本轮只做 B1（状态机 + 任务回路），不碰台词、不做新美术、不替换 2.5D。
- **新增 `3d/tools/export-sim.cjs`**：从 `js/ai/sanity.js` / `js/t2/space.js` / `js/data/names.js`
  / `map_v2.json` / `minigames.json` 导出 `data/sim.json`。只导非发言规则（21 张表），
  明确排除 13 张发言表（SPEECH / TESTIFY / RELIA / MIND / DESC / FRAME / WARM / LEADER /
  ALIBI / MISLEAD / SOCIAL / COFRAME / ACCOUNT）与 `lines.js`。fail-loud：名单 15 / 任务点 26 /
  标签能回查 minigames 才出包。
- **新增 `scripts/sim/sim_state.gd`**：15 席（4 异形 / 11 人类）、每人 1 高难 + 3 普通、
  乱序完成换位记账、进度封顶 45、个人进度 3/5 生成申请单、电路维修置 `power_fixed`、
  75 秒天亮、三条胜负分支（45 分 / 异形出局 / 人类全灭）、事件流只追加。
- **`main.gd`**：开局建 sim、HUD 显示夜/倒计时/进度/自己的 4 个任务、设备只对自己的剩余任务
  开放、小游戏玩通写回进度、结束遮罩、`R` 重开（新种子）、`--simtest` 门禁。
- **读数**：`--simtest` **26 通过 / 0 失败**；`--taskflowtest` **ok=true**（E → 解题 → 进度
  0→2、tIdx 0→1、收起、解锁）；`--arttest` 127/0；`--floortest` 48/0；
  `--tasktest` 26/0；`--devicetest` 27 设备 / 14 玩法（`open=true`）；`--mgtest` 10/10；
  `--interacttest` 全项；`--powertest` 全项；`--e2e` open=true / closed=true / unlocked=true。
- **已知边界**：14 个 AI 不会动，玩家单人最多 5 分，B1 打不到 45 分；胜利分支只由 `--simtest`
  覆盖。B2 移植 `geo.js` 的网格/A*，让人类 AI 也做任务。
- 留档：`preview/screenshots/sim-b1-hud.png`（第 1 夜 72.6s / 维修 0/45 / 4 个自己的任务）。

## 2026-11-07 · 贴图 VRAM 压缩（BPTC/BC7）+ mipmap + 去重复 + 2.5D 底图重烘（用户 19:4x）

- **档位实测，不猜枚举**：同一张 1536² 图逐档重导 —— `mode=0` 9,437,230 B（未压缩）；
  `mode=3` 同样 9,437,230 B 且 `vram_texture:false`（**4.6 里它不是 VRAM 压缩**）；
  `mode=2` → `.s3tc.ctex` 1,572,940 B（DXT1+mipmap）；
  `mode=2 + high_quality=true` → `.bptc.ctex` 3,145,828 B（**BC7+mipmap，采用**）。
  DXT1 在舱室暗角出明显色阶，BC7 几乎无色带而仍有 3 倍压缩。
- **工具 `3d/tools/patch-tex-vram.py`**（幂等）：96 个 `.png.import` 置
  `compress/mode=2` + `compress/high_quality=true` + `mipmaps/generate=true` +
  `detect_3d/compress_to=0`（最后一项非 0 会被 3D 检测二次改档，导入抖动）。
- **mipmap 是画质修复，不只是省显存**：此前 `mipmaps/generate=false`，1536² 贴图在
  远处平铺闪烁 / 摩尔纹。补上后远处反而更干净。
- **去重复（md5 查出，此前无人察觉）**：`qwen/<rid>/skin3.png` ≡ `floor.png`
  （同输入同裁切），`WALL_SKIN` 第三张改指 `qwen/<rid>/floor`——`_material()` 的 key
  是去 `.png` 的相对路径，改完与地板命中同一 Material 缓存，纹理 + 材质各留一份；
  `cabin/<rid>.png` ≡ `qwen/<rid>/skin1.png`，新增 `CABIN_QWEN_ROOMS` 让
  `_wall_material()` 对这 6 舱改走 qwen 路径，铁板 4 舱不变。删 12 张文件 + 12 个
  `.import`，备份 `tools/_bak/dedup-20261107195125/`。
- **底图重烘修掉一条静默回归**：首轮直接跑默认参数，Blender 报 6 条
  「缺贴图 qwen/<rid>/floor.png，退回纯色」，**6 个舱地板会全变纯色**且脚本 exit 0。
  根因是 `floor_spec.json`（2.5D 与 3D 共用真源）被千问批次写成 3D 侧路径，而
  `mat_tex()` 只在 `assets/scene/v4/tex/` 找。已即时回滚（md5 一致），补
  `tex_path()` 两段解析（先 2.5D 后 3D），`load_tex` / `mat_tex` / `mat_shadow` 统一走它。
- **教训**：`blender-ship.py` 有 `--dry`（只建场景材质、不渲染不写盘）与 `--out`。
  **重烘前必须先 `--dry` 看缺图清单**，正式出图用 `--out` 到临时路径比对后再覆盖——
  直接跑默认参数会在 exit 0 的情况下静默毁掉入库底图。
- **连带修掉两处「重跑就回退」**：① `bake-qwen-room-skins.py` 原来每舱出 `skin1..4` +
  覆盖 `cabin/<rid>.png`，重跑必然把删掉的 12 张重复文件造回来。改为只出
  `skin1/skin2/skin4` + 复用 `floor` 作第三张、不再写 `cabin/<rid>.png`；色调参考缺失
  改为**显式报错**（不能再回落已删的 `cabin/<rid>.png` 与被改写的 `floor_spec` tex，
  那等于新图对齐新图，会逐轮漂移）。`--dry-run` 现报 24 张 / 0 项 / 0 舱 / 0 文件，幂等。
  ② `check-floor-spec.cjs` 报 **FLOOR-SPEC FAIL 1**：千问批次直改 `floor_spec.json`，
  但 `export-floor-spec.cjs` 的 `ROOMS` 表还是老贴图名。已同步 6 舱 tex，
  并在注释写明 `qwen/` 前缀只在 3D 侧、2.5D 由 `tex_path()` 回落。现 **OK（11 项）**。
- **读数**：`RENDER_TEXTURE_MEM_USED` 885 → **486 MB（−399 MB / −45%）**；
  draw call 1236 / 帧内对象 1386 / 可见 49-127 / 隐藏 78 / 共享材质 8，逐项持平；
  底图 4704×4413 同尺寸；`--arttest` 127/0、`--floortest` 48/0、`--tasktest` 26/0、
  interact / device 通过；`3d:assets` 0 错误、`import:check` 0 差异。

## 2026-11-07 · 地板口径归位（单一真源）+ 非交互面贴图化（用户 13:56）

- **根因**：2.5D 底图与 3D 预览**从未换过地板贴图**（11 张贴图 sha256 逐字节相同，
  `map.js` 零地板改动），换的是**重复尺度** —— 3D 用全局 `UV_WORLD_SCALE=4.0`，
  底图用 per-room 2.8~7.5。`floor-lab.png` 每循环 9 格 ⇒ med 单格
  底图 0.33 m / 3D 0.44 m，差 33%，观感上就是「地板被换掉」。
  另加 3D 给所有舱统一套的 `Color(0.88,0.9,0.94)` 染色（底图只有 4 舱有 tint）。
- **修法**：新增 `3d/preview/data/floor_spec.json` 为**单一真源**
  （`3d/tools/export-floor-spec.cjs` 生成）；`tools/blender-ship.py` 与
  `map_builder.gd` 改读同一份，删掉 `ROOM_TEXTURES` 与地板用的全局尺度。
  UV 改为 `世界坐标 / repeat_m`，等价于底图的 Object 坐标 + Mapping Scale。
- **工具**：`export-floor-spec.cjs`（`--check` 校验）、
  `check-floor-spec.cjs`（三查，含「不得有第二份地板表」）、
  `main.gd --floortest`（**检查场景里真实建出来的 48 个地面网格**）。
- **自测教训**：第一版 floortest 拿真源和自己比 → 永远相等，注入漂移也 0 失败，
  等于没测。**验证漂移必须在消费端注入**：在 map_builder.gd 写死 `repeat_m := 4.0`
  → 立刻 10/10 FAIL；还原 → 0 失败。
- **贴图化**：天花板 `panel-metal`(亮度53) → `panel-white`(144) + 平面 UV 2.4m；
  设备台座纯色 → `panel-white`/`panel-metal`；新增天花板一圈灯带（取 `theme.glow`）；
  新增天花板朝上补光（天花板在 3.2m 且法线朝下，是背光面）。
  验收新增 `main.gd --ceilshot <room>`（斜视天花板）。
- **修事故**：`tools/blender-ship.py` 原本没有 `--dry`，误用导致把入库底图
  `base-lit.png` 重烘覆盖（16.6% 像素不同）；已还原并补真正的 `--dry` 与 `--out`。
- **读数**：`--floortest` 10 舱 / 48 地面网格 / 0 失败；`check-floor-spec` 11 项全过；
  `--arttest` 127 件 0 不一致 + 顶面 3/3；`--interacttest` 通过；`--tasktest` 26/0；
  2.5D 门禁 **849 / 0**（`tools/_gate-floor-20261107.log`）；
  五舱天花板亮度 86~91（标准差 33~38，有纹理层次）；49~165 FPS。


## 2026-11-07 · PBR 贴图 / 高细节无人机 / 任务点交互修复（用户 12:32）

- **交互**：3D 里 3 个任务设备被 `_cover_top()` 顶到掩体顶面 **1.72 m**（掩体补到 1.70 后），
  玩家眼高 1.62 m 够不着；2.5D 侧 26 点全部可达可交互，不是对局 bug。
  `scene_extras._task_placement()` 重定位到掩体外侧 + `_pedestal()` 自带台座，
  新增 `--tasktest`（26 点 / 0 失败）。`map_v2.json` 的 points 不动。
- **PBR**：新增 `gen-pbr-textures.py`（10 套 tileable，albedo+normal，256² JPEG / 20 张 / 153 KB），
  `covers_lib.mat()` 接 Base Color 与 NormalMap；主题色灯带保持纯色。`COVERS_PBR=0` 回退。
  `BUDGET_TRIS 2950→6000`、倒角 3 段 20mm、manifest 与 `validate-assets` 上限同步放开。
  性能：512² PNG 三图版 200MB / 10 FPS → 256² JPEG 两图版 **54MB / 91 FPS**。
- **无人机**：`build-medbot.py` 生成 67 件 / 5610 tris GLB（白壳 + 玻璃医疗舱 + 四推进器 +
  红十字 + 扫描灯 + 机械臂），替换 `_drone()` 的球+圆环占位体；manifest 登记 `medbot`。
- 读数：`3d:assets` 0 错误、导入 0 脚本错误、`--arttest` 127/0、`--devicetest` 通过、
  `--interacttest` 通过、`--tasktest` 26/0；`sync-cover-height --check` 一致、
  `check-cover-scale` 纵向失配 0 / 低于眼高 0 件。


## 2026-11-07 · 视线遮挡高度统一到 1.70 m（用户 09:55 裁定）

- 问题：2.5D 的 `los()` 让**每一件** cover 无条件挡手电/近身视野（纯 2D 矩形、无高度），
  而 3D 相机在 1.62 m、掩体最高只有 1.61 m（**61/61 低于眼高**）——判定说挡、画面说不挡。
- 口径：`SIGHT_MIN_H = 1.70`（玩家胶囊高，眼高 1.62 + 余量）。**2.5D 判定与平衡完全不动**。
- 实现 `covers_lib.sight_extend()`：在占地后缘补上下两段暗色背板 + 发光缝 + 两根立柱 + 顶梁，
  到 1.70 m；**不拉伸原几何**；结构件 join 成 1 个网格 + 1 条发光缝（每件只多 2 个绘制节点）。
  `BUDGET_TRIS 2800→2950`（prop 硬上限 3000），倒角预算预留 100→200。
- 链路工具：新增 `sync-cover-height.cjs`（按 GLB 实测重写 COVER_HEIGHT v2 段，`--check` 校验）；
  `check-cover-scale.cjs` 加「低于 1.70 m」报警；`main.gd` 加 `--eyeshot <room>` 人眼平视验收。
  `build-map-v2.cjs` 的名义高度口径同步为 `SIGHT_MIN_H`（未重跑，避免布局坐标被重写）。
- 读数：61 件 **1.70–1.74 m**、低于 1.62 m **0 件**、纵向失配 **0 件**、0 件超预算；
  `3d:assets` 0 错误、导入 0 报错、`--arttest` 127/0、`--devicetest` 通过；
  5 张 `--eyeshot` 人眼截图已出。
- 坑：先 `measure-cover-refs.py` 再 `sync-cover-height.cjs`，顺序反了会把模型压回矮个子。


## 2026-11-07 · 掩体美术第二轮（全 10 舱参考图 / 外壳化 / 尺寸校准 / 设备点统一）

- 触发：用户「太粗糙，尽量保持和这个场景一样的风格，用本地模型生成参考图，把所有舱室的建模完成」。
- **本地 SDXL 补齐 10 舱参考图**（`3d/assets/refs/<room>.{png,json}`）：`gen-cover-refs.py` 的 JOBS
  从 5 个舱扩到 10 个；一次加载模型连续出 9 张，实测**每舱 1–2 分钟**（首张 402 秒含模型加载与
  CUDA 编译），不是原先估的 70 分钟。早前误用的线上生图已删。
- **三道通用工序**（`covers_lib.py`，全 61 件自动生效）：
  `bevel_main()` 2 段 16mm 倒角并给后续留 100 tris 预算；
  `shell_pass()` 主体刷浅色外壳 + 顶面暗色压边 + 嵌入式发光缝 + 底部暗色压边；
  `depth_ext()` 给薄型家具补后机架 / 床头板，压低纵深拉伸比。
  `COVERS_SKIPBOARD=1` 可只导出不出检查板（GPU 被 SDXL 占用时用）。
- **生态舱重写为真实尺寸并迁入 `covers_lib.py`**：第一批的 1×1 归一化模型被拉 **2.25~4.32 倍**，
  是靠新工具 `check-cover-scale.cjs` 才发现的（此前一直以为是"细节不够"）。
  8 件全部按 `ref_footprint()` 重建，消掉自带的一套重复图元函数；巨树树冠改九球簇，
  避免为守 1.30 档位高度压成"绿色飞碟"。
- **尺寸校准结果**：全 61 件横向 >1.35× 从 **16 件 → 4 件**（余下 1.36~1.39 属小幅缩放），
  **纵向失配 0 件**；Godot `COVER_HEIGHT` 生态舱 8 项按 GLB 实测同步。
- **驾驶舱指挥桌按参考图重做**：八边形切角厚边 + 白框 + 主题色边线 + 深色内板 + 四条独立支腿
  （原 24 边形实心圆桌读起来只有一块灰饼）。
- **设备点统一语言**（`map_builder.gd::_build_device`）：原来每个房间一块**整块主题色立方体**
  （仓库/配电是刺眼纯黄），改成中性浅壳 + 内收踢脚 + 顶面压边 + 主题色发光缝 + 顶部小屏。
- **验收工具修正**：`checker_board()` 的 tilt 是相机绕 X 轴角，俯角 = 90°−tilt；
  之前 26° 实为 64° 俯视，薄柜全被拍成横条，导致前几轮多次误判「模型像白板」。
  现为 58°（俯角 32°）+ 横向偏角 + look_at，才是真正 3/4 侧视。
- 读数：61 件 **0 件超 2800 tris**、合计 **6.25 MB**（单件 35.3–229.7 KB）；
  `3d:assets` 0 错误 / 3 既有提醒；Godot 导入 **0 脚本错误**；
  `--arttest` 127 件 / 0 不一致；`--devicetest` 通过；`check-cover-scale` 纵向 0 失配。
  10 张检查板 + 10 张 `--covershot` 实机截图全部重出。
- 未做（下一轮）：生态舱参考图里的多边形发光玻璃围板；余 4 件小幅拉伸；
  设备类 `device_*` 本体；3D 侧 LOD / 合批（127 件各是一个节点）。


## 2026-11-07 · 掩体细节迭代（面数预算 1500→2800 · 本地 SDXL 参考 · 娱乐舱按图重做）

- 触发：用户「还是显得太粗糙了，尽量保持和这个场景一样的风格，可以用千问/SDXL 取要素」，
  随后追加「允许建模加面数，用本地模型生成参考图」。
- **参考图走本地 SDXL**（新脚本 `3d/tools/gen-cover-refs.py`）：
  `D://ai-models//sdxl-base` + `vae-fp16-fix`，768×512 / 18 步 / CFG 6.5，**不挂 pixel LoRA**。
  实测 **402 秒/张**（比 `gen_sdxl_batch.py` 记录的 512²/12 步 70–80 秒慢 5 倍，因为尺寸与步数都上去了），
  所以**按舱单张**、固定 seed，不批量盲生。产物 `3d/assets/refs/<room>.{png,json}`。
  之前误用线上生图的那张已删除；AGENTS §一-6 的「3D 素材一律 SDXL」仍然成立。
- **面数预算 1500 → 2800**（`covers_lib.BUDGET_TRIS`）：上限仍受 `validate-assets.cjs` 的
  prop 类 3000 约束；倒角从 1 段 12mm 改成 **2 段 16mm**（`bevel_main` 默认参数），
  61 件实测 **124–2760 tris / 合计 5.12 MB**，0 件超预算。
- **按参考图重做娱乐舱 7 件**（参考图给的是"包裹式舱椅 + 连续霓虹缝"的语言）：
  点唱机（压扁圆顶 + 四角立柱 + 竖向霓虹 + 圆形喇叭格栅 + 提手）、
  街机柜（踢脚 + 侧板收边 + 内凹屏 + **外凸前倾控制台** + 灯箱边框）、
  游戏桌（外凸护栏 + 四角包角 + 栏下灯带）、
  沙发（内收踢脚 + 坐垫压线 + 扶手灯带）、茶几（厚边圈 + 下沉台面）、
  吧凳（双层踏圈）、赛车座（底架纵梁）。
- 读到的三条**通用规则**（写进 `3d/ASSETS.md`，后续每舱照做）：底部内收踢脚 / 外凸边条压暗一档 /
  圆角 + 嵌入式灯带（不要贴面浮条）。
- 读数：`3d:assets` 0 错误；`--arttest` 127 件 / 0 不一致；`--devicetest` 通过；导入 0 脚本错误。
- 已知：本地 SDXL 一张要 ~7 分钟，10 个舱全出参考图约 70 分钟；本轮只出了娱乐舱，
  其余 9 舱沿用「倒角 + 已有细节」，按需逐舱补参考图。


## 2026-11-06 · 掩体本体第四批（余下 6 舱 34 类，**61/61 全覆盖**）

- 新增 `build-covers-rest.py`：一个脚本装 6 个舱的 BUILDERS，按舱跑
  （`-- bridge|cam|engine|fun|power|transit`），避免一次 34 件把 Blender 拖住。
  - 驾驶舱 7：指挥圆桌（环桌 + 全息柱 + 八组操作块）/ 结构柱 / 边柜 / 指挥椅 / 导航台 / 记录台 / 环屏
  - 监控室 5：编解码机架 / 档案箱 / 3×3 监控墙（含墙下操作台）/ 服务器柜 / 操作台
  - 引擎舱 6：反应堆（双发光环带 + 三根冷却管）/ 气缸组 / 压缩机 / 保险面板 / 零件车 / 工具台
  - 娱乐舱 7：点唱机 / 游戏桌 / 吧凳 / 茶几 / 街机柜 / 赛车座 / 沙发
  - 配电舱 4：仪表架 / 开关柜 / 变压器 / 断路器排
  - 餐厅 5：饮料台 / 餐盘回收车 / 餐桌（带连体凳）/ 服务台（挡板玻璃）/ 餐盘车
- 读数：**61 个 kind 全部有本体**，`cover_refs.json` 缺模型 **0**；
  面数 **60–1332**（预算 1500，**0 件超**）、体积 **8.6–158.3 KB**、合计 **2.3 MB**；
  `3d:assets` 0 错误；`--arttest` 127 件 / 0 不一致；`--devicetest` 通过；导入 0 脚本错误；
  六舱各出一张 `covers-<room>.png` 实机样张。
- 踩坑（注释都留在代码里）：
  1. **占地口径错**（这一批的主要错误来源）：`fun_stool` 三条腿只朝 Y 伸 → X 向 0.57（占 0.8）；
     `cam_screenwall` 只有墙没有台 → 进深 0.47（占 1.3，会被拉 2.8 倍）；
     `engine_fusepanel` 只是一块 0.2 米厚的立板（占 1.2，纵深拉 6 倍）；
     `power_gauge` 支架进深 0.32（占 0.8）。都靠「补台体 / 圆盘底座 / 落地柜」撑满。
  2. **柜类顶板 = 一块白板**：顶板与柜体同深时，26° 视角下整块顶盖把柜门全挡住，
     远看就是白板。统一收到 0.38–0.42 倍进深并改暗色。
  3. **点唱机「拱」写成立式圆柱**：`D*0.70` 高 → 整体 2.16 米（档位 1.30），改平顶灯箱 + 压扁圆顶。
  4. **街机屏埋进机身**：机身前沿在 -0.33D，屏放在 -0.30D → 屏幕看不见；挪到 -0.38D。
  5. **监控墙三排屏重叠**：屏高仍按旧起始高度算，三排互相盖住成一条带；按新起始重算。
  6. **顶光照度过头**：检查板棚灯把金属顶面打成纯白，误判了两轮；key 3000→1500、
     fill 1100→520、rim 1400→700。这条改的是**验收工具**，不改模型。
- 覆盖口径：**61/61 kind 全部有 GLB**，未做的只剩「别的舱的墙体/地板/设备贴图」与角色资产。
- 下一步建议：① 把生态舱那 8 件从自带的重复图元迁到 `covers_lib.py`（纯整洁，不改外观）；
  ② 掩体之外的设备（`device_*`）也按这套流程补本体；③ 3D 侧的 LOD/合并绘制（现在 127 件各是一个节点）。


## 2026-11-06 · 掩体本体第三批（军械库 6 类，共 27/61 kind）

- 新增 `build-covers-armory.py`：枪架 / 枪械工作台 / 射击位 / 弹药箱堆 / 发放台 / 台钳工位。
  军械库和仓库最容易「串味」，所以每件都带一件标志物：枪、靶纸、箱盖、铁栅、钳口。
- 新增 `3d/tools/cover-shot.py`：单件特写（3/4 前视 18° + 近俯视 78°），
  检查板上 26° 看不清某一件时用它，比反复重排整张板快得多。
- 读数：6 件 **180–1332 tris / 22–159 KB**，`3d:assets` 0 错误；
  `--arttest` 127 件、0 不一致；Godot 导入 0 脚本错误；样张 `covers-armory.png`。
- 踩坑（都写进注释）：
  1. **枪管用成立式圆柱**：`cyl()` 默认竖放，`_rifle()` 里忘了换 `hcyl(axis='x')`，
     结果每支枪多出一根 0.39 米高的柱子，枪架高度从 1.30 涨到 1.52、面数 1800 超预算。
  2. **货架顶板又踩一次**：枪架做了整块顶梁，俯视只看得到一块板 —— 仓库批刚踩过，这里换两根梁。
  3. **两只弹药箱在 X 上重叠 0.5 米**：远看是一大块方箱；改成 0.46W + 0.42W、中间留 0.13 米缝。
  4. **箱盖比箱体还大、还用了亮金属**：在棚灯下整片爆白，看着像一块悬空白板；
     缩到箱体的 0.94 倍、只掀 14°、换暗色。
  5. **靶环用了立式圆柱**：成了一张平放的红饼；改成沿 Y 躺的圆盘才「面向玩家」。
  6. **台钳只做了 0.46 米宽**：地图给的是 1.2×1.2，Godot 会横向拉 2.6 倍；
     补成「1.1 米钳工台 + 台钳本体」撑满占地（这条最隐蔽 —— 建模本身没问题，是**占地口径**错了）。
- 下一步：其余 6 舱 34 个 kind（餐厅 / 娱乐 / 引擎 / 配电 / 监控 / 驾驶舱）。


## 2026-11-06 · 掩体本体第二批（仓库 6 类 + 医疗 7 类，共 21/61 kind）

- 背景：第一批只做了生态舱 8 类（1×1 归一化模型）。扩产时撞到一个口径问题：
  **仓库货架是 1.4×6.9 米、手术台 3.6×2 米**，继续用「1×1 再缩放」会把几何拉成一条面片。
- 本批三件事：
  1. **抽出共享库 `3d/tools/covers_lib.py`**：材质 / 图元 / 归一化 / 逐类导出 / 检查板排版。
     每个舱只剩自己的 `BUILDERS`，不再复制 500 行机器代码。
  2. **改成按真实尺寸建模**：footprint 取 `map_v2.json` 里该 kind 的最常见 `w×h`，高度取档位。
     模型自己知道多大 ⇒ 同 kind 的其它件只做小幅拉伸。
     `3d/tools/measure-cover-refs.py` 从**导出物实测**包围盒，写 `3d/preview/data/cover_refs.json`（21 个 kind）；
     Godot 侧 `_cover_ref()` 按「地图尺寸 / 建模尺寸」缩放，高度不会再被压扁。
  3. 新增 `build-covers-warehouse.py`（6 类）、`build-covers-med.py`（7 类）。
- 读数：13 件 **156–1140 tris / 20–142 KB**，全部在 1500 预算内；`3d:assets` 0 错误；
  `--arttest` 127 件、0 不一致；Godot 无头导入 0 脚本错误。
  样张 `3d/assets/renders/covers-warehouse.png`、`covers-med.png`（检查板）与
  `3d/preview/screenshots/covers-{warehouse,med}.png`（引擎内 `--covershot`）。
- 踩坑（都写进代码注释）：
  1. **`matrix_world` 不刷新**：改完 `location/rotation_euler` 立刻读 `bound_box` 拿到的是旧矩阵，
     于是 7 米货架被判定成「1.4 宽」、没被转正，检查板上成了一根竖塔。`bbox()` 里加 `view_layer.update()` 解决。
  2. **整块顶板会把货挡死**：第一版货架做了整块 cap，俯视只看得到一块板；改成只留边框。
  3. **四层货位顶穿檐板**：1.30 米的架高塞四层，顶层货高 1.50/1.62。改三层并把桶压到 0.40。
  4. **手术台的无影灯嵌进床垫**：高度只有 1.30（anchor），吊顶灯根本放不下；
     改成「床 + 头端监护屏 + 侧挂器械盘」，并让床面真正坐在立柱上（第一版悬空 0.26 米）。
  5. **病床护栏低于床面**：整排栏杆埋在床垫里，实机上等于没有护栏。
- 口径说明：生态舱那 8 件仍是 1×1 归一化模型（refs 表里 [1,1,1]），**没有重做**；
  两种口径由 `cover_refs.json` 统一，行为一致。
- 下一步：其余 7 舱 40 个 kind（军械 / 餐厅 / 娱乐 / 引擎 / 配电 / 监控 / 驾驶舱），
  以及把生态舱那批也迁到 `covers_lib.py`（现在它仍自带一套重复的图元函数）。


## 2026-11-06 · 掩体本体第一批（生态舱 8 类，GLB 进 Godot）

- 背景：`HANDOFF §12.5#3` —— 127 件掩体全是「盒体 + 贴图 tint」，房间专属只到材质，这是铁板感的根因。
  本批先切**一个舱**做样板，验证「程序化本体 → GLB → 按 kind 实例化」这条路。
- 新增 `3d/tools/build-covers-ecosys.py`：8 个 kind 各建一套网格（树 / 培养罐 / 水池 / 灌木 / 制氧机 /
  种植架 / 灌溉台 / 温控台），**1×1 足迹 / 高度 1.0 / 底面中心为原点**，
  与现有盒体同构 —— Godot 侧按 `(cover.w, tier 高度, cover.h)` 缩放即可，不改碰撞。
  产物：`3d/assets/models/covers_ecosys.blend`、`3d/assets/export/covers/*.glb`（8 个）、
  `3d/assets/renders/covers-ecosys.png`（检查板）。
- `3d/preview/scripts/map_builder.gd`：新增 `_cover_model()/ _add_cover_model()/ _add_collision()`；
  `_build_cover()` 先试 GLB，命中就换视觉、碰撞仍按盒体加；**找不到 GLB 静默回退盒体**，
  旧 kind 与其它 9 间舱完全不受影响。
- `3d/preview/scripts/main.gd`：新增 `--covershot <room_id>`（舱内平视截图，
  俯视会被船舱顶板挡住 —— 第一版试过，拍到的是顶板底面）。样张 `3d/preview/screenshots/covers-ecosys.png`。
- `3d/spec/assets.manifest.json`：登记 8 件 `category: cover` 资产（status=wip，预算 1500 tris）。
- 读数：8 件 **128–552 tris / 14.9–48.9 KB**，全部在预算内；`--arttest` 件数=127、设备顶面 0 不一致；
  `--devicetest` 通过；Godot 无头导入 **0 脚本错误**。
- 踩坑（写进脚本注释）：① `accent` 档在 Godot 只缩到 0.55 高，几何必须从 z=0 长起来，
  否则被压成悬空薄片（灌木第一版就是这样，截图一眼看出）；② 自发光 2.2 会爆白，降到 1.05。
- 下一步：其余 9 舱 53 个 kind 按同一模板扩产；扩产前先把「同 kind 多件」的尺寸差异
  （如水池 4×2、巨树 2.8×2.8）用 uniform 缩放还是分尺寸建模定下来。

# 3D 子项目变更记录

## 2026-11-06 · 19:00「继续」：设备台座收尾 + SDXL 真图全链路实测

### 设备贴地修复（上一批登记的已知限制）

- `3d/tools/patch-map-builder.cjs` 新增第 5 处幂等改动 → `map_builder.gd` 的
  `_build_device_pedestals()`：给 26 个任务点 + 电闸中**无掩体顶面的 23 个**补
  **0.55 m 无碰撞台座**（`_add_box(..., false)`），颜色取该舱 `theme.mark`。
  台座是纯 3D 表现层：**不进 `map_v2.json` 的 cover、不占通行碰撞、
  不进门净空判定**，方案层 127 件与 82 项校验不变。
- `scene_extras.gd` 的 `_cover_top()` 兜底 `0.02 → 0.57`（台座顶 0.55 + 0.02 间隙），
  两处调用（26 任务设备 / 电闸）同时对齐。
- 为何不直接补掩体：23 个缺口里有 6 个落在门净空或主通道，补实体会挡路。
- 复跑：Godot 无头导入 0 脚本错误；`--arttest` 件数=127 / 不一致=0；
  `--devicetest` 27 设备全过；`--mgtest` 10/10；`--shot` 新实拍
  `3d/preview/screenshots/preview-v2-pedestal.png`。

### SDXL → grade → Blender 三阶段真跑（不再是 dry-run）

- `3d/tools/room-wall-art.py` 新增 `--only`（支持逗号分隔多件，便于出样张）。
- `--stage sdxl --only med_vitalscreen,fun_neonsign --execute`：本机 GPU diffusers
  （`D:\ai-models\sdxl-base` fp16 + `vae-fp16-fix`，512² / 12 步 / CFG 6.0，
  `C:\Python314\python.exe`）出 2 张原图，**43.1 s / 36.1 s**、seed 802 / 602。
- `--stage grade --room med|fun --execute`：2 张 512² 成品（降亮 / 冷调 /
  4px 扫描线 / 64px 网格 / 暗角）；SHA256 已登记 `3d/ASSETS.md`。
- `blender -b -P ... -- --stage blender --test`：**exit 0**，出
  `3d/assets/renders/room-wall-all.png`（10 行 × 4 列，娱乐室紫色与医疗间青蓝
  两块贴真图、其余 38 块主题色占位）+ `3d/assets/models/room_wall_all.blend`。
- 剩余 38 张墙饰底图待批量（约 30 分钟，建议逐舱放行）。

### 状态与边界

- MCP 连接器 19:00 复核仍为「无连接器」；「信任 + 重开会话」是唯一剩余的用户
  UI 操作，Agent 无法代做。市场里查到的官方 `godot-mcp` 插件依赖
  `godot-test.gwb.qq.com` 外部后端，不符合本地口径，未采用。
- `js/data/map.js`、`map.json`、`main.gd`、`test-v3.cjs` 仍未改动（ADR-0002）。

## 2026-11-06 · Godot 主场景接上 v2 布局（17:51「全权授权」后完成）

- 新增 `3d/tools/build-map-v2.cjs` → `3d/preview/data/map_v2.json`：
  **原 `map.json` 的完整副本，只替换 `cover` 59→127 与 `decor` 32→40**；
  rooms / walls(110) / points(26) / pipes(8) / facility(6) / art / theme 全部原样保留，
  任务点、交互半径、门与管道口径不变。同时产出 `cover_height_v2.gd.txt` 供核对。
- 新增 `3d/tools/patch-map-builder.cjs`（幂等）→ `map_builder.gd` 四处改动：
  `MAP_PATH` → `map_v2.json`；`COVER_HEIGHT` 并入 61 个房间专属 kind 的名义高度
  （anchor 1.30 / mid 0.95 / accent 0.55）；掩体底色改取该舱 `theme.mark`
  （不同 tint 由 `_material` 缓存成独立材质，**不跨舱复用**）；新增
  `_build_wall_decor_v2()` 渲染 40 件贴墙板（取 `theme.glow`，带自发光）。
  **未走 GLB**：GDScript 沿用既有 `(x,y)→(x,z)` 口径，不需要坐标转换。
- 实测（Godot 4.6 stable / 2.5D 门禁）：
  - 无头导入 **0 脚本错误**（修过一处 `Variant` 推断被当错误的告警）。
  - `--arttest`：`theme=10/10 件数=127 实例 hz=[1.00,1.00]`，
    `设备顶面一致性 检查=3 不一致=0`。
  - `--mgtest` **10/10 pass**；`--devicetest` 27 设备 / 14 玩法，
    开关与取消全过；`--shot` 出主场景实拍 `3d/preview/screenshots/preview-v2.png`。
  - `npm test` 第 3 次 **826 通过 / 0 失败**；前两次偶发 1–2 项 AI 投票断言抖动，
    与本批无关（本批未改任何 `js/`）。
  - `--e2e` 在 headless 下 `open=false` 且超时，**旧布局复现同样结果**，非本批回归。
- 已知限制：v2 布局任务点不再都压在掩体内，ART 只有 3/26 设备命中掩体顶面，
  其余设备贴地（交互不受影响，属美术细节，留作后续优化）。
- **边界**：`js/data/map.js`、`map.json`、`blender-ship.py`、`main.gd`、`test-v3.cjs`
  全部未改。按 ADR-0002，3D《启航路》是独立子产品，不替换 2.5D 主产品。
- MCP 客户端状态：`list_installed_plugins` 返回「无连接器」，
  「信任 + 重开会话」仍需用户在 UI 操作，Agent 无法代做。

## 2026-11-06 · MCP 工具链装 F 盘 + 场景重构（场景层，17:34 用户裁定后）

### 安装（全部在 `F:\AI-MCP\`，约 196 MB）

- uv 0.13.7（GitHub release 独立 zip，不占 C 盘）；`mcp-for-blender` 2.2.7 用
  `UV_TOOL_DIR` / `UV_CACHE_DIR` / `UV_PYTHON_INSTALL_DIR` 全指向 F 盘；bundled addon
  （v1.8）放 `F:\AI-MCP\blender-scripts\addons`，靠 `BLENDER_USER_SCRIPTS` 加载；
  `@coding-solo/godot-mcp` 0.1.1 装 `F:\AI-MCP\godot`（npm cache 也在 F 盘）。
- 客户端配置 `~\.workbuddy-ai\mcp.json`（唯一 C 盘例外）：`blender` 指向
  `F:\AI-MCP\bin\mcp-for-blender.exe`，`godot` 指向 F 盘 `build/index.js` 且
  `GODOT_PATH=E:\ai-tools\godot\Godot_v4.6-stable_win64_console.exe`。
- **按裁定放开写入**：不设 `BLENDER_MCP_SAFE_MODE`；保留 localhost:9876、
  `DISABLE_TELEMETRY=true`。GUI 启动脚本 `Start-BlenderMCP.ps1` 做 5.2.2 版本断言、
  开 `auto_start_server`、调用 `blendermcp.start_server`，并把 Poly Haven / Sketchfab /
  Poly Pizza / Hyper3D / Hunyuan3D / Tripo / Meshy 全部置 False。
- 实测：Blender 5.2.2 LTS（hash `d13f752e3b9c`）addon 注册成功、F 盘脚本路径生效、
  内置 requests 2.32.3；Godot MCP stdio `initialize` 握手返回 `godot-mcp 0.1.0` 并识别
  4.6 console exe；`blender -b` 下 addon 按设计拒绝起 socket（需 GUI）。
  **客户端「信任」与重开会话仍需用户操作**，本轮 Agent 未启动常驻 MCP 服务。

### 场景重构（只落场景层）

- 新增 `3d/tools/export-layout-v2.cjs` → `3d/preview/data/layout-v2.json`：
  10 舱 / 127 掩体 / 40 墙饰 / 110 墙段 / 22 门 / 26 任务点，房间专属 kind 61 类，
  平均占用 21.9%。**不覆盖 `map.json`**。
- 新增 `3d/tools/build-scene-v2.py` → `3d/assets/models/ship_scene_v2.blend`
  + `3d/assets/renders/ship-scene-v2.png`：Blender 5.2.2 LTS 实测 **exit 0 / 2.31 s**，
  **289 个对象**，按舱室分 Collection；墙为 0.34×3.0 m 实体、门洞由既有墙段留空；
  掩体按 anchor/mid/accent 三档高度、颜色取 `rooms[].theme.mark`；墙饰贴墙竖直板取
  `theme.glow`。预览为 1200×1150 正交俯视，日志入 `tools/logs/scene-v2-*.log`。
- 这就是后续 MCP 活会话可直接改写的场景起点。
- **边界（当时的状态）**：`js/data/map.js`、`3d/preview/data/map.json`、
  `blender-ship.py`、`map_builder.gd` / `main.gd`、Godot 主场景、`test-v3.cjs` 未改。
  Godot 接线已于 17:51「全权授权」后在下一批完成（见本文件最上方段落）；
  实际做法是直接 GDScript 读 2.5D 坐标，不需要 GLB 坐标转换。
- 裁定记录：`3d/DECISIONS.md` ADR-0010；工具说明 `F:\AI-MCP\README.md`；
  `AGENTS.md` 本机环境表已登记 F 盘路径。

## 2026-11-06 · Blender / Godot 的 AI（MCP）接入插件调研（**调研阶段，先于本批**）

- 用户要求「先去开源社区找一下」两类插件以优化工作流。新增
  `docs/调研报告_Blender_Godot_AI_MCP插件_20261106.md`，用 GitHub REST API 实拉
  stars / license / pushed_at，逐个核 README 与 Godot Asset Library。
- 首选：Blender `ahujasid/mcp-for-blender`（原 `blender-mcp`，MIT / 33,442 stars /
  2026-11-04 推送 / Blender 3.0+ / 需 uv）；Godot `yurineko73/Godot-MCP-Native`
  （MIT / 872 stars / 原生 GDScript 零依赖 / 推荐 4.5+ / 155 工具 / gdmcp CLI 渐进发现）。
  备选 `Coding-Solo/godot-mcp`（6,535 stars，但 2026-04-16 后停更）。
- 标红：`yanhuifair/Godot-MCP` 的 2026-06 推广文写 MIT，但 2026-11-06 GitHub API
  实拉为 **AGPL-3.0**（采用前须复核）；`GDAI MCP` 是 $19 一次性付费闭源，不符合开源前提；
  `ee0pdt/Godot-MCP` 最后推送 2025-03-19。
- 本机实测前置：`uv` / `uvx` **未安装**；Node 22.22.2、Godot 4.6 console exe、
  Blender 5.2.2 LTS 均在；`~/.workbuddy-ai/mcp.json` **不存在**。
- 边界：**未装 uv、未装任何插件、未写 MCP 配置、未改工程文件**；
  仅在 `3d/WORKFLOW_SDXL_BLENDER.md` §8 登记为「待评估」，接之前须守住
  唯一权威 Blender 版本、禁用外部资产库 / 云端 3D 生成、产物仍走 `3d:assets` /
  `3d:import:check` 门禁。是否放行由用户裁定。

## 2026-11-06 · 全船掩体重构方案（方案层，未改运行时）

- 依据用户对 `tools/ship-layout-overview.html` 总体思路的七条意见，新建方案链：
  `tools/ship-layout-spec.cjs`（真源）→ `ship-layout-build.cjs`（自动避让）→
  `ship-layout-plan.json` + `ship-layout-overview.html` → `ship-layout-check.cjs` →
  `ship-layout-report.md`；现状快照留存 `tools/ship-layout-current.json`。
- 规则 R1–R8：门厅净空 ±2.2×3.2 格、主通道 2.4 格、占用率 18–30%、任务点 2.5 格内
  有道具、每舱 ≤4 分区 / 每区主类 ≤2 / 同类不跨区 / 三档层次 / 成组率 ≥0.65、
  素材房间专属、墙饰贴墙且绑定 `rooms[].theme`。
- 全 10 间重排：掩体 **59 → 127 件**、墙饰 **40 件**、房间专属 kind **61 类**、
  平均占用 **13.5% → 21.9%**（最低 18.4 / 最高 26.9）；医疗间 14.5% → 26.9%，
  娱乐室由散点改为四象限（左墙机廊 / 上墙模拟机 / 右上桌游 / 右墙休息）。
- 素材唯一性：kind / asset / 提示词 / seed / 贴图目录全部带房间 id，
  全局 `table` / `console` / `crate` 等复用 kind 全部取消；仓库两组货架也拆成
  `rack_west` / `rack_east`。
- 新增 `3d/WORKFLOW_SDXL_BLENDER.md` 与 `3d/tools/room-wall-art.py`：
  SDXL 本地出图 → grade 512² → Blender 5.2.2 风格检查板，默认 dry-run。
  **主路径修正**：`D:\ai-models\sdxl-base` 是 diffusers fp16 变体、不是 GGUF，
  且本机 `D:\ai-models\gguf` 无 SDXL 权重；改用本机已实测的 GPU diffusers
  （`gen_sdxl_batch.py` 口径，512²/12 步，约 70–80 s/张，VAE 走 fp16-fix），
  sdcpp q2_K 降级为「补齐 GGUF 后」的兜底，缺权重时脚本直接报错。
- 实测：SDXL `plan / sdxl / grade` 三阶段 dry-run 通过；Blender 5.2.2 LTS
  `--stage blender --room fun --test` **exit 0 / 2.17 s**，出 `3d/assets/renders/room-wall-fun.png`
  （960×901 主题色占位）+ `3d/assets/models/room_wall_fun.blend`，日志入 `tools/logs/`。
  **本轮未实际出 SDXL 真图、未渲染成品贴图**。
- 实测：`node tools/ship-layout-check.cjs` → **82 通过 / 0 失败**；
  Playwright 打开 HTML 无 JS 错误（10 行表格 / 127 掩体 / 40 墙饰），截图
  `tools/screenshots/ship-layout-overview.png`、`ship-layout-fun.png`。
- 边界：**未改** `js/data/map.js`、`3d/preview/data/map.json`、`blender-ship.py`、
  Godot 场景、`test-v3.cjs`；落地需单独放行并重跑 2.5D 门禁与蒙特卡洛。
  决策记录见 `DECISIONS.md` ADR-0009。

## 2026-11-06 · 千问出图：10 舱表面材质 + 26 任务面板参考（游戏外，不进运行时）

- 新增 `3d/tools/gen-art-refs.ps1`（取代同日的 `gen-cabin-refs.ps1`），`-Set cabin|tasks|all`、
  `-Only`、`-Limit`、`-Size`；入口 `npm run 3d:refs:cabin` / `npm run 3d:refs:tasks`。
- 路线用本机实测跑通的那条：`E:\ai-tools\sdcpp\vulkan\sd-cli.exe` + Qwen-Image 2.1 Turbo
  Q4_K_M GGUF + Qwen3-VL-8B UD-Q4_K_XL + `qwen_image_2.1_vae_bf16`，
  8GB 显存按 `clip=cpu / diffusion=vulkan0 / vae=cpu`，Turbo 8 步 / CFG 1.0 / euler。
- **真源纪律**：舱室名、明暗（`rooms[].light`）、accent（`rooms[].theme.glow` 现算十六进制）
  读 `map.json`；任务的玩法 `kind`（13 型）、元素数 `n`、配色 `color`、所在舱室
  读 `minigames.json` + `map.json`。人只写"这东西长什么样"的英文描述。
  accent 十间 = `#F29E38 #29B8F2 #3DD96B #F2A829 #FAC26B #DB47C7 #F5662E #6BDBFA #FAB233 #FABD3D`。
- 出图：cabin **10/10**（约 97 s/张）、task **26/26**（均值 100.1 s/张），0 张坏文件，平均 1.17 MB。
  产物 `E:\ai-models\qwen-image-2.1\output\{cabin-refs,task-refs}\`，
  留档 `docs/qwen21/{cabin-refs,task-refs}/` + `manifest.json`（模型/seed/prompt/许可/耗时）。
- 肉眼抽查：`08-power-wire`（配电室接线）拿到真实走线 + 三处断口 + 暗腔 + 琥珀警示条 + 电弧灼痕，
  与 2.5D"直接操控面板图里的断线"同一读法；`20-cam-code`（监控室编号重连）拿到旋钮选择器 +
  一排重连接口 + 青蓝穿孔板语境。
- **三条已知偏差**（登记进 `3d/ASSETS.md`）：① `n` 是引导不是约束，`n=3` 画出 5 条，
  精确数量要靠建模或裁图；② 面板微标签是糊出来的伪字符，不能当真实编号；
  ③ 这批不是 seamless 贴图，要平铺得走 `tools/gen-materials.py` 的四向镜像拼贴。
- 许可与边界：**Qwen Research License 非商用**，本批只是游戏外参考，
  **不在任何 `res://` 路径下、Godot 读不到**；要进包必须换 SDXL 或另行授权（AGENTS.md §一-6）。
  参考图用途与用户裁定一致：千问出 2D 参考喂 3D 建模，本身不产网格。
- 踩到并修掉的 PowerShell 坑（都写进脚本注释）：
  ① Windows PowerShell 5.1 按 GBK 解码 UTF-8 源码，中文注释吃掉换行 → `UnexpectedToken`；
     脚本加 BOM + `$PSVersionTable.PSVersion.Major -lt 6` 硬守卫，只准 pwsh 7 跑。
  ② `$out` 与 `$OUT` 在 PowerShell 里**是同一个变量**（大小写不敏感），循环把输出目录
     覆盖成文件路径，清单写错位置。
  ③ 函数内的 `Write-Output` 进度行会流进返回值，被外层 `+=` 当结果条目计数（`done 2/5`）；
     函数内一律改 `Write-Host`。
  ④ `-f` 的 `X2` 格式说明符不吃 `double`，`To-Hex` 静默返回空 `#`，第一次试跑的 prompt
     根本没带主题色（改 `[int][math]::Round(...)` 后重跑）。
- 运行时零改动：本批只加美术与工具，`--mgtest` / `--devicetest` / `--powertest` /
  `--interacttest` / `--arttest` 读数沿用上一节。

## 2026-11-06 · 断电链路 + 交互轮盘 + 房间主题色/实例变体（map.json schema v2）

用户三条诉求：能做的交互全部同步、美术重复性太高、拉闸后熄灯完全没体现。本批只做表现与交互，
**不搬 AI / 会议 / 战斗**（2.5D 数值与推理仍在动，搬过去就是背一个会过期的基线）。

### 新增数据契约 `space.json`（第三个导出器）

- `3d/tools/export-space.cjs` → `3d/preview/data/space.json`，`npm run 3d:export:space`。
- 三个真源、三种取法，全部 **fail-loud**（取不到就退出码 1，不做静默兜底）：
  `js/ai/sanity.js` 与 `js/t2/space.js` 是纯模块，Node 里直接 eval（与 `tools/monte-carlo.cjs` 同口径）；
  `js/game.js` 里的散落数值用**具名正则**抠：门扫描 2s、`BREAKER_USE_R=2.0`、圆桌半径 2.3、
  合闸 4.5/3、拉闸 `min(9, 3×n)`、尸体半径 2.2。
- 导出现场读数：门 scan=2s 宽=1.8m 开启半径=3m｜视野 手电 7 / 暗舱近身 2.3 / 走廊 12｜
  站桩 修 10 · 领单 3 · 弹 7 · 医疗 5 · 故障倒计时 30｜圆桌 2.3 尸体 2.2 管道冷却 20。
- `scripts/space_data.gd` 是唯一读取入口；**GDScript 里不再抄任何数值**（COVER_HEIGHT 事故的教训）。
- 走廊顶灯位也进契约：直接调真源 `SKT2Space.corridorLampPos` → **11 条走廊 × 2 盏 = 22 个灯位**，
  不再目测摆灯。

### ① 熄灯（`--powertest` 全绿）

- `map_builder.set_power(on)`：10 盏舱灯 + 22 盏走廊灯一起 `visible=false`、常亮材质降到 0.05、
  环境光 `0.55 → 0.055`、**补光 DirectionalLight `0.28 → 0.02`**。
  补光这一条是关键：原先只切舱灯，画面仍然看得清整间房，"熄灯等于没做"。
- 手电按真源收口径：`spot_range` 从写死的 **24 米改成 `SIGHT.humanLightR = 7` 米**、
  锥角按 `cone_deg/2 = 30°`（`player.apply_space_cfg()`）。24 米是表现比判定还宽容。
- 22 扇门全部改成真门扇 + 碰撞体，口径照 `js/game.js#doorTick`：
  供电正常靠近即开；**断电时 scanT 未满 2 秒一律拦人，扫满才放行，人离开立即重新上锁**；
  会议室三门**不再豁免**（照现行代码与门禁，不照旧 AGENTS 文案）。
  扫描期间画一条红色扫描线随 scanT 由下往上刷（2.5D `drawDoors` 同语义）。
- HUD 加供电读数，文案与 2.5D 监控台同源：`● 10 路在线` / `● 信号中断 · 电闸断开`（红）。
- 实测：`POWERTEST 供电 rooms=10/10 corridor=22/22 ambient=0.550 fill=0.280` →
  `断电 rooms_on=0 corridor_on=0 ambient=0.055 通过=true`、`fill=0.020`；
  门 `0.1s scan=0.10 拦人=true` → `2.0s scan=2.00 放行=true` → `离开后 scan=0.00 重新拦人=true`；
  拉闸时长序列 `3.0 / 6.0 / 9.0 / 9.0`，合闸 `4.5`。
  出图 `screenshots/bridge.png` 与 `screenshots/bridge-blackout.png` 同机位对照。

### ② 交互同步（`--interacttest` 全绿）

- `scripts/ui_wheel.gd`：对应 2.5D `#wheel`，多项共存时列出、`1-9` 或点击选择、ESC 取消。
  2.5D 是环形布局，这里先做竖排列表——验的是"不被固定优先级吞掉选择"，不是复刻像素。
- `main._collect_offers()` 照 `collectInteractions` 的清单与半径逐项接：
  任务设备（`REACH.fix=2.0`）、**电闸拉/合（`BREAKER_USE_R=2.0`）**、管道（异形专用）、
  圆桌领申请单（`2.3` + `qualPending`）、军械/医疗补给（站桩 7 / 5 秒）。
- 站桩 `_start_station / _tick_station`：一移动就中断（与 `tickDoing` 同口径），走完才结算。
- 两处量词修正：圆桌判定照 2.5D 用**到矩形的钳位距离**（`maxf(maxf(lo,0),hi)`），
  不是到圆心距离——后者会要求人站进桌子里；领取点 = 圆桌下沿外 1.2（`roundTableClaimSpot`）。
- 实测：电闸站位 **2 项共存** `["task-7","breaker"]`（配电室里拉闸与电路维修本来就同时够到，
  正是轮盘该出现的场景）；圆桌领取 done=true、`qual_pending 1→0`、`qual 1→2`；
  管道 异形=1 / **人类=0**（复现"人类管道禁用"）；轮盘 打开=true 列出=2/2 选中=task-3 关闭=true。
- 键位差异（**未解决，需要你裁定**）：2.5D 刚把交互并进 `W` 并删掉 `E/Q/X/G`，
  但 3D 的 `W` 是前进键，无法照搬。3D 目前仍用 `E` 交互 + `1-9` 选轮盘项。

### ③ 美术重复性（`--arttest` 全绿，map.json schema v2）

- `3d/tools/export-map.cjs` 现在把**烘焙端的美术真源**一起导出：解析 `tools/blender-ship.py` 的
  `ROOM_THEME`（10 间 × wall/top/glow/gs/mark）、`TINT_SHIFTS`（5 档）、`LED_KEYS`（5 色），
  并在这里复算 `fnv1a32` + `variant()`，把结果写进 `rooms[].theme` / `cover[].v` / `decor[].v`。
  **配方只有一份实现**（导出器），GDScript 只读结果。
- ⚠ 对账抓到真 bug：JS 的 `>>` 是**有符号** int32 移位，哈希 ≥2³¹ 时翻负，
  导致 27/59 件家具的 `hz` 落到 0.70~0.88 的假区间。全部改 `>>>` 后与 Python 原实现
  **逐位一致（91 件 cover+decor，hz/led/segs/tint 四项 0 处不符）**。
- 3D 侧接了三处：墙面按所属房间取 `theme.wall`（`_wall_room` 用 poly 内外探测）、
  **新增墙顶发光色带**（`theme.top` 底色 + `theme.glow` 自发光 × `gs`，断电时跟着暗）、
  家具按 `v.tint` 取 5 档色调、按 `v.hz` 做 ±10% 高度变体。
  `_cover_top()` 同步乘 `hz`，否则箱体缩了设备没缩会浮空——`ART 设备顶面一致性 检查=18 不一致=0`。
- 实测：`ART theme=10/10 墙面色差档=10 色调档使用=5 种 实例 hz=[0.90,1.10] 件数=59`。
  改前是**全局一套墙面材质**（色差档 1）。走廊出图可见两侧墙顶色带随房间变化、门口那道绿色
  就是生态舱主题光。
- `WALL_TINT_BASE = (0.74,0.78,0.84)` 是 3D 实时曝光对 Cycles 的**全局**补偿系数，
  不参与房间区分；房间之间的相对色差完全由真源决定。

### 门禁与遗留

- `--mgtest` 10/10、`--devicetest` 27 devices / 14 kinds、`--arttest` / `--powertest` /
  `--interacttest` 全绿，七个脚本 `--check-only` 零语法错误。2.5D 侧本次未改动。
- 未做（保持可见队列）：故障维修（3D 没有故障源，需要一个非 AI 的触发入口，等你裁定怎么做）、
  管道**出口选择** UI（现在只报入口与冷却）、尸体类交互（搜尸/拖尸/施救/报告，要对局状态）、
  舱外甲板禁走、碰撞盒收缩对齐判定（墙 −0.20 / 掩体 −0.23）、`base-lit.png` 与实时曝光的
  四态亮度基线（2.5D 的 `ux-audit` U6 口径）。

## 2026-11-06 · 掩体/装饰高度表对账（对齐烘焙真源，39 件家具脱离默认值）

- **根因**：`COVER_HEIGHT` 曾被抄成两份（`map_builder.gd` + `scene_extras.gd`），且键名是照着
  一套不存在的词表写的 —— 24 种 kind / 59 件掩体里**只命中 20 件**，其余 **39 件全部落到默认 1.0 米**；
  表里 `desk / rack / screen / bed / locker / bookshelf / barrel / cryopod / vending / terminal /
  plant / tallplant / bin / sink / cooler / lamp / rug` 17 个键在 `js/data/map.js` 中一个都不存在。
- **真源**：新表逐项取自 `tools/blender-ship.py` 的 `furniture()` 各分支顶面 z1（名义值，
  烘焙端每件再乘 `hz = 0.90~1.10` 实例变体）。典型修正：`pond` 1.0→**0.10**（水池不再当墙）、
  `tank` 1.0→**1.95**、`shelftall` 1.0→**2.05**、`screenwall` 1.0→**1.78**、`reactor` 1.0→**1.72**、
  `medbed` 1.0→**0.74**、`pallet` 1.0→**0.85**、`crate` 1.2→**0.84**、`fridge` 1.9→**1.46**。
- **单一真源**：`scene_extras.gd` 删掉重复表，改 `preload` 引用 `map_builder.COVER_HEIGHT`。
- **连带修掉两处被错表掩盖的问题**（都是数据修对后立刻暴露的，不是新机制）：
  1. `_cover_top()` 原有的 `minf(height, 1.25)` 夹取是照着「未知掩体都 1.0 米」调的；表修对后
     会把设备压进高柜机身（培养罐 1.95 / 监控墙 1.78 整台吞掉设备）⇒ 去掉夹取，设备回到真实顶面。
     受影响 8 个任务点：引擎组同步 1.74、培养罐补液 / 温控面板 1.97、氧气循环 1.62、
     药柜 / 消毒循环 1.48、监控墙重连 1.80、变压器换芯 1.12。
  2. `_build_cover()` 的 `height > 0.2` 才生成碰撞是替不存在的 `rug` 留的；2.5D 里凡 `cover`
     都是硬阻挡 ⇒ 改为恒生成碰撞，否则 `pond`(0.10) 会变成可穿。
- **decor**：新增 `DECOR_Z`（kind → [底, 顶]，同样取自 `furniture()`）。10 件原先落进
  0.35 米扁盒的装饰（呼吸机 3 / 餐盘堆 2 / 街机 / 座椅 / 控制台 / 输液架 / 盆栽）按真实区间生成；
  `plate_stack` 与 `pot` 是**台面件**（底面 0.84），原先趴在地上；`camera` 是**壁装 1.68~2.04**，
  原先错误吸顶在 2.85；`holoscreen` 0.9→**1.62**。
- **划掉一条伪问题**：文档里「`cover` 的旋转信息未使用」不成立 —— 实测 `cover` 与 `decor`
  的 `rot` 字段各 **0 件**，2.5D 根本没有旋转数据。
- **门**：`rooms[].doors` 合计 **22**，与 2.5D 运行时 `G.doors` 口径一致，分舱也合理
  （bridge 4 / ecosys 4 / med 3 / cam·transit·fun·armory 2 / power·engine·warehouse 1）。
- **实测**：`--devicetest` 27 devices / 14 kinds，open/closed/cancel 全 true；`--mgtest` **10/10**；
  无头冒烟零脚本错误；`--devshot 0,5,14,19` 出图确认设备坐在设备顶面、未被掩体吞掉。
  2.5D 侧本次**未改动任何文件**（只动 `3d/preview/scripts/map_builder.gd` 与 `scene_extras.gd`），
  故不声明门禁读数；2.5D 门禁以现跑为准（见根 `AGENTS.md` §六）。
- **仍未做**：家具仍是盒体代理（真实形状要按 kind 出 GLB，`pond / tank / pallet / engineblock` 优先）；
  实例级 ±10% 高度变体未复刻；门扇不参与碰撞；舱外甲板仍可走。

## 2026-11-06 · 26 任务定制同步 + 桌面快捷方式

- `minigames.json` 新增 `tasks`（26 任务 / 14 玩法 / 独立提示与配色），由 2.5D 真源导出。
- 3D 小游戏层读取任务标题/提示/配色；新交互 `sequence / sort / valve / code` 暂时映射到
  `match / place / lever / sync`（`BASE_FALLBACK`），保证 27 个设备都能打开。
- `--devicetest` 现在报告 27 devices / **14 kinds**；`--mgtest` 仍覆盖 10 个基础交互。
- 桌面已创建 `启航路 3D 版.lnk`（目标 Godot 4.6 标准版 + `3d/preview`），双击即开。
- `npm test` 2.5D 门禁 785/0；`3d:assets` 29 项 / 0 错误；`3d:import:check` 0 差异。
- 注意：2.5D 的 almost 阵营分流把 AI 对局推到人类 85%，这是 2.5D 平衡问题，
  不影响 3D 预演的交互演示；3D 后续如果接真实模拟，必须先回调这条规则或给异形补偿。

## 2026-11-06 · 管道画风重构（SDXL + Blender + 8 舱铺点）

- **SDXL 贴图**：CPU q2_K 出 `pipe_hatch_raw.png`（256² / 4 步 / seed 29），
  `grade-pipe.py` 压暗、冷调、同心压痕 → `pipe_hatch.png`（512²）。
- **Blender 模型**：新增 `prop_pipe_port.glb`（圆形格栅 + 四螺栓 + 短管口 + 可染色边圈，
  **2336 tris**，低于 prop 3k 预算）；清单 29 项、done 11。
- **2.5D 精灵**：`render-pipe-port.py` 打开 .blend，按 `js/t2/space.js#PIPE_TINT` 染边圈，
  正交俯视渲染 8 舱 `assets/scene/v4/facility/pipe-port-<room>.png`（512² RGBA）；
  `game.js#drawPipes` 直接 drawImage，未加载时回退旧菱形格栅；呼吸环保留。
- **铺点**：`M.pipes` 6 → **8**（新增生态舱 / 娱乐室，除中央会议室与配电室外每舱一个）；
  2.5D 管道菜单、复盘图、AI 管道口供、`pipeRoomIds()` 自动同步。
- **3D 场景**：`scene_extras._build_pipes` 改用 `prop_pipe_port.glb` + 同色发光环；
  新增 `--pipeshot`，截图 `screenshots/pipe-port-3d.png`。
- **实测**：`npm test` **782/0**；`--pipeshot` 出图；`npm run 3d:assets` 0 错误 / 3 提醒；
  `npm run 3d:import:check` 0 差异；1000 局人类 59.5% / 异形 40.5%（含 RUSH 1.5 / 保安 6 格 / 当众合闸）。
- **注意**：2.5D 精灵是 512² 正交渲染，适合俯视底图；3D 用的是同一模型 + 单独染色的边圈，
  不要给单个舱室改形状语言。

## 2026-11-06 · 10 型小游戏全量落地 + 3D 场景装配 + Blender 资产

> 本轮把 2.5D 的 10 种任务小游戏全部搬进 3D，并把 26 个任务点、设施、管道、装饰、门框
> 装配成可走的垂直切片；同时用 Blender 5.2.2 生成 10 件设备/道具 GLB。

### 数据契约

- `3d/tools/export-map.cjs`：`map.json` 补 `schema_version: 1`，重新导出（同步 `dur` 等最新字段）。
- 新增 `3d/tools/export-minigames.cjs`：从 `js/t2/minigame.js#SKMiniGame.data` 与
  `js/data/plates.js#SKPlates` 导出 `3d/preview/data/minigames.json`；
  板图复制到 `3d/preview/assets/plates/panel-fix.png`，运行时路径改为 `res://`。
- `js/t2/minigame.js` 只新增只读 `data` 出口（byLabel / arch / hint / fallback / kinds），
  不改任何玩法逻辑。

### Godot · 小游戏

- `scripts/minigame/minigame_layer.gd`：卡片遮罩、保底倒计时、成功 0.65s 自动收起、
  失败/中断进度清零、Esc 中断；`attention='ui'` 语义与 2.5D 一致。
- `scripts/minigame/mg_*.gd`：10 型玩法全部实现——
  `wire`（直接操作 `panel-fix.png` 里的真实电线，断口是压在电线上的深色块）、
  `place`、`lever`、`sync`、`pour`、`swap`、`align`、`aim`、`match`、`level`。
- 数据入口：`mg_data.gd` 读 `minigames.json`；不在 GDScript 里复制任务映射。
- 每型都提供 `debug_solve()`，走与真实交互相同的内部结算函数，`--mgtest` 无头覆盖。

### Godot · 场景与交互

- `scripts/device.gd`：任务点设备；优先实例化 `res://assets/models/*.glb`，缺失时程序化兜底；
  设备按掩体顶面抬升、正面朝向舱室中心；高于 0.4m 的设备缩到 72%，避免顶到 3.24m 天花板。
- `scripts/scene_extras.gd`：27 个交互点（26 任务 + 电闸）、设施（医疗无人机 / 保安机器人 /
  补给点 / 监控台）、6 个管道口、32 个装饰、22 扇门框。
- `main.gd`：`E` 正对优先 + 距离次之选设备；相机推近到设备屏幕；`player.ui_locked` 冻结移动；
  关闭后恢复相机与鼠标。新增 `--mgtest` / `--devicetest` / `--mgshot` / `--devshot` / `--e2e`。

### Blender 资产（5.2.2 LTS）

- 新增 `3d/tools/build-3d-assets.py`：程序化生成 10 件资产（UV + 内嵌贴图 + 底色/屏幕材质）。
- 面数：device_panel_fix 1838 / device_breaker 510 / device_oxygen 1178 / device_pod 650 /
  device_transformer 962 / device_medbay 974 / prop_crate 648 / prop_table 648 /
  prop_shelf 1080 / prop_pipe_run 552 — 全部低于清单预算。
- 清单 10 项置 `done`；设备原点统一改为 `base_center`（底面中心）。
- `npm run 3d:sync:models` 全量复制；Godot 导入参数按预设把 `meshes/light_baking` 改为 0，
  `npm run 3d:import:check` **0 差异**。

### 实测

- `--mgtest`：**10/10 pass**；失败路径 `held_open=true / closed=true / canceled=true`
  （失败卡片未关闭前保持冻结，关闭后才恢复相机与移动）。
- `--devicetest`：**27 devices / 10 kinds**；打开→解题→收起、打开→中断→收起均通过。
- `--e2e`：真实 E 输入打开「备用配电盘」接线，`open=true`、`closed=true`、`unlocked=true`。
- `npm run 3d:assets`：29 项 / **0 错误** / 3 提醒（仍是 wip 缺源的船体三件；done 11）。
- 截图：`screenshots/mg-*.png` 10 张、`screenshots/device-*.png` 8 张、
  `screenshots/scene-device.png`、`screenshots/e2e-device-minigame.png`。

### SDXL 屏幕贴图

- diffusers 与 sdcpp Vulkan 路径在本机 16GB 内存 / 8GB 显存下均失败
  （`OSError 1455` / UNet 权重 OOM，fp16 / q8 / q4 都试过）。
- 最终走 **CPU + q2_K + 256² + 4 步** 出图成功：
  `sd-cli --type q2_K --backend cpu --params-backend cpu -W 256 -H 256 --steps 4`
  → `3d/assets/textures/device_screen_task_raw.png`；
  再经 `3d/tools/grade-screen.py` 降亮 / 冷调 / 扫描线 / 网格 → `device_screen_task.png`（512²）。
- 已接在 `device_oxygen` / `device_pod` / `device_transformer` / `device_medbay` 的屏幕上；
  `wire` 仍用 `panel-fix.png`，`lever` 仍用 `panel-breaker.png`。
- 这是低步数小图，适合远处/遮罩下的屏幕底纹；特写级 768² 面板留待换机器重跑
  `3d/tools/gen-panel-texture.py`。
- 小游戏尚未写回任务进度；3D 侧仍没有 AI、会议、战斗、导航网格。
- 门框已补，门扇/断电扫描锁、导航网格仍在 backlog。

## 2026-11-05 · 资产工程化预设 + 交接

> 本轮**只预设工程文件与文档，不建模、不渲染、不改游戏逻辑**；
> 同一轮把 2.5D 的 AI 推理优化收尾并暂时结项。

### 新增

- `HANDOFF.md`：交接文档（分支边界、工具链、清单现状、标准流程、未做项、检查清单）。
- `spec/conventions.md` / `asset.schema.json` / `assets.manifest.json`：
  硬约定、schema、**28 项资产清单**（wip 3 / todo 25 / done 0，预算合计 319,064 tris）。
- `spec/godot-import.cfg` + `tools/check-godot-import.cjs`：
  Godot 4.6 glTF 导入参数唯一口径（27 个 key），键名由引擎真实生成的 `.glb.import` 取得。
- `tools/blender-export.py` + `smoke-test.py`：导出预设与无资产自检。
- `tools/sync-models.cjs`、npm 脚本 `3d:assets` / `3d:sync:models` / `3d:import:check` / `plate:build`。
- `preview/assets/import-probe/` + `scripts/probe_gi.gd`：探针模型与 GI 读数验证。

### 实测

- `npm run 3d:assets`：28 项 / **0 错误** / 3 提醒（wip 缺源，属预期）。
- `npm run 3d:import:check`：**0 差异**。
- Blender 5.2.2 LTS 导出自检：44 tris / 4.2 KB GLB，单位与变换检查通过。
- Godot 4.6 stable 无头导入：GI 枚举 `DISABLED=0 / STATIC=1 / DYNAMIC=2`；
  引擎默认 `light_baking=1`（Static），按预设改 0 后 `MeshInstance3D.gi_mode=0`。
- 2.5D 门禁 `npm test`：**737 通过 / 0 失败**；300 局模拟人类 **71.67%**（基线 69.3%，+2.37pp，在 ±3pp 内）。
- 改票量化：早投 14.413 票/局（100% 局发生）、依发言改票 0.417 次/局（28% 局发生，最多 4 次）、早投保留 1.320 票/局。
- 1000 局复核：人类 714 / **71.40%**、异形 285、超时 1，Wilson 95% 68.52%~74.11%；
  相对 69.33% 基线 +2.07pp，与 300 局 71.67% 仅差 0.27pp，结论稳定。

### 决策记录

- 确信 `known` **不松绑**；AI 会议中可依他人发言改票；**「通胀降判断」不做**。
- 千问只做游戏外美术；游戏内贴图仍走 SDXL。墙在 3D 里必须是实体几何。

## 2026-11-03 · 垂直切片

### 新增

- `3d/preview`：Godot 4.6 工程，GL Compatibility。
- `3d/tools/export-map.cjs`：`js/data/map.js` → `3d/preview/data/map.json`。
- 房间 / 走廊 / 墙体 / 掩体的 3D 升维，盒体碰撞。
- `CharacterBody3D` 玩家：WASD、鼠标视角、Shift 加速、手电。
- 2D 角色 `Sprite3D` billboard（`crew-01.png` 第一帧）。
- HUD、自动截图、无头移动/碰撞自测。

### 实测

- 首次导入：17 个资源，零脚本错误。
- WASD：1 秒位移 **4.198524 米**（speed 4.2，最终机位）；首轮机位为 4.199974 米。
- 走廊撞墙：**1.139070 米**后停住。
- 截图：`preview.png`（中央会议室）、`preview-corridor.png`（走廊）；两机位约 **165 FPS**（1280×720）。
- 会议室圆桌改为 `CylinderMesh`，天花板加轻微自发光，避免“黑色大盒子”挡住视线。

### 已知限制

- 门是墙体缺口，没有动画门。
- 家具是盒体代理。
- 角色是单帧 billboard，没有行走动画。
- 没有 AI / 导航网格 / 任务 / 会议 / 战斗。

## 2026-11-12 · 天花板贴图与灯光优化（公开依据登记）

**公开依据**（`docs/ASSET_GOVERNANCE.md` §14 登记表）：Godot 官方
`3d/lights_and_shadows.html`、`standard_material_3d.html`（Emission 不照亮邻近物体；金属度依赖环境反射）、
`rendering/multiple_resolutions.html`；社区已验证排错项
`uhiyama-lab.com/en/notes/godot/standardmaterial3d-basics`（背面看平板须 Cull Mode = Disabled）。
**未直接采用任何公开素材文件**（用户 2026-11-12 裁定：文件使用须逐项批准，方法论与技术指导可直接吸收）。

- **根因**：`_add_polygon_surface` 把顶板法线设为 DOWN，三角形绕序却沿用地板（从 +Y 为正面）；
  仰视时顶板是背面，被默认背面剔除，画面里的「黑天花板」其实是 BG_COLOR 背景。
  此前贴图增强、补光、金属度调整全部无效，因为那块面根本没渲染。
  修：`_build_ceil_deck_mat` 设 `cull_mode = CULL_DISABLED`（薄面非交互，双面渲染无副作用）。
- 材质：`metallic 0.42 → 0.10`（涂漆压型钢漆面属电介质；场景无 sky / ReflectionProbe，高金属度会发黑）；
  灯带 `emission 1.6 → 1.15`（Emission 直接叠加最终图像，Filmic 下过高会过曝）。
- 灯光参数归位：`ceil_fill 0.04 → 0.16`（代码注释原意即 0.16）、`fill 0.06 → 0.10`；
  断电 `BLACKOUT_AMBIENT` 与拉闸语义未动。
- 贴图：`build-qwen-ceilings.py` 增加保均值 / 保色相的明度方差增强（`TARGET_LUM_STD = 0.10`），
  十舱 stddev 由 8~10/255 提升到 20~25/255；`power/engine` 的 0.21/0.19 拉闸亮度档位保持不变。
  `med` 仅 8.9（原千问图本身近乎无纹理，需重新出图，列为遗留）。
- `grade-art-direction-textures.py` 门框算法由「线性乘 0.46~0.52」（把方差压到约 1/255）
  改为「只降均值、保留偏离」。**该改动为源码修正：运行时 glb 内嵌旧图未更新，
  需重跑脚本 + 重导 `door_frame.glb` + Godot 重新导入才在画面生效。**
- 顺带修 `main.gd:6860` 类型推断错误（`var cand_d = float(...)`）；该错误来自并行未提交改动，会阻塞 Godot 加载。
- 验收：`--ceilshot bridge` 前后对比，顶板由纯黑背景变为可见钢板分格与明暗层次；
  `3d:import:check` 0 差异、`guard` PASS、`baseline:check` OK 446、`agent:contract` PASS；
  Godot `--import` 刷新 82 个 `.ctex`（§8B 口径）。

## 2026-11-12 · 拖拽恒入口失效修复（照搬 2.5D 真源）

**真源依据**：`js/game.js:217`（`draggedBy:null` 初始化）、`:2487`（放下清空为 null）、
`:8552-8568`（`D → toggleDrag()` 无条件直达，判定写在动作函数内）、`:8028`（keydown 分支）；
契约 `docs/PORTING_CONTRACT.md:19-21`（输入映射只允许改键位，目标选择仍按 2.5D 规则、不得加额外门槛）；
红线 11 与 AGENTS §二.7（规则同源，禁止 3D 新增状态分支）。

- **历史根因（项目文档已自认）**：`3d/docs/handoff/HANDOFF_2026-11-11.md:14-21` ——
  3D 把 2.5D 的无条件动作键做成「靠近才生成的上下文交互项」，`_update_interaction()`
  在 `_collect_offers()` 为空时静默 `return`，F/R/G/Q/V/B/C 全被吞；旧自测只验
  「offer 里有这个 id」不验 sim 状态写回，故「映射表全绿、实机玩不了」同时成立。
  该静默 return 已由并行未提交改动（恒入口 + `_fallback_action` + `sim.can_act`）移除。
- **本轮残留 bug（仍生效）**：3D 自造 `-1` 作 `draggedBy` 空值
  （`sim_state.gd:805` 跨夜、`:1082` 死亡、`:2210`），但 `can_act("drag"):2817` 用 `!= null` 判定，
  把 `-1` 误判成「已被别人拖」→ 跳过全部候选 → `no_body` → G 键恒入口静默失效；
  `start_drag():2903` 早已兼容两种空值，口径自相矛盾。夹具 `_ability_reset()` 把 `draggedBy`
  设成 `null`，所以 `--abilitytest` 8 项全绿也盖住了它。
- 修：`can_act("drag")` 改为与 `start_drag` 一致的 `!= null and int(...) >= 0`
  （按真源，null 与 -1 都表示无人拖）；夹具改为生产口径 `-1`；新增 ⓪-bis 断言直接验
  `can_act` 兜底路径，堵住「只验 offer 不验兜底」的验收盲区。
- 实跑读数（本次，不沿用旧读数）：修复前
  `ABILITY FAIL 1 项失败 ["can_act(drag) 把 -1 误判为已被拖：no_body"]`；
  修复后 `ABILITY OK 0 项失败`，`⓪-bis can_act(drag) draggedBy=-1 → ok:true target:1`；
  `--b6test pass=6 fail=0`；`3d:import:check` 0 差异 / `guard` PASS /
  `baseline:check` OK 446 / `agent:contract` PASS。
- **仍欠（需用户裁定，本轮未擅自动）**：2.5D 的 S 搜尸 / F 施救 / T 视野 / C 相机 / ESC 暂停
  在 3D 无专用键分支；F/C/V 语义被重排、P 为 3D 自造；`parity-map.json` 只登记一条笼统按键差异，
  `port-manifest.json` 的 S-ACTIONS / S-BODY 状态 `partial` 但 notes 写「全部接通」。
