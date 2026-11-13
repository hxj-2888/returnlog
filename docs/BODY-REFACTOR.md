# 正文可读性改造施工方案（3D 仓）

> **状态**：施工方案（2026-11-13 立），非真源、非规范。服从根 `AGENTS.md` §一红线（逐字副本）、
> `3d/ARCHITECTURE.md` 工程边界、`3d/PORTING_PROTOCOL.md` 逐函数移植口径；冲突时以规范为准并回写本文。
> **适用**：`C:/Users/ASUS/Desktop/新返航录 3D 版` 的 `master`（`3451f7e`）。
> **配套**：2.5D 真源侧见主仓 `docs/BODY-REFACTOR.md`。
> **施工背景**：有其他 agent 并行小修玩法代码，故阶段 A 只有文档层改动；阶段 B（拆函数）须等工作区收敛后启用。

---

## §0 一句话结论

3D 侧已经完成过一轮工程化：`main.gd` 从 9,580 行降到 5,539 行、41 个调试夹具迁出到
`scripts/tests/`、有 `filemap.cjs` 函数索引、`file-budgets.json` 预算棘轮、40 处 `@src` 锚点和 8 项门禁。
**「查一行、定位一个函数」已经不难**；但正文仍是「带索引的单体」——
两个装配/判定巨石合计 9,128 行、10 个超 200 行函数全部登记为「待拆」，
预算把 `main.gd` 锁在 ≤5,550 行，等于承认还没拆完。
另有一处结构性问题：**派生侧工程化程度高于唯一真源侧**（2.5D `js/game.js` 无任何索引），
改造时必须守住红线 11「3D 是 2.5D 的延伸」，不得借拆分之名自造规则。

---

## §1 现状实测（2026-11-13，提交 `3451f7e` 时点）

| 项 | 实测值 | 复测命令 |
|---|---|---|
| GDScript 总量 | **52 文件 / 26,819 行 / 约 1 MB** | `npm run file:check` |
| `main.gd` | **5,539 行 / 159 函数** | `node 3d/tools/filemap.cjs --file main.gd` |
| `sim/sim_state.gd` | **3,589 行 / 124 函数** | 同上 |
| `sim/mind.gd` | 1,803 行 / 80 函数 | — |
| `sim/speech.gd` | 1,551 行 / 35 函数 | — |
| `map_builder.gd` | 1,270 行 / 51 函数 | — |
| `sim/ai_alien.gd` | 1,196 行 / 21 函数 | — |
| 夹具外迁 | `scripts/tests/` 6 个文件约 3,900 行（2026-11-12 批次） | `ls 3d/preview/scripts/tests/` |
| 移植锚点 | `@src` 40 处；`port-manifest.json` / `parity-map.json` / `gameplay-parity.json` 三份对账 | `grep -rho '@src' 3d/preview/scripts --include='*.gd' \| wc -l` |
| 超长函数 | **10 个 >200 行，全部登记待拆** | `npm run file:check` 的 WARN 行 |

**已有预算棘轮**（`3d/spec/file-budgets.json`）：`default_max_lines = 1200`、
`max_func_lines = 200`；单文件额度 `main.gd ≤5550` / `sim_state.gd ≤3600` / `mind.gd ≤1850` /
`speech.gd ≤1600` / `map_builder.gd ≤1300`。文件头注明「额度只许下调，上调须在
`3d/CHANGELOG-2026-11.md` 写明理由并同时下调别处」。

**门禁链**（`npm run check`，`tools/check-all.cjs`，8 项）：
`3d:assets` / `3d:import:check` / `3d:port:check` / `3d:events:check` / `3d:lines:check` /
`3d:parity:check` / `3d:ui:check` / `file:check`。
另有 `audit:parity:strict`、`baseline:check`、`3d:parity:check`、`guard`、`agent:contract`。

**本时点实跑读数**（仅作基线，禁止沿用为后续施工读数）：
`npm run check` 8 通过 / 0 失败；`audit:parity:strict` 总函数 391 / 映射 210 / 自动 68 /
未映射 0 / 守卫缺口 0 / 写入缺口 0 / 3D 独有 0 / 漂移 0；`baseline:check` OK 407 文件；
`3d:port:check` 0 错误 / 1 既有 legacy WARN；`guard` PASS（6 个大图 WARN 不阻断）；
`agent:contract` PASS。

**分支状态（施工前必读）**：本仓 `origin` = `https://github.com/hxj-2888/returnlog.git`，与主仓**是同一个仓库**；
本地 `master` 基于 `08e62ee`，而 `returnlog:3d` 的 `8f879f1` 同基于 `08e62ee` 但多两笔 sync 提交，
改动 12 个与本批高度重叠的文件（`3d/preview/data/*.json`、`port-manifest.json`、`check-parity.cjs`、
`BASELINE.sha256.json`、`js/data/map.js`、`js/game.js`）。**施工期间禁止 push / force push / 切分支 / 处理归位**，
归位需先由人裁定以哪边为准。

**未跟踪临时产物**（不提交、不删除，红线 5）：`3d/TEMP_DEPLOY_HANDOFF.md`（文档自述不要提交）、
`3d/preview/probe_ceil.gd` + `.uid`（用完即删探针）、`3d/preview/reports/`（一次性报告）。

---

## §2 问题定义

1. **10 个超长函数未拆**：`file-budgets.json#rules.max_func_lines_allow` 只是登记，不是解决。
   最长的 `main.gd:_ready` 504 行，同时承担 world / ui / view 三段装配。
2. **装配层与判定层仍是聚合巨石**：`main.gd` 的 role 写「节点装配 + 输入分发 + HUD/面板接线」，
   但 `_collect_offers`（371 行）把交互候选装载和 UI 轮盘混在一起；
   `sim_state.gd` 3,589 行同时装规则、主循环、动作结算。
3. **棘轮额度只是冻结**：`main.gd ≤5550` 而实测 5,539，只剩 11 行余量 —— 任何新功能都会撞线，
   但也没有任何一处被真正拆小。
4. **接手文档成本偏高**：根 `README.md` 第 6 行仍写「玩家除移动外无法进行任何操作」（2026-11-09 分离时刻的
   历史事实，未按现状更正）；`AGENTS.md` 并存两套接手顺序（第 18 行 7 步 / 第 21 行 5 步）；
   本仓没有主仓 `AGENTS.md §零` 那样的读区表；`3d/HANDOFF.md` 869 行、`3d/README.md` 501 行，
   接手顺序列出的文档合计约 4,630 行。
5. **跨仓文档漂移**：主仓 `AGENTS.md §一.13` 仍写「独立仓 `returnlog-3d` 的 `master` 为其镜像」，
   而独立仓已删、用户已裁定「不需要新仓库，全部贴 `3d` 副分支」。此项须在主仓侧修正，本文只登记。

**本方案不解决**：玩法 bug、胜率、美术资产、部署链路、3D 副分支归位冲突。

---

## §3 目标态（三阶段）

| 阶段 | 目标 | 是否碰代码 | 前置条件 |
|---|---|---|---|
| **A · 读区收口** | 统一接手顺序、补 §零式读区表、更正过时状态文案 | 否（仅文档） | 无，可立即并行施工 |
| **B · 长函数拆分** | 按已登记 10 条逐项拆，一次一函数一提交 | 是 | 其他 agent 小修收工、工作区干净 |
| **C · 按职责分文件** | `main.gd` 拆 world/ui/view 三段，`sim_state.gd` 按域拆，额度逐次下调 | 是 | B 完成且门禁全绿 |

---

## §4 阶段 A 文档收口（零代码改动，可立即执行）

> 允许写入：`README.md`、`AGENTS.md`（仅解释层）、`3d/README.md`、`3d/HANDOFF.md`、本文。
> **§一 红线原文一字不动** —— `agent:contract` 会校验 `AGENTS.md §一` 与 `docs/REDLINES.md` 逐字一致；
> 改红线须走 `npm run agent:contract:write` 并同步两仓，属另一批次。

| # | 文件 | 动作 |
|---|---|---|
| A-1 | `README.md` 第 6 行 | 把「⚠ 当前现场状态：玩家除移动外无法进行任何操作」改为「分离时刻（2026-11-09）的历史状态；现状与读数见 `3d/HANDOFF.md` §0 与 `3d/CHANGELOG-2026-11.md` 最新批次」，保留历史事实但去掉误导性现在时 |
| A-2 | `AGENTS.md` 第 18 / 21 行 | 两套接手顺序合并为一套，统一为：`根 AGENTS.md → docs/ASSET_GOVERNANCE.md → BASELINE.md → 3d/HANDOFF.md → 3d/PORTING_PROTOCOL.md → 任务对应 scripts/ 模块` |
| A-3 | `AGENTS.md` 新增 §零 | 照主仓 `AGENTS.md §零` 结构补读区表：默认只读 `AGENTS → 3d/ARCHITECTURE → 任务对应的 scripts/`；默认不读 `scripts/tests/`、`3d/preview/data/`、`3d/preview/assets/` 二进制、`3d/CHANGELOG-2026-11.md` 历史卷、`3d/preview/reports/`；写明「不要全仓 grep，先按路径读」 |
| A-4 | `3d/HANDOFF.md`（869 行）、`3d/README.md`（501 行） | 顶部加「按需读」索引与段落锚点，避免接手必读全文；不改判定口径与读数 |
| A-5 | `docs/BODY-REFACTOR.md` 本文 | 施工完成后回填 §8 实测读数 |

**验收**：`npm run agent:contract` PASS（§一 未变）、`npm run docs:check` 通过、`npm run check` 8/0；
`git diff -- AGENTS.md` 中不得出现 `## 一、红线` 段内的任何行变化。

---

## §5 阶段 B 长函数拆分施工单（待小修收敛后启用）

**前置**：`git status --porcelain` 为空（除 4 类未跟踪临时产物）、确认无其他 agent 正在写目标文件、
阶段 A 已提交。

### B-1 待拆清单（按优先级，行数为本时点实测）

| # | 函数 | 行数 | 目标文件 / 拆法 | 备注 |
|---|---|---|---|---|
| 1 | `main.gd:_ready` | 504 | 拆 `_ready_world` / `_ready_ui` / `_ready_view` 三段，或迁 `scripts/world/world_setup.gd`；原 `_ready` 只留三次调用 | 已登记「待按 world/ui/view 三段再拆」 |
| 2 | `main.gd:_collect_offers` | 371 | 候选装载与 UI 轮盘渲染分离，与 `ui_wheel` 合并收口 | 已登记 |
| 3 | `sim/ai_alien.gd:_decide` | 368 | 拆 `_plan` / `_exec_plan` 两段 | 效用表已按 2.5D `alienPlan` 同源，**不得改评分、不得加 if** |
| 4 | `sim/speech.gd:plan_alien_deception` | 270 | 候选生成 / 评分两段 | 已登记 |
| 5 | `sim/speech.gd:player_say` | 267 | 模板 / 校验两段 | 已登记 |
| 6 | `main.gd:_build_hud` | 223 | 迁 `scripts/ui/` | 已登记 |
| 7 | `tests/test_world.gd:_run_aiporttest` | 300 | 按系统拆段 | 夹具，最后处理 |
| 8 | `tests/test_world.gd:_run_probetest` | 262 | 按阶段拆段 | 夹具 |
| 9 | `tests/test_ui.gd:_run_meetuitest` | 248 | **先标记不拆** | 自带 11 项既有失败待修，拆前先修失败 |
| 10 | `tests/test_social.gd:_run_speechtest` | 219 | 语料 / 时序两段 | 夹具 |

### B-2 统一迁移范式（照搬 2026-11-12「夹具外迁」批次，不要另创写法）

- 新实现放对应子目录的独立 `.gd`，用 `preload` 常量 + `static func`；
  **宿主实例经参数传入**（`static func xxx(__h)`），原函数只留一行转发 `return Xxx.xxx(__h, ...)`。
- 成员访问、宿主方法调用、信号回调 Callable 统一加 `__h.` 前缀。
- `:=` 在无法静态推断返回值处降为 `: Variant` 或显式类型 —— 本项目已多次因
  `cand.reach_dist(pos)` 等返回 Variant 触发 GDScript 类型推断错误，不要重蹈。
- 不新增状态 / 计数器 / 阈值 / 评分 / 分支判断；不改判定顺序与返回语义。
- 数值一律读 `3d/preview/data/rules.json`（由 `js/ai/sanity.js` 等导出），**不在 GDScript 里硬编码**（红线 11）。
- 找不到 2.5D 对应实现时，先回主仓真源确认；确属维度产物才写进 `3d/spec/parity-map.json#allowed_differences`
  并说明「为什么 2.5D 不需要」，不得只加在 3D。

### B-3 每次拆分的收尾动作（缺一不可）

1. 从 `3d/spec/file-budgets.json#rules.max_func_lines_allow` 移除该项登记；
2. 目标文件确实变短后，**才**下调对应 `files[].max_lines`（棘轮只许降，不许升）；
3. `3d/CHANGELOG-2026-11.md` 记一行（批次 / 函数名 / 行数变化 / 实跑读数）；
4. 一次一函数一提交，提交信息 `refactor(3d): 拆 <函数名> 到 <目标文件>`（红线 10 中文）。

### B-4 禁止清单

- 改 `3d/preview/data/`、`3d/spec/port-manifest.json`、`js/`、`assets/`、`audio/`、`tools/`、`index.html`、
  `BASELINE.sha256.json`（2.5D 只读基线镜像，红线二.6）；
- 为让门禁变绿直接改镜像文件；上游改动须先在主仓改，再 `npm run baseline:sync`；
- 顺手修玩法 bug（属其他 agent 任务）；
- 删除 / 移动 / 重命名文件（红线 5）；`push` / `force push` / 切分支 / 处理 `3d` 副分支分叉。

---

## §6 验收门禁（每阶段、每次拆分都要实跑）

| 检查 | 命令 | 判定 |
|---|---|---|
| 汇总门禁 | `npm run check` | 8 通过 / 0 失败 |
| 结构预算 | `npm run file:check` | 目标文件行数下降、预算未破、10 条登记逐项减少 |
| 移植覆盖 | `npm run audit:parity:strict` | 未映射 0 / 守卫缺口 0 / 写入缺口 0 / 漂移 0 |
| 行号对账 | `npm run 3d:port:check` | 0 错误（1 条 legacy WARN 为既有） |
| 硬编码扫描 | `npm run 3d:parity:check` | PARITY OK |
| 基线一致 | `npm run baseline:check` | OK 407 文件 |
| 资产 / 红线 | `npm run guard` / `npm run agent:contract` | PASS |
| 文档一致 | `npm run docs:check` | 通过（仅阶段 A） |
| Godot 无头自测 | 见 `3d/CHANGELOG-2026-11.md` 最新批次清单 | navtest / tasktest / reachtest / simtest / dragtest / abilitytest 等 0 失败 |

报告必须写**本次实跑**的「X 通过 / Y 失败」与 `file:check` 的文件数 / 总行数 / 最大文件行数，
禁止沿用 §1 的基线读数。

---

## §7 并发纪律与回滚

与主仓 `docs/BODY-REFACTOR.md §6` 完全一致（开工记录 `git status --porcelain`、只写分配路径、
禁 `git add -A` / stash / reset / checkout / rebase / push / force、禁删改文件名、
发现文件被他人改动即停、不提交他人改动、交付只报清单与实跑读数、中文提交信息）。
额外两条：本仓 4 类未跟踪临时产物不提交也不删除；`3d` 副分支归位冲突不在本方案范围内。

**回滚**：阶段 A 纯文档，`git revert` 单笔即可；阶段 B 每次一函数一提交，回退单笔提交，
并同步还原该次对 `file-budgets.json` / CHANGELOG 的改动，避免登记与代码不一致。

---

## §8 附录

**命令速查**

```
node 3d/tools/filemap.cjs                    # 全仓结构总览
node 3d/tools/filemap.cjs --top 12           # 最大 12 个文件
node 3d/tools/filemap.cjs --file main.gd     # 单文件函数表
node 3d/tools/filemap.cjs --section <片段>   # 打印函数原文含行号
node 3d/tools/filemap.cjs --json             # 机器可读
node 3d/tools/filemap.cjs --check            # 预算检查
npm run check / audit:parity:strict / baseline:check / 3d:port:check / 3d:parity:check
npm run guard / agent:contract / docs:check
```

**规范入口**：根 `AGENTS.md §一`（14 条红线逐字副本）、`docs/REDLINES.md`（校验基准）、
`3d/ARCHITECTURE.md`（工程边界）、`3d/PORTING_PROTOCOL.md`（逐函数移植）、
`3d/spec/conventions.md`、`3d/spec/parity-map.json`（允许差异）。

**施工回填区**（完成后填写，禁止沿用旧读数）：

```
施工日期：2026-11-13
阶段 A：agent:contract PASS（§一 段零改动，哈希 6df0f075a21422b9）/
        docs:check FAIL（既有漂移，见下）/ npm run check 8 通过 / 0 失败
阶段 B 累计已拆：0 / 10 条；file:check 实跑 52 文件 / 26,826 行 / 最大 main.gd 5,546 行
剩余超长函数：10 条；各门禁实跑读数：
  baseline:check OK 407 文件；3d:port:check 0 错误 / 1 legacy WARN；
  audit:parity:strict 391 函数 / 映射 210 / 未映射 0 / 守卫 0 / 写入 0 / 漂移 0；
  guard PASS；agent:contract PASS。
```

**docs:check 未通过（施工前已存在，不是本批引入）**：`3d/tools/sync-docs.cjs` 要求本仓
`AGENTS.md §一` 与主仓 §一**逐字一致**；本仓 §一 在分离时做了 3D 路径适配（如
`node tools/test-v3.cjs`），主仓 11-13 又把测试迁到 `tests/`，两边因此不一致。
本方案 §4 明确「§一 原文一字不动」，故本批只做解释层；要恢复 `docs:check` 需另立
「红线同步」批次（走 `agent:contract:write` + 两仓同批），不在阶段 A 内擅自改红线。
