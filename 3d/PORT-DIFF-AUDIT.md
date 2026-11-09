# 回归 2.5D 真源 · 四域差异清单（只读审计，2026-11-09 21:45）

> 初版为只读审计（21:45）；21:50 起用户授权「逐条核实并动工，先拨乱反正」，第七批按本清单落地。**本文件是事实记录，不是立项清单。**
> 参照物：`新返航录 3D 版/js/`（2.5D 只读基线，等于分离时刻的上游快照，`BASELINE OK 451`；docs 已于 2026-11-09 移出基线）。
> 被审对象：`3d/preview/scripts/sim/*.gd`、`3d/preview/scripts/main.gd`、`3d/spec/*.json`。
> 代码版本：`927637d` + 1000 局报告提交 `850e3aa`。

---

## 0. 先纠正一个前提：四块不是「没搬」

| 真源 | 规模 | 3D 对应 | 官方对账 |
|---|---|---|---|
| `js/t2/ai.js`（AI 推理） | 38 个函数 | `sim/mind.gd` 64 函数 | `parity-map` **SKT2AI 38 synced / 0 pending** |
| `js/t2/decision.js`（会议/发言基础层） | 13 个函数 | `sim/speech.gd` 26 函数 + `lines_data.gd::parse_speech` + `sim_state.gd` 会议段 | **11 synced / 2 adapter**（`stopChatter` / `meetLater`，setTimeout→tick 的运行时适配，属 `allowed_differences` 第 4 条） |
| `js/ai/sanity.js`（数值） | 42 张表 | `data/rules.json#tables.SKSanity` **42 张全导出** + 70 函数指纹 + `dispatch` 13 项 | `3d:parity:check` 通过 |
| `js/game.js`（主循环/会议/出手） | 11877 行 | `sim_state.gd` 68KB / `ai_alien.gd` 24KB / `ai_human.gd` 14KB | `port-manifest` 标 9 ported / 26 partial |

**数值层是同源的**：`rules_data.gd::n()` 从 `rules.json#tables.SKSanity` 读，`CARRY/MEET/VOTE/SHOT/KNIFE` 与 `sanity.js` 逐值一致。
（注意 `sim.json#rules` 只有 21 张表，是 `export-sim.cjs` 给 sim 层用的另一份投影，不是"缺表"。）

**因此差异不是"从零移植四块"，而是四类**：① 接线断开 ② 为读数加的额外限制/放宽 ③ 语义与时序简化 ④ 契约清单自身失实。

---

## 1. 「为了结果好看」留下的额外限制（用户本轮要回归真源的核心）

| # | 位置 | 现状与原文 | 2.5D 真源 | 性质 |
|---|---|---|---|---|
| B1 | `sim_state.gd:738-739`（`knife()`）；`port-manifest A-ALIEN` 重复 | 注释原文：「3D 异形只迁了贴脸出刀，进攻链补齐前**不启用每夜额度**（**只搬限制不搬能力会 0 胜**）」。`knifeUsed` 只累加不 gate | `game.js:7791 startNight` 每夜 `a.knife=1`，与 RUSH 逃逸 / 目标承诺 / 管道突袭 / 异形开枪组合成实测 1.93 刀/夜 | **用「不限制」补偿「能力缺失」**，直接改判定 |
| B2 | `main.gd:1589` | 「残局收尾更慢，用 **26 夜观察窗口**避免把『还能分出胜负』的局误记成超时」（`max_ticks=20000`, dt=0.1, 夜长 75s ≈ 26 夜） | `tools/monte-carlo.cjs` 上限 **15 夜**，1000 局超时 0 | 验收窗口被放宽；3D 窗口更长仍有 40 局超时 |
| B3 | `mind.gd::reset_night` 末尾 `a["heard"] = []` | 每夜清空注意力窗口 | `js/t2/ai.js:253 mindReset` 明确 `heard:(oldM.heard||[]).slice()` **整局累积、不跨夜清零**；注释记载「试过每场重置 10 条：1000 局 0 次触发，机制空转，所以只能是整局口径」 | 3D 实现了 2.5D **明确否决**过的方案 |
| B4 | `sim_state.gd:1461` + `_tick_meeting` | 注释「2.5D 投票是『讨论期陆续投 + 跟票』，**3D 在进 vote 相位时一次结算**」；理由「避免还没讨论就已经投完的假象」 | `js/t2/decision.js::meetLater/stopChatter` 排期逐条发言；`js/t2/ai.js::rev`（信念版本号）决定「听到新东西才改票」 | 3D 有时序顾虑就换掉了真源时序；`cast_vote` 虽记 `vote_change`、`mind.gd` 也有 `rev`，但没有真正的讨论期改票链 |
| B5 | `sim_state.gd:885` | 「3D 用 `power_on` **近似** 2.5D 的 `lightState`（常态/断电两态）」 | `game.js:679/713` `lightState` **0 / 1 / 2 三态**（常态 / 已修好 / 断电），`breakerOnTime()/breakerOffTime()` 依此分叉 | 状态机降维 |
| B6 | `sim_state.gd:1199` `open_meeting_kind` 注释 | 「3D 之前只有 night，导致场均会议 3.0 场 vs 2.5D 9.64 场、驱逐 2.48 vs 4.64」 | `game.js:6876 openMeeting(kind, reporter, victim)` 一开始就有 `pre/day/night` 三类 | 会议种类是**按读数补的**，不是按真源一次搬完（现 8.9 场/局已接近） |

> 另：`MIGRATION §9.3` 与 `port-manifest A-ALIEN` 都把「不启用每夜刀额度」写成合理取舍，回归真源时要连文档口径一起改。

---

## 2. 接线断开：推理算完了，没有接到出手

| # | 位置 | 证据 | 2.5D 真源 |
|---|---|---|---|
| A1 | `ai_human.gd:165` `_shoot_target()` | **全文件零调用**；`_decide()`（L206-320）grep `shoot/fire/枪` 无任何开枪分支；人类 AI 侧无 `sim.shoot()` 调用点。认知层 `best_known_target` / `affordable_almost_shot` 的结果没有消费者 | `game.js:2838/2859/2867` `fireShot(a,s)`，`SHOT.chaseKnown=14 / chaseSus=10` 追猎；实测人类开枪 0.42/局 |
| A2 | `ai_alien.gd:157` | 「2.5D `alienReportWorth` **简化**：看到未报告尸体 35% 概率排误导报告」 | `game.js` 完整 `alienReportWorth` 效用评估 |
| A3 | `ai_alien.gd:272 / 499` | 「`alienPlan disguise` 分支**简化忠实版**」、`alienSupport` 同源简化 | 完整伪装效用表 + 队友支援 |
| A4 | `ai_alien.gd:447` | 「保安机器人只在 `secbotRaidOk`（认出 2+ 队友围捕）时才列为候选 —— **简化版只打医疗机**」 | 2+ 队友围捕判定 |
| A5 | `ai_alien.gd:589` | 「`hideRoomFor` 的**简化**：随机挑一间非 med/bridge 的房间」 | `hideRoomFor` 按距离/视线/热度选 |
| A6 | `sim_state.gd:907` | 第六批已修：`ai_can_see` 原是近身圆近似 + 全局 LOS，现按 `observerVisionAt` 正向移植 | `game.js:1784` |

> 1000 局读数里 `shot_ok 41`（0.041/局，属异形 AI stats）与 2.5D 异形开枪 1.005/局相差 24 倍；
> 3D 报告**未统计人类开枪总数**，所以「人类几乎不开枪」目前是代码侧死代码证据，不是计数证据。

---

## 3. 发言系统与会议：语义/时序差异

| 域 | 项 | 2.5D 真源 | 3D 现状 |
|---|---|---|---|
| 发言解析 | 中文席位 | `decision.js:65 parseSpeech` 用 `CN_SEAT`（一~十五）+ `seatNo()` 补零 `01号` + 正则 `第 N 号/席` | `lines_data.gd:148` 只有 `"%d号"`；`CN_SEAT`/`ROOM_WORDS` 已导出到 `rules.json#tables.SKT2Decision` 但**未被使用** |
| 发言解析 | 时间词 | `decision.js::whenWord()`：白天会说「**昨晚**」，夜会说「今晚」 | 未见对应实现 |
| 发言解析 | 槽位 | `rooms/people/accuse/vote/deny/where/when/claim/support`，claim 六类 `saw_pipe/saw_red/saw_knife/saw_sabotage/saw_bot/saw_breaker` | `lines_data.gd` 大体同源，`claim_kinds()` 从数据读 |
| 发言排期 | 定时器 | `stopChatter` / `meetLater` / `sayStreakOK`；`MEET.endPad=2.2` / `minPlan=5.2` 保证「不前 7 秒热闹后 50 秒死寂」 | `speech.gd` 用每帧 `tick(dt)` + `_streak` + `end_pad/span` 覆盖；**2 个 adapter 属允许的运行时适配**，但覆盖断言口径需逐条核 |
| 发言内容 | 构陷 / 领袖 | `planAlienDeception` / `planMateBus` / `scheduleLeaderOrders` / 背书 / 作证 / 质疑 / 矛盾 | `speech.gd:106/321/394` **已有**；`S-SPEECH` 的 note 说未接是**失实**（见 §4） |
| 会议 | 三类 | `openMeeting(kind, reporter, victim)`：`pre`(50s 不投票) / `day`(60+5) / `night`(35+5)，`MEET.perNight=2`、`reportsPerAgent=2` | `open_meeting_kind` 三类齐全、`_after_meeting` 分流、`reportLeft`/`night_meets` 额度齐全 |
| 会议 | 上下文 | `buildMeetCtx()`（尸体清场前算）、`remainMs`（夜剩余时间）、`reveal=3` 结果公布、`lines/streak/seq/tally/matrix` | 3D 有 `settle_accountability`（`sim_state.gd:1613`）、`matrix`，`buildMeetCtx`/`remainMs`/`reveal` 接线待核 |
| 会议 | 票权 | `known/almost/accuse/suspect` + 假说竞争弃权 + 跟票 + `VOTE.change` 改票/早投 + `SOCIAL.pileOn` + `MISLEAD.bus` + `COFRAME` 名额 | `_close_meeting` 是 `top >= need && !tie`（`sim_state.gd:1602`）+ 一次性 `_cast_ai_votes()`；`vote_score`/`hypothesis_spread` 已实现但改票链未跑 |
| 每夜重置 | agent 级 | `game.js:7791 startNight` 逐人清 `suspect/accuse/path/target/doing/_doing/拖拽/redT/rushT/stunT/隐藏/破坏缓存/错峰 `_delay`/任务计划/避让记忆/杀体记忆/目击记忆/认知 mindReset/机器人/门/故障` | `sim_state.gd:665 _start_night` 只做 `night/night_meets/mind.reset_night()/bots.reset_night()/bot_hp/dmg/power_fixed` + 存活 agent 的 `knife/sabUsed`；**大量 agent 级字段跨夜保留** |
| 跨夜认知 | — | `js/t2/ai.js:199 mindReset` 是**分类型衰减 + 三条护栏**（`CARRY.decaySight .72 / decayHear .45 / staleMul .55 / cap .55`），**不是清空**；保留 `known`、`cred`、`credWhy`、`claimHist`、`trust/grudge/humanT/ally`、`almost`（跨夜保留由 `evalAlmost` 就地推翻） | `mind.gd::reset_night` 逐条照搬衰减；但 `almost` 是**重算清空** `{foe:{},friend:{}}`、`heard` 清空（B3）、缺 `credWhy/claimHist/trust/grudge/humanT/ally/mem/seenBy/seenT/lastBody/tone/noise/redSeen/detainSeen/avoidSeen/alert` |

> **更正**：上一轮诊断说「2.5D 每夜清空认知、3D 的 CARRY 衰减是额外护栏」是**错的**——`mindReset` 本身就是衰减护栏，3D 是照搬的。
> `game.js:7791` 注释「没有跨夜记忆」指的是 `a.suspect`（当前点名对象），不是 `mind.sus` 嫌疑分表。

---

## 4. 契约清单自身失实（前几批留下的错误记录，会直接误导移植）

`3d/spec/port-manifest.json` 的 notes 与当前代码矛盾：

| 条目 | 文档写 | 代码实际 |
|---|---|---|
| `A-COGNITION` | 「parity-map 标 **38 synced / 7 adapter / 25 pending**；envEstimate / 时间线拆谎仍待接」 | `parity-map` 是 **38 synced / 0 pending**；`mind.gd` 有 `env_estimate` / `check_alibi` |
| `S-SPEECH` | 「未接：构陷编排 `planAlienDeception` / `planMateBus`」 | `speech.gd:106 / 321` 已实现 |
| `S-DECISION` | 「`settleAccountability` 身份追责未迁」 | `sim_state.gd:1613` 已调用；`mind.gd` 有 `settle_accountability` |
| `S-MEET` | 「白天/开局会议与紧急按钮未迁」 | `_after_meeting` 有 `MEET_PRE/MEET_DAY`，`open_meeting_kind` 有 night 额度与报告额度 |
| `S-NIGHT` | 「会议暂停、终结者未接」 | `check_terminator` + `_after_meeting` 已在跑 |
| `S-COMBAT` | 「人类 AI 按 `SHOT.chaseKnown/chaseSus` 开枪反制」 | `_shoot_target` 是死代码，**失实** |
| `S-LOOP` | 「AI/战斗/会议的 tick 后续批次接入」 | 已跑通（本条 note 第六批改过，仍标 partial） |

同样滞后：`MIGRATION §9.3` 说 `settleAccountability` 未迁；`MIGRATION §10.5.1` 的三条根因是第五批 20 局旧读数（现 1000 局读数见 `3d-sim1000.md`）。

---

## 5. 事件 / 遥测层（作为差异旁证，非本轮移植重点）

- `simdiff-20261108.md`：2.5D 227 事件 / 40 信封字段 / 26 kind；3D 386 / 34 / 18；**第 1 条事件就分歧**，报告自述「两套是独立实现，逐条对齐不是验收标准」。
- 2.5D 独有 kind：`bot_down / bot_hit / breaker / day / drag_end / drag_start / fix / night / revive / sabotage / shoot / vote`；3D 独有 `chat / meeting / meeting_overtime / qual`。
- 3D 信封缺 `downed / seq / method / gone / from / to / stun / bot / hp / on / state / first / none / bullet / medkit / qual / nights`。

---

## 6. 需要标清的不确定（本轮未逐条下结论）

1. `buildMeetCtx` / `remainMs` / `MEET.reveal` / `VOTE.change` 改票早投 / `MISLEAD.bus` / `COFRAME` 名额：文档说未迁，但 3D 有部分同名或等价函数，**需逐个读实现才能判定是"缺"还是"简化"**，本轮只标"待核"。
2. `RUSH 逃逸 / 击杀加速 / 异形开枪`：`port-manifest S-COMBAT` 说未接，但 `sim_state.gd` 有 `_kill_rush_start`、`ai_alien.gd:346` 有 `sim.shoot()`、`ai_alien.gd:66` 有 `_pipe_move`。同样是"文档 vs 代码"冲突，需逐条核。
3. `check-parity` 的 18 个非真源小数 WARN（`speech.gd` 的 0.94/1.1/0.26/0.24、`ai_alien.gd` 的 5.4/5.8 等）是**局部硬编码**，不等于"42 张表缺失"——表是齐的。
4. 1000 局报告没有统计人类开枪总次数，`shot_ok` 只属于异形 AI stats。

---

## 7. 本轮边界

- 未改工程内任何文件；未新增/删除工程脚本；未重跑模拟；未采新的平衡读数。
- 未把任何读数当作「该改什么」的依据；未写达标线；未自行列下一批立项。
- 完整清单仅落在工作区本文件，供用户裁定后续移植范围。


---

# 附录 · 第七批「拨乱反正」核实与落地（2026-11-09 22:00）

## A. 逐条核实结果（推翻初版若干判断）

| 初版条目 | 核实判定 | 证据 |
|---|---|---|
| 「COFRAME / MISLEAD.bus 未迁」 | **已接，文档失实** | `speech.gd:191-300`（COFRAME chance/maxAccusers/extraWgt）、`:318-387`（busChance） |
| 「RUSH / 击杀加速 / 异形开枪未接」 | **全已接，文档失实** | `ai_alien.gd:60-148` 管道突袭、`:290` 目标承诺、`:338-347` alienFireP、`sim_state.gd:500-502` rushT、`:_kill_rush_start` |
| 「`MEET.reveal` 待核」 | **已接** | `sim_state.gd:1263` 读 reveal、`:1626` 设 result 相位、`:1629` 胜负已定跳过 |
| 「`settleAccountability` 未迁」 | **已接，文档失实** | `sim_state.gd:1613`、`mind.gd::settle_accountability` |
| 「pre/day/紧急按钮未迁」 | **已接，文档失实** | `_after_meeting` 的 MEET_PRE/MEET_DAY、`open_meeting_kind` |
| 「人类 AI 按 SHOT 开枪反制」 | **失实**：`_shoot_target` 死代码 | `ai_human.gd:165` 定义、全文件零调用 |
| 「VOTE.change 待核」 | **确实缺**，且发现新 bug | `cast_vote` 要求 `phase=="vote"` 拒绝讨论期票；`votes.has()` 写在赋值后恒 true |
| 「buildMeetCtx / remainMs 待核」 | 3D 用 `on_meeting_open` + 夜钟暂停等价，无同名函数；**非阻断** | `speech.gd:661`、`_after_meeting` |
| 「每夜 1 把刀被人为拿掉」 | **确认** | 2.5D `js/game.js:4225/4232/7801` 硬 gate；3D `_start_night` 发 `knife=1` 但 `knife()` 只累加 `knifeUsed` |
| 「CARRY 衰减是 3D 额外护栏」 | **初版误判，已更正** | 2.5D `js/t2/ai.js:199 mindReset` 本身就是分类型衰减 + 三护栏，3D 照搬 |
| 「18 张规则表没导出」 | **初版误判，已更正** | `rules.json#tables.SKSanity` 42 张齐全；`sim.json#rules` 21 张是另一份投影 |

**决定性事实**：前几批以「进攻链未齐、只搬限制会 0 胜」为由不启用每夜刀额度，
但 RUSH / 目标承诺 / 管道突袭 / 异形开枪 / 构陷编排均已接入 —— **前提被证伪**，
该限制属于纯粹的额外限制。

## B. 第七批已落地（每项写明 2.5D 真源，不以读数论证）

| 文件 | 改动 | 真源 |
|---|---|---|
| `sim_state.gd::knife()` | 恢复每夜 1 把刀硬 gate（`knife<1 return` / `knife--`） | `js/game.js:4225/4232/7801` |
| `ai_human.gd::_decide()` | 接通 `_shoot_target()` 死代码：有子弹 + 射程内高置信目标 → `sim.shoot()`，`_aiT` 节流 | `js/game.js:2838-2870` |
| `mind.gd::reset_night()` | `heard` 改回整局滑动窗口（原每夜清空正是真源明确否决的方案）；`almost` 改回跨夜保留 | `js/t2/ai.js:253/270` |
| `sim_state.gd::cast_vote()` | 修复 `votes.has()` 写在赋值后的 bug；只在真改票时记 `vote_change` 并带 `from` | `js/game.js:7398` |
| `main.gd::_run_sim1000()` | 观察窗口 26 夜/20000 tick → 15 夜/17250 tick，报告口径同步 | `js/game.js:11054-11058` |
| `main.gd::_run_b6test()` | 修自测夹具（原断言靠 bug 造出的假 `vote_change` 通过），**未回退判定** | `js/game.js:7398` |
| `port-manifest.json` | 8 条 notes 更正 | 代码实证 |
| `MIGRATION.md §9.3` | 标注为历史诊断 + 列出核实结果 | 代码实证 |

## C. 第七批**未做**（事实登记，不是立项）

- `lightState` 0/1/2 三态：3D `power_on` 两态，涉及 5 文件 ~30 处使用点。
- 讨论期陆续投 + 跟票 + `rev` 信念版本号驱动改票的完整时序（3D 在 vote 相位一次结算）。
- `chaseKnown / chaseSus` 追猎分支（本批只接通射程内开枪）。
- `startNight` 逐人清理的 20+ agent 级字段；`mindReset` 的 `credWhy / claimHist / trust / grudge / humanT / ally / mem / seenBy` 等跨夜字段。
- `parseSpeech` 的 `CN_SEAT` 中文席位 / 补零席位号 / `whenWord()`（词表已导出未用）。
- `buildMeetCtx` 完整上下文对象、`remainMs`。
- 小游戏 14→10 型、事件信封 34→40 字段、kind 18→26、parity 非真源小数 WARN。

## D. 边界

- 未采**新的平衡读数**；1000 局报告 `3d-sim1000.md` 是**第七批之前**代码的读数，
  不代表本批代码；观察窗口改为 15 夜后与旧报告也不再同口径。
- 未把任何读数、胜率、门禁绿不绿当作改动依据；门禁/自测只回答「有没有写坏」。
- 未自行列下一批立项；C 节只登记事实，方向由用户裁定。
- §一 12 条红线逐字未动（脚本与原仓比对 3558 字符一致）。
