# 新返航录 2.5D / 3D 双仓 · 存储空间与过期资产治理规范 v1.0

| 项目 | 内容 |
|---|---|
| 版本 | v1.0（首版，基于 2026-11-11 全量只读扫描） |
| 适用仓库 | `新返航录`（2.5D 主仓）、`新返航录 3D 版`（3D 派生仓） |
| 适用范围 | 贴图/建模资产、构建期源素材、中间产物、缓存、文档、发布白名单、Git 入库策略 |
| 状态 | **已生效 v1.0**（2026-11-11 落地至两仓 `docs/ASSET_GOVERNANCE.md`） |
| 落地边界 | 3D 版 `tools/` 属只读基线，P0 修复由主仓发起，见 §8A |

---

## 1. 背景：为什么必须工程化

两个仓库在两周内从零长到 **11,538 个文件 / 4,171 MB**，其中游戏代码 `js/` 只有 **0.63 MB**。体积并非来自功能，而是来自资产生产链路的副产物没有退出机制：

- **入库、发布、磁盘留存三件事被混为一谈**：`.gitignore` 声明「素材库 PNG 只在本机留档、不入库」，但 `tools/deploy-pages.cjs` 的发布白名单没同步排除，导致 **79.26 MB 非运行时资产被上传**，发布包虚胖到 124.85 MB。
- **迭代没有归档口径**：旧贴图以时间戳目录（`tools/_bak/*-20261107162523`）、退役目录（`_backup/20261109_sdxl退役`）、候选帧（`*-c0/c1/c2.png`）三种形态散落，没有保留期与恢复说明，主仓积压约 **451 MB** 明确过期批次。
- **双仓口径漂移**：3D 版有 4,174 个文件（1,142.84 MB）与主仓同路径同大小，但两份 `.gitignore` 规则不一致，导致同名目录在一边入库、另一边被忽略。
- **缓存与产物无自动清理**：Godot 导入缓存 880 MB、`.git` 857 MB、调试截图 175 MB、门禁日志 243 个，全部随盘堆积。

结论：需要从「靠人记得删」升级为「分层 + 配额 + 门禁 + 保留期」的制度。本规范即定义这套制度。

---

## 2. 现状基线（2026-11-11 实测）

| 指标 | 2.5D 主仓 | 3D 版 | 合计 |
|---|---:|---:|---:|
| 文件数 | 6,697 | 4,841 | 11,538 |
| 工作区体积 | 2,647.15 MB | 1,524.19 MB | 4,171.35 MB |
| 已入库（tracked） | 3,227 | 2,477 | 5,704 |
| 被忽略 / 未跟踪 | 3,470 | 2,364 | 5,834 |
| `.git/` 体积 | 723.55 MB | 133.62 MB | 857.17 MB |
| 发布包（按白名单模拟） | 124.85 MB | 124.85 MB | 两仓相同 |

发布包构成：非运行时误入 **79.26 MB**（`assets/qwen-lib/*.png` 78.03 + `_raw_fx/` 1.23），运行时资产 **45.59 MB**，其中三张大图 24.35 MB（`base-lit.png` 13.54 / `hull-deck.png` 6.96 / `door-panel.png` 3.85），`js/` 代码 0.63 MB。

积压分层：明确过期迭代 451 MB（主仓）、候选帧与 `.blend1`/APK 副本约 87 MB、中间产物与参考图约 541 MB、Godot 缓存 880 MB、过期调试文档约 20 MB。

---

## 3. 第一原则：三种状态必须分别声明

> **「是否入库」「是否发布」「是否留在磁盘」是三个独立决策，任何资产新增时必须逐项显式声明。**

当前事故的根因就是只做了第一个决策（`.gitignore` 忽略），漏了第二个（发布白名单未排除）。规范术语：

| 状态 | 控制点 | 取值 | 说明 |
|---|---|---|---|
| 入库 | `.gitignore` / `git add` | 是 / 否 | 决定是否进版本库、可追溯与可回滚 |
| 发布 | `deploy-pages.cjs` 的 `ENTRIES` / `SKIP` | 是 / 否 | 决定是否上传 Cloudflare Pages |
| 磁盘留存 | 本规范的分层与保留期 | 永久 / 保留期 / 随时清 | 决定是否占本机空间 |

**强制约束**：凡「不入库」的资产，必须同时评估「是否发布」；凡位于 `ENTRIES` 白名单目录（`assets/`、`js/`、`audio/`）下的新增文件，默认视为会发布，除非在 `SKIP` 中显式排除。

---

## 4. 资产分层模型（核心）

| 层 | 代号 | 定义 | 典型目录 | 入库 | 发布 | 磁盘留存 |
|---|---|---|---|---|---|---|
| L0 运行时资产 | R | 浏览器/游戏加载时读取 | `js/`、`audio/`、`assets/scene/v4/*.png`（正式图）、`facility/*.png`（无后缀）、`minigame/`、`crew/`、`bg/`、`station/`、`portfolio/` | 是 | 是 | 永久（只优化不删） |
| L1 构建期源 | S | 生成 L0 的源素材 | `returnlog_assets/referenced/qwen-lib/*.png`、`tools/_qwen_refs/`、`returnlog_assets/referenced/scene-v4-tex/*`（除 `door-panel.png`）、`3d/assets/models/*.blend`、`3d/assets/export/*.glb` | 否（素材层 + `assets/MANIFEST.json` 兜底） | 否 | 永久或按需归档 |
| L2 中间产物 | I | 构建管线一次性输出 | `assets/scene/v4/facility/_raw/`、`_raw_fx/`、`tools/screenshots/`、`3d/preview/screenshots/`、`tools/_fxpreview/`、`*_report.json` | 否 | 否 | 保留期 14 天，之后清 |
| L3 过期迭代 | E | 被新版本取代或退役的批次 | `_backup/YYYYMMDD_*`、`tools/_bak/<主题>-YYYYMMDDHHMMSS/`、`*_bak/`、`.blend1`、`*-c0/c1/c2.png` | 否 | 否 | 保留期 30 天（候选帧 7 天），到期清 |
| L4 缓存 | C | 工具/引擎自动再生（**不含 `3d/preview/.godot/imported/`**） | `__pycache__/`、`*.pyc`、`node_modules/`、`.wrangler/`、`*.log`、`*.err`、`.godot/` 其余子目录 | 否 | 否 | 随时清，不计入备份 |
| L5 文档 | D | 规范、规划、过程记录 | `docs/`、`*.md`、`tools/*-report.md`、`3d/**/reports/`、`BASELINE.sha256.json` | 分两类（见 §7） | 否 | 规范层永久；过程层保留期后归档 |

**分层归属是强制的**：新增任何目录/批次，必须在本规范「附录 B：资产层级登记表」登记层级，未登记的目录视为 L2 或 L3，按最短保留期处理。

---

## 5. 目录与命名规范

1. **禁止在发布白名单目录下放非运行时资产**。`assets/` 下的 `qwen-lib/`、`facility/_raw/`、`_raw_fx/`、`tex/` 是历史违规存量，迁移前必须在 `SKIP` 中显式排除（见 §7）。
2. **迭代批次统一命名**：
   - 退役/整批归档：`_backup/YYYYMMDD_<主题>/`，主题写明原因，如 `20261109_sdxl退役`、`20261109_铁板配置`。
   - 工具级旧版：`tools/_bak/<主题>-YYYYMMDDHHMMSS/`。
   - 禁止 `新建文件夹`、`final`、`最终版`、`副本 (1)`、`xxx_old` 等无时间无原因的命名。
3. **候选帧与正式图**：候选统一后缀 `-c0/-c1/-c2`，正式图**无后缀**；代码只允许引用无后缀版本。候选帧默认 7 天保留期。
4. **恢复口径**：每个 L3 批次必须在同目录 `README` 或 3D 仓 `3d/CHANGELOG.md` 写一行「为何退役 / 如何恢复 / 依赖哪个脚本」，无恢复口径的批次不得创建。
5. **版本信息集中**：禁止用文件名表达版本，统一走 `js/config/version.js` 与 `3d/version.json`。
6. **凭据与基线永不清理**：`.env`、`android/release.keystore`、`*.json.gz` 压缩基线、`BASELINE.sha256.json`、`.git/`。

---

## 6. 存储配额与阈值

| 指标 | 当前 | 目标上限 | 超限动作 |
|---|---:|---:|---|
| 单仓工作区（不含 `.git`） | 1,924 / 1,391 MB | ≤ 800 MB | 触发 L2/L3/L4 清理 |
| 发布包 | 124.85 MB | P0 ≤ 50 MB；P4 ≤ 5 MB | `deploy --dry-run` 阻断 |
| 单张运行时位图 | 13.54 MB | ≤ 1 MB | 转 WebP/AVIF + 降采样，视觉回归后替换 |
| `.git/` 体积 | 723.55 / 133.62 MB | ≤ 300 MB | `git gc`；仍超则大文件出仓 |
| L3 过期迭代层 | 451 MB（主仓） | ≤ 50 MB | 保留期到期即清 |
| L4 缓存层（不含 imported/） | 约 0.1 MB | 0（不备份、不提交） | 部署前自动清 |
| 两仓重复资产 | 1,142.84 MB | 显式声明（共享基线或合并） | 见 §8 |

配额由 `tools/asset-guard.cjs`（**已落地**，主仓 `npm run guard`）在每次发版前检查，输出体积与超限项。

---

## 7. 四处规则同步（强制）

一次资产变更必须同步以下四处，缺一即视为未完成：

| # | 控制点 | 文件 | 检查内容 |
|---|---|---|---|
| 1 | 入库 | `.gitignore`（两仓） | 新目录是否被正确忽略；两仓口径是否一致 |
| 2 | 发布 | `tools/deploy-pages.cjs`（两仓） | `ENTRIES` / `SKIP` 是否排除 L1/L2/L3/L4 |
| 3 | 兜底 | `assets/MANIFEST.json` | L1 源素材是否登记来源、许可、可再生成方式 |
| 4 | 基线 | `BASELINE.sha256.json`（3D 版） | 共享资产哈希是否一致 |

### 当前待修差异清单（实测）

| # | 位置 | 问题 | 建议动作 |
|---|---|---|---|
| A | 两仓 `deploy-pages.cjs` 第 20–24 行 | `SKIP` 只有 3 条，漏 `assets/qwen-lib/*.png` 与 `assets/scene/v4/facility/_raw_fx/` | 补 2 条正则，发布包 124.85 → 45.59 MB |
| B | 3D 版 `.gitignore` 第 49 行 | `assets/qwen-lib/` 整目录忽略，导致 `README.md` 与 `素材库清单.json` 未入库；主仓只忽略 `*.png` | 改为 `assets/qwen-lib/*.png` |
| C | 3D 版 `.gitignore` 第 51 行 | `docs/qwen21/` 整目录忽略；主仓同名目录 88 个文件**已于 2026-11-12 移入素材层** | 已对齐：两仓均不再入库，统一放 `%USERPROFILE%\Documents\returnlog_assets\unreferenced\qwen21\` |
| D | 3D 版 `.gitignore` | 缺少 `_backup/` 规则（主仓第 62 行有） | 预防性补齐 |
| E | 主仓 `.gitignore` | `*.blend1` 在第 19、58 行重复 | 合并去重 |
| F | 两仓 | `tools/_gate-*.log` 等命名口径不同（主仓靠 `*.log` 兜底，3D 版显式列出） | 统一为显式规则，便于审计 |

---

## 8. 双仓（2.5D / 3D）协同策略

**现状**：3D 版 4,841 个文件中有 **4,174 个（1,142.84 MB）** 与主仓同路径同大小，`assets/`、`audio/`、`js/`、`index.html` 完全一致；3D 版近似主仓的派生副本。其中 193 个候选文件其实是主仓已入库正式内容的副本。

二选一，必须显式决策（当前采用策略 A，双仓并行）：

- **策略 A：双仓并行（建议先维持）** — 保留两个独立仓库，但以 `BASELINE.sha256.json` 定义共享基线；共享资产只改一次，用 `tools/sync-baseline.cjs` 同步；禁止在 3D 版单独修改共享文件；两仓 `.gitignore` 与 `SKIP` 逐条对齐。
- **策略 B：单仓 + 分支** — 把 3D 版并入主仓 `3d/` 分支或子目录，消除 1.14 GB 重复。改动大，需迁移与历史合并，单独立项。

无论选哪种，**§7 的规则同步是强制项**，且每次发版前校验共享基线哈希一致。

---

## 8A. 3D 版基线约束下的落地边界

3D 版以 `BASELINE.sha256.json` 维护 2.5D 只读基线（覆盖 `js/`、`assets/`、`audio/`、`tools/` 与 `index.html`），`docs/` 自 2026-11-09 起已移出基线（见 `BASELINE.md` §1 / §6）。因此规范落地必须遵守：

| 路径 | 可否直接改 | 本规范落地方式 |
|---|---|---|
| `docs/`（两仓） | 可改 | 规范、层级登记表、清理台账直接写入两仓 |
| 根级 `.gitignore`、`package.json` 非版本字段（3D 版） | 可改 | 两仓规则对齐直接编辑 |
| `tools/deploy-pages.cjs`（3D 版） | **禁止手改**（在基线清单内） | 主仓为单一真源；已于 2026-11-11 经 `npm run baseline:sync` 同步，全程未手改 |
| `js/`、`assets/`、`audio/`、`index.html`（3D 版） | 禁止 | 只读镜像，不做任何改动 |

**已同步（2026-11-11）**：用户授权全量改动后，先做只读影响面预演 —— 上游 456 个可同步文件中仅 3 个有差异，随后执行 `npm run baseline:sync`：新增 `tools/asset-guard.cjs`、`tools/deploy-config.cjs`，覆盖 `tools/deploy-pages.cjs`，清单由 454 → 456 个文件；`baseline:check` 与两仓 `npm run guard` 均 PASS（发布包 45.59 MB）。**两仓发布白名单现已一致**，且全程未手改基线文件。

## 8B. 事故复盘：Godot 导入缓存误清（2026-11-11）

**现象**：首轮清理后，从桌面快捷方式进入 3D 版，模型仍在、贴图全空。

**根因**：把 `3d/preview/.godot/imported/*.ctex` 判成「L4 引擎可自动重建的缓存」并移出。实际上 Godot 运行时**直接读取导入缓存中的 `.ctex`**；源 PNG（`3d/preview/assets/textures/`、`assets/scene/v4/`）不会在直接运行游戏时自动重新导入，必须先打开 Godot 编辑器完成 import。因此缓存消失后材质贴图全部丢失，而几何体（`.glb` / `.tscn`）仍在。

**影响范围**：两仓共 2,298 个 `.ctex`（879.88 MB）与 36 个 `*-c0/c1/c2.png`（7.56 MB）被误移。

**回滚**：已从隔离区原样还原；两仓 `imported/` 恢复 1,071 / 1,227 个文件，候选帧各 18 个；3D 版 `sync-baseline.cjs --rebuild` 重新登记 18 个候选帧，`baseline:check` OK 443；两仓 `guard` / `agent:contract` 均 PASS。

**规则修正（防复发）**：

1. `3d/preview/.godot/imported/` 从 L4 移出，归为 **L0′ 运行时依赖缓存**，标记「禁止直接清」；仅可在 Godot 编辑器完成重新导入并验证贴图正常后，按新缓存替换。
2. `*-c0/c1/c2.png` 不是「已被正式图取代的候选」：3D 工程会引用它们做颜色 / 状态变体，改标 ⛔ 保留。
3. 清理判据新增：**凡 `.godot/` 下被运行时读取的内容，一律先做「移出后重开游戏验证」的小样本试验，再决定是否批量清**；不得仅凭「可再生成」四个字判断。
4. 各清单 CSV 中这两批次的建议已改为 ⛔ 保留，`RESTORE_MAP.csv` 标注还原状态。

## 9. 过期资产生命周期与清理 SOP

### 状态机

`在用 → 候选 → 选定 → 退役（保留期）→ 清理`

- 新版本上线时，旧版本**整批**移入 L3 归档目录并写恢复口径，不得直接覆盖、不得散落。
- 候选帧在选定正式图后进入 7 天保留期（**`*-c0/c1/c2.png` 已排除，见 §8B**）；退役批次 30 天；中间产物与截图 14 天；L4 缓存随时清（**不含 `.godot/imported/`**）。
- 保留期内批次只读冻结，禁止继续写入。

### 清理执行六步（强制）

1. **冻结**：确认批次不再写入，记录清单（路径 / 数量 / 体积 / 层级 / 保留期到期日）。
2. **完整备份**：`robocopy /E /COPYALL` 或等价方式复制到仓外备份目录，确认成功后才继续。
3. **只进回收站**：使用系统回收站机制，**禁止** `rm` / `del /F` / `shutil.rmtree` 等永久删除，禁止通配符批量删。
4. **小批执行**：每批 ≤ 10 个文件，逐批核对路径。
5. **逐批校验**：数量、体积、抽样哈希；任一失败立即停止。
6. **记录**：写入 `docs/ASSET_CLEANUP_LOG.md`（时间、批次、层级、路径清单、体积、备份位置、恢复方式、执行人）。

### 回滚路径（三重）

- 回收站（首选）→ 备份副本（次选）→ Git 历史（仅适用于已入库文件，`git rm` 前先确认可恢复）。
- 清理后必须跑一次 `BASELINE.sha256.json` 校验，确认共享基线未被破坏。

### 禁止事项

- 不得删除 L0 运行时资产、`.env`、`android/release.keystore`、`*.json.gz` 基线、`.git/`、L5 规范层文档。
- 不得在 `assets/` 白名单目录内直接删除文件而不检查 `deploy-pages.cjs`。
- 不得以「修改时间久」或「文件名带 v1/日期」作为删除依据：2018 时间戳来自第三方 Kenney 音效素材原始戳，`v1/v2`、带日期的调研文档均为当前正式内容。

---

## 10. 自动化门禁（工程化落地点）

| 门禁 | 实现 | 触发 |
|---|---|---|
| 发布体积 | `node tools/deploy-pages.cjs --dry-run` 解析暂存体积 | 每次发版，> 50 MB 阻断 |
| 白名单污染 | 新增 `tools/asset-guard.cjs`：扫描 `ENTRIES` 内是否出现 L1/L2/L3/L4 目录 | 每次发版 |
| 大图检测 | `asset-guard.cjs`：列出运行时位图 > 1 MB 清单 | 每次发版 |
| 保留期扫描 | `asset-guard.cjs --expired`：列出超过保留期的 L2/L3 批次 | 每周 |
| 双仓基线 | 校验 `BASELINE.sha256.json` 与两仓共享文件哈希 | 每次同步 |
| 缓存清理 | `npm run clean:cache`（L4，**规划项，本轮未实现**） | 部署前 / CI |

**已落地 scripts（主仓）**：`guard`、`guard:expired`（实现见 `tools/asset-guard.cjs`，只读不删除）。`clean:cache` / `clean:expired` 为规划项，本轮**未实现** —— 任何删除必须走 §9 六步并经用户确认。每次发版在 `CHANGELOG.md` 记录发布包体积与磁盘基线，形成趋势曲线。

---

## 11. 分期落地路线

| 阶段 | 动作 | 预计释放 | 风险 |
|---|---|---:|---|
| P0 立即 | 两仓 `SKIP` 补 2 条；对齐 `.gitignore` 差异 A–F | 发布包 −79.26 MB（不动磁盘） | 零 |
| P1 本周 | 清 L4 缓存（**不含 imported/**）+ 主仓 L3 退役/时间戳批次（451 MB） | 约 451 MB | 低（imported/ 已排除） |
| P2 本周 | 过期调试文档（主仓 243 个 + docs 18 篇 + 3D reports 11 个，约 20 MB），走 `git rm` + 提交 | 约 20 MB | 中（需提交，可回滚） |
| P3 迭代 | L2 中间产物与参考图（约 541 MB），确认重跑成本后清 | 约 541 MB | 中 |
| P4 专项 | 三张大图 WebP/降采样 + 视觉回归，发布包 45.59 → ≤ 5 MB | 约 40 MB | 中（需视觉验收） |
| P5 治理 | `asset-guard.cjs`、配额门禁、双仓基线策略、清理日志 | 防复发 | 低 |

---

## 11A. 美术资产生产工作流（强制 · 2026-11-11 用户裁定）

**适用范围**：所有新增或重做的美术资产 —— 人物、机器人、设备、门、天花板、舱室装饰、第一人称武器。纯数据与 UI 排版不在此列。

**强制链路（缺一不可）**：

1. **参考**：先取 2.5D 同名资产（`assets/scene/v4/`、素材层 `returnlog_assets/unreferenced/qwen21/2.5d/`）作为造型与配色基准；没有对应物的，先出三视图参考图。
2. **生图**：用**本地模型 Qwen-Image 2.1**（runner 与 `3d/tools/gen-qwen-materials.ps1` 相同：sdcpp Vulkan + Turbo Q4_K_M + Qwen3-VL-8B，8 步 / CFG 1.0）。**禁止 SDXL，禁止任何在线生图服务。**
3. **建模 / 渲染**：Blender 按参考建模并渲染对照图；贴图优先「千问材质 + Blender 展开/烘焙」。
4. **导出**：`.glb` + 贴图进 `3d/preview/assets/...`；原始方图留 `3d/assets/renders/`（`.gitignore` 已忽略）。
5. **登记**：3D 仓 `3d/ASSETS.md` 记面数 / 材质 / 哈希；生图 manifest 记 prompt / seed / 模型 / 尺寸。

**禁止事项**：

- 用 `BoxMesh` / `CylinderMesh` 代码手搓几何**直接当成品**（门、天花板、机器人、设备一律不例外）；
- 没做 2.5D 对照就声称"参照过原版"；
- 把 SDXL 产物、网图或未经本地模型生成的图直接当贴图。

**每件资产的验收项**：

- [ ] 与 2.5D 同角度并排对照图
- [ ] Blender 视口截图（线框 + 材质各一张）
- [ ] 面数 ≤ 预算（device 8k / prop 3k / 人物 2k）
- [ ] 贴图 ≤ 2048，命名 `<asset>_<slot>_<map>.png`
- [ ] `npm run guard` 通过，发布包增量已记录

**现存待重做清单（2026-11-11）**：

| 资产 | 现状 | 要求 |
|---|---|---|
| 保安机器人 | `scene_extras._robot()` 代码手搓 | 千问三视图 → Blender → `secbot.glb` |
| 门 | `map_builder` BoxMesh + 发光条 | 以 `assets/scene/v4/tex/door-panel.png` 为基准做门框/双开门/扫描灯 |
| 天花板 | 单层平面 + 灯带 | 分舱顶部结构（管线/检修口/灯带） |
| 铁板 | 多舱共用同一套 | 按舱室出差异化材质（拉丝钢 / 防静电地板 / 隔音棉 / 生物舱白板） |
| 人物 | 已完成千问 4 张材质第一版 | 待 UV / 法线烘焙（P1） |

## 12. 每次变更的检查清单

**新增资产**：
- [ ] 已登记层级（L0–L5）与保留期
- [ ] 已声明「入库 / 发布 / 磁盘留存」三项状态
- [ ] 美术资产已按 §11A 走「千问生图参考 → Blender 建模/渲染 → 导出」，并附 2.5D 对照图
- [ ] 已同步 `.gitignore`、两仓 `SKIP`、`assets/MANIFEST.json`、`BASELINE.sha256.json`
- [ ] 若为 L1，已写明来源、许可与再生成脚本

**版本迭代**：
- [ ] 旧版本整批归档，命名符合 `_backup/YYYYMMDD_<主题>` 或 `_bak/<主题>-时间戳`
- [ ] 已写恢复口径
- [ ] 候选帧与正式图后缀区分，代码只引用正式图

**发版**：
- [ ] `deploy --dry-run` 体积 ≤ 50 MB
- [ ] `asset-guard` 无白名单污染、无超限大图
- [ ] L4 缓存已清理（**不含 `.godot/imported/`**）
- [ ] 过期批次扫描无超期项（或有明确豁免记录）
- [ ] `CHANGELOG.md` 已记录本次体积基线

---

## 附录 A：本次扫描交付物

**仓库内（随版本库走）**：

| 文件 | 内容 |
|---|---|
| `docs/ASSET_GOVERNANCE.md` | 本规范，两仓同步 |
| 本规范附录 B | 资产层级登记表，新增目录必须登记 |
| `docs/ASSET_CLEANUP_LOG.md` | 清理执行台账模板 |
| `tools/asset-guard.cjs` | 发布体积 / 白名单污染 / 大图 / 超期批次门禁（主仓） |
| `tools/deploy-pages.cjs` | 发布白名单 SKIP（主仓已修；3D 版待基线同步） |

**工作区扫描件（不入库，仅作基线证据）**：`清洁清单_*.md/.csv`、`专项检查_*.md/.csv`、配置改动前的备份 `backups/2026-11-11/`。

## 附录 B：数据口径说明

- 全部数据来自 2026-11-11 对两个目录的只读递归扫描，未移动/重命名/删除任何文件。
- 发布包体积按 `tools/deploy-pages.cjs` 的 `ENTRIES` 与 `SKIP` 规则在本地模拟，未实际执行部署。
- 重复文件判定条件为「相对路径相同且字节数相同」，未做逐文件哈希全量比对；共享基线以 `BASELINE.sha256.json` 为准。
- 「过期」判定依据优先取项目自身 `.gitignore` 注释、目录名（退役/备份/时间戳）、以及 `js/` 与 `tools/` 的引用关系；不采用修改时间或文件名版本号。

## 13. 发布资产解耦（2026-11-12 用户裁定）

> 背景：GitHub 主仓 `returnlog` 实测 `diskUsage` ≈ 699 MB、本地 `.git` 840 MB，接近 GitHub 1 GB 软上限；
> 用户裁定「GitHub 上只上传核心代码」。同时 3D 侧地板 / 天花板贴图因 `.gitignore` 整目录排除，
> 历史上从未入库，clone 后 3D 工程必然缺图。

### 13.1 三态口径（针对运行时资产，覆盖 §3 的一般规则）

| 对象 | 入库 | 发布 | 磁盘留存 |
|---|---|---|---|
| `js/`、`index.html`、工具脚本、文档、配置 | 是 | 是（代码） | 是 |
| 2.5D 运行时 `assets/` `audio/` | **否** | **是（经资产包注入）** | 是 |
| 3D 运行时 `3d/preview/assets/textures/`、`models/` | **否** | 否（3D 不部署 Pages） | 是 |

发布包仍为 280 文件 / 45.57 MB，只是资产不再由 `git checkout` 提供。

### 13.2 工具（单一入口 `tools/publish-assets.cjs`）

| 命令 | 作用 |
|---|---|
| `bundle --out <x.tar.gz>` | 按 `deploy-config.cjs` 白名单打包运行时资产（256 文件 / 44.51 MB），并写 `tools/publish-assets.json` 期望清单（**必须入库**） |
| `fetch --from <url 或本地路径>` | 下载 / 读取 → 校验归档路径（只允许 `assets/` `audio/`）→ 解压到工作区 → 按 SHA256 清单逐文件核对；私有附件用 `PUBLISH_ASSETS_TOKEN` |
| `verify [--github-output] [--strict]` | 校验资产齐全，输出 `ready=true`、`ready=false` 之一 |

白名单真源仍是 `tools/deploy-config.cjs`，与 `deploy-pages.cjs` / `asset-guard.cjs` 共用，不得两处各写一套。

### 13.3 CI 接线（`.github/workflows/deploy.yml`）

- 仓库变量 `vars.PUBLISH_ASSETS_URL`：资产包下载地址（Release 附件 / R2 / 私有资产仓）；可选密钥 `secrets.PUBLISH_ASSETS_TOKEN`。
- `gate` 与 `deploy` 两个 job 各自 checkout 后各注入一次；`gate` 产出 `assets_ready`。
- 资产不全时**跳过部署并保持流水线绿**（沿用本 workflow 原有设计），同时 `::warning::`；`deploy` 上传前再 `verify --strict` 一次。
- 未配置 URL 时沿用仓库内 `assets/` 与 `audio/`，向后兼容。

### 13.4 防静默缺图

`deploy-pages.cjs` 的 `copy()` 对缺失文件原本静默 `return`，smoke test 只 curl 首页与 `version.js`，
与 §8B 同源：曾出现「部署成功但贴图全空」。新增 `verify` 后，清单缺任一项即 `ready=false`，不再上传缺图版本。

### 13.5 3D 地板 / 天花板贴图

- `.gitignore` 的 `3d/preview/assets/textures/` 整目录排除，`git ls-files` 在该路径计数为 **0**；
  十舱 `ceiling.png / -normal / -rough`、`floor.png`、`skin*`、`panel-*` 共 193 MB 只在本地磁盘。
- `floor_spec.json` 与 `map_builder.gd` 按 `res://assets/textures/qwen/<rid>/...` 读取；换机 clone 会回退纯色，
  3D 仓 `3d/CHANGELOG.md` 已记录同类事故（2026-11-07 地板口径归位）。
- 3D 工程不参与 Pages 部署，其资产应单独出包归档（建议 `3d-assets.tar.gz`）或按 §9 登记为 L1 再生成物，
  由资产仓托管；**本轮未移动、未删除任何该文件**。

### 13.6 容量说明（关键）

仅在最新提交里 `git rm --cached` 贴图**不会**降低 GitHub 仓库 `diskUsage` —— 历史对象仍在，
699 MB 不会回落，且新提交还会略增。要真正瘦身必须处理历史（重写历史 / 新建干净默认分支），
属破坏性操作，须用户单独确认后执行。

## 14. 公开知识优先（方法论规范 · 2026-11-12 用户裁定）

> 用户原话：「必须先从公开素材那边找方法，而不是自己独自造轮子」。
> 本节是**红线 12 的执行细则**（上位规范：`AGENTS.md` §一.12、3D 仓 `3d/PORTING_PROTOCOL.md` §2），
> **不是另立规范**：红线 12 已要求「任何美术/音频/模型素材先检索公开素材站与开源社区、生成前先取公开设计参照」，
> 本节把同一要求扩展到技术方案与参数决策（灯光、材质、分辨率/帧率、工程方案）。
> 两者都必须在动代码 / 调参数 / 生成资产**之前**完成；事后补检索不算。
> **2026-11-12 用户裁定**：公开素材的**直接使用须经用户逐项批准**；**方法论与技术指导可直接吸收**，无需批准。

### 14.1 适用范围（不止美术）

任何改动只要涉及下列之一，先做公开检索：

- 引擎行为与参数：灯光、材质、分辨率、帧率、渲染缩放、阴影、GI、后处理
- 美术资产：造型、材质、贴图、配色、结构（门 / 天花板 / 人物 / 机器人 / 地板）
- 工程方案：部署、缓存、打包、同步、门禁、CI 流程
- 数值与阈值：光强、曝光、roughness / metallic、面数预算、贴图尺寸

### 14.2 强制四步

1. **检索**：至少 2 个独立公开来源。优先级：官方文档 / 标准 > 开源项目实现 > 公开素材站 > 社区已验证实践。
2. **比对**：写清「公开方案怎么做 / 本项目现状 / 差在哪 / 准备采纳哪条」。
3. **留痕**：填 §14.4 登记表，写进 `CREDITS.md`、3D 仓 `3d/ASSETS.md` 或本节；含 URL、作者或机构、许可、检索日期。
4. **才实现**：无登记不得改参数、不得生成资产、不得提交。

### 14.3 自研豁免（必须写明理由）

仅当：① 检索到的公开方案都不适用（逐条写清为什么）；② 或属于项目特有契约（2.5D 真源语义、门禁口径）。
即便豁免，也要登记「已检索但无适用方案 + 理由」。**「没查过」直接自研一律视为违反**。

### 14.4 公开来源登记表（首个执行样例，检索日 2026-11-12）

| 主题 | 来源 URL | 作者 / 机构 | 许可 | 可引用结论 | 对应本项目问题 |
|---|---|---|---|---|---|
| 引擎灯光 | https://docs.godotengine.org/en/latest/tutorials/3d/lights_and_shadows.html | Godot Engine 官方文档 | 官方文档（见站点） | Emission 不影响邻近物体，除非烘焙或启用屏幕空间间接光；灯数上限；可用 emissive + GI 替代大面积光源 | 灯带很亮但房间死黑 |
| 自发光材质 | https://docs.godotengine.org/zh-cn/4.x/tutorials/3d/standard_material_3d.html | Godot 官方文档（中文） | 同上 | Emission 不包括环绕几何体的光，除非 VoxelGI / SDFGI | 同上；会议桌过曝成白盘 |
| Emissive 贴图 | https://craftpbr.com/guides/what-is-an-emissive-map | CraftPBR | 公开教程 | Emissive 默认不照亮场景，需 bloom / GI / 真实光源 | 灯带与发光桌面的定位 |
| 分辨率 / 帧率 | https://docs.godotengine.org/en/stable/tutorials/rendering/multiple_resolutions.html | Godot 官方文档 | 同上 | 3D 性能优先 `rendering/scaling/3d/scale`；不应把改 viewport / 窗口分辨率当通用优化；base size 不是 3D 性能开关 | 纠正「擅自改分辨率」 |
| CC0 材质库 | https://polyhaven.com/license | Poly Haven | CC0 1.0 | 全部贴图 / HDRI / 模型 CC0，可商用、无需署名、可再分发 | 天花板 / 门框 / 地板贴图首选来源 |
| CC0 具体材质 | https://api.polyhaven.com/assets?t=textures&c=metal | Poly Haven 公开 API | CC0 1.0 | `metal_plate`(Rob Tuytel)、`corrugated_iron`(Jenelle van Heerden / Dimitrios Savva)、`blue_metal_plate`(Rob Tuytel)、`metal_grate_rusty` 等工业钢板 / 压型板 / 格栅 | 替换近乎纯色的手搓材质 |
| CC0 材质库 2 | https://ambientcg.com | ambientCG / Lennart Demes | CC0 1.0 | 全站材质 CC0，1K–8K 完整 PBR 通道 | 备选来源 |
| 天花板设计参照 | https://www.fab.com/listings/d47958d5-fc24-4852-9634-cf5651310c16 | Fab · Research Laboratory Interior Kit | 商业套件，**仅作设计参照，不拖模型** | ceiling services：suspended light strip、cable tray、wall pipe run；400 cm ceiling with two recessed light panels | 天花板结构分层与灯槽做法 |
| 设施视觉分区 | https://meowservers.com/en/SCP-SL/Tutorial/Map | Meow Servers 公开教程 | 公开 wiki | HCZ 金属地板暗墙 / LCZ 白砖高天花板的分区识别 | 分舱配色与亮度层级 |
| 室内布光实践 | https://www.pkold.com/docs/godot4/18-lighting-environment/ | 强曰为道 | 公开教程 | 分层照明（基础 / 功能 / 装饰）、阴影光源 ≤3–5、室内暗室 OmniLight + VoxelGI + SSAO | 灯光重构参考 |
| 平面背面剔除 | https://uhiyama-lab.com/en/notes/godot/standardmaterial3d-basics | ういやまラボ | 公开教程（已验证排错项） | 「For a plate seen from behind, set Cull Mode to Disabled」——单面平板从背面看会被剔除，只剩背景色 | 天花板固定黑块、贴图 / 补光 / 金属度全部无效的根因 |

> **2026-11-12 用户裁定（口径收紧，取代上面的待裁定表述）**：
> ① 公开素材**文件的直接使用须经用户逐项批准** —— 包括 CC0 贴图 / HDRI / 模型；
> ② **方法论与技术指导可直接吸收**，无需批准 —— 官方文档结论、PBR 通道做法、结构设计参照、布光分层等；
> ③ 本节登记表里的 Poly Haven / ambientCG / Fab / SCP:SL 等条目，**当前状态一律为「方法论与设计参照」**，
>    未经逐项批准不得下载或直接采用其文件；
> ④ 本地生成仍走千问 + Blender（§11A），但生成前须按红线 12 登记公开设计参照。

### 14.5 历史反例（登记以杜绝复发）

| 事项 | 当时做法 | 违反点 |
|---|---|---|
| 室内灯光 | `map_builder.gd` 直接凭手感设 `ambient_light_energy=0.30`、`tonemap_exposure=1.15`、灯带 `emission_energy_multiplier=1.6`，无公开依据登记 | 未检索官方文档；结果与「Emission 不照亮周围」冲突，房间死黑、桌面过曝 |
| 帧率 / 分辨率 | 直接改分辨率 | 未按官方 `rendering/scaling/3d/scale` 路径，也未登记取舍依据 |
| 门框贴图 | `door_frame_albedo.jpg` 23 KB 近乎纯色，自造平涂材质 | 未先取 CC0 工业钢板材质 |
| 天花板 / 人物贴图 | 千问 prompt 无公开设计参照留痕 | 红线 12「生成前必须先取公开设计参照」未落地 |
| 发布资产打包 | `tools/publish-assets.cjs` 自行实现 tar 打包 / 注入 / 校验 | 未先比对 `actions/download-artifact`、`gh release download`、Actions cache 等现成方案 |

### 14.6 验收

- 提交信息 / `CHANGELOG.md` 必须含「公开依据：…」并指向登记表行；无依据改动按红线回退。
- `npm run agent:contract` 只锁 §一 红线，本节与 §14 不受其校验，靠评审时人工核对登记表。
- 本节为**流程规范**，不改变任何既有数值真源；涉及规则 / 数值仍以 2.5D `js/` 为准（红线 11、14）。

## 附录 B：资产层级登记表

> 2026-11-12 分类收缩：原 `docs/ASSET_LAYERS.md` 并入本附录，登记口径不变。
> 三态含义：入库（`.gitignore`）、发布（`tools/deploy-pages.cjs` 的 ENTRIES / SKIP）、磁盘留存（本表保留期）。
> 首次登记 2026-11-11；本表描述**现行状态**。3D 仓于同日通过 `baseline:sync` 同步 SKIP 修复，两仓发布白名单一致（见 §8A）。
> **2026-11-12 二次分类**：素材层拆为 `referenced/`（当前脚本 / 构建实际读取）与 `unreferenced/`（过期副本、参考图归档），另有 `release/` 放发布产物。
> 判定口径：`referenced` 只收被 `blender-ship.py` / 构建脚本按路径读取的文件；只被人类参考、或只被生成脚本写入的文件归 `unreferenced`。

| 目录 / 模式 | 层 | 入库 | 发布 | 保留期 | 再生成方式 | 备注 |
|---|---|---|---|---|---|---|
| `js/` | L0 | 是 | 是 | 永久 | 单一真源 | 游戏代码 0.63 MB |
| `audio/` | L0 | 是 | 是 | 永久 | — | 含 CREDITS 署名 |
| `assets/scene/v4/base-lit.png`、`hull-deck.png` | L0 | 是 | 是 | 永久 | `blender-ship.py` 烘焙 | 13.54 / 6.96 MB，P4 压缩目标 |
| `assets/scene/v4/tex/door-panel.png` | L0 | 是 | 是 | 永久 | — | `drawDoors` 运行时采样，唯一例外 |
| `assets/scene/v4/facility/*.png`（无后缀） | L0 | 是 | 是 | 永久 | `tools/fx-post.py` 合成 | 正式图 |
| `assets/scene/bg/`、`crew/`、`station/`、`minigame/`、`portfolio/` | L0 | 是 | 是 | 永久 | — | 运行时资源 |
| `%USERPROFILE%\Documents\returnlog_assets\referenced\qwen-lib\*.png` | L1 | 否 | 否 | 永久 | 千问出图 + `blender-ship.py` | 2026-11-12 由 2.5D `assets/qwen-lib/` 移入；脚本优先读素材层，保留仓内回退 |
| 3D 仓 `assets/qwen-lib/*.png` | — | — | — | — | — | 2026-11-12 移入素材层 `unreferenced/qwen-lib-baseline-mirror/`；仓内只留 README 与素材库清单，3D baseline 相应重建为 407 |
| `%USERPROFILE%\Documents\returnlog_assets\referenced\2.5d-preview-textures\qwen\` | L1 | 否 | 否 | 永久 | 由 `bake-qwen-room-skins.py` 生成 | 仅保留 Blender 烘焙实际读取的 `qwen/<rid>/floor.png` 与 `skin1.png`（10 舱）；其余同目录副本归 `unreferenced/` |
| `%USERPROFILE%\Documents\returnlog_assets\unreferenced\` | — | 否 | 否 | 按需 | — | 过期副本 / 参考图归档：qwen21、preview models / textures、preview audio 等；不参与构建 |
| `tools/_qwen_refs/` | L1 | 否 | 否 | 永久 | 色调对齐 bake | 62.11 MB |
| 2.5D `assets/scene/v4/tex/*`（除 `door-panel.png`） | — | — | — | — | — | 2026-11-12 移入素材层 `returnlog_assets/referenced/scene-v4-tex/`（ao-soft / floor-grate / wall-panel）；运行时只读 `door-panel.png` |
| `3d/assets/models/*.blend`、`3d/assets/export/*.glb` | L1 | 是 | 否 | 永久 | 建模导出 | Godot 资产 |
| 2.5D 仓 `3d/preview/assets/textures/` | — | — | — | — | — | 2026-11-12 已整份移入素材层 `returnlog_assets/unreferenced/textures/2.5d-preview-stale`；3D 仓同名目录仍是 Godot 运行时依赖（未引用项已移出，见下行说明） |
| 3D 仓 `3d/preview/assets/textures/` | L1 | 否 | 否 | 永久 | 由 `v4/tex` 复制 + 生成脚本 | Godot 本地依赖；2026-11-12 仅移出零引用贴图（6 张根图 + 旧 `panel/`）到 `returnlog_assets/unreferenced/textures/3d-unreferenced` |
| 2.5D 仓 `3d/preview/assets/models/` | — | — | — | — | — | 2026-11-12 已整份（1,672 文件 / 141 MB）移入素材层 `returnlog_assets/unreferenced/models/2.5d-preview-stale` |
| 2.5D 仓 `3d/preview/assets/{audio,crew,plates,import-probe}/` | — | — | — | — | — | 2026-11-12 移入素材层 `returnlog_assets/unreferenced/2.5d-preview-assets/`；`licenses/` 保留在仓内 |
| 3D 仓 `3d/preview/assets/models/` | L1 | 是 | 否 | 永久 | — | Godot 运行时依赖；836 个模型文件，无旧版命名残留 |
| `assets/scene/v4/facility/_raw/`、`_raw_fx/` | L2 | 否 | **否（P0 已排除）** | 14 天 | `blender-fx.py` → `fx-post.py` | 渲染中间帧 |
| `tools/screenshots/`、`3d/preview/screenshots/`、`3d/docs/audit/player-study-*` | L2 | 否 | 否 | 14 天 | 重跑截图脚本 | 2026-11-12 已整体移入素材层 `screenshots/{2.5d-tools,3d-preview,player-study-20261112}`；测试重跑会按需重建 |
| `%USERPROFILE%\Documents\returnlog_assets\unreferenced\qwen21\{2.5d,3d}`（cabin-refs / room-skins / surfaces / task-refs / crew-refs） | L2 | 否 | 否 | 按需 | `gen-art-refs.ps1` | 2026-11-12 两仓 `docs/qwen21/` 全部移入素材层；仓库内不再保留 |
| `tools/*-report.md`、`*-results.json`、`mc-results.json` | L2 | 否 | 否 | 14 天 | `npm run sim` / 对应审计脚本 | `.json.gz` 压缩基线属 L5，保留 |
| `_backup/YYYYMMDD_*` | L3 | 否 | 否 | 30 天 | 见 3D 仓 `3d/CHANGELOG.md` 恢复口径 | 主仓 265 MB |
| `tools/_bak/<主题>-YYYYMMDDHHMMSS/` | L3 | 否 | 否 | 30 天 | 对应工具重跑 | 主仓 186 MB |
| `*-c0/c1/c2.png` | **L0′ 运行时变体** | 是 | 否 | **永久（禁止清理）** | — | 3D 工程引用的颜色 / 状态变体；2026-11-11 误清后已还原 |
| `*.blend1` | L3 | 否 | 否 | 30 天 | Blender 自动备份 | 251 个 / 39 MB |
| `android/assets/www/` | L3 | 否 | 否 | 30 天 | `build-apk-assets.cjs` | 2026-11-12 已清（278 个 / 44.08 MB，重打包即再生） |
| `android/ReturnLog.apk` | L3 | **是（出库待裁定）** | 否 | 30 天 | `android/build.cmd` 重打包 | 43.48 MB 发版产物当前已入库；2026-11-12 建议 `.git` 瘦身时移出，未执行 |
| `tools/_crew_raw/` | L2 | 是 | 否 | 14 天 | `blender-crew.py` 重渲 | 2026-11-12 已清 300 个 / 10.54 MB |
| `tools/_hires-preview/` | L2 | 否 | 否 | 14 天 | hires 截图脚本重跑 | 2026-11-12 已清 13 个 / 1.23 MB |
| `tools/logs/` | L4 | 否 | 否 | 随时清 | 门禁 / 部署日志重跑 | 2026-11-12 已清 53 个 / 0.64 MB |
| `tools/_sfx/` | **L1** | 否 | 否 | **永久** | `master-sfx.py` 输入（CC0 原始包，许可留痕源头） | 2026-11-12 登记为保留；清理需用户单独裁定 |
| `audio/sfx-{death,submit,tick,vote}.ogg` | —（原 L0 成员） | 是 | 是 | — | 无（预录未接线，全仓零引用） | 2026-11-12 用户批准移除，见清理台账；`sfx-click.ogg` 同日接线保留 |
| `3d/preview/.godot/imported/*.ctex` | **L0′ 运行时依赖** | 否 | 否 | **禁止直接清** | 须先由 Godot 编辑器重新导入并验证 | 2026-11-11 误清事故，见规范 §8B；2026-11-12 两仓缓存已移入素材层 `caches/`，3D 项目内 `.godot` 改为目录联接（junction），运行时照常读取 |
| `docs/` 规范层 | L5 | 是 | 否 | 永久 | — | 原 R/P 目录已收口归档（2026-11-12） |
| `3d/docs/`（art / audit） | L5 | 是 | 否 | 永久 | — | 3D 专题归档；根只留核心与登记表 |
| 3D 根目录 `返航录3D_演示_68s.mp4` | L3 | 否 | 否 | 出仓保留 | `demo-video.cjs` 重录 | 2026-11-12 裁定出仓；当前仍被系统进程占用，待重启后移出 |
| `BASELINE.sha256.json`、`*.json.gz`、`.env`、`android/release.keystore` | L5 | 是 | 否 | **永久保留** | — | 凭据与基线，禁止清理 |

## 附录 B.1：新登记模板

```
| <目录或模式> | L0–L5 | 是/否 | 是/否 | 永久 / N 天 | <重生成脚本或「无」> | <来源 / 许可 / 恢复口径> |
```

登记时一并确认四处同步：两仓 `.gitignore`、两仓 `tools/deploy-pages.cjs`、`assets/MANIFEST.json`、`BASELINE.sha256.json`（见 §7）。
