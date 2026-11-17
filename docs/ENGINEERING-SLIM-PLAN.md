# 2.5D 工程化精简方案

> 📌 **状态：P0 与 P1 第一批已落地（2026-11-15），P1 余批 / P2 / P3 仍为建议性、未落地**
> 方案提出时只做只读盘点；随后经用户裁定执行了 P0 清理与 P1 第一批外提，明细见 §6。
> 全程未改判定 / 数值 / 语料 / 版本；`js/game.js` 的 55 处调用点一行未改。
> 依据：根 `AGENTS.md` §一红线、`ARCHITECTURE.md` 三层架构、`docs/ASSET_GOVERNANCE.md` §9/§14、
> `docs/acceptance.md` T3 验收口径、3D 仓 `3d/tools/core-ui-audit.cjs` 的函数分层方法论。
> 触发：用户「做一个工程化精简方案先不改，而且可以把临时调试文件全删了」。

---

## 0. 目标与边界

**要降的三笔成本**（均为当前实测痛点，不是假想重构）：

| 成本 | 现状证据 |
|---|---|
| 主文件维护 | `js/game.js` **12,132 行**；全仓 23 个 JS / 20,626 行；DOM + Canvas + `G` 混用函数集中在此 |
| 门禁抖动 | `tests/test-v3.cjs` 971/0，但 `ci:gate` 最近一轮 **966/4**，4 条全落在 `tests/flaky-assertions.txt`（尸体拖动 / 藏尸计数 / 藏尸点 / 被质疑者回应） |
| 下游同步 | 2.5D 前进 8 个提交后，3D 仓为「行段 / 字面量行号 / `@src` 锚点 / 账本判决」付出 **45 个文件**的机械登记 |

**明确不做**：不改玩法判定、数值、语料、AI 权重；不改 3D 仓；不升版本号；不为了让门禁转绿改测试或放宽白名单；不删任何资产文件（删除单列 §5 SOP）。

**每期统一验收**：`tests/test-v3.cjs` 全绿且断言数不降 → `npm run t3:check` → `npm run ci:gate`（白名单条目只减不增）→ `node tools/filemap-js.cjs --check` → `node tools/deploy-pages.cjs --dry-run`（体积不增）→ 3D 侧 `npm run check` 14/0（涉及 `js/` 行号变动时）。任一红灯即回退该批。

---

## 1. 现状量化（2026-11-15 只读盘点）

- 版本 `返航录V3.7 / 3.7.0`；`index.html` 加载清单 20 个模块（含本批新增 `engine/assets`）；`file://` 可玩、零运行时依赖。
- 发布暂存 **281 文件 / 47.4 MB**；单张 `base-lit.png` **13.52 MB**；`rtImg` 4096 离屏画布约 **63 MB**。
- 进场加载门就绪门槛：62 图 + 17 音频；`Cache-Control` 已改 `max-age=600 + stale-while-revalidate` 等。
- 文档体量：`AGENTS.md` 约 17 KB、`CHANGELOG.md` 约 64 KB（只留最新 6 批 + 索引，其余分卷）、`docs/` 12 份；`docs/acceptance.md` 已登记「`tools/mc-report.md` 不存在却被 20+ 处称为唯一真源」的存量债。
- 临时调试产物：**11 个 / 约 62.5 MB**（清单见 §5），其中 3 个已被 `.gitignore` 排除、8 个为未跟踪。

---

## 2. 分期方案

### P0 · 零风险收口（1 批，不碰 `js/`）

1. **一次性调试产物清理**：按 §5 清单与 §9 六步执行；仓外完整备份 → 系统回收站 → 每批 ≤10 → 逐批校验 → 写 `docs/ASSET_CLEANUP_LOG.md`。**常设工具脚本与已入库历史报告保留**。
2. **防复发**：`.gitignore` 补 `tools/_ai-*`、`tools/_tmp-*`（与 3D 仓 `sync-baseline.cjs#skipFile` 同口径），并在 `tools/deploy-config.cjs` 核对发布白名单未引用这些路径；`guard:expired` 每周扫描。
3. **文档口径收口**：按 `docs/acceptance.md` N2 条目，检索并标注 `mc-report.md` 的过期「唯一真源」表述；`AGENTS.md` 分册索引在方案落地时再补本文件条目（本轮不改）。
4. **验收**：磁盘释放量、基线校验、`t3:check` 不退化、发布 dry-run 体积不变（这些文件本就不发布）。

### P1 · `game.js` 函数级拆分（核心，2–3 批，每批 ≤500 行）

1. 先做**只读分层清单**：仿 3D 仓 `3d:audit:coreui`，把 `game.js` 的具名函数分为 `core-state`（纯状态/判定）、`ui`（DOM 渲染）、`pure`（无副作用工具）、`mixed`（DOM + G 混用）；产出函数名 → 行号 → 依赖 → DOM 引用数的 CSV，不改代码。
2. 迁移顺序：先 `pure` → 再 `core-state` → 最后 `mixed` 重灾区（`say` / `syncHud` / `openMeeting` / `startVote`）。每批只迁一组，保持 `index.html` 经典 `<script>` 顺序（红线 2）与 `window.SKV3._t` 契约（红线 5）不变。
3. 新模块必须**无 DOM 依赖**、可被 3D 导出链直接读取；`docs/file-budgets-js.json` 用它锁死 `game.js` 上限（只降不升），新文件单独登记行数。
4. **量化收益判据**：同样 8 个上游提交量级下，3D 侧 `port-manifest` 行段、`SOURCE_LITERALS`、`@src` 的重登记条数应显著下降——这是「精简是否真的生效」的硬指标，而不是「文件变多了」的观感。

### P2 · 门禁稳定性与资源体量

1. **flaky 4 条逐条归因**（时序根因，不是加 sleep / 不改断言语义），目标从 `tests/flaky-assertions.txt` **移出**，白名单条目只减不增；连续多轮同机实跑取证。
2. **资源瘦身**：底图 13.52 MB 走格式/分块方案（需按 `ASSET_GOVERNANCE.md` §14 先检索登记 ≥2 个公开方法论/实现并写比对结论，红线 12）；`rtImg` 降档链 4096→2048→1024→原图保留，但评估把**默认档降到 2048**（画质需截图对照）。目标发布暂存 **< 40 MB**。
3. **清单单一来源**：加载门的 62 图 / 17 音频清单改为从 `assets/MANIFEST.json` 生成，消除 `js/engine/assets.js` 与素材目录的两处维护。

### P3 · 跨仓同步链自动化（需用户单独裁定）

1. 把 3D 侧的 `port-manifest` 行段、`SOURCE_LITERALS` 字面量行号、`@src` 锚点从「人工重登记」改为「由 2.5D 导出函数行号快照 + 校验器自动回写」；本轮 3D 为 8 个提交做了 45 文件登记，自动化后应降到个位文件。
2. `docs/CORE_RULES.md`（设计者口径）与 `js/` 实现做一次逐条对账，登记类似「R11.4 写出刀/开枪、真源只实现 shot」的口径差，**冲突由设计者裁定，不得据实现反改文档**。

---

## 3. 风险与回退

| 风险 | 缓解 |
|---|---|
| 拆分破坏加载顺序 / `_t` 调试契约（红线 2、5） | 每批 ≤500 行，双仓门禁全绿才进下一批；`git revert` 单批可回退 |
| `game.js` 行号大变导致 3D 移植锚点大面积失效 | 拆分批次与 3D 同步批次绑定，同一批内完成重登记并留痕 |
| 资源格式替换触碰素材署名（红线 6、12） | 先登记公开来源与许可，保留原图回退；不在 `assets/` 白名单内直接删 |
| 清理误删历史证据 | 只取 §5 A 组；备份 + 回收站 + 台账三重可恢复；禁止以修改时间/文件名作依据 |

---

## 4. 落地顺序建议

`P0（本轮确认后即可执行）→ P1 只读分层清单 → P1 分批迁移 → P2 flaky 归因 → P2 资源瘦身 → P3 跨仓裁定`

每批在 `CHANGELOG.md` 按三段式记录「本批改动 → 读数变化 → 下一批立项依据」，读数必须本次实跑。

---

## 5. 临时调试产物清单（只读盘点，等待用户确认）

### A 组 · 建议清理（11 个 / 约 62.5 MB，均为一次性追踪数据或报告）

| 路径（相对仓根） | 大小 | git 状态 |
|---|---:|---|
| `tools/_ai-track-fix2.json` | 19 MB | 未跟踪 |
| `tools/_ai-track-fix.json` | 18 MB | 未跟踪 |
| `tools/track-ai.json` | 17 MB | 未跟踪 · 已忽略 |
| `tools/_ai-track.json` | 8.1 MB | 未跟踪 |
| `tests/reports/mc-results.csv` | 607 KB | 未跟踪 · 已忽略 |
| `tools/_ai-track-report.png` | 118 KB | 未跟踪 |
| `tools/_ai-track-report.html` | 114 KB | 未跟踪 |
| `tools/track-ai-report.html` | 84 KB | 未跟踪 · 已忽略 |
| `tools/_ai-track-fix.html` | 84 KB | 未跟踪 |
| `tests/reports/mc-report.md` | 36 KB | 未跟踪 |
| `tools/_ai-callers.json` | 59 B | 未跟踪 |

判定依据：`.gitignore` 第 18–20 行已把 `track-ai*.json/html` 定义为「本地产物、不入库」；`tests/reports/mc-results.csv` 第 90 行同样忽略；`_ai-*` 为 2026-11-15 AI 走动体检的一次性采样。**不以修改时间或文件名作删除依据。**

#### A 组里 5 个 JSON 的性质（2026-11-15 只读解析）

- 生成链：**已入库的常设工具** `tools/track-ai.cjs` 用浏览器自动化打开 `index.html?test`、选旁观者进局，
  以假时钟（`clock=virtual` / `raf=25`）**逐帧采样 15 个 AI 的坐标 / 房间 / 路径 / 卡死计时 / 计划**；
  `tools/track-ai-report.cjs` 读 `track-ai.json` 判定并渲染 HTML 报告；`tools/probe-caller.cjs` 在
  `js/game.js` 的 `a._pathCD=1.2` 行下条件断点抓 `walkTo` 失败时的调用栈。三者均**只读、不改游戏状态**。
- 结构：顶层 `generatedAt / url / sec / clock / raf / sessions`；每局含 `meta`（座位、房间、seed、夜长）、
  `legend`、`samples`、`errors`。一帧约 `[时间, 夜钟, 夜数, [[x, y, room, …] × 15, …]]`，
  每局 5,500–7,200 帧，单文件因此达到 8–19 MB。
- 按时间顺序：`_ai-track.json`（09:24，3 局 × 90 秒，早期格式，修复前基线）→
  `_ai-track-fix.json`（10:37，6 局 × 120 秒，修复后第 1 轮）→
  `_ai-track-fix2.json`（10:49，同配置复验）→ `track-ai.json`（11:03，正式工具名的最终采样，
  也是报告脚本默认输入）。`_ai-callers.json` 只有 59 B，内容 `{generatedAt, hits: []}`——
  那轮调用方扫描**没抓到命中**，是空结果（注意 `.gitignore` 忽略的是 `tools/probe-caller.json`，
  这个 `_ai-callers.json` 是另一命名，所以才会出现在 `git status`）。
- 与 `tests/reports/mc-*.csv/md` 的区别：后者是**蒙特卡洛 1000 局 sim** 的原始/汇总结果，
  属于另一条验收线；A 组把两条线合并列出只是因为都属「一次性产物」，数据源并不相同。
- **可再生**：工具脚本保留在 B 组，`node tools/track-ai.cjs --sessions 6 --sec 120 --conc 4 --raf 25`
  → `node tools/track-ai-report.cjs` 即可重新采样（需浏览器自动化依赖与浏览器）。
  删除不影响游戏运行、不影响门禁；唯一损失是那轮「修复前 25 次发呆 / 166.5 秒 → 修复后 0 次」的
  原始现场证据，读数已写入 `CHANGELOG.md`。若想留痕，**建议保留体积最小的 `track-ai-report.html`（84 KB）**，
  4 个大轨迹 JSON 与空结果 `_ai-callers.json` 可删。

### B 组 · 保留（不属于临时调试文件）

- `tests/reports/mc-1000-2026-11-13.csv`（613 KB）/ `.md`（36 KB）：**已入库**的 1000 局蒙特卡洛历史证据。
- `tools/track-ai.cjs`、`tools/track-ai-report.cjs`、`tools/probe-caller.cjs`：**已入库**的常设工具（33a82c0 批次），删了会破坏工具链。
- `tools/_qwen_refs/`、`assets/`、`audio/`：素材留档与运行时资产，红线禁止清理。

### 执行 SOP（`docs/ASSET_GOVERNANCE.md` §9，确认后执行）

冻结清单 → 仓外完整备份（`robocopy /E /COPYALL` 等价）并校验 SHA256 → **只进系统回收站**（禁止 `rm` / `del /F` / 通配符批量删）→ 每批 ≤10 个、逐批核对 → 记录到 `docs/ASSET_CLEANUP_LOG.md` → 跑 `BASELINE.sha256.json` 校验。回收站与备份双重可恢复，**不永久删除**。

---

## 6. 落地回执（2026-11-15，用户裁定后执行）

### P0 · 清理已执行

- A 组 **11 个 / 62.5 MB** 按 §9 六步处理：备份 11/11 SHA256 一致 → 分 2 批（10 + 1）送系统回收站 →
  原路径残留 0 / 异常 0 → 台账 `docs/ASSET_CLEANUP_LOG.md`。
- 备份按用户补充裁定先落 C 盘、再**迁至 `<仓外备份目录>`**，
  再次 11/11 哈希一致；C 盘旧副本送回收站、残留 0，空目录保留未递归删除。
- B 组（已入库历史报告与 3 个常设工具脚本）全部保留；`.gitignore` 防复发规则仍列为 P0 待办。

### P1 第一批 · 已执行（零调用点改动）

- 外提对象：`js/game.js` 中 351 个函数里筛出的 **5 个零 DOM / 零 `G` / 零闭包依赖纯函数**
  （`bodyPos` / `bodyHasLoot` / `lootBody` / `bodyItemsText` / `lootText`），新建 `js/engine/body.js`（75 行）。
- 复用方案 A 薄委托：删除原定义 47 行、在别名区加 4 行，`SKBody` 暴露同一函数对象，
  **55 处调用点一行未改**；`game.js` 12,133 → **12,089** 行，棘轮额度同步锁死。
- 契约同步：`index.html` 加载清单、`AGENTS.md §一.2`、`docs/REDLINES.md`（`802d0376d2b50f29`）、
  `docs/README-details.md`、`docs/file-budgets-js.json`、规则快照 `3d/preview/data/rules.json`。
- 实跑：`test-v3.cjs` **971/0**；`ci:gate` 重跑 **968/3 PASS**；`t3:check` **11/2/0**；
  `agent:contract` / `guard` / `filemap-js --check` 全 PASS；发布暂存 **282 文件 / 47.4 MB**。

### 仍未落地

P1 余批（按族外提）、P2（flaky 归因 / 资源瘦身）、P3（跨仓同步链自动化）与 P0 的 `.gitignore` 防复发规则。
3D 仓下次 `baseline:sync` 需认领 `js/engine/body.js` 并重排行段 / 字面量行号 / `@src` 锚点。
